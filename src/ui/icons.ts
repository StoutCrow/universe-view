import { SuggestModal, TFile, debounce, getIconIds } from "obsidian";
import type ChroniclePlugin from "../main";
import type { EntityType } from "../types";
import { TYPE_ICONS, el, entityColor, glyph, icon } from "../render/common";
import { chainOf, tierName } from "../index/realms";
import { GROUP_KINDS, groupKind, type GroupKind } from "../render/houses";
import { parseMapCategories } from "../settings";

/** The built-in icons, kept so a cleared setting goes back to them. */
const DEFAULT_TYPE_ICONS = { ...TYPE_ICONS };
const DEFAULT_GROUP_ICONS = Object.fromEntries(Object.entries(GROUP_KINDS).map(([k, v]) => [k, v.icon])) as Record<GroupKind, string>;

/** Puts the icons chosen in the settings (per type, per kind of group) in place of the built-in ones. */
export function applyIconSettings(plugin: ChroniclePlugin) {
	const s = plugin.settings;
	for (const t of Object.keys(DEFAULT_TYPE_ICONS) as EntityType[]) TYPE_ICONS[t] = s.typeIcons?.[t]?.trim() || DEFAULT_TYPE_ICONS[t];
	for (const k of Object.keys(DEFAULT_GROUP_ICONS) as GroupKind[]) GROUP_KINDS[k].icon = s.groupIcons?.[k]?.trim() || DEFAULT_GROUP_ICONS[k];
}

export { DEFAULT_GROUP_ICONS, DEFAULT_TYPE_ICONS };

/**
 * The icons a note shows: its type's (a pin for a place) and, beside it, what it is more exactly,
 * when that's different: its own `icon:`, its kind's (a castle for a fort), or its kind of group.
 */
export function noteIcons(plugin: ChroniclePlugin, path: string): { type?: string; kind?: string } {
	const e = plugin.index.get(path);
	if (!e) {
		// Not a UniverseView note: only an `icon:` it was given.
		const f = plugin.app.vault.getAbstractFileByPath(path);
		const own: unknown = f instanceof TFile ? plugin.app.metadataCache.getFileCache(f)?.frontmatter?.icon : undefined;
		return typeof own === "string" && own.trim() ? { kind: own.trim() } : {};
	}
	const type = TYPE_ICONS[e.type];
	const cat = e.category ? parseMapCategories(plugin.settings.mapCategories).get(e.category)?.icon : undefined;
	const group = e.type === "culture" ? GROUP_KINDS[groupKind(plugin, e)].icon : undefined;
	const kind = e.icon ?? cat ?? group;
	return { type, kind: kind && kind !== type ? kind : undefined };
}

/** How strongly each tier is coloured in the file explorer (1 empire … 6 settlement), and houses and people. */
export const DEFAULT_FILE_STRENGTH: Record<string, number> = { "1": 100, "2": 95, "3": 85, "4": 65, "5": 50, "6": 40, region: 45, house: 75, person: 45, other: 55 };
export function fileStrengthNames(): [string, string][] {
	return [...["1", "2", "3", "4", "5", "6"].map((t): [string, string] => [t, tierName(Number(t), true)]), ["region", "Regions (geography)"], ["house", "Houses"], ["person", "People"], ["other", "Other titles"]];
}

/**
 * A note's colour in the file explorer: from the nearest title above it (or itself) with a colour of
 * its own, else its realm's, at a strength set by its tier, so a county reads as a softer shade of
 * its duchy. Houses take their own colour, people their house's.
 */
export function fileColor(plugin: ChroniclePlugin, path: string): { color: string; strength: number } | undefined {
	const e = plugin.index.get(path);
	if (!e) return undefined;
	const strengths = { ...DEFAULT_FILE_STRENGTH, ...(plugin.settings.fileStrength ?? {}) };
	const tree = plugin.realms();
	const node = tree.nodes.get(e.key);
	if (node) {
		const chain = chainOf(tree, e.key);
		const coloured = [...chain].reverse().map((k) => plugin.index.get(k)).find((x) => x?.color);
		const top = chain.find((k) => tree.nodes.get(k)?.holder) ?? chain[0];
		const source = coloured ?? plugin.index.get(top);
		if (!source) return undefined;
		const tier = node.nature === "region" ? "region" : node.rank < 9 ? String(Math.max(1, Math.min(6, Math.round(node.rank)))) : "other";
		return { color: entityColor(plugin, source), strength: strengths[tier] ?? 60 };
	}
	if (e.type === "culture") return { color: entityColor(plugin, e), strength: strengths.house ?? 75 };
	if (e.type === "person") {
		const house = e.cultures.map((c) => plugin.index.get(c.ref.key)).find((c) => c?.type === "culture");
		return house ? { color: entityColor(plugin, house), strength: strengths.person ?? 45 } : undefined;
	}
	return undefined;
}

/**
 * Icons in the file explorer and search: beside each UniverseView note, its type's icon and its
 * kind's. Redrawn as folders open and results come in, and when notes change.
 */
