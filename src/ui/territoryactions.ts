import { Notice, TFile } from "obsidian";
import type ChroniclePlugin from "../main";
import type { Entity, Territory } from "../types";
import { formatDay } from "../dates/parser";
import { toolSheet } from "./toolsheet";

/**
 * The territory tools, each as one form, the same whether you start from a right-click on the map or
 * from the inspector's Borders card. Things that need the map on screen (reshaping, growing to the
 * neighbours, splitting) are handed a callback that does them there.
 */

const dateOf = (p: ChroniclePlugin, v: string, cal: string) => (v.trim() ? p.parseDate(v.trim(), cal) : null);

/** From a date on, new borders: the area as it is ends then, and a copy from then is reshaped. */
export function bordersFromSheet(p: ChroniclePlugin, e: Entity, mapKey: string, n: number, at: number | undefined, reshape: (newN: number, day: number) => void) {
	const cal = p.calendars.get(e.calendar);
	toolSheet(p, {
		title: `New borders for ${e.name}`,
		icon: "history",
		intro: "Borders that change over time. The area as it is now ends on this date, and a copy starts then for you to reshape. The time slider shows whichever applies.",
		fields: [{ key: "date", kind: "date", label: "From", value: at !== undefined ? formatDay(at, cal, "year") : "", calendar: cal.id, hint: "The first day of the new borders" }],
		check: (v) => (!dateOf(p, v.date, cal.id) ? "Give the date the borders change." : undefined),
		preview: (v) => `${e.name}'s current borders end ${v.date.trim()}; new ones start then, ready to reshape.`,
		submit: "Change the borders",
		run: async (v) => {
			const m = await p.shapeDates(e.key, mapKey, n, { change: v.date.trim() });
			const d = dateOf(p, v.date, cal.id);
			if (m !== undefined && d) {
				new Notice(`New borders for ${e.name} from ${v.date.trim()}: reshape them now.`);
				reshape(m, d.start);
			}
		},
	});
}

/** When one area applies: from, to, or always. */
export function areaDatesSheet(p: ChroniclePlugin, e: Entity, mapKey: string, n: number, t: Territory | undefined) {
	const cal = p.calendars.get(e.calendar);
	toolSheet(p, {
		title: `When this area of ${e.name} applies`,
		icon: "calendar-range",
		intro: "Borders can hold for a stretch of time: before From and after To, this area isn't drawn. Leave a side empty for open-ended.",
		fields: [
			{ key: "from", kind: "date", label: "From", value: t?.fromText ?? "", calendar: cal.id, optional: true },
			{ key: "to", kind: "date", label: "To", value: t?.toText ?? "", calendar: cal.id, optional: true },
		],
		check: (v) => {
			if (v.from.trim() && !dateOf(p, v.from, cal.id)) return "From isn't a date yet.";
			if (v.to.trim() && !dateOf(p, v.to, cal.id)) return "To isn't a date yet.";
			const a = dateOf(p, v.from, cal.id);
			const b = dateOf(p, v.to, cal.id);
			return a && b && b.end < a.start ? "To comes before From." : undefined;
		},
		preview: (v) => (!v.from.trim() && !v.to.trim() ? "Always drawn." : `Drawn ${v.from.trim() ? `from ${v.from.trim()}` : "from the start"} ${v.to.trim() ? `until ${v.to.trim()}` : "on, with no end"}.`),
		submit: "Save the dates",
		run: (v) => void p.shapeDates(e.key, mapKey, n, { dates: [v.from, v.to] }),
	});
}

/** A new land under this one, named, with its tier one below; then drawn. */
export function newLandSheet(p: ChroniclePlugin, e: Entity, draw: (file: TFile) => void) {
	toolSheet(p, {
		title: `A new land inside ${e.name}`,
		icon: "plus-square",
		intro: "Makes a note for the land, a tier below this one and filed inside its folder note, then lets you draw its borders. Zoomed out it shows as part of this one.",
		fields: [{ key: "name", kind: "text", label: "Name", placeholder: "e.g. Los Angeles County" }],
		check: (v) => (!v.name.trim() ? "Name the land." : p.index.findByName(v.name.trim()) ? `There's already a note called ${v.name.trim()}.` : undefined),
		preview: (v) => `${v.name.trim()} will sit under ${e.name}.`,
		submit: "Make it and draw",
		run: async (v) => {
			const file = await p.createChildLand(e.key, v.name.trim());
			if (file) window.setTimeout(() => draw(file), 400);
		},
	});
}

