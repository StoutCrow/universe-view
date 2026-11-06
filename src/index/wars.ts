import type { Entity, Occupation, Side } from "../types";
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

/** The kinds of event other than wars and battles, sorted: each gets its shape from its place here. */
export function eventCategories(idx: EntityIndex): string[] {
	return [...new Set(idx.all("event").filter((e) => !isBattle(e) && !namedAsWar(e)).flatMap((e) => e.category ?? []))].sort();
}

/** A war's battles, in the order they were fought. */
export function battlesOf(idx: EntityIndex, war: Entity): Entity[] {
	return idx
		.all("event")
		.filter((b) => b.war?.key === war.key && b.key !== war.key)
		.sort((a, b) => (a.start?.start ?? Infinity) - (b.start?.start ?? Infinity));
}

/** An alliance named as a party stands for its members. */
function withMembers(idx: EntityIndex, sides: Side[]): Side[] {
	return sides.flatMap((s) => idx.get(s.party.key)?.alliance?.map((party) => ({ ...s, party })) ?? [s]);
}

/** Who fought: its own `sides:`, or for a battle with none, its war's, without saying who won it. */
export function sidesOf(idx: EntityIndex, e: Entity): Side[] {
	const inherited = !e.sides && isBattle(e) ? warOf(idx, e)?.sides?.map((s) => ({ ...s, outcome: undefined })) : undefined;
	return withMembers(idx, e.sides ?? inherited ?? []);
}

/** The days an occupation ran. Without dates it lasts as long as its war or battle. */
function occupationDays(o: Occupation, e: Entity): [number | undefined, number | undefined] {
	return [o.from?.start ?? e.start?.start, o.to?.end ?? e.end?.end ?? (o.from ? undefined : e.start?.end)];
}

/** The lands occupied on a day. */
export function occupationsAt(idx: EntityIndex, day: number): Occupation[] {
	return idx.all("event").flatMap((e) => (e.occupied ?? []).filter((o) => {
		const [from, to] = occupationDays(o, e);
		return from !== undefined && day >= from && (to === undefined || day <= to);
	}));
}

export interface OccupationSpan extends Occupation {
	/** The war or battle that says so. */
	event: Entity;
	firstDay?: number;
	lastDay?: number;
}

/** Every occupation in the vault by the land's key, oldest first. */
export function occupationsByLand(idx: EntityIndex): Map<string, OccupationSpan[]> {
	const out = new Map<string, OccupationSpan[]>();
	for (const event of idx.all("event")) {
		for (const o of event.occupied ?? []) {
			const [firstDay, lastDay] = occupationDays(o, event);
			out.set(o.land.key, [...(out.get(o.land.key) ?? []), { ...o, event, firstDay, lastDay }]);
		}
	}
	for (const list of out.values()) list.sort((a, b) => (a.firstDay ?? Infinity) - (b.firstDay ?? Infinity));
	return out;
}

/** The days a war ran, from its own dates and its battles'. */
export function warSpan(idx: EntityIndex, war: Entity): [number, number] | undefined {
	const days = [war, ...battlesOf(idx, war)].flatMap((e) => [e.start?.start, e.end?.end ?? e.start?.end]).filter((d): d is number => d !== undefined);
	return days.length ? [Math.min(...days), Math.max(...days)] : undefined;
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
		for (const s of withMembers(idx, b.sides ?? [])) {
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
