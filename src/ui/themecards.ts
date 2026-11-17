import type { SavedTheme, ThemeId } from "../settings";
import { el, icon } from "../render/common";
import { THEMES, THEME_FONTS, THEME_GROUPS, THEME_SELECT, savedLooks, themeRadius, type ThemeInfo } from "../appearance";



/** The values Obsidian itself gives, read from <body> where no UniverseView theme redefines them. */
const OBSIDIAN_VARS = ["--background-primary", "--background-secondary", "--text-normal", "--text-muted", "--text-faint", "--background-modifier-border", "--background-modifier-border-hover", "--background-modifier-hover", "--interactive-accent", "--text-on-accent", "--font-interface"];

/** The picks of a saved theme that differ from its base theme's own looks. */
interface SampleOverrides {
	buttons?: string;
	tabs?: string;
	edges?: string;
	icons?: string;
	headings?: string;
	radius?: number;
}

/** Sets a theme's colours, font and accent on an element (through set), so what is drawn there never takes the active theme's. */
function palette(set: (k: string, v: string) => void, th: ThemeInfo) {
	const [bg, panel, text, accent] = th.swatches;
	if (th.id === "obsidian") {
		const body = getComputedStyle(document.body);
		for (const v of OBSIDIAN_VARS) set(v, body.getPropertyValue(v));
		set("--universeview-accent", body.getPropertyValue("--interactive-accent"));
		set("--uv-tc-font", "var(--font-interface)");
	} else {
		set("--background-primary", bg);
		set("--background-secondary", panel);
		set("--text-normal", text);
		set("--text-muted", `color-mix(in srgb, ${text} 68%, ${bg})`);
		set("--text-faint", `color-mix(in srgb, ${text} 42%, ${bg})`);
		set("--background-modifier-border", `color-mix(in srgb, ${text} 22%, ${bg})`);
		set("--background-modifier-border-hover", `color-mix(in srgb, ${text} 38%, ${bg})`);
		set("--background-modifier-hover", `color-mix(in srgb, ${text} 9%, transparent)`);
		set("--interactive-accent", accent);
		set("--universeview-accent", accent);
		set("--text-on-accent", bg);
		set("--uv-tc-font", THEME_FONTS[th.id] ?? "inherit");
	}
}

/**
 * A live sample drawn by the theme's own looks (through `.uv-pv`): its colours, its heading font, a tab, two buttons
 * and two icons at its weight, inside a panel with its edge. Everything it uses is set on the sample itself, so the
 * active theme never reaches it, even when the settings sit inside a themed window.
 */
function themeSample(card: HTMLElement, th: ThemeInfo, plain: boolean, over: SampleOverrides = {}) {
	// With "Themes set buttons, tabs…" off, every theme draws these with the plain Obsidian set; its colours and fonts stay.
	const looks = plain ? THEMES[0] : th;
	const b = over.buttons ?? looks.buttons;
	const t = over.tabs ?? looks.tabs;
	const e = over.edges ?? looks.edges;
	const i = over.icons ?? looks.icons;
	const h = over.headings ?? looks.headings;
	const s = el("div", { cls: `uv-pv uv-sp-col uv-tc-sample uv-btn-${b} uv-tabs-${t} uv-edge-${e} uv-icons-${i} uv-head-${h}` }, card);
	const set = (k: string, v: string) => s.style.setProperty(k, v);
	// The theme's own corner radius (or the saved theme's), not the active theme's.
	const r = over.radius ?? themeRadius(th.id);
	set("--uv-r-sm", `${r * 0.65}px`);
	set("--uv-r-md", `${r}px`);
	set("--uv-r-lg", `${r + 4}px`);
	palette(set, th);
	// The theme's frame, drawn over the sample the way it is drawn over a view.
	if (th.id !== "obsidian") el("div", { cls: "uv-tc-frame", attr: { "data-uvt": th.id } }, s);
	const pick = THEME_SELECT[th.id];
	set("--uv-sel-bg", pick?.bg ?? "color-mix(in srgb, var(--interactive-accent) 16%, transparent)");
	set("--uv-sel-fg", pick?.fg ?? "var(--text-normal)");
	set("--uv-sel-sh", pick?.sh ?? "none");
	const tabs = el("div", { cls: "uv-hub-tabs" }, s);
	el("button", { cls: "uv-hub-tab", text: "Map", attr: { tabindex: "-1" } }, tabs);
	el("button", { cls: "uv-hub-tab is-active", text: "Events", attr: { tabindex: "-1" } }, tabs);
	const panelEl = el("div", { cls: "uv-pv-card uv-tc-panel" }, s);
	el("div", { cls: "uv-tc-title universeview-module-title", text: "Tudors" }, panelEl);
	const row = el("div", { cls: "uv-tc-row" }, panelEl);
	el("span", { cls: "universeview-chip", text: "Show" }, row);
	el("span", { cls: "universeview-chip is-active", text: "On" }, row);
	for (const n of ["map", "search"]) icon(el("span", { cls: "uv-sp-icon" }, row), n);
}

