import type { Entity, Ref, TimedRef } from "../types";
import { parseTag } from "./tagscheme";

/**
 * A kind or tag as the words the tier readers look at: #Place_County → ["county"], #Place_Size_Small
 * → ["size", "small"], a belonging tag → nothing; an older tag split on its separators.
 */
function landParts(raw: string): string[] {
	const p = parseTag(raw);
	if (p?.role === "kind") return [p.kind.replace(/\s+/g, "")];
	if (p?.role === "fact") return p.field === "size" ? ["size", p.value] : [];
	if (p) return [];
	return raw.replace(/^#/, "").toLowerCase().split(/[_/\s-]+/).filter(Boolean);
}

/**
 * Who holds what, strategy-game style: every landed title (a realm, a duchy, a county, a city with
 * lands) sits under one liege title, is held by a person of some house, and answers in the end to a
 * ruler at the top. All of it is read from what notes already say (`location:`, `nation:`, folder
 * notes, `liege:`/`lord:`/`ruler:`, `house:`, tags like `Nation_United_States`), nothing new to write.
 */

/** The little an index needs to offer for this (EntityIndex does). */
export interface RealmSource {
	all(): Entity[];
	get(key: string | undefined): Entity | undefined;
	findByName(name: string): Entity | undefined;
}

export interface RealmNode {
	key: string;
	/** The title it's directly under. */
	under?: string;
	/** Titles directly under it, largest tier first. */
	children: string[];
	/** 0 for a top title. */
	depth: number;
	/** Rank from its kind or tags (1 empire … 6 settlement; 9 when nothing says). */
	rank: number;
	/** The person holding it (a link, which may not have a note yet). */
	holder?: Ref;
	/** The house it's held by: the one the note names, else the holder's. */
	house?: Ref;
	/** Whoever it answers to at the top: its own `ruler:`, else the top title's holder. */
	ruler?: Ref;
	/**
	 * What it is: a realm (something ruled: a kingdom, a duchy, a county, a city with lands) or a
	 * region (geography: a continent, a sub-continent, an island, a forest), which nobody holds and
	 * which is never anyone's liege. North America is a region; the United States, a country lying in it, is a realm.
	 */
	nature: Nature;
	/** The region it lies in (the nearest one above, by folder or `located-in:`), for realms and regions alike. */
	region?: string;
}

/** A realm is ruled; a region is only geography. */
export type Nature = "realm" | "region";

export interface RealmTree {
	nodes: Map<string, RealmNode>;
	/** Top titles, largest first. */
	roots: string[];
}

/** Words that name a tier of title, as a kind or a tag; lower is bigger. */
export const DEFAULT_TIER_WORDS: Record<string, number> = {
	empire: 1, hegemony: 1, imperium: 1, federation: 1, confederation: 1, caliphate: 1,
	kingdom: 2, realm: 2, nation: 2, country: 2, state: 2, republic: 2, principality: 2, commonwealth: 2, dominion: 2,
	sultanate: 2, emirate: 2, khanate: 2, tsardom: 2, shogunate: 2, electorate: 2,
	duchy: 3, province: 3, archduchy: 3, grandduchy: 3, prefecture: 3, palatinate: 3, margraviate: 3, landgraviate: 3,
	county: 4, earldom: 4, march: 4, canton: 4, viscounty: 4,
	barony: 5, shire: 5, district: 5, territory: 5, lordship: 5, fief: 5, parish: 5, hundred: 5, thanedom: 5, seigneury: 5,
	city: 6, town: 6, village: 6, hamlet: 6, manor: 6, settlement: 6, castle: 6, fort: 6, fortress: 6, municipality: 6, metropolis: 6, megacity: 6,
};

/**
 * Words that name geography rather than rule, with their scale (lower is bigger). A note named only
 * by these (#Region, #Continent, `kind: island`) is a region: it holds land, but no one holds it.
 */
export const DEFAULT_REGION_WORDS: Record<string, number> = {
	supercontinent: 1, continent: 1, ocean: 1, world: 1, galaxy: 1,
	subcontinent: 2, landmass: 2, sea: 2, nebula: 2,
	region: 3, archipelago: 3, expanse: 3, wilds: 3,
	area: 4, peninsula: 4, island: 4, isle: 4, mountains: 4, range: 4, desert: 4, highlands: 4, lowlands: 4, steppe: 4, tundra: 4,
	forest: 5, wood: 5, woods: 5, valley: 5, plain: 5, plains: 5, coast: 5, marsh: 5, swamp: 5, moor: 5, hills: 5, bay: 5, gulf: 5, strait: 5,
	lake: 6, glade: 6, pass: 6, locale: 5, spot: 6,
};

/** The built-in names of each realm tier (1 empire … 6 settlement), one and many. */
export const DEFAULT_TIER_NAMES: [string, string][] = [["", ""], ["Empire", "Empires"], ["Kingdom", "Kingdoms"], ["Duchy", "Duchies"], ["County", "Counties"], ["Barony", "Baronies"], ["Settlement", "Settlements"]];
export const REGION_TIER_LABELS = ["", "Continent", "Sub-continent", "Region", "Land", "Locale", "Spot"];

/** A vault's own name for a tier: a state for a duchy, a parish for a barony. */
export interface TierName {
	one: string;
	/** Worked out from `one` when empty (State → States, County → Counties). */
	many?: string;
}

/** Ready-made sets of names, by tier. The first is the built-in one. */
export const TIER_NAME_PRESETS: [string, string, Record<string, TierName>][] = [
	["medieval", "Medieval (empire, kingdom, duchy, county, barony)", {}],
	["modern", "Modern (union, country, state, county, district, city)", { "1": { one: "Union" }, "2": { one: "Country", many: "Countries" }, "3": { one: "State" }, "4": { one: "County", many: "Counties" }, "5": { one: "District" }, "6": { one: "City", many: "Cities" } }],
	["provincial", "Provincial (empire, kingdom, province, county, parish)", { "3": { one: "Province" }, "5": { one: "Parish", many: "Parishes" } }],
	["galactic", "Galactic (empire, sector, system, planet, moon, colony)", { "2": { one: "Sector" }, "3": { one: "System" }, "4": { one: "Planet" }, "5": { one: "Moon" }, "6": { one: "Colony", many: "Colonies" } }],
];

/** Which ready-made set the vault's tier names are, or undefined for names of its own. */
export function tierPresetOf(names: Record<string, TierName> | undefined): string | undefined {
	const key = (n: Record<string, TierName> | undefined) => [1, 2, 3, 4, 5, 6].map((t) => `${n?.[t]?.one?.trim() || ""}|${n?.[t]?.many?.trim() || ""}`).join(",");
	return TIER_NAME_PRESETS.find(([, , p]) => key(p) === key(names))?.[0];
}

/** County → Counties, Parish → Parishes, State → States. */
export function pluralOf(word: string): string {
	if (/[^aeiou]y$/i.test(word)) return word.slice(0, -1) + "ies";
	if (/(s|x|z|ch|sh)$/i.test(word)) return word + "es";
	return word + "s";
}

let tierNamesNow: [string, string][] = DEFAULT_TIER_NAMES;
let namedWords: Record<string, number> = {};

/** Uses a vault's own tier names everywhere (labels, menus, the tags written); none = the built-in ones. */
export function setTierNames(custom: Record<string, TierName> | undefined) {
	namedWords = {};
	tierNamesNow = DEFAULT_TIER_NAMES.map(([one, many], i) => {
		const c = custom?.[String(i)];
		const own = c?.one?.trim();
		if (!i || !own) return [one, many];
		const plural = c?.many?.trim() || pluralOf(own);
		// The new name is a tier word too, so #State or `kind: state` puts a land on this tier; but a
		// geography word (a tier called Region) stays geography, or every #Region would become ruled land.
		for (const w of [own, plural]) {
			const word = w.toLowerCase().replace(/[\s_-]+/g, "");
			if (DEFAULT_REGION_WORDS[word] === undefined) namedWords[word] = i;
		}
		return [own, plural];
	});
}

/** A realm tier's name, "State"; `many` gives "States". */
export function tierName(tier: number, many = false): string {
	return tierNamesNow[Math.max(1, Math.min(6, Math.round(tier)))]?.[many ? 1 : 0] ?? "";
}

/** Whether a tier goes by a name of the vault's own. */
export function tierRenamed(tier: number): boolean {
	return tierNamesNow[tier]?.[0] !== DEFAULT_TIER_NAMES[tier]?.[0];
}

/** Every word naming a tier: the built-in ones, the tiers' own names, then the settings' extra words. */
export function tierWordsWith(extra: string): Record<string, number> {
	return { ...DEFAULT_TIER_WORDS, ...namedWords, ...tierWords(extra) };
}

/** "Kingdom", "Sub-continent"…: what a node is, in a word. */
export function tierLabel(node: RealmNode | undefined): string {
	if (!node || node.rank >= 9) return node?.nature === "region" ? "Region" : "";
	const i = Math.max(1, Math.min(6, Math.round(node.rank)));
	return node.nature === "region" ? REGION_TIER_LABELS[i] : tierName(i);
}

/** Says outright what a note is: `polity: region` / `polity: realm`, or `sovereign: true`. */
function statedNature(e: Entity): Nature | undefined {
	for (const k of ["polity", "nature", "realm-or-region"]) {
		const v = e.props[k];
		if (typeof v !== "string") continue;
		if (/^(region|geograph|land|area)/i.test(v.trim())) return "region";
		if (/^(realm|title|state|nation|polity|sovereign|political)/i.test(v.trim())) return "realm";
	}
	if (e.props.sovereign === true || e.props.sovereign === "true") return "realm";
	return undefined;
}

/**
 * Realm or region. Said outright wins; then anything that names rule (#Title, #Realm, #Province, a
 * kind like duchy or city, a holder or ruler that's filled in) makes it a realm, even when it is also
 * tagged #Region (the United States is both); a note named only by geography (#Region, #Continent) is a region.
 */
export function natureOf(e: Entity, words: Record<string, number> = DEFAULT_TIER_WORDS, regionWords: Record<string, number> = DEFAULT_REGION_WORDS): Nature | undefined {
	const stated = statedNature(e);
	if (stated) return stated;
	let political = false;
	let geographic = false;
	for (const raw of [e.category ?? "", ...e.tags]) {
		const parts = landParts(raw);
		if (!parts.length) continue;
		const sized = parts.length === 2 && SIZE[parts[1]] !== undefined;
		const word = parts.length === 1 || sized ? parts[0] : parts.join("");
		if (word === "title" || words[word] !== undefined) political = true;
		else if (regionWords[word] !== undefined) geographic = true;
	}
	const filled = (v: unknown) => (Array.isArray(v) ? v.some((x) => typeof x === "string" && x.trim()) : typeof v === "string" && !!v.trim());
	if (["holder", "owner", "lord", "lady", "ruler"].some((k) => filled(e.props[k]))) political = true;
	if (political) return "realm";
	if (geographic) return "region";
	return undefined;
}

/** How a size word moves a region's rank: geography spans more, so #Region_Gigantic is a continent and #Region_Enormous a sub-continent. */
export const REGION_SIZE_OFFSET: Record<string, number> = { gigantic: -2, enormous: -1.4, massive: -1.4, huge: -1, large: -0.5, big: -0.5, major: -0.5, medium: 0, small: 0.5, minor: 0.5, little: 0.5, tiny: 1 };

/** A region's level (1 continent … 6 spot) from its geography words alone, before any size; undefined when nothing names one. */
export function regionLevelOf(e: Entity, regionWords: Record<string, number> = DEFAULT_REGION_WORDS): number | undefined {
	let best = 9;
	for (const raw of [e.category ?? "", ...e.tags]) {
		const parts = landParts(raw);
		const sized = parts.length === 2 && REGION_SIZE_OFFSET[parts[1]] !== undefined;
		const r = regionWords[parts.join("")] ?? (parts.length === 1 || sized ? regionWords[parts[0]] : undefined);
		if (r !== undefined && r < best) best = r;
	}
	return best === 9 ? undefined : best;
}

/** A region's scale from its geography words, with sizes (#Region_Enormous is bigger than #Region). */
export function regionRankOf(e: Entity, regionWords: Record<string, number> = DEFAULT_REGION_WORDS): number {
	const REGION_SIZE = REGION_SIZE_OFFSET;
	let best = 9;
	let size = 0;
	for (const raw of [e.category ?? "", ...e.tags]) {
		const parts = landParts(raw);
		const sized = parts.length === 2 && REGION_SIZE[parts[1]] !== undefined;
		const r = regionWords[parts.join("")] ?? (parts.length === 1 || sized ? regionWords[parts[0]] : undefined);
		if (r !== undefined && r < best) best = r;
		if (sized && (regionWords[parts[0]] !== undefined || parts[0] === "size")) size = REGION_SIZE[parts[1]];
	}
	return best === 9 ? 9 : Math.max(1, best + size);
}

/** Extra tier words from the settings: "word = rank" per line (or comma-separated). */
export function tierWords(text: string): Record<string, number> {
	const out: Record<string, number> = {};
	for (const part of text.split(/[\n,]/)) {
		const m = /^\s*#?([\w -]+?)\s*[=:]\s*(\d+)\s*$/.exec(part);
		if (m) out[m[1].toLowerCase().replace(/[\s_-]+/g, "")] = Number(m[2]);
	}
	return out;
}

/** Size suffixes on tags like `Region_Small`: a hint between equal ranks. */
export const SIZE = { gigantic: -0.45, enormous: -0.45, massive: -0.45, huge: -0.4, large: -0.2, big: -0.2, major: -0.2, medium: 0, small: 0.2, minor: 0.2, little: 0.2, tiny: 0.4 } as Record<string, number>;

/** A note's tier rank from its kind and tags (9 when nothing names one). */
export function rankOf(e: Entity, words: Record<string, number> = DEFAULT_TIER_WORDS): number {
	let best = 9;
	let size = 0;
	for (const raw of [e.category ?? "", ...e.tags]) {
		const parts = landParts(raw);
		// "Region_Small" is a tier with a size; "Nation_United_States" names a realm, it isn't one.
		const sized = parts.length === 2 && SIZE[parts[1]] !== undefined;
		const r = words[parts.join("")] ?? (parts.length === 1 || sized ? words[parts[0]] : undefined);
		if (r !== undefined && r < best) best = r;
		if (sized) size = SIZE[parts[1]];
	}
	return best === 9 ? 9 : best + size;
}

const UNDER_KEYS = ["under", "liege-realm", "liege_realm", "part-of", "part_of", "overlord-realm"];
const HOLDER_KINDS = ["holder", "owner", "lord", "lady", "ruler", "leader", "head"];

function asNames(v: unknown): string[] {
	return ([] as unknown[]).concat(v ?? []).filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.replace(/^\[\[|\]\]$/g, "").split("|")[0].trim());
}

