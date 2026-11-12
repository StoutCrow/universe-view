import { TFile } from "obsidian";
import type UniverseViewPlugin from "../main";
import type { Entity, Side, TimedRef } from "../types";
import { formatDate, formatSpan } from "../dates/parser";
import { chainOf, holdingsOf , tierLabel } from "../index/realms";
import { relLabel, relOne, relTone } from "../index/relkinds";
import { totalPopulation } from "../index/tidy";
import { battlesOf, isWar, occupationsByLand, sidesOf, warSpan } from "../index/wars";
import { asText } from "../index/text";
import { buildFieldAliases } from "../settings";
import { relKind } from "../index/relkinds";
import { GROUP_KINDS, groupKind } from "../render/houses";
import { ROW_INFO } from "../index/membership";
import { groupsByRow } from "./groupsplit";
import { changeNoteIcon, noteIcons } from "./icons";
import { TYPE_ICONS, TYPE_LABELS, bindHover, el, entityColor, glyph, helpTip, icon, openEntity, resourceUrl } from "../render/common";

export interface PanelOptions {
	/** Show another note in the panel (a chip was clicked). */
	pick: (key: string) => void;
	/** Switch the panel to one of its tabs. */
	tab?: (tab: "realm" | "edit") => void;
	/** What hover cards and page previews belong to. */
	host: HTMLElement | { hoverPopover: unknown };
}

const YEAR = 365.2425;

