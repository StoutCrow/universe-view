import { Keymap, Notice, Setting, TFile, ViewStateResult, debounce } from "obsidian";
import { ENTITY_TYPES, PIN_SIZES, type ChronDate, type Entity, type EntityType } from "../types";
import { buildFieldAliases, findMapping, setMapping, type FieldName } from "../settings";
import { formatDate, formatSpan } from "../dates/parser";
import { validate } from "../index/validate";
import { TYPE_ICONS, TYPE_LABELS, el, entityColor, icon, iconButton, openEntity, setPressed, showEntityMenu, svg, toggleChip, typeColorVar } from "../render/common";
import { subOrgs } from "../render/orgchart";
import { placeStyleFields, placeKinds, LAYER_NAMES, kindDefaults } from "../ui/PlaceStyleModal";
import { TextPrompt } from "../ui/TextPrompt";
import { ArcRenderer } from "../render/arc";
import { renderWorldStats } from "../render/stats";
import { totalPopulation } from "../index/tidy";
import { KnowledgeModal } from "../ui/people";
import { renderCompleteness } from "../ui/tidying";
import { AddRelationModal, removeLink, type LinkSpec, type Unlink } from "../ui/relations";
import { relInverse } from "../index/relkinds";
import { ChronicleView } from "./base";
import { asText } from "../index/text";
import { FileTree, TREE_OPTIONS_CHANGED, folderViews, plural, treeOptionsMenu, type TreeState } from "../ui/filetree";

export const VIEW_EXPLORER = "chronicle-explorer";

interface ExplorerState extends TreeState {
	/** Summary strip hidden. */
	hideStats?: boolean;
	/** Details hidden: the tree has the whole width, and clicking a note opens it. */
	hideDetail?: boolean;
}

interface RelItem {
	key: string;
	name: string;
	note?: string;
	/** Where the link is written, so × can remove it. */
	remove?: Unlink[];
}
interface RelGroup {
	label: string;
	icon: string;
	items: RelItem[];
	/** How + adds to this group. */
	add?: LinkSpec;
}

const DATE_FIELDS: Partial<Record<EntityType, [FieldName, string, FieldName, string]>> = {
	person: ["born", "Born", "died", "Died"],
	event: ["date", "Date", "end", "Ended"],
	culture: ["founded", "Founded", "dissolved", "Dissolved"],
	place: ["founded", "Founded", "dissolved", "Abandoned"],
};

/**
 * The dashboard: every folder and note in a tree, and for the one you pick, its basics (type,
 * dates, kind, size, layer…) to edit in place, all its relationships in both directions with a
 * small graph, its raw properties and problems. Folders get their own settings (what their notes
 * are, which calendar they use) and a sortable table of their notes. Nothing picked: quick
 * settings and what needs attention.
 */
export class ExplorerView extends ChronicleView {
	private state: ExplorerState = { expanded: [], onlyChronicle: true, search: "" };
	private statsEl!: HTMLElement;
	private treeEl!: HTMLElement;
	private tree!: FileTree;
	private mainEl!: HTMLElement;
	private detailEl!: HTMLElement;
	private searchInput?: HTMLInputElement;
	private sortBy: { col: string; dir: 1 | -1 } = { col: "name", dir: 1 };
	private arc?: ArcRenderer;

	getViewType() {
		return VIEW_EXPLORER;
	}
	getDisplayText() {
		return "UniverseView library";
	}
	getIcon() {
		return "panels-top-left";
	}

	getState(): Record<string, unknown> {
		return { explorer: this.state };
	}

	async setState(state: unknown, result: ViewStateResult) {
		const s = state as { explorer?: Partial<ExplorerState>; select?: string; isFolder?: boolean } | undefined;
		if (s?.explorer) this.state = { ...this.state, ...s.explorer };
		if (s?.select) this.select(s.select, !!s.isFolder, false);
		if (this.isBuilt) this.renderAll();
		await super.setState(state, result);
	}

	protected build() {
		this.contentEl.addClass("chronicle-explorer-view");
		this.fillToolbar();
		const root = el("div", { cls: "chronicle-dash" }, this.body);
		this.statsEl = el("div", { cls: "chronicle-dash-stats" }, root);
		const main = (this.mainEl = el("div", { cls: "chronicle-dash-main" }, root));
		this.treeEl = el("div", { cls: "chronicle-dash-tree" }, main);
		const head = el("div", { cls: "chronicle-dash-tree-head" }, this.treeEl);
		this.searchInput = this.searchBox(head, this.state.search, "Find a note or folder…", (v) => {
			this.state.search = v;
			this.tree.render();
			this.save();
		});
		const list = el("div", { cls: "chronicle-dash-list" }, this.treeEl);
		this.tree = new FileTree(this.plugin, list, () => this.state, {
			changed: () => this.save(),
			select: (path, isFolder, evt) => {
				if (this.state.hideDetail && !isFolder) openEntity(this.plugin, path, evt);
				this.select(path, isFolder);
			},
		});
		this.dragTree(el("div", { cls: "chronicle-dash-grip", attr: { role: "separator", "aria-label": "Resize the file tree" } }, main));
		this.detailEl = el("div", { cls: "chronicle-dash-detail" }, main);
		this.applyLayout();
		// Side by side while there's room for both, otherwise one above the other.
		const observer = new ResizeObserver(() => {
			if (main.clientWidth) main.toggleClass("is-stacked", main.clientWidth < 560);
		});
		observer.observe(main);
		this.register(() => observer.disconnect());
		if (this.state.expanded.length === 0) this.state.expanded = this.plugin.index.topFolders();
		this.renderAll();
		// Catch up after edits made while the dashboard was in a background tab.
		this.registerEvent(this.app.workspace.on("active-leaf-change", (leaf) => {
			if (leaf === this.leaf && this.stale) {
				this.stale = false;
				this.renderAll();
			}
		}));
		this.registerEvent(this.app.workspace.on("chronicle:history-changed" as "quit", () => this.syncUndo()));
		this.registerEvent(this.app.workspace.on(TREE_OPTIONS_CHANGED as "quit", () => this.tree.render()));
	}

	private undoBtn?: HTMLElement;

	private applyLayout() {
		this.statsEl.toggle(!this.state.hideStats);
		this.mainEl.toggleClass("is-tree-only", !!this.state.hideDetail);
		const { libraryTree, libraryTreeHeight } = this.plugin.settings;
		if (libraryTree) this.mainEl.setCssProps({ "--uv-tree-w": `${libraryTree}px` });
		if (libraryTreeHeight) this.mainEl.setCssProps({ "--uv-tree-h": `${libraryTreeHeight}px` });
	}

	private saveTreeSize = debounce(() => void this.plugin.saveSettings(), 400, true);

