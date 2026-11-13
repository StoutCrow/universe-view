import { warSpan } from "../index/wars";

/** What a territory tool started from elsewhere does. */
export type DrawHow = "paint" | "split" | "edit" | "grow" | "borders";
import { STAT_NAMES, type StatKey } from "../index/realmstats";
import { tierName } from "../index/realms";
import { Menu, Notice, ViewStateResult } from "obsidian";
import { DEFAULT_MAP_OPTIONS, MapMode, MapOptions, MapRenderer, paintModes, WORLD_MAP } from "../render/map";
import { dropdown, el, icon, iconButton, setPressed, toggleChip } from "../render/common";
import { optionsButton, type OptionEntry } from "../render/optionsmenu";
import { GROUP_KINDS } from "../render/houses";
import { relOne } from "../index/relkinds";
import type { PinColorBy } from "../settings";
import { EntityPickerModal } from "../ui/suggest";
import { UniverseViewBase, TimeSlider } from "./base";
import { exportTimelapse, type ExportExtras } from "../ui/export";
import { toolSheet } from "../ui/toolsheet";
import { formatDay } from "../dates/parser";

export const VIEW_MAP = "chronicle-map";

export class MapView extends UniverseViewBase {
	protected exportable = true;
	private options: MapOptions = { ...DEFAULT_MAP_OPTIONS };
	private renderer?: MapRenderer;
	private slider?: TimeSlider;
	private placing = false;
	private placeBtn?: HTMLElement;
	/** The last tool picked from a menu, so one click repeats it. */
	private lastTool?: { icon: string; text: string; start: () => void };
	private repeatBtn?: HTMLElement;
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

