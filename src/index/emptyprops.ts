/**
 * Empty properties: the blank ones a template leaves behind (`aliases:`, `reign:`, `allies: []`). UniverseView reads a
 * missing property exactly like a blank one, so they only add clutter. Zero and false are values, not blanks.
 */

const blank = (v: unknown): boolean => {
	if (v === null || v === undefined) return true;
	if (typeof v === "string") return v.trim() === "";
	if (Array.isArray(v)) return v.every(blank);
	return false;
};

/** The properties of a note that are blank, in the order they are written. */
export function emptyKeys(front: Record<string, unknown>): string[] {
	return Object.keys(front).filter((k) => k !== "position" && blank(front[k]));
}

/** Removes the blank properties; returns which went. */
export function dropEmpty(front: Record<string, unknown>): string[] {
	const gone = emptyKeys(front);
	for (const k of gone) delete front[k];
	return gone;
}