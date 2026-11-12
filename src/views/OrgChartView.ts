import type { ViewStateResult } from "obsidian";
import { optionsButton, type OptionEntry } from "../render/optionsmenu";
import { DEFAULT_ORG_OPTIONS, OrgChartRenderer, OrgOptions, type OrgMode } from "../render/orgchart";
import { dropdown, iconButton } from "../render/common";
import { UniverseViewBase, TimeSlider } from "./base";
import { VIEW_HOUSES } from "./HousesView";

export const VIEW_ORG = "chronicle-orgchart";

const MODES: [OrgMode, string][] = [["realms", "Realms"], ["dynasties", "Dynasties"], ["orgs", "Organisations"]];

export class OrgChartView extends UniverseViewBase {
	protected exportable = true;
	private options: OrgOptions = { ...DEFAULT_ORG_OPTIONS };
	private renderer?: OrgChartRenderer;
	private slider?: TimeSlider;

	getViewType() {
		return VIEW_ORG;
	}
	getDisplayText() {
		const r = this.options.root ? this.plugin?.index.get(this.options.root)?.name : undefined;
		const what = MODES.find(([m]) => m === (this.options.mode ?? "realms"))?.[1] ?? "Realms";
		return r ? `${what}: ${r}` : what;
	}
	getIcon() {
		return this.options.mode === "dynasties" ? "castle" : this.options.mode === "orgs" ? "network" : "crown";
	}

	getState(): Record<string, unknown> {
		return { options: this.options };
	}

	async setState(state: unknown, result: ViewStateResult) {
		const s = state as { options?: Partial<OrgOptions> } | undefined;
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
		this.options.folder ??= this.options.root ? undefined : this.defaultScope();
		this.fillToolbar();
		this.renderer = new OrgChartRenderer(this.body, this.plugin, this.options, false, this.hoverHost);
		this.renderer.onTimeChange = (day) => this.slider?.set(day);
		this.renderer.onOptionsChange = () => this.app.workspace.requestSaveLayout();
		this.renderer.onReroot = (key) => {
			this.options.root = key;
			this.fillToolbar();
			this.update();
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
		this.rebuildToolbar(() => {
			const o = this.options;
			const left = this.group();
			this.scopePicker(left, o.folder, (v) => {
				o.folder = v;
				this.slider?.updateRange();
				this.update();
			});
			dropdown(left, MODES, o.mode ?? "realms", (v) => {
				o.mode = v as OrgMode;
				o.root = undefined;
				this.fillToolbar();
				this.update();
			}, "What the chart shows");
			const mode = o.mode ?? "realms";
			this.entityPicker(left, mode === "realms" ? ["culture", "place"] : ["culture"], o.root, mode === "realms" ? "Realm (all when empty)…" : mode === "dynasties" ? "House (all when empty)…" : "Organisation (all when empty)…", (k) => {
				o.root = k;
				this.update();
			});
			const time = this.group();
			this.slider = new TimeSlider(
				time,
				this.plugin,
				() => (o.root ? this.plugin.index.get(o.root)?.calendar : undefined) ?? this.plugin.index.dominantCalendar(o.folder),
				() => o.folder || undefined,
				o.at,
				(day) => {
					const idx = this.plugin.index;
					const same = idx.timeStep(day) === idx.timeStep(o.at);
					o.at = day;
					// Nothing on the chart changes between these two days: only the timeline's date line moves.
					if (same) {
						this.renderer?.moveCursor(day);
						this.app.workspace.requestSaveLayout();
					} else this.update();
				},
				["culture", "person"],
			);
			optionsButton(left, () => [
				{ type: "choice", label: "Levels shown", options: [["1", "1 level"], ["2", "2 levels"], ["3", "3 levels"], ["4", "4 levels"], ["8", "All levels"]], get: () => String(o.depth), set: (v) => { o.depth = Number(v); this.update(); } },
				{ type: "toggle", label: "Members", get: () => !!o.members, set: (v) => { o.members = v; this.update(); } },
				{ type: "toggle", label: "Group ties", get: () => o.relations !== false, set: (v) => { o.relations = v; this.update(); } },
				{ type: "toggle", label: "People ties", get: () => o.ties !== false, set: (v) => { o.ties = v; this.update(); } },
				{ type: "toggle", label: "Timeline", get: () => !!o.timeline, set: (v) => { o.timeline = v; this.update(); } },
			] satisfies OptionEntry[]);			this.spacer();
			const right = this.group();
			// Rearranging happens in one place: the realm tree, where titles and houses drag to a new liege.
			if (mode !== "orgs") iconButton(right, "list-tree", "Rearrange in the realm tree (drag a title to a new liege, a house to a new parent)", () => void this.plugin.openRealms(o.root));
			if (mode === "dynasties") iconButton(right, "gantt-chart", "Houses over time: each house's members by generation", () => void this.plugin.activateView(VIEW_HOUSES, { options: { folder: o.folder } }));
			iconButton(right, "zoom-out", "Zoom out", () => this.renderer?.zoomBy(1 / 1.25));
			iconButton(right, "zoom-in", "Zoom in", () => this.renderer?.zoomBy(1.25));
			iconButton(right, "maximize", "Fit", () => this.renderer?.fit());
			iconButton(right, "plus", mode === "realms" ? "New realm or title" : mode === "dynasties" ? "New house" : "New organisation", () => this.plugin.createEntityPrompt({ type: "culture", groupKind: mode === "realms" ? "realm" : mode === "dynasties" ? "house" : undefined, scope: o.folder || undefined }), "mod-cta-icon");
		});
	}

	protected onIndexChanged() {
		this.slider?.updateRange();
		this.renderer?.refresh();
	}

	async onClose() {
		this.slider?.stop();
		this.renderer?.destroy();
	}
}
