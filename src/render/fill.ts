/**
 * "Fill an area" for image maps: a flood fill from where you click that stops at coasts, rivers and
 * drawn borders (anything whose colour differs from the clicked spot), bridges small gaps in dotted
 * borders, never enters other territories, and returns tidy outlines. No DOM or Leaflet here, so it
 * runs in tests.
 */

export type Pt = [number, number];

export interface Raster {
	/** RGBA, as from getImageData. */
	data: Uint8ClampedArray;
	width: number;
	height: number;
}

export interface FillOptions {
	/** 0–100: how different a colour may be from the clicked spot and still belong to the area. */
	tolerance: number;
	/** Pixels: gaps in a drawn border up to about twice this wide are treated as closed. */
	seal: number;
	/** 1 for pixels that are never filled (other territories). */
	blocked?: Uint8Array;
}

/** Perceptual-ish colour distance ("redmean"), scaled to 0–100. */
export function colorDist(d: Uint8ClampedArray, i: number, r: number, g: number, b: number): number {
	const rm = (d[i] + r) / 2;
	const dr = d[i] - r;
	const dg = d[i + 1] - g;
	const db = d[i + 2] - b;
	return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db) / 7.65;
}

/**
 * The most typical colour around a point (the one closest to all the others), so a speck of texture
 * or a border line under the cursor doesn't decide the area.
 */
export function sampleColor(img: Raster, x: number, y: number, r = 2): [number, number, number] {
	const idx: number[] = [];
	for (let dy = -r; dy <= r; dy++) {
		for (let dx = -r; dx <= r; dx++) {
			const px = x + dx;
			const py = y + dy;
			if (px >= 0 && py >= 0 && px < img.width && py < img.height) idx.push((py * img.width + px) * 4);
		}
	}
	const d = img.data;
	let best = idx[0];
	let bestSum = Infinity;
	for (const i of idx) {
		let sum = 0;
		for (const j of idx) sum += colorDist(d, j, d[i], d[i + 1], d[i + 2]);
		if (sum < bestSum) [best, bestSum] = [i, sum];
	}
	return [d[best], d[best + 1], d[best + 2]];
}

/** Chamfer distance (in pixels) from every pixel to the nearest source pixel. */
export function distanceFrom(src: Uint8Array, w: number, h: number): Float32Array {
	const INF = 1e9;
	const D = 1.41421356;
	const d = new Float32Array(w * h);
	for (let i = 0; i < d.length; i++) d[i] = src[i] ? 0 : INF;
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const i = y * w + x;
			let v = d[i];
			if (v === 0) continue;
			if (x > 0) v = Math.min(v, d[i - 1] + 1);
			if (y > 0) {
				v = Math.min(v, d[i - w] + 1);
				if (x > 0) v = Math.min(v, d[i - w - 1] + D);
				if (x < w - 1) v = Math.min(v, d[i - w + 1] + D);
			}
			d[i] = v;
		}
	}
	for (let y = h - 1; y >= 0; y--) {
		for (let x = w - 1; x >= 0; x--) {
			const i = y * w + x;
			let v = d[i];
			if (v === 0) continue;
			if (x < w - 1) v = Math.min(v, d[i + 1] + 1);
			if (y < h - 1) {
				v = Math.min(v, d[i + w] + 1);
				if (x < w - 1) v = Math.min(v, d[i + w + 1] + D);
				if (x > 0) v = Math.min(v, d[i + w - 1] + D);
			}
			d[i] = v;
		}
	}
	return d;
}

/** 4-connected flood fill over `allowed` from one pixel; marks into `out`. */
function flood(allowed: Uint8Array, w: number, h: number, start: number, out: Uint8Array) {
	if (!allowed[start] || out[start]) return;
	const stack = new Int32Array(w * h);
	let sp = 0;
	stack[sp++] = start;
	out[start] = 1;
	while (sp) {
		const i = stack[--sp];
		const x = i % w;
		const push = (j: number) => {
			if (allowed[j] && !out[j]) {
				out[j] = 1;
				stack[sp++] = j;
			}
		};
		if (x > 0) push(i - 1);
		if (x < w - 1) push(i + 1);
		if (i >= w) push(i - w);
		if (i < w * (h - 1)) push(i + w);
	}
}

