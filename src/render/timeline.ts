import { Menu, TFile } from "obsidian";
import type ChroniclePlugin from "../main";
import { buildFieldAliases } from "../settings";
import type { Entity, EntityFilter } from "../types";
import { Calendar, yearTicks } from "../dates/calendars";
import { formatDate, formatDay, formatSpan } from "../dates/parser";
import { rangeOf } from "../index/EntityIndex";
import { chainOf, holdingsOf } from "../index/realms";
import { renamings } from "../index/renames";
import { fitRange } from "./layout";
import { bindHover, cssNumber, el, emptyState, entityColor, glyph, icon, iconButton, openEntity, resourceUrl, showEntityMenu, svgMarkup, TYPE_ICONS, typeColorVar } from "./common";
import { GROUP_KINDS, groupKind } from "./houses";
import { battlesOf, eventCategories, isBattle, namedAsWar, occupationsByLand, sidesOf, warOf } from "../index/wars";
import { causePath, packRows, rowLayout, stackLevels, type Box, type TimeRange } from "./timelinerows";
import { dragToReorder } from "../ui/cardlayout";
import { KIND_LABELS, categoryColor, categoryOf, shapeFor, type ItemKind, type ItemShape } from "./categories";
import { historyOf, writtenReigns, type HistoryKind, type HistoryMark } from "./history";
import { markIcon, markKey } from "./markkey";

export type TimelineGroup = "none" | "category" | "realm" | "culture" | "place" | "person" | "tag" | "type";

export interface TimelineOptions {
	filter: EntityFilter;
	group: TimelineGroup;
	lifespans: boolean;
	lifeEvents: boolean;
	cultures: boolean;
	/** Places and titles with a founding date (provinces, towns, forts), as spans. */
	places?: boolean;
	calendar?: string;
	focus?: string;
	/** Story notes (with a story-date:) as points among the events. */
	scenes?: boolean;
	/** Shaded bands for the calendar's eras and for era, age, reign and war notes. */
	eras?: boolean;
	/** Fog of war: only what this person knows about in their lifetime. */
	pov?: string;
	/** Arrows from events to what they led to (`caused-by:` / `led-to:`). */
	causes?: boolean;
	/** Renamings (`names:`) as points: "New Amsterdam becomes New York". */
	renames?: boolean;
	/** Each holder's time holding a title (`holders:`), as spans. */
	reigns?: boolean;
	/** Lands held for a while by someone else (`occupied:`). */
	occupations?: boolean;
	/** Categories left off the timeline (see categoryOf): "battle", "kind:person"… */
	hiddenCategories?: string[];
	/** The lanes in the order they were dragged into, for each way of grouping. */
	laneOrder?: Partial<Record<TimelineGroup, string[]>>;
	/** How tall the rows are, as a multiple of the row height in settings. */
	rowZoom?: number;
}


export const DEFAULT_TIMELINE_OPTIONS: TimelineOptions = {
	filter: {},
	group: "category",
	lifespans: true,
	lifeEvents: false,
	cultures: true,
	places: true,
	eras: true,
};

/** Kinds of event note drawn as a band behind the timeline. */
export const ERA_KINDS = new Set(["era", "age", "epoch", "period", "reign", "dynasty", "war", "golden age", "dark age"]);


interface Item {
	id: string;
	key: string;
	label: string;
	start: number;
	end: number;
	point: boolean;
	approx: boolean;
	color: string;
	kind: ItemKind;
	importance: number;
	dateText: string;
	entity: Entity;
	/** No end yet: drawn up to the current date, fading out. */
	open?: boolean;
	/** A reign's title (the item itself is the holder): the realm lane it belongs in. */
	context?: string;
	/** A nation's dates and members, beside its name. */
	meta?: string;
	/** On a nation's bar: what happened to it, as marks along it. */
	marks?: HistoryMark[];
}


interface Placed {
	item: Item;
	row: number;
	x1: number;
	x2: number;
	labelInside: boolean;
	/** Zoomed out past the layout, there's no room for its label beside the next thing in its row. */
	noLabel?: boolean;
	/** Points too close to tell apart at this zoom, shown as one marker with a count. */
	cluster?: Item[];
}

interface Lane {
	id: string;
	label: string;
	items: Item[];
	placed: Placed[];
	rows: number;
	first: number;
}


/**
 * A zoomable horizontal timeline. Coordinates are universal days; the axis is labelled
 * in the chosen calendar, so fantasy calendars and BCE dates work the same way.
 */
export class TimelineRenderer {
	private root: HTMLElement;
	private axisEl: HTMLElement;
	private bodyEl: HTMLElement;
	private gridEl: HTMLElement;
	private lanesEl: HTMLElement;
	private cursorEl: HTMLElement;
	private cursorLabel: HTMLElement;
	private items: Item[] = [];
	private viewStart = 0;
	private pxPerDay = 1;
	private width = 800;
	private frame = 0;
	private measureCtx: CanvasRenderingContext2D | null = null;
	private measureCache = new Map<string, number>();
	private resizeObs: ResizeObserver;
	private hasFitted = false;
	/** Until the user pans or zooms, the view keeps fitting the data as the pane resizes. */
	private userMoved = false;
	private highlight?: string;
	private drag: { x: number; start: number; moved: boolean; id: number } | null = null;
	/** An event was just dragged to a new date (so the click that ends the drag doesn't open it). */
	private itemMoved = false;
	/** Each lane's rows, worked out once from the data, not the zoom. */
	private rowsByLane = new Map<string, { rows: Map<string, number>; count: number }>();
	private layoutScale = 1;
	private pendingScroll?: number;
	/** Where to look once the view has its width and rows. */
	private pendingCenter?: number;
	private pendingKey?: string;

	constructor(
		private container: HTMLElement,
		private plugin: ChroniclePlugin,
		public options: TimelineOptions,
		private embedded = false,
		private hoverParent: { hoverPopover: unknown } | HTMLElement = container,
	) {
		this.root = el("div", { cls: "chronicle-timeline" + (embedded ? " is-embedded" : "") }, container);
		this.axisEl = el("div", { cls: "chronicle-tl-axis" }, this.root);
		this.bodyEl = el("div", { cls: "chronicle-tl-body" }, this.root);
		this.gridEl = el("div", { cls: "chronicle-tl-grid" }, this.bodyEl);
		this.lanesEl = el("div", { cls: "chronicle-tl-lanes" }, this.bodyEl);
		this.cursorEl = el("div", { cls: "chronicle-tl-cursor" }, this.root);
		this.cursorLabel = el("div", { cls: "chronicle-tl-cursor-label" }, this.root);
		if (embedded) this.addEmbedControls();
		this.bindEvents();
		this.resizeObs = new ResizeObserver(() => {
			const w = this.root.clientWidth;
			if (w && Math.abs(w - this.width) > 1) {
				const center = this.viewStart + this.width / 2 / this.pxPerDay;
				this.width = w;
				if (!this.userMoved) this.fit();
				else {
					this.viewStart = center - this.width / 2 / this.pxPerDay;
					this.schedule();
				}
			}
		});
		this.resizeObs.observe(this.root);
		this.refresh();
	}

	get calendar(): Calendar {
		return this.plugin.calendars.get(this.options.calendar ?? this.plugin.index.dominantCalendar(this.options.filter.folder));
	}

	destroy() {
		this.resizeObs.disconnect();
		cancelAnimationFrame(this.frame);
		this.root.remove();
	}

	/** Rebuilds items from the index (call when notes or options change). */
	refresh() {
		this.items = this.collectItems();
		this.width = this.root.clientWidth || this.width;
		this.rowsByLane.clear();
		this.layoutScale = this.fitScale(fitRange(this.items));
		// Ids carry their place in the list, which can shift: the card follows the same thing, updated.
		if (this.selected) {
			const base = this.selected.replace(/:\d+$/, "");
			this.select(this.items.find((i) => i.id.replace(/:\d+$/, "") === base)?.id);
		}
		if (this.options.focus) this.focusOn(this.options.focus);
		else if (!this.userMoved) this.fit();
		else this.schedule();
	}

	private eventCats: string[] = [];

	/** Every category on the timeline (for colours), sorted. */
	private catOrder: string[] = [];

	/** A category's colour on this timeline. */
	colorOf(id: string): string {
		return categoryColor(id, this.catOrder);
	}

