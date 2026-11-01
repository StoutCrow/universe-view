// Rivers drawn as water rather than a line: the course smoothed into curves, then widened into a
// ribbon that runs narrow at the source (the first point drawn) and broad at the mouth (the last).

type P2 = [number, number];

/** Chaikin's corner cutting: each pass rounds every bend; the two ends stay put. */
export function smoothLine(pts: P2[], passes = 2): P2[] {
	let out = pts;
	for (let k = 0; k < passes && out.length > 2; k++) {
		const next: P2[] = [out[0]];
		for (let i = 0; i < out.length - 1; i++) {
			const [a, b] = [out[i], out[i + 1]];
			next.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
		}
		next.push(out[out.length - 1]);
		out = next;
	}
	return out;
}

/**
 * A closed outline round the line, `from` wide at its start widening to `to` at its end (by distance
 * along it, easing so most of the widening comes downstream). Down one bank, then back up the other.
 */
export function ribbon(pts: P2[], from: number, to: number): P2[] {
	if (pts.length < 2) return [];
	const along = [0];
	for (let i = 1; i < pts.length; i++) along.push(along[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
	const total = along[along.length - 1] || 1;
	const left: P2[] = [];
	const right: P2[] = [];
	pts.forEach((p, i) => {
		// The direction here: the average of the stretches either side.
		const a = pts[Math.max(0, i - 1)];
		const b = pts[Math.min(pts.length - 1, i + 1)];
		const dx = b[0] - a[0];
		const dy = b[1] - a[1];
		const len = Math.hypot(dx, dy) || 1;
		const t = along[i] / total;
		const half = (from + (to - from) * t * t * (3 - 2 * t) * 0.6 + (to - from) * t * 0.4) / 2;
		left.push([p[0] - (dy / len) * half, p[1] + (dx / len) * half]);
		right.push([p[0] + (dy / len) * half, p[1] - (dx / len) * half]);
	});
	return [...left, ...right.reverse()];
}
