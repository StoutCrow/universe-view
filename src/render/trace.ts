/**
 * Reading features out of a map image: the coastline (where the sea meets the land) and roads or
 * rivers (thin lines of one colour). Pure pixel work with no DOM or Leaflet, so it runs in tests.
 */
import { type Pt, type Raster, colorDist, distanceFrom, fillHoles, labelComponents, sampleColor, simplifyOpen, simplifyRing, traceOutlines } from "./fill";

export interface CoastOptions {
	/** 0–100: how different a pixel may be from the sea's colour and still be sea. */
	tolerance: number;
	/** Pixels: waves, grid lines and labels thinner than about twice this are smoothed into the sea. */
	smooth: number;
	/** Pixels of area: smaller islands and specks are left out. */
	minIsland: number;
}

export interface CoastResult {
	/** 1 for sea. */
	water: Uint8Array;
	/** One ring per landmass, in image pixels. */
	rings: Pt[][];
	/** The sea colour that was used. */
	color: [number, number, number];
	/** Share of the image that is sea. */
	share: number;
}

/**
 * Pixels of a colour, followed through gradual shading: everything within `tol` of it, then out from
 * there to neighbours that differ only a little from the pixel beside them (a sea that darkens towards
 * the edge of the map), as long as they stay within 2.5 × `tol` of the colour itself.
 */
export function growColor(img: Raster, color: [number, number, number], tol: number): Uint8Array {
	const { width: w, height: h, data } = img;
	const n = w * h;
	const mask = new Uint8Array(n);
	const queue = new Int32Array(n);
	let qe = 0;
	for (let i = 0; i < n; i++) if (colorDist(data, i * 4, color[0], color[1], color[2]) <= tol) (mask[i] = 1), (queue[qe++] = i);
	const step = Math.max(2, tol * 0.45);
	const far = tol * 2.5;
	for (let qs = 0; qs < qe; qs++) {
		const i = queue[qs];
		const x = i % w;
		const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
		for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
			if (j < 0 || j >= n || mask[j]) continue;
			if (colorDist(data, j * 4, r, g, b) <= step && colorDist(data, j * 4, color[0], color[1], color[2]) <= far) {
				mask[j] = 1;
				queue[qe++] = j;
			}
		}
	}
	return mask;
}

/** Grows (r > 0) a mask by r pixels. */
function dilate(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
	if (r <= 0) return new Uint8Array(mask);
	const d = distanceFrom(mask, w, h);
	const out = new Uint8Array(w * h);
	for (let i = 0; i < out.length; i++) out[i] = d[i] <= r ? 1 : 0;
	return out;
}

/** Shrinks a mask by r pixels. */
function erode(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
	if (r <= 0) return new Uint8Array(mask);
	const inv = new Uint8Array(w * h);
	for (let i = 0; i < inv.length; i++) inv[i] = mask[i] ? 0 : 1;
	const d = distanceFrom(inv, w, h);
	const out = new Uint8Array(w * h);
	for (let i = 0; i < out.length; i++) out[i] = d[i] > r ? 1 : 0;
	return out;
}

/**
 * The sea's colour when nobody clicked: the commonest colour around the edge of the image (most maps
 * are framed by sea), averaged over the pixels that have it.
 */
export function edgeColor(img: Raster): [number, number, number] {
	const { width: w, height: h, data } = img;
	const bins = new Map<number, { n: number; r: number; g: number; b: number }>();
	const add = (x: number, y: number) => {
		const i = (y * w + x) * 4;
		const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
		const bin = bins.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
		bin.n++;
		bin.r += data[i];
		bin.g += data[i + 1];
		bin.b += data[i + 2];
		bins.set(key, bin);
	};
	const step = Math.max(1, Math.floor(Math.max(w, h) / 600));
	for (let x = 0; x < w; x += step) {
		add(x, 0);
		add(x, h - 1);
	}
	for (let y = 0; y < h; y += step) {
		add(0, y);
		add(w - 1, y);
	}
	let best = { n: 0, r: 0, g: 0, b: 0 };
	for (const b of bins.values()) if (b.n > best.n) best = b;
	return best.n ? [Math.round(best.r / best.n), Math.round(best.g / best.n), Math.round(best.b / best.n)] : [0, 0, 0];
}

