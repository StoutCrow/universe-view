import type UniverseViewPlugin from "../main";
import type { ChronDate, Entity, TimedRef } from "../types";
import { formatSpan } from "../dates/parser";
import { occupationsAt } from "../index/wars";
import { spacedLabels, yearTicks } from "../dates/calendars";
import { activeAt } from "../index/EntityIndex";
import { relInverse, relKind, relLabel, relOne, relSymmetric, relTone, type RelTone } from "../index/relkinds";
import { PanZoom } from "./panzoom";
import { bindHover, cultureColor, el, emptyState, entityColor, icon, iconButton, openEntity, resourceUrl, showEntityMenu, svg } from "./common";
import { pickLogo } from "../ui/suggest";
import { isHouse } from "./houses";
import { holdingsOf, type RealmTree } from "../index/realms";

/**
 * What the chart is a tree of: titles under their lieges (realms), houses and their cadet branches
 * (dynasties), or organisations and their branches (orgs).
 */
export type OrgMode = "realms" | "dynasties" | "orgs";

export interface OrgOptions {
	mode?: OrgMode;
	/** The organisation at the top; all top-level ones in scope when empty. */
	root?: string;
	folder?: string;
	/** Universal day: the organisation as it stood then. */
	at?: number;
	/** People in each organisation (leaders first). */
	members: boolean;
	/** The tenure timeline under the chart. */
	timeline: boolean;
	/** How many levels of sub-organisations to show. */
	depth: number;
	calendar?: string;
	/** Alliances, rivalries, vassalage… drawn between the groups on the chart. */
	relations?: boolean;
	/** Relationships between the people listed on the cards. */
	ties?: boolean;
	/** Kinds of tie switched off in the legend. */
	hiddenTones?: RelTone[];
	/** Groups whose branches are folded away (the button under each card, or the chevron in the outline). */
	collapsed?: string[];
	/** "chart": the tree of cards; "outline": the same tiers as an indented list; "time": who held each tier, over time. */
	layout?: "chart" | "outline" | "time";
}

export const DEFAULT_ORG_OPTIONS: OrgOptions = { members: true, timeline: true, depth: 4, relations: true, ties: true };

/** Roles that make someone the head of an organisation. */
const LEADER = /\b(king|queen|monarch|emperor|empress|ruler|leader|head|chief|lord|lady|master|grand|high|commander|captain|general|admiral|president|chair|chairman|chairwoman|director|ceo|founder|prince|princess|duke|duchess|count|countess|baron|chancellor|abbot|abbess|bishop|archbishop|pope|patriarch|matriarch|pharaoh|sultan|khan|shah|tsar|czar|regent|steward|marshal|warden|elder|prior|prioress|headmaster|principal|governor|mayor)\b/i;

export interface Tenure {
	person: Entity;
	role?: string;
	from?: ChronDate;
	to?: ChronDate;
	leader: boolean;
}

/** A relationship between two groups or two people, as one line on the chart. */
export interface Tie {
	/** Drawn from a to b (for ranked ties, from the one above to the one below). */
	a: string;
	b: string;
	label: string;
	/** The kind as seen from `a` ("vassals"), for labelling it from `b`'s side. */
	kind?: string;
	tone: RelTone;
	/** Ranked ties (liege → vassal) get an arrow. */
	directed: boolean;
	from?: ChronDate;
	to?: ChronDate;
}

interface OrgNode {
	org: Entity;
	depth: number;
	children: OrgNode[];
	people: Tenure[];
	/** Ties to other groups, on the chart or not. */
	ties: Tie[];
	/** How many branches are folded away under it. */
	folded?: number;
	/** Layout */
	x: number;
	y: number;
	w: number;
	h: number;
	span: number;
}

const CARD_W = 264;
const HEAD_H = 78;
const LOGO = 50;
const TIES_H = 26;
const ROW_H = 22;
const MAX_ROWS = 8;
const GAP_X = 44;
const GAP_Y = 70;

export const TONE_NAMES: Record<RelTone, string> = {
	ally: "Allies",
	hostile: "Rivals and enemies",
	get rank() { return `${relLabel("liege")}, ${relLabel("vassals").toLowerCase()} and service`; },
	trade: "Trade",
	bond: "Friends and bonds",
	neutral: "Other ties",
};

/** Groups you belong to by belief or descent rather than being part of their structure. */
const AFFILIATION = /\b(faith|religion|church|creed|cult|belief|pantheon|culture|people|ethnicity|ethnic|race|species|language|tongue|nationality|heritage)\b/i;

/**
 * Sub-organisations: branches (`branches:` / `parent-org:`), and organisations that list it among
 * their cultures, unless that's only an affiliation (a house that follows a faith isn't part of the
 * church) or the group already has a parent of its own.
 */
export function subOrgs(plugin: UniverseViewPlugin, key: string): Entity[] {
	const idx = plugin.index;
	const out = new Map<string, Entity>();
	for (const k of idx.childCulturesOf.get(key) ?? []) {
		const e = idx.get(k);
		if (e) out.set(k, e);
	}
	const parent = idx.get(key);
	if (parent && AFFILIATION.test(`${parent.category ?? ""} ${parent.tags.join(" ")}`)) return [...out.values()];
	for (const c of idx.all("culture")) {
		if (c.key === key || c.parentCultures.length) continue;
		const link = c.cultures.find((m) => m.ref.key === key);
		if (!link || AFFILIATION.test(`${link.kind ?? ""} ${link.role ?? ""}`)) continue;
		// Belonging to several groups: only the first listed counts as its place in the structure.
		if (c.cultures.filter((m) => idx.get(m.ref.key)?.type === "culture" && !AFFILIATION.test(`${idx.get(m.ref.key)?.category ?? ""}`))[0]?.ref.key !== key) continue;
		out.set(c.key, c);
	}
	return [...out.values()];
}

/** Who held which role in an organisation (members with roles and dates, plus `leader:`-style relations). */
export function tenures(plugin: UniverseViewPlugin, org: Entity, at?: number): Tenure[] {
	const idx = plugin.index;
	const out: Tenure[] = [];
	for (const m of idx.members(org.key)) {
		const p = idx.get(m.key);
		if (!p || p.type !== "person") continue;
		if (at !== undefined && (!activeAt(m.link, at) || !idx.existsAt(p, at))) continue;
		const role = m.link.role ?? m.link.kind;
		out.push({ person: p, role, from: m.link.from, to: m.link.to, leader: !!role && LEADER.test(role) });
	}
	// "leader: [[X]]", "ruler: [[Y]]" written on the organisation's own note.
	for (const r of org.relations) {
		const p = idx.get(r.ref.key);
		if (!p || p.type !== "person" || !r.kind || !(LEADER.test(r.kind) || relKind(r.kind)?.key === "leader" || relKind(r.kind)?.key === "founder")) continue;
		if (at !== undefined && (!activeAt(r, at) || !idx.existsAt(p, at))) continue;
		// Already listed as a member: mark them as the leader instead of listing them twice.
		const member = out.find((t) => t.person.key === p.key);
		if (member) {
			if (!member.leader) {
				member.leader = true;
				member.role = member.role ?? (relKind(r.kind)?.key === "founder" ? "Founder" : relLabel(r.kind).replace(/s$/, ""));
			}
			continue;
		}
		out.push({ person: p, role: relKind(r.kind)?.key === "founder" ? "Founder" : r.kind, from: r.from, to: r.to, leader: true });
	}
	const start = (t: Tenure) => t.from?.start ?? t.person.start?.start ?? Infinity;
	return out.sort((a, b) => Number(b.leader) - Number(a.leader) || start(a) - start(b) || a.person.name.localeCompare(b.person.name));
}

