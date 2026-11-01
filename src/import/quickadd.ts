import type { EntityType } from "../types";

/**
 * Turns a one-line description into a note:
 * "Battle of Thornwood, SE 22, at Thornwood, Aldric Vane vs Mira Thorne"
 * "Tamsin Vane, born SE 3, daughter of Aldric Vane and Mira Thorne, #knight"
 * "Order of the Ash, founded SE 12, led by Aldric Vane"
 */
export interface QuickAdd {
	name: string;
	type: EntityType;
	date?: string;
	end?: string;
	places: string[];
	participants: string[];
	cultures: string[];
	parents: string[];
	leaders: string[];
	tags: string[];
	kind?: string;
	summary?: string;
	/** Parts that weren't understood (shown so the user can fix them). */
	unknown: string[];
}

export interface QuickAddContext {
	/** A known note with this name, and its type. */
	find(name: string): { name: string; type: EntityType } | undefined;
	isDate(text: string): boolean;
}

const EVENT_WORDS = /\b(battle|siege|war|treaty|coronation|founding|foundation|death|birth|marriage|wedding|fall|sack|rebellion|revolt|council|massacre|raid|discovery|election|uprising|invasion|duel|accord|pact|plague|festival|voyage|expedition|crowning|burning|flood|eruption)\b/i;
const CULTURE_WORDS = /^(house|order|kingdom|empire|guild|clan|church|tribe|company|league|republic|realm|dynasty|faith|cult|brotherhood|sisterhood|council of)\b/i;
const PLACE_WORDS = /\b(city|town|village|keep|castle|fort|fortress|tower|abbey|temple|port|harbou?r|bridge|forest|wood|mountain|river|lake|island|isle|valley|pass|hold|citadel)\b/i;
const TYPE_PREFIX = /^(event|person|character|culture|group|faction|place|location|map)\s*:\s*/i;
const TYPE_OF: Record<string, EntityType> = { event: "event", person: "person", character: "person", culture: "culture", group: "culture", faction: "culture", place: "place", location: "place", map: "map" };

const names = (s: string) => s.split(/\s*(?:,|\band\b|&|\+)\s*/i).map((x) => x.replace(/^\[\[|\]\]$/g, "").trim()).filter(Boolean);