/**
 * Finds the sea and outlines the land. The sea is everything of the sea's colour that is joined to
 * where you clicked (or, without a click, to the edge of the image), with wave patterns, grid lines
 * and labels smoothed over. Each landmass comes back as an outline.
 */
export function detectCoast(img: Raster, opts: CoastOptions, seeds: Pt[] = []): CoastResult {
	const { width: w, height: h, data } = img;
	const n = w * h;
	const color: [number, number, number] = seeds.length
		? sampleColor(img, Math.round(seeds[0][0]), Math.round(seeds[0][1]), 3)
		: edgeColor(img);
	const pass = growColor(img, color, opts.tolerance);
	// Closing (grow then shrink) swallows thin strokes drawn on the sea (waves, rhumb lines, text).
	const r = Math.max(0, opts.smooth);
	const closed = r ? erode(dilate(pass, w, h, r), w, h, r) : pass;
	// Opening (shrink then grow) cuts off thin channels of water colour: rivers drawn in the sea's
	// blue stay part of the land instead of the coast running up them.
	const opened = r ? dilate(erode(closed, w, h, r), w, h, r) : closed;
	for (let i = 0; i < n; i++) opened[i] &= closed[i];
	// Keep the sea joined to the click, or to the image's edge, or any big body of it (a frame line
	// drawn round the map cuts the sea off from the edge).
	const labels = labelComponents(opened, w, h);
	const keep = new Set<number>();
	if (seeds.length) {
		for (const [sx, sy] of seeds) {
			const i = Math.max(0, Math.min(h - 1, Math.round(sy))) * w + Math.max(0, Math.min(w - 1, Math.round(sx)));
			if (labels[i]) keep.add(labels[i]);
		}
	} else {
		for (let x = 0; x < w; x++) {
			if (labels[x]) keep.add(labels[x]);
			if (labels[(h - 1) * w + x]) keep.add(labels[(h - 1) * w + x]);
		}
		for (let y = 0; y < h; y++) {
			if (labels[y * w]) keep.add(labels[y * w]);
			if (labels[y * w + w - 1]) keep.add(labels[y * w + w - 1]);
		}
		const size = new Map<number, number>();
		for (let i = 0; i < n; i++) if (labels[i]) size.set(labels[i], (size.get(labels[i]) ?? 0) + 1);
		for (const [l, s] of size) if (s >= n * 0.03) keep.add(l);
	}
	let water: Uint8Array = new Uint8Array(n);
	for (let i = 0; i < n; i++) if (labels[i] && keep.has(labels[i])) water[i] = 1;
	// Specks surrounded by sea (ships, sea monsters, labels) become sea; real islands stay land.
	water = fillHoles(water, w, h, undefined, Math.max(16, opts.minIsland) / n);
	const land = new Uint8Array(n);
	let sea = 0;
	for (let i = 0; i < n; i++) {
		land[i] = water[i] ? 0 : 1;
		sea += water[i];
	}
	const rings = traceOutlines(land, w, h, Math.max(16, opts.minIsland)).map((ring) => simplifyRing(ring, 1.1)).filter((ring) => ring.length >= 3);
	return { water, rings, color, share: sea / n };
}

/**
 * Where borders like to run: wherever water meets land, so the coast, lake shores and rivers. Water is
 * the sea's own colour (taken from the image's edge, matched closely, so a dark sea never seeps into
 * shaded land the way a gradual fill can) and anything blue-tinted (shallows, lakes, rivers). Small
 * holes in it (labels and ships on the sea) are filled and specks of blue on land dropped. Returns a 0/1
 * mask of the pixels to snap a border onto.
 */
