import { AbstractInputSuggest, type App } from "obsidian";
import type ChroniclePlugin from "../main";
import type { EntityType } from "../types";
import { kindLabel } from "../index/reader";
import { settingWords } from "../index/worldsetting";
import { kindChoices, type KindChoice } from "../index/kinds";

/** The kinds a type has in this vault and setting. */
export function kindsFor(plugin: ChroniclePlugin, type: EntityType): KindChoice[] {
	const hint = type === "place" ? "" : settingWords(plugin.settings.worldSetting).hints[type] ?? "";
	return kindChoices(plugin.index.all().filter((e) => e.type === type).map((e) => e.category), hint);
}

/** Suggests kinds as you type in a kind box; picking one or leaving the box saves it. */
export class KindSuggest extends AbstractInputSuggest<KindChoice> {
	constructor(app: App, private input: HTMLInputElement, private choices: () => KindChoice[], private onPick: (kind: string) => void) {
		super(app, input);
	}

	getSuggestions(query: string): KindChoice[] {
		const q = query.trim().toLowerCase();
		const all = this.choices();
		const hits = q ? all.filter((c) => c.kind.includes(q)) : all;
		// Something new: offered first, so Enter keeps what was typed.
		if (q && !all.some((c) => c.kind === q)) return [{ kind: q, count: -1 }, ...hits].slice(0, 12);
		return hits.slice(0, 12);
	}

	renderSuggestion(c: KindChoice, row: HTMLElement) {
		row.addClass("uv-kind-suggestion");
		row.createSpan({ text: kindLabel(c.kind) });
		const note = c.count < 0 ? "new kind" : c.count === 0 ? "suggested" : `${c.count} note${c.count === 1 ? "" : "s"}`;
		row.createSpan({ cls: "uv-kind-count", text: note });
	}

	selectSuggestion(c: KindChoice) {
		this.input.value = kindLabel(c.kind);
		this.onPick(c.kind);
		this.close();
	}
}
