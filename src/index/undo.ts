/** A note's properties as they were before a step: only the ones it changed, undefined for one it added. */
export interface UndoNote {
	path: string;
	before: Record<string, unknown>;
	/** The text below the properties, when a step changed it (tags written in the text). */
	body?: { before: string; after: string };
}

export interface UndoStep {
	label: string;
	at: number;
	notes: UndoNote[];
}

export const MAX_UNDO = 50;

/** Each property an edit changed, as it was. */
export function changesBetween(before: Record<string, unknown>, after: Record<string, unknown>): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
		if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) out[k] = before[k];
	}
	return out;
}

/** Notes a change in a step. A note edited twice keeps the earliest value of each property. */
export function addToStep(step: UndoStep, path: string, changes: Record<string, unknown>) {
	const note = step.notes.find((n) => n.path === path);
	if (!note) step.notes.push({ path, before: changes });
	else for (const [k, v] of Object.entries(changes)) if (!(k in note.before)) note.before[k] = v;
}

/** Notes a change to a note's text in a step: the earliest text before, the latest after. */
export function addBodyToStep(step: UndoStep, path: string, before: string, after: string) {
	let note = step.notes.find((n) => n.path === path);
	if (!note) step.notes.push((note = { path, before: {} }));
	note.body = { before: note.body?.before ?? before, after };
}

/** The text that splits off the properties: [properties block, the rest]. */
export function splitBody(text: string): [string, string] {
	const m = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.exec(text);
	return m ? [m[0], text.slice(m[0].length)] : ["", text];
}

/** Puts back what a step changed, leaving everything else on the note as it now stands. */
export function restoreFront(front: Record<string, unknown>, before: Record<string, unknown>) {
	for (const [k, v] of Object.entries(before)) {
		if (v === undefined) delete front[k];
		else front[k] = structuredClone(v);
	}
}

export function remember(history: UndoStep[], step: UndoStep) {
	history.push(step);
	while (history.length > MAX_UNDO) history.shift();
}

/** The steps as text for the history file. JSON has no undefined, so properties a step added are listed by name. */
export function writeHistory(steps: UndoStep[], maxChars = 2_000_000): string {
	const stored = steps.map((s) => ({
		...s,
		notes: s.notes.map((n) => ({ path: n.path, before: n.before, ...(n.body ? { body: n.body } : {}), added: Object.keys(n.before).filter((k) => n.before[k] === undefined) })),
	}));
	let text = JSON.stringify(stored);
	// Borders can be long: the oldest steps go first.
	while (text.length > maxChars && stored.length) {
		stored.shift();
		text = JSON.stringify(stored);
	}
	return text;
}

/** Steps from the history file; anything unreadable is left out. */
export function readHistory(text: string): UndoStep[] {
	let data: unknown;
	try {
		data = JSON.parse(text);
	} catch {
		return [];
	}
	if (!Array.isArray(data)) return [];
	const out: UndoStep[] = [];
	for (const s of data as { label?: unknown; at?: unknown; notes?: unknown }[]) {
		if (typeof s?.label !== "string" || typeof s.at !== "number" || !Array.isArray(s.notes)) continue;
		const notes = (s.notes as { path?: unknown; before?: unknown; added?: unknown; body?: { before?: unknown; after?: unknown } }[]).flatMap((n) => {
			if (typeof n?.path !== "string" || !n.before || typeof n.before !== "object") return [];
			const before = { ...(n.before as Record<string, unknown>) };
			for (const k of Array.isArray(n.added) ? n.added : []) if (typeof k === "string") before[k] = undefined;
			const body = typeof n.body?.before === "string" && typeof n.body.after === "string" ? { before: n.body.before, after: n.body.after } : undefined;
			return [{ path: n.path, before, ...(body ? { body } : {}) }];
		});
		if (notes.length) out.push({ label: s.label, at: s.at, notes });
	}
	return out.slice(-MAX_UNDO);
}

/** Keeps steps pointing at notes that were renamed or moved, alone or with their folder. */
export function renameInSteps(steps: UndoStep[], from: string, to: string) {
	for (const s of steps) {
		for (const n of s.notes) {
			if (n.path === from) n.path = to;
			else if (n.path.startsWith(`${from}/`)) n.path = to + n.path.slice(from.length);
		}
	}
}
