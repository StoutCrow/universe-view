import { Menu, Platform } from "obsidian";
import { AddRelativesModal, relativeMenu } from "../ui/AddRelatives";
import type UniverseViewPlugin from "../main";
import type { Entity } from "../types";
import { formatDate, yearsBetween } from "../dates/parser";
import { PanZoom } from "./panzoom";
import { bindHover, clickOrDouble, icon, cssNumber, cultureColor, el, emptyState, iconButton, openEntity, resourceUrl, showEntityMenu, svg, warningItem } from "./common";
import { holdingsOf } from "../index/realms";
import { holderTitle, styleFor } from "../index/titles";
import { everyoneLayout, generationName, type FamilyGraph } from "../index/kinlayout";
import { relationship, type KinGraph } from "../index/kinship";

/** Down from a parent, along the line between the generations and down to a child, with rounded corners. */
function elbow(x1: number, y1: number, busY: number, x2: number, y2: number, style: "rounded" | "square" | "curved" = "rounded"): string {
	const dx = x2 - x1;
	if (Math.abs(dx) < 1) return `M${x1},${y1} V${y2}`;
	if (style === "curved") return `M${x1},${y1} C${x1},${(y1 + y2) / 2} ${x2},${(y1 + y2) / 2} ${x2},${y2}`;
	if (style === "square") return `M${x1},${y1} V${busY} H${x2} V${y2}`;
	const s = Math.sign(dx);
	const r = Math.max(0, Math.min(10, Math.abs(dx) / 2, busY - y1, y2 - busY));
	return `M${x1},${y1} V${busY - r} Q${x1},${busY} ${x1 + s * r},${busY} H${x2 - s * r} Q${x2},${busY} ${x2},${busY + r} V${y2}`;
}

export interface FamilyOptions {
	root?: string;
	up: number;
	down: number;
	siblings: boolean;
	/**
	 * tree: ancestors above and descendants below; everyone: the whole family around the person, by
	 * generation; fan: ancestors as a half-circle; time: descendants placed by birth year.
	 */
	layout?: "tree" | "everyone" | "fan" | "time";
	/** People whose descendants are folded away (a big house kept readable). */
	collapsed?: string[];
	/** Everyone related: how many parent or child links out from the person (99 for all). */
	steps?: number;
	/** Everyone related: follow partners' own families too. */
	inLaws?: boolean;
	/** What each person is to the one at the centre ("Grandmother", "Second cousin"), on their card. */
	relations?: boolean;
	/** How the cards look: cards (the default), compact (names only), portrait (tall, with a large avatar) or chart (formal boxes). */
	style?: "cards" | "compact" | "portrait" | "chart";
	/** How the lines between generations are drawn. */
	lines?: "rounded" | "square" | "curved";
}

export const DEFAULT_FAMILY_OPTIONS: FamilyOptions = { up: 2, down: 2, siblings: true, steps: 3, inLaws: false, relations: true };

interface DownUnit {
	key: string;
	dup: boolean;
	groups: { partner?: string; partnerDup?: boolean; kind?: string; ended?: boolean; children: DownUnit[]; adoptive: Set<string> }[];
}

interface UpNode {
	key: string;
	dup: boolean;
	parents: UpNode[];
	adoptive: boolean;
}

interface CardNode {
	id: number;
	key: string;
	x: number;
	y: number;
	dup: boolean;
	root: boolean;
}

/** A kind word as shown on a couple's line: "ex" → "Ex". */
const kindWord = (k: string) => k.charAt(0).toUpperCase() + k.slice(1).replace(/-/g, " ");

interface Family {
	parents: number[];
	children: number[];
	adoptive: Set<number>;
	kind?: string;
	ended?: boolean;
	/** Custom text for the tie, and how it ended. */
	label?: string;
	reason?: string;
}

/**
 * Root-centred family tree: ancestors above, descendants (with all partners) below,
 * siblings beside the root. People who appear twice (pedigree collapse, cousin marriage)
 * get a dashed duplicate card instead of breaking the layout.
 */
export class FamilyTreeRenderer {
	private root: HTMLElement;
	private svgEl: SVGSVGElement;
	private layer: SVGGElement;
	private pz: PanZoom;
	private nodes: CardNode[] = [];
	private families: Family[] = [];
	private visited = new Set<string>();
	private W = 180;
	private H = 64;
	private HG = 28;
	private PG = 18;
	private VG = 64;
	onRecenter?: (key: string) => void;

