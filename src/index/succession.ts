/** Lines of succession from the family tree. No Obsidian here, so it's testable. */

export interface SuccessionGraph {
	children(key: string): string[];
	parents(key: string): string[];
	/** Universal days, when known. */
	born(key: string): number | undefined;
	died(key: string): number | undefined;
	gender(key: string): "m" | "f" | undefined;
}

/**
 * absolute: eldest child first, whatever their sex. male-preference: sons before daughters.
 * agnatic: only sons, and only through sons (Salic law).
 */
export type SuccessionRule = "absolute" | "male-preference" | "agnatic";

export const RULE_NAMES: Record<SuccessionRule, string> = {
	absolute: "Eldest child first",
	"male-preference": "Sons before daughters",
	agnatic: "Sons only, through sons",
};

export interface Heir {
	key: string;
	/** Generations below the holder's nearest shared ancestor (for indenting). */
	depth: number;
}

/**
 * Who inherits after `holder` on day `at`: the holder's descendants in order, then their siblings'
 * lines, then their parent's siblings' lines, and so on up. People who are dead at `at` are skipped
 * but their own heirs keep their place; people not yet born aren't heirs yet.
 */
export function lineOfSuccession(g: SuccessionGraph, holder: string, at: number, rule: SuccessionRule = "absolute", limit = 25, generationsUp = 6): Heir[] {
	const out: Heir[] = [];
	const seen = new Set<string>([holder]);
	const alive = (k: string) => {
		const b = g.born(k);
		const d = g.died(k);
		return (b === undefined || b <= at) && (d === undefined || d > at);
	};
	const born = (k: string) => g.born(k) !== undefined && g.born(k)! <= at;
	const ordered = (parent: string) => {
		let kids = g.children(parent).filter((k) => !seen.has(k) && (g.born(k) === undefined || born(k)));
		if (rule === "agnatic") kids = kids.filter((k) => g.gender(k) === "m");
		const by = (k: string) => g.born(k) ?? Number.MAX_SAFE_INTEGER;
		return kids.sort((a, b) => {
			if (rule === "male-preference") {
				const ma = g.gender(a) === "m" ? 0 : 1;
				const mb = g.gender(b) === "m" ? 0 : 1;
				if (ma !== mb) return ma - mb;
			}
			return by(a) - by(b);
		});
	};
	const visit = (p: string, depth: number) => {
		for (const c of ordered(p)) {
			if (out.length >= limit) return;
			seen.add(c);
			if (alive(c)) out.push({ key: c, depth });
			visit(c, depth + 1);
		}
	};
	visit(holder, 1);
	// Then up the tree: siblings' lines, then uncles' and aunts' lines…
	let cur = holder;
	for (let up = 1; up <= generationsUp && out.length < limit; up++) {
		const parents = g.parents(cur);
		// The line runs through the father when it must (agnatic) or when he's known.
		const parent = parents.find((p) => g.gender(p) === "m") ?? (rule === "agnatic" ? undefined : parents[0]);
		if (!parent) break;
		seen.add(parent);
		visit(parent, up);
		cur = parent;
	}
	return out.slice(0, limit);
}
