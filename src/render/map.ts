import * as L from "leaflet";
import { Menu, Notice, Platform, TFile, debounce } from "obsidian";
import { phoneCopy, phoneCopyByName, savePhoneCopy, tooBigForPhone } from "./phonecopy";
import { touchHelp } from "./touchhelp";
import { brushShape, cutFrom, mergeInto, pocketsBetween, tidyRing, untangle } from "../index/merge";
import { ROUGHNESS, cornerDistance, holdRadius, roughenRing } from "../index/rough";
import { simplifyShared } from "../index/simplify";
import { ribbon, smoothLine } from "../index/ribbon";
import { landFill, thinWater } from "./landfill";
import { formatDay, parseDate } from "../dates/parser";
import { TextPrompt } from "../ui/TextPrompt";
import type UniverseViewPlugin from "../main";
import type { Entity, PinSize, Territory } from "../types";
import { CATEGORY_SCALE, PinColorBy, parseMapCategories, placeCategories } from "../settings";
import { styleKeyOf } from "../index/placekinds";
import { formatDate, formatSpan } from "../dates/parser";
import { activeAt } from "../index/EntityIndex";
import { motionMs } from "../appearance";
import { bindHover, cultureColor, el, emptyState, entityColor, glyph, hashColor, helpTip, icon, openEntity, ownershipLines, resourceUrl, showEntityMenu, typeColorVar, warningItem } from "./common";
import { fillFrom, nearestSet, Pt, Raster, rasterize, simplifyOpen, simplifyRing, snapPoint, snapRing, traceOutlines } from "./fill";
import { days, kmPerUnit, parseScale, planJourney, ROUTE_SPEED, SPEED_KM, TERRAIN_SLOW, terrainFactor, type RouteLine, type XY } from "./travel";
import { totalPopulation } from "../index/tidy";
import { labelOutlines, partitionLand } from "./fill";
import { detectCoast, detectLines, edgeColor, lineColorAt, traceBetween, waterLines, wetMask } from "./trace";
import { alongRing, traceMask } from "./follow";
import { getPyramid, levelFor, type Pyramid } from "./bigimage";
import { shownAs, visibleTiers, type Tiers } from "./tiers";
import { chainOf, tierLabel, tierName, type RealmTree } from "../index/realms";
import { ensureTerritoryDefs, styleFor, tierClass, tierNumber } from "../ui/territorystyle";
import { boxOf, gridIn, inRing, labelSpot, mainAxis, nearestOnRing, ringArea, shapeHash, snapToNeighbour, splitRing, unionOutline, type P2 } from "../index/geometry";
import { checkBorders, type BorderArea, type BorderIssue, type BorderIssueKind } from "../index/bordercheck";
import { nameSize, realmShape, type RealmShape } from "./strategy";
import { GROUP_KINDS, groupKind } from "./houses";

/** Lands with no house, culture or faith in the current map mode. */
const NO_GROUP = "#9a958c";
import { nameAt } from "../index/renames";
import { ColourImportModal, findColourAreas } from "./colourimport";
import { areaDatesSheet, bordersFromSheet, mapNoteSheet, moveMapSheet, newLandSheet, splitNameSheet } from "../ui/territoryactions";
import { toolSheet } from "../ui/toolsheet";
import { STAT_NAMES, realmStats, statValue, type StatKey } from "../index/realmstats";
import { EntityPickerModal } from "../ui/suggest";
import { readPoints, writePoints } from "../index/reader";
import type { MapNote } from "../settings";
import { battlesByWar, isBattle, occupationsAt, sidesOf, victorOf } from "../index/wars";
import { asText, splitSpan } from "../index/text";
import { isMovement, pathPoint, progress } from "../index/eventkinds";
import { eventAt, locationAt } from "../index/whereabouts";
import { placesInside } from "../index/placepath";

export const WORLD_MAP = "world";

export type PaintMode = "realm" | "title" | "house" | "culture" | "faith" | "terrain";
/** The ways to colour lands, in the world setting's words (tier names, what a family is called). */
export const paintModes = (): [PaintMode, string, string, string][] => [
	["realm", "Realms", "crown", `Each land in the colour of the realm it shows as (its ${tierName(2).toLowerCase()} from afar, its ${tierName(4).toLowerCase()} close up)`],
	["title", "Titles", "layers", "Every title in its own colour, whatever realm it's in"],
	["house", GROUP_KINDS.house.plural, GROUP_KINDS.house.icon, `Coloured by the ${GROUP_KINDS.house.label.toLowerCase()} that holds each realm`],
	["culture", "Cultures", "languages", "Coloured by each realm's culture or people"],
	["faith", "Faiths", "sparkles", "Coloured by each realm's faith"],
	["terrain", "Terrain", "mountain", "No colour: the map itself, with borders"],
];

export interface MapOptions {
	/** Hold the realm tiers at one level (1 empires … 5 baronies, 9 every land); unset: by zoom. */
	tierLevel?: number;
	/** Shade each realm as it shows by a statistic (area, population…), light to dark; unset: its own colour. */
	shadeBy?: StatKey;
	/** "world" for the real-world tile map, otherwise the key of a `type: map` note. */
	map: string;
	focus?: string;
	/** Universal day: only places that exist and events that happened by then. */
	at?: number;
	/** Person whose journey (places of their events, in order) is drawn. */
	trace?: string;
	folder?: string;
	onlyWithEvents: boolean;
	editable: boolean;
	/** What decides a pin's color (and the legend). Defaults to the plugin setting. */
	colorBy?: PinColorBy;
	showTerritories: boolean;
	showLabels: boolean;
	/** Hide places on higher layers (villages, buildings) until you zoom in. */
	useLayers?: boolean;
	/** Roads, rivers and sea lanes drawn on the map. */
	showRoutes?: boolean;
	/** A glow where events happened (respects the time slider). */
	heatmap?: boolean;
	showPins?: boolean;
	/** Narrowed to one place and everything inside it (the key of a place note): only its pins, events and people show. */
	within?: string;
	/** Where each person is on the time slider's date: at an event, on the road, or at home. Off unless asked for. */
	showPeople?: boolean;
	/** Arrows for wars, campaigns, migrations and voyages that cross several places. */
	showMovements?: boolean;
	/** Crowded pins merge into numbered bubbles when zoomed out. */
	cluster?: boolean;
	/** Places with a picture show it in their pin. */
	photoPins?: boolean;
	/** Sticky notes, arrows and lines drawn on the map. */
	showNotes?: boolean;
	/** Battles as crossed swords coloured by who won, and each war's campaign through them. */
	showWars?: boolean;
	/**
	 * strategy (the default): a grand-strategy look, with solid political colours from afar, one
	 * thick border round each realm, and realm names curved across their land. atlas: the lighter
	 * hand-drawn look, each area outlined and named on its own.
	 */
	style?: "strategy" | "atlas";
	/** What the lands are coloured by: their realm, their own title, the ruling house, culture or faith; or not at all (terrain). */
	paint?: PaintMode;
	/** Territories too small to make out fade away as you zoom out (size from the settings). */
	fadeSmall?: boolean;
	/** Realms show whole from afar and split into duchies and counties as you zoom in (or double-click them); a click picks one. */
	tiers?: boolean;
	/** Fog of war: only what this person knows about (by the time slider's date). */
	pov?: string;
	/** Legend groups switched off. */
	hidden?: string[];
	/** Last viewport per map: [lat, lng, zoom]. */
	views?: Record<string, [number, number, number]>;
}

export const DEFAULT_MAP_OPTIONS: MapOptions = { map: WORLD_MAP, onlyWithEvents: false, editable: false, showTerritories: true, showLabels: true, useLayers: true, showRoutes: true, heatmap: false, showPins: true };

export const ROUTE_KINDS: [string, string][] = [["road", "Road"], ["path", "Path or trail"], ["river", "River"], ["sea", "Sea lane"], ["trade", "Trade route"], ["rail", "Railway"], ["border", "Border line"]];

/** Kilometres per day for each way of travelling (a map note's `travel:` can override, in its own units). */
const TRAVEL_KM_PER_DAY: Record<string, [string, number][]> = {
	road: [["on foot", 30], ["by horse", 60], ["by wagon", 35]],
	path: [["on foot", 25], ["by horse", 45]],
	trade: [["by caravan", 30], ["by horse", 60]],
	river: [["by boat", 60]],
	sea: [["by ship", 150]],
	rail: [["by train", 600]],
	measure: [["on foot", 30], ["by horse", 60], ["by ship", 150]],
};

interface Pin {
	place: Entity;
	latlng: L.LatLngExpression;
	events: Entity[];
	marker: L.Marker;
	group: string;
	layer: number;
	/** The layer came from the note or the settings (not a built-in guess), so it always applies. */
	explicitLayer: boolean;
}

const DOT_PX: Record<PinSize, number> = { tiny: 10, small: 14, medium: 18, large: 24, huge: 30 };

interface Group {
	id: string;
	label: string;
	/** Who holds it ("James II · House Whitmore"). */
	detail?: string;
	color: string;
	icon?: string;
	count: number;
	/** A title the legend row can zoom to. */
	target?: string;
}

export type MapMode = "none" | "paint" | "expand" | "brush" | "simplify" | "grow" | "fill" | "import" | "edit" | "measure" | "route" | "notes" | "rings" | "journey" | "borders" | "coast" | "trace" | "erase"
	/** Never a running mode: names the border check's menu entry. */
	| "check";
type Mode = MapMode;
/** What Grow would do: the area's new outline, and the neighbours' borders with the matching corners added. */
interface GrowPlan {
	points: [number, number][];
	rings: { key: string; n: number; ring: [number, number][] }[];
	moved: number;
	names: string[];
}

/** An area as drawn right now, in stored coordinates (used for snapping and as a fill barrier). */
interface DrawnArea {
	key: string;
	n: number;
	points: Pt[];
}

/** Coast and river pixels: `w`×`h`, each `scale` map units across, starting at `ox`,`oy` on the map. */
interface WaterMask {
	map: string;
	mask: Uint8Array;
	w: number;
	h: number;
	scale: number;
	ox: number;
	oy: number;
}

/** Distance in pixels from a point to the segment a-b. */
function segmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
	const dx = bx - ax;
	const dy = by - ay;
	const t = dx || dy ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))) : 0;
	return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Where a point snapped: onto a neighbour (which one, and how far along its border) or onto water. */
interface SnapAt {
	ll: L.LatLng;
	kind: "vertex" | "edge" | "water";
	shape?: number;
	at?: number;
}

/**
 * Places on a real-world tile map or on a custom image map (fantasy worlds, floor plans),
 * with painted territories, their events, a time filter, journeys and measuring.
 */
export class MapRenderer {
	private root: HTMLElement;
	private mapEl: HTMLElement;
	private map?: L.Map;
	private layers?: L.LayerGroup;
	private territoryLayer?: L.LayerGroup;
	private routeLayer?: L.LayerGroup;
	private heatLayer?: L.LayerGroup;
	private moveLayer?: L.LayerGroup;
	private peopleLayer?: L.LayerGroup;
	private noteLayer?: L.LayerGroup;
	private warLayer?: L.LayerGroup;
	private strategyLayer?: L.LayerGroup;
	private clusterLayer?: L.LayerGroup;
	private toolLayer?: L.LayerGroup;
	private legend?: L.Control;
	private imageHeight = 0;
	private imageWidth = 0;
	/** The image on show (maps can have one per era) and its layer, to swap when the date changes. */
	private currentImage?: string;
	/** The file actually drawn: the picture itself, or on a phone its smaller copy. Tools read this one, never a huge original. */
	private shownImage?: string;
	private imageLayer?: L.Layer;
	private currentBase = "";
	private resizeObs: ResizeObserver;
	private pins: Pin[] = [];
	private hasFitted = false;
	private token = 0;
	private sizedFit = false;
	private mode: Mode = "none";
	private banner?: HTMLElement;
	private modeCleanup: (() => void)[] = [];
	private declutterFrame = 0;
	private drawnAreas: DrawnArea[] = [];
	/** The map image's pixels (downscaled), read once per map for filling. */
	private raster?: { map: string; img: Raster; scale: number };
	/** Tool choices (sliders, switches) saved once they settle, not on every step of a slider: fewer writes for Sync to carry. */
	private saveSoon = debounce(() => void this.plugin.saveSettings(), 600, true);
	// The Fill tool's choices, kept in the settings (Settings → Map tools) so they're remembered.
	private get fillTolerance() {
		return this.plugin.settings.fillTolerance ?? 14;
	}
	private set fillTolerance(v: number) {
		this.plugin.settings.fillTolerance = v;
		this.saveSoon();
	}
	private get fillGaps() {
		return this.plugin.settings.fillGaps ?? 2;
	}
	private set fillGaps(v: number) {
		this.plugin.settings.fillGaps = v;
		this.saveSoon();
	}
	/** Fill by the picture's colour, or paint-bucket by ground (all the land, or all the water, joined to the click). */
	private get fillBy(): "colour" | "ground" {
		return this.plugin.settings.fillBy ?? "ground";
	}
	private set fillBy(v: "colour" | "ground") {
		this.plugin.settings.fillBy = v;
		this.saveSoon();
	}
	private get fillCrossRivers() {
		return !!this.plugin.settings.fillCrossRivers;
	}
	private set fillCrossRivers(v: boolean) {
		this.plugin.settings.fillCrossRivers = v;
		this.saveSoon();
	}
	/** Set by the view: called with a position when the user clicks the map in placing mode. */
	onPlaceClick?: (pos: [number, number]) => void;
	/** Set by the view: options it should remember (legend toggles, viewport). */
	onOptionsChange?: () => void;
	/** Set by the view: a tool started or ended, so its button can show it's on. */
	onModeChange?: (mode: MapMode) => void;
	/** Set by the view: the user panned or zoomed (for keeping two maps side by side in step). */
	onMoved?: (center: L.LatLng, zoom: number) => void;
	private syncing = false;

	/** Moves to another map's view without reporting it back (no ping-pong between two maps). */
	syncTo(center: L.LatLng, zoom: number) {
		if (!this.map) return;
		this.syncing = true;
		this.map.setView(center, zoom, { animate: false });
		window.setTimeout(() => (this.syncing = false), 50);
	}

	get mapKey(): string {
		return this.options.map;
	}

	/** Where a place is on this map, if it is. */
	latLngOf(key: string): L.LatLng | undefined {
		const e = this.plugin.index.get(key);
		const ll = e && this.toLatLng(e);
		return ll ? L.latLng(ll) : undefined;
	}

	constructor(
		private container: HTMLElement,
		private plugin: UniverseViewPlugin,
		public options: MapOptions,
		private embedded = false,
	) {
		this.root = el("div", { cls: "universeview-map" + (embedded ? " is-embedded" : "") }, container);
		this.mapEl = el("div", { cls: "universeview-map-canvas" }, this.root);
		// Leaflet makes its box position: relative unless it is already positioned (it may not be in the page yet).
		this.mapEl.setCssStyles({ position: "absolute" });
		this.resizeObs = new ResizeObserver(() => {
			if (!this.map) return;
			this.map.invalidateSize();
			// Code blocks render before they're on the page; fit once the map has a real size.
			if (!this.sizedFit && this.root.clientWidth > 0) {
				this.sizedFit = true;
				if (!this.options.focus && !this.savedView()) this.fit(false);
			}
			this.scheduleDeclutter();
		});
		this.resizeObs.observe(this.root);
		void this.refresh();
		// If no map has appeared after a while (a phone that can't show it, say), say why on screen:
		// there's no developer console to look in on a phone.
		if (!this.embedded) this.watchdog = window.setTimeout(() => this.checkAppeared(), 7000);
	}

	/** How far building the map got, for the report shown when it doesn't appear. */
	private stage = "starting";
	private lastError?: string;
	private watchdog = 0;
	private watchdogWaits = 0;

	private showError(err: unknown) {
		console.error("UniverseView map:", err);
		this.lastError = String((err as Error)?.stack ?? (err as Error)?.message ?? err).slice(0, 600);
		this.root.querySelector(".universeview-empty")?.remove();
		emptyState(this.root, "alert-triangle", "The map couldn't load", String((err as Error)?.message ?? err));
		this.showReport("The map couldn't load");
	}

	/** Shows the report when there's still no map to see (no map made, or one with no size). */
	private checkAppeared() {
		if (!this.root.isConnected) return;
		// A very large picture can take a while to prepare: that isn't a failure yet.
		if (!this.map && /^(measuring|preparing)/.test(this.stage) && this.watchdogWaits++ < 4) {
			this.watchdog = window.setTimeout(() => this.checkAppeared(), 7000);
			return;
		}
		const box = this.mapEl.getBoundingClientRect();
		const ok = !!this.map && box.width > 20 && box.height > 20;
		if (!ok && !this.root.querySelector(".universeview-empty")) this.showReport("The map hasn't appeared");
	}

	/** What to tell whoever's helping: version, device, sizes, how far the map got, and any error. */
	private report(): string {
		const m = this.plugin.index.get(this.options.map);
		const img = this.imageFor(m);
		const rect = (e: Element | null) => {
			const r = e?.getBoundingClientRect();
			return r ? `${Math.round(r.width)}×${Math.round(r.height)}` : "none";
		};
		return [
			`UniverseView ${this.plugin.manifest.version}`,
			`Device: ${Platform.isMobile ? "mobile" : "desktop"}${Platform.isIosApp ? " (iOS app)" : Platform.isAndroidApp ? " (Android app)" : Platform.isMacOS ? " (macOS)" : Platform.isWin ? " (Windows)" : Platform.isLinux ? " (Linux)" : ""}`,
			`Window ${innerWidth}×${innerHeight} · view ${rect(this.root.parentElement)} · map area ${rect(this.root)} · canvas ${rect(this.mapEl)}`,
			`Map: ${this.options.map} · picture ${img ?? "none"} · recorded size ${JSON.stringify(m?.props["image-size"] ?? null)}`,
			`Phone copy: ${img ? (phoneCopy(this.plugin, img)?.path ?? "none") : "-"}`,
			`Reached: ${this.stage} · Leaflet map ${this.map ? "made" : "not made"}${this.map ? ` · zoom ${this.map.getZoom()}` : ""}`,
			`Error: ${this.lastError ?? "none"}`,
		].join("\n");
	}

	private showReport(title: string) {
		this.root.querySelector(".uv-map-report")?.remove();
		const text = this.report();
		const box = el("div", { cls: "uv-map-report" }, this.root);
		el("div", { cls: "uv-map-report-title", text: title }, box);
		el("pre", { text }, box);
		const row = el("div", { cls: "uv-map-report-actions" }, box);
		const copy = el("button", { cls: "mod-cta", text: "Copy these details" }, row);
		copy.addEventListener("click", () => {
			void navigator.clipboard?.writeText(text).then(() => new Notice("Copied: paste it to whoever's helping."));
		});
		const again = el("button", { text: "Try again" }, row);
		again.addEventListener("click", () => {
			box.remove();
			this.currentBase = "";
			this.map?.invalidateSize();
			void this.refresh();
			window.clearTimeout(this.watchdog);
			this.watchdog = window.setTimeout(() => this.checkAppeared(), 7000);
		});
	}

	destroy() {
		window.clearTimeout(this.watchdog);
		this.endMode();
		this.resizeObs.disconnect();
		cancelAnimationFrame(this.declutterFrame);
		this.map?.remove();
		this.root.remove();
	}

	get imageHeightPx(): number {
		return this.imageHeight;
	}

	get isImageMap(): boolean {
		return this.options.map !== WORLD_MAP;
	}

	get currentMode(): MapMode {
		return this.mode;
	}

	setPlacing(on: boolean) {
		this.root.toggleClass("is-placing", on);
	}

	private get colorBy(): PinColorBy {
		return this.options.colorBy ?? this.plugin.settings.pinColorBy;
	}

	private savedView(): [number, number, number] | undefined {
		return this.embedded ? undefined : this.options.views?.[this.options.map];
	}

	fit(animate = true) {
		if (!this.map) return;
		const pts = this.pins.map((p) => L.latLng(p.latlng));
		this.territoryLayer?.eachLayer((l) => {
			if (l instanceof L.Polygon) pts.push(...(l.getLatLngs()[0] as L.LatLng[]));
		});
		const opts = { animate: animate && motionMs(this.plugin.settings, 1) > 0, duration: motionMs(this.plugin.settings, 450) / 1000 };
		if (pts.length > 1) this.map.flyToBounds(L.latLngBounds(pts).pad(0.15), { ...opts, maxZoom: this.isImageMap ? 1 : 10 });
		else if (pts.length === 1) this.map.setView(pts[0], this.isImageMap ? 0 : 8, opts);
		else if (this.isImageMap) this.map.fitBounds([[0, 0], [this.imageHeight, this.imageWidth]]);
		else this.map.setView(this.plugin.settings.defaultCenter, this.plugin.settings.defaultZoom);
	}

	/** Never rejects: failures are shown inside the map area instead of disappearing silently. */
	async refresh() {
		try {
			await this.render();
		} catch (err) {
			this.showError(err);
		}
	}

	private async render() {
		const token = ++this.token;
		const base = this.options.map;
		this.root.querySelector(".universeview-empty")?.remove();
		if (base !== this.currentBase || !this.map) {
			this.endMode();
			const ok = await this.createBase(base, token);
			if (token !== this.token) return;
			if (!ok) return;
			this.currentBase = base;
			this.hasFitted = false;
			const saved = this.savedView();
			if (saved) {
				this.map!.setView([saved[0], saved[1]], saved[2], { animate: false });
				this.hasFitted = true;
			}
		}
		// The time slider moved into another era of the map: show that era's image.
		if (this.isImageMap && this.map) {
			const want = this.imageFor(this.plugin.index.get(base));
			if (want && want !== this.currentImage) await this.swapImage(want, token);
			if (token !== this.token) return;
		}
		this.draw();
		this.stage = "drawn";
		this.root.querySelector(".uv-map-report")?.remove();
		if (this.options.focus) {
			this.focusOn(this.options.focus);
			this.options.focus = undefined;
		} else if (!this.hasFitted) {
			this.fit(false);
			this.hasFitted = true;
		}
	}

	private draw() {
		// Freshly drawn lands and names take their tier and crowding state at once: the fades are for
		// zooming, and on a redraw (each step of the time slider) every land would visibly morph into
		// its state. On for two frames, past the name sorting that runs on the next one.
		this.root.addClass("uv-settling");
		cancelAnimationFrame(this.settleFrame);
		this.settleFrame = window.requestAnimationFrame(() => {
			this.settleFrame = window.requestAnimationFrame(() => this.root.removeClass("uv-settling"));
		});
		this.drawTerritories();
		this.drawOccupation();
		this.drawRoutes();
		this.drawMovements();
		this.drawWars();
		this.drawPeople();
		this.drawPins();
		this.drawHeat();
		this.drawNotes();
		this.drawLegend();
		this.applyClusters();
		this.scheduleDeclutter();
		// An open border check follows the map as it changes (an edit, the time slider).
		if (this.checkPanel) void this.checkBorders();
	}

	/** Fog of war: whether the person the map is seen by knows about this note (always, when it's seen by no one). */
	private seen(key: string): boolean {
		const pov = this.options.pov;
		return !pov || this.plugin.knownTo(pov, this.options.at).has(key);
	}

	/** Whether a dated shape (a border that changed, a road built later) applies at the time slider's date. */
	private shapeNow(t: Territory): boolean {
		const at = this.options.at;
		if (at === undefined) return true;
		return !(t.from && t.from.start > at) && !(t.to && t.to.end < at);
	}

	/** The map image for the time slider's date: the era image whose dates include it, else the main image. */
	private imageFor(m: Entity | undefined): string | undefined {
		if (!m) return undefined;
		const at = this.options.at;
		if (!m.mapImages?.length || at === undefined) return m.mapImage;
		const fits = m.mapImages.filter((x) => !(x.from && x.from.start > at) && !(x.to && x.to.end < at));
		// The one that started most recently wins where eras overlap.
		fits.sort((a, b) => (b.from?.start ?? -Infinity) - (a.from?.start ?? -Infinity));
		return fits[0]?.image ?? m.mapImage;
	}

	/**
	 * The map note remembers its picture's size (`image-size:`). When the picture is replaced by one of
	 * another size, offer to move every pin and area to match (or to fit a crop by hand).
	 */
	private checkImageSize(m: Entity, size: [number, number]) {
		if (this.embedded || m.mapImages?.length) return;
		const file = this.plugin.app.vault.getAbstractFileByPath(m.path);
		if (!(file instanceof TFile)) return;
		const raw = m.props["image-size"];
		const was = Array.isArray(raw) && raw.length === 2 ? (raw.map(Number) as [number, number]) : undefined;
		if (!was || !was.every((n) => Number.isFinite(n) && n > 0)) {
			// First time: just note it, so a later change can be noticed.
			void this.plugin.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => (fm["image-size"] = size));
			return;
		}
		if (was[0] === size[0] && was[1] === size[1]) return;
		const key = `${m.path}|${size.join("x")}`;
		if (this.askedSize.has(key)) return;
		this.askedSize.add(key);
		const sx = size[0] / was[0];
		const sy = size[1] / was[1];
		const frag = createFragment((f) => {
			f.createDiv({ text: `${m.name}'s picture changed size, from ${was[0]}×${was[1]} to ${size[0]}×${size[1]}. Move every pin and area to match?` });
			const row = f.createDiv({ cls: "uv-notice-actions" });
			const go = row.createEl("button", { text: "Scale them to fit" });
			const crop = row.createEl("button", { text: "It's cropped or shifted…" });
			const keep = row.createEl("button", { text: "Leave them" });
			go.addEventListener("click", (evt) => {
				evt.stopPropagation();
				notice.hide();
				void this.plugin.rescaleMap(m.key, sx, sy, 0, 0, size);
			});
			crop.addEventListener("click", (evt) => {
				evt.stopPropagation();
				notice.hide();
				moveMapSheet(this.plugin, m.key, { sx, sy }, size, "Fit everything to the new picture");
			});
			keep.addEventListener("click", (evt) => {
				evt.stopPropagation();
				notice.hide();
				void this.plugin.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => (fm["image-size"] = size));
			});
		});
		const notice = new Notice(frag, 0);
	}
	private askedSize = new Set<string>();

	/** Swaps the map image for another era's, stretched over the same area so pins stay put. */
	private async swapImage(path: string, token: number) {
		const url = resourceUrl(this.plugin, path);
		const map = this.map;
		if (!url || !map) return;
		// On a phone, an era's picture with a phone copy is shown from the copy without opening it just to
		// measure it (a huge picture can bring the app down).
		const copy = Platform.isMobile ? phoneCopy(this.plugin, path) : undefined;
		const size = copy ? undefined : await loadImageSize(url, Platform.isMobile ? 8000 : 30000);
		if (token !== this.token || (!size && !copy)) return;
		const picture = copy
			? { layer: L.imageOverlay(this.plugin.app.vault.getResourcePath(copy), [[0, 0], [this.imageHeight, this.imageWidth]], { className: "universeview-map-image is-swapping" }), tiled: false, shown: copy.path, note: undefined }
			: await this.pictureLayer(path, url, size!, this.imageWidth, this.imageHeight, "universeview-map-image is-swapping");
		if (token !== this.token) return;
		this.showPictureNote(picture.note);
		const next = picture.layer ?? L.layerGroup();
		next.addTo(map);
		const old = this.imageLayer;
		this.imageLayer = next;
		this.currentImage = path;
		this.shownImage = picture.layer ? picture.shown : undefined;
		this.raster = undefined;
		// Let the new image fade in over the old one, then drop the old one.
		window.requestAnimationFrame(() => (next as L.ImageOverlay).getElement?.()?.removeClass("is-swapping"));
		window.setTimeout(() => {
			if (old && map.hasLayer(old)) map.removeLayer(old);
		}, motionMs(this.plugin.settings, 400) + 50);
		const era = this.plugin.index.get(this.options.map)?.mapImages?.find((x) => x.image === path);
		this.root.querySelector(".universeview-map-era")?.remove();
		if (era?.name) el("div", { cls: "universeview-map-era", text: era.name }, this.root);
	}

	private async createBase(base: string, token: number): Promise<boolean> {
		this.map?.remove();
		this.map = undefined;
		this.legend = undefined;
		this.mapEl.empty();
		const s = this.plugin.settings;
		const zoomAnimation = motionMs(s, 1) > 0;
		if (base === WORLD_MAP) {
			const map = L.map(this.mapEl, { zoomControl: true, worldCopyJump: true, attributionControl: true, scrollWheelZoom: !this.embedded, zoomAnimation, fadeAnimation: zoomAnimation });
			L.tileLayer(s.tileUrl, { attribution: s.tileAttribution, maxZoom: s.tileMaxZoom }).addTo(map);
			map.setView(s.defaultCenter, s.defaultZoom);
			this.setup(map);
			return true;
		}
		const mapEntity = this.plugin.index.get(base);
		const imagePath = this.imageFor(mapEntity);
		const url = resourceUrl(this.plugin, imagePath);
		// The picture isn't on this device (too big for the sync plan, say) but its phone copy is:
		// show the copy over the size the map note records.
		const raw = mapEntity?.props["image-size"];
		const noted = Array.isArray(raw) && raw.length === 2 ? (raw.map(Number) as [number, number]) : undefined;
		const copyOnly = mapEntity && !url && noted?.every((n) => Number.isFinite(n) && n > 0) ? phoneCopyByName(this.plugin, asText(mapEntity.props.image ?? "")) : undefined;
		if (copyOnly && noted) {
			this.stage = "showing the phone copy (the picture itself isn't on this device)";
			[this.imageWidth, this.imageHeight] = noted;
			const bounds: L.LatLngBoundsExpression = [[0, 0], [noted[1], noted[0]]];
			const map = L.map(this.mapEl, { crs: L.CRS.Simple, minZoom: -5, maxZoom: 4, zoomSnap: 0.25, zoomDelta: 0.5, wheelDebounceTime: 90, wheelPxPerZoomLevel: 90, attributionControl: false, scrollWheelZoom: !this.embedded, maxBounds: L.latLngBounds(bounds).pad(0.5), zoomAnimation, fadeAnimation: zoomAnimation });
			this.imageLayer = L.imageOverlay(this.plugin.app.vault.getResourcePath(copyOnly), bounds, { className: "universeview-map-image" }).addTo(map);
			this.currentImage = undefined;
			this.shownImage = copyOnly.path;
			map.fitBounds(bounds);
			this.setup(map);
			this.stage = "map made";
			return true;
		}
		if (!mapEntity || !url) {
			emptyState(
				this.root,
				"map",
				mapEntity ? "This map has no image" : "Map not found",
				"A map note needs `type: map` and `image: [[your-map.png]]`.",
			);
			return false;
		}
		// The picture's size: as the map note records it (no need to open a huge picture just to
		// measure it), else read from the picture, giving up rather than waiting for ever.
		const recorded = this.recordedSize(mapEntity, imagePath);
		this.stage = recorded ? "size from the map note" : "measuring the picture";
		const size = recorded ?? (await loadImageSize(url, Platform.isMobile ? 8000 : 30000));
		// A newer refresh started while the image loaded; let that one build the map.
		if (token !== this.token) return false;
		if (!size) {
			emptyState(this.root, "image-off", "Couldn't load the map image", Platform.isMobile ? `${mapEntity.mapImage ?? ""}: it may be too big for this device. Open the map once on a computer and UniverseView saves a phone-sized copy that syncs here.` : mapEntity.mapImage ?? "");
			return false;
		}
		this.stage = `preparing the picture (${size[0]}×${size[1]})`;
		const picture = await this.pictureLayer(imagePath!, url, size, size[0], size[1]);
		if (token !== this.token) return false;
		this.stage = `making the map (${picture.layer ? (picture.tiled ? "tiled picture" : "picture") : "no picture"})`;
		[this.imageWidth, this.imageHeight] = size;
		if (!recorded) this.checkImageSize(mapEntity, size);
		const bounds: L.LatLngBoundsExpression = [[0, 0], [size[1], size[0]]];
		const map = L.map(this.mapEl, {
			crs: L.CRS.Simple,
			minZoom: -5,
			maxZoom: 4,
			zoomSnap: 0.25,
			zoomDelta: 0.5,
			// A trackpad or a fine wheel sends many small scrolls: gathered into fewer, bigger zoom steps,
			// each of which redraws the map, so zooming is smoother.
			wheelDebounceTime: 90,
			wheelPxPerZoomLevel: 90,
			attributionControl: false,
			scrollWheelZoom: !this.embedded,
			maxBounds: L.latLngBounds(bounds).pad(0.5),
			zoomAnimation,
			fadeAnimation: zoomAnimation,
		});
		this.imageLayer = picture.layer ?? L.layerGroup();
		this.imageLayer.addTo(map);
		this.currentImage = imagePath;
		this.shownImage = picture.layer ? picture.shown : undefined;
		this.root.toggleClass("is-tiled", picture.tiled);
		this.showPictureNote(picture.note);
		map.fitBounds(bounds);
		this.setup(map);
		this.stage = "map made";
		return true;
	}

	/** The size the map note records for its main picture (`image-size:`), when it's that picture being shown. */
	private recordedSize(m: Entity, imagePath: string | undefined): [number, number] | undefined {
		if (!imagePath || imagePath !== m.mapImage) return undefined;
		const raw = m.props["image-size"];
		const s = Array.isArray(raw) && raw.length === 2 ? (raw.map(Number) as [number, number]) : undefined;
		return s && s.every((n) => Number.isFinite(n) && n > 0) ? s : undefined;
	}

	/**
	 * The layer that shows a picture over `w` × `h` of map: tiles for a huge one on a computer (which
	 * also saves its phone copy), its phone copy on a phone or tablet, or the picture as it is.
	 * `note` says why a phone shows no picture.
	 */
	private async pictureLayer(path: string, url: string, size: [number, number], w: number, h: number, cls = "universeview-map-image"): Promise<{ layer?: L.Layer; tiled: boolean; note?: string; shown?: string }> {
		const bounds: L.LatLngBoundsExpression = [[0, 0], [h, w]];
		if (Platform.isMobile && tooBigForPhone(size)) {
			const copy = phoneCopy(this.plugin, path);
			if (copy) return { layer: L.imageOverlay(this.plugin.app.vault.getResourcePath(copy), bounds, { className: cls }), tiled: false, shown: copy.path };
			return { tiled: false, note: `This map's picture (${size[0]} × ${size[1]} px) is too big to open on a phone or tablet. Open this map once on your computer: UniverseView saves a phone-sized copy in “UniverseView/Map copies”, which syncs here like any file. Borders, pins and names work meanwhile.` };
		}
		// Very large images are cut into tiles drawn on demand, so panning and zooming stay smooth.
		// Loaded before the map is made, so a newer refresh never finds this one's map half-built.
		const tiled = Math.max(size[0], size[1]) > TILE_ABOVE ? await TiledImageLayer.load(this.plugin, path, url, size, w, h) : null;
		return { layer: tiled ?? L.imageOverlay(url, bounds, { className: cls }), tiled: !!tiled, shown: path };
	}

	/** A line over the map saying why there's no picture (on a phone, before its copy exists). */
	private showPictureNote(note: string | undefined) {
		this.root.querySelector(".uv-picture-note")?.remove();
		if (!note) return;
		const box = el("div", { cls: "uv-picture-note" }, this.root);
		icon(el("span", {}, box), "image-off");
		el("span", { text: note }, box);
		const x = el("button", { cls: "clickable-icon", attr: { "aria-label": "Dismiss" } }, box);
		icon(x, "x");
		x.addEventListener("click", () => box.remove());
	}

	private setup(map: L.Map) {
		this.map = map;
		// Dragging the map sideways on a phone mustn't also swipe Obsidian back or forward a page. Only the
		// touch's start is kept from Obsidian: Leaflet follows the finger with touchmove on the document,
		// so stopping touchmove here would stop the map from panning, zooming or long-pressing at all.
		if (!this.embedded) this.mapEl.addEventListener("touchstart", (evt) => evt.stopPropagation(), { passive: true });
		// Panes of their own, stacked in styles-map.css: the heat map above the areas (Leaflet's overlay pane
		// is 400), then realm borders, realm names and territory names, all under the pins.
		for (const pane of ["universeview-territory-labels", "universeview-heat", "uv-realm-edges", "uv-realm-names"]) map.createPane(pane);
		this.heatLayer = L.layerGroup().addTo(map);
		this.territoryLayer = L.layerGroup().addTo(map);
		this.strategyLayer = L.layerGroup().addTo(map);
		this.routeLayer = L.layerGroup().addTo(map);
		this.moveLayer = L.layerGroup().addTo(map);
		this.warLayer = L.layerGroup().addTo(map);
		this.peopleLayer = L.layerGroup().addTo(map);
		this.layers = L.layerGroup().addTo(map);
		this.clusterLayer = L.layerGroup().addTo(map);
		this.noteLayer = L.layerGroup().addTo(map);
		this.toolLayer = L.layerGroup().addTo(map);
		const zoomClass = () => {
			const z = map.getZoom();
			const low = this.isImageMap ? z < -1.5 : z < 5;
			this.root.toggleClass("is-zoomed-out", low);
			this.applyLayers();
			this.applyClusters();
			this.applyTiers();
			this.sizeTerritoryLabels();
			this.scheduleDeclutter();
		};
		map.on("zoomend", zoomClass);
		map.on("moveend", () => {
			// Names only need sorting out again after a pan when ones that were off screen came into view
			// (zooming sorts them out on its own); once the map settles is enough.
			this.scheduleDeclutter();
			this.drawCrumbs();
			if (!this.syncing) this.onMoved?.(map.getCenter(), map.getZoom());
			if (this.embedded) return;
			const c = map.getCenter();
			this.options.views = { ...(this.options.views ?? {}), [this.options.map]: [round(c.lat, 5), round(c.lng, 5), map.getZoom()] };
			this.onOptionsChange?.();
		});
		zoomClass();
		if (this.embedded) {
			// Like other embeds, require a modifier for wheel zoom so the note still scrolls.
			this.mapEl.addEventListener(
				"wheel",
				(evt) => {
					if (!(evt.ctrlKey || evt.metaKey)) return;
					evt.preventDefault();
					map.setZoom(map.getZoom() + (evt.deltaY < 0 ? 0.5 : -0.5));
				},
				{ passive: false },
			);
		}
		map.on("click", (evt: L.LeafletMouseEvent) => {
			if (this.mode !== "none") return;
			if (!this.root.hasClass("is-placing") || !this.onPlaceClick) return;
			this.onPlaceClick(this.fromLatLng(evt.latlng));
		});
		map.on("contextmenu", (evt: L.LeafletMouseEvent) => {
			if (this.mode !== "none") return;
			this.mapMenu(evt);
		});
	}

	// ---- Coordinates ------------------------------------------------------------------------------

	/** World maps store [lat, lng]; image maps store [x, y] in image pixels from the top-left. */
	private toLatLng(e: Entity): L.LatLngExpression | null {
		if (this.isImageMap) {
			if (!e.position || e.map?.key !== this.options.map) return null;
			const y = e.positionFromBottom ? e.position[1] : this.imageHeight - e.position[1];
			return [y, e.position[0]];
		}
		if (!e.coords || e.map) return null;
		return e.coords;
	}

	private fromLatLng(ll: L.LatLng): [number, number] {
		if (this.isImageMap) return [Math.round(ll.lng), Math.round(this.imageHeight - ll.lat)];
		const w = ll.wrap();
		return [round(w.lat, 5), round(w.lng, 5)];
	}

	private pointToLatLng([a, b]: [number, number]): L.LatLng {
		return this.isImageMap ? L.latLng(this.imageHeight - b, a) : L.latLng(a, b);
	}

	// ---- Pins -------------------------------------------------------------------------------------

	/** The place the map is narrowed to and everything inside it, or undefined when it shows everywhere. */
	private withinSet(): Set<string> | undefined {
		const key = this.options.within;
		return key ? new Set([key, ...placesInside(this.plugin.index.subPlacesOf, key)]) : undefined;
	}

	/** Events per place, counting events in sub-places towards every region above them. */
	private eventsByPlace(): Map<string, Entity[]> {
		const idx = this.plugin.index;
		const at = this.options.at;
		const within = this.withinSet();
		const out = new Map<string, Set<Entity>>();
		for (const e of idx.all("event")) {
			if (within && !e.places.some((p) => within.has(p.key))) continue;
			if (at !== undefined && (!e.start || e.start.start > at)) continue;
			if (!this.seen(e.key)) continue;
			for (const p of e.places) {
				let key: string | undefined = p.key;
				for (let depth = 0; key && depth < 12; depth++) {
					let set = out.get(key);
					if (!set) out.set(key, (set = new Set()));
					if (set.has(e)) break;
					set.add(e);
					key = idx.get(key)?.locatedIn?.key;
				}
			}
		}
		const sorted = new Map<string, Entity[]>();
		for (const [k, set] of out) sorted.set(k, [...set].sort((a, b) => (a.start?.start ?? 0) - (b.start?.start ?? 0)));
		return sorted;
	}

	private categories = parseMapCategories("");

	/** Legend group, color and icon of a place under the current "color by" choice. */
	private groupOf(place: Entity): Group {
		const idx = this.plugin.index;
		const styleKey = styleKeyOf(place.category, place.tags);
		const cat = styleKey ? this.categories.get(styleKey) : undefined;
		switch (this.colorBy) {
			case "category": {
				const id = place.category ?? "other";
				return { id, label: place.category ? cap(place.category) : "Other", color: cat?.color ?? (place.category ? hashColor(id) : typeColorVar("place")), icon: cat?.icon, count: 0 };
			}
			case "region":
			case "realm":
			case "liege": {
				const tree = this.plugin.realms(this.options.at);
				const chain = tree.nodes.has(place.key) ? chainOf(tree, place.key) : [place.key];
				let k: string | undefined;
				if (this.colorBy === "liege") k = chain.length > 1 ? chain[chain.length - 2] : undefined;
				// The realm: the highest title someone actually holds (a continent tagged Realm doesn't count).
				else k = chain.find((c) => tree.nodes.get(c)?.holder) ?? (chain.length > 1 ? chain[0] : undefined);
				// A title on its own with places under it is its own realm.
				if (!k && tree.nodes.get(place.key)?.children.length) k = place.key;
				const e = idx.get(k);
				if (!e) return { id: "none", label: this.colorBy === "liege" ? "Under no one" : "Independent", color: place.color ?? typeColorVar("place"), count: 0 };
				const n = tree.nodes.get(e.key);
				const detail = [n?.holder?.name, n?.house?.name].filter(Boolean).join(" · ");
				return { id: e.key, label: e.name, detail, color: entityColor(this.plugin, e), icon: e.icon, count: 0, target: e.key };
			}
			case "house": {
				const n = this.plugin.realms(this.options.at).nodes.get(place.key);
				if (!n?.house) return { id: "none", label: "No house", color: place.color ?? typeColorVar("place"), count: 0 };
				const h = n.house.resolved ? idx.get(n.house.key) : undefined;
				return { id: n.house.key, label: n.house.name, color: h ? entityColor(this.plugin, h) : hashColor(n.house.key), icon: h?.icon, count: 0 };
			}
			case "type":
				return { id: "all", label: "Places", color: typeColorVar("place"), count: 0 };
			default: {
				const at = this.options.at;
				const c = place.cultures.find((x) => at === undefined || activeAt(x, at)) ?? place.cultures[0];
				if (!c) return { id: "none", label: "Unaffiliated", color: place.color ?? typeColorVar("place"), count: 0 };
				return { id: c.ref.key, label: c.ref.name, color: cultureColor(this.plugin, c.ref.key), count: 0 };
			}
		}
	}

	private drawPins() {
		if (!this.map || !this.layers) return;
		this.layers.clearLayers();
		this.pins = [];
		this.categories = placeCategories(this.plugin.settings.mapCategories);
		this.root.toggleClass("hide-pins", this.options.showPins === false);
		const idx = this.plugin.index;
		const at = this.options.at;
		const hidden = new Set(this.options.hidden ?? []);
		const byPlace = this.eventsByPlace();
		// Places, and groups given a pin of their own (a realm placed at its heart).
		const within = this.withinSet();
		const places = idx.all().filter((p) => (p.type === "place" || (p.type === "culture" && (p.map || p.coords))) && (!this.options.folder || p.path.startsWith(this.options.folder + "/")) && (!within || (p.type === "place" ? within.has(p.key) : p.places.some((r) => within.has(r.key)))));
		let i = 0;
		for (const place of places) {
			const ll = this.toLatLng(place);
			if (!ll) continue;
			if (at !== undefined && !idx.existsAt(place, at)) continue;
			if (!this.seen(place.key)) continue;
			// A place drawn as an area shows its icon in the area's label, not as a second pin on top
			// (except while moving pins, when the pin is the handle).
			if (!this.options.editable && this.options.showTerritories && this.areasHere(place).some(({ t }) => this.shapeNow(t))) continue;
			const events = byPlace.get(place.key) ?? [];
			if (this.options.onlyWithEvents && !events.length) continue;
			const group = this.groupOf(place);
			if (hidden.has(group.id)) continue;
			const scale = this.scaleOf(place);
			const marker = this.makeMarker(place, ll, events, group, i++, scale.size);
			this.pins.push({ place, latlng: ll, events, marker, group: group.id, layer: scale.layer, explicitLayer: scale.explicitLayer });
		}
		this.applyLayers();
		this.root.toggleClass("has-few-pins", this.pins.length <= 20);
		this.root.toggleClass("hide-labels", !this.options.showLabels);
		this.root.querySelector(".universeview-map-hint")?.remove();
		if (!this.pins.length && !this.embedded && !hidden.size) {
			const hint = el("div", { cls: "universeview-map-hint" }, this.root);
			hint.setText(
				this.isImageMap
					? "No places on this map yet. Right-click the map to add one, or use “Place a note” in the toolbar."
					: "No places with coordinates yet. Right-click the map to add one, or add `coordinates: [lat, lng]` to a place note.",
			);
			window.setTimeout(() => hint.remove(), 8000);
		}
		this.drawTrace();
	}

	/** Pin size and map layer: the note's own, else its kind's (settings), else a built-in guess for the kind. */
	private scaleOf(place: Entity): { size?: PinSize; layer: number; explicitLayer: boolean } {
		const styleKey = styleKeyOf(place.category, place.tags);
		const cat = styleKey ? this.categories.get(styleKey) : undefined;
		const builtin = styleKey ? CATEGORY_SCALE[styleKey] : undefined;
		// Its tier as a title (from tags like #Province or #Region_Small): counties show a little in,
		// towns and forts further in, the way territories split as you zoom.
		const rank = this.plugin.realms(this.options.at).nodes.get(place.key)?.rank ?? 9;
		const byRank = rank >= 9 ? undefined : rank < 3.5 ? 1 : rank < 5 ? 2 : rank < 5.5 ? 3 : 4;
		const explicit = place.layer ?? cat?.layer ?? byRank;
		return { size: place.pinSize ?? cat?.size ?? builtin?.size, layer: explicit ?? builtin?.layer ?? 1, explicitLayer: explicit !== undefined };
	}

	/** Zoom level from which a layer's places show. */
	private layerZoom(layer: number): number {
		if (layer <= 1 || !this.map) return -Infinity;
		if (this.isImageMap) {
			const fitZoom = this.map.getBoundsZoom(L.latLngBounds([[0, 0], [this.imageHeight, this.imageWidth]]));
			return fitZoom + (layer - 1) * 0.75;
		}
		return [0, 0, 5, 7, 9, 11][Math.min(5, layer)];
	}

	/**
	 * Hides places whose layer needs more zoom. Layers set in a note or in the settings always apply;
	 * the built-in guesses only kick in on crowded maps, so a map with a handful of pins shows them all.
	 */
	private applyLayers() {
		const map = this.map;
		if (!map) return;
		const z = map.getZoom();
		const on = this.options.useLayers !== false;
		const crowded = this.pins.length > 25;
		const at = new Map<number, number>();
		for (const p of this.pins) {
			let hide = false;
			if (on && p.layer > 1 && (p.explicitLayer || crowded)) {
				if (!at.has(p.layer)) at.set(p.layer, this.layerZoom(p.layer));
				hide = z < at.get(p.layer)! - 1e-6;
			}
			p.marker.getElement()?.toggleClass("is-layer-hidden", hide);
		}
	}

	private makeMarker(place: Entity, ll: L.LatLngExpression, events: Entity[], group: Group, i: number, pinSize?: PinSize): L.Marker {
		const size = events.length >= 8 ? "lg" : events.length >= 3 ? "md" : "sm";
		const color = this.colorBy === "culture" || this.colorBy === "type" ? place.color ?? group.color : group.color;
		const html = el("div", { cls: `universeview-pin size-${size}` + (pinSize ? ` pin-size-${pinSize}` : "") + (place.importance >= 4 ? " is-important" : "") });
		html.dataset.key = place.key;
		html.style.setProperty("--pin-color", color);
		if (pinSize) {
			const hasGlyph = !!(place.logo || place.icon || this.categories.get(styleKeyOf(place.category, place.tags) ?? "")?.icon);
			html.style.setProperty("--dot", `${hasGlyph ? Math.max(22, DOT_PX[pinSize] + 6) : DOT_PX[pinSize]}px`);
		}
		html.style.setProperty("--i", String(i % 24));
		// Something is going on here at the time slider's date: the pin pulses.
		const at = this.options.at;
		if (at !== undefined && events.some((ev) => ev.start && ev.start.start <= at && (ev.end?.end ?? ev.start.end) + 45 >= at)) html.addClass("is-happening");
		const dot = el("span", { cls: "universeview-pin-dot" }, html);
		// A sigil or crest wins; then a photo (when asked for); then the note's own icon; then its category's icon.
		const firstCulture = place.cultures[0] ? this.plugin.index.get(place.cultures[0].ref.key) : undefined;
		const photo = this.options.photoPins ? resourceUrl(this.plugin, place.image) : undefined;
		const logo = resourceUrl(this.plugin, place.logo ?? (this.colorBy === "culture" ? firstCulture?.logo : undefined)) ?? photo;
		const iconName = place.icon ?? this.categories.get(styleKeyOf(place.category, place.tags) ?? "")?.icon;
		if (photo && !place.logo) {
			html.addClass("is-photo");
			html.setCssProps({ "--dot": "38px" });
		}
		if (logo) {
			dot.addClass("has-logo");
			html.addClass("has-glyph");
			el("img", { attr: { src: logo, alt: "", draggable: "false" } }, dot);
		} else if (iconName) {
			const g = el("span", { cls: "universeview-pin-glyph" }, dot);
			if (glyph(g, iconName)) {
				dot.addClass("has-icon");
				html.addClass("has-glyph");
			}
			else g.remove();
		}
		if (events.length) el("span", { cls: "universeview-pin-count", text: String(events.length) }, html);
		el("span", { cls: "universeview-pin-label", text: nameAt(place, this.options.at) }, html);
		const divIcon = L.divIcon({ html, className: "universeview-pin-wrap", iconSize: [0, 0] });
		const marker = L.marker(ll, { icon: divIcon, draggable: this.options.editable, title: "", riseOnHover: true, keyboard: true }).addTo(this.layers!);
		marker.bindPopup(() => this.popup(place, events), { className: "universeview-popup", maxWidth: 320, minWidth: 220, autoPanPadding: [40, 40] });
		marker.on("contextmenu", (evt: L.LeafletMouseEvent) => {
			L.DomEvent.stop(evt);
			showEntityMenu(this.plugin, place.key, evt.originalEvent, {
				extra: (menu) => {
					menu.addItem((it) => it.setTitle("Plan a journey from here…").setIcon("route").onClick(() => this.journeyFrom(place.key)));
					menu.addItem((it) => it.setTitle("How far can you get from here?").setIcon("radar").onClick(() => this.startRings(L.latLng(ll), place.name)));
					menu.addItem((it) => it.setTitle("Paint a territory for this place").setIcon("paintbrush").onClick(() => this.startPaint(place.key)));
					if (this.isImageMap) menu.addItem((it) => it.setTitle("Fill a territory for this place").setIcon("paint-bucket").onClick(() => void this.startFill(place.key)));
				},
				// Off the map in one click; the note stays and Undo puts the pin back.
				danger: (menu) => warningItem(menu, "Remove the pin from this map", "map-pin-off", () => void this.plugin.removePin(place.key)),
			});
		});
		marker.on("dragend", () => {
			const pos = this.fromLatLng(marker.getLatLng());
			void this.plugin.setPlacePosition(place.key, this.isImageMap ? this.options.map : WORLD_MAP, pos, this.imageHeight);
		});
		const elx = marker.getElement();
		if (elx) bindHover(this.plugin, elx, place.key, this.root);
		return marker;
	}

	private popup(place: Entity, events: Entity[]): HTMLElement {
		this.plugin.hoverCards?.hide(true);
		const cal = this.plugin.calendars.get(place.calendar);
		const box = el("div", { cls: "universeview-popup-body universeview-scope" });
		const img = resourceUrl(this.plugin, place.image);
		if (img) el("img", { cls: "universeview-popup-image", attr: { src: img, alt: "" } }, box);
		const title = el("a", { cls: "universeview-popup-title internal-link", text: place.name }, box);
		title.addEventListener("click", (evt) => openEntity(this.plugin, place.key, evt));
		const meta: string[] = [];
		if (place.category) meta.push(cap(place.category));
		const span = formatSpan(place.start, place.end, cal);
		if (span) meta.push(span);
		if (meta.length) el("div", { cls: "universeview-popup-meta", text: meta.join(" · ") }, box);
		// Who it's under and who holds it; otherwise its groups, as before.
		if (!ownershipLines(this.plugin, box, place.key, this.options.at, "universeview-popup-meta universeview-owner")) {
			const cultures = place.cultures.filter((c) => this.options.at === undefined || activeAt(c, this.options.at)).map((c) => c.ref.name);
			if (cultures.length) el("div", { cls: "universeview-popup-meta", text: cultures.join(", ") }, box);
		}
		const pop = totalPopulation(this.plugin.index, place.key);
		if (pop) el("div", { cls: "universeview-popup-meta", text: `Population ${pop.total.toLocaleString()}${pop.counted > 1 ? ` (${pop.counted} places)` : ""}` }, box);
		if (place.summary) el("div", { cls: "universeview-popup-summary", text: place.summary }, box);
		if (events.length) {
			el("div", { cls: "universeview-popup-heading", text: `Events (${events.length})` }, box);
			const list = el("ul", { cls: "universeview-popup-events" }, box);
			for (const e of events.slice(0, 12)) {
				const li = el("li", {}, list);
				el("span", { cls: "universeview-popup-date", text: formatDate(e.start, this.plugin.calendars.get(e.calendar)) }, li);
				const a = el("a", { cls: "internal-link", text: e.name }, li);
				a.addEventListener("click", (evt) => openEntity(this.plugin, e.key, evt));
			}
			if (events.length > 12) el("li", { cls: "universeview-popup-more", text: `+ ${events.length - 12} more` }, list);
		}
		const actions = el("div", { cls: "universeview-popup-actions" }, box);
		const tl = el("button", { text: "Timeline" }, actions);
		tl.addEventListener("click", () => void this.plugin.openTimeline({ filter: { places: [place.name] } }));
		const add = el("button", { text: "Add event here" }, actions);
		add.addEventListener("click", () => this.plugin.createEntityPrompt({ type: "event", places: [place.name] }));
		// Off the map in one click (the note stays; Undo puts the pin back).
		const del = el("button", { cls: "uv-popup-delete", attr: { "aria-label": `Remove ${place.name}'s pin from the map` } }, actions);
		icon(del, "trash-2");
		del.addEventListener("click", () => {
			this.map?.closePopup();
			void this.plugin.removePin(place.key);
		});
		return box;
	}

	/** Hides labels that would collide with a more important one. */
	private settleFrame = 0;

	private scheduleDeclutter() {
		cancelAnimationFrame(this.declutterFrame);
		this.declutterFrame = window.requestAnimationFrame(() => this.declutter());
	}

	/**
	 * Keeps names from overlapping: territory names and place names in one pass, the more important
	 * first (big realms, then by a place's tier, importance and events), the rest hidden until zooming
	 * in makes room for them.
	 */
	private declutter() {
		const tree = this.plugin.realms(this.options.at);
		const items: { label: HTMLElement; weight: number; name: string }[] = [];
		for (const p of this.pins) {
			const label = p.marker.getElement()?.querySelector(".universeview-pin-label") as HTMLElement | null;
			if (!label) continue;
			const rank = tree.nodes.get(p.place.key)?.rank ?? 7;
			const pinSize = /pin-size-(\w+)/.exec(p.marker.getElement()?.querySelector(".universeview-pin")?.className ?? "")?.[1] ?? "";
			const size = ({ tiny: 0, small: 2, medium: 4, large: 7, huge: 10 } as Record<string, number>)[pinSize] ?? 3;
			items.push({ label, weight: (10 - rank) * 15 + p.place.importance * 8 + size + Math.min(10, p.events.length), name: p.place.name });
		}
		// Territory names count by how big their land is on screen: a realm's name beats a town's.
		for (const label of Array.from(this.root.querySelectorAll<HTMLElement>(".universeview-territory-label"))) {
			if (label.hasClass("is-tier-hidden") || label.hasClass("is-tiny")) continue;
			const across = Number(label.dataset.across ?? 0);
			items.push({ label, weight: 60 + Math.log2(Math.max(2, across)) * 12, name: label.textContent ?? "" });
		}
		for (const { label } of items) label.removeClass("is-crowded");
		if (!this.plugin.settings.declutterLabels || !this.options.showLabels) return;
		items.sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name));
		// Every name measured first, then the crowded ones hidden in one go: hiding a name while still
		// measuring made the browser lay the page out again for each name (slow with many on screen).
		// Names off screen can't collide with anything in view, so they're left out.
		const view = this.mapEl.getBoundingClientRect();
		const boxes: { label: HTMLElement; r: DOMRect }[] = [];
		for (const { label } of items) {
			if (label.offsetParent === null) continue;
			const r = label.getBoundingClientRect();
			if (!r.width || r.right < view.left || r.left > view.right || r.bottom < view.top || r.top > view.bottom) continue;
			if (getComputedStyle(label).opacity === "0") continue;
			boxes.push({ label, r });
		}
		const taken: DOMRect[] = [];
		const crowded: HTMLElement[] = [];
		for (const { label, r } of boxes) {
			// A little room around each name.
			if (taken.some((t) => r.left < t.right + 4 && t.left < r.right + 4 && r.top < t.bottom + 2 && t.top < r.bottom + 2)) crowded.push(label);
			else taken.push(r);
		}
		for (const label of crowded) label.addClass("is-crowded");
	}

	// ---- Legend -----------------------------------------------------------------------------------

	private drawLegend() {
		if (!this.map) return;
		this.legend?.remove();
		this.legend = undefined;
		if (this.colorBy === "type") return;
		const groups = new Map<string, Group>();
		const idx = this.plugin.index;
		for (const place of idx.all("place")) {
			if (!this.toLatLng(place)) continue;
			if (this.options.folder && !place.path.startsWith(this.options.folder + "/")) continue;
			const g = this.groupOf(place);
			const cur = groups.get(g.id) ?? g;
			cur.count++;
			groups.set(g.id, cur);
		}
		if (groups.size < 2 && !(this.options.hidden ?? []).length) return;
		const hidden = new Set(this.options.hidden ?? []);
		const legend = new L.Control({ position: "bottomleft" });
		legend.onAdd = () => {
			const box = el("div", { cls: "universeview-legend universeview-scope" + (this.legendCollapsed ? " is-collapsed" : "") });
			L.DomEvent.disableClickPropagation(box);
			L.DomEvent.disableScrollPropagation(box);
			const head = el("div", { cls: "universeview-legend-head" }, box);
			const titles: Record<PinColorBy, string> = { realm: "Realms", region: "Realms", liege: "Held under", house: `Held by ${GROUP_KINDS.house.label.toLowerCase()}`, culture: "Groups", category: "Kinds of place", type: "" };
			el("span", { text: titles[this.colorBy] }, head);
			const legendHelp: Record<PinColorBy, string> = {
				realm: "Pins and areas coloured by the realm they belong to: the highest title above them that someone holds. Each row says who holds it; click a row to hide or show it (Alt-click shows only it), or the target to zoom there.",
				region: "Pins and areas coloured by the realm they belong to.",
				liege: "Pins coloured by the title directly above each place, with who holds it.",
				house: "Pins coloured by the house holding each place: its holder's house, or the one the note names.",
				culture: "Pins coloured by the first group each place lists.",
				category: "Pins coloured by kind of place (city, fort, temple…), from `kind:` or a tag like #City.",
				type: "",
			};
			if (legendHelp[this.colorBy]) helpTip(head, legendHelp[this.colorBy]);
			const chev = el("span", { cls: "universeview-legend-chev" }, head);
			icon(chev, "chevron-down");
			head.addEventListener("click", () => {
				this.legendCollapsed = !this.legendCollapsed;
				box.toggleClass("is-collapsed", this.legendCollapsed);
			});
			const list = el("div", { cls: "universeview-legend-list" }, box);
			for (const g of [...groups.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))) {
				const row = el("button", { cls: "universeview-legend-row" + (hidden.has(g.id) ? " is-off" : "") }, list);
				const sw = el("span", { cls: "universeview-legend-swatch" }, row);
				sw.style.setProperty("--pin-color", g.color);
				if (g.icon) glyph(sw, g.icon);
				const text = el("span", { cls: "universeview-legend-label" }, row);
				el("span", { text: g.label }, text);
				if (g.detail) el("span", { cls: "universeview-legend-detail", text: g.detail }, text);
				el("span", { cls: "universeview-legend-count", text: String(g.count) }, row);
				if (g.target) {
					const key = g.target;
					bindHover(this.plugin, text, key, this.root);
					const go = el("span", { cls: "universeview-legend-go clickable-icon", attr: { "aria-label": `Show ${g.label}` } }, row);
					icon(go, "locate-fixed");
					go.addEventListener("click", (evt) => {
						evt.stopPropagation();
						if (this.tierBounds.has(key)) this.drillTo(key);
						else this.focusOn(key);
					});
				}
				row.addEventListener("click", (evt) => {
					const set = new Set(this.options.hidden ?? []);
					// Alt-click shows only this group.
					if (evt.altKey) {
						set.clear();
						for (const other of groups.keys()) if (other !== g.id) set.add(other);
					} else if (set.has(g.id)) set.delete(g.id);
					else set.add(g.id);
					this.options.hidden = [...set];
					this.onOptionsChange?.();
					this.draw();
				});
			}
			return box;
		};
		legend.addTo(this.map);
		this.legend = legend;
	}

	private legendCollapsed = false;

	// ---- Territories ------------------------------------------------------------------------------

	/** This map's areas of a note, numbered the way saveTerritory counts them. */
	private areasHere(e: Entity, what: "territory" | "route" = "territory"): { t: Territory; n: number }[] {
		const key = this.isImageMap ? this.options.map : "world";
		const out: { t: Territory; n: number }[] = [];
		let n = 0;
		for (const t of what === "territory" ? e.territories : e.routes) {
			if (t.map !== key && t.map !== "*") continue;
			const index = n++;
			if (t.map === "*") {
				// Areas that don't name a map: on the world map only if they look like lat/lng;
				// on an image map only for notes that aren't pinned to a different map.
				const latLngLike = t.points.every(([a, b]) => Math.abs(a) <= 90 && Math.abs(b) <= 180);
				if (this.isImageMap ? e.map && e.map.key !== this.options.map : !latLngLike || e.map) continue;
			}
			out.push({ t, n: index });
		}
		return out;
	}

	/**
	 * Occupied lands at the time slider's date: the owner's colour stays, with the occupier's stripes
	 * over it, and ground drawn as occupied (`occupied-areas:`) the same way. Only at a date: over
	 * all of history, every occupation at once would say nothing.
	 */
	private drawOccupation() {
		const layer = this.territoryLayer;
		const at = this.options.at;
		this.mapEl.querySelectorAll("#uv-terr-defs pattern[id^='uv-occ-']").forEach((p) => p.remove());
		if (!this.map || !layer || at === undefined || !this.options.showTerritories) return;
		const idx = this.plugin.index;
		const patterns = new Map<string, string>();
		const stripe = (poly: L.Polygon, by: Entity) => {
			const path = poly.getElement() as SVGElement | undefined;
			const svgEl = path?.ownerSVGElement;
			if (!path || !svgEl) return;
			ensureTerritoryDefs(svgEl);
			let id = patterns.get(by.key);
			if (!id) {
				id = `uv-occ-${++this.terrSeq}`;
				patterns.set(by.key, id);
				const pattern = createSvg("pattern");
				for (const [k, v] of Object.entries({ id, patternUnits: "userSpaceOnUse", width: "14", height: "14", patternTransform: "rotate(45)" })) pattern.setAttribute(k, v);
				const line = createSvg("line");
				for (const [k, v] of Object.entries({ x1: "0", y1: "0", x2: "0", y2: "14" })) line.setAttribute(k, v);
				line.setCssStyles({ stroke: entityColor(this.plugin, by), strokeWidth: "7", strokeOpacity: "0.6" });
				pattern.appendChild(line);
				svgEl.querySelector("#uv-terr-defs")?.appendChild(pattern);
			}
			path.setCssStyles({ fill: `url(#${id})` });
			path.style.setProperty("--terr-color", entityColor(this.plugin, by));
		};
		for (const o of occupationsAt(idx, at)) {
			const by = idx.get(o.by.key);
			if (!by) continue;
			for (const a of this.areaPolys) {
				if (a.owner !== o.land.key && !a.chain.includes(o.land.key)) continue;
				stripe(L.polygon(a.points.map((p) => this.pointToLatLng(p)), { className: "uv-occupied", interactive: false, fillOpacity: 1, smoothFactor: 1.5 }).addTo(layer), by);
			}
		}
		const here = this.isImageMap ? this.options.map : "world";
		for (const e of idx.all()) {
			(e.fronts ?? []).forEach((t, i) => {
				if (t.map !== here && t.map !== "*") return;
				if ((t.from && t.from.start > at) || (t.to && t.to.end < at)) return;
				const poly = L.polygon(t.points.map((p) => this.pointToLatLng(p)), { className: "uv-occupied is-front", fillOpacity: 1, smoothFactor: 1.5 }).addTo(layer);
				stripe(poly, e);
				poly.bindTooltip(`Held by ${e.name}${t.fromText ? ` (${t.fromText}${t.toText ? ` – ${t.toText}` : ""})` : ""}`);
				poly.on("contextmenu", (evt: L.LeafletMouseEvent) => {
					L.DomEvent.stop(evt);
					const menu = new Menu();
					menu.addItem((it) => it.setTitle("Delete this occupied area").setIcon("trash-2").onClick(() => void this.plugin.deleteFront(e.key, i)));
					menu.showAtMouseEvent(evt.originalEvent);
				});
			});
		}
	}

	private drawTerritories() {
		const layer = this.territoryLayer;
		if (!this.map || !layer) return;
		layer.clearLayers();
		this.drawnAreas = [];
		if (!this.options.showTerritories) return;
		this.categories = placeCategories(this.plugin.settings.mapCategories);
		const idx = this.plugin.index;
		const at = this.options.at;
		const tree = this.tiersOn ? this.plugin.realms(at) : undefined;
		this.realmTree = tree;
		this.areaPolys = [];
		this.drawVersion++;
		this.coverCache.clear();
		this.shadeValues.clear();
		this.shadeRange = undefined;
		this.root.querySelector(".uv-shade-legend")?.remove();
		// The last drawing's clip shapes go with it, or they pile up with every redraw.
		this.mapEl.querySelectorAll("#uv-terr-defs clipPath").forEach((c) => c.remove());
		this.tierBounds.clear();
		this.ownLand.clear();
		for (const m of this.tierLabels.values()) m.marker.remove();
		this.tierLabels.clear();
		// Geography underneath, then realms from the greatest down, so smaller lands sit on top.
		const anyTree = tree ?? this.plugin.realms(at);
		const order = (x: Entity) => {
			const nd = anyTree.nodes.get(x.key);
			return (nd?.nature === "region" ? 0 : 10) + (nd && nd.rank < 9 ? nd.rank : 8);
		};
		const lands = idx.all().filter((x) => x.territories.length).sort((a, b) => order(a) - order(b));
		// Roughen borders: long straight edges get a hand-drawn wobble, shown only (edges under minLen stay as stored).
		const rough = ROUGHNESS[this.plugin.settings.roughBorders ?? "off"] ?? 0;
		const roughLen = (this.isImageMap && this.imageWidth ? Math.max(this.imageWidth, this.imageHeight) : 360) * 0.006;
		const plain = this.mode !== "none";
		// Every corner of every land about to be drawn: the wobble holds still near them, so borders two lands share agree.
		let near: ReturnType<typeof cornerDistance> | undefined;
		if (rough > 0 && !plain) {
			const rings: P2[][] = [];
			for (const e of lands) {
				if (this.options.folder && !e.path.startsWith(this.options.folder + "/")) continue;
				if (at !== undefined && !idx.existsAt(e, at)) continue;
				if (!this.seen(e.key)) continue;
				for (const { t } of this.areasHere(e)) if (this.shapeNow(t)) rings.push(t.points);
			}
			near = cornerDistance(rings, holdRadius(roughLen));
		}
		for (const e of lands) {
			if (this.options.folder && !e.path.startsWith(this.options.folder + "/")) continue;
			if (at !== undefined && !idx.existsAt(e, at)) continue;
			if (!this.seen(e.key)) continue;
			const color = entityColor(this.plugin, e);
			const chain = tree?.nodes.has(e.key) ? chainOf(tree, e.key) : [e.key];
			// The title this area shows as right now (its realm, when zoomed out).
			const shown = () => (this.tiers && shownAs(chain, this.tiers)) || e.key;
			for (const { t, n } of this.areasHere(e)) {
				if (!this.shapeNow(t)) continue;
				this.drawnAreas.push({ key: e.key, n, points: t.points });
				const shownPts = roughenRing(t.points, rough, roughLen, near);
				const latlngs = (plain ? t.points : shownPts).map((p) => this.pointToLatLng(p));
				const poly = L.polygon(latlngs, { className: "universeview-territory", weight: 2, fillOpacity: 0.18, smoothFactor: 1.5 }).addTo(layer);
				const path = poly.getElement() as HTMLElement | undefined;
				path?.style.setProperty("--terr-color", color);
				// Its tier's look (Maps & realms → Territory styles).
				const nodeHere = anyTree.nodes.get(e.key);
				const tierCls = tierClass(nodeHere?.rank, nodeHere?.nature);
				path?.addClass(...tierCls.split(" "));
				if (path) bindHover(this.plugin, path, shown, this.root);
				// The polished look: an inner band of colour, a double line, or a texture, over the fill and clipped to it.
				const look = styleFor(this.plugin, tierNumber(nodeHere?.rank, nodeHere?.nature));
				let overlay: L.Polygon | undefined;
				const svgEl = path ? (path as unknown as SVGElement).ownerSVGElement : null;
				// Made when this area or any realm it can show as has a look (shown whole, a county wears its kingdom's texture).
				const anyOf = (has: (l: ReturnType<typeof styleFor>) => boolean) => has(look) || chain.some((k) => {
					const nd = anyTree.nodes.get(k);
					return has(styleFor(this.plugin, tierNumber(nd?.rank, nd?.nature)));
				});
				// A texture: its own shape over the fill, in the land's colour (no clip needed: it's a fill).
				let texture: L.Polygon | undefined;
				if (path && svgEl && anyOf((l) => !!l.pattern && l.pattern !== "flat")) {
					ensureTerritoryDefs(svgEl);
					texture = L.polygon(latlngs, { className: `uv-terr-texture uv-pat-${look.pattern ?? "flat"} ${tierCls}`, interactive: false, smoothFactor: 1.5 }).addTo(layer);
					(texture.getElement() as HTMLElement | undefined)?.style.setProperty("--terr-color", color);
				}
				if (path && svgEl && anyOf((l) => l.edge === "band" || l.edge === "double")) {
					const n2 = ++this.terrSeq;
					path.id = `uv-terr-${n2}`;
					ensureTerritoryDefs(svgEl);
					overlay = L.polygon(latlngs, { className: `uv-terr-overlay uv-edge-${look.edge ?? "plain"} ${tierCls}`, interactive: false, smoothFactor: 1.5 }).addTo(layer);
					const oe = overlay.getElement() as SVGElement | undefined;
					if (oe) {
						const clip = createSvg("clipPath");
						clip.id = `uv-clip-${n2}`;
						const use = createSvg("use");
						use.setAttribute("href", `#uv-terr-${n2}`);
						clip.appendChild(use);
						svgEl.querySelector("#uv-terr-defs")?.appendChild(clip);
						oe.setAttribute("clip-path", `url(#uv-clip-${n2})`);
						oe.style.setProperty("--terr-color", color);
					}
				}
				this.areaPolys.push({ owner: e.key, poly, chain, color, points: t.points, shown: shownPts, overlay, texture });
				this.ownLand.add(e.key);
				const b = poly.getBounds();
				for (const k of chain) {
					const cur = this.tierBounds.get(k);
					this.tierBounds.set(k, cur ? cur.extend(b) : L.latLngBounds(b.getSouthWest(), b.getNorthEast()));
				}
				poly.on("click", (evt: L.LeafletMouseEvent) => {
					if (this.mode !== "none" || this.root.hasClass("is-placing")) return;
					L.DomEvent.stop(evt);
					const key = shown();
					const mod = evt.originalEvent.ctrlKey || evt.originalEvent.metaKey;
					const tiersNow = this.tiers;
					// A split realm's border: show that realm whole again.
					if (tiersNow && !shownAs(chain, tiersNow) && this.tiersOn) return this.showWhole(e.key);
					// Shift-click goes up a tier: the realm above shows whole again.
					if (evt.originalEvent.shiftKey && this.realmTree?.nodes.get(key)?.under) return this.showWhole(this.realmTree.nodes.get(key)!.under!);
					// Ctrl/Cmd-click opens the note; a click picks the realm as it shows now (a kingdom
					// when zoomed out); a double-click splits it into its duchies.
					if (mod) openEntity(this.plugin, key, evt.originalEvent);
					else {
					// The area itself was clicked (a vassal's, when its realm shows whole): that's what Delete removes.
					this.clickedArea = { key: e.key, n };
					this.selectRealm(key);
					// Straight to the editing panel: for the realm as it shows (when it has land of its
					// own here), else the area that was clicked.
					const realm = key !== e.key ? this.plugin.index.get(key) : undefined;
					const own = realm ? this.areasHere(realm).find((a) => this.shapeNow(a.t)) : undefined;
					if (realm && own) this.openTerritoryEditor(realm, own.n);
					else this.openTerritoryEditor(e, n);
				}
				});
				poly.on("dblclick", (evt: L.LeafletMouseEvent) => {
					if (this.mode !== "none" || this.root.hasClass("is-placing")) return;
					L.DomEvent.stop(evt);
					const key = shown();
					if (this.canSplit(key)) this.drillTo(key);
					else openEntity(this.plugin, key, evt.originalEvent);
				});
				poly.on("contextmenu", (evt: L.LeafletMouseEvent) => {
					if (this.mode !== "none") return;
					L.DomEvent.stop(evt);
					// Every title above this area, to see it merged back into one.
					const above = this.tiersOn ? chain.slice(0, -1).reverse().filter((k) => this.plugin.index.get(k) && this.tierBounds.has(k)) : [];
					showEntityMenu(this.plugin, e.key, evt.originalEvent, {
						// Every territory tool lives in one editor bar, rather than a long menu.
						top: (menu) => menu.addItem((it) => it.setTitle("Edit territory…").setIcon("pencil-ruler").onClick(() => this.openTerritoryEditor(e, n))),
						extra: above.length
							? (menu) => {
									for (const k of above) menu.addItem((it) => it.setTitle(`Show ${this.plugin.index.get(k)!.name} whole`).setIcon("crown").onClick(() => this.showWhole(k)));
								}
							: undefined,
						// Straight off the map; Undo puts it back. Far from Edit, so it's never hit by mistake.
						danger: (menu) => warningItem(menu, "Delete this area", "trash-2", () => void this.plugin.deleteArea(e.key, this.options.map, n)),
					});
				});
				const label = el("div", { cls: "universeview-territory-label" + (nodeHere?.nature === "region" ? " is-region" : "") });
				label.style.setProperty("--terr-color", color);
				// A place's own area carries its icon (or sigil) and event count, in place of a pin.
				if (e.type === "place") {
					const logo = resourceUrl(this.plugin, e.logo);
					const iconName = e.icon ?? this.categories.get(styleKeyOf(e.category, e.tags) ?? "")?.icon;
					if (logo) el("img", { cls: "universeview-territory-icon", attr: { src: logo, alt: "" } }, label);
					else if (iconName) {
						const g = el("span", { cls: "universeview-territory-icon" }, label);
						if (!glyph(g, iconName)) g.remove();
					}
				}
				el("span", { cls: "universeview-territory-name", text: nameAt(e, this.options.at) }, label);
				const count = e.type === "place" ? (this.plugin.index.events(e.key) ?? []).length : 0;
				if (count) el("span", { cls: "universeview-territory-count", text: String(count) }, label);
				const center = polygonCentroid(latlngs);
				const m = L.marker(center, { icon: L.divIcon({ html: label, className: "universeview-territory-label-wrap", iconSize: [0, 0] }), pane: "universeview-territory-labels", interactive: false, keyboard: false });
				m.addTo(layer);
				(poly as L.Polygon & { _label?: HTMLElement })._label = label;
				const entry = this.areaPolys[this.areaPolys.length - 1];
				if (entry?.poly === poly) entry.labelMarker = m;
			}
		}
		this.placeAreaLabels();
		// A title with no area of its own (a realm made of its duchies) gets one label for all of them.
		if (tree) {
			for (const [k, b] of this.tierBounds) {
				if (this.ownLand.has(k)) continue;
				const e = idx.get(k);
				if (!e) continue;
				const label = el("div", { cls: "universeview-territory-label is-realm" });
				label.style.setProperty("--terr-color", entityColor(this.plugin, e));
				el("span", { cls: "universeview-territory-name", text: nameAt(e, this.options.at) }, label);
				// The middle of all its lands, unless that falls in the sea between them: then the roomiest spot in one.
				const parts = this.areaPolys.filter((x) => x.chain.includes(k));
				const mid = this.fromLatLng(b.getCenter());
				let at = b.getCenter();
				if (parts.length && !parts.some((x) => inRing(mid, x.points))) {
					const best = parts.map((x) => x.spot ?? labelSpot(x.points as P2[])).sort((x, y) => y.room - x.room)[0];
					if (best) at = this.pointToLatLng(best.p);
				}
				const marker = L.marker(at, { icon: L.divIcon({ html: label, className: "universeview-territory-label-wrap", iconSize: [0, 0] }), pane: "universeview-territory-labels", interactive: false, keyboard: false }).addTo(layer);
				this.tierLabels.set(k, { marker, el: label });
			}
		}
		this.applyTiers();
		this.sizeTerritoryLabels();
		this.prepareRealmShapes();
	}

	// ---- Tiers: realms split into duchies and counties as they grow on screen ----

	/** Whether each land's sub-lands fill most of it (kept until the territories are redrawn). */
	private coverCache = new Map<string, boolean>();
	private areaPolys: {
		owner: string;
		poly: L.Polygon;
		chain: string[];
		color: string;
		points: [number, number][];
		/** The border as drawn: roughened when Roughen borders is on (its points stay the editable corners). */
		shown: [number, number][];
		overlay?: L.Polygon;
		texture?: L.Polygon;
		labelMarker?: L.Marker;
		/** Where its name goes: in the open (whole), and clear of its sub-lands (split open). */
		spot?: { p: P2; room: number };
		openSpot?: { p: P2; room: number };
	}[] = [];

	/**
	 * Puts each area's name where there's most room for it (the point farthest from its border, not
	 * the middle of its outline, which can fall in a bay or outside it), with a second spot clear of
	 * its sub-lands for when it's split open; long thin lands get their name tilted along them.
	 */
	private placeAreaLabels() {
		// World maps store [lat, lng]: turned to screen-like x right, y down for the angle.
		const screenish = (p: P2): P2 => (this.isImageMap ? p : [p[1], -p[0]]);
		for (const a of this.areaPolys) {
			if (!a.labelMarker || a.points.length < 3) continue;
			const ring = a.points as P2[];
			a.spot = labelSpot(ring);
			const subs = this.areaPolys.filter((x) => x.owner !== a.owner && x.chain.includes(a.owner)).map((x) => x.points as P2[]);
			const open = subs.length ? labelSpot(ring, subs) : a.spot;
			a.openSpot = open.room > 0 ? open : a.spot;
			a.labelMarker.setLatLng(this.pointToLatLng(a.spot.p));
			const label = (a.poly as L.Polygon & { _label?: HTMLElement })._label;
			if (!label) continue;
			const axis = mainAxis(ring.map(screenish));
			const deg = (axis.angle * 180) / Math.PI;
			label.style.rotate = axis.stretch > 1.7 && Math.abs(deg) > 6 ? `${Math.max(-35, Math.min(35, deg))}deg` : "";
		}
	}
	private terrSeq = 0;
	/** Each title's land on this map: its own areas and everything under it. */
	private tierBounds = new Map<string, L.LatLngBounds>();
	/** Titles with areas of their own (the rest are made of their vassals' land). */
	private ownLand = new Set<string>();
	private tierLabels = new Map<string, { marker: L.Marker; el: HTMLElement }>();
	private tiers?: Tiers;
	private realmTree?: RealmTree;

	private get tiersOn(): boolean {
		return this.options.tiers !== false;
	}

	/** How big a title's land is on screen, in pixels across. */
	private screenSize(key: string): number {
		const b = this.tierBounds.get(key);
		if (!b || !this.map) return 0;
		const ne = this.map.latLngToContainerPoint(b.getNorthEast());
		const sw = this.map.latLngToContainerPoint(b.getSouthWest());
		return Math.sqrt(Math.abs(ne.x - sw.x) * Math.abs(ne.y - sw.y));
	}

	/**
	 * A title's size for the tiers: on screen, or (with one level held from the map's Tier menu) big
	 * enough to split when it's above that level and small enough to stay whole at it or below.
	 */
	private tierSize(key: string): number {
		const level = this.options.tierLevel;
		if (!level) return this.screenSize(key);
		const rank = this.realmTree?.nodes.get(key)?.rank ?? 9;
		return Math.round(rank) < level ? Infinity : 0;
	}

	/** Whether a title shown whole would split into vassals with land of their own. */
	private canSplit(key: string): boolean {
		return !!this.tiers?.whole.has(key) && !!this.realmTree?.nodes.get(key)?.children.some((c) => this.tierBounds.has(c));
	}

	/** Zooms out until a title shows as one block again (merged from its duchies), centred on it. */
	showWhole(key: string) {
		const b = this.tierBounds.get(key);
		const map = this.map;
		if (!b || !map) return;
		const split = this.plugin.settings.tierSplitPx || 420;
		const fit = map.getBoundsZoom(b);
		// How big it would be at that zoom, then step out until it's comfortably under the split size.
		const ne = map.project(b.getNorthEast(), fit);
		const sw = map.project(b.getSouthWest(), fit);
		const across = Math.sqrt(Math.abs(ne.x - sw.x) * Math.abs(ne.y - sw.y)) || 1;
		const zoom = Math.max(map.getMinZoom(), fit + Math.log2((split * 0.75) / across));
		const duration = motionMs(this.plugin.settings, 600) / 1000;
		map.flyTo(b.getCenter(), zoom, { duration: duration || 0.01, animate: duration > 0 });
	}

	/** Zooms in on a title far enough for it to split into its vassals. */
	drillTo(key: string) {
		const b = this.tierBounds.get(key);
		if (!b || !this.map) return;
		const duration = motionMs(this.plugin.settings, 600) / 1000;
		this.map.flyToBounds(b.pad(0.08), { duration: duration || 0.01, animate: duration > 0 });
	}

	// ---- Border check -----------------------------------------------------------------------------

	private checkPanel?: HTMLElement;
	private checkMark?: L.Layer;

	/** Whether the border check is open (it re-runs as the map changes). */
	get checkingBorders(): boolean {
		return !!this.checkPanel;
	}

	/**
	 * Checks the lands drawn on this map (as the time slider shows them) for overlaps, gaps, lands
	 * sticking out of their realm, partly covered lands, crossed borders and slivers, in a panel with
	 * a "show me" and, where the fix is clear, a button to do it.
	 */
	/** Water read from the whole picture (coarse), for telling a river between two lands from a gap. */
	private wet?: { map: string; mask: Uint8Array; w: number; h: number; scale: number };

	private async wetForCheck(): Promise<((p: P2) => boolean) | undefined> {
		if (!this.isImageMap) return undefined;
		const key = this.options.map;
		if (this.wet?.map !== key) {
			const r = await this.loadRaster().catch(() => null);
			if (!r || this.options.map !== key) return undefined;
			this.seaColor ??= edgeColor(r.img);
			this.wet = { map: key, mask: wetMask(r.img, { sea: this.seaColor }), w: r.img.width, h: r.img.height, scale: r.scale };
		}
		const wt = this.wet;
		return ([x, y]) => {
			const px = Math.floor(x / wt.scale);
			const py = Math.floor(y / wt.scale);
			return px >= 0 && py >= 0 && px < wt.w && py < wt.h && !!wt.mask[py * wt.w + px];
		};
	}

	/**
	 * Fills the small unclaimed pockets where lands meet (holes left between three or more of them,
	 * which closing gaps pair by pair can't reach): each goes to the land nearest its middle. Pockets of
	 * water (a lake between lands) are left alone. Returns how many were filled.
	 */
	private async fillPockets(mapSize: number): Promise<number> {
		const tree = this.realmTree ?? this.plugin.realms(this.options.at);
		const lands = this.drawnAreas.filter((a) => tree.nodes.get(a.key)?.nature !== "region");
		const gap = Math.max(2, mapSize * 0.0015);
		// Gaps enclosed by lands, up to a small lake's size: a stretch of river between two lands counts
		// too (left between them, it shows as a bare patch). Bigger unclaimed land may be meant.
		const pockets = pocketsBetween(lands.map((a) => a.points as P2[]), (gap * 10) ** 2);
		let n = 0;
		for (const hole of pockets) {
			const mid = labelSpot(hole).p;
			let best: (typeof lands)[number] | undefined;
			let bestD = Infinity;
			for (const a of lands) {
				const d = nearestOnRing(mid, a.points).d;
				if (d < bestD) [best, bestD] = [a, d];
			}
			if (!best) continue;
			const res = mergeInto(best.points, [hole]);
			if (!res) continue;
			await this.plugin.saveTerritory(best.key, this.options.map, best.n, res.ring);
			best.points = res.ring;
			n++;
		}
		return n;
	}

	/** Takes the spikes and loops out of an area's border and saves it. */
	private async untangleArea(key: string, n: number) {
		const area = this.drawnAreas.find((a) => a.key === key && a.n === n);
		if (!area) return;
		const fixed = untangle(area.points, 0.05);
		await this.plugin.saveTerritory(key, this.options.map, n, fixed);
	}

	async checkBorders(open = true) {
		if (!open) {
			this.checkPanel?.remove();
			this.checkPanel = undefined;
			this.checkMark?.remove();
			return;
		}
		const map = this.map;
		if (!map) return;
		const isWater = await this.wetForCheck();
		if (!this.map) return;
		const idx = this.plugin.index;
		const tree = this.realmTree ?? this.plugin.realms(this.options.at);
		const areas: BorderArea[] = this.drawnAreas.map((a) => {
			const node = tree.nodes.get(a.key);
			return { key: a.key, n: a.n, points: a.points, name: idx.get(a.key)?.name ?? a.key, chain: node ? chainOf(tree, a.key) : [a.key], region: !node || node.nature === "region" };
		});
		const all = areas.flatMap((a) => a.points);
		const box = all.length ? boxOf(all) : { x0: 0, y0: 0, x1: 1, y1: 1 };
		const mapSize = this.isImageMap && this.imageWidth ? Math.max(this.imageWidth, this.imageHeight) : Math.hypot(box.x1 - box.x0, box.y1 - box.y0);
		const issues = checkBorders(areas, { mapSize, isWater });
		this.checkPanel?.remove();
		const panel = el("div", { cls: "uv-check-panel universeview-scope" }, this.root);
		this.checkPanel = panel;
		L.DomEvent.disableClickPropagation(panel);
		L.DomEvent.disableScrollPropagation(panel);
		const head = el("div", { cls: "uv-check-head" }, panel);
		icon(el("span", { cls: "uv-check-head-icon" }, head), issues.length ? "shield-alert" : "shield-check");
		const titles = el("div", { cls: "uv-check-titles" }, head);
		el("div", { cls: "uv-check-title", text: "Border check" }, titles);
		el("div", { cls: "uv-check-sub", text: issues.length ? `${issues.length} thing${issues.length === 1 ? "" : "s"} to look at, across ${areas.length} areas` : `All ${areas.length} areas fit together` }, titles);
		// Everything that can be fixed without a choice: borders untangled, gaps closed.
		const fixable = issues.filter((i) => i.kind === "crossed" || i.kind === "gap");
		if (fixable.length) {
			const all = el("button", { cls: "mod-cta uv-check-fixall", text: `Fix all (${fixable.length})`, attr: { title: "Untangle crossed borders and close the gaps; Undo puts each back" } }, head);
			all.addEventListener("click", () => void (async () => {
				all.disabled = true;
				for (const i of fixable.filter((x) => x.kind === "crossed")) await this.untangleArea(i.key, i.n);
				for (const i of fixable.filter((x) => x.kind === "gap")) await this.closeGap(i, true);
				const filled = await this.fillPockets(mapSize);
				new Notice(`Fixed ${fixable.length} border problem${fixable.length === 1 ? "" : "s"}${filled ? `, and filled ${filled} pocket${filled === 1 ? "" : "s"} where lands meet` : ""}. Undo puts them back one at a time.`);
				window.setTimeout(() => this.checkPanel && void this.checkBorders(), 700);
			})());
		}
		const again = el("button", { cls: "clickable-icon", attr: { "aria-label": "Check again" } }, head);
		icon(again, "refresh-cw");
		again.addEventListener("click", () => void this.checkBorders());
		const close = el("button", { cls: "clickable-icon", attr: { "aria-label": "Close" } }, head);
		icon(close, "x");
		close.addEventListener("click", () => void this.checkBorders(false));
		if (!issues.length) {
			el("div", { cls: "uv-check-empty", text: "No overlaps, gaps, stray pieces or crossed borders. Lands fit inside the lands they're part of." }, panel);
			return;
		}
		const KIND: Record<BorderIssueKind, [string, string]> = {
			crossed: ["Crossed borders", "git-merge"],
			overlap: ["Overlaps", "layers"],
			outside: ["Sticking out", "square-dashed-bottom"],
			gap: ["Gaps", "move-horizontal"],
			partial: ["Partly covered", "square-dashed"],
			sliver: ["Slivers", "minus"],
		};
		// Filter chips by kind, with counts.
		const kinds = [...new Set(issues.map((i) => i.kind))];
		let only: BorderIssueKind | undefined;
		const chips = el("div", { cls: "uv-check-chips" }, panel);
		const list = el("div", { cls: "uv-check-list" }, panel);
		const show = (i: BorderIssue) => {
			const ll = this.pointToLatLng(i.at);
			const mine = this.areaPolys.filter((a) => (a.owner === i.key || a.owner === i.other?.key) && a.poly.getElement());
			const bounds = mine.length ? mine.map((a) => a.poly.getBounds()).reduce((b, x) => b.extend(x)) : L.latLngBounds(ll, ll);
			map.flyToBounds(bounds.pad(0.15), { duration: motionMs(this.plugin.settings, 500) / 1000, maxZoom: map.getMaxZoom() });
			this.checkMark?.remove();
			this.checkMark = L.marker(ll, { icon: L.divIcon({ html: el("div", { cls: "uv-check-mark" }), className: "universeview-vertex-wrap", iconSize: [0, 0] }), interactive: false }).addTo(map);
			for (const a of mine) {
				const p = a.poly.getElement() as HTMLElement;
				p.removeClass("uv-check-flash");
				void p.getBoundingClientRect();
				p.addClass("uv-check-flash");
			}
		};
		const fixFor = (i: BorderIssue): [string, string, () => void] | undefined => {
			const e = idx.get(i.key);
			if (!e) return undefined;
			if (i.kind === "gap") return ["Close the gap", "expand", () => void this.closeGap(i)];
		if (i.kind === "crossed") return ["Untangle", "wand-sparkles", () => void this.untangleArea(i.key, i.n).then(() => window.setTimeout(() => this.checkPanel && void this.checkBorders(), 600))];
			if (i.kind === "sliver") return ["Delete it", "trash-2", () => void this.plugin.deleteArea(i.key, this.options.map, i.n).then(() => window.setTimeout(() => this.checkPanel && void this.checkBorders(), 600))];
			if (i.kind === "partial") return ["New land within", "plus-square", () => newLandSheet(this.plugin, e, (file) => void this.plugin.drawOnMap(file.path, "paint", 0, this.options.map))];
			return ["Reshape", "pencil-ruler", () => this.openTerritoryEditor(e, i.n)];
		};
		const draw = () => {
			chips.empty();
			const chip = (label: string, count: number, k: BorderIssueKind | undefined, ic?: string) => {
				const b = el("button", { cls: "uv-check-chip" + (only === k ? " is-active" : "") }, chips);
				if (ic) icon(el("span", {}, b), ic);
				el("span", { text: label }, b);
				el("span", { cls: "uv-check-count", text: String(count) }, b);
				b.addEventListener("click", () => {
					only = k;
					draw();
				});
			};
			chip("All", issues.length, undefined);
			for (const k of kinds) chip(KIND[k][0], issues.filter((i) => i.kind === k).length, k, KIND[k][1]);
			list.empty();
			for (const i of issues.filter((x) => !only || x.kind === only)) {
				const row = el("div", { cls: `uv-check-row is-${i.kind}` }, list);
				icon(el("span", { cls: "uv-check-row-icon" }, row), KIND[i.kind][1]);
				const main = el("div", { cls: "uv-check-row-main" }, row);
				el("div", { cls: "uv-check-row-title", text: i.title }, main);
				el("div", { cls: "uv-check-row-detail", text: i.detail }, main);
				const acts = el("div", { cls: "uv-check-row-actions" }, main);
				const b = el("button", {}, acts);
				icon(el("span", {}, b), "crosshair");
				el("span", { text: "Show" }, b);
				b.addEventListener("click", () => show(i));
				const fix = fixFor(i);
				if (fix) {
					const f = el("button", { cls: i.kind === "sliver" ? "mod-warning" : "" }, acts);
					icon(el("span", {}, f), fix[1]);
					el("span", { text: fix[0] }, f);
					f.addEventListener("click", () => {
						show(i);
						fix[2]();
					});
				}
				row.addEventListener("dblclick", () => show(i));
			}
		};
		draw();
	}

	/**
	 * Closes one gap the border check found: only the land's corners in the gap move, onto the
	 * neighbour's border, following it between them, so the two share one line. The neighbour stays
	 * as drawn, and nothing beyond the gap's width moves. Undo puts it back.
	 */
	async closeGap(issue: BorderIssue, quiet = false) {
		let mine = this.drawnAreas.find((a) => a.key === issue.key && a.n === issue.n);
		let other = issue.other && this.drawnAreas.find((a) => a.key === issue.other!.key && a.n === issue.other!.n);
		if (!mine || !other) return;
		const reach = (issue.width ?? 4) * 1.25 + 1;
		let { ring, moved } = snapToNeighbour(mine.points, other.points, reach);
		// Nothing of the one can move onto the other: try it the other way round.
		if (!moved) {
			const back = snapToNeighbour(other.points, mine.points, reach);
			if (back.moved) [mine, other, ring, moved] = [other, mine, back.ring, back.moved];
		}
		const name = this.plugin.index.get(mine.key)?.name ?? mine.key;
		if (!moved) {
			if (!quiet) new Notice(`Nothing of ${name} lies close enough to move.`);
			return;
		}
		await this.plugin.saveTerritory(mine.key, this.options.map, mine.n, ring);
		// The drawn copy follows at once, so several fixes in a row see each other's results.
		mine.points = untangle(ring, 0.05);
		if (quiet) return;
		new Notice(`Closed the gap: ${moved} corner${moved === 1 ? "" : "s"} of ${name} now on the shared border. Undo puts them back.`);
		window.setTimeout(() => this.checkPanel && void this.checkBorders(), 600);
	}

	/**
	 * Grows an area out to its neighbours: every stretch of its border within `px` of another area's
	 * border is pulled onto it, so the gap between the two fills in. Its edges are first cut into short
	 * steps so long straight sides can bend to follow the neighbour; steps that didn't move are dropped.
	 */
	private growPlan(key: string, n: number, px: number, quiet = false): GrowPlan | null {
		const map = this.map;
		const owner = this.plugin.index.get(key);
		const area = owner && this.areasHere(owner).find((a) => a.n === n);
		if (!map || !owner || !area) return null;
		const toScreen = (q: [number, number]): Pt => {
			const c = map.latLngToContainerPoint(this.pointToLatLng(q));
			return [c.x, c.y];
		};
		const neighbours = this.drawnAreas.filter((a) => !(a.key === key && a.n === n));
		const others = neighbours.map((a) => a.points.map(toScreen));
		if (!others.length) {
			if (!quiet) new Notice("No other areas on this map to grow towards.");
			return null;
		}
		const toStored = (p: Pt): [number, number] => this.fromLatLng(map.containerPointToLatLng(L.point(p[0], p[1])));
		/** The nearest point of any neighbour's border: on a corner (that exact corner), or on an edge. */
		const nearest = (p: Pt): { o: number; seg: number; t: number; corner?: number; at: Pt } | null => {
			let best: { o: number; seg: number; t: number; corner?: number; at: Pt; d: number } | null = null;
			others.forEach((ring, o) => {
				for (let s = 0; s < ring.length; s++) {
					const a = ring[s];
					const b = ring[(s + 1) % ring.length];
					const dx = b[0] - a[0];
					const dy = b[1] - a[1];
					const len2 = dx * dx + dy * dy || 1;
					const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
					const at: Pt = [a[0] + dx * t, a[1] + dy * t];
					const d = Math.hypot(p[0] - at[0], p[1] - at[1]);
					if (d > px || (best && d >= best.d)) continue;
					// Within a pixel of a corner counts as that corner.
					const len = Math.sqrt(len2);
					const corner = t * len < 1 ? s : (1 - t) * len < 1 ? (s + 1) % ring.length : undefined;
					best = { o, seg: s, t, corner, at, d };
				}
			});
			return best;
		};
		// Corners to add to each neighbour, so the two borders are one line.
		const inserts = new Map<number, { seg: number; t: number; q: [number, number] }[]>();
		const stored = area.t.points;
		const mine = stored.map(toScreen);
		const out: [number, number][] = [];
		let moved = 0;
		const step = Math.max(3, px / 2);
		for (let i = 0; i < mine.length; i++) {
			const a = mine[i];
			const b = mine[(i + 1) % mine.length];
			const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
			const parts = Math.max(1, Math.ceil(len / step));
			for (let k = 0; k < parts; k++) {
				const p: Pt = [a[0] + ((b[0] - a[0]) * k) / parts, a[1] + ((b[1] - a[1]) * k) / parts];
				const hit = nearest(p);
				if (hit) {
					moved++;
					if (hit.corner !== undefined) out.push([...neighbours[hit.o].points[hit.corner]] as [number, number]);
					else {
						const q = toStored(hit.at);
						out.push(q);
						inserts.set(hit.o, [...(inserts.get(hit.o) ?? []), { seg: hit.seg, t: hit.t, q }]);
					}
					// An untouched corner of its own keeps its exact numbers (so corners already shared stay shared).
				} else if (k === 0) out.push(stored[i]);
			}
		}
		if (!moved) {
			if (!quiet) new Notice(`No neighbour within ${px} px of ${owner.name}'s border at this zoom. Zoom out, or try a wider gap.`);
			return null;
		}
		// Steps that landed on the same spot collapse into one.
		const same = (p: [number, number], q: [number, number]) => Math.abs(p[0] - q[0]) < 1e-9 && Math.abs(p[1] - q[1]) < 1e-9;
		const points = out.filter((p, i) => !same(p, out[(i + out.length - 1) % out.length]));
		// Each neighbour gets the new corners on its edges, in order along each edge.
		const rings: GrowPlan["rings"] = [];
		const names: string[] = [];
		for (const [o, list] of inserts) {
			const nb = neighbours[o];
			const ring: [number, number][] = [];
			nb.points.forEach((pt, s) => {
				ring.push(pt);
				const here = list.filter((x) => x.seg === s).sort((x, y) => x.t - y.t);
				for (const x of here) if (!ring.some((r) => same(r, x.q))) ring.push(x.q);
			});
			rings.push({ key: nb.key, n: nb.n, ring });
			const nm = this.plugin.index.get(nb.key)?.name;
			if (nm && !names.includes(nm)) names.push(nm);
		}
		return { points, rings, moved, names };
	}

	async closeGaps(key: string, n: number, px: number) {
		const plan = this.growPlan(key, n, px);
		const owner = this.plugin.index.get(key);
		if (!plan || !owner) return;
		await this.plugin.saveShapes("territory", key, this.options.map, n, plan.points);
		for (const r of plan.rings) await this.plugin.saveShapes("territory", r.key, this.options.map, r.n, r.ring);
		new Notice(`Grew ${owner.name} to meet its neighbours (${plan.moved} points moved)${plan.names.length ? `; the shared border was added to ${plan.names.join(", ")} too` : ""}. Undo puts it back.`);
	}

	/**
	 * Grow an area to its neighbours, tried on first: the grown outline shows over the old one (dashed) as you set
	 * how wide a gap to close, and nothing is saved until Grow.
	 */
	startGrow(ownerKey: string, n: number) {
		const map = this.map;
		const owner = this.plugin.index.get(ownerKey);
		const area = owner && this.areasHere(owner).find((a) => a.n === n);
		if (!map || !owner || !area || !this.toolLayer) return;
		this.endMode();
		const color = entityColor(this.plugin, owner);
		const preview = L.layerGroup().addTo(this.toolLayer);
		const status = el("span", { cls: "uv-simplify-count" });
		let px = this.plugin.settings.growPx ?? 16;
		let plan: GrowPlan | null = null;
		const redraw = () => {
			plan = this.growPlan(ownerKey, n, px, true);
			preview.clearLayers();
			L.polygon(area.t.points.map((p) => this.pointToLatLng(p)), { className: "uv-simplify-orig", fill: false, interactive: false }).addTo(preview);
			if (plan) {
				const shape = L.polygon(plan.points.map((p) => this.pointToLatLng(p)), { className: "universeview-territory is-draft", weight: 2, fillOpacity: 0.25, interactive: false }).addTo(preview);
				(shape.getElement() as HTMLElement | undefined)?.style.setProperty("--terr-color", color);
			}
			status.setText(plan ? `${plan.moved} points move${plan.names.length ? ` to meet ${plan.names.slice(0, 3).join(", ")}${plan.names.length > 3 ? ` +${plan.names.length - 3}` : ""}` : ""}` : `No neighbour within ${px} px at this zoom`);
		};
		const apply = () => {
			if (!plan) {
				new Notice(`No neighbour within ${px} px of ${owner.name}'s border at this zoom. Zoom out, or try a wider gap.`);
				return;
			}
			this.endMode();
			void this.closeGaps(ownerKey, n, px);
		};
		this.beginMode("grow", (evt) => {
			if (evt.key === "Escape") this.endMode();
			else if (evt.key === "Enter") apply();
			else return;
			evt.stopPropagation();
		});
		// The gap is measured in screen pixels, so it is tried again whenever the zoom changes.
		map.on("zoomend", redraw);
		this.modeCleanup.push(() => map.off("zoomend", redraw));
		this.showBanner(`Growing ${owner.name} to its neighbours: its border is pulled onto any neighbouring border within the gap, and the neighbours get the matching corners · the old outline stays dashed · nothing is saved until Grow`, [
			{ label: "Cancel", run: () => this.endMode() },
			{ label: "Grow", cta: true, run: apply },
		], (b) => {
			const controls = el("div", { cls: "universeview-fill-controls" }, b);
			b.addClass("has-fill-controls");
			this.slider(controls, "Close gaps up to", "How wide a gap, in screen pixels as the map shows now, to close: zoom out to close wider ones", 2, 120, px, (v) => {
				px = v;
				this.plugin.settings.growPx = v;
				this.saveSoon();
				redraw();
			});
			controls.appendChild(status);
		});
		redraw();
	}

	/**
	 * Borders from a political map painted in flat colours: each colour found becomes one note's area
	 * (matched by the note's `color:`, or picked), traced from the picture's pixels.
	 */
	async importColours() {
		if (!this.isImageMap) {
			new Notice("Importing borders reads a map picture's colours, so it works on image maps.");
			return;
		}
		const mapKey = this.options.map;
		const wait = new Notice("Reading the map's colours…", 0);
		let raster: { img: Raster; scale: number } | null = null;
		try {
			raster = await this.loadRaster();
		} catch (err) {
			console.error("UniverseView colour import:", err);
		}
		if (!raster) {
			wait.hide();
			new Notice("Couldn't read this map picture's pixels.");
			return;
		}
		// Give the notice a frame to show before the heavy part.
		await new Promise((r) => window.setTimeout(r, 30));
		const areas = findColourAreas(raster.img, raster.scale);
		wait.hide();
		if (!areas.length) {
			new Notice("No flat colours big enough to be realms were found in this picture.");
			return;
		}
		new ColourImportModal(this.plugin, areas, async (rows, replace) => {
			let n = 0;
			for (const { e, area } of rows) {
				if (replace) {
					const mine = this.areasHere(e).map((a) => a.n);
					if (mine.length) await this.deleteAreas(e.key, mine);
				}
				const [first, ...more] = area.rings.sort((a, b) => ringArea(b) - ringArea(a));
				await this.plugin.saveTerritory(e.key, mapKey, null, first, more);
				n++;
			}
			new Notice(`Imported borders for ${n} note${n === 1 ? "" : "s"}. Undo puts them back.`);
		}, this.options.folder || (mapKey.includes("/") ? mapKey.split("/")[0] : undefined)).open();
	}

	/**
	 * The territory editor: a bar along the bottom of the map for one area, with every tool as a
	 * button (reshape, dates, new borders from a date, paint and fill more, split, a new land inside,
	 * grow to the neighbours, erase, delete). It stays while you work; a tool's own banner shows at
	 * the top as it runs. Close it with ✕ or Escape.
	 */
	openTerritoryEditor(e: Entity, n: number) {
		this.root.querySelector(".uv-terr-editor")?.remove();
		const area = this.areasHere(e).find((a) => a.n === n);
		const all = this.areasHere(e).length;
		const bar = el("div", { cls: "uv-terr-editor" }, this.root);
		// The legend and other bottom controls move up out of its way while it's open.
		this.root.addClass("has-terr-editor");
		bar.style.setProperty("--terr-color", entityColor(this.plugin, e));
		L.DomEvent.disableClickPropagation(bar);
		L.DomEvent.disableScrollPropagation(bar);
		const head = el("div", { cls: "uv-terr-editor-head" }, bar);
		el("span", { cls: "uv-terr-editor-swatch" }, head);
		el("strong", { text: e.name }, head);
		const when = area?.t.fromText || area?.t.toText ? `${area?.t.fromText ?? "…"} – ${area?.t.toText ?? "…"}` : "always";
		el("span", { cls: "uv-terr-editor-sub", text: `area ${n + 1} of ${all} · ${when}` }, head);
		const close = el("button", { cls: "clickable-icon uv-terr-editor-close", attr: { "aria-label": "Close the editor (Esc)" } }, head);
		icon(close, "x");
		const shut = () => {
			this.root.removeClass("has-terr-editor");
			bar.remove();
			document.removeEventListener("keydown", onKey, true);
		};
		close.addEventListener("click", shut);
		// One-key shortcuts for the panel's tools while it's open and no tool is running (shown on each button's tip).
		const SHORTCUTS: Record<string, string> = { Reshape: "r", Simplify: "s", Expand: "e", Brush: "b", Grow: "g", Fill: "f", Split: "x", Route: "t", Check: "c", Dates: "d" };
		const keys = new Map<string, () => void>();
		const onKey = (evt: KeyboardEvent) => {
			// Replaced by another area's panel (it now opens on every click): this one's listener goes too.
			if (!bar.isConnected) {
				document.removeEventListener("keydown", onKey, true);
				return;
			}
			if (this.mode !== "none" || document.querySelector(".modal-container")) return;
			if (evt.key === "Escape") {
				evt.stopPropagation();
				shut();
				return;
			}
			const target = evt.target as HTMLElement | null;
			if (evt.ctrlKey || evt.metaKey || evt.altKey || target?.closest?.("input, textarea, select, [contenteditable='true']")) return;
			const run = keys.get(evt.key.toLowerCase());
			if (!run) return;
			evt.preventDefault();
			evt.stopPropagation();
			run();
		};
		document.addEventListener("keydown", onKey, true);
		const tabs = el("div", { cls: "uv-terr-editor-tabs" }, bar);
		const group = (label: string) => {
			const g = el("div", { cls: "uv-terr-editor-group" }, tabs);
			el("div", { cls: "uv-terr-editor-group-label", text: label }, g);
			return el("div", { cls: "uv-terr-editor-buttons" }, g);
		};
		const tool = (parent: HTMLElement, ic: string, label: string, tip: string, run: () => void, cls = "") => {
			const key = SHORTCUTS[label];
			if (key) keys.set(key, run);
			const b = el("button", { cls: `uv-terr-tool ${cls}`.trim(), attr: { "aria-label": key ? `${tip} (${key.toUpperCase()})` : tip } }, parent);
			icon(el("span", { cls: "uv-terr-tool-icon" }, b), ic);
			el("span", { cls: "uv-terr-tool-label", text: label }, b);
			b.addEventListener("click", (evt) => {
				evt.stopPropagation();
				run();
			});
		};
		const shape = group("Shape");
		tool(shape, "pencil", "Reshape", "Drag its corners; shared corners move both borders", () => this.startEdit(e.key, n));
		tool(shape, "spline", "Simplify", "Fewer corners where they make little difference; real detail such as a coast stays", () => this.startSimplify(e.key, n));
		tool(shape, "lasso", "Expand", "Circle new land and it joins this same area", () => this.startExpand(e.key, n));
		tool(shape, "brush", "Brush", "Paint land onto this same area, push a neighbour back, or rub it out", () => this.startBrush(e.key, n));
			tool(shape, "flag", "Occupied", "Paint ground this land holds for a while, with dates; its real borders stay", () => this.startPaint(e.key, true));
		tool(shape, "expand", "Grow", "Grow it out to its neighbours, filling the gaps between (tried on first)", () => this.startGrow(e.key, n));
		tool(shape, "square-plus", "New area", "Paint another, separate area for it (an island, an exclave)", () => this.startPaint(e.key));
		if (this.isImageMap) tool(shape, "paint-bucket", "Fill", "Fill land up to the picture's coasts, rivers and borders, joining this same area", () => void this.startFill(e.key, n));
		const time = group("Over time");
		tool(time, "calendar-range", "Dates", "When this area applies", () => areaDatesSheet(this.plugin, e, this.options.map, n, area?.t));
		tool(time, "history", "New borders", "From a date on, different borders", () => this.bordersFrom(e, n));
		const lands = group("Lands");
		tool(lands, "scissors", "Split", "Cut a land off it along a line", () => this.startSplit(e.key));
		tool(lands, "plus-square", "New land", "Make a land inside it and draw its borders", () => newLandSheet(this.plugin, e, (file) => this.startPaint(file.path)));
		// The rest of the top toolbar's Draw menu, here too, so drawing work is all in one place.
		const more = group("Draw");
		tool(more, "route", "Route", "Draw a road, river or sea lane belonging to it", () => this.startRoute(e.key));
		tool(more, "sticky-note", "Map notes", "Sticky notes, arrows and lines on the map", () => this.startAnnotate());
		if (this.isImageMap) tool(more, "palette", "Import", "Import borders from a coloured political map", () => void this.importColours());
		tool(more, "shield-check", "Check", "Check borders: overlaps, gaps, stray pieces…", () => void this.checkBorders(!this.checkingBorders));
		const remove = group("Remove");
		tool(remove, "box-select", "Erase", "Erase everything in a box you drag", () => this.startErase());
		tool(remove, "trash-2", "Delete", all > 1 ? "Delete this area, or all of its areas on this map" : "Delete this area (Undo puts it back)", () => {
			// Just the one area: gone at once, Undo brings it back. Several: say which.
			if (all <= 1) {
				shut();
				void this.plugin.deleteArea(e.key, this.options.map, n);
				return;
			}
			toolSheet(this.plugin, {
				title: `Delete ${e.name}'s ${all > 1 ? "areas" : "area"}`,
				icon: "trash-2",
				danger: true,
				intro: "Takes borders off this map. The note stays, and Undo (Ctrl+Alt+Z) puts them back.",
				fields: all > 1 ? [{ key: "which", kind: "choice", label: "Delete", value: "one", options: [["one", `This area (${n + 1})`], ["all", `All ${all} on this map`]] }] : [],
				submit: "Delete",
				run: (v) => {
					shut();
					if (v.which === "all") void this.deleteAreas(e.key, this.areasHere(e).map((a) => a.n)).then(() => new Notice(`Removed ${all} areas of ${e.name}. Undo puts them back.`));
					else void this.plugin.saveTerritory(e.key, this.options.map, n, null).then(() => new Notice(`Removed an area of ${e.name}. Undo puts it back.`));
				},
			});
		}, "is-danger");
	}

	/** New borders from a date: the form, then the map moves to that date and the copy opens for reshaping. */
	bordersFrom(e: Entity, n: number) {
		bordersFromSheet(this.plugin, e, this.options.map, n, this.options.at, (m, day) => {
			this.options.at = day;
			window.setTimeout(() => {
				void this.refresh();
				this.startEdit(e.key, m);
			}, 700);
		});
	}

	/** Each realm's statistic for shading, worked out once per drawing; and the range across those shown. */
	private shadeValues = new Map<string, number | undefined>();
	private shadeRange?: [number, number];

	private shade(key: string): string | undefined {
		const by = this.options.shadeBy;
		if (!by) return undefined;
		if (!this.shadeValues.has(key)) this.shadeValues.set(key, statValue(realmStats(this.plugin, key, this.isImageMap ? this.options.map : "world", this.options.at), by));
		const v = this.shadeValues.get(key);
		if (v === undefined) return "var(--background-modifier-border)";
		if (!this.shadeRange) {
			const shown = this.tiers ? [...this.tiers.whole] : this.areaPolys.map((a) => a.owner);
			const vals = shown.map((k) => {
				if (!this.shadeValues.has(k)) this.shadeValues.set(k, statValue(realmStats(this.plugin, k, this.isImageMap ? this.options.map : "world", this.options.at), by));
				return this.shadeValues.get(k);
			}).filter((x): x is number => x !== undefined);
			this.shadeRange = vals.length ? [Math.min(...vals), Math.max(...vals)] : [0, 1];
			this.drawShadeLegend();
		}
		const [lo, hi] = this.shadeRange;
		const t = hi > lo ? (v - lo) / (hi - lo) : 1;
		return `color-mix(in srgb, var(--interactive-accent) ${Math.round(18 + t * 72)}%, var(--background-primary))`;
	}

	/** What the shading means: the statistic, and its lowest and highest among the realms shown. */
	private drawShadeLegend() {
		this.root.querySelector(".uv-shade-legend")?.remove();
		const by = this.options.shadeBy;
		if (!by || !this.shadeRange) return;
		const box = el("div", { cls: "uv-shade-legend" }, this.root);
		el("div", { cls: "uv-shade-title", text: `Shaded by ${(STAT_NAMES.find((s) => s[0] === by)?.[1] ?? by).toLowerCase()}` }, box);
		el("div", { cls: "uv-shade-ramp" }, box);
		const row = el("div", { cls: "uv-shade-ends" }, box);
		const fmt = (n: number) => (by === "area" ? Math.round(n).toLocaleString() : Math.round(n).toLocaleString());
		el("span", { text: fmt(this.shadeRange[0]) }, row);
		el("span", { text: fmt(this.shadeRange[1]) }, row);
	}

	/** The realm picked by a click, lit on the map with a card of what you can do with it. */
	private selectedRealm?: string;
	/** The area last clicked to pick a realm: what the card's Delete removes. */
	private clickedArea?: { key: string; n: number };

	selectRealm(key: string | undefined) {
		this.selectedRealm = key;
		this.root.querySelector(".uv-map-picked")?.remove();
		const tiers = this.tiers;
		for (const a of this.areaPolys) {
			const path = a.poly.getElement() as HTMLElement | undefined;
			const shown = (tiers && shownAs(a.chain, tiers)) || a.owner;
			path?.toggleClass("is-picked", !!key && (shown === key || a.owner === key));
		}
		const e = key ? this.plugin.index.get(key) : undefined;
		if (!e || this.embedded) return;
		// The inspector follows the pick, when it's open.
		const insp = this.plugin.app.workspace.getLeavesOfType("chronicle-inspector")[0];
		(insp?.view as unknown as { show?: (k: string) => void } | undefined)?.show?.(e.key);
		const node = this.realmTree?.nodes.get(e.key) ?? this.plugin.realms(this.options.at).nodes.get(e.key);
		const card = el("div", { cls: "uv-map-picked" }, this.root);
		card.style.setProperty("--terr-color", entityColor(this.plugin, e));
		const head = el("div", { cls: "uv-map-picked-head" }, card);
		el("strong", { text: nameAt(e, this.options.at) }, head);
		const sub = [tierLabel(node), node?.holder ? `held by ${node.holder.name}` : "", node?.under ? `under ${this.plugin.index.get(node.under)?.name ?? ""}` : ""].filter(Boolean).join(" · ");
		if (sub) el("div", { cls: "uv-map-picked-sub", text: sub }, card);
		const row = el("div", { cls: "uv-map-picked-actions" }, card);
		const act = (ic: string, label: string, run: () => void) => {
			const b = el("button", { attr: { "aria-label": label } }, row);
			icon(el("span", {}, b), ic);
			el("span", { text: label }, b);
			b.addEventListener("click", (evt) => {
				evt.stopPropagation();
				run();
			});
		};
		// Delete: the area that was clicked, at once (Undo puts it back). The Delete key does the same.
		const hit = this.clickedArea;
		const hitOwner = hit ? this.plugin.index.get(hit.key) : undefined;
		const remove = () => {
			if (!hit) return;
			this.selectRealm(undefined);
			void this.plugin.deleteArea(hit.key, this.options.map, hit.n);
		};
		if (hit && hitOwner) {
			const del = el("button", { cls: "uv-map-picked-delete", attr: { "aria-label": `Delete this area of ${hitOwner.name} (Delete key)` } }, row);
			icon(el("span", {}, del), "trash-2");
			el("span", { text: hitOwner.key === e.key ? "Delete area" : `Delete ${hitOwner.name}'s area` }, del);
			del.addEventListener("click", (evt) => {
				evt.stopPropagation();
				remove();
			});
			const onKey = (evt: KeyboardEvent) => {
				if (!card.isConnected) {
					document.removeEventListener("keydown", onKey, true);
					return;
				}
				if ((evt.key !== "Delete" && evt.key !== "Backspace") || this.mode !== "none") return;
				if ((evt.target as HTMLElement)?.closest?.("input, textarea, [contenteditable='true']") || document.querySelector(".modal-container")) return;
				evt.preventDefault();
				evt.stopPropagation();
				document.removeEventListener("keydown", onKey, true);
				remove();
			};
			document.addEventListener("keydown", onKey, true);
		}
		if (this.canSplit(e.key)) act("zoom-in", "Split", () => this.drillTo(e.key));
		if (node?.under && this.tierBounds.has(node.under)) act("zoom-out", this.plugin.index.get(node.under)?.name ?? "Up", () => {
			this.showWhole(node.under!);
			this.selectRealm(node.under);
		});
		// Its borders on this map, in the territory editor.
		const first = this.areasHere(e)[0];
		if (first) act("pencil-ruler", "Edit", () => this.openTerritoryEditor(e, first.n));
		act("panel-right", "Inspect", () => void this.plugin.inspect(e.key, "edit"));
		act("file-text", "Open", () => openEntity(this.plugin, e.key));
		const close = el("button", { cls: "clickable-icon", attr: { "aria-label": "Clear" } }, head);
		icon(close, "x");
		close.addEventListener("click", (evt) => {
			evt.stopPropagation();
			this.selectRealm(undefined);
		});
	}

	/** Whether a realm's own areas cover this area (its middle lies inside one of them). */
	private coveredBy(points: [number, number][], key: string): boolean {
		if (!points.length) return false;
		const mid: P2 = [points.reduce((s, p) => s + p[0], 0) / points.length, points.reduce((s, p) => s + p[1], 0) / points.length];
		return this.drawnAreas.some((a) => a.key === key && inRing(mid, a.points));
	}

	/** Shows each area as the title it belongs to at this zoom: whole, merged into its realm, or as an outline. */
	private applyTiers() {
		const tree = this.realmTree;
		const split = this.plugin.settings.tierSplitPx || 420;
		this.tiers = tree
			? visibleTiers({ roots: tree.roots, children: (k) => tree.nodes.get(k)?.children ?? [], hasLand: (k) => this.tierBounds.has(k), size: (k) => this.tierSize(k) }, split)
			: undefined;
		const tiers = this.tiers;
		// Which realms show changes with the zoom: so does the range the shading spans.
		this.shadeRange = undefined;
		// A split-open land whose lands within cover only part of it (a county with one barony in a
		// corner) keeps the rest: it stays filled and named underneath them, not just an outline.
		const mostlyCovered = this.coverCache;
		const covered = (key: string): boolean => {
			let v = mostlyCovered.get(key);
			if (v === undefined) {
				// Measured where they actually lie: a sub-land drawn beside its liege covers none of it.
				const own = this.areaPolys.filter((x) => x.owner === key).map((x) => x.points as P2[]);
				const subs = this.areaPolys.filter((x) => x.owner !== key && x.chain.includes(key)).map((x) => x.points as P2[]);
				const inside = own.length ? gridIn(boxOf(own.flat()), 24).pts.filter((p) => own.some((r) => inRing(p, r))) : [];
				const hit = inside.filter((p) => subs.some((r) => inRing(p, r))).length;
				mostlyCovered.set(key, (v = !inside.length || hit >= inside.length * 0.7));
			}
			return v;
		};
		for (const a of this.areaPolys) {
			const path = a.poly.getElement() as HTMLElement | undefined;
			if (!path) continue;
			const label = (a.poly as L.Polygon & { _label?: HTMLElement })._label;
			let state: "own" | "merged" | "hidden" | "outline" = "own";
			let color = a.color;
			if (tiers && tree?.nodes.has(a.owner)) {
				const shown = shownAs(a.chain, tiers);
				// Its own land shows when it's split open but its lands don't fill it; otherwise just its border.
				if (!shown) state = tiers.divided.has(a.owner) && a.chain.every((k) => k === a.owner || tiers.divided.has(k)) && !covered(a.owner) ? "own" : "outline";
				else if (shown !== a.owner) {
					// Under a realm shown whole: hidden by the realm's own area, or painted in its colour.
					// Hidden only where the realm's own area covers it; a land split off it has no cover, so it shows in the realm's colour.
					state = this.ownLand.has(shown) && this.coveredBy(a.points, shown) ? "hidden" : "merged";
					const se = this.plugin.index.get(shown);
					if (se) color = entityColor(this.plugin, se);
				}
			}
			// The map mode: by realm (as above), title, house, culture or faith.
			color = this.paintColor(a, (tiers && shownAs(a.chain, tiers)) || a.owner, color);
			// Shaded by a statistic: the realm it shows as, from light (least) to dark (most).
			if (this.options.shadeBy) color = this.shade((tiers && shownAs(a.chain, tiers)) || a.owner) ?? color;
			path.style.setProperty("--terr-color", color);
			// Several cultures or faiths on one land: stripes of each.
			this.stripeFill(path, this.options.shadeBy ? [] : this.paintColors((tiers && shownAs(a.chain, tiers)) || a.owner));
			// Its edge and texture are those of the tier it shows as: a county inside a kingdom shown whole wears the kingdom's texture.
			const asNode = tree?.nodes.get((tiers && shownAs(a.chain, tiers)) || a.owner);
			const look = styleFor(this.plugin, tierNumber(asNode?.rank, asNode?.nature));
			const ov = a.overlay?.getElement() as HTMLElement | undefined;
			if (ov) {
				if (asNode) ov.setAttribute("class", `uv-terr-overlay uv-edge-${look.edge ?? "plain"} ${tierClass(asNode?.rank, asNode?.nature)}`);
				ov.style.setProperty("--terr-color", color);
				ov.toggleClass("is-tier-hidden", state === "hidden" || state === "outline");
				ov.toggleClass("is-tier-merged", state === "merged");
			}
			const tex = a.texture?.getElement() as HTMLElement | undefined;
			if (tex) {
				if (asNode) tex.setAttribute("class", `uv-terr-texture uv-pat-${look.pattern ?? "flat"} ${tierClass(asNode?.rank, asNode?.nature)}`);
				tex.style.setProperty("--terr-color", color);
				tex.toggleClass("is-tier-hidden", state === "hidden" || state === "outline");
			}
			path.toggleClass("is-tier-hidden", state === "hidden");
			path.toggleClass("is-tier-merged", state === "merged");
			path.toggleClass("is-tier-outline", state === "outline");
			label?.toggleClass("is-tier-hidden", state !== "own");
			// Split open, its name moves into the part its sub-lands leave free.
			const spot = tiers?.divided.has(a.owner) ? a.openSpot : a.spot;
			if (spot && a.labelMarker && label) {
				const want = this.pointToLatLng(spot.p);
				if (!a.labelMarker.getLatLng().equals(want)) a.labelMarker.setLatLng(want);
				label.dataset.room = String(spot.room);
			}
		}
		for (const [k, m] of this.tierLabels) {
			m.el.toggleClass("is-tier-hidden", !tiers?.whole.has(k));
			// Sized like the other territory names, by how big the realm is on screen.
			const across = this.screenSize(k);
			m.el.dataset.across = String(Math.round(across));
			m.el.style.fontSize = `${Math.max(10, Math.min(30, (across * 1.3) / Math.max(4, m.el.textContent.length)))}px`;
		}
		// The picked realm stays lit as the tiers change (and through redraws).
		if (this.selectedRealm) {
			const key = this.selectedRealm;
			for (const a of this.areaPolys) {
				const shown = (tiers && shownAs(a.chain, tiers)) || a.owner;
				(a.poly.getElement() as HTMLElement | undefined)?.toggleClass("is-picked", shown === key || a.owner === key);
			}
		}
		this.drawStrategy();
		this.drawCrumbs();
	}

	// ---- Strategy look: map modes, realm borders, curved names ------------------------------------

	get strategy(): boolean {
		return this.options.style !== "atlas";
	}

	/** Colours each land by the map mode: its realm (the default), own title, ruling house, culture or faith. */
	private paintColor(a: { owner: string; color: string }, shown: string, realmColour: string): string {
		const mode = this.options.paint ?? "realm";
		if (mode === "realm" || mode === "terrain") return realmColour;
		if (mode === "title") return a.color;
		const idx = this.plugin.index;
		const node = this.realmTree?.nodes.get(shown);
		if (mode === "house") {
			const house = node?.house ? idx.get(node.house.key) : undefined;
			return house ? entityColor(this.plugin, house) : NO_GROUP;
		}
		return this.paintColors(shown)[0] ?? NO_GROUP;
	}

	/** Every culture or faith of a land (the realm's own, else its ruler's), as colours: several mean stripes. Empty in the other modes. */
	private paintColors(shown: string): string[] {
		const mode = this.options.paint ?? "realm";
		if (mode !== "culture" && mode !== "faith") return [];
		const idx = this.plugin.index;
		const e = idx.get(shown);
		const own = this.colorsOfGroups(e?.cultures ?? [], mode);
		if (own.length) return own;
		const holder = this.realmTree?.nodes.get(shown)?.holder;
		return this.colorsOfGroups(holder ? idx.get(holder.key)?.cultures ?? [] : [], mode);
	}

	private colorsOfGroups(refs: { ref: { key: string } }[], mode: PaintMode): string[] {
		const out: string[] = [];
		for (const r of refs) {
			const g = this.plugin.index.get(r.ref.key);
			if (g?.type === "culture" && groupKind(this.plugin, g) === mode) {
				const c = entityColor(this.plugin, g);
				if (!out.includes(c)) out.push(c);
			}
		}
		return out;
	}

	private stripePatterns = new Map<string, string>();

	/** Fills a land with equal stripes of each colour when it has several cultures or faiths; clears it otherwise. */
	private stripeFill(path: HTMLElement | SVGElement, colours: string[]) {
		const svgEl = (path as SVGElement).ownerSVGElement;
		if (colours.length < 2 || !svgEl) {
			path.setCssStyles({ fill: "" });
			return;
		}
		ensureTerritoryDefs(svgEl);
		const key = colours.join("|");
		let id = this.stripePatterns.get(key);
		if (!id || !svgEl.querySelector(`#${id}`)) {
			id = `uv-multi-${++this.terrSeq}`;
			this.stripePatterns.set(key, id);
			const n = colours.length;
			const pattern = createSvg("pattern");
			for (const [k, v] of Object.entries({ id, patternUnits: "userSpaceOnUse", width: String(10 * n), height: String(10 * n), patternTransform: "rotate(45)" })) pattern.setAttribute(k, v);
			colours.forEach((c, i) => {
				const rect = createSvg("rect");
				for (const [k, v] of Object.entries({ x: String(i * 10), y: "0", width: "10", height: String(10 * n) })) rect.setAttribute(k, v);
				rect.setCssStyles({ fill: c });
				pattern.appendChild(rect);
			});
			svgEl.querySelector("#uv-terr-defs")?.appendChild(pattern);
		}
		path.setCssStyles({ fill: `url(#${id})` });
	}

	/** Cached realm outlines and name curves, by realm and the shapes they were made from. */
	private realmShapes = new Map<string, { sig: string; shape: RealmShape; edges?: [number, number][][] }>();

	/**
	 * Strategy look: one thick border round every realm on screen (its whole and its lieges'), and
	 * each realm shown whole named across its land in spaced capitals, curved along its shape, with
	 * its arms when it has a logo. Political colours are solid from afar and thin out as you zoom in.
	 */
	private drawStrategy() {
		const map = this.map;
		const layer = this.strategyLayer;
		this.root.toggleClass("uv-strategy", this.strategy);
		for (const [m] of paintModes()) this.root.toggleClass(`uv-paint-${m}`, (this.options.paint ?? "realm") === m);
		if (!map || !layer) return;
		const tiers = this.tiers;
		const tree = this.realmTree;
		// Map units ↔ the y-down plane the shapes are worked out in (world maps store [lat, lng]).
		const toPlane = (p: [number, number]): P2 => (this.isImageMap ? [p[0], p[1]] : [p[1], -p[0]]);
		const fromPlane = (p: P2): L.LatLng => (this.isImageMap ? this.pointToLatLng([p[0], p[1]]) : L.latLng(-p[1], p[0]));
		// Screen pixels per map unit (measured over a long stretch: Leaflet rounds to whole pixels).
		const pxPerUnit = (p: P2) => map.latLngToContainerPoint(fromPlane(p)).distanceTo(map.latLngToContainerPoint(fromPlane([p[0] + 1000, p[1]]))) / 1000;
		// From afar the colours are solid, like a political map; close up the map shows through.
		const political = () => {
			const fit = this.isImageMap && this.imageWidth ? map.getBoundsZoom(L.latLngBounds([0, 0], [this.imageHeight, this.imageWidth]), false) : map.getMinZoom();
			const far = Math.max(0, Math.min(1, (fit + 2.2 - map.getZoom()) / 2.2));
			this.root.style.setProperty("--uv-political", far.toFixed(2));
		};
		// Names too small to read, or so big they're a pattern rather than a name, are hidden.
		const sizeNames = () => {
			for (const n of this.strategyNames) {
				const px = n.size * pxPerUnit(n.at);
				const el = n.overlay.getElement();
				if (el) el.style.display = px < 9 || px > 160 ? "none" : "";
			}
		};
		// Borders, bands and names are drawn in map units, so Leaflet moves and scales them with the map:
		// only when what's shown changes (the tiers, the look, the territories) are they drawn again. A
		// plain zoom just updates the colour's strength and which names fit (a full redraw on every zoom
		// was the slowest thing on the map).
		const sig = tiers && tree && this.strategy && this.options.showTerritories !== false
			? [[...tiers.whole].sort().join(","), [...tiers.divided].sort().join(","), this.options.paint ?? "realm", this.options.shadeBy ?? "", this.plugin.settings.realmBand ?? "soft", String(this.options.at ?? ""), String(this.drawVersion)].join("|")
			: "";
		if (sig && sig === this.strategySig) {
			political();
			sizeNames();
			return;
		}
		this.strategySig = sig;
		this.strategyNames = [];
		if (!sig || !tiers || !tree) {
			layer.clearLayers();
			this.mapEl.querySelectorAll("#uv-terr-defs .uv-realm-clip").forEach((c) => c.remove());
			this.strategyParts.clear();
			return;
		}
		political();
		// Each realm's drawing is kept and reused while it looks the same: when zooming splits one realm,
		// only that realm and its lands are drawn, not every realm on the map.
		const keep = new Set<string>();
		// Realms to outline: those shown whole, and every liege above them that's split open.
		const outlined = new Map<string, number>();
		for (const k of tiers.whole) {
			if (!this.tierBounds.has(k)) continue;
			const chain = chainOf(tree, k);
			chain.forEach((c, depth) => {
				if (this.tierBounds.has(c) && (tiers.whole.has(c) || tiers.divided.has(c))) outlined.set(c, Math.min(outlined.get(c) ?? 99, depth));
			});
		}
		// The map's size in plane units (the picture's pixels; degrees on the world map).
		const mapSpan = this.isImageMap && this.imageWidth ? Math.max(this.imageWidth, this.imageHeight) : 360;
		for (const [k, depth] of outlined) {
			const e = this.plugin.index.get(k);
			const node = tree.nodes.get(k);
			if (!e || node?.nature === "region") continue;
			const parts = this.areaPolys.filter((a) => a.chain.includes(k));
			if (!parts.length) continue;
			const realmName = nameAt(e, this.options.at);
			const colour = this.paintColor({ owner: k, color: entityColor(this.plugin, e) }, k, entityColor(this.plugin, e));
			// The name: for realms shown whole, and for realms split open whose own land still shows
			// (a county beside its own barony), named across that own land rather than the whole realm.
			const ownShows = tiers.divided.has(k) && this.ownLand.has(k) && this.coverCache.get(k) === false;
			// Drawn the same as last time (same tier, colour, name and shapes): kept as it is.
			const partKey = [k, depth, colour, tiers.whole.has(k) ? "whole" : ownShows ? "own" : "split", realmName, this.drawVersion].join("|");
			keep.add(partKey);
			const kept = this.strategyParts.get(partKey);
			if (kept) {
				this.strategyNames.push(...kept.names);
				continue;
			}
			const g = L.layerGroup().addTo(layer);
			const part: { group: L.LayerGroup; clip?: Element; names: { overlay: L.SVGOverlay; size: number; at: P2 }[] } = { group: g, names: [] };
			this.strategyParts.set(partKey, part);
			const cached = this.realmShapeOf(k, parts.map((a) => a.shown.map(toPlane)), realmName.length, mapSpan);
			const { shape } = cached;
			// Like the grand strategy games: a soft band of the realm's colour just inside its border, fading
			// inwards (top realm and the tier below), kept inside the realm by clipping to its own areas.
			const terrSvg = (parts[0].poly.getElement() as unknown as SVGElement | undefined)?.ownerSVGElement;
			if (depth <= 1 && terrSvg && this.plugin.settings.realmBand !== "off") {
				ensureTerritoryDefs(terrSvg);
				const clip = createSvg("clipPath");
				clip.id = `uv-realm-clip-${++this.terrSeq}`;
				clip.setAttribute("class", "uv-realm-clip");
				for (const a of parts) {
					const p = a.poly.getElement() as unknown as SVGElement | undefined;
					if (!p) continue;
					if (!p.id) p.id = `uv-terr-${++this.terrSeq}`;
					const use = createSvg("use");
					use.setAttribute("href", `#${p.id}`);
					clip.appendChild(use);
				}
				terrSvg.querySelector("#uv-terr-defs")?.appendChild(clip);
				part.clip = clip;
				// Three strokes, wide and faint to narrow, overlap into a fade: the look of a blur without
				// blurring (a blur filter redrawn on every zoom and pan was slow on big maps).
				// All of the realm's border stretches in one line per stroke (not one per stretch), simplified:
				// a soft band needn't follow every wiggle, and fewer lines and points redraw faster on zoom.
				const soft = (cached.edges ?? shape.outline).map((line) => simplifyOpen(line as Pt[], mapSpan * 0.0008).map((p) => fromPlane(p)));
				for (let i = 0; i < 3; i++) {
					const band = L.polyline(soft, { interactive: false, fill: false, className: `uv-realm-band depth-${depth} layer-${i}`, smoothFactor: 1.5 }).addTo(g);
					const be = band.getElement() as SVGElement | undefined;
					be?.style.setProperty("--terr-color", colour);
					be?.setAttribute("clip-path", `url(#${clip.id})`);
				}
			}
			// The realm's border: thickest for the top realm, thinner for each tier down.
			// One line for all of its stretches.
			const edge = L.polyline((cached.edges ?? shape.outline).map((line) => line.map(fromPlane)), { pane: "uv-realm-edges", interactive: false, fill: false, className: `uv-realm-edge depth-${Math.min(depth, 3)} ${tierClass(node?.rank, node?.nature)}`, smoothFactor: 1 }).addTo(g);
			(edge.getElement() as HTMLElement | undefined)?.style.setProperty("--terr-color", colour);
			if (!tiers.whole.has(k) && !ownShows) continue;
			let named = shape;
			if (!tiers.whole.has(k)) {
				const own = parts.filter((a) => a.owner === k).map((a) => (a.points).map(toPlane));
				const ownSig = `own|${realmName.length}|${own.map(shapeHash).join(",")}`;
				let ownCached = this.realmShapes.get(`${k}#own`);
				if (!ownCached || ownCached.sig !== ownSig) {
					const biggest = own.reduce((m, r) => (ringArea(r) > ringArea(m) ? r : m), own[0]);
					ownCached = { sig: ownSig, shape: realmShape(own, labelSpot(biggest).p, realmName.length) };
					this.realmShapes.set(`${k}#own`, ownCached);
				}
				named = ownCached.shape;
			}
			if (!named.curve) continue;
			const c = named.curve;
			const name = realmName.toUpperCase();
			const size = nameSize(name, c.length, c.thickness);
			const pad = size * 1.6;
			const xs = [c.from[0], c.ctrl[0], c.to[0]];
			const ys = [c.from[1], c.ctrl[1], c.to[1]];
			const box = { x0: Math.min(...xs) - pad, y0: Math.min(...ys) - pad * 1.8, x1: Math.max(...xs) + pad, y1: Math.max(...ys) + pad };
			const ns = "http://www.w3.org/2000/svg";
			const svgEl = document.createElementNS(ns, "svg");
			svgEl.setAttribute("xmlns", ns);
			svgEl.setAttribute("viewBox", `${box.x0} ${box.y0} ${box.x1 - box.x0} ${box.y1 - box.y0}`);
			svgEl.setAttribute("class", `uv-realm-name depth-${Math.min(depth, 3)}`);
			const id = `uv-name-${++this.terrSeq}`;
			const path = document.createElementNS(ns, "path");
			path.setAttribute("id", id);
			path.setAttribute("d", `M${c.from[0]},${c.from[1]} Q${c.ctrl[0]},${c.ctrl[1]} ${c.to[0]},${c.to[1]}`);
			path.setAttribute("fill", "none");
			svgEl.appendChild(path);
			const text = document.createElementNS(ns, "text");
			text.setAttribute("font-size", String(size));
			text.setAttribute("dy", String(size * 0.35));
			const tp = document.createElementNS(ns, "textPath");
			tp.setAttribute("href", `#${id}`);
			tp.setAttribute("startOffset", "50%");
			tp.setAttribute("text-anchor", "middle");
			// Spread the letters over the curve, as strategy maps do (never squeezed tighter than normal).
			const natural = name.length * size * 0.72;
			if (natural < c.length * 0.97) {
				tp.setAttribute("textLength", String(c.length * 0.97));
				tp.setAttribute("lengthAdjust", "spacing");
			}
			tp.textContent = name;
			text.appendChild(tp);
			svgEl.appendChild(text);
			// Its arms, above the middle of the name, when it has a logo (hidden with the name when too small).
			const logo = resourceUrl(this.plugin, e.logo);
			if (logo) {
				const mid: P2 = [0.25 * c.from[0] + 0.5 * c.ctrl[0] + 0.25 * c.to[0], 0.25 * c.from[1] + 0.5 * c.ctrl[1] + 0.25 * c.to[1]];
				const img = document.createElementNS(ns, "image");
				const s = size * 1.3;
				img.setAttribute("href", logo);
				img.setAttribute("x", String(mid[0] - s / 2));
				img.setAttribute("y", String(mid[1] - size * 0.9 - s));
				img.setAttribute("width", String(s));
				img.setAttribute("height", String(s));
				img.setAttribute("class", "uv-realm-arms");
				svgEl.appendChild(img);
			}
			const bounds = L.latLngBounds(fromPlane([box.x0, box.y0]), fromPlane([box.x1, box.y1]));
			const overlay = L.svgOverlay(svgEl, bounds, { pane: "uv-realm-names", interactive: false }).addTo(g);
			const drawn = { overlay, size, at: c.ctrl };
			part.names.push(drawn);
			this.strategyNames.push(drawn);
		}
		// Realms no longer shown this way (split open, merged, recoloured) are taken off.
		for (const [key, part] of this.strategyParts) {
			if (keep.has(key)) continue;
			layer.removeLayer(part.group);
			part.clip?.remove();
			this.strategyParts.delete(key);
		}
		sizeNames();
	}

	/** A realm's outline and name curve, worked out once per shape and kept (it's the slow part). */
	private realmShapeOf(k: string, rings: P2[][], nameLength: number, mapSpan: number): { sig: string; shape: RealmShape; edges?: [number, number][][] } {
		const sig = `${nameLength}|${rings.map(shapeHash).join(",")}`;
		let cached = this.realmShapes.get(k);
		if (!cached || cached.sig !== sig) {
			const biggest = rings.reduce((m, r) => (ringArea(r) > ringArea(m) ? r : m), rings[0]);
			const centre = labelSpot(biggest).p;
			// The border runs along the areas' own edges (where the realm's land is on one side only), so it
			// sits exactly on the territories' borders. The gridded shape is only for placing the name.
			const tol = mapSpan * 0.0012;
			cached = { sig, shape: realmShape(rings, centre, nameLength), edges: unionOutline(rings, tol, tol * 4) };
			this.realmShapes.set(k, cached);
		}
		return cached;
	}

	/**
	 * Works out every realm's outline in idle moments after the map is drawn, so zooming into a realm
	 * for the first time doesn't stall while its border is worked out.
	 */
	private prepareRealmShapes() {
		const version = this.drawVersion;
		const tree = this.realmTree;
		if (!tree || !this.strategy) return;
		const toPlane = (p: [number, number]): P2 => (this.isImageMap ? [p[0], p[1]] : [p[1], -p[0]]);
		const mapSpan = this.isImageMap && this.imageWidth ? Math.max(this.imageWidth, this.imageHeight) : 360;
		const todo = [...this.tierBounds.keys()].filter((k) => tree.nodes.get(k)?.nature !== "region");
		const idle = (f: () => void) => ((window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 50)))(f, { timeout: 400 });
		const step = () => {
			// A redraw since started: its own pass takes over.
			if (version !== this.drawVersion || !todo.length) return;
			const t0 = performance.now();
			while (todo.length && performance.now() - t0 < 12) {
				const k = todo.shift()!;
				const e = this.plugin.index.get(k);
				const parts = this.areaPolys.filter((a) => a.chain.includes(k));
				if (e && parts.length) this.realmShapeOf(k, parts.map((a) => a.shown.map(toPlane)), nameAt(e, this.options.at).length, mapSpan);
			}
			idle(step);
		};
		idle(step);
	}

	/** Each realm's border, band and name as drawn, kept while it looks the same (by realm, tier, colour, name). */
	private strategyParts = new Map<string, { group: L.LayerGroup; clip?: Element; names: { overlay: L.SVGOverlay; size: number; at: P2 }[] }>();

	/** What the strategy look was last drawn from, so a zoom that changes nothing else doesn't redraw it. */
	private strategySig = "";
	/** Realm names drawn, with their size, to show or hide as the zoom changes. */
	private strategyNames: { overlay: L.SVGOverlay; size: number; at: P2 }[] = [];
	/** Counts the territory redraws (new areas, new shapes), which the strategy look must follow. */
	private drawVersion = 0;

	/** Where you are: the titles split open around the middle of the map, each a way back out. */
	private drawCrumbs() {
		this.root.querySelector(".universeview-map-crumbs")?.remove();
		const tiers = this.tiers;
		const tree = this.realmTree;
		if (!tiers || !tree || !tiers.divided.size || !this.map || this.embedded) return;
		const c = this.map.getCenter();
		let deepest: string | undefined;
		for (const k of tiers.divided) {
			if (!this.tierBounds.get(k)?.contains(c)) continue;
			if (!deepest || tree.nodes.get(k)!.depth > tree.nodes.get(deepest)!.depth) deepest = k;
		}
		if (!deepest) return;
		const bar = el("div", { cls: "universeview-map-crumbs universeview-scope" }, this.root);
		const crumb = (text: string, run: () => void, key?: string) => {
			const b = el("button", { cls: "universeview-map-crumb", text }, bar);
			b.addEventListener("click", run);
			if (key) bindHover(this.plugin, b, key, this.root);
		};
		crumb("All", () => this.fit());
		for (const k of chainOf(tree, deepest)) {
			el("span", { cls: "universeview-map-crumb-sep", text: "›" }, bar);
			crumb(this.plugin.index.get(k)?.name ?? k, () => this.drillTo(k), k);
		}
	}

	/**
	 * Territory names scale with the area's size on screen and disappear when it's too small. Small
	 * areas themselves fade out as you zoom out (unless you can't zoom in any further), so a map of
	 * many provinces reads as its realms from afar.
	 */
	private sizeTerritoryLabels() {
		const map = this.map;
		if (!map || !this.territoryLayer) return;
		// With tiers, small areas show as their realm instead of fading.
		const limit = this.options.fadeSmall === false || (this.tiersOn && this.realmTree) ? 0 : this.plugin.settings.fadeAreaPx ?? 0;
		const atMax = map.getZoom() >= map.getMaxZoom() - 0.25;
		this.territoryLayer.eachLayer((l) => {
			const label = (l as L.Polygon & { _label?: HTMLElement })._label;
			if (!label || !(l instanceof L.Polygon)) return;
			const b = l.getBounds();
			const ne = map.latLngToContainerPoint(b.getNorthEast());
			const sw = map.latLngToContainerPoint(b.getSouthWest());
			const w = Math.abs(ne.x - sw.x);
			const h = Math.abs(ne.y - sw.y);
			// Sized to the open space round its spot when known (a wide land with a narrow middle), else its width.
			const room = Number(label.dataset.room);
			// Measured over a long stretch and scaled down: Leaflet rounds screen points to whole pixels.
			const roomPx = room > 0 ? (map.latLngToContainerPoint(this.pointToLatLng([room * 100, 0])).distanceTo(map.latLngToContainerPoint(this.pointToLatLng([0, 0]))) / 100) : 0;
			const across0 = roomPx > 0 ? Math.min(w, roomPx * 2.6) : w;
			const size = Math.max(9, Math.min(26, (across0 * 1.3) / Math.max(4, label.textContent.length)));
			label.style.fontSize = `${size}px`;
			label.toggleClass("is-tiny", w < 60);
			// Fully shown from `limit` pixels across (the geometric mean of width and height), gone at half that.
			const across = Math.sqrt(w * h);
			label.dataset.across = String(Math.round(across));
			const fade = !limit || atMax ? 1 : Math.max(0, Math.min(1, (across - limit / 2) / (limit / 2)));
			const path = l.getElement() as HTMLElement | undefined;
			if (path) {
				path.style.opacity = fade >= 1 ? "" : String(fade);
				path.classList.toggle("is-faded-out", fade < 0.2);
			}
			if (fade >= 1) label.style.removeProperty("--uv-fade");
			else label.style.setProperty("--uv-fade", String(Math.max(0, fade * 2 - 1)));
		});
	}

	// ---- Routes ------------------------------------------------------------------------------------

	/** Roads, rivers and sea lanes, styled by kind, with their length and travel time on hover. */
	private drawRoutes() {
		const layer = this.routeLayer;
		if (!this.map || !layer) return;
		layer.clearLayers();
		if (this.options.showRoutes === false) return;
		const idx = this.plugin.index;
		const at = this.options.at;
		for (const e of idx.all()) {
			if (!e.routes.length) continue;
			if (this.options.folder && !e.path.startsWith(this.options.folder + "/")) continue;
			if (at !== undefined && !idx.existsAt(e, at)) continue;
			if (!this.seen(e.key)) continue;
			const color = entityColor(this.plugin, e);
			for (const { t, n } of this.areasHere(e, "route")) {
				if (!this.shapeNow(t)) continue;
				const kind = t.kind ?? "road";
				let latlngs = t.points.map((p) => this.pointToLatLng(p));
				if (kind === "river" && t.points.length > 1) {
					// Water, not a line: curved, and widening from the source (first point) to the mouth (last),
					// in map units so it broadens as you zoom in. A short stream stays narrow.
					const course = smoothLine(t.points, 3);
					let len = 0;
					for (let i = 1; i < course.length; i++) len += Math.hypot(course[i][0] - course[i - 1][0], course[i][1] - course[i - 1][1]);
					const span = this.isImageMap && this.imageWidth ? Math.max(this.imageWidth, this.imageHeight) : 360;
					const wide = Math.max(0.25, Math.min(4, this.plugin.settings.riverWidth ?? 1));
				const mouth = Math.min(span * 0.009, len * 0.06) * wide;
					const water = L.polygon(ribbon(course, mouth * 0.25, mouth).map((p) => this.pointToLatLng(p)), { className: "uv-river-water", interactive: false, smoothFactor: 0.5 }).addTo(layer);
					water.bringToBack();
					latlngs = course.map((p) => this.pointToLatLng(p));
				}
				const line = L.polyline(latlngs, { className: `universeview-route kind-${kind}`, weight: kind === "river" ? 1.5 : kind === "sea" ? 3 : kind === "path" ? 2 : 3, smoothFactor: 1 }).addTo(layer);
				(line.getElement() as HTMLElement | undefined)?.style.setProperty("--route-color", color);
				const length = this.lineLength(latlngs);
				line.bindTooltip(() => {
					const box = el("div", { cls: "universeview-route-tip" });
					el("strong", { text: t.name ?? e.name }, box);
					el("div", { text: `${ROUTE_KINDS.find(([k]) => k === kind)?.[1] ?? kind} · ${this.formatDistance(length)}` }, box);
					const travel = this.travelText(length, kind);
					if (travel) el("div", { cls: "universeview-route-travel", text: travel }, box);
					return box;
				}, { sticky: true, className: "universeview-measure-tip", direction: "top", offset: [0, -8] });
				line.on("click", (evt: L.LeafletMouseEvent) => {
					if (this.mode !== "none") return;
					L.DomEvent.stop(evt);
					openEntity(this.plugin, e.key, evt.originalEvent);
				});
				line.on("contextmenu", (evt: L.LeafletMouseEvent) => {
					if (this.mode !== "none") return;
					L.DomEvent.stop(evt);
					showEntityMenu(this.plugin, e.key, evt.originalEvent, {
						top: (menu) => {
							menu.addItem((it) => it.setTitle("Edit this route").setIcon("pencil").onClick(() => this.startEdit(e.key, n, "route")));
							menu.addItem((it) => it.setTitle("Draw another route").setIcon("route").onClick(() => this.startRoute(e.key)));
						},
						danger: (menu) =>
							warningItem(menu, "Delete this route", "trash-2", () => {
								void this.plugin.saveShapes("route", e.key, this.options.map, n, null).then(() => new Notice(`Removed a route of ${e.name}. Undo puts it back.`));
							}),
					});
				});
			}
		}
	}

	/** A soft glow around places where events happened, stronger where more did. */
	private drawHeat() {
		const layer = this.heatLayer;
		if (!this.map || !layer) return;
		layer.clearLayers();
		this.root.toggleClass("has-heat", !!this.options.heatmap);
		if (!this.options.heatmap) return;
		const byPlace = this.eventsByPlace();
		const idx = this.plugin.index;
		let max = 1;
		const spots: { ll: L.LatLngExpression; n: number }[] = [];
		for (const place of idx.all("place")) {
			// Count only the place's own events, not those of places inside it, so regions don't swamp cities.
			const own = (byPlace.get(place.key) ?? []).filter((ev) => ev.places.some((p) => p.key === place.key)).length;
			const ll = own ? this.toLatLng(place) : null;
			if (!ll) continue;
			if (this.options.folder && !place.path.startsWith(this.options.folder + "/")) continue;
			spots.push({ ll, n: own });
			max = Math.max(max, own);
		}
		for (const s of spots) {
			const strength = Math.sqrt(s.n / max);
			const size = Math.round(70 + 170 * strength);
			const d = el("div", { cls: "universeview-heat-spot" });
			d.style.setProperty("--heat", String(0.35 + 0.65 * strength));
			d.style.width = d.style.height = `${size}px`;
			L.marker(s.ll, { icon: L.divIcon({ html: d, className: "universeview-heat-wrap", iconSize: [0, 0] }), pane: "universeview-heat", interactive: false, keyboard: false }).addTo(layer);
		}
	}

	private lineLength(pts: L.LatLng[]): number {
		let d = 0;
		for (let i = 1; i < pts.length; i++) d += this.distance(pts[i - 1], pts[i]);
		return d;
	}

	/** A distance in the map's own units (image maps with a scale) or km / miles. */
	private formatDistance(d: number): string {
		if (!this.isImageMap) return d >= 1000 ? `${(d / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })} km` : `${Math.round(d)} m`;
		const scale = this.mapScale();
		if (!scale) return `${Math.round(d).toLocaleString()} px`;
		return `${(d * scale.perPx).toLocaleString(undefined, { maximumFractionDigits: 1 })} ${scale.unit}`;
	}

	/**
	 * "4 days on foot · 2 days by horse". Uses the map note's `travel:` (e.g. `foot 25, horse 50,
	 * ship 150`, per day in the map's units) or typical speeds when the map's unit is a real one.
	 */
	travelText(d: number, kind: string): string | undefined {
		let km: number | undefined;
		let unitsPerDay: [string, number][] | undefined;
		const custom = this.isImageMap ? this.plugin.index.get(this.options.map)?.props.travel : undefined;
		if (this.isImageMap) {
			const scale = this.mapScale();
			if (!scale) return undefined;
			const units = d * scale.perPx;
			if (typeof custom === "string" && custom.trim()) {
				unitsPerDay = custom.split(",").map((part) => {
					const m = part.trim().match(/^(.*?)\s*([\d.]+)$/);
					return m ? ([m[1].trim() ? (/^(by|on) /i.test(m[1].trim()) ? m[1].trim() : `${/foot|walk/i.test(m[1]) ? "on" : "by"} ${m[1].trim()}`) : "", +m[2]] as [string, number]) : null;
				}).filter((x): x is [string, number] => !!x && x[1] > 0);
				return unitsPerDay.map(([how, speed]) => `${days(units / speed)} ${how}`.trim()).join(" · ");
			}
			const perUnit = kmPerUnit(scale.unit);
			if (!perUnit) return undefined;
			km = units * perUnit;
		} else km = d / 1000;
		const modes = TRAVEL_KM_PER_DAY[kind] ?? TRAVEL_KM_PER_DAY.road;
		if (!km || !Number.isFinite(km)) return undefined;
		return modes.map(([how, speed]) => `${days(km / speed)} ${how}`).join(" · ");
	}

	// ---- Tools: paint, edit, measure ------------------------------------------------------------

	private showBanner(text: string, buttons: { label: string; cta?: boolean; run: () => void }[] = [], extra?: (b: HTMLElement) => void) {
		this.banner?.remove();
		const b = el("div", { cls: "universeview-map-banner universeview-map-toolbar-banner" + (buttons.length ? " has-actions" : "") }, this.root);
		el("span", { cls: "universeview-banner-text", text: Platform.isMobile ? touchHelp(text) : text }, b);
		L.DomEvent.disableClickPropagation(b);
		extra?.(b);
		for (const btn of buttons) {
			const x = el("button", { cls: btn.cta ? "mod-cta" : "", text: btn.label }, b);
			x.addEventListener("click", (evt) => {
				evt.stopPropagation();
				btn.run();
			});
		}
		this.banner = b;
	}

	/** Call after endMode() and after creating the tool's layers. */
	/** Roughened borders go back to their editable corners while a tool is open, and wobble again after. */
	private showRough(on: boolean) {
		for (const a of this.areaPolys) {
			if (a.shown.length === a.points.length) continue;
			const ll = (on ? a.shown : a.points).map((p) => this.pointToLatLng(p));
			a.poly.setLatLngs(ll);
			a.overlay?.setLatLngs(ll);
			a.texture?.setLatLngs(ll);
		}
	}

	private beginMode(mode: Mode, onKey: (evt: KeyboardEvent) => void) {
		if (this.mode === "none") this.showRough(false);
		this.mode = mode;
		this.root.addClass("is-tool");
		const key = (evt: KeyboardEvent) => {
			if (!this.root.isConnected) return;
			// A form or dialog open over the map (naming a split land, say), or typing in a field:
			// its keys are its own, not the tool's (Enter isn't "cut", Backspace isn't "undo a point").
			const target = evt.target as HTMLElement | null;
			if (document.querySelector(".modal-container") || target?.closest?.("input, textarea, select, [contenteditable='true']")) return;
			onKey(evt);
		};
		document.addEventListener("keydown", key, true);
		this.modeCleanup.push(() => document.removeEventListener("keydown", key, true));
		this.plugin.hoverCards?.hide(true);
		this.onModeChange?.(mode);
	}

	endMode() {
		this.modeDone = undefined;
		for (const f of this.modeCleanup.splice(0)) f();
		this.toolLayer?.clearLayers();
		this.banner?.remove();
		this.banner = undefined;
		this.root.removeClass("is-painting", "is-filling", "is-editing", "is-measuring", "is-tool");
		if (this.map) {
			this.map.dragging.enable();
			this.map.doubleClickZoom.enable();
		}
		const was = this.mode;
		this.mode = "none";
		if (was !== "none") {
			this.showRough(true);
			this.onModeChange?.("none");
		}
	}

	/** Other areas' outlines, as map positions, for snapping (optionally leaving one area out). */
	private snapTargets(except?: { key: string; n: number }): L.LatLng[][] {
		return this.drawnAreas.filter((a) => !(except && a.key === except.key && a.n === except.n)).map((a) => a.points.map((p) => this.pointToLatLng(p)));
	}

	/**
	 * Pulls a position onto a nearby corner or edge of another area (within 10 screen pixels), or else,
	 * on an image map with "Snap to coasts and rivers" on, onto the coast or a river in the picture
	 * (within 12). Alt turns snapping off.
	 */
	private snapLatLng(ll: L.LatLng, targets: L.LatLng[][], evt?: MouseEvent, water = true): SnapAt | null {
		const map = this.map;
		if (!map || evt?.altKey) return null;
		const c = map.latLngToContainerPoint(ll);
		if (targets.length) {
			const shapes = targets.map((s) => s.map((q) => {
				const p = map.latLngToContainerPoint(q);
				return [p.x, p.y] as Pt;
			}));
			const s = snapPoint([c.x, c.y], shapes, 10);
			// A corner snaps exactly onto the neighbour's corner, not wherever it falls on screen.
			if (s) return { ll: s.kind === "vertex" ? targets[s.shape][Math.round(s.at)] : map.containerPointToLatLng(L.point(s.p[0], s.p[1])), kind: s.kind, shape: s.shape, at: s.at };
		}
		return water ? this.snapWater(ll) : null;
	}

	/** The coast and rivers read from the map's picture, for snapping borders onto (see waterLines). */
	private water?: WaterMask;
	/** The same for just what's in view, read at screen detail (far finer than the whole map's copy). */
	private waterView?: WaterMask;
	private waterLoading?: string;
	/** The sea's colour, read from the edge of the whole map (a view of land alone has no sea at its edge). */
	private seaColor?: [number, number, number];

	/** Reads the coast and rivers from the picture in the background when snapping to them is on: the whole map once, and what's in view each time the map stops moving. */
	private prepareWater() {
		const key = this.options.map;
		const map = this.map;
		if (!this.isImageMap || !map || this.plugin.settings.snapWater === false) return;
		const view = debounce(() => void this.readViewWater(), 200, true);
		map.on("moveend", view);
		this.modeCleanup.push(() => map.off("moveend", view));
		if (this.water?.map === key) {
			view();
			return;
		}
		if (this.waterLoading === key) return;
		this.waterLoading = key;
		void this.loadRaster()
			.then((r) => {
				if (!r || this.options.map !== key) return;
				// A moment later, so the tool's banner and first clicks aren't held up.
				window.setTimeout(() => {
					if (this.options.map !== key) return;
					this.seaColor = edgeColor(r.img);
					this.water = { map: key, mask: waterLines(r.img, { sea: this.seaColor }), w: r.img.width, h: r.img.height, scale: r.scale, ox: 0, oy: 0 };
					void this.readViewWater();
				}, 30);
			})
			.catch((err) => console.error("UniverseView: reading coasts and rivers", err))
			.finally(() => this.waterLoading === key && (this.waterLoading = undefined));
	}

	/** The coast and rivers of what's in view, at screen detail. */
	private async readViewWater() {
		const key = this.options.map;
		if (this.plugin.settings.snapWater === false || !this.seaColor) return;
		const r = await this.detailRaster().catch(() => null);
		if (!r || this.options.map !== key) return;
		this.waterView = { map: key, mask: waterLines(r.img, { sea: this.seaColor }), w: r.img.width, h: r.img.height, scale: r.scale, ox: r.ox, oy: r.oy };
	}

	/** The finest water mask covering a position: the view's, else the whole map's. */
	private waterAt(x: number, y: number): WaterMask | undefined {
		const v = this.waterView;
		if (v && v.map === this.options.map && x >= v.ox && y >= v.oy && x < v.ox + v.w * v.scale && y < v.oy + v.h * v.scale) return v;
		return this.water?.map === this.options.map ? this.water : undefined;
	}

	/** The nearest coast or river to a position, within 12 screen pixels. */
	private snapWater(ll: L.LatLng): { ll: L.LatLng; kind: "water" } | null {
		const map = this.map;
		if (!map || this.plugin.settings.snapWater === false) return null;
		const [x, y] = this.fromLatLng(ll);
		const wl = this.waterAt(x, y);
		if (!wl) return null;
		// Screen pixels per mask pixel, so the reach is the same on screen at any zoom.
		const step = map.latLngToContainerPoint(this.pointToLatLng([x + wl.scale * 100, y])).x - map.latLngToContainerPoint(ll).x;
		const perCell = Math.abs(step) / 100 || 1;
		const radius = Math.max(1, Math.min(40, Math.round(12 / perCell)));
		const i = nearestSet(wl.mask, wl.w, wl.h, Math.floor((x - wl.ox) / wl.scale), Math.floor((y - wl.oy) / wl.scale), radius);
		if (i < 0) return null;
		const px = i % wl.w;
		const py = (i - px) / wl.w;
		return { ll: this.pointToLatLng([(px + 0.5) * wl.scale + wl.ox, (py + 0.5) * wl.scale + wl.oy]), kind: "water" };
	}

	/** Pictures read for detail work, by path (an overlay's own element can't always be read back). */
	private detailImages = new Map<string, Promise<HTMLImageElement | null>>();

	/**
	 * The picture as it's on screen now: what's in view, at about a picture pixel per screen pixel (never
	 * finer than the picture itself), for work that needs detail, like following a coast or filling a
	 * small region. `ox`/`oy` are where it starts on the map, `scale` the map units per pixel.
	 */
	private async detailRaster(): Promise<{ img: Raster; scale: number; ox: number; oy: number } | null> {
		const map = this.map;
		if (!map || !this.isImageMap || !this.imageWidth) return null;
		const size = map.getSize();
		const b = map.getBounds();
		const [ax, ay] = this.fromLatLng(b.getNorthWest());
		const [bx, by] = this.fromLatLng(b.getSouthEast());
		const x0 = Math.max(0, Math.min(ax, bx));
		const y0 = Math.max(0, Math.min(ay, by));
		const x1 = Math.min(this.imageWidth, Math.max(ax, bx));
		const y1 = Math.min(this.imageHeight, Math.max(ay, by));
		if (x1 - x0 < 2 || y1 - y0 < 2 || !size.x || !size.y) return null;
		const want = Math.max((x1 - x0) / size.x, (y1 - y0) / size.y);
		let src: CanvasImageSource | null = null;
		let srcW = 0;
		let srcH = 0;
		if (this.imageLayer instanceof TiledImageLayer) {
			const pyr = this.imageLayer.pyramid;
			// Zoomed in past the largest copy: read the full picture itself, as sharp as it's drawn.
			if (pyr.full && want < (pyr.width / pyr.levels[0].width) * 0.95) {
				const scale = Math.max(want, pyr.width / pyr.full.width);
				const w = Math.max(1, Math.round((x1 - x0) / scale));
				const h = Math.max(1, Math.round((y1 - y0) / scale));
				const canvas = createEl("canvas");
				canvas.width = w;
				canvas.height = h;
				const ctx = canvas.getContext("2d", { willReadFrequently: true });
				if (!ctx) return null;
				const k = pyr.full.width / pyr.width;
				await pyr.full.draw(ctx, x0 * k, y0 * k, (x1 - x0) * k, (y1 - y0) * k, 0, 0, w, h);
				return { img: { data: ctx.getImageData(0, 0, w, h).data, width: w, height: h }, scale: (x1 - x0) / w, ox: x0, oy: y0 };
			}
			const lv = levelFor(pyr, 1 / want);
			[src, srcW, srcH] = [lv.src, lv.width, lv.height];
		} else if (this.shownImage) {
			const path = this.shownImage;
			let p = this.detailImages.get(path);
			if (!p) {
				const url = resourceUrl(this.plugin, path);
				p = url ? loadImage(url) : Promise.resolve(null);
				this.detailImages.set(path, p);
			}
			const im = await p;
			if (im) [src, srcW, srcH] = [im, im.naturalWidth, im.naturalHeight];
		}
		if (!src || !srcW || !srcH) return null;
		const fx = srcW / this.imageWidth;
		const fy = srcH / this.imageHeight;
		const scale = Math.max(want, 1 / fx);
		const w = Math.max(1, Math.round((x1 - x0) / scale));
		const h = Math.max(1, Math.round((y1 - y0) / scale));
		const canvas = createEl("canvas");
		canvas.width = w;
		canvas.height = h;
		const ctx = canvas.getContext("2d", { willReadFrequently: true });
		if (!ctx) return null;
		ctx.drawImage(src, x0 * fx, y0 * fy, (x1 - x0) * fx, (y1 - y0) * fy, 0, 0, w, h);
		const data = ctx.getImageData(0, 0, w, h).data;
		return { img: { data, width: w, height: h }, scale: (x1 - x0) / w, ox: x0, oy: y0 };
	}

	/**
	 * The way between two snapped points along what they snapped to: a neighbour's border corner for
	 * corner, or the coast or river between them. Empty when there's nothing to follow (or following is off).
	 */
	private followBetween(a: SnapAt | undefined, b: SnapAt | undefined, targets: L.LatLng[][]): L.LatLng[] {
		if (!a || !b || this.plugin.settings.followEdges === false) return [];
		if (a.shape !== undefined && b.shape !== undefined) {
			// A corner shared by several lands lies on each of their borders, so the two points may have
			// snapped to different ones: follow the shortest border that both lie on.
			const pa = this.fromLatLng(a.ll);
			const pb = this.fromLatLng(b.ll);
			const eps = 1.5 * this.unitsPerPx(a.ll);
			let best: Pt[] | null = null;
			let bestLen = Infinity;
			for (const t of targets) {
				const ring = t.map((ll) => this.fromLatLng(ll));
				const na = nearestOnRing(pa, ring);
				const nb = nearestOnRing(pb, ring);
				if (na.d > eps || nb.d > eps) continue;
				const path = alongRing(ring, na.i + na.t, nb.i + nb.t);
				let len = 0;
				let prev = pa;
				for (const q of [...path, pb]) {
					len += Math.hypot(q[0] - prev[0], q[1] - prev[1]);
					prev = q;
				}
				if (len < bestLen) [best, bestLen] = [path, len];
			}
			if (best) return best.map((q) => this.pointToLatLng(q));
		}
		if (a.kind === "water" && b.kind === "water") {
			const pa = this.fromLatLng(a.ll);
			const pb = this.fromLatLng(b.ll);
			const wl = this.waterAt(pa[0], pa[1]);
			if (!wl || wl !== this.waterAt(pb[0], pb[1])) return [];
			const toMask = ([x, y]: Pt): Pt => [(x - wl.ox) / wl.scale, (y - wl.oy) / wl.scale];
			const path = traceMask(wl.mask, wl.w, wl.h, toMask(pa), toMask(pb), 1);
			return path ? path.map(([x, y]) => this.pointToLatLng([x * wl.scale + wl.ox, y * wl.scale + wl.oy])) : [];
		}
		return [];
	}

	/** The banner switch for snapping to coasts and rivers (image maps only). */
	private waterSwitch(b: HTMLElement) {
		if (!this.isImageMap) return;
		const s = this.plugin.settings;
		const sw = el("label", { cls: "uv-banner-switch", attr: { "aria-label": "Corners snap onto the coast and rivers in the map's picture" } }, b);
		const box = el("input", { attr: { type: "checkbox" } }, sw);
		box.checked = s.snapWater !== false;
		el("span", { cls: "uv-banner-switch-track" }, sw);
		el("span", { cls: "uv-banner-switch-text", text: "Snap to coasts and rivers" }, sw);
		box.addEventListener("change", () => {
			s.snapWater = box.checked;
			this.saveSoon();
			if (box.checked) this.prepareWater();
		});
	}

	/** A ring marker showing where a click would snap to. */
	private snapGhost(layer: L.LayerGroup): (at: { ll: L.LatLng; kind: string } | null) => void {
		const d = el("div", { cls: "universeview-snap-ghost" });
		const m = L.marker([0, 0], { icon: L.divIcon({ html: d, className: "universeview-vertex-wrap", iconSize: [0, 0] }), interactive: false, keyboard: false });
		return (at) => {
			if (!at) {
				m.remove();
				return;
			}
			d.className = `universeview-snap-ghost is-${at.kind}`;
			m.setLatLng(at.ll);
			if (!layer.hasLayer(m)) m.addTo(layer);
		};
	}

	/**
	 * One finger or the mouse drawing on the map. Pointer events, since a touch screen sends no mouse
	 * moves while a finger drags; a second finger leaves the map to Leaflet, to pinch and pan. `down`
	 * returns false to ignore a press.
	 */
	private onPointer(h: {
		down?: (ll: L.LatLng, pt: L.Point, evt: PointerEvent) => boolean | void;
		move?: (ll: L.LatLng, pt: L.Point, evt: PointerEvent, pressed: boolean) => void;
		up?: (ll: L.LatLng, pt: L.Point, evt: PointerEvent) => void;
		cancel?: () => void;
	}) {
		const map = this.map!;
		const box = map.getContainer();
		const fingers = new Set<number>();
		let active: number | null = null;
		const at = (evt: PointerEvent) => {
			const pt = map.mouseEventToContainerPoint(evt);
			return { pt, ll: map.containerPointToLatLng(pt) };
		};
		const onDown = (evt: PointerEvent) => {
			if (evt.button !== 0 || (evt.target as HTMLElement).closest(".leaflet-control, .universeview-map-banner, .uv-terr-editor")) return;
			fingers.add(evt.pointerId);
			if (fingers.size > 1) {
				// Two fingers: a pinch, not a stroke.
				if (active !== null) h.cancel?.();
				active = null;
				return;
			}
			const { pt, ll } = at(evt);
			if (h.down?.(ll, pt, evt) === false) return;
			active = evt.pointerId;
		};
		const onMove = (evt: PointerEvent) => {
			if (fingers.size > 1) return;
			const { pt, ll } = at(evt);
			h.move?.(ll, pt, evt, active === evt.pointerId);
		};
		const onUp = (evt: PointerEvent) => {
			fingers.delete(evt.pointerId);
			if (active !== evt.pointerId) return;
			active = null;
			const { pt, ll } = at(evt);
			h.up?.(ll, pt, evt);
		};
		const onCancel = (evt: PointerEvent) => {
			fingers.delete(evt.pointerId);
			if (active === evt.pointerId) h.cancel?.();
			active = null;
		};
		box.addEventListener("pointerdown", onDown);
		box.addEventListener("pointermove", onMove);
		window.addEventListener("pointerup", onUp);
		window.addEventListener("pointercancel", onCancel);
		this.modeCleanup.push(() => {
			box.removeEventListener("pointerdown", onDown);
			box.removeEventListener("pointermove", onMove);
			window.removeEventListener("pointerup", onUp);
			window.removeEventListener("pointercancel", onCancel);
		});
	}

	/**
	 * Drawing an outline, for New area and Expand: tap corners (each snaps onto a neighbour's border, the
	 * coast or a river, and the line from the corner before follows what both snapped to), or drag round
	 * freehand. `done` gets the outline and says whether that's the end of it.
	 */
	private drawLasso(o: { color: string; layer: L.LayerGroup; targets: L.LatLng[][]; dashed?: boolean; done: (pts: L.LatLng[]) => boolean }): { finish: () => void; undo: () => void } {
		const map = this.map!;
		const { layer, targets, color } = o;
		const shape = L.polygon([], { className: "universeview-territory is-draft" + (o.dashed ? " uv-grow-lasso" : ""), weight: 2, fillOpacity: o.dashed ? 0.12 : 0.15, interactive: false }).addTo(layer);
		const rubber = L.polyline([], { className: "universeview-draft-line", weight: 2, dashArray: "4 6", interactive: false }).addTo(layer);
		const dots = L.layerGroup().addTo(layer);
		// Each point, with how it came: tapped (and where it snapped), followed along a border, or freehand.
		const pts: { ll: L.LatLng; how: "tap" | "follow" | "free"; snap?: SnapAt }[] = [];
		// How many points each tap or stroke added, for Undo.
		const steps: number[] = [];
		const paint = () => {
			shape.setLatLngs(pts.map((p) => p.ll));
			for (const l of [shape, rubber]) (l.getElement() as HTMLElement | undefined)?.style.setProperty("--terr-color", color);
			dots.clearLayers();
			pts.forEach((p, i) => {
				if (p.how !== "tap") return;
				const d = el("div", { cls: "universeview-vertex" + (i === 0 ? " is-first" : "") });
				d.style.setProperty("--terr-color", color);
				L.marker(p.ll, { icon: L.divIcon({ html: d, className: "universeview-vertex-wrap", iconSize: [0, 0] }), interactive: false }).addTo(dots);
			});
		};
		const ghost = this.snapGhost(layer);
		const snapAt = (ll: L.LatLng, evt?: MouseEvent) => {
			const s = this.snapLatLng(ll, targets, evt);
			ghost(s);
			return s;
		};
		const lastSnap = () => pts[pts.length - 1]?.snap;
		const tap = (s: SnapAt | null, ll: L.LatLng) => {
			const between = s ? this.followBetween(lastSnap(), s, targets) : [];
			for (const p of between) pts.push({ ll: p, how: "follow" });
			pts.push({ ll: s?.ll ?? ll, how: "tap", snap: s ?? undefined });
			steps.push(between.length + 1);
			paint();
		};
		const finish = () => {
			if (pts.length < 3) {
				new Notice("An outline needs at least three points.");
				return;
			}
			// Closing it: the way back to the first corner follows the border or coast too.
			const closing = this.followBetween(lastSnap(), pts[0].snap, targets).map((ll) => ({ ll, how: "follow" as const }));
			const all = [...pts, ...closing];
			// Freehand runs are thinned; tapped corners and followed borders are kept exactly.
			const out: L.LatLng[] = [];
			let run: L.LatLng[] = [];
			const flush = () => {
				if (run.length > 4) out.push(...simplify(run.map((p) => map.latLngToLayerPoint(p)), 1.5).map((p) => map.layerPointToLatLng(p)));
				else out.push(...run);
				run = [];
			};
			for (const p of all) {
				if (p.how === "free") run.push(p.ll);
				else {
					flush();
					out.push(p.ll);
				}
			}
			flush();
			if (o.done(out)) return;
		};
		const undo = () => {
			const n = steps.pop() ?? 0;
			pts.splice(pts.length - n, n);
			paint();
		};
		let down: { pt: L.Point; ll: L.LatLng; snap: SnapAt | null; free: boolean; count: number } | null = null;
		this.onPointer({
			down: (ll, pt, evt) => {
				down = { pt, ll, snap: snapAt(ll, evt), free: false, count: 0 };
			},
			move: (ll, pt, evt, pressed) => {
				if (pressed && down) {
					if (!down.free && pt.distanceTo(down.pt) > 8) {
						// A drag: freehand from where it started (which snaps like a tap).
						down.free = true;
						ghost(null);
						const before = pts.length;
						tap(down.snap, down.ll);
						steps.pop();
						down.count = pts.length - before;
					}
					if (down.free) {
						const last = pts[pts.length - 1]?.ll;
						if (!last || map.latLngToContainerPoint(last).distanceTo(pt) > 6) {
							pts.push({ ll, how: "free" });
							down.count++;
							paint();
						}
					}
					rubber.setLatLngs([]);
					return;
				}
				const s = snapAt(ll, evt);
				rubber.setLatLngs(pts.length ? [pts[pts.length - 1].ll, s?.ll ?? ll] : []);
			},
			up: (_ll, pt) => {
				const d = down;
				down = null;
				if (!d) return;
				if (d.free) {
					steps.push(d.count);
					// Dragged all the way round: that's the outline.
					if (pts.length >= 6) finish();
					return;
				}
				// A tap near the first corner closes the outline.
				if (pts.length >= 3 && map.latLngToContainerPoint(pts[0].ll).distanceTo(pt) < 12) {
					finish();
					return;
				}
				tap(d.snap, d.ll);
			},
			cancel: () => {
				if (down?.free) steps.push(down.count);
				down = null;
			},
		});
		const onDbl = (evt: L.LeafletMouseEvent) => {
			L.DomEvent.stop(evt);
			// The double-click's own taps added the last corner twice.
			undo();
			finish();
		};
		map.on("dblclick", onDbl);
		this.modeCleanup.push(() => map.off("dblclick", onDbl));
		return { finish, undo };
	}

	/** The banner switch for following borders and coasts between snapped corners. */
	private followSwitch(b: HTMLElement) {
		const s = this.plugin.settings;
		const sw = el("label", { cls: "uv-banner-switch", attr: { "aria-label": "Between two corners that snapped to the same neighbour, or both to the coast, the line follows it instead of cutting straight across" } }, b);
		const box = el("input", { attr: { type: "checkbox" } }, sw);
		box.checked = s.followEdges !== false;
		el("span", { cls: "uv-banner-switch-track" }, sw);
		el("span", { cls: "uv-banner-switch-text", text: "Follow borders and coasts" }, sw);
		box.addEventListener("change", () => {
			s.followEdges = box.checked;
			this.saveSoon();
		});
	}

	/** Finishes the current tool as its Done button would. */
	private modeDone?: () => Promise<void>;
	private painter?: HTMLElement;

	/** A floating list of lands: pick one and paint, pick the next, with the last one saved on the way. */
	togglePainter() {
		if (this.painter) {
			this.painter.remove();
			this.painter = undefined;
			return;
		}
		const box = (this.painter = el("div", { cls: "uv-painter" }, this.root));
		L.DomEvent.disableClickPropagation(box);
		L.DomEvent.disableScrollPropagation(box);
		const head = el("div", { cls: "uv-painter-head" }, box);
		el("span", { text: "Paint a land" }, head);
		const close = el("button", { cls: "clickable-icon", attr: { "aria-label": "Close" } }, head);
		icon(close, "x");
		close.addEventListener("click", () => this.togglePainter());
		const find = el("input", { attr: { type: "search", placeholder: "Find a land…", spellcheck: "false" } }, box);
		const list = el("div", { cls: "uv-painter-list" }, box);
		const draw = () => {
			list.empty();
			const q = find.value.trim().toLowerCase();
			const lands = this.plugin.index.all().filter((e) => (e.type === "culture" || e.type === "place") && (q ? e.name.toLowerCase().includes(q) : this.areasHere(e).length));
			for (const e of lands.sort((a, b) => a.name.localeCompare(b.name)).slice(0, 60)) {
				const row = el("button", { cls: "uv-painter-row" }, list);
				el("span", { cls: "uv-painter-dot" }, row).style.setProperty("--dot", entityColor(this.plugin, e));
				el("span", { text: e.name }, row);
				row.addEventListener("click", () => void this.paintLand(e, row));
			}
			if (!lands.length) el("div", { cls: "universeview-dash-muted", text: q ? "No land by that name." : "Search for a land to start." }, list);
		};
		find.addEventListener("input", draw);
		draw();
	}

	private async paintLand(e: Entity, row: HTMLElement) {
		await this.modeDone?.();
		this.painter?.querySelectorAll(".is-active").forEach((x) => x.removeClass("is-active"));
		row.addClass("is-active");
		// The stroke just saved has to reach the index before the next land's borders are read.
		window.setTimeout(() => {
			const area = this.areasHere(e)[0];
			if (area) this.startBrush(e.key, area.n);
			else this.startPaint(e.key);
		}, 350);
	}

	/** Draw an area for a culture or place: tap corners, or drag round it freehand. */
	startPaint(ownerKey: string, front = false) {
		const map = this.map;
		const owner = this.plugin.index.get(ownerKey);
		if (!map || !owner || !this.toolLayer) return;
		this.endMode();
		const layer = this.toolLayer;
		const lasso = this.drawLasso({
			color: entityColor(this.plugin, owner),
			layer,
			targets: this.snapTargets(),
			done: (pts) => {
				const points = pts.map((ll) => this.fromLatLng(ll));
				this.endMode();
				if (front) this.askFrontDates(owner, points);
				else void this.plugin.saveTerritory(owner.key, this.options.map, null, points).then(() => new Notice(`Painted an area for ${owner.name}`));
				return true;
			},
		});
		this.beginMode("paint", (evt) => {
			if (evt.key === "Escape") this.endMode();
			else if (evt.key === "Enter") lasso.finish();
			else if (evt.key === "Backspace" || (evt.key === "z" && (evt.ctrlKey || evt.metaKey))) {
				evt.preventDefault();
				lasso.undo();
			} else return;
			evt.stopPropagation();
		});
		this.root.addClass("is-painting");
		map.dragging.disable();
		map.doubleClickZoom.disable();
		this.showBanner(`${front ? "Occupied area" : "New area"} for ${owner.name}: click corners, or drag round it · corners snap to neighbouring borders, coasts and rivers (hold Alt to stop), and the line between two follows them · Enter or double-click to finish · Backspace undoes`, [
			{ label: "Undo", run: lasso.undo },
			{ label: "Cancel", run: () => this.endMode() },
			{ label: "Finish", cta: true, run: lasso.finish },
		], (b) => {
			this.followSwitch(b);
			this.waterSwitch(b);
		});
		this.prepareWater();
	}

	/** Asks when ground was held, and keeps it. */
	private askFrontDates(owner: Entity, points: Pt[]) {
		const cal = this.plugin.calendars.get(owner.calendar);
		const start = this.options.at !== undefined ? formatDay(this.options.at, cal, "year") : "";
		new TextPrompt(this.plugin, `When did ${owner.name} hold this? (from – to)`, start, (v) => {
			const [from, to] = splitSpan(v);
			if ([from, to].some((d) => d && !parseDate(d, cal))) {
				new Notice(`Couldn't read "${v}" as dates. Try 1240 – 1241.`);
				this.askFrontDates(owner, points);
				return;
			}
			void this.plugin.saveFront(owner.key, this.options.map, points.map(([x, y]) => [round(x, 1), round(y, 1)]), from, to).then(() => new Notice(`Occupied area saved for ${owner.name}. It shows at those dates on the time slider.`));
		}).open();
	}

	/**
	 * The areas a land's new ground stops at: every other land's, but not its own lieges' or its own
	 * lands' (a duchy drawn whole, a barony inside a county), which overlap it by design.
	 */
	private wallsFor(ownerKey: string, n: number): Pt[][] {
		return this.wallAreas(ownerKey, n).map((a) => a.points);
	}

	private wallAreas(ownerKey: string, n: number) {
		const tree = this.realmTree;
		const above = new Set(tree ? chainOf(tree, ownerKey) : [ownerKey]);
		return this.drawnAreas.filter((a) => {
			if (a.key === ownerKey) return a.n !== n;
			if (above.has(a.key)) return false;
			return !(tree && chainOf(tree, a.key).includes(ownerKey));
		});
	}

	/** Strokes trimmed to the land in the map's picture: the sea stays clear, thin rivers don't count. */
	private async onLand(shapes: Pt[][]): Promise<Pt[][]> {
		if (!(await this.wetForCheck()) || !this.wet) return shapes;
		const { mask, w, h, scale } = this.wet;
		const painted = new Uint8Array(w * h);
		for (const poly of shapes) rasterize(painted, w, h, poly.map(([x, y]) => [x / scale, y / scale] as Pt));
		this.openSea ??= { map: this.options.map, thin: thinWater(mask, w, h) };
		if (this.openSea.map !== this.options.map) this.openSea = { map: this.options.map, thin: thinWater(mask, w, h) };
		const { thin } = this.openSea;
		for (let i = 0; i < painted.length; i++) if (mask[i] && !thin[i]) painted[i] = 0;
		const rings = traceOutlines(painted, w, h, 4).map((ring) => simplifyRing(ring, 0.9).map(([x, y]) => [round(x * scale, 1), round(y * scale, 1)] as Pt)).filter((r) => r.length >= 3);
		return rings;
	}
	private openSea?: { map: string; thin: Uint8Array };

	/** A banner switch for a yes-or-no setting of the brush. */
	private brushSwitch(b: HTMLElement, label: string, title: string, on: boolean, change: (v: boolean) => void) {
		const sw = el("label", { cls: "uv-banner-switch", attr: { "aria-label": title } }, b);
		const box = el("input", { attr: { type: "checkbox" } }, sw);
		box.checked = on;
		el("span", { cls: "uv-banner-switch-text", text: label }, sw);
		box.addEventListener("change", () => {
			change(box.checked);
			this.saveSoon();
		});
	}

	/** Map units per screen pixel at a position, at the current zoom. */
	private unitsPerPx(ll: L.LatLng): number {
		const map = this.map;
		if (!map) return 1;
		const c = map.latLngToContainerPoint(ll);
		const a = this.fromLatLng(map.containerPointToLatLng(c));
		const b = this.fromLatLng(map.containerPointToLatLng(L.point(c.x + 100, c.y)));
		return Math.hypot(b[0] - a[0], b[1] - a[1]) / 100;
	}

	/** The banner switch for keeping new ground off other lands. */
	private keepOffSwitch(b: HTMLElement) {
		const s = this.plugin.settings;
		const sw = el("label", { cls: "uv-banner-switch", attr: { "aria-label": "New ground stops at other lands' borders instead of covering them" } }, b);
		const box = el("input", { attr: { type: "checkbox" } }, sw);
		box.checked = s.keepOffOthers !== false;
		el("span", { cls: "uv-banner-switch-track" }, sw);
		el("span", { cls: "uv-banner-switch-text", text: "Keep off other lands" }, sw);
		box.addEventListener("change", () => {
			s.keepOffOthers = box.checked;
			this.saveSoon();
		});
	}

	/** Saves a grown (or trimmed) area, and any pieces that came apart from it as areas of their own. */
	private async saveGrown(owner: Entity, n: number, ring: Pt[], extra: Pt[][], what: string) {
		const r = (p: Pt[]) => this.tidyRing(p.map(([x, y]) => [round(x, 1), round(y, 1)] as Pt), { key: owner.key, n });
		await this.plugin.saveTerritory(owner.key, this.options.map, n, r(ring), extra.map(r));
		const more = extra.length ? `, plus ${extra.length} separate piece${extra.length === 1 ? "" : "s"} as area${extra.length === 1 ? "" : "s"} of its own` : "";
		new Notice(`${what}${more}. Undo puts it back.`);
	}

	/**
	 * Simplify, tried on first: corners within a few screen pixels of the line through their neighbours go, shown over
	 * the old outline (dashed) as you move the strength, and nothing is saved until Apply. One area (its neighbours'
	 * shared corners go with it, so borders stay matched), or every area on the map at once, which is what speeds up a
	 * map weighed down by detail.
	 */
	startSimplify(ownerKey: string, n: number) {
		const map = this.map;
		const owner = this.plugin.index.get(ownerKey);
		const area = owner && this.areasHere(owner).find((a) => a.n === n);
		if (!map || !owner || !area || !this.toolLayer) return;
		this.endMode();
		const layer = this.toolLayer;
		const before = area.t.points as Pt[];
		const k = this.unitsPerPx(map.getCenter());
		let px = this.plugin.settings.simplifyPx ?? 3;
		let all = false;
		const pool = this.drawnAreas.map((a) => ({ key: a.key, n: a.n, points: a.points }));
		let me = pool.findIndex((a) => a.key === ownerKey && a.n === n);
		if (me < 0) {
			pool.push({ key: ownerKey, n, points: before });
			me = pool.length - 1;
		}
		/** Each area that would change, with its new ring. Areas are taken one after another, each seeing what the last left. */
		const compute = () => {
			const work = pool.map((a) => a.points);
			for (const i of all ? pool.map((_, j) => j) : [me]) {
				const rest = pool.map((_, j) => j).filter((j) => j !== i);
				const res = simplifyShared(work[i], rest.map((j) => work[j]), px * k);
				work[i] = res.ring;
				res.others.forEach((o, x) => {
					if (o) work[rest[x]] = o;
				});
			}
			return pool.map((a, i) => ({ key: a.key, n: a.n, before: a.points, ring: work[i] })).filter((p) => p.ring !== p.before);
		};
		let plan = compute();
		const preview = L.layerGroup().addTo(layer);
		const count = el("span", { cls: "uv-simplify-count" });
		const redraw = () => {
			plan = compute();
			preview.clearLayers();
			if (!all) L.polygon(before.map((p) => this.pointToLatLng(p)), { className: "uv-simplify-orig", fill: false, interactive: false }).addTo(preview);
			for (const p of plan) {
				const shape = L.polygon(p.ring.map((q) => this.pointToLatLng(q)), { className: "universeview-territory is-draft", weight: 2, fillOpacity: 0.2, interactive: false }).addTo(preview);
				const ent = this.plugin.index.get(p.key);
				if (ent) (shape.getElement() as HTMLElement | undefined)?.style.setProperty("--terr-color", entityColor(this.plugin, ent));
				// Its corners, so it's clear how few are left to edit (one area; on a whole map they would be a crowd).
				if (!all && p.key === ownerKey && p.n === n) for (const q of p.ring) L.circleMarker(this.pointToLatLng(q), { radius: 3, className: "uv-simplify-corner", interactive: false }).addTo(preview);
			}
			const was = plan.reduce((s, p) => s + p.before.length, 0);
			const now = plan.reduce((s, p) => s + p.ring.length, 0);
			count.setText(
				!plan.length
					? "Nothing to simplify at this strength"
					: all
						? `${plan.length} area${plan.length === 1 ? "" : "s"} · ${was} → ${now} corners`
						: `${before.length} → ${plan.find((p) => p.key === ownerKey && p.n === n)?.ring.length ?? before.length} corners${plan.length > 1 ? ` · ${plan.length - 1} neighbour${plan.length === 2 ? "" : "s"} matched` : ""}`,
			);
		};
		const slow = debounce(redraw, 120, true);
		const done = async () => {
			if (!plan.length) return this.endMode();
			this.endMode();
			const r = (p: Pt[]) => p.map(([x, y]) => [round(x, 1), round(y, 1)] as Pt);
			const was = plan.reduce((s, p) => s + p.before.length, 0);
			const now = plan.reduce((s, p) => s + p.ring.length, 0);
			for (const p of plan) await this.plugin.saveShapes("territory", p.key, this.options.map, p.n, r(p.ring));
			new Notice(all ? `Simplified ${plan.length} area${plan.length === 1 ? "" : "s"}: ${was} → ${now} corners. Undo puts them back.` : `Simplified ${owner.name}: ${before.length} → ${plan.find((p) => p.key === ownerKey && p.n === n)?.ring.length ?? before.length} corners. Undo puts it back.`);
		};
		this.beginMode("simplify", (evt) => {
			if (evt.key === "Escape") this.endMode();
			else if (evt.key === "Enter") void done();
			else return;
			evt.stopPropagation();
		});
		this.showBanner(`Trying out simplify on ${owner.name}: corners that barely change the border go, real detail such as a coast stays · the old outline stays dashed · nothing is saved until Apply`, [
			{ label: "Cancel", run: () => this.endMode() },
			{ label: "Apply", cta: true, run: () => void done() },
		], (b) => {
			const controls = el("div", { cls: "universeview-fill-controls" }, b);
			b.addClass("has-fill-controls");
			this.slider(controls, "Strength", "How far off the line, in screen pixels, a corner may sit and still go", 1, 15, px, (v) => {
				px = v;
				this.plugin.settings.simplifyPx = v;
				this.saveSoon();
				if (all) slow();
				else redraw();
			});
			controls.appendChild(count);
			this.brushSwitch(b, "Every area on this map", "Try the same strength on every area at once, shared borders kept matched", false, (v) => {
				all = v;
				redraw();
			});
		});
		redraw();
	}

	/**
	 * Fewer corners in a ring about to be saved, by the "Simplify as I draw" strength (fill, brush and expand). Corners
	 * a neighbour shares stay, so no border is left parted from its neighbour.
	 */
	private tidyRing(ring: Pt[], own?: { key: string; n: number }): Pt[] {
		const px = this.plugin.settings.makeSimplifyPx ?? 2;
		if (px <= 0 || ring.length <= 6 || !this.map) return ring;
		const others = this.drawnAreas.filter((a) => !(own && a.key === own.key && a.n === own.n)).map((a) => a.points);
		const out = simplifyShared(ring, others, px * this.unitsPerPx(this.map.getCenter()), true).ring;
		return out.length >= 3 ? out : ring;
	}

	/** The "Simplify as I draw" slider for a drawing tool's banner. */
	private makeSimplifySlider(controls: HTMLElement, onChange?: () => void) {
		this.slider(controls, "Simplify", "Fewer corners in what you draw, so borders stay light: how far off the line, in screen pixels, a corner may sit and be dropped. 0 keeps every corner.", 0, 12, this.plugin.settings.makeSimplifyPx ?? 2, (v) => {
			this.plugin.settings.makeSimplifyPx = v;
			this.saveSoon();
			onChange?.();
		});
	}

	/**
	 * Expand an area: circle new land (click points, or drag round it) and it joins the same area, its
	 * outline grown to take it in. New ground stops at other lands' borders unless that's switched off.
	 */
	startExpand(ownerKey: string, n: number) {
		const map = this.map;
		const owner = this.plugin.index.get(ownerKey);
		const area = owner && this.areasHere(owner).find((a) => a.n === n);
		if (!map || !owner || !area || !this.toolLayer) return;
		this.endMode();
		const color = entityColor(this.plugin, owner);
		const layer = this.toolLayer;
		const before = area.t.points as Pt[];
		const base = L.polygon(before.map((p) => this.pointToLatLng(p)), { className: "universeview-territory is-draft", weight: 2, fillOpacity: 0.25, interactive: false }).addTo(layer);
		(base.getElement() as HTMLElement | undefined)?.style.setProperty("--terr-color", color);
		const lasso = this.drawLasso({
			color,
			layer,
			dashed: true,
			targets: this.snapTargets({ key: owner.key, n }),
			done: (pts) => {
				const shape = pts.map((ll) => this.fromLatLng(ll));
				// Pieces left apart smaller than this (slivers in the gaps between neighbours) are dropped.
				const k = this.unitsPerPx(pts[0]);
				const minPiece = Math.max((12 * k) ** 2, Math.abs(ringArea(shape)) * 0.02);
				const res = mergeInto(before, [shape], this.plugin.settings.keepOffOthers === false ? [] : this.wallsFor(owner.key, n), minPiece);
				if (!res) {
					new Notice("Couldn't join that shape to the area: try circling it again.");
					return false;
				}
				if (res.ring.length === before.length && !res.detached.length && res.ring.every((p, i) => p[0] === before[i][0] && p[1] === before[i][1])) {
					new Notice("Nothing new there: the land circled is already in the area, or another land's.");
					return false;
				}
				this.endMode();
				void this.saveGrown(owner, n, res.ring, res.detached, `Expanded ${owner.name}`);
				return true;
			},
		});
		this.beginMode("expand", (evt) => {
			if (evt.key === "Escape") this.endMode();
			else if (evt.key === "Enter") lasso.finish();
			else if (evt.key === "Backspace" || (evt.key === "z" && (evt.ctrlKey || evt.metaKey))) {
				evt.preventDefault();
				lasso.undo();
			} else return;
			evt.stopPropagation();
		});
		this.root.addClass("is-painting");
		map.dragging.disable();
		map.doubleClickZoom.disable();
		this.showBanner(`Expanding ${owner.name}: circle the new land (click corners, or drag round it) and it joins this same area · corners snap to neighbouring borders, coasts and rivers (hold Alt to stop), and the line between two follows them · Enter or double-click to finish · Backspace undoes`, [
			{ label: "Undo", run: lasso.undo },
			{ label: "Cancel", run: () => this.endMode() },
			{ label: "Finish", cta: true, run: lasso.finish },
		], (b) => {
			this.keepOffSwitch(b);
			this.followSwitch(b);
			this.waterSwitch(b);
		});
		this.prepareWater();
	}

	/**
	 * Brush an area: paint over land to add it to the same area, or rub land out of it. Each stroke
	 * joins on as you lift; Undo takes back a stroke; nothing is saved until Done. Space and drag (or two
	 * fingers) move the map meanwhile.
	 */
	startBrush(ownerKey: string, n: number) {
		const map = this.map;
		const owner = this.plugin.index.get(ownerKey);
		const area = owner && this.areasHere(owner).find((a) => a.n === n);
		if (!map || !owner || !area || !this.toolLayer) return;
		this.endMode();
		const s = this.plugin.settings;
		const color = entityColor(this.plugin, owner);
		const layer = this.toolLayer;
		const walls = this.wallsFor(owner.key, n);
		let working = area.t.points as Pt[];
		let extra: Pt[][] = [];
		const history: { ring: Pt[]; extra: Pt[][]; pushed: number }[] = [];
		const neighbours = this.wallAreas(owner.key, n);
		/** What's been brushed, to take off the neighbours when pushing. */
		const pushed: Pt[][] = [];
		let erase = false;
		let size = s.brushSize ?? 22;
		const shape = L.polygon([], { className: "universeview-territory is-draft", weight: 2, fillOpacity: 0.3, interactive: false }).addTo(layer);
		const pieces = L.layerGroup().addTo(layer);
		const stroke = L.polyline([], { className: "uv-brush-stroke", weight: size * 2, lineCap: "round", lineJoin: "round", interactive: false }).addTo(layer);
		const tip = el("div", { cls: "uv-brush-cursor" });
		const cursor = L.marker([0, 0], { icon: L.divIcon({ html: tip, className: "universeview-vertex-wrap", iconSize: [0, 0] }), interactive: false, keyboard: false });
		const style = () => {
			for (const l of [shape, stroke]) (l.getElement() as HTMLElement | undefined)?.style.setProperty("--terr-color", color);
			(stroke.getElement() as HTMLElement | undefined)?.classList.toggle("is-erasing", erase);
			tip.classList.toggle("is-erasing", erase);
			tip.style.width = tip.style.height = `${size * 2}px`;
			stroke.setStyle({ weight: size * 2 });
		};
		const redraw = () => {
			shape.setLatLngs(working.map((p) => this.pointToLatLng(p)));
			pieces.clearLayers();
			for (const piece of extra) {
				const pl = L.polygon(piece.map((p) => this.pointToLatLng(p)), { className: "universeview-territory is-draft", weight: 2, dashArray: "4 4", fillOpacity: 0.3, interactive: false }).addTo(pieces);
				(pl.getElement() as HTMLElement | undefined)?.style.setProperty("--terr-color", color);
			}
			style();
		};
		const apply = async (path: L.LatLng[]) => {
			// Map units per screen pixel where the stroke is (so the brush is the same size at any zoom).
			const k = this.unitsPerPx(path[0]);
			let shapes = brushShape(path.map((ll) => this.fromLatLng(ll)), size * k);
			if (!shapes.length) return;
			if (!erase && s.coastLock !== false && this.isImageMap) shapes = await this.onLand(shapes);
			if (!shapes.length) return;
			// Pieces apart smaller than half a dab of the brush are crumbs, not land.
			const minPiece = (size * k) ** 2 * 0.5;
			if (erase) {
				const res = cutFrom(working, shapes, minPiece);
				if (!res) {
					new Notice("That would rub out the whole area. To remove it, use Delete.");
					return;
				}
				history.push({ ring: working, extra, pushed: pushed.length });
				const kept = extra.flatMap((piece) => {
					const r = cutFrom(piece, shapes, minPiece);
					return r ? [r.ring, ...r.detached] : [];
				});
				working = tidyRing(res.ring, working, k * 0.8);
				extra = [...kept, ...res.detached];
			} else {
				// Strokes join the area, and any pieces painted apart earlier that they now reach.
				const res = mergeInto(working, [...shapes, ...extra], s.pushBorders || s.keepOffOthers === false ? [] : walls, minPiece);
				if (!res) return;
				history.push({ ring: working, extra, pushed: pushed.length });
				if (s.pushBorders) pushed.push(...shapes);
				working = tidyRing(res.ring, working, k * 0.8);
				extra = res.detached.map((d) => tidyRing(d, extra.flat(), k * 0.8));
			}
			redraw();
		};
		const undo = () => {
			const last = history.pop();
			if (!last) return;
			working = last.ring;
			extra = last.extra;
			pushed.length = last.pushed;
			redraw();
		};
		const done = async () => {
			if (!history.length) {
				this.endMode();
				return;
			}
			this.endMode();
			const spans = (ring: Pt[]) => [Math.min(...ring.map((p) => p[0])), Math.min(...ring.map((p) => p[1])), Math.max(...ring.map((p) => p[0])), Math.max(...ring.map((p) => p[1]))];
			const dabs = pushed.map(spans);
			const touched = neighbours.filter((a) => {
				const [ax, ay, bx, by] = spans(a.points);
				return dabs.some(([cx, cy, dx, dy]) => cx <= bx && dx >= ax && cy <= by && dy >= ay);
			});
			// One undo for the whole push: this land, and every border it moved.
			await this.plugin.undoGroup(`Brushed ${owner.name}`, async () => {
				await this.saveGrown(owner, n, working, extra, `Brushed ${owner.name}`);
				for (const a of touched) {
					const res = cutFrom(a.points, pushed, 1);
					if (!res || JSON.stringify(res.ring) === JSON.stringify(a.points)) continue;
					await this.plugin.saveTerritory(a.key, this.options.map, a.n, res.ring.map(([x, y]) => [round(x, 1), round(y, 1)] as Pt), res.detached.map((d) => d.map(([x, y]) => [round(x, 1), round(y, 1)] as Pt)));
				}
			});
		};
		this.modeDone = done;
		let panning = false;
		const onKeyUp = (evt: KeyboardEvent) => {
			if (evt.code !== "Space" || !panning) return;
			panning = false;
			map.dragging.disable();
			this.root.removeClass("is-brush-panning");
		};
		this.beginMode("brush", (evt) => {
			if (evt.key === "Escape") this.endMode();
			else if (evt.key === "Enter") void done();
			else if (evt.code === "Space") {
				// Hold Space to move the map with the mouse.
				evt.preventDefault();
				if (!panning) {
					panning = true;
					map.dragging.enable();
					this.root.addClass("is-brush-panning");
				}
			} else if (evt.key === "Backspace" || (evt.key === "z" && (evt.ctrlKey || evt.metaKey))) {
				evt.preventDefault();
				undo();
			} else if (evt.key === "[" || evt.key === "]") {
				size = Math.max(4, Math.min(120, Math.round(size * (evt.key === "]" ? 1.25 : 0.8))));
				s.brushSize = size;
				style();
			} else return;
			evt.stopPropagation();
		});
		document.addEventListener("keyup", onKeyUp, true);
		this.root.addClass("is-painting", "is-brushing");
		map.dragging.disable();
		map.doubleClickZoom.disable();
		this.showBanner(`Brushing ${owner.name}: paint over land to add it to this same area, or switch to Rub out to take land away · hold Space and drag to move the map · [ and ] change the size · Backspace undoes a stroke`, [
			{ label: "Undo", run: undo },
			{ label: "Cancel", run: () => this.endMode() },
			{ label: "Done", cta: true, run: () => void done() },
		], (b) => {
			const controls = el("div", { cls: "universeview-fill-controls" }, b);
			b.addClass("has-fill-controls");
			const mode = el("button", { cls: "universeview-banner-toggle", text: "Rub out", attr: { title: "Take land out of the area instead of adding it" } }, controls);
			mode.addEventListener("click", (evt) => {
				evt.stopPropagation();
				erase = !erase;
				mode.toggleClass("is-active", erase);
				style();
			});
			this.slider(controls, "Size", "How wide the brush is, on screen", 4, 120, size, (v) => {
				size = v;
				s.brushSize = v;
				style();
			});
			this.makeSimplifySlider(controls);
			this.keepOffSwitch(b);
			this.brushSwitch(b, "Push neighbours back", "Land brushed over leaves the neighbour, and both borders move", !!s.pushBorders, (v) => (s.pushBorders = v));
			if (this.isImageMap) this.brushSwitch(b, "Stay on land", "Paint over the sea is trimmed to the coast", s.coastLock !== false, (v) => (s.coastLock = v));
		});
		redraw();
		let path: L.LatLng[] | null = null;
		// Pointer events, so a finger brushes on a touch screen too (two fingers move the map).
		this.onPointer({
			down: (ll) => {
				if (panning) return false;
				path = [ll];
				stroke.setLatLngs(path);
				style();
				return true;
			},
			move: (ll, pt) => {
				cursor.setLatLng(ll);
				if (!layer.hasLayer(cursor)) cursor.addTo(layer);
				if (!path) return;
				const last = path[path.length - 1];
				if (map.latLngToContainerPoint(last).distanceTo(pt) < Math.max(2, size * 0.25)) return;
				path.push(ll);
				stroke.setLatLngs(path);
			},
			up: () => {
				if (!path) return;
				const p = path;
				path = null;
				stroke.setLatLngs([]);
				void apply(p);
			},
			cancel: () => {
				path = null;
				stroke.setLatLngs([]);
			},
		});
		this.modeCleanup.push(() => {
			document.removeEventListener("keyup", onKeyUp, true);
			this.root.removeClass("is-brushing", "is-brush-panning");
			this.saveSoon();
		});
	}

	/**
	 * Splits a land off an area: draw a line across it, pick the part that becomes the new land, name
	 * it. The new note goes under this one (inside its folder note), so zoomed out it shows as part of
	 * this one again, and zoomed in, as a land of its own.
	 */
	startSplit(ownerKey: string) {
		const map = this.map;
		const owner = this.plugin.index.get(ownerKey);
		if (!map || !owner || !this.toolLayer) return;
		const areas = this.areasHere(owner);
		if (!areas.length) {
			new Notice(`${owner.name} has no area on this map to split.`);
			return;
		}
		this.endMode();
		const color = entityColor(this.plugin, owner);
		const layer = this.toolLayer;
		const pts: L.LatLng[] = [];
		const line = L.polyline([], { className: "universeview-draft-line uv-split-line", weight: 3 }).addTo(layer);
		const rubber = L.polyline([], { className: "universeview-draft-line", weight: 2, dashArray: "4 6" }).addTo(layer);
		const paint = () => {
			line.setLatLngs(pts);
			(line.getElement() as HTMLElement | undefined)?.style.setProperty("--terr-color", color);
		};
		// Its outline, so it's clear what's being cut.
		for (const a of areas) {
			const outline = L.polygon(a.t.points.map((q) => this.pointToLatLng(q)), { className: "universeview-territory is-draft uv-split-target", weight: 2, fillOpacity: 0.08, interactive: false }).addTo(layer);
			(outline.getElement() as HTMLElement | undefined)?.style.setProperty("--terr-color", color);
		}
		const choose = (n: number, pieces: [P2[], P2[]]) => {
			map.off("mousemove", onMove);
			map.off("click", onClick);
			map.off("dblclick", onDbl);
			layer.clearLayers();
			// The smaller part is the likelier new land; both can be picked.
			const order = pieces[0].length && ringArea(pieces[0]) <= ringArea(pieces[1]) ? [0, 1] : [1, 0];
			order.forEach((k, rank) => {
				const poly = L.polygon(pieces[k].map((q) => this.pointToLatLng(q)), { className: "universeview-territory uv-split-piece" + (rank === 0 ? " is-suggested" : ""), weight: 2, fillOpacity: 0.3 }).addTo(layer);
				(poly.getElement() as HTMLElement | undefined)?.style.setProperty("--terr-color", rank === 0 ? "var(--interactive-accent)" : color);
				poly.on("click", (evt: L.LeafletMouseEvent) => {
					L.DomEvent.stop(evt);
					const mine = pieces[1 - k];
					const theirs = pieces[k];
					splitNameSheet(this.plugin, owner, (name) => {
						this.endMode();
						void this.plugin.splitLand(owner.key, this.options.map, n, mine, theirs, name);
					});
				});
			});
			this.showBanner(`Click the part that becomes the new land (the highlighted one is suggested). ${owner.name} keeps the other.`, [{ label: "Cancel", run: () => this.endMode() }]);
		};
		const finish = () => {
			if (pts.length < 2) {
				new Notice("Draw a line across the area: at least two points.");
				return;
			}
			const cut = pts.map((ll) => this.fromLatLng(ll));
			for (const a of areas) {
				const pieces = splitRing(a.t.points, cut);
				if (pieces) return choose(a.n, pieces);
			}
			new Notice(`The line has to cross ${owner.name}'s border twice: start outside it (or on its edge) and end outside it.`);
		};
		const onMove = (evt: L.LeafletMouseEvent) => rubber.setLatLngs(pts.length ? [pts[pts.length - 1], evt.latlng] : []);
		const onClick = (evt: L.LeafletMouseEvent) => {
			pts.push(evt.latlng);
			paint();
		};
		const onDbl = (evt: L.LeafletMouseEvent) => {
			L.DomEvent.stop(evt);
			pts.pop();
			finish();
		};
		this.beginMode("paint", (evt) => {
			if (evt.key === "Escape") this.endMode();
			else if (evt.key === "Enter") finish();
			else if (evt.key === "Backspace") {
				pts.pop();
				paint();
			} else return;
			evt.preventDefault();
			evt.stopPropagation();
		});
		this.root.addClass("is-painting");
		map.doubleClickZoom.disable();
		this.showBanner(`Split ${owner.name}: click points along a line across it, starting and ending outside its border · Enter or double-click to cut · Backspace undoes`, [
			{ label: "Cancel", run: () => this.endMode() },
			{ label: "Cut", cta: true, run: finish },
		]);
		map.on("mousemove", onMove);
		map.on("click", onClick);
		map.on("dblclick", onDbl);
		this.modeCleanup.push(() => {
			map.off("mousemove", onMove);
			map.off("click", onClick);
			map.off("dblclick", onDbl);
		});
	}

	private routeKind = "road";

	/** Draw a road, river or sea lane for a note: click points or drag freehand; shows length and travel time as you go. */
	startRoute(ownerKey: string) {
		const map = this.map;
		const owner = this.plugin.index.get(ownerKey);
		if (!map || !owner || !this.toolLayer) return;
		this.endMode();
		const color = entityColor(this.plugin, owner);
		const pts: L.LatLng[] = [];
		const layer = this.toolLayer;
		const line = L.polyline([], { className: `universeview-route kind-${this.routeKind} is-draft`, weight: 4 }).addTo(layer);
		const rubber = L.polyline([], { className: "universeview-draft-line", weight: 2, dashArray: "4 6" }).addTo(layer);
		const dots = L.layerGroup().addTo(layer);
		let info: HTMLElement | undefined;
		const paint = (cursor?: L.LatLng) => {
			line.setLatLngs(pts);
			const elx = line.getElement() as HTMLElement | undefined;
			elx?.style.setProperty("--route-color", color);
			elx?.setAttribute("class", `leaflet-interactive universeview-route kind-${this.routeKind} is-draft`);
			(rubber.getElement() as HTMLElement | undefined)?.style.setProperty("--terr-color", color);
			dots.clearLayers();
			for (const p of pts) {
				const d = el("div", { cls: "universeview-vertex" });
				d.style.setProperty("--terr-color", color);
				L.marker(p, { icon: L.divIcon({ html: d, className: "universeview-vertex-wrap", iconSize: [0, 0] }), interactive: false }).addTo(dots);
			}
			const all = cursor && pts.length ? [...pts, cursor] : pts;
			const len = this.lineLength(all);
			if (info) info.setText(all.length > 1 ? `${this.formatDistance(len)}${this.travelText(len, this.routeKind) ? ` · ${this.travelText(len, this.routeKind)}` : ""}` : "");
		};
		const finish = () => {
			if (pts.length < 2) {
				new Notice("A route needs at least two points.");
				return;
			}
			const simplified = pts.length > 12 ? simplify(pts.map((p) => map.latLngToLayerPoint(p)), 1.5).map((p) => map.layerPointToLatLng(p)) : pts;
			const points = simplified.map((ll) => this.fromLatLng(ll));
			this.endMode();
			void this.plugin.saveShapes("route", owner.key, this.options.map, null, points, [], this.routeKind).then(() => new Notice(`Drew a ${this.routeKind} for ${owner.name}`));
		};
		const undo = () => {
			pts.pop();
			paint();
		};
		this.beginMode("route", (evt) => {
			if (evt.key === "Escape") this.endMode();
			else if (evt.key === "Enter") finish();
			else if (evt.key === "Backspace" || (evt.key === "z" && (evt.ctrlKey || evt.metaKey))) {
				evt.preventDefault();
				undo();
			} else return;
			evt.stopPropagation();
		});
		this.root.addClass("is-painting");
		map.dragging.disable();
		map.doubleClickZoom.disable();
		this.showBanner(`Route for ${owner.name}: click points or drag along it · Enter or double-click to finish`, [
			{ label: "Undo", run: undo },
			{ label: "Cancel", run: () => this.endMode() },
			{ label: "Finish", cta: true, run: finish },
		], (b) => {
			const controls = el("div", { cls: "universeview-fill-controls" }, b);
			b.addClass("has-fill-controls");
			const kind = el("select", { cls: "universeview-fill-select", attr: { "aria-label": "Kind of route" } }, controls);
			for (const [v, t] of ROUTE_KINDS) kind.add(new Option(t, v));
			kind.value = this.routeKind;
			kind.addEventListener("change", () => {
				this.routeKind = kind.value;
				paint();
			});
			info = el("span", { cls: "universeview-fill-status" }, controls);
		});
		let down: { ll: L.LatLng; pt: L.Point; free: boolean } | null = null;
		const onDown = (evt: L.LeafletMouseEvent) => {
			if (evt.originalEvent.button === 0) down = { ll: evt.latlng, pt: evt.containerPoint, free: false };
		};
		const onMove = (evt: L.LeafletMouseEvent) => {
			if (down) {
				if (!down.free && evt.containerPoint.distanceTo(down.pt) > 8) {
					down.free = true;
					pts.push(down.ll);
				}
				const last = pts[pts.length - 1];
				if (down.free && (!last || map.latLngToContainerPoint(last).distanceTo(evt.containerPoint) > 6)) pts.push(evt.latlng);
			}
			rubber.setLatLngs(pts.length ? [pts[pts.length - 1], evt.latlng] : []);
			paint(evt.latlng);
		};
		const onUp = (evt: L.LeafletMouseEvent) => {
			if (!down) return;
			const wasFree = down.free;
			down = null;
			if (!wasFree) pts.push(evt.latlng);
			paint();
		};
		const onDbl = (evt: L.LeafletMouseEvent) => {
			L.DomEvent.stop(evt);
			pts.pop();
			finish();
		};
		map.on("mousedown", onDown);
		map.on("mousemove", onMove);
		map.on("mouseup", onUp);
		map.on("dblclick", onDbl);
		this.modeCleanup.push(() => {
			map.off("mousedown", onDown);
			map.off("mousemove", onMove);
			map.off("mouseup", onUp);
			map.off("dblclick", onDbl);
		});
	}

	/** Drag the corners of an existing area; click a midpoint to add a corner, right-click a corner to remove it. */
	/**
	 * Edit a shape's corners: a note's area or route, or (with `line`) any line drawn on the map, such
	 * as a coastline, which saves through its own callback.
	 */
	startEdit(ownerKey: string, n: number, what: "territory" | "route" = "territory", line?: { name: string; points: Pt[]; color: string; save: (points: Pt[]) => Promise<void> }) {
		const map = this.map;
		const owner = line ? undefined : this.plugin.index.get(ownerKey);
		const area = owner && this.areasHere(owner, what).find((a) => a.n === n);
		if (!map || (!line && (!owner || !area)) || !this.toolLayer) return;
		this.endMode();
		const isRoute = !!line || what === "route";
		const name = line?.name ?? owner!.name;
		const color = line?.color ?? entityColor(this.plugin, owner!);
		const pts = (line?.points ?? area!.t.points).map((p) => this.pointToLatLng(p));
		const layer = this.toolLayer;
		const shape = (isRoute
			? L.polyline(pts, { className: line ? "universeview-map-line is-draft" : `universeview-route kind-${area!.t.kind ?? "road"} is-draft`, weight: 4 })
			: L.polygon(pts, { className: "universeview-territory is-draft", weight: 2, fillOpacity: 0.2 })) as unknown as L.Polyline;
		shape.addTo(layer);
		(shape.getElement() as HTMLElement | undefined)?.style.setProperty("--route-color", color);
		(shape.getElement() as HTMLElement | undefined)?.style.setProperty("--note-color", color);
		const handles = L.layerGroup().addTo(layer);
		const targets = isRoute ? [] : this.snapTargets({ key: owner!.key, n });
		const ghost = this.snapGhost(layer);
		// Corners several are moved at once: Shift-click to pick them, then drag any one of them.
		const selected = new Set<number>();
		// Shared borders: a neighbour's corner sitting on one of these moves with it (unless turned off).
		let together = this.plugin.settings.moveSharedBorders !== false;
		const neighbours = new Map<string, { key: string; n: number; pts: L.LatLng[]; poly?: L.Polygon; moved: boolean }>();
		const linked = new Map<number, { area: string; j: number }[]>();
		if (!isRoute) {
			// The same spot in the note's own numbers (not merely close on screen, which zoomed out is everything).
			const mine = area!.t.points;
			const eps = this.isImageMap ? 0.75 : 1e-6;
			for (const a of this.drawnAreas) {
				if (a.key === owner!.key && a.n === n) continue;
				const id = `${a.key}|${a.n}`;
				const theirs = a.points.map((q) => this.pointToLatLng(q));
				a.points.forEach((q, j) => {
					const i = mine.findIndex((m) => Math.abs(m[0] - q[0]) <= eps && Math.abs(m[1] - q[1]) <= eps);
					if (i < 0) return;
					if (!neighbours.has(id)) neighbours.set(id, { key: a.key, n: a.n, pts: theirs, poly: this.areaPolys.find((x) => x.points === a.points)?.poly, moved: false });
					linked.set(i, [...(linked.get(i) ?? []), { area: id, j }]);
				});
			}
		}
		/** After a corner is added (+1 at i) or removed (-1 at i): the picked and shared corners keep their places. */
		const reindex = (at: number, delta: 1 | -1) => {
			const shift = (k: number) => (k >= at ? k + delta : k);
			const sel = [...selected].filter((k) => !(delta < 0 && k === at)).map(shift);
			selected.clear();
			sel.forEach((k) => selected.add(k));
			const links = [...linked].filter(([k]) => !(delta < 0 && k === at)).map(([k, v]) => [shift(k), v] as const);
			linked.clear();
			for (const [k, v] of links) linked.set(k, v);
		};
		/** Moves corner i (and, with it, the neighbours' corners on it) to a position. */
		const moveCorner = (i: number, to: L.LatLng) => {
			pts[i] = to;
			if (!together) return;
			for (const l of linked.get(i) ?? []) {
				const nb = neighbours.get(l.area)!;
				nb.pts[l.j] = to;
				nb.moved = true;
				nb.poly?.setLatLngs(nb.pts);
			}
		};
		// ---- Shared corners: adding, removing and joining corners keeps neighbours' borders matched ----
		const targetAreas = isRoute ? [] : this.drawnAreas.filter((a) => !(a.key === owner!.key && a.n === n));
		const ensureNeighbour = (a: { key: string; n: number; points: Pt[] }) => {
			const id = `${a.key}|${a.n}`;
			let nb = neighbours.get(id);
			if (!nb) {
				nb = { key: a.key, n: a.n, pts: a.points.map((q) => this.pointToLatLng(q)), poly: this.areaPolys.find((x) => x.points === a.points)?.poly, moved: false };
				neighbours.set(id, nb);
			}
			return { id, nb };
		};
		/** A neighbour gained (+1) or lost (-1) a corner at j: every link into it past there moves along. */
		const shiftLinks = (id: string, j: number, delta: 1 | -1) => {
			for (const list of linked.values()) for (const l of list) if (l.area === id && (delta > 0 ? l.j >= j : l.j > j)) l.j += delta;
		};
		const px = (ll: L.LatLng) => map.latLngToContainerPoint(ll);
		/** Puts a new corner at `at` in this shape; where both ends of that edge are corners a neighbour shares, it gets the corner too. */
		const insertCorner = (at: number, ll: L.LatLng) => {
			const count = pts.length;
			const la = linked.get((at - 1 + count) % count) ?? [];
			const lb = linked.get(at % count) ?? [];
			pts.splice(at, 0, ll);
			reindex(at, 1);
			if (!together) return;
			for (const x of la) {
				const y = lb.find((l) => l.area === x.area);
				const nb = neighbours.get(x.area);
				if (!y || !nb) continue;
				const m = nb.pts.length;
				const ins = y.j === (x.j + 1) % m ? x.j + 1 : x.j === (y.j + 1) % m ? y.j + 1 : -1;
				if (ins < 0) continue;
				nb.pts.splice(ins, 0, ll);
				shiftLinks(x.area, ins, 1);
				linked.set(at, [...(linked.get(at) ?? []), { area: x.area, j: ins }]);
				nb.moved = true;
				nb.poly?.setLatLngs(nb.pts);
			}
		};
		/** Takes a corner out of this shape, and out of the neighbours that share it (so the border stays matched). */
		const removeCorner = (i: number): boolean => {
			if (pts.length <= (isRoute ? 2 : 3)) return false;
			if (together) {
				for (const l of linked.get(i) ?? []) {
					const nb = neighbours.get(l.area);
					if (!nb || nb.pts.length <= 3) continue;
					nb.pts.splice(l.j, 1);
					shiftLinks(l.area, l.j, -1);
					nb.moved = true;
					nb.poly?.setLatLngs(nb.pts);
				}
			}
			pts.splice(i, 1);
			reindex(i, -1);
			return true;
		};
		/** A corner dropped on a neighbour's corner or border becomes shared with it (the border gets the corner too). */
		const joinTo = (i: number, s: SnapAt | null) => {
			if (!together || !s || s.shape === undefined || (s.kind !== "vertex" && s.kind !== "edge")) return;
			const a = targetAreas[s.shape];
			if (!a) return;
			const { id, nb } = ensureNeighbour(a);
			if ((linked.get(i) ?? []).some((l) => l.area === id)) return;
			const here = px(pts[i]);
			const dist = (q: L.LatLng) => Math.hypot(px(q).x - here.x, px(q).y - here.y);
			if (s.kind === "vertex") {
				let best = -1;
				nb.pts.forEach((q, j) => {
					if (dist(q) < 2 && (best < 0 || dist(q) < dist(nb.pts[best]))) best = j;
				});
				if (best >= 0) linked.set(i, [...(linked.get(i) ?? []), { area: id, j: best }]);
				return;
			}
			let at = -1;
			let bestD = 14;
			for (let x = 0; x < nb.pts.length; x++) {
				const p = px(nb.pts[x]);
				const q = px(nb.pts[(x + 1) % nb.pts.length]);
				const d = segmentDistance(here.x, here.y, p.x, p.y, q.x, q.y);
				if (d < bestD) [at, bestD] = [x, d];
			}
			if (at < 0) return;
			nb.pts.splice(at + 1, 0, pts[i]);
			shiftLinks(id, at + 1, 1);
			linked.set(i, [...(linked.get(i) ?? []), { area: id, j: at + 1 }]);
			nb.moved = true;
			nb.poly?.setLatLngs(nb.pts);
		};
		// ---- Undo and redo while editing ----
		type EditState = { pts: L.LatLng[]; nbs: [string, L.LatLng[], boolean][]; linked: [number, { area: string; j: number }[]][] };
		const take = (): EditState => ({
			pts: [...pts],
			nbs: [...neighbours].map(([id, nb]) => [id, [...nb.pts], nb.moved]),
			linked: [...linked].map(([k, v]) => [k, v.map((l) => ({ ...l }))]),
		});
		const put = (s: EditState) => {
			pts.splice(0, pts.length, ...s.pts);
			for (const [id, nb] of neighbours) {
				if (!s.nbs.some(([i]) => i === id)) {
					const a = this.drawnAreas.find((x) => `${x.key}|${x.n}` === id);
					if (a) nb.pts = a.points.map((q) => this.pointToLatLng(q));
					nb.moved = false;
					nb.poly?.setLatLngs(nb.pts);
				}
			}
			for (const [id, p, moved] of s.nbs) {
				const a = this.drawnAreas.find((x) => `${x.key}|${x.n}` === id);
				const nb = neighbours.get(id) ?? (a ? ensureNeighbour(a).nb : undefined);
				if (!nb) continue;
				nb.pts = [...p];
				nb.moved = moved;
				nb.poly?.setLatLngs(nb.pts);
			}
			linked.clear();
			for (const [k, v] of s.linked) linked.set(k, v.map((l) => ({ ...l })));
			selected.clear();
		};
		const initial = take();
		const past: EditState[] = [];
		const future: EditState[] = [];
		const record = () => {
			past.push(take());
			if (past.length > 100) past.shift();
			future.length = 0;
		};
		const undo = () => {
			const s = past.pop();
			if (!s) return;
			future.push(take());
			put(s);
			redraw();
		};
		const redo = () => {
			const s = future.pop();
			if (!s) return;
			past.push(take());
			put(s);
			redraw();
		};
		const reset = () => {
			if (!past.length) return;
			record();
			put(initial);
			redraw();
		};
		let hovered = -1;
		let lastNudge = 0;
		/** Moves the picked corners (or the one under the pointer) by screen pixels. */
		const nudge = (dx: number, dy: number) => {
			const which = selected.size ? [...selected] : hovered >= 0 ? [hovered] : [];
			if (!which.length) return false;
			if (Date.now() - lastNudge > 700) record();
			lastNudge = Date.now();
			for (const k of which) {
				const p = px(pts[k]);
				moveCorner(k, map.containerPointToLatLng(L.point(p.x + dx, p.y + dy)));
			}
			redraw();
			return true;
		};
		const removePicked = () => {
			const which = selected.size ? [...selected] : hovered >= 0 ? [hovered] : [];
			if (!which.length) return false;
			record();
			for (const k of which.sort((a, b) => b - a)) removeCorner(k);
			hovered = -1;
			redraw();
			return true;
		};
		const save = () => {
			const points = pts.map((ll) => this.fromLatLng(ll));
			this.endMode();
			if (line) {
				void line.save(points).then(() => new Notice(`Saved ${name}`));
				return;
			}
			void (async () => {
				await this.plugin.saveShapes(what, owner!.key, this.options.map, n, points);
				const moved = [...neighbours.values()].filter((nb) => nb.moved);
				for (const nb of moved) await this.plugin.saveShapes("territory", nb.key, this.options.map, nb.n, nb.pts.map((ll) => this.fromLatLng(ll)));
				new Notice(`Saved ${name}'s ${isRoute ? "route" : "area"}${moved.length ? ` and the shared border with ${moved.map((nb) => this.plugin.index.get(nb.key)?.name).filter(Boolean).join(", ")}` : ""}`);
			})();
		};
		/** The neighbours that move with this border are outlined, and the switch names them, so it is clear what a drag will touch. */
		let sharedText: HTMLElement | undefined;
		const markLinked = () => {
			const names: string[] = [];
			for (const [id, nb] of neighbours) {
				const on = together && [...linked.values()].some((list) => list.some((l) => l.area === id));
				(nb.poly?.getElement() as SVGElement | undefined)?.classList.toggle("is-linked", on);
				const nm = this.plugin.index.get(nb.key)?.name;
				if (on && nm && !names.includes(nm)) names.push(nm);
			}
			sharedText?.setText(names.length ? `Shared borders move with ${names.slice(0, 3).join(", ")}${names.length > 3 ? ` +${names.length - 3}` : ""}` : "No shared borders here");
		};
		this.modeCleanup.push(() => {
			for (const nb of neighbours.values()) (nb.poly?.getElement() as SVGElement | undefined)?.classList.remove("is-linked");
		});
		const redraw = () => {
			markLinked();
			shape.setLatLngs(pts);
			(shape.getElement() as HTMLElement | undefined)?.style.setProperty("--terr-color", color);
			handles.clearLayers();
			pts.forEach((p, i) => {
				const d = el("div", { cls: "universeview-vertex is-handle" + (selected.has(i) ? " is-selected" : "") + (together && linked.has(i) ? " is-shared" : "") });
				d.style.setProperty("--terr-color", color);
				const h = L.marker(p, { icon: L.divIcon({ html: d, className: "universeview-vertex-wrap", iconSize: [0, 0] }), draggable: true }).addTo(handles);
				h.on("click", (evt: L.LeafletMouseEvent) => {
					if (!evt.originalEvent.shiftKey) return;
					L.DomEvent.stop(evt);
					if (selected.has(i)) selected.delete(i);
					else selected.add(i);
					redraw();
				});
				let start: L.LatLng | undefined;
				let starts: Map<number, L.LatLng> | undefined;
				let snappedTo: SnapAt | null = null;
				h.on("mouseover", () => (hovered = i));
				h.on("mouseout", () => {
					if (hovered === i) hovered = -1;
				});
				h.on("dragstart", () => {
					record();
					snappedTo = null;
					start = pts[i];
					starts = selected.has(i) ? new Map([...selected].map((k) => [k, pts[k]])) : undefined;
				});
				h.on("drag", (evt: L.LeafletEvent) => {
					// Several picked: they all move by the same amount, without snapping.
					if (starts && start) {
						const dLat = h.getLatLng().lat - start.lat;
						const dLng = h.getLatLng().lng - start.lng;
						for (const [k, s0] of starts) moveCorner(k, L.latLng(s0.lat + dLat, s0.lng + dLng));
						shape.setLatLngs(pts);
						return;
					}
					const s = this.snapLatLng(h.getLatLng(), targets, (evt as L.LeafletEvent & { originalEvent?: MouseEvent }).originalEvent, !isRoute);
					ghost(s);
					snappedTo = s;
					if (s) h.setLatLng(s.ll);
					moveCorner(i, h.getLatLng());
					shape.setLatLngs(pts);
				});
				h.on("dragend", () => {
					ghost(null);
					if (!starts) joinTo(i, snappedTo);
					redraw();
				});
				h.on("contextmenu", (evt: L.LeafletMouseEvent) => {
					L.DomEvent.stop(evt);
					if (pts.length <= (isRoute ? 2 : 3)) return;
					record();
					removeCorner(i);
					redraw();
				});
				// A route has no segment from its last point back to the first.
				if (isRoute && i === pts.length - 1) return;
				// Midpoint: click to insert a corner.
				const next = pts[(i + 1) % pts.length];
				const mid = L.latLng((p.lat + next.lat) / 2, (p.lng + next.lng) / 2);
				const md = el("div", { cls: "universeview-vertex is-mid" });
				md.style.setProperty("--terr-color", color);
				L.marker(mid, { icon: L.divIcon({ html: md, className: "universeview-vertex-wrap", iconSize: [0, 0] }) })
					.on("click", (evt: L.LeafletMouseEvent) => {
						L.DomEvent.stop(evt);
						record();
						insertCorner(i + 1, mid);
						redraw();
					})
					.addTo(handles);
			});
		};
		this.beginMode("edit", (evt) => {
			const mod = evt.ctrlKey || evt.metaKey;
			const step = evt.shiftKey ? 10 : 1;
			if (evt.key === "Escape") this.endMode();
			else if (evt.key === "Enter") save();
			else if (mod && evt.key.toLowerCase() === "z") (evt.shiftKey ? redo : undo)();
			else if (mod && evt.key.toLowerCase() === "y") redo();
			else if (evt.key === "Delete" || evt.key === "Backspace") {
				if (!removePicked()) return;
			} else if (evt.key.startsWith("Arrow")) {
				const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[evt.key] ?? [0, 0];
				if (!nudge(d[0], d[1])) return;
			} else return;
			evt.preventDefault();
			evt.stopPropagation();
		});
		this.root.addClass("is-editing");
		// Double-click the border to add a corner right there (shared with a neighbour where the border is shared).
		shape.on("dblclick", (evt: L.LeafletMouseEvent) => {
			const c = map.latLngToContainerPoint(evt.latlng);
			let at = -1;
			let bestD = 12;
			let proj: L.LatLng | undefined;
			const last = isRoute ? pts.length - 1 : pts.length;
			for (let x = 0; x < last; x++) {
				const a = px(pts[x]);
				const b = px(pts[(x + 1) % pts.length]);
				const d = segmentDistance(c.x, c.y, a.x, a.y, b.x, b.y);
				if (d >= bestD) continue;
				const len2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2 || 1;
				const t = Math.max(0, Math.min(1, ((c.x - a.x) * (b.x - a.x) + (c.y - a.y) * (b.y - a.y)) / len2));
				[at, bestD, proj] = [x, d, map.containerPointToLatLng(L.point(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t))];
			}
			if (at < 0 || !proj) return;
			L.DomEvent.stop(evt);
			record();
			insertCorner(at + 1, proj);
			redraw();
		});
		const buttons: { label: string; cta?: boolean; run: () => void }[] = [
			{ label: "Undo", run: undo },
			{ label: "Redo", run: redo },
			{ label: "Reset", run: reset },
			{ label: "Cancel", run: () => this.endMode() },
			{ label: "Save", cta: true, run: save },
		];
		// Shared borders move together by default; a neighbour's corners can be left where they are.
		// Shared borders move together by default: a switch leaves the neighbours' corners where they are.
		const sharedSwitch = (b: HTMLElement) => {
			if (isRoute) return;
			const sw = el("label", { cls: "uv-banner-switch", attr: { "aria-label": "Corners shared with a neighbour move both borders" } }, b);
			const box = el("input", { attr: { type: "checkbox" } }, sw);
			box.checked = together;
			el("span", { cls: "uv-banner-switch-track" }, sw);
			sharedText = el("span", { cls: "uv-banner-switch-text", text: "Shared borders" }, sw);
			box.addEventListener("change", () => {
				together = box.checked;
				this.plugin.settings.moveSharedBorders = together ? undefined : false;
				this.saveSoon();
				redraw();
			});
		};
		this.showBanner(isRoute
			? `Editing ${line ? name : `${name}'s route`}: drag a point · click a + to add one · right-click removes · Ctrl+Z undoes`
				: `Editing ${name}: drag a corner · click a + to add one · right-click removes · Shift-click picks several · Ctrl+Z undoes`, buttons, (b) => {
			sharedSwitch(b);
			if (!isRoute) this.waterSwitch(b);
		});
		if (!isRoute) this.prepareWater();
		redraw();
	}

	/**
	 * Fill an area of the map image like a paint bucket: it spreads over similar colours and stops at
	 * coasts, rivers, drawn borders and other territories. Each click adds an area; the outline is
	 * traced, simplified and snapped onto neighbouring borders before saving.
	 */
	async startFill(ownerKey: string, n?: number) {
		const owner = this.plugin.index.get(ownerKey);
		if (!this.map || !owner || !this.toolLayer) return;
		if (!this.isImageMap) {
			new Notice("Fill follows the coasts and borders drawn in a map image, so it works on image maps. On the world map, use the paintbrush.");
			return;
		}
		this.endMode();
		const map = this.map;
		const mapKey = this.options.map;
		const area = n !== undefined ? this.areasHere(owner).find((a) => a.n === n) : undefined;
		const color = entityColor(this.plugin, owner);
		const layer = this.toolLayer;
		const preview = L.layerGroup().addTo(layer);
		let stopAtAreas = true;
		let join = !!area;
		let status: HTMLElement | undefined;
		// Other lands' areas are walls (and snap targets); its own, and its lieges' and sub-lands', aren't.
		const others = area ? this.wallsFor(owner.key, area.n) : this.drawnAreas.filter((a) => a.key !== owner.key).map((a) => a.points);
		// Each click, with what it filled (in map units) and whether that ran to the edge of the view.
		const clicks: { at: Pt; rings: Pt[][]; edge: boolean; share: number }[] = [];
		/** Fills from one point on the picture as it's on screen (or, failing that, the whole map's copy). */
		const fillAt = async (at: Pt): Promise<{ rings: Pt[][]; edge: boolean; share: number } | null> => {
			let r = await this.detailRaster().catch(() => null);
			if (!r || at[0] < r.ox || at[1] < r.oy || at[0] >= r.ox + r.img.width * r.scale || at[1] >= r.oy + r.img.height * r.scale) {
				const whole = await this.loadRaster().catch(() => null);
				r = whole ? { ...whole, ox: 0, oy: 0 } : null;
			}
			if (!r) return null;
			const { img, scale, ox, oy } = r;
			const w = img.width;
			const h = img.height;
			const seed: Pt = [Math.floor((at[0] - ox) / scale), Math.floor((at[1] - oy) / scale)];
			if (seed[0] < 0 || seed[1] < 0 || seed[0] >= w || seed[1] >= h) return null;
			let blocked: Uint8Array | undefined;
			if (stopAtAreas) {
				blocked = new Uint8Array(w * h);
				for (const poly of others) rasterize(blocked, w, h, poly.map(([x, y]) => [(x - ox) / scale, (y - oy) / scale] as Pt));
			}
			let m: Uint8Array;
			if (this.fillBy === "ground") {
				// The sea's colour from the whole map (the view alone may show no sea at its edge).
				if (!this.seaColor) {
					const whole = await this.loadRaster().catch(() => null);
					if (whole) this.seaColor = edgeColor(whole.img);
				}
				const wet = wetMask(img, { sea: this.seaColor });
				m = landFill(wet, w, h, seed, blocked, { crossRivers: this.fillCrossRivers, seal: this.fillGaps });
			} else m = fillFrom(img, seed, { tolerance: this.fillTolerance, seal: this.fillGaps, blocked });
			let filled = 0;
			let edge = false;
			for (let i = 0; i < m.length; i++) {
				if (!m[i]) continue;
				filled++;
				const x = i % w;
				if (!edge && (x === 0 || x === w - 1 || i < w || i >= w * (h - 1))) edge = true;
			}
			// Outlines stick onto neighbouring borders within a few screen pixels, so they meet exactly.
			const stick = Math.max(3 * scale, 6 * this.unitsPerPx(map.getCenter()));
			const rings = traceOutlines(m, w, h, 12)
				.map((ring) => simplifyRing(ring, 0.9).map(([x, y]) => [round(x * scale + ox, 1), round(y * scale + oy, 1)] as Pt))
				.map((ring) => this.tidyRing(ring, area ? { key: owner.key, n: area.n } : undefined))
				.map((ring) => (stopAtAreas ? snapRing(ring, others, stick) : ring))
				.filter((ring) => ring.length >= 3);
			// Whole-map copy: an edge is just the map's own edge.
			if (ox === 0 && oy === 0 && Math.abs(w * scale - this.imageWidth) < scale * 2) edge = false;
			return { rings, edge, share: filled / (w * h) };
		};
		const draw = () => {
			preview.clearLayers();
			const rings = clicks.flatMap((c) => c.rings);
			for (const ring of rings) {
				const poly = L.polygon(ring.map((p) => this.pointToLatLng(p)), { className: "universeview-territory is-draft is-fill", weight: 2, fillOpacity: 0.3, interactive: false }).addTo(preview);
				(poly.getElement() as HTMLElement | undefined)?.style.setProperty("--terr-color", color);
			}
			if (!status) return;
			const last = clicks[clicks.length - 1];
			status.setText(
				!clicks.length
					? ""
					: last.share > 0.6
						? "That spread over most of what's in view: lower the tolerance, or Undo"
						: last.edge
							? "That reached the edge of the view: zoom out (then Undo and click again) to take in more"
							: `${rings.length} area${rings.length === 1 ? "" : "s"} from ${clicks.length} click${clicks.length === 1 ? "" : "s"}`,
			);
			status.toggleClass("is-warning", !!last && (last.share > 0.6 || last.edge));
		};
		// A setting changed: fill again from the clicks in view (the others keep what they filled).
		const refill = debounce(async () => {
			const b = map.getBounds();
			for (const c of clicks) {
				if (!b.contains(this.pointToLatLng(c.at))) continue;
				const res = await fillAt(c.at);
				if (res) Object.assign(c, res);
			}
			draw();
		}, 150, true);
		const save = () => {
			const rings = clicks.flatMap((c) => c.rings);
			if (!rings.length) {
				new Notice("Click inside an area of the map to fill it first.");
				return;
			}
			const minPiece = (12 * this.unitsPerPx(map.getCenter())) ** 2;
			if (join && area) {
				const res = mergeInto(area.t.points, rings, stopAtAreas ? others : [], minPiece);
				if (!res) {
					new Notice("Couldn't join the filled land to the area.");
					return;
				}
				this.endMode();
				void this.saveGrown(owner, area.n, res.ring, res.detached, `Filled more of ${owner.name}`);
				return;
			}
			// Started from the top toolbar: filled land that overlaps one of its existing areas joins that area,
			// rather than becoming a second area drawn over it (two outlines, one inside the other).
			if (!area) {
				const overlaps = (a: Pt[], b: Pt[]) => a.some((p) => inRing(p, b)) || b.some((p) => inRing(p, a));
				const mine = this.areasHere(owner).filter((x) => this.shapeNow(x.t));
				const hit = mine.find((x) => rings.some((r) => overlaps(r, x.t.points)));
				if (hit) {
					const touching = rings.filter((r) => overlaps(r, hit.t.points as Pt[]));
					const apart = rings.filter((r) => !touching.includes(r));
					const res = mergeInto(hit.t.points, touching, stopAtAreas ? this.wallsFor(owner.key, hit.n) : [], minPiece);
					if (!res) {
						new Notice("Couldn't join the filled land to the area it overlaps.");
						return;
					}
					this.endMode();
					void this.saveGrown(owner, hit.n, res.ring, [...res.detached, ...apart], `Filled more of ${owner.name}`);
					return;
				}
			}
			// Separate areas, with overlapping clicks merged into one.
			const [first, ...rest] = rings;
			const merged = rest.length ? mergeInto(first, rest, [], minPiece) : { ring: first, detached: [], holes: 0 };
			const shapes = merged ? [merged.ring, ...merged.detached] : rings;
			this.endMode();
			void this.plugin.saveTerritory(owner.key, mapKey, null, shapes[0], shapes.slice(1)).then(() => new Notice(`Filled ${shapes.length} area${shapes.length === 1 ? "" : "s"} for ${owner.name}`));
		};
		const undo = () => {
			clicks.pop();
			draw();
		};
		this.beginMode("fill", (evt) => {
			if (evt.key === "Escape") this.endMode();
			else if (evt.key === "Enter") save();
			else if (evt.key === "Backspace" || (evt.key === "z" && (evt.ctrlKey || evt.metaKey))) {
				evt.preventDefault();
				undo();
			} else return;
			evt.stopPropagation();
		});
		this.root.addClass("is-filling");
		map.doubleClickZoom.disable();
		this.showBanner(
			`Filling ${owner.name}: click inside land, a region or a sea and it fills to the coasts, rivers and borders around it, as sharp as the picture on screen · each click adds more · zoom in for detail, out for big areas`,
			[
				{ label: "Undo", run: undo },
				{ label: "Cancel", run: () => this.endMode() },
				{ label: "Save", cta: true, run: save },
			],
			(b) => {
				const controls = el("div", { cls: "universeview-fill-controls" }, b);
			b.addClass("has-fill-controls");
				this.makeSimplifySlider(controls, refill);
				// Like a paint bucket: everything of the clicked kind of ground, or (as before) everything of the clicked colour.
				const by = el("select", { cls: "universeview-fill-select", attr: { title: "Fill all the land (or water) joined to the click, whatever is drawn on it; or only the clicked colour" } }, controls);
				for (const [v, t] of [["ground", "Fill land / sea"], ["colour", "Fill same colour"]]) {
					const o = el("option", { text: t }, by);
					o.value = v;
				}
				by.value = this.fillBy;
				const rivers = el("button", { cls: "universeview-banner-toggle", text: "Cross rivers", attr: { "aria-pressed": String(this.fillCrossRivers), title: "Carry on over rivers to the land beyond, stopping only at the sea, lakes and other territories" } }, controls);
				rivers.toggleClass("is-active", this.fillCrossRivers);
				rivers.addEventListener("click", (evt) => {
					evt.stopPropagation();
					this.fillCrossRivers = !this.fillCrossRivers;
					rivers.toggleClass("is-active", this.fillCrossRivers);
					rivers.setAttribute("aria-pressed", String(this.fillCrossRivers));
					refill();
				});
				const tol = el("label", { cls: "universeview-fill-control", title: "How different a colour can be and still count as the same area" }, controls);
				const showMode = () => {
					tol.toggle(this.fillBy === "colour");
					rivers.toggle(this.fillBy === "ground");
				};
				by.addEventListener("change", () => {
					this.fillBy = by.value as "colour" | "ground";
					showMode();
					refill();
				});
				window.setTimeout(showMode);
				el("span", { text: "Tolerance" }, tol);
				const range = el("input", { attr: { type: "range", min: "2", max: "60", step: "1" } }, tol);
				range.value = String(this.fillTolerance);
				const tolValue = el("span", { cls: "universeview-fill-value", text: String(this.fillTolerance) }, tol);
				range.addEventListener("input", () => {
					this.fillTolerance = +range.value;
					tolValue.setText(range.value);
					refill();
				});
				const gaps = el("select", { cls: "universeview-fill-select", attr: { title: "Close small gaps in dotted or broken border lines" } }, controls);
				for (const [v, t] of [["0", "No gap closing"], ["1", "Close tiny gaps"], ["2", "Close small gaps"], ["4", "Close wide gaps"]]) {
					const o = el("option", { text: t }, gaps);
					o.value = v;
				}
				gaps.value = String(this.fillGaps);
				gaps.addEventListener("change", () => {
					this.fillGaps = +gaps.value;
					refill();
				});
				const stop = el("button", { cls: "universeview-banner-toggle is-active", text: "Stop at other territories", attr: { "aria-pressed": "true" } }, controls);
				stop.addEventListener("click", (evt) => {
					evt.stopPropagation();
					stopAtAreas = !stopAtAreas;
					stop.toggleClass("is-active", stopAtAreas);
					stop.setAttribute("aria-pressed", String(stopAtAreas));
					refill();
				});
				if (area) {
					const joinBtn = el("button", { cls: "universeview-banner-toggle is-active", text: "Join this area", attr: { "aria-pressed": "true", title: "Add the filled land to the area you're working on, rather than as areas of its own" } }, controls);
					joinBtn.addEventListener("click", (evt) => {
						evt.stopPropagation();
						join = !join;
						joinBtn.toggleClass("is-active", join);
						joinBtn.setAttribute("aria-pressed", String(join));
					});
				}
				status = el("span", { cls: "universeview-fill-status" }, controls);
			},
		);
		// The joined area, so it's clear what the fill adds to.
		if (area) {
			const base = L.polygon(area.t.points.map((p) => this.pointToLatLng(p)), { className: "universeview-territory is-draft", weight: 2, dashArray: "4 4", fillOpacity: 0.12, interactive: false }).addTo(layer);
			(base.getElement() as HTMLElement | undefined)?.style.setProperty("--terr-color", color);
		}
		const onClick = (evt: L.LeafletMouseEvent) => {
			const at = this.fromLatLng(evt.latlng);
			if (at[0] < 0 || at[1] < 0 || at[0] >= this.imageWidth || at[1] >= this.imageHeight) return;
			this.root.addClass("is-busy");
			// Let the cursor change paint before the (synchronous) fill runs.
			window.setTimeout(() => {
				void fillAt(at)
					.then((res) => {
						if (!res) {
							new Notice("Couldn't read the picture there.");
							return;
						}
						clicks.push({ at, ...res });
						draw();
					})
					.finally(() => this.root.removeClass("is-busy"));
			}, 16);
		};
		map.on("click", onClick);
		this.modeCleanup.push(() => map.off("click", onClick));
	}

	/**
	 * The map image's pixels, downscaled to at most 1600 px across. A tiled image reuses its shared
	 * copies; any other is decoded straight to that size. Reading the file keeps the canvas readable.
	 */
	private async loadRaster(): Promise<{ img: Raster; scale: number } | null> {
		const key = this.options.map;
		if (this.raster?.map === key) return this.raster;
		const m = this.plugin.index.get(key);
		// The picture on show (on a phone, its copy): a huge original read whole brings a phone down.
		const imagePath = this.shownImage;
		const url = resourceUrl(this.plugin, imagePath);
		if (!m || !url || !imagePath || !this.imageWidth) return null;
		// A phone keeps the work smaller still.
		const s = Math.min(1, (Platform.isMobile ? 1200 : 1600) / Math.max(this.imageWidth, this.imageHeight));
		const w = Math.max(1, Math.round(this.imageWidth * s));
		const h = Math.max(1, Math.round(this.imageHeight * s));
		let src: CanvasImageSource | null = null;
		if (this.imageLayer instanceof TiledImageLayer) src = levelFor(this.imageLayer.pyramid, w / this.imageLayer.pyramid.width).src;
		// On a phone, the picture already loaded for the map, not a second copy of its bytes.
		else if (!Platform.isMobile && typeof createImageBitmap === "function") {
			const bytes = await readBytes(this.plugin, imagePath);
			if (bytes) src = await createImageBitmap(new Blob([bytes]), { resizeWidth: w, resizeHeight: h, resizeQuality: "high" }).catch(() => null);
		}
		if (!src) src = await loadImage(url);
		if (!src) return null;
		const canvas = createEl("canvas");
		canvas.width = w;
		canvas.height = h;
		const ctx = canvas.getContext("2d", { willReadFrequently: true });
		if (!ctx) return null;
		ctx.drawImage(src, 0, 0, w, h);
		const data = ctx.getImageData(0, 0, w, h).data;
		this.raster = { map: key, img: { data, width: w, height: h }, scale: this.imageWidth / w };
		return this.raster;
	}

	/** Click points to measure a route; distances use the map note's `scale` on image maps. */
	startMeasure(from?: L.LatLng) {
		const map = this.map;
		if (!map || !this.toolLayer) return;
		this.endMode();
		const layer = this.toolLayer;
		const pts: L.LatLng[] = from ? [from] : [];
		const line = L.polyline(pts, { className: "universeview-measure-line", weight: 3 }).addTo(layer);
		const rubber = L.polyline([], { className: "universeview-measure-line is-rubber", weight: 2, dashArray: "4 6" }).addTo(layer);
		const tip = L.tooltip({ permanent: true, direction: "right", className: "universeview-measure-tip", offset: [10, 0] });
		const scale = this.mapScale();
		const total = (extra?: L.LatLng) => {
			const all = extra ? [...pts, extra] : pts;
			let d = 0;
			for (let i = 1; i < all.length; i++) d += this.distance(all[i - 1], all[i]);
			return d;
		};
		const fmt = (d: number) => {
			const travel = d > 0 ? this.travelText(d, "measure") : undefined;
			const base = !this.isImageMap
				? d >= 1000 ? `${(d / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })} km · ${(d / 1609.34).toLocaleString(undefined, { maximumFractionDigits: 1 })} mi` : `${Math.round(d)} m`
				: !scale ? `${Math.round(d).toLocaleString()} px` : `${(d * scale.perPx).toLocaleString(undefined, { maximumFractionDigits: 1 })} ${scale.unit}`;
			const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
			return travel ? `${esc(base)}<br><span class="universeview-route-travel">${esc(travel)}</span>` : esc(base);
		};
		const update = (cursor?: L.LatLng) => {
			line.setLatLngs(pts);
			rubber.setLatLngs(pts.length && cursor ? [pts[pts.length - 1], cursor] : []);
			const at = cursor ?? pts[pts.length - 1];
			if (at && pts.length) {
				tip.setLatLng(at).setContent(fmt(total(cursor)));
				if (!layer.hasLayer(tip)) tip.addTo(layer);
			}
		};
		let done = false;
		const onClick = (evt: L.LeafletMouseEvent) => {
			if (done) {
				pts.length = 0;
				done = false;
			}
			pts.push(evt.latlng);
			update();
		};
		const onMove = (evt: L.LeafletMouseEvent) => !done && update(evt.latlng);
		const onDbl = (evt: L.LeafletMouseEvent) => {
			L.DomEvent.stop(evt);
			done = true;
			update();
		};
		this.beginMode("measure", (evt) => {
			if (evt.key !== "Escape") return;
			evt.stopPropagation();
			this.endMode();
		});
		this.root.addClass("is-measuring");
		map.doubleClickZoom.disable();
		const hint = this.isImageMap && !scale ? " · add `scale: 100 px = 5 km` to the map note for real distances" : "";
		this.showBanner(`Measuring: click to add points · double-click to finish${hint}`, [{ label: "Done", cta: true, run: () => this.endMode() }]);
		map.on("click", onClick);
		map.on("mousemove", onMove);
		map.on("dblclick", onDbl);
		this.modeCleanup.push(() => {
			map.off("click", onClick);
			map.off("mousemove", onMove);
			map.off("dblclick", onDbl);
		});
		update();
	}

	private distance(a: L.LatLng, b: L.LatLng): number {
		if (!this.isImageMap) return this.map!.distance(a, b);
		return Math.hypot(a.lat - b.lat, a.lng - b.lng);
	}

	/** `scale: 2.5` (units per pixel) with `unit: km`, or `scale: 100 px = 5 km`. */
	private mapScale(): { perPx: number; unit: string } | undefined {
		const m = this.plugin.index.get(this.options.map);
		return parseScale(m?.props.scale, m?.props.unit ?? m?.props.units);
	}

	private mapMenu(evt: L.LeafletMouseEvent) {
		const pos = this.fromLatLng(evt.latlng);
		const mapName = this.isImageMap ? this.plugin.index.get(this.options.map)?.name : undefined;
		const menu = new Menu();
		menu.addItem((i) => i.setTitle("New place here…").setIcon("map-pin-plus").onClick(() => this.plugin.createEntityPrompt({ type: "place", map: mapName, position: pos })));
		// A new or cropped picture: move everything on this map by hand.
		if (this.isImageMap) {
			const mapKey = this.options.map;
			menu.addItem((i) => i.setTitle("Move all pins and areas (scale, shift)…").setIcon("move").onClick(() => {
				moveMapSheet(this.plugin, mapKey, { sx: 1, sy: 1 }, [this.imageWidth, this.imageHeight]);
			}));
		}
		if (this.onPlaceClick) menu.addItem((i) => i.setTitle("Put an existing place here…").setIcon("map-pin").onClick(() => this.onPlaceClick?.(pos)));
		menu.addItem((i) => i.setTitle("New event here…").setIcon("calendar-plus").onClick(() => {
			const near = this.nearestPin(evt.latlng);
			this.plugin.createEntityPrompt({ type: "event", places: near ? [near.place.name] : undefined });
		}));
		menu.addSeparator();
		menu.addItem((i) => i.setTitle("Measure from here").setIcon("ruler").onClick(() => this.startMeasure(evt.latlng)));
		menu.addItem((i) => i.setTitle("Copy position").setIcon("copy").onClick(() => {
			void navigator.clipboard?.writeText(`[${pos.join(", ")}]`);
			new Notice(`Copied [${pos.join(", ")}]`);
		}));
		menu.addItem((i) => i.setTitle("Centre here").setIcon("locate-fixed").onClick(() => this.map?.panTo(evt.latlng, { duration: motionMs(this.plugin.settings, 400) / 1000 })));
		menu.showAtMouseEvent(evt.originalEvent);
	}

	private nearestPin(ll: L.LatLng): Pin | undefined {
		if (!this.map) return undefined;
		const pt = this.map.latLngToContainerPoint(ll);
		let best: Pin | undefined;
		let bestD = 40;
		for (const p of this.pins) {
			const d = this.map.latLngToContainerPoint(L.latLng(p.latlng)).distanceTo(pt);
			if (d < bestD) [best, bestD] = [p, d];
		}
		return best;
	}

	// ---- Movements: wars, campaigns, migrations ----------------------------------------------------

	/** Events that move across several places (a campaign, a migration, a voyage) as arrows through them. */
	private drawMovements() {
		const layer = this.moveLayer;
		const map = this.map;
		if (!map || !layer) return;
		layer.clearLayers();
		if (this.options.showMovements === false) return;
		const idx = this.plugin.index;
		const at = this.options.at;
		// Wars with battles on the map are drawn through their battles instead (drawWars).
		const viaBattles = this.options.showWars === false ? new Set<string>() : new Set([...battlesByWar(idx)].filter(([, bs]) => bs.filter((b) => this.battleSpot(b)).length >= 2).map(([k]) => k));
		const within = this.withinSet();
		for (const e of idx.all("event")) {
			if (viaBattles.has(e.key)) continue;
			if (within && !e.places.some((p) => within.has(p.key))) continue;
			if (isBattle(e)) continue;
			if (this.options.folder && !e.path.startsWith(this.options.folder + "/")) continue;
			if (!this.seen(e.key)) continue;
			if (!isMovement(e)) continue;
			if (at !== undefined && (!e.start || e.start.start > at)) continue;
			const pts = this.eventPath(e);
			if (pts.length < 2) continue;
			const now = at !== undefined && e.start && (e.end?.end ?? e.start.end) >= at;
			const color = entityColor(this.plugin, e.cultures[0] ? idx.get(e.cultures[0].ref.key) ?? e : e);
			const line = L.polyline(pts, { className: "universeview-movement" + (now ? " is-now" : ""), weight: 4, smoothFactor: 1 }).addTo(layer);
			(line.getElement() as HTMLElement | undefined)?.style.setProperty("--move-color", color);
			line.bindTooltip(`${e.name}${e.start ? ` · ${formatSpan(e.start, e.end, this.plugin.calendars.get(e.calendar))}` : ""}`, { sticky: true, className: "universeview-measure-tip" });
			line.on("click", (evt: L.LeafletMouseEvent) => {
				L.DomEvent.stop(evt);
				openEntity(this.plugin, e.key, evt.originalEvent);
			});
			this.arrowHead(layer, pts[pts.length - 2], pts[pts.length - 1], color, "universeview-move-head");
			// While it is under way on the slider's date, a dot shows how far along the path it has got.
			if (now && at !== undefined && e.start && (e.end || e.start.end > e.start.start)) {
				const here = pathPoint(pts.map((p) => [p.lat, p.lng] as [number, number]), progress(e, at));
				const dot = L.circleMarker(here, { className: "uv-traveller", radius: 7, interactive: false }).addTo(layer);
				(dot.getElement() as HTMLElement | undefined)?.style.setProperty("--move-color", color);
			}
		}
	}

	// ---- People at a date -----------------------------------------------------------------------------

	/**
	 * Each person on the slider's date, where they are: on an event's path, at an event's place, or at home
	 * (their latest residence, else where they were born). People in the same spot share one numbered bubble.
	 */
	redrawMoving() {
		this.drawMovements();
		this.drawPeople();
	}

	private drawPeople() {
		const layer = this.peopleLayer;
		if (!layer) return;
		layer.clearLayers();
		const at = this.options.at;
		if (!this.options.showPeople || at === undefined) return;
		const idx = this.plugin.index;
		const within = this.withinSet();
		const spots = new Map<string, { ll: L.LatLng; people: Entity[]; place?: string }>();
		for (const p of idx.all("person")) {
			if ((p.start && p.start.start > at) || (p.end && p.end.end < at) || !this.seen(p.key)) continue;
			if (this.options.folder && !p.path.startsWith(this.options.folder + "/")) continue;
			const events = idx.events(p.key);
			const ev = eventAt(p, events, at);
			let ll: L.LatLng | undefined;
			let place: string | undefined;
			if (ev && isMovement(ev) && ev.places.length > 1) {
				const pts = this.eventPath(ev);
				if (pts.length > 1) {
					const [lat, lng] = pathPoint(pts.map((x) => [x.lat, x.lng] as [number, number]), progress(ev, at));
					ll = L.latLng(lat, lng);
				}
			}
			if (!ll) {
				place = locationAt(p, events, at)?.key;
				ll = place ? this.latLngOf(place) : undefined;
			}
			if (!ll || (within && !(ev ? ev.places.some((r) => within.has(r.key)) : place && within.has(place)))) continue;
			const id = `${ll.lat.toFixed(4)},${ll.lng.toFixed(4)}`;
			const spot = spots.get(id) ?? { ll, people: [], place };
			spot.people.push(p);
			spots.set(id, spot);
		}
		for (const { ll, people, place } of spots.values()) {
			const html = el("div", { cls: "uv-person-dot", text: people.length > 1 ? String(people.length) : (people[0].name.charAt(0) || "?").toUpperCase() });
			html.style.setProperty("--pin-color", entityColor(this.plugin, people[0]));
			const names = people.map((p) => p.name);
			L.marker(ll, { icon: L.divIcon({ html, className: "universeview-pin-wrap", iconSize: [0, 0] }), zIndexOffset: 900 })
				.bindTooltip(names.length > 8 ? `${names.slice(0, 8).join(", ")} and ${names.length - 8} more` : names.join(", "), { direction: "top", offset: [0, -10] })
				.on("click", (evt: L.LeafletMouseEvent) => openEntity(this.plugin, people.length === 1 || !place ? people[0].key : place, evt.originalEvent))
				.addTo(layer);
		}
	}

	// ---- Wars and battles -------------------------------------------------------------------------

	/** Where a battle was fought: its first place on this map. */
	private battleSpot(b: Entity): L.LatLng | undefined {
		for (const p of b.places) {
			const ll = this.latLngOf(p.key);
			if (ll) return ll;
		}
		return undefined;
	}

	/**
	 * Battles as crossed swords beside the place they were fought, coloured by the side that won
	 * (grey while undecided or unmarked); a war's battles joined in the order fought, as its campaign.
	 * The time slider shows the battles fought by then, the latest one lit.
	 */
	private drawWars() {
		const layer = this.warLayer;
		const map = this.map;
		if (!map || !layer) return;
		layer.clearLayers();
		if (this.options.showWars === false) return;
		const idx = this.plugin.index;
		const at = this.options.at;
		const within = this.withinSet();
		const inScope = (e: Entity) => (!this.options.folder || e.path.startsWith(this.options.folder + "/")) && this.seen(e.key) && (at === undefined || (!!e.start && e.start.start <= at)) && (!within || e.places.some((p) => within.has(p.key)));
		const colourOf = (p: Entity | undefined) => (p ? entityColor(this.plugin, p) : "var(--text-muted)");
		// Campaigns first, so the swords sit on top of the lines.
		for (const [warKey, battles] of battlesByWar(idx)) {
			const war = idx.get(warKey);
			if (!war) continue;
			const pts = battles.filter(inScope).map((b) => this.battleSpot(b)).filter((x): x is L.LatLng => !!x);
			if (pts.length < 2) continue;
			const color = colourOf(victorOf(idx, war) ?? (war.cultures[0] ? idx.get(war.cultures[0].ref.key) : undefined));
			const line = L.polyline(pts, { className: "uv-campaign", weight: 3, dashArray: "2 7", lineCap: "round" }).addTo(layer);
			(line.getElement() as HTMLElement | undefined)?.style.setProperty("--move-color", color);
			line.bindTooltip(`${war.name}: ${pts.length} battles`, { sticky: true, className: "universeview-measure-tip" });
			line.on("click", (evt: L.LeafletMouseEvent) => {
				L.DomEvent.stop(evt);
				openEntity(this.plugin, war.key, evt.originalEvent);
			});
			this.arrowHead(layer, pts[pts.length - 2], pts[pts.length - 1], color, "universeview-move-head");
		}
		const shown = idx.all("event").filter((b) => isBattle(b) && inScope(b));
		const latest = at === undefined ? undefined : shown.reduce<Entity | undefined>((best, b) => (!best || (b.start?.start ?? 0) > (best.start?.start ?? 0) ? b : best), undefined);
		const cal = (e: Entity) => this.plugin.calendars.get(e.calendar);
		for (const b of shown) {
			const ll = this.battleSpot(b);
			if (!ll) continue;
			const won = victorOf(idx, b);
			const d = el("div", { cls: "uv-battle" + (won ? "" : " is-undecided") + (b === latest ? " is-latest" : "") });
			d.style.setProperty("--battle-color", colourOf(won));
			icon(d, "swords");
			const marker = L.marker(ll, { icon: L.divIcon({ html: d, className: "uv-battle-wrap", iconSize: [22, 22], iconAnchor: [-4, 26] }), keyboard: false, zIndexOffset: 400 }).addTo(layer);
			const sides = sidesOf(this.plugin.index, b).map((s) => `${s.party.name}${s.outcome ? ` (${s.outcome})` : ""}`).join(" vs ");
			const war = b.war ? idx.get(b.war.key) : undefined;
			const tip = [b.name, b.start ? formatSpan(b.start, b.end, cal(b)) : "", sides, war && war.type === "event" ? `Part of ${war.name}` : ""].filter(Boolean);
			const tipEl = el("div", { cls: "uv-battle-tip" });
			tip.forEach((t, i) => el("div", { cls: i === 0 ? "is-title" : "", text: t }, tipEl));
			marker.bindTooltip(tipEl, { direction: "top", className: "universeview-measure-tip", offset: [11, -26] });
			marker.on("click", (evt: L.LeafletMouseEvent) => {
				L.DomEvent.stop(evt);
				openEntity(this.plugin, b.key, evt.originalEvent);
			});
			marker.on("contextmenu", (evt: L.LeafletMouseEvent) => {
				L.DomEvent.stop(evt);
				showEntityMenu(this.plugin, b.key, evt.originalEvent);
			});
		}
	}

	/** A small triangle pointing from `a` to `b`, placed at `b`. */
	private arrowHead(layer: L.LayerGroup, a: L.LatLng, b: L.LatLng, color: string, cls: string) {
		const map = this.map!;
		const pa = map.latLngToLayerPoint(a);
		const pb = map.latLngToLayerPoint(b);
		const angle = (Math.atan2(pb.y - pa.y, pb.x - pa.x) * 180) / Math.PI;
		const d = el("div", { cls });
		d.style.setProperty("--move-color", color);
		d.style.transform = `translate(-50%, -50%) rotate(${angle}deg)`;
		L.marker(b, { icon: L.divIcon({ html: d, className: "universeview-vertex-wrap", iconSize: [0, 0] }), interactive: false, keyboard: false }).addTo(layer);
	}

	// ---- Map notes: sticky notes, arrows, lines ----------------------------------------------------

	/** The world map is shared by every world in the vault, so its notes belong to the world they were drawn in. */
	private noteWorld(): string {
		return this.options.folder ?? "";
	}

	private mapNotes(): MapNote[] {
		if (!this.isImageMap) return (this.plugin.settings.worldNotes ?? []).filter((n) => n.world === undefined || n.world === this.noteWorld());
		const raw = this.plugin.index.get(this.options.map)?.props.annotations;
		return Array.isArray(raw) ? (raw.filter((x) => x && typeof x === "object") as MapNote[]) : [];
	}

	/** Saves the map's notes: in the map note for image maps, in UniverseView's settings for the world map. */
	private async saveMapNotes(notes: MapNote[], label: string) {
		if (!this.isImageMap) {
			// Other worlds' notes are kept; the ones shown here (older untagged ones too) now belong to this world.
			const scope = this.noteWorld();
			const others = (this.plugin.settings.worldNotes ?? []).filter((n) => n.world !== undefined && n.world !== scope);
			this.plugin.settings.worldNotes = [...others, ...notes.map((n) => ({ ...n, world: n.world ?? scope }))];
			await this.plugin.saveSettings();
			this.drawNotes();
			return;
		}
		const file = this.plugin.app.vault.getAbstractFileByPath(this.options.map);
		if (!(file instanceof TFile)) return;
		await this.plugin.editFrontmatter(file, (f) => {
			if (notes.length) f.annotations = notes;
			else delete f.annotations;
		}, label);
	}

	private drawNotes() {
		const layer = this.noteLayer;
		if (!this.map || !layer) return;
		layer.clearLayers();
		if (this.options.showNotes === false) return;
		const notes = this.mapNotes();
		notes.forEach((n, i) => {
			const pts = readPoints(n.points).map((p) => this.pointToLatLng(p));
			if (!pts.length) return;
			const color = n.color || "#e8b33a";
			const menu = (evt: L.LeafletMouseEvent) => {
				L.DomEvent.stop(evt);
				const m = new Menu();
				{
					m.addItem((it) => it.setTitle(n.kind === "note" ? "Edit the note…" : "Label and colour…").setIcon("pencil").onClick(() => mapNoteSheet(this.plugin, { kind: n.kind, text: n.text, color }, (text, c) => {
						const next = [...notes];
						next[i] = { ...n, text, color: c };
						void this.saveMapNotes(next, "Edit a map note");
					})));
				}
				if (n.kind !== "note") {
					m.addItem((it) => it.setTitle("Edit its shape").setIcon("spline").onClick(() =>
						this.startEdit("", i, "route", {
							name: n.text || (n.kind === "line" ? "the line" : "the arrow"),
							points: readPoints(n.points),
							color,
							save: async (points) => {
								const next = [...this.mapNotes()];
								next[i] = { ...next[i], points: writePoints(points) };
								await this.saveMapNotes(next, "Edit a map line");
							},
						}),
					));
				}
				m.addItem((it) => it.setTitle("Erase in a box…").setIcon("box-select").onClick(() => this.startErase()));
				// Removing comes last, set apart and in red, so it's never clicked instead of an edit.
				m.addSeparator();
				warningItem(m, `Delete this ${n.kind === "note" ? "note" : n.kind}`, "trash-2", () => void this.saveMapNotes(notes.filter((_, j) => j !== i), "Delete a map note"));
				// Coastlines and other lines drawn at once share a colour: take them all off together.
				const same = notes.filter((x) => x.kind === n.kind && (x.color || "#e8b33a") === color);
				if (same.length > 1) {
					warningItem(m, `Delete all ${same.length} ${n.kind === "note" ? "notes" : "lines"} of this colour`, "trash", () => {
						void this.saveMapNotes(notes.filter((x) => !same.includes(x)), `Delete ${same.length} map lines`).then(() => new Notice(`Deleted ${same.length} map ${n.kind === "note" ? "notes" : "lines"}. Undo puts them back.`));
					});
				}
				const lines = notes.filter((x) => x.kind !== "note");
				if (n.kind !== "note" && lines.length > same.length) {
					warningItem(m, `Delete every map line (${lines.length})`, "trash", () => {
						void this.saveMapNotes(notes.filter((x) => x.kind === "note"), `Delete ${lines.length} map lines`).then(() => new Notice(`Deleted ${lines.length} map lines. Undo puts them back.`));
					});
				}
				m.showAtMouseEvent(evt.originalEvent);
			};
			if (n.kind === "note") {
				const card = el("div", { cls: "universeview-map-note", text: n.text ?? "" });
				card.style.setProperty("--note-color", color);
				const mk = L.marker(pts[0], { icon: L.divIcon({ html: card, className: "universeview-map-note-wrap", iconSize: [0, 0] }), keyboard: false }).addTo(layer);
				mk.on("contextmenu", menu);
				return;
			}
			if (pts.length < 2) return;
			const line = L.polyline(pts, { className: `universeview-map-line kind-${n.kind}`, weight: n.kind === "arrow" ? 4 : 3 }).addTo(layer);
			(line.getElement() as HTMLElement | undefined)?.style.setProperty("--note-color", color);
			line.on("contextmenu", menu);
			if (n.text) line.bindTooltip(n.text, { permanent: true, direction: "center", className: "universeview-map-line-label" });
			if (n.kind === "arrow") this.arrowHead(layer, pts[pts.length - 2], pts[pts.length - 1], color, "universeview-move-head is-note");
		});
	}

	/** Takes several of a note's areas on this map off in one change. */
	private deleteAreas(key: string, ns: number[]): Promise<void> {
		return this.plugin.saveShapes("territory", key, this.options.map, ns, null);
	}

	/**
	 * Drag a box to take everything wholly inside it off the map: map lines, arrows and notes, and
	 * painted areas (oceans or coasts saved as dozens of pieces). The notes themselves stay.
	 */
	startErase() {
		const map = this.map;
		if (!map || !this.toolLayer) return;
		this.endMode();
		const layer = this.toolLayer;
		let start: L.LatLng | undefined;
		let box: L.Rectangle | undefined;
		map.dragging.disable();
		const down = (evt: L.LeafletMouseEvent) => {
			if (evt.originalEvent.button !== 0) return;
			start = evt.latlng;
			box?.remove();
			box = L.rectangle(L.latLngBounds(start, start), { className: "universeview-erase-box", weight: 2, dashArray: "6 4", fillOpacity: 0.08, interactive: false }).addTo(layer);
		};
		const move = (evt: L.LeafletMouseEvent) => {
			if (start && box) box.setBounds(L.latLngBounds(start, evt.latlng));
		};
		const up = (evt: L.LeafletMouseEvent) => {
			if (!start || !box) return;
			const b = L.latLngBounds(start, evt.latlng);
			start = undefined;
			box.remove();
			box = undefined;
			this.eraseIn(b);
		};
		map.on("mousedown", down);
		map.on("mousemove", move);
		map.on("mouseup", up);
		this.modeCleanup.push(() => {
			map.off("mousedown", down);
			map.off("mousemove", move);
			map.off("mouseup", up);
			map.dragging.enable();
		});
		this.beginMode("erase", (evt) => {
			if (evt.key !== "Escape") return;
			evt.stopPropagation();
			this.endMode();
		});
		this.showBanner("Erase: drag a box, and lines, notes and painted areas wholly inside it come off the map (the notes themselves stay) · Undo puts them back", [{ label: "Done", cta: true, run: () => this.endMode() }]);
	}

	private eraseIn(b: L.LatLngBounds) {
		const inside = (pts: Pt[]) => pts.length > 0 && pts.every((p) => b.contains(this.pointToLatLng(p)));
		const notes = this.mapNotes();
		const keep = notes.filter((n) => !inside(readPoints(n.points)));
		const lines = notes.length - keep.length;
		const byOwner = new Map<string, number[]>();
		for (const a of this.drawnAreas) if (inside(a.points)) byOwner.set(a.key, [...(byOwner.get(a.key) ?? []), a.n]);
		const areas = [...byOwner.values()].reduce((s, l) => s + l.length, 0);
		if (!lines && !areas) {
			new Notice("Nothing lies wholly inside that box.");
			return;
		}
		const jobs: Promise<void>[] = [];
		if (lines) jobs.push(this.saveMapNotes(keep, `Erase ${lines} map line${lines === 1 ? "" : "s"}`));
		for (const [k, ns] of byOwner) jobs.push(this.deleteAreas(k, ns));
		const said = [lines ? `${lines} line${lines === 1 ? "" : "s"} and notes` : "", areas ? `${areas} area${areas === 1 ? "" : "s"}` : ""].filter(Boolean).join(" and ");
		void Promise.all(jobs).then(() => new Notice(`Erased ${said}. Undo (Ctrl+Alt+Z) puts them back.`));
	}

	/** Draw a sticky note, an arrow or a line on the map for planning. */
	startAnnotate() {
		const map = this.map;
		if (!map || !this.toolLayer) return;
		this.endMode();
		const layer = this.toolLayer;
		let kind: MapNote["kind"] = "note";
		let color = "#e8b33a";
		const pts: L.LatLng[] = [];
		const draft = L.polyline([], { className: "universeview-map-line is-draft", weight: 3, dashArray: "4 6" }).addTo(layer);
		// The points placed so far, and (for an arrow) where its head will go, so it's clear something is happening.
		const marks = L.layerGroup().addTo(layer);
		let status: HTMLElement | undefined;
		const showDraft = () => {
			draft.setLatLngs(pts);
			marks.clearLayers();
			for (const p of pts) L.circleMarker(p, { radius: 4, className: "uv-note-point", interactive: false }).addTo(marks);
			if (kind === "arrow" && pts.length >= 2) this.arrowHead(marks, pts[pts.length - 2], pts[pts.length - 1], color, "universeview-move-head is-note");
			status?.setText(kind === "note" ? "" : !pts.length ? `Click where the ${kind} starts` : pts.length === 1 ? "Click where it goes next" : `${pts.length} points · Finish to place the ${kind}`);
		};
		const finishLine = (quiet = false) => {
			if (pts.length < 2) {
				if (!quiet) new Notice(`Click at least two points for the ${kind}.`);
				return;
			}
			const points = writePoints(pts.map((ll) => this.fromLatLng(ll)));
			pts.length = 0;
			showDraft();
			// A label can be added afterwards from its right-click menu.
			void this.saveMapNotes([...this.mapNotes(), { kind, points, color }], `Add a map ${kind}`).then(() => new Notice(`Placed the ${kind}. Right-click it to label or delete it.`));
		};
		const undoPoint = () => {
			pts.pop();
			showDraft();
		};
		this.beginMode("notes", (evt) => {
			if (evt.key === "Escape") this.endMode();
			else if (evt.key === "Enter" && kind !== "note") finishLine();
			else if (evt.key === "Backspace" && kind !== "note") undoPoint();
			else return;
			evt.preventDefault();
			evt.stopPropagation();
		});
		this.root.addClass("is-measuring");
		map.doubleClickZoom.disable();
		this.showBanner("Map notes: click to place a note, or click points for an arrow or line, then Finish (or Enter, or double-click) · right-click a note or line to label or delete it", [
			{ label: "Undo point", run: undoPoint },
			{ label: "Finish", run: () => finishLine() },
			// Done keeps an arrow or line in progress rather than throwing it away.
			{
				label: "Done",
				cta: true,
				run: () => {
					finishLine(true);
					this.endMode();
				},
			},
		], (b) => {
			const controls = el("div", { cls: "universeview-fill-controls" }, b);
			b.addClass("has-fill-controls");
			// What to draw, as buttons rather than a dropdown.
			const seg = el("div", { cls: "uv-banner-segments" }, controls);
			for (const [v, t, ic] of [["note", "Note", "sticky-note"], ["arrow", "Arrow", "move-up-right"], ["line", "Line", "spline"]] as const) {
				const s = el("button", { cls: "uv-banner-segment" + (kind === v ? " is-active" : "") }, seg);
				icon(el("span", {}, s), ic);
				el("span", { text: t }, s);
				s.addEventListener("click", (evt) => {
					evt.stopPropagation();
					kind = v;
					pts.length = 0;
					showDraft();
					seg.querySelectorAll(".is-active").forEach((x) => x.removeClass("is-active"));
					s.addClass("is-active");
				});
			}
			status = el("span", { cls: "universeview-fill-status" }, controls);
			const colors = el("div", { cls: "universeview-note-colors" }, controls);
			for (const c of ["#e8b33a", "#e05252", "#3d8fd1", "#3bb273", "#9b59b6", "#333333"]) {
				const sw = el("button", { cls: "universeview-note-swatch" + (c === color ? " is-active" : ""), attr: { "aria-label": `Colour ${c}` } }, colors);
				sw.style.background = c;
				sw.addEventListener("click", (evt) => {
					evt.stopPropagation();
					color = c;
					colors.querySelectorAll(".is-active").forEach((x) => x.removeClass("is-active"));
					sw.addClass("is-active");
					showDraft();
				});
			}
		});
		const onClick = (evt: L.LeafletMouseEvent) => {
			if (kind === "note") {
				const at = evt.latlng;
				mapNoteSheet(this.plugin, { kind: "note", color, isNew: true }, (text, c) => void this.saveMapNotes([...this.mapNotes(), { kind: "note", points: writePoints([this.fromLatLng(at)]), text, color: c }], "Add a map note"));
				return;
			}
			pts.push(evt.latlng);
			showDraft();
		};
		const onDbl = (evt: L.LeafletMouseEvent) => {
			L.DomEvent.stop(evt);
			if (kind !== "note") {
				// The double-click's second click added a point on top of the last one.
				if (pts.length > 2) pts.pop();
				finishLine();
			}
		};
		map.on("click", onClick);
		map.on("dblclick", onDbl);
		this.modeCleanup.push(() => {
			map.off("click", onClick);
			map.off("dblclick", onDbl);
		});
	}

	// ---- Clusters ------------------------------------------------------------------------------------

	/** When zoomed out on a crowded map, pins close together merge into a numbered bubble. */
	private applyClusters() {
		const map = this.map;
		const layer = this.clusterLayer;
		if (!map || !layer) return;
		layer.clearLayers();
		for (const p of this.pins) p.marker.getElement()?.removeClass("is-clustered");
		if (this.options.cluster === false || this.pins.length < 30 || this.options.showPins === false) return;
		const z = map.getZoom();
		const low = this.isImageMap ? z < this.layerZoom(3) : z < 7;
		if (!low) return;
		const idx = this.plugin.index;
		const visible = this.pins
			.filter((p) => !p.marker.getElement()?.hasClass("is-layer-hidden"))
			.map((p) => ({ p, pt: map.latLngToContainerPoint(L.latLng(p.latlng)) }))
			.sort((a, b) => b.p.place.importance - a.p.place.importance || b.p.events.length - a.p.events.length);
		const used = new Set<Pin>();
		for (const { p, pt } of visible) {
			if (used.has(p)) continue;
			const group = visible.filter((o) => !used.has(o.p) && o.pt.distanceTo(pt) < 46);
			if (group.length < 3) continue;
			for (const g of group) {
				used.add(g.p);
				g.p.marker.getElement()?.addClass("is-clustered");
			}
			// Name the bubble after the region most of them are in, or its most important place.
			const regions = new Map<string, number>();
			for (const g of group) {
				let top: Entity | undefined;
				for (let cur = g.p.place.locatedIn ? idx.get(g.p.place.locatedIn.key) : undefined, i = 0; cur && i < 12; cur = cur.locatedIn ? idx.get(cur.locatedIn.key) : undefined, i++) top = cur;
				if (top) regions.set(top.name, (regions.get(top.name) ?? 0) + 1);
			}
			const region = [...regions.entries()].sort((a, b) => b[1] - a[1])[0];
			const name = region && region[1] >= group.length / 2 ? region[0] : `${p.place.name} and more`;
			const lat = group.reduce((s, g) => s + L.latLng(g.p.latlng).lat, 0) / group.length;
			const lng = group.reduce((s, g) => s + L.latLng(g.p.latlng).lng, 0) / group.length;
			const html = el("div", { cls: "universeview-cluster" });
			el("span", { cls: "universeview-cluster-count", text: String(group.length) }, html);
			el("span", { cls: "universeview-cluster-label", text: name }, html);
			const mk = L.marker([lat, lng], { icon: L.divIcon({ html, className: "universeview-pin-wrap", iconSize: [0, 0] }), keyboard: true, title: `${group.length} places: zoom in` }).addTo(layer);
			mk.on("click", () => map.flyToBounds(L.latLngBounds(group.map((g) => L.latLng(g.p.latlng))).pad(0.4), { duration: motionMs(this.plugin.settings, 500) / 1000 || 0.01 }));
		}
	}

	// ---- Travel: rings and journeys ------------------------------------------------------------------

	/** Kilometres per map unit (image maps with a real scale; the world map measures in metres). */
	private kmPerMapUnit(): number | undefined {
		if (!this.isImageMap) return 0.001;
		const s = this.mapScale();
		const k = s && kmPerUnit(s.unit);
		return s && k ? s.perPx * k : undefined;
	}

	/** Kilometres a day for a way of travelling: the world note's `travel:` speeds, or typical ones. */
	private speed(mode: string): number {
		const w = this.plugin.index.worldFor(this.options.folder ?? (this.isImageMap ? this.options.map : ""))?.travel ?? {};
		const alias: Record<string, string[]> = { foot: ["foot", "walk", "walking"], horse: ["horse", "riding", "ride"], wagon: ["wagon", "cart", "caravan"], boat: ["boat", "river", "barge"], ship: ["ship", "sea", "sail"] };
		for (const k of alias[mode] ?? [mode]) if (w[k] > 0) return w[k];
		return SPEED_KM[mode] ?? SPEED_KM.horse;
	}

	/** Kilometres a day along a kind of route, from the world note when it says. */
	private routeSpeed(kind: string): number {
		const w = this.plugin.index.worldFor(this.options.folder ?? (this.isImageMap ? this.options.map : ""))?.travel ?? {};
		if (w[kind] > 0) return w[kind];
		const by: Record<string, string> = { sea: "ship", river: "boat", road: "horse", trade: "wagon", path: "foot", rail: "rail" };
		const mode = by[kind];
		return (mode && w[mode] > 0 ? w[mode] : undefined) ?? ROUTE_SPEED[kind] ?? this.speed("horse");
	}

	/** Circles showing how far you can travel in 1, 3, 7 and 14 days from a point. */
	startRings(center: L.LatLng, name: string) {
		const map = this.map;
		if (!map || !this.toolLayer) return;
		const perUnit = this.kmPerMapUnit();
		if (!perUnit) {
			new Notice("This map needs a scale with a real unit (e.g. `scale: 100 px = 5 km` on the map note) to show travel distances.");
			return;
		}
		this.endMode();
		const layer = this.toolLayer;
		let mode = "horse";
		let fitTo: L.Circle | undefined;
		const draw = () => {
			layer.clearLayers();
			const daysList = [1, 3, 7, 14];
			// Rings much bigger than the map (a fortnight by ship on a small island) only add clutter.
			const biggest = this.isImageMap ? 3 * Math.max(this.imageWidth, this.imageHeight) : 20_000_000;
			fitTo = undefined;
			daysList.forEach((d, i) => {
				const km = this.speed(mode) * d;
				const radius = this.isImageMap ? km / perUnit : km * 1000;
				if (i > 0 && radius > biggest) return;
				const ring = L.circle(center, { radius, className: `universeview-ring ring-${i}`, weight: 1.5, interactive: false }).addTo(layer);
				if (d <= 3) fitTo = ring;
				const edge = this.isImageMap ? L.latLng(center.lat + radius, center.lng) : L.latLng(center.lat + km / 111, center.lng);
				L.marker(edge, { icon: L.divIcon({ html: el("div", { cls: "universeview-ring-label", text: `${d} day${d > 1 ? "s" : ""}` }), className: "universeview-vertex-wrap", iconSize: [0, 0] }), interactive: false }).addTo(layer);
			});
		};
		this.beginMode("rings", (evt) => {
			if (evt.key !== "Escape") return;
			evt.stopPropagation();
			this.endMode();
		});
		this.showBanner(`How far from ${name}: rings at 1, 3, 7 and 14 days of travel in a straight line`, [{ label: "Done", cta: true, run: () => this.endMode() }], (b) => {
			const controls = el("div", { cls: "universeview-fill-controls" }, b);
			b.addClass("has-fill-controls");
			const sel = el("select", { cls: "universeview-fill-select", attr: { "aria-label": "Way of travelling" } }, controls);
			for (const [v, t] of [["foot", "On foot"], ["horse", "By horse"], ["wagon", "By wagon"], ["boat", "By river boat"], ["ship", "By ship"]]) sel.add(new Option(t, v));
			sel.value = mode;
			sel.addEventListener("change", () => {
				mode = sel.value;
				draw();
			});
		});
		draw();
		// Frame the 3-day ring so the nearer rings are readable and the outer ones show their reach.
		if (fitTo) map.flyToBounds(fitTo.getBounds().pad(0.15), { duration: motionMs(this.plugin.settings, 500) / 1000 || 0.01 });
	}

	/** Asks for a destination, then shows the quickest way there along roads, rivers and sea lanes. */
	journeyFrom(fromKey: string) {
		new EntityPickerModal(this.plugin, ["place"], (to) => this.showJourney(fromKey, to.key), "Journey to which place?").open();
	}

	/** The roads, rivers and sea lanes in force on the slider's date, and the slow terrain, as the planner wants them (kept until the lands are redrawn). */
	private network?: { key: string; routes: RouteLine[]; terrain: { poly: XY[]; factor: number }[]; paths: Map<string, L.LatLng[]> };

	private networkNow() {
		const idx = this.plugin.index;
		const key = `${this.drawVersion}|${this.options.at ?? ""}|${idx.version}`;
		if (this.network?.key === key) return this.network;
		const xy = (ll: L.LatLng): XY => [ll.lng, ll.lat];
		const routes: RouteLine[] = idx.all().flatMap((e) => this.areasHere(e, "route").filter(({ t }) => this.shapeNow(t)).map(({ t }) => ({ points: t.points.map((p) => xy(this.pointToLatLng(p))), kind: t.kind ?? "road", name: t.name ?? e.name })));
		const terrain = idx.all().filter((e) => e.terrain && TERRAIN_SLOW[e.terrain]).flatMap((e) => this.areasHere(e).map(({ t }) => ({ poly: t.points.map((p) => xy(this.pointToLatLng(p))), factor: TERRAIN_SLOW[e.terrain!] })));
		this.network = { key, routes, terrain, paths: new Map() };
		return this.network;
	}

	/** The quickest way between two spots along the map's routes (in km where the map has a real scale, else in its own units). */
	private planBetween(la: L.LatLng, lb: L.LatLng) {
		const map = this.map!;
		const perUnit = this.kmPerMapUnit();
		const xy = (ll: L.LatLng): XY => [ll.lng, ll.lat];
		// Distances in km where the map has a real scale; otherwise in map units (no travel times then).
		const dist = (p: XY, q: XY) => (this.isImageMap ? Math.hypot(p[0] - q[0], p[1] - q[1]) * (perUnit ?? 1) : map.distance(L.latLng(p[1], p[0]), L.latLng(q[1], q[0])) / 1000);
		const { routes, terrain } = this.networkNow();
		const straight = dist(xy(la), xy(lb));
		const j = planJourney(routes, xy(la), xy(lb), {
			dist,
			speed: (k) => (perUnit ? this.routeSpeed(k) : 1),
			footSpeed: perUnit ? this.speed("foot") : 1,
			join: straight * 0.02,
			access: Math.max(straight * 0.25, perUnit ? 10 : 30),
			slow: terrain.length ? (p, q) => terrainFactor(p, q, terrain) : undefined,
		});
		return { j, perUnit };
	}

	/** The points of an event's path: its places in order, with each stretch following roads, rivers and sea lanes when that is quicker than a straight line. */
	private eventPath(e: Entity): L.LatLng[] {
		const stops = e.places.map((p) => this.latLngOf(p.key)).filter((x): x is L.LatLng => !!x);
		if (stops.length < 2) return stops;
		const net = this.networkNow();
		if (!net.routes.length || stops.length > 8) return stops;
		const out: L.LatLng[] = [stops[0]];
		for (let i = 1; i < stops.length; i++) {
			const a = stops[i - 1];
			const b = stops[i];
			const id = `${a.lat},${a.lng}>${b.lat},${b.lng}`;
			let leg = net.paths.get(id);
			if (!leg) {
				const { j } = this.planBetween(a, b);
				// Only a stretch that really uses a route is bent; walking straight there stays a straight line.
				leg = j.legs.some((l) => l.kind !== "foot") ? j.path.map(([x, y]) => L.latLng(y, x)) : [a, b];
				net.paths.set(id, leg);
			}
			out.push(...leg.slice(1));
		}
		return out;
	}

	showJourney(fromKey: string, toKey: string) {
		const map = this.map;
		const idx = this.plugin.index;
		const a = idx.get(fromKey);
		const b = idx.get(toKey);
		const la = a && this.toLatLng(a);
		const lb = b && this.toLatLng(b);
		if (!map || !this.toolLayer || !a || !b || !la || !lb) {
			new Notice("Both places need to be on this map.");
			return;
		}
		const { j, perUnit } = this.planBetween(L.latLng(la), L.latLng(lb));
		this.endMode();
		const layer = this.toolLayer;
		const line = L.polyline(j.path.map(([x, y]) => L.latLng(y, x)), { className: "universeview-journey", weight: 5 }).addTo(layer);
		this.arrowHead(layer, L.latLng(j.path[j.path.length - 2][1], j.path[j.path.length - 2][0]), L.latLng(lb), "var(--interactive-accent)", "universeview-move-head is-journey");
		map.flyToBounds(line.getBounds().pad(0.25), { duration: motionMs(this.plugin.settings, 500) / 1000 || 0.01 });
		const fmtDist = (d: number) => (perUnit ? `${Math.round(d).toLocaleString()} km` : `${Math.round(d).toLocaleString()} ${this.mapScale()?.unit ?? "px"}`);
		// Stepping on and off a road isn't worth mentioning.
		const legText = j.legs.filter((l) => l.distance >= Math.max(0.5, j.distance * 0.02)).map((l) => `${l.name && l.kind !== "foot" ? l.name : l.kind === "foot" ? "cross-country" : l.kind} ${fmtDist(l.distance)}${perUnit ? ` (${days(l.days)})` : ""}`).join(" → ");
		this.beginMode("journey", (evt) => {
			if (evt.key !== "Escape") return;
			evt.stopPropagation();
			this.endMode();
		});
		this.showBanner(`${a.name} → ${b.name}: ${fmtDist(j.distance)}${perUnit ? `, about ${days(j.days)}` : ""}. ${legText}${perUnit ? "" : " (add a scale with a real unit to the map note for travel times)"}`, [
			{ label: "Done", cta: true, run: () => this.endMode() },
		]);
	}

	// ---- Borders drawn from seats of power --------------------------------------------------------

	/**
	 * Shares the land out between the groups holding places on this map: each group's land is
	 * everything nearer (over land) to its places than to anyone else's. A first draft to refine.
	 */
	async startBorders() {
		if (!this.map || !this.isImageMap) {
			new Notice("Borders from seats work on image maps (they follow the coasts in the image).");
			return;
		}
		const idx = this.plugin.index;
		const at = this.options.at;
		const seats: { key: string; ll: L.LatLng }[] = [];
		for (const p of idx.all("place")) {
			const ll = this.toLatLng(p);
			if (!ll) continue;
			const c = p.cultures.find((x) => at === undefined || activeAt(x, at)) ?? (at === undefined ? p.cultures[0] : undefined);
			if (c && idx.get(c.ref.key)) seats.push({ key: c.ref.key, ll: L.latLng(ll) });
		}
		const owners = [...new Set(seats.map((s) => s.key))];
		if (owners.length < 1) {
			new Notice("No places on this map belong to a group yet. Give places `cultures: [[Realm]]` first.");
			return;
		}
		let raster: { img: Raster; scale: number } | null = null;
		try {
			raster = await this.loadRaster();
		} catch {
			raster = null;
		}
		const map = this.map;
		if (!raster || !map || !this.toolLayer) {
			new Notice("Couldn't read this map image's pixels.");
			return;
		}
		this.endMode();
		const { img, scale } = raster;
		const layer = this.toolLayer;
		let result: { key: string; rings: Pt[][] }[] = [];
		let replace = true;
		const compute = () => {
			const seeds = seats.map((s) => {
				const [x, y] = this.fromLatLng(s.ll);
				return { x: x / scale, y: y / scale, label: owners.indexOf(s.key) + 1 };
			});
			const labels = partitionLand(img, seeds, { tolerance: this.fillTolerance, seal: this.fillGaps });
			result = owners.map((key, i) => ({
				key,
				rings: labelOutlines(labels, img.width, img.height, i + 1).map((r) => simplifyRing(r, 1.2).map(([x, y]) => [round(x * scale, 1), round(y * scale, 1)] as Pt)).filter((r) => r.length >= 3),
			}));
			layer.clearLayers();
			for (const r of result) {
				const owner = idx.get(r.key)!;
				for (const ring of r.rings) {
					const poly = L.polygon(ring.map((p) => this.pointToLatLng(p)), { className: "universeview-territory is-draft is-fill", weight: 2, fillOpacity: 0.3, interactive: false }).addTo(layer);
					(poly.getElement() as HTMLElement | undefined)?.style.setProperty("--terr-color", entityColor(this.plugin, owner));
				}
			}
		};
		const save = () => {
			const out = result.filter((r) => r.rings.length);
			this.endMode();
			void this.plugin.undoGroup(`Borders for ${out.length} groups`, async () => {
				for (const r of out) await this.plugin.setAreas(r.key, this.options.map, r.rings, replace);
			}).then(() => new Notice(`Drew borders for ${out.length} groups. Edit any of them by right-clicking; Undo puts things back.`));
		};
		this.beginMode("borders", (evt) => {
			if (evt.key === "Escape") this.endMode();
			else if (evt.key === "Enter") save();
			else return;
			evt.stopPropagation();
		});
		this.showBanner(`Borders from seats: the land is shared between ${owners.length} groups by who is nearest over land`, [
			{ label: "Cancel", run: () => this.endMode() },
			{ label: "Save", cta: true, run: save },
		], (b) => {
			const controls = el("div", { cls: "universeview-fill-controls" }, b);
			b.addClass("has-fill-controls");
			const tol = el("label", { cls: "universeview-fill-control", title: "How different a colour can be and still count as land" }, controls);
			el("span", { text: "Tolerance" }, tol);
			const range = el("input", { attr: { type: "range", min: "2", max: "60", step: "1" } }, tol);
			range.value = String(this.fillTolerance);
			range.addEventListener("change", () => {
				this.fillTolerance = +range.value;
				compute();
			});
			const rep = el("button", { cls: "universeview-banner-toggle is-active", text: "Replace their areas on this map", attr: { "aria-pressed": "true" } }, controls);
			rep.addEventListener("click", (evt) => {
				evt.stopPropagation();
				replace = !replace;
				rep.toggleClass("is-active", replace);
				rep.setAttribute("aria-pressed", String(replace));
			});
		});
		compute();
	}

	// ---- Reading coasts, roads and rivers from the image --------------------------------------------

	/** A labelled range input for the tool banners. */
	private slider(parent: HTMLElement, label: string, title: string, min: number, max: number, value: number, onChange: (v: number) => void) {
		const wrap = el("label", { cls: "universeview-fill-control", title }, parent);
		el("span", { text: label }, wrap);
		const range = el("input", { attr: { type: "range", min: String(min), max: String(max), step: "1" } }, wrap);
		range.value = String(value);
		const out = el("span", { cls: "universeview-fill-value", text: String(value) }, wrap);
		range.addEventListener("input", () => out.setText(range.value));
		range.addEventListener("change", () => onChange(+range.value));
	}

	/** The image's pixels for a detection tool, with the usual notices when they can't be read. */
	private async rasterForTool(what: string): Promise<{ img: Raster; scale: number } | null> {
		if (!this.map || !this.isImageMap) {
			new Notice(`${what} reads the map image, so it works on image maps.`);
			return null;
		}
		try {
			const r = await this.loadRaster();
			if (r) return r;
		} catch (err) {
			console.error("UniverseView:", err);
		}
		new Notice("Couldn't read this map image's pixels.");
		return null;
	}

	/**
	 * Finds the coastline: the sea is taken from the image's edge (or where you click), wave patterns
	 * and labels on it are smoothed over, and every landmass is outlined. Save the outlines as areas of
	 * a place or group (an island, a continent), or as lines on the map.
	 */
	async startCoast() {
		const raster = await this.rasterForTool("Finding coasts");
		const map = this.map;
		if (!raster || !map || !this.toolLayer) return;
		this.endMode();
		const { img, scale } = raster;
		const mapKey = this.options.map;
		const layer = this.toolLayer;
		const seeds: Pt[] = [];
		const opts = { tolerance: 16, smooth: 3, minIsland: Math.round((img.width * img.height) / 4000) + 20 };
		let rings: Pt[][] = [];
		let status: HTMLElement | undefined;
		const compute = () => {
			this.root.addClass("is-busy");
			window.setTimeout(() => {
				const res = detectCoast(img, opts, seeds);
				rings = res.rings.map((r) => r.map(([x, y]) => [round(x * scale, 1), round(y * scale, 1)] as Pt));
				layer.clearLayers();
				for (const r of rings) L.polygon(r.map((p) => this.pointToLatLng(p)), { className: "universeview-trace-coast", weight: 2.5, fillOpacity: 0.08, interactive: false }).addTo(layer);
				const sea = Math.round(res.share * 100);
				status?.setText(rings.length ? `${rings.length} landmass${rings.length === 1 ? "" : "es"} · ${sea}% sea` : "No land found: click on the sea, or raise the tolerance");
				status?.toggleClass("is-warning", !rings.length || res.share < 0.05 || res.share > 0.97);
				this.root.removeClass("is-busy");
			}, 16);
		};
		const asAreas = () => {
			if (!rings.length) return;
			const found = [...rings];
			new EntityPickerModal(this.plugin, ["place", "culture"], (e) => {
				this.endMode();
				void this.plugin.setAreas(e.key, mapKey, found, false).then(() => new Notice(`Added ${found.length} area${found.length === 1 ? "" : "s"} to ${e.name}. Undo takes ${found.length === 1 ? "it" : "them"} off.`));
			}, "Whose land is this? (an island, a continent, a realm…)").open();
		};
		const asLines = () => {
			if (!rings.length) return;
			const lines: MapNote[] = rings.map((r) => ({ kind: "line", points: writePoints([...r, r[0]]), color: "#2878b5", text: undefined }));
			this.endMode();
			void this.saveMapNotes([...this.mapNotes(), ...lines], "Add coastlines").then(() => new Notice(`Drew ${lines.length} coastline${lines.length === 1 ? "" : "s"} as map lines (right-click one to label or delete it).`));
		};
		this.beginMode("coast", (evt) => {
			if (evt.key !== "Escape") return;
			evt.stopPropagation();
			this.endMode();
		});
		this.showBanner("Find coasts: the sea is read from the edge of the image · click on the sea if it picked the wrong colour", [
			{ label: "Cancel", run: () => this.endMode() },
			{ label: "Save as map lines", run: asLines },
			{ label: "Save as areas…", cta: true, run: asAreas },
		], (b) => {
			const controls = el("div", { cls: "universeview-fill-controls" }, b);
			b.addClass("has-fill-controls");
			this.slider(controls, "Tolerance", "How different a colour can be and still count as sea", 4, 60, opts.tolerance, (v) => {
				opts.tolerance = v;
				compute();
			});
			this.slider(controls, "Smoothing", "Waves, grid lines and labels on the sea thinner than this are ignored", 0, 8, opts.smooth, (v) => {
				opts.smooth = v;
				compute();
			});
			this.slider(controls, "Smallest island", "Islands smaller than this (in pixels of the image) are left out", 10, 2000, opts.minIsland, (v) => {
				opts.minIsland = v;
				compute();
			});
			status = el("span", { cls: "universeview-fill-status" }, controls);
		});
		const onClick = (evt: L.LeafletMouseEvent) => {
			const [x, y] = this.fromLatLng(evt.latlng);
			const rx = x / scale;
			const ry = y / scale;
			if (rx < 0 || ry < 0 || rx >= img.width || ry >= img.height) return;
			// A click picks the sea; clicks after the first add more seas (lakes, a second ocean).
			seeds.push([Math.floor(rx), Math.floor(ry)]);
			compute();
		};
		map.on("click", onClick);
		this.modeCleanup.push(() => map.off("click", onClick));
		compute();
	}

	/**
	 * Traces roads and rivers drawn in the image, so journeys and travel times follow them. By default
	 * you click along a road and the line between your clicks keeps to it round bends and across
	 * dashes; or, for maps whose roads have a colour of their own, one click finds the whole network.
	 */
	async startTraceLines() {
		const raster = await this.rasterForTool("Tracing roads and rivers");
		const map = this.map;
		if (!raster || !map || !this.toolLayer) return;
		this.endMode();
		const { img, scale } = raster;
		const mapKey = this.options.map;
		const layer = this.toolLayer;
		const opts = { tolerance: 12, gap: 10, minLength: 24, connected: true };
		let kind = "road";
		let network = false;
		// Lines in image pixels: finished ones, and the one being followed (with where each click's part starts).
		const done: Pt[][] = [];
		let cur: Pt[] = [];
		let curColor: [number, number, number] | null = null;
		const parts: number[] = [];
		let status: HTMLElement | undefined;
		const toMap = (l: Pt[]) => l.map(([x, y]) => this.pointToLatLng([round(x * scale, 1), round(y * scale, 1)]));
		const lengthOf = (l: Pt[]) => l.reduce((d, p, i) => (i ? d + Math.hypot(p[0] - l[i - 1][0], p[1] - l[i - 1][1]) : 0), 0) * scale;
		const draw = (note?: string) => {
			layer.clearLayers();
			done.forEach((l, k) => {
				const pl = L.polyline(toMap(l), { className: `universeview-trace-line kind-${kind}`, weight: 4 }).addTo(layer);
				pl.bindTooltip("Click to leave this one out", { sticky: true, className: "universeview-measure-tip" });
				pl.on("click", (evt: L.LeafletMouseEvent) => {
					L.DomEvent.stop(evt);
					done.splice(k, 1);
					draw();
				});
			});
			if (cur.length) {
				L.polyline(toMap(cur), { className: `universeview-trace-line is-current kind-${kind}`, weight: 4, interactive: false }).addTo(layer);
				L.circleMarker(toMap([cur[cur.length - 1]])[0], { radius: 5, className: "universeview-trace-end", interactive: false }).addTo(layer);
			}
			const all = cur.length > 1 ? [...done, cur] : done;
			const total = all.reduce((s, l) => s + lengthOf(l), 0);
			status?.setText(note ?? (all.length ? `${all.length} line${all.length === 1 ? "" : "s"} · ${this.formatDistance(total)}` : ""));
			status?.toggleClass("is-warning", !!note);
		};
		const finishLine = () => {
			if (cur.length > 1) done.push(simplifyOpenLine(cur));
			cur = [];
			curColor = null;
			parts.length = 0;
			draw();
		};
		const undo = () => {
			if (cur.length) {
				const from = parts.pop() ?? 0;
				cur = cur.slice(0, from);
				if (!cur.length) curColor = null;
			} else done.pop();
			draw();
		};
		const save = () => {
			finishLine();
			if (!done.length) {
				new Notice("Trace a road or river first: click on it, then along it.");
				return;
			}
			const lines = done.map((l) => l.map(([x, y]) => [round(x * scale, 1), round(y * scale, 1)] as Pt));
			new EntityPickerModal(this.plugin, undefined, (e) => {
				const [first, ...rest] = lines;
				this.endMode();
				void this.plugin.saveShapes("route", e.key, mapKey, null, first, rest, kind).then(() => new Notice(`Added ${lines.length} ${ROUTE_KINDS.find(([k]) => k === kind)?.[1].toLowerCase() ?? kind}${lines.length === 1 ? "" : "s"} to ${e.name}. Undo takes ${lines.length === 1 ? "it" : "them"} off.`));
			}, "Whose routes? (a realm's roads, a region's rivers…)").open();
		};
		this.beginMode("trace", (evt) => {
			if (evt.key === "Escape") {
				if (cur.length) finishLine();
				else this.endMode();
			} else if (evt.key === "Enter") {
				if (cur.length) finishLine();
				else save();
			} else if (evt.key === "Backspace") undo();
			else return;
			evt.stopPropagation();
		});
		this.root.addClass("is-filling");
		map.doubleClickZoom.disable();
		const help = () => (network
			? "Find road networks: click a road or river and every line of its colour joined to it is found · click a found line to leave it out"
			: "Trace a road or river: click on it, then click further along it, and the line keeps to it · double-click or Enter ends a line");
		this.showBanner(help(), [
			{ label: "Undo", run: undo },
			{ label: "Cancel", run: () => this.endMode() },
			{ label: "Save as routes…", cta: true, run: save },
		], (b) => {
			const controls = el("div", { cls: "universeview-fill-controls" }, b);
			b.addClass("has-fill-controls");
			const sel = el("select", { cls: "universeview-fill-select", attr: { "aria-label": "What kind of route" } }, controls);
			for (const [v, t] of ROUTE_KINDS) if (v !== "border") sel.add(new Option(t, v));
			sel.value = kind;
			sel.addEventListener("change", () => {
				kind = sel.value;
				draw();
			});
			this.slider(controls, "Tolerance", "How different a colour can be and still count as the line", 4, 40, opts.tolerance, (v) => {
				opts.tolerance = v;
			});
			this.slider(controls, "Bridge gaps", "Whole-network mode: join dashes and breaks up to this many pixels wide", 0, 20, opts.gap, (v) => {
				opts.gap = v;
			});
			const net = el("button", { cls: "universeview-banner-toggle", text: "Find the whole network", attr: { "aria-pressed": "false", title: "One click finds every line of that colour joined to it. Best when roads have a colour nothing else uses." } }, controls);
			net.addEventListener("click", (evt) => {
				evt.stopPropagation();
				finishLine();
				network = !network;
				net.toggleClass("is-active", network);
				net.setAttribute("aria-pressed", String(network));
				b.querySelector(".universeview-banner-text")?.setText(help());
			});
			status = el("span", { cls: "universeview-fill-status" }, controls);
		});
		const imagePoint = (ll: L.LatLng): Pt | null => {
			const [x, y] = this.fromLatLng(ll);
			const p: Pt = [x / scale, y / scale];
			return p[0] < 0 || p[1] < 0 || p[0] >= img.width || p[1] >= img.height ? null : p;
		};
		const onClick = (evt: L.LeafletMouseEvent) => {
			const p = imagePoint(evt.latlng);
			if (!p) return;
			this.root.addClass("is-busy");
			window.setTimeout(() => {
				try {
					if (network) {
						const res = detectLines(img, p, opts);
						if (!res || !res.lines.length) draw(res?.tooMuch ? "That colour covers too much of the map to be a road: lower the tolerance, or trace it click by click" : "Nothing found there: click right on a road or river");
						else {
							done.push(...res.lines);
							draw();
						}
						return;
					}
					if (!cur.length) {
						const found = lineColorAt(img, Math.round(p[0]), Math.round(p[1]));
						if (!found) {
							draw("No line there: click right on a road or river");
							return;
						}
						curColor = found.color;
						parts.push(0);
						cur = [found.at.map((v) => v + 0.5) as Pt];
					} else {
						parts.push(cur.length);
						// The colour at this click too, if it's the same line (ink can fade along a road).
						const here = lineColorAt(img, Math.round(p[0]), Math.round(p[1]))?.color;
						const near = here && Math.hypot(here[0] - curColor![0], here[1] - curColor![1], here[2] - curColor![2]) < 90 ? here : undefined;
						const seg = traceBetween(img, cur[cur.length - 1], p, curColor!, opts.tolerance, near);
						cur.push(...seg.slice(1));
					}
					draw();
				} finally {
					this.root.removeClass("is-busy");
				}
			}, 16);
		};
		const onDbl = (evt: L.LeafletMouseEvent) => {
			L.DomEvent.stop(evt);
			finishLine();
		};
		map.on("click", onClick);
		map.on("dblclick", onDbl);
		this.modeCleanup.push(() => {
			map.off("click", onClick);
			map.off("dblclick", onDbl);
		});
	}

	// ---- Journeys ---------------------------------------------------------------------------------

	private drawTrace() {
		const key = this.options.trace;
		if (!key || !this.map || !this.layers) return;
		const idx = this.plugin.index;
		const person = idx.get(key);
		if (!person) return;
		const stops: { ll: L.LatLngExpression; label: string; key: string; day: number }[] = [];
		const at = this.options.at;
		const cal = this.plugin.calendars.get(person.calendar);
		const placed = (ref?: { key: string }) => {
			const p = ref && idx.get(ref.key);
			return p && this.toLatLng(p) ? p : undefined;
		};
		// Birth and death places bracket the journey when they're known.
		const birth = placed(person.birthPlace);
		if (birth) stops.push({ ll: this.toLatLng(birth)!, label: `Born${person.start ? ` ${formatDate(person.start, cal)}` : ""} in ${birth.name}`, key: birth.key, day: person.start?.start ?? -Infinity });
		for (const e of idx.events(key)) {
			if (e.type !== "event" || !e.start || (at !== undefined && e.start.start > at)) continue;
			const place = e.places.map((p) => idx.get(p.key)).find((p) => p && this.toLatLng(p));
			if (place) stops.push({ ll: this.toLatLng(place)!, label: `${e.name} (${formatDate(e.start, this.plugin.calendars.get(e.calendar))})`, key: e.key, day: e.start.start });
		}
		const death = placed(person.deathPlace);
		if (death && (at === undefined || !person.end || person.end.start <= at)) {
			stops.push({ ll: this.toLatLng(death)!, label: `Died${person.end ? ` ${formatDate(person.end, cal)}` : ""} in ${death.name}`, key: death.key, day: person.end?.start ?? Infinity });
		}
		stops.sort((a, b) => a.day - b.day);
		if (!stops.length) return;
		const color = entityColor(this.plugin, person);
		L.polyline(stops.map((s) => s.ll), { className: "universeview-trace", color: "currentColor", weight: 3, dashArray: "6 6" }).addTo(this.layers);
		stops.forEach((s, i) => {
			const html = el("div", { cls: "universeview-trace-stop", text: String(i + 1) });
			html.style.setProperty("--pin-color", color);
			html.style.setProperty("--i", String(i));
			L.marker(s.ll, { icon: L.divIcon({ html, className: "universeview-pin-wrap", iconSize: [0, 0] }), zIndexOffset: 1000 })
				.bindTooltip(`${i + 1}. ${s.label}`, { direction: "top", offset: [0, -10] })
				.on("click", (evt: L.LeafletMouseEvent) => openEntity(this.plugin, s.key, evt.originalEvent))
				.addTo(this.layers!);
		});
		this.root.style.setProperty("--trace-color", color);
	}

	focusOn(key: string) {
		const idx = this.plugin.index;
		const e = idx.get(key);
		if (!e || !this.map) return;
		const target = e.type === "place" || this.toLatLng(e) ? e : e.places.map((p) => idx.get(p.key)).find((p) => p && this.toLatLng(p));
		const pin = target && this.pins.find((p) => p.place.key === target.key);
		const duration = motionMs(this.plugin.settings, 700) / 1000;
		if (pin) {
			// Zoom in far enough for the place's layer to show.
			const zoom = Math.max(this.map.getZoom(), this.isImageMap ? 0 : 7, this.options.useLayers !== false ? this.layerZoom(pin.layer) : -Infinity);
			if (duration) this.map.flyTo(pin.latlng, zoom, { duration });
			else this.map.setView(pin.latlng, zoom);
			const open = () => pin.marker.openPopup();
			if (duration) this.map.once("moveend", open);
			else open();
			return;
		}
		// A culture or region without a pin: show its painted area.
		const areas = this.areasHere(e);
		if (areas.length) {
			const b = L.latLngBounds(areas.flatMap((a) => a.t.points.map((p) => this.pointToLatLng(p))));
			this.map.flyToBounds(b.pad(0.2), { duration: duration || 0.01, animate: duration > 0 });
			return;
		}
		// Otherwise what's in it: the pins under its folder when it's a folder note (California/California.md).
		const folderNote = e.folder && e.path.slice(e.folder.length + 1).replace(/\.md$/, "") === e.folder.split("/").pop();
		const inside = folderNote ? this.pins.filter((p) => p.place.path.startsWith(e.folder + "/")) : [];
		if (inside.length) {
			const b = L.latLngBounds(inside.map((p) => p.latlng));
			this.map.flyToBounds(b.pad(0.3), { duration: duration || 0.01, animate: duration > 0, maxZoom: this.isImageMap ? 0 : 9 });
			return;
		}
		new Notice(`${e.name} isn't on this map yet: pin it, or paint its area.`);
	}
}

/** Images wider or taller than this (in pixels) are shown as tiles. */
const TILE_ABOVE = 4096;

/**
 * A huge map image as 256 px tiles, drawn from the shared, capped copies in `bigimage` so
 * zoomed-out views don't resample the largest copy for every tile. `w` × `h` is the area it covers
 * in map coordinates (an era's image is stretched over the main one's).
 */
class TiledImageLayer extends L.GridLayer {
	private constructor(readonly pyramid: Pyramid, private w: number, private h: number) {
		super({ tileSize: 256, bounds: L.latLngBounds([0, 0], [h, w]), noWrap: true, keepBuffer: 4, updateWhenZooming: false, className: "universeview-map-image", minZoom: -5, maxZoom: 4 });
	}

	static async load(plugin: UniverseViewPlugin, path: string, url: string, size: [number, number], w: number, h: number): Promise<TiledImageLayer | null> {
		const pyramid = await getPyramid(path, size[0], size[1], () => readBytes(plugin, path), url);
		// The computer has the picture decoded now: save the copy phones and tablets will show.
		if (pyramid && !Platform.isMobile && tooBigForPhone(size)) window.setTimeout(() => void savePhoneCopy(plugin, path, pyramid), 1500);
		return pyramid ? new TiledImageLayer(pyramid, w, h) : null;
	}

	/** Leaflet waits for `done` because this takes two arguments; close zooms draw from the full image, which may need decoding. */
	createTile(coords: L.Coords, done: L.DoneCallback): HTMLElement {
		const tile = createEl("canvas");
		// Leaflet must have stored the tile before it's reported ready.
		const ready = () => L.Util.requestAnimFrame(() => done(undefined, tile));
		const size = this.getTileSize();
		tile.width = size.x;
		tile.height = size.y;
		const ctx = tile.getContext("2d");
		// CRS.Simple: at zoom z one image pixel is 2^z screen pixels; the image's top edge is at y = -h.
		const s = Math.pow(2, coords.z);
		const sx = (coords.x * size.x) / s;
		const sy = (coords.y * size.y) / s + this.h;
		const sw = size.x / s;
		const sh = size.y / s;
		const x0 = Math.max(0, sx);
		const y0 = Math.max(0, sy);
		const x1 = Math.min(this.w, sx + sw);
		const y1 = Math.min(this.h, sy + sh);
		if (!ctx || x1 <= x0 || y1 <= y0) {
			ready();
			return tile;
		}
		ctx.imageSmoothingQuality = "high";
		const p = this.pyramid;
		const dest = [((x0 - sx) / sw) * size.x, ((y0 - sy) / sh) * size.y, ((x1 - x0) / sw) * size.x, ((y1 - y0) / sh) * size.y] as const;
		// The smallest copy that still has at least one pixel per screen pixel, or the full image.
		const ratio = (s * this.w) / p.width;
		if (p.full && ratio > p.levels[0].width / p.width) {
			const kx = p.width / this.w;
			const ky = p.height / this.h;
			p.full.draw(ctx, x0 * kx, y0 * ky, (x1 - x0) * kx, (y1 - y0) * ky, ...dest).catch(() => {}).finally(ready);
			return tile;
		}
		const level = levelFor(p, ratio);
		const fx = level.width / this.w;
		const fy = level.height / this.h;
		ctx.drawImage(level.src, x0 * fx, y0 * fy, (x1 - x0) * fx, (y1 - y0) * fy, ...dest);
		ready();
		return tile;
	}
}

function round(n: number, d: number): number {
	const f = Math.pow(10, d);
	return Math.round(n * f) / f;
}

function cap(s: string): string {
	return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Area-weighted centre of a polygon (falls back to the average of its points). */
function polygonCentroid(pts: L.LatLng[]): L.LatLng {
	let a = 0;
	let cx = 0;
	let cy = 0;
	for (let i = 0; i < pts.length; i++) {
		const p = pts[i];
		const q = pts[(i + 1) % pts.length];
		const f = p.lng * q.lat - q.lng * p.lat;
		a += f;
		cx += (p.lng + q.lng) * f;
		cy += (p.lat + q.lat) * f;
	}
	if (Math.abs(a) < 1e-9) {
		const n = pts.length || 1;
		return L.latLng(pts.reduce((s, p) => s + p.lat, 0) / n, pts.reduce((s, p) => s + p.lng, 0) / n);
	}
	return L.latLng(cy / (3 * a), cx / (3 * a));
}

/** Ramer–Douglas–Peucker: drops points closer than `tolerance` pixels to the simplified line. */
export function simplify(points: L.Point[], tolerance: number): L.Point[] {
	if (points.length <= 3) return points;
	const keep = new Array(points.length).fill(false);
	keep[0] = keep[points.length - 1] = true;
	const stack: [number, number][] = [[0, points.length - 1]];
	while (stack.length) {
		const [a, b] = stack.pop()!;
		let maxD = 0;
		let idx = -1;
		for (let i = a + 1; i < b; i++) {
			const d = L.LineUtil.pointToSegmentDistance(points[i], points[a], points[b]);
			if (d > maxD) [maxD, idx] = [d, i];
		}
		if (maxD > tolerance && idx > 0) {
			keep[idx] = true;
			stack.push([a, idx], [idx, b]);
		}
	}
	const out = points.filter((_, i) => keep[i]);
	return out.length >= 3 ? out : points;
}

/** Thins a traced line to the points that matter. */
function simplifyOpenLine(pts: Pt[]): Pt[] {
	return simplifyOpen(pts, 1.2);
}

/** Runs `f` once on the next animation frame, however often it's asked to before then. */
/** `cors` asks for a readable image (needed to read pixels); drawing alone doesn't need it. */
function loadImage(url: string, cors = true): Promise<HTMLImageElement | null> {
	return new Promise((resolve) => {
		const img = new Image();
		if (cors) img.crossOrigin = "anonymous";
		img.onload = () => resolve(img);
		img.onerror = () => resolve(null);
		img.src = url;
	});
}

/** A vault file's bytes, or null when it can't be read that way. */
async function readBytes(plugin: UniverseViewPlugin, path: string): Promise<ArrayBuffer | null> {
	const file = plugin.app.vault.getAbstractFileByPath(path);
	const vault = plugin.app.vault as { readBinary?: (f: TFile) => Promise<ArrayBuffer> };
	if (!(file instanceof TFile) || typeof vault.readBinary !== "function") return null;
	return vault.readBinary(file).catch(() => null);
}

/** The image's size, or null if it doesn't load within `timeout` ms (a picture too big for the device can hang). */
function loadImageSize(url: string, timeout = 30000): Promise<[number, number] | null> {
	return new Promise((resolve) => {
		const img = new Image();
		const give = window.setTimeout(() => {
			img.src = "";
			resolve(null);
		}, timeout);
		img.onload = () => {
			window.clearTimeout(give);
			resolve([img.naturalWidth || 1000, img.naturalHeight || 1000]);
		};
		img.onerror = () => {
			window.clearTimeout(give);
			resolve(null);
		};
		img.src = url;
	});
}