	/** Every category on the timeline as it's filtered now (hidden ones too), with how many things are in each, commonest first. */
	categories(): { id: string; label: string; count: number }[] {
		const hidden = this.options.hiddenCategories;
		this.options.hiddenCategories = undefined;
		const items = this.collectItems();
		this.options.hiddenCategories = hidden;
		const out = new Map<string, { id: string; label: string; count: number }>();
		for (const it of items) {
			const [id, label] = this.categoryIn(it);
			const c = out.get(id) ?? { id, label, count: 0 };
			c.count++;
			out.set(id, c);
		}
		// Events' own categories first, then the other kinds of thing.
		return [...out.values()].sort((a, b) => Number(a.id.startsWith("kind:")) - Number(b.id.startsWith("kind:")) || b.count - a.count || a.label.localeCompare(b.label));
	}

	private collectItems(): Item[] {
		const { plugin, options } = this;
		const idx = plugin.index;
		const cal = this.calendar;
		const out: Item[] = [];
		const filter = options.filter;
		const add = (e: Entity, kind: ItemKind, start: number, end: number, point: boolean, approx: boolean, dateText: string, label = e.name) => {
			out.push({
				id: `${kind}:${e.key}`,
				key: e.key,
				label,
				start,
				end,
				point,
				approx,
				color: kind === "birth" || kind === "death" ? typeColorVar("person") : entityColor(plugin, e),
				kind,
				importance: e.importance,
				dateText,
				entity: e,
			});
		};
		// Spans with no end yet run to the current date (the "Current year"), fading out.
		const openTo = (e: Entity) => (e.openEnd || e.type !== "event" ? plugin.openEndOf(e) : undefined);
		const markOpen = (e: Entity, to: number | undefined) => {
			if (to !== undefined) out[out.length - 1].open = true;
			return to;
		};
		for (const e of idx.all("event")) {
			if (!e.start || !idx.matches(e, filter)) continue;
			const r = rangeOf(e)!;
			const to = openTo(e);
			const span = !!e.end || e.start.precision === "range" || to !== undefined;
			add(e, "event", span ? r[0] : e.start.start, to ?? (span ? r[1] : e.start.start), !span, e.start.approx || !!e.end?.approx, formatSpan(e.start, e.end, cal) + (to !== undefined ? " – now" : ""));
			markOpen(e, to);
		}
		const personFilter: EntityFilter = { ...filter, minImportance: undefined, types: undefined };
		if (options.lifespans || options.lifeEvents) {
			for (const p of idx.all("person")) {
				if (!idx.matches(p, personFilter)) continue;
				if (options.lifespans && (p.start || p.end)) {
					const r = rangeOf(p)!;
					const to = openTo(p);
					add(p, "person", r[0], to ?? r[1], to === undefined && r[0] === r[1], !!(p.start?.approx || p.end?.approx), formatSpan(p.start, p.end, cal) + (to !== undefined ? " – now" : ""));
					markOpen(p, to);
				} else if (options.lifeEvents) {
					if (p.start) add(p, "birth", p.start.start, p.start.start, true, p.start.approx, `Born ${formatDate(p.start, cal)}`, `${p.name} born`);
					if (p.end) add(p, "death", p.end.start, p.end.start, true, p.end.approx, `Died ${formatDate(p.end, cal)}`, `${p.name} dies`);
				}
			}
		}
		if (options.cultures) {
			for (const c of idx.all("culture")) {
				if (!(c.start || c.end) || !idx.matches(c, personFilter)) continue;
				const r = rangeOf(c)!;
				const to = openTo(c);
				add(c, "culture", r[0], to ?? r[1], to === undefined && r[0] === r[1], !!(c.start?.approx || c.end?.approx), formatSpan(c.start, c.end, cal) + (to !== undefined ? " – now" : ""));
				markOpen(c, to);
				const members = idx.members(c.key).length;
				out[out.length - 1].meta = [out[out.length - 1].dateText, members ? `${members} ${members === 1 ? "member" : "members"}` : ""].filter(Boolean).join(" · ");
			}
		}
		if (options.places) {
			for (const pl of idx.all("place")) {
				if (!(pl.start || pl.end) || !idx.matches(pl, personFilter)) continue;
				const r = rangeOf(pl)!;
				const to = openTo(pl);
				add(pl, "place", r[0], to ?? r[1], to === undefined && r[0] === r[1], !!(pl.start?.approx || pl.end?.approx), formatSpan(pl.start, pl.end, cal) + (to !== undefined ? " – now" : ""));
				markOpen(pl, to);
			}
		}
		// Holders of titles (`holders:`): each one's time holding it, as a span.
		for (const e of options.reigns === false ? [] : idx.all()) {
			if (!e.holders?.length || !idx.matches(e, personFilter)) continue;
			e.holders.forEach((h, i) => {
				const a = h.from?.start ?? e.start?.start;
				const next = e.holders![i + 1]?.from?.start;
				const b = h.to?.end ?? (next !== undefined ? next - 1 : plugin.openEndOf(e) ?? a);
				if (a === undefined || b === undefined) return;
				const who = (h.ref.resolved ? idx.get(h.ref.key) : undefined) ?? e;
				add(who, "reign", a, Math.max(a, b), a === b, false, `${h.ref.name} holds ${e.name}: ${formatSpan(h.from, h.to, cal)}`, `${h.ref.name} · ${e.name}`);
				out[out.length - 1].context = e.key;
			});
		}
		// Reigns written on the ruler (`reign: 1258 - 1291`), each heir following the last on the same title.
		if (options.reigns !== false) {
			for (const r of writtenReigns(plugin)) {
				if (!idx.matches(r.who, personFilter)) continue;
				add(r.who, "reign", r.from, r.to, r.from === r.to, r.approx, r.text, r.label);
				if (r.title) out[out.length - 1].context = r.title.key;
			}
		}
		// Occupations (`occupied:`): each land's time in someone else's hands, as a span in the land's lane.
		if (options.occupations !== false) {
			for (const [key, spans] of occupationsByLand(idx)) {
				for (const o of spans) {
					const land = idx.get(key) ?? o.event;
					const a = o.firstDay;
					const b = o.lastDay ?? plugin.openEndOf(land) ?? a;
					if (a === undefined || b === undefined || !idx.matches(o.event, personFilter)) continue;
					add(land, "occupation", a, Math.max(a, b), a === b, false, `${o.land.name} held by ${o.by.name}: ${formatSpan(o.from ?? o.event.start, o.to ?? o.event.end, cal)}, in ${o.event.name}`, `${o.land.name} held by ${o.by.name}`);
				}
			}
		}
		// Renamings (`names:`): "New Amsterdam becomes New York" on the day it happened.
		for (const e of options.renames === false ? [] : idx.all()) {
			if (!e.names?.length || e.type === "event" || !idx.matches(e, personFilter)) continue;
			for (const r of renamings(e)) {
				add(e, "rename", r.day, r.day, true, false, `Renamed ${formatDay(r.day, cal, "year")}`, r.before ? `${r.before} becomes ${r.name}` : `Named ${r.name}`);
			}
		}
		// Story notes (chapters, scenes, sessions with a `story-date:`) among the world's events.
		if (options.scenes !== false) {
			for (const s of idx.scenes) {
				if (filter.folder && !s.path.startsWith(filter.folder.replace(/\/$/, "") + "/")) continue;
				if (idx.get(s.path)?.type === "event") continue;
				const file = plugin.app.vault.getAbstractFileByPath(s.path);
				if (!file) continue;
				// Not a UniverseView note, so it stands in as a light event-shaped entry.
				const pseudo = { key: s.path, path: s.path, name: s.name, type: "event", importance: 3, cultures: [], places: s.places, participants: s.cast, tags: [], props: {} } as unknown as Entity;
				out.push({ id: `scene:${s.path}`, key: s.path, label: s.name, start: s.date.start, end: s.date.start, point: true, approx: s.date.approx, color: "var(--interactive-accent)", kind: "scene", importance: 3, dateText: `Story: ${formatDate(s.date, cal)}${s.flashback ? " (flashback)" : ""}`, entity: pseudo });
			}
		}
		// Fog of war: only what the chosen person ever learns about, up to their death.
		if (options.pov) {
			const known = plugin.knownTo(options.pov, idx.get(options.pov)?.end?.end);
			for (let i = out.length - 1; i >= 0; i--) if (!known.has(out[i].key)) out.splice(i, 1);
		}
		// Every category there is (hidden ones too), so each keeps the same colour however it's filtered.
		this.catOrder = [...new Set(out.map((it) => this.categoryIn(it)[0]))].sort();
		// Categories turned off in the Categories menu.
		const hidden = new Set(options.hiddenCategories ?? []);
		if (hidden.size) for (let i = out.length - 1; i >= 0; i--) if (hidden.has(this.categoryIn(out[i])[0])) out.splice(i, 1);
		// Organised by category, each takes its category's colour, so the kinds of event read at a glance.
		if (options.group === "category") for (const it of out) if (it.kind !== "culture") it.color = this.colorOf(this.categoryIn(it)[0]);
		this.eventCats = eventCategories(idx);
		this.attachMarks(out);
		// Index ids are per-kind, but life events produce two items per person.
		out.forEach((it, i) => (it.id += ":" + i));
		return out.sort((a, b) => a.start - b.start || b.importance - a.importance);
	}

