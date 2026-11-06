import type { Calendar } from "../dates/calendars";
import { parseDate, parseSpan } from "../dates/parser";
import type { HolderSpan, Occupation, Ref, Side, Transfer } from "../types";
import { asText, splitSpan } from "./text";

type Resolve = (text: string) => Ref;

const link = (v: unknown) => (typeof v === "string" ? v.replace(/^\[\[|\]\]$/g, "").split("|")[0].trim() : "");
const first = (o: Record<string, unknown>, keys: string[]) => keys.map((k) => o[k]).find((v) => v !== undefined && v !== null && v !== "");

/** Written as a map (`1220: "[[William]]"`) rather than rows that carry one of these keys. */
const isMap = (v: unknown, rowKeys: string[]): v is Record<string, unknown> =>
	!!v && typeof v === "object" && !Array.isArray(v) && !rowKeys.some((k) => k in v);
const listOf = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === undefined || v === null || v === "" ? [] : [v]);
const inBrackets = (s: string) => /^\s*(.+?)\s*\(([^)]+)\)\s*$/.exec(s);
const wiki = (name: string) => `[[${name.trim()}]]`;
/** "[[One]], [[Two]]" as its links. */
const namesIn = (v: unknown): string[] => listOf(v).flatMap((x) => (typeof x === "string" ? x.split(/,\s*(?=\[\[)/) : [])).map(link).filter(Boolean);

/** A list property as rows of text, whichever way it's written, and back in its shortest form. */
export interface RowFormat {
	read(value: unknown, note?: Record<string, unknown>): Record<string, string>[];
	write(rows: Record<string, string>[]): unknown;
}

const HOLDER_KEYS = ["holder", "who", "person", "lord", "lady", "ruler", "name"];

/**
 * Who held a title when (`holders:` on the title). Shortest, each until the next:
 *
 *   holders:
 *     1220 C.E.: "[[William II Whitmore]]"
 *     1258 C.E.: "[[Henry I Whitmore]]"
 *
 * Or one line each, "[[Henry I Whitmore]] (1258 – 1291 C.E.)", or rows of holder, from and to.
 * The same person may hold it more than once.
 */
export function readHolders(value: unknown, resolve: Resolve, cal: Calendar): HolderSpan[] | undefined {
	if (value === undefined || value === null || value === "") return undefined;
	const out: HolderSpan[] = [];
	const date = (v: unknown) => (v === undefined || v === null || v === "" ? undefined : parseDate(v, cal) ?? undefined);
	if (isMap(value, HOLDER_KEYS)) {
		for (const [from, who] of Object.entries(value)) {
			const name = link(who);
			if (name) out.push({ ref: resolve(name), from: date(from) });
		}
		out.sort((a, b) => (a.from?.start ?? -Infinity) - (b.from?.start ?? -Infinity));
		out.forEach((h, i) => (h.to = out[i + 1]?.from));
		return out.length ? out : undefined;
	}
	for (const item of listOf(value)) {
		if (item && typeof item === "object") {
			const o = item as Record<string, unknown>;
			const name = link(first(o, HOLDER_KEYS));
			if (!name) continue;
			out.push({ ref: resolve(name), from: date(first(o, ["from", "since", "start"])), to: date(first(o, ["to", "until", "end"])) });
		} else if (typeof item === "string") {
			const m = inBrackets(item);
			const name = link(m ? m[1] : item);
			if (!name) continue;
			const span = m ? parseSpan(m[2], cal) : undefined;
			out.push({ ref: resolve(name), from: span?.start, to: span?.end });
		}
	}
	return out.length ? out.sort((a, b) => (a.from?.start ?? -Infinity) - (b.from?.start ?? -Infinity)) : undefined;
}

const holders: RowFormat = {
	read(value) {
		if (isMap(value, HOLDER_KEYS)) return Object.entries(value).map(([from, who]) => ({ holder: link(who), from, to: "" }));
		return listOf(value).flatMap((item) => {
			if (item && typeof item === "object") {
				const o = item as Record<string, unknown>;
				return [{ holder: link(first(o, HOLDER_KEYS)), from: asText(first(o, ["from", "since", "start"])), to: asText(first(o, ["to", "until", "end"])) }];
			}
			if (typeof item !== "string") return [];
			const m = inBrackets(item);
			const [from, to] = splitSpan(m?.[2] ?? "");
			return [{ holder: link(m ? m[1] : item), from, to }];
		});
	},
	write(rows) {
		const froms = rows.map((r) => r.from?.trim());
		// Each from a date, none with an end: the short map, each until the next.
		if (rows.length > 1 && froms.every(Boolean) && new Set(froms).size === rows.length && rows.every((r) => !r.to?.trim())) {
			return Object.fromEntries(rows.map((r) => [r.from.trim(), wiki(r.holder)]));
		}
		return rows.map((r) => {
			const from = r.from?.trim(), to = r.to?.trim();
			if (from && to) return `${wiki(r.holder)} (${from} – ${to})`;
			if (from) return `${wiki(r.holder)} (${from} –)`;
			return to ? { holder: wiki(r.holder), to } : wiki(r.holder);
		});
	},
};

/**
 * Lands that change hands in an event (a war, a treaty, a marriage): `transfers:` on the event,
 * one line each, "land: from > to". The old owner can be left out, and several lands share a line:
 *
 *   transfers:
 *     - "[[Los Angeles County]]: [[United States]] > [[Mexico]]"
 *     - "[[Elland]], [[Ilten]] > [[Mexico]]"
 *
 * From the event's date the land answers to `to` (none: it becomes independent); before it, to `from`.
 */
const transfers: RowFormat = {
	read(value) {
		return listOf(value).flatMap((item) => {
			if (item && typeof item === "object") {
				const o = item as Record<string, unknown>;
				return [{ land: link(first(o, ["land", "title", "place", "territory", "realm"])), from: link(first(o, ["from", "loser", "ceded-by", "was"])), to: link(first(o, ["to", "winner", "gained-by", "now"])) }];
			}
			if (typeof item !== "string") return [];
			const [left, to = ""] = item.split(">");
			const [lands, from = ""] = left.split(/:\s+/);
			return namesIn(lands).map((land) => ({ land, from: link(from.trim()), to: link(to.trim()) }));
		}).filter((r) => r.land);
	},
	write(rows) {
		return rows.map((r) => {
			const from = r.from?.trim() ? `: ${wiki(r.from)}` : "";
			return `${wiki(r.land)}${from} > ${r.to?.trim() ? wiki(r.to) : ""}`.trim();
		});
	},
};

export function readTransfers(value: unknown, resolve: Resolve): Transfer[] | undefined {
	const out = transfers.read(value).map((r) => ({ land: resolve(r.land), from: r.from ? resolve(r.from) : undefined, to: r.to ? resolve(r.to) : undefined }));
	return out.length ? out : undefined;
}

const PARTY_KEYS = ["party", "who", "realm", "army", "name", "belligerent"];

/**
 * Who fought in a battle or war (`sides:` on the event). Shortest, on one line:
 *
 *   sides: "[[House Whitmore]], [[Mexico]] vs [[United States]]"
 *
 * Or by side, each party once, with how it ended in brackets or as `outcome:` for everyone:
 *
 *   sides:
 *     The Crown (won): ["[[House Whitmore]]", "[[Mexico]]"]
 *     The Rebels (lost): "[[United States]]"
 *
 * Or one line each, "[[United States]] (B, lost)", or rows of party, side and outcome; or
 * `victor: [[House Whitmore]]` and `defeated: [[United States]]`. A battle with none fights as its war.
 */
const sides: RowFormat = {
	read(value, note) {
		const all = asText(first(note ?? {}, ["outcome", "result"]));
		const row = (party: string, side: string, outcome: string) => ({ party, side, outcome: outcome || all });
		if (isMap(value, PARTY_KEYS)) {
			return Object.entries(value).flatMap(([key, who]) => {
				const m = inBrackets(key);
				return namesIn(who).map((party) => row(party, m ? m[1] : key, m?.[2] ?? ""));
			});
		}
		return listOf(value).flatMap((item) => {
			if (item && typeof item === "object") {
				const o = item as Record<string, unknown>;
				const party = link(first(o, PARTY_KEYS));
				return party ? [row(party, asText(first(o, ["side", "with"]) ?? "A"), asText(first(o, ["outcome", "result"])))] : [];
			}
			if (typeof item !== "string") return [];
			const camps = item.split(/\s+vs\.?\s+/i);
			if (camps.length > 1) return camps.flatMap((camp, i) => namesIn(camp).map((party) => row(party, String.fromCharCode(65 + i), "")));
			const m = inBrackets(item);
			const party = link(m ? m[1] : item);
			const [side, outcome] = (m?.[2] ?? "").split(",").map((s) => s.trim());
			return party ? [row(party, side || "A", outcome ?? "")] : [];
		});
	},
	write(rows) {
		const out: Record<string, string[]> = {};
		for (const r of rows) {
			const side = r.side?.trim() || "A";
			const key = r.outcome?.trim() ? `${side} (${r.outcome.trim()})` : side;
			(out[key] ??= []).push(wiki(r.party));
		}
		return out;
	},
};

export function readSides(value: unknown, victor: unknown, defeated: unknown, resolve: Resolve, outcome?: unknown): Side[] | undefined {
	const out: Side[] = sides.read(value, { outcome }).map((r) => ({ party: resolve(r.party), side: r.side, outcome: r.outcome ? r.outcome.toLowerCase() : undefined }));
	const add = (v: unknown, side: string, result: string) => {
		for (const x of listOf(v)) {
			const name = link(x);
			if (name && !out.some((s) => s.party.name === name)) out.push({ party: resolve(name), side, outcome: result });
		}
	};
	add(victor, "A", "won");
	add(defeated, "B", "lost");
	return out.length ? out : undefined;
}

/**
 * Lands held for a while by someone else (`occupied:` on a war or battle), one line each. The land
 * keeps its owner; without dates it lasts as long as the event:
 *
 *   occupied:
 *     - "[[Elland]], [[Ilten]] by [[Mexico]] (1240 – 1241)"
 */
const occupied: RowFormat = {
	read(value) {
		return listOf(value).flatMap((item) => {
			if (item && typeof item === "object") {
				const o = item as Record<string, unknown>;
				return [{ land: link(first(o, ["land", "place", "territory"])), by: link(first(o, ["by", "occupier", "held-by"])), from: asText(o.from), to: asText(o.to) }];
			}
			if (typeof item !== "string") return [];
			const m = /^(.+?)\s+by\s+(.+?)(?:\s*\(([^)]+)\))?\s*$/.exec(item);
			if (!m) return [];
			const [from, to] = splitSpan(m[3] ?? "");
			return namesIn(m[1]).map((land) => ({ land, by: link(m[2]), from, to }));
		}).filter((r) => r.land && r.by);
	},
	write(rows) {
		return rows.map((r) => {
			const from = r.from?.trim(), to = r.to?.trim();
			const when = from && to ? ` (${from} – ${to})` : from ? ` (${from} –)` : "";
			return `${wiki(r.land)} by ${wiki(r.by ?? "")}${when}`;
		});
	},
};

export function readOccupied(value: unknown, resolve: Resolve, cal: Calendar): Occupation[] | undefined {
	const date = (v: string) => (v ? parseDate(v, cal) ?? undefined : undefined);
	const out = occupied.read(value).map((r) => ({ land: resolve(r.land), by: resolve(r.by), from: date(r.from), to: date(r.to) }));
	return out.length ? out : undefined;
}

export const ROW_FORMATS: Record<string, RowFormat> = { holders, transfers, sides, occupied };

/** The parties that won, if any are marked. */
export function victorsOf(sides: Side[] | undefined): Side[] {
	return (sides ?? []).filter((s) => /^(won|win|victor|victory|victorious|winner)/.test(s.outcome ?? ""));
}
