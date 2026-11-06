import type ChroniclePlugin from "../main";
import type { Entity } from "../types";
import type { Calendar } from "../dates/calendars";
import { formatDay, formatSpan } from "../dates/parser";
import { categoryColor, markPath } from "./categories";
import { historyOf, type HistoryMark } from "./history";
import { markKey } from "./markkey";
import { spacedLabels, yearTicks } from "../dates/calendars";
import { bindHover, cultureColor, el, emptyState, glyph, icon, iconButton, openEntity, resourceUrl, showEntityMenu, svg } from "./common";
import { GROUP_KINDS, groupKind, type GroupKind } from "./houses";
import { entityPanel } from "../ui/EntityPanel";

export interface LineageOptions {
	folder?: string;
	/** Only groups of this kind (realms, houses, faiths…); all when empty. */
	kind?: GroupKind;
	focus?: string;
	calendar?: string;
	/** Lanes by kind of group (houses, realms, faiths…), or one list. */
	group?: "kind" | "none";
	/** Events of each group as marks along its bar. */
	events?: boolean;
	/** Changes of leader as ticks along the bar. */
	leaders?: boolean;
	/** The group shown in the side panel. */
	selected?: string;
}

const ROW = 40;
const BAR = 26;
const LEFT = 20;
const AXIS = 38;
const LANE = 30;
const KIND_ORDER: GroupKind[] = ["realm", "house", "faith", "culture", "organisation", "group"];

/** What's drawn, worked out once per change of notes or options (the view's zoom and scroll redraw from it). */
interface Prepared {
	lanes: { kind?: GroupKind; items: Entity[] }[];
	yOfKey: Map<string, number>;
	laneTops: { kind?: GroupKind; top: number; bottom: number; count: number }[];
	height: number;
	min: number;
	ongoingEnd: number;
	today?: number;
	cal: Calendar;
	kindOf: Map<string, GroupKind>;
	byLane: boolean;
}

/**
 * The lineage of groups: each a bar from founding to dissolution, in lanes by kind (realms, houses,
 * faiths…), branches under the group they split from, joined by curved lines of descent. Events sit
 * on the bars as marks and changes of leader as ticks; pick a group to read it in the side panel.
 *
 * It moves like the timeline: the wheel zooms through time around the cursor (or scrolls, when the
 * lanes are taller than the view; Ctrl/Cmd+wheel always zooms), dragging pans, Shift+wheel or a
 * sideways swipe pans through time, two fingers pinch, and the date axis stays at the top.
 */
export class LineageRenderer {
	private root: HTMLElement;
	private chart: HTMLElement;
	private scroller: HTMLElement;
	private side: HTMLElement;
	private legend: HTMLElement;
	private keyEl: HTMLElement;
	private keyShown = "";
	private undated: HTMLElement;
	private svgEl: SVGSVGElement;
	private layer: SVGGElement;
	private axisG?: SVGGElement;
	/** Set by the view: the options changed (a group picked, a kind toggled). */
	onOptionsChange?: () => void;

	/** The day at the view's left edge, and how many pixels a day takes. */
	private viewStart = 0;
	private pxPerDay = 0.01;
	/** Once the user zooms or pans, refreshes keep their place instead of fitting everything again. */
	private userMoved = false;
	private prep?: Prepared;
	private frame = 0;
	/** True right after a drag, so the click that ends it doesn't pick a group. */
	private justPanned = false;

