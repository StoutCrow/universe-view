import { Modal, Notice, Setting, TFolder } from "obsidian";
import { TieModal, type TieEdit } from "./TieModal";
import { endedTieLabel, tieEnded, type TieRole } from "../index/ties";
import { makeFolderNote, placementFor, type Placement } from "./foldernotes";
import { choiceTags, standardFields, type TagChoice } from "./tagstandard";
import type UniverseViewPlugin from "../main";
import { EntityType } from "../types";
import type { Entity } from "../types";
import { formatDate, parseDate } from "../dates/parser";
import { readAliases } from "../index/aliases";
import { Calendar, GREGORIAN_ID } from "../dates/calendars";
import { TYPE_ICONS, TYPE_LABELS, el, helpTip, icon } from "../render/common";
import { GROUP_KINDS, groupKind } from "../render/houses";
import { EntityInputSuggest } from "./suggest";
import { generateNames, givenNames, trainNames } from "../index/names";
import { presetKinds, relKind } from "../index/relkinds";
import { tierName } from "../index/realms";
import { societySpec } from "../index/societies";
import { FORM_TARGET, NAME_FORMS, houseSurname, matchForm, otherKindOf, personFull, splitPerson } from "../index/nameforms";

/**
 * Names to learn a style from: the members of the chosen groups when there are enough, otherwise
 * every note of this type in the same world (or the whole vault).
 */
export function suggestionPool(plugin: UniverseViewPlugin, type: EntityType, groups: string[], scope?: string): string[] {
	const idx = plugin.index;
	const fromGroups = groups
		.map((g) => idx.findByName(g))
		.flatMap((g) => (g ? idx.members(g.key).map((m) => idx.get(m.key)).filter((e) => e?.type === type).map((e) => e!.name) : []));
	if (fromGroups.length >= 4) return fromGroups;
	return idx.all(type).filter((e) => !scope || e.path.startsWith(scope + "/")).map((e) => e.name);
}

/** What each type is for, as the tooltip on its button. */
const TYPE_TIPS: Record<EntityType, string> = {
	event: "Something that happened: a battle, a wedding, a coronation. It goes on the timeline.",
	person: "A character. They go in the family tree and on the timeline.",
	place: "A location, from a tavern to a kingdom's land. It goes on the map.",
	culture: "A group of people: a realm, house, people, language, faith or organisation.",
	object: "A crown, a sword, a relic: something with a maker, holders and a journey.",
	creature: "A species or a single beast. No dates, so it stays off the timeline.",
	map: "An image of your own to place notes on.",
};

/** The types the creator offers, in order. */
const CREATE_TYPES: EntityType[] = ["event", "person", "place", "culture", "object", "creature", "map"];

/** Each type's kinds: [button id, kind written on the note, icon, label]. "nationality" is a culture: a realm's people (a society's kind can't be "culture", the type's own name). */
const KINDS: Partial<Record<EntityType, [string, string | undefined, string, string][]>> = {
	place: [
		["place", undefined, TYPE_ICONS.place, "Place"],
		["region", "region", "mountain", "Region"],
	],
	culture: [
		["realm", "realm", GROUP_KINDS.realm.icon, "Realm"],
		["house", "house", GROUP_KINDS.house.icon, "House"],
		["nationality", "nationality", GROUP_KINDS.culture.icon, "People"],
		["language", "language", GROUP_KINDS.language.icon, "Language"],
		["faith", "faith", GROUP_KINDS.faith.icon, "Faith"],
		["organisation", "organisation", GROUP_KINDS.organisation.icon, "Organisation"],
		["group", undefined, GROUP_KINDS.group.icon, "Other"],
	],
};

/** What each question means, shown behind a "?" beside it (the society kinds' own words are added when the form is drawn). */
const HELP: Record<string, string> = {
	"Date": "When it happened. A day, a month or just a year all work, and `c. 1240` or `1240..1245` for a guess or a span. Read in the calendar of the world the note goes in.",
	"End date": "Fill this in to make the event a span (a war, a siege, a reign) instead of a single day.",
	"Starts at": "Where it began. With an end place too, the map can draw the journey between them.",
	"Ends at": "Where it finished.",
	"Led by": "Who led it. Their notes list it too.",
	"People": "Everyone who took part. They get the event on their own timeline.",
	"Places": "Where it happened. These show as pins on the map.",
	"Societies": "The realms, houses, faiths and other societies it involved or belongs to.",
	"Importance": "Higher importance stays visible when you filter the timeline down. Most events are a 3.",
	"Born": "Birth date, written as `born`. The family tree and ages are worked out from it.",
	"Died": "Death date, written as `died`. Leave it empty for someone living or unknown. Where a house keeps a dead folder, a death date offers the move.",
	"Gender": "Optional. Only used to colour cards and word family ties; leave it empty to skip.",
	"Parents": "Their parents' notes. This puts them in the family tree and files them inside their house's folder.",
	"Partners": "Spouses and partners. Click the pencil on one afterwards to say what kind, when, and how it ended.",
	"Lives at": "Where they live: a place note. The map shows them there.",
	"Colour": "The colour on timelines, cards and maps. Leave it alone and the note keeps its default.",
	"Logo": "An image from your vault, shown on the organisation chart, map pins and cards.",
	"Kind": "What sort of thing it is, in your own words (a crown, a sword, a dragon). Written as `kind`.",
	"Made": "When it was made. Its journey on the map starts here.",
	"Lost or destroyed": "When it was lost or destroyed. Empty means it still exists.",
	"Held by": "Who held it: people or societies. Open the note later to give each holder dates.",
	"Kept at": "Where it was kept: place notes. The journey follows these.",
	"Found in": "Where it lives. A place's map popup lists its creatures, including those in places inside it.",
	"Kept or feared by": "The societies that keep, hunt or fear it.",
	"Lies in (a larger region)": "The bigger region or land this one sits inside. One only.",
	"Located in": "The place or land it sits inside. Also decides which folder the note is filed in.",
	"Map": "Real-world coordinates go on the world map. Choose one of your own image maps to place it on that instead.",
	"Image": "An image in your vault. The map is drawn on it.",
	"Also called": "Other names it goes by. A link written with any of them finds this note.",
	"Summary": "One line shown on cards, hover cards and in the inspector.",
	"Occupation": "What they do or did. Shown on cards.",
	"Born at": "Where they were born: a place note.",
	"Died at": "Where they died: a place note.",
	"Children": "Their children. Usually enough to write the parents on the child instead.",
	"Part of": "The war or larger event this belongs to.",
	"Caused by": "The events that led to this one. The timeline draws arrows between them.",
	"Led to": "The events that followed from this one.",
	"Population": "How many live there, as a number.",
	"Terrain": "Mountains, forest, marsh… it slows journeys across it.",
	"Picture": "An image in your vault, shown on cards.",
	"Portrait": "An image in your vault, shown on cards and in the family tree.",
};