export function waterLines(img: Raster, opts: { tolerance?: number; sea?: [number, number, number] } = {}): Uint8Array {
	const { width: w, height: h } = img;
	const n = w * h;
	const wet = wetMask(img, opts);
	const out = new Uint8Array(n);
	const dry = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && !wet[y * w + x];
	// Land within `r` pixels in a direction.
	const near = (x: number, y: number, dx: number, dy: number, r: number) => {
		for (let k = 1; k <= r; k++) if (dry(x + dx * k, y + dy * k)) return true;
		return false;
	};
	for (let i = 0; i < n; i++) {
		if (!wet[i]) continue;
		const x = i % w;
		const y = (i - x) / w;
		// The water's edge, and the whole of thin water (a river), so a border can follow its middle.
		if (near(x, y, -1, 0, 1) || near(x, y, 1, 0, 1) || near(x, y, 0, -1, 1) || near(x, y, 0, 1, 1)) out[i] = 1;
		else if ((near(x, y, -1, 0, 3) && near(x, y, 1, 0, 3)) || (near(x, y, 0, -1, 3) && near(x, y, 0, 1, 3))) out[i] = 1;
	}
	return out;
}

/** The water itself (sea, lakes, rivers): 1 for water, as `waterLines` reads it. */
export function wetMask(img: Raster, opts: { tolerance?: number; sea?: [number, number, number] } = {}): Uint8Array {
	const { width: w, height: h, data } = img;
	const n = w * h;
	// The sea's colour: given (read from the whole map when this is only the part in view), else from the edge.
	const [sr, sg, sb] = opts.sea ?? edgeColor(img);
	const tol = opts.tolerance ?? 12;
	let wet: Uint8Array = new Uint8Array(n);
	for (let i = 0; i < n; i++) {
		const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
		if (colorDist(data, i * 4, sr, sg, sb) <= tol || (b > r + 15 && b + 6 >= g)) wet[i] = 1;
	}
	// Specks of blue on land (a blue banner, a shaded roof) aren't water.
	const labels = labelComponents(wet, w, h);
	const size = new Map<number, number>();
	for (let i = 0; i < n; i++) if (labels[i]) size.set(labels[i], (size.get(labels[i]) ?? 0) + 1);
	const speck = Math.max(10, Math.round(n / 40000));
	for (let i = 0; i < n; i++) if (wet[i] && (size.get(labels[i]) ?? 0) < speck) wet[i] = 0;
	// Labels, ships and compass roses drawn on the sea are sea; islands stay land.
	return fillHoles(wet, w, h, undefined, (Math.round(n / 4000) + 20) / n);
}

export interface LineOptions {
	/** 0–100: how different a pixel may be from the line's colour and still be part of it. */
	tolerance: number;
	/** Pixels: breaks up to this wide (dashed roads, labels across a river) are joined. */
	gap: number;
	/** Pixels: shorter lines and stubs are dropped. */
	minLength: number;
	/** Only lines joined to the clicked one, or every line of that colour on the map. */
	connected: boolean;
}

/**
 * The colour of a thin line near a click: the pixel within a few pixels that stands out most from
 * the background around it, so clicking next to a 2-pixel road still finds the road.
 */
export function lineColorAt(img: Raster, x: number, y: number, radius = 4): { color: [number, number, number]; at: Pt } | null {
	const { width: w, height: h, data } = img;
	const bg = sampleColor(img, x, y, Math.max(4, radius + 2));
	let best = -1;
	let bestScore = 8;
	for (let dy = -radius; dy <= radius; dy++) {
		for (let dx = -radius; dx <= radius; dx++) {
			const px = x + dx;
			const py = y + dy;
			if (px < 0 || py < 0 || px >= w || py >= h) continue;
			const i = (py * w + px) * 4;
			// Different from the background, and nearer the click is better.
			const score = colorDist(data, i, bg[0], bg[1], bg[2]) - Math.hypot(dx, dy) * 1.5;
			if (score > bestScore) [best, bestScore] = [i, score];
		}
	}
	if (best < 0) return null;
	const px = (best / 4) % w;
	const py = Math.floor(best / 4 / w);
	return { color: [data[best], data[best + 1], data[best + 2]], at: [px, py] };
}

