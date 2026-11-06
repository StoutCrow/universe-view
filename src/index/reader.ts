import { PIN_SIZES } from "../types";
import type { ChronDate, EntityType, PinSize, Ref, TimedRef } from "../types";
import type { FieldName } from "../settings";
import type { Calendar } from "../dates/calendars";
import { parseDate, parseSpan } from "../dates/parser";
import { asText } from "./text";

const TYPE_SYNONYMS: Record<EntityType, string[]> = {
	event: ["event", "events", "happening", "incident", "battle", "war", "treaty", "occurrence", "period", "era"],
	person: ["person", "people", "character", "characters", "npc", "individual", "figure", "ancestor", "relative", "deity"],
	culture: [
		"culture", "faction", "nation", "kingdom", "empire", "organization", "organisation", "order", "house",
		"dynasty", "religion", "tribe", "clan", "guild", "group", "state", "polity", "civilization", "civilisation", "ethnicity",
		"family", "faith", "realm", "company", "corporation", "government",
	],
	place: [
		"place", "location", "city", "town", "village", "region", "settlement", "landmark", "building", "area", "site",
		"province", "continent", "fort", "fortress", "castle", "keep", "landform", "planet", "moon", "star", "island",
		"solar_system", "country", "county", "duchy",
		// Every kind of place the Kind of place list offers, so a note marked only that way is still a place.
		"capital", "port", "harbour", "harbor", "temple", "shrine", "ruin", "ruins", "mountain", "forest", "river", "lake",
		"sea", "ocean", "desert", "swamp", "valley", "barony", "station",
	],
	map: ["map", "atlas"],
};

/**
 * Tags that name a type. Deliberately narrower than TYPE_SYNONYMS: a tag like #war on any note
 * shouldn't turn it into an event, but #Character, #Family or #City are clearly type tags.
 */
export const TAG_TYPES: Record<string, EntityType> = {
	person: "person", character: "person", npc: "person", people: "person",
	event: "event", battle: "event", period: "event",
	culture: "culture", faction: "culture", family: "culture", house: "culture", dynasty: "culture", faith: "culture",
	religion: "culture", group: "culture", organization: "culture", organisation: "culture", realm: "culture",
	nation: "culture", kingdom: "culture", empire: "culture", clan: "culture", tribe: "culture", guild: "culture", order: "culture",
	place: "place", location: "place", city: "place", town: "place", village: "place", settlement: "place", region: "place",
	fort: "place", fortress: "place", castle: "place", landform: "place", landmark: "place", building: "place",
	continent: "place", planet: "place", island: "place",
	// The rest of the Kind of place list: picking one marks the note with it, so it must read as a place.
	capital: "place", port: "place", harbour: "place", harbor: "place", temple: "place", shrine: "place", ruin: "place", ruins: "place",
	mountain: "place", forest: "place", river: "place", lake: "place", sea: "place", moon: "place", star: "place", station: "place",
	// Lands within a realm (the realm itself is a group).
	province: "place", duchy: "place", county: "place", barony: "place", shire: "place", march: "place", district: "place", territory: "place",
	map: "map",
};

