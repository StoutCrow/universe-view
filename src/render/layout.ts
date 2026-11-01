/** Grid columns on a board. */
export const COLS = 12;

export interface Rect {
	id: string;
	x: number;
	y: number;
	w: number;
	h: number;
}

function collides(a: Rect, b: Rect): boolean {
	return a.id !== b.id && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/**
 * Settles a layout: every module falls upward as far as it can, and anything overlapping the
 * module being moved is pushed below it. Returns new positions; the input is not changed.
 */
export function settle<T extends Rect>(items: T[], movingId?: string): T[] {
	const order = (r: T) => r.y - (r.id === movingId ? 0.5 : 0);
	const sorted = items.map((r) => ({ ...r })).sort((a, b) => order(a) - order(b) || a.x - b.x);
	const placed: T[] = [];
	for (const it of sorted) {
		it.x = Math.max(0, Math.min(COLS - it.w, it.x));
		it.y = Math.max(0, it.y);
		while (it.y > 0 && !placed.some((p) => collides({ ...it, y: it.y - 1 }, p))) it.y--;
		for (let hit = placed.find((p) => collides(it, p)); hit; hit = placed.find((p) => collides(it, p))) it.y = hit.y + hit.h;
		placed.push(it);
	}
	return placed;
}

/**
 * Where most of a timeline happens: the whole range, less any far-off items cut off by a gap wider
 * than 40% of what's left (a creation myth thousands of years before a world's history), up to a
 * fifth of the items.
 */
export function fitRange(items: { start: number; end: number }[]): [number, number] {
	const starts = items.map((i) => i.start).sort((a, b) => a - b);
	const ends = items.map((i) => i.end).sort((a, b) => a - b);
	const n = items.length;
	let lo = 0;
	let hi = n - 1;
	if (n >= 5) {
		for (let dropped = 0; dropped < Math.floor(n * 0.2); dropped++) {
			const span = ends[hi] - starts[lo];
			const gapLow = starts[lo + 1] - starts[lo];
			const gapHigh = ends[hi] - ends[hi - 1];
			if (Math.max(gapLow, gapHigh) <= span * 0.4) break;
			if (gapLow >= gapHigh) lo++;
			else hi--;
		}
	}
	return ends[hi] > starts[lo] ? [starts[lo], ends[hi]] : [starts[0], ends[n - 1]];
}