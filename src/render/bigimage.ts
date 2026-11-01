/**
 * Huge map images (10,000+ px across) at full detail without running out of memory. Each is decoded
 * once and shared by every map that shows it (compare mode, era swaps, reopening): whole copies of
 * at most 16 megapixels for zoomed-out views and the image tools (coasts, roads, fill, borders), and
 * the full-size image cut into compressed pieces, of which only those on screen are decoded.
 */

/** Pixels kept for one image when it can't be cut into pieces: about 160 MB. */
export const MAX_PIXELS = 40_000_000;
/** The largest whole copy kept when the full image is in pieces: about 64 MB. */
export const OVERVIEW_PIXELS = 16_000_000;
/** Side of one full-size piece, in pixels. */
export const PIECE = 1024;
/** Decoded pieces kept at once (4 MB each). */
const PIECES_KEPT = 48;

export interface Level {
	src: CanvasImageSource;
	width: number;
	height: number;
}

export interface Pyramid {
	/** Largest first; each about half the one before, down to ~1024 px. */
	levels: Level[];
	/** The image's real size, which map coordinates are in. */
	width: number;
	height: number;
	/** The image at full size, for zooming in past the largest copy. */
	full?: FullImage;
}

/** How big to keep an image so it stays under the pixel budget. */
export function cappedSize(width: number, height: number, max = MAX_PIXELS): [number, number] {
	const s = Math.min(1, Math.sqrt(max / Math.max(1, width * height)));
	return [Math.max(1, Math.round(width * s)), Math.max(1, Math.round(height * s))];
}

/** The pieces (row by row, `cols` across) that a rectangle of the full image touches. */
export function piecesIn(x: number, y: number, w: number, h: number, cols: number, rows: number, size = PIECE): number[] {
	const out: number[] = [];
	const c0 = Math.max(0, Math.floor(x / size));
	const r0 = Math.max(0, Math.floor(y / size));
	const c1 = Math.min(cols - 1, Math.ceil((x + w) / size) - 1);
	const r1 = Math.min(rows - 1, Math.ceil((y + h) / size) - 1);
	for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) out.push(r * cols + c);
	return out;
}

/**
 * The full-size image. Right after loading it's one decoded bitmap; in the background it's cut into
 * compressed pieces, and the bitmap (about 950 MB for a 16,000 × 15,000 px map) is let go.
 */
export class FullImage {
	readonly cols: number;
	readonly rows: number;
	private pieces: (Blob | null)[];
	private decoded = new Map<number, Promise<ImageBitmap | null>>();

	constructor(private bitmap: ImageBitmap | null, readonly width: number, readonly height: number) {
		this.cols = Math.ceil(width / PIECE);
		this.rows = Math.ceil(height / PIECE);
		this.pieces = new Array(this.cols * this.rows).fill(null);
	}

	/** Cuts the bitmap into pieces, a few at a time so the app stays responsive, then lets it go. */
	async cut() {
		const bmp = this.bitmap;
		if (!bmp) return;
		try {
			for (let i = 0; i < this.pieces.length; i++) {
				const [x, y] = this.origin(i);
				const c = new OffscreenCanvas(Math.min(PIECE, this.width - x), Math.min(PIECE, this.height - y));
				c.getContext("2d")!.drawImage(bmp, x, y, c.width, c.height, 0, 0, c.width, c.height);
				this.pieces[i] = await c.convertToBlob({ type: "image/webp", quality: 0.95 });
			}
		} catch (err) {
			// Keep drawing from the bitmap.
			console.error("UniverseView: couldn't cut the map image into pieces", err);
			return;
		}
		this.bitmap = null;
		bmp.close();
	}

	private origin(i: number): [number, number] {
		return [(i % this.cols) * PIECE, Math.floor(i / this.cols) * PIECE];
	}

	private piece(i: number): Promise<ImageBitmap | null> {
		const hit = this.decoded.get(i);
		if (hit) {
			this.decoded.delete(i);
			this.decoded.set(i, hit);
			return hit;
		}
		const blob = this.pieces[i];
		const made = blob ? createImageBitmap(blob).catch(() => null) : Promise.resolve(null);
		this.decoded.set(i, made);
		while (this.decoded.size > PIECES_KEPT) {
			const [old, p] = this.decoded.entries().next().value as [number, Promise<ImageBitmap | null>];
			this.decoded.delete(old);
			void p.then((b) => b?.close());
		}
		return made;
	}

