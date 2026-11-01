/**
 * Map tiers, strategy-game style: from afar each realm is one block of colour; as it grows on screen
 * (zooming in, or clicking it) it splits into its duchies, and those into their counties.
 */

export interface TierInput {
	/** Top titles. */
	roots: string[];
	children(key: string): string[];
	/** Whether a title, or anything under it, has land drawn on this map. */
	hasLand(key: string): boolean;
	/** How big a title's land is on screen (pixels across). */
	size(key: string): number;
	/** Titles kept whole whatever their size (hidden by the time slider, say); optional. */
	keepWhole?(key: string): boolean;
}

export interface Tiers {
	/** Titles shown as one block. */
	whole: Set<string>;
	/** Titles shown split into their vassals (their own border kept as an outline). */
	divided: Set<string>;
}

/** A title splits once it's `splitPx` across and has vassals with land of their own. */
export function visibleTiers(input: TierInput, splitPx: number): Tiers {
	const whole = new Set<string>();
	const divided = new Set<string>();
	const visit = (k: string, depth: number) => {
		if (depth > 20 || !input.hasLand(k)) return;
		const kids = input.children(k).filter((c) => input.hasLand(c));
		if (kids.length && input.size(k) > splitPx && !input.keepWhole?.(k)) {
			divided.add(k);
			for (const c of kids) visit(c, depth + 1);
		} else whole.add(k);
	};
	for (const r of input.roots) visit(r, 0);
	return { whole, divided };
}

/**
 * Which visible title an area belongs to now: the nearest whole title above it (or itself), so a
 * county shows as its realm until the realm is split. Undefined when every title above is split
 * (the area's own title is split too: only its outline shows).
 */
export function shownAs(chain: string[], tiers: Tiers): string | undefined {
	for (const k of chain) if (tiers.whole.has(k)) return k;
	return undefined;
}
