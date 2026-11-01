import { simplifyRing, traceOutlines, type Pt, type Raster } from "./fill";

/** One flat colour found on a political map, with the land it covers. */
export interface ColourArea {
	rgb: [number, number, number];
	/** Share of the picture it covers. */
	share: number;
	/** Its outlines, in the map's own pixels. */
	rings: Pt[][];
}

export const hex = (rgb: [number, number, number]) => "#" + rgb.map((n) => Math.round(n).toString(16).padStart(2, "0")).join("");

/**
 * The flat colours of a political map: realms painted in solid colours. Pixels are sampled and
 * grouped by colour; greys, near-white and near-black (paper, text, borders, sea that isn't coloured)
 * are left out, as are colours covering too little to be a realm. Each colour is then traced into
 * outlines, scaled up to the full picture.
 */
export function findColourAreas(img: Raster, scale: number, opts: { minShare?: number; tolerance?: number; max?: number } = {}): ColourArea[] {
	const { width: w, height: h, data } = img;
	const minShare = opts.minShare ?? 0.004;
	const tol = opts.tolerance ?? 34;
	const counts = new Map<number, { n: number; r: number; g: number; b: number }>();
	const step = Math.max(1, Math.floor(Math.sqrt((w * h) / 160000)));
	let samples = 0;
	for (let y = 0; y < h; y += step) {
		for (let x = 0; x < w; x += step) {
			const i = (y * w + x) * 4;
			if (data[i + 3] < 200) continue;
			const r = data[i];
			const g = data[i + 1];
			const b = data[i + 2];
			samples++;
			const hi = Math.max(r, g, b);
			const lo = Math.min(r, g, b);
			// Paper, ink and grey borders aren't realms.
			if (hi - lo < 28 || hi < 40 || lo > 235) continue;
			const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
			const c = counts.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
			c.n++;
			c.r += r;
			c.g += g;
			c.b += b;
			counts.set(key, c);
		}
	}
	// Merge near colours (antialiased edges, slight noise) into one per realm, biggest first.
	const groups: { n: number; rgb: [number, number, number] }[] = [];
	for (const c of [...counts.values()].sort((a, b) => b.n - a.n)) {
		const rgb: [number, number, number] = [c.r / c.n, c.g / c.n, c.b / c.n];
		const near = groups.find((g) => Math.hypot(g.rgb[0] - rgb[0], g.rgb[1] - rgb[1], g.rgb[2] - rgb[2]) < tol);
		if (near) near.n += c.n;
		else groups.push({ n: c.n, rgb });
	}
	const keep = groups.filter((g) => g.n / Math.max(1, samples) >= minShare).slice(0, opts.max ?? 32);
	return keep.map((g) => {
		const mask = new Uint8Array(w * h);
		const [r0, g0, b0] = g.rgb;
		for (let i = 0, p = 0; p < w * h; p++, i += 4) {
			if (data[i + 3] < 200) continue;
			if (Math.hypot(data[i] - r0, data[i + 1] - g0, data[i + 2] - b0) < tol) mask[p] = 1;
		}
		const rings = traceOutlines(mask, w, h, Math.max(24, (w * h) / 40000))
			.map((r) => simplifyRing(r, 1.2).map(([x, y]) => [Math.round(x * scale * 10) / 10, Math.round(y * scale * 10) / 10] as Pt))
			.filter((r) => r.length >= 3);
		return { rgb: g.rgb, share: g.n / Math.max(1, samples), rings };
	}).filter((a) => a.rings.length);
}

