import { setRoughEdges } from "./ui/roughedges";
import type { SavedTheme, ButtonStyle, UniverseViewSettings, EdgeStyle, FontStyle, HeadingStyle, IconStyle, MotionId, TabStyle, TactilePart, ThemeId } from "./settings";
export const BUTTON_STYLES: { id: ButtonStyle; name: string }[] = [
	{ id: "quiet", name: "Quiet (text, fills on hover)" },
	{ id: "outlined", name: "Outlined (a thin edge)" },
	{ id: "filled", name: "Filled (a soft solid)" },
	{ id: "pill", name: "Pill (fully rounded, accent when on)" },
	{ id: "stamp", name: "Stamp (hard shadow, presses down)" },
	{ id: "glow", name: "Glow (lit edge)" },
	{ id: "ruled", name: "Ruled (small caps, underline)" },
	{ id: "dashed", name: "Dashed (a dashed edge)" },
	{ id: "solid", name: "Solid (accent fill)" },
	{ id: "bracket", name: "Bracket (side bars)" },
	{ id: "soft", name: "Soft (gently raised, rounded)" },
	{ id: "glass", name: "Glass (frosted, lit edge)" },
	{ id: "neu", name: "Soft shape (pressed in when on)" },
	{ id: "pixel", name: "Pixel (1-bit, hard edge)" },
];
export const TAB_STYLES: { id: TabStyle; name: string }[] = [
	{ id: "underline", name: "Underline" },
	{ id: "folder", name: "Folder tab (joined to the page)" },
	{ id: "segmented", name: "Segmented (one rounded strip)" },
	{ id: "plain", name: "Plain text (accent and a dot when open)" },
	{ id: "block", name: "Block (solid accent when open)" },
	{ id: "glow", name: "Glow (capitals, lit when open)" },
	{ id: "rule", name: "Rule (small caps between two rules)" },
	{ id: "pill", name: "Pills (rounded, tinted when open)" },
	{ id: "tag", name: "Tags (arrow-ended labels)" },
	{ id: "dashed", name: "Dashed (a dashed rule beneath)" },
];
export const EDGE_STYLES: { id: EdgeStyle; name: string; note: string }[] = [
	{ id: "clean", name: "Clean", note: "A thin line" },
	{ id: "double", name: "Double rule", note: "A second line inside" },
	{ id: "ornate", name: "Ornate", note: "Corner brackets" },
	{ id: "stitched", name: "Stitched", note: "A dashed seam" },
	{ id: "sketch", name: "Hand-drawn", note: "A wobbly pen line" },
	{ id: "chamfer", name: "Cut corners", note: "Technical, angled" },
	{ id: "ledger", name: "Ledger", note: "Rules top and bottom" },
	{ id: "shadow", name: "Hard shadow", note: "Thick line, offset block" },
	{ id: "round", name: "Soft round", note: "Very round, no line" },
	{ id: "dotted", name: "Dotted", note: "A dotted line" },
	{ id: "bracket", name: "Corner marks", note: "Only the corners" },
	{ id: "glass", name: "Frosted glass", note: "Blurred, lit edge" },
	{ id: "neu", name: "Soft shape", note: "Raised from the page" },
	{ id: "pixel", name: "Pixel", note: "Hard line and block shadow" },
];
export const FONT_STYLES: { id: FontStyle; name: string; note: string }[] = [
	{ id: "book", name: "Book", note: "Serif throughout" },
	{ id: "chancery", name: "Chancery", note: "Engraved capitals" },
	{ id: "blackletter", name: "Blackletter", note: "Old manuscript headings" },
	{ id: "humanist", name: "Humanist", note: "Warm, open sans" },
	{ id: "modern", name: "Modern", note: "Clean UI sans" },
	{ id: "technical", name: "Technical", note: "Squared, sci-fi" },
	{ id: "typewriter", name: "Typewriter", note: "Monospaced" },
];
export const ICON_STYLES: { id: IconStyle; name: string; note: string }[] = [
	{ id: "hairline", name: "Hairline", note: "The finest line" },
	{ id: "light", name: "Light", note: "Fine, delicate lines" },
	{ id: "regular", name: "Regular", note: "Obsidian's own weight" },
	{ id: "bold", name: "Bold", note: "Heavy, easy to spot" },
	{ id: "heavy", name: "Heavy", note: "Chunky, like a woodcut" },
];
export const HEADING_STYLES: { id: HeadingStyle; name: string; note: string }[] = [
	{ id: "plain", name: "Plain", note: "Just the words" },
	{ id: "ruled", name: "Ruled", note: "Underlined" },
	{ id: "flourish", name: "Flourish", note: "An ornament after" },
	{ id: "smallcaps", name: "Small caps", note: "Book style" },
	{ id: "capitals", name: "Capitals", note: "Spaced, technical" },
	{ id: "boxed", name: "Boxed", note: "On a tinted label" },
	{ id: "brackets", name: "Brackets", note: "[ Like this ]" },
	{ id: "wavy", name: "Wavy", note: "A wavy underline" },
];

