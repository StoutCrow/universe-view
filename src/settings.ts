import type { CardPrefs } from "./ui/cardlayout";
import { PIN_SIZES } from "./types";
import { relPropertyNames } from "./index/relkinds";
import type { CalendarDef, EntityType, PinSize } from "./types";
import type { TierName } from "./index/realms";

export type FieldName =
	| "type" | "date" | "end" | "born" | "died" | "founded" | "dissolved"
	| "participants" | "places" | "cultures" | "parents" | "adoptiveParents" | "partners"
	| "relations" | "parentCultures" | "relatedCultures" | "coordinates" | "map" | "position"
	| "locatedIn" | "image" | "color" | "importance" | "calendar" | "gender" | "summary"
	| "lifespan" | "children" | "childCultures" | "birthPlace" | "deathPlace" | "mapId" | "knows" | "knownBy";

/**
 * Property names that are recognized for each field, in priority order. Users can extend these.
 * Includes Charted Roots' schema (cr_type, father/mother, parent_place, custom_coordinates_…)
 * and common worldbuilding conventions (lifespan, location lists, family/house, branch of…).
 */
export const DEFAULT_FIELD_ALIASES: Record<FieldName, string[]> = {
	type: ["type", "category", "cr_type"],
	date: ["date", "start", "when", "started"],
	end: ["end", "ended", "until", "date-end", "end-date", "date_end", "end_date"],
	born: ["born", "birth", "birthdate", "birth-date", "date-of-birth", "birth_date"],
	died: ["died", "death", "deathdate", "death-date", "date-of-death", "death_date"],
	founded: ["founded", "formed", "established", "start", "from"],
	dissolved: ["dissolved", "ended", "fell", "end", "until"],
	lifespan: ["lifespan", "life", "years", "span", "active", "dates"],
	participants: ["participants", "people", "characters", "involved", "who"],
	places: ["places", "place", "location-name", "where", "locations", "location", "seat"],
	cultures: [
		"cultures", "culture", "factions", "faction", "nations", "nation", "organizations", "organization", "affiliations",
		"houses", "house", "family", "families", "allegience", "allegiance", "allegiances", "faith", "religion",
	],
	parents: ["parents", "parent", "father", "mother"],
	adoptiveParents: ["adoptive-parents", "adoptive_parents", "adoptiveParents", "guardians", "foster-parents"],
	partners: ["partners", "partner", "spouse", "spouses", "married", "consort", "betrothed", "wife", "husband", "wives"],
	children: ["children", "child", "sons", "daughters", "issue"],
	relations: [
		"relations", "relationships", "related", "allies", "rivals", "friends", "mentor", "mentors",
		"ruler", "liege", "lord", "leader", "founder", "vassal", "vassals", "head", "monarch",
		// Every relationship kind UniverseView defines (allies, enemies, students, trade-partners…).
		...relPropertyNames(),
	].filter((a, i, all) => all.indexOf(a) === i),
	parentCultures: [
		"parent-cultures", "parent_cultures", "parentCultures", "descends-from", "derived-from", "origin",
		"branch of", "branch_of", "branch-of", "parent_org", "parent-org", "parent org",
	],
	childCultures: ["branches", "subgroups", "child_orgs"],
	relatedCultures: ["related-cultures", "related_cultures", "relatedCultures", "relations", "related"],
	coordinates: ["coordinates", "location", "coords", "latlng", "lat-lng"],
	map: ["map", "custom_coordinates_map", "maps"],
	mapId: ["map_id", "map-id", "mapid"],
	position: ["position", "map-position", "pos", "xy", "custom_coordinates"],
	locatedIn: ["located-in", "located_in", "locatedIn", "parent_place", "parent-place", "region", "within", "part-of", "location"],
	birthPlace: ["birthplace", "birth_place", "birth-place", "born-in", "born_in"],
	deathPlace: ["deathplace", "death_place", "death-place", "died-in", "died_in"],
	image: ["image", "portrait", "cover", "banner", "picture"],
	color: ["color", "colour"],
	importance: ["importance", "priority", "weight"],
	calendar: ["calendar"],
	gender: ["gender", "sex"],
	summary: ["summary", "description", "desc", "aliases-summary"],
	knows: ["knows", "knowledge", "secrets", "aware-of"],
	knownBy: ["known-by", "known_by", "knownby"],
};

