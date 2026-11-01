import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, Simulation, SimulationLinkDatum, SimulationNodeDatum } from "d3-force";
import { Menu, Notice } from "obsidian";
import type ChroniclePlugin from "../main";
import { addLink, linkChoices } from "../ui/relations";
import { TextPrompt } from "../ui/TextPrompt";
import type { Entity, EntityFilter, EntityType, TimedRef } from "../types";
import { activeAt } from "../index/EntityIndex";
import { PanZoom } from "./panzoom";
import { bindHover, clickOrDouble, el, emptyState, entityColor, icon, iconButton, openEntity, showEntityMenu, svg } from "./common";

export interface NetworkOptions {
	filter: EntityFilter;
	types: EntityType[];
	focus?: string;
	depth: number;
	/** Universal day for a snapshot of who existed / belonged where; undefined = all time. */
	at?: number;
	labels: boolean;
	/** With a date set: keep people and links of other times, faded, instead of hiding them. */
	fade?: boolean;
	/** Fog of war: only what this person knows about. */
	pov?: string;
	/** Kinds of link left out (family, relationships, membership, events, places). */
	hiddenLinks?: LinkGroup[];
	/** Notes dragged to a spot of their own, kept there: key → [x, y]. */
	pinned?: Record<string, [number, number]>;
}

/** Links grouped the way people think of them, for the filter. */
export type LinkGroup = "family" | "relationships" | "membership" | "events" | "places";
export const LINK_GROUPS: [LinkGroup, string, string][] = [
	["family", "Family", "git-fork"],
	["relationships", "Relationships", "heart-handshake"],
	["membership", "Groups and branches", "flag"],
	["events", "Took part in", "calendar-clock"],
	["places", "Where", "map-pin"],
];

export const DEFAULT_NETWORK_OPTIONS: NetworkOptions = {
	filter: {},
	types: ["person", "culture", "place", "event"],
	depth: 2,
	labels: true,
};

type EdgeKind = "parent" | "partner" | "relation" | "member" | "participant" | "at" | "in" | "descends" | "culture-relation";

const GROUP_OF: Record<EdgeKind, LinkGroup> = {
	parent: "family",
	partner: "family",
	relation: "relationships",
	"culture-relation": "relationships",
	member: "membership",
	descends: "membership",
	participant: "events",
	at: "places",
	in: "places",
};

interface Node extends SimulationNodeDatum {
	key: string;
	entity: Entity;
	degree: number;
	r: number;
	g?: SVGGElement;
	/** Not alive / not yet founded at the chosen date (shown faded). */
	inactive?: boolean;
}

interface Link extends SimulationLinkDatum<Node> {
	kind: EdgeKind;
	label?: string;
	path?: SVGLineElement;
	inactive?: boolean;
}

/** Force-directed graph of how people, cultures, places and events connect. */
export class NetworkRenderer {
	private root: HTMLElement;
	private svgEl: SVGSVGElement;
	private layer: SVGGElement;
	private pz: PanZoom;
	private sim?: Simulation<Node, Link>;
	private nodes: Node[] = [];
	private links: Link[] = [];
	private fitted = false;
	private resizeObs: ResizeObserver;
	/** Drag from one note to another to tie them (also with Alt held, any time). */
	linkMode = false;

	constructor(
		private container: HTMLElement,
		private plugin: ChroniclePlugin,
		public options: NetworkOptions,
		private embedded = false,
		private hoverParent: { hoverPopover: unknown } | HTMLElement = container,
	) {
		this.root = el("div", { cls: "chronicle-network" + (embedded ? " is-embedded" : "") }, container);
		this.svgEl = svg("svg", { class: "chronicle-canvas" }, this.root);
		this.layer = svg("g", {}, this.svgEl);
		this.pz = new PanZoom(this.svgEl, this.layer, { requireModifier: embedded, minScale: 0.1, maxScale: 4 });
		if (embedded) {
			const box = el("div", { cls: "chronicle-embed-controls" }, this.root);
			iconButton(box, "zoom-in", "Zoom in", () => this.pz.zoomBy(1.3));
			iconButton(box, "zoom-out", "Zoom out", () => this.pz.zoomBy(1 / 1.3));
			iconButton(box, "maximize", "Fit", () => this.fit());
		}
		this.refresh();
		this.resizeObs = new ResizeObserver(() => {
			if (!this.pz.touched && this.nodes.length) this.fit();
		});
		this.resizeObs.observe(this.root);
	}

