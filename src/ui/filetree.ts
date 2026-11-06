import { Keymap, Menu, TFile } from "obsidian";
import type ChroniclePlugin from "../main";
import { ENTITY_TYPES, type EntityType } from "../types";
import type { ChronicleSettings } from "../settings";
import { TYPE_ICONS, TYPE_LABELS, el, icon, openEntity, showEntityMenu, typeColorVar } from "../render/common";
import { fileIconBox, tintRow } from "./icons";

/** What a tree shows and what's picked in it, kept by the view that hosts it. */
export interface TreeState {
	/** A note's path, or a folder's path when `isFolder`. */
	selected?: string;
	isFolder?: boolean;
	expanded: string[];
	onlyChronicle: boolean;
	search: string;
	typeFilter?: EntityType;
}

export interface TreeHooks {
	/** A note or folder was clicked. */
	select(path: string, isFolder: boolean, evt: MouseEvent | KeyboardEvent): void;
	/** Something the host saves has changed. */
	changed(): void;
	/** Clicking an open folder closes it (in the Library it shows the folder instead). */
	foldOnClick?: boolean;
}

interface FolderNode {
	path: string;
	name: string;
	folders: Map<string, FolderNode>;
	files: TFile[];
	counts: Partial<Record<EntityType, number>>;
	total: number;
	issues: number;
}

type TreeOptions = Required<NonNullable<ChronicleSettings["fileTree"]>>;

function treeOptions(plugin: ChroniclePlugin): TreeOptions {
	return { colors: "both", folderNotes: true, kinds: true, counts: true, compact: false, ...plugin.settings.fileTree };
}

/** The event open trees redraw on when their options change. */
export const TREE_OPTIONS_CHANGED = "chronicle:tree-options";

/** How the file trees look, one click from either tree. */
export function treeOptionsMenu(plugin: ChroniclePlugin, evt: MouseEvent) {
	const o = treeOptions(plugin);
	const set = (change: Partial<TreeOptions>) => {
		plugin.settings.fileTree = { ...o, ...change };
		void plugin.saveSettings();
		plugin.app.workspace.trigger(TREE_OPTIONS_CHANGED);
	};
	const menu = new Menu();
	const styles: [TreeOptions["colors"], string][] = [["both", "Colour names and bars"], ["text", "Colour names only"], ["bar", "Colour bars only"], ["none", "No colours"]];
	for (const [colors, title] of styles) menu.addItem((i) => i.setTitle(title).setChecked(o.colors === colors).onClick(() => set({ colors })));
	menu.addSeparator();
	const flags: [keyof TreeOptions, string, boolean][] = [
		["folderNotes", "Show folder notes as their folder", o.folderNotes],
		["kinds", "Show kinds (county, fort…)", o.kinds],
		["counts", "Show counts on folders", o.counts],
		["compact", "Compact rows", o.compact],
	];
	for (const [key, title, on] of flags) menu.addItem((i) => i.setTitle(title).setChecked(on).onClick(() => set({ [key]: !on })));
	menu.addSeparator();
	menu.addItem((i) => i.setTitle("Colour strength by tier…").setIcon("palette").onClick(() => plugin.openSettings("appearance")));
	menu.showAtMouseEvent(evt);
}

export function plural(word: string, n: number): string {
	if (n === 1) return `1 ${word}`;
	const last = word.split(" ").pop()!;
	const many = last === "person" ? "people" : /[^aeiou]y$/.test(last) ? last.slice(0, -1) + "ies" : last + "s";
	return `${n.toLocaleString()} ${word.slice(0, word.length - last.length)}${many}`;
}

/** The views a folder can open in: view type, label, icon, state. */
export function folderViews(path: string): [string, string, string, Record<string, unknown>][] {
	return [
		["chronicle-timeline", "Timeline of this folder", "calendar-range", { options: { filter: { folder: path } } }],
		["chronicle-map", "Map of this folder", "map", { options: { folder: path } }],
		["chronicle-network", "Connections in this folder", "waypoints", { options: { filter: { folder: path } } }],
		["chronicle-orgchart", "Organisation chart of this folder", "network", { options: { folder: path, root: undefined } }],
		["chronicle-lineage", "Culture lineage of this folder", "git-branch", { options: { folder: path } }],
	];
}

/** Every folder and note, with counts by type, problems marked, search and keyboard control. */
export class FileTree {
	private options!: TreeOptions;

	constructor(private plugin: ChroniclePlugin, private list: HTMLElement, private state: () => TreeState, private hooks: TreeHooks) {
		list.setAttribute("role", "tree");
		list.addEventListener("keydown", (evt) => this.onKey(evt));
	}