export interface CreatePrefill {
	type?: EntityType;
	/** For a society or place: its kind (written on the note). */
	groupKind?: "realm" | "house" | "region" | "nationality" | "language" | "faith" | "organisation";
	name?: string;
	date?: string;
	calendar?: string;
	places?: string[];
	participants?: string[];
	parents?: string[];
	cultures?: string[];
	/** For a new group: the groups it's a branch of. */
	parentCultures?: string[];
	/** Top-level folder of the world the note belongs to (from a scoped view). */
	scope?: string;
	/** Make the new person a parent of this person. */
	childOf?: string;
	map?: string;
	position?: [number, number];
}

/** Example date formats written in the given calendar. */
function dateExamples(cal: Calendar): string {
	if (cal.id === GREGORIAN_ID) return "1243-05-14, May 1243, c. 1240, 350 BCE or 1240..1245";
	const y = cal.eraOffset(Number.MAX_SAFE_INTEGER) + 12;
	const year = cal.formatYear(y);
	const month = cal.monthNames[2] ?? cal.monthNames[0];
	return `14 ${month} ${year}, ${month} ${year}, ${year}, c. ${year} or ${year}..${cal.formatYear(y + 3)}`;
}

/** A list of [[links]] shown as removable chips, with entity autocomplete. */
export class LinkList {
	values: string[];
	/** Called when a link is added or removed. */
	onChange?: () => void;
	private box: HTMLElement;
	private input: HTMLInputElement;

	/** What each link says about the tie (kind, dates, how it ended, custom text), by name, when the list allows editing it; undefined for plain lists. */
	ties?: Map<string, TieEdit>;
	/** What sort of tie the list holds: parents and partners have kinds to choose; other relationships name their own. */
	private tieRole: TieRole;

	constructor(parent: HTMLElement, private plugin: UniverseViewPlugin, types: EntityType[] | undefined, initial: string[] = [], placeholder = "Type to search…", private single = false, ties?: Map<string, TieEdit>, tieRole: TieRole = "relation", filter?: (e: Entity) => boolean) {
		this.ties = ties;
		this.tieRole = tieRole;
		this.values = [...initial];
		const box = (this.box = el("div", { cls: "universeview-linklist" }, parent));
		this.input = el("input", { attr: { type: "text", placeholder } }, box);
		new EntityInputSuggest(plugin.app, this.input, plugin, types, (e) => {
			this.add(e.name);
			this.input.value = "";
		}, filter);
		this.input.addEventListener("keydown", (evt) => {
			if ((evt.key === "Enter" || evt.key === ",") && this.input.value.trim()) {
				// Unknown names are fine: they become unresolved links you can create later.
				evt.preventDefault();
				evt.stopPropagation();
				this.add(this.input.value.trim());
				this.input.value = "";
			} else if (evt.key === "Backspace" && !this.input.value && this.values.length) {
				this.values.pop();
				this.render();
				this.onChange?.();
			}
		});
		this.render();
	}

	/** Whether the cursor is in this list's box, where a name may still be being typed. */
	isTyping(): boolean {
		return document.activeElement === this.input && !!this.input.value.trim();
	}

	/** Includes text typed but not yet confirmed (`withPending`, the default), which autosave must not do while someone is mid-word. */
	collect(withPending = true): string[] {
		const pending = this.input.value.trim();
		if (withPending && pending && !this.values.includes(pending)) this.add(pending);
		return this.values;
	}

	/** Empties the list and its box. */
	clear() {
		this.values = [];
		this.input.value = "";
		this.render();
	}

	/** Adds a name, as picking it from the suggestions would. */
	addName(name: string) {
		this.add(name);
	}

	/** Puts the cursor in the box. */
	focus() {
		this.input.focus();
	}

	private add(name: string) {
		if (this.single) this.values = [];
		if (!this.values.includes(name)) this.values.push(name);
		this.render();
		this.onChange?.();
	}

	private render() {
		// The chips sit in the same row as the input, before it.
		this.box.querySelectorAll(":scope > .universeview-linkchip").forEach((c) => c.remove());
		for (const v of this.values) {
			const chip = createSpan({ cls: "universeview-linkchip" });
			this.box.insertBefore(chip, this.input);
			const known = !!this.plugin.index.findByName(v);
			if (!known) chip.addClass("is-unresolved");
			el("span", { text: v }, chip);
			const tie = this.ties?.get(v);
			// What the tie says, short: its kind, dates and custom text.
			// An ended partnership reads as one: "Ex-lover · 7/26/25–11/14/26 · Breakup · Ex", not a string of labels.
			const over = !!tie && this.tieRole === "partner" && tieEnded(tie);
			if (over) chip.addClass("is-ended");
			const said = tie ? [over ? endedTieLabel(tie.kind, tie.reason) : tie.kind ? tie.kind.replace(/-/g, " ") : "", tie.span, tie.reason ? (over ? tie.reason : `ended: ${tie.reason}`) : "", tie.label].filter(Boolean).join(" · ") : "";
			if (said) el("span", { cls: "universeview-linkchip-note", text: ` · ${said}` }, chip);
			if (this.ties) {
				// A pencil to edit the tie: its kind, when, how it ended, and text of your own.
				const pen = el("button", { cls: "universeview-linkchip-pen", attr: { "aria-label": said ? "Edit this relationship" : "Add details to this relationship", title: said ? "Edit this relationship" : "Add details to this relationship" } }, chip);
				icon(pen, "pencil");
				pen.addEventListener("click", (evt) => {
					evt.stopPropagation();
					new TieModal(this.plugin, v, tie ?? { words: [] }, this.tieRole, (edited) => {
						this.ties?.set(v, edited);
						this.render();
						this.onChange?.();
					}).open();
				});
			}
			const x = el("span", { cls: "universeview-linkchip-x", title: "Remove" }, chip);
			icon(x, "x");
			x.addEventListener("click", () => {
				this.values = this.values.filter((y) => y !== v);
				this.render();
				this.onChange?.();
			});
		}
		this.input.style.display = this.single && this.values.length ? "none" : "";
	}
}

