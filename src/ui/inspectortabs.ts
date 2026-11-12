import { Notice, TFile, TFolder } from "obsidian";
import type UniverseViewPlugin from "../main";
import type { Entity, Territory } from "../types";
import { chainOf, descendantsOf, tierLabel } from "../index/realms";
import { validate } from "../index/validate";
import { kindLabel } from "../index/reader";
import { formatSpan } from "../dates/parser";
import { TYPE_LABELS, el, entityColor, helpTip, icon } from "../render/common";
import { GROUP_KINDS, groupKind } from "../render/houses";
import { ROW_INFO } from "../index/membership";
import { groupsByRow } from "./groupsplit";
import { noteChip } from "./EntityPanel";
import { miniMap } from "./minimap";
import { aliasesOf } from "./identity";
import { areaDatesSheet, newLandSheet } from "./territoryactions";
import { toolSheet } from "./toolsheet";
import { STAT_NAMES, realmStats, statText } from "../index/realmstats";
import { folderNoteOf, isFolderNote, makeFolderNote, placementFor } from "./foldernotes";
import { entityLinks } from "./tidy";

/** The inspector's extra tabs: what happened, where it is on the map, what links here, and how UniverseView reads the note. */
export type InspectorTab = "about" | "edit" | "timeline" | "map" | "links" | "note";

interface Ctx {
	pick: (key: string) => void;
	host: HTMLElement;
}

function section(body: HTMLElement, title: string, ic: string, help?: string): HTMLElement {
	const s = el("section", { cls: "universeview-insp-section" }, body);
	const h = el("div", { cls: "universeview-insp-section-head" }, s);
	icon(el("span", {}, h), ic);
	el("span", { text: title }, h);
	if (help) helpTip(h, help);
	return s;
}

function chips(p: UniverseViewPlugin, parent: HTMLElement, keys: string[], ctx: Ctx, sub?: (k: string) => string | undefined) {
	const box = el("div", { cls: "universeview-ep universeview-ep-people" }, parent);
	for (const k of keys) noteChip(p, box, { key: k, name: p.index.get(k)?.name ?? k }, { pick: ctx.pick, host: ctx.host }, sub?.(k));
	return box;
}

function actions(parent: HTMLElement) {
	const row = el("div", { cls: "universeview-insp-actions" }, parent);
	return (ic: string, label: string, run: () => void) => {
		const b = el("button", {}, row);
		icon(el("span", {}, b), ic);
		el("span", { text: label }, b);
		b.addEventListener("click", run);
		return b;
	};
}

/** Which tabs a note has: only the ones with something to show. */
export function tabsFor(p: UniverseViewPlugin, e: Entity): InspectorTab[] {
	const out: InspectorTab[] = ["about", "edit"];
	if (e.type !== "map" && (e.start || p.index.events(e.key).length)) out.push("timeline");
	const node = p.realms().nodes.get(e.key);
	if (e.type === "place" || e.territories.length || e.position || e.coords || node) out.push("map");
	out.push("links", "note");
	return out;
}

export const TAB_INFO: Record<Exclude<InspectorTab, "edit">, [string, string]> = {
	about: ["About", ""],
	timeline: ["Timeline", "calendar-range"],
	map: ["Map", "map"],
	links: ["Links", "link"],
	note: ["Note", "file-cog"],
};

// ---- Timeline -----------------------------------------------------------------------------------

/** Its own dates, then every event it's part of, in order, with how old a person was at each. */
export function timelineTab(p: UniverseViewPlugin, body: HTMLElement, e: Entity, ctx: Ctx) {
	const cal = p.calendars.get(e.calendar);
	if (e.start) {
		const s = section(body, "Span", "hourglass");
		el("div", { cls: "uv-insp-span", text: formatSpan(e.start, e.end, cal) }, s);
	}
	const evs = p.index.events(e.key).filter((x) => x.start).sort((a, b) => a.start!.start - b.start!.start);
	const s = section(body, `Events (${evs.length})`, "calendar-range", "Every event that names this note: as a participant, a place, a group, or what caused or followed it.");
	if (!evs.length) el("div", { cls: "universeview-dash-muted", text: "No dated events name this note yet." }, s);
	const list = el("div", { cls: "uv-insp-timeline" }, s);
	for (const ev of evs) {
		const row = el("div", { cls: "uv-insp-tl-row", attr: { role: "button", tabindex: "0" } }, list);
		el("span", { cls: "uv-insp-tl-date", text: formatSpan(ev.start, ev.end, p.calendars.get(ev.calendar)) }, row);
		el("span", { cls: "uv-insp-tl-name", text: ev.name }, row);
		// A person's age at the time.
		if (e.type === "person" && e.start && ev.start!.start >= e.start.start) {
			const years = Math.floor((ev.start!.start - e.start.start) / 365.25);
			el("span", { cls: "uv-insp-tl-age", text: `age ${years}` }, row);
		}
		row.addEventListener("click", () => ctx.pick(ev.key));
	}
	const act = actions(body);
	act("calendar-plus", "New event with it", () => p.createEntityPrompt({ type: "event", ...(e.type === "person" ? { participants: [e.name] } : e.type === "place" ? { places: [e.name] } : { cultures: [e.name] }) }));
}

