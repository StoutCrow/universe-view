import type { ViewStateResult } from "obsidian";
import { optionsButton, type OptionEntry } from "../render/optionsmenu";
import { DEFAULT_HOUSES_OPTIONS, GROUP_KINDS, HousesOptions, HousesRenderer } from "../render/houses";
import { iconButton } from "../render/common";
import { ChronicleView } from "./base";

export const VIEW_HOUSES = "chronicle-houses";

export class HousesView extends ChronicleView {
	protected exportable = true;
	private options: HousesOptions = { ...DEFAULT_HOUSES_OPTIONS };
	private renderer?: HousesRenderer;

	getViewType() {
		return VIEW_HOUSES;
	}
	getDisplayText() {
		return GROUP_KINDS.house.plural;
	}
	getIcon() {
		return "castle";
	}
	getState(): Record<string, unknown> {
		return { options: this.options };
	}
	async setState(state: unknown, result: ViewStateResult) {
		const s = state as { options?: Partial<HousesOptions> } | undefined;
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
		this.renderer = new HousesRenderer(this.body, this.plugin, this.options, false, this.hoverHost);
	}

	private update(save = true) {
		if (!this.renderer) return;
		this.renderer.options = this.options;
		this.renderer.refresh();
		if (save) this.app.workspace.requestSaveLayout();
	}

	private fillToolbar() {
		this.rebuildToolbar(() => {
			const o = this.options;
			const left = this.group();
			this.scopePicker(left, o.folder, (v) => {
				o.folder = v;
				this.update();
			});
			optionsButton(left, () => [
				{ type: "toggle", label: "By descent (people without a house count in their parents')", get: () => !!o.descent, set: (v) => { o.descent = v; this.update(); } },
				{ type: "toggle", label: "All groups, not just houses and clans", get: () => !!o.all, set: (v) => { o.all = v; this.update(); } },
			] satisfies OptionEntry[]);			this.spacer();
			const right = this.group();
			iconButton(right, "zoom-out", "Zoom out", () => this.renderer?.zoomBy(1 / 1.25));
			iconButton(right, "zoom-in", "Zoom in", () => this.renderer?.zoomBy(1.25));
			iconButton(right, "maximize", "Fit", () => this.renderer?.fit());
			iconButton(right, "plus", "New house", () => this.plugin.createEntityPrompt({ type: "culture", scope: o.folder || undefined }), "mod-cta-icon");
		});
	}

	protected onIndexChanged() {
		this.renderer?.refresh();
	}

	async onClose() {
		this.renderer?.destroy();
	}
}