	destroy() {
		this.resizeObs.disconnect();
		this.sim?.stop();
		this.pz.destroy();
		this.root.remove();
	}

	zoomBy(f: number) {
		this.pz.zoomBy(f);
	}

	fit() {
		if (!this.nodes.length) return;
		let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
		for (const n of this.nodes) {
			x0 = Math.min(x0, (n.x ?? 0) - 40);
			y0 = Math.min(y0, (n.y ?? 0) - 30);
			x1 = Math.max(x1, (n.x ?? 0) + 40);
			y1 = Math.max(y1, (n.y ?? 0) + 30);
		}
		this.pz.fit({ x: x0, y: y0, width: x1 - x0, height: y1 - y0 }, 20, 1.5);
	}

	refresh() {
		const prev = new Map(this.nodes.map((n) => [n.key, n]));
		this.sim?.stop();
		this.layer.replaceChildren();
		this.root.querySelector(".chronicle-empty")?.remove();
		this.build();
		if (!this.nodes.length) {
			emptyState(this.root, "waypoints", "Nothing to connect yet", "Notes with a `type` (person, culture, place, event) and links between them appear here.");
			return;
		}
		// Keep positions of nodes that survive a refresh so the graph doesn't jump around; ones you
		// dragged stay exactly where you left them.
		for (const n of this.nodes) {
			const p = prev.get(n.key);
			if (p) [n.x, n.y, n.vx, n.vy] = [p.x, p.y, 0, 0];
			const pin = this.options.pinned?.[n.key];
			if (pin) [n.x, n.y, n.fx, n.fy] = [pin[0], pin[1], pin[0], pin[1]];
		}
		this.draw();
		if (this.picked && this.nodes.some((n) => n.key === this.picked)) this.pick(this.picked);
		else this.pick(undefined);
		this.simulate(prev.size === 0 ? 1 : 0.4);
	}