export interface ChronicleSettings {
	/** Lines of "Folder/ = type", used when a note has no type property. */
	folderTypes: string;
	/** Treat #person, #event, … tags (optionally under a prefix) as types. */
	tagTypes: boolean;
	tagPrefix: string;
	/** Extra property aliases, "field = a, b, c" per line. */
	fieldAliases: string;
	/** Folders to leave out entirely (one per line). Template folders are always skipped. */
	ignoreFolders: string;
	/** How new notes are marked: a type property, a type tag (#Character), or Charted Roots' cr_type. */
	typeStyle: "property" | "tag" | "cr_type";
	/** Tag written for each type when typeStyle is "tag". */
	typeTags: Record<EntityType, string>;
	newNoteFolders: Record<EntityType, string>;
	templates: Record<EntityType, string>;
	useDataview: boolean;
	defaultCalendar: string;
	calendars: CalendarDef[];
	/** Lines of "Folder/ = calendar-id". */
	folderCalendars: string;
	showLifeEvents: boolean;
	openInNewTab: boolean;
	/** A left-sidebar button for every view, not just the overview. */
	ribbonViews: boolean;
	/** 1.3.1: the sidebar was cut down to the dashboard's star, once, for everyone. */
	hubRibbon?: boolean;
	/** Modules switched off in the dashboard. */
	modulesOff: string[];
	/** How the file trees (the Library's, the files panel) look. */
	fileTree?: {
		colors?: "both" | "text" | "bar" | "none";
		/** A folder and its folder note show as one row. */
		folderNotes?: boolean;
		kinds?: boolean;
		counts?: boolean;
		compact?: boolean;
	};
	/** How each view in the dashboard was left (its filters, layers, focus…), by view. */
	viewStates?: Record<string, Record<string, unknown>>;
	/** How each page's cards are arranged, by page. */
	cardLayouts?: Record<string, CardPrefs>;
	/** The dashboard's big tabs: their order, and those hidden. */
	hubOrder?: string[];
	hubHidden?: string[];
	/** Width of the Library's file tree, in pixels. */
	libraryTree?: number;
	/** Its height, when it sits above the details. */
	libraryTreeHeight?: number;
	/** The files panel has been put in the sidebar once; closing it after that is respected. */
	filesPanelAdded?: boolean;
	/** Width of the dashboard's sidebar, in pixels. */
	hubRail?: number;
	tileUrl: string;
	tileAttribution: string;
	tileMaxZoom: number;
	defaultCenter: [number, number];
	defaultZoom: number;

	// ---- Appearance ----
	/** A look for UniverseView's views (not the rest of Obsidian). */
	theme: ThemeId;
	/** Overrides of the theme's colors; empty = use the theme's. */
	colors: { accent: string; event: string; person: string; culture: string; place: string };
	/** How quickly the interface animates. */
	motion: MotionId;
	density: "compact" | "cozy" | "roomy";
	/** Corner radius in px; -1 = the theme's. */
	radius: number;
	/** Frosted, see-through toolbars and panels. */
	glass: boolean;

