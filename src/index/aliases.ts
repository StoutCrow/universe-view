/**
 * Other names a note goes by (Obsidian's own `aliases:` property): "USA" and "America" for the United States.
 * A link written with an alias finds the note, and the creator, pickers and search know every name.
 * No Obsidian here, so it is all testable.
 */

/** The aliases in a property value: a list, or one text with commas. Blank ones, repeats and the note's own name are dropped. */
export function readAliases(value: unknown, name = ""): string[] {
	const raw: unknown[] = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
	const seen = new Set([name.trim().toLowerCase()]);
	const out: string[] = [];
	for (const v of raw) {
		if (typeof v !== "string" && typeof v !== "number") continue;
		const text = String(v).replace(/^\[\[|\]\]$/g, "").trim();
		if (!text || seen.has(text.toLowerCase())) continue;
		seen.add(text.toLowerCase());
		out.push(text);
	}
	return out;
}

const SMALL_WORDS = new Set(["of", "the", "and", "de", "la", "le", "von", "van"]);
const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const words = (s: string) => plain(s).split(" ").filter(Boolean);

/** Edit distance between two short names. */
function distance(a: string, b: string): number {
	const row = Array.from({ length: b.length + 1 }, (_, i) => i);
	for (let i = 1; i <= a.length; i++) {
		let diag = row[0];
		row[0] = i;
		for (let j = 1; j <= b.length; j++) {
			const next = Math.min(row[j] + 1, row[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
			diag = row[j];
			row[j] = next;
		}
	}
	return row[b.length];
}

/**
 * The one note a name that has no note probably means: "USA" for United States of America (initials), "Oklahoma" for
 * Oklahoma State (a whole word of its name), "Oklahma" for Oklahoma (a slip of the keys). Undefined when nothing fits
 * or more than one does, so a wrong guess is never offered.
 */
export function aliasCandidate<T extends { name: string; aka?: string[] }>(name: string, notes: T[]): T | undefined {
	const want = plain(name);
	if (!want || want.length < 2) return undefined;
	const pick = (found: T[]) => (found.length === 1 ? found[0] : undefined);
	const initials = (n: string) => words(n).filter((w) => !SMALL_WORDS.has(w)).map((w) => w[0]).join("");
	const bare = want.replace(/ /g, "");
	if (!want.includes(" ") && bare.length <= 5) {
		const byInitials = pick(notes.filter((n) => initials(n.name).length >= 2 && initials(n.name) === bare));
		if (byInitials) return byInitials;
	}
	const own = words(name).filter((w) => !SMALL_WORDS.has(w));
	if (own.length) {
		const byWords = pick(notes.filter((n) => { const w = words(n.name); return w.length > own.length && own.every((x) => w.includes(x)); }));
		if (byWords) return byWords;
	}
	if (bare.length >= 5) return pick(notes.filter((n) => { const t = plain(n.name).replace(/ /g, ""); return t !== bare && distance(t, bare) <= (bare.length >= 9 ? 2 : 1); }));
	return undefined;
}

/** Every name a note answers to, its own first. */
export function namesOf(e: { name: string; aka?: string[] }): string[] {
	return [e.name, ...(e.aka ?? [])];
}
