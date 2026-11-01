import type ChroniclePlugin from "../main";
import type { Entity } from "../types";
import { givenNames } from "../index/names";
import { activeAt } from "../index/EntityIndex";
import { bindHover, cultureColor, el, emptyState, openEntity, svg } from "./common";

const YEAR = 365.25;

/** Numbers about a world, worked out from its notes. No drawing here. */
export function worldStats(plugin: ChroniclePlugin, scope?: string) {
	const idx = plugin.index;
	const inScope = (e: Entity) => !scope || e.path.startsWith(scope + "/");
	const people = idx.all("person").filter(inScope);
	const cultures = idx.all("culture").filter(inScope);
	const dated = people.filter((p) => p.start);
	const cal = plugin.calendars.get(idx.dominantCalendar(scope));
	// Time range: from the earliest birth to the latest death (or birth + 60 years).
	const lo = Math.min(...dated.map((p) => p.start!.start));
	const hi = Math.max(...dated.map((p) => p.end?.end ?? p.start!.start + 60 * YEAR));
	const steps = 60;
	const days = Number.isFinite(lo) && hi > lo ? Array.from({ length: steps + 1 }, (_, i) => lo + ((hi - lo) * i) / steps) : [];
	const aliveAt = (p: Entity, d: number) => !!p.start && p.start.start <= d && (p.end ? p.end.end > d : d - p.start.start < 80 * YEAR);
	const alive = days.map((d) => ({ d, n: dated.filter((p) => aliveAt(p, d)).length }));

	// Groups by recorded members alive at each step (the six biggest).
	const sizes = cultures.map((c) => ({ c, members: idx.members(c.key).map((m) => ({ p: idx.get(m.key), link: m.link })).filter((m): m is { p: Entity; link: typeof m.link } => m.p?.type === "person") }));
	const balance = sizes
		.filter((s) => s.members.length >= 2)
		.sort((a, b) => b.members.length - a.members.length)
		.slice(0, 6)
		.map((s) => ({ key: s.c.key, name: s.c.name, color: cultureColor(plugin, s.c.key), values: days.map((d) => s.members.filter((m) => aliveAt(m.p, d) && activeAt(m.link, d) && plugin.index.existsAt(s.c, d)).length) }));

	// Average lifespan per group (only people with both dates).
	const lifespans = sizes
		.map((s) => {
			const ages = s.members.filter((m) => m.p.start && m.p.end).map((m) => (m.p.end!.start - m.p.start!.start) / YEAR);
			return { key: s.c.key, name: s.c.name, value: ages.length ? ages.reduce((a, b) => a + b, 0) / ages.length : 0, n: ages.length };
		})
		.filter((x) => x.n >= 2)
		.sort((a, b) => b.value - a.value)
		.slice(0, 8);
	const everyone = dated.filter((p) => p.end).map((p) => (p.end!.start - p.start!.start) / YEAR);
	const avgLife = everyone.length ? everyone.reduce((a, b) => a + b, 0) / everyone.length : undefined;

	const nameCounts = new Map<string, number>();
	for (const n of givenNames(people.map((p) => p.name))) nameCounts.set(n, (nameCounts.get(n) ?? 0) + 1);
	const names = [...nameCounts.entries()].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 8).map(([name, value]) => ({ name, value }));

	const families = people
		.map((p) => ({ key: p.key, name: p.name, value: idx.children(p.key, false).length }))
		.filter((x) => x.value >= 2)
		.sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
		.slice(0, 8);

	return { people: people.length, cal, alive, balance, lifespans, avgLife, names, families };
}

const fmtYear = (plugin: ChroniclePlugin, d: number, calId: string) => {
	const cal = plugin.calendars.get(calId);
	return cal.formatYear(cal.fromDays(d).y);
};

