/**
 * One catalogue of places, so no list can disagree with another. A place is described in three layers:
 *
 *   Type of place   what sort of thing it is: Settlement, Territory, Land, Water, Structure, Site or Space.
 *                   Never typed: every kind belongs to exactly one type, so it follows from the kind.
 *   Kind            which one exactly (`kind: city`, #Place_City): hamlet, city, castle, island, planet…
 *   Traits          what is special about it, as tags in the tag scheme: a Role (#Place_Role_Capital),
 *                   a Size (#Place_Size_Large) and a Status (#Place_Status_Ruined).
 *
 * Ruled land (a kingdom, a province, a county) is the Territory type. Its tier is not a kind: it is set
 * under Tier, and `realms.ts` reads those words. Capital and port are roles, not kinds of settlement.
 * Older notes (`kind: capital`, #Place_Fortress) still read: `resolvePlace` turns them into the new shape.
 * No Obsidian here, so it is all testable.
 */

export type PlaceGroup = "settlement" | "territory" | "land" | "water" | "structure" | "site" | "space";
export type PinSizeWord = "tiny" | "small" | "medium" | "large" | "huge";

export const PLACE_GROUPS: [PlaceGroup, string, string][] = [
	["settlement", "Settlements", "Somewhere people live, from a hamlet to a metropolis."],
	["territory", "Territories", "Ruled land (a kingdom, a province, a county). Its tier is set under Tier, not as a kind."],
	["land", "Land", "Geography nobody rules: a continent, an island, a forest."],
	["water", "Water", "Seas, lakes, rivers and bays."],
	["structure", "Structures", "Something built: a castle, a temple, a factory."],
	["site", "Sites", "A place worth a name: a landmark, a ruin, a battlefield."],
	["space", "Space", "Planets, moons, stars and stations."],
];

interface KindDef {
	kind: string;
	group: PlaceGroup;
	color: string;
	icon: string;
	size: PinSizeWord;
	layer: number;
	/** Words that mean the same kind (fortress for fort). */
	alias?: string[];
	/** In the default Kinds list every vault starts with; the rest are known everywhere but only listed once used. */
	core?: boolean;
}

const k = (kind: string, group: PlaceGroup, color: string, icon: string, size: PinSizeWord, layer: number, core = false, alias: string[] = []): KindDef => ({ kind, group, color, icon, size, layer, core, alias });

