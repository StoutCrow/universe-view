import { TFile } from "obsidian";
import type UniverseViewPlugin from "../main";
import type { Entity, Side, TimedRef } from "../types";
import { formatDate, formatSpan } from "../dates/parser";
import { locate, peopleAmong, placesBeen } from "../index/whereabouts";
import { ancestorOfKind, eventsWithin, kindsAlong, placeChain, placeLine, placesInside } from "../index/placepath";
import { isMovement } from "../index/eventkinds";
import { chainOf, holdingsOf , tierLabel } from "../index/realms";
import { relLabel, relOne, relTone } from "../index/relkinds";
import { totalPopulation } from "../index/tidy";
import { battlesOf, isWar, occupationsByLand, sidesOf, warSpan } from "../index/wars";
import { asText } from "../index/text";
import { buildFieldAliases } from "../settings";
import { relKind } from "../index/relkinds";
import { GROUP_KINDS, groupKind } from "../render/houses";
import { ROW_INFO } from "../index/membership";
import { DEMONYM_KEYS, RULER_TITLE_KEYS } from "../index/realmwords";
import { personTitle } from "../render/rulertitle";
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
	"Led by": "Who led it (`lead:` on an event). They count as present too.",
	"Members present": "An event at a place lists who was there (`participants:`). Each counts as being at that place on those dates, so it shows under their \"Places been\".",
	Residences: "Where they live by default (`residences:`, with dates if they moved). Their location whenever no event puts them elsewhere.",
	"Where were they?": "Type a date: the place of the event they were in then, otherwise their home at the time, otherwise where they were born.",
	"Places been":"Where they were born, lived, took part in an event, and died, oldest first.",
	Inside: "Places directly inside this one (`located-in:` on them), with how many more are inside those.",
	People: "Everyone born, living, dead or in an event here or in any place inside it.",
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
	if (e.aka.length) el("div", { cls: "universeview-ep-aka", text: `Also called ${e.aka.join(", ")}` }, titles);
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
	// A ruler's title, as on their family tree card ("Queen of England"); how they are addressed is its hover.
	const held = personTitle(p, e);
	if (held?.lead) chip(held.lead, "crown").setAttribute("title", [held.address, held.titles.join(", ")].filter(Boolean).join(" · "));
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

	// ---- Where it is: the place, then each place it is inside, as in a postal address ----
	if (e.type === "place") {
		const chain = placeChain((k) => idx.get(k), e.key);
		const top = chain[chain.length - 1];
		const further = top?.locatedIn && !top.locatedIn.resolved ? top.locatedIn.name : undefined;
		if (chain.length > 1 || further) {
			const line = el("div", { cls: "universeview-ep-crumbs uv-where", attr: { "aria-label": "Where it is: each place is inside the next" } }, root);
			chain.forEach((place, i) => {
				if (i) el("span", { cls: "universeview-ep-crumb-sep", text: "," }, line);
				const b = el("span", { cls: "universeview-ep-crumb" + (i ? "" : " is-here"), text: place.name, attr: i ? { role: "button", tabindex: "0" } : {} }, line);
				if (!i) return;
				b.addEventListener("click", (evt) => (evt.ctrlKey || evt.metaKey ? openEntity(p, place.key, evt) : opts.pick(place.key)));
				bindHover(p, b, place.key, opts.host);
			});
			if (further) {
				el("span", { cls: "universeview-ep-crumb-sep", text: "," }, line);
				el("span", { cls: "universeview-ep-crumb is-missing", text: further, attr: { title: `${further} has no note yet` } }, line);
			}
		}
	}

	// ---- Its span, against today ----
	spanBar(p, root, e);

	// ---- Numbers at a glance ----
	const tiles: [string, string, string][] = [];
	// A place's events are those at it and at every place inside it.
	const events = e.type === "place" ? eventsWithin(idx, e.key) : idx.events(e.key);
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
		// Where they live by default (folds away in the inspector), then every place they have been.
		list("Residences", "home", e.residences.map((r) => ({ ...r.ref, sub: formatSpan(r.from, r.to, cal) })));
		const been = placesBeen(e, idx.events(e.key));
		if (been.length) {
			// One chip per place, with why they were there (the first two reasons) and the first date. When the places
			// sit in a hierarchy, buttons roll them up to the county, state or country they are in.
			const get = (k: string) => idx.get(k);
			const WHY = { born: "Born", lived: "Lived", died: "Died" } as const;
			const levels = kindsAlong(been.map((s) => placeChain(get, s.place.key)));
			const body = section("Places been", "map-pin");
			let level = "";
			const show = () => {
				body.empty();
				const byPlace = new Map<string, { place: (typeof been)[number]["place"]; why: string[]; when: string }>();
				for (const s of been) {
					const chain = placeChain(get, s.place.key);
					const target = (level && ancestorOfKind(chain, level)) || chain[0];
					const place = target ? { key: target.key, name: target.name, resolved: true } : s.place;
					const g = byPlace.get(place.key) ?? { place, why: [], when: "" };
					const why = s.how === "event" ? s.event!.name : WHY[s.how];
					if (!g.why.includes(why)) g.why.push(why);
					g.when ||= formatSpan(s.from, s.to, cal);
					byPlace.set(place.key, g);
				}
				const groups = [...byPlace.values()];
				for (const g of groups.slice(0, 12)) person(body, g.place, [g.why.length > 2 ? `${g.why.slice(0, 2).join(", ")} +${g.why.length - 2}` : g.why.join(", "), g.when].filter(Boolean).join(" · "));
				if (groups.length > 12) el("span", { cls: "universeview-ep-more", text: `+${groups.length - 12} more` }, body);
			};
			if (levels.length > 1) {
				const bar = el("div", { cls: "uv-levels", attr: { role: "group", "aria-label": "Show places as" } });
				body.parentElement?.insertBefore(bar, body);
				for (const [value, label] of [["", "Exact"], ...levels.map((k) => [k, cap(k)] as [string, string])]) {
					const b = el("button", { cls: "uv-level", text: label, attr: { "aria-pressed": String(value === level) } }, bar);
					b.addEventListener("click", () => {
						level = value;
						for (const x of Array.from(bar.children)) x.setAttribute("aria-pressed", String(x === b));
						show();
					});
				}
			}
			show();
		}
		if (been.length) {
			// Type a date to see where they were then, and why. The answer's row is always there, so nothing jumps.
			const s = section("Where were they?", "calendar-search");
			s.addClass("uv-when");
			const input = el("input", { cls: "uv-when-input", attr: { type: "text", placeholder: "A date, such as 1066", "aria-label": "Date" } }, s);
			const out = el("div", { cls: "uv-when-out", attr: { "aria-live": "polite" } }, s);
			input.addEventListener("input", () => {
				out.empty();
				const v = input.value.trim();
				if (!v) return;
				const note = (text: string, bad = false) => el("span", { cls: "uv-when-note" + (bad ? " is-bad" : ""), text }, out);
				const d = p.parseDate(v, e.calendar);
				if (!d) return void note("Not a date yet", true);
				const w = locate(e, idx.events(e.key), d.start);
				if (!w) return void note("No known place then");
				person(out, w.place, w.event ? `${isMovement(w.event) ? "On" : "At"} ${w.event.name}` : w.why === "home" ? "Home" : "Where they were born");
			});
		}
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
		list("Led by", "crown", e.leads.map((r) => ({ ...r })));
		// An event at a place lists its members; one with no place only says who was there.
		list(e.places.length ? "Members present" : "Who was there", "users", e.participants.filter((r) => !e.leads.some((l) => l.key === r.key)).map((r) => ({ ...r })), 16);
		list("From", "map-pin", e.startPlace ? [{ ...e.startPlace }] : []);
		list("To", "flag", e.endPlace ? [{ ...e.endPlace }] : []);
		list("Where", "map-pin", e.places.filter((r) => r.key !== e.startPlace?.key && r.key !== e.endPlace?.key).map((r) => ({ ...r })));
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
		// What is inside it, and who and what is tied to it or to anything inside it.
		const inside = placesInside(idx.subPlacesOf, e.key);
		list("Inside", "layers", [...(idx.subPlacesOf.get(e.key) ?? [])].map((k) => {
			const deeper = placesInside(idx.subPlacesOf, k).size;
			return refOf(k, [cap(idx.get(k)?.category ?? ""), deeper ? `${deeper} inside` : ""].filter(Boolean).join(" · "));
		}), 16);
		const within = new Set([e.key, ...inside]);
		list("People", "users", peopleAmong(idx.all("person"), (k) => idx.events(k), within).map(({ person: who, why }) => ({ key: who.key, name: who.name, sub: why.length > 2 ? `${why.slice(0, 2).join(", ")} +${why.length - 2}` : why.join(", ") })), 12);
		const seated = idx.all("culture").filter((c) => !e.cultures.some((x) => x.ref.key === c.key) && c.places.some((r) => within.has(r.key)));
		list("Groups here", "flag", [...e.cultures.map((c) => ({ ...c.ref, sub: formatSpan(c.from, c.to, cal) })), ...seated.map((c) => ({ key: c.key, name: c.name, sub: `Based at ${c.places.find((r) => within.has(r.key))?.name ?? ""}` }))]);
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
		// A realm's own words get the names the edit form gives them.
		const label = DEMONYM_KEYS.includes(k.toLowerCase()) ? "Its people" : RULER_TITLE_KEYS.includes(k.toLowerCase()) ? "Ruler's title" : cap(k.replace(/[-_]/g, " "));
		if (text) out.push([label, text]);
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
	// A place with nothing else to say says where it is: "Oklahoma County, Oklahoma".
	const where = sub ?? (target?.type === "place" ? placeLine(placeChain((k) => p.index.get(k), target.key).slice(1, 3)) : "");
	if (where) el("span", { cls: "universeview-ep-person-sub", text: where }, txt);
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