	constructor(
		private container: HTMLElement,
		private plugin: ChroniclePlugin,
		public options: LineageOptions,
		private embedded = false,
		private hoverParent: { hoverPopover: unknown } | HTMLElement = container,
	) {
		this.root = el("div", { cls: "chronicle-lineage uv-lin" + (embedded ? " is-embedded" : "") }, container);
		this.chart = el("div", { cls: "uv-lin-chart" }, this.root);
		this.side = el("div", { cls: "uv-lin-side" }, this.root);
		this.legend = el("div", { cls: "uv-lin-legend" }, this.chart);
		this.keyEl = el("div", { cls: "uv-lin-key" }, this.chart);
		this.scroller = el("div", { cls: "uv-lin-scroll" }, this.chart);
		this.svgEl = svg("svg", { class: "chronicle-canvas" }, this.scroller);
		this.layer = svg("g", {}, this.svgEl);
		this.undated = el("div", { cls: "uv-lin-undated" }, this.chart);
		if (embedded) {
			const box = el("div", { cls: "chronicle-embed-controls" }, this.root);
			iconButton(box, "zoom-in", "Zoom in", () => this.zoomBy(1.3));
			iconButton(box, "zoom-out", "Zoom out", () => this.zoomBy(1 / 1.3));
			iconButton(box, "maximize", "Fit", () => this.fit());
		}
		this.bindEvents();
		this.refresh();
		let lastWidth = this.chart.clientWidth;
		this.resizeObs = new ResizeObserver(() => {
			const w = this.chart.clientWidth;
			if (Math.abs(w - lastWidth) < 2) return;
			lastWidth = w;
			if (!this.userMoved) this.fitView();
			this.schedule();
		});
		this.resizeObs.observe(this.chart);
	}

	private resizeObs: ResizeObserver;

	destroy() {
		this.resizeObs.disconnect();
		cancelAnimationFrame(this.frame);
		this.root.remove();
	}

	/** Back to everything in view. */
	fit() {
		this.userMoved = false;
		this.fitView();
		this.draw();
	}

	/** What's in view, for the timeline to pick up. */
	get range(): { start: number; scale: number } {
		return { start: this.viewStart, scale: this.pxPerDay };
	}

	/** Shows the same years as the timeline was. */
	showRange(r: { start: number; scale: number }) {
		this.userMoved = true;
		this.viewStart = r.start;
		this.pxPerDay = r.scale;
		this.schedule();
	}

	zoomBy(f: number) {
		this.zoomAt(f, (this.chart.clientWidth || 900) / 2);
	}

	/** Picks a group for the side panel (or clears it). */
	select(key: string | undefined) {
		this.options.selected = key;
		this.onOptionsChange?.();
		this.layer.querySelectorAll<SVGElement>(".chronicle-lineage-item").forEach((n) => n.classList.toggle("is-selected", n.getAttribute("data-key") === key));
		this.drawSide();
	}

	private changed() {
		this.onOptionsChange?.();
		this.refresh();
	}

	// ---- Moving through time, like the timeline ------------------------------------------------

	private get width(): number {
		return Math.max(300, this.chart.clientWidth || 900);
	}

	/** The whole span, from the first founding to a little past the last date, across the view. */
	private fitView() {
		const p = this.prep;
		if (!p) return;
		const span = Math.max(1, p.ongoingEnd - p.min);
		this.pxPerDay = (this.width - LEFT - 40) / (span * 1.02);
		this.viewStart = p.min - LEFT / this.pxPerDay;
	}

	/** Zooms through time by `f`, keeping the date under `cx` (pixels from the left) where it is. */
	private zoomAt(f: number, cx: number) {
		const p = this.prep;
		if (!p) return;
		const span = Math.max(365, p.ongoingEnd - p.min);
		const lo = this.width / (span * 8);
		const day = this.viewStart + cx / this.pxPerDay;
		this.pxPerDay = Math.min(20, Math.max(lo, this.pxPerDay * f));
		this.viewStart = day - cx / this.pxPerDay;
		this.userMoved = true;
		this.schedule();
	}

	private schedule() {
		// Redraws while zooming or panning don't replay the bars' fade-in.
		this.root.addClass("is-settled");
		cancelAnimationFrame(this.frame);
		this.frame = window.requestAnimationFrame(() => this.draw());
	}