/** The parts of the tactile style, each one switchable on its own. */
export const TACTILE_PARTS: { id: TactilePart; name: string; desc: string }[] = [
	{ id: "keys", name: "Raised keys", desc: "Chips and buttons stand up and press in when on." },
	{ id: "toolbar", name: "Raised toolbar", desc: "The strip of controls along the top of a view." },
	{ id: "fields", name: "Inset fields", desc: "Search boxes and menus sink into the page." },
	{ id: "tabs", name: "Folder tabs", desc: "The dashboard's and the inspector's tabs, and the big tabs at the side." },
	{ id: "panels", name: "Sheets and wells", desc: "Cards and board modules rise; the inspector's sections sink." },
	{ id: "headings", name: "Pressed headings", desc: "A light edge under headings, as if stamped in." },
	{ id: "icons", name: "Icon plates", desc: "Icons sit on small raised plates, and come back where the flat style drops them." },
	{ id: "folders", name: "Folders and notes", desc: "Manila folders with a tab and sheets of paper in the Library and the Files panel." },
];

/** Ready-made sets of parts; the rest are switched off. */
export const TACTILE_PRESETS: { id: string; name: string; off: TactilePart[] }[] = [
	{ id: "full", name: "Everything", off: [] },
	{ id: "controls", name: "Controls only (keys, toolbar, fields, tabs)", off: ["panels", "headings", "icons", "folders"] },
	{ id: "files", name: "Files only (folders, notes, icons)", off: ["keys", "toolbar", "fields", "tabs", "panels", "headings"] },
];

export interface ThemeInfo {
	id: ThemeId;
	name: string;
	/** What kind of project the look suits. */
	forWhat: string;
	description: string;
	/** The buttons, tabs, edges, icons and headings the theme brings, until you pick your own. */
	buttons: ButtonStyle;
	tabs: TabStyle;
	edges: EdgeStyle;
	icons: IconStyle;
	headings: HeadingStyle;
	/** The tactile surface the theme brings (its raised keys, folder tabs and wells), until you pick your own. */
	surface: { tactile: boolean; strength?: number; off?: TactilePart[] };
	/** Preview swatches: background, panel, text, accent, then the four type colors. */
	swatches: string[];
}

