import type { EntityIndex } from "./EntityIndex";
import type { Entity, Scene } from "../types";
import { clashes } from "./whereabouts";
import { chainLoop, orderProblem } from "./placepath";
import { aliasCandidate } from "./aliases";
import { days, haversineKm, kmPerUnit, parseScale, SPEED_KM } from "../render/travel";

export type Severity = "error" | "warning" | "info";

export interface Issue {
	key: string;
	name: string;
	severity: Severity;
	message: string;
	/** A fix that's clear enough to offer as one button. */
	fix?: IssueFix;
}

/** What a fix button does: make the missing notes, put a place on its map, or make its map note. */
export type IssueFix =
	| { kind: "create"; items: { name: string; type: "person" | "place" | "culture" | "event" }[] }
	| { kind: "place"; map: string }
	| { kind: "create-map"; name: string }
	/** Add `name` to the aliases of the note at `target`, so links written with it find that note. */
	| { kind: "alias"; name: string; target: string };

const YEAR = 365.25;

/** Roles normally held by one person at a time. */
export const SOLE_ROLE = /^(the )?(king|queen regnant|monarch|emperor|empress|ruler|sovereign|leader|head|chief|grand ?master|high priest(ess)?|pope|president|prime minister|chancellor|ceo|chair(man|woman|person)?|director|captain|commander|knight-commander|lord commander|abbot|abbess|archbishop|patriarch|matriarch|pharaoh|sultan|khan|shah|tsar|czar|regent|steward|governor|mayor|headmaster|headmistress|principal|warden|marshal|admiral|general)$/i;

type Push = (key: string, name: string, severity: Severity, message: string) => void;

/** Kilometres between two places, when both are on the world map or on the same image map with a real scale. */
export function placeDistanceKm(index: Pick<EntityIndex, "get">, a: Entity, b: Entity): number | undefined {
	if (a.coords && b.coords && !a.map && !b.map) return haversineKm(a.coords, b.coords);
	if (a.position && b.position && a.map && a.map.key === b.map?.key) {
		const m = index.get(a.map.key);
		const scale = parseScale(m?.props.scale, m?.props.unit ?? m?.props.units);
		const perKm = scale && kmPerUnit(scale.unit);
		if (!scale || !perKm) return undefined;
		// Both measured the same way (top or bottom origin), so the difference is what matters.
		const px = Math.hypot(a.position[0] - b.position[0], a.position[1] - b.position[1]);
		return px * scale.perPx * perKm;
	}
	return undefined;
}

/**
 * Story notes against the world: characters who appear before they're born or after they die,
 * and journeys between scenes too fast to be possible (on horseback, in a straight line).
 */
export function continuity(index: Pick<EntityIndex, "get" | "scenes">, push: Push) {
	const byPerson = new Map<string, Scene[]>();
	for (const s of index.scenes ?? []) {
		if (s.flashback) continue;
		for (const c of s.cast) {
			const p = index.get(c.key);
			if (!p || p.type !== "person") continue;
			if (p.start && p.start.start > s.date.end && !p.start.approx && !s.date.approx) push(s.path, s.name, "warning", `${p.name} appears before being born`);
			if (p.end && p.end.end < s.date.start && !p.end.approx && !s.date.approx) push(s.path, s.name, "warning", `${p.name} appears after their death`);
			const list = byPerson.get(p.key) ?? [];
			list.push(s);
			byPerson.set(p.key, list);
		}
	}
	for (const [key, scenes] of byPerson) {
		const person = index.get(key)!;
		for (let i = 1; i < scenes.length; i++) {
			const a = scenes[i - 1];
			const b = scenes[i];
			const pa = a.places[0] && index.get(a.places[0].key);
			const pb = b.places[0] && index.get(b.places[0].key);
			if (!pa || !pb || pa.key === pb.key) continue;
			const km = placeDistanceKm(index, pa, pb);
			if (km === undefined) continue;
			const needed = km / SPEED_KM.horse;
			const elapsed = Math.max(0, b.date.start - a.date.end);
			if (needed > elapsed + 0.5 && needed > 1) {
				const gap = elapsed < 1 ? "the same day" : days(elapsed).replace(/^about /, "");
				push(b.path, b.name, "warning", `${person.name} gets from ${pa.name} to ${pb.name} (${Math.round(km)} km) in ${gap}; on horseback that takes ${days(needed)}`);
			}
		}
	}
}

/**
 * A person in two places at once, or between two events further apart than a horse could ride in the time between,
 * and homes that overlap in time (`residences:`).
 */
