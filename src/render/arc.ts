import type ChroniclePlugin from "../main";
import type { ChronDate, Entity } from "../types";
import { formatDate, formatSpan } from "../dates/parser";
import { spacedLabels, yearTicks } from "../dates/calendars";
import { totalPopulation } from "../index/tidy";
import { TFile } from "obsidian";
import { bindHover, cultureColor, el, emptyState, entityColor, icon, openEntity, resourceUrl, svg } from "./common";

const YEAR = 365.25;

/**
 * A person's life in one strip: their lifespan, the groups and roles they held, partners,
 * children's births, where they were, and their events, all on one time axis.
 */
export class ArcRenderer {
	private root: HTMLElement;
	private resizeObs: ResizeObserver;

	constructor(private container: HTMLElement, private plugin: ChroniclePlugin, public person: string | undefined, private hoverParent: { hoverPopover: unknown } | HTMLElement = container) {
		this.root = el("div", { cls: "chronicle-arc" }, container);
		let w = 0;
		this.resizeObs = new ResizeObserver(() => {
			if (Math.abs(this.root.clientWidth - w) < 4) return;
			w = this.root.clientWidth;
			this.refresh();
		});
		this.resizeObs.observe(this.root);
		this.refresh();
	}

	destroy() {
		this.resizeObs.disconnect();
		this.root.remove();
	}

	/**
	 * No dates to draw a life with: say what's missing and why (an empty or unreadable `lifespan:`),
	 * with the birth and death dates to fill in right here, checked as you type.
	 */
	private missingDates(p: Entity) {
		const plugin = this.plugin;
		const cal = plugin.calendars.get(p.calendar);
		const box = el("div", { cls: "uv-arc-missing" }, this.root);
		const head = el("div", { cls: "uv-arc-missing-head" }, box);
		icon(el("span", { cls: "uv-arc-missing-icon" }, head), "calendar-plus");
		const text = el("div", {}, head);
		el("div", { cls: "uv-arc-missing-title", text: `${p.name} has no dates yet` }, text);
		const life = p.props.lifespan;
		const why = typeof life === "string" && life.trim()
			? `Its lifespan “${life.trim()}” couldn't be read as dates in the ${cal.name} calendar.`
			: life !== undefined
				? "Its lifespan is still empty."
				: "Add when they were born and died to see their life on a line, with their events, roles and children along it.";
		el("div", { cls: "uv-arc-missing-body", text: why }, text);
		const form = el("div", { cls: "uv-arc-missing-form" }, box);
		const ref = plugin.index.all("person").find((x) => x.key !== p.key && x.folder === p.folder && x.start) ?? plugin.index.all("person").find((x) => x.start && x.calendar === p.calendar);
		const example = cal.id === "gregorian" ? "1485-08-22, c. 1480" : ref?.start ? formatDate(ref.start, plugin.calendars.get(ref.calendar)) : "a year in this world";
		const values: Record<string, string> = {};
		const field = (key: "born" | "died", label: string) => {
			const wrap = el("label", { cls: "uv-arc-missing-field" }, form);
			el("span", { text: label }, wrap);
			const input = el("input", { attr: { type: "text", placeholder: key === "born" ? `e.g. ${example}` : "Leave empty if living" } }, wrap);
			const check = el("span", { cls: "uv-arc-missing-check" }, wrap);
			input.addEventListener("input", () => {
				values[key] = input.value.trim();
				const d = values[key] ? plugin.parseDate(values[key], cal.id) : null;
				check.setText(!values[key] ? "" : d ? `✓ ${formatSpan(d, undefined, cal)}` : "Not a date yet");
				check.toggleClass("is-bad", !!values[key] && !d);
				save.disabled = !Object.values(values).some((v) => v && plugin.parseDate(v, cal.id));
			});
			input.addEventListener("keydown", (evt) => {
				if (evt.key === "Enter" && !save.disabled) save.click();
			});
		};
		field("born", "Born");
		field("died", "Died");
		const save = el("button", { cls: "mod-cta", text: "Save dates" }, form);
		save.disabled = true;
		save.addEventListener("click", () => {
			const file = plugin.app.vault.getAbstractFileByPath(p.path);
			if (!(file instanceof TFile)) return;
			void plugin.editFrontmatter(file, (fm) => {
				for (const k of ["born", "died"] as const) if (values[k] && plugin.parseDate(values[k], cal.id)) fm[plugin.fieldName(k)] = values[k];
			}, `Dates for ${p.name}`);
		});
		// An example in this world's own style: a relative's, or a neighbour's, lifespan as it's written.
		const near = [...p.parents.map((r) => plugin.index.get(r.key)), ...plugin.index.all("person").filter((x) => x.folder === p.folder || x.folder.startsWith(p.folder.split("/").slice(0, -1).join("/")))]
			.find((x) => x && x.key !== p.key && typeof x.props.lifespan === "string" && x.props.lifespan.trim() && x.start);
		const sample = near ? `lifespan: ${String(near.props.lifespan).trim()} (as ${near.name}'s is written)` : "lifespan: with a start and an end year";
		el("div", { cls: "uv-arc-missing-foot", text: `Or write them in the note, as born: and died:, or as one line like ${sample}. Dated events they take part in show here too.` }, box);
	}

