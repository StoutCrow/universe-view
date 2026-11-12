export interface PanZoomOptions {
	/** In embedded code blocks the wheel scrolls the note unless Ctrl/Cmd is held. */
	requireModifier?: boolean;
	minScale?: number;
	maxScale?: number;
	onChange?: (t: { x: number; y: number; k: number }) => void;
	/** Where pointers are listened for, when more than the SVG (HTML cards laid over it). */
	surface?: HTMLElement;
}

/**
 * Drag-to-pan, wheel-to-zoom and two-finger pinch for an SVG <g> layer. Touches never reach
 * Obsidian's own swipe gestures (on a phone a sideways drag would otherwise navigate back or forward).
 */
export class PanZoom {
	x = 0;
	y = 0;
	k = 1;
	private dragging: { id: number; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null = null;
	private cleanup: (() => void)[] = [];
	/** Whether the user has panned or zoomed; until then views keep auto-fitting on resize. */
	touched = false;
	/** True right after a drag, so click handlers can ignore the click that ends a pan. */
	justPanned = false;
	/** Fingers on the surface now, by pointer id. */
	private pointers = new Map<number, { x: number; y: number }>();
	private pinch: { d: number; mx: number; my: number; k: number; x: number; y: number } | null = null;
	/** True while two fingers are pinching: dragging a node or card waits until they lift. */
	get pinching(): boolean {
		return !!this.pinch;
	}

	constructor(private svg: SVGSVGElement, private layer: SVGGElement, private opts: PanZoomOptions = {}) {
		const surface: HTMLElement | SVGSVGElement = opts.surface ?? svg;
		// Pinch: seen in the capture phase, so a finger that lands on a node (which handles its own drag) still counts.
		const pair = () => {
			const [a, b] = [...this.pointers.values()];
			const r = svg.getBoundingClientRect();
			return { d: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), mx: (a.x + b.x) / 2 - r.left, my: (a.y + b.y) / 2 - r.top };
		};
		const onDownCapture = (evt: PointerEvent) => {
			if (evt.pointerType === "mouse") return;
			this.pointers.set(evt.pointerId, { x: evt.clientX, y: evt.clientY });
			if (this.pointers.size === 2 && !opts.requireModifier) {
				const p = pair();
				this.pinch = { d: p.d, mx: p.mx, my: p.my, k: this.k, x: this.x, y: this.y };
				this.dragging = null;
				this.touched = true;
			}
		};
		const onMoveCapture = (evt: PointerEvent) => {
			if (!this.pointers.has(evt.pointerId)) return;
			this.pointers.set(evt.pointerId, { x: evt.clientX, y: evt.clientY });
			const s = this.pinch;
			if (!s || this.pointers.size < 2) return;
			const p = pair();
			const k = Math.min(opts.maxScale ?? 4, Math.max(opts.minScale ?? 0.1, (s.k * p.d) / s.d));
			// The point under the fingers' first midpoint follows the midpoint as it moves.
			const lx = (s.mx - s.x) / s.k;
			const ly = (s.my - s.y) / s.k;
			this.k = k;
			this.x = p.mx - lx * k;
			this.y = p.my - ly * k;
			this.apply();
		};
		const onUpCapture = (evt: PointerEvent) => {
			if (!this.pointers.delete(evt.pointerId) || !this.pinch || this.pointers.size >= 2) return;
			this.pinch = null;
			this.justPanned = true;
			window.setTimeout(() => (this.justPanned = false), 0);
			// The finger still down carries on panning from where it is, without a jump.
			const [id, rest] = [...this.pointers.entries()][0] ?? [];
			if (id !== undefined && rest) this.dragging = { id, sx: rest.x, sy: rest.y, ox: this.x, oy: this.y, moved: true };
		};
		const keep = (evt: TouchEvent) => evt.stopPropagation();
		surface.addEventListener("pointerdown", onDownCapture, true);
		surface.addEventListener("pointermove", onMoveCapture, true);
		surface.addEventListener("pointerup", onUpCapture, true);
		surface.addEventListener("pointercancel", onUpCapture, true);
		// Only the touch's start: Obsidian's swipe never begins without it, while anything following the
		// finger with touchmove on the document still sees it.
		if (!opts.requireModifier) surface.addEventListener("touchstart", keep, { passive: true });
		this.cleanup.push(() => {
			surface.removeEventListener("pointerdown", onDownCapture, true);
			surface.removeEventListener("pointermove", onMoveCapture, true);
			surface.removeEventListener("pointerup", onUpCapture, true);
			surface.removeEventListener("pointercancel", onUpCapture, true);
			surface.removeEventListener("touchstart", keep);
		});
		const onWheel = (evt: WheelEvent) => {
			if (opts.requireModifier && !(evt.ctrlKey || evt.metaKey)) return;
			evt.preventDefault();
			this.touched = true;
			const r = svg.getBoundingClientRect();
			const delta = evt.deltaMode === 1 ? evt.deltaY * 16 : evt.deltaY;
			this.zoomAt(Math.exp(-delta * 0.0015), evt.clientX - r.left, evt.clientY - r.top);
		};
		const onDown = (evt: PointerEvent) => {
			if (evt.button !== 0 || this.pinch) return;
			const t = evt.target as Element;
			if (t.closest("[data-universeview-drag]")) return;
			this.dragging = { id: evt.pointerId, sx: evt.clientX, sy: evt.clientY, ox: this.x, oy: this.y, moved: false };
		};
		const onMove = (evt: PointerEvent) => {
			const d = this.dragging;
			if (!d || d.id !== evt.pointerId || this.pinch) return;
			const dx = evt.clientX - d.sx;
			const dy = evt.clientY - d.sy;
			if (!d.moved && Math.hypot(dx, dy) < 4) return;
			if (!d.moved) {
				d.moved = true;
				this.touched = true;
				surface.setPointerCapture?.(evt.pointerId);
				svg.addClass?.("is-panning");
			}
			this.x = d.ox + dx;
			this.y = d.oy + dy;
			this.apply();
		};
		const onUp = (evt: PointerEvent) => {
			const d = this.dragging;
			if (!d || d.id !== evt.pointerId) return;
			this.dragging = null;
			svg.removeClass?.("is-panning");
			if (d.moved) {
				this.justPanned = true;
				window.setTimeout(() => (this.justPanned = false), 0);
			}
		};
		surface.addEventListener("wheel", onWheel, { passive: false });
		surface.addEventListener("pointerdown", onDown);
		surface.addEventListener("pointermove", onMove);
		surface.addEventListener("pointerup", onUp);
		surface.addEventListener("pointercancel", onUp);
		this.cleanup.push(() => {
			surface.removeEventListener("wheel", onWheel);
			surface.removeEventListener("pointerdown", onDown);
			surface.removeEventListener("pointermove", onMove);
			surface.removeEventListener("pointerup", onUp);
			surface.removeEventListener("pointercancel", onUp);
		});
	}

