import { Menu, Notice, TFile } from "obsidian";
import type UniverseViewPlugin from "../main";
import type { Entity, MoonDef } from "../types";
import { type Calendar, holidaysOn, moonPhase, phaseName, seasonOf } from "../dates/calendars";
import { formatDay, formatSpan } from "../dates/parser";
import { buildFieldAliases } from "../settings";
import { bindHover, el, entityColor, icon, openEntity, showEntityMenu, svg } from "./common";

export type CalendarMode = "month" | "week" | "year" | "agenda";

export interface CalendarOptions {
	calendar?: string;
	folder?: string;
	mode: CalendarMode;
	/** The month on show (year and 1-based month). */
	year?: number;
	month?: number;
	/** The day picked (universal day). */
	selected?: number;
	moons: boolean;
	birthdays: boolean;
	holidays: boolean;
	story: boolean;
	/** Events remembered on their day in later years, and the dead on the day they died. */
	anniversaries?: boolean;
}

export const DEFAULT_CALENDAR_OPTIONS: CalendarOptions = { mode: "month", moons: true, birthdays: true, holidays: true, story: true };

/** Something on a day of the calendar. */
interface DayItem {
	kind: "event" | "repeat" | "birthday" | "anniversary" | "holiday" | "story" | "season";
	label: string;
	key?: string;
	color?: string;
	/** For events lasting several days: whether this day is the first or last of them. */
	first?: boolean;
	last?: boolean;
	/** Events can be dragged to another day. */
	movable?: boolean;
	sort: number;
	/** For events lasting several days: the row they keep on every day, so the pieces line up as one bar. */
	slot?: number;
}

/** A moon drawn at its phase: the lit part is a limb arc plus the terminator, an ellipse. */
export function moonIcon(p: number, size: number, color = "#e9e3c9"): SVGSVGElement {
	const r = size / 2;
	const s = svg("svg", { width: size, height: size, viewBox: `${-r} ${-r} ${size} ${size}`, class: "universeview-moon" });
	svg("circle", { r: r - 0.5, class: "universeview-moon-dark" }, s);
	const k = Math.cos(2 * Math.PI * p);
	const rx = Math.abs(k) * (r - 0.5);
	const R = r - 0.5;
	const waxing = p < 0.5;
	let d: string;
	if (Math.abs(p - 0.5) < 0.02) d = `M0,${-R} A${R},${R} 0 1 1 0,${R} A${R},${R} 0 1 1 0,${-R}`;
	else if (p < 0.02 || p > 0.98) d = "";
	else if (waxing) d = `M0,${-R} A${R},${R} 0 0 1 0,${R} A${rx},${R} 0 0 ${k > 0 ? 0 : 1} 0,${-R}`;
	else d = `M0,${-R} A${R},${R} 0 0 0 0,${R} A${rx},${R} 0 0 ${k > 0 ? 1 : 0} 0,${-R}`;
	if (d) svg("path", { d, class: "universeview-moon-lit", style: `fill: ${color}` }, s);
	return s;
}

/**
 * A calendar of your world: a month as weeks (festival days on their own), a whole year at a glance,
 * or what's coming up. Shows events, recurring festivals, birthdays, story chapters, holidays,
 * seasons and the phases of every moon, and marks today in the world.
 */
export class CalendarRenderer {
	private root: HTMLElement;
	private head: HTMLElement;
	private body: HTMLElement;
	private side: HTMLElement;
	/** Set by the view: the options changed (month turned, day picked). */
	onOptionsChange?: () => void;

	constructor(private container: HTMLElement, private plugin: UniverseViewPlugin, public options: CalendarOptions, private embedded = false, private hoverParent: { hoverPopover: unknown } | HTMLElement = container) {
		this.root = el("div", { cls: "universeview-cal" + (embedded ? " is-embedded" : "") }, container);
		this.head = el("div", { cls: "universeview-cal-head" }, this.root);
		const main = el("div", { cls: "universeview-cal-main" }, this.root);
		this.body = el("div", { cls: "universeview-cal-body" }, main);
		this.side = el("div", { cls: "universeview-cal-side" }, main);
		this.keys();
		this.refresh();
	}

	destroy() {
		this.root.remove();
	}

