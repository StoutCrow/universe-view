import type ChroniclePlugin from "../main";
import type { Entity } from "../types";
import { formatSpan } from "../dates/parser";
import { spacedLabels, yearTicks } from "../dates/calendars";
import { PanZoom } from "./panzoom";
import { bindHover, cultureColor, el, emptyState, entityColor, iconButton, openEntity, resourceUrl, showEntityMenu, svg } from "./common";
import { pickLogo } from "../ui/suggest";

export interface HousesOptions {
	folder?: string;
	/** Only family-like groups (houses, dynasties, clans), or every group. */
	all: boolean;
	/** People without a house of their own count in their parents' house. */
	descent: boolean;
	calendar?: string;
}

export const DEFAULT_HOUSES_OPTIONS: HousesOptions = { all: false, descent: true };

const HOUSE = /\b(house|family|dynasty|clan|lineage|line|kin|kindred|tribe|bloodline)\b/i;
const HEAD = /\b(head|lord|lady|king|queen|patriarch|matriarch|chief|ruler|duke|duchess|count|countess|baron|prince|princess|emperor|empress|monarch|sovereign)\b/i;
const NOT_HOUSE = /\b(church|faith|religion|order|guild|company|army|navy|kingdom|realm|empire|nation|council|crown|republic|city|league|society|cult|temple)\b/i;
const YEAR = 365.2425;
const LABEL_W = 230;
const ROW_H = 20;
const BAND_PAD = 30;
const GAP = 16;

interface Band {
	house: Entity;
	members: { p: Entity; a: number; b: number; head: boolean; row: number }[];
	rows: number;
	y: number;
	h: number;
	a: number;
	b: number;
}

/** Whether a group is a family: by its kind, its name, or its members being related to each other. */
export function isHouse(plugin: ChroniclePlugin, c: Entity): boolean {
	if (HOUSE.test(`${c.category ?? ""} ${c.tags.join(" ")}`) || /^(house|clan|family|dynasty)\b/i.test(c.name)) return true;
	// Churches, orders, realms and companies have related members too, but aren't families.
	if (NOT_HOUSE.test(`${c.name} ${c.category ?? ""} ${c.tags.join(" ")}`)) return false;
	const idx = plugin.index;
	const people = new Set(idx.members(c.key).map((m) => m.key));
	let ties = 0;
	for (const k of people) for (const p of idx.get(k)?.parents ?? []) if (people.has(p.key)) ties++;
	return ties >= 2;
}

/**
 * Houses over the generations: each house is a band across time with its logo, its members' lives
 * inside it (heads of the house crowned and joined in order of succession), the marriages that tie
 * it to other houses, and the cadet branches that split from it.
 */
export class HousesRenderer {
	private root: HTMLElement;
	private svgEl: SVGSVGElement;
	private layer: SVGGElement;
	private pz: PanZoom;
	private bbox = { x: 0, y: 0, width: 1, height: 1 };

	constructor(private container: HTMLElement, private plugin: ChroniclePlugin, public options: HousesOptions, private embedded = false, private hoverParent: { hoverPopover: unknown } | HTMLElement = container) {
		this.root = el("div", { cls: "chronicle-houses" + (embedded ? " is-embedded" : "") }, container);
		this.svgEl = svg("svg", { class: "chronicle-canvas" }, this.root);
		const defs = svg("defs", {}, this.svgEl);
		const clip = svg("clipPath", { id: "chronicle-house-logo" }, defs);
		svg("rect", { x: 0, y: 0, width: 40, height: 40, rx: 8 }, clip);
		this.layer = svg("g", {}, this.svgEl);
		this.pz = new PanZoom(this.svgEl, this.layer, { requireModifier: embedded, minScale: 0.1, maxScale: 4 });
		if (embedded) {
			const box = el("div", { cls: "chronicle-embed-controls" }, this.root);
			iconButton(box, "zoom-in", "Zoom in", () => this.pz.zoomBy(1.25));
			iconButton(box, "zoom-out", "Zoom out", () => this.pz.zoomBy(1 / 1.25));
			iconButton(box, "maximize", "Fit", () => this.fit());
		}
		this.refresh();
	}

	destroy() {
		this.pz.destroy();
		this.root.remove();
	}

	fit() {
		this.pz.fit(this.bbox, 20, 1);
	}

	zoomBy(f: number) {
		this.pz.zoomBy(f);
	}

