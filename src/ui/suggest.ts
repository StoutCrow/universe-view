import { AbstractInputSuggest, App, FuzzySuggestModal, TFile, prepareFuzzySearch } from "obsidian";
import type UniverseViewPlugin from "../main";
import type { Entity, EntityType } from "../types";
import { formatSpan } from "../dates/parser";
import { TYPE_ICONS, icon } from "../render/common";

function rank(plugin: UniverseViewPlugin, query: string, types?: EntityType[]): Entity[] {
	const list = plugin.index.all().filter((e) => !types || types.includes(e.type));
	const q = query.trim();
	if (!q) return list.sort((a, b) => a.name.localeCompare(b.name)).slice(0, 50);
	const fuzzy = prepareFuzzySearch(q);
	// A note's aliases count too ("The Golden State" finds California), a little below its name.
	const score = (e: Entity) => {
		let best = fuzzy(e.name)?.score ?? -Infinity;
		for (const a of ([] as unknown[]).concat(e.props.aliases ?? [])) if (typeof a === "string" && a) best = Math.max(best, (fuzzy(a)?.score ?? -Infinity) - 0.5);
		return best;
	};
	return list
		.map((e) => ({ e, s: score(e) }))
		.filter((x) => x.s > -Infinity)
		.sort((a, b) => b.s - a.s)
		.slice(0, 50)
		.map((x) => x.e);
}

export function renderEntityRow(plugin: UniverseViewPlugin, e: Entity, row: HTMLElement) {
	row.addClass("universeview-suggest-row");
	const ic = row.createSpan({ cls: "universeview-suggest-icon" });
	icon(ic, TYPE_ICONS[e.type]);
	const main = row.createDiv({ cls: "universeview-suggest-main" });
	main.createDiv({ cls: "universeview-suggest-title", text: e.name });
	const span = formatSpan(e.start, e.end, plugin.calendars.get(e.calendar));
	const folder = e.folder && e.folder !== "/" ? e.folder : "";
	const note = [span, folder].filter(Boolean).join(" · ");
	if (note) main.createDiv({ cls: "universeview-suggest-note", text: note });
}

/** Autocomplete for entity names in a text input. */
export class EntityInputSuggest extends AbstractInputSuggest<Entity> {
	constructor(
		app: App,
		private input: HTMLInputElement,
		private plugin: UniverseViewPlugin,
		private types: EntityType[] | undefined,
		private onPick: (e: Entity) => void,
		/** Only notes this lets through are offered (the groups of one kind, for example). */
		private filter?: (e: Entity) => boolean,
	) {
		super(app, input);
	}

	getSuggestions(query: string): Entity[] {
		const found = rank(this.plugin, query, this.types);
		return this.filter ? found.filter(this.filter) : found;
	}

	renderSuggestion(e: Entity, row: HTMLElement) {
		renderEntityRow(this.plugin, e, row);
	}

	selectSuggestion(e: Entity) {
		this.input.value = e.name;
		this.onPick(e);
		this.close();
	}
}

/** Picks an image from the vault (logos, portraits), newest first. */
export class ImagePickerModal extends FuzzySuggestModal<TFile> {
	constructor(app: App, private onPick: (f: TFile) => void, placeholder = "Choose an image…") {
		super(app);
		this.setPlaceholder(placeholder);
	}

	getItems(): TFile[] {
		return this.app.vault.getFiles().filter((f) => /^(png|jpe?g|webp|gif|svg|avif|bmp)$/i.test(f.extension)).sort((a, b) => b.stat.mtime - a.stat.mtime);
	}

	getItemText(f: TFile): string {
		return f.path;
	}

	onChooseItem(f: TFile) {
		this.onPick(f);
	}
}

/** Sets a group's (or anyone's) `logo:` to an image, undoably. */
export function pickLogo(plugin: UniverseViewPlugin, key: string) {
	const note = plugin.app.vault.getAbstractFileByPath(key);
	if (!(note instanceof TFile)) return;
	new ImagePickerModal(plugin.app, (img) => {
		void plugin.editFrontmatter(note, (f) => {
			// Keep whichever property the note already uses (sigil, crest, flag…).
			const field = ["logo", "sigil", "crest", "emblem", "flag", "coat-of-arms", "coat_of_arms", "heraldry"].find((k) => k in f) ?? "logo";
			// The shortest link that still points at this image (two "crest.png"s in different folders stay distinct).
			f[field] = `[[${plugin.app.metadataCache.fileToLinktext(img, note.path, false)}]]`;
		}, `Logo for ${note.basename}`);
	}, `Logo for ${note.basename}: choose an image`).open();
}

/** Modal picker for an entity (used by commands). */
export class EntityPickerModal extends FuzzySuggestModal<Entity> {
	constructor(
		private plugin: UniverseViewPlugin,
		private types: EntityType[] | undefined,
		private onPick: (e: Entity) => void,
		placeholder = "Choose…",
	) {
		super(plugin.app);
		this.setPlaceholder(placeholder);
	}

	getItems(): Entity[] {
		return this.plugin.index.all().filter((e) => !this.types || this.types.includes(e.type));
	}

	getItemText(e: Entity): string {
		return e.name;
	}

	renderSuggestion(item: { item: Entity }, row: HTMLElement) {
		renderEntityRow(this.plugin, item.item, row);
	}

	onChooseItem(e: Entity) {
		this.onPick(e);
	}
}
