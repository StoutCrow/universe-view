import type { EntityType } from "../types";
import { kindTag, parseTag, tagValue } from "./tagscheme";

/**
 * Keeping tags to one standard (the tag scheme itself is in tagscheme.ts): a tag is written the way the vault already writes it, and a new note
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
/** What a tag states: the scheme's kind, fact or name (#Group_Nation_Vael → vael), else what follows the first underscore. */
const valueOf = (t: string) => {
	const v = tagValue(plain(t));
	if (v !== undefined) return key(v);
	return plain(t).includes("_") ? key(plain(t).slice(plain(t).indexOf("_") + 1)) : "";
};

/** A tag as the vault spells it; a new one follows the vault's habit of capitals and underscores. */
export function standardTag(raw: string, known: string[]): string {
	const t = plain(raw).replace(/\s+/g, "_");
	const same = known.map(plain).find((k) => key(k) === key(t));
	if (same) return same;
	const capitals = known.filter((k) => /^[A-Z]/.test(plain(k))).length;
	return capitals > known.length / 2 ? t.split("_").map(word).join("_") : t;
}

/** What a note's folders say about it: "The World/Vael/Greyford/Keep.md" is in Vael and Greyford. */
export function factsFromPath(path: string): string[] {
	return path.split("/").slice(0, -1);
}

export interface TagNote extends TagSample {
	path: string;
	/** What's known about it: its kind, gender, folders, realm, "dead", "ruler"… */
	facts: string[];
}

export interface TagFix {
	path: string;
	/** Spellings that differ from the vault's usual one. */
	rename: [string, string][];
	add: string[];
}

/**
 * What it takes to bring every note to the vault's own scheme. Each spelling becomes the commonest one,
 * and a note gains a tag of its type's scheme (#Character_Dead, #Event_War) when its facts say so and
 * the tag is established among the notes it fits.
 * `required` is the plain tag that marks a type, added where most of that type have it. Other plain
 * tags aren't spread: most places being #Title doesn't make a region one.
 */
export function tagFixes(notes: TagNote[], required: Partial<Record<string, string>> = {}): TagFix[] {
	const uses = new Map<string, Map<string, number>>();
	for (const n of notes) {
		for (const t of new Set(n.tags.map(plain))) {
			const spellings = uses.get(key(t)) ?? new Map<string, number>();
			uses.set(key(t), spellings.set(t, (spellings.get(t) ?? 0) + 1));
		}
	}
	// The commonest spelling; on a tie, the one with capitals.
	const usual = (t: string) => [...(uses.get(key(t)) ?? [])].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? plain(t);
	/** Whether a tag is really in use among the notes it fits: a third of them, or it's a leftover to leave be. */
	const established = (t: string, peers: TagNote[]) => {
		const value = valueOf(t);
		const holders = peers.filter((p) => p.tags.some((x) => key(x) === key(t)));
		const fits = peers.filter((p) => p.facts.some((x) => key(x) === value));
		return holders.length >= new Set([...holders, ...fits]).size / 3;
	};
	const byType = new Map<string, TagNote[]>();
	for (const n of notes) byType.set(n.type, [...(byType.get(n.type) ?? []), n]);
	const out: TagFix[] = [];
	for (const n of notes) {
		const peers = byType.get(n.type) ?? [];
		const have = new Set(n.tags.map(key));
		const rename = [...new Set(n.tags.map(plain))].filter((t) => usual(t) !== t).map((t): [string, string] => [t, usual(t)]);
		const wanted = new Set(n.facts.filter(Boolean).map(key));
		const add = new Set<string>();
		for (const t of new Set(peers.flatMap((p) => p.tags.map(plain)))) {
			const at = t.indexOf("_");
			if (at <= 0 || have.has(key(t)) || !wanted.has(valueOf(t))) continue;
			// A scheme fact or kind is about notes of its own type; a belonging tag can go on any note.
			const s = parseTag(t);
			if (s && s.role !== "member" && s.type !== n.type) continue;
			// #Family_Noble is for notes that are #Family, not every group.
			const family = key(t.slice(0, at));
			if (!s && uses.has(family) && !have.has(family)) continue;
			if (established(t, peers)) add.add(usual(t));
		}
		const mark = required[n.type];
		if (mark && !have.has(key(mark)) && peers.filter((p) => p.tags.some((t) => key(t) === key(mark))).length > peers.length / 2) add.add(usual(mark));
		if (rename.length || add.size) out.push({ path: n.path, rename, add: [...add].sort() });
	}
	return out;
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
		const value = valueOf(t);
		if (value ? wanted.has(value) : wanted.has(key(t)) || (same.length >= 3 && n > same.length / 2)) add(t);
	}
	// A fact's tag may only be used on other kinds of note so far: #Nation_Vael on the realm's own lands.
	for (const n of notes) {
		for (const t of n.tags.map(plain)) {
			if (t.includes("_") && wanted.has(valueOf(t)) && !(parseTag(t) && parseTag(t)?.role !== "member" && parseTag(t)?.type !== type)) add(t);
		}
	}
	// A vault on the tag scheme writes the kind as its kind tag (#Place_Starport).
	if (kind && notes.some((n) => n.tags.some((t) => parseTag(plain(t))))) {
		for (const [k, t] of out) if (parseTag(t)?.role === "kind" && parseTag(t)?.type === type) out.delete(k);
		add(kindTag(type as EntityType, kind));
	} else if (kind) {
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
