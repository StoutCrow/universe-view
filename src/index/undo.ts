/** A note's properties as they were before a step: only the ones it changed, undefined for one it added. */
export interface UndoNote {
	path: string;
	before: Record<string, unknown>;
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

/** Keeps steps pointing at notes that were renamed or moved, alone or with their folder. */
export function renameInSteps(steps: UndoStep[], from: string, to: string) {
	for (const s of steps) {
		for (const n of s.notes) {
			if (n.path === from) n.path = to;
			else if (n.path.startsWith(`${from}/`)) n.path = to + n.path.slice(from.length);
		}
	}
}