	constructor(
		private container: HTMLElement,
		private plugin: UniverseViewPlugin,
		public options: FamilyOptions,
		private embedded = false,
		private hoverParent: { hoverPopover: unknown } | HTMLElement = container,
	) {
		this.root = el("div", { cls: "universeview-family" + (embedded ? " is-embedded" : "") }, container);
		this.svgEl = svg("svg", { class: "universeview-canvas" }, this.root);
		this.layer = svg("g", {}, this.svgEl);
		// The lines are SVG; the cards are HTML laid over them and moved with them. (HTML inside the SVG,
		// a foreignObject, is drawn in the wrong place by Safari's engine once the tree is panned or zoomed.)
		this.cardBox = el("div", { cls: "universeview-family-html" }, this.root);
		this.pz = new PanZoom(this.svgEl, this.layer, {
			requireModifier: embedded,
			minScale: 0.15,
			maxScale: 2.5,
			surface: this.root,
			// The SVG fills the tree's box from its corner, so the cards share its origin.
			onChange: (t) => (this.cardBox.style.transform = `translate(${t.x}px, ${t.y}px) scale(${t.k})`),
		});
		this.root.toggleClass("is-touch", Platform.isMobile);
		// Arrow keys walk from card to card, Enter centres the tree on the one marked, Esc lets go.
		if (!embedded) {
			this.root.tabIndex = 0;
			this.root.setAttribute("aria-label", "Family tree: arrow keys move between people, Enter centres the tree on one");
			this.root.addEventListener("keydown", (evt) => this.onKey(evt));
		}
		if (embedded) {
			const box = el("div", { cls: "universeview-embed-controls" }, this.root);
			iconButton(box, "zoom-in", "Zoom in", () => this.pz.zoomBy(1.3));
			iconButton(box, "zoom-out", "Zoom out", () => this.pz.zoomBy(1 / 1.3));
			iconButton(box, "maximize", "Fit", () => this.fit());
		}
		this.refresh();
		this.resizeObs = new ResizeObserver(() => {
			if (!this.pz.touched && this.nodes.length) this.initialView();
		});
		this.resizeObs.observe(this.root);
	}

	private resizeObs: ResizeObserver;
	private cardBox: HTMLElement;
	/** Each card by node id. */
	private cardEls: HTMLElement[] = [];
	/** Each person's card holder, for tracing the line to someone. */
	private slotsByKey = new Map<string, HTMLElement[]>();
	/** Everyone related was cut short at its limit. */
	private truncated = false;

	destroy() {
		this.resizeObs.disconnect();
		this.pz.destroy();
		this.root.remove();
	}

	fit() {
		const b = this.bounds();
		if (b) this.pz.fit(b, 30, 1);
	}

	zoomBy(f: number) {
		this.pz.zoomBy(f);
	}

	refresh() {
		// The card style sets the size of the cards, so its class goes on before the size is read.
		for (const s of ["cards", "compact", "portrait", "chart"]) this.root.toggleClass(`uv-fam-${s}`, (this.options.style ?? "cards") === s);
		this.W = cssNumber(this.root, "--universeview-card-width", 180);
		this.H = cssNumber(this.root, "--universeview-card-height", 64);
		const clear = () => {
			this.layer.replaceChildren();
			this.cardBox.replaceChildren();
			this.cardEls = [];
			this.slotsByKey.clear();
			this.root.querySelector(".universeview-empty")?.remove();
			this.root.querySelector(".uv-family-note")?.remove();
		};
		const idx = this.plugin.index;
		const rootKey = this.options.root;
		const rootEntity = idx.get(rootKey);
		if (!rootKey || !rootEntity || rootEntity.type !== "person") {
			clear();
			this.drawnSig = undefined;
			this.svgEl.addClass("is-hidden");
			const people = idx.all("person");
			emptyState(
				this.root,
				"git-fork",
				people.length ? "Choose a person" : "No people yet",
				people.length
					? this.embedded
						? "Add `root: Person name` to this code block."
						: "Pick someone in the toolbar, or open a person note and use “Show family tree”."
					: "Add `type: person` and `parents:` links to your notes to build a family tree.",
				this.embedded ? undefined : { label: "New person", onClick: () => this.plugin.createEntityPrompt({ type: "person" }) },
			);
			return;
		}
		this.svgEl.removeClass("is-hidden");
		const newRoot = rootKey !== this.drawnRoot;
		this.drawnRoot = rootKey;
		this.truncated = false;
		if (this.options.layout === "everyone") this.layoutEveryone(rootKey);
		else this.layout(rootKey);
		// An edit elsewhere in the vault that changes nobody here: keep the cards as they are, portraits
		// and all, rather than drawing the same tree again.
		const sig = JSON.stringify([this.W, this.H, this.options, this.truncated, this.nodes.map((n) => [n.key, n.x, n.y, idx.get(n.key)?.props]), this.families.map((f) => [f.parents, f.children, [...f.adoptive]])]);
		if (sig === this.drawnSig) return;
		this.drawnSig = sig;
		clear();
		this.draw();
		if (this.truncated) el("div", { cls: "uv-family-note", text: `The first ${this.nodes.length} people: fewer steps shows the rest of this family more closely.` }, this.root);
		// Re-centre for a new person; on note edits keep wherever the user has panned to.
		if (newRoot) this.pz.touched = false;
		if (!this.pz.touched) window.requestAnimationFrame(() => this.initialView());
	}

	private drawnRoot?: string;
	/** What the cards on screen were drawn from: the same again needs no redraw. */
	private drawnSig?: string;

	private initialView() {
		const r = this.nodes.find((n) => n.root);
		const b = this.bounds();
		const rect = this.svgEl.getBoundingClientRect();
		if (!rect.width || !rect.height) return;
		if (b && r && (b.width * 0.9 > rect.width || b.height * 0.9 > rect.height)) {
			// Large trees: keep the root readable instead of shrinking everything.
			this.pz.k = Math.max(0.6, Math.min(1, (rect.width - 60) / b.width));
			this.pz.centerOn(r.x + this.W / 2, r.y + this.H / 2);
		} else this.fit();
	}

	// ---- Building the structure ----------------------------------------------------------------

