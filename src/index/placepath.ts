import type { Entity } from "../types";
import { normaliseKind } from "./placekinds";

/**
 * Where a place sits, from the whole down: Oklahoma City is in Oklahoma County, in Oklahoma, in the United States.
 * Each note says only what it is directly in (`located-in:`); this reads the whole chain from that, and the order
 * of kinds says what can sit inside what. No Obsidian here, so it is all testable.
 */

/** Kinds from the largest to the smallest; kinds on one line are level with each other. A kind not listed has no fixed place. */
export const PLACE_ORDER: string[][] = [
	["galaxy", "nebula", "system"],
	["star", "planet"],
	["moon", "station", "asteroid"],
	["continent", "archipelago"],
	["empire"],
	["kingdom", "country", "nation", "republic", "realm"],
	["state", "province", "duchy", "principality", "march"],
	["county", "barony"],
	["metropolis", "city", "colony", "town"],
	["village", "hamlet", "settlement", "outpost", "district"],
	["castle", "fort", "temple", "campus", "stadium", "airport", "spaceport", "base", "factory", "office", "building", "landmark", "monument", "ruin"],
	["tower", "room"],
];

/** How far down the order a kind is (0 the largest), or undefined when it has no fixed place. */
export function rankOf(kind: string | undefined): number | undefined {
	const w = normaliseKind(kind).kind;
	const i = w ? PLACE_ORDER.findIndex((level) => level.includes(w)) : -1;
	return i < 0 ? undefined : i;
}

type Get = (key: string) => Entity | undefined;

/** A place and everything it is inside, nearest first: [Oklahoma City, Oklahoma County, Oklahoma, United States]. Stops at a loop or a note that does not exist. */
export function placeChain(get: Get, key: string): Entity[] {
	const out: Entity[] = [];
	const seen = new Set<string>();
	for (let cur = get(key); cur && !seen.has(cur.key) && out.length < 16; cur = cur.locatedIn?.resolved ? get(cur.locatedIn.key) : undefined) {
		seen.add(cur.key);
		out.push(cur);
	}
	return out;
}

/** The chain as one line, "Oklahoma City, Oklahoma County, Oklahoma, United States". `skip` leaves off the first names (the place itself). */
export function placeLine(chain: { name: string }[], skip = 0): string {
	return chain.slice(skip).map((p) => p.name).join(", ");
}

/** Which of a chain is of this kind (the nearest one): the state a city is in. */
export function ancestorOfKind(chain: Entity[], kind: string): Entity | undefined {
	const want = normaliseKind(kind).kind;
	return chain.find((p) => normaliseKind(p.category).kind === want);
}

/** The kinds that appear along the chains of these places, largest first: what "show by" can offer. */
export function kindsAlong(chains: Entity[][]): string[] {
	const found = new Map<string, number>();
	for (const chain of chains) {
		for (const p of chain) {
			const k = normaliseKind(p.category).kind;
			const r = rankOf(k);
			if (k && r !== undefined) found.set(k, r);
		}
	}
	return [...found].sort((a, b) => a[1] - b[1]).map(([k]) => k);
}

/** What is wrong with `child` being inside `parent`, if anything: a bigger kind inside a smaller one, or a place inside itself. */
export function orderProblem(child: Entity, parent: Entity): string | undefined {
	if (child.key === parent.key) return `${child.name} is inside itself`;
	const a = rankOf(child.category);
	const b = rankOf(parent.category);
	if (a !== undefined && b !== undefined && a < b) return `${child.name} (${normaliseKind(child.category).kind}) is inside ${parent.name} (${normaliseKind(parent.category).kind}), which is a smaller kind of place`;
	return undefined;
}

/** A loop in the chain (A in B in A): the places in it, or undefined. */
export function chainLoop(get: Get, key: string): Entity[] | undefined {
	const seen = new Map<string, number>();
	const path: Entity[] = [];
	for (let cur = get(key); cur; cur = cur.locatedIn?.resolved ? get(cur.locatedIn.key) : undefined) {
		const at = seen.get(cur.key);
		if (at !== undefined) return path.slice(at);
		seen.set(cur.key, path.length);
		path.push(cur);
		if (path.length > 64) return undefined;
	}
	return undefined;
}

/** The events at a place or at any place inside it, each once. */
export function eventsWithin(idx: { subPlacesOf: Map<string, Set<string>>; events(key: string): Entity[] }, key: string): Entity[] {
	const out = new Set<Entity>();
	for (const k of [key, ...placesInside(idx.subPlacesOf, key)]) for (const e of idx.events(k)) out.add(e);
	return [...out];
}

/** Every place inside this one, at any depth (not the place itself). */
export function placesInside(subs: Map<string, Set<string>>, key: string): Set<string> {
	const out = new Set<string>();
	const todo = [key];
	while (todo.length) {
		for (const k of subs.get(todo.pop()!) ?? []) {
			if (k === key || out.has(k)) continue;
			out.add(k);
			todo.push(k);
		}
	}
	return out;
}
