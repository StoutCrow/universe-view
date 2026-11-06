/** The timeline's geometry that doesn't need a screen, so it can be tested. */

export interface RowEntry {
	id: string;
	start: number;
	end: number;
	point: boolean;
	/** The label's width in pixels, with its margin. */
	labelWidth: number;
}

/**
 * Gives each entry a row, at one fixed scale in pixels per day. Rows don't depend on the zoom: zooming
 * in only spreads things further apart, so everything keeps its row at any scale above this one.
 */
export function packRows(entries: RowEntry[], scale: number): { rows: Map<string, number>; count: number } {
	const rowEnds: number[] = [];
	const rows = new Map<string, number>();
	const gap = 8;
	for (const it of [...entries].sort((a, b) => a.start - b.start)) {
		const x1 = it.start * scale;
		const w = Math.max((it.end - it.start) * scale, 4);
		const left = it.point ? x1 - 7 : x1;
		const right = it.point ? x1 + 10 + it.labelWidth : w >= it.labelWidth + 6 ? x1 + w : x1 + w + it.labelWidth;
		let row = rowEnds.findIndex((end) => end + gap <= left);
		if (row < 0) row = rowEnds.push(right) - 1;
		else rowEnds[row] = right;
		rows.set(it.id, row);
	}
	return { rows, count: Math.max(1, rowEnds.length) };
}

/** Where each row sits: nations get the lineage's taller rows, with room above the bar for its marks. */
export function rowLayout(count: number, tall: Set<number>, rowH: number, tallH: number): { top: number[]; height: number[]; total: number } {
	const top: number[] = [];
	const height: number[] = [];
	let y = 0;
	for (let i = 0; i < count; i++) {
		top.push(y);
		height.push(tall.has(i) ? Math.max(rowH, tallH) : rowH);
		y += height[i];
	}
	return { top, height, total: y };
}

/** Which level each mark sits on, so marks too close to read stack up instead of overlapping. `xs` in order. */
export function stackLevels(xs: number[], gap = 11): number[] {
	const ends: number[] = [];
	return xs.map((x) => {
		let level = ends.findIndex((end) => x - end >= gap);
		if (level < 0) level = ends.length;
		ends[level] = x;
		return level;
	});
}

/** What's in view on the timeline, in either mode: the middle day, the zoom, and the nation it's centred on. */
export interface TimeRange {
	center: number;
	scale: number;
	key?: string;
}

export interface Box {
	left: number;
	right: number;
	top: number;
	bottom: number;
}

/**
 * An arrow from a cause to its effect that follows the dates. Once the cause is over it runs from
 * its end; if the effect began while the cause was still going, it leaves the bar at that moment
 * and never doubles back.
 */
export function causePath(a: Box, b: Box): string {
	const y2 = (b.top + b.bottom) / 2;
	const middle = (a.top + a.bottom) / 2;
	const x2 = b.left - 2;
	if (x2 >= a.right) {
		const bend = (x2 - a.right) / 2;
		return `M${a.right},${middle} C${a.right + bend},${middle} ${x2 - bend},${y2} ${x2},${y2}`;
	}
	const down = y2 >= middle;
	const edge = down ? a.bottom : a.top;
	// The effect began first (dates that disagree): straight across from the cause's start.
	if (x2 < a.left) return b.right >= a.left ? `M${a.left},${edge} L${a.left},${down ? b.top : b.bottom}` : `M${a.left},${edge} C${a.left},${y2} ${a.left},${y2} ${b.right + 2},${y2}`;
	const x1 = Math.max(a.left, x2 - 14);
	return `M${x1},${edge} C${x1},${y2} ${x1},${y2} ${x2},${y2}`;
}
