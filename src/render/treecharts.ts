import type ChroniclePlugin from "../main";
import type { Entity } from "../types";
import { formatSpan } from "../dates/parser";
import { spacedLabels, yearTicks } from "../dates/calendars";
import type { FamilyOptions } from "./family";
import { PanZoom } from "./panzoom";
import { bindHover, el, emptyState, entityColor, iconButton, openEntity, showEntityMenu, svg } from "./common";

const YEAR = 365.25;

/** Shared by the fan chart and the time tree: an SVG canvas you can pan, zoom and export. */
abstract class SvgChart {
	protected root: HTMLElement;
	protected svgEl: SVGSVGElement;
	protected layer: SVGGElement;
	protected pz: PanZoom;
	protected bbox = { x: 0, y: 0, width: 1, height: 1 };
	/** Set by the view: double-click someone to put them at the centre. */
	onRecenter?: (key: string) => void;

	constructor(
		protected container: HTMLElement,
		protected plugin: ChroniclePlugin,
		public options: FamilyOptions,
		protected embedded: boolean,
		protected hoverParent: { hoverPopover: unknown } | HTMLElement,
		cls: string,
	) {
		this.root = el("div", { cls: `chronicle-family ${cls}` + (embedded ? " is-embedded" : "") }, container);
		this.svgEl = svg("svg", { class: "chronicle-canvas" }, this.root);
		this.layer = svg("g", {}, this.svgEl);
		this.pz = new PanZoom(this.svgEl, this.layer, { requireModifier: embedded, minScale: 0.1, maxScale: 4 });
		if (embedded) {
			const box = el("div", { cls: "chronicle-embed-controls" }, this.root);
			iconButton(box, "zoom-in", "Zoom in", () => this.pz.zoomBy(1.3));
			iconButton(box, "zoom-out", "Zoom out", () => this.pz.zoomBy(1 / 1.3));
			iconButton(box, "maximize", "Fit", () => this.fit());
		}
	}

	destroy() {
		this.pz.destroy();
		this.root.remove();
	}

	fit() {
		this.pz.fit(this.bbox, 20, 1.5);
	}

	zoomBy(f: number) {
		this.pz.zoomBy(f);
	}

	protected reset(): boolean {
		this.layer.replaceChildren();
		this.root.querySelector(".chronicle-empty")?.remove();
		const root = this.plugin.index.get(this.options.root);
		if (!root || root.type !== "person") {
			emptyState(this.root, "git-fork", "Choose a person", "Pick someone in the toolbar to draw their family.");
			return false;
		}
		return true;
	}

	protected wire(g: Element, key: string) {
		g.addEventListener("click", (evt) => {
			if (!this.pz.justPanned) openEntity(this.plugin, key, evt as MouseEvent);
		});
		g.addEventListener("dblclick", (evt) => {
			evt.preventDefault();
			this.onRecenter?.(key);
		});
		g.addEventListener("contextmenu", (evt) => {
			evt.preventDefault();
			showEntityMenu(this.plugin, key, evt as MouseEvent);
		});
		bindHover(this.plugin, g, key, this.hoverParent);
	}

	abstract refresh(): void;
}

/**
 * A fan chart: the person at the centre, their parents in the first ring, grandparents in the
 * next, and so on, each ring split in half per generation (fathers on the left).
 */
export class FanChartRenderer extends SvgChart {
	constructor(container: HTMLElement, plugin: ChroniclePlugin, options: FamilyOptions, embedded = false, hoverParent: { hoverPopover: unknown } | HTMLElement = container) {
		super(container, plugin, options, embedded, hoverParent, "chronicle-fan");
		this.refresh();
	}