	private bindEvents() {
		const sc = this.scroller;
		sc.addEventListener(
			"wheel",
			(evt) => {
				const horizontal = Math.abs(evt.deltaX) > Math.abs(evt.deltaY) || evt.shiftKey;
				if (horizontal && !evt.ctrlKey) {
					if (this.embedded && !evt.shiftKey && Math.abs(evt.deltaX) <= Math.abs(evt.deltaY)) return;
					evt.preventDefault();
					this.viewStart += (evt.deltaX || evt.deltaY) / this.pxPerDay;
					this.userMoved = true;
					this.schedule();
					return;
				}
				// Plain wheel zooms unless the lanes need scrolling; over the dates it always zooms.
				const overAxis = evt.clientY - sc.getBoundingClientRect().top < AXIS;
				const canScroll = sc.scrollHeight > sc.clientHeight + 2;
				const zoom = evt.ctrlKey || evt.metaKey || (!this.embedded && (overAxis || !canScroll));
				if (!zoom) return;
				evt.preventDefault();
				const delta = evt.deltaMode === 1 ? evt.deltaY * 16 : evt.deltaY;
				this.zoomAt(Math.exp(-delta * 0.002), evt.clientX - sc.getBoundingClientRect().left);
			},
			{ passive: false },
		);
		// Dragging pans through time (and, with a mouse, up and down); two fingers pinch.
		const pointers = new Map<number, number>();
		let drag: { id: number; x: number; y: number; start: number; top: number; moved: boolean } | null = null;
		let pinch: { d: number; day: number } | null = null;
		sc.addEventListener("pointerdown", (evt) => {
			if (evt.button !== 0 || (evt.target as HTMLElement).closest("button, .uv-lin-undated, .uv-lin-legend")) return;
			if (evt.pointerType !== "mouse") pointers.set(evt.pointerId, evt.clientX);
			if (pointers.size === 2) {
				const [a, b] = [...pointers.values()];
				const mid = (a + b) / 2 - sc.getBoundingClientRect().left;
				pinch = { d: Math.max(20, Math.abs(a - b)), day: this.viewStart + mid / this.pxPerDay };
				drag = null;
				return;
			}
			drag = { id: evt.pointerId, x: evt.clientX, y: evt.clientY, start: this.viewStart, top: sc.scrollTop, moved: false };
		});
		sc.addEventListener("pointermove", (evt) => {
			if (pointers.has(evt.pointerId)) pointers.set(evt.pointerId, evt.clientX);
			if (pinch && pointers.size >= 2) {
				const [a, b] = [...pointers.values()];
				const mid = (a + b) / 2 - sc.getBoundingClientRect().left;
				const p = this.prep;
				const lo = p ? this.width / (Math.max(365, p.ongoingEnd - p.min) * 8) : 0;
				this.pxPerDay = Math.min(20, Math.max(lo, (this.pxPerDay * Math.max(20, Math.abs(a - b))) / pinch.d));
				pinch.d = Math.max(20, Math.abs(a - b));
				this.viewStart = pinch.day - mid / this.pxPerDay;
				this.userMoved = true;
				this.schedule();
				return;
			}
			if (!drag || drag.id !== evt.pointerId) return;
			const dx = evt.clientX - drag.x;
			const dy = evt.clientY - drag.y;
			if (!drag.moved && Math.hypot(dx, dy) < 4) return;
			if (!drag.moved) {
				drag.moved = true;
				sc.setPointerCapture?.(evt.pointerId);
				this.root.addClass("is-panning");
			}
			this.viewStart = drag.start - dx / this.pxPerDay;
			// A finger scrolls up and down natively; a mouse does it here.
			if (evt.pointerType === "mouse") sc.scrollTop = drag.top - dy;
			this.userMoved = true;
			this.schedule();
		});
		const up = (evt: PointerEvent) => {
			pointers.delete(evt.pointerId);
			if (pointers.size < 2) pinch = null;
			if (!drag || drag.id !== evt.pointerId) return;
			if (drag.moved) {
				this.justPanned = true;
				window.setTimeout(() => (this.justPanned = false), 0);
			}
			this.root.removeClass("is-panning");
			drag = null;
		};
		sc.addEventListener("pointerup", up);
		sc.addEventListener("pointercancel", up);
		// The date axis stays at the top as the lanes scroll.
		sc.addEventListener("scroll", () => this.axisG?.setAttribute("transform", `translate(0,${sc.scrollTop})`), { passive: true });
		// A sideways drag on a phone mustn't also swipe Obsidian back or forward a page.
		if (!this.embedded) sc.addEventListener("touchstart", (evt) => evt.stopPropagation(), { passive: true });
	}

