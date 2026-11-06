import type { EntityType } from "../types";

/** What the detector needs to know about a note (no Obsidian types, so it can be unit-tested). */
export interface NoteInfo {
	path: string;
	name: string;
	props: Record<string, unknown>;
	tags: string[];
	body: string;
}

export interface TypeGuess {
	type: EntityType | null;
	score: number;
	reasons: string[];
	/** Extra properties worth adding, e.g. a year taken from "Blight of 1299". */
	suggestions: Record<string, string>;
}

const FOLDER_WORDS: [RegExp, EntityType | "concept", number][] = [
	[/^(people|persons|characters?|npcs?|cast|dead|living|deceased)$/i, "person", 3],
	[/^(places|locations?|atlas|cities|towns|villages|regions|geography|settlements|forts|castles|planets|landforms)$/i, "place", 3],
	[/^(events?|history|wars|battles|conflicts|periods|disasters)$/i, "event", 3],
	[/^(groups|organi[sz]ations|factions|families|houses|nations|religions|faiths|orgs|guilds|dynasties|companies|realms)$/i, "culture", 3],
	[/^maps$/i, "map", 3],
	[/^(concepts?|dictionary|glossary|nature|fauna|flora|diseases|blights|technology|electronics|templates?|guide|society|government)$/i, "concept", 3],
];

const NAME_RULES: [RegExp, EntityType, number, string][] = [
	[/^(house|clan|order of|kingdom of|empire of|duchy of|republic of|church of|guild of|company of)\b/i, "culture", 4, "name looks like a group"],
	[/\b(battle|siege|war|rebellion|revolt|uprising|treaty|massacre|coronation|founding|sack|blight|plague|pestilence|famine|flood|tourney|tournament|crusade|invasion|assassination|golden age|dark age)\b/i, "event", 4, "name looks like an event"],
	[/\b(city|town|village|keep|castle|fort|fortress|isle|island|river|mountains?|forest|valley|bay|sea|lake|peninsula)\b/i, "place", 2, "name looks like a place"],
];

const PROP_RULES: [string[], EntityType, number][] = [
	[["born", "died", "father", "mother", "spouse", "birthplace", "deathplace", "reign", "honorific"], "person", 4],
	[["date", "date_end", "outcome", "participants"], "event", 4],
	[["founded", "dissolved", "founder", "gov type", "branch of", "branches", "org_type", "members"], "culture", 3],
	[["coordinates", "parent_place", "population", "custom_coordinates_x", "place_type"], "place", 3],
	[["map_id", "image_width"], "map", 4],
];