export class CreateEntityModal extends Modal {
	private type: EntityType;
	private name: string;
	private folder: string;
	private dates: Record<string, string> = {};
	private lists: Record<string, LinkList> = {};
	private extra: Record<string, string> = {};
	private fieldsEl!: HTMLElement;
	private typeButtons = new Map<EntityType, HTMLElement>();
	/** The row of kind buttons under the types. */
	private subEl!: HTMLElement;
	/** The ticked way of writing the name ("Kingdom of {name}"), the row it sits in, and whether the bare name is kept as an alias. */
	private form?: string;
	private formsEl!: HTMLElement;
	private hintsEl!: HTMLElement;
	private nameInput?: HTMLInputElement;
	private alsoBare = true;
	/** The kind written on the note: realm, house, faith, region… (none for the plain type). */
	private groupKind?: string;
	private importance = 3;
	/** "More about it" stays open between type switches once opened. */
	private moreOpen = false;
	private folderInput?: HTMLInputElement;
	private folderHint?: HTMLElement;
	/** Inside what the note belongs to (House Whitmore for James II), worked out from its links. */
	private placement?: Placement;
	/** Ruled land or geography, its tier and size: written as the standard tags. */
	private std: TagChoice = { nature: "realm", tier: "6", settlement: "City", landform: "", size: "" };
	/** The land questions were answered (always for realms and regions; for places when opened). */
	private stdUsed = false;
	/** The folder was typed by hand: links no longer move it. */
	private folderManual = false;

	constructor(private plugin: UniverseViewPlugin, private prefill: CreatePrefill = {}) {
		super(plugin.app);
		this.type = prefill.type ?? "event";
		this.groupKind = prefill.groupKind;
		this.name = prefill.name ?? "";
		this.folder = this.defaultFolder(this.type);
		if (prefill.date) this.dates.date = prefill.date;
		if (prefill.map) this.extra.map = prefill.map;
		if (prefill.position) this.extra.position = prefill.position.join(", ");
	}

	onOpen() {
		this.modalEl.addClass("universeview-create-modal", "universeview-scope");
		this.containerEl.addClass("universeview-create-anchor");
		this.titleEl.setText("New note");
		const { contentEl } = this;
		const types = el("div", { cls: "universeview-type-switch" }, contentEl);
		// One button per type; the types with kinds (a place, a society) show a row of them underneath.
		for (const t of CREATE_TYPES) {
			const b = el("button", { cls: "universeview-type-btn" }, types);
			icon(el("span", {}, b), TYPE_ICONS[t]);
			el("span", { text: TYPE_LABELS[t] }, b);
			b.setAttr("aria-label", TYPE_TIPS[t]);
			b.addEventListener("click", () => {
				if (t === this.type) return;
				this.groupKind = undefined;
				this.setType(t);
			});
			this.typeButtons.set(t, b);
		}
		this.subEl = el("div", { cls: "universeview-sub-switch" }, contentEl);
		let nameInput: HTMLInputElement | undefined;
		const nameSetting = new Setting(contentEl).setName("Name").addText((t) => {
			nameInput = t.inputEl;
			this.nameInput = t.inputEl;
			t.setPlaceholder(this.form ? "Just the name" : "Note title").setValue(this.name).onChange((v) => {
				this.name = v;
				this.renderForms();
			});
			window.setTimeout(() => t.inputEl.focus(), 10);
		});
		// A name in the style of the group's (or the world's) existing names, with a parent's surname.
		nameSetting.addExtraButton((b) =>
			b.setIcon("dices").setTooltip("Suggest a name in the style of this world").onClick(() => {
				const groups = this.lists.cultures?.values ?? [];
				const parents = this.lists.parents?.values ?? [];
				const pool = suggestionPool(this.plugin, this.type, groups, this.prefill.scope);
				const [given] = generateNames(trainNames(this.type === "person" ? givenNames(pool) : pool), 1);
				if (!given || !nameInput) {
					new Notice("Not enough names in this world to learn from yet.");
					return;
				}
				const parent = parents[0]?.trim().split(/\s+/);
				const surname = this.type === "person" && parent && parent.length > 1 ? ` ${parent[parent.length - 1]}` : "";
				nameInput.value = given + surname;
				this.name = nameInput.value;
				this.renderForms();
			}),
		);
		nameSetting.settingEl.addClass("universeview-name-setting");
		helpTip(
			nameSetting.nameEl,
			"Write the plain name, then tick a form below to dress it: `England` + Kingdom of becomes `Kingdom of England`, and `England` is kept as an alias so links to [[England]] still find it.\n\nPeople: write the full name, surname last. Capitals matter for how it reads, not for finding it. These characters can't be in a file name and become a dash: `\\ / : * ? \" < > | # ^ [ ]`.\n\nTo make several at once, use the Quick creator in the inspector: one note per line.",
		);
		this.hintsEl = el("div", { cls: "universeview-name-hints" }, contentEl);
		this.formsEl = el("div", { cls: "universeview-name-forms" }, contentEl);
		// A name typed already dressed ("Kingdom of England") is taken apart when you leave the box, if it fits the kind chosen.
		this.nameInput?.addEventListener("change", () => {
			if (this.type === "person" || this.form) return;
			const m = matchForm(NAME_FORMS[this.formKey()] ?? [], this.name);
			if (!m) return;
			this.form = m.form;
			this.setName(m.base);
		});
		this.fieldsEl = el("div", { cls: "universeview-create-fields" }, contentEl);
		const footer = el("div", { cls: "modal-button-container" }, contentEl);
		const folderWrap = el("div", { cls: "universeview-create-folder" }, footer);
		const fi = el("span", {}, folderWrap);
		icon(fi, "folder");
		const folderInput = el("input", { attr: { type: "text", placeholder: "Vault root", list: "uv-folders" } }, folderWrap);
		const folders = el("datalist", { attr: { id: "uv-folders" } }, folderWrap);
		for (const f of this.plugin.app.vault.getAllLoadedFiles()) if (f instanceof TFolder && f.path !== "/") el("option", { attr: { value: f.path } }, folders);
		folderInput.value = this.folder;
		folderInput.addEventListener("input", () => {
			this.folder = folderInput.value;
			this.folderManual = true;
			this.showPlacement();
		});
		this.folderInput = folderInput;
		this.folderHint = el("div", { cls: "uv-create-placement" });
		footer.before(this.folderHint);
		const cancel = el("button", { text: "Cancel" }, footer);
		cancel.addEventListener("click", () => this.close());
		const create = el("button", { cls: "mod-cta", text: "Create" }, footer);
		create.addEventListener("click", () => void this.submit());
		this.scope.register(["Mod"], "Enter", () => {
			void this.submit();
			return false;
		});
		this.setType(this.type);
	}

