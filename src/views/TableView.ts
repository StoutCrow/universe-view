import { Notice, TFile, type ViewStateResult } from "obsidian";
import type { Entity, EntityType } from "../types";
import { buildFieldAliases, type FieldName } from "../settings";
import { dropdown, el, entityColor, icon, iconButton, openEntity, showEntityMenu, TYPE_LABELS } from "../render/common";
import { TextPrompt } from "../ui/TextPrompt";
import { ChronicleView } from "./base";

export const VIEW_TABLE = "chronicle-table";

type CellKind = "text" | "date" | "links" | "link" | "number";

/** A column: which property it shows and how it's edited. `field` is a UniverseView field (any of its spellings) or a plain property name. */
interface Column {
	id: string;
	label: string;
	kind: CellKind;
	field?: FieldName;
	prop?: string;
	/** Property names to look for besides the field's (kind: kind, category…). */
	also?: string[];
	width?: number;
}

const COLUMNS: Record<Exclude<EntityType, never>, Column[]> = {
	person: [
		{ id: "born", label: "Born", kind: "date", field: "born" },
		{ id: "died", label: "Died", kind: "date", field: "died" },
		{ id: "gender", label: "Gender", kind: "text", field: "gender", width: 90 },
		{ id: "cultures", label: "Groups", kind: "links", field: "cultures" },
		{ id: "parents", label: "Parents", kind: "links", field: "parents" },
		{ id: "partners", label: "Partners", kind: "links", field: "partners" },
		{ id: "kind", label: "Kind", kind: "text", prop: "kind", also: ["category", "role"], width: 110 },
		{ id: "summary", label: "Summary", kind: "text", field: "summary", width: 260 },
	],
	place: [
		{ id: "kind", label: "Kind", kind: "text", prop: "kind", also: ["category"], width: 110 },
		{ id: "locatedIn", label: "Located in", kind: "link", field: "locatedIn" },
		{ id: "cultures", label: "Held by", kind: "links", field: "cultures" },
		{ id: "population", label: "Population", kind: "number", prop: "population", width: 100 },
		{ id: "map", label: "Map", kind: "link", field: "map" },
		{ id: "founded", label: "Founded", kind: "date", field: "founded" },
		{ id: "summary", label: "Summary", kind: "text", field: "summary", width: 260 },
	],
	event: [
		{ id: "date", label: "Date", kind: "date", field: "date" },
		{ id: "end", label: "End", kind: "date", field: "end" },
		{ id: "kind", label: "Kind", kind: "text", prop: "kind", also: ["category"], width: 110 },
		{ id: "places", label: "Places", kind: "links", field: "places" },
		{ id: "participants", label: "People", kind: "links", field: "participants" },
		{ id: "cultures", label: "Groups", kind: "links", field: "cultures" },
		{ id: "importance", label: "Importance", kind: "number", field: "importance", width: 90 },
		{ id: "summary", label: "Summary", kind: "text", field: "summary", width: 260 },
	],
	culture: [
		{ id: "founded", label: "Founded", kind: "date", field: "founded" },
		{ id: "dissolved", label: "Dissolved", kind: "date", field: "dissolved" },
		{ id: "kind", label: "Kind", kind: "text", prop: "kind", also: ["category"], width: 110 },
		{ id: "parentCultures", label: "Part of", kind: "links", field: "parentCultures" },
		{ id: "leader", label: "Leader", kind: "links", prop: "leader", also: ["ruler", "head"] },
		{ id: "allies", label: "Allies", kind: "links", prop: "allies" },
		{ id: "enemies", label: "Enemies", kind: "links", prop: "enemies" },
		{ id: "color", label: "Colour", kind: "text", field: "color", width: 90 },
		{ id: "summary", label: "Summary", kind: "text", field: "summary", width: 260 },
	],
	map: [
		{ id: "image", label: "Image", kind: "link", field: "image" },
		{ id: "scale", label: "Scale", kind: "text", prop: "scale" },
		{ id: "summary", label: "Summary", kind: "text", field: "summary", width: 260 },
	],
};