export function normalizeType(value: unknown): EntityType | null {
	const values = Array.isArray(value) ? value : [value];
	for (const v of values) {
		if (typeof v !== "string") continue;
		const t = v.replace(/^\[\[|\]\]$/g, "").replace(/^#/, "").trim().toLowerCase();
		for (const [type, syn] of Object.entries(TYPE_SYNONYMS) as [EntityType, string[]][]) {
			if (syn.includes(t)) return type;
		}
	}
	return null;
}

export function typeFromTag(tag: string, prefix: string): EntityType | null {
	let t = tag.replace(/^#/, "").toLowerCase();
	const p = prefix.replace(/^#/, "").replace(/\/$/, "").toLowerCase();
	if (p) {
		if (!t.startsWith(p + "/")) return null;
		t = t.slice(p.length + 1);
	}
	if (t.includes("/")) return null;
	// Only exact type tags count: #Character is a type, #Character_Male or #Nation_United_States are not.
	return TAG_TYPES[t] ?? null;
}

/** Values that mean "unknown" rather than naming a note. */
export function isPlaceholder(s: string): boolean {
	return /^(\?+|-+|unknown|none|n\/a|tbd|null|nil)$/i.test(s.trim());
}

/** Converts Dataview objects (Links, DateTimes, DataArrays) into plain YAML-like values. */
export function normalizeValue(v: unknown): unknown {
	if (v === null || v === undefined) return v;
	if (Array.isArray(v)) return v.map(normalizeValue);
	if (typeof v === "object") {
		const o = v as Record<string, unknown> & { path?: string; display?: string; toISODate?: () => string; array?: () => unknown[] };
		if (typeof o.toISODate === "function") return o.toISODate();
		if (typeof o.array === "function") return o.array().map(normalizeValue);
		if (typeof o.path === "string" && ("embed" in o || "type" in o || "subpath" in o)) {
			return o.display ? `[[${o.path}|${o.display}]]` : `[[${o.path}]]`;
		}
		const out: Record<string, unknown> = {};
		for (const [k, val] of Object.entries(o)) out[k] = normalizeValue(val);
		return out;
	}
	return v;
}

export class PropReader {
	private lower: Map<string, unknown>;

	constructor(public props: Record<string, unknown>, private aliases: Record<FieldName, string[]>) {
		this.lower = new Map();
		for (const [k, v] of Object.entries(props)) {
			const key = k.toLowerCase();
			if (!this.lower.has(key)) this.lower.set(key, v);
		}
	}

	/** First present value for a field. */
	get(field: FieldName): unknown {
		for (const alias of this.aliases[field]) {
			const v = this.lower.get(alias.toLowerCase());
			if (v !== undefined && v !== null && v !== "") return v;
		}
		return undefined;
	}

	/** All values for a field across every alias, tagged with the alias they came from. */
	getAll(field: FieldName): { alias: string; value: unknown }[] {
		const out: { alias: string; value: unknown }[] = [];
		for (const alias of this.aliases[field]) {
			const v = this.lower.get(alias.toLowerCase());
			if (v !== undefined && v !== null && v !== "") out.push({ alias, value: v });
		}
		return out;
	}
}

export type LinkResolver = (linktext: string) => Ref;

const LINK_RE = /\[\[([^\]]+?)\]\]/g;

/** Extracts link texts from a string; plain strings count as a single link. */
export function linkTexts(value: unknown): string[] {
	if (value === null || value === undefined) return [];
	if (Array.isArray(value)) return value.flatMap(linkTexts);
	if (typeof value === "object") {
		const o = value as { path?: unknown };
		if (typeof o.path === "string") return [o.path];
		return [];
	}
	const s = asText(value).trim();
	if (!s) return [];
	const matches = [...s.matchAll(LINK_RE)].map((m) => m[1]);
	if (matches.length) return matches;
	// Numbers (coordinates, ids) and "???"-style placeholders aren't note names.
	if (typeof value === "number" || /^-?\d+(\.\d+)?$/.test(s) || isPlaceholder(s)) return [];
	return [s];
}

export function cleanLinkText(text: string): { path: string; alias?: string } {
	const [target, alias] = text.split("|");
	const path = target.split("#")[0].trim();
	return { path, alias: alias?.trim() };
}

export function readRefs(value: unknown, resolve: LinkResolver): Ref[] {
	const out: Ref[] = [];
	const seen = new Set<string>();
	const values = Array.isArray(value) ? value : [value];
	for (const v of values) {
		// Objects in plain ref lists (e.g. {person: [[X]]}) still name a ref.
		const texts = v && typeof v === "object" && !Array.isArray(v) && !("path" in (v as object))
			? linkTexts(refFromObject(v as Record<string, unknown>)?.value)
			: linkTexts(v);
		for (const t of texts) {
			const r = resolve(t);
			if (r.name && !seen.has(r.key)) {
				seen.add(r.key);
				out.push(r);
			}
		}
	}
	return out;
}

const REF_KEYS = ["person", "culture", "place", "name", "ref", "link", "target", "partner", "spouse", "of", "with", "who", "faction", "member"];
const FROM_KEYS = ["from", "start", "since", "began", "married", "joined"];
const TO_KEYS = ["to", "end", "until", "ended", "left", "divorced"];
const KIND_KEYS = ["kind", "type", "relation", "relationship", "as"];
const ROLE_KEYS = ["role", "title", "rank", "position"];

function pick(o: Record<string, unknown>, keys: string[]): unknown {
	for (const k of Object.keys(o)) if (keys.includes(k.toLowerCase())) return o[k];
	return undefined;
}

function looksLikeLink(v: unknown): boolean {
	return typeof v === "string" && /\[\[.+\]\]/.test(v);
}

function refFromObject(o: Record<string, unknown>): { value: unknown; kindFromKey?: string } | null {
	const direct = pick(o, REF_KEYS);
	if (direct !== undefined) return { value: direct };
	// Shorthand like {mentor: "[[Corin]]"}.
	for (const [k, v] of Object.entries(o)) {
		if (looksLikeLink(v)) return { value: v, kindFromKey: k };
	}
	return null;
}

export function readTimedRefs(
	entries: { alias: string; value: unknown }[],
	resolve: LinkResolver,
	cal: Calendar,
	genericAliases: string[],
	issues: string[],
): TimedRef[] {
	const out: TimedRef[] = [];
	const seen = new Set<string>();
	const dateOf = (v: unknown, label: string): ChronDate | undefined => {
		if (v === undefined || v === null || v === "") return undefined;
		const d = parseDate(v, cal);
		if (!d) issues.push(`Could not read ${label} date "${asText(v)}"`);
		return d ?? undefined;
	};
	for (const { alias, value } of entries) {
		const aliasKind = genericAliases.includes(alias.toLowerCase()) ? undefined : alias;
		const values = Array.isArray(value) ? value : [value];
		for (const v of values) {
			if (v && typeof v === "object" && !Array.isArray(v) && !("path" in (v as object))) {
				const o = v as Record<string, unknown>;
				const r = refFromObject(o);
				if (!r) continue;
				const kind = pick(o, KIND_KEYS);
				const role = pick(o, ROLE_KEYS);
				const from = dateOf(pick(o, FROM_KEYS), "start");
				const to = dateOf(pick(o, TO_KEYS), "end");
				for (const t of linkTexts(r.value)) {
					const ref = resolve(t);
					if (!ref.name) continue;
					const id = ref.key + "|" + asText(kind ?? r.kindFromKey ?? aliasKind);
					if (seen.has(id)) continue;
					seen.add(id);
					out.push({
						ref,
						from,
						to,
						kind: typeof kind === "string" ? kind : r.kindFromKey ?? aliasKind,
						role: typeof role === "string" ? role : undefined,
					});
				}
			} else if (typeof v === "string" && /^\s*\[\[[^\]]+\]\]\s*\(.+\)\s*$/.test(v)) {
				// One line: "[[House Whitmore]] (king, 1220 – 1258)", role and dates either way round.
				const [, target, inside] = /^\s*(\[\[[^\]]+\]\])\s*\((.+)\)\s*$/.exec(v) ?? [];
				const ref = resolve(linkTexts(target)[0] ?? "");
				const id = ref.key + "|" + (aliasKind ?? "");
				if (!ref.name || seen.has(id)) continue;
				seen.add(id);
				const parts = inside.split(",").map((x) => x.trim());
				const span = parts.find((x) => /\d/.test(x));
				const dates = span ? parseSpan(span, cal) : undefined;
				if (span && !dates) issues.push(`Could not read dates "${span}"`);
				out.push({ ref, kind: aliasKind, from: dates?.start, to: dates?.end, role: parts.find((x) => !/\d/.test(x)) });
			} else {
				for (const t of linkTexts(v)) {
					const ref = resolve(t);
					const id = ref.key + "|" + (aliasKind ?? "");
					if (!ref.name || seen.has(id)) continue;
					seen.add(id);
					out.push({ ref, kind: aliasKind });
				}
			}
		}
	}
	return out;
}

