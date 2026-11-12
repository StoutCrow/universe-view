import { ItemView, Keymap, Menu, Notice, Platform, debounce, setIcon, type ViewStateResult, type WorkspaceLeaf } from "obsidian";
import { buildLabel } from "../version";
import type UniverseViewPlugin from "../main";
import { el, icon } from "../render/common";
import { SETTINGS_GROUPS, pageLabel } from "../ui/SettingsTab";
import { dragToReorder } from "../ui/cardlayout";
import { renderWorldStats } from "../render/stats";
import type { UniverseViewBase } from "./base";
import { CalendarView, VIEW_CALENDAR } from "./CalendarView";
import { DashboardView, VIEW_DASHBOARD } from "./DashboardView";
import { ExplorerView, VIEW_EXPLORER } from "./ExplorerView";
import { VIEW_FILES } from "./FilesPanelView";
import { FamilyTreeView, VIEW_FAMILY } from "./FamilyTreeView";
import { HousesView, VIEW_HOUSES } from "./HousesView";
import { GROUP_KINDS } from "../render/houses";
import { LineageView, VIEW_LINEAGE } from "./LineageView";
import { MapView, VIEW_MAP } from "./MapView";
import { NetworkView, VIEW_NETWORK } from "./NetworkView";
import { OrgChartView, VIEW_ORG } from "./OrgChartView";
import { OverviewView, VIEW_OVERVIEW } from "./OverviewView";
import { RealmsView, VIEW_REALMS } from "./RealmsView";
import { TableView, VIEW_TABLE } from "./TableView";
import { TimelineView, VIEW_TIMELINE } from "./TimelineView";
import { TodayView, VIEW_TODAY } from "./TodayView";

export const VIEW_HUB = "chronicle-hub";
export const LOGO_ICON = "universe-view";
/** The star in its orbit, drawn in the 100 × 100 box Obsidian's icons use. */
export const LOGO_SVG = `<path fill="currentColor" d="M50 10C52.6 35 65 47.4 90 50 65 52.6 52.6 65 50 90 47.4 65 35 52.6 10 50 35 47.4 47.4 35 50 10Z"/><ellipse cx="50" cy="50" rx="47" ry="17" transform="rotate(-30 50 50)" fill="none" stroke="currentColor" stroke-width="4.5"/><circle cx="87" cy="23" r="5.5" fill="currentColor"/>`;

interface Action {
	id: string;
	name: string;
	icon: string;
}

interface HubModule {
	id: string;
	name: string;
	icon: string;
	desc: string;
	/** A full view, hosted in the dashboard. */
	view?: (leaf: WorkspaceLeaf, plugin: UniverseViewPlugin) => UniverseViewBase;
	/** A page drawn straight into the dashboard. */
	draw?: (host: HTMLElement, hub: HubView) => void;
	/** Lives in Obsidian's sidebar, not on a tab here. */
	sidebar?: boolean;
	/** Always there: can't be switched off. */
	fixed?: boolean;
	/** A mode of another module: no tab of its own while that one's on. */
	modeOf?: string;
}

interface HubSection {
	id: string;
	name: string;
	icon: string;
	modules: HubModule[];
}

/** A page of tools: each a card that runs its command. */
const actions = (list: Action[]) => (host: HTMLElement, hub: HubView) => {
	const grid = el("div", { cls: "uv-hub-actions" }, host);
	for (const a of list) {
		const card = el("button", { cls: "uv-hub-action" }, grid);
		icon(el("span", { cls: "uv-hub-action-icon" }, card), a.icon);
		el("span", { text: a.name }, card);
		card.addEventListener("click", () => hub.run(a.id));
	}
};

/** The sub-tab last open in each settings tab that has several pages. */
const subTab = new Map<string, string>();

/** A settings tab: its page, or a row of sub-tabs over the page picked. */
const settingsGroup = (gid: string) => (host: HTMLElement, hub: HubView) => {
	const g = SETTINGS_GROUPS.find((x) => x.id === gid);
	if (!g) return;
	if (g.pages.length === 1) return hub.settingsInto(g.pages[0], host);
	const bar = el("div", { cls: "uv-subtabs" }, host);
	const body = el("div", { cls: "uv-subtab-body" }, host);
	const show = (id: string) => {
		subTab.set(gid, id);
		bar.querySelectorAll("button").forEach((b) => b.toggleClass("is-on", b.dataset.page === id));
		body.empty();
		hub.settingsInto(id, body);
	};
	for (const id of g.pages) el("button", { cls: "uv-subtab", text: pageLabel(id), attr: { "data-page": id } }, bar).addEventListener("click", () => show(id));
	const cur = subTab.get(gid);
	show(cur && g.pages.includes(cur) ? cur : g.pages[0]);
};