/** A small multi-series line chart over time with a crosshair tooltip. One y-axis, starting at zero. */
function lineChart(plugin: ChroniclePlugin, parent: HTMLElement, calId: string, series: { name: string; color: string; values: number[] }[], days: number[], unit: string) {
	const W = 560;
	const H = 180;
	const L = 34;
	const B = 22;
	const T = 8;
	const max = Math.max(1, ...series.flatMap((s) => s.values));
	const nice = Math.ceil(max / 5) * 5 || 5;
	const x = (i: number) => L + ((W - L - 8) * i) / Math.max(1, days.length - 1);
	const y = (v: number) => T + (H - T - B) * (1 - v / nice);
	const wrap = el("div", { cls: "chronicle-stat-chart" }, parent);
	const s = svg("svg", { viewBox: `0 0 ${W} ${H}`, class: "chronicle-stat-svg", role: "img" }, wrap);
	for (let k = 0; k <= 4; k++) {
		const v = (nice * k) / 4;
		svg("line", { x1: L, x2: W - 8, y1: y(v), y2: y(v), class: "chronicle-stat-grid" }, s);
		const t = svg("text", { x: L - 6, y: y(v) + 4, "text-anchor": "end", class: "chronicle-stat-tick" }, s);
		t.textContent = String(Math.round(v));
	}
	for (const i of [0, Math.floor((days.length - 1) / 2), days.length - 1]) {
		const t = svg("text", { x: x(i), y: H - 6, "text-anchor": i === 0 ? "start" : i === days.length - 1 ? "end" : "middle", class: "chronicle-stat-tick" }, s);
		t.textContent = fmtYear(plugin, days[i], calId);
	}
	for (const sr of series) {
		const d = sr.values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
		const path = svg("path", { d, class: "chronicle-stat-line" }, s);
		path.setAttribute("style", `--series: ${sr.color}`);
	}
	// Crosshair and tooltip.
	const cross = svg("line", { y1: T, y2: H - B, class: "chronicle-stat-cross" }, s);
	const tip = el("div", { cls: "chronicle-stat-tip" }, wrap);
	const hit = svg("rect", { x: L, y: T, width: W - L - 8, height: H - T - B, class: "chronicle-stat-hit" }, s);
	hit.addEventListener("mousemove", (evt) => {
		const r = s.getBoundingClientRect();
		const px = ((evt.clientX - r.left) / r.width) * W;
		const i = Math.max(0, Math.min(days.length - 1, Math.round(((px - L) / (W - L - 8)) * (days.length - 1))));
		cross.setAttribute("x1", String(x(i)));
		cross.setAttribute("x2", String(x(i)));
		wrap.addClass("is-hover");
		tip.empty();
		el("div", { cls: "chronicle-stat-tip-title", text: fmtYear(plugin, days[i], calId) }, tip);
		for (const sr of [...series].sort((a, b) => b.values[i] - a.values[i])) {
			const row = el("div", { cls: "chronicle-stat-tip-row" }, tip);
			const sw = el("span", { cls: "chronicle-stat-swatch" }, row);
			sw.style.background = sr.color;
			el("span", { text: sr.name }, row);
			el("strong", { text: `${sr.values[i]} ${unit}` }, row);
		}
		tip.style.left = `${Math.min(r.width - 170, Math.max(0, (x(i) / W) * r.width + 12))}px`;
	});
	hit.addEventListener("mouseleave", () => wrap.removeClass("is-hover"));
	if (series.length > 1) {
		const legend = el("div", { cls: "chronicle-stat-legend" }, wrap);
		for (const sr of series) {
			const item = el("span", { cls: "chronicle-stat-legend-item" }, legend);
			const sw = el("span", { cls: "chronicle-stat-swatch" }, item);
			sw.style.background = sr.color;
			el("span", { text: sr.name }, item);
		}
	}
}

/** Horizontal bars, one hue, labelled with their values (a magnitude, not an identity). */
function barList(plugin: ChroniclePlugin, parent: HTMLElement, rows: { name: string; value: number; key?: string }[], fmt: (v: number) => string, hoverParent: { hoverPopover: unknown } | HTMLElement) {
	const max = Math.max(1, ...rows.map((r) => r.value));
	const list = el("div", { cls: "chronicle-stat-bars" }, parent);
	for (const r of rows) {
		const row = el("div", { cls: "chronicle-stat-bar-row" }, list);
		const name = el(r.key ? "a" : "span", { cls: "chronicle-stat-bar-name" + (r.key ? " internal-link" : ""), text: r.name }, row);
		if (r.key) {
			const key = r.key;
			name.addEventListener("click", (evt) => openEntity(plugin, key, evt as MouseEvent));
			bindHover(plugin, name, key, hoverParent);
		}
		const track = el("div", { cls: "chronicle-stat-bar-track" }, row);
		const bar = el("div", { cls: "chronicle-stat-bar" }, track);
		bar.style.width = `${(r.value / max) * 100}%`;
		bar.title = `${r.name}: ${fmt(r.value)}`;
		el("span", { cls: "chronicle-stat-bar-value", text: fmt(r.value) }, row);
	}
}

/** The statistics panel: people alive over time, the balance of groups, lifespans, names, families. */
export function renderWorldStats(plugin: ChroniclePlugin, host: HTMLElement, scope?: string, hoverParent: { hoverPopover: unknown } | HTMLElement = host) {
	host.empty();
	const st = worldStats(plugin, scope);
	if (!st.alive.length) {
		emptyState(host, "bar-chart-3", "Not enough dates yet", "Statistics need people with birth dates.");
		return;
	}
	const grid = el("div", { cls: "chronicle-stats-grid" }, host);
	const panel = (title: string, sub?: string) => {
		const p = el("section", { cls: "chronicle-stat-panel" }, grid);
		el("h4", { cls: "chronicle-stat-title", text: title }, p);
		if (sub) el("div", { cls: "chronicle-stat-sub", text: sub }, p);
		return p;
	};
	const days = st.alive.map((a) => a.d);
	const peak = st.alive.reduce((m, a) => (a.n > m.n ? a : m), st.alive[0]);
	lineChart(plugin, panel("People alive", `${st.people} people recorded · most at once: ${peak.n}, around ${fmtYear(plugin, peak.d, st.cal.id)}`), st.cal.id, [{ name: "People alive", color: "var(--interactive-accent)", values: st.alive.map((a) => a.n) }], days, "people");
	if (st.balance.length >= 2) lineChart(plugin, panel("Balance of groups", "Recorded members alive and belonging at each date"), st.cal.id, st.balance, days, "members");
	if (st.lifespans.length) barList(plugin, panel("Lifespan by group", st.avgLife ? `Everyone: ${Math.round(st.avgLife)} years on average` : undefined), st.lifespans, (v) => `${Math.round(v)} yrs`, hoverParent);
	if (st.names.length) barList(plugin, panel("Most common names"), st.names, (v) => `${v}`, hoverParent);
	if (st.families.length) barList(plugin, panel("Most children"), st.families, (v) => `${v}`, hoverParent);
}