	/** Plays a war through on the map, from its first day to its last. */
	playWar(key: string) {
		const e = this.plugin.index.get(key);
		const span = e && warSpan(this.plugin.index, e);
		if (span) this.slider?.playBetween(span[0], span[1]);
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

	/** The date moved but nothing it shows changed: only the header and the saved state follow. */
	private timeOnly() {
		(this.leaf as unknown as { updateHeader?: () => void }).updateHeader?.();
		this.app.workspace.requestSaveLayout();
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
		const wrap = el("div", { cls: "universeview-compare" }, this.body);
		const bar = el("div", { cls: "universeview-compare-bar" }, wrap);
		const state = { el: wrap, renderer: undefined as unknown as MapRenderer, map: this.options.map, at: this.options.at, sync: true };
		const maps: [string, string][] = [[WORLD_MAP, "World map"], ...idx.all("map").map((m) => [m.key, m.name] as [string, string])];
		dropdown(bar, maps, state.map, (v) => {
			state.map = v;
			this.update(false);
		}, "Map on the right");
		const cal = this.plugin.calendars.get(this.options.map !== WORLD_MAP ? idx.get(this.options.map)?.calendar : idx.dominantCalendar(this.options.folder));
		const date = el("input", { cls: "universeview-compare-date", attr: { type: "text", placeholder: "Date (blank = all time)", "aria-label": "Date on the right" } }, bar);
		const status = el("span", { cls: "universeview-compare-status" }, bar);
		date.addEventListener("change", () => {
			const raw = date.value.trim();
			const d = raw ? this.plugin.parseDate(raw, cal.id) : null;
			status.setText(raw && !d ? "Couldn't read that date" : "");
			state.at = d ? d.end : undefined;
			this.update(false);
		});
		toggleChip(bar, "Move together", "link", true, (v) => (state.sync = v));
		const host = el("div", { cls: "universeview-compare-map" }, wrap);
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
			else if (how === "grow") r.startGrow(key, n);
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
	private rememberTool(ic: string, text: string, start: () => void) {
		this.lastTool = { icon: ic, text, start };
		this.syncRepeat();
	}

	/** The "Again" chip: shows the last tool by name, hidden until one has been used. */
	private syncRepeat() {
		const b = this.repeatBtn;
		if (!b) return;
		const t = this.lastTool;
		b.toggleClass("is-hidden", !t);
		if (!t) return;
		const name = t.text.split(/ \(|: /)[0];
		b.empty();
		icon(el("span", { cls: "universeview-chip-icon" }, b), t.icon);
		el("span", { text: `Again: ${name.length > 26 ? `${name.slice(0, 25)}…` : name}` }, b);
		b.title = `Repeat: ${t.text}`;
		b.setAttribute("aria-label", b.title);
	}

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
			this.banner = el("div", { cls: "universeview-map-banner", text: "Click the map to place a note there · Esc to cancel" }, this.body);
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
		this.registerEvent(this.app.workspace.on("universeview:history-changed" as "quit", () => this.syncUndo()));
	}

	private undoBtn?: HTMLElement;
	private redoBtn?: HTMLElement;

	private syncUndo() {
		if (!this.undoBtn) return;
		const label = this.plugin.undoLabel;
		this.undoBtn.toggleClass("is-disabled", !label);
		this.undoBtn.title = label ? `Undo: ${label} (Ctrl+Alt+Z)` : "Nothing to undo";
		this.undoBtn.setAttribute("aria-label", this.undoBtn.title);
		const redo = this.plugin.redoLabel;
		this.redoBtn?.toggleClass("is-disabled", !redo);
		if (this.redoBtn) this.redoBtn.title = redo ? `Redo: ${redo} (Ctrl+Alt+Y)` : "Nothing to redo";
		this.redoBtn?.setAttribute("aria-label", this.redoBtn.title);
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
			const lens = el("button", { cls: "universeview-chip universeview-overlay-btn" + (o.trace || o.pov ? " is-active" : ""), attr: { "aria-haspopup": "menu", title: "Trace someone's journey, or show the map as one person knows it" } }, find);
			icon(el("span", { cls: "universeview-chip-icon" }, lens), o.pov ? "eye" : "footprints");
			el("span", { text: o.trace ? `Journey: ${nameOf(o.trace)}` : o.pov ? `Seen by ${nameOf(o.pov)}` : "Person" }, lens);
			if (o.trace && o.pov) el("span", { cls: "universeview-chip-count", text: `seen by ${nameOf(o.pov)}` }, lens);
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
					const same = idx.timeStep(day) === idx.timeStep(o.at);
					o.at = day;
					// Nothing on the map changes between these two days: keep what's drawn.
					// Between two changes nothing is redrawn, except what travels with the date: journeys and people.
					if (same) {
						this.timeOnly();
						this.renderer?.redrawMoving();
					} else this.update();
				},
				["event", "place", "culture"],
			);
			// The place the map is narrowed to (with everything inside it): click to show every place again.
			if (o.within) {
				const only = el("button", { cls: "universeview-chip is-active", attr: { title: "Showing only this place and what is in it. Click to show every place", "aria-label": `Only in ${idx.get(o.within)?.name ?? "a place"}: click to clear` } }, time);
				icon(el("span", { cls: "universeview-chip-icon" }, only), "map-pin");
				el("span", { text: `In ${idx.get(o.within)?.name ?? "a place"}` }, only);
				only.addEventListener("click", () => {
					o.within = undefined;
					this.fillToolbar();
					this.update();
				});
			}
				// Everything on the right stays together, however the toolbar wraps: how it is drawn (one Options panel, as in every
			// other view), then tools in labelled menus so each says what it is for, then undo and the rest.
			const cluster = this.group("uv-map-tools");
			const subgroup = () => el("div", { cls: "universeview-toolbar-group" }, cluster);
			optionsButton(subgroup(), () => this.lookOptions());
			const tools = subgroup();
			type Tool = [MapMode | undefined, string, string, () => void];
			const labelled = (parent: HTMLElement, iconName: string, label: string, title: string, menu: boolean) => {
				const b = el("button", { cls: "universeview-chip" + (menu ? " universeview-tool-menu" : ""), attr: { title, "aria-label": title } }, parent);
				icon(el("span", { cls: "universeview-chip-icon" }, b), iconName);
				el("span", { text: label }, b);
				if (menu) icon(el("span", { cls: "uv-chip-caret" }, b), "chevron-down");
				return b;
			};
			// A menu button is lit while one of its tools runs; clicking it then stops that tool.
			const menuButton = (iconName: string, label: string, title: string, items: (Tool | false)[]) => {
				const list = items.filter((x): x is Tool => !!x);
				const b = labelled(tools, iconName, label, title, true);
				b.addEventListener("click", (evt) => {
					const running = list.find(([m]) => m && this.renderer?.currentMode === m);
					if (running) return this.renderer?.endMode();
					const menu = new Menu();
					for (const [, ic, text, start] of list) menu.addItem((i) => i.setTitle(text).setIcon(ic).onClick(() => {
						if (this.placing) this.setPlacing(false);
						this.rememberTool(ic, text, start);
						start();
					}));
					menu.showAtMouseEvent(evt);
				});
				for (const [m] of list) if (m) this.toolButtons.set(m, b);
			};
			this.toolButtons.clear();
			const image = o.map !== WORLD_MAP;
			const pickPlace = (title: string, run: (key: string, name: string) => void) => new EntityPickerModal(this.plugin, ["place"], (p) => run(p.key, p.name), title).open();
			menuButton("pencil-ruler", "Draw", "Draw: land painter, territories, routes, map notes", [
				[undefined, "palette", "Land painter: pick a land, paint, pick the next", () => this.renderer?.togglePainter()],
				["paint", "paintbrush", "Paint a territory (click corners or drag)", () => this.paint("paint")],
				image && ["fill", "paint-bucket", "Fill a territory from the image's coasts and borders", () => this.paint("fill")],
				image && ["import", "image-down", "Import borders from a coloured political map", () => void this.renderer?.importColours()],
				["route", "route", "Draw a road, river or sea lane", () => new EntityPickerModal(this.plugin, undefined, (e) => this.renderer?.startRoute(e.key), "Whose route? (a realm's road, a trade company, a person's journey…)").open()],
				["notes", "sticky-note", "Map notes: sticky notes, arrows and lines", () => this.renderer?.startAnnotate()],
				["erase", "box-select", "Erase in a box: take lines, notes and painted areas off the map", () => this.renderer?.startErase()],
				["check", "shield-check", "Check borders: overlaps, gaps, stray pieces…", () => this.renderer?.checkBorders(!this.renderer.checkingBorders)],
			]);
			menuButton("navigation", "Travel", "Travel: measure, plan a journey, how far in a day", [
				["measure", "ruler", "Measure distance and travel time", () => this.renderer?.startMeasure()],
				["journey", "navigation", "Plan a journey along roads, rivers and sea lanes", () => pickPlace("Journey from which place?", (k) => this.renderer?.journeyFrom(k))],
				["rings", "radar", "Rings of 1, 3, 7 and 14 days' travel around a place", () => pickPlace("Rings around which place?", (k, name) => {
					const ll = this.renderer?.latLngOf(k);
					if (ll) this.renderer?.startRings(ll, name);
					else new Notice(`${name} isn't on this map.`);
				})],
			]);
			if (image) menuButton("scan-search", "From image", "From the image: coasts, roads and rivers, borders", [
				["coast", "waves", "Find coasts and save them as areas or lines", () => void this.renderer?.startCoast()],
				["trace", "spline", "Trace roads and rivers as routes", () => void this.renderer?.startTraceLines()],
				["borders", "land-plot", "Borders from seats: share the land between groups", () => void this.renderer?.startBorders()],
			]);
			// One click to use the last tool again (the menus above stay for choosing another).
			this.repeatBtn = labelled(tools, "rotate-cw", "Again", "Repeat the last tool", false);
			this.repeatBtn.addEventListener("click", () => {
				if (this.renderer?.currentMode && this.renderer.currentMode !== "none") return this.renderer.endMode();
				if (this.placing) this.setPlacing(false);
				this.lastTool?.start();
			});
			this.syncRepeat();
			const pins = subgroup();
			this.placeBtn = labelled(pins, "map-pin-plus", "Place pin", "Put an existing place on the map: click where it goes", false);
			this.placeBtn.addEventListener("click", () => this.setPlacing(!this.placing));
			const move = labelled(pins, "move", "Move pins", "Move pins: drag them, positions are saved", false);
			move.addEventListener("click", () => {
				o.editable = !o.editable;
				setPressed(move, o.editable);
				// Marker drag state is fixed at creation, so rebuild the pins.
				this.update();
			});
			setPressed(move, o.editable);
			this.syncToolButtons();
			const end = subgroup();
			this.undoBtn = iconButton(end, "undo-2", "Undo", () => void this.plugin.undo());
			this.redoBtn = iconButton(end, "redo-2", "Redo", () => void this.plugin.redo());
			this.syncUndo();
			iconButton(end, "maximize", "Fit everything", () => this.renderer?.fit());
			iconButton(end, "plus", "New place", () => this.plugin.createEntityPrompt({ type: "place", map: o.map !== WORLD_MAP ? idx.get(o.map)?.name : undefined }), "mod-cta-icon");
		});
	}

	/** The Options panel: map mode and style, colours, and what is drawn, in groups. */
	private lookOptions(): OptionEntry[] {
		const o = this.options;
		const colorBy: [string, string][] = [["realm", "By realm"], ["liege", `By ${relOne("liege")}`], ["house", `By ${GROUP_KINDS.house.label.toLowerCase()}`], ["culture", "By group"], ["category", "By kind"], ["type", "One colour"]];
		const shades: [string, string][] = [["", "Their own colours"], ...STAT_NAMES.map(([k, l]) => [k, `Shaded by ${l.toLowerCase()}`] as [string, string])];
		const tierLevels: [string, string][] = [["", "By zoom"], ...[1, 2, 3, 4, 5].map((t): [string, string] => [String(t), tierName(t, true)]), ["9", "Every land"]];
		const overlays: [keyof MapOptions, string, string][] = [
			["showPins", "Places", "Pins for places"],
			["showLabels", "Place names", "Names next to the pins"],
			["showTerritories", "Territories", "Painted realms and regions"],
			["tiers", "Realm tiers", `Realms show whole from afar and split into their ${tierName(3, true).toLowerCase()} and ${tierName(4, true).toLowerCase()} as you zoom in (or double-click them); a click picks one`],
			["fadeSmall", "Fade small areas when zoomed out", "Without realm tiers: provinces and small regions fade away when zoomed out (size in Settings)"],
			["showRoutes", "Routes", "Roads, rivers and sea lanes"],
			["heatmap", "Event heat map", "A glow where events happened (follows the time slider)"],
			["showMovements", "Campaigns and migrations", "Arrows for wars, campaigns, migrations and voyages across several places"],
			["showPeople", "People at this date", "Where each person is on the time slider's date: at an event, on the road, or at home (their residence). Needs a date set on the slider"],
			["showWars", "Battles", "Crossed swords where battles were fought, coloured by who won, joined by their war's campaign (follows the time slider)"],
			["showNotes", "Map notes", "Your sticky notes, arrows and lines"],
			["useLayers", "Zoom layers", "Small places appear as you zoom in"],
			["cluster", "Group crowded pins", "When zoomed out, pins close together merge into a numbered bubble"],
			["photoPins", "Photos in pins", "Places with a picture show it in their pin"],
		];
		const isOn = (k: keyof MapOptions) => (k === "heatmap" || k === "photoPins" || k === "showPeople" ? !!o[k] : o[k] !== false);
		const by = o.colorBy ?? this.plugin.settings.pinColorBy;
		return [
			{ type: "heading", label: "Map" },
			{ type: "choice", label: "Map mode", options: paintModes().map(([k, label]) => [k, label] as [string, string]), get: () => o.paint ?? "realm", set: (v) => { o.paint = v as MapOptions["paint"]; this.update(); }, hint: "What the lands are coloured by" },
			{ type: "choice", label: "Map style", options: [["strategy", "Strategy"], ["atlas", "Atlas"]], get: () => o.style ?? "strategy", set: (v) => { o.style = v as "strategy" | "atlas"; this.update(); }, hint: "Strategy: solid realms, bold borders, names across the land. Atlas: light colours, every area outlined and named" },
			{ type: "heading", label: "Colours" },
			{ type: "choice", label: "Pins", options: colorBy, get: () => (by === "region" ? "realm" : by), set: (v) => { o.colorBy = v as PinColorBy; o.hidden = []; this.update(); } },
			{ type: "choice", label: "Realms", options: shades, get: () => o.shadeBy ?? "", set: (v) => { o.shadeBy = (v || undefined) as StatKey | undefined; this.update(); } },
			{ type: "choice", label: "Realm tiers", options: tierLevels, get: () => (o.tierLevel ? String(o.tierLevel) : ""), set: (v) => { o.tierLevel = v ? Number(v) : undefined; this.update(); } },
			{ type: "heading", label: "Show on the map" },
			...overlays.map(([k, label, hint]): OptionEntry => ({ type: "toggle", label, hint, get: () => isOn(k), set: (v) => { (o as unknown as Record<string, boolean>)[k] = v; this.update(); } })),
			{
				type: "action", label: o.within ? `Only in ${this.plugin.index.get(o.within)?.name ?? "a place"}: change…` : "Only in a place…", icon: "map-pin",
				run: () => new EntityPickerModal(this.plugin, ["place"], (place) => {
					o.within = place.key;
					this.fillToolbar();
					this.update();
					this.renderer?.focusOn(place.key);
				}, "Only what is in or under which place?").open(),
			},
			...(o.within ? [{ type: "action", label: "Show every place", icon: "x", run: () => { o.within = undefined; this.fillToolbar(); this.update(); } } as OptionEntry] : []),
			{ type: "toggle", label: "Only places with events", get: () => !!o.onlyWithEvents, set: (v) => { o.onlyWithEvents = v; this.update(); } },
			{ type: "heading", label: "View" },
			{ type: "toggle", label: "Compare with a second map", get: () => !!this.compare, set: (v) => this.toggleCompare(v), hint: "A second map beside this one: another map, or another date" },
		];
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