/** Ranked ties are drawn from the one above: kinds written on the one below are turned round. */
const POINTS_UP = new Set(["liege", "mentors", "employer", "leader", "founder"]);

/** One relationship as a tie between `self` and the linked note, facing the right way. */
export function tieOf(self: string, r: TimedRef): Tie {
	const known = relKind(r.kind);
	const tone = relTone(r.kind);
	const directed = !!known && !relSymmetric(r.kind) && tone === "rank";
	if (directed && POINTS_UP.has(known.key)) {
		return { a: r.ref.key, b: self, label: r.label ?? relLabel(relInverse(r.kind)), kind: relInverse(r.kind), tone, directed, from: r.from, to: r.to };
	}
	return { a: self, b: r.ref.key, label: r.label ?? relLabel(r.kind), kind: r.kind, tone, directed, from: r.from, to: r.to };
}

/** Every relationship between groups, both from `relations`-style properties and `related-cultures`. */
export function groupTies(plugin: UniverseViewPlugin, at?: number): Tie[] {
	const idx = plugin.index;
	const out = new Map<string, Tie>();
	const add = (self: string, r: TimedRef) => {
		const other = idx.get(r.ref.key);
		if (other?.type !== "culture" || r.ref.key === self) return;
		if (at !== undefined && !activeAt(r, at)) return;
		const t = tieOf(self, r);
		// Written on both notes, or both ways: one line.
		const id = (t.directed ? [t.a, t.b] : [t.a, t.b].sort()).join("|") + "|" + t.tone + "|" + t.label;
		if (!out.has(id)) out.set(id, t);
	};
	for (const c of idx.all("culture")) {
		for (const r of c.relations) add(c.key, r);
		for (const r of c.relatedCultures) add(c.key, r);
	}
	return [...out.values()];
}

/** Relationships between people, one per pair and kind. */
export function personTies(plugin: UniverseViewPlugin, keys: Set<string>, at?: number): Tie[] {
	const idx = plugin.index;
	const out = new Map<string, Tie>();
	for (const k of keys) {
		const p = idx.get(k);
		if (!p) continue;
		for (const r of p.relations) {
			if (!keys.has(r.ref.key) || r.ref.key === k) continue;
			if (at !== undefined && !activeAt(r, at)) continue;
			const t = tieOf(k, r);
			const id = (t.directed ? [t.a, t.b] : [t.a, t.b].sort()).join("|") + "|" + t.label;
			if (!out.has(id)) out.set(id, t);
		}
	}
	return [...out.values()];
}

/**
 * Organisation chart: an organisation and its sub-organisations as a tree of cards, each with its
 * logo, leaders and members, joined by the relationships between them (alliances, rivalries,
 * vassalage, trade) and between their people, above a timeline of who held which role when. A time
 * slider shows the organisation as it stood on one day.
 */
export class OrgChartRenderer {
	private root: HTMLElement;
	private chartEl: HTMLElement;
	private svgEl: SVGSVGElement;
	private outlineEl: HTMLElement;
	private layer: SVGGElement;
	private pz: PanZoom;
	private timelineEl: HTMLElement;
	private splitter: HTMLElement;
	private legendEl: HTMLElement;
	private bbox = { x: 0, y: 0, width: 1, height: 1 };
	private nodes: OrgNode[] = [];
	private realmTree?: RealmTree;
	private resizeObs: ResizeObserver;
	private timelineHeight = 0.38;
	/** Where each listed person's row is, for drawing ties between people. */
	private rowAt = new Map<string, { x: number; y: number; card: string }[]>();
	/** Labels already placed, so the next one moves aside instead of covering them. */
	private taken: { x: number; y: number; w: number; h: number }[] = [];
	/** Set by the view: the user picked a day on the timeline (undefined = all time). */
	onTimeChange?: (day: number | undefined) => void;
	/** Set by the view: the user double-clicked an organisation to put it at the top. */
	onReroot?: (key: string) => void;
	/** Set by the view: legend toggles changed the options. */
	onOptionsChange?: () => void;