	private otherParent(child: string, parent: string): string | undefined {
		const c = this.plugin.index.get(child);
		// A relative with no note has the parents their family lines give.
		if (!c) return this.plugin.index.parentsOf(child).find((p) => p.key !== parent)?.key;
		return [...c.parents, ...c.adoptiveParents].find((p) => p.key !== parent)?.key;
	}

	private birth(key: string): number {
		return this.plugin.index.get(key)?.start?.start ?? Number.MAX_SAFE_INTEGER;
	}

	private buildDown(key: string, depth: number, onlyPartner?: string, childFilter?: (k: string) => boolean, childDepth?: (k: string) => number): DownUnit {
		const idx = this.plugin.index;
		if (this.visited.has(key)) return { key, dup: true, groups: [] };
		this.visited.add(key);
		const unit: DownUnit = { key, dup: false, groups: [] };
		const partners = idx.partners(key).filter((p) => !onlyPartner || p.ref.key === onlyPartner);
		const groupFor = new Map<string, DownUnit["groups"][number]>();
		for (const p of partners) {
			if (groupFor.has(p.ref.key)) continue;
			const dup = this.visited.has(p.ref.key);
			this.visited.add(p.ref.key);
			const g = { partner: p.ref.key, partnerDup: dup, kind: p.kind, ended: !!p.to, children: [], adoptive: new Set<string>() };
			groupFor.set(p.ref.key, g);
			unit.groups.push(g);
		}
		if (onlyPartner && !groupFor.has(onlyPartner)) {
			const g = { partner: onlyPartner, partnerDup: this.visited.has(onlyPartner), kind: "co-parent", ended: false, children: [], adoptive: new Set<string>() };
			this.visited.add(onlyPartner);
			groupFor.set(onlyPartner, g);
			unit.groups.push(g);
		}
		// A folded branch keeps its partners but not its children (the root's own are always shown).
		const folded = key !== this.options.root && !!this.options.collapsed?.includes(key);
		if (folded && !onlyPartner) {
			// Folded, they still stand beside the partners they had children with.
			for (const kid of idx.children(key)) {
				const other = this.otherParent(kid, key);
				if (!other || groupFor.has(other)) continue;
				const g = { partner: other, partnerDup: this.visited.has(other), kind: "co-parent", ended: false, children: [], adoptive: new Set<string>() };
				this.visited.add(other);
				groupFor.set(other, g);
				unit.groups.push(g);
			}
		}
		if (depth > 0 && !folded) {
			const adoptive = new Set(idx.adoptiveChildrenOf.get(key) ?? []);
			const kids = idx.children(key).filter((k) => !childFilter || childFilter(k)).sort((a, b) => this.birth(a) - this.birth(b));
			let solo: DownUnit["groups"][number] | undefined;
			// Build the root's own branch first so its partners and children aren't marked as duplicates
			// of a sibling's (e.g. a widow who remarried her late husband's brother).
			const root = this.options.root;
			const built = new Map<string, DownUnit>();
			for (const kid of [...kids].sort((a, b) => Number(b === root) - Number(a === root))) {
				built.set(kid, this.buildDown(kid, childDepth ? childDepth(kid) : depth - 1));
			}
			for (const kid of kids) {
				const other = this.otherParent(kid, key);
				let g = other ? groupFor.get(other) : undefined;
				if (!g && other && !onlyPartner) {
					g = { partner: other, partnerDup: this.visited.has(other), kind: "co-parent", ended: false, children: [], adoptive: new Set() };
					this.visited.add(other);
					groupFor.set(other, g);
					unit.groups.push(g);
				}
				if (!g) {
					if (!solo) unit.groups.push((solo = { children: [], adoptive: new Set() }));
					g = solo;
				}
				if (adoptive.has(kid)) g.adoptive.add(kid);
				g.children.push(built.get(kid)!);
			}
		}
		return unit;
	}

	private buildUp(key: string, depth: number, adoptive = false, start = false): UpNode {
		// The starting person is already on screen (placed by the descendant pass), so it is not a duplicate.
		const dup = !start && this.visited.has(key);
		this.visited.add(key);
		const node: UpNode = { key, dup, parents: [], adoptive };
		if (dup || depth <= 0) return node;
		const e = this.plugin.index.get(key);
		if (!e) {
			for (const p of this.plugin.index.parentsOf(key).slice(0, 2)) node.parents.push(this.buildUp(p.key, depth - 1));
			return node;
		}
		for (const p of e.parents.slice(0, 2)) node.parents.push(this.buildUp(p.key, depth - 1));
		if (!node.parents.length) for (const p of e.adoptiveParents.slice(0, 2)) node.parents.push(this.buildUp(p.key, depth - 1, true));
		return node;
	}

	// ---- Positioning --------------------------------------------------------------------------

	private downWidth(u: DownUnit): number {
		const block = this.blockWidth(u);
		const kids = this.childrenWidth(u);
		return Math.max(block, kids);
	}

	private blockWidth(u: DownUnit): number {
		const partners = u.groups.filter((g) => g.partner).length;
		return this.W * (1 + partners) + this.PG * partners;
	}

	private childrenWidth(u: DownUnit): number {
		const groups = u.groups.filter((g) => g.children.length);
		if (!groups.length) return 0;
		let w = 0;
		for (const g of groups) w += g.children.reduce((s, c) => s + this.downWidth(c), 0) + this.HG * (g.children.length - 1);
		return w + this.HG * 1.5 * (groups.length - 1);
	}

