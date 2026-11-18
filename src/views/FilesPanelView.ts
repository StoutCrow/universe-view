import { setIcon, type ViewStateResult, type WorkspaceLeaf } from "obsidian";
import type UniverseViewPlugin from "../main";
import { el } from "../render/common";
import { ExplorerView } from "./ExplorerView";

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

/** The Library, placed in the sidebar: the same view and code, opening as the tree alone (details and summary can be switched on). */
export class FilesPanelView extends ExplorerView {
	protected panel = true;

	constructor(leaf: WorkspaceLeaf, plugin: UniverseViewPlugin) {
		super(leaf, plugin);
		this.state = { ...this.state, onlyNotes: false, hideStats: true, hideDetail: true };
	}

	getViewType() {
		return VIEW_FILES;
	}
	getDisplayText() {
		return "Universeview files";
	}
	getIcon() {
		return "folder-tree";
	}

	async setState(state: unknown, result: ViewStateResult) {
		// Layouts saved before the merge kept the tree's state under "files".
		const old = (state as { files?: unknown } | undefined)?.files;
		await super.setState(old ? { explorer: old } : state, result);
	}
}