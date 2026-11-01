/** How two people are related, worked out from parent and partner links. No Obsidian here, so it's testable. */

export interface KinGraph {
	parents(key: string): string[];
	partners(key: string): string[];
	gender(key: string): "m" | "f" | undefined;
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

/**
 * What B is to A: a blood relationship ("second cousin once removed"), a spouse, or a relationship
 * by marriage ("sister-in-law", "stepfather", "wife of A's brother").
 */
export function relationship(g: KinGraph, a: string, b: string): Kinship | null {
	const direct = blood(g, a, b);
	if (direct) return direct;
	const gb = g.gender(b);
	if (g.partners(a).includes(b)) return { label: pick(gb, "husband", "wife", "spouse"), path: [a, b], blood: false };
	// B married to one of A's relatives.
	for (const p of g.partners(b)) {
		const r = blood(g, a, p);
		if (!r) continue;
		const kind = kindOf(r.label);
		if (kind === "child") return { label: IN_LAW.child[gb === "m" ? 0 : gb === "f" ? 1 : 2], path: [...r.path, b], blood: false };
		if (kind === "sibling") return { label: IN_LAW.sibling[gb === "m" ? 0 : gb === "f" ? 1 : 2], path: [...r.path, b], blood: false };
		if (kind === "parent") return { label: pick(gb, "stepfather", "stepmother", "step-parent"), path: [...r.path, b], blood: false };
		return { label: `${pick(gb, "husband", "wife", "spouse")} of a ${r.label}`, path: [...r.path, b], blood: false };
	}
	// B is a relative of A's spouse.
	for (const q of g.partners(a)) {
		const r = blood(g, q, b);
		if (!r) continue;
		const kind = kindOf(r.label);
		if (kind === "parent") return { label: IN_LAW.parent[gb === "m" ? 0 : gb === "f" ? 1 : 2], path: [a, ...r.path], blood: false };
		if (kind === "sibling") return { label: IN_LAW.sibling[gb === "m" ? 0 : gb === "f" ? 1 : 2], path: [a, ...r.path], blood: false };
		if (kind === "child") return { label: pick(gb, "stepson", "stepdaughter", "stepchild"), path: [a, ...r.path], blood: false };
		return { label: `spouse's ${r.label}`, path: [a, ...r.path], blood: false };
	}
	return null;
}
