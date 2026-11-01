/**
 * Paint-bucket fill by what the ground is rather than its colour: click land and every bit of land
 * joined to it fills, whatever is drawn on it (hills, forests, names, shading), up to the coast,
 * rivers and other territories. Click water and the water fills instead. Pure, so it's testable.
 */

export interface LandFillOptions {
	/** Rivers (thin water) don't stop the fill: it carries on over them to the land beyond. */
	crossRivers?: boolean;
	/** Pixels: openings this narrow in the walls (a river's faint stretch, a gap between two lands) are closed. */
	seal?: number;
}

/** Thin water: land within 3 pixels on both sides, across or along. */
export function thinWater(wet: Uint8Array, w: number, h: number): Uint8Array {
	const out = new Uint8Array(w * h);
	const dry = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && !wet[y * w + x];
	const near = (x: number, y: number, dx: number, dy: number) => {
		for (let k = 1; k <= 3; k++) if (dry(x + dx * k, y + dy * k)) return true;
		return false;
	};
	for (let i = 0; i < w * h; i++) {
		if (!wet[i]) continue;
		const x = i % w;
		const y = (i - x) / w;
		if ((near(x, y, -1, 0) && near(x, y, 1, 0)) || (near(x, y, 0, -1) && near(x, y, 0, 1))) out[i] = 1;
	}
	return out;
}

/**
 * The region joined to `seed` of the same kind (land or water), as a 0/1 mask. `wet` is the water;
 * `blocked` is other territories (walls either way). With `seal`, the walls are thickened while
 * spreading, so the fill can't squeeze through a narrow gap, then the fill grows back out to them.
 */
export function landFill(wet: Uint8Array, w: number, h: number, seed: [number, number], blocked?: Uint8Array, opts: LandFillOptions = {}): Uint8Array {
	const n = w * h;
	const out = new Uint8Array(n);
	const [sx, sy] = seed;
	if (sx < 0 || sy < 0 || sx >= w || sy >= h) return out;
	const s = sy * w + sx;
	const river = opts.crossRivers ? thinWater(wet, w, h) : undefined;
	// What counts as the clicked kind of ground.
	const onLand = !wet[s] || !!river?.[s];
	const open = new Uint8Array(n);
	for (let i = 0; i < n; i++) open[i] = (onLand ? !wet[i] || (river ? river[i] : 0) : wet[i]) && !blocked?.[i] ? 1 : 0;
	if (!open[s]) return out;
	// Walls thickened by `seal` (a square reach), never closing over the clicked point itself.
	const seal = Math.max(0, Math.round(opts.seal ?? 0));
	let pass = open;
	if (seal) {
		pass = open.slice();
		for (let i = 0; i < n; i++) {
			if (open[i]) continue;
			const x = i % w;
			const y = (i - x) / w;
			for (let dy = -seal; dy <= seal; dy++)
				for (let dx = -seal; dx <= seal; dx++) {
					const nx = x + dx;
					const ny = y + dy;
					if (nx >= 0 && ny >= 0 && nx < w && ny < h) pass[ny * w + nx] = 0;
				}
		}
		if (!pass[s]) pass = open;
	}
	const queue = new Int32Array(n);
	const spread = (from: Int32Array, count: number, allowed: Uint8Array) => {
		let qh = 0;
		let qt = count;
		while (qh < qt) {
			const i = from[qh++];
			const x = i % w;
			const y = (i - x) / w;
			const step = (j: number) => {
				if (!out[j] && allowed[j]) {
					out[j] = 1;
					from[qt++] = j;
				}
			};
			if (x > 0) step(i - 1);
			if (x < w - 1) step(i + 1);
			if (y > 0) step(i - w);
			if (y < h - 1) step(i + w);
		}
		return qt;
	};
	out[s] = 1;
	queue[0] = s;
	spread(queue, 1, pass);
	if (pass !== open) {
		// Grow back out to the real walls, at most `seal` pixels, so the edge sits on the coast again.
		for (let k = 0; k < seal; k++) {
			let count = 0;
			const ring = new Int32Array(n);
			for (let i = 0; i < n; i++) {
				if (out[i] || !open[i]) continue;
				const x = i % w;
				if ((x > 0 && out[i - 1]) || (x < w - 1 && out[i + 1]) || (i >= w && out[i - w]) || (i < n - w && out[i + w])) ring[count++] = i;
			}
			if (!count) break;
			for (let c = 0; c < count; c++) out[ring[c]] = 1;
		}
	}
	absorbPockets(out, open, w, h, Math.max(64, (seal * 8) ** 2));
	return out;
}

/**
 * Small pockets of the clicked kind of ground left unfilled beside the fill (a narrow neck between a
 * river bend and a neighbour's border that thickened walls kept the fill out of) join it, so no
 * slivers of bare land are left between lands. Pockets reaching the picture's edge aren't joined.
 */
function absorbPockets(out: Uint8Array, open: Uint8Array, w: number, h: number, maxSize: number) {
	const n = w * h;
	const seen = new Uint8Array(n);
	const queue = new Int32Array(n);
	for (let s = 0; s < n; s++) {
		if (seen[s] || out[s] || !open[s]) continue;
		let qt = 0;
		queue[qt++] = s;
		seen[s] = 1;
		let touchesFill = false;
		let edge = false;
		for (let qh = 0; qh < qt; qh++) {
			const i = queue[qh];
			const x = i % w;
			if (x === 0 || x === w - 1 || i < w || i >= n - w) edge = true;
			const step = (j: number) => {
				if (out[j]) touchesFill = true;
				else if (open[j] && !seen[j]) {
					seen[j] = 1;
					queue[qt++] = j;
				}
			};
			if (x > 0) step(i - 1);
			if (x < w - 1) step(i + 1);
			if (i >= w) step(i - w);
			if (i < n - w) step(i + w);
		}
		if (touchesFill && !edge && qt <= maxSize) for (let k = 0; k < qt; k++) out[queue[k]] = 1;
	}
}
