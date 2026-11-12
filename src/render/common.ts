import { Keymap, Menu, MenuItem, Notice, Platform, TFile, WorkspaceLeaf, setIcon } from "obsidian";
import type UniverseViewPlugin from "../main";
import type { Entity, EntityType } from "../types";
import { kindLabel } from "../index/reader";

export const HOVER_SOURCE = "universeview";
const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * SVG elements from fixed markup (an arrowhead, a hatching pattern), parsed as XML and imported
 * rather than written in with innerHTML. Returns the parsed children, to append where they go.
 */
export function svgMarkup(markup: string): Element[] {
	const doc = new DOMParser().parseFromString(`<svg xmlns="${SVG_NS}">${markup}</svg>`, "image/svg+xml");
	if (doc.getElementsByTagName("parsererror").length) return [];
	return Array.from(doc.documentElement.children).map((c) => document.importNode(c, true));
}

export function svg<K extends keyof SVGElementTagNameMap>(
	tag: K,
	attrs: Record<string, string | number | undefined> = {},
	parent?: Element,
): SVGElementTagNameMap[K] {
	const el = document.createElementNS(SVG_NS, tag);
	for (const [k, v] of Object.entries(attrs)) if (v !== undefined) el.setAttribute(k, String(v));
	parent?.appendChild(el);
	return el;
}

export function el<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	opts: { cls?: string; text?: string; attr?: Record<string, string>; title?: string } = {},
	parent?: HTMLElement,
): HTMLElementTagNameMap[K] {
	const e = createEl(tag);
	if (opts.cls) e.className = opts.cls;
	if (opts.text !== undefined) e.textContent = opts.text;
	if (opts.title) e.setAttribute("aria-label", opts.title);
	for (const [k, v] of Object.entries(opts.attr ?? {})) e.setAttribute(k, v);
	parent?.appendChild(e);
	return e;
}

/** Lucide renamed several icons; Obsidian versions ship different sets, so try older names too. */
const ICON_FALLBACKS: Record<string, string[]> = {
	"user-round": ["user"],
	"users-round": ["users"],
	"user-round-search": ["search"],
	"user-round-plus": ["user-plus"],
	"map-pin-plus": ["map-pin"],
	"triangle-alert": ["alert-triangle"],
	"circle-x": ["x-circle"],
	"circle-check": ["check-circle"],
	"calendar-clock": ["calendar"],
	"image-off": ["image"],
	palmtree: ["tree-palm"],
	"tree-palm": ["palmtree"],
	"layout-dashboard": ["layout-grid", "layout"],
	"grip-horizontal": ["grip", "move"],
	"paintbrush": ["brush", "pencil"],
	"paint-bucket": ["droplet", "palette"],
	"undo-2": ["undo", "rotate-ccw"],
	"land-plot": ["map", "hexagon"],
	"radar": ["locate", "circle-dot"],
	"columns-2": ["columns", "layout"],
	"sticky-note": ["file-text"],
	"move-right": ["arrow-right"],
	"group": ["layers"],
	"ghost": ["eye-off"],
	"dices": ["dice-5", "shuffle"],
	"git-compare": ["git-merge", "users"],
	"book-open-check": ["book-open"],
	"bar-chart-3": ["bar-chart", "chart-column"],
	"navigation": ["navigation-2", "compass"],
	"scale": ["equal"],
	"cake": ["gift"],
	"bookmark-plus": ["bookmark"],
	"rows-3": ["rows", "align-justify"],
	"image-down": ["image", "download"],
	"file-output": ["file-down", "download"],
	"route": ["spline", "waypoints"],
	"flame": ["sun", "circle"],
	"panels-top-left": ["layout-panel-top", "layout-dashboard", "layout"],
	"gantt-chart": ["chart-gantt", "calendar-range"],
	"folder-cog": ["folder-cog-2", "folder"],
	"network": ["share-2", "git-fork"],
	"chevrons-down-up": ["chevron-up"],
	"chevrons-up-down": ["chevron-down"],
	"pie-chart": ["chart-pie", "bar-chart"],
	"shield-alert": ["alert-triangle"],
	"check": ["check-small"],
	"ruler": ["move-horizontal"],
	"locate-fixed": ["locate", "crosshair"],
	"swatch-book": ["palette"],
};