export const HUB_SECTIONS: HubSection[] = [
	{
		id: "home", name: "Home", icon: "layout-grid", modules: [
			{ id: VIEW_OVERVIEW, name: "Overview", icon: "library", desc: "A world at a glance, with ways into everything.", view: (l, p) => new OverviewView(l, p) },
			{ id: VIEW_TODAY, name: "Today", icon: "sunrise", desc: "What is happening on the world's current date.", view: (l, p) => new TodayView(l, p) },
			{ id: VIEW_DASHBOARD, name: "Board", icon: "layout-dashboard", desc: "Your own arrangement of timelines, maps and lists.", view: (l, p) => new DashboardView(l, p) },
			{ id: "stats", name: "Statistics", icon: "bar-chart-3", desc: "People alive over time, group balance, lifespans, names.", draw: (host, hub) => renderWorldStats(hub.owner, host) },
		],
	},
	{
		id: "people", name: "People", icon: "users", modules: [
			{ id: VIEW_FAMILY, name: "Family tree", icon: "git-fork", desc: "Ancestors and descendants of anyone.", view: (l, p) => new FamilyTreeView(l, p) },
			{ id: VIEW_NETWORK, name: "Connections", icon: "waypoints", desc: "How people, groups, places and events link.", view: (l, p) => new NetworkView(l, p) },
		],
	},
	{
		id: "groups", name: "Groups", icon: "crown", modules: [
			{ id: VIEW_REALMS, name: "Realms", icon: "crown", desc: "Realms and cultures, tier by tier.", view: (l, p) => new RealmsView(l, p) },
			{ id: VIEW_ORG, name: "Organisation", icon: "network", desc: "Who leads and serves, over time.", view: (l, p) => new OrgChartView(l, p) },
			{ id: VIEW_HOUSES, get name() { return GROUP_KINDS.house.plural; }, get icon() { return GROUP_KINDS.house.icon; }, get desc() { return `${GROUP_KINDS.house.plural} as bands over the generations.`; }, view: (l, p) => new HousesView(l, p) },
		],
	},
	{
		id: "places", name: "Places", icon: "map", modules: [
			{ id: VIEW_MAP, name: "Map", icon: "map", desc: "Places, territories and journeys.", view: (l, p) => new MapView(l, p) },
		],
	},
	{
		id: "time", name: "Time", icon: "calendar-range", modules: [
			{ id: VIEW_TIMELINE, name: "Timeline", icon: "calendar-range", desc: "Every dated event and lifespan, zoomable.", view: (l, p) => new TimelineView(l, p) },
			{ id: VIEW_LINEAGE, name: "Lineage", icon: "git-branch", desc: "How groups rise, split and fall: the timeline's second mode.", view: (l, p) => new LineageView(l, p), modeOf: VIEW_TIMELINE },
			{ id: VIEW_CALENDAR, name: "Calendar", icon: "calendar-days", desc: "Months and years in your world's calendar.", view: (l, p) => new CalendarView(l, p) },
		],
	},
	{
		id: "library", name: "Library", icon: "folder-tree", modules: [
			{ id: VIEW_EXPLORER, name: "Browse", icon: "panels-top-left", desc: "Every folder and note, with details to edit.", view: (l, p) => new ExplorerView(l, p) },
			{ id: VIEW_TABLE, name: "Table", icon: "table", desc: "Notes as a sortable, editable table.", view: (l, p) => new TableView(l, p) },
			{ id: VIEW_FILES, name: "Files panel", icon: "folder-tree", desc: "The file tree in Obsidian's sidebar, beside Files.", sidebar: true },
		],
	},
	{
		id: "tools", name: "Tools", icon: "wrench", modules: [
			{
				id: "tools-write", name: "Write", icon: "pen-line", desc: "Add notes and find ideas.", draw: actions([
					{ id: "new-note", name: "New note", icon: "file-plus" },
					{ id: "quick-add", name: "Quick creator", icon: "zap" },
					{ id: "story-ideas", name: "Story ideas", icon: "lightbulb" },
					{ id: "name-ideas", name: "Name ideas", icon: "pencil" },
					{ id: "suggest-relationships", name: "Suggest relationships", icon: "link" },
					{ id: "world-settings", name: "World settings", icon: "globe" },
				]),
			},
			{
				id: "tools-ask", name: "Ask", icon: "search", desc: "Questions about your world.", draw: actions([
					{ id: "how-related", name: "How are two people related?", icon: "users" },
					{ id: "succession", name: "Line of succession", icon: "crown" },
					{ id: "who-knows", name: "Who knows what", icon: "eye" },
					{ id: "why-happened", name: "Why did this happen?", icon: "git-compare" },
					{ id: "convert-date", name: "Convert a date", icon: "arrow-left-right" },
				]),
			},
			{
				id: "tools-check", name: "Check", icon: "shield-check", desc: "Find problems and gaps.", draw: actions([
					{ id: "check-data", name: "Check data", icon: "shield-check" },
					{ id: "completeness", name: "How complete is the world?", icon: "gauge" },
					{ id: "loose-ends", name: "Loose ends", icon: "unlink" },
					{ id: "find-duplicates", name: "Find duplicates", icon: "copy" },
					{ id: "smart-reader", name: "Smart reader", icon: "scan-text" },
					{ id: "contradictions", name: "Text that disagrees", icon: "file-warning" },
					{ id: "check-continuity", name: "Story continuity", icon: "book-open-check" },
					{ id: "report-skipped-notes", name: "Skipped notes", icon: "file-x" },
				]),
			},
			{
				id: "tools-tidy", name: "Tidy", icon: "sparkles", desc: "Sort out notes in bulk.", draw: actions([
					{ id: "detect-types", name: "Detect types", icon: "wand-2" },
					{ id: "normalise-tags", name: "Normalise all tags", icon: "tags" },
					{ id: "tag-scheme", name: "Move tags to the tag scheme", icon: "tags" },
						{ id: "standardise-land-tags", name: "Standardise land tags", icon: "tag" },
					{ id: "tidy-kinds-tags", name: "Tidy kinds and tags", icon: "tag" },
					{ id: "tidy-into-folder-notes", name: "Move into folder notes", icon: "folder-tree" },
					{ id: "undo-history", name: "Undo history", icon: "history" },
					{ id: "rebuild-index", name: "Rebuild index", icon: "refresh-cw" },
				]),
			},
			{
				id: "tools-share", name: "Share", icon: "share-2", desc: "Bring data in, send worlds out.", draw: actions([
					{ id: "website", name: "Export a website", icon: "globe" },
					{ id: "world-book", name: "Export a world book", icon: "book" },
					{ id: "export-gedcom", name: "Export GEDCOM", icon: "file-output" },
					{ id: "import-gedcom", name: "Import GEDCOM", icon: "file-input" },
				]),
			},
		],
	},
	{
		id: "settings", name: "Settings", icon: "settings", modules: [
			{ id: "set-modules", name: "Modules", icon: "toggle-right", desc: "", fixed: true, draw: (host, hub) => hub.modulesInto(host) },
			{ id: "set-look", name: "Look & cards", icon: "palette", desc: "", fixed: true, draw: settingsGroup("look") },
			{ id: "set-notes", name: "Notes & families", icon: "file-text", desc: "", fixed: true, draw: settingsGroup("notes") },
			{ id: "set-time", name: "Time & calendars", icon: "calendar-days", desc: "", fixed: true, draw: settingsGroup("time") },
			{ id: "set-maps", name: "Maps & realms", icon: "map", desc: "", fixed: true, draw: settingsGroup("maps") },
			{ id: "set-about", name: "About", icon: "info", desc: "", fixed: true, draw: settingsGroup("about") },
		],
	},
];