	private addNode(key: string, x: number, y: number, dup: boolean): CardNode {
		const n: CardNode = { id: this.nodes.length, key, x, y, dup, root: key === this.options.root && !dup };
		this.nodes.push(n);
		return n;
	}

	private rowY(gen: number): number {
		return gen * (this.H + this.VG);
	}

	/** Places a descendant unit; returns the node of the unit's main person. */
	private placeDown(u: DownUnit, left: number, gen: number): CardNode {
		const width = this.downWidth(u);
		const block = this.blockWidth(u);
		const bx = left + (width - block) / 2;
		const self = this.addNode(u.key, bx, this.rowY(gen), u.dup);
		let px = bx + this.W + this.PG;
		const partnerNodes = new Map<string, CardNode>();
		for (const g of u.groups) {
			if (!g.partner) continue;
			partnerNodes.set(g.partner, this.addNode(g.partner, px, this.rowY(gen), !!g.partnerDup));
			px += this.W + this.PG;
		}
		const groups = u.groups.filter((g) => g.children.length);
		const kidsW = this.childrenWidth(u);
		let cx = left + (width - kidsW) / 2;
		for (const g of u.groups) {
			const partnerNode = g.partner ? partnerNodes.get(g.partner) : undefined;
			const fam: Family = {
				parents: partnerNode ? [self.id, partnerNode.id] : [self.id],
				children: [],
				adoptive: new Set(),
				kind: g.kind,
				ended: g.ended,
			};
			if (g.children.length) {
				for (const c of g.children) {
					const cn = this.placeDown(c, cx, gen + 1);
					fam.children.push(cn.id);
					if (g.adoptive.has(c.key)) fam.adoptive.add(cn.id);
					cx += this.downWidth(c) + this.HG;
				}
				cx += this.HG * 0.5;
			}
			if (fam.parents.length > 1 || fam.children.length) this.families.push(fam);
		}
		void groups;
		return self;
	}

	private upWidth(n: UpNode): number {
		if (!n.parents.length) return this.W;
		const parentsW = n.parents.reduce((s, p) => s + this.upWidth(p), 0) + this.PG * (n.parents.length - 1);
		return Math.max(this.W, parentsW);
	}

	/** Places the parents of `child` (and their ancestors) centred above it. */
	private placeUp(n: UpNode, child: CardNode, gen: number, centerX: number) {
		if (!n.parents.length) return;
		const widths = n.parents.map((p) => this.upWidth(p));
		const total = widths.reduce((a, b) => a + b, 0) + this.PG * (n.parents.length - 1);
		let left = centerX - total / 2;
		const fam: Family = { parents: [], children: [child.id], adoptive: new Set() };
		if (n.parents.some((p) => p.adoptive)) fam.adoptive.add(child.id);
		n.parents.forEach((p, i) => {
			const pc = left + widths[i] / 2;
			// Inner parents hug the centre so the couple stays visually together.
			const x = n.parents.length === 2 ? (i === 0 ? left + widths[i] - this.W : left) : pc - this.W / 2;
			const node = this.addNode(p.key, x, this.rowY(gen - 1), p.dup);
			fam.parents.push(node.id);
			this.placeUp(p, node, gen - 1, x + this.W / 2);
			left += widths[i] + this.PG;
		});
		this.families.push(fam);
	}

	private layout(rootKey: string) {
		const idx = this.plugin.index;
		const { up, down, siblings } = this.options;
		this.nodes = [];
		this.families = [];
		this.visited = new Set();
		const root = idx.get(rootKey)!;
		const parents = [...root.parents, ...(root.parents.length ? [] : root.adoptiveParents)].slice(0, 2);

		if (siblings && parents.length && up > 0) {
			const [p1, p2] = parents;
			// Siblings are shown, but only the root's own branch continues downwards.
			const unit = this.buildDown(
				p1.key,
				down + 1,
				p2?.key,
				(k) => !p2 || this.otherParent(k, p1.key) === p2.key || k === rootKey,
				(k) => (k === rootKey ? down : 0),
			);
			const top = this.placeDown(unit, 0, -1);
			const topNodes = [top, ...this.nodes.filter((n) => n.y === top.y && n.id !== top.id && n.key === p2?.key)];
			const ups = topNodes.filter((n) => !n.dup).map((n) => ({ node: n, tree: this.buildUp(n.key, up - 1, false, true) }));
			if (ups.length === 2) {
				const mid = (ups[0].node.x + this.W + ups[1].node.x) / 2;
				const w0 = this.upWidth(ups[0].tree);
				const w1 = this.upWidth(ups[1].tree);
				const c0 = Math.min(ups[0].node.x + this.W / 2, mid - this.PG / 2 - w0 / 2);
				const c1 = Math.max(ups[1].node.x + this.W / 2, mid + this.PG / 2 + w1 / 2);
				this.placeUp(ups[0].tree, ups[0].node, -1, c0);
				this.placeUp(ups[1].tree, ups[1].node, -1, c1);
			} else if (ups.length === 1) {
				this.placeUp(ups[0].tree, ups[0].node, -1, ups[0].node.x + this.W / 2);
			}
		} else {
			const unit = this.buildDown(rootKey, down);
			const rootNode = this.placeDown(unit, 0, 0);
			const tree = this.buildUp(rootKey, up, false, true);
			this.placeUp(tree, rootNode, 0, rootNode.x + this.W / 2);
		}
	}

