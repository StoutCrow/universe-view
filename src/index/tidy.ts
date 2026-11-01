/**
 * Housekeeping: likely duplicates, notes nothing connects to, how complete a world is, and places
 * where a note's text disagrees with its properties. No Obsidian here, so it's testable.
 */
import type { ChronDate, Entity, EntityType } from "../types";

const YEAR = 365.25;

// ---- Duplicates -------------------------------------------------------------------------------

const TITLES = /^(the|king|queen|lord|lady|prince|princess|duke|duchess|sir|dame|saint|st|house|order|city of|kingdom of)\s+/i;

export function normName(n: string): string {
	let s = n.toLowerCase().replace(/[’']/g, "").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
	for (let i = 0; i < 3; i++) s = s.replace(TITLES, "");
	return s;
}

export function levenshtein(a: string, b: string): number {
	if (a === b) return 0;
	const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
	for (let i = 1; i <= a.length; i++) {
		let diag = prev[0];
		prev[0] = i;
		for (let j = 1; j <= b.length; j++) {
			const tmp = prev[j];
			prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
			diag = tmp;
		}
	}
	return prev[b.length];
}

export interface DuplicatePair {
	a: Entity;
	b: Entity;
	/** 0–1: how likely they're the same. */
	score: number;
	reason: string;
}

const datesClash = (x?: ChronDate, y?: ChronDate) => !!x && !!y && Math.abs(x.start - y.start) > 2 * YEAR && !x.approx && !y.approx;

/** Notes of the same type whose names (and dates, when both have them) suggest they're one thing. */
export function findDuplicates(entities: Entity[]): DuplicatePair[] {
	const out: DuplicatePair[] = [];
	const byType = new Map<EntityType, Entity[]>();
	for (const e of entities) byType.set(e.type, [...(byType.get(e.type) ?? []), e]);
	for (const list of byType.values()) {
		const norm = list.map((e) => ({ e, n: normName(e.name) }));
		for (let i = 0; i < norm.length; i++) {
			for (let j = i + 1; j < norm.length; j++) {
				const { e: a, n: na } = norm[i];
				const { e: b, n: nb } = norm[j];
				if (!na || !nb || datesClash(a.start, b.start) || datesClash(a.end, b.end)) continue;
				let score = 0;
				let reason = "";
				if (na === nb) {
					score = 0.9;
					reason = "Same name";
				} else if ((nb.startsWith(na + " ") || na.startsWith(nb + " ")) && Math.min(na.length, nb.length) >= 4) {
					// "Aldric" and "Aldric Vane": only likely for people, or when the dates agree.
					const sameDates = !!a.start && !!b.start && Math.abs(a.start.start - b.start.start) < YEAR;
					if (a.type !== "person" && !sameDates) continue;
					score = sameDates ? 0.8 : 0.5;
					reason = sameDates ? "One name contains the other, same dates" : "One name contains the other";
				} else if (Math.min(na.length, nb.length) >= 5 && levenshtein(na, nb) <= (Math.min(na.length, nb.length) >= 9 ? 2 : 1)) {
					score = 0.6;
					reason = "Names differ by a letter or two";
				} else continue;
				if (a.start && b.start && Math.abs(a.start.start - b.start.start) < YEAR) score = Math.min(1, score + 0.1);
				// Linked to each other (e.g. parent and child sharing a name) means two different people.
				const linked = [...a.parents, ...a.children, ...a.partners.map((p) => p.ref)].some((r) => r.key === b.key)
					|| [...b.parents, ...b.children, ...b.partners.map((p) => p.ref)].some((r) => r.key === a.key);
				if (linked) continue;
				out.push({ a, b, score, reason });
			}
		}
	}
	return out.sort((x, y) => y.score - x.score);
}

/**
 * Properties for merging `drop` into `keep`: `keep`'s values win, lists are combined without
 * repeats, and anything only `drop` has is added.
 */
export function mergeFrontmatter(keep: Record<string, unknown>, drop: Record<string, unknown>): Record<string, unknown> {
	const out: Record<string, unknown> = { ...keep };
	for (const [k, v] of Object.entries(drop)) {
		if (k === "position" && !Array.isArray(v)) continue;
		if (!(k in out) || out[k] === null || out[k] === "") out[k] = v;
		else if (Array.isArray(out[k]) || Array.isArray(v)) {
			const list = [...([] as unknown[]).concat(out[k]), ...([] as unknown[]).concat(v)];
			const seen = new Set<string>();
			out[k] = list.filter((x) => {
				const id = JSON.stringify(x).toLowerCase();
				if (seen.has(id)) return false;
				seen.add(id);
				return true;
			});
		}
	}
	return out;
}

/** Replaces links to `from` with links to `to`, keeping display text and headings: [[From|x]] → [[To|x]]. */
export function relink(text: string, from: string, to: string): string {
	const esc = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return text.replace(new RegExp(`\\[\\[((?:[^\\]|#]*/)?)${esc}((?:#[^\\]|]*)?)(\\|[^\\]]*)?\\]\\]`, "gi"), (_m, _folder: string, heading: string, alias: string | undefined) => `[[${to}${heading ?? ""}${alias ?? ""}]]`);
}

// ---- Orphans and completeness -------------------------------------------------------------------

export interface TidyIndex {
	all(type?: EntityType): Entity[];
	get(key: string): Entity | undefined;
	children(key: string): string[];
	partners(key: string): { ref: { key: string } }[];
	events(key: string): Entity[];
	members(key: string): { key: string }[];
	subPlacesOf: Map<string, Set<string>>;
}

export interface Orphan {
	e: Entity;
	problem: "duplicate" | "unlinked" | "no-family" | "not-on-map" | "undated" | "no-place";
	/** For a duplicate: the note it seems to be a copy of. */
	other?: Entity;
	text: string;
}

/**
 * Notes that nothing connects to, people without any family, places not on a map, and events
 * missing a date or a place. `linkedFrom` is how many notes link to each path (Obsidian's backlinks).
 */
export function findOrphans(idx: TidyIndex, linkedFrom: (path: string) => number, isHouse: (e: Entity) => boolean = (e) => /\b(house|family|dynasty|clan)\b/i.test([e.name, e.category ?? "", ...e.tags].join(" "))): Orphan[] {
	const out: Orphan[] = [];
	// Two notes answering to the same name or alias (James II Whitmore and King James II): likely one written twice.
	const names = new Map<string, Entity[]>();
	for (const e of idx.all()) {
		const aliases = ([] as unknown[]).concat(e.props.aliases ?? e.props.alias ?? []).filter((a): a is string => typeof a === "string");
		for (const n of new Set([e.name, ...aliases].map((x) => x.trim().toLowerCase()).filter(Boolean))) names.set(n, [...(names.get(n) ?? []), e]);
	}
	const twins = new Map<string, { other: Entity; name: string }>();
	for (const [n, list] of names) {
		for (const e of list) {
			const other = list.find((x) => x.key !== e.key && x.type === e.type);
			if (other && !twins.has(e.key)) twins.set(e.key, { other, name: n });
		}
	}
	for (const e of idx.all()) {
		if (e.type === "map") continue;
		const relations = e.parents.length + e.children.length + idx.children(e.key).length + idx.partners(e.key).length + e.cultures.length + e.relations.length
			+ e.places.length + e.participants.length + idx.events(e.key).length + idx.members(e.key).length + (e.locatedIn ? 1 : 0) + (idx.subPlacesOf.get(e.key)?.size ?? 0) + e.parentCultures.length
			// Drawn on a map (an area, a road) or tied in another way counts as connected too.
			+ e.territories.length + e.routes.length + e.relatedCultures.length + e.childCultures.length + e.knows.length + e.knownBy.length + (e.map ? 1 : 0);
		if (!relations && !linkedFrom(e.path)) out.push({ e, problem: "unlinked", text: "Nothing links to it and it links to nothing" });
		const twin = twins.get(e.key);
		if (twin) out.push({ e, other: twin.other, problem: "duplicate", text: `Shares the name “${twin.name}” with ${twin.other.name}: the same ${e.type === "person" ? "person" : "thing"} written twice?` });
		// A member of a house has a family, even before their parents are linked.
		const inHouse = e.cultures.some((c) => {
			const g = idx.get(c.ref.key);
			return g ? g.type === "culture" && isHouse(g) : /\b(house|family|dynasty|clan)\b/i.test(c.ref.name);
		});
		if (e.type === "person" && !inHouse && !e.parents.length && !idx.children(e.key).length && !idx.partners(e.key).length) out.push({ e, problem: "no-family", text: "No parents, partners, children or house" });
		if (e.type === "place" && !e.coords && !e.position && !e.territories.length) out.push({ e, problem: "not-on-map", text: "Not on any map" });
		if (e.type === "event" && !e.start) out.push({ e, problem: "undated", text: "No date" });
		if (e.type === "event" && !e.places.length) out.push({ e, problem: "no-place", text: "No place" });
	}
	return out;
}

export interface Completeness {
	label: string;
	done: number;
	total: number;
	/** Notes still missing it, for "show me". */
	missing: Entity[];
}

/** How far along a world is, measure by measure. */
export function completeness(idx: TidyIndex, scope?: string): Completeness[] {
	const inScope = (e: Entity) => !scope || e.path.startsWith(scope + "/");
	const of = (t: EntityType) => idx.all(t).filter(inScope);
	const m = (label: string, list: Entity[], ok: (e: Entity) => boolean): Completeness => {
		const missing = list.filter((e) => !ok(e));
		return { label, done: list.length - missing.length, total: list.length, missing };
	};
	const people = of("person");
	const places = of("place");
	const events = of("event");
	const cultures = of("culture");
	const all = [...people, ...places, ...events, ...cultures];
	return [
		m("People with a birth date", people, (e) => !!e.start),
		m("People with parents or children", people, (e) => e.parents.length > 0 || idx.children(e.key).length > 0),
		m("People in a group", people, (e) => e.cultures.length > 0),
		m("Places on a map", places, (e) => !!(e.coords || e.position || e.territories.length)),
		m("Places inside a region", places, (e) => !!e.locatedIn || (idx.subPlacesOf.get(e.key)?.size ?? 0) > 0),
		m("Events with a date", events, (e) => !!e.start),
		m("Events with a place", events, (e) => e.places.length > 0),
		m("Events with people or groups", events, (e) => e.participants.length + e.cultures.length > 0),
		m("Groups with a founding date", cultures, (e) => !!e.start),
		m("Groups with members", cultures, (e) => idx.members(e.key).length > 0),
		m("Notes with a summary", all, (e) => !!e.summary),
		m("Notes with a picture", all, (e) => !!e.image || !!e.logo),
	].filter((c) => c.total > 0);
}

// ---- Population ---------------------------------------------------------------------------------

/**
 * A place's population: its own `population:` when it has one, otherwise the sum of the places
 * inside it (recursively). `counted` is how many places' figures went into it.
 */
export function totalPopulation(idx: { get(key: string): Entity | undefined; subPlacesOf: Map<string, Set<string>> }, key: string, seen = new Set<string>()): { total: number; counted: number } | undefined {
	if (seen.has(key)) return undefined;
	seen.add(key);
	const e = idx.get(key);
	if (!e) return undefined;
	if (e.population !== undefined) return { total: e.population, counted: 1 };
	let total = 0;
	let counted = 0;
	for (const k of idx.subPlacesOf.get(key) ?? []) {
		const sub = totalPopulation(idx, k, seen);
		if (!sub) continue;
		total += sub.total;
		counted += sub.counted;
	}
	return counted ? { total, counted } : undefined;
}

// ---- Contradictions between text and properties ---------------------------------------------------

export interface Contradiction {
	/** The note whose text says it. */
	path: string;
	/** The note whose property says otherwise (may be the same note). */
	about: string;
	text: string;
}

const CLAIMS: { re: RegExp; field: "start" | "end"; types: EntityType[]; label: string }[] = [
	{ re: /\b(?:was\s+)?born\s+(?:in|on|around|about|circa|c\.)?\s*(?:the\s+year\s+)?([^.;,\n()]{1,28})/gi, field: "start", types: ["person"], label: "born" },
	{ re: /\b(?:died|passed away|was killed|perished)\s+(?:in|on|around|about|circa|c\.)?\s*(?:the\s+year\s+)?([^.;,\n()]{1,28})/gi, field: "end", types: ["person"], label: "died" },
	{ re: /\b(?:was\s+)?(?:founded|established|formed)\s+(?:in|on|around|about|circa|c\.)?\s*(?:the\s+year\s+)?([^.;,\n()]{1,28})/gi, field: "start", types: ["culture", "place"], label: "founded" },
];

/**
 * Dates in a note's own text ("born in 1491") that disagree with its properties, and dates written
 * after a link ("[[Aldric Vane]] (FE 790 – SE 40)") that disagree with that note's.
 * `parse` reads a date in the right calendar, or returns null for words that aren't dates.
 */
export function findContradictions(
	e: Pick<Entity, "path" | "name" | "type" | "start" | "end">,
	body: string,
	parse: (text: string) => ChronDate | null,
	lookup: (linkName: string) => Pick<Entity, "path" | "name" | "start" | "end"> | undefined,
	describe: (d: ChronDate) => string,
): Contradiction[] {
	const out: Contradiction[] = [];
	const text = body.replace(/^---[\s\S]*?---/, "").replace(/```[\s\S]*?```/g, " ").replace(/`[^`]*`/g, " ");
	const differs = (said: ChronDate, prop?: ChronDate) => !!prop && !said.approx && !prop.approx && (said.end < prop.start - YEAR / 2 || said.start > prop.end + YEAR / 2);
	for (const c of CLAIMS) {
		if (!c.types.includes(e.type)) continue;
		// Only sentences about this note: before any other link or name appears in the sentence.
		for (const m of text.matchAll(c.re)) {
			const before = text.slice(Math.max(0, (m.index ?? 0) - 80), m.index).split(/[.!?\n]/).pop() ?? "";
			if (/\[\[/.test(before) || /\b(his|her|their)\s+(father|mother|son|daughter|wife|husband|brother|sister|child|children|parents?)\b/i.test(before)) continue;
			const raw = m[1].trim().replace(/\s+(?:in|at|to|and|as|after|before|during|when)\b.*$/i, "");
			const said = parse(raw);
			const prop = e[c.field];
			if (said && differs(said, prop)) out.push({ path: e.path, about: e.path, text: `Text says ${c.label} ${raw}, but the property says ${describe(prop!)}` });
		}
	}
	// "[[Name]] (1491 – 1547)" or "[[Name]] (b. 1491)".
	const linkDates = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]\s*\(\s*(?:b\.\s*|born\s+)?([^()–—\-\n]{1,24}?)\s*(?:[–—-]+\s*(?:d\.\s*)?([^()\n]{1,24}?))?\s*\)/g;
	for (const m of text.matchAll(linkDates)) {
		const other = lookup(m[1].trim());
		if (!other) continue;
		const a = m[2] ? parse(m[2].trim()) : null;
		const b = m[3] ? parse(m[3].trim()) : null;
		if (a && differs(a, other.start)) out.push({ path: e.path, about: other.path, text: `Writes ${other.name} (${m[2].trim()}…), but ${other.name}'s note says ${describe(other.start!)}` });
		if (b && differs(b, other.end)) out.push({ path: e.path, about: other.path, text: `Writes ${other.name} (…${m[3].trim()}), but ${other.name}'s note says ${describe(other.end!)}` });
	}
	return out;
}