	refresh() {
		if (!this.reset()) return;
		const idx = this.plugin.index;
		const gens = Math.max(2, Math.min(8, this.options.up || 5));
		const R0 = 70;
		const ring = 64;
		// Slots per generation: slot i of generation g holds the ancestor reached by the bits of i (0 = father side).
		const slot = new Map<string, Entity | undefined>();
		const rootE = idx.get(this.options.root)!;
		slot.set("0:0", rootE);
		for (let g = 1; g <= gens; g++) {
			for (let i = 0; i < 2 ** g; i++) {
				const child = slot.get(`${g - 1}:${i >> 1}`);
				if (!child) continue;
				const ps = child.parents.map((p) => idx.get(p.key)).filter((p): p is Entity => !!p);
				const father = ps.find((p) => /^m/.test(p.gender ?? "")) ?? ps.find((p) => !/^f/.test(p.gender ?? ""));
				// With two mothers (or no genders), the second one goes on the right.
				const mother = ps.find((p) => p !== father);
				if (!father && ps.length === 2) {
					slot.set(`${g}:${i}`, i % 2 === 0 ? ps[0] : ps[1]);
					continue;
				}
				slot.set(`${g}:${i}`, i % 2 === 0 ? father : mother);
			}
		}
		const rad = (deg: number) => (deg * Math.PI) / 180;
		const pt = (r: number, deg: number) => [Math.cos(rad(deg)) * r, Math.sin(rad(deg)) * r];
		const sector = (r0: number, r1: number, a0: number, a1: number) => {
			const [x0, y0] = pt(r1, a0);
			const [x1, y1] = pt(r1, a1);
			const [x2, y2] = pt(r0, a1);
			const [x3, y3] = pt(r0, a0);
			const large = a1 - a0 > 180 ? 1 : 0;
			return `M${x0},${y0} A${r1},${r1} 0 ${large} 1 ${x1},${y1} L${x2},${y2} A${r0},${r0} 0 ${large} 0 ${x3},${y3} Z`;
		};
		const cards = svg("g", { class: "chronicle-fan-cells" }, this.layer);
		for (let g = 1; g <= gens; g++) {
			const n = 2 ** g;
			const r0 = R0 + (g - 1) * ring;
			const r1 = r0 + ring - 3;
			for (let i = 0; i < n; i++) {
				const a0 = 180 + (180 * i) / n;
				const a1 = 180 + (180 * (i + 1)) / n;
				const e = slot.get(`${g}:${i}`);
				const cell = svg("g", { class: "chronicle-fan-cell" + (e ? "" : " is-empty") }, cards);
				svg("path", { d: sector(r0, r1, a0 + 0.4, a1 - 0.4) }, cell);
				if (!e) continue;
				cell.setAttribute("style", `--cell-color: ${entityColor(this.plugin, e)}; --i: ${g}`);
				const mid = (a0 + a1) / 2;
				const rm = (r0 + r1) / 2;
				const [tx, ty] = pt(rm, mid);
				// Wide inner cells read along the ring; narrow outer ones read outwards.
				const tangential = g <= 2;
				let rot = tangential ? mid + 90 : mid;
				if (!tangential && mid < 270) rot += 180;
				const arcLen = (rad(a1 - a0) * rm);
				const room = tangential ? arcLen : ring - 6;
				const maxChars = Math.max(3, Math.floor(room / 6.2));
				const label = svg("text", { x: tx, y: ty, transform: `rotate(${rot} ${tx} ${ty})`, "text-anchor": "middle", "dominant-baseline": "middle", class: "chronicle-fan-name" }, cell);
				label.textContent = e.name.length > maxChars ? e.name.slice(0, maxChars - 1) + "…" : e.name;
				if (tangential || arcLen > 26) {
					const cal = this.plugin.calendars.get(e.calendar);
					let years = formatSpan(e.start, e.end, cal);
					// Full dates rarely fit a wedge; fall back to bare years, then leave them to the tooltip.
					if (years.length * 5.6 > room) years = [e.start, e.end].map((d) => (d ? cal.formatYear(cal.fromDays(d.start).y) : "?")).join("–");
					if (years.length * 5.6 > room) years = "";
					if (years && room > 60) {
						const off = tangential ? 13 : 0;
						const [yx, yy] = tangential ? pt(rm - off, mid) : [tx, ty];
						if (tangential) {
							const yt = svg("text", { x: yx, y: yy, transform: `rotate(${rot} ${yx} ${yy})`, "text-anchor": "middle", "dominant-baseline": "middle", class: "chronicle-fan-years" }, cell);
							yt.textContent = years;
						}
					}
				}
				const title = svg("title", {}, cell);
				title.textContent = `${e.name}\n${formatSpan(e.start, e.end, this.plugin.calendars.get(e.calendar))}`;
				this.wire(cell, e.key);
			}
		}
		// The person in the middle.
		const centre = svg("g", { class: "chronicle-fan-cell is-root" }, cards);
		centre.setAttribute("style", `--cell-color: ${entityColor(this.plugin, rootE)}`);
		svg("path", { d: sector(0.01, R0 - 3, 180, 360) }, centre);
		const t = svg("text", { x: 0, y: -24, "text-anchor": "middle", class: "chronicle-fan-name is-root" }, centre);
		t.textContent = rootE.name;
		const ys = svg("text", { x: 0, y: -8, "text-anchor": "middle", class: "chronicle-fan-years" }, centre);
		ys.textContent = formatSpan(rootE.start, rootE.end, this.plugin.calendars.get(rootE.calendar));
		this.wire(centre, rootE.key);
		const R = R0 + gens * ring;
		this.bbox = { x: -R, y: -R, width: 2 * R, height: R + 10 };
		if (!this.pz.touched) requestAnimationFrame(() => this.fit());
	}
}

