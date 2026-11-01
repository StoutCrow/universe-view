import { Modal, Notice, Setting } from "obsidian";
import type ChroniclePlugin from "../main";
import type { CalendarDef } from "../types";
import { CustomCalendar, holidaysOn, moonPhase, seasonOf } from "../dates/calendars";
import { formatDay } from "../dates/parser";
import { moonIcon } from "../render/calendar";
import { el } from "../render/common";
import { rowEditor } from "./rows";

/**
 * Everything about a calendar in one window, with proper controls: months (and festival days),
 * weekdays, leap days, eras, moons, seasons and holidays, and a live preview of a month as you go.
 */
export class CalendarEditorModal extends Modal {
	private def: CalendarDef;
	private previewEl!: HTMLElement;
	private previewMonth = 1;
	/** Sections that list months by name, redrawn when the months change. */
	private monthUsers: (() => void)[] = [];

	constructor(private plugin: ChroniclePlugin, def: CalendarDef, private onSave: (def: CalendarDef) => void) {
		super(plugin.app);
		this.def = structuredClone(def);
	}

	/**
	 * The same editor drawn into a box on the page (the settings tab) instead of a window of its own,
	 * so no theme can put it behind Settings. Save and Cancel call `done`.
	 */
	static inline(plugin: ChroniclePlugin, box: HTMLElement, def: CalendarDef, onSave: (def: CalendarDef) => void, done: () => void) {
		const ed = new CalendarEditorModal(plugin, def, onSave);
		const frame = box.createDiv({ cls: "chronicle-scope chronicle-calendar-editor chronicle-calendar-inline" });
		const title = frame.createEl("h3", { cls: "chronicle-calendar-inline-title" });
		const content = frame.createDiv({ cls: "chronicle-calendar-inline-body" });
		// Point the editor's window parts at the inline ones.
		Object.defineProperty(ed, "modalEl", { value: frame });
		Object.defineProperty(ed, "titleEl", { value: title });
		Object.defineProperty(ed, "contentEl", { value: content });
		ed.close = () => {
			frame.remove();
			done();
		};
		ed.onOpen();
		frame.scrollIntoView({ block: "start", behavior: "smooth" });
		return ed;
	}

	/** Builds the editor; if anything in it fails, says so in the window instead of leaving it blank. */
	onOpen() {
		try {
			this.build();
		} catch (err) {
			console.error("UniverseView: calendar editor failed to open", err);
			this.contentEl.empty();
			this.contentEl.createEl("p", { text: `The calendar editor couldn't open: ${err instanceof Error ? err.message : String(err)}` });
			this.contentEl.createEl("p", { cls: "setting-item-description", text: "Please send this message (and the console's error, Ctrl+Shift+I) so it can be fixed." });
		}
	}

