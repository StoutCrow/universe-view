/**
 * Story prompts built from a world's own data: rivalries, successions, people coming of age,
 * possible marriages, quiet stretches of history, empty regions. No Obsidian here.
 */
import type { Entity } from "../types";

const YEAR = 365.25;

export interface StoryPrompt {
	kind: string;
	title: string;
	text: string;
	/** Universal day it would happen. */
	day?: number;
	calendar?: string;
	people: string[];
	places: string[];
	cultures: string[];
}

export interface PromptIndex {
	all(type?: Entity["type"]): Entity[];
	get(key: string): Entity | undefined;
	children(key: string): string[];
	partners(key: string): { ref: { key: string } }[];
	members(key: string): { key: string; link: { role?: string; from?: { start: number }; to?: { end: number } } }[];
	events(key: string): Entity[];
	subPlacesOf: Map<string, Set<string>>;
}

const RIVAL = /\b(rival|enemy|enemies|foe|war|hostile|feud)\b/i;
const RULER = /\b(king|queen|monarch|ruler|emperor|empress|lord|lady|head|chief|leader|grand ?master|duke|duchess|prince|princess|regent)\b/i;

/** A few prompts, shuffled; `fmt` writes a day in a calendar. */
export function storyPrompts(idx: PromptIndex, scope: string | undefined, fmt: (day: number, cal: string) => string, rand: () => number = Math.random, count = 5): StoryPrompt[] {
	const inScope = (e: Entity) => !scope || e.path.startsWith(scope + "/");
	const people = idx.all("person").filter(inScope);
	const cultures = idx.all("culture").filter(inScope);
	const events = idx.all("event").filter(inScope).filter((e) => e.start).sort((a, b) => a.start!.start - b.start!.start);
	const out: StoryPrompt[] = [];
	const alive = (p: Entity, day: number) => (!p.start || p.start.start <= day) && (!p.end || p.end.end > day);
	const pickOne = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)];

	// Rivals come to blows when both exist, after their last recorded clash.
	for (const c of cultures) {
		for (const r of c.relatedCultures) {
			if (!RIVAL.test(r.kind ?? "")) continue;
			const other = idx.get(r.ref.key);
			if (!other) continue;
			const shared = idx.events(c.key).filter((ev) => ev.cultures.some((x) => x.ref.key === other.key) && ev.start);
			const last = shared.reduce((m, ev) => Math.max(m, ev.start!.end), c.start?.start ?? other.start?.start ?? NaN);
			if (!Number.isFinite(last)) continue;
			const day = last + (5 + rand() * 20) * YEAR;
			if ((c.end && c.end.end < day) || (other.end && other.end.end < day)) continue;
			out.push({ kind: "rivals", title: `${c.name} and ${other.name} clash again`, text: `The old ${r.kind && !/^rival$/i.test(r.kind) ? r.kind : "rivalry"} between ${c.name} and ${other.name} flares up${shared.length ? ` again, the first time since ${shared[shared.length - 1].name}` : ""}. Who strikes first, and where?`, day, calendar: c.calendar, people: [], places: [], cultures: [c.name, other.name] });
		}
	}

	// A ruler dies leaving several living children: a succession dispute.
	for (const c of cultures) {
		for (const m of idx.members(c.key)) {
			const p = idx.get(m.key);
			if (!p || p.type !== "person" || !p.end || !RULER.test(m.link.role ?? "")) continue;
			const heirs = idx.children(p.key).map((k) => idx.get(k)).filter((k): k is Entity => !!k && alive(k, p.end!.end));
			if (heirs.length < 2) continue;
			out.push({ kind: "succession", title: `Who succeeds ${p.name}?`, text: `${p.name}, ${m.link.role} of ${c.name}, dies leaving ${heirs.length} living children: ${heirs.map((h) => h.name).join(", ")}. Does the succession pass quietly?`, day: p.end.end + 30, calendar: p.calendar, people: [p.name, ...heirs.map((h) => h.name)], places: [], cultures: [c.name] });
		}
	}

	// Someone with nothing recorded in their youth comes of age.
	for (const p of people) {
		if (!p.start) continue;
		const day = p.start.start + 16 * YEAR;
		if (p.end && p.end.end < day) continue;
		const youth = idx.events(p.key).some((ev) => ev.start && ev.start.start < p.start!.start + 22 * YEAR && ev.start.start > p.start!.start + 10 * YEAR);
		if (youth) continue;
		out.push({ kind: "age", title: `${p.name} comes of age`, text: `${p.name} turns sixteen around ${fmt(day, p.calendar)}. What marks it: a first battle, a betrothal, a falling-out at home?`, day, calendar: p.calendar, people: [p.name], places: [], cultures: p.cultures.slice(0, 1).map((c) => c.ref.name) });
	}

	// Two unmarried people of similar age from different groups: an alliance by marriage.
	const single = people.filter((p) => p.start && !idx.partners(p.key).length && p.cultures.length);
	for (let tries = 0; tries < 30 && single.length > 1; tries++) {
		const a = pickOne(single);
		const b = pickOne(single);
		if (a === b || a.gender === b.gender || a.cultures[0].ref.key === b.cultures[0].ref.key || Math.abs(a.start!.start - b.start!.start) > 8 * YEAR) continue;
		const day = Math.max(a.start!.start, b.start!.start) + 20 * YEAR;
		if (!alive(a, day) || !alive(b, day)) continue;
		out.push({ kind: "marriage", title: `A match between ${a.cultures[0].ref.name} and ${b.cultures[0].ref.name}`, text: `${a.name} and ${b.name} are of an age and both unmarried. Would a marriage bind their families, and who would oppose it?`, day, calendar: a.calendar, people: [a.name, b.name], places: [], cultures: [a.cultures[0].ref.name, b.cultures[0].ref.name] });
		break;
	}

	// The longest quiet stretch in recorded history.
	let gap = { a: 0, b: 0 };
	for (let i = 1; i < events.length; i++) {
		const a = events[i - 1].end?.end ?? events[i - 1].start!.end;
		const b = events[i].start!.start;
		if (b - a > gap.b - gap.a) gap = { a, b };
	}
	if (gap.b - gap.a > 20 * YEAR) {
		const day = gap.a + (gap.b - gap.a) * (0.3 + rand() * 0.4);
		const cal = events[0].calendar;
		out.push({ kind: "gap", title: "A quiet century?", text: `Nothing is recorded between ${fmt(gap.a, cal)} and ${fmt(gap.b, cal)}. Something must have happened around ${fmt(day, cal)}: a plague, a schism, a discovery?`, day, calendar: cal, people: [], places: [], cultures: [] });
	}

	// A region with nothing in it yet.
	for (const r of idx.all("place").filter(inScope)) {
		if ((idx.subPlacesOf.get(r.key)?.size ?? 0) > 0 || !/region|province|kingdom|realm|country|island|forest|valley/.test(r.category ?? "")) continue;
		out.push({ kind: "settle", title: `Settling ${r.name}`, text: `${r.name} has no towns or landmarks yet. Who founds the first settlement there, and why there?`, people: [], places: [r.name], cultures: r.cultures.slice(0, 1).map((c) => c.ref.name), calendar: r.calendar });
	}

	// Shuffle and keep a few, at most two of each kind of prompt.
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(rand() * (i + 1));
		[out[i], out[j]] = [out[j], out[i]];
	}
	const perKind = new Map<string, number>();
	return out.filter((p) => {
		const n = perKind.get(p.kind) ?? 0;
		perKind.set(p.kind, n + 1);
		return n < 2;
	}).slice(0, count);
}
