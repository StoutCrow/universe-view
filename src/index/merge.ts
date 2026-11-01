/**
 * Growing and trimming a territory's area: shapes added to it (circled or brushed on) become part of
 * the same outline, shapes rubbed out leave it, and it can be kept off its neighbours. Exact polygon
 * union and difference (polygon-clipping), so every corner the area already had, and so every border
 * it shares with a neighbour, stays exactly where it was. Pure: map units in and out.
 */
import polygonClipping from "polygon-clipping";
import { ringArea, type P2 } from "./geometry";

type Poly = P2[][];

export interface Merged {
	/** The area's new outline. */
	ring: P2[];
	/** Pieces that ended up apart from it (land circled across a strait): extra areas, if wanted. */
	detached: P2[][];
	/** Holes the result had (land of another territory inside it), filled in. */
	holes: number;
}

/** A ring without its closing repeat of the first point. */
function open(ring: [number, number][]): P2[] {
	const r = ring.map(([x, y]) => [x, y] as P2);
	if (r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1]) r.pop();
	return r;
}

/** Which of the pieces is the area itself: the one keeping most of its corners. */
function pick(area: P2[], pieces: P2[][]): number {
	const corners = new Set(area.map(([x, y]) => `${x},${y}`));
	let best = 0;
	let bestScore = -1;
	pieces.forEach((p, i) => {
		const score = p.filter(([x, y]) => corners.has(`${x},${y}`)).length + Math.abs(ringArea(p)) * 1e-12;
		if (score > bestScore) [best, bestScore] = [i, score];
	});
	return best;
}

/** Splits a result into the area and the pieces apart from it; pieces under `minPiece` (slivers left in the gaps between neighbours) are dropped. */
function split(area: P2[], result: [number, number][][][], minPiece = 0): Merged | null {
	if (!result.length) return null;
	const outers = result.map((poly) => open(poly[0])).filter((r) => r.length >= 3);
	if (!outers.length) return null;
	const holes = result.reduce((n, poly) => n + poly.length - 1, 0);
	const main = pick(area, outers);
	return { ring: outers[main], detached: outers.filter((r, i) => i !== main && Math.abs(ringArea(r)) >= minPiece), holes };
}

/** `area` with `add` joined on; with `others`, the added land stops at their borders. */
export function mergeInto(area: P2[], add: P2[][], others: P2[][] = [], minPiece = 0): Merged | null {
	if (!add.length) return { ring: area, detached: [], holes: 0 };
	try {
		let extra = polygonClipping.union(...(add.map((r) => [r]) as [Poly, ...Poly[]]));
		if (others.length) extra = polygonClipping.difference(extra, ...(others.map((r) => [r]) as Poly[]));
		return split(area, polygonClipping.union([area], extra), minPiece);
	} catch (err) {
		console.error("UniverseView: joining shapes", err);
		return null;
	}
}

/** `area` with `remove` cut away (null when nothing would be left). */
export function cutFrom(area: P2[], remove: P2[][], minPiece = 0): Merged | null {
	if (!remove.length) return { ring: area, detached: [], holes: 0 };
	try {
		return split(area, polygonClipping.difference([area], ...(remove.map((r) => [r]) as Poly[])), minPiece);
	} catch (err) {
		console.error("UniverseView: cutting shapes", err);
		return null;
	}
}

/**
 * A border made sound again: repeated corners and spikes (a run of corners that goes out and comes
 * straight back) taken out, and any loop where the border crosses itself undone, keeping the biggest
 * piece. Every other corner stays exactly where it is. `eps` is how close counts as the same point.
 */