/**
 * Descendants laid out over time: each person is a bar from birth to death at their own row, and
 * each child hangs from their parent's bar at the year they were born, so generations line up in
 * time and you can see who was alive together.
 */
export class TimeTreeRenderer extends SvgChart {
	constructor(container: HTMLElement, plugin: ChroniclePlugin, options: FamilyOptions, embedded = false, hoverParent: { hoverPopover: unknown } | HTMLElement = container) {
		super(container, plugin, options, embedded, hoverParent, "chronicle-timetree");
		this.refresh();
	}

	refresh() {
		if (!this.reset()) return;
		const idx = this.plugin.index;
		const rootE = idx.get(this.options.root)!;
		const cal = this.plugin.calendars.get(rootE.calendar);
		const depth = Math.max(1, Math.min(10, this.options.down || 4));
		type Row = { e: Entity; depth: number; a: number; b: number; guessed: boolean; parentRow?: number };
		const rows: Row[] = [];
		const seen = new Set<string>();
		const walk = (e: Entity, d: number, parentRow: number | undefined, parentBirth: number | undefined) => {
			if (seen.has(e.key)) return;
			seen.add(e.key);
			// No birth date: about 25 years after the parent's, so the tree still reads in order.
			const guessed = !e.start;
			const a = e.start?.start ?? (parentBirth !== undefined ? parentBirth + 25 * YEAR : rows.length ? rows[rows.length - 1].a : 0);
			const b = e.end?.end ?? (e.start ? Math.min(a + 70 * YEAR, Math.max(a, (e.start?.end ?? a))) : a + 60 * YEAR);
			const me = rows.push({ e, depth: d, a, b: e.end ? b : a + 70 * YEAR, guessed, parentRow }) - 1;
			if (d >= depth) return;
			const kids = idx.children(e.key).map((k) => idx.get(k)).filter((k): k is Entity => !!k).sort((x, y) => (x.start?.start ?? Infinity) - (y.start?.start ?? Infinity));
			for (const k of kids) walk(k, d + 1, me, a);
		};
		walk(rootE, 0, undefined, undefined);
		let min = Math.min(...rows.map((r) => r.a));
		let max = Math.max(...rows.map((r) => r.b));
		const pad = (max - min) * 0.03 + YEAR;
		min -= pad;
		max += pad;
		const ROW = 30;
		const LEFT = 10;
		// Spread the years across the space there is, so names stay readable without zooming.
		const room = (this.svgEl.getBoundingClientRect().width || 1000) - 300;
		const width = Math.max(500, Math.min(2400, ((max - min) / YEAR) * Math.max(3, Math.min(9, room / ((max - min) / YEAR)))));
		const x = (d: number) => LEFT + ((d - min) / (max - min)) * width;
		const AXIS = 30;
		const height = AXIS + rows.length * ROW + 10;
		// Axis
		const axis = svg("g", { class: "chronicle-lineage-axis" }, this.layer);
		const yearPx = (width / (max - min)) * YEAR;
		const nice = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
		const step = nice.find((s) => s * yearPx >= 70) ?? 1000;
		const ticks = yearTicks(cal, cal.fromDays(min).y, cal.fromDays(max).y, step, step * 5).map((t) => ({ ...t, x: x(cal.toDays(t.year, 1, 1)), label: cal.formatYear(t.year) }));
		const labelled = spacedLabels(ticks);
		for (const t of ticks) {
			svg("line", { x1: t.x, x2: t.x, y1: AXIS - 6, y2: height, class: "chronicle-lineage-grid" + (t.era ? " is-era" : "") }, axis);
			if (!labelled.has(t)) continue;
			const tx = svg("text", { x: t.x, y: AXIS - 12, "text-anchor": "middle", class: "chronicle-lineage-tick" }, axis);
			tx.textContent = t.label;
		}
		const links = svg("g", { class: "chronicle-timetree-links" }, this.layer);
		const bars = svg("g", {}, this.layer);
		rows.forEach((r, i) => {
			const y = AXIS + i * ROW + 6;
			if (r.parentRow !== undefined) {
				const py = AXIS + r.parentRow * ROW + 6 + 9;
				const cx = x(r.a);
				svg("path", { d: `M${cx},${py} V${y + 9} H${cx + 2}`, class: "chronicle-timetree-link" }, links);
			}
			const g = svg("g", { class: "chronicle-timetree-person" + (r.guessed ? " is-guessed" : "") + (r.e.end ? "" : " is-open") }, bars);
			g.setAttribute("style", `--item-color: ${entityColor(this.plugin, r.e)}`);
			svg("rect", { x: x(r.a), y, width: Math.max(6, x(r.b) - x(r.a)), height: 18, rx: 9, class: "chronicle-timetree-bar" }, g);
			const label = svg("text", { x: x(r.a) + 8, y: y + 13, class: "chronicle-timetree-name" }, g);
			const pcal = this.plugin.calendars.get(r.e.calendar);
			const span = formatSpan(r.e.start, r.e.end, pcal);
			// Full dates when they fit on the bar, otherwise just the years (the tooltip has the rest).
			const barW = Math.max(6, x(r.b) - x(r.a)) - 14;
			const years = [r.e.start, r.e.end].map((d) => (d ? pcal.formatYear(pcal.fromDays(d.start).y) : "?")).join("–");
			const shown = !span ? (r.guessed ? "  (no dates)" : "") : (r.e.name.length + span.length + 2) * 6.2 <= barW ? `  ${span}` : `  ${years}`;
			label.textContent = r.e.name + shown;
			const title = svg("title", {}, g);
			title.textContent = `${r.e.name}${span ? `\n${span}` : "\nNo birth date: placed about 25 years after their parent"}\nDouble-click to start the tree from them`;
			this.wire(g, r.e.key);
		});
		this.bbox = { x: 0, y: 0, width: width + 260, height };
		if (!this.pz.touched) {
			requestAnimationFrame(() => {
				const rect = this.svgEl.getBoundingClientRect();
				this.pz.k = Math.min(1, (rect.width || width) / (width + 280));
				this.pz.x = 10;
				this.pz.y = 6;
				this.pz.apply();
			});
		}
	}
}
