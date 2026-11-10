import { setRoughEdges } from "./ui/roughedges";
import type { ButtonStyle, ChronicleSettings, EdgeStyle, FontStyle, HeadingStyle, IconStyle, MotionId, TabStyle, TactilePart, ThemeId } from "./settings";
export const BUTTON_STYLES: { id: ButtonStyle; name: string }[] = [
	{ id: "quiet", name: "Quiet (text, fills on hover)" },
	{ id: "outlined", name: "Outlined (a thin edge)" },
	{ id: "filled", name: "Filled (a soft solid)" },
	{ id: "pill", name: "Pill (fully rounded, accent when on)" },
	{ id: "stamp", name: "Stamp (hard shadow, presses down)" },
	{ id: "glow", name: "Glow (lit edge)" },
	{ id: "ruled", name: "Ruled (small caps, underline)" },
];
export const TAB_STYLES: { id: TabStyle; name: string }[] = [
	{ id: "underline", name: "Underline" },
	{ id: "folder", name: "Folder tab (joined to the page)" },
	{ id: "segmented", name: "Segmented (one rounded strip)" },
	{ id: "plain", name: "Plain text (accent and a dot when open)" },
	{ id: "block", name: "Block (solid accent when open)" },
	{ id: "glow", name: "Glow (capitals, lit when open)" },
	{ id: "rule", name: "Rule (small caps between two rules)" },
];
export const EDGE_STYLES: { id: EdgeStyle; name: string; note: string }[] = [
	{ id: "clean", name: "Clean", note: "A thin line" },
	{ id: "double", name: "Double rule", note: "A second line inside" },
	{ id: "ornate", name: "Ornate", note: "Corner brackets" },
	{ id: "stitched", name: "Stitched", note: "A dashed seam" },
	{ id: "sketch", name: "Hand-drawn", note: "A wobbly pen line" },
	{ id: "chamfer", name: "Cut corners", note: "Technical, angled" },
	{ id: "ledger", name: "Ledger", note: "Rules top and bottom" },
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
	{ id: "light", name: "Light", note: "Fine, delicate lines" },
	{ id: "regular", name: "Regular", note: "Obsidian's own weight" },
	{ id: "bold", name: "Bold", note: "Heavy, easy to spot" },
];
export const HEADING_STYLES: { id: HeadingStyle; name: string; note: string }[] = [
	{ id: "plain", name: "Plain", note: "Just the words" },
	{ id: "ruled", name: "Ruled", note: "Underlined" },
	{ id: "flourish", name: "Flourish", note: "An ornament after" },
	{ id: "smallcaps", name: "Small caps", note: "Book style" },
	{ id: "capitals", name: "Capitals", note: "Spaced, technical" },
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
const DEPTH = { subtle: 0.55, normal: 1, deep: 1.6 };

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
	/** Preview swatches: background, panel, text, accent, then the four type colors. */
	swatches: string[];
}

