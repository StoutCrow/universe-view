import { dataviewApi, templateFolders } from "../internals";
import { App, Events, TFile, debounce, getAllTags } from "obsidian";
import type { ChronDate, Entity, EntityFilter, EntityType, Ref, Scene, Territory, TimedRef } from "../types";
import { ChronicleSettings, FieldName, buildFieldAliases, parseMappingLines } from "../settings";
import { CalendarRegistry, type Calendar } from "../dates/calendars";
import { parseDate, parseSpan } from "../dates/parser";
import { relInverse } from "./relkinds";
import { readNames } from "./renames";
import { holdersProperty, readHolders, readOccupied, readSides, readTransfers } from "./periods";
import { readWorld, type WorldSettings } from "./world";
import { asText } from "./text";
import { parseKin } from "./relatives";
import { clearInferred, noteSignature } from "./derived";
import { timeBoundaries, timeStep } from "./timesteps";
import {
	PropReader, cleanLinkText, genderFromTags, normalizeGender, normalizeType, normalizeValue, readCategory, readIcon, readLayer, readPair, readPinSize,
	readPoints, readRefs, readTimedRefs, typeFromTag,
} from "./reader";

/** A story note's in-world date, cast and setting. */
const SCENE_DATE_KEYS = ["story-date", "story_date", "scene-date", "scene_date", "chapter-date", "chapter_date", "session-date", "in-world-date", "in_world_date"];
const SCENE_CAST_KEYS = ["characters", "cast", "pov", "present", "appearing"];
const SCENE_PLACE_KEYS = ["setting", "settings", "scene-location", "where-in-world"];

const GENERIC_RELATION_ALIASES =["relations", "relationships", "related", "related-cultures", "related_cultures", "relatedcultures"];

interface DataviewApi {
	page(path: string): Record<string, unknown> | undefined;
}

/**
 * Keeps an in-memory model of every UniverseView entity in the vault, plus reverse lookups
 * (children, partners, members, events at a place…). Emits "changed" after each rebuild.
 */
export class EntityIndex extends Events {
	entities = new Map<string, Entity>();
	private byName = new Map<string, string>();
	childrenOf = new Map<string, Set<string>>();
	adoptiveChildrenOf = new Map<string, Set<string>>();
	partnersOf = new Map<string, TimedRef[]>();
	/** Parents of relatives with no note, from `relatives:` lines (see relatives.ts); keyed "?name". */
	private ghostParents = new Map<string, Ref[]>();
	/** The name as written for each relative with no note ("?mary-anne" is "Mary-Anne"). */
	private ghostNames = new Map<string, string>();
	/** Which keys each note's `relatives:` lines talk about. */
	private kinKeys = new Map<string, Set<string>>();
	relationsOf = new Map<string, TimedRef[]>();
	eventsOf = new Map<string, Set<string>>();
	membersOf = new Map<string, { key: string; link: TimedRef }[]>();
	subPlacesOf = new Map<string, Set<string>>();
	placesOnMap = new Map<string, Set<string>>();
	childCulturesOf = new Map<string, Set<string>>();
	/** What led to each event, and what it led to (from `caused-by:` and `led-to:` on either note). */
	causesOf = new Map<string, Set<string>>();
	effectsOf = new Map<string, Set<string>>();
	/** World notes (`type: world`), by the folder they cover ("" for the whole vault). */
	worlds = new Map<string, WorldSettings>();
	ready = false;
	version = 0;
	private steps?: { version: number; bounds: number[] };

	/** Which stretch of time a day falls in: between two days of change, every view looks the same. */
	timeStep(at: number | undefined): number {
		if (this.steps?.version !== this.version) this.steps = { version: this.version, bounds: timeBoundaries(this.all()) };
		return timeStep(this.steps.bounds, at);
	}

	private aliases = buildFieldAliases("");
	private folderTypes: [string, EntityType][] = [];
	private folderCalendars: [string, string][] = [];
	readonly requestRebuild: () => void;
	/** Notes edited since the last update (re-read on their own, not the whole vault). */
	private dirty = new Set<string>();
	/** What each note last gave the index, to tell a real change from a save of its body. */
	private signatures = new Map<string, string>();
	private readonly flushUpdates: () => void;

	constructor(private app: App, private getSettings: () => ChronicleSettings, public calendars: CalendarRegistry) {
		super();
		this.requestRebuild = debounce(() => this.rebuild(), 250, true);
		this.flushUpdates = debounce(() => this.applyUpdates(), 150, true);
	}

	/**
	 * A note's properties changed: re-read just that note (and refresh the links between notes),
	 * instead of the whole vault. World notes change how other notes are read, so they rebuild all.
	 * Saves that only touch the body change nothing here, unless `force` (Dataview reads the body).
	 */
	requestUpdate(file: TFile, force = false) {
		if (!this.ready) return this.requestRebuild();
		if (!force && this.signatures.get(file.path) === noteSignature(this.app.metadataCache.getFileCache(file))) return;
		this.dirty.add(file.path);
		this.flushUpdates();
	}