/** Whether a view lives on a tab of the dashboard. */
export function hostedInHub(plugin: UniverseViewPlugin, type: string): boolean {
	return plugin.moduleOn(type) && HUB_SECTIONS.some((s) => s.modules.some((m) => m.id === type && m.view));
}

/** The whole of UniverseView in one tab: big tabs down the side, smaller tabs along the top. */
export class HubView extends ItemView {
	private section = HUB_SECTIONS[0].id;
	private closed = false;
	/** The small tab last open in each big tab. */
	private tabs = new Map<string, string>();
	private railEl!: HTMLElement;
	private barEl!: HTMLElement;
	private stageEl!: HTMLElement;
	/** Pages already opened, kept alive so going back to one is instant and it stays as you left it. */
	private panes = new Map<string, { el: HTMLElement; view?: UniverseViewBase; ready?: Promise<void>; module: HubModule }>();

	constructor(leaf: WorkspaceLeaf, private plugin: UniverseViewPlugin) {
		super(leaf);
	}

	get owner(): UniverseViewPlugin {
		return this.plugin;
	}

	getViewType() {
		return VIEW_HUB;
	}
	getDisplayText() {
		// Each dashboard names the page it is on, so several open at once can be told apart.
		const s = HUB_SECTIONS.find((x) => x.id === this.section);
		const list = s ? this.visible(s) : [];
		const id = this.tabs.get(this.section);
		const m = list.find((x) => x.id === id) ?? list[0];
		const mode = m?.modeOf ? list.find((x) => x.id === m.modeOf) : undefined;
		return m ? `UniverseView: ${(mode ?? m).name}` : "UniverseView";
	}

