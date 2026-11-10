import { Modal, Platform } from "obsidian";
import type ChroniclePlugin from "../main";
import { el } from "../render/common";

/** Every key and click UniverseView knows, in one place. Hotkeys that can be changed say so. */
export class ShortcutsModal extends Modal {
	constructor(private plugin: ChroniclePlugin) {
		super(plugin.app);
	}

	onOpen() {
		this.containerEl.addClass("chronicle-scope-host");
		this.modalEl.addClass("chronicle-scope", "uv-shortcuts");
		this.titleEl.setText("Shortcuts");
		const mod = Platform.isMacOS ? "Cmd" : "Ctrl";
		const alt = Platform.isMacOS ? "Option" : "Alt";
		const sections: [string, [string, string][]][] = [
			["Open and inspect", [
				[`${alt}+click`, "Open anything with a hover card (a card, a pin, a bar, a row) in the inspector"],
				[`${mod}+click`, "Open the note itself (with Shift, beside this view)"],
				[`${mod}+${alt}+I`, "Open the inspector for the open note"],
				[`${mod}+${alt}+Q`, "Quick creator: a line or a form, into a linked note"],
				["Right-click", "The same menu everywhere: Inspect, Open, Show in, Find out, then this view's tools"],
			]],
			["Undo", [
				[`${mod}+${alt}+Z`, "Undo the last change UniverseView made"],
				[`${mod}+${alt}+Y`, "Redo it (kept across restarts)"],
				[`${mod}+${alt}+Shift+Z`, "Undo history: go back to any point, or redo"],
			]],
			["Hover cards", [
				["Rest the pointer", "A card opens after the delay in Settings; the ring shows it coming"],
				[alt, "Held while hovering, the card opens at once"],
				["P / I / E / O", "On an open card: pin it, inspect, edit, open the note"],
				["Esc", "Close the card"],
			]],
			["Drawing on the map", [
				["Enter / Esc", "Save or cancel the tool you are in"],
				[`${mod}+Z / ${mod}+Y`, "Undo or redo a step inside the tool"],
				["Shift+click", "Pick several corners to move together"],
				["Double-click a border", "Add a corner there"],
				["Right-click a corner", "Remove it"],
			]],
		];
		for (const [title, rows] of sections) {
			el("h4", { cls: "uv-shortcuts-head", text: title }, this.contentEl);
			const list = el("div", { cls: "uv-shortcuts-list" }, this.contentEl);
			for (const [keys, what] of rows) {
				el("kbd", { text: keys }, list);
				el("span", { text: what }, list);
			}
		}
		el("p", { cls: "setting-item-description", text: "Hotkeys can be changed in Settings → Hotkeys, under UniverseView." }, this.contentEl);
	}

	onClose() {
		this.contentEl.empty();
	}
}