/** The folder a folder note stands for ("A/B/B.md" → "A/B"), or undefined for an ordinary note. */
function ownFolder(e: Entity): string | undefined {
	const last = e.folder.split("/").pop();
	return e.folder && e.path === `${e.folder}/${last}.md` ? e.folder : undefined;
}

/**
 * Builds the tree of titles. `isHouse` tells families apart (they hold titles, they aren't titles);
 * `at` (a universal day) picks the holders and ties that applied then.
 */
export function realmTree(src: RealmSource, isHouse: (e: Entity) => boolean, at?: number, words: Record<string, number> = DEFAULT_TIER_WORDS, regionWords: Record<string, number> = DEFAULT_REGION_WORDS): RealmTree {
	const now = (l: TimedRef) => at === undefined || ((!l.from || l.from.start <= at) && (!l.to || l.to.end >= at));
	const all = src.all();
	// Titles: places, and groups that aren't families, people's religions or the like.
	const isTitle = (e: Entity | undefined): e is Entity => !!e && (e.type === "place" || (e.type === "culture" && !isHouse(e) && (rankOf(e, words) < 9 || regionRankOf(e, regionWords) < 9 || e.territories.length > 0)));
	const titles = all.filter(isTitle);
	const folderNote = new Map<string, Entity>();
	for (const t of titles) {
		const f = ownFolder(t);
		if (f) folderNote.set(f, t);
	}
	// Realm or region: unsaid, a note named only by geography words is a region, anything else a realm.
	const nature = new Map<string, Nature>(titles.map((t) => [t.key, natureOf(t, words, regionWords) ?? (rankOf(t, words) === 9 && regionRankOf(t, regionWords) < 9 ? "region" : "realm")]));
	const isRegion = (x: Entity) => nature.get(x.key) === "region";
	// Regions are ranked on their own scale (continent … spot), realms on theirs (empire … settlement).
	const rank = new Map(titles.map((t) => [t.key, isRegion(t) ? regionRankOf(t, regionWords) : rankOf(t, words)]));

	const candidatesOf = (e: Entity): Entity[] => {
		const out: Entity[] = [];
		const push = (x: Entity | undefined) => {
			if (isTitle(x) && x.key !== e.key && !out.includes(x)) out.push(x);
		};
		for (const k of UNDER_KEYS) for (const n of asNames(e.props[k])) push(src.findByName(n));
		if (e.locatedIn) push(src.get(e.locatedIn.key));
		for (const c of e.cultures) if (now(c)) push(src.get(c.ref.key));
		for (const t of e.tags) {
			// #Group_Nation_United_States, #Place_Continent_North_America: the land or realm it belongs to.
			const p = parseTag(t);
			if (p?.role === "member") {
				if (p.type === "place" || p.type === "culture") push(src.findByName(p.name));
				continue;
			}
			const m = /^#?(?:nation|realm|kingdom|under)[_/](.+)$/i.exec(t);
			if (m) push(src.findByName(m[1].replace(/_/g, " ")));
		}
		// The nearest folder note above; for a realm, also the nearest realm above it, past any regions
		// (United States' folder sits in North America's, but North America rules nothing).
		let dir = ownFolder(e) ?? e.folder;
		if (ownFolder(e)) dir = dir.includes("/") ? dir.slice(0, dir.lastIndexOf("/")) : "";
		let found = false;
		for (; dir; dir = dir.includes("/") ? dir.slice(0, dir.lastIndexOf("/")) : "") {
			const f = folderNote.get(dir);
			if (!f || f.key === e.key) continue;
			if (!found) push(f);
			found = true;
			if (isRegion(e) || !isRegion(f)) {
				push(f);
				break;
			}
		}
		if (e.type === "culture") {
			for (const p of e.parentCultures) push(src.get(p.key));
			// A realm's `location:` (its places), but not its seat or anything that doesn't say what it is.
			const seats = new Set(asNames(e.props.seat).map((n) => n.toLowerCase()));
			for (const p of e.places) {
				const x = src.get(p.key);
				if (x && !seats.has(x.name.toLowerCase()) && (rank.get(x.key) ?? 9) < 9) push(x);
			}
		}
		return out;
	};

	// A candidate inside another's folder, or a smaller tier, is the more specific liege.
	const inside = (a: Entity, b: Entity) => {
		const f = ownFolder(b);
		return !!f && a.path.startsWith(f + "/");
	};
	const under = new Map<string, string>();
	const regionOf = new Map<string, string>();
	// A folder that holds the note itself is the strongest sign, then being inside the other
	// candidates; the smaller tier only breaks ties (unranked ones don't count as small).
	const pick = (t: Entity, pool: Entity[]) => {
		const score = (x: Entity) => {
			const rx = rank.get(x.key) ?? 9;
			return (inside(t, x) ? 100 : 0) + pool.filter((y) => y !== x && inside(x, y)).length * 10 + (rx === 9 ? 0 : rx / 10);
		};
		let best = pool[0];
		for (const x of pool) if (score(x) > score(best)) best = x;
		return best;
	};
	for (const t of titles) {
		const c = candidatesOf(t);
		// The region it lies in: geography, whoever rules it.
		const regions = c.filter(isRegion).filter((x) => !(isRegion(t) && (rank.get(x.key) ?? 9) > (rank.get(t.key) ?? 9) && (rank.get(t.key) ?? 9) < 9));
		if (regions.length) regionOf.set(t.key, pick(t, regions).key);
		// Said outright (`under: [[United States]]`, as the inspector writes it): that's the answer.
		const explicit = UNDER_KEYS.flatMap((k) => asNames(t.props[k])).map((n) => src.findByName(n)).find((x) => isTitle(x) && x.key !== t.key);
		if (explicit) {
			under.set(t.key, explicit.key);
			continue;
		}
		// A realm answers only to a realm: a kingdom lying in a sub-continent is still sovereign.
		const liege = isRegion(t) ? c : c.filter((x) => !isRegion(x));
		if (!liege.length) continue;
		// A liege is never a smaller tier than its vassal (when both say what they are and are the
		// same kind of thing; sizes aside). A region inside a realm (a forest in a duchy) is under it.
		const tier = (k: string) => Math.round(rank.get(k) ?? 9);
		const r = tier(t.key);
		const same = (x: Entity) => isRegion(x) === isRegion(t);
		// Only smaller tiers to choose from (a realm whose `location:` is a region): it's on top.
		const pool = liege.filter((x) => !same(x) || r === 9 || tier(x.key) === 9 || tier(x.key) <= r);
		if (!pool.length) continue;
		under.set(t.key, pick(t, pool).key);
	}
	// Wars and treaties: an event's `transfers:` move a land to another liege on its date. On the
	// time slider, the land answers to whoever the latest transfer before that day gave it to (and
	// before the first, to whoever it was taken from). With no date, the note's own `under:` stands,
	// and the latest transfer only fills in when the note doesn't say.
	const moves = new Map<string, { day: number; from?: Ref; to?: Ref }[]>();
	for (const ev of all) {
		if (!ev.transfers?.length || !ev.start) continue;
		for (const tr of ev.transfers) {
			if (!tr.land.resolved) continue;
			moves.set(tr.land.key, [...(moves.get(tr.land.key) ?? []), { day: ev.start.start, from: tr.from, to: tr.to }]);
		}
	}
	for (const [land, list] of moves) {
		const t = src.get(land);
		if (!isTitle(t)) continue;
		list.sort((a, b) => a.day - b.day);
		const said = UNDER_KEYS.some((k) => asNames(t.props[k]).length);
		let liege: Ref | undefined | null = null;
		if (at === undefined) {
			if (said) continue;
			liege = list[list.length - 1].to;
		} else {
			const past = list.filter((m) => m.day <= at);
			liege = past.length ? past[past.length - 1].to : list[0].from;
		}
		const lord = liege?.resolved ? src.get(liege.key) : undefined;
		if (lord && isTitle(lord) && lord.key !== land) under.set(land, lord.key);
		else if (liege === undefined) under.delete(land);
	}
	// Break any cycle by dropping the link that closes it.
	for (const t of titles) {
		const seen = new Set<string>([t.key]);
		for (let k = under.get(t.key); k; k = under.get(k)) {
			if (seen.has(k)) {
				under.delete(t.key);
				break;
			}
			seen.add(k);
		}
	}

	// A person, or a name with no note yet ("lord: [[Lena Ortiz]]" before Lena has a note).
	const personLike = (r: Ref) => (r.resolved ? src.get(r.key)?.type === "person" : true);
	const holderOf = (e: Entity): Ref | undefined => {
		// Holders over time (`holders:`): whoever held it on the day; with no day, the one holding it
		// now (no end yet), else the latest. A title nobody held on that day is vacant.
		if (e.holders?.length) {
			if (at !== undefined) return e.holders.find((h) => (!h.from || h.from.start <= at) && (!h.to || h.to.end >= at))?.ref;
			return (e.holders.filter((h) => !h.to).pop() ?? e.holders[e.holders.length - 1]).ref;
		}
		// `holder:` / `owner:` aren't relationships, so read them straight from the note.
		for (const k of ["holder", "owner"]) {
			const n = asNames(e.props[k])[0];
			if (!n) continue;
			const p = src.findByName(n);
			return p ? { key: p.key, name: p.name, resolved: true } : { key: "?" + n.toLowerCase(), name: n, resolved: false };
		}
		for (const kind of HOLDER_KINDS) {
			const r = e.relations.find((x) => x.kind === kind && now(x) && personLike(x.ref));
			if (r) return r.ref;
		}
		return undefined;
	};
	const houseLike = (r: Ref) => {
		if (!r.resolved) return /\b(house|family|dynasty|clan)\b/i.test(r.name);
		const c = src.get(r.key);
		return !!c && c.type === "culture" && isHouse(c);
	};
	const houseOf = (e: Entity, holder?: Ref): Ref | undefined => {
		const own = e.cultures.find((c) => now(c) && houseLike(c.ref));
		if (own) return own.ref;
		const p = holder?.resolved ? src.get(holder.key) : undefined;
		return p?.cultures.find((c) => now(c) && houseLike(c.ref))?.ref;
	};

	const nodes = new Map<string, RealmNode>();
	for (const t of titles) {
		// Nobody holds a region.
		const region = isRegion(t);
		const holder = region ? undefined : holderOf(t);
		nodes.set(t.key, { key: t.key, under: under.get(t.key), children: [], depth: 0, rank: rank.get(t.key) ?? 9, holder, house: region ? undefined : houseOf(t, holder), nature: nature.get(t.key) ?? "realm", region: regionOf.get(t.key) });
	}
	for (const n of nodes.values()) if (n.under) nodes.get(n.under)?.children.push(n.key);
	const byRank = (a: string, b: string) => (nodes.get(a)!.rank - nodes.get(b)!.rank) || src.get(a)!.name.localeCompare(src.get(b)!.name);
	for (const n of nodes.values()) n.children.sort(byRank);
	const roots = [...nodes.values()].filter((n) => !n.under).map((n) => n.key).sort(byRank);
	const walk = (k: string, depth: number, ruler?: Ref) => {
		const n = nodes.get(k)!;
		n.depth = depth;
		const own = src.get(k)!.relations.find((x) => x.kind === "ruler" && now(x))?.ref;
		n.ruler = own ?? ruler ?? n.holder;
		for (const c of n.children) walk(c, depth + 1, n.ruler);
	};
	for (const r of roots) walk(r, 0);
	return { nodes, roots };
}

/** The titles above one, top first, ending with it. */
export function chainOf(tree: RealmTree, key: string): string[] {
	const out: string[] = [];
	for (let k: string | undefined = key, i = 0; k && i < 20; k = tree.nodes.get(k)?.under, i++) out.unshift(k);
	return out;
}

/** The top title a note is under (itself when it's on top). */
export function topOf(tree: RealmTree, key: string): string | undefined {
	return tree.nodes.has(key) ? chainOf(tree, key)[0] : undefined;
}

/** Every title below one, nearest first. */
export function descendantsOf(tree: RealmTree, key: string): string[] {
	const out: string[] = [];
	const queue = [...(tree.nodes.get(key)?.children ?? [])];
	while (queue.length) {
		const k = queue.shift()!;
		out.push(k);
		queue.push(...(tree.nodes.get(k)?.children ?? []));
	}
	return out;
}

/** The titles a person (as holder) or a house holds, largest first. */
export function holdingsOf(tree: RealmTree, key: string): string[] {
	return [...tree.nodes.values()].filter((n) => n.holder?.key === key || n.house?.key === key).sort((a, b) => a.rank - b.rank || a.depth - b.depth).map((n) => n.key);
}
