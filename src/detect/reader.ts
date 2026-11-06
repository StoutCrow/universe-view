import { splitSpan } from "../index/text";

/**
 * Smart Reader: facts written in a note's text that its properties don't have yet. "Born in 1240 at
 * [[Greyford]]", "worked as a blacksmith", "[[Alice]] (b. 1200)". Dates are whatever the note's own
 * calendar can read. It only suggests: nothing is written until the findings are reviewed.
 */

export type ReadField = "born" | "died" | "birthPlace" | "deathPlace" | "occupation" | "date" | "founded";

export interface Finding {
	field: ReadField;
	value: string;
	/** The sentence it came from. */
	quote: string;
	/** Another note's name, when the fact is about someone else ("[[Alice]] was born in 1200"). */
	about?: string;
}

export interface ReadContext {
	name: string;
	type: string;
	/** Whether a note (this one, or another by name) already has this. */
	has: (field: ReadField, about?: string) => boolean;
	isDate: (text: string) => boolean;
	/** The note a name means, if it's a place or a person. */
	place: (name: string) => string | undefined;
	person: (name: string) => string | undefined;
}

const OCCUPATIONS = "blacksmith|smith|farmer|merchant|trader|sailor|soldier|knight|squire|scholar|priest|priestess|monk|nun|bishop|abbot|cleric|physician|healer|herbalist|apothecary|scribe|clerk|lawyer|judge|teacher|tutor|mage|wizard|sorcerer|sorceress|alchemist|bard|minstrel|musician|poet|writer|author|painter|sculptor|mason|carpenter|tailor|weaver|baker|brewer|innkeeper|cook|hunter|fisherman|miner|shipwright|captain|general|admiral|commander|mercenary|assassin|thief|spy|diplomat|ambassador|engineer|architect|cartographer|astronomer|historian|librarian|banker|doctor|nurse|steward|courtier";