	/** Draws part of the full image (`sx`…, in its pixels) into `dx`… on `ctx`. */
	async draw(ctx: CanvasRenderingContext2D, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number) {
		if (this.bitmap) {
			ctx.drawImage(this.bitmap, sx, sy, sw, sh, dx, dy, dw, dh);
			return;
		}
		const kx = dw / sw;
		const ky = dh / sh;
		await Promise.all(
			piecesIn(sx, sy, sw, sh, this.cols, this.rows).map(async (i) => {
				const bmp = await this.piece(i);
				if (!bmp) return;
				const [px, py] = this.origin(i);
				const ax = Math.max(sx, px);
				const ay = Math.max(sy, py);
				const bx = Math.min(sx + sw, px + bmp.width);
				const by = Math.min(sy + sh, py + bmp.height);
				if (bx <= ax || by <= ay) return;
				// Whole screen pixels, so neighbouring pieces meet without a hairline gap.
				const x0 = Math.floor(dx + (ax - sx) * kx);
				const y0 = Math.floor(dy + (ay - sy) * ky);
				try {
					ctx.drawImage(bmp, ax - px, ay - py, bx - ax, by - ay, x0, y0, Math.ceil(dx + (bx - sx) * kx) - x0, Math.ceil(dy + (by - sy) * ky) - y0);
				} catch {
					// Let go of while waiting; the next redraw decodes it again.
				}
			}),
		);
	}
}

const cache = new Map<string, Promise<Pyramid | null>>();

/**
 * The shared copies of an image (decoded once). `read` gives the file's bytes; `url` is the
 * fallback for images that can't be read as bytes. The two most recent images are kept.
 */
export function getPyramid(key: string, width: number, height: number, read: () => Promise<ArrayBuffer | null>, url: string): Promise<Pyramid | null> {
	const hit = cache.get(key);
	if (hit) {
		cache.delete(key);
		cache.set(key, hit);
		return hit;
	}
	const made = build(width, height, read, url).catch((err) => {
		console.error("UniverseView: couldn't prepare the map image", err);
		return null;
	});
	cache.set(key, made);
	while (cache.size > 2) cache.delete(cache.keys().next().value as string);
	return made;
}

async function build(width: number, height: number, read: () => Promise<ArrayBuffer | null>, url: string): Promise<Pyramid | null> {
	let base: Level | null = null;
	let full: FullImage | undefined;
	const bytes = typeof createImageBitmap === "function" ? await read() : null;
	if (bytes) {
		const blob = new Blob([bytes]);
		// Full detail where the image can be cut into pieces; otherwise one copy, capped.
		const whole = width * height > OVERVIEW_PIXELS && typeof OffscreenCanvas === "function" ? await createImageBitmap(blob).catch(() => null) : null;
		if (whole) {
			const [w, h] = cappedSize(width, height, OVERVIEW_PIXELS);
			const c = shrink(whole, w, h);
			if (c) {
				full = new FullImage(whole, width, height);
				base = { src: c, width: w, height: h };
			} else whole.close();
		}
		if (!base) {
			const [w, h] = cappedSize(width, height);
			const bmp = await createImageBitmap(blob, w < width ? { resizeWidth: w, resizeHeight: h, resizeQuality: "high" } : undefined).catch(() => null);
			if (bmp) base = { src: bmp, width: w, height: h };
		}
	}
	if (!base) {
		const img = await new Promise<HTMLImageElement | null>((resolve) => {
			const i = new Image();
			i.onload = () => resolve(i);
			i.onerror = () => resolve(null);
			i.src = url;
		});
		if (!img) return null;
		const [w, h] = cappedSize(width, height);
		base = { src: (w < width && shrink(img, w, h)) || img, width: w, height: h };
	}
	const levels: Level[] = [base];
	let prev = base;
	while (Math.max(prev.width, prev.height) > 1024) {
		const next = shrink(prev.src, Math.ceil(prev.width / 2), Math.ceil(prev.height / 2));
		if (!next) break;
		prev = { src: next, width: next.width, height: next.height };
		levels.push(prev);
	}
	void full?.cut();
	return { levels, width, height, full };
}

function shrink(src: CanvasImageSource, w: number, h: number): HTMLCanvasElement | null {
	const c = document.createElement("canvas");
	c.width = w;
	c.height = h;
	const ctx = c.getContext("2d");
	if (!ctx) return null;
	ctx.imageSmoothingQuality = "high";
	ctx.drawImage(src, 0, 0, w, h);
	return c;
}

/** The smallest copy with at least `ratio` of the full image's pixels across (or the largest kept). */
export function levelFor(p: Pyramid, ratio: number): Level {
	for (let i = p.levels.length - 1; i >= 0; i--) if (p.levels[i].width / p.width >= ratio) return p.levels[i];
	return p.levels[0];
}
