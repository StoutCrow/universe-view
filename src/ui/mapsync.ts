import { Notice, TFile, normalizePath } from "obsidian";
import type ChroniclePlugin from "../main";
import type { Entity } from "../types";
import { chainOf, descendantsOf } from "../index/realms";
import { inRing, ringArea, type P2 } from "../index/geometry";
import { isFolderNote } from "./foldernotes";

/**
 * Keeping notes where the map says they are. When a pin is moved or an area redrawn into another
 * land, the note is linked to that land (`under:` for a title under a realm, `located-in:` for the
 * rest) and its file (or its whole folder, for a folder note) moves inside that land's folder note.
 */

/** The smallest land on this map whose area holds the point, other than the note and what's under it. */
function landAt(plugin: ChroniclePlugin, map: string, at: P2, except: Set<string>): Entity | undefined {
	let best: { e: Entity; area: number } | undefined;
	for (const e of plugin.index.all()) {
		if (except.has(e.key)) continue;
		for (const t of e.territories) {
			// Only borders as they stand now: an area whose dates have ended is history.
			if (t.points.length < 3 || (t.map !== map && t.map !== "*") || t.to) continue;
			const ring = t.points as P2[];
			if (!inRing(at, ring)) continue;
			const area = ringArea(ring);
			if (!best || area < best.area) best = { e, area };
		}
	}
	return best?.e;
}

/** Where a note is on a map: its pin, else the middle of its largest area there. */
function pointOf(e: Entity, map: string): P2 | undefined {
	if (map === "world" && e.coords) return [e.coords[0], e.coords[1]];
	if (e.position && e.map?.key === map) return e.position;
	const areas = e.territories.filter((t) => (t.map === map || t.map === "*") && t.points.length > 2 && !t.to).sort((a, b) => ringArea(b.points as P2[]) - ringArea(a.points as P2[]));
	const ring = areas[0]?.points;
	if (!ring) return undefined;
	return [ring.reduce((s, p) => s + p[0], 0) / ring.length, ring.reduce((s, p) => s + p[1], 0) / ring.length];
}

/** Links the note to the land and moves its file (or folder) inside that land's folder note. */
export async function moveInto(plugin: ChroniclePlugin, e: Entity, land: Entity) {
	const tree = plugin.realms();
	const node = tree.nodes.get(e.key);
	const landNode = tree.nodes.get(land.key);
	const file = plugin.app.vault.getAbstractFileByPath(e.path);
	if (!(file instanceof TFile)) return;
	// A title under a realm answers to it; anything else (or anything in a region) lies in it.
	const field = node && node.nature !== "region" && landNode?.nature !== "region" ? "under" : "located-in";
	await plugin.editFrontmatter(file, (fm) => {
		const key = field === "under" ? "under" : ["located-in", "located_in", "locatedIn", "location", "region", "within"].find((k) => k in fm) ?? "located-in";
		fm[key] = plugin.wikilink(land.key, e.path);
	}, `${e.name} now in ${land.name}`);
	if ((plugin.settings.placeNewNotes ?? "parent") === "off") return;
	const landFile = plugin.app.vault.getAbstractFileByPath(land.path);
	if (!(landFile instanceof TFile)) return;
	const target = isFolderNote(landFile) ? landFile.parent!.path : landFile.parent?.path ?? "";
	// A folder note takes its whole folder along.
	const moving = isFolderNote(file) ? file.parent! : file;
	const dest = normalizePath(`${target ? target + "/" : ""}${moving.name}`);
	if (moving.path === dest || dest.startsWith(moving.path + "/")) return;
	if (plugin.app.vault.getAbstractFileByPath(dest)) {
		new Notice(`Linked ${e.name} to ${land.name}, but didn't move it: ${dest} already exists.`);
		return;
	}
	await plugin.app.fileManager.renameFile(moving, dest);
	new Notice(`Moved ${e.name} into ${land.name}.`);
}

/**
 * After a pin moves or an area is drawn: if it now sits in a different land than its note says,
 * move it there, or ask first (Settings → Folder notes → When the map moves something).
 */
export function syncAfterMapEdit(plugin: ChroniclePlugin, key: string, map: string) {
	const mode = plugin.settings.mapMovesFiles ?? "ask";
	if (mode === "off") return;
	// Let the index read the change first.
	window.setTimeout(() => {
		const e = plugin.index.get(key);
		if (!e) return;
		const at = pointOf(e, map);
		if (!at) return;
		const tree = plugin.realms();
		const except = new Set([e.key, ...descendantsOf(tree, e.key)]);
		const land = landAt(plugin, map, at, except);
		if (!land) return;
		// Already there: the land is its liege, its region, where it's located, or anywhere above those.
		const node = tree.nodes.get(e.key);
		const above = new Set([...(node ? chainOf(tree, e.key) : []), node?.region, e.locatedIn?.key].filter((k): k is string => !!k));
		for (const k of [...above]) for (const c of tree.nodes.has(k) ? chainOf(tree, k) : []) above.add(c);
		// Already inside a land that lies in this one counts too (a fort in a county inside the duchy drawn here).
		if (above.has(land.key)) return;
		if (mode === "always") {
			void moveInto(plugin, e, land);
			return;
		}
		const frag = createFragment((f) => {
			f.createDiv({ text: `${e.name} is now inside ${land.name} on the map.` });
			const row = f.createDiv({ cls: "uv-notice-actions" });
			const go = row.createEl("button", { text: `Move into ${land.name}` });
			const no = row.createEl("button", { text: "Leave it" });
			go.addEventListener("click", (evt) => {
				evt.stopPropagation();
				void moveInto(plugin, e, land);
				notice.hide();
			});
			no.addEventListener("click", (evt) => {
				evt.stopPropagation();
				notice.hide();
			});
		});
		const notice = new Notice(frag, 15000);
	}, 900);
}