	private dragTree(grip: HTMLElement) {
		grip.addEventListener("pointerdown", (down) => {
			down.preventDefault();
			grip.setPointerCapture(down.pointerId);
			const box = this.mainEl.getBoundingClientRect();
			const stacked = this.mainEl.hasClass("is-stacked");
			const move = (e: PointerEvent) => {
				const s = this.plugin.settings;
				if (stacked) s.libraryTreeHeight = Math.round(Math.max(120, Math.min(box.height - 120, e.clientY - box.top)));
				else s.libraryTree = Math.round(Math.max(200, Math.min(box.width - 240, e.clientX - box.left)));
				this.applyLayout();
				this.saveTreeSize();
			};
			const up = () => {
				grip.removeEventListener("pointermove", move);
				grip.removeEventListener("pointerup", up);
			};
			grip.addEventListener("pointermove", move);
			grip.addEventListener("pointerup", up);
		});
	}

	private toggleLayout(part: "hideStats" | "hideDetail") {
		this.state[part] = !this.state[part];
		this.applyLayout();
		this.fillToolbar();
		this.save();
	}

	private syncUndo() {
		const label = this.plugin.undoLabel;
		if (!this.undoBtn) return;
		this.undoBtn.toggleClass("is-disabled", !label);
		this.undoBtn.setAttribute("aria-label", label ? `Undo: ${label}` : "Nothing to undo");
		this.undoBtn.title = label ? `Undo: ${label} (Ctrl+Alt+Z)` : "Nothing to undo";
	}

	private save() {
		this.app.workspace.requestSaveLayout();
	}

	private renderAll() {
		if (!this.statsEl) return;
		this.renderStats();
		this.tree.render();
		this.renderDetail();
	}

	/** Index rebuilds come in bursts while typing in a note; redraw once they settle, and only if visible. */
	private redraw = debounce(() => {
		if (!this.containerEl.isConnected || this.containerEl.offsetParent === null) {
			this.stale = true;
			return;
		}
		// Never redraw under someone typing (from Born on to Died, say): wait until they leave the field.
		const active = document.activeElement as HTMLElement | null;
		if (active && this.containerEl.contains(active) && active.matches("input, textarea, select, [contenteditable='true']")) {
			if (!this.waitingForBlur) {
				this.waitingForBlur = true;
				active.addEventListener("blur", () => {
					this.waitingForBlur = false;
					// Moving to the next field of the same form: wait for that one too.
					window.setTimeout(() => this.redraw(), 50);
				}, { once: true });
			}
			return;
		}
		this.renderAll();
	}, 250, true);
	private waitingForBlur = false;
	private stale = false;

	protected onIndexChanged() {
		this.redraw();
	}

	// ---- Toolbar: view options and quick appearance settings ------------------------------------

	private fillToolbar() {
		this.rebuildToolbar(() => {
			const left = this.group();
			toggleChip(left, "UniverseView notes only", "filter", this.state.onlyChronicle, (v) => {
				this.state.onlyChronicle = v;
				this.tree.render();
				this.save();
			});
			iconButton(left, "sliders-horizontal", "How the tree looks", (evt) => treeOptionsMenu(this.plugin, evt));
			iconButton(left, "chevrons-down-up", "Collapse all folders", () => this.tree.collapseAll());
			iconButton(left, "chevrons-up-down", "Expand all folders", () => this.tree.expandAll());
			setPressed(iconButton(left, "bar-chart-3", "Show the summary", () => this.toggleLayout("hideStats")), !this.state.hideStats);
			setPressed(iconButton(left, "panel-right", "Show details beside the tree", () => this.toggleLayout("hideDetail")), !this.state.hideDetail);
			iconButton(left, "home", "Library home (problems, recent notes, statistics)", () => {
				this.state.selected = undefined;
				this.tree.render();
				this.renderDetail();
				this.save();
			});
			this.spacer();
			const right = this.group();
			this.undoBtn = iconButton(right, "undo-2", "Undo", () => void this.plugin.undo());
			this.syncUndo();
			iconButton(right, "plus", "New note", () => this.plugin.createEntityPrompt({ scope: this.scopeOfSelection() }), "mod-cta-icon");
		});
	}

	private async setSetting(change: () => void, reindex = false) {
		change();
		await this.plugin.saveSettings();
		if (reindex) this.plugin.index.rebuild();
	}

	private scopeOfSelection(): string | undefined {
		const p = this.state.selected;
		return p?.includes("/") ? p.split("/")[0] : undefined;
	}

	// ---- Stats strip --------------------------------------------------------------------------

	private renderStats() {
		const box = this.statsEl;
		box.empty();
		const idx = this.plugin.index;
		const files = this.app.vault.getMarkdownFiles().length;
		const tile = (iconName: string, label: string, value: number, color: string, onClick?: () => void, active = false) => {
			const t = el("button", { cls: "chronicle-dash-stat" + (active ? " is-active" : "") }, box);
			t.style.setProperty("--stat-color", color);
			const ic = el("span", { cls: "chronicle-dash-stat-icon" }, t);
			icon(ic, iconName);
			const txt = el("span", { cls: "chronicle-dash-stat-text" }, t);
			el("span", { cls: "chronicle-dash-stat-value", text: value.toLocaleString() }, txt);
			// The label carries its own count for plurals ("23 people"); show only the words.
			el("span", { cls: "chronicle-dash-stat-label", text: label.replace(/^[\d,.\s]+/, "") }, txt);
			if (onClick) t.addEventListener("click", onClick);
			else t.disabled = true;
			return t;
		};
		tile("files", "notes in vault", files, "var(--text-muted)", () => this.setTypeFilter(undefined), !this.state.typeFilter);
		for (const t of ENTITY_TYPES) {
			const n = idx.all(t).length;
			if (!n && t === "map") continue;
			tile(TYPE_ICONS[t], plural(TYPE_LABELS[t].toLowerCase(), n), n, typeColorVar(t), () => this.setTypeFilter(this.state.typeFilter === t ? undefined : t), this.state.typeFilter === t);
		}
		const problems = validate(idx).filter((i) => i.severity !== "info").length;
		tile("shield-alert", plural("problem", problems), problems, problems ? "var(--text-error)" : "var(--text-success)", () => {
			this.state.selected = undefined;
			this.renderDetail();
		});
	}

	private setTypeFilter(t: EntityType | undefined) {
		this.state.typeFilter = t;
		this.renderStats();
		this.tree.render();
		this.save();
	}

	/** Picks a note or folder; `reveal` opens the folders above it in the tree. */
	select(path: string, isFolder: boolean, render = true) {
		this.tree.pick(path, isFolder);
		if (!render) return;
		this.tree.render();
		this.renderDetail();
		this.save();
		this.tree.scrollToPicked();
	}

	// ---- Detail pane -------------------------------------------------------------------------------

	private renderDetail() {
		const box = this.detailEl;
		if (!box) return;
		const scroll = box.scrollTop;
		box.empty();
		const sel = this.state.selected;
		if (!sel) this.renderHome(box);
		else if (this.state.isFolder) this.renderFolder(box, sel);
		else this.renderNote(box, sel);
		box.scrollTop = scroll;
	}

