import { tierLabel } from "../index/realms";
import { MarkdownRenderChild, TFile, TFolder, debounce } from "obsidian";
import type ChroniclePlugin from "../main";
import type { Entity } from "../types";
import { TYPE_ICONS, el, glyph, icon, openEntity } from "../render/common";
import { GROUP_KINDS, groupKind } from "../render/houses";
import { fileColor, noteIcons } from "./icons";

/** The code block that lists what's inside a folder note's folder. */
export const FOLDER_BLOCK = "uv-folder";

interface Options {
	folder?: string;
	depth: number;
	only?: Set<string>;
	title?: string;
}

function parse(source: string): Options {
	const o: Options = { depth: 3 };
	for (const line of source.split(/\r?\n/)) {
		const m = line.match(/^\s*([\w-]+)\s*:\s*(.*?)\s*$/);
		if (!m) continue;
		const [, k, v] = m;
		if (k === "folder") o.folder = v.replace(/^\[\[|\]\]$/g, "").replace(/\/$/, "");
		else if (k === "depth") o.depth = Math.max(1, Number(v) || 3);
		else if (k === "show" || k === "only") o.only = new Set(v.split(/[,\s]+/).map((x) => x.toLowerCase()).filter(Boolean));
		else if (k === "title") o.title = v;
	}
	return o;
}

/**
 * What's inside a folder note's folder, sorted the way a world reads: its titles by tier, then its
 * houses and groups, its people (living, then dead), places, events and other notes. Each in its
 * realm's colour, and kept up to date as notes change.
 */
class FolderOverview extends MarkdownRenderChild {
	constructor(el: HTMLElement, private plugin: ChroniclePlugin, private opts: Options, private sourcePath: string) {
		super(el);
	}

	onload() {
		this.render();
		const later = debounce(() => this.render(), 300, true);
		this.registerEvent(this.plugin.index.on("changed", later));
	}