export function untangle(ring: P2[], eps = 0.01): P2[] {
	let r = ring.filter((p, i) => {
		const q = ring[(i - 1 + ring.length) % ring.length];
		return ring.length < 2 || Math.hypot(p[0] - q[0], p[1] - q[1]) > eps;
	});
	// Spikes: a corner whose neighbours meet again, or where the border turns (nearly) straight back:
	// a wedge narrower than about 14° at its tip is a slip of the mouse or a snapped corner gone astray,
	// never land anyone drew on purpose.
	for (let changed = true; changed && r.length > 3; ) {
		changed = false;
		for (let i = 0; i < r.length && r.length > 3; i++) {
			const a = r[(i - 1 + r.length) % r.length];
			const b = r[i];
			const c = r[(i + 1) % r.length];
			const ux = b[0] - a[0], uy = b[1] - a[1], vx = c[0] - b[0], vy = c[1] - b[1];
			const lu = Math.hypot(ux, uy);
			const lv = Math.hypot(vx, vy);
			const back = lu > eps && lv > eps && (ux * vx + uy * vy) / (lu * lv) < -0.97;
			if (Math.hypot(c[0] - a[0], c[1] - a[1]) <= eps || back) {
				r.splice(i, 1);
				// The neighbours may now repeat each other.
				const j = i % r.length;
				const p = r[(j - 1 + r.length) % r.length];
				if (Math.hypot(r[j][0] - p[0], r[j][1] - p[1]) <= eps) r.splice(j, 1);
				changed = true;
				i = Math.max(-1, i - 2);
			}
		}
	}
	if (r.length < 3) return ring;
	// Loops: an exact union of the border with itself gives sound pieces; the biggest is the land.
	const crosses = (() => {
		const side = (p: P2, q: P2, s: P2) => (q[0] - p[0]) * (s[1] - p[1]) - (q[1] - p[1]) * (s[0] - p[0]);
		const n = r.length;
		for (let i = 0; i < n; i++)
			for (let j = i + 2; j < n; j++) {
				if (i === 0 && j === n - 1) continue;
				const [a, b, c, d] = [r[i], r[(i + 1) % n], r[j], r[(j + 1) % n]];
				if (side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0) return true;
			}
		return false;
	})();
	if (!crosses) return r;
	try {
		const pieces = polygonClipping.union([r]).map((poly) => open(poly[0])).filter((p) => p.length >= 3);
		if (!pieces.length) return r;
		return pieces.reduce((best, p) => (Math.abs(ringArea(p)) > Math.abs(ringArea(best)) ? p : best));
	} catch {
		return r;
	}
}

/**
 * Small unclaimed pockets enclosed by lands (where three meet and leave a hole between them): the holes
 * in all the lands taken together, smaller than `maxArea`.
 */
export function pocketsBetween(rings: P2[][], maxArea: number): P2[][] {
	if (rings.length < 2) return [];
	try {
		const all = polygonClipping.union(...(rings.map((r) => [r]) as [Poly, ...Poly[]]));
		return all.flatMap((poly) => poly.slice(1).map(open)).filter((h) => h.length >= 3 && Math.abs(ringArea(h)) <= maxArea);
	} catch {
		return [];
	}
}

/**
 * A border just drawn or changed takes in the small gaps it leaves enclosed against its neighbours (a
 * river bend or a corner where it doesn't quite meet them), so no bare slivers are left between lands.
 * Only gaps up to `maxArea` that it borders itself; anything bigger may be meant (a lake, no-man's-land).
 */
export function absorbGaps(ring: P2[], others: P2[][], maxArea: number): P2[] {
	if (ring.length < 3 || !others.length || maxArea <= 0) return ring;
	const box = (r: P2[]) => r.reduce((b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)], [Infinity, Infinity, -Infinity, -Infinity]);
	const [x0, y0, x1, y1] = box(ring);
	const pad = Math.sqrt(maxArea);
	const near = others.filter((o) => {
		const [a, b, c, d] = box(o);
		return a <= x1 + pad && c >= x0 - pad && b <= y1 + pad && d >= y0 - pad;
	});
	if (!near.length) return ring;
	const touches = (h: P2[]) => {
		const eps = Math.max(1e-6, pad * 0.01);
		return h.some((p) => ring.some((q, i) => {
			const r = ring[(i + 1) % ring.length];
			const dx = r[0] - q[0], dy = r[1] - q[1], l = dx * dx + dy * dy;
			const t = l ? Math.max(0, Math.min(1, ((p[0] - q[0]) * dx + (p[1] - q[1]) * dy) / l)) : 0;
			return Math.hypot(p[0] - q[0] - dx * t, p[1] - q[1] - dy * t) <= eps;
		}));
	};
	const gaps = pocketsBetween([ring, ...near], maxArea).filter(touches);
	if (!gaps.length) return ring;
	const res = mergeInto(ring, gaps);
	return res && Math.abs(ringArea(res.ring)) >= Math.abs(ringArea(ring)) ? res.ring : ring;
}