export function whereaboutsChecks(index: Pick<EntityIndex, "get" | "entities" | "events">, push: Push) {
	for (const p of index.entities.values()) {
		if (p.type !== "person") continue;
		const events = index.events(p.key);
		for (const c of clashes(p, events, 400)) {
			const pa = index.get(c.placeA.key);
			const pb = index.get(c.placeB.key);
			if (c.gap < 0) {
				push(p.key, p.name, "warning", `${p.name} is at ${c.placeA.name} (${c.a.name}) and ${c.placeB.name} (${c.b.name}) at the same time`);
				continue;
			}
			const km = pa && pb ? placeDistanceKm(index, pa, pb) : undefined;
			if (km === undefined) continue;
			const needed = km / SPEED_KM.horse;
			if (needed > c.gap + 0.5 && needed > 1) push(p.key, p.name, "warning", `${p.name} gets from ${c.placeA.name} (${c.a.name}) to ${c.placeB.name} (${c.b.name}), ${Math.round(km)} km, in ${days(c.gap).replace(/^about /, "")}; on horseback that takes ${days(needed)}`);
		}
		const homes = p.residences.filter((r) => r.from).sort((a, b) => a.from!.start - b.from!.start);
		for (let i = 1; i < homes.length; i++) {
			const prev = homes[i - 1];
			if (prev.to && prev.ref.key !== homes[i].ref.key && homes[i].from!.start < prev.to.start - YEAR) push(p.key, p.name, "info", `${p.name} lives at ${prev.ref.name} and ${homes[i].ref.name} at the same time`);
		}
	}
}

/** Two people holding the same one-person role of a group at the same time. */
function roleClashes(index: EntityIndex, key: string, name: string, push: Push) {
	const byRole = new Map<string, { who: string; a: number; b: number }[]>();
	for (const m of index.members(key)) {
		const role = (m.link.role ?? "").trim();
		if (!role || !SOLE_ROLE.test(role)) continue;
		const p = index.get(m.key);
		if (!p || p.type !== "person" || !m.link.from) continue;
		const a = m.link.from.start;
		const b = m.link.to?.end ?? p.end?.end ?? Infinity;
		const list = byRole.get(role.toLowerCase()) ?? [];
		list.push({ who: p.name, a, b });
		byRole.set(role.toLowerCase(), list);
	}
	for (const [role, list] of byRole) {
		list.sort((x, y) => x.a - y.a);
		for (let i = 0; i < list.length; i++) {
			for (let j = i + 1; j < list.length; j++) {
				const x = list[i];
				const y = list[j];
				// A year's grace for handovers recorded to the year.
				if (y.a < x.b - YEAR && x.who !== y.who) push(key, name, "warning", `${x.who} and ${y.who} are both ${role} at the same time`);
			}
		}
	}
}

/** The last check of each index, kept until any note changes (views ask for it on every redraw). */
const checked = new WeakMap<EntityIndex, { version: number; issues: Issue[] }>();

/** Consistency checks across the whole index (impossible dates, cycles, missing links…). */
export function validate(index: EntityIndex): Issue[] {
	const version = (index as unknown as { version?: number }).version;
	const last = checked.get(index);
	if (version !== undefined && last?.version === version) return last.issues.slice();
	const issues = runChecks(index);
	if (version !== undefined) checked.set(index, { version, issues });
	return issues.slice();
}