	private card(parent: HTMLElement, title: string, iconName: string, cls = ""): HTMLElement {
		const c = el("section", { cls: `chronicle-dash-card ${cls}`.trim() }, parent);
		const h = el("h3", { cls: "chronicle-dash-card-title" }, c);
		const ic = el("span", { cls: "chronicle-dash-card-icon" }, h);
		icon(ic, iconName);
		el("span", { text: title }, h);
		return el("div", { cls: "chronicle-dash-card-body" }, c);
	}

	private renderHome(box: HTMLElement) {
		const head = el("div", { cls: "chronicle-dash-head" }, box);
		el("h2", { cls: "chronicle-dash-title", text: "Library" }, head);
		el("div", { cls: "chronicle-dash-path", text: "Pick a note or folder to see and edit it." }, head);
		const grid = el("div", { cls: "chronicle-dash-grid" }, box);

		// Problems
		const issues = validate(this.plugin.index).filter((i) => i.severity !== "info");
		const pb = this.card(grid, issues.length ? `${plural("problem", issues.length)} to look at` : "No problems found", issues.length ? "shield-alert" : "shield-check");
		if (!issues.length) el("div", { cls: "chronicle-dash-muted", text: "Dates, families and links all check out." }, pb);
		for (const i of issues.slice(0, 12)) {
			const row = el("button", { cls: "chronicle-dash-rel is-" + i.severity }, pb);
			el("span", { cls: "chronicle-dash-rel-name", text: i.name }, row);
			el("span", { cls: "chronicle-dash-rel-note", text: i.message }, row);
			row.addEventListener("click", () => this.select(i.key, false));
		}
		if (issues.length > 12) el("div", { cls: "chronicle-dash-muted", text: `+ ${issues.length - 12} more (command “Check data”)` }, pb);

		// Recent edits
		const recent = this.plugin.index.all().sort((a, b) => b.file.stat.mtime - a.file.stat.mtime).slice(0, 10);
		const rc = this.card(grid, "Recently edited", "history");
		for (const e of recent) this.relRow(rc, { key: e.key, name: e.name, note: TYPE_LABELS[e.type] + (e.category ? ` · ${e.category}` : "") });

		// Saved views
		const p = this.plugin;
		const sv = this.card(grid, "Saved views", "bookmark");
		if (!p.settings.savedViews.length) el("div", { cls: "chronicle-dash-muted", text: "Save any UniverseView view (with its filters, focus and date) with the bookmark button in its toolbar." }, sv);
		for (const v of p.settings.savedViews) {
			const row = el("button", { cls: "chronicle-dash-rel" }, sv);
			const ic = el("span", { cls: "chronicle-dash-rel-icon" }, row);
			icon(ic, "bookmark");
			el("span", { cls: "chronicle-dash-rel-name", text: v.name }, row);
			row.addEventListener("click", () => void p.openSavedView(v.name));
		}

		// How complete, and statistics
		const cp = this.card(grid, "How complete", "gauge");
		renderCompleteness(p, cp, undefined, (e) => this.select(e.key, false));
		const st = this.card(grid, "Statistics", "bar-chart-3", "is-wide");
		renderWorldStats(p, st, undefined, this.hoverHost);
	}

	// ---- A note ---------------------------------------------------------------------------------------

	private renderNote(box: HTMLElement, path: string) {
		const idx = this.plugin.index;
		const e = idx.get(path);
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) {
			this.state.selected = undefined;
			this.renderHome(box);
			return;
		}
		const head = el("div", { cls: "chronicle-dash-head" }, box);
		if (e) head.style.setProperty("--head-color", entityColor(this.plugin, e));
		const title = el("div", { cls: "chronicle-dash-title-row" }, head);
		const ic = el("span", { cls: "chronicle-dash-title-icon" }, title);
		icon(ic, e ? TYPE_ICONS[e.type] : "file-text");
		el("h2", { cls: "chronicle-dash-title", text: file.basename }, title);
		if (e) el("span", { cls: "chronicle-dash-badge", text: TYPE_LABELS[e.type] + (e.category ? ` · ${e.category}` : "") }, title);
		el("div", { cls: "chronicle-dash-path", text: file.path }, head);
		const actions = el("div", { cls: "chronicle-dash-actions" }, head);
		const act = (label: string, iconName: string, run: (evt: MouseEvent) => void, cta = false) => {
			const b = el("button", { cls: cta ? "mod-cta" : "" }, actions);
			const i2 = el("span", { cls: "chronicle-dash-btn-icon" }, b);
			icon(i2, iconName);
			el("span", { text: label }, b);
			b.addEventListener("click", run);
		};
		act("Open note", "file-text", (evt) => openEntity(this.plugin, path, evt), true);
		if (e) {
			const p = this.plugin;
			if (e.start || e.end || e.type === "person" || e.type === "culture") act("Timeline", "calendar-range", () => void p.openTimeline({ focus: e.key }));
			if (e.type === "person") act("Family tree", "git-fork", () => void p.openFamilyTree(e.key));
			if (e.type === "culture") act("Org chart", "network", () => void p.openOrgChart(e.key));
			if (e.type === "culture") act("Lineage", "git-branch", () => void p.openLineage(e.key));
			if (e.type === "place" || e.type === "map" || e.places.length) act("Map", "map", () => void p.openMap(e.key));
			act("Connections", "waypoints", () => void p.openNetwork(e.key));
			if (e.type === "person") act("How related…", "git-compare", () => p.openKinship(e.key));
			if (e.type === "person" || e.type === "culture") act("Succession", "crown", () => p.openSuccession(e.key));
			if (e.type === "person") act("What they know", "eye", () => new KnowledgeModal(p, e.key).open());
		}

