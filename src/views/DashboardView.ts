import { MarkdownRenderer, Menu, Modal, Notice, Setting, TFile, ViewStateResult, debounce } from "obsidian";
import type UniverseViewPlugin from "../main";
import type { Board, BoardModule, ModuleKind } from "../settings";
import { buildBlock, Renderer } from "../codeblocks";
import { el, icon, iconButton, toggleChip } from "../render/common";
import { ListKind, kinCount, listRows, renderList, renderStats } from "../render/panels";
import { EntityInputSuggest } from "../ui/suggest";
import { UniverseViewBase } from "./base";
import { TextPrompt } from "../ui/TextPrompt";
import { COLS, settle } from "../render/layout";

export const VIEW_DASHBOARD = "chronicle-dashboard";

const ROW = 40;
const GAP = 12;
const PAD = 14;
/** Below this width modules stack in one column (and can't be dragged). */
const STACK_BELOW = 620;

interface KindInfo {
	name: string;
	icon: string;
	/** Code block that renders it, for the visual views. */
	block?: string;
	/** Full view it expands into. */
	view?: string;
	w: number;
	h: number;
	/** Option that names the module's main subject, edited with a picker. */
	subject?: { key: string; label: string; types: ("person" | "culture" | "place" | "event" | "map")[] };
	help: string;
}

export const MODULE_KINDS: Record<ModuleKind, KindInfo> = {
	timeline: { name: "Timeline", icon: "calendar-range", block: "chronicle-timeline", view: "chronicle-timeline", w: 12, h: 7, help: "group: culture | place | person | tag | type\nlifespans: true\nshow-cultures: true\nfrom: 1200\nto: 1300\nimportance: 3\ntags: war\nsearch: words" },
	family: { name: "Family tree", icon: "git-fork", block: "chronicle-family", view: "chronicle-family", w: 7, h: 11, subject: { key: "root", label: "Start from", types: ["person"] }, help: "root: Person name\nup: 2\ndown: 2\nsiblings: true" },
	graph: { name: "Connections", icon: "waypoints", block: "chronicle-graph", view: "chronicle-network", w: 6, h: 10, subject: { key: "focus", label: "Centre on", types: ["person", "culture", "place", "event"] }, help: "focus: Note name\ndepth: 2\ntypes: people, cultures, places, events\nlabels: true" },
	lineage: { name: "Lineage of groups", icon: "git-branch", block: "chronicle-lineage", view: "chronicle-lineage", w: 7, h: 8, subject: { key: "focus", label: "Highlight", types: ["culture"] }, help: "focus: Group name" },
	calendar: { name: "Calendar", icon: "calendar-days", block: "chronicle-calendar", view: "chronicle-calendar", w: 7, h: 10, help: "folder: World\nmode: month (or year, agenda)\ndate: 14 Highsun SE 3" },
	houses: { name: "Houses", icon: "castle", block: "chronicle-houses", view: "chronicle-houses", w: 12, h: 10, help: "folder: World\ndescent: true\nall: false" },
	org: { name: "Organisation chart", icon: "network", block: "chronicle-org", view: "chronicle-orgchart", w: 12, h: 12, subject: { key: "root", label: "Organisation", types: ["culture"] }, help: "root: Organisation name\nat: 1250\nmembers: true\ntimeline: true\nrelations: true\nties: true\ndepth: 3" },
	map: { name: "Map", icon: "map", block: "chronicle-map", view: "chronicle-map", w: 7, h: 11, subject: { key: "map", label: "Map", types: ["map"] }, help: "map: Map note name (or world)\ntrace: Person name\nfocus: Place name\nevents-only: true" },
	stats: { name: "At a glance", icon: "gauge", w: 12, h: 3, help: "(no options)" },
	events: { name: "Key events", icon: "calendar-clock", view: "chronicle-timeline", w: 5, h: 6, help: "limit: 10" },
	people: { name: "People", icon: "users", view: "chronicle-family", w: 5, h: 6, help: "limit: 10" },
	places: { name: "Places", icon: "map-pin", view: "chronicle-map", w: 5, h: 6, help: "limit: 10" },
	cultures: { name: "Houses & groups", icon: "flag", view: "chronicle-lineage", w: 5, h: 6, help: "limit: 10" },
	recent: { name: "Recently edited", icon: "history", w: 5, h: 6, help: "limit: 10" },
	wars: { name: "Wars", icon: "swords", view: "chronicle-map", w: 5, h: 6, help: "limit: 10" },
	note: { name: "Note", icon: "file-text", w: 5, h: 8, subject: { key: "note", label: "Note", types: ["person", "culture", "place", "event", "map"] }, help: "note: Note name (any note in the vault)" },
};

