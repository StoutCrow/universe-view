import { Menu, Notice, type ViewStateResult } from "obsidian";
import { TextPrompt } from "../ui/TextPrompt";
import { DEFAULT_TIMELINE_OPTIONS, TimelineGroup, TimelineOptions, TimelineRenderer } from "../render/timeline";
import { el, icon, iconButton } from "../render/common";
import { EntityPickerModal } from "../ui/suggest";
import { optionsButton, type OptionEntry } from "../render/optionsmenu";
import type { TimeRange } from "../render/timelinerows";
import { UniverseViewBase } from "./base";

export const VIEW_TIMELINE = "chronicle-timeline";

export class TimelineView extends UniverseViewBase {
	protected exportable = true;
	private options: TimelineOptions = { ...structuredClone(DEFAULT_TIMELINE_OPTIONS), lifeEvents: this.plugin.settings.showLifeEvents };
	private renderer?: TimelineRenderer;
	private startRange?: TimeRange;

	getViewType() {
		return VIEW_TIMELINE;
	}
	getDisplayText() {
		return "Timeline";
	}
	getIcon() {
		return "calendar-range";
	}

	getState(): Record<string, unknown> {
		const { focus, ...rest } = this.options;
		void focus;
		return { options: rest, ...this.savedRange() };
	}

	async setState(state: unknown, result: ViewStateResult) {
		const s = state as { options?: Partial<TimelineOptions>; range?: TimeRange } | undefined;
		if (s?.options) {
			this.options = { ...structuredClone(DEFAULT_TIMELINE_OPTIONS), ...this.options, ...s.options, filter: { ...(s.options.filter ?? {}) } };
			if (this.isBuilt) {
				this.fillToolbar();
				this.renderer!.options = this.options;
				this.renderer!.refresh();
			}
		}
		if (s?.range) this.showTimeRange(s.range);
		await super.setState(state, result);
	}

	protected build() {
		this.options.filter.folder ??= this.defaultScope();
		this.fillToolbar();
		this.renderer = new TimelineRenderer(this.body, this.plugin, this.options, false, this.hoverHost);
		if (this.startRange) this.renderer.showRange(this.startRange);
	}

	private update(save = true) {
		this.renderer!.options = this.options;
		this.renderer!.refresh();
		if (save) this.app.workspace.requestSaveLayout();
	}

