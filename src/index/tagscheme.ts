import type { EntityType } from "../types";
import { normaliseKind } from "./placekinds";

/**
 * UniverseView's tag scheme. Every tag says one thing, in one shape, so no two tags overlap:
 *
 *   What a note is:          #Type_Kind              #Place_County  #Group_Nation  #Character_Person
 *   What it belongs to:      #Type_Kind_Name         #Group_Nation_United_States  #Place_Continent_North_America
 *   A fact about it:         #Type_Field_Value       #Character_Status_Dead  #Character_Gender_Female  #Place_Size_Small
 *
 * - Type is one of TYPE_WORDS: Character, Group, Place, Event, Map. The same words in every vault.
 * - Kind is one word; a kind of more words is written joined (space station → SpaceStation).
 * - In a belonging tag, Type_Kind is the other note's own kind tag and Name is that note's name.
 * - In a fact tag, Field is one of FACT_FIELDS (Gender, Status, Role, Class, Size), so a fact never
 *   reads as belonging to something. Type is the note's own type.
 * - Every note has exactly one kind tag: one with no kind yet gets its type's default
 *   (#Character_Person, #Place_Other). There are no bare type tags (#Character) and no #Title:
 *   a land's kind says whether it is ruled (#Place_County) or geography (#Place_Island).
 *
 * Reading stays compatible with older tags (#Character, #City, #Region_Small, #Nation_United_States);
 * `migrateTags` rewrites those into this scheme.
 */

export const TYPE_WORDS: Record<EntityType, string> = { person: "Character", culture: "Group", place: "Place", event: "Event", map: "Map" };
const WORD_TYPE = new Map(Object.entries(TYPE_WORDS).map(([t, w]) => [w.toLowerCase(), t as EntityType]));

/** The kind a note gets before anyone says one. */
export const DEFAULT_KINDS: Record<EntityType, string> = { person: "person", culture: "other", place: "other", event: "other", map: "other" };

export const FACT_FIELDS = ["gender", "status", "role", "class", "size"] as const;
export type FactField = (typeof FACT_FIELDS)[number];

/** Words that are facts, not kinds or names, and the field each goes in. */
export const FACT_WORDS: Record<string, FactField> = {
	male: "gender", female: "gender", nonbinary: "gender",
	dead: "status", alive: "status", deceased: "status", missing: "status", ruined: "status", abandoned: "status", lost: "status", destroyed: "status",
	ruler: "role", heir: "role", founder: "role", leader: "role", capital: "role", port: "role", harbour: "role", harbor: "role", holy: "role", market: "role",
	noble: "class", lowborn: "class", commoner: "class", royal: "class", peasant: "class",
	gigantic: "size", enormous: "size", massive: "size", huge: "size", large: "size", big: "size", major: "size",
	medium: "size", small: "size", minor: "size", little: "size", tiny: "size",
};

/** Words that can only be facts, never a kind (a person may be of the kind "noble", not "male"). */
export function factOnly(word: string): boolean {
	const f = FACT_WORDS[word.toLowerCase()];
	return f === "gender" || f === "status" || f === "size";
}

export type SchemeTag =
	| { role: "kind"; type: EntityType; kind: string }
	| { role: "fact"; type: EntityType; field: FactField; value: string }
	| { role: "member"; type: EntityType; kind: string; name: string };