	cal(): Calendar {
		const idx = this.plugin.index;
		return this.plugin.calendars.get(this.options.calendar ?? idx.calendarFor(this.options.folder ?? ""));
	}

	/** Today in this world, if known. */
	today(): number | undefined {
		return this.plugin.todayFor(this.options.folder ?? "", this.cal().id);
	}

	/** The month shown: as set, else today's, else the month of the latest event. */
	private current(): { y: number; m: number } {
		const cal = this.cal();
		if (this.options.year !== undefined && this.options.month !== undefined) return { y: this.options.year, m: Math.min(Math.max(1, this.options.month), cal.monthCount(this.options.year)) };
		const day = this.options.selected ?? this.today() ?? this.latestEvent();
		const { y, m } = cal.fromDays(day ?? 0);
		return { y, m };
	}

	private latestEvent(): number | undefined {
		const days = this.events().map((e) => e.start!.start);
		return days.length ? Math.max(...days) : undefined;
	}

	private events(): Entity[] {
		const f = this.options.folder;
		return this.plugin.index.all("event").filter((e) => e.start && (!f || e.path.startsWith(f + "/")));
	}

	goTo(day: number) {
		const { y, m } = this.cal().fromDays(day);
		this.options.year = y;
		this.options.month = m;
		this.options.selected = day;
		this.changed();
	}

	/** Moves by months (or years in the year view). */
	step(n: number) {
		const cal = this.cal();
		let { y, m } = this.current();
		if (this.options.mode === "week") {
			const base = this.options.selected ?? this.today() ?? cal.toDays(y, m, 1);
			this.goTo(base + n * (cal.weekdays.length || 7));
			return;
		}
		if (this.options.mode === "year") y += n;
		else {
			m += n;
			while (m < 1) {
				y--;
				m += cal.monthCount(y);
			}
			while (m > cal.monthCount(y)) {
				m -= cal.monthCount(y);
				y++;
			}
		}
		this.options.year = y;
		this.options.month = m;
		this.changed();
	}

	private changed() {
		this.onOptionsChange?.();
		this.refresh();
	}

	refresh() {
		const cal = this.cal();
		this.head.empty();
		this.body.empty();
		const { y, m } = this.current();
		const title = el("div", { cls: "universeview-cal-title" }, this.head);
		const prev = el("button", { cls: "universeview-cal-nav clickable-icon", attr: { "aria-label": this.options.mode === "year" ? "Previous year" : "Previous month" } }, title);
		icon(prev, "chevron-left");
		prev.addEventListener("click", () => this.step(-1));
		const label = el("button", { cls: "universeview-cal-label", attr: { title: this.options.mode === "month" ? "Show the whole year" : "Show this month" } }, title);
		if (this.options.mode === "week") el("span", { cls: "universeview-cal-week-of", text: "Week of" }, label);
		el("span", { cls: "universeview-cal-month", text: this.options.mode === "year" ? "" : cal.monthNames[m - 1] ?? `Month ${m}` }, label);
		el("span", { cls: "universeview-cal-year", text: cal.formatYear(y) }, label);
		label.addEventListener("click", () => {
			this.options.mode = this.options.mode === "month" ? "year" : "month";
			this.changed();
		});
		const next = el("button", { cls: "universeview-cal-nav clickable-icon", attr: { "aria-label": this.options.mode === "year" ? "Next year" : "Next month" } }, title);
		icon(next, "chevron-right");
		next.addEventListener("click", () => this.step(1));
		const today = this.today();
		if (today !== undefined) {
			const t = el("button", { cls: "universeview-chip", text: "Today", attr: { title: formatDay(today, cal) } }, this.head);
			t.addEventListener("click", () => this.goTo(today));
		}
		const season = seasonOf(cal, this.options.selected ?? today ?? cal.toDays(y, m, 1));
		if (season && this.options.mode !== "year") {
			const s = el("span", { cls: "universeview-cal-season", text: season.name }, this.head);
			if (season.color) s.style.setProperty("--season", season.color);
		}
		this.goToBox();
		if (this.options.mode === "year") this.drawYear(y);
		else if (this.options.mode === "week") this.drawWeek();
		else if (this.options.mode === "agenda") this.drawAgenda();
		else this.drawMonth(y, m);
		this.drawSide();
	}

