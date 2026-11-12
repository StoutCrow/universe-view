import { PLACE_KINDS, TERRITORY_WORDS, normaliseKind } from "./placekinds";

/**
 * Finds a place's kind that is broken and says what it should be:
 * - an older word that is really a role or a spelling (`kind: capital` → settlement with the capital role, fortress → fort);
 * - a plural (cities → city, forests → forest);
 * - a typo of a known kind (villiage → village), but only for a word the vault uses once or twice. A word used
 *   three times or more is the vault's own kind and is left alone.
 * No Obsidian here, so it's testable.
 */

export interface KindFix {
	from: string;
	to: string;
	/** Why, in a few words, for the review list. */
	why: string;
	/** Tags that go with it (the role: Place_Role_Capital). */
	add: string[];
}

/** Every word UniverseView knows as a kind of place, an alias of one, or a tier of ruled land. */
export function knownKindWords(): Set<string> {
	const out = new Set<string>(TERRITORY_WORDS);
	for (const d of PLACE_KINDS) {
		out.add(d.kind);
		for (const a of d.alias ?? []) out.add(a);
	}
	for (const w of ["capital", "port", "harbour", "harbor", "other", "settlement", "region", "landform"]) out.add(w);
	return out;
}

/** The fewest single-letter changes between two words (small words only). */
export function distance(a: string, b: string): number {
	if (Math.abs(a.length - b.length) > 2) return 3;
	let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
	for (let i = 1; i <= a.length; i++) {
		const row = [i];
		for (let j = 1; j <= b.length; j++) row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
		prev = row;
	}
	return prev[b.length];
}

const singular = (w: string) => (/[^aeiou]ies$/.test(w) ? w.slice(0, -3) + "y" : /(s|x|ch|sh)es$/.test(w) ? w.slice(0, -2) : /s$/.test(w) && !/ss$/.test(w) ? w.slice(0, -1) : w);

/** What to change a place's kind to, or undefined when it is fine. `uses` says how often the vault uses a word as a kind. */
export function kindFix(kind: string | undefined, known: Set<string>, uses: (word: string) => number): KindFix | undefined {
	const w = (kind ?? "").trim().toLowerCase().replace(/[\s_-]+/g, " ");
	if (!w) return undefined;
	const n = normaliseKind(w);
	if (n.role) return { from: w, to: n.kind ?? "settlement", why: `${w} is a role, not a kind`, add: [`Place_Role_${n.role.charAt(0).toUpperCase() + n.role.slice(1)}`] };
	if (n.kind && n.kind !== w) return { from: w, to: n.kind, why: `${w} is another word for ${n.kind}`, add: [] };
	if (known.has(w) || uses(w) >= 3) return undefined;
	const s = singular(w);
	if (s !== w && known.has(s)) return { from: w, to: s, why: "a plural", add: [] };
	if (w.length < 5) return undefined;
	let best: string | undefined;
	let bestD = 3;
	let tie = false;
	for (const k of known) {
		const d = distance(w, k);
		if (d < bestD) {
			best = k;
			bestD = d;
			tie = false;
		} else if (d === bestD) tie = true;
	}
	return best && bestD <= 2 && !tie ? { from: w, to: best, why: "looks like a typo", add: [] } : undefined;
}
