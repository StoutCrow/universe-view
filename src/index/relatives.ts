/** Adding relatives by name: pure helpers, so they're testable. No notes are made; names become links. */
import { PARENT_KINDS, PARTNER_KINDS, parseDetails, splitDetails } from "./ties";

/** Names from typed text: one per line (or split by ";"), links unwrapped, blanks and repeats dropped. */
export function parseNames(text: string): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const raw of text.split(/[\n;]+/)) {
		const name = raw.replace(/^\s*[-*]\s+/, "").replace(/^\[\[|\]\]$/g, "").split("|")[0].trim();
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		out.push(name);
	}
	return out;
}

/**
 * Puts `links` (like "[[Anna]]") into a list property of `front`: the first spelling in `aliases` the note
 * already uses, else `fallback`. Links already there aren't added twice. Returns how many were added.
 */
export function addLinks(front: Record<string, unknown>, aliases: string[], fallback: string, links: string[]): number {
	const key = aliases.find((a) => a in front && front[a] !== null && front[a] !== undefined && front[a] !== "") ?? fallback;
	const current = front[key];
	const list: unknown[] = Array.isArray(current) ? [...(current as unknown[])] : current ? [current] : [];
	const has = (link: string) => list.some((x) => (typeof x === "string" ? x : JSON.stringify(x)).toLowerCase().includes(link.toLowerCase()));
	let added = 0;
	for (const link of links) {
		if (has(link)) continue;
		list.push(link);
		added++;
	}
	if (added) front[key] = list;
	return added;
}

// ---- Relatives of relatives: families written as lines on one note ----------------------------------------
//
// A relative with no note of their own cannot carry `parents:` or `children:`, so a note keeps a `relatives:`
// list for them, one family to a line:
//
//     Bob + Mary > Carol, Dan     Bob and Mary are partners, and the parents of Carol and Dan
//     Carol + Eric > Frank        Carol (who has no note) and Eric, parents of Frank
//     Gwen + Hal                  partners, no children yet
//
// "+" joins partners, ">" leads to their children (commas or semicolons between them). A name matching a note
// in the vault is that person; any other name is a relative with no note yet.

export interface KinPerson {
	name: string;
	gender?: "female" | "male";
	/** Dates as written ("1230 – 1290"). */
	span?: string;
	/** Custom text, shown as written. */
	label?: string;
}

export interface KinEdges {
	/** [parent, child, kind] triples: the kind is how the parent is one (step, foster…), when the line says. */
	parentOf: [string, string, string?][];
	/** Partner pairs, with the kind of tie (spouse, betrothed…) when the line says. */
	partners: [string, string, string?][];
	/** What the lines say about each person: gender, dates and custom text, by lower-case name. */
	people: Map<string, KinPerson>;
}

/** The lines of a `relatives:` property, whatever shape the note gave it (a list, or one text with line breaks). */
export function kinLines(value: unknown): string[] {
	const items = Array.isArray(value) ? value : value === undefined || value === null || value === "" ? [] : [value];
	return items.flatMap((v) => String(v).split("\n")).map((l) => l.trim()).filter(Boolean);
}

/** One name in a line, as written (`raw`), with the name alone and what its brackets say. */
interface Item {
	raw: string;
	name: string;
	kind?: string;
	person: KinPerson;
}

/** "Carol (f, 1230 – 1290)" → the name, and its gender, dates and text; a kind word (spouse, step) is the tie's. */
function item(raw: string, kinds: readonly string[]): Item | undefined {
	const { name, inside } = splitDetails(raw);
	if (!name) return undefined;
	const d = inside ? parseDetails(inside, kinds) : undefined;
	return { raw: raw.trim(), name, kind: d?.kind, person: { name, gender: d?.gender, span: d?.span, label: d?.label } };
}

const KIN_KINDS: readonly string[] = [...PARTNER_KINDS, ...PARENT_KINDS];