	private build() {
		const idx = this.plugin.index;
		const { options } = this;
		const at = options.at;
		// Fog of war: only what the chosen person knows (by the time slider's date).
		const known = options.pov ? this.plugin.knownTo(options.pov, options.at) : undefined;
		const candidates = idx.all().filter((e) => options.types.includes(e.type) && e.type !== "map" && idx.matches(e, { ...options.filter, types: undefined }) && (!known || known.has(e.key)));
		const allowed = new Map<string, Entity>();
		const inactive = new Set<string>();
		const fade = !!options.fade && at !== undefined;
		for (const e of candidates) {
			if (at !== undefined) {
				const there = e.type === "event" ? !!e.start && e.start.start <= at : idx.existsAt(e, at);
				if (!there) {
					if (!fade) continue;
					inactive.add(e.key);
				}
			}
			allowed.set(e.key, e);
		}
		const links: Link[] = [];
		const seen = new Set<string>();
		const hidden = new Set(options.hiddenLinks ?? []);
		const link = (a: string, b: string, kind: EdgeKind, label?: string, timed?: TimedRef) => {
			if (a === b || !allowed.has(a) || !allowed.has(b) || hidden.has(GROUP_OF[kind])) return;
			const off = (timed && at !== undefined && !activeAt(timed, at)) || inactive.has(a) || inactive.has(b);
			if (off && !fade) return;
			const id = [a, b].sort().join("→") + kind;
			if (seen.has(id)) return;
			seen.add(id);
			links.push({ source: a as unknown as Node, target: b as unknown as Node, kind, label, inactive: off });
		};
		for (const e of allowed.values()) {
			for (const p of e.parents) link(p.key, e.key, "parent");
			for (const p of e.adoptiveParents) link(p.key, e.key, "parent", "adoptive");
			for (const p of e.partners) link(e.key, p.ref.key, "partner", p.kind, p);
			for (const r of e.relations) link(e.key, r.ref.key, "relation", r.kind, r);
			for (const c of e.cultures) link(e.key, c.ref.key, e.type === "event" ? "participant" : "member", c.role, c);
			for (const p of e.participants) link(e.key, p.key, "participant");
			for (const p of e.places) link(e.key, p.key, "at");
			if (e.locatedIn) link(e.key, e.locatedIn.key, "in");
			for (const p of e.parentCultures) link(p.key, e.key, "descends");
			for (const r of e.relatedCultures) link(e.key, r.ref.key, "culture-relation", r.kind, r);
		}

		let keys = new Set(allowed.keys());
		if (options.focus && allowed.has(options.focus)) {
			const adj = new Map<string, string[]>();
			for (const l of links) {
				const a = l.source as unknown as string;
				const b = l.target as unknown as string;
				adj.set(a, [...(adj.get(a) ?? []), b]);
				adj.set(b, [...(adj.get(b) ?? []), a]);
			}
			keys = new Set([options.focus]);
			let frontier = [options.focus];
			for (let d = 0; d < options.depth; d++) {
				const next: string[] = [];
				for (const k of frontier) for (const n of adj.get(k) ?? []) if (!keys.has(n)) (keys.add(n), next.push(n));
				frontier = next;
			}
		}
		const degree = new Map<string, number>();
		this.links = links.filter((l) => keys.has(l.source as unknown as string) && keys.has(l.target as unknown as string));
		for (const l of this.links) {
			for (const k of [l.source, l.target] as unknown as string[]) degree.set(k, (degree.get(k) ?? 0) + 1);
		}
		this.nodes = [...keys].map((k) => {
			const d = degree.get(k) ?? 0;
			const e = allowed.get(k)!;
			const base = e.type === "culture" ? 9 : e.type === "event" ? 5 : 6;
			return { key: k, entity: e, degree: d, r: base + Math.sqrt(d) * 2.2, inactive: inactive.has(k) };
		});
	}

	private draw() {
		const linkLayer = svg("g", { class: "chronicle-net-links" }, this.layer);
		const nodeLayer = svg("g", { class: "chronicle-net-nodes" }, this.layer);
		for (const l of this.links) {
			l.path = svg("line", { class: `chronicle-net-link kind-${l.kind}${l.inactive ? " is-inactive" : ""}` }, linkLayer);
			if (l.label) {
				const t = svg("title", {}, l.path);
				t.textContent = l.label;
			}
		}
		const neighbors = new Map<string, Set<string>>();
		this.neighbors = neighbors;
		for (const l of this.links) {
			const a = l.source as unknown as string;
			const b = l.target as unknown as string;
			if (!neighbors.has(a)) neighbors.set(a, new Set());
			if (!neighbors.has(b)) neighbors.set(b, new Set());
			neighbors.get(a)!.add(b);
			neighbors.get(b)!.add(a);
		}
		// A click on empty space lets go of the picked note.
		if (!this.embedded && !this.boundBackground) {
			this.boundBackground = true;
			this.svgEl.addEventListener("click", (evt) => {
				if (this.pz.justPanned || (evt.target as Element).closest(".chronicle-net-node")) return;
				this.pick(undefined);
			});
		}
		for (const n of this.nodes) {
			const g = svg("g", { class: `chronicle-net-node type-${n.entity.type}`, "data-chronicle-drag": "1", "data-key": n.key }, nodeLayer);
			if (n.key === this.options.focus) g.classList.add("is-focus");
			if (n.inactive) g.classList.add("is-inactive");
			if (this.options.pinned?.[n.key]) g.classList.add("is-pinned");
			const shape = n.entity.type === "event"
				? svg("rect", { x: -n.r, y: -n.r, width: n.r * 2, height: n.r * 2, rx: 2, transform: "rotate(45)" }, g)
				: n.entity.type === "place"
					? svg("rect", { x: -n.r, y: -n.r, width: n.r * 2, height: n.r * 2, rx: n.r * 0.35 }, g)
					: svg("circle", { r: n.r }, g);
			shape.setAttribute("class", "chronicle-net-shape");
			shape.setAttribute("style", `--node-color: ${entityColor(this.plugin, n.entity)}`);
			if (this.options.labels || n.degree > 3 || n.entity.type === "culture") {
				const t = svg("text", { y: n.r + 12, "text-anchor": "middle", class: "chronicle-net-label" }, g);
				t.textContent = n.entity.name;
			}
			n.g = g;
			bindHover(this.plugin, g, n.key, this.hoverParent);
			g.addEventListener("mouseenter", () => this.light(n.key));
			// Back to the picked note's neighbourhood, or to everything.
			g.addEventListener("mouseleave", () => this.light(this.picked));
			g.addEventListener("contextmenu", (evt) => {
				evt.preventDefault();
				showEntityMenu(this.plugin, n.key, evt, {
					extra: (menu) => {
						menu.addItem((i) =>
							i.setTitle("Focus graph here").setIcon("locate-fixed").onClick(() => {
								this.options.focus = n.key;
								this.refresh();
							}),
						);
						if (this.options.pinned?.[n.key]) menu.addItem((i) => i.setTitle("Let it move again (unpin)").setIcon("pin-off").onClick(() => this.unpin(n.key)));
					},
				});
			});
			let dragged = false;
			clickOrDouble(
				g,
				// A click picks it (its neighbours stay lit, the rest fade); Ctrl/Cmd-click, or any click in an embed, opens it.
				(evt) => (this.embedded || evt.ctrlKey || evt.metaKey ? openEntity(this.plugin, n.key, evt) : this.pick(n.key)),
				() => {
					this.options.focus = n.key;
					this.refresh();
				},
				() => dragged,
			);
			this.bindDrag(g, n, (moved) => (dragged = moved));
		}
	}

