/**
 * "Everyone related": the whole family around one person, laid out by generation. Pure (no Obsidian),
 * so it's testable. Walks out from the person through parents and children, up to `steps` links away;
 * partners come along at no cost, and with `inLaws` their own families are followed too.
 */

export interface FamilyGraph {
	parents(key: string): string[];
	children(key: string): string[];
	partners(key: string): string[];
	/** Universal day of birth, to keep brothers and sisters in birth order. */
	born?(key: string): number | undefined;
}

export interface EveryoneOptions {
	/** How many parent or child links from the person (partners are free). */
	steps: number;
	/** Follow partners' own parents and children too. */
	inLaws: boolean;
	/** Stop after this many people, so a huge dynasty stays drawable. */
	max?: number;
}

export interface LayoutSizes {
	/** A card's width. */
	w: number;
	/** Between partners. */
	partnerGap: number;
	/** Between families on a row. */
	gap: number;
}

export interface LaidPerson {
	key: string;
	/** Generations from the person (parents −1, children +1). */
	gen: number;
	/** The card's left edge. */
	x: number;
}

export interface FamilyLayout {
	people: LaidPerson[];
	/** Parents (one or two, side by side) and their children, as drawn. */
	families: { parents: string[]; children: string[] }[];
	/** Partners with no children shown, joined by a line. */
	couples: [string, string][];
	/** True when `max` cut the family short. */
	truncated: boolean;
}

/**
 * Who's in, and on which generation. Blood relatives are found by going up to ancestors and then down
 * to their descendants, never down and then up again (a grandchild's other grandparents are someone
 * else's family). Partners stand beside their person; with `inLaws` their own families are walked too.
 */
function gather(g: FamilyGraph, root: string, o: EveryoneOptions): { gen: Map<string, number>; order: string[]; truncated: boolean } {
	const max = o.max ?? 400;
	const gen = new Map<string, number>();
	const dist = new Map<string, number>();
	const order: string[] = [];
	// How far each person's family is walked: "up" (ancestors and descendants) or "down" (descendants only).
	const walked = new Map<string, "up" | "down">();
	const queue: { k: string; mode: "up" | "down" }[] = [];
	let truncated = false;
	const visit = (k: string, gn: number, d: number, mode: "up" | "down" | null) => {
		if (!gen.has(k)) {
			if (order.length >= max) {
				truncated = true;
				return;
			}
			gen.set(k, gn);
			dist.set(k, d);
			order.push(k);
		} else if (d < (dist.get(k) ?? Infinity)) dist.set(k, d);
		const before = walked.get(k);
		if (mode && before !== "up" && before !== mode) {
			walked.set(k, mode);
			queue.push({ k, mode });
		}
	};
	visit(root, 0, 0, "up");
	for (let i = 0; i < queue.length; i++) {
		const { k, mode } = queue[i];
		const gk = gen.get(k)!;
		const d = dist.get(k)!;
		for (const p of g.partners(k)) visit(p, gk, d, o.inLaws ? "up" : null);
		if (d >= o.steps) continue;
		if (mode === "up") for (const p of g.parents(k)) visit(p, gk - 1, d + 1, "up");
		const kids = [...g.children(k)].sort((a, b) => (g.born?.(a) ?? Infinity) - (g.born?.(b) ?? Infinity));
		for (const c of kids) {
			visit(c, gk + 1, d + 1, "down");
			// The child's other parent stands beside this one even at the edge of the family.
			for (const q of g.parents(c)) if (q !== k) visit(q, gk, d, o.inLaws ? "up" : null);
		}
	}
	return { gen, order, truncated };
}

/**
 * People joined by partnership, in a row: the one with most partners in the middle; a partner who also
 * had someone else (a widow who remarried) right beside them with that other partner beyond, so every
 * pair that can be is side by side; the remaining partners fill the other side.
 */
function arrange(comp: string[], partnersIn: (k: string) => string[]): string[] {
	if (comp.length < 3) return comp;
	const hub = [...comp].sort((a, b) => partnersIn(b).length - partnersIn(a).length)[0];
	const left: string[] = [];
	const right: string[] = [];
	const placed = new Set([hub]);
	const direct = partnersIn(hub);
	const linked = direct.filter((p) => partnersIn(p).some((q) => q !== hub));
	linked.forEach((p, i) => {
		const side = i % 2 === 0 ? left : right;
		side.push(p);
		placed.add(p);
		for (const q of partnersIn(p))
			if (!placed.has(q)) {
				side.push(q);
				placed.add(q);
			}
	});
	for (const p of direct) {
		if (placed.has(p)) continue;
		(right.length <= left.length ? right : left).push(p);
		placed.add(p);
	}
	const rest = comp.filter((k) => !placed.has(k));
	return [...left.reverse(), hub, ...right, ...rest];
}

