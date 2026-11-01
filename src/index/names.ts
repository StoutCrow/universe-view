/**
 * Names in the style of a world: a small Markov model learned from the names already there, which
 * makes new ones that sound alike without copying any (near copies are turned down).
 */

const START = "^";
const END = "$";

export interface NameModel {
	order: number;
	/** For each run of `order` letters, the letters that follow it and how often. */
	next: Map<string, Map<string, number>>;
	/** The names it learned from, to avoid handing one back. */
	known: Set<string>;
	minLen: number;
	maxLen: number;
}

/** First names only: titles dropped ("King James II Whitmore" → "James"). */
export function givenNames(full: string[]): string[] {
	return full.map((n) => n.replace(/^(king|queen|lord|lady|prince|princess|duke|duchess|sir|dame|saint|st\.?|the)\s+/i, "").split(/[\s,]+/)[0]).filter((n) => /^[\p{L}'’-]{2,}$/u.test(n));
}

export function trainNames(names: string[], order = 2): NameModel {
	const next = new Map<string, Map<string, number>>();
	const clean = names.map((n) => n.trim().toLowerCase()).filter((n) => n.length >= 2);
	for (const n of clean) {
		const s = START.repeat(order) + n + END;
		for (let i = order; i < s.length; i++) {
			const ctx = s.slice(i - order, i);
			const m = next.get(ctx) ?? new Map<string, number>();
			m.set(s[i], (m.get(s[i]) ?? 0) + 1);
			next.set(ctx, m);
		}
	}
	const lens = clean.map((n) => n.length);
	return {
		order,
		next,
		known: new Set(clean),
		minLen: Math.max(3, Math.min(...lens, 4)),
		maxLen: Math.min(14, Math.max(...lens, 6) + 2),
	};
}

/** A repeatable random source (for tests and stable suggestions). */
export function seeded(seed: number): () => number {
	let s = seed >>> 0 || 1;
	return () => {
		s ^= s << 13;
		s ^= s >>> 17;
		s ^= s << 5;
		return ((s >>> 0) % 1e6) / 1e6;
	};
}

function editDistance(a: string, b: string): number {
	const row = Array.from({ length: b.length + 1 }, (_, j) => j);
	for (let i = 1; i <= a.length; i++) {
		let prev = row[0];
		row[0] = i;
		for (let j = 1; j <= b.length; j++) {
			const cur = row[j];
			row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
			prev = cur;
		}
	}
	return row[b.length];
}

/** Whether a made-up name is too close to one that exists (a copy, a clipped copy, one letter off). */
export function tooClose(name: string, known: Iterable<string>): boolean {
	const n = name.toLowerCase();
	for (const k of known) {
		if (n === k) return true;
		const short = Math.min(n.length, k.length);
		if (short >= 5 && short / Math.max(n.length, k.length) >= 0.7 && (k.startsWith(n) || k.endsWith(n) || n.startsWith(k) || n.endsWith(k))) return true;
		if (short >= 6 && Math.abs(n.length - k.length) <= 2 && editDistance(n, k) <= (short >= 8 ? 2 : 1)) return true;
	}
	return false;
}

export function generateNames(model: NameModel, count: number, rand: () => number = Math.random): string[] {
	const out = new Set<string>();
	if (!model.next.size) return [];
	for (let tries = 0; out.size < count && tries < count * 400; tries++) {
		let ctx = START.repeat(model.order);
		let name = "";
		for (let i = 0; i < model.maxLen + 1; i++) {
			const options = model.next.get(ctx);
			if (!options) break;
			const total = [...options.values()].reduce((a, b) => a + b, 0);
			let r = rand() * total;
			let pick = END;
			for (const [ch, n] of options) {
				r -= n;
				if (r <= 0) {
					pick = ch;
					break;
				}
			}
			if (pick === END) break;
			name += pick;
			ctx = (ctx + pick).slice(-model.order);
		}
		if (name.length < model.minLen || name.length > model.maxLen || tooClose(name, model.known)) continue;
		out.add(name.charAt(0).toUpperCase() + name.slice(1));
	}
	return [...out];
}