	private neighbors = new Map<string, Set<string>>();
	private boundBackground = false;
	/** The picked note: it and its neighbours stay lit, everything else fades. */
	picked?: string;
	private cardEl?: HTMLElement;
	/** Called when the pinned positions change, so the view can remember them. */
	onPinned?: () => void;

	/** Lights a note and its neighbours (the rest fade), or nothing. */
	private light(key: string | undefined) {
		this.layer.querySelectorAll(".is-lit").forEach((x) => x.classList.remove("is-lit"));
		this.layer.classList.toggle("is-dimmed", !!key);
		if (!key) return;
		const near = this.neighbors.get(key) ?? new Set();
		for (const o of this.nodes) if (o.key === key || near.has(o.key)) o.g?.classList.add("is-lit");
		for (const l of this.links) {
			const a = (l.source as Node).key;
			const b = (l.target as Node).key;
			if (a === key || b === key) l.path?.classList.add("is-lit");
		}
	}

	/** Picks a note (or none): kept lit, with a small card to open it, focus on it or inspect it. */
	pick(key: string | undefined) {
		this.picked = key;
		this.layer.querySelectorAll(".is-picked").forEach((x) => x.classList.remove("is-picked"));
		this.cardEl?.remove();
		this.cardEl = undefined;
		this.light(key);
		const n = key ? this.nodes.find((x) => x.key === key) : undefined;
		if (!n) return;
		n.g?.classList.add("is-picked");
		const e = n.entity;
		const card = el("div", { cls: "uv-net-card" }, this.root);
		this.cardEl = card;
		card.style.setProperty("--node-color", entityColor(this.plugin, e));
		const head = el("div", { cls: "uv-net-card-head" }, card);
		const name = el("a", { cls: "uv-net-card-name", text: e.name }, head);
		name.addEventListener("click", (evt) => openEntity(this.plugin, e.key, evt));
		const close = el("button", { cls: "clickable-icon", attr: { "aria-label": "Let go" } }, head);
		icon(close, "x");
		close.addEventListener("click", () => this.pick(undefined));
		const near = this.neighbors.get(e.key)?.size ?? 0;
		el("div", { cls: "uv-net-card-sub", text: `${near} connection${near === 1 ? "" : "s"} shown${e.summary ? ` · ${e.summary}` : ""}` }, card);
		const acts = el("div", { cls: "uv-net-card-actions" }, card);
		const act = (ic: string, text: string, run: () => void, cls = "") => {
			const b = el("button", { cls }, acts);
			icon(el("span", {}, b), ic);
			el("span", { text }, b);
			b.addEventListener("click", run);
		};
		act("file-text", "Open", () => openEntity(this.plugin, e.key), "mod-cta");
		act("locate-fixed", "Focus here", () => {
			this.options.focus = e.key;
			this.refresh();
		});
		act("panel-right", "Inspect", () => void this.plugin.inspect(e.key));
	}