	// ---- What's on each day ---------------------------------------------------------------------

	/** Everything on the days from `a` to `b` (inclusive), by day. */
	private itemsBetween(a: number, b: number): Map<number, DayItem[]> {
		const cal = this.cal();
		const idx = this.plugin.index;
		const out = new Map<number, DayItem[]>();
		const put = (day: number, item: DayItem) => {
			if (day < a || day > b) return;
			const list = out.get(day) ?? [];
			list.push(item);
			out.set(day, list);
		};
		const f = this.options.folder;
		const inScope = (e: Entity) => !f || e.path.startsWith(f + "/");
		for (const e of this.events()) {
			const s = e.start!;
			const color = entityColor(this.plugin, e);
			if (e.repeat) {
				// Every year (month, week) from the first time on, until it ends.
				const first = cal.fromDays(s.start);
				const until = e.end ? e.end.end : Infinity;
				for (let day = a; day <= b; day++) {
					if (day < s.start || day > until) continue;
					const d = cal.fromDays(day);
					const hit = e.repeat === "yearly" ? d.m === first.m && d.d === first.d : e.repeat === "monthly" ? d.d === first.d : cal.weekdays.length ? cal.weekdayOf(day) === cal.weekdayOf(s.start) : (day - s.start) % 7 === 0;
					if (hit) put(day, { kind: day === s.start ? "event" : "repeat", label: e.name, key: e.key, color, sort: 1 });
				}
				continue;
			}
			if (s.precision !== "day") continue;
			if (this.options.anniversaries !== false) this.anniversaries(a, b, s.start, (day, years) => put(day, { kind: "anniversary", label: ` · ${years} year${years === 1 ? "" : "s"} ago`, key: e.key, color, sort: 6 }));
			const end = e.end && e.end.precision === "day" ? e.end.start : s.start;
			for (let day = Math.max(a, s.start); day <= Math.min(b, end, s.start + 400); day++) {
				put(day, { kind: "event", label: e.name, key: e.key, color, first: day === s.start, last: day === end, movable: day === s.start, sort: end > s.start ? 0 : 2 });
			}
		}
		if (this.options.birthdays) {
			for (const p of idx.all("person")) {
				if (!inScope(p) || p.start?.precision !== "day") continue;
				const b0 = cal.fromDays(p.start.start);
				const died = p.end?.start;
				for (let y = cal.fromDays(a).y; y <= cal.fromDays(b).y; y++) {
					if (y <= b0.y) continue;
					if (b0.m > cal.monthCount(y)) continue;
					const day = cal.toDays(y, b0.m, Math.min(b0.d, cal.monthDays(y, b0.m)));
					if (died !== undefined && day > died) continue;
					put(day, { kind: "birthday", label: `${p.name} turns ${y - b0.y}`, key: p.key, color: entityColor(this.plugin, p), sort: 3 });
				}
			}
		}
		// The dead, remembered on the day they died.
		if (this.options.birthdays && this.options.anniversaries !== false) {
			for (const p of idx.all("person")) {
				if (!inScope(p) || p.end?.precision !== "day") continue;
				this.anniversaries(a, b, p.end.start, (day, years) => put(day, { kind: "anniversary", label: ` died ${years} year${years === 1 ? "" : "s"} ago`, key: p.key, color: entityColor(this.plugin, p), sort: 6 }));
			}
		}
		if (this.options.story) {
			for (const sc of idx.scenes) {
				if (f && !sc.path.startsWith(f + "/")) continue;
				if (sc.date.precision !== "day") continue;
				put(sc.date.start, { kind: "story", label: sc.name, key: sc.path, sort: 4 });
			}
		}
		for (let day = a; day <= b; day++) {
			if (this.options.holidays) for (const h of holidaysOn(cal, day)) put(day, { kind: "holiday", label: h.name, color: h.color, sort: -1 });
			// The first day of each season.
			const s = seasonOf(cal, day);
			if (s && seasonOf(cal, day - 1) !== s) put(day, { kind: "season", label: s.name, color: s.color, sort: -2 });
		}
		for (const list of out.values()) list.sort((x, y) => x.sort - y.sort || x.label.localeCompare(y.label));
		// Events lasting several days keep one row from their first day to their last: the lowest row
		// free when they start, held until they end.
		const held = new Map<string, number>();
		for (let day = a; day <= b; day++) {
			const list = out.get(day) ?? [];
			const spans = list.filter((i) => i.kind === "event" && (i.first === false || i.last === false));
			const here = new Set(spans.map((i) => i.key!));
			for (const k of [...held.keys()]) if (!here.has(k)) held.delete(k);
			const used = new Set(held.values());
			for (const it of spans) {
				let slot = held.get(it.key!);
				if (slot === undefined) {
					slot = 0;
					while (used.has(slot)) slot++;
					held.set(it.key!, slot);
					used.add(slot);
				}
				it.slot = slot;
			}
		}
		return out;
	}

