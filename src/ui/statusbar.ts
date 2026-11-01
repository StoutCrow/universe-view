import { debounce } from "obsidian";
import type ChroniclePlugin from "../main";
import { chainOf, holdingsOf } from "../index/realms";
import { TYPE_LABELS, el, glyph, icon } from "../render/common";
import { GROUP_KINDS, groupKind } from "../render/houses";
import { noteIcons } from "./icons";

/**
 * The open note at a glance in the status bar: its icons, what it is ("Fort", "House", "Kingdom")
 * and where it sits (its realm, or what a person holds). Click it for the inspector.
 */
export function statusBar(plugin: ChroniclePlugin) {
	const item = plugin.addStatusBarItem();
	item.addClass("uv-status", "mod-clickable");
	const render = () => {
		item.empty();
		const file = plugin.app.workspace.getActiveFile();
		const e = file && plugin.settings.statusBar !== false ? plugin.index.get(file.path) : undefined;
		item.toggleClass("is-hidden", !e);
		if (!e) return;
		const { type, kind } = noteIcons(plugin, e.key);
		if (type) icon(el("span", { cls: "uv-status-icon" }, item), type);
		if (kind) glyph(el("span", { cls: "uv-status-icon" }, item), kind);
		const tree = plugin.realms();
		const what = e.type === "culture" ? GROUP_KINDS[groupKind(plugin, e)].label : e.category ? e.category.charAt(0).toUpperCase() + e.category.slice(1) : TYPE_LABELS[e.type];
		const where = tree.nodes.has(e.key)
			? chainOf(tree, e.key).slice(0, -1).reverse().map((k) => plugin.index.get(k)?.name).filter(Boolean).slice(0, 3).join(" › ")
			: e.type === "person"
				? [e.cultures.find((c) => c.ref.resolved)?.ref.name, holdingsOf(tree, e.key).length ? `holds ${holdingsOf(tree, e.key).length}` : ""].filter(Boolean).join(" · ")
				: "";
		el("span", { cls: "uv-status-text", text: where ? `${what} · ${where}` : what }, item);
		item.setAttribute("aria-label", `${e.name}: open in the UniverseView inspector`);
	};
	item.addEventListener("click", () => {
		const f = plugin.app.workspace.getActiveFile();
		if (f) void plugin.inspect(f.path);
	});
	const later = debounce(render, 200, true);
	plugin.registerEvent(plugin.app.workspace.on("file-open", render));
	plugin.registerEvent(plugin.index.on("changed", later));
	plugin.app.workspace.onLayoutReady(render);
	return render;
}