/** Each pixel's surroundings: the image averaged over a (2r+1)² box, which a thin line barely changes. */
function boxBlur(img: Raster, r: number): Float32Array {
	const { width: w, height: h, data } = img;
	const tmp = new Float32Array(w * h * 3);
	const out = new Float32Array(w * h * 3);
	// Rows, then columns, as running sums.
	for (let y = 0; y < h; y++) {
		for (let c = 0; c < 3; c++) {
			let sum = 0;
			let count = 0;
			for (let x = -r; x < w; x++) {
				const add = x + r;
				if (add < w) (sum += data[(y * w + add) * 4 + c]), count++;
				const drop = x - r - 1;
				if (drop >= 0) (sum -= data[(y * w + drop) * 4 + c]), count--;
				if (x >= 0) tmp[(y * w + x) * 3 + c] = sum / count;
			}
		}
	}
	for (let x = 0; x < w; x++) {
		for (let c = 0; c < 3; c++) {
			let sum = 0;
			let count = 0;
			for (let y = -r; y < h; y++) {
				const add = y + r;
				if (add < h) (sum += tmp[(add * w + x) * 3 + c]), count++;
				const drop = y - r - 1;
				if (drop >= 0) (sum -= tmp[(drop * w + x) * 3 + c]), count--;
				if (y >= 0) out[(y * w + x) * 3 + c] = sum / count;
			}
		}
	}
	return out;
}

/** colorDist between two plain colours. */
function rgbDist(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
	const rm = (r1 + r2) / 2;
	const dr = r1 - r2;
	const dg = g1 - g2;
	const db = b1 - b2;
	return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db) / 7.65;
}

/**
 * How much each pixel looks like the line rather than what's around it, 0–1: where it sits between
 * its local background and the line's colour. A 2-pixel road's anti-aliased edges (half road, half
 * field) score about 0.5, so the road comes out whole instead of in pieces; the field scores 0. A
 * pixel of a quite different colour (a blue river beside a brown road) never counts, however much it
 * stands out. `colors`: the line's colour, and optionally its colour further along.
 */
export function lineLikeness(img: Raster, colors: [number, number, number][], tolerance: number, radius = 6): Float32Array {
	const { width: w, height: h, data } = img;
	const bg = boxBlur(img, radius);
	const out = new Float32Array(w * h);
	const gate = Math.max(8, tolerance * 2.5);
	for (let i = 0; i < w * h; i++) {
		const br = bg[i * 3];
		const bgg = bg[i * 3 + 1];
		const bb = bg[i * 3 + 2];
		const dBg = colorDist(data, i * 4, br, bgg, bb);
		let best = 0;
		for (const c of colors) {
			const dLine = colorDist(data, i * 4, c[0], c[1], c[2]);
			if (dLine > gate) continue;
			const sep = rgbDist(c[0], c[1], c[2], br, bgg, bb);
			// Inside a wide stretch of the line its surroundings are line-coloured too: go by colour alone.
			const t = sep < 4 ? 1 - dLine / gate : (sep * sep + dBg * dBg - dLine * dLine) / (2 * sep * sep);
			best = Math.max(best, Math.min(1, Math.max(0, dLine <= tolerance ? Math.max(t, 0.75) : t)));
		}
		out[i] = best;
	}
	return out;
}

