import type { CalendarDef, HolidayDef, LeapRule, MoonDef, SeasonDef } from "../types";

export const GREGORIAN_ID = "gregorian";

export const GREGORIAN_MONTHS = [
	"January", "February", "March", "April", "May", "June",
	"July", "August", "September", "October", "November", "December",
];

export const GREGORIAN_WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** Days since 1970-01-01 for a proleptic Gregorian date (astronomical years: 0 = 1 BCE). */
export function daysFromCivil(y: number, m: number, d: number): number {
	y -= m <= 2 ? 1 : 0;
	const era = Math.floor(y / 400);
	const yoe = y - era * 400;
	const mp = (m + 9) % 12;
	const doy = Math.floor((153 * mp + 2) / 5) + d - 1;
	const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
	return era * 146097 + doe - 719468;
}

export function civilFromDays(z: number): { y: number; m: number; d: number } {
	z += 719468;
	const era = Math.floor(z / 146097);
	const doe = z - era * 146097;
	const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
	const y = yoe + era * 400;
	const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
	const mp = Math.floor((5 * doy + 2) / 153);
	const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
	const m = mp < 10 ? mp + 3 : mp - 9;
	return { y: m <= 2 ? y + 1 : y, m, d };
}

function isLeap(y: number): boolean {
	return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

const mod = (a: number, n: number) => ((a % n) + n) % n;

/** How far through its cycle a moon is on a day: 0 new, 0.25 first quarter, 0.5 full, 0.75 last quarter. */
export function moonPhase(days: number, moon: MoonDef): number {
	return moon.cycle > 0 ? mod((days - moon.offset) / moon.cycle, 1) : 0;
}

/** A name for a moon phase. */
export function phaseName(p: number): string {
	const names = ["New moon", "Waxing crescent", "First quarter", "Waxing gibbous", "Full moon", "Waning gibbous", "Last quarter", "Waning crescent"];
	return names[Math.round(p * 8) % 8];
}

/**
 * A calendar converts between (year, month, day) and universal days.
 * Gregorian years are astronomical internally; display converts to BCE.
 */
export interface Calendar {
	id: string;
	name: string;
	monthNames: string[];
	monthCount(year: number): number;
	monthDays(year: number, month: number): number;
	toDays(year: number, month: number, day: number): number;
	fromDays(days: number): { y: number; m: number; d: number };
	/** Parses a year token such as "1240", "-350", "350 BCE", "3E 412" into an internal year. */
	resolveYear(year: number, era?: string): number | null;
	formatYear(year: number): string;
	eraTokens(): string[];
	/** Absolute year just before the era containing `year` starts (0 when there are no eras). */
	eraOffset(year: number): number;
	/** Names of the days of the week; empty when the calendar has no weeks. */
	weekdays: string[];
	/** 0-based weekday of a day, or -1 on festival days outside the week (and in calendars without weeks). */
	weekdayOf(days: number): number;
	/** Festival months outside the weeks. */
	isIntercalary(year: number, month: number): boolean;
	isLeapYear(year: number): boolean;
	yearDays(year: number): number;
	/** Moons, with offsets as universal days. */
	moons: MoonDef[];
	seasons: SeasonDef[];
	holidays: HolidayDef[];
}

export class GregorianCalendar implements Calendar {
	id = GREGORIAN_ID;
	name = "Gregorian";
	monthNames = GREGORIAN_MONTHS;
	weekdays = GREGORIAN_WEEKDAYS;
	// A new moon on 6 January 2000 at 18:14 UTC, and the mean synodic month.
	moons: MoonDef[] = [{ name: "Moon", cycle: 29.530588853, offset: daysFromCivil(2000, 1, 6) + 0.76 }];
	seasons: SeasonDef[] = [
		{ name: "Spring", month: 3, day: 20, color: "#6abf69" },
		{ name: "Summer", month: 6, day: 21, color: "#f2b134" },
		{ name: "Autumn", month: 9, day: 22, color: "#d9733b" },
		{ name: "Winter", month: 12, day: 21, color: "#6aa7d8" },
	];
	holidays: HolidayDef[] = [];

	monthCount(): number {
		return 12;
	}
	monthDays(year: number, month: number): number {
		return [31, isLeap(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
	}
	toDays(year: number, month: number, day: number): number {
		return daysFromCivil(year, month, day);
	}
	fromDays(days: number) {
		return civilFromDays(Math.floor(days));
	}
	weekdayOf(days: number): number {
		// 1 January 1970 was a Thursday.
		return mod(Math.floor(days) + 3, 7);
	}
	isIntercalary(): boolean {
		return false;
	}
	isLeapYear(year: number): boolean {
		return isLeap(year);
	}
	yearDays(year: number): number {
		return isLeap(year) ? 366 : 365;
	}
	resolveYear(year: number, era?: string): number | null {
		const e = era?.toUpperCase().replace(/\./g, "");
		if (!e || e === "CE" || e === "AD") {
			// A bare negative year means "n BCE".
			return year < 0 ? year + 1 : year;
		}
		if (e === "BCE" || e === "BC") return 1 - Math.abs(year);
		return null;
	}
	formatYear(year: number): string {
		return year <= 0 ? `${1 - year} BCE` : String(year);
	}
	eraOffset(): number {
		return 0;
	}
	eraTokens(): string[] {
		return ["BCE", "BC", "CE", "AD", "B.C.", "A.D.", "B.C.E.", "C.E."];
	}
}

/**
 * A calendar of your own: named months (some can be festival days outside the weeks), leap days by
 * rule, weekdays, moons, seasons, holidays and eras.
 */
export class CustomCalendar implements Calendar {
	id: string;
	name: string;
	monthNames: string[];
	weekdays: string[];
	moons: MoonDef[];
	seasons: SeasonDef[];
	holidays: HolidayDef[];
	private def: CalendarDef;
	private baseLength: number;
	private leaps: LeapRule[];

	constructor(def: CalendarDef) {
		const months = def.months.length ? def.months : [{ name: "Month", days: 30 }];
		this.def = { ...def, months };
		this.id = def.id;
		this.name = def.name;
		this.monthNames = months.map((m) => m.name);
		this.baseLength = Math.max(1, months.reduce((a, m) => a + Math.max(1, m.days), 0));
		this.leaps = (def.leaps ?? []).filter((l) => l.every > 0 && l.month >= 1 && l.month <= months.length);
		this.weekdays = (def.weekdays ?? []).filter(Boolean);
		// Moons are written relative to year 1, day 1; keep them as universal days.
		this.moons = (def.moons ?? []).filter((m) => m.cycle > 0).map((m) => ({ ...m, offset: def.epoch + (m.offset ?? 0) }));
		this.seasons = def.seasons ?? [];
		this.holidays = def.holidays ?? [];
	}

	/** Whether a leap rule adds days in a year. */
	private applies(l: LeapRule, year: number): boolean {
		const k = year - (l.offset ?? 0);
		if (mod(k, l.every) !== 0) return false;
		if (l.except && mod(k, l.except) === 0) return !!(l.unless && mod(k, l.unless) === 0);
		return true;
	}

	/** Leap days a rule has added in years 1…n (negative for years before year 1). */
	private leapCount(l: LeapRule, n: number): number {
		const off = l.offset ?? 0;
		const f = (m: number) => Math.floor((n - off) / m) - Math.floor((0 - off) / m);
		let c = f(l.every);
		if (l.except) c -= f(l.except);
		if (l.except && l.unless) c += f(l.unless);
		return c * (l.days ?? 1);
	}

	/** Days from year 1, day 1 to the start of `year`; only festival months when `intercalary` is set. */
	private daysBeforeYear(year: number, intercalary = false): number {
		const months = this.def.months.map((m, i) => ({ m, i })).filter(({ m }) => !intercalary || m.intercalary);
		let total = (year - 1) * months.reduce((a, { m }) => a + Math.max(1, m.days), 0);
		for (const l of this.leaps) if (!intercalary || this.def.months[l.month - 1]?.intercalary) total += this.leapCount(l, year - 1);
		return total;
	}

	monthCount(): number {
		return this.def.months.length;
	}
	monthDays(year: number, month: number): number {
		const base = Math.max(1, this.def.months[month - 1]?.days ?? 30);
		let extra = 0;
		for (const l of this.leaps) if (l.month === month && this.applies(l, year)) extra += l.days ?? 1;
		return base + extra;
	}
	isLeapYear(year: number): boolean {
		return this.leaps.some((l) => this.applies(l, year));
	}
	yearDays(year: number): number {
		let n = 0;
		for (let m = 1; m <= this.def.months.length; m++) n += this.monthDays(year, m);
		return n;
	}
	isIntercalary(_year: number, month: number): boolean {
		return !!this.def.months[month - 1]?.intercalary;
	}
	toDays(year: number, month: number, day: number): number {
		const m = Math.min(Math.max(month, 1), this.def.months.length);
		let before = 0;
		for (let i = 1; i < m; i++) before += this.monthDays(year, i);
		return this.def.epoch + this.daysBeforeYear(year) + before + (day - 1);
	}
	fromDays(days: number) {
		const rel = Math.floor(days) - this.def.epoch;
		const avg = this.baseLength + this.leaps.reduce((a, l) => a + (l.days ?? 1) / l.every * (1 - (l.except ? 1 / l.except : 0) * (1 - (l.unless ? 1 / l.unless : 0))), 0);
		let y = Math.floor(rel / avg) + 1;
		while (this.daysBeforeYear(y) > rel) y--;
		while (this.daysBeforeYear(y + 1) <= rel) y++;
		let doy = rel - this.daysBeforeYear(y);
		let m = 1;
		for (; m < this.def.months.length; m++) {
			const len = this.monthDays(y, m);
			if (doy < len) break;
			doy -= len;
		}
		return { y, m, d: doy + 1 };
	}
	weekdayOf(days: number): number {
		const w = this.weekdays.length;
		if (!w) return -1;
		const { y, m } = this.fromDays(days);
		if (this.isIntercalary(y, m)) return -1;
		// Count only the days that belong to weeks.
		const rel = Math.floor(days) - this.def.epoch;
		let festival = this.daysBeforeYear(y, true);
		for (let i = 1; i < m; i++) if (this.isIntercalary(y, i)) festival += this.monthDays(y, i);
		return mod(rel - festival + (this.def.firstWeekday ?? 0), w);
	}
	resolveYear(year: number, era?: string): number | null {
		const name = era ?? this.def.defaultEra;
		if (!name) return year;
		const norm = (s: string) => s.toLowerCase().replace(/\./g, "").trim();
		const e = this.def.eras.find((x) => norm(x.abbr) === norm(name) || norm(x.name) === norm(name));
		if (!e) return era ? null : year;
		return e.startYear + year - 1;
	}
	formatYear(year: number): string {
		const eras = [...this.def.eras].sort((a, b) => b.startYear - a.startYear);
		const e = eras.find((x) => x.startYear <= year);
		if (!e) return String(year);
		const n = year - e.startYear + 1;
		return this.def.eraAfter ? `${n} ${e.abbr}` : `${e.abbr} ${n}`;
	}
	eraOffset(year: number): number {
		const e = [...this.def.eras].sort((a, b) => b.startYear - a.startYear).find((x) => x.startYear <= year);
		return e ? e.startYear - 1 : 0;
	}
	eraTokens(): string[] {
		// "C.E.", "CE" and "Common Era" all name the same era.
		return this.def.eras.flatMap((e) => [e.abbr, e.abbr.replace(/\./g, ""), e.name]).filter(Boolean);
	}
}

/** The season a day falls in (the last one to have started, wrapping round the year). */
export function seasonOf(cal: Calendar, days: number): SeasonDef | undefined {
	if (!cal.seasons.length) return undefined;
	const { y } = cal.fromDays(days);
	const starts = cal.seasons.map((s) => ({ s, d: cal.toDays(y, s.month, Math.min(s.day, cal.monthDays(y, s.month))) })).sort((a, b) => a.d - b.d);
	const before = starts.filter((x) => x.d <= days);
	return (before.length ? before[before.length - 1] : starts[starts.length - 1]).s;
}

/** Holidays falling on a day. */
export function holidaysOn(cal: Calendar, days: number): HolidayDef[] {
	if (!cal.holidays.length) return [];
	const { y, m, d } = cal.fromDays(days);
	return cal.holidays.filter((h) => h.month === m && Math.min(h.day, cal.monthDays(y, m)) === d && (!h.every || h.every <= 1 || mod(y, h.every) === 0));
}

/** One date in every calendar, for converting between them. */
export function convertDay(days: number, cals: Calendar[]): { cal: Calendar; y: number; m: number; d: number; weekday?: string }[] {
	return cals.map((cal) => {
		const { y, m, d } = cal.fromDays(days);
		const w = cal.weekdayOf(days);
		return { cal, y, m, d, weekday: w >= 0 ? cal.weekdays[w] : undefined };
	});
}

export class CalendarRegistry {
	private calendars = new Map<string, Calendar>();
	defaultId = GREGORIAN_ID;

	constructor(defs: CalendarDef[] = [], defaultId = GREGORIAN_ID) {
		this.load(defs, defaultId);
	}

	load(defs: CalendarDef[], defaultId: string) {
		this.calendars.clear();
		this.calendars.set(GREGORIAN_ID, new GregorianCalendar());
		for (const def of defs) {
			if (def.id && def.id !== GREGORIAN_ID) this.calendars.set(def.id, new CustomCalendar(def));
		}
		this.defaultId = this.calendars.has(defaultId) ? defaultId : GREGORIAN_ID;
	}

	get(id?: string): Calendar {
		return (id && this.calendars.get(id)) || this.calendars.get(this.defaultId)!;
	}

	has(id: string): boolean {
		return this.calendars.has(id);
	}

	all(): Calendar[] {
		return [...this.calendars.values()];
	}
}

/**
 * Year ticks at round numbers *within each era* ("SE 100", not absolute year 912),
 * with era starts always marked as major ticks.
 */
export function yearTicks(cal: Calendar, y0: number, y1: number, step: number, major: number): { year: number; major: boolean; era: boolean }[] {
	const out: { year: number; major: boolean; era: boolean }[] = [];
	if (y1 - y0 > 400000) return out;
	for (let y = Math.floor(y0); y <= y1 && out.length < 400; y++) {
		const eraYear = y - cal.eraOffset(y);
		const eraStart = cal.eraOffset(y) > 0 && eraYear === 1;
		if (eraStart || eraYear % step === 0) out.push({ year: y, major: eraStart || eraYear % major === 0, era: eraStart });
		// Jump ahead within the era instead of testing every single year.
		if (!eraStart && step > 1) {
			const next = y + step - (((eraYear % step) + step) % step);
			const nextEraStart = findNextEraStart(cal, y, next);
			y = Math.min(next, nextEraStart) - 1;
		}
	}
	return out;
}

/**
 * Which tick labels fit without overlapping (e.g. "FE 800" right next to "SE 1"): era starts win,
 * then major ticks, then the rest. Grid lines can still be drawn for every tick.
 */
export function spacedLabels<T extends { x: number; label: string; major?: boolean; era?: boolean }>(ticks: T[], charPx = 6.6, gap = 10): Set<T> {
	const rank = (t: T) => (t.era ? 2 : t.major ? 1 : 0);
	const kept: T[] = [];
	for (const t of [...ticks].sort((a, b) => rank(b) - rank(a) || a.x - b.x)) {
		const w = t.label.length * charPx;
		if (kept.every((k) => Math.abs(k.x - t.x) >= (w + k.label.length * charPx) / 2 + gap)) kept.push(t);
	}
	return new Set(kept);
}

function findNextEraStart(cal: Calendar, from: number, to: number): number {
	const base = cal.eraOffset(from);
	// Eras are rare; a coarse scan for a change in offset is enough.
	for (let y = from + 1; y <= to; y++) if (cal.eraOffset(y) !== base) return y;
	return to;
}