	/** Filed by the note's own category, or for a battle or war with none, as what it plainly is. */
	private categoryIn(it: Item): [string, string] {
		const e = it.entity;
		return categoryOf(it.kind, e.category ?? (isBattle(e) ? "battle" : namedAsWar(e) ? "war" : undefined));
	}

	/**
	 * A nation's history goes on its bar, the same marks as the lineage, within what's switched on here.
	 * What has no bar here keeps a place of its own.
	 */
	private attachMarks(out: Item[]) {
		const { options, plugin } = this;
		const bars = new Map(out.filter((it) => (it.kind === "culture" || it.kind === "place") && !it.point).map((it) => [it.key, it]));
		const hidden = new Set(options.hiddenCategories ?? []);
		const shown = new Set(out.filter((it) => it.kind === "event").map((it) => it.key));
		const on: Record<HistoryKind, boolean> = { event: true, rename: options.renames !== false, reign: options.reigns !== false, occupation: options.occupations !== false };
		for (const bar of bars.values()) {
			bar.marks = historyOf(plugin, bar.entity, [bar.start, bar.end]).filter((m) => on[m.kind] && !hidden.has(m.categoryId) && (m.kind !== "event" || shown.has(m.key)));
		}
		for (let i = out.length - 1; i >= 0; i--) {
			const it = out[i];
			const host = it.kind === "reign" ? it.context : it.kind === "rename" || it.kind === "occupation" ? it.key : undefined;
			if (host && bars.has(host)) out.splice(i, 1);
		}
	}

	private warOf(it: Item): "war" | "battle" | undefined {
		return it.kind !== "event" ? undefined : isBattle(it.entity) ? "battle" : namedAsWar(it.entity) ? "war" : undefined;
	}

	private shapeIn(it: Item): ItemShape {
		return shapeFor(it.kind, this.categoryIn(it)[0], this.warOf(it), this.eventCats);
	}

	private groupsOf(it: Item): [string, string][] {
		const e = it.entity;
		switch (this.options.group) {
			case "none":
				return [["", ""]];
			case "category":
				return [this.categoryIn(it)];
			case "realm": {
				// The realm a title, its people and its events belong to: the highest title someone holds.
				const tree = this.plugin.realms();
				const realmOf = (k: string): [string, string] | undefined => {
					if (!tree.nodes.has(k)) return undefined;
					const chain = chainOf(tree, k);
					const top = chain.find((c) => tree.nodes.get(c)?.holder) ?? chain[0];
					return [top, this.plugin.index.get(top)?.name ?? top];
				};
				// A reign belongs with the title held, not wherever its holder lived.
				if (it.kind === "reign" && it.context) {
					const r = realmOf(it.context);
					if (r) return [r];
				}
				// Its own title, what it (or its house) holds, its groups, where an event happened, and for
				// battles and wars each side that fought and the lands that changed hands.
				const groups = e.cultures.map((c) => c.ref.key);
				const sides = sidesOf(this.plugin.index, e).map((s) => s.party.key);
				const lands = (e.transfers ?? []).flatMap((t) => [t.land.key, t.from?.key, t.to?.key]).filter((k): k is string => !!k);
				const keys = [e.key, ...holdingsOf(tree, e.key), ...groups, ...groups.flatMap((g) => holdingsOf(tree, g)), ...(e.type === "event" ? e.places.map((p) => p.key) : []), ...sides, ...sides.flatMap((s) => holdingsOf(tree, s)), ...lands];
				const found = new Map<string, string>();
				for (const k of keys) {
					const r = realmOf(k);
					if (r) found.set(r[0], r[1]);
				}
				return found.size ? [...found] : [["~", "No realm"]];
			}
			case "type":
				return [[it.kind === "death" ? "birth" : it.kind, KIND_LABELS[it.kind]]];
			case "culture": {
				if (e.type === "culture") return [[e.key, e.name]];
				const cs = e.cultures.map((c) => [c.ref.key, c.ref.name] as [string, string]);
				return cs.length ? cs : [["~", "No culture"]];
			}
			case "place": {
				const ps = e.places.map((p) => [p.key, p.name] as [string, string]);
				return ps.length ? ps : [["~", "No place"]];
			}
			case "person": {
				if (e.type === "person") return [[e.key, e.name]];
				const ps = e.participants.map((p) => [p.key, p.name] as [string, string]);
				return ps.length ? ps : [["~", "No participants"]];
			}
			case "tag": {
				const ts = [...new Set(e.tags.map((t) => t.split("/")[0]))].map((t) => [t, "#" + t] as [string, string]);
				return ts.length ? ts : [["~", "Untagged"]];
			}
		}
	}

	// ---- View transform --------------------------------------------------------------------

	/**
	 * Frames the timeline. By default on where most things happen: a lone date thousands of years
	 * away (a creation myth before a world's history) would squeeze everything else into a sliver.
	 * `everything` frames it all, outliers included (the Fit button).
	 */
	fit(everything = false) {
		this.userMoved = false;
		this.width = this.root.clientWidth || this.width;
		if (!this.items.length) {
			this.hasFitted = this.width > 0;
			this.schedule();
			return;
		}
		let [min, max] = everything ? [Infinity, -Infinity] : fitRange(this.items);
		if (everything) {
			for (const it of this.items) {
				min = Math.min(min, it.start);
				max = Math.max(max, it.end);
			}
		}
		const span = Math.max(max - min, 0) < 60 ? 365 : max - min;
		this.pxPerDay = this.fitScale([min, max]);
		this.viewStart = min - span * 0.06;
		if (max - min < 60) this.viewStart = (min + max) / 2 - this.width / 2 / this.pxPerDay;
		this.hasFitted = this.width > 0;
		this.schedule();
	}

	/** The scale that frames a range of days. */
	private fitScale([min, max]: [number, number]): number {
		const span = !(max - min >= 60) ? 365 : max - min;
		const labelPad = Math.min(160, this.width * 0.3);
		return Math.max(1e-6, (this.width - labelPad) / (span * 1.12));
	}

	// ---- The picked item's card ---------------------------------------------------------------------

	private selected?: string;
	private cardEl?: HTMLElement;

	/** Picks an item (by its id): it's lit on the timeline and its card shows on the right. */
	select(id: string | undefined) {
		this.selected = id;
		this.cardEl?.remove();
		this.cardEl = undefined;
		const it = id ? this.items.find((i) => i.id === id) : undefined;
		if (it) this.cardEl = this.renderCard(it);
		this.root.toggleClass("has-card", !!this.cardEl);
		this.schedule();
	}

