import type { Calendar } from "../dates/calendars";
import { parseDate, parseSpan } from "../dates/parser";
import type { HolderSpan, Ref, Side, Transfer } from "../types";
import { asText } from "./text";

type Resolve = (text: string) => Ref;

const link = (v: unknown) => (typeof v === "string" ? v.replace(/^\[\[|\]\]$/g, "").split("|")[0].trim() : "");
const first = (o: Record<string, unknown>, keys: string[]) => keys.map((k) => o[k]).find((v) => v !== undefined && v !== null && v !== "");

/**
 * Who held a title when (`holders:` on the title):
 *
 *   holders:
 *     - holder: "[[William II Whitmore]]"
 *       from: 1220 C.E.
 *       to: 1258 C.E.
 *     - "[[Henry I Whitmore]] (1258 – 1291 C.E.)"
 *
 * The same person may hold it more than once.
 */
export function readHolders(value: unknown, resolve: Resolve, cal: Calendar): HolderSpan[] | undefined {
	if (value === undefined || value === null || value === "") return undefined;
	const out: HolderSpan[] = [];
	const date = (v: unknown) => (v === undefined || v === null || v === "" ? undefined : parseDate(v, cal) ?? undefined);
	for (const item of Array.isArray(value) ? value : [value]) {
		if (item && typeof item === "object") {
			const o = item as Record<string, unknown>;
			const name = link(first(o, ["holder", "who", "person", "lord", "lady", "ruler", "name"]));
			if (!name) continue;
			out.push({ ref: resolve(name), from: date(first(o, ["from", "since", "start"])), to: date(first(o, ["to", "until", "end"])) });
		} else if (typeof item === "string") {
			const m = /^\s*(.+?)\s*\(([^)]+)\)\s*$/.exec(item);
			const name = link(m ? m[1] : item);
			if (!name) continue;
			const span = m ? parseSpan(m[2], cal) : undefined;
			out.push({ ref: resolve(name), from: span?.start, to: span?.end });
		}
	}
	return out.length ? out.sort((a, b) => (a.from?.start ?? -Infinity) - (b.from?.start ?? -Infinity)) : undefined;
}

/**
 * Lands that change hands in an event (a war, a treaty, a marriage): `transfers:` on the event.
 *
 *   transfers:
 *     - land: "[[Los Angeles County]]"
 *       from: "[[United States]]"
 *       to: "[[Mexico]]"
 *
 * From the event's date the land answers to `to` (none: it becomes independent); before it, to `from`.
 */
export function readTransfers(value: unknown, resolve: Resolve): Transfer[] | undefined {
	if (value === undefined || value === null || value === "") return undefined;
	const out: Transfer[] = [];
	for (const item of Array.isArray(value) ? value : [value]) {
		if (!item || typeof item !== "object") continue;
		const o = item as Record<string, unknown>;
		const land = link(first(o, ["land", "title", "place", "territory", "realm"]));
		if (!land) continue;
		const from = link(first(o, ["from", "loser", "ceded-by", "was"]));
		const to = link(first(o, ["to", "winner", "gained-by", "now"]));
		out.push({ land: resolve(land), from: from ? resolve(from) : undefined, to: to ? resolve(to) : undefined });
	}
	return out.length ? out : undefined;
}

/**
 * Who fought in a battle or war (`sides:` on the event):
 *
 *   sides:
 *     - party: "[[House Whitmore]]"
 *       side: A
 *       outcome: won
 *     - "[[United States]] (B, lost)"
 *
 * Or the short form, `victor: [[House Whitmore]]` and `defeated: [[United States]]`.
 */
export function readSides(value: unknown, victor: unknown, defeated: unknown, resolve: Resolve): Side[] | undefined {
	const out: Side[] = [];
	if (value !== undefined && value !== null && value !== "") {
		for (const item of Array.isArray(value) ? value : [value]) {
			if (item && typeof item === "object") {
				const o = item as Record<string, unknown>;
				const name = link(first(o, ["party", "who", "realm", "army", "name", "belligerent"]));
				if (!name) continue;
				const outcome = first(o, ["outcome", "result"]);
				out.push({ party: resolve(name), side: asText(first(o, ["side", "with"]) ?? "A"), outcome: outcome === undefined ? undefined : asText(outcome).toLowerCase() });
			} else if (typeof item === "string") {
				const m = /^\s*(.+?)\s*\(([^)]+)\)\s*$/.exec(item);
				const name = link(m ? m[1] : item);
				if (!name) continue;
				const [side, outcome] = (m?.[2] ?? "").split(",").map((s) => s.trim());
				out.push({ party: resolve(name), side: side || "A", outcome: outcome ? outcome.toLowerCase() : undefined });
			}
		}
	}
	const add = (v: unknown, side: string, outcome: string) => {
		for (const x of Array.isArray(v) ? v : v ? [v] : []) {
			const name = link(x);
			if (name && !out.some((s) => s.party.name === name)) out.push({ party: resolve(name), side, outcome });
		}
	};
	add(victor, "A", "won");
	add(defeated, "B", "lost");
	return out.length ? out : undefined;
}

/** The parties that won, if any are marked. */
export function victorsOf(sides: Side[] | undefined): Side[] {
	return (sides ?? []).filter((s) => /^(won|win|victor|victory|victorious|winner)/.test(s.outcome ?? ""));
}
