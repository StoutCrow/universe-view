/**
 * The relationship properties UniverseView understands, for people and for groups. Each is a list of
 * links in a note's properties ("allies: [[House Vane]]"), optionally with dates
 * ("- { name: [[House Vane]], from: SE 12 }"). Writing one side is enough: the other side shows the
 * inverse ("vassals" on a lord shows "overlord" on the vassal).
 */

/** What kind of tie it is: decides colours and line styles in the charts. */
export type RelTone = "ally" | "hostile" | "rank" | "bond" | "trade" | "neutral";

export interface RelKind {
	/** The property name written in notes. */
	key: string;
	label: string;
	/** Other spellings that mean the same (singular, synonyms). */
	aliases: string[];
	/** How the other side sees it (key of another kind); symmetric ties name themselves. */
	inverse: string;
	tone: RelTone;
	/** Which notes it's offered on. */
	on: ("person" | "culture")[];
	/** Shown in settings and the new-note form. */
	desc: string;
}

export const REL_KINDS: RelKind[] = [
	{ key: "allies", label: "Allies", aliases: ["ally", "allied", "allied-with", "alliance", "alliances"], inverse: "allies", tone: "ally", on: ["person", "culture"], desc: "On the same side" },
	{ key: "friends", label: "Friends", aliases: ["friend", "companions", "companion"], inverse: "friends", tone: "bond", on: ["person"], desc: "Close personal ties" },
	{ key: "confidants", label: "Confidants", aliases: ["confidant", "confidante", "confidantes", "trusted"], inverse: "confidants", tone: "bond", on: ["person"], desc: "Who they trust with secrets" },
	{ key: "sworn", label: "Sworn kin", aliases: ["sworn-brothers", "sworn-brother", "sworn-sisters", "sworn-sister", "oathsworn", "blood-brothers", "blood-brother"], inverse: "sworn", tone: "bond", on: ["person"], desc: "Bound by oath, as family" },
	{ key: "colleagues", label: "Colleagues", aliases: ["colleague", "peers", "peer", "comrades", "comrade"], inverse: "colleagues", tone: "bond", on: ["person"], desc: "Work or serve side by side" },
	{ key: "acquaintances", label: "Acquaintances", aliases: ["acquaintance", "neighbours", "neighbour", "neighbors", "neighbor"], inverse: "acquaintances", tone: "neutral", on: ["person"], desc: "Known, not close" },
	{ key: "godparents", label: "Godparents", aliases: ["godparent", "godfather", "godmother", "sponsor", "sponsors"], inverse: "godchildren", tone: "bond", on: ["person"], desc: "Who stood for them" },
	{ key: "godchildren", label: "Godchildren", aliases: ["godchild", "godson", "goddaughter"], inverse: "godparents", tone: "bond", on: ["person"], desc: "Who they stood for" },
	{ key: "guardians", label: "Guardians", aliases: ["guardian"], inverse: "wards", tone: "rank", on: ["person"], desc: "Who looks after them" },
	{ key: "wards", label: "Wards", aliases: ["ward"], inverse: "guardians", tone: "rank", on: ["person"], desc: "Who they look after" },
	{ key: "rivals", label: "Rivals", aliases: ["rival", "rivalry", "competitors", "competitor"], inverse: "rivals", tone: "hostile", on: ["person", "culture"], desc: "Competing, not (yet) at war" },
	{ key: "enemies", label: "Enemies", aliases: ["enemy", "foes", "foe", "at-war-with", "at_war_with"], inverse: "enemies", tone: "hostile", on: ["person", "culture"], desc: "Open hostility or war" },
	{ key: "mentors", label: "Mentors", aliases: ["mentor", "teacher", "teachers"], inverse: "students", tone: "rank", on: ["person"], desc: "Who taught them" },
	{ key: "students", label: "Students", aliases: ["student", "apprentice", "apprentices", "pupil", "pupils", "protege", "proteges"], inverse: "mentors", tone: "rank", on: ["person"], desc: "Who they taught" },
	{ key: "liege", label: "Liege", aliases: ["lord", "overlord", "suzerain", "sovereign", "liege-lord"], inverse: "vassals", tone: "rank", on: ["person", "culture"], desc: "Who they answer to" },
	{ key: "vassals", label: "Vassals", aliases: ["vassal", "subjects", "tributaries", "tributary", "clients"], inverse: "liege", tone: "rank", on: ["person", "culture"], desc: "Who answers to them" },
	{ key: "employer", label: "Employer", aliases: ["employers", "works-for", "serves", "patron", "patrons"], inverse: "employees", tone: "rank", on: ["person"], desc: "Who they work for" },
	{ key: "employees", label: "Employees", aliases: ["employee", "servants", "servant", "agents", "agent", "retainers"], inverse: "employer", tone: "rank", on: ["person"], desc: "Who works for them" },
	{ key: "leader", label: "Leader", aliases: ["leaders", "ruler", "rulers", "head", "monarch", "chief"], inverse: "leads", tone: "rank", on: ["culture"], desc: "Who leads the group (also from members' roles)" },
	{ key: "leads", label: "Leads", aliases: [], inverse: "leader", tone: "rank", on: [], desc: "" },
	{ key: "trade-partners", label: "Trade partners", aliases: ["trade_partners", "trading-partners", "trades-with"], inverse: "trade-partners", tone: "trade", on: ["culture"], desc: "Trade and commerce" },
	{ key: "founder", label: "Founder", aliases: ["founders", "founded-by"], inverse: "founded", tone: "rank", on: ["culture"], desc: "Who founded it" },
	{ key: "founded", label: "Founded", aliases: [], inverse: "founder", tone: "rank", on: [], desc: "" },
	{ key: "relatives", label: "Relatives", aliases: ["relative", "kin", "kinsmen", "kinsman", "cousins", "cousin"], inverse: "relatives", tone: "bond", on: ["person"], desc: "Family beyond parents, partners and children" },
	{ key: "nemeses", label: "Nemeses", aliases: ["nemesis", "archenemy", "archenemies", "arch-enemy"], inverse: "nemeses", tone: "hostile", on: ["person"], desc: "A rivalry that defines them" },
	{ key: "business-partners", label: "Business partners", aliases: ["business-partner", "partners-in-business", "co-owners", "co-owner"], inverse: "business-partners", tone: "trade", on: ["person"], desc: "Share a business or venture" },
	{ key: "heirs", label: "Heirs", aliases: ["heir", "inheritors", "inheritor"], inverse: "heir-to", tone: "rank", on: ["person", "culture"], desc: "Who comes after them in a title or role (worked out from the family tree and the realm's succession law, unless written here)" },
	{ key: "heir-to", label: "Heir to", aliases: ["heir-of"], inverse: "heirs", tone: "rank", on: ["person", "culture"], desc: "Whose heir they are, or who held the title before" },
	{ key: "successors", label: "Successors", aliases: ["successor", "succeeded-by", "succeeded"], inverse: "predecessors", tone: "rank", on: ["person", "culture"], desc: "Who held the title or role after them (worked out from `holders:`)" },
	{ key: "predecessors", label: "Predecessors", aliases: ["predecessor", "preceded-by"], inverse: "successors", tone: "rank", on: ["person", "culture"], desc: "Who held the title or role before them" },
	{ key: "siblings", label: "Siblings", aliases: ["sibling", "brothers", "brother", "sisters", "sister"], inverse: "siblings", tone: "bond", on: ["person"], desc: "Share parents (worked out from the family tree)" },
	{ key: "half-siblings", label: "Half-siblings", aliases: ["half-sibling", "half-brothers", "half-brother", "half-sisters", "half-sister"], inverse: "half-siblings", tone: "bond", on: ["person"], desc: "Share one parent" },
	{ key: "step-siblings", label: "Step-siblings", aliases: ["step-sibling", "stepbrothers", "stepbrother", "stepsisters", "stepsister"], inverse: "step-siblings", tone: "bond", on: ["person"], desc: "Their parents are partners" },
];