	private renderCard(it: Item): HTMLElement {
		const p = this.plugin;
		const idx = p.index;
		const e = it.entity;
		const card = el("div", { cls: "uv-tl-card" }, this.root);
		card.style.setProperty("--item-color", it.color);
		card.addEventListener("pointerdown", (evt) => evt.stopPropagation());
		card.addEventListener("wheel", (evt) => evt.stopPropagation());
		const head = el("div", { cls: "uv-tl-card-head" }, card);
		icon(el("span", { cls: "uv-tl-card-icon" }, head), isBattle(e) ? "swords" : TYPE_ICONS[e.type] ?? "circle");
		const title = el("div", { cls: "uv-tl-card-title" }, head);
		const name = el("a", { text: it.label }, title);
		name.addEventListener("click", (evt) => openEntity(p, it.key, evt));
		el("div", { cls: "uv-tl-card-kind", text: [KIND_LABELS[it.kind].replace(/s$/, ""), e.category].filter(Boolean).join(" · ") }, title);
		const close = el("button", { cls: "clickable-icon", attr: { "aria-label": "Close" } }, head);
		icon(close, "x");
		close.addEventListener("click", () => this.select(undefined));
		el("div", { cls: "uv-tl-card-date", text: it.dateText }, card);
		if (it.start !== it.end) {
			const years = Math.round((it.end - it.start) / 365.25);
			if (years >= 1) el("div", { cls: "uv-tl-card-sub", text: `${years} year${years === 1 ? "" : "s"}${it.open ? ", and still going" : ""}` }, card);
		}
		if (e.summary) el("p", { cls: "uv-tl-card-summary", text: e.summary }, card);
		// Its people, places and groups; each one picks that one on the timeline if it's there.
		const rows: [string, { key: string; name: string }[]][] = [
			["People", e.participants.map((r) => ({ key: r.key, name: r.name }))],
			["Where", e.places.map((r) => ({ key: r.key, name: r.name }))],
			["Groups", e.cultures.map((c) => ({ key: c.ref.key, name: c.ref.name }))],
			["Sides", sidesOf(idx, e).map((s) => ({ key: s.party.key, name: `${s.party.name}${s.outcome ? ` (${s.outcome})` : ""}` }))],
		];
		const war = warOf(idx, e);
		if (war) rows.push(["War", [{ key: war.key, name: war.name }]]);
		if (e.type === "event" && !isBattle(e)) rows.push(["Battles", battlesOf(idx, e).map((b) => ({ key: b.key, name: b.name }))]);
		for (const [label, list] of rows) {
			if (!list.length) continue;
			const row = el("div", { cls: "uv-tl-card-row" }, card);
			el("span", { cls: "uv-tl-card-label", text: label }, row);
			const chips = el("span", { cls: "uv-tl-card-chips" }, row);
			for (const x of list.slice(0, 8)) {
				const a = el("a", { cls: "uv-tl-card-chip", text: x.name }, chips);
				a.addEventListener("click", (evt) => {
					const there = this.items.find((i) => i.key === x.key && (i.kind === "event" || i.kind === "person" || i.kind === "culture" || i.kind === "place"));
					if (there && !evt.ctrlKey && !evt.metaKey) {
						this.focusOn(x.key);
						this.select(there.id);
					} else openEntity(p, x.key, evt);
				});
				bindHover(p, a, x.key, this.hoverParent);
			}
			if (list.length > 8) el("span", { cls: "uv-tl-card-sub", text: ` +${list.length - 8}` }, chips);
		}
		const actions = el("div", { cls: "uv-tl-card-actions" }, card);
		const act = (ic: string, text: string, run: () => void, cls = "") => {
			const b = el("button", { cls }, actions);
			icon(el("span", {}, b), ic);
			el("span", { text }, b);
			b.addEventListener("click", run);
		};
		if (it.kind !== "scene" || idx.get(it.key)) {
			act("file-text", "Open", () => openEntity(p, it.key), "mod-cta");
			if (idx.get(it.key)) act("panel-right", "Inspect", () => void p.inspect(it.key));
			const onMap = e.places.length || e.coords || e.map || e.territories.length;
			if (onMap) act("map", "Map", () => void p.openMap(it.key));
		}
		act("crosshair", "Centre", () => this.focusOn(it.key));
		return card;
	}

	focusOn(key: string) {
		this.highlight = key;
		const it = this.items.find((i) => i.key === key);
		const e = this.plugin.index.get(key);
		const r = it ? [it.start, it.end] : e ? rangeOf(e) : null;
		if (!r) {
			this.fit();
			return;
		}
		this.width = this.root.clientWidth || this.width;
		const span = Math.max(r[1] - r[0], 365 * 20);
		this.pxPerDay = this.width / (span * 1.6);
		this.viewStart = (r[0] + r[1]) / 2 - this.width / 2 / this.pxPerDay;
		this.hasFitted = true;
		this.userMoved = true;
		this.options.focus = undefined;
		this.schedule();
		window.setTimeout(() => {
			const elx = this.lanesEl.querySelector(`[data-key="${CSS.escape(key)}"]`);
			elx?.scrollIntoView({ block: "center", inline: "nearest" });
		}, 50);
	}

	/** Whether the view has been moved from its fitted place. */
	get moved(): boolean {
		return this.userMoved;
	}

	/** What's in view, for the lineage to pick up. */
	get range(): TimeRange {
		const box = this.bodyEl.getBoundingClientRect();
		const middle = box.top + box.height / 2;
		let key: string | undefined;
		let nearest = Infinity;
		this.lanesEl.querySelectorAll<HTMLElement>(".chronicle-tl-item.is-nation").forEach((n) => {
			const r = n.getBoundingClientRect();
			const off = Math.abs(r.top + r.height / 2 - middle);
			if (off < nearest) [nearest, key] = [off, n.dataset.key];
		});
		return { center: this.viewStart + this.width / 2 / this.pxPerDay, scale: this.pxPerDay, key };
	}

	/** Shows the same years, at the same zoom, around the same nation. */
	showRange(r: TimeRange) {
		this.userMoved = true;
		this.pxPerDay = r.scale;
		this.pendingCenter = r.center;
		this.pendingKey = r.key;
		this.schedule();
	}

	zoom(factor: number, anchorX = this.width / 2) {
		this.userMoved = true;
		const day = this.viewStart + anchorX / this.pxPerDay;
		// Between one day per 4000px and ten millennia per pixel.
		this.pxPerDay = Math.min(4000, Math.max(1 / (365.25 * 10000), this.pxPerDay * factor));
		this.viewStart = day - anchorX / this.pxPerDay;
		this.schedule();
	}

	/** Taller or shorter rows, keeping what's under the pointer where it is. */
	zoomRows(factor: number, anchorY = this.bodyEl.clientHeight / 2) {
		const before = this.options.rowZoom ?? 1;
		const after = Math.min(3, Math.max(0.7, before * factor));
		if (after === before) return;
		this.options.rowZoom = after;
		this.pendingScroll = (this.bodyEl.scrollTop + anchorY) * (after / before) - anchorY;
		this.schedule();
	}

	private schedule() {
		cancelAnimationFrame(this.frame);
		this.frame = window.requestAnimationFrame(() => this.render());
	}

	private x(day: number): number {
		return (day - this.viewStart) * this.pxPerDay;
	}

	private measure(text: string): number {
		const cached = this.measureCache.get(text);
		if (cached !== undefined) return cached;
		if (!this.measureCtx) {
			this.measureCtx = createEl("canvas").getContext("2d");
			const cs = getComputedStyle(this.root);
			if (this.measureCtx) this.measureCtx.font = `${cssNumber(this.root, "--chronicle-tl-font-size", 12)}px ${cs.fontFamily}`;
		}
		const w = this.measureCtx ? this.measureCtx.measureText(text).width : text.length * 7;
		this.measureCache.set(text, w);
		return w;
	}

	// ---- Rendering --------------------------------------------------------------------------

	private render() {
		this.width = this.root.clientWidth || this.width;
		if (this.pendingCenter !== undefined && this.root.clientWidth) {
			this.viewStart = this.pendingCenter - this.width / 2 / this.pxPerDay;
			this.pendingCenter = undefined;
		}
		const rowH = cssNumber(this.root, "--chronicle-tl-row-height", 28) * (this.options.rowZoom ?? 1);
		this.renderAxis();

		const scrollTop = this.bodyEl.scrollTop;
		this.lanesEl.empty();
		if (!this.items.length) {
			this.lanesEl.addClass("is-empty");
			emptyState(
				this.lanesEl,
				"calendar-clock",
				"No dated events yet",
				"Add `type: event` and a `date:` property to a note, or create one here.",
				this.embedded ? undefined : { label: "New event", onClick: () => this.plugin.createEntityPrompt({ type: "event" }) },
			);
			return;
		}
		this.lanesEl.removeClass("is-empty");

		const lanes = this.buildLanes();
		const margin = 400;
		const grouped = this.options.group !== "none";
		for (const lane of lanes) {
			const laneEl = el("div", { cls: "chronicle-tl-lane" }, this.lanesEl);
			laneEl.dataset.lane = lane.id;
			if (grouped) {
				const head = el("div", { cls: "chronicle-tl-lane-label" }, laneEl);
				if (!this.embedded) this.makeMovable(head, laneEl, lanes);
				// By category, each lane's name carries its category's colour.
				if (this.options.group === "category") {
					head.addClass("is-category");
					head.style.setProperty("--uv-cat-color", this.colorOf(lane.id));
				}
				const ent = this.plugin.index.get(lane.id);
				const name = el("span", { cls: "chronicle-tl-lane-name", text: lane.label }, head);
				if (ent) {
					name.addClass("is-link");
					name.addEventListener("click", (evt) => openEntity(this.plugin, ent.key, evt));
					bindHover(this.plugin, name, ent.key, this.hoverParent);
				}
				el("span", { cls: "chronicle-tl-lane-count", text: String(lane.items.length) }, head);
				markKey(head, lane.items.flatMap((it) => it.marks ?? []));
			}
			// With no lane to label, the key has a line of its own.
			else {
				const row = el("div", { cls: "uv-tl-key-row" }, laneEl);
				markKey(row, lane.items.flatMap((it) => it.marks ?? []));
				if (!row.hasChildNodes()) row.remove();
			}
			const track = el("div", { cls: "chronicle-tl-track" }, laneEl);
			// Rows holding a nation are as tall as the lineage's, with room above the bar for its marks.
			const zoom = this.options.rowZoom ?? 1;
			const rows = rowLayout(lane.rows, new Set(lane.placed.filter((p) => p.item.kind === "culture" && !p.item.point).map((p) => p.row)), rowH, 40 * zoom);
			track.style.height = `${rows.total + 8}px`;
			const slot = (row: number) => (rows.height[row] > rowH ? { top: rows.top[row] + 11 * zoom, height: rows.height[row] - 14 * zoom } : { top: rows.top[row] + 4, height: rows.height[row] - 6 });
			for (const p of lane.placed) {
				if (p.x2 < -margin || p.x1 > this.width + margin) continue;
				if (p.cluster) this.renderCluster(track, p, slot(p.row), p.cluster);
				else this.renderItem(track, p, slot(p.row));
			}
		}
		this.bodyEl.scrollTop = this.pendingScroll ?? scrollTop;
		this.pendingScroll = undefined;
		const spot = this.pendingKey ? this.lanesEl.querySelector<HTMLElement>(`.chronicle-tl-item.is-nation[data-key="${CSS.escape(this.pendingKey)}"]`) : null;
		if (spot && this.bodyEl.clientHeight) {
			const box = this.bodyEl.getBoundingClientRect();
			const r = spot.getBoundingClientRect();
			this.bodyEl.scrollTop += r.top + r.height / 2 - (box.top + box.height / 2);
			this.pendingKey = undefined;
		}
		this.renderCauses();
	}