	/** Everyone related: the whole family around the person, a row per generation (see kinlayout.ts). */
	private layoutEveryone(rootKey: string) {
		const idx = this.plugin.index;
		this.nodes = [];
		this.families = [];
		const parentsOf = (k: string) => {
			const e = idx.get(k);
			return e ? [...e.parents, ...e.adoptiveParents].map((r) => r.key) : idx.parentsOf(k).map((r) => r.key);
		};
		const graph: FamilyGraph = {
			parents: parentsOf,
			children: (k) => idx.children(k),
			partners: (k) => idx.partners(k).map((p) => p.ref.key),
			born: (k) => idx.get(k)?.start?.start,
		};
		const laid = everyoneLayout(graph, rootKey, { steps: this.options.steps ?? 3, inLaws: !!this.options.inLaws }, { w: this.W, partnerGap: this.PG, gap: this.HG });
		this.truncated = laid.truncated;
		const id = new Map<string, number>();
		for (const p of laid.people) id.set(p.key, this.addNode(p.key, p.x, this.rowY(p.gen), false).id);
		const tie = (a: string, b: string) => idx.partners(a).find((p) => p.ref.key === b);
		for (const f of laid.families) {
			const t = f.parents.length === 2 ? tie(f.parents[0], f.parents[1]) : undefined;
			const adoptive = new Set<number>();
			for (const c of f.children) if (idx.get(c)?.adoptiveParents.some((r) => f.parents.includes(r.key))) adoptive.add(id.get(c)!);
			this.families.push({ parents: f.parents.map((k) => id.get(k)!), children: f.children.map((k) => id.get(k)!), adoptive, kind: t?.kind, ended: !!t?.to, label: t?.label, reason: t?.reason });
		}
		for (const [a, b] of laid.couples) {
			const t = tie(a, b);
			this.families.push({ parents: [id.get(a)!, id.get(b)!], children: [], adoptive: new Set(), kind: t?.kind, ended: !!t?.to, label: t?.label, reason: t?.reason });
		}
	}

	private bounds() {
		if (!this.nodes.length) return null;
		let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
		for (const n of this.nodes) {
			x0 = Math.min(x0, n.x);
			y0 = Math.min(y0, n.y);
			x1 = Math.max(x1, n.x + this.W);
			y1 = Math.max(y1, n.y + this.H);
		}
		return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
	}

	// ---- Drawing ---------------------------------------------------------------------------------

	private draw() {
		this.drawGenerations();
		const edges = svg("g", { class: "universeview-family-edges" }, this.layer);
		const cards = svg("g", { class: "universeview-family-cards" }, this.layer);
		const byId = (id: number) => this.nodes[id];
		const { W, H, VG } = this;

		for (const f of this.families) {
			const ps = f.parents.map(byId).sort((a, b) => a.x - b.x);
			const cs = f.children.map(byId);
			const dashedCouple = f.ended || f.kind === "co-parent" || /divorc|separat|affair|betroth|engag/i.test(f.kind ?? "");
			let ox: number;
			let oy: number;
			if (ps.length === 2) {
				const [a, b] = ps;
				const y = a.y + H / 2;
				const sameRow = Math.abs(a.y - b.y) < 1;
				if (sameRow) {
					svg("path", { d: `M${a.x + W},${y} H${b.x}`, class: "universeview-edge is-partner" + (dashedCouple ? " is-dashed" : "") }, edges);
					// A ring where the couple meet: filled while together, hollow once it ended.
					svg("circle", { cx: (a.x + W + b.x) / 2, cy: y, r: 4.5, class: "uv-couple-ring" + (dashedCouple ? " is-ended" : "") }, edges);
					const plainKind = !f.kind || ["co-parent", "marriage", "married", "spouse"].includes(f.kind.toLowerCase());
						// The custom text if there is one, else the kind when it is more than an ordinary marriage; the reason it ended goes in the tooltip.
						if ((f.label || !plainKind) && b.x - (a.x + W) > 30) {
						const t = svg("text", { x: (a.x + W + b.x) / 2, y: y - 9, class: "universeview-edge-label", "text-anchor": "middle" }, edges);
						t.textContent = f.label ?? kindWord(f.kind ?? "");
							if (f.reason) svg("title", {}, t).textContent = f.reason;
					}
					ox = (a.x + W + b.x) / 2;
					oy = y + 4.5;
				} else {
					ox = a.x + W / 2;
					oy = a.y + H;
				}
			} else {
				ox = ps[0].x + W / 2;
				oy = ps[0].y + H;
			}
			if (!cs.length) continue;
			const childTop = Math.min(...cs.map((c) => c.y));
			const busY = childTop - VG / 2;
			// One rounded line from the parents to each child: down, along and down again.
			for (const c of cs) {
				svg("path", { d: elbow(ox, oy, busY, c.x + W / 2, c.y, this.options.lines ?? "rounded"), class: "universeview-edge" + (f.adoptive.has(c.id) ? " is-dashed" : "") }, edges);
			}
		}

		for (const n of this.nodes) this.drawCard(cards, n);
	}

