/**
 * Relationships worked out from what the vault already says: who died while their partner lived on, who held a title
 * after whom, who answers to whom through the realms, who fought on which side, who shares parents, who holds the same
 * role, who is left without parents, who leads a group. Each tie is marked `via: "deduced"`, says what it was worked out
 * from (`why`), and says when it is only a good guess (`maybe`). Both notes get it (one side as the inverse). Anything
 * written in a note about the same two notes wins: they get no deduced tie. No Obsidian here, so it's testable.
 */

import type { ChronDate, Entity, Ref, TimedRef } from "../types";
import type { RealmTree } from "./realms";
import { relInverse } from "./relkinds";
import { SOLE_ROLE } from "./validate";

/** What the rules need from the index (EntityIndex has all of it). */
export interface DeduceIndex {
	all(type?: Entity["type"]): Entity[];
	get(key: string | undefined): Entity | undefined;
	existsAt(e: Entity, day: number): boolean;
	relationsOf: Map<string, TimedRef[]>;
	partnersOf: Map<string, TimedRef[]>;
	membersOf: Map<string, { key: string; link: TimedRef }[]>;
}

export interface DeduceOptions {
	isHouse: (e: Entity) => boolean;
	/** The realm tree (titles, their holders and what they answer to). */
	tree: () => RealmTree;
}

const YEAR = 365.25;
/** Roles that say nothing about work (everyone in a group has one). */
const IDLE_ROLE = /^(member|members|citizen|citizens|subject|subjects|resident|residents|inhabitant|inhabitants|follower|followers|worshipper|villager|peasant|commoner|born|native|ally|allies)$/i;

const active = (l: TimedRef, day: number) => !(l.from && l.from.start > day) && !(l.to && l.to.end < day);
const names = (list: Entity[]) => (list.length > 2 ? `${list[0].name}, ${list[1].name} and others` : list.map((e) => e.name).join(" and "));

/** How a deduced tie is described: what it was worked out from, and "probably" when it is a guess. */
export function whyNote(r: Pick<TimedRef, "why" | "maybe">): string | undefined {
	return r.why ? `${r.maybe ? "probably " : ""}worked out from ${r.why}` : undefined;
}