/** Saved themes, shown under "My themes": picking one applies it; the cross deletes it. */
export interface MyThemes {
	themes: SavedTheme[];
	active?: string;
	onPick: (id: string) => void;
	onDelete: (id: string) => void;
}

/** The theme cards (a small preview, the name and what it suits), one of them marked; `onPick` hears each click. Settings and the tour share them. */
export function renderThemeCards(parent: HTMLElement, selected: ThemeId | "", onPick: (id: ThemeId) => void, plain = false, mine?: MyThemes): HTMLElement {
	const grid = el("div", { cls: "universeview-theme-groups" }, parent);
	// The cards sit under small group names (paper, modern, electric…), in the order of THEME_GROUPS.
	for (const group of THEME_GROUPS) {
		el("div", { cls: "uv-theme-group-name", text: group.name }, grid);
		const row = el("div", { cls: "universeview-theme-grid" }, grid);
		for (const id of group.ids) {
			const th = THEMES.find((t) => t.id === id);
			if (th) themeCard(row, grid, { th, selected: selected === th.id, plain, name: th.name, sub: th.forWhat, pick: () => onPick(th.id) });
		}
	}
	if (mine?.themes.length) {
		el("div", { cls: "uv-theme-group-name", text: "My themes" }, grid);
		const row = el("div", { cls: "universeview-theme-grid" }, grid);
		for (const saved of mine.themes) {
			const { base, ...over } = savedLooks(saved);
			themeCard(row, grid, { th: base, selected: mine.active === saved.id, plain: false, over, name: saved.name, sub: `Based on ${base.name}`, pick: () => mine.onPick(saved.id), remove: () => mine.onDelete(saved.id) });
		}
	}
	return grid;
}

interface CardOptions {
	th: ThemeInfo;
	selected: boolean;
	plain: boolean;
	over?: SampleOverrides;
	name: string;
	sub: string;
	pick: () => void;
	remove?: () => void;
}

function themeCard(row: HTMLElement, grid: HTMLElement, o: CardOptions) {
	const { th } = o;
	// The card is itself a button of the theme: hovering it shows that theme's button hover, pressing it the pressed look, and the chosen card the theme's selection style.
	const buttonLook = o.over?.buttons ?? (o.plain ? THEMES[0].buttons : th.buttons);
	const card = el("button", { cls: "universeview-theme-card" + (o.selected ? " is-active" : "") }, row);
	// The layer behind the card: drawn in the theme's own colours with its button look, it is what shows on hover (hover look), press (pressed look) and selection.
	const back = el("div", { cls: `uv-tc-back uv-pv uv-btn-${buttonLook}` }, card);
	palette((k, v) => back.style.setProperty(k, v), th);
	const pick = THEME_SELECT[th.id];
	back.style.setProperty("--uv-sel-bg", pick?.bg ?? "color-mix(in srgb, var(--interactive-accent) 12%, transparent)");
	back.style.setProperty("--uv-sel-sh", pick?.sh ?? "none");
	// The card itself previews the theme: its corner radius and its accent for the selected state. Hovering plays the theme's button states in the sample.
	const r = o.over?.radius ?? themeRadius(th.id);
	card.style.setProperty("--uv-tc-r", `${r + 4}px`);
	card.style.setProperty("--uv-tc-rs", `${r}px`);
	if (th.id !== "obsidian") card.style.setProperty("--uv-tc-accent", th.swatches[3]);
	const preview = el("div", { cls: `universeview-theme-preview preview-${th.id}` }, card);
	const [bg, panel, text, accent, ...types] = th.swatches;
	preview.style.setProperty("--pv-bg", bg);
	preview.style.setProperty("--pv-panel", panel);
	preview.style.setProperty("--pv-text", text);
	preview.style.setProperty("--pv-accent", accent);
	const bar = el("div", { cls: "universeview-pv-bar" }, preview);
	for (let i = 0; i < 3; i++) el("span", {}, bar);
	const rows = el("div", { cls: "universeview-pv-rows" }, preview);
	types.forEach((c, i) => {
		const rowEl = el("span", { cls: "universeview-pv-row" }, rows);
		rowEl.style.setProperty("--pv-c", c);
		rowEl.style.setProperty("--pv-w", `${[70, 45, 85, 55][i]}%`);
		rowEl.style.setProperty("--pv-x", `${[4, 30, 12, 38][i]}%`);
	});
	themeSample(card, th, o.plain, o.over);
	el("div", { cls: "universeview-theme-name", text: o.name }, card).style.setProperty("--uv-tc-font", THEME_FONTS[th.id] ?? "inherit");
	el("div", { cls: "universeview-theme-for", text: o.sub }, card);
	card.setAttribute("aria-label", o.name);
	if (o.remove) {
		const del = el("span", { cls: "uv-tc-del", title: "Delete this theme", attr: { role: "button", "aria-label": "Delete this theme" } }, card);
		icon(del, "x");
		del.addEventListener("click", (evt) => {
			evt.stopPropagation();
			o.remove?.();
		});
	}
	card.addEventListener("click", () => {
		grid.querySelectorAll(".universeview-theme-card").forEach((c) => c.removeClass("is-active"));
		card.addClass("is-active");
		o.pick();
	});
}
