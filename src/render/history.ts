import type UniverseViewPlugin from "../main";
import { formatDay, formatSpan, parseSpan } from "../dates/parser";
import type { EntityIndex } from "../index/EntityIndex";
import { holdingsOf } from "../index/realms";
import { renamings } from "../index/renames";
import { asText } from "../index/text";
import { eventCategories, isBattle, namedAsWar, occupationsByLand, sidesOf, type OccupationSpan } from "../index/wars";
import type { Entity } from "../types";
import { categoryOf, shapeFor, type ItemShape } from "./categories";

/**
 * What happened to a nation, for its bar. The timeline and the lineage both draw from here, so the
 * same note gives the same marks in the same shapes in each.
 */

export type HistoryKind = "event" | "rename" | "reign" | "occupation";

export interface HistoryMark {
	kind: HistoryKind;
	day: number;
	shape: ItemShape;
	text: string;
	/** A renaming's new name, shown beside it where there's room. */
	name?: string;
	category: string;
	categoryId: string;
	/** The note it opens. */
	key: string;
}

export interface Reign {
	who: Entity;
	title?: Entity;
	from: number;
	to: number;
	approx: boolean;
	text: string;
	label: string;
}

interface Cached {
	version: number;
	events: Map<string, Entity[]>;
	reigns: Reign[];
	occupied: Map<string, OccupationSpan[]>;
	categories: string[];
}

const LEADER_KINDS = new Set(["leader", "ruler", "head", "founder"]);
const cache = new WeakMap<EntityIndex, Cached>();

/** Reigns written on the ruler (`reign: 1258 - 1291`), over their title, or else the greatest their house holds. */
function readReigns(plugin: UniverseViewPlugin): Reign[] {
	const idx = plugin.index;
	const tree = plugin.realms();
	const out: Reign[] = [];
	for (const p of idx.all("person")) {
		const written = p.props.reign ?? p.props.reigned;
		if (written === undefined || written === null || written === "") continue;
		const span = parseSpan(written, plugin.calendars.get(p.calendar));
		const from = span.start?.start;
		if (from === undefined) continue;
		const to = span.end?.end ?? p.end?.end ?? plugin.openEndOf(p) ?? from;
		const held = holdingsOf(tree, p.key);
		const titles = held.length ? held : p.cultures.flatMap((c) => holdingsOf(tree, c.ref.key));
		const title = titles.map((k) => idx.get(k)).sort((x, y) => (tree.nodes.get(x?.key ?? "")?.rank ?? 9) - (tree.nodes.get(y?.key ?? "")?.rank ?? 9))[0];
		out.push({ who: p, title, from, to: Math.max(from, to), approx: !!span.start?.approx, text: `${p.name} reigns${title ? ` over ${title.name}` : ""}: ${asText(written)}`, label: title ? `${p.name} · ${title.name}` : p.name });
	}
	return out;
}

function cached(plugin: UniverseViewPlugin): Cached {
	const idx = plugin.index;
	const have = cache.get(idx);
	if (have?.version === idx.version) return have;
	const events = new Map<string, Entity[]>();
	for (const e of idx.all("event")) {
		for (const k of new Set([...sidesOf(idx, e).map((s) => s.party.key), ...e.cultures.map((c) => c.ref.key), ...e.places.map((p) => p.key)])) {
			events.set(k, [...(events.get(k) ?? []), e]);
		}
	}
	const fresh = { version: idx.version, events, reigns: readReigns(plugin), occupied: occupationsByLand(idx), categories: eventCategories(idx) };
	cache.set(idx, fresh);
	return fresh;
}

export function writtenReigns(plugin: UniverseViewPlugin): Reign[] {
	return cached(plugin).reigns;
}

/** Everything that happened to a nation, oldest first. `within` keeps events to the days it existed. */
export function historyOf(plugin: UniverseViewPlugin, e: Entity, within?: [number, number]): HistoryMark[] {
	const data = cached(plugin);
	const cal = plugin.calendars.get(e.calendar);
	const out: HistoryMark[] = [];
	const heir = (day: number, text: string, key: string) => {
		if (out.some((m) => m.kind === "reign" && m.day === day && m.key === key)) return;
		out.push({ kind: "reign", day, shape: shapeFor("reign", "kind:reign", undefined), text, category: "Heirs and rulers", categoryId: "kind:reign", key });
	};
	for (const r of e.relations) if (LEADER_KINDS.has(r.kind ?? "") && r.from) heir(r.from.start, `${r.ref.name} leads from ${formatSpan(r.from, undefined, cal)}`, r.ref.key);
	for (const h of e.holders ?? []) if (h.from) heir(h.from.start, `${h.ref.name} holds it from ${formatSpan(h.from, undefined, cal)}`, h.ref.key);
	for (const r of data.reigns) if (r.title?.key === e.key) heir(r.from, r.text, r.who.key);
	for (const r of renamings(e)) {
		out.push({ kind: "rename", day: r.day, shape: shapeFor("rename", "kind:rename", undefined), text: `${r.before ? `${r.before} becomes ` : ""}${r.name}, ${formatDay(r.day, cal, "year")}`, name: r.name, category: "Renamings", categoryId: "kind:rename", key: e.key });
	}
	for (const o of data.occupied.get(e.key) ?? []) {
		if (o.firstDay === undefined) continue;
		out.push({ kind: "occupation", day: o.firstDay, shape: shapeFor("occupation", "kind:occupation", undefined), text: `${o.land.name} held by ${o.by.name}: ${formatSpan(o.from ?? o.event.start, o.to ?? o.event.end, cal)}, in ${o.event.name}`, category: "Occupations", categoryId: "kind:occupation", key: o.event.key });
	}
	for (const ev of data.events.get(e.key) ?? []) {
		const day = ev.start?.start;
		if (day === undefined || (within && (day < within[0] || day > within[1]))) continue;
		const war = isBattle(ev) ? "battle" : namedAsWar(ev) ? "war" : undefined;
		const [categoryId, category] = categoryOf("event", ev.category ?? war);
		out.push({ kind: "event", day, shape: shapeFor("event", categoryId, war, data.categories), text: `${ev.name} · ${formatSpan(ev.start, ev.end, plugin.calendars.get(ev.calendar))}`, category, categoryId, key: ev.key });
	}
	return out.sort((a, b) => a.day - b.day);
}
