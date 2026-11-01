import { growSheet } from "../ui/territoryactions";
/** What a territory tool started from elsewhere does. */
export type DrawHow = "paint" | "split" | "edit" | "grow" | "borders";
import { STAT_NAMES, type StatKey } from "../index/realmstats";
import { tierName } from "../index/realms";
import { Menu, Notice, ViewStateResult } from "obsidian";
import { DEFAULT_MAP_OPTIONS, MapMode, MapOptions, MapRenderer, PAINT_MODES, WORLD_MAP } from "../render/map";
import { dropdown, el, icon, iconButton, setPressed, toggleChip } from "../render/common";
import type { PinColorBy } from "../settings";
import { EntityPickerModal } from "../ui/suggest";
import { ChronicleView, TimeSlider } from "./base";
import { exportTimelapse, type ExportExtras } from "../ui/export";
import { toolSheet } from "../ui/toolsheet";
import { formatDay } from "../dates/parser";

export const VIEW_MAP = "chronicle-map";

export class MapView extends ChronicleView {
	protected exportable = true;
	private options: MapOptions = { ...DEFAULT_MAP_OPTIONS };
	private renderer?: MapRenderer;
	private slider?: TimeSlider;
	private placing = false;
	private placeBtn?: HTMLElement;
	private banner?: HTMLElement;
	private toolButtons = new Map<MapMode, HTMLElement>();

	getViewType() {
		return VIEW_MAP;
	}
	getDisplayText() {
		const m = this.options.map !== WORLD_MAP ? this.plugin?.index.get(this.options.map)?.name : undefined;
		return m ? `Map: ${m}` : "Map";
	}
	getIcon() {
		return "map";
	}

	getState(): Record<string, unknown> {
		const { focus, ...rest } = this.options;
		void focus;
		return { options: rest };
	}

	async setState(state: unknown, result: ViewStateResult) {
		const s = state as { options?: Partial<MapOptions> } | undefined;
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
		// Default to the first image map when the vault has no real-world places.
		const idx = this.plugin.index;
		// A world note's main map comes first.
		const worldMap = this.options.map === WORLD_MAP ? idx.findByName(idx.worldFor(this.options.folder ?? "")?.map ?? "") : undefined;
		if (worldMap?.type === "map") this.options.map = worldMap.key;
		if (this.options.map === WORLD_MAP && !idx.all("place").some((p) => p.coords && !p.map)) {
			const first = idx.all("map")[0];
			if (first) this.options.map = first.key;
		}
		this.fillToolbar();
		this.renderer = new MapRenderer(this.body, this.plugin, this.options, false);
		this.renderer.onPlaceClick = (pos) => this.placeAt(pos);
		this.renderer.onOptionsChange = () => this.app.workspace.requestSaveLayout();
		this.renderer.onModeChange = () => this.syncToolButtons();
		this.onOpenExtra();
	}

	/** The calendar the slider and captions are in. */
	private mapCalendar(): string {
		const idx = this.plugin.index;
		return (this.options.map !== WORLD_MAP ? idx.get(this.options.map)?.calendar : undefined) ?? idx.dominantCalendar(this.options.folder);
	}

	/** The picture says which date the map shows; the menu adds a time-lapse. */
	protected exportExtras(): ExportExtras {
		return {
			caption: () => (this.options.at !== undefined ? formatDay(this.options.at, this.plugin.calendars.get(this.mapCalendar()), "year") : undefined),
			extra: (menu) => menu.addItem((i) => i.setTitle("Save a time-lapse (a picture per date)…").setIcon("film").onClick(() => this.timelapseSheet())),
		};
	}