/** The themes only restyle UniverseView's own views, embeds, cards and dialogs; the rest of Obsidian is untouched. */
export const THEMES: ThemeInfo[] = [
	{
		id: "obsidian",
		buttons: "quiet", tabs: "underline", edges: "clean", icons: "regular", headings: "plain", surface: { tactile: true, strength: 45, off: ["panels", "headings", "icons", "folders"] },
		name: "Obsidian",
		forWhat: "Any vault",
		description: "Follows your Obsidian theme and accent color, light or dark.",
		swatches: ["var(--background-primary)", "var(--background-secondary)", "var(--text-normal)", "var(--interactive-accent)", "var(--color-blue)", "var(--color-green)", "var(--color-purple)", "var(--color-orange)"],
	},
	{
		id: "archive",
		buttons: "soft", tabs: "pill", edges: "stitched", icons: "hairline", headings: "ruled", surface: { tactile: true, strength: 70, off: ["keys", "toolbar", "headings", "tabs"] },
		name: "Archive",
		forWhat: "Genealogy & family history",
		description: "Soft archival cream, photo-album cards and calm greens, like a well-kept family record.",
		swatches: ["#fbf9f4", "#f1ece1", "#2b2924", "#2f6b57", "#356f9c", "#2f6b57", "#8a5a2b", "#a2493b"],
	},
	{
		id: "starfield",
		buttons: "glow", tabs: "glow", edges: "chamfer", icons: "bold", headings: "capitals", surface: { tactile: false },
		name: "Starfield",
		forWhat: "Science fiction & space opera",
		description: "Deep-space navy with glowing neon lines, a star field behind every view and technical type.",
		swatches: ["#060a14", "#0c1426", "#d7e3ff", "#38d1ff", "#38d1ff", "#73f7b4", "#c48bff", "#ffb547"],
	},
	{
		id: "scholar",
		buttons: "ruled", tabs: "rule", edges: "ledger", icons: "light", headings: "smallcaps", surface: { tactile: true, strength: 45, off: ["panels", "headings", "icons", "folders"] },
		name: "Scholar",
		forWhat: "History & academic research",
		description: "Crisp paper-white, navy and burgundy, fine rules and book typography. Built for reading dense timelines.",
		swatches: ["#ffffff", "#f4f5f7", "#1a2230", "#1f4e8c", "#1f4e8c", "#3b7a57", "#8b2e3c", "#b06f1b"],
	},
	{
		id: "atelier",
		buttons: "stamp", tabs: "block", edges: "sketch", icons: "heavy", headings: "boxed", surface: { tactile: true, strength: 80, off: ["folders", "keys"] },
		name: "Atelier",
		forWhat: "Novels, scripts & story planning",
		description: "A modern studio look: frosted glass, soft gradients and rounded cards in muted pastels.",
		swatches: ["#f6f4fb", "#ece8f6", "#2a2638", "#7c5cff", "#7c5cff", "#21a67a", "#e0569a", "#f08a3c"],
		},
		{
			id: "manuscript",
			buttons: "bracket", tabs: "folder", edges: "ornate", icons: "regular", headings: "flourish", surface: { tactile: true, strength: 100, off: ["keys"] },
			name: "Manuscript",
			forWhat: "Medieval worlds & chronicles",
			description: "Vellum, oxblood rubrics, lapis and gold: blackletter titles with an illuminated first letter, vine rules and ornate corners. Candle-lit in dark mode.",
			swatches: ["#efe2bd", "#e2d0a2", "#2b1f12", "#7a1f1f", "#7a1f1f", "#2f5d3a", "#1f3f7a", "#a97a1c"],
		},
		{
			id: "notebook",
			buttons: "dashed", tabs: "tag", edges: "sketch", icons: "hairline", headings: "plain", surface: { tactile: true, strength: 70, off: ["keys", "toolbar", "headings", "tabs"] },
			name: "Notebook",
			forWhat: "Sketching a world by hand",
			description: "Ruled paper with a red margin, graphite text, hand-lettered titles with pencil underlines, wobbly traced icons and index cards pinned slightly crooked.",
			swatches: ["#f7f4ea", "#ebe6d4", "#34353b", "#3a5f9a", "#3a5f9a", "#b5483a", "#6a5a8e", "#5f7f4a"],
		},
		{
			id: "journal",
			buttons: "solid", tabs: "folder", edges: "stitched", icons: "regular", headings: "smallcaps", surface: { tactile: true, strength: 110, off: ["keys"] },
			name: "Journal",
			forWhat: "Adventures & travel diaries",
			description: "Tooled brown leather with brass rules and blind-stamped titles. Cards are cream pages stitched into the cover. Dark in both modes.",
			swatches: ["#2a1d14", "#382619", "#f0e2c0", "#c8963e", "#c8963e", "#9cc27f", "#b99ad6", "#d9b25c"],
		},
		{
			id: "neon",
			buttons: "pill", tabs: "underline", edges: "bracket", icons: "bold", headings: "brackets", surface: { tactile: false },
			name: "Neon",
			forWhat: "Cyberpunk & modern noir",
			description: "Black glass, magenta and cyan tubes glowing on a perspective grid. Dark in both modes.",
			swatches: ["#08070f", "#120f22", "#f3ecff", "#ff3fb4", "#ff3fb4", "#36e6ff", "#a98bff", "#ffe14d"],
		},
		{
			id: "typewriter",
			buttons: "stamp", tabs: "tag", edges: "ledger", icons: "light", headings: "capitals", surface: { tactile: true, strength: 100, off: ["headings", "keys", "tabs"] },
			name: "Typewriter",
			forWhat: "Mysteries, case files & modern worlds",
			description: "Yellowed paper in monospace type, red rubber-stamp headings, hard shadows and strips of tape on cards.",
			swatches: ["#f1e9cf", "#e3d9b6", "#22221f", "#b3261e", "#b3261e", "#2d3a4f", "#5a4a6a", "#6b5a2a"],
		},
		{
			id: "woodcut",
			buttons: "stamp", tabs: "block", edges: "shadow", icons: "heavy", headings: "ruled", surface: { tactile: false },
			name: "Woodcut",
			forWhat: "Old maps, bestiaries & grim tales",
			description: "Black ink on cream, hatched shading, block lettering, hard shadows and gouged icons. Reversed to white-on-black in dark mode.",
			swatches: ["#f2ead6", "#e4dabd", "#141414", "#1b1b1b", "#8c2a1a", "#1b1b1b", "#4a3a2a", "#5a4a2a"],
		},
		{
			id: "watercolor",
			buttons: "soft", tabs: "pill", edges: "round", icons: "hairline", headings: "plain", surface: { tactile: false },
			name: "Watercolor",
			forWhat: "Gentle, illustrated worlds",
			description: "Wet washes of blue, rose and green bleeding across paper, soft rounded cards and script titles. A night wash in dark mode.",
			swatches: ["#fbf8f1", "#eee9dc", "#2f3640", "#3f8f9e", "#d9684f", "#4f8fc4", "#9a6fbd", "#6fae6a"],
	},
	{
		id: "glass",
		buttons: "glass", tabs: "pill", edges: "glass", icons: "light", headings: "plain", surface: { tactile: false },
		name: "Glass",
		forWhat: "Modern apps & dashboards",
		description: "Liquid glass: frosted, translucent panels over a glowing colour mesh, lit edges and pill controls. Dark in both modes.",
		swatches: ["#0d1224", "#17213f", "#eef3ff", "#7cc4ff", "#7cc4ff", "#ff8fb8", "#c3a3ff", "#7ee8c0"],
	},
	{
		id: "neumorph",
		buttons: "neu", tabs: "segmented", edges: "neu", icons: "regular", headings: "plain", surface: { tactile: false },
		name: "Soft",
		forWhat: "Calm, tactile interfaces",
		description: "Extruded, neumorphic shapes on a single colour: everything is pressed up from or into the page.",
		swatches: ["#e3e8f0", "#d7dde8", "#38425a", "#4f7cff", "#4f7cff", "#e0617a", "#8a6cff", "#2fa889"],
	},
	{
		id: "brutalist",
		buttons: "stamp", tabs: "block", edges: "shadow", icons: "heavy", headings: "capitals", surface: { tactile: false },
		name: "Brutal",
		forWhat: "Bold, raw, high-contrast projects",
		description: "Thick black lines, hard block shadows, loud pink and yellow, heavy type. No subtlety.",
		swatches: ["#fff7df", "#ffe99b", "#111111", "#ff4d79", "#ff4d79", "#1f6bff", "#8a3dff", "#0d9e63"],
	},
	{
		id: "desktop",
		buttons: "pixel", tabs: "folder", edges: "pixel", icons: "regular", headings: "ruled", surface: { tactile: false },
		name: "Desktop",
		forWhat: "Retro computing & game worlds",
		description: "A 1-bit, 1980s windowed desktop: black on white, a dithered backdrop, striped title bars and pixel buttons. Inverted in dark mode.",
		swatches: ["#ffffff", "#ffffff", "#000000", "#000000", "#000000", "#000000", "#000000", "#000000"],
	},
	{
		id: "synth",
		buttons: "soft", tabs: "block", edges: "bracket", icons: "bold", headings: "capitals", surface: { tactile: true, strength: 130, off: ["headings"] },
		name: "Synth",
		forWhat: "Music, tech & hardware worlds",
		description: "A hardware synth panel: brushed metal, screws in the corners, chunky keys and amber LED glow. Dark in both modes.",
		swatches: ["#1b1d22", "#2a2d34", "#f1e8d3", "#ffb020", "#ffb020", "#ff5a4d", "#5ad7ff", "#7dff9a"],
	},
];