	// ---- What's drawn --------------------------------------------------------------------------

	/** Groups in scope, before the kind filter (the legend counts them all). */
	private scoped(): Entity[] {
		const idx = this.plugin.index;
		let cultures = idx.all("culture").filter((c) => !this.options.folder || c.path.startsWith(this.options.folder + "/"));
		if (this.options.focus) {
			// Only the focused group's ancestors and descendants.
			const keep = this.kin(this.options.focus);
			cultures = cultures.filter((c) => keep.has(c.key));
		}
		return cultures;
	}

	/** A group with its ancestors and descendants. */
	private kin(key: string): Set<string> {
		const idx = this.plugin.index;
		const out = new Set([key]);
		const up = (k: string) => idx.get(k)?.parentCultures.forEach((p) => !out.has(p.key) && (out.add(p.key), up(p.key)));
		const down = (k: string) => idx.childCulturesOf.get(k)?.forEach((c) => !out.has(c) && (out.add(c), down(c)));
		up(key);
		down(key);
		return out;
	}

	private openTo(c: Entity): number | undefined {
		return c.end ? undefined : this.plugin.openEndOf(c);
	}

	refresh() {
		this.layer.replaceChildren();
		this.chart.querySelector(".chronicle-empty")?.remove();
		this.prep = undefined;
		const p = this.plugin;
		const idx = p.index;
		const all = this.scoped();
		const kindOf = new Map(all.map((c) => [c.key, groupKind(p, c)]));
		this.drawLegend(all, kindOf);
		const cultures = all.filter((c) => !this.options.kind || kindOf.get(c.key) === this.options.kind);
		const dated = cultures.filter((c) => c.start || c.end);
		this.drawUndated(cultures.filter((c) => !c.start && !c.end));
		this.drawSide();
		this.svgEl.toggleClass("is-hidden", !dated.length);
		if (!dated.length) {
			emptyState(
				this.chart,
				"git-branch",
				cultures.length ? "None of these groups have dates yet" : "No groups here yet",
				"Give a group a `founded:` date (and `dissolved:` if it ended), and link the groups it came from with `parent-cultures:` to draw its line of descent.",
				this.embedded ? undefined : { label: "New group", onClick: () => p.createEntityPrompt({ type: "culture", scope: this.options.folder || undefined }) },
			);
			return;
		}
		const cal = p.calendars.get(this.options.calendar ?? idx.dominantCalendar(this.options.folder));
		let min = Infinity;
		let max = -Infinity;
		for (const c of dated) {
			min = Math.min(min, c.start?.start ?? c.end!.start);
			max = Math.max(max, c.end?.end ?? c.start!.end);
		}
		// Groups still standing run to the current date (fading out); without one, a little past the last date.
		const today = p.todayFor(this.options.folder ?? "", cal.id);
		for (const c of dated) {
			const to = this.openTo(c);
			if (to !== undefined) max = Math.max(max, to);
		}
		const span = Math.max(365 * 10, max - min);
		const ongoingEnd = max + span * 0.06;

		// Rows: in lanes by kind, each lane depth-first so branches sit under the group they split from.
		const datedSet = new Set(dated.map((c) => c.key));
		const startOf = (c: Entity) => c.start?.start ?? c.end?.start ?? 0;
		const lanes: { kind?: GroupKind; items: Entity[] }[] = [];
		const byLane = this.options.group !== "none" && !this.options.kind;
		const laneKinds: (GroupKind | undefined)[] = byLane ? KIND_ORDER.filter((k) => dated.some((c) => kindOf.get(c.key) === k)) : [undefined];
		const placed = new Set<string>();
		for (const k of laneKinds) {
			const inLane = (c: Entity) => !k || kindOf.get(c.key) === k;
			const order: Entity[] = [];
			const visit = (c: Entity) => {
				if (placed.has(c.key) || !inLane(c)) return;
				placed.add(c.key);
				order.push(c);
				const kids = [...(idx.childCulturesOf.get(c.key) ?? [])].map((kk) => idx.get(kk)!).filter((kk) => kk && datedSet.has(kk.key));
				kids.sort((a, b) => startOf(a) - startOf(b)).forEach(visit);
			};
			const lane = dated.filter(inLane);
			lane.filter((c) => !c.parentCultures.some((pp) => datedSet.has(pp.key) && inLane(idx.get(pp.key) ?? c))).sort((a, b) => startOf(a) - startOf(b)).forEach(visit);
			lane.filter((c) => !placed.has(c.key)).sort((a, b) => startOf(a) - startOf(b)).forEach(visit);
			if (order.length) lanes.push({ kind: k, items: order });
		}
		const yOfKey = new Map<string, number>();
		let y = AXIS;
		const laneTops: Prepared["laneTops"] = [];
		for (const lane of lanes) {
			const top = y;
			if (lane.kind) y += LANE;
			for (const c of lane.items) {
				yOfKey.set(c.key, y + (ROW - BAR) / 2);
				y += ROW;
			}
			laneTops.push({ kind: lane.kind, top, bottom: y, count: lane.items.length });
			y += lane.kind ? 8 : 0;
		}
		this.prep = { lanes, yOfKey, laneTops, height: y + 10, min, ongoingEnd, today, cal, kindOf, byLane };
		if (!this.userMoved) this.fitView();
		// Fresh notes fade in once; zooming and panning then redraw without it.
		this.root.toggleClass("is-settled", this.userMoved);
		this.draw();
	}

