/** Distances, map scales, travel times and journey planning. No Obsidian or Leaflet here, so it's testable. */

export type XY = [number, number];

/** "about 6 hours", "1.5 days", "12 days", "about 3 weeks". */
export function days(n: number): string {
	if (n < 1 / 24) return "under an hour";
	if (n < 1) return `about ${Math.max(1, Math.round(n * 24))} hours`;
	if (n < 10) return `${Math.round(n * 2) / 2} day${n < 1.25 ? "" : "s"}`;
	if (n < 60) return `${Math.round(n)} days`;
	return `about ${Math.round(n / 7)} weeks`;
}

export const UNIT_KM: Record<string, number> = {
	km: 1, kms: 1, kilometer: 1, kilometers: 1, kilometre: 1, kilometres: 1, m: 0.001, meters: 0.001, metres: 0.001,
	mi: 1.609, mile: 1.609, miles: 1.609, league: 4.83, leagues: 4.83, ly: 9.46e12, au: 1.496e8,
};

/** Kilometres per day by way of travelling. */
export const SPEED_KM: Record<string, number> = { foot: 30, horse: 60, wagon: 35, caravan: 30, boat: 60, ship: 150, train: 600 };

/** Fastest ordinary way along each kind of route. */
export const ROUTE_SPEED: Record<string, number> = { road: 60, path: 45, trade: 60, river: 60, sea: 150, rail: 600, border: 30 };

/** A map note's `scale`: `2.5` (units per pixel, with `unit: km`) or `100 px = 5 km`. */
export function parseScale(raw: unknown, unitProp?: unknown): { perPx: number; unit: string } | undefined {
	const unit = String(unitProp ?? "units");
	if (typeof raw === "number" && raw > 0) return { perPx: raw, unit };
	if (typeof raw === "string") {
		const r = raw.match(/([\d.]+)\s*px\s*=\s*([\d.]+)\s*([^\d\s][\w ]*)?/i);
		if (r && +r[1] > 0) return { perPx: +r[2] / +r[1], unit: r[3]?.trim() || unit };
		const n = parseFloat(raw);
		if (n > 0) return { perPx: n, unit };
	}
	return undefined;
}

/** Kilometres in one of a map's units, when it's a real unit. */
export function kmPerUnit(unit: string): number | undefined {
	return UNIT_KM[unit.toLowerCase().replace(/\.$/, "")];
}

export function haversineKm(a: XY, b: XY): number {
	const R = 6371;
	const rad = Math.PI / 180;
	const dLat = (b[0] - a[0]) * rad;
	const dLng = (b[1] - a[1]) * rad;
	const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
	return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** How many times longer crossing each kind of terrain takes than open country. */
export const TERRAIN_SLOW: Record<string, number> = {
	mountains: 3, mountain: 3, peaks: 3, glacier: 4, ice: 3,
	hills: 1.4, highlands: 1.6, forest: 1.6, woods: 1.4, jungle: 2.5, swamp: 2.5, marsh: 2.2, bog: 2.5, wetlands: 2,
	desert: 1.8, dunes: 2, tundra: 1.6, badlands: 1.8, steppe: 1, plains: 1, grassland: 1, farmland: 1,
};

/** Point in polygon (even-odd). */
export function inside(p: XY, poly: XY[]): boolean {
	let c = false;
	for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
		const [xi, yi] = poly[i];
		const [xj, yj] = poly[j];
		if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
	}
	return c;
}

/** Average slow-down along a straight line, sampled at a few points, over terrain areas. */
export function terrainFactor(a: XY, b: XY, areas: { poly: XY[]; factor: number }[], samples = 8): number {
	if (!areas.length) return 1;
	let sum = 0;
	for (let i = 0; i < samples; i++) {
		const t = (i + 0.5) / samples;
		const p: XY = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
		let f = 1;
		for (const ar of areas) if (ar.factor > f && inside(p, ar.poly)) f = ar.factor;
		sum += f;
	}
	return sum / samples;
}