/** What each section is, behind its "?". */
const HELP: Record<string, string> = {
	Vassals: "Titles directly under this one, with who holds each. A title goes under this one when it names it in `location:` or `under:`, or sits in this note's folder.",
	Holds: "Every title held by this person or house, largest first, with the realm each one sits in.",
	Relationships: "Ties written on this note, coloured by kind: green allies and friends, red rivals and enemies, purple liege and vassals, gold trade, teal other bonds. The other side shows them too.",
	"Knows about": "What this person has been told or has learned (`knows:`), used for fog of war: the map, timeline and graph seen through their eyes.",
	Members: "People who belong to this group, from their `cultures:`, `house:` or `faction:`, with their roles and dates.",
	Branches: "Groups that branched off this one (`branch-of:`, `parent-org:` or `branches:`). For a house, its cadet branches.",
	"Caused by": "Events written as leading to this one (`caused-by:` here, or `led-to:` on the other).",
	"Led to": "Events this one led to.",
	"Groups here": "Groups that hold or live in this place, from its `cultures:` or `nation:`.",
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Everything UniverseView knows about a note, as a panel of parts rather than lines of text: a header
 * with its picture and chips, where it sits in its realm, its span against today, numbers at a glance,
 * the people, places, groups and titles linked to it as clickable chips, its relationships by kind,
 * its events, and ways into every view.
 */
export function entityPanel(p: UniverseViewPlugin, box: HTMLElement, e: Entity, opts: PanelOptions) {
	const idx = p.index;
	const cal = p.calendars.get(e.calendar);
	const tree = p.realms();
	const node = tree.nodes.get(e.key);
	const root = el("div", { cls: "universeview-ep" }, box);
	root.style.setProperty("--ep-accent", entityColor(p, e));

	// ---- Header: picture, name, chips ----
	const hero = el("div", { cls: "universeview-ep-hero" }, root);
	const pic = el("div", { cls: "universeview-ep-pic" }, hero);
	const img = resourceUrl(p, e.image ?? e.logo);
	const icons = noteIcons(p, e.key);
	if (img) el("img", { attr: { src: img, alt: "" } }, pic);
	else if (!(icons.kind && glyph(pic, icons.kind))) icon(pic, TYPE_ICONS[e.type]);
	// Its type's icon as a badge when the picture shows something more exact (a castle on a fort's pin).
	if (!img && icons.kind && icons.type) icon(el("span", { cls: "universeview-ep-pic-badge" }, pic), icons.type);
	// Click the picture to give it an icon of its own.
	pic.setAttribute("aria-label", "Change its icon");
	pic.addClass("is-clickable");
	pic.addEventListener("click", () => {
		const f = p.app.vault.getAbstractFileByPath(e.key);
		if (f instanceof TFile) changeNoteIcon(p, f);
	});
	const titles = el("div", { cls: "universeview-ep-titles" }, hero);
	const name = el("a", { cls: "universeview-ep-name", text: e.name }, titles);
	name.addEventListener("click", (evt) => openEntity(p, e.key, evt));
	const chips = el("div", { cls: "universeview-ep-chips" }, titles);
	const chip = (text: string, ic?: string, cls = "") => {
		const c = el("span", { cls: "universeview-ep-tag " + cls }, chips);
		if (ic) icon(el("span", { cls: "universeview-ep-tag-icon" }, c), ic);
		el("span", { text }, c);
		return c;
	};
	// A group says what it is (Realm, House, Faith…) rather than just "Group".
	const kind = e.type === "culture" ? GROUP_KINDS[groupKind(p, e)] : undefined;
	chip(kind?.label ?? TYPE_LABELS[e.type], kind?.icon ?? TYPE_ICONS[e.type], "is-type");
	if (e.category) chip(cap(e.category), "tag");
	const tier = node ? tierLabel(node) || undefined : undefined;
	if (tier && tier !== kind?.label && tier.toLowerCase() !== e.category?.toLowerCase()) chip(tier, "crown");
	if (e.importance >= 4) chip("★".repeat(Math.min(5, e.importance)), undefined, "is-stars");
	if (e.issues.length) chip(`${e.issues.length} issue${e.issues.length === 1 ? "" : "s"}`, "alert-triangle", "is-warning");

	// ---- Where it sits: the realm above it ----
	if (node) {
		const chain = chainOf(tree, e.key);
		if (chain.length > 1) {
			const crumbs = el("div", { cls: "universeview-ep-crumbs" }, root);
			chain.forEach((k, i) => {
				if (i) el("span", { cls: "universeview-ep-crumb-sep", text: "›" }, crumbs);
				const target = idx.get(k);
				const b = el("span", { cls: "universeview-ep-crumb" + (k === e.key ? " is-here" : ""), text: target?.name ?? k, attr: k === e.key ? {} : { role: "button", tabindex: "0" } }, crumbs);
				if (k !== e.key) {
					b.addEventListener("click", (evt) => (evt.ctrlKey || evt.metaKey ? openEntity(p, k, evt) : opts.pick(k)));
					bindHover(p, b, k, opts.host);
				}
			});
		}
	}

	// ---- Its span, against today ----
	spanBar(p, root, e);

	// ---- Numbers at a glance ----
	const tiles: [string, string, string][] = [];
	const events = idx.events(e.key);
	const people = (keys: string[]) => keys.filter((k) => idx.get(k)?.type === "person").length;
	if (e.type === "person") {
		const kids = idx.children(e.key).length;
		if (kids) tiles.push(["baby", String(kids), kids === 1 ? "child" : "children"]);
		const holds = holdingsOf(tree, e.key).length;
		if (holds) tiles.push(["crown", String(holds), holds === 1 ? "title" : "titles"]);
	} else if (e.type === "culture") {
		const members = people(idx.members(e.key).map((m) => m.key));
		if (members) tiles.push(["users", String(members), members === 1 ? "member" : "members"]);
		const holds = holdingsOf(tree, e.key).filter((k) => k !== e.key).length;
		if (holds) tiles.push(["landmark", String(holds), holds === 1 ? "title held" : "titles held"]);
		const branches = idx.childCulturesOf.get(e.key)?.size ?? 0;
		if (branches) tiles.push(["git-branch", String(branches), branches === 1 ? "branch" : "branches"]);
	} else if (e.type === "place") {
		const pop = totalPopulation(idx, e.key);
		if (pop) tiles.push(["users", pop.total.toLocaleString(), "people"]);
		const born = idx.all("person").filter((x) => x.birthPlace?.key === e.key).length;
		if (born) tiles.push(["baby", String(born), "born here"]);
	} else if (e.type === "event") {
		if (e.participants.length) tiles.push(["users", String(e.participants.length), "involved"]);
		if (e.places.length) tiles.push(["map-pin", String(e.places.length), e.places.length === 1 ? "place" : "places"]);
		const led = idx.effectsOf.get(e.key)?.size ?? 0;
		if (led) tiles.push(["git-pull-request-arrow", String(led), "led to"]);
	}
	if (node?.children.length) tiles.push(["git-fork", String(node.children.length), node.children.length === 1 ? relOne("vassals") : relLabel("vassals").toLowerCase()]);
	if (events.length && e.type !== "event") tiles.push(["calendar-days", String(events.length), events.length === 1 ? "event" : "events"]);
	if (tiles.length) {
		const grid = el("div", { cls: "universeview-ep-tiles" }, root);
		for (const [ic, value, label] of tiles.slice(0, 6)) {
			const t = el("div", { cls: "universeview-ep-tile" }, grid);
			icon(el("span", { cls: "universeview-ep-tile-icon" }, t), ic);
			el("div", { cls: "universeview-ep-tile-value", text: value }, t);
			el("div", { cls: "universeview-ep-tile-label", text: label }, t);
		}
	}

	// ---- Summary ----
	if (e.summary) el("div", { cls: "universeview-ep-summary", text: e.summary }, root);

	// ---- Linked notes, as chips ----
	const section = (title: string, ic: string, action?: [string, () => void], help?: string) => {
		const s = el("section", { cls: "universeview-ep-section" }, root);
		const h = el("div", { cls: "universeview-ep-section-head" }, s);
		icon(el("span", {}, h), ic);
		el("span", { text: title }, h);
		if (help ?? HELP[title.replace(/ \(\d+\)$/, "")]) helpTip(h, help ?? HELP[title.replace(/ \(\d+\)$/, "")]);
		if (action) {
			const a = el("span", { cls: "universeview-ep-section-action", text: action[0], attr: { role: "button", tabindex: "0" } }, h);
			a.addEventListener("click", action[1]);
		}
		return el("div", { cls: "universeview-ep-people" }, s);
	};
	const person = (into: HTMLElement, r: { key: string; name: string; resolved?: boolean }, sub?: string, tone?: string) => noteChip(p, into, r, opts, sub, tone);
	const list = (title: string, ic: string, refs: { key: string; name: string; resolved?: boolean; sub?: string; tone?: string }[], max = 12) => {
		if (!refs.length) return;
		const s = section(`${title} (${refs.length})`, ic);
		for (const r of refs.slice(0, max)) person(s, r, r.sub, r.tone);
		if (refs.length > max) el("span", { cls: "universeview-ep-more", text: `+${refs.length - max} more` }, s);
	};
	const span = (x?: Entity) => (x ? formatSpan(x.start, x.end, p.calendars.get(x.calendar)) : "");
	const refOf = (k: string, sub?: string) => ({ key: k, name: idx.get(k)?.name ?? k, sub });

	// Who holds it.
	if (node && (node.holder || node.house || node.ruler)) {
		const s = section("Held by", "crown", opts.tab ? ["Change…", () => opts.tab!("realm")] : undefined, "The person holding this title (from `lord:`, `holder:`, `owner:` or `ruler:`), their house, and the ruler it answers to in the end when that's someone else.\n\nA name with a dashed border has no note yet.");
		if (node.holder) person(s, node.holder, "Holder");
		if (node.house) person(s, node.house, "House");
		if (node.ruler && node.ruler.key !== node.holder?.key) person(s, node.ruler, "Ruler");
	}
	if (e.type === "person") {
		list("Parents", "users", idx.parentsOf(e.key).map((r) => ({ ...r, sub: span(idx.get(r.key)) })));
		list("Partners", "heart", idx.partners(e.key).map((t) => ({ ...t.ref, sub: formatSpan(t.from, t.to, cal) || span(idx.get(t.ref.key)) })));
		list("Children", "baby", idx.children(e.key).map((k) => refOf(k, span(idx.get(k)))));
		list("Siblings", "users-round", idx.siblings(e.key).map((k) => refOf(k, span(idx.get(k)))), 8);
		for (const [row, refs] of groupsByRow(p, e.cultures)) list(ROW_INFO[row].plural, GROUP_KINDS[row].icon, refs.map((c) => ({ ...c.ref, sub: [c.role, c.label, formatSpan(c.from, c.to, cal)].filter(Boolean).join(" · ") })));
	}
	if (e.type === "person" || e.type === "culture") {
		list("Holds", "landmark", holdingsOf(tree, e.key).filter((k) => k !== e.key).map((k) => refOf(k, chainOf(tree, k).slice(0, -1).map((x) => idx.get(x)?.name).join(" › "))));
	}
	if (node) list(relLabel("vassals"), "git-fork", node.children.map((k) => { const n = tree.nodes.get(k); return refOf(k, [n?.holder?.name, n?.house?.name].filter(Boolean).join(" · ")); }));
	if (e.type === "culture") {
		const members = idx.members(e.key).filter((m) => idx.get(m.key)?.type === "person");
		list("Members", "users", members.map((m) => ({ key: m.key, name: idx.get(m.key)!.name, sub: [m.link.role, formatSpan(m.link.from, m.link.to, cal)].filter(Boolean).join(" · ") })), 16);
		list("Branches", "git-branch", [...(idx.childCulturesOf.get(e.key) ?? [])].map((k) => refOf(k, span(idx.get(k)))));
		list("Branch of", "git-merge", e.parentCultures.map((r) => ({ ...r })));
		if (e.type === "culture") list("Places", "map-pin", e.places.map((r) => ({ ...r })));
	}
	if (e.type === "event") {
		list("Who was there", "users", e.participants.map((r) => ({ ...r })));
		list("Where", "map-pin", e.places.map((r) => ({ ...r })));
		list("Caused by", "arrow-left", [...(idx.causesOf.get(e.key) ?? [])].map((k) => refOf(k, span(idx.get(k)))));
		list("Led to", "arrow-right", [...(idx.effectsOf.get(e.key) ?? [])].map((k) => refOf(k, span(idx.get(k)))));
		// Who fought, side by side, each with how it ended for them.
		const camps = new Map<string, Side[]>();
		for (const s of sidesOf(idx, e)) camps.set(s.side, [...(camps.get(s.side) ?? []), s]);
		for (const [side, parties] of camps) list(side.length > 1 ? side : `Side ${side}`, "swords", parties.map((s) => ({ ...s.party, sub: s.outcome ? cap(s.outcome) : "" })));
		if (e.war) list("Part of", "flag", [{ ...e.war }]);
		if (isWar(idx, e)) list("Battles", "swords", battlesOf(idx, e).map((b) => refOf(b.key, span(b))));
		list("Lands changing hands", "arrow-left-right", (e.transfers ?? []).map((t) => ({ ...t.land, sub: [t.from?.name, t.to?.name ?? "independent"].filter(Boolean).join(" → ") })));
		list("Lands occupied", "flag", (e.occupied ?? []).map((o) => ({ ...o.land, sub: [`by ${o.by.name}`, formatSpan(o.from, o.to, cal)].filter(Boolean).join(" · ") })));
	}
	if (e.holders?.length) list("Holders over time", "crown", e.holders.map((h) => ({ ...h.ref, sub: formatSpan(h.from, h.to, cal) })));
	// Occupied by someone, in any war.
	const occupiers = (occupationsByLand(idx).get(e.key) ?? []).map((o) => ({ ...o.by, sub: [o.event.name, formatSpan(o.from ?? o.event.start, o.to ?? o.event.end, cal)].filter(Boolean).join(" · ") }));
	list("Occupied by", "flag", occupiers);
	if (e.type === "place") {
		// Geography, apart from rule: shown when it differs from the title it's ruled under.
		if (e.locatedIn && e.locatedIn.key !== node?.under) {
			const s = section("Lies in", "map", undefined, "Where it is geographically (`located-in:` or `location:`): its region, island or continent, whoever rules it. The trail at the top is who it's ruled under; the two differ for enclaves, colonies and conquered lands.");
			person(s, e.locatedIn, "geographically");
		}
		list("Groups here", "flag", e.cultures.map((c) => ({ ...c.ref, sub: formatSpan(c.from, c.to, cal) })));
	}
	// Relationships, coloured by kind (allies green, rivals red, lieges purple…), minus the ones shown above.
	const shownKinds = new Set(["holder", "owner", "lord", "lady", "ruler"]);
	const rels: TimedRef[] = [...e.relations.filter((r) => !(node && shownKinds.has(r.kind ?? ""))), ...(e.relatedCultures ?? [])];
	list("Relationships", "handshake", rels.map((r) => ({ ...r.ref, sub: [r.label ?? relLabel(r.kind), formatSpan(r.from, r.to, cal), r.reason].filter(Boolean).join(" · "), tone: relTone(r.kind) })), 16);
	list("Knows about", "eye", e.knows.map((t) => ({ ...t.ref, sub: formatSpan(t.from, t.to, cal) })), 8);

	// ---- The rest of what's written about it ----
	const facts: [string, string][] = [];
	if (e.names?.length) facts.push(["Names", e.names.map((n) => [n.name, formatSpan(n.from, n.to, cal)].filter(Boolean).join(" ")).join(", ")]);
	if (e.birthPlace) facts.push(["Born at", e.birthPlace.name]);
	if (e.deathPlace) facts.push(["Died at", e.deathPlace.name]);
	if (e.terrain) facts.push(["Terrain", cap(e.terrain)]);
	if (e.repeat) facts.push(["Repeats", cap(e.repeat)]);
	facts.push(...otherProperties(p, e));
	if (facts.length) {
		const s = el("section", { cls: "universeview-ep-section" }, root);
		const h = el("div", { cls: "universeview-ep-section-head" }, s);
		icon(el("span", {}, h), "list");
		el("span", { text: "Details" }, h);
		const table = el("dl", { cls: "universeview-ep-facts" }, s);
		for (const [k, v] of facts) {
			el("dt", { text: k }, table);
			el("dd", { text: v }, table);
		}
	}

	// ---- Events, on a little timeline ----
	const dated = events.filter((x) => x.start).sort((a, b) => a.start!.start - b.start!.start);
	if (dated.length && e.type !== "event") {
		const s = el("section", { cls: "universeview-ep-section" }, root);
		const h = el("div", { cls: "universeview-ep-section-head" }, s);
		icon(el("span", {}, h), "calendar-days");
		el("span", { text: `Events (${dated.length})` }, h);
		const ol = el("ol", { cls: "universeview-ep-events" }, s);
		for (const x of dated.slice(0, 10)) {
			const li = el("li", { cls: "universeview-ep-event" }, ol);
			li.style.setProperty("--dot", entityColor(p, x));
			el("span", { cls: "universeview-ep-event-date", text: formatDate(x.start, p.calendars.get(x.calendar)) }, li);
			const a = el("a", { cls: "universeview-ep-event-name", text: x.name }, li);
			a.addEventListener("click", (evt) => (evt.ctrlKey || evt.metaKey ? openEntity(p, x.key, evt) : opts.pick(x.key)));
			bindHover(p, a, x.key, opts.host);
		}
		if (dated.length > 10) el("div", { cls: "universeview-ep-more", text: `+${dated.length - 10} more on the timeline` }, s);
	}

	// ---- Tags ----
	const tags = e.tags.filter((t) => !/^(person|character|event|place|culture|map)$/i.test(t));
	if (tags.length) {
		const row = el("div", { cls: "universeview-ep-tagrow" }, root);
		for (const t of tags.slice(0, 12)) el("span", { cls: "universeview-ep-hashtag", text: "#" + t }, row);
	}

	// ---- Ways in ----
	const actions = el("div", { cls: "universeview-ep-actions" }, root);
	const act = (ic: string, label: string, run: () => void) => {
		const b = el("button", { cls: "universeview-ep-action" }, actions);
		icon(el("span", {}, b), ic);
		el("span", { text: label }, b);
		b.addEventListener("click", run);
	};
	act("file-text", "Open note", () => {
		const f = p.app.vault.getAbstractFileByPath(e.key);
		if (f instanceof TFile) void p.app.workspace.getLeaf(false).openFile(f);
	});
	if (e.type === "event" && isWar(idx, e) && warSpan(idx, e)) act("play", "Play on the map", () => void p.playWar(e.key));
	if (e.start || e.end) act("calendar-range", "Timeline", () => void p.openTimeline({ focus: e.key }));
	if (e.type === "person") act("git-fork", "Family tree", () => void p.openFamilyTree(e.key));
	if (node || e.type === "culture") act("crown", "Realms", () => void p.openRealms(e.key));
	if (e.type === "place" || e.type === "map" || e.places.length || e.territories.length || node) act("map", "Map", () => void p.openMap(e.key));
	act("waypoints", "Connections", () => void p.openNetwork(e.key));
	act("smile-plus", "Icon…", () => {
		const f = p.app.vault.getAbstractFileByPath(e.key);
		if (f instanceof TFile) changeNoteIcon(p, f);
	});
	act("settings", "Settings", () => p.openSettings(e.type === "place" || node ? "maps" : e.type === "event" ? "time" : "notes"));
	if (opts.tab) act("pencil", "Edit", () => opts.tab!("edit"));
}

/** Properties that are shown elsewhere, or are for the plugin rather than the reader. */
const NOT_FACTS = /^(tags?|aliases|cssclass(es)?|position|map-position|pos|xy|coordinates?|coords|latlng|lat-lng|custom_coordinates.*|coordinates_.*|territor(y|ies)|borders|routes?|roads|occupied-areas|occupied|sides|transfers|holders|names|image|logo|icon|color|colour|cr_type|type|map|maps|war|victor|defeated|outcome|importance|calendar|summary|description|kind|category|parent|parents|father|mother|children|spouse|partner|caused[-_]by|because-of|triggered-by|led[-_]to|leads-to|causes|consequences|resulted-in)$/i;

/** What else the note's properties say, in plain words: nothing written is left out of sight. */
function otherProperties(p: UniverseViewPlugin, e: Entity): [string, string][] {
	const f = p.app.vault.getAbstractFileByPath(e.key);
	const front: Record<string, unknown> | undefined = f instanceof TFile ? p.app.metadataCache.getFileCache(f)?.frontmatter : undefined;
	const known = new Set(Object.values(buildFieldAliases(p.settings.fieldAliases)).flat().map((k) => k.toLowerCase()));
	const out: [string, string][] = [];
	for (const [k, v] of Object.entries(front ?? {})) {
		if (NOT_FACTS.test(k) || known.has(k.toLowerCase()) || relKind(k)) continue;
		const values = (Array.isArray(v) ? v : [v]).filter((x) => x !== null && x !== "" && typeof x !== "object");
		const text = values.map((x) => asText(x).replace(/\[\[([^\]|]+)(\|[^\]]*)?\]\]/g, "$1")).join(", ");
		if (text) out.push([cap(k.replace(/[-_]/g, " ")), text]);
	}
	return out;
}

