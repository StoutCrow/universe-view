import { UndoHistoryModal } from "../ui/undohistory";
import { ItemView, WorkspaceLeaf, debounce } from "obsidian";
import type ChroniclePlugin from "../main";
import type { EntityType } from "../types";
import { formatDay } from "../dates/parser";
import { rangeOf } from "../index/EntityIndex";
import { dropdown, el, icon, iconButton, setPressed } from "../render/common";
import { exportMenu, type ExportExtras } from "../ui/export";
import { EntityInputSuggest } from "../ui/suggest";

/** Shared shell for UniverseView views: a toolbar above a full-size canvas. */
export abstract class ChronicleView extends ItemView {
	protected toolbar!: HTMLElement;
	protected toolbarRight!: HTMLElement;
	protected body!: HTMLElement;
	private built = false;

	constructor(leaf: WorkspaceLeaf, protected plugin: ChroniclePlugin) {
		super(leaf);
	}

	async onOpen() {
		this.contentEl.empty();
		this.contentEl.addClass("chronicle-view", "chronicle-scope");
		this.toolbar = el("div", { cls: "chronicle-toolbar" }, this.contentEl);
		this.body = el("div", { cls: "chronicle-view-body" }, this.contentEl);
		this.build();
		this.built = true;
		this.registerEvent(this.plugin.index.on("changed", () => this.onIndexChanged()));
	}

	/** Runs this view inside UniverseView's dashboard, which owns the tab. */
	async mount(host: HTMLElement) {
		this.containerEl.dataset.type = this.getViewType();
		host.appendChild(this.containerEl);
		this.load();
		await this.onOpen();
		await this.setState({}, { history: false });
	}

	/** Ends a view started with mount(). */
	async unmount() {
		await this.onClose();
		this.unload();
		this.containerEl.remove();
	}

	protected get isBuilt(): boolean {
		return this.built;
	}

	/** Page Preview stores its popover on the hover parent; the view itself serves as one. */
	protected get hoverHost(): { hoverPopover: unknown } {
		return this as unknown as { hoverPopover: unknown };
	}

	protected defaultScope(): string | undefined {
		return this.plugin.index.defaultScope(this.app.workspace.getActiveFile()?.path);
	}

	/** Builds toolbar and renderer. */
	protected abstract build(): void;
	protected abstract onIndexChanged(): void;

	/** Re-creates the toolbar (e.g. when the list of folders changed). */
	protected rebuildToolbar(fill: () => void) {
		this.toolbar.empty();
		fill();
		const last = this.toolbar.lastElementChild as HTMLElement | null;
		const g = last?.hasClass("chronicle-toolbar-group") ? last : this.group();
		if (this.exportable) {
			const b = iconButton(g, "image-down", "Export as an image or PDF", (evt) => exportMenu(this.plugin, this.body, this.getDisplayText(), evt, this.exportExtras()));
			g.insertBefore(b, g.firstChild);
		}
		// Every view can be saved under a name, with its filters, focus and date.
		const save = iconButton(g, "bookmark-plus", "Save this view (open it again later, or link to it from a note)", () => this.plugin.saveCurrentView(this));
		g.insertBefore(save, g.firstChild);
		// What UniverseView changed lately, to undo back to any point.
		iconButton(g, "history", "Undo history", () => new UndoHistoryModal(this.plugin).open());
		// The settings that shape this view, one click away.
		iconButton(g, "settings", "UniverseView settings for this view", () => this.plugin.openSettings(this.settingsTab));
	}

	/** Which settings tab belongs to this view (maps → Maps & realms, timelines → Time…). */
	protected get settingsTab(): string {
		const t = this.getViewType();
		if (/map|realm|orgchart|houses/.test(t)) return "maps";
		if (/timeline|calendar|lineage/.test(t)) return "time";
		if (/table|explorer|overview|family|network/.test(t)) return "notes";
		return "appearance";
	}

	/** Views that can be saved as a picture get an export button at the end of the toolbar. */
	protected exportable = false;