	/** A nation looks as it does on the lineage: its badge at the start, kept in view, with its name and dates. */
	private dressNation(bar: HTMLElement, label: HTMLElement | undefined, p: Placed) {
		const e = p.item.entity;
		const off = p.labelInside ? Math.max(0, Math.min(-p.x1, p.x2 - p.x1 - this.insideWidth(p.item))) : 0;
		const badge = el("span", { cls: "uv-nation-badge" }, bar);
		badge.style.left = `${off + 2}px`;
		const logo = resourceUrl(this.plugin, e.logo ?? e.image);
		const kindIcon = GROUP_KINDS[groupKind(this.plugin, e)].icon;
		if (logo) el("img", { attr: { src: logo, alt: "" } }, badge);
		else if (!glyph(badge, e.icon ?? kindIcon)) icon(badge, kindIcon);
		if (!label) return;
		el("span", { cls: "uv-nation-name", text: p.item.label }, label);
		if (p.item.meta) el("span", { cls: "uv-nation-meta", text: p.item.meta }, label);
		if (p.labelInside) label.style.paddingLeft = `${off + 30}px`;
	}

	/** The room in a bar for its label to sit inside it: for a nation, as on the lineage, its badge and name. */
	private insideWidth(it: Item): number {
		return it.meta ? this.measure(it.label) + 46 : this.labelWidth(it) + 6;
	}

	/** Room a label needs: a nation's holds its badge, name and dates. */
	private labelWidth(it: Item): number {
		return this.measure(it.label) + 14 + (it.meta ? this.measure(it.meta) * 0.85 + 46 : 0);
	}

	/** One mark on a bar: its name on hover, and a click opens it. */
	private renderMark(node: HTMLElement, m: HistoryMark, barLeft: number, level: number) {
		const x = this.x(m.day);
		if (x < -20 || x > this.width + 20) return;
		const box = markIcon(node, m);
		box.classList.add("is-on-bar");
		box.style.left = `${x - barLeft - 7}px`;
		box.style.top = `${-7 - level * 11}px`;
		box.setAttribute("aria-label", m.text);
		box.setAttribute("data-tooltip-position", "top");
		box.addEventListener("pointerdown", (evt) => evt.stopPropagation());
		box.addEventListener("click", (evt) => {
			evt.stopPropagation();
			openEntity(this.plugin, m.key, evt);
		});
	}

	/** A lane moves by dragging its name, or from the menu on it, and stays where it's put. */
	private makeMovable(head: HTMLElement, laneEl: HTMLElement, lanes: Lane[]) {
		const shown = () => Array.from(this.lanesEl.querySelectorAll<HTMLElement>(":scope > .chronicle-tl-lane"));
		const save = (ids: string[]) => {
			this.options.laneOrder = { ...this.options.laneOrder, [this.options.group]: ids };
			this.schedule();
		};
		head.addClass("is-movable");
		dragToReorder(head, laneEl, shown, () => save(shown().map((l) => l.dataset.lane ?? "")), true);
		head.addEventListener("contextmenu", (evt) => {
			evt.preventDefault();
			evt.stopPropagation();
			const ids = lanes.map((l) => l.id);
			const at = ids.indexOf(laneEl.dataset.lane ?? "");
			const moved = (to: number) => {
				const next = ids.filter((_, i) => i !== at);
				next.splice(to, 0, ids[at]);
				save(next);
			};
			const menu = new Menu();
			if (at > 0) {
				menu.addItem((i) => i.setTitle("Move to the top").setIcon("arrow-up-to-line").onClick(() => moved(0)));
				menu.addItem((i) => i.setTitle("Move up").setIcon("arrow-up").onClick(() => moved(at - 1)));
			}
			if (at < ids.length - 1) {
				menu.addItem((i) => i.setTitle("Move down").setIcon("arrow-down").onClick(() => moved(at + 1)));
				menu.addItem((i) => i.setTitle("Move to the bottom").setIcon("arrow-down-to-line").onClick(() => moved(ids.length - 1)));
			}
			if (this.options.laneOrder?.[this.options.group]) {
				menu.addSeparator();
				menu.addItem((i) => i.setTitle("Reset the order").setIcon("rotate-ccw").onClick(() => {
					const { [this.options.group]: _gone, ...rest } = this.options.laneOrder ?? {};
					this.options.laneOrder = rest;
					this.schedule();
				}));
			}
			menu.showAtMouseEvent(evt);
		});
	}

	/** Curved arrows from each event to the events it led to, where both are on screen. */
	private renderCauses() {
		this.lanesEl.querySelector(".chronicle-tl-causes")?.remove();
		if (this.options.causes === false) return;
		const idx = this.plugin.index;
		if (!idx.effectsOf.size) return;
		const nodes = new Map<string, HTMLElement>();
		this.lanesEl.querySelectorAll<HTMLElement>(".chronicle-tl-item").forEach((n) => {
			if (n.dataset.key && !nodes.has(n.dataset.key)) nodes.set(n.dataset.key, n);
		});
		const base = this.lanesEl.getBoundingClientRect();
		const svgEl = createSvg("svg");
		svgEl.classList.add("chronicle-tl-causes");
		svgEl.setAttribute("width", String(this.lanesEl.scrollWidth));
		svgEl.setAttribute("height", String(this.lanesEl.scrollHeight));
		const defs = createSvg("defs");
		defs.append(...svgMarkup(`<marker id="chronicle-tl-cause-head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="chronicle-tl-cause-headpath"/></marker>`));
		svgEl.appendChild(defs);
		let drawn = 0;
		for (const [cause, effects] of idx.effectsOf) {
			const a = nodes.get(cause);
			if (!a) continue;
			const box = (n: HTMLElement): Box => {
				const r = (n.querySelector(".chronicle-tl-bar, .chronicle-tl-dot") ?? n).getBoundingClientRect();
				return { left: r.left - base.left, right: r.right - base.left, top: r.top - base.top, bottom: r.bottom - base.top };
			};
			const from = box(a);
			for (const effect of effects) {
				const b = nodes.get(effect);
				if (!b) continue;
				const path = createSvg("path");
				path.setAttribute("d", causePath(from, box(b)));
				path.setAttribute("class", "chronicle-tl-cause");
				path.setAttribute("marker-end", "url(#chronicle-tl-cause-head)");
				path.dataset.from = cause;
				path.dataset.to = effect;
				const title = createSvg("title");
				title.textContent = `${idx.get(cause)?.name ?? cause} led to ${idx.get(effect)?.name ?? effect}`;
				path.appendChild(title);
				svgEl.appendChild(path);
				drawn++;
			}
		}
		if (drawn) this.lanesEl.appendChild(svgEl);
	}