const uid = () => Math.random().toString(36).slice(2, 9);

function mod(kind: ModuleKind, x: number, y: number, w: number, h: number, source = ""): BoardModule {
	return { id: uid(), kind, source, x, y, w, h };
}

/** Ready-made boards for common kinds of project. */
export const PRESETS: { id: string; name: string; icon: string; desc: string; make: (p: UniverseViewPlugin, scope: string) => BoardModule[] }[] = [
	{
		id: "world",
		name: "World overview",
		icon: "globe",
		desc: "Numbers, the whole timeline, the map and the most important notes.",
		make: () => [mod("stats", 0, 0, 12, 3), mod("timeline", 0, 3, 12, 7, "group: culture"), mod("map", 0, 10, 7, 11), mod("events", 7, 10, 5, 6), mod("cultures", 7, 16, 5, 5), mod("people", 0, 21, 6, 6), mod("recent", 6, 21, 6, 6)],
	},
	{
		id: "genealogy",
		name: "Genealogy desk",
		icon: "git-fork",
		desc: "A big family tree with lifespans underneath and the people you work on most.",
		make: (p, scope) => {
			const root = p.index.all("person").filter((e) => !scope || e.path.startsWith(scope + "/")).sort((a, b) => kinCount(p, b) - kinCount(p, a))[0];
			return [mod("family", 0, 0, 8, 12, root ? `root: ${root.name}\nup: 2\ndown: 2` : ""), mod("people", 8, 0, 4, 6), mod("recent", 8, 6, 4, 6), mod("timeline", 0, 12, 12, 7, "lifespans: true\ngroup: culture")];
		},
	},
	{
		id: "atlas",
		name: "Atlas",
		icon: "map",
		desc: "A large map with its places and what happened there, plus a timeline by place.",
		make: () => [mod("map", 0, 0, 8, 14), mod("places", 8, 0, 4, 7), mod("events", 8, 7, 4, 7), mod("timeline", 0, 14, 12, 7, "group: place")],
	},
	{
		id: "chronology",
		name: "Chronology",
		icon: "calendar-range",
		desc: "Timeline grouped by culture, the rise and fall of cultures, and key events.",
		make: () => [mod("timeline", 0, 0, 12, 10, "group: culture\nlifespans: true\nshow-cultures: true"), mod("lineage", 0, 10, 7, 8), mod("events", 7, 10, 5, 8)],
	},
	{
		id: "story",
		name: "Story board",
		icon: "waypoints",
		desc: "Who is connected to whom, the cast and the plot's events in order.",
		make: () => [mod("graph", 0, 0, 7, 12), mod("people", 7, 0, 5, 6), mod("events", 7, 6, 5, 6), mod("timeline", 0, 12, 12, 7, "group: person")],
	},
];

/** A dashboard of movable, resizable modules: several timelines, maps, trees and lists side by side. */
export class DashboardView extends UniverseViewBase {
	private scroller!: HTMLElement;
	private boardEl!: HTMLElement;
	private hosts = new Map<string, ModuleHost>();
	private boardId = "";
	private locked = false;
	private colW = 80;
	private stacked = false;
	private placeholder?: HTMLElement;
	private resizeObs?: ResizeObserver;
	private saveSoon = debounce(() => void this.plugin.saveSettings(), 600, true);

	getViewType() {
		return VIEW_DASHBOARD;
	}
	getDisplayText() {
		return this.board ? `Board: ${this.board.name}` : "UniverseView board";
	}
	getIcon() {
		return "layout-dashboard";
	}

	getState(): Record<string, unknown> {
		return { board: this.boardId };
	}

	async setState(state: unknown, result: ViewStateResult) {
		const s = state as { board?: string; scope?: string } | undefined;
		if (s?.board && this.plugin.settings.boards.some((b) => b.id === s.board)) this.boardId = s.board;
		else if (s?.scope !== undefined && this.isBuilt) {
			// Opened from a world's overview: use a board for that world, making one if needed.
			const match = this.plugin.settings.boards.find((b) => b.scope === s.scope);
			this.boardId = match?.id ?? this.boardId;
		}
		if (this.isBuilt) this.renderBoard();
		await super.setState(state, result);
	}

	private get board(): Board | undefined {
		return this.plugin?.settings.boards.find((b) => b.id === this.boardId);
	}

