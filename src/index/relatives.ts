/** Adding relatives by name: pure helpers, so they're testable. No notes are made; names become links. */

/** Names from typed text: one per line (or split by ";"), links unwrapped, blanks and repeats dropped. */
export function parseNames(text: string): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const raw of text.split(/[\n;]+/)) {
		const name = raw.replace(/^\s*[-*]\s+/, "").replace(/^\[\[|\]\]$/g, "").split("|")[0].trim();
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		out.push(name);
	}
	return out;
}

/**
 * Puts `links` (like "[[Anna]]") into a list property of `front`: the first spelling in `aliases` the note
 * already uses, else `fallback`. Links already there aren't added twice. Returns how many were added.
 */
export function addLinks(front: Record<string, unknown>, aliases: string[], fallback: string, links: string[]): number {
	const key = aliases.find((a) => a in front && front[a] !== null && front[a] !== undefined && front[a] !== "") ?? fallback;
	const current = front[key];
	const list: unknown[] = Array.isArray(current) ? [...(current as unknown[])] : current ? [current] : [];
	const has = (link: string) => list.some((x) => (typeof x === "string" ? x : JSON.stringify(x)).toLowerCase().includes(link.toLowerCase()));
	let added = 0;
	for (const link of links) {
		if (has(link)) continue;
		list.push(link);
		added++;
	}
	if (added) front[key] = list;
	return added;
}
