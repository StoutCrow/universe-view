import { revealInExplorer } from "../internals";
import { TFile } from "obsidian";
import type ChroniclePlugin from "../main";
import type { Entity } from "../types";
import { formatSpan } from "../dates/parser";
import { tierLabel } from "../index/realms";
import { TYPE_ICONS, TYPE_LABELS, copyLink, el, entityColor, glyph, icon, openEntity, resourceUrl } from "../render/common";
import { GROUP_KINDS, groupKind } from "../render/houses";
import { isFolderNote } from "./foldernotes";
import { changeNoteIcon, noteIcons } from "./icons";

const YEAR = 365.25;

/** The note's aliases, from `aliases:` / `alias:`. */
export function aliasesOf(e: Entity): string[] {
	return ([] as unknown[]).concat(e.props.aliases ?? e.props.alias ?? []).filter((a): a is string => typeof a === "string" && !!a.trim() && a.trim() !== e.name);
}

/**
 * Who or what a note is, at a glance: its picture, name and other names, what it is (type, kind,
 * tier, region or realm), its span with an age or length, where it's filed, and one-click ways to
 * every view it appears in.
 */
export function identityHeader(p: ChroniclePlugin, parent: HTMLElement, e: Entity, pick: (key: string) => void) {
	const box = el("div", { cls: "uv-id" }, parent);
	box.style.setProperty("--id-color", entityColor(p, e));
	const tree = p.realms();
	const node = tree.nodes.get(e.key);
	const cal = p.calendars.get(e.calendar);
	const today = p.todayFor(e.path.split("/")[0] ?? "", cal.id);

	// Picture, else its icons; click it to give the note an icon of its own.
	const pic = el("div", { cls: "uv-id-pic", attr: { "aria-label": "Change its icon", role: "button" } }, box);
	pic.addEventListener("click", () => {
		const f = p.app.vault.getAbstractFileByPath(e.path);
		if (f instanceof TFile) changeNoteIcon(p, f);
	});
	const url = resourceUrl(p, e.image ?? e.logo);
	if (url) el("img", { attr: { src: url, alt: "" } }, pic);
	else {
		const { type, kind } = noteIcons(p, e.key);
		if (!(kind && glyph(pic, kind))) icon(pic, type ?? TYPE_ICONS[e.type]);
	}

	const main = el("div", { cls: "uv-id-main" }, box);
	el("div", { cls: "uv-id-name", text: e.name }, main);
	const aka = aliasesOf(e);
	const others = [...new Set([...(e.names ?? []).map((n) => n.name).filter((n) => n !== e.name), ...aka])];
	if (others.length) el("div", { cls: "uv-id-aka", text: `also ${others.slice(0, 4).join(", ")}${others.length > 4 ? ` +${others.length - 4}` : ""}` }, main);

	// What it is.
	const badges = el("div", { cls: "uv-id-badges" }, main);
	const badge = (text: string, ic?: string, cls = "") => {
		const b = el("span", { cls: `uv-id-badge ${cls}`.trim() }, badges);
		if (ic) icon(el("span", {}, b), ic);
		el("span", { text }, b);
	};
	badge(e.type === "culture" ? GROUP_KINDS[groupKind(p, e)].label : TYPE_LABELS[e.type], e.type === "culture" ? GROUP_KINDS[groupKind(p, e)].icon : TYPE_ICONS[e.type]);
	// Its kind, unless the tier badge says the same ("County" once, with its crown).
	const tier = node ? tierLabel(node) || (node.nature === "region" ? "Region" : "Title") : undefined;
	if (e.category && e.category !== groupKind(p, e) && e.category.toLowerCase() !== tier?.toLowerCase()) badge(e.category.charAt(0).toUpperCase() + e.category.slice(1));
	if (node && tier) badge(tier, node.nature === "region" ? "mountain" : "crown", node.nature === "region" ? "is-region" : "is-realm");
	if (node?.holder) badge(`held by ${node.holder.name}`, "user-round");
	const file = p.app.vault.getAbstractFileByPath(e.path);
	if (isFolderNote(file)) badge("Folder note", "folder");
	if (e.issues.length) badge(`${e.issues.length} problem${e.issues.length === 1 ? "" : "s"}`, "alert-triangle", "is-warning");

	// When, and how long: an age for a person, a length for anything else.
	if (e.start || e.end) {
		const span = formatSpan(e.start, e.end, cal);
		let howLong = "";
		const a = e.start?.start;
		const b = e.end?.end ?? (e.end ? undefined : today);
		if (a !== undefined && b !== undefined && b >= a) {
			const years = Math.floor((b - a) / YEAR);
			if (e.type === "person") howLong = e.end ? `died aged ${years}` : `aged ${years}`;
			else if (e.type !== "event" || e.end) howLong = e.end ? `${years} year${years === 1 ? "" : "s"}` : `${years} years and counting`;
		}
		el("div", { cls: "uv-id-span", text: [span, howLong].filter(Boolean).join(" · ") }, main);
	}

	// Where it's filed: its folders, a folder with a note of its own opening that note.
	const crumbs = el("div", { cls: "uv-id-path" }, main);
	const parts = e.folder ? e.folder.split("/") : [];
	const from = Math.max(0, parts.length - 3);
	if (from > 0) el("span", { text: "… › " }, crumbs);
	for (let i = from; i < parts.length; i++) {
		const fn = p.app.vault.getAbstractFileByPath(`${parts.slice(0, i + 1).join("/")}/${parts[i]}.md`);
		const known = fn instanceof TFile && p.index.get(fn.path) ? fn : undefined;
		const c = el(known ? "a" : "span", { text: parts[i] }, crumbs);
		if (known) c.addEventListener("click", () => pick(known.path));
		if (i < parts.length - 1) el("span", { text: " › " }, crumbs);
	}

	// Every view it's in, one click each.
	const acts = el("div", { cls: "uv-id-actions" }, box);
	const act = (ic: string, label: string, run: (evt: MouseEvent) => void) => {
		const b = el("button", { cls: "clickable-icon", attr: { "aria-label": label } }, acts);
		icon(b, ic);
		b.addEventListener("click", run);
	};
	act("file-text", "Open the note", (evt) => openEntity(p, e.key, evt));
	if (e.type === "place" || e.territories.length || e.position || e.coords || node) act("map", "Show on the map", () => void p.openMap(e.key));
	if (e.start || e.end || e.type === "person" || e.type === "culture") act("calendar-range", "Show on the timeline", () => void p.openTimeline({ focus: e.key }));
	if (e.type === "person") act("git-fork", "Family tree", () => void p.openFamilyTree(e.key));
	if (e.type === "culture") act("git-branch", "Lineage of groups", () => void p.openLineage(e.key));
	if (node) act("crown", "Realm tree", () => void p.openOrgChart(e.key));
	act("waypoints", "Connections", () => void p.openNetwork(e.key));
	act("link", "Copy a link to it", () => {
		copyLink(p, e.key);
	});
	act("folder-open", "Show in the file explorer", () => {
		const f = p.app.vault.getAbstractFileByPath(e.path);
		if (f) revealInExplorer(p.app, f);
	});
}
