import { expandFolder, pluginEnabled } from "../internals";
import { Keymap, Menu, Notice, TAbstractFile, TFile, TFolder, debounce, normalizePath } from "obsidian";
import type ChroniclePlugin from "../main";
import type { Entity, EntityType } from "../types";
import { groupKind } from "../render/houses";
import { fileColor } from "./icons";

/**
 * Folder notes: a folder's own note, kept inside it under the folder's name (California/California.md).
 * Clicking the folder opens it, the note itself is hidden from the list, and renaming either renames
 * the other. New notes go inside the folder note of what they belong to: James II into House Whitmore.
 */

const NOTE_EXTS = ["md", "canvas", "base"];

/** The folder's own note, if it has one. */
export function folderNoteOf(plugin: ChroniclePlugin, folder: TFolder | string): TFile | undefined {
	const path = typeof folder === "string" ? folder : folder.path;
	if (!path || path === "/") return undefined;
	const name = path.split("/").pop();
	for (const ext of NOTE_EXTS) {
		const f = plugin.app.vault.getAbstractFileByPath(normalizePath(`${path}/${name}.${ext}`));
		if (f instanceof TFile) return f;
	}
	return undefined;
}

/** Whether this file is its folder's note. */
export function isFolderNote(file: TAbstractFile | null | undefined): boolean {
	return file instanceof TFile && !!file.parent && file.parent.path !== "/" && file.parent.name === file.basename && NOTE_EXTS.includes(file.extension);
}

/** Folder-note behaviour in the explorer: off when the Folder notes plugin is doing it already. */
export function folderNotesActive(plugin: ChroniclePlugin): boolean {
	if (plugin.settings.folderNotes === false) return false;
	return !pluginEnabled(plugin.app, "folder-notes");
}

/** Moves Note.md into a folder of its own (Note/Note.md) and returns it there. */
export async function makeFolderNote(plugin: ChroniclePlugin, file: TFile): Promise<TFile> {
	if (isFolderNote(file)) return file;
	const { vault, fileManager } = plugin.app;
	const parent = file.parent?.path && file.parent.path !== "/" ? file.parent.path + "/" : "";
	const dir = normalizePath(`${parent}${file.basename}`);
	const existing = vault.getAbstractFileByPath(dir);
	if (existing && !(existing instanceof TFolder)) throw new Error(`${dir} exists and isn't a folder`);
	if (existing instanceof TFolder && folderNoteOf(plugin, existing)) throw new Error(`${dir} already has a folder note`);
	if (!existing) await vault.createFolder(dir);
	await fileManager.renameFile(file, normalizePath(`${dir}/${file.name}`));
	return file;
}

/** Moves a folder note back out beside its folder, and removes the folder if that leaves it empty. */
export async function unmakeFolderNote(plugin: ChroniclePlugin, file: TFile) {
	if (!isFolderNote(file)) return;
	const folder = file.parent!;
	const up = folder.parent?.path && folder.parent.path !== "/" ? folder.parent.path + "/" : "";
	const target = normalizePath(`${up}${file.name}`);
	if (plugin.app.vault.getAbstractFileByPath(target)) throw new Error(`${target} already exists`);
	await plugin.app.fileManager.renameFile(file, target);
	if (!folder.children.length) await plugin.app.fileManager.trashFile(folder);
}

/** Makes a note for a folder (from the folder-note template, else the type's template) and opens it. */
export async function createFolderNote(plugin: ChroniclePlugin, folder: TFolder, open = true): Promise<TFile> {
	const have = folderNoteOf(plugin, folder);
	if (have) return have;
	const path = normalizePath(`${folder.path}/${folder.name}.md`);
	let body = "";
	const tpl = plugin.settings.folderNoteTemplate?.trim();
	if (tpl) {
		const t = plugin.app.vault.getAbstractFileByPath(normalizePath(tpl.endsWith(".md") ? tpl : tpl + ".md"));
		if (t instanceof TFile) body = await plugin.app.vault.read(t);
	}
	// No template: a live list of what's inside.
	if (!tpl && plugin.settings.folderNoteOverview !== false) body = "```uv-folder\ndepth: 3\n```\n";
	const file = await plugin.app.vault.create(path, body);
	if (open) await plugin.app.workspace.getLeaf(false).openFile(file);
	return file;
}