interface TableState {
	type: EntityType;
	folder?: string;
	search?: string;
	sort?: { col: string; desc: boolean };
	/** Extra property columns added by name. */
	extra: string[];
}

const unlink = (v: unknown): string => {
	if (v === null || v === undefined) return "";
	if (Array.isArray(v)) return v.map(unlink).filter(Boolean).join(", ");
	if (typeof v === "object") {
		const o = v as Record<string, unknown>;
		const inner = Object.values(o).find((x) => typeof x === "string" && /\[\[/.test(x));
		return unlink(inner ?? o.name ?? o.link ?? "");
	}
	return String(v).replace(/\[\[([^\]|]+)(\|[^\]]*)?\]\]/g, "$1");
};

/**
 * A spreadsheet of one kind of note: click a cell to change it. Dates are checked as you type, lists
 * of links are written as comma-separated names, and each value goes into the property the note
 * already uses for it. Sort by any column, filter, and add columns for any other property.
 */
export class TableView extends ChronicleView {
	private state: TableState = { type: "person", extra: [] };
	private tableEl?: HTMLElement;

	getViewType() {
		return VIEW_TABLE;
	}
	getDisplayText() {
		return `Table: ${TYPE_LABELS[this.state.type] ?? this.state.type}`;
	}
	getIcon() {
		return "table";
	}
	getState(): Record<string, unknown> {
		return { table: this.state };
	}
	async setState(state: unknown, result: ViewStateResult) {
		const s = (state as { table?: Partial<TableState> } | undefined)?.table;
		if (s) {
			this.state = { ...this.state, ...s, extra: s.extra ?? this.state.extra };
			if (this.isBuilt) {
				this.fillToolbar();
				this.draw();
			}
		}
		await super.setState(state, result);
	}

	protected build() {
		this.state.folder ??= this.defaultScope();
		this.fillToolbar();
		this.tableEl = el("div", { cls: "chronicle-table-wrap" }, this.body);
		this.draw();
	}

	protected onIndexChanged() {
		// Don't redraw under someone typing in a cell.
		if (this.tableEl?.querySelector(".chronicle-cell-input")) return;
		this.draw();
	}

	private save() {
		this.app.workspace.requestSaveLayout();
	}

	private fillToolbar() {
		this.rebuildToolbar(() => {
			const s = this.state;
			const left = this.group();
			dropdown(left, [["person", "People"], ["place", "Places"], ["event", "Events"], ["culture", "Groups"], ["map", "Maps"]], s.type, (v) => {
				s.type = v as EntityType;
				s.sort = undefined;
				(this.leaf as unknown as { updateHeader?: () => void }).updateHeader?.();
				this.save();
				this.draw();
			}, "What to list");
			this.scopePicker(left, s.folder, (v) => {
				s.folder = v;
				this.save();
				this.draw();
			});
			this.searchBox(left, s.search ?? "", "Filter rows…", (v) => {
				s.search = v || undefined;
				this.draw();
			});
			this.spacer();
			const right = this.group();
			iconButton(right, "columns-3", "Add a column for another property", () =>
				new TextPrompt(this.plugin, "Property name (e.g. motto, religion, rank)", "", (name) => {
					const n = name.trim();
					if (!n || s.extra.includes(n)) return;
					s.extra.push(n);
					this.save();
					this.draw();
				}).open(),
			);
			iconButton(right, "plus", `New ${(TYPE_LABELS[s.type] ?? s.type).toLowerCase()}`, () => this.plugin.createEntityPrompt({ type: s.type, scope: s.folder || undefined }), "mod-cta-icon");
		});
	}

	private columns(): Column[] {
		return [...COLUMNS[this.state.type], ...this.state.extra.map((p) => ({ id: `extra:${p}`, label: p, kind: "text" as CellKind, prop: p }))];
	}