/** A brush stroke as a shape: circles of `radius` along the path, close enough to read as a smooth band. */
export function brushShape(path: P2[], radius: number, sides = 16): P2[][] {
	if (!path.length || radius <= 0) return [];
	const spots: P2[] = [path[0]];
	for (let i = 1; i < path.length; i++) {
		const [ax, ay] = spots[spots.length - 1];
		const [bx, by] = path[i];
		const d = Math.hypot(bx - ax, by - ay);
		const steps = Math.floor(d / (radius * 0.5));
		for (let k = 1; k <= steps; k++) spots.push([ax + ((bx - ax) * k) / (steps + 1), ay + ((by - ay) * k) / (steps + 1)]);
		if (d > radius * 0.15) spots.push([bx, by]);
	}
	const circle = ([cx, cy]: P2): P2[] => Array.from({ length: sides }, (_, i) => [cx + radius * Math.cos((i / sides) * Math.PI * 2), cy + radius * Math.sin((i / sides) * Math.PI * 2)] as P2);
	try {
		const joined = polygonClipping.union(...(spots.map((s) => [circle(s)]) as [Poly, ...Poly[]]));
		return joined.map((poly) => open(poly[0])).filter((r) => r.length >= 3);
	} catch {
		return spots.map(circle);
	}
}

/**
 * Fewer corners where an outline gained many (a brush's circles), never moving a corner it had before:
 * between each pair of old corners the new ones are thinned to within `tol` of the line.
 */
export function tidyRing(ring: P2[], before: P2[], tol: number): P2[] {
	const keep = new Set(before.map(([x, y]) => `${x},${y}`));
	const fixed = ring.map(([x, y]) => keep.has(`${x},${y}`));
	if (fixed.every(Boolean)) return ring;
	// Thins a run between two fixed points (Douglas–Peucker).
	const thin = (pts: P2[]): P2[] => {
		if (pts.length < 3) return pts;
		const [a, b] = [pts[0], pts[pts.length - 1]];
		const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1e-9;
		let far = 0;
		let at = 0;
		for (let i = 1; i < pts.length - 1; i++) {
			const d = Math.abs((b[0] - a[0]) * (a[1] - pts[i][1]) - (a[0] - pts[i][0]) * (b[1] - a[1])) / len;
			if (d > far) [far, at] = [d, i];
		}
		if (far <= tol) return [a, b];
		const left = thin(pts.slice(0, at + 1));
		return [...left.slice(0, -1), ...thin(pts.slice(at))];
	};
	const start = fixed.indexOf(true);
	if (start < 0) return thin([...ring, ring[0]]).slice(0, -1);
	// Walk round from a fixed corner, thinning each stretch of new ones.
	const order = [...ring.slice(start), ...ring.slice(0, start), ring[start]];
	const isFixed = [...fixed.slice(start), ...fixed.slice(0, start), true];
	const out: P2[] = [];
	let run: P2[] = [order[0]];
	for (let i = 1; i < order.length; i++) {
		run.push(order[i]);
		if (isFixed[i]) {
			out.push(...thin(run).slice(0, -1));
			run = [order[i]];
		}
	}
	return out.length >= 3 ? out : ring;
}