	// ---- Hover cards ----
	hoverCards: boolean;
	/** Also show cards when hovering links in notes: never, with Alt held, or always. */
	hoverInNotes: "off" | "alt" | "always";
	hoverDelay: number;
	/** How long a hover card stays after the pointer leaves it (ms). */
	hoverHideDelay?: number;
	/** A ring by the pointer fills up while a hover card is on its way. */
	hoverRing?: boolean;
	/** Moving from one open card straight to the next item opens its card at once. */
	hoverSwapFast?: boolean;
	/** How long a hover card takes to fade in (ms); it can be clicked once it's in. */
	hoverFadeMs?: number;
	/** Hover card width (px). */
	hoverCardWidth?: number;
	/** Size of the timer ring (px). */
	hoverRingSize?: number;
	/** How long to rest on a ? before its tip opens, and how long it fades (ms). */
	helpDelay?: number;
	helpFadeMs?: number;
	/** Icons per note type and per kind of group (empty: the built-in one). */
	typeIcons?: Partial<Record<EntityType, string>>;
	groupIcons?: Partial<Record<string, string>>;
	/** Type and kind icons beside notes in the file explorer and search. */
	fileIcons?: boolean;
	/** How each tier of territory is drawn: border, line and fill (Maps & realms → Territory styles). */
	tierStyles?: import("./ui/territorystyle").TierStyle[];
	/** Folder notes (Folder/Folder.md) in the file explorer: open on click, hidden, names kept in step. */
	folderNotes?: boolean;
	hideFolderNotes?: boolean;
	folderNoteClick?: boolean;
	folderNoteSync?: boolean;
	folderNoteNewTab?: boolean;
	/** Template for notes made with Create folder note. */
	folderNoteTemplate?: string;
	/** Where new notes go: inside what they belong to (beside it when it has no folder), making it a folder note first, or the type's folder. */
	placeNewNotes?: "parent" | "convert" | "off";
	/** Inspector: the identity strip at the top (picture, name, badges, quick actions). */
	inspectorHeader?: boolean;
	/** Ctrl/Cmd+Alt shortcuts for UniverseView's commands (off for new users: they choose their own). */
	suggestedHotkeys?: boolean;
	/** Inspector: the tab a note opens on. */
	inspectorDefaultTab?: string;
	/** Inspector: tabs left out (timeline, map, links, note). */
	inspectorHiddenTabs?: string[];
	/** Inspector: comfortable or compact spacing. */
	inspectorDensity?: "comfortable" | "compact";
	/** Inspector: sections folded away, by their heading. */
	inspectorCollapsed?: string[];
	/** Hover cards: parts left out (owner, map, facts, excerpt, tags, actions). */
	hoverHide?: string[];
	/** Map: size of place and territory names (1 = as drawn). */
	mapLabelScale?: number;
	/** Map: how territory names are lettered. */
	mapLabelStyle?: "engraved" | "plain" | "italic";
	/** Map: a halo behind names so they read over busy pictures. */
	mapLabelHalo?: boolean;
	/** Map: size of pins (1 = as drawn). */
	mapPinScale?: number;
	/** Map: strength of territory fills, as a multiple of each tier's (1 = as set). */
	territoryFillScale?: number;
	/** Map: border colour: the land's own, a darker shade of it, or ink. */
	territoryBorder?: "own" | "darker" | "ink";
	/** Map: names of regions (geography) shown on the map. */
	regionLabels?: boolean;
	/** When a pin or area moves into another land on the map: move the note there, ask, or leave it. */
	mapMovesFiles?: "ask" | "always" | "off";
	/** Extra geography words ("word = scale", 1 continent … 6 spot): notes named only by these are regions. */
	regionWords?: string;
	/** Hover cards on notes and folders in the file explorer. */
	explorerHover?: boolean;
	/** A small outline map in hover cards for places and realms. */
	hoverMiniMap?: boolean;
	/** The path above a note in its realms' colours. */
	pathColors?: boolean;
	/** File explorer contents ordered by tier (titles, houses, places, people…). */
	explorerTierSort?: boolean;
	/** Offer to move people from Living to Dead when they're given a death date. */
	livingDeadPrompt?: boolean;
	/** Offer to update #Prefix_Name tags when a note is renamed. */
	renameTags?: boolean;
	/** Folder notes made with Create folder note get an overview of their folder. */
	folderNoteOverview?: boolean;
	/** Lines typed into Quick add, newest first. */
	quickAddHistory?: string[];
	/** Quick add opens the note it makes. */
	quickAddOpen?: boolean;
	/** People go in Living / Dead subfolders when the folder has them. */
	statusFolders?: boolean;
	/** Colour notes and folders in the file explorer by realm, softer for smaller tiers. */
	fileColors?: boolean;
	/** Text colour, a bar at the edge, or both. */
	fileColorStyle?: "text" | "bar" | "both";
	/** Colour strength (0–100) per tier ("1"…"6"), and for houses, people and other titles. */
	fileStrength?: Record<string, number>;
	/** The open note's type, kind and realm in the status bar. */
	statusBar?: boolean;
	/** UniverseView's tags in notes drawn as pills in their type's colour. */
	styleTags?: boolean;
	/** Fonts for UniverseView's text, its headings and names, and map labels; empty keeps the theme's. */
	fontUi?: string;
	fontDisplay?: string;
	fontMap?: string;
	/** How long map tiers and names take to fade as you zoom (ms). */
	tierFadeMs?: number;
	labelFadeMs?: number;