	/** The property names a column reads, most preferred first. */
	private keysOf(c: Column): string[] {
		const aliases = buildFieldAliases(this.plugin.settings.fieldAliases);
		return [...(c.field ? aliases[c.field] : []), ...(c.prop ? [c.prop] : []), ...(c.also ?? [])];
	}

	private raw(e: Entity, c: Column): string {
		const keys = this.keysOf(c).map((k) => k.toLowerCase());
		const hit = Object.keys(e.props).find((k) => keys.includes(k.toLowerCase()));
		return hit ? unlink(e.props[hit]) : "";
	}

	private draw() {
		const box = this.tableEl;
		if (!box) return;
		box.empty();
		const s = this.state;
		const idx = this.plugin.index;
		const cols = this.columns();
		let rows = idx.all(s.type).filter((e) => !s.folder || e.path.startsWith(s.folder + "/"));
		if (s.search) {
			const q = s.search.toLowerCase();
			rows = rows.filter((e) => e.name.toLowerCase().includes(q) || cols.some((c) => this.raw(e, c).toLowerCase().includes(q)));
		}
		const sortCol = s.sort ? cols.find((c) => c.id === s.sort!.col) : undefined;
		const dayOf = (e: Entity, c: Column) => {
			const v = this.raw(e, c);
			return v ? this.plugin.parseDate(v, e.calendar)?.start ?? Infinity : Infinity;
		};
		rows.sort((a, b) => {
			if (!sortCol) return a.name.localeCompare(b.name);
			let r: number;
			if (sortCol.kind === "date") r = dayOf(a, sortCol) - dayOf(b, sortCol);
			else if (sortCol.kind === "number") r = (Number(this.raw(a, sortCol)) || 0) - (Number(this.raw(b, sortCol)) || 0);
			else r = this.raw(a, sortCol).localeCompare(this.raw(b, sortCol));
			if (Number.isNaN(r)) r = 0;
			return (s.sort!.desc ? -r : r) || a.name.localeCompare(b.name);
		});
		el("div", { cls: "chronicle-table-count", text: `${rows.length} ${rows.length === 1 ? "note" : "notes"} · click a cell to change it` }, box);
		const scroller = el("div", { cls: "chronicle-table-scroll" }, box);
		const table = el("table", { cls: "chronicle-table" }, scroller);
		const head = el("tr", {}, el("thead", {}, table));
		const th = (text: string, id: string, width?: number) => {
			const h = el("th", {}, head);
			if (width) h.style.minWidth = `${width}px`;
			const b = el("button", { cls: "chronicle-table-sort", text }, h);
			if (s.sort?.col === id) {
				b.addClass("is-sorted");
				icon(el("span", { cls: "chronicle-table-sort-icon" }, b), s.sort.desc ? "arrow-down" : "arrow-up");
			}
			b.addEventListener("click", () => {
				s.sort = s.sort?.col === id ? (s.sort.desc ? undefined : { col: id, desc: true }) : { col: id, desc: false };
				this.save();
				this.draw();
			});
			if (id.startsWith("extra:")) {
				const x = el("button", { cls: "chronicle-table-remove-col clickable-icon", attr: { "aria-label": "Remove this column" } }, h);
				icon(x, "x");
				x.addEventListener("click", () => {
					s.extra = s.extra.filter((p) => `extra:${p}` !== id);
					this.save();
					this.draw();
				});
			}
		};
		th("Name", "name", 180);
		for (const c of cols) th(c.label, c.id, c.width ?? 150);
		const body = el("tbody", {}, table);
		for (const e of rows) {
			const tr = el("tr", {}, body);
			const name = el("td", { cls: "chronicle-table-name" }, tr);
			const dot = el("span", { cls: "chronicle-table-dot" }, name);
			dot.style.background = entityColor(this.plugin, e);
			const a = el("a", { text: e.name }, name);
			a.addEventListener("click", (evt) => openEntity(this.plugin, e.key, evt));
			tr.addEventListener("contextmenu", (evt) => {
				evt.preventDefault();
				showEntityMenu(this.plugin, e.key, evt);
			});
			for (const c of cols) this.cell(tr, e, c);
		}
		if (!rows.length) el("div", { cls: "chronicle-dash-muted chronicle-table-empty", text: s.search ? "No rows match." : `No ${(TYPE_LABELS[s.type] ?? s.type).toLowerCase()} notes here yet.` }, box);
	}