export function icon(target: HTMLElement, name: string) {
	setIcon(target, name);
	if (target.querySelector("svg")) return;
	for (const alt of ICON_FALLBACKS[name] ?? []) {
		setIcon(target, alt);
		if (target.querySelector("svg")) return;
	}
}

/** A Lucide icon by name, or the text itself for emoji and other symbols. Returns false if nothing rendered. */
export function glyph(target: HTMLElement, name: string): boolean {
	if (!/^[a-z0-9-]+$/.test(name)) {
		target.setText(name);
		target.addClass("is-text-glyph");
		return true;
	}
	icon(target, name);
	return !!target.querySelector("svg");
}

export const TYPE_ICONS: Record<EntityType, string> = {
	event: "calendar-clock",
	person: "user-round",
	culture: "flag",
	place: "map-pin",
	map: "map",
};

export const TYPE_LABELS: Record<EntityType, string> = {
	event: "Event",
	person: "Person",
	culture: "Group",
	place: "Place",
	map: "Map",
};

/** Default color per type: a CSS variable Style Settings can override. */
export function typeColorVar(type: EntityType): string {
	return `var(--universeview-${type}-color)`;
}

const PALETTE = ["--color-blue", "--color-purple", "--color-green", "--color-orange", "--color-pink", "--color-cyan", "--color-yellow", "--color-red"];

export function hashColor(key: string): string {
	let h = 0;
	for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
	return `var(${PALETTE[Math.abs(h) % PALETTE.length]})`;
}

/** A culture's own color, falling back to a stable palette color. */
export function cultureColor(plugin: UniverseViewPlugin, key: string): string {
	return plugin.index.get(key)?.color ?? hashColor(key);
}

/** Color for an entity: explicit color → first culture's color → type color. */
export function entityColor(plugin: UniverseViewPlugin, e: Entity): string {
	if (e.color) return e.color;
	if (e.type === "culture") return hashColor(e.key);
	const c = e.cultures[0];
	if (c) return cultureColor(plugin, c.ref.key);
	return typeColorVar(e.type);
}

/** How long to rest on a "?" before its tip opens; set from the settings. */
export let helpDelayMs = 350;
export function setHelpDelay(ms: number) {
	helpDelayMs = Math.max(0, ms);
}

/**
 * A small "?" that explains something when you rest on it (or tab to it), instead of a paragraph of
 * help that's always in the way. Paragraphs are split by blank lines; `backticks` show as code.
 */