	private build(): FolderNode {
		const s = this.state();
		const idx = this.plugin.index;
		const q = s.search.trim().toLowerCase();
		const root: FolderNode = { path: "", name: "", folders: new Map(), files: [], counts: {}, total: 0, issues: 0 };
		for (const f of this.plugin.app.vault.getMarkdownFiles()) {
			const e = idx.get(f.path);
			if (s.onlyChronicle && !e) continue;
			if (s.typeFilter && e?.type !== s.typeFilter) continue;
			if (q && !f.path.toLowerCase().includes(q) && !(e?.category ?? "").includes(q)) continue;
			const bump = (n: FolderNode) => {
				n.total++;
				if (e) n.counts[e.type] = (n.counts[e.type] ?? 0) + 1;
				if (e?.issues.length) n.issues++;
			};
			bump(root);
			const parts = f.path.split("/").slice(0, -1);
			let node = root;
			parts.forEach((name, i) => {
				let next = node.folders.get(name);
				if (!next) node.folders.set(name, (next = { path: parts.slice(0, i + 1).join("/"), name, folders: new Map(), files: [], counts: {}, total: 0, issues: 0 }));
				node = next;
				bump(node);
			});
			node.files.push(f);
		}
		return root;
	}

	render() {
		const list = this.list;
		const s = this.state();
		const focused = list.querySelector<HTMLElement>(".chronicle-dash-row:focus")?.dataset.path;
		const scroll = list.scrollTop;
		list.empty();
		const tree = this.build();
		if (!tree.total) {
			el("div", { cls: "chronicle-dash-empty", text: s.search ? "Nothing matches." : "No notes here yet." }, list);
			return;
		}
		const o = (this.options = treeOptions(this.plugin));
		list.toggleClass("is-compact", o.compact);
		const expanded = new Set(s.expanded);
		const searching = !!s.search.trim() || !!s.typeFilter;
		const children = (n: FolderNode, depth: number, own?: TFile) => {
			for (const c of [...n.folders.values()].sort((a, b) => a.name.localeCompare(b.name))) {
				const open = searching || expanded.has(c.path);
				const note = o.folderNotes ? c.files.find((f) => f.basename === c.name) : undefined;
				this.folderRow(c, depth, open, note);
				if (open) children(c, depth + 1, note);
			}
			for (const f of n.files.sort((a, b) => a.basename.localeCompare(b.basename))) if (f !== own) this.fileRow(f, depth);
		};
		children(tree, 0);
		list.scrollTop = scroll;
		const first = list.querySelector<HTMLElement>(".chronicle-dash-row");
		if (first) first.tabIndex = 0;
		if (focused) Array.from(list.querySelectorAll<HTMLElement>(".chronicle-dash-row")).find((r) => r.dataset.path === focused)?.focus();
	}

	private row(path: string, cls: string, depth: number, selected: boolean, open?: boolean) {
		const attr: Record<string, string> = { role: "treeitem", tabindex: "-1", "aria-selected": String(selected) };
		if (open !== undefined) attr["aria-expanded"] = String(open);
		const row = el("div", { cls: `chronicle-dash-row ${cls}` + (selected ? " is-selected is-active" : ""), attr }, this.list);
		row.dataset.path = path;
		row.style.setProperty("--depth", String(depth));
		return row;
	}

	/** The note's look on a row: its icons and colour. */
	private dress(row: HTMLElement, path: string, plain: string) {
		const box = this.plugin.settings.fileIcons !== false ? fileIconBox(this.plugin, path) : undefined;
		if (box) row.appendChild(box);
		else icon(el("span", { cls: "chronicle-dash-row-icon" }, row), plain);
		tintRow(this.plugin, row, path, this.options.colors);
	}

	private folderRow(n: FolderNode, depth: number, open: boolean, note?: TFile) {
		const s = this.state();
		const picked = note ? !s.isFolder && s.selected === note.path : !!s.isFolder && s.selected === n.path;
		const row = this.row(n.path, "is-folder", depth, picked, open);
		if (note) row.dataset.note = note.path;
		const chev = el("span", { cls: "chronicle-dash-chev" + (open ? " is-open" : "") }, row);
		icon(chev, "chevron-right");
		this.dress(row, note?.path ?? n.path, open ? "folder-open" : "folder");
		el("span", { cls: "chronicle-dash-row-name", text: n.name }, row);
		const entity = note ? this.plugin.index.get(note.path) : undefined;
		if (this.options.kinds && entity?.category) el("span", { cls: "chronicle-dash-row-meta", text: entity.category }, row);
		const counts = el("span", { cls: "chronicle-dash-counts" }, row);
		if (this.options.counts) for (const t of ENTITY_TYPES) {
			const c = n.counts[t];
			if (!c) continue;
			const dot = el("span", { cls: "chronicle-dash-count", text: String(c), attr: { title: plural(TYPE_LABELS[t].toLowerCase(), c) } }, counts);
			dot.style.setProperty("--dot-color", typeColorVar(t));
		}
		if (n.issues) el("span", { cls: "chronicle-dash-issue", text: "!", attr: { title: plural("note with problems", n.issues) } }, counts);
		chev.addEventListener("click", (evt) => {
			evt.stopPropagation();
			this.toggle(n.path);
		});
		row.addEventListener("click", (evt) => {
			// A folder note opens with its folder; the arrow is what closes it.
			if (note) {
				if (Keymap.isModEvent(evt)) openEntity(this.plugin, note.path, evt);
				else this.hooks.select(note.path, false, evt);
				if (!open) this.toggle(n.path);
				return;
			}
			this.hooks.select(n.path, true, evt);
			if (!open || this.hooks.foldOnClick) this.toggle(n.path);
		});
		row.addEventListener("contextmenu", (evt) => {
			evt.preventDefault();
			if (entity) showEntityMenu(this.plugin, entity.key, evt);
			else this.folderMenu(n.path, evt);
		});
		if (entity) this.plugin.hoverCards?.attach(row, entity.key);
	}