	/** A soft band behind each generation, named from the centre's point of view ("Grandparents"). */
	private drawGenerations() {
		const b = this.bounds();
		if (!b || this.embedded) return;
		const bands = svg("g", { class: "uv-gen-bands" }, this.layer);
		const rows = [...new Set(this.nodes.map((n) => n.y))].sort((a, c) => a - c);
		const rootName = this.plugin.index.get(this.options.root)?.name ?? "";
		const step = this.H + this.VG;
		for (const y of rows) {
			const gen = Math.round(y / step);
			svg("rect", { x: b.x - 40, y: y - this.VG / 2 + 6, width: b.width + 80, height: step - 12, rx: 6, class: "uv-gen-band" + (gen === 0 ? " is-root" : Math.abs(gen) % 2 ? " is-odd" : "") }, bands);
			const t = svg("text", { x: b.x - 28, y: y - this.VG / 2 + 22, class: "uv-gen-label" }, bands);
			t.textContent = generationName(gen, rootName);
		}
	}

	private drawCard(parent: SVGGElement, n: CardNode) {
		const idx = this.plugin.index;
		const e = idx.get(n.key);
		const card = el("div", { cls: "universeview-card" });
		// The card's place in the drawing (so the tree's size and exports still see it), then the card over it.
		svg("rect", { x: n.x, y: n.y, width: this.W, height: this.H, class: "uv-card-slot" }, parent);
		const slot = el("div", { cls: "uv-card-html" + (n.root ? " is-root" : "") }, this.cardBox);
		Object.assign(slot.style, { left: `${n.x}px`, top: `${n.y}px`, width: `${this.W}px`, height: `${this.H}px` });
		slot.appendChild(card);
		this.cardEls[n.id] = card;
		if (!this.slotsByKey.has(n.key)) this.slotsByKey.set(n.key, []);
		this.slotsByKey.get(n.key)!.push(slot);
		if (n.key === this.kbKey) slot.addClass("is-kb");
		// What they are to the person at the centre, as a tag on the card's top edge.
		const rel = e && !n.root && this.options.relations !== false ? relationship(this.kin(), this.options.root!, n.key) : null;
		if (rel) el("span", { cls: "uv-card-rel" + (rel.blood ? "" : " is-marriage"), text: rel.label.charAt(0).toUpperCase() + rel.label.slice(1) }, slot);
		// Hovering someone traces how they're related: the people between them and the centre stay bright.
		if (rel && !Platform.isMobile) {
			slot.addEventListener("mouseenter", () => this.trace(rel.path));
			slot.addEventListener("mouseleave", () => this.trace(null));
		}
		if (e) card.dataset.key = e.key;
		if (n.root) card.addClass("is-root");
		if (n.dup) card.addClass("is-dup");
		if (!e) card.addClass("is-ghost");
		const ghost = !e ? idx.ghostPerson(n.key) : undefined;
		if (e?.gender) card.addClass(`gender-${e.gender}`);
		else if (ghost?.gender) card.addClass(ghost.gender === "female" ? "gender-f" : "gender-m");
		if (e?.end) card.addClass("is-deceased");
		const name = e?.name ?? idx.ghostName(n.key) ?? (n.key.startsWith("?") ? n.key.slice(1) : n.key);
		const accent = e?.color ?? (e?.cultures[0] ? cultureColor(this.plugin, e.cultures[0].ref.key) : undefined);
		if (accent) card.style.setProperty("--card-accent", accent);

		const avatar = el("div", { cls: "universeview-card-avatar" }, card);
		const img = resourceUrl(this.plugin, e?.image);
		if (img) {
			const im = el("img", {}, avatar);
			im.src = img;
			im.draggable = false;
		} else {
			avatar.setText(initials(name));
		}
		const body = el("div", { cls: "universeview-card-body" }, card);
		el("div", { cls: "universeview-card-name", text: e || idx.ghostName(n.key) ? name : titleCase(name) }, body);
		const sub = el("div", { cls: "universeview-card-sub" }, body);
		if (e) {
			sub.setText(lifeText(this.plugin, e));
			// What they hold (a crown and the highest titles), else their house or group.
			const tree = this.plugin.realms();
			const titles = holdingsOf(tree, e.key)
				.map((k) => ({ k, rank: tree.nodes.get(k)?.rank ?? 9 }))
				.sort((a, b) => a.rank - b.rank)
				.map((t) => idx.get(t.k)?.name)
				.filter((x): x is string => !!x);
			if (titles.length) {
					// "King of England", from the highest ruled land they hold and the world's setting; the address (Her Majesty) is the hover.
					const setting = this.plugin.settings.worldSetting;
					const gender = e.gender === "f" ? "female" : e.gender === "m" ? "male" : undefined;
					const ruled = holdingsOf(tree, e.key).flatMap((k) => {
						const node = tree.nodes.get(k);
						const name = idx.get(k)?.name;
						return node && name && node.nature !== "region" && node.rank < 9 ? [{ tier: node.rank, name }] : [];
					});
					const lead = holderTitle(setting, ruled, gender);
					const address = ruled.length ? styleFor(setting, Math.min(...ruled.map((r) => r.tier)), gender) : "";
					const meta = el("div", { cls: "universeview-card-meta is-titles", title: [address, titles.join(", ")].filter(Boolean).join(" · ") }, body);
					icon(el("span", { cls: "universeview-card-crown" }, meta), "crown");
					el("span", { text: lead ? lead + (titles.length > 1 ? ` +${titles.length - 1}` : "") : titles.slice(0, 2).join(", ") + (titles.length > 2 ? ` +${titles.length - 2}` : "") }, meta);
			} else {
				const culture = e.cultures[0]?.ref.name;
				if (culture) el("div", { cls: "universeview-card-meta", text: culture }, body);
			}
		} else {
			// What the family line says (dates, custom text), else that there is no note yet.
			sub.setText([ghost?.span, ghost?.label].filter(Boolean).join(" · ") || "Not created yet");
			if (ghost?.span || ghost?.label) card.setAttribute("title", "Not created yet");
		}
		if (n.dup) {
			const badge = el("div", { cls: "universeview-card-badge", title: "Appears elsewhere in this tree" }, card);
			icon(badge, "copy");
		}
		// A fold toggle on anyone below the root with children: their branch folds into a count.
		const kids = e && !n.dup && n.key !== this.options.root ? idx.children(n.key).length : 0;
		if (kids && !this.embedded) {
			const folded = !!this.options.collapsed?.includes(n.key);
			const t = el("button", { cls: "universeview-card-fold" + (folded ? " is-folded" : ""), attr: { "aria-label": folded ? `Show ${kids} child${kids === 1 ? "" : "ren"}` : "Fold this branch" } }, card);
			if (folded) el("span", { text: `+${kids}` }, t);
			icon(el("span", {}, t), folded ? "chevron-down" : "chevron-up");
			t.addEventListener("click", (evt) => {
				evt.stopPropagation();
				this.toggleFold(n.key);
			});
			t.addEventListener("dblclick", (evt) => evt.stopPropagation());
		}
		card.setAttribute("aria-label", e ? `${name}\nDouble-click to centre the tree here` : `${name} has no note yet. Click for what you can do.`);

		clickOrDouble(
			card,
			(evt) => {
				// A relative with no note: the click opens what can be done with them (it used to start a new note at once).
				if (!e) this.ghostMenu(n.key, name, evt);
				else openEntity(this.plugin, n.key, evt);
			},
			() => e && this.recenter(n.key),
			() => this.pz.justPanned,
		);
		card.addEventListener("contextmenu", (evt) => {
			evt.preventDefault();
			if (!e) {
				this.ghostMenu(n.key, name, evt);
				return;
			}
			showEntityMenu(this.plugin, n.key, evt, {
				extra: (menu) => {
					// This tree: where it is centred, what is folded.
					if (n.key !== this.options.root) menu.addItem((i) => i.setTitle("Centre tree here").setIcon("locate-fixed").onClick(() => this.recenter(n.key)));
					if (kids) menu.addItem((i) => i.setTitle(this.options.collapsed?.includes(n.key) ? "Unfold this branch" : "Fold this branch").setIcon("fold-vertical").onClick(() => this.toggleFold(n.key)));
					// Who they are related to: add by name (no notes), or start a note.
					menu.addSeparator();
					relativeMenu(menu, this.plugin, e);
				},
			});
		});
		// Hover handles to add a parent, child or partner right on the card (by name, no notes), for relatives with no note too.
		if (!this.embedded && !Platform.isMobile) {
			const adds = el("div", { cls: "uv-card-adds" }, slot);
			const target = e ?? { key: n.key, name };
			for (const [kind, where, label] of [["parents", "is-up", "Add a parent"], ["children", "is-down", "Add a child"], ["partners", "is-side", "Add a partner"]] as const) {
				const b = el("button", { cls: `uv-card-add ${where}`, attr: { "aria-label": `${label} by name` } }, adds);
				icon(b, "plus");
				b.addEventListener("click", (evt) => {
					evt.stopPropagation();
					new AddRelativesModal(this.plugin, target, kind).open();
				});
				b.addEventListener("dblclick", (evt) => evt.stopPropagation());
			}
		}		if (e) bindHover(this.plugin, card, n.key, this.hoverParent);
	}

