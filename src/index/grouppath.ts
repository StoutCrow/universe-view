import type { Entity, TimedRef } from "../types";
import { placesInside } from "./placepath";

/**
 * Where a group sits among groups: a cadet house is a branch of its main house, a house is a branch of a realm's
 * ruling line, a guild is part of a bigger order. A group's `parent-cultures:` (or `branch-of:`) is the one step up;
 * this reads the whole chain, and rolls members and events up from the branches. No Obsidian here, so it is testable.
 */

type Get = (key: string) => Entity | undefined;

/** A group and what it is a branch of, nearest first (the first parent that exists at each step). Stops at a loop. */
export function groupChain(get: Get, key: string): Entity[] {
	const out: Entity[] = [];
	const seen = new Set<string>();
	for (let cur = get(key); cur && !seen.has(cur.key) && out.length < 16; cur = cur.parentCultures.map((r) => (r.resolved ? get(r.key) : undefined)).find((x) => !!x)) {
		seen.add(cur.key);
		out.push(cur);
	}
	return out;
}

/** Every branch under a group, at any depth (not the group itself). */
export function branchesOf(childrenOf: Map<string, Set<string>>, key: string): Set<string> {
	return placesInside(childrenOf, key);
}

interface Roll {
	members(key: string): { key: string; link: TimedRef }[];
	childCulturesOf: Map<string, Set<string>>;
}

/** The members of a group, then those of its branches (each person once, with the branch they came from). */
export function membersWithin(idx: Roll, get: Get, key: string): { key: string; link: TimedRef; via?: Entity }[] {
	const seen = new Set<string>();
	const out: { key: string; link: TimedRef; via?: Entity }[] = [];
	for (const m of idx.members(key)) {
		if (seen.has(m.key)) continue;
		seen.add(m.key);
		out.push(m);
	}
	for (const b of branchesOf(idx.childCulturesOf, key)) {
		const via = get(b);
		for (const m of idx.members(b)) {
			if (seen.has(m.key)) continue;
			seen.add(m.key);
			out.push({ ...m, via });
		}
	}
	return out;
}

/** The events of a group and of its branches, each once. */
export function eventsOfGroup(idx: { events(key: string): Entity[]; childCulturesOf: Map<string, Set<string>> }, key: string): Entity[] {
	const out = new Set<Entity>();
	for (const k of [key, ...branchesOf(idx.childCulturesOf, key)]) for (const e of idx.events(k)) out.add(e);
	return [...out];
}
