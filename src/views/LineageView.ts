import type { ViewStateResult } from "obsidian";
import { LineageOptions, LineageRenderer } from "../render/lineage";
import { dropdown, iconButton, toggleChip } from "../render/common";
import { GROUP_KINDS, type GroupKind } from "../render/houses";
import { ChronicleView } from "./base";

export const VIEW_LINEAGE = "chronicle-lineage";

export class LineageView extends ChronicleView {
	protected exportable = true;
	private options: LineageOptions = {};
	private renderer?: LineageRenderer;

	getViewType() {
		return VIEW_LINEAGE;
	}
	getDisplayText() {
		return this.options.kind ? `Lineage of ${GROUP_KINDS[this.options.kind].plural.toLowerCase()}` : "Lineage of groups";
	}
	getIcon() {
		return "git-branch";
	}

	getState(): Record<string, unknown> {
		return { options: this.options };
	}

	async setState(state: unknown, result: ViewStateResult) {
		const s = state as { options?: LineageOptions } | undefined;
		if (s?.options) {
			this.options = { ...this.options, ...s.options };
			if (this.isBuilt) {
				this.fillToolbar();
				this.update(false);
			}
		}
		await super.setState(state, result);
	}

	protected build() {
		this.options.folder ??= this.defaultScope();
		this.fillToolbar();
		this.renderer = new LineageRenderer(this.body, this.plugin, this.options, false, this.hoverHost);
		// Picking a group or a kind in the chart: keep the toolbar and the saved state in step.
		this.renderer.onOptionsChange = () => {
			this.fillToolbar();
			(this.leaf as unknown as { updateHeader?: () => void }).updateHeader?.();
			this.app.workspace.requestSaveLayout();
		};
	}

	private update(save = true) {
		if (!this.renderer) return;
		this.renderer.options = this.options;
		this.renderer.refresh();
		(this.leaf as unknown as { updateHeader?: () => void }).updateHeader?.();
		if (save) this.app.workspace.requestSaveLayout();
	}

	private fillToolbar() {
		const o = this.options;
		this.rebuildToolbar(() => {
			const left = this.group();
			this.modeSwitch(left, VIEW_LINEAGE);
			this.scopePicker(left, o.folder, (v) => {
				o.folder = v;
				this.update();
			});
			dropdown(left, [["", "All groups"], ...(Object.entries(GROUP_KINDS) as [GroupKind, { plural: string }][]).map(([k, v]) => [k, v.plural] as [string, string])], o.kind ?? "", (v) => {
				o.kind = (v || undefined) as GroupKind | undefined;
				this.update();
			}, "Which groups");
			this.entityPicker(left, ["culture"], o.focus, "Only one group's line…", (k) => {
				o.focus = k;
				this.update();
			});
			const look = this.group();
			toggleChip(look, "By kind", "rows-3", o.group !== "none", (v) => {
				o.group = v ? "kind" : "none";
				this.update();
			});
			toggleChip(look, "Events", "diamond", o.events !== false, (v) => {
				o.events = v;
				this.update();
			});
			toggleChip(look, "Leaders", "crown", o.leaders !== false, (v) => {
				o.leaders = v;
				this.update();
			});
			this.spacer();
			const right = this.group();
			iconButton(right, "zoom-out", "Zoom out", () => this.renderer?.zoomBy(1 / 1.25));
			iconButton(right, "zoom-in", "Zoom in", () => this.renderer?.zoomBy(1.25));
			iconButton(right, "maximize", "Fit", () => this.renderer?.fit());
			iconButton(right, "plus", "New group", () => this.plugin.createEntityPrompt({ type: "culture", groupKind: o.kind === "realm" || o.kind === "house" ? o.kind : undefined, scope: o.folder || undefined }), "mod-cta-icon");
		});
	}

	protected timeRange() {
		return this.renderer?.range;
	}

	showTimeRange(r: { start: number; scale: number }) {
		this.renderer?.showRange(r);
	}

	protected onIndexChanged() {
		this.renderer?.refresh();
	}

	async onClose() {
		this.renderer?.destroy();
	}
}
