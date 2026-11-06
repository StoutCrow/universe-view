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

/** The lane a nation's history shares: its wars, new names, heirs and occupations, told apart by shape. */
export const NATIONS_LANE: [string, string] = ["~nations", "Nations and wars"];

/** Where an item goes when organising by category: `warlike` is a war or battle. */
export function laneFor(kind: ItemKind, category: [string, string], warlike: boolean): [string, string] {
	return kind === "rename" || kind === "reign" || kind === "occupation" || (kind === "event" && warlike) ? NATIONS_LANE : category;
}

export type ItemShape = "round" | "battle" | "arrow" | "diamond" | "chevron" | "hatch" | "square" | "hexagon" | "triangle" | "star";

const EVENT_SHAPES: ItemShape[] = ["square", "hexagon", "triangle", "star"];

/**
 * Each category's shape, on dots and bars alike, so sharing a lane or a colour never hides what a thing
 * is. Wars, renamings, holders and occupations keep theirs; other kinds of event take the rest in turn
 * through `all` (every category there is, sorted).
 */
export function shapeFor(kind: ItemKind, id: string, war: "war" | "battle" | undefined, all: string[] = []): ItemShape {
	if (kind === "rename") return "diamond";
	if (kind === "reign") return "chevron";
	if (kind === "occupation") return "hatch";
	if (kind !== "event") return "round";
	if (war === "battle") return "battle";
	if (war === "war") return "arrow";
	if (id === "~event") return "round";
	const events = all.filter((c) => !c.startsWith("kind:") && c !== "~event");
	return EVENT_SHAPES[Math.max(0, events.indexOf(id)) % EVENT_SHAPES.length];
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