	protected build() {
		const s = this.plugin.settings;
		if (!s.boards.length) s.boards.push(this.newBoard("My board", this.defaultScope() ?? "", "world"));
		if (!this.board) this.boardId = s.boards.find((b) => b.id === s.activeBoard)?.id ?? s.boards[0].id;
		this.scroller = el("div", { cls: "universeview-board-scroll" }, this.body);
		this.boardEl = el("div", { cls: "universeview-board" }, this.scroller);
		this.bindLinking();
		this.resizeObs = new ResizeObserver(() => this.layout(false));
		this.resizeObs.observe(this.scroller);
		this.renderBoard();
	}

	private newBoard(name: string, scope: string, preset: string): Board {
		const p = PRESETS.find((x) => x.id === preset) ?? PRESETS[0];
		return { id: uid(), name, scope, modules: settle(p.make(this.plugin, scope)) };
	}

	protected onIndexChanged() {
		for (const h of this.hosts.values()) h.refresh();
	}

	async onClose() {
		this.resizeObs?.disconnect();
		for (const h of this.hosts.values()) h.destroy();
		this.hosts.clear();
	}

	// ---- Toolbar --------------------------------------------------------------------------------

	private fillToolbar() {
		this.rebuildToolbar(() => {
			const s = this.plugin.settings;
			const board = this.board!;
			const left = this.group();
			const select = el("select", { cls: "dropdown universeview-select", attr: { "aria-label": "Board" } }, left);
			for (const b of s.boards) {
				const o = el("option", { text: b.name }, select);
				o.value = b.id;
			}
			el("option", { text: "＋ New board…", attr: { value: "__new" } }, select);
			select.value = board.id;
			select.addEventListener("change", () => {
				if (select.value === "__new") {
					select.value = board.id;
					this.promptNewBoard();
					return;
				}
				this.switchTo(select.value);
			});
			this.scopePicker(left, board.scope, (v) => {
				board.scope = v;
				this.save();
				this.renderBoard();
			});
			// One note the whole board looks at; with Linked on, picking something in a module sets it.
			const focusBox = this.group();
			this.entityPicker(focusBox, undefined, board.focus, "Focus the board on…", (k) => this.setFocus(k));
			toggleChip(focusBox, "Linked", "link-2", !!board.linked, (v) => {
				board.linked = v;
				this.save();
				this.boardEl.toggleClass("is-linked", v);
				if (v) new Notice("Linked: click a person, place, group or event in any module to focus the whole board on it. Ctrl-click still opens it.");
			}).setAttribute("title", "Picking something in one module focuses every module on it");
			const mid = this.group();
			const add = el("button", { cls: "universeview-chip mod-cta-chip" }, mid);
			const ic = el("span", { cls: "universeview-chip-icon" }, add);
			icon(ic, "plus");
			el("span", { text: "Add module" }, add);
			add.addEventListener("click", (evt) => this.addMenu(evt));
			toggleChip(mid, "Lock layout", "lock", this.locked, (v) => {
				this.locked = v;
				this.boardEl.toggleClass("is-locked", v);
			});
			this.spacer();
			const right = this.group();
			iconButton(right, "layout-template", "Start from a template", (evt) => this.templateMenu(evt));
			iconButton(right, "more-horizontal", "Board options", (evt) => this.boardMenu(evt));
		});
	}

	private addMenu(evt: MouseEvent) {
		const menu = new Menu();
		const groups: ModuleKind[][] = [["timeline", "family", "graph", "lineage", "org", "map", "calendar", "houses"], ["stats", "events", "people", "places", "cultures", "wars", "recent", "note"]];
		groups.forEach((g, i) => {
			if (i) menu.addSeparator();
			for (const k of g) menu.addItem((it) => it.setTitle(MODULE_KINDS[k].name).setIcon(MODULE_KINDS[k].icon).onClick(() => this.addModule(k)));
		});
		menu.showAtMouseEvent(evt);
	}

	addModule(kind: ModuleKind, source = "") {
		const board = this.board!;
		const info = MODULE_KINDS[kind];
		const bottom = board.modules.reduce((m, x) => Math.max(m, x.y + x.h), 0);
		const m = mod(kind, 0, bottom, info.w, info.h, source);
		board.modules.push(m);
		board.modules = settle(board.modules);
		this.save();
		this.renderBoard();
		const host = this.hosts.get(m.id);
		host?.el.addClass("is-new");
		host?.el.scrollIntoView({ behavior: "smooth", block: "nearest" });
	}

