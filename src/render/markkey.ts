import { categoryColor, markPath, type ItemShape } from "./categories";
import { el, svg } from "./common";
import type { HistoryMark } from "./history";

/** A mark's shape in its category's colour, the same in every view. */
export function markIcon(parent: Element, m: Pick<HistoryMark, "shape" | "categoryId">): SVGElement {
	const box = svg("svg", { class: "uv-tl-mark", width: 14, height: 14, viewBox: "0 0 14 14" }, parent);
	box.style.setProperty("--mark-color", categoryColor(m.categoryId));
	svg("path", { d: markPath(m.shape, 7, 7) }, box);
	return box;
}

/** Which shape is which. */
export function markKey(parent: HTMLElement, marks: HistoryMark[]) {
	const seen = new Map<ItemShape, HistoryMark>();
	for (const m of marks) if (!seen.has(m.shape)) seen.set(m.shape, m);
	if (!seen.size) return;
	const key = el("span", { cls: "uv-tl-key" }, parent);
	for (const m of seen.values()) {
		const entry = el("span", { cls: "uv-tl-key-item" }, key);
		markIcon(entry, m);
		el("span", { text: m.category }, entry);
	}
}
