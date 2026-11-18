/**
 * The ways a name is dressed for each kind of note ("Kingdom of {name}", "House {name}", "King {name}"), and reading
 * them back: a typed "Kingdom of England" is a realm called England; "King Henry I" is a person called Henry I, whose
 * full name takes the surname of their house. Pure, so it is testable.
 */

/** Ways of writing a name, per kind of note: the type, or "region", "realm", "house", "nationality", "language", "faith", "organisation", "group". */
export const NAME_FORMS: Record<string, string[]> = {
	event: ["Battle of {name}", "Siege of {name}", "Treaty of {name}", "Fall of {name}", "Coronation of {name}", "Wedding of {name}", "War of {name}"],
	person: ["King {name}", "Queen {name}", "Lord {name}", "Lady {name}", "Sir {name}", "Saint {name}", "Captain {name}", "{name} the Great", "{name} the Bold", "{name} the Elder", "{name} the Younger", "{name} Jr."],
	place: ["{name} Castle", "{name} Abbey", "Fort {name}", "Port {name}", "Mount {name}", "River {name}", "Lake {name}", "{name} Bridge"],
	region: ["The {name} Mountains", "The {name} Plains", "{name} Forest", "{name} Sea", "Isle of {name}", "The {name}"],
	realm: ["Kingdom of {name}", "Duchy of {name}", "County of {name}", "Empire of {name}", "Republic of {name}", "Principality of {name}", "The {name} Empire"],
	house: ["House {name}", "House of {name}", "Clan {name}", "The {name} family", "{name} Dynasty"],
	nationality: ["The {name} people", "The {name}", "{name} folk"],
	language: ["{name} language", "Old {name}", "Middle {name}", "Common {name}"],
	faith: ["Church of {name}", "Faith of {name}", "Cult of {name}", "Order of {name}", "The {name} Faith"],
	organisation: ["{name} Guild", "{name} Company", "Order of {name}", "Council of {name}", "The {name} Guard", "The {name} Army"],
	group: ["The {name}", "{name} Society", "League of {name}"],
	object: ["Sword of {name}", "Crown of {name}", "Ring of {name}", "Tome of {name}", "The {name} Crown"],
	creature: ["The {name}", "Great {name}", "Elder {name}"],
	map: ["Map of {name}", "{name} map"],
};

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

const TITLES = /^(king|queen|lord|lady|sir|dame|saint|st\.?|captain|prince|princess|duke|duchess|count|countess|baron|baroness|emperor|empress|pope|archbishop|bishop)\s+(.+)$/i;

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
