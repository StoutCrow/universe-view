import { findColourAreas } from "../src/render/colours";
import { kindFix, knownKindWords } from "../src/index/kindcheck";
import { formatDetails, parseDetails, splitDetails, splitParts } from "../src/index/ties";
import { ROW_ORDER, readMembers, rebuildMembers, rowOfKind, rowOfProperty, splitMembers, type GroupRow } from "../src/index/membership";
import { REL_KINDS } from "../src/index/relkinds";
import { holderTitle, rankTitle, styleFor, titleFor } from "../src/index/titles";
import { PLACE_KINDS, PLACE_ROLES, defaultKindsText, groupOfKind, knownKindsText, normaliseKind, resolvePlace, styleKeyOf, usualSize } from "../src/index/placekinds";
import { ROW_FORMATS, holdersProperty, readHolders, readOccupied, readSides, readTransfers, victorsOf } from "../src/index/periods";
import { checkBorders } from "../src/index/bordercheck";
import { boxOf, labelSpot, mainAxis, snapToNeighbour, unionOutline } from "../src/index/geometry";
import { nameSize, realmShape } from "../src/render/strategy";
import { touchHelp } from "../src/render/touchhelp";
import { everyoneLayout, generationName } from "../src/index/kinlayout";
import { categoryColor, categoryOf } from "../src/render/categories";
import { absorbGaps, brushShape, cutFrom, mergeInto, pocketsBetween, tidyRing, untangle } from "../src/index/merge";
import { alongRing, traceMask } from "../src/render/follow";
import { ROUGHNESS, cornerDistance, holdRadius, roughenRing } from "../src/index/rough";
import { simplifyShared } from "../src/index/simplify";
import { ribbon, smoothLine } from "../src/index/ribbon";
import { landFill } from "../src/render/landfill";
import { compareVersions, parseChangelog } from "../src/index/changelog";
import { readFileSync } from "fs";
import { join } from "path";
import { BUILT_IN_PRESETS, applyLook, currentLook, matchingPreset } from "../src/ui/mappresets";
import { occupationsAt, occupationsByLand, sidesOf } from "../src/index/wars";
import { MAX_UNDO, addBodyToStep, addToStep, changesBetween, readHistory, remember, renameInSteps, restoreFront, splitBody, writeHistory, type UndoStep } from "../src/index/undo";
import { clearInferred, noteSignature } from "../src/index/derived";
import { splitSpan } from "../src/index/text";
import { followPath, moveTarget } from "../src/index/moves";
import { isKindTag, kindLabel, markedType, readCategory, typeFromTag } from "../src/index/reader";
import { kindChoices } from "../src/index/kinds";
import { timeBoundaries, timeStep } from "../src/index/timesteps";
import { markPath, shapeFor } from "../src/render/categories";
import { historyOf } from "../src/render/history";
import { causePath, packRows, rowLayout, stackLevels } from "../src/render/timelinerows";
import { factsFromPath, standardTag, standardTagsFor, tagFixes } from "../src/index/tagrules";
import { dropEmptyProperties, quickAddFrontmatter, withFields } from "../src/import/quickadd";
import { addKinChildren, addKinPartner, addLinks, forgetKin, kinLines, parseKin, parseNames } from "../src/index/relatives";
import { dropEmpty, emptyKeys } from "../src/index/emptyprops";
import { cleanBody, readNote, sentencesOf, type ReadField } from "../src/detect/reader";
import { nameAt, nameRows, readNames, renamings, writeNames } from "../src/index/renames";
import { findOrphans } from "../src/index/tidy";
import { inRing, ringArea, splitRing } from "../src/index/geometry";
/* Unit tests for the pure parts (dates, calendars, GEDCOM). Run with `npm test`. */
import { CalendarRegistry, CustomCalendar, civilFromDays, daysFromCivil, holidaysOn, moonPhase, phaseName, seasonOf, yearTicks } from "../src/dates/calendars";
import { formatDate, parseDate, parseSpan } from "../src/dates/parser";
import { findKinship, guessType } from "../src/detect/classify";
import { convertGedcomDate, parseGedcom } from "../src/import/gedcom";
import { normalizeType, readCategory, readIcon, readLayer, readPair, readPinSize, readPoints, typeFromTag, writePoints } from "../src/index/reader";
import { asText, excerptOf } from "../src/index/text";
import { fillFrom, rasterize, simplifyRing, snapPoint, snapRing, traceOutlines } from "../src/render/fill";
import { settle } from "../src/render/layout";
import { cappedSize, levelFor, MAX_PIXELS, piecesIn } from "../src/render/bigimage";
import { TIER_NAME_PRESETS, tierPresetOf, chainOf, holdingsOf, natureOf, rankOf, realmTree, regionRankOf, setTierNames, tierLabel, tierName, tierRenamed, tierWordsWith } from "../src/index/realms";
import { shownAs, visibleTiers } from "../src/render/tiers";
import { fitRange } from "../src/render/layout";
import { buildGedcom, gedcomDate } from "../src/import/gedcom-export";
import { spacedLabels } from "../src/dates/calendars";
import { linkTarget, readTimedRefs } from "../src/index/reader";
import { days, parseScale, planJourney, terrainFactor } from "../src/render/travel";
import { totalPopulation } from "../src/index/tidy";
import { kinTerm, relationship } from "../src/index/kinship";
import { parseQuickAdd, quickAddFrontmatter } from "../src/import/quickadd";
import { lineOfSuccession } from "../src/index/succession";
import { generateNames, givenNames, seeded, tooClose, trainNames } from "../src/index/names";
import { findContradictions, findDuplicates, mergeFrontmatter, normName, relink } from "../src/index/tidy";
import { labelOutlines, partitionLand } from "../src/render/fill";
import { storyPrompts } from "../src/index/prompts";
import type { EntityType } from "../src/types";
import { validate } from "../src/index/validate";
import { findMapping, parseMapCategories, placeCategories, setMapping } from "../src/settings";
import { guessSetting, settingWords } from "../src/index/worldsetting";
import { CALENDAR_PRESETS, formatLeaps, formatMonths, monthIndex, parseHolidays, parseLeaps, parseMonths, parseMoons, parseSeasons } from "../src/dates/calendar-text";
import { knownTo } from "../src/index/knowledge";
import { pageName } from "../src/index/pagename";
import { detectCoast, detectLines, edgeColor, lineColorAt, traceBetween, waterLines } from "../src/render/trace";
import { presetKinds, relInverse, relKind, relLabel, relTone, setRankWords } from "../src/index/relkinds";
import { DEFAULT_FIELD_ALIASES } from "../src/settings";
import { applyMigration, factTag, kindTag, memberTag, migrateBodyTags, migrateTags, parseTag, tidyKinds, type MigrateNote, type MigrateTarget, type MigrateWords } from "../src/index/tagscheme";
import { DEFAULT_REGION_WORDS as SCHEME_REGIONS, DEFAULT_TIER_WORDS as SCHEME_TIERS } from "../src/index/realms";

let failed = 0;
let passed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
	const a = JSON.stringify(actual);
	const e = JSON.stringify(expected);
	if (a === e) passed++;
	else {
		failed++;
		console.error(`✗ ${label}\n    expected ${e}\n    got      ${a}`);
	}
}

const reg = new CalendarRegistry([
	{
		id: "vaelic",
		name: "Vaelic",
		epoch: 0,
		months: [
			{ name: "Frostwane", days: 36 }, { name: "Thawmoon", days: 36 }, { name: "Seedrise", days: 36 }, { name: "Greenmoot", days: 36 },
			{ name: "Highsun", days: 36 }, { name: "Emberfall", days: 36 }, { name: "Harvestide", days: 36 }, { name: "Mistveil", days: 36 },
			{ name: "Longnight", days: 36 }, { name: "Yearsend", days: 5 },
		],
		eras: [{ abbr: "FE", name: "First Era", startYear: 1 }, { abbr: "SE", name: "Second Era", startYear: 812 }],
	},
]);
const g = reg.get("gregorian");
const v = reg.get("vaelic");

// Gregorian round trips
for (const [y, m, d] of [[1970, 1, 1], [2000, 2, 29], [1, 1, 1], [-349, 3, 15], [1485, 8, 22]]) {
	eq(civilFromDays(daysFromCivil(y, m, d)), { y, m, d }, `civil round trip ${y}-${m}-${d}`);
}
eq(daysFromCivil(1970, 1, 1), 0, "epoch");

const fmt = (s: string, cal = g) => {
	const d = parseDate(s, cal);
	return d ? formatDate(d, cal) : null;
};
eq(fmt("1485-08-22"), "22 August 1485", "ISO day");
eq(fmt("1534-11"), "November 1534", "ISO month");
eq(fmt("1399"), "1399", "year");
eq(fmt("c. 1501"), "c. 1501", "circa");
eq(fmt("~1501"), "c. 1501", "tilde");
eq(fmt("1501?"), "c. 1501", "question mark");
eq(fmt("before 1240"), "before 1240", "before");
eq(fmt("after May 1240"), "after May 1240", "after");
eq(fmt("350 BCE"), "350 BCE", "BCE");
eq(fmt("-350"), "350 BCE", "negative year");
eq(fmt("14 May 1243"), "14 May 1243", "day month year");
eq(fmt("May 14, 1243"), "14 May 1243", "month day, year");
eq(fmt("May 1243"), "May 1243", "month year");
eq(fmt("1240..1245"), "1240–1245", "range");
eq(fmt("between 1850 and 1860"), "1850–1860", "between");
eq(fmt("nonsense"), null, "garbage");
eq(fmt("2023-13-01"), null, "bad month");
eq(parseDate(1210, g)?.precision, "year", "number input");
eq(parseDate("1243-05-14", g)!.start === parseDate("1243-05-14", g)!.end, true, "day is a point");
eq(parseDate("1243", g)!.end - parseDate("1243", g)!.start, 364, "year spans 365 days");

eq(fmt("SE 3", v), "SE 3", "era year");
eq(fmt("FE 790", v), "FE 790", "first era");
eq(fmt("14 Highsun SE 3", v), "14 Highsun SE 3", "custom month name");
eq(fmt("12 Seedrise FE 790", v), "12 Seedrise FE 790", "custom day");
eq(fmt("c. SE 40", v), "c. SE 40", "custom circa");
eq(parseDate("SE 1", v)!.start - parseDate("FE 811", v)!.start, 329, "era boundary is one year");
eq(fmt("14 Thawmoon SE 6", v), "14 Thawmoon SE 6", "thawmoon");

// Axis ticks align to era years
eq(yearTicks(v, 590, 1100, 200, 1000).map((t) => v.formatYear(t.year)), ["FE 600", "FE 800", "SE 1", "SE 200"], "era ticks");
eq(yearTicks(g, 1430, 1610, 50, 100).map((t) => t.year), [1450, 1500, 1550, 1600], "gregorian ticks");

// A calendar with eras written after the year (like a scholar's calendar: "1200 S.C.")
const kreg = new CalendarRegistry([
	{
		id: "scholars", name: "Scholar's Calendar", epoch: 0, eraAfter: true, defaultEra: "C.E.",
		months: [{ name: "Spring", days: 91 }, { name: "Summer", days: 91 }, { name: "Autumn", days: 91 }, { name: "Winter", days: 92 }],
		eras: [{ abbr: "A.E.", name: "Ancient Era", startYear: 1 }, { abbr: "C.A.", name: "Classical Age", startYear: 16369 }, { abbr: "C.E.", name: "Common Era", startYear: 18369 }],
	},
]);
const k = kreg.get("scholars");
eq(fmt("1262 C.E.", k), "1262 C.E.", "era after the year");
eq(fmt("1262", k), "1262 C.E.", "bare year uses the default era");
eq(fmt("1262 CE", k), "1262 C.E.", "era without dots");
eq(fmt("1 C.A.", k), "1 C.A.", "classical age");
eq(fmt("~8,000 A.E.", k), "c. 8000 A.E.", "thousands separator");
eq(parseDate("1 C.E.", k)!.start - parseDate("1 C.A.", k)!.start, 2000 * 365, "C.E. 1 is 2000 years after C.A. 1");

// Spans such as "lifespan: 1262 - 1294 C.E."
const span = (s: string, cal = g) => {
	const r = parseSpan(s, cal);
	return r.ok ? [r.start ? formatDate(r.start, cal) : null, r.end ? formatDate(r.end, cal) : null] : null;
};
eq(span("1262 - 1294 C.E."), ["1262", "1294"], "lifespan with trailing era");
eq(span("394 C.E. -"), ["394", null], "open-ended lifespan");
eq(span("~1200 - ???"), ["c. 1200", null], "approximate start, unknown end");
eq(span("FE 790 to SE 40", v), ["FE 790", "SE 40"], "custom calendar span");
eq(span("1914-7-28"), ["28 July 1914", null], "single date is a start");
eq(span("350 BCE - 300 BCE"), ["350 BCE", "300 BCE"], "BCE span");
eq(span("??? - ???"), null, "fully unknown");
eq(span("1262 - 1294 C.E.", k), ["1262 C.E.", "1294 C.E."], "span in an era-after calendar");
eq(span("394 C.E. -", k), ["394 C.E.", null], "open span in an era-after calendar");

// Type detection
const note = (p: string, body = "", props: Record<string, unknown> = {}) => ({ path: p, name: p.split("/").pop()!.replace(/\.md$/, ""), props, tags: [], body });
eq(guessType(note("Nature/Diseases/Blights/Blight of 1299.md", "The Blight of 1299 was a massive pestilence that spread.")).type, "event", "event despite concept-ish folders");
eq(guessType(note("Nature/Diseases/Blights/Blight of 1299.md", "The Blight of 1299 was a massive pestilence.")).suggestions.date, "1299", "year from name");
eq(guessType(note("Concepts/Society/Noble/Knight.md", "A knight is a mounted warrior.")).type, null, "concept note skipped");
eq(guessType(note("World/Greyford.md", "Greyford is the capital city of the Empire.")).type, "place", "place from description");
eq(guessType(note("World/North America.md"), { place: 2 }).type, "place", "place from incoming location links");
eq(guessType(note("Groups/House Whitmore.md", "House Whitmore is a royal house.")).type, "culture", "group");
eq(guessType(note("People/Ada.md", "", { born: "1200" })).type, "person", "person from properties");
eq(guessType(note("History/Timelines/Main Timeline.md", "This war was long.")).type, null, "timeline/index notes skipped");

// Relationships in prose
const kin = (name: string, body: string) => findKinship(name, body).map((k) => `${k.relation}:${k.target}${k.targetGender ? ":" + k.targetGender : ""}`);
eq(kin("James II Whitmore", "Born in the spring of 1273 to [[Henry I Whitmore]] and Queen [[Joanna Reyes]], he courted his future wife [[Mary Langley]]."),
	["parent:Henry I Whitmore", "parent:Joanna Reyes:f", "spouse:Mary Langley"], "born to … and …, future wife");
eq(kin("Edgar Whitmore", "Edgar Whitmore was the second son of [[William II Whitmore]] and tried to seize the throne from his older brother [[Edward Whitmore|Edward]]."),
	["parent:William II Whitmore"], "son of, sibling ignored");
eq(kin("Henry Whitmore", "The [[1928 Gala]] was held by [[Governor Cedric]] to commemorate his marriage to his wife [[Cecilia Hale]]."), [], "someone else's wife ignored");
eq(kin("Henry Whitmore", "The prince, despite being betrothed to [[Adeline Avery]], strayed."), ["betrothed:Adeline Avery"], "betrothed");
eq(kin("Arthur Harding", "Arthur Harding was the husband of [[Sarah Whitmore]], the elder sister of [[King Edward]]."), ["spouse:Sarah Whitmore"], "husband of");
eq(kin("House Whitmore", "House Whitmore was founded by [[William]], the son of [[King Henry]]."), [], "groups have no parents");
eq(kin("Henry I Whitmore", "King Henry expanded on the prosperity his father [[William II Whitmore|William]] began."), ["father:William II Whitmore"], "his father with alias");

// Coordinates
eq(readPair([51.5, -0.12]), [51.5, -0.12], "pair array");
eq(readPair("51.5, -0.12"), [51.5, -0.12], "pair string");
eq(readPair({ lat: 1, lng: 2 }), [1, 2], "pair object");
eq(readPair("x"), undefined, "pair bad");

// GEDCOM
eq(convertGedcomDate("12 MAR 1850"), "1850-03-12", "ged day");
eq(convertGedcomDate("ABT 1850"), "c. 1850", "ged abt");
eq(convertGedcomDate("BET 1850 AND 1860"), "1850..1860", "ged between");
eq(convertGedcomDate("BEF MAR 1850"), "before 1850-03", "ged before");
const ged = parseGedcom(`0 HEAD
0 @I1@ INDI
1 NAME John /Smith/
1 SEX M
1 BIRT
2 DATE 1 JAN 1900
2 PLAC Boston, Massachusetts
1 FAMS @F1@
0 @I2@ INDI
1 NAME Jane /Doe/
1 SEX F
1 FAMS @F1@
0 @I3@ INDI
1 NAME Baby /Smith/
1 FAMC @F1@
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 CHIL @I3@
1 MARR
2 DATE 1925
0 TRLR`);
eq(ged.people.size, 3, "ged people");
eq(ged.people.get("@I1@")!.name, "John Smith", "ged name");
eq(ged.people.get("@I1@")!.born, "1900-01-01", "ged born");
eq(ged.people.get("@I1@")!.birthPlace, "Boston, Massachusetts", "ged place");
eq(ged.families.get("@F1@")!.children, ["@I3@"], "ged children");
eq(ged.families.get("@F1@")!.married, "1925", "ged marriage");

// ---- Map data: territories, icons, categories ----
eq(readPoints("10,20 30,40 50,60"), [[10, 20], [30, 40], [50, 60]], "points from SVG-style string");
eq(readPoints([[1, 2], [3, 4], "5, 6"]), [[1, 2], [3, 4], [5, 6]], "points from list");
eq(readPoints(writePoints([[1.5, -2], [3, 4]])), [[1.5, -2], [3, 4]], "points round-trip");
eq(readIcon("LiCastle"), "castle", "Iconize name");
eq(readIcon("LiTreePalm"), "tree-palm", "Iconize multi-word name");
eq(readIcon("🏰"), "🏰", "emoji icon");
eq(readCategory({ kind: "City" }, [], "place"), "city", "kind property");
eq(readCategory({}, ["Fort"], "place"), "fort", "category from tag");
eq(readCategory({}, ["Place"], "place"), undefined, "generic tag is not a category");
eq(readCategory({ type: "kingdom" }, [], "culture"), "kingdom", "category from specific type");
eq(readCategory({ category: "place" }, [], "place"), undefined, "category: place is the type itself");
eq(parseMapCategories("port = anchor").get("port"), { icon: "anchor" }, "map categories: icon only");
eq(parseMapCategories("city = #c0392b, building-2").get("city"), { color: "#c0392b", icon: "building-2" }, "map categories");

// ---- Hover card excerpts ----
eq(
	excerptOf("---\ntype: person\n---\n# Henry\n> [!info] Box\nborn:: 1491\nHenry was the **second** son of [[Henry VII|the king]] and [[Elizabeth of York]], and became king in 1509."),
	"Henry was the second son of the king and Elizabeth of York, and became king in 1509.",
	"excerpt skips frontmatter, headings, callout titles, fields",
);
eq(excerptOf("short\n\nA much longer paragraph that is clearly the real description of this note.").startsWith("A much longer"), true, "excerpt prefers a real paragraph");
eq(excerptOf("word ".repeat(100), 40).endsWith("…"), true, "excerpt is cut at a word");
eq([asText("a"), asText(3), asText(true), asText(null), asText(undefined), asText(["x", 2]), asText({ k: 1 })], ["a", "3", "true", "", "", "x,2", '{"k":1}'], "property values as text");

// ---- Board layout ----
const lay = (r: { id: string; x: number; y: number }[]) => r.map((m) => `${m.id}:${m.x},${m.y}`).sort().join(" ");
eq(lay(settle([{ id: "a", x: 0, y: 5, w: 6, h: 3 }, { id: "b", x: 6, y: 9, w: 6, h: 3 }])), "a:0,0 b:6,0", "modules fall up");
eq(lay(settle([{ id: "a", x: 0, y: 0, w: 12, h: 3 }, { id: "b", x: 0, y: 0, w: 6, h: 2 }], "b")), "a:0,2 b:0,0", "moved module pushes others down");
eq(lay(settle([{ id: "a", x: 10, y: 0, w: 6, h: 2 }])), "a:6,0", "clamped into the grid");

