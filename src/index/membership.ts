import { DEFAULT_TIER_WORDS } from "./realms";

/**
 * What a person or place belongs to, in five separate questions instead of one list of "groups":
 *
 *   realm          which realm they live under or serve (allegiance)
 *   house          their house or family: their lineage
 *   culture        what people they are of
 *   faith          what they believe
 *   organisation   guilds, orders, armies, companies
 *   group          anything else
 *
 * A membership is written in one of the note's group properties (`allegiance:`, `family:`, `faith:`, or the
 * general `cultures:`). Which question it answers comes from the kind of the group note it links to; a link
 * to a note that does not exist yet is placed by the property it is written under. No Obsidian here, so
 * everything in this file is testable.
 */

export type GroupRow = "realm" | "house" | "culture" | "faith" | "organisation" | "group";

export const ROW_ORDER: GroupRow[] = ["realm", "house", "culture", "faith", "organisation", "group"];

/**
 * What each question means, for a person (`asks`) and for a place (`asksPlace`). A realm is a title, a land and a
 * people at once; each answer says which of those it is about, and where the other two are written.
 */
export const ROW_INFO: Record<GroupRow, { label: string; plural: string; asks: string; asksPlace?: string }> = {
	realm: {
		label: "Realm",
		plural: "Realms",
		asks: "The realm they are a subject of or serve: their nationality (an English subject of England). It can change, so it can have dates. A title they hold is written on the realm, as its ruler or holder; where they live goes under Places.",
		asksPlace: "Who rules this land: the realm it belongs to (England). It can change, so it can have dates. The wider land it lies in, such as a region or continent, is Located in.",
	},
	house: { label: "House", plural: "Houses and families", asks: "Their house or family: their lineage (House Tudor), whichever realm they serve." },
	culture: {
		label: "Culture",
		plural: "Cultures and peoples",
		asks: "The people they are of, by language and custom (English, Welsh). It can differ from their realm: a Welsh subject of England.",
		asksPlace: "The people who live here, by language and custom.",
	},
	faith: { label: "Faith", plural: "Faiths", asks: "What they believe.", asksPlace: "What is believed here." },
	organisation: { label: "Organisation", plural: "Organisations", asks: "Guilds, orders, armies and companies they belong to." },
	group: { label: "Other group", plural: "Other groups", asks: "Anything that is none of those." },
};

/** The property each question is written in when a note has none yet. */
export const ROW_PROPERTY: Record<GroupRow, string> = { realm: "allegiance", house: "family", culture: "culture", faith: "faith", organisation: "organisations", group: "cultures" };

const PROPERTY_ROW: Record<string, GroupRow> = {
	allegiance: "realm", allegience: "realm", allegiances: "realm", nation: "realm", nations: "realm", realm: "realm", realms: "realm",
	family: "house", families: "house", house: "house", houses: "house", dynasty: "house", dynasties: "house", clan: "house", clans: "house",
	culture: "culture", ethnicity: "culture",
	faith: "faith", faiths: "faith", religion: "faith", religions: "faith",
	organisation: "organisation", organisations: "organisation", organization: "organisation", organizations: "organisation",
	faction: "organisation", factions: "organisation", affiliations: "organisation", guild: "organisation", guilds: "organisation",
};

/** The question a group property answers (`family` → house), or undefined for the general `cultures:`. */
export function rowOfProperty(property: string): GroupRow | undefined {
	return PROPERTY_ROW[property.trim().toLowerCase()];
}

const HOUSE = /\b(house|houses|family|families|dynasty|dynasties|clan|clans|lineage|bloodline)\b/i;
const FAITH = /\b(faith|religion|church|creed|cult|pantheon|temple|sect|belief|god|gods|deity|monastic|clergy)\b/i;
const PEOPLE = /\b(culture|people|peoples|ethnicity|ethnic|race|species|folk|tribe|tribes|language|tongue|nationality|heritage)\b/i;
const ORG = /\b(guild|company|order|army|navy|fleet|council|league|society|bank|school|academy|college|university|faction|party|band|crew|brotherhood|sisterhood|circle|cabal|union|alliance|corporation|firm|mercenar\w*|knights?|organisation|organization)\b/i;

/**
 * The question a group's kind word answers: a tier of ruled land (kingdom, county…) is a realm, family and
 * dynasty are houses. Undefined when the word says nothing, so the caller falls back to other evidence.
 */
