// Simplify a territory: fewer corners where they make little difference, while real detail (a jagged
// coast) stays. Corners shared with a neighbour go from both borders at once, so they stay shared.

import { simplifyOpen, simplifyRing } from "../render/fill";

type P2 = [number, number];

const keyOf = (p: P2) => `${Math.round(p[0] * 10)},${Math.round(p[1] * 10)}`;

/**
 * Small spikes and hooks taken off a border: a corner where the border turns sharply (under 75°) and comes back
 * within `maxLen` on both sides, a slip of the mouse or a snapped corner gone astray. A corner a neighbour shares
 * (within `tol`) stays, because then both borders were drawn that way. With `onBorder`, only a spike whose two base
 * corners lie on a shared border goes: a jagged coast keeps its detail. A shared corner goes too when the spike is
 * no longer than `sharedMax` on either side (a tiny hook both borders took on together); the neighbours must then
 * lose that corner as well (`at` lists it), so the border stays shared. Returns the ring and the corners taken off.
 */
export function dropSpikes(ring: P2[], others: P2[][], maxLen: number, tol: number, onBorder?: (p: P2) => boolean, sharedMax = 0): { ring: P2[]; dropped: number; at: P2[] } {
	const at: P2[] = [];
	const r = ring.map((p) => [p[0], p[1]] as P2);
	const shared = (b: P2) => others.some((o) => o.some((q) => Math.hypot(q[0] - b[0], q[1] - b[1]) <= tol));
	let dropped = 0;
	for (let changed = true; changed && r.length > 3; ) {
		changed = false;
		for (let i = 0; i < r.length && r.length > 3; i++) {
			const a = r[(i - 1 + r.length) % r.length];
			const b = r[i];
			const c = r[(i + 1) % r.length];
			const la = Math.hypot(a[0] - b[0], a[1] - b[1]);
			const lc = Math.hypot(c[0] - b[0], c[1] - b[1]);
			if (!la || !lc || Math.max(la, lc) > maxLen) continue;
			// The angle at the corner: under 75° is a point sticking out (or in).
			const cos = ((a[0] - b[0]) * (c[0] - b[0]) + (a[1] - b[1]) * (c[1] - b[1])) / (la * lc);
			if (cos <= 0.26 || (shared(b) && Math.max(la, lc) > sharedMax) || (onBorder && !(onBorder(a) && onBorder(c)))) continue;
			r.splice(i, 1);
			at.push(b);
			dropped++;
			changed = true;
			i = Math.max(-1, i - 2);
		}
	}
	return { ring: r, dropped, at };
}

export interface Simplified {
	ring: P2[];
	/** Each neighbour's new border, or null where it's unchanged. */
	others: (P2[] | null)[];
}

/**
 * Drops corners of `ring` that lie within `tol` of the line through the corners kept either side.
 * A corner is kept where the neighbours it's shared with change, or where a neighbour's border has
 * corners of its own between it and the next (so both sides would no longer match). With keepShared, every corner a
 * neighbour shares stays, so nothing but this border changes.
 */
export function simplifyShared(ring: P2[], others: P2[][], tol: number, keepShared = false): Simplified {
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
			if (keepShared || !mine.has(keyOf(o[(i + o.length - 1) % o.length])) || !mine.has(keyOf(o[(i + 1) % o.length]))) pinned.add(k);
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
