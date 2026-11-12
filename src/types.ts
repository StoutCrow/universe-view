import type { TFile } from "obsidian";

export const ENTITY_TYPES = ["event", "person", "culture", "place", "map"] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export type Precision = "day" | "month" | "year" | "range";

/** A parsed date. All positions are in "universal days" (days since 1970-01-01, proleptic Gregorian). */
export interface ChronDate {
	/** First day covered by the date. */
	start: number;
	/** Last day covered by the date (end of the year for a year-precision date). */
	end: number;
	precision: Precision;
	/** "c. 1240", "~1240", "before 1240" etc. */
	approx: boolean;
	/** "before" / "after" qualifier, if any. */
	qualifier?: "before" | "after";
	calendar: string;
	raw: string;
}

/** A reference to another note: resolved to a path when the note exists. */
export interface Ref {
	/** Index key: the file path when resolved, otherwise "?" + link text. */
	key: string;
	name: string;
	resolved: boolean;
	/** Worked out from another note, not written on this one. */
	inferred?: boolean;
}

/** Someone holding a title for a while (`holders:`). */
export interface HolderSpan {
	ref: Ref;
	from?: ChronDate;
	to?: ChronDate;
}

/** A land changing hands in an event (`transfers:`): from one liege to another, or to none. */
export interface Transfer {
	land: Ref;
	from?: Ref;
	to?: Ref;
}

/** A land held for a while by someone else (`occupied:` on a war or battle): it keeps its owner. */
export interface Occupation {
	land: Ref;
	by: Ref;
	from?: ChronDate;
	to?: ChronDate;
}

/** One party in a battle or war (`sides:`): who, on which side, and how it ended for them. */
export interface Side {
	party: Ref;
	/** "A", "B", "attackers", "the Crown"… parties with the same side fought together. */
	side: string;
	/** "won", "lost", "draw"… as written. */
	outcome?: string;
}

/** A name a note had for a while. */
export interface NameSpan {
	name: string;
	from?: ChronDate;
	to?: ChronDate;
}

/** A time-ranged relationship (partner, membership, generic relation). */
export interface TimedRef {
	ref: Ref;
	from?: ChronDate;
	to?: ChronDate;
	kind?: string;
	role?: string;
	/** Custom text for this tie, shown as written ((spouse, ""a secret wedding"")). */
	label?: string;
	/** How it ended, when it did (eason: divorce). */
	reason?: string;
	/** The property it was written under (family, allegiance, cultures…). */
	via?: string;
}

export const PIN_SIZES = ["tiny", "small", "medium", "large", "huge"] as const;
export type PinSize = (typeof PIN_SIZES)[number];

/** An area painted on a map: owned by a culture (a realm's borders) or a place (a region). */
export interface Territory {
	/** Key of the map note, "world" for the real-world map, or "*" when the note didn't say. */
	map: string;
	/** Image maps: [x, y] pixels from the top-left. World map: [lat, lng]. */
	points: [number, number][];
	/** Routes: road, path, river, sea… */
	kind?: string;
	name?: string;
	/** When this shape applies (borders that change over time). */
	from?: ChronDate;
	to?: ChronDate;
	/** The dates as written, kept so saving a shape never rewrites them. */
	fromText?: string;
	toText?: string;
}

/** A story note (chapter, scene, session) set at a date in the world, for continuity checks. */
export interface Scene {
	path: string;
	name: string;
	date: ChronDate;
	/** People present (from `characters:`, `cast:`, `pov:`, `present:`, or an event's participants). */
	cast: Ref[];
	/** Where it happens (`setting:`, `location:`, or an event's places). */
	places: Ref[];
	/** Flashbacks and dreams aren't held to the timeline. */
	flashback: boolean;
}

export interface Entity {
	key: string;
	path: string;
	name: string;
	type: EntityType;
	file: TFile;
	folder: string;
	props: Record<string, unknown>;
	tags: string[];
	color?: string;
	image?: string;
	/** Lucide icon name or emoji for map pins and cards ("icon: castle"). */
	icon?: string;
	/** Small image (sigil, crest, flag) shown on map pins. */
	logo?: string;
	/** Finer kind within the type: "city", "fort", "house", "battle"… from a property or tag. */
	category?: string;
	/** Map pin size ("pin-size: large"). */
	pinSize?: PinSize;
	/** Map layer, 1 (always shown) to 5 (only when zoomed far in): "layer: 3". */
	layer?: number;
	/** "population: 12,000". */
	population?: number;
	/** "terrain: mountains": slows journeys across the note's territory. */
	terrain?: string;
	/** Written as still going ("1292 C.E. -", `end: present`): drawn up to the current date. */
	openEnd?: boolean;
	/** Events that come round again (`repeat: yearly`): festivals, anniversaries, market days. */
	repeat?: "yearly" | "monthly" | "weekly";
	/** Events that led to this one (`caused-by:`), and that this one led to (`led-to:`). */
	causes: Ref[];
	effects: Ref[];
	/** Secrets and events this person knows about ("knows:"), and since when. */
	knows: TimedRef[];
	/** People who know about this note's secret or event ("known-by:"). */
	knownBy: TimedRef[];
	territories: Territory[];
	/** What it was called when (`names:`): a kingdom renamed, a city that took a new name. */
	names?: NameSpan[];
	/** Who held this title when (`holders:`). */
	holders?: HolderSpan[];
	/** On an event: lands that changed hands in it (`transfers:`). */
	transfers?: Transfer[];
	/** On a battle or war: who fought, on which side, and who won (`sides:`). */
	sides?: Side[];
	/** On a war or battle: lands occupied in it (`occupied:`). */
	occupied?: Occupation[];
	/** On a realm: ground it holds for a while, drawn apart from its borders (`occupied-areas:`). */
	fronts?: Territory[];
	/** An alliance's members (`alliance:`): naming it in `sides:` brings them all in. */
	alliance?: Ref[];
	/** On a battle: the war or campaign it was part of (`war:`). */
	war?: Ref;
	/** Roads, rivers and sea lanes drawn on maps (2+ points). */
	routes: Territory[];
	calendar: string;
	importance: number;
	summary?: string;

