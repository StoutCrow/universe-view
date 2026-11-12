import { pluginEnabled } from "../internals";
import { buildLabel } from "../version";
import { App, Component, Notice, PluginSettingTab, Setting, debounce, type SettingDefinition, type SettingDefinitionGroup, type SettingDefinitionItem, type SettingDefinitionPage } from "obsidian";
import type ChroniclePlugin from "../main";
import { ENTITY_TYPES } from "../types";
import type { CalendarDef } from "../types";
import { DEFAULT_FIELD_ALIASES, DEFAULT_SETTINGS, parseMapCategories, parseMappingLines } from "../settings";
import { CustomCalendar } from "../dates/calendars";
import { formatDay } from "../dates/parser";
import { TYPE_LABELS, el, glyph, helpTip, icon, tuckDescriptions } from "../render/common";
import { GROUP_KINDS } from "../render/houses";
import { WORLD_SETTINGS, type WorldSetting } from "../index/worldsetting";
import { PLACE_GROUPS, groupOfKind, normaliseKind } from "../index/placekinds";
import { chooseWorldSetting } from "./worldsettingui";
import { renderThemeCards } from "./themecards";
import { previewButtons, previewEdges, previewFonts, previewHeadings, previewIcons, previewTabs, stylePicker } from "./stylepicker";
import { TourModal } from "./Tour";
import { DEFAULT_FILE_STRENGTH, DEFAULT_GROUP_ICONS, DEFAULT_TYPE_ICONS, applyIconSettings, fileStrengthNames } from "./icons";
import { BUTTON_STYLES, EDGE_STYLES, FONT_STYLES, HEADING_STYLES, ICON_STYLES, MOTIONS, looksOf, TAB_STYLES, THEMES, TACTILE_PARTS, TACTILE_PRESETS, applyAppearance } from "../appearance";

/** The settings a copied look carries. */
const LOOK_KEYS = ["theme", "colors", "fontUi", "fontDisplay", "fontMap", "themeStyles", "buttonStyle", "tabStyle", "edgeStyle", "fontStyle", "iconStyle", "headingStyle", "sketchRandom", "surfaceStyle", "tactileOff", "tactileDepth", "tactileStrength", "motion", "density", "radius"] as const;
import { BUILT_IN_PRESETS, applyLook, currentLook, matchingPreset } from "./mappresets";
import { builtInChangelog, renderHistory } from "./WhatsNew";
import { REL_KINDS, presetKinds, relLabel } from "../index/relkinds";
import { CalendarEditorModal } from "./CalendarEditor";
import { TidyModal } from "./tidy";
import { rowEditor, type Field, type RowEditorOptions } from "./rows";
import { DEFAULT_TIER_NAMES, TIER_NAME_PRESETS, pluralOf, tierName, tierWords, type TierName } from "../index/realms";
import type { TierStyle } from "./territorystyle";
import { tierStyleEditor } from "./tierstyleeditor";
import { TagStandardModal } from "./tagstandard";
import { NormaliseTagsModal } from "./NormaliseTags";
import { CALENDAR_PRESETS } from "../dates/calendar-text";
import { ConfirmPrompt } from "./TextPrompt";

/** The color a CSS variable currently resolves to, for the color pickers. */
function resolveColor(key: string): string {
	const name = key === "accent" ? "--chronicle-accent" : `--chronicle-${key}-color`;
	const probe = document.body.createDiv();
	probe.style.color = `var(${name})`;
	const rgb = getComputedStyle(probe).color;
	probe.remove();
	const m = rgb.match(/\d+(\.\d+)?/g);
	if (!m || m.length < 3) return "#888888";
	return "#" + m.slice(0, 3).map((n) => Math.round(+n).toString(16).padStart(2, "0")).join("");
}

/** The settings' pages, each holding the sections whose headings start as named here (anything else goes on the first). */
const PAGES: { id: string; label: string; heads: string[] }[] = [
	{ id: "appearance", label: "Theme & colours", heads: ["World setting", "Appearance", "Fonts"] },
	{ id: "surface", label: "Surface & motion", heads: ["Surface", "Tactile style"] },
	{ id: "views", label: "Views", heads: ["Views"] },
	{ id: "inspector", label: "Inspector & icons", heads: ["Inspector", "Icons", "Hover cards"] },
	{ id: "notes", label: "Notes", heads: ["Recognising notes", "New notes", "Folder notes"] },
	{ id: "families", label: "Families", heads: ["Writing and families", "Relationships"] },
	{ id: "time", label: "Time & calendars", heads: ["Timeline", "Calendars"] },
	{ id: "maps", label: "Maps", heads: ["Maps", "Map look"] },
	{ id: "realms", label: "Realms & tiers", heads: ["Realms and tiers"] },
	{ id: "tools", label: "Map tools", heads: ["Drawing and snapping", "Fill", "Shaping borders"] },
	{ id: "about", label: "About", heads: ["About"] },
];

/** The settings in the top tabs and, inside the larger ones, sub-tabs: shared by the settings window and the dashboard. */
export const SETTINGS_GROUPS: { id: string; label: string; icon: string; pages: string[] }[] = [
	{ id: "look", label: "Look & cards", icon: "palette", pages: ["appearance", "surface", "views", "inspector"] },
	{ id: "notes", label: "Notes & families", icon: "file-text", pages: ["notes", "families"] },
	{ id: "time", label: "Time & calendars", icon: "calendar-days", pages: ["time"] },
	{ id: "maps", label: "Maps & realms", icon: "map", pages: ["maps", "realms", "tools"] },
	{ id: "about", label: "About", icon: "info", pages: ["about"] },
];

export const pageLabel = (id: string) => PAGES.find((p) => p.id === id)?.label ?? id;

const PAGE_DESC: Record<string, string> = {
	appearance: "World setting, theme cards, colours, fonts",
	surface: "Flat or tactile, its parts and strength, motion, density, corners",
	views: "Timeline and family tree sizes, tints",
	inspector: "The inspector, icons, hover cards and tips",
	notes: "How notes are recognised, created and filed",
	families: "How people and relationships are written",
	time: "Timeline and calendars",
	maps: "Maps and how they look",
	realms: "Realm tiers and territory styles",
	tools: "Drawing, snapping, fill and border tools",
	about: "Version and what's new",
};

/** What a page's entry shows beside its name, so the current choice is visible without opening it. */
const PAGE_VALUES: Record<string, (p: ChroniclePlugin) => string> = {
	appearance: (p) => THEMES.find((t) => t.id === p.settings.theme)?.name ?? "",
	surface: (p) => (p.settings.surfaceStyle === "tactile" ? "Tactile" : "Flat"),
	about: (p) => buildLabel(p.manifest.version).short,
};

/** A built row (or block), the blocks that go with it, and whether it has been shown yet. */
interface Entry {
	el: HTMLElement;
	extras: HTMLElement[];
	used?: boolean;
}

interface Section {
	heading: string;
	group: SettingDefinitionGroup;
}