// ---- Map ------------------------------------------------------------------------------------------

/** Where it is: an outline, its pin and areas, the lands inside it, and ways to draw or split them. */
export function mapTab(p: UniverseViewPlugin, body: HTMLElement, e: Entity, ctx: Ctx) {
	const tree = p.realms();
	const node = tree.nodes.get(e.key);
	const s = section(body, "Where", "map", "Its own borders filled in, the realm or region it lies in drawn dashed around them.");
	if (!miniMap(p, s, e)) el("div", { cls: "universeview-dash-muted", text: e.territories.length ? "Its areas are on a map that isn't open here." : "No borders drawn yet." }, s);
	const facts = el("div", { cls: "uv-insp-facts" }, s);
	const fact = (k: string, v: string) => {
		el("span", { cls: "uv-insp-fact-key", text: k }, facts);
		el("span", { text: v }, facts);
	};
	const maps = new Map<string, number>();
	for (const t of e.territories) maps.set(t.map, (maps.get(t.map) ?? 0) + 1);
	if (maps.size) fact("Areas", [...maps].map(([m, n]) => `${n} on ${m === "world" ? "the world map" : m === "*" ? "any map" : p.index.get(m)?.name ?? m}`).join(", "));
	if (e.position) fact("Pin", `${e.map?.name ?? "a map"} at ${e.position.map((x) => Math.round(x)).join(", ")}`);
	else if (e.coords) fact("Pin", `${e.coords.map((x) => x.toFixed(3)).join(", ")}`);
	if (node) {
		fact("Is", `${tierLabel(node) || (node.nature === "region" ? "Region" : "Title")} (${node.nature === "region" ? "geography" : "ruled land"})`);
		if (node.region) fact("Lies in", p.index.get(node.region)?.name ?? "");
	}
	// Its size, counted over everything under it.
	if (node && node.nature !== "region") {
		const map = e.territories[0]?.map ?? e.map?.key;
		const st = realmStats(p, e.key, map && map !== "*" ? map : undefined);
		const box = section(body, "Statistics", "bar-chart-3", "Counted over this title and everything under it. Area comes from the borders drawn on its map (in km² when the map note has a `scale:`); population from `population:` on it or added up from its places; people are those born, living or belonging there, and its holders.");
		const grid = el("div", { cls: "uv-stats" }, box);
		for (const [k, label] of STAT_NAMES) {
			const cell = el("div", { cls: "uv-stat" }, grid);
			el("div", { cls: "uv-stat-value", text: statText(st, k) }, cell);
			el("div", { cls: "uv-stat-label", text: label }, cell);
		}
	}
	// Lands inside it: they split from it when zoomed in, and merge back into it zoomed out.
	const inside = node ? descendantsOf(tree, e.key).filter((k) => (p.index.get(k)?.territories.length ?? 0) > 0) : [];
	if (inside.length) {
		const sub = section(body, `Lands inside (${inside.length})`, "layers", "Titles and regions under this one that have borders of their own. Zoomed out they show as part of it; zoom in, or click it, to see them apart.");
		chips(p, sub, inside.slice(0, 40), ctx, (k) => tierLabel(tree.nodes.get(k)));
	}
	bordersCard(p, body, e);
}

/**
 * Borders: every area the note has, by map and by date, each with its tools (reshape, when it
 * applies, new borders from a date, grow to the neighbours, remove), and the tools for new land.
 * The same forms as right-clicking an area on the map.
 */