	/** The type's folder, inside the current world's folder when created from a scoped view. */
	private defaultFolder(t: EntityType): string {
		const base = this.plugin.settings.newNoteFolders[t] ?? "";
		const scope = this.prefill.scope;
		return scope ? [scope, base].filter(Boolean).join("/") : base;
	}

	private setType(t: EntityType) {
		const prevDefault = this.defaultFolder(this.type);
		this.type = t;
		this.stdUsed = false;
		if (this.folder === prevDefault || !this.folder) this.folderManual = false;
		// What kind of land it is: a realm is ruled land, a region only geography.
		if (t === "place" && this.groupKind === "region") this.std = { ...this.std, nature: "region" };
		else if (t === "culture" && this.groupKind === "realm") this.std = { ...this.std, nature: "realm", tier: this.std.nature === "realm" && this.std.tier !== "6" ? this.std.tier : "2" };
		for (const [k, b] of this.typeButtons) b.toggleClass("is-active", k === t);
		this.form = undefined;
		this.renderForms();
		this.renderKinds();
		this.renderFields();
		this.place();
	}

	/** Puts a name in the Name box, and keeps the form row and hints in step. */
	private setName(name: string) {
		this.name = name;
		if (this.nameInput) this.nameInput.value = name;
		this.renderForms();
	}

	/** The surname context gives a person: their house's, else the last word of a parent's name. */
	private surname(): string | undefined {
		for (const g of this.lists.cultures?.values ?? []) {
			const e = this.plugin.index.findByName(g);
			if ((e && groupKind(this.plugin, e) === "house") || matchForm(NAME_FORMS.house, g)) return houseSurname(g);
		}
		const parent = this.lists.parents?.values[0]?.trim().split(/\s+/);
		return parent && parent.length > 1 ? parent[parent.length - 1] : undefined;
	}

	/** Reads what was typed: a name already dressed ("Kingdom of England", "House Whitmore") or with a title ("King Henry I"). */
	private renderHints() {
		const box = this.hintsEl;
		if (!box) return;
		box.empty();
		const text = this.name.trim();
		if (!text || this.form) return;
		const suggest = (message: string, apply: () => void) => {
			const line = el("div", { cls: "universeview-name-suggest" }, box);
			el("span", { text: message }, line);
			const b = el("button", { text: "Apply" }, line);
			b.addEventListener("click", apply);
		};
		const key = this.formKey();
		if (this.type === "person") {
			// Title and suffix come off, the house's surname goes in before any epithet: King Henry I the Bold → Henry I Whitmore the Bold.
			const full = personFull(splitPerson(text), this.surname());
			if (!full || full === text) return;
			suggest(`Name it ${full} and keep ${text} as an alias`, () => {
				const aka = (this.extra.aliases ?? "").split(",").map((s) => s.trim()).filter(Boolean);
				if (!aka.includes(text)) aka.push(text);
				this.extra.aliases = aka.join(", ");
				this.setName(full);
				this.renderFields();
			});
			return;
		}
		const other = otherKindOf(text, key);
		if (other) {
			const target = FORM_TARGET[other.key];
			suggest(`Reads as a ${target.label}: ${other.base}`, () => {
				this.groupKind = target.kind;
				this.setType(target.type as EntityType);
				this.form = other.form;
				this.setName(other.base);
			});
		}
	}

	/** The key of the current choice in NAME_FORMS: the type, or the kind of place or society. */
	private formKey(): string {
		if (this.type === "culture") return this.groupKind ?? "group";
		if (this.type === "place" && this.groupKind === "region") return "region";
		return this.type;
	}

	/** The name with the ticked form around it. */
	private fullName(): string {
		const base = this.name.trim();
		return this.form && base ? this.form.replace("{name}", base) : base;
	}

	/** The tickable forms for this kind of note, and what the name will come out as. */
	private renderForms() {
		this.renderHints();
		const box = this.formsEl;
		if (!box) return;
		box.empty();
		const forms = NAME_FORMS[this.formKey()] ?? [];
		if (!this.fieldsEl || !forms.length) return;
		const row = el("div", { cls: "universeview-name-forms-row" }, box);
		for (const f of forms) {
			const b = el("button", { cls: "universeview-sub-btn" + (f === this.form ? " is-active" : ""), text: f.replace("{name}", "…"), attr: { "aria-pressed": String(f === this.form) } }, row);
			b.addEventListener("click", () => {
				this.form = this.form === f ? undefined : f;
				this.renderForms();
			});
		}
		if (this.form && this.name.trim()) {
			const line = el("div", { cls: "universeview-name-forms-result" }, box);
			el("span", { text: `Will be named ${this.fullName()}` }, line);
			const label = el("label", { cls: "universeview-name-forms-alias" }, line);
			const tick = el("input", { attr: { type: "checkbox" } }, label);
			tick.checked = this.alsoBare;
			tick.addEventListener("change", () => (this.alsoBare = tick.checked));
			el("span", { text: `Also call it ${this.name.trim()}` }, label);
		}
	}

