// Map look presets: a whole look for maps and territories at once (fills, borders, lettering, tier
// styles, the border band, roughness, rivers), built in or saved from your own settings.
const copy = <T,>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));
import type { ChronicleSettings } from "../settings";
import { DEFAULT_TIER_STYLES, type TierStyle } from "./tierstyles";

/** Everything a preset sets. Anything left out keeps its built-in default. */
export interface MapLook {
	territoryFillScale?: number;
	territoryBorder?: "own" | "darker" | "ink";
	mapLabelStyle?: "engraved" | "plain" | "italic" | "calligraphic";
	mapPaper?: "parchment" | "vellum" | "sea";
	mapFrame?: boolean;
	mapCompass?: boolean;
	mapLabelHalo?: boolean;
	mapLabelScale?: number;
	realmBand?: "off" | "soft" | "strong";
	roughBorders?: "off" | "light" | "medium" | "strong";
	riverWidth?: number;
	riverColor?: string;
	tierStyles?: TierStyle[];
}

export interface MapPreset {
	id: string;
	name: string;
	desc: string;
	look: MapLook;
}

const LOOK_KEYS: (keyof MapLook)[] = ["territoryFillScale", "territoryBorder", "mapLabelStyle", "mapLabelHalo", "mapLabelScale", "realmBand", "roughBorders", "riverWidth", "riverColor", "tierStyles", "mapPaper", "mapFrame", "mapCompass"];

/** The built-in tiers, each changed by `f` (line, edge, texture, widths). */
const tiers = (f: (t: TierStyle) => Partial<TierStyle>): TierStyle[] => DEFAULT_TIER_STYLES.map((t) => ({ ...t, ...f(t) }));
const by = <T,>(tier: number, list: T[]) => list[Math.max(0, Math.min(list.length - 1, tier))];

