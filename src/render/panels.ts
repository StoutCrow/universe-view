import type ChroniclePlugin from "../main";
import type { Entity, EntityType } from "../types";
import { formatDate, formatSpan } from "../dates/parser";
import { rangeOf } from "../index/EntityIndex";
import { TYPE_LABELS, bindHover, el, entityColor, icon, openEntity, showEntityMenu } from "./common";
import { lifeText } from "./family";
import { battlesByWar, isBattle, namedAsWar, victorOf } from "../index/wars";

export type ListKind = "events" | "people" | "places" | "cultures" | "recent" | "wars";

export const LIST_INFO: Record<ListKind, { title: string; icon: string }> = {
	events: { title: "Key events", icon: "calendar-clock" },
	people: { title: "People", icon: "users" },
	places: { title: "Places", icon: "map-pin" },
	cultures: { title: "Houses, nations & groups", icon: "flag" },
	recent: { title: "Recently edited", icon: "history" },
	wars: { title: "Wars", icon: "swords" },
};

const PLURAL: Record<EntityType, string> = { person: "people", event: "events", culture: "cultures", place: "places", map: "maps" };

export function inScope(e: Entity, scope?: string): boolean {
	return !scope || e.path.startsWith(scope + "/");
}

/** How tied-in a person is: parents, children and partners. */
export function kinCount(plugin: ChroniclePlugin, e: Entity): number {
	const idx = plugin.index;
	return e.parents.length + idx.children(e.key).length + idx.partners(e.key).length;
}

