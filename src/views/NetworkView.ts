import { Menu, type ViewStateResult } from "obsidian";
import { optionsButton, type OptionEntry } from "../render/optionsmenu";
import { EntityPickerModal } from "../ui/suggest";
import type { EntityType } from "../types";
import { DEFAULT_NETWORK_OPTIONS, LINK_GROUPS, NetworkOptions, NetworkRenderer } from "../render/network";
import { el, icon, iconButton, toggleChip } from "../render/common";
import { ChronicleView, TimeSlider } from "./base";

export const VIEW_NETWORK = "chronicle-network";

const TYPE_CHIPS: [EntityType, string, string][] = [
	["person", "People", "user-round"],
	["culture", "Cultures", "flag"],
	["place", "Places", "map-pin"],
	["event", "Events", "calendar-clock"],
];

export class NetworkView extends ChronicleView {
	protected exportable = true;
	private options: NetworkOptions = structuredClone(DEFAULT_NETWORK_OPTIONS);
	private renderer?: NetworkRenderer;
	private slider?: TimeSlider;

	getViewType() {
		return VIEW_NETWORK;
	}
	getDisplayText() {
		return "Connections";
	}
	getIcon() {
		return "waypoints";
	}

	getState(): Record<string, unknown> {
		return { options: this.options };
	}

	async setState(state: unknown, result: ViewStateResult) {
		const s = state as { options?: Partial<NetworkOptions> } | undefined;
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
		this.options.filter.folder ??= this.defaultScope();
		this.fillToolbar();
		this.renderer = new NetworkRenderer(this.body, this.plugin, this.options, false, this.hoverHost);
		this.renderer.onPinned = () => {
			this.app.workspace.requestSaveLayout();
			this.fillToolbar();
		};
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
				this.searchBox(left, o.filter.search ?? "", "Filter…", (v) => {
					o.filter.search = v || undefined;
					this.update();
				});
				this.entityPicker(left, undefined, o.focus, "Focus on…", (k) => {
					o.focus = k;
					this.update();
				});
				this.scopePicker(left, o.filter.folder, (v) => {
					o.filter.folder = v;
					this.slider?.updateRange();
					this.update();
				});
				optionsButton(left, () => {
					const list: OptionEntry[] = [];
					list.push({ type: "choice", label: "Steps from the focus", options: [["1", "1 step"], ["2", "2 steps"], ["3", "3 steps"], ["4", "4 steps"]], get: () => String(o.depth), set: (v) => { o.depth = +v; this.update(); } });
					list.push({ type: "toggle", label: "Names on the dots", get: () => o.labels, set: (v) => { o.labels = v; this.update(); } });
					list.push({
						type: "toggle", label: "Draw links (or hold Alt and drag)", get: () => !!this.renderer?.linkMode, set: (v) => {
							if (this.renderer) this.renderer.linkMode = v;
						},
					});
					list.push({ type: "toggle", label: "Fade other times instead of hiding them", get: () => !!o.fade, set: (v) => { o.fade = v; this.update(); } });
					list.push({
						type: "action", label: "The web as one person knows it…", icon: "eye", run: () => new EntityPickerModal(this.plugin, ["person"], (p) => {
							o.pov = p.key;
							this.fillToolbar();
							this.update();
						}, "Seen by whom?").open(),
					});
					const pins = Object.keys(o.pinned ?? {}).length;
					if (pins) list.push({ type: "action", label: `Unpin the ${pins} placed notes`, icon: "pin-off", run: () => this.renderer?.unpin() });
					return list;
				});
				const chips = this.group();
				for (const [type, label, icon] of TYPE_CHIPS) {
					toggleChip(chips, label, icon, o.types.includes(type), (v) => {
						o.types = v ? [...o.types, type] : o.types.filter((t) => t !== type);
						this.update();
					});
				}
				// Which kinds of link are drawn, in one menu.
				const hidden = new Set(o.hiddenLinks ?? []);
				const linksBtn = el("button", { cls: "chronicle-chip chronicle-overlay-btn", attr: { "aria-haspopup": "menu", title: "Which kinds of link to draw" } }, chips);
				icon(el("span", { cls: "chronicle-chip-icon" }, linksBtn), "spline");
				el("span", { text: "Links" }, linksBtn);
				el("span", { cls: "chronicle-chip-count", text: `${LINK_GROUPS.length - hidden.size}/${LINK_GROUPS.length}` }, linksBtn);
				linksBtn.addEventListener("click", (evt) => {
					const menu = new Menu();
					for (const [g, label, ic] of LINK_GROUPS)
						menu.addItem((i) => i.setTitle(label).setIcon(ic).setChecked(!hidden.has(g)).onClick(() => {
							if (hidden.has(g)) hidden.delete(g);
							else hidden.add(g);
							o.hiddenLinks = [...hidden];
							this.fillToolbar();
							this.update();
						}));
					menu.showAtMouseEvent(evt);
				});
				if (o.pov) {
					const pov = el("button", { cls: "chronicle-chip is-active", attr: { title: "The web as this person knows it: click to show everything again" } }, chips);
					icon(el("span", { cls: "chronicle-chip-icon" }, pov), "eye");
					el("span", { text: `Seen by ${this.plugin.index.get(o.pov)?.name ?? o.pov}` }, pov);
					icon(el("span", { cls: "chronicle-chip-icon" }, pov), "x");
					pov.addEventListener("click", () => {
						o.pov = undefined;
						this.fillToolbar();
						this.update();
					});
				}
				const time = this.group();
				this.slider = new TimeSlider(
					time,
					this.plugin,
					() => this.plugin.index.dominantCalendar(o.filter.folder),
					() => o.filter.folder,
					o.at,
					(day) => {
						const idx = this.plugin.index;
						const same = idx.timeStep(day) === idx.timeStep(o.at);
						o.at = day;
						if (same) this.app.workspace.requestSaveLayout();
						else this.update();
					},
				);
				this.spacer();
				const right = this.group();
				iconButton(right, "zoom-out", "Zoom out", () => this.renderer?.zoomBy(1 / 1.25));
				iconButton(right, "zoom-in", "Zoom in", () => this.renderer?.zoomBy(1.25));
				iconButton(right, "maximize", "Fit graph", () => this.renderer?.fit());
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