export const MOTIONS: { id: MotionId; name: string; desc: string; speed: number; ease: string }[] = [
	{ id: "off", name: "Off", desc: "No animation", speed: 0.001, ease: "linear" },
	{ id: "snappy", name: "Snappy", desc: "Quick and crisp", speed: 0.55, ease: "cubic-bezier(0.2, 0.9, 0.25, 1)" },
	{ id: "smooth", name: "Smooth", desc: "Balanced, flowing", speed: 1, ease: "cubic-bezier(0.22, 0.8, 0.24, 1)" },
	{ id: "relaxed", name: "Relaxed", desc: "Slow and gentle", speed: 1.7, ease: "cubic-bezier(0.3, 0.7, 0.2, 1)" },
	{ id: "bouncy", name: "Bouncy", desc: "Springy overshoot", speed: 1.1, ease: "cubic-bezier(0.34, 1.56, 0.64, 1)" },
];

const DENSITY = { compact: 0.85, cozy: 1, roomy: 1.18 };

/** Animation length for JS-driven motion (map fly-to, pan/zoom), honoring the motion setting and reduced-motion. */
export function motionMs(settings: UniverseViewSettings, base: number): number {
	if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return 0;
	const m = MOTIONS.find((x) => x.id === settings.motion) ?? MOTIONS[2];
	return m.id === "off" ? 0 : Math.round(base * m.speed);
}

