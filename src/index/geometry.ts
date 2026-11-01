/** Plane geometry for painted areas: a point is [x, y]; a ring is a polygon's corners, closed implicitly. */
export type P2 = [number, number];

/** Twice the signed area; its size is what matters for comparing pieces. */
export function ringArea(ring: P2[]): number {
	let a = 0;
	for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
	return Math.abs(a / 2);
}

/** Whether a point lies inside a ring (even-odd). */
export function inRing(p: P2, ring: P2[]): boolean {
	let inside = false;
	for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
		const [xi, yi] = ring[i];
		const [xj, yj] = ring[j];
		if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
	}
	return inside;
}

export interface Box {
	x0: number;
	y0: number;
	x1: number;
	y1: number;
}

export function boxOf(ring: P2[]): Box {
	let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
	for (const [x, y] of ring) {
		if (x < x0) x0 = x;
		if (y < y0) y0 = y;
		if (x > x1) x1 = x;
		if (y > y1) y1 = y;
	}
	return { x0, y0, x1, y1 };
}

/** The overlap of two boxes, or null. */
/**
 * The outline of several areas taken together, on their own borders: the stretches with land on one
 * side only. Borders two areas share, and edges lying inside another area (a barony inside its county),
 * drop out. `tol` is how far either side of an edge is looked at (small gaps and overlaps up to it
 * count as shared); edges are checked every `step`. Returns polylines.
 */
export function unionOutline(rings: P2[][], tol: number, step: number): P2[][] {
	const boxes = rings.map(boxOf);
	const inside = (x: number, y: number) => rings.some((r, i) => x >= boxes[i].x0 && x <= boxes[i].x1 && y >= boxes[i].y0 && y <= boxes[i].y1 && inRing([x, y], r));
	const out: P2[][] = [];
	for (const r of rings) {
		// Every stretch of the ring, and whether it's on the outline. A stretch counts when land lies on
		// one side only at any of three points along it (so a sharp corner or a hairline overlap halfway
		// along doesn't drop it).
		const pieces: { from: P2; to: P2; outer: boolean }[] = [];
		for (let i = 0; i < r.length; i++) {
			const a = r[i];
			const b = r[(i + 1) % r.length];
			const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
			if (!len) continue;
			const nx = -(b[1] - a[1]) / len;
			const ny = (b[0] - a[0]) / len;
			const n = Math.max(1, Math.ceil(len / step));
			const at = (t: number): P2 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
			for (let j = 0; j < n; j++) {
				// Dropped only with land on both sides (a shared border, an edge inside another area). Nothing on
				// either side is a sliver narrower than the look-aside, like a small island's tip: still outline.
				const outer = [0.25, 0.5, 0.75].some((f) => {
					const [mx, my] = at((j + f) / n);
					return !(inside(mx + nx * tol, my + ny * tol) && inside(mx - nx * tol, my - ny * tol));
				});
				pieces.push({ from: at(j / n), to: at((j + 1) / n), outer });
			}
		}
		const m = pieces.length;
		if (!m) continue;
		// A stretch or two judged inside between outline on both sides is a misreading (where a neighbour's
		// corner nearly touches): bridge it, so the border has no gaps.
		for (let i = 0; i < m; i++) {
			if (pieces[i].outer) continue;
			let j = i;
			while (j < i + 3 && !pieces[j % m].outer) j++;
			if (j - i <= 2 && pieces[(i - 1 + m) % m].outer && pieces[j % m].outer) for (let k = i; k < j; k++) pieces[k % m].outer = true;
		}
		// Joined into lines, starting just after a gap so a line running past the ring's first corner stays whole.
		const start = pieces.findIndex((p) => !p.outer);
		if (start < 0) {
			out.push([...pieces.map((p) => p.from), pieces[0].from]);
			continue;
		}
		let cur: P2[] | null = null;
		for (let k = 1; k <= m; k++) {
			const p = pieces[(start + k) % m];
			if (p.outer) {
				if (!cur) cur = [p.from];
				cur.push(p.to);
			} else if (cur) {
				out.push(cur);
				cur = null;
			}
		}
		if (cur && cur.length > 1) out.push(cur);
	}
	return out.filter((l) => l.length > 1);
}

export function boxMeet(a: Box, b: Box, pad = 0): Box | null {
	const m = { x0: Math.max(a.x0, b.x0) - pad, y0: Math.max(a.y0, b.y0) - pad, x1: Math.min(a.x1, b.x1) + pad, y1: Math.min(a.y1, b.y1) + pad };
	return m.x0 < m.x1 && m.y0 < m.y1 ? m : null;
}

/** Shortest distance from a point to a ring's border. */
export function distToRing(p: P2, ring: P2[]): number {
	let best = Infinity;
	for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
		const [ax, ay] = ring[j];
		const [bx, by] = ring[i];
		const dx = bx - ax;
		const dy = by - ay;
		const len = dx * dx + dy * dy;
		const t = len ? Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / len)) : 0;
		const ex = ax + t * dx - p[0];
		const ey = ay + t * dy - p[1];
		const d = ex * ex + ey * ey;
		if (d < best) best = d;
	}
	return Math.sqrt(best);
}