export interface RouteLine {
	points: XY[];
	kind: string;
	name?: string;
}

export interface Journey {
	/** Points to draw, start to end. */
	path: XY[];
	/** Days needed. */
	days: number;
	distance: number;
	/** Each stretch: along a route (with its kind and name) or cross-country on foot. */
	legs: { kind: string; name?: string; distance: number; days: number }[];
}

/**
 * The quickest way from `from` to `to`, following routes where that's faster than walking straight
 * there. `dist` measures in whatever units `speed` and `footSpeed` use (per day). Routes that pass
 * within `join` of each other connect; the start and end can walk up to `access` to reach a route.
 */
export function planJourney(
	routes: RouteLine[],
	from: XY,
	to: XY,
	opts: { dist: (a: XY, b: XY) => number; speed: (kind: string) => number; footSpeed: number; join: number; access: number; slow?: (a: XY, b: XY) => number },
): Journey {
	const nodes: XY[] = [from, to];
	const adj: { to: number; cost: number; kind: string; name?: string; d: number }[][] = [[], []];
	const add = (a: number, b: number, d: number, kind: string, name?: string) => {
		const speed = kind === "walk" ? opts.footSpeed : opts.speed(kind);
		// Cross-country stretches over mountains, forest or marsh take longer.
		const factor = kind === "walk" && opts.slow ? Math.max(1, opts.slow(nodes[a], nodes[b])) : 1;
		const cost = (d / Math.max(1e-9, speed)) * factor;
		adj[a].push({ to: b, cost, kind, name, d });
		adj[b].push({ to: a, cost, kind, name, d });
	};
	for (const r of routes) {
		let prev = -1;
		for (const p of r.points) {
			const i = nodes.push(p) - 1;
			adj.push([]);
			if (prev >= 0) add(prev, i, opts.dist(nodes[prev], p), r.kind, r.name);
			prev = i;
		}
	}
	// Walking links: start/end to nearby route points, and between routes that touch.
	for (let i = 2; i < nodes.length; i++) {
		for (const end of [0, 1]) {
			const d = opts.dist(nodes[end], nodes[i]);
			if (d <= opts.access) add(end, i, d, "walk");
		}
		for (let j = i + 1; j < nodes.length; j++) {
			const d = opts.dist(nodes[i], nodes[j]);
			if (d <= opts.join && !adj[i].some((e) => e.to === j)) add(i, j, d, "walk");
		}
	}
	add(0, 1, opts.dist(from, to), "walk");
	// Dijkstra (graphs here are small).
	const best = new Array(nodes.length).fill(Infinity);
	const prev = new Array<{ from: number; kind: string; name?: string; d: number; cost: number } | undefined>(nodes.length);
	const done = new Array(nodes.length).fill(false);
	best[0] = 0;
	for (;;) {
		let u = -1;
		for (let i = 0; i < nodes.length; i++) if (!done[i] && best[i] < Infinity && (u < 0 || best[i] < best[u])) u = i;
		if (u < 0 || u === 1) break;
		done[u] = true;
		for (const e of adj[u]) {
			if (best[u] + e.cost < best[e.to]) {
				best[e.to] = best[u] + e.cost;
				prev[e.to] = { from: u, kind: e.kind, name: e.name, d: e.d, cost: e.cost };
			}
		}
	}
	const path: XY[] = [];
	const legs: Journey["legs"] = [];
	for (let k = 1; ; ) {
		path.unshift(nodes[k]);
		const p = prev[k];
		if (!p) break;
		const kind = p.kind === "walk" ? "foot" : p.kind;
		const last = legs[0];
		if (last && last.kind === kind && last.name === p.name) {
			last.distance += p.d;
			last.days += p.cost;
		} else legs.unshift({ kind, name: p.name, distance: p.d, days: p.cost });
		k = p.from;
	}
	return { path, days: best[1], distance: legs.reduce((s, l) => s + l.distance, 0), legs };
}