/**
 * The area containing `seed`: pixels of a similar colour, not crossing walls (dissimilar pixels or
 * blocked ones), with gaps narrower than ~2×seal bridged and enclosed specks (labels, icons,
 * lakes) included. Returns a 0/1 mask.
 */
export function fillFrom(img: Raster, seed: Pt, opts: FillOptions): Uint8Array {
	const { width: w, height: h, data } = img;
	const n = w * h;
	const sx = Math.max(0, Math.min(w - 1, Math.round(seed[0])));
	const sy = Math.max(0, Math.min(h - 1, Math.round(seed[1])));
	const [r, g, b] = sampleColor(img, sx, sy);
	const pass = new Uint8Array(n);
	const wall = new Uint8Array(n);
	for (let i = 0; i < n; i++) {
		const ok = !opts.blocked?.[i] && colorDist(data, i * 4, r, g, b) <= opts.tolerance;
		pass[i] = ok ? 1 : 0;
		wall[i] = ok ? 0 : 1;
	}
	const seal = Math.max(0, opts.seal);
	let start = sy * w + sx;
	if (!pass[start]) {
		// Clicked right on a line: start beside it instead.
		start = nearestSet(pass, w, h, sx, sy, 6);
		if (start < 0) return new Uint8Array(n);
	}
	// Everything of this colour that touches the click without crossing a wall.
	const reach = new Uint8Array(n);
	flood(pass, w, h, start, reach);
	if (seal <= 0) return fillHoles(reach, w, h, opts.blocked);
	// Closing gaps: shrink the area away from walls by `seal` so narrow gaps pinch shut, which splits
	// it into "cores". Then hand every reachable pixel to its nearest core, and keep the clicked
	// core's share. The border ends up in the middle of each gap, and corners and edges stay whole.
	const distWall = distanceFrom(wall, w, h);
	const core = new Uint8Array(n);
	for (let i = 0; i < n; i++) core[i] = reach[i] && distWall[i] > seal ? 1 : 0;
	const labels = labelComponents(core, w, h);
	let mine = labels[start];
	if (!mine) {
		const near = nearestSet(core, w, h, start % w, Math.floor(start / w), Math.ceil(seal) + 4);
		if (near < 0) return fillHoles(reach, w, h, opts.blocked);
		mine = labels[near];
	}
	const owner = nearestLabel(labels, w, h);
	const region = new Uint8Array(n);
	for (let i = 0; i < n; i++) if (reach[i] && owner[i] === mine) region[i] = 1;
	return fillHoles(region, w, h, opts.blocked);
}

/**
 * Borders drawn from seats of power: the land around each seed (found like a fill from it) is
 * shared out, each pixel going to whichever seed reaches it first without crossing coasts or
 * drawn borders. Seeds with the same label (a realm's several towns) share their land. Returns a
 * label per pixel, 0 where nobody reaches.
 */
export function partitionLand(img: Raster, seeds: { x: number; y: number; label: number }[], opts: FillOptions): Int32Array {
	const { width: w, height: h } = img;
	const n = w * h;
	const land = new Uint8Array(n);
	for (const s of seeds) {
		const m = fillFrom(img, [s.x, s.y], opts);
		for (let i = 0; i < n; i++) if (m[i]) land[i] = 1;
	}
	const labels = new Int32Array(n);
	const queue = new Int32Array(n);
	let head = 0;
	let tail = 0;
	for (const s of seeds) {
		const x = Math.max(0, Math.min(w - 1, Math.round(s.x)));
		const y = Math.max(0, Math.min(h - 1, Math.round(s.y)));
		const i = y * w + x;
		if (labels[i]) continue;
		labels[i] = s.label;
		land[i] = 1;
		queue[tail++] = i;
	}
	// Breadth-first from every seed at once: the first to arrive claims the pixel.
	while (head < tail) {
		const i = queue[head++];
		const x = i % w;
		const l = labels[i];
		const visit = (j: number) => {
			if (land[j] && !labels[j]) {
				labels[j] = l;
				queue[tail++] = j;
			}
		};
		if (x > 0) visit(i - 1);
		if (x < w - 1) visit(i + 1);
		if (i >= w) visit(i - w);
		if (i < n - w) visit(i + w);
	}
	return labels;
}