	private fillToolbar() {
		this.rebuildToolbar(() => {
			const o = this.options;
			const left = this.group();
			this.modeSwitch(left, VIEW_TIMELINE);
			this.searchBox(left, o.filter.search ?? "", "Filter events…", (v) => {
				o.filter.search = v || undefined;
				this.update();
			});
				const groups: [TimelineGroup, string][] = [
					["none", "No grouping"],
					["category", "By category"],
					["realm", "By realm"],
					["culture", "By group"],
					["place", "By place"],
					["person", "By person"],
					["tag", "By tag"],
					["type", "By kind"],
				];
				this.scopePicker(left, o.filter.folder, (v) => {
					o.filter.folder = v;
					o.calendar = undefined;
					this.fillToolbar();
					this.update();
				});
				optionsButton(left, () => {
					const list: OptionEntry[] = [];
					list.push({ type: "choice", label: "Group lanes", options: groups, get: () => o.group, set: (v) => { o.group = v as TimelineGroup; this.update(); } });
					const cals = this.plugin.calendars.all();
					if (cals.length > 1) {
						list.push({
							type: "choice", label: "Calendar", options: cals.map((c) => [c.id, c.name] as [string, string]), get: () => o.calendar ?? this.plugin.index.dominantCalendar(o.filter.folder), set: (v) => { o.calendar = v; this.update(); },
						});
					}
					list.push({
						type: "choice", label: "Importance", options: [["0", "All events"], ["3", "3 and up"], ["4", "4 and up"], ["5", "Key events only"]], get: () => String(o.filter.minImportance ?? 0), set: (v) => { o.filter.minImportance = +v || undefined; this.update(); },
					});
					list.push({ type: "action", label: "Shorter rows (Alt + scroll)", icon: "chevrons-down-up", run: () => this.renderer?.zoomRows(1 / 1.25) });
					list.push({ type: "action", label: "Taller rows (Alt + scroll)", icon: "chevrons-up-down", run: () => this.renderer?.zoomRows(1.25) });
					list.push({
						type: "action", label: "History as one person knew it…", icon: "eye", run: () => new EntityPickerModal(this.plugin, ["person"], (p) => {
							o.pov = p.key;
							this.fillToolbar();
							this.update();
						}, "History as who knew it?").open(),
					});
					return list;
				});
			const chips = this.group();
			// What's on the timeline, in one menu (a count shows how many are on), like the map's overlays.
			type Layer = [keyof TimelineOptions, string, string, string, boolean];
			const layers: Layer[] = [
				["lifespans", "Lifespans", "user-round", "Each person's life as a bar", false],
				["lifeEvents", "Births & deaths", "baby", "Births and deaths as points (when lifespans are off)", false],
				["cultures", "Groups", "flag", "Realms, houses and other groups, from their founding to their end (or today)", false],
				["places", "Places", "map-pin", "Provinces, towns and forts with a founding date, from then to their end (or today)", false],
				["reigns", "Reigns", "crown", "Who held each title when (holders:), as bars", true],
				["occupations", "Occupations", "swords", "Lands held for a while by someone else (occupied:), as bars", true],
				["renames", "Renamings", "history", "When a land or group took a new name (names:)", true],
				["causes", "Causes", "git-pull-request-arrow", "Arrows from events to what they led to", true],
				["scenes", "Story", "book-open", "Chapters and scenes with a story-date: property, among the events", true],
				["eras", "Eras", "rows-3", "Shaded bands for the calendar's eras and for era, age, reign and war notes", true],
			];
			// Some are on unless turned off (unset counts as on), the rest off unless turned on.
			const isOn = ([k, , , , onByDefault]: Layer) => (onByDefault ? o[k] !== false : !!o[k]);
			const show = el("button", { cls: "universeview-chip universeview-overlay-btn", attr: { "aria-haspopup": "menu", title: "Choose what's on the timeline" } }, chips);
			icon(el("span", { cls: "universeview-chip-icon" }, show), "layers");
			el("span", { text: "Show" }, show);
			const count = el("span", { cls: "universeview-chip-count" }, show);
			const sync = () => count.setText(`${layers.filter(isOn).length}/${layers.length}`);
			sync();
			show.addEventListener("click", (evt) => {
				const menu = new Menu();
				for (const l of layers) {
					menu.addItem((i) => {
						i.setTitle(l[1]).setIcon(l[2]).setChecked(isOn(l)).onClick(() => {
							(o as unknown as Record<string, boolean>)[l[0]] = !isOn(l);
							sync();
							this.update();
						});
						(i as unknown as { dom?: HTMLElement }).dom?.setAttribute("title", l[3]);
					});
				}
				menu.showAtMouseEvent(evt);
			});
			// Categories: battles, treaties, coronations… (and lifespans, groups, places), each shown or hidden.
			const cats = el("button", { cls: "universeview-chip universeview-overlay-btn" + (o.hiddenCategories?.length ? " is-active" : ""), attr: { "aria-haspopup": "menu", title: "Show or hide kinds of event (from each note's category:, kind: or tag)" } }, chips);
			icon(el("span", { cls: "universeview-chip-icon" }, cats), "tags");
			el("span", { text: "Categories" }, cats);
			if (o.hiddenCategories?.length) el("span", { cls: "universeview-chip-count", text: `−${o.hiddenCategories.length}` }, cats);
			cats.addEventListener("click", (evt) => {
				const list = this.renderer?.categories() ?? [];
				const hidden = new Set(o.hiddenCategories ?? []);
				const save = () => {
					o.hiddenCategories = hidden.size ? [...hidden] : undefined;
					this.fillToolbar();
					this.update();
				};
				const menu = new Menu();
				if (!list.length) menu.addItem((i) => i.setTitle("Nothing on the timeline yet").setDisabled(true));
				let kinds = false;
				for (const c of list) {
					if (c.id.startsWith("kind:") && !kinds) {
						kinds = true;
						menu.addSeparator();
					}
					menu.addItem((i) => {
						i.setTitle(`${c.label} (${c.count})`).setChecked(!hidden.has(c.id)).onClick(() => {
							if (hidden.has(c.id)) hidden.delete(c.id);
							else hidden.add(c.id);
							save();
						});
						const dom = (i as unknown as { dom?: HTMLElement }).dom;
						if (dom && o.group === "category" && this.renderer) dom.style.setProperty("--uv-cat-color", this.renderer.colorOf(c.id));
						dom?.addClass("uv-cat-item");
					});
				}
				if (list.length > 1) {
					menu.addSeparator();
					menu.addItem((i) => i.setTitle("Show all").setIcon("eye").onClick(() => {
						hidden.clear();
						save();
					}));
					menu.addItem((i) => i.setTitle("Only events with a category").setIcon("filter").onClick(() => {
						hidden.clear();
						for (const c of list) if (c.id.startsWith("kind:") || c.id === "~event") hidden.add(c.id);
						save();
					}));
				}
				menu.showAtMouseEvent(evt);
			});
				// Fog of war: shown only while on (it is set from Options), so it can be seen and turned off.
				if (o.pov) {
					const pov = el("button", { cls: "universeview-chip universeview-overlay-btn is-active", attr: { title: "History as this person knew it: click to show everything again" } }, chips);
					icon(el("span", { cls: "universeview-chip-icon" }, pov), "eye");
					el("span", { text: `Seen by ${this.plugin.index.get(o.pov)?.name ?? o.pov}` }, pov);
					icon(el("span", { cls: "universeview-chip-icon" }, pov), "x");
					pov.addEventListener("click", () => {
						o.pov = undefined;
						this.fillToolbar();
						this.update();
					});
				}

			this.spacer();
			const right = this.group();
			iconButton(right, "calendar-search", "Go to a date, or to today", (evt) => {
				const cal = o.calendar ?? this.plugin.index.dominantCalendar(o.filter.folder);
				const today = this.plugin.todayFor(o.filter.folder ?? "", cal);
				const menu = new Menu();
				if (today !== undefined) menu.addItem((i) => i.setTitle("Today").setIcon("calendar-check").onClick(() => this.jumpTo(today)));
				menu.addItem((i) => i.setTitle("A date…").setIcon("calendar-search").onClick(() => new TextPrompt(this.plugin, "Go to which date? (in this calendar, e.g. 1215 or 12 March 1215)", "", (v) => {
					const d = this.plugin.parseDate(v, cal);
					if (d) this.jumpTo(d.start);
					else new Notice(`Couldn't read "${v}" as a date in this calendar.`);
				}).open()));
				menu.showAtMouseEvent(evt);
			});
			iconButton(right, "zoom-out", "Zoom out", () => this.renderer?.zoom(1 / 1.5));
			iconButton(right, "zoom-in", "Zoom in", () => this.renderer?.zoom(1.5));
			iconButton(right, "maximize", "Fit everything", () => this.renderer?.fit(true));
			iconButton(right, "plus", "New event (or double-click the timeline)", () => this.plugin.createEntityPrompt({ type: "event", scope: o.filter.folder || undefined }), "mod-cta-icon");
		});
	}

	timeRange() {
		return this.renderer?.range;
	}

	/** Puts a day in the middle of the view, at the zoom it has now. */
	private jumpTo(day: number) {
		const r = this.renderer?.range;
		if (r) this.renderer?.showRange({ ...r, center: day });
	}

	showTimeRange(r: TimeRange) {
		if (this.renderer) this.renderer.showRange(r);
		else this.startRange = r;
	}

	/** Where it was left, kept with the view once it's been moved. */
	private savedRange() {
		const r = this.renderer?.moved ? this.renderer.range : this.startRange;
		return r ? { range: { center: r.center, scale: r.scale } } : {};
	}

	focus(key: string) {
		this.renderer?.focusOn(key);
	}

	protected onIndexChanged() {
		this.renderer?.refresh();
	}

	async onClose() {
		this.renderer?.destroy();
	}
}
