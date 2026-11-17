import { alongRing } from "../render/follow";
import { snapPoint, type Pt } from "../render/fill";

/**
 * Welds the borders of neighbouring lands into one: where a land's border runs within `tol` of a neighbour's, it is
 * moved onto it (corners snapped, and the neighbour's corners between them followed), so the two share the very same
 * line instead of two lines a few pixels apart. Duplicate corners and one-corner spikes are taken out on the way.
 * Bigger lands go first and stay as they are; each smaller one follows those before it, so nothing moves twice.
 * No Obsidian here, so it is all testable.
 */

export interface WeldArea {
	id: string;
	ring: Pt[];
}

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function ringArea(r: Pt[]): number {
	let s = 0;
	for (let i = 0; i < r.length; i++) {
		const q = r[(i + 1) % r.length];
		s += r[i][0] * q[1] - q[0] * r[i][1];
	}
	return Math.abs(s) / 2;
}

const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

/** Whether a ring crosses itself. */
export function selfCrosses(r: Pt[]): boolean {
	const n = r.length;
	for (let i = 0; i < n; i++) {
		const a = r[i];
		const b = r[(i + 1) % n];
		for (let j = i + 2; j < n; j++) {
			if (i === 0 && j === n - 1) continue;
			const c = r[j];
			const d = r[(j + 1) % n];
			const d1 = cross(c, d, a);
			const d2 = cross(c, d, b);
			const d3 = cross(a, b, c);
			const d4 = cross(a, b, d);
			if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
		}
	}
	return false;
}

function angleAt(a: Pt, b: Pt, c: Pt): number {
	const v1: Pt = [a[0] - b[0], a[1] - b[1]];
	const v2: Pt = [c[0] - b[0], c[1] - b[1]];
	const l = Math.hypot(v1[0], v1[1]) * Math.hypot(v2[0], v2[1]);
	if (!l) return 180;
	return (Math.acos(Math.max(-1, Math.min(1, (v1[0] * v2[0] + v1[1] * v2[1]) / l))) * 180) / Math.PI;
}

/** A ring without corners on top of each other, and without corners that turn straight back on themselves (spikes). */
export function cleanRing(ring: Pt[], spike = 8): Pt[] {
	let out = ring.slice();
	for (let pass = 0; pass < 4; pass++) {
		const before = out.length;
		const dedup: Pt[] = [];
		for (const p of out) if (!dedup.length || dist(dedup[dedup.length - 1], p) > 0.25) dedup.push(p);
		if (dedup.length > 1 && dist(dedup[0], dedup[dedup.length - 1]) <= 0.25) dedup.pop();
		out = dedup.filter((p, i, all) => all.length < 4 || angleAt(all[(i + all.length - 1) % all.length], p, all[(i + 1) % all.length]) >= spike);
		if (out.length === before || out.length < 4) break;
	}
	return out.length >= 3 ? out : ring;
}

/** How far a point is from a segment, and where along it (0 to 1) the nearest point lies. */
function onSegment(p: Pt, a: Pt, b: Pt): { d: number; t: number } {
	const vx = b[0] - a[0];
	const vy = b[1] - a[1];
	const len = vx * vx + vy * vy;
	const t = len ? Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len)) : 0;
	return { d: Math.hypot(p[0] - (a[0] + t * vx), p[1] - (a[1] + t * vy)), t };
}

/**
 * `ring` with the corners of an anchor that run along its long edges put in as corners of its own, so a stretch drawn with
 * few corners beside a neighbour drawn with many can follow it. Only corners whose own neighbours are close too count:
 * a lone corner near an edge is a point, not a shared border.
 */
