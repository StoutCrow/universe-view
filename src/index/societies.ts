/**
 * What each kind of society (a note of type culture, shown as "Society") is for. A spoken language is used and
 * joined differently from a family, which differs from a culture, a faith, a realm or an organisation: each kind
 * says what its members are called, what its places mean, what it descends from and what its dates are. Pure, so
 * it is testable; the views read it so every window uses the same words.
 */

export type SocietyKind = "realm" | "house" | "culture" | "language" | "faith" | "organisation" | "group";

export interface SocietySpec {
	label: string;
	plural: string;
	/** What its members are called: [one, many]. */
	members: [string, string];
	/** What the places linked to it mean (Seat, Homeland, Spoken in, Holy places). */
	places: string;
	/** What its sub-societies are (Cadet branches, Dialects and descendants, Denominations). */
	branches: string;
	/** What it comes from (Descends from, Branch of, Part of). */
	parent: string;
	/** Its first and last dates. */
	dates: [string, string];
	/** What its leader is called; none when nobody leads it (a language, a culture). */
	leader?: string;
	/** Whether it can answer to a liege or superior (only a realm). */
	liege?: boolean;
	/** One line saying how it is used and joined. */
	use: string;
}

export const SOCIETY_SPECS: Record<SocietyKind, SocietySpec> = {
	realm: {
		label: "Realm", plural: "Realms", members: ["Subject", "Subjects"], places: "Lands", branches: "Divisions", parent: "Descends from",
		dates: ["Founded", "Fell"], leader: "Ruled by", liege: true,
		use: "Who lives under it and serves it. It has a ruler, lands and a place in the chain of liege and vassals.",
	},
	house: {
		label: "House", plural: "Houses and families", members: ["Member", "Members"], places: "Seats", branches: "Cadet branches", parent: "Branch of",
		dates: ["Founded", "Died out"], leader: "Head of the house",
		use: "A line of kin: joined by birth or marriage, with a head and branches that split off.",
	},
	culture: {
		label: "Culture", plural: "Cultures and peoples", members: ["Person", "People"], places: "Homeland", branches: "Peoples within", parent: "Descends from",
		dates: ["Emerged", "Faded"],
		use: "The people someone is of, by custom and heritage. It has no ruler; people belong to it by birth or upbringing.",
	},
	language: {
		label: "Language", plural: "Languages", members: ["Speaker", "Speakers"], places: "Spoken in", branches: "Dialects and descendants", parent: "Descends from",
		dates: ["First spoken", "Last spoken"],
		use: "Spoken (or written) by people and in places, as many as you like: you do not join it, you learn it. It has no ruler.",
	},
	faith: {
		label: "Faith", plural: "Faiths", members: ["Follower", "Followers"], places: "Holy places", branches: "Denominations", parent: "Branch of",
		dates: ["Founded", "Ended"], leader: "Head of the faith",
		use: "What people believe. It can have a head, holy places and denominations, and people follow it by choice or upbringing.",
	},
	organisation: {
		label: "Organisation", plural: "Organisations", members: ["Member", "Members"], places: "Based at", branches: "Sub-organisations", parent: "Part of",
		dates: ["Founded", "Disbanded"], leader: "Led by",
		use: "A guild, order, army or company: members hold roles and ranks, and it has leaders.",
	},
	group: {
		label: "Society", plural: "Other societies", members: ["Member", "Members"], places: "Places", branches: "Sub-groups", parent: "Part of",
		dates: ["Founded", "Ended"], leader: "Led by",
		use: "Anything that is none of the other kinds.",
	},
};

/** The spec for a kind word (anything unknown is the general one). */
export function societySpec(kind: string | undefined): SocietySpec {
	return SOCIETY_SPECS[(kind ?? "group") as SocietyKind] ?? SOCIETY_SPECS.group;
}