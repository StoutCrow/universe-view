import type UniverseViewPlugin from "../main";
import type { Entity } from "../types";
import { descendantsOf } from "./realms";
import { ringArea, type P2 } from "./geometry";
import { totalPopulation } from "./tidy";
import { kmPerUnit, parseScale } from "../render/travel";

export interface RealmStats {
	/** Land on the map, in the map's own units squared; `km2` when the map has a real scale. */
	area: number;
	km2?: number;
	population?: number;
	/** Titles and regions under it. */
	titles: number;
	/** Places in its lands (titles that are places, and places located in them). */
	places: number;
	/** People tied to its lands: living or born there, or members of it. */
	people: number;
}

export type StatKey = "area" | "population" | "places" | "people" | "titles";
export const STAT_NAMES: [StatKey, string][] = [["area", "Area"], ["population", "Population"], ["places", "Places"], ["people", "People"], ["titles", "Titles under it"]];

/**
 * A realm's size, counted over everything under it: area from its own and its vassals' current
 * borders on a map (each spot once: a vassal's land inside its liege's isn't counted twice when the
 * liege has an area of its own), population, places, people and titles.
 */
export function realmStats(plugin: UniverseViewPlugin, key: string, map?: string, at?: number): RealmStats {
	const idx = plugin.index;
	const tree = plugin.realms(at);
	const lands = [key, ...descendantsOf(tree, key)];
	const set = new Set(lands);
	// Area: the realm's own areas, plus those of vassals that lie outside it (split off, or it has none).
	const current = (e: Entity) => e.territories.filter((t) => t.points.length > 2 && (!map || t.map === map || t.map === "*") && !(at !== undefined && ((t.from && t.from.start > at) || (t.to && t.to.end < at))) && (at !== undefined || !t.to));
	let area = 0;
	const own = idx.get(key);
	const ownRings = own ? current(own).map((t) => t.points as P2[]) : [];
	for (const r of ownRings) area += ringArea(r);
	const inside = (r: P2[]) => {
		const mid: P2 = [r.reduce((s, p) => s + p[0], 0) / r.length, r.reduce((s, p) => s + p[1], 0) / r.length];
		return ownRings.some((o) => {
			let hit = false;
			for (let i = 0, j = o.length - 1; i < o.length; j = i++) if (o[i][1] > mid[1] !== o[j][1] > mid[1] && mid[0] < ((o[j][0] - o[i][0]) * (mid[1] - o[i][1])) / (o[j][1] - o[i][1]) + o[i][0]) hit = !hit;
			return hit;
		});
	};
	for (const k of lands.slice(1)) {
		const e = idx.get(k);
		if (!e) continue;
		// Only the top-most land with an area counts, so nested counties aren't added on top of their duchy.
		const hasLiegeArea = (() => {
			for (let u = tree.nodes.get(k)?.under; u && u !== key; u = tree.nodes.get(u)?.under) if (idx.get(u) && current(idx.get(u)!).length) return true;
			return false;
		})();
		if (hasLiegeArea) continue;
		for (const t of current(e)) if (!inside(t.points)) area += ringArea(t.points);
	}
	const mapNote = map ? idx.get(map) : undefined;
	const scale = mapNote ? parseScale(mapNote.props.scale, mapNote.props.unit ?? mapNote.props.units) : undefined;
	const k = scale && kmPerUnit(scale.unit);
	const km2 = scale && k ? area * (scale.perPx * k) ** 2 : undefined;
	// Places: titles that are places, and any place located in one of its lands.
	const placeSet = new Set<string>();
	for (const k2 of lands) if (idx.get(k2)?.type === "place") placeSet.add(k2);
	for (const p of idx.all("place")) if (p.locatedIn?.resolved && set.has(p.locatedIn.key)) placeSet.add(p.key);
	placeSet.delete(key);
	// People: born, living or tied there, members of it, or holding any of its titles.
	const people = new Set<string>();
	const where = new Set([...set, ...placeSet]);
	for (const p of idx.all("person")) {
		if ((p.birthPlace?.resolved && where.has(p.birthPlace.key)) || p.places.some((r) => r.resolved && where.has(r.key)) || p.cultures.some((c) => set.has(c.ref.key))) people.add(p.key);
	}
	for (const k2 of lands) {
		const h = tree.nodes.get(k2)?.holder;
		if (h?.resolved) people.add(h.key);
	}
	const pop = totalPopulation(idx, key);
	return { area, km2, population: pop?.total, titles: lands.length - 1, places: placeSet.size, people: people.size };
}

/** A statistic as words: "12,400 km²", "3,200 people". */
export function statText(s: RealmStats, k: StatKey): string {
	switch (k) {
		case "area":
			return s.km2 !== undefined ? `${Math.round(s.km2).toLocaleString()} km²` : s.area ? `${Math.round(s.area).toLocaleString()} sq. units` : "no borders drawn";
		case "population":
			return s.population !== undefined ? s.population.toLocaleString() : "unknown";
		default:
			return s[k].toLocaleString();
	}
}

export function statValue(s: RealmStats, k: StatKey): number | undefined {
	if (k === "area") return s.km2 ?? (s.area || undefined);
	if (k === "population") return s.population;
	return s[k];
}