// ---- Territory fill ----
{
	// 40×30 sea with an island (x 5–24, y 5–19) split by a dark border at x = 15 that has a 2 px gap,
	// a red "icon" speck inside the west half, and a separate islet at x 30–35.
	const W = 40;
	const H = 30;
	const data = new Uint8ClampedArray(W * H * 4);
	const put = (x: number, y: number, [r, g, b]: number[]) => data.set([r, g, b, 255], (y * W + x) * 4);
	for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) put(x, y, [40, 90, 160]);
	for (let y = 5; y < 20; y++) for (let x = 5; x < 25; x++) put(x, y, [225, 205, 160]);
	for (let y = 5; y < 20; y++) if (y < 11 || y > 12) put(15, y, [60, 40, 30]);
	for (let y = 8; y < 10; y++) for (let x = 8; x < 10; x++) put(x, y, [200, 30, 30]);
	for (let y = 10; y < 16; y++) for (let x = 30; x < 36; x++) put(x, y, [225, 205, 160]);
	const img = { data, width: W, height: H };
	const count = (m: Uint8Array) => m.reduce((s, v) => s + v, 0);
	const at = (m: Uint8Array, x: number, y: number) => m[y * W + x];
	const west = fillFrom(img, [10, 15], { tolerance: 14, seal: 2 });
	eq([at(west, 6, 6), at(west, 14, 18), at(west, 20, 10), at(west, 2, 2)], [1, 1, 0, 0], "fill stops at the coast and a broken border");
	eq(at(west, 8, 8), 1, "fill swallows icons inside the area");
	const leaky = fillFrom(img, [10, 15], { tolerance: 14, seal: 0 });
	eq(at(leaky, 20, 10), 1, "without gap closing the fill leaks through the gap");
	eq(at(leaky, 32, 12), 0, "fill doesn't jump the sea to another island");
	const blocked = new Uint8Array(W * H);
	rasterize(blocked, W, H, [[15, 0], [40, 0], [40, 30], [15, 30]]);
	eq(at(fillFrom(img, [10, 15], { tolerance: 14, seal: 0, blocked }), 20, 10), 0, "fill stops at other territories");
	const sea = fillFrom(img, [1, 1], { tolerance: 14, seal: 2 });
	eq([at(sea, 38, 28), at(sea, 10, 10)], [1, 0], "filling the sea leaves the land out");
	eq(count(fillFrom(img, [15, 6], { tolerance: 14, seal: 2 })) > 0, true, "a click on a border line still fills beside it");
	const rect = new Uint8Array(W * H);
	rasterize(rect, W, H, [[5, 5], [25, 5], [25, 20], [5, 20]]);
	eq(count(rect), 20 * 15, "rasterize a rectangle");
	const rings = traceOutlines(rect, W, H);
	eq(rings.length, 1, "one outline per blob");
	eq(simplifyRing(rings[0], 0.5).length, 4, "rectangle outline simplifies to 4 corners");
	const two = new Uint8Array(rect);
	rasterize(two, W, H, [[30, 10], [36, 10], [36, 16], [30, 16]]);
	eq(traceOutlines(two, W, H).length, 2, "islands get their own outlines");
	eq(snapPoint([10.5, 10.4], [[[0, 0], [10, 10], [20, 0]]], 2)?.kind, "vertex", "snap to a nearby corner");
	eq(snapPoint([5, 6], [[[0, 0], [10, 10], [20, 0]]], 2)?.p.map((n) => Math.round(n * 10) / 10), [5.5, 5.5], "snap onto a nearby edge");
	eq(snapPoint([50, 50], [[[0, 0], [10, 10], [20, 0]]], 2), null, "no snap when far away");
	eq(snapRing([[0.4, 0.2], [9.8, 0.1], [10, 10], [0, 10]], [[[0, 0], [10, 0], [10, -10]]], 1), [[0, 0], [10, 0], [10, 10], [0, 10]], "ring corners snap onto a neighbour");
}

// ---- Place size, layer and kind; folder settings ----
eq(readPinSize({ "pin-size": "Large" }), "large", "pin-size word");
eq(readPinSize({ size: 5 }), "huge", "size as a number 1–5");
eq(readPinSize({ size: 12000 }), undefined, "size that isn't a pin size is ignored");
eq(readPinSize({ size: "big", "pin-size": "tiny" }), "tiny", "pin-size wins over size");
eq(readLayer({ layer: 3 }), 3, "layer number");
eq(readLayer({ "map-layer": "layer 9" }), 5, "layer is clamped to 1–5");
eq(readLayer({}), undefined, "no layer");
eq(parseMapCategories("village = #8e6b3a, home, tiny, layer 4").get("village"), { color: "#8e6b3a", icon: "home", size: "tiny", layer: 4 }, "map categories with size and layer");
eq(parseMapCategories("region = layer: 1, huge").get("region"), { layer: 1, size: "huge" }, "size and layer only");
eq(setMapping("# comment\nPeople/ = person\nVael/ = place", "Vael", "event"), "# comment\nPeople/ = person\nVael/ = event", "replace a folder mapping");
eq(setMapping("People/ = person\nVael/ = place", "vael/", null), "People/ = person", "remove a folder mapping");
eq(setMapping("", "Worlds/America", "america"), "Worlds/America/ = america", "add a folder mapping");
eq(findMapping("People/ = person\n/Vael = vaelic", "Vael"), "vaelic", "find a folder mapping");

// ---- GEDCOM export ----
{
	const gd = (s: string) => parseDate(s, g)!;
	eq(gedcomDate(gd("1485-08-22"), g), "22 AUG 1485", "GEDCOM day date");
	eq(gedcomDate(gd("May 1491"), g), "MAY 1491", "GEDCOM month date");
	eq(gedcomDate(gd("c. 1480"), g), "ABT 1480", "GEDCOM approximate date");
	eq(gedcomDate(gd("before 1500"), g), "BEF 1500", "GEDCOM before");
	eq(gedcomDate(gd("350 BCE"), g), "350 B.C.", "GEDCOM BC year");
	eq(gedcomDate(parseDate("14 Highsun SE 3", v)!, v), "(14 Highsun SE 3)", "fictional dates become a date phrase");
	const person = (key: string, name: string, extra: Record<string, unknown> = {}) =>
		({ key, path: key, name, type: "person", calendar: "gregorian", props: {}, parents: [], cultures: [], partners: [], ...extra }) as unknown as import("../src/types").Entity;
	const ref = (k: string) => ({ key: k, name: k, resolved: true });
	const dad = person("Dad", "Henry VII", { gender: "male", start: gd("1457-01-28") });
	const mum = person("Mum", "Elizabeth of York", { gender: "female" });
	const kid = person("Kid", "Henry VIII", { gender: "male", parents: [ref("Dad"), ref("Mum")], start: gd("1491-06-28") });
	const all = [dad, mum, kid];
	const ged = buildGedcom({
		people: all,
		get: (k) => all.find((p) => p.key === k),
		partners: (k) => (k === "Dad" ? [{ ref: ref("Mum"), from: gd("1486-01-18") }] : k === "Mum" ? [{ ref: ref("Dad"), from: gd("1486-01-18") }] : []),
		calendar: () => g,
	}, new Date(2026, 0, 2));
	eq(ged.split("\n").filter((l) => l.endsWith(" FAM")).length, 1, "parents and partners make one family");
	eq(ged.includes("1 HUSB @I1@") && ged.includes("1 WIFE @I2@") && ged.includes("1 CHIL @I3@"), true, "family members");
	eq(ged.includes("2 DATE 18 JAN 1486"), true, "marriage date");
	eq(ged.includes("1 FAMC @F1@"), true, "child points to its family");
	eq(ged.trim().endsWith("0 TRLR"), true, "GEDCOM trailer");
	// Re-import what was exported.
	const back = parseGedcom(ged);
	eq(back.people.size, 3, "exported GEDCOM imports again");
}

// ---- Axis labels, links, travel time, role clashes ----
{
	const ticks = [{ x: 0, label: "FE 700" }, { x: 60, label: "FE 800" }, { x: 72, label: "SE 1", era: true }, { x: 160, label: "SE 100", major: true }];
	eq([...spacedLabels(ticks)].map((t) => t.label).sort(), ["FE 700", "SE 1", "SE 100"], "era start wins an overlapping axis label");
	eq(linkTarget("[[Vael/People/Aldric Vane|Aldric]]"), "Aldric Vane", "link target with folder and alias");
	eq(linkTarget({ culture: "[[Order of the Ash]]", role: "Knight" }), "Order of the Ash", "link target in an object");
	eq(linkTarget("plain text"), "plain text", "plain name");
	eq(days(0.25), "about 6 hours", "travel: hours");
	eq(days(1.1), "1 day", "travel: one day");
	eq(days(3.3), "3.5 days", "travel: half days");
	eq(days(120), "about 17 weeks", "travel: weeks");
	const d = (s: string) => parseDate(s, g)!;
	const people = new Map<string, unknown>([
		["A", { key: "A", name: "Alice", type: "person", issues: [], parents: [], adoptiveParents: [], participants: [], places: [], parentCultures: [], partners: [], cultures: [], relations: [] }],
		["B", { key: "B", name: "Bob", type: "person", issues: [], parents: [], adoptiveParents: [], participants: [], places: [], parentCultures: [], partners: [], cultures: [], relations: [], end: d("1520") }],
		["G", { key: "G", name: "Guild", type: "culture", issues: [], parents: [], adoptiveParents: [], participants: [], places: [], parentCultures: [], partners: [], cultures: [], relations: [] }],
	]);
	(people.get("B") as { cultures: unknown[] }).cultures = [{ ref: { key: "G", name: "Guild", resolved: true }, role: "Master", from: d("1530") }];
	const fakeIndex = {
		entities: people,
		get: (k: string) => people.get(k),
		members: (k: string) => (k === "G" ? [
			{ key: "A", link: { ref: { key: "G" }, role: "Grand Master", from: d("1500"), to: d("1520") } },
			{ key: "B", link: { ref: { key: "G" }, role: "Grand Master", from: d("1510") } },
		] : []),
	};
	const issues = validate(fakeIndex as never).map((i) => i.message);
	eq(issues.some((m) => m.includes("Alice and Bob are both grand master")), true, "two holders of a one-person role at once");
	eq(issues.some((m) => m.includes("Becomes Master of Guild after their death")), true, "role starting after death");
}

// ---- Kinship ----
{
	// A family: G (grandfather) → P1, P2; P1 → A, Sib (half via another mother); P2 → C; C → D.
	const parents: Record<string, string[]> = { P1: ["G"], P2: ["G"], A: ["P1", "M1"], Sib: ["P1", "M2"], Full: ["P1", "M1"], C: ["P2"], D: ["C"] };
	const genders: Record<string, "m" | "f"> = { G: "m", P1: "m", P2: "f", A: "m", Sib: "f", Full: "m", C: "f", D: "m", W: "f" };
	const kg = { parents: (k: string) => parents[k] ?? [], partners: (k: string) => (k === "A" ? ["W"] : k === "W" ? ["A"] : []), gender: (k: string) => genders[k] };
	eq(relationship(kg, "A", "G")?.label, "grandfather", "kin: grandfather");
	eq(relationship(kg, "A", "Sib")?.label, "half-sister", "kin: half-sister");
	eq(relationship(kg, "A", "Full")?.label, "brother", "kin: brother");
	eq(relationship(kg, "A", "C")?.label, "first cousin", "kin: first cousin");
	eq(relationship(kg, "A", "D")?.label, "first cousin once removed", "kin: cousin once removed");
	eq(relationship(kg, "A", "P2")?.label, "aunt", "kin: aunt");
	eq(relationship(kg, "A", "W")?.label, "wife", "kin: wife");
	eq(relationship(kg, "W", "P1")?.label, "father-in-law", "kin: father-in-law");
	eq(relationship(kg, "A", "C")?.path, ["A", "P1", "G", "P2", "C"], "kin: path through common ancestor");
	eq(kinTerm(3, 4, "m"), "second cousin once removed", "kin term: second cousin once removed");
	eq(relationship(kg, "A", "nobody"), null, "kin: unrelated");
}

// ---- Quick add ----
{
	const known: Record<string, EntityType> = { "Thornwood": "place", "Aldric Vane": "person", "Mira Thorne": "person", "Order of the Ash": "culture" };
	const ctx = { find: (n: string) => (known[n] ? { name: n, type: known[n] } : undefined), isDate: (s: string) => !!parseDate(s, v) };
	const q = parseQuickAdd("Battle of Thornwood, SE 22, at Thornwood, Aldric Vane vs Mira Thorne", ctx);
	eq([q.type, q.name, q.date, q.places, q.participants], ["event", "Battle of Thornwood", "SE 22", ["Thornwood"], ["Aldric Vane", "Mira Thorne"]], "quick add: battle");
	const p = parseQuickAdd("Tamsin Vane, born SE 3, daughter of Aldric Vane and Mira Thorne, #knight", ctx);
	eq([p.type, p.date, p.parents, p.tags], ["person", "SE 3", ["Aldric Vane", "Mira Thorne"], ["knight"]], "quick add: person");
	eq(quickAddFrontmatter(p).parents, ["[[Aldric Vane]]", "[[Mira Thorne]]"], "quick add: frontmatter links");
	const c = parseQuickAdd("Order of the Grey, founded SE 50, led by Aldric Vane", ctx);
	eq([c.type, c.date, c.leaders], ["culture", "SE 50", ["Aldric Vane"]], "quick add: group");
	eq(parseQuickAdd("Something odd, blorp", ctx).unknown, ["blorp"], "quick add: unknown parts reported");
}

// ---- Journeys ----
{
	const road = { points: [[0, 0], [100, 0]] as [number, number][], kind: "road", name: "Road" };
	const dist = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
	const j = planJourney([road], [0, 5], [100, 5], { dist, speed: () => 60, footSpeed: 30, join: 3, access: 10 });
	eq(j.legs.map((l) => l.kind), ["foot", "road", "foot"], "journey uses the road");
	eq(Math.round(j.days * 100) / 100, Math.round((10 / 30 + 100 / 60) * 100) / 100, "journey time");
	const direct = planJourney([road], [0, 50], [10, 50], { dist, speed: () => 60, footSpeed: 30, join: 3, access: 10 });
	eq(direct.legs.map((l) => l.kind), ["foot"], "short trips walk straight there");
	eq(parseScale("100 px = 40 km"), { perPx: 0.4, unit: "km" }, "map scale");
}

// ---- Succession ----
{
	const d = (y: number) => parseDate(String(y), g)!.start;
	const kids: Record<string, string[]> = { K: ["D1", "S1", "S2"], S1: ["GS"], P: ["K", "U"], U: ["C1"] };
	const born: Record<string, number> = { K: d(1450), D1: d(1470), S1: d(1472), S2: d(1475), GS: d(1495), U: d(1452), C1: d(1480) };
	const died: Record<string, number> = { S1: d(1500) };
	const sex: Record<string, "m" | "f"> = { K: "m", D1: "f", S1: "m", S2: "m", GS: "m", P: "m", U: "m", C1: "f" };
	const parentsOf = (k: string) => Object.entries(kids).filter(([, c]) => c.includes(k)).map(([p]) => p);
	const sg = { children: (k: string) => kids[k] ?? [], parents: parentsOf, born: (k: string) => born[k], died: (k: string) => died[k], gender: (k: string) => sex[k] };
	const at = d(1510);
	eq(lineOfSuccession(sg, "K", at, "absolute").map((h) => h.key), ["D1", "GS", "S2", "U", "C1"], "succession: eldest first, dead heir's son keeps his place");
	eq(lineOfSuccession(sg, "K", at, "male-preference").map((h) => h.key), ["GS", "S2", "D1", "U", "C1"], "succession: sons before daughters");
	eq(lineOfSuccession(sg, "K", at, "agnatic").map((h) => h.key), ["GS", "S2", "U"], "succession: sons only");
	eq(lineOfSuccession(sg, "K", d(1490), "absolute").map((h) => h.key), ["D1", "S1", "S2", "U", "C1"], "succession: unborn grandson not yet in line");
}

