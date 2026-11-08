import type ChroniclePlugin from "../main";
import { TIER_NAME_PRESETS, tierPresetOf } from "../index/realms";
import { WORLD_SETTINGS, guessSetting, settingWords, type WorldSetting } from "../index/worldsetting";
import { BUILT_IN_PRESETS, applyLook, matchingPreset } from "./mappresets";
import { clickNotice } from "../render/common";

/**
 * Switches the world's setting. Tier names and the map look follow it only while they are still
 * built-in ones: names or a look of the vault's own are kept.
 */
export async function chooseWorldSetting(plugin: ChroniclePlugin, id: WorldSetting) {
	const s = plugin.settings;
	const w = settingWords(id);
	s.worldSetting = id;
	s.worldSettingAsked = true;
	if (tierPresetOf(s.tierNames)) {
		const names = TIER_NAME_PRESETS.find(([p]) => p === w.tiers)?.[2] ?? {};
		s.tierNames = Object.keys(names).length ? structuredClone(names) : undefined;
	}
	const look = BUILT_IN_PRESETS.find((p) => p.id === w.mapLook);
	if (look && matchingPreset(s, BUILT_IN_PRESETS)) applyLook(s, look.look);
	await plugin.saveSettings();
	plugin.restyleTerritories?.();
	plugin.refreshMaps();
	plugin.index.requestRebuild();
}

/** Once per vault: when its places look modern or futuristic and no setting was picked, offers the fitting one. */
export function suggestWorldSetting(plugin: ChroniclePlugin) {
	const s = plugin.settings;
	if (s.worldSetting || s.worldSettingAsked) return;
	const guess = guessSetting(plugin.index.all("place").map((p) => p.category));
	if (!guess) return;
	s.worldSettingAsked = true;
	void plugin.saveSettings();
	const name = WORLD_SETTINGS.find(([id]) => id === guess)?.[1] ?? guess;
	clickNotice(`UniverseView: this looks like a ${name.toLowerCase()} world. Click to use the ${name} setting (its tier names, words and map look). You can change it any time in Settings → World setting.`, 0, () => void chooseWorldSetting(plugin, guess));
}
