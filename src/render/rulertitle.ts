import type UniverseViewPlugin from "../main";
import type { Entity } from "../types";
import { holdingsOf } from "../index/realms";
import { holderTitle, styleFor } from "../index/titles";
import { realmWords, rulerWord } from "../index/realmwords";

/** What a person holds, said once for every place that shows it (tree cards, hover cards, the inspector). */
export interface PersonTitle {
	/** "Queen of England", from the highest ruled land they hold; "" when none of it is ruled land. */
	lead: string;
	/** How they are addressed ("Her Majesty"), or "" when it can't be known. */
	address: string;
	/** Everything they hold, highest first, by name. */
	titles: string[];
}

/**
 * A person's title: the highest ruled land they hold, with its tier's word for the ruler (King, Duchess), or the
 * realm's own (`ruler-title:`), which also gives a realm of a kind of its own, with no tier, a ruler's title.
 * Undefined when they hold nothing.
 */
export function personTitle(plugin: UniverseViewPlugin, e: Entity): PersonTitle | undefined {
	if (e.type !== "person") return undefined;
	const tree = plugin.realms();
	const idx = plugin.index;
	const held = holdingsOf(tree, e.key);
	if (!held.length) return undefined;
	const titles = held
		.map((k) => ({ k, rank: tree.nodes.get(k)?.rank ?? 9 }))
		.sort((a, b) => a.rank - b.rank)
		.map((t) => idx.get(t.k)?.name)
		.filter((x): x is string => !!x);
	const setting = plugin.settings.worldSetting;
	const gender = e.gender === "f" ? "female" : e.gender === "m" ? "male" : undefined;
	const ruled = held.flatMap((k) => {
		const node = tree.nodes.get(k);
		const land = idx.get(k);
		const own = land ? rulerWord(realmWords(land.props), gender) : undefined;
		return node && land && node.nature !== "region" && (node.rank < 9 || own) ? [{ tier: node.rank, name: land.name, own }] : [];
	});
	const top = [...ruled].sort((a, b) => a.tier - b.tier)[0];
	return {
		lead: holderTitle(setting, ruled, gender),
		// The address goes with a tier ("Her Majesty" for a kingdom); a realm with no tier has none to go by.
		address: top && top.tier < 9 ? styleFor(setting, top.tier, gender) : "",
		titles,
	};
}