	/** Draws everything at the current zoom and pan. */
	private draw() {
		const prep = this.prep;
		this.layer.replaceChildren();
		if (!prep) return;
		const p = this.plugin;
		const idx = p.index;
		const { lanes, yOfKey, laneTops, height, min, ongoingEnd, today, cal, kindOf, byLane } = prep;
		const width = this.width;
		const x = (d: number) => (d - this.viewStart) * this.pxPerDay;
		const shown: HistoryMark[] = [];
		this.svgEl.setAttribute("width", String(width));
		this.svgEl.setAttribute("height", String(height));
		this.svgEl.style.height = `${height}px`;

		// Lane bands and headings, under everything (headings stay at the left as you pan).
		const bands = svg("g", { class: "uv-lin-lanes" }, this.layer);
		laneTops.forEach((l, i) => {
			if (!l.kind) return;
			svg("rect", { x: 0, y: l.top, width, height: l.bottom - l.top, class: "uv-lin-lane" + (i % 2 ? " is-odd" : "") }, bands);
			const head = svg("text", { x: 8, y: l.top + 19, class: "uv-lin-lane-head" }, bands);
			head.textContent = `${GROUP_KINDS[l.kind].plural} · ${l.count}`;
		});

		// Grid lines for the years in view (the labels go in the axis, drawn last so it's on top).
		const yearPx = this.pxPerDay * 365.25;
		const nice = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000];
		const step = nice.find((s) => s * yearPx >= 70) ?? 10000;
		const from = cal.fromDays(this.viewStart).y - step;
		const to = cal.fromDays(this.viewStart + width / this.pxPerDay).y + step;
		const ticks = yearTicks(cal, from, to, step, step * 5).map((t) => ({ ...t, x: x(cal.toDays(t.year, 1, 1)), label: cal.formatYear(t.year) })).filter((t) => t.x >= -2 && t.x <= width + 2);
		const grid = svg("g", { class: "chronicle-lineage-gridlines" }, this.layer);
		for (const tk of ticks) svg("line", { x1: tk.x, x2: tk.x, y1: AXIS - 6, y2: height, class: "chronicle-lineage-grid" + (tk.era ? " is-era" : "") }, grid);
		if (today !== undefined) svg("line", { x1: x(today), x2: x(today), y1: AXIS - 6, y2: height, class: "chronicle-lineage-today" }, grid);

