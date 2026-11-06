/**
 * Keeping tags to one standard: a tag is written the way the vault already writes it, and a new note
 * gets the tags notes like it have. Nothing here is a fixed list: the rules are read from the vault,
 * so #Event_War comes from a vault that writes #Event_War, and an untagged vault gets nothing extra.
 */

export interface TagSample {
	type: string;
	tags: string[];
}

const plain = (t: string) => t.replace(/^#/, "").trim();
const key = (t: string) => plain(t).toLowerCase().replace(/[\s_-]+/g, "_");
const word = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A tag as the vault spells it; a new one follows the vault's habit of capitals and underscores. */
export function standardTag(raw: string, known: string[]): string {
	const t = plain(raw).replace(/\s+/g, "_");
	const same = known.map(plain).find((k) => key(k) === key(t));
	if (same) return same;
	const capitals = known.filter((k) => /^[A-Z]/.test(plain(k))).length;
	return capitals > known.length / 2 ? t.split("_").map(word).join("_") : t;
}

/**
 * The tags a new note of this type should have: plain ones most notes of its type share, and any that
 * state one of its facts ("war" → #Event_War, "Vael" → #Nation_Vael). A `kind` the vault has
 * no tag for yet is written in the pattern its type uses, once that pattern is established.
 */
export function standardTagsFor(type: string, facts: string[], kind: string | undefined, notes: TagSample[]): string[] {
	const same = notes.filter((n) => n.type === type);
	const counts = new Map<string, number>();
	for (const n of same) for (const t of new Set(n.tags.map(plain))) counts.set(t, (counts.get(t) ?? 0) + 1);
	const wanted = new Set(facts.filter(Boolean).map(key));
	const out = new Map<string, string>();
	const add = (t: string) => out.set(key(t), t);
	for (const [t, n] of counts) {
		// #Character can go on every person; #Event_War says something, so it has to be true of this note.
		const value = t.includes("_") ? key(t.slice(t.indexOf("_") + 1)) : "";
		if (value ? wanted.has(value) : wanted.has(key(t)) || (same.length >= 3 && n > same.length / 2)) add(t);
	}
	// A fact's tag may only be used on other kinds of note so far: #Nation_Vael on the realm's own lands.
	for (const n of notes) {
		for (const t of n.tags.map(plain)) {
			if (t.includes("_") && wanted.has(key(t.slice(t.indexOf("_") + 1)))) add(t);
		}
	}
	if (kind) {
		const prefixes = new Map<string, Set<string>>();
		for (const t of counts.keys()) {
			const at = t.indexOf("_");
			if (at > 0) prefixes.set(t.slice(0, at), (prefixes.get(t.slice(0, at)) ?? new Set()).add(t));
		}
		const prefix = [...prefixes].sort((a, b) => b[1].size - a[1].size)[0];
		const has = [...out.values()].some((t) => key(t).endsWith(`_${key(kind)}`) || key(t) === key(kind));
		if (prefix && prefix[1].size >= 3 && !has) add(`${prefix[0]}_${kind.split(/\s+/).map(word).join("_")}`);
	}
	return [...out.values()];
}
