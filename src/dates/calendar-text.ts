/**
 * Calendar parts written as plain lines in the settings, read back into a calendar definition:
 *
 *   Months:    Highsun = 30        Midfeast = 1, festival
 *   Leap days: Midfeast = every 4, except 100, unless 400
 *   Moons:     Selûne = 30.4 days, offset 3, #cfd8ff
 *   Seasons:   Spring = Thawmoon 1, #6abf69
 *   Holidays:  Lantern Night = Highsun 15, every 2, #e8b33a
 *
 * No Obsidian here, so it's testable.
 */
import type { CalendarDef, CalendarMonth, HolidayDef, LeapRule, MoonDef, SeasonDef } from "../types";

const lines = (text: string) => text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#") && !l.startsWith("//"));
const split = (l: string): [string, string] => {
	const i = l.indexOf("=");
	return i < 0 ? [l.trim(), ""] : [l.slice(0, i).trim(), l.slice(i + 1).trim()];
};
const color = (s: string) => s.match(/#[0-9a-f]{3,8}\b/i)?.[0];
const num = (s: string, word: string) => {
	const m = s.match(new RegExp(`${word}\\s*:?\\s*(-?\\d+(?:\\.\\d+)?)`, "i"));
	return m ? Number(m[1]) : undefined;
};

/** A month by name (or number) in a list of months, 1-based; 0 when unknown. */
export function monthIndex(months: CalendarMonth[] | string[], name: string): number {
	const names = months.map((m) => (typeof m === "string" ? m : m.name).toLowerCase());
	const n = name.trim().toLowerCase();
	if (/^\d+$/.test(n)) return Math.min(Math.max(1, +n), names.length);
	const i = names.indexOf(n);
	return i >= 0 ? i + 1 : names.findIndex((x) => x.startsWith(n)) + 1;
}

/** "Thawmoon 1" or "1 Thawmoon" → month and day. */
function monthDay(months: CalendarMonth[], s: string): { month: number; day: number } | null {
	const clean = s.replace(/#[0-9a-f]{3,8}\b/i, "").split(",")[0].trim();
	const a = clean.match(/^(.+?)\s+(\d+)$/);
	const b = clean.match(/^(\d+)\s+(.+)$/);
	const [name, day] = a ? [a[1], +a[2]] : b ? [b[2], +b[1]] : [clean, 1];
	const month = monthIndex(months, name);
	return month ? { month, day: Math.max(1, day) } : null;
}

export function parseMonths(text: string): CalendarMonth[] {
	return lines(text).map((l) => {
		const [name, rest] = split(l);
		const days = parseInt(rest) || 30;
		return { name, days: Math.max(1, days), ...(/festival|intercalary|outside/i.test(rest) ? { intercalary: true } : {}) };
	});
}

export function formatMonths(months: CalendarMonth[]): string {
	return months.map((m) => `${m.name} = ${m.days}${m.intercalary ? ", festival" : ""}`).join("\n");
}

export function parseLeaps(text: string, months: CalendarMonth[]): LeapRule[] {
	const out: LeapRule[] = [];
	for (const l of lines(text)) {
		const [name, rest] = split(l);
		const month = monthIndex(months, name);
		const every = num(rest, "every");
		if (!month || !every) continue;
		const r: LeapRule = { month, every };
		const except = num(rest, "except");
		const unless = num(rest, "unless") ?? num(rest, "but");
		const offset = num(rest, "offset");
		const days = num(rest, "days");
		if (except) r.except = except;
		if (unless) r.unless = unless;
		if (offset) r.offset = offset;
		if (days && days !== 1) r.days = days;
		out.push(r);
	}
	return out;
}

export function formatLeaps(rules: LeapRule[], months: CalendarMonth[]): string {
	return rules.map((r) => [`${months[r.month - 1]?.name ?? r.month} = every ${r.every}`, r.except ? `except ${r.except}` : "", r.unless ? `unless ${r.unless}` : "", r.offset ? `offset ${r.offset}` : "", r.days && r.days !== 1 ? `days ${r.days}` : ""].filter(Boolean).join(", ")).join("\n");
}

export function parseMoons(text: string): MoonDef[] {
	const out: MoonDef[] = [];
	for (const l of lines(text)) {
		const [name, rest] = split(l);
		const cycle = Number(rest.match(/^(\d+(?:\.\d+)?)/)?.[1] ?? num(rest, "cycle"));
		if (!name || !(cycle > 0)) continue;
		const c = color(rest);
		out.push({ name, cycle, offset: num(rest, "offset") ?? 0, ...(c ? { color: c } : {}) });
	}
	return out;
}

export function formatMoons(moons: MoonDef[]): string {
	return moons.map((m) => `${m.name} = ${m.cycle} days${m.offset ? `, offset ${m.offset}` : ""}${m.color ? `, ${m.color}` : ""}`).join("\n");
}

export function parseSeasons(text: string, months: CalendarMonth[]): SeasonDef[] {
	const out: SeasonDef[] = [];
	for (const l of lines(text)) {
		const [name, rest] = split(l);
		const md = monthDay(months, rest);
		if (!name || !md) continue;
		const c = color(rest);
		out.push({ name, ...md, ...(c ? { color: c } : {}) });
	}
	return out;
}

export function formatSeasons(seasons: SeasonDef[], months: CalendarMonth[]): string {
	return seasons.map((s) => `${s.name} = ${months[s.month - 1]?.name ?? s.month} ${s.day}${s.color ? `, ${s.color}` : ""}`).join("\n");
}

export function parseHolidays(text: string, months: CalendarMonth[]): HolidayDef[] {
	const out: HolidayDef[] = [];
	for (const l of lines(text)) {
		const [name, rest] = split(l);
		const md = monthDay(months, rest);
		if (!name || !md) continue;
		const every = num(rest, "every");
		const c = color(rest);
		out.push({ name, ...md, ...(every && every > 1 ? { every } : {}), ...(c ? { color: c } : {}) });
	}
	return out;
}

export function formatHolidays(hs: HolidayDef[], months: CalendarMonth[]): string {
	return hs.map((h) => `${h.name} = ${months[h.month - 1]?.name ?? h.month} ${h.day}${h.every ? `, every ${h.every}` : ""}${h.color ? `, ${h.color}` : ""}`).join("\n");
}

/** Starting points for a new calendar (generic shapes, not anyone's published setting). */
export const CALENDAR_PRESETS: { id: string; name: string; make: () => Omit<CalendarDef, "id" | "name"> }[] = [
	{
		id: "twelve-thirty",
		name: "Twelve months of 30 days, 7-day weeks",
		make: () => ({
			months: Array.from({ length: 12 }, (_, i) => ({ name: `Month ${i + 1}`, days: 30 })),
			weekdays: ["Firstday", "Seconday", "Thirdday", "Fourthday", "Fifthday", "Sixthday", "Restday"],
			eras: [], epoch: 0, moons: [{ name: "Moon", cycle: 30, offset: 0 }],
			seasons: [{ name: "Spring", month: 3, day: 1 }, { name: "Summer", month: 6, day: 1 }, { name: "Autumn", month: 9, day: 1 }, { name: "Winter", month: 12, day: 1 }],
		}),
	},
	{
		id: "festival-year",
		name: "Twelve months of 30 days with five festival days between seasons",
		make: () => ({
			months: [
				{ name: "Deepwinter", days: 30 }, { name: "Thaw", days: 30 }, { name: "Seedtime", days: 30 }, { name: "Springfeast", days: 1, intercalary: true },
				{ name: "Greening", days: 30 }, { name: "Highsun", days: 30 }, { name: "Longday", days: 30 }, { name: "Midsummer", days: 1, intercalary: true },
				{ name: "Harvest", days: 30 }, { name: "Leaffall", days: 30 }, { name: "Mists", days: 30 }, { name: "Gathering", days: 1, intercalary: true },
				{ name: "Frost", days: 30 }, { name: "Longnight", days: 30 }, { name: "Yearsend", days: 30 }, { name: "Turning", days: 2, intercalary: true },
			],
			leaps: [{ month: 16, every: 4 }],
			weekdays: ["Moonday", "Tideday", "Wakeday", "Thornday", "Fireday", "Starday", "Sunday"],
			eras: [], epoch: 0,
			moons: [{ name: "Moon", cycle: 29.5, offset: 0 }],
			seasons: [{ name: "Winter", month: 1, day: 1 }, { name: "Spring", month: 3, day: 1 }, { name: "Summer", month: 6, day: 1 }, { name: "Autumn", month: 10, day: 1 }],
			holidays: [{ name: "Midsummer feast", month: 8, day: 1 }],
		}),
	},
	{
		id: "thirteen",
		name: "Thirteen months of 28 days and a year day",
		make: () => ({
			months: [...Array.from({ length: 13 }, (_, i) => ({ name: `Month ${i + 1}`, days: 28 })), { name: "Year Day", days: 1, intercalary: true }],
			leaps: [{ month: 14, every: 4, except: 100, unless: 400 }],
			weekdays: ["Day 1", "Day 2", "Day 3", "Day 4", "Day 5", "Day 6", "Day 7"],
			eras: [], epoch: 0, moons: [{ name: "Moon", cycle: 28, offset: 0 }],
		}),
	},
	{
		id: "gregorian-like",
		name: "Earth-like: twelve months with leap years",
		make: () => ({
			months: [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31].map((days, i) => ({ name: `Month ${i + 1}`, days })),
			leaps: [{ month: 2, every: 4, except: 100, unless: 400 }],
			weekdays: ["Day 1", "Day 2", "Day 3", "Day 4", "Day 5", "Day 6", "Day 7"],
			eras: [], epoch: 0, moons: [{ name: "Moon", cycle: 29.530588853, offset: 0 }],
		}),
	},
];