	private render() {
		const root = this.containerEl;
		root.empty();
		root.addClass("uv-folder-overview", "chronicle-scope");
		const p = this.plugin;
		const dir = this.opts.folder ?? this.sourcePath.split("/").slice(0, -1).join("/");
		const folder = p.app.vault.getAbstractFileByPath(dir || "/");
		if (!(folder instanceof TFolder)) {
			el("div", { cls: "chronicle-dash-problem", text: `No folder “${dir}”.` }, root);
			return;
		}
		const files: TFile[] = [];
		const walk = (f: TFolder, depth: number) => {
			for (const c of f.children) {
				if (c instanceof TFile && c.extension === "md" && c.path !== this.sourcePath) files.push(c);
				else if (c instanceof TFolder && depth < this.opts.depth) walk(c, depth + 1);
			}
		};
		walk(folder, 1);

		const tree = p.realms();
		const groups = new Map<string, { label: string; icon: string; items: { file: TFile; e?: Entity; meta?: string; sort: string }[] }>();
		const add = (id: string, label: string, ic: string, item: { file: TFile; e?: Entity; meta?: string; sort: string }) => {
			if (this.opts.only && !this.opts.only.has(id)) return;
			if (!groups.has(id)) groups.set(id, { label, icon: ic, items: [] });
			groups.get(id)!.items.push(item);
		};
		const year = (e: Entity) => {
			if (!e.start) return "";
			const cal = p.calendars.get(e.calendar);
			const y = (d: number) => cal.formatYear(cal.fromDays(d).y);
			return e.end ? `${y(e.start.start)} – ${y(e.end.start)}` : y(e.start.start);
		};
		for (const file of files) {
			const e = p.index.get(file.path);
			if (!e) {
				add("notes", "Other notes", "file-text", { file, sort: file.basename });
				continue;
			}
			const node = tree.nodes.get(e.key);
			if (node && node.nature === "region") {
				add("regions", "Regions", "mountain", { file, e, meta: tierLabel(node), sort: `${node.rank}${e.name}` });
			} else if (node && node.rank < 9) {
				const tier = tierLabel(node);
				const holder = node.holder?.name;
				add("titles", "Titles", "crown", { file, e, meta: [tier, holder ? `held by ${holder}` : ""].filter(Boolean).join(" · "), sort: `${node.rank}${e.name}` });
			} else if (e.type === "culture") {
				const k = groupKind(p, e);
				const id = k === "house" ? "houses" : "groups";
				add(id, k === "house" ? "Houses" : "Groups", k === "house" ? GROUP_KINDS.house.icon : GROUP_KINDS.group.icon, { file, e, meta: k === "house" ? year(e) : GROUP_KINDS[k].label, sort: e.name });
			} else if (e.type === "person") {
				const dead = !!e.end;
				add(dead ? "dead" : "living", dead ? "The dead" : "People", TYPE_ICONS.person, { file, e, meta: year(e), sort: dead ? String(-(e.end?.start ?? 0)).padStart(12, "0") : e.name });
			} else if (e.type === "place") add("places", "Places", TYPE_ICONS.place, { file, e, meta: e.category, sort: e.name });
			else if (e.type === "event") add("events", "Events", TYPE_ICONS.event, { file, e, meta: year(e), sort: String(e.start?.start ?? 9e15).padStart(18, "0") });
			else add("maps", "Maps", TYPE_ICONS.map, { file, e, sort: e.name });
		}

		const order = ["regions", "titles", "houses", "groups", "living", "dead", "places", "events", "maps", "notes"];
		const owner = p.index.get(this.sourcePath);
		if (this.opts.title !== "none") el("div", { cls: "uv-fo-title", text: this.opts.title || `In ${owner?.name ?? folder.name}` }, root);
		if (!groups.size) {
			el("div", { cls: "chronicle-dash-muted", text: "Nothing inside yet. New people, places and titles that belong here are placed in this folder." }, root);
			return;
		}
		const grid = el("div", { cls: "uv-fo-grid" }, root);
		for (const id of order) {
			const g = groups.get(id);
			if (!g) continue;
			const box = el("section", { cls: "uv-fo-group" }, grid);
			const head = el("div", { cls: "uv-fo-head" }, box);
			icon(el("span", {}, head), g.icon);
			el("span", { text: g.label }, head);
			el("span", { cls: "uv-fo-count", text: String(g.items.length) }, head);
			g.items.sort((a, b) => a.sort.localeCompare(b.sort, undefined, { numeric: true }));
			for (const it of g.items) {
				const row = el("div", { cls: "uv-fo-item" }, box);
				const c = fileColor(p, it.file.path);
				if (c) {
					row.style.setProperty("--uv-file-color", c.color);
					row.style.setProperty("--uv-file-strength", `${c.strength}%`);
					row.addClass("is-tinted");
				}
				const ic = noteIcons(p, it.file.path);
				const icons = el("span", { cls: "uv-fo-icons" }, row);
				if (ic.type) icon(el("span", {}, icons), ic.type);
				if (ic.kind) glyph(el("span", {}, icons), ic.kind);
				const a = el("a", { cls: "internal-link uv-fo-link", text: it.e?.name ?? it.file.basename, attr: { "data-href": it.file.path, href: it.file.path } }, row);
				a.addEventListener("click", (evt) => {
					evt.preventDefault();
					openEntity(p, it.file.path, evt);
				});
				if (it.meta) el("span", { cls: "uv-fo-meta", text: it.meta }, row);
				// Deeper than the folder itself: say where.
				const rel = it.file.parent?.path.slice(folder.path.length + 1);
				if (rel) el("span", { cls: "uv-fo-where", text: rel }, row);
			}
		}
	}
}

export function registerFolderOverview(plugin: ChroniclePlugin) {
	plugin.registerMarkdownCodeBlockProcessor(FOLDER_BLOCK, (source, elx, ctx) => {
		ctx.addChild(new FolderOverview(elx, plugin, parse(source), ctx.sourcePath));
	});
	plugin.addCommand({
		id: "insert-folder-overview",
		name: "Insert folder overview (what's inside this folder)",
		icon: "list-tree",
		editorCallback: (editor) => editor.replaceSelection("```" + FOLDER_BLOCK + "\ndepth: 3\n```\n"),
	});
}
