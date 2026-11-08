import { metadataEvents, templater } from "./internals";
import { UndoHistoryModal } from "./ui/undohistory";
import type { DrawHow } from "./views/MapView";
import { TodayView, VIEW_TODAY } from "./views/TodayView";
import { Editor, addIcon, FuzzySuggestModal, ItemView, Menu, Notice, Platform, Plugin, SuggestModal, TFile, TFolder, WorkspaceLeaf, debounce, getAllTags, normalizePath, type Hotkey, type Modifier } from "obsidian";

// iPhones and iPads before iOS 15.4 have no structuredClone; everything UniverseView copies with it is plain data.
if (typeof window.structuredClone !== "function") {
	(window as { structuredClone?: <T>(v: T) => T }).structuredClone = <T>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));
}
import { type ChronDate, type Entity, type EntityType } from "./types";
import { ChronicleSettings, DEFAULT_SETTINGS, FieldName, buildFieldAliases } from "./settings";
import { CalendarRegistry, daysFromCivil } from "./dates/calendars";
import { formatDate, formatDay, parseDate } from "./dates/parser";
import { EntityIndex } from "./index/EntityIndex";
import { presetKinds, relKind } from "./index/relkinds";
import { knownTo } from "./index/knowledge";
import { DEFAULT_REGION_WORDS, realmTree, setTierNames, tierWords, tierWordsWith, type RealmTree } from "./index/realms";
import { absorbGaps, untangle } from "./index/merge";
import { BUILT_IN_PRESETS, applyLook, type MapPreset } from "./ui/mappresets";
import { WhatsNewModal } from "./ui/WhatsNew";
import { compareVersions } from "./index/changelog";
import { isHouse } from "./render/houses";
import { setHelpDelay } from "./render/common";
import { applyIconSettings, changeNoteIcon, decorateFileLists } from "./ui/icons";
import { folderNoteOf, folderNotes, isFolderNote, makeFolderNote } from "./ui/foldernotes";
import { TagStandardModal, choiceTags } from "./ui/tagstandard";
import { TidyModal, tidyWatchers } from "./ui/tidy";
import { syncAfterMapEdit } from "./ui/mapsync";
import { registerFolderOverview } from "./ui/folderoverview";
import { styleTags } from "./ui/tagstyle";
import { styleTerritories } from "./ui/territorystyle";
import { statusBar } from "./ui/statusbar";
import { CauseChainModal } from "./ui/causes";
import { WorldSettingsModal } from "./ui/WorldSettings";
import { HOVER_SOURCE, TYPE_ICONS, clickNotice } from "./render/common";
import { WORLD_MAP } from "./render/map";
import { TimelineView, VIEW_TIMELINE } from "./views/TimelineView";
import { FamilyTreeView, VIEW_FAMILY } from "./views/FamilyTreeView";
import { NetworkView, VIEW_NETWORK } from "./views/NetworkView";
import { LineageView, VIEW_LINEAGE } from "./views/LineageView";
import { MapView, VIEW_MAP } from "./views/MapView";
import { OverviewView, VIEW_OVERVIEW } from "./views/OverviewView";
import { DashboardView, MODULE_KINDS, VIEW_DASHBOARD } from "./views/DashboardView";
import { ExplorerView, VIEW_EXPLORER } from "./views/ExplorerView";
import { OrgChartView, VIEW_ORG } from "./views/OrgChartView";
import { CalendarView, ConvertModal, VIEW_CALENDAR } from "./views/CalendarView";
import { TableView, VIEW_TABLE } from "./views/TableView";
import { HousesView, VIEW_HOUSES } from "./views/HousesView";
import { RealmsView, VIEW_REALMS } from "./views/RealmsView";
import { InspectorView, VIEW_INSPECTOR } from "./views/InspectorView";
import { HubView, LOGO_ICON, LOGO_SVG, VIEW_HUB, hostedInHub } from "./views/HubView";
import { FilesPanelView, VIEW_FILES, explorerButton } from "./views/FilesPanelView";
import { EntityPickerModal } from "./ui/suggest";
import { TextPrompt } from "./ui/TextPrompt";
import { KinshipModal, KnowledgeModal, NamesModal, SuccessionModal } from "./ui/people";
import { ContinuityModal, LiveSuggestions, PromptsModal, SuggestionsModal, inlineHelpers, suggestionsFor } from "./ui/writing";
import { CleanupModal, CompletenessModal, ContradictionsModal, DuplicatesModal, OrphansModal } from "./ui/tidying";
import { exportWorldBook } from "./ui/worldbook";
import { exportWebsite } from "./ui/website";
import type { SavedView } from "./settings";
import { buildGedcom } from "./import/gedcom-export";
import { HoverCards } from "./ui/HoverCard";
import { THEMES, applyAppearance, clearAppearance } from "./appearance";
import { suggestWorldSetting } from "./ui/worldsettingui";
import { kindTag, parseTag, tidyKinds } from "./index/tagscheme";
import { CATEGORY_KEYS, markedType, normalizeType, readPoints, typeFromTag, writePoints, type TypeMarks } from "./index/reader";
import type { ModuleKind } from "./settings";
import { CreateEntityModal, CreatePrefill } from "./ui/CreateEntityModal";
import { ValidateModal } from "./ui/ValidateModal";
import { DetectModal } from "./ui/DetectModal";
import { SmartReaderModal } from "./ui/SmartReader";
import { NormaliseTagsModal } from "./ui/NormaliseTags";
import { GedcomModal } from "./ui/GedcomModal";
import { ChronicleSettingTab } from "./ui/SettingsTab";
import { registerCodeBlocks } from "./codeblocks";
import type { EntityFilter } from "./types";
import { asText } from "./index/text";
import { addBodyToStep, addToStep, changesBetween, readHistory, splitBody, remember, renameInSteps, restoreFront, writeHistory, type UndoStep } from "./index/undo";

/** Every view, with its ribbon icon and default hotkey (Ctrl/Cmd + Alt + key; changeable in Settings → Hotkeys). */
/** This build's version, written in by esbuild.config.mjs (absent in the test harness). */
declare const UV_BUILD_VERSION: string | undefined;

const VIEWS: { type: string; name: string; icon: string; key: string }[] = [
	{ type: VIEW_HUB, name: "Dashboard", icon: LOGO_ICON, key: "U" },
	{ type: VIEW_OVERVIEW, name: "Overview", icon: "library", key: "O" },
	{ type: VIEW_EXPLORER, name: "Library", icon: "panels-top-left", key: "H" },
	{ type: VIEW_DASHBOARD, name: "Board", icon: "layout-dashboard", key: "B" },
	{ type: VIEW_TIMELINE, name: "Timeline", icon: "calendar-range", key: "T" },
	{ type: VIEW_FAMILY, name: "Family tree", icon: "git-fork", key: "F" },
	{ type: VIEW_NETWORK, name: "Connections graph", icon: "waypoints", key: "G" },
	{ type: VIEW_LINEAGE, name: "Lineage of groups", icon: "git-branch", key: "L" },
	{ type: VIEW_REALMS, name: "Realms and cultures", icon: "crown", key: "K" },
	{ type: VIEW_ORG, name: "Realm and dynasty chart", icon: "network", key: "R" },
	{ type: VIEW_MAP, name: "Map", icon: "map", key: "M" },
	{ type: VIEW_CALENDAR, name: "Calendar", icon: "calendar-days", key: "C" },
	{ type: VIEW_TODAY, name: "Today in the world", icon: "sunrise", key: "Y" },
	{ type: VIEW_TABLE, name: "Table", icon: "table", key: "E" },
];

const SNIPPETS: { name: string; text: string }[] = [
	{ name: "Timeline", text: "```chronicle-timeline\n# folder: World\n# group: culture\n# from: 1200\n# to: 1300\n```" },
	{ name: "Family tree of this person", text: "```chronicle-family\nup: 2\ndown: 2\n```" },
	{ name: "Connections around this note", text: "```chronicle-graph\ndepth: 2\n```" },
	{ name: "Lineage of groups", text: "```chronicle-lineage\n# folder: World\n```" },
	{ name: "Organisation chart", text: "```chronicle-org\n# root: Organisation name (defaults to this note)\n# at: 1250\ntimeline: true\n```" },
	{ name: "Map", text: "```chronicle-map\n# map: World Map\n# trace: Person Name\n```" },
	{ name: "Calendar", text: "```chronicle-calendar\n# folder: World\n# mode: month (or year, agenda)\n```" },
];

export default class ChroniclePlugin extends Plugin {
	settings!: ChronicleSettings;
	calendars!: CalendarRegistry;
	index!: EntityIndex;
	hoverCards?: HoverCards;