/**
 * A linked note as a chip: its picture or icon, its name and a line under it. Click shows it in the
 * panel, Ctrl/Cmd-click opens it; a name with no note yet shows dashed. Put it inside a ".universeview-ep".
 */
export function noteChip(p: UniverseViewPlugin, into: HTMLElement, r: { key: string; name: string; resolved?: boolean }, opts: Pick<PanelOptions, "pick" | "host">, sub?: string, tone?: string) {
	const target = r.resolved === false ? undefined : p.index.get(r.key);
	// Not a <button>: themes restyle every button, and these are chips.
	const c = el("span", { cls: "universeview-ep-person" + (target ? "" : " is-missing") + (tone ? ` tone-${tone}` : ""), attr: target ? { role: "button", tabindex: "0" } : {} }, into);
	const av = el("span", { cls: "universeview-ep-avatar" }, c);
	av.style.setProperty("--avatar", target ? entityColor(p, target) : "var(--text-faint)");
	const url = target ? resourceUrl(p, target.image ?? target.logo) : undefined;
	if (url) el("img", { attr: { src: url, alt: "" } }, av);
	else if (target) icon(av, TYPE_ICONS[target.type]);
	else av.setText(r.name.charAt(0).toUpperCase());
	const txt = el("span", { cls: "universeview-ep-person-text" }, c);
	el("span", { cls: "universeview-ep-person-name", text: target?.name ?? r.name }, txt);
	if (sub) el("span", { cls: "universeview-ep-person-sub", text: sub }, txt);
	if (!target) {
		c.title = `${r.name} has no note yet`;
		return c;
	}
	c.addEventListener("click", (evt) => (evt.ctrlKey || evt.metaKey ? openEntity(p, target.key, evt) : opts.pick(target.key)));
	c.addEventListener("keydown", (evt) => {
		if (evt.key === "Enter" || evt.key === " ") {
			evt.preventDefault();
			opts.pick(target.key);
		}
	});
	bindHover(p, c, target.key, opts.host);
	return c;
}