export interface Placement {
	/** The folder the new note goes in. */
	folder: string;
	/** The note it's placed under, for the hint ("in House Whitmore"). */
	under: string;
	/** A note to turn into a folder note first, so the new one can go inside it. */
	convert?: TFile;
	/** The folder of what it belongs to, before any Living / Dead or type subfolder. */
	base: string;
	/** Inside that note's own folder (not just beside the note). */
	inside: boolean;
}

/** Which links a new note sits under, most telling first. */
export interface PlacementLinks {
	cultures?: string[];
	parents?: string[];
	places?: string[];
	locatedIn?: string[];
	parentCultures?: string[];
	participants?: string[];
	/** For people: whether they have died (for Living / Dead folders). */
	dead?: boolean;
}

/**
 * Where a new note belongs: inside the folder note of the house a person is born into, the place a
 * place lies in, the realm a title is under, or where an event happened. Beside that note when it has
 * no folder of its own (or inside a new one, when set to make them). Undefined: use the type's folder.
 */
export function placementFor(plugin: ChroniclePlugin, type: EntityType, links: PlacementLinks): Placement | undefined {
	const mode = plugin.settings.placeNewNotes ?? "parent";
	if (mode === "off") return undefined;
	const find = (names: string[] = []) => names.map((n) => plugin.index.findByName(n.replace(/^\[\[|\]\]$/g, "").split("|")[0])).filter((e): e is Entity => !!e);
	let order: Entity[] = [];
	switch (type) {
		case "person": {
			const groups = find(links.cultures);
			const houses = groups.filter((g) => g.type === "culture" && groupKind(plugin, g) === "house");
			order = [...houses, ...find(links.parents), ...groups];
			break;
		}
		case "place":
			order = [...find(links.locatedIn), ...find(links.cultures), ...find(links.places)];
			break;
		case "culture":
			order = [...find(links.parentCultures), ...find(links.places)];
			break;
		case "event":
			order = [...find(links.places), ...find(links.cultures), ...find(links.participants)];
			break;
		default:
			return undefined;
	}
	for (const e of order) {
		const file = plugin.app.vault.getAbstractFileByPath(e.path);
		if (!(file instanceof TFile)) continue;
		let folder: string;
		let convert: TFile | undefined;
		if (isFolderNote(file)) folder = file.parent!.path;
		else if (mode === "convert" && e.type !== "person") {
			// A person's children go beside them, not inside them.
			const up = file.parent?.path && file.parent.path !== "/" ? file.parent.path + "/" : "";
			folder = `${up}${file.basename}`;
			convert = file;
		} else folder = file.parent?.path ?? "";
		return { folder: subfolderFor(plugin, folder, type, links.dead, e), under: e.name, convert, base: folder, inside: isFolderNote(file) || !!convert };
	}
	return undefined;
}

/**
 * Inside the chosen folder, the subfolder that fits: Living or Dead for people (when the folder has
 * them), or the type's own folder (People, Places, Events) when there is one.
 */
function subfolderFor(plugin: ChroniclePlugin, folder: string, type: EntityType, dead: boolean | undefined, under: Entity): string {
	const dir = plugin.app.vault.getAbstractFileByPath(folder || "/");
	if (!(dir instanceof TFolder)) return folder;
	const subs = dir.children.filter((c): c is TFolder => c instanceof TFolder);
	const named = (re: RegExp) => subs.find((s) => re.test(s.name));
	// A sibling of a person in Living/ belongs in Living/ or Dead/ by their own state.
	if (type === "person" && under.type === "person" && /^(living|alive|dead|deceased)$/i.test(dir.name) && plugin.settings.statusFolders !== false) {
		const parent = dir.parent;
		const other = parent?.children.find((c): c is TFolder => c instanceof TFolder && (dead ? /^(dead|deceased)$/i : /^(living|alive)$/i).test(c.name));
		return other?.path ?? folder;
	}
	if (type === "person" && plugin.settings.statusFolders !== false) {
		const s = dead ? named(/^(dead|deceased|the dead)$/i) : named(/^(living|alive|the living)$/i);
		if (s) return s.path;
	}
	const typeName = (plugin.settings.newNoteFolders[type] ?? "").split("/").pop()?.toLowerCase();
	const own = typeName ? subs.find((s) => s.name.toLowerCase() === typeName) : undefined;
	return own?.path ?? folder;
}