/** Zhang–Suen thinning: reduces a mask to a one-pixel-wide centre line, in place. */
export function thin(mask: Uint8Array, w: number, h: number) {
	let todo: number[] = [];
	for (let i = 0; i < mask.length; i++) {
		const x = i % w;
		if (mask[i] && x > 0 && x < w - 1 && i >= w && i < w * (h - 1)) todo.push(i);
		else if (mask[i]) mask[i] = 0; // the outermost pixels can't be judged; a line never needs them
	}
	const kill: number[] = [];
	for (let changed = true; changed; ) {
		changed = false;
		for (let pass = 0; pass < 2; pass++) {
			kill.length = 0;
			for (const i of todo) {
				if (!mask[i]) continue;
				const p2 = mask[i - w], p3 = mask[i - w + 1], p4 = mask[i + 1], p5 = mask[i + w + 1];
				const p6 = mask[i + w], p7 = mask[i + w - 1], p8 = mask[i - 1], p9 = mask[i - w - 1];
				const b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
				if (b < 2 || b > 6) continue;
				const seq = [p2, p3, p4, p5, p6, p7, p8, p9, p2];
				let a = 0;
				for (let k = 0; k < 8; k++) if (!seq[k] && seq[k + 1]) a++;
				if (a !== 1) continue;
				if (pass === 0 ? p2 * p4 * p6 || p4 * p6 * p8 : p2 * p4 * p8 || p2 * p6 * p8) continue;
				kill.push(i);
			}
			for (const i of kill) mask[i] = 0;
			if (kill.length) changed = true;
		}
		todo = todo.filter((i) => mask[i]);
	}
}

const N8 = (w: number) => [-w - 1, -w, -w + 1, -1, 1, w - 1, w, w + 1];

/**
 * Splits a one-pixel-wide skeleton into polylines running between ends and junctions, drops short
 * stubs that branch off, and joins pieces that meet end to end again.
 */
