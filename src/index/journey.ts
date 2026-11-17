import type { ChronDate, Entity, Ref, TimedRef } from "../types";

/** One stretch of an object's life in one place: kept there, or carried there by whoever held it. */
export interface Stop {
	place: Ref;
	from?: ChronDate;
	to?: ChronDate;
	/** "kept" (written under places) or "held by X" (where the holder was). */
	why: string;
	who?: Ref;
}

export interface JourneyIndex {
	get(key: string): Entity | undefined;
}

const first = (d?: ChronDate) => d?.start ?? Number.POSITIVE_INFINITY;

/** Where a holder was while they held something: each home that overlaps the time, in order, else their seat or birthplace. */
function holderPlaces(holder: Entity | undefined, from?: ChronDate, to?: ChronDate): { place: Ref; from?: ChronDate; to?: ChronDate }[] {
	if (!holder) return [];
	if (holder.type === "person") {
		const homes = [...holder.residences].sort((a, b) => first(a.from) - first(b.from));
		const lo = from?.start ?? Number.NEGATIVE_INFINITY;
		const hi = to?.end ?? Number.POSITIVE_INFINITY;
		const there = homes.filter((h) => (h.from?.start ?? Number.NEGATIVE_INFINITY) <= hi && (h.to?.end ?? Number.POSITIVE_INFINITY) >= lo);
		if (there.length) {
			return there.map((h) => ({ place: h.ref, from: (h.from?.start ?? lo) > lo ? h.from : from, to: (h.to?.end ?? hi) < hi ? h.to : to }));
		}
		const home = homes[0]?.ref ?? holder.places[0] ?? holder.birthPlace;
		return home ? [{ place: home, from, to }] : [];
	}
	const seat = holder.places[0];
	return seat ? [{ place: seat, from, to }] : [];
}

/**
 * The places an object has been, in order: where it was kept, and where each holder was while holding it.
 * Neighbouring stops in the same place are joined. Pure, so it is testable.
 */
export function journeyOf(idx: JourneyIndex, e: Entity): Stop[] {
	const stops: Stop[] = [];
	for (const t of (e.placeHistory ?? e.places.map((ref): TimedRef => ({ ref })))) stops.push({ place: t.ref, from: t.from, to: t.to, why: "kept" });
	for (const h of e.cultures) {
		for (const w of holderPlaces(idx.get(h.ref.key), h.from, h.to)) stops.push({ place: w.place, from: w.from, to: w.to, why: `held by ${h.ref.name}`, who: h.ref });
	}
	stops.sort((a, b) => first(a.from) - first(b.from));
	const out: Stop[] = [];
	for (const s of stops) {
		const last = out[out.length - 1];
		if (last && last.place.key === s.place.key && last.why === s.why) last.to = s.to ?? last.to;
		else out.push({ ...s });
	}
	return out;
}

/** Where the object was on a day: the latest stop that had begun and not ended (undated stops count as always). */
export function whereAt(stops: Stop[], day: number): Stop | undefined {
	let found: Stop | undefined;
	for (const s of stops) {
		const a = s.from?.start ?? Number.NEGATIVE_INFINITY;
		const b = s.to?.end ?? Number.POSITIVE_INFINITY;
		if (a <= day && day <= b) found = s;
	}
	return found;
}