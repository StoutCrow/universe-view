export interface KindChoice {
	kind: string;
	/** Notes of this type that have it; 0 for a suggestion, -1 for one being typed. */
	count: number;
}

/**
 * The kinds to offer for a type: the vault's own first, most used first, then the world setting's
 * examples ("Battle, treaty, birth…") it hasn't used yet. One spelling per kind, lower case.
 */
export function kindChoices(used: (string | undefined)[], hint: string): KindChoice[] {
	const counts = new Map<string, number>();
	for (const k of used) {
		const kind = k?.trim().toLowerCase();
		if (kind) counts.set(kind, (counts.get(kind) ?? 0) + 1);
	}
	const own = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([kind, count]) => ({ kind, count }));
	const examples = hint.replace(/…/g, "").split(",").map((w) => w.trim().toLowerCase()).filter((w) => w && !counts.has(w));
	return [...own, ...examples.map((kind) => ({ kind, count: 0 }))];
}
