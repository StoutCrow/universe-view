// Translation layer: `t("key")` returns the text in Obsidian's language, or English when a key has no
// translation. Pure (no Obsidian imports), so the node tests can run it.
import { en, type TextKey } from "./en";
import { fr } from "./fr";

type Pack = Partial<Record<TextKey, string>>;

/** Languages with a translation, by the first part of Obsidian's locale ("fr", "fr-ca" → fr). */
export const PACKS: Record<string, Pack> = { fr };

let pack: Pack = {};

/** Picks the translation for a locale such as "fr" or "fr-CA"; anything without one stays English. */
export function setLocale(locale: string | undefined) {
	pack = PACKS[(locale ?? "en").toLowerCase().split(/[-_]/)[0]] ?? {};
}

/** The text for a key, with {names} filled in from `vars`. */
export function t(key: TextKey, vars?: Record<string, string | number>): string {
	const text = pack[key] ?? en[key];
	return vars ? text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole)) : text;
}

/** Problems in a translation: keys English doesn't have, and {names} that don't match the English. */
export function checkPack(translation: Pack): string[] {
	const problems: string[] = [];
	const names = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(",");
	for (const [key, text] of Object.entries(translation)) {
		if (!(key in en)) problems.push(`${key}: no such key`);
		else if (text !== undefined && names(text) !== names(en[key as TextKey])) problems.push(`${key}: {names} differ from English`);
	}
	return problems;
}