	// ---- Map ----
	/** "category = #color, icon" per line, e.g. "city = #c0392b, building-2". */
	mapCategories: string;
	/** Color map pins by culture, category, region or type. */
	pinColorBy: PinColorBy;
	/** Hide labels that would overlap. */
	declutterLabels: boolean;

	// ---- Boards (dashboards) ----
	boards: Board[];
	activeBoard: string;
	/** Sticky notes, arrows and lines drawn on the real-world map (image maps keep theirs in the map note). */
	worldNotes: MapNote[];
	/** Views saved under a name: a view type and its state. */
	savedViews: SavedView[];
	/** Suggest relationships found in the text of the note you're writing. */
	liveSuggestions: boolean;
	/** How succession works when not set on the group (`succession:`). */
	successionRule: "absolute" | "male-preference" | "agnatic";
	/** New person and group notes start with empty relationship properties to fill in. */
	presetRelations: boolean;
	/** Which relationship properties new notes get (comma-separated); empty = UniverseView's defaults. */
	relationPresets: { person: string; culture: string };
	/** Areas smaller than this on screen (pixels across) fade out when you zoom out; 0 = never. */
	fadeAreaPx: number;
	/** Extra words naming a tier of title, "word = rank" per line (1 empire … 6 settlement). */
	tierWords: string;
	/** When drawing borders on an image map, corners snap onto the coast and rivers in the picture. */
	snapWater?: boolean;
	/** Drawing a border, the line between two snapped corners follows the neighbour's border or the coast between them. */
	followEdges?: boolean;
	/** Expanding or brushing a territory, new ground stops at other lands' borders. */
	keepOffOthers?: boolean;
	/** The version whose What's new was last shown, so an update shows what changed since. */
	lastSeenVersion?: string;
	/** Show What's new after an update. */
	showWhatsNew?: boolean;
	/** Map looks saved by the user (Settings → Maps & realms → Map look → Look presets). */
	mapPresets?: import("./ui/mappresets").MapPreset[];
	/** Fill tool: by ground (all the land or water joined to the click) or by the picture's colour. */
	fillBy?: "ground" | "colour";
	/** Fill by ground carries on over rivers. */
	fillCrossRivers?: boolean;
	/** Fill: openings this many pixels wide are closed (0–4). */
	fillGaps?: number;
	/** Fill by colour: how different a colour may be (2–60). */
	fillTolerance?: number;
	/** Simplify's starting strength (screen pixels a corner may sit off the line). */
	simplifyPx?: number;
	/** Strategy look: the soft band of colour inside realm borders. */
	realmBand?: "off" | "soft" | "strong";
	/** Rivers drawn as water: width as a multiple of the usual, and the water's colour. */
	riverWidth?: number;
	riverColor?: string;
	/** Views (once Style Settings options): timeline rows, family tree cards, gender tints, flat look. */
	tlRowHeight?: number;
	tlFontSize?: number;
	cardWidth?: number;
	cardHeight?: number;
	tintMale?: string;
	tintFemale?: string;
	genderTint?: boolean;
	flatStyle?: boolean;
	/** A hand-drawn wobble on long straight borders, shown only: the notes keep their few editable corners. */
	roughBorders?: "off" | "light" | "medium" | "strong";
	/** The territory brush's size (screen pixels across, halved). */
	brushSize?: number;
	/** The vault's own names for realm tiers ("3" → State); unset tiers keep the built-in names. */
	tierNames?: Record<string, TierName>;
	/** A realm splits into its duchies (and so on) once it's this many pixels across on screen. */
	tierSplitPx: number;
	/** Today's date in each calendar, for worlds without a world note (universal days). */
	currentDates: Record<string, number>;
	/** Spans with no end (still standing, "1292 C.E. -") are drawn up to the current date, fading out. */
	openEndsToToday: boolean;
}

