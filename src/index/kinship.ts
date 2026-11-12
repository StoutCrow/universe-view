/** How two people are related, worked out from parent and partner links. No Obsidian here, so it's testable. */

export interface KinGraph {
	parents(key: string): string[];
	partners(key: string): string[];
	gender(key: string): "m" | "f" | undefined;
	/** The kind of tie between two partners ("lover", "spouse"…), as written on either side. */
	partnerKind?(a: string, b: string): string | undefined;
}

export interface Kinship {
	/** "grandfather", "second cousin once removed", "sister-in-law"… (what B is to A). */
	label: string;
	/** People from A to B through the closest common ancestor (or the marriage that links them). */
	path: string[];
	blood: boolean;
}

type G = "m" | "f" | undefined;
const pick = (g: G, m: string, f: string, n: string) => (g === "m" ? m : g === "f" ? f : n);
const ORD = ["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"];
const TIMES = ["", "once", "twice", "three times", "four times", "five times", "six times"];

/** Every ancestor with its distance in generations and the child it was reached from. */
function ancestors(g: KinGraph, start: string): Map<string, { gen: number; via?: string }> {
	const out = new Map<string, { gen: number; via?: string }>([[start, { gen: 0 }]]);
	let frontier = [start];
	for (let gen = 1; frontier.length && gen < 40; gen++) {
		const next: string[] = [];
		for (const k of frontier) {
			for (const p of g.parents(k)) {
				if (out.has(p)) continue;
				out.set(p, { gen, via: k });
				next.push(p);
			}
		}
		frontier = next;
	}
	return out;
}

function chain(map: Map<string, { gen: number; via?: string }>, from: string): string[] {
	const out = [from];
	for (let k = map.get(from)?.via; k; k = map.get(k)?.via) out.push(k);
	return out;
}

function greats(n: number): string {
	return n <= 0 ? "" : n === 1 ? "great-" : `${n}× great-`;
}

/** The word for B seen from A, `up` generations from A to the common ancestor and `down` from there to B. */
export function kinTerm(up: number, down: number, g: G, half = false): string {
	if (up === 0 && down === 0) return "the same person";
	if (down === 0) {
		// B is A's ancestor.
		const base = pick(g, "father", "mother", "parent");
		return up === 1 ? base : up === 2 ? `grand${base}` : `${greats(up - 2)}grand${base}`;
	}
	if (up === 0) {
		const base = pick(g, "son", "daughter", "child");
		return down === 1 ? base : down === 2 ? `grand${base}` : `${greats(down - 2)}grand${base}`;
	}
	if (up === 1 && down === 1) return (half ? "half-" : "") + pick(g, "brother", "sister", "sibling");
	if (up === 1) {
		const base = pick(g, "nephew", "niece", "nephew or niece");
		return down === 2 ? base : down === 3 ? `grand-${base}` : `${greats(down - 3)}grand-${base}`;
	}
	if (down === 1) {
		const base = pick(g, "uncle", "aunt", "uncle or aunt");
		return up === 2 ? base : up === 3 ? `great-${base}` : `${greats(up - 2)}${base}`;
	}
	const degree = Math.min(up, down) - 1;
	const removed = Math.abs(up - down);
	const nth = ORD[degree] ?? `${degree}th`;
	return `${nth} cousin${removed ? ` ${TIMES[removed] ?? `${removed} times`} removed` : ""}`;
}

/** Closest blood relationship of B to A, or null. */
function blood(g: KinGraph, a: string, b: string): Kinship | null {
	if (a === b) return { label: "the same person", path: [a], blood: true };
	const up = ancestors(g, a);
	const down = ancestors(g, b);
	let best: { k: string; ga: number; gb: number } | undefined;
	for (const [k, x] of up) {
		const y = down.get(k);
		if (!y) continue;
		if (!best || x.gen + y.gen < best.ga + best.gb || (x.gen + y.gen === best.ga + best.gb && x.gen < best.ga)) best = { k, ga: x.gen, gb: y.gen };
	}
	if (!best) return null;
	// Siblings sharing one parent only are half-siblings.
	let half = false;
	if (best.ga === 1 && best.gb === 1) {
		const pa = new Set(g.parents(a));
		half = g.parents(b).filter((p) => pa.has(p)).length < Math.min(2, pa.size, g.parents(b).length);
	}
	// chain() walks from the common ancestor back down: [common … a] and [common … b].
	const path = [...chain(up, best.k).reverse(), ...chain(down, best.k).slice(1)];
	return { label: kinTerm(best.ga, best.gb, g.gender(b), half), path, blood: true };
}

const IN_LAW: Record<string, [string, string, string]> = {
	parent: ["father-in-law", "mother-in-law", "parent-in-law"],
	child: ["son-in-law", "daughter-in-law", "child-in-law"],
	sibling: ["brother-in-law", "sister-in-law", "sibling-in-law"],
};

function kindOf(label: string): "parent" | "child" | "sibling" | undefined {
	if (/^(father|mother|parent)$/.test(label)) return "parent";
	if (/^(son|daughter|child)$/.test(label)) return "child";
	if (/^(half-)?(brother|sister|sibling)$/.test(label)) return "sibling";
	return undefined;
}

