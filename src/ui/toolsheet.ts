import { Modal } from "obsidian";
import type ChroniclePlugin from "../main";
import { formatSpan } from "../dates/parser";
import { el, icon } from "../render/common";

/**
 * One form for every map and territory tool: a titled sheet with an icon, a line on what it does,
 * labelled fields (dates are checked as you type), a live preview of the result, and one clear
 * button to do it. Enter does it too; Escape closes.
 */

export type SheetField =
	| { key: string; kind: "text"; label: string; value?: string; placeholder?: string; hint?: string }
	| { key: string; kind: "date"; label: string; value?: string; calendar: string; optional?: boolean; hint?: string }
	| { key: string; kind: "number"; label: string; value: number; min: number; max: number; step: number; unit?: string; hint?: string }
	| { key: string; kind: "choice"; label: string; value: string; options: [string, string][]; hint?: string };

export interface SheetOptions {
	title: string;
	icon: string;
	intro: string;
	fields: SheetField[];
	submit: string;
	/** What it will do, from the values as they are now (shown under the fields). */
	preview?: (values: Record<string, string>) => string;
	/** A reason the values can't be used yet (shown instead of doing it), or nothing when they're fine. */
	check?: (values: Record<string, string>) => string | undefined;
	run: (values: Record<string, string>) => void | Promise<void>;
	/** A warning tone for things that remove or replace. */
	danger?: boolean;
}

export class ToolSheet extends Modal {
	private values: Record<string, string> = {};

	constructor(private plugin: ChroniclePlugin, private o: SheetOptions) {
		super(plugin.app);
		for (const f of o.fields) this.values[f.key] = f.kind === "number" ? String(f.value) : f.value ?? "";
	}

	onOpen() {
		const { contentEl, modalEl } = this;
		this.containerEl.addClass("chronicle-scope-host");
		modalEl.addClass("chronicle-scope", "uv-sheet");
		this.titleEl.empty();
		const head = el("div", { cls: "uv-sheet-head" }, this.titleEl);
		icon(el("span", { cls: "uv-sheet-icon" + (this.o.danger ? " is-danger" : "") }, head), this.o.icon);
		el("span", { text: this.o.title }, head);
		el("p", { cls: "uv-sheet-intro", text: this.o.intro }, contentEl);
		const form = el("div", { cls: "uv-sheet-fields" }, contentEl);
		const previewEl = el("div", { cls: "uv-sheet-preview" }, contentEl);
		const footer = el("div", { cls: "uv-sheet-footer" }, contentEl);
		el("button", { text: "Cancel" }, footer).addEventListener("click", () => this.close());
		const go = el("button", { cls: this.o.danger ? "mod-warning" : "mod-cta", text: this.o.submit }, footer);
		const refresh = () => {
			const problem = this.o.check?.(this.values);
			previewEl.empty();
			previewEl.toggleClass("is-problem", !!problem);
			const text = problem ?? this.o.preview?.(this.values);
			if (text) {
				icon(el("span", {}, previewEl), problem ? "alert-triangle" : "sparkles");
				el("span", { text }, previewEl);
			}
			previewEl.toggleClass("is-empty", !text);
			go.disabled = !!problem;
		};
		let firstInput: HTMLElement | undefined;
		for (const f of this.o.fields) {
			const row = el("label", { cls: `uv-sheet-field is-${f.kind}` }, form);
			el("span", { cls: "uv-sheet-label", text: f.label }, row);
			const control = el("div", { cls: "uv-sheet-control" }, row);
			const hint = el("span", { cls: "uv-sheet-hint", text: f.hint ?? "" }, row);
			if (f.kind === "text" || f.kind === "date") {
				const input = el("input", { attr: { type: "text", placeholder: f.kind === "date" ? (f.optional ? "Leave empty for open-ended" : "A date") : f.placeholder ?? "" } }, control);
				input.value = this.values[f.key];
				firstInput ??= input;
				const check = () => {
					this.values[f.key] = input.value;
					if (f.kind === "date") {
						const v = input.value.trim();
						const cal = this.plugin.calendars.get(f.calendar);
						const d = v ? this.plugin.parseDate(v, f.calendar) : null;
						hint.setText(!v ? f.hint ?? "" : d ? `✓ ${formatSpan(d, undefined, cal)}` : `Not a date in the ${cal.name} calendar yet`);
						hint.toggleClass("is-ok", !!v && !!d);
						hint.toggleClass("is-bad", !!v && !d);
					}
					refresh();
				};
				input.addEventListener("input", check);
				check();
			} else if (f.kind === "number") {
				const range = el("input", { attr: { type: "range", min: String(f.min), max: String(f.max), step: String(f.step) } }, control);
				const box = el("input", { cls: "uv-sheet-num", attr: { type: "number", min: String(f.min), max: String(f.max), step: String(f.step) } }, control);
				if (f.unit) el("span", { cls: "uv-sheet-unit", text: f.unit }, control);
				range.value = box.value = this.values[f.key];
				const set = (v: string) => {
					this.values[f.key] = v;
					range.value = box.value = v;
					refresh();
				};
				range.addEventListener("input", () => set(range.value));
				box.addEventListener("input", () => set(box.value));
				firstInput ??= box;
			} else {
				const seg = el("div", { cls: "uv-sheet-segments" }, control);
				const draw = () => {
					seg.empty();
					for (const [v, label] of f.options) {
						const b = el("button", { cls: "uv-sheet-segment" + (this.values[f.key] === v ? " is-active" : ""), text: label }, seg);
						b.addEventListener("click", (evt) => {
							evt.preventDefault();
							this.values[f.key] = v;
							draw();
							refresh();
						});
					}
				};
				draw();
			}
		}
		const submit = async () => {
			if (go.disabled) return;
			go.disabled = true;
			this.close();
			await this.o.run(this.values);
		};
		go.addEventListener("click", () => void submit());
		// Enter in any field does it (buttons keep their own Enter).
		contentEl.addEventListener("keydown", (evt) => {
			if (evt.key !== "Enter" || evt.isComposing || (evt.target as HTMLElement)?.tagName === "BUTTON") return;
			evt.preventDefault();
			evt.stopPropagation();
			void submit();
		});
		refresh();
		window.setTimeout(() => firstInput?.focus(), 30);
	}

	onClose() {
		this.contentEl.empty();
	}
}

/** Opens a tool sheet. */
export function toolSheet(plugin: ChroniclePlugin, o: SheetOptions) {
	new ToolSheet(plugin, o).open();
}