	/** Where this dashboard is, to open another one on the same page. */
	place(): { section: string; tab?: string } {
		return { section: this.section, tab: this.activePane()?.module.id };
	}

	/** How each page of this dashboard was left, kept with this dashboard (two can show different maps). */
	private own = new Map<string, unknown>();
	getIcon() {
		return LOGO_ICON;
	}

	getState(): Record<string, unknown> {
		return { section: this.section, tabs: Object.fromEntries(this.tabs), views: Object.fromEntries(this.own) };
	}

	async setState(state: unknown, result: ViewStateResult) {
		const s = state as { section?: string; tabs?: Record<string, string>; views?: Record<string, unknown> } | undefined;
		if (s?.tabs) this.tabs = new Map(Object.entries(s.tabs));
		if (s?.views) this.own = new Map(Object.entries(s.views));
		if (s?.section && HUB_SECTIONS.some((x) => x.id === s.section)) this.section = s.section;
		if (this.stageEl) this.refresh();
		await super.setState(state, result);
	}

	async onOpen() {
		const root = this.contentEl;
		root.empty();
		root.addClass("uv-hub", "universeview-scope");
		this.railEl = el("nav", { cls: "uv-hub-rail" }, root);
		const grip = el("div", { cls: "uv-hub-grip", attr: { role: "separator", "aria-label": "Resize the sidebar" } }, root);
		const main = el("div", { cls: "uv-hub-main" }, root);
		this.barEl = el("div", { cls: "uv-hub-bar" }, main);
		this.stageEl = el("div", { cls: "uv-hub-stage" }, main);
		this.setRail(this.plugin.settings.hubRail ?? 208);
		this.dragRail(grip);
		const observer = new ResizeObserver(() => this.activePane()?.view?.onResize());
		observer.observe(this.stageEl);
		this.register(() => observer.disconnect());
		this.registerEvent(this.plugin.index.on("changed", () => this.redrawPages()));
		this.refresh();
		this.preload();
		// Not every change a view makes announces itself, so the open one is looked at now and then.
		this.registerInterval(window.setInterval(() => this.remember(this.activePane()?.view), 5000));
	}

	async onClose() {
		this.closed = true;
		for (const p of this.panes.values()) {
			this.remember(p.view);
			await p.view?.unmount();
		}
		this.panes.clear();
		const tab = this.plugin.settingTab;
		if (tab) tab.hubRedraw = undefined;
	}

	/** Keeps how a view was left, for the next time it opens. */
	private remember(view?: UniverseViewBase) {
		if (!view?.isReady) return;
		const s = this.plugin.settings;
		const type = view.getViewType();
		const state = view.getState();
		if (JSON.stringify(state) !== JSON.stringify(this.own.get(type))) {
			this.own.set(type, state);
			this.app.workspace.requestSaveLayout();
		}
		if (JSON.stringify(state) === JSON.stringify(s.viewStates?.[type])) return;
		s.viewStates = { ...s.viewStates, [type]: state };
		void this.plugin.saveSettings();
	}

	/** Closes a view's page, so it opens afresh. */
	private async dropPane(id: string) {
		const p = this.panes.get(id);
		if (!p) return;
		this.panes.delete(id);
		await p.ready;
		await p.view?.unmount();
		p.el.remove();
	}

	/** Puts one view back as it came. */
	async resetView(id: string) {
		await this.dropPane(id);
		if (this.plugin.settings.viewStates) delete this.plugin.settings.viewStates[id];
		await this.plugin.saveSettings();
		this.refresh();
	}