	private applyUpdates() {
		const paths = [...this.dirty];
		this.dirty.clear();
		if (!paths.length) return;
		const worldsBefore = new Set([...this.worlds.values()].map((w) => w.path));
		const worldsNow = this.readWorlds();
		if (paths.some((p) => worldsBefore.has(p) || [...worldsNow.values()].some((w) => w.path === p))) return this.rebuild();
		for (const path of paths) {
			const file = this.app.vault.getAbstractFileByPath(path);
			this.entities.delete(path);
			if (!(file instanceof TFile) || file.extension !== "md" || this.isTemplate(path)) continue;
			try {
				const e = this.readFile(file);
				if (e) this.entities.set(e.key, e);
			} catch (err) {
				console.error("UniverseView: failed to read", path, err);
			}
		}
		this.byName.clear();
		for (const e of this.entities.values()) this.byName.set(e.name.toLowerCase(), e.key);
		this.computeDerived();
		this.scenes = this.readScenes();
		this.version++;
		this.trigger("changed");
	}

	applySettings() {
		const s = this.getSettings();
		this.aliases = buildFieldAliases(s.fieldAliases);
		this.folderTypes = parseMappingLines(s.folderTypes)
			.map(([f, t]) => [normalizeFolder(f), normalizeType(t)] as [string, EntityType | null])
			.filter((x): x is [string, EntityType] => !!x[1])
			.sort((a, b) => b[0].length - a[0].length);
		this.folderCalendars = parseMappingLines(s.folderCalendars)
			.map(([f, c]) => [normalizeFolder(f), c] as [string, string])
			.sort((a, b) => b[0].length - a[0].length);
		this.calendars.load(s.calendars, s.defaultCalendar);
	}

	/** Template notes carry type tags and empty properties; they aren't people or places. */
	isTemplate(path: string): boolean {
		const folders = [...templateFolders(this.app), ...this.getSettings().ignoreFolders.split(/[\n,]/)]
			.filter((f: unknown): f is string => typeof f === "string" && !!f.trim())
			.map((f) => f.trim().replace(/^\/|\/$/g, ""));
		if (folders.some((f) => path.startsWith(f + "/"))) return true;
		return /(^|\/)[!_.]*templates?\//i.test(path);
	}

	rebuild() {
		this.applySettings();
		this.worlds = this.readWorlds();
		const entities = new Map<string, Entity>();
		for (const file of this.app.vault.getMarkdownFiles()) {
			if (this.isTemplate(file.path)) continue;
			try {
				const e = this.readFile(file);
				if (e) entities.set(e.key, e);
			} catch (err) {
				console.error("UniverseView: failed to read", file.path, err);
			}
		}
		this.entities = entities;
		this.byName.clear();
		for (const e of entities.values()) this.byName.set(e.name.toLowerCase(), e.key);
		this.computeDerived();
		this.scenes = this.readScenes();
		this.ready = true;
		this.version++;
		this.trigger("changed");
	}

	/** Story notes (chapters, scenes, sessions) with an in-world date, for the continuity checks. */
	scenes: Scene[] = [];

	private readScenes(): Scene[] {
		const out: Scene[] = [];
		for (const file of this.app.vault.getMarkdownFiles()) {
			if (this.isTemplate(file.path)) continue;
			const fm: Record<string, unknown> | undefined = this.app.metadataCache.getFileCache(file)?.frontmatter;
			if (!fm) continue;
			const rawDate = SCENE_DATE_KEYS.map((k) => fm[k]).find((v) => v !== undefined && v !== null && v !== "");
			if (rawDate === undefined) continue;
			const folder = file.parent?.path ?? "";
			const cal = this.calendars.get(this.calendarFor(folder === "/" ? "" : folder, fm.calendar));
			const date = parseDate(rawDate, cal);
			if (!date) continue;
			const resolve = (t: string) => this.resolveLink(t, file.path);
			const refsOf = (keys: string[]) => readRefs(keys.flatMap((k) => (fm[k] === undefined ? [] : Array.isArray(fm[k]) ? (fm[k] as unknown[]) : [fm[k]])), resolve);
			const self = this.entities.get(file.path);
			let cast = refsOf(SCENE_CAST_KEYS);
			if (!cast.length && self?.type === "event") cast = self.participants;
			let places = refsOf(SCENE_PLACE_KEYS);
			if (!places.length && self?.type === "event") places = self.places;
			const flag = asText(fm.flashback ?? fm.dream ?? fm["out-of-time"]).toLowerCase();
			out.push({ path: file.path, name: file.basename, date, cast, places, flashback: flag === "true" || flag === "yes" });
		}
		return out.sort((a, b) => a.date.start - b.date.start);
	}

	private dataview(): DataviewApi | null {
		if (!this.getSettings().useDataview) return null;
		return dataviewApi(this.app) as DataviewApi | null;
	}

