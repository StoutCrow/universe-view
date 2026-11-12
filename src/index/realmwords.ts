/**
 * A realm is three things at once, and its note can say each: the land (its seat, where it lies, its borders on a
 * map), its people (what they are called: England's people are English), and its crown (who rules, and what the
 * ruler is called). The land and the ruler are links the note already has; these are the two words.
 * No Obsidian here, so it's testable.
 */
import { asText } from "./text";

/** Properties that name a realm's people (a nationality, a demonym): `demonym: English`. */
export const DEMONYM_KEYS = ["demonym", "nationality", "people-name", "people_name"];
/** Properties that name a realm's ruler, for a man and a woman: `ruler-title: King, Queen`. */
export const RULER_TITLE_KEYS = ["ruler-title", "ruler_title", "ruler title", "ruler-titles", "title-of-ruler"];

export interface RealmWords {
	/** What its people are called ("English"). */
	demonym?: string;
	/** What its ruler is called, for a man and a woman ("King", "Queen"); one word serves both. */
	ruler?: { m: string; f: string };
}

const valueOf = (props: Record<string, unknown>, keys: string[]): string => {
	const lower = new Map(Object.keys(props).map((k) => [k.toLowerCase(), k]));
	for (const k of keys) {
		const key = lower.get(k);
		if (key === undefined) continue;
		const v = asText(props[key]).replace(/\[\[|\]\]/g, "").trim();
		if (v) return v;
	}
	return "";
};

/** The words a realm's note gives for its people and its ruler. */
export function realmWords(props: Record<string, unknown>): RealmWords {
	const out: RealmWords = {};
	const demonym = valueOf(props, DEMONYM_KEYS);
	if (demonym) out.demonym = demonym;
	// "King, Queen", "King / Queen" or "King or Queen": the man's word first; one word for both.
	const words = valueOf(props, RULER_TITLE_KEYS).split(/\s*(?:,|\/|\bor\b)\s*/).map((w) => w.trim()).filter(Boolean);
	if (words.length) out.ruler = { m: words[0], f: words[1] ?? words[0] };
	return out;
}

/** The ruler's word for this gender, when the realm names one. */
export function rulerWord(words: RealmWords, gender?: "male" | "female"): string | undefined {
	if (!words.ruler) return undefined;
	return gender === "female" ? words.ruler.f : words.ruler.m;
}
