/**
 * The ways a name is dressed for each kind of note ("Kingdom of {name}", "House {name}", "King {name}"), and reading
 * them back: a typed "Kingdom of England" is a realm called England; "King Henry I" is a person called Henry I, whose
 * full name takes the surname of their house. Pure, so it is testable.
 */

/** A heading and the forms under it, for one kind of note. */
export interface FormGroup {
	label: string;
	forms: string[];
}

/**
 * Ways of writing a name, per kind of note (the type, or "region", "realm", "house", "nationality", "language", "faith",
 * "organisation", "group"), sorted by what they do. A "The" in front of a society's name is a separate choice (see
 * `takesThe`), so the groups never hold a bare "The {name}".
 */
export const NAME_GROUPS: Record<string, FormGroup[]> = {
	event: [
		{ label: "Conflicts", forms: ["Battle of {name}", "War of {name}"] },
		{ label: "Turning points", forms: ["Founding of {name}", "Fall of {name}", "Treaty of {name}"] },
	],
	person: [
		{ label: "Titles before the name", forms: ["King {name}", "Queen {name}", "Lord {name}", "Lady {name}", "Dr. {name}"] },
		{ label: "Epithets after the name", forms: ["{name} the Great", "{name} the Elder", "{name} the Younger", "{name} Jr."] },
	],
	place: [
		{ label: "Before the name", forms: ["Port {name}", "Mount {name}", "Lake {name}", "River {name}"] },
		{ label: "After the name", forms: ["{name} City", "{name} Bay", "{name} Bridge"] },
	],
	region: [{ label: "Lands and waters", forms: ["The {name} Mountains", "{name} Forest", "{name} Sea", "Isle of {name}", "The {name}"] }],
	realm: [
		{ label: "Monarchies and empires", forms: ["Kingdom of {name}", "Empire of {name}", "The {name} Empire"] },
		{ label: "Republics and unions", forms: ["Republic of {name}", "Federation of {name}"] },
	],
	house: [{ label: "Families", forms: ["House {name}", "Clan {name}", "The {name} family", "{name} Dynasty"] }],
	nationality: [{ label: "A people", forms: ["The {name} people", "{name} folk"] }],
	language: [{ label: "A language", forms: ["{name} language", "Old {name}", "Common {name}"] }],
	faith: [{ label: "Faiths", forms: ["Church of {name}", "Faith of {name}", "The {name} Faith"] }],
	organisation: [{ label: "Organisations", forms: ["{name} Company", "{name} Guild", "Council of {name}", "Order of {name}"] }],
	group: [{ label: "Societies", forms: ["{name} Society", "League of {name}"] }],
	object: [{ label: "Things", forms: ["The {name}", "Great {name}", "Lost {name}", "Ancient {name}"] }],
	creature: [{ label: "Beasts", forms: ["The {name}", "Great {name}", "Elder {name}"] }],
	map: [{ label: "Maps", forms: ["Map of {name}", "{name} map"] }],
};

/** Every built-in form per kind, flat (the groups are only for showing them). */
export const NAME_FORMS: Record<string, string[]> = Object.fromEntries(Object.entries(NAME_GROUPS).map(([k, groups]) => [k, groups.flatMap((g) => g.forms)]));

/** The kinds of society, which can take a "The" in front of the whole name (The Kingdom of England, The Whitmores). */
const THE_KINDS = new Set(["realm", "house", "nationality", "language", "faith", "organisation", "group"]);
export const takesThe = (key: string) => THE_KINDS.has(key);

/** What a form puts before and after the name ("Kingdom of {name}" is "Kingdom of " and ""). */
export function formParts(form: string): { pre: string; post: string } {
	const [pre, post = ""] = form.split("{name}");
	return { pre, post };
}

/** Whether two forms want the same side of the name (two prefixes, or two suffixes) and so cannot both be ticked. */
export function formsClash(a: string, b: string): boolean {
	const x = formParts(a);
	const y = formParts(b);
	return (!!x.pre && !!y.pre) || (!!x.post && !!y.post);
}

/** Adds a form to the ticked ones, dropping any that want the same side: "King {name}" and "{name} the Great" go together, "King {name}" and "Lord {name}" do not. */
export function addForm(forms: string[], form: string): string[] {
	return [...forms.filter((f) => !formsClash(f, form)), form];
}

/** The name with every ticked form around it ("King" + "the Great" + Henry gives King Henry the Great). */
export function applyForms(forms: string[], base: string): string {
	return forms.map((f) => formParts(f).pre).join("") + base + forms.map((f) => formParts(f).post).join("");
}

/** A form written by hand: "…", "..." , "*" or "{name}" stands for the name ("Free City of …" gives "Free City of {name}"). Needs exactly one and some words around it. */
export function parseCustomForm(text: string): string | undefined {
	const t = text.trim().replace(/\{name\}|…|\.\.\.|\*/g, "{name}");
	if (t.split("{name}").length !== 2) return undefined;
	return t.replace("{name}", "").trim() ? t : undefined;
}

