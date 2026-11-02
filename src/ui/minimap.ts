import type ChroniclePlugin from "../main";
import type { Entity, Territory } from "../types";
import { el, entityColor } from "../render/common";

const SVG = "http://www.w3.org/2000/svg";

/**
 * A small outline of where something lies: its own territory filled in its colour, its vassals'
 * borders inside it, and the realm it lies in drawn around it for context. A place without borders
 * of its own shows as a dot in its realm. Nothing is drawn when there's no shape to show.
 */
export function miniMap(plugin: ChroniclePlugin, parent: HTMLElement, e: Entity): HTMLElement | undefined {
	const idx = plugin.index;
	const tree = plugin.realms();
	const node = tree.nodes.get(e.key);
	const own = e.territories.filter((t) => t.points.length > 2);
	// The realm above, or the nearest one above with a shape.
	let context: Entity | undefined;
	for (let k = node?.under; k; k = tree.nodes.get(k)?.under) {
		const up = idx.get(k);
		if (up?.territories.some((t) => t.points.length > 2)) {
			context = up;
			break;
		}
	}
	if (!context && e.locatedIn?.resolved) context = idx.get(e.locatedIn.key);
	const map = own[0]?.map ?? (e.map?.resolved ? e.map.key : undefined) ?? context?.territories[0]?.map;
	if (!map) return undefined;
	const onMap = (ts: Territory[]) => ts.filter((t) => t.points.length > 2 && (t.map === map || t.map === "*"));
	const mine = onMap(own);
	const around = context ? onMap(context.territories) : [];
	const dot = !mine.length && e.position && (e.map?.key === map) ? e.position : undefined;
	if (!mine.length && !dot) return undefined;
	const vassals = (node?.children ?? []).flatMap((k) => onMap(idx.get(k)?.territories ?? []));

	// World maps are [lat, lng]: north is up.
	const world = map === "world";
	const xy = (p: [number, number]): [number, number] => (world ? [p[1], -p[0]] : [p[0], p[1]]);
	const all = [...mine, ...around].flatMap((t) => t.points.map(xy));
	if (dot) all.push(xy(dot));
	const xs = all.map((p) => p[0]);
	const ys = all.map((p) => p[1]);
	let [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
	const pad = Math.max(x1 - x0, y1 - y0, 1) * 0.06;
	[x0, x1, y0, y1] = [x0 - pad, x1 + pad, y0 - pad, y1 + pad];
	const w = x1 - x0;
	const h = y1 - y0;

	const box = el("div", { cls: "uv-minimap" }, parent);
	const svg = document.createElementNS(SVG, "svg");
	svg.setAttribute("viewBox", `${x0} ${y0} ${w} ${h}`);
	svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
	box.appendChild(svg);
	const path = (t: Territory, cls: string, colour: string) => {
		const pl = document.createElementNS(SVG, "polygon");
		pl.setAttribute("points", t.points.map(xy).map((p) => p.join(",")).join(" "));
		pl.setAttribute("class", cls);
		pl.style.setProperty("--c", colour);
		svg.appendChild(pl);
	};
	const colour = entityColor(plugin, e);
	for (const t of around) path(t, "uv-mm-context", context ? entityColor(plugin, context) : "var(--text-faint)");
	for (const t of mine) path(t, "uv-mm-own", colour);
	for (const t of vassals) path(t, "uv-mm-vassal", colour);
	if (dot) {
		const c = document.createElementNS(SVG, "circle");
		const [cx, cy] = xy(dot);
		c.setAttribute("cx", String(cx));
		c.setAttribute("cy", String(cy));
		c.setAttribute("r", String(Math.max(w, h) / 40));
		c.setAttribute("class", "uv-mm-dot");
		c.style.setProperty("--c", colour);
		svg.appendChild(c);
	}
	if (context) el("div", { cls: "uv-minimap-caption", text: `in ${context.name}` }, box);
	return box;
}