	/** Lets a dragged note move with the others again. */
	unpin(key?: string) {
		if (!this.options.pinned) return;
		for (const k of key ? [key] : Object.keys(this.options.pinned)) {
			delete this.options.pinned[k];
			const n = this.nodes.find((x) => x.key === k);
			if (n) {
				n.fx = null;
				n.fy = null;
				n.g?.classList.remove("is-pinned");
			}
		}
		this.sim?.alpha(0.3).restart();
		this.onPinned?.();
	}

	/** Where a pointer is, in the graph's own coordinates. */
	private toGraph(evt: PointerEvent): [number, number] {
		const r = this.svgEl.getBoundingClientRect();
		return [(evt.clientX - r.left - this.pz.x) / this.pz.k, (evt.clientY - r.top - this.pz.y) / this.pz.k];
	}

	/** A line from a note follows the pointer; let go over another note to choose how they're tied. */
	private startLink(n: Node, evt: PointerEvent) {
		const line = svg("line", { class: "chronicle-net-draft", x1: n.x ?? 0, y1: n.y ?? 0, x2: n.x ?? 0, y2: n.y ?? 0 }, this.layer);
		this.root.addClass("is-linking");
		const move = (m: PointerEvent) => {
			const [x, y] = this.toGraph(m);
			line.setAttribute("x2", String(x));
			line.setAttribute("y2", String(y));
			this.layer.querySelectorAll(".is-link-target").forEach((x) => x.classList.remove("is-link-target"));
			const over = (document.elementFromPoint(m.clientX, m.clientY) as Element | null)?.closest<SVGGElement>(".chronicle-net-node");
			if (over && over !== n.g) over.classList.add("is-link-target");
		};
		const up = (u: PointerEvent) => {
			window.removeEventListener("pointermove", move);
			window.removeEventListener("pointerup", up);
			line.remove();
			this.root.removeClass("is-linking");
			this.layer.querySelectorAll(".is-link-target").forEach((x) => x.classList.remove("is-link-target"));
			const over = (document.elementFromPoint(u.clientX, u.clientY) as Element | null)?.closest<SVGGElement>(".chronicle-net-node");
			const other = over && this.nodes.find((x) => x.key === over.getAttribute("data-key"));
			if (!other || other.key === n.key) return;
			const choices = linkChoices(this.plugin, n.entity, other.entity);
			const menu = new Menu();
			menu.addItem((i) => i.setTitle(`${n.entity.name} ↔ ${other.entity.name}`).setDisabled(true));
			for (const c of choices) menu.addItem((i) => i.setTitle(c.label).setIcon(c.icon).onClick(() => void c.run().then(() => new Notice(`Linked: ${c.label}`))));
			menu.addItem((i) =>
				i.setTitle("Another kind of relationship…").setIcon("pencil").onClick(() =>
					new TextPrompt(this.plugin, `How is ${other.entity.name} related to ${n.entity.name}? (e.g. sworn-brother, patron)`, "", (kind) => {
						if (kind.trim()) void addLink(this.plugin, n.entity.file, { field: "relations", objKey: "link" }, other.entity.name, { kind: kind.trim() }).then(() => new Notice(`Linked as ${kind.trim()}`));
					}).open(),
				),
			);
			menu.showAtMouseEvent(u);
		};
		window.addEventListener("pointermove", move);
		window.addEventListener("pointerup", up);
		void evt;
	}

