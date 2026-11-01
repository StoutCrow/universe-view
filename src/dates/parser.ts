import type { ChronDate, Precision } from "../types";
import type { Calendar } from "./calendars";

const APPROX_PREFIX = /^(?:c\.|ca\.|circa|abt\.?|about|around|approx\.?|~)\s*/i;
const BEFORE_PREFIX = /^(?:before|bef\.?|<)\s*/i;
const AFTER_PREFIX = /^(?:after|aft\.?|>)\s*/i;
const BETWEEN_PREFIX = /^(?:between|bet\.?|from)\s+/i;
const RANGE_SPLIT = /\s*(?:\.\.|–|—|\s-\s|\bto\b|\band\b|\buntil\b)\s*/i;
const LETTERS = "A-Za-z\\u00C0-\\u024F'";

function escapeRegExp(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchMonth(token: string, cal: Calendar): number | null {
	const t = token.trim().toLowerCase().replace(/\.$/, "");
	if (t.length < 3) return null;
	const idx = cal.monthNames.findIndex((n) => n.toLowerCase() === t);
	if (idx >= 0) return idx + 1;
	const prefix = cal.monthNames.findIndex((n) => n.toLowerCase().startsWith(t));
	return prefix >= 0 ? prefix + 1 : null;
}

interface Parts {
	y: number;
	m?: number;
	d?: number;
}

export function splitEra(s: string, cal: Calendar): { rest: string; era?: string } {
	const tokens = cal.eraTokens().sort((a, b) => b.length - a.length);
	for (const tok of tokens) {
		const re = new RegExp(`(^|\\s)${escapeRegExp(tok)}(?=\\s|$)`, "i");
		const m = s.match(re);
		if (m && m.index !== undefined) {
			const rest = (s.slice(0, m.index) + " " + s.slice(m.index + m[0].length)).trim();
			return { rest, era: tok };
		}
	}
	return { rest: s };
}

function parseParts(s: string, cal: Calendar): Parts | null {
	s = s.trim().replace(/,/g, " ").replace(/\s+/g, " ");
	let m = s.match(/^(-?\d+)(?:[-/](\d{1,2})(?:[-/](\d{1,2}))?)?$/);
	if (m) return { y: +m[1], m: m[2] ? +m[2] : undefined, d: m[3] ? +m[3] : undefined };
	// 14 May 1243
	m = s.match(new RegExp(`^(\\d{1,2})(?:st|nd|rd|th)? (?:of )?([${LETTERS} ]+?) (-?\\d+)$`, "i"));
	if (m) {
		const mon = matchMonth(m[2], cal);
		if (mon) return { y: +m[3], m: mon, d: +m[1] };
	}
	// May 14 1243
	m = s.match(new RegExp(`^([${LETTERS} ]+?) (\\d{1,2})(?:st|nd|rd|th)? (-?\\d+)$`, "i"));
	if (m) {
		const mon = matchMonth(m[1], cal);
		if (mon) return { y: +m[3], m: mon, d: +m[2] };
	}
	// May 1243
	m = s.match(new RegExp(`^([${LETTERS} ]+?) (-?\\d+)$`, "i"));
	if (m) {
		const mon = matchMonth(m[1], cal);
		if (mon) return { y: +m[2], m: mon };
	}
	return null;
}

function parseSingle(input: string, cal: Calendar): { start: number; end: number; precision: Precision } | null {
	const { rest, era } = splitEra(input.trim(), cal);
	const parts = parseParts(rest, cal);
	if (!parts) return null;
	const year = cal.resolveYear(parts.y, era);
	if (year === null || !Number.isFinite(year)) return null;
	if (parts.m !== undefined && (parts.m < 1 || parts.m > cal.monthCount(year))) return null;
	if (parts.m !== undefined && parts.d !== undefined) {
		const d = Math.min(Math.max(parts.d, 1), cal.monthDays(year, parts.m));
		const day = cal.toDays(year, parts.m, d);
		return { start: day, end: day, precision: "day" };
	}
	if (parts.m !== undefined) {
		const start = cal.toDays(year, parts.m, 1);
		return { start, end: start + cal.monthDays(year, parts.m) - 1, precision: "month" };
	}
	const start = cal.toDays(year, 1, 1);
	return { start, end: cal.toDays(year + 1, 1, 1) - 1, precision: "year" };
}

/** Normalizes values coming from YAML, Dataview (Luxon) or JS Dates into a string. */
function toDateString(value: unknown): string | null {
	if (value === null || value === undefined) return null;
	if (typeof value === "number") return Number.isFinite(value) ? String(Math.trunc(value)) : null;
	if (typeof value === "string") return value.trim() || null;
	if (value instanceof Date) {
		if (isNaN(value.getTime())) return null;
		const y = value.getUTCFullYear();
		return `${y}-${value.getUTCMonth() + 1}-${value.getUTCDate()}`;
	}
	if (typeof value === "object") {
		const v = value as { toISODate?: () => string; isLuxonDateTime?: boolean };
		if (typeof v.toISODate === "function") return v.toISODate();
	}
	if (Array.isArray(value) && value.length) return toDateString(value[0]);
	return null;
}

export function parseDate(value: unknown, cal: Calendar): ChronDate | null {
	const raw = toDateString(value);
	if (!raw) return null;
	// "8,000" → "8000" (digit grouping, not a list).
	let s = raw.replace(/^\[\[|\]\]$/g, "").replace(/(\d),(?=\d{3}\b)/g, "$1").trim();
	let approx = false;
	let qualifier: ChronDate["qualifier"];

	if (APPROX_PREFIX.test(s)) {
		approx = true;
		s = s.replace(APPROX_PREFIX, "");
	}
	if (/\?$/.test(s)) {
		approx = true;
		s = s.replace(/\?+$/, "").trim();
	}
	if (BEFORE_PREFIX.test(s)) {
		qualifier = "before";
		approx = true;
		s = s.replace(BEFORE_PREFIX, "");
	} else if (AFTER_PREFIX.test(s)) {
		qualifier = "after";
		approx = true;
		s = s.replace(AFTER_PREFIX, "");
	}
	s = s.replace(BETWEEN_PREFIX, "");

	const pieces = s.split(RANGE_SPLIT).filter((p) => p.trim());
	if (pieces.length === 2) {
		const a = parseSingle(pieces[0], cal);
		// "1240..45" style shorthand is not supported; both sides must be complete dates.
		const b = parseSingle(pieces[1], cal);
		if (a && b) {
			return {
				start: Math.min(a.start, b.start),
				end: Math.max(a.end, b.end),
				precision: "range",
				approx,
				calendar: cal.id,
				raw,
			};
		}
	}

	const single = parseSingle(s, cal);
	if (!single) return null;
	let { start, end } = single;
	if (qualifier === "before") end = start;
	if (qualifier === "after") start = end;
	return { start, end, precision: single.precision, approx, qualifier, calendar: cal.id, raw };
}

const SPAN_SPLIT = /^(.*?)\s*(?:\s-\s?|\s?-\s|–|—|\s+to\s+|\.\.)\s*(.*)$/i;
const UNKNOWN = /^(\?+|unknown|present|now|ongoing|living|alive|-+)?$/i;

/**
 * Parses a span such as "1262 - 1294 C.E.", "394 C.E. -", "~1200 - ???" or "FE 790 to SE 40".
 * A trailing era applies to both ends ("1262 - 1294 C.E."), and an empty or "???" side is open.
 */
export function parseSpan(value: unknown, cal: Calendar): { start?: ChronDate; end?: ChronDate; ok: boolean } {
	const raw = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
	if (!raw) return { ok: false };
	const m = raw.match(SPAN_SPLIT);
	if (!m) {
		const d = parseDate(raw, cal);
		return d ? { start: d, ok: true } : { ok: false };
	}
	let [left, right] = [m[1].trim(), m[2].trim()];
	const { era: rightEra } = splitEra(right, cal);
	if (rightEra && left && !splitEra(left, cal).era && !UNKNOWN.test(left)) left = `${left} ${rightEra}`;
	const start = UNKNOWN.test(left) ? undefined : parseDate(left, cal) ?? undefined;
	const end = UNKNOWN.test(right) ? undefined : parseDate(right, cal) ?? undefined;
	const ok = (!!start || UNKNOWN.test(left)) && (!!end || UNKNOWN.test(right)) && !!(start || end);
	return { start, end, ok };
}

export function formatDay(days: number, cal: Calendar, precision: Precision = "day"): string {
	const { y, m, d } = cal.fromDays(days);
	const year = cal.formatYear(y);
	if (precision === "year" || precision === "range") return year;
	const month = cal.monthNames[m - 1] ?? String(m);
	if (precision === "month") return `${month} ${year}`;
	return `${d} ${month} ${year}`;
}

export function formatDate(date: ChronDate | undefined, cal: Calendar): string {
	if (!date) return "";
	let text: string;
	if (date.precision === "range") {
		const a = cal.formatYear(cal.fromDays(date.start).y);
		const b = cal.formatYear(cal.fromDays(date.end).y);
		text = a === b ? a : `${a}–${b}`;
	} else {
		text = formatDay(date.start, cal, date.precision);
	}
	if (date.qualifier) return `${date.qualifier} ${text}`;
	return date.approx ? `c. ${text}` : text;
}

export function formatSpan(start: ChronDate | undefined, end: ChronDate | undefined, cal: Calendar): string {
	if (start && end) return `${formatDate(start, cal)} – ${formatDate(end, cal)}`;
	if (start) return formatDate(start, cal);
	if (end) return `? – ${formatDate(end, cal)}`;
	return "";
}

/** Whole calendar years between two universal days. */
export function yearsBetween(a: number, b: number, cal: Calendar): number {
	const x = cal.fromDays(a);
	const y = cal.fromDays(b);
	let years = y.y - x.y;
	if (y.m < x.m || (y.m === x.m && y.d < x.d)) years--;
	return years;
}

export function yearOf(days: number, cal: Calendar): number {
	return cal.fromDays(days).y;
}