// ---- Name generator ----
{
	const model = trainNames(givenNames(["Aldric Vane", "Edric Vane", "Bran Vane", "Tamsin Vane", "Rowan Vane", "Lysa Marrow", "Mira Thorne", "Corin Hale", "Wren Bell", "King Aldwin"]));
	const made = generateNames(model, 6, seeded(42));
	eq(made.length > 0 && made.every((n) => /^[A-Z][a-z'’-]+$/.test(n)), true, "names: generated names look like names");
	eq(made.some((n) => ["Aldric", "Edric", "Bran", "Tamsin"].includes(n)), false, "names: no existing names");
	eq(generateNames(model, 6, seeded(42)), made, "names: same seed, same names");
	eq(givenNames(["Sir Corin Hale", "Queen Mira"]), ["Corin", "Mira"], "names: titles dropped");
	eq([tooClose("Argaret", ["margaret"]), tooClose("Elizabethur", ["elizabeth"]), tooClose("Marga", ["margaret"]), tooClose("Brandon", ["bran"]), tooClose("Wrenna", ["wren"]), tooClose("Margarey", ["margaret"]), tooClose("Edrin", ["edric"])], [true, true, false, false, false, true, false], "names: near copies are turned down, new names that share a start aren't");
}

// ---- Tidying ----
{
	const ent = (key: string, name: string, type: EntityType, extra: Record<string, unknown> = {}) =>
		({ key, path: key, name, type, parents: [], children: [], partners: [], cultures: [], relations: [], places: [], participants: [], parentCultures: [], territories: [], ...extra }) as unknown as import("../src/types").Entity;
	const dupes = findDuplicates([ent("a", "Aldric Vane", "person"), ent("b", "Sir Aldric Vane", "person"), ent("c", "Aldric", "person"), ent("d", "Greyford", "place"), ent("e", "Greyforde", "place"), ent("f", "Aldric Vane", "place")]);
	eq(dupes.map((p) => `${p.a.key}${p.b.key}`), ["ab", "de", "ac", "bc"].filter((x) => dupes.some((p) => `${p.a.key}${p.b.key}` === x)), "duplicates found by name");
	eq(dupes[0].reason, "Same name", "duplicates: exact name first");
	eq(dupes.some((p) => p.a.type !== p.b.type), false, "duplicates only within a type");
	eq(normName("The King Aldric, Vane"), "aldric vane", "normalised names");
	eq(mergeFrontmatter({ type: "person", parents: ["[[A]]"], born: 1 }, { parents: ["[[A]]", "[[B]]"], born: 2, summary: "x" }), { type: "person", parents: ["[[A]]", "[[B]]"], born: 1, summary: "x" }, "merge keeps the keeper's values and joins lists");
	eq(relink("See [[Aldric]] and [[People/Aldric|him]] and [[Aldric#Youth]] but not [[Aldrico]]", "Aldric", "Aldric Vane"), "See [[Aldric Vane]] and [[Aldric Vane|him]] and [[Aldric Vane#Youth]] but not [[Aldrico]]", "relink keeps aliases and headings");
	const dd = (s: string) => parseDate(s, g)!;
	const person = { path: "Henry.md", name: "Henry VIII", type: "person" as const, start: dd("1491-06-28"), end: dd("1547-01-28") };
	const c1 = findContradictions(person, "Henry was born in 1495 at Greenwich. His father was born in 1457.", (s) => parseDate(s, g), () => undefined, (x) => formatDate(x, g));
	eq(c1.length, 1, "contradiction: own birth year, not the father's");
	const c2 = findContradictions({ path: "x.md", name: "X", type: "event" }, "Present: [[Henry VIII]] (1491 – 1550).", (s) => parseDate(s, g), (n) => (n === "Henry VIII" ? person : undefined), (x) => formatDate(x, g));
	eq(c2.length === 1 && c2[0].about === "Henry.md", true, "contradiction: dates after a link");
	eq(findContradictions(person, "He was born in 1491.", (s) => parseDate(s, g), () => undefined, (x) => formatDate(x, g)).length, 0, "no contradiction when they agree");
}

// ---- Borders from seats ----
{
	// Two seats on one island (x 5–34), a sea to the right: the island is split between them.
	const W = 50;
	const H = 20;
	const data = new Uint8ClampedArray(W * H * 4);
	for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) data.set(x >= 5 && x < 35 && y >= 3 && y < 17 ? [220, 200, 150, 255] : [40, 90, 160, 255], (y * W + x) * 4);
	const labels = partitionLand({ data, width: W, height: H }, [{ x: 8, y: 10, label: 1 }, { x: 30, y: 10, label: 2 }], { tolerance: 14, seal: 0 });
	eq([labels[10 * W + 10], labels[10 * W + 28], labels[10 * W + 45]], [1, 2, 0], "borders: land shared out, sea left alone");
	eq(labelOutlines(labels, W, H, 1).length, 1, "borders: one outline per realm");
}

// ---- Story prompts ----
{
	const dd = (s: string) => parseDate(s, g)!;
	const mk = (key: string, type: EntityType, extra: Record<string, unknown> = {}) =>
		({ key, path: "W/" + key, name: key, type, calendar: "gregorian", parents: [], children: [], partners: [], cultures: [], relations: [], relatedCultures: [], places: [], participants: [], parentCultures: [], ...extra }) as unknown as import("../src/types").Entity;
	const A = mk("A", "culture", { start: dd("1400"), relatedCultures: [{ ref: { key: "B", name: "B" }, kind: "rival" }] });
	const B = mk("B", "culture", { start: dd("1410") });
	const kid = mk("Kid", "person", { start: dd("1450") });
	const ents = [A, B, kid];
	const pi = { all: (t?: string) => ents.filter((e) => !t || e.type === t), get: (k: string) => ents.find((e) => e.key === k), children: () => [], partners: () => [], members: () => [], events: () => [], subPlacesOf: new Map() };
	const ps = storyPrompts(pi as never, undefined, (d) => String(g.fromDays(d).y), seeded(7), 10);
	eq(ps.some((p) => p.kind === "rivals") && ps.some((p) => p.kind === "age"), true, "story prompts from rivals and a coming of age");
}

// ---- Terrain and population ----
{
	const mountains = { poly: [[10, -10], [20, -10], [20, 10], [10, 10]] as [number, number][], factor: 3 };
	eq(terrainFactor([0, 0], [5, 0], [mountains]), 1, "terrain: open country");
	eq(terrainFactor([0, 0], [30, 0], [mountains]), 1.5, "terrain: a quarter of the way through mountains (3× slower) averages 1.5×");
	const dist = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
	const around = { points: [[0, 0], [0, 15], [30, 15], [30, 0]] as [number, number][], kind: "road" };
	const j = planJourney([around], [0, 0], [30, 0], { dist, speed: () => 60, footSpeed: 30, join: 1, access: 2, slow: (a, b) => terrainFactor(a, b, [mountains]) });
	eq(j.legs.some((l) => l.kind === "road"), true, "journey goes round the mountains by road");
	const places = new Map<string, Record<string, unknown>>([["R", {}], ["A", { population: 1000 }], ["B", { population: 500 }], ["C", {}], ["D", { population: 250 }]]);
	const subs = new Map([["R", new Set(["A", "B", "C"])], ["C", new Set(["D"])]]);
	const pidx = { get: (k: string) => places.get(k) as never, subPlacesOf: subs };
	eq(totalPopulation(pidx, "R"), { total: 1750, counted: 3 }, "population adds up nested places");
	eq(totalPopulation(pidx, "A"), { total: 1000, counted: 1 }, "population: own figure wins");
	eq(totalPopulation({ get: () => ({}) as never, subPlacesOf: new Map() }, "X"), undefined, "population: unknown");
}

// ---- Coasts and roads from a map image ----
{
	const W = 200;
	const H = 140;
	const data = new Uint8ClampedArray(W * H * 4);
	const paint = (x: number, y: number, c: [number, number, number]) => {
		const i = (y * W + x) * 4;
		[data[i], data[i + 1], data[i + 2], data[i + 3]] = [...c, 255];
	};
	const sea: [number, number, number] = [70, 120, 170];
	const sand: [number, number, number] = [225, 205, 160];
	const road: [number, number, number] = [120, 70, 30];
	for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) paint(x, y, sea);
	// Wavy lines on the sea that must not count as land.
	for (let x = 0; x < W; x++) for (const y0 of [10, 125]) paint(x, y0 + Math.round(Math.sin(x / 4)), [200, 220, 235]);
	// An island (ellipse) and a small rock.
	for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (((x - 100) / 70) ** 2 + ((y - 70) / 45) ** 2 <= 1) paint(x, y, sand);
	for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) paint(10 + x, 60 + y, sand);
	// A river in the sea's colour running inland, 3 px wide: the coast mustn't run up it.
	for (let y = 100; y < 117; y++) for (let x = 99; x < 102; x++) paint(x, y, sea);
	// A frame line round the map, cutting the sea off from the image's edge.
	for (let x = 0; x < W; x++) for (const y of [3, H - 4]) paint(x, y, [60, 50, 40]);
	for (let y = 0; y < H; y++) for (const x of [3, W - 4]) paint(x, y, [60, 50, 40]);
	// A dashed road across the island, 2 px wide, 6 on and 4 off.
	for (let x = 50; x <= 150; x++) if ((x - 50) % 10 < 6) for (const y of [69, 70]) paint(x, y, road);
	const img = { data, width: W, height: H };
	eq(edgeColor(img), sea, "coast: the sea's colour comes from the image's edge");
	const coast = detectCoast(img, { tolerance: 14, smooth: 2, minIsland: 80 });
	eq(coast.rings.length, 1, "coast: one island; waves and the tiny rock are left out");
	const xs = coast.rings[0].map((p) => p[0]);
	eq([Math.round(Math.min(...xs)) <= 32, Math.round(Math.max(...xs)) >= 168], [true, true], "coast: the outline spans the island");
	eq(coast.share > 0.6 && coast.share < 0.8, true, "coast: about 3/4 of the image is sea");
	eq(coast.water[108 * W + 100], 0, "coast: a river in the sea's colour stays land");
	const clicked = detectCoast(img, { tolerance: 14, smooth: 2, minIsland: 20 }, [[5, 30]]);
	eq(clicked.rings.length, 2, "coast: with a lower island size, the rock is land too");
	const roads = detectLines(img, [100, 72], { tolerance: 16, gap: 6, minLength: 20, connected: true });
	eq(roads?.lines.length, 1, "roads: the dashed road is one line");
	const line = roads!.lines[0];
	const span = Math.abs(line[line.length - 1][0] - line[0][0]);
	eq(span > 90 && span < 110, true, "roads: it runs the length of the road");
	eq(line.every((p) => Math.abs(p[1] - 70) < 3), true, "roads: along the road's centre");
	// Following a bent road between two clicks: it keeps to the road instead of cutting the corner.
	{
		const W2 = 120;
		const H2 = 120;
		const d2 = new Uint8ClampedArray(W2 * H2 * 4);
		for (let i = 0; i < W2 * H2; i++) d2.set([225, 205, 160, 255], i * 4);
		const dot = (x: number, y: number) => d2.set([120, 70, 30, 255], (y * W2 + x) * 4);
		// An L-shaped dashed road: right along y=20, then down x=100.
		for (let x = 10; x <= 100; x++) if (x % 8 < 5) for (const y of [19, 20]) dot(x, y);
		for (let y = 20; y <= 110; y++) if (y % 8 < 5) for (const x of [99, 100]) dot(x, y);
		const im2 = { data: d2, width: W2, height: H2 };
		const picked = lineColorAt(im2, 30, 22);
		eq(picked?.color, [120, 70, 30], "trace: the road's colour is found next to the click");
		const path = traceBetween(im2, [10, 20], [100, 110], [120, 70, 30], 12);
		const corner = path.some((p) => Math.abs(p[0] - 100) < 4 && Math.abs(p[1] - 20) < 4);
		eq(corner, true, "trace: the path goes round the bend");
		eq(path.every((p) => Math.abs(p[1] - 20) < 4 || Math.abs(p[0] - 100) < 4), true, "trace: and stays on the road");
	}
	eq(detectLines(img, [100, 30], { tolerance: 16, gap: 6, minLength: 20, connected: true })?.lines.length ?? 0, 0, "roads: clicking plain land finds nothing");
}

// ---- Relationship kinds ----
{
	eq(relKind("Allies")?.key, "allies", "relations: names are matched loosely");
	eq(relKind("ally")?.key, "allies", "relations: singular works");
	eq(relKind("overlord")?.key, "liege", "relations: synonyms work");
	eq(relInverse("vassals"), "liege", "relations: vassals seen from the vassal is liege");
	eq(relInverse("rivals"), "rivals", "relations: rivals both ways");
	eq(relInverse("sworn-brother"), "sworn-brother", "relations: unknown kinds stay as written");
	eq(relLabel("mentor", true), "Students", "relations: label from the other side");
	eq([relTone("at war with"), relTone("pact"), relTone("trade")], ["hostile", "ally", "trade"], "relations: tone guessed from words");
	eq(presetKinds("culture").includes("trade-partners") && !presetKinds("culture").includes("students"), true, "relations: group presets");
	eq(presetKinds("person", "allies, rivals"), ["allies", "rivals"], "relations: presets from the setting");
	eq(DEFAULT_FIELD_ALIASES.relations.includes("enemies") && !DEFAULT_FIELD_ALIASES.relations.includes("founded"), true, "relations: read as relations, but founded stays a date");
}

// ---- Calendars: leap years, weeks, festivals, moons, seasons ----
{
	const leap = new CustomCalendar({
		id: "t", name: "Test", epoch: 0, eras: [],
		months: [{ name: "One", days: 30 }, { name: "Midfeast", days: 2, intercalary: true }, { name: "Two", days: 30 }],
		weekdays: ["A", "B", "C", "D", "E"],
		leaps: [{ month: 2, every: 4, except: 100, unless: 400 }],
		moons: [{ name: "Selune", cycle: 10, offset: 0 }],
		seasons: [{ name: "Warm", month: 1, day: 10 }, { name: "Cold", month: 3, day: 1 }],
		holidays: [{ name: "Lantern Night", month: 3, day: 15 }, { name: "Jubilee", month: 1, day: 1, every: 5 }],
	});
	eq([leap.yearDays(3), leap.yearDays(4), leap.yearDays(100), leap.yearDays(400)], [62, 63, 62, 63], "calendar: leap days every 4, not every 100, but every 400");
	let ok = true;
	for (const y of [-401, -5, -1, 0, 1, 3, 4, 5, 99, 100, 101, 399, 400, 401, 1234]) {
		for (let m = 1; m <= 3; m++) for (const d of [1, leap.monthDays(y, m)]) {
			const back = leap.fromDays(leap.toDays(y, m, d));
			if (back.y !== y || back.m !== m || back.d !== d) ok = false;
		}
	}
	eq(ok, true, "calendar: every date converts to days and back, around leap years and before year 1");
	eq(leap.toDays(2, 1, 1) - leap.toDays(1, 1, 1), 62, "calendar: a common year is 62 days");
	eq(leap.weekdayOf(leap.toDays(1, 1, 1)), 0, "calendar: year 1 starts on the first weekday");
	eq(leap.weekdayOf(leap.toDays(1, 2, 1)), -1, "calendar: festival days are outside the week");
	// One has 30 days (6 weeks of 5), so Two starts on the first weekday again, festival days skipped.
	eq(leap.weekdayOf(leap.toDays(1, 3, 1)), 0, "calendar: festival days don't move the weekday");
	eq(leap.weekdayOf(leap.toDays(4, 3, 1)), leap.weekdayOf(leap.toDays(4, 1, 1)), "calendar: even with a leap festival day");
	eq(Math.round(moonPhase(leap.toDays(1, 1, 6), leap.moons[0]) * 100) / 100, 0.5, "calendar: moon full halfway through its cycle");
	eq(seasonOf(leap, leap.toDays(5, 1, 5))?.name, "Cold", "calendar: a season carries over the new year");
	eq(seasonOf(leap, leap.toDays(5, 1, 12))?.name, "Warm", "calendar: then the next one starts");
	eq(holidaysOn(leap, leap.toDays(7, 3, 15)).map((h) => h.name), ["Lantern Night"], "calendar: yearly holiday");
	eq([holidaysOn(leap, leap.toDays(10, 1, 1)).length, holidaysOn(leap, leap.toDays(11, 1, 1)).length], [1, 0], "calendar: holiday every 5 years");
	const g = reg.get("gregorian");
	eq(g.weekdays[g.weekdayOf(daysFromCivil(2026, 10, 27))], "Tuesday", "gregorian: weekday");
	eq(phaseName(moonPhase(daysFromCivil(2024, 4, 8), g.moons[0])), "New moon", "gregorian: the moon at the 2024 eclipse was new");
	eq(seasonOf(g, daysFromCivil(2026, 1, 5))?.name, "Winter", "gregorian: January is winter");
}

// ---- Calendar parts written as lines ----
{
	const months = parseMonths("Thaw = 30\nMidfeast = 1, festival\nHighsun = 31");
	eq(months, [{ name: "Thaw", days: 30 }, { name: "Midfeast", days: 1, intercalary: true }, { name: "Highsun", days: 31 }], "calendar text: months and festival days");
	eq(formatMonths(months), "Thaw = 30\nMidfeast = 1, festival\nHighsun = 31", "calendar text: months round trip");
	const leaps = parseLeaps("Midfeast = every 4, except 100, unless 400", months);
	eq(leaps, [{ month: 2, every: 4, except: 100, unless: 400 }], "calendar text: leap rule");
	eq(parseLeaps(formatLeaps(leaps, months), months), leaps, "calendar text: leap round trip");
	eq(parseMoons("Selune = 30.4 days, offset 3, #cfd8ff\nBroken = soon"), [{ name: "Selune", cycle: 30.4, offset: 3, color: "#cfd8ff" }], "calendar text: moons, bad lines skipped");
	eq(parseSeasons("Spring = Thaw 1, #6abf69\nSummer = 5 Highsun", months), [{ name: "Spring", month: 1, day: 1, color: "#6abf69" }, { name: "Summer", month: 3, day: 5 }], "calendar text: seasons either way round");
	eq(parseHolidays("Lantern Night = high 15, every 2", months), [{ name: "Lantern Night", month: 3, day: 15, every: 2 }], "calendar text: holidays, month by its start");
	eq(monthIndex(months, "2"), 2, "calendar text: month by number");
	for (const p of CALENDAR_PRESETS) {
		const c = new CustomCalendar({ id: p.id, name: p.name, ...p.make() });
		const d = c.toDays(5, 2, 3);
		const back = c.fromDays(d);
		eq([back.y, back.m, back.d], [5, 2, 3], `calendar preset works: ${p.name}`);
	}
}

// ---- Fog of war ----
{
	const mk = (key: string, type: string, extra: Record<string, unknown> = {}) => ({ key, path: key, name: key, type, importance: 3, parents: [], adoptiveParents: [], places: [], participants: [], cultures: [], partners: [], relations: [], knows: [], knownBy: [], ...extra }) as never;
	const ref = (key: string) => ({ key, name: key, resolved: true });
	const d = (n: number) => ({ start: n, end: n, precision: "day", approx: false, calendar: "g", raw: "" });
	const ents = new Map<string, Record<string, unknown>>([
		["Ana", mk("Ana", "person", { parents: [ref("Mum")], cultures: [{ ref: ref("Guild"), from: d(10) }] })],
		["Mum", mk("Mum", "person")],
		["Guild", mk("Guild", "culture")],
		["Boss", mk("Boss", "person", { cultures: [{ ref: ref("Guild"), role: "Guild master" }] })],
		["Town", mk("Town", "place", { locatedIn: ref("Realm") })],
		["Realm", mk("Realm", "place")],
		["Fair", mk("Fair", "event", { start: d(5), participants: [ref("Ana"), ref("Bo")], places: [ref("Town")] })],
		["Bo", mk("Bo", "person")],
		["Secret", mk("Secret", "event", { start: d(1) })],
		["War", mk("War", "event", { start: d(50), importance: 5 })],
		["Far", mk("Far", "place")],
	]);
	const kidx = {
		all: (t?: string) => [...ents.values()].filter((e) => !t || e.type === t) as never[],
		get: (k: string) => ents.get(k) as never,
		children: (k: string) => (k === "Mum" ? ["Ana"] : []),
		partners: () => [],
		members: (k: string) => (k === "Guild" ? [{ key: "Boss", link: { ref: ref("Guild"), role: "Guild master" } }, { key: "Ana", link: { ref: ref("Guild") } }] : []),
		knowledgeOf: new Map([["Ana", [{ ref: ref("Secret"), from: d(30) }]]]),
		relationsOf: new Map(),
		scenes: [],
	};
	const all = knownTo(kidx as never, "Ana");
	eq(["Mum", "Guild", "Boss", "Fair", "Bo", "Town", "Realm", "Secret", "War"].every((k) => all.has(k)), true, "fog: family, group and leader, events and those there, places and their region, secrets, famous events");
	eq(all.has("Far"), false, "fog: not places she's never heard of");
	const early = knownTo(kidx as never, "Ana", { at: 20 });
	eq([early.has("Fair"), early.has("Guild"), early.has("Secret"), early.has("War")], [true, true, false, false], "fog: by a date, only what she'd learned by then");
}

// ---- Website page names ----
{
	const taken = new Set<string>(["index.html"]);
	eq([pageName({ name: "Élise d'Arc", path: "a" }, taken), pageName({ name: "Elise d Arc", path: "b" }, taken), pageName({ name: "Index", path: "c" }, taken), pageName({ name: "???", path: "d" }, taken)], ["elise-d-arc.html", "elise-d-arc-2.html", "index-2.html", "note.html"], "website: page names are readable, unique and safe");
}