	private templateMenu(evt: MouseEvent) {
		const menu = new Menu();
		for (const p of PRESETS) {
			menu.addItem((it) =>
				it.setTitle(`New board: ${p.name}`).setIcon(p.icon).onClick(() => {
					const b = this.newBoard(p.name, this.board?.scope ?? "", p.id);
					this.plugin.settings.boards.push(b);
					this.switchTo(b.id);
					new Notice(`${p.name}: ${p.desc}`);
				}),
			);
		}
		menu.showAtMouseEvent(evt);
	}

	private boardMenu(evt: MouseEvent) {
		const s = this.plugin.settings;
		const board = this.board!;
		const menu = new Menu();
		menu.addItem((it) => it.setTitle("Rename board…").setIcon("pencil").onClick(() => new TextPrompt(this.plugin, "Rename board", board.name, (v) => {
			board.name = v;
			this.save();
			this.fillToolbar();
			(this.leaf as unknown as { updateHeader?: () => void }).updateHeader?.();
		}).open()));
		menu.addItem((it) => it.setTitle("Duplicate board").setIcon("copy").onClick(() => {
			const copy: Board = { ...structuredClone(board), id: uid(), name: `${board.name} (copy)` };
			copy.modules.forEach((m) => (m.id = uid()));
			s.boards.push(copy);
			this.switchTo(copy.id);
		}));
		menu.addItem((it) => it.setTitle("Tidy layout").setIcon("align-vertical-justify-start").onClick(() => {
			board.modules = settle(board.modules);
			this.save();
			this.layout(true);
		}));
		menu.addSeparator();
		menu.addItem((it) => {
			it.setTitle("Delete board").setIcon("trash-2").onClick(() => {
				if (s.boards.length < 2) {
					new Notice("This is the only board; make another one first.");
					return;
				}
				s.boards = s.boards.filter((b) => b.id !== board.id);
				this.switchTo(s.boards[0].id);
			});
			(it as unknown as { setWarning?: (v: boolean) => void }).setWarning?.(true);
		});
		menu.showAtMouseEvent(evt);
	}

	private promptNewBoard() {
		new TextPrompt(this.plugin, "New board", "", (name) => {
			const b = this.newBoard(name, this.board?.scope ?? "", "world");
			this.plugin.settings.boards.push(b);
			this.switchTo(b.id);
		}).open();
	}

	private switchTo(id: string) {
		this.boardId = id;
		this.plugin.settings.activeBoard = id;
		this.save();
		this.renderBoard();
		(this.leaf as unknown as { updateHeader?: () => void }).updateHeader?.();
		this.app.workspace.requestSaveLayout();
	}

	save() {
		this.saveSoon();
	}

	// ---- Board ----------------------------------------------------------------------------------

	private renderBoard() {
		const board = this.board;
		if (!board) return;
		this.plugin.settings.activeBoard = board.id;
		this.fillToolbar();
		for (const h of this.hosts.values()) h.destroy();
		this.hosts.clear();
		this.boardEl.empty();
		this.boardEl.toggleClass("is-locked", this.locked);
		this.boardEl.toggleClass("is-linked", !!board.linked);
		this.placeholder = el("div", { cls: "universeview-board-placeholder" }, this.boardEl);
		board.modules.forEach((m, i) => {
			const host = new ModuleHost(this, this.plugin, m, board);
			host.el.style.setProperty("--i", String(i));
			this.hosts.set(m.id, host);
		});
		this.layout(false);
		if (!board.modules.length) {
			const empty = el("div", { cls: "universeview-board-empty" }, this.boardEl);
			el("div", { cls: "universeview-empty-title", text: "This board is empty" }, empty);
			el("div", { cls: "universeview-empty-body", text: "Add a module, or start from a template." }, empty);
			const b = el("button", { cls: "mod-cta", text: "Add module" }, empty);
			b.addEventListener("click", (evt) => this.addMenu(evt));
		}
	}

	get boardElement(): HTMLElement {
		return this.boardEl;
	}

	/** Pixel box of a grid rectangle. */
	box(r: { x: number; y: number; w: number; h: number }) {
		return {
			left: PAD + r.x * (this.colW + GAP),
			top: PAD + r.y * (ROW + GAP),
			width: r.w * this.colW + (r.w - 1) * GAP,
			height: r.h * ROW + (r.h - 1) * GAP,
		};
	}

	/** Grid cell nearest to a pixel position. */
	cell(left: number, top: number) {
		return { x: Math.round((left - PAD) / (this.colW + GAP)), y: Math.max(0, Math.round((top - PAD) / (ROW + GAP))) };
	}

	get cellSize() {
		return { w: this.colW + GAP, h: ROW + GAP };
	}