export function readPair(value: unknown): [number, number] | undefined {
	let a: unknown, b: unknown;
	if (Array.isArray(value) && value.length >= 2) [a, b] = value as unknown[];
	else if (typeof value === "string") {
		const m = value.match(/(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)/);
		if (!m) return undefined;
		[a, b] = [m[1], m[2]];
	} else if (value && typeof value === "object") {
		const o = value as Record<string, unknown>;
		a = o.lat ?? o.y ?? o.latitude;
		b = o.lng ?? o.lon ?? o.long ?? o.x ?? o.longitude;
		if ("x" in o && "y" in o) [a, b] = [o.x, o.y];
	}
	const x = Number(a);
	const y = Number(b);
	return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : undefined;
}

/** "x,y x,y …" (SVG style), "x y; x y", or a list of pairs. */
export function readPoints(value: unknown): [number, number][] {
	if (typeof value === "string") {
		const nums = value.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
		const out: [number, number][] = [];
		for (let i = 0; i + 1 < nums.length; i += 2) out.push([nums[i], nums[i + 1]]);
		return out;
	}
	if (Array.isArray(value)) return value.map(readPair).filter((p): p is [number, number] => !!p);
	return [];
}

/** Writes points compactly, the way readPoints reads them back. */
export function writePoints(points: [number, number][]): string {
	return points.map(([a, b]) => `${a},${b}`).join(" ");
}

/** A Lucide icon name or an emoji. Iconize-style names ("LiCastle") become "castle". */
export function readIcon(value: unknown): string | undefined {
	if (typeof value !== "string" || !value.trim()) return undefined;
	const v = value.trim();
	const iconize = v.match(/^Li([A-Z][A-Za-z0-9]*)$/);
	if (iconize) return iconize[1].replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
	return v;
}