	/** Asks for the span and number of frames, then captures the map at each date. */
	private timelapseSheet() {
		const cal = this.plugin.calendars.get(this.mapCalendar());
		const [a, b] = this.slider?.span ?? [0, 365];
		const fmt = (d: number) => formatDay(d, cal, "year");
		const date = (v: string) => (v.trim() ? this.plugin.parseDate(v.trim(), cal.id) : null);
		toolSheet(this.plugin, {
			title: "Time-lapse of this map",
			icon: "film",
			intro: "The map is drawn at each date in turn, from From to To, and each picture is saved with its date under it: borders, holders, names and battles as they were then. You also get one page with every frame. They go into a folder under UniverseView exports.",
			fields: [
				{ key: "from", kind: "date", label: "From", value: fmt(a), calendar: cal.id },
				{ key: "to", kind: "date", label: "To", value: fmt(b), calendar: cal.id },
				{ key: "frames", kind: "number", label: "Frames", value: 8, min: 2, max: 40, step: 1, unit: "pictures" },
			],
			check: (v) => {
				const f = date(v.from);
				const t = date(v.to);
				if (!f) return "From isn't a date yet.";
				if (!t) return "To isn't a date yet.";
				return t.end <= f.start ? "To comes before From." : undefined;
			},
			preview: (v) => {
				const n = Math.max(2, Math.min(40, Math.round(Number(v.frames) || 8)));
				const f = date(v.from)!;
				const t = date(v.to)!;
				const years = (t.end - f.start) / 365.25 / (n - 1);
				return `${n} pictures, about ${years >= 1 ? `${Math.round(years)} year${Math.round(years) === 1 ? "" : "s"}` : `${Math.max(1, Math.round(years * 365.25))} days`} apart. Keep the map open while they're made.`;
			},
			submit: "Make the time-lapse",
			run: async (v) => {
				const n = Math.max(2, Math.min(40, Math.round(Number(v.frames) || 8)));
				const f = date(v.from)!.start;
				const t = date(v.to)!.end;
				const before = this.options.at;
				const goTo = async (day: number | undefined) => {
					this.options.at = day;
					this.slider?.show(day);
					if (!this.renderer) return;
					this.renderer.options = this.options;
					await this.renderer.refresh();
					// Let labels settle and fades finish before the picture is taken.
					await new Promise((r) => window.setTimeout(r, 450));
				};
				const frames = Array.from({ length: n }, (_, i) => {
					const day = Math.round(f + ((t - f) * i) / (n - 1));
					return { label: fmt(day), go: () => goTo(day) };
				});
				await exportTimelapse(this.plugin, this.body, this.getDisplayText(), frames, () => goTo(before));
			},
		});
	}

	private update(save = true) {
		if (!this.renderer) return;
		this.renderer.options = this.options;
		void this.renderer.refresh();
		if (this.compare) {
			// The right-hand map shares everything but its own map and date.
			const c = this.compare;
			c.renderer.options = { ...this.options, map: c.map, at: c.at, views: undefined };
			void c.renderer.refresh();
		}
		(this.leaf as unknown as { updateHeader?: () => void }).updateHeader?.();
		if (save) this.app.workspace.requestSaveLayout();
	}

	// ---- Side by side -----------------------------------------------------------------------------

	private compare?: { el: HTMLElement; renderer: MapRenderer; map: string; at?: number; sync: boolean };

	/** A second map beside the first: another map, or the same one at another date, panning together. */
	private toggleCompare(on: boolean) {
		if (!on) {
			this.compare?.renderer.destroy();
			this.compare?.el.remove();
			this.compare = undefined;
			this.body.removeClass("is-compare");
			if (this.renderer) this.renderer.onMoved = undefined;
			return;
		}
		if (this.compare || !this.renderer) return;
		const idx = this.plugin.index;
		this.body.addClass("is-compare");
		const wrap = el("div", { cls: "chronicle-compare" }, this.body);
		const bar = el("div", { cls: "chronicle-compare-bar" }, wrap);
		const state = { el: wrap, renderer: undefined as unknown as MapRenderer, map: this.options.map, at: this.options.at, sync: true };
		const maps: [string, string][] = [[WORLD_MAP, "World map"], ...idx.all("map").map((m) => [m.key, m.name] as [string, string])];
		dropdown(bar, maps, state.map, (v) => {
			state.map = v;
			this.update(false);
		}, "Map on the right");
		const cal = this.plugin.calendars.get(this.options.map !== WORLD_MAP ? idx.get(this.options.map)?.calendar : idx.dominantCalendar(this.options.folder));
		const date = el("input", { cls: "chronicle-compare-date", attr: { type: "text", placeholder: "Date (blank = all time)", "aria-label": "Date on the right" } }, bar);
		const status = el("span", { cls: "chronicle-compare-status" }, bar);
		date.addEventListener("change", () => {
			const raw = date.value.trim();
			const d = raw ? this.plugin.parseDate(raw, cal.id) : null;
			status.setText(raw && !d ? "Couldn't read that date" : "");
			state.at = d ? d.end : undefined;
			this.update(false);
		});
		toggleChip(bar, "Move together", "link", true, (v) => (state.sync = v));
		const host = el("div", { cls: "chronicle-compare-map" }, wrap);
		state.renderer = new MapRenderer(host, this.plugin, { ...this.options, map: state.map, at: state.at, views: undefined }, true);
		// Keep both in step when they show the same map.
		const follow = (from: MapRenderer, to: MapRenderer) => (center: import("leaflet").LatLng, zoom: number) => {
			if (state.sync && from.mapKey === to.mapKey) to.syncTo(center, zoom);
		};
		this.renderer.onMoved = follow(this.renderer, state.renderer);
		state.renderer.onMoved = follow(state.renderer, this.renderer);
		this.compare = state;
	}