/** Splits `A + B > C, D` (links and brackets allowed on every name). */
function parseLine(line: string): { left: Item[]; kids: Item[] } {
	const cut = line.indexOf(">");
	const list = (s: string, sep: RegExp) => s.split(sep).map((x) => item(x, KIN_KINDS)).filter((x): x is Item => !!x);
	return { left: list(cut < 0 ? line : line.slice(0, cut), /\+/), kids: cut < 0 ? [] : list(line.slice(cut + 1), /[,;](?![^()]*\))/) };
}

/** Everyone the lines say something about, and how they are tied. */
export function parseKin(value: unknown): KinEdges {
	const out: KinEdges = { parentOf: [], partners: [], people: new Map() };
	const note = (it: Item) => {
		const had = out.people.get(it.name.toLowerCase());
		const p = it.person;
		if (!had || p.gender || p.span || p.label) out.people.set(it.name.toLowerCase(), { name: it.name, gender: p.gender ?? had?.gender, span: p.span ?? had?.span, label: p.label ?? had?.label });
	};
	for (const line of kinLines(value)) {
		const { left, kids } = parseLine(line);
		left.concat(kids).forEach(note);
		// A kind word after a partner ("Bob + Mary (spouse)") is how the two are tied.
		const tie = left.slice(1).find((x) => x.kind && (PARTNER_KINDS as readonly string[]).includes(x.kind))?.kind;
		for (let i = 0; i < left.length; i++) for (let j = i + 1; j < left.length; j++) out.partners.push(tie ? [left[i].name, left[j].name, tie] : [left[i].name, left[j].name]);
		for (const p of left) for (const c of kids) out.parentOf.push(c.kind && (PARENT_KINDS as readonly string[]).includes(c.kind) ? [p.name, c.name, c.kind] : [p.name, c.name]);
	}
	return out;
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Adds `children` under `parents` (one or two names): to the line already written for those parents, else as a new
 * line. A child may carry details ("Carol (f, 1230)"). Returns how many children were new.
 */
export function addKinChildren(lines: string[], parents: string[], children: string[]): number {
	const known = new Set(parseKin(lines).parentOf.filter(([p]) => parents.some((x) => same(x, p))).map(([, c]) => c.toLowerCase()));
	const fresh = children.filter((c) => !known.has(splitDetails(c).name.toLowerCase()));
	if (!fresh.length) return 0;
	const at = lines.findIndex((l) => {
		const s = parseLine(l);
		return s.left.length === parents.length && s.left.every((n) => parents.some((x) => same(x, n.name))) && l.includes(">");
	});
	if (at >= 0) lines[at] = `${lines[at].replace(/\s+$/, "")}, ${fresh.join(", ")}`;
	else lines.push(`${parents.join(" + ")} > ${fresh.join(", ")}`);
	return fresh.length;
}

/** Ties two people as partners, unless a line already does. `kind` (spouse…) is written after the second name. Returns 1 when it was new. */
export function addKinPartner(lines: string[], a: string, b: string, kind?: string): number {
	const nameB = splitDetails(b).name;
	if (lines.some((l) => {
		const s = parseLine(l).left;
		return s.some((n) => same(n.name, a)) && s.some((n) => same(n.name, nameB));
	})) return 0;
	lines.push(`${a} + ${kind && !/\(/.test(b) ? `${b} (${kind})` : b}`);
	return 1;
}

/**
 * Takes a name out of the family lines: out of the partners and parents before ">" and out of the children after it.
 * A line left with nobody to say anything about goes; one left with a lone parent and children stays. What the
 * other names say about themselves (their brackets) is kept.
 */
export function forgetKin(lines: string[], name: string): string[] {
	const out: string[] = [];
	for (const line of lines) {
		const { left, kids } = parseLine(line);
		const left2 = left.filter((n) => !same(n.name, name));
		const kids2 = kids.filter((n) => !same(n.name, name));
		if (left2.length === left.length && kids2.length === kids.length) {
			out.push(line);
			continue;
		}
		if (!kids2.length && left2.length < 2) continue;
		if (!left2.length) continue;
		const l = left2.map((n) => n.raw).join(" + ");
		out.push(kids2.length ? `${l} > ${kids2.map((n) => n.raw).join(", ")}` : l);
	}
	return out;
}