	/** A caption and extra menu entries for this view's export (the map adds its date and a time-lapse). */
	protected exportExtras(): ExportExtras {
		return {};
	}

	protected group(cls = ""): HTMLElement {
		return el("div", { cls: `chronicle-toolbar-group ${cls}`.trim() }, this.toolbar);
	}

	protected spacer() {
		el("div", { cls: "chronicle-toolbar-spacer" }, this.toolbar);
	}

	protected searchBox(parent: HTMLElement, value: string, placeholder: string, onChange: (v: string) => void): HTMLInputElement {
		const wrap = el("div", { cls: "chronicle-search search-input-container" }, parent);
		const input = el("input", { attr: { type: "search", placeholder, spellcheck: "false" } }, wrap);
		input.value = value;
		const fire = debounce(() => onChange(input.value), 200, true);
		input.addEventListener("input", fire);
		const clear = el("div", { cls: "search-input-clear-button", title: "Clear" }, wrap);
		clear.addEventListener("click", () => {
			input.value = "";
			onChange("");
		});
		return input;
	}

	/** "" means all folders (chosen explicitly); undefined means nothing chosen yet. */
	protected scopePicker(parent: HTMLElement, value: string | undefined, onChange: (v: string) => void) {
		const folders = this.plugin.index.topFolders();
		if (folders.length < 2) return;
		dropdown(parent, [["", "All folders"], ...folders.map((f) => [f, f] as [string, string])], value ?? "", (v) => onChange(v), "Scope");
	}

	protected entityPicker(
		parent: HTMLElement,
		types: EntityType[] | undefined,
		value: string | undefined,
		placeholder: string,
		onPick: (key: string | undefined) => void,
	): HTMLInputElement {
		const wrap = el("div", { cls: "chronicle-picker" }, parent);
		const ic = el("span", { cls: "chronicle-picker-icon" }, wrap);
		icon(ic, types?.length === 1 && types[0] === "person" ? "user-round-search" : "search");
		const input = el("input", { attr: { type: "text", placeholder, spellcheck: "false" } }, wrap);
		input.value = value ? this.plugin.index.get(value)?.name ?? "" : "";
		new EntityInputSuggest(this.app, input, this.plugin, types, (e) => onPick(e.key));
		const clear = el("div", { cls: "chronicle-picker-clear clickable-icon", title: "Clear" }, wrap);
		icon(clear, "x");
		clear.addEventListener("click", () => {
			input.value = "";
			onPick(undefined);
		});
		input.addEventListener("keydown", (evt) => {
			if (evt.key === "Escape") input.blur();
		});
		return input;
	}
}

/** Year scrubber with play button; emits a universal day or undefined (all time). */
export class TimeSlider {
	private enabled: boolean;
	private range: [number, number] = [0, 1];
	private input: HTMLInputElement;
	private label: HTMLElement;
	private toggle: HTMLElement;
	private playBtn: HTMLElement;
	private timer = 0;

	constructor(
		parent: HTMLElement,
		private plugin: ChroniclePlugin,
		private getCalendar: () => string,
		private folder: () => string | undefined,
		private value: number | undefined,
		private onChange: (day: number | undefined) => void,
		private types: EntityType[] = ["event", "person", "culture", "place"],
	) {
		this.enabled = value !== undefined;
		const box = el("div", { cls: "chronicle-time" }, parent);
		this.toggle = el("button", { cls: "chronicle-chip is-toggle", title: "Show a moment in time" }, box);
		const ic = el("span", { cls: "chronicle-chip-icon" }, this.toggle);
		icon(ic, "history");
		el("span", { text: "Time" }, this.toggle);
		icon(el("span", { cls: "chronicle-chip-check" }, this.toggle), "check");
		this.playBtn = el("div", { cls: "clickable-icon chronicle-icon-btn", title: "Play through time" }, box);
		icon(this.playBtn, "play");
		this.input = el("input", { cls: "slider chronicle-time-range", attr: { type: "range", min: "0", max: "1000", step: "1" } }, box);
		this.label = el("span", { cls: "chronicle-time-label" }, box);
		this.toggle.addEventListener("click", () => {
			this.enabled = !this.enabled;
			if (this.enabled && this.value === undefined) this.value = this.range[1];
			this.stop();
			this.sync();
			this.emit();
		});
		this.input.addEventListener("input", () => {
			this.value = this.fromSlider(+this.input.value);
			this.sync();
			this.emitDebounced();
		});
		this.playBtn.addEventListener("click", () => (this.timer ? this.stop() : this.play()));
		this.updateRange();
	}