const BODY_VARS = [
	"--universeview-theme-radius", "--universeview-font-display", "--uv-select-bg", "--uv-select-fg", "--uv-select-sh", "--universeview-user-accent", "--universeview-user-event", "--universeview-user-person", "--universeview-user-culture", "--universeview-user-place",
	"--universeview-user-speed", "--universeview-ease", "--universeview-density", "--universeview-user-radius", "--uv-map-label-scale", "--uv-pin-scale",
	"--universeview-tl-row-height", "--universeview-tl-font-size", "--universeview-card-width", "--universeview-card-height", "--universeview-male-tint", "--universeview-female-tint", "--uv-river-color", "--uv-t-depth", "--uv-t-folder",
];

/** Each theme's own corner radius in px (the same numbers as `--universeview-theme-radius` in the theme CSS). */
export const THEME_RADIUS: Partial<Record<ThemeId, number>> = {
	archive: 12, starfield: 3, scholar: 2, atelier: 16, manuscript: 3, notebook: 6, journal: 5, neon: 2, typewriter: 0, woodcut: 0, watercolor: 14, glass: 20, neumorph: 20, brutalist: 0, desktop: 0, synth: 4,
};
export const THEME_FONTS: Partial<Record<ThemeId, string>> = {
	archive: `"Libre Baskerville", "Baskerville", Georgia, "Times New Roman", serif`,
	starfield: `"Orbitron", "Eurostile", "Bank Gothic", "Rajdhani", "Segoe UI", sans-serif`,
	scholar: `"Iowan Old Style", "Charter", "Sitka Text", Georgia, serif`,
	atelier: `"Inter", "SF Pro Display", "Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif`,
	manuscript: `"UnifrakturCook", "Old English Text MT", "Cinzel", "Palatino Linotype", "Book Antiqua", Georgia, serif`,
	notebook: `"Ink Free", "Segoe Print", "Bradley Hand", "Chalkboard SE", "Comic Sans MS", cursive`,
	journal: `"Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif`,
	neon: `"Orbitron", "Bahnschrift", "Eurostile", "Rajdhani", "Segoe UI", sans-serif`,
	typewriter: `"American Typewriter", "Courier New", Courier, monospace`,
	woodcut: `"Georgia", "Palatino Linotype", "Times New Roman", serif`,
	watercolor: `"Segoe Script", "Lucida Handwriting", "Palatino Linotype", Georgia, serif`,
	glass: `'Segoe UI Variable Display', 'SF Pro Display', 'Inter', 'Segoe UI', system-ui, sans-serif`,
	neumorph: `'Nunito', 'Quicksand', 'Segoe UI Variable Display', 'Segoe UI', system-ui, sans-serif`,
	brutalist: `'Archivo Black', 'Arial Black', 'Impact', 'Segoe UI Black', sans-serif`,
	desktop: `'Chicago', 'Geneva', 'VT323', 'Courier New', monospace`,
	synth: `'Bahnschrift', 'Eurostile', 'Rajdhani', 'Segoe UI', sans-serif`,
};

