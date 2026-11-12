import type UniverseViewPlugin from "../main";
import type { TimedRef } from "../types";
import { ROW_ORDER, splitMembers, type GroupRow } from "../index/membership";
import { groupKind } from "../render/houses";

/**
 * A note's groups split into what each answers (realm, house, culture, faith, organisation, other), in that order,
 * leaving out the empty ones. A group's own kind decides; for a group with no note yet, the property it was written under.
 */
export function groupsByRow(plugin: UniverseViewPlugin, refs: TimedRef[]): [GroupRow, TimedRef[]][] {
	const idx = plugin.index;
	const members = refs.map((ref) => ({ name: ref.ref.name, prop: ref.via ?? "cultures", ref }));
	const split = splitMembers(members, (name) => {
		const note = idx.findByName(name);
		return note ? groupKind(plugin, note) : undefined;
	});
	return ROW_ORDER.filter((row) => split[row].length).map((row) => [row, split[row].map((m) => m.ref)]);
}

/** What a card shows under the name: which of a person's groups, in what order (see FamilyOptions.meta). */
export type CardGroups = "both" | "realm" | "house" | "culture" | "faith" | "organisation" | "none";

export const CARD_GROUP_CHOICES: [CardGroups, string][] = [["both", "Realm and house"], ["realm", "Realm"], ["house", "House"], ["culture", "Culture"], ["faith", "Faith"], ["organisation", "Organisation"], ["none", "Nothing"]];

/**
 * The line under a name: the realm, then the house ("Vael · House Vane"), or one kind of group alone. Realm and
 * house together fall back to the first group they have when they have neither.
 */
export function groupLine(plugin: UniverseViewPlugin, refs: TimedRef[], mode: CardGroups = "both"): string {
	if (mode === "none") return "";
	const first = (row: GroupRow) => firstOfRow(plugin, refs, row)?.ref.name;
	if (mode !== "both") return first(mode) ?? "";
	return [first("realm"), first("house")].filter(Boolean).join(" · ") || refs[0]?.ref.name || "";
}

/** The first group of one kind, for a short line ("House Tudor"). */
export function firstOfRow(plugin: UniverseViewPlugin, refs: TimedRef[], row: GroupRow): TimedRef | undefined {
	return groupsByRow(plugin, refs).find(([r]) => r === row)?.[1][0];
}