	private cell(tr: HTMLElement, e: Entity, c: Column) {
		const td = el("td", { cls: `chronicle-table-cell kind-${c.kind}` }, tr);
		const value = this.raw(e, c);
		el("span", { cls: "chronicle-cell-text", text: value || "—" }, td).toggleClass("is-empty", !value);
		if (c.kind === "date" && value && !this.plugin.parseDate(value, e.calendar)) {
			td.addClass("is-invalid");
			td.setAttribute("title", "This date couldn't be read");
		}
		td.addEventListener("click", () => {
			if (td.querySelector("input")) return;
			td.empty();
			const input = el("input", { cls: "chronicle-cell-input", attr: { type: c.kind === "number" ? "number" : "text", placeholder: c.kind === "links" ? "Names, separated by commas" : c.kind === "date" ? "A date" : "" } }, td);
			input.value = value;
			const hint = el("div", { cls: "chronicle-cell-hint" }, td);
			const check = () => {
				if (c.kind !== "date") return;
				const v = input.value.trim();
				const d = v ? this.plugin.parseDate(v, e.calendar) : null;
				hint.setText(!v ? "" : d ? "✓" : "Not a date this calendar knows");
				hint.toggleClass("is-error", !!v && !d);
			};
			check();
			input.addEventListener("input", check);
			input.focus();
			input.select();
			let done = false;
			const finish = (save: boolean) => {
				if (done) return;
				done = true;
				const next = input.value.trim();
				// Back to plain text straight away; the index update then shows the saved value.
				td.empty();
				el("span", { cls: "chronicle-cell-text", text: (save ? next : value) || "—" }, td);
				if (save && next !== value) void this.write(e, c, next);
			};
			input.addEventListener("keydown", (evt) => {
				if (evt.key === "Enter") finish(true);
				else if (evt.key === "Escape") finish(false);
				else if (evt.key === "Tab") {
					evt.preventDefault();
					finish(true);
				}
			});
			input.addEventListener("blur", () => finish(true));
		});
	}

	/** Writes a cell into the note, in the property it already uses (or the column's usual name). */
	private async write(e: Entity, c: Column, value: string) {
		const file = this.app.vault.getAbstractFileByPath(e.path);
		if (!(file instanceof TFile)) return;
		if (c.kind === "date" && value && !this.plugin.parseDate(value, e.calendar)) {
			new Notice(`“${value}” isn't a date this calendar can read; saved anyway so you can fix it.`);
		}
		const keys = this.keysOf(c);
		await this.plugin.editFrontmatter(file, (f) => {
			const key = Object.keys(f).find((k) => keys.map((x) => x.toLowerCase()).includes(k.toLowerCase())) ?? (c.field ? this.plugin.fieldName(c.field) : c.prop!);
			if (!value) {
				delete f[key];
				return;
			}
			if (c.kind === "links") f[key] = value.split(",").map((x) => x.trim()).filter(Boolean).map((x) => `[[${x.replace(/^\[\[|\]\]$/g, "")}]]`);
			else if (c.kind === "link") f[key] = `[[${value.replace(/^\[\[|\]\]$/g, "")}]]`;
			else if (c.kind === "number") f[key] = Number(value.replace(/[,_\s]/g, ""));
			else f[key] = value;
		}, `Edit ${c.label.toLowerCase()} of ${e.name}`);
	}
}
