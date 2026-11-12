import { Setting, TFile } from "obsidian";
import type UniverseViewPlugin from "../main";
import { PIN_SIZES, type Entity, type PinSize } from "../types";
import { CATEGORY_SCALE, parseMapCategories, placeCategories } from "../settings";
import { FUTURE_KINDS, MODERN_KINDS } from "../index/worldsetting";
import { PLACE_GROUPS, PLACE_KINDS, TERRITORY_WORDS, groupOfKind, normaliseKind, type PlaceGroup } from "../index/placekinds";
import { TextPrompt } from "../views/DashboardView";
import { helpTip } from "../render/common";

const SIZE_KEYS = ["pin-size", "pin_size", "pinsize", "map-size", "size"];
const LAYER_KEYS = ["layer", "map-layer", "map_layer", "zoom-layer", "zoom_layer"];

export const LAYER_NAMES = ["Always shown", "Shown from a little zoom", "Shown when zoomed in", "Shown when zoomed in close", "Only when zoomed right in"];

/** Every kind of place worth offering: common ones, the settings' and the vault's own. */
export function placeKinds(plugin: UniverseViewPlugin): string[] {
	return placeKindGroups(plugin).flatMap(([, kinds]) => kinds);
}

/**
 * Words that are not kinds of place: a title's tier (kingdom, province, county…) is set under Tier, a role
 * (capital, port) is a trait, and a spelling (fortress for fort) is the same kind. They are read, never offered.
 */
const notAKind = (k: string) => TERRITORY_WORDS.includes(k) || normaliseKind(k).kind !== k.toLowerCase();

/**
 * The kinds of place to offer, grouped by type of place (index/placekinds.ts). Land, water and sites are always
 * listed; settlements, structures and space show what a vault's setting or its own notes use.
 */
export function placeKindGroups(plugin: UniverseViewPlugin): [string, string[]][] {
	const setting = plugin.settings.worldSetting;
	const later = setting === "modern" || setting === "futuristic";
	const inSettings = new Set(parseMapCategories(plugin.settings.mapCategories).keys());
	const used = new Set(plugin.index.all("place").map((p) => normaliseKind(p.category).kind).filter((k): k is string => !!k));
	const wanted = (kind: string, core: boolean, group: PlaceGroup) => {
		if (["land", "water", "site"].includes(group) || core || used.has(kind) || inSettings.has(kind)) return true;
		if (FUTURE_KINDS.has(kind)) return setting === "futuristic";
		if (MODERN_KINDS.has(kind)) return later;
		return false;
	};
	const groups: [string, string[]][] = [];
	const known = new Set<string>();
	for (const [group, label] of PLACE_GROUPS) {
		if (group === "territory") continue;
		const kinds = PLACE_KINDS.filter((d) => d.group === group && wanted(d.kind, !!d.core, group)).map((d) => d.kind);
		kinds.forEach((x) => known.add(x));
		if (kinds.length) groups.push([label, kinds]);
	}
	// Space only for futuristic worlds and vaults that use it.
	const space = setting === "futuristic" || [...used].some((k) => groupOfKind(k) === "space");
	const others = new Set<string>();
	for (const kind of [...inSettings, ...used]) if (!known.has(kind) && !notAKind(kind) && !groupOfKind(kind)) others.add(kind);
	return [...groups.filter(([name]) => name !== "Space" || space), ...(others.size ? [["Other", [...others].sort()] as [string, string[]]] : [])];
}
/** What a place gets when it doesn't say: its kind's size and layer from the settings, or built-in ones. */
export function kindDefaults(plugin: UniverseViewPlugin, kind?: string): { size?: PinSize; layer: number } {
	if (!kind) return { layer: 1 };
	const cat = placeCategories(plugin.settings.mapCategories).get(kind);
	const builtin = CATEGORY_SCALE[kind];
	return { size: cat?.size ?? builtin?.size, layer: cat?.layer ?? builtin?.layer ?? 1 };
}