	// ---- Month ------------------------------------------------------------------------------------

	private drawMonth(y: number, m: number) {
		const cal = this.cal();
		const first = cal.toDays(y, m, 1);
		const len = cal.monthDays(y, m);
		const items = this.itemsBetween(first, first + len - 1);
		// Events dated only to this month (no day) sit above the grid.
		const loose = this.events().filter((e) => e.start!.precision === "month" && cal.fromDays(e.start!.start).y === y && cal.fromDays(e.start!.start).m === m);
		if (loose.length) {
			const strip = el("div", { cls: "universeview-cal-loose" }, this.body);
			el("span", { cls: "universeview-cal-loose-label", text: "This month:" }, strip);
			for (const e of loose) this.chip(strip, { kind: "event", label: e.name, key: e.key, color: entityColor(this.plugin, e), sort: 0 }, first);
		}
		if (cal.isIntercalary(y, m)) {
			// Festival days stand outside the weeks: drawn as a row of their own.
			el("div", { cls: "universeview-cal-festival-note", text: "Festival days, outside the weeks" }, this.body);
			const row = el("div", { cls: "universeview-cal-festival" }, this.body);
			for (let d = 1; d <= len; d++) this.dayCell(row, first + d - 1, d, items);
			return;
		}
		const cols = cal.weekdays.length || 7;
		const grid = el("div", { cls: "universeview-cal-grid" }, this.body);
		grid.style.setProperty("--cols", String(cols));
		if (cal.weekdays.length) for (const w of cal.weekdays) el("div", { cls: "universeview-cal-weekday", text: w.length > 9 ? w.slice(0, 3) : w, attr: { title: w } }, grid);
		const lead = Math.max(0, cal.weekdayOf(first));
		for (let i = 0; i < lead; i++) el("div", { cls: "universeview-cal-day is-blank" }, grid);
		for (let d = 1; d <= len; d++) this.dayCell(grid, first + d - 1, d, items);
	}

