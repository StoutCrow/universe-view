import type { ChronDate, Entity, Ref } from "../types";

/** One place a person has been, and why we know. */
export interface Stay {
	place: Ref;
	how: "born" | "lived" | "event" | "died";
	/** The day it began, when dated. */
	day?: number;
	from?: ChronDate;
	to?: ChronDate;
	/** The event, for `how: "event"`. */
	event?: Entity;
}

/** When a person was at an event: the whole of it unless the note gave them dates (`[[Anna]] (1066-1068)`). */
export function presenceIn(e: Entity, key: string): { from?: ChronDate; to?: ChronDate } {
	const own = e.presence?.[key];
	return { from: own?.from ?? e.start, to: own?.to ?? e.end ?? e.start };
}

/** Every place a person has been: where they were born, lived (`residences:`, `places:`), an event they were in took place, and died. Oldest first. */
export function placesBeen(person: Entity, events: Entity[]): Stay[] {
	const out: Stay[] = [];
	if (person.birthPlace) out.push({ place: person.birthPlace, how: "born", day: person.start?.start ?? -Infinity });
	for (const r of person.residences) out.push({ place: r.ref, how: "lived", day: r.from?.start, from: r.from, to: r.to });
	for (const p of person.places) if (!person.residences.some((r) => r.ref.key === p.key)) out.push({ place: p, how: "lived" });
	for (const e of events) {
		if (e.type !== "event" || !e.participants.some((p) => p.key === person.key)) continue;
		const when = presenceIn(e, person.key);
		for (const p of e.places) out.push({ place: p, how: "event", day: when.from?.start, from: when.from, to: when.to === when.from ? undefined : when.to, event: e });
	}
	if (person.deathPlace) out.push({ place: person.deathPlace, how: "died", day: person.end?.start ?? Infinity });
	// Dated stays in order; undated ones after the birth and before the death.
	const rank = (s: Stay, i: number) => (s.day ?? (s.how === "died" ? Infinity : 1e15 + i));
	return out.map((s, i) => [s, rank(s, i)] as const).sort((a, b) => a[1] - b[1]).map(([s]) => s);
}

/** The people tied to any of these places (a place and what is inside it): born, living, died or in an event there, and why. */
export function peopleAmong(persons: Entity[], eventsOf: (key: string) => Entity[], within: Set<string>): { person: Entity; why: string[] }[] {
	const out: { person: Entity; why: string[] }[] = [];
	for (const person of persons) {
		const why: string[] = [];
		if (person.birthPlace && within.has(person.birthPlace.key)) why.push("Born");
		if (person.residences.some((r) => within.has(r.ref.key)) || person.places.some((r) => within.has(r.key))) why.push("Lived");
		for (const e of eventsOf(person.key)) {
			if (e.type === "event" && e.participants.some((x) => x.key === person.key) && e.places.some((x) => within.has(x.key))) why.push(e.name);
		}
		if (person.deathPlace && within.has(person.deathPlace.key)) why.push("Died");
		if (why.length) out.push({ person, why: [...new Set(why)] });
	}
	return out;
}

/** The event with a place that a person is in on a day, if any. */
export function eventAt(person: Entity, events: Entity[], day: number): Entity | undefined {
	for (const e of events) {
		if (e.type !== "event" || !e.start || !e.places.length || !e.participants.some((p) => p.key === person.key)) continue;
		const when = presenceIn(e, person.key);
		if (when.from && when.from.start <= day && day <= (when.to?.end ?? when.from.end)) return e;
	}
	return undefined;
}

/**
 * Where a person is on a day: the place of an event they were in that day, otherwise the residence they had
 * then (no dates on a residence means always), otherwise where they were born once they were.
 */
export function locationAt(person: Entity, events: Entity[], day: number): Ref | undefined {
	return locate(person, events, day)?.place;
}

/** Where a person is on a day, and why: an event they were in, their home then, or where they were born. */
export function locate(person: Entity, events: Entity[], day: number): { place: Ref; why: "event" | "home" | "born"; event?: Entity } | undefined {
	const event = eventAt(person, events, day);
	if (event) return { place: event.places[0], why: "event", event };
	// Of the homes that fit, the one they moved into last.
	const home = person.residences.filter((r) => (!r.from || r.from.start <= day) && (!r.to || day <= r.to.end)).sort((a, b) => (a.from?.start ?? -Infinity) - (b.from?.start ?? -Infinity)).pop();
	if (home) return { place: home.ref, why: "home" };
	if (person.birthPlace && (!person.start || day >= person.start.start)) return { place: person.birthPlace, why: "born" };
	return undefined;
}

/** Someone in two places at once, or between events too close in time for the distance. */
export interface Clash {
	a: Entity;
	b: Entity;
	placeA: Ref;
	placeB: Ref;
	/** Days between the end of the earlier and the start of the later: negative when they overlap. */
	gap: number;
}

/** Dated events a person was in at different places whose dates overlap, or follow closely (`near`: days that count as close). */
export function clashes(person: Entity, events: Entity[], near = 0): Clash[] {
	const mine = events
		.filter((e) => e.type === "event" && e.places.length && e.start && e.participants.some((p) => p.key === person.key))
		.map((e) => ({ e, w: presenceIn(e, person.key) }))
		.filter((x) => x.w.from)
		.sort((x, y) => x.w.from!.start - y.w.from!.start);
	const out: Clash[] = [];
	for (let i = 0; i < mine.length; i++) {
		for (let j = i + 1; j < mine.length; j++) {
			const x = mine[i];
			const y = mine[j];
			const gap = y.w.from!.start - (x.w.to?.end ?? x.w.from!.end);
			if (gap > near) break;
			// A journey's own stops are one trip, not two places at once.
			if (x.e.key === y.e.key || x.e.places.some((p) => y.e.places.some((q) => q.key === p.key))) continue;
			out.push({ a: x.e, b: y.e, placeA: x.e.places[0], placeB: y.e.places[0], gap });
		}
	}
	return out;
}
