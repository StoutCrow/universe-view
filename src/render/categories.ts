/** The timeline's categories: what each thing is filed under, and a colour for each. Pure, so it's testable. */

export type ItemKind = "event" | "person" | "culture" | "place" | "birth" | "death" | "scene" | "rename" | "reign" | "occupation";

export const KIND_LABELS: Record<ItemKind, string> = {
	event: "Events",
	person: "Lifespans",
	culture: "Groups",
	place: "Places",
	birth: "Births & deaths",
	death: "Births & deaths",
	scene: "Story",
	rename: "Renamings",
	reign: "Holders of titles",
	occupation: "Occupations",
};

/**
 * What an item is filed under when organising by category: an event's own category (`category:`,
 * `kind:` or a tag: battle, treaty, coronation…), else what it is (lifespans, groups, places…).
 * Returns [id, label].
 */
export function categoryOf(kind: ItemKind, category: string | undefined): [string, string] {
	if (kind === "event") return category ? [category, category.charAt(0).toUpperCase() + category.slice(1)] : ["~event", "Other events"];
	const k = kind === "death" ? "birth" : kind;
	return [`kind:${k}`, KIND_LABELS[k]];
}

/**
 * A colour for each category from the theme's named colours: handed out in turn through `all` (every
 * category there is, sorted), so neighbours never share one until the colours run out, and a category
 * keeps its colour however the timeline is filtered.
 */
export function categoryColor(id: string, all: string[] = []): string {
	const palette = ["blue", "orange", "green", "purple", "red", "cyan", "yellow", "pink"];
	let i = all.indexOf(id);
	if (i < 0) {
		i = 0;
		for (const ch of id) i = (i * 31 + ch.charCodeAt(0)) >>> 0;
	}
	return `var(--color-${palette[i % palette.length]})`;
}