	private dayCell(parent: HTMLElement, day: number, n: number, items: Map<number, DayItem[]>) {
		const cal = this.cal();
		const list = items.get(day) ?? [];
		const cell = el("div", { cls: "universeview-cal-day", attr: { "data-day": String(day), tabindex: "0", role: "button" } }, parent);
		const today = this.today();
		if (day === today) cell.addClass("is-today");
		if (day === this.options.selected) cell.addClass("is-selected");
		const top = el("div", { cls: "universeview-cal-day-top" }, cell);
		el("span", { cls: "universeview-cal-num", text: String(n) }, top);
		if (this.options.moons && cal.moons.length) {
			const moons = el("span", { cls: "universeview-cal-moons" }, top);
			for (const mo of cal.moons) {
				const p = moonPhase(day, mo);
				const ic = moonIcon(p, 13, mo.color);
				ic.appendChild(svg("title", {})).textContent = `${mo.name}: ${phaseName(p).toLowerCase()}`;
				moons.appendChild(ic);
			}
		}
		const shown = list.filter((i) => i.kind !== "season");
		const season = list.find((i) => i.kind === "season");
		if (season) {
			const s = el("div", { cls: "universeview-cal-season-start", text: season.label }, cell);
			if (season.color) s.style.setProperty("--season", season.color);
		}
		const max = this.options.mode === "week" ? 99 : this.embedded ? 2 : 3;
		// Several-day events first, each in its own row (a gap where a row is free today), so they run
		// across the days as bars; then the day's own things.
		const bars = shown.filter((i) => i.slot !== undefined);
		const rest = shown.filter((i) => i.slot === undefined);
		const rows = bars.length ? Math.max(...bars.map((i) => i.slot!)) + 1 : 0;
		let used = 0;
		for (let s = 0; s < rows && used < max; s++, used++) {
			const it = bars.find((i) => i.slot === s);
			if (it) this.chip(cell, it, day, true);
			else el("div", { cls: "universeview-cal-bar-gap" }, cell);
		}
		const room = Math.max(0, max - used);
		for (const it of rest.slice(0, room)) this.chip(cell, it, day);
		const hidden = bars.filter((i) => i.slot! >= used).length + Math.max(0, rest.length - room);
		if (hidden > 0) el("div", { cls: "universeview-cal-more", text: `+${hidden} more` }, cell);
		cell.addEventListener("click", () => {
			this.options.selected = day;
			this.onOptionsChange?.();
			this.root.querySelectorAll(".universeview-cal-day.is-selected").forEach((c) => c.removeClass("is-selected"));
			cell.addClass("is-selected");
			this.drawSide();
		});
		cell.addEventListener("dblclick", () => this.newEvent(day));
		cell.addEventListener("keydown", (evt) => {
			if (evt.key === "Enter") cell.click();
		});
		cell.addEventListener("contextmenu", (evt) => {
			evt.preventDefault();
			const menu = new Menu();
			menu.addItem((i) => i.setTitle("New event on this day").setIcon("calendar-plus").onClick(() => this.newEvent(day)));
			menu.addItem((i) => i.setTitle("Make this today in the world").setIcon("calendar-check").onClick(() => void this.plugin.setToday(this.options.folder ?? "", cal.id, day).then(() => this.refresh())));
			menu.showAtMouseEvent(evt);
		});
		// Drop an event here to move it to this day.
		cell.addEventListener("dragover", (evt) => {
			if (evt.dataTransfer?.types.includes("application/x-universe-event")) {
				evt.preventDefault();
				cell.addClass("is-drop");
			}
		});
		cell.addEventListener("dragleave", () => cell.removeClass("is-drop"));
		cell.addEventListener("drop", (evt) => {
			cell.removeClass("is-drop");
			const key = evt.dataTransfer?.getData("application/x-universe-event");
			if (!key) return;
			evt.preventDefault();
			void this.moveEvent(key, day);
		});
	}

	private chip(parent: HTMLElement, it: DayItem, day: number, bar = false) {
		const c = el("div", { cls: `universeview-cal-chip kind-${it.kind}` + (it.first === false ? " is-cont" : "") + (it.last === false ? " is-open" : "") + (bar ? " is-bar" : "") }, parent);
		if (it.color) c.style.setProperty("--chip", it.color);
		if (it.key) c.dataset.key = it.key;
		const glyph = it.kind === "anniversary" ? "history" : it.kind === "birthday" ? "cake" : it.kind === "holiday" ? "party-popper" : it.kind === "story" ? "book-open" : it.kind === "repeat" ? "repeat" : "";
		if (glyph) icon(el("span", { cls: "universeview-cal-chip-icon" }, c), glyph);
		// A bar is named where it starts, and again at the start of each week (or month) it runs into.
		const cal = this.cal();
		const named = !bar || it.first !== false || cal.weekdayOf(day) === 0 || cal.fromDays(day).d === 1 || this.options.mode === "week";
		el("span", { text: it.label, cls: named ? "" : "is-hidden-label" }, c);
		c.setAttribute("title", it.label);
		if (it.key) {
			c.addEventListener("click", (evt) => {
				evt.stopPropagation();
				openEntity(this.plugin, it.key!, evt);
			});
			c.addEventListener("contextmenu", (evt) => {
				evt.preventDefault();
				evt.stopPropagation();
				showEntityMenu(this.plugin, it.key!, evt);
			});
			bindHover(this.plugin, c, it.key, this.hoverParent);
		}
		if (it.movable && it.key) {
			c.draggable = true;
			c.addClass("is-movable");
			c.addEventListener("dragstart", (evt) => {
				evt.dataTransfer?.setData("application/x-universe-event", it.key!);
				evt.dataTransfer?.setData("text/plain", it.label);
			});
		}
		void day;
	}

