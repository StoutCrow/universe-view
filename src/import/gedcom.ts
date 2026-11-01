/** Minimal GEDCOM 5.5 reader: individuals, families, and their key events. */

interface GNode {
	tag: string;
	value: string;
	xref?: string;
	children: GNode[];
}

export interface GedPerson {
	id: string;
	name: string;
	gender?: string;
	born?: string;
	died?: string;
	birthPlace?: string;
	deathPlace?: string;
	famc: string[];
	fams: string[];
}

export interface GedFamily {
	id: string;
	husband?: string;
	wife?: string;
	children: string[];
	married?: string;
	marriagePlace?: string;
	divorced?: string;
}

export interface GedData {
	people: Map<string, GedPerson>;
	families: Map<string, GedFamily>;
}

function parseTree(text: string): GNode[] {
	const roots: GNode[] = [];
	const stack: GNode[] = [];
	for (const raw of text.split(/\r?\n/)) {
		const line = raw.replace(/^﻿/, "").trim();
		if (!line) continue;
		const m = line.match(/^(\d+)\s+(?:(@[^@]+@)\s+)?(\S+)(?:\s(.*))?$/);
		if (!m) continue;
		const level = +m[1];
		const node: GNode = { tag: m[3].toUpperCase(), value: m[4] ?? "", xref: m[2], children: [] };
		stack.length = level;
		if (level === 0) roots.push(node);
		else {
			const parent = stack[level - 1];
			if (!parent) continue;
			if (node.tag === "CONC") parent.value += node.value;
			else if (node.tag === "CONT") parent.value += "\n" + node.value;
			else parent.children.push(node);
		}
		stack[level] = node;
	}
	return roots;
}

const child = (n: GNode, tag: string) => n.children.find((c) => c.tag === tag);
const children = (n: GNode, tag: string) => n.children.filter((c) => c.tag === tag);

const MONTHS: Record<string, number> = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };

function simpleDate(s: string): string | null {
	s = s.trim().toUpperCase().replace(/\s+/g, " ");
	const bc = /\b(B\.?C\.?|BCE)$/.test(s);
	s = s.replace(/\s*\(?(B\.?C\.?|BCE)\)?$/, "").trim();
	let m = s.match(/^(\d{1,2}) ([A-Z]{3}) (\d{1,4})(?:\/\d+)?$/);
	let out: string | null = null;
	if (m && MONTHS[m[2]]) out = `${m[3]}-${String(MONTHS[m[2]]).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
	else if ((m = s.match(/^([A-Z]{3}) (\d{1,4})$/)) && MONTHS[m[1]]) out = `${m[2]}-${String(MONTHS[m[1]]).padStart(2, "0")}`;
	else if ((m = s.match(/^(\d{1,4})(?:\/\d+)?$/))) out = m[1];
	if (!out) return null;
	return bc ? `${out} BCE` : out;
}

/** Converts a GEDCOM date phrase into UniverseView's date syntax. */
export function convertGedcomDate(raw: string | undefined): string | undefined {
	if (!raw) return undefined;
	const s = raw.trim().toUpperCase().replace(/^@#DGREGORIAN@\s*/, "");
	let m = s.match(/^(?:BET|FROM)\s+(.+?)\s+(?:AND|TO)\s+(.+)$/);
	if (m) {
		const a = simpleDate(m[1]);
		const b = simpleDate(m[2]);
		return a && b ? `${a}..${b}` : undefined;
	}
	m = s.match(/^(ABT|ABOUT|CAL|EST|CIRCA|C)\.?\s+(.+)$/);
	if (m) {
		const d = simpleDate(m[2]);
		return d ? `c. ${d}` : undefined;
	}
	m = s.match(/^(BEF|AFT|TO|FROM)\.?\s+(.+)$/);
	if (m) {
		const d = simpleDate(m[2]);
		const q = m[1] === "BEF" || m[1] === "TO" ? "before" : "after";
		return d ? `${q} ${d}` : undefined;
	}
	return simpleDate(s) ?? undefined;
}

function cleanName(raw: string): string {
	return raw.replace(/\//g, " ").replace(/\s+/g, " ").trim() || "Unknown";
}

export function parseGedcom(text: string): GedData {
	const people = new Map<string, GedPerson>();
	const families = new Map<string, GedFamily>();
	for (const rec of parseTree(text)) {
		if (rec.tag === "INDI" && rec.xref) {
			const birt = child(rec, "BIRT") ?? child(rec, "BAPM") ?? child(rec, "CHR");
			const deat = child(rec, "DEAT") ?? child(rec, "BURI");
			const sex = child(rec, "SEX")?.value.trim().toUpperCase();
			people.set(rec.xref, {
				id: rec.xref,
				name: cleanName(child(rec, "NAME")?.value ?? ""),
				gender: sex === "M" ? "male" : sex === "F" ? "female" : undefined,
				born: convertGedcomDate(birt && child(birt, "DATE")?.value),
				died: convertGedcomDate(deat && child(deat, "DATE")?.value),
				birthPlace: birt && child(birt, "PLAC")?.value.trim(),
				deathPlace: deat && child(deat, "PLAC")?.value.trim(),
				famc: children(rec, "FAMC").map((c) => c.value.trim()),
				fams: children(rec, "FAMS").map((c) => c.value.trim()),
			});
		} else if (rec.tag === "FAM" && rec.xref) {
			const marr = child(rec, "MARR");
			const div = child(rec, "DIV");
			families.set(rec.xref, {
				id: rec.xref,
				husband: child(rec, "HUSB")?.value.trim(),
				wife: child(rec, "WIFE")?.value.trim(),
				children: children(rec, "CHIL").map((c) => c.value.trim()),
				married: convertGedcomDate(marr && child(marr, "DATE")?.value),
				marriagePlace: marr && child(marr, "PLAC")?.value.trim(),
				divorced: div ? convertGedcomDate(child(div, "DATE")?.value) ?? "unknown" : undefined,
			});
		}
	}
	return { people, families };
}