	/** event: start/end; person: born/died; culture: founded/dissolved; place: founded/abandoned */
	start?: ChronDate;
	end?: ChronDate;

	// events
	participants: Ref[];
	places: Ref[];
	cultures: TimedRef[];

	// people
	parents: Ref[];
	adoptiveParents: Ref[];
	/** How a parent who is not one by birth is one (`step`, `foster`, `guardian`), by their key. */
	parentKinds?: Record<string, string>;
	partners: TimedRef[];
	/** Children listed on the parent's note; folded into the children's parents by the index. */
	children: Ref[];
	relations: TimedRef[];
	gender?: string;
	birthPlace?: Ref;
	deathPlace?: Ref;

	// cultures
	parentCultures: Ref[];
	/** "branches:" listed on the parent culture; folded into parentCultures by the index. */
	childCultures: Ref[];
	relatedCultures: TimedRef[];

	// places
	coords?: [number, number];
	map?: Ref;
	/** Unresolved map reference (e.g. a Charted Roots map_id) matched after all maps are read. */
	mapHint?: string;
	position?: [number, number];
	/** Pixel y counted from the bottom of the image (Charted Roots), not the top. */
	positionFromBottom?: boolean;
	locatedIn?: Ref;

	// maps
	mapImage?: string;
	/** The map in other times (`images:`), each with the dates it applies. */
	mapImages?: { image: string; from?: ChronDate; to?: ChronDate; name?: string }[];

	/** Problems found while reading the note (unparseable dates, …). */
	issues: string[];
}

export interface CalendarMonth {
	name: string;
	days: number;
	/** Festival days outside the weeks (they don't advance the weekday and aren't drawn as weeks). */
	intercalary?: boolean;
}

/** Extra days in some years: `every` years (counted from `offset`), except every `except`, unless every `unless`. */
export interface LeapRule {
	/** 1-based month that gets the extra days. */
	month: number;
	every: number;
	offset?: number;
	except?: number;
	unless?: number;
	days?: number;
}

export interface MoonDef {
	name: string;
	/** Days from one new moon to the next (may be fractional). */
	cycle: number;
	/** Universal day of a new moon (for custom calendars, counted from the calendar's year 1, day 1). */
	offset: number;
	color?: string;
}

/** A season starting on a month and day each year. */
export interface SeasonDef {
	name: string;
	month: number;
	day: number;
	color?: string;
}

/** A day that comes round every year (or every few years). */
export interface HolidayDef {
	name: string;
	month: number;
	day: number;
	/** Only every n years (counted from year 1). */
	every?: number;
	color?: string;
}

export interface CalendarEra {
	abbr: string;
	name: string;
	/** Absolute year (in this calendar's year count) at which the era starts. */
	startYear: number;
}

export interface CalendarDef {
	id: string;
	name: string;
	months: CalendarMonth[];
	eras: CalendarEra[];
	/** Universal day on which year 1, month 1, day 1 of this calendar falls. */
	epoch: number;
	/** Write the era after the year ("1262 C.E.") instead of before it ("SE 412"). */
	eraAfter?: boolean;
	/** Era abbreviation assumed for a bare year such as "1262". */
	defaultEra?: string;
	/** Names of the days of the week (empty: no weeks). */
	weekdays?: string[];
	/** Which weekday (0-based) year 1, day 1 falls on. */
	firstWeekday?: number;
	leaps?: LeapRule[];
	moons?: MoonDef[];
	seasons?: SeasonDef[];
	holidays?: HolidayDef[];
}

export interface EntityFilter {
	search?: string;
	folder?: string;
	tags?: string[];
	cultures?: string[];
	people?: string[];
	places?: string[];
	types?: EntityType[];
	from?: number;
	to?: number;
	minImportance?: number;
}