export function skeletonLines(skel: Uint8Array, w: number, h: number, minStub: number): Pt[][] {
	const nb = N8(w);
	const neighbours = (i: number) => {
		const x = i % w;
		const out: number[] = [];
		for (const d of nb) {
			const j = i + d;
			if (j < 0 || j >= skel.length) continue;
			const jx = j % w;
			if (Math.abs(jx - x) > 1) continue;
			if (skel[j]) out.push(j);
		}
		return out;
	};
	const degree = new Uint8Array(skel.length);
	for (let i = 0; i < skel.length; i++) if (skel[i]) degree[i] = neighbours(i).length;
	const isNode = (i: number) => degree[i] !== 2;
	const used = new Set<string>();
	const edge = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);
	type Seg = { px: number[]; a: number; b: number };
	let segs: Seg[] = [];
	const walk = (start: number, first: number) => {
		const px = [start, first];
		used.add(edge(start, first));
		let prev = start;
		let cur = first;
		while (!isNode(cur) && cur !== start) {
			const next = neighbours(cur).find((j) => j !== prev && !used.has(edge(cur, j)));
			if (next === undefined) break;
			used.add(edge(cur, next));
			px.push(next);
			prev = cur;
			cur = next;
		}
		segs.push({ px, a: start, b: cur });
	};
	for (let i = 0; i < skel.length; i++) {
		if (!skel[i] || !isNode(i) || degree[i] === 0) continue;
		for (const j of neighbours(i)) if (!used.has(edge(i, j))) walk(i, j);
	}
	// Closed loops have no ends or junctions: start anywhere on them.
	for (let i = 0; i < skel.length; i++) {
		if (!skel[i] || degree[i] !== 2) continue;
		const free = neighbours(i).find((j) => !used.has(edge(i, j)));
		if (free !== undefined) walk(i, free);
	}
	// Junctions are often a tight knot of pixels; ends within 2 pixels of each other are one place.
	const placeOf = new Map<number, number>();
	const nodeSet = new Set(segs.flatMap((s) => [s.a, s.b]));
	for (const p of nodeSet) {
		if (placeOf.has(p)) continue;
		placeOf.set(p, p);
		const queue = [p];
		while (queue.length) {
			const q = queue.pop()!;
			const qx = q % w;
			for (let dy = -2; dy <= 2; dy++) {
				for (let dx = -2; dx <= 2; dx++) {
					if (qx + dx < 0 || qx + dx >= w) continue;
					const r = q + dy * w + dx;
					if (nodeSet.has(r) && !placeOf.has(r)) {
						placeOf.set(r, p);
						queue.push(r);
					}
				}
			}
		}
	}
	const place = (i: number) => placeOf.get(i) ?? i;
	const count = () => {
		const c = new Map<number, number>();
		for (const s of segs) {
			c.set(place(s.a), (c.get(place(s.a)) ?? 0) + 1);
			c.set(place(s.b), (c.get(place(s.b)) ?? 0) + 1);
		}
		return c;
	};
	// Stubs: short pieces with a loose end that branch off a junction (a few passes, as removing
	// some turns their junction into a plain bend).
	let pieces = segs;
	for (let pass = 0; pass < 4; pass++) {
		segs = pieces;
		const c = count();
		pieces = segs.filter((s) => {
			const ca = c.get(place(s.a)) ?? 0;
			const cb = c.get(place(s.b)) ?? 0;
			return !(((ca === 1 && cb >= 3) || (cb === 1 && ca >= 3)) && s.px.length < minStub);
		});
		if (pieces.length === segs.length) break;
	}
	segs = pieces;
	// Which way a piece leaves a place: from its end there towards a point a few pixels along.
	const leaving = (s: Seg, p: number): [number, number] => {
		const px = place(s.a) === p ? s.px : [...s.px].reverse();
		const from = px[0];
		const to = px[Math.min(px.length - 1, 6)];
		const dx = (to % w) - (from % w);
		const dy = Math.floor(to / w) - Math.floor(from / w);
		const len = Math.hypot(dx, dy) || 1;
		return [dx / len, dy / len];
	};
	// Join pieces through each place: two that meet only each other, or, where a branch joins (or
	// thinning left a knot), the two that carry on most nearly straight, so a road isn't cut into bits.
	for (let changed = true; changed; ) {
		changed = false;
		const ends = new Map<number, number[]>();
		segs.forEach((s, k) => {
			for (const p of [place(s.a), place(s.b)]) {
				const list = ends.get(p) ?? [];
				list.push(k);
				ends.set(p, list);
			}
		});
		const dead = new Set<number>();
		const touched = new Set<number>();
		for (const [p, all] of ends) {
			if (all.length < 2) continue;
			let list = all;
			if (all.length > 2) {
				let best: [number, number] | undefined;
				let bestDot = -0.5;
				for (let x = 0; x < all.length; x++) {
					for (let y = x + 1; y < all.length; y++) {
						if (all[x] === all[y]) continue;
						const u = leaving(segs[all[x]], p);
						const v = leaving(segs[all[y]], p);
						// Straight through: leaving in opposite directions.
						const dot = u[0] * v[0] + u[1] * v[1];
						if (dot < bestDot) [best, bestDot] = [[all[x], all[y]], dot];
					}
				}
				if (!best) continue;
				list = best;
			}
			const [i, j] = list;
			if (i === j || dead.has(i) || dead.has(j) || touched.has(i) || touched.has(j)) continue;
			const s = segs[i];
			const t = segs[j];
			const sEnds = place(s.b) === p;
			const tStarts = place(t.a) === p;
			const sp = sEnds ? s.px : [...s.px].reverse();
			const tp = tStarts ? t.px : [...t.px].reverse();
			segs[i] = { px: [...sp, ...tp.slice(1)], a: sEnds ? s.a : s.b, b: tStarts ? t.b : t.a };
			dead.add(j);
			touched.add(i);
			changed = true;
		}
		segs = segs.filter((_, k) => !dead.has(k));
	}
	return segs.map((s) => s.px.map((i) => [(i % w) + 0.5, Math.floor(i / w) + 0.5] as Pt));
}

/**
 * Follows a road or river from one point to another: the cheapest path through the image, where
 * pixels of the line's colour are cheap and anything else is dear, so it keeps to the line round
 * bends and across dashes or labels. Works within a box around the two points. Returns image pixels.
 */