const GENERIC_TAGS = new Set(["person", "character", "npc", "people", "event", "culture", "group", "place", "location", "map"]);
const CATEGORY_KEYS = ["kind", "subtype", "place_type", "place-type", "place_category", "settlement", "category"];

/** The finer kind of a note: a "kind:" property, or a type tag more specific than the type (#City, #House). */
export function readCategory(fm: Record<string, unknown>, tags: string[], type: EntityType): string | undefined {
	for (const k of CATEGORY_KEYS) {
		const v = fm[k];
		const s: unknown = Array.isArray(v) ? v[0] : v;
		if (typeof s !== "string" || !s.trim()) continue;
		const clean = s.replace(/^\[\[|\]\]$/g, "").replace(/^#/, "").trim();
		// "category: place" is the type itself, not a kind.
		if (normalizeType(clean) === type && GENERIC_TAGS.has(clean.toLowerCase())) continue;
		return clean.toLowerCase();
	}
	// "type: city" is a place whose kind is city.
	for (const k of ["type", "cr_type"]) {
		const v = fm[k];
		if (typeof v !== "string") continue;
		const low = v.replace(/^#/, "").trim().toLowerCase();
		if (normalizeType(low) === type && !GENERIC_TAGS.has(low) && !TYPE_SYNONYMS[type].slice(0, 2).includes(low)) return low;
	}
	for (const t of tags) {
		const low = t.replace(/^#/, "").toLowerCase();
		if (TAG_TYPES[low] === type && !GENERIC_TAGS.has(low)) return low;
	}
	return undefined;
}

const SIZE_WORDS: Record<string, PinSize> = {
	tiny: "tiny", xs: "tiny", "extra-small": "tiny",
	small: "small", sm: "small", s: "small", minor: "small",
	medium: "medium", md: "medium", m: "medium", normal: "medium", default: "medium",
	large: "large", lg: "large", l: "large", big: "large", major: "large",
	huge: "huge", xl: "huge", "extra-large": "huge", giant: "huge",
};

/** Pin size from "pin-size: large" (or "size: large", only when it's a size word or 1–5). */
export function readPinSize(fm: Record<string, unknown>): PinSize | undefined {
	for (const k of ["pin-size", "pin_size", "pinsize", "map-size", "size"]) {
		const v = fm[k];
		if (v === undefined || v === null) continue;
		const n = Number(v);
		if (typeof v === "number" || (typeof v === "string" && /^\d$/.test(v.trim()))) {
			if (n >= 1 && n <= 5) return PIN_SIZES[Math.round(n) - 1];
			continue;
		}
		const w = SIZE_WORDS[asText(v).trim().toLowerCase()];
		if (w) return w;
	}
	return undefined;
}

/** Map layer 1–5 from "layer: 3" (also "map-layer", "zoom-layer"). */
export function readLayer(fm: Record<string, unknown>): number | undefined {
	for (const k of ["layer", "map-layer", "map_layer", "zoom-layer", "zoom_layer"]) {
		const n = Number(asText(fm[k] ?? "").replace(/^layer\s*/i, ""));
		if (fm[k] !== undefined && fm[k] !== "" && Number.isFinite(n)) return Math.max(1, Math.min(5, Math.round(n)));
	}
	return undefined;
}

/** The note name a stored link points at: "[[Folder/Name|alias]]", "Name", or { person: "[[Name]]" }. */
export function linkTarget(v: unknown): string | undefined {
	if (typeof v === "string") {
		const s = v.replace(/^\[\[|\]\]$/g, "").split("|")[0].trim();
		return s.split("/").pop()?.replace(/\.md$/, "");
	}
	if (v && typeof v === "object" && !Array.isArray(v)) {
		for (const x of Object.values(v as Record<string, unknown>)) {
			if (typeof x === "string" && /^\[\[/.test(x.trim())) return linkTarget(x);
		}
	}
	return undefined;
}

/** Tags like #Character_Male or #person/female. */
export function genderFromTags(tags: string[]): string | undefined {
	for (const t of tags) {
		const m = t.toLowerCase().match(/[_/-](male|female|man|woman)$/);
		if (m) return normalizeGender(m[1]);
	}
	return undefined;
}

export function normalizeGender(v: unknown): string | undefined {
	if (typeof v !== "string") return undefined;
	const s = v.trim().toLowerCase();
	if (["m", "male", "man", "boy", "he"].includes(s)) return "m";
	if (["f", "female", "woman", "girl", "she"].includes(s)) return "f";
	return s ? "x" : undefined;
}
