import { rasterize, simplifyRing, traceOutlines, type Pt } from "./fill";
import { boxOf, mainAxis, type P2 } from "../index/geometry";

/**
 * The strategy-map look: one outline around everything a realm holds, and its name curved along
 * its shape. Both come from the realm's areas drawn into a grid (small gaps between hand-drawn
 * neighbours bridged), so they work however the areas were drawn. Pure: map units in and out.
 */

export interface RealmShape {
	/** The realm's outer border(s), in map units. */
	outline: P2[][];
	/** A gentle curve across the realm for its name (start, control, end), or none when too small. */
	curve?: { from: P2; ctrl: P2; to: P2; length: number; thickness: number };
}

interface Grid {
	mask: Uint8Array;
	w: number;
	h: number;
	x0: number;
	y0: number;
	/** Cells per map unit. */
	s: number;
}

function gridOf(rings: P2[][], res: number, bridge: number): Grid | undefined {
	const all = rings.flat();
	if (all.length < 3) return undefined;
	const b = boxOf(all);
	const span = Math.max(b.x1 - b.x0, b.y1 - b.y0, 1e-9);
	const s = res / span;
	const pad = bridge + 2;
	const w = Math.ceil((b.x1 - b.x0) * s) + pad * 2;
	const h = Math.ceil((b.y1 - b.y0) * s) + pad * 2;
	const x0 = b.x0 - pad / s;
	const y0 = b.y0 - pad / s;
	let mask: Uint8Array = new Uint8Array(w * h);
	for (const r of rings) rasterize(mask, w, h, r.map(([x, y]) => [(x - x0) * s, (y - y0) * s] as Pt));
	// Close hairline gaps between areas drawn separately: grow, then shrink back (a morphological close).
	if (bridge > 0) mask = erode(dilate(mask, w, h, bridge), w, h, bridge);
	return { mask, w, h, x0, y0, s };
}

function dilate(m: Uint8Array, w: number, h: number, r: number): Uint8Array {
	let cur = m;
	for (let k = 0; k < r; k++) {
		const out = new Uint8Array(cur);
		for (let y = 0; y < h; y++)
			for (let x = 0; x < w; x++) {
				if (cur[y * w + x]) continue;
				if ((x > 0 && cur[y * w + x - 1]) || (x < w - 1 && cur[y * w + x + 1]) || (y > 0 && cur[(y - 1) * w + x]) || (y < h - 1 && cur[(y + 1) * w + x])) out[y * w + x] = 1;
			}
		cur = out;
	}
	return cur;
}

function erode(m: Uint8Array, w: number, h: number, r: number): Uint8Array {
	let cur = m;
	for (let k = 0; k < r; k++) {
		const out = new Uint8Array(cur);
		for (let y = 0; y < h; y++)
			for (let x = 0; x < w; x++) {
				if (!cur[y * w + x]) continue;
				if (x === 0 || y === 0 || x === w - 1 || y === h - 1 || !cur[y * w + x - 1] || !cur[y * w + x + 1] || !cur[(y - 1) * w + x] || !cur[(y + 1) * w + x]) out[y * w + x] = 0;
			}
		cur = out;
	}
	return cur;
}

/** Whether a map point falls inside the realm's grid. */
function inside(g: Grid, p: P2): boolean {
	const x = Math.floor((p[0] - g.x0) * g.s);
	const y = Math.floor((p[1] - g.y0) * g.s);
	return x >= 0 && y >= 0 && x < g.w && y < g.h && g.mask[y * g.w + x] === 1;
}

/** How far you can go from `p` along `dir` and stay inside (crossing gaps up to `gapLimit` cells: a river, an inland sea). */
function reach(g: Grid, p: P2, dir: P2, max: number, gapLimit = 6): number {
	const step = 1 / g.s;
	let last = 0;
	let miss = 0;
	for (let d = step; d <= max; d += step) {
		if (inside(g, [p[0] + dir[0] * d, p[1] + dir[1] * d])) {
			last = d;
			miss = 0;
		} else if (++miss > gapLimit) break;
	}
	return last;
}

/**
 * The realm's outline and the curve its name follows. `res` is the grid's size across (finer for
 * crisper borders), `bridge` how many cells of gap between areas still count as joined.
 */