/** The groups the theme cards are sorted into, in order. */
export const THEME_GROUPS: { name: string; ids: ThemeId[] }[] = [
	{ name: "Plain", ids: ["obsidian"] },
	{ name: "Paper & ink", ids: ["archive", "scholar", "manuscript", "notebook", "journal", "typewriter", "woodcut", "watercolor"] },
	{ name: "Modern interfaces", ids: ["atelier", "glass", "neumorph", "brutalist"] },
	{ name: "Dark & electric", ids: ["starfield", "neon", "synth"] },
	{ name: "Retro", ids: ["desktop"] },
];
/** How each theme marks the chosen item: a background, an optional text colour and an optional edge or glow. Shown on the cards and used in the lists. */
export const THEME_SELECT: Partial<Record<ThemeId, { bg: string; fg?: string; sh?: string }>> = {
	archive: { bg: "rgba(47, 107, 87, 0.18)", sh: "inset 3px 0 0 #2f6b57" },
	scholar: { bg: "rgba(31, 78, 140, 0.1)", sh: "inset 0 -2px 0 #1f4e8c" },
	manuscript: { bg: "rgba(122, 31, 31, 0.14)", sh: "inset 3px 0 0 #7a1f1f" },
	notebook: { bg: "rgba(255, 226, 70, 0.45)" },
	journal: { bg: "rgba(200, 150, 62, 0.28)", fg: "#f5e6c0", sh: "inset 0 0 0 1px #c8963e" },
	typewriter: { bg: "rgba(179, 38, 30, 0.16)", sh: "inset 0 -2px 0 #b3261e" },
	woodcut: { bg: "var(--text-normal)", fg: "var(--background-primary)" },
	watercolor: { bg: "rgba(63, 143, 158, 0.22)" },
	atelier: { bg: "rgba(124, 92, 255, 0.18)", sh: "inset 0 0 0 2px #7c5cff" },
	glass: { bg: "rgba(255, 255, 255, 0.16)", sh: "inset 0 0 0 1px rgba(255, 255, 255, 0.4)" },
	neumorph: { bg: "var(--background-primary)", sh: "inset 3px 3px 6px var(--neu-d, rgba(0, 0, 0, 0.2)), inset -3px -3px 6px var(--neu-l, rgba(255, 255, 255, 0.6))" },
	brutalist: { bg: "#ff4d79", fg: "#111111", sh: "3px 3px 0 #111111" },
	starfield: { bg: "rgba(56, 209, 255, 0.16)", sh: "inset 0 0 0 1px #38d1ff, 0 0 10px rgba(56, 209, 255, 0.4)" },
	neon: { bg: "rgba(255, 63, 180, 0.18)", sh: "inset 0 0 0 1px #ff3fb4, 0 0 12px rgba(255, 63, 180, 0.5)" },
	synth: { bg: "rgba(255, 176, 32, 0.2)", fg: "#ffb020", sh: "inset 0 0 0 1px #ffb020, 0 0 8px rgba(255, 176, 32, 0.45)" },
	desktop: { bg: "var(--text-normal)", fg: "var(--background-primary)" },
};
export const themeRadius = (id: ThemeId): number => THEME_RADIUS[id] ?? 6;

/** Roundness presets: a name and a radius in px. */
export const RADIUS_PRESETS: { id: string; name: string; px: number }[] = [
	{ id: "square", name: "Square", px: 0 },
	{ id: "slight", name: "Slight", px: 3 },
	{ id: "soft", name: "Soft", px: 6 },
	{ id: "rounded", name: "Rounded", px: 10 },
	{ id: "round", name: "Very round", px: 16 },
	{ id: "pill", name: "Pill", px: 24 },
];
/** The theme whose buttons, tabs and edges apply: the chosen one, or the plain Obsidian set when the theme's styles are switched off. */
export function looksOf(s: UniverseViewSettings): ThemeInfo {
	return s.themeStyles === false ? THEMES[0] : (THEMES.find((x) => x.id === s.theme) ?? THEMES[0]);
}

/**
 * Picking a theme shows what its card promised: your own button, tab, edge, icon, heading and font picks are cleared
 * (they would otherwise be drawn over the theme), and the theme's surface applies. Your tactile settings are kept
 * for the "Use my own tactile settings" switch. Returns how many picks were cleared.
 */
export function adoptTheme(s: UniverseViewSettings): number {
	const keys = ["buttonStyle", "tabStyle", "edgeStyle", "iconStyle", "headingStyle", "fontStyle"] as const;
	const raw = s as unknown as Record<string, unknown>;
	const n = keys.filter((k) => raw[k] !== undefined).length;
	for (const k of keys) delete raw[k];
	s.tactileOwn = false;
	return n;
}

/** Whether your own surface choices apply (the toggle), or, if never set, whether you ever made any. */
export function personalSurface(s: UniverseViewSettings): boolean {
	return s.tactileOwn ?? (s.surfaceStyle !== undefined || s.tactileOff !== undefined || s.tactileStrength !== undefined);
}

/** The settings a copied or saved look carries. */
export const LOOK_KEYS = ["theme", "colors", "fontUi", "fontDisplay", "fontMap", "themeStyles", "buttonStyle", "tabStyle", "edgeStyle", "fontStyle", "iconStyle", "headingStyle", "sketchRandom", "surfaceStyle", "tactileOff", "tactileOwn", "tactileStrength", "themeMap", "themeScope", "inkAnimation", "motion", "density", "radius"] as const;

/** Everything that makes up the current look, as plain data. */
export function captureLook(s: UniverseViewSettings): Record<string, unknown> {
	const all = s as unknown as Record<string, unknown>;
	const look: Record<string, unknown> = {};
	for (const k of LOOK_KEYS) if (all[k] !== undefined) look[k] = JSON.parse(JSON.stringify(all[k]));
	return look;
}