	async onload() {
		await this.loadSettings();
		void this.loadHistory().catch((err) => console.error("UniverseView: couldn't read the undo history", err));
		applyAppearance(this.settings);
		setHelpDelay(this.settings.helpDelay ?? 350);
		applyIconSettings(this);
		this.hoverCards = new HoverCards(this);
		this.calendars = new CalendarRegistry(this.settings.calendars, this.settings.defaultCalendar);
		this.index = new EntityIndex(this.app, () => this.settings, this.calendars);

		addIcon(LOGO_ICON, LOGO_SVG);
		this.registerView(VIEW_HUB, (leaf) => new HubView(leaf, this));
		this.registerView(VIEW_FILES, (leaf) => new FilesPanelView(leaf, this));
		this.registerView(VIEW_TIMELINE, (leaf) => new TimelineView(leaf, this));
		this.registerView(VIEW_FAMILY, (leaf) => new FamilyTreeView(leaf, this));
		this.registerView(VIEW_NETWORK, (leaf) => new NetworkView(leaf, this));
		this.registerView(VIEW_LINEAGE, (leaf) => new LineageView(leaf, this));
		this.registerView(VIEW_MAP, (leaf) => new MapView(leaf, this));
		this.registerView(VIEW_OVERVIEW, (leaf) => new OverviewView(leaf, this));
		this.registerView(VIEW_DASHBOARD, (leaf) => new DashboardView(leaf, this));
		this.registerView(VIEW_EXPLORER, (leaf) => new ExplorerView(leaf, this));
		this.registerView(VIEW_ORG, (leaf) => new OrgChartView(leaf, this));
		this.registerView(VIEW_CALENDAR, (leaf) => new CalendarView(leaf, this));
		this.registerView(VIEW_TODAY, (leaf) => new TodayView(leaf, this));
		this.registerView(VIEW_TABLE, (leaf) => new TableView(leaf, this));
		this.registerView(VIEW_HOUSES, (leaf) => new HousesView(leaf, this));
		this.registerView(VIEW_REALMS, (leaf) => new RealmsView(leaf, this));
		this.registerView(VIEW_INSPECTOR, (leaf) => new InspectorView(leaf, this));
		if (this.settings.ribbonViews) this.addRibbonIcon("panel-right", "UniverseView: inspector", () => void this.inspect(this.app.workspace.getActiveFile()?.path));
		this.registerHoverLinkSource(HOVER_SOURCE, { display: "UniverseView", defaultMod: true });
		// Each extra below starts on its own: one that can't run here (a phone, an unusual theme or
		// layout) switches only itself off, instead of stopping the plugin from enabling.
		const noop = () => {};
		if (Platform.isMobile) this.safely("the phone layout", () => this.trackBottomBar(), undefined);
		this.safely("update check", () => this.watchForUpdate(), undefined);
		this.safely("what's new", () => this.whatsNewAfterUpdate(), undefined);
		this.safely("Embedded views", () => registerCodeBlocks(this), undefined);
		// Type and kind icons beside notes in the file explorer and search.
		const repaintIcons = this.safely("File explorer icons", () => decorateFileLists(this), noop);
		const repaintFolders = this.safely("Folder notes", () => folderNotes(this), noop);
		this.safely("Tidying prompts", () => tidyWatchers(this), undefined);
		this.safely("Folder overviews", () => registerFolderOverview(this), undefined);
		this.addCommand({ id: "standardise-land-tags", name: "Standardise land tags (title or region, tier, size)", icon: "tags", callback: () => new TagStandardModal(this).open() });
		this.addCommand({ id: "tidy-into-folder-notes", name: "Move notes into their folder notes (house, realm, place)", icon: "folder-tree", callback: () => new TidyModal(this).open() });
		this.repaintFileIcons = () => {
			repaintIcons();
			repaintFolders();
		};
		// UniverseView's tags in notes, as pills in their type's colour.
		this.restyleTags = this.safely("Tag colours", () => styleTags(this), noop);
		const restyle = this.safely("Territory styles", () => styleTerritories(this), noop);
		// Territory looks change the drawing itself (bands, textures), not just its CSS: redraw open maps too.
		this.restyleTerritories = () => {
			restyle();
			this.refreshMaps();
		};
		// The open note at a glance (what it is, where it sits) in the status bar, which phones don't have.
		this.refreshStatus = Platform.isMobile ? noop : this.safely("Status bar", () => statusBar(this), noop);
		this.settingTab = new ChronicleSettingTab(this.app, this);
		this.addSettingTab(this.settingTab);

		// Left sidebar: the overview is the main menu; each view also gets its own button
		// (any of them can be hidden by right-clicking the ribbon).
		for (const v of VIEWS) {
			if (v.type !== VIEW_HUB && !this.settings.ribbonViews) continue;
			const label = v.type === VIEW_HUB ? "UniverseView" : `UniverseView: ${v.name.toLowerCase()}`;
			const button = this.addRibbonIcon(v.icon, label, () => void this.activateView(v.type));
			this.ribbonButtons.set(v.type, button);
			button.toggle(this.moduleOn(v.type));
		}
		this.registerCommands();
		this.syncExplorerButton = this.safely("Files button", () => explorerButton(this), noop);
		// The files panel joins the sidebar once; after that, closing it is respected.
		this.app.workspace.onLayoutReady(() => {
			if (this.settings.filesPanelAdded || !this.moduleOn(VIEW_FILES)) return;
			this.settings.filesPanelAdded = true;
			void this.saveSettings();
			void this.openFilesPanel(false);
		});
		this.safely("Right-click menus", () => this.registerFileMenu(), undefined);
		this.safely("Link hover cards", () => this.registerLinkHover(), undefined);
		// `age: Aldric Vane @ SE 20` and friends, filled in when reading a note.
		this.safely("Inline helpers", () => this.registerMarkdownPostProcessor(inlineHelpers(this)), undefined);
		// obsidian://universe-view?view=Name opens a saved view (links you can put in notes); links made
		// before the rename (obsidian://chronicle?…) still work.
		for (const action of ["universe-view", "chronicle"]) {
			this.registerObsidianProtocolHandler(action, (params) => {
				if (params.view) void this.openSavedView(params.view);
				else if (params.note) void this.openBest(this.index.findByName(params.note)?.key ?? "");
			});
		}
		// Relationship suggestions live in the status bar, so they're desktop-only too.
		if (!Platform.isMobile) this.app.workspace.onLayoutReady(() => this.safely("Relationship suggestions", () => new LiveSuggestions(this), undefined));
		this.safely("Modal stacking", () => this.keepNewModalsOnTop(), undefined);

		// Keep the index in sync with the vault.
		// An edit re-reads only that note; new, renamed and deleted notes change how links resolve, so
		// those (and Obsidian's first full pass) rebuild everything.
		this.registerEvent(this.app.metadataCache.on("changed", (file) => this.index.requestUpdate(file)));
		// The layout can be ready before Obsidian has read every note; rebuild once its first full pass is done.
		let firstPass = true;
		this.registerEvent(this.app.metadataCache.on("resolved", () => {
			if (firstPass || !this.index.ready) this.index.requestRebuild();
			firstPass = false;
		}));
		this.registerEvent(this.app.vault.on("create", () => this.index.ready && this.index.requestRebuild()));
		this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
			renameInSteps([...this.history, ...(this.openStep ? [this.openStep] : [])], oldPath, file.path);
			this.saveHistorySoon();
			this.index.requestRebuild();
		}));
		this.registerEvent(this.app.vault.on("delete", () => this.index.requestRebuild()));
		// Dataview fires these on the metadata cache once its own index is ready or changes.
		const mc = metadataEvents(this.app);
		this.registerEvent(mc.on("dataview:index-ready", () => this.index.requestRebuild()));
		this.registerEvent(mc.on("dataview:metadata-change", (...args: unknown[]) => {
			const file = args[1];
			if (this.settings.useDataview && file instanceof TFile) this.index.requestUpdate(file, true);
		}));

		this.app.workspace.onLayoutReady(() => {
			this.index.rebuild();
			window.setTimeout(() => this.safely("World setting", () => suggestWorldSetting(this), undefined), 3000);
		});
	}

	/**
	 * A command's suggested shortcut, given only when the suggested shortcuts are turned on (Settings →
	 * Look & cards). Obsidian's plugin guidelines ask for no default shortcuts, so new users choose
	 * their own; those who had them before keep them.
	 */
	private keys(modifiers: Modifier[], key: string): { hotkeys?: Hotkey[] } {
		return this.settings.suggestedHotkeys ? { hotkeys: [{ modifiers, key }] } : {};
	}

	/** Extras that couldn't start on this device, named once in a notice. */
	private startupProblems: string[] = [];
	private problemNotice = 0;

	/** Runs one start-up extra; if it fails here, it's switched off (and named) rather than taking the plugin down. */
	private safely<T>(what: string, run: () => T, fallback: T): T {
		try {
			return run();
		} catch (err) {
			console.error(`UniverseView: ${what} couldn't start on this device`, err);
			this.startupProblems.push(what);
			window.clearTimeout(this.problemNotice);
			this.problemNotice = window.setTimeout(() => new Notice(`UniverseView is running, but couldn't start here: ${this.startupProblems.join(", ")}. The rest works as usual.`, 10000), 1500);
			return fallback;
		}
	}

	/**
	 * On a phone, Obsidian's toolbar floats over the bottom of every view. How much of the screen it
	 * covers goes in --uv-bottom-inset, so the map's legend, territory tools and the like sit above it.
	 */
	private trackBottomBar() {
		const measure = () => {
			const bar = document.querySelector(".mobile-navbar");
			const top = bar?.getBoundingClientRect().top;
			const covered = top !== undefined && top > 0 ? Math.max(0, Math.round(window.innerHeight - top)) : 0;
			document.body.style.setProperty("--uv-bottom-inset", `${covered}px`);
		};
		measure();
		this.registerDomEvent(window, "resize", measure);
		this.registerEvent(this.app.workspace.on("layout-change", measure));
		this.app.workspace.onLayoutReady(measure);
		// The bar can grow or hide (the keyboard, a setting) without a resize.
		this.registerInterval(window.setInterval(measure, 2000));
	}

	/**
	 * A newer UniverseView synced in (from another device, say) keeps waiting until the plugin is
	 * loaded again, and a phone may run the old one for days. When the files on disk are newer than
	 * what's running, say so once, with a button that reloads it.
	 */
	private watchForUpdate() {
		const dir = this.manifest.dir;
		if (!dir) return;
		// What this code is: set when it was built (the manifest object can be refreshed under it).
		const running = typeof UV_BUILD_VERSION === "string" ? UV_BUILD_VERSION : this.manifest.version;
		let told = "";
		const check = async () => {
			try {
				const onDisk = (JSON.parse(await this.app.vault.adapter.read(`${dir}/manifest.json`)) as { version?: string }).version;
				if (!onDisk || onDisk === running || onDisk === told) return;
				told = onDisk;
				const frag = createFragment();
				frag.createSpan({ text: `UniverseView ${onDisk} has arrived (${running} is running). ` });
				const btn = frag.createEl("button", { text: "Reload UniverseView", cls: "mod-cta" });
				const notice = new Notice(frag, 0);
				btn.addEventListener("click", () => {
					notice.hide();
					const plugins = (this.app as unknown as { plugins?: { disablePlugin(id: string): Promise<void>; enablePlugin(id: string): Promise<void> } }).plugins;
					const id = this.manifest.id;
					if (plugins) void plugins.disablePlugin(id).then(() => plugins.enablePlugin(id));
				});
			} catch {
				// The files can be mid-sync; the next check tries again.
			}
		};
		this.app.workspace.onLayoutReady(() => window.setTimeout(() => void check(), 4000));
		this.registerInterval(window.setInterval(() => void check(), 60000));
		this.registerDomEvent(document, "visibilitychange", () => document.visibilityState === "visible" && void check());
	}

	/**
	 * After an update, once: what changed since the version you had (Settings → Look & cards → What's
	 * new). A first install just remembers the version, without a window.
	 */
	private whatsNewAfterUpdate() {
		const running = typeof UV_BUILD_VERSION === "string" ? UV_BUILD_VERSION : this.manifest.version;
		const seen = this.settings.lastSeenVersion;
		if (seen === running) return;
		this.settings.lastSeenVersion = running;
		void this.saveSettings();
		// A first install opens the dashboard, whose Home page shows the ways to begin.
		if (!seen) this.app.workspace.onLayoutReady(() => void this.activateView(VIEW_HUB, {}));
		if (!seen || this.settings.showWhatsNew === false || compareVersions(running, seen) <= 0) return;
		this.app.workspace.onLayoutReady(() => window.setTimeout(() => new WhatsNewModal(this, seen).open(), 1500));
	}

	onunload() {
		this.saveHistorySoon.run();
		// Views are detached by Obsidian; only the body classes and variables need removing.
		clearAppearance();
		document.body.style.removeProperty("--uv-bottom-inset");
	}

	async loadSettings() {
		const data = ((await this.loadData()) ?? {}) as Partial<ChronicleSettings> & Record<string, unknown>;
		this.settings = {
			...structuredClone(DEFAULT_SETTINGS),
			...data,
			newNoteFolders: { ...DEFAULT_SETTINGS.newNoteFolders, ...(data.newNoteFolders ?? {}) },
			templates: { ...DEFAULT_SETTINGS.templates, ...(data.templates ?? {}) },
			typeTags: { ...DEFAULT_SETTINGS.typeTags, ...(data.typeTags ?? {}) },
			colors: { ...DEFAULT_SETTINGS.colors, ...(data.colors ?? {}) },
			boards: Array.isArray(data.boards) ? data.boards : [],
			relationPresets: { ...DEFAULT_SETTINGS.relationPresets, ...(data.relationPresets ?? {}) },
			worldNotes: Array.isArray(data.worldNotes) ? data.worldNotes : [],
			savedViews: Array.isArray(data.savedViews) ? data.savedViews : [],
			currentDates: { ...(data.currentDates ?? {}) },
		};
		if (!THEMES.some((t) => t.id === this.settings.theme)) this.settings.theme = "obsidian";
		// 0.12.8: hover cards take a little longer (with a ring showing them coming); 350 ms was the old default.
		if (!data.hoverRingIntro) {
			if (data.hoverDelay === undefined || data.hoverDelay === 350) this.settings.hoverDelay = 600;
			(this.settings as unknown as Record<string, unknown>).hoverRingIntro = true;
		}
		// 0.12: pins and legends colour by realm; "culture" (a place's first group) was the old default.
		if (!data.realmColors) {
			if (this.settings.pinColorBy === "culture" || this.settings.pinColorBy === "region") this.settings.pinColorBy = "realm";
			(this.settings as unknown as Record<string, unknown>).realmColors = true;
		}
		// 1.3.1: the dashboard holds every view, so the sidebar keeps only its star (the setting brings the rest back).
		if (!this.settings.hubRibbon) {
			this.settings.hubRibbon = true;
			this.settings.ribbonViews = false;
		}
		// 2.1: the timeline sorts events by type unless you've chosen a grouping; "No grouping" was the old default.
		if (!data.timelineByCategory) {
			const saved = this.settings.viewStates?.[VIEW_TIMELINE]?.options as { group?: string } | undefined;
			if (saved?.group === "none") saved.group = "category";
			(this.settings as unknown as Record<string, unknown>).timelineByCategory = true;
		}
		// 0.26: no default shortcuts (Obsidian's guidelines); anyone already using the plugin keeps them.
		if (this.settings.suggestedHotkeys === undefined) this.settings.suggestedHotkeys = Object.keys(data).length > 0;
		// 0.18: realms merge into kingdoms sooner when zooming out; 420 px was the old default.
		if (!data.tierSplitV2) {
			if (data.tierSplitPx === undefined || data.tierSplitPx === 420) this.settings.tierSplitPx = 760;
			(this.settings as unknown as Record<string, unknown>).tierSplitV2 = true;
		}
		setTierNames(this.settings.tierNames);
	}

	async saveSettings() {
		await this.saveData(this.settings);
		setTierNames(this.settings.tierNames);
		this.calendars.load(this.settings.calendars, this.settings.defaultCalendar);
		applyAppearance(this.settings);
		setHelpDelay(this.settings.helpDelay ?? 350);
		applyIconSettings(this);
	}

	// ---- Public helpers (also used by views) ---------------------------------------------------

	/** The property name UniverseView writes for a field (the first configured alias). */
	fieldName(field: FieldName): string {
		return buildFieldAliases(this.settings.fieldAliases)[field][0];
	}

	parseDate(value: unknown, calendar?: string): ChronDate | null {
		return parseDate(value, this.calendars.get(calendar));
	}

	/**
	 * Today's date in a world: the world note's `today:`, else the date saved for this calendar, else
	 * (on the real-world calendar) the real today.
	 */
	todayFor(folder: string, calendarId?: string): number | undefined {
		const world = this.index.worldFor(folder);
		const cal = this.calendars.get(calendarId ?? world?.calendar ?? this.index.calendarFor(folder));
		const fromWorld = world?.today ? parseDate(world.today, cal) : null;
		if (fromWorld) return fromWorld.start;
		const saved = this.settings.currentDates[cal.id];
		if (typeof saved === "number") return saved;
		if (cal.id === "gregorian") {
			const now = new Date();
			return daysFromCivil(now.getFullYear(), now.getMonth() + 1, now.getDate());
		}
		return undefined;
	}

	private knownCache = new Map<string, Set<string>>();
	private knownVersion = -1;

	/** Fog of war: everything a person could know about by a day (cached until the notes change). */
	knownTo(person: string, at?: number): Set<string> {
		if (this.knownVersion !== this.index.version) {
			this.knownCache.clear();
			this.knownVersion = this.index.version;
		}
		const id = `${person}|${at ?? ""}`;
		let set = this.knownCache.get(id);
		if (!set) {
			set = knownTo(this.index, person, { at });
			this.knownCache.set(id, set);
		}
		return set;
	}

	/**
	 * A window opened from another (the calendar editor from Settings) belongs on top of it. Some
	 * themes give Obsidian's own windows a high z-index, and a later window then opens underneath;
	 * so each new one is lifted above whatever is already open.
	 */
	private keepNewModalsOnTop() {
		const z = (el: Element) => {
			const v = Number.parseInt(getComputedStyle(el).zIndex, 10);
			return Number.isFinite(v) ? v : 0;
		};
		const observer = new MutationObserver((records) => {
			for (const r of records) {
				for (const node of Array.from(r.addedNodes)) {
					if (!(node.instanceOf(HTMLElement)) || !node.classList.contains("modal-container")) continue;
					const others = Array.from(document.body.querySelectorAll(":scope > .modal-container")).filter((c) => c !== node);
					if (!others.length) continue;
					// Themes may raise the container or the window inside it: beat both.
					let top = 0;
					for (const c of others) {
						top = Math.max(top, z(c));
						for (const m of Array.from(c.querySelectorAll(":scope > .modal, :scope > .modal-bg"))) top = Math.max(top, z(m));
					}
					if (z(node) <= top) node.style.zIndex = String(top + 1);
				}
			}
		});
		observer.observe(document.body, { childList: true });
		this.register(() => observer.disconnect());
	}

	private realmCache = new Map<string, RealmTree>();
	private realmVersion = -1;

	/** Who holds what and under whom, by a day (cached until the notes change). */
	realms(at?: number): RealmTree {
		if (this.realmVersion !== this.index.version) {
			this.realmCache.clear();
			this.realmVersion = this.index.version;
		}
		const id = String(at ?? "");
		let tree = this.realmCache.get(id);
		if (!tree) {
			tree = realmTree(this.index, (c) => isHouse(this, c), at, tierWordsWith(this.settings.tierWords), { ...DEFAULT_REGION_WORDS, ...tierWords(this.settings.regionWords ?? "") });
			// Playing through time asks for a tree a frame: keep the latest few, not every one.
			if (this.realmCache.size >= 24) this.realmCache.delete(this.realmCache.keys().next().value as string);
			this.realmCache.set(id, tree);
		}
		return tree;
	}

	/** The chain of causes behind an event and what it led to. */
	openCauses(key?: string) {
		new CauseChainModal(this, key).open();
	}

	/**
	 * Where a span with no end stops being drawn: the current date, for things still going (written
	 * open, a group with no end, a person born within a long lifetime of it). Undefined: draw as before.
	 */
	openEndOf(e: Entity): number | undefined {
		if (!this.settings.openEndsToToday || e.end || !e.start) return undefined;
		const today = this.todayFor(e.folder, e.calendar);
		if (today === undefined || today <= e.start.start) return undefined;
		const still = e.openEnd || e.type === "culture" || (e.type === "person" && today - e.start.start < 110 * 365.25) || (e.type === "place" && !!e.start);
		return still ? today : undefined;
	}

	/** Sets today in a world: on its world note when it has one, otherwise in the settings. */
	async setToday(folder: string, calendarId: string, day: number) {
		const cal = this.calendars.get(calendarId);
		const world = this.index.worldFor(folder);
		const file = world && this.app.vault.getAbstractFileByPath(world.path);
		if (file instanceof TFile) {
			await this.editFrontmatter(file, (f) => {
				f.today = formatDay(day, cal);
			}, "Change today's date");
		} else {
			this.settings.currentDates = { ...this.settings.currentDates, [cal.id]: day };
			await this.saveSettings();
		}
		this.index.trigger("changed");
	}

	/** Opens a world's world note, creating it (filled in from the current settings) if there isn't one. */
	async openWorldNote(folder: string) {
		const existing = this.index.worlds.get(folder);
		const found = existing ? this.app.vault.getAbstractFileByPath(existing.path) : null;
		const file = found instanceof TFile ? found : await this.ensureWorldNote(folder);
		await this.app.workspace.getLeaf(false).openFile(file);
		if (!existing) new Notice(`Made a world note for ${folder || this.app.vault.getName()}. Its settings now apply to every note in ${folder || "the vault"}.`);
	}

	/** The world settings window (creating the world note when the world has none). */
	editWorld(folder: string) {
		new WorldSettingsModal(this, folder).open();
	}

	/** A world's world note, made (filled in from the current settings) if it has none. */
	async ensureWorldNote(folder: string): Promise<TFile> {
		const existing = this.index.worlds.get(folder);
		const had = existing && this.app.vault.getAbstractFileByPath(existing.path);
		if (had instanceof TFile) return had;
		const name = folder ? folder.split("/").pop()! : this.app.vault.getName();
		const cal = this.calendars.get(this.index.calendarFor(folder));
		const map = this.index.all("map").find((m) => !folder || m.path.startsWith(folder + "/"));
		const today = this.todayFor(folder, cal.id);
		const lines = [
			"---",
			"type: world",
			`calendar: ${cal.id}`,
			`today: ${today !== undefined ? formatDay(today, cal) : ""}`,
			`map: ${map ? `"[[${map.name}]]"` : ""}`,
			"travel: foot 30, horse 60, wagon 35, boat 60, ship 150",
			`succession: ${this.settings.successionRule}`,
			`person-relations: ${presetKinds("person", this.settings.relationPresets.person).join(", ")}`,
			`group-relations: ${presetKinds("culture", this.settings.relationPresets.culture).join(", ")}`,
			"---",
			"",
			`# ${name}`,
			"",
			"This note sets up the world for everything in this folder: its calendar, today's date in the story (the calendar's *Today*), its main map, how far people travel in a day (km), how houses inherit (absolute, male-preference or agnatic), and which relationships new people and groups start with.",
			"",
		];
		const path = normalizePath(`${folder ? folder + "/" : ""}${name} world.md`);
		const found = this.app.vault.getAbstractFileByPath(path);
		return found instanceof TFile ? found : await this.app.vault.create(path, lines.join("\n"));
	}

	/** API for Dataview / Templater / other plugins: app.plugins.plugins["universe-view"].api */
	get api() {
		const idx = this.index;
		const find = (nameOrPath: string) => idx.findByName(nameOrPath);
		return {
			entities: (type?: EntityType) => idx.all(type),
			get: find,
			children: (name: string) => idx.children(find(name)?.key ?? "").map((k) => idx.get(k)).filter(Boolean),
			parents: (name: string) => find(name)?.parents ?? [],
			partners: (name: string) => idx.partners(find(name)?.key ?? ""),
			siblings: (name: string) => idx.siblings(find(name)?.key ?? "").map((k) => idx.get(k)).filter(Boolean),
			events: (name: string) => idx.events(find(name)?.key ?? ""),
			members: (name: string) => idx.members(find(name)?.key ?? ""),
			parseDate: (value: unknown, calendar?: string) => this.parseDate(value, calendar),
			formatDate: (d: ChronDate) => formatDate(d, this.calendars.get(d.calendar)),
		};
	}

	// ---- Opening views ---------------------------------------------------------------------------

	/** Opens a view: reusing an open one, or in a new tab / split beside the current one. */
	async activateView(type: string, state: Record<string, unknown> = {}, where: false | "tab" | "split" = false): Promise<WorkspaceLeaf> {
		const { workspace } = this.app;
		// Views live in the dashboard: links, menus and commands open them on their tab there.
		if (!where && hostedInHub(this, type)) {
			let hub = workspace.getLeavesOfType(VIEW_HUB)[0];
			if (!hub) {
				hub = workspace.getLeaf("tab");
				await hub.setViewState({ type: VIEW_HUB, active: true });
			}
			await hub.loadIfDeferred();
			await workspace.revealLeaf(hub);
			await (hub.view as HubView).openModule(type, state);
			return hub;
		}
		let leaf = where ? null : workspace.getLeavesOfType(type)[0];
		if (!leaf) leaf = workspace.getLeaf(where === "split" ? "split" : "tab");
		await leaf.setViewState({ type, active: true, state });
		await workspace.revealLeaf(leaf);
		return leaf;
	}

	async openTimeline(opts: { focus?: string; filter?: EntityFilter } = {}) {
		const leaf = await this.activateView(VIEW_TIMELINE, opts.filter ? { options: { filter: opts.filter } } : {});
		if (opts.focus) window.setTimeout(() => (leaf.view as TimelineView).focus?.(opts.focus!), 60);
	}

	async openFamilyTree(key?: string) {
		await this.activateView(VIEW_FAMILY, key ? { options: { root: key } } : {});
	}

	async openNetwork(focus?: string) {
		await this.activateView(VIEW_NETWORK, focus ? { options: { focus } } : {});
	}

	async openLineage(focus?: string) {
		await this.activateView(VIEW_LINEAGE, focus ? { options: { focus, selected: focus } } : {});
	}

	/**
	 * A link to a note that can't be mistaken for another of the same name (Washington the state, Washington
	 * the town): its name when that's unique, else as much of its path as Obsidian needs.
	 */
	wikilink(key: string, fromPath = ""): string {
		const file = this.app.vault.getAbstractFileByPath(key);
		const name = this.index.get(key)?.name ?? key.replace(/\.md$/, "").split("/").pop() ?? key;
		if (!(file instanceof TFile)) return `[[${name}]]`;
		const cache = this.app.metadataCache as unknown as { fileToLinktext?: (f: TFile, from: string, omitMd?: boolean) => string };
		const text = cache.fileToLinktext?.(file, fromPath, true) ?? file.basename;
		return text === file.basename || text.split("/").pop() !== file.basename ? `[[${text}]]` : `[[${text}|${file.basename}]]`;
	}

	/** Realms: a title's realm tree, or a house's dynasty. */
	async openRealms(key?: string) {
		await this.activateView(VIEW_REALMS, key ? { select: key } : {});
	}

	/** The realms view, on the tree that fits the note: a title's realm, a house's dynasty, or an organisation. */
	async openOrgChart(root?: string) {
		const e = root ? this.index.get(root) : undefined;
		const mode = !e ? undefined : e.type === "culture" && isHouse(this, e) ? "dynasties" : this.realms().nodes.has(e.key) ? "realms" : "orgs";
		await this.activateView(VIEW_ORG, root ? { options: { root, folder: "", mode } } : {});
	}

	/** Opens the dashboard with a note or folder picked. */
	async openDashboard(path?: string) {
		await this.activateView(VIEW_EXPLORER, path ? { select: path } : {});
	}

	/**
	 * Writes skipped-notes.json in the plugin's folder: every note the index doesn't have, what
	 * Obsidian reports about it, and what reading it again gives (a type now means the index was stale).
	 */
	async reportSkipped() {
		const idx = this.index;
		const notes = this.app.vault.getMarkdownFiles().filter((f) => !idx.get(f.path)).map((f) => {
			const cache = this.app.metadataCache.getFileCache(f);
			let now: string;
			try {
				now = idx.readFile(f)?.type ?? "no type";
			} catch (err) {
				now = `error: ${err}`;
			}
			return { path: f.path, template: idx.isTemplate(f.path), cached: !!cache, properties: Object.keys(cache?.frontmatter ?? {}), tags: cache ? getAllTags(cache) : null, readNow: now };
		});
		const out = { version: this.manifest.version, ready: idx.ready, indexed: idx.all().length, notes: idx.all().length + notes.length, skipped: notes };
		const path = normalizePath(`${this.manifest.dir}/skipped-notes.json`);
		await this.app.vault.adapter.write(path, JSON.stringify(out, null, "\t"));
		const stale = notes.filter((n) => !n.template && n.readNow !== "no type").length;
		new Notice(`UniverseView ${this.manifest.version}: ${notes.length} notes skipped${stale ? `, ${stale} of them readable now` : ""}. Written to ${path}.`, 10000);
	}

	/** Opens a note in the view that suits it: people in the family tree, groups in the org chart, places on the map. */
	async openBest(key: string) {
		const e = this.index.get(key);
		if (!e) return;
		if (e.type === "person") await this.openFamilyTree(key);
		else if (e.type === "culture") await this.openOrgChart(key);
		else if (e.type === "place" || e.type === "map") await this.openMap(key);
		else await this.openTimeline({ focus: key });
	}

	/** Asks which world to export, then writes a .ged file into "UniverseView exports". */
	exportGedcomPrompt() {
		const scopes = ["", ...this.index.topFolders()];
		class ScopeModal extends SuggestModal<string> {
			constructor(readonly plugin: ChroniclePlugin) {
				super(plugin.app);
			}
			getSuggestions(q: string) {
				return scopes.filter((s) => (s || "whole vault").toLowerCase().includes(q.toLowerCase()));
			}
			renderSuggestion(s: string, elx: HTMLElement) {
				const n = this.plugin.index.all("person").filter((p) => !s || p.path.startsWith(s + "/")).length;
				elx.setText(`${s || "Whole vault"} (${n} people)`);
			}
			onChooseSuggestion(s: string) {
				void this.plugin.exportGedcom(s);
			}
		}
		const m = new ScopeModal(this);
		m.setPlaceholder("Export the family tree of which folder?");
		m.open();
	}

	async exportGedcom(folder: string) {
		const people = this.index.all("person").filter((p) => !folder || p.path.startsWith(folder + "/"));
		if (!people.length) {
			new Notice("No people to export there.");
			return;
		}
		const text = buildGedcom({
			people,
			get: (k) => this.index.get(k),
			partners: (k) => this.index.partners(k),
			calendar: (id) => this.calendars.get(id),
		});
		const { vault } = this.app;
		if (!vault.getAbstractFileByPath("UniverseView exports")) await vault.createFolder("UniverseView exports");
		const path = normalizePath(`UniverseView exports/${folder ? folder.replace(/\//g, " - ") : "Vault"} family tree.ged`);
		const existing = vault.getAbstractFileByPath(path);
		if (existing instanceof TFile) await vault.modify(existing, text);
		else await vault.create(path, text);
		const fictional = people.some((p) => p.calendar !== "gregorian" && (p.start || p.end));
		new Notice(`Exported ${people.length} people to ${path}.${fictional ? " Dates in fictional calendars are kept as text, since genealogy apps only understand real dates." : ""}`, 10000);
	}

	/** Asks which world (top folder) to work on, or the whole vault. */
	pickWorld(placeholder: string, run: (world: string | undefined) => void) {
		const worlds = this.index.topFolders();
		if (worlds.length < 2) {
			run(undefined);
			return;
		}
		class WorldModal extends SuggestModal<string> {
			constructor(readonly plugin: ChroniclePlugin) {
				super(plugin.app);
			}
			getSuggestions(q: string) {
				return ["", ...worlds].filter((s) => (s || "whole vault").toLowerCase().includes(q.toLowerCase()));
			}
			renderSuggestion(s: string, elx: HTMLElement) {
				const n = this.plugin.index.all().filter((e) => !s || e.path.startsWith(s + "/")).length;
				elx.setText(`${s || "Whole vault"} (${n} notes)`);
			}
			onChooseSuggestion(s: string) {
				run(s || undefined);
			}
		}
		const m = new WorldModal(this);
		m.setPlaceholder(placeholder);
		m.open();
	}

	settingTab?: ChronicleSettingTab;
	private ribbonButtons = new Map<string, HTMLElement>();
	private syncExplorerButton?: () => void;

	/** Whether a module of the dashboard is switched on. */
	moduleOn(id: string): boolean {
		return !this.settings.modulesOff.includes(id);
	}

	/** Switches a module on or off, everywhere it shows. */
	async setModule(id: string, on: boolean) {
		const off = this.settings.modulesOff.filter((x) => x !== id);
		this.settings.modulesOff = on ? off : [...off, id];
		this.ribbonButtons.get(id)?.toggle(on);
		if (id === VIEW_FILES) {
			if (on) await this.openFilesPanel();
			else this.app.workspace.detachLeavesOfType(VIEW_FILES);
			this.syncExplorerButton?.();
		}
		await this.saveSettings();
	}

	/** Opens the file tree in the left sidebar, beside Obsidian's own. */
	async openFilesPanel(reveal = true) {
		const { workspace } = this.app;
		let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(VIEW_FILES)[0] ?? null;
		if (!leaf) {
			leaf = workspace.getLeftLeaf(false);
			await leaf?.setViewState({ type: VIEW_FILES });
		}
		if (leaf && reveal) await workspace.revealLeaf(leaf);
	}

	/** The settings tab to show next time UniverseView's settings open. */
	settingsTabRequest?: string;

	/** Opens UniverseView's settings, on one of its tabs (appearance, notes, time, maps). */
	openSettings(tab?: string) {
		this.settingsTabRequest = tab;
		const setting = (this.app as unknown as { setting?: { open?(): void; openTabById?(id: string): void } }).setting;
		setting?.open?.();
		setting?.openTabById?.(this.manifest.id);
	}


	/** Shows a note in the inspector panel (opening it in the right sidebar if needed). */
	/** The Quick creator, in the inspector. */
	async quickCreate(world?: string) {
		await this.inspect();
		(this.app.workspace.getLeavesOfType(VIEW_INSPECTOR)[0]?.view as InspectorView | undefined)?.startCreating(world);
	}

	async inspect(key?: string, tab?: "about" | "realm" | "edit") {
		const ws = this.app.workspace;
		let leaf = ws.getLeavesOfType(VIEW_INSPECTOR)[0];
		if (!leaf) {
			leaf = ws.getRightLeaf(false) ?? ws.getLeaf("split");
			await leaf.setViewState({ type: VIEW_INSPECTOR, active: true, state: { key, tab } });
		} else if (key) await leaf.setViewState({ type: VIEW_INSPECTOR, state: { key, tab } });
		void ws.revealLeaf(leaf);
	}

	openKinship(a?: string, b?: string) {
		new KinshipModal(this, a, b).open();
	}

	openSuccession(key?: string) {
		new SuccessionModal(this, key).open();
	}

	/** Opens the map the place belongs on (or the current one) and waits for a click to put it there. */
	async placeOnMap(key: string) {
		const e = this.index.get(key);
		const map = e?.map?.key ?? (this.index.all("place").some((p) => p.coords) ? WORLD_MAP : this.index.all("map")[0]?.key);
		const leaf = await this.activateView(VIEW_MAP, map ? { options: { map } } : {});
		window.setTimeout(() => (leaf.view as MapView).placeNote?.(key), 120);
	}

	// ---- Saved views --------------------------------------------------------------------------------

	/** Saves the active UniverseView view (with its filters, focus, date…) under a name. */
	saveCurrentView(view?: ItemView) {
		const v = view ?? this.app.workspace.getActiveViewOfType(ItemView);
		const type = v?.getViewType();
		if (!v || !type?.startsWith("chronicle-")) {
			new Notice("Open a UniverseView view first.");
			return;
		}
		const state = v.getState();
		new TextPrompt(this, "Name for this view", v.getDisplayText(), (name) => {
			const list = this.settings.savedViews.filter((s) => s.name.toLowerCase() !== name.toLowerCase());
			list.push({ name, type, state: structuredClone(state) });
			this.settings.savedViews = list.sort((a, b) => a.name.localeCompare(b.name));
			void this.saveSettings().then(() => {
				const link = `obsidian://universe-view?vault=${encodeURIComponent(this.app.vault.getName())}&view=${encodeURIComponent(name)}`;
				clickNotice(`Saved “${name}”. Open it from the command “Open a saved view”, or click here to copy a link to put in a note.`, 10000, () => {
					void navigator.clipboard?.writeText(`[${name}](${link})`);
					new Notice("Copied a link to the view.");
				});
			});
		}).open();
	}

	async openSavedView(name: string) {
		const v = this.settings.savedViews.find((s) => s.name.toLowerCase() === name.toLowerCase());
		if (!v) {
			new Notice(`No saved view called “${name}”.`);
			return;
		}
		await this.activateView(v.type, structuredClone(v.state), "tab");
	}

	pickSavedView() {
		class ViewsModal extends SuggestModal<SavedView> {
			constructor(readonly plugin: ChroniclePlugin) {
				super(plugin.app);
			}
			getSuggestions(q: string) {
				return this.plugin.settings.savedViews.filter((s) => s.name.toLowerCase().includes(q.toLowerCase()));
			}
			renderSuggestion(s: SavedView, elx: HTMLElement) {
				elx.createDiv({ text: s.name });
				elx.createDiv({ text: VIEWS.find((x) => x.type === s.type)?.name ?? s.type, cls: "chronicle-suggest-sub" });
			}
			onChooseSuggestion(s: SavedView, evt: MouseEvent | KeyboardEvent) {
				const plugin = this.plugin;
				if (evt.shiftKey) {
					plugin.settings.savedViews = plugin.settings.savedViews.filter((x) => x !== s);
					void plugin.saveSettings().then(() => new Notice(`Deleted the saved view “${s.name}”.`));
				} else void plugin.openSavedView(s.name);
			}
		}
		if (!this.settings.savedViews.length) {
			new Notice("No saved views yet. Use the bookmark button in a UniverseView view's toolbar.");
			return;
		}
		const m = new ViewsModal(this);
		m.setPlaceholder("Open a saved view (Shift+Enter deletes it)");
		m.open();
	}

	/** Plays a war through on the map. */
	async playWar(key: string) {
		const leaf = await this.activateView(VIEW_MAP, {});
		window.setTimeout(() => (leaf.view as MapView).playWar?.(key), 120);
	}

	/** Keeps ground a realm holds for a while, drawn apart from its borders. */
	async saveFront(key: string, mapKey: string, points: [number, number][], from: string, to: string) {
		const file = this.app.vault.getAbstractFileByPath(key);
		if (!(file instanceof TFile)) return;
		const map = mapKey === WORLD_MAP ? "world" : `[[${this.index.get(mapKey)?.name ?? mapKey}]]`;
		await this.editFrontmatter(file, (front) => {
			const list = Array.isArray(front["occupied-areas"]) ? (front["occupied-areas"] as unknown[]) : [];
			front["occupied-areas"] = [...list, { map, points: writePoints(points), ...(from ? { from } : {}), ...(to ? { to } : {}) }];
		}, "Occupied area");
	}

	async deleteFront(key: string, index: number) {
		const file = this.app.vault.getAbstractFileByPath(key);
		if (!(file instanceof TFile)) return;
		await this.editFrontmatter(file, (front) => {
			const list = Array.isArray(front["occupied-areas"]) ? (front["occupied-areas"] as unknown[]).filter((_, i) => i !== index) : [];
			if (list.length) front["occupied-areas"] = list;
			else delete front["occupied-areas"];
		}, "Delete an occupied area");
	}

	async openMap(focus?: string) {
		const leaf = await this.activateView(VIEW_MAP, {});
		if (focus) window.setTimeout(() => (leaf.view as MapView).focus?.(focus), 60);
	}

	/** Takes a place's pin off the map (every way a pin is written); the note stays, and Undo puts it back. */
	async removePin(key: string) {
		const file = this.app.vault.getAbstractFileByPath(key);
		const e = this.index.get(key);
		if (!(file instanceof TFile) || !e) return;
		const pinKeys = ["position", "map-position", "pos", "xy", "coordinates", "coords", "latlng", "lat-lng", "custom_coordinates", "custom_coordinates_x", "custom_coordinates_y", "custom_coordinates_map", "coordinates_lat", "coordinates_long"];
		const aliases = buildFieldAliases(this.settings.fieldAliases);
		await this.editFrontmatter(file, (fm) => {
			for (const k of [...pinKeys, ...aliases.position, ...aliases.coordinates]) delete fm[k];
		}, `Removed ${e.name}'s pin`);
		new Notice(`Removed ${e.name}'s pin. Undo (Ctrl+Alt+Z) puts it back.`);
	}

	/** Deletes one area of a note on a map, at once; Undo puts it back. */
	async deleteArea(key: string, mapKey: string, n: number) {
		const name = this.index.get(key)?.name ?? "it";
		await this.saveTerritory(key, mapKey, n, null);
		new Notice(`Deleted an area of ${name}. Undo (Ctrl+Alt+Z) puts it back.`);
	}

	/**
	 * A new land under another: a tier smaller (a duchy's county, a region's sub-region), under it,
	 * and filed inside its folder note (made one if it isn't yet, unless new notes go in type folders).
	 */
	async createChildLand(parentKey: string, name: string): Promise<TFile | undefined> {
		const parent = this.index.get(parentKey);
		const parentFile = this.app.vault.getAbstractFileByPath(parentKey);
		if (!parent || !(parentFile instanceof TFile)) return undefined;
		const node = this.realms().nodes.get(parentKey);
		const region = node?.nature === "region";
		const tier = String(Math.min(6, Math.max(2, Math.round(node && node.rank < 9 ? node.rank : 3) + 1)));
		const fm: Record<string, unknown> = {
			tags: choiceTags({ nature: region ? "region" : "realm", tier, settlement: "City", landform: "", size: "" }),
		};
		fm[region ? "located-in" : "under"] = this.wikilink(parent.key);
		let folder = this.settings.newNoteFolders.place ?? "";
		if ((this.settings.placeNewNotes ?? "parent") !== "off") {
			const file = isFolderNote(parentFile) ? parentFile : await makeFolderNote(this, parentFile).catch(() => undefined);
			folder = file?.parent?.path ?? parentFile.parent?.path ?? folder;
		}
		const file = await this.createEntityNote(name.replace(/[\\/:*?"<>|#^[\]]/g, "-"), folder, fm, "place");
		new Notice(`Made ${name} inside ${parent.name}.`);
		return file;
	}

	/** Cuts one of a note's areas in two: it keeps one part, a new land under it takes the other. */
	async splitLand(parentKey: string, mapKey: string, n: number, keep: [number, number][], piece: [number, number][], name: string) {
		const parent = this.index.get(parentKey);
		if (!parent) return;
		// The parent's shape first, while it's still where the index knows it (it may move into a folder of its own next).
		await this.saveTerritory(parentKey, mapKey, n, keep);
		const file = await this.createChildLand(parentKey, name);
		if (!file) return;
		await this.saveTerritory(file.path, mapKey, null, piece);
		new Notice(`Split ${name} off ${parent.name}. Zoomed out it shows as part of ${parent.name}; zoom in or click it to see it apart.`);
	}

	/** Opens the map on a note and starts drawing its borders, or splitting a land off them. */
	async drawOnMap(key: string, how: DrawHow, n = 0, mapKey?: string) {
		const leaf = await this.activateView(VIEW_MAP, {});
		window.setTimeout(() => (leaf.view as MapView).draw?.(key, how, n, mapKey), 80);
	}

	private showViewMenu(evt?: MouseEvent, pos?: { x: number; y: number }) {
		const menu = new Menu();
		for (const v of VIEWS.filter((x) => this.moduleOn(x.type))) menu.addItem((i) => i.setTitle(v.name).setIcon(v.icon).onClick(() => void this.activateView(v.type)));
		menu.addSeparator();
		menu.addItem((i) => i.setTitle("Switch theme…").setIcon("swatch-book").onClick(() => {
			const r = this.app.workspace.containerEl.getBoundingClientRect();
			this.showThemeMenu(new MouseEvent("contextmenu", { clientX: r.left + r.width / 2 - 140, clientY: r.top + 120 }));
		}));
		menu.addItem((i) => i.setTitle("New note…").setIcon("plus").onClick(() => this.createEntityPrompt()));
		menu.addItem((i) => i.setTitle("Detect types & relationships…").setIcon("wand-2").onClick(() => new DetectModal(this).open()));
		menu.addItem((i) => i.setTitle("Check data").setIcon("shield-check").onClick(() => new ValidateModal(this).open()));
		if (evt) menu.showAtMouseEvent(evt);
		else menu.showAtPosition(pos ?? { x: 200, y: 120 });
	}

	// ---- Notes ---------------------------------------------------------------------------------------

	createEntityPrompt(prefill: CreatePrefill = {}) {
		if (prefill.scope === undefined) prefill.scope = this.inferScope(prefill);
		new CreateEntityModal(this, prefill).open();
	}

	/**
	 * Vaults with one folder per world ("Vael/People", "Vael/Places"…) should get new notes in the
	 * same world as the notes they link to. Type folders at the top level ("People/") are not worlds.
	 */
	private inferScope(p: CreatePrefill): string | undefined {
		const typeFolders = new Set(Object.values(this.settings.newNoteFolders).map((f) => f.split("/")[0].toLowerCase()));
		const keys = [...(p.places ?? []), ...(p.parents ?? []), ...(p.participants ?? []), ...(p.cultures ?? []), ...(p.map ? [p.map] : [])]
			.map((n) => this.index.findByName(n)?.key)
			.concat(p.childOf ? [p.childOf] : []);
		for (const key of keys) {
			if (!key?.includes("/")) continue;
			const top = key.split("/")[0];
			if (!typeFolders.has(top.toLowerCase())) return top;
		}
		return undefined;
	}

	async createEntityNote(name: string, folder: string, fm: Record<string, unknown>, type: EntityType, open = true): Promise<TFile> {
		const { vault } = this.app;
		const dir = normalizePath(folder.trim() || "/");
		if (dir !== "/" && !vault.getAbstractFileByPath(dir)) await vault.createFolder(dir);
		const prefix = dir === "/" ? "" : dir + "/";
		let path = normalizePath(`${prefix}${name}.md`);
		for (let i = 2; vault.getAbstractFileByPath(path); i++) path = normalizePath(`${prefix}${name} ${i}.md`);

		let body = "";
		const templatePath = this.settings.templates[type];
		if (templatePath) {
			const t = vault.getAbstractFileByPath(normalizePath(templatePath.endsWith(".md") ? templatePath : templatePath + ".md"));
			if (t instanceof TFile) body = await vault.read(t);
			else new Notice(`Template “${templatePath}” not found; creating an empty note.`);
		}
		const file = await vault.create(path, body);
		if (body.includes("<%")) {
			try {
				await templater(this.app)?.templater?.overwrite_file_commands?.(file);
			} catch (err) {
				console.warn("UniverseView: Templater could not process the template", err);
			}
		}
		await this.app.fileManager.processFrontMatter(file, (front: Record<string, unknown>) => {
			this.applyType(front, type);
			for (const [k, v] of Object.entries(fm)) {
				if (k === "__kind") continue;
				// Tags join the template's and the type tag rather than replacing them.
				if (k === "tags" && Array.isArray(v)) {
					const have = ([] as unknown[]).concat(front.tags ?? []).map((x) => String(x));
					front.tags = [...have, ...v.map(String).filter((x) => !have.some((h) => h.toLowerCase() === x.toLowerCase()))];
					continue;
				}
				// An empty list never wipes out what the template already filled in.
				if (Array.isArray(v) && !v.length && k in front) continue;
				front[k] = v;
			}
			// A realm or a house: its kind, marked the way this vault marks kinds (a tag or `kind:`).
			if (typeof fm.__kind === "string" && fm.__kind) this.setKindMark(front, undefined, fm.__kind);
			// One kind tag per type: a real kind replaces the default one applyType gave it.
			if (Array.isArray(front.tags)) front.tags = tidyKinds(front.tags.map(String), this.settings.tagPrefix.replace(/^#/, "").replace(/\/$/, ""));
			// Relationship properties ready to fill in, unless the template has them under another name.
			if (this.settings.presetRelations && (type === "person" || type === "culture")) {
				const have = new Set(Object.keys(front).map((k) => relKind(k)?.key ?? k.toLowerCase()));
				for (const k of presetKinds(type, this.index.worldFor(dir === "/" ? "" : dir)?.presets[type] || this.settings.relationPresets[type])) {
					if (!have.has(relKind(k)?.key ?? k.toLowerCase())) front[k] = [];
				}
			}
		});
		if (open) await this.app.workspace.getLeaf(false).openFile(file);
		return file;
	}

	/** Marks a note's type the way this vault does: a property, a tag, or Charted Roots' cr_type. */
	applyType(front: Record<string, unknown>, type: EntityType) {
		const style = this.settings.typeStyle;
		if (style === "tag" && this.settings.tagTypes) {
			const prefix = this.settings.tagPrefix.replace(/^#/, "").replace(/\/$/, "");
			// The tag scheme's kind tag, with the type's default kind until one is set (#Character_Person).
			const tags = ([] as unknown[]).concat(front.tags ?? []).filter((t) => t !== null && t !== "").map(String);
			if (!tags.some((t) => typeFromTag(t, this.settings.tagPrefix, this.settings.typeTags) === type)) front.tags = [(prefix ? `${prefix}/` : "") + kindTag(type), ...tags];
		} else if (style === "cr_type") {
			front.cr_type = type === "culture" ? "organization" : type;
		} else {
			front[this.fieldName("type")] = type;
		}
		// Whatever the style, the note must read as this type afterwards: a property always does.
		if (this.markedType(front) !== type) front[this.fieldName("type")] = type;
	}

	/** How this vault marks types, for `markedType`. */
	private get typeMarks(): TypeMarks {
		const s = this.settings;
		return { keys: [...buildFieldAliases(s.fieldAliases).type, "cr_type"], tags: s.tagTypes, prefix: s.tagPrefix, custom: s.typeTags };
	}

	/** The type a note's properties and tags give it (folder rules aside). */
	markedType(front: Record<string, unknown>): EntityType | null {
		return markedType(front, this.typeMarks);
	}

	/**
	 * Sets or clears a note's type the way this vault marks types, removing the other marks
	 * (a `type:` property, a type tag, Charted Roots' `cr_type`) so they can't disagree.
	 */
	setTypeMark(front: Record<string, unknown>, type: EntityType | null) {
		const tagType = (t: string): EntityType | undefined => typeFromTag(t, this.settings.tagPrefix, this.settings.typeTags) ?? undefined;
		const tags = ([] as unknown[]).concat(front.tags ?? []).filter((t) => t !== null && t !== "").map(String);
		const usesTag = tags.some((t) => tagType(t));
		const typeKeys = ["type", this.fieldName("type"), "cr_type"];
		const style = "cr_type" in front ? "cr_type" : usesTag && !typeKeys.some((k) => k in front) ? "tag" : typeKeys.some((k) => k in front) ? "property" : this.settings.typeStyle;
		// Drop marks that say something else; keep ones that agree (a #City tag on a place stays).
		const kept = tags.filter((t) => !tagType(t) || tagType(t) === type);
		if (kept.length !== tags.length) {
			if (kept.length) front.tags = kept;
			else delete front.tags;
		}
		for (const k of typeKeys) {
			const v = front[k];
			if (typeof v !== "string") continue;
			const t = normalizeType(v);
			if (t && t !== type) delete front[k];
		}
		if (!type) return;
		const agrees = kept.some((t) => tagType(t) === type) || typeKeys.some((k) => typeof front[k] === "string" && normalizeType(front[k]) === type);
		if (agrees) return;
		const saved = this.settings.typeStyle;
		this.settings.typeStyle = style;
		this.applyType(front, type);
		this.settings.typeStyle = saved;
	}

	/**
	 * Sets or clears a note's kind ("city", "house"…). A kind given by a tag (#City) is renamed in
	 * place, keeping the vault's tag style; otherwise it goes in the `kind:` property (or the
	 * property the note already uses).
	 */
	setKindMark(front: Record<string, unknown>, current: string | undefined, kind: string | null) {
		const type = this.markedType(front);
		const prefix = this.settings.tagPrefix.replace(/^#/, "").replace(/\/$/, "");
		const tags = ([] as unknown[]).concat(front.tags ?? []).filter((t) => t !== null && t !== "").map(String);
		// The kind tag of the tag scheme (#Place_County), else an older tag that says the current kind (#City).
		const schemeIdx = type ? tags.findIndex((t) => {
			const p = parseTag(t, prefix);
			return p?.role === "kind" && p.type === type;
		}) : -1;
		const tagIdx = schemeIdx >= 0 ? schemeIdx : current ? tags.findIndex((t) => t.replace(/^#/, "").split("/").pop()?.toLowerCase() === current) : -1;
		const propKey = CATEGORY_KEYS.find((k) => typeof front[k] === "string");
		// Notes that keep their kind in a tag get the scheme's kind tag; a cleared kind is the type's default (#Place_Other).
		const tagStyle = !!type && (tagIdx >= 0 || (!propKey && this.settings.typeStyle === "tag"));
		if (tagStyle && type) {
			const next = (prefix ? `${prefix}/` : "") + kindTag(type, kind ?? undefined);
			if (tagIdx >= 0) tags[tagIdx] = next;
			else tags.unshift(next);
			front.tags = tidyKinds(tags, prefix);
		}
		// A property that says the kind follows too, so a tag and a property never disagree.
		if (propKey || !tagStyle) {
			if (kind) front[propKey ?? "kind"] = kind;
			else if (propKey) delete front[propKey];
		}
		// The kind's tag may have been all that marked the note's type (#City on a place): keep the type.
		if (type && this.markedType(front) !== type) this.applyType(front, type);
	}

	// ---- Undo --------------------------------------------------------------------------------------

	private history: UndoStep[] = [];
	private openStep?: UndoStep;
	/** The history is kept beside the plugin, on this device only: it isn't a setting, and Sync leaves it alone. */
	private get historyPath() {
		return `${this.manifest.dir}/undo-history.json`;
	}
	private saveHistorySoon = debounce(() => void this.app.vault.adapter.write(this.historyPath, writeHistory(this.history)).catch((err) => console.error("UniverseView: couldn't save the undo history", err)), 1500, true);

	private async loadHistory() {
		if (!(await this.app.vault.adapter.exists(this.historyPath))) return;
		this.history = [...readHistory(await this.app.vault.adapter.read(this.historyPath)), ...this.history];
	}

	private historyChanged() {
		this.app.workspace.trigger("chronicle:history-changed");
		this.saveHistorySoon();
	}

	/** Every UniverseView edit to a note's properties goes through here, so it can be undone. */
	async editFrontmatter(file: TFile, fn: (front: Record<string, unknown>) => void, label = "Edit") {
		await this.app.fileManager.processFrontMatter(file, (front: Record<string, unknown>) => {
			const before = structuredClone(front);
			fn(front);
			const changes = changesBetween(before, front);
			if (!Object.keys(changes).length) return;
			if (this.openStep) addToStep(this.openStep, file.path, changes);
			else remember(this.history, { label, at: Date.now(), notes: [{ path: file.path, before: changes }] });
		});
		this.historyChanged();
	}

	/** An edit to a note's text below its properties (tags written in the text), undoable like the rest. */
	async editBody(file: TFile, fn: (body: string) => string, label = "Edit") {
		let changed = false;
		await this.app.vault.process(file, (text) => {
			const [front, body] = splitBody(text);
			const next = fn(body);
			if (next === body) return text;
			changed = true;
			const step = this.openStep ?? { label, at: Date.now(), notes: [] };
			addBodyToStep(step, file.path, body, next);
			if (!this.openStep) remember(this.history, step);
			return front + next;
		});
		if (changed) this.historyChanged();
	}

	/** Runs several edits as one undo step. */
	async undoGroup(label: string, run: () => Promise<void>) {
		const step: UndoStep = { label, at: Date.now(), notes: [] };
		this.openStep = step;
		try {
			await run();
		} finally {
			this.openStep = undefined;
			if (step.notes.length) remember(this.history, step);
			this.historyChanged();
		}
	}

	/** The undo steps, newest first: what each did, when, and which notes it touched. */
	undoSteps(): { label: string; at: number; paths: string[] }[] {
		return [...this.history].reverse().map((s) => ({ label: s.label, at: s.at, paths: s.notes.map((n) => n.path) }));
	}

	/** Undoes the last count steps, newest first. */
	async undoMany(count: number) {
		for (let i = 0; i < count && this.history.length; i++) await this.undo();
	}

	get undoLabel(): string | undefined {
		return this.history[this.history.length - 1]?.label;
	}

	/** Puts back the properties of the notes changed by the last UniverseView edit. */
	async undo() {
		const step = this.history.pop();
		if (!step) {
			new Notice("Nothing to undo.");
			return;
		}
		const missed: string[] = [];
		for (const n of [...step.notes].reverse()) {
			const f = this.app.vault.getAbstractFileByPath(n.path);
			try {
				if (!(f instanceof TFile)) throw new Error("note not found");
				// The text goes back only if it's as the step left it: later writing is never overwritten.
				const body = n.body;
				if (body) {
					let kept = false;
					await this.app.vault.process(f, (text) => {
						const [front, now] = splitBody(text);
						if (now !== body.after) return text;
						kept = true;
						return front + body.before;
					});
					if (!kept) missed.push(n.path.split("/").pop() ?? n.path);
				}
				if (Object.keys(n.before).length) await this.app.fileManager.processFrontMatter(f, (front: Record<string, unknown>) => restoreFront(front, n.before));
			} catch (err) {
				console.error("UniverseView: couldn't undo", n.path, err);
				missed.push(n.path.split("/").pop() ?? n.path);
			}
		}
		new Notice(missed.length ? `Undid: ${step.label}, except in ${missed.join(", ")}. Those notes couldn't be changed.` : `Undid: ${step.label}`);
		this.historyChanged();
	}

	/** Adds `parent` to the parents list of the person note `childKey`. */
	async addParentLink(childKey: string, parent: TFile) {
		const child = this.app.vault.getAbstractFileByPath(childKey);
		if (!(child instanceof TFile)) return;
		const aliases = buildFieldAliases(this.settings.fieldAliases).parents;
		await this.editFrontmatter(child, (front) => {
			const key = aliases.find((a) => a in front && ["parents", "parent"].includes(a.toLowerCase())) ?? this.fieldName("parents");
			const current = front[key];
			const list: unknown[] = Array.isArray(current) ? current : current ? [current] : [];
			list.push(`[[${parent.basename}]]`);
			front[key] = list;
		}, "Add parent");
	}

	/** Writes a place's location: coordinates on the world map, or map + position on an image map. */
	async setPlacePosition(key: string, mapKey: string, pos: [number, number], imageHeight = 0) {
		const file = this.app.vault.getAbstractFileByPath(key);
		if (!(file instanceof TFile)) return;
		const aliases = buildFieldAliases(this.settings.fieldAliases);
		const existing = (front: Record<string, unknown>, field: FieldName) => aliases[field].find((a) => a in front) ?? this.fieldName(field);
		await this.editFrontmatter(file, (front) => {
			// Notes managed by Charted Roots keep its format, so both plugins show the same pin.
			const chartedRoots = "cr_type" in front || "custom_coordinates_x" in front || "coordinates_lat" in front;
			if (chartedRoots) {
				if (mapKey === WORLD_MAP) {
					front.coordinates_lat = pos[0];
					front.coordinates_long = pos[1];
				} else {
					const map = this.index.get(mapKey);
					const mapId = typeof map?.props.map_id === "string" ? map.props.map_id : undefined;
					front.custom_coordinates_x = pos[0];
					front.custom_coordinates_y = imageHeight ? Math.round(imageHeight - pos[1]) : pos[1];
					if (mapId) {
						front.custom_coordinates_map = mapId;
						const maps: unknown[] = Array.isArray(front.maps) ? front.maps : front.maps ? [front.maps] : [];
						if (!maps.includes(mapId)) front.maps = [...maps, mapId];
					}
				}
				return;
			}
			if (mapKey === WORLD_MAP) {
				const mapField = aliases.map.find((a) => a in front);
				if (mapField) delete front[mapField];
				front[existing(front, "coordinates")] = pos;
			} else {
				const map = this.index.get(mapKey);
				front[existing(front, "map")] = `[[${map?.name ?? mapKey}]]`;
				front[existing(front, "position")] = pos;
			}
		}, `Move ${file.basename}`);
		syncAfterMapEdit(this, key, mapKey);
	}

	/**
	 * Adds, replaces (index) or removes (points null) one painted area in a note's `territory` list.
	 * Areas are stored as `{ map, points: "x,y x,y …" }` so several maps and islands fit in one note.
	 */
	async saveTerritory(key: string, mapKey: string, index: number | null, points: [number, number][] | null, more: [number, number][][] = []) {
		await this.saveShapes("territory", key, mapKey, index, points, more);
	}

	/**
	 * After the map picture is swapped for one of another size (or cropped): every pin, area, route and
	 * map note on that map is moved to match, x' = x·sx + dx and y' = y·sy + dy, and the new size noted.
	 */
	async rescaleMap(mapKey: string, sx: number, sy: number, dx = 0, dy = 0, newSize?: [number, number]) {
		const mapEntity = this.index.get(mapKey);
		if (!mapEntity) return;
		const mapRef = `[[${mapEntity.name}]]`;
		const fix = ([x, y]: [number, number]): [number, number] => [round2(x * sx + dx), round2(y * sy + dy)];
		const aliases = buildFieldAliases(this.settings.fieldAliases);
		let notes = 0;
		// One undo step, however many notes are on the map.
		await this.undoGroup(`Fit ${mapEntity.name} to its new picture`, async () => {
			for (const e of this.index.all()) {
				const file = this.app.vault.getAbstractFileByPath(e.path);
				if (!(file instanceof TFile)) continue;
				const onThis = (m: string) => m === mapKey || (m === "*" && e.map?.key === mapKey);
				const fronts = e.fronts ?? [];
				const hasShapes = [...e.territories, ...e.routes, ...fronts].some((t) => onThis(t.map));
				const hasPin = !!e.position && e.map?.key === mapKey;
				if (!hasShapes && !hasPin) continue;
				await this.editFrontmatter(file, (front) => {
					for (const [names, list] of [[["territory", "territories", "borders"], e.territories], [["routes", "route", "roads"], e.routes], [["occupied-areas"], fronts]] as const) {
						if (!list.some((t) => onThis(t.map))) continue;
						const field = names.find((k) => k in front) ?? names[0];
						front[field] = list.map((t) => ({
							map: t.map === "world" ? "world" : onThis(t.map) ? mapRef : `[[${this.index.get(t.map)?.name ?? t.map}]]`,
							points: writePoints(onThis(t.map) ? t.points.map(fix) : t.points),
							...(t.kind ? { kind: t.kind } : {}),
							...(t.name ? { name: t.name } : {}),
							...(t.fromText ? { from: t.fromText } : {}),
							...(t.toText ? { to: t.toText } : {}),
						}));
					}
					if (hasPin && e.position) {
						if ("custom_coordinates_x" in front) {
							front.custom_coordinates_x = round2(Number(front.custom_coordinates_x) * sx + dx);
							// Charted Roots counts y from the bottom: scaling keeps that, a shift reverses.
							front.custom_coordinates_y = round2(Number(front.custom_coordinates_y) * sy - dy);
						} else {
							const k = aliases.position.find((a) => a in front) ?? this.fieldName("position");
							front[k] = fix(e.position);
						}
					}
				});
				notes++;
			}
			// The map note's own drawings (sticky notes, arrows), and its new size.
			const mf = this.app.vault.getAbstractFileByPath(mapKey);
			if (mf instanceof TFile) {
				await this.editFrontmatter(mf, (front) => {
					if (Array.isArray(front.annotations)) {
						front.annotations = (front.annotations as Record<string, unknown>[]).map((a) => (typeof a?.points === "string" ? { ...a, points: writePoints(readPoints(a.points).map(fix)) } : a));
					}
					if (newSize) front["image-size"] = newSize;
				});
			}
		});
		new Notice(`Moved the pins and areas of ${notes} note${notes === 1 ? "" : "s"} to fit ${mapEntity.name}'s new image.`);
	}

	/**
	 * Borders that change over time. `change`: from `date` on, this area has new borders. The area as it
	 * is now ends at that date, and a copy starting then is added (returned as its number on this map)
	 * to be reshaped. `dates`: when this one area applies, written as `from:` and `to:` (empty clears).
	 */
	async shapeDates(key: string, mapKey: string, n: number, how: { change: string } | { dates: [string, string] }): Promise<number | undefined> {
		const file = this.app.vault.getAbstractFileByPath(key);
		const entity = this.index.get(key);
		if (!(file instanceof TFile) || !entity) return undefined;
		const mapRef = mapKey === WORLD_MAP ? "world" : `[[${this.index.get(mapKey)?.name ?? mapKey}]]`;
		let added: number | undefined;
		await this.editFrontmatter(file, (front) => {
			const field = ["territory", "territories", "borders"].find((k) => k in front) ?? "territory";
			const list: Record<string, unknown>[] = entity.territories.map((t) => ({
				map: t.map === "world" ? "world" : t.map === "*" ? mapRef : `[[${this.index.get(t.map)?.name ?? t.map}]]`,
				points: writePoints(t.points),
				...(t.kind ? { kind: t.kind } : {}),
				...(t.name ? { name: t.name } : {}),
				...(t.fromText ? { from: t.fromText } : {}),
				...(t.toText ? { to: t.toText } : {}),
			}));
			const onMap = list.map((t, i) => ({ t, i })).filter(({ t }) => t.map === mapRef || (mapKey === WORLD_MAP && t.map === "world"));
			const at = onMap[n]?.i;
			if (at === undefined) return;
			if ("change" in how) {
				const copy: Record<string, unknown> = { ...list[at], from: how.change };
				list[at] = { ...list[at], to: how.change };
				list.push(copy);
				added = onMap.length;
			} else {
				const [from, to] = how.dates.map((d) => d.trim());
				const next: Record<string, unknown> = { ...list[at] };
				delete next.from;
				delete next.to;
				if (from) next.from = from;
				if (to) next.to = to;
				list[at] = next;
			}
			front[field] = list;
		}, "change" in how ? `${entity.name}: new borders from ${how.change}` : `${entity.name}: dates of an area`);
		return added;
	}

	/**
	 * Adds, replaces (index) or removes (points null) one painted area or drawn route in a note's
	 * `territory` / `routes` list. Shapes are stored as `{ map, points: "x,y x,y …", kind? }` so several
	 * maps and islands fit in one note.
	 */
	async saveShapes(what: "territory" | "route", key: string, mapKey: string, index: number | number[] | null, points: [number, number][] | null, more: [number, number][][] = [], kind?: string) {
		const file = this.app.vault.getAbstractFileByPath(key);
		if (!(file instanceof TFile)) return;
		const mapRef = mapKey === WORLD_MAP ? "world" : `[[${this.index.get(mapKey)?.name ?? mapKey}]]`;
		const names = what === "territory" ? ["territory", "territories", "borders"] : ["routes", "route", "roads"];
		const label = points === null ? (Array.isArray(index) ? `Delete ${index.length} ${what === "territory" ? "areas" : "routes"}` : `Delete a ${what}`) : index === null ? `Add a ${what}` : `Edit a ${what}`;
		await this.editFrontmatter(file, (front) => {
			const field = names.find((k) => k in front) ?? names[0];
			const raw = front[field];
			// Normalise whatever was there into the list form.
			let list: Record<string, unknown>[] = [];
			const entity = this.index.get(key);
			if (entity) {
				list = (what === "territory" ? entity.territories : entity.routes).map((t) => ({
					map: t.map === "world" ? "world" : t.map === "*" ? mapRef : `[[${this.index.get(t.map)?.name ?? t.map}]]`,
					points: writePoints(t.points),
					...(t.kind ? { kind: t.kind } : {}),
					...(t.name ? { name: t.name } : {}),
					// Borders that change over time keep their dates.
					...(t.fromText ? { from: t.fromText } : {}),
					...(t.toText ? { to: t.toText } : {}),
				}));
			} else if (Array.isArray(raw)) list = raw as Record<string, unknown>[];
			// `index` counts only this map's shapes, as the map view numbers them.
			const onMap = list.map((t, i) => ({ t, i })).filter(({ t }) => t.map === mapRef || (mapKey === WORLD_MAP && t.map === "world"));
			const at = index === null || Array.isArray(index) ? -1 : onMap[index]?.i ?? -1;
			// Other lands on this map (with no dates of their own), for closing the gaps a new border leaves.
			const neighbours = what === "territory" && points ? this.index.all().filter((x) => x.key !== key).flatMap((x) => x.territories.filter((t) => (t.map === mapKey || t.map === "*") && !t.fromText && !t.toText && t.points.length >= 3).map((t) => t.points)) : [];
			const span = (() => {
				let [a, b, c, d] = [Infinity, Infinity, -Infinity, -Infinity];
				for (const r of neighbours) for (const [x, y] of r) [a, b, c, d] = [Math.min(a, x), Math.min(b, y), Math.max(c, x), Math.max(d, y)];
				return Number.isFinite(a) ? Math.max(c - a, d - b) : 0;
			})();
			const entry = (pts: [number, number][], keepFrom?: Record<string, unknown>) => {
				// A territory is always saved sound: whatever drew it, no spikes or loops get written, and no
				// small gaps left enclosed between it and its neighbours (they join it).
				const sound = what === "territory" ? absorbGaps(untangle(pts), neighbours, (span * 0.015) ** 2) : pts;
				const e: Record<string, unknown> = { map: mapRef, points: writePoints(sound.map(([a, b]) => [round2(a), round2(b)] as [number, number])) };
				const k = kind ?? keepFrom?.kind;
				if (k) e.kind = k;
				if (keepFrom?.name) e.name = keepFrom.name;
				if (keepFrom?.from) e.from = keepFrom.from;
				if (keepFrom?.to) e.to = keepFrom.to;
				return e;
			};
			if (points === null && Array.isArray(index)) {
				// Several at once, from the back so the positions stay right.
				const ats = index.map((n) => onMap[n]?.i ?? -1).filter((i) => i >= 0).sort((a, b) => b - a);
				for (const i of ats) list.splice(i, 1);
			} else if (points === null) {
				if (at >= 0) list.splice(at, 1);
			} else {
				if (at >= 0) list[at] = entry(points, list[at]);
				else list.push(entry(points));
			}
			// Extra areas (islands of one fill, pieces a brush left apart) are saved in the same write: the
			// index hasn't caught up between writes. Pieces of an area being edited keep its dates.
			const from = at >= 0 && points !== null ? list[at] : undefined;
			for (const pts of more) list.push(entry(pts, from));
			if (list.length) front[field] = list;
			else delete front[field];
		}, label);
		// A land drawn or redrawn inside another: file it there.
		if (what === "territory" && points) syncAfterMapEdit(this, key, mapKey);
	}

	/** Adds areas to a note on one map, first removing its other areas there when `replace` is set. */
	async setAreas(key: string, mapKey: string, rings: [number, number][][], replace: boolean) {
		const file = this.app.vault.getAbstractFileByPath(key);
		if (!(file instanceof TFile) || !rings.length) return;
		const name = mapKey === WORLD_MAP ? "world" : this.index.get(mapKey)?.name ?? mapKey;
		const mapRef = mapKey === WORLD_MAP ? "world" : `[[${name}]]`;
		await this.editFrontmatter(file, (front) => {
			const field = ["territory", "territories", "borders"].find((k) => k in front) ?? "territory";
			let list = Array.isArray(front[field]) ? (front[field] as unknown[]) : front[field] ? [front[field]] : [];
			if (replace) {
				list = list.filter((t) => {
					const m = t && typeof t === "object" ? asText((t as Record<string, unknown>).map ?? "") : "";
					return m.replace(/^\[\[|\]\]$/g, "").toLowerCase() !== name.toLowerCase();
				});
			}
			for (const r of rings) list.push({ map: mapRef, points: writePoints(r.map(([a, b]) => [round2(a), round2(b)] as [number, number])) });
			front[field] = list;
		}, `Borders for ${file.basename}`);
	}

	/** Adds a view to the active board (creating one if needed) and opens the board. */
	async addToBoard(viewType: string, scope?: string) {
		const kinds: Record<string, ModuleKind> = {
			[VIEW_TIMELINE]: "timeline", [VIEW_FAMILY]: "family", [VIEW_NETWORK]: "graph", [VIEW_LINEAGE]: "lineage", [VIEW_ORG]: "org", [VIEW_MAP]: "map", [VIEW_OVERVIEW]: "stats", [VIEW_CALENDAR]: "calendar", [VIEW_HOUSES]: "houses",
		};
		const kind = kinds[viewType];
		if (!kind) return;
		const leaf = await this.activateView(VIEW_DASHBOARD, scope !== undefined ? { scope } : {});
		window.setTimeout(() => (leaf.view as DashboardView).addModule?.(kind), 50);
		new Notice(`Added ${MODULE_KINDS[kind].name.toLowerCase()} to the board. Drag its header to move it, its corner to resize.`);
	}

	showThemeMenu(evt: MouseEvent) {
		const menu = new Menu();
		for (const t of THEMES) {
			menu.addItem((i) =>
				i
					.setTitle(`${t.name} — ${t.forWhat}`)
					.setChecked(this.settings.theme === t.id)
					.onClick(async () => {
						this.settings.theme = t.id;
						await this.saveSettings();
					}),
			);
		}
		menu.addSeparator();
		menu.addItem((i) => i.setTitle("Colors, motion & more…").setIcon("settings").onClick(() => this.openSettings()));
		menu.showAtMouseEvent(evt);
	}

	/** Hover cards for links in notes, when enabled (with Alt held, or always). */
	private registerLinkHover() {
		this.registerDomEvent(document, "mouseover", (evt: MouseEvent) => {
			const mode = this.settings.hoverInNotes;
			if (mode === "off" || !this.settings.hoverCards) return;
			if (mode === "alt" && !evt.altKey) return;
			const target = evt.target as HTMLElement | null;
			const link = target?.closest?.("a.internal-link, .cm-hmd-internal-link, .cm-underline") as HTMLElement | null;
			if (!link || !link.closest(".markdown-source-view, .markdown-reading-view, .markdown-preview-view, .markdown-embed")) return;
			const text = link.getAttribute("data-href") ?? link.textContent ?? "";
			const path = text.split("|")[0].split("#")[0].trim();
			if (!path) return;
			const source = this.app.workspace.getActiveFile()?.path ?? "";
			const dest = this.app.metadataCache.getFirstLinkpathDest(path, source);
			if (!dest || !this.index.get(dest.path)) return;
			this.hoverCards?.hoverOnce(link, dest.path, evt);
		});
	}

	// ---- Commands & menus ----------------------------------------------------------------------------

	private activeEntity() {
		const f = this.app.workspace.getActiveFile();
		return f ? this.index.get(f.path) : undefined;
	}

	private registerCommands() {
		for (const v of VIEWS) {
			this.addCommand({
				id: `open-${v.type.replace("chronicle-", "")}`,
				name: `Open ${v.name.toLowerCase()}`,
				icon: v.icon,
				...this.keys(["Mod", "Alt"], v.key),
				checkCallback: (checking) => {
					if (!this.moduleOn(v.type)) return false;
					if (!checking) void this.activateView(v.type);
					return true;
				},
			});
		}
		this.addCommand({ id: "open-files-panel", name: "Open files panel", icon: "folder-tree", callback: () => void this.openFilesPanel() });
		this.addCommand({
			id: "quick-menu",
			name: "Show menu of views and actions",
			icon: "library",
			...this.keys(["Mod", "Alt"], "C"),
			callback: () => {
				const r = this.app.workspace.containerEl.getBoundingClientRect();
				this.showViewMenu(undefined, { x: r.left + r.width / 2 - 120, y: r.top + 120 });
			},
		});
		const types: EntityType[] = ["event", "person", "culture", "place", "map"];
		for (const t of types) {
			this.addCommand({ id: `new-${t}`, name: `New ${t}`, icon: TYPE_ICONS[t], callback: () => this.createEntityPrompt({ type: t }) });
		}
		this.addCommand({
			id: "show-on-timeline",
			name: "Show current note on timeline",
			icon: "calendar-range",
			checkCallback: (checking) => {
				const e = this.activeEntity();
				if (!e || !(e.start || e.end)) return false;
				if (!checking) void this.openTimeline({ focus: e.key });
				return true;
			},
		});
		this.addCommand({
			id: "family-tree-current",
			name: "Show family tree of current person",
			icon: "git-fork",
			checkCallback: (checking) => {
				const e = this.activeEntity();
				if (e?.type !== "person") return false;
				if (!checking) void this.openFamilyTree(e.key);
				return true;
			},
		});
		this.addCommand({
			id: "whats-new",
			name: "What's new (version history)",
			icon: "scroll-text",
			callback: () => new WhatsNewModal(this).open(),
		});
		this.addCommand({
			id: "map-look-preset",
			name: "Map look: switch preset",
			icon: "palette",
			callback: () => {
				const s = this.settings;
				const all = [...BUILT_IN_PRESETS, ...(s.mapPresets ?? [])];
				const picker = new (class extends FuzzySuggestModal<MapPreset> {
					constructor(readonly plugin: ChroniclePlugin) {
						super(plugin.app);
					}
					getItems() {
						return all;
					}
					getItemText(p: MapPreset) {
						return `${p.name} — ${p.desc}`;
					}
					onChooseItem(p: MapPreset) {
						applyLook(s, p.look);
						const plugin = this.plugin;
						void plugin.saveSettings().then(() => {
							applyAppearance(s);
							plugin.restyleTerritories?.();
							plugin.index.requestRebuild();
							new Notice(`Map look: ${p.name}`);
						});
					}
				})(this);
				picker.setPlaceholder("Map look preset…");
				picker.open();
			},
		});
		this.addCommand({
			id: "map-current",
			name: "Show current note on map",
			icon: "map",
			checkCallback: (checking) => {
				const e = this.activeEntity();
				if (!e || !(e.type === "place" || e.type === "map" || e.places.length)) return false;
				if (!checking) void this.openMap(e.key);
				return true;
			},
		});
		this.addCommand({
			id: "graph-current",
			name: "Show connections of current note",
			icon: "waypoints",
			checkCallback: (checking) => {
				const e = this.activeEntity();
				if (!e) return false;
				if (!checking) void this.openNetwork(e.key);
				return true;
			},
		});
		this.addCommand({
			id: "new-note",
			name: "New note (event, person, culture, place or map)",
			icon: "plus",
			...this.keys(["Mod", "Alt"], "N"),
			callback: () => this.createEntityPrompt(),
		});
		this.addCommand({
			id: "switch-theme",
			name: "Switch theme",
			icon: "swatch-book",
			callback: () => {
				const r = this.app.workspace.containerEl.getBoundingClientRect();
				const evt = new MouseEvent("contextmenu", { clientX: r.left + r.width / 2 - 140, clientY: r.top + 120 });
				this.showThemeMenu(evt);
			},
		});
		this.addCommand({
			id: "add-view-to-board",
			name: "Add this view to the board",
			icon: "layout-dashboard",
			checkCallback: (checking) => {
				const type = this.app.workspace.getActiveViewOfType(ItemView)?.getViewType();
				if (!type || !type.startsWith("chronicle-") || type === VIEW_DASHBOARD) return false;
				if (!checking) void this.addToBoard(type);
				return true;
			},
		});
		for (const v of VIEWS) {
			if (v.type === VIEW_OVERVIEW) continue;
			this.addCommand({
				id: `open-${v.type.replace("chronicle-", "")}-right`,
				name: `Open ${v.name.toLowerCase()} to the right`,
				icon: v.icon,
				callback: () => void this.activateView(v.type, {}, "split"),
			});
		}
		this.addCommand({ id: "check-data", name: "Check data for problems", icon: "shield-check", callback: () => new ValidateModal(this).open() });
		this.addCommand({
			id: "detect-types",
			name: "Detect note types and relationships",
			icon: "wand-2",
			...this.keys(["Mod", "Alt"], "D"),
			callback: () => new DetectModal(this).open(),
		});
		this.addCommand({ id: "normalise-tags", name: "Normalise all tags", icon: "tags", callback: () => new NormaliseTagsModal(this).open() });
		this.addCommand({ id: "tag-scheme", name: "Move tags to the tag scheme", icon: "tags", callback: () => new NormaliseTagsModal(this, true).open() });
		this.addCommand({ id: "smart-reader", name: "Smart reader: find facts in your notes' text", icon: "scan-text", callback: () => new SmartReaderModal(this).open() });
		this.addCommand({
			id: "smart-reader-note",
			name: "Smart reader: this note",
			icon: "scan-text",
			checkCallback: (checking) => {
				const e = this.index.get(this.app.workspace.getActiveFile()?.path);
				if (e && !checking) new SmartReaderModal(this, e).open();
				return !!e;
			},
		});
		this.addCommand({ id: "import-gedcom", name: "Import GEDCOM family tree", icon: "import", callback: () => new GedcomModal(this).open() });
		this.addCommand({
			id: "insert-view",
			name: "Insert embedded view",
			icon: "code",
			editorCallback: (editor: Editor) => new SnippetModal(this, editor).open(),
		});
		this.addCommand({
			id: "undo",
			name: "Undo the last change it made",
			icon: "undo-2",
			...this.keys(["Mod", "Alt"], "Z"),
			callback: () => void this.undo(),
		});
		this.addCommand({
			id: "undo-history",
			name: "Undo history (every change it made, to undo back to any point)",
			icon: "history",
			...this.keys(["Mod", "Alt", "Shift"], "Z"),
			callback: () => new UndoHistoryModal(this).open(),
		});
		this.addCommand({
			id: "change-icon",
			name: "Change this note's icon",
			icon: "smile-plus",
			checkCallback: (checking) => {
				const f = this.app.workspace.getActiveFile();
				if (!f) return false;
				if (!checking) changeNoteIcon(this, f);
				return true;
			},
		});
		this.addCommand({
			id: "jump-to",
			name: "Jump to a note in its best view",
			icon: "search",
			...this.keys(["Mod", "Alt"], "J"),
			callback: () => new EntityPickerModal(this, undefined, (e) => void this.openBest(e.key), "Jump to… (people open in the family tree, groups in the org chart, places on the map)").open(),
		});
		this.addCommand({
			id: "report-skipped-notes",
			name: "Report the notes it skipped (for bug reports)",
			icon: "file-question",
			callback: () => void this.reportSkipped(),
		});
		// ---- Writing ----
		const activePath = () => this.app.workspace.getActiveFile()?.path;
		const activeWorld = () => {
			const p = activePath();
			return p?.includes("/") && this.index.topFolders().length > 1 ? p.split("/")[0] : undefined;
		};
		this.addCommand({ id: "quick-add", name: "Quick creator (a line or a form → a linked note)", icon: "zap", ...this.keys(["Mod", "Alt"], "Q"), callback: () => void this.quickCreate(activeWorld()) });
		this.addCommand({
			id: "quick-edit",
			name: "Edit this note in the inspector",
			icon: "pencil",
			checkCallback: (checking) => {
				const k = activePath();
				if (!k || !this.index.get(k)) return false;
				if (!checking) void this.inspect(k, "edit");
				return true;
			},
		});
		this.addCommand({
			id: "suggest-relationships",
			name: "Suggest family links from this note's text",
			icon: "sparkles",
			checkCallback: (checking) => {
				const f = this.app.workspace.getActiveFile();
				if (!f || this.index.get(f.path)?.type !== "person") return false;
				if (!checking) void suggestionsFor(this, f).then((s) => new SuggestionsModal(this, f, s).open());
				return true;
			},
		});
		this.addCommand({ id: "world-settings", name: "World settings (make or open this world's world note)", icon: "globe", callback: () => this.pickWorld("Settings for which world?", (w) => this.editWorld(w ?? "")) });
		this.addCommand({ id: "inspector", name: "Open the inspector (read and edit the current note)", icon: "panel-right", ...this.keys(["Mod", "Alt"], "I"), callback: () => void this.inspect(this.app.workspace.getActiveFile()?.path) });
		this.addCommand({ id: "why-happened", name: "Why did this happen? (causes and consequences)", icon: "git-pull-request-arrow", callback: () => this.openCauses(activePath()) });
		this.addCommand({ id: "convert-date", name: "Convert a date between calendars", icon: "arrow-left-right", callback: () => new ConvertModal(this).open() });
		this.addCommand({ id: "check-continuity", name: "Check story continuity (this chapter, or all)", icon: "book-open-check", callback: () => new ContinuityModal(this, activePath()).open() });
		this.addCommand({ id: "story-ideas", name: "Story ideas from your world", icon: "lightbulb", callback: () => this.pickWorld("Ideas for which world?", (w) => new PromptsModal(this, w).open()) });
		this.addCommand({ id: "name-ideas", name: "Name ideas in your world's style", icon: "dices", callback: () => new NamesModal(this).open() });
		this.addCommand({
			id: "insert-age",
			name: "Insert someone's age at a date",
			icon: "cake",
			editorCallback: (editor: Editor) =>
				new EntityPickerModal(this, ["person"], (e) => new TextPrompt(this, `${e.name}'s age on which date (or event)?`, "", (when) => editor.replaceSelection(`\`age: ${e.name} @ ${when}\``)).open(), "Whose age?").open(),
		});
		// ---- People ----
		this.addCommand({ id: "how-related", name: "How are two people related?", icon: "git-compare", callback: () => this.openKinship(this.index.get(activePath())?.type === "person" ? activePath() : undefined) });
		this.addCommand({ id: "succession", name: "Line of succession", icon: "crown", callback: () => this.openSuccession(activePath()) });
		this.addCommand({ id: "who-knows", name: "Who knows what", icon: "eye", callback: () => new KnowledgeModal(this, this.index.get(activePath())?.type === "person" ? activePath() : undefined).open() });
		// ---- Tidying ----
		this.addCommand({ id: "find-duplicates", name: "Find duplicate notes", icon: "copy", callback: () => new DuplicatesModal(this).open() });
		this.addCommand({ id: "loose-ends", name: "Loose ends (unlinked notes, places off the map…)", icon: "unlink", callback: () => this.pickWorld("Loose ends in which world?", (w) => new OrphansModal(this, w).open()) });
		this.addCommand({ id: "tidy-kinds-tags", name: "Tidy kinds and tags", icon: "tags", callback: () => new CleanupModal(this).open() });
		this.addCommand({ id: "completeness", name: "How complete is the world?", icon: "gauge", callback: () => this.pickWorld("Which world?", (w) => new CompletenessModal(this, w).open()) });
		this.addCommand({ id: "contradictions", name: "Find text that disagrees with properties", icon: "scale", callback: () => new ContradictionsModal(this).open() });
		// ---- Views and exports ----
		this.addCommand({ id: "save-view", name: "Save this view", icon: "bookmark-plus", callback: () => this.saveCurrentView() });
		this.addCommand({ id: "open-saved-view", name: "Open a saved view", icon: "bookmark", callback: () => this.pickSavedView() });
		this.addCommand({ id: "website", name: "Export a world as a website", icon: "globe", callback: () => this.pickWorld("Website of which world?", (w) => void exportWebsite(this, w)) });
		this.addCommand({ id: "world-book", name: "Export a world book (web page / PDF)", icon: "book-open", callback: () => this.pickWorld("World book of which world?", (w) => void exportWorldBook(this, w)) });
		this.addCommand({
			id: "export-gedcom",
			name: "Export family tree (GEDCOM)",
			icon: "file-output",
			callback: () => this.exportGedcomPrompt(),
		});
		this.addCommand({ id: "rebuild-index", name: "Rebuild index", icon: "refresh-cw", callback: () => {
			this.index.rebuild();
			new Notice(`UniverseView indexed ${this.index.entities.size} notes.`);
		} });
	}

	/** Right-click items for a note: on files, links, tab headers and inside the editor. */
	/** Redraws the icons in the file explorer and search (after the icon settings change). */
	repaintFileIcons?: () => void;
	/** Rebuilds the tag colours in notes (after the setting changes). */
	restyleTags?: () => void;
	/** Rebuilds how each tier of territory is drawn (after the setting changes). */
	restyleTerritories?: () => void;

	/** Redraws every open map (after a change to how realms and territories look or merge). */
	refreshMaps = debounce(() => {
		const hosted = this.app.workspace.getLeavesOfType(VIEW_HUB).flatMap((leaf) => (leaf.view as HubView).hostedMaps());
		for (const view of [...this.app.workspace.getLeavesOfType(VIEW_MAP).map((leaf) => leaf.view), ...hosted]) (view as unknown as { renderer?: { refresh(): void } }).renderer?.refresh();
	}, 150, true);
	/** Redraws the status bar line for the open note. */
	refreshStatus?: () => void;

	/**
	 * UniverseView's part of a note's right-click menu, in one block: Inspect first, then the views it
	 * shows in, then adding to it, then its icon. `section` keeps a folder's own block apart from these.
	 */
	private addNoteItems(menu: Menu, file: TFile, section = "chronicle", label?: string) {
		const e = this.index.get(file.path);
		const item = (title: string, icon: string, run: () => void) =>
			menu.addItem((i) => i.setTitle(title).setIcon(icon).setSection(section).onClick(run));
		if (!e) {
			item("Inspect", "panel-right", () => void this.inspect(file.path, "about"));
			item("UniverseView: detect type of this note…", "wand-2", () => new DetectModal(this).open());
			item("Change icon…", "smile-plus", () => changeNoteIcon(this, file));
			return;
		}
		item(label ? `Inspect ${label}` : "Inspect", "panel-right", () => void this.inspect(e.key, "edit"));
		if (e.start || e.end) item("Show on timeline", "calendar-range", () => void this.openTimeline({ focus: e.key }));
		if (e.type === "person") item("Show family tree", "git-fork", () => void this.openFamilyTree(e.key));
		if (e.type === "culture") item("Show in the lineage of groups", "git-branch", () => void this.openLineage(e.key));
		if (e.type === "culture") item("Show organisation chart", "network", () => void this.openOrgChart(e.key));
		if (e.type === "place" || e.type === "map" || e.places.length || e.birthPlace) item("Show on map", "map", () => void this.openMap(e.key));
		item("Show connections", "waypoints", () => void this.openNetwork(e.key));
		item("Show in UniverseView dashboard", "panels-top-left", () => void this.openDashboard(e.key));
		if (e.type === "person") item("Add child…", "baby", () => this.createEntityPrompt({ type: "person", parents: [e.name] }));
		if (e.type === "place") item("Add event here…", "calendar-plus", () => this.createEntityPrompt({ type: "event", places: [e.name] }));
		item("Change icon…", "smile-plus", () => changeNoteIcon(this, file));
	}

	/** Right-click items for a folder: open each view limited to it (one folder per world). */
	private addFolderItems(menu: Menu, folder: TFolder, section = "chronicle") {
		const top = folder.path.split("/")[0];
		const scope = folder.isRoot() ? "" : top;
		const name = folder.isRoot() ? "the whole vault" : `“${top}”`;
		const item = (title: string, icon: string, run: () => void) =>
			menu.addItem((i) => i.setTitle(title).setIcon(icon).setSection(section).onClick(run));
		item(`UniverseView overview of ${name}`, "library", () => void this.activateView(VIEW_OVERVIEW, { scope }));
		if (!folder.isRoot()) item("Folder in UniverseView dashboard", "panels-top-left", () => void this.activateView(VIEW_EXPLORER, { explorer: { selected: folder.path, isFolder: true } }));
		item(`Timeline of ${name}`, "calendar-range", () => void this.activateView(VIEW_TIMELINE, { options: { filter: { folder: scope } } }));
		item(`Map of ${name}`, "map", () => void this.activateView(VIEW_MAP, { options: { folder: scope } }));
		item(`Connections in ${name}`, "waypoints", () => void this.activateView(VIEW_NETWORK, { options: { filter: { folder: scope } } }));
	}

	private registerFileMenu() {
		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				if (file instanceof TFile && file.extension === "md") this.addNoteItems(menu, file);
				else if (file instanceof TFolder) {
					// A folder with a folder note stands for that note (House Whitmore's folder is House Whitmore),
					// whichever plugin handles folder notes.
					const note = folderNoteOf(this, file);
					if (note) this.addNoteItems(menu, note, "chronicle", this.index.get(note.path)?.name ?? note.basename);
					this.addFolderItems(menu, file, note ? "chronicle-folder" : "chronicle");
				}
			}),
		);
		this.registerEvent(
			this.app.workspace.on("editor-menu", (menu, _editor, info) => {
				if (info.file) this.addNoteItems(menu, info.file);
			}),
		);
	}
}

function round2(n: number): number {
	return Math.round(n * 100) / 100;
}

class SnippetModal extends SuggestModal<{ name: string; text: string }> {
	constructor(plugin: ChroniclePlugin, private editor: Editor) {
		super(plugin.app);
		this.setPlaceholder("Which view should be embedded?");
	}
	getSuggestions(q: string) {
		return SNIPPETS.filter((s) => s.name.toLowerCase().includes(q.toLowerCase()));
	}
	renderSuggestion(s: { name: string }, elx: HTMLElement) {
		elx.setText(s.name);
	}
	onChooseSuggestion(s: { text: string }) {
		this.editor.replaceSelection(s.text + "\n");
	}
}