function bordersCard(p: UniverseViewPlugin, body: HTMLElement, e: Entity) {
	const s = section(body, `Borders${e.territories.length ? ` (${e.territories.length})` : ""}`, "hexagon", "Each area this note has on a map, with when it applies. Borders can change over time: give an area dates, or new borders from a date. Reshaping, growing and splitting open the map on that area.");
	s.addClass("uv-borders");
	const cal = p.calendars.get(e.calendar);
	// Numbered per map the way the map numbers them (areas that name no map count on every map).
	const byMap = new Map<string, { t: Territory; n: number }[]>();
	e.territories.forEach((t, i) => {
		const m = t.map;
		const n = e.territories.slice(0, i).filter((x) => x.map === m || x.map === "*").length;
		byMap.set(m, [...(byMap.get(m) ?? []), { t, n }]);
	});
	if (!e.territories.length) el("div", { cls: "universeview-dash-muted", text: "No borders drawn yet. Draw them on a map, or fill them from its coasts and borders." }, s);
	for (const [m, list] of byMap) {
		const mapName = m === "world" ? "World map" : m === "*" ? "Any map" : p.index.get(m)?.name ?? m;
		const group = el("div", { cls: "uv-borders-map" }, s);
		const gh = el("div", { cls: "uv-borders-map-head" }, group);
		icon(el("span", {}, gh), m === "world" ? "globe" : "map");
		el("span", { text: mapName }, gh);
		el("span", { cls: "uv-borders-count", text: `${list.length} area${list.length === 1 ? "" : "s"}` }, gh);
		for (const { t, n } of list) {
			const row = el("div", { cls: "uv-border-row" }, group);
			const swatch = el("span", { cls: "uv-border-swatch" }, row);
			swatch.style.setProperty("--terr-color", entityColor(p, e));
			const info = el("div", { cls: "uv-border-info" }, row);
			const when = t.from || t.to ? formatSpan(t.from, t.to, cal) : "Always";
			el("div", { cls: "uv-border-when", text: t.name ? `${t.name} · ${when}` : when }, info);
			el("div", { cls: "uv-border-sub", text: `${t.points.length} corners${t.from && !t.to ? " · current from then on" : t.to ? " · ended" : ""}` }, info);
			const tools = el("div", { cls: "uv-border-tools" }, row);
			const tool = (ic: string, label: string, run: () => void, cls = "") => {
				const b = el("button", { cls: `clickable-icon ${cls}`.trim(), attr: { "aria-label": label } }, tools);
				icon(b, ic);
				b.addEventListener("click", run);
			};
			const onAMap = m !== "*";
			if (onAMap) tool("pencil", "Reshape it on the map", () => void p.drawOnMap(e.key, "edit", n, m));
			tool("calendar-range", "When it applies…", () => areaDatesSheet(p, e, onAMap ? m : (e.map?.key ?? "world"), n, t));
			if (onAMap) tool("history", "New borders from a date…", () => void p.drawOnMap(e.key, "borders", n, m));
			if (onAMap) tool("expand", "Grow to fill gaps with neighbours…", () => void p.drawOnMap(e.key, "grow", n, m));
			tool("trash-2", "Remove this area", () => {
				toolSheet(p, {
					title: `Remove an area of ${e.name}`,
					icon: "trash-2",
					danger: true,
					intro: `Takes this area (${when.toLowerCase()}, ${t.points.length} corners, on ${mapName}) off the map. The note stays; Undo (Ctrl+Alt+Z) puts the area back.`,
					fields: [],
					submit: "Remove it",
					run: () => void p.saveTerritory(e.key, onAMap ? m : (e.map?.key ?? "world"), n, null).then(() => new Notice(`Removed an area of ${e.name}.`)),
				});
			}, "is-danger");
		}
	}
	// New land: more borders, a land split off, or a new land inside.
	const row = el("div", { cls: "uv-borders-new" }, s);
	const big = (ic: string, label: string, run: () => void) => {
		const b = el("button", { cls: "uv-borders-new-btn" }, row);
		icon(el("span", {}, b), ic);
		el("span", { text: label }, b);
		b.addEventListener("click", run);
	};
	big("paintbrush", e.territories.length ? "Draw another area" : "Draw its borders", () => void p.drawOnMap(e.key, "paint"));
	if (e.territories.length) big("scissors", "Split a land off", () => void p.drawOnMap(e.key, "split"));
	big("plus-square", "New land inside", () => newLandSheet(p, e, (file) => void p.drawOnMap(file.path, "paint")));
	big("map", "Show on map", () => void p.openMap(e.key));
}

// ---- Links ----------------------------------------------------------------------------------------