// ---- Huge map images ----
{
	const [w, h] = cappedSize(16192, 14696);
	eq([w * h <= MAX_PIXELS, Math.abs(w / h - 16192 / 14696) < 0.01, cappedSize(2000, 1000).join("x")], [true, true, "2000x1000"], "big image: capped to the budget, same shape; small ones untouched");
	const p = { width: 16000, height: 8000, levels: [8000, 4000, 2000, 1000].map((x) => ({ src: null as never, width: x, height: x / 2 })) };
	eq([levelFor(p, 0.4).width, levelFor(p, 0.2).width, levelFor(p, 0.01).width, levelFor(p, 2).width], [8000, 4000, 1000, 8000], "big image: the smallest copy that's sharp enough, else the largest");
	eq([piecesIn(0, 0, 100, 100, 4, 3).join(), piecesIn(1000, 1000, 100, 100, 4, 3).join(), piecesIn(3000, 2000, 5000, 5000, 4, 3).join(), piecesIn(1024, 0, 1024, 10, 4, 3).join()], ["0", "0,1,4,5", "6,7,10,11", "1"], "big image: the pieces a view needs, edges included");
}
// ---- Lands within a realm ----
eq(["Province", "Duchy", "Region_Medium", "Realm", "Nation_United_States"].map((t) => typeFromTag(t, "")), ["place", "place", null, "culture", null], "tags: provinces and duchies are places; realms are groups");
// ---- Realms: who holds what, under whom ----
{
	const ref = (key: string, resolved = true) => ({ key, name: key.replace(/^\?/, "").split("/").pop()!.replace(/\.md$/, ""), resolved });
	const mk = (path: string, type: string, extra: Record<string, unknown> = {}) => {
		const name = path.split("/").pop()!.replace(/\.md$/, "");
		return { key: path, path, name, type, folder: path.slice(0, path.lastIndexOf("/")), tags: [], props: {}, cultures: [], relations: [], parentCultures: [], places: [], territories: [], ...extra } as never;
	};
	const ents: Record<string, unknown>[] = [
		mk("W/United States/United States.md", "culture", { tags: ["Realm", "Region_Huge"], places: [ref("W/North America/North America.md"), ref("W/Washington.md")], props: { seat: "[[Washington]]" }, relations: [{ ref: ref("W/James.md"), kind: "ruler" }] }),
		mk("W/United States/California/California.md", "place", { tags: ["Province", "Nation_United_States"], locatedIn: ref("W/North America/North America.md"), relations: [{ ref: ref("W/James.md"), kind: "lord" }] }),
		mk("W/United States/California/Los Angeles County/Los Angeles County.md", "place", { tags: ["Region_Small"], locatedIn: ref("W/North America/North America.md") }),
		mk("W/United States/California/Orange County/Orange County.md", "place", { tags: ["Province", "Region_Small"], locatedIn: ref("W/United States/California/California.md"), relations: [{ ref: ref("?lena ortiz", false), kind: "lord" }], cultures: [{ ref: ref("?house ortiz", false) }] }),
		mk("W/North America/North America.md", "culture", { tags: ["Realm"] }),
		mk("W/Washington.md", "place", { tags: ["City"] }),
		mk("W/James.md", "person", { cultures: [{ ref: ref("W/House Whitmore.md") }] }),
		mk("W/House Whitmore.md", "culture", { tags: ["Family"] }),
	];
	const src = { all: () => ents as never[], get: (k?: string) => ents.find((e) => e.key === k) as never, findByName: (n: string) => ents.find((e) => e.name === n) as never };
	const tree = realmTree(src, (c) => (c.tags as string[]).includes("Family"));
	const name = (k?: string) => (k ? k.split("/").pop()!.replace(/\.md$/, "") : "");
	eq(chainOf(tree, "W/United States/California/Los Angeles County/Los Angeles County.md").map(name), ["North America", "United States", "California", "Los Angeles County"], "realms: a county's chain follows folder notes over a too-high location");
	eq(name(tree.nodes.get("W/United States/California/Orange County/Orange County.md")?.under), "California", "realms: an explicit location that fits wins");
	const nelian = tree.nodes.get("W/United States/California/Orange County/Orange County.md")!;
	eq([nelian.holder?.name, nelian.house?.name, nelian.ruler?.name], ["lena ortiz", "house ortiz", "James"], "realms: holder and house without notes yet, ruler from the top");
	eq([tree.nodes.get("W/United States/California/California.md")!.house?.name, tree.nodes.has("W/House Whitmore.md")], ["House Whitmore", false], "realms: house from the holder; houses aren't titles");
	eq(holdingsOf(tree, "W/James.md").map(name), ["United States", "California"], "realms: what a person holds, largest first");
	eq([rankOf(ents[0] as never), rankOf(ents[1] as never), rankOf(ents[2] as never)], [1.6, 3, 9], "realms: tiers from tags, sized by Region_Huge/Small, not by Nation_X (a bare Region_Small is geography)");
	eq([natureOf(ents[0] as never), natureOf(ents[2] as never), regionRankOf(ents[2] as never)], ["realm", "region", 3.5], "realms: #Realm with #Region_Huge is a realm; #Region_Small alone is a region");
}
// ---- Loose ends: house members have family; one person written twice ----
{
	const mk = (path: string, type: string, extra: Record<string, unknown> = {}) => {
		const name = path.split("/").pop()!.replace(/\.md$/, "");
		return { key: path, path, name, type, folder: "", tags: [], props: {}, cultures: [], relations: [], parentCultures: [], places: [], territories: [], routes: [], parents: [], children: [], participants: [], relatedCultures: [], childCultures: [], knows: [], knownBy: [], ...extra } as never;
	};
	const house = mk("House Whitmore.md", "culture", { tags: ["Family"] });
	const ents = [
		house,
		mk("Carl Whitmore.md", "person", { cultures: [{ ref: { key: "House Whitmore.md", name: "House Whitmore", resolved: true } }] }),
		mk("James II Whitmore.md", "person", { props: { aliases: ["James II", "King James II"] } }),
		mk("King James II.md", "person", { props: { aliases: ["James II"] } }),
		mk("Lone.md", "person"),
	];
	const idx = { all: (t?: string) => (ents as { type: string }[]).filter((e) => !t || e.type === t) as never[], get: (k: string) => ents.find((e) => (e as { key: string }).key === k) as never, children: () => [], partners: () => [], events: () => [], members: () => [], subPlacesOf: new Map() };
	const found = findOrphans(idx as never, () => 1);
	const has = (name: string, problem: string) => found.some((o) => o.e.name === name && o.problem === problem);
	eq([has("Carl Whitmore", "no-family"), has("Lone", "no-family")], [false, true], "loose ends: a house member has a family");
	eq([has("King James II", "duplicate"), has("James II Whitmore", "duplicate"), has("Lone", "duplicate")], [true, true, false], "loose ends: two notes sharing a name are flagged as duplicates");
}
// ---- Importing borders from a coloured map ----
{
	const w = 120;
	const h = 80;
	const data = new Uint8ClampedArray(w * h * 4);
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const i = (y * w + x) * 4;
			// White paper round the edge, a red realm on the left, a blue one on the right, a black border between.
			const edge = x < 5 || y < 5 || x >= w - 5 || y >= h - 5;
			const rgb = edge ? [250, 250, 250] : x === 60 ? [10, 10, 10] : x < 60 ? [200, 40, 40] : [40, 70, 200];
			data.set([...rgb, 255], i);
		}
	}
	const found = findColourAreas({ data, width: w, height: h }, 2);
	const kinds = found.map((a) => (a.rgb[0] > a.rgb[2] ? "red" : "blue")).sort();
	eq(kinds, ["blue", "red"], "colour import: the two realms are found, not the paper or the border");
	const red = found.find((a) => a.rgb[0] > a.rgb[2])!;
	const xs = red.rings[0].map((p) => p[0]);
	eq([Math.min(...xs) <= 12, Math.max(...xs) >= 110 && Math.max(...xs) <= 124], [true, true], "colour import: outlines are scaled up to the full picture");
}
// ---- Holders over time; lands changing hands ----
{
	const d = (n: number) => ({ start: n, end: n, precision: "year" }) as never;
	const ref = (key: string) => ({ key, name: key.replace(/\.md$/, ""), resolved: true });
	const mk = (path: string, type: string, extra: Record<string, unknown> = {}) => ({ key: path, path, name: path.replace(/\.md$/, ""), type, folder: "", tags: [], props: {}, cultures: [], relations: [], parentCultures: [], places: [], territories: [], ...extra }) as never;
	const ents = [
		mk("United States.md", "culture", { tags: ["Realm"] }),
		mk("Mexico.md", "culture", { tags: ["Realm"] }),
		mk("Los Angeles County.md", "place", { tags: ["Title", "County"], holders: [{ ref: ref("William.md"), from: d(100), to: d(199) }, { ref: ref("Henry.md"), from: d(200) }] }),
		mk("War.md", "event", { start: d(150), transfers: [{ land: ref("Los Angeles County.md"), from: ref("United States.md"), to: ref("Mexico.md") }] }),
	];
	const src = { all: () => ents as never[], get: (k?: string) => ents.find((e) => (e as { key: string }).key === k) as never, findByName: (n: string) => ents.find((e) => (e as { name: string }).name === n) as never };
	const at = (day?: number) => realmTree(src, () => false, day).nodes.get("Los Angeles County.md")!;
	eq([at(120).under, at(160).under, at(undefined).under], ["United States.md", "Mexico.md", "Mexico.md"], "transfers: a land answers to the old realm before the war and the new one after");
	eq([at(120).holder?.name, at(250).holder?.name, at(undefined).holder?.name, at(50).holder], ["William", "Henry", "Henry", undefined], "holders: who held it on the day; now; nobody before the first");
}
// ---- Names over time ----
{
	const g = new CalendarRegistry([], "gregorian").get("gregorian");
	const names = readNames([{ name: "New Amsterdam", to: "1663" }, "New York (1664 – 1897)", "Greater New York: from 1898"], g)!;
	const e = { name: "New York", names } as never;
	const day = (y: number) => g.toDays(y, 6, 1);
	eq([nameAt(e, day(1650)), nameAt(e, day(1800)), nameAt(e, day(1950)), nameAt(e, undefined)], ["New Amsterdam", "New York", "Greater New York", "New York"], "names: the name for a date, and the note's own without one");
	eq(renamings(e).map((r) => `${r.before ?? ""}>${r.name}`), ["New Amsterdam>New York", "New York>Greater New York"], "names: each renaming with the name before it");
}
// ---- Splitting an area along a line ----
{
	const sq: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10]];
	const parts = splitRing(sq, [[5, -2], [5, 12]]);
	eq(parts ? parts.map((r) => Math.round(ringArea(r))) : null, [50, 50], "split: a square cut down the middle makes two halves");
	const bent = splitRing(sq, [[-1, 3], [4, 3], [4, 11]]);
	eq(bent ? bent.map((r) => Math.round(ringArea(r))).sort((a, b) => a - b) : null, [28, 72], "split: a bent cut keeps its corner");
	eq(splitRing(sq, [[2, 2], [3, 3]]), null, "split: a line that never leaves the area cuts nothing");
	eq([inRing([5, 5], sq), inRing([11, 5], sq)], [true, false], "split: inside and outside");
}
// ---- Regions are geography: they hold realms' land but rule nothing ----
{
	const mk = (path: string, type: string, extra: Record<string, unknown> = {}) => {
		const name = path.split("/").pop()!.replace(/\.md$/, "");
		return { key: path, path, name, type, folder: path.slice(0, path.lastIndexOf("/")), tags: [], props: {}, cultures: [], relations: [], parentCultures: [], places: [], territories: [], ...extra } as never;
	};
	const ents: Record<string, unknown>[] = [
		mk("K/The Americas/The Americas.md", "place", { tags: ["Region", "Region_Gigantic"] }),
		mk("K/The Americas/North America/North America.md", "place", { tags: ["Region", "Region_Enormous"] }),
		mk("K/The Americas/North America/United States/United States.md", "place", { tags: ["Title", "Realm", "Region", "Region_Huge"] }),
		mk("K/The Americas/North America/United States/West Coast/West Coast.md", "place", { tags: ["Region"] }),
		mk("K/The Americas/North America/United States/West Coast/California/California.md", "place", { tags: ["Title", "Province", "Region_Small"] }),
		mk("K/The Americas/North America/Great Plains.md", "place", { tags: ["Realm"], props: { polity: "region" } }),
	];
	const src = { all: () => ents as never[], get: (k?: string) => ents.find((e) => e.key === k) as never, findByName: (n: string) => ents.find((e) => e.name === n) as never };
	const tree = realmTree(src, () => false);
	const n = (k: string) => tree.nodes.get(k)!;
	const name = (k?: string) => (k ? k.split("/").pop()!.replace(/\.md$/, "") : "");
	eq([n("K/The Americas/The Americas.md").nature, n("K/The Americas/North America/North America.md").nature, n("K/The Americas/North America/United States/United States.md").nature], ["region", "region", "realm"], "regions: continents and sub-continents are geography, United States is a realm");
	eq([tierLabel(n("K/The Americas/The Americas.md")), tierLabel(n("K/The Americas/North America/North America.md")), tierLabel(n("K/The Americas/North America/United States/United States.md"))], ["Continent", "Sub-continent", "Kingdom"], "regions: named on their own scale");
	eq([name(n("K/The Americas/North America/United States/United States.md").under), name(n("K/The Americas/North America/United States/United States.md").region)], ["", "North America"], "regions: a kingdom in a sub-continent is sovereign, and lies in it");
	eq([name(n("K/The Americas/North America/United States/West Coast/California/California.md").under), name(n("K/The Americas/North America/United States/West Coast/California/California.md").region)], ["United States", "West Coast"], "regions: a province in a region of a kingdom answers to the kingdom");
	eq([name(n("K/The Americas/North America/United States/West Coast/West Coast.md").under), n("K/The Americas/North America/North America.md").holder], ["United States", undefined], "regions: a region inside a realm is part of it; no one holds a region");
	eq(n("K/The Americas/North America/Great Plains.md").nature, "region", "regions: polity: region says so outright");
}
// ---- Following a neighbour's border or the coast between two snapped points ----
{
	const sq: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10]];
	eq(alongRing(sq, 0.5, 2), [[10, 0]], "follow: a neighbour's corners between two points on its border");
	eq(alongRing(sq, 0.5, 3.5), [[0, 0]], "follow: the shorter way round");
	eq(alongRing(sq, 1, 1.5), [], "follow: nothing between two points on one edge");
	const w = 30, h = 30;
	const mask = new Uint8Array(w * h);
	for (let x = 2; x <= 20; x++) mask[2 * w + x] = 1;
	for (let y = 2; y <= 20; y++) mask[y * w + 20] = 1;
	const path = traceMask(mask, w, h, [2, 2], [20, 20], 0.8)!;
	const onMask = path.every(([x, y]) => mask[Math.floor(y) * w + Math.floor(x)]);
	const byCorner = path.some(([x, y]) => Math.hypot(x - 20.5, y - 2.5) <= 1.5);
	eq([path.length > 0, onMask, byCorner], [true, true, true], "follow: along the coast round its corner, not straight across");
	eq(traceMask(new Uint8Array(w * h), w, h, [2, 2], [20, 20]), null, "follow: nothing to follow, no path");
	// A river with a 2-pixel break (a faint stretch): stepped over, still along the river.
	const broken = mask.slice();
	broken[10 * w + 20] = 0;
	broken[11 * w + 20] = 0;
	const across = traceMask(broken, w, h, [2, 2], [20, 20], 0.8);
	eq([!!across, (across ?? []).some(([x, y]) => Math.hypot(x - 20.5, y - 2.5) <= 1.5)], [true, true], "follow: a small break in a river is stepped over, not cut across");
	// A deep inlet: the coast runs far from the straight line and back (much more than 4x the distance).
	const W = 60;
	const inlet = new Uint8Array(W * W);
	for (let y = 2; y <= 50; y++) inlet[y * W + 10] = inlet[y * W + 14] = 1;
	for (let x = 10; x <= 14; x++) inlet[50 * W + x] = 1;
	const deep = traceMask(inlet, W, W, [10, 2], [14, 2], 0.8);
	eq([!!deep, (deep ?? []).some(([, y]) => y > 45)], [true, true], "follow: a deep inlet is followed all the way in and out");
	// Land between two separate stretches of water, wider than a small break: no path across it.
	const apart = new Uint8Array(w * h);
	for (let x = 2; x <= 10; x++) apart[5 * w + x] = 1;
	for (let x = 15; x <= 25; x++) apart[5 * w + x] = 1;
	eq(traceMask(apart, w, h, [2, 5], [25, 5]), null, "follow: never across land wider than a small break");
}
// ---- Border check: gaps over dry land, sub-lands beside their liege, pockets where lands meet ----
{
	const sq = (x: number, y: number, w: number, h: number): [number, number][] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
	const edge = (x: number, y0: number, y1: number, steps: number): [number, number][] => Array.from({ length: steps + 1 }, (_, i) => [x, y0 + ((y1 - y0) * i) / steps] as [number, number]);
	// A liege and a sub-land drawn beside it, 20 apart (wider than a hairline) on a 10,000-wide map.
	const liege: [number, number][] = [[0, 0], ...edge(1000, 0, 1000, 8), [0, 1000]];
	const sub: [number, number][] = [...edge(1020, 1000, 0, 8), [2000, 0], [2000, 1000]];
	const areas = [
		{ key: "L", name: "Liege", n: 0, points: liege, chain: ["L"] },
		{ key: "S", name: "Sub", n: 0, points: sub, chain: ["L", "S"] },
	];
	const dry = checkBorders(areas, { mapSize: 10000, isWater: () => false }).filter((i) => i.kind === "gap");
	const wet = checkBorders(areas, { mapSize: 10000, isWater: () => true }).filter((i) => i.kind === "gap");
	eq([dry.length, wet.length], [1, 0], "border check: a strip of dry land between a liege and a sub-land beside it is a gap; water there is a river");
	const pockets = pocketsBetween([sq(0, 0, 10, 10), sq(12, 0, 10, 10), sq(0, 10, 22, 10), sq(0, -10, 22, 10)], 100);
	eq([pockets.length, Math.round(Math.abs(ringArea(pockets[0] ?? [])))], [1, 20], "pockets: the hole left where lands meet");
	// A border saved next to its neighbours takes in the hole it leaves between them; a big hole is left.
	const ring = sq(0, 0, 10, 10);
	const others = [sq(12, 0, 10, 10), sq(0, 10, 22, 10), sq(0, -10, 22, 10)];
	eq(Math.round(Math.abs(ringArea(absorbGaps(ring, others, 100)))), 120, "gaps: a border takes in the small gap it leaves between its neighbours");
	eq(Math.round(Math.abs(ringArea(absorbGaps(ring, others, 10)))), 100, "gaps: a gap bigger than the limit is left alone");
	eq(absorbGaps(ring, [sq(50, 50, 5, 5)], 100), ring, "gaps: with no gap beside it, the border is saved as drawn");
}
// ---- Roughened borders: shown only, shared edges wobble alike ----
{
	const a: [number, number][] = [[0, 0], [100, 0], [100, 100], [0, 100]];
	const b: [number, number][] = [[100, 0], [200, 0], [200, 100], [100, 100]];
	const ra = roughenRing(a, ROUGHNESS.medium, 10);
	const rb = roughenRing(b, ROUGHNESS.medium, 10);
	// b has an extra corner in the middle of the border it shares with a: the two must still draw one line.
	const b2: [number, number][] = [[100, 0], [200, 0], [200, 100], [100, 100], [100, 40]];
	const near = cornerDistance([a, b2], holdRadius(10));
	const sa = roughenRing(a, ROUGHNESS.medium, 10, near);
	const sb = roughenRing(b2, ROUGHNESS.medium, 10, near);
	const segDist = (p: [number, number], poly: [number, number][]) => {
		let best = Infinity;
		for (let i = 0; i + 1 < poly.length; i++) {
			const [x1, y1] = poly[i];
			const [x2, y2] = poly[i + 1];
			const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2 || 1;
			const t = Math.max(0, Math.min(1, ((p[0] - x1) * (x2 - x1) + (p[1] - y1) * (y2 - y1)) / l2));
			best = Math.min(best, Math.hypot(p[0] - (x1 + t * (x2 - x1)), p[1] - (y1 + t * (y2 - y1))));
		}
		return best;
	};
	// a's ring runs (100,0), the wobble down x=100, then (100,100): take that stretch in order.
	const iA = sa.findIndex((p) => p[0] === 100 && p[1] === 0);
	const iA2 = sa.findIndex((p) => p[0] === 100 && p[1] === 100);
	const stretchA = sa.slice(iA, iA2 + 1);
	const stretchB = sb.filter((p) => p[0] > 60 && p[0] < 140 && p[1] > 2 && p[1] < 98);
	eq([stretchA.length > 8, stretchB.length > 8, stretchB.every((p) => segDist(p, stretchA) < 1.2)], [true, true, true], "roughen: a shared border draws one line even where one land has an extra corner");	eq([ra.length > a.length, rb.length > b.length, a.every((p) => ra.some((q) => q[0] === p[0] && q[1] === p[1]))], [true, true, true], "roughen: every editable corner is kept, wobble added between");
	eq(Math.abs(Math.abs(ringArea(ra)) - 10000) < 2500, true, "roughen: the land stays about the same size");
	const coast: [number, number][] = [[0, 0], [4, 1], [8, 0], [8, 4], [4, 5], [0, 4]];
	eq(roughenRing(coast, ROUGHNESS.strong, 10), coast, "roughen: short, already-detailed edges are left alone");
	eq(roughenRing(a, 0, 10), a, "roughen: off draws the border as stored");
}
// ---- Simplify: fewer corners, shared borders still shared, real detail kept ----
{
	// A jittery shared edge down x=100 (tiny wobbles), and a deep notch on the left that matters.
	const jitter: [number, number][] = [[100, 20], [100.3, 40], [99.8, 60], [100.2, 80]];
	const a: [number, number][] = [[0, 0], [100, 0], ...jitter, [100, 100], [0, 100], [0, 60], [30, 50], [0, 40]];
	const b: [number, number][] = [[100, 0], [200, 0], [200, 100], [100, 100], ...[...jitter].reverse()];
	const res = simplifyShared(a, [b], 2);
	const shared = (r: [number, number][]) => r.filter(([x]) => x > 99 && x < 101).length;
	eq([res.ring.length < a.length, res.others[0] !== null, shared(res.ring), shared(res.others[0] ?? b)], [true, true, 2, 2], "simplify: a jittery shared edge loses its wobbles on both sides");
	eq(res.ring.some(([x, y]) => x === 30 && y === 50), true, "simplify: a notch bigger than the tolerance stays");
	// The neighbour has a corner of its own on the shared stretch: those corners must stay.
	const b2: [number, number][] = [[100, 0], [200, 0], [200, 100], [100, 100], [100.2, 80], [99.8, 60], [100.1, 50], [100.3, 40], [100, 20]];
	const res2 = simplifyShared(a, [b2], 2);
	eq([res2.ring.some(([x, y]) => x === 99.8 && y === 60), res2.ring.some(([x, y]) => x === 100.3 && y === 40)], [true, true], "simplify: corners next to a neighbour's own corner are kept");
	const island: [number, number][] = [[0, 0], [50, 0.5], [100, 0], [100, 100], [50, 99.5], [0, 100]];
	eq(simplifyShared(island, [], 2).ring.length, 4, "simplify: a lone island is simplified whole");
	// While drawing, only this border changes: every corner a neighbour shares stays, and the neighbour is untouched.
	const kept = simplifyShared(a, [b], 2, true);
	eq([kept.others[0], shared(kept.ring), kept.ring.length], [null, 6, a.length], "simplify: keepShared keeps every corner a neighbour shares and leaves the neighbour alone");
}
// ---- What's new: the changelog read into versions ----
{
	const md = readFileSync(join(__dirname, "..", "..", "CHANGELOG.md"), "utf8");
	const entries = parseChangelog(md);
	const versions = entries.map((e) => e.version);
	const one = entries.find((e) => e.version === "1.0.0");
	eq([versions.every((v, i) => i === 0 || compareVersions(versions[i - 1], v) > 0), one?.date.startsWith("2026"), one?.body.includes("### Map editing")], [true, true, true], "changelog: newest first, each with its date and its sections");
	eq([versions.includes("0.25.0 – 0.25.5"), versions.includes("0.7.0"), versions.includes("0.26.0")], [true, true, true], "changelog: every version, ranges and the first included");
	eq(entries.every((e) => e.body.length > 0), true, "changelog: no version without its changes");
	eq([compareVersions("0.10.0", "0.9.0") > 0, compareVersions("1.0.0", "0.38.0") > 0, compareVersions("0.25.0 – 0.25.5", "0.25.0")], [true, true, 0], "changelog: versions compared as numbers");
	eq(entries.filter((e) => compareVersions(e.version, "0.37.0") > 0 && compareVersions(e.version, "1.0.0") <= 0).map((e) => e.version), ["1.0.0", "0.38.0", "0.37.5", "0.37.4", "0.37.3", "0.37.2", "0.37.1"], "changelog: what's new since a version");
}
// ---- Every kind of place on offer reads as a place, by tag or by type ----
{
	const kinds = ["capital", "city", "town", "village", "settlement", "port", "castle", "fort", "building", "temple", "landmark", "ruin", "region", "landform", "mountain", "forest", "river", "lake", "sea", "island", "planet", "moon", "star", "station"];
	eq(kinds.filter((k) => typeFromTag(k, "") !== "place"), [], "kinds: each kind of place on offer, as a tag, marks a place");
	eq(kinds.filter((k) => normalizeType(k) !== "place"), [], "kinds: each kind of place on offer, as a type, marks a place");
}
// ---- Map look presets: apply one, it's recognised; saved looks round-trip ----
{
	const s = { territoryFillScale: 0.7, roughBorders: "medium" } as unknown as Parameters<typeof applyLook>[0];
	eq(matchingPreset(s, BUILT_IN_PRESETS), undefined, "presets: a look of your own matches none");
	const gs = BUILT_IN_PRESETS.find((p) => p.id === "grand-strategy")!;
	applyLook(s, gs.look);
	eq([matchingPreset(s, BUILT_IN_PRESETS), s.roughBorders, s.realmBand], ["grand-strategy", "off", "strong"], "presets: applying one sets every look setting, nothing lingers");
	const saved = currentLook(s);
	applyLook(s, BUILT_IN_PRESETS[0].look);
	applyLook(s, saved);
	eq(matchingPreset(s, BUILT_IN_PRESETS), "grand-strategy", "presets: a saved look puts back exactly what it was");
	eq(new Set(BUILT_IN_PRESETS.map((p) => JSON.stringify(p.look))).size, BUILT_IN_PRESETS.length, "presets: every built-in look is different");
}
// ---- Paint-bucket fill by ground: land to the coast, rivers and other lands ----
{
	// 30x20: sea on the left (x<5), a 2-wide river down x=15..16, a territory over x>=25.
	const w = 30;
	const h = 20;
	const wet = new Uint8Array(w * h);
	const blocked = new Uint8Array(w * h);
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < 5; x++) wet[y * w + x] = 1;
		wet[y * w + 15] = wet[y * w + 16] = 1;
		for (let x = 25; x < w; x++) blocked[y * w + x] = 1;
	}
	const count = (m: Uint8Array) => m.reduce((s, v) => s + v, 0);
	const west = landFill(wet, w, h, [8, 10], blocked);
	eq([count(west), west[10 * w + 3], west[10 * w + 20]], [10 * h, 0, 0], "bucket: land fills to the coast and the river, not past them");
	const across = landFill(wet, w, h, [8, 10], blocked, { crossRivers: true });
	eq([across[10 * w + 20], across[10 * w + 26], across[10 * w + 3]], [1, 0, 0], "bucket: across rivers it carries on, still stopping at the sea and other lands");
	const sea = landFill(wet, w, h, [2, 10], blocked);
	eq([count(sea), sea[10 * w + 8]], [5 * h, 0], "bucket: clicking the sea fills the sea");
	// A 1-pixel gap in the river (a faint stretch): sealed shut with seal 1, leaks without.
	const gappy = wet.slice();
	gappy[10 * w + 15] = gappy[10 * w + 16] = 0;
	eq([landFill(gappy, w, h, [8, 10], blocked)[5 * w + 20], landFill(gappy, w, h, [8, 4], blocked, { seal: 1 })[4 * w + 20]], [1, 0], "bucket: closing small gaps stops a leak through a broken river");
	eq(landFill(gappy, w, h, [8, 4], blocked, { seal: 1 })[4 * w + 14], 1, "bucket: with gaps closed, the fill still reaches right up to the river");
	// A narrow neck of land (2 wide) between the river and another territory, cut off while gaps are closed: joined, no bare sliver left.
	const nb = blocked.slice();
	for (let y = 0; y < h; y++) for (let x = 5; x < 15; x++) if (y >= 12 && x >= 7) nb[y * w + x] = 1;
	nb[11 * w + 13] = 1; // nearly closes the neck's mouth
	const neck = landFill(wet, w, h, [6, 4], nb, { seal: 2 });
	eq([neck[13 * w + 5], neck[13 * w + 6]], [1, 1], "bucket: a small neck of land beside the fill isn't left bare");
}
// ---- Rivers as water: smoothed, widening towards the mouth ----
{
	const course: [number, number][] = [[0, 0], [100, 0], [100, 100]];
	const smooth = smoothLine(course);
	eq([smooth[0], smooth[smooth.length - 1], smooth.length > course.length], [[0, 0], [100, 100], true], "river: smoothing rounds the bends and keeps both ends");
	const straight: [number, number][] = [[0, 0], [50, 0], [100, 0]];
	const r = ribbon(straight, 2, 10);
	const width = (i: number) => Math.abs(r[i][1] - r[r.length - 1 - i][1]);
	eq([r.length, width(0), width(2)], [6, 2, 10], "river: narrow at the source, broad at the mouth");
}
// ---- A border made sound: no spikes, no loops ----
{
	// Ohio's real tangle: a run of corners along an edge, a jump back up it, and back down.
	const spiked: [number, number][] = [[0, 0], [10, 0], [10, 3], [10, 6], [10, 9], [10, 2], [10, 9], [10, 20], [0, 20]];
	const fixed = untangle(spiked);
	const up = fixed.filter(([x]) => x === 10).map(([, y]) => y);
	eq([up.every((y, i) => i === 0 || y > up[i - 1]), Math.abs(ringArea(fixed))], [true, 200], "untangle: a doubled-back run of corners is taken out, the land unchanged");
	const bow: [number, number][] = [[0, 0], [10, 10], [10, 0], [0, 10]];
	const unbow = untangle(bow);
	eq(unbow.length >= 3 && Math.abs(ringArea(unbow)) > 0, true, "untangle: a border crossing itself becomes a sound outline");
	// A thin wedge (about 8° at its tip) poking out of a side: taken off; the square stays.
	const wedge: [number, number][] = [[0, 0], [10, 0], [10, 5], [30, 7], [10, 6], [10, 10], [0, 10]];
	const unwedged = untangle(wedge);
	eq([unwedged.some(([x]) => x === 30), Math.round(Math.abs(ringArea(unwedged)))], [false, 100], "untangle: a thin spike sticking out of a border is taken off");
	// A real sharp peninsula (about 28° at its tip) is kept.
	const cape: [number, number][] = [[0, 0], [10, 0], [10, 3], [30, 8], [10, 13], [10, 16], [0, 16]];
	eq(untangle(cape).some(([x]) => x === 30), true, "untangle: a sharp but real peninsula stays");
	const fine: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10]];
	eq(untangle(fine), fine, "untangle: a sound border is left exactly as it was");
}
// ---- Expanding and brushing a territory: new land joins the same area ----
{
	const sq = (x: number, y: number, s: number): [number, number][] => [[x, y], [x + s, y], [x + s, y + s], [x, y + s]];
	const area = sq(0, 0, 10);
	const has = (ring: [number, number][], p: [number, number]) => ring.some(([x, y]) => x === p[0] && y === p[1]);
	const grown = mergeInto(area, [[[8, 2], [16, 2], [16, 6], [8, 6]]])!;
	eq([Math.abs(ringArea(grown.ring)), grown.detached.length, [[0, 0], [0, 10], [10, 10]].every((p) => has(grown.ring, p as [number, number]))], [124, 0, true], "expand: circled land joins the same outline, its old corners untouched");
	const stopped = mergeInto(area, [[[8, 2], [16, 2], [16, 6], [8, 6]]], [sq(12, 0, 8)])!;
	eq(Math.abs(ringArea(stopped.ring)), 108, "expand: kept off a neighbour, it stops at their border");
	const apart = mergeInto(area, [sq(20, 0, 2)])!;
	eq([Math.abs(ringArea(apart.ring)), apart.detached.length], [100, 1], "expand: land circled apart from the area comes back separately");
	const cut = cutFrom(area, [sq(5, -1, 6)])!;
	eq(Math.abs(ringArea(cut.ring)), 75, "brush: rubbing out land cuts it from the area");
	const stroke = brushShape([[0, 0], [10, 0]], 1);
	const strokeArea = stroke.reduce((s, r) => s + Math.abs(ringArea(r)), 0);
	eq([stroke.length, strokeArea > 22 && strokeArea < 23.2], [1, true], "brush: a stroke is one smooth band (about 2r × length plus its round ends)");
	const brushed = mergeInto(area, brushShape([[10, 5], [14, 5]], 1))!;
	const tidy = tidyRing(brushed.ring, area, 0.2);
	eq([tidy.length < brushed.ring.length, [[0, 0], [10, 0], [0, 10], [10, 10]].every((p) => has(tidy, p as [number, number]))], [true, true], "brush: the new outline is thinned without moving any old corner");
}
// ---- Timeline by category ----
{
	eq([categoryOf("event", "battle"), categoryOf("event", undefined), categoryOf("person", undefined), categoryOf("death", undefined)], [["battle", "Battle"], ["~event", "Other events"], ["kind:person", "Lifespans"], ["kind:birth", "Births & deaths"]], "categories: an event's own, uncategorised events, and other kinds of thing");
	const all = ["battle", "coronation", "kind:culture", "kind:person", "treaty", "war", "~event"];
	eq(new Set(all.map((c) => categoryColor(c, all))).size, all.length, "categories: no two share a colour while there are colours to go round");
}
// ---- Borders snap to coasts and rivers ----
{
	// 120×120: sea round the edge, land inside, a river across the land at y = 60, and a blue speck.
	const w = 120, h = 120;
	const data = new Uint8ClampedArray(w * h * 4);
	const put = (x: number, y: number, c: number[]) => data.set([...c, 255], (y * w + x) * 4);
	for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) put(x, y, x < 15 || y < 15 || x >= 105 || y >= 105 ? [40, 80, 140] : [120, 150, 80]);
	for (let x = 25; x < 95; x++) for (let y = 59; y <= 61; y++) put(x, y, [45, 85, 145]);
	for (let y = 30; y < 33; y++) for (let x = 40; x < 43; x++) put(x, y, [40, 80, 140]);
	const m = waterLines({ data, width: w, height: h });
	eq([m[20 * w + 14], m[20 * w + 15], m[60 * w + 60], m[31 * w + 41], m[40 * w + 60], m[5 * w + 5]], [1, 0, 1, 0, 0, 0], "water: the coast and a river are snap lines; a speck, open land and open sea aren't");
}
// ---- A realm's border along its areas' own edges ----
{
	const sq = (x: number, y: number, s: number): [number, number][] => [[x, y], [x + s, y], [x + s, y + s], [x, y + s]];
	const length = (lines: [number, number][][]) => lines.reduce((sum, l) => sum + l.slice(1).reduce((t, p, i) => t + Math.hypot(p[0] - l[i][0], p[1] - l[i][1]), 0), 0);
	const two = unionOutline([sq(0, 0, 1), sq(1, 0, 1)], 0.01, 0.05);
	eq(Math.round(length(two) * 100) / 100, 6, "realm border: two neighbours share no line, just the 2×1 outline");
	const nested = unionOutline([sq(0, 0, 4), sq(1, 1, 1)], 0.01, 0.05);
	eq(Math.round(length(nested) * 100) / 100, 16, "realm border: a land inside another adds no line");
	const gapped = unionOutline([sq(0, 0, 1), sq(1.005, 0, 1)], 0.02, 0.05);
	eq(length(gapped) < 6.2, true, "realm border: a hairline gap between neighbours counts as shared");
	// A small island with a thin tip narrower than the look-aside: its whole outline is kept, no gaps.
	const isle: [number, number][] = [[0, 0], [0.3, 0], [0.3, 0.2], [2, 0.21], [0.3, 0.22], [0.3, 0.4], [0, 0.4]];
	const perim = isle.reduce((t, p, i) => t + Math.hypot(isle[(i + 1) % isle.length][0] - p[0], isle[(i + 1) % isle.length][1] - p[1]), 0);
	eq(Math.abs(length(unionOutline([isle], 0.05, 0.05)) - perim) < 0.01, true, "realm border: a small island's thin tip keeps its line");
}
// ---- Everyone related: the whole family around one person, by generation ----
{
	// Grandparents G1+G2 → Paul (with Pam) and Aunt Ann; Paul+Pam → Rose (the centre) and Sam; Rose+Quinn → Cal.
	// Ann's child is cousin Kit; Quinn's parents are Q1+Q2.
	const par: Record<string, string[]> = { Paul: ["G1", "G2"], Ann: ["G1", "G2"], Rose: ["Paul", "Pam"], Sam: ["Paul", "Pam"], Cal: ["Rose", "Quinn"], Kit: ["Ann"], Quinn: ["Q1", "Q2"] };
	const ptn: Record<string, string[]> = { G1: ["G2"], G2: ["G1"], Paul: ["Pam"], Pam: ["Paul"], Rose: ["Quinn"], Quinn: ["Rose"], Q1: ["Q2"], Q2: ["Q1"] };
	const born: Record<string, number> = { Rose: 2, Sam: 1 };
	const g = {
		parents: (k: string) => par[k] ?? [],
		children: (k: string) => Object.keys(par).filter((c) => par[c].includes(k)),
		partners: (k: string) => ptn[k] ?? [],
		born: (k: string) => born[k],
	};
	const sizes = { w: 100, partnerGap: 10, gap: 20 };
	const lay = (steps: number, inLaws = false) => everyoneLayout(g, "Rose", { steps, inLaws }, sizes);
	const four = lay(4);
	const gen = Object.fromEntries(four.people.map((p) => [p.key, p.gen]));
	eq([gen.G1, gen.Paul, gen.Rose, gen.Kit, gen.Cal], [-2, -1, 0, 0, 1], "everyone: generations from the centre");
	eq([four.people.some((p) => p.key === "Kit"), lay(3).people.some((p) => p.key === "Kit")], [true, false], "everyone: a first cousin is four steps away");
	eq([four.people.some((p) => p.key === "Q1"), lay(4, true).people.some((p) => p.key === "Q1")], [false, true], "everyone: a partner's parents only with in-laws");
	const x = Object.fromEntries(four.people.map((p) => [p.key, p.x]));
	eq(Math.abs(x.Rose - x.Quinn), 110, "everyone: partners side by side");
	const overlaps = four.people.some((a) => four.people.some((b) => a !== b && a.gen === b.gen && Math.abs(a.x - b.x) < 100));
	eq(overlaps, false, "everyone: no two cards on a row overlap");
	eq(x.Sam < x.Rose, true, "everyone: the elder brother first");
	eq(four.families.find((f) => f.children.includes("Cal"))?.parents.length, 2, "everyone: a child hangs from both parents");
	eq([generationName(-2, "Rose"), generationName(0, "Rose"), generationName(4, "Rose")], ["Grandparents", "Rose's generation", "2× great-grandchildren"], "everyone: generations named from the centre");
}
// ---- Map tool help on a phone: taps, and no keyboard keys ----
eq(touchHelp("Editing Ohio: drag corners (they snap to neighbours; Alt stops it) · Shift-click to pick several, then drag one · click a midpoint to add a corner · right-click one to remove it"),
	"Editing Ohio: drag corners (they snap to neighbours) · tap a midpoint to add a corner · long-press one to remove it", "touch help: no Alt or Shift, taps and long-presses");