	/** The kind buttons under the type buttons: regions among places; realms, houses, faiths… among societies. */
	private renderKinds() {
		const kinds = KINDS[this.type] ?? [];
		this.subEl.empty();
		this.subEl.toggleClass("is-empty", !kinds.length);
		const current = this.groupKind ?? (this.type === "culture" ? "group" : "place");
		for (const [id, written, ic, label] of kinds) {
			const b = el("button", { cls: "universeview-sub-btn" + (id === (current === "culture" ? "nationality" : current) ? " is-active" : "") }, this.subEl);
			icon(el("span", {}, b), ic);
			el("span", { text: label }, b);
			const tip = this.type === "culture" ? societySpec(written === "nationality" ? "culture" : written).use : id === "region" ? "Land by geography only: a region, island or mountain range, not ruled territory." : "A town, castle, tavern or any other single location.";
			b.setAttr("aria-label", tip);
			b.addEventListener("click", () => {
				this.groupKind = written;
				this.setType(this.type);
			});
		}
	}

	/** Moves the folder to inside what the note belongs to, as its links change (unless typed by hand). */
	private place() {
		const v = (k: string) => this.lists[k]?.values ?? [];
		this.renderHints();
		this.placement = placementFor(this.plugin, this.type, {
			cultures: v("cultures"),
			parents: v("parents"),
			places: v("places"),
			locatedIn: v("locatedIn"),
			parentCultures: v("parentCultures"),
			participants: v("participants"),
			dead: !!this.dates.died?.trim(),
		});
		if (!this.folderManual) {
			this.folder = this.placement?.folder ?? this.defaultFolder(this.type);
			if (this.folderInput) this.folderInput.value = this.folder;
		}
		this.showPlacement();
	}

	private showPlacement() {
		const hint = this.folderHint;
		if (!hint) return;
		hint.empty();
		const pl = this.placement;
		const placed = pl && this.folder === pl.folder;
		icon(el("span", {}, hint), placed ? "folder-tree" : this.folderManual ? "folder-pen" : "folder");
		const text = placed
			? `Inside ${pl.under}${pl.convert ? ` (made into a folder note)` : ""}${pl.folder.split("/").pop() !== pl.under ? ` › ${pl.folder.split("/").pop()}` : ""}`
			: this.folderManual
				? "In the folder you chose"
				: "In the folder for new notes of this type";
		el("span", { text }, hint);
		this.settingsLink(hint, "Change where notes go", "notes");
		if (this.folderManual) {
			const reset = el("a", { cls: "uv-create-placement-reset", text: "Place it for me" }, hint);
			reset.addEventListener("click", () => {
				this.folderManual = false;
				this.place();
			});
		}
	}

	private calendarId(): string {
		return this.prefill.calendar ?? this.plugin.index.calendarFor(this.folder.replace(/\/$/, ""));
	}

	private dateField(key: string, label: string, desc: string) {
		const s = new Setting(this.fieldsEl).setName(label);
		const preview = el("div", { cls: "universeview-date-preview" });
		const update = () => {
			const v = this.dates[key]?.trim();
			preview.removeClass("is-error", "is-ok");
			if (!v) {
				preview.setText(desc);
				return;
			}
			const cal = this.plugin.calendars.get(this.calendarId());
			const d = parseDate(v, cal);
			if (d) {
				preview.addClass("is-ok");
				preview.setText(`✓ ${formatDate(d, cal)}${cal.id !== "gregorian" ? ` (${cal.name})` : ""}`);
			} else {
				preview.addClass("is-error");
				preview.setText(`Not recognised. Try ${dateExamples(cal)}`);
			}
		};
		s.descEl.appendChild(preview);
		// Once per form: the calendar these dates are read in is a setting.
		if (!this.fieldsEl.querySelector(".uv-create-calendar-link")) this.settingsLink(s.descEl, "Calendars", "time").addClass("uv-create-calendar-link");
		s.addText((t) =>
			t.setPlaceholder(`e.g. ${dateExamples(this.plugin.calendars.get(this.calendarId())).split(",")[0]}`).setValue(this.dates[key] ?? "").onChange((v) => {
				this.dates[key] = v;
				update();
				if (key === "died") this.place();
			}),
		);
		update();
	}

	/** A small link that closes this window and opens UniverseView's settings on a page. */
	private settingsLink(parent: HTMLElement, text: string, tab: string): HTMLElement {
		const a = el("a", { cls: "uv-create-link", text }, parent);
		a.addEventListener("click", () => {
			this.close();
			this.plugin.openSettings(tab);
		});
		return a;
	}

	/** A "?" beside each question that has something to explain. */
	private addHelp() {
		const words: Record<string, string> = { ...HELP };
		if (this.type === "culture") {
			const s = societySpec(this.societyKind());
			words[s.dates[0]] = `When it began. ${s.use}`;
			words[s.dates[1]] = "When it ended. Leave empty if it still exists.";
			if (s.leader) words[s.leader] = "Who leads it. Written as `leader`; roles held by its members count too.";
			if (s.liege) words["Under (its liege)"] = "The realm or ruler it answers to. The realm tree and the map's colouring follow it.";
			words[s.places] = `Places tied to it (${s.places.toLowerCase()}). They show as pins on the map.`;
			words[s.parent] = `What it comes from, as ${s.parent.toLowerCase()}. The organisation chart and lineage draw this.`;
		}
		for (const item of Array.from(this.fieldsEl.querySelectorAll<HTMLElement>(".setting-item"))) {
			const name = item.querySelector<HTMLElement>(".setting-item-name");
			const text = words[name?.textContent?.trim() ?? ""];
			if (name && text && !name.querySelector(".universeview-help")) helpTip(name, text);
		}
	}

	/** The society's kind as the specs name it ("nationality" is a culture). */
	private societyKind(): string | undefined {
		return this.groupKind === "nationality" ? "culture" : this.groupKind;
	}

	private textField(key: string, label: string, desc: string) {
		new Setting(this.fieldsEl).setName(label).setDesc(desc).addText((t) => t.setValue(this.extra[key] ?? "").onChange((v) => (this.extra[key] = v)));
	}

