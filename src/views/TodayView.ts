import type { ViewStateResult } from "obsidian";
import type { Entity } from "../types";
import { formatDay, formatSpan } from "../dates/parser";
import { tierLabel } from "../index/realms";
import { relLabel, relOne } from "../index/relkinds";
import { nameAt } from "../index/renames";
import { TYPE_ICONS, el, emptyState, entityColor, icon, openEntity } from "../render/common";
import { UniverseViewBase } from "./base";

export const VIEW_TODAY = "chronicle-today";

const YEAR = 365.25;
const WAR = /\b(war|wars|battle|siege|rebellion|revolt|uprising|invasion|crusade|conflict|campaign|feud|raid|skirmish)\b/i;

/**
 * Today in the world: the world's current date, who rules what, wars still going, what happened
 * lately and what's coming, and the anniversaries falling around now. Set "today" in the calendar
 * (or a world note) and it follows.
 */
export class TodayView extends UniverseViewBase {
	private world?: string;
	private page?: HTMLElement;

	getViewType() {
		return VIEW_TODAY;
	}
	getDisplayText() {
		return this.world ? `Today in ${this.world}` : "Today in the world";
	}
	getIcon() {
		return "sunrise";
	}
	getState(): Record<string, unknown> {
		return { scope: this.world };
	}
	async setState(state: unknown, result: ViewStateResult) {
		const s = state as { scope?: string } | undefined;
		if (s && "scope" in s) {
			this.world = s.scope;
			if (this.isBuilt) {
				this.fillToolbar();
				this.render();
			}
		}
		await super.setState(state, result);
	}

	protected build() {
		this.world ??= this.defaultScope();
		this.fillToolbar();
		this.page = el("div", { cls: "uv-today" }, this.body);
		this.render();
	}

	private fillToolbar() {
		this.rebuildToolbar(() => {
			const left = this.group();
			this.scopePicker(left, this.world, (v) => {
				this.world = v;
				(this.leaf as unknown as { updateHeader?: () => void }).updateHeader?.();
				this.app.workspace.requestSaveLayout();
				this.render();
			});
		});
	}

	protected onIndexChanged() {
		this.render();
	}

