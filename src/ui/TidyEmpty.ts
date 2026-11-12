import { Modal, Notice, TFile } from "obsidian";
import type UniverseViewPlugin from "../main";
import { el } from "../render/common";

type Where = "note" | "folder" | "vault";

/**
 * Removes the blank properties a template leaves behind (`aliases:`, `reign:`, `allies: []`) from this note, the notes in
 * its folder, or every UniverseView note. It says how many it would touch first, and it is one undo step.
 */
export class TidyEmptyModal extends Modal {
	private where: Where = "note";

	constructor(private plugin: UniverseViewPlugin) {
		super(plugin.app);
	}

	/** The notes in a scope: UniverseView's own notes only, so templates and other notes are left alone. */
	private files(scope: Where): TFile[] {
		const p = this.plugin;
		const active = p.app.workspace.getActiveFile();
		const entity = (f: TFile) => !!p.index.get(f.path);
		if (scope === "note") return active ? [active] : [];
		if (scope === "folder") {
			const dir = active?.parent?.path ?? "";
			return p.app.vault.getMarkdownFiles().filter((f) => entity(f) && (dir === "/" || dir === "" || f.path.startsWith(`${dir}/`)));
		}
		return p.app.vault.getMarkdownFiles().filter(entity);
	}

	onOpen() {
		this.containerEl.addClass("universeview-scope-host");
		this.modalEl.addClass("universeview-scope");
		this.titleEl.setText("Remove empty properties");
		el("p", { cls: "setting-item-description", text: "Blank properties (a name with nothing after it, or an empty list) add clutter: UniverseView reads a missing property the same way. Zero, false and anything filled in stay." }, this.contentEl);
		const chips = el("div", { cls: "uv-rel-kinds" }, this.contentEl);
		const status = el("p", { cls: "uv-tidy-status" }, this.contentEl);
		const buttons = el("div", { cls: "modal-button-container" }, this.contentEl);
		const ok = el("button", { cls: "mod-cta", text: "Remove" }, buttons);
		el("button", { text: "Cancel" }, buttons).addEventListener("click", () => this.close());
		const names: [Where, string][] = [["note", "This note"], ["folder", "Notes in this folder"], ["vault", "Every UniverseView note"]];
		const btns: Record<string, HTMLElement> = {};
		const paint = () => {
			let notes = 0;
			let props = 0;
			for (const f of this.files(this.where)) {
				const n = this.plugin.emptyCountOf(f);
				if (n) notes++;
				props += n;
			}
			for (const [id] of names) btns[id].toggleClass("is-on", id === this.where);
			status.setText(props ? `${props} blank propert${props === 1 ? "y" : "ies"} in ${notes} note${notes === 1 ? "" : "s"}.` : "Nothing blank here.");
			ok.disabled = !props;
		};
		for (const [id, label] of names) {
			btns[id] = el("button", { cls: "universeview-chip", text: label }, chips);
			btns[id].addEventListener("click", () => {
				this.where = id;
				paint();
			});
		}
		paint();
		ok.addEventListener("click", () => {
			void this.plugin.tidyEmptyProperties(this.files(this.where)).then((r) => {
				this.close();
				new Notice(r.props ? `Removed ${r.props} blank propert${r.props === 1 ? "y" : "ies"} from ${r.notes} note${r.notes === 1 ? "" : "s"}. Undo brings them back.` : "Nothing was blank.");
			});
		});
	}

	onClose() {
		this.contentEl.empty();
	}
}