export const PLACE_KINDS: KindDef[] = [
	// Settlements: the ladder is hamlet, village, town, city, metropolis (see SETTLEMENT_LADDER).
	k("metropolis", "settlement", "#c0392b", "building", "large", 1, false, ["megacity"]),
	k("city", "settlement", "#c0392b", "building-2", "medium", 2, true),
	k("town", "settlement", "#d35400", "house", "small", 3, true),
	k("village", "settlement", "#8e6b3a", "home", "tiny", 4, true),
	k("hamlet", "settlement", "#8e6b3a", "home", "tiny", 4, true),
	k("settlement", "settlement", "#c0392b", "home", "medium", 2, true),
	k("district", "settlement", "#c0392b", "map-pin", "small", 3),
	k("colony", "settlement", "#d35400", "house", "medium", 2),
	k("habitat", "settlement", "#1f9e89", "orbit", "medium", 2),
	k("outpost", "settlement", "#6c5b7b", "radio-tower", "small", 3),
	// Land
	k("continent", "land", "#4f7942", "map", "huge", 1, true),
	k("region", "land", "#2e86ab", "map", "large", 1, true),
	k("landform", "land", "#4f7942", "mountain", "medium", 2, true),
	k("mountain", "land", "#6b6b6b", "mountain", "medium", 2, true, ["mountains", "range"]),
	k("forest", "land", "#2f7d32", "trees", "medium", 2, true, ["wood", "woods"]),
	k("island", "land", "#1f9e89", "palmtree", "medium", 2, true, ["isle"]),
	k("archipelago", "land", "#1f9e89", "palmtree", "large", 1),
	k("peninsula", "land", "#4f7942", "map", "medium", 2),
	k("highlands", "land", "#6b6b6b", "mountain", "medium", 2),
	k("valley", "land", "#4f7942", "mountain", "small", 3),
	k("plains", "land", "#8d9a3a", "map", "large", 2, false, ["plain"]),
	k("desert", "land", "#c9a227", "sun", "large", 2),
	k("coast", "land", "#2878b5", "waves", "medium", 2),
	k("marsh", "land", "#4f7942", "waves", "medium", 3, false, ["swamp"]),
	k("crater", "land", "#7a7a7a", "circle-dot", "small", 3),
	k("canyon", "land", "#a0522d", "mountain", "small", 3),
	// Water
	k("sea", "water", "#2878b5", "waves", "large", 1, true, ["ocean"]),
	k("lake", "water", "#2878b5", "waves", "medium", 2, true),
	k("river", "water", "#2878b5", "waves", "small", 3, true),
	k("bay", "water", "#2878b5", "anchor", "medium", 2, false, ["gulf"]),
	// Structures
	k("castle", "structure", "#6c5b7b", "castle", "small", 3, true, ["keep"]),
	k("fort", "structure", "#6c5b7b", "castle", "small", 3, true, ["fortress"]),
	k("tower", "structure", "#6c5b7b", "castle", "tiny", 4),
	k("temple", "structure", "#a05ec9", "church", "small", 3, true),
	k("building", "structure", "#8d6e63", "building", "tiny", 5, true),
	k("room", "structure", "#8d6e63", "door-open", "tiny", 5),
	k("base", "structure", "#6c5b7b", "shield", "small", 3),
	k("factory", "structure", "#8d6e63", "factory", "tiny", 4),
	k("office", "structure", "#78909c", "building-2", "tiny", 5),
	k("campus", "structure", "#7e57c2", "school", "small", 3),
	k("stadium", "structure", "#43a047", "trophy", "small", 3),
	k("airport", "structure", "#546e7a", "plane", "medium", 2),
	k("spaceport", "structure", "#00a8b5", "rocket", "medium", 2),
	// Sites
	k("landmark", "site", "#a0522d", "landmark", "small", 3, true),
	k("ruin", "site", "#7a7a7a", "landmark", "small", 3, true, ["ruins"]),
	k("monument", "site", "#a0522d", "landmark", "small", 3),
	k("battlefield", "site", "#c0392b", "swords", "small", 3),
	// Space
	k("planet", "space", "#5b6ee1", "globe", "huge", 1, true),
	k("moon", "space", "#9aa4b1", "moon", "medium", 2, true),
	k("star", "space", "#f1c40f", "sun", "huge", 1, true),
	k("station", "space", "#00a8b5", "satellite", "medium", 2, true),
	k("asteroid", "space", "#8d8d8d", "circle-dot", "small", 3),
	k("galaxy", "space", "#7e57c2", "sparkles", "huge", 1),
	k("nebula", "space", "#ab47bc", "cloud", "large", 1),
	k("system", "space", "#f1c40f", "orbit", "large", 1, false, ["star system", "solar system"]),
	k("ship", "space", "#546e7a", "ship", "small", 3, false, ["starship"]),
];

/** Words for ruled land: a place of these kinds is a Territory and its tier is set under Tier (realms.ts). */
export const TERRITORY_WORDS = ["empire", "kingdom", "realm", "country", "nation", "state", "republic", "province", "duchy", "county", "barony", "principality", "march", "title"];

/** Something a place is or does. The first role a place has styles its pin. */
export const PLACE_ROLES: { role: string; color: string; icon: string; size: PinSizeWord; layer: number; alias?: string[] }[] = [
	{ role: "capital", color: "#b8860b", icon: "crown", size: "large", layer: 1 },
	{ role: "port", color: "#1f6f9e", icon: "anchor", size: "medium", layer: 2, alias: ["harbour", "harbor"] },
	{ role: "holy", color: "#a05ec9", icon: "church", size: "small", layer: 3, alias: ["sacred"] },
	{ role: "market", color: "#d35400", icon: "store", size: "small", layer: 3, alias: ["trade"] },
];

/** How a place stands now: tags like #Place_Status_Ruined, with the icon each shows in the inspector. */
export const PLACE_STATUSES = ["ruined", "abandoned", "lost", "destroyed"];
export const STATUS_ICONS: Record<string, string> = { ruined: "brick-wall", abandoned: "door-closed", lost: "map-pin-off", destroyed: "flame" };

