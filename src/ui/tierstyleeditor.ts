import { el, svg } from "../render/common";
import { DEFAULT_TIER_STYLES, EDGE_NAMES, PATTERN_NAMES, ensureTerritoryDefs, tierStyleNames, type TierStyle } from "./territorystyle";

/** What each tier is for, under its name. */
const TIER_NOTES = ["Areas that aren't a title", "The largest realms", "", "", "", "", "Towns and cities", "Geography: nobody rules it"];

const OUTLINE = "M9 25C8 13 19 6 33 7C48 8 60 13 60 25C60 36 48 41 33 40C19 39 10 36 9 25Z";
const VASSAL_LINE = "M33 7.5C30 18 37 28 33 39.5";
let previewSeq = 0;

/** A small land drawn the way a tier is: fill, border, line, edge, texture, and how it looks split. */
function drawPreview(box: SVGSVGElement, s: TierStyle, split: boolean) {
	box.empty();
	ensureTerritoryDefs(box);
	const id = `uv-tier-prev-${++previewSeq}`;
	const dash = s.line === "dashed" ? `${s.width * 4} ${s.width * 3}` : s.line === "dotted" ? `${Math.max(1, s.width)} ${s.width * 2.5}` : "";
	const width = split ? s.outline : s.edge === "double" ? s.width * 3.5 : s.width;
	const land = svg("path", { d: OUTLINE, class: "uv-tier-prev-land", id }, box);
	land.setAttribute("fill-opacity", String(Math.min(1, s.fill / 100)));
	land.setAttribute("stroke-width", String(width));
	if (dash && !split) land.setAttribute("stroke-dasharray", dash);
	if (!split && s.edge === "glow") land.addClass("is-glow");
	if (!split && s.edge === "shadow") land.addClass("is-shadow");
	if (split) {
		// Split into its vassals: their own lines inside, its border kept at the "when split" width.
		svg("path", { d: VASSAL_LINE, class: "uv-tier-prev-vassal" }, box);
		return;
	}
	if (s.pattern && s.pattern !== "flat") svg("path", { d: OUTLINE, class: `uv-terr-texture uv-pat-${s.pattern}` }, box);
	if (s.edge !== "band" && s.edge !== "double") return;
	const clip = svg("clipPath", { id: `${id}-clip` }, box.querySelector("defs") ?? box);
	svg("use", { href: `#${id}` }, clip);
	const over = svg("path", { d: OUTLINE, class: `uv-terr-overlay uv-edge-${s.edge}`, "clip-path": `url(#${id}-clip)` }, box);
	over.style.setProperty("--uv-band", `${Math.max(3, s.width * 3)}px`);
}

/**
 * Territory styles as one card per tier, each with a picture of what it does: the controls are
 * labelled in words, and every change shows at once (and on open maps).
 */
export function tierStyleEditor(parent: HTMLElement, current: TierStyle[] | undefined, save: (styles: TierStyle[]) => void) {
	const styles = DEFAULT_TIER_STYLES.map((d) => ({ ...d, ...(current?.find((s) => s.tier === d.tier) ?? {}) }));
	const names = tierStyleNames();
	const grid = el("div", { cls: "uv-tier-styles" }, parent);
	for (const s of styles) {
		const card = el("div", { cls: "uv-tier-card" }, grid);
		const head = el("div", { cls: "uv-tier-head" }, card);
		const pics = el("div", { cls: "uv-tier-pics" }, head);
		const whole = svg("svg", { viewBox: "0 0 68 48", class: "uv-tier-prev", "aria-hidden": "true" }, pics);
		const split = svg("svg", { viewBox: "0 0 68 48", class: "uv-tier-prev", "aria-hidden": "true" }, pics);
		const title = el("div", { cls: "uv-tier-title" }, head);
		el("div", { cls: "uv-tier-name", text: names[s.tier] ?? `Tier ${s.tier}` }, title);
		if (TIER_NOTES[s.tier]) el("div", { cls: "uv-tier-note", text: TIER_NOTES[s.tier] }, title);
		const redraw = () => {
			drawPreview(whole, s, false);
			drawPreview(split, s, true);
		};
		const changed = () => {
			redraw();
			save(styles.map((x) => ({ ...x })));
		};
		const controls = el("div", { cls: "uv-tier-controls" }, card);
		const row = (label: string, hint: string) => {
			const r = el("label", { cls: "uv-tier-row", attr: { title: hint } }, controls);
			el("span", { cls: "uv-tier-label", text: label }, r);
			return r;
		};
		const slider = (label: string, hint: string, key: "width" | "fill" | "outline", max: number, step: number, unit: string) => {
			const r = row(label, hint);
			const input = el("input", { cls: "slider", attr: { type: "range", min: "0", max: String(max), step: String(step), "aria-label": `${names[s.tier]}: ${label}` } }, r);
			const value = el("span", { cls: "uv-tier-value" }, r);
			input.value = String(s[key]);
			const show = () => value.setText(`${s[key]}${unit}`);
			show();
			input.addEventListener("input", () => {
				s[key] = Number(input.value);
				show();
				redraw();
			});
			input.addEventListener("change", changed);
		};
		const choice = <K extends "line" | "edge" | "pattern">(label: string, hint: string, key: K, options: [TierStyle[K], string][]) => {
			const r = row(label, hint);
			const sel = el("select", { cls: "dropdown", attr: { "aria-label": `${names[s.tier]}: ${label}` } }, r);
			for (const [v, text] of options) sel.createEl("option", { value: String(v), text });
			sel.value = String(s[key] ?? options[0][0]);
			sel.addEventListener("change", () => {
				s[key] = sel.value as TierStyle[K];
				changed();
			});
		};
		slider("Border", "How thick its border is, in pixels", "width", 8, 0.5, "px");
		choice("Line", "Solid, dashed or dotted border", "line", [["solid", "Solid"], ["dashed", "Dashed"], ["dotted", "Dotted"]]);
		slider("Fill", "How strongly its colour fills it", "fill", 60, 1, "%");
		slider("Split border", "Its border's thickness when it shows split into its vassals (the right-hand picture)", "outline", 10, 0.5, "px");
		choice("Edge", "Inner band: a soft band of colour inside the border. Double line: a thin line inside it. Glow and shadow: around it.", "edge", EDGE_NAMES);
		choice("Texture", "A pattern over the fill", "pattern", PATTERN_NAMES);
		redraw();
	}
	return grid;
}
