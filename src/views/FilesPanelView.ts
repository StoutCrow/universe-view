import { TFile, debounce, type ViewStateResult } from "obsidian";
import { ENTITY_TYPES } from "../types";
import { TYPE_ICONS, TYPE_LABELS, el, iconButton, openEntity, setPressed } from "../render/common";
import { FileTree, type TreeState } from "../ui/filetree";
import { ChronicleView } from "./base";

export const VIEW_FILES = "chronicle-files";

/** The Library's tree as a sidebar panel, beside Obsidian's own file explorer. */
export class FilesPanelView extends ChronicleView {
	private state: TreeState = { expanded: [], onlyChronicle: false, search: "" };
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
		const list = el("div", { cls: "chronicle-dash-list" }, root);
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
		// The panel follows the open note, however it was opened.
		this.registerEvent(this.app.workspace.on("file-open", (f: TFile | null) => {
			if (!f || f.path === this.state.selected) return;
			this.tree.pick(f.path, false);
			this.tree.render();
			this.tree.scrollToPicked();
		}));
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
		const only = iconButton(tools, "filter", "UniverseView notes only", () => {
			this.state.onlyChronicle = !this.state.onlyChronicle;
			this.refresh();
			this.app.workspace.requestSaveLayout();
		});
		setPressed(only, this.state.onlyChronicle);
		iconButton(tools, "chevrons-down-up", "Collapse all folders", () => this.tree.collapseAll());
		iconButton(tools, "chevrons-up-down", "Expand all folders", () => this.tree.expandAll());
		iconButton(tools, "plus", "New note", () => this.plugin.createEntityPrompt({}));
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