	/** What can be done with a relative who has no note: add their relatives, or write them up. */
	private ghostMenu(key: string, name: string, evt: MouseEvent) {
		const menu = new Menu();
		menu.addItem((i) => {
			i.setTitle(`${name} · not created yet`).setIcon("user-round").setDisabled(true);
			(i as unknown as { setIsLabel?: (v: boolean) => void }).setIsLabel?.(true);
		});
		relativeMenu(menu, this.plugin, { key, name });
		menu.addSeparator();
		menu.addItem((i) => i.setTitle("Write up as a note…").setIcon("file-plus").onClick(() => this.plugin.createEntityPrompt({ type: "person", name: titleCase(name) })));
		// Removing comes last, set apart, in red.
		menu.addSeparator();
		warningItem(menu, "Forget this relative", "trash-2", () => this.plugin.forgetRelative(key, name));
		menu.showAtMouseEvent(evt);
	}

	/** The person the keyboard has landed on. */
	private kbKey?: string;

	private onKey(evt: KeyboardEvent) {
		if (evt.ctrlKey || evt.metaKey || evt.altKey || (evt.target as Element)?.closest?.("input, textarea")) return;
		const here = this.kbKey ?? this.options.root;
		const cur = this.nodes.find((n) => n.key === here) ?? this.nodes[0];
		if (!cur) return;
		if (evt.key === "Escape") {
			this.markKey(undefined);
			return;
		}
		if (evt.key === "Enter") {
			evt.preventDefault();
			if (this.plugin.index.get(cur.key) && cur.key !== this.options.root) this.recenter(cur.key);
			return;
		}
		const dir = ({ ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] } as Record<string, [number, number]>)[evt.key];
		if (!dir) return;
		evt.preventDefault();
		// The nearest card that way: distance along the arrow, and twice the distance off it.
		let best: CardNode | undefined;
		let score = Infinity;
		for (const n of this.nodes) {
			if (n.id === cur.id || n.key === cur.key) continue;
			const dx = n.x - cur.x;
			const dy = n.y - cur.y;
			const along = dx * dir[0] + dy * dir[1];
			if (along <= 1) continue;
			const s = along + 2 * Math.abs(dx * dir[1] - dy * dir[0]);
			if (s < score) [best, score] = [n, s];
		}
		if (best) this.markKey(best.key, true);
	}

	/** Marks a card as the keyboard's, and pans to it if it is out of view. */
	private markKey(key: string | undefined, reveal = false) {
		this.kbKey = key;
		this.root.querySelectorAll(".uv-card-html.is-kb").forEach((s) => s.removeClass("is-kb"));
		if (!key) return;
		for (const s of this.slotsByKey.get(key) ?? []) s.addClass("is-kb");
		const n = this.nodes.find((x) => x.key === key);
		const slot = this.slotsByKey.get(key)?.[0];
		if (!reveal || !n || !slot) return;
		const box = this.root.getBoundingClientRect();
		const r = slot.getBoundingClientRect();
		if (r.left < box.left + 20 || r.right > box.right - 20 || r.top < box.top + 20 || r.bottom > box.bottom - 20) this.pz.centerOn(n.x + this.W / 2, n.y + this.H / 2);
	}

	private kinCache?: KinGraph;

	/** Parents, partners and genders, for working out what each person is to the centre. */
	private kin(): KinGraph {
		const idx = this.plugin.index;
		return (this.kinCache ??= {
			parents: (k) => idx.parentsOf(k).map((r) => r.key),
			partners: (k) => idx.partners(k).map((p) => p.ref.key),
			gender: (k) => {
				const g = idx.get(k)?.gender ?? "";
				return /^m/i.test(g) ? "m" : /^f/i.test(g) ? "f" : undefined;
			},
		});
	}

	/** Brightens the people on a line of kinship (and dims the rest); null clears it. */
	private trace(path: string[] | null) {
		this.root.toggleClass("is-tracing", !!path);
		this.cardBox.querySelectorAll(".is-on-path").forEach((s) => s.removeClass("is-on-path"));
		for (const k of path ?? []) for (const s of this.slotsByKey.get(k) ?? []) s.addClass("is-on-path");
	}

	/** Called when the folded branches change, so the view can remember them. */
	onFold?: () => void;

	private toggleFold(key: string) {
		const set = new Set(this.options.collapsed ?? []);
		if (set.has(key)) set.delete(key);
		else set.add(key);
		this.options.collapsed = [...set];
		// Keep the tree where it is: a fold shouldn't throw the view back to the start.
		this.pz.touched = true;
		this.refresh();
		this.onFold?.();
	}

	/** Pans to someone's card and makes it pulse; false when they aren't in the tree as drawn. */
	findInTree(key: string): boolean {
		const n = this.nodes.find((x) => x.key === key && !x.dup) ?? this.nodes.find((x) => x.key === key);
		if (!n) return false;
		this.pz.centerOn(n.x + this.W / 2, n.y + this.H / 2);
		const card = this.cardEls[n.id];
		card?.removeClass("is-found");
		void (card as HTMLElement | undefined)?.offsetWidth;
		card?.addClass("is-found");
		return true;
	}

	private recenter(key: string) {
		this.options.root = key;
		if (this.onRecenter) this.onRecenter(key);
		else this.refresh();
	}
}