	refresh() {
		this.root.empty();
		const idx = this.plugin.index;
		const p = idx.get(this.person);
		if (!p || p.type !== "person") {
			emptyState(this.root, "user-round", "No person", "Use `person: Name` in the block, or put it in a person's note.");
			return;
		}
		const cal = this.plugin.calendars.get(p.calendar);
		const events = idx.events(p.key).filter((e) => e.type === "event" && e.start).sort((a, b) => a.start!.start - b.start!.start);
		const kids = idx.children(p.key).map((k) => idx.get(k)).filter((k): k is Entity => !!k?.start);
		const partners = idx.partners(p.key);
		const dated = [p.start?.start, p.end?.end, ...events.map((e) => e.start!.start), ...kids.map((k) => k.start!.start), ...p.cultures.flatMap((c) => [c.from?.start, c.to?.end]), ...partners.flatMap((x) => [x.from?.start, x.to?.end])].filter((d): d is number => d !== undefined && Number.isFinite(d));
		if (!dated.length) {
			this.missingDates(p);
			return;
		}
		let min = Math.min(...dated);
		let max = Math.max(...dated);
		if (max - min < 5 * YEAR) max = min + 5 * YEAR;
		const pad = (max - min) * 0.04;
		min -= pad;
		max += pad;
		const LABEL = 110;
		const width = Math.max(420, this.root.clientWidth - 8);
		const plot = width - LABEL - 12;
		const x = (d: number) => LABEL + ((d - min) / (max - min)) * plot;
		const lifeEnd = p.end?.end ?? max - pad / 2;
		type Lane = { label: string; bars: { a: number; b: number; text: string; color: string; key?: string; open?: boolean }[]; dots: { d: number; text: string; color: string; key?: string }[] };
		const lanes: Lane[] = [];
		lanes.push({ label: "Life", bars: [{ a: p.start?.start ?? min + pad, b: lifeEnd, text: formatSpan(p.start, p.end, cal) || "dates unknown", color: entityColor(this.plugin, p), key: p.key, open: !p.end }], dots: [] });
		for (const c of p.cultures) {
			const a = c.from?.start ?? p.start?.start ?? min + pad;
			const b = c.to?.end ?? lifeEnd;
			lanes.push({ label: c.role ?? "Member", bars: [{ a, b, text: c.ref.name, color: cultureColor(this.plugin, c.ref.key), key: c.ref.key, open: !c.to && !p.end }], dots: [] });
		}
		if (partners.length) {
			lanes.push({
				label: "Partners",
				bars: partners.map((x) => {
					const other = idx.get(x.ref.key);
					const a = x.from?.start ?? Math.max(p.start?.start ?? min, other?.start?.start ?? min) + 18 * YEAR;
					const b = x.to?.end ?? Math.min(lifeEnd, other?.end?.end ?? lifeEnd);
					return { a, b: Math.max(b, a + YEAR), text: x.ref.name, color: other ? entityColor(this.plugin, other) : "var(--text-faint)", key: x.ref.key };
				}),
				dots: [],
			});
		}
		if (kids.length) lanes.push({ label: "Children", bars: [], dots: kids.map((k) => ({ d: k.start!.start, text: k.name, color: entityColor(this.plugin, k), key: k.key })) });
		// Where they were: each event's place until the next one.
		const stops = events.map((e) => ({ d: e.start!.start, place: e.places.map((r) => idx.get(r.key)).find(Boolean) })).filter((s) => s.place);
		if (stops.length) {
			lanes.push({
				label: "Where",
				bars: stops.map((s, i) => ({ a: s.d, b: i + 1 < stops.length ? stops[i + 1].d : Math.min(lifeEnd, s.d + 5 * YEAR), text: s.place!.name, color: entityColor(this.plugin, s.place!), key: s.place!.key })),
				dots: [],
			});
		}
		if (events.length) lanes.push({ label: "Events", bars: [], dots: events.map((e) => ({ d: e.start!.start, text: e.name, color: entityColor(this.plugin, e), key: e.key })) });

		const LANE = 30;
		const AXIS = 24;
		const height = AXIS + lanes.length * LANE + 8;
		const s = svg("svg", { width, height, class: "chronicle-arc-svg" }, this.root);
		const yearPx = (plot / (max - min)) * YEAR;
		const nice = [1, 2, 5, 10, 20, 25, 50, 100];
		const step = nice.find((n) => n * yearPx >= 60) ?? 100;
		const ticks = yearTicks(cal, cal.fromDays(min).y, cal.fromDays(max).y, step, step * 5).map((t) => ({ ...t, x: x(cal.toDays(t.year, 1, 1)), label: cal.formatYear(t.year) })).filter((t) => t.x >= LABEL);
		const shown = spacedLabels(ticks);
		for (const t of ticks) {
			svg("line", { x1: t.x, x2: t.x, y1: AXIS - 4, y2: height, class: "chronicle-lineage-grid" }, s);
			if (!shown.has(t)) continue;
			const tx = svg("text", { x: t.x, y: AXIS - 8, "text-anchor": "middle", class: "chronicle-lineage-tick" }, s);
			tx.textContent = t.label;
		}
		const ageAt = (d: number) => (p.start ? ` (aged ${Math.floor((d - p.start.start) / YEAR)})` : "");
		lanes.forEach((lane, i) => {
			const y = AXIS + i * LANE;
			if (i % 2 === 0) svg("rect", { x: 0, y, width, height: LANE, class: "chronicle-org-lane-bg" }, s);
			const lt = svg("text", { x: 8, y: y + 19, class: "chronicle-arc-lane" }, s);
			lt.textContent = lane.label.length > 16 ? lane.label.slice(0, 15) + "…" : lane.label;
			for (const b of lane.bars) {
				const g = svg("g", { class: "chronicle-arc-bar" + (b.open ? " is-open" : "") }, s);
				g.setAttribute("style", `--item-color: ${b.color}`);
				const w = Math.max(4, x(b.b) - x(b.a));
				svg("rect", { x: x(b.a), y: y + 7, width: w, height: 16, rx: 8 }, g);
				if (w > b.text.length * 6 + 14) {
					const t = svg("text", { x: x(b.a) + 7, y: y + 19, class: "chronicle-arc-text" }, g);
					t.textContent = b.text;
				}
				const tt = svg("title", {}, g);
				tt.textContent = b.text;
				if (b.key) this.link(g, b.key);
			}
			let lastLabelEnd = -Infinity;
			for (const d of lane.dots) {
				const g = svg("g", { class: "chronicle-arc-dot" }, s);
				g.setAttribute("style", `--item-color: ${d.color}`);
				const cx = x(d.d);
				svg("circle", { cx, cy: y + 15, r: 5 }, g);
				if (cx > lastLabelEnd + 6) {
					const t = svg("text", { x: cx + 8, y: y + 19, class: "chronicle-arc-text is-dot" }, g);
					t.textContent = d.text.length > 22 ? d.text.slice(0, 21) + "…" : d.text;
					lastLabelEnd = cx + 8 + Math.min(22, d.text.length) * 6;
				}
				const tt = svg("title", {}, g);
				tt.textContent = `${d.text}\n${formatDate({ start: d.d, end: d.d, precision: "year", approx: false, calendar: cal.id, raw: "" }, cal)}${ageAt(d.d)}`;
				if (d.key) this.link(g, d.key);
			}
		});
	}