	private fileRow(f: TFile, depth: number) {
		const s = this.state();
		const e = this.plugin.index.get(f.path);
		const row = this.row(f.path, "is-file" + (e ? "" : " is-plain"), depth, !s.isFolder && s.selected === f.path);
		this.dress(row, f.path, e ? TYPE_ICONS[e.type] : "file-text");
		el("span", { cls: "chronicle-dash-row-name", text: f.basename }, row);
		if (this.options.kinds && e?.category) el("span", { cls: "chronicle-dash-row-meta", text: e.category }, row);
		if (e?.issues.length) el("span", { cls: "chronicle-dash-issue", text: "!", attr: { title: e.issues.join("\n") } }, row);
		row.addEventListener("click", (evt) => {
			if (Keymap.isModEvent(evt)) openEntity(this.plugin, f.path, evt);
			else this.hooks.select(f.path, false, evt);
		});
		row.addEventListener("dblclick", (evt) => openEntity(this.plugin, f.path, evt));
		row.addEventListener("contextmenu", (evt) => {
			evt.preventDefault();
			if (e) showEntityMenu(this.plugin, f.path, evt);
			else {
				const menu = new Menu();
				menu.addItem((it) => it.setTitle("Open").setIcon("file").onClick(() => openEntity(this.plugin, f.path)));
				menu.showAtMouseEvent(evt);
			}
		});
		if (e) this.plugin.hoverCards?.attach(row, e.key);
	}

	private folderMenu(path: string, evt: MouseEvent) {
		const menu = new Menu();
		menu.addItem((i) => i.setTitle("Folder settings and notes").setIcon("folder-cog").onClick(() => void this.plugin.activateView("chronicle-explorer", { select: path, isFolder: true })));
		menu.addSeparator();
		for (const [view, label, iconName, state] of folderViews(path)) menu.addItem((i) => i.setTitle(label).setIcon(iconName).onClick(() => void this.plugin.activateView(view, state)));
		menu.addSeparator();
		menu.addItem((i) => i.setTitle("New note here…").setIcon("plus").onClick(() => this.plugin.createEntityPrompt({ scope: path.split("/")[0] })));
		menu.showAtMouseEvent(evt);
	}

	toggle(path: string) {
		const s = this.state();
		const set = new Set(s.expanded);
		if (!set.delete(path)) set.add(path);
		s.expanded = [...set];
		this.render();
		this.hooks.changed();
	}

	collapseAll() {
		this.state().expanded = [];
		this.render();
		this.hooks.changed();
	}

	expandAll() {
		const all = new Set<string>();
		for (const f of this.plugin.app.vault.getMarkdownFiles()) {
			const parts = f.path.split("/").slice(0, -1);
			for (let i = 1; i <= parts.length; i++) all.add(parts.slice(0, i).join("/"));
		}
		this.state().expanded = [...all];
		this.render();
		this.hooks.changed();
	}

	/** Marks a note or folder as picked and opens the folders above it. */
	pick(path: string, isFolder: boolean) {
		const s = this.state();
		s.selected = path;
		s.isFolder = isFolder;
		const parts = path.split("/");
		const set = new Set(s.expanded);
		for (let i = 1; i < parts.length; i++) set.add(parts.slice(0, i).join("/"));
		s.expanded = [...set];
	}

	scrollToPicked() {
		this.list.querySelector(".is-selected")?.scrollIntoView({ block: "nearest" });
	}

	/** Arrow keys walk the tree, right and left open and close folders, Enter picks. */
	private onKey(evt: KeyboardEvent) {
		const row = (evt.target as HTMLElement).closest<HTMLElement>(".chronicle-dash-row");
		if (!row) return;
		const rows = Array.from(this.list.querySelectorAll<HTMLElement>(".chronicle-dash-row"));
		const at = rows.indexOf(row);
		const path = row.dataset.path ?? "";
		const folder = row.hasClass("is-folder");
		const open = row.getAttribute("aria-expanded") === "true";
		if (evt.key === "ArrowDown") rows[at + 1]?.focus();
		else if (evt.key === "ArrowUp") rows[at - 1]?.focus();
		else if (evt.key === "ArrowRight" && folder && !open) this.toggle(path);
		else if (evt.key === "ArrowLeft" && folder && open) this.toggle(path);
		else if (evt.key === "Enter") this.hooks.select(row.dataset.note ?? path, folder && !row.dataset.note, evt);
		else return;
		evt.preventDefault();
	}
}
