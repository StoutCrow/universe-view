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
	/** Where a person lives by default. */
	residences?: string[];
	/** Where a journey, march or voyage set out from and where it ended. */
	startPlace?: string;
	endPlace?: string;
	/** Other names it goes by (`aliases:`). */
	aliases?: string[];
	/** Where a person died. */
	deathPlace?: string;
	partners?: string[];
	children?: string[];
	/** On an event: what led to it, and what it led to. */
	causes?: string[];
	effects?: string[];
	population?: string;
	terrain?: string;
	/** A colour for its pins, bars and cards ("#8844cc"). */
	color?: string;
	/** A picture from the vault (its file name). */
	image?: string;
	tags: string[];
	kind?: string;
	summary?: string;
	gender?: string;
	occupation?: string;
	birthPlace?: string;
	/** The war an event was part of. */
	war?: string;
	importance?: string;
	/** Parts that weren't understood (shown so the user can fix them). */
	unknown: string[];
}

export interface QuickAddContext {
	/** A known note with this name, and its type. */
	find(name: string): { name: string; type: EntityType } | undefined;
	isDate(text: string): boolean;
}

const EVENT_WORDS = /\b(battle|siege|war|treaty|coronation|founding|foundation|death|birth|marriage|wedding|fall|sack|rebellion|revolt|council|massacre|raid|discovery|election|uprising|invasion|duel|accord|pact|plague|festival|voyage|expedition|crowning|burning|flood|eruption)\b/i;
const CULTURE_WORDS = /^(house|order|kingdom|empire|guild|clan|church|tribe|company|league|republic|realm|dynasty|faith|cult|brotherhood|sisterhood|council of|federation|commonwealth|corporation|agency|ministry|department of|party|fleet)\b/i;
const PLACE_WORDS = /\b(city|town|village|keep|castle|fort|fortress|tower|abbey|temple|port|harbou?r|bridge|forest|wood|mountain|river|lake|island|isle|valley|pass|hold|citadel|station|spaceport|airport|base|colony|outpost|habitat|planet|moon)\b/i;
const TYPE_PREFIX = /^(event|person|character|culture|group|faction|place|location|map)\s*:\s*/i;
const TYPE_OF: Record<string, EntityType> = { event: "event", person: "person", character: "person", culture: "culture", group: "culture", faction: "culture", place: "place", location: "place", map: "map" };

const names = (s: string) => s.split(/\s*(?:,|\band\b|&|\+)\s*/i).map((x) => x.replace(/^\[\[|\]\]$/g, "").trim()).filter(Boolean);