/** The themes only restyle UniverseView's own views, embeds, cards and dialogs; the rest of Obsidian is untouched. */
export const THEMES: ThemeInfo[] = [
	{
		id: "obsidian",
		buttons: "quiet", tabs: "underline", edges: "clean", icons: "regular", headings: "plain",
		name: "Obsidian",
		forWhat: "Any vault",
		description: "Follows your Obsidian theme and accent color, light or dark.",
		swatches: ["var(--background-primary)", "var(--background-secondary)", "var(--text-normal)", "var(--interactive-accent)", "var(--color-blue)", "var(--color-green)", "var(--color-purple)", "var(--color-orange)"],
	},
	{
		id: "parchment",
		buttons: "outlined", tabs: "folder", edges: "ornate", icons: "regular", headings: "flourish",
		name: "Parchment",
		forWhat: "Fantasy worldbuilding & campaigns",
		description: "Aged paper, ink and sealing-wax red, with engraved serif headings. Candle-lit leather in dark mode.",
		swatches: ["#f3e8cf", "#e8d9b5", "#3b2c1a", "#9a2f1d", "#9a2f1d", "#3f6b3a", "#6c3f86", "#a5671e"],
	},
	{
		id: "archive",
		buttons: "quiet", tabs: "plain", edges: "stitched", icons: "light", headings: "ruled",
		name: "Archive",
		forWhat: "Genealogy & family history",
		description: "Soft archival cream, photo-album cards and calm greens, like a well-kept family record.",
		swatches: ["#fbf9f4", "#f1ece1", "#2b2924", "#2f6b57", "#356f9c", "#2f6b57", "#8a5a2b", "#a2493b"],
	},
	{
		id: "starfield",
		buttons: "glow", tabs: "glow", edges: "chamfer", icons: "bold", headings: "capitals",
		name: "Starfield",
		forWhat: "Science fiction & space opera",
		description: "Deep-space navy with glowing neon lines, a star field behind every view and technical type.",
		swatches: ["#060a14", "#0c1426", "#d7e3ff", "#38d1ff", "#38d1ff", "#73f7b4", "#c48bff", "#ffb547"],
	},
	{
		id: "scholar",
		buttons: "ruled", tabs: "rule", edges: "ledger", icons: "light", headings: "smallcaps",
		name: "Scholar",
		forWhat: "History & academic research",
		description: "Crisp paper-white, navy and burgundy, fine rules and book typography. Built for reading dense timelines.",
		swatches: ["#ffffff", "#f4f5f7", "#1a2230", "#1f4e8c", "#1f4e8c", "#3b7a57", "#8b2e3c", "#b06f1b"],
	},
	{
		id: "atelier",
		buttons: "stamp", tabs: "block", edges: "sketch", icons: "bold", headings: "plain",
		name: "Atelier",
		forWhat: "Novels, scripts & story planning",
		description: "A modern studio look: frosted glass, soft gradients and rounded cards in muted pastels.",
		swatches: ["#f6f4fb", "#ece8f6", "#2a2638", "#7c5cff", "#7c5cff", "#21a67a", "#e0569a", "#f08a3c"],
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
export function motionMs(settings: ChronicleSettings, base: number): number {
	if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return 0;
	const m = MOTIONS.find((x) => x.id === settings.motion) ?? MOTIONS[2];
	return m.id === "off" ? 0 : Math.round(base * m.speed);
}

const BODY_VARS = [
	"--chronicle-user-accent", "--chronicle-user-event", "--chronicle-user-person", "--chronicle-user-culture", "--chronicle-user-place",
	"--chronicle-user-speed", "--chronicle-ease", "--chronicle-density", "--chronicle-user-radius", "--uv-map-label-scale", "--uv-pin-scale",
	"--chronicle-tl-row-height", "--chronicle-tl-font-size", "--chronicle-card-width", "--chronicle-card-height", "--chronicle-male-tint", "--chronicle-female-tint", "--uv-river-color", "--uv-t-depth", "--uv-t-folder",
];

/** The theme whose buttons, tabs and edges apply: the chosen one, or the plain Obsidian set when the theme's styles are switched off. */
export function looksOf(s: ChronicleSettings): ThemeInfo {
	return s.themeStyles === false ? THEMES[0] : (THEMES.find((x) => x.id === s.theme) ?? THEMES[0]);
}

/** Puts the chosen theme, colors, motion and density on <body> as classes and CSS variables. */
export function applyAppearance(s: ChronicleSettings) {
	const body = document.body;
	for (const c of Array.from(body.classList)) if (c.startsWith("chronicle-theme-") || c.startsWith("chronicle-motion-")) body.classList.remove(c);
	body.classList.add(`chronicle-theme-${s.theme}`, `chronicle-motion-${s.motion}`);
	// Buttons, tabs, edges, icons, headings and fonts: your pick, else the theme's own.
	for (const c of Array.from(body.classList)) if (/^uv-(btn|tabs|edge|font|icons|head)-/.test(c)) body.classList.remove(c);
	const th = looksOf(s);
	body.classList.add(`uv-btn-${s.buttonStyle ?? th.buttons}`, `uv-tabs-${s.tabStyle ?? th.tabs}`, `uv-edge-${s.edgeStyle ?? th.edges}`, `uv-icons-${s.iconStyle ?? th.icons}`, `uv-head-${s.headingStyle ?? th.headings}`);
	if (s.fontStyle) body.classList.add(`uv-font-${s.fontStyle}`);
	setRoughEdges(s.sketchRandom === true && (s.edgeStyle ?? th.edges) === "sketch");
	const set = (name: string, v: string | undefined) => (v ? body.style.setProperty(name, v) : body.style.removeProperty(name));
	set("--chronicle-user-accent", s.colors.accent);
	// Tooltip and fade timings and sizes (Settings → Hover cards and tips).
	// Fonts (Settings → Look & cards): empty keeps the theme's.
	const font = (v: string | undefined) => (v?.trim() ? (/[,"']/.test(v) ? v.trim() : `"${v.trim()}"`) : undefined);
	set("--chronicle-font-ui", font(s.fontUi));
	set("--chronicle-font-display", font(s.fontDisplay));
	set("--chronicle-font-map", font(s.fontMap));
	const ms = (v: number | undefined, d: number) => `${Math.max(0, v ?? d)}ms`;
	body.style.setProperty("--chronicle-hc-fade", ms(s.hoverFadeMs, 220));
	body.style.setProperty("--chronicle-hc-width", `${Math.max(240, s.hoverCardWidth ?? 340)}px`);
	body.style.setProperty("--chronicle-ring-size", `${Math.max(10, s.hoverRingSize ?? 18)}px`);
	body.style.setProperty("--chronicle-help-fade", ms(s.helpFadeMs, 220));
	body.style.setProperty("--chronicle-tier-fade", ms(s.tierFadeMs, 300));
	body.style.setProperty("--chronicle-label-fade", ms(s.labelFadeMs, 150));
	set("--chronicle-user-event", s.colors.event);
	set("--chronicle-user-person", s.colors.person);
	set("--chronicle-user-culture", s.colors.culture);
	set("--chronicle-user-place", s.colors.place);
	const m = MOTIONS.find((x) => x.id === s.motion) ?? MOTIONS[2];
	set("--chronicle-user-speed", String(m.speed));
	set("--chronicle-ease", m.ease);
	set("--chronicle-density", String(DENSITY[s.density] ?? 1));
	set("--chronicle-user-radius", s.radius >= 0 ? `${s.radius}px` : undefined);
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
	set("--chronicle-tl-row-height", px(s.tlRowHeight));
	set("--chronicle-tl-font-size", px(s.tlFontSize));
	set("--chronicle-card-width", px(s.cardWidth));
	set("--chronicle-card-height", px(s.cardHeight));
	set("--chronicle-male-tint", s.tintMale);
	set("--chronicle-female-tint", s.tintFemale);
	body.classList.toggle("chronicle-gender-tint", !!s.genderTint);
	body.classList.toggle("chronicle-flat", !!s.flatStyle);
	const tactile = s.surfaceStyle === "tactile";
	body.classList.toggle("uv-tactile", tactile);
	for (const part of TACTILE_PARTS) body.classList.toggle(`uv-t-${part.id}`, tactile && !(s.tactileOff ?? []).includes(part.id));
	set("--uv-t-depth", tactile ? String(s.tactileStrength !== undefined ? Math.max(0.2, Math.min(2.2, s.tactileStrength / 100)) : DEPTH[s.tactileDepth ?? "normal"]) : undefined);
	set("--uv-t-folder", tactile ? s.tactileFolderColor : undefined);
	// Map look: the realm border band and rivers.
	for (const c of Array.from(body.classList)) if (c.startsWith("uv-band-")) body.classList.remove(c);
	body.classList.add(`uv-band-${s.realmBand ?? "soft"}`);
	set("--uv-river-color", s.riverColor);
}

export function clearAppearance() {
	setRoughEdges(false);
	const body = document.body;
	for (const c of Array.from(body.classList)) if (c.startsWith("chronicle-theme-") || c.startsWith("chronicle-motion-") || /^uv-(btn|tabs|edge|font|icons|head)-/.test(c) || c.startsWith("uv-map-") || c.startsWith("uv-border-") || c === "uv-map-frame" || c === "uv-map-compass" || c === "uv-no-region-labels" || c === "uv-insp-compact" || c === "chronicle-gender-tint" || c === "chronicle-flat" || c === "uv-tactile" || c.startsWith("uv-t-") || c.startsWith("uv-band-")) body.classList.remove(c);
	for (const v of BODY_VARS) body.style.removeProperty(v);
}