/** What it links to and what links to it, by kind; members of a group; notes that only mention it. */
export function linksTab(p: UniverseViewPlugin, body: HTMLElement, e: Entity, ctx: Ctx) {
	const idx = p.index;
	const keys = (refs: { key: string; resolved: boolean }[]) => [...new Set(refs.filter((r) => r.resolved).map((r) => r.key))];
	const group = (title: string, ic: string, list: string[], sub?: (k: string) => string | undefined) => {
		if (!list.length) return;
		const s = section(body, `${title} (${list.length})`, ic);
		chips(p, s, list.slice(0, 60), ctx, sub);
	};
	if (e.type === "person") {
		group("Parents", "arrow-up", keys(e.parents));
		group("Children", "baby", idx.children(e.key));
		group("Partners", "heart", keys(idx.partners(e.key).map((x) => x.ref)));
		group("Siblings", "users", idx.siblings(e.key));
	}
	for (const [row, refs] of groupsByRow(p, e.cultures)) group(ROW_INFO[row].plural, GROUP_KINDS[row].icon, keys(refs.map((c) => c.ref)));
	group("Places", "map-pin", keys(e.places));
	group("People", "user", keys(e.participants));
	if (e.type === "culture") group("Members", "users", idx.members(e.key).map((m) => (m as { key: string }).key), () => undefined);
	const rels = e.relations.filter((r) => r.ref.resolved);
	if (rels.length) {
		const s = section(body, `Relationships (${rels.length})`, "git-merge");
		const box = el("div", { cls: "universeview-ep universeview-ep-people" }, s);
		for (const r of rels) noteChip(p, box, r.ref, { pick: ctx.pick, host: ctx.host }, r.kind ?? r.role);
	}
	// Every other note that links here.
	const linked = Object.entries(p.app.metadataCache.resolvedLinks ?? {}).filter(([, to]) => to[e.path]).map(([from]) => from).filter((k) => k !== e.path);
	const uv = linked.filter((k) => idx.get(k));
	const other = linked.filter((k) => !idx.get(k));
	group("Linked from", "corner-down-right", uv);
	if (other.length) {
		const s = section(body, `Other notes that link here (${other.length})`, "file-text");
		const list = el("div", { cls: "uv-insp-plain" }, s);
		for (const k of other.slice(0, 40)) {
			const a = el("a", { text: k.replace(/\.md$/, "").split("/").pop() ?? k, attr: { title: k } }, list);
			a.addEventListener("click", () => {
				const f = p.app.vault.getAbstractFileByPath(k);
				if (f instanceof TFile) void p.app.workspace.getLeaf(false).openFile(f);
			});
		}
	}
}

// ---- Note -----------------------------------------------------------------------------------------