/** The type, and kind written on the note, that each key of NAME_FORMS stands for. */
export const FORM_TARGET: Record<string, { type: string; kind?: string; label: string }> = {
	event: { type: "event", label: "event" },
	person: { type: "person", label: "person" },
	place: { type: "place", label: "place" },
	region: { type: "place", kind: "region", label: "region" },
	realm: { type: "culture", kind: "realm", label: "realm" },
	house: { type: "culture", kind: "house", label: "house" },
	nationality: { type: "culture", kind: "nationality", label: "people" },
	language: { type: "culture", kind: "language", label: "language" },
	faith: { type: "culture", kind: "faith", label: "faith" },
	organisation: { type: "culture", kind: "organisation", label: "organisation" },
	group: { type: "culture", label: "society" },
	object: { type: "object", label: "object" },
	creature: { type: "creature", label: "creature" },
	map: { type: "map", label: "map" },
};

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A form that is only "The {name}" would match nearly anything; it is never read back on its own. */
const generic = (form: string) => form.replace("{name}", "").trim().toLowerCase() === "the";

/** The form a typed name is written in, and the plain name inside it ("Kingdom of England" gives "Kingdom of {name}" and "England"). */
export function matchForm(forms: string[], text: string): { form: string; base: string } | undefined {
	const t = text.trim();
	let best: { form: string; base: string; weight: number } | undefined;
	for (const form of forms) {
		if (generic(form)) continue;
		const [before, after] = form.split("{name}");
		const m = new RegExp(`^${escape(before)}(.+?)${escape(after ?? "")}$`, "i").exec(t);
		if (!m || !m[1].trim()) continue;
		const weight = (before + (after ?? "")).trim().length;
		if (!best || weight > best.weight) best = { form, base: m[1].trim(), weight };
	}
	return best && { form: best.form, base: best.base };
}

/** Which other kind of note a typed name reads as ("Kingdom of England" is a realm), skipping the kind already chosen. */
export function otherKindOf(text: string, current: string): { key: string; form: string; base: string } | undefined {
	for (const [key, forms] of Object.entries(NAME_FORMS)) {
		if (key === current) continue;
		const m = matchForm(forms, text);
		if (m) return { key, ...m };
	}
	return undefined;
}

const TITLES = /^(king|queen|lord|lady|sir|dame|saint|st\.?|captain|prince|princess|duke|duchess|count|countess|baron|baroness|emperor|empress|pope|archbishop|bishop|dr\.?|doctor|professor|prof\.?|general|admiral|commander|president|mr\.?|mrs\.?|ms\.?)\s+(.+)$/i;

/** A person's name written with a title ("King Henry I"): the title and the name after it. */
export function titleSplit(text: string): { title: string; rest: string } | undefined {
	const m = TITLES.exec(text.trim());
	return m ? { title: m[1], rest: m[2].trim() } : undefined;
}

export interface PersonName {
	title?: string;
	/** The name itself, without a regnal number or epithet ("Henry"). */
	given: string;
	/** A regnal number or generation ("I", "II", "3rd"). */
	numeral?: string;
	/** A suffix: "the Great", "of Whitmore", "Jr.". */
	epithet?: string;
}

const NUMERAL = /^(?:[IVXLC]+|\d+(?:st|nd|rd|th)?)$/i;

/** Takes a person's name apart: title, name, regnal number and epithet ("King Henry I the Bold" gives King, Henry, I, the Bold). */
export function splitPerson(text: string): PersonName {
	const t = titleSplit(text);
	let rest = (t?.rest ?? text).trim();
	let epithet: string | undefined;
	const e = /\s+(the\s+\S.*|of\s+\S.*|jr\.?|sr\.?)$/i.exec(rest);
	if (e) {
		epithet = e[1];
		rest = rest.slice(0, e.index).trim();
	}
	const words = rest.split(/\s+/);
	let numeral: string | undefined;
	if (words.length > 1 && NUMERAL.test(words[words.length - 1])) numeral = words.pop();
	return { title: t?.title, given: words.join(" "), numeral, epithet };
}

/** A person's name written out in full: name, number, surname, then epithet ("Henry I Whitmore the Bold"), without the title. */
export function personFull(p: PersonName, surname?: string): string {
	const s = surname?.trim();
	const own = p.epithet && s && p.epithet.toLowerCase().includes(s.toLowerCase());
	const lead = [p.given, p.numeral].filter(Boolean).join(" ");
	const named = !s || own || lead.toLowerCase().endsWith(s.toLowerCase()) ? lead : `${lead} ${s}`;
	return [named, p.epithet].filter(Boolean).join(" ");
}

/** The surname a house gives ("House Whitmore", "The Whitmore family", "Whitmore Dynasty" all give "Whitmore"). */
export function houseSurname(house: string): string {
	return matchForm(NAME_FORMS.house, house)?.base ?? house.trim();
}

/** A title and name written out in full with the surname from context: "King Henry I" and "Whitmore" gives "Henry I Whitmore". */
export function withSurname(name: string, surname?: string): string {
	const s = surname?.trim();
	if (!s || name.toLowerCase().endsWith(s.toLowerCase())) return name;
	return `${name} ${s}`;
}
