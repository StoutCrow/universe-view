/**
 * A world's setting: medieval (the built-in words), modern or futuristic. It only changes words,
 * defaults and suggestions; every property name (`liege:`, `house:`, `kind: castle`) reads the same
 * in all three, so a vault can switch at any time. No Obsidian here, so it's testable.
 */

export type WorldSetting = "medieval" | "modern" | "futuristic";

export interface SettingWords {
	/** The relationship labels for `liege:` and `vassals:`, plural and one. */
	liege: string;
	vassals: string;
	liegeOne: string;
	vassalOne: string;
	/** What a family group is called, one and many, and its icon. */
	house: string;
	houses: string;
	houseIcon: string;
	/** Which tier-name preset (TIER_NAME_PRESETS) and map look preset (BUILT_IN_PRESETS) fit. */
	tiers: string;
	mapLook: string;
	/** Examples shown in the new-note form, by type. */
	hints: Record<"person" | "event" | "culture" | "map", string>;
	/** The fortified places offered in the kind-of-place picker. */
	defences: string[];
}

export const WORLD_SETTINGS: [WorldSetting, string, string][] = [
	["medieval", "Medieval", "Kingdoms, duchies and counties; houses; castles and forts; a liege and vassals."],
	["modern", "Modern", "Countries, states and cities; families; bases and airports; a superior and subordinates; a clean political map."],
	["futuristic", "Futuristic", "Sectors, systems, planets and colonies; families; stations and spaceports; a superior and subordinates; a star-chart map."],
];

const MEDIEVAL: SettingWords = {
	liege: "Liege", vassals: "Vassals", liegeOne: "liege", vassalOne: "vassal",
	house: "House", houses: "Houses", houseIcon: "castle",
	tiers: "medieval", mapLook: "standard",
	hints: { person: "Knight, merchant, deity…", event: "Battle, treaty, birth…", culture: "Kingdom, house, guild, faith…", map: "World, region, city plan…" },
	defences: ["castle", "fort"],
};

const LATER = { liege: "Superior", vassals: "Subordinates", liegeOne: "superior", vassalOne: "subordinate", house: "Family", houses: "Families", houseIcon: "users" };

const WORDS: Record<WorldSetting, SettingWords> = {
	medieval: MEDIEVAL,
	modern: {
		...LATER, tiers: "modern", mapLook: "clean-political",
		hints: { person: "Senator, engineer, spy…", event: "Election, treaty, crash…", culture: "Country, company, party, agency…", map: "World, country, city plan…" },
		defences: ["base", "fort"],
	},
	futuristic: {
		...LATER, tiers: "galactic", mapLook: "star-chart",
		hints: { person: "Captain, pilot, android…", event: "Landing, accord, uprising…", culture: "Federation, corporation, fleet, colony…", map: "Galaxy, star system, station plan…" },
		defences: ["base", "outpost"],
	},
};

/** The words for a setting; anything unknown is medieval. */
export function settingWords(s: string | undefined): SettingWords {
	return WORDS[s as WorldSetting] ?? MEDIEVAL;
}

/** Kinds of place that only a world past the middle ages has. */
const FUTURE_KINDS = new Set(["planet", "moon", "star", "station", "spaceport", "colony", "habitat", "asteroid", "galaxy", "nebula", "system", "star system", "solar system", "starship", "ship"]);
const MODERN_KINDS = new Set(["airport", "base", "factory", "office", "campus", "stadium", "suburb", "highway", "railway", "power plant", "skyscraper", "mall"]);

/**
 * The setting a vault's places point to, or undefined when they don't clearly point anywhere:
 * three or more space kinds make it futuristic, three or more modern ones modern.
 */
export function guessSetting(kinds: Iterable<string | undefined>): WorldSetting | undefined {
	let future = 0, modern = 0;
	for (const k of kinds) {
		const kind = (k ?? "").toLowerCase().replace(/[_-]+/g, " ").trim();
		if (FUTURE_KINDS.has(kind)) future++;
		else if (MODERN_KINDS.has(kind)) modern++;
	}
	if (future >= 3) return "futuristic";
	if (modern >= 3) return "modern";
	return undefined;
}