/** A role or status as the settings keep it: a name, an icon (a Lucide name or an emoji) and, for roles, the pin's colour. */
export interface PlaceTrait {
	name: string;
	icon: string;
	color?: string;
}

const DEFAULT_ROLES = PLACE_ROLES.map((r) => ({ ...r }));
const DEFAULT_STATUSES = [...PLACE_STATUSES];
const DEFAULT_STATUS_ICONS = { ...STATUS_ICONS };

/** The lists as the settings would hold them before anyone edits them. */
export const defaultRoles = (): PlaceTrait[] => DEFAULT_ROLES.map((r) => ({ name: r.role, icon: r.icon, color: r.color }));
export const defaultStatuses = (): PlaceTrait[] => DEFAULT_STATUSES.map((s) => ({ name: s, icon: DEFAULT_STATUS_ICONS[s] ?? "circle" }));

/**
 * Makes the roles and statuses what the settings say (the built-in few when they say nothing), so pins, the
 * inspector and the tag standard all offer the same lists. Called whenever settings load or change.
 */
export function setPlaceTraits(roles?: PlaceTrait[], statuses?: PlaceTrait[]) {
	PLACE_ROLES.length = 0;
	for (const r of roles ?? defaultRoles()) {
		const role = CLEAN(r.name);
		if (!role || PLACE_ROLES.some((x) => x.role === role)) continue;
		const base = DEFAULT_ROLES.find((d) => d.role === role);
		PLACE_ROLES.push({ role, color: r.color || base?.color || "#7a6a58", icon: r.icon || base?.icon || "circle", size: base?.size ?? "small", layer: base?.layer ?? 3, alias: base?.alias });
	}
	PLACE_STATUSES.length = 0;
	for (const k of Object.keys(STATUS_ICONS)) delete STATUS_ICONS[k];
	for (const s of statuses ?? defaultStatuses()) {
		const status = CLEAN(s.name);
		if (!status || PLACE_STATUSES.includes(status)) continue;
		PLACE_STATUSES.push(status);
		STATUS_ICONS[status] = s.icon || "circle";
	}
}

/** The kinds of settlement from smallest to largest, and the Size a settlement of each kind usually has. */
export const SETTLEMENT_LADDER: [string, string][] = [["hamlet", "tiny"], ["village", "small"], ["town", "medium"], ["city", "large"], ["metropolis", "huge"]];

/** Older words that are really a role or a spelling of a kind: `kind: capital` is a settlement with the capital role. */
const LEGACY: Record<string, { kind?: string; role?: string }> = {
	capital: { kind: "settlement", role: "capital" },
	port: { kind: "settlement", role: "port" },
	harbour: { kind: "settlement", role: "port" },
	harbor: { kind: "settlement", role: "port" },
};

const CLEAN = (s: string) => s.trim().toLowerCase().replace(/[\s_-]+/g, " ");
const ALIASES = new Map<string, string>();
for (const d of PLACE_KINDS) for (const a of d.alias ?? []) ALIASES.set(CLEAN(a), d.kind);
const BY_KIND = new Map(PLACE_KINDS.map((d) => [d.kind, d]));

/** What is known of a place: its type, its kind (spelled the new way) and its traits. */
export interface PlaceFacts {
	kind?: string;
	group?: PlaceGroup;
	roles: string[];
	status?: string;
}