/** The outlines of one label's share (islands each get their own ring; small holes filled). */
export function labelOutlines(labels: Int32Array, w: number, h: number, label: number, minArea = 30): Pt[][] {
	const mask = new Uint8Array(w * h);
	for (let i = 0; i < mask.length; i++) if (labels[i] === label) mask[i] = 1;
	return traceOutlines(fillHoles(mask, w, h), w, h, minArea);
}

/** 4-connected component labels (1, 2, …) of a mask; 0 outside it. */
export function labelComponents(mask: Uint8Array, w: number, h: number): Int32Array {
	const labels = new Int32Array(w * h);
	const stack = new Int32Array(w * h);
	let next = 0;
	for (let s = 0; s < mask.length; s++) {
		if (!mask[s] || labels[s]) continue;
		const id = ++next;
		let sp = 0;
		stack[sp++] = s;
		labels[s] = id;
		while (sp) {
			const i = stack[--sp];
			const x = i % w;
			const visit = (j: number) => {
				if (mask[j] && !labels[j]) {
					labels[j] = id;
					stack[sp++] = j;
				}
			};
			if (x > 0) visit(i - 1);
			if (x < w - 1) visit(i + 1);
			if (i >= w) visit(i - w);
			if (i < w * (h - 1)) visit(i + w);
		}
	}
	return labels;
}

/** For every pixel, the label of the nearest labelled pixel (chamfer distance, two passes). */
function nearestLabel(labels: Int32Array, w: number, h: number): Int32Array {
	const D = 1.41421356;
	const d = new Float32Array(w * h);
	const out = new Int32Array(labels);
	for (let i = 0; i < d.length; i++) d[i] = labels[i] ? 0 : 1e9;
	const relax = (i: number, j: number, cost: number) => {
		if (d[j] + cost < d[i]) {
			d[i] = d[j] + cost;
			out[i] = out[j];
		}
	};
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const i = y * w + x;
			if (x > 0) relax(i, i - 1, 1);
			if (y > 0) {
				relax(i, i - w, 1);
				if (x > 0) relax(i, i - w - 1, D);
				if (x < w - 1) relax(i, i - w + 1, D);
			}
		}
	}
	for (let y = h - 1; y >= 0; y--) {
		for (let x = w - 1; x >= 0; x--) {
			const i = y * w + x;
			if (x < w - 1) relax(i, i + 1, 1);
			if (y < h - 1) {
				relax(i, i + w, 1);
				if (x < w - 1) relax(i, i + w + 1, D);
				if (x > 0) relax(i, i + w - 1, D);
			}
		}
	}
	return out;
}

export function nearestSet(mask: Uint8Array, w: number, h: number, x: number, y: number, radius: number): number {
	let best = -1;
	let bestD = Infinity;
	for (let dy = -radius; dy <= radius; dy++) {
		for (let dx = -radius; dx <= radius; dx++) {
			const px = x + dx;
			const py = y + dy;
			if (px < 0 || py < 0 || px >= w || py >= h) continue;
			const d = dx * dx + dy * dy;
			if (d < bestD && mask[py * w + px]) [best, bestD] = [py * w + px, d];
		}
	}
	return best;
}

/**
 * Small holes the region encloses (labels, icons, specks of texture) become part of it. Big ones
 * (islands in a filled sea, a lake, an enclave) and blocked pixels stay out.
 */
export function fillHoles(region: Uint8Array, w: number, h: number, blocked?: Uint8Array, maxShare = 0.01): Uint8Array {
	const out = new Uint8Array(region);
	const holes = new Uint8Array(w * h);
	for (let i = 0; i < holes.length; i++) holes[i] = region[i] ? 0 : 1;
	const labels = labelComponents(holes, w, h);
	const size = new Map<number, number>();
	const open = new Set<number>();
	for (let i = 0; i < labels.length; i++) {
		const l = labels[i];
		if (!l) continue;
		size.set(l, (size.get(l) ?? 0) + 1);
		const x = i % w;
		if (x === 0 || x === w - 1 || i < w || i >= w * (h - 1) || blocked?.[i]) open.add(l);
	}
	const limit = Math.max(16, w * h * maxShare);
	for (let i = 0; i < labels.length; i++) {
		const l = labels[i];
		if (l && !open.has(l) && size.get(l)! <= limit) out[i] = 1;
	}
	return out;
}