const BODY_RULES: [RegExp, EntityType, number, string][] = [
	[/\b(was|is) (born|the (?:\w+ )?(son|daughter|wife|husband|widow|king|queen|lord|lady|prince|princess|duke|duchess|knight|emperor|empress|heir))\b/i, "person", 3, "described as a person"],
	[/\b(son|daughter) of \[\[/i, "person", 2, "has a parent link"],
	[/\b(is|was) (?:a|an|the) (?:[\w'-]+ ){0,3}(city|town|village|capital|peninsula|island|region|province|county|duchy|river|mountain|forest|fortress|castle|keep|continent|planet|moon|valley|lake|sea|bay|desert|hamlet|port)\b/i, "place", 3, "described as a place"],
	[/\b(is|was) (?:a|an|the) (?:[\w'-]+ ){0,3}(war|battle|rebellion|revolt|conflict|siege|pestilence|plague|blight|epidemic|pandemic|famine|disaster|treaty|massacre|uprising|invasion|tournament|tourney|period|age|era)\b/i, "event", 3, "described as an event"],
	[/\b(is|was) (?:a|an|the) (?:[\w'-]+ ){0,3}(house|family|dynasty|order|faction|guild|company|corporation|kingdom|empire|republic|religion|faith|organization|organisation|cult|clan|tribe|alliance|league|realm)\b/i, "culture", 3, "described as a group"],
];

/** How often other notes link to this one from a place-, group-, person- or event-like property. */
export type IncomingLinks = Partial<Record<EntityType, number>>;

export function guessType(n: NoteInfo, incoming: IncomingLinks = {}): TypeGuess {
	const scores: Record<string, number> = {};
	const reasons: Record<string, string[]> = {};
	const add = (t: EntityType | "concept", s: number, why: string) => {
		scores[t] = (scores[t] ?? 0) + s;
		(reasons[t] ??= []).push(why);
	};

	if (/\b(timeline|overview|index|list of|glossary|template|readme|home)\b/i.test(n.name)) add("concept", 6, "an overview or index note");

	// Folders count once per type (the strongest one), nearer folders weighing more than distant ones,
	// so a deep "Nature/Diseases/Blights" path doesn't outvote what the note itself says.
	const folders = n.path.split("/").slice(0, -1);
	const folderBest = new Map<string, [number, string]>();
	folders.forEach((f, i) => {
		// "Concepts", "Dictionary", "Glossary" mark a whole branch of the vault as non-entities.
		const definitive = /^(concepts?|dictionary|glossary)$/i.test(f);
		const weight = definitive ? 1.4 : i >= folders.length - 2 ? 1 : 0.5;
		for (const [re, t, s] of FOLDER_WORDS) {
			if (re.test(f) && s * weight > (folderBest.get(t)?.[0] ?? 0)) folderBest.set(t, [s * weight, f]);
		}
	});
	for (const [t, [s, f]] of folderBest) add(t as EntityType | "concept", s, `in “${f}” folder`);
	for (const [re, t, s, why] of NAME_RULES) if (re.test(n.name)) add(t, s, why);
	const nouns: Record<EntityType, string> = { place: "a place", culture: "a group", person: "a person", event: "an event", map: "a map" };
	for (const [t, count] of Object.entries(incoming) as [EntityType, number][]) {
		if (count > 0) add(t, Math.min(4, 2 + count), `linked as ${nouns[t]} from ${count} note${count === 1 ? "" : "s"}`);
	}
	const keys = new Set(Object.keys(n.props).filter((k) => n.props[k] !== null && n.props[k] !== "" && n.props[k] !== undefined).map((k) => k.toLowerCase()));
	for (const [names, t, s] of PROP_RULES) {
		const hit = names.find((k) => keys.has(k));
		if (hit) add(t, s, `has “${hit}”`);
	}
	// A "location" list belongs to places (where they are) and events (where they happened).
	if (keys.has("location") && (keys.has("ruler") || keys.has("lord") || keys.has("liege"))) add("place", 2, "has a location and a ruler");
	const opening = n.body.replace(/^---[\s\S]*?---/, "").replace(/!\[\[[^\]]*\]\]/g, "").slice(0, 700);
	for (const [re, t, s, why] of BODY_RULES) if (re.test(opening)) add(t, s, why);

	let best: EntityType | "concept" | null = null;
	let bestScore = 0;
	for (const [t, s] of Object.entries(scores)) {
		if (s > bestScore) [best, bestScore] = [t as EntityType | "concept", s];
	}
	const suggestions: Record<string, string> = {};
	if (best === "event") {
		const y = n.name.match(/\b(\d{3,4})\b/) ?? opening.match(/\b(?:in|of|during) (\d{3,4})\b/);
		if (y && !keys.has("date") && !keys.has("lifespan")) suggestions.date = y[1];
	}
	const type = best && best !== "concept" && bestScore >= 3 ? best : null;
	return { type, score: bestScore, reasons: best ? reasons[best] : [], suggestions };
}

const LINK_KEYS: Partial<Record<EntityType, string[]>> = {
	place: ["location", "locations", "place", "places", "located-in", "located_in", "parent_place", "birthplace", "deathplace", "birth_place", "death_place", "seat", "where", "region"],
	culture: ["family", "house", "nation", "faction", "factions", "culture", "cultures", "allegience", "allegiance", "branch of", "branches", "organization", "organizations", "faith", "religion"],
	person: ["father", "mother", "parents", "spouse", "partners", "children", "ruler", "liege", "lord", "leader", "founder", "participants", "people"],
};

/**
 * Counts, for every linked note name (lower-case basename), how often other notes point at it from
 * place-, group- or person-like properties. An empty note listed in others' "location:" is a place.
 */
export function incomingLinks(notes: NoteInfo[]): Map<string, IncomingLinks> {
	const out = new Map<string, IncomingLinks>();
	for (const n of notes) {
		for (const [type, keys] of Object.entries(LINK_KEYS) as [EntityType, string[]][]) {
			for (const [k, v] of Object.entries(n.props)) {
				if (!keys.includes(k.toLowerCase())) continue;
				const texts = ([] as unknown[]).concat(v ?? []).map(String).join(" ");
				for (const m of texts.matchAll(/\[\[([^\]|#]+)/g)) {
					const target = m[1].split("/").pop()!.trim().toLowerCase();
					const entry = out.get(target) ?? {};
					entry[type] = (entry[type] ?? 0) + 1;
					out.set(target, entry);
				}
			}
		}
	}
	return out;
}

// ---- Relationships stated in prose --------------------------------------------------------------

export type KinRelation = "father" | "mother" | "parent" | "spouse" | "child" | "betrothed";

export interface KinFinding {
	relation: KinRelation;
	target: string;
	sentence: string;
	/** From a title right before the link ("Queen [[Joanna]]"), for telling father from mother. */
	targetGender?: "m" | "f";
}

const FEMALE_TITLE = /\b(queen|lady|princess|duchess|dame|empress|countess|baroness)\s+$/i;
const MALE_TITLE = /\b(king|lord|prince|duke|sir|emperor|count|baron)\s+$/i;

function titleGender(sentence: string, target: string): "m" | "f" | undefined {
	const i = sentence.indexOf("[[" + target);
	if (i < 0) return undefined;
	const before = sentence.slice(Math.max(0, i - 12), i);
	return FEMALE_TITLE.test(before) ? "f" : MALE_TITLE.test(before) ? "m" : undefined;
}

const LINK = String.raw`\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]+)?\]\]`;
const TITLE = String.raw`(?:(?:king|queen|lord|lady|prince|princess|duke|duchess|sir|dame|emperor|empress|count|countess|baron|baroness)\s+)?`;
const ADJ = String.raw`(?:(?:future|late|first|second|third|current|former|beloved|young|elder|eldest|younger|youngest|only)\s+)?`;

const KIN_PATTERNS: [RegExp, (m: RegExpMatchArray) => [KinRelation, string][]][] = [
	[new RegExp(String.raw`\bborn\b[^.]{0,60}?\bto\s+${TITLE}${LINK}(?:\s+and\s+${TITLE}${LINK})?`, "i"), (m) => [["parent", m[1]], ...(m[2] ? [["parent", m[2]] as [KinRelation, string]] : [])]],
	[new RegExp(String.raw`\b(?:\w+\s+)?(?:son|daughter|child|heir|bastard)\s+of\s+${TITLE}${LINK}(?:\s+and\s+${TITLE}${LINK})?`, "i"), (m) => [["parent", m[1]], ...(m[2] ? [["parent", m[2]] as [KinRelation, string]] : [])]],
	[new RegExp(String.raw`\b(?:his|her|their)\s+${ADJ}(father|mother)\s+${TITLE}${LINK}`, "i"), (m) => [[m[1].toLowerCase() as KinRelation, m[2]]]],
	[new RegExp(String.raw`\b(?:his|her)\s+${ADJ}(?:wife|husband|spouse|consort|queen|king)\s+${TITLE}${LINK}`, "i"), (m) => [["spouse", m[1]]]],
	[new RegExp(String.raw`\bwas\s+(?:the\s+)?${ADJ}(?:wife|husband|spouse|consort)\s+of\s+${TITLE}${LINK}`, "i"), (m) => [["spouse", m[1]]]],
	[new RegExp(String.raw`\bmarried\s+(?:to\s+)?${TITLE}${LINK}`, "i"), (m) => [["spouse", m[1]]]],
	[new RegExp(String.raw`\bbetrothed\s+to\s+${TITLE}${LINK}`, "i"), (m) => [["betrothed", m[1]]]],
	[new RegExp(String.raw`\b(?:his|her|their)\s+${ADJ}(?:son|daughter|child|heir)\s+${TITLE}${LINK}`, "i"), (m) => [["child", m[1]]]],
];

/**
 * Finds family relationships written as "son of [[X]]", "born to [[X]] and [[Y]]", "his wife [[Z]]"…
 * Only sentences about the note's own subject count (they start with its name, a pronoun or a title),
 * so "…held by [[Governor Cedric]] to celebrate his marriage to his wife [[C]]" isn't attributed to them.
 */
export function findKinship(name: string, body: string): KinFinding[] {
	const text = body.replace(/^---[\s\S]*?---/, "").replace(/!\[\[[^\]]*\]\]/g, " ").replace(/\*\*/g, "").replace(/\r/g, "");
	const first = name.replace(/^(king|queen|lord|lady|prince|princess|duke|duchess|sir)\s+/i, "").split(/\s+/)[0];
	// Only meaningful for people: "House Whitmore … son of [[X]]" is about someone else.
	if (/^(house|the|order|clan|kingdom|empire|church|battle|war)$/i.test(first)) return [];
	const subject = new RegExp(
		String.raw`^(?:${escapeRe(first)}|${escapeRe(name)}|he|she|his|her|they|born|the (?:young |old )?(?:king|queen|prince|princess|lord|lady|duke|duchess|knight|emperor|empress)|(?:king|queen|prince|princess|lord|lady|duke|duchess|sir|emperor|empress)\b)`,
		"i",
	);
	const out: KinFinding[] = [];
	const seen = new Set<string>();
	// Sentences: split after . ! or ? (written without lookbehind, which older iPhones can't read at all).
	for (const raw of text.replace(/([.!?])\s+/g, "$1\n").split(/\n+/)) {
		const sentence = raw.replace(/^[#>*\-\s]+/, "").trim();
		if (!sentence || !subject.test(sentence)) continue;
		for (const [re, pick] of KIN_PATTERNS) {
			const m = sentence.match(re);
			if (!m) continue;
			for (const [relation, target] of pick(m)) {
				const t = target.trim();
				if (!t || t.toLowerCase() === name.toLowerCase()) continue;
				const id = relation + "|" + t.toLowerCase();
				if (seen.has(id)) continue;
				seen.add(id);
				out.push({
					relation,
					target: t,
					sentence: sentence.length > 220 ? sentence.slice(0, 217) + "…" : sentence,
					targetGender: titleGender(sentence, t),
				});
			}
		}
	}
	return out;
}

function escapeRe(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
