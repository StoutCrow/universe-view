import { Modal, Setting } from "obsidian";
import type UniverseViewPlugin from "../main";
import type { TieDetails } from "../index/ties";

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
		this.modalEl.addClass("universeview-scope");
		this.titleEl.setText(`Edit the tie with ${this.who}`);
		const box = this.contentEl;
		if (this.kinds.length) {
			new Setting(box).setName("Kind").addDropdown((d) => {
				d.addOption("", "Not said");
				for (const [k, label] of this.kinds) d.addOption(k, label);
				d.setValue(this.value.kind ?? "").onChange((v) => (this.value.kind = v || undefined));
			});
		}
		new Setting(box).setName("When").setDesc("Dates, as you write them in this world: 1230 – 1255, or a start alone.").addText((t) => t.setValue(this.value.span ?? "").onChange((v) => (this.value.span = v.trim() || undefined)));
		new Setting(box).setName("How it ended").setDesc("If it did: divorce, death, annulment…").addText((t) => t.setValue(this.value.reason ?? "").onChange((v) => (this.value.reason = v.trim() || undefined)));
		new Setting(box).setName("Custom text").setDesc("Shown as you write it, on both sides.").addText((t) => {
			t.setValue(this.value.label ?? "").onChange((v) => (this.value.label = v.trim() || undefined));
			t.inputEl.addEventListener("keydown", (evt) => {
				if (evt.key === "Enter") {
					evt.preventDefault();
					this.save();
				}
			});
		});
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