/** `endColor`: the line's colour at the far click, for roads whose ink fades or changes along the way. */
export function traceBetween(img: Raster, a: Pt, b: Pt, color: [number, number, number], tolerance: number, endColor?: [number, number, number]): Pt[] {
	const { width: w, height: h, data } = img;
	const pad = Math.max(30, Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.35);
	const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0]) - pad));
	const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1]) - pad));
	const x1 = Math.min(w - 1, Math.ceil(Math.max(a[0], b[0]) + pad));
	const y1 = Math.min(h - 1, Math.ceil(Math.max(a[1], b[1]) + pad));
	const bw = x1 - x0 + 1;
	const bh = y1 - y0 + 1;
	const local = (p: Pt) => Math.max(0, Math.min(bh - 1, Math.round(p[1]) - y0)) * bw + Math.max(0, Math.min(bw - 1, Math.round(p[0]) - x0));
	// Only the box is read: likeness over a crop of the image.
	const crop = new Uint8ClampedArray(bw * bh * 4);
	for (let y = 0; y < bh; y++) crop.set(data.subarray(((y + y0) * w + x0) * 4, ((y + y0) * w + x0 + bw) * 4), y * bw * 4);
	const like = lineLikeness({ data: crop, width: bw, height: bh }, endColor ? [color, endColor] : [color], tolerance);
	const cost = new Float32Array(bw * bh);
	for (let y = 0; y < bh; y++) {
		for (let x = 0; x < bw; x++) {
			const at = (y * bw + x) * 4;
			let d = colorDist(crop, at, color[0], color[1], color[2]);
			if (endColor) d = Math.min(d, colorDist(crop, at, endColor[0], endColor[1], endColor[2]));
			// Close in colour, or standing out from its surroundings the way the line does.
			const off = Math.min((d / Math.max(1, tolerance * 2)) ** 1.5, (1 - like[y * bw + x]) ** 2);
			// On the line: 0.15 a pixel; off it, up to 1.15 (so a gap of a few pixels is still cheap to cross).
			cost[y * bw + x] = 0.15 + Math.min(1, off);
		}
	}
	const start = local(a);
	const goal = local(b);
	// 64-bit, like the heap's numbers: rounding here would make fresh entries look stale.
	const dist = new Float64Array(bw * bh).fill(Infinity);
	const from = new Int32Array(bw * bh).fill(-1);
	// Binary heap of [distance, index].
	const heapD: number[] = [];
	const heapI: number[] = [];
	const push = (d: number, i: number) => {
		let k = heapD.length;
		heapD.push(d);
		heapI.push(i);
		while (k > 0) {
			const p = (k - 1) >> 1;
			if (heapD[p] <= d) break;
			heapD[k] = heapD[p];
			heapI[k] = heapI[p];
			k = p;
		}
		heapD[k] = d;
		heapI[k] = i;
	};
	const pop = (): number => {
		const top = heapI[0];
		const lastD = heapD.pop()!;
		const lastI = heapI.pop()!;
		if (heapD.length) {
			let k = 0;
			for (;;) {
				const l = 2 * k + 1;
				if (l >= heapD.length) break;
				const r = l + 1;
				const c = r < heapD.length && heapD[r] < heapD[l] ? r : l;
				if (heapD[c] >= lastD) break;
				heapD[k] = heapD[c];
				heapI[k] = heapI[c];
				k = c;
			}
			heapD[k] = lastD;
			heapI[k] = lastI;
		}
		return top;
	};
	// A*: the cheapest a step can be is 0.15 a pixel, so 0.15 × the grid distance left never
	// overestimates, and the search heads for the goal instead of spreading in every direction.
	const gx = goal % bw;
	const gy = (goal - gx) / bw;
	const est = (i: number) => {
		const dx = Math.abs((i % bw) - gx);
		const dy = Math.abs(Math.floor(i / bw) - gy);
		return 0.15 * (Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy));
	};
	dist[start] = 0;
	push(est(start), start);
	const steps: [number, number, number][] = [[-1, 0, 1], [1, 0, 1], [0, -1, 1], [0, 1, 1], [-1, -1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [1, 1, Math.SQRT2]];
	while (heapD.length) {
		const f = heapD[0];
		const i = pop();
		const d = dist[i];
		if (f > d + est(i) + 1e-9) continue;
		if (i === goal) break;
		const x = i % bw;
		const y = (i - x) / bw;
		for (const [dx, dy, len] of steps) {
			const nx = x + dx;
			const ny = y + dy;
			if (nx < 0 || ny < 0 || nx >= bw || ny >= bh) continue;
			const j = ny * bw + nx;
			const nd = d + len * (cost[i] + cost[j]) / 2;
			if (nd < dist[j]) {
				dist[j] = nd;
				from[j] = i;
				push(nd + est(j), j);
			}
		}
	}
	const out: Pt[] = [];
	for (let i = goal; i >= 0; i = from[i]) {
		out.push([(i % bw) + x0 + 0.5, Math.floor(i / bw) + y0 + 0.5]);
		if (i === start) break;
	}
	out.reverse();
	return simplifyOpen(out, 1.2);
}

