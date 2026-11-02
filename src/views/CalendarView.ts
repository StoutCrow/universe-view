import { Modal, Setting, type ViewStateResult } from "obsidian";
import type ChroniclePlugin from "../main";
import { CalendarOptions, CalendarRenderer, DEFAULT_CALENDAR_OPTIONS, moonIcon, type CalendarMode } from "../render/calendar";
import { convertDay, moonPhase, phaseName, seasonOf } from "../dates/calendars";
import { formatDay } from "../dates/parser";
import { dropdown, el, iconButton, toggleChip } from "../render/common";
import { ChronicleView } from "./base";

export const VIEW_CALENDAR = "chronicle-calendar";

export class CalendarView extends ChronicleView {
	private options: CalendarOptions = { ...DEFAULT_CALENDAR_OPTIONS };
	private renderer?: CalendarRenderer;

	getViewType() {
		return VIEW_CALENDAR;
	}
	getDisplayText() {
		return "Calendar";
	}
	getIcon() {
		return "calendar-days";
	}

	getState(): Record<string, unknown> {
		return { options: this.options };
	}

	async setState(state: unknown, result: ViewStateResult) {
		const s = state as { options?: Partial<CalendarOptions> } | undefined;
		if (s?.options) {
			this.options = { ...this.options, ...s.options };
			if (this.isBuilt) {
				this.fillToolbar();
				this.update(false);
			}
		}
		await super.setState(state, result);
	}

	protected build() {
		this.options.folder ??= this.defaultScope();
		this.fillToolbar();
		this.renderer = new CalendarRenderer(this.body, this.plugin, this.options, false, this.hoverHost);
		this.renderer.onOptionsChange = () => {
			this.app.workspace.requestSaveLayout();
			this.syncMode();
		};
	}

	private modeSelect?: HTMLSelectElement;

	private syncMode() {
		if (this.modeSelect) this.modeSelect.value = this.options.mode;
	}

	private update(save = true) {
		if (!this.renderer) return;
		this.renderer.options = this.options;
		this.renderer.refresh();
		if (save) this.app.workspace.requestSaveLayout();
	}

	/** Moves today in the world on by some days, and shows it. */
	private async advance(days: number) {
		const r = this.renderer;
		if (!r) return;
		const cal = r.cal();
		const today = r.today() ?? this.options.selected;
		if (today === undefined) {
			void this.plugin.setToday(this.options.folder ?? "", cal.id, this.options.selected ?? 0);
			return;
		}
		await this.plugin.setToday(this.options.folder ?? "", cal.id, today + days);
		r.goTo(today + days);
	}

	private fillToolbar() {
		this.rebuildToolbar(() => {
			const o = this.options;
			const left = this.group();
			this.scopePicker(left, o.folder, (v) => {
				o.folder = v;
				o.calendar = undefined;
				o.year = o.month = o.selected = undefined;
				this.fillToolbar();
				this.update();
			});
			const cals = this.plugin.calendars.all().map((c) => [c.id, c.name] as [string, string]);
			dropdown(left, [["", "World's calendar"], ...cals], o.calendar ?? "", (v) => {
				o.calendar = v || undefined;
				o.year = o.month = undefined;
				this.update();
			}, "Calendar");
			this.modeSelect = dropdown(left, [["month", "Month"], ["week", "Week"], ["year", "Year"], ["agenda", "Coming up"]], o.mode, (v) => {
				o.mode = v as CalendarMode;
				this.update();
			}, "Show");
			const time = this.group();
			iconButton(time, "skip-forward", "Move today on by a day", () => void this.advance(1));
			iconButton(time, "fast-forward", "Move today on by a week (or 7 days)", () => void this.advance(this.renderer?.cal().weekdays.length || 7));
			const look = this.group();
			toggleChip(look, "Moons", "moon", o.moons, (v) => {
				o.moons = v;
				this.update();
			});
			toggleChip(look, "Holidays", "party-popper", o.holidays, (v) => {
				o.holidays = v;
				this.update();
			});
			toggleChip(look, "Birthdays", "cake", o.birthdays, (v) => {
				o.birthdays = v;
				this.update();
			});
			toggleChip(look, "Anniversaries", "history", o.anniversaries !== false, (v) => {
				o.anniversaries = v;
				this.update();
			});
			toggleChip(look, "Story", "book-open", o.story, (v) => {
				o.story = v;
				this.update();
			});
			this.spacer();
			const right = this.group();
			iconButton(right, "arrow-left-right", "Convert a date between calendars", () => new ConvertModal(this.plugin, this.renderer?.cal().id, this.options.selected ?? this.renderer?.today()).open());
			iconButton(right, "globe", "World settings: calendar, today, map, travel speeds…", () => this.plugin.editWorld(o.folder ?? ""));
			iconButton(right, "plus", "New event", () => this.plugin.createEntityPrompt({ type: "event", scope: o.folder || undefined, calendar: this.renderer?.cal().id }), "mod-cta-icon");
		});
	}

