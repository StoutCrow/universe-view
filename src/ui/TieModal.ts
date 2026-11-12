import { Modal } from "obsidian";
import type UniverseViewPlugin from "../main";
import { TIE_GROUPS, fitTie, tieKindInfo, type TieDetails, type TieRole } from "../index/ties";

/** What a tie (a partner, a parent, a relationship) says about itself, for editing. */
export type TieEdit = Partial<TieDetails>;

/**
 * Picks the kind of a parent or partner tie in two steps: what it is (Parent, Married, Not married) as chips, then
 * which kind (Birth, Step, Foster…) as tabs under it. A kind of the note's own ("annulled") stays as a tab in its group.
 * Returns a function that repaints it for another kind.
 */
export function tiePicker(parent: HTMLElement, role: "parent" | "partner", kind: string | undefined, onPick: (kind: string) => void): (kind: string) => void {
	const box = parent.createDiv({ cls: "uv-tie-picker" });
	const groupsRow = box.createDiv({ cls: "uv-rel-kinds uv-tie-groups", attr: { role: "group", "aria-label": "Kind of tie" } });
	const subRow = box.createDiv({ cls: "uv-subtabs uv-tie-sub", attr: { role: "tablist" } });
	const groups = TIE_GROUPS[role].map((g) => ({ ...g, kinds: [...g.kinds] }));
	const start = tieKindInfo(role, kind);
	if (start.own) groups[start.group].kinds.push(start.info);
	let current = start.info.kind;
	const paint = (k: string) => {
		current = k;
		const at = tieKindInfo(role, k).group;
		groupsRow.querySelectorAll("button").forEach((b, i) => {
			b.toggleClass("is-active", i === at);
			b.setAttribute("aria-pressed", String(i === at));
		});
		subRow.empty();
		const kinds = groups[at]?.kinds ?? [];
		subRow.toggleClass("is-hidden", kinds.length < 2);
		for (const info of kinds) {
			const tab = subRow.createEl("button", { cls: "uv-subtab" + (info.kind === current ? " is-on" : ""), text: info.label, attr: { role: "tab", "aria-selected": String(info.kind === current) } });
			tab.addEventListener("click", () => {
				paint(info.kind);
				onPick(info.kind);
			});
		}
	};
	groups.forEach((g, i) => {
		const chip = groupsRow.createEl("button", { cls: "universeview-chip", text: g.label });
		chip.addEventListener("click", () => {
			// Choosing the group it is already in keeps the kind; another group starts on its first kind.
			if (tieKindInfo(role, current).group === i) return;
			paint(g.kinds[0].kind);
			onPick(g.kinds[0].kind);
		});
	});
	paint(current);
	return paint;
}

/**
 * Edits one existing relationship: what kind it is (for parents and partners), and then only the details that kind
 * has: a birth parent has no dates, a step-parent has when and how it ended. What is left empty is not written.
 */
export class TieModal extends Modal {
	private value: TieEdit;

	constructor(
		plugin: UniverseViewPlugin,
		private who: string,
		current: TieEdit,
		/** Parent and partner ties have kinds to choose from; any other relationship names its own. */
		private role: TieRole,
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
		const role = this.role;
		if (role !== "relation") {
			tiePicker(box, role, this.value.kind, (k) => {
				this.value.kind = k || undefined;
				showFields();
			});
		}
		const grid = box.createDiv({ cls: "uv-tie-grid" });
		const field = (label: string, hint: string, value: string | undefined, put: (v: string | undefined) => void, wide = false) => {
			const f = grid.createEl("label", { cls: "uv-tie-field" + (wide ? " is-wide" : "") });
			const name = f.createSpan({ cls: "uv-tie-label", text: label });
			const input = f.createEl("input", { attr: { type: "text", placeholder: hint } });
			input.value = value ?? "";
			input.addEventListener("input", () => put(input.value.trim() || undefined));
			input.addEventListener("keydown", (evt) => {
				if (evt.key === "Enter" && !evt.isComposing) {
					evt.preventDefault();
					this.save();
				}
			});
			return { f, name, input };
		};
		const when = field("When", "1230 – 1255, or a start alone", this.value.span, (v) => (this.value.span = v));
		const ended = field("How it ended", "Divorce, death, annulment…", this.value.reason, (v) => (this.value.reason = v));
		const text = field("Custom text", "Shown as written, on both sides", this.value.label, (v) => (this.value.label = v), true);
		// Only the details this kind has; the others are kept while you look, and dropped on save.
		const showFields = () => {
			const { info } = tieKindInfo(role, this.value.kind);
			when.f.toggleClass("is-hidden", !info.when);
			when.name.setText(info.when ?? "When");
			ended.f.toggleClass("is-hidden", !info.ends);
			when.f.toggleClass("is-wide", !info.ends);
		};
		showFields();
		window.setTimeout(() => (tieKindInfo(role, this.value.kind).info.when ? when.input : text.input).focus(), 30);
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
		this.onSave(fitTie(this.role, { ...this.value, words: this.value.words ?? [] }));
	}

	onClose() {
		this.contentEl.empty();
	}
}