/** Names the land a split takes off. */
export function splitNameSheet(p: ChroniclePlugin, owner: Entity, done: (name: string) => void) {
	toolSheet(p, {
		title: `The land split off ${owner.name}`,
		icon: "scissors",
		intro: `The part you picked becomes a land of its own, under ${owner.name}, which keeps the rest.`,
		fields: [{ key: "name", kind: "text", label: "Name", placeholder: "e.g. the March of Vael" }],
		check: (v) => (!v.name.trim() ? "Name the land." : p.index.findByName(v.name.trim()) ? `There's already a note called ${v.name.trim()}.` : undefined),
		preview: (v) => `${v.name.trim()} takes the picked part; ${owner.name} keeps the other.`,
		submit: "Split it",
		run: (v) => done(v.name.trim()),
	});
}

/** How far to grow out to the neighbours. */
export function growSheet(p: ChroniclePlugin, e: Entity, grow: (px: number) => void) {
	toolSheet(p, {
		title: `Grow ${e.name} to its neighbours`,
		icon: "expand",
		intro: "Pulls its border onto any neighbouring border within this distance, filling the gaps between, and adds the matching corners to the neighbours so the two borders are one line.",
		fields: [{ key: "px", kind: "number", label: "Close gaps up to", value: 16, min: 2, max: 120, step: 1, unit: "px on screen", hint: "Measured as the map shows now: zoom out to close wider gaps." }],
		preview: (v) => `Gaps up to ${v.px} px wide close.`,
		submit: "Grow it",
		run: (v) => grow(Math.max(2, Math.min(200, Number(v.px) || 16))),
	});
}

/** The colours a map note can take. */
export const NOTE_COLOURS: [string, string][] = [["#e8b33a", "Amber"], ["#e05252", "Red"], ["#3d8fd1", "Blue"], ["#3bb273", "Green"], ["#9b59b6", "Purple"], ["#333333", "Ink"]];

/** A map note's text (or a line's label) and colour. */
export function mapNoteSheet(p: ChroniclePlugin, o: { kind: "note" | "arrow" | "line"; text?: string; color?: string; isNew?: boolean }, done: (text: string, color: string) => void) {
	const what = o.kind === "note" ? "sticky note" : o.kind;
	toolSheet(p, {
		title: o.isNew ? `A new ${what}` : o.kind === "note" ? "Edit the note" : `Label the ${what}`,
		icon: o.kind === "note" ? "sticky-note" : o.kind === "arrow" ? "move-up-right" : "spline",
		intro: o.kind === "note" ? "A note pinned to this spot, for planning: it's kept in the map note, not shown anywhere else." : `Text shown along the ${what}. Leave it empty for none.`,
		fields: [
			{ key: "text", kind: "text", label: o.kind === "note" ? "Text" : "Label", value: o.text ?? "", placeholder: o.kind === "note" ? "e.g. the army camps here" : "e.g. the march north" },
			{ key: "color", kind: "choice", label: "Colour", value: o.color ?? NOTE_COLOURS[0][0], options: NOTE_COLOURS },
		],
		check: (v) => (o.kind === "note" && !v.text.trim() ? "Write the note." : undefined),
		preview: (v) => (v.text.trim() ? `“${v.text.trim()}” in ${NOTE_COLOURS.find((c) => c[0] === v.color)?.[1].toLowerCase() ?? "colour"}.` : ""),
		submit: o.isNew ? "Place it" : "Save",
		run: (v) => done(v.text.trim(), v.color),
	});
}

/** Moves everything on a map: for a picture swapped for one of another size, or cropped. */
export function moveMapSheet(p: ChroniclePlugin, mapKey: string, start: { sx: number; sy: number }, size: [number, number] | undefined, title = "Move everything on this map") {
	const name = p.index.get(mapKey)?.name ?? "this map";
	toolSheet(p, {
		title,
		icon: "move",
		intro: `Every pin, area, route and map note on ${name} is scaled, then shifted: for a picture that was resized, cropped or extended.`,
		fields: [
			{ key: "sx", kind: "number", label: "Scale across", value: Number(start.sx.toFixed(4)), min: 0.1, max: 10, step: 0.0001, unit: "×" },
			{ key: "sy", kind: "number", label: "Scale down", value: Number(start.sy.toFixed(4)), min: 0.1, max: 10, step: 0.0001, unit: "×" },
			{ key: "dx", kind: "number", label: "Shift right", value: 0, min: -20000, max: 20000, step: 1, unit: "px" },
			{ key: "dy", kind: "number", label: "Shift down", value: 0, min: -20000, max: 20000, step: 1, unit: "px" },
		],
		check: (v) => (!(Number(v.sx) > 0 && Number(v.sy) > 0) ? "Scales must be above 0." : undefined),
		preview: (v) => `A point at 100, 100 moves to ${Math.round(100 * Number(v.sx) + Number(v.dx))}, ${Math.round(100 * Number(v.sy) + Number(v.dy))}.`,
		submit: "Move everything",
		run: (v) => void p.rescaleMap(mapKey, Number(v.sx), Number(v.sy), Number(v.dx) || 0, Number(v.dy) || 0, size),
	});
}