export type ThemeId = "obsidian" | "parchment" | "archive" | "starfield" | "scholar" | "atelier";
export type MotionId = "off" | "snappy" | "smooth" | "relaxed" | "bouncy";
/** What pin and legend colours mean: the realm on top, the direct liege, the holder's house, a group, the kind of place, or one colour ("region" is the old name for "realm"). */
export type PinColorBy = "realm" | "liege" | "house" | "culture" | "category" | "region" | "type";

export type ModuleKind =
	| "timeline" | "family" | "graph" | "lineage" | "org" | "map" | "calendar" | "houses"
	| "stats" | "events" | "people" | "places" | "cultures" | "recent" | "wars" | "note";

/** One module on a board, placed on a 12-column grid. */
export interface BoardModule {
	id: string;
	kind: ModuleKind;
	title?: string;
	/** Options, written like an embedded code block ("folder: Vael\nlifespans: true"). */
	source: string;
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface Board {
	id: string;
	name: string;
	/** Top-level folder the board looks at; "" for the whole vault. */
	scope: string;
	modules: BoardModule[];
	/** The note every module looks at (the tree's person, the graph's centre, the map's place). */
	focus?: string;
	/** Picking something in one module focuses the whole board on it. */
	linked?: boolean;
}

export const DEFAULT_MAP_CATEGORIES = `# category = color, icon (Lucide icon name or emoji), size (tiny … huge), layer 1–5
# Layer 1 is always shown; higher layers appear as you zoom in.
settlement = #c0392b, home
city = #c0392b, building-2
kingdom = #2e86ab, crown
capital = #b8860b, crown
town = #d35400, house
village = #8e6b3a, home
fort = #6c5b7b, castle
fortress = #6c5b7b, castle
castle = #6c5b7b, castle
region = #2e86ab, map
realm = #2e86ab, flag
province = #2e86ab, map
country = #2e86ab, flag
landform = #4f7942, mountain
mountain = #6b6b6b, mountain
forest = #2f7d32, trees
river = #2878b5, waves
lake = #2878b5, waves
island = #1f9e89, palmtree
port = #1f6f9e, anchor
temple = #a05ec9, church
ruin = #7a7a7a, landmark
landmark = #a0522d, landmark
building = #8d6e63, building
planet = #5b6ee1, globe
moon = #9aa4b1, moon
star = #f1c40f, sun
station = #00a8b5, satellite`;

export const DEFAULT_SETTINGS: ChronicleSettings = {
	folderTypes: "",
	tagTypes: true,
	tagPrefix: "",
	fieldAliases: "",
	ignoreFolders: "",
	typeStyle: "property",
	typeTags: { event: "Event", person: "Character", culture: "Group", place: "Place", map: "Map" },
	newNoteFolders: { event: "Events", person: "People", culture: "Cultures", place: "Places", map: "Maps" },
	templates: { event: "", person: "", culture: "", place: "", map: "" },
	useDataview: true,
	defaultCalendar: "gregorian",
	calendars: [],
	folderCalendars: "",
	showLifeEvents: false,
	openInNewTab: false,
	ribbonViews: false,
	modulesOff: [],
	tileUrl: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
	tileAttribution: "&copy; <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a> contributors",
	tileMaxZoom: 19,
	defaultCenter: [48, 10],
	defaultZoom: 4,
	theme: "obsidian",
	colors: { accent: "", event: "", person: "", culture: "", place: "" },
	motion: "smooth",
	density: "cozy",
	radius: -1,
	glass: true,
	hoverCards: true,
	hoverInNotes: "alt",
	hoverDelay: 600,
	hoverRing: true,
	hoverSwapFast: false,
	hoverFadeMs: 220,
	hoverCardWidth: 340,
	hoverRingSize: 18,
	helpDelay: 350,
	helpFadeMs: 220,
	tierFadeMs: 300,
	labelFadeMs: 150,
	hoverHideDelay: 180,
	mapCategories: DEFAULT_MAP_CATEGORIES,
	pinColorBy: "realm",
	declutterLabels: true,
	boards: [],
	activeBoard: "",
	worldNotes: [],
	savedViews: [],
	liveSuggestions: true,
	successionRule: "absolute",
	presetRelations: true,
	relationPresets: { person: "", culture: "" },
	fadeAreaPx: 48,
	tierWords: "",
	tierSplitPx: 760,
	currentDates: {},
	openEndsToToday: true,
};

/** Something drawn on a map for planning: a sticky note, an arrow or a line. */
export interface MapNote {
	kind: "note" | "arrow" | "line";
	/** "x,y x,y" (image maps: pixels from the top-left; world map: lat,lng). */
	points: string;
	text?: string;
	color?: string;
	/** World map only: the folder (world) it was drawn in; "" for the whole vault. Older notes have none and show everywhere. */
	world?: string;
}

export interface SavedView {
	name: string;
	type: string;
	state: Record<string, unknown>;
}

export interface MapCategory {
	color?: string;
	icon?: string;
	size?: PinSize;
	layer?: number;
}

/**
 * Category → color, icon, pin size and map layer for map pins and legends:
 * "city = #c0392b, building-2, medium, layer 2" (every part optional, in any order).
 */
export function parseMapCategories(text: string): Map<string, MapCategory> {
	const out = new Map<string, MapCategory>();
	for (const [k, v] of parseMappingLines(text)) {
		const parts = v.split(",").map((s) => s.trim()).filter(Boolean);
		const c: MapCategory = {};
		for (const p of parts) {
			const layer = p.match(/^layer\s*:?\s*(\d)$/i);
			if (/^#|^rgb|^hsl|^var\(/i.test(p)) c.color ??= p;
			else if (layer) c.layer = Math.max(1, Math.min(5, +layer[1]));
			else if ((PIN_SIZES as readonly string[]).includes(p.toLowerCase())) c.size = p.toLowerCase() as PinSize;
			else c.icon ??= p;
		}
		out.set(k.toLowerCase(), c);
	}
	return out;
}

/**
 * Built-in sizes and layers per kind of place, used when neither the note nor the settings say:
 * realms and regions are big and always shown; villages and buildings appear as you zoom in.
 */
export const CATEGORY_SCALE: Record<string, { size: PinSize; layer: number }> = {
	continent: { size: "huge", layer: 1 }, country: { size: "huge", layer: 1 }, realm: { size: "huge", layer: 1 }, kingdom: { size: "huge", layer: 1 },
	empire: { size: "huge", layer: 1 }, planet: { size: "huge", layer: 1 }, star: { size: "huge", layer: 1 },
	region: { size: "large", layer: 1 }, province: { size: "large", layer: 2 }, capital: { size: "large", layer: 1 }, sea: { size: "large", layer: 1 },
	city: { size: "medium", layer: 2 }, settlement: { size: "medium", layer: 2 }, port: { size: "medium", layer: 2 }, fortress: { size: "medium", layer: 2 },
	mountain: { size: "medium", layer: 2 }, forest: { size: "medium", layer: 2 }, lake: { size: "medium", layer: 2 }, island: { size: "medium", layer: 2 },
	moon: { size: "medium", layer: 2 }, station: { size: "medium", layer: 2 }, landform: { size: "medium", layer: 2 },
	town: { size: "small", layer: 3 }, fort: { size: "small", layer: 3 }, castle: { size: "small", layer: 3 }, temple: { size: "small", layer: 3 },
	river: { size: "small", layer: 3 }, ruin: { size: "small", layer: 3 }, landmark: { size: "small", layer: 3 }, district: { size: "small", layer: 3 },
	village: { size: "tiny", layer: 4 }, hamlet: { size: "tiny", layer: 4 }, building: { size: "tiny", layer: 5 }, room: { size: "tiny", layer: 5 },
};

/** Common kinds of place offered in pickers (plus whatever the vault already uses). */
export const COMMON_PLACE_KINDS = ["settlement", "capital", "city", "town", "village", "region", "kingdom", "province", "fort", "castle", "temple", "port", "landmark", "ruin", "mountain", "forest", "river", "lake", "island", "sea", "building"];

const normFolder = (f: string) => f.trim().replace(/^\/|\/$/g, "").toLowerCase();

/** The value of a "Folder/ = value" line for exactly this folder. */
export function findMapping(text: string, folder: string): string | undefined {
	for (const line of text.split(/\r?\n/)) {
		const i = line.indexOf("=");
		if (i < 0 || line.trim().startsWith("#")) continue;
		if (normFolder(line.slice(0, i)) === normFolder(folder)) return line.slice(i + 1).trim();
	}
	return undefined;
}

/** Sets (or with null removes) the "Folder/ = value" line for a folder, keeping every other line. */
export function setMapping(text: string, folder: string, value: string | null): string {
	const lines = text.split(/\r?\n/).filter((line) => {
		const i = line.indexOf("=");
		return i < 0 || line.trim().startsWith("#") || normFolder(line.slice(0, i)) !== normFolder(folder);
	});
	if (value) lines.push(`${folder}/ = ${value}`);
	return lines.join("\n").replace(/^\n+|\n+$/g, "");
}

/** Parses "key = value" lines, ignoring blanks and # comments. */
export function parseMappingLines(text: string): [string, string][] {
	return text
		.split(/\r?\n/)
		.map((l) => l.trim())
		.filter((l) => l && !l.startsWith("#") && !l.startsWith("//"))
		.map((l) => {
			const i = l.indexOf("=");
			if (i < 0) return null;
			return [l.slice(0, i).trim(), l.slice(i + 1).trim()] as [string, string];
		})
		.filter((x): x is [string, string] => !!x && !!x[0] && !!x[1]);
}

export function buildFieldAliases(extra: string): Record<FieldName, string[]> {
	const out = {} as Record<FieldName, string[]>;
	for (const key of Object.keys(DEFAULT_FIELD_ALIASES) as FieldName[]) out[key] = [...DEFAULT_FIELD_ALIASES[key]];
	for (const [field, aliases] of parseMappingLines(extra)) {
		const key = (Object.keys(out) as FieldName[]).find((k) => k.toLowerCase() === field.toLowerCase());
		if (!key) continue;
		const list = aliases.split(",").map((a) => a.trim()).filter(Boolean);
		// User aliases take priority over built-ins.
		out[key] = [...list, ...out[key].filter((a) => !list.includes(a))];
	}
	return out;
}