function runChecks(index: EntityIndex): Issue[] {
	const out: Issue[] = [];
	const push = (key: string, name: string, severity: Severity, message: string, fix?: IssueFix) => out.push({ key, name, severity, message, fix });
	const byType = new Map<string, Entity[]>();
	for (const x of index.entities.values()) byType.set(x.type, [...(byType.get(x.type) ?? []), x]);

	for (const e of index.entities.values()) {
		for (const msg of e.issues) push(e.key, e.name, msg.startsWith("Could not") || msg.includes("before start") ? "error" : "warning", msg);

		// Each missing note, typed by the link it's in (a parent is a person, a place a place…).
		const typed: [{ name: string; resolved: boolean }[], "person" | "place" | "culture" | "event"][] = [
			[e.parents, "person"], [e.adoptiveParents, "person"], [e.participants, "person"], [e.partners.map((p) => p.ref), "person"],
			[e.places, "place"], [e.locatedIn ? [e.locatedIn] : [], "place"], [e.parentCultures, "culture"], [e.cultures.map((c) => c.ref), e.type === "person" || e.type === "event" ? "culture" : "culture"],
			[e.relations.map((r) => r.ref), e.type === "culture" ? "culture" : "person"],
		];
		const missing = new Map<string, "person" | "place" | "culture" | "event">();
		for (const [refs, type] of typed) for (const r of refs) if (!r.resolved && !missing.has(r.name)) missing.set(r.name, type);
		// A name that looks like another note's (USA for United States) is offered as that note's alias, not as a new note.
		for (const [name, type] of [...missing]) {
			const target = aliasCandidate(name, (byType.get(type) ?? []).filter((x) => x.key !== e.key));
			if (!target) continue;
			missing.delete(name);
			push(e.key, e.name, "info", `“${name}” has no note, but looks like ${target.name}`, { kind: "alias", name, target: target.key });
		}
		if (missing.size) {
			const names = [...missing.keys()];
			push(e.key, e.name, "info", `Links to notes that don't exist yet: ${names.slice(0, 5).join(", ")}${names.length > 5 ? "…" : ""}`, { kind: "create", items: [...missing].map(([name, type]) => ({ name, type })) });
		}

		if (e.type === "person") {
			if (e.parents.length > 2) push(e.key, e.name, "warning", `Has ${e.parents.length} biological parents (use adoptive-parents for others)`);
			for (const p of e.parents) {
				const parent = index.get(p.key);
				// A note listing itself as parent is reported once, as a loop, below.
				if (!parent || !e.start || parent.key === e.key) continue;
				if (parent.start && parent.start.start > e.start.start) push(e.key, e.name, "error", `Born before their parent ${parent.name}`);
				else if (parent.start && e.start.start - parent.start.end < 10 * YEAR && !e.start.approx && !parent.start.approx)
					push(e.key, e.name, "warning", `Parent ${parent.name} was under 10 at the birth`);
				if (parent.end && e.start.start - parent.end.end > YEAR && !parent.end.approx)
					push(e.key, e.name, "warning", `Born more than a year after ${parent.name} died`);
			}
			if (e.start && e.end && e.end.start - e.start.start > 130 * YEAR) push(e.key, e.name, "warning", "Lived longer than 130 years");
			// Ancestor cycles.
			const seen = new Set<string>();
			const stack = e.parents.map((p) => p.key);
			while (stack.length) {
				const k = stack.pop()!;
				if (k === e.key) {
					push(e.key, e.name, "error", "Is their own ancestor (a parent link loops back)");
					break;
				}
				if (seen.has(k)) continue;
				seen.add(k);
				for (const p of index.get(k)?.parents ?? []) stack.push(p.key);
			}
		}

		if (e.type === "event" && e.start) {
			for (const p of e.participants) {
				const person = index.get(p.key);
				if (person?.type !== "person") continue;
				if (person.start && e.start.end < person.start.start && !e.start.approx)
					push(e.key, e.name, "warning", `${person.name} takes part before being born`);
				if (person.end && e.start.start > person.end.end + YEAR && !e.start.approx)
					push(e.key, e.name, "info", `${person.name} is listed more than a year after their death`);
			}
		}

		if (e.type === "place") {
			const hasMap = !!e.map && !!index.get(e.map.key);
			if (e.map && hasMap && !e.position && !e.territories.some((t) => t.map === e.map!.key)) push(e.key, e.name, "info", `Not yet positioned on ${e.map.name}`, { kind: "place", map: e.map.key });
			if (e.map && !hasMap) push(e.key, e.name, "warning", `Map “${e.map.name}” doesn't exist`, { kind: "create-map", name: e.map.name });
			// Where it sits: a loop (A in B in A), or a bigger kind of place inside a smaller one (a county inside a city).
			const loop = chainLoop((k) => index.get(k), e.key);
			if (loop?.every((x) => x.key >= e.key)) push(e.key, e.name, "error", `Is inside itself: ${loop.map((x) => x.name).join(" in ")} in ${loop[0].name}`);
			const parent = e.locatedIn?.resolved ? index.get(e.locatedIn.key) : undefined;
			const wrong = parent && !loop ? orderProblem(e, parent) : undefined;
			if (wrong) push(e.key, e.name, "info", wrong);
		}

		// Memberships that start after death or before birth.
		if (e.type === "person") {
			for (const c of e.cultures) {
				const what = c.role ? `${c.role} of ${c.ref.name}` : `a member of ${c.ref.name}`;
				if (c.from && e.end && c.from.start > e.end.end + YEAR && !c.from.approx && !e.end.approx) push(e.key, e.name, "warning", `Becomes ${what} after their death`);
				if (c.from && e.start && c.from.end < e.start.start && !c.from.approx && !e.start.approx) push(e.key, e.name, "warning", `Becomes ${what} before being born`);
			}
		}
		if (e.type === "culture") roleClashes(index, e.key, e.name, push);
	}
	continuity(index, push);
	whereaboutsChecks(index, push);
	const order: Record<Severity, number> = { error: 0, warning: 1, info: 2 };
	return out.sort((a, b) => order[a.severity] - order[b.severity] || a.name.localeCompare(b.name));
}