	/** Places every module; `animate` lets them glide to their new spots. */
	layout(animate: boolean, skip?: string) {
		const board = this.board;
		if (!board) return;
		const width = this.scroller.clientWidth || 900;
		this.stacked = width < STACK_BELOW;
		this.boardEl.toggleClass("is-stacked", this.stacked);
		this.boardEl.toggleClass("is-animating", animate);
		this.colW = Math.max(20, (width - PAD * 2 - GAP * (COLS - 1)) / COLS);
		let bottom = 0;
		if (this.stacked) {
			let top = PAD;
			for (const m of [...board.modules].sort((a, b) => a.y - b.y || a.x - b.x)) {
				const host = this.hosts.get(m.id);
				if (!host) continue;
				const h = m.h * ROW + (m.h - 1) * GAP;
				host.place({ left: PAD, top, width: width - PAD * 2, height: h });
				top += h + GAP;
			}
			bottom = top;
		} else {
			for (const m of board.modules) {
				const b = this.box(m);
				bottom = Math.max(bottom, b.top + b.height);
				if (m.id !== skip) this.hosts.get(m.id)?.place(b);
			}
		}
		this.boardEl.style.height = `${bottom + PAD + (this.stacked ? 0 : ROW * 3)}px`;
	}

	get isStacked() {
		return this.stacked;
	}

	get isLocked() {
		return this.locked;
	}

	/** Live re-layout while a module is dragged or resized to `target`. */
	preview(target: BoardModule) {
		const board = this.board!;
		const others = board.modules.map((m) => (m.id === target.id ? target : m));
		const settled = settle(others, target.id);
		for (const s of settled) {
			const m = board.modules.find((x) => x.id === s.id)!;
			if (m.id === target.id) continue;
			m.x = s.x;
			m.y = s.y;
		}
		const me = settled.find((s) => s.id === target.id)!;
		const ph = this.placeholder!;
		const b = this.box(me);
		ph.addClass("is-visible");
		Object.assign(ph.style, { left: `${b.left}px`, top: `${b.top}px`, width: `${b.width}px`, height: `${b.height}px` });
		this.layout(true, target.id);
		return me;
	}

	commit(m: BoardModule, to: { x: number; y: number; w: number; h: number }) {
		Object.assign(m, to);
		this.board!.modules = settle(this.board!.modules, m.id);
		this.placeholder?.removeClass("is-visible");
		this.layout(true);
		this.save();
	}

	removeModule(id: string) {
		const board = this.board!;
		const host = this.hosts.get(id);
		host?.el.addClass("is-leaving");
		window.setTimeout(() => {
			host?.destroy();
			this.hosts.delete(id);
			board.modules = settle(board.modules.filter((m) => m.id !== id));
			this.save();
			this.layout(true);
		}, 160);
	}

	duplicateModule(m: BoardModule) {
		const copy = { ...m, id: uid(), y: m.y + m.h };
		this.board!.modules.push(copy);
		this.board!.modules = settle(this.board!.modules, copy.id);
		this.save();
		this.renderBoard();
	}

	rerender(id: string) {
		this.hosts.get(id)?.mount();
	}

	/** Focuses every module that can follow it on one note (or clears the focus). */
	setFocus(key: string | undefined) {
		const board = this.board;
		if (!board || board.focus === key) return;
		board.focus = key;
		this.save();
		for (const h of this.hosts.values()) if (h.followsFocus()) h.mount();
		this.fillToolbar();
	}

	private boundLinking = false;

	/** With Linked on, a click on a note inside a module focuses the board instead of opening it. */
	protected bindLinking() {
		if (this.boundLinking) return;
		this.boundLinking = true;
		this.registerDomEvent(this.boardEl, "click", (evt: MouseEvent) => {
			if (!this.board?.linked || evt.ctrlKey || evt.metaKey) return;
			const t = evt.target as HTMLElement;
			if (!t.closest(".universeview-module-body")) return;
			const hit = t.closest<HTMLElement>("[data-key]");
			const key = hit?.dataset.key;
			if (!key || !this.plugin.index.get(key)) return;
			evt.preventDefault();
			evt.stopPropagation();
			this.setFocus(key);
		}, { capture: true });
	}
}

/** One module: a header to drag, a corner to resize and the content itself. */
class ModuleHost {
	el: HTMLElement;
	private bodyEl: HTMLElement;
	private titleEl: HTMLElement;
	private renderer?: Renderer;
	private refreshSoon = debounce(() => this.refreshNow(), 300, true);

