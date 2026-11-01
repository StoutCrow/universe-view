import { debounce } from "obsidian";
import type ChroniclePlugin from "../main";
import { TAG_TYPES } from "../index/reader";
import { tierWordsWith } from "../index/realms";
import { entityColor } from "../render/common";

/**
 * UniverseView's tags in notes drawn in its own style: #Character, #Region or #Realm as a pill in
 * that type's colour, #Nation_United_States in the United States' colour, #Region_Small muted. Built from the tags
 * the vault actually uses (tags are case-sensitive in the editor's markup), and redrawn as notes change.
 */
export function styleTags(plugin: ChroniclePlugin) {
	const style = document.head.createEl("style", { attr: { id: "uv-tag-styles" } });
	const SIZE = /^(gigantic|enormous|massive|huge|large|big|major|medium|small|minor|little|tiny)$/i;
	const build = () => {
		if (plugin.settings.styleTags === false) {
			style.textContent = "";
			return;
		}
		const words = tierWordsWith(plugin.settings.tierWords);
		const custom = new Map(Object.entries(plugin.settings.typeTags).map(([type, tag]) => [tag.toLowerCase().replace(/^#/, ""), type]));
		const colours = new Map<string, string>();
		const seen = new Set<string>();
		for (const e of plugin.index.all()) for (const t of e.tags) seen.add(t.replace(/^#/, ""));
		for (const tag of seen) {
			const low = tag.toLowerCase();
			const parts = low.split(/[_/-]/);
			let colour: string | undefined;
			const type = custom.get(low) ?? TAG_TYPES[low];
			if (type) colour = `var(--chronicle-${type}-color)`;
			else if (words[low] !== undefined) colour = words[low] <= 3 ? "var(--chronicle-culture-color)" : "var(--chronicle-place-color)";
			else if (parts.length > 1) {
				// "Region_Small": a size; "Nation_United_States": that realm's colour; "Family_Noble": its type's.
				const rest = tag.slice(parts[0].length + 1);
				if (SIZE.test(rest)) colour = "var(--text-muted)";
				else {
					const ref = plugin.index.findByName(rest.replace(/_/g, " "));
					const head = custom.get(parts[0]) ?? TAG_TYPES[parts[0]];
					colour = ref ? entityColor(plugin, ref) : head ? `var(--chronicle-${head}-color)` : undefined;
				}
			}
			if (colour) colours.set(tag, colour);
		}
		const esc = (s: string) => s.replace(/["\\]/g, "\\$&");
		const cls = (s: string) => s.replace(/[^\w-]/g, (c) => `\\${c}`);
		const rules: string[] = [];
		for (const [tag, colour] of colours) {
			rules.push(
				`a.tag[href="#${esc(tag)}" i], .cm-hashtag.cm-tag-${cls(tag)}, .cm-hashtag.cm-tag-${cls(tag.toLowerCase())}, .multi-select-pill[data-uv-tag="${esc(tag.toLowerCase())}"] { --uv-tag: ${colour}; }`,
			);
		}
		const pill = "color: color-mix(in srgb, var(--uv-tag) 80%, var(--text-normal)); background-color: color-mix(in srgb, var(--uv-tag) 14%, transparent); border: 1px solid color-mix(in srgb, var(--uv-tag) 32%, transparent);";
		style.textContent = rules.join("\n") + (rules.length ? `
body a.tag:is(${[...colours.keys()].map((t) => `[href="#${esc(t)}" i]`).join(",")}) { ${pill} border-radius: 999px; padding: 0 0.55em; text-decoration: none; }
body .cm-hashtag:is(${[...colours.keys()].map((t) => `.cm-tag-${cls(t)}`).join(",")}) { ${pill} }
body .multi-select-pill[data-uv-tag]:is(${[...colours.keys()].map((t) => `[data-uv-tag="${esc(t.toLowerCase())}"]`).join(",")}) { ${pill} border-radius: 999px; }
body .cm-hashtag-begin:is(${[...colours.keys()].map((t) => `.cm-tag-${cls(t)}`).join(",")}) { border-right: none; border-radius: 999px 0 0 999px; padding-left: 0.5em; }
body .cm-hashtag-end:is(${[...colours.keys()].map((t) => `.cm-tag-${cls(t)}`).join(",")}) { border-left: none; border-radius: 0 999px 999px 0; padding-right: 0.5em; }
` : "");
	};
	const later = debounce(build, 400, true);
	plugin.app.workspace.onLayoutReady(build);
	plugin.registerEvent(plugin.index.on("changed", later));
	// Tags in the Properties panel are pills with no tag name on them: label them so they can be styled.
	const label = () => {
		for (const pill of Array.from(document.querySelectorAll<HTMLElement>('.metadata-property[data-property-key="tags"] .multi-select-pill, .metadata-property[data-property-key="tag"] .multi-select-pill'))) {
			const text = pill.querySelector(".multi-select-pill-content")?.textContent?.trim().replace(/^#/, "").toLowerCase();
			if (text && pill.dataset.uvTag !== text) pill.dataset.uvTag = text;
		}
	};
	const labelLater = debounce(label, 150, true);
	const observer = new MutationObserver(() => labelLater());
	plugin.app.workspace.onLayoutReady(() => {
		observer.observe(document.querySelector(".workspace") ?? document.body, { childList: true, subtree: true });
		label();
	});
	plugin.register(() => {
		observer.disconnect();
		style.remove();
	});
	return build;
}