/** Puts a look on the settings: what it names is set, and the optional picks it leaves out are cleared. */
export function applyThemeLook(s: UniverseViewSettings, look: Record<string, unknown>) {
	const all = s as unknown as Record<string, unknown>;
	for (const k of LOOK_KEYS) {
		if (k in look) all[k] = JSON.parse(JSON.stringify(look[k]));
		else if (k === "radius") s.radius = -1;
		else if (k !== "theme" && k !== "colors" && k !== "motion" && k !== "density") delete all[k];
	}
	if (!THEMES.some((t) => t.id === s.theme)) s.theme = "obsidian";
}

/** A saved theme's card: the theme it starts from, and the picks that override that theme's own looks. */
export function savedLooks(t: SavedTheme): { base: ThemeInfo; buttons?: ButtonStyle; tabs?: TabStyle; edges?: EdgeStyle; icons?: IconStyle; headings?: HeadingStyle; radius?: number } {
	const l = t.look;
	const base = THEMES.find((x) => x.id === l.theme) ?? THEMES[0];
	return { base, buttons: l.buttonStyle as ButtonStyle | undefined, tabs: l.tabStyle as TabStyle | undefined, edges: l.edgeStyle as EdgeStyle | undefined, icons: l.iconStyle as IconStyle | undefined, headings: l.headingStyle as HeadingStyle | undefined, radius: typeof l.radius === "number" && l.radius >= 0 ? l.radius : undefined };
}
/** The surface in force: your own choice where you made one, else the theme's. `strength` is a percentage. */
export function surfaceOf(s: UniverseViewSettings): { tactile: boolean; off: TactilePart[]; strength: number } {
	const th = looksOf(s).surface;
	if (!personalSurface(s)) return { tactile: th.tactile, off: th.off ?? [], strength: th.strength ?? 100 };
	return {
		tactile: s.surfaceStyle ? s.surfaceStyle === "tactile" : th.tactile,
		off: s.tactileOff ?? th.off ?? [],
		strength: s.tactileStrength ?? th.strength ?? 100,
	};
}

