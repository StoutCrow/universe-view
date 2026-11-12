/**
 * The bracketed part after a name, read one way everywhere: parents, partners, relations (friends, allies…) and the
 * relatives written as family lines.
 *
 *   [[Anna]] (step)                          a kind from the tie's own vocabulary
 *   [[Bob]] (spouse, 1230 – 1255)            a kind and dates
 *   [[Bob]] (spouse, 1230 – 1255, "a secret wedding")   and custom text, in quotes: shown as written
 *   Carol (f, 1230 – 1290)                   gender and dates of the person, for a relative with no note
 *
 * Commas split the parts, except inside quotes. A part with a digit is the dates; a quoted part is the custom text;
 * `f`/`m` (or female/male) is a gender; a word from the vocabulary is the kind; anything else is `words`, which the
 * reader of that tie decides on (a role such as "king"). No Obsidian here, so it's testable.
 */

export interface TieDetails {
	kind?: string;
	gender?: "female" | "male";
	/** Custom text, as written. */
	label?: string;
	/** The dates, as written ("1230 – 1255"). */
	span?: string;
	/** How it ended (`ended: divorce`). */
	reason?: string;
	/** Parts that are none of the above, in order. */
	words: string[];
}

/** Splits at commas that are not inside quotes. */
export function splitParts(inside: string): string[] {
	const out: string[] = [];
	let cur = "";
	let quote = "";
	for (const ch of inside) {
		if (quote) {
			cur += ch;
			if (ch === quote) quote = "";
		} else if (ch === '"' || ch === "“") {
			quote = ch === "“" ? "”" : ch;
			cur += ch;
		} else if (ch === ",") {
			out.push(cur);
			cur = "";
		} else cur += ch;
	}
	out.push(cur);
	return out.map((s) => s.trim()).filter(Boolean);
}

const unquote = (s: string) => s.replace(/^["“”]|["“”]$/g, "").trim();
const GENDERS: Record<string, "female" | "male"> = { f: "female", female: "female", w: "female", m: "male", male: "male" };
const norm = (s: string) => s.trim().toLowerCase().replace(/[\s_]+/g, "-");

/** What the part after a name says. `kinds` is the vocabulary of kind words for this sort of tie. */
export function parseDetails(inside: string, kinds: readonly string[] = []): TieDetails {
	const out: TieDetails = { words: [] };
	const vocab = new Set(kinds.map(norm));
	for (const part of splitParts(inside)) {
		const ended = /^(?:ended|reason)\s*:\s*(.+)$/i.exec(part);
		if (ended) out.reason ??= ended[1].trim();
		else if (/^["“]/.test(part)) out.label ??= unquote(part);
		else if (/\d/.test(part)) out.span ??= part;
		else if (GENDERS[part.toLowerCase()] && !vocab.has(norm(part))) out.gender ??= GENDERS[part.toLowerCase()];
		else if (vocab.has(norm(part))) out.kind ??= norm(part);
		else out.words.push(part);
	}
	return out;
}

/** A name with its bracketed part split off: "Carol (f, 1230)" → { name: "Carol", inside: "f, 1230" }. Links are unwrapped. */
export function splitDetails(text: string): { name: string; inside?: string } {
	const t = text.replace(/^\s*[-*]\s+/, "").trim();
	const m = /^(.*?)\s*\(([^()]*)\)\s*$/.exec(t);
	const base = (m ? m[1] : t).replace(/\[\[([^\]|]*)(?:\|[^\]]*)?\]\]/g, "$1").trim();
	return { name: base, inside: m ? m[2] : undefined };
}

/** Ways a parent can be a parent, besides by birth. */
export const PARENT_KINDS = ["birth", "adoptive", "step", "foster", "guardian"] as const;

/** Ways two people can be partners. */
export const PARTNER_KINDS = ["spouse", "betrothed", "lover", "ex", "widowed", "concubine", "consort"] as const;

/** A label for a kind word, as shown: "step" → "Step-parent" (parents) or "Spouse". */
export function tieLabel(kind: string, role: "parent" | "partner"): string {
	const word = kind.replace(/-/g, " ");
	if (role === "parent") return kind === "birth" ? "Parent" : `${word.charAt(0).toUpperCase()}${word.slice(1)} ${kind === "guardian" ? "" : "parent"}`.trim();
	return word.charAt(0).toUpperCase() + word.slice(1);
}

/** The brackets for a tie, from what it says: kind, other words, dates, how it ended, custom text ("" when there is nothing to say). */
export function formatDetails(d: Partial<TieDetails>): string {
	const bits = [d.kind, ...(d.words ?? []), d.gender === "female" ? "f" : d.gender === "male" ? "m" : undefined, d.span, d.reason ? `ended: ${d.reason}` : undefined, d.label ? `"${d.label.replace(/"/g, "'")}"` : undefined].filter((x): x is string => !!x && !!x.trim());
	return bits.length ? ` (${bits.join(", ")})` : "";
}