export function helpTip(parent: HTMLElement, text: string, delay?: number): HTMLElement {
	const q = el("span", { cls: "universeview-help", text: "?", attr: { tabindex: "0", role: "button" } }, parent);
	// Kept on the mark too, for where the mark itself can't go (a settings section's heading).
	q.dataset.help = text;
	let pop: HTMLElement | undefined;
	let timer = 0;
	const show = () => {
		window.clearTimeout(timer);
		timer = window.setTimeout(() => {
			pop?.remove();
			const box = el("div", { cls: "universeview-help-pop universeview-scope" }, document.body);
			pop = box;
			for (const para of text.split(/\n\s*\n/)) {
				const p = el("p", {}, box);
				for (const part of para.split(/(`[^`]+`)/)) {
					if (part.startsWith("`") && part.endsWith("`") && part.length > 1) el("code", { text: part.slice(1, -1) }, p);
					else if (part) p.append(document.createTextNode(part));
				}
			}
			const r = q.getBoundingClientRect();
			const w = box.offsetWidth;
			const h = box.offsetHeight;
			const below = r.bottom + 6 + h < window.innerHeight - 8;
			box.style.top = `${below ? r.bottom + 6 : Math.max(8, r.top - 6 - h)}px`;
			box.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2))}px`;
			window.setTimeout(() => box.addClass("is-visible"), 16);
		}, delay ?? helpDelayMs);
	};
	const hide = () => {
		window.clearTimeout(timer);
		const box = pop;
		pop = undefined;
		box?.removeClass("is-visible");
		window.setTimeout(() => box?.remove(), 130);
	};
	q.addEventListener("mouseenter", show);
	q.addEventListener("mouseleave", hide);
	q.addEventListener("focus", show);
	q.addEventListener("blur", hide);
	q.addEventListener("click", (evt) => evt.stopPropagation());
	return q;
}

/**
 * Who a title answers to and who holds it, as linked lines: "Under California › United States" and
 * "Held by James II · House Whitmore". Nothing for notes that aren't titles. Returns whether it added any.
 */
export function ownershipLines(plugin: UniverseViewPlugin, parent: HTMLElement, key: string, at?: number, cls = "universeview-owner"): boolean {
	const tree = plugin.realms(at);
	const node = tree.nodes.get(key);
	if (!node) return false;
	const link = (into: HTMLElement, r: { key: string; name: string; resolved?: boolean }) => {
		const a = el("a", { cls: "universeview-owner-link" + (r.resolved === false ? " is-unresolved" : ""), text: r.name }, into);
		if (r.resolved === false) return;
		bindHover(plugin, a, r.key, into);
		a.addEventListener("click", (evt) => openEntity(plugin, r.key, evt));
	};
	let added = false;
	const above: string[] = [];
	for (let k = node.under, i = 0; k && i < 20; k = tree.nodes.get(k)?.under, i++) above.push(k);
	if (above.length) {
		const row = el("div", { cls }, parent);
		el("span", { cls: "universeview-owner-key", text: "Under " }, row);
		above.forEach((k, i) => {
			if (i) el("span", { cls: "universeview-owner-sep", text: " › " }, row);
			link(row, { key: k, name: plugin.index.get(k)?.name ?? k });
		});
		added = true;
	}
	if (node.holder || node.house) {
		const row = el("div", { cls }, parent);
		el("span", { cls: "universeview-owner-key", text: "Held by " }, row);
		if (node.holder) link(row, node.holder);
		if (node.holder && node.house) el("span", { cls: "universeview-owner-sep", text: " · " }, row);
		if (node.house) link(row, node.house);
		if (node.ruler && node.ruler.key !== node.holder?.key) {
			el("span", { cls: "universeview-owner-sep", text: " · ruled by " }, row);
			link(row, node.ruler);
		}
		added = true;
	}
	return added;
}

export function openEntity(plugin: UniverseViewPlugin, key: string, evt?: MouseEvent | KeyboardEvent) {
	const file = plugin.app.vault.getAbstractFileByPath(key);
	if (!(file instanceof TFile)) return;
	const { workspace } = plugin.app;
	const mod = evt ? Keymap.isModEvent(evt) : false;
	let leaf: WorkspaceLeaf;
	if (mod || plugin.settings.openInNewTab) leaf = workspace.getLeaf(mod || "tab");
	else {
		// Never replace the UniverseView view itself: reuse the most recent note tab, or open a new one.
		const notes = workspace.getLeavesOfType("markdown");
		const recent = workspace.getMostRecentLeaf();
		leaf = notes.find((l) => l === recent) ?? notes[0] ?? workspace.getLeaf("tab");
	}
	void leaf.openFile(file).then(() => workspace.setActiveLeaf(leaf, { focus: true }));
}

/**
 * How long a first click waits for a second before it acts alone. Most systems count two clicks within 500ms as a
 * double-click; a shorter wait let a slower double-click do both (open the note, then centre on it).
 */
export const DOUBLE_CLICK_MS = 450;

/** The click that opens anything with a hover card in the inspector (see HoverCards), named for this computer. */
export const INSPECT_CLICK = Platform.isMacOS ? "Option-click" : "Alt+click";

/**
 * Separates single from double clicks so a double-click does only the double action. `pressed` runs at once on the
 * first click (to mark what was clicked), so the wait for a possible second click never looks like nothing happened.
 */
export function clickOrDouble(target: Element, single: (evt: MouseEvent) => void, double: (evt: MouseEvent) => void, guard: () => boolean = () => false, pressed?: (evt: MouseEvent) => void) {
	let timer = 0;
	target.addEventListener("click", (evt: MouseEvent) => {
		// Alt+click belongs to the inspector (HoverCards takes it first).
		if (guard() || evt.altKey) return;
		window.clearTimeout(timer);
		// The second click of a double-click: the dblclick event right after it does the work.
		if (evt.detail > 1) return;
		pressed?.(evt);
		timer = window.setTimeout(() => single(evt), DOUBLE_CLICK_MS);
	});
	target.addEventListener("dblclick", (evt: MouseEvent) => {
		window.clearTimeout(timer);
		evt.preventDefault();
		evt.stopPropagation();
		if (!guard() && !evt.altKey) double(evt);
	});
}

/**
 * Resting the pointer on an item shows UniverseView's hover card; with Ctrl/Cmd held it triggers
 * Obsidian's Page Preview (and Hover Editor, if installed) instead.
 */
/** `key` may be a function, for targets whose note changes (a map area shown as its realm when zoomed out). */
export function bindHover(plugin: UniverseViewPlugin, target: Element, key: string | (() => string), hoverParent: { hoverPopover: unknown } | HTMLElement) {
	plugin.hoverCards?.attach(target, key);
	target.addEventListener("mouseover", (evt) => {
		plugin.app.workspace.trigger("hover-link", {
			event: evt,
			source: HOVER_SOURCE,
			hoverParent,
			targetEl: target,
			linktext: (typeof key === "function" ? key() : key).replace(/\.md$/, ""),
			sourcePath: "",
		});
	});
}

export interface EntityMenuOptions {
	/** The main thing to do with it where it was clicked (edit a territory, say), right under the note's own items. */
	top?: (menu: Menu) => void;
	/** Tools for it in this view (plan a journey, paint a territory…), after the other views. */
	extra?: (menu: Menu) => void;
	/** Removing things: always last, set apart, in red. */
	danger?: (menu: Menu) => void;
}

/** A notice that does something when its message is clicked (open the file just saved, copy a link). */
export function clickNotice(message: string, duration: number, onClick: () => void): Notice {
	return new Notice(createFragment((f) => f.createDiv({ text: message }).addEventListener("click", onClick)), duration);
}

/**
 * Long explanations under a setting's name clutter the page: each one moves behind a "?" beside the name, and shows
 * when the pointer rests on the "?" or on the name itself. Short ones, and any with a link or control in them, stay.
 * (Obsidian's settings search reads the definitions, so a hidden description is still searched.)
 */
export function tuckDescriptions(root: HTMLElement, max = 64) {
	for (const desc of Array.from(root.querySelectorAll<HTMLElement>(".setting-item-info > .setting-item-description"))) {
		if (desc.hasClass("is-tucked") || desc.querySelector("a, button, input, select, textarea")) continue;
		const name = desc.parentElement?.querySelector<HTMLElement>(":scope > .setting-item-name");
		if (!name) continue;
		const copy = desc.cloneNode(true) as HTMLElement;
		copy.querySelectorAll("code").forEach((c) => c.replaceWith(`\`${c.textContent ?? ""}\``));
		const text = (copy.textContent ?? "").trim();
		if (text.length <= max) continue;
		desc.addClass("is-tucked");
		const q = helpTip(name, text);
		// The name opens it too, so the whole label is the target.
		name.addClass("has-tucked-help");
		name.addEventListener("mouseenter", () => q.dispatchEvent(new Event("mouseenter")));
		name.addEventListener("mouseleave", () => q.dispatchEvent(new Event("mouseleave")));
	}
}

/** Copies a link to a note, written the way Obsidian writes one (short when the name is unique, with the folder when not). */
export function copyLink(plugin: UniverseViewPlugin, key: string) {
	const file = plugin.app.vault.getAbstractFileByPath(key);
	if (!(file instanceof TFile)) return;
	const link = plugin.app.fileManager.generateMarkdownLink(file, "");
	void navigator.clipboard?.writeText(link).then(() => new Notice(`Copied ${link}`));
}

/** A menu entry in red, for removing things. */
export function warningItem(menu: Menu, title: string, iconName: string, run: () => void) {
	menu.addItem((i) => {
		i.setTitle(title).setIcon(iconName).onClick(run);
		(i as unknown as { setWarning?: (w: boolean) => void }).setWarning?.(true);
	});
}

/**
 * A menu entry that opens a submenu. Where Obsidian has no submenus, its items are listed flat, each titled
 * "<flatPrefix>: <title>", so nothing is lost and nothing reads the same as something else.
 */
export function addSubmenu(menu: Menu, title: string, iconName: string, build: (m: Menu) => void, flatPrefix?: string, section?: string) {
	const native = typeof (MenuItem.prototype as unknown as { setSubmenu?: unknown }).setSubmenu === "function";
	if (native) {
		let sub: Menu | undefined;
		menu.addItem((i) => {
			i.setTitle(title).setIcon(iconName);
			if (section) i.setSection(section);
			sub = (i as unknown as { setSubmenu: () => Menu }).setSubmenu();
		});
		if (sub) build(sub);
		return;
	}
	const prefix = flatPrefix ?? title;
	const flat = Object.create(menu) as Menu;
	flat.addItem = (cb) =>
		menu.addItem((i) => {
			if (section) i.setSection(section);
			cb(i);
			// The title the caller set gets the heading put in front of it.
			const titleEl = (i as unknown as { titleEl?: HTMLElement }).titleEl;
			if (titleEl?.textContent) titleEl.textContent = `${prefix}: ${titleEl.textContent}`;
		});
	build(flat);
}

type Shortcut = [title: string, icon: string, run: () => void];

/**
 * What can be done with a note, in two kinds that were once mixed in one long list: the views it can be shown in
 * ("Show in"), and the questions it can answer ("Find out"). Every menu that offers them uses this, so the words
 * and icons are the same everywhere.
 */
export function entityShortcuts(plugin: UniverseViewPlugin, e: Entity): { views: Shortcut[]; asks: Shortcut[] } {
	const key = e.key;
	const views: Shortcut[] = [];
	if (e.start || e.end || e.type === "person" || e.type === "culture") views.push(["Timeline", "calendar-range", () => void plugin.openTimeline({ focus: key })]);
	if (e.type === "person") views.push(["Family tree", "git-fork", () => void plugin.openFamilyTree(key)]);
	if (e.type === "culture") views.push(["Lineage of groups", "git-branch", () => void plugin.openLineage(key)]);
	if (e.type === "culture") views.push(["Organisation chart", "network", () => void plugin.openOrgChart(key)]);
	if (e.type === "place" || e.type === "map" || e.places.length || e.birthPlace) views.push(["Map", "map", () => void plugin.openMap(key)]);
	views.push(["Connections", "waypoints", () => void plugin.openNetwork(key)]);
	views.push(["Dashboard", "panels-top-left", () => void plugin.openDashboard(key)]);
	const asks: Shortcut[] = [];
	if (e.type === "person") asks.push([`How is ${e.name.split(" ")[0]} related to…`, "git-compare", () => plugin.openKinship(key)]);
	if (e.type === "person" || e.type === "culture") asks.push(["Line of succession", "crown", () => plugin.openSuccession(key)]);
	if (e.type === "event") asks.push(["Why did this happen?", "git-pull-request-arrow", () => plugin.openCauses(key)]);
	return { views, asks };
}

/** The two submenus of {@link entityShortcuts}, added to a menu. */
export function addShortcutMenus(menu: Menu, plugin: UniverseViewPlugin, e: Entity, section?: string) {
	const { views, asks } = entityShortcuts(plugin, e);
	if (views.length) addSubmenu(menu, "Show in", "eye", (m) => views.forEach(([t, ic, run]) => m.addItem((i) => i.setTitle(t).setIcon(ic).onClick(run))), "Show in", section);
	if (asks.length) addSubmenu(menu, "Find out", "telescope", (m) => asks.forEach(([t, ic, run]) => m.addItem((i) => i.setTitle(t).setIcon(ic).onClick(run))), "Find out", section);
}

/**
 * The right-click menu for a note anywhere in UniverseView, in the same order everywhere: its name; the three ways
 * to open it (Inspect, Open note, Open beside); what this view does with it; two submenus, Show in (the other views)
 * and Find out (questions it answers); this view's tools; and, set apart at the bottom, anything that removes.
 */
export function showEntityMenu(plugin: UniverseViewPlugin, key: string, evt: MouseEvent, opts: EntityMenuOptions = {}) {
	const e = plugin.index.get(key);
	const menu = new Menu();
	if (e) {
		menu.addItem((i) => {
			i.setTitle(`${e.name}${e.category ? ` · ${kindLabel(e.category)}` : ""}`).setIcon(TYPE_ICONS[e.type] ?? "file").setDisabled(true);
			(i as unknown as { setIsLabel?: (v: boolean) => void }).setIsLabel?.(true);
		});
		// Three ways to open it, three icons: the side panel, the note itself, the note beside this view.
		menu.addItem((i) => i.setTitle("Inspect").setIcon("panel-right").onClick(() => void plugin.inspect(key)));
		menu.addItem((i) => i.setTitle("Open note").setIcon("file-text").onClick(() => openEntity(plugin, key)));
		menu.addItem((i) =>
			i.setTitle("Open beside").setIcon("columns-2").onClick(() => {
				const file = plugin.app.vault.getAbstractFileByPath(key);
				if (file instanceof TFile) void plugin.app.workspace.getLeaf("split").openFile(file);
			}),
		);
		menu.addItem((i) => i.setTitle("Copy link").setIcon("link").onClick(() => copyLink(plugin, key)));
		if (opts.top) {
			menu.addSeparator();
			opts.top(menu);
		}
		menu.addSeparator();
		addShortcutMenus(menu, plugin, e);
	} else {
		const name = plugin.index.ghostName(key) ?? (key.startsWith("?") ? key.slice(1) : key);
		menu.addItem((i) =>
			i.setTitle(`Create note "${name}"`).setIcon("file-plus").onClick(() => plugin.createEntityPrompt({ name })),
		);
	}
	if (opts.extra) {
		menu.addSeparator();
		opts.extra(menu);
	}
	if (opts.danger) {
		menu.addSeparator();
		opts.danger(menu);
	}
	menu.showAtMouseEvent(evt);
}
export function iconButton(parent: HTMLElement, iconName: string, label: string, onClick: (evt: MouseEvent) => void, cls = ""): HTMLElement {
	const b = el("div", { cls: `clickable-icon universeview-icon-btn ${cls}`.trim(), title: label }, parent);
	b.setAttribute("aria-label", label);
	icon(b, iconName);
	b.addEventListener("click", (evt) => {
		evt.preventDefault();
		onClick(evt);
	});
	return b;
}

export function dropdown(parent: HTMLElement, options: [string, string][], value: string, onChange: (v: string) => void, label?: string): HTMLSelectElement {
	const s = el("select", { cls: "dropdown universeview-select" }, parent);
	if (label) s.setAttribute("aria-label", label);
	for (const [v, text] of options) {
		const o = el("option", { text }, s);
		o.value = v;
	}
	s.value = value;
	s.addEventListener("change", () => onChange(s.value));
	return s;
}

/** Marks an on/off button as on or off: filled when on, for sight and for screen readers. */
export function setPressed(b: HTMLElement, on: boolean) {
	b.toggleClass("is-active", on);
	b.setAttribute("aria-pressed", String(on));
}

export function toggleChip(parent: HTMLElement, label: string, iconName: string, value: boolean, onChange: (v: boolean) => void): HTMLElement {
	const chip = el("button", { cls: "universeview-chip is-toggle", title: label }, parent);
	const ic = el("span", { cls: "universeview-chip-icon" }, chip);
	icon(ic, iconName);
	el("span", { text: label }, chip);
	// A check mark that slides in when the chip is on.
	const check = el("span", { cls: "universeview-chip-check" }, chip);
	icon(check, "check");
	const sync = (v: boolean) => {
		setPressed(chip, v);
		chip.title = `${label}: ${v ? "on" : "off"}`;
	};
	sync(value);
	chip.addEventListener("click", () => {
		value = !value;
		sync(value);
		onChange(value);
	});
	return chip;
}

/** Reads a numeric CSS variable (set via Style Settings) with a fallback. */
export function cssNumber(elm: Element, name: string, fallback: number): number {
	const v = parseFloat(getComputedStyle(elm).getPropertyValue(name));
	return Number.isFinite(v) && v > 0 ? v : fallback;
}

export function emptyState(parent: HTMLElement, iconName: string, title: string, body: string, action?: { label: string; onClick: () => void }) {
	const box = el("div", { cls: "universeview-empty" }, parent);
	const ic = el("div", { cls: "universeview-empty-icon" }, box);
	icon(ic, iconName);
	el("div", { cls: "universeview-empty-title", text: title }, box);
	el("div", { cls: "universeview-empty-body", text: body }, box);
	if (action) {
		const b = el("button", { cls: "mod-cta", text: action.label }, box);
		b.addEventListener("click", action.onClick);
	}
	return box;
}

export function resourceUrl(plugin: UniverseViewPlugin, pathOrUrl: string | undefined): string | undefined {
	if (!pathOrUrl) return undefined;
	if (/^https?:\/\//.test(pathOrUrl)) return pathOrUrl;
	const f = plugin.app.vault.getAbstractFileByPath(pathOrUrl);
	return f instanceof TFile ? plugin.app.vault.getResourcePath(f) : undefined;
}
