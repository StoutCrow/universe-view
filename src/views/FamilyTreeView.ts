import { Notice, TFile, ViewStateResult } from "obsidian";
import { DEFAULT_FAMILY_OPTIONS, FamilyOptions, FamilyTreeRenderer } from "../render/family";
import { FanChartRenderer, TimeTreeRenderer } from "../render/treecharts";
import { dropdown, iconButton } from "../render/common";
import { optionsButton, type OptionEntry } from "../render/optionsmenu";
import { UniverseViewBase } from "./base";
import { AddRelativesModal } from "../ui/AddRelatives";

export const VIEW_FAMILY = "chronicle-family";

export class FamilyTreeView extends UniverseViewBase {
	protected exportable = true;
	private options: FamilyOptions = { ...DEFAULT_FAMILY_OPTIONS };
	private follow = false;
	private renderer?: FamilyTreeRenderer | FanChartRenderer | TimeTreeRenderer;
	private picker?: HTMLInputElement;

	getViewType() {
		return VIEW_FAMILY;
	}
	getDisplayText() {
		const name = this.plugin?.index.get(this.options.root)?.name;
		return name ? `Family of ${name}` : "Family tree";
	}
	getIcon() {
		return "git-fork";
	}

	getState(): Record<string, unknown> {
		return { options: this.options, follow: this.follow };
	}

	async setState(state: unknown, result: ViewStateResult) {
		const s = state as { options?: Partial<FamilyOptions>; follow?: boolean } | undefined;
		const layout = this.options.layout;
		if (s?.options) this.options = { ...this.options, ...s.options };
		if (s?.follow !== undefined) this.follow = s.follow;
		if (this.isBuilt) {
			this.fillToolbar();
			if (this.options.layout !== layout) this.makeRenderer();
			this.setRoot(this.options.root, false);
		}
		await super.setState(state, result);
	}

	protected build() {
		if (!this.options.root) {
			const active = this.app.workspace.getActiveFile();
			const e = active && this.plugin.index.get(active.path);
			if (e?.type === "person") this.options.root = e.key;
		}
		this.fillToolbar();
		this.makeRenderer();
		this.registerEvent(
			this.app.workspace.on("file-open", (file: TFile | null) => {
				if (!this.follow || !file) return;
				const e = this.plugin.index.get(file.path);
				if (e?.type === "person" && e.key !== this.options.root) this.setRoot(e.key);
			}),
		);
	}

	/** The tree, the fan chart or the time tree, depending on the chosen layout. */
	private makeRenderer() {
		this.renderer?.destroy();
		// The tree and everyone-related are the same cards, laid out two ways.
		const make = this.options.layout === "fan" ? FanChartRenderer : this.options.layout === "time" ? TimeTreeRenderer : FamilyTreeRenderer;
		this.renderer = new make(this.body, this.plugin, this.options, false, this.hoverHost);
		this.renderer.onRecenter = (key) => this.setRoot(key);
		if (this.renderer instanceof FamilyTreeRenderer)
			this.renderer.onFold = () => {
				this.app.workspace.requestSaveLayout();
				this.fillToolbar();
			};
	}

	/** Pans to someone already in the tree; anyone else becomes its centre. */
	private find(key: string) {
		const r = this.renderer;
		if (r instanceof FamilyTreeRenderer && r.findInTree(key)) return;
		// Hidden in a folded branch: unfold the branches above them, then find them.
		if (r instanceof FamilyTreeRenderer && this.options.collapsed?.length) {
			const above = new Set<string>();
			const walk = (k: string, d: number) => {
				if (d > 30) return;
				for (const p of this.plugin.index.get(k)?.parents ?? []) {
					above.add(p.key);
					walk(p.key, d + 1);
				}
			};
			walk(key, 0);
			const keep = this.options.collapsed.filter((k) => !above.has(k));
			if (keep.length < this.options.collapsed.length) {
				this.options.collapsed = keep;
				r.options = this.options;
				r.refresh();
				this.fillToolbar();
				this.app.workspace.requestSaveLayout();
				if (r.findInTree(key)) return;
			}
		}
		const name = this.plugin.index.get(key)?.name ?? key;
		new Notice(`${name} isn't in this tree as drawn: centring it on them.`);
		this.setRoot(key);
	}

	setRoot(key: string | undefined, save = true) {
		this.options.root = key;
		if (this.picker) this.picker.value = key ? this.plugin.index.get(key)?.name ?? "" : "";
		if (this.renderer) {
			this.renderer.options = this.options;
			this.renderer.refresh();
		}
		// Tab title shows whose tree this is.
		(this.leaf as unknown as { updateHeader?: () => void }).updateHeader?.();
		if (save) this.app.workspace.requestSaveLayout();
	}

	private update() {
		this.renderer!.options = this.options;
		this.renderer!.refresh();
		this.app.workspace.requestSaveLayout();
	}