		const defs = svg("defs", {}, this.layer);
		const links = svg("g", { class: "chronicle-lineage-links" }, this.layer);
		const bars = svg("g", { class: "chronicle-lineage-bars" }, this.layer);
		const focus = (key: string | null) => {
			this.root.toggleClass("is-focusing", !!key);
			const set = key ? this.kin(key) : new Set<string>();
			this.layer.querySelectorAll<SVGElement>("[data-key]").forEach((n) => n.classList.toggle("is-lit", set.has(n.getAttribute("data-key")!)));
			this.layer.querySelectorAll<SVGElement>(".chronicle-lineage-link").forEach((n) => n.classList.toggle("is-lit", set.has(n.getAttribute("data-from")!) && set.has(n.getAttribute("data-to")!)));
		};

		let i = 0;
		for (const lane of lanes) for (const c of lane.items) {
			const n = i++;
			const a = c.start?.start ?? c.end!.start;
			const openEnd = this.openTo(c);
			const b = c.end?.end ?? openEnd ?? ongoingEnd;
			const yy = yOfKey.get(c.key)!;
			const color = c.color ?? cultureColor(p, c.key);
			const kind = kindOf.get(c.key) ?? "group";
			const g = svg("g", { class: "chronicle-lineage-item" + (c.key === this.options.focus ? " is-focus" : "") + (c.key === this.options.selected ? " is-selected" : ""), "data-key": c.key }, bars);
			g.setAttribute("style", `--item-color: ${color}; --i: ${n % 20}`);
			const w = Math.max(8, x(b) - x(a));
			const open = !c.end;
			let fill: string | undefined;
			if (open) {
				// Still standing: solid, then fading out to the current date.
				const id = `chronicle-lineage-fade-${n}`;
				const grad = svg("linearGradient", { id, x1: 0, x2: 1, y1: 0, y2: 0 }, defs);
				svg("stop", { offset: Math.max(0, 1 - Math.min(0.5, 80 / w)), "stop-color": color, "stop-opacity": 0.55 }, grad);
				svg("stop", { offset: 1, "stop-color": color, "stop-opacity": 0.04 }, grad);
				fill = `url(#${id})`;
			}
			const bar = svg("rect", { x: x(a), y: yy, width: w, height: BAR, rx: BAR / 2, class: "chronicle-lineage-bar" + (open ? " is-ongoing" : "") + (c.start?.approx ? " is-approx" : "") }, g);
			if (fill) bar.setAttribute("style", `fill: ${fill}`);
			// A badge at the start (kept in view while the bar is): the group's logo, else its kind's icon.
			const bx = Math.min(Math.max(x(a), 2), x(a) + w - BAR) + BAR / 2;
			const badge = svg("g", { class: "chronicle-lineage-badge", transform: `translate(${bx},${yy + BAR / 2})` }, g);
			svg("circle", { r: BAR / 2 - 2, class: "chronicle-lineage-badge-bg" }, badge);
			const logo = resourceUrl(p, c.logo ?? c.image);
			if (logo) {
				const clipId = `chronicle-lineage-clip-${n}`;
				svg("circle", { r: BAR / 2 - 3 }, svg("clipPath", { id: clipId }, defs));
				svg("image", { href: logo, x: -(BAR / 2 - 3), y: -(BAR / 2 - 3), width: BAR - 6, height: BAR - 6, "clip-path": `url(#${clipId})`, preserveAspectRatio: "xMidYMid slice" }, badge);
			} else {
				const fo = svg("foreignObject", { x: -7, y: -7, width: 14, height: 14, class: "uv-lin-badge-icon" }, badge);
				const holder = createDiv();
				fo.appendChild(holder);
				if (!glyph(holder, c.icon ?? GROUP_KINDS[kind].icon)) icon(holder, GROUP_KINDS[kind].icon);
			}
			const members = idx.members(c.key).length;
			const spanText = formatSpan(c.start, c.end, cal) + (openEnd !== undefined ? " – now" : "");
			// The name sits inside the bar where it fits (kept in view as you pan), else just after it.
			const shownFrom = Math.max(x(a), 0);
			const shownTo = Math.min(x(a) + w, width);
			const inside = c.name.length * 7 + 40 <= shownTo - shownFrom;
			const lx = inside ? shownFrom + BAR + 4 : x(a) + w + 8;
			const label = svg("text", { x: lx, y: yy + BAR / 2 + 4, class: "chronicle-lineage-label" + (inside ? "" : " is-outside") }, g);
			svg("tspan", { class: "chronicle-lineage-name" }, label).textContent = c.name;
			const meta = [byLane ? "" : GROUP_KINDS[kind].label, spanText, members ? `${members} ${members === 1 ? "member" : "members"}` : ""].filter(Boolean).join(" · ");
			if (meta) svg("tspan", { class: "chronicle-lineage-meta", dx: 8 }, label).textContent = meta;
			// Its history along the bar: the same marks as on the timeline.
			const history = historyOf(p, c, [a, b]).filter((m) => (m.kind === "event" ? this.options.events !== false : m.kind === "reign" ? this.options.leaders !== false : true));
			shown.push(...history);
			for (const m of history) {
				const mx = x(m.day);
				const mark = svg("path", { d: markPath(m.shape, mx, yy + 1, 4.5), class: "uv-lin-event" }, g);
				mark.style.setProperty("--mark-color", categoryColor(m.categoryId));
				svg("title", {}, mark).textContent = m.text;
				if (m.name) svg("text", { x: mx + 6, y: yy - 3, class: "uv-lin-rename-label" }, g).textContent = m.name;
				mark.addEventListener("click", (evt) => {
					evt.stopPropagation();
					if (!this.justPanned) openEntity(p, m.key, evt);
				});
			}
			g.addEventListener("click", (evt) => {
				if (this.justPanned) return;
				// Click picks it for the side panel; Ctrl/Cmd-click, or a second click, opens the note.
				if (evt.ctrlKey || evt.metaKey || this.embedded || this.options.selected === c.key) openEntity(p, c.key, evt);
				else this.select(c.key);
			});
			g.addEventListener("dblclick", (evt) => openEntity(p, c.key, evt));
			g.addEventListener("contextmenu", (evt) => {
				evt.preventDefault();
				showEntityMenu(p, c.key, evt);
			});
			g.addEventListener("mouseenter", () => focus(c.key));
			g.addEventListener("mouseleave", () => focus(null));
			bindHover(p, g, c.key, this.hoverParent);

			for (const pp of c.parentCultures) {
				if (!yOfKey.has(pp.key)) continue;
				const pe = idx.get(pp.key);
				const py = yOfKey.get(pp.key)! + BAR / 2;
				// From the parent bar at the moment of the split (or its end, if it ended first).
				const px = Math.min(Math.max(x(pe?.start?.start ?? a), x(a)), x(pe?.end?.end ?? Infinity) - 4);
				const cy = yy + BAR / 2;
				const cx = x(a);
				const d = `M${px},${py} C${px},${(py + cy) / 2} ${px},${cy} ${cx},${cy}`;
				const path = svg("path", { d, class: "chronicle-lineage-link", "data-from": pp.key, "data-to": c.key }, links);
				path.setAttribute("style", `--item-color: ${color}`);
				svg("circle", { cx: px, cy: py, r: 3, class: "chronicle-lineage-fork" }, links).setAttribute("style", `--item-color: ${color}`);
			}
		}

