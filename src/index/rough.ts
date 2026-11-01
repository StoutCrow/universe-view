// Roughened borders: a hand-drawn wobble added to long straight edges when a territory is shown.
// Only the drawing changes; the note keeps its few editable corners. Each edge's wobble depends on
// its two ends alone (whichever way round it runs), so neighbours that share an edge wobble together.

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

const seedOf = (a: P2, b: P2) => noise(Math.round(a[0] * 100) * 73856093 ^ Math.round(a[1] * 100) * 19349663 ^ Math.round(b[0] * 100) * 83492791 ^ Math.round(b[1] * 100) * 2654435761) * 2147483647;

/** The wobbled corners strictly between a and b; none for an edge shorter than minLen. */
export function roughEdge(a: P2, b: P2, amount: number, minLen: number): P2[] {
	if (amount <= 0 || Math.hypot(b[0] - a[0], b[1] - a[1]) < minLen) return [];
	// Always worked out from the lesser end, so both lands sharing the edge get the same line.
	const flip = a[0] > b[0] || (a[0] === b[0] && a[1] > b[1]);
	const [p, q] = flip ? [b, a] : [a, b];
	const step = minLen / 2;
	const out: P2[] = [];
	const split = (p: P2, q: P2, seed: number, depth: number) => {
		const dx = q[0] - p[0];
		const dy = q[1] - p[1];
		const len = Math.hypot(dx, dy);
		if (len < step || depth > 10) return;
		const off = noise(seed) * amount * len;
		const m: P2 = [(p[0] + q[0]) / 2 - (dy / len) * off, (p[1] + q[1]) / 2 + (dx / len) * off];
		split(p, m, (Math.imul(seed, 31) + 7) | 0, depth + 1);
		out.push(m);
		split(m, q, (Math.imul(seed, 31) + 13) | 0, depth + 1);
	};
	split(p, q, seedOf(p, q) | 0, 0);
	return flip ? out.reverse() : out;
}

/** A closed ring with its long edges roughened; short edges (a traced coast, say) stay as they are. */
export function roughenRing(ring: P2[], amount: number, minLen: number): P2[] {
	if (amount <= 0 || ring.length < 3) return ring;
	const out: P2[] = [];
	for (let i = 0; i < ring.length; i++) {
		out.push(ring[i]);
		out.push(...roughEdge(ring[i], ring[(i + 1) % ring.length], amount, minLen));
	}
	return out;
}