	private render() {
		const page = this.page;
		if (!page) return;
		const top = page.scrollTop;
		page.empty();
		const p = this.plugin;
		const idx = p.index;
		const scope = this.world ?? "";
		const inScope = (e: Entity) => !scope || e.path.startsWith(scope + "/");
		const cal = p.calendars.get(idx.dominantCalendar(scope || undefined));
		const today = p.todayFor(scope, cal.id);
		if (today === undefined) {
			emptyState(page, "sunrise", "No “today” set for this world", "Pick a day in the Calendar view and choose “Make this today” (or set `today:` in a world note), and this page shows who rules, what's going on and what's coming then.", { label: "Open the calendar", onClick: () => void p.activateView("chronicle-calendar", { options: { folder: scope } }) });
			return;
		}
		const d = cal.fromDays(today);
		const hero = el("div", { cls: "uv-today-hero" }, page);
		el("div", { cls: "universeview-ov-eyebrow", text: scope || this.app.vault.getName() }, hero);
		const w = cal.weekdayOf(today);
		el("h1", { cls: "uv-today-date", text: `${w >= 0 ? cal.weekdays[w] + ", " : ""}${formatDay(today, cal)}` }, hero);
		el("div", { cls: "universeview-ov-sub", text: "Who rules, what's going on, and what's coming. Change today in the Calendar view." }, hero);

		const grid = el("div", { cls: "uv-today-grid" }, page);
		const card = (title: string, ic: string, wide = false) => {
			const c = el("section", { cls: "uv-today-card" + (wide ? " is-wide" : "") }, grid);
			const h = el("div", { cls: "uv-today-card-head" }, c);
			icon(el("span", {}, h), ic);
			el("span", { text: title }, h);
			return c;
		};
		const row = (parent: HTMLElement, e: Entity, sub: string, label = e.name) => {
			const r = el("div", { cls: "uv-today-row", attr: { role: "button", tabindex: "0" } }, parent);
			r.style.setProperty("--row-color", entityColor(p, e));
			icon(el("span", { cls: "uv-today-row-icon" }, r), TYPE_ICONS[e.type]);
			el("span", { cls: "uv-today-row-name", text: label }, r);
			if (sub) el("span", { cls: "uv-today-row-sub", text: sub }, r);
			r.addEventListener("click", (evt) => openEntity(p, e.key, evt));
			p.hoverCards?.attach(r, e.key);
		};
		const empty = (parent: HTMLElement, text: string) => el("div", { cls: "universeview-dash-muted", text }, parent);

		// Who rules: the realms standing today, with their holders, greatest first.
		const tree = p.realms(today);
		const rulers = card("Who rules", "crown", true);
		const standing = tree.roots
			.map((k) => idx.get(k))
			// Realms and titles only: a ruled group, or a land with a tier or a holder (not a lone abbey or peak).
			.filter((e): e is Entity => !!e && inScope(e) && tree.nodes.get(e.key)?.nature !== "region" && idx.existsAt(e, today) && (e.type === "culture" || tree.nodes.get(e.key)!.rank < 9 || !!tree.nodes.get(e.key)!.holder))
			.sort((a, b) => (tree.nodes.get(a.key)!.rank - tree.nodes.get(b.key)!.rank) || a.name.localeCompare(b.name));
		for (const e of standing.slice(0, 24)) {
			const n = tree.nodes.get(e.key)!;
			const vassals = n.children.length;
			row(rulers, e, [tierLabel(n), n.holder ? `${n.holder.name}${n.house ? ` of ${n.house.name.replace(/^House\s+/i, "House ")}` : ""}` : "no holder", vassals ? `${vassals} ${vassals === 1 ? relOne("vassals") : relLabel("vassals").toLowerCase()}` : ""].filter(Boolean).join(" · "), nameAt(e, today));
		}
		if (!standing.length) empty(rulers, "No realms standing on this day.");

		// Going on: wars and other events spanning today.
		const events = idx.all("event").filter((e) => e.start && inScope(e));
		const ongoing = events.filter((e) => e.start!.start <= today && (e.end ? e.end.end >= today : e.openEnd));
		const wars = card("Wars and conflicts going on", "swords");
		const warList = ongoing.filter((e) => WAR.test(`${e.name} ${e.category ?? ""} ${e.tags.join(" ")}`));
		for (const e of warList) row(wars, e, `since ${formatSpan(e.start, undefined, cal)}`);
		if (!warList.length) empty(wars, "No wars going on. Peace, for now.");
		const other = ongoing.filter((e) => !warList.includes(e));
		if (other.length) {
			const going = card("Also going on", "loader");
			for (const e of other.slice(0, 12)) row(going, e, `since ${formatSpan(e.start, undefined, cal)}${e.end ? `, until ${formatSpan(e.end, undefined, cal)}` : ""}`);
		}

		// Lately, and coming up.
		const recent = card("Lately", "history");
		const past = events.filter((e) => e.start!.start <= today && e.start!.start > today - 10 * YEAR && !ongoing.includes(e)).sort((a, b) => b.start!.start - a.start!.start).slice(0, 10);
		for (const e of past) row(recent, e, `${formatSpan(e.start, e.end, cal)} · ${agoText(today - e.start!.start)}`);
		if (!past.length) empty(recent, "Nothing in the last ten years.");
		const coming = card("Coming up", "calendar-clock");
		const next = events.filter((e) => e.start!.start > today).sort((a, b) => a.start!.start - b.start!.start).slice(0, 8);
		for (const e of next) row(coming, e, `${formatSpan(e.start, e.end, cal)} · in ${agoText(e.start!.start - today, true)}`);
		if (!next.length) empty(coming, "Nothing planned after today.");

		// Anniversaries within a fortnight either side: founding days, battles, births and deaths.
		const anniv = card("Anniversaries around now", "party-popper");
		const near: { e: Entity; what: string; years: number; off: number }[] = [];
		const check = (e: Entity, day: number | undefined, what: string) => {
			if (day === undefined || day >= today) return;
			const a = cal.fromDays(day);
			if (a.m === undefined || a.d === undefined) return;
			const same = cal.toDays(d.y, a.m, Math.min(a.d, cal.monthDays(d.y, a.m)));
			const off = same - today;
			if (Math.abs(off) <= 14 && d.y > a.y) near.push({ e, what, years: d.y - a.y, off });
		};
		for (const e of idx.all()) {
			if (!inScope(e)) continue;
			if (e.start?.precision !== "day" && e.end?.precision !== "day") continue;
			if (e.type === "person") {
				if (e.start?.precision === "day" && (!e.end || e.end.start > today)) check(e, e.start.start, "born");
				if (e.end?.precision === "day") check(e, e.end.start, "died");
			} else if (e.start?.precision === "day") check(e, e.start.start, e.type === "event" ? "" : "founded");
		}
		near.sort((a, b) => Math.abs(a.off) - Math.abs(b.off));
		for (const x of near.slice(0, 12)) {
			const when = x.off === 0 ? "today" : x.off > 0 ? `in ${x.off} day${x.off === 1 ? "" : "s"}` : `${-x.off} day${x.off === -1 ? "" : "s"} ago`;
			row(anniv, x.e, `${x.what ? x.what + " " : ""}${x.years} year${x.years === 1 ? "" : "s"} ago · ${when}`);
		}
		if (!near.length) empty(anniv, "No anniversaries within two weeks (only things dated to the day count).");
		page.scrollTop = top;
	}
}

/** "3 years", "5 months", "12 days". */
function agoText(days: number, future = false): string {
	const ago = future ? "" : " ago";
	if (days >= YEAR) {
		const y = Math.round(days / YEAR);
		return `${y} year${y === 1 ? "" : "s"}${ago}`;
	}
	if (days >= 30) {
		const m = Math.round(days / 30.44);
		return `${m} month${m === 1 ? "" : "s"}${ago}`;
	}
	const n = Math.max(0, Math.round(days));
	return n === 0 ? (future ? "today" : "today") : `${n} day${n === 1 ? "" : "s"}${ago}`;
}