/** Points on a grid across a box (about `per` a side), for estimating areas by counting. */
export function gridIn(box: Box, per = 24): { pts: P2[]; cell: number } {
	const step = Math.max((box.x1 - box.x0) / per, (box.y1 - box.y0) / per, 1e-9);
	const pts: P2[] = [];
	for (let x = box.x0 + step / 2; x < box.x1; x += step) for (let y = box.y0 + step / 2; y < box.y1; y += step) pts.push([x, y]);
	return { pts, cell: step * step };
}

/** Where a ring's border crosses itself (a figure-of-eight can't be filled as one area). */
export function selfCrossings(ring: P2[]): P2[] {
	const n = ring.length;
	const out: P2[] = [];
	for (let i = 0; i < n; i++) {
		const a = ring[i];
		const b = ring[(i + 1) % n];
		for (let j = i + 2; j < n; j++) {
			if (i === 0 && j === n - 1) continue;
			const h = cross(a, b, ring[j], ring[(j + 1) % n]);
			// Touching at a shared corner isn't a crossing.
			if (h && h.s > 1e-6 && h.s < 1 - 1e-6 && h.t > 1e-6 && h.t < 1 - 1e-6) out.push(h.p);
		}
	}
	return out;
}

/**
 * The best spot for a name inside an area: the point farthest from its border (the "pole of
 * inaccessibility"), optionally keeping out of other areas drawn over it (a county's baronies).
 * Searches a grid, then refines around the best cell.
 */
export function labelSpot(ring: P2[], avoid: P2[][] = []): { p: P2; room: number } {
	// The same shapes give the same spot: remembered, so redraws (the time slider, an edit
	// elsewhere) don't search again. A fingerprint of every corner tells shapes apart.
	const key = `${shapeHash(ring)}|${avoid.map(shapeHash).join(",")}`;
	const hit = spotCache.get(key);
	if (hit) return hit;
	const found = searchSpot(ring, avoid);
	if (spotCache.size > 4000) spotCache.clear();
	spotCache.set(key, found);
	return found;
}

const spotCache = new Map<string, { p: P2; room: number }>();

/** A quick fingerprint of a ring's corners (order matters). */
export function shapeHash(ring: P2[]): string {
	let h = 2166136261;
	for (const [x, y] of ring) {
		h = Math.imul(h ^ Math.round(x * 100), 16777619);
		h = Math.imul(h ^ Math.round(y * 100), 16777619);
	}
	return `${ring.length}:${(h >>> 0).toString(36)}`;
}

function searchSpot(ring: P2[], avoid: P2[][]): { p: P2; room: number } {
	const box = boxOf(ring);
	const score = (p: P2) => {
		if (!inRing(p, ring)) return -1;
		let d = distToRing(p, ring);
		for (const a of avoid) {
			if (inRing(p, a)) return -1;
			d = Math.min(d, distToRing(p, a));
		}
		return d;
	};
	let best: P2 = [(box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2];
	let bestD = score(best);
	let step = Math.max(box.x1 - box.x0, box.y1 - box.y0) / 16;
	let cx = best[0];
	let cy = best[1];
	let half = Math.max(box.x1 - box.x0, box.y1 - box.y0) / 2;
	for (let round = 0; round < 4 && step > 1e-6; round++) {
		for (let x = cx - half; x <= cx + half; x += step) {
			for (let y = cy - half; y <= cy + half; y += step) {
				const d = score([x, y]);
				if (d > bestD) {
					bestD = d;
					best = [x, y];
				}
			}
		}
		cx = best[0];
		cy = best[1];
		half = step * 1.5;
		step /= 4;
	}
	return { p: best, room: Math.max(0, bestD) };
}

/** The nearest point on a ring's border to `p`: which edge (from corner `i` to the next), how far along, and where. */
export function nearestOnRing(p: P2, ring: P2[]): { i: number; t: number; at: P2; d: number } {
	let best = { i: 0, t: 0, at: ring[0], d: Infinity };
	for (let i = 0; i < ring.length; i++) {
		const [ax, ay] = ring[i];
		const [bx, by] = ring[(i + 1) % ring.length];
		const dx = bx - ax;
		const dy = by - ay;
		const len = dx * dx + dy * dy;
		const t = len ? Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / len)) : 0;
		const at: P2 = [ax + t * dx, ay + t * dy];
		const d = Math.hypot(at[0] - p[0], at[1] - p[1]);
		if (d < best.d) best = { i, t, at, d };
	}
	return best;
}

/**
 * Closes a thin gap between a land and its neighbour by moving only the land: its corners lying
 * within `reach` of the neighbour (and outside it) go onto the neighbour's border, and between two
 * such corners it takes the neighbour's own corners, so the two then share one line exactly. The
 * neighbour isn't touched, and nothing farther than `reach` moves.
 */
