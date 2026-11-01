import { boxMeet, boxOf, gridIn, inRing, nearestOnRing, ringArea, selfCrossings, type Box, type P2 } from "./geometry";

/**
 * Checks a map's painted lands against each other: lands that overlap their neighbours, lands that
 * stick out of the land they're part of, gaps left between neighbours, lands their sub-lands only
 * partly cover, borders that cross themselves, and slivers too small to see. Pure: the map hands in
 * its areas, and gets back what's wrong and where to look.
 */

export interface BorderArea {
	key: string;
	name: string;
	/** Which of the land's areas on this map (its index there). */
	n: number;
	points: P2[];
	/** Its titles from the top down, ending with itself. */
	chain: string[];
	/** Geography (continents, forests) lies under realms and isn't checked against them. */
	region?: boolean;
}

export type BorderIssueKind = "overlap" | "outside" | "gap" | "crossed" | "sliver" | "partial";

export interface BorderIssue {
	kind: BorderIssueKind;
	/** The area at fault (key and index), and the other one involved, if any. */
	key: string;
	n: number;
	other?: { key: string; n: number };
	title: string;
	detail: string;
	/** Where to look. */
	at: P2;
	/** How much it matters, for sorting: bigger first. */
	weight: number;
	/** For gaps: how wide (map units). */
	width?: number;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

export function checkBorders(areas: BorderArea[], opts: { mapSize: number; isWater?: (p: P2) => boolean }): BorderIssue[] {
	const out: BorderIssue[] = [];
	const items = areas.filter((a) => a.points.length >= 3).map((a) => ({ ...a, box: boxOf(a.points), area: ringArea(a.points) }));
	const total = items.reduce((s, a) => s + a.area, 0) || 1;
	// A gap is a thin unpainted sliver left by drawing: rivers and straits between lands are wider and meant.
	// With the picture to look at (isWater), a wider strip is a gap too when it's dry land.
	const gapMax = Math.max(2, opts.mapSize * 0.0015);
	const reach = opts.isWater ? gapMax * 2 : gapMax;
	// Sub-lands drawn beside the land they're part of (rather than inside it) are its neighbours.
	const beside = new Set<string>();
	{
		const own = new Map<string, P2[][]>();
		for (const a of items) if (!a.region) own.set(a.key, [...(own.get(a.key) ?? []), a.points]);
		for (const a of items) {
			if (a.region) continue;
			const parentKey = [...a.chain].reverse().find((k) => k !== a.key && own.has(k));
			if (!parentKey) continue;
			const inside = gridIn(a.box, 16).pts.filter((p) => inRing(p, a.points));
			if (inside.length < 4) continue;
			const out = inside.filter((p) => !own.get(parentKey)!.some((r) => inRing(p, r))).length / inside.length;
			if (out >= 0.9) beside.add(`${a.key}|${parentKey}`).add(`${parentKey}|${a.key}`);
		}
	}
	const related = (a: BorderArea, b: BorderArea) => (a.key === b.key || a.chain.includes(b.key) || b.chain.includes(a.key)) && !beside.has(`${a.key}|${b.key}`);

	// Lands too short to be areas, or so small they vanish; and borders that cross themselves.
	for (const a of areas) {
		if (a.points.length < 3) out.push({ kind: "sliver", key: a.key, n: a.n, title: `${a.name}: an area with ${a.points.length} corner${a.points.length === 1 ? "" : "s"}`, detail: "Too few corners to be an area. Delete it, or reshape it.", at: a.points[0] ?? [0, 0], weight: 1 });
	}
	for (const a of items) {
		const crossings = selfCrossings(a.points);
		// A figure-of-eight's halves cancel out in its area: it's crossed, not small.
		if (!crossings.length && a.area < (opts.mapSize * opts.mapSize) / 40000) out.push({ kind: "sliver", key: a.key, n: a.n, title: `${a.name}: a sliver`, detail: "So small it can't be seen except zoomed right in. Usually left over from drawing.", at: a.points[0], weight: 1 });
		if (crossings.length) out.push({ kind: "crossed", key: a.key, n: a.n, title: `${a.name}: border crosses itself`, detail: `The border loops over itself ${crossings.length === 1 ? "once" : `${crossings.length} times`}, so part of it fills wrongly. Drag a corner back across.`, at: crossings[0], weight: 6 });
	}

	const realms = items.filter((a) => !a.region);
	for (let i = 0; i < realms.length; i++) {
		const a = realms[i];
		for (let j = i + 1; j < realms.length; j++) {
			const b = realms[j];
			if (related(a, b)) continue;
			const meet = boxMeet(a.box, b.box);
			// Overlap: count grid points inside both.
			if (meet) {
				const { pts, cell } = gridIn(meet, 28);
				const both = pts.filter((p) => inRing(p, a.points) && inRing(p, b.points));
				const shared = both.length * cell;
				const smaller = Math.min(a.area, b.area);
				if (shared > smaller * 0.02 && both.length >= 2) {
					const at = both[Math.floor(both.length / 2)];
					out.push({ kind: "overlap", key: a.area < b.area ? a.key : b.key, n: a.area < b.area ? a.n : b.n, other: a.area < b.area ? { key: b.key, n: b.n } : { key: a.key, n: a.n }, title: `${a.name} and ${b.name} overlap`, detail: `About ${pct(shared / smaller)} of ${a.area < b.area ? a.name : b.name} lies inside the other. Reshape one, or use shared corners so they meet on one line.`, at, weight: 5 + shared / total });
					continue;
				}
			}
			// Gap: neighbours whose borders run close without touching.
			const near = boxMeet(a.box, b.box, reach);
			if (!near) continue;
			const dists: number[] = [];
			const dryDists: number[] = [];
			let widest = 0;
			let at: P2 | undefined;
			const probe = (from: typeof a, to: typeof a) => {
				for (const p of from.points) {
					if (p[0] < near.x0 || p[0] > near.x1 || p[1] < near.y0 || p[1] > near.y1) continue;
					if (inRing(p, to.points)) continue;
					const { d, at: q } = nearestOnRing(p, to.points);
					if (d > 0.75 && d <= reach) {
						dists.push(d);
						// What lies halfway across: water is a river or strait, land of either (or of another land
						// between them) isn't a gap at all; only bare dry land is a gap left by drawing.
						const mid: P2 = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
						if (opts.isWater && !opts.isWater(mid) && !realms.some((c) => c.box.x0 <= mid[0] && c.box.x1 >= mid[0] && c.box.y0 <= mid[1] && c.box.y1 >= mid[1] && inRing(mid, c.points))) dryDists.push(d);
						if (d > widest) {
							widest = d;
							at = p;
						}
					}
				}
			};
			probe(a, b);
			probe(b, a);
			const close = dists.length;
			const median = dists.sort((x, y) => x - y)[Math.floor(dists.length / 2)] ?? 0;
			// Consistently narrow (a river keeps them all well apart), or, with the picture, mostly over dry land.
			// (Still a strip side by side: borders that merely meet at a corner and fan apart aren't a gap.)
			const dryMedian = dryDists.sort((x, y) => x - y)[Math.floor(dryDists.length / 2)] ?? Infinity;
			const isGap = median <= gapMax * 0.6 || (!!opts.isWater && dryDists.length >= 3 && dryMedian <= gapMax * 1.5);
			if (close >= 3 && at && isGap) out.push({ kind: "gap", key: a.key, n: a.n, other: { key: b.key, n: b.n }, title: `Gap between ${a.name} and ${b.name}`, detail: `Their borders run side by side without meeting (${close} corners, up to ${Math.round(widest)} px apart, over dry land). Close the gap to make them share one border.`, at, weight: 3, width: widest });
		}
	}

	// Sub-lands sticking out of the land they're part of; lands their sub-lands only partly fill.
	const byKey = new Map<string, typeof items>();
	for (const a of realms) byKey.set(a.key, [...(byKey.get(a.key) ?? []), a]);
	for (const a of realms) {
		// The nearest title above with land of its own here.
		const parentKey = [...a.chain].reverse().find((k) => k !== a.key && byKey.has(k));
		if (!parentKey) continue;
		const parent = byKey.get(parentKey)!;
		const { pts } = gridIn(a.box, 24);
		const inside = pts.filter((p) => inRing(p, a.points));
		if (inside.length < 4) continue;
		const outside = inside.filter((p) => !parent.some((q) => inRing(p, q.points)));
		const frac = outside.length / inside.length;
		// Partly across its liege's border is a slip; wholly beside it is land the liege holds besides
		// its own (a barony next to its county), which the map already shows in the liege's colour.
		if (frac > 0.04 && frac < 0.9) {
			const name = parent[0].name;
			out.push({ kind: "outside", key: a.key, n: a.n, other: { key: parentKey, n: parent[0].n }, title: `${a.name} sticks out of ${name}`, detail: `About ${pct(frac)} of it lies outside ${name}, the land it's part of. Reshape it, or ${name}.`, at: outside[Math.floor(outside.length / 2)], weight: 4 + frac });
		}
	}
	for (const [key, own] of byKey) {
		const subs = realms.filter((x) => x.key !== key && x.chain.includes(key));
		if (!subs.length) continue;
		const ownArea = own.reduce((s, x) => s + x.area, 0);
		const box: Box = own.map((x) => x.box).reduce((m, b) => ({ x0: Math.min(m.x0, b.x0), y0: Math.min(m.y0, b.y0), x1: Math.max(m.x1, b.x1), y1: Math.max(m.y1, b.y1) }));
		const { pts } = gridIn(box, 30);
		const inOwn = pts.filter((p) => own.some((x) => inRing(p, x.points)));
		if (inOwn.length < 6) continue;
		const bare = inOwn.filter((p) => !subs.some((s) => inRing(p, s.points)));
		const covered = 1 - bare.length / inOwn.length;
		if (covered < 0.9 && covered > 0.02 && ownArea > 0) {
			out.push({ kind: "partial", key, n: own[0].n, title: `${own[0].name}: lands within cover ${pct(covered)}`, detail: `${subs.length} land${subs.length === 1 ? "" : "s"} within it cover ${pct(covered)}; the rest shows as ${own[0].name} itself when zoomed in. Fine for land held directly; otherwise draw the missing lands.`, at: bare[Math.floor(bare.length / 2)], weight: 2 });
		}
	}
	return out.sort((x, y) => y.weight - x.weight);
}