	/** Puts every view back as it came. */
	async resetViews() {
		for (const [id, p] of [...this.panes]) if (p.module.view) await this.dropPane(id);
		this.plugin.settings.viewStates = undefined;
		await this.plugin.saveSettings();
		this.refresh();
	}

	/** Opens the other pages quietly, one at a time when nothing else is going on, so tabs are ready when clicked. */
	private preload() {
		if (Platform.isMobile) return;
		const first = HUB_SECTIONS.filter((s) => s.id === this.section);
		const queue = [...first, ...HUB_SECTIONS.filter((s) => s.id !== this.section)].flatMap((s) => this.visible(s));
		const next = () => {
			const m = queue.shift();
			if (!m || this.closed) return;
			if (this.panes.has(m.id)) return next();
			// Behind another tab the dashboard has no size, and views can't lay themselves out: wait.
			if (!this.stageEl.clientWidth) {
				queue.unshift(m);
				window.setTimeout(next, 1000);
				return;
			}
			void this.ensure(m).ready?.then(() => window.requestIdleCallback(next, { timeout: 1500 }));
		};
		window.requestIdleCallback(next, { timeout: 1500 });
	}

	private setRail(px: number) {
		const width = Math.max(64, Math.min(320, px));
		const compact = width < 130;
		this.contentEl.toggleClass("is-compact", compact);
		this.contentEl.setCssProps({ "--uv-hub-rail": `${compact ? 64 : width}px` });
		return compact ? 64 : width;
	}

	private saveRail = debounce((width: number) => {
		this.plugin.settings.hubRail = width;
		void this.plugin.saveSettings();
	}, 400, true);

	private dragRail(grip: HTMLElement) {
		grip.addEventListener("pointerdown", (down) => {
			down.preventDefault();
			grip.setPointerCapture(down.pointerId);
			const left = this.contentEl.getBoundingClientRect().left;
			this.contentEl.addClass("is-resizing");
			const move = (e: PointerEvent) => this.saveRail(this.setRail(e.clientX - left));
			const up = () => {
				this.contentEl.removeClass("is-resizing");
				grip.removeEventListener("pointermove", move);
				grip.removeEventListener("pointerup", up);
			};
			grip.addEventListener("pointermove", move);
			grip.addEventListener("pointerup", up);
		});
	}

	private visible(s: HubSection): HubModule[] {
		return s.modules.filter((m) => !m.sidebar && (m.fixed || this.plugin.moduleOn(m.id)));
	}

	private activePane() {
		const s = HUB_SECTIONS.find((x) => x.id === this.section);
		const list = s ? this.visible(s) : [];
		const id = this.tabs.get(this.section);
		return this.panes.get(list.some((m) => m.id === id) ? id ?? "" : list[0]?.id ?? "");
	}