export function snapToNeighbour(ring: P2[], other: P2[], reach: number): { ring: P2[]; moved: number } {
	const n = ring.length;
	const m = other.length;
	const hits = ring.map((p) => {
		if (inRing(p, other)) return undefined;
		const h = nearestOnRing(p, other);
		return h.d > 0 && h.d <= reach ? h : undefined;
	});
	const out: P2[] = [];
	let moved = 0;
	const round = (q: P2): P2 => [Math.round(q[0]), Math.round(q[1])];
	for (let k = 0; k < n; k++) {
		const h = hits[k];
		out.push(h ? round(h.at) : ring[k]);
		if (h) moved++;
		// Two snapped corners in a row: follow the neighbour's border between them (the shorter way round).
		const nh = hits[(k + 1) % n];
		if (!h || !nh || (k === n - 1 && n > 2 && !hits[0])) continue;
		const fwd: P2[] = [];
		for (let j = (h.i + 1) % m, guard = 0; guard < m; j = (j + 1) % m, guard++) {
			if (j === (nh.i + 1) % m) break;
			fwd.push(other[j]);
		}
		const back: P2[] = [];
		for (let j = h.i, guard = 0; guard < m; j = (j - 1 + m) % m, guard++) {
			if (j === nh.i) break;
			back.push(other[j]);
		}
		const way = h.i === nh.i ? [] : fwd.length <= back.length ? fwd : back;
		// A long way round means the two corners aren't on the same stretch: leave the edge as it is.
		if (way.length <= 12) out.push(...way);
	}
	// Corners that landed on the same spot collapse to one.
	const clean = out.filter((q, i) => {
		const prev = out[(i - 1 + out.length) % out.length];
		return i === 0 ? !(q[0] === out[out.length - 1][0] && q[1] === out[out.length - 1][1]) : !(q[0] === prev[0] && q[1] === prev[1]);
	});
	return { ring: clean, moved };
}

/** Which way an area runs (radians, -π/2…π/2) and how drawn-out it is (1 = round). */
export function mainAxis(ring: P2[]): { angle: number; stretch: number } {
	const n = ring.length;
	if (n < 3) return { angle: 0, stretch: 1 };
	let mx = 0, my = 0;
	for (const [x, y] of ring) {
		mx += x / n;
		my += y / n;
	}
	let sxx = 0, syy = 0, sxy = 0;
	for (const [x, y] of ring) {
		sxx += (x - mx) ** 2;
		syy += (y - my) ** 2;
		sxy += (x - mx) * (y - my);
	}
	const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
	const tr = sxx + syy;
	const det = Math.sqrt(Math.max(0, ((sxx - syy) / 2) ** 2 + sxy * sxy));
	const l1 = tr / 2 + det;
	const l2 = Math.max(1e-9, tr / 2 - det);
	return { angle, stretch: Math.sqrt(l1 / l2) };
}

/** Where segments ab and cd cross, as the fraction along each, or null. */
function cross(a: P2, b: P2, c: P2, d: P2): { s: number; t: number; p: P2 } | null {
	const r = [b[0] - a[0], b[1] - a[1]];
	const q = [d[0] - c[0], d[1] - c[1]];
	const den = r[0] * q[1] - r[1] * q[0];
	if (Math.abs(den) < 1e-12) return null;
	const s = ((c[0] - a[0]) * q[1] - (c[1] - a[1]) * q[0]) / den;
	const t = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
	if (s < 0 || s > 1 || t < 0 || t > 1) return null;
	return { s, t, p: [a[0] + s * r[0], a[1] + s * r[1]] };
}

/**
 * Cuts a ring in two along a line drawn across it: from where the line first crosses the border to
 * where it next crosses back out. Returns the two pieces, or null when the line doesn't cross twice.
 */
export function splitRing(ring: P2[], cut: P2[]): [P2[], P2[]] | null {
	const n = ring.length;
	if (n < 3 || cut.length < 2) return null;
	const hits: { j: number; s: number; i: number; t: number; p: P2 }[] = [];
	for (let j = 0; j < cut.length - 1; j++) {
		for (let i = 0; i < n; i++) {
			const h = cross(cut[j], cut[j + 1], ring[i], ring[(i + 1) % n]);
			if (h) hits.push({ j, s: h.s, i, t: h.t, p: h.p });
		}
	}
	hits.sort((x, y) => x.j + x.s - (y.j + y.s));
	if (hits.length < 2) return null;
	const [A, B] = hits;
	// The line between the two crossings: its own corners in between.
	const inner: P2[] = cut.slice(A.j + 1, B.j + 1);
	// The border from one crossing to the other, going forward round the ring.
	const along = (from: { i: number; t: number }, to: { i: number; t: number }): P2[] => {
		const out: P2[] = [];
		if (from.i === to.i && from.t <= to.t) return out;
		let k = (from.i + 1) % n;
		for (let guard = 0; guard <= n; guard++) {
			out.push(ring[k]);
			if (k === to.i) break;
			k = (k + 1) % n;
		}
		return out;
	};
	const one: P2[] = [A.p, ...along(A, B), B.p, ...[...inner].reverse()];
	const two: P2[] = [B.p, ...along(B, A), A.p, ...inner];
	if (one.length < 3 || two.length < 3) return null;
	return [one, two];
}