export function realmShape(rings: P2[][], centre: P2, chars = 8, res = 260, bridge = 2): RealmShape {
	const g = gridOf(rings, res, bridge);
	if (!g) return { outline: [] };
	const traced = traceOutlines(g.mask, g.w, g.h, Math.max(6, (res * res) / 4000));
	const outline = traced.map((r) => simplifyRing(r, 0.6).map(([x, y]) => [x / g.s + g.x0, y / g.s + g.y0] as P2));
	const span = Math.max(g.w, g.h) / g.s;
	// A realm round an inland sea, or of several islands, is still named across the whole of it.
	const gaps = Math.max(6, Math.round(res * 0.12));
	// The name runs left to right along the line that lets it be biggest: tried through points all
	// over the realm, along its long axis and a little either side of it.
	const axis = mainAxis(rings.flat());
	const starts: P2[] = [centre];
	const cell = Math.max(g.w, g.h) / 12 / g.s;
	for (let y = g.y0 + cell / 2; y < g.y0 + g.h / g.s; y += cell)
		for (let x = g.x0 + cell / 2; x < g.x0 + g.w / g.s; x += cell) if (inside(g, [x, y])) starts.push([x, y]);
	let best: { centre: P2; dir: P2; fwd: number; back: number; thick: number; size: number; score: number } | undefined;
	// Along the land's own axis and either side of it, and level and a little either side of level:
	// steep names read badly, so a slant has to earn its place with a clearly bigger name.
	const angles = [axis.angle, axis.angle - 0.35, axis.angle + 0.35, 0, -0.3, 0.3];
	for (const a of angles) {
		let dir: P2 = [Math.cos(a), Math.sin(a)];
		if (dir[0] < 0) dir = [-dir[0], -dir[1]];
		const steep = Math.abs(Math.atan2(dir[1], dir[0]));
		if (steep > 1.05) continue;
		const perp: P2 = [-dir[1], dir[0]];
		for (const c of starts) {
			const fwd = reach(g, c, dir, span, gaps);
			const back = reach(g, c, [-dir[0], -dir[1]], span, gaps);
			const thick = reach(g, c, perp, span) + reach(g, c, [-perp[0], -perp[1]], span);
			const size = Math.min((fwd + back) * 0.82 / Math.max(3, chars * 0.95), thick * 0.42);
			const score = size * (1 - 0.45 * Math.sin(steep));
			if (!best || score > best.score) best = { centre: c, dir, fwd, back, thick, size, score };
		}
	}
	if (!best || best.fwd + best.back <= 0) return { outline };
	centre = best.centre;
	const dir = best.dir;
	const perp: P2 = [-dir[1], dir[0]];
	const fwd = best.fwd;
	const back = best.back;
	// The middle of the land across the axis, at a point along it: where the curve should pass.
	const midAcross = (t: number): P2 => {
		const at: P2 = [centre[0] + dir[0] * t, centre[1] + dir[1] * t];
		const up = reach(g, at, perp, span);
		const down = reach(g, at, [-perp[0], -perp[1]], span);
		const shift = (up - down) / 2;
		return [at[0] + perp[0] * shift, at[1] + perp[1] * shift];
	};
	const thickness = reach(g, centre, perp, span) + reach(g, centre, [-perp[0], -perp[1]], span);
	// Keep inside the ends a little, as a name never quite touches the border.
	const a = midAcross(-back * 0.82);
	const b = midAcross(fwd * 0.82);
	const m = midAcross((fwd - back) / 2);
	// A quadratic through the three: its control point pulls the middle onto `m`, but only gently.
	const chordMid: P2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
	const bend = Math.min(1, (0.25 * Math.hypot(b[0] - a[0], b[1] - a[1])) / Math.max(1e-9, Math.hypot(m[0] - chordMid[0], m[1] - chordMid[1])));
	const ctrl: P2 = [chordMid[0] + 2 * (m[0] - chordMid[0]) * bend, chordMid[1] + 2 * (m[1] - chordMid[1]) * bend];
	return { outline, curve: { from: a, ctrl, to: b, length: Math.hypot(b[0] - a[0], b[1] - a[1]), thickness } };
}

/** A name's size along a curve of `length` for a land `thickness` across: as big as fits both. */
export function nameSize(name: string, length: number, thickness: number): number {
	const byLength = length / Math.max(3, name.length * 0.95);
	return Math.max(0, Math.min(byLength, thickness * 0.42));
}