export function parseQuickAdd(text: string, ctx: QuickAddContext): QuickAdd {
	const out: QuickAdd = { name: "", type: "event", places: [], participants: [], cultures: [], parents: [], leaders: [], residences: [], tags: [], unknown: [] };
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
		else if ((m = p.match(/^(?:aka|a\.k\.a\.?|also called|also known as|known as|alias)\s*:?\s+(.+)$/i))) (out.aliases ??= []).push(m[1].replace(/^\[\[|\]\]$/g, "").trim());
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

/** One thing the Quick creator asks. `key` is the fact it fills in. */
export interface CreatorField {
	key: keyof QuickAdd;
	label: string;
	/** words: a few short names, separated by commas. image: a file from the vault. color: a colour or none. */
	input: "date" | "text" | "links" | "link" | "choice" | "words" | "image" | "color" | "number";
	/** What a link can point at. */
	types?: EntityType[];
	options?: [string, string][];
	/** Tucked under "More about it" until asked for. */
	more?: boolean;
	/** Takes the whole row, even where the form has several columns. */
	wide?: boolean;
	/** A hint inside the empty box. */
	hint?: string;
}

const IMPORTANCE: [string, string][] = [["", "Normal"], ["5", "Key event"], ["4", "Major"], ["2", "Minor"], ["1", "Footnote"]];
const GENDER: [string, string][] = [["", "Not set"], ["female", "Female"], ["male", "Male"], ["other", "Other"]];

/** The important things to know when making each kind of note, most useful first. */
export const CREATOR_FIELDS: Record<EntityType, CreatorField[]> = {
	event: [
		{ key: "date", label: "Date", input: "date" },
		{ key: "end", label: "End", input: "date" },
		{ key: "kind", label: "Kind", input: "text" },
		{ key: "places", label: "Where", input: "links", types: ["place"] },
		{ key: "leaders", label: "Led by", input: "links", types: ["person"] },
		{ key: "participants", label: "Who", input: "links", types: ["person"] },
		{ key: "summary", label: "Summary", input: "text", wide: true },
		{ key: "startPlace", label: "Starts at", input: "link", types: ["place"], more: true },
		{ key: "endPlace", label: "Ends at", input: "link", types: ["place"], more: true },
		{ key: "cultures", label: "Groups", input: "links", types: ["culture"], more: true },
		{ key: "war", label: "Part of", input: "link", types: ["event"], more: true },
		{ key: "causes", label: "Caused by", input: "links", types: ["event"], more: true },
		{ key: "effects", label: "Led to", input: "links", types: ["event"], more: true },
		{ key: "importance", label: "Importance", input: "choice", options: IMPORTANCE, more: true },
		{ key: "aliases", label: "Also called", input: "words", hint: "Other names, separated by commas", more: true },
		{ key: "image", label: "Picture", input: "image", more: true },
		{ key: "color", label: "Colour", input: "color", more: true },
	],
	person: [
		{ key: "date", label: "Born", input: "date" },
		{ key: "end", label: "Died", input: "date" },
		{ key: "gender", label: "Gender", input: "choice", options: GENDER },
		{ key: "occupation", label: "Occupation", input: "text" },
		{ key: "parents", label: "Parents", input: "links", types: ["person"] },
		{ key: "cultures", label: "House and groups", input: "links", types: ["culture"] },
		{ key: "birthPlace", label: "Born at", input: "link", types: ["place"] },
		{ key: "summary", label: "Summary", input: "text", wide: true },
		{ key: "aliases", label: "Also called", input: "words", hint: "Other names, separated by commas", more: true },
		{ key: "deathPlace", label: "Died at", input: "link", types: ["place"], more: true },
		{ key: "residences", label: "Lives at", input: "links", types: ["place"], more: true },
		{ key: "partners", label: "Partners", input: "links", types: ["person"], more: true },
		{ key: "children", label: "Children", input: "links", types: ["person"], more: true },
		{ key: "image", label: "Portrait", input: "image", more: true },
		{ key: "color", label: "Colour", input: "color", more: true },
	],
	culture: [
		{ key: "date", label: "Founded", input: "date" },
		{ key: "end", label: "Dissolved", input: "date" },
		{ key: "leaders", label: "Led by", input: "links", types: ["person"] },
		{ key: "cultures", label: "Part of", input: "links", types: ["culture"] },
		{ key: "places", label: "Seat", input: "links", types: ["place"] },
		{ key: "summary", label: "Summary", input: "text", wide: true },
		{ key: "aliases", label: "Also called", input: "words", hint: "Other names, separated by commas", more: true },
		{ key: "image", label: "Logo or picture", input: "image", more: true },
		{ key: "color", label: "Colour", input: "color", more: true },
	],
	place: [
		{ key: "kind", label: "Kind", input: "text" },
		{ key: "places", label: "Located in", input: "link", types: ["place"] },
		{ key: "cultures", label: "Held by", input: "links", types: ["culture"] },
		{ key: "date", label: "Founded", input: "date" },
		{ key: "end", label: "Abandoned", input: "date" },
		{ key: "summary", label: "Summary", input: "text", wide: true },
		{ key: "aliases", label: "Also called", input: "words", hint: "Other names, separated by commas", more: true },
		{ key: "population", label: "Population", input: "number", more: true },
		{ key: "terrain", label: "Terrain", input: "text", hint: "Mountains, forest, marsh…", more: true },
		{ key: "image", label: "Picture", input: "image", more: true },
		{ key: "color", label: "Colour", input: "color", more: true },
	],
	map: [{ key: "summary", label: "Summary", input: "text", wide: true }],
};

/** A parsed line with what was set by hand in the form on top of it. */
export function withFields(q: QuickAdd, fields: Partial<Record<keyof QuickAdd, string | string[]>>): QuickAdd {
	return { ...q, ...fields } as QuickAdd;
}

/** Removes properties with nothing in them (blank, null, an empty list), so a note keeps only what was written. */
export function dropEmptyProperties(front: Record<string, unknown>) {
	for (const k of Object.keys(front)) {
		const v = front[k];
		if (v === null || v === undefined || (typeof v === "string" && !v.trim()) || (Array.isArray(v) && !v.some((x) => x !== null && x !== undefined && String(x).trim() !== ""))) delete front[k];
	}
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
			if (q.startPlace) fm["start-place"] = link(q.startPlace);
			if (q.endPlace) fm["end-place"] = link(q.endPlace);
			if (q.leaders.length) fm.lead = list(q.leaders);
			if (q.participants.length) fm.participants = list(q.participants);
			if (q.places.length) fm.places = list(q.places);
			if (q.cultures.length) fm.cultures = list(q.cultures);
			if (q.war) fm.war = link(q.war);
			if (q.importance) fm.importance = Number(q.importance);
			if (q.causes?.length) fm["caused-by"] = list(q.causes);
			if (q.effects?.length) fm["led-to"] = list(q.effects);
			break;
		case "person":
			if (q.date) fm.born = q.date;
			if (q.end) fm.died = q.end;
			if (q.gender) fm.gender = q.gender;
			if (q.occupation) fm.occupation = q.occupation;
			if (q.birthPlace) fm.birthplace = link(q.birthPlace);
			if (q.deathPlace) fm.deathplace = link(q.deathPlace);
			if (q.residences?.length) fm.residences = list(q.residences);
			if (q.partners?.length) fm.partners = list(q.partners);
			if (q.children?.length) fm.children = list(q.children);
			if (q.parents.length) fm.parents = list(q.parents);
			if (q.cultures.length) fm.cultures = list(q.cultures);
			if (q.places.length) fm.places = list(q.places);
			break;
		case "culture":
			if (q.date) fm.founded = q.date;
			if (q.end) fm.dissolved = q.end;
			if (q.places.length) fm.places = list(q.places);
			if (q.leaders.length) fm.leader = list(q.leaders);
			if (q.cultures.length) fm["parent-cultures"] = list(q.cultures);
			break;
		case "place":
			if (q.date) fm.founded = q.date;
			if (q.end) fm.dissolved = q.end;
			if (q.places.length) fm["located-in"] = link(q.places[0]);
			if (q.cultures.length) fm.cultures = list(q.cultures);
			if (q.population && Number.isFinite(Number(q.population.replace(/[,_\s]/g, "")))) fm.population = Number(q.population.replace(/[,_\s]/g, ""));
			if (q.terrain) fm.terrain = q.terrain.trim().toLowerCase();
			break;
	}
	// What every note can have.
	if (q.aliases?.length) fm.aliases = [...new Set(q.aliases.map((a) => a.trim()).filter(Boolean))];
	if (q.color) fm.color = q.color;
	if (q.image) fm.image = link(q.image.replace(/^!?\[\[|\]\]$/g, ""));
	if (q.summary) fm.summary = q.summary;
	if (q.tags.length) fm.tags = [...new Set(q.tags)];
	return fm;
}