	private fillToolbar() {
		this.rebuildToolbar(() => {
			const o = this.options;
			const left = this.group();
			this.picker = this.entityPicker(left, ["person"], o.root, "Choose a person…", (k) => this.setRoot(k));
			dropdown(left, [["tree", "Family tree"], ["everyone", "Everyone related"], ["fan", "Fan chart (ancestors)"], ["time", "Over time (descendants)"]], o.layout ?? "tree", (v) => {
				const before = o.layout ?? "tree";
				o.layout = v as FamilyOptions["layout"];
				// The tree and everyone-related share a renderer; the others have their own.
				const cards = (l: string) => l === "tree" || l === "everyone";
				if (cards(before) && cards(v)) this.update();
				else this.makeRenderer();
				this.fillToolbar();
				this.app.workspace.requestSaveLayout();
			}, "Layout");
				// Find someone in a big tree without losing your place.
				const findBox = this.group();
				const finder = this.entityPicker(findBox, ["person"], undefined, "Find in this tree…", (k) => {
					if (!k) return;
					this.find(k);
					finder.value = "";
				});
				const layout = o.layout ?? "tree";
				optionsButton(left, () => {
					const gens = [0, 1, 2, 3, 4, 5, 6].map((n) => [String(n), String(n)] as [string, string]);
					const list: OptionEntry[] = [];
					if (layout === "everyone") {
						const steps: [string, string][] = [["1", "1 · parents, children"], ["2", "2 · grandparents, siblings"], ["3", "3 · aunts, uncles, nieces"], ["4", "4 · first cousins"], ["6", "6 · second cousins"], ["99", "Everyone"]];
						list.push({ type: "choice", label: "How far out", options: steps, get: () => String(o.steps ?? 3), set: (v) => { o.steps = +v; this.update(); } });
						list.push({ type: "toggle", label: "In-laws", get: () => !!o.inLaws, set: (v) => { o.inLaws = v; this.update(); } });
					} else {
						if (layout !== "time") list.push({ type: "choice", label: "Generations of ancestors", options: gens, get: () => String(o.up), set: (v) => { o.up = +v; this.update(); } });
						if (layout !== "fan") list.push({ type: "choice", label: "Generations of descendants", options: gens, get: () => String(o.down), set: (v) => { o.down = +v; this.update(); } });
						if (layout === "tree") list.push({ type: "toggle", label: "Siblings", get: () => o.siblings, set: (v) => { o.siblings = v; this.update(); } });
					}
					if (layout === "tree" || layout === "everyone") {
							list.push({ type: "choice", label: "Card style", options: [["cards", "Cards"], ["compact", "Compact"], ["portrait", "Portrait"], ["chart", "Chart"]], get: () => o.style ?? "cards", set: (v) => { o.style = v as FamilyOptions["style"]; this.update(); } });
							list.push({ type: "choice", label: "Lines", options: [["rounded", "Rounded"], ["square", "Square"], ["curved", "Curved"]], get: () => o.lines ?? "rounded", set: (v) => { o.lines = v as FamilyOptions["lines"]; this.update(); } });
						}
						if (layout === "tree" || layout === "everyone") list.push({ type: "toggle", label: "Relationships on cards", get: () => o.relations !== false, set: (v) => { o.relations = v; this.update(); } });
					list.push({
						type: "toggle", label: "Follow the active note", get: () => this.follow, set: (v) => {
							this.follow = v;
							this.app.workspace.requestSaveLayout();
							const f = v ? this.app.workspace.getActiveFile() : null;
							const e = f && this.plugin.index.get(f.path);
							if (e?.type === "person") this.setRoot(e.key);
						},
					});
					if (o.collapsed?.length && layout === "tree") list.push({ type: "action", label: `Unfold all branches (${o.collapsed.length})`, icon: "unfold-vertical", run: () => { o.collapsed = []; this.update(); } });
					list.push({ type: "action", label: "How are two people related?", icon: "git-compare", run: () => this.plugin.openKinship(o.root) });
					return list;
				});

			this.spacer();
			const right = this.group();
			iconButton(right, "zoom-out", "Zoom out", () => this.renderer?.zoomBy(1 / 1.25));
			iconButton(right, "zoom-in", "Zoom in", () => this.renderer?.zoomBy(1.25));
			iconButton(right, "maximize", "Fit tree", () => this.renderer?.fit());
			iconButton(right, "users-round", "Add relatives by name to the centre person (no notes made)", () => {
					const root = this.plugin.index.get(this.options.root);
					if (root) new AddRelativesModal(this.plugin, root).open();
					else new Notice("Pick a person at the centre first.");
				});
				iconButton(right, "user-round-plus", "New person", () => this.plugin.createEntityPrompt({ type: "person" }), "mod-cta-icon");
		});
	}

	protected onIndexChanged() {
		this.renderer?.refresh();
	}

	async onClose() {
		this.renderer?.destroy();
	}
}