	/** The same day of the year in each later year from `a` to `b`, with how many years on. */
	private anniversaries(a: number, b: number, from: number, put: (day: number, years: number) => void) {
		const cal = this.cal();
		const d0 = cal.fromDays(from);
		for (let y = Math.max(d0.y + 1, cal.fromDays(a).y); y <= cal.fromDays(b).y; y++) {
			if (d0.m > cal.monthCount(y)) continue;
			put(cal.toDays(y, d0.m, Math.min(d0.d, cal.monthDays(y, d0.m))), y - d0.y);
		}
	}

	// ---- Week -------------------------------------------------------------------------------------

	/** One week, each day a tall column with everything on it. */
	private drawWeek() {
		const cal = this.cal();
		const cols = cal.weekdays.length || 7;
		const base = this.options.selected ?? this.today() ?? cal.toDays(this.current().y, this.current().m, 1);
		const w = cal.weekdayOf(base);
		const start = base - Math.max(0, w);
		const items = this.itemsBetween(start, start + cols - 1);
		const grid = el("div", { cls: "universeview-cal-grid universeview-cal-week" }, this.body);
		grid.style.setProperty("--cols", String(cols));
		for (let i = 0; i < cols; i++) {
			const day = start + i;
			const d = cal.fromDays(day);
			el("div", { cls: "universeview-cal-weekday", text: `${cal.weekdays[i] ?? ""} ${d.d} ${(cal.monthNames[d.m - 1] ?? "").slice(0, 3)}`.trim() }, grid);
		}
		for (let i = 0; i < cols; i++) this.dayCell(grid, start + i, cal.fromDays(start + i).d, items);
	}

	// ---- Moving about -----------------------------------------------------------------------------

	/** A box to jump to any date, written in this calendar. */
	private goToBox() {
		const cal = this.cal();
		const box = el("input", { cls: "universeview-cal-goto", attr: { type: "text", placeholder: "Go to a date…", "aria-label": "Go to a date (Enter)" } }, this.head);
		box.addEventListener("keydown", (evt) => {
			if (evt.key !== "Enter") return;
			evt.stopPropagation();
			const d = this.plugin.parseDate(box.value.trim(), cal.id);
			if (!d) {
				box.addClass("is-error");
				return;
			}
			if (this.options.mode === "agenda") this.options.mode = "month";
			this.goTo(d.start);
		});
		box.addEventListener("input", () => box.removeClass("is-error"));
	}

