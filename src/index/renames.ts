import type { Entity, NameSpan } from "../types";
import type { Calendar } from "../dates/calendars";
import { parseDate, parseSpan } from "../dates/parser";
import { asText, splitSpan } from "./text";

const isNameMap = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v) && !("name" in v);

/** `names:` as rows of text for the editor, whichever way it's written. */
export function nameRows(value: unknown): Record<string, string>[] {
	if (isNameMap(value)) return Object.entries(value).map(([from, name]) => ({ name: asText(name), from, to: "" }));
	return ([] as unknown[]).concat(value ?? []).flatMap((item) => {
		if (item && typeof item === "object") {
			const o = item as Record<string, unknown>;
			return [{ name: asText(o.name), from: asText(o.from ?? o.since ?? o.start), to: asText(o.to ?? o.until ?? o.end) }];
		}
		const s = asText(item).replace(/^\[\[|\]\]$/g, "").trim();
		const span = /^(.+?)\s*\(([^)]+)\)\s*$/.exec(s);
		if (span) {
			const [from, to] = splitSpan(span[2]);
			return [{ name: span[1], from, to }];
		}
		const word = /^(.+?)\s*[:,]?\s+(from|since|until|to)\s+(.+)$/i.exec(s);
		if (word) return [/^(from|since)$/i.test(word[2]) ? { name: word[1], from: word[3], to: "" } : { name: word[1], from: "", to: word[3] }];
		return s ? [{ name: s, from: "", to: "" }] : [];
	});
}

/** Rows back to `names:`, in the shortest form they fit. */
export function writeNames(rows: Record<string, string>[]): unknown {
	const froms = rows.map((r) => r.from?.trim());
	if (rows.length > 1 && froms.every(Boolean) && new Set(froms).size === rows.length && rows.every((r) => !r.to?.trim())) {
		return Object.fromEntries(rows.map((r) => [r.from.trim(), r.name.trim()]));
	}
	return rows.map((r) => {
		const name = r.name.trim(), from = r.from?.trim(), to = r.to?.trim();
		if (from && to) return `${name} (${from} – ${to})`;
		if (from) return `${name}: from ${from}`;
		return to ? `${name} until ${to}` : name;
	});
}

/**
 * Names over time, from `names:` (or `former-names:`, `renamed:`):
 *
 *   names:
 *     - name: New Amsterdam
 *       to: 1663
 *     - name: New York
 *       from: 1664
 *
 * or one line each: "New Amsterdam (1625 – 1663)", "New York: from 1664"; or, each until the next:
 *
 *   names:
 *     1625: New Amsterdam
 *     1664: New York
 */
export function readNames(value: unknown, cal: Calendar): NameSpan[] | undefined {
	if (value === undefined || value === null || value === "") return undefined;
	const out: NameSpan[] = [];
	const date = (v: unknown) => (v === undefined || v === null || v === "" ? undefined : parseDate(v, cal) ?? undefined);
	if (isNameMap(value)) {
		for (const [from, name] of Object.entries(value)) if (typeof name === "string" && name.trim()) out.push({ name: name.trim(), from: date(from) });
		out.sort((a, b) => (a.from?.start ?? -Infinity) - (b.from?.start ?? -Infinity));
		out.forEach((n, i) => (n.to = out[i + 1]?.from));
		return out.length ? out : undefined;
	}
	for (const item of Array.isArray(value) ? value : [value]) {
		if (item && typeof item === "object") {
			const o = item as Record<string, unknown>;
			const name = typeof o.name === "string" ? o.name.trim() : "";
			if (!name) continue;
			out.push({ name, from: date(o.from ?? o.since ?? o.start), to: date(o.to ?? o.until ?? o.end) });
		} else if (typeof item === "string") {
			// "Name (1042 – 1199 C.E.)", "Name: from 1200", "Name until 1199".
			const s = item.replace(/^\[\[|\]\]$/g, "").trim();
			let m = /^(.+?)\s*\(([^)]+)\)\s*$/.exec(s);
			if (m) {
				const span = parseSpan(m[2], cal);
				out.push({ name: m[1].trim(), from: span?.start, to: span?.end });
				continue;
			}
			m = /^(.+?)\s*[:,]?\s+(from|since|until|to)\s+(.+)$/i.exec(s);
			if (m) {
				const d = date(m[3]);
				out.push(/^(from|since)$/i.test(m[2]) ? { name: m[1].trim(), from: d } : { name: m[1].trim(), to: d });
				continue;
			}
			out.push({ name: s });
		}
	}
	return out.length ? out.sort((a, b) => (a.from?.start ?? -Infinity) - (b.from?.start ?? -Infinity)) : undefined;
}

/** What it was called on a day: the name whose dates include it, else its note's name. */
export function nameAt(e: Entity, day: number | undefined): string {
	if (day === undefined || !e.names?.length) return e.name;
	const hit = e.names.find((n) => (!n.from || n.from.start <= day) && (!n.to || n.to.end >= day));
	return hit?.name ?? e.name;
}

/** The days a note changed its name: each named span's start, with the name it took. */
export function renamings(e: Entity): { day: number; name: string; before?: string }[] {
	const out: { day: number; name: string; before?: string }[] = [];
	const list = e.names ?? [];
	list.forEach((n, i) => {
		if (!n.from) return;
		const before = list.slice(0, i).reverse().find((x) => !x.to || x.to.end >= n.from!.start - 1)?.name ?? (i > 0 ? list[i - 1].name : undefined);
		out.push({ day: n.from.start, name: n.name, before });
	});
	// A last named span that ends: the note's own name takes over after it.
	const last = list[list.length - 1];
	if (last?.to && !list.some((x) => x.from && x.from.start > last.to!.end)) out.push({ day: last.to.end + 1, name: e.name, before: last.name });
	return out;
}