export function decorateFileLists(plugin: ChroniclePlugin) {
	const paint = (root: ParentNode) => {
		const icons = plugin.settings.fileIcons !== false;
		if (!icons) root.querySelectorAll(".uv-file-icons").forEach((x) => x.remove());
		// File explorer (and bookmarks): titles carry the path.
		for (const title of Array.from(root.querySelectorAll<HTMLElement>(".nav-file-title[data-path], .tree-item-self[data-path]"))) {
			const path = title.dataset.path ?? "";
			if (!path.endsWith(".md")) continue;
			if (icons) put(title, path);
			tint(title, path);
		}
		// A folder with a folder note (California/California.md) takes that note's colour.
		for (const title of Array.from(root.querySelectorAll<HTMLElement>(".nav-folder-title[data-path]"))) {
			const dir = title.dataset.path ?? "";
			if (icons && plugin.index.get("" + dir + "/" + dir.split("/").pop() + ".md")) put(title, dir + "/" + dir.split("/").pop() + ".md");
			tint(title, `${dir}/${dir.split("/").pop()}.md`);
		}
		// Search results: matched by the file's name.
		if (icons) for (const res of Array.from(root.querySelectorAll<HTMLElement>(".search-result-file-title"))) {
			const name = res.querySelector(".tree-item-inner")?.textContent?.trim();
			if (!name) continue;
			const e = plugin.index.findByName(name);
			if (e) put(res, e.key);
		}
	};
	// Colours by realm and tier (Settings → Look & cards → File explorer colours).
	const tint = (title: HTMLElement, path: string) => {
		const c = plugin.settings.fileColors === false ? undefined : fileColor(plugin, path);
		const style = plugin.settings.fileColorStyle ?? "both";
		title.toggleClass("uv-file-tinted", !!c);
		title.toggleClass("uv-tint-text", !!c && style !== "bar");
		title.toggleClass("uv-tint-bar", !!c && style !== "text");
		if (c) {
			title.style.setProperty("--uv-file-color", c.color);
			title.style.setProperty("--uv-file-strength", `${Math.max(0, Math.min(100, c.strength))}%`);
		} else {
			title.style.removeProperty("--uv-file-color");
			title.style.removeProperty("--uv-file-strength");
		}
	};
	const put = (title: HTMLElement, path: string) => {
		const { type, kind } = noteIcons(plugin, path);
		const sig = `${type ?? ""}|${kind ?? ""}`;
		const have = title.querySelector<HTMLElement>(":scope > .uv-file-icons");
		if (have?.dataset.sig === sig) return;
		have?.remove();
		if (!type && !kind) return;
		const box = el("span", { cls: "uv-file-icons", attr: { "data-sig": sig } });
		if (type) icon(el("span", { cls: "uv-file-icon is-type" }, box), type);
		if (kind) glyph(el("span", { cls: "uv-file-icon is-kind" }, box), kind);
		// After a folder's fold arrow, before the name.
		const arrow = title.querySelector(":scope > .nav-folder-collapse-indicator, :scope > .collapse-icon");
		if (arrow) arrow.after(box);
		else title.prepend(box);
	};
	const all = () => {
		for (const type of ["file-explorer", "search", "bookmarks"]) {
			for (const leaf of plugin.app.workspace.getLeavesOfType(type)) paint(leaf.view.containerEl);
		}
	};
	const later = debounce(all, 120, true);
	// Folders opening and new search results add rows: watch the lists for them.
	const observer = new MutationObserver(() => later());
	const watch = () => {
		observer.disconnect();
		for (const type of ["file-explorer", "search", "bookmarks"]) {
			for (const leaf of plugin.app.workspace.getLeavesOfType(type)) observer.observe(leaf.view.containerEl, { childList: true, subtree: true });
		}
		later();
	};
	plugin.app.workspace.onLayoutReady(watch);
	plugin.registerEvent(plugin.app.workspace.on("layout-change", watch));
	plugin.registerEvent(plugin.index.on("changed", later));
	plugin.register(() => {
		observer.disconnect();
		document.querySelectorAll(".uv-file-icons").forEach((x) => x.remove());
		document.querySelectorAll(".uv-file-tinted").forEach((x) => x.removeClasses(["uv-file-tinted", "uv-tint-text", "uv-tint-bar"]));
	});
	return all;
}

/** Pick an icon by name (all of Obsidian's Lucide icons), with each shown as you search. */
export class IconPickerModal extends SuggestModal<string> {
	private ids: string[];

	constructor(plugin: ChroniclePlugin, private onPick: (id: string | null) => void, current?: string) {
		super(plugin.app);
		let ids: string[] = [];
		try {
			ids = getIconIds().map((x) => x.replace(/^lucide-/, ""));
		} catch {
			ids = [];
		}
		this.ids = [...new Set(ids)].sort();
		this.setPlaceholder(current ? `Icon (now ${current}) — type to search, or an emoji` : "Search icons, or type an emoji");
	}

	getSuggestions(q: string): string[] {
		const query = q.trim().toLowerCase();
		const out = this.ids.filter((id) => !query || id.includes(query)).slice(0, 200);
		// An emoji or any text typed is offered as it is; "none" clears the icon.
		if (query && !/^[a-z0-9-]+$/.test(query)) out.unshift(q.trim());
		out.unshift("(none)");
		return out;
	}

	renderSuggestion(id: string, row: HTMLElement) {
		row.addClass("uv-icon-option");
		const g = el("span", { cls: "uv-icon-option-glyph" }, row);
		if (id !== "(none)") glyph(g, id);
		el("span", { text: id === "(none)" ? "No icon of its own" : id }, row);
	}

	onChooseSuggestion(id: string) {
		this.onPick(id === "(none)" ? null : id);
	}
}

/** Asks for an icon and writes it to the note as `icon:` (or removes it). */
export function changeNoteIcon(plugin: ChroniclePlugin, file: TFile) {
	const current = plugin.index.get(file.path)?.icon;
	new IconPickerModal(plugin, (id) => {
		void plugin.editFrontmatter(file, (fm) => {
			if (id) fm.icon = id;
			else delete fm.icon;
		}, id ? `Icon of ${file.basename}: ${id}` : `Removed ${file.basename}'s icon`);
	}, current).open();
}