	private build() {
		this.modalEl.addClass("chronicle-scope", "chronicle-calendar-editor");
		this.titleEl.setText(`Calendar: ${this.def.name}`);
		const c = this.def;
		const box = this.contentEl;
		const section = (title: string, desc: string) => {
			const s = el("div", { cls: "chronicle-cal-ed-section" }, box);
			el("h3", { text: title }, s);
			if (desc) el("div", { cls: "setting-item-description", text: desc }, s);
			return s;
		};
		const changed = () => this.preview();
		const monthOptions = (): [string, string][] => c.months.map((m, i) => [String(i + 1), m.name || `Month ${i + 1}`]);

		this.previewEl = el("div", { cls: "chronicle-cal-ed-preview" }, box);

		const basics = section("Basics", "");
		new Setting(basics).setName("Name").addText((t) => t.setValue(c.name).onChange((v) => {
			c.name = v;
			this.titleEl.setText(`Calendar: ${v}`);
		}));
		new Setting(basics).setName("Id").setDesc("What notes write in `calendar:`. Changing it unlinks notes that use the old one.").addText((t) => t.setValue(c.id).onChange((v) => (c.id = v.trim().toLowerCase().replace(/\s+/g, "-"))));
		new Setting(basics).setName("Lines up with real dates").setDesc("The real date of this calendar's year 1, day 1, so dates convert between calendars. Leave empty if it doesn't matter.").addText((t) => {
			const greg = this.plugin.calendars.get("gregorian");
			t.setPlaceholder("e.g. 1200-03-01").setValue(c.epoch ? formatDay(c.epoch, greg) : "");
			t.inputEl.addEventListener("change", () => {
				const d = t.getValue().trim() ? this.plugin.parseDate(t.getValue(), "gregorian") : null;
				c.epoch = d ? d.start : 0;
				t.inputEl.toggleClass("mod-warning", !!t.getValue().trim() && !d);
				changed();
			});
		});

		const months = section("Months", "In order. Turn on “festival” for days that sit between months, outside the weeks (they don't move the weekday).");
		rowEditor(this.app, months, [
			{ key: "name", label: "Name", kind: "text", width: "2fr", placeholder: "Highsun" },
			{ key: "days", label: "Days", kind: "number", width: "80px", min: 1 },
			{ key: "intercalary", label: "Festival", kind: "toggle", width: "70px", title: "Days outside the weeks" },
		], c.months as never[], (rows) => {
			c.months = (rows as unknown as { name: string; days: number; intercalary?: boolean }[]).map((m) => ({ name: m.name || "Month", days: Math.max(1, Number(m.days) || 30), ...(m.intercalary ? { intercalary: true } : {}) }));
			this.monthUsers.forEach((f) => f());
			changed();
		}, { blank: () => ({ name: "", days: 30 }) as never, addLabel: "Add a month", reorder: true });

		const weeks = section("Weekdays", "In order. Leave empty for a calendar without weeks.");
		rowEditor(this.app, weeks, [{ key: "name", label: "Day", kind: "text", placeholder: "Moonday" }], (c.weekdays ?? []).map((name) => ({ name })), (rows) => {
			c.weekdays = rows.map((r) => String(r.name ?? "")).filter(Boolean);
			changed();
		}, { blank: () => ({ name: "" }), addLabel: "Add a weekday", reorder: true, empty: "No weeks." });
		new Setting(weeks).setName("Year 1 began on").addDropdown((d) => {
			const days = c.weekdays?.length ? c.weekdays : ["(no weeks)"];
			days.forEach((w, i) => d.addOption(String(i), w));
			d.setValue(String(c.firstWeekday ?? 0)).onChange((v) => {
				c.firstWeekday = Number(v);
				changed();
			});
		});

		const leaps = section("Leap days", "Extra days some years: every N years, except every M, unless every K (like the real calendar's 4, 100, 400).");
		this.monthSection(leaps, () => rowEditor(this.app, leaps.querySelector(".chronicle-cal-ed-rows") as HTMLElement, [
			{ key: "month", label: "Added to", kind: "select", options: monthOptions, width: "1.5fr" },
			{ key: "every", label: "Every", kind: "number", min: 1, width: "70px" },
			{ key: "except", label: "Except", kind: "number", min: 0, width: "70px", placeholder: "—" },
			{ key: "unless", label: "Unless", kind: "number", min: 0, width: "70px", placeholder: "—" },
			{ key: "days", label: "Days", kind: "number", min: 1, width: "60px", placeholder: "1" },
		], (c.leaps ?? []).map((l) => ({ ...l, month: String(l.month) })) as never[], (rows) => {
			c.leaps = (rows as unknown as Record<string, unknown>[]).filter((r) => Number(r.every) > 0).map((r) => ({ month: Number(r.month) || 1, every: Number(r.every), ...(Number(r.except) ? { except: Number(r.except) } : {}), ...(Number(r.unless) ? { unless: Number(r.unless) } : {}), ...(Number(r.days) > 1 ? { days: Number(r.days) } : {}) }));
			changed();
		}, { blank: () => ({ month: String(c.months.length), every: 4 }) as never, addLabel: "Add a leap rule", empty: "No leap years." }));

		const eras = section("Eras", "Dates can then be written like “SE 412”. An era starts on a year counted from the calendar's year 1.");
		rowEditor(this.app, eras, [
			{ key: "abbr", label: "Short", kind: "text", width: "80px", placeholder: "SE" },
			{ key: "name", label: "Name", kind: "text", width: "2fr", placeholder: "Second Era" },
			{ key: "startYear", label: "Starts in year", kind: "number", width: "110px", min: 1 },
		], c.eras as never[], (rows) => {
			c.eras = (rows as unknown as Record<string, unknown>[]).filter((r) => r.abbr).map((r) => ({ abbr: String(r.abbr), name: String(r.name || r.abbr), startYear: Number(r.startYear) || 1 }));
			changed();
		}, { blank: () => ({ abbr: "", name: "", startYear: 1 }) as never, addLabel: "Add an era", empty: "No eras: years are just numbers." });
		new Setting(eras).setName("Write years as").addDropdown((d) => d.addOptions({ before: "Era first (SE 412)", after: "Year first (1262 C.E.)" }).setValue(c.eraAfter ? "after" : "before").onChange((v) => {
			c.eraAfter = v === "after";
			changed();
		}));

		const moons = section("Moons", "As many as you like. A cycle is the days from one new moon to the next; the offset moves the first new moon.");
		rowEditor(this.app, moons, [
			{ key: "name", label: "Name", kind: "text", width: "1.5fr", placeholder: "Selûne" },
			{ key: "cycle", label: "Cycle (days)", kind: "number", width: "100px", min: 1, step: 0.1 },
			{ key: "offset", label: "Offset", kind: "number", width: "80px", step: 0.5 },
			{ key: "color", label: "Colour", kind: "color", width: "90px" },
		], (c.moons ?? []) as never[], (rows) => {
			c.moons = (rows as unknown as Record<string, unknown>[]).filter((r) => Number(r.cycle) > 0).map((r) => ({ name: String(r.name || "Moon"), cycle: Number(r.cycle), offset: Number(r.offset) || 0, ...(r.color ? { color: String(r.color) } : {}) }));
			changed();
		}, { blank: () => ({ name: "", cycle: 29.5, offset: 0 }) as never, addLabel: "Add a moon", empty: "No moons." });

		const seasons = section("Seasons", "Each starts on a day and lasts until the next one starts.");
		this.monthSection(seasons, () => rowEditor(this.app, seasons.querySelector(".chronicle-cal-ed-rows") as HTMLElement, [
			{ key: "name", label: "Name", kind: "text", width: "1.5fr", placeholder: "Spring" },
			{ key: "month", label: "Starts in", kind: "select", options: monthOptions, width: "1.5fr" },
			{ key: "day", label: "Day", kind: "number", min: 1, width: "70px" },
			{ key: "color", label: "Colour", kind: "color", width: "90px" },
		], (c.seasons ?? []).map((s) => ({ ...s, month: String(s.month) })) as never[], (rows) => {
			c.seasons = (rows as unknown as Record<string, unknown>[]).filter((r) => r.name).map((r) => ({ name: String(r.name), month: Number(r.month) || 1, day: Math.max(1, Number(r.day) || 1), ...(r.color ? { color: String(r.color) } : {}) }));
			changed();
		}, { blank: () => ({ name: "", month: "1", day: 1 }) as never, addLabel: "Add a season", reorder: true, empty: "No seasons." }));

		const holidays = section("Holidays", "Days that come round every year (or every few). Holidays with a note of their own: give an event `repeat: yearly`.");
		this.monthSection(holidays, () => rowEditor(this.app, holidays.querySelector(".chronicle-cal-ed-rows") as HTMLElement, [
			{ key: "name", label: "Name", kind: "text", width: "1.5fr", placeholder: "Lantern Night" },
			{ key: "month", label: "Month", kind: "select", options: monthOptions, width: "1.5fr" },
			{ key: "day", label: "Day", kind: "number", min: 1, width: "70px" },
			{ key: "every", label: "Every (years)", kind: "number", min: 1, width: "100px", placeholder: "1" },
			{ key: "color", label: "Colour", kind: "color", width: "90px" },
		], (c.holidays ?? []).map((h) => ({ ...h, month: String(h.month) })) as never[], (rows) => {
			c.holidays = (rows as unknown as Record<string, unknown>[]).filter((r) => r.name).map((r) => ({ name: String(r.name), month: Number(r.month) || 1, day: Math.max(1, Number(r.day) || 1), ...(Number(r.every) > 1 ? { every: Number(r.every) } : {}), ...(r.color ? { color: String(r.color) } : {}) }));
			changed();
		}, { blank: () => ({ name: "", month: "1", day: 1 }) as never, addLabel: "Add a holiday", empty: "No holidays." }));

		const footer = el("div", { cls: "modal-button-container" }, box);
		el("button", { text: "Cancel" }, footer).addEventListener("click", () => this.close());
		el("button", { cls: "mod-cta", text: "Save calendar" }, footer).addEventListener("click", () => {
			if (!c.months.length) {
				new Notice("A calendar needs at least one month.");
				return;
			}
			this.onSave(c);
			this.close();
		});
		this.preview();
	}