	/** Opens placing mode for one particular note: the next click on the map puts it there. */
	placeNote(key: string) {
		this.pendingPlace = key;
		this.setPlacing(true);
		this.banner?.setText(`Click the map to put ${this.plugin.index.get(key)?.name ?? "the place"} there · Esc to cancel`);
	}

	private pendingPlace?: string;

	/**
	 * A territory tool started from elsewhere (the inspector's Borders card): opens the right map on the
	 * note, then draws its borders, splits a land off, reshapes or grows one area, or gives it new
	 * borders from a date. `mapKey` and `n` say which area, when it's one of several.
	 */
	draw(key: string, how: DrawHow, n = 0, mapKey?: string) {
		this.focus(key);
		if (mapKey && mapKey !== "*" && this.options.map !== mapKey) {
			this.options.map = mapKey;
			this.fillToolbar();
			this.update();
		}
		const e = this.plugin.index.get(key);
		window.setTimeout(() => {
			const r = this.renderer;
			if (!r || !e) return;
			if (how === "split") r.startSplit(key);
			else if (how === "edit") r.startEdit(key, n);
			else if (how === "grow") growSheet(this.plugin, e, (px) => void r.closeGaps(key, n, px));
			else if (how === "borders") r.bordersFrom(e, n);
			else r.startPaint(key);
		}, 600);
	}

	focus(key: string) {
		const e = this.plugin.index.get(key);
		if (!e) return;
		// A group with its own pin goes there; otherwise to one of its places.
		const place = e.type === "place" || e.map || e.coords ? e : e.places.map((p) => this.plugin.index.get(p.key)).find(Boolean);
		if (e.type === "map") this.options.map = e.key;
		else if (place?.map) this.options.map = place.map.key;
		else if (place?.coords) this.options.map = WORLD_MAP;
		else {
			const area = e.territories.find((t) => t.map !== "*");
			if (area) this.options.map = area.map;
		}
		this.options.focus = key;
		this.fillToolbar();
		this.update();
	}

	/** Tool buttons stay filled while their tool is running. */
	private syncToolButtons() {
		const mode = this.renderer?.currentMode ?? "none";
		// Several tools share a menu button: it's lit if any of them is running.
		const lit = new Set<HTMLElement>();
		for (const [m, b] of this.toolButtons) if (mode === m || (m === "paint" && mode === "edit")) lit.add(b);
		for (const b of new Set(this.toolButtons.values())) setPressed(b, lit.has(b));
		if (this.placeBtn) setPressed(this.placeBtn, this.placing);
	}

	private setPlacing(on: boolean) {
		if (on) this.renderer?.endMode();
		this.placing = on;
		this.renderer?.setPlacing(on);
		this.syncToolButtons();
		this.banner?.remove();
		if (on) {
			this.banner = el("div", { cls: "chronicle-map-banner", text: "Click the map to place a note there · Esc to cancel" }, this.body);
			this.containerEl.tabIndex = -1;
			this.containerEl.focus();
		}
	}

	protected onOpenExtra() {
		this.registerDomEvent(this.containerEl, "keydown", (evt) => {
			if (evt.key === "Escape" && this.placing) {
				this.pendingPlace = undefined;
				this.setPlacing(false);
			}
		});
		this.registerEvent(this.app.workspace.on("chronicle:history-changed" as "quit", () => this.syncUndo()));
	}