	protected onIndexChanged() {
		this.renderer?.refresh();
	}

	async onClose() {
		this.renderer?.destroy();
	}
}

/** One date shown in every calendar: weekday, season and moons included. */
export class ConvertModal extends Modal {
	constructor(private plugin: ChroniclePlugin, private from?: string, private day?: number) {
		super(plugin.app);
	}

	onOpen() {
		this.containerEl.addClass("chronicle-scope-host");
		this.modalEl.addClass("chronicle-scope", "chronicle-tool-modal");
		this.titleEl.setText("Convert a date");
		const cals = this.plugin.calendars.all();
		let from = this.from ?? cals[0].id;
		let text = this.day !== undefined ? formatDay(this.day, this.plugin.calendars.get(from)) : "";
		const out = el("div", { cls: "chronicle-convert" });
		const show = () => {
			out.empty();
			const d = text.trim() ? this.plugin.parseDate(text, from) : null;
			if (!d) {
				el("div", { cls: "chronicle-dash-muted", text: text.trim() ? "Couldn't read that date in this calendar." : "Type a date to see it in every calendar." }, out);
				return;
			}
			for (const r of convertDay(d.start, cals)) {
				const row = el("div", { cls: "chronicle-convert-row" + (r.cal.id === from ? " is-from" : "") }, out);
				el("div", { cls: "chronicle-convert-cal", text: r.cal.name }, row);
				el("div", { cls: "chronicle-convert-date", text: `${r.weekday ? r.weekday + ", " : ""}${formatDay(d.start, r.cal)}` }, row);
				const extra = el("div", { cls: "chronicle-convert-extra" }, row);
				const season = seasonOf(r.cal, d.start);
				if (season) el("span", { text: season.name }, extra);
				for (const mo of r.cal.moons) {
					const p = moonPhase(d.start, mo);
					const m = el("span", { cls: "chronicle-convert-moon", attr: { title: `${mo.name}: ${phaseName(p).toLowerCase()}` } }, extra);
					m.appendChild(moonIcon(p, 14, mo.color));
				}
			}
			el("div", { cls: "chronicle-dash-muted", text: "Calendars line up through their epoch (Settings → Calendars). One without an epoch starts its year 1 on 1 January 1970." }, out);
		};
		new Setting(this.contentEl).setName("Date").addText((t) => {
			t.setPlaceholder("E.g. 14 Highsun SE 3").setValue(text).onChange((v) => {
				text = v;
				show();
			});
			window.setTimeout(() => t.inputEl.focus(), 20);
		}).addDropdown((dd) => {
			for (const c of cals) dd.addOption(c.id, c.name);
			dd.setValue(from).onChange((v) => {
				from = v;
				show();
			});
		});
		this.contentEl.appendChild(out);
		show();
	}

	onClose() {
		this.contentEl.empty();
	}
}