export const BUILT_IN_PRESETS: MapPreset[] = [
	{
		id: "standard",
		name: "Standard",
		desc: "UniverseView's own look: soft fills, a band of colour inside the bigger realms, engraved names.",
		look: { territoryFillScale: 1, territoryBorder: "own", mapLabelStyle: "engraved", mapLabelHalo: true, mapLabelScale: 1, realmBand: "soft", roughBorders: "off", riverWidth: 1, riverColor: undefined, tierStyles: undefined },
	},
	{
		id: "grand-strategy",
		name: "Grand strategy",
		desc: "Like Crusader Kings or Europa Universalis: bold political colour from afar, a strong glow inside each realm's border, darker border lines.",
		look: {
			territoryFillScale: 1.3,
			territoryBorder: "darker",
			mapLabelStyle: "engraved",
			mapLabelHalo: true,
			mapLabelScale: 1.15,
			realmBand: "strong",
			roughBorders: "off",
			riverWidth: 1.25,
			riverColor: "#4f8fc4",
			tierStyles: tiers((t) => ({ edge: "plain", pattern: "flat", line: t.tier >= 5 ? "dotted" : "solid", width: by(t.tier, [2, 3.5, 3, 2.2, 1.4, 1, 0.8, 1.2]) })),
		},
	},
	{
		id: "old-atlas",
		name: "Old atlas",
		desc: "A printed map from an old atlas: ink borders, faint wash of colour, parchment grain, slightly hand-drawn edges.",
		look: {
			territoryFillScale: 0.6,
			territoryBorder: "ink",
			mapLabelStyle: "engraved",
			mapLabelHalo: true,
			mapLabelScale: 1,
			realmBand: "off",
			roughBorders: "light",
			riverWidth: 0.9,
			riverColor: "#6f9fb8",
			tierStyles: tiers((t) => ({ edge: (t.tier >= 1 && t.tier <= 3 ? "band" : "plain"), pattern: (t.tier <= 2 ? "grain" : "flat"), line: t.tier >= 4 ? "dashed" : "solid" })),
		},
	},
	{
		id: "hand-drawn",
		name: "Hand-drawn fantasy",
		desc: "A map from the front of a fantasy novel: wobbly ink borders, hatched lands, italic names, little colour.",
		look: {
			territoryFillScale: 0.45,
			territoryBorder: "ink",
			mapLabelStyle: "italic",
			mapLabelHalo: true,
			mapLabelScale: 1.05,
			realmBand: "off",
			roughBorders: "strong",
			riverWidth: 0.8,
			riverColor: "#7aa6bf",
			tierStyles: tiers((t) => ({ edge: "plain", pattern: (t.tier >= 1 && t.tier <= 3 ? "hatch" : "flat"), line: t.tier >= 4 ? "dotted" : t.tier === 3 ? "dashed" : "solid" })),
		},
	},
	{
		id: "calligraphic",
		name: "Calligraphic chart",
		desc: "An inked chart on aged paper: pen-script names, hand-wobbled ink borders, hatched lands, a ruled frame and a compass rose.",
		look: {
			territoryFillScale: 0.4,
			territoryBorder: "ink",
			mapLabelStyle: "calligraphic",
			mapLabelHalo: true,
			mapLabelScale: 1.15,
			realmBand: "off",
			roughBorders: "medium",
			riverWidth: 0.85,
			riverColor: "#5f8aa3",
			tierStyles: tiers((t) => ({ edge: "plain", pattern: (t.tier >= 1 && t.tier <= 3 ? "hatch" : "flat"), line: t.tier >= 4 ? "dotted" : t.tier === 3 ? "dashed" : "solid" })),
			mapPaper: "parchment",
			mapFrame: true,
			mapCompass: true,
		},
	},
	{
		id: "clean-political",
		name: "Clean political",
		desc: "A modern atlas's political map: flat, strong colours, crisp lines, plain names, no texture.",
		look: {
			territoryFillScale: 1.6,
			territoryBorder: "darker",
			mapLabelStyle: "plain",
			mapLabelHalo: false,
			mapLabelScale: 1,
			realmBand: "off",
			roughBorders: "off",
			riverWidth: 1,
			riverColor: "#5aa2d8",
			tierStyles: tiers((t) => ({ edge: "plain", pattern: "flat", line: t.tier >= 5 ? "dashed" : "solid" })),
		},
	},
	{
		id: "terrain-first",
		name: "Terrain first",
		desc: "Lets the drawn map speak: barely any fill, thin ink borders, names with a halo. Good for detailed hand-painted maps.",
		look: {
			territoryFillScale: 0.2,
			territoryBorder: "ink",
			mapLabelStyle: "engraved",
			mapLabelHalo: true,
			mapLabelScale: 0.95,
			realmBand: "soft",
			roughBorders: "off",
			riverWidth: 0.75,
			riverColor: undefined,
			tierStyles: tiers((t) => ({ edge: "plain", pattern: "flat", width: Math.max(0.8, t.width * 0.7) })),
		},
	},
	{
		id: "star-chart",
		name: "Star chart",
		desc: "A navigator's chart for space: faint fills, thin even lines, dashed borders for the smaller claims, plain names.",
		look: {
			territoryFillScale: 0.45,
			territoryBorder: "own",
			mapLabelStyle: "plain",
			mapLabelHalo: true,
			mapLabelScale: 0.95,
			realmBand: "soft",
			roughBorders: "off",
			riverWidth: 0.75,
			riverColor: undefined,
			tierStyles: tiers((t) => ({ edge: "plain", pattern: "flat", line: t.tier >= 4 ? "dashed" : "solid", width: by(t.tier, [1, 1.8, 1.5, 1.2, 1, 0.8, 0.7, 0.8]) })),
		},
	},
];

/** The look as the settings have it now (to save as your own preset). */
export function currentLook(s: ChronicleSettings): MapLook {
	const out: MapLook = {};
	for (const k of LOOK_KEYS) (out as Record<string, unknown>)[k] = copy(s[k]);
	return out;
}

/** Puts a preset's look into the settings: every look setting, so nothing from the last look lingers. */
export function applyLook(s: ChronicleSettings, look: MapLook) {
	for (const k of LOOK_KEYS) (s as unknown as Record<string, unknown>)[k] = copy(look[k]);
}

/** Which preset the settings match now, if any. */
export function matchingPreset(s: ChronicleSettings, presets: MapPreset[]): string | undefined {
	const now = JSON.stringify(currentLook(s));
	return presets.find((p) => JSON.stringify(currentLook({ ...s, ...Object.fromEntries(LOOK_KEYS.map((k) => [k, p.look[k]])) })) === now)?.id;
}