export function parseQuickAdd(text: string, ctx: QuickAddContext): QuickAdd {
	const out: QuickAdd = { name: "", type: "event", places: [], participants: [], cultures: [], parents: [], leaders: [], tags: [], unknown: [] };
	// Commas inside [[links]] aren't separators.
	const parts = text.split(/,(?![^[]*\]\])/).map((s) => s.trim()).filter(Boolean);
	if (!parts.length) return out;
	let first = parts.shift()!;
	let explicitType: EntityType | undefined;
	const prefix = first.match(TYPE_PREFIX);
	if (prefix) {
		explicitType = TYPE_OF[prefix[1].toLowerCase()];
		first = first.slice(prefix[0].length);
	}
	// Tags written in the name part.
	first = first.replace(/\s#([\w/-]+)/g, (_, t: string) => {
		out.tags.push(t);
		return "";
	}).trim();
	out.name = first.replace(/^\[\[|\]\]$/g, "");
	let personHints = 0;

	const sortName = (n: string) => {
		const known = ctx.find(n);
		if (known?.type === "culture") out.cultures.push(known.name);
		else if (known?.type === "place") out.places.push(known.name);
		else out.participants.push(known?.name ?? n);
	};

	for (const raw of parts) {
		const p = raw.trim();
		let m: RegExpMatchArray | null;
		if (p.startsWith("#")) out.tags.push(...p.split(/\s+/).map((t) => t.replace(/^#/, "")).filter(Boolean));
		else if ((m = p.match(/^(?:kind|type)\s*:\s*(.+)$/i))) {
			const v = m[1].trim().toLowerCase();
			if (TYPE_OF[v]) explicitType = TYPE_OF[v];
			else out.kind = v;
		} else if ((m = p.match(/^(?:summary|about|note)\s*:\s*(.+)$/i))) out.summary = m[1].trim();
		else if ((m = p.match(/^(?:born|b\.)\s+(.+)$/i))) {
			out.date = m[1].trim();
			personHints += 2;
		} else if ((m = p.match(/^(?:died|d\.)\s+(.+)$/i))) {
			out.end = m[1].trim();
			personHints += 2;
		} else if ((m = p.match(/^(?:founded|established|formed)\s+(.+)$/i))) {
			out.date = m[1].trim();
			if (!explicitType) explicitType = PLACE_WORDS.test(out.name) ? "place" : "culture";
		} else if ((m = p.match(/^(?:dissolved|fell|ended|until|to)\s+(.+)$/i)) && ctx.isDate(m[1])) out.end = m[1].trim();
		else if ((m = p.match(/^(?:son|daughter|child|heir)\s+of\s+(.+)$/i))) {
			out.parents.push(...names(m[1]).map((n) => ctx.find(n)?.name ?? n));
			personHints += 2;
		} else if ((m = p.match(/^(?:led|ruled|headed|founded)\s+by\s+(.+)$/i))) {
			out.leaders.push(...names(m[1]).map((n) => ctx.find(n)?.name ?? n));
			if (!explicitType) explicitType = "culture";
		} else if ((m = p.match(/^(?:member|knight|servant|citizen)s?\s+of\s+(.+)$/i))) out.cultures.push(...names(m[1]).map((n) => ctx.find(n)?.name ?? n));
		else if ((m = p.match(/^(?:of|from)\s+(.+)$/i)) && !ctx.isDate(m[1])) {
			// "of House Whitmore": a group; "from Los Angeles County": a place.
			for (const n of names(m[1])) {
				const known = ctx.find(n);
				if (known?.type === "place") out.places.push(known.name);
				else out.cultures.push(known?.name ?? n);
			}
		} else if ((m = p.match(/^(?:at|in|near|on|outside|inside|within)\s+(.+)$/i))) {
			if (ctx.isDate(m[1])) out.date ??= m[1].trim();
			else out.places.push(...names(m[1]).map((n) => ctx.find(n)?.name ?? n));
		} else if (/\b(?:vs\.?|versus|against)\b/i.test(p)) {
			for (const side of p.split(/\s+(?:vs\.?|versus|against)\s+/i)) names(side).forEach(sortName);
		} else if ((m = p.match(/^(?:with|by|featuring|between)\s+(.+)$/i))) names(m[1]).forEach(sortName);
		else if ((m = p.match(/^(?:for|under)\s+(.+)$/i))) out.cultures.push(...names(m[1]).map((n) => ctx.find(n)?.name ?? n));
		else if (ctx.isDate(p)) {
			if (!out.date) out.date = p;
			else out.end ??= p;
		} else if (ctx.find(p)) sortName(p);
		else out.unknown.push(p);
	}

	// "Battle of Thornwood": a known place after "of" is where it happened.
	const of = out.name.match(/\b(?:of|at)\s+(.+)$/i);
	if (of && ctx.find(of[1])?.type === "place" && !out.places.includes(ctx.find(of[1])!.name)) out.places.push(ctx.find(of[1])!.name);

	if (explicitType) out.type = explicitType;
	else if (personHints >= 2 && !EVENT_WORDS.test(out.name)) out.type = "person";
	else if (CULTURE_WORDS.test(out.name)) out.type = "culture";
	else if (EVENT_WORDS.test(out.name) || out.participants.length || out.date) out.type = "event";
	else if (PLACE_WORDS.test(out.name)) out.type = "place";
	return out;
}

/** The properties a parsed quick-add line becomes. */
export function quickAddFrontmatter(q: QuickAdd, link = (n: string) => `[[${n}]]`): Record<string, unknown> {
	const fm: Record<string, unknown> = {};
	const list = (xs: string[]) => [...new Set(xs)].map(link);
	if (q.kind) fm.kind = q.kind;
	switch (q.type) {
		case "event":
			if (q.date) fm.date = q.date;
			if (q.end) fm.end = q.end;
			if (q.participants.length) fm.participants = list(q.participants);
			if (q.places.length) fm.places = list(q.places);
			if (q.cultures.length) fm.cultures = list(q.cultures);
			break;
		case "person":
			if (q.date) fm.born = q.date;
			if (q.end) fm.died = q.end;
			if (q.parents.length) fm.parents = list(q.parents);
			if (q.cultures.length) fm.cultures = list(q.cultures);
			if (q.places.length) fm.places = list(q.places);
			break;
		case "culture":
			if (q.date) fm.founded = q.date;
			if (q.end) fm.dissolved = q.end;
			if (q.places.length) fm.places = list(q.places);
			if (q.leaders.length) fm.leader = list(q.leaders);
			break;
		case "place":
			if (q.date) fm.founded = q.date;
			if (q.end) fm.dissolved = q.end;
			if (q.places.length) fm["located-in"] = link(q.places[0]);
			if (q.cultures.length) fm.cultures = list(q.cultures);
			break;
	}
	if (q.summary) fm.summary = q.summary;
	if (q.tags.length) fm.tags = [...new Set(q.tags)];
	return fm;
}
