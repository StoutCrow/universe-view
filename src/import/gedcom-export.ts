import type { ChronDate, Entity, TimedRef } from "../types";
import type { Calendar } from "../dates/calendars";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** What the exporter needs from the index (kept small so it can be tested without Obsidian). */
export interface GedcomSource {
	people: Entity[];
	get(key: string): Entity | undefined;
	partners(key: string): TimedRef[];
	calendar(id: string): Calendar;
}

/**
 * A GEDCOM date: "14 AUG 1485", "ABT 1480", "BEF MAY 1500", "BET 1240 AND 1245". Dates in a
 * fictional calendar can't be converted, so they're kept as a date phrase: "(14 Highsun SE 3)".
 */
export function gedcomDate(d: ChronDate | undefined, cal: Calendar): string | undefined {
	if (!d) return undefined;
	if (cal.id !== "gregorian") return `(${d.raw.replace(/[()]/g, "")})`;
	const one = (day: number, precision: ChronDate["precision"]) => {
		const { y, m, d: dd } = cal.fromDays(day);
		const year = y <= 0 ? `${1 - y} B.C.` : String(y);
		if (precision === "day") return `${dd} ${MONTHS[m - 1]} ${year}`;
		if (precision === "month") return `${MONTHS[m - 1]} ${year}`;
		return year;
	};
	if (d.precision === "range") return `BET ${one(d.start, "year")} AND ${one(d.end, "year")}`;
	const base = one(d.start, d.precision);
	if (d.qualifier === "before") return `BEF ${base}`;
	if (d.qualifier === "after") return `AFT ${base}`;
	return d.approx ? `ABT ${base}` : base;
}

/** "Henry VIII" → "Henry VIII"; with `surname:`/`given:` properties → "Given /Surname/". */
function gedcomName(p: Entity): string {
	const str = (k: string) => (typeof p.props[k] === "string" ? (p.props[k]).trim() : undefined);
	const surname = str("surname") ?? str("last_name") ?? str("last-name") ?? str("family_name");
	const given = str("given") ?? str("given_name") ?? str("first_name") ?? str("first-name");
	if (surname) return `${given ?? p.name.replace(new RegExp(`\\s*${surname}$`), "")} /${surname}/`.trim();
	return p.name;
}

/** People (and their families) as a GEDCOM 5.5.1 file, ready for Ancestry, FamilySearch or Gramps. */
export function buildGedcom(src: GedcomSource, today = new Date()): string {
	const people = src.people.filter((p) => p.type === "person");
	const ids = new Map(people.map((p, i) => [p.key, `@I${i + 1}@`]));
	const lines: string[] = [];
	const add = (level: number, tag: string, value?: string) => lines.push(`${level} ${tag}${value ? " " + value.replace(/\r?\n/g, " ") : ""}`);

	add(0, "HEAD");
	add(1, "SOUR", "UNIVERSEVIEW");
	add(2, "NAME", "UniverseView for Obsidian");
	add(1, "DATE", `${today.getDate()} ${MONTHS[today.getMonth()]} ${today.getFullYear()}`);
	add(1, "GEDC");
	add(2, "VERS", "5.5.1");
	add(2, "FORM", "LINEAGE-LINKED");
	add(1, "CHAR", "UTF-8");

	// Families: one per couple (parents of children, or partners), keyed by the sorted pair.
	interface Fam { id: string; a?: string; b?: string; children: string[]; married?: ChronDate; calendar?: string; ended?: ChronDate }
	const fams = new Map<string, Fam>();
	const famFor = (x?: string, y?: string): Fam => {
		const pair = [x, y].filter((k): k is string => !!k && ids.has(k)).sort();
		const key = pair.join("|") || "?";
		let f = fams.get(key);
		if (!f) fams.set(key, (f = { id: `@F${fams.size + 1}@`, a: pair[0], b: pair[1], children: [] }));
		return f;
	};
	for (const p of people) {
		const parents = p.parents.map((r) => r.key).filter((k) => ids.has(k));
		if (parents.length) famFor(parents[0], parents[1]).children.push(p.key);
		for (const partner of src.partners(p.key)) {
			if (!ids.has(partner.ref.key) || partner.ref.key < p.key) continue;
			const f = famFor(p.key, partner.ref.key);
			f.married ??= partner.from;
			f.ended ??= partner.to;
			f.calendar = p.calendar;
		}
	}
	const famsOf = new Map<string, Fam[]>();
	const childOf = new Map<string, Fam>();
	for (const f of fams.values()) {
		for (const k of [f.a, f.b]) if (k) famsOf.set(k, [...(famsOf.get(k) ?? []), f]);
		for (const c of f.children) childOf.set(c, f);
	}

	for (const p of people) {
		const cal = src.calendar(p.calendar);
		add(0, `${ids.get(p.key)} INDI`);
		add(1, "NAME", gedcomName(p));
		if (p.gender === "male" || p.gender === "m") add(1, "SEX", "M");
		else if (p.gender === "female" || p.gender === "f") add(1, "SEX", "F");
		const event = (tag: string, date?: ChronDate, place?: string) => {
			if (!date && !place) return;
			add(1, tag);
			const d = gedcomDate(date, cal);
			if (d) add(2, "DATE", d);
			if (place) add(2, "PLAC", place);
		};
		event("BIRT", p.start, p.birthPlace?.name);
		event("DEAT", p.end, p.deathPlace?.name);
		for (const c of p.cultures) if (c.role) add(1, "TITL", `${c.role}, ${c.ref.name}`);
		if (p.summary) add(1, "NOTE", p.summary);
		const f = childOf.get(p.key);
		if (f) add(1, "FAMC", f.id);
		for (const fam of famsOf.get(p.key) ?? []) add(1, "FAMS", fam.id);
	}

	for (const f of fams.values()) {
		add(0, `${f.id} FAM`);
		const members = [f.a, f.b].filter((k): k is string => !!k).map((k) => src.get(k)!);
		const husband = members.find((m) => m.gender === "male" || m.gender === "m") ?? members.find((m) => !(m.gender === "female" || m.gender === "f"));
		const wife = members.find((m) => m !== husband);
		if (husband) add(1, "HUSB", ids.get(husband.key));
		if (wife) add(1, "WIFE", ids.get(wife.key));
		if (f.married) {
			add(1, "MARR");
			const d = gedcomDate(f.married, src.calendar(f.calendar ?? f.married.calendar));
			if (d) add(2, "DATE", d);
		}
		for (const c of f.children) add(1, "CHIL", ids.get(c));
	}
	add(0, "TRLR");
	return lines.join("\n") + "\n";
}