	/** Draws the tabs and shows the page they point at (after a click, or a module switched on or off). */
	refresh() {
		const sections = this.ordered().filter((s) => this.visible(s).length && !this.hiddenTab(s.id));
		if (!sections.some((s) => s.id === this.section)) this.section = sections[0].id;
		this.railEl.empty();
		const brand = el("div", { cls: "uv-hub-brand" }, this.railEl);
		// The logo is a button: Home; Ctrl/Cmd+click another dashboard (Ctrl+Alt beside this one); right-click the dashboard menu.
		const logo = el("button", { cls: "uv-hub-logo clickable-icon", attr: { "aria-label": "Home. Ctrl+click for another dashboard, right-click for the menu", title: "Home. Ctrl+click for another dashboard, right-click for the menu" } }, brand);
		setIcon(logo, LOGO_ICON);
		logo.addEventListener("click", (evt) => {
			const mod = Keymap.isModEvent(evt);
			if (mod) void this.plugin.openHubBeside(mod === "split" ? "split" : "tab", this.place());
			else this.go(HUB_SECTIONS[0].id);
		});
		logo.addEventListener("contextmenu", (evt) => {
			evt.preventDefault();
			this.plugin.showViewMenu(evt);
		});
		const words = el("div", { cls: "uv-hub-brand-words" }, brand);
		el("div", { cls: "uv-hub-name", text: "UniverseView" }, words);
		el("div", { cls: "uv-hub-vault", text: this.app.vault.getName() }, words);
		const list = el("div", { cls: "uv-hub-sections", attr: { role: "tablist", "aria-orientation": "vertical" } }, this.railEl);
		for (const s of sections) {
			const on = s.id === this.section;
			const b = el("button", { cls: "uv-hub-section" + (on ? " is-active" : ""), attr: { role: "tab", "aria-selected": String(on), "aria-label": s.name } }, list);
			icon(el("span", { cls: "uv-hub-section-icon" }, b), s.icon);
			el("span", { cls: "uv-hub-section-name", text: s.name }, b);
			b.addEventListener("click", () => this.go(s.id));
			b.addEventListener("contextmenu", (evt) => {
				evt.preventDefault();
				this.tabMenu(s, evt);
			});
			// Drag a big tab up or down to move it (on phones, from its menu).
			b.dataset.section = s.id;
			if (!Platform.isMobile) dragToReorder(b, b, () => Array.from(list.querySelectorAll<HTMLElement>(".uv-hub-section")), () => {
				const shown = Array.from(list.querySelectorAll<HTMLElement>(".uv-hub-section")).map((x) => x.dataset.section ?? "");
				this.plugin.settings.hubOrder = [...shown, ...this.ordered().map((x) => x.id).filter((id) => !shown.includes(id))];
				void this.saveTabs();
			});
		}
		// Which build is running: the version, and a build number that goes up with every commit.
		el("div", { cls: "uv-hub-version", text: buildLabel(this.plugin.manifest.version).short, title: buildLabel(this.plugin.manifest.version).long }, this.railEl);
		const section = sections.find((s) => s.id === this.section)!;
		const mods = this.visible(section);
		const wanted = this.tabs.get(section.id);
		const current = mods.find((m) => m.id === wanted) ?? mods[0];
		this.barEl.empty();
		const tabs = el("div", { cls: "uv-hub-tabs", attr: { role: "tablist" } }, this.barEl);
		for (const m of mods.filter((x) => !x.modeOf || !mods.some((y) => y.id === x.modeOf))) {
			const on = m === current || current.modeOf === m.id;
			const b = el("button", { cls: "uv-hub-tab" + (on ? " is-active" : ""), attr: { role: "tab", "aria-selected": String(on) } }, tabs);
			icon(el("span", { cls: "uv-hub-tab-icon" }, b), m.icon);
			el("span", { text: m.name }, b);
			b.addEventListener("click", () => this.go(section.id, m.id));
		}
		if (current.view) {
			const reset = el("button", { cls: "clickable-icon uv-hub-out", attr: { "aria-label": `Put ${current.name} back to its defaults` } }, this.barEl);
			icon(reset, "rotate-ccw");
			reset.addEventListener("click", () => void this.resetView(current.id));
			const out = el("button", { cls: "clickable-icon uv-hub-out", attr: { "aria-label": "Open in its own tab" } }, this.barEl);
			icon(out, "external-link");
			out.addEventListener("click", () => void this.plugin.activateView(current.id, {}, "tab"));
			}
			// Another dashboard beside this one, on the same page: to compare a map and a family tree.
			{
				const beside = el("button", { cls: "clickable-icon uv-hub-out", attr: { "aria-label": "Open another dashboard to the right (to compare two pages side by side)" } }, this.barEl);
				icon(beside, "columns-2");
				beside.addEventListener("click", () => void this.plugin.openHubBeside("split", { section: section.id, tab: current.id }));
		}
		this.show(current);
	}

	/** Opens a view on its tab here, as a link from another view asks. */
	async openModule(type: string, state: Record<string, unknown>) {
		const section = HUB_SECTIONS.find((s) => s.modules.some((m) => m.id === type));
		if (!section) return;
		this.go(section.id, type);
		const pane = this.panes.get(type);
		await pane?.ready;
		if (Object.keys(state).length) await pane?.view?.setState(state, { history: false });
	}

	// Links that reach into a view once it's open (focus a place, start drawing) go on to the view showing here.
	private hosted(): Record<string, ((...args: unknown[]) => unknown) | undefined> | undefined {
		return this.activePane()?.view as unknown as Record<string, ((...args: unknown[]) => unknown) | undefined> | undefined;
	}
	focus(...args: unknown[]) {
		this.hosted()?.focus?.(...args);
	}
	placeNote(...args: unknown[]) {
		this.hosted()?.placeNote?.(...args);
	}
	draw(...args: unknown[]) {
		this.hosted()?.draw?.(...args);
	}
	showTimeRange(...args: unknown[]) {
		this.hosted()?.showTimeRange?.(...args);
	}
	playWar(...args: unknown[]) {
		this.hosted()?.playWar?.(...args);
	}
	addModule(...args: unknown[]) {
		this.hosted()?.addModule?.(...args);
	}