	constructor(private view: DashboardView, private plugin: UniverseViewPlugin, private m: BoardModule, private board: Board) {
		const info = MODULE_KINDS[m.kind];
		this.el = el("section", { cls: `universeview-module kind-${m.kind}` }, view.boardElement);
		const head = el("header", { cls: "universeview-module-head" }, this.el);
		const grip = el("span", { cls: "universeview-module-grip" }, head);
		icon(grip, "grip-vertical");
		const ic = el("span", { cls: "universeview-module-icon" }, head);
		icon(ic, info.icon);
		this.titleEl = el("span", { cls: "universeview-module-title" }, head);
		const tools = el("div", { cls: "universeview-module-tools" }, head);
		iconButton(tools, "sliders-horizontal", "Module options", () => this.openSettings());
		if (info.view) iconButton(tools, "maximize-2", "Open as a full view", () => this.expand());
		iconButton(tools, "x", "Remove module", () => view.removeModule(m.id));
		this.bodyEl = el("div", { cls: "universeview-module-body universeview-block-host" }, this.el);
		const handle = el("div", { cls: "universeview-module-resize", title: "Drag to resize" }, this.el);
		this.bindDrag(head);
		this.bindResize(handle);
		head.addEventListener("contextmenu", (evt) => {
			evt.preventDefault();
			const menu = new Menu();
			menu.addItem((i) => i.setTitle("Options…").setIcon("sliders-horizontal").onClick(() => this.openSettings()));
			if (info.view) menu.addItem((i) => i.setTitle("Open as a full view").setIcon("maximize-2").onClick(() => this.expand()));
			menu.addItem((i) => i.setTitle("Duplicate").setIcon("copy").onClick(() => view.duplicateModule(m)));
			menu.addSeparator();
			menu.addItem((i) => i.setTitle("Remove").setIcon("x").onClick(() => view.removeModule(m.id)));
			menu.showAtMouseEvent(evt);
		});
		head.addEventListener("dblclick", (evt) => {
			if ((evt.target as HTMLElement).closest(".universeview-module-tools")) return;
			this.openSettings();
		});
		this.mount();
	}

	place(b: { left: number; top: number; width: number; height: number }) {
		Object.assign(this.el.style, { left: `${b.left}px`, top: `${b.top}px`, width: `${b.width}px`, height: `${b.height}px` });
	}

