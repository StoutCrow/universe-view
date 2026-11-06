import type ChroniclePlugin from "../main";
import type { Entity } from "../types";
import { cultureColor, glyph, icon, resourceUrl, svg } from "./common";
import { GROUP_KINDS, groupKind } from "./houses";

export const NATION_BAR = 26;

/** Whether a name fits inside the part of a bar that's in view. */
export function nameFits(name: string, shownWidth: number): boolean {
	return name.length * 7 + 40 <= shownWidth;
}

export interface NationBar {
	/** Unique among what's drawn in this SVG: names its gradient and clip. */
	id: string;
	/** Where the bar goes, and its size, in the SVG's own coordinates. */
	left: number;
	top: number;
	width: number;
	height?: number;
	/** The part of those coordinates in view: the badge and name stay inside it. */
	viewLeft: number;
	viewRight: number;
	meta: string;
	/** Its name can be left off where something else needs the room. */
	label?: boolean;
}

/**
 * A nation's bar, as the lineage and the timeline both draw it: one function, so the two can't differ.
 * The bar fades to the current date while it stands, with a badge at its start (kept in view while the
 * bar is) holding its logo or its kind's icon, and its name inside where that fits, else just after it.
 */
export function drawNation(plugin: ChroniclePlugin, e: Entity, g: SVGGElement, defs: SVGElement, o: NationBar) {
	const h = o.height ?? NATION_BAR;
	const color = e.color ?? cultureColor(plugin, e.key);
	const open = !e.end;
	const bar = svg("rect", { x: o.left, y: o.top, width: o.width, height: h, rx: h / 2, class: "chronicle-lineage-bar" + (open ? " is-ongoing" : "") + (e.start?.approx ? " is-approx" : "") }, g);
	if (open) {
		const id = `chronicle-lineage-fade-${o.id}`;
		const grad = svg("linearGradient", { id, x1: 0, x2: 1, y1: 0, y2: 0 }, defs);
		svg("stop", { offset: Math.max(0, 1 - Math.min(0.5, 80 / o.width)), "stop-color": color, "stop-opacity": 0.55 }, grad);
		svg("stop", { offset: 1, "stop-color": color, "stop-opacity": 0.04 }, grad);
		bar.setAttribute("style", `fill: url(#${id})`);
	}
	const bx = Math.min(Math.max(o.left, o.viewLeft + 2), o.left + o.width - h) + h / 2;
	const badge = svg("g", { class: "chronicle-lineage-badge", transform: `translate(${bx},${o.top + h / 2})` }, g);
	svg("circle", { r: h / 2 - 2, class: "chronicle-lineage-badge-bg" }, badge);
	const logo = resourceUrl(plugin, e.logo ?? e.image);
	const kindIcon = GROUP_KINDS[groupKind(plugin, e)].icon;
	if (logo) {
		const clipId = `chronicle-lineage-clip-${o.id}`;
		svg("circle", { r: h / 2 - 3 }, svg("clipPath", { id: clipId }, defs));
		svg("image", { href: logo, x: -(h / 2 - 3), y: -(h / 2 - 3), width: h - 6, height: h - 6, "clip-path": `url(#${clipId})`, preserveAspectRatio: "xMidYMid slice" }, badge);
	} else {
		const fo = svg("foreignObject", { x: -7, y: -7, width: 14, height: 14, class: "uv-lin-badge-icon" }, badge);
		const holder = createDiv();
		fo.appendChild(holder);
		if (!glyph(holder, e.icon ?? kindIcon)) icon(holder, kindIcon);
	}
	if (o.label === false) return;
	const shownFrom = Math.max(o.left, o.viewLeft);
	const inside = nameFits(e.name, Math.min(o.left + o.width, o.viewRight) - shownFrom);
	const label = svg("text", { x: inside ? shownFrom + h + 4 : o.left + o.width + 8, y: o.top + h / 2 + 4, class: "chronicle-lineage-label" + (inside ? "" : " is-outside") }, g);
	svg("tspan", { class: "chronicle-lineage-name" }, label).textContent = e.name;
	if (o.meta) svg("tspan", { class: "chronicle-lineage-meta", dx: 8 }, label).textContent = o.meta;
}