	/** The big tabs in the order they've been put in. */
	private ordered(): HubSection[] {
		const order = this.plugin.settings.hubOrder ?? [];
		const rank = (s: HubSection) => {
			const at = order.indexOf(s.id);
			return at < 0 ? order.length + HUB_SECTIONS.indexOf(s) : at;
		};
		return [...HUB_SECTIONS].sort((a, b) => rank(a) - rank(b));
	}

	private hiddenTab(id: string): boolean {
		return (this.plugin.settings.hubHidden ?? []).includes(id);
	}

	private async saveTabs() {
		await this.plugin.saveSettings();
		this.refresh();
	}

	/** Puts the big tabs and the sidebar back as they came. */
	async resetTabs() {
		const s = this.plugin.settings;
		s.hubOrder = s.hubHidden = s.hubRail = undefined;
		this.setRail(208);
		await this.saveTabs();
	}

	private tabMenu(s: HubSection, evt: MouseEvent) {
		const shown = this.ordered().filter((x) => this.visible(x).length && !this.hiddenTab(x.id));
		const at = shown.indexOf(s);
		const step = (to: number) => {
			const order = shown.map((x) => x.id);
			order.splice(at, 1);
			order.splice(to, 0, s.id);
			this.plugin.settings.hubOrder = order;
			void this.saveTabs();
		};
		const menu = new Menu();
		if (at > 0) menu.addItem((i) => i.setTitle("Move up").setIcon("arrow-up").onClick(() => step(at - 1)));
		if (at < shown.length - 1) menu.addItem((i) => i.setTitle("Move down").setIcon("arrow-down").onClick(() => step(at + 1)));
		// Settings stays, so nothing can be hidden for good.
		if (s.id !== "settings") menu.addItem((i) => i.setTitle(`Hide ${s.name}`).setIcon("eye-off").onClick(() => {
			this.plugin.settings.hubHidden = [...(this.plugin.settings.hubHidden ?? []), s.id];
			void this.saveTabs();
		}));
		for (const h of HUB_SECTIONS.filter((x) => this.hiddenTab(x.id))) menu.addItem((i) => i.setTitle(`Show ${h.name}`).setIcon("eye").onClick(() => {
			this.plugin.settings.hubHidden = this.plugin.settings.hubHidden?.filter((x) => x !== h.id);
			void this.saveTabs();
		}));
		menu.addSeparator();
		const compact = this.contentEl.hasClass("is-compact");
		menu.addItem((i) => i.setTitle(compact ? "Show names" : "Icons only").setIcon("panel-left").onClick(() => this.saveRail(this.setRail(compact ? 208 : 64))));
		menu.addItem((i) => i.setTitle("Reset tabs").setIcon("rotate-ccw").onClick(() => void this.resetTabs()));
		menu.showAtMouseEvent(evt);
	}

	private go(section: string, tab?: string) {
		this.section = section;
		if (tab) this.tabs.set(section, tab);
		this.app.workspace.requestSaveLayout();
		this.refresh();
		(this.leaf as unknown as { updateHeader?: () => void }).updateHeader?.();
	}

	private show(m: HubModule) {
		// The page being left is kept as it stands.
		const leaving = [...this.panes.values()].find((p) => p.el.hasClass("is-active"));
		if (leaving?.module !== m) this.remember(leaving?.view);
		// Between a view's modes, however it's reached, the same years stay in view.
		const sameView = leaving && leaving.module !== m && (m.modeOf === leaving.module.id || leaving.module.modeOf === m.id);
		const range = sameView ? leaving.view?.timeRange() : undefined;
		const shown = this.ensure(m);
		if (range) void shown.ready?.then(() => shown.view?.showTimeRange(range));
		for (const [id, p] of this.panes) {
			p.el.toggleClass("is-active", id === m.id);
			p.view?.setWaiting(id !== m.id);
		}
		shown.view?.onResize();
	}