	private options(): Record<string, string> {
		const out: Record<string, string> = {};
		for (const line of this.m.source.split(/\r?\n/)) {
			const i = line.indexOf(":");
			if (i > 0 && !line.trim().startsWith("#")) out[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
		}
		return out;
	}

	/**
	 * The board's world applies unless the module names its own folder; the board's focus, when set,
	 * becomes each module's subject where it fits (a person roots the tree, a group the lineage…).
	 */
	private sourceWithScope(): string {
		const o = this.options();
		const scoped = ["timeline", "graph", "lineage", "map"].includes(this.m.kind);
		let src = scoped && this.board.scope && !("folder" in o) ? `folder: ${this.board.scope}\n${this.m.source}` : this.m.source;
		const f = this.board.focus ? this.plugin.index.get(this.board.focus) : undefined;
		if (f) {
			const line =
				this.m.kind === "family" ? (f.type === "person" ? `root: ${f.key}` : "")
				: this.m.kind === "org" ? (f.type === "culture" || this.plugin.realms().nodes.has(f.key) ? `root: ${f.key}` : "")
				: this.m.kind === "lineage" ? (f.type === "culture" ? `focus: ${f.key}` : "")
				: ["graph", "map", "timeline"].includes(this.m.kind) ? `focus: ${f.key}`
				: "";
			if (line) src += `\n${line}`;
		}
		return src;
	}

	/** Whether the board's focus changes this module (it's redrawn when the focus moves). */
	followsFocus(): boolean {
		return ["family", "org", "lineage", "graph", "map", "timeline", "note"].includes(this.m.kind);
	}

	mount() {
		this.renderer?.destroy();
		this.renderer = undefined;
		this.bodyEl.empty();
		const info = MODULE_KINDS[this.m.kind];
		const o = this.options();
		// The board's focus names the module when it's what the module shows.
		const focused = this.board.focus && this.followsFocus() && this.sourceWithScope().includes(this.board.focus) ? this.plugin.index.get(this.board.focus)?.name : undefined;
		const subject = focused ?? (info.subject ? o[info.subject.key] : undefined);
		this.titleEl.setText(this.m.title || (subject && this.m.kind !== "map" ? `${info.name}: ${subject.replace(/^\[\[|\]\]$/g, "")}` : subject && this.m.kind === "map" ? subject.replace(/^\[\[|\]\]$/g, "") : info.name));
		try {
			if (info.block) {
				this.renderer = buildBlock(info.block, this.sourceWithScope(), this.bodyEl, "");
			} else this.renderStatic();
		} catch (err) {
			const box = el("div", { cls: "universeview-module-error" }, this.bodyEl);
			el("div", { text: (err as Error).message }, box);
			const b = el("button", { text: "Edit options" }, box);
			b.addEventListener("click", () => this.openSettings());
		}
	}

	private renderStatic() {
		const p = this.plugin;
		const scope = this.board.scope || undefined;
		const box = el("div", { cls: "universeview-module-scroll" }, this.bodyEl);
		const limit = Number(this.options().limit) || 10;
		switch (this.m.kind) {
			case "stats":
				renderStats(p, box, scope);
				break;
			case "note": {
				// The board's focus, when set, is the note shown (unless this module names its own).
				const name = (this.options().note ?? this.board.focus)?.replace(/^\[\[|\]\]$/g, "");
				const file = name ? p.app.metadataCache.getFirstLinkpathDest(name, "") : null;
				if (!(file instanceof TFile)) {
					el("div", { cls: "universeview-ov-none", text: name ? `No note called “${name}”.` : "Choose a note in the module options." }, box);
					break;
				}
				box.addClass("markdown-rendered", "universeview-module-note");
				void p.app.vault.cachedRead(file).then((text) => {
					const md = text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
					void MarkdownRenderer.render(p.app, md, box, file.path, this.view);
				});
				break;
			}
			default: {
				const kind = this.m.kind as ListKind;
				const { rows, detail } = listRows(p, kind, scope, limit);
				renderList(p, box, rows, detail, box);
			}
		}
	}

	refresh() {
		this.refreshSoon();
	}

	private refreshNow() {
		if (this.renderer) void this.renderer.refresh();
		else this.mount();
	}

	destroy() {
		this.renderer?.destroy();
		this.renderer = undefined;
		this.el.remove();
	}

	private expand() {
		const info = MODULE_KINDS[this.m.kind];
		if (!info.view) return;
		const o = this.options();
		const idx = this.plugin.index;
		const folder = o.folder ?? this.board.scope ?? "";
		const state: Record<string, unknown> = {};
		switch (this.m.kind) {
			case "family":
				state.options = { root: idx.findByName(o.root ?? "")?.key };
				break;
			case "map":
				state.options = { folder, ...(o.map && o.map.toLowerCase() !== "world" ? { map: idx.findByName(o.map)?.key } : {}) };
				break;
			case "lineage":
				state.options = { folder };
				break;
			default:
				state.options = { filter: { folder } };
		}
		void this.plugin.activateView(info.view, state, "tab");
	}

	private openSettings() {
		new ModuleSettingsModal(this.plugin, this.m, () => {
			this.view.save();
			this.mount();
		}).open();
	}

	// ---- Drag & resize ------------------------------------------------------------------------------

	private bindDrag(head: HTMLElement) {
		head.addEventListener("pointerdown", (evt) => {
			if (evt.button !== 0 || this.view.isLocked || this.view.isStacked) return;
			if ((evt.target as HTMLElement).closest(".universeview-module-tools, button, input, select")) return;
			evt.preventDefault();
			const start = { px: evt.clientX, py: evt.clientY, left: this.el.offsetLeft, top: this.el.offsetTop };
			let target = { ...this.m };
			let moved = false;
			head.setPointerCapture(evt.pointerId);
			const move = (e: PointerEvent) => {
				const dx = e.clientX - start.px;
				const dy = e.clientY - start.py;
				if (!moved && Math.hypot(dx, dy) < 4) return;
				if (!moved) {
					moved = true;
					this.el.addClass("is-dragging");
				}
				const left = start.left + dx;
				const top = start.top + dy;
				this.el.style.left = `${left}px`;
				this.el.style.top = `${top}px`;
				const c = this.view.cell(left, top);
				const x = Math.max(0, Math.min(COLS - this.m.w, c.x));
				if (x !== target.x || c.y !== target.y) target = this.view.preview({ ...this.m, x, y: c.y });
			};
			const up = () => {
				head.removeEventListener("pointermove", move);
				head.removeEventListener("pointerup", up);
				head.removeEventListener("pointercancel", up);
				if (!moved) return;
				this.el.removeClass("is-dragging");
				this.view.commit(this.m, { x: target.x, y: target.y, w: this.m.w, h: this.m.h });
			};
			head.addEventListener("pointermove", move);
			head.addEventListener("pointerup", up);
			head.addEventListener("pointercancel", up);
		});
	}

	private bindResize(handle: HTMLElement) {
		handle.addEventListener("pointerdown", (evt) => {
			if (evt.button !== 0 || this.view.isLocked) return;
			evt.preventDefault();
			evt.stopPropagation();
			const start = { px: evt.clientX, py: evt.clientY, w: this.el.offsetWidth, h: this.el.offsetHeight };
			let target = { ...this.m };
			handle.setPointerCapture(evt.pointerId);
			this.el.addClass("is-resizing");
			const size = this.view.cellSize;
			const move = (e: PointerEvent) => {
				const width = Math.max(size.w * 2 - 12, start.w + e.clientX - start.px);
				const height = Math.max(size.h * 3 - 12, start.h + e.clientY - start.py);
				if (!this.view.isStacked) this.el.style.width = `${width}px`;
				this.el.style.height = `${height}px`;
				const w = this.view.isStacked ? this.m.w : Math.max(2, Math.min(COLS - this.m.x, Math.round((width + 12) / size.w)));
				const h = Math.max(3, Math.round((height + 12) / size.h));
				if (w !== target.w || h !== target.h) target = this.view.preview({ ...this.m, w, h });
			};
			const up = () => {
				handle.removeEventListener("pointermove", move);
				handle.removeEventListener("pointerup", up);
				handle.removeEventListener("pointercancel", up);
				this.el.removeClass("is-resizing");
				this.view.commit(this.m, { x: target.x, y: target.y, w: target.w, h: target.h });
			};
			handle.addEventListener("pointermove", move);
			handle.addEventListener("pointerup", up);
			handle.addEventListener("pointercancel", up);
		});
	}
}

/** Title, main subject and options of a module. */
class ModuleSettingsModal extends Modal {
	constructor(private plugin: UniverseViewPlugin, private m: BoardModule, private onSave: () => void) {
		super(plugin.app);
	}

