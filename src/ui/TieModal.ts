import { Modal } from "obsidian";
import type UniverseViewPlugin from "../main";
import type { TieDetails } from "../index/ties";

/** A kind word as a label: "co-parent" → "Co parent". */
const tieWord = (k: string) => k.charAt(0).toUpperCase() + k.slice(1).replace(/-/g, " ");

/** What a tie (a partner, a parent, a relationship) says about itself, for editing. */
export type TieEdit = Partial<TieDetails>;

/**
 * Edits one existing relationship: what kind it is (when the tie has kinds to choose from), when it lasted, how it
 * ended and any text of your own. What is left empty is not written.
 */
export class TieModal extends Modal {
	private value: TieEdit;

	constructor(
		plugin: UniverseViewPlugin,
		private who: string,
		current: TieEdit,
		/** Kinds to choose from, with their labels; empty when the tie has no kinds (a relationship row names its own). */
		private kinds: [string, string][],
		private onSave: (v: TieEdit) => void,
	) {
		super(plugin.app);
		this.value = { ...current };
	}

	onOpen() {
		this.containerEl.addClass("universeview-scope-host");
		this.modalEl.addClass("universeview-scope", "uv-tie-modal");
		this.titleEl.setText(`Tie with ${this.who}`);
		const box = this.contentEl;
		// The kind as a row of chips, like the Add relatives window; a kind of the note's own (annulled…) is kept as one.
		if (this.kinds.length) {
			const own = this.value.kind && !this.kinds.some(([k]) => k === this.value.kind) ? [[this.value.kind, tieWord(this.value.kind)] as [string, string]] : [];
			const row = box.createDiv({ cls: "uv-rel-kinds uv-tie-kinds", attr: { role: "group", "aria-label": "Kind" } });
			const chips: [string, HTMLElement][] = [];
			const paint = () => {
				for (const [k, c] of chips) {
					c.toggleClass("is-active", k === (this.value.kind ?? ""));
					c.setAttribute("aria-pressed", String(k === (this.value.kind ?? "")));
				}
			};
			for (const [k, label] of [["", "Not said"] as [string, string], ...this.kinds, ...own]) {
				const c = row.createEl("button", { cls: "universeview-chip", text: label });
				c.addEventListener("click", () => {
					this.value.kind = k || undefined;
					paint();
				});
				chips.push([k, c]);
			}
			paint();
		}
		const grid = box.createDiv({ cls: "uv-tie-grid" });
		const field = (label: string, hint: string, value: string | undefined, put: (v: string | undefined) => void, wide = false) => {
			const f = grid.createEl("label", { cls: "uv-tie-field" + (wide ? " is-wide" : "") });
			f.createSpan({ cls: "uv-tie-label", text: label });
			const input = f.createEl("input", { attr: { type: "text", placeholder: hint } });
			input.value = value ?? "";
			input.addEventListener("input", () => put(input.value.trim() || undefined));
			input.addEventListener("keydown", (evt) => {
				if (evt.key === "Enter" && !evt.isComposing) {
					evt.preventDefault();
					this.save();
				}
			});
			return input;
		};
		const when = field("When", "1230 – 1255, or a start alone", this.value.span, (v) => (this.value.span = v));
		field("How it ended", "Divorce, death, annulment…", this.value.reason, (v) => (this.value.reason = v));
		field("Custom text", "Shown as written, on both sides", this.value.label, (v) => (this.value.label = v), true);
		window.setTimeout(() => when.focus(), 30);
		const buttons = box.createDiv({ cls: "modal-button-container" });
		buttons.createEl("button", { cls: "mod-cta", text: "Save" }).addEventListener("click", () => this.save());
		buttons.createEl("button", { text: "Clear details" }).addEventListener("click", () => {
			this.value = { words: [] };
			this.save();
		});
		buttons.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
	}

	private save() {
		this.close();
		this.onSave({ ...this.value, words: this.value.words ?? [] });
	}

	onClose() {
		this.contentEl.empty();
	}
}
