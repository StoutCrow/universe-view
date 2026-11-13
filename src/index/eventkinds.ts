import type { Entity } from "../types";

/** Kinds of event offered when writing one. `moves`: it goes from a place to a place, so the map draws its path. */
export const EVENT_KINDS: { key: string; moves: boolean }[] = [
	{ key: "battle", moves: false },
	{ key: "siege", moves: false },
	{ key: "coronation", moves: false },
	{ key: "wedding", moves: false },
	{ key: "meeting", moves: false },
	{ key: "treaty", moves: false },
	{ key: "festival", moves: false },
	{ key: "disaster", moves: false },
	{ key: "journey", moves: true },
	{ key: "voyage", moves: true },
	{ key: "march", moves: true },
	{ key: "campaign", moves: true },
	{ key: "migration", moves: true },
	{ key: "expedition", moves: true },
	{ key: "pilgrimage", moves: true },
];

/** Words in a name or kind that say an event travels. */
const MOVES = /\b(war|campaign|migration|voyage|march|invasion|expedition|journey|crusade|retreat|exodus|raid|conquest|pilgrimage|flight|trek)\b/i;

/** An event that goes from place to place: it has a start and end place, a moving kind or name, or a `path:` / `movement:`. */
export function isMovement(e: Entity): boolean {
	return !!(e.startPlace || e.endPlace) || MOVES.test(`${e.category ?? ""} ${e.name}`) || !!e.props.path || !!e.props.movement;
}

/** The point `t` (0 to 1) of the way along a path, measured by its length. */
export function pathPoint(points: [number, number][], t: number): [number, number] {
	if (points.length < 2) return points[0] ?? [0, 0];
	const lens = points.slice(1).map((p, i) => Math.hypot(p[0] - points[i][0], p[1] - points[i][1]));
	const total = lens.reduce((a, b) => a + b, 0);
	let left = Math.min(1, Math.max(0, t)) * total;
	for (let i = 0; i < lens.length; i++) {
		if (left <= lens[i] || i === lens.length - 1) {
			const f = lens[i] ? Math.min(1, left / lens[i]) : 0;
			return [points[i][0] + (points[i + 1][0] - points[i][0]) * f, points[i][1] + (points[i + 1][1] - points[i][1]) * f];
		}
		left -= lens[i];
	}
	return points[points.length - 1];
}

/** How far through an event a day is (0 before it starts, 1 once over). */
export function progress(e: Entity, day: number): number {
	if (!e.start) return 0;
	const a = e.start.start;
	const b = e.end?.end ?? e.start.end;
	return b > a ? Math.min(1, Math.max(0, (day - a) / (b - a))) : day >= a ? 1 : 0;
}
