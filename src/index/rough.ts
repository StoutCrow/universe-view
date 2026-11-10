// Roughened borders: a hand-drawn wobble added to long straight edges when a territory is shown.
// Only the drawing changes; the note keeps its few editable corners.
//
// The wobble is a smooth noise field over the map, the same for every land: a point is pushed by what the
// field says at that spot, and by less the nearer it is to any corner. Two lands sharing a border (even
// when one has a corner in the middle of it that the other lacks) therefore draw the very same line, so
// the wobble never opens a gap or overlaps a neighbour.

type P2 = [number, number];

export const ROUGHNESS = { off: 0, light: 0.09, medium: 0.15, strong: 0.22 } as const;
export type Roughness = keyof typeof ROUGHNESS;

/** A repeatable number in [-1, 1) from a seed. */
function noise(seed: number): number {
	let h = seed | 0;
	h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
	h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
	h ^= h >>> 16;
	return ((h >>> 0) / 4294967296) * 2 - 1;
}

/** Smooth value noise in [-1, 1] at a point of the field. */
function value(x: number, y: number): number {
	const xi = Math.floor(x);
	const yi = Math.floor(y);
	const u = x - xi;
	const v = y - yi;
	const su = u * u * (3 - 2 * u);
	const sv = v * v * (3 - 2 * v);
	const at = (i: number, j: number) => noise(Math.imul(i, 73856093) ^ Math.imul(j, 19349663));
	const top = at(xi, yi) + (at(xi + 1, yi) - at(xi, yi)) * su;
	const bottom = at(xi, yi + 1) + (at(xi + 1, yi + 1) - at(xi, yi + 1)) * su;
	return top + (bottom - top) * sv;
}

/** Two layers of the field: broad bends and finer wiggles. */
const field = (x: number, y: number) => value(x, y) * 0.68 + value(x * 2.7 + 11.3, y * 2.7 - 4.1) * 0.32;

/** How far a point is from the nearest corner of any land, up to `radius`. */
export type CornerDistance = (p: P2) => number;

/** Looks up the distance to the nearest corner among all these rings (a grid, so it stays quick on big maps). */
export function cornerDistance(rings: P2[][], radius: number): CornerDistance {
	const grid = new Map<string, P2[]>();
	const cell = (v: number) => Math.floor(v / radius);
	for (const ring of rings) {
		for (const p of ring) {
			const k = `${cell(p[0])},${cell(p[1])}`;
			const list = grid.get(k);
			if (list) list.push(p);
			else grid.set(k, [p]);
		}
	}
	return (p) => {
		let best = radius;
		const ci = cell(p[0]);
		const cj = cell(p[1]);
		for (let i = ci - 1; i <= ci + 1; i++) {
			for (let j = cj - 1; j <= cj + 1; j++) {
				for (const q of grid.get(`${i},${j}`) ?? []) best = Math.min(best, Math.hypot(q[0] - p[0], q[1] - p[1]));
			}
		}
		return best;
	};
}

/** The reach of a corner's hold on the line: how far along a border from a corner the wobble builds up. */
export const holdRadius = (minLen: number) => minLen * 4;

/**
 * A closed ring with its long edges roughened; short edges (a traced coast, say) stay as they are.
 * `near` says how far any point is from the nearest corner of every land drawn, so shared borders agree;
 * without it only this ring's own corners count.
 */
export function roughenRing(ring: P2[], amount: number, minLen: number, near?: CornerDistance): P2[] {
	if (amount <= 0 || ring.length < 3) return ring;
	const hold = holdRadius(minLen);
	const dist = near ?? cornerDistance([ring], hold);
	const wave = minLen * 12;
	const amp = amount * wave;
	const step = minLen / 2;
	const out: P2[] = [];
	for (let i = 0; i < ring.length; i++) {
		const a = ring[i];
		const b = ring[(i + 1) % ring.length];
		out.push(a);
		const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
		if (len < minLen) continue;
		const count = Math.ceil(len / step);
		for (let k = 1; k < count; k++) {
			const t = k / count;
			const x = a[0] + (b[0] - a[0]) * t;
			const y = a[1] + (b[1] - a[1]) * t;
			const d = Math.min(1, dist([x, y]) / hold);
			const w = d * d * (3 - 2 * d);
			out.push([x + field(x / wave, y / wave) * amp * w, y + field(x / wave + 57.3, y / wave - 31.7) * amp * w]);
		}
	}
	return out;
}