	onOpen() {
		const info = MODULE_KINDS[this.m.kind];
		this.modalEl.addClass("universeview-module-modal", "universeview-scope");
		this.titleEl.setText(`${info.name} options`);
		let title = this.m.title ?? "";
		let source = this.m.source;
		new Setting(this.contentEl).setName("Title").setDesc("Leave empty for an automatic title.").addText((t) => t.setValue(title).setPlaceholder(info.name).onChange((v) => (title = v)));
		let area: HTMLTextAreaElement | undefined;
		if (info.subject) {
			const subj = info.subject;
			const current = source.match(new RegExp(`^${subj.key}:\\s*(.*)$`, "mi"))?.[1] ?? "";
			new Setting(this.contentEl).setName(subj.label).addText((t) => {
				t.setValue(current.replace(/^\[\[|\]\]$/g, "")).setPlaceholder(this.m.kind === "map" ? "world, or a map note" : "Type a name…");
				const apply = (name: string) => {
					const line = `${subj.key}: ${name}`;
					const re = new RegExp(`^${subj.key}:.*$`, "mi");
					source = name ? (re.test(source) ? source.replace(re, line) : `${line}\n${source}`.trim()) : source.replace(re, "").trim();
					if (area) area.value = source;
				};
				new EntityInputSuggest(this.app, t.inputEl, this.plugin, this.m.kind === "note" ? undefined : subj.types, (e) => apply(e.name));
				t.onChange((v) => apply(v.trim()));
			});
		}
		if (info.block || info.help !== "(no options)") {
			const s = new Setting(this.contentEl).setName("Options").setDesc("One “key: value” per line, as in an embedded code block.");
			s.settingEl.addClass("universeview-module-options");
			area = el("textarea", { cls: "universeview-module-source", attr: { rows: "6", spellcheck: "false" } }, this.contentEl);
			area.value = source;
			area.addEventListener("input", () => (source = area!.value));
			const help = el("details", { cls: "universeview-module-help" }, this.contentEl);
			el("summary", { text: "Available options" }, help);
			el("pre", { text: info.help }, help);
		}
		const buttons = el("div", { cls: "modal-button-container" }, this.contentEl);
		const cancel = el("button", { text: "Cancel" }, buttons);
		cancel.addEventListener("click", () => this.close());
		const save = el("button", { cls: "mod-cta", text: "Save" }, buttons);
		save.addEventListener("click", () => {
			this.m.title = title.trim() || undefined;
			this.m.source = source.trim();
			this.close();
			this.onSave();
		});
	}

	onClose() {
		this.contentEl.empty();
	}
}

export { TextPrompt } from "../ui/TextPrompt";