/** The most notable notes of one kind, with a short detail line each. */
export function listRows(plugin: ChroniclePlugin, kind: ListKind, scope: string | undefined, limit = 8): { rows: Entity[]; detail: (e: Entity) => string } {
	const idx = plugin.index;
	const all = idx.all().filter((e) => inScope(e, scope));
	const of = (t: EntityType) => all.filter((e) => e.type === t);
	const date = (e: Entity) => formatSpan(e.start, e.end, plugin.calendars.get(e.calendar));
	const byStart = (a: Entity, b: Entity) => (a.start?.start ?? Infinity) - (b.start?.start ?? Infinity);
	switch (kind) {
		case "events": {
			const events = of("event").filter((e) => e.start);
			const rows = [...events].sort((a, b) => b.importance - a.importance || byStart(a, b)).slice(0, limit).sort(byStart);
			return { rows, detail: date };
		}
		case "cultures": {
			const rows = of("culture").sort((a, b) => idx.members(b.key).length - idx.members(a.key).length || a.name.localeCompare(b.name)).slice(0, limit);
			return {
				rows,
				detail: (e) => {
					const n = idx.members(e.key).length;
					const d = e.start ? `from ${formatDate(e.start, plugin.calendars.get(e.calendar))}` : "";
					return [n ? `${n} member${n === 1 ? "" : "s"}` : "", d].filter(Boolean).join(" · ");
				},
			};
		}
		case "people": {
			const rows = of("person").sort((a, b) => kinCount(plugin, b) - kinCount(plugin, a) || byStart(a, b)).slice(0, limit);
			return { rows, detail: (e) => lifeText(plugin, e) };
		}
		case "places": {
			const rows = of("place").sort((a, b) => idx.events(b.key).length - idx.events(a.key).length || a.name.localeCompare(b.name)).slice(0, limit);
			return {
				rows,
				detail: (e) => {
					const n = idx.events(e.key).filter((x) => x.type === "event").length;
					return [e.locatedIn?.name, n ? `${n} event${n === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ");
				},
			};
		}
		case "wars": {
			// Wars in the order they began, each with its battles and who came out on top.
			const byWar = battlesByWar(idx);
			const rows = of("event").filter((e) => !isBattle(e) && (byWar.has(e.key) || namedAsWar(e))).sort(byStart).slice(0, limit);
			return {
				rows,
				detail: (e) => {
					const n = byWar.get(e.key)?.length ?? 0;
					const won = victorOf(idx, e);
					return [e.start ? date(e) : "", n ? `${n} battle${n === 1 ? "" : "s"}` : "", won ? `won by ${won.name}` : ""].filter(Boolean).join(" · ");
				},
			};
		}
		case "recent": {
			const rows = [...all].sort((a, b) => b.file.stat.mtime - a.file.stat.mtime).slice(0, limit);
			return { rows, detail: (e) => `${TYPE_LABELS[e.type].toLowerCase()} · ${timeAgo(e.file.stat.mtime)}` };
		}
	}
}

/** A list of notes; each row opens the note, shows a hover card and has the usual context menu. */
export function renderList(plugin: ChroniclePlugin, parent: HTMLElement, rows: Entity[], detail: (e: Entity) => string, hoverParent: { hoverPopover: unknown } | HTMLElement) {
	if (!rows.length) {
		el("div", { cls: "chronicle-ov-none", text: "Nothing yet." }, parent);
		return;
	}
	const list = el("ul", { cls: "chronicle-ov-list" }, parent);
	rows.forEach((e, i) => {
		const li = el("li", {}, list);
		li.dataset.key = e.key;
		li.style.setProperty("--i", String(i));
		const dot = el("span", { cls: "chronicle-ov-dot" }, li);
		dot.style.setProperty("--dot-color", entityColor(plugin, e));
		const name = el("a", { cls: "chronicle-ov-name", text: e.name }, li);
		el("span", { cls: "chronicle-ov-detail", text: detail(e) }, li);
		name.addEventListener("click", (evt) => openEntity(plugin, e.key, evt));
		li.addEventListener("contextmenu", (evt) => {
			evt.preventDefault();
			showEntityMenu(plugin, e.key, evt);
		});
		bindHover(plugin, name, e.key, hoverParent);
	});
}

/** Headline numbers for a world: counts per type and the span of time covered. */
export function renderStats(plugin: ChroniclePlugin, parent: HTMLElement, scope: string | undefined) {
	const idx = plugin.index;
	const all = idx.all().filter((e) => inScope(e, scope));
	const cal = plugin.calendars.get(idx.dominantCalendar(scope || undefined));
	const grid = el("div", { cls: "chronicle-stats" }, parent);
	const stat = (iconName: string, value: string, label: string, i: number) => {
		const box = el("div", { cls: "chronicle-stat" }, grid);
		box.style.setProperty("--i", String(i));
		const ic = el("span", { cls: "chronicle-stat-icon" }, box);
		icon(ic, iconName);
		el("div", { cls: "chronicle-stat-value", text: value }, box);
		el("div", { cls: "chronicle-stat-label", text: label }, box);
	};
	const types: [EntityType, string][] = [["person", "users"], ["event", "calendar-clock"], ["culture", "flag"], ["place", "map-pin"]];
	types.forEach(([t, ic], i) => stat(ic, String(all.filter((e) => e.type === t).length), PLURAL[t], i));
	let min = Infinity;
	let max = -Infinity;
	for (const e of all) {
		const r = rangeOf(e);
		if (r) [min, max] = [Math.min(min, r[0]), Math.max(max, r[1])];
	}
	if (Number.isFinite(min)) {
		const years = cal.fromDays(max).y - cal.fromDays(min).y;
		stat("hourglass", years.toLocaleString(), `years, ${cal.formatYear(cal.fromDays(min).y)} – ${cal.formatYear(cal.fromDays(max).y)}`, 4);
	}
}

export function timeAgo(ms: number): string {
	const s = (Date.now() - ms) / 1000;
	if (s < 60) return "just now";
	if (s < 3600) return `${Math.floor(s / 60)} min ago`;
	if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
	const d = Math.floor(s / 86400);
	return d < 30 ? `${d} day${d === 1 ? "" : "s"} ago` : new Date(ms).toLocaleDateString();
}