	/** Each person's house: their own family group, else (with descent on) a parent's, father first. */
	private houseOf(houses: Set<string>): (p: Entity) => string | undefined {
		const idx = this.plugin.index;
		const memo = new Map<string, string | undefined>();
		const find = (p: Entity, depth: number): string | undefined => {
			if (memo.has(p.key)) return memo.get(p.key);
			memo.set(p.key, undefined);
			let h = p.cultures.find((c) => houses.has(c.ref.key))?.ref.key;
			if (!h && this.options.descent && depth < 8) {
				const parents = p.parents.map((r) => idx.get(r.key)).filter((x): x is Entity => !!x).sort((a, b) => Number(b.gender === "male") - Number(a.gender === "male"));
				for (const par of parents) if ((h = find(par, depth + 1))) break;
			}
			memo.set(p.key, h);
			return h;
		};
		return (p) => find(p, 0);
	}

	refresh() {
		this.layer.replaceChildren();
		this.root.querySelector(".chronicle-empty")?.remove();
		const idx = this.plugin.index;
		const o = this.options;
		const inScope = (e: Entity) => !o.folder || e.path.startsWith(o.folder + "/");
		const houses = idx.all("culture").filter((c) => inScope(c) && (o.all || isHouse(this.plugin, c)));
		const keys = new Set(houses.map((h) => h.key));
		const houseOf = this.houseOf(keys);
		const bands = new Map<string, Band>();
		for (const h of houses) bands.set(h.key, { house: h, members: [], rows: 0, y: 0, h: 0, a: h.start?.start ?? Infinity, b: h.end?.end ?? -Infinity });
		for (const p of idx.all("person")) {
			if (!inScope(p) || !(p.start || p.end)) continue;
			const hk = houseOf(p);
			const band = hk ? bands.get(hk) : undefined;
			if (!band) continue;
			const a = p.start?.start ?? p.end!.start - 60 * YEAR;
			const b = p.end?.end ?? this.plugin.openEndOf(p) ?? (p.start ? Math.min(p.start.start + 75 * YEAR, a + 75 * YEAR) : a);
			const role = idx.members(band.house.key).find((m) => m.key === p.key)?.link.role ?? "";
			const leads = band.house.relations.some((r) => r.ref.key === p.key && /leader|ruler|head|founder|monarch/i.test(r.kind ?? ""));
			band.members.push({ p, a, b, head: HEAD.test(role) || leads, row: 0 });
			band.a = Math.min(band.a, a);
			band.b = Math.max(band.b, b);
		}
		const list = [...bands.values()].filter((b) => b.members.length || (Number.isFinite(b.a) && Number.isFinite(b.b)));
		if (!list.length) {
			emptyState(this.root, "castle", "No houses yet", "Houses are groups whose kind is house, family, dynasty or clan (`kind: house`), or whose members are each other's parents and children. Give people `cultures: [[House …]]`, and their children follow them by descent.", this.embedded ? undefined : { label: "New house", onClick: () => this.plugin.createEntityPrompt({ type: "culture", scope: o.folder || undefined }) });
			return;
		}
		// Cadet branches sit right after the house they came from.
		const order: Band[] = [];
		const placed = new Set<string>();
		const add = (b: Band) => {
			if (placed.has(b.house.key)) return;
			placed.add(b.house.key);
			order.push(b);
			for (const c of list.filter((x) => x.house.parentCultures.some((p) => p.key === b.house.key)).sort((x, y) => x.a - y.a)) add(c);
		};
		for (const b of [...list].sort((x, y) => x.a - y.a)) if (!b.house.parentCultures.some((p) => bands.has(p.key) && list.includes(bands.get(p.key)!))) add(b);
		for (const b of list) add(b);
		// The time the people span (an old house's founding centuries earlier would squash everyone).
		const lives = order.flatMap((b) => b.members);
		let min = lives.length ? Math.min(...lives.map((m) => m.a)) - 15 * YEAR : Math.min(...order.map((b) => b.a));
		let max = lives.length ? Math.max(...lives.map((m) => m.b)) + 15 * YEAR : Math.max(...order.map((b) => b.b));
		if (!Number.isFinite(min) || !Number.isFinite(max)) return;
		const pad = Math.max(5 * YEAR, (max - min) * 0.03);
		min -= pad;
		max += pad;
		const years = (max - min) / YEAR;
		// As wide as the pane allows (names stay readable), wider only for long histories.
		const room = (this.svgEl.getBoundingClientRect().width || 1100) - LABEL_W - 40;
		const plotW = Math.max(500, Math.min(6000, Math.max(room, years * 4)));
		const x = (d: number) => LABEL_W + ((d - min) / (max - min)) * plotW;
		// Pack each house's members into rows, eldest first.
		let y = 34;
		for (const band of order) {
			const ends: number[] = [];
			band.members.sort((p, q) => p.a - q.a);
			for (const m of band.members) {
				const left = x(m.a);
				const right = Math.max(x(m.b), left + 6) + m.p.name.length * 6.2 + 12;
				let row = ends.findIndex((e) => e + 6 <= left);
				if (row < 0) {
					row = ends.length;
					ends.push(right);
				} else ends[row] = right;
				m.row = row;
			}
			band.rows = Math.max(1, ends.length);
			band.y = y;
			band.h = BAND_PAD + band.rows * ROW_H + 8;
			y += band.h + GAP;
		}
		const totalH = y;
		this.drawAxis(min, max, x, totalH, plotW);
		const where = new Map<string, { x1: number; x2: number; y: number; band: Band }>();
		for (const band of order) this.drawBand(band, x, plotW, where);
		this.drawBranches(order, x, bands);
		this.drawMarriages(where, x);
		this.bbox = { x: 0, y: 0, width: LABEL_W + plotW + 40, height: totalH + 10 };
		// Start at the top left at full size; zoom out to see more.
		window.requestAnimationFrame(() => {
			const r = this.svgEl.getBoundingClientRect();
			this.pz.k = Math.min(1, (r.width || this.bbox.width) / this.bbox.width);
			this.pz.x = 0;
			this.pz.y = 4;
			this.pz.apply();
		});
	}