	private link(g: Element, key: string) {
		g.addEventListener("click", (evt) => openEntity(this.plugin, key, evt as MouseEvent));
		bindHover(this.plugin, g, key, this.hoverParent);
	}
}

/**
 * An infobox for a note, kept up to date from its properties: picture, kind, dates with age or
 * duration, family, roles, places and population, like the box at the top of an encyclopedia article.
 */
export function renderFacts(plugin: ChroniclePlugin, host: HTMLElement, key: string | undefined, hoverParent: { hoverPopover: unknown } | HTMLElement = host) {
	host.empty();
	const idx = plugin.index;
	const e = idx.get(key);
	if (!e) {
		emptyState(host, "file-question", "Nothing to show", "Use `note: Name` in the block, or put it in a UniverseView note.");
		return;
	}
	const cal = plugin.calendars.get(e.calendar);
	const box = el("div", { cls: "chronicle-facts" }, host);
	box.style.setProperty("--item-color", entityColor(plugin, e));
	const title = el("div", { cls: "chronicle-facts-title" }, box);
	const name = el("a", { cls: "internal-link", text: e.name }, title);
	name.addEventListener("click", (evt) => openEntity(plugin, e.key, evt));
	if (e.category) el("div", { cls: "chronicle-facts-kind", text: e.category.charAt(0).toUpperCase() + e.category.slice(1) }, title);
	const img = resourceUrl(plugin, e.image ?? e.logo);
	if (img) el("img", { cls: "chronicle-facts-image", attr: { src: img, alt: "" } }, box);
	const table = el("div", { cls: "chronicle-facts-rows" }, box);
	const row = (label: string, ...values: (string | { key: string; name: string; note?: string } | undefined)[]) => {
		const vals = values.filter((v): v is NonNullable<typeof v> => !!v);
		if (!vals.length) return;
		el("div", { cls: "chronicle-facts-label", text: label }, table);
		const cell = el("div", { cls: "chronicle-facts-value" }, table);
		vals.forEach((v, i) => {
			if (i) cell.append(", ");
			if (typeof v === "string") cell.append(v);
			else {
				const a = el("a", { cls: "internal-link", text: v.name }, cell);
				if (idx.get(v.key)) {
					a.addEventListener("click", (evt) => openEntity(plugin, v.key, evt));
					bindHover(plugin, a, v.key, hoverParent);
				} else a.addClass("is-unresolved");
				if (v.note) cell.append(` (${v.note})`);
			}
		});
	};
	const date = (d?: ChronDate) => (d ? formatDate(d, cal) : undefined);
	const years = (a?: ChronDate, b?: ChronDate) => (a && b ? Math.floor((b.start - a.start) / YEAR) : undefined);
	const ref = (r: { key: string; name: string }, note?: string) => ({ key: r.key, name: idx.get(r.key)?.name ?? r.name, note });
	switch (e.type) {
		case "person": {
			const age = years(e.start, e.end);
			row("Born", date(e.start), e.birthPlace && ref(e.birthPlace));
			row("Died", e.end ? `${date(e.end)}${age !== undefined ? `, aged ${age}` : ""}` : undefined, e.deathPlace && ref(e.deathPlace));
			row("Parents", ...e.parents.map((r) => ref(r)));
			row("Partners", ...idx.partners(e.key).map((pt) => ref(pt.ref, pt.from ? `from ${date(pt.from)}` : undefined)));
			row("Children", ...idx.children(e.key).map((k) => idx.get(k)).filter((k): k is Entity => !!k).map((k) => ({ key: k.key, name: k.name })));
			for (const c of e.cultures) row(c.role ?? "Member of", ref(c.ref, c.from || c.to ? formatSpan(c.from, c.to, cal) : undefined));
			break;
		}
		case "culture": {
			row("Founded", date(e.start));
			row("Dissolved", date(e.end), e.end && e.start ? `after ${years(e.start, e.end)} years` : undefined);
			const leaders = idx.members(e.key).filter((m) => m.link.role && /\b(king|queen|ruler|leader|head|chief|master|lord|lady|emperor|empress|commander|captain|president|founder)\b/i.test(m.link.role));
			row("Led by", ...leaders.slice(-4).map((m) => ({ key: m.key, name: idx.get(m.key)?.name ?? m.key, note: [m.link.role, formatSpan(m.link.from, m.link.to, cal)].filter(Boolean).join(", ") })));
			row("Members", String(idx.members(e.key).filter((m) => idx.get(m.key)?.type === "person").length));
			row("Holds", ...idx.members(e.key).filter((m) => idx.get(m.key)?.type === "place").slice(0, 8).map((m) => ({ key: m.key, name: idx.get(m.key)!.name })));
			row("Part of", ...e.parentCultures.map((r) => ref(r)));
			break;
		}
		case "place": {
			const chain: { key: string; name: string }[] = [];
			for (let cur = e.locatedIn, i = 0; cur && i < 8; cur = idx.get(cur.key)?.locatedIn, i++) chain.push(ref(cur));
			row("In", ...chain);
			row("Founded", date(e.start));
			row("Abandoned", date(e.end));
			const pop = totalPopulation(idx, e.key);
			row("Population", pop ? `${pop.total.toLocaleString()}${pop.counted > 1 ? ` across ${pop.counted} places` : ""}` : undefined);
			row("Held by", ...e.cultures.map((c) => ref(c.ref, c.from || c.to ? formatSpan(c.from, c.to, cal) : undefined)));
			row("Terrain", e.terrain);
			const n = idx.events(e.key).length;
			row("Events here", n ? String(n) : undefined);
			break;
		}
		case "event": {
			row("When", formatSpan(e.start, e.end, cal) || undefined);
			row("Where", ...e.places.map((r) => ref(r)));
			row("Who", ...e.participants.map((r) => ref(r)));
			row("Sides", ...e.cultures.map((c) => ref(c.ref, c.role)));
			break;
		}
		case "map":
			row("Places", String(idx.placesOnMap.get(e.key)?.size ?? 0));
			break;
	}
	if (e.summary) el("div", { cls: "chronicle-facts-summary", text: e.summary }, box);
}
