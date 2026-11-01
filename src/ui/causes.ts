import { Modal, Setting, TFile } from "obsidian";
import type ChroniclePlugin from "../main";
import { formatSpan } from "../dates/parser";
import { el, openEntity } from "../render/common";
import { pickerSetting } from "./people";

/**
 * Why did this happen, and what came of it: the chain of causes behind an event (from `caused-by:`
 * and `led-to:` on either note), and the chain of what it led to, a few steps each way.
 */
export class CauseChainModal extends Modal {
	constructor(private plugin: ChroniclePlugin, private key?: string) {
		super(plugin.app);
	}

	onOpen() {
		this.modalEl.addClass("chronicle-scope", "chronicle-tool-modal");
		this.titleEl.setText("Why did this happen?");
		pickerSetting(this.plugin, this.contentEl, "Event", ["event"], this.key, (k) => {
			this.key = k;
			this.show();
		});
		this.out = el("div", { cls: "chronicle-causes" }, this.contentEl);
		this.show();
	}

	private out!: HTMLElement;

	private show() {
		const out = this.out;
		out.empty();
		const idx = this.plugin.index;
		const e = idx.get(this.key);
		if (!e) {
			el("div", { cls: "chronicle-dash-muted", text: "Pick an event. Link events with `caused-by: [[Earlier event]]` or `led-to: [[Later event]]` on either note." }, out);
			return;
		}
		const cols = el("div", { cls: "chronicle-causes-cols" }, out);
		const side = (title: string, map: Map<string, Set<string>>, empty: string) => {
			const col = el("div", { cls: "chronicle-causes-col" }, cols);
			el("div", { cls: "chronicle-causes-title", text: title }, col);
			const seen = new Set<string>([e.key]);
			const walk = (key: string, parent: HTMLElement, depth: number) => {
				const next = [...(map.get(key) ?? [])].filter((k) => !seen.has(k)).sort((a, b) => (idx.get(a)?.start?.start ?? 0) - (idx.get(b)?.start?.start ?? 0));
				if (!next.length) return false;
				const ul = el("ul", { cls: "chronicle-causes-list" }, parent);
				for (const k of next) {
					seen.add(k);
					const li = el("li", {}, ul);
					const x = idx.get(k);
					const a = el("a", { cls: "chronicle-causes-link" + (x ? "" : " is-unresolved"), text: x?.name ?? k.replace(/^\?/, "") }, li);
					a.addEventListener("click", (evt) => {
						if (x) openEntity(this.plugin, x.key, evt);
					});
					const when = x ? formatSpan(x.start, x.end, this.plugin.calendars.get(x.calendar)) : "";
					if (when) el("span", { cls: "chronicle-causes-when", text: when }, li);
					if (depth < 6) walk(k, li, depth + 1);
				}
				return true;
			};
			if (!walk(e.key, col, 1)) el("div", { cls: "chronicle-dash-muted", text: empty }, col);
		};
		side("What led to it", idx.causesOf, "Nothing recorded. Add `caused-by: [[…]]` to this note.");
		side("What it led to", idx.effectsOf, "Nothing recorded. Add `led-to: [[…]]` to this note.");
		new Setting(out).addButton((b) => b.setButtonText("Add a cause…").onClick(() => this.link("caused-by"))).addButton((b) => b.setButtonText("Add a consequence…").onClick(() => this.link("led-to")));
	}

	/** Adds an event to this one's `caused-by:` or `led-to:`. */
	private link(field: "caused-by" | "led-to") {
		const e = this.plugin.index.get(this.key);
		const file = e && this.plugin.app.vault.getAbstractFileByPath(e.path);
		if (!e || !(file instanceof TFile)) return;
		void import("./suggest").then(({ EntityPickerModal }) =>
			new EntityPickerModal(this.plugin, ["event"], (other) => {
				void this.plugin.editFrontmatter(file, (f) => {
					const list = ([] as unknown[]).concat(f[field] ?? []).filter((v) => v !== null && v !== "");
					const link = `[[${other.name}]]`;
					if (!list.includes(link)) list.push(link);
					f[field] = list;
				}, field === "caused-by" ? `Cause of ${e.name}` : `Consequence of ${e.name}`).then(() => window.setTimeout(() => this.show(), 400));
			}, field === "caused-by" ? "What led to it?" : "What did it lead to?").open(),
		);
	}

	onClose() {
		this.contentEl.empty();
	}
}