/** Folder notes in the file explorer and the note's path: open on click, hide, highlight, keep names in step. */
export function folderNotes(plugin: ChroniclePlugin) {
	const { app } = plugin;
	const explorers = () => app.workspace.getLeavesOfType("file-explorer");

	// Marks folders that have a note, hides the notes themselves, and lights the open one's folder.
	const paint = () => {
		const on = folderNotesActive(plugin);
		const hide = on && plugin.settings.hideFolderNotes !== false;
		const active = app.workspace.getActiveFile();
		for (const leaf of explorers()) {
			const root = leaf.view.containerEl;
			for (const title of Array.from(root.querySelectorAll<HTMLElement>(".nav-folder-title[data-path]"))) {
				const note = on ? folderNoteOf(plugin, title.dataset.path ?? "") : undefined;
				title.toggleClass("uv-has-folder-note", !!note);
				title.toggleClass("uv-folder-note-active", !!note && active?.path === note.path);
			}
			for (const title of Array.from(root.querySelectorAll<HTMLElement>(".nav-file-title[data-path]"))) {
				const f = app.vault.getAbstractFileByPath(title.dataset.path ?? "");
				const item = title.closest<HTMLElement>(".nav-file") ?? title;
				item.toggleClass("uv-folder-note-hidden", hide && isFolderNote(f));
			}
		}
		// The path above a note: segments with a folder note are links to it.
		for (const leaf of app.workspace.getLeavesOfType("markdown")) {
			const file = (leaf.view as { file?: TFile }).file;
			const crumbs = Array.from(leaf.view.containerEl.querySelectorAll<HTMLElement>(".view-header-breadcrumb"));
			const parts = file?.parent?.path && file.parent.path !== "/" ? file.parent.path.split("/") : [];
			crumbs.forEach((c, i) => {
				const path = parts.slice(0, i + 1).join("/");
				const note = i < parts.length ? folderNoteOf(plugin, path) : undefined;
				c.toggleClass("uv-has-folder-note", on && !!note);
				c.dataset.uvPath = path;
				// In its realm's colour, as in the file explorer: continent › kingdom › duchy › county.
				const col = note && plugin.settings.fileColors !== false && plugin.settings.pathColors !== false ? fileColor(plugin, note.path) : undefined;
				c.toggleClass("uv-crumb-tinted", !!col);
				if (col) {
					c.style.setProperty("--uv-file-color", col.color);
					c.style.setProperty("--uv-file-strength", `${col.strength}%`);
				}
			});
		}
		sortByTier();
	};

	/**
	 * Optionally, each folder's contents in the order a world reads: plain folders, then titles by
	 * tier, houses, groups, places, people, events and other notes. Only the order on screen changes.
	 */
	const sortByTier = () => {
		const on = plugin.settings.explorerTierSort === true;
		const tree = plugin.realms();
		for (const leaf of explorers()) {
			for (const box of Array.from(leaf.view.containerEl.querySelectorAll<HTMLElement>(".nav-folder-children, .tree-item-children"))) {
				box.toggleClass("uv-tier-sorted", on);
				for (const item of Array.from(box.children) as HTMLElement[]) {
					if (!on) {
						item.style.removeProperty("order");
						continue;
					}
					const title = item.querySelector<HTMLElement>(":scope > [data-path]");
					const path = title?.dataset.path;
					if (!path) continue;
					const isFolder = item.hasClass("nav-folder");
					const key = isFolder ? folderNoteOf(plugin, path)?.path : path;
					const e = key ? plugin.index.get(key) : undefined;
					const rank = e ? tree.nodes.get(e.key)?.rank : undefined;
					let order = isFolder ? 0 : 90;
					if (e) {
						if (rank !== undefined && rank < 9) order = 1 + Math.round(rank);
						else if (e.type === "culture") order = groupKind(plugin, e) === "house" ? 10 : 11;
						else order = ({ place: 20, person: 30, event: 40, map: 50 } as Record<string, number>)[e.type] ?? 60;
					}
					item.style.order = String(order);
				}
			}
		}
	};
	const later = debounce(paint, 120, true);

	const open = (file: TFile, evt: MouseEvent) => {
		const leaf = app.workspace.getLeaf(Keymap.isModEvent(evt) || (plugin.settings.folderNoteNewTab ?? false) ? "tab" : false);
		void leaf.openFile(file);
	};

	// Clicking a folder's name opens its note (Alt-click just folds it); Ctrl/Cmd-click on a folder without one makes one.
	const onClick = (evt: MouseEvent) => {
		if (!folderNotesActive(plugin) || plugin.settings.folderNoteClick === false || evt.button !== 0 || evt.altKey) return;
		const target = evt.target as HTMLElement;
		if (target.closest(".nav-folder-collapse-indicator, .collapse-icon")) return;
		const title = target.closest<HTMLElement>(".nav-folder-title[data-path]");
		if (!title || title.querySelector("input, [contenteditable=true]")) return;
		const folder = app.vault.getAbstractFileByPath(title.dataset.path ?? "");
		if (!(folder instanceof TFolder)) return;
		const note = folderNoteOf(plugin, folder);
		if (!note && !Keymap.isModEvent(evt)) return;
		evt.preventDefault();
		evt.stopPropagation();
		if (note) {
			open(note, evt);
			// Unfold it too, so what's inside shows with its note.
			for (const leaf of explorers()) expandFolder(leaf.view, folder.path);
		} else void createFolderNote(plugin, folder);
	};
	const onCrumb = (evt: MouseEvent) => {
		if (!folderNotesActive(plugin)) return;
		const crumb = (evt.target as HTMLElement).closest<HTMLElement>(".view-header-breadcrumb.uv-has-folder-note");
		const note = crumb?.dataset.uvPath ? folderNoteOf(plugin, crumb.dataset.uvPath) : undefined;
		if (!note) return;
		evt.preventDefault();
		evt.stopPropagation();
		open(note, evt);
	};
	// Folders opening add rows, and switching notes redraws the path: watch for both.
	const observer = new MutationObserver(() => later());
	const hook = () => {
		observer.disconnect();
		for (const leaf of explorers()) {
			const root = leaf.view.containerEl as HTMLElement & { __uvFolderNotes?: boolean };
			observer.observe(root, { childList: true, subtree: true });
			if (root.__uvFolderNotes) continue;
			root.__uvFolderNotes = true;
			plugin.registerDomEvent(root, "click", onClick, { capture: true });
		}
		later();
	};
	plugin.register(() => observer.disconnect());
	plugin.registerDomEvent(document, "click", onCrumb, { capture: true });
	// Hover cards in the file explorer too, for UniverseView notes and folders with one.
	const onHover = (evt: MouseEvent) => {
		if (plugin.settings.explorerHover === false) return;
		const title = (evt.target as HTMLElement).closest<HTMLElement>(".nav-file-title[data-path], .nav-folder-title[data-path]");
		if (!title || !title.closest(".workspace-leaf-content[data-type='file-explorer']")) return;
		const path = title.dataset.path ?? "";
		const key = title.hasClass("nav-folder-title") ? folderNoteOf(plugin, path)?.path : path;
		// Moving between the parts of one row isn't a new hover: its timer keeps running.
		if (!key || !plugin.index.get(key) || hovered === title) return;
		hovered = title;
		title.addEventListener("mouseleave", () => (hovered = undefined), { once: true });
		plugin.hoverCards?.hoverOnce(title, key, evt);
	};
	let hovered: HTMLElement | undefined;
	plugin.registerDomEvent(document, "mouseover", onHover);
	app.workspace.onLayoutReady(hook);
	plugin.registerEvent(app.workspace.on("layout-change", hook));
	plugin.registerEvent(app.workspace.on("file-open", later));
	plugin.registerEvent(app.vault.on("create", later));
	plugin.registerEvent(app.vault.on("delete", later));

	// Renaming a folder renames its note, and renaming the note renames its folder.
	let syncing = false;
	plugin.registerEvent(app.vault.on("rename", (file, oldPath) => {
		later();
		if (syncing || !folderNotesActive(plugin) || plugin.settings.folderNoteSync === false) return;
		const oldName = oldPath.split("/").pop() ?? "";
		const oldDir = oldPath.split("/").slice(0, -1).join("/");
		void (async () => {
			syncing = true;
			try {
				if (file instanceof TFolder && oldName !== file.name) {
					for (const ext of NOTE_EXTS) {
						const note = app.vault.getAbstractFileByPath(`${file.path}/${oldName}.${ext}`);
						if (note instanceof TFile && !app.vault.getAbstractFileByPath(`${file.path}/${file.name}.${ext}`)) {
							await app.fileManager.renameFile(note, `${file.path}/${file.name}.${ext}`);
						}
					}
				} else if (file instanceof TFile && file.parent && file.parent.path === oldDir) {
					const oldBase = oldName.replace(/\.[^.]+$/, "");
					// Was its folder's note, and still sits in that folder under a new name.
					if (file.parent.name === oldBase && file.basename !== oldBase && NOTE_EXTS.includes(file.extension)) {
						const up = file.parent.parent?.path && file.parent.parent.path !== "/" ? file.parent.parent.path + "/" : "";
						const target = normalizePath(`${up}${file.basename}`);
						if (!app.vault.getAbstractFileByPath(target)) await app.fileManager.renameFile(file.parent, target);
						else new Notice(`Didn't rename the folder: ${target} already exists.`);
					}
				}
			} catch (err) {
				console.warn("UniverseView: folder note rename", err);
			} finally {
				syncing = false;
			}
		})();
	}));

	// Right-click: open, make or remove a folder's note; turn a note into a folder note and back.
	plugin.registerEvent(app.workspace.on("file-menu", (menu: Menu, file: TAbstractFile) => {
		if (plugin.settings.folderNotes === false) return;
		if (file instanceof TFolder && file.path !== "/") {
			const note = folderNoteOf(plugin, file);
			if (note) {
				menu.addItem((i) => i.setTitle("Open folder note").setIcon("file-symlink").setSection("open").onClick(() => void app.workspace.getLeaf(false).openFile(note)));
				menu.addItem((i) => i.setTitle("Detach folder note").setIcon("file-output").setSection("action").onClick(() => void unmakeFolderNote(plugin, note).catch((e: Error) => new Notice(e.message))));
				// With Obsidian's own Delete, at the bottom in red, not beside Detach.
				menu.addItem((i) => {
					i.setTitle("Delete folder note").setIcon("file-x").setSection("danger").onClick(() => void app.fileManager.trashFile(note));
					(i as unknown as { setWarning?: (w: boolean) => void }).setWarning?.(true);
				});
			} else {
				menu.addItem((i) => i.setTitle("Create folder note").setIcon("file-plus-2").onClick(() => void createFolderNote(plugin, file)));
			}
		} else if (file instanceof TFile && NOTE_EXTS.includes(file.extension)) {
			if (isFolderNote(file)) {
				menu.addItem((i) => i.setTitle("Detach from its folder").setIcon("file-output").onClick(() => void unmakeFolderNote(plugin, file).catch((e: Error) => new Notice(e.message))));
			} else {
				menu.addItem((i) => i.setTitle("Turn into folder note").setIcon("folder-input").onClick(() => void makeFolderNote(plugin, file).catch((e: Error) => new Notice(e.message))));
			}
		}
	}));

	plugin.addCommand({
		id: "folder-note-make",
		name: "Turn this note into a folder note",
		icon: "folder-input",
		checkCallback: (checking) => {
			const f = app.workspace.getActiveFile();
			if (!f || isFolderNote(f) || f.extension !== "md") return false;
			if (!checking) void makeFolderNote(plugin, f).catch((e: Error) => new Notice(e.message));
			return true;
		},
	});
	plugin.addCommand({
		id: "folder-note-detach",
		name: "Detach this folder note from its folder",
		icon: "file-output",
		checkCallback: (checking) => {
			const f = app.workspace.getActiveFile();
			if (!f || !isFolderNote(f)) return false;
			if (!checking) void unmakeFolderNote(plugin, f).catch((e: Error) => new Notice(e.message));
			return true;
		},
	});
	plugin.addCommand({
		id: "folder-note-open-parent",
		name: "Open the folder note this note sits in",
		icon: "folder-up",
		checkCallback: (checking) => {
			const f = app.workspace.getActiveFile();
			let dir = f?.parent;
			if (isFolderNote(f)) dir = dir?.parent;
			let note: TFile | undefined;
			while (dir && dir.path !== "/" && !(note = folderNoteOf(plugin, dir))) dir = dir.parent;
			if (!note) return false;
			if (!checking) void app.workspace.getLeaf(false).openFile(note);
			return true;
		},
	});

	plugin.register(() => {
		document.querySelectorAll(".uv-has-folder-note, .uv-folder-note-active, .uv-folder-note-hidden").forEach((x) => x.removeClasses(["uv-has-folder-note", "uv-folder-note-active", "uv-folder-note-hidden"]));
	});
	return paint;
}