/** Writes a place's kind, pin size and layer, reusing whichever property name the note already has. */
export async function savePlaceStyle(plugin: UniverseViewPlugin, key: string, values: { kind?: string | null; size?: PinSize | null; layer?: number | null }) {
	const file = plugin.app.vault.getAbstractFileByPath(key);
	if (!(file instanceof TFile)) return;
	const current = plugin.index.get(key)?.category;
	const label = values.kind !== undefined ? "Change kind" : values.size !== undefined ? "Change pin size" : "Change map layer";
	await plugin.editFrontmatter(file, (fm) => {
		const put = (keys: string[], fallback: string, v: unknown, owns: (old: unknown) => boolean = () => true) => {
			const existing = keys.find((k) => k in fm && owns(fm[k]));
			const k = existing ?? fallback;
			if (v === null || v === "") delete fm[k];
			else fm[k] = v;
		};
		if (values.kind !== undefined) plugin.setKindMark(fm, current, values.kind || null);
		// "size:" may mean something else in a note (a population, an area), so only reuse it when it holds a pin size.
		if (values.size !== undefined) put(SIZE_KEYS, "pin-size", values.size, (old) => /^(tiny|small|medium|large|huge|[1-5])$/i.test(String(old)));
		if (values.layer !== undefined) put(LAYER_KEYS, "layer", values.layer);
	}, label);
}

/** A setting row whose explanation sits behind a "?" by its name. */
function tipped(container: HTMLElement, name: string, help: string): Setting {
	const s = new Setting(container).setName(name);
	helpTip(s.nameEl, help);
	return s;
}

/** Kind, size and layer pickers for a place, saved as they change. */
export function placeStyleFields(container: HTMLElement, plugin: UniverseViewPlugin, place: Entity, onSaved?: () => void) {
	const save = (v: Parameters<typeof savePlaceStyle>[2]) => void savePlaceStyle(plugin, place.key, v).then(() => onSaved?.());
	let kind = place.category;
	const defaults = () => kindDefaults(plugin, kind);
	let sizeDrop: { selectEl: HTMLSelectElement } | undefined;
	let layerDrop: { selectEl: HTMLSelectElement } | undefined;
	const autoLabels = () => {
		const d = defaults();
		if (sizeDrop) sizeDrop.selectEl.options[0].text = `Automatic (${d.size ?? "by number of events"})`;
		if (layerDrop) layerDrop.selectEl.options[0].text = `Automatic (layer ${d.layer})`;
	};

	tipped(container, "Kind", "What it is: a town, a castle, an island, a continent… For a region this is its landform. Sets the pin's colour and icon, and its default size and layer. A title's rank (kingdom, county…) isn't a kind: set it under Tier.")
		.addDropdown((d) => {
			const cap = (k: string) => k.charAt(0).toUpperCase() + k.slice(1);
			d.addOption("", "None");
			const offered = new Set<string>();
			for (const [group, kinds] of placeKindGroups(plugin)) {
				const og = d.selectEl.createEl("optgroup", { attr: { label: group } });
				for (const k of kinds) {
					og.createEl("option", { text: cap(k), value: k });
					offered.add(k);
				}
			}
			// A kind the note already has that isn't offered (a title's tier from an older note): kept, so it isn't lost.
			if (kind && !offered.has(kind)) d.addOption(kind, `${cap(kind)} (a title's tier: set it under Tier)`);
			d.addOption("__other", "Other…");
			d.setValue(kind ?? "");
			d.onChange((v) => {
				if (v === "__other") {
					d.setValue(kind ?? "");
					new TextPrompt(plugin, "Kind of place (e.g. outpost, shrine)", "", (raw) => {
						const name = raw.trim().toLowerCase();
						d.selectEl.add(new Option(name.charAt(0).toUpperCase() + name.slice(1), name), d.selectEl.options.length - 1);
						d.setValue(name);
						kind = name;
						autoLabels();
						save({ kind: name });
					}).open();
					return;
				}
				kind = v || undefined;
				autoLabels();
				save({ kind: v || null });
			});
		});

	tipped(container, "Pin size", "How big the pin is drawn. Automatic takes it from the kind of place, or from how many events happened there.")
		.addDropdown((d) => {
			sizeDrop = d;
			d.addOption("", "Automatic");
			for (const s of PIN_SIZES) d.addOption(s, s.charAt(0).toUpperCase() + s.slice(1));
			d.setValue(place.pinSize ?? "");
			d.onChange((v) => save({ size: (v || null) as PinSize | null }));
		});

	tipped(container, "Layer", "How far you must zoom in before the place shows: 1 is always, 5 only when zoomed right in. Automatic takes it from the kind of place, or from its tier as a title (counties a little in, towns further).")
		.addDropdown((d) => {
			layerDrop = d;
			d.addOption("", "Automatic");
			for (const [i, name] of LAYER_NAMES.entries()) d.addOption(String(i + 1), `${i + 1}: ${name}`);
			d.setValue(place.layer ? String(place.layer) : "");
			d.onChange((v) => save({ layer: v ? Number(v) : null }));
		});
	autoLabels();
}