function lineLength(pts: Pt[]): number {
	let d = 0;
	for (let i = 1; i < pts.length; i++) d += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
	return d;
}

export interface LinesResult {
	lines: Pt[][];
	color: [number, number, number];
	/** So much of the image matched that it can't be a line (the colour is the sea's or the land's). */
	tooMuch?: boolean;
}

/**
 * Traces roads or rivers of the colour found at the click: picks out pixels of that colour, closes
 * gaps (dashes, labels), thins them to centre lines and returns those as simplified polylines in
 * image pixels.
 */
export function detectLines(img: Raster, seed: Pt, opts: LineOptions): LinesResult | null {
	const { width: w, height: h, data } = img;
	const n = w * h;
	const found = lineColorAt(img, Math.round(seed[0]), Math.round(seed[1]));
	if (!found) return null;
	const { color, at } = found;
	// The line's pixels: its colour, or standing out from their surroundings the way the line does
	// (anti-aliased edges and faded ink, which a plain colour match drops and leaves the line in pieces).
	const like = lineLikeness(img, [color], opts.tolerance);
	const pass = new Uint8Array(n);
	for (let i = 0; i < n; i++) pass[i] = colorDist(data, i * 4, color[0], color[1], color[2]) <= opts.tolerance || like[i] >= 0.55 ? 1 : 0;
	// Broad areas of the same colour (a sea, a lake) aren't lines: take them out, so a river that
	// flows into the sea is traced as a river. Anything wider than ~10 px counts as an area.
	const broad = dilate(erode(pass, w, h, 5), w, h, 6);
	for (let i = 0; i < n; i++) if (broad[i]) pass[i] = 0;
	// Bridge the breaks, then keep what's joined to the click (or everything that's long enough).
	const grown = dilate(pass, w, h, Math.max(1, opts.gap / 2));
	const labels = labelComponents(grown, w, h);
	const mine = labels[at[1] * w + at[0]];
	const keep = new Uint8Array(n);
	let kept = 0;
	for (let i = 0; i < n; i++) if (labels[i] && (!opts.connected || labels[i] === mine)) kept += keep[i] = 1;
	// Roads and rivers are thin: when a fifth of the map matches, the colour picked is an area's.
	if (kept > n * 0.2) return { lines: [], color, tooMuch: true };
	thin(keep, w, h);
	const lines = skeletonLines(keep, w, h, Math.max(6, opts.gap * 2 + 2))
		.filter((l) => lineLength(l) >= opts.minLength)
		.map((l) => simplifyOpen(l, 1.2))
		.filter((l) => l.length >= 2);
	return { lines, color };
}