export function lifeText(plugin: UniverseViewPlugin, e: Entity): string {
	const cal = plugin.calendars.get(e.calendar);
	// Cards only have room for years: "1491 – 1547 · 55".
	const year = (d: Entity["start"]) => {
		if (!d) return "";
		const y = cal.formatYear(cal.fromDays(d.start).y);
		return d.qualifier ? `${d.qualifier === "before" ? "bef." : "aft."} ${y}` : d.approx ? `c. ${y}` : y;
	};
	const b = year(e.start);
	const d = year(e.end);
	let text = b && d ? `${b} – ${d}` : b ? `b. ${e.start ? formatDate(e.start, cal) : b}` : d ? `d. ${d}` : "";
	if (e.start && e.end && e.start.precision !== "range" && e.end.precision !== "range") {
		const age = yearsBetween(e.start.start, e.end.start, cal);
		if (age >= 0) text += ` · ${e.start.approx || e.end.approx ? "~" : ""}${age}`;
	}
	return text;
}

function initials(name: string): string {
	const parts = name.replace(/\(.*?\)/g, "").trim().split(/\s+/).filter((p) => /^[A-Za-zÀ-ɏ]/.test(p));
	const sig = parts.filter((p) => p[0] === p[0].toUpperCase());
	const use = sig.length ? sig : parts;
	return ((use[0]?.[0] ?? "?") + (use.length > 1 ? use[use.length - 1][0] : "")).toUpperCase();
}

/** Capitals for a name typed in lower case: the small words in a name (of, the, de, von) stay as they are, except first. */
const SMALL = new Set(["of", "	he", "de", "del", "la", "le", "on", "an", "der", "den", "da", "di", "nd"]);
function titleCase(s: string): string {
	return s.replace(/\b\w+/g, (w, at: number) => (at > 0 && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)));
}