// Clockwise from west: W, NW, N, NE, E, SE, S, SW.
const DIRS: Pt[] = [[-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1]];

/** Outer boundary (pixel centres, clockwise) of every 8-connected blob of at least `minArea` pixels. */
export function traceOutlines(mask: Uint8Array, w: number, h: number, minArea = 12): Pt[][] {
	const seen = new Uint8Array(w * h);
	const rings: Pt[][] = [];
	const stack = new Int32Array(w * h);
	for (let i = 0; i < mask.length; i++) {
		if (!mask[i] || seen[i]) continue;
		// Label the blob; `i` is its first pixel in raster order, so its west and north are outside.
		let sp = 0;
		let area = 0;
		stack[sp++] = i;
		seen[i] = 1;
		while (sp) {
			const j = stack[--sp];
			area++;
			const x = j % w;
			const y = (j - x) / w;
			for (const [dx, dy] of DIRS) {
				const nx = x + dx;
				const ny = y + dy;
				if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
				const k = ny * w + nx;
				if (mask[k] && !seen[k]) {
					seen[k] = 1;
					stack[sp++] = k;
				}
			}
		}
		if (area < minArea) continue;
		rings.push(traceFrom(mask, w, h, i));
	}
	return rings;
}

/**
 * Moore-neighbour tracing. It stops the moment it's back in a state it has been in (the same pixel,
 * entered the same way): exactly one lap. Jacob's rule (stop on entering the start from the west)
 * never fires on some ragged shapes, and the walk then circled the coast millions of times.
 */
function traceFrom(mask: Uint8Array, w: number, h: number, start: number): Pt[] {
	const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1;
	const sx = start % w;
	const sy = (start - sx) / w;
	const out: Pt[] = [[sx, sy]];
	let cx = sx;
	let cy = sy;
	// Came in from the west.
	let back = 0;
	const startBack = 0;
	const states = new Set<number>([start * 8 + back]);
	const limit = 4 * w * h + 16;
	for (let step = 0; step < limit; step++) {
		let moved = false;
		for (let k = 1; k <= 8; k++) {
			const d = (back + k) % 8;
			const nx = cx + DIRS[d][0];
			const ny = cy + DIRS[d][1];
			if (inside(nx, ny)) {
				// The new backtrack is the (outside) neighbour checked just before, seen from the new pixel.
				const prev = DIRS[(back + k - 1) % 8];
				const bx = cx + prev[0] - nx;
				const by = cy + prev[1] - ny;
				back = DIRS.findIndex(([dx, dy]) => dx === bx && dy === by);
				cx = nx;
				cy = ny;
				moved = true;
				break;
			}
		}
		if (!moved) break; // a single pixel
		if (cx === sx && cy === sy && back === startBack) break;
		const state = (cy * w + cx) * 8 + back;
		if (states.has(state)) break;
		states.add(state);
		out.push([cx, cy]);
	}
	// The walk returns to the start; drop the repeat.
	const last = out[out.length - 1];
	if (out.length > 1 && last[0] === sx && last[1] === sy) out.pop();
	return out.map(([x, y]) => [x + 0.5, y + 0.5] as Pt);
}

function segDist(p: Pt, a: Pt, b: Pt): { d: number; q: Pt } {
	const vx = b[0] - a[0];
	const vy = b[1] - a[1];
	const len = vx * vx + vy * vy;
	let t = len ? ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len : 0;
	t = Math.max(0, Math.min(1, t));
	const q: Pt = [a[0] + t * vx, a[1] + t * vy];
	return { d: Math.hypot(p[0] - q[0], p[1] - q[1]), q };
}

export function simplifyOpen(pts: Pt[], tol: number): Pt[] {
	if (pts.length <= 2) return pts;
	const keep = new Uint8Array(pts.length);
	keep[0] = keep[pts.length - 1] = 1;
	const stack: [number, number][] = [[0, pts.length - 1]];
	while (stack.length) {
		const [a, b] = stack.pop()!;
		let maxD = 0;
		let idx = -1;
		for (let i = a + 1; i < b; i++) {
			const d = segDist(pts[i], pts[a], pts[b]).d;
			if (d > maxD) [maxD, idx] = [d, i];
		}
		if (maxD > tol && idx > 0) {
			keep[idx] = 1;
			stack.push([a, idx], [idx, b]);
		}
	}
	return pts.filter((_, i) => keep[i]);
}

