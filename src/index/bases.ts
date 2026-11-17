import type { Entity, EntityType } from "../types";

/** Properties that say what a note is, or that a table has no use for. */
const SKIP = /^(type|cr_type|tags?|aliases|alias|cssclasses?|banner|image|icon)$/i;

const text = (v: string) => JSON.stringify(v);

/**
 * An Obsidian Bases file (.base) listing every note of one type, with the properties those notes most often have as
 * columns. How a note is marked as that type (a `type` property, or a tag) is read from the notes themselves, so the
 * filter finds the same notes UniverseView does. `tagType` says which type a tag stands for. Null when nothing marks them.
 */
export function baseFor(name: string, type: EntityType, entities: Iterable<Entity>, tagType: (tag: string) => EntityType | null): string | null {
	const mine = [...entities].filter((e) => e.type === type);
	const filters = new Set<string>();
	const keys = new Map<string, number>();
	for (const e of mine) {
		for (const key of ["type", "cr_type"]) {
			const v = e.props[key];
			if (typeof v === "string" && v.trim()) filters.add(`${key} == ${text(v.trim())}`);
		}
		for (const t of e.tags) if (tagType(t) === type) filters.add(`file.hasTag(${text(t.replace(/^#/, ""))})`);
		for (const k of Object.keys(e.props)) if (!SKIP.test(k) && /^[\w-]+$/.test(k)) keys.set(k, (keys.get(k) ?? 0) + 1);
	}
	if (!filters.size) return null;
	const columns = [...keys].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k]) => `note.${k}`);
	return [
		"filters:",
		"  or:",
		...[...filters].sort().map((f) => `    - ${text(f)}`),
		"views:",
		"  - type: table",
		`    name: ${text(name)}`,
		"    order:",
		...["file.name", ...columns].map((c) => `      - ${c}`),
		"",
	].join("\n");
}
