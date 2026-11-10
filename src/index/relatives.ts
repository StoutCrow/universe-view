/** Adding relatives by name: pure helpers, so they're testable. No notes are made; names become links. */

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

export interface KinEdges {
	/** [parent, child] pairs. */
	parentOf: [string, string][];
	/** Partner pairs. */
	partners: [string, string][];
}

/** The lines of a `relatives:` property, whatever shape the note gave it (a list, or one text with line breaks). */
export function kinLines(value: unknown): string[] {
	const items = Array.isArray(value) ? value : value === undefined || value === null || value === "" ? [] : [value];
	return items.flatMap((v) => String(v).split("\n")).map((l) => l.trim()).filter(Boolean);
}

const bare = (s: string) => s.replace(/^\s*[-*]\s+/, "").replace(/\[\[([^\]|]*)(?:\|[^\]]*)?\]\]/g, "$1").trim();

/** Everyone the lines say something about, and how they are tied. */
export function parseKin(value: unknown): KinEdges {
	const out: KinEdges = { parentOf: [], partners: [] };
	for (const line of kinLines(value)) {
		const cut = line.indexOf(">");
		const left = (cut < 0 ? line : line.slice(0, cut)).split("+").map(bare).filter(Boolean);
		const kids = cut < 0 ? [] : line.slice(cut + 1).split(/[,;]/).map(bare).filter(Boolean);
		for (let i = 0; i < left.length; i++) for (let j = i + 1; j < left.length; j++) out.partners.push([left[i], left[j]]);
		for (const p of left) for (const c of kids) out.parentOf.push([p, c]);
	}
	return out;
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const sides = (line: string) => {
	const cut = line.indexOf(">");
	return { left: (cut < 0 ? line : line.slice(0, cut)).split("+").map(bare).filter(Boolean), kids: cut < 0 ? [] : line.slice(cut + 1).split(/[,;]/).map(bare).filter(Boolean) };
};

/**
 * Adds `children` under `parents` (one or two names): to the line already written for those parents, else as a new
 * line. Returns how many children were new.
 */
export function addKinChildren(lines: string[], parents: string[], children: string[]): number {
	const known = new Set(parseKin(lines).parentOf.filter(([p]) => parents.some((x) => same(x, p))).map(([, c]) => c.toLowerCase()));
	const fresh = children.filter((c) => !known.has(c.toLowerCase()));
	if (!fresh.length) return 0;
	const at = lines.findIndex((l) => {
		const s = sides(l);
		return s.left.length === parents.length && s.left.every((n) => parents.some((x) => same(x, n))) && l.includes(">");
	});
	if (at >= 0) lines[at] = `${lines[at].replace(/\s+$/, "")}, ${fresh.join(", ")}`;
	else lines.push(`${parents.join(" + ")} > ${fresh.join(", ")}`);
	return fresh.length;
}

/** Ties two people as partners, unless a line already does. Returns 1 when it was new. */
export function addKinPartner(lines: string[], a: string, b: string): number {
	if (lines.some((l) => {
		const s = sides(l).left;
		return s.some((n) => same(n, a)) && s.some((n) => same(n, b));
	})) return 0;
	lines.push(`${a} + ${b}`);
	return 1;
}

/**
 * Takes a name out of the family lines: out of the partners and parents before ">" and out of the children after it.
 * A line left with nobody to say anything about goes; one left with a lone parent and children stays.
 */
export function forgetKin(lines: string[], name: string): string[] {
	const out: string[] = [];
	for (const line of lines) {
		const { left, kids } = sides(line);
		const left2 = left.filter((n) => !same(n, name));
		const kids2 = kids.filter((n) => !same(n, name));
		if (left2.length === left.length && kids2.length === kids.length) {
			out.push(line);
			continue;
		}
		if (!kids2.length && left2.length < 2) continue;
		if (!left2.length) continue;
		out.push(kids2.length ? `${left2.join(" + ")} > ${kids2.join(", ")}` : left2.join(" + "));
	}
	return out;
}
