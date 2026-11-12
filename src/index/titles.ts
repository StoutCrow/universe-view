/**
 * What a person who holds a title is called: the title of the land's tier (a king for a kingdom, a duchess
 * for a duchy), the way of addressing them, and honorifics for a rank without land (Sir, Dame, Lady).
 * The words follow the world's setting; the tier is the realm tier (1 empire … 6 settlement), whatever
 * a vault calls its tiers. No Obsidian here, so it's testable.
 */

import type { WorldSetting } from "./worldsetting";

export type Gender = "male" | "female" | undefined;

interface Holder {
	/** The title for a man, a woman, and anyone else (a neutral word). */
	m: string;
	f: string;
	/** How they are addressed ("His Majesty"), for each; empty when the setting has no such style. */
	sm?: string;
	sf?: string;
}

const same = (t: string): Holder => ({ m: t, f: t });

/** Title by tier, 1 (biggest) to 6. */
const LADDERS: Record<WorldSetting, Holder[]> = {
	medieval: [
		{ m: "Emperor", f: "Empress", sm: "His Imperial Majesty", sf: "Her Imperial Majesty" },
		{ m: "King", f: "Queen", sm: "His Majesty", sf: "Her Majesty" },
		{ m: "Duke", f: "Duchess", sm: "His Grace", sf: "Her Grace" },
		{ m: "Count", f: "Countess", sm: "His Lordship", sf: "Her Ladyship" },
		{ m: "Baron", f: "Baroness", sm: "Lord", sf: "Lady" },
		{ m: "Lord", f: "Lady", sm: "Lord", sf: "Lady" },
	],
	modern: [same("Secretary-General"), same("President"), same("Governor"), same("County Executive"), same("Chair"), same("Mayor")],
	futuristic: [
		{ m: "Emperor", f: "Empress", sm: "His Imperial Majesty", sf: "Her Imperial Majesty" },
		same("Governor-General"), same("Governor"), same("Administrator"), same("Warden"), same("Commander"),
	],
};

/** Titles of rank without land, from `class:`, `role:` or `rank:`, as the setting words them. */
const RANKS: Record<string, Holder> = {
	knight: { m: "Sir", f: "Dame" },
	baronet: { m: "Sir", f: "Dame" },
	noble: { m: "Lord", f: "Lady" },
	prince: { m: "Prince", f: "Princess", sm: "His Royal Highness", sf: "Her Royal Highness" },
	princess: { m: "Prince", f: "Princess", sm: "His Royal Highness", sf: "Her Royal Highness" },
	heir: { m: "Prince", f: "Princess" },
	archbishop: same("Archbishop"),
	bishop: same("Bishop"),
	abbot: { m: "Abbot", f: "Abbess" },
	admiral: same("Admiral"),
	general: same("General"),
};

const clampTier = (tier: number) => Math.max(1, Math.min(6, Math.round(tier)));
const pick = (h: Holder, g: Gender) => (g === "female" ? h.f : h.m);
const style = (h: Holder, g: Gender) => (g === "female" ? h.sf : h.sm) ?? "";

/** A holder's title for land of this tier: "King", "Duchess". */
export function titleFor(setting: string | undefined, tier: number, gender?: Gender): string {
	const ladder = LADDERS[setting as WorldSetting] ?? LADDERS.medieval;
	return pick(ladder[clampTier(tier) - 1], gender);
}

/** How they are addressed ("Her Majesty"), or "" where the setting has no such way. */
export function styleFor(setting: string | undefined, tier: number, gender?: Gender): string {
	const ladder = LADDERS[setting as WorldSetting] ?? LADDERS.medieval;
	return style(ladder[clampTier(tier) - 1], gender);
}

/** The honorific for a rank without land (Sir, Dame, Lady), or undefined when the word is not a known rank. */
export function rankTitle(word: string | undefined, gender?: Gender): string | undefined {
	const h = RANKS[(word ?? "").trim().toLowerCase()];
	return h ? pick(h, gender) : undefined;
}

/**
 * "King of England", the highest of what they hold: its tier and the land's name. A realm that names its own ruler
 * (`ruler-title:`, for a realm of a kind of its own) gives `own`, which wins over the tier's word.
 */
export function holderTitle(setting: string | undefined, held: { tier: number; name: string; own?: string }[], gender?: Gender): string {
	const top = [...held].sort((a, b) => a.tier - b.tier)[0];
	return top ? `${top.own || titleFor(setting, top.tier, gender)} of ${top.name}` : "";
}