	/** A page's place in the dashboard, filled just after it's been painted, so a tab answers at once. */
	private ensure(m: HubModule) {
		const found = this.panes.get(m.id);
		if (found) return found;
		const host = el("div", { cls: "uv-hub-pane" + (m.view ? "" : " is-page") }, this.stageEl);
		const pane: { el: HTMLElement; view?: UniverseViewBase; ready?: Promise<void>; module: HubModule } = { el: host, module: m };
		this.panes.set(m.id, pane);
		setIcon(el("div", { cls: "uv-hub-loading" }, host), LOGO_ICON);
		pane.ready = new Promise<void>((done) => window.setTimeout(done, 16)).then(async () => {
			if (this.panes.get(m.id) !== pane) return;
			if (m.view) {
				host.empty();
				pane.view = m.view(this.leaf, this.plugin);
				await pane.view.mount(host);
				const saved = this.own.get(m.id) ?? this.plugin.settings.viewStates?.[m.id];
				if (saved) await pane.view.setState(saved, { history: false });
				pane.view.setWaiting(!host.hasClass("is-active"));
			} else this.drawPage(host, m);
		}).catch((err) => {
			console.error(`UniverseView: couldn't open ${m.name}`, err);
			host.empty();
			el("p", { cls: "uv-hub-lead uv-hub-failed", text: `${m.name} couldn't open here. Try the button at the top right to open it in its own tab.` }, host);
		});
		return pane;
	}

	private drawPage(host: HTMLElement, m: HubModule) {
		const top = host.scrollTop;
		host.empty();
		const body = el("div", { cls: "uv-hub-page" }, host);
		m.draw?.(body, this);
		host.scrollTop = top;
	}

	/** Pages that show the vault's data follow it; settings pages keep what you're typing. */
	private redrawPages = debounce(() => {
		for (const p of this.panes.values()) if (p.module.id === "stats") this.drawPage(p.el, p.module);
	}, 400, true);

	run(id: string) {
		if (!this.plugin.runAction(id)) new Notice("Open a note first: this works on the current note.");
	}

	settingsInto(page: string, host: HTMLElement) {
		const tab = this.plugin.settingTab;
		if (!tab) return;
		tab.renderPage(page, host);
		// A change that adds or removes rows redraws whichever settings page is open here.
		tab.hubRedraw = () => {
			const p = this.activePane();
			if (p?.module.id.startsWith("set-") && p.module.id !== "set-modules") this.drawPage(p.el, p.module);
		};
	}

	modulesInto(host: HTMLElement) {
		el("p", { cls: "uv-hub-lead", text: "Switch off what you don't use: it leaves the dashboard, the ribbon and the actions list. Notes aren't touched." }, host);
		// Resets, in one row.
		const resets = el("div", { cls: "uv-mod-resets" }, host);
		const reset = (label: string, tip: string, run: () => void) => {
			const b = el("button", { text: label, title: tip }, resets);
			b.addEventListener("click", run);
		};
		reset("Reset tabs", "Big tabs back in their first order and shown. Drag them to move, or right-click one to hide or show.", () => void this.resetTabs());
		reset("Reset all views", "Every view forgets its filters, layers and focus. The arrow at the top right resets only the one you are on.", () => void this.resetViews());
		reset("Reset all cards", "Every page's card layout goes back as it came. Customise a page from its toolbar.", () => {
			this.plugin.settings.cardLayouts = undefined;
			void this.plugin.saveSettings().then(() => this.plugin.index.requestRebuild());
		});
		// Every page as one switch: name beside it, what it does on hover.
		const list = el("div", { cls: "uv-mod-list" }, host);
		for (const s of HUB_SECTIONS) {
			const mods = s.modules.filter((m) => !m.fixed);
			if (!mods.length) continue;
			const group = el("div", { cls: "uv-mod-group" }, list);
			el("h3", { cls: "uv-mod-head", text: s.name }, group);
			for (const m of mods) {
				const row = el("label", { cls: "uv-mod", title: m.desc }, group);
				el("span", { cls: "uv-mod-name", text: m.name }, row);
				const box = el("input", { cls: "uv-switch", attr: { type: "checkbox" } }, row);
				box.checked = this.plugin.moduleOn(m.id);
				box.addEventListener("change", () => void this.plugin.setModule(m.id, box.checked).then(() => this.refreshTabsOnly()));
			}
		}
	}
	/** Tabs change, but the page you're on (the switches) stays. */
	private refreshTabsOnly() {
		for (const [id, p] of this.panes) {
			if (this.plugin.moduleOn(id) || p.module.fixed) continue;
			void p.view?.unmount();
			p.el.remove();
			this.panes.delete(id);
		}
		this.refresh();
	}

	/** Every map open in the dashboard, for redrawing after a change to how maps look. */
	hostedMaps(): MapView[] {
		const v = this.panes.get(VIEW_MAP)?.view;
		return v ? [v as MapView] : [];
	}
}
