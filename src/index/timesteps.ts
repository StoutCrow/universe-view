/**
 * The days on which anything in a world changes: something starts (a life, a border, a holder, a
 * name, an occupation…) or stops. Between two of them every view of the world looks the same, so
 * moving the time slider within one stretch needn't redraw anything.
 */

/** Every `{ start, end }` date found in the items (dates nest in borders, holders, names, links…): its first day and the day after its last. */
export function timeBoundaries(items: unknown[]): number[] {
	const out = new Set<number>();
	const seen = new WeakSet<object>();
	const walk = (v: unknown, depth: number) => {
		if (!v || typeof v !== "object" || depth > 6 || seen.has(v)) return;
		seen.add(v);
		if (Array.isArray(v)) {
			for (const x of v) walk(x, depth + 1);
			return;
		}
		const o = v as Record<string, unknown>;
		if (typeof o.start === "number" && typeof o.end === "number") {
			out.add(o.start);
			out.add(o.end + 1);
		}
		// A change on one day (a renaming, a transfer).
		if (typeof o.day === "number") out.add(o.day);
		for (const [k, x] of Object.entries(o)) {
			// The note's file (its folder, the vault…) and its raw properties hold no dates of their own.
			if (k === "file" || k === "props" || k === "parent" || k === "vault") continue;
			if (x && typeof x === "object") walk(x, depth + 1);
		}
	};
	for (const item of items) walk(item, 0);
	return [...out].sort((a, b) => a - b);
}

/** Which stretch a day falls in (-1 for all time): two days in one stretch show the same world. */
export function timeStep(bounds: number[], at: number | undefined): number {
	if (at === undefined) return -1;
	let lo = 0;
	let hi = bounds.length;
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if (bounds[mid] <= at) lo = mid + 1;
		else hi = mid;
	}
	return lo;
}
