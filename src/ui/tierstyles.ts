// Territory tier styles as data (no page code), so the map presets and tests can use them.

/** How one tier of title is drawn on the map. */
export interface TierStyle {
	/** 1 empire, 2 kingdom, 3 duchy, 4 county, 5 barony, 6 settlement; 0 for areas that aren't titles. */
	tier: number;
	/** Border width (px). */
	width: number;
	/** Border line. */
	line: "solid" | "dashed" | "dotted";
	/** Fill strength, 0–100. */
	fill: number;
	/** Border width when the realm is split into its vassals (px). */
	outline: number;
	/** How the edge looks: a plain line, a soft band of colour inside it, a double line, a glow or a shadow. */
	edge?: TerritoryEdge;
	/** Texture over the fill: none (flat colour), hatching, dots or a parchment grain. */
	pattern?: TerritoryPattern;
}

export type TerritoryEdge = "plain" | "band" | "double" | "glow" | "shadow";
export type TerritoryPattern = "flat" | "hatch" | "dots" | "grain";
export const EDGE_NAMES: [TerritoryEdge, string][] = [["plain", "Plain line"], ["band", "Inner band"], ["double", "Double line"], ["glow", "Glow"], ["shadow", "Shadow"]];
export const PATTERN_NAMES: [TerritoryPattern, string][] = [["flat", "Flat"], ["hatch", "Hatched"], ["dots", "Dotted"], ["grain", "Parchment grain"]];

export const DEFAULT_TIER_STYLES: TierStyle[] = [
	{ tier: 0, width: 2, line: "solid", fill: 18, outline: 3, edge: "plain", pattern: "flat" },
	{ tier: 1, width: 3, line: "solid", fill: 20, outline: 6, edge: "band", pattern: "grain" },
	{ tier: 2, width: 2.5, line: "solid", fill: 20, outline: 4.5, edge: "band", pattern: "grain" },
	{ tier: 3, width: 2, line: "solid", fill: 18, outline: 3.5, edge: "band", pattern: "flat" },
	{ tier: 4, width: 1.5, line: "solid", fill: 18, outline: 2.5, edge: "plain", pattern: "flat" },
	{ tier: 5, width: 1.2, line: "dashed", fill: 16, outline: 2, edge: "plain", pattern: "flat" },
	{ tier: 6, width: 1, line: "dotted", fill: 14, outline: 1.5, edge: "plain", pattern: "flat" },
	// Regions are geography, not rule: a light dashed edge and almost no fill, so realms read on top.
	{ tier: 7, width: 1.5, line: "dashed", fill: 6, outline: 2, edge: "plain", pattern: "hatch" },
];