	constructor(
		private container: HTMLElement,
		private plugin: UniverseViewPlugin,
		public options: OrgOptions,
		private embedded = false,
		private hoverParent: { hoverPopover: unknown } | HTMLElement = container,
	) {
		this.root = el("div", { cls: "universeview-org" + (embedded ? " is-embedded" : "") }, container);
		this.chartEl = el("div", { cls: "universeview-org-chart" }, this.root);
		this.svgEl = svg("svg", { class: "universeview-canvas" }, this.chartEl);
		const defs = svg("defs", {}, this.svgEl);
		const clip = svg("clipPath", { id: "universeview-org-avatar" }, defs);
		svg("circle", { cx: 0, cy: 0, r: 8 }, clip);
		const logoClip = svg("clipPath", { id: "universeview-org-logo-clip" }, defs);
		svg("rect", { x: 0, y: 0, width: LOGO, height: LOGO, rx: 10 }, logoClip);
		// One arrowhead per kind of tie, coloured to match its line.
		for (const tone of Object.keys(TONE_NAMES)) {
			const m = svg("marker", { id: `universeview-org-arrow-${tone}`, viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" }, defs);
			svg("path", { d: "M0,0 L10,5 L0,10 z", class: `universeview-org-arrowhead tone-${tone}` }, m);
		}
		this.outlineEl = el("div", { cls: "universeview-org-outline" }, this.chartEl);
		this.layer = svg("g", {}, this.svgEl);
		this.pz = new PanZoom(this.svgEl, this.layer, { requireModifier: embedded, minScale: 0.15, maxScale: 3 });
		this.legendEl = el("div", { cls: "universeview-org-legend" }, this.chartEl);
		this.splitter = el("div", { cls: "universeview-org-splitter", attr: { title: "Drag to resize the timeline" } }, this.root);
		this.timelineEl = el("div", { cls: "universeview-org-timeline" }, this.root);
		this.bindSplitter();
		if (embedded) {
			const box = el("div", { cls: "universeview-embed-controls" }, this.chartEl);
			iconButton(box, "zoom-in", "Zoom in", () => this.pz.zoomBy(1.25));
			iconButton(box, "zoom-out", "Zoom out", () => this.pz.zoomBy(1 / 1.25));
			iconButton(box, "maximize", "Fit", () => this.fit());
		}
		let lastW = 0;
		this.resizeObs = new ResizeObserver(() => {
			const w = this.root.clientWidth;
			if (Math.abs(w - lastW) < 2) return;
			lastW = w;
			this.drawTimeline();
			if (!this.pz.touched) this.fit();
		});
		this.resizeObs.observe(this.root);
		this.refresh();
	}

	destroy() {
		this.resizeObs.disconnect();
		this.pz.destroy();
		this.root.remove();
	}

	fit() {
		this.pz.fit(this.bbox, 24, 1);
	}

	zoomBy(f: number) {
		this.pz.zoomBy(f);
	}

	private bindSplitter() {
		this.splitter.addEventListener("pointerdown", (evt) => {
			evt.preventDefault();
			const r = this.root.getBoundingClientRect();
			const move = (e: PointerEvent) => {
				this.timelineHeight = Math.min(0.75, Math.max(0.12, (r.bottom - e.clientY) / r.height));
				this.root.style.setProperty("--org-timeline", `${Math.round(this.timelineHeight * 100)}%`);
			};
			const up = () => {
				window.removeEventListener("pointermove", move);
				window.removeEventListener("pointerup", up);
				this.drawTimeline();
			};
			window.addEventListener("pointermove", move);
			window.addEventListener("pointerup", up);
		});
	}

	private cal() {
		const idx = this.plugin.index;
		return this.plugin.calendars.get(this.options.calendar ?? (this.options.root ? idx.get(this.options.root)?.calendar : undefined) ?? idx.dominantCalendar(this.options.folder));
	}

	/** Draws the timeline's date line at a day, when the timeline is showing. */
	private cursor?: (at: number | undefined) => void;

	/** Moves the timeline's date line alone, when nothing else on the chart changes with the date. */
	moveCursor(at: number | undefined) {
		this.cursor?.(at);
	}

	refresh() {
		this.cursor = undefined;
		this.layer.replaceChildren();
		this.legendEl.empty();
		this.rowAt.clear();
		this.taken = [];
		this.root.querySelector(".universeview-empty")?.remove();
		const outline = this.options.layout === "outline";
		this.outlineEl.empty();
		this.root.toggleClass("is-outline", outline);
		const time = this.options.layout === "time";
		this.root.toggleClass("is-time", time);
		this.root.toggleClass("has-timeline", (this.options.timeline || time) && !outline);
		this.root.style.setProperty("--org-timeline", `${Math.round(this.timelineHeight * 100)}%`);
		const idx = this.plugin.index;
		const o = this.options;
		const inScope = (e: Entity) => !o.folder || e.path.startsWith(o.folder + "/");
		const exists = (e: Entity) => o.at === undefined || idx.existsAt(e, o.at);
		const allTies = groupTies(this.plugin, o.at).filter((t) => {
			const a = idx.get(t.a);
			const b = idx.get(t.b);
			return !!a && !!b && exists(a) && exists(b);
		});

		// What the tree is made of depends on the mode.
		const mode = o.mode ?? "realms";
		const tree = mode === "orgs" ? undefined : this.plugin.realms(o.at);
		this.realmTree = tree;
		const isHouseE = (c: Entity | undefined): c is Entity => !!c && c.type === "culture" && isHouse(this.plugin, c);
		const kidsOf = (org: Entity): Entity[] => {
			if (mode === "realms") return (tree!.nodes.get(org.key)?.children ?? []).map((k) => idx.get(k)).filter((e): e is Entity => !!e);
			if (mode === "dynasties") return [...(idx.childCulturesOf.get(org.key) ?? [])].map((k) => idx.get(k)).filter(isHouseE);
			return subOrgs(this.plugin, org.key);
		};
		const peopleOf = (org: Entity): Tenure[] => {
			if (!o.members) return [];
			const list = org.type === "culture" ? tenures(this.plugin, org, o.at) : [];
			// A title's holder (and the ruler above, when someone else) heads its card.
			const node = tree?.nodes.get(org.key);
			if (mode === "realms" && node) {
				// Ruler first, so the holder ends up on top; one row when they're the same person.
				const ruler = node.ruler?.key !== node.holder?.key ? node.ruler : undefined;
				for (const [r, role] of [[ruler, "Ruler"], [node.holder, undefined]] as const) {
					const p = r?.resolved ? idx.get(r.key) : undefined;
					if (!p || p.type !== "person") continue;
					const have = list.find((t) => t.person.key === p.key);
					if (have) have.leader = true;
					else list.unshift({ person: p, role: role ?? holderRole(org, p.key), leader: true });
				}
			}
			return list;
		};
		// A house's titles, shown as chips on its card.
		const heldTies = (org: Entity): Tie[] =>
			mode === "dynasties" && tree ? holdingsOf(tree, org.key).map((k) => ({ a: org.key, b: k, label: "Holds", tone: "rank", directed: false })) : [];

		// Build the tree.
		const seen = new Set<string>();
		const build = (org: Entity, depth: number): OrgNode => {
			seen.add(org.key);
			const node: OrgNode = {
				org, depth, children: [], people: peopleOf(org),
				ties: [...heldTies(org), ...(o.relations !== false ? allTies.filter((t) => t.a === org.key || t.b === org.key) : [])],
				x: 0, y: 0, w: CARD_W, h: 0, span: 0,
			};
			if (depth < o.depth) {
				const kids = kidsOf(org).filter((c) => !seen.has(c.key) && exists(c) && (o.root || inScope(c)));
				// Titles come largest first already; groups by age.
				if (mode !== "realms") kids.sort((a, b) => (a.start?.start ?? 0) - (b.start?.start ?? 0) || a.name.localeCompare(b.name));
				if (o.collapsed?.includes(org.key)) node.folded = kids.length;
				else for (const k of kids) if (!seen.has(k.key)) node.children.push(build(k, depth + 1));
			}
			return node;
		};
		let roots: Entity[];
		const rootEntity = o.root ? idx.get(o.root) : undefined;
		if (rootEntity) roots = [rootEntity];
		else if (mode === "realms") {
			// Top titles that rule something or someone (a lone place on top isn't a realm).
			roots = tree!.roots
				.map((k) => idx.get(k))
				.filter((e): e is Entity => !!e && inScope(e) && exists(e) && (!!tree!.nodes.get(e.key)?.children.length || !!tree!.nodes.get(e.key)?.holder));
		} else if (mode === "dynasties") {
			// Houses that aren't a cadet branch of another house.
			roots = idx.all("culture")
				.filter((c) => isHouseE(c) && inScope(c) && exists(c) && !c.parentCultures.some((p) => isHouseE(idx.get(p.key))))
				.sort((a, b) => b.importance - a.importance || (tree ? holdingsOf(tree, b.key).length - holdingsOf(tree, a.key).length : 0) || a.name.localeCompare(b.name));
		} else {
			const cultures = idx.all("culture").filter((c) => inScope(c) && exists(c));
			const keys = new Set(cultures.map((c) => c.key));
			// Top level: not shown under another organisation in scope.
			const nested = new Set<string>();
			for (const c of cultures) for (const s of subOrgs(this.plugin, c.key)) if (s.key !== c.key) nested.add(s.key);
			roots = cultures
				.filter((c) => !c.parentCultures.some((p) => keys.has(p.key)) && !nested.has(c.key))
				.sort((a, b) => b.importance - a.importance || subOrgs(this.plugin, b.key).length - subOrgs(this.plugin, a.key).length || a.name.localeCompare(b.name));
		}
		const forest = roots.filter((r) => !seen.has(r.key)).map((r) => build(r, 0));
		// Groups that are each other's parents (A under B under A) have no top: start from the oldest one.
		if (!rootEntity && mode === "orgs") {
			// Up through each group's parents: a loop comes back round to where it started.
			const parentOf = (c: Entity) => idx.get(c.parentCultures[0]?.key ?? c.cultures.find((m) => idx.get(m.ref.key)?.type === "culture")?.ref.key ?? "");
			const inLoop = (c: Entity) => {
				for (let cur = parentOf(c), i = 0; cur && i < 30; cur = parentOf(cur), i++) if (cur.key === c.key) return true;
				return false;
			};
			const left = idx.all("culture").filter((c) => inScope(c) && exists(c) && !seen.has(c.key) && inLoop(c))
				.sort((a, b) => (a.start?.start ?? Infinity) - (b.start?.start ?? Infinity) || a.name.localeCompare(b.name));
			for (const c of left) if (!seen.has(c.key)) forest.push(build(c, 0));
		}
		this.nodes = [];
		const walk = (n: OrgNode) => {
			this.nodes.push(n);
			n.children.forEach(walk);
		};
		forest.forEach(walk);

		if (!forest.length) {
			const empty: Record<OrgMode, [string, string]> = {
				realms: ["No realms yet", "Realms come from what your notes say: a title's `location:`, `nation:` or the folder note above it puts it under its liege, and `lord:`, `holder:` or `ruler:` says who holds it. Tags like #Realm, #Province or #County say its tier."],
				dynasties: ["No houses yet", "Houses are group notes tagged or named as a house, family or dynasty. A cadet branch says `branch-of: [[House X]]`; people join with `house:` or `cultures:`."],
				orgs: ["No organisations yet", "Organisations are group notes (factions, guilds, companies). Link sub-groups with `parent-org:` or `branches:`, give people `cultures:` with a `role:` and dates, and join groups with `allies:`, `rivals:`, `enemies:`, `vassals:` or `trade-partners:`."],
			};
			emptyState(
				this.chartEl,
				"network",
				o.at !== undefined ? "Nothing at this time" : empty[mode][0],
				empty[mode][1],
				this.embedded ? undefined : { label: mode === "realms" ? "New realm" : mode === "dynasties" ? "New house" : "New organisation", onClick: () => this.plugin.createEntityPrompt({ type: "culture" }) },
			);
			this.timelineEl.empty();
			return;
		}

		if (outline) {
			this.timelineEl.empty();
			this.drawOutline(forest);
			return;
		}

		// Layout: card heights, then a tidy top-down tree.
		for (const n of this.nodes) {
			const rows = Math.min(n.people.length, MAX_ROWS) + (n.people.length > MAX_ROWS ? 1 : 0);
			n.h = HEAD_H + (n.ties.length ? TIES_H : 0) + (rows ? rows * ROW_H + 10 : 0);
		}
		const levelH: number[] = [];
		for (const n of this.nodes) levelH[n.depth] = Math.max(levelH[n.depth] ?? 0, n.h);
		const levelY: number[] = [];
		levelH.forEach((h, i) => (levelY[i] = i === 0 ? 0 : levelY[i - 1] + levelH[i - 1] + GAP_Y));
		const measure = (n: OrgNode): number => {
			const kids = n.children.reduce((s, c) => s + measure(c), 0) + Math.max(0, n.children.length - 1) * GAP_X;
			n.span = Math.max(CARD_W, kids);
			return n.span;
		};
		const place = (n: OrgNode, left: number) => {
			n.x = left + (n.span - CARD_W) / 2;
			n.y = levelY[n.depth];
			let cx = left + (n.span - (n.children.reduce((s, c) => s + c.span, 0) + Math.max(0, n.children.length - 1) * GAP_X)) / 2;
			for (const c of n.children) {
				place(c, cx);
				cx += c.span + GAP_X;
			}
		};
		let left = 0;
		for (const r of forest) {
			measure(r);
			place(r, left);
			left += r.span + GAP_X * 2;
		}

		const links = svg("g", { class: "universeview-org-links" }, this.layer);
		const relLayer = svg("g", { class: "universeview-org-rels" }, this.layer);
		const cards = svg("g", { class: "universeview-org-cards" }, this.layer);
		const pills = svg("g", { class: "universeview-org-pills" }, this.layer);
		for (const n of this.nodes) {
			for (const c of n.children) {
				const x1 = n.x + CARD_W / 2;
				const y1 = n.y + n.h;
				const x2 = c.x + CARD_W / 2;
				const y2 = c.y;
				const mid = y1 + (y2 - y1) / 2;
				svg("path", { d: `M${x1},${y1} V${mid} H${x2} V${y2}`, class: "universeview-org-link" }, links);
			}
			this.drawCard(cards, n);
		}

		// Relationships between the groups on the chart, then between the people on their cards.
		const byKey = new Map(this.nodes.map((n) => [n.org.key, n]));
		// Labels keep off the cards' headers and members.
		for (const n of this.nodes) this.taken.push({ x: n.x, y: n.y, w: CARD_W, h: n.h });
		const hidden = new Set(o.hiddenTones ?? []);
		const shownTones = new Set<RelTone>();
		const drawn: Tie[] = [];
		if (o.relations !== false) {
			const onChart = allTies.filter((t) => byKey.has(t.a) && byKey.has(t.b));
			onChart.forEach((t, i) => {
				shownTones.add(t.tone);
				if (hidden.has(t.tone)) return;
				this.drawGroupTie(relLayer, pills, t, byKey.get(t.a)!, byKey.get(t.b)!, i);
				drawn.push(t);
			});
		}
		let extraBottom = 0;
		if (o.ties !== false && o.members) {
			const people = personTies(this.plugin, new Set(this.rowAt.keys()), o.at);
			for (const t of people) {
				shownTones.add(t.tone);
				if (hidden.has(t.tone)) continue;
				extraBottom = Math.max(extraBottom, this.drawPersonTie(relLayer, pills, t));
			}
		}
		this.drawLegend(shownTones);

		const maxY = Math.max(...this.nodes.map((n) => n.y + n.h), extraBottom);
		// Room above the top row for the arcs that bow over it.
		const top = drawn.length ? -90 : -10;
		this.bbox = { x: -40, y: top, width: left - GAP_X * 2 + 80, height: maxY - top + 30 };
		if (!this.pz.touched) window.requestAnimationFrame(() => this.fit());
		this.drawTimeline();
	}

	/** Folds a group's branches away, or brings them back. */
	toggleFold(key: string) {
		const set = new Set(this.options.collapsed ?? []);
		if (!set.delete(key)) set.add(key);
		this.options.collapsed = [...set];
		this.onOptionsChange?.();
		this.refresh();
	}

	/** The tiers as an indented list: each group with its branches under it, folded with its chevron. */
	private drawOutline(forest: OrgNode[]) {
		const cal = this.cal();
		const idx = this.plugin.index;
		const add = (n: OrgNode, parent: HTMLElement) => {
			const o = n.org;
			const row = el("div", { cls: "universeview-org-outline-row" }, parent);
			row.style.setProperty("--depth", String(n.depth));
			row.style.setProperty("--item-color", o.color ?? cultureColor(this.plugin, o.key));
			const branches = n.children.length + (n.folded ?? 0);
			const fold = el("button", { cls: "universeview-org-outline-fold clickable-icon", attr: { "aria-label": n.folded ? "Show branches" : "Fold branches", "aria-expanded": String(!n.folded) } }, row);
			if (branches) {
				icon(fold, n.folded ? "chevron-right" : "chevron-down");
				fold.addEventListener("click", () => this.toggleFold(o.key));
			} else fold.disabled = true;
			const name = el("a", { cls: "universeview-org-outline-name", text: o.name, attr: { role: "link", tabindex: "0" } }, row);
			name.addEventListener("click", (evt) => openEntity(this.plugin, o.key, evt));
			name.addEventListener("keydown", (evt) => {
				if (evt.key === "Enter") openEntity(this.plugin, o.key, evt);
			});
			bindHover(this.plugin, name, o.key, this.hoverParent);
			const bits = [o.category ? o.category.charAt(0).toUpperCase() + o.category.slice(1) : "", formatSpan(o.start, o.end, cal)];
			const total = idx.members(o.key).filter((m) => idx.get(m.key)?.type === "person").length;
			if (total) bits.push(`${total} member${total === 1 ? "" : "s"}`);
			if (branches) bits.push(`${branches} branch${branches === 1 ? "" : "es"}`);
			el("span", { cls: "universeview-org-outline-sub", text: bits.filter(Boolean).join(" · ") }, row);
			n.children.forEach((c) => add(c, parent));
		};
		forest.forEach((r) => add(r, this.outlineEl));
	}

	/** An arc between two group cards: bowing over the row for neighbours, round the side otherwise. */
	private drawGroupTie(lines: SVGGElement, pills: SVGGElement, t: Tie, a: OrgNode, b: OrgNode, i: number) {
		let d: string;
		let mx: number;
		let my: number;
		const ax = a.x + CARD_W / 2;
		const bx = b.x + CARD_W / 2;
		if (Math.abs(a.y - b.y) < 4) {
			// Same row: up and over, higher for those further apart, but below the row above.
			const room = a.depth > 0 ? GAP_Y - 12 : 120;
			const lift = Math.min(room, 30 + Math.min(70, Math.abs(bx - ax) * 0.12) + (i % 3) * 9);
			const y = Math.min(a.y, b.y);
			d = `M${ax},${a.y} C${ax},${y - lift} ${bx},${y - lift} ${bx},${b.y}`;
			mx = (ax + bx) / 2;
			my = y - lift * 0.75;
		} else {
			// Different rows: from the side of each card facing the other, round the outside when stacked.
			const upper = a.y < b.y ? a : b;
			const lower = upper === a ? b : a;
			const right = lower.x + CARD_W / 2 >= upper.x + CARD_W / 2;
			const stacked = Math.abs(lower.x - upper.x) < CARD_W;
			const ux = right || stacked ? upper.x + CARD_W : upper.x;
			const lx = stacked ? lower.x + CARD_W : right ? lower.x : lower.x + CARD_W;
			const uy = upper.y + HEAD_H / 2;
			const ly = lower.y + HEAD_H / 2;
			const bow = stacked ? 60 + (i % 3) * 12 : 40;
			const c1x = ux + (right || stacked ? bow : -bow);
			const c2x = lx + (stacked ? bow : right ? -bow : bow);
			const [sx, sy, ex, ey] = upper === a ? [ux, uy, lx, ly] : [lx, ly, ux, uy];
			const [k1x, k2x] = upper === a ? [c1x, c2x] : [c2x, c1x];
			d = `M${sx},${sy} C${k1x},${sy} ${k2x},${ey} ${ex},${ey}`;
			mx = 0.125 * sx + 0.375 * k1x + 0.375 * k2x + 0.125 * ex;
			my = 0.5 * sy + 0.5 * ey;
		}
		this.tieLine(lines, pills, t, d, mx, my, "is-group");
	}

	/** A thin curve between two people's rows on different cards. Returns how low it reaches. */
	private drawPersonTie(lines: SVGGElement, pills: SVGGElement, t: Tie): number {
		const as = this.rowAt.get(t.a) ?? [];
		const bs = this.rowAt.get(t.b) ?? [];
		let best: { p: { x: number; y: number; card: string }; q: { x: number; y: number; card: string }; d: number } | undefined;
		for (const p of as) for (const q of bs) {
			if (p.card === q.card) continue;
			const dist = Math.hypot(p.x - q.x, p.y - q.y);
			if (!best || dist < best.d) best = { p, q, d: dist };
		}
		if (!best) return 0;
		const { p, q } = best;
		// Leave each card from the side facing the other one.
		const right = q.x > p.x;
		const sx = right ? p.x + CARD_W - 6 : p.x + 6;
		const ex = right ? q.x + 6 : q.x + CARD_W - 6;
		const sameCol = Math.abs(p.x - q.x) < 4;
		const bow = sameCol ? 50 : Math.max(30, Math.abs(ex - sx) * 0.35);
		const c1 = sameCol ? p.x + CARD_W + bow : sx + (right ? bow : -bow);
		const c2 = sameCol ? q.x + CARD_W + bow : ex + (right ? -bow : bow);
		const s = sameCol ? p.x + CARD_W - 6 : sx;
		const e = sameCol ? q.x + CARD_W - 6 : ex;
		const d = `M${s},${p.y} C${c1},${p.y} ${c2},${q.y} ${e},${q.y}`;
		this.tieLine(lines, pills, t, d, 0.125 * s + 0.375 * c1 + 0.375 * c2 + 0.125 * e, (p.y + q.y) / 2, "is-person");
		return Math.max(p.y, q.y);
	}

	private tieLine(lines: SVGGElement, pills: SVGGElement, t: Tie, d: string, mx: number, my: number, cls: string) {
		const idx = this.plugin.index;
		const g = svg("g", { class: `universeview-org-tie ${cls} tone-${t.tone}`, "data-a": t.a, "data-b": t.b }, lines);
		svg("path", { d, class: "universeview-org-tie-hit" }, g);
		const path = svg("path", { d, class: "universeview-org-tie-line" }, g);
		if (t.directed) path.setAttribute("marker-end", `url(#universeview-org-arrow-${t.tone})`);
		const span = t.from || t.to ? formatSpan(t.from, t.to, this.cal()) : "";
		const an = idx.get(t.a)?.name ?? t.a;
		const bn = idx.get(t.b)?.name ?? t.b;
		const tip = `${an} → ${bn}: ${t.label}${span ? `\n${span}` : ""}`;
		svg("title", {}, g).textContent = tip;
		// The label sits on top of everything, so it stays readable where lines cross cards.
		const pill = svg("g", { class: `universeview-org-pill ${cls} tone-${t.tone}`, transform: `translate(${mx},${my})`, "data-a": t.a, "data-b": t.b }, pills);
		const text = t.directed ? `${t.label} →` : t.label;
		const w = Math.max(30, text.length * 6.1 + 14);
		// Slide along until the label is clear of the cards and the other labels.
		const clear = (y: number) => !this.taken.some((r) => mx + w / 2 + 3 > r.x && mx - w / 2 - 3 < r.x + r.w && y + 12 > r.y && y - 12 < r.y + r.h);
		const tries = [0, 20, -20, 40, -40, 60, -60, 80, -80];
		const dy = tries.find((d) => clear(my + d)) ?? 0;
		my += dy;
		pill.setAttribute("transform", `translate(${mx},${my})`);
		this.taken.push({ x: mx - w / 2, y: my - 9, w, h: 18 });
		svg("rect", { x: -w / 2, y: -9, width: w, height: 18, rx: 9, class: "universeview-org-pill-bg" }, pill);
		const tx = svg("text", { x: 0, y: 4, "text-anchor": "middle", class: "universeview-org-pill-text" }, pill);
		tx.textContent = text;
		svg("title", {}, pill).textContent = tip;
		const focus = (on: boolean) => {
			this.root.toggleClass("is-focusing", on);
			for (const n of this.layer.querySelectorAll(`[data-a="${CSS.escape(t.a)}"][data-b="${CSS.escape(t.b)}"]`)) n.classList.toggle("is-hl", on);
			this.layer.querySelectorAll(`[data-key="${CSS.escape(t.a)}"], [data-key="${CSS.escape(t.b)}"]`).forEach((n) => n.classList.toggle("is-hl", on));
		};
		for (const h of [g, pill]) {
			h.addEventListener("mouseenter", () => focus(true));
			h.addEventListener("mouseleave", () => focus(false));
			h.addEventListener("click", (evt) => {
				if (!this.pz.justPanned) openEntity(this.plugin, t.a, evt);
			});
		}
	}

	/** Which kinds of tie are on the chart; click one to hide or show it. */
	private drawLegend(tones: Set<RelTone>) {
		const box = this.legendEl;
		box.empty();
		box.toggleClass("is-empty", !tones.size);
		if (!tones.size) return;
		el("div", { cls: "universeview-org-legend-title", text: "Relationships" }, box);
		const hidden = new Set(this.options.hiddenTones ?? []);
		for (const tone of Object.keys(TONE_NAMES) as RelTone[]) {
			if (!tones.has(tone)) continue;
			const row = el("button", { cls: `universeview-org-legend-row tone-${tone}` + (hidden.has(tone) ? " is-off" : ""), attr: { "aria-pressed": String(!hidden.has(tone)), title: hidden.has(tone) ? "Show these" : "Hide these" } }, box);
			const sw = svg("svg", { width: 26, height: 10, class: "universeview-org-legend-swatch" }, row);
			svg("line", { x1: 1, y1: 5, x2: 25, y2: 5, class: "universeview-org-tie-line" }, sw);
			el("span", { text: TONE_NAMES[tone] }, row);
			row.addEventListener("click", () => {
				const next = new Set(this.options.hiddenTones ?? []);
				if (next.has(tone)) next.delete(tone);
				else next.add(tone);
				this.options.hiddenTones = [...next];
				this.onOptionsChange?.();
				this.refresh();
			});
		}
	}

	private drawCard(parent: SVGGElement, n: OrgNode) {
		const o = n.org;
		const cal = this.cal();
		const idx = this.plugin.index;
		const color = o.color ?? cultureColor(this.plugin, o.key);
		const g = svg("g", { class: "universeview-org-card" + (n.depth === 0 ? " is-top" : ""), transform: `translate(${n.x},${n.y})`, "data-key": o.key }, parent);
		g.setAttribute("style", `--item-color: ${color}; --i: ${this.nodes.indexOf(n) % 20}`);
		svg("rect", { x: 0, y: 0, width: CARD_W, height: n.h, rx: 6, class: "universeview-org-card-bg" }, g);
		svg("rect", { x: 0, y: 0, width: CARD_W, height: 3, rx: 1.5, class: "universeview-org-card-band" }, g);

		// The logo area: the group's sigil, or a monogram with a prompt to add one.
		const logoBox = svg("g", { class: "universeview-org-logo-box", transform: `translate(14,${(HEAD_H - LOGO) / 2 + 3})` }, g);
		svg("rect", { x: 0, y: 0, width: LOGO, height: LOGO, rx: 6, class: "universeview-org-logo-bg" }, logoBox);
		const logo = resourceUrl(this.plugin, o.logo ?? o.image);
		if (logo) {
			svg("image", { href: logo, x: 0, y: 0, width: LOGO, height: LOGO, preserveAspectRatio: "xMidYMid meet", "clip-path": "url(#universeview-org-logo-clip)", class: "universeview-org-logo" }, logoBox);
		} else {
			logoBox.classList.add("is-empty");
			const mono = svg("text", { x: LOGO / 2, y: LOGO / 2 + 7, "text-anchor": "middle", class: "universeview-org-monogram" }, logoBox);
			mono.textContent = monogram(o.name);
			const plus = svg("text", { x: LOGO / 2, y: LOGO / 2 + 6, "text-anchor": "middle", class: "universeview-org-logo-add" }, logoBox);
			plus.textContent = "+ logo";
		}
		svg("rect", { x: 0, y: 0, width: LOGO, height: LOGO, rx: 6, class: "universeview-org-logo-ring" }, logoBox);
		svg("title", {}, logoBox).textContent = logo ? `${o.name}'s logo: click to change it` : `Add a logo for ${o.name} (a sigil, crest or flag image)`;
		logoBox.addEventListener("click", (evt) => {
			evt.stopPropagation();
			if (!this.pz.justPanned) pickLogo(this.plugin, o.key);
		});

		const head = svg("g", { class: "universeview-org-head" }, g);
		svg("rect", { x: LOGO + 20, y: 8, width: CARD_W - LOGO - 28, height: HEAD_H - 10, fill: "transparent" }, head);
		const tx = LOGO + 26;
		const name = svg("text", { x: tx, y: 33, class: "universeview-org-name" }, head);
		name.textContent = clip(o.name, 21);
		const sub: string[] = [];
		// In the realm tree a land and its ruler are different things: say which this is (a land is a place; its ruling realm is a group).
		if ((this.options.mode ?? "realms") === "realms") sub.push(o.type === "place" ? "Place" : "Realm");
		if (o.category && o.category.toLowerCase() !== sub[0]?.toLowerCase()) sub.push(o.category.charAt(0).toUpperCase() + o.category.slice(1));
		const span = formatSpan(o.start, o.end, cal);
		if (span) sub.push(span);
		// On a chosen date, whoever is occupying it says more than how long it lasted.
		const at = this.options.at;
		const occupier = at === undefined ? undefined : occupationsAt(idx, at).find((x) => x.land.key === o.key);
		if (occupier) sub.splice(0, sub.length, `Occupied by ${occupier.by.name}`);
		const subEl = svg("text", { x: tx, y: 51, class: "universeview-org-sub" }, head);
		subEl.textContent = clip(sub.join(" · "), 30);
		const total = idx.members(o.key).filter((m) => idx.get(m.key)?.type === "person").length;
		const kids = n.children.length + (n.folded ?? 0);
		const mode = this.options.mode ?? "realms";
		const stats: string[] = [];
		const node = this.realmTree?.nodes.get(o.key);
		if (mode === "realms" && node) {
			// Who holds it, even when they have no note yet.
			if (node.holder && !node.holder.resolved) stats.push(node.holder.name);
			if (node.house) stats.push(node.house.name);
			if (kids) stats.push(!n.folded && n.children.every((c) => c.org.type === "place") ? `${kids} ${kids === 1 ? "place" : "places"} within` : `${kids} ${kids === 1 ? relOne("vassals") : relLabel("vassals").toLowerCase()}`);
		} else {
			if (total) stats.push(`${total} member${total === 1 ? "" : "s"}`);
			if (kids) stats.push(mode === "dynasties" ? `${kids} cadet branch${kids === 1 ? "" : "es"}` : `${kids} branch${kids === 1 ? "" : "es"}`);
		}
		if (stats.length) {
			const st = svg("text", { x: tx, y: 67, class: "universeview-org-stats" }, head);
			st.textContent = stats.join(" · ");
		}
		const title = svg("title", {}, head);
		title.textContent = `${o.name}${span ? `\n${span}` : ""}\nDouble-click to put it at the top`;
		head.addEventListener("click", (evt) => {
			if (!this.pz.justPanned) openEntity(this.plugin, o.key, evt);
		});
		head.addEventListener("dblclick", (evt) => {
			evt.preventDefault();
			this.onReroot?.(o.key);
		});
		g.addEventListener("mouseenter", () => this.focusCard(o.key, true));
		g.addEventListener("mouseleave", () => this.focusCard(o.key, false));
		g.addEventListener("contextmenu", (evt) => {
			if ((evt.target as Element).closest(".universeview-org-row")) return;
			evt.preventDefault();
			showEntityMenu(this.plugin, o.key, evt, {
				extra: (menu) => {
					menu.addItem((i) => i.setTitle("Put at the top of the chart").setIcon("arrow-up-to-line").onClick(() => this.onReroot?.(o.key)));
					menu.addItem((i) => i.setTitle(logo ? "Change the logo…" : "Add a logo…").setIcon("image").onClick(() => pickLogo(this.plugin, o.key)));
					menu.addItem((i) => i.setTitle("Add a member…").setIcon("user-plus").onClick(() => this.plugin.createEntityPrompt({ type: "person", cultures: [o.name] })));
					menu.addItem((i) => i.setTitle("Add a branch…").setIcon("git-branch-plus").onClick(() => this.plugin.createEntityPrompt({ type: "culture", parentCultures: [o.name] })));
				},
			});
		});
		bindHover(this.plugin, head, o.key, this.hoverParent);

		// Under the card: folds its branches away, or shows how many are folded.
		if (kids) {
			const fold = svg("g", { class: "universeview-org-fold" + (n.folded ? " is-folded" : ""), transform: `translate(${CARD_W / 2},${n.h})` }, g);
			svg("rect", { x: -13, y: -9, width: 26, height: 18, rx: 9, class: "universeview-org-fold-bg" }, fold);
			svg("text", { x: 0, y: 4, "text-anchor": "middle", class: "universeview-org-fold-text" }, fold).textContent = n.folded ? `+${n.folded}` : "−";
			svg("title", {}, fold).textContent = n.folded ? `Show ${n.folded} branch${n.folded === 1 ? "" : "es"}` : "Fold these branches away";
			fold.addEventListener("click", (evt) => {
				evt.stopPropagation();
				if (!this.pz.justPanned) this.toggleFold(o.key);
			});
		}

		let y = HEAD_H;
		// Every tie to another group, including those not on the chart, as coloured chips.
		if (n.ties.length) {
			svg("line", { x1: 12, x2: CARD_W - 12, y1: y, y2: y, class: "universeview-org-divider" }, g);
			const row = svg("g", { class: "universeview-org-ties", transform: `translate(12,${y + 7})` }, g);
			let x = 0;
			const others = n.ties.map((t) => ({ t, other: idx.get(t.a === o.key ? t.b : t.a)! })).filter((x) => x.other);
			let shown = 0;
			for (const { t, other } of others) {
				const label = clip(other.name, 16);
				const w = label.length * 5.8 + 22;
				if (x + w > CARD_W - 50 && shown) break;
				const chip = svg("g", { class: `universeview-org-tie-chip tone-${t.tone}`, transform: `translate(${x},0)` }, row);
				svg("rect", { x: 0, y: 0, width: w, height: 15, rx: 7.5, class: "universeview-org-tie-chip-bg" }, chip);
				svg("circle", { cx: 8, cy: 7.5, r: 3.5, class: "universeview-org-tie-dot" }, chip);
				const ct = svg("text", { x: 15, y: 11, class: "universeview-org-tie-chip-text" }, chip);
				ct.textContent = label;
				// Seen from this card: its vassal is listed as "Vassals", its overlord as "Liege".
				svg("title", {}, chip).textContent = `${t.directed && t.b === o.key ? relLabel(t.kind, true) : t.label}: ${other.name}`;
				chip.addEventListener("click", (evt) => {
					evt.stopPropagation();
					if (!this.pz.justPanned) openEntity(this.plugin, other.key, evt);
				});
				bindHover(this.plugin, chip, other.key, this.hoverParent);
				x += w + 4;
				shown++;
			}
			if (shown < others.length) {
				const more = svg("text", { x: x + 2, y: 11, class: "universeview-org-more" }, row);
				more.textContent = `+${others.length - shown}`;
				svg("title", {}, more).textContent = others.slice(shown).map(({ t, other }) => `${t.directed && t.b === o.key ? relLabel(t.kind, true) : t.label}: ${other.name}`).join("\n");
			}
			y += TIES_H;
		}

		const shown = n.people.slice(0, MAX_ROWS);
		if (shown.length) svg("line", { x1: 12, x2: CARD_W - 12, y1: y, y2: y, class: "universeview-org-divider" }, g);
		shown.forEach((t, i) => {
			const ry = y + 6 + i * ROW_H;
			const list = this.rowAt.get(t.person.key) ?? [];
			list.push({ x: n.x, y: n.y + ry + (ROW_H - 2) / 2, card: o.key });
			this.rowAt.set(t.person.key, list);
			const row = svg("g", { class: "universeview-org-row" + (t.leader ? " is-leader" : ""), transform: `translate(0,${ry})`, "data-person": t.person.key }, g);
			svg("rect", { x: 6, y: 0, width: CARD_W - 12, height: ROW_H - 2, rx: 5, class: "universeview-org-row-bg" }, row);
			const av = svg("g", { transform: `translate(22,${(ROW_H - 2) / 2})` }, row);
			const img = resourceUrl(this.plugin, t.person.image);
			svg("circle", { r: 8, class: "universeview-org-avatar", style: `--avatar: ${entityColor(this.plugin, t.person)}` }, av);
			if (img) svg("image", { href: img, x: -8, y: -8, width: 16, height: 16, "clip-path": "url(#universeview-org-avatar)", preserveAspectRatio: "xMidYMid slice" }, av);
			else if (t.leader) {
				const star = svg("text", { x: 0, y: 3.5, "text-anchor": "middle", class: "universeview-org-star" }, av);
				star.textContent = "★";
			}
			const nm = svg("text", { x: 36, y: 14, class: "universeview-org-person" }, row);
			nm.textContent = clip(t.person.name, t.role ? 19 : 30);
			if (t.role) {
				const role = svg("text", { x: CARD_W - 14, y: 14, "text-anchor": "end", class: "universeview-org-role" }, row);
				role.textContent = clip(t.role, 14);
			}
			const tt = svg("title", {}, row);
			tt.textContent = `${t.person.name}${t.role ? ` — ${t.role}` : ""}${t.from || t.to ? `\n${formatSpan(t.from, t.to, this.cal())}` : ""}`;
			row.addEventListener("click", (evt) => {
				if (!this.pz.justPanned) openEntity(this.plugin, t.person.key, evt);
			});
			row.addEventListener("contextmenu", (evt) => {
				evt.preventDefault();
				showEntityMenu(this.plugin, t.person.key, evt);
			});
			bindHover(this.plugin, row, t.person.key, this.hoverParent);
		});
		if (n.people.length > MAX_ROWS) {
			const more = svg("text", { x: CARD_W / 2, y: y + 6 + MAX_ROWS * ROW_H + 13, "text-anchor": "middle", class: "universeview-org-more" }, g);
			more.textContent = `+ ${n.people.length - MAX_ROWS} more (open the note or the timeline below)`;
		}
	}

	/** Hovering a card brings out its relationships and fades the rest. */
	private focusCard(key: string, on: boolean) {
		const ties = this.layer.querySelectorAll(`.universeview-org-tie[data-a="${CSS.escape(key)}"], .universeview-org-tie[data-b="${CSS.escape(key)}"], .universeview-org-pill[data-a="${CSS.escape(key)}"], .universeview-org-pill[data-b="${CSS.escape(key)}"]`);
		if (!ties.length) return;
		this.root.toggleClass("is-focusing", on);
		ties.forEach((n) => n.classList.toggle("is-hl", on));
	}

	/** One lane per organisation and per role-holder, with a cursor at the chosen day. */
	private drawTimeline() {
		const box = this.timelineEl;
		box.empty();
		if ((!this.options.timeline && this.options.layout !== "time") || !this.nodes.length) return;
		const cal = this.cal();
		type Lane = { key: string; label: string; sub?: string; a?: number; b?: number; org: boolean; leader?: boolean; color: string; indent: number; dashed?: boolean; open?: boolean };
		const lanes: Lane[] = [];
		let min = Infinity;
		let max = -Infinity;
		const note = (d?: number) => {
			if (d === undefined || !Number.isFinite(d)) return;
			min = Math.min(min, d);
			max = Math.max(max, d);
		};
		// Lanes for all role-holders in the period, not just those active on the chosen day.
		for (const n of this.nodes) {
			const o = n.org;
			const color = o.color ?? cultureColor(this.plugin, o.key);
			lanes.push({ key: o.key, label: o.name, a: o.start?.start, b: o.end?.end ?? this.plugin.openEndOf(o), org: true, color, indent: n.depth, open: !o.end });
			note(o.start?.start);
			note(o.end?.end);
			if (!this.options.members) continue;
			for (const t of tenures(this.plugin, o)) {
				const a = t.from?.start ?? t.person.start?.start;
				const b = t.to?.end ?? t.person.end?.end;
				note(a);
				note(b);
				lanes.push({ key: t.person.key, label: t.person.name, sub: t.role, a, b, org: false, leader: t.leader, color, indent: n.depth, dashed: !t.from && !t.to });
			}
		}
		if (!Number.isFinite(min)) {
			el("div", { cls: "universeview-org-timeline-empty", text: "No dates yet. Give organisations `founded:`/`dissolved:` and memberships `from:`/`to:` to see who held which role when." }, box);
			return;
		}
		if (max <= min) max = min + 365 * 10;
		const pad = (max - min) * 0.04;
		min -= pad;
		max += pad;
		const LABEL = 190;
		const LANE = 20;
		const AXIS = 26;
		const width = Math.max(420, box.clientWidth - 4);
		const plotW = width - LABEL - 16;
		const x = (d: number) => LABEL + ((d - min) / (max - min)) * plotW;
		const height = AXIS + lanes.length * LANE + 8;
		const s = svg("svg", { width, height, class: "universeview-org-tl" }, box);
		const axis = svg("g", { class: "universeview-lineage-axis" }, s);
		const yearPx = (plotW / (max - min)) * 365.25;
		const nice = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000];
		const step = nice.find((st) => st * yearPx >= 64) ?? 10000;
		const ticks = yearTicks(cal, cal.fromDays(min).y, cal.fromDays(max).y, step, step * 5)
			.map((t) => ({ ...t, x: x(cal.toDays(t.year, 1, 1)), label: cal.formatYear(t.year) }))
			.filter((t) => t.x >= LABEL && t.x <= width);
		const labelled = spacedLabels(ticks);
		for (const tk of ticks) {
			svg("line", { x1: tk.x, x2: tk.x, y1: AXIS - 4, y2: height, class: "universeview-lineage-grid" + (tk.era ? " is-era" : "") }, axis);
			if (!labelled.has(tk)) continue;
			const t = svg("text", { x: tk.x, y: AXIS - 9, "text-anchor": "middle", class: "universeview-lineage-tick" }, axis);
			t.textContent = tk.label;
		}
		lanes.forEach((l, i) => {
			const y = AXIS + i * LANE;
			const g = svg("g", { class: "universeview-org-lane" + (l.org ? " is-org" : "") + (l.leader ? " is-leader" : ""), "data-key": l.key }, s);
			g.setAttribute("style", `--item-color: ${l.color}`);
			if (i % 2 === 0) svg("rect", { x: 0, y, width, height: LANE, class: "universeview-org-lane-bg" }, g);
			const label = svg("text", { x: 8 + l.indent * 10 + (l.org ? 0 : 12), y: y + 14, class: "universeview-org-lane-label" }, g);
			label.textContent = clip(l.label + (l.sub ? ` · ${l.sub}` : ""), l.org ? 26 : 24);
			const a = l.a ?? min + pad;
			const b = l.b ?? max - pad * 0.5;
			const bar = svg("rect", {
				x: x(a), y: y + (l.org ? 4 : 6), width: Math.max(4, x(b) - x(a)), height: l.org ? 12 : 8, rx: l.org ? 4 : 4,
				class: "universeview-org-bar" + (l.b === undefined || l.open ? " is-ongoing" : "") + (l.dashed ? " is-undated" : ""),
			}, g);
			const tt = svg("title", {}, bar);
			tt.textContent = `${l.label}${l.sub ? ` — ${l.sub}` : ""}\n${l.a !== undefined || l.b !== undefined ? formatSpan(l.a !== undefined ? dayDate(l.a, cal.id) : undefined, l.b !== undefined ? dayDate(l.b, cal.id) : undefined, cal) : "undated"}`;
			g.addEventListener("click", (evt) => openEntity(this.plugin, l.key, evt));
			g.addEventListener("mouseenter", () => this.highlight(l.key, true));
			g.addEventListener("mouseleave", () => this.highlight(l.key, false));
			bindHover(this.plugin, label, l.key, this.hoverParent);
		});
		// The chosen day, and picking one by clicking the axis.
		this.cursor = (at: number | undefined) => {
			s.querySelector(".universeview-org-cursor")?.remove();
			if (at === undefined) return;
			const cx = x(at);
			svg("line", { x1: cx, x2: cx, y1: AXIS - 6, y2: height, class: "universeview-org-cursor" }, s);
		};
		this.cursor(this.options.at);
		const hit = svg("rect", { x: LABEL, y: 0, width: plotW, height: AXIS, class: "universeview-org-axis-hit" }, s);
		const tip = svg("title", {}, hit);
		tip.textContent = "Click to see the organisation on that date (Esc or the Time button for all time)";
		hit.addEventListener("click", (evt) => {
			const r = s.getBoundingClientRect();
			const day = min + ((evt.clientX - r.left - LABEL) / plotW) * (max - min);
			this.onTimeChange?.(Math.round(day));
		});
	}

	private highlight(key: string, on: boolean) {
		this.layer.querySelectorAll(`[data-key="${CSS.escape(key)}"]`).forEach((n) => n.classList.toggle("is-hl", on));
		this.layer.querySelectorAll(".universeview-org-row").forEach((r) => {
			const t = r.querySelector("title")?.textContent ?? "";
			const p = this.plugin.index.get(key);
			if (p?.type === "person") r.classList.toggle("is-hl", on && t.startsWith(p.name));
		});
	}
}

/** Up to two initials for a logo placeholder ("House of Tudor" → "HT"). */
/** What a title's holder is called on its card: the property that names them ("Lord", "Holder"). */
function holderRole(org: Entity, person: string): string {
	const kinds = ["holder", "owner", "lord", "lady", "ruler", "leader", "head"];
	const mine = org.relations.filter((r) => r.ref.key === person && r.kind);
	const kind = kinds.find((k) => mine.some((r) => r.kind === k)) ?? "holder";
	return kind.charAt(0).toUpperCase() + kind.slice(1);
}

function monogram(name: string): string {
	const words = name.replace(/\b(the|of|and|de|von|van|du|la|le)\b/gi, " ").split(/\s+/).filter(Boolean);
	return (words.length > 1 ? words[0][0] + words[words.length - 1][0] : (words[0] ?? "?").slice(0, 2)).toUpperCase();
}

function clip(s: string, n: number): string {
	return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;
}

function dayDate(day: number, calendar: string): ChronDate {
	return { start: day, end: day, precision: "year", approx: false, calendar, raw: "" };
}