	private emitDebounced = debounce(() => this.emit(), 60, false);

	/** Jumps to a day (undefined = all time), as if the user had scrubbed there. */
	set(day: number | undefined) {
		this.stop();
		this.enabled = day !== undefined;
		if (day !== undefined) this.value = Math.max(this.range[0], Math.min(this.range[1], day));
		this.sync();
		this.emit();
	}

	private emit() {
		this.onChange(this.enabled ? this.value : undefined);
	}

	/** First and last day it reaches. */
	get span(): [number, number] {
		return [...this.range];
	}

	/** Shows a day (undefined = all time) without telling the view, which is already there. */
	show(day: number | undefined) {
		this.stop();
		this.enabled = day !== undefined;
		if (day !== undefined) this.value = day;
		this.sync();
	}

	updateRange() {
		let min = Infinity;
		let max = -Infinity;
		const folder = this.folder();
		for (const e of this.plugin.index.all()) {
			if (!this.types.includes(e.type)) continue;
			if (folder && !e.path.startsWith(folder + "/")) continue;
			const r = rangeOf(e);
			if (!r) continue;
			min = Math.min(min, r[0]);
			max = Math.max(max, r[1]);
		}
		// Nothing dated in that folder: span everything dated rather than a meaningless first year.
		if (!Number.isFinite(min) && folder) {
			for (const e of this.plugin.index.all()) {
				const r = this.types.includes(e.type) ? rangeOf(e) : undefined;
				if (!r) continue;
				min = Math.min(min, r[0]);
				max = Math.max(max, r[1]);
			}
		}
		// Things still standing ("1042 C.E. -") run to today in the world: let the slider reach it.
		const today = this.plugin.todayFor(folder ?? "", this.getCalendar());
		if (today !== undefined && Number.isFinite(min) && today > max) max = today;
		if (!Number.isFinite(min)) [min, max] = [0, 365];
		this.range = [min, max];
		this.sync();
	}

	private toSlider(day: number): number {
		const [a, b] = this.range;
		return b > a ? Math.round(((day - a) / (b - a)) * 1000) : 0;
	}

	private fromSlider(v: number): number {
		const [a, b] = this.range;
		return a + ((b - a) * v) / 1000;
	}

	private sync() {
		setPressed(this.toggle, this.enabled);
		this.input.disabled = !this.enabled;
		setPressed(this.playBtn, !!this.timer);
		this.input.parentElement?.toggleClass("is-enabled", this.enabled);
		if (this.value !== undefined) this.input.value = String(this.toSlider(this.value));
		const cal = this.plugin.calendars.get(this.getCalendar());
		this.label.setText(this.enabled && this.value !== undefined ? formatDay(this.value, cal, "year") : "All time");
	}

	private play() {
		if (!this.enabled) {
			this.enabled = true;
			this.value = this.range[0];
		} else if (this.value === undefined || this.value >= this.range[1]) this.value = this.range[0];
		icon(this.playBtn, "pause");
		const step = (this.range[1] - this.range[0]) / 200;
		this.timer = window.setInterval(() => {
			this.value = Math.min(this.range[1], (this.value ?? this.range[0]) + step);
			this.sync();
			this.emit();
			if (this.value >= this.range[1]) this.stop();
		}, 80);
		this.sync();
		this.emit();
	}

	stop() {
		if (this.timer) window.clearInterval(this.timer);
		this.timer = 0;
		icon(this.playBtn, "play");
		setPressed(this.playBtn, false);
	}
}