	private cal() {
		return this.plugin.calendars.get(this.options.calendar ?? this.plugin.index.dominantCalendar(this.options.folder));
	}

	private drawAxis(min: number, max: number, x: (d: number) => number, h: number, plotW: number) {
		const cal = this.cal();
		const g = svg("g", { class: "chronicle-lineage-axis" }, this.layer);
		const yearPx = (plotW / (max - min)) * YEAR;
		const nice = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
		const step = nice.find((s) => s * yearPx >= 70) ?? 1000;
		const ticks = yearTicks(cal, cal.fromDays(min).y, cal.fromDays(max).y, step, step * 5).map((t) => ({ ...t, x: x(cal.toDays(t.year, 1, 1)), label: cal.formatYear(t.year) }));
		const labelled = spacedLabels(ticks);
		for (const t of ticks) {
			svg("line", { x1: t.x, x2: t.x, y1: 24, y2: h, class: "chronicle-lineage-grid" + (t.era ? " is-era" : "") }, g);
			if (!labelled.has(t)) continue;
			const tx = svg("text", { x: t.x, y: 16, "text-anchor": "middle", class: "chronicle-lineage-tick" }, g);
			tx.textContent = t.label;
		}
	}

	private drawBand(band: Band, x: (d: number) => number, plotW: number, where: Map<string, { x1: number; x2: number; y: number; band: Band }>) {
		const h = band.house;
		const color = h.color ?? cultureColor(this.plugin, h.key);
		const g = svg("g", { class: "chronicle-house", "data-key": h.key }, this.layer);
		g.setAttribute("style", `--house-color: ${color}`);
		svg("rect", { x: 8, y: band.y, width: LABEL_W + plotW - 8, height: band.h, rx: 12, class: "chronicle-house-bg" }, g);
		// The house's own span (founded to dissolved), as a tinted strip.
		if (h.start || h.end) {
			const a = Math.max(LABEL_W, x(h.start?.start ?? band.a));
			const b = Math.min(LABEL_W + plotW, x(h.end?.end ?? band.b));
			svg("rect", { x: a, y: band.y + 4, width: Math.max(4, b - a), height: band.h - 8, rx: 8, class: "chronicle-house-span" }, g);
		}
		// Logo (or a monogram) and name.
		const logoBox = svg("g", { class: "chronicle-house-logo", transform: `translate(20,${band.y + 10})` }, g);
		const logo = resourceUrl(this.plugin, h.logo ?? h.image);
		svg("rect", { width: 40, height: 40, rx: 8, class: "chronicle-house-logo-bg" }, logoBox);
		if (logo) svg("image", { href: logo, width: 40, height: 40, preserveAspectRatio: "xMidYMid meet", "clip-path": "url(#chronicle-house-logo)" }, logoBox);
		else {
			const t = svg("text", { x: 20, y: 26, "text-anchor": "middle", class: "chronicle-house-mono" }, logoBox);
			// "House of Tudor" → "T", "Clan Mac Neill" → "MN".
			const words = h.name.replace(/^(the\s+)?(house|clan|family|dynasty|line)\s+(of\s+)?/i, "").split(/\s+/).filter((w) => !/^(of|the|and|de|von|van)$/i.test(w));
			t.textContent = (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? h.name)[0]).toUpperCase();
		}
		svg("title", {}, logoBox).textContent = logo ? "Click to change the logo" : "Click to add a logo";
		logoBox.addEventListener("click", (evt) => {
			evt.stopPropagation();
			if (!this.pz.justPanned) pickLogo(this.plugin, h.key);
		});
		const name = svg("text", { x: 70, y: band.y + 26, class: "chronicle-house-name" }, g);
		name.textContent = h.name.length > 22 ? h.name.slice(0, 21) + "…" : h.name;
		const sub = svg("text", { x: 70, y: band.y + 43, class: "chronicle-house-sub" }, g);
		const heads = band.members.filter((m) => m.head).length;
		sub.textContent = [formatSpan(h.start, h.end, this.cal()), `${band.members.length} ${band.members.length === 1 ? "person" : "people"}`, heads ? `${heads} head${heads === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ");
		name.addEventListener("click", (evt) => openEntity(this.plugin, h.key, evt));
		name.addEventListener("contextmenu", (evt) => {
			evt.preventDefault();
			showEntityMenu(this.plugin, h.key, evt);
		});
		bindHover(this.plugin, name, h.key, this.hoverParent);
		// Members' lives.
		const crowns: { cx: number; cy: number; a: number }[] = [];
		for (const m of band.members) {
			const x1 = x(m.a);
			const x2 = Math.max(x(m.b), x1 + 6);
			const yy = band.y + BAND_PAD - 8 + m.row * ROW_H;
			const pg = svg("g", { class: "chronicle-house-person" + (m.head ? " is-head" : "") }, g);
			pg.setAttribute("style", `--person-color: ${entityColor(this.plugin, m.p)}`);
			svg("rect", { x: x1, y: yy, width: x2 - x1, height: ROW_H - 6, rx: 7, class: "chronicle-house-life" + (m.p.end ? "" : " is-open") }, pg);
			const label = svg("text", { x: x2 + 5, y: yy + 11, class: "chronicle-house-person-name" }, pg);
			label.textContent = (m.head ? "♛ " : "") + m.p.name;
			svg("title", {}, pg).textContent = `${m.p.name}\n${formatSpan(m.p.start, m.p.end, this.plugin.calendars.get(m.p.calendar))}${m.head ? "\nHead of the house" : ""}`;
			pg.addEventListener("click", (evt) => {
				if (!this.pz.justPanned) openEntity(this.plugin, m.p.key, evt);
			});
			pg.addEventListener("contextmenu", (evt) => {
				evt.preventDefault();
				showEntityMenu(this.plugin, m.p.key, evt);
			});
			bindHover(this.plugin, pg, m.p.key, this.hoverParent);
			if (!where.has(m.p.key)) where.set(m.p.key, { x1, x2, y: yy + (ROW_H - 6) / 2, band });
			if (m.head) crowns.push({ cx: x1, cy: yy + (ROW_H - 6) / 2, a: m.a });
		}
		// The line of heads, in order.
		crowns.sort((p, q) => p.a - q.a);
		for (let i = 1; i < crowns.length; i++) {
			const p = crowns[i - 1];
			const q = crowns[i];
			svg("path", { d: `M${p.cx},${p.cy} C${p.cx + 30},${p.cy} ${q.cx - 30},${q.cy} ${q.cx},${q.cy}`, class: "chronicle-house-succession" }, g);
		}
	}

	/** Cadet branches: a line from the parent house down to where the branch begins. */
	private drawBranches(order: Band[], x: (d: number) => number, bands: Map<string, Band>) {
		for (const b of order) {
			for (const p of b.house.parentCultures) {
				const parent = bands.get(p.key);
				if (!parent || !order.includes(parent)) continue;
				const at = Math.max(LABEL_W + 4, x(b.house.start?.start ?? b.a));
				const top = parent.y + parent.h;
				const g = svg("path", { d: `M${at},${top - 6} V${b.y + 6}`, class: "chronicle-house-branch" }, this.layer);
				svg("title", {}, g).textContent = `${b.house.name}, a branch of ${parent.house.name}`;
			}
		}
	}

	/** Marriages: a line between the spouses, wherever their houses are, at the wedding (or before the first child). */
	private drawMarriages(where: Map<string, { x1: number; x2: number; y: number; band: Band }>, x: (d: number) => number) {
		const idx = this.plugin.index;
		const done = new Set<string>();
		for (const [key, pos] of where) {
			const p = idx.get(key);
			if (!p) continue;
			for (const r of idx.partners(key)) {
				const other = where.get(r.ref.key);
				if (!other) continue;
				const id = [key, r.ref.key].sort().join("|");
				if (done.has(id)) continue;
				done.add(id);
				const kids = idx.children(key).filter((c) => idx.get(c)?.parents.some((pp) => pp.key === r.ref.key)).map((c) => idx.get(c)?.start?.start).filter((d): d is number => d !== undefined);
				const when = r.from?.start ?? (kids.length ? Math.min(...kids) - YEAR : Math.max(pos.x1, other.x1) === pos.x1 ? (p.start?.start ?? 0) + 22 * YEAR : (idx.get(r.ref.key)?.start?.start ?? 0) + 22 * YEAR);
				const mx = Math.min(Math.max(x(when), Math.max(pos.x1, other.x1)), Math.min(pos.x2, other.x2) + 40);
				const sameHouse = pos.band === other.band;
				const g = svg("g", { class: "chronicle-house-marriage" + (sameHouse ? " is-within" : "") }, this.layer);
				svg("line", { x1: mx, x2: mx, y1: pos.y, y2: other.y, class: "chronicle-house-marriage-line" }, g);
				const hy = (pos.y + other.y) / 2;
				const heart = svg("text", { x: mx, y: hy + 4, "text-anchor": "middle", class: "chronicle-house-heart" }, g);
				heart.textContent = "♥";
				svg("title", {}, g).textContent = `${p.name} married ${idx.get(r.ref.key)?.name ?? ""}${r.from ? ` (${formatSpan(r.from, undefined, this.cal())})` : ""}${sameHouse ? "" : `\nJoining ${pos.band.house.name} and ${other.band.house.name}`}`;
			}
		}
	}
}

export type GroupKind = "realm" | "house" | "faith" | "culture" | "organisation" | "group";

const FAITH = /\b(faith|religion|church|creed|cult|pantheon|temple|sect|belief|god|gods|deity|monastic|clergy)\b/i;
const PEOPLE = /\b(culture|people|peoples|ethnicity|ethnic|race|species|folk|tribe|tribes|language|tongue|nationality|heritage)\b/i;
const ORG = /\b(guild|company|order|army|navy|fleet|council|league|society|bank|school|academy|college|university|faction|party|band|crew|brotherhood|sisterhood|circle|cabal|union|alliance|corporation|firm|mercenar\w*|knights?)\b/i;

/** What a group note is, for labels and icons: a realm, a house, a faith, a people, an organisation or just a group. */
export function groupKind(plugin: ChroniclePlugin, c: Entity): GroupKind {
	if (c.type !== "culture") return "group";
	if (plugin.realms().nodes.has(c.key)) return "realm";
	if (isHouse(plugin, c)) return "house";
	const text = `${c.category ?? ""} ${c.tags.join(" ")}`;
	if (FAITH.test(text)) return "faith";
	if (ORG.test(text)) return "organisation";
	if (PEOPLE.test(text)) return "culture";
	const name = c.name;
	if (FAITH.test(name)) return "faith";
	if (ORG.test(name)) return "organisation";
	return "group";
}

export const GROUP_KINDS: Record<GroupKind, { label: string; plural: string; icon: string }> = {
	realm: { label: "Realm", plural: "Realms", icon: "crown" },
	house: { label: "House", plural: "Houses", icon: "castle" },
	faith: { label: "Faith", plural: "Faiths", icon: "sparkles" },
	culture: { label: "Culture", plural: "Cultures and peoples", icon: "languages" },
	organisation: { label: "Organisation", plural: "Organisations", icon: "briefcase" },
	group: { label: "Group", plural: "Other groups", icon: "flag" },
};