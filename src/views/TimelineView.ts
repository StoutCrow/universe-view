import { Menu, type ViewStateResult } from "obsidian";
import { DEFAULT_TIMELINE_OPTIONS, TimelineGroup, TimelineOptions, TimelineRenderer } from "../render/timeline";
import { dropdown, el, icon, iconButton } from "../render/common";
import { EntityPickerModal } from "../ui/suggest";
import { ChronicleView } from "./base";

export const VIEW_TIMELINE = "chronicle-timeline";

export class TimelineView extends ChronicleView {
	protected exportable = true;
	private options: TimelineOptions = { ...structuredClone(DEFAULT_TIMELINE_OPTIONS), lifeEvents: this.plugin.settings.showLifeEvents };
	private renderer?: TimelineRenderer;

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
		return { options: rest };
	}

	async setState(state: unknown, result: ViewStateResult) {
		const s = state as { options?: Partial<TimelineOptions> } | undefined;
		if (s?.options) {
			this.options = { ...structuredClone(DEFAULT_TIMELINE_OPTIONS), ...this.options, ...s.options, filter: { ...(s.options.filter ?? {}) } };
			if (this.isBuilt) {
				this.fillToolbar();
				this.renderer!.options = this.options;
				this.renderer!.refresh();
			}
		}
		await super.setState(state, result);
	}

	protected build() {
		this.options.filter.folder ??= this.defaultScope();
		this.fillToolbar();
		this.renderer = new TimelineRenderer(this.body, this.plugin, this.options, false, this.hoverHost);
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
			this.searchBox(left, o.filter.search ?? "", "Filter events…", (v) => {
				o.filter.search = v || undefined;
				this.update();
			});
			this.scopePicker(left, o.filter.folder, (v) => {
				o.filter.folder = v;
				o.calendar = undefined;
				this.fillToolbar();
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
			dropdown(left, groups, o.group, (v) => {
				o.group = v as TimelineGroup;
				this.update();
			}, "Group lanes");
			const cals = this.plugin.calendars.all();
			if (cals.length > 1) {
				const current = o.calendar ?? this.plugin.index.dominantCalendar(o.filter.folder);
				dropdown(left, cals.map((c) => [c.id, c.name] as [string, string]), current, (v) => {
					o.calendar = v;
					this.update();
				}, "Calendar");
			}
			dropdown(left, [["0", "All events"], ["3", "Importance 3+"], ["4", "Importance 4+"], ["5", "Key events only"]], String(o.filter.minImportance ?? 0), (v) => {
				o.filter.minImportance = +v || undefined;
				this.update();
			}, "Importance");
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
			const show = el("button", { cls: "chronicle-chip chronicle-overlay-btn", attr: { "aria-haspopup": "menu", title: "Choose what's on the timeline" } }, chips);
			icon(el("span", { cls: "chronicle-chip-icon" }, show), "layers");
			el("span", { text: "Show" }, show);
			const count = el("span", { cls: "chronicle-chip-count" }, show);
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
			const cats = el("button", { cls: "chronicle-chip chronicle-overlay-btn" + (o.hiddenCategories?.length ? " is-active" : ""), attr: { "aria-haspopup": "menu", title: "Show or hide kinds of event (from each note's category:, kind: or tag)" } }, chips);
			icon(el("span", { cls: "chronicle-chip-icon" }, cats), "tags");
			el("span", { text: "Categories" }, cats);
			if (o.hiddenCategories?.length) el("span", { cls: "chronicle-chip-count", text: `−${o.hiddenCategories.length}` }, cats);
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
			// Fog of war: history as one person knew it.
			const pov = el("button", { cls: "chronicle-chip chronicle-overlay-btn" + (o.pov ? " is-active" : ""), attr: { title: "Show only what one person ever learns about, in their lifetime" } }, chips);
			icon(el("span", { cls: "chronicle-chip-icon" }, pov), "eye");
			el("span", { text: o.pov ? `Seen by ${this.plugin.index.get(o.pov)?.name ?? o.pov}` : "Seen by everyone" }, pov);
			pov.addEventListener("click", (evt) => {
				const pick = () => new EntityPickerModal(this.plugin, ["person"], (p) => {
					o.pov = p.key;
					this.fillToolbar();
					this.update();
				}, "History as who knew it?").open();
				if (!o.pov) return pick();
				const menu = new Menu();
				menu.addItem((i) => i.setTitle("Someone else…").setIcon("eye").onClick(pick));
				menu.addItem((i) => i.setTitle("Everyone (show it all)").setIcon("eye-off").onClick(() => {
					o.pov = undefined;
					this.fillToolbar();
					this.update();
				}));
				menu.showAtMouseEvent(evt);
			});

			this.spacer();
			const right = this.group();
			iconButton(right, "zoom-out", "Zoom out", () => this.renderer?.zoom(1 / 1.5));
			iconButton(right, "zoom-in", "Zoom in", () => this.renderer?.zoom(1.5));
			iconButton(right, "maximize", "Fit everything", () => this.renderer?.fit(true));
			iconButton(right, "plus", "New event (or double-click the timeline)", () => this.plugin.createEntityPrompt({ type: "event", scope: o.filter.folder || undefined }), "mod-cta-icon");
		});
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