	private buildLanes(): Lane[] {
		const lanes = new Map<string, Lane>();
		for (const it of this.items) {
			for (const [id, label] of this.groupsOf(it)) {
				let lane = lanes.get(id);
				if (!lane) lanes.set(id, (lane = { id, label, items: [], placed: [], rows: 0, first: it.start }));
				lane.items.push(it);
				lane.first = Math.min(lane.first, it.start);
			}
		}
		// By category: the events' own categories first (busiest on top), "other events" after them, then
		// lifespans, groups and the rest. Otherwise lanes go in order of their first date.
		const rank = (l: Lane) => (l.id.startsWith("kind:") ? 2 : l.id === "~event" ? 1 : 0);
		const sorted = [...lanes.values()].sort((a, b) => {
			if (a.id === "~") return 1;
			if (b.id === "~") return -1;
			if (this.options.group === "category") return rank(a) - rank(b) || b.items.length - a.items.length || a.label.localeCompare(b.label);
			return a.first - b.first || a.label.localeCompare(b.label);
		});
		// Lanes dragged into place stay there; new ones follow, in the usual order.
		const order = this.options.laneOrder?.[this.options.group] ?? [];
		const place = (l: Lane) => (order.includes(l.id) ? order.indexOf(l.id) : order.length);
		const placed = sorted.map((l, i) => ({ l, i })).sort((a, b) => place(a.l) - place(b.l) || a.i - b.i).map((x) => x.l);
		for (const lane of placed) this.pack(lane);
		return placed;
	}

	/**
	 * Puts a lane's items in their rows at this zoom. The rows themselves are fixed (see packRows); only
	 * when zoomed out past them can points crowd together, three or more becoming one marker with a
	 * count, and labels give way to the next thing along.
	 */
	private pack(lane: Lane) {
		const CLOSE = 14;
		let fixed = this.rowsByLane.get(lane.id);
		if (!fixed) {
			fixed = packRows(lane.items.map((it) => ({ id: it.id, start: it.start, end: it.end, point: it.point, labelWidth: this.labelWidth(it) })), this.layoutScale);
			this.rowsByLane.set(lane.id, fixed);
		}
		lane.rows = fixed.count;
		const byRow = new Map<number, Item[]>();
		for (const it of lane.items) {
			const row = fixed.rows.get(it.id) ?? 0;
			byRow.set(row, [...(byRow.get(row) ?? []), it]);
		}
		for (const [row, items] of byRow) {
			const placed: Placed[] = [];
			const put = (it: Item, cluster?: Item[]) => {
				const x1 = this.x(it.start);
				const x2 = this.x(it.end);
				const w = Math.max(x2 - x1, 4);
				placed.push({ item: it, row, x1, x2: Math.max(x2, x1 + 4), labelInside: !it.point && Math.min(x2, this.width) - Math.max(x1, 0) >= this.insideWidth(it), cluster });
			};
			let run: Item[] = [];
			const flushRun = () => {
				if (run.length >= 3) {
					const top = [...run].sort((a, b) => b.importance - a.importance || a.start - b.start)[0];
					put({ ...top, id: `cluster:${top.id}`, label: `${top.label} +${run.length - 1}`, start: run[0].start, end: run[0].start, point: true }, run);
				} else run.forEach((it) => put(it));
				run = [];
			};
			for (const it of [...items].sort((a, b) => a.start - b.start)) {
				if (run.length && (!it.point || this.x(it.start) - this.x(run[0].start) > CLOSE)) flushRun();
				if (it.point) run.push(it);
				else put(it);
			}
			flushRun();
			placed.forEach((p, i) => {
				const next = placed[i + 1];
				if (next && !p.labelInside && (p.item.point ? p.x1 + 10 : p.x2) + this.labelWidth(p.item) > next.x1) p.noLabel = true;
			});
			lane.placed.push(...placed);
		}
	}

	/** A cluster marker: its count, the names on hover, and a click that zooms in until they part (or lists them, if they share a day). */
	private renderCluster(track: HTMLElement, p: Placed, at: { top: number; height: number }, members: Item[]) {
		const it = p.item;
		const node = el("div", { cls: `chronicle-tl-item is-point is-cluster kind-${it.kind}` }, track);
		node.dataset.key = it.key;
		node.style.setProperty("--item-color", it.color);
		node.style.top = `${at.top}px`;
		node.style.height = `${at.height}px`;
		node.style.left = `${p.x1 - 9}px`;
		if (members.some((m) => m.id === this.selected)) node.addClass("is-selected");
		el("span", { cls: "chronicle-tl-dot uv-tl-cluster-dot", text: String(members.length) }, node);
		el("span", { cls: "chronicle-tl-label", text: it.label }, node);
		const names = members.slice(0, 12).map((m) => `${m.label} · ${m.dateText}`);
		if (members.length > 12) names.push(`…and ${members.length - 12} more`);
		node.setAttribute("aria-label", names.join("\n"));
		node.setAttribute("data-tooltip-position", "top");
		node.addEventListener("click", (evt) => {
			evt.stopPropagation();
			if (this.drag?.moved) return;
			const first = Math.min(...members.map((m) => m.start));
			const last = Math.max(...members.map((m) => m.start));
			// Apart in time: zoom so they're about 40 px apart. On one day: pick from a list.
			if (last - first > 0) {
				this.userMoved = true;
				const want = Math.min(4000, (40 * (members.length + 1)) / Math.max(1, last - first));
				this.pxPerDay = Math.max(this.pxPerDay * 1.5, Math.min(want, this.pxPerDay * 40));
				this.viewStart = (first + last) / 2 - this.width / 2 / this.pxPerDay;
				this.schedule();
				return;
			}
			const menu = new Menu();
			for (const m of members) menu.addItem((i) => i.setTitle(`${m.label}`).setIcon(m.kind === "event" ? "calendar" : "circle").onClick(() => this.select(m.id)));
			menu.showAtMouseEvent(evt);
		});
	}

	private renderItem(track: HTMLElement, p: Placed, at: { top: number; height: number }) {
		const it = p.item;
		const node = el("div", { cls: `chronicle-tl-item kind-${it.kind} uv-shape-${this.shapeIn(it)}` }, track);
		node.dataset.key = it.key;
		node.style.setProperty("--item-color", it.color);
		node.style.top = `${at.top}px`;
		node.style.height = `${at.height}px`;
		if (it.approx) node.addClass("is-approx");
		if (it.open) node.addClass("is-open-ended");
		if (it.importance >= 4) node.addClass("is-important");
		if (this.highlight === it.key) node.addClass("is-highlighted");
		node.setAttribute("aria-label", `${it.label}\n${it.dateText}`);
		node.setAttribute("data-tooltip-position", "top");
		if (this.selected === it.id) node.addClass("is-selected");
		const battle = it.kind === "event" && isBattle(it.entity);
		if (battle) node.addClass("is-battle");
		if (it.point) {
			node.addClass("is-point");
			node.style.left = `${p.x1 - 7}px`;
			const dot = el("span", { cls: "chronicle-tl-dot" }, node);
			if (battle) icon(dot, "swords");
			if (!p.noLabel) el("span", { cls: "chronicle-tl-label", text: it.label }, node);
		} else {
			node.addClass("is-span");
			node.style.left = `${p.x1}px`;
			const bar = el("span", { cls: "chronicle-tl-bar" }, node);
			bar.style.width = `${p.x2 - p.x1}px`;
			const marks = it.marks ?? [];
			const levels = stackLevels(marks.map((m) => this.x(m.day)));
			marks.forEach((m, i) => this.renderMark(node, m, p.x1, levels[i]));
			const nation = it.kind === "culture";
			if (nation) node.addClass("is-nation");
			const label = p.noLabel ? undefined : el("span", { cls: "chronicle-tl-label" + (nation ? " uv-nation-label" : ""), text: nation ? "" : it.label }, p.labelInside ? bar : node);
			if (nation) this.dressNation(bar, label, p);
			if (p.labelInside && label) {
				label.addClass("is-inside");
				// Keep the label readable when the bar starts off-screen to the left.
				if (p.x1 < 0 && !nation) label.style.paddingLeft = `${Math.min(-p.x1 + 6, p.x2 - p.x1 - this.measure(it.label) - 12)}px`;
			}
		}
		node.addEventListener("click", (evt) => {
			if (this.drag?.moved || this.itemMoved) return;
			// A click shows its card beside the timeline; Ctrl/Cmd-click (or any click in an embed) opens the note.
			if (this.embedded || evt.ctrlKey || evt.metaKey) return openEntity(this.plugin, it.key, evt);
			evt.stopPropagation();
			this.select(it.id);
		});
		node.addEventListener("dblclick", (evt) => {
			// Not "a new event here", which a double-click on empty timeline means.
			evt.stopPropagation();
			openEntity(this.plugin, it.key, evt);
		});
		if (!this.embedded && it.kind === "event" && !it.entity.repeat && it.entity.start && it.entity.start.precision !== "range") this.makeEditable(node, p);
		node.addEventListener("contextmenu", (evt) => {
			evt.preventDefault();
			showEntityMenu(this.plugin, it.key, evt);
		});
		bindHover(this.plugin, node, it.key, this.hoverParent);
	}

