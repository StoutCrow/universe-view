import { Modal, TFile } from "obsidian";
import type UniverseViewPlugin from "../main";
import { el, icon, openEntity } from "../render/common";

/** "just now", "4 min ago", "2 h ago". */
function ago(ms: number): string {
	const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
	if (s < 45) return "just now";
	const m = Math.round(s / 60);
	if (m < 60) return `${m} min ago`;
	const h = Math.round(m / 60);
	return h < 24 ? `${h} h ago` : new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Every UniverseView change you can undo, newest first: what it did, when, and which notes it
 * touched. Undo the latest, or go back to any point (everything after it is undone too, in order).
 * Changes made by typing in a note aren't here; Obsidian's own undo covers those.
 */
export class UndoHistoryModal extends Modal {
	private ref?: { off: () => void };

	constructor(private plugin: UniverseViewPlugin) {
		super(plugin.app);
	}

	onOpen() {
		this.containerEl.addClass("universeview-scope-host");
		this.modalEl.addClass("universeview-scope", "uv-sheet", "uv-history");
		this.titleEl.empty();
		const head = el("div", { cls: "uv-sheet-head" }, this.titleEl);
		icon(el("span", { cls: "uv-sheet-icon" }, head), "history");
		el("span", { text: "Undo history" }, head);
		const evRef = this.app.workspace.on("universeview:history-changed" as never, () => this.draw());
		this.ref = { off: () => this.app.workspace.offref(evRef) };
		this.draw();
	}

	private draw() {
		const { contentEl } = this;
		contentEl.empty();
		const steps = this.plugin.undoSteps();
		const undone = this.plugin.redoList();
		el("p", { cls: "uv-sheet-intro", text: "UniverseView's changes to your notes' properties, newest first (the last 50). Undo one, or go back to any point: everything after it is undone too. Typing in a note is undone with Obsidian's own undo." }, contentEl);
		// What was just undone, with Redo: first, so a slip is one click to take back.
		if (undone.length) {
			const box = el("div", { cls: "uv-history-undone" }, contentEl);
			el("div", { cls: "uv-history-undone-head", text: `Undone (${undone.length}): redo brings back` }, box);
			undone.forEach((s, i) => {
				const row = el("div", { cls: "uv-history-row is-undone" + (i === 0 ? " is-latest" : "") }, box);
				el("span", { cls: "uv-history-dot" }, row);
				const main = el("div", { cls: "uv-history-main" }, row);
				el("div", { cls: "uv-history-label", text: s.label }, main);
				const sub = el("div", { cls: "uv-history-sub" }, main);
				for (const path of s.paths.slice(0, 3)) {
					const f = this.app.vault.getAbstractFileByPath(path);
					el("span", { text: f instanceof TFile ? f.basename : path.split("/").pop() ?? path }, sub);
					el("span", { text: " · " }, sub);
				}
				const b = el("button", { cls: i === 0 ? "mod-cta" : "", text: i === 0 ? "Redo" : `Redo up to here (${i + 1})` }, row);
				b.addEventListener("click", () => {
					b.disabled = true;
					void this.plugin.redoMany(i + 1);
				});
			});
		}
		if (!steps.length) {
			const empty = el("div", { cls: "uv-history-empty" }, contentEl);
			icon(el("span", {}, empty), "check-circle-2");
			el("span", { text: undone.length ? "Nothing left to undo." : "Nothing to undo yet." }, empty);
			return;
		}
		const list = el("div", { cls: "uv-history-list" }, contentEl);
		steps.forEach((s, i) => {
			const row = el("div", { cls: "uv-history-row" + (i === 0 ? " is-latest" : "") }, list);
			el("span", { cls: "uv-history-dot" }, row);
			const main = el("div", { cls: "uv-history-main" }, row);
			el("div", { cls: "uv-history-label", text: s.label }, main);
			const sub = el("div", { cls: "uv-history-sub" }, main);
			el("span", { text: ago(s.at) }, sub);
			// The notes it touched, each one click away.
			for (const path of s.paths.slice(0, 4)) {
				el("span", { text: " · " }, sub);
				const f = this.app.vault.getAbstractFileByPath(path);
				const a = el("a", { text: f instanceof TFile ? f.basename : path.split("/").pop() ?? path }, sub);
				a.addEventListener("click", (evt) => openEntity(this.plugin, path, evt));
			}
			if (s.paths.length > 4) el("span", { text: ` +${s.paths.length - 4}` }, sub);
			const b = el("button", { cls: i === 0 ? "mod-cta" : "", text: i === 0 ? "Undo" : `Undo back to here (${i + 1})` }, row);
			b.addEventListener("click", () => {
				b.disabled = true;
				void this.plugin.undoMany(i + 1);
			});
		});
	}

	onClose() {
		this.ref?.off();
		this.contentEl.empty();
	}
}