function densify(ring: Pt[], anchors: Pt[][], tol: number): Pt[] {
	const out: Pt[] = [];
	for (let i = 0; i < ring.length; i++) {
		const a = ring[i];
		const b = ring[(i + 1) % ring.length];
		out.push(a);
		const add: { w: Pt; t: number }[] = [];
		for (const anchor of anchors) {
			for (let k = 0; k < anchor.length; k++) {
				const w = anchor[k];
				const here = onSegment(w, a, b);
				if (here.d > tol || here.d < 0.3 || here.t <= 0 || here.t >= 1 || dist(w, a) < 0.3 || dist(w, b) < 0.3) continue;
				const next = onSegment(anchor[(k + 1) % anchor.length], a, b).d <= tol;
				const prev = onSegment(anchor[(k + anchor.length - 1) % anchor.length], a, b).d <= tol;
				if (next || prev) add.push({ w, t: here.t });
			}
		}
		add.sort((p, q) => p.t - q.t);
		for (const x of add) out.push(x.w);
	}
	return out;
}

/** `ring` with its stretches that run beside an anchor moved onto it. */
export function follow(ring: Pt[], anchors: Pt[][], tol: number, moves?: [Pt, Pt][]): Pt[] {
	const n = ring.length;
	const near = ring.map((v) => snapPoint(v, anchors, tol));
	const start = near.findIndex((x) => x === null);
	if (start < 0 || near.every((x) => x === null)) return ring;
	// Where a corner went, so a corner another land shares with it can go too.
	if (moves) ring.forEach((v, i) => { const x = near[i]; if (x && dist(v, x.p) > 0.3) moves.push([v, x.p]); });
	const out: Pt[] = [];
	let k = 0;
	while (k < n) {
		const i = (start + k) % n;
		const here = near[i];
		if (!here) {
			out.push(ring[i]);
			k++;
			continue;
		}
		// A run of corners beside the same anchor.
		const run: number[] = [i];
		let m = k + 1;
		while (m < n) {
			const j = (start + m) % n;
			const x = near[j];
			if (!x || x.shape !== here.shape) break;
			run.push(j);
			m++;
		}
		const first = near[run[0]]!;
		const last = near[run[run.length - 1]]!;
		if (run.length === 1) out.push(first.p);
		else {
			const path = alongRing(anchors[here.shape], first.at, last.at);
			const along = [first.p, ...path, last.p];
			let runLen = 0;
			for (let r = 1; r < run.length; r++) runLen += dist(ring[run[r - 1]], ring[run[r]]);
			let pathLen = 0;
			for (let r = 1; r < along.length; r++) pathLen += dist(along[r - 1], along[r]);
			// The same stretch of border, or a different one that only happens to pass close: then each corner just snaps.
			if (pathLen <= runLen * 2 + tol * 3) out.push(...along);
			else for (const r of run) out.push(near[r]!.p);
		}
		k = m;
	}
	return out;
}

/** Every land's welded ring, by id. A land whose weld would change its area by more than 4% or make it cross itself is only cleaned. */
export function weldBorders(areas: WeldArea[], tol: number, skipped?: (id: string, why: string) => void): Map<string, Pt[]> {
	const order = [...areas].sort((a, b) => ringArea(b.ring) - ringArea(a.ring) || a.id.localeCompare(b.id));
	// The lands still to come, whose corners move with a corner they share with a land that has moved one.
	const pending = new Map<string, Pt[]>(order.map((a) => [a.id, a.ring.map((p) => [p[0], p[1]] as Pt)]));
	const anchors: Pt[][] = [];
	const out = new Map<string, Pt[]>();
	for (const a of order) {
		const base = cleanRing(pending.get(a.id)!);
		pending.delete(a.id);
		let ring = base;
		if (anchors.length && base.length >= 3) {
			const moves: [Pt, Pt][] = [];
			const welded = cleanRing(follow(densify(base, anchors, tol), anchors, tol, moves));
			const was = ringArea(base) || 1;
			const changed = Math.abs(ringArea(welded) - was) / was;
			if (welded.length >= 3 && changed <= 0.04 && !selfCrosses(welded)) {
				ring = welded;
				for (const [from, to] of moves) for (const other of pending.values()) for (const v of other) if (dist(v, from) < 0.35) [v[0], v[1]] = to;
			} else if (moves.length) skipped?.(a.id, welded.length < 3 ? "too few corners" : changed > 0.04 ? `its area would change ${(changed * 100).toFixed(1)}%` : "it would cross itself");
		}
		out.set(a.id, ring);
		anchors.push(ring);
	}
	return out;
}
