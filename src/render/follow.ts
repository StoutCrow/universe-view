/**
 * Following what's already there between two snapped points: a neighbour's border (so two lands share
 * it exactly, corner for corner) or the coast and rivers read from the picture. Pure, so it's testable.
 */
import { simplifyOpen, type Pt } from "./fill";

/**
 * The corners of `ring` passed going from position `from` to `to` (a corner's index, or an index and a
 * fraction along the edge after it), whichever way round is shorter. The end points aren't included.
 */
export function alongRing(ring: Pt[], from: number, to: number): Pt[] {
	const n = ring.length;
	if (n < 2 || from === to) return [];
	const dist = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1]);
	const at = (pos: number): Pt => {
		const i = Math.floor(pos) % n;
		const t = pos - Math.floor(pos);
		const a = ring[i];
		const b = ring[(i + 1) % n];
		return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
	};
	// Forward: the corners after `from` up to and including the one at or before `to`.
	const walk = (a: number, b: number): Pt[] => {
		const out: Pt[] = [];
		let k = Math.floor(a) + 1;
		const end = b >= a ? b : b + n;
		for (; k <= end + 1e-9; k++) if (k - a > 1e-9 && end - k > 1e-9) out.push(ring[k % n]);
		return out;
	};
	const length = (pts: Pt[], a: Pt, b: Pt) => {
		let s = 0;
		let prev = a;
		for (const p of [...pts, b]) {
			s += dist(prev, p);
			prev = p;
		}
		return s;
	};
	const pa = at(from);
	const pb = at(to);
	const fwd = walk(from, to);
	const back = walk(to, from).reverse();
	return length(fwd, pa, pb) <= length(back, pa, pb) ? fwd : back;
}

/**
 * The shortest way from `a` to `b` along the set pixels of `mask` (the coast and rivers), as a few
 * points (simplified to within `tol` pixels), or null when they aren't joined within reach. The search
 * keeps to a box round the two points, wide enough for a deep inlet, so it stays quick. A break of a
 * pixel or two in a thin river (a faint stretch, a label across it) is stepped over, at a cost, so
 * the way keeps to the water rather than giving up and cutting straight across the land.
 */
export function traceMask(mask: Uint8Array, w: number, h: number, a: Pt, b: Pt, tol = 1): Pt[] | null {
	const straight = Math.hypot(b[0] - a[0], b[1] - a[1]);
	// Room for the coast to wander well away from the straight line, but never a huge search.
	let margin = Math.max(120, straight * 1.5);
	const side = (m: number) => (Math.abs(b[0] - a[0]) + 2 * m) * (Math.abs(b[1] - a[1]) + 2 * m);
	while (margin > 40 && side(margin) > 2_000_000) margin *= 0.8;
	const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0]) - margin));
	const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1]) - margin));
	const x1 = Math.min(w - 1, Math.ceil(Math.max(a[0], b[0]) + margin));
	const y1 = Math.min(h - 1, Math.ceil(Math.max(a[1], b[1]) + margin));
	const bw = x1 - x0 + 1;
	const bh = y1 - y0 + 1;
	if (bw <= 0 || bh <= 0) return null;
	const on = (x: number, y: number) => mask[(y + y0) * w + x + x0] === 1;
	// The nearest set pixel to a point, within a few pixels.
	const nearest = ([px, py]: Pt): number => {
		let best = -1;
		let bestD = Infinity;
		for (let dy = -4; dy <= 4; dy++)
			for (let dx = -4; dx <= 4; dx++) {
				const x = Math.round(px) + dx;
				const y = Math.round(py) + dy;
				if (x < x0 || y < y0 || x > x1 || y > y1 || !mask[y * w + x]) continue;
				const d = dx * dx + dy * dy;
				if (d < bestD) [best, bestD] = [(y - y0) * bw + (x - x0), d];
			}
		return best;
	};
	const s = nearest(a);
	const t = nearest(b);
	if (s < 0 || t < 0) return null;
	// Whether each cell is on the mask (0), next to it (1: a break up to 2 pixels long can be stepped
	// over this way, but not a 3-pixel inlet or a strip of land), or out of reach (2).
	const N = bw * bh;
	const gap = new Uint8Array(N).fill(2);
	for (let y = 0; y < bh; y++)
		for (let x = 0; x < bw; x++) {
			if (!on(x, y)) continue;
			for (let dy = -1; dy <= 1; dy++)
				for (let dx = -1; dx <= 1; dx++) {
					const nx = x + dx;
					const ny = y + dy;
					if (nx < 0 || ny < 0 || nx >= bw || ny >= bh) continue;
					const d = Math.max(Math.abs(dx), Math.abs(dy));
					const j = ny * bw + nx;
					if (d < gap[j]) gap[j] = d;
				}
		}
	// Cheapest way (Dijkstra): a step along the mask costs its length, a step through a break 12 times
	// as much, so a real join is always taken over a jump.
	const cost = new Float64Array(N).fill(Infinity);
	const prev = new Int32Array(N).fill(-1);
	const heap: number[] = [];
	const push = (i: number) => {
		heap.push(i);
		for (let k = heap.length - 1; k > 0; ) {
			const p = (k - 1) >> 1;
			if (cost[heap[p]] <= cost[heap[k]]) break;
			[heap[p], heap[k]] = [heap[k], heap[p]];
			k = p;
		}
	};
	const pop = () => {
		const top = heap[0];
		const last = heap.pop()!;
		if (heap.length) {
			heap[0] = last;
			for (let k = 0; ; ) {
				const l = 2 * k + 1;
				const r = l + 1;
				let m = k;
				if (l < heap.length && cost[heap[l]] < cost[heap[m]]) m = l;
				if (r < heap.length && cost[heap[r]] < cost[heap[m]]) m = r;
				if (m === k) break;
				[heap[m], heap[k]] = [heap[k], heap[m]];
				k = m;
			}
		}
		return top;
	};
	cost[s] = 0;
	prev[s] = s;
	push(s);
	const done = new Uint8Array(N);
	while (heap.length) {
		const i = pop();
		if (done[i]) continue;
		done[i] = 1;
		if (i === t) break;
		const x = i % bw;
		const y = (i - x) / bw;
		for (let dy = -1; dy <= 1; dy++)
			for (let dx = -1; dx <= 1; dx++) {
				if (!dx && !dy) continue;
				const nx = x + dx;
				const ny = y + dy;
				if (nx < 0 || ny < 0 || nx >= bw || ny >= bh) continue;
				const j = ny * bw + nx;
				if (done[j] || gap[j] > 1) continue;
				const c = cost[i] + (dx && dy ? Math.SQRT2 : 1) * (gap[j] ? 12 : 1);
				if (c < cost[j]) {
					cost[j] = c;
					prev[j] = i;
					push(j);
				}
			}
	}
	if (prev[t] < 0) return null;
	const path: Pt[] = [];
	for (let i = t; ; i = prev[i]) {
		path.push([(i % bw) + x0 + 0.5, Math.floor(i / bw) + y0 + 0.5]);
		if (i === s) break;
	}
	path.reverse();
	// Far longer than the straight line went round a whole island or up the wrong river: not wanted.
	// (A winding coast or a deep inlet can easily be many times the straight distance.)
	// Pixels here are screen pixels, so two clicks either side of an inlet's mouth may follow it a good way in.
	if (cost[t] > Math.max(240, straight * 15)) return null;
	return simplifyOpen(path, tol).slice(1, -1);
}