export function deduceTies(idx: DeduceIndex, opts: DeduceOptions) {
	const ref = (e: Entity): Ref => ({ key: e.key, name: e.name, resolved: true, inferred: true });
	const written = (key: string) => (idx.relationsOf.get(key) ?? []).filter((r) => r.via !== "succession" && r.via !== "deduced");
	const stated = (a: string, b: string) => written(a).some((r) => r.ref.key === b) || written(b).some((r) => r.ref.key === a);
	const put = (key: string, link: TimedRef) => {
		const list = idx.relationsOf.get(key) ?? [];
		if (!list.some((l) => l.ref.key === link.ref.key && l.kind === link.kind)) list.push(link);
		idx.relationsOf.set(key, list);
	};
	/** `a`'s `kind` is `b`; `b` sees the inverse. Nothing is added if a note already says how they are related. */
	const add = (a: Entity, b: Entity, kind: string, why: string, extra: Partial<TimedRef> = {}) => {
		if (a.key === b.key || stated(a.key, b.key)) return;
		put(a.key, { ref: ref(b), kind, via: "deduced", why, ...extra });
		put(b.key, { ref: ref(a), kind: relInverse(kind) ?? kind, via: "deduced", why, ...extra });
	};
	const persons = idx.all("person");
	const alive = (p: Entity, day: number) => idx.existsAt(p, day);
	/** Someone with a birth date that makes it plausible they were still alive on `day` (no death date does not mean alive). */
	const plausiblyAlive = (p: Entity, day: number) => !!p.start && p.start.start <= day && day - p.start.start < 110 * YEAR;

	// 1. Widowed: a partner died while the other, born within a lifetime of that day, has no death date and no later end.
	for (const [key, list] of idx.partnersOf) {
		const me = idx.get(key);
		if (me?.type !== "person") continue;
		idx.partnersOf.set(key, list.map((p) => {
			if (p.to || p.reason || /^(ex|widowed)$/i.test(p.kind ?? "")) return p;
			const other = idx.get(p.ref.key);
			if (!other || other.type !== "person") return p;
			const gone = me.end && !other.end ? me : other.end && !me.end ? other : undefined;
			const left = gone === me ? other : me;
			const when = gone?.end;
			if (!gone || !when || (p.from && p.from.start > when.end) || !plausiblyAlive(left, when.end)) return p;
			return { ...p, to: when, reason: "death", why: `the death of ${gone.name}` };
		}));
	}

	// 2. Succession in a title: whoever held it after whoever, from `holders:` (not co-holders whose terms overlap).
	for (const title of idx.all()) {
		const spans = (title.holders ?? []).filter((h) => h.ref.resolved);
		if (spans.length < 2) continue;
		spans.sort((a, b) => (a.from?.start ?? -Infinity) - (b.from?.start ?? -Infinity));
		for (let i = 0; i + 1 < spans.length; i++) {
			const [before, after] = [idx.get(spans[i].ref.key), idx.get(spans[i + 1].ref.key)];
			if (spans[i].to && spans[i + 1].from && spans[i + 1].from!.start < spans[i].to!.start) continue;
			if (before?.type === "person" && after?.type === "person") add(before, after, "successors", `who held ${title.name}`, { from: spans[i + 1].from, role: title.name });
		}
	}

	// 3. Liege and vassals: the holder of a title answers to the holder of the title above it (both holders alive together).
	const tree = opts.tree();
	const overlap = (a: Entity, b: Entity) => !(a.end && b.start && a.end.end < b.start.start) && !(b.end && a.start && b.end.end < a.start.start);
	for (const n of tree.nodes.values()) {
		const up = n.under ? tree.nodes.get(n.under) : undefined;
		if (!up || n.nature !== "realm" || up.nature !== "realm") continue;
		const low = n.holder?.resolved ? idx.get(n.holder.key) : undefined;
		const high = up.holder?.resolved ? idx.get(up.holder.key) : undefined;
		if (low?.type !== "person" || high?.type !== "person" || !overlap(low, high)) continue;
		const [lowTitle, highTitle] = [idx.get(n.key)?.name ?? n.key, idx.get(up.key)?.name ?? up.key];
		add(low, high, "liege", `${lowTitle} lying under ${highTitle}`, { role: highTitle });
	}

	// 4. Allies and enemies from wars and battles: the same side are allies, opposed sides enemies, for as long as it lasted.
	for (const ev of idx.all("event")) {
		if (!ev.sides || ev.sides.length < 2) continue;
		const bySide = new Map<string, Entity[]>();
		for (const s of ev.sides) {
			const party = idx.get(s.party.key);
			if (!party) continue;
			const group = bySide.get(s.side) ?? [];
			for (const e of [party, ...(party.alliance ?? []).map((r) => idx.get(r.key))]) if (e && !group.some((g) => g.key === e.key)) group.push(e);
			bySide.set(s.side, group);
		}
		const sides = [...bySide.values()];
		if (sides.length < 2 || sides.reduce((n, g) => n + g.length, 0) > 16) continue;
		const extra = { from: ev.start, to: ev.end, role: ev.name };
		const why = `the sides of ${ev.name}`;
		for (let i = 0; i < sides.length; i++) {
			for (let a = 0; a < sides[i].length; a++) {
				for (let b = a + 1; b < sides[i].length; b++) add(sides[i][a], sides[i][b], "allies", why, extra);
				for (let j = i + 1; j < sides.length; j++) for (const other of sides[j]) add(sides[i][a], other, "enemies", why, extra);
			}
		}
	}

	// 5. Siblings, half-siblings and step-siblings, from shared parents (and a parent's partner's children).
	const kids = new Map<string, Entity[]>();
	for (const p of persons) for (const r of p.parents) kids.set(r.key, [...(kids.get(r.key) ?? []), p]);
	const paired = new Set<string>();
	const pairKey = (a: Entity, b: Entity) => (a.key < b.key ? `${a.key}|${b.key}` : `${b.key}|${a.key}`);
	for (const group of kids.values()) {
		if (group.length < 2 || group.length > 20) continue;
		for (let i = 0; i < group.length; i++) {
			for (let j = i + 1; j < group.length; j++) {
				const [a, b] = [group[i], group[j]];
				if (paired.has(pairKey(a, b))) continue;
				paired.add(pairKey(a, b));
				const pa = a.parents.map((r) => r.key);
				const pb = b.parents.map((r) => r.key);
				const shared = pa.filter((k) => pb.includes(k));
				const sharedNames = names(shared.map((k) => idx.get(k)).filter((x): x is Entity => !!x));
				const half = pa.length >= 2 && pb.length >= 2 && shared.length === 1;
				// With only one parent known on either side, they are taken as full siblings but flagged as a guess.
				add(a, b, half ? "half-siblings" : "siblings", `${sharedNames || "a shared parent"} being their ${shared.length > 1 ? "parents" : "parent"}`, { maybe: !half && (pa.length < 2 || pb.length < 2) && shared.length === 1 });
			}
		}
	}
	for (const x of persons) {
		for (const parent of x.parents) {
			for (const tie of idx.partnersOf.get(parent.key) ?? []) {
				// Only a partnership still going, or ended by a death, makes step-siblings.
				if ((tie.to || tie.reason) && !/death|died|widow/i.test(tie.reason ?? "")) continue;
				if (/^ex$/i.test(tie.kind ?? "") || x.parents.some((r) => r.key === tie.ref.key)) continue;
				for (const y of kids.get(tie.ref.key) ?? []) {
					if (y.key === x.key || paired.has(pairKey(x, y)) || y.parents.some((r) => x.parents.some((q) => q.key === r.key))) continue;
					paired.add(pairKey(x, y));
					add(x, y, "step-siblings", `${idx.get(parent.key)?.name ?? parent.name} and ${idx.get(tie.ref.key)?.name ?? tie.ref.name} being partners`);
				}
			}
		}
	}

	// 6. Colleagues: the same role in the same group at the same time, in a small circle where both dates are known.
	for (const group of idx.all("culture")) {
		if (opts.isHouse(group)) continue;
		const byRole = new Map<string, { p: Entity; link: TimedRef }[]>();
		for (const m of idx.membersOf.get(group.key) ?? []) {
			const p = idx.get(m.key);
			const role = (m.link.role ?? "").trim().toLowerCase();
			if (p?.type !== "person" || !role || IDLE_ROLE.test(role)) continue;
			byRole.set(role, [...(byRole.get(role) ?? []), { p, link: m.link }]);
		}
		for (const [role, list] of byRole) {
			if (list.length < 2 || list.length > 6) continue;
			for (let i = 0; i < list.length; i++) {
				for (let j = i + 1; j < list.length; j++) {
					const [a, b] = [list[i], list[j]];
					if (!a.link.from || !b.link.from) continue;
					const from = Math.max(a.link.from.start, b.link.from.start);
					const to = Math.min(a.link.to?.end ?? Infinity, b.link.to?.end ?? Infinity);
					if (from > to) continue;
					const later = a.link.from.start >= b.link.from.start ? a.link : b.link;
					const sooner = (a.link.to?.end ?? Infinity) <= (b.link.to?.end ?? Infinity) ? a.link : b.link;
					const date = (link: TimedRef, key: "from" | "to"): ChronDate | undefined => link[key];
					add(a.p, b.p, "colleagues", `both being ${role} in ${group.name} at the same time`, { from: date(later, "from"), to: date(sooner, "to"), role: `${role} · ${group.name}`, maybe: true });
				}
			}
		}
	}

	// 8. Guardians and wards: a child whose two known parents had both died before they were sixteen is probably looked after
	// by the eldest grandparent, uncle or aunt who was alive and grown then, until that relative died or the child grew up.
	for (const kid of persons) {
		if (!kid.start || kid.parents.length < 2 || (kid.parentKinds && Object.values(kid.parentKinds).includes("guardian"))) continue;
		if (written(kid.key).some((r) => r.kind === "guardians" || r.kind === "wards")) continue;
		const parents = kid.parents.map((r) => idx.get(r.key));
		if (parents.some((p) => !p?.end)) continue;
		const lastDeath = Math.max(...parents.map((p) => p!.end!.end));
		const grown = kid.start.start + 16 * YEAR;
		if (lastDeath >= grown) continue;
		const adultAt = (p: Entity | undefined) => !!p && p.type === "person" && !!p.start && p.start.start <= lastDeath - 18 * YEAR && alive(p, lastDeath);
		const grandparents = parents.flatMap((p) => p!.parents.map((r) => idx.get(r.key))).filter(adultAt) as Entity[];
		const siblingsOfParents = parents.flatMap((p) => p!.parents.flatMap((r) => (kids.get(r.key) ?? []).filter((s) => !parents.some((q) => q?.key === s.key)))).filter(adultAt);
		const pick = (list: Entity[]) => [...list].sort((a, b) => a.start!.start - b.start!.start)[0];
		const guardian = pick(grandparents) ?? pick(siblingsOfParents);
		if (!guardian) continue;
		const stop = Math.min(grown, guardian.end?.end ?? grown);
		const stamp = (n: number): ChronDate => ({ start: n, end: n, precision: "day", approx: false, calendar: kid.calendar, raw: "" });
		add(kid, guardian, "guardians", `${names(parents as Entity[])} having died before ${kid.name} was sixteen`, { from: stamp(lastDeath), to: stamp(stop), maybe: true });
	}

	// 9. Employer and employees: the head of an organisation and the people with a role in it, on the group's latest day.
	for (const group of idx.all("culture")) {
		if (opts.isHouse(group) || tree.nodes.has(group.key)) continue;
		const members = idx.membersOf.get(group.key) ?? [];
		const day = Math.max(...members.map((m) => m.link.from?.start ?? -Infinity), group.start?.start ?? -Infinity);
		if (!Number.isFinite(day)) continue;
		let head: Entity | undefined;
		let headRole = "";
		let since = -Infinity;
		for (const m of members) {
			const p = idx.get(m.key);
			if (p?.type !== "person" || !SOLE_ROLE.test((m.link.role ?? "").trim()) || !active(m.link, day) || !alive(p, day)) continue;
			const from = m.link.from?.start ?? -Infinity;
			if (!head || from > since) {
				head = p;
				headRole = (m.link.role ?? "").trim();
				since = from;
			}
		}
		if (!head) continue;
		let n = 0;
		for (const m of members) {
			const p = idx.get(m.key);
			const role = (m.link.role ?? "").trim();
			if (p?.type !== "person" || p.key === head.key || !role || IDLE_ROLE.test(role) || !active(m.link, day) || !alive(p, day)) continue;
			if (++n > 40) break;
			add(p, head, "employer", `${head.name} being ${headRole} of ${group.name} and ${p.name} being ${role} in it`, { from: m.link.from, to: m.link.to, role: `${role} · ${group.name}`, maybe: true });
		}
	}
}