	private undoBtn?: HTMLElement;

	private syncUndo() {
		if (!this.undoBtn) return;
		const label = this.plugin.undoLabel;
		this.undoBtn.toggleClass("is-disabled", !label);
		this.undoBtn.title = label ? `Undo: ${label} (Ctrl+Alt+Z)` : "Nothing to undo";
		this.undoBtn.setAttribute("aria-label", this.undoBtn.title);
	}

	private placeAt(pos: [number, number]) {
		this.setPlacing(false);
		const mapKey = this.options.map;
		const pending = this.pendingPlace;
		this.pendingPlace = undefined;
		if (pending) {
			const name = this.plugin.index.get(pending)?.name ?? pending;
			void this.plugin.setPlacePosition(pending, mapKey, pos, this.renderer?.imageHeightPx).then(() => new Notice(`Placed ${name}`));
			return;
		}
		new EntityPickerModal(
			this.plugin,
			["place", "culture"],
			(e) => {
				void this.plugin.setPlacePosition(e.key, mapKey, pos, this.renderer?.imageHeightPx).then(() => new Notice(`Placed ${e.name}`));
			},
			"Which place or realm is here? (Esc, then use “New place” to create one)",
		).open();
	}

	private fillToolbar() {
		this.rebuildToolbar(() => {
			const o = this.options;
			const idx = this.plugin.index;
			const left = this.group();
			const maps: [string, string][] = [[WORLD_MAP, "World map"], ...idx.all("map").map((m) => [m.key, m.name] as [string, string])];
			dropdown(left, maps, o.map, (v) => {
				o.map = v;
				// Fill only exists on image maps, so the tools change with the map.
				this.fillToolbar();
				this.update();
			}, "Map");
			this.scopePicker(left, o.folder, (v) => {
				o.folder = v;
				this.slider?.updateRange();
				this.update();
			});
			const find = this.group();
			this.entityPicker(find, ["place", "culture"], undefined, "Find a place…", (k) => {
				if (k) this.focus(k);
			});
			// Through someone's eyes: the journey they made, or the map as only they know it (fog of war).
			const nameOf = (k?: string) => (k ? idx.get(k)?.name ?? k : "");
			const lens = el("button", { cls: "chronicle-chip chronicle-overlay-btn" + (o.trace || o.pov ? " is-active" : ""), attr: { "aria-haspopup": "menu", title: "Trace someone's journey, or show the map as one person knows it" } }, find);
			icon(el("span", { cls: "chronicle-chip-icon" }, lens), o.pov ? "eye" : "footprints");
			el("span", { text: o.trace ? `Journey: ${nameOf(o.trace)}` : o.pov ? `Seen by ${nameOf(o.pov)}` : "Person" }, lens);
			if (o.trace && o.pov) el("span", { cls: "chronicle-chip-count", text: `seen by ${nameOf(o.pov)}` }, lens);
			lens.addEventListener("click", (evt) => {
				const menu = new Menu();
				const pick = (title: string, set: (k: string) => void) => new EntityPickerModal(this.plugin, ["person"], (p) => {
					set(p.key);
					this.fillToolbar();
					this.update();
				}, title).open();
				menu.addItem((i) => i.setTitle(o.trace ? `Trace another journey (now ${nameOf(o.trace)})…` : "Trace a journey…").setIcon("footprints").onClick(() => pick("Whose journey?", (k) => (o.trace = k))));
				menu.addItem((i) => i.setTitle(o.pov ? `Seen by someone else (now ${nameOf(o.pov)})…` : "Seen by… (only what they know)").setIcon("eye").onClick(() => pick("The map as who knows it?", (k) => (o.pov = k))));
				if (o.trace || o.pov) {
					menu.addSeparator();
					if (o.trace) menu.addItem((i) => i.setTitle("Stop tracing").setIcon("x").onClick(() => {
						o.trace = undefined;
						this.fillToolbar();
						this.update();
					}));
					if (o.pov) menu.addItem((i) => i.setTitle("Show everything again").setIcon("eye-off").onClick(() => {
						o.pov = undefined;
						this.fillToolbar();
						this.update();
					}));
				}
				menu.showAtMouseEvent(evt);
			});
			const time = this.group();
			this.slider = new TimeSlider(
				time,
				this.plugin,
				// An image map belongs to one world, so its calendar labels the slider.
				() => (o.map !== WORLD_MAP ? idx.get(o.map)?.calendar : undefined) ?? idx.dominantCalendar(o.folder),
				// The map note's own folder (a "Maps" folder, often) says nothing about which world's dates to span.
				() => o.folder || undefined,
				o.at,
				(day) => {
					o.at = day;
					this.update();
				},
				["event", "place", "culture"],
			);
			const look = this.group();
			// The map mode, as strategy maps have: what the lands are coloured by.
			const paint = o.paint ?? "realm";
			const current = PAINT_MODES.find(([k]) => k === paint)!;
			const modeBtn = el("button", { cls: "chronicle-chip chronicle-overlay-btn uv-mode-btn", attr: { "aria-haspopup": "menu", title: `Map mode: ${current[3]}` } }, look);
			icon(el("span", { cls: "chronicle-chip-icon" }, modeBtn), current[2]);
			el("span", { text: current[1] }, modeBtn);
			modeBtn.addEventListener("click", (evt) => {
				const menu = new Menu();
				menu.addItem((i) => i.setTitle("Map mode").setDisabled(true));
				for (const [k, label, ic, desc] of PAINT_MODES)
					menu.addItem((i) => {
						i.setTitle(label).setIcon(ic).setChecked(k === paint).onClick(() => {
							o.paint = k;
							this.fillToolbar();
							this.update();
						});
						(i as unknown as { dom?: HTMLElement }).dom?.setAttribute("title", desc);
					});
				menu.showAtMouseEvent(evt);
			});
			// How the map is coloured, in one menu: pins, realms, and which tier of realms shows.
			const colorBy: [string, string][] = [["realm", "By realm"], ["liege", "By liege"], ["house", "By house"], ["culture", "By group"], ["category", "By kind"], ["type", "One colour"]];
			const shades: [string, string][] = [["", "Their own colours"], ...STAT_NAMES.map(([k, l]) => [k, `Shaded by ${l.toLowerCase()}`] as [string, string])];
			const tierLevels: [string, string][] = [["", "By zoom"], ...[1, 2, 3, 4, 5].map((t): [string, string] => [String(t), tierName(t, true)]), ["9", "Every land"]];
			const lookBtn = el("button", { cls: "chronicle-chip chronicle-overlay-btn", attr: { "aria-haspopup": "menu", title: "Pin colours, realm colours and realm tiers" } }, look);
			icon(el("span", { cls: "chronicle-chip-icon" }, lookBtn), "palette");
			el("span", { text: "Look" }, lookBtn);
			const lookSub = el("span", { cls: "chronicle-chip-count" }, lookBtn);
			const syncLook = () => {
				const by = o.colorBy ?? this.plugin.settings.pinColorBy;
				const bits = [colorBy.find(([k]) => k === (by === "region" ? "realm" : by))?.[1], o.shadeBy ? "shaded" : "", o.tierLevel ? tierLevels.find(([k]) => k === String(o.tierLevel))?.[1] : ""].filter(Boolean);
				lookSub.setText(bits.join(" · ").toLowerCase());
			};
			syncLook();
			lookBtn.addEventListener("click", (evt) => {
				const menu = new Menu();
				const section = (title: string, list: [string, string][], current: string, pick: (v: string) => void) => {
					menu.addItem((i) => i.setTitle(title).setDisabled(true));
					for (const [v, label] of list) menu.addItem((i) => i.setTitle(label).setChecked(v === current).onClick(() => {
						pick(v);
						syncLook();
						this.update();
					}));
				};
				section("Map style", [["strategy", "Strategy: solid realms, bold borders, names across the land"], ["atlas", "Atlas: light colours, every area outlined and named"]], o.style ?? "strategy", (v) => (o.style = v as "strategy" | "atlas"));
				menu.addSeparator();
				const by = o.colorBy ?? this.plugin.settings.pinColorBy;
				section("Pin colours", colorBy, by === "region" ? "realm" : by, (v) => {
					o.colorBy = v as PinColorBy;
					o.hidden = [];
				});
				menu.addSeparator();
				section("Realm colours", shades, o.shadeBy ?? "", (v) => (o.shadeBy = (v || undefined) as StatKey | undefined));
				menu.addSeparator();
				section("Realm tiers", tierLevels, o.tierLevel ? String(o.tierLevel) : "", (v) => (o.tierLevel = v ? Number(v) : undefined));
				menu.showAtMouseEvent(evt);
			});
			// What's drawn on the map, in one menu (a count shows how many are on).
			const overlays: [keyof MapOptions, string, string, string][] = [
				["showPins", "Places", "map-pin", "Pins for places"],
				["showLabels", "Place names", "type", "Names next to the pins"],
				["showTerritories", "Territories", "hexagon", "Painted realms and regions"],
				["tiers", "Realm tiers", "layers-3", "Realms show whole from afar and split into their duchies and counties as you zoom in (or double-click them); a click picks one"],
				["fadeSmall", "Fade small areas when zoomed out", "eye-off", "Without realm tiers: provinces and small regions fade away when zoomed out (size in Settings)"],
				["showRoutes", "Routes", "route", "Roads, rivers and sea lanes"],
				["heatmap", "Event heat map", "flame", "A glow where events happened (follows the time slider)"],
				["showMovements", "Campaigns and migrations", "move-right", "Arrows for wars, campaigns, migrations and voyages across several places"],
				["showWars", "Battles", "swords", "Crossed swords where battles were fought, coloured by who won, joined by their war's campaign (follows the time slider)"],
				["showNotes", "Map notes", "sticky-note", "Your sticky notes, arrows and lines"],
				["useLayers", "Zoom layers", "layers", "Small places appear as you zoom in"],
				["cluster", "Group crowded pins", "group", "When zoomed out, pins close together merge into a numbered bubble"],
				["photoPins", "Photos in pins", "image", "Places with a picture show it in their pin"],
			];
			const isOn = (k: keyof MapOptions) => (k === "heatmap" || k === "photoPins" ? !!o[k] : o[k] !== false);
			const ovBtn = el("button", { cls: "chronicle-chip chronicle-overlay-btn", attr: { "aria-haspopup": "menu", title: "Choose what's shown on the map" } }, look);
			const ovIcon = el("span", { cls: "chronicle-chip-icon" }, ovBtn);
			icon(ovIcon, "layers");
			el("span", { text: "Overlays" }, ovBtn);
			const ovCount = el("span", { cls: "chronicle-chip-count" }, ovBtn);
			const syncCount = () => ovCount.setText(`${overlays.filter(([k]) => isOn(k)).length}/${overlays.length}`);
			syncCount();
			ovBtn.addEventListener("click", (evt) => {
				const menu = new Menu();
				for (const [k, label, ic, desc] of overlays) {
					menu.addItem((i) => {
						i.setTitle(label).setIcon(ic).setChecked(isOn(k)).onClick(() => {
							(o as unknown as Record<string, boolean>)[k] = !isOn(k);
							syncCount();
							this.update();
						});
						(i as unknown as { dom?: HTMLElement }).dom?.setAttribute("title", desc);
					});
				}
				menu.showAtMouseEvent(evt);
			});
			toggleChip(look, "With events only", "filter", o.onlyWithEvents, (v) => {
				o.onlyWithEvents = v;
				this.update();
			});
			this.spacer();
			const tools = this.group();
			// Tools come in three menus, so the toolbar stays short. A menu's button is lit while one of
			// its tools runs; clicking it then stops that tool.
			type Tool = [MapMode, string, string, () => void];
			const menuButton = (iconName: string, label: string, items: (Tool | false)[]) => {
				const list = items.filter((x): x is Tool => !!x);
				const b = iconButton(tools, iconName, label, (evt) => {
					const running = list.find(([m]) => this.renderer?.currentMode === m);
					if (running) return this.renderer?.endMode();
					const menu = new Menu();
					for (const [, ic, text, start] of list) menu.addItem((i) => i.setTitle(text).setIcon(ic).onClick(() => {
						if (this.placing) this.setPlacing(false);
						start();
					}));
					menu.showAtMouseEvent(evt);
				});
				b.addClass("chronicle-tool-menu");
				for (const [m] of list) this.toolButtons.set(m, b);
			};
			this.toolButtons.clear();
			const image = o.map !== WORLD_MAP;
			const pickPlace = (title: string, run: (key: string, name: string) => void) => new EntityPickerModal(this.plugin, ["place"], (p) => run(p.key, p.name), title).open();
			menuButton("pencil-ruler", "Draw: territories, routes, map notes", [
				["paint", "paintbrush", "Paint a territory (click corners or drag)", () => this.paint("paint")],
				image && ["fill", "paint-bucket", "Fill a territory from the image's coasts and borders", () => this.paint("fill")],
				image && ["import", "palette", "Import borders from a coloured political map", () => void this.renderer?.importColours()],
				["route", "route", "Draw a road, river or sea lane", () => new EntityPickerModal(this.plugin, undefined, (e) => this.renderer?.startRoute(e.key), "Whose route? (a realm's road, a trade company, a person's journey…)").open()],
				["notes", "sticky-note", "Map notes: sticky notes, arrows and lines", () => this.renderer?.startAnnotate()],
				["erase", "box-select", "Erase in a box: take lines, notes and painted areas off the map", () => this.renderer?.startErase()],
				["check", "shield-check", "Check borders: overlaps, gaps, stray pieces…", () => this.renderer?.checkBorders(!this.renderer.checkingBorders)],
			]);
			menuButton("navigation", "Travel: measure, plan a journey, how far in a day", [
				["measure", "ruler", "Measure distance and travel time", () => this.renderer?.startMeasure()],
				["journey", "navigation", "Plan a journey along roads, rivers and sea lanes", () => pickPlace("Journey from which place?", (k) => this.renderer?.journeyFrom(k))],
				["rings", "radar", "Rings of 1, 3, 7 and 14 days' travel around a place", () => pickPlace("Rings around which place?", (k, name) => {
					const ll = this.renderer?.latLngOf(k);
					if (ll) this.renderer?.startRings(ll, name);
					else new Notice(`${name} isn't on this map.`);
				})],
			]);
			if (image) menuButton("scan-search", "From the image: coasts, roads and rivers, borders", [
				["coast", "waves", "Find coasts and save them as areas or lines", () => void this.renderer?.startCoast()],
				["trace", "spline", "Trace roads and rivers as routes", () => void this.renderer?.startTraceLines()],
				["borders", "land-plot", "Borders from seats: share the land between groups", () => void this.renderer?.startBorders()],
			]);			const cmp = iconButton(tools, "columns-2", "Compare: a second map beside this one (another map, or another date)", () => {
				this.toggleCompare(!this.compare);
				setPressed(cmp, !!this.compare);
			});
			setPressed(cmp, !!this.compare);
			this.placeBtn = iconButton(tools, "map-pin-plus", "Put an existing place on the map", () => this.setPlacing(!this.placing));
			const move = iconButton(tools, "move", "Move pins (drag them, positions are saved)", () => {
				o.editable = !o.editable;
				setPressed(move, o.editable);
				// Marker drag state is fixed at creation, so rebuild the pins.
				this.update();
			});
			setPressed(move, o.editable);
			this.syncToolButtons();
			this.undoBtn = iconButton(tools, "undo-2", "Undo", () => void this.plugin.undo());
			this.syncUndo();
			iconButton(tools, "maximize", "Fit everything", () => this.renderer?.fit());
			iconButton(tools, "plus", "New place", () => this.plugin.createEntityPrompt({ type: "place", map: o.map !== WORLD_MAP ? idx.get(o.map)?.name : undefined }), "mod-cta-icon");
		});
	}

	private paint(how: "paint" | "fill") {
		new EntityPickerModal(
			this.plugin,
			["culture", "place"],
			(e) => (how === "fill" ? void this.renderer?.startFill(e.key) : this.renderer?.startPaint(e.key)),
			"Whose territory? (a nation, house, faith, region…)",
		).open();
	}
	protected onIndexChanged() {
		this.slider?.updateRange();
		void this.renderer?.refresh();
	}

	async onClose() {
		this.slider?.stop();
		this.toggleCompare(false);
		this.renderer?.destroy();
	}
}