	private listField(key: string, label: string, types: EntityType[] | undefined, initial: string[] = [], single = false) {
		const s = new Setting(this.fieldsEl).setName(label);
		s.settingEl.addClass("universeview-list-setting");
		this.lists[key] = new LinkList(s.controlEl, this.plugin, types, this.lists[key]?.values ?? initial, single ? "Search…" : "Add…", single);
		this.lists[key].onChange = () => this.place();
	}

	/** The relationship properties for people or groups, folded away so the form stays short. */
	private relationFields(type: "person" | "culture", keep: (k: string, init?: string[]) => string[]) {
		let kinds = presetKinds(type, this.plugin.settings.relationPresets[type]);
		// Only the ties that make sense for this kind of society (a language has no enemies).
		const fits = type === "culture" ? societySpec(this.societyKind()).relations : undefined;
		if (fits) kinds = kinds.filter((k) => fits.includes(relKind(k)?.key ?? k));
		if (!kinds.length) return;
		const box = el("details", { cls: "universeview-create-relations" }, this.fieldsEl);
		if (kinds.some((k) => keep(`rel:${k}`).length)) box.open = true;
		el("summary", { text: type === "person" ? "Relationships (allies, rivals, mentors…)" : "Relationships (allies, enemies, vassals…)" }, box);
		const outer = this.fieldsEl;
		this.fieldsEl = box;
		this.settingsLink(box, "Choose which relationships appear", "notes");
		for (const k of kinds) {
			const known = relKind(k);
			const s = new Setting(box).setName(known?.label ?? k);
			if (known?.desc) s.setDesc(known.desc);
			s.settingEl.addClass("universeview-list-setting");
			// Leaders and founders are people; group ties are other groups; personal ties can be either.
			const types = type === "person" ? (k === "liege" || k === "employer" ? undefined : ["person" as const]) : known?.key === "leader" || known?.key === "founder" ? ["person" as const] : ["culture" as const];
			this.lists[`rel:${k}`] = new LinkList(s.controlEl, this.plugin, types, keep(`rel:${k}`), "Add…");
		}
		this.fieldsEl = outer;
	}

	/**
	 * What kind of land it is, asked the standard way: ruled land or geography, its tier or landform,
	 * its size. Open for realms and regions; folded for other places (a tavern isn't land).
	 */
	private landFields(open: boolean) {
		const box = el("details", { cls: "universeview-create-relations uv-create-land" }, this.fieldsEl);
		box.open = open || this.stdUsed;
		el("summary", { text: open ? "What it is" : `Is it land? A title (a ${tierName(3).toLowerCase()}, a city) or geography (a region, an island)` }, box);
		if (open) this.stdUsed = true;
		box.addEventListener("toggle", () => {
			if (box.open) this.stdUsed = true;
		});
		standardFields(box, this.std, (c) => {
			this.std = c;
			this.stdUsed = true;
		});
	}