/** Puts the chosen theme, colors, motion and density on <body> as classes and CSS variables. */
export function applyAppearance(s: UniverseViewSettings) {
	// Parchment was folded into Manuscript.
	if ((s.theme as string) === "parchment") s.theme = "manuscript";
	const body = document.body;
	for (const c of Array.from(body.classList)) if (c.startsWith("universeview-theme-") || c.startsWith("universeview-motion-")) body.classList.remove(c);
	body.classList.add(`universeview-theme-${s.theme}`, `universeview-motion-${s.motion}`);
	// Buttons, tabs, edges, icons, headings and fonts: your pick, else the theme's own.
	for (const c of Array.from(body.classList)) if (/^uv-(btn|tabs|edge|font|icons|head)-/.test(c)) body.classList.remove(c);
	const th = looksOf(s);
	body.classList.add(`uv-btn-${s.buttonStyle ?? th.buttons}`, `uv-tabs-${s.tabStyle ?? th.tabs}`, `uv-edge-${s.edgeStyle ?? th.edges}`, `uv-icons-${s.iconStyle ?? th.icons}`, `uv-head-${s.headingStyle ?? th.headings}`);
	if (s.fontStyle) body.classList.add(`uv-font-${s.fontStyle}`);
	setRoughEdges(s.sketchRandom === true && (s.edgeStyle ?? th.edges) === "sketch");
	const set = (name: string, v: string | undefined) => (v ? body.style.setProperty(name, v) : body.style.removeProperty(name));
	set("--universeview-user-accent", s.colors.accent);
	// Tooltip and fade timings and sizes (Settings → Hover cards and tips).
	// Fonts (Settings → Look & cards): empty keeps the theme's.
	const font = (v: string | undefined) => (v?.trim() ? (/[,"']/.test(v) ? v.trim() : `"${v.trim()}"`) : undefined);
	set("--universeview-font-ui", font(s.fontUi));
	set("--universeview-font-display", font(s.fontDisplay) ?? (s.fontStyle ? undefined : THEME_FONTS[s.theme]));
	set("--universeview-theme-radius", `${themeRadius(s.theme)}px`);
	set("--uv-select-bg", THEME_SELECT[s.theme]?.bg);
	set("--uv-select-fg", THEME_SELECT[s.theme]?.fg);
	set("--uv-select-sh", THEME_SELECT[s.theme]?.sh);
	set("--universeview-font-map", font(s.fontMap));
	const ms = (v: number | undefined, d: number) => `${Math.max(0, v ?? d)}ms`;
	body.style.setProperty("--universeview-hc-fade", ms(s.hoverFadeMs, 220));
	body.style.setProperty("--universeview-hc-width", `${Math.max(240, s.hoverCardWidth ?? 340)}px`);
	body.style.setProperty("--universeview-ring-size", `${Math.max(10, s.hoverRingSize ?? 18)}px`);
	body.style.setProperty("--universeview-help-fade", ms(s.helpFadeMs, 220));
	body.style.setProperty("--universeview-tier-fade", ms(s.tierFadeMs, 300));
	body.style.setProperty("--universeview-label-fade", ms(s.labelFadeMs, 150));
	set("--universeview-user-event", s.colors.event);
	set("--universeview-user-person", s.colors.person);
	set("--universeview-user-culture", s.colors.culture);
	set("--universeview-user-place", s.colors.place);
	const m = MOTIONS.find((x) => x.id === s.motion) ?? MOTIONS[2];
	set("--universeview-user-speed", String(m.speed));
	set("--universeview-ease", m.ease);
	set("--universeview-density", String(DENSITY[s.density] ?? 1));
	set("--universeview-user-radius", s.radius >= 0 ? `${s.radius}px` : undefined);
	// Map look (Settings → Maps & realms → Map look): name and pin sizes, lettering, borders.
	const clamp = (v: number | undefined, lo: number, hi: number, d: number) => String(Math.max(lo, Math.min(hi, v ?? d)));
	set("--uv-map-label-scale", clamp(s.mapLabelScale, 0.5, 2.5, 1));
	set("--uv-pin-scale", clamp(s.mapPinScale, 0.5, 2.5, 1));
	for (const c of Array.from(body.classList)) if (c.startsWith("uv-map-labels-") || c.startsWith("uv-map-paper-") || c.startsWith("uv-border-")) body.classList.remove(c);
	body.classList.add(`uv-map-labels-${s.mapLabelStyle ?? "engraved"}`, `uv-border-${s.territoryBorder ?? "own"}`);
	body.classList.toggle("uv-map-label-halo", s.mapLabelHalo !== false);
	if (s.mapPaper) body.classList.add(`uv-map-paper-${s.mapPaper}`);
	body.classList.toggle("uv-map-frame", !!s.mapFrame);
	body.classList.toggle("uv-map-compass", !!s.mapCompass);
	body.classList.toggle("uv-no-region-labels", s.regionLabels === false);
	body.classList.toggle("uv-insp-compact", s.inspectorDensity === "compact");
	// Views (Settings → Look & cards → Views): what Style Settings used to offer.
	const px = (v: number | undefined) => (v ? `${v}px` : undefined);
	set("--universeview-tl-row-height", px(s.tlRowHeight));
	set("--universeview-tl-font-size", px(s.tlFontSize));
	set("--universeview-card-width", px(s.cardWidth));
	set("--universeview-card-height", px(s.cardHeight));
	set("--universeview-male-tint", s.tintMale);
	set("--universeview-female-tint", s.tintFemale);
	body.classList.toggle("universeview-gender-tint", !!s.genderTint);
	body.classList.toggle("uv-map-plain", s.themeMap === false);
	body.classList.toggle("uv-ink", s.inkAnimation !== false && s.motion !== "off" && !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
	body.classList.toggle("uv-scope-app", s.themeScope === "app");
	const surface = surfaceOf(s);
	const tactile = surface.tactile;
	body.classList.toggle("uv-tactile", tactile);
	for (const part of TACTILE_PARTS) body.classList.toggle(`uv-t-${part.id}`, tactile && !surface.off.includes(part.id));
	set("--uv-t-depth", tactile ? String(Math.max(0.2, Math.min(2.2, surface.strength / 100))) : undefined);
	set("--uv-t-folder", tactile && personalSurface(s) ? s.tactileFolderColor : undefined);
	// Map look: the realm border band and rivers.
	for (const c of Array.from(body.classList)) if (c.startsWith("uv-band-")) body.classList.remove(c);
	body.classList.add(`uv-band-${s.realmBand ?? "soft"}`);
	set("--uv-river-color", s.riverColor);
}

export function clearAppearance() {
	setRoughEdges(false);
	const body = document.body;
	for (const c of Array.from(body.classList)) if (c.startsWith("universeview-theme-") || c.startsWith("universeview-motion-") || /^uv-(btn|tabs|edge|font|icons|head)-/.test(c) || c.startsWith("uv-map-") || c.startsWith("uv-border-") || c === "uv-map-frame" || c === "uv-map-compass" || c === "uv-no-region-labels" || c === "uv-insp-compact" || c === "uv-ink" || c === "universeview-gender-tint" || c === "universeview-flat" || c === "uv-tactile" || c.startsWith("uv-t-") || c.startsWith("uv-band-")) body.classList.remove(c);
	for (const v of BODY_VARS) body.style.removeProperty(v);
}