/** A bar for a note's span (a life, a reign, a realm), set against today, with its events as ticks. */
function spanBar(p: UniverseViewPlugin, root: HTMLElement, e: Entity) {
	if (!e.start && !e.end) return;
	const cal = p.calendars.get(e.calendar);
	const start = e.start?.start ?? e.end!.start;
	const today = p.openEndOf(e);
	const end = e.end?.end ?? today ?? start;
	const box = el("div", { cls: "universeview-ep-span" }, root);
	const row = el("div", { cls: "universeview-ep-span-labels" }, box);
	el("span", { text: e.start ? formatDate(e.start, cal) : "?" }, row);
	const years = Math.max(0, (end - start) / YEAR);
	const len = e.type === "person" ? (e.end ? `died aged ${Math.floor(years)}` : today !== undefined ? `aged ${Math.floor(years)}` : "") : years >= 1 ? `${Math.round(years).toLocaleString()} year${Math.round(years) === 1 ? "" : "s"}${!e.end && today !== undefined ? " and counting" : ""}` : "";
	el("span", { cls: "universeview-ep-span-len", text: len }, row);
	el("span", { text: e.end ? formatDate(e.end, cal) : today !== undefined ? "today" : "" }, row);
	const bar = el("div", { cls: "universeview-ep-span-bar" + (!e.end && today !== undefined ? " is-open" : "") }, box);
	const fill = el("div", { cls: "universeview-ep-span-fill" }, bar);
	fill.setCssStyles({ width: "100%" });
	const width = Math.max(1, end - start);
	for (const x of p.index.events(e.key)) {
		const d = x.start?.start;
		if (d === undefined || d < start || d > end) continue;
		const tick = el("span", { cls: "universeview-ep-span-tick", attr: { title: `${x.name} · ${formatDate(x.start, p.calendars.get(x.calendar))}` } }, bar);
		tick.style.left = `${((d - start) / width) * 100}%`;
	}
}
