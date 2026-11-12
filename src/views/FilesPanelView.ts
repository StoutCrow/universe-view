import { Notice, TFile, debounce, setIcon, type ViewStateResult } from "obsidian";
import type UniverseViewPlugin from "../main";
import { ENTITY_TYPES } from "../types";
import { TYPE_ICONS, TYPE_LABELS, el, iconButton, openEntity, setPressed } from "../render/common";
import { FileTree, TREE_OPTIONS_CHANGED, treeOptionsMenu, type TreeState } from "../ui/filetree";
import { UniverseViewBase } from "./base";

export const VIEW_FILES = "chronicle-files";

/** A button in the toolbar of Obsidian's file explorer that opens the files panel. */
export function explorerButton(plugin: UniverseViewPlugin) {
	const sync = () => {
		for (const leaf of plugin.app.workspace.getLeavesOfType("file-explorer")) {
			const bar = leaf.view.containerEl.querySelector(".nav-buttons-container");
			const have = bar?.querySelector(".uv-open-files");
			if (!plugin.moduleOn(VIEW_FILES)) have?.remove();
			else if (bar && !have) {
				const b = el("div", { cls: "clickable-icon nav-action-button uv-open-files", attr: { "aria-label": "Open UniverseView files" } }, bar as HTMLElement);
				setIcon(b, "folder-tree");
				b.addEventListener("click", () => void plugin.openFilesPanel());
			}
		}
	};
	plugin.app.workspace.onLayoutReady(sync);
	plugin.registerEvent(plugin.app.workspace.on("layout-change", sync));
	plugin.register(() => document.querySelectorAll(".uv-open-files").forEach((b) => b.remove()));
	return sync;
}

/** The Library's tree as a sidebar panel, beside Obsidian's own file explorer. */
export class FilesPanelView extends UniverseViewBase {
	private state: TreeState = { expanded: [], onlyNotes: false, search: "" };
	private tree!: FileTree;
	private stale = false;

	getViewType() {
		return VIEW_FILES;
	}
	getDisplayText() {
		return "UniverseView files";
	}
	getIcon() {
		return "folder-tree";
	}

	getState(): Record<string, unknown> {
		return { files: this.state };
	}

	async setState(state: unknown, result: ViewStateResult) {
		const s = state as { files?: Partial<TreeState> } | undefined;
		if (s?.files) this.state = { ...this.state, ...s.files };
		if (this.isBuilt) this.refresh();
		await super.setState(state, result);
	}

	protected build() {
		this.contentEl.addClass("uv-files-view");
		const root = el("div", { cls: "uv-files" }, this.body);
		this.searchBox(root, this.state.search, "Find a note or folder…", (v) => {
			this.state.search = v;
			this.tree.render();
			this.app.workspace.requestSaveLayout();
		});
		const list = el("div", { cls: "universeview-dash-list" }, root);
		this.tree = new FileTree(this.plugin, list, () => this.state, {
			foldOnClick: true,
			changed: () => this.app.workspace.requestSaveLayout(),
			select: (path, isFolder, evt) => {
				if (isFolder) return;
				this.tree.pick(path, false);
				this.tree.render();
				openEntity(this.plugin, path, evt);
			},
		});
		this.refresh();
		this.registerEvent(this.app.workspace.on(TREE_OPTIONS_CHANGED as "quit", () => this.tree.render()));
		this.registerEvent(this.app.vault.on("rename", (f, old) => this.tree.followRename(f.path, old)));
		// The panel follows the open note, however it was opened.
		this.registerEvent(this.app.workspace.on("file-open", (f: TFile | null) => {
			if (!f || f.path === this.state.selected) return;
			this.tree.pick(f.path, false);
			this.tree.render();
			this.tree.scrollToPicked();
		}));
	}

	/** Finds the note you are reading in the tree. */
	private revealOpen() {
		const file = this.app.workspace.getActiveFile();
		if (!file) new Notice("No note is open.");
		else if (!this.tree.reveal(file.path)) new Notice("That note is hidden by the filters or the search here.");
	}

	private refresh() {
		this.fillToolbar();
		this.tree.render();
	}

	private fillToolbar() {
		this.toolbar.empty();
		const types = this.group();
		for (const t of ENTITY_TYPES) {
			const b = iconButton(types, TYPE_ICONS[t], `Only ${TYPE_LABELS[t].toLowerCase()} notes`, () => {
				this.state.typeFilter = this.state.typeFilter === t ? undefined : t;
				this.refresh();
				this.app.workspace.requestSaveLayout();
			});
			setPressed(b, this.state.typeFilter === t);
		}
		this.spacer();
		const tools = this.group();
		iconButton(tools, "locate", "Reveal the open note in the tree", () => this.revealOpen());
		const only = iconButton(tools, "filter", "UniverseView notes only", () => {
			this.state.onlyNotes = !this.state.onlyNotes;
			this.refresh();
			this.app.workspace.requestSaveLayout();
		});
		setPressed(only, this.state.onlyNotes);
		iconButton(tools, "sliders-horizontal", "How the tree looks", (evt) => treeOptionsMenu(this.plugin, evt));
		iconButton(tools, "chevrons-down-up", "Collapse all folders", () => this.tree.collapseAll());
		iconButton(tools, "chevrons-up-down", "Expand all folders", () => this.tree.expandAll());
		iconButton(tools, "plus", "New note", () => this.plugin.createEntityPrompt({}));
		iconButton(tools, "folder", "Show Obsidian's Files", () => {
			const files = this.app.workspace.getLeavesOfType("file-explorer")[0];
			if (files) void this.app.workspace.revealLeaf(files);
		});
	}

	// Index rebuilds come in bursts while typing: redraw once they settle, and only when the panel can be seen.
	private redraw = debounce(() => {
		if (this.containerEl.offsetParent === null) this.stale = true;
		else this.tree.render();
	}, 300, true);

	protected onIndexChanged() {
		this.redraw();
	}

	onResize() {
		if (!this.stale || this.containerEl.offsetParent === null) return;
		this.stale = false;
		this.tree.render();
	}
}