/** "SpaceStation" → "space station". */
const spaced = (w: string) => w.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
/** "space station" → "SpaceStation". */
const joined = (s: string) => s.trim().split(/[\s_-]+/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("");

/** A tag in this scheme, read; null for anything else (older tags, tags of other plugins). */
export function parseTag(raw: string, prefix = ""): SchemeTag | null {
	let t = raw.replace(/^#/, "").trim();
	const p = prefix.replace(/^#/, "").replace(/\/$/, "");
	if (p) {
		if (!t.toLowerCase().startsWith(p.toLowerCase() + "/")) return null;
		t = t.slice(p.length + 1);
	}
	if (t.includes("/")) return null;
	const parts = t.split("_").filter(Boolean);
	const type = WORD_TYPE.get(parts[0]?.toLowerCase() ?? "");
	if (!type || parts.length < 2) return null;
	if (parts.length === 2) return { role: "kind", type, kind: spaced(parts[1]) };
	const field = parts[1].toLowerCase() as FactField;
	if (FACT_FIELDS.includes(field)) return { role: "fact", type, field, value: spaced(parts.slice(2).join("")) };
	return { role: "member", type, kind: spaced(parts[1]), name: parts.slice(2).join(" ") };
}

export function kindTag(type: EntityType, kind?: string): string {
	return `${TYPE_WORDS[type]}_${joined(kind || DEFAULT_KINDS[type])}`;
}

export function factTag(type: EntityType, field: FactField, value: string): string {
	return `${TYPE_WORDS[type]}_${field.charAt(0).toUpperCase() + field.slice(1)}_${joined(value)}`;
}

/** The tag saying a note belongs to another: that note's kind tag and its name. */
export function memberTag(type: EntityType, kind: string | undefined, name: string): string {
	const n = name.replace(/[^\p{L}\p{N}\s_-]/gu, "").trim().split(/\s+/).join("_");
	return `${kindTag(type, kind)}_${n}`;
}

export function isDefaultKind(type: EntityType, kind: string): boolean {
	return kind.toLowerCase() === DEFAULT_KINDS[type];
}

/** What a tag states, for matching it with what's known of a note: a kind, a fact's value or a name. */
export function tagValue(raw: string): string | undefined {
	const p = parseTag(raw);
	if (!p) return undefined;
	return p.role === "kind" ? p.kind : p.role === "fact" ? p.value : p.name;
}

/**
 * One kind tag per type: a real kind replaces the default one (#Place_Other) and a bare type word
 * (#Place). Other tags keep their order.
 */
export function tidyKinds(tags: string[], prefix = ""): string[] {
	const real = new Set<EntityType>();
	for (const t of tags) {
		const p = parseTag(t, prefix);
		if (p?.role === "kind" && !isDefaultKind(p.type, p.kind)) real.add(p.type);
	}
	const seen = new Set<string>();
	return tags.filter((t) => {
		const p = parseTag(t, prefix);
		const bare = WORD_TYPE.get(t.replace(/^#/, "").split("/").pop()?.toLowerCase() ?? "");
		if (bare && (real.has(bare) || tags.some((x) => parseTag(x, prefix)?.role === "kind" && parseTag(x, prefix)?.type === bare))) return false;
		if (p?.role === "kind" && real.has(p.type) && isDefaultKind(p.type, p.kind)) return false;
		const k = t.replace(/^#/, "").toLowerCase();
		if (seen.has(k)) return false;
		seen.add(k);
		return true;
	});
}

// ---- Moving older tags to the scheme -------------------------------------------------------------

export interface MigrateNote {
	type: EntityType;
	name: string;
	/** Its kind as UniverseView reads it now (`kind:`, a kind tag), if any. */
	kind?: string;
	tags: string[];
	/** For land: realm or region, and its tier word when its tier is known. */
	land?: { nature: "realm" | "region"; tier?: string };
	world?: string;
	folders: string[];
}

export interface MigrateTarget {
	type: EntityType;
	name: string;
	/** The kind it will have in the scheme (`migrationKind`). */
	kind: string;
	self?: boolean;
}

export interface MigrateWords {
	/** The type an older bare tag gives (#Character, #City, the vault's own type tags). */
	bareType: (word: string) => EntityType | null;
	/** Words naming a realm tier (realm, duchy, county, city…). */
	tiers: Record<string, number>;
	/** Words naming geography (continent, region, island…). */
	regions: Record<string, number>;
}

export interface Migration {
	/** A place's kind property that is broken (an older word, a plural, a typo) and what it should be. */
	kind?: { from: string; to: string; why: string };
	/** Old tag → new tag. Several may become the same one. */
	rename: [string, string][];
	drop: string[];
	add: string[];
}

const BROAD = new Set(["region", "landform", "settlement", "territory", "area", "location", "place", "title"]);
const key = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, "");

/** The one kind a note has in the scheme, from its kind, its older tags and, for land, its tier. */
export function migrationKind(n: MigrateNote, w: MigrateWords): string {
	const plain = n.tags.map((t) => t.replace(/^#/, ""));
	const own = n.kind && !BROAD.has(n.kind) && !factOnly(n.kind) ? n.kind : undefined;
	if (n.land?.nature === "realm") {
		if (own && w.tiers[key(own)] !== undefined) return own;
		const tierTag = plain.find((t) => w.tiers[key(t)] !== undefined);
		if (tierTag) return tierTag.toLowerCase();
		return n.land.tier?.toLowerCase() || own || "title";
	}
	if (n.land?.nature === "region") return own ?? plain.find((t) => w.regions[key(t)] !== undefined && !BROAD.has(t.toLowerCase()))?.toLowerCase() ?? "region";
	if (own) return own;
	// #Event_War: an older Type_Word tag that isn't a fact or a name is the kind.
	for (const t of plain) {
		const [head, ...rest] = t.split("_");
		if (rest.length === 1 && w.bareType(head) === n.type && !FACT_WORDS[rest[0].toLowerCase()] && !isPlaceName(rest[0], n)) return rest[0].toLowerCase();
	}
	return n.kind && !factOnly(n.kind) ? n.kind : DEFAULT_KINDS[n.type];
}

const isPlaceName = (word: string, n: MigrateNote) => key(word) === key(n.world ?? "") || n.folders.some((f) => key(f) === key(word));

/**
 * What it takes to bring one note's tags into the scheme. `find` looks up a note by name (for
 * #Nation_United_States, #Character_Vael). Tags it can't place are left as they are.
 */
export function migrateTags(n: MigrateNote, find: (name: string) => MigrateTarget | undefined, w: MigrateWords): Migration {
	// 3.3: an older place kind that is really a role (capital, port) or a spelling (fortress) moves to the catalogue's shape.
	let legacy = n.type === "place" && !n.land ? normaliseKind(migrationKind(n, w)) : undefined;
	// Only a role word said it (#Place_Capital on a note with no kind): a capital is a settlement.
	if (legacy && !legacy.role && legacy.kind === DEFAULT_KINDS.place) {
		const said = n.tags.map((t) => normaliseKind(t.replace(/^#/, "").split("_").pop())).find((x) => x.role);
		if (said) legacy = said;
	}
	const kind = legacy?.kind ?? migrationKind(n, w);
	const own = kindTag(n.type, kind);
	const out: Migration = { rename: [], drop: [], add: [] };
	const result = new Set<string>();
	let kindPlaced = false;
	const to = (old: string, next: string | null) => {
		if (next === null) out.drop.push(old);
		else {
			if (next !== old) out.rename.push([old, next]);
			result.add(next.toLowerCase());
		}
	};
	const toKind = (old: string) => {
		if (kindPlaced) return to(old, null);
		kindPlaced = true;
		to(old, own);
	};
	for (const raw of n.tags) {
		const t = raw.replace(/^#/, "");
		const parts = t.split("_").filter(Boolean);
		const low = t.toLowerCase();
		if (t.includes("/") || !parts.length) continue;
		const scheme = parseTag(t);
		// Already in the scheme: a fact or a belonging tag stays; the note's kind tag is the one worked out above.
		if (scheme && scheme.role !== "kind") {
			to(t, t);
			continue;
		}
		if (low === "title") {
			to(t, null);
			continue;
		}
		if (parts.length === 1) {
			if (FACT_WORDS[low] === "role" && w.bareType(t)) to(t, factTag(n.type, "role", low));
			else if (w.bareType(t) === n.type || WORD_TYPE.get(low) === n.type || w.tiers[key(t)] !== undefined || w.regions[key(t)] !== undefined) toKind(t);
			else to(t, t);
			continue;
		}
		const head = parts[0];
		const rest = parts.slice(1).join(" ");
		const restLow = rest.toLowerCase();
		const headType = w.bareType(head) ?? WORD_TYPE.get(head.toLowerCase()) ?? null;
		// #Region_Small, #City_Huge, #Event_Massive: a size.
		if (parts.length === 2 && FACT_WORDS[restLow] === "size" && (headType || w.tiers[key(head)] !== undefined || w.regions[key(head)] !== undefined)) {
			to(t, factTag(n.type, "size", restLow));
			continue;
		}
		// About this note itself: #Character_Dead, #Family_Noble on a family, #City_Capital on a city.
		if (headType === n.type) {
			if (key(rest) === key(kind)) toKind(t);
			else if (FACT_WORDS[restLow]) to(t, factTag(n.type, FACT_WORDS[restLow], restLow));
			else {
				const target = find(rest);
				if (target?.self) to(t, null);
				else if (target) to(t, memberTag(target.type, target.kind, target.name));
				else if (key(rest) === key(n.world ?? "")) to(t, memberTag("place", "world", rest));
				else if (n.folders.some((f) => key(f) === key(rest))) to(t, memberTag("place", "region", rest));
				else if (parts.length === 2 && scheme?.role === "kind") toKind(t);
				else to(t, t);
			}
			continue;
		}
		// #Nation_United_States: belongs to the note of that name, written as that note's own kind tag.
		if (headType) {
			const target = find(rest);
			if (target?.self) to(t, null);
			else if (target) to(t, memberTag(target.type, target.kind, target.name));
			else to(t, memberTag(headType, head.toLowerCase(), rest));
			continue;
		}
		to(t, t);
	}
	if (!kindPlaced && !result.has(own.toLowerCase())) out.add.push(own);
	if (legacy?.role) {
		const roleTag = factTag(n.type, "role", legacy.role);
		if (!result.has(roleTag.toLowerCase())) out.add.push(roleTag);
	}
	// Two old tags becoming one new one: the first is renamed, the rest dropped.
	const firsts: [string, string][] = [];
	for (const [from, next] of out.rename) {
		if (firsts.some(([, x]) => x.toLowerCase() === next.toLowerCase())) out.drop.push(from);
		else firsts.push([from, next]);
	}
	out.rename = firsts;
	return out;
}

/**
 * A note's text with its tags renamed and dropped the same way. Only real tags change: a `#` at the
 * start or after a space (so [[Note#Title]] stays), outside code. A dropped tag goes with the space before it.
 */
export function migrateBodyTags(body: string, m: Pick<Migration, "rename" | "drop">): string {
	const swap = new Map(m.rename.map(([a, b]) => [a.toLowerCase(), b]));
	const drop = new Set(m.drop.map((d) => d.toLowerCase()));
	if (!swap.size && !drop.size) return body;
	let fenced = false;
	return body.split("\n").map((line) => {
		if (/^\s*(```|~~~)/.test(line)) {
			fenced = !fenced;
			return line;
		}
		if (fenced) return line;
		// Inline code keeps its text: only the parts between backticks change.
		return line.split(/(`[^`]*`)/).map((part) => part.startsWith("`") ? part : part.replace(/(^|\s)#([\p{L}\p{N}_/-]+)/gu, (all, pre: string, tag: string) => {
			const k = tag.toLowerCase();
			const next = swap.get(k);
			if (next) return `${pre}#${next}`;
			return drop.has(k) ? "" : all;
		})).join("");
	}).join("\n");
}

/** A note's tags after a migration (or the part of it that was kept). */
export function applyMigration(tags: string[], m: Migration): string[] {
	const swap = new Map(m.rename.map(([a, b]) => [a.toLowerCase(), b]));
	const drop = new Set(m.drop.map((d) => d.toLowerCase()));
	// A rename wins over a drop of the same spelling (a tag written twice is renamed once, then deduplicated).
	const out = tags.flatMap((t) => {
		const k = t.replace(/^#/, "").toLowerCase();
		const next = swap.get(k);
		return next ? [next] : drop.has(k) ? [] : [t];
	});
	return [...new Map([...out, ...m.add].map((t) => [t.toLowerCase(), t])).values()];
}