/** Douglas–Peucker for a closed ring: split at the point farthest from the first, simplify both halves. */
export function simplifyRing(ring: Pt[], tol: number): Pt[] {
	if (ring.length <= 4) return ring;
	let far = 0;
	let farD = -1;
	for (let i = 1; i < ring.length; i++) {
		const d = Math.hypot(ring[i][0] - ring[0][0], ring[i][1] - ring[0][1]);
		if (d > farD) [far, farD] = [i, d];
	}
	const a = simplifyOpen(ring.slice(0, far + 1), tol);
	const b = simplifyOpen([...ring.slice(far), ring[0]], tol);
	const out = [...a, ...b.slice(1, -1)];
	return out.length >= 3 ? out : ring;
}

/** Marks the inside of a polygon (even-odd, sampled at pixel centres). */
export function rasterize(mask: Uint8Array, w: number, h: number, poly: Pt[]) {
	if (poly.length < 3) return;
	let minY = Infinity;
	let maxY = -Infinity;
	for (const p of poly) {
		minY = Math.min(minY, p[1]);
		maxY = Math.max(maxY, p[1]);
	}
	const y0 = Math.max(0, Math.floor(minY));
	const y1 = Math.min(h - 1, Math.ceil(maxY));
	const xs: number[] = [];
	for (let y = y0; y <= y1; y++) {
		const cy = y + 0.5;
		xs.length = 0;
		for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
			const [ax, ay] = poly[j];
			const [bx, by] = poly[i];
			if (ay <= cy !== by <= cy) xs.push(ax + ((cy - ay) * (bx - ax)) / (by - ay));
		}
		xs.sort((a, b) => a - b);
		for (let k = 0; k + 1 < xs.length; k += 2) {
			const from = Math.max(0, Math.ceil(xs[k] - 0.5));
			const to = Math.min(w - 1, Math.floor(xs[k + 1] - 0.5));
			for (let x = from; x <= to; x++) mask[y * w + x] = 1;
		}
	}
}

/**
 * Snaps a point to the nearest corner of another shape within `maxDist`, or else to the nearest
 * point on one of its edges, so neighbouring territories share a border instead of overlapping.
 */
export function snapPoint(p: Pt, shapes: Pt[][], maxDist: number): { p: Pt; kind: "vertex" | "edge"; shape: number; at: number } | null {
	let best: { p: Pt; shape: number; at: number } | null = null;
	let bestD = maxDist;
	shapes.forEach((s, si) => {
		s.forEach((v, vi) => {
			const d = Math.hypot(v[0] - p[0], v[1] - p[1]);
			if (d <= bestD) [best, bestD] = [{ p: [v[0], v[1]], shape: si, at: vi }, d];
		});
	});
	if (best) return { ...(best as { p: Pt; shape: number; at: number }), kind: "vertex" };
	let edge: { p: Pt; shape: number; at: number } | null = null;
	bestD = maxDist;
	shapes.forEach((s, si) => {
		for (let i = 0; i < s.length; i++) {
			const a = s[i];
			const b = s[(i + 1) % s.length];
			const { d, q } = segDist(p, a, b);
			if (d <= bestD) {
				const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
				[edge, bestD] = [{ p: q, shape: si, at: i + Math.min(0.999, Math.hypot(q[0] - a[0], q[1] - a[1]) / len) }, d];
			}
		}
	});
	return edge ? { ...(edge as { p: Pt; shape: number; at: number }), kind: "edge" } : null;
}

/** Snaps every corner of a ring to nearby shapes and drops corners that collapse onto the previous one. */
export function snapRing(ring: Pt[], shapes: Pt[][], maxDist: number): Pt[] {
	if (!shapes.length) return ring;
	const out: Pt[] = [];
	for (const p of ring) {
		const s = snapPoint(p, shapes, maxDist)?.p ?? p;
		const prev = out[out.length - 1];
		if (!prev || Math.hypot(prev[0] - s[0], prev[1] - s[1]) > 1e-6) out.push(s);
	}
	if (out.length > 1 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) < 1e-6) out.pop();
	return out.length >= 3 ? out : ring;
}
