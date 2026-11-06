import type { Entity } from "../types";

/** Takes off links worked out from other notes, so an update can't keep one its source has dropped. */
export function clearInferred(e: Entity) {
	e.parents = e.parents.filter((p) => !p.inferred);
	e.parentCultures = e.parentCultures.filter((p) => !p.inferred);
	if (e.map?.inferred) e.map = undefined;
}

interface CacheParts {
	frontmatter?: unknown;
	tags?: { tag: string }[];
	links?: { link: string }[];
	embeds?: { link: string }[];
	frontmatterLinks?: { link: string }[];
}

/** What the index reads from a note. Body text isn't in it, so typing changes nothing here. */
export function noteSignature(cache: CacheParts | null | undefined): string {
	const names = (list?: { link: string }[]) => list?.map((l) => l.link);
	return JSON.stringify([cache?.frontmatter, cache?.tags?.map((t) => t.tag), names(cache?.links), names(cache?.embeds), names(cache?.frontmatterLinks)]);
}