export class ChronicleSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: ChroniclePlugin) {
		super(app, plugin);
	}

	private async save(reindex = true) {
		await this.plugin.saveSettings();
		if (reindex) this.plugin.index.requestRebuild();
	}

	/** The page opened from a view's settings button, shown first until the settings close. */
	private pinned?: string;

	/** Owns the rendered version history while the settings are open. */
	private history = new Component();

	/** The rows built for the current definitions, each shown once (see show()). */
	private entries: Entry[] = [];

	/**
	 * Obsidian's declarative settings: one page per topic, a group per section, an item per row (so
	 * Obsidian's settings search finds every setting). The rows themselves are built as before and
	 * moved into the rows Obsidian makes for them.
	 */
	getSettingDefinitions(): SettingDefinitionItem[] {
		if (this.plugin.settingsTabRequest) {
			this.pinned = this.plugin.settingsTabRequest;
			this.plugin.settingsTabRequest = undefined;
		}
		let built: { entries: Entry[]; sections: Section[] };
		try {
			built = this.collect();
		} catch (err) {
			console.error("UniverseView: couldn't build the settings", err);
			return [];
		}
		this.entries = built.entries;
		const pages = PAGES.map((p) => ({ ...p, groups: [] as SettingDefinitionGroup[] }));
		for (const sec of built.sections) (pages.find((p) => p.heads.some((h) => sec.heading.startsWith(h))) ?? pages[0]).groups.push(sec.group);
		const pinned = pages.find((p) => p.id === this.pinned);
		return [
			...(pinned?.groups ?? []),
			...SETTINGS_GROUPS.map((g): SettingDefinitionPage => {
				const sub = g.pages.map((id) => pages.find((p) => p.id === id)).filter((p): p is (typeof pages)[number] => !!p && p !== pinned).map((p): SettingDefinitionPage => ({ type: "page", name: p.label, desc: PAGE_DESC[p.id] ?? p.heads.join(", "), displayValue: PAGE_VALUES[p.id] ? () => PAGE_VALUES[p.id](this.plugin) : undefined, items: p.groups }));
				if (!sub.length) return { type: "page", name: g.label, items: [] };
				return sub.length === 1 ? { ...sub[0], name: g.label } : { type: "page", name: g.label, desc: sub.map((x) => x.name).join(", "), items: sub };
			}).filter((p) => p.items?.length),
		];
	}

	hide() {
		this.pinned = undefined;
		this.history.unload();
		super.hide();
	}

	/** Builds every row into a box off the page and sorts them into sections by heading. */
	private collect(): { entries: Entry[]; sections: Section[] } {
		const box = createDiv({ cls: "chronicle-settings" });
		this.build(box);
		const entries: Entry[] = [];
		const sections: Section[] = [];
		let items: SettingDefinition[] | undefined;
		let last: Entry | undefined;
		// A row's name or description, without its help mark.
		const text = (e: Element | null | undefined) => {
			if (!e) return "";
			const copy = e.cloneNode(true) as HTMLElement;
			copy.querySelectorAll(".chronicle-help").forEach((x) => x.remove());
			return (copy.textContent ?? "").trim();
		};
		const section = (heading: string, help?: string) => {
			items = [];
			last = undefined;
			sections.push({
				heading,
				group: { type: "group", heading: heading || undefined, cls: "chronicle-settings", items, extraButtons: help ? [(b) => b.setIcon("info").setTooltip(help)] : undefined, visible: heading === "Tactile style" ? () => this.plugin.settings.surfaceStyle === "tactile" : undefined },
			});
		};
		for (const child of Array.from(box.children) as HTMLElement[]) {
			if (child.hasClass("setting-item-heading")) {
				section(text(child.querySelector(".setting-item-name")), child.querySelector<HTMLElement>(".chronicle-help")?.dataset.help);
				continue;
			}
			if (!items) section("");
			// A row, or a block with a row of its own (a list editor); anything else belongs to the row above.
			const row = child.hasClass("setting-item") ? child : child.querySelector<HTMLElement>(".setting-item");
			if (!row && last) {
				last.extras.push(child);
				continue;
			}
			const i = entries.length;
			last = { el: child, extras: [] };
			entries.push(last);
			items!.push({
				name: text(row?.querySelector(".setting-item-name")),
				desc: text(row?.querySelector(".setting-item-description")) || undefined,
				searchable: !!row,
				render: (setting) => this.show(i, setting),
			});
		}
		return { entries, sections };
	}

	/** Moves a built row into the row Obsidian made for it. */
	private show(i: number, setting: Setting) {
		// Every built row can be shown once: showing the page again builds them afresh.
		if (!this.entries[i] || this.entries[i].used) this.entries = this.collect().entries;
		const e = this.entries[i];
		if (!e) return;
		e.used = true;
		const row = setting.settingEl;
		row.empty();
		if (e.el.hasClass("setting-item")) {
			row.addClass(...Array.from(e.el.classList));
			row.append(...Array.from(e.el.childNodes));
		} else {
			row.addClass("uv-setting-block");
			row.append(e.el);
		}
		if (e.extras.length) {
			row.addClass("uv-setting-with-extra");
			row.append(...e.extras);
		}
		// Long explanations wait behind a "?" (and the name) instead of filling the page.
		tuckDescriptions(row);
	}

	/** Map tools: how drawing, snapping, Fill and the border tools behave (each tool's banner changes these too). */
	private mapTools(containerEl: HTMLElement) {
		const s = this.plugin.settings;
		const toggle = (name: string, desc: string, get: () => boolean, put: (v: boolean) => void) =>
			new Setting(containerEl).setName(name).setDesc(desc).addToggle((t) => t.setValue(get()).onChange(async (v) => {
				put(v);
				await this.save(false);
			}));
		const drawHead = new Setting(containerEl).setName("Drawing and snapping").setHeading();
		helpTip(drawHead.nameEl, "How Paint, New area, Expand, Reshape and Brush behave. The switches on each tool's banner change these too, and are remembered.");
		toggle("Snap to coasts and rivers", "On image maps, corners snap onto the coast, lake shores and rivers in the picture (hold Alt to place freely).", () => s.snapWater !== false, (v) => (s.snapWater = v));
		toggle("Follow borders and coasts", "Between two snapped corners the line follows the neighbour's border or the coast, all the way round inlets, instead of cutting straight across.", () => s.followEdges !== false, (v) => (s.followEdges = v));
		toggle("Keep off other lands", "Expanding, brushing or filling, new ground stops at other territories' borders instead of covering them.", () => s.keepOffOthers !== false, (v) => (s.keepOffOthers = v));
		new Setting(containerEl)
			.setName("Brush size")
			.setDesc("How wide the territory brush is on screen (pixels). [ and ] change it while brushing.")
			.addSlider((sl) => sl.setLimits(4, 120, 2).setValue(s.brushSize ?? 22).onChange(async (v) => {
				s.brushSize = v;
				await this.save(false);
			}));

		const fillHead = new Setting(containerEl).setName("Fill").setHeading();
		helpTip(fillHead.nameEl, "The Fill tool's starting choices. Changing them on the Fill banner changes them here too.");
		new Setting(containerEl)
			.setName("Fill by")
			.setDesc("Land / sea fills everything joined to the click, whatever is drawn on it, up to the coast, rivers and other lands (like a paint bucket). Same colour fills only the clicked colour.")
			.addDropdown((d) => d.addOptions({ ground: "Land / sea", colour: "Same colour" }).setValue(s.fillBy ?? "ground").onChange(async (v) => {
				s.fillBy = v as "ground" | "colour";
				await this.save(false);
			}));
		toggle("Cross rivers", "Filling land carries on over rivers to the land beyond, stopping only at the sea, lakes and other lands.", () => !!s.fillCrossRivers, (v) => (s.fillCrossRivers = v));
		new Setting(containerEl)
			.setName("Close gaps")
			.setDesc("Stops a fill leaking through a faint stretch of river, a dotted border or a hairline between two lands.")
			.addDropdown((d) => d.addOptions({ "0": "No gap closing", "1": "Tiny gaps", "2": "Small gaps", "4": "Wide gaps" }).setValue(String(s.fillGaps ?? 2)).onChange(async (v) => {
				s.fillGaps = Number(v);
				await this.save(false);
			}));
		new Setting(containerEl)
			.setName("Colour tolerance")
			.setDesc("Filling by colour: how different a colour can be and still count as the same area.")
			.addSlider((sl) => sl.setLimits(2, 60, 1).setValue(s.fillTolerance ?? 14).onChange(async (v) => {
				s.fillTolerance = v;
				await this.save(false);
			}));

		const shapeHead = new Setting(containerEl).setName("Shaping borders").setHeading();
		helpTip(shapeHead.nameEl, "Simplify takes corners away for good; Roughen only changes how borders look (Settings → Maps & realms → Map look).");
		new Setting(containerEl)
			.setName("Simplify strength")
			.setDesc("Simplify's starting strength: how far off the line, on screen, a corner may sit and still be taken away. Real detail such as a jagged coast stays.")
			.addSlider((sl) => sl.setLimits(1, 15, 1).setValue(s.simplifyPx ?? 3).onChange(async (v) => {
				s.simplifyPx = v;
				await this.save(false);
			}));
	}

	/** Set by the dashboard while it shows a settings page, so changes that add or remove rows redraw it. */
	hubRedraw?: () => void;

	update() {
		super.update();
		this.hubRedraw?.();
	}

	/** One page of settings, drawn straight into the dashboard. */
	renderPage(id: string, host: HTMLElement) {
		const box = el("div", { cls: "chronicle-settings" }, host);
		this.build(box);
		let page = PAGES[0].id;
		let hidden = false;
		for (const child of Array.from(box.children)) {
			if (child.hasClass("setting-item-heading")) {
				const name = child.querySelector(".setting-item-name")?.textContent ?? "";
				page = (PAGES.find((p) => p.heads.some((h) => name.startsWith(h))) ?? PAGES[0]).id;
				// The tactile section only shows while Tactile is on.
				hidden = name === "Tactile style" && this.plugin.settings.surfaceStyle !== "tactile";
			}
			if (page !== id || hidden) child.remove();
		}
	}

	/** Every row, in order, under its section headings. */
	private build(containerEl: HTMLElement) {
		const s = this.plugin.settings;

		// ---- World setting -------------------------------------------------------------------
		const worldHead = new Setting(containerEl).setName("World setting").setHeading();
		helpTip(worldHead.nameEl, "Only words and defaults change: what tiers, families and ranks are called, which kinds of place are offered, and the map look. Every property (`liege:`, `house:`, `kind: castle`) reads the same in all three, so you can switch at any time. Tier names and a map look of your own are kept.");
		new Setting(containerEl)
			.setName("Setting")
			.setDesc(WORLD_SETTINGS.find(([id]) => id === (s.worldSetting ?? "medieval"))?.[2] ?? "")
			.addDropdown((d) => {
				for (const [id, label] of WORLD_SETTINGS) d.addOption(id, label);
				d.setValue(s.worldSetting ?? "medieval").onChange(async (v) => {
					await chooseWorldSetting(this.plugin, v as WorldSetting);
					this.update();
				});
			});

		this.appearance(containerEl);
		this.mapTools(containerEl);

		// ---- Recognising notes ---------------------------------------------------------------
		new Setting(containerEl).setName("Recognising notes").setHeading();
		el("p", {
			cls: "setting-item-description",
			text: "UniverseView reads a note's `type` property (event, person, culture, place, map, plus synonyms like character, faction, city). Notes without one can be recognised by tag or folder.",
		}, containerEl);
		new Setting(containerEl)
			.setName("Use tags as types")
			.setDesc("Treat tags as types: the tag scheme's (#Character_Person, #Place_County) and older ones (#person, #character, #event, #faction, #place, #location, #map).")
			.addToggle((t) => t.setValue(s.tagTypes).onChange(async (v) => {
				s.tagTypes = v;
				await this.save();
			}));
		new Setting(containerEl)
			.setName("Tag prefix")
			.setDesc("Only match nested tags, e.g. “chronicle” matches #chronicle/person.")
			.addText((t) => t.setPlaceholder("None").setValue(s.tagPrefix).onChange(async (v) => {
				s.tagPrefix = v.trim();
				await this.save();
			}));
		const typeOptions = (): [string, string][] => ENTITY_TYPES.map((t) => [t, TYPE_LABELS[t]]);
		this.rows(containerEl, "Folders as types", "Every note in a folder is of a type, without a type property or tag.", [
			{ key: "folder", label: "Folder", kind: "text", list: "folders", width: "2fr", placeholder: "Characters" },
			{ key: "type", label: "Notes are", kind: "select", options: typeOptions },
		], parseMappingLines(s.folderTypes).map(([folder, type]) => ({ folder: folder.replace(/\/$/, ""), type })), async (rows) => {
			s.folderTypes = rows.filter((r) => r.folder).map((r) => `${r.folder} = ${r.type || "person"}`).join("\n");
			await this.save();
		}, { blank: () => ({ folder: "", type: "person" }), addLabel: "Add a folder", empty: "None: types come from properties and tags." });
		this.rows(containerEl, "Ignore folders", "Notes here are never read. Template folders (Templater's, core Templates', or any folder named “Templates”) are always skipped.", [
			{ key: "folder", label: "Folder", kind: "text", list: "folders", placeholder: "Archive" },
		], s.ignoreFolders.split(/[\n,]/).map((x) => x.trim()).filter(Boolean).map((folder) => ({ folder })), async (rows) => {
			s.ignoreFolders = rows.map((r) => String(r.folder ?? "").trim()).filter(Boolean).join("\n");
			await this.save();
		}, { blank: () => ({ folder: "" }), addLabel: "Add a folder", empty: "None." });
		new Setting(containerEl)
			.setName("Read Dataview inline fields")
			.setDesc("With Dataview installed, fields like `born:: 1210` in the note body count too.")
			.addToggle((t) => t.setValue(s.useDataview).onChange(async (v) => {
				s.useDataview = v;
				await this.save();
			}));
		const fieldOptions = (): [string, string][] => (Object.keys(DEFAULT_FIELD_ALIASES)).map((k) => [k, `${k.replace(/([A-Z])/g, " $1").toLowerCase()} (${DEFAULT_FIELD_ALIASES[k as keyof typeof DEFAULT_FIELD_ALIASES].slice(0, 2).join(", ")}…)`]);
		this.rows(containerEl, "Your own property names", "If your notes use other names (birthday instead of born, allegiance instead of cultures), add them here. They're read as well as the built-in ones.", [
			{ key: "field", label: "Field", kind: "select", options: fieldOptions, width: "1.4fr" },
			{ key: "names", label: "Your property names (comma-separated)", kind: "text", width: "2fr", placeholder: "birthday, date-of-birth" },
		], parseMappingLines(s.fieldAliases).map(([field, names]) => ({ field, names })), async (rows) => {
			s.fieldAliases = rows.filter((r) => r.field && String(r.names ?? "").trim()).map((r) => `${r.field} = ${r.names}`).join("\n");
			await this.save();
		}, { blank: () => ({ field: "born", names: "" }), addLabel: "Add property names", empty: "Only the built-in names." });

		// ---- New notes ----------------------------------------------------------------------
		new Setting(containerEl).setName("New notes").setHeading();
		new Setting(containerEl)
			.setName("Mark new notes with")
			.setDesc("Match how this vault already marks types, so other plugins and your own queries keep working.")
			.addDropdown((d) =>
				d.addOptions({ property: "A type property (type: person)", tag: "Tags (#Character_Person, #Place_County)", cr_type: "Charted Roots’ cr_type" })
					.setValue(s.typeStyle)
					.onChange(async (v) => {
						s.typeStyle = v as typeof s.typeStyle;
						await this.save(false);
						this.update();
					}),
			);
		if (s.typeStyle === "tag") {
			new Setting(containerEl)
				.setName("Tag scheme")
				.setDesc("One tag for what a note is (#Character_Person), one per thing it belongs to, one per fact. Older tags still work; this moves them over after a review.")
				.addButton((b) => b.setButtonText("Move tags…").onClick(() => new NormaliseTagsModal(this.plugin, true).open()));
			// The older tags, read from notes tagged before the scheme: one row, not five.
			const olderRow = new Setting(containerEl).setName("Older tags").setDesc("Read from notes tagged before the scheme (#Character, #Region); new notes don't get them.");
			olderRow.settingEl.addClass("uv-compact-fields");
			for (const type of ENTITY_TYPES) {
				const wrap = el("label", { cls: "uv-mini-field" }, olderRow.controlEl);
				el("span", { text: TYPE_LABELS[type] }, wrap);
				const input = el("input", { cls: "chronicle-tag-input", attr: { type: "text", placeholder: type } }, wrap);
				input.value = s.typeTags[type];
				input.addEventListener("change", () => void (async () => {
					if (!input.value.trim()) return;
					s.typeTags[type] = input.value.trim().replace(/^#/, "");
					await this.save(false);
				})());
			}
		}
		// Where new notes go, and the template each starts from: one small table.
		const where = new Setting(containerEl).setName("Folders and templates").setDesc("The folder each kind of note goes in, and an optional template note (Templater syntax runs if Templater is installed).");
		where.settingEl.addClass("uv-setting-stack");
		const grid = el("div", { cls: "uv-newnote-grid" }, where.settingEl);
		for (const h of ["", "Folder", "Template"]) el("span", { cls: "uv-newnote-head", text: h }, grid);
		for (const type of ENTITY_TYPES) {
			el("span", { cls: "uv-newnote-type", text: TYPE_LABELS[type] }, grid);
			const folder = el("input", { attr: { type: "text", placeholder: "Folder" } }, grid);
			folder.value = s.newNoteFolders[type] ?? "";
			folder.addEventListener("change", () => void (async () => {
				s.newNoteFolders[type] = folder.value.trim();
				await this.save(false);
			})());
			const tpl = el("input", { attr: { type: "text", placeholder: "Templates/Person.md" } }, grid);
			tpl.value = s.templates[type] ?? "";
			tpl.addEventListener("change", () => void (async () => {
				s.templates[type] = tpl.value.trim();
				await this.save(false);
			})());
		}		new Setting(containerEl)
			.setName("Sidebar button for every view")
			.setDesc("Off: only the UniverseView star. Takes effect after reloading Obsidian.")
			.addToggle((t) => t.setValue(s.ribbonViews).onChange(async (v) => {
				s.ribbonViews = v;
				await this.save(false);
			}));
		new Setting(containerEl)
			.setName("Open notes in a new tab")
			.setDesc("When clicking items in UniverseView views. Ctrl/Cmd-click always opens a new tab.")
			.addToggle((t) => t.setValue(s.openInNewTab).onChange(async (v) => {
				s.openInNewTab = v;
				await this.save(false);
			}));

		// ---- Folder notes -------------------------------------------------------------------
		const fnHead = new Setting(containerEl).setName("Folder notes").setHeading();
		helpTip(fnHead.nameEl, "A folder note is a folder's own note, kept inside it under the same name: California/California.md. Clicking the folder opens it; Alt-click just folds the folder; Ctrl/Cmd-click a folder without one to make one. Right-click a note for Turn into folder note, or a folder for Create, Detach or Delete folder note.");
		if (pluginEnabled(this.app, "folder-notes")) {
			new Setting(containerEl)
				.setName("The Folder notes plugin is on")
				.setDesc("UniverseView does everything it does here, so its explorer behaviour stays off while that plugin is on. Turn Folder notes off under Community plugins to use these instead; your folder notes stay as they are.")
				.settingEl.addClass("uv-setting-warn");
		}
		const repaint = async () => {
			await this.save(false);
			this.plugin.repaintFileIcons?.();
		};
		new Setting(containerEl)
			.setName("Folder notes in the file explorer")
			.setDesc("Folders with a note are underlined and open it when clicked, as do the folders in the path above a note.")
			.addToggle((t) => t.setValue(s.folderNotes !== false).onChange(async (v) => {
				s.folderNotes = v;
				await repaint();
			}));
		new Setting(containerEl)
			.setName("Hide folder notes in the list")
			.setDesc("The folder stands for its note, so the note itself isn't listed inside it.")
			.addToggle((t) => t.setValue(s.hideFolderNotes !== false).onChange(async (v) => {
				s.hideFolderNotes = v;
				await repaint();
			}));
		new Setting(containerEl)
			.setName("Open on click")
			.setDesc("Off: folders only fold and unfold; open their notes from the right-click menu.")
			.addToggle((t) => t.setValue(s.folderNoteClick !== false).onChange(async (v) => {
				s.folderNoteClick = v;
				await repaint();
			}))
			.addDropdown((d) => d.addOptions({ same: "In the current tab", tab: "In a new tab" }).setValue(s.folderNoteNewTab ? "tab" : "same").onChange(async (v) => {
				s.folderNoteNewTab = v === "tab";
				await repaint();
			}));
		new Setting(containerEl)
			.setName("Keep names in step")
			.setDesc("Renaming a folder renames its note, and renaming the note renames its folder.")
			.addToggle((t) => t.setValue(s.folderNoteSync !== false).onChange(async (v) => {
				s.folderNoteSync = v;
				await repaint();
			}));
		new Setting(containerEl)
			.setName("Template for new folder notes")
			.setDesc("Used by Create folder note. Empty: a blank note.")
			.addText((t) => t.setPlaceholder("Templates/Folder.md").setValue(s.folderNoteTemplate ?? "").onChange(async (v) => {
				s.folderNoteTemplate = v.trim() || undefined;
				await this.save(false);
			}));
		new Setting(containerEl)
			.setName("Where new notes go")
			.setDesc("Inside what they belong to: a person in their house's folder (James II in House Whitmore), a place in the place it lies in, a title under its realm, an event where it happened. When that note has no folder of its own, beside it, or in a new one made for it.")
			.addDropdown((d) => d.addOptions({ parent: "Inside its folder note, else beside it", convert: "Inside it, making it a folder note", off: "In the type's folder" }).setValue(s.placeNewNotes ?? "parent").onChange(async (v) => {
				s.placeNewNotes = v as "parent" | "convert" | "off";
				await this.save(false);
			}));
		const toggle = (name: string, desc: string, get: () => boolean, set: (v: boolean) => void) =>
			new Setting(containerEl).setName(name).setDesc(desc).addToggle((t) => t.setValue(get()).onChange(async (v) => {
				set(v);
				await repaint();
			}));
		toggle("Folder overview in new folder notes", "Create folder note adds a live list of what's inside: titles by tier, houses, people living and dead, places and events. Add one to any note with the Insert folder overview command.", () => s.folderNoteOverview !== false, (v) => (s.folderNoteOverview = v));
		toggle("Hover cards in the file explorer", "Rest the pointer on a UniverseView note, or a folder with one, for its card.", () => s.explorerHover !== false, (v) => (s.explorerHover = v));
		toggle("Map outline in hover cards", "Places and realms show a small outline of their borders inside the realm they lie in.", () => s.hoverMiniMap !== false, (v) => (s.hoverMiniMap = v));
		toggle("Realm colours in the note's path", "The folders above a note (a continent › a kingdom › a duchy › a county) in their colours, as in the file explorer.", () => s.pathColors !== false, (v) => (s.pathColors = v));
		toggle("Order the file explorer by tier", "Inside each folder: plain folders, then titles from great to small, houses, groups, places, people, events, then other notes. Off: Obsidian's own order.", () => s.explorerTierSort === true, (v) => (s.explorerTierSort = v));
		toggle("Offer to update tags on rename", "Renaming House Whitmore offers to change #House_Whitmore (and #Nation_…, #Family_…) in the notes that use it.", () => s.renameTags !== false, (v) => (s.renameTags = v));
		new Setting(containerEl)
			.setName("Move notes into their folder notes")
			.setDesc("Finds notes outside the folder note they belong in (a Whitmore in People/ rather than House Whitmore/) and lists the moves to tick before anything moves.")
			.addButton((b) => b.setButtonText("Review moves…").onClick(() => new TidyModal(this.plugin).open()));
		new Setting(containerEl)
			.setName("When the map moves something")
			.setDesc("A pin dragged, or an area drawn, inside another land: link the note to that land (under: or located-in:) and move its file, or its whole folder, inside that land's folder note.")
			.addDropdown((d) => d.addOptions({ ask: "Ask each time", always: "Move it there", off: "Leave it where it is" }).setValue(s.mapMovesFiles ?? "ask").onChange(async (v) => {
				s.mapMovesFiles = v as "ask" | "always" | "off";
				await this.save(false);
			}));
		new Setting(containerEl)
			.setName("Living and Dead folders")
			.setDesc("When a house's folder has Living and Dead (or Alive and Deceased) folders, new people go in the one that fits, and someone given a death date is offered a move to Dead.")
			.addToggle((t) => t.setValue(s.statusFolders !== false).onChange(async (v) => {
				s.statusFolders = v;
				await this.save(false);
			}));

		// ---- Timeline ---------------------------------------------------------------------
		new Setting(containerEl).setName("Timeline").setHeading();
		new Setting(containerEl)
			.setName("Show births and deaths by default")
			.addToggle((t) => t.setValue(s.showLifeEvents).onChange(async (v) => {
				s.showLifeEvents = v;
				await this.save(false);
			}));

		// ---- Writing and families -----------------------------------------------------------
		new Setting(containerEl).setName("Writing and families").setHeading();
		new Setting(containerEl)
			.setName("Suggest family links while writing")
			.setDesc("When a person's text mentions family (“son of [[X]]”) that isn't in their properties, a button in the status bar offers to add it. Nothing changes without a click.")
			.addToggle((t) => t.setValue(s.liveSuggestions).onChange(async (v) => {
				s.liveSuggestions = v;
				await this.save(false);
			}));
		new Setting(containerEl)
			.setName("Succession")
			.setDesc("Who inherits first, for lines of succession. A group can set its own with `succession: male-preference` (or `absolute`, `agnatic`).")
			.addDropdown((d) => d
				.addOptions({ absolute: "Eldest child first", "male-preference": "Sons before daughters", agnatic: "Sons only, through sons" })
				.setValue(s.successionRule)
				.onChange(async (v) => {
					s.successionRule = v as typeof s.successionRule;
					await this.save(false);
				}));

		// ---- Relationships ------------------------------------------------------------------
		new Setting(containerEl).setName("Relationships").setHeading();
		const kinds = el("details", { cls: "chronicle-relkinds" }, containerEl);
		el("summary", { text: "The relationship properties UniverseView understands" }, kinds);
		el("p", { cls: "setting-item-description", text: "Write a list of links under any of these in a person's or group's properties, e.g. `allies: [[House Vane]]`. Add dates with `- { name: [[House Vane]], from: SE 12, to: SE 40 }`. Writing one side is enough: the other note shows the inverse (vassals ↔ liege, mentors ↔ students). Other spellings in brackets work too; any other property name becomes a relationship of that name." }, kinds);
		const table = el("table", { cls: "chronicle-relkinds-table" }, kinds);
		const head = el("tr", {}, el("thead", {}, table));
		for (const h of ["Property", "For", "Meaning", "Seen from the other side", "Also accepted"]) el("th", { text: h }, head);
		const body = el("tbody", {}, table);
		for (const k of REL_KINDS.filter((x) => x.on.length)) {
			const tr = el("tr", {}, body);
			el("td", {}, tr).createEl("code", { text: k.key });
			el("td", { text: k.on.map((o) => (o === "person" ? "people" : "groups")).join(", ") }, tr);
			el("td", { text: k.desc }, tr);
			el("td", { text: relLabel(k.key, true) }, tr);
			el("td", { cls: "chronicle-dash-muted", text: k.aliases.join(", ") }, tr);
		}
		new Setting(containerEl)
			.setName("Ready-to-fill relationships on new notes")
			.setDesc("New people and groups start with these properties, empty, so they're easy to fill in. Notes from a template keep the template's own.")
			.addToggle((t) => t.setValue(s.presetRelations).onChange(async (v) => {
				s.presetRelations = v;
				await this.save(false);
			}));
		for (const type of ["person", "culture"] as const) {
			new Setting(containerEl)
				.setName(type === "person" ? "For people" : "For groups")
				.setDesc(`Comma-separated. Empty uses the defaults: ${presetKinds(type).join(", ")}.`)
				.addText((t) => t.setPlaceholder(presetKinds(type).join(", ")).setValue(s.relationPresets[type]).onChange(async (v) => {
					s.relationPresets = { ...s.relationPresets, [type]: v };
					await this.save(false);
				}));
		}

		// ---- Calendars --------------------------------------------------------------------
		new Setting(containerEl).setName("Calendars").setHeading();
		el("p", {
			cls: "setting-item-description",
			text: "Use the Gregorian calendar, or define your own for fictional worlds. A note uses its `calendar:` property, then the folder mapping below, then the default.",
		}, containerEl);
		new Setting(containerEl).setName("Default calendar").addDropdown((d) => {
			for (const c of this.plugin.calendars.all()) d.addOption(c.id, c.name);
			d.setValue(s.defaultCalendar).onChange(async (v) => {
				s.defaultCalendar = v;
				await this.save();
			});
		});
		this.rows(containerEl, "Calendar by folder", "Notes in a folder use its calendar (a note's own `calendar:` and a world note win).", [
			{ key: "folder", label: "Folder", kind: "text", list: "folders", width: "2fr", placeholder: "Vael" },
			{ key: "calendar", label: "Calendar", kind: "select", options: () => this.plugin.calendars.all().map((c) => [c.id, c.name] as [string, string]) },
		], parseMappingLines(s.folderCalendars).map(([folder, calendar]) => ({ folder: folder.replace(/\/$/, ""), calendar })), async (rows) => {
			s.folderCalendars = rows.filter((r) => r.folder).map((r) => `${r.folder} = ${r.calendar || "gregorian"}`).join("\n");
			await this.save();
		}, { blank: () => ({ folder: "", calendar: s.defaultCalendar }), addLabel: "Add a folder", empty: "None: notes use the default calendar." });
		new Setting(containerEl)
			.setName("Draw open spans to the current year")
			.setDesc("Groups still standing, people still alive and spans written “1292 C.E. -” run up to the current year below, fading out with a dashed end. Off: they end at their last known date.")
			.addToggle((t) => t.setValue(s.openEndsToToday).onChange(async (v) => {
				s.openEndsToToday = v;
				await this.save();
			}));
		for (const cal of this.plugin.calendars.all()) {
			const saved = s.currentDates[cal.id];
			new Setting(containerEl)
				.setName(`Current year: ${cal.name}`)
				.setDesc(cal.id === "gregorian" ? "Empty: today's real date. A world note's `today:` wins for its world." : "The date it is now in this calendar (also the calendar view's Today). A world note's `today:` wins for its world.")
				.addText((t) => {
					t.setPlaceholder(cal.id === "gregorian" ? "today" : "e.g. 1292 C.E.").setValue(typeof saved === "number" ? formatDay(saved, cal, "year") : "");
					t.inputEl.addEventListener("change", () => void (async () => {
						const v = t.getValue().trim();
						const d = v ? this.plugin.parseDate(v, cal.id) : null;
						const next = { ...s.currentDates };
						if (d) next[cal.id] = d.start;
						else delete next[cal.id];
						s.currentDates = next;
						t.inputEl.toggleClass("mod-warning", !!v && !d);
						await this.save();
					})());
				});
		}
		new Setting(containerEl)
			.setName("World settings")
			.setDesc("Each world (top-level folder) can have its own calendar, today's date, main map, travel speeds, succession and default relationships.")
			.addButton((b) => b.setButtonText("Edit a world…").onClick(() => this.plugin.pickWorld("Settings for which world?", (w) => this.plugin.editWorld(w ?? ""))));
		const calBox = el("div", { cls: "chronicle-calendars" }, containerEl);
		s.calendars.forEach((c, i) => this.calendarEditor(calBox, c, i));
		let preset = CALENDAR_PRESETS[0].id;
		new Setting(containerEl)
			.setName("Add a calendar")
			.setDesc("Start from a shape and rename the months and days to suit your world.")
			.addDropdown((d) => {
				for (const p of CALENDAR_PRESETS) d.addOption(p.id, p.name);
				d.setValue(preset).onChange((v) => (preset = v));
			})
			.addButton((b) =>
				b.setButtonText("Add calendar").setCta().onClick(async () => {
					const p = CALENDAR_PRESETS.find((x) => x.id === preset) ?? CALENDAR_PRESETS[0];
					s.calendars.push({ id: `calendar-${s.calendars.length + 1}`, name: "New calendar", ...p.make() });
					await this.save();
					this.update();
				}),
			);

		// ---- Maps -----------------------------------------------------------------------------
		new Setting(containerEl).setName("Maps").setHeading();
		new Setting(containerEl)
			.setName("Tile server")
			.setDesc("URL template for the real-world map. Image maps for fictional worlds are just notes with `type: map` and an `image`.")
			.addText((t) => t.setValue(s.tileUrl).onChange(async (v) => {
				s.tileUrl = v.trim() || DEFAULT_SETTINGS.tileUrl;
				await this.save(false);
			}))
			.addExtraButton((b) => b.setIcon("rotate-ccw").setTooltip("Reset").onClick(async () => {
				s.tileUrl = DEFAULT_SETTINGS.tileUrl;
				s.tileAttribution = DEFAULT_SETTINGS.tileAttribution;
				await this.save(false);
				this.update();
			}));
		new Setting(containerEl).setName("Tile attribution").addText((t) => t.setValue(s.tileAttribution).onChange(async (v) => {
			s.tileAttribution = v;
			await this.save(false);
		}));
		new Setting(containerEl)
			.setName("Default view")
			.setDesc("Latitude, longitude and zoom used when there are no places yet.")
			.addText((t) => t.setValue(`${s.defaultCenter[0]}, ${s.defaultCenter[1]}`).onChange(async (v) => {
				const [a, b] = v.split(/[,\s]+/).map(Number);
				if (Number.isFinite(a) && Number.isFinite(b)) {
					s.defaultCenter = [a, b];
					await this.save(false);
				}
			}))
			.addSlider((sl) => sl.setLimits(1, 18, 1).setValue(s.defaultZoom).onChange(async (v) => {
				s.defaultZoom = v;
				await this.save(false);
			}));

		new Setting(containerEl)
			.setName("Pin colors")
			.setDesc("What a pin's color means by default. Each map view can switch this in its toolbar, and its legend can hide groups.")
			.addDropdown((d) => d
				.addOptions({ realm: "The realm it's part of", liege: "The title it's directly under", house: `The ${GROUP_KINDS.house.label.toLowerCase()} holding it`, culture: "Its group (first one listed)", category: "Kind of place (city, fort…)", type: "One color" })
				.setValue(s.pinColorBy === "region" ? "realm" : s.pinColorBy)
				.onChange(async (v) => {
					s.pinColorBy = v as typeof s.pinColorBy;
					await this.save(false);
				}));
		new Setting(containerEl)
			.setName("Hide overlapping labels")
			.setDesc("When place names would collide, show the most important ones.")
			.addToggle((t) => t.setValue(s.declutterLabels).onChange(async (v) => {
				s.declutterLabels = v;
				await this.save(false);
			}));
		new Setting(containerEl)
			.setName("Fade small areas when zoomed out")
			.setDesc("Territories narrower than this on screen fade away as you zoom out, so the big realms stay readable; zoom in and they come back. 0 never fades. (Turn it off per map under Overlays.)")
			.addSlider((sl) => sl.setLimits(0, 160, 8).setValue(s.fadeAreaPx).onChange(async (v) => {
				s.fadeAreaPx = v;
				await this.save();
			}));
		const sizes = (): [string, string][] => [["", "Auto"], ["tiny", "Tiny"], ["small", "Small"], ["medium", "Medium"], ["large", "Large"], ["huge", "Huge"]];
		const layers = (): [string, string][] => [["", "Auto"], ["1", "1 · always"], ["2", "2"], ["3", "3"], ["4", "4"], ["5", "5 · zoomed in"]];
		// Kinds of place, one table per type of place (index/placekinds.ts): the type follows from the kind, so a
		// kind is listed under the type it belongs to; older words and your own kinds go in the last one.
		const kindGroups: [string, string, string][] = [...PLACE_GROUPS.filter(([g]) => g !== "territory"), ["other", "Older words and your own kinds", "Words from before 3.3 (capital, fortress…) and kinds you added. Capital and port are now traits; the rest still read as before."]];
		type KindRow = { kind: string; color: string; icon: string; size: string; layer: string };
		const kindRows = new Map<string, KindRow[]>();
		for (const [kind, c] of parseMapCategories(s.mapCategories)) {
			const g = groupOfKind(kind);
			const key = g && g !== "territory" && normaliseKind(kind).kind === kind ? g : "other";
			kindRows.set(key, [...(kindRows.get(key) ?? []), { kind, color: c.color ?? "#888888", icon: c.icon ?? "", size: c.size ?? "", layer: c.layer ? String(c.layer) : "" }]);
		}
		const writeKinds = async () => {
			s.mapCategories = kindGroups.flatMap(([g]) => kindRows.get(g) ?? []).filter((r) => r.kind.trim()).map((r) => `${r.kind.trim().toLowerCase()} = ${[r.color, r.icon, r.size, r.layer ? `layer ${r.layer}` : ""].filter(Boolean).join(", ")}`).join("\n");
			await this.save(false);
		};
		let lastKinds: HTMLElement = containerEl;
		for (const [g, label, about] of kindGroups) {
			lastKinds = this.rows(containerEl, `Kinds of place: ${label}`, `${about} Colour, icon, pin size and layer for each kind (a place's \`kind:\` or a tag like #Place_City). Icons are Lucide names or emoji; a note's own \`icon:\` wins. Auto takes size and layer from the kind's built-in; layer 1 always shows, higher layers appear as you zoom in.`, [
				{ key: "kind", label: "Kind", kind: "text", width: "1.2fr", placeholder: "city" },
				{ key: "color", label: "Colour", kind: "color", width: "64px" },
				{ key: "icon", label: "Icon", kind: "icon", width: "1.3fr", placeholder: "building-2" },
				{ key: "size", label: "Pin", kind: "select", options: sizes, width: "86px" },
				{ key: "layer", label: "Layer", kind: "select", options: layers, width: "104px" },
			], kindRows.get(g) ?? [], async (rows) => {
				kindRows.set(g, rows);
				await writeKinds();
			}, { blank: () => ({ kind: "", color: "#888888", icon: "", size: "", layer: "" }), addLabel: "Add a kind of place" });
		}
		new Setting(lastKinds)
			.setName("Traits")
			.setDesc("What is special about a place goes in tags, not in its kind: a role (#Place_Role_Capital, #Place_Role_Port, #Place_Role_Holy, #Place_Role_Market), a size (#Place_Size_Small) and a status (#Place_Status_Ruined, Abandoned, Lost, Destroyed). A place with a role wears that role's crown, anchor or other icon on the map. The Tag standard window sets them.");
		new Setting(lastKinds).addButton((b) => b.setButtonText("Reset to the built-in kinds").onClick(async () => {
			s.mapCategories = DEFAULT_SETTINGS.mapCategories;
			await this.save(false);
			this.update();
		}));
		// ---- How the map looks: names, pins, borders and fills ---------------------------------
		const lookHead = new Setting(containerEl).setName("Map look").setHeading();
		helpTip(lookHead.nameEl, "Applies to every map at once. Each tier's own border, line, fill, edge and texture are under Territory styles below; Fill strength here scales all of them together.");
		const restyle = async () => {
			await this.save(false);
			applyAppearance(s);
			this.plugin.restyleTerritories?.();
		};
		// Look presets: a whole look for maps and territories at once, built in or saved from your own.
		const presets = () => [...BUILT_IN_PRESETS, ...(s.mapPresets ?? [])];
		const now = matchingPreset(s, presets());
		let picked = now ?? presets()[0].id;
		const presetRow = new Setting(containerEl).setName("Look preset");
		const describe = () => {
			const p = presets().find((x) => x.id === picked);
			presetRow.setDesc(`${p?.desc ?? ""}${now ? "" : " (Your settings below differ from every preset; applying one replaces them.)"}`);
		};
		presetRow
			.addDropdown((d) => {
				for (const p of presets()) d.addOption(p.id, (s.mapPresets ?? []).includes(p) ? `${p.name} (yours)` : p.name);
				d.setValue(picked).onChange((v) => {
					picked = v;
					describe();
				});
			})
			.addButton((b) => b.setButtonText("Apply").setCta().onClick(async () => {
				const p = presets().find((x) => x.id === picked);
				if (!p) return;
				applyLook(s, p.look);
				await this.save(true);
				applyAppearance(s);
				this.plugin.restyleTerritories?.();
				new Notice(`Map look: ${p.name}`);
				this.update();
			}))
			.addExtraButton((b) => b.setIcon("trash-2").setTooltip("Delete this preset (your own only)").onClick(async () => {
				const mine = s.mapPresets ?? [];
				const i = mine.findIndex((x) => x.id === picked);
				if (i < 0) {
					new Notice("Built-in presets can't be deleted.");
					return;
				}
				mine.splice(i, 1);
				await this.save(false);
				this.update();
			}));
		describe();
		let newName = "";
		new Setting(containerEl)
			.setName("Save this look")
			.setDesc("Keep the current look (everything in Map look and Territory styles) as a preset of your own.")
			.addText((t) => t.setPlaceholder("Name").onChange((v) => (newName = v.trim())))
			.addButton((b) => b.setButtonText("Save").onClick(async () => {
				if (!newName) {
					new Notice("Give the look a name first.");
					return;
				}
				const mine = (s.mapPresets ??= []);
				const id = `mine-${newName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
				const preset = { id, name: newName, desc: "Your own look.", look: currentLook(s) };
				const at = mine.findIndex((x) => x.id === id);
				if (at >= 0) mine[at] = preset;
				else mine.push(preset);
				await this.save(false);
				new Notice(`Saved the look as “${newName}”`);
				this.update();
			}));
		new Setting(containerEl).setName("Name size").setDesc("Place and territory names, as a multiple of their usual size.").addSlider((sl) => sl.setLimits(0.5, 2, 0.05).setValue(s.mapLabelScale ?? 1).onChange(async (v) => {
			s.mapLabelScale = v;
			await restyle();
		}));
		new Setting(containerEl).setName("Lettering").setDesc("How territory names are written.").addDropdown((d) => d.addOptions({ engraved: "Engraved capitals (an old map)", plain: "Plain", italic: "Italic serif", calligraphic: "Calligraphic pen script" }).setValue(s.mapLabelStyle ?? "engraved").onChange(async (v) => {
			s.mapLabelStyle = v as "engraved" | "plain" | "italic" | "calligraphic";
			await restyle();
		})).addToggle((t) => t.setTooltip("A soft halo behind names, so they read over busy pictures").setValue(s.mapLabelHalo !== false).onChange(async (v) => {
			s.mapLabelHalo = v;
			await restyle();
		}));
		new Setting(containerEl).setName("Paper").setDesc("A sheet of aged paper over the map: grain, stains and darkened edges.").addDropdown((d) => d.addOptions({ none: "None", parchment: "Parchment", vellum: "Vellum (pale)", sea: "Sea chart (grey-green)" }).setValue(s.mapPaper ?? "none").onChange(async (v) => {
			s.mapPaper = v === "none" ? undefined : (v as "parchment" | "vellum" | "sea");
			await restyle();
		}));
		new Setting(containerEl).setName("Ruled frame").setDesc("A double ink rule round the map with flourished corners.").addToggle((t) => t.setValue(!!s.mapFrame).onChange(async (v) => {
			s.mapFrame = v;
			await restyle();
		}));
		new Setting(containerEl).setName("Compass rose").setDesc("A drawn compass in the corner of the map.").addToggle((t) => t.setValue(!!s.mapCompass).onChange(async (v) => {
			s.mapCompass = v;
			await restyle();
		}));
		new Setting(containerEl).setName("Pin size").setDesc("Every pin, as a multiple of its usual size (each place's own size still applies).").addSlider((sl) => sl.setLimits(0.5, 2, 0.05).setValue(s.mapPinScale ?? 1).onChange(async (v) => {
			s.mapPinScale = v;
			await restyle();
		}));
		new Setting(containerEl).setName("Fill strength").setDesc("How strongly every territory is filled with its colour, as a multiple of its tier's fill.").addSlider((sl) => sl.setLimits(0, 3, 0.05).setValue(s.territoryFillScale ?? 1).onChange(async (v) => {
			s.territoryFillScale = v;
			await restyle();
		}));
		new Setting(containerEl).setName("Border colour").setDesc("Each land's own colour, a darker shade of it (crisper on light maps), or dark ink like a printed map.").addDropdown((d) => d.addOptions({ own: "Its own colour", darker: "A darker shade", ink: "Ink" }).setValue(s.territoryBorder ?? "own").onChange(async (v) => {
			s.territoryBorder = v as "own" | "darker" | "ink";
			await restyle();
		}));
		new Setting(containerEl).setName("Roughen borders").setDesc("Long straight borders are drawn with a hand-drawn wobble. Only the look changes: the notes keep their few corners, borders go plain while you edit them, and the wobble comes back after. Detailed edges such as traced coasts are left as they are.").addDropdown((d) => d.addOptions({ off: "Off", light: "Light", medium: "Medium", strong: "Strong" }).setValue(s.roughBorders ?? "off").onChange(async (v) => {
			s.roughBorders = v as "off" | "light" | "medium" | "strong";
			await this.save(true);
		}));
		new Setting(containerEl).setName("Realm border band").setDesc("In the strategy look, a soft band of each realm's colour just inside its border, fading inwards, like the grand strategy games. Strongest close up.").addDropdown((d) => d.addOptions({ off: "Off", soft: "Soft", strong: "Strong" }).setValue(s.realmBand ?? "soft").onChange(async (v) => {
			s.realmBand = v as "off" | "soft" | "strong";
			await this.save(true);
			applyAppearance(s);
		}));
		new Setting(containerEl)
			.setName("Rivers")
			.setDesc("Rivers drawn with the route tool are water that widens from source to mouth: how wide, and the water's colour.")
			.addSlider((sl) => sl.setLimits(0.25, 3, 0.25).setValue(s.riverWidth ?? 1).onChange(async (v) => {
				s.riverWidth = v;
				await this.save(true);
			}))
			.addColorPicker((c) => c.setValue(s.riverColor || "#5aa2d8").onChange(async (v) => {
				s.riverColor = v;
				await this.save(false);
				applyAppearance(s);
			}))
			.addExtraButton((b) => b.setIcon("rotate-ccw").setTooltip("Reset").onClick(async () => {
				s.riverWidth = undefined;
				s.riverColor = undefined;
				await this.save(true);
				applyAppearance(s);
				this.update();
			}));
		new Setting(containerEl).setName("Names of regions").setDesc("Show the names of geography (continents, sub-continents, regions) as well as realms.").addToggle((t) => t.setValue(s.regionLabels !== false).onChange(async (v) => {
			s.regionLabels = v;
			await restyle();
		}));

		const realmHead = new Setting(containerEl).setName("Realms and tiers").setHeading();
		helpTip(realmHead.nameEl, "Titles sit under each other from what your notes already say: a `location:` or `located-in:`, `nation:`, a tag like #Nation_United_States, or the folder note above (United States/California/California.md is under United States).\n\nThe person in `lord:`, `holder:`, `owner:` or `ruler:` holds a title, with their house. Tags and kinds such as #Realm, #Province or #Region_Small say a title's tier.");
		new Setting(containerEl)
			.setName("Split realms at")
			.setDesc(`On the map, a realm shows as one block until it's this many pixels across, then splits into its ${tierName(3, true).toLowerCase()} (and those into their ${tierName(4, true).toLowerCase()}). Bigger: ${tierName(2, true).toLowerCase()} appear with less zooming out. The map's Tier button can also hold one level.`)
			.addSlider((sl) => sl.setLimits(160, 1600, 20).setValue(s.tierSplitPx).onChange(async (v) => {
				s.tierSplitPx = v;
				await this.save(false);
				this.plugin.refreshMaps();
			}));
		// What each tier is called: a state instead of a duchy works the same, only the name changes.
		const same = (a: Record<string, TierName>, b: Record<string, TierName>) => [1, 2, 3, 4, 5, 6].every((t) => (a[t]?.one?.trim() || "") === (b[t]?.one?.trim() || "") && (a[t]?.many?.trim() || "") === (b[t]?.many?.trim() || ""));
		const presetNow = TIER_NAME_PRESETS.find(([, , p]) => same(p, s.tierNames ?? {}))?.[0] ?? "own";
		new Setting(containerEl)
			.setName("Tier names")
			.setDesc("What your world calls each tier of land, as in United States › California › Los Angeles County. A renamed tier works exactly like the built-in one: its name shows on the map, in the realm tree and in menus, tags like #Place_State put a land on it, and standardised tags use it.")
			.addDropdown((d) => {
				for (const [id, label] of TIER_NAME_PRESETS) d.addOption(id, label);
				d.addOption("own", "Your own names");
				d.setValue(presetNow).onChange(async (v) => {
					const p = TIER_NAME_PRESETS.find(([id]) => id === v)?.[2];
					if (!p) return;
					s.tierNames = Object.keys(p).length ? structuredClone(p) : undefined;
					await this.save();
					this.plugin.refreshMaps();
					this.update();
				});
			});
		const nameBox = containerEl.createDiv({ cls: "uv-tier-names" });
		for (const t of [1, 2, 3, 4, 5, 6]) {
			const [builtOne, builtMany] = DEFAULT_TIER_NAMES[t];
			const own = s.tierNames?.[t];
			const put = async (key: "one" | "many", value: string) => {
				const next = { ...(s.tierNames ?? {}) };
				const row = { ...(next[t] ?? { one: "" }), [key]: value.trim() };
				if (row.one) next[t] = row;
				else delete next[t];
				s.tierNames = Object.keys(next).length ? next : undefined;
				await this.save();
				this.plugin.refreshMaps();
			};
			new Setting(nameBox)
				.setName(`Tier ${t}`)
				.setDesc(`Built in: ${builtOne.toLowerCase()}${t === 6 ? " (a city, town or fort)" : ""}`)
				.setClass("uv-tier-name-row")
				.addText((x) => {
					x.setPlaceholder(builtOne).setValue(own?.one ?? "");
					x.inputEl.setAttr("aria-label", `Tier ${t}, one`);
					x.inputEl.addEventListener("change", () => void put("one", x.getValue()).then(() => this.update()));
				})
				.addText((x) => {
					x.setPlaceholder(own?.one ? pluralOf(own.one) : builtMany).setValue(own?.many ?? "");
					x.inputEl.setAttr("aria-label", `Tier ${t}, many`);
					x.inputEl.addEventListener("change", () => void put("many", x.getValue()));
				});
		}

		const tierRows = Object.entries(tierWords(s.tierWords)).map(([word, rank]) => ({ word, rank }));
		const ranks = (): [string, string][] => [1, 2, 3, 4, 5, 6].map((t) => [String(t), `${t} · ${tierName(t).toLowerCase()}`]);
		this.rows(containerEl, "Your tier words", "Extra tags or kinds that name a tier, on top of the built-in ones (empire, kingdom, realm, nation, duchy, province, county, region, barony, city…). Only used to tell which way round two titles go; the tree itself comes from your links and folders.", [
			{ key: "word", label: "Tag or kind", kind: "text", width: "1.5fr", placeholder: "grandduchy" },
			{ key: "rank", label: "Tier", kind: "select", options: ranks, width: "1fr" },
		], tierRows.map((r) => ({ word: r.word, rank: String(r.rank) })), async (rows) => {
			s.tierWords = rows.filter((r) => String(r.word ?? "").trim()).map((r) => `${String(r.word).trim().toLowerCase()} = ${r.rank || 4}`).join("\n");
			await this.save();
		}, { blank: () => ({ word: "", rank: "4" }), addLabel: "Add a tier word" });

		// How each tier is drawn on the map.
		const styles = el("div", { cls: "chronicle-settings-rows" }, containerEl);
		new Setting(styles).setName("Territory styles").setDesc("How each tier of land is drawn on maps. Each card shows the land whole (left) and split into its vassals (right). A land's tier comes from its kind and tags like #Place_Realm, #Place_Province or #Place_Size_Small.").settingEl.addClass("chronicle-settings-rows-head");
		const saveStyles = debounce(async () => {
			await this.save(false);
			this.plugin.restyleTerritories?.();
		}, 250, true);
		tierStyleEditor(styles, s.tierStyles, (next: TierStyle[]) => {
			s.tierStyles = next;
			void saveStyles();
		});
		new Setting(containerEl)
			.setName("Standardise land tags")
			.setDesc("Go through every place and realm: ruled land (#Place_Province #Place_Size_Small) or geography (#Place_Region #Place_Size_Enormous), with its tier or landform and size. You see each change before it's written.")
			.addButton((b) => b.setButtonText("Review tags…").onClick(() => new TagStandardModal(this.plugin).open()));
		new Setting(styles).addButton((b) => b.setButtonText("Reset to the built-in styles").onClick(async () => {
			s.tierStyles = undefined;
			await this.save(false);
			this.plugin.restyleTerritories?.();
			this.update();
		}));
	}

	/** A heading, a line of help, and rows with proper controls in place of a block of text. */
	private rows<T extends Record<string, unknown>>(parent: HTMLElement, name: string, desc: string, fields: Field<T>[], initial: T[], onChange: (rows: T[]) => void | Promise<void>, opts: RowEditorOptions<T>): HTMLElement {
		const box = el("div", { cls: "chronicle-settings-rows" }, parent);
		new Setting(box).setName(name).setDesc(desc).settingEl.addClass("chronicle-settings-rows-head");
		rowEditor(this.app, box, fields, initial, (rows) => void onChange(rows), opts);
		return box;
	}

	/** Theme cards, colors, motion, density and hover cards. */
	private appearance(containerEl: HTMLElement) {
		const s = this.plugin.settings;
		const save = () => this.save(false);
		new Setting(containerEl).setName("Appearance").setHeading();
		el("p", { cls: "setting-item-description", text: "Themes restyle only UniverseView's views, boards, embeds and cards. Everything else in Obsidian keeps your theme." }, containerEl);
		renderThemeCards(containerEl, s.theme, (id) => void (async () => {
			s.theme = id;
			await save();
		})());
		new Setting(containerEl)
			.setName("Themes set buttons, tabs, edges, icons and headings")
			.setDesc("On: each theme brings its own button, tab, edge, icon and heading styles (listed on its card). Off: they stay plain, and only your own picks below apply.")
			.addToggle((tg) => tg.setValue(s.themeStyles !== false).onChange(async (v) => {
				s.themeStyles = v ? undefined : false;
				await save();
				this.update();
			}));		new Setting(containerEl)
			.setName("Tour")
			.setDesc("A short walk through what UniverseView does, where you can try on the themes and surface styles.")
			.addButton((b) => b.setButtonText("Take the tour").onClick(() => new TourModal(this.plugin).open()));

		const colors = new Setting(containerEl)
			.setName("Colors")
			.setDesc("Override the theme's accent and type colors. Clear one to go back to the theme's.");
		colors.settingEl.addClass("chronicle-color-setting");
		const swatches: [keyof typeof s.colors, string][] = [["accent", "Accent"], ["event", "Events"], ["person", "People"], ["culture", "Cultures"], ["place", "Places"]];
		const row = el("div", { cls: "chronicle-color-row" }, colors.controlEl);
		for (const [key, label] of swatches) {
			const wrap = el("label", { cls: "chronicle-color-pick" + (s.colors[key] ? " is-set" : "") }, row);
			const input = el("input", { attr: { type: "color", "aria-label": label } }, wrap);
			input.value = s.colors[key] || resolveColor(key);
			el("span", { text: label }, wrap);
			const clear = el("span", { cls: "chronicle-color-clear", title: "Use the theme's color" }, wrap);
			icon(clear, "x");
			input.addEventListener("input", () => void (async () => {
				s.colors[key] = input.value;
				wrap.addClass("is-set");
				await save();
			})());
			clear.addEventListener("click", (evt) => void (async (evt) => {
				evt.preventDefault();
				s.colors[key] = "";
				wrap.removeClass("is-set");
				await save();
				input.value = resolveColor(key);
			})(evt));
		}

		new Setting(containerEl).setName("Surface").setHeading();
		new Setting(containerEl)
			.setName("Surface style")
			.setDesc("Flat is quiet and follows your Obsidian theme. Tactile gives UniverseView's own tabs, buttons and panels raised keys, folder tabs and inset fields, so they're easy to tell from Obsidian's. It works with every theme, and its parts are set under Tactile style.")
			.addDropdown((d) => d.addOption("flat", "Flat").addOption("tactile", "Tactile").setValue(s.surfaceStyle ?? "flat").onChange(async (v) => {
				s.surfaceStyle = v === "tactile" ? "tactile" : "flat";
				await save();
				this.update();
			}));
		const th = looksOf(s);
		const own = s.themeStyles === false ? "Plain set" : `${th.name}'s own`;
		const pick = (title: string, desc: string, build: () => void) => {
			new Setting(containerEl).setName(title).setDesc(desc);
			build();
		};
		pick("Buttons", "How chips and icon buttons are drawn. “Theme” keeps the look the chosen theme brings.", () => stylePicker(containerEl, {
			choices: BUTTON_STYLES, value: s.buttonStyle, themeChoice: { id: th.buttons, name: "Theme", note: own }, preview: previewButtons,
			onPick: (id) => void (async () => { s.buttonStyle = id as typeof s.buttonStyle; await save(); })(),
		}));
		pick("Tabs", "The dashboard's, the inspector's and the settings' tabs.", () => stylePicker(containerEl, {
			choices: TAB_STYLES, value: s.tabStyle, themeChoice: { id: th.tabs, name: "Theme", note: own }, preview: previewTabs,
			onPick: (id) => void (async () => { s.tabStyle = id as typeof s.tabStyle; await save(); })(),
		}));
		pick("Edges", "The border of panels, modules, menus and hover cards.", () => stylePicker(containerEl, {
			choices: EDGE_STYLES, value: s.edgeStyle, themeChoice: { id: th.edges, name: "Theme", note: own }, preview: previewEdges,
			onPick: (id) => void (async () => { s.edgeStyle = id as typeof s.edgeStyle; await save(); })(),
		}));
		new Setting(containerEl)
			.setName("Vary the hand-drawn edge")
			.setDesc("Every frame gets its own random wobble, so no two are alike (new ones too). Applies when the edge is Hand-drawn; off keeps one shared wobble.")
			.addToggle((tg) => tg.setValue(s.sketchRandom === true).onChange(async (v) => {
				s.sketchRandom = v ? true : undefined;
				await save();
			}));		pick("Icons", "The stroke weight of UniverseView's icons.", () => stylePicker(containerEl, {
			choices: ICON_STYLES, value: s.iconStyle, themeChoice: { id: th.icons, name: "Theme", note: own }, preview: previewIcons,
			onPick: (id) => void (async () => { s.iconStyle = id as typeof s.iconStyle; await save(); })(),
		}));
		pick("Headings", "How titles and group names are marked: dashboard titles, panel headings and timeline group labels.", () => stylePicker(containerEl, {
			choices: HEADING_STYLES, value: s.headingStyle, themeChoice: { id: th.headings, name: "Theme", note: own }, preview: previewHeadings,
			onPick: (id) => void (async () => { s.headingStyle = id as typeof s.headingStyle; await save(); })(),
		}));		pick("Fonts", "A heading and body pair from fonts already on your device. “Theme” keeps the theme's fonts; the boxes under Fonts below still override.", () => stylePicker(containerEl, {
			choices: FONT_STYLES, value: s.fontStyle, themeChoice: { id: "theme", name: "Theme", note: "The theme's own fonts" }, preview: previewFonts,
			onPick: (id) => void (async () => { s.fontStyle = id as typeof s.fontStyle; await save(); })(),
		}));		new Setting(containerEl)
			.setName("Share this look")
			.setDesc("Copy the theme, colors, fonts, buttons, tabs, surface, motion and density as text, or paste a look copied from another vault.")
			.addButton((b) => b.setButtonText("Copy look").onClick(async () => {
				const look: Record<string, unknown> = {};
				for (const k of LOOK_KEYS) if (s[k] !== undefined) look[k] = s[k];
				await navigator.clipboard.writeText(JSON.stringify({ universeviewLook: 1, ...look }));
				new Notice("Look copied.");
			}))
			.addButton((b) => b.setButtonText("Paste look").onClick(async () => {
				try {
					const look = JSON.parse(await navigator.clipboard.readText()) as Record<string, unknown>;
					if (look.universeviewLook !== 1) throw new Error("not a look");
					const all = s as unknown as Record<string, unknown>;
					for (const k of LOOK_KEYS) {
						if (k in look) all[k] = look[k];
						else if (k === "buttonStyle" || k === "tabStyle" || k === "edgeStyle" || k === "fontStyle" || k === "iconStyle" || k === "headingStyle" || k === "sketchRandom") delete all[k];
					}
					if (!THEMES.some((t) => t.id === s.theme)) s.theme = "obsidian";
					await save();
					this.update();
					new Notice("Look applied.");
				} catch {
					new Notice("The clipboard doesn't hold a copied look.");
				}
			}));
		new Setting(containerEl)
			.setName("Motion")
			.setDesc("How quickly panels, cards, pins and the map animate. “Off” also applies when your system asks for reduced motion.")
			.addDropdown((d) => {
				for (const m of MOTIONS) d.addOption(m.id, `${m.name} — ${m.desc}`);
				d.setValue(s.motion).onChange(async (v) => {
					s.motion = v as typeof s.motion;
					await save();
				});
			});
		new Setting(containerEl)
			.setName("Density")
			.setDesc("Spacing of toolbars, lists and cards.")
			.addDropdown((d) => d.addOptions({ compact: "Compact", cozy: "Cozy", roomy: "Roomy" }).setValue(s.density).onChange(async (v) => {
				s.density = v as typeof s.density;
				await save();
			}));
		new Setting(containerEl)
			.setName("Corner radius")
			.setDesc("Roundness of cards and panels. All the way left uses the theme's.")
			.addSlider((sl) => sl.setLimits(-1, 20, 1).setValue(s.radius).onChange(async (v) => {
				s.radius = v;
				await save();
			}));
		new Setting(containerEl)
			.setName("Flat style")
			.setDesc("No shadows on cards and panels.")
			.addToggle((t) => t.setValue(!!s.flatStyle).onChange(async (v) => {
				s.flatStyle = v;
				await save();
			}));

		// The tactile style is made of parts, each its own switch; this section only shows while Tactile is on.
		new Setting(containerEl).setName("Tactile style").setHeading();
		const offNow = () => s.tactileOff ?? [];
		const presetNow = () => TACTILE_PRESETS.find((p) => p.off.length === offNow().length && p.off.every((x) => offNow().includes(x)))?.id ?? "custom";
		new Setting(containerEl)
			.setName("Parts")
			.setDesc("Start from a set, then switch single parts on or off below.")
			.addDropdown((d) => {
				for (const p of TACTILE_PRESETS) d.addOption(p.id, p.name);
				d.addOption("custom", "Custom");
				d.setValue(presetNow()).onChange(async (v) => {
					const p = TACTILE_PRESETS.find((x) => x.id === v);
					if (!p) return;
					s.tactileOff = [...p.off];
					await save();
					this.update();
				});
			});
		for (const part of TACTILE_PARTS) {
			new Setting(containerEl).setName(part.name).setDesc(part.desc).addToggle((t) => t.setValue(!offNow().includes(part.id)).onChange(async (on) => {
				const off = new Set(offNow());
				if (on) off.delete(part.id);
				else off.add(part.id);
				s.tactileOff = [...off];
				await save();
				this.update();
			}));
		}
		new Setting(containerEl)
			.setName("Strength")
			.setDesc("How deep the bevels and shadows are. 100% is the default.")
			.addSlider((sl) => sl.setLimits(20, 220, 5).setValue(s.tactileStrength ?? ({ subtle: 55, normal: 100, deep: 160 }[s.tactileDepth ?? "normal"])).onChange(async (v) => {
				s.tactileStrength = v;
				await save();
			}))
			.addExtraButton((b) => b.setIcon("rotate-ccw").setTooltip("Back to 100%").onClick(async () => {
				s.tactileStrength = undefined;
				s.tactileDepth = undefined;
				await save();
				this.update();
			}));
		new Setting(containerEl)
			.setName("Folder colour")
			.setDesc("The colour of folders in the Library and the Files panel. Manila by default.")
			.addColorPicker((c) => c.setValue(s.tactileFolderColor || "#e6c57e").onChange(async (v) => {
				s.tactileFolderColor = v;
				await save();
			}))
			.addExtraButton((b) => b.setIcon("rotate-ccw").setTooltip("Back to manila").onClick(async () => {
				s.tactileFolderColor = "";
				await save();
				this.update();
			}));

		// Views: sizes in the timeline and family tree (what the Style Settings plugin used to offer).
		const viewsHead = new Setting(containerEl).setName("Views").setHeading();
		helpTip(viewsHead.nameEl, "Sizes and tints in the timeline and family tree. These used to need the Style Settings plugin; they're all here now.");
		const size = (name: string, desc: string, min: number, max: number, step: number, dflt: number, get: () => number | undefined, put: (v: number | undefined) => void) =>
			new Setting(containerEl)
				.setName(name)
				.setDesc(desc)
				.addSlider((sl) => sl.setLimits(min, max, step).setValue(get() ?? dflt).onChange(async (v) => {
					put(v === dflt ? undefined : v);
					await save();
				}))
				.addExtraButton((b) => b.setIcon("rotate-ccw").setTooltip("Reset").onClick(async () => {
					put(undefined);
					await save();
					this.update();
				}));
		size("Timeline row height", "Height of each row of events (pixels).", 20, 48, 1, 28, () => s.tlRowHeight, (v) => (s.tlRowHeight = v));
		size("Timeline label size", "Size of the text on events (pixels).", 10, 18, 1, 12, () => s.tlFontSize, (v) => (s.tlFontSize = v));
		size("Family tree card width", "Width of each person's card (pixels).", 130, 280, 5, 180, () => s.cardWidth, (v) => (s.cardWidth = v));
		size("Family tree card height", "Height of each person's card (pixels).", 48, 100, 2, 64, () => s.cardHeight, (v) => (s.cardHeight = v));
		new Setting(containerEl)
			.setName("Tint cards by gender")
			.setDesc("Family tree cards take a light tint for men and women.")
			.addToggle((t) => t.setValue(!!s.genderTint).onChange(async (v) => {
				s.genderTint = v;
				await save();
			}));
		const tint = (name: string, get: () => string | undefined, put: (v: string | undefined) => void, dflt: string) =>
			new Setting(containerEl)
				.setName(name)
				.addColorPicker((c) => c.setValue(get() || dflt).onChange(async (v) => {
					put(v);
					await save();
				}))
				.addExtraButton((b) => b.setIcon("rotate-ccw").setTooltip("Use the theme's").onClick(async () => {
					put(undefined);
					await save();
					this.update();
				}));
		tint("Men's tint", () => s.tintMale, (v) => (s.tintMale = v), "#3d7fd9");
		tint("Women's tint", () => s.tintFemale, (v) => (s.tintFemale = v), "#d24f8a");

		// About: the version, and every version's changes.
		new Setting(containerEl).setName("About").setHeading();
		new Setting(containerEl)
			.setName("Show what's new after an update")
			.setDesc("Once, after UniverseView updates: what changed since the version you had.")
			.addToggle((t) => t.setValue(s.showWhatsNew !== false).onChange(async (v) => {
				s.showWhatsNew = v;
				await save();
			}));
		// Every version, newest first, right here (there is nothing else on this page to click through to).
		el("h4", { cls: "uv-history-head", text: `Version ${buildLabel(this.plugin.manifest.version).long}: what changed in every version` }, containerEl);
		const history = el("div", { cls: "uv-whatsnew-list" }, containerEl);
		this.history.unload();
		this.history = new Component();
		this.history.load();
		renderHistory(this.app, history, builtInChangelog(), this.history, 1);
		// Fonts: any font installed on your computer, or one of the suggestions; empty keeps the theme's.
		const fontsHead = new Setting(containerEl).setName("Fonts").setHeading();
		helpTip(fontsHead.nameEl, "Type a font's name (any font installed on your computer) or pick a suggestion. Leave it empty to use the UniverseView theme's font, or Obsidian's.");
		const fontList = "chronicle-font-suggestions";
		if (!document.getElementById(fontList)) {
			const dl = document.body.createEl("datalist", { attr: { id: fontList } });
			for (const f of ["Cinzel", "Garamond", "EB Garamond", "Palatino Linotype", "Book Antiqua", "Georgia", "Libre Baskerville", "Cormorant Garamond", "Merriweather", "Inter", "Segoe UI", "Roboto", "Open Sans", "Lato", "Trebuchet MS", "Verdana", "Consolas", "Cascadia Code", "Orbitron", "Uncial Antiqua", "MedievalSharp", "IM Fell English"]) dl.createEl("option", { attr: { value: f } });
		}
		const fontField = (name: string, desc: string, get: () => string | undefined, put: (v: string) => void) =>
			new Setting(containerEl).setName(name).setDesc(desc).addText((t) => {
				t.setPlaceholder("Theme default").setValue(get() ?? "");
				t.inputEl.setAttribute("list", fontList);
				t.inputEl.addEventListener("change", () => void (async () => {
					put(t.getValue().trim());
					await save();
				})());
			});
		fontField("Text", "UniverseView's views, panels and cards.", () => s.fontUi, (v) => (s.fontUi = v));
		fontField("Headings and names", "Titles, names on cards, realm names on the map.", () => s.fontDisplay, (v) => (s.fontDisplay = v));
		fontField("Map labels", "Place and territory names on maps (empty: the headings font for territories).", () => s.fontMap, (v) => (s.fontMap = v));

		// ---- Inspector, and what hover cards show ----------------------------------------------
		const inspHead = new Setting(containerEl).setName("Inspector").setHeading();
		helpTip(inspHead.nameEl, "The side panel for the note you're on (Ctrl/Cmd+Alt+I). Click any section's heading there to fold it; folded sections stay folded for every note until you open them again.");
		const redrawInspector = () => {
			for (const leaf of this.app.workspace.getLeavesOfType("chronicle-inspector")) {
				const v = leaf.view as unknown as { show?: (k: string) => void; getState: () => { key?: string } };
				const key = v.getState().key;
				if (key) v.show?.(key);
			}
		};
		new Setting(containerEl)
			.setName("Identity strip")
			.setDesc("At the top: its picture, name and other names, what it is, its dates with an age or length, where it's filed, and a button for each view it's in.")
			.addToggle((t) => t.setValue(s.inspectorHeader !== false).onChange(async (v) => {
				s.inspectorHeader = v;
				await save();
				redrawInspector();
			}));
		new Setting(containerEl)
			.setName("Opens on")
			.setDesc("The tab a note opens on when the inspector starts.")
			.addDropdown((d) => d.addOptions({ about: "About", edit: "Edit", timeline: "Timeline", map: "Map", links: "Links", note: "Note" }).setValue(s.inspectorDefaultTab ?? "about").onChange(async (v) => {
				s.inspectorDefaultTab = v;
				await save();
			}));
		const tabNames: [string, string][] = [["timeline", "Timeline"], ["map", "Map"], ["links", "Links"], ["note", "Note"]];
		const tabsSetting = new Setting(containerEl).setName("Tabs").setDesc("Which tabs to show (About and Edit are always there).");
		for (const [id, label] of tabNames) {
			tabsSetting.addToggle((t) => {
				t.setTooltip(label).setValue(!(s.inspectorHiddenTabs ?? []).includes(id)).onChange(async (v) => {
					const hidden = new Set(s.inspectorHiddenTabs ?? []);
					if (v) hidden.delete(id);
					else hidden.add(id);
					s.inspectorHiddenTabs = [...hidden];
					await save();
					redrawInspector();
				});
				t.toggleEl.setAttribute("aria-label", label);
				t.toggleEl.parentElement?.createSpan({ cls: "uv-toggle-label", text: label });
			});
		}
		new Setting(containerEl)
			.setName("Spacing")
			.addDropdown((d) => d.addOptions({ comfortable: "Comfortable", compact: "Compact" }).setValue(s.inspectorDensity ?? "comfortable").onChange(async (v) => {
				s.inspectorDensity = v as "comfortable" | "compact";
				await save();
			}))
			.addExtraButton((b) => b.setIcon("unfold-vertical").setTooltip("Unfold every folded section").onClick(async () => {
				s.inspectorCollapsed = [];
				await save();
				redrawInspector();
				new Notice("Every inspector section is open again.");
			}));
		const parts: [string, string][] = [["owner", "Held by"], ["map", "Map outline"], ["facts", "Facts"], ["excerpt", "Opening text"], ["tags", "Tags"], ["actions", "Buttons"]];
		const partsSetting = new Setting(containerEl).setName("Hover card parts").setDesc("What hover cards show, besides the name.");
		for (const [id, label] of parts) {
			partsSetting.addToggle((t) => {
				t.setTooltip(label).setValue(!(s.hoverHide ?? []).includes(id)).onChange(async (v) => {
					const hide = new Set(s.hoverHide ?? []);
					if (v) hide.delete(id);
					else hide.add(id);
					s.hoverHide = [...hide];
					await save();
				});
				t.toggleEl.parentElement?.createSpan({ cls: "uv-toggle-label", text: label });
			});
		}

		// Icons: per type of note and per kind of group, and beside notes in the file lists.
		const iconsHead = new Setting(containerEl).setName("Icons").setHeading();
		helpTip(iconsHead.nameEl, "Each note shows its type's icon (a pin for a place) and, beside it, what it is more exactly: its own `icon:` (Change icon… on its right-click menu), its kind's icon (Kinds of place, under Maps & realms), or its kind of group's.\n\nIcons are Lucide names (lucide.dev) or an emoji. Leave a field empty for the built-in icon.");
		new Setting(containerEl)
			.setName("Icons in the file explorer and search")
			.setDesc("Beside each UniverseView note, its type and kind, like a pin and a castle for a fort.")
			.addToggle((t) => t.setValue(s.fileIcons !== false).onChange(async (v) => {
				s.fileIcons = v;
				await save();
				this.plugin.repaintFileIcons?.();
			}));
		// File explorer colours: by realm, softer for smaller tiers.
		new Setting(containerEl)
			.setName("Colour the file explorer by realm")
			.setDesc("Each title takes its realm's colour (or the nearest one above it with a colour of its own), bright for great titles and softer for their vassals: a duchy in strong red, its counties in a muted red. Houses use their colour, people their house's. Folders with a folder note follow it.")
			.addToggle((t) => t.setValue(s.fileColors !== false).onChange(async (v) => {
				s.fileColors = v;
				await save();
				this.plugin.repaintFileIcons?.();
			}))
			.addDropdown((d) => d.addOptions({ both: "Text and bar", text: "Text only", bar: "Bar only" }).setValue(s.fileColorStyle ?? "both").onChange(async (v) => {
				s.fileColorStyle = v as "text" | "bar" | "both";
				await save();
				this.plugin.repaintFileIcons?.();
			}));
		const strengths = { ...DEFAULT_FILE_STRENGTH, ...(s.fileStrength ?? {}) };
		const strengthBox = containerEl.createDiv({ cls: "uv-file-strengths" });
		for (const [k, name] of fileStrengthNames()) {
			new Setting(strengthBox)
				.setName(name)
				.setClass("uv-file-strength-row")
				.addSlider((sl) => sl.setLimits(0, 100, 5).setValue(strengths[k]).onChange(async (v) => {
					s.fileStrength = { ...(s.fileStrength ?? {}), [k]: v };
					await save();
					this.plugin.repaintFileIcons?.();
				}));
		}
		new Setting(strengthBox).setDesc("Colour strength per tier: 100 is the realm's full colour, 0 the plain file colour.").addButton((b) => b.setButtonText("Reset strengths").onClick(async () => {
			s.fileStrength = undefined;
			await save();
			this.plugin.repaintFileIcons?.();
			this.update();
		}));
		new Setting(containerEl)
			.setName("Note in the status bar")
			.setDesc("The open note's icons, what it is and where it sits (“Fort · Los Angeles County › California”) at the bottom of the window; click it for the inspector.")
			.addToggle((t) => t.setValue(s.statusBar !== false).onChange(async (v) => {
				s.statusBar = v;
				await save();
				this.plugin.refreshStatus?.();
			}));
		new Setting(containerEl)
			.setName("Style tags in notes")
			.setDesc("UniverseView's tags (#Character_Person, #Place_Realm, #Place_Size_Small, #Group_Nation_United_States…) as pills in their type's or realm's colour, in reading view and while editing.")
			.addToggle((t) => t.setValue(s.styleTags !== false).onChange(async (v) => {
				s.styleTags = v;
				await save();
				this.plugin.restyleTags?.();
			}));
		const iconField = (name: string, current: string | undefined, fallback: string, put: (v: string) => void) => {
			const set = new Setting(containerEl).setName(name);
			const preview = el("span", { cls: "uv-icon-preview" });
			set.nameEl.prepend(preview);
			const show = (v: string) => {
				preview.empty();
				glyph(preview, v || fallback);
			};
			show(current ?? "");
			set.addText((t) => {
				t.setPlaceholder(fallback).setValue(current ?? "");
				t.onChange((v) => show(v.trim()));
				t.inputEl.addEventListener("change", () => void (async () => {
					put(t.getValue().trim());
					applyIconSettings(this.plugin);
					await this.save();
					this.plugin.repaintFileIcons?.();
				})());
			});
		};
		for (const type of ENTITY_TYPES) iconField(`${TYPE_LABELS[type]} notes`, s.typeIcons?.[type], DEFAULT_TYPE_ICONS[type], (v) => (s.typeIcons = { ...(s.typeIcons ?? {}), [type]: v }));
		for (const [kind, k] of Object.entries(GROUP_KINDS)) iconField(`Group: ${k.label.toLowerCase()}`, s.groupIcons?.[kind], DEFAULT_GROUP_ICONS[kind as keyof typeof DEFAULT_GROUP_ICONS], (v) => (s.groupIcons = { ...(s.groupIcons ?? {}), [kind]: v }));

		new Setting(containerEl)
			.setName("Suggested shortcuts")
			.setDesc("Ctrl/Cmd+Alt with a letter for the views and tools (T timeline, M map, Q quick creator, I inspector, Z undo…). Off by default so they never clash with yours; you can also set any shortcut in Obsidian's Hotkeys settings. Applies after Obsidian restarts.")
			.addToggle((t) => t.setValue(!!s.suggestedHotkeys).onChange(async (v) => {
				s.suggestedHotkeys = v;
				await this.save(false);
				new Notice("Restart Obsidian (or turn UniverseView off and on) to apply the shortcuts.");
			}));

		new Setting(containerEl).setName("Hover cards").setHeading();
		new Setting(containerEl)
			.setName("Show hover cards")
			.setDesc("Rest the pointer on anything in a UniverseView view for a summary: dates and age, family, where it is, what happened there and the note's opening lines. Hold Ctrl/Cmd for Obsidian's page preview instead.")
			.addToggle((t) => t.setValue(s.hoverCards).onChange(async (v) => {
				s.hoverCards = v;
				await save();
			}));
		new Setting(containerEl)
			.setName("In notes")
			.setDesc("Also show cards for links to UniverseView notes while you read and write.")
			.addDropdown((d) => d.addOptions({ off: "Never", alt: "While holding Alt", always: "Always" }).setValue(s.hoverInNotes).onChange(async (v) => {
				s.hoverInNotes = v as typeof s.hoverInNotes;
				await save();
			}));
		new Setting(containerEl)
			.setName("Delay")
			.setDesc("How long to rest on an item before its card opens (milliseconds). Hold Alt to open one at once.")
			.addSlider((sl) => sl.setLimits(0, 2000, 50).setValue(s.hoverDelay).onChange(async (v) => {
				s.hoverDelay = v;
				await save();
			}));
		const slider = (name: string, desc: string, min: number, max: number, step: number, get: () => number, put: (v: number) => void) =>
			new Setting(containerEl).setName(name).setDesc(desc).addSlider((sl) => sl.setLimits(min, max, step).setValue(get()).onChange(async (v) => {
				put(v);
				await save();
			}));
		slider("Fade in", "How long a card takes to fade in (milliseconds). It can be clicked once it's fully in.", 0, 1000, 20, () => s.hoverFadeMs ?? 220, (v) => (s.hoverFadeMs = v));
		slider("Card width", "How wide hover cards are (pixels).", 240, 520, 10, () => s.hoverCardWidth ?? 340, (v) => (s.hoverCardWidth = v));
		slider("Timer ring size", "How big the ring by the pointer is (pixels).", 10, 36, 1, () => s.hoverRingSize ?? 18, (v) => (s.hoverRingSize = v));
		new Setting(containerEl)
			.setName("Switch straight to the next card")
			.setDesc("While a card is open, moving onto another item opens its card at once instead of waiting again.")
			.addToggle((t) => t.setValue(!!s.hoverSwapFast).onChange(async (v) => {
				s.hoverSwapFast = v;
				await save();
			}));
		slider("Help tips: delay", "How long to rest on a ? before its explanation opens (milliseconds).", 0, 1500, 50, () => s.helpDelay ?? 350, (v) => (s.helpDelay = v));
		slider("Help tips: fade", "How long a ? tip takes to fade in (milliseconds).", 0, 800, 20, () => s.helpFadeMs ?? 220, (v) => (s.helpFadeMs = v));
		slider("Map: tier fade", `How long realms take to fade into their ${tierName(3, true).toLowerCase()} and back as you zoom (milliseconds).`, 0, 1200, 50, () => s.tierFadeMs ?? 300, (v) => (s.tierFadeMs = v));
		slider("Map: name fade", "How long place and territory names take to fade in and out as room appears (milliseconds).", 0, 800, 25, () => s.labelFadeMs ?? 150, (v) => (s.labelFadeMs = v));		new Setting(containerEl)
			.setName("Show a timer ring")
			.setDesc("A small ring by the pointer fills up while a card is on its way, so you can move off or right-click before it opens.")
			.addToggle((t) => t.setValue(s.hoverRing !== false).onChange(async (v) => {
				s.hoverRing = v;
				await save();
			}));
		new Setting(containerEl)
			.setName("Close after")
			.setDesc("How long a card stays once the pointer leaves it (milliseconds), so you can move onto it. Drag a card by its handle (or any empty part) to keep it open where you drop it; keys while one is open: P pin, I inspect, E edit, O open the note, Esc close.")
			.addSlider((sl) => sl.setLimits(0, 1500, 50).setValue(s.hoverHideDelay ?? 180).onChange(async (v) => {
				s.hoverHideDelay = v;
				await save();
			}));
	}
	/** A calendar as a card: what it's like at a glance, and buttons to edit, copy or delete it. */
	private calendarEditor(parent: HTMLElement, c: CalendarDef, index: number) {
		const s = this.plugin.settings;
		const card = el("div", { cls: "chronicle-calendar-card" }, parent);
		const head = el("div", { cls: "chronicle-calendar-head" }, card);
		icon(el("span", {}, head), "calendar-days");
		el("strong", { text: c.name }, head);
		el("code", { text: c.id }, head);
		const preview = el("div", { cls: "chronicle-calendar-preview" }, card);
		try {
			const cal = new CustomCalendar(c);
			const y = c.eras[0]?.startYear ?? 1;
			const sample = cal.toDays(y, Math.min(3, c.months.length), 14);
			const w = cal.weekdayOf(sample);
			const bits = [`${c.months.length} months`, `${cal.yearDays(y)} days a year`];
			if (c.leaps?.length) bits.push("leap years");
			if (cal.weekdays.length) bits.push(`${cal.weekdays.length}-day weeks`);
			if (cal.moons.length) bits.push(`${cal.moons.length} moon${cal.moons.length === 1 ? "" : "s"}`);
			if (c.seasons?.length) bits.push(`${c.seasons.length} seasons`);
			if (c.holidays?.length) bits.push(`${c.holidays.length} holidays`);
			preview.setText(`${bits.join(" · ")} · e.g. “${w >= 0 ? cal.weekdays[w] + ", " : ""}${formatDay(sample, cal)}”`);
		} catch {
			preview.setText("Check the months.");
		}
		new Setting(card)
			.addButton((b) => b.setButtonText("Edit").setCta().onClick(() => {
				try {
					// Edited right here on the page: a window opened over Settings can end up behind it.
					card.empty();
					CalendarEditorModal.inline(this.plugin, card, c, (next) => void (async (next) => {
						s.calendars[index] = next;
						await this.save();
					})(next), () => this.update());
				} catch (err) {
					console.error("UniverseView: couldn't open the calendar editor", err);
					new Notice(`Couldn't open the calendar editor: ${err instanceof Error ? err.message : String(err)}`);
				}
			}))
			.addButton((b) => b.setButtonText("Duplicate").onClick(async () => {
				s.calendars.push({ ...structuredClone(c), id: `${c.id}-copy`, name: `${c.name} (copy)` });
				await this.save();
				this.update();
			}))
			.addExtraButton((b) => b.setIcon("trash-2").setTooltip("Delete calendar").onClick(() => {
				new ConfirmPrompt(this.plugin, `Delete the calendar “${c.name}”?`, "Notes using it fall back to the default.", "Delete", () => {
					s.calendars.splice(index, 1);
					void this.save().then(() => this.update());
				}).open();
			}));
	}
}