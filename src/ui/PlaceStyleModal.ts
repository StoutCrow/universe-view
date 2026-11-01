import { Setting, TFile } from "obsidian";
import type ChroniclePlugin from "../main";
import { PIN_SIZES, type Entity, type PinSize } from "../types";
import { CATEGORY_SCALE, COMMON_PLACE_KINDS, parseMapCategories } from "../settings";
import { TextPrompt } from "../views/DashboardView";
import { helpTip } from "../render/common";

const SIZE_KEYS = ["pin-size", "pin_size", "pinsize", "map-size", "size"];
const LAYER_KEYS = ["layer", "map-layer", "map_layer", "zoom-layer", "zoom_layer"];

export const LAYER_NAMES = ["Always shown", "Shown from a little zoom", "Shown when zoomed in", "Shown when zoomed in close", "Only when zoomed right in"];

/** Every kind of place worth offering: common ones, the settings' and the vault's own. */
export function placeKinds(plugin: ChroniclePlugin): string[] {
	return placeKindGroups(plugin).flatMap(([, kinds]) => kinds);
}

/**
 * Titles' tiers (kingdom, province, county…) and words for the same thing (fortress for fort) aren't
 * kinds of place: a title's tier is set under Tier, and these would only repeat it.
 */
const NOT_KINDS = new Set(["kingdom", "realm", "empire", "province", "duchy", "county", "barony", "country", "nation", "fortress", "keep", "ruins", "harbour", "harbor"]);

/** The kinds of place to offer, grouped: built-in groups first, then any others in use or in the settings. */
export function placeKindGroups(plugin: ChroniclePlugin): [string, string[]][] {
	const groups: [string, string[]][] = [
		["Settlements", ["capital", "city", "town", "village", "settlement", "port"]],
		["Defences", ["castle", "fort"]],
		["Buildings and sites", ["building", "temple", "landmark", "ruin"]],
		["Nature", ["region", "landform", "mountain", "forest", "river", "lake", "sea", "island"]],
		["Space", ["planet", "moon", "star", "station"]],
	];
	const known = new Set(groups.flatMap(([, k]) => k));
	const others = new Set<string>();
	for (const k of [...COMMON_PLACE_KINDS, ...parseMapCategories(plugin.settings.mapCategories).keys()]) if (!known.has(k) && !NOT_KINDS.has(k)) others.add(k);
	for (const p of plugin.index.all("place")) if (p.category && !known.has(p.category) && !NOT_KINDS.has(p.category)) others.add(p.category);
	// Space only for vaults that use it (a planet or station among the places or the settings' kinds).
	const space = [...parseMapCategories(plugin.settings.mapCategories).keys()].some((k) => ["planet", "station"].includes(k)) && plugin.index.all("place").some((p) => ["planet", "moon", "star", "station"].includes(p.category ?? ""));
	return [...groups.filter(([name]) => name !== "Space" || space), ...(others.size ? [["Other", [...others].sort()] as [string, string[]]] : [])];
}

/** What a place gets when it doesn't say: its kind's size and layer from the settings, or built-in ones. */
export function kindDefaults(plugin: ChroniclePlugin, kind?: string): { size?: PinSize; layer: number } {
	if (!kind) return { layer: 1 };
	const cat = parseMapCategories(plugin.settings.mapCategories).get(kind);
	const builtin = CATEGORY_SCALE[kind];
	return { size: cat?.size ?? builtin?.size, layer: cat?.layer ?? builtin?.layer ?? 1 };
}

/** Writes a place's kind, pin size and layer, reusing whichever property name the note already has. */
export async function savePlaceStyle(plugin: ChroniclePlugin, key: string, values: { kind?: string | null; size?: PinSize | null; layer?: number | null }) {
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
export function placeStyleFields(container: HTMLElement, plugin: ChroniclePlugin, place: Entity, onSaved?: () => void) {
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

	tipped(container, "Kind of place", "What kind of place it is: a town, a castle, a forest… Sets the pin's colour and icon, and its default size and layer. A title's rank (kingdom, county…) isn't a kind: set it under Tier.")
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
			LAYER_NAMES.forEach((name, i) => d.addOption(String(i + 1), `${i + 1}: ${name}`));
			d.setValue(place.layer ? String(place.layer) : "");
			d.onChange((v) => save({ layer: v ? Number(v) : null }));
		});
	autoLabels();
}
