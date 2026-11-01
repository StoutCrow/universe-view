/**
 * Fog of war: what one person could know about by a given day. No Obsidian here, so it's testable.
 *
 * They know: themselves; what they're told (`knows:` / `known-by:`, from its date); the events they
 * took part in, with those events' places, groups and the others there; their family; the people
 * they have relationships with; their groups, the groups' leaders and the places they hold; the places they were born, died
 * or lived in, and the regions those places lie in; the story chapters they appear in, with the
 * places and people there; and, if `famous` is on, every event of importance 5 once it has happened.
 */
import type { Entity, Scene, TimedRef } from "../types";

export interface KnowledgeIndex {
	all(type?: Entity["type"]): Entity[];
	get(key: string): Entity | undefined;
	children(key: string): string[];
	partners(key: string): TimedRef[];
	members(key: string): { key: string; link: TimedRef }[];
	knowledgeOf: Map<string, TimedRef[]>;
	relationsOf: Map<string, TimedRef[]>;
	scenes: Scene[];
}

export interface KnowledgeOptions {
	/** Universal day: only what they knew by then (all they ever learn when left out). */
	at?: number;
	/** Events of importance 5 are common knowledge once they've happened. */
	famous?: boolean;
}

const LEADER = /\b(king|queen|ruler|leader|head|chief|lord|lady|master|commander|captain|general|emperor|empress|prince|princess|duke|duchess|chancellor|abbot|bishop|pope|regent|governor|mayor)\b/i;

export function knownTo(idx: KnowledgeIndex, person: string, opts: KnowledgeOptions = {}): Set<string> {
	const at = opts.at;
	const me = idx.get(person);
	const out = new Set<string>();
	if (!me) return out;
	const add = (k: string | undefined) => {
		if (k && idx.get(k)) out.add(k);
	};
	const by = (d?: { start: number }) => at === undefined || !d || d.start <= at;
	const since = (r: { from?: { start: number } }) => at === undefined || !r.from || r.from.start <= at;
	add(person);
	// Told about it.
	for (const k of idx.knowledgeOf.get(person) ?? []) if (since(k)) add(k.ref.key);
	// Family.
	for (const p of [...me.parents, ...me.adoptiveParents]) add(p.key);
	for (const c of idx.children(person)) if (by(idx.get(c)?.start)) add(c);
	for (const p of idx.partners(person)) if (since(p)) add(p.ref.key);
	for (const p of me.parents) for (const s of idx.children(p.key)) if (by(idx.get(s)?.start)) add(s);
	// Relationships.
	for (const r of idx.relationsOf.get(person) ?? []) if (since(r)) add(r.ref.key);
	// Their groups, and who leads them.
	for (const c of me.cultures) {
		if (!since(c)) continue;
		add(c.ref.key);
		for (const m of idx.members(c.ref.key)) {
			// Its leaders, and the places it holds (you know your own realm).
			if (m.link.role && LEADER.test(m.link.role)) add(m.key);
			else if (idx.get(m.key)?.type === "place") add(m.key);
		}
	}
	// Places in their life.
	for (const p of [me.birthPlace, me.deathPlace, ...me.places]) add(p?.key);
	// What they took part in, and what came with it.
	for (const e of idx.all("event")) {
		if (!e.participants.some((p) => p.key === person) || !by(e.start)) continue;
		add(e.key);
		for (const p of e.places) add(p.key);
		for (const p of e.participants) add(p.key);
		for (const c of e.cultures) add(c.ref.key);
	}
	// The chapters they're in.
	for (const s of idx.scenes) {
		if (!s.cast.some((c) => c.key === person) || !by(s.date)) continue;
		add(s.path);
		for (const p of s.places) add(p.key);
		for (const c of s.cast) add(c.key);
	}
	// Famous events everyone hears of.
	if (opts.famous !== false) for (const e of idx.all("event")) if (e.importance >= 5 && e.start && by(e.start)) add(e.key);
	// Knowing a place means knowing the land it lies in.
	for (const k of [...out]) {
		for (let cur = idx.get(k)?.locatedIn, i = 0; cur && i < 12; cur = idx.get(cur.key)?.locatedIn, i++) add(cur.key);
	}
	return out;
}
