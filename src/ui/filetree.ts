import { FuzzySuggestModal, Keymap, Menu, Notice, TFile, TFolder, type App } from "obsidian";
import type UniverseViewPlugin from "../main";
import { ENTITY_TYPES, type EntityType } from "../types";
import type { UniverseViewSettings } from "../settings";
import { followPath, moveTarget } from "../index/moves";
import { kindLabel } from "../index/reader";
import { TYPE_ICONS, TYPE_LABELS, clickNotice, el, icon, openEntity, showEntityMenu, typeColorVar } from "../render/common";
import { fileIconBox, tintRow } from "./icons";

/** What a tree shows and what's picked in it, kept by the view that hosts it. */
export interface TreeState {
	/** A note's path, or a folder's path when `isFolder`. */
	selected?: string;
	isFolder?: boolean;
	expanded: string[];
	onlyNotes: boolean;
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

type TreeOptions = Required<NonNullable<UniverseViewSettings["fileTree"]>>;

function treeOptions(plugin: UniverseViewPlugin): TreeOptions {
	return { colors: "both", folderNotes: true, kinds: true, counts: true, compact: false, ...plugin.settings.fileTree };
}

/** The event open trees redraw on when their options change. */
export const TREE_OPTIONS_CHANGED = "universeview:tree-options";

/** How the file trees look, one click from either tree. */
export function treeOptionsMenu(plugin: UniverseViewPlugin, evt: MouseEvent) {
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

/** Picks the folder something moves to. */
class MoveToModal extends FuzzySuggestModal<TFolder> {
	constructor(app: App, private path: string, private isFolder: boolean, private onPick: (dest: string) => void) {
		super(app);
		this.setPlaceholder("Move to which folder?");
	}
	getItems() {
		return this.app.vault.getAllFolders(true).filter((f) => moveTarget(this.path, this.isFolder, f.isRoot() ? "" : f.path));
	}
	getItemText(f: TFolder) {
		return f.isRoot() ? "/" : f.path;
	}
	onChooseItem(f: TFolder) {
		this.onPick(f.isRoot() ? "" : f.path);
	}
}

/** Every folder and note, with counts by type, problems marked, search and keyboard control. */
export class FileTree {
	private options!: TreeOptions;

	constructor(private plugin: UniverseViewPlugin, private list: HTMLElement, private state: () => TreeState, private hooks: TreeHooks) {
		list.setAttribute("role", "tree");
		list.addEventListener("keydown", (evt) => this.onKey(evt));
		list.addEventListener("pointerdown", (evt) => this.onDragStart(evt));
		// Hover cards listen here, not on each row: the tree redraws its rows whenever the vault changes, and a
		// row replaced under the pointer would never have heard it.
		list.addEventListener("mouseover", (evt) => {
			const row = (evt.target as HTMLElement).closest<HTMLElement>(".universeview-dash-row[data-hover]");
			if (!row || row.contains(evt.relatedTarget as Node | null)) return;
			this.plugin.hoverCards?.hoverOnce(row, row.dataset.hover ?? "", evt);
		});
		list.addEventListener("mousemove", (evt) => {
			const row = (evt.target as HTMLElement).closest<HTMLElement>(".universeview-dash-row[data-hover]");
			if (row) this.plugin.hoverCards?.nudge(row, row.dataset.hover ?? "", evt);
		});
	}

	/** Moves a note or folder, links and all. A folder note's row is its folder, so they go together. */
	async moveTo(path: string, dest: string, undoable = true) {
		const { vault, fileManager } = this.plugin.app;
		const item = vault.getAbstractFileByPath(path);
		const target = item && moveTarget(path, item instanceof TFolder, dest);
		if (!item || !target) return;
		if (vault.getAbstractFileByPath(target)) {
			new Notice(`${target} already exists.`);
			return;
		}
		const from = path.split("/").slice(0, -1).join("/");
		const s = this.state();
		if (dest) s.expanded = [...new Set([...s.expanded, dest])];
		try {
			await fileManager.renameFile(item, target);
		} catch (err) {
			new Notice(`Couldn't move ${item.name}: ${(err as Error).message}`);
			return;
		}
		const message = `Moved ${item.name} to ${dest || "the top of the vault"}.`;
		if (undoable) clickNotice(`${message} Click to move it back.`, 8000, () => void this.moveTo(target, from, false));
		else new Notice(message);
	}

	/** The selection and open folders stay with what was renamed or moved, wherever that happened. */
	followRename(to: string, from: string) {
		const s = this.state();
		if (s.selected) s.selected = followPath(s.selected, from, to);
		s.expanded = s.expanded.map((p) => followPath(p, from, to));
		this.hooks.changed();
	}

	private chooseMove(path: string, isFolder: boolean) {
		new MoveToModal(this.plugin.app, path, isFolder, (dest) => void this.moveTo(path, dest)).open();
	}

	/** A row's folder at a point: the folder itself, the one a note sits in, the root below the rows. */
	private dropAt(x: number, y: number, doc: Document): string | undefined {
		const under = doc.elementFromPoint(x, y);
		if (!under || !this.list.contains(under)) return undefined;
		const row = under.closest<HTMLElement>(".universeview-dash-row");
		if (!row) return "";
		const path = row.dataset.path ?? "";
		return row.hasClass("is-folder") ? path : path.split("/").slice(0, -1).join("/");
	}

	/** Dragging a row onto a folder moves it; resting on a closed folder opens it; Esc calls it off. Touch scrolls instead. */
	private onDragStart(down: PointerEvent) {
		if (down.button !== 0 || down.pointerType === "touch") return;
		const row = (down.target as HTMLElement).closest<HTMLElement>(".universeview-dash-row");
		if (!row?.dataset.path) return;
		const path = row.dataset.path;
		const isFolder = row.hasClass("is-folder");
		const name = row.querySelector(".universeview-dash-row-name")?.textContent ?? "";
		const doc = this.list.ownerDocument;
		let ghost: HTMLElement | undefined;
		let dest: string | undefined;
		let springAt: string | undefined;
		let spring = 0;
		const clearMarks = () => {
			this.list.removeClass("is-drop-root");
			this.list.querySelectorAll(".is-drop-target").forEach((r) => r.removeClass("is-drop-target"));
		};
		const finish = () => {
			doc.removeEventListener("pointermove", move);
			doc.removeEventListener("pointerup", up);
			doc.removeEventListener("pointercancel", cancel);
			doc.removeEventListener("keydown", onEsc, { capture: true });
			window.clearTimeout(spring);
			clearMarks();
			this.list.removeClass("is-dragging");
			ghost?.remove();
		};
		const move = (e: PointerEvent) => {
			if (!ghost && Math.hypot(e.clientX - down.clientX, e.clientY - down.clientY) < 5) return;
			ghost ??= el("div", { cls: "uv-tree-ghost", text: name }, doc.body);
			this.list.addClass("is-dragging");
			ghost.setCssProps({ "--uv-x": `${e.clientX + 12}px`, "--uv-y": `${e.clientY + 8}px` });
			const box = this.list.getBoundingClientRect();
			if (e.clientY < box.top + 28) this.list.scrollTop -= 10;
			else if (e.clientY > box.bottom - 28) this.list.scrollTop += 10;
			const at = this.dropAt(e.clientX, e.clientY, doc);
			dest = at !== undefined && moveTarget(path, isFolder, at) ? at : undefined;
			clearMarks();
			if (dest === "") this.list.addClass("is-drop-root");
			const target = dest ? Array.from(this.list.querySelectorAll<HTMLElement>(".universeview-dash-row.is-folder")).find((r) => r.dataset.path === dest) : undefined;
			target?.addClass("is-drop-target");
			if (springAt !== dest) {
				springAt = dest;
				window.clearTimeout(spring);
				if (target?.getAttribute("aria-expanded") === "false") spring = window.setTimeout(() => this.toggle(target.dataset.path ?? ""), 700);
			}
		};
		const swallowClick = () => {
			const swallow = (evt: MouseEvent) => evt.stopImmediatePropagation();
			doc.addEventListener("click", swallow, { capture: true, once: true });
			window.setTimeout(() => doc.removeEventListener("click", swallow, { capture: true }), 0);
		};
		const up = () => {
			const dragged = !!ghost;
			finish();
			if (!dragged) return;
			swallowClick();
			if (dest !== undefined) void this.moveTo(path, dest);
		};
		const cancel = () => finish();
		const onEsc = (e: KeyboardEvent) => {
			if (e.key !== "Escape" || !ghost) return;
			e.stopPropagation();
			finish();
			swallowClick();
		};
		doc.addEventListener("pointermove", move);
		doc.addEventListener("pointerup", up);
		doc.addEventListener("pointercancel", cancel);
		doc.addEventListener("keydown", onEsc, { capture: true });
	}

	private build(): FolderNode {
		const s = this.state();
		const idx = this.plugin.index;
		const q = s.search.trim().toLowerCase();
		const root: FolderNode = { path: "", name: "", folders: new Map(), files: [], counts: {}, total: 0, issues: 0 };
		for (const f of this.plugin.app.vault.getMarkdownFiles()) {
			const e = idx.get(f.path);
			if (s.onlyNotes && !e) continue;
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
		const focused = list.querySelector<HTMLElement>(".universeview-dash-row:focus")?.dataset.path;
		const scroll = list.scrollTop;
		list.empty();
		const tree = this.build();
		if (!tree.total) {
			el("div", { cls: "universeview-dash-empty", text: s.search ? "Nothing matches." : "No notes here yet." }, list);
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
		const first = list.querySelector<HTMLElement>(".universeview-dash-row");
		if (first) first.tabIndex = 0;
		if (focused) Array.from(list.querySelectorAll<HTMLElement>(".universeview-dash-row")).find((r) => r.dataset.path === focused)?.focus();
	}

	private row(path: string, cls: string, depth: number, selected: boolean, open?: boolean) {
		const attr: Record<string, string> = { role: "treeitem", tabindex: "-1", "aria-selected": String(selected) };
		if (open !== undefined) attr["aria-expanded"] = String(open);
		const row = el("div", { cls: `universeview-dash-row ${cls}` + (selected ? " is-selected is-active" : ""), attr }, this.list);
		row.dataset.path = path;
		row.style.setProperty("--depth", String(depth));
		return row;
	}

	/** The note's look on a row: its icons and colour. */
	private dress(row: HTMLElement, path: string, plain: string) {
		const box = this.plugin.settings.fileIcons !== false ? fileIconBox(this.plugin, path) : undefined;
		if (box) row.appendChild(box);
		else icon(el("span", { cls: "universeview-dash-row-icon" }, row), plain);
		tintRow(this.plugin, row, path, this.options.colors);
	}

	private folderRow(n: FolderNode, depth: number, open: boolean, note?: TFile) {
		const s = this.state();
		const picked = note ? !s.isFolder && s.selected === note.path : !!s.isFolder && s.selected === n.path;
		const row = this.row(n.path, "is-folder", depth, picked, open);
		if (note) row.dataset.note = note.path;
		const chev = el("span", { cls: "universeview-dash-chev" + (open ? " is-open" : "") }, row);
		icon(chev, "chevron-right");
		this.dress(row, note?.path ?? n.path, open ? "folder-open" : "folder");
		el("span", { cls: "universeview-dash-row-name", text: n.name }, row);
		const entity = note ? this.plugin.index.get(note.path) : undefined;
		if (this.options.kinds && entity?.category) el("span", { cls: "universeview-dash-row-meta", text: kindLabel(entity.category) }, row);
		const counts = el("span", { cls: "universeview-dash-counts" }, row);
		if (this.options.counts) for (const t of ENTITY_TYPES) {
			const c = n.counts[t];
			if (!c) continue;
			const dot = el("span", { cls: "universeview-dash-count", text: String(c), attr: { title: plural(TYPE_LABELS[t].toLowerCase(), c) } }, counts);
			dot.style.setProperty("--dot-color", typeColorVar(t));
		}
		if (n.issues) el("span", { cls: "universeview-dash-issue", text: "!", attr: { title: plural("note with problems", n.issues) } }, counts);
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
			if (entity) showEntityMenu(this.plugin, entity.key, evt, { top: (m) => this.moveItem(m, n.path, true) });
			else this.folderMenu(n.path, evt);
		});
		if (entity) row.dataset.hover = entity.key;
	}

	private fileRow(f: TFile, depth: number) {
		const s = this.state();
		const e = this.plugin.index.get(f.path);
		const row = this.row(f.path, "is-file" + (e ? "" : " is-plain"), depth, !s.isFolder && s.selected === f.path);
		this.dress(row, f.path, e ? TYPE_ICONS[e.type] : "file-text");
		el("span", { cls: "universeview-dash-row-name", text: f.basename }, row);
		if (this.options.kinds && e?.category) el("span", { cls: "universeview-dash-row-meta", text: kindLabel(e.category) }, row);
		if (e?.issues.length) el("span", { cls: "universeview-dash-issue", text: "!", attr: { title: e.issues.join("\n") } }, row);
		row.addEventListener("click", (evt) => {
			if (Keymap.isModEvent(evt)) openEntity(this.plugin, f.path, evt);
			else this.hooks.select(f.path, false, evt);
		});
		row.addEventListener("dblclick", (evt) => openEntity(this.plugin, f.path, evt));
		row.addEventListener("contextmenu", (evt) => {
			evt.preventDefault();
			if (e) showEntityMenu(this.plugin, f.path, evt, { top: (m) => this.moveItem(m, f.path, false) });
			else {
				const menu = new Menu();
				menu.addItem((it) => it.setTitle("Open").setIcon("file").onClick(() => openEntity(this.plugin, f.path)));
				this.moveItem(menu, f.path, false);
				menu.showAtMouseEvent(evt);
			}
		});
		if (e) row.dataset.hover = e.key;
	}

	private moveItem(menu: Menu, path: string, isFolder: boolean) {
		menu.addItem((i) => i.setTitle("Move to…").setIcon("folder-input").onClick(() => this.chooseMove(path, isFolder)));
	}

	private folderMenu(path: string, evt: MouseEvent) {
		const menu = new Menu();
		menu.addItem((i) => i.setTitle("Folder settings and notes").setIcon("folder-cog").onClick(() => void this.plugin.activateView("chronicle-explorer", { select: path, isFolder: true })));
		this.moveItem(menu, path, true);
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

	/** Shows the note in the tree: opens the folders above it, picks it, scrolls it to the middle and flashes it. */
	reveal(path: string): boolean {
		this.pick(path, false);
		this.render();
		this.hooks.changed();
		const row = Array.from(this.list.querySelectorAll<HTMLElement>(".universeview-dash-row")).find((r) => r.dataset.path === path);
		if (!row) return false;
		row.scrollIntoView({ block: "center" });
		row.addClass("is-revealed");
		window.setTimeout(() => row.removeClass("is-revealed"), 1600);
		return true;
	}

	scrollToPicked() {
		this.list.querySelector(".is-selected")?.scrollIntoView({ block: "nearest" });
	}

	/** Arrow keys walk the tree, right and left open and close folders, Enter picks. */
	private onKey(evt: KeyboardEvent) {
		const row = (evt.target as HTMLElement).closest<HTMLElement>(".universeview-dash-row");
		if (!row) return;
		const rows = Array.from(this.list.querySelectorAll<HTMLElement>(".universeview-dash-row"));
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
