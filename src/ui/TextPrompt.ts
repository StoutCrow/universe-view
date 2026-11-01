import { Modal } from "obsidian";
import type ChroniclePlugin from "../main";
import { el } from "../render/common";

/** A one-line text question ("Name of the new board?"). */
export class TextPrompt extends Modal {
	constructor(plugin: ChroniclePlugin, private heading: string, private value: string, private onSubmit: (v: string) => void) {
		super(plugin.app);
	}
	onOpen() {
		this.modalEl.addClass("chronicle-scope");
		this.titleEl.setText(this.heading);
		const input = el("input", { attr: { type: "text" } }, this.contentEl);
		input.value = this.value;
		input.addClass("chronicle-prompt-input");
		const submit = () => {
			const v = input.value.trim();
			if (!v) return;
			this.close();
			this.onSubmit(v);
		};
		input.addEventListener("keydown", (evt) => {
			if (evt.key === "Enter") submit();
		});
		const buttons = el("div", { cls: "modal-button-container" }, this.contentEl);
		const ok = el("button", { cls: "mod-cta", text: "OK" }, buttons);
		ok.addEventListener("click", submit);
		window.setTimeout(() => input.focus(), 30);
	}
	onClose() {
		this.contentEl.empty();
	}
}

/** A yes/no question before something that can't easily be undone ("Delete the calendar?"). */
export class ConfirmPrompt extends Modal {
	constructor(plugin: ChroniclePlugin, private heading: string, private message: string, private action: string, private onConfirm: () => void) {
		super(plugin.app);
	}
	onOpen() {
		this.modalEl.addClass("chronicle-scope");
		this.titleEl.setText(this.heading);
		for (const para of this.message.split("\n\n")) el("p", { text: para }, this.contentEl);
		const buttons = el("div", { cls: "modal-button-container" }, this.contentEl);
		const ok = el("button", { cls: "mod-warning", text: this.action }, buttons);
		ok.addEventListener("click", () => {
			this.close();
			this.onConfirm();
		});
		el("button", { text: "Cancel" }, buttons).addEventListener("click", () => this.close());
		window.setTimeout(() => ok.focus(), 30);
	}
	onClose() {
		this.contentEl.empty();
	}
}