eq(touchHelp("Painting Ohio: click to add points or drag to draw · corners snap to neighbouring borders (hold Alt to stop) · Enter or double-click to finish · Backspace undoes"),
	"Painting Ohio: tap to add points or drag to draw · corners snap to neighbouring borders", "touch help: the Finish and Undo buttons do what Enter and Backspace did");
eq(touchHelp("Map notes: click to place a note, or click points for an arrow or line (Enter to finish) · right-click a note to edit or delete it"),
	"Map notes: tap to place a note, or tap points for an arrow or line · long-press a note to edit or delete it", "touch help: asides about keys go");
eq(touchHelp("Measuring: click to add points · double-click to finish"), "Measuring: tap to add points · double-tap to finish", "touch help: double-tap");
// ---- Tiers by the vault's own names: a state works like a duchy ----
{
	const mk = (path: string, type: string, extra: Record<string, unknown> = {}) => {
		const name = path.split("/").pop()!.replace(/\.md$/, "");
		return { key: path, path, name, type, folder: path.slice(0, path.lastIndexOf("/")), tags: [], props: {}, cultures: [], relations: [], parentCultures: [], places: [], territories: [], ...extra } as never;
	};
	setTierNames(TIER_NAME_PRESETS.find(([id]) => id === "modern")![2]);
	const ents: Record<string, unknown>[] = [
		mk("U/United States/United States.md", "place", { tags: ["Title", "Country"] }),
		mk("U/United States/California/California.md", "place", { tags: ["Title", "State"] }),
		mk("U/United States/California/Los Angeles County/Los Angeles County.md", "place", { tags: ["Title", "County"] }),
		mk("U/United States/California/Los Angeles County/Los Angeles.md", "place", { tags: ["City"] }),
	];
	const src = { all: () => ents as never[], get: (k?: string) => ents.find((e) => e.key === k) as never, findByName: (n: string) => ents.find((e) => e.name === n) as never };
	const tree = realmTree(src, () => false, undefined, tierWordsWith(""));
	const n = (k: string) => tree.nodes.get(k)!;
	const us = "U/United States/United States.md", ca = "U/United States/California/California.md", la = "U/United States/California/Los Angeles County/Los Angeles County.md";
	eq([n(us).rank, n(ca).rank, n(la).rank], [2, 3, 4], "tier names: country, state and county sit on the kingdom, duchy and county tiers");
	eq([tierLabel(n(us)), tierLabel(n(ca)), tierLabel(n(la))], ["Country", "State", "County"], "tier names: each land is called by its tier's own name");
	eq([n(ca).under, n(la).under], [us, ca], "tier names: United States › California › Los Angeles County");
	eq([tierName(3, true), tierName(6, true), tierName(1, true)], ["States", "Cities", "Unions"], "tier names: plurals, given or worked out");
	eq(tierWordsWith("").state, 3, "tier names: a renamed tier's name beats a built-in word for another tier");
	setTierNames({ "3": { one: "Parish" } });
	eq([tierName(3), tierName(3, true), tierName(4), tierRenamed(3), tierRenamed(4)], ["Parish", "Parishes", "County", true, false], "tier names: unnamed tiers keep the built-in names");
	setTierNames(undefined);
	eq([tierName(3), tierWordsWith("").state], ["Duchy", 2], "tier names: back to the built-in ones");
}
// ---- Map tiers ----
{
	const kids: Record<string, string[]> = { Realm: ["Duchy", "Empty"], Duchy: ["CountyA", "CountyB"], Other: [] };
	const land = new Set(["Realm", "Duchy", "CountyA", "CountyB", "Other"]);
	const at = (sizes: Record<string, number>) => visibleTiers({ roots: ["Realm", "Other"], children: (k) => kids[k] ?? [], hasLand: (k) => land.has(k), size: (k) => sizes[k] ?? 0 }, 400);
	const far = at({ Realm: 300, Duchy: 200 });
	const mid = at({ Realm: 900, Duchy: 300 });
	const near = at({ Realm: 3000, Duchy: 900 });
	eq([[...far.whole].join(), [...mid.whole].join(), [...near.whole].join()], ["Realm,Other", "Duchy,Other", "CountyA,CountyB,Other"], "tiers: realms whole from afar, split into duchies, then counties");
	eq([shownAs(["Realm", "Duchy", "CountyA"], far), shownAs(["Realm", "Duchy", "CountyA"], mid), shownAs(["Realm", "Duchy"], near)], ["Realm", "Duchy", undefined], "tiers: an area shows as the nearest whole title above it");
}
// ---- Timeline framing ----
{
	const at = (y: number, to = y) => ({ start: y * 365, end: to * 365 });
	// A myth 11,000 years back, then a history of a few centuries.
	const dates = [at(8000), at(16369), at(18614), at(18763), at(19411, 19700), at(19588, 19591), at(19594, 19630), at(19646, 19669), at(19668), at(19630, 19700)];
	const [a, b] = fitRange(dates);
	eq([Math.round(a / 365), Math.round(b / 365)], [18614, 19700], "timeline: framed on the history, not a far-off creation myth");
	const even = [at(1000), at(1100), at(1200), at(1300), at(1400), at(1500)];
	eq(fitRange(even).map((d) => d / 365), [1000, 1500], "timeline: evenly spread dates keep the whole range");
}
// ---- Outline tracing on ragged shapes ----
{
	// Speckled land, like a textured sea read at a low tolerance: every outline is one lap of its blob.
	const w = 120;
	const h = 90;
	const mask = new Uint8Array(w * h);
	let seed = 7;
	const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
	for (let y = 5; y < h - 5; y++) for (let x = 5; x < w - 5; x++) mask[y * w + x] = rnd() < 0.62 ? 1 : 0;
	const rings = traceOutlines(mask, w, h, 1);
	const points = rings.reduce((s, r) => s + r.length, 0);
	eq([rings.length > 0, points < 8 * w * h, rings.every((r) => r.length <= 8 * (w + h) * 4)], [true, true, true], "outlines: ragged blobs are traced once round, not circled forever");
}
// ---- Roads that a plain colour match misses ----
{
	// Textured fields, a 2-px brown road drawn with anti-aliased edges and fading ink, and a blue river across it.
	const w = 240;
	const h = 120;
	const data = new Uint8ClampedArray(w * h * 4);
	let seed = 3;
	const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
	const put = (x: number, y: number, c: number[], a = 1) => {
		const i = (y * w + x) * 4;
		for (let k = 0; k < 3; k++) data[i + k] = Math.round(data[i + k] * (1 - a) + c[k] * a);
	};
	for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) put(x, y, [150 + rnd() * 30, 175 + rnd() * 30, 110 + rnd() * 25]);
	for (let x = 10; x < 230; x++) {
		const y = Math.round(60 + Math.sin(x / 30) * 20);
		// The ink fades along the road: dark brown at the start, much lighter by the end.
		const fade = (x - 10) / 220;
		const road = [110 + fade * 40, 80 + fade * 45, 50 + fade * 30];
		put(x, y, road);
		put(x, y + 1, road, 0.5);
		put(x, y - 1, road, 0.35);
	}
	for (let y = 0; y < h; y++) for (let x = 118; x < 121; x++) put(x, y, [70, 120, 200]);
	const img = { data, width: w, height: h };
	const roads = detectLines(img, [20, Math.round(60 + Math.sin(20 / 30) * 20)], { tolerance: 12, gap: 6, minLength: 20, connected: true })!;
	const span = (l: [number, number][]) => Math.max(...l.map((p) => p[0])) - Math.min(...l.map((p) => p[0]));
	const longest = Math.max(0, ...roads.lines.map(span));
	const upRiver = roads.lines.some((l) => l.some((p) => Math.abs(p[0] - 119.5) < 3 && Math.abs(p[1] - (60 + Math.sin(119.5 / 30) * 20)) > 8));
	eq([longest > 180, upRiver], [true, false], "lines: a fading, anti-aliased road comes out whole, and doesn't run up the river across it");
}
{
	const resolve = (name: string) => ({ key: name, name, resolved: true });
	const sides = readSides([{ party: "[[House Whitmore]]", side: "A", outcome: "Won" }, "[[United States]] (B, lost)"], "[[Mexico]]", undefined, resolve as never)!;
	eq(sides.map((s) => [s.party.name, s.side, s.outcome]), [["House Whitmore", "A", "won"], ["United States", "B", "lost"], ["Mexico", "A", "won"]], "sides: rows, the short string form, and victor: all read");
	eq(victorsOf(sides).map((s) => s.party.name), ["House Whitmore", "Mexico"], "sides: the winners are the parties marked won");
	eq(readSides(undefined, undefined, undefined, resolve as never), undefined, "sides: none written, none read");
	const line = (v: unknown, o?: string) => readSides(v, undefined, undefined, resolve as never, o)!.map((s) => [s.party.name, s.side, s.outcome]);
	eq(line("[[A]], [[B]] vs [[C]]"), [["A", "A", undefined], ["B", "A", undefined], ["C", "B", undefined]], "sides: one line, split at vs");
	eq(line({ "Crown (Won)": ["[[A]]", "[[B]]"], Rebels: "[[C]]" }, "Draw"), [["A", "Crown", "won"], ["B", "Crown", "won"], ["C", "Rebels", "draw"]], "sides: by side, an outcome per side or for all");
	const f = ROW_FORMATS;
	eq(f.sides.write(f.sides.read(["[[A]] (X, won)", "[[B]] (X, won)", { party: "[[C]]", side: "Y" }])), { "X (won)": ["[[A]]", "[[B]]"], Y: ["[[C]]"] }, "sides: any form saves grouped");
	const cal = reg.get("gregorian");
	const held = readHolders({ "1220": "[[A]]", "1258": "[[B]]" }, resolve as never, cal)!;
	eq([held[0].ref.name, !!held[0].to, held[1].to], ["A", true, undefined], "holders: the short map, each until the next");
	eq(f.holders.write(f.holders.read(["[[A]] (1220 – 1258)", { holder: "[[B]]", from: "1258" }])), ["[[A]] (1220 – 1258)", "[[B]] (1258 –)"], "holders: dates kept when they don't chain");
	eq(f.holders.write(f.holders.read({ "1220": "[[A]]", "1258": "[[B]]" })), { "1220": "[[A]]", "1258": "[[B]]" }, "holders: the short map survives editing");
	eq(readTransfers("[[L]], [[M]]: [[F]] > [[T]]", resolve as never)!.map((t) => [t.land.name, t.from?.name, t.to?.name]), [["L", "F", "T"], ["M", "F", "T"]], "transfers: one line, several lands");
	eq(f.transfers.write(f.transfers.read([{ land: "[[L]]", to: "[[T]]" }])), ["[[L]] > [[T]]"], "transfers: rows save as one line");
	eq(writeNames(nameRows({ "1625": "New Amsterdam", "1664": "New York" })), { "1625": "New Amsterdam", "1664": "New York" }, "names: the short map survives editing");
	eq(nameRows(["New York (1664 – 1897)", "Old York until 1600"]), [{ name: "New York", from: "1664", to: "1897" }, { name: "Old York", from: "", to: "1600" }], "names: one-line forms read as rows");
	eq(readNames({ "1625": "New Amsterdam", "1664": "New York" }, cal)!.map((n) => [n.name, !!n.to]), [["New Amsterdam", true], ["New York", false]], "names: the short map, each until the next");
	// A battle with no sides fights as its war, without its result; an alliance stands for its members.
	const ref = (name: string) => ({ key: name, name, resolved: true });
	const notes: Record<string, unknown> = {
		War: { key: "War", name: "The Great War", type: "event", sides: [{ party: ref("League"), side: "A", outcome: "won" }, { party: ref("Rome"), side: "B", outcome: "lost" }] },
		League: { key: "League", name: "League", type: "culture", alliance: [ref("Athens"), ref("Sparta")] },
	};
	const fakeIndex = { get: (k: string) => notes[k], all: () => [] } as never;
	const battle = { key: "B", name: "Battle of the Bridge", type: "event", war: ref("War") } as never;
	eq(sidesOf(fakeIndex, battle).map((s) => [s.party.name, s.side, s.outcome]), [["Athens", "A", undefined], ["Sparta", "A", undefined], ["Rome", "B", undefined]], "sides: a battle inherits its war's, and an alliance brings its members");
	const occ = (v: unknown) => readOccupied(v, resolve as never, cal)!.map((o) => [o.land.name, o.by.name, !!o.from, !!o.to]);
	eq(occ("[[L]], [[M]] by [[X]] (1240 – 1241)"), [["L", "X", true, true], ["M", "X", true, true]], "occupied: one line, several lands, with dates");
	eq(occ(["[[L]] by [[X]]"]), [["L", "X", false, false]], "occupied: no dates, it lasts as long as the event");
	eq(f.occupied.write(f.occupied.read(["[[L]] by [[X]] (1240 – 1241)"])), ["[[L]] by [[X]] (1240 – 1241)"], "occupied: survives editing");
	// Tags follow the vault's standard.
	const vaultTags = [
		{ type: "event", tags: ["Event_War", "Event_Massive", "Nation_Virginia"] },
		{ type: "event", tags: ["#Event_Treaty", "Event_Massive"] },
		{ type: "event", tags: ["Event_War", "Nation_Vael"] },
		{ type: "person", tags: ["Character", "Character_Male"] },
		{ type: "person", tags: ["Character", "Character_Female"] },
		{ type: "person", tags: ["Character"] },
	];
	const known = vaultTags.flatMap((n) => n.tags);
	eq(["event war", "EVENT-WAR", "#event_war"].map((t) => standardTag(t, known)), ["Event_War", "Event_War", "Event_War"], "tags: written the way the vault writes them");
	eq(standardTag("old sea king", known), "Old_Sea_King", "tags: a new tag follows the vault's capitals and underscores");
	eq(standardTag("my tag", ["lower", "case"]), "my_tag", "tags: a lowercase vault stays lowercase");
	eq(standardTagsFor("event", ["war"], "war", vaultTags), ["Event_War"], "tags: an event of a kind gets that kind's tag");
	eq(standardTagsFor("event", ["treaty"], "treaty", vaultTags), ["Event_Treaty"], "tags: a common tag with a value isn't given to what it isn't true of");
	eq(standardTagsFor("event", ["Vael"], undefined, vaultTags), ["Nation_Vael"], "tags: a fact can name a tag");
	eq(standardTagsFor("person", ["Virginia"], undefined, vaultTags).includes("Nation_Virginia"), true, "tags: a fact's tag can come from another kind of note");
	eq(standardTagsFor("event", [], "siege", vaultTags).includes("Event_Siege"), true, "tags: a new kind follows the type's pattern");
	eq(standardTagsFor("person", ["male"], undefined, vaultTags).sort(), ["Character", "Character_Male"], "tags: people get the shared tag and their gender's");
	eq(standardTagsFor("event", ["war"], "war", []), [], "tags: an untagged vault gets nothing it doesn't use");
	// The rule of inheritance isn't a holder.
	eq(holdersProperty({ succession: "male-preference" }), undefined, "holders: a succession rule is not a person");
	eq(holdersProperty({ succession: ["[[A]]"] }), ["[[A]]"], "holders: succession can still list them");
	eq(holdersProperty({ succession: "[[A]] (1200 – 1210)" }), "[[A]] (1200 – 1210)", "holders: one linked line counts");
	eq(holdersProperty({ holders: ["[[B]]"], succession: "agnatic" }), ["[[B]]"], "holders: holders: wins");

	// One history for both views: everything that happened to a nation, in its shape.
	{
		const y = (n: number) => parseDate(String(n), cal)!;
		const r = (key: string) => ({ key, name: key, resolved: true });
		const base = { calendar: "gregorian", cultures: [], places: [], relations: [], parents: [], props: {}, tags: [] };
		const nation = { ...base, key: "Vael", name: "Vael", type: "culture", start: y(1000), names: [{ name: "Old Vael", to: y(1100) }, { name: "Vael", from: y(1100) }], holders: [{ ref: r("Ann"), from: y(1200) }] };
		const war = { ...base, key: "War", name: "The War", type: "event", start: y(1250), end: y(1260), sides: [{ party: r("Vael"), side: "A" }], occupied: [{ land: r("Vael"), by: r("Rome"), from: y(1255), to: y(1256) }] };
		const treaty = { ...base, key: "Pact", name: "Pact", type: "event", category: "treaty", start: y(900), cultures: [{ ref: r("Vael") }] };
		const king = { ...base, key: "Bo", name: "Bo", type: "person", start: y(1270), props: { reign: "1300 - 1310" }, cultures: [{ ref: r("Vael") }] };
		const notes = [nation, war, treaty, king];
		const fakeIdx = { version: 1, all: (t?: string) => notes.filter((n) => !t || n.type === t), get: (k: string) => notes.find((n) => n.key === k) };
		const tree = { nodes: new Map([["Vael", { key: "Vael", holder: r("Bo"), children: [], rank: 2 }]]), roots: ["Vael"], holdings: new Map([["Bo", ["Vael"]]]) };
		const plugin = { index: fakeIdx, realms: () => tree, calendars: { get: () => cal }, openEndOf: () => undefined } as never;
		const marks = historyOf(plugin, nation as never, [y(1000).start, y(1400).end]);
		eq(marks.map((m) => [m.kind, m.shape]), [["rename", "diamond"], ["reign", "chevron"], ["event", "arrow"], ["occupation", "hatch"]].concat(marks.some((m) => m.key === "Bo") ? [["reign", "chevron"]] : []), "history: renamings, holders, wars and occupations, oldest first");
		eq(marks.some((m) => m.key === "Pact"), false, "history: an event outside the nation's dates isn't on its bar");
		eq(historyOf(plugin, nation as never).some((m) => m.key === "Pact"), true, "history: without limits, every event is listed");
		eq(marks.every((m, i) => i === 0 || m.day >= marks[i - 1].day), true, "history: in date order");
	}

	// Shapes tell a nation's history apart.
	const cats = ["coronation", "kind:person", "treaty", "~event"];
	const shapes = [shapeFor("rename", "kind:rename", undefined), shapeFor("reign", "kind:reign", undefined), shapeFor("occupation", "kind:occupation", undefined), shapeFor("event", "x", "war"), shapeFor("event", "x", "battle"), shapeFor("event", "coronation", undefined, cats), shapeFor("event", "treaty", undefined, cats)];
	eq(new Set(shapes).size, shapes.length, "shapes: no two categories share one");
	eq(new Set(["diamond", "arrow", "chevron", "battle", "hatch", "square", "hexagon", "triangle", "star", "round"].map((s) => markPath(s as "diamond", 7, 7))).size, 10, "shapes: each draws differently");
	eq([shapeFor("person", "kind:person", undefined), shapeFor("event", "~event", undefined, cats)], ["round", "round"], "shapes: lifespans and uncategorised events stay plain");

	// Normalising: the vault's own scheme, wherever a note's facts justify it.
	const note = (path: string, type: string, tags: string[], facts: string[] = []) => ({ path, type, tags, facts });
	const scheme = [
		note("A.md", "person", ["Character", "Character_Vael", "Character_Dead"]),
		note("B.md", "person", ["Character", "Character_Vael"]),
		note("C.md", "person", ["Character"], ["World", "Vael", "dead"]),
		note("D.md", "person", ["character_vael"], ["Vael"]),
		note("E.md", "place", ["Title", "Region_Small"]),
		note("F.md", "place", ["Title"]),
		note("G.md", "place", ["Region"], ["Small"]),
	];
	const marks = { keys: ["type", "cr_type"], tags: true, prefix: "", custom: { place: "Title" } };
	eq(markedType({ tags: ["City"] }, marks), "place", "type: a kind tag marks the type");
	eq(markedType({ tags: ["Title"] }, marks), "place", "type: the vault's own type tag counts");
	eq(markedType({ Type: "event", tags: ["City"] }, marks), "event", "type: a property wins over tags");
	eq(markedType({ tags: ["Starport"] }, marks), null, "type: a word that isn't a type tag marks nothing");
	eq(markedType({ tags: ["uv/place"] }, { ...marks, prefix: "uv/" }), "place", "type: tags under the prefix");
	eq(markedType({ tags: ["place"] }, { ...marks, prefix: "uv/" }), null, "type: without the prefix they don't count");
	eq(markedType({ tags: ["City"] }, { ...marks, tags: false }), null, "type: tags off");
	eq(typeFromTag("Title", "", { place: "Title" }), "place", "type: custom type tag");
	eq([isKindTag("city", "place"), isKindTag("starport", "place"), isKindTag("place", "place"), isKindTag("battle", "place")], [true, false, false, false], "kind: only a specific type tag of the same type is a kind tag");
	eq(readCategory({}, ["Region", "Region_Gigantic", "Continent"], "place"), "continent", "kind: a continent's kind is continent, not region");
	eq(readCategory({}, ["Region", "Mountains"], "place"), "mountains", "kind: a landform tag is the kind");
	eq(readCategory({}, ["Region"], "place"), "region", "kind: just a region");
	eq([kindLabel("space station"), kindLabel("space_station"), kindLabel(undefined)], ["Space station", "Space station", ""], "kind: read as words");
	eq(kindChoices(["conflict", "Conflict", "treaty", undefined], "Battle, treaty, birth…").map((c) => `${c.kind}:${c.count}`), ["conflict:2", "treaty:1", "battle:0", "birth:0"], "kind: the vault's own first, then the setting's examples");
	const bounds = timeBoundaries([{ start: { start: 10, end: 12 }, territories: [{ from: { start: 20, end: 20 }, to: { start: 30, end: 35 } }], names: [{ name: "X", day: 25 }], file: { parent: { start: 99, end: 99 } } }]);
	eq(bounds, [10, 13, 20, 21, 25, 30, 36], "time: every start, the day after every end, and one-day changes (not the file's)");
	eq([timeStep(bounds, undefined), timeStep(bounds, 5), timeStep(bounds, 10), timeStep(bounds, 12), timeStep(bounds, 13), timeStep(bounds, 40)], [-1, 0, 1, 1, 2, 7], "time: days in one stretch share a step");
	eq(moveTarget("A/Note.md", false, "B/C"), "B/C/Note.md", "move: a note lands in the folder");
	eq(moveTarget("A/Note.md", false, ""), "Note.md", "move: the root is a place too");
	eq(moveTarget("A/Note.md", false, "A"), undefined, "move: already there");
	eq(moveTarget("A/B", true, "A/B/C"), undefined, "move: a folder can't go inside itself");
	eq(moveTarget("A/B", true, "A/B"), undefined, "move: nor onto itself");
	eq(moveTarget("A/B", true, "A/Bee"), "A/Bee/B", "move: a folder with a similar name is another folder");
	eq(followPath("A/B/Note.md", "A/B", "C/B"), "C/B/Note.md", "move: what's inside follows");
	eq(followPath("A/Bee", "A/B", "C/B"), "A/Bee", "move: a similar name stays");
	const fixed = tagFixes(scheme, { person: "Character", place: "Title" });
	const fixOf = (p: string) => fixed.find((f) => f.path === p);
	eq(fixOf("C.md")?.add, ["Character_Dead", "Character_Vael"], "normalise: a note gains its type's tags that its facts justify");
	eq(fixOf("D.md")?.rename, [["character_vael", "Character_Vael"]], "normalise: a stray spelling becomes the usual one");
	eq(fixOf("D.md")?.add, ["Character"], "normalise: the tag that marks a type goes on, once most of the type have it");
	eq(fixOf("A.md"), undefined, "normalise: a note that follows the scheme is left alone");
	eq(fixOf("G.md")?.add.includes("Title"), true, "normalise: the required tag is the only plain one spread");
	eq(fixOf("E.md"), undefined, "normalise: other tags aren't spread by being common");
	eq(tagFixes([note("X.md", "person", [], ["Vael"]), note("Y.md", "event", ["Event_Vael"])]), [], "normalise: a tag is only given to the type that uses it");
	const rare = [note("A.md", "place", ["Location_Vael"], ["Vael"]), ...["B", "C", "D", "E"].map((n) => note(`${n}.md`, "place", ["Title"], ["Vael"]))];
	eq(tagFixes(rare), [], "normalise: a tag only one note in five uses is a leftover, not the scheme");
	const groups = [note("A.md", "culture", ["Family", "Family_Noble"], ["Noble"]), note("B.md", "culture", ["Family"], ["Noble"]), note("C.md", "culture", ["Faith"], ["Noble"])];
	eq(tagFixes(groups).map((x) => [x.path, x.add]), [["B.md", ["Family_Noble"]]], "normalise: a family's tags stay within the family");
	eq(tagFixes([]), [], "normalise: an empty vault has nothing to do");
	eq(factsFromPath("The World/Vael/Greyford.md"), ["The World", "Vael"], "normalise: folders are facts, the file isn't");

	// The creator's form lands in the note's properties.
	const typedLine = { name: "Ann", type: "person" as const, places: [], participants: [], cultures: [], parents: [], leaders: [], tags: [], unknown: [] };
	{
		const front: Record<string, unknown> = { lifespan: null, birthplace: "", allies: [], mentors: [null, " "], reign: undefined, gender: "female", parents: ["[[Bea]]"], tags: ["Character_Person"], born: 0, alive: false };
		dropEmptyProperties(front);
		eq(front, { gender: "female", parents: ["[[Bea]]"], tags: ["Character_Person"], born: 0, alive: false }, "creator: empty properties are dropped, filled and zero/false ones stay");
	}
	// Adding relatives by name: links only, no notes.
	eq(parseNames("Anna\n- [[Bert|B]]\n  \nanna; Carl"), ["Anna", "Bert", "Carl"], "relatives: names split, unwrapped, repeats dropped");
	{
		const front: Record<string, unknown> = { child: "[[Anna]]" };
		eq(addLinks(front, ["children", "child"], "children", ["[[anna]]", "[[Bert]]"]), 1, "relatives: a link already there isn't added twice");
		eq(front, { child: ["[[Anna]]", "[[Bert]]"] }, "relatives: the spelling the note already uses is kept");
		const blank: Record<string, unknown> = {};
		addLinks(blank, ["parents"], "parents", ["[[Cy]]"]);
		eq(blank, { parents: ["[[Cy]]"] }, "relatives: a new list is made when there isn't one");
	}
	// Relatives of relatives: families written as lines, so a relative with no note can have relatives too.
	{
		const kin = parseKin(["Bob + Mary > Carol, Dan", "- [[Carol|Caz]] + Eric > Frank", "Gwen + Hal", "Loner"]);
		eq(kin.parentOf.map(([p, c]) => `${p}>${c}`), ["Bob>Carol", "Bob>Dan", "Mary>Carol", "Mary>Dan", "Carol>Frank", "Eric>Frank"], "kin: each parent on a line is a parent of each child");
		eq(kin.partners, [["Bob", "Mary"], ["Carol", "Eric"], ["Gwen", "Hal"]], "kin: names joined by + are partners, a lone name says nothing");
		eq(kinLines("a > b\nc + d"), ["a > b", "c + d"], "kin: one text with line breaks is read as lines");
		const lines: string[] = ["Bob + Mary > Carol"];
		eq([addKinChildren(lines, ["Mary", "Bob"], ["Dan", "carol"]), lines], [1, ["Bob + Mary > Carol, Dan"]], "kin: new children join the line already written for those parents");
		eq([addKinChildren(lines, ["Carol"], ["Frank"]), lines[1]], [1, "Carol > Frank"], "kin: a relative with no note gets a line of their own");
		eq([addKinPartner(lines, "Bob", "mary"), addKinPartner(lines, "Gwen", "Hal"), lines[2]], [0, 1, "Gwen + Hal"], "kin: partners already tied by a line are not added twice");
	}	eq(quickAddFrontmatter(withFields(typedLine, { date: "1200", gender: "female", occupation: "scribe", birthPlace: "London", parents: ["Bea"] })), { born: "1200", gender: "female", occupation: "scribe", birthplace: "[[London]]", parents: ["[[Bea]]"] }, "creator: a person's form");
	{
		const lines = ["Bob + Mary > Carol, Dan", "Carol + Eric > Frank", "Gwen + Hal"];
		eq(forgetKin(lines, "carol"), ["Bob + Mary > Dan", "Eric > Frank", "Gwen + Hal"], "kin: forgetting someone takes them off every line, keeping the rest");
		eq(forgetKin(["Gwen + Hal", "Ann > Ben"], "Gwen"), ["Ann > Ben"], "kin: a couple left with one person and no children goes");
		eq(forgetKin(["Ann > Ben"], "Ben"), [], "kin: a parent left with no children goes");
	}
	{
		const front: Record<string, unknown> = { tags: ["a"], aliases: null, reign: "", allies: [], mentors: [null, " "], born: 0, alive: false, gender: "female", position: { start: 1 } };
		eq(emptyKeys(front), ["aliases", "reign", "allies", "mentors"], "empty properties: blank, empty lists and lists of blanks are found; zero and false are not");
		eq([dropEmpty(front).length, Object.keys(front)], [4, ["tags", "born", "alive", "gender", "position"]], "empty properties: they go, the rest stays");
	}
	eq(quickAddFrontmatter(withFields({ ...typedLine, name: "Siege", type: "event" }, { date: "1200", war: "The War", importance: "5" })), { date: "1200", war: "[[The War]]", importance: 5 }, "creator: an event's form");
	eq(quickAddFrontmatter(withFields({ ...typedLine, name: "Guild", type: "culture" }, { cultures: ["Crown"] })), { "parent-cultures": ["[[Crown]]"] }, "creator: a group's parent");

	// Timeline rows don't depend on the zoom, and nothing in a row overlaps at or above the scale they're packed at.
	const tlItems = [
		{ id: "war", start: 0, end: 1000, point: false, labelWidth: 40 },
		{ id: "a", start: 100, end: 100, point: true, labelWidth: 60 },
		{ id: "b", start: 120, end: 120, point: true, labelWidth: 60 },
		{ id: "c", start: 1200, end: 1400, point: false, labelWidth: 40 },
	];
	const packed = packRows(tlItems, 0.5);
	eq(packed.rows.get("war"), 0, "timeline: the long bar takes the first row");
	eq(packed.rows.get("a") === packed.rows.get("b"), false, "timeline: points with labels in the way get their own rows");
	eq(packed.rows.get("c"), 0, "timeline: a row is reused once it's free");
	eq(packRows([...tlItems].reverse(), 0.5).rows.get("a"), packed.rows.get("a"), "timeline: rows don't depend on the order things arrive in");
	// Nations get taller rows; marks too close to read stack up.
	eq(rowLayout(3, new Set([1]), 28, 40), { top: [0, 28, 68], height: [28, 40, 28], total: 96 }, "rows: a nation's row is as tall as the lineage's");
	eq(rowLayout(1, new Set([0]), 50, 40).height, [50], "rows: taller rows stay taller");
	eq(stackLevels([0, 5, 8, 30, 33, 100]), [0, 1, 2, 0, 1, 0], "marks: close ones stack, and the next clear one starts again");
	eq(stackLevels([0, 11, 22]), [0, 0, 0], "marks: ones with room stay level");
	eq(stackLevels([]), [], "marks: none to stack");
	// Arrows follow the dates.
	const longWar = { left: 100, right: 500, top: 10, bottom: 30 };
	const nums = (d: string) => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
	const xs = (d: string) => nums(d).filter((_, i) => i % 2 === 0);
	eq(nums(causePath(longWar, { left: 300, right: 340, top: 60, bottom: 80 })).slice(0, 2), [284 - 0, 30], "arrows: leave the bar when the effect begins, not at its end");
	eq(Math.max(...xs(causePath(longWar, { left: 300, right: 340, top: 60, bottom: 80 }))) <= 298, true, "arrows: never go past the effect and double back");
	eq(nums(causePath(longWar, { left: 300, right: 340, top: -40, bottom: -20 }))[1], 10, "arrows: leave from the top when the effect is above");
	eq(nums(causePath(longWar, { left: 600, right: 640, top: 60, bottom: 80 })).slice(0, 2), [500, 20], "arrows: from the end once the cause is over");
	const after = xs(causePath(longWar, { left: 510, right: 540, top: 60, bottom: 80 }));
	eq(after.every((x, i) => i === 0 || x >= after[i - 1]), true, "arrows: a close effect doesn't overshoot");
	eq(nums(causePath(longWar, { left: 110, right: 140, top: 60, bottom: 80 })).slice(0, 2), [100, 30], "arrows: an effect at the very start leaves from the bar's start");

	// Smart reader: facts in the text, and not the facts of other people.
	const places = ["Greyford", "London"], people = ["Alice Vane", "Aldric Vane", "Mira Thorne"];
	const facts = (md: string, name = "Aldric Vane", type = "person", has: ReadField[] = []) => readNote(md, {
		name, type,
		has: (f, about) => !about && has.includes(f),
		isDate: (t) => !!parseDate(t, cal),
		place: (n) => places.find((p) => p === n),
		person: (n) => people.find((p) => p === n || p.startsWith(n)),
	}).map((f) => [f.about ?? "", f.field, f.value]);
	eq(sentencesOf("Born c. 1240 in 1262 C.E. near St. John. He lived."), ["Born c. 1240 in 1262 C.E. near St. John.", "He lived."], "reader: abbreviations don't end a sentence");
	eq(cleanBody("---\nborn: 1\n---\n# Head\n**Bold** [[A|b]] text\n```\ncode\n```\n- item\n"), ["Bold [[A]] text", "item"], "reader: only prose is read");
	eq(facts("Aldric Vane was born in 1240 at [[Greyford]] and died in 1301 in London."), [["", "born", "1240"], ["", "birthPlace", "[[Greyford]]"], ["", "died", "1301"], ["", "deathPlace", "[[London]]"]], "reader: birth and death, dates and places");
	eq(facts("Aldric Vane (1240 – 1301) was a blacksmith."), [["", "born", "1240"], ["", "died", "1301"], ["", "occupation", "blacksmith"]], "reader: dates in brackets at the opening, and a trade");
	eq(facts("He worked as a ship's carpenter in Greyford."), [["", "occupation", "ship's carpenter"]], "reader: worked as anything");
	eq(facts("She became the most famous court physician of her age."), [["", "occupation", "physician"]], "reader: a trade after some describing words");
	eq(facts("His father was born in 1200. Her son died in 1250. His father was a blacksmith."), [], "reader: family members' lives aren't the note's");
	eq(facts("[[Alice Vane]] (b. 1200) married him. [[Mira Thorne]] was born in 1210."), [["Alice Vane", "born", "1200"], ["Mira Thorne", "born", "1210"]], "reader: another person's dates go on their note");
	eq(facts("He was born in 1240.", "Aldric Vane", "person", ["born"]), [], "reader: what the note already has isn't suggested");
	eq(facts("Greyford was born in fire in 1240. Nobody knows when it fell."), [], "reader: a sentence about something unknown says nothing");
	eq(facts("He was a good man. She was the best of friends. He was a friend of the general."), [], "reader: was a… needs a real trade, and to be theirs");
	eq(facts("The battle was fought on 14 May 1243 near Greyford.", "Battle of Greyford", "event"), [["", "date", "14 May 1243"]], "reader: when an event happened");
	eq(facts("Greyford was founded in 1102 by settlers.", "Greyford", "place"), [["", "founded", "1102"]], "reader: when a place began");
	eq(facts("Aldric was born in 1240, and died in 1301."), [["", "born", "1240"], ["", "died", "1301"]], "reader: a first name alone is the note");

	// Undo puts back what a step changed, and nothing else.
	const changes = changesBetween({ a: 1, b: [1], gone: "x" }, { a: 2, b: [1], added: true });
	eq(changes, { a: 1, gone: "x", added: undefined }, "undo: a step holds only what changed, as it was");
	const handEdited: Record<string, unknown> = { a: 2, b: [1], added: true, born: "1200" };
	restoreFront(handEdited, changes);
	eq(handEdited, { a: 1, b: [1], born: "1200", gone: "x" }, "undo: a property typed by hand since stays");
	// Redo: what undo replaced is exactly what puts it back.
	const edited: Record<string, unknown> = { a: 2, b: [1], added: true, born: "1200" };
	const redo = restoreFront(edited, changes);
	eq(redo, { a: 2, gone: undefined, added: true }, "redo: undo reports what it replaced, undefined for what was missing");
	restoreFront(edited, redo);
	eq(edited, { a: 2, b: [1], born: "1200", added: true }, "redo: running it again brings the edit back exactly");
	const step = { label: "s", at: 0, notes: [] as { path: string; before: Record<string, unknown> }[] };
	addToStep(step, "A.md", { a: 1 });
	addToStep(step, "A.md", { a: 2, b: 3 });
	eq(step.notes, [{ path: "A.md", before: { a: 1, b: 3 } }], "undo: a note edited twice in a step goes back to the first value");
	const moved = [{ label: "s", at: 0, notes: [{ path: "Old/A.md", before: {} }, { path: "Older/B.md", before: {} }] }];
	renameInSteps(moved, "Old", "New");
	renameInSteps(moved, "Older/B.md", "Older/C.md");
	eq(moved[0].notes.map((n) => n.path), ["New/A.md", "Older/C.md"], "undo: steps follow notes and folders that are renamed");
	const long: typeof step[] = [];
	for (let i = 0; i <= MAX_UNDO; i++) remember(long, { ...step, at: i });
	eq([long.length, long[0].at], [MAX_UNDO, 1], "undo: only the newest steps are kept");

	// The history survives a restart, added properties included.
	const saved = readHistory(writeHistory([{ label: "s", at: 5, notes: [{ path: "A.md", before: { a: 1, added: undefined } }] }]));
	eq([saved[0].label, saved[0].at, "added" in saved[0].notes[0].before, saved[0].notes[0].before.a], ["s", 5, true, 1], "undo: a saved step still knows which properties it added");
	const restored: Record<string, unknown> = { a: 2, added: "x" };
	restoreFront(restored, saved[0].notes[0].before);
	eq(restored, { a: 1 }, "undo: a saved step takes its added properties off again");
	eq([readHistory("not json"), readHistory("{}"), readHistory('[{"label":1},{"label":"x","at":1,"notes":[{"path":3}]}]')], [[], [], []], "undo: an unreadable history file means no history");
	const two = [{ label: "old", at: 1, notes: [{ path: "A.md", before: { big: "x".repeat(500) } }] }, { label: "new", at: 2, notes: [{ path: "B.md", before: { a: 1 } }] }];
	eq(readHistory(writeHistory(two, 200)).map((s) => s.label), ["new"], "undo: when the file would be too big, the oldest steps go");

	// Links worked out from other notes are cleared, so they can't outlive their source.
	const child = { parents: [{ key: "W", name: "W", resolved: true }, { key: "A", name: "A", resolved: true, inferred: true }], parentCultures: [{ key: "C", name: "C", resolved: true, inferred: true }], map: { key: "M", name: "M", resolved: true, inferred: true } } as never as Parameters<typeof clearInferred>[0];
	clearInferred(child);
	eq([child.parents.map((p) => p.key), child.parentCultures.length, child.map], [["W"], 0, undefined], "index: inferred parents, branches and maps are cleared, written ones stay");

	// Only what the index reads counts as a change.
	const cached = { frontmatter: { born: "1200" }, tags: [{ tag: "#a", position: 1 }], links: [{ link: "B", position: 1 }] };
	eq(noteSignature(cached) === noteSignature({ ...cached, tags: [{ tag: "#a", position: 9 }], links: [{ link: "B", position: 9 }] }), true, "index: text moving in the body isn't a change");
	eq(noteSignature(cached) === noteSignature({ ...cached, frontmatter: { born: "1201" } }), false, "index: a changed property is");
	eq(noteSignature(cached) === noteSignature({ ...cached, links: [] }), false, "index: a removed link is");

	// Date ranges, with or without spaces.
	eq(["1277-1278", "1277–1278", "1277 – 1278", "1277 - 1278 C.E."].map((s) => splitSpan(s)), [["1277", "1278"], ["1277", "1278"], ["1277", "1278"], ["1277", "1278 C.E."]], "spans: spaces or none");
	eq(["1243-05-14", "1243-05", "1240 –", "– 1241", ""].map((s) => splitSpan(s)), [["1243-05-14", ""], ["1243-05", ""], ["1240", ""], ["", "1241"], ["", ""]], "spans: single dates stay whole, open ends stay open");
	eq(readOccupied("[[L]] by [[X]] (1240-1241)", resolve as never, cal)!.map((o) => [!!o.from, !!o.to]), [[true, true]], "occupied: a range without spaces reads both dates");

	// How long an occupation lasts.
	const inYear = (y: number) => parseDate(String(y), cal)!;
	const land = { key: "L", name: "L", resolved: true }, by = { key: "X", name: "X", resolved: true };
	const wars = [{ start: inYear(1240), end: inYear(1245), occupied: [{ land, by, from: inYear(1241), to: inYear(1242) }, { land: by, by: land }] }];
	const occIndex = { all: () => wars } as never;
	const occAt = (y: number) => occupationsAt(occIndex, inYear(y).start).length;
	eq([occAt(1239), occAt(1240), occAt(1241), occAt(1243), occAt(1246)], [0, 1, 2, 1, 0], "occupied: dated ones keep their dates, undated ones last the war");
	const byLand = occupationsByLand({ all: () => wars } as never);
	eq([byLand.get("L")?.[0].by.name, byLand.get("L")?.[0].firstDay === inYear(1241).start, byLand.get("X")?.[0].firstDay === inYear(1240).start], ["X", true, true], "occupied: listed by land, with the days each ran");

	const refs = readTimedRefs([{ alias: "cultures", value: ["[[House]] (king, 1220 – 1258)"] }], ((t: string) => ({ key: t, name: t })) as never, cal, ["cultures"], []);
	eq([refs[0].ref.name, refs[0].role, !!refs[0].from, !!refs[0].to], ["House", "king", true, true], "dated links: role and dates on one line");
}
{
	const sq = (x: number, y: number, s: number): [number, number][] => [[x, y], [x + s, y], [x + s, y + s], [x, y + s]];
	const area = (key: string, points: [number, number][], chain: string[] = [key]) => ({ key, name: key, n: 0, points, chain });
	const kinds = (issues: { kind: string; key: string }[]) => issues.map((i) => `${i.kind}:${i.key}`).sort();
	eq(kinds(checkBorders([area("A", sq(0, 0, 100)), area("B", sq(100, 0, 100))], { mapSize: 1000 })), [], "borders: neighbours meeting on one line are fine");
	eq(checkBorders([area("A", sq(0, 0, 100)), area("B", sq(60, 0, 100))], { mapSize: 1000 }).map((i) => i.kind), ["overlap"], "borders: overlapping neighbours are found");
	eq(kinds(checkBorders([area("A", sq(0, 0, 100)), area("B", sq(103, 0, 100))], { mapSize: 4000 })), ["gap:A"], "borders: a thin gap between neighbours is found");
	eq(kinds(checkBorders([area("A", sq(0, 0, 100)), area("B", sq(150, 0, 100))], { mapSize: 4000 })), [], "borders: a wide channel (a river) between neighbours isn't a gap");
	eq(kinds(checkBorders([area("P", sq(0, 0, 100)), area("C", sq(50, 0, 100), ["P", "C"])], { mapSize: 1000 })).includes("outside:C"), true, "borders: a land sticking out of its parent is found");
	eq(kinds(checkBorders([area("P", sq(0, 0, 100)), area("C", sq(0, 0, 30), ["P", "C"])], { mapSize: 1000 })), ["partial:P"], "borders: a land only partly filled by its sub-lands is noted");
	eq(kinds(checkBorders([area("P", sq(0, 0, 100)), area("C", sq(100, 0, 60), ["P", "C"])], { mapSize: 1000 })), [], "borders: a sub-land wholly beside its liege (held besides its own land) is fine");
	eq(kinds(checkBorders([area("X", [[0, 0], [100, 100], [100, 0], [0, 100]])], { mapSize: 1000 })), ["crossed:X"], "borders: a figure-of-eight border is found");
	{
		// A square 3 px right of its neighbour: its near side moves onto the neighbour's, the far side stays.
		const a: [number, number][] = [[103, 0], [203, 0], [203, 100], [103, 100]];
		const b = sq(0, 0, 100);
		const { ring, moved } = snapToNeighbour(a, b, 6);
		eq([moved, ring.some((q) => q[0] === 203), ring.filter((q) => q[0] === 100).length], [2, true, 2], "gaps: only the near corners move, onto the neighbour's border");
		eq(kinds(checkBorders([area("A", ring), area("B", b)], { mapSize: 4000 })), [], "gaps: after snapping the two meet on one line");
		const far: [number, number][] = [[150, 0], [250, 0], [250, 100], [150, 100]];
		eq(snapToNeighbour(far, b, 6).moved, 0, "gaps: nothing beyond the reach moves (a river stays a river)");
	}
	{
		// Two counties with a hairline gap: one realm outline around both; a long realm's name runs along it.
		const left: [number, number][] = [[0, 0], [100, 0], [100, 60], [0, 60]];
		const right: [number, number][] = [[101, 0], [300, 0], [300, 60], [101, 60]];
		const shape = realmShape([left, right], [150, 30]);
		const ob = boxOf(shape.outline[0] ?? []);
		eq([shape.outline.length, Math.round(ob.x0 / 5), Math.round(ob.x1 / 5)], [1, 0, 60], "strategy map: one outline round a realm's lands, gaps bridged");
		const c = shape.curve!;
		eq([c.from[0] < 60, c.to[0] > 240, Math.abs(c.from[1] - 30) < 6, Math.round(c.thickness / 10)], [true, true, true, 6], "strategy map: the name runs along the realm, left to right, through its middle");
		eq(nameSize("CALIFORNIA", 200, 60) > nameSize("CALIFORNIA", 200, 20), true, "strategy map: names grow with the land");
	}
	const spot = labelSpot(sq(0, 0, 100), [sq(0, 0, 50)]);
	eq([spot.p[0] > 50 || spot.p[1] > 50, spot.room > 10], [true, true], "labels: the name sits in the open part, away from a sub-land");
	eq(Math.round((mainAxis([[0, 0], [100, 10], [100, 20], [0, 10]]).angle * 180) / Math.PI / 10), 1, "labels: a long land's axis follows it");
}
// World setting: medieval by default, modern and futuristic words and defaults on top.
{
	eq(settingWords(undefined).house, "House", "setting: unset is medieval");
	eq([settingWords("modern").liege, settingWords("futuristic").houses, settingWords("futuristic").tiers], ["Superior", "Families", "galactic"], "setting: later worlds' words");
	eq(TIER_NAME_PRESETS.some(([id]) => id === settingWords("modern").tiers), true, "setting: its tier names are a preset");
	eq([guessSetting(["planet", "moon", "station", "city"]), guessSetting(["airport", "base", "factory"]), guessSetting(["castle", "planet"]), guessSetting([])], ["futuristic", "modern", undefined, undefined], "setting: guessed from kinds of place");
	eq([tierPresetOf(undefined), tierPresetOf(TIER_NAME_PRESETS[1][2]), tierPresetOf({ "3": { one: "Shire" } })], ["medieval", TIER_NAME_PRESETS[1][0], undefined], "setting: tier names as a preset, or the vault's own");
	eq([readCategory({ org_type: "Corporation" }, [], "culture"), readCategory({ event_type: "conflict" }, [], "event"), readCategory({ kind: "house", org_type: "nation" }, [], "culture")], ["corporation", "conflict", "house"], "setting: org_type and event_type are kinds, after kind:");
	const words = tierWordsWith("");
	eq([words.federation, words.commonwealth, words.municipality, words.kingdom], [1, 2, 6, 2], "setting: modern tier words");
	const cats = placeCategories("spaceport = #ff0000");
	eq([cats.get("spaceport")?.color, cats.get("airport")?.icon, parseMapCategories("").has("airport")], ["#ff0000", "plane", false], "setting: built-in extra kinds under the settings' own");
	setRankWords(settingWords("modern"));
	eq([relLabel("liege"), relLabel("liege", true)], ["Superior", "Subordinates"], "setting: rank labels follow it");
	setRankWords(settingWords("medieval"));
	eq(relLabel("vassals"), "Vassals", "setting: back to medieval");
}
{
	// The tag scheme: Type_Kind, Type_Kind_Name, Type_Field_Value.
	eq([parseTag("Group_Nation_United_States"), parseTag("Character_Status_Dead"), parseTag("Place_SpaceStation"), parseTag("Nation_Vael"), parseTag("Character"), parseTag("uv/Place_City", "uv")], [
		{ role: "member", type: "culture", kind: "nation", name: "United States" },
		{ role: "fact", type: "person", field: "status", value: "dead" },
		{ role: "kind", type: "place", kind: "space station" },
		null, null,
		{ role: "kind", type: "place", kind: "city" },
	], "scheme: parse");
	eq([kindTag("place", "space station"), kindTag("person"), memberTag("culture", "nation", "United States"), factTag("person", "status", "dead")], ["Place_SpaceStation", "Character_Person", "Group_Nation_United_States", "Character_Status_Dead"], "scheme: write");
	eq(tidyKinds(["Character", "Character_Person", "Character_Noble", "Group_Family_Tudors"]), ["Character_Noble", "Group_Family_Tudors"], "scheme: one kind tag");
	eq([typeFromTag("Place_County", ""), typeFromTag("Character_Status_Dead", ""), typeFromTag("Group_Nation_United_States", "")], ["place", "person", null], "scheme: kind and fact tags mark the type, belonging tags don't");
	eq([readCategory({}, ["Place_County", "Place_Size_Small"], "place"), readCategory({}, ["Character_Vael", "Character_Tudors"], "person"), readCategory({}, ["Character_Person"], "person"), readCategory({}, ["Character_Gender_Male", "Character_Noble"], "person")], ["county", undefined, undefined, "noble"], "scheme: kind tag read; several older Type_Word tags say nothing");
	const words: MigrateWords = { bareType: (w) => (w.includes("_") ? null : typeFromTag(w, "", { place: "Region" })), tiers: SCHEME_TIERS, regions: SCHEME_REGIONS };
	const base = { folders: ["The World", "Vael"], world: "Vael" };
	const targets: Record<string, MigrateTarget> = { tudors: { type: "culture", kind: "family", name: "Tudors" }, "united states": { type: "place", kind: "realm", name: "United States" } };
	const run = (n: MigrateNote) => applyMigration(n.tags, migrateTags(n, (name) => (name.toLowerCase() === n.name.toLowerCase() ? { type: n.type, kind: "", name: n.name, self: true } : targets[name.toLowerCase()]), words));
	const person: MigrateNote = { ...base, type: "person", name: "Mary", tags: ["Character", "Character_Vael", "Character_Female", "Character_Dead", "Character_Ruler", "Nation_Tudors", "Character_Noble"] };
	const migrated = run(person);
	eq(migrated, ["Character_Person", "Place_World_Vael", "Character_Gender_Female", "Character_Status_Dead", "Character_Role_Ruler", "Group_Family_Tudors", "Character_Class_Noble"], "scheme: a person's older tags");
	eq(run({ ...person, tags: migrated }), migrated, "scheme: migrating twice changes nothing");
	eq(run({ ...person, kind: "noble" }).slice(0, 1), ["Character_Noble"], "scheme: a word that is the note's own kind is its kind tag");
	eq(run({ ...base, type: "place", name: "United States", tags: ["Title", "Region", "Realm", "Region_Huge", "Nation_United_States"], kind: "region", land: { nature: "realm", tier: "Kingdom" } }), ["Place_Realm", "Place_Size_Huge"], "scheme: a realm drops #Title and tags of itself");
	eq(run({ ...base, type: "place", name: "Kent", tags: ["Title", "County", "Region_Small", "Nation_United_States", "Location_Vael"], kind: "county", land: { nature: "realm" } }), ["Place_County", "Place_Size_Small", "Place_Realm_United_States", "Place_World_Vael"], "scheme: a county");
	eq(run({ ...base, type: "place", name: "Greyford", tags: ["Title", "Region", "Region_Small"], kind: "region", land: { nature: "realm", tier: "Barony" } }), ["Place_Barony", "Place_Size_Small"], "scheme: ruled land with no tier tag takes its tier");
	eq(run({ ...base, type: "place", name: "North", tags: ["Region", "Region_Enormous", "Continent"], kind: "continent", land: { nature: "region" } }), ["Place_Continent", "Place_Size_Enormous"], "scheme: geography");
	eq(run({ ...base, type: "place", name: "Port", tags: ["City", "City_Huge", "City_Capital", "Nation_Vael"], kind: "city", land: { nature: "realm" } }), ["Place_City", "Place_Size_Huge", "Place_Role_Capital", "Group_Nation_Vael"], "scheme: a settlement; an unknown realm keeps the old word as its kind");
	eq(run({ ...base, type: "event", name: "War", tags: ["Event", "Event_War", "Event_Massive", "Event_Vael"] }), ["Event_War", "Event_Size_Massive", "Place_World_Vael"], "scheme: an event");
	eq(run({ ...base, type: "culture", name: "House", tags: ["Family", "Family_Noble", "Family_Ruler"], kind: "family" }), ["Group_Family", "Group_Class_Noble", "Group_Role_Ruler"], "scheme: a family");
	eq(run({ ...base, type: "place", name: "Kent", tags: ["Title", "County", "County"], kind: "county", land: { nature: "realm" } }), ["Place_County"], "scheme: a tag written twice");
	const m = { rename: [["Character_Dead", "Character_Status_Dead"], ["Nation_Vael", "Group_Nation_Vael"]] as [string, string][], drop: ["Title"] };
	eq(migrateBodyTags("Mary #Character_Dead of #nation_vael, see [[Vael#Title]].\nNot #Character_Deadly. #Title here\n`#Title` stays\n```\n#Title\n```", m),
		"Mary #Character_Status_Dead of #Group_Nation_Vael, see [[Vael#Title]].\nNot #Character_Deadly. here\n`#Title` stays\n```\n#Title\n```", "scheme: tags in the text, not in links or code");
	eq(splitBody("---\ntags: [a]\n---\nText #a"), ["---\ntags: [a]\n---\n", "Text #a"], "undo: text below the properties");
	const step: UndoStep = { label: "x", at: 1, notes: [] };
	addBodyToStep(step, "a.md", "one", "two");
	addBodyToStep(step, "a.md", "two", "three");
	eq(readHistory(writeHistory([step]))[0].notes[0].body, { before: "one", after: "three" }, "undo: a note's text, earliest before and latest after, kept in the history file");
	eq(run({ ...base, type: "person", name: "Ann", tags: ["Favourite"] }), ["Favourite", "Character_Person"], "scheme: other tags stay, the kind tag is added");

	// ---- Places: type of place, kind, traits (index/placekinds.ts) ----
	eq(resolvePlace("capital"), { kind: "settlement", group: "settlement", roles: ["capital"], status: undefined }, "places: kind capital is a settlement with the capital role");
	eq(resolvePlace("fortress"), { kind: "fort", group: "structure", roles: [], status: undefined }, "places: fortress is a fort, a structure");
	eq(resolvePlace("city", ["#Place_Role_Port", "Place_Status_Ruined", "Place_Size_Large"]), { kind: "city", group: "settlement", roles: ["port"], status: "ruined" }, "places: roles and status come from the scheme's tags");
	eq(resolvePlace("harbour").roles, ["port"], "places: harbour is the port role");
	eq([groupOfKind("kingdom"), groupOfKind("island"), groupOfKind("lake"), groupOfKind("ruins"), groupOfKind("planet"), groupOfKind("nothing")], ["territory", "land", "water", "site", "space", undefined], "places: every kind has one type of place");
	eq([styleKeyOf("city", ["Place_Role_Capital"]), styleKeyOf("city", []), styleKeyOf("capital", []), styleKeyOf(undefined, ["Place_Role_Port"])], ["capital", "city", "capital", "port"], "places: a role styles the pin, else the kind");
	eq([usualSize("village"), usualSize("Metropolis"), usualSize("castle")], ["small", "huge", undefined], "places: the settlement ladder says the usual size");
	eq(normaliseKind("Star System").kind, "system", "places: a spelling of a kind folds into it");
	const seen = new Set<string>();
	for (const d of PLACE_KINDS) for (const w of [d.kind, ...(d.alias ?? [])]) {
		if (seen.has(w)) throw new Error(`places: ${w} is in the catalogue twice`);
		seen.add(w);
	}
	eq(!PLACE_KINDS.some((d) => ["capital", "port", "kingdom", "fortress"].includes(d.kind)), true, "places: no role or tier word is a kind");
	eq(!/^capital =/m.test(defaultKindsText()) && /^hamlet =/m.test(defaultKindsText()), true, "places: the default Kinds list has no roles and has the ladder");
	eq(PLACE_ROLES.every((r) => new RegExp(`^${r.role} =`, "m").test(knownKindsText())), true, "places: every role has a style known in every vault");
	eq(run({ ...base, type: "place", name: "Greyford", tags: ["Place", "Place_Capital"] }), ["Place_Settlement", "Place_Role_Capital"], "places: an old capital tag becomes a settlement with a role");
	eq(run({ ...base, type: "place", name: "Greyford", tags: [], kind: "capital" }), ["Place_Settlement", "Place_Role_Capital"], "places: kind capital without tags gets both tags");
	eq(run({ ...base, type: "place", name: "Dunmere", tags: ["Place_Fortress"], kind: "fortress" }), ["Place_Fort"], "places: fortress becomes fort");
	// ---- Relationship kinds: no key or alias belongs to two kinds ----
	const relSeen = new Map<string, string>();
	const relClash: string[] = [];
	for (const k of REL_KINDS) for (const w of [k.key, ...k.aliases]) {
		const owner = relSeen.get(w);
		if (owner && owner !== k.key) relClash.push(`${w}: ${owner} and ${k.key}`);
		relSeen.set(w, k.key);
	}
	eq(relClash, [], "relationships: every key and alias belongs to one kind");
	eq(REL_KINDS.every((k) => REL_KINDS.some((o) => o.key === k.inverse)), true, "relationships: every kind's inverse is a kind");
	// ---- Ties: the bracketed part after a name (index/ties.ts) ----
	eq(splitParts('spouse, 1230 – 1255, "a secret, hidden wedding"'), ["spouse", "1230 – 1255", '"a secret, hidden wedding"'], "ties: commas inside quotes do not split");
	eq(parseDetails('spouse, 1230 – 1255, "a secret wedding"', ["spouse", "ex"]), { words: [], kind: "spouse", span: "1230 – 1255", label: "a secret wedding" }, "ties: kind, dates and custom text");
	eq(parseDetails("f, 1230", ["spouse"]), { words: [], gender: "female", span: "1230" }, "ties: a gender and dates");
	eq(parseDetails("king, 1220 – 1258", ["spouse"]), { words: ["king"], span: "1220 – 1258" }, "ties: other words are left for the reader");
	eq(splitDetails("Carol (f, 1230 – 1290)"), { name: "Carol", inside: "f, 1230 – 1290" }, "ties: a name and its brackets");
	eq(parseDetails('ex, 1230 – 1255, ended: divorce, "no heirs"', ["ex"]), { words: [], kind: "ex", span: "1230 – 1255", reason: "divorce", label: "no heirs" }, "ties: how it ended");
	eq(formatDetails({ kind: "ex", span: "1230 – 1255", reason: "divorce", label: "no heirs", words: [] }), ' (ex, 1230 – 1255, ended: divorce, "no heirs")', "ties: details written back in brackets");
	eq(formatDetails({ words: [] }), "", "ties: nothing to say, no brackets");
	eq(splitDetails("- [[Carol]]"), { name: "Carol", inside: undefined }, "ties: a link is unwrapped");
	const kin = parseKin("Bob + Mary (spouse) > Carol (f, 1230 – 1290), Dan (step)");
	eq(kin.partners, [["Bob", "Mary", "spouse"]], "kin: a kind word after a partner is the tie");
	eq(kin.parentOf, [["Bob", "Carol"], ["Bob", "Dan", "step"], ["Mary", "Carol"], ["Mary", "Dan", "step"]], "kin: a kind word on a child is how the parent is one");
	eq(kin.people.get("carol"), { name: "Carol", gender: "female", span: "1230 – 1290", label: undefined }, "kin: gender and dates belong to the person");
	eq(parseKin("Bob + Mary > Carol, Dan").parentOf.length, 4, "kin: lines without details read as before");
	const lines = ["Bob + Mary > Carol (f, 1230 – 1290)"];
	eq(addKinChildren(lines, ["Bob", "Mary"], ["Carol", "Dan (m)"]), 1, "kin: a child already there, with details, is not added twice");
	eq(lines, ["Bob + Mary > Carol (f, 1230 – 1290), Dan (m)"], "kin: a new child keeps its details");
	eq(forgetKin(["Bob + Mary > Carol (f, 1230 – 1290), Dan (m)"], "Dan"), ["Bob + Mary > Carol (f, 1230 – 1290)"], "kin: forgetting one keeps the others' details");
	// ---- What someone belongs to: realm, house, culture, faith, organisation (index/membership.ts) ----
	eq([rowOfKind("kingdom"), rowOfKind("County"), rowOfKind("family"), rowOfKind("dynasty"), rowOfKind("religion"), rowOfKind("guild"), rowOfKind("people"), rowOfKind("noble")], ["realm", "realm", "house", "house", "faith", "organisation", "culture", undefined], "membership: a group's kind word answers one question");
	eq([rowOfProperty("family"), rowOfProperty("Allegience"), rowOfProperty("faith"), rowOfProperty("cultures")], ["house", "realm", "faith", undefined], "membership: a property says what it answers, the general one nothing");
	const mfm = { family: "[[House Tudor]]", allegience: ["[[England]]", "[[House Tudor]]"], faith: "[[Church of England]]" };
	const nameOfLink = (raw: unknown) => /\[\[([^\]|]+)/.exec(String(raw))?.[1];
	const mem = readMembers(mfm, ["cultures", "family", "allegience", "faith"], nameOfLink);
	eq(mem.map((m) => `${m.prop}:${m.name}`), ["family:House Tudor", "allegience:England", "allegience:House Tudor", "faith:Church of England"], "membership: every group property is read, each entry once");
	const kinds: Record<string, GroupRow> = { "House Tudor": "house", England: "realm" };
	const rows = splitMembers(mem, (n) => kinds[n]);
	eq([rows.house.map((m) => m.name), rows.realm.map((m) => m.name), rows.faith.map((m) => m.name)], [["House Tudor", "House Tudor"], ["England"], ["Church of England"]], "membership: the linked note's kind decides the row, the property decides for a note that does not exist");
	const keepAll = Object.fromEntries(ROW_ORDER.map((r) => [r, rows[r].map((m) => ({ name: m.name, value: m.raw }))])) as Record<GroupRow, { name: string; value: unknown }[]>;
	eq(Object.keys(rebuildMembers(mfm, mem, keepAll)).sort(), ["allegience", "faith", "family"], "membership: nothing changed, the same properties");
	const edited = { ...keepAll, house: [{ name: "House Tudor", value: "[[House Tudor]] (\"the cadet line\")" }, { name: "House Stuart", value: "[[House Stuart]]" }], realm: [{ name: "England", value: "[[England]]" }] };
	const out = rebuildMembers(mfm, mem, edited);
	eq([out.family, out.allegience, out.faith], [["[[House Tudor]] (\"the cadet line\")", "[[House Stuart]]"], ["[[England]]"], "[[Church of England]]"], "membership: an edit stays in its property, a new house goes to the property used for houses, a lone value stays single");
	eq(rebuildMembers({ family: "[[House Tudor]]" }, [{ name: "House Tudor", prop: "family", raw: "[[House Tudor]]" }], { ...Object.fromEntries(ROW_ORDER.map((r) => [r, []])), faith: [{ name: "Church of England", value: "[[Church of England]]" }] } as Record<GroupRow, { name: string; value: unknown }[]>), { family: undefined, faith: "[[Church of England]]" }, "membership: a removed entry empties its property and a first faith goes to faith");
	// ---- Fixing broken kinds (index/kindcheck.ts) ----
	const knownKinds = knownKindWords();
	const never = () => 0;
	eq(kindFix("capital", knownKinds, never), { from: "capital", to: "settlement", why: "capital is a role, not a kind", add: ["Place_Role_Capital"] }, "fix: capital is a settlement with a role");
	eq(kindFix("fortress", knownKinds, never)?.to, "fort", "fix: fortress is fort");
	eq(kindFix("cities", knownKinds, never)?.to, "city", "fix: a plural");
	eq(kindFix("villiage", knownKinds, never)?.to, "village", "fix: a typo");
	eq([kindFix("city", knownKinds, never), kindFix("tavern", knownKinds, never), kindFix("kingdom", knownKinds, never), kindFix("", knownKinds, never)], [undefined, undefined, undefined, undefined], "fix: good kinds and unknown words are left alone");
	eq(kindFix("villiage", knownKinds, () => 5), undefined, "fix: a word the vault uses often is its own kind");
	// ---- Titles and honorifics (index/titles.ts) ----
	eq([titleFor("medieval", 2, "female"), titleFor("medieval", 3, "male"), titleFor("modern", 2, "female"), titleFor("futuristic", 2), titleFor(undefined, 1, "female")], ["Queen", "Duke", "President", "Governor-General", "Empress"], "titles: the tier and gender give the title, by setting");
	eq([styleFor("medieval", 2, "female"), styleFor("medieval", 3, "male"), styleFor("modern", 2, "male")], ["Her Majesty", "His Grace", ""], "titles: how a holder is addressed");
	eq([rankTitle("Knight", "female"), rankTitle("knight", "male"), rankTitle("peasant")], ["Dame", "Sir", undefined], "titles: an honorific for rank without land");
	eq(holderTitle("medieval", [{ tier: 3, name: "Kent" }, { tier: 2, name: "England" }], "female"), "Queen of England", "titles: the highest land they hold");
	eq(holderTitle("medieval", [], "male"), "", "titles: nothing held, no title");
}
console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