	apply() {
		this.layer.setAttribute("transform", `translate(${this.x},${this.y}) scale(${this.k})`);
		this.opts.onChange?.({ x: this.x, y: this.y, k: this.k });
	}

	zoomAt(factor: number, cx: number, cy: number) {
		const min = this.opts.minScale ?? 0.1;
		const max = this.opts.maxScale ?? 4;
		const k = Math.min(max, Math.max(min, this.k * factor));
		const f = k / this.k;
		this.x = cx - (cx - this.x) * f;
		this.y = cy - (cy - this.y) * f;
		this.k = k;
		this.apply();
	}

	zoomBy(factor: number) {
		this.touched = true;
		const r = this.svg.getBoundingClientRect();
		this.zoomAt(factor, r.width / 2, r.height / 2);
	}

	/** Fits a content box (in layer coordinates) into the viewport. */
	fit(box: { x: number; y: number; width: number; height: number }, padding = 40, maxScale = 1.2) {
		this.touched = false;
		const r = this.svg.getBoundingClientRect();
		const w = r.width || 800;
		const h = r.height || 500;
		if (box.width <= 0 || box.height <= 0) return;
		let k = Math.min(maxScale, (w - padding * 2) / box.width, (h - padding * 2) / box.height);
		// On a phone-sized view, never so small the names can't be read: it centres instead, to pan around.
		if (w < 600 && !this.opts.requireModifier) k = Math.max(k, Math.min(maxScale, 0.6));
		this.k = Math.max(this.opts.minScale ?? 0.1, k);
		this.x = (w - box.width * this.k) / 2 - box.x * this.k;
		this.y = (h - box.height * this.k) / 2 - box.y * this.k;
		this.apply();
	}

	/** Centers a point (layer coordinates) at the current scale. */
	centerOn(px: number, py: number) {
		const r = this.svg.getBoundingClientRect();
		this.x = (r.width || 800) / 2 - px * this.k;
		this.y = (r.height || 500) / 2 - py * this.k;
		this.apply();
	}

	destroy() {
		this.cleanup.forEach((f) => f());
	}
}
