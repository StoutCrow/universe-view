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

/** What sort of tie: to a parent, to a partner, or any other relationship (allies, a house…). */
export type TieRole = "parent" | "partner" | "relation";

/** One kind of tie and the details that make sense for it: a birth parent has no dates, a step-parent does. */
export interface TieKindInfo {
	/** As written in brackets; "" when the kind is not said. */
	kind: string;
	label: string;
	/** The dates field's label, when this kind has dates. */
	when?: string;
	/** Whether it can end (divorce, death…), so "How it ended" is asked. */
	ends?: boolean;
}

/** A first choice (Parent, Married…) and the kinds under it, chosen second. */
export interface TieGroup {
	label: string;
	kinds: TieKindInfo[];
}

const dated = (kind: string, label: string, when = "When"): TieKindInfo => ({ kind, label, when, ends: true });

/** The kinds of parent and partner, grouped; the first kind of a group is the one chosen with it. */
export const TIE_GROUPS: Record<"parent" | "partner", TieGroup[]> = {
	parent: [
		{ label: "Not said", kinds: [{ kind: "", label: "Not said" }] },
		{
			label: "Parent",
			kinds: [{ kind: "birth", label: "Birth" }, { kind: "adoptive", label: "Adoptive", when: "Adopted" }, dated("step", "Step"), dated("foster", "Foster"), dated("guardian", "Guardian")],
		},
	],
	partner: [
		{ label: "Not said", kinds: [dated("", "Not said")] },
		{ label: "Married", kinds: [dated("spouse", "Spouse", "Married"), dated("consort", "Consort", "Married"), { kind: "widowed", label: "Widowed", when: "Married" }, dated("ex", "Former spouse", "Married")] },
		{ label: "Not married", kinds: [dated("betrothed", "Betrothed"), dated("lover", "Lover"), dated("concubine", "Concubine")] },
	],
};

const kindLabel = (k: string) => k.charAt(0).toUpperCase() + k.slice(1).replace(/-/g, " ");

/**
 * Where a kind sits among the choices, and what it asks. A kind of the note's own ("annulled") is kept: it goes in the
 * group it most likely belongs to, with dates and an ending. Other relationships (allies, a house) have no kinds here.
 */
export function tieKindInfo(role: TieRole, kind: string | undefined): { group: number; info: TieKindInfo; own: boolean } {
	const k = norm(kind ?? "");
	if (role === "relation") return { group: -1, info: dated(k, kindLabel(k)), own: false };
	const groups = TIE_GROUPS[role];
	for (let g = 0; g < groups.length; g++) {
		const info = groups[g].kinds.find((x) => x.kind === k);
		if (info) return { group: g, info, own: false };
	}
	const group = role === "parent" ? 1 : /annul|divorc|separat|widow|marri|wed|former|husband|wife/.test(k) ? 1 : 2;
	return { group, info: dated(k, kindLabel(k)), own: true };
}

/** A tie with only the details its kind has: switching a step-parent to a birth parent drops the dates. */
export function fitTie<T extends Partial<TieDetails>>(role: TieRole, tie: T): T {
	const { info } = tieKindInfo(role, tie.kind);
	return { ...tie, span: info.when ? tie.span : undefined, reason: info.ends ? tie.reason : undefined };
}

/** The brackets for a tie, from what it says: kind, other words, dates, how it ended, custom text ("" when there is nothing to say). */
export function formatDetails(d: Partial<TieDetails>): string {
	const bits = [d.kind, ...(d.words ?? []), d.gender === "female" ? "f" : d.gender === "male" ? "m" : undefined, d.span, d.reason ? `ended: ${d.reason}` : undefined, d.label ? `"${d.label.replace(/"/g, "'")}"` : undefined].filter((x): x is string => !!x && !!x.trim());
	return bits.length ? ` (${bits.join(", ")})` : "";
}