		const grid = el("div", { cls: "chronicle-dash-grid is-note" }, box);
		this.basicsCard(grid, file, e);
		// A person's whole life on one line.
		if (e?.type === "person") {
			const arc = this.card(grid, "Life at a glance", "activity", "is-wide");
			this.arc?.destroy();
			this.arc = new ArcRenderer(arc, this.plugin, e.key, this.hoverHost);
		}
		if (e) {
			const groups = this.relationGroups(e);
			const rel = this.card(grid, "Relationships", "share-2", "is-relations");
			this.egoGraph(rel, e, groups);
			const lists = el("div", { cls: "chronicle-dash-rel-groups" }, rel);
			if (!groups.some((g) => g.items.length)) el("div", { cls: "chronicle-dash-muted", text: "No relationships yet. Use the + buttons to link parents, members, places or events." }, lists);
			for (const g of groups) {
				if (!g.items.length && !g.add) continue;
				const gEl = el("div", { cls: "chronicle-dash-rel-group" + (g.items.length ? "" : " is-empty") }, lists);
				const h = el("div", { cls: "chronicle-dash-rel-head" }, gEl);
				const gi = el("span", {}, h);
				icon(gi, g.icon);
				el("span", { text: g.items.length ? `${g.label} (${g.items.length})` : g.label }, h);
				if (g.add) {
					const spec = g.add;
					iconButton(h, "plus", `Add to ${g.label.toLowerCase()}`, () => new AddRelationModal(this.plugin, e, spec).open(), "chronicle-dash-rel-add");
				}
				for (const it of g.items.slice(0, 40)) this.relRow(gEl, it);
				if (g.items.length > 40) el("div", { cls: "chronicle-dash-muted", text: `+ ${g.items.length - 40} more` }, gEl);
			}
			if (e.issues.length) {
				const iss = this.card(grid, "Problems", "alert-triangle", "is-wide");
				for (const m of e.issues) el("div", { cls: "chronicle-dash-problem", text: m }, iss);
			}
		}
		this.propertiesCard(grid, file);
	}

	/** Type, dates and the most useful properties, written to the note as they change. */
	private basicsCard(grid: HTMLElement, file: TFile, e: Entity | undefined) {
		const body = this.card(grid, "Basics", "pencil");
		const fm = (this.app.metadataCache.getFileCache(file)?.frontmatter ?? {}) as Record<string, unknown>;
		const aliases = buildFieldAliases(this.plugin.settings.fieldAliases);
		const keyFor = (field: FieldName) => aliases[field].find((a) => a in fm) ?? aliases[field][0];
		const write = (key: string, value: unknown, label = `Edit ${key}`) =>
			this.plugin.editFrontmatter(file, (f) => {
				if (value === undefined || value === null || value === "") delete f[key];
				else f[key] = value;
			}, label);

		new Setting(body).setName("Type").setDesc(e ? "Written the way this note already marks its type (property, tag or cr_type)." : "Not a UniverseView note yet.").addDropdown((d) => {
			d.addOption("", "Not a UniverseView note");
			for (const t of ENTITY_TYPES) d.addOption(t, TYPE_LABELS[t]);
			d.setValue(e?.type ?? "");
			d.onChange((v) => void this.plugin.editFrontmatter(file, (f) => this.plugin.setTypeMark(f, (v || null) as EntityType | null), "Change type"));
		});
		if (!e) return;

		const dates = DATE_FIELDS[e.type];
		if (dates) {
			const cal = this.plugin.calendars.get(e.calendar);
			const dateRow = (field: FieldName, label: string) => {
				const key = keyFor(field);
				const raw = fm[key];
				const s = new Setting(body).setName(label);
				const preview = s.descEl;
				const show = (v: string) => {
					if (!v.trim()) {
						preview.setText(e.props.lifespan && !raw ? `From lifespan: ${asText(e.props.lifespan)}` : "");
						preview.removeClass("mod-warning");
						return;
					}
					const d = this.plugin.parseDate(v, cal.id);
					preview.setText(d ? `= ${formatSpan(d, undefined, cal)}` : "Couldn't read this date");
					preview.toggleClass("mod-warning", !d);
				};
				s.addText((t) => {
					t.setPlaceholder(cal.id === "gregorian" ? "1485-08-22, May 1485, c. 1480" : `A date in the ${cal.name} calendar`);
					t.setValue(raw === undefined || raw === null ? "" : asText(raw));
					show(t.getValue());
					t.onChange((v) => show(v));
					t.inputEl.addEventListener("change", () => void write(key, t.getValue().trim() || null));
				});
			};
			dateRow(dates[0], dates[1]);
			dateRow(dates[2], dates[3]);
		}

		if (e.type === "place") {
			placeStyleFields(body, this.plugin, e);
			const pop = totalPopulation(this.plugin.index, e.key);
			new Setting(body).setName("Population").setDesc(e.population === undefined && pop ? `${pop.total.toLocaleString()} from the ${pop.counted} places inside it` : "Regions add up the places inside them when left blank.").addText((t) => {
				t.setValue(e.population !== undefined ? String(e.population) : "");
				t.inputEl.addEventListener("change", () => {
					const n = Number(t.getValue().replace(/[,\s_]/g, ""));
					void write("population", t.getValue().trim() && Number.isFinite(n) ? n : null, "Change population");
				});
			});
			const d = kindDefaults(this.plugin, e.category);
			el("div", { cls: "chronicle-dash-muted", text: `Shown on the map as ${e.pinSize ?? d.size ?? "event-sized"} pins, layer ${e.layer ?? d.layer} (${LAYER_NAMES[(e.layer ?? d.layer) - 1].toLowerCase()}).` }, body);
		} else {
			new Setting(body).setName("Kind").setDesc(kindHint(e.type)).addText((t) => {
				t.setValue(e.category ?? "");
				t.inputEl.addEventListener("change", () =>
					void this.plugin.editFrontmatter(file, (f) => this.plugin.setKindMark(f, e.category, t.getValue().trim().toLowerCase() || null), "Change kind"));
			});
		}
		new Setting(body).setName("Importance").setDesc("1–5: bigger on timelines and in lists.").addSlider((sl) =>
			sl.setLimits(1, 5, 1).setValue(e.importance).onChange((v) => void write(keyFor("importance"), v)),
		);
		new Setting(body).setName("Color").addColorPicker((c) => {
			c.setValue(toHex(e.color) ?? "#888888");
			c.onChange((v) => void write(keyFor("color"), v));
		}).addExtraButton((b) => b.setIcon("rotate-ccw").setTooltip("Automatic color").onClick(() => void write(keyFor("color"), null)));
		new Setting(body).setName("Icon").setDesc("A Lucide icon name or an emoji, for map pins and cards.").addText((t) => {
			t.setValue(typeof fm.icon === "string" ? fm.icon : "");
			t.inputEl.addEventListener("change", () => void write("icon", t.getValue().trim() || null));
		});
		new Setting(body).setName("Summary").addTextArea((t) => {
			t.setValue(e.summary ?? "");
			t.inputEl.rows = 2;
			t.inputEl.addEventListener("change", () => void write(keyFor("summary"), t.getValue().trim() || null));
		});
	}

	private propertiesCard(grid: HTMLElement, file: TFile) {
		const fm = (this.app.metadataCache.getFileCache(file)?.frontmatter ?? {}) as Record<string, unknown>;
		const keys = Object.keys(fm).filter((k) => k !== "position" || Array.isArray(fm[k]));
		const body = this.card(grid, `All properties (${keys.length})`, "list", "is-wide");
		if (!keys.length) {
			el("div", { cls: "chronicle-dash-muted", text: "This note has no properties." }, body);
			return;
		}
		const table = el("div", { cls: "chronicle-dash-props" }, body);
		for (const k of keys) {
			el("div", { cls: "chronicle-dash-prop-key", text: k }, table);
			const v = fm[k];
			el("div", { cls: "chronicle-dash-prop-value", text: typeof v === "object" ? JSON.stringify(v) : asText(v) }, table);
		}
	}

	private relRow(parent: HTMLElement, it: RelItem) {
		const e = this.plugin.index.get(it.key);
		const row = el("button", { cls: "chronicle-dash-rel" + (e ? "" : " is-missing") }, parent);
		if (e) row.style.setProperty("--row-color", entityColor(this.plugin, e));
		const ic = el("span", { cls: "chronicle-dash-rel-icon" }, row);
		icon(ic, e ? TYPE_ICONS[e.type] : "file-plus");
		el("span", { cls: "chronicle-dash-rel-name", text: it.name }, row);
		if (it.note) el("span", { cls: "chronicle-dash-rel-note", text: it.note }, row);
		if (it.remove?.length) {
			const x = el("span", { cls: "chronicle-dash-rel-remove clickable-icon", attr: { "aria-label": `Remove ${it.name}`, title: "Remove this relationship (Undo puts it back)" } }, row);
			icon(x, "x");
			x.addEventListener("click", (evt) => {
				evt.stopPropagation();
				void (async () => {
					let any = false;
					await this.plugin.undoGroup(`Unlink ${it.name}`, async () => {
						for (const u of it.remove!) any = (await removeLink(this.plugin, u)) || any;
					});
					new Notice(any ? `Removed ${it.name}` : `Couldn't find the link to ${it.name} in the properties (it may be written in the note's text).`);
				})();
			});
		}
		row.addEventListener("click", (evt) => {
			if (!e && !this.app.vault.getAbstractFileByPath(it.key)) this.plugin.createEntityPrompt({ name: it.name });
			else if (Keymap.isModEvent(evt)) openEntity(this.plugin, it.key, evt);
			else this.select(it.key, false);
		});
		row.addEventListener("contextmenu", (evt) => {
			evt.preventDefault();
			showEntityMenu(this.plugin, it.key, evt);
		});
		if (e) this.plugin.hoverCards?.attach(row, e.key);
	}

	private backlinkCache?: { version: number; map: Map<string, string[]> };

	/** Who links to whom, built once per index rebuild instead of once per note shown. */
	private backlinks(resolved: Record<string, Record<string, number>>): Map<string, string[]> {
		const version = this.plugin.index.version;
		if (this.backlinkCache?.version === version) return this.backlinkCache.map;
		const map = new Map<string, string[]>();
		for (const [from, targets] of Object.entries(resolved)) {
			for (const to of Object.keys(targets)) {
				const list = map.get(to);
				if (list) list.push(from);
				else map.set(to, [from]);
			}
		}
		this.backlinkCache = { version, map };
		return map;
	}

	/** Everything a note is connected to, in both directions, grouped by kind of relationship. */
	relationGroups(e: Entity, withTextLinks = true): RelGroup[] {
		const idx = this.plugin.index;
		const cal = this.plugin.calendars.get(e.calendar);
		const span = (from?: ChronDate, to?: ChronDate) =>
			from && to ? formatSpan(from, to, cal) : from ? `from ${formatSpan(from, undefined, cal)}` : to ? `until ${formatSpan(to, undefined, cal)}` : "";
		const join = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(" · ") || undefined;
		const nameOf = (key: string, name?: string) => idx.get(key)?.name ?? name ?? key.replace(/^\?/, "").split("/").pop()!.replace(/\.md$/, "");
		// `self`: the link is written on this note (remove it here); `other`: on the linked note (remove it there).
		const ref = (key: string, name?: string, note?: string, removable?: { self?: FieldName[]; other?: FieldName[]; kind?: string }): RelItem => {
			const n = nameOf(key, name);
			// A relation written on the other note is stored there as the inverse kind (their "vassals" is our "liege").
			const kind = removable?.kind;
			const remove: Unlink[] = [
				...(removable?.self ?? []).map((field) => ({ path: e.path, field, name: n, kind })),
				...(removable?.other ?? []).filter(() => idx.get(key)).map((field) => ({ path: key, field, name: e.name, kind: kind === undefined ? undefined : relInverse(kind) ?? "" })),
			];
			return { key, name: n, note, remove: remove.length ? remove : undefined };
		};
		const keys = (list: Iterable<string>, note?: (k: string) => string | undefined, removable?: { self?: FieldName[]; other?: FieldName[] }) =>
			[...list].map((k) => ref(k, undefined, note?.(k), removable));
		const groups: RelGroup[] = [];
		const add = (label: string, iconName: string, items: RelItem[], spec?: Omit<LinkSpec, "label">) =>
			groups.push({ label, icon: iconName, items, add: spec ? { ...spec, label } : undefined });

		switch (e.type) {
			case "person":
				add("Parents", "users", [
					...e.parents.map((p) => ref(p.key, p.name, undefined, { self: ["parents"], other: ["children"] })),
					...e.adoptiveParents.map((p) => ref(p.key, p.name, "adoptive", { self: ["adoptiveParents"] })),
				], { field: "parents", on: "self", types: ["person"] });
				add("Partners", "heart", idx.partners(e.key).map((p) => ref(p.ref.key, p.ref.name, join(p.kind, span(p.from, p.to)), { self: ["partners"], other: ["partners"] })),
					{ field: "partners", on: "self", types: ["person"], dates: true, objKey: "person" });
				add("Children", "baby", keys(idx.children(e.key), (k) => formatSpan(idx.get(k)?.start, idx.get(k)?.end, cal), { self: ["children"], other: ["parents", "adoptiveParents"] }),
					{ field: "parents", on: "other", types: ["person"] });
				add("Siblings", "users-round", keys(idx.siblings(e.key)));
				add("Member of", "flag", e.cultures.map((c) => ref(c.ref.key, c.ref.name, join(c.role, span(c.from, c.to)), { self: ["cultures"] })),
					{ field: "cultures", on: "self", types: ["culture"], ask: "role", dates: true, objKey: "culture" });
				break;
			case "culture":
				add("Part of / descends from", "arrow-up-right", [
					...e.parentCultures.map((p) => ref(p.key, p.name, undefined, { self: ["parentCultures"], other: ["childCultures"] })),
					...e.cultures.map((c) => ref(c.ref.key, c.ref.name, join(c.role, span(c.from, c.to)), { self: ["cultures"] })),
				], { field: "parentCultures", on: "self", types: ["culture"] });
				add("Sub-organisations", "network", subOrgs(this.plugin, e.key).map((c) => ref(c.key, undefined, undefined, { self: ["childCultures"], other: ["parentCultures", "cultures"] })),
					{ field: "parentCultures", on: "other", types: ["culture"] });
				add("Members", "users", idx.members(e.key).filter((m) => idx.get(m.key)?.type === "person").map((m) => ref(m.key, undefined, join(m.link.role, span(m.link.from, m.link.to)), { other: ["cultures"] })),
					{ field: "cultures", on: "other", types: ["person"], ask: "role", dates: true, objKey: "culture" });
				add("Holds", "map-pin", idx.members(e.key).filter((m) => idx.get(m.key)?.type === "place").map((m) => ref(m.key, undefined, span(m.link.from, m.link.to), { other: ["cultures"] })),
					{ field: "cultures", on: "other", types: ["place"], dates: true, objKey: "culture" });
				add("Related groups", "link", e.relatedCultures.map((r) => ref(r.ref.key, r.ref.name, join(r.kind, span(r.from, r.to)), { self: ["relatedCultures"] })),
					{ field: "relatedCultures", on: "self", types: ["culture"], ask: "kind", dates: true, objKey: "culture" });
				break;
			case "place": {
				const chain: RelItem[] = [];
				for (let cur = e.locatedIn, i = 0; cur && i < 12; cur = idx.get(cur.key)?.locatedIn, i++) chain.push(ref(cur.key, cur.name, i ? "further up" : undefined, i ? undefined : { self: ["locatedIn"] }));
				add("Located in", "arrow-up-right", chain, { field: "locatedIn", on: "self", types: ["place"], single: true });
				add("Contains", "layers", keys(idx.subPlacesOf.get(e.key) ?? [], (k) => idx.get(k)?.category, { other: ["locatedIn"] }),
					{ field: "locatedIn", on: "other", types: ["place"], single: true });
				add("Held by", "flag", e.cultures.map((c) => ref(c.ref.key, c.ref.name, span(c.from, c.to), { self: ["cultures"] })),
					{ field: "cultures", on: "self", types: ["culture"], dates: true, objKey: "culture" });
				if (e.map) add("On map", "map", [ref(e.map.key, e.map.name)]);
				const born = idx.all("person").filter((p) => p.birthPlace?.key === e.key || p.deathPlace?.key === e.key);
				add("People born or died here", "user-round", born.map((p) => ref(p.key, undefined, p.birthPlace?.key === e.key ? "born here" : "died here", { other: [p.birthPlace?.key === e.key ? "birthPlace" : "deathPlace"] })));
				break;
			}
			case "event":
				add("Participants", "users", e.participants.map((p) => ref(p.key, p.name, undefined, { self: ["participants"] })), { field: "participants", on: "self", types: ["person"] });
				add("Places", "map-pin", e.places.map((p) => ref(p.key, p.name, undefined, { self: ["places"] })), { field: "places", on: "self", types: ["place"] });
				add("Sides & groups", "flag", e.cultures.map((c) => ref(c.ref.key, c.ref.name, c.role ?? c.kind, { self: ["cultures"] })),
					{ field: "cultures", on: "self", types: ["culture"], ask: "role", objKey: "culture" });
				break;
			case "map":
				add("Places on this map", "map-pin", keys(idx.placesOnMap.get(e.key) ?? [], (k) => idx.get(k)?.category));
				break;
		}
		add("Relations", "link-2", (idx.relationsOf.get(e.key) ?? []).map((r) => ref(r.ref.key, r.ref.name, join(r.kind, span(r.from, r.to)), { self: ["relations"], other: ["relations"], kind: r.kind ?? "" })),
			e.type === "map" ? undefined : { field: "relations", on: "self", types: ["person", "culture", "place", "event"], ask: "kind", dates: true, objKey: "person" });
		// Secrets: what this person or group knows, and who knows about this note.
		if (e.type === "person" || e.type === "culture") {
			add("Knows about", "eye", (idx.knowledgeOf.get(e.key) ?? []).map((k) => ref(k.ref.key, k.ref.name, k.from ? `since ${formatDate(k.from, cal)}` : undefined, { self: ["knows"], other: ["knownBy"] })),
				{ field: "knows", on: "self", types: ["event", "person", "culture", "place"], dates: true, objKey: "secret" });
		}
		if (e.type !== "map") {
			const knownTo = [...idx.knowledgeOf.entries()].flatMap(([who, list]) => list.filter((k) => k.ref.key === e.key).map((k) => ({ who, k })));
			if (knownTo.length || e.type === "event") {
				add("Known to", "eye", knownTo.map(({ who, k }) => ref(who, undefined, k.from ? `since ${formatDate(k.from, cal)}` : undefined, { self: ["knownBy"], other: ["knows"] })),
					{ field: "knows", on: "other", types: ["person", "culture"], dates: true, objKey: "secret" });
			}
		}
		const eventField: FieldName | undefined = e.type === "person" ? "participants" : e.type === "place" ? "places" : e.type === "culture" ? "cultures" : undefined;
		if (e.type !== "event") add("Events", "calendar-clock",
			idx.events(e.key).sort((a, b) => (a.start?.start ?? 0) - (b.start?.start ?? 0)).map((ev) => ref(ev.key, undefined, formatSpan(ev.start, ev.end, this.plugin.calendars.get(ev.calendar)), eventField ? { other: [eventField] } : undefined)),
			eventField ? { field: eventField, on: "other", types: ["event"] } : undefined);

		if (!withTextLinks) return groups;
		// Plain links in the text, both ways, that aren't one of the above.
		const listed = new Set(groups.flatMap((g) => g.items.map((i) => i.key)));
		const resolved = (this.app.metadataCache as unknown as { resolvedLinks?: Record<string, Record<string, number>> }).resolvedLinks ?? {};
		const out = Object.keys(resolved[e.path] ?? {}).filter((k) => k.endsWith(".md") && k !== e.path && !listed.has(k));
		const back = (this.backlinks(resolved).get(e.path) ?? []).filter((from) => from !== e.path && !listed.has(from));
		add("Links in this note", "arrow-right", out.map((k) => ref(k, k.split("/").pop()!.replace(/\.md$/, ""))));
		add("Linked from", "arrow-left", back.map((k) => ref(k, k.split("/").pop()!.replace(/\.md$/, ""))));
		return groups;
	}

	/** The note in the middle with everything it's connected to around it. */
	private egoGraph(parent: HTMLElement, e: Entity, groups: RelGroup[]) {
		const seen = new Set<string>();
		const nodes: { it: RelItem; group: string }[] = [];
		for (const g of groups) {
			if (g.label.startsWith("Links") || g.label === "Linked from") continue;
			for (const it of g.items) {
				if (seen.has(it.key) || it.key === e.key) continue;
				seen.add(it.key);
				nodes.push({ it, group: g.label });
			}
		}
		if (!nodes.length) return;
		const shown = nodes.slice(0, 28);
		const W = 640;
		const H = shown.length > 14 ? 300 : 230;
		const s = svg("svg", { class: "chronicle-dash-ego", viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "xMidYMid meet" }, parent);
		const cx = W / 2;
		const cy = H / 2;
		const rx = W / 2 - 90;
		const ry = H / 2 - 28;
		const lines = svg("g", {}, s);
		shown.forEach((n, i) => {
			const a = (i / shown.length) * Math.PI * 2 - Math.PI / 2;
			const x = cx + Math.cos(a) * rx;
			const y = cy + Math.sin(a) * ry;
			const other = this.plugin.index.get(n.it.key);
			const color = other ? entityColor(this.plugin, other) : "var(--text-faint)";
			const l = svg("line", { x1: cx, y1: cy, x2: x, y2: y, class: "chronicle-dash-ego-line" }, lines);
			l.setAttribute("style", `--line-color: ${color}`);
			const g = svg("g", { class: "chronicle-dash-ego-node" + (other ? "" : " is-missing"), transform: `translate(${x},${y})` }, s);
			g.setAttribute("style", `--node-color: ${color}; --i: ${i}`);
			svg("circle", { r: 7 }, g);
			const t = svg("text", { x: Math.cos(a) >= 0 ? 11 : -11, y: 4, "text-anchor": Math.cos(a) >= 0 ? "start" : "end" }, g);
			t.textContent = n.it.name.length > 18 ? n.it.name.slice(0, 17) + "…" : n.it.name;
			const tt = svg("title", {}, g);
			tt.textContent = `${n.it.name}\n${n.group}${n.it.note ? ` · ${n.it.note}` : ""}`;
			g.addEventListener("click", (evt) => {
				if (Keymap.isModEvent(evt)) openEntity(this.plugin, n.it.key, evt);
				else if (other) this.select(n.it.key, false);
			});
			if (other) this.plugin.hoverCards?.attach(g, other.key);
		});
		const c = svg("g", { class: "chronicle-dash-ego-center", transform: `translate(${cx},${cy})` }, s);
		c.setAttribute("style", `--node-color: ${entityColor(this.plugin, e)}`);
		svg("circle", { r: 13 }, c);
		const t = svg("text", { y: 30, "text-anchor": "middle" }, c);
		t.textContent = e.name;
		if (nodes.length > shown.length) {
			const more = svg("text", { x: W - 8, y: H - 8, "text-anchor": "end", class: "chronicle-dash-ego-more" }, s);
			more.textContent = `+ ${nodes.length - shown.length} more below`;
		}
	}

	// ---- A folder -----------------------------------------------------------------------------------

	private renderFolder(box: HTMLElement, path: string) {
		const idx = this.plugin.index;
		const s = this.plugin.settings;
		const files = this.app.vault.getMarkdownFiles().filter((f) => f.path.startsWith(path + "/"));
		const entities = files.map((f) => idx.get(f.path)).filter((e): e is Entity => !!e);
		const head = el("div", { cls: "chronicle-dash-head" }, box);
		const title = el("div", { cls: "chronicle-dash-title-row" }, head);
		const ic = el("span", { cls: "chronicle-dash-title-icon" }, title);
		icon(ic, "folder-open");
		el("h2", { cls: "chronicle-dash-title", text: path.split("/").pop() ?? path }, title);
		el("span", { cls: "chronicle-dash-badge", text: `${plural("note", files.length)} · ${entities.length} in UniverseView` }, title);
		el("div", { cls: "chronicle-dash-path", text: path }, head);
		const actions = el("div", { cls: "chronicle-dash-actions" }, head);
		for (const [view, label, iconName, state] of folderViews(path)) {
			const b = el("button", {}, actions);
			const i2 = el("span", { cls: "chronicle-dash-btn-icon" }, b);
			icon(i2, iconName);
			el("span", { text: label.replace(/ (of|in) this folder$/, "") }, b);
			b.addEventListener("click", () => void this.plugin.activateView(view, state));
		}

		const grid = el("div", { cls: "chronicle-dash-grid" }, box);
		const fs = this.card(grid, "Folder settings", "folder-cog");
		const typeLine = findMapping(s.folderTypes, path);
		new Setting(fs).setName("Notes in this folder are").setDesc("For notes without their own type property or tag.").addDropdown((d) => {
			d.addOption("", "Decided by each note");
			for (const t of ENTITY_TYPES) d.addOption(t, plural(TYPE_LABELS[t].toLowerCase(), 2));
			d.setValue(typeLine ?? "");
			d.onChange((v) => void this.setSetting(() => (s.folderTypes = setMapping(s.folderTypes, path, v || null)), true));
		});
		const calLine = findMapping(s.folderCalendars, path);
		new Setting(fs).setName("Calendar").setDesc("How dates in these notes are read.").addDropdown((d) => {
			d.addOption("", `Default (${this.plugin.calendars.get(s.defaultCalendar).name})`);
			for (const c of this.plugin.calendars.all()) d.addOption(c.id, c.name);
			d.setValue(calLine ?? "");
			d.onChange((v) => void this.setSetting(() => (s.folderCalendars = setMapping(s.folderCalendars, path, v || null)), true));
		});
		const ignored = s.ignoreFolders.split(/[\n,]/).map((f) => f.trim().replace(/^\/|\/$/g, "")).filter(Boolean);
		new Setting(fs).setName("Leave this folder out").setDesc("UniverseView ignores its notes (like a templates folder).").addToggle((t) =>
			t.setValue(ignored.includes(path)).onChange((v) =>
				void this.setSetting(() => {
					const next = ignored.filter((f) => f !== path);
					if (v) next.push(path);
					s.ignoreFolders = next.join("\n");
				}, true),
			),
		);
		const counts = this.card(grid, "What's in it", "pie-chart");
		const bar = el("div", { cls: "chronicle-dash-bar" }, counts);
		for (const t of ENTITY_TYPES) {
			const n = entities.filter((e) => e.type === t).length;
			if (!n) continue;
			const seg = el("span", { cls: "chronicle-dash-bar-seg", attr: { title: plural(TYPE_LABELS[t].toLowerCase(), n) } }, bar);
			seg.style.setProperty("--seg-color", typeColorVar(t));
			seg.style.flexGrow = String(n);
			const lg = el("div", { cls: "chronicle-dash-legend-row" }, counts);
			const dot = el("span", { cls: "chronicle-dash-count" }, lg);
			dot.style.setProperty("--dot-color", typeColorVar(t));
			el("span", { text: `${plural(TYPE_LABELS[t].toLowerCase(), n)}` }, lg);
		}
		const other = files.length - entities.length;
		if (other) el("div", { cls: "chronicle-dash-muted", text: `${plural("other note", other)} (not people, places, events, cultures or maps)` }, counts);

		// Sortable table of the folder's notes.
		const tb = this.card(grid, "Notes", "table", "is-wide");
		const cal = this.plugin.calendars.get(idx.dominantCalendar(path.split("/")[0]));
		const linkCounts = new Map<string, number>();
		const links = (e: Entity) => {
			let n = linkCounts.get(e.key);
			if (n === undefined) linkCounts.set(e.key, (n = this.relationGroups(e, false).reduce((s2, g) => s2 + g.items.length, 0)));
			return n;
		};
		const cols: [string, string, (e: Entity) => string | number][] = [
			["name", "Name", (e) => e.name],
			["type", "Type", (e) => TYPE_LABELS[e.type]],
			["kind", "Kind", (e) => e.category ?? ""],
			["dates", "Dates", (e) => e.start?.start ?? e.end?.start ?? Infinity],
			["links", "Relationships", links],
			["issues", "Problems", (e) => e.issues.length],
		];
		// Tick rows to change several notes at once.
		const selected = new Set<string>();
		const bulk = el("div", { cls: "chronicle-dash-bulk" }, tb);
		const table = el("table", { cls: "chronicle-dash-table" }, tb);
		const thead = el("tr", {}, el("thead", {}, table));
		const tbody = el("tbody", {}, table);
		const drawBulk = () => {
			bulk.empty();
			bulk.toggleClass("is-active", selected.size > 0);
			if (!selected.size) {
				el("span", { cls: "chronicle-dash-muted", text: "Tick notes to change several at once." }, bulk);
				return;
			}
			el("strong", { text: `${selected.size} selected` }, bulk);
			const notes = () => [...selected].map((k) => idx.get(k)).filter((x): x is Entity => !!x);
			const run = (label: string, fn: (front: Record<string, unknown>, e: Entity) => void) =>
				void this.plugin.undoGroup(`${label} (${selected.size} notes)`, async () => {
					for (const e of notes()) await this.plugin.editFrontmatter(e.file, (f) => fn(f, e));
				}).then(() => new Notice(`${label}: ${selected.size} notes. Undo puts them back.`));
			const pick = (placeholder: string, options: [string, string][], apply: (v: string) => void) => {
				const s = el("select", { cls: "dropdown" }, bulk);
				s.add(new Option(placeholder, ""));
				for (const [v, t] of options) s.add(new Option(t, v));
				s.addEventListener("change", () => {
					if (s.value) apply(s.value === "__none" ? "" : s.value);
					s.value = "";
				});
			};
			pick("Set type…", ENTITY_TYPES.map((t) => [t, TYPE_LABELS[t]] as [string, string]), (v) => run(`Set type to ${v}`, (f) => this.plugin.setTypeMark(f, v as EntityType)));
			pick("Set kind…", [...placeKinds(this.plugin).map((k) => [k, k] as [string, string]), ["__other", "Other…"], ["__none", "No kind"]], (v) => {
				const apply = (kind: string) => run(kind ? `Set kind to ${kind}` : "Clear kind", (f, e) => this.plugin.setKindMark(f, e.category, kind || null));
				if (v === "__other") new TextPrompt(this.plugin, "Kind", "", (k) => apply(k.toLowerCase())).open();
				else apply(v);
			});
			pick("Set map layer…", [...LAYER_NAMES.map((n, i) => [String(i + 1), `${i + 1}: ${n}`] as [string, string]), ["__none", "Automatic"]], (v) =>
				run(v ? `Set layer ${v}` : "Clear layer", (f) => (v ? (f.layer = Number(v)) : delete f.layer)));
			pick("Set pin size…", [...PIN_SIZES.map((s) => [s, s] as [string, string]), ["__none", "Automatic"]], (v) =>
				run(v ? `Set pin size ${v}` : "Clear pin size", (f) => (v ? (f["pin-size"] = v) : delete f["pin-size"])));
			pick("Set calendar…", this.plugin.calendars.all().map((c) => [c.id, c.name] as [string, string]), (v) => run(`Set calendar ${v}`, (f) => (f.calendar = v)));
			const tag = el("button", { text: "Add tag…" }, bulk);
			tag.addEventListener("click", () => new TextPrompt(this.plugin, "Tag to add", "", (raw) => {
				const t = raw.replace(/^#/, "").trim();
				run(`Add #${t}`, (f) => {
					const tags = ([] as unknown[]).concat(f.tags ?? []).map(String);
					if (!tags.includes(t)) f.tags = [...tags, t];
				});
			}).open());
			const clear = el("button", { cls: "mod-muted", text: "Clear selection" }, bulk);
			clear.addEventListener("click", () => {
				selected.clear();
				draw();
			});
		};
		const draw = () => {
			thead.empty();
			tbody.empty();
			drawBulk();
			const allBox = el("input", { attr: { type: "checkbox", "aria-label": "Select all" } }, el("th", { cls: "is-check" }, thead));
			allBox.checked = entities.length > 0 && selected.size === entities.length;
			allBox.addEventListener("change", () => {
				if (allBox.checked) entities.forEach((e) => selected.add(e.key));
				else selected.clear();
				draw();
			});
			for (const [id, label] of cols) {
				const th = el("th", { text: label + (this.sortBy.col === id ? (this.sortBy.dir > 0 ? " ▲" : " ▼") : "") }, thead);
				th.addEventListener("click", () => {
					this.sortBy = { col: id, dir: this.sortBy.col === id ? (-this.sortBy.dir as 1 | -1) : 1 };
					draw();
				});
			}
			const get = cols.find((c) => c[0] === this.sortBy.col)![2];
			const rows = entities.map((e) => ({ e, v: get(e) })).sort((a, b) => (a.v < b.v ? -1 : a.v > b.v ? 1 : a.e.name.localeCompare(b.e.name)) * this.sortBy.dir);
			for (const { e } of rows.slice(0, 500)) {
				const tr = el("tr", { cls: selected.has(e.key) ? "is-selected" : "" }, tbody);
				tr.style.setProperty("--row-color", entityColor(this.plugin, e));
				const checkTd = el("td", { cls: "is-check" }, tr);
				const box = el("input", { attr: { type: "checkbox", "aria-label": `Select ${e.name}` } }, checkTd);
				box.checked = selected.has(e.key);
				checkTd.addEventListener("click", (evt) => evt.stopPropagation());
				box.addEventListener("change", () => {
					if (box.checked) selected.add(e.key);
					else selected.delete(e.key);
					tr.toggleClass("is-selected", box.checked);
					allBox.checked = selected.size === entities.length;
					drawBulk();
				});
				const nameTd = el("td", { cls: "is-name" }, tr);
				const ic2 = el("span", { cls: "chronicle-dash-rel-icon" }, nameTd);
				icon(ic2, TYPE_ICONS[e.type]);
				el("span", { text: e.name }, nameTd);
				el("td", { text: TYPE_LABELS[e.type] }, tr);
				el("td", { text: e.category ?? "" }, tr);
				el("td", { text: formatSpan(e.start, e.end, this.plugin.calendars.get(e.calendar) ?? cal) }, tr);
				el("td", { text: String(links(e)), cls: "is-num" }, tr);
				el("td", { text: e.issues.length ? String(e.issues.length) : "", cls: "is-num" + (e.issues.length ? " is-warning" : ""), attr: { title: e.issues.join("\n") } }, tr);
				tr.addEventListener("click", (evt) => (Keymap.isModEvent(evt) ? openEntity(this.plugin, e.key, evt) : this.select(e.key, false)));
				tr.addEventListener("contextmenu", (evt) => {
					evt.preventDefault();
					showEntityMenu(this.plugin, e.key, evt);
				});
			}
			if (rows.length > 500) el("td", { text: `+ ${rows.length - 500} more`, attr: { colspan: "7" } }, el("tr", {}, tbody));
		};
		draw();
	}
}

function kindHint(t: EntityType): string {
	return { person: "Knight, merchant, deity…", event: "Battle, treaty, birth…", culture: "Kingdom, house, guild, faith…", place: "", map: "World, region, city plan…" }[t];
}

function toHex(c?: string): string | undefined {
	return c && /^#[0-9a-f]{6}$/i.test(c) ? c : c && /^#[0-9a-f]{3}$/i.test(c) ? "#" + [...c.slice(1)].map((x) => x + x).join("") : undefined;
}

