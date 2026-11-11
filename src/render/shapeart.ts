import { svg } from "./common";

/**
 * The timeline's category shapes (arrow, diamond, chevron, hexagon, triangle, star) drawn as SVG, not CSS clip-path.
 * Dots are one scaled polygon (points in a 100x100 box). Bars keep fixed-size end caps (the slanted ends are always
 * 8 or 10px wide whatever the bar's length), so a bar that is dragged longer still looks right: a plain block fills
 * the middle and the caps are small SVGs. Colours come from CSS (--uv-art-fill, --uv-art-edge).
 */

const DOTS: Record<string, string> = {
	arrow: "0,0 100,50 0,100",
	diamond: "50,0 100,50 50,100 0,50",
	chevron: "0,0 60,0 100,50 60,100 0,100 40,50",
	hexagon: "25,0 75,0 100,50 75,100 25,100 0,50",
	triangle: "50,0 100,100 0,100",
	star: "50,0 62,35 100,38 70,60 80,100 50,76 20,100 30,60 0,38 38,35",
};

/** One end of a bar: its width, the pieces it fills (points in a width x 100 box) and where the bar's edge line runs along it. */
interface Cap {
	w: number;
	polys: string[];
	top?: [number, number];
	bottom?: [number, number];
}

const POINT_RIGHT: Cap = { w: 10, polys: ["0,0 10,50 0,100"] };

const BARS: Record<string, { left?: Cap; right: Cap }> = {
	arrow: { right: POINT_RIGHT },
	chevron: { left: { w: 10, polys: ["0,0 10,0 10,50", "0,100 10,100 10,50"], top: [0, 10], bottom: [0, 10] }, right: POINT_RIGHT },
	hexagon: { left: { w: 10, polys: ["10,0 10,100 0,50"] }, right: POINT_RIGHT },
	triangle: { left: { w: 10, polys: ["10,0 10,100 0,100"], bottom: [0, 10] }, right: { w: 10, polys: ["0,0 10,0 0,100"], top: [0, 10] } },
	star: {
		left: { w: 8, polys: ["0,0 8,0 8,50", "0,100 8,100 8,50"], top: [0, 8], bottom: [0, 8] },
		right: { w: 8, polys: ["0,0 8,0 0,50", "0,100 8,100 0,50"], top: [0, 8], bottom: [0, 8] },
	},
};

/** Gives a dot its shape. Returns false for shapes that need no drawing (circle, square, hatch). */
export function shapeDot(dot: HTMLElement, shape: string): boolean {
	const points = DOTS[shape];
	if (!points) return false;
	dot.addClass("has-art");
	const art = svg("svg", { class: "uv-shape-art", viewBox: "0 0 100 100", preserveAspectRatio: "none", "aria-hidden": "true" });
	svg("polygon", { points }, art);
	dot.prepend(art);
	return true;
}

function capEl(bar: HTMLElement, cap: Cap, side: "left" | "right") {
	const holder = bar.createDiv({ cls: `uv-art-cap is-${side}` });
	holder.style.width = `${cap.w}px`;
	const art = svg("svg", { viewBox: `0 0 ${cap.w} 100`, preserveAspectRatio: "none", "aria-hidden": "true" }, holder);
	for (const points of cap.polys) svg("polygon", { points }, art);
	if (cap.top) svg("line", { x1: cap.top[0], x2: cap.top[1], y1: 0, y2: 0 }, art);
	if (cap.bottom) svg("line", { x1: cap.bottom[0], x2: cap.bottom[1], y1: 100, y2: 100 }, art);
}

/** Gives a bar its shape: a body block between two end caps. Returns false when the shape needs no drawing. */
export function shapeBar(bar: HTMLElement, shape: string): boolean {
	const parts = BARS[shape];
	if (!parts) return false;
	bar.addClass("has-art");
	const body = bar.createDiv({ cls: "uv-art-body" });
	body.style.left = `${parts.left?.w ?? 0}px`;
	body.style.right = `${parts.right.w}px`;
	if (!parts.left) body.addClass("has-left-edge");
	if (parts.left) capEl(bar, parts.left, "left");
	capEl(bar, parts.right, "right");
	return true;
}
