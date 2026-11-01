import type { Entity } from "../types";
import type { EntityIndex } from "./EntityIndex";
import { victorsOf } from "./periods";

/**
 * Wars and battles. A battle is an event called (or kinded) a battle, siege, skirmish…; a war is
 * one called a war, rebellion, campaign…, or any event battles name as their `war:`. A battle's
 * `sides:` say who fought and who won; a war's sides are its own, or gathered from its battles.
 */

const BATTLE = /\b(battle|siege|skirmish|sack|assault|ambush|engagement|clash|stand|rout|storming|sortie|duel)\b/i;
const WAR = /\b(war|wars|rebellion|revolt|uprising|invasion|crusade|conflict|campaign|conquest|feud|insurrection)\b/i;

export function isBattle(e: Entity): boolean {
	return e.type === "event" && (BATTLE.test(e.category ?? "") || (!WAR.test(e.category ?? "") && BATTLE.test(e.name)) || e.props.battle === true);
}

/** Called or kinded a war, rebellion, campaign… (without looking for battles that name it). */
export function namedAsWar(e: Entity): boolean {
	return e.type === "event" && !isBattle(e) && WAR.test(`${e.category ?? ""} ${e.name}`);
}

export function isWar(idx: EntityIndex, e: Entity): boolean {
	if (e.type !== "event" || isBattle(e)) return false;
	return namedAsWar(e) || idx.all("event").some((b) => b.war?.key === e.key);
}

/** Every war's battles at once, by the war's key (one pass, for the map). */
export function battlesByWar(idx: EntityIndex): Map<string, Entity[]> {
	const out = new Map<string, Entity[]>();
	for (const b of idx.all("event")) {
		const w = warOf(idx, b);
		if (!w) continue;
		const list = out.get(w.key) ?? [];
		list.push(b);
		out.set(w.key, list);
	}
	for (const list of out.values()) list.sort((a, b) => (a.start?.start ?? Infinity) - (b.start?.start ?? Infinity));
	return out;
}

/** The war a battle was part of, when its `war:` (or `part-of:`) names an event. */
export function warOf(idx: EntityIndex, e: Entity): Entity | undefined {
	const w = e.war ? idx.get(e.war.key) : undefined;
	return w && w.type === "event" && w.key !== e.key ? w : undefined;
}

/** A war's battles, in the order they were fought. */
export function battlesOf(idx: EntityIndex, war: Entity): Entity[] {
	return idx
		.all("event")
		.filter((b) => b.war?.key === war.key && b.key !== war.key)
		.sort((a, b) => (a.start?.start ?? Infinity) - (b.start?.start ?? Infinity));
}

/** Who won: the war's own `sides:` when marked, else the side that won most of its battles. */
export function victorOf(idx: EntityIndex, e: Entity): Entity | undefined {
	const own = victorsOf(e.sides)[0];
	if (own) return idx.get(own.party.key);
	if (isBattle(e)) return undefined;
	const tally = new Map<string, number>();
	for (const b of battlesOf(idx, e)) for (const v of victorsOf(b.sides)) tally.set(v.party.key, (tally.get(v.party.key) ?? 0) + 1);
	const best = [...tally].sort((a, b) => b[1] - a[1])[0];
	return best ? idx.get(best[0]) : undefined;
}

/** Battles won and lost by each party in a war, for the inspector's tally. */
export function warTally(idx: EntityIndex, war: Entity): { party: Entity; won: number; lost: number }[] {
	const rows = new Map<string, { party: Entity; won: number; lost: number }>();
	for (const b of battlesOf(idx, war)) {
		for (const s of b.sides ?? []) {
			const p = idx.get(s.party.key);
			if (!p) continue;
			const r = rows.get(p.key) ?? { party: p, won: 0, lost: 0 };
			if (/^(won|win|victor)/.test(s.outcome ?? "")) r.won++;
			else if (/^(lost|loss|defeat|routed)/.test(s.outcome ?? "")) r.lost++;
			rows.set(p.key, r);
		}
	}
	return [...rows.values()].sort((a, b) => b.won - a.won || a.lost - b.lost);
}