	/**
	 * Drag an event along the timeline to change its date, or the end of its bar to change how long
	 * it lasts. Dates keep their precision (a year stays a year) and "c." stays on approximate dates.
	 */
	private makeEditable(node: HTMLElement, p: Placed) {
		const e = p.item.entity;
		node.addClass("is-editable");
		let handle: HTMLElement | undefined;
		if (!p.item.point) {
			handle = el("span", { cls: "chronicle-tl-resize", attr: { title: "Drag to change when it ends" } }, node.querySelector<HTMLElement>(".chronicle-tl-bar") ?? node);
		}
		const badge = () => this.root.querySelector<HTMLElement>(".chronicle-tl-drag-date") ?? el("div", { cls: "chronicle-tl-drag-date" }, this.root);
		node.addEventListener("pointerdown", (evt) => {
			if (evt.button !== 0) return;
			const resizing = !!handle && (evt.target as HTMLElement) === handle;
			evt.stopPropagation();
			const x0 = evt.clientX;
			let moved = false;
			let delta = 0;
			const cal = this.plugin.calendars.get(e.calendar);
			const target = () => {
				const start = resizing ? e.start! : { ...e.start!, start: e.start!.start + delta, end: e.start!.end + delta };
				const end = resizing ? { ...(e.end ?? e.start!), start: Math.max(e.start!.start, (e.end ?? e.start!).start + delta) } : e.end && { ...e.end, start: e.end.start + delta };
				return { start, end };
			};
			const show = (s: { start: number }, en?: { start: number }, precision = e.start!.precision) => {
				const fmt = (d: number, prec: typeof precision) => formatDay(d, cal, prec === "range" ? "year" : prec);
				const text = resizing ? `Ends ${fmt(en!.start, (e.end ?? e.start!).precision)}` : `${fmt(s.start, precision)}${en ? ` – ${fmt(en.start, e.end!.precision)}` : ""}`;
				const b = badge();
				b.setText(text);
				const r = node.getBoundingClientRect();
				const root = this.root.getBoundingClientRect();
				b.style.left = `${r.left - root.left}px`;
				b.style.top = `${r.top - root.top - 26}px`;
			};
			const move = (m: PointerEvent) => {
				const dx = m.clientX - x0;
				if (!moved && Math.abs(dx) < 4) return;
				moved = true;
				node.addClass("is-dragging");
				delta = Math.round(dx / this.pxPerDay);
				if (resizing) {
					const bar = node.querySelector<HTMLElement>(".chronicle-tl-bar");
					if (bar) bar.style.width = `${Math.max(4, p.x2 - p.x1 + dx)}px`;
				} else node.style.transform = `translateX(${dx}px)`;
				const t = target();
				show(t.start, t.end);
			};
			const up = () => {
				window.removeEventListener("pointermove", move);
				window.removeEventListener("pointerup", up);
				this.root.querySelector(".chronicle-tl-drag-date")?.remove();
				node.removeClass("is-dragging");
				if (!moved || !delta) {
					node.setCssStyles({ transform: "" });
					return;
				}
				this.itemMoved = true;
				window.setTimeout(() => (this.itemMoved = false), 50);
				void this.saveDates(e, target(), resizing);
			};
			window.addEventListener("pointermove", move);
			window.addEventListener("pointerup", up);
		});
	}

	/** Writes an event's new dates into its note, in the property names it already uses. */
	private async saveDates(e: Entity, t: { start: { start: number }; end?: { start: number } }, resizing: boolean) {
		const file = this.plugin.app.vault.getAbstractFileByPath(e.path);
		if (!(file instanceof TFile) || !e.start) return;
		const cal = this.plugin.calendars.get(e.calendar);
		const aliases = buildFieldAliases(this.plugin.settings.fieldAliases);
		const write = (d: number, like: NonNullable<Entity["start"]>) => `${like.approx ? "c. " : like.qualifier ? `${like.qualifier} ` : ""}${formatDay(d, cal, like.precision === "range" ? "year" : like.precision)}`;
		await this.plugin.editFrontmatter(file, (f) => {
			if (!resizing) {
				const dateKey = aliases.date.find((k) => k in f) ?? aliases.date[0];
				f[dateKey] = write(t.start.start, e.start!);
			}
			if (t.end && (resizing || e.end)) {
				const endKey = aliases.end.find((k) => k in f) ?? aliases.end[0];
				f[endKey] = write(t.end.start, e.end ?? e.start!);
			}
		}, resizing ? `Change when ${e.name} ends` : `Move ${e.name}`);
	}