	/** A section whose rows list months by name: drawn now, and again whenever the months change. */
	private monthSection(section: HTMLElement, draw: () => void) {
		const rows = el("div", { cls: "chronicle-cal-ed-rows" }, section);
		const redraw = () => {
			rows.empty();
			draw();
		};
		this.monthUsers.push(redraw);
		draw();
	}

	/** A month of this calendar as it stands: weekdays, festival days, moons, season starts, holidays. */
	private preview() {
		const box = this.previewEl;
		box.empty();
		let cal: CustomCalendar;
		try {
			cal = new CustomCalendar(this.def);
		} catch {
			el("div", { cls: "setting-item-description", text: "Check the months." }, box);
			return;
		}
		const y = this.def.eras[0]?.startYear ?? 1;
		const m = Math.min(this.previewMonth, cal.monthCount());
		const head = el("div", { cls: "chronicle-cal-ed-preview-head" }, box);
		const prev = el("button", { cls: "clickable-icon", text: "‹", attr: { "aria-label": "Previous month" } }, head);
		el("strong", { text: `${cal.monthNames[m - 1]} ${cal.formatYear(y)}` }, head);
		const next = el("button", { cls: "clickable-icon", text: "›", attr: { "aria-label": "Next month" } }, head);
		prev.addEventListener("click", () => {
			this.previewMonth = m > 1 ? m - 1 : cal.monthCount();
			this.preview();
		});
		next.addEventListener("click", () => {
			this.previewMonth = m < cal.monthCount() ? m + 1 : 1;
			this.preview();
		});
		const bits = [`${this.def.months.length} months`, `${cal.yearDays(y)} days a year`];
		if (this.def.leaps?.length) bits.push("leap years");
		if (cal.weekdays.length) bits.push(`${cal.weekdays.length}-day weeks`);
		if (cal.moons.length) bits.push(`${cal.moons.length} moon${cal.moons.length === 1 ? "" : "s"}`);
		el("span", { cls: "chronicle-cal-ed-preview-sum", text: bits.join(" · ") }, head);
		const first = cal.toDays(y, m, 1);
		const len = cal.monthDays(y, m);
		const festival = cal.isIntercalary(y, m);
		const cols = festival ? Math.min(len, 7) : cal.weekdays.length || 7;
		const grid = el("div", { cls: "chronicle-cal-ed-grid" }, box);
		grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
		if (!festival && cal.weekdays.length) for (const w of cal.weekdays) el("div", { cls: "chronicle-cal-ed-wd", text: w.slice(0, 3) }, grid);
		const lead = festival ? 0 : Math.max(0, cal.weekdayOf(first));
		for (let i = 0; i < lead; i++) el("div", {}, grid);
		for (let d = 1; d <= len; d++) {
			const day = first + d - 1;
			const cell = el("div", { cls: "chronicle-cal-ed-day" + (festival ? " is-festival" : "") }, grid);
			el("span", { text: String(d) }, cell);
			const s = seasonOf(cal, day);
			if (s && seasonOf(cal, day - 1) !== s) cell.setAttribute("title", `${s.name} begins`), cell.addClass("is-season");
			const hol = holidaysOn(cal, day);
			if (hol.length) {
				cell.addClass("is-holiday");
				cell.setAttribute("title", hol.map((h) => h.name).join(", "));
			}
			for (const mo of cal.moons) cell.appendChild(moonIcon(moonPhase(day, mo), 10, mo.color));
		}
		if (festival) el("div", { cls: "setting-item-description", text: "Festival days: outside the weeks." }, box);
	}

	onClose() {
		this.contentEl.empty();
	}
}