/** How UniverseView reads the note, where it's filed and where it belongs, and anything wrong with it. */
export function noteTab(p: UniverseViewPlugin, body: HTMLElement, e: Entity, ctx: Ctx) {
	const tree = p.realms();
	const node = tree.nodes.get(e.key);
	// Every way this note is known and found: names, ids, its file and how it's linked.
	{
		const idBox = section(body, "Identity", "fingerprint", "Every name and id this note goes by, and its file: when it was made and last changed, how long it is, and how many notes link to it and from it.");
		const facts = el("div", { cls: "uv-insp-facts" }, idBox);
		const fact = (k: string, v: string | undefined) => {
			if (!v) return;
			el("span", { cls: "uv-insp-fact-key", text: k }, facts);
			el("span", { cls: "uv-insp-fact-value", text: v }, facts);
		};
		const file = p.app.vault.getAbstractFileByPath(e.path);
		fact("Name", e.name);
		if (file instanceof TFile && file.basename !== e.name) fact("File name", file.basename);
		fact("Also known as", aliasesOf(e).join(", "));
		const cal = p.calendars.get(e.calendar);
		if (e.names?.length) fact("Names over time", e.names.map((n) => `${n.name}${n.from || n.to ? ` (${formatSpan(n.from, n.to, cal)})` : ""}`).join("; "));
		// Ids other tools gave it (Charted Roots, imports, your own).
		for (const [k, v] of Object.entries(e.props)) if (/^(id|uid|uuid|guid|cr_id|cr-id|gedcom[-_]?id|ref|key)$/i.test(k) && (typeof v === "string" || typeof v === "number")) fact(`Id (${k})`, String(v));
		const typeHow = "type" in e.props ? `the type property (type: ${String(e.props.type)})` : "cr_type" in e.props ? `Charted Roots (cr_type: ${String(e.props.cr_type)})` : e.tags.length ? "its tags" : "its folder or kind";
		fact("Recognised by", typeHow);
		fact("World", e.path.includes("/") ? e.path.split("/")[0] : "the vault root");
		if (file instanceof TFile) {
			const when = (ms: number) => new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
			fact("Created", when(file.stat.ctime));
			fact("Changed", when(file.stat.mtime));
			const out = Object.keys((p.app.metadataCache.resolvedLinks ?? {})[e.path] ?? {}).length;
			const inbound = Object.entries(p.app.metadataCache.resolvedLinks ?? {}).filter(([from, to]) => from !== e.path && to[e.path]).length;
			fact("Links", `${inbound} in · ${out} out`);
			const cache = p.app.metadataCache.getFileCache(file);
			const heads = cache?.headings?.length ?? 0;
			const words = el("span", { cls: "uv-insp-fact-value", text: "…" });
			el("span", { cls: "uv-insp-fact-key", text: "Length" }, facts);
			facts.appendChild(words);
			void p.app.vault.cachedRead(file).then((text) => {
				const bodyText = text.replace(/^---[\s\S]*?---/, "");
				const n = (bodyText.match(/[\p{L}\p{N}'’-]+/gu) ?? []).length;
				words.setText(`${n.toLocaleString()} words${heads ? ` · ${heads} heading${heads === 1 ? "" : "s"}` : ""} · ${(file.stat.size / 1024).toFixed(1)} KB`);
			});
		}
	}
	const read = section(body, "How UniverseView reads it", "scan-eye", "What the plugin takes this note to be, from its type, kind, tags and folder.");
	const facts = el("div", { cls: "uv-insp-facts" }, read);
	const fact = (k: string, v: string | undefined) => {
		if (!v) return;
		el("span", { cls: "uv-insp-fact-key", text: k }, facts);
		el("span", { text: v }, facts);
	};
	fact("Type", e.type === "culture" ? `${TYPE_LABELS[e.type]} · ${GROUP_KINDS[groupKind(p, e)].label}` : TYPE_LABELS[e.type]);
	fact("Kind", kindLabel(e.category));
	if (node) {
		fact("Land", node.nature === "region" ? `Geography: ${tierLabel(node) || "a region"}. Nobody rules it; realms lie in it.` : `Ruled land: ${tierLabel(node) || "a title"}${node.holder ? `, held by ${node.holder.name}` : ""}.`);
		fact("Chain", chainOf(tree, e.key).map((k) => p.index.get(k)?.name).join(" › "));
		if (node.region) fact("Lies in", p.index.get(node.region)?.name);
	}
	fact("Calendar", p.calendars.get(e.calendar).name);
	fact("Tags", e.tags.map((t) => (t.startsWith("#") ? t : "#" + t)).join(" ") || "none");

	// Filed where it belongs?
	const file = p.app.vault.getAbstractFileByPath(e.path);
	const where = section(body, "Where it's filed", "folder-tree", "Its folder, whether it's a folder note, and where UniverseView would place it: inside the folder note of what it belongs to.");
	const crumbs = el("div", { cls: "uv-insp-crumbs" }, where);
	const parts = e.folder ? e.folder.split("/") : [];
	parts.forEach((part, i) => {
		const path = parts.slice(0, i + 1).join("/");
		const note = folderNoteOf(p, path);
		const c = el(note ? "a" : "span", { text: part }, crumbs);
		if (note) c.addEventListener("click", () => ctx.pick(note.path));
		if (i < parts.length - 1) el("span", { cls: "universeview-dash-muted", text: " › " }, crumbs);
	});
	const act = actions(where);
	if (file instanceof TFile) {
		if (isFolderNote(file)) el("div", { cls: "universeview-dash-muted", text: "This is its folder's note: the folder stands for it." }, where);
		else if (e.type === "place" || node) act("folder-input", "Turn into folder note", () => void makeFolderNote(p, file).catch((err: Error) => new Notice(err.message)));
		const pl = placementFor(p, e.type, entityLinks(p, e));
		const here = file.parent?.path ?? "";
		if (pl && pl.inside && here !== pl.base && !here.startsWith(pl.base + "/") && !isFolderNote(file)) {
			el("div", { cls: "uv-insp-hint", text: `Belongs inside ${pl.under} (${pl.folder}).` }, where);
			act("folder-tree", `Move into ${pl.under}`, () => {
				void (async () => {
					if (!(p.app.vault.getAbstractFileByPath(pl.folder) instanceof TFolder)) await p.app.vault.createFolder(pl.folder);
					await p.app.fileManager.renameFile(file, `${pl.folder}/${file.name}`);
					new Notice(`Moved ${e.name} into ${pl.under}.`);
				})();
			});
		}
	}

	const issues = validate(p.index).filter((i) => i.key === e.key);
	const probs = section(body, issues.length ? `Problems (${issues.length})` : "Problems", "shield-check");
	if (!issues.length) el("div", { cls: "universeview-dash-muted", text: "Nothing wrong found." }, probs);
	for (const i of issues) el("div", { cls: `uv-insp-issue is-${i.severity}`, text: i.message }, probs);
}