	private renderFields() {
		this.fieldsEl.empty();
		const p = this.prefill;
		const prevLists = this.lists;
		this.lists = {};
		const keep = (k: string, init: string[] = []) => prevLists[k]?.values ?? init;
		// The colour comes first, where it is quick to reach (left alone, the note keeps its default).
		if (this.type !== "map") {
			new Setting(this.fieldsEl).setName("Colour").setDesc("Used on timelines, cards and maps.").addColorPicker((c) => c.setValue(this.extra.color ?? "#7c5cff").onChange((v) => (this.extra.color = v)));
		}
		switch (this.type) {
			case "event":
				this.dateField("date", "Date", "When it happened. Any precision works.");
				this.dateField("end", "End date", "Optional: makes this a span.");
				this.listField("startPlace", "Starts at", ["place"], keep("startPlace"));
				this.listField("endPlace", "Ends at", ["place"], keep("endPlace"));
				this.listField("leads", "Led by", ["person"], keep("leads"));
				this.listField("participants", "People", ["person"], keep("participants", p.participants));
				this.listField("places", "Places", ["place"], keep("places", p.places));
				this.listField("cultures", "Societies", ["culture"], keep("cultures", p.cultures));
				new Setting(this.fieldsEl)
					.setName("Importance")
					.setDesc("Higher importance stays visible when you filter the timeline.")
					.addSlider((sl) => sl.setLimits(1, 5, 1).setValue(this.importance).onChange((v) => (this.importance = v)));
				break;
			case "person":
				this.dateField("born", "Born", "Birth date, if known.");
				this.dateField("died", "Died", "Leave empty if living or unknown.");
				new Setting(this.fieldsEl).setName("Gender").setDesc("Optional; used for card colors.").addDropdown((d) =>
					d.addOptions({ "": "—", female: "Female", male: "Male", other: "Other" }).setValue(this.extra.gender ?? "").onChange((v) => (this.extra.gender = v)),
				);
				this.listField("parents", "Parents", ["person"], keep("parents", p.parents));
				this.listField("partners", "Partners", ["person"], keep("partners"));
				this.listField("residences", "Lives at", ["place"], keep("residences"));
				this.listField("cultures", "Societies", ["culture"], keep("cultures", p.cultures));
				this.relationFields("person", keep);
				break;
			case "culture":
				{
					// Each kind words its own questions, and drops the ones that don't apply (a language has no ruler).
					const s = societySpec(this.societyKind());
					if (this.groupKind === "realm") this.landFields(true);
					this.dateField("founded", s.dates[0], "When it began.");
					this.dateField("dissolved", s.dates[1], "Leave empty if it still exists.");
					if (s.leader) this.listField("leaders", s.leader, ["person"], keep("leaders"));
					if (s.liege) this.listField("liege", "Under (its liege)", ["culture", "person"], keep("liege"), true);
					this.listField("societyPlaces", s.places, ["place"], keep("societyPlaces"));
					this.listField("parentCultures", s.parent, ["culture"], keep("parentCultures", p.parentCultures));
				}
				new Setting(this.fieldsEl)
					.setName("Logo")
					.setDesc("A sigil, crest or flag from your vault: shown on the org chart, map pins and cards.")
					.addText((t) => {
						t.setPlaceholder("crest.png").setValue(this.extra.logo ?? "").onChange((v) => (this.extra.logo = v));
						const images = this.plugin.app.vault.getFiles().filter((f) => /^(png|jpe?g|webp|gif|svg|avif)$/i.test(f.extension));
						const dl = el("datalist", { attr: { id: "universeview-logos" } }, this.fieldsEl);
						for (const f of images.slice(0, 500)) el("option", { attr: { value: f.name } }, dl);
						t.inputEl.setAttribute("list", "universeview-logos");
					});
				this.relationFields("culture", keep);
				break;
			case "place": {
				this.landFields(this.groupKind === "region");
				this.listField("locatedIn", this.groupKind === "region" ? "Lies in (a larger region)" : "Located in", ["place"], keep("locatedIn"), true);
				const maps = this.plugin.index.all("map");
				new Setting(this.fieldsEl)
					.setName("Map")
					.setDesc("Real-world coordinates, or a position on one of your image maps.")
					.addDropdown((d) => {
						d.addOption("", "World map");
						for (const m of maps) d.addOption(m.name, m.name);
						d.setValue(this.extra.map ?? "").onChange((v) => {
							this.extra.map = v;
							this.renderFields();
						});
					});
				const imageMap = !!this.extra.map;
				new Setting(this.fieldsEl)
					.setName(imageMap ? "Position (x, y)" : "Coordinates (lat, lng)")
					.setDesc(imageMap ? "Pixels from the image's top-left. Or leave empty and place it from the map view." : "e.g. 51.507, -0.128. Or leave empty and place it from the map view.")
					.addText((t) => t.setPlaceholder(imageMap ? "512, 300" : "51.507, -0.128").setValue(this.extra.position ?? "").onChange((v) => (this.extra.position = v)));
				this.listField("cultures", "Societies", ["culture"], keep("cultures", p.cultures));
				break;
			}
			case "object":
				this.textField("kind", "Kind", "A crown, a sword, a relic…");
				this.dateField("made", "Made", "When it was made.");
				this.dateField("destroyed", "Lost or destroyed", "Leave empty if it still exists.");
				this.listField("cultures", "Held by", ["person", "culture"], keep("cultures", p.cultures));
				this.listField("places", "Kept at", ["place"], keep("places", p.places));
				break;
			case "creature":
				this.textField("kind", "Kind", "A dragon, a wolf, a spirit…");
				this.listField("places", "Found in", ["place"], keep("places", p.places));
				this.listField("cultures", "Kept or feared by", ["culture"], keep("cultures", p.cultures));
				break;
			case "map":
				new Setting(this.fieldsEl)
					.setName("Image")
					.setDesc("An image in your vault, e.g. World.png.")
					.addText((t) => {
						t.setPlaceholder("world.png").setValue(this.extra.image ?? "").onChange((v) => (this.extra.image = v));
						const images = this.plugin.app.vault.getFiles().filter((f) => /^(png|jpe?g|webp|gif|svg|avif)$/i.test(f.extension));
						const dl = el("datalist", { attr: { id: "universeview-images" } }, this.fieldsEl);
						for (const f of images.slice(0, 500)) el("option", { attr: { value: f.name } }, dl);
						t.inputEl.setAttribute("list", "universeview-images");
					});
				break;
		}
		this.moreFields(keep);
		this.addHelp();
	}

	/** "More about it": what the main fields leave out, folded away until asked for (open again if something in it is filled in). */
	private moreFields(keep: (k: string, init?: string[]) => string[]) {
		const type = this.type;
		const box = el("details", { cls: "universeview-create-relations uv-create-more" }, this.fieldsEl);
		const text = (key: string, label: string, desc: string, placeholder = "") => {
			let input!: HTMLInputElement;
			new Setting(this.fieldsEl).setName(label).setDesc(desc).addText((t) => {
				input = t.inputEl;
				t.setPlaceholder(placeholder).setValue(this.extra[key] ?? "").onChange((v) => (this.extra[key] = v));
			});
			return input;
		};
		el("summary", { text: "More about it" }, box);
		box.addEventListener("toggle", () => (this.moreOpen = box.open));
		const outer = this.fieldsEl;
		this.fieldsEl = box;
		try {
			text("aliases", "Also called", "Other names it goes by, separated by commas. A link written with one finds this note.", "USA, America");
			text("summary", "Summary", "One line about it, shown on cards and in the inspector.");
			if (type === "person") {
				text("occupation", "Occupation", "What they do or did.");
				this.listField("birthPlace", "Born at", ["place"], keep("birthPlace"), true);
				this.listField("deathPlace", "Died at", ["place"], keep("deathPlace"), true);
				this.listField("children", "Children", ["person"], keep("children"));
			}
			if (type === "event") {
				this.listField("war", "Part of", ["event"], keep("war"), true);
				this.listField("causes", "Caused by", ["event"], keep("causes"));
				this.listField("effects", "Led to", ["event"], keep("effects"));
			}
			if (type === "place") {
				text("population", "Population", "How many live there (a number).", "12000");
				text("terrain", "Terrain", "Mountains, forest, marsh… slows journeys across it.");
			}
			if (type === "event" || type === "person" || type === "place" || type === "object" || type === "creature") {
				const picture = text("image", type === "person" ? "Portrait" : "Picture", "An image in your vault, such as portrait.png.", "portrait.png");
				const dl = el("datalist", { attr: { id: "universeview-more-images" } }, box);
				for (const f of this.plugin.app.vault.getFiles().filter((x) => /^(png|jpe?g|webp|gif|svg|avif)$/i.test(x.extension)).slice(0, 500)) el("option", { attr: { value: f.name } }, dl);
				picture.setAttribute("list", "universeview-more-images");
			}
		} finally {
			this.fieldsEl = outer;
		}
		// Open when asked for before, or when something in it is already filled in.
		box.open = this.moreOpen || ["aliases", "summary", "occupation", "population", "terrain", "image"].some((k) => !!this.extra[k]?.trim()) || ["birthPlace", "deathPlace", "children", "war", "causes", "effects"].some((k) => (this.lists[k]?.values.length ?? 0) > 0);
	}