/** Someone else's life, not the note's: "her father was born…". */
const KIN = /\b(father|mother|son|daughter|wife|husband|brother|sister|uncle|aunt|cousin|grandfather|grandmother|nephew|niece|children|child|heir|successor|predecessor)\b/i;
const STARTS_ABOUT_NOTE = /^(he|she|they|his|her|their|it|this|the|born|died|later|after|in|on|during|at|by|as|while|when|following)$/i;
const STOP_WORD = /(^|\s)(and|but|then|who|which|to|of|was|were|had|after|before|when|where|while|with)(\s|$)/i;
const NOT_ABBREVIATION = /(^|[\s(])(c|ca|b|d|fl|st|mr|mrs|dr|sir|[A-Z](\.[A-Z])*)$/i;

/** A note's prose: no properties, code, headings, tables, embeds or formatting, with links as plain [[Name]]. */
export function cleanBody(md: string): string[] {
	const text = md.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "").replace(/```[\s\S]*?```/g, "").replace(/%%[\s\S]*?%%/g, "");
	return text
		.split(/\r?\n/)
		.filter((l) => l.trim() && !/^\s*(#|\||!\[\[)/.test(l))
		.map((l) => l.replace(/^\s*((>|[-*+]|\d+\.)\s+)+/, "").replace(/\*+|(^|\s)_+|_+(\s|$)/g, "$1$2").replace(/\[\[([^\]|#]+)[^\]]*\]\]/g, "[[$1]]").trim());
}

/** A line's sentences, not fooled by "c. 1240", "1262 C.E." or "St. John". */
export function sentencesOf(line: string): string[] {
	const out: string[] = [];
	let from = 0;
	for (const m of line.matchAll(/[.!?]["”)]?\s+/g)) {
		const before = line.slice(from, m.index);
		if (m[0][0] === "." && NOT_ABBREVIATION.test(before)) continue;
		out.push(line.slice(from, m.index + m[0].trimEnd().length));
		from = m.index + m[0].length;
	}
	if (from < line.length) out.push(line.slice(from));
	return out;
}

/** Who a sentence is about: "" for this note, a name for someone else, undefined when it can't be told. */
function subjectOf(s: string, ctx: ReadContext): string | undefined {
	const t = s.trim();
	const first = /^\[\[([^\]]+)\]\]/.exec(t)?.[1] ?? /^[A-Z][\w'’-]*(?:\s+(?:[A-Z][\w'’-]*|of|the|de|von))*/.exec(t)?.[0];
	if (!first) return "";
	if (STARTS_ABOUT_NOTE.test(first.split(/\s+/)[0])) return "";
	const own = ctx.name.toLowerCase();
	if (own.includes(first.toLowerCase()) || first.toLowerCase().includes(own)) return "";
	const other = ctx.person(first);
	return other && other !== ctx.name ? other : undefined;
}

/** The first date in some text, the longest reading that holds. */
function dateIn(text: string, ctx: ReadContext): string | undefined {
	const words = text.trim().split(/\s+/).slice(0, 10);
	for (let start = 0; start < words.length; start++) {
		for (let len = Math.min(5, words.length - start); len >= 1; len--) {
			const raw = words.slice(start, start + len).join(" ").replace(/[,;:)]+$/, "");
			if (!/\d/.test(raw) || STOP_WORD.test(raw)) continue;
			for (const cand of [raw, raw.replace(/\.$/, "")]) if (ctx.isDate(cand)) return cand;
		}
	}
	return undefined;
}

/** "in [[Greyford]]" or "at Greyford", when that's a place the vault knows. */
function placeIn(text: string, ctx: ReadContext): string | undefined {
	for (const m of text.slice(0, 80).matchAll(/\b(?:in|at|near)\s+(?:\[\[([^\]]+)\]\]|([A-Z][\w'’-]*(?:\s+[A-Z][\w'’-]*)*))/g)) {
		const known = ctx.place(m[1] ?? m[2]);
		if (known) return `[[${known}]]`;
	}
	return undefined;
}

/** "(1240 – 1301)", "(b. 1240)", "(d. 1301)" as what they say. */
function lifeIn(text: string, ctx: ReadContext): { born?: string; died?: string } {
	const onlyDeath = /^\s*(d\.|died)/i.test(text);
	const onlyBirth = /^\s*(b\.|born)/i.test(text);
	const [a, b] = splitSpan(text.replace(/\b(b\.|born|d\.|died)\s*/gi, ""));
	const ok = (d: string) => (d && /\d/.test(d) && ctx.isDate(d) ? d : undefined);
	if (onlyDeath && !b) return { died: ok(a) };
	if (onlyBirth && !b) return { born: ok(a) };
	return b ? { born: ok(a), died: ok(b) } : {};
}

export function readNote(md: string, ctx: ReadContext): Finding[] {
	const out: Finding[] = [];
	const seen = new Set<string>();
	const add = (field: ReadField, value: string | undefined, quote: string, about?: string) => {
		const id = `${about ?? ""}|${field}`;
		if (!value || seen.has(id) || ctx.has(field, about)) return;
		seen.add(id);
		out.push({ field, value, quote: quote.trim(), ...(about ? { about } : {}) });
	};
	const person = ctx.type === "person";
	let opening = true;
	for (const line of cleanBody(md)) {
		for (const s of sentencesOf(line)) {
			// People with their dates beside them, anywhere: "[[Alice]] (b. 1200)".
			for (const m of s.matchAll(/\[\[([^\]]+)\]\]\s*\(([^()]{3,40})\)/g)) {
				const who = ctx.person(m[1]);
				if (!who) continue;
				const life = lifeIn(m[2], ctx);
				const about = who === ctx.name ? undefined : who;
				add("born", life.born, s, about);
				add("died", life.died, s, about);
			}
			const subject = subjectOf(s, ctx);
			// "Aldric Vane (1240 – 1301) was…" opens a person's note.
			if (person && opening && subject === "") {
				const m = /^[^(]{0,60}\(([^()]{3,40})\)/.exec(s);
				if (m) {
					const life = lifeIn(m[1], ctx);
					add("born", life.born, s);
					add("died", life.died, s);
				}
			}
			opening = false;
			if (subject === undefined) continue;
			const about = subject || undefined;
			if (person || about) {
				for (const [field, placeField, word] of [["born", "birthPlace", /\bborn\b/i], ["died", "deathPlace", /\b(died|passed away|was killed|was slain|was executed|perished)\b/i]] as const) {
					const m = word.exec(s);
					if (!m || KIN.test(s.slice(0, m.index))) continue;
					const rest = s.slice(m.index + m[0].length);
					add(field, dateIn(rest, ctx), s, about);
					add(placeField, placeIn(rest, ctx), s, about);
				}
			}
			if (person && !about && !KIN.test(s)) {
				const job = /\b(?:worked|served|works|serves|trained|apprenticed)\s+as\s+(?:an?\s+|the\s+)?([a-z][a-z' -]{2,30}?)(?=\s+(?:in|of|at|for|to|under|and|until|before|after)\b|[,.;]|$)/.exec(s)?.[1]
					?? new RegExp(`\\b(?:is|was|became)\\s+(?:an?|the)\\s+(?:(?!of\\b|to\\b|in\\b|at\\b|for\\b|with\\b|and\\b|who\\b)[a-z-]+\\s+){0,3}?(${OCCUPATIONS})\\b`, "i").exec(s)?.[1];
				add("occupation", job?.toLowerCase(), s);
			}
			if (ctx.type === "event" && !about) {
				const m = /\b(took place|occurred|happened|was fought|was signed|was held|began|started)\b/i.exec(s) ?? /^(?:in|on)\s/i.exec(s);
				if (m) add("date", dateIn(s.slice(m.index), ctx), s);
			}
			if ((ctx.type === "place" || ctx.type === "culture") && !about) {
				const m = /\b(founded|established|built|settled)\b/i.exec(s);
				if (m) add("founded", dateIn(s.slice(m.index + m[0].length), ctx), s);
			}
		}
	}
	return out;
}