const norm = (k: string | undefined) => (k ?? "").trim().toLowerCase().replace(/[\s_]+/g, "-");
/** Kinds of partner tie that are a marriage (no kind written counts as one). */
const MARRIED = new Set(["", "spouse", "married", "marriage", "wed", "wedded", "widowed", "husband", "wife", "wives"]);
const isMarriage = (kind: string | undefined) => MARRIED.has(norm(kind));
const article = (w: string) => (/^[aeiou]/i.test(w) ? "an" : "a");

/** What B is to A as a partner, from the tie's kind: "wife", "former husband", "fiancée", "lover". */
export function partnerWord(kind: string | undefined, g: G): string {
	const k = norm(kind);
	if (MARRIED.has(k)) return pick(g, "husband", "wife", "spouse");
	if (/^(ex|former(-spouse)?|divorced?|annulled|separated)$/.test(k)) return `former ${pick(g, "husband", "wife", "spouse")}`;
	if (k === "betrothed" || k === "engaged") return pick(g, "fiancé", "fiancée", "betrothed");
	return k.replace(/-/g, " ");
}

/**
 * What B is to A: a blood relationship ("second cousin once removed"), a partner as their tie says ("wife",
 * "lover"), or a relationship through a partner ("sister-in-law", "stepfather", "wife of an uncle", "lover's father").
 * In-law and step words are only for marriages; any other tie says what it is.
 */
export function relationship(g: KinGraph, a: string, b: string): Kinship | null {
	const direct = blood(g, a, b);
	if (direct) return direct;
	const gb = g.gender(b);
	const kindOfTie = (x: string, y: string) => g.partnerKind?.(x, y) ?? g.partnerKind?.(y, x);
	const slot = gb === "m" ? 0 : gb === "f" ? 1 : 2;
	if (g.partners(a).includes(b)) return { label: partnerWord(kindOfTie(a, b), gb), path: [a, b], blood: false };
	// B is the partner of one of A's relatives.
	for (const p of g.partners(b)) {
		const r = blood(g, a, p);
		if (!r) continue;
		const path = [...r.path, b];
		const tie = kindOfTie(b, p);
		if (isMarriage(tie)) {
			const kind = kindOf(r.label);
			if (kind === "child") return { label: IN_LAW.child[slot], path, blood: false };
			if (kind === "sibling") return { label: IN_LAW.sibling[slot], path, blood: false };
			if (kind === "parent") return { label: pick(gb, "stepfather", "stepmother", "step-parent"), path, blood: false };
		}
		return { label: `${partnerWord(tie, gb)} of ${article(r.label)} ${r.label}`, path, blood: false };
	}
	// B is a relative of A's partner.
	for (const q of g.partners(a)) {
		const r = blood(g, q, b);
		if (!r) continue;
		const path = [a, ...r.path];
		const tie = kindOfTie(a, q);
		if (isMarriage(tie)) {
			const kind = kindOf(r.label);
			if (kind === "parent") return { label: IN_LAW.parent[slot], path, blood: false };
			if (kind === "sibling") return { label: IN_LAW.sibling[slot], path, blood: false };
			if (kind === "child") return { label: pick(gb, "stepson", "stepdaughter", "stepchild"), path, blood: false };
			return { label: `spouse's ${r.label}`, path, blood: false };
		}
		return { label: `${partnerWord(tie, g.gender(q))}'s ${r.label}`, path, blood: false };
	}
	return null;
}

/** How relationships are named on family tree cards: as worked out, or short. */
export type KinNames = "exact" | "short";

/**
 * A short name for a long relationship: "husband of a great-uncle" → "distant in-law", "second cousin once removed"
 * → "distant cousin", "3× great-grandfather" → "ancestor". Close relationships stay as they are.
 */
export function shortKin(label: string): string {
	const l = label.toLowerCase();
	// The partner of a relative ("wife of an uncle"): an uncle's wife is an aunt; anyone further is a distant in-law.
	const of = /^(husband|wife|spouse) of an? (uncle|aunt|uncle or aunt)$/.exec(l);
	if (of) return of[1] === "husband" ? "uncle" : of[1] === "wife" ? "aunt" : "uncle or aunt";
	if (/ of an? /.test(l)) return "distant in-law";
	// A relative of a partner ("spouse's grandfather"): one word gets "-in-law", more is distant.
	const owner = /^spouse's (\S+)$/.exec(l);
	if (owner && !/great|cousin|×/.test(owner[1])) return `${owner[1]}-in-law`;
	if (/^spouse's /.test(l)) return "distant in-law";
	if (/'s /.test(l)) return l.length > 16 ? "distant in-law" : label;
	if (/^first cousin/.test(l)) return "cousin";
	if (/cousin/.test(l)) return "distant cousin";
	if (/×.*grand(father|mother|parent)$/.test(l)) return "ancestor";
	if (/×.*grand(son|daughter|child)$/.test(l)) return "descendant";
	const far = /×\s*great-(?:grand-)?(uncle|aunt|uncle or aunt|nephew|niece|nephew or niece)$/.exec(l);
	if (far) return `distant ${far[1]}`;
	return label;
}