	private ticks(): { day: number; label: string; major: boolean; era?: boolean }[] {
		const cal = this.calendar;
		const d0 = this.viewStart;
		const d1 = this.viewStart + this.width / this.pxPerDay;
		const out: { day: number; label: string; major: boolean; era?: boolean }[] = [];
		const minPx = 64;
		if (this.pxPerDay >= 28) {
			// Days
			const step = this.pxPerDay >= minPx ? 1 : this.pxPerDay * 2 >= minPx ? 2 : 7;
			for (let d = Math.floor(d0); d <= d1 && out.length < 400; d++) {
				const c = cal.fromDays(d);
				if (c.d === 1) out.push({ day: d, label: `${cal.monthNames[c.m - 1]} ${cal.formatYear(c.y)}`, major: true });
				else if ((c.d - 1) % step === 0) out.push({ day: d, label: String(c.d), major: false });
			}
			return out;
		}
		if (this.pxPerDay * 30 >= minPx / 1.3) {
			// Months
			const step = this.pxPerDay * 30 >= minPx ? 1 : this.pxPerDay * 90 >= minPx ? 3 : 6;
			let { y, m } = cal.fromDays(d0);
			for (let guard = 0; guard < 600; guard++) {
				const day = cal.toDays(y, m, 1);
				if (day > d1) break;
				if (m === 1) out.push({ day, label: cal.formatYear(y), major: true });
				else if ((m - 1) % step === 0) out.push({ day, label: (cal.monthNames[m - 1] ?? String(m)).slice(0, 3), major: false });
				m++;
				if (m > cal.monthCount(y)) {
					m = 1;
					y++;
				}
			}
			return out;
		}
		// Years
		const yearPx = this.pxPerDay * 365.25;
		const nice = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000, 50000, 100000];
		const step = nice.find((s) => s * yearPx >= minPx) ?? 100000;
		const major = nice.find((s) => s >= step * 5 && s % step === 0) ?? step * 10;
		const y0 = cal.fromDays(d0).y;
		const y1 = cal.fromDays(d1).y + 1;
		for (const t of yearTicks(cal, y0, y1, step, major)) {
			out.push({ day: cal.toDays(t.year, 1, 1), label: cal.formatYear(t.year), major: t.major, era: t.era });
		}
		return out;
	}

	/** Bands behind the lanes: the calendar's eras, then era/age/reign/war notes with a start and end. */
	private renderEras() {
		if (this.options.eras === false) {
			this.root.removeClass("has-eras");
			return;
		}
		const d0 = this.viewStart;
		const d1 = this.viewStart + this.width / this.pxPerDay;
		const bands: { a: number; b: number; label: string; key?: string; color?: string; calendarEra?: boolean }[] = [];
		const def = this.plugin.settings.calendars.find((c) => c.id === this.calendar.id);
		if (def?.eras.length) {
			const eras = [...def.eras].sort((x, y) => x.startYear - y.startYear);
			eras.forEach((era, i) => {
				const a = this.calendar.toDays(era.startYear, 1, 1);
				const b = eras[i + 1] ? this.calendar.toDays(eras[i + 1].startYear, 1, 1) : Infinity;
				bands.push({ a, b, label: era.name || era.abbr, calendarEra: true });
			});
		}
		for (const e of this.plugin.index.all("event")) {
			if (!e.start || !e.end || !e.category || !ERA_KINDS.has(e.category)) continue;
			if (!this.plugin.index.matches(e, { folder: this.options.filter.folder })) continue;
			bands.push({ a: e.start.start, b: e.end.end, label: e.name, key: e.key, color: entityColor(this.plugin, e) });
		}
		let alt = 0;
		// Eras inside eras (a reign inside an age) get their own row of labels, one step lower.
		const notes = bands.filter((b) => !b.calendarEra);
		const depthOf = (band: (typeof bands)[number]) => (band.calendarEra ? 0 : notes.filter((o) => o !== band && o.a <= band.a && o.b >= band.b && (o.a < band.a || o.b > band.b)).length);
		const visible = bands.filter((b) => b.b >= d0 && b.a <= d1);
		const rows = visible.length ? Math.max(...visible.map(depthOf)) + 1 : 0;
		// Lanes start lower when there are bands, so the band names have their own strip.
		this.root.toggleClass("has-eras", visible.length > 0);
		this.root.style.setProperty("--era-rows", String(Math.max(1, rows)));
		for (const band of bands) {
			if (band.b < d0 || band.a > d1) {
				if (band.calendarEra) alt++;
				continue;
			}
			const x1 = Math.max(-2, this.x(band.a));
			const x2 = Math.min(this.width + 2, this.x(band.b));
			const div = el("div", { cls: "chronicle-tl-era" + (band.calendarEra ? ` is-calendar ${alt++ % 2 ? "is-alt" : ""}` : " is-note") }, this.gridEl);
			div.style.left = `${x1}px`;
			div.style.width = `${Math.max(2, x2 - x1)}px`;
			if (band.color) div.style.setProperty("--era-color", band.color);
			const depth = depthOf(band);
			div.style.setProperty("--era-depth", String(depth));
			if (depth) div.addClass("is-nested");
			const label = el("span", { cls: "chronicle-tl-era-label", text: band.label }, div);
			if (band.key) {
				const key = band.key;
				label.addEventListener("click", (evt) => openEntity(this.plugin, key, evt));
				bindHover(this.plugin, label, key, this.hoverParent);
			}
		}
	}

	private renderAxis() {
		this.axisEl.empty();
		this.gridEl.empty();
		this.renderEras();
		// Drop ticks whose labels would collide; an era start beats a major tick, which beats a minor one.
		const rank = (t: { major: boolean; era?: boolean }) => (t.era ? 2 : t.major ? 1 : 0);
		const kept: { day: number; label: string; major: boolean; era?: boolean; x: number }[] = [];
		for (const t of this.ticks()) {
			const x = this.x(t.day);
			const prev = kept[kept.length - 1];
			const minGap = (prev ? Math.max(this.measure(prev.label), this.measure(t.label)) : 0) + 14;
			if (prev && x - prev.x < minGap) {
				if (rank(t) > rank(prev)) kept[kept.length - 1] = { ...t, x };
				continue;
			}
			kept.push({ ...t, x });
		}
		for (const t of kept) {
			const x = t.x;
			if (x < -100 || x > this.width + 100) continue;
			const tick = el("div", { cls: "chronicle-tl-tick" + (t.major ? " is-major" : "") }, this.axisEl);
			tick.style.left = `${x}px`;
			el("span", { text: t.label }, tick);
			const line = el("div", { cls: "chronicle-tl-gridline" + (t.major ? " is-major" : "") }, this.gridEl);
			line.style.left = `${x}px`;
		}
	}

	// ---- Interaction ------------------------------------------------------------------------

	private bindEvents() {
		this.root.addEventListener(
			"wheel",
			(evt) => {
				if (evt.altKey && !this.embedded) {
					evt.preventDefault();
					const box = this.bodyEl.getBoundingClientRect();
					this.zoomRows(Math.exp(-(evt.deltaMode === 1 ? evt.deltaY * 16 : evt.deltaY) * 0.002), evt.clientY - box.top);
					return;
				}
				const horizontal = Math.abs(evt.deltaX) > Math.abs(evt.deltaY) || evt.shiftKey;
				// Plain wheel zooms unless the lanes need vertical scrolling; over the axis it always zooms.
				const overAxis = (evt.target as HTMLElement).closest(".chronicle-tl-axis") !== null;
				const canScroll = this.bodyEl.scrollHeight > this.bodyEl.clientHeight + 2;
				const zoomGesture = evt.ctrlKey || evt.metaKey || (!this.embedded && !horizontal && (overAxis || !canScroll));
				if (horizontal && !evt.ctrlKey) {
					evt.preventDefault();
					this.userMoved = true;
					this.viewStart += (evt.deltaX || evt.deltaY) / this.pxPerDay;
					this.schedule();
					return;
				}
				if (!zoomGesture) return;
				evt.preventDefault();
				const r = this.root.getBoundingClientRect();
				const delta = evt.deltaMode === 1 ? evt.deltaY * 16 : evt.deltaY;
				this.zoom(Math.exp(-delta * 0.002), evt.clientX - r.left);
			},
			{ passive: false },
		);
		// Dragging through time on a phone mustn't also swipe Obsidian back or forward a page.
		// Only the touch's start, so anything following the finger on the document still sees it.
		if (!this.embedded) this.root.addEventListener("touchstart", (evt) => evt.stopPropagation(), { passive: true });
		this.root.addEventListener("pointerdown", (evt) => {
			if (evt.button !== 0) return;
			if ((evt.target as HTMLElement).closest(".chronicle-tl-lane-label, .chronicle-embed-controls, button")) return;
			this.drag = { x: evt.clientX, start: this.viewStart, moved: false, id: evt.pointerId };
		});
		this.root.addEventListener("pointermove", (evt) => {
			const r = this.root.getBoundingClientRect();
			const mx = evt.clientX - r.left;
			this.cursorEl.style.left = `${mx}px`;
			this.cursorLabel.style.left = `${mx}px`;
			const day = this.viewStart + mx / this.pxPerDay;
			const precision = this.pxPerDay >= 2 ? "day" : this.pxPerDay * 30 >= 2 ? "month" : "year";
			this.cursorLabel.setText(formatDay(day, this.calendar, precision));
			const d = this.drag;
			if (!d || d.id !== evt.pointerId) return;
			const dx = evt.clientX - d.x;
			if (!d.moved && Math.abs(dx) < 4) return;
			if (!d.moved) {
				d.moved = true;
				this.root.setPointerCapture(evt.pointerId);
				this.root.addClass("is-panning");
			}
			this.userMoved = true;
			this.viewStart = d.start - dx / this.pxPerDay;
			this.schedule();
		});
		const end = (evt: PointerEvent) => {
			if (!this.drag || this.drag.id !== evt.pointerId) return;
			const moved = this.drag.moved;
			this.root.removeClass("is-panning");
			// Let the click handler see that this was a drag, then clear.
			window.setTimeout(() => (this.drag = null), 0);
			if (!moved) this.drag = null;
		};
		this.root.addEventListener("pointerup", end);
		this.root.addEventListener("pointercancel", end);
		this.root.addEventListener("mouseenter", () => this.root.addClass("is-hovering"));
		this.root.addEventListener("mouseleave", () => this.root.removeClass("is-hovering"));
		this.bodyEl.addEventListener("dblclick", (evt) => {
			if ((evt.target as HTMLElement).closest(".chronicle-tl-item, .chronicle-tl-lane-label")) return;
			const r = this.root.getBoundingClientRect();
			const day = this.viewStart + (evt.clientX - r.left) / this.pxPerDay;
			const precision = this.pxPerDay >= 2 ? "day" : this.pxPerDay * 30 >= 2 ? "month" : "year";
			const date = this.isoFor(day, precision);
			this.plugin.createEntityPrompt({ type: "event", date, calendar: this.calendar.id, scope: this.options.filter.folder || undefined });
		});
	}

	/** A date string the parser understands, at the precision the user is looking at. */
	private isoFor(day: number, precision: "day" | "month" | "year"): string {
		const cal = this.calendar;
		const { y, m, d } = cal.fromDays(day);
		const year = cal.formatYear(y);
		if (precision === "year") return year;
		const pad = (n: number) => String(n).padStart(2, "0");
		if (/^\d+$/.test(year)) return precision === "month" ? `${year}-${pad(m)}` : `${year}-${pad(m)}-${pad(d)}`;
		const month = cal.monthNames[m - 1];
		return precision === "month" ? `${month} ${year}` : `${d} ${month} ${year}`;
	}

	private addEmbedControls() {
		const box = el("div", { cls: "chronicle-embed-controls" }, this.root);
		iconButton(box, "zoom-in", "Zoom in", () => this.zoom(1.5));
		iconButton(box, "zoom-out", "Zoom out", () => this.zoom(1 / 1.5));
		iconButton(box, "maximize", "Fit all", () => this.fit(true));
		el("span", { cls: "chronicle-embed-hint", text: "Ctrl + scroll to zoom" }, box);
	}
}