const BY_NAME = new Map<string, RelKind>();
for (const k of REL_KINDS) {
	BY_NAME.set(k.key, k);
	for (const a of k.aliases) BY_NAME.set(a, k);
}

const norm = (s: string) => s.trim().toLowerCase().replace(/[\s_]+/g, "-");

/** The kind a property name or written kind stands for, if it's one of the known ones. */
export function relKind(kind: string | undefined): RelKind | undefined {
	if (!kind) return undefined;
	const k = norm(kind);
	return BY_NAME.get(k) ?? BY_NAME.get(k.replace(/s$/, "")) ?? BY_NAME.get(k + "s");
}

/** The tone of any relationship, guessing from the words for kinds UniverseView doesn't list. */
export function relTone(kind: string | undefined): RelTone {
	const known = relKind(kind);
	if (known) return known.tone;
	const k = (kind ?? "").toLowerCase();
	if (/war|enem|hostil|feud|foe|rival|oppos|hate/.test(k)) return "hostile";
	if (/ally|allie|alliance|pact|treaty|friend|support/.test(k)) return "ally";
	if (/trade|merchant|commerce|partner/.test(k)) return "trade";
	if (/lord|liege|vassal|serv|employ|mentor|student|leader|ruler|patron|client|master/.test(k)) return "rank";
	if (/love|lover|bond|sibling|kin/.test(k)) return "bond";
	return "neutral";
}