		// The date axis, last so it's on top, held at the top of the view as the lanes scroll.
		const axis = svg("g", { class: "chronicle-lineage-axis", transform: `translate(0,${this.scroller.scrollTop})` }, this.layer);
		this.axisG = axis;
		svg("rect", { x: 0, y: 0, width, height: AXIS - 4, class: "uv-lin-axis-bg" }, axis);
		for (const tk of spacedLabels(ticks)) svg("text", { x: tk.x, y: AXIS - 14, "text-anchor": "middle", class: "chronicle-lineage-tick" }, axis).textContent = tk.label;
		if (today !== undefined && x(today) >= 0 && x(today) <= width) svg("text", { x: x(today) + 4, y: AXIS - 14, class: "chronicle-lineage-today-label" }, axis).textContent = "Today";
		void min;
		// The key, redrawn only when what's on the bars changes.
		const keyNow = [...new Set(shown.map((m) => m.shape))].sort().join();
		if (keyNow !== this.keyShown) {
			this.keyShown = keyNow;
			this.keyEl.empty();
			markKey(this.keyEl, shown);
		}
	}

	/** Each kind of group with how many there are: click one to show only those, again for all. */
	private drawLegend(all: Entity[], kindOf: Map<string, GroupKind>) {
		this.legend.empty();
		if (this.embedded) return;
		const counts = new Map<GroupKind, number>();
		for (const c of all) counts.set(kindOf.get(c.key)!, (counts.get(kindOf.get(c.key)!) ?? 0) + 1);
		const chip = (k: GroupKind | undefined, label: string, n: number) => {
			const b = el("button", { cls: "uv-lin-chip" + ((this.options.kind ?? undefined) === k ? " is-active" : "") }, this.legend);
			if (k) {
				const ic = el("span", { cls: "uv-lin-chip-icon" }, b);
				glyph(ic, GROUP_KINDS[k].icon);
			}
			el("span", { text: label }, b);
			el("span", { cls: "uv-lin-chip-n", text: String(n) }, b);
			b.addEventListener("click", () => {
				this.options.kind = k;
				this.changed();
			});
		};
		chip(undefined, "All", all.length);
		for (const k of KIND_ORDER) if (counts.get(k)) chip(k, GROUP_KINDS[k].plural, counts.get(k)!);
	}

	private undatedOpen = false;

	/** Groups with no dates: listed, so none go missing, ready to date. */
	private drawUndated(list: Entity[]) {
		this.undated.empty();
		this.undated.toggleClass("is-empty", !list.length || this.embedded);
		if (!list.length || this.embedded) return;
		// Folded to one button, so it never sits over the chart until asked for.
		this.undated.toggleClass("is-open", this.undatedOpen);
		const head = el("button", { cls: "uv-lin-undated-head" }, this.undated);
		icon(el("span", {}, head), "calendar-off");
		el("span", { text: `Not dated yet (${list.length})` }, head);
		icon(el("span", { cls: "uv-lin-undated-caret" }, head), this.undatedOpen ? "chevron-up" : "chevron-down");
		head.addEventListener("click", () => {
			this.undatedOpen = !this.undatedOpen;
			this.drawUndated(list);
		});
		if (!this.undatedOpen) return;
		const row = el("div", { cls: "uv-lin-undated-list" }, this.undated);
		for (const c of list.sort((a, b) => a.name.localeCompare(b.name)).slice(0, 60)) {
			const b = el("button", { cls: "uv-lin-undated-item" + (c.key === this.options.selected ? " is-selected" : "") }, row);
			b.style.setProperty("--item-color", c.color ?? cultureColor(this.plugin, c.key));
			el("span", { cls: "uv-lin-dot" }, b);
			el("span", { text: c.name }, b);
			b.addEventListener("click", (evt) => (evt.ctrlKey || evt.metaKey ? openEntity(this.plugin, c.key, evt) : this.select(c.key)));
			bindHover(this.plugin, b, c.key, this.hoverParent);
		}
	}

	/** The picked group, read as in the inspector, with its line of descent one click away. */
	private drawSide() {
		const side = this.side;
		side.empty();
		const e = this.options.selected ? this.plugin.index.get(this.options.selected) : undefined;
		this.root.toggleClass("has-side", !!e && !this.embedded);
		if (!e || this.embedded) return;
		const bar = el("div", { cls: "uv-lin-side-bar" }, side);
		const focus = el("button", { cls: "uv-lin-side-btn" + (this.options.focus === e.key ? " is-active" : "") }, bar);
		icon(el("span", {}, focus), "git-branch");
		el("span", { text: this.options.focus === e.key ? "Show every line" : "Only its line" }, focus);
		focus.addEventListener("click", () => {
			this.options.focus = this.options.focus === e.key ? undefined : e.key;
			this.changed();
		});
		const close = el("button", { cls: "clickable-icon", attr: { "aria-label": "Close" } }, bar);
		icon(close, "x");
		close.addEventListener("click", () => this.select(undefined));
		const box = el("div", { cls: "uv-lin-side-body" }, side);
		entityPanel(this.plugin, box, e, { pick: (k) => (this.plugin.index.get(k)?.type === "culture" ? this.select(k) : openEntity(this.plugin, k)), host: this.side });
	}
}
