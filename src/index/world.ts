/**
 * World notes: one note (`type: world`) at the top of a world's folder that holds what used to be
 * scattered settings: its calendar, today's date in the story, its main map, how fast people travel,
 * how its houses inherit, and which relationships new notes start with. No Obsidian here.
 */

export interface WorldSettings {
	/** The world note itself. */
	path: string;
	name: string;
	/** The folder it covers ("" = the whole vault). */
	folder: string;
	calendar?: string;
	/** Today's date in the world, as written ("14 Highsun SE 3"). */
	today?: string;
	/** Name of the main map note. */
	map?: string;
	/** Kilometres a day for each way of travelling ("foot", "horse", "wagon", "boat", "ship"…). */
	travel: Record<string, number>;
	succession?: "absolute" | "male-preference" | "agnatic";
	/** Relationship properties new people and groups start with. */
	presets: { person?: string; culture?: string };
	props: Record<string, unknown>;
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : undefined);
const linkName = (v: unknown) => str(Array.isArray(v) ? v[0] : v)?.replace(/^\[\[|\]\]$/g, "").split("|")[0];
const list = (v: unknown) => (Array.isArray(v) ? v.map(String).join(", ") : str(v));

/** "foot 25, horse 50, ship 150" or { foot: 25, horse: 50 } → speeds in km a day. */
export function readTravel(v: unknown): Record<string, number> {
	const out: Record<string, number> = {};
	if (v && typeof v === "object" && !Array.isArray(v)) {
		for (const [k, n] of Object.entries(v as Record<string, unknown>)) if (Number(n) > 0) out[k.toLowerCase()] = Number(n);
		return out;
	}
	const s = Array.isArray(v) ? v.join(",") : str(v) ?? "";
	for (const part of s.split(/[,;\n]+/)) {
		const m = part.trim().match(/^([\p{L} -]+?)\s*[:=]?\s*(\d+(?:\.\d+)?)/u) ?? part.trim().match(/^(\d+(?:\.\d+)?)\s*(?:km)?\s*(?:a day)?\s*(?:by|on)?\s*([\p{L} -]+)$/u);
		if (!m) continue;
		const [name, n] = /^\d/.test(m[1]) ? [m[2], m[1]] : [m[1], m[2]];
		const key = name.trim().toLowerCase().replace(/^(by|on)\s+/, "");
		if (Number(n) > 0) out[key] = Number(n);
	}
	return out;
}

export function readWorld(path: string, name: string, folder: string, fm: Record<string, unknown>): WorldSettings {
	const rule = str(fm.succession)?.toLowerCase();
	return {
		path,
		name: str(fm.name) ?? name,
		folder,
		calendar: str(fm.calendar),
		today: str(fm.today ?? fm["current-date"] ?? fm.current_date ?? fm.now),
		map: linkName(fm.map ?? fm["main-map"]),
		travel: readTravel(fm.travel ?? fm.speeds),
		succession: rule?.startsWith("male") ? "male-preference" : rule?.startsWith("agn") ? "agnatic" : rule?.startsWith("abs") || rule?.startsWith("eld") ? "absolute" : undefined,
		presets: { person: list(fm["person-relations"] ?? fm.people_relations), culture: list(fm["group-relations"] ?? fm["culture-relations"]) },
		props: fm,
	};
}
