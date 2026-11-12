import { Modal, Notice, Setting, TFolder } from "obsidian";
import { TieModal, type TieEdit } from "./TieModal";
import { makeFolderNote, placementFor, type Placement } from "./foldernotes";
import { choiceTags, standardFields, type TagChoice } from "./tagstandard";
import type UniverseViewPlugin from "../main";
import { EntityType } from "../types";
import type { Entity } from "../types";
import { formatDate, parseDate } from "../dates/parser";
import { Calendar, GREGORIAN_ID } from "../dates/calendars";
import { TYPE_ICONS, TYPE_LABELS, el, icon } from "../render/common";
import { GROUP_KINDS } from "../render/houses";
import { EntityInputSuggest } from "./suggest";
import { generateNames, givenNames, trainNames } from "../index/names";
import { presetKinds, relKind } from "../index/relkinds";
import { tierName } from "../index/realms";

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

export interface CreatePrefill {
	type?: EntityType;
	/** For a group: a realm or a house (its kind is written for it). */
	groupKind?: "realm" | "house" | "region";
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
	/** The kinds a tie in this list can be, with labels; empty when the list's own name is the kind. */
	private tieKinds: [string, string][];

	constructor(parent: HTMLElement, private plugin: UniverseViewPlugin, types: EntityType[] | undefined, initial: string[] = [], placeholder = "Type to search…", private single = false, ties?: Map<string, TieEdit>, tieKinds: [string, string][] = [], filter?: (e: Entity) => boolean) {
		this.ties = ties;
		this.tieKinds = tieKinds;
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
			const said = tie ? [tie.kind ? tie.kind.replace(/-/g, " ") : "", tie.span, tie.reason ? `ended: ${tie.reason}` : "", tie.label].filter(Boolean).join(" · ") : "";
			if (said) el("span", { cls: "universeview-linkchip-note", text: ` · ${said}` }, chip);
			if (this.ties) {
				// A pencil to edit the tie: its kind, when, how it ended, and text of your own.
				const pen = el("span", { cls: "universeview-linkchip-x", title: said ? "Edit this relationship" : "Add details to this relationship" }, chip);
				icon(pen, "pencil");
				pen.addEventListener("click", (evt) => {
					evt.stopPropagation();
					new TieModal(this.plugin, v, tie ?? { words: [] }, this.tieKinds, (edited) => {
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
	/** The buttons by choice (realm and house are group notes with a kind). */
	private choiceButtons = new Map<string, HTMLElement>();
	/** Realm or house, when a group of that kind is being made. */
	private groupKind?: string;
	private importance = 3;
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
		this.titleEl.setText("New note");
		const { contentEl } = this;
		const types = el("div", { cls: "universeview-type-switch" }, contentEl);
		// Realms, houses and other groups are separate choices (all group notes underneath, with their kind).
		const choices: [string, EntityType, string | undefined, string, string][] = [
			["event", "event", undefined, TYPE_ICONS.event, TYPE_LABELS.event],
			["person", "person", undefined, TYPE_ICONS.person, TYPE_LABELS.person],
			["place", "place", undefined, TYPE_ICONS.place, TYPE_LABELS.place],
			["region", "place", "region", "mountain", "Region"],
			["realm", "culture", "realm", GROUP_KINDS.realm.icon, "Realm"],
			["house", "culture", "house", GROUP_KINDS.house.icon, "House"],
			["group", "culture", undefined, GROUP_KINDS.group.icon, "Group"],
			["map", "map", undefined, TYPE_ICONS.map, TYPE_LABELS.map],
		];
		for (const [id, t, kind, ic, label] of choices) {
			const b = el("button", { cls: "universeview-type-btn" }, types);
			icon(el("span", {}, b), ic);
			el("span", { text: label }, b);
			b.addEventListener("click", () => {
				this.groupKind = kind;
				this.setType(t);
				for (const [k, other] of this.choiceButtons) other.toggleClass("is-active", k === id);
			});
			this.choiceButtons.set(id, b);
			if (!this.typeButtons.has(t)) this.typeButtons.set(t, b);
		}
		let nameInput: HTMLInputElement | undefined;
		const nameSetting = new Setting(contentEl).setName("Name").addText((t) => {
			nameInput = t.inputEl;
			t.setPlaceholder("Note title").setValue(this.name).onChange((v) => (this.name = v));
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
			}),
		);
		nameSetting.settingEl.addClass("universeview-name-setting");
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
		// The chosen button is lit (realm, house or group for a group note).
		const choice = t === "culture" ? this.groupKind ?? "group" : t === "place" && this.groupKind === "region" ? "region" : t;
		// What kind of land it is: a realm is ruled land, a region only geography.
		if (choice === "region") this.std = { ...this.std, nature: "region" };
		else if (choice === "realm") this.std = { ...this.std, nature: "realm", tier: this.std.nature === "realm" && this.std.tier !== "6" ? this.std.tier : "2" };
		for (const [k, b] of this.choiceButtons) b.toggleClass("is-active", k === choice);
		this.renderFields();
		this.place();
	}

	/** Moves the folder to inside what the note belongs to, as its links change (unless typed by hand). */
	private place() {
		const v = (k: string) => this.lists[k]?.values ?? [];
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
		s.addText((t) =>
			t.setPlaceholder(`e.g. ${dateExamples(this.plugin.calendars.get(this.calendarId())).split(",")[0]}`).setValue(this.dates[key] ?? "").onChange((v) => {
				this.dates[key] = v;
				update();
				if (key === "died") this.place();
			}),
		);
		update();
	}

	private listField(key: string, label: string, types: EntityType[] | undefined, initial: string[] = [], single = false) {
		const s = new Setting(this.fieldsEl).setName(label);
		s.settingEl.addClass("universeview-list-setting");
		this.lists[key] = new LinkList(s.controlEl, this.plugin, types, this.lists[key]?.values ?? initial, single ? "Search…" : "Add…", single);
		this.lists[key].onChange = () => this.place();
	}

	/** The relationship properties for people or groups, folded away so the form stays short. */
	private relationFields(type: "person" | "culture", keep: (k: string, init?: string[]) => string[]) {
		const kinds = presetKinds(type, this.plugin.settings.relationPresets[type]);
		if (!kinds.length) return;
		const box = el("details", { cls: "universeview-create-relations" }, this.fieldsEl);
		if (kinds.some((k) => keep(`rel:${k}`).length)) box.open = true;
		el("summary", { text: type === "person" ? "Relationships (allies, rivals, mentors…)" : "Relationships (allies, enemies, vassals…)" }, box);
		const outer = this.fieldsEl;
		this.fieldsEl = box;
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
		switch (this.type) {
			case "event":
				this.dateField("date", "Date", "When it happened. Any precision works.");
				this.dateField("end", "End date", "Optional: makes this a span.");
				this.listField("participants", "People", ["person"], keep("participants", p.participants));
				this.listField("places", "Places", ["place"], keep("places", p.places));
				this.listField("cultures", "Cultures", ["culture"], keep("cultures", p.cultures));
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
				this.listField("cultures", "Cultures", ["culture"], keep("cultures", p.cultures));
				this.relationFields("person", keep);
				break;
			case "culture":
				if (this.groupKind === "realm") this.landFields(true);
				this.dateField("founded", "Founded", "When it began.");
				this.dateField("dissolved", "Dissolved", "Leave empty if it still exists.");
				this.listField("parentCultures", "Part of / descends from", ["culture"], keep("parentCultures", p.parentCultures));
				new Setting(this.fieldsEl).setName("Color").setDesc("Used on timelines, cards and maps.").addColorPicker((c) =>
					c.setValue(this.extra.color ?? "#7c5cff").onChange((v) => (this.extra.color = v)),
				);
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
				this.listField("cultures", "Cultures", ["culture"], keep("cultures", p.cultures));
				break;
			}
			case "map":
				new Setting(this.fieldsEl)
					.setName("Image")
					.setDesc("An image in your vault, e.g. world.png.")
					.addText((t) => {
						t.setPlaceholder("world.png").setValue(this.extra.image ?? "").onChange((v) => (this.extra.image = v));
						const images = this.plugin.app.vault.getFiles().filter((f) => /^(png|jpe?g|webp|gif|svg|avif)$/i.test(f.extension));
						const dl = el("datalist", { attr: { id: "universeview-images" } }, this.fieldsEl);
						for (const f of images.slice(0, 500)) el("option", { attr: { value: f.name } }, dl);
						t.inputEl.setAttribute("list", "universeview-images");
					});
				break;
		}
	}

	private async submit() {
		const name = this.name.trim().replace(/[\\/:*?"<>|#^[\]]/g, "-");
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
				setIf(f("cultures"), links("cultures"));
				this.writeRelations(fm, links);
				break;
			case "culture":
				setIf(f("founded"), this.dates.founded?.trim());
				setIf(f("dissolved"), this.dates.dissolved?.trim());
				setIf(f("parentCultures"), links("parentCultures"));
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
			case "map":
				if (this.extra.image) fm[f("image")] = `[[${this.extra.image.replace(/^\[\[|\]\]$/g, "")}]]`;
				break;
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