/** Lays out everyone related to `root`. */
export function everyoneLayout(g: FamilyGraph, root: string, o: EveryoneOptions, s: LayoutSizes): FamilyLayout {
	const { gen, order, truncated } = gather(g, root, o);
	const rank = new Map(order.map((k, i) => [k, i]));
	const inc = (k: string) => gen.has(k);

	// Units: people joined by partnership on the same row, side by side (someone with two partners between them).
	const unitOf = new Map<string, number>();
	const units: { members: string[]; gen: number }[] = [];
	for (const k of order) {
		if (unitOf.has(k)) continue;
		const gn = gen.get(k)!;
		const comp: string[] = [];
		const stack = [k];
		while (stack.length) {
			const x = stack.pop()!;
			if (unitOf.has(x) || comp.includes(x)) continue;
			comp.push(x);
			for (const p of g.partners(x)) if (inc(p) && gen.get(p) === gn && !comp.includes(p)) stack.push(p);
		}
		comp.sort((a, b) => rank.get(a)! - rank.get(b)!);
		const members = arrange(comp, (x) => g.partners(x).filter((p) => comp.includes(p)));
		for (const m of members) unitOf.set(m, units.length);
		units.push({ members, gen: gn });
	}
	const width = (u: number) => units[u].members.length * s.w + (units[u].members.length - 1) * s.partnerGap;
	const offset = (k: string) => {
		const u = units[unitOf.get(k)!];
		return u.members.indexOf(k) * (s.w + s.partnerGap) + s.w / 2 - width(unitOf.get(k)!) / 2;
	};

	const gens = [...new Set(units.map((u) => u.gen))].sort((a, b) => a - b);
	const rows = new Map(gens.map((gn) => [gn, units.map((_, i) => i).filter((i) => units[i].gen === gn).sort((a, b) => rank.get(units[a].members[0])! - rank.get(units[b].members[0])!)]));
	const pos = new Array<number>(units.length).fill(0);
	const pack = (row: number[]) => {
		let x = 0;
		for (const u of row) {
			pos[u] = x + width(u) / 2;
			x += width(u) + s.gap;
		}
		const shift = x / 2;
		for (const u of row) pos[u] -= shift;
	};
	for (const row of rows.values()) pack(row);
	const centre = (k: string) => pos[unitOf.get(k)!] + offset(k);
	const up = (u: number) => units[u].members.flatMap((m) => g.parents(m).filter(inc).map((p) => [m, p] as const));
	const down = (u: number) => units[u].members.flatMap((m) => g.children(m).filter(inc).map((c) => [m, c] as const));
	const pull = (u: number, links: (readonly [string, string])[]) => (links.length ? links.reduce((sum, [m, o2]) => sum + centre(o2) - offset(m), 0) / links.length : pos[u]);

	// Order each row by where its parents (then its children) are, a few times over.
	for (let pass = 0; pass < 6; pass++) {
		const seq = pass % 2 === 0 ? gens : [...gens].reverse();
		for (const gn of seq) {
			const row = rows.get(gn)!;
			const key = new Map(row.map((u) => [u, pull(u, pass % 2 === 0 ? up(u) : down(u))]));
			row.sort((a, b) => key.get(a)! - key.get(b)!);
			pack(row);
		}
	}
	// Then ease each family toward its parents and children, keeping the order and the gaps.
	const settle = (row: number[]) => {
		const want = row.map((u) => pos[u]);
		const left = [...want];
		for (let i = 1; i < row.length; i++) left[i] = Math.max(left[i], left[i - 1] + (width(row[i - 1]) + width(row[i])) / 2 + s.gap);
		const right = [...want];
		for (let i = row.length - 2; i >= 0; i--) right[i] = Math.min(right[i], right[i + 1] - (width(row[i]) + width(row[i + 1])) / 2 - s.gap);
		row.forEach((u, i) => (pos[u] = (left[i] + right[i]) / 2));
	};
	for (let it = 0; it < 40; it++) {
		for (const gn of it % 2 ? [...gens].reverse() : gens) {
			const row = rows.get(gn)!;
			for (const u of row) {
				const links = [...up(u), ...down(u)];
				if (links.length) pos[u] = pos[u] * 0.4 + pull(u, links) * 0.6;
			}
			settle(row);
		}
	}

	const people: LaidPerson[] = order.map((k) => ({ key: k, gen: gen.get(k)!, x: centre(k) - s.w / 2 }));
	// Families: each child with the parents shown, grouped by those parents.
	const fam = new Map<string, { parents: string[]; children: string[] }>();
	for (const k of order) {
		const ps = g.parents(k).filter(inc).slice(0, 2).sort((a, b) => centre(a) - centre(b));
		if (!ps.length) continue;
		const id = ps.join("|");
		if (!fam.has(id)) fam.set(id, { parents: ps, children: [] });
		fam.get(id)!.children.push(k);
	}
	const families = [...fam.values()];
	for (const f of families) f.children.sort((a, b) => centre(a) - centre(b));
	const joined = new Set(families.filter((f) => f.parents.length === 2).map((f) => f.parents.join("|")));
	const couples: [string, string][] = [];
	for (const u of units)
		for (let i = 0; i + 1 < u.members.length; i++) {
			const pair = [u.members[i], u.members[i + 1]].sort((a, b) => centre(a) - centre(b)) as [string, string];
			if (g.partners(pair[0]).includes(pair[1]) && !joined.has(pair.join("|"))) couples.push(pair);
		}
	return { people, families, couples, truncated };
}

/** "Grandparents", "Children", "3× great-grandchildren": a generation, seen from the person at its centre. */
export function generationName(gen: number, rootName: string): string {
	if (gen === 0) return `${rootName}'s generation`;
	const base = gen < 0 ? "parents" : "children";
	const n = Math.abs(gen);
	if (n === 1) return base.charAt(0).toUpperCase() + base.slice(1);
	if (n === 2) return `Grand${base}`;
	if (n === 3) return `Great-grand${base}`;
	return `${n - 2}× great-grand${base}`;
}
