import type ChroniclePlugin from "../main";
import { svgMarkup } from "../render/common";
import { tierName } from "../index/realms";

export { DEFAULT_TIER_STYLES, EDGE_NAMES, PATTERN_NAMES, type TerritoryEdge, type TerritoryPattern, type TierStyle } from "./tierstyles";
import { DEFAULT_TIER_STYLES, type TierStyle } from "./tierstyles";


/** The style rows' tiers by index: other areas, the six realm tiers (by the vault's names), regions. */
export function tierStyleNames(): string[] {
	return ["Other areas", ...[1, 2, 3, 4, 5, 6].map((t) => tierName(t, true)), "Regions (geography)"];
}


/** The tier class an area gets, from its title's rank (from tags like #Province or #Region_Small). */
/** The style row for a tier (0 other, 1 empire … 6 settlement, 7 regions). */
export function tierNumber(rank: number | undefined, nature?: "realm" | "region"): number {
	if (nature === "region") return 7;
	return rank === undefined || rank >= 9 ? 0 : Math.max(1, Math.min(6, Math.round(rank)));
}

export function styleFor(plugin: ChroniclePlugin, tier: number): TierStyle {
	const list = plugin.settings.tierStyles?.length ? plugin.settings.tierStyles : DEFAULT_TIER_STYLES;
	return { ...(DEFAULT_TIER_STYLES.find((s) => s.tier === tier) ?? DEFAULT_TIER_STYLES[0]), ...(list.find((s) => s.tier === tier) ?? {}) };
}

/** Patterns and the grain filter the territory overlays use, put once into a map's drawing. */
export function ensureTerritoryDefs(svg: SVGSVGElement | null | undefined) {
	if (!svg || svg.querySelector("#uv-terr-defs")) return;
	const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
	defs.id = "uv-terr-defs";
	defs.append(
		...svgMarkup(
			'<pattern id="uv-pat-hatch" patternUnits="userSpaceOnUse" width="7" height="7" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="7" stroke="rgba(0,0,0,0.16)" stroke-width="1.4"/></pattern>' +
				'<pattern id="uv-pat-dots" patternUnits="userSpaceOnUse" width="7" height="7"><circle cx="2.5" cy="2.5" r="1.1" fill="rgba(0,0,0,0.2)"/></pattern>' +
				// The blur's area in drawing units, not the line's own box: a box leaves out the stroke's width,
				// so a straight stretch of border (a flat box) had its glow cut off in blocks.
				'<filter id="uv-soft" filterUnits="userSpaceOnUse" x="-100000" y="-100000" width="200000" height="200000"><feGaussianBlur stdDeviation="5"/></filter>' +
				'<filter id="uv-grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="7"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="table" tableValues="0 0.22"/></feComponentTransfer></filter>',
		),
	);
	svg.prepend(defs);
}

export function tierClass(rank: number | undefined, nature?: "realm" | "region"): string {
	if (nature === "region") return "uv-tier-7 uv-region";
	return `uv-tier-${rank === undefined || rank >= 9 ? 0 : Math.max(1, Math.min(6, Math.round(rank)))}`;
}

/**
 * Draws each tier of title its own way: borders, line and fill from the settings (Maps & realms →
 * Territory styles). Only areas showing as themselves; merged and split ones keep their tier looks.
 */
export function styleTerritories(plugin: ChroniclePlugin) {
	// The rules are fixed, in styles.css (one set per tier, 0–7); the settings only fill in their
	// values, as CSS variables on the body, and a class for tiers drawn with a glow or a shadow.
	const body = document.body;
	const set: string[] = [];
	const classes: string[] = [];
	const build = () => {
		for (const p of set.splice(0)) body.style.removeProperty(p);
		body.removeClasses(classes.splice(0));
		const list = plugin.settings.tierStyles?.length ? plugin.settings.tierStyles : DEFAULT_TIER_STYLES;
		// Map look: every fill made stronger or fainter at once.
		const k = Math.max(0, Math.min(3, plugin.settings.territoryFillScale ?? 1));
		const dash = (s: TierStyle) => (s.line === "dashed" ? `${s.width * 4} ${s.width * 3}` : s.line === "dotted" ? `${Math.max(1, s.width)} ${s.width * 2.5}` : "none");
		const put = (name: string, value: string) => {
			body.style.setProperty(name, value);
			set.push(name);
		};
		for (const s of list) {
			const t = `--uv-tier-${s.tier}`;
			const fill = Math.min(1, (Math.max(0, Math.min(100, s.fill)) / 100) * k);
			put(`${t}-width`, `${s.width}px`);
			put(`${t}-dash`, dash(s));
			put(`${t}-fill`, String(fill));
			put(`${t}-fill-hover`, String(Math.min(1, fill + 0.12)));
			put(`${t}-band`, `${Math.max(3, s.width * 3)}px`);
			put(`${t}-outline`, `${s.outline}px`);
			put(`${t}-blur`, `${(s.edge === "glow" ? 2 : 1) + s.width}px`);
			if (s.edge === "glow" || s.edge === "shadow") classes.push(`uv-tier-${s.tier}-${s.edge}`);
		}
		body.addClasses(classes);
	};
	build();
	plugin.register(() => {
		for (const p of set) body.style.removeProperty(p);
		body.removeClasses(classes);
	});
	return build;
}