	/** Arrows move the picked day, Page Up/Down turn the page, T goes to today, N adds an event. */
	private keys() {
		this.root.tabIndex = -1;
		this.root.addEventListener("keydown", (evt) => {
			if ((evt.target as HTMLElement).closest("input, textarea, select") || evt.ctrlKey || evt.metaKey || evt.altKey) return;
			const cal = this.cal();
			const week = cal.weekdays.length || 7;
			const day = this.options.selected ?? this.today();
			const move: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -week, ArrowDown: week };
			if (evt.key in move && day !== undefined && this.options.mode !== "year") this.goTo(day + move[evt.key]);
			else if (evt.key === "PageUp") this.step(-1);
			else if (evt.key === "PageDown") this.step(1);
			else if (evt.key.toLowerCase() === "t" && this.today() !== undefined) this.goTo(this.today()!);
			else if (evt.key.toLowerCase() === "n" && day !== undefined) this.newEvent(day);
			else return;
			evt.preventDefault();
			// Keep the keys working on the redrawn grid.
			this.root.focus();
		});
	}

	// ---- Year -------------------------------------------------------------------------------------

	private drawYear(y: number) {
		const cal = this.cal();
		const start = cal.toDays(y, 1, 1);
		const end = start + cal.yearDays(y) - 1;
		const items = this.itemsBetween(start, end);
		const yearly = this.events().filter((e) => e.start!.precision === "year" && cal.fromDays(e.start!.start).y === y);
		if (yearly.length) {
			const strip = el("div", { cls: "universeview-cal-loose" }, this.body);
			el("span", { cls: "universeview-cal-loose-label", text: "This year:" }, strip);
			for (const e of yearly) this.chip(strip, { kind: "event", label: e.name, key: e.key, color: entityColor(this.plugin, e), sort: 0 }, start);
		}
		const grid = el("div", { cls: "universeview-cal-year-grid" }, this.body);
		const today = this.today();
		for (let m = 1; m <= cal.monthCount(y); m++) {
			const box = el("div", { cls: "universeview-cal-mini" + (cal.isIntercalary(y, m) ? " is-festival" : "") }, grid);
			const head = el("button", { cls: "universeview-cal-mini-head", text: cal.monthNames[m - 1] ?? `Month ${m}` }, box);
			head.addEventListener("click", () => {
				this.options.mode = "month";
				this.options.year = y;
				this.options.month = m;
				this.changed();
			});
			const first = cal.toDays(y, m, 1);
			const cols = cal.isIntercalary(y, m) ? Math.min(7, cal.monthDays(y, m)) : cal.weekdays.length || 7;
			const g = el("div", { cls: "universeview-cal-mini-grid" }, box);
			g.style.setProperty("--cols", String(cols));
			const lead = cal.isIntercalary(y, m) ? 0 : Math.max(0, cal.weekdayOf(first));
			for (let i = 0; i < lead; i++) el("span", {}, g);
			for (let d = 1; d <= cal.monthDays(y, m); d++) {
				const day = first + d - 1;
				const list = (items.get(day) ?? []).filter((i) => i.kind !== "season");
				const c = el("span", { cls: "universeview-cal-mini-day" + (list.length ? " has-items" : "") + (day === today ? " is-today" : "") + (day === this.options.selected ? " is-selected" : ""), text: String(d) }, g);
				// Busier days darker, so a year's crowded stretches stand out.
				const busy = list.filter((i) => i.kind === "event" || i.kind === "story").length;
				if (busy) c.style.setProperty("--heat", String(Math.min(1, 0.25 + busy * 0.25)));
				const hol = list.find((i) => i.kind === "holiday");
				if (hol) c.addClass("is-holiday");
				if (list.length) c.setAttribute("title", list.map((i) => i.label).join("\n"));
				c.addEventListener("click", () => this.goTo(day));
			}
		}
	}

	// ---- Coming up --------------------------------------------------------------------------------

	private drawAgenda() {
		const cal = this.cal();
		const from = this.options.selected ?? this.today() ?? this.latestEvent() ?? 0;
		const items = this.itemsBetween(from, from + 120);
		const list = el("div", { cls: "universeview-cal-agenda" }, this.body);
		let shown = 0;
		for (let day = from; day <= from + 120 && shown < 60; day++) {
			const its = items.get(day) ?? [];
			const moonNotes = this.options.moons ? cal.moons.map((mo) => ({ mo, p: moonPhase(day, mo) })).filter(({ mo, p }) => this.isQuarter(day, mo, p)) : [];
			if (!its.length && !moonNotes.length) continue;
			shown++;
			const row = el("div", { cls: "universeview-cal-agenda-day" + (day === this.today() ? " is-today" : "") }, list);
			const w = cal.weekdayOf(day);
			const date = el("button", { cls: "universeview-cal-agenda-date", text: `${w >= 0 ? cal.weekdays[w] + ", " : ""}${formatDay(day, cal)}` }, row);
			date.addEventListener("click", () => {
				this.options.mode = "month";
				this.goTo(day);
			});
			const what = el("div", { cls: "universeview-cal-agenda-items" }, row);
			for (const it of its) this.chip(what, it, day);
			for (const { mo, p } of moonNotes) {
				const c = el("div", { cls: "universeview-cal-chip kind-moon" }, what);
				c.appendChild(moonIcon(p, 12, mo.color));
				el("span", { text: `${phaseName(p)}${cal.moons.length > 1 ? ` (${mo.name})` : ""}` }, c);
			}
		}
		if (!shown) el("div", { cls: "universeview-dash-muted", text: "Nothing in the next 120 days." }, list);
	}

	/** Whether a moon reaches new, quarter or full on this day (the day nearest the exact phase). */
	private isQuarter(day: number, mo: MoonDef, p: number): boolean {
		const step = 1 / mo.cycle;
		return [0, 0.25, 0.5, 0.75, 1].some((q) => Math.abs(p - q) < step / 2);
	}

	// ---- The day picked -------------------------------------------------------------------------

	private drawSide() {
		const side = this.side;
		side.empty();
		const cal = this.cal();
		const day = this.options.selected;
		this.root.toggleClass("has-side", day !== undefined && !this.embedded);
		if (day === undefined || this.embedded) return;
		const w = cal.weekdayOf(day);
		el("div", { cls: "universeview-cal-side-weekday", text: w >= 0 ? cal.weekdays[w] : cal.isIntercalary(cal.fromDays(day).y, cal.fromDays(day).m) ? "Festival day" : "" }, side);
		el("div", { cls: "universeview-cal-side-date", text: formatDay(day, cal) }, side);
		const today = this.today();
		if (today !== undefined && today !== day) {
			const diff = day - today;
			el("div", { cls: "universeview-dash-muted", text: diff > 0 ? `In ${diff} day${diff === 1 ? "" : "s"}` : `${-diff} day${diff === -1 ? "" : "s"} ago` }, side);
		} else if (today === day) el("div", { cls: "universeview-cal-side-today", text: "Today in the world" }, side);
		const season = seasonOf(cal, day);
		if (season) el("div", { cls: "universeview-cal-side-row", text: `Season: ${season.name}` }, side);
		for (const mo of cal.moons) {
			const p = moonPhase(day, mo);
			const r = el("div", { cls: "universeview-cal-side-row universeview-cal-side-moon" }, side);
			r.appendChild(moonIcon(p, 16, mo.color));
			el("span", { text: `${mo.name}: ${phaseName(p).toLowerCase()}` }, r);
		}
		const items = (this.itemsBetween(day, day).get(day) ?? []).filter((i) => i.kind !== "season");
		const list = el("div", { cls: "universeview-cal-side-list" }, side);
		if (!items.length) el("div", { cls: "universeview-dash-muted", text: "Nothing on this day yet." }, list);
		for (const it of items) {
			this.chip(list, it, day);
			const e = it.key ? this.plugin.index.get(it.key) : undefined;
			if (e?.summary) el("div", { cls: "universeview-cal-side-summary", text: e.summary }, list);
			else if (e && it.kind === "event" && e.end) el("div", { cls: "universeview-cal-side-summary", text: formatSpan(e.start, e.end, cal) }, list);
		}
		const actions = el("div", { cls: "universeview-cal-side-actions" }, side);
		const add = el("button", { cls: "mod-cta", text: "New event on this day" }, actions);
		add.addEventListener("click", () => this.newEvent(day));
		if (today !== day) {
			const set = el("button", { text: "Make this today" }, actions);
			set.addEventListener("click", () => void this.plugin.setToday(this.options.folder ?? "", cal.id, day).then(() => this.refresh()));
		}
	}

	// ---- Changes --------------------------------------------------------------------------------

	private newEvent(day: number) {
		const cal = this.cal();
		this.plugin.createEntityPrompt({ type: "event", date: formatDay(day, cal), calendar: cal.id, scope: this.options.folder || undefined });
	}

	/** Moves an event to another day, keeping how long it lasts. */
	private async moveEvent(key: string, day: number) {
		const e = this.plugin.index.get(key);
		const file = this.plugin.app.vault.getAbstractFileByPath(key);
		if (!e?.start || !(file instanceof TFile)) return;
		const cal = this.plugin.calendars.get(e.calendar);
		const shift = day - e.start.start;
		if (!shift) return;
		const aliases = buildFieldAliases(this.plugin.settings.fieldAliases);
		await this.plugin.editFrontmatter(file, (f) => {
			const dateKey = aliases.date.find((k) => k in f) ?? aliases.date[0];
			f[dateKey] = formatDay(day, cal);
			if (e.end) {
				const endKey = aliases.end.find((k) => k in f);
				if (endKey) f[endKey] = formatDay(e.end.start + shift, cal);
			}
		}, `Move ${e.name}`);
		new Notice(`Moved ${e.name} to ${formatDay(day, cal)}. Undo puts it back.`);
	}
}