	/**
	 * World notes: a note with `type: world` sets the calendar, today's date, main map, travel speeds,
	 * succession rule and relationship presets for every note in its folder.
	 */
	private readWorlds(): Map<string, WorldSettings> {
		const out = new Map<string, WorldSettings>();
		for (const file of this.app.vault.getMarkdownFiles()) {
			const cache = this.app.metadataCache.getFileCache(file);
			const fm = cache?.frontmatter;
			const typeRaw = String(fm?.type ?? fm?.cr_type ?? "").trim().toLowerCase();
			const tagged = (cache ? getAllTags(cache) ?? [] : []).some((t) => /^#(world|universe|setting)$/i.test(t));
			if (!fm || !(typeRaw === "world" || typeRaw === "universe" || tagged)) continue;
			if (this.isTemplate(file.path)) continue;
			const folder = file.parent && file.parent.path !== "/" ? file.parent.path : "";
			out.set(folder, readWorld(file.path, file.basename, folder, fm));
		}
		return out;
	}

	/** The world a note or folder belongs to: the nearest world note above it. */
	worldFor(path: string): WorldSettings | undefined {
		let best: WorldSettings | undefined;
		for (const w of this.worlds.values()) {
			if (w.folder && !(path === w.folder || path.startsWith(w.folder + "/"))) continue;
			if (!best || w.folder.length > best.folder.length) best = w;
		}
		return best;
	}

	calendarFor(folderPath: string, explicit?: unknown): string {
		if (typeof explicit === "string" && this.calendars.has(explicit.trim())) return explicit.trim();
		const world = this.worldFor(folderPath);
		if (world?.calendar && this.calendars.has(world.calendar)) return world.calendar;
		const p = folderPath + "/";
		for (const [folder, cal] of this.folderCalendars) {
			if (p.startsWith(folder) && this.calendars.has(cal)) return cal;
		}
		return this.calendars.defaultId;
	}

	private detectType(file: TFile, fm: Record<string, unknown>, tags: string[], reader: PropReader): EntityType | null {
		const explicit = normalizeType(reader.get("type"));
		if (explicit) return explicit;
		const s = this.getSettings();
		if (s.tagTypes) {
			for (const t of tags) {
				const tt = typeFromTag(t, s.tagPrefix, s.typeTags);
				if (tt) return tt;
			}
		}
		const p = file.path;
		for (const [folder, type] of this.folderTypes) if (p.startsWith(folder)) return type;
		void fm;
		return null;
	}

	/** Where a note's pin goes: `map:` and `position:` on an image map, or `coordinates:` on the world map. */
	private readPin(e: Entity, fm: Record<string, unknown>, reader: PropReader, mapRefs: Ref[]) {
		e.map = mapRefs.find((r) => r.resolved);
		if (!e.map && mapRefs.length) e.mapHint = mapRefs[0].name;
		const crX = Number(fm.custom_coordinates_x);
		const crY = Number(fm.custom_coordinates_y);
		const crObj = fm.custom_coordinates as { x?: unknown; y?: unknown; map?: unknown } | undefined;
		if (fm.custom_coordinates_x !== undefined && Number.isFinite(crX) && Number.isFinite(crY)) {
			// Charted Roots measures pixel y from the bottom of the image.
			e.position = [crX, crY];
			e.positionFromBottom = true;
		} else if (crObj && typeof crObj === "object" && crObj.x !== undefined) {
			e.position = readPair(crObj);
			e.positionFromBottom = true;
			if (!e.map && typeof crObj.map === "string") e.mapHint = crObj.map;
		} else {
			e.position = readPair(reader.get("position"));
			// "position-origin: bottom" keeps pixel positions measured from the image's bottom edge.
			if (asText(fm["position-origin"] ?? "").toLowerCase() === "bottom") e.positionFromBottom = true;
		}
		const latLng = fm.coordinates_lat !== undefined ? readPair([fm.coordinates_lat, fm.coordinates_long]) : readPair(reader.get("coordinates"));
		if ((e.map || e.mapHint) && !e.position) e.position = latLng;
		else e.coords = latLng;
	}

	resolveLink(linktext: string, sourcePath: string): Ref {
		const { path, alias } = cleanLinkText(linktext);
		if (!path) return { key: "?", name: "", resolved: false };
		const dest = this.app.metadataCache.getFirstLinkpathDest(path, sourcePath);
		if (dest && dest.extension === "md") return { key: dest.path, name: dest.basename, resolved: true };
		const base = path.split("/").pop() ?? path;
		void alias;
		return { key: "?" + base.toLowerCase(), name: base, resolved: false };
	}

	private resolveImage(value: unknown, sourcePath: string): string | undefined {
		if (typeof value !== "string" || !value.trim()) return undefined;
		const v = value.trim();
		if (/^https?:\/\//.test(v)) return v;
		const { path } = cleanLinkText(v.replace(/^!?\[\[|\]\]$/g, ""));
		const dest = this.app.metadataCache.getFirstLinkpathDest(path, sourcePath);
		return dest?.path;
	}

	/**
	 * `territory:` is a list of `{ map: [[Map]], points: "x,y x,y …" }` entries (several for islands or
	 * several maps), or a bare list of points / points string for a single area.
	 */
	/** Areas (3+ points) or, with `minPoints` 2, routes; each may say its map, `kind` (road, river…) and `from`/`to` dates. */
	private readTerritories(value: unknown, sourcePath: string, minPoints = 3, cal?: Calendar): Territory[] {
		if (value === undefined || value === null || value === "") return [];
		const mapKey = (m: unknown): string => {
			if (typeof m !== "string" || !m.trim()) return "*";
			const s = m.replace(/^\[\[|\]\]$/g, "").trim();
			if (s.toLowerCase() === "world") return "world";
			const ref = this.resolveLink(s, sourcePath);
			return ref.resolved ? ref.key : "*";
		};
		const one = (v: unknown, map: string): Territory | null => {
			const points = readPoints(v);
			return points.length >= minPoints ? { map, points } : null;
		};
		const list = Array.isArray(value) ? value : [value];
		// A bare list of pairs is one area.
		if (list.length >= minPoints && list.every((x) => Array.isArray(x) && x.length === 2 && x.every((n) => typeof n === "number"))) {
			const t = one(list, "*");
			return t ? [t] : [];
		}
		const out: Territory[] = [];
		for (const item of list) {
			if (item && typeof item === "object" && !Array.isArray(item)) {
				const o = item as Record<string, unknown>;
				const t = one(o.points ?? o.area ?? o.polygon ?? o.path ?? o.line, mapKey(o.map));
				if (t && typeof o.kind === "string") t.kind = o.kind.toLowerCase();
				if (t && typeof o.name === "string") t.name = o.name;
				if (t && cal) {
					const from = o.from ?? o.since ?? o.start;
					const to = o.to ?? o.until ?? o.end;
					if (from !== undefined && from !== null && from !== "") {
						t.from = parseDate(from, cal) ?? undefined;
						t.fromText = asText(from);
					}
					if (to !== undefined && to !== null && to !== "") {
						t.to = parseDate(to, cal) ?? undefined;
						t.toText = asText(to);
					}
				}
				if (t) out.push(t);
			} else {
				const t = one(item, "*");
				if (t) out.push(t);
			}
		}
		return out;
	}

	readFile(file: TFile): Entity | null {
		const cache = this.app.metadataCache.getFileCache(file);
		this.signatures.set(file.path, noteSignature(cache));
		const fm: Record<string, unknown> = { ...(cache?.frontmatter ?? {}) };
		delete fm.position; // Obsidian's internal position info, not ours…
		if (cache?.frontmatter && "position" in cache.frontmatter) {
			const p = (cache.frontmatter as Record<string, unknown>).position;
			// …unless the user actually wrote a [x, y] position.
			if (Array.isArray(p) || typeof p === "string") fm.position = p;
		}
		const dv = this.dataview();
		if (dv) {
			try {
				const page = dv.page(file.path);
				if (page) {
					const known = new Set(Object.keys(fm).map((k) => k.toLowerCase()));
					for (const [k, v] of Object.entries(page)) {
						if (k === "file" || known.has(k.toLowerCase())) continue;
						fm[k] = normalizeValue(v);
						known.add(k.toLowerCase());
					}
				}
			} catch {
				// Dataview not ready yet: frontmatter alone is fine.
			}
		}
		const tags = cache ? (getAllTags(cache) ?? []) : [];
		const reader = new PropReader(fm, this.aliases);
		const type = this.detectType(file, fm, tags, reader);
		if (!type) return null;

		const folder = file.parent?.path ?? "";
		const calendar = this.calendarFor(folder === "/" ? "" : folder, reader.get("calendar"));
		const cal = this.calendars.get(calendar);
		const issues: string[] = [];
		const resolve = (t: string) => this.resolveLink(t, file.path);
		let openEnd = false;
		const date = (field: FieldName): ChronDate | undefined => {
			const v = reader.get(field);
			if (v === undefined) return undefined;
			if (/^\s*(present|now|ongoing|living|alive|today|still|-+|–)\s*$/i.test(asText(v))) {
				openEnd = true;
				return undefined;
			}
			// "1292 C.E. -" in a start date: begins then and is still going.
			if (/[-–]\s*$/.test(asText(v))) {
				const s = parseSpan(v, cal);
				if (s.ok && s.start && !s.end) {
					openEnd = true;
					return s.start;
				}
			}
			const d = parseDate(v, cal);
			if (!d) issues.push(`Could not read ${field} "${asText(v)}"`);
			return d ?? undefined;
		};
		const refs = (field: FieldName) => readRefs(reader.getAll(field).map((x) => x.value), resolve);
		// For relations, the property name is the relation kind ("mentor: [[X]]"); elsewhere aliases are just synonyms.
		const timed = (field: FieldName) => {
			const generic = field === "relations" || field === "relatedCultures"
				? GENERIC_RELATION_ALIASES
				// "betrothed: [[X]]" is a partner of a particular kind; spouse/wife/husband are plain partners.
				: this.aliases[field].map((a) => a.toLowerCase()).filter((a) => a !== "betrothed");
			return readTimedRefs(reader.getAll(field), resolve, cal, generic, issues);
		};

		const importanceRaw = Number(reader.get("importance"));
		const colorRaw = reader.get("color");
		const summaryRaw = reader.get("summary");

		const e: Entity = {
			key: file.path,
			path: file.path,
			name: file.basename,
			type,
			file,
			folder,
			props: fm,
			tags: tags.map((t) => t.replace(/^#/, "")),
			color: typeof colorRaw === "string" ? colorRaw : undefined,
			image: this.resolveImage(reader.get("image"), file.path),
			calendar,
			importance: Number.isFinite(importanceRaw) && importanceRaw > 0 ? Math.min(5, importanceRaw) : 3,
			summary: typeof summaryRaw === "string" ? summaryRaw : undefined,
			participants: [],
			places: [],
			cultures: [],
			parents: [],
			adoptiveParents: [],
			partners: [],
			children: [],
			relations: [],
			parentCultures: [],
			childCultures: [],
			relatedCultures: [],
			territories: [],
			routes: [],
			knows: [],
			knownBy: [],
			causes: [],
			effects: [],
			issues,
		};
		e.icon = readIcon(fm.icon ?? fm["pin-icon"] ?? fm.pin_icon ?? fm.symbol);
		e.logo = this.resolveImage(fm.logo ?? fm.sigil ?? fm.crest ?? fm.emblem ?? fm.flag ?? fm["coat-of-arms"] ?? fm.coat_of_arms ?? fm.heraldry, file.path);
		e.category = readCategory(fm, e.tags, type);
		e.pinSize = readPinSize(fm);
		e.layer = readLayer(fm);
		const pop = fm.population ?? fm.pop ?? fm.inhabitants;
		const popN = typeof pop === "number" ? pop : typeof pop === "string" ? Number(pop.replace(/[,_\s]/g, "").replace(/^~|^c\.?/i, "")) : NaN;
		if (Number.isFinite(popN) && popN >= 0) e.population = popN;
		if (typeof fm.terrain === "string") e.terrain = fm.terrain.trim().toLowerCase();
		const rep = asText(fm.repeat ?? fm.repeats ?? fm.recurring ?? fm.recurs ?? (fm.annual === true ? "yearly" : "")).toLowerCase();
		e.repeat = /year|annual/.test(rep) ? "yearly" : /month/.test(rep) ? "monthly" : /week/.test(rep) ? "weekly" : undefined;
		// Cause and effect between events, written on either side.
		const linksOf = (...keys: string[]) => readRefs(keys.flatMap((k) => (fm[k] === undefined || fm[k] === null || fm[k] === "" ? [] : Array.isArray(fm[k]) ? (fm[k] as unknown[]) : [fm[k]])), resolve);
		e.causes = linksOf("caused-by", "caused_by", "because-of", "triggered-by");
		e.effects = linksOf("led-to", "led_to", "leads-to", "causes", "consequences", "resulted-in");
		// "knows: [[Secret]]" on a person, and "known-by: [[Person]]" on the secret (folded in later).
		const knowKeys = ["knows", "knowledge", "secrets", "aware-of"];
		e.knows = readTimedRefs(knowKeys.flatMap((k) => (fm[k] === undefined || fm[k] === null || fm[k] === "" ? [] : [{ alias: k, value: fm[k] }])), resolve, cal, knowKeys, issues);
		e.knownBy = readTimedRefs(["known-by", "known_by", "knownby"].flatMap((k) => (fm[k] === undefined || fm[k] === null || fm[k] === "" ? [] : [{ alias: k, value: fm[k] }])), resolve, cal, ["known-by", "known_by", "knownby"], issues);
		e.territories = this.readTerritories(fm.territory ?? fm.territories ?? fm.borders, file.path, 3, cal);
		e.routes = this.readTerritories(fm.routes ?? fm.route ?? fm.roads, file.path, 2, cal);
		e.holders = readHolders(holdersProperty(fm), resolve, cal);
		e.transfers = readTransfers(fm.transfers ?? fm["lands-changed"] ?? fm.cedes ?? fm.annexes, resolve);
		e.names = readNames(fm.names ?? fm["former-names"] ?? fm.renamed ?? fm["names-over-time"], cal);
		e.sides = readSides(fm.sides ?? fm.belligerents ?? fm.combatants, fm.victor ?? fm.victors ?? fm.winner, fm.defeated ?? fm.loser, resolve, fm.outcome ?? fm.result);
		e.occupied = readOccupied(fm.occupied ?? fm.occupations, resolve, cal);
		if (fm["occupied-areas"]) e.fronts = this.readTerritories(fm["occupied-areas"], file.path, 3, cal);
		if (fm.alliance ?? fm.coalition) e.alliance = readRefs(fm.alliance ?? fm.coalition, resolve);
		// The war a battle belongs to ("part-of" too, when it names an event: checked where it's used).
		const warLink = [fm.war, fm.campaign, fm.conflict, fm["part-of"]].find((v) => typeof v === "string" && v.trim());
		e.war = typeof warLink === "string" ? resolve(warLink.replace(/^\[\[|\]\]$/g, "").split("|")[0].trim()) : undefined;

		// Typed relations ("ruler: [[X]]", "mentor: [[Y]]") apply to every kind of note.
		e.relations = timed("relations");

		switch (type) {
			case "event":
				e.start = date("date");
				e.end = date("end");
				e.participants = refs("participants");
				e.places = refs("places");
				e.cultures = timed("cultures");
				break;
			case "person":
				e.start = date("born");
				e.end = date("died");
				e.parents = refs("parents");
				e.adoptiveParents = refs("adoptiveParents");
				e.partners = timed("partners");
				e.children = refs("children");
				e.cultures = timed("cultures");
				e.places = refs("places");
				e.birthPlace = refs("birthPlace")[0];
				e.deathPlace = refs("deathPlace")[0];
				e.gender = normalizeGender(reader.get("gender")) ?? genderFromTags(e.tags);
				break;
			case "culture":
				e.start = date("founded");
				e.end = date("dissolved");
				// A group listed as its own parent or branch is a slip; it would hide the group from charts.
				e.parentCultures = refs("parentCultures").filter((r) => r.key !== e.key);
				e.childCultures = refs("childCultures").filter((r) => r.key !== e.key);
				e.relatedCultures = timed("relatedCultures");
				e.places = refs("places");
				e.cultures = timed("cultures").filter((c) => c.ref.key !== e.key);
				// A realm or region can have its own pin, like a place.
				this.readPin(e, fm, reader, refs("map"));
				break;
			case "place": {
				e.start = date("founded");
				e.end = date("dissolved");
				this.readPin(e, fm, reader, refs("map"));
				e.locatedIn = refs("locatedIn").find((r) => r.key !== e.key);
				e.cultures = timed("cultures");
				break;
			}
			case "map":
				e.mapImage = this.resolveImage(reader.get("image"), file.path);
				e.image = undefined;
				// The map as it looked in other times: `images: [{ image: [[old.png]], to: SE 1 }, …]`.
				for (const item of ([] as unknown[]).concat(fm.images ?? fm.eras ?? [])) {
					if (!item || typeof item !== "object") continue;
					const o = item as Record<string, unknown>;
					const img = this.resolveImage(o.image ?? o.file ?? o.map, file.path);
					if (!img) {
						issues.push(`Couldn't find the map image ${asText(o.image ?? "")}`);
						continue;
					}
					const when = (v: unknown) => (v === undefined || v === null || v === "" ? undefined : parseDate(v, cal) ?? undefined);
					(e.mapImages ??= []).push({ image: img, from: when(o.from ?? o.since ?? o.start), to: when(o.to ?? o.until ?? o.end), name: typeof o.name === "string" ? o.name : undefined });
				}
				e.mapImage ??= e.mapImages?.[e.mapImages.length - 1]?.image;
				if (!e.mapImage) issues.push("Map has no image (add `image: [[my-map.png]]`)");
				break;
		}

		// A combined span such as "lifespan: 1262 - 1294 C.E." fills whichever end is missing.
		const lifespan = reader.get("lifespan");
		if (lifespan !== undefined && type !== "map") {
			const span = parseSpan(lifespan, cal);
			if (span.ok) {
				e.start ??= span.start;
				e.end ??= span.end;
				if (!span.end && /[-–]\s*(\?+|present|now|ongoing)?\s*$/i.test(asText(lifespan))) openEnd = true;
			} else if (!/^\s*[?~-]*\s*[-–]?\s*\?*\s*$/.test(asText(lifespan))) {
				issues.push(`Could not read lifespan "${asText(lifespan)}"`);
			}
		}
		if (type === "event" && !e.start) issues.push("Event has no date");
		if (openEnd && !e.end) e.openEnd = true;
		if (e.start && e.end && e.end.end < e.start.start) issues.push("End date is before start date");
		return e;
	}

	private computeDerived() {
		const add = <T>(map: Map<string, Set<T>>, key: string, v: T) => {
			let s = map.get(key);
			if (!s) map.set(key, (s = new Set()));
			s.add(v);
		};
		this.childrenOf = new Map();
		this.adoptiveChildrenOf = new Map();
		this.partnersOf = new Map();
		this.relationsOf = new Map();
		this.eventsOf = new Map();
		this.membersOf = new Map();
		this.subPlacesOf = new Map();
		this.placesOnMap = new Map();
		this.childCulturesOf = new Map();
		this.knowledgeOf = new Map();
		this.causesOf = new Map();
		this.effectsOf = new Map();

		const pushTimed = (map: Map<string, TimedRef[]>, key: string, link: TimedRef) => {
			const list = map.get(key) ?? [];
			if (!list.some((l) => l.ref.key === link.ref.key && l.kind === link.kind)) list.push(link);
			map.set(key, list);
		};
		const selfRef = (e: Entity): Ref => ({ key: e.key, name: e.name, resolved: true });
		const inferredRef = (e: Entity): Ref => ({ ...selfRef(e), inferred: true });
		for (const e of this.entities.values()) clearInferred(e);

		// Relationships written from the "other side" (children:, branches:, map ids) are folded in first,
		// so the rest of the index only has to follow one direction.
		const maps = [...this.entities.values()].filter((m) => m.type === "map");
		const mapById = new Map<string, Entity>();
		for (const m of maps) {
			const id = m.props.map_id ?? m.props["map-id"];
			if (typeof id === "string") mapById.set(id.toLowerCase(), m);
		}
		for (const e of this.entities.values()) {
			for (const c of e.children) {
				const child = this.entities.get(c.key);
				if (child && !child.parents.some((p) => p.key === e.key) && child.parents.length < 2) child.parents.push(inferredRef(e));
				else if (!child) add(this.childrenOf, e.key, c.key);
			}
			for (const b of e.childCultures) {
				const branch = this.entities.get(b.key);
				if (branch && !branch.parentCultures.some((p) => p.key === e.key)) branch.parentCultures.push(inferredRef(e));
			}
			if ((e.type === "place" || e.type === "culture") && !e.map && (e.mapHint || e.position)) {
				const hint = e.mapHint?.toLowerCase();
				const match =
					(hint && (mapById.get(hint) ?? maps.find((m) => m.name.toLowerCase() === hint) ??
						[...mapById.entries()].find(([id]) => id.startsWith(hint) || hint.startsWith(id))?.[1])) ||
					(e.position && maps.length === 1 ? maps[0] : undefined);
				if (match) e.map = inferredRef(match);
			}
		}

		// Families written as `relatives:` lines: relatives with no note can have parents, partners and children too.
		this.ghostParents = new Map();
		this.ghostNames = new Map();
		this.kinKeys = new Map();
		for (const e of this.entities.values()) {
			if (e.type !== "person") continue;
			const kin = parseKin(e.props.relatives ?? e.props.kin);
			if (!kin.parentOf.length && !kin.partners.length) continue;
			const seen = new Set<string>();
			this.kinKeys.set(e.key, seen);
			const refOf = (name: string): Ref => {
				const found = this.findByName(name);
				if (found) return { key: found.key, name: found.name, resolved: true, inferred: true };
				const key = "?" + name.toLowerCase();
				if (!this.ghostNames.has(key)) this.ghostNames.set(key, name);
				return { key, name, resolved: false, inferred: true };
			};
			for (const [parent, child] of kin.parentOf) {
				const p = refOf(parent);
				const c = refOf(child);
				seen.add(p.key).add(c.key);
				if (p.key === c.key) continue;
				add(this.childrenOf, p.key, c.key);
				const under = this.entities.get(c.key);
				const list = under ? under.parents : this.ghostParents.get(c.key) ?? [];
				if (!list.some((r) => r.key === p.key) && list.length < 2) list.push(p);
				if (!under) this.ghostParents.set(c.key, list);
			}
			for (const [a, b] of kin.partners) {
				const ra = refOf(a);
				const rb = refOf(b);
				seen.add(ra.key).add(rb.key);
				if (ra.key === rb.key) continue;
				pushTimed(this.partnersOf, ra.key, { ref: rb });
				pushTimed(this.partnersOf, rb.key, { ref: ra });
			}
		}

		for (const e of this.entities.values()) {
			for (const p of e.parents) add(this.childrenOf, p.key, e.key);
			for (const p of e.adoptiveParents) add(this.adoptiveChildrenOf, p.key, e.key);
			for (const p of e.partners) {
				pushTimed(this.partnersOf, e.key, p);
				pushTimed(this.partnersOf, p.ref.key, { ...p, ref: selfRef(e) });
			}
			for (const r of e.relations) {
				pushTimed(this.relationsOf, e.key, r);
				// The other note sees the inverse ("vassals" here is "liege" there).
				pushTimed(this.relationsOf, r.ref.key, { ...r, kind: relInverse(r.kind), ref: selfRef(e) });
			}
			if (e.type === "event") {
				for (const r of [...e.participants, ...e.places]) add(this.eventsOf, r.key, e.key);
				for (const c of e.cultures) add(this.eventsOf, c.ref.key, e.key);
			}
			if (e.type === "person" || e.type === "place") {
				for (const c of e.cultures) {
					const list = this.membersOf.get(c.ref.key) ?? [];
					list.push({ key: e.key, link: c });
					this.membersOf.set(c.ref.key, list);
				}
			}
			if (e.type === "place") {
				if (e.locatedIn) add(this.subPlacesOf, e.locatedIn.key, e.key);
				if (e.map) add(this.placesOnMap, e.map.key, e.key);
			}
			if (e.type === "culture") {
				for (const p of e.parentCultures) add(this.childCulturesOf, p.key, e.key);
			}
			for (const c of e.causes) {
				add(this.causesOf, e.key, c.key);
				add(this.effectsOf, c.key, e.key);
			}
			for (const x of e.effects) {
				add(this.effectsOf, e.key, x.key);
				add(this.causesOf, x.key, e.key);
			}
			// Knowledge, written on either side.
			for (const k of e.knows) pushTimed(this.knowledgeOf, e.key, k);
			for (const w of e.knownBy) pushTimed(this.knowledgeOf, w.ref.key, { ...w, ref: selfRef(e) });
		}
	}

	/** What each person knows about (secrets, events), from `knows:` on the person or `known-by:` on the secret. */
	knowledgeOf = new Map<string, TimedRef[]>();

	// ---- Queries -------------------------------------------------------------------------

	get(key: string | undefined): Entity | undefined {
		return key ? this.entities.get(key) : undefined;
	}

	findByName(name: string): Entity | undefined {
		const n = name.replace(/^\[\[|\]\]$/g, "").split("|")[0].trim();
		const direct = this.entities.get(n) ?? this.entities.get(n + ".md");
		if (direct) return direct;
		const key = this.byName.get(n.split("/").pop()!.toLowerCase());
		return key ? this.entities.get(key) : undefined;
	}

	all(type?: EntityType): Entity[] {
		const list = [...this.entities.values()];
		return type ? list.filter((e) => e.type === type) : list;
	}

	children(key: string, includeAdoptive = true): string[] {
		const out = new Set(this.childrenOf.get(key) ?? []);
		if (includeAdoptive) for (const c of this.adoptiveChildrenOf.get(key) ?? []) out.add(c);
		return [...out];
	}

	partners(key: string): TimedRef[] {
		return this.partnersOf.get(key) ?? [];
	}

	/** A person's parents; for a relative with no note, the ones their family lines give. */
	parentsOf(key: string): Ref[] {
		return this.entities.get(key)?.parents ?? this.ghostParents.get(key) ?? [];
	}

	/** The name of a relative with no note, as it was written. */
	ghostName(key: string): string | undefined {
		return this.ghostNames.get(key);
	}

	/** The note that talks about a relative with no note, where new lines about them are written: one that lists them, or whose family lines name them. */
	kinAnchor(key: string): Entity | undefined {
		for (const e of this.entities.values()) {
			if (e.type !== "person") continue;
			if ([...e.parents, ...e.children, ...e.partners.map((p) => p.ref)].some((r) => r.key === key) || this.kinKeys.get(e.key)?.has(key)) return e;
		}
		return undefined;
	}

	siblings(key: string): string[] {
		const out = new Set<string>();
		for (const p of this.parentsOf(key)) for (const c of this.children(p.key, false)) if (c !== key) out.add(c);
		return [...out];
	}

	events(key: string): Entity[] {
		return [...(this.eventsOf.get(key) ?? [])].map((k) => this.entities.get(k)!).filter(Boolean);
	}

	members(cultureKey: string) {
		return this.membersOf.get(cultureKey) ?? [];
	}

	/** Folders that contain entities, used for the "scope" picker (e.g. one folder per world). */
	topFolders(): string[] {
		const set = new Set<string>();
		for (const e of this.entities.values()) {
			const top = e.path.includes("/") ? e.path.split("/")[0] : "";
			if (top) set.add(top);
		}
		return [...set].sort();
	}

	/**
	 * A sensible starting scope: when top-level folders use different calendars (separate worlds),
	 * mixing them on one axis is meaningless, so pick the active note's world or the first one.
	 */
	defaultScope(activePath?: string): string | undefined {
		const folders = this.topFolders();
		if (folders.length < 2) return undefined;
		const calendars = new Set(folders.map((f) => this.dominantCalendar(f)));
		if (calendars.size < 2) return undefined;
		const top = activePath?.includes("/") ? activePath.split("/")[0] : undefined;
		return top && folders.includes(top) ? top : folders[0];
	}

	/** Most common calendar among entities in a folder scope. */
	dominantCalendar(folder?: string): string {
		const counts = new Map<string, number>();
		for (const e of this.entities.values()) {
			if (folder && !e.path.startsWith(folder + "/")) continue;
			counts.set(e.calendar, (counts.get(e.calendar) ?? 0) + 1);
		}
		let best = this.calendars.defaultId;
		let n = -1;
		for (const [c, k] of counts) if (k > n) [best, n] = [c, k];
		return best;
	}

	matches(e: Entity, f: EntityFilter): boolean {
		if (f.types && f.types.length && !f.types.includes(e.type)) return false;
		if (f.folder && !(e.path.startsWith(f.folder.replace(/\/$/, "") + "/"))) return false;
		if (f.minImportance && e.importance < f.minImportance) return false;
		if (f.search) {
			const q = f.search.toLowerCase();
			const hay = [e.name, ...e.tags, ...e.cultures.map((c) => c.ref.name), ...e.participants.map((p) => p.name), ...e.places.map((p) => p.name)]
				.join(" ").toLowerCase();
			if (!q.split(/\s+/).every((w) => hay.includes(w))) return false;
		}
		if (f.tags && f.tags.length) {
			const want = f.tags.map((t) => t.replace(/^#/, "").toLowerCase());
			if (!e.tags.some((t) => want.some((w) => t.toLowerCase() === w || t.toLowerCase().startsWith(w + "/")))) return false;
		}
		const keysOf = (names?: string[]) => (names ?? []).map((n) => this.findByName(n)?.key ?? "?" + n.toLowerCase());
		if (f.cultures && f.cultures.length) {
			const want = keysOf(f.cultures);
			const has = new Set([e.key, ...e.cultures.map((c) => c.ref.key)]);
			if (!want.some((w) => has.has(w))) return false;
		}
		if (f.people && f.people.length) {
			const want = keysOf(f.people);
			const has = new Set([e.key, ...e.participants.map((p) => p.key)]);
			if (!want.some((w) => has.has(w))) return false;
		}
		if (f.places && f.places.length) {
			const want = keysOf(f.places);
			const has = new Set([e.key, ...e.places.map((p) => p.key)]);
			if (!want.some((w) => has.has(w))) return false;
		}
		if (f.from !== undefined || f.to !== undefined) {
			const r = rangeOf(e);
			if (!r) return false;
			if (f.from !== undefined && r[1] < f.from) return false;
			if (f.to !== undefined && r[0] > f.to) return false;
		}
		return true;
	}

	/** Whether the entity exists at a given universal day (alive, founded, …). Unknown dates count as existing. */
	existsAt(e: Entity, day: number): boolean {
		if (e.start && e.start.start > day) return false;
		if (e.end && e.end.end < day) return false;
		return true;
	}
}

export function rangeOf(e: Entity): [number, number] | null {
	if (!e.start && !e.end) return null;
	const a = e.start?.start ?? e.end!.start;
	const b = e.end?.end ?? e.start!.end;
	return [Math.min(a, b), Math.max(a, b)];
}

export function activeAt(link: TimedRef, day: number): boolean {
	if (link.from && link.from.start > day) return false;
	if (link.to && link.to.end < day) return false;
	return true;
}

function normalizeFolder(f: string): string {
	const s = f.trim().replace(/\\/g, "/").replace(/^\/+/, "");
	return s.endsWith("/") ? s : s + "/";
}