/** A readable label for a relationship as seen from one side ("vassals" seen from the vassal is "Liege"). */
export function relLabel(kind: string | undefined, fromOtherSide = false): string {
	const known = relKind(kind);
	if (!known) return kind ? kind.charAt(0).toUpperCase() + kind.slice(1).replace(/[-_]/g, " ") : "Related";
	if (!fromOtherSide) return known.label;
	return BY_NAME.get(known.inverse)?.label ?? known.label;
}

const ONE: Record<string, string> = {
	allies: "ally", friends: "friend", confidants: "confidant", sworn: "sworn kin", colleagues: "colleague", acquaintances: "acquaintance", godparents: "godparent", godchildren: "godchild", guardians: "guardian", wards: "ward", rivals: "rival", enemies: "enemy", mentors: "mentor", students: "student", liege: "liege", vassals: "vassal",
	employer: "employer", employees: "employee", leader: "leader", leads: "leads", "trade-partners": "trade partner", founder: "founder", founded: "founded",
	siblings: "sibling", "half-siblings": "half-sibling", "step-siblings": "step-sibling", successors: "successor", predecessors: "predecessor", relatives: "relative", nemeses: "nemesis", "business-partners": "business partner", heirs: "heir", "heir-to": "heir to",
};

/** The setting's words for `liege:` and `vassals:` (Superior and Subordinates in a modern world). The property names stay. */
export function setRankWords(w: { liege: string; vassals: string; liegeOne: string; vassalOne: string }) {
	BY_NAME.get("liege")!.label = w.liege;
	BY_NAME.get("vassals")!.label = w.vassals;
	ONE.liege = w.liegeOne;
	ONE.vassals = w.vassalOne;
}

/** What one person or group is to another, in the singular ("Corin Hale (mentor)"). */
export function relOne(kind: string | undefined): string {
	const known = relKind(kind);
	return known ? ONE[known.key] ?? known.label.toLowerCase() : (kind ?? "related").replace(/[-_]/g, " ");
}

/** The kind as the other note sees it: "vassals" written on a lord is "liege" on the vassal. Unknown kinds stay as written. */
export function relInverse(kind: string | undefined): string | undefined {
	const known = relKind(kind);
	if (!known || known.inverse === known.key) return kind;
	return known.inverse;
}

/** Whether the relationship reads the same both ways (allies, rivals…). */
export function relSymmetric(kind: string | undefined): boolean {
	const known = relKind(kind);
	return !!known && known.inverse === known.key;
}

/**
 * Property names UniverseView should read as relationships (every key and alias of the kinds you can
 * write). The inverse-only kinds ("founded", "leads") are left out: "founded" is a group's date.
 */
export function relPropertyNames(): string[] {
	return REL_KINDS.filter((k) => k.on.length).flatMap((k) => [k.key, ...k.aliases]);
}

/** The relationship properties pre-filled on new notes of a type (from the setting, or the defaults). */
export function presetKinds(type: "person" | "culture", setting?: string): string[] {
	const fromSetting = (setting ?? "").split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
	if (fromSetting.length) return fromSetting;
	return REL_KINDS.filter((k) => k.on.includes(type)).map((k) => k.key);
}

/** The headings the relationship menu sorts kinds under, in order. */
export const REL_GROUP_ORDER = ["Family", "Bonds", "Alliance and rivalry", "Authority and care", "Work and trade", "Teaching and faith", "Succession", "Founding"];
const REL_GROUPS: Record<string, string> = {
	relatives: "Family", siblings: "Family", "half-siblings": "Family", "step-siblings": "Family",
	friends: "Bonds", confidants: "Bonds", sworn: "Bonds", acquaintances: "Bonds",
	allies: "Alliance and rivalry", rivals: "Alliance and rivalry", enemies: "Alliance and rivalry", nemeses: "Alliance and rivalry",
	liege: "Authority and care", vassals: "Authority and care", leader: "Authority and care", leads: "Authority and care", guardians: "Authority and care", wards: "Authority and care",
	colleagues: "Work and trade", employer: "Work and trade", employees: "Work and trade", "business-partners": "Work and trade", "trade-partners": "Work and trade",
	mentors: "Teaching and faith", students: "Teaching and faith", godparents: "Teaching and faith", godchildren: "Teaching and faith",
	heirs: "Succession", "heir-to": "Succession", successors: "Succession", predecessors: "Succession",
	founder: "Founding", founded: "Founding",
};

/** The menu heading a relationship belongs under. */
export function relGroup(kind: string | undefined): string {
	return REL_GROUPS[relKind(kind)?.key ?? ""] ?? "Other";
}