const traitTags = (tags: string[], field: string) =>
	tags.map((t) => t.replace(/^#/, "").match(new RegExp(`^place_${field}_(.+)$`, "i"))?.[1]?.toLowerCase().replace(/[\s_-]+/g, " ")).filter((v): v is string => !!v);

const roleName = (word: string) => PLACE_ROLES.find((r) => r.role === word || r.alias?.includes(word))?.role;

/** A kind word read the new way: aliases folded (fortress → fort) and role words split off (capital → settlement + role). */
export function normaliseKind(word: string | undefined): { kind?: string; role?: string } {
	if (!word) return {};
	const w = CLEAN(word);
	const legacy = LEGACY[w];
	if (legacy) return legacy;
	return { kind: ALIASES.get(w) ?? w };
}

export function groupOfKind(kind: string | undefined): PlaceGroup | undefined {
	if (!kind) return undefined;
	const w = normaliseKind(kind).kind ?? "";
	if (TERRITORY_WORDS.includes(w)) return "territory";
	return BY_KIND.get(w)?.group;
}

/** A place's type, kind and traits, from its `kind:` and its tags, however old the notes are. */
export function resolvePlace(category: string | undefined, tags: string[] = []): PlaceFacts {
	const base = normaliseKind(category);
	const roles = new Set<string>();
	if (base.role) roles.add(base.role);
	for (const v of traitTags(tags, "role")) roles.add(roleName(v) ?? v);
	const status = traitTags(tags, "status").find((s) => PLACE_STATUSES.includes(s));
	return { kind: base.kind, group: groupOfKind(base.kind), roles: [...roles], status };
}

/**
 * The word whose style (icon, colour, pin size, layer) a place wears: its first role that has one, else its
 * kind as written. A capital city keeps the crown whether it says `kind: capital` or #Place_Role_Capital.
 */
export function styleKeyOf(category: string | undefined, tags: string[] = []): string | undefined {
	const facts = resolvePlace(category, tags);
	const role = PLACE_ROLES.find((r) => facts.roles.includes(r.role));
	return role?.role ?? category;
}

/** The Size a settlement of this kind usually has (a village is small), or undefined for other kinds. */
export function usualSize(kind: string | undefined): string | undefined {
	const w = normaliseKind(kind).kind;
	return SETTLEMENT_LADDER.find(([name]) => name === w)?.[1];
}

// ---- The lists everything else derives from -----------------------------------------------------------

const line = (d: { color: string; icon: string }, name: string) => `${name} = ${d.color}, ${d.icon}`;

/** The Kinds list every vault starts with. */
export function defaultKindsText(): string {
	return `# category = color, icon (Lucide icon name or emoji), size (tiny … huge), layer 1–5\n# Layer 1 is always shown; higher layers appear as you zoom in.\n${PLACE_KINDS.filter((d) => d.core).map((d) => line(d, d.kind)).join("\n")}`;
}

/** Every other kind, and the roles, known in every vault so a place of that kind still gets its colour and icon. */
export function knownKindsText(): string {
	return [...PLACE_KINDS.filter((d) => !d.core).map((d) => line(d, d.kind)), ...PLACE_ROLES.map((r) => line(r, r.role)), ...Object.entries(LEGACY_STYLES).map(([w, c]) => `${w} = ${c}`)].join("\n");
}

/** How the old words used to look, so notes that still say them look the same. */
const LEGACY_STYLES: Record<string, string> = {
	kingdom: "#2e86ab, crown", realm: "#2e86ab, flag", province: "#2e86ab, map", country: "#2e86ab, flag", fortress: "#6c5b7b, castle",
};

/** Built-in pin size and layer for a kind or a role, used when neither the note nor the settings say. */
export const KIND_SCALE: Record<string, { size: PinSizeWord; layer: number }> = (() => {
	const out: Record<string, { size: PinSizeWord; layer: number }> = {};
	for (const d of PLACE_KINDS) {
		out[d.kind] = { size: d.size, layer: d.layer };
		for (const a of d.alias ?? []) out[a] ??= { size: d.size, layer: d.layer };
	}
	for (const r of PLACE_ROLES) {
		out[r.role] = { size: r.size, layer: r.layer };
		for (const a of r.alias ?? []) out[a] ??= { size: r.size, layer: r.layer };
	}
	for (const w of ["country", "realm", "kingdom", "empire"]) out[w] = { size: "huge", layer: 1 };
	out.province = { size: "large", layer: 2 };
	return out;
})();

/** Kinds worth offering in pickers, by type, in the order of PLACE_GROUPS. */
export function kindsOfGroup(group: PlaceGroup): string[] {
	return PLACE_KINDS.filter((d) => d.group === group).map((d) => d.kind);
}

/** Landform words as tags are written (Mountains, Island…), the ones the tag standard offers. */
export const LAND_FORMS = ["Continent", "Island", "Archipelago", "Peninsula", "Mountains", "Highlands", "Forest", "Valley", "Plains", "Desert", "Coast", "Marsh", "Sea", "Lake", "Crater", "Canyon"];
