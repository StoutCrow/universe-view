// Simplify a territory: fewer corners where they make little difference, while real detail (a jagged
// coast) stays. Corners shared with a neighbour go from both borders at once, so they stay shared.

import { simplifyOpen, simplifyRing } from "../render/fill";

type P2 = [number, number];

const keyOf = (p: P2) => `${Math.round(p[0] * 10)},${Math.round(p[1] * 10)}`;

export interface Simplified {
	ring: P2[];
	/** Each neighbour's new border, or null where it's unchanged. */
	others: (P2[] | null)[];
}

/**
 * Drops corners of `ring` that lie within `tol` of the line through the corners kept either side.
 * A corner is kept where the neighbours it's shared with change, or where a neighbour's border has
 * corners of its own between it and the next (so both sides would no longer match).
 */
export function simplifyShared(ring: P2[], others: P2[][], tol: number): Simplified {
	const same: Simplified = { ring, others: others.map(() => null) };
	if (ring.length <= 4 || tol <= 0) return same;
	const mine = new Set(ring.map(keyOf));
	// Which neighbours share each of this border's corners, and whether each can go.
	const owners = new Map<string, number[]>();
	const pinned = new Set<string>();
	others.forEach((o, j) => {
		o.forEach((p, i) => {
			const k = keyOf(p);
			if (!mine.has(k)) return;
			owners.set(k, [...(owners.get(k) ?? []), j]);
			// The neighbour's corners either side must be shared too, or its border would part from ours.
			if (!mine.has(keyOf(o[(i + o.length - 1) % o.length])) || !mine.has(keyOf(o[(i + 1) % o.length]))) pinned.add(k);
		});
	});
	const sig = ring.map((p) => (owners.get(keyOf(p)) ?? []).join(","));
	const n = ring.length;
	const anchor = ring.map((p, i) => pinned.has(keyOf(p)) || (owners.get(keyOf(p))?.length ?? 0) > 1 || sig[i] !== sig[(i + n - 1) % n] || sig[i] !== sig[(i + 1) % n]);
	const removed = new Set<string>();
	if (!anchor.some(Boolean)) {
		// A border all of one kind (an island, say): simplify it whole.
		const kept = new Set(simplifyRing(ring, tol).map(keyOf));
		for (const p of ring) if (!kept.has(keyOf(p))) removed.add(keyOf(p));
	} else {
		const first = anchor.indexOf(true);
		for (let s = 0; s < n; ) {
			const a = (first + s) % n;
			let len = 1;
			while (!anchor[(a + len) % n]) len++;
			if (len > 1) {
				let run = Array.from({ length: len + 1 }, (_, t) => ring[(a + t) % n]);
				// Always worked from the lesser end, so a neighbour working the same stretch backwards agrees.
				if (keyOf(run[0]) > keyOf(run[len])) run = run.reverse();
				const kept = new Set(simplifyOpen(run, tol).map(keyOf));
				for (const p of run.slice(1, -1)) if (!kept.has(keyOf(p))) removed.add(keyOf(p));
			}
			s += len;
		}
	}
	if (!removed.size) return same;
	const drop = (r: P2[]) => r.filter((p) => !removed.has(keyOf(p)));
	const out = drop(ring);
	if (out.length < 3) return same;
	return {
		ring: out,
		others: others.map((o) => {
			const d = drop(o);
			return d.length === o.length ? null : d.length >= 3 ? d : o;
		}),
	};
}