	private bindDrag(g: SVGGElement, n: Node, setDragged: (moved: boolean) => void) {
		let start: { x: number; y: number; moved: boolean; fx: number | null | undefined; fy: number | null | undefined } | null = null;
		g.addEventListener("pointerdown", (evt) => {
			if (evt.button !== 0 || this.pz.pinching) return;
			evt.stopPropagation();
			if ((this.linkMode || evt.altKey) && !this.embedded) {
				setDragged(true);
				this.startLink(n, evt);
				return;
			}
			start = { x: evt.clientX, y: evt.clientY, moved: false, fx: n.fx, fy: n.fy };
			g.setPointerCapture(evt.pointerId);
		});
		g.addEventListener("pointermove", (evt) => {
			if (!start) return;
			// A second finger came down: it's a pinch, not a drag. The node goes back where it was.
			if (this.pz.pinching) {
				if (start.moved) {
					n.fx = start.fx;
					n.fy = start.fy;
					this.sim?.alphaTarget(0);
				}
				start = null;
				setDragged(true);
				return;
			}
			const dx = evt.clientX - start.x;
			const dy = evt.clientY - start.y;
			if (!start.moved && Math.hypot(dx, dy) < 3) return;
			if (!start.moved) {
				start.moved = true;
				this.sim?.alphaTarget(0.3).restart();
			}
			const r = this.svgEl.getBoundingClientRect();
			n.fx = (evt.clientX - r.left - this.pz.x) / this.pz.k;
			n.fy = (evt.clientY - r.top - this.pz.y) / this.pz.k;
		});
		g.addEventListener("pointerdown", () => setDragged(false));
		g.addEventListener("pointerup", () => {
			if (!start) return;
			const moved = start.moved;
			start = null;
			this.sim?.alphaTarget(0);
			// A dragged node stays pinned where it was dropped, remembered with the view.
			if (moved && n.fx != null && n.fy != null) {
				(this.options.pinned ??= {})[n.key] = [Math.round(n.fx), Math.round(n.fy)];
				g.classList.add("is-pinned");
				this.onPinned?.();
			}
			setDragged(moved);
		});
	}

	private simulate(alpha: number) {
		const n = this.nodes.length;
		this.sim = forceSimulation<Node, Link>(this.nodes)
			.force(
				"link",
				forceLink<Node, Link>(this.links)
					.id((d) => d.key)
					.distance((l) => (l.kind === "member" || l.kind === "at" ? 90 : l.kind === "partner" ? 50 : 70))
					.strength((l) => (l.kind === "member" ? 0.15 : 0.6)),
			)
			.force("charge", forceManyBody<Node>().strength((d) => -170 - d.degree * 30))
			.force("collide", forceCollide<Node>().radius((d) => d.r + 22))
			.force("center", forceCenter(0, 0))
			.force("x", forceX(0).strength(0.04))
			.force("y", forceY(0).strength(0.04))
			.alpha(alpha)
			.alphaDecay(n > 400 ? 0.05 : 0.028)
			.on("tick", () => this.tick());
		if (!this.fitted) {
			// Pre-settle so the first frame is already readable, then fit once.
			this.sim.stop();
			for (let i = 0; i < Math.min(300, 30000 / Math.max(1, n)); i++) this.sim.tick();
			this.tick();
			requestAnimationFrame(() => this.fit());
			this.fitted = true;
			this.sim.alpha(0.05).restart();
		}
	}

	private tick() {
		for (const l of this.links) {
			const s = l.source as Node;
			const t = l.target as Node;
			if (!l.path) continue;
			l.path.setAttribute("x1", String(s.x ?? 0));
			l.path.setAttribute("y1", String(s.y ?? 0));
			l.path.setAttribute("x2", String(t.x ?? 0));
			l.path.setAttribute("y2", String(t.y ?? 0));
		}
		for (const n of this.nodes) n.g?.setAttribute("transform", `translate(${n.x ?? 0},${n.y ?? 0})`);
	}
}