	private async submit() {
		const clean = (s: string) => s.replace(/[\\/:*?"<>|#^[\]]/g, "-");
		const name = clean(this.fullName());
		if (!name) {
			new Notice("Give the note a name first.");
			return;
		}
		const p = this.plugin;
		const f = (field: Parameters<typeof p.fieldName>[0]) => p.fieldName(field);
		const links = (k: string) => (this.lists[k]?.collect() ?? []).map((n) => `[[${n}]]`);
		// The type itself is added by createEntityNote, in the vault's own style (property, tag or cr_type).
		const fm: Record<string, unknown> = {};
		const setIf = (key: string, v: unknown) => {
			if (v === undefined || v === "" || (Array.isArray(v) && !v.length)) return;
			fm[key] = v;
		};
		const cal = this.prefill.calendar;
		switch (this.type) {
			case "event":
				setIf(f("date"), this.dates.date?.trim());
				setIf(f("end"), this.dates.end?.trim());
				setIf(f("startPlace"), links("startPlace")[0]);
				setIf(f("endPlace"), links("endPlace")[0]);
				setIf(f("leads"), links("leads"));
				setIf(f("participants"), links("participants"));
				setIf(f("places"), links("places"));
				setIf(f("cultures"), links("cultures"));
				if (this.importance !== 3) fm[f("importance")] = this.importance;
				break;
			case "person":
				setIf(f("born"), this.dates.born?.trim());
				setIf(f("died"), this.dates.died?.trim());
				setIf(f("gender"), this.extra.gender);
				setIf(f("parents"), links("parents"));
				setIf(f("partners"), links("partners"));
				setIf(f("residences"), links("residences"));
				setIf(f("cultures"), links("cultures"));
				this.writeRelations(fm, links);
				break;
			case "culture":
				setIf(f("founded"), this.dates.founded?.trim());
				setIf(f("dissolved"), this.dates.dissolved?.trim());
				setIf(f("parentCultures"), links("parentCultures"));
				setIf("leader", links("leaders"));
				setIf("liege", links("liege")[0]);
				setIf("places", links("societyPlaces"));
				setIf(f("color"), this.extra.color);
				if (this.extra.logo?.trim()) fm.logo = `[[${this.extra.logo.trim().replace(/^\[\[|\]\]$/g, "")}]]`;
				this.writeRelations(fm, links);
				break;
			case "place": {
				setIf(f("locatedIn"), links("locatedIn")[0]);
				const pair = (this.extra.position ?? "").split(/[,;\s]+/).map(Number).filter((n) => Number.isFinite(n));
				if (this.extra.map) {
					fm[f("map")] = `[[${this.extra.map}]]`;
					if (pair.length === 2) fm[f("position")] = pair;
				} else if (pair.length === 2) fm[f("coordinates")] = pair;
				setIf(f("cultures"), links("cultures"));
				break;
			}
			case "object":
				setIf("kind", this.extra.kind?.trim());
				setIf("made", this.dates.made?.trim());
				setIf("destroyed", this.dates.destroyed?.trim());
				setIf(f("cultures"), links("cultures"));
				setIf(f("places"), links("places"));
				break;
			case "creature":
				setIf("kind", this.extra.kind?.trim());
				setIf(f("places"), links("places"));
				setIf(f("cultures"), links("cultures"));
				break;
			case "map":
				if (this.extra.image) fm[f("image")] = `[[${this.extra.image.replace(/^\[\[|\]\]$/g, "")}]]`;
				break;
		}
		const aka = readAliases(this.extra.aliases ?? "", name);
		// The bare name stays findable when a form dressed it ("England" for "Kingdom of England").
		const bare = clean(this.name.trim());
		if (this.form && this.alsoBare && bare && bare !== name && !aka.includes(bare)) aka.push(bare);
		if (aka.length) fm.aliases = aka;
		// What "More about it" holds.
		const x = (k: string) => this.extra[k]?.trim();
		setIf(f("summary"), x("summary"));
		if (this.type === "person") {
			setIf("occupation", x("occupation"));
			setIf(f("birthPlace"), links("birthPlace")[0]);
			setIf(f("deathPlace"), links("deathPlace")[0]);
			setIf(f("children"), links("children"));
		}
		if (this.type === "event") {
			setIf("war", links("war")[0]);
			setIf("caused-by", links("causes"));
			setIf("led-to", links("effects"));
		}
		if (this.type === "place") {
			const pop = Number((x("population") ?? "").replace(/[,_\s]/g, ""));
			if (x("population") && Number.isFinite(pop)) fm.population = pop;
			setIf("terrain", x("terrain")?.toLowerCase());
		}
		if (this.type === "event" || this.type === "person" || this.type === "place" || this.type === "object" || this.type === "creature") {
			setIf(f("color"), this.extra.color);
			if (x("image")) fm[f("image")] = `[[${x("image").replace(/^!?\[\[|\]\]$/g, "")}]]`;
		}
		if (cal && cal !== p.index.calendarFor(this.folder.replace(/\/$/, ""))) fm[f("calendar")] = cal;
		try {
			if (this.type === "culture" && this.groupKind) fm.__kind = this.groupKind;
			if (this.stdUsed && (this.type === "place" || (this.type === "culture" && this.groupKind === "realm"))) fm.tags = choiceTags(this.std, this.type);
			// Going inside a note that has no folder yet: give it one first.
			const pl = this.placement;
			if (pl?.convert && this.folder === pl.folder) await makeFolderNote(p, pl.convert);
			const file = await p.createEntityNote(name, this.folder, fm, this.type);
			if (this.prefill.childOf) await p.addParentLink(this.prefill.childOf, file);
			this.close();
		} catch (err) {
			new Notice(`Couldn't create note: ${(err as Error).message}`);
		}
	}

	/** Filled relationships always; empty ones too when new notes get them ready to fill in. */
	private writeRelations(fm: Record<string, unknown>, links: (k: string) => string[]) {
		for (const key of Object.keys(this.lists)) {
			if (!key.startsWith("rel:")) continue;
			const v = links(key);
			if (v.length || this.plugin.settings.presetRelations) fm[key.slice(4)] = v;
		}
	}

	onClose() {
		this.contentEl.empty();
	}
}