export function rowOfKind(word: string | undefined): GroupRow | undefined {
	const w = (word ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");
	if (!w) return undefined;
	if (w === "realm" || DEFAULT_TIER_WORDS[w] !== undefined) return "realm";
	if (HOUSE.test(word ?? "")) return "house";
	if (FAITH.test(word ?? "")) return "faith";
	if (PEOPLE.test(word ?? "")) return "culture";
	if (ORG.test(word ?? "")) return "organisation";
	if (w === "group" || w === "other") return "group";
	return undefined;
}

/**
 * Whether a group can be offered in a row of the edit form. A group of a kind goes in that kind's row only. Any other
 * group (#Group_Other, the scheme's tag for "no particular kind") is an organisation at most: it is never offered as a
 * realm, house, culture or faith, which a note has to say it is (or be found to be).
 */
export function fitsRow(row: GroupRow, kind: GroupRow): boolean {
	return kind === row || (kind === "group" && (row === "organisation" || row === "group"));
}

/** One membership as written: whose it is, in which property, exactly as the note has it. */
export interface Member {
	name: string;
	prop: string;
	raw: unknown;
}

/** A member's note name, from the entry as written (a link, text, or an object holding one). */
export type NameOf = (raw: unknown) => string | undefined;

/** Every membership a note writes, in the order of its properties, then of each list. */
export function readMembers(fm: Record<string, unknown>, props: string[], nameOf: NameOf): Member[] {
	const lower = new Map(Object.keys(fm).map((k) => [k.toLowerCase(), k]));
	const out: Member[] = [];
	for (const p of props) {
		const key = lower.get(p.toLowerCase());
		if (!key || out.some((m) => m.prop === key)) continue;
		for (const raw of ([] as unknown[]).concat(fm[key] ?? [])) {
			const name = nameOf(raw);
			if (name) out.push({ name, prop: key, raw });
		}
	}
	return out;
}

/** Splits memberships into the rows: by the kind of the note linked to, else by the property written under. */
export function splitMembers<T extends { prop: string; name: string }>(members: T[], kindOf: (name: string) => GroupRow | undefined): Record<GroupRow, T[]> {
	const out = Object.fromEntries(ROW_ORDER.map((r) => [r, [] as T[]])) as unknown as Record<GroupRow, T[]>;
	for (const m of members) {
		const row = kindOf(m.name);
		out[row && row !== "group" ? row : rowOfProperty(m.prop) ?? "group"].push(m);
	}
	return out;
}

/** What a row should hold after an edit: each name with what to write for it (the original entry when untouched). */
export interface Wanted {
	name: string;
	value: unknown;
}

/**
 * The new value of every group property after the rows were edited. An entry stays in the property it came from, in
 * its order; a new one goes to the property the note already uses for that row, else the row's usual property.
 * A property left with nothing is `undefined` (remove it); one that held a single value and still has one stays single.
 */
export function rebuildMembers(fm: Record<string, unknown>, original: Member[], wanted: Record<GroupRow, Wanted[]>): Record<string, unknown> {
	const keep = new Map<string, Wanted>();
	for (const row of ROW_ORDER) for (const w of wanted[row]) keep.set(w.name.toLowerCase(), w);
	const result = new Map<string, unknown[]>();
	for (const m of original) if (!result.has(m.prop)) result.set(m.prop, []);
	const used = new Set<string>();
	for (const m of original) {
		const w = keep.get(m.name.toLowerCase());
		if (!w || used.has(m.name.toLowerCase())) continue;
		used.add(m.name.toLowerCase());
		result.get(m.prop)!.push(w.value);
	}
	const props = [...result.keys()];
	for (const row of ROW_ORDER) {
		for (const w of wanted[row]) {
			if (used.has(w.name.toLowerCase())) continue;
			used.add(w.name.toLowerCase());
			const prop = props.find((p) => rowOfProperty(p) === row) ?? ROW_PROPERTY[row];
			if (!result.has(prop)) result.set(prop, []);
			result.get(prop)!.push(w.value);
		}
	}
	const out: Record<string, unknown> = {};
	for (const [prop, list] of result) {
		const was = fm[prop];
		out[prop] = !list.length ? undefined : !Array.isArray(was) && list.length === 1 ? list[0] : list;
	}
	return out;
}
