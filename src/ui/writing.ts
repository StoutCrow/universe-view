import { MarkdownPostProcessorContext, Modal, Notice, Setting, TFile, TFolder, debounce } from "obsidian";
import type ChroniclePlugin from "../main";
import type { ChronDate, Entity, EntityType } from "../types";
import { buildFieldAliases, type FieldName } from "../settings";
import { formatDate, formatSpan } from "../dates/parser";
import { findKinship, type KinFinding } from "../detect/classify";
import { parseQuickAdd, quickAddFrontmatter } from "../import/quickadd";
import { continuity } from "../index/validate";
import { storyPrompts } from "../index/prompts";
import { linkTarget } from "../index/reader";
import { TYPE_ICONS, TYPE_LABELS, el, icon, openEntity } from "../render/common";
import { GROUP_KINDS } from "../render/houses";
import { makeFolderNote, placementFor } from "./foldernotes";
import { LinkList } from "./CreateEntityModal";
import { presetKinds, relKind } from "../index/relkinds";
import { asText } from "../index/text";

const YEAR = 365.25;

// ---- Quick edit (from a hover card) ---------------------------------------------------------------------

const DATE_FIELDS: Partial<Record<EntityType, [FieldName, string, FieldName, string]>> = {
	person: ["born", "Born", "died", "Died"],
	event: ["date", "Date", "end", "Ended"],
	culture: ["founded", "Founded", "dissolved", "Dissolved"],
	place: ["founded", "Founded", "dissolved", "Abandoned"],
};

/**
 * Edit a note without opening it, in layers: the essentials first (dates, kind, summary), then its
 * links as chips (family, groups, places, relationships) and its tags, and folded away the finer
 * settings (importance, colour, icon, map pin, calendar) and every other property as plain text.
 * Only what you change is written, under the property names the note already uses.
 */
export interface NoteEditor {
	/** Writes what changed; false when nothing did. */
	save(): Promise<boolean>;
	/** Whether anything has been changed yet. */
	dirty(): boolean;
}

/** The layered edit form, for the quick edit window and the inspector panel. `onChange` runs on every edit. */
export function buildEditor(p: ChroniclePlugin, box: HTMLElement, e: Entity, onChange?: () => void, opts: { realmFields?: boolean } = {}): NoteEditor {
	// In the inspector, the realm, land and map sections own where it lies, who holds it, its kind, tags and pin.
	const owned = !!opts.realmFields && (e.type === "place" || p.realms().nodes.has(e.key));
	{
		const fm = (p.app.metadataCache.getFileCache(e.file)?.frontmatter ?? {}) as Record<string, unknown>;
		const aliases = buildFieldAliases(p.settings.fieldAliases);
		const lower = new Map(Object.keys(fm).map((k) => [k.toLowerCase(), k]));
		const has = (names: string[]) => names.map((n) => lower.get(n.toLowerCase())).find((k): k is string => !!k);
		const keyFor = (f: FieldName) => has(aliases[f]) ?? aliases[f][0];
		/** Edits to write: property → new value ("" or [] removes it). */
		const changes = new Map<string, unknown>();
		const used = new Set<string>(["position", "type", "cr_type"]);
		let kind: string | null | undefined;
		const cal = p.calendars.get(e.calendar);
		const section = (title: string, parent: HTMLElement = box) => {
			el("div", { cls: "chronicle-qe-section", text: title }, parent);
		};

		// ---- Essentials
		const dates = DATE_FIELDS[e.type];
		const dateRow = (field: FieldName, label: string) => {
			const k = keyFor(field);
			used.add(k);
			const s = new Setting(box).setName(label);
			s.addText((t) => {
				t.setValue(fm[k] === undefined || fm[k] === null ? "" : asText(fm[k]));
				const check = () => {
					const v = t.getValue().trim();
					const d = v ? p.parseDate(v, cal.id) : null;
					s.setDesc(!v ? "" : d ? `= ${formatSpan(d, undefined, cal)}` : "Couldn't read this date");
					s.descEl.toggleClass("mod-warning", !!v && !d);
				};
				check();
				t.onChange((v) => {
					changes.set(k, v.trim());
					check();
				});
			});
		};
		if (dates) {
			dateRow(dates[0], dates[1]);
			dateRow(dates[2], dates[3]);
		}
		if (!owned) new Setting(box).setName("Kind").setDesc("city, battle, house… (written the way the note marks its kind)").addText((t) => t.setValue(e.category ?? "").onChange((v) => (kind = v.trim().toLowerCase() || null)));
		used.add("kind");
		const sumKey = keyFor("summary");
		used.add(sumKey);
		new Setting(box).setName("Summary").addTextArea((t) => {
			t.setValue(e.summary ?? "").onChange((v) => changes.set(sumKey, v.trim()));
			t.inputEl.rows = 2;
		});

		// ---- Links, as chips
		const names = (v: unknown): string[] => ([] as unknown[]).concat(v ?? []).map((x) => (x && typeof x === "object" ? linkTarget(Object.values(x).find((y) => typeof y === "string" && /\[\[/.test(y))) : linkTarget(x)) ?? "").filter(Boolean);
		const chips = (label: string, k: string, types?: EntityType[], single = false, desc?: string, parent: HTMLElement = box) => {
			used.add(k);
			const raw = fm[k];
			// Entries with dates or roles are kept as they are; chips edit the plain links.
			const rich = ([] as unknown[]).concat(raw ?? []).filter((x) => x && typeof x === "object");
			const before = names(raw).filter((n) => !rich.some((r) => names(r).includes(n)));
			const s = new Setting(parent).setName(label);
			if (desc) s.setDesc(desc);
			if (rich.length) s.setDesc(`${desc ? desc + " · " : ""}${rich.length} with dates or roles kept as written`);
			s.settingEl.addClass("chronicle-list-setting");
			const list = new LinkList(s.controlEl, p, types, before, "Add…", single);
			saves.push(() => {
				const now = list.collect();
				if (now.join("|") === before.join("|")) return;
				const plain = now.map((n) => `[[${n}]]`);
				changes.set(k, single ? plain[0] ?? "" : [...rich, ...plain]);
			});
		};
		const saves: (() => void)[] = [];
		section("Links");
		const field = (f: FieldName, label: string, types?: EntityType[], single = false) => chips(label, keyFor(f), types, single);
		if (e.type === "person") {
			field("parents", "Parents", ["person"]);
			field("partners", "Partners", ["person"]);
			field("cultures", "Groups", ["culture"]);
			field("places", "Places", ["place"]);
		} else if (e.type === "event") {
			field("participants", "People", ["person"]);
			field("places", "Places", ["place"]);
			field("cultures", "Groups", ["culture"]);
			chips("Caused by", has(["caused-by", "caused_by"]) ?? "caused-by", ["event"]);
			chips("Led to", has(["led-to", "led_to"]) ?? "led-to", ["event"]);
		} else if (e.type === "culture") {
			field("parentCultures", "Part of", ["culture"]);
			field("places", "Seats", ["place"]);
		} else if (e.type === "place") {
			if (!owned) {
				field("locatedIn", "Located in", ["place"], true);
				field("cultures", "Held by", ["culture"]);
			} else field("cultures", "Groups", ["culture"]);
		}
		// Relationships: the world's presets, plus any others the note already has.
		if (e.type === "person" || e.type === "culture") {
			section("Relationships");
			const world = p.index.worldFor(e.path);
			const kinds = new Map<string, string>();
			for (const k of presetKinds(e.type, world?.presets[e.type] || p.settings.relationPresets[e.type])) kinds.set(relKind(k)?.key ?? k, has([k, ...(relKind(k)?.aliases ?? [])]) ?? k);
			for (const k of Object.keys(fm)) {
				const rk = relKind(k);
				if (rk && !kinds.has(rk.key)) kinds.set(rk.key, k);
			}
			// Relationships written in a general `relations:` list, with their kinds, are shown as they are.
			const generic = has(["relations", "relationships", "related"]);
			if (generic) {
				const listed = ([] as unknown[]).concat(fm[generic] ?? []).map((x) => {
					const n = names(x)[0];
					const k = x && typeof x === "object" ? (x as Record<string, unknown>).kind : undefined;
					return n ? `${n}${k ? ` (${asText(k)})` : ""}` : "";
				}).filter(Boolean);
				if (listed.length) new Setting(box).setName("Also related").setDesc(`${listed.join(", ")}. Written in \`${generic}:\`; edit them in the note.`);
			}
			// The ones the note has are shown; the rest wait in one menu, so the form stays short.
			const relBox = el("div", {}, box);
			const row = (rk: string, prop: string) => chips(relKind(rk)?.label ?? prop, prop, e.type === "culture" && !/leader|founder/.test(rk) ? ["culture"] : undefined, false, relKind(rk)?.desc, relBox);
			const empty: [string, string][] = [];
			for (const [rk, prop] of kinds) {
				if (names(fm[prop]).length) row(rk, prop);
				else empty.push([rk, prop]);
			}
			if (empty.length) {
				new Setting(box).setName("Add a relationship").setDesc("allies, rivals, mentors, liege… or type your own in More").addDropdown((d) => {
					d.addOption("", "Choose…");
					for (const [rk, prop] of empty) d.addOption(prop, relKind(rk)?.label ?? prop);
					d.onChange((prop) => {
						const hit = empty.find(([, p2]) => p2 === prop);
						if (!hit) return;
						row(hit[0], hit[1]);
						d.selectEl.querySelector(`option[value="${CSS.escape(prop)}"]`)?.remove();
						d.setValue("");
						relBox.lastElementChild?.querySelector("input")?.focus();
					});
				});
			}
		}
		// Tags, as plain words.
		used.add("tags");
		const tagsBefore = ([] as unknown[]).concat(fm.tags ?? []).map((t) => String(t).replace(/^#/, "")).filter(Boolean);
		new Setting(box).setName("Tags").setDesc(owned ? "Other tags, separated by commas. The land tags are set by What it is, above." : "Separated by commas").addText((t) => t.setValue(tagsBefore.join(", ")).onChange((v) => {
			const next = v.split(/[,\s]+/).map((x) => x.replace(/^#/, "").trim()).filter(Boolean);
			changes.set("tags", next);
		}));

		// ---- More: finer settings and every other property
		const more = el("details", { cls: "chronicle-qe-more" }, box);
		el("summary", { text: "More: appearance, map pin, calendar and all other properties" }, more);
		const impKey = keyFor("importance");
		const colKey = keyFor("color");
		used.add(impKey).add(colKey).add("icon").add("pin-size").add("layer").add(keyFor("calendar"));
		new Setting(more).setName("Importance").setDesc("1–5: higher stays visible when zoomed out or filtered").addSlider((sl) => sl.setLimits(1, 5, 1).setValue(e.importance).onChange((v) => changes.set(impKey, v)));
		new Setting(more).setName("Colour").addColorPicker((c) => c.setValue(e.color ?? "#7c5cff").onChange((v) => changes.set(colKey, v))).addExtraButton((b) => b.setIcon("rotate-ccw").setTooltip("Use the default colour").onClick(() => changes.set(colKey, "")));
		new Setting(more).setName("Icon").setDesc("A Lucide icon name or an emoji, for map pins and cards").addText((t) => t.setValue(e.icon ?? "").onChange((v) => changes.set(has(["icon"]) ?? "icon", v.trim())));
		if (e.type === "place" && !owned) {
			new Setting(more).setName("Map pin").addDropdown((d) => d.addOptions({ "": "Size: from its kind", tiny: "Tiny", small: "Small", medium: "Medium", large: "Large", huge: "Huge" }).setValue(e.pinSize ?? "").onChange((v) => changes.set(has(["pin-size"]) ?? "pin-size", v)))
				.addDropdown((d) => d.addOptions({ "": "Layer: from its kind", "1": "1 · always shown", "2": "2", "3": "3", "4": "4", "5": "5 · zoomed right in" }).setValue(e.layer ? String(e.layer) : "").onChange((v) => changes.set(has(["layer"]) ?? "layer", v ? Number(v) : "")));
			used.add(has(["population"]) ?? "population");
			new Setting(more).setName("Population").addText((t) => t.setValue(e.population !== undefined ? String(e.population) : "").onChange((v) => changes.set(has(["population"]) ?? "population", v.trim() ? Number(v.replace(/[,\s_]/g, "")) : "")));
		}
		new Setting(more).setName("Calendar").addDropdown((d) => {
			d.addOption("", `From its folder (${p.calendars.get(p.index.calendarFor(e.folder)).name})`);
			for (const c of p.calendars.all()) d.addOption(c.id, c.name);
			d.setValue(typeof fm[keyFor("calendar")] === "string" ? String(fm[keyFor("calendar")]) : "").onChange((v) => changes.set(keyFor("calendar"), v));
		});
		const rest = Object.keys(fm).filter((k) => !used.has(k) && !relKind(k) && !Object.values(aliases).some((list) => list.includes(k)) && !["territory", "territories", "routes", "annotations", "images", "names", "image-size", "holders", "transfers", "sides", "war"].includes(k) && !(owned && ["under", "polity"].includes(k)));
		if (rest.length) {
			section("Other properties", more);
			for (const k of rest) {
				const v = fm[k];
				const complex = v !== null && typeof v === "object" && !(Array.isArray(v) && v.every((x) => typeof x !== "object"));
				const s = new Setting(more).setName(k);
				if (complex) s.setDesc("Has structure: edit it in the note");
				else s.addText((t) => t.setValue(Array.isArray(v) ? v.join(", ") : v === null || v === undefined ? "" : asText(v)).onChange((x) => {
					const val = x.trim();
					changes.set(k, Array.isArray(v) ? val.split(",").map((y) => y.trim()).filter(Boolean) : typeof v === "number" && val !== "" && Number.isFinite(Number(val)) ? Number(val) : typeof v === "boolean" ? val === "true" : val);
				}));
			}
		}
		new Setting(more).setName("Add a property").addText((t) => {
			t.setPlaceholder("Name: value");
			t.inputEl.addEventListener("change", () => {
				const m = t.getValue().match(/^\s*([^:]+):\s*(.*)$/);
				if (m) changes.set(m[1].trim(), m[2].trim());
			});
		});

		// Any input or chip change marks the form as changed.
		let touched = false;
		const mark = () => {
			touched = true;
			onChange?.();
		};
		box.addEventListener("input", mark);
		box.addEventListener("change", mark);
		box.addEventListener("click", (evt: MouseEvent) => {
			if ((evt.target as Element).closest(".chronicle-linkchip-x")) mark();
		});
		return {
			dirty: () => touched,
			save: async () => {
				saves.forEach((f) => f());
				if (!changes.size && kind === undefined) return false;
				await p.editFrontmatter(e.file, (f) => {
					for (const [k, v] of changes) {
						if (v === "" || v === null || (Array.isArray(v) && !v.length) || (typeof v === "number" && !Number.isFinite(v))) delete f[k];
						else f[k] = v;
					}
					if (kind !== undefined) p.setKindMark(f, e.category, kind);
				}, `Edit ${e.name}`);
				changes.clear();
				kind = undefined;
				touched = false;
				return true;
			},
		};
	}
}

// ---- Relationship suggestions from the text --------------------------------------------------------

export interface Suggestion {
	finding: KinFinding;
	target: string;
	label: string;
}

/** Family links written in a person's text ("son of [[X]]") that aren't in their properties yet. */
export async function suggestionsFor(plugin: ChroniclePlugin, file: TFile): Promise<Suggestion[]> {
	const idx = plugin.index;
	const person = idx.get(file.path);
	if (!person || person.type !== "person") return [];
	const body = await plugin.app.vault.cachedRead(file);
	const known = new Set(
		[...person.parents, ...person.adoptiveParents, ...idx.partners(person.key).map((p) => p.ref), ...idx.children(person.key).map((k) => ({ name: idx.get(k)?.name ?? k }))].map((r) => r.name.toLowerCase()),
	);
	const out: Suggestion[] = [];
	for (const f of findKinship(person.name, body)) {
		const target = f.target.split("/").pop()!.split("|")[0];
		if (known.has(target.toLowerCase()) || out.some((s) => s.target === target)) continue;
		const label = { father: "father", mother: "mother", parent: "parent", spouse: "partner", betrothed: "betrothed", child: "child" }[f.relation];
		out.push({ finding: f, target, label });
	}
	return out;
}

/** Writes a suggested link in the note's own style (father:/mother: notes keep those properties). */
export async function applySuggestion(plugin: ChroniclePlugin, file: TFile, s: Suggestion) {
	const aliases = buildFieldAliases(plugin.settings.fieldAliases);
	const link = `[[${s.target}]]`;
	await plugin.editFrontmatter(file, (f) => {
		const push = (key: string, value: unknown) => {
			const cur = f[key];
			const list: unknown[] = Array.isArray(cur) ? cur : cur === undefined || cur === null || cur === "" ? [] : [cur];
			if (!list.some((v) => linkTarget(v)?.toLowerCase() === s.target.toLowerCase())) list.push(value);
			f[key] = list.length === 1 && (key === "father" || key === "mother") ? list[0] : list;
		};
		const rel = s.finding.relation;
		if ((rel === "father" || rel === "mother") && ("father" in f || "mother" in f)) push(rel, link);
		else if (rel === "father" || rel === "mother" || rel === "parent") push(aliases.parents.find((a) => a in f && !["father", "mother"].includes(a)) ?? "parents", link);
		else if (rel === "spouse") push(aliases.partners.find((a) => a in f) ?? "partners", link);
		else if (rel === "betrothed") push("partners", { person: link, kind: "betrothed" });
		else if (rel === "child") push(aliases.children.find((a) => a in f) ?? "children", link);
	}, `Add ${s.target} as ${s.label}`);
}

export class SuggestionsModal extends Modal {
	constructor(private plugin: ChroniclePlugin, private file: TFile, private found: Suggestion[], private onDone?: () => void) {
		super(plugin.app);
	}

	onOpen() {
		this.containerEl.addClass("chronicle-scope-host");
		this.modalEl.addClass("chronicle-scope", "chronicle-tool-modal");
		this.titleEl.setText(`Found in ${this.file.basename}'s text`);
		if (!this.found.length) el("div", { cls: "chronicle-dash-muted", text: "No new family links found in the text." }, this.contentEl);
		for (const s of this.found) {
			const row = new Setting(this.contentEl).setName(`${s.target} as ${s.label}`).setDesc(`“${s.finding.sentence.trim().slice(0, 140)}”`);
			row.addButton((b) => b.setButtonText("Add").setCta().onClick(async () => {
				b.setDisabled(true);
				await applySuggestion(this.plugin, this.file, s);
				row.setDesc("Added");
			}));
		}
	}

	onClose() {
		this.contentEl.empty();
		this.onDone?.();
	}
}

/**
 * Watches the note you're writing: when its text mentions family that isn't in its properties yet,
 * a small button appears in the status bar ("2 suggestions"). Nothing is changed without a click.
 */
export class LiveSuggestions {
	private item: HTMLElement;
	private found: Suggestion[] = [];
	private file?: TFile;
	private dismissed = new Set<string>();

	constructor(private plugin: ChroniclePlugin) {
		this.item = plugin.addStatusBarItem();
		this.item.addClass("chronicle-suggest-status", "mod-clickable");
		this.item.hide();
		this.item.addEventListener("click", () => {
			if (!this.file) return;
			const file = this.file;
			for (const s of this.found) this.dismissed.add(file.path + "→" + s.target);
			new SuggestionsModal(plugin, file, this.found, () => void this.check()).open();
		});
		const check = debounce(() => void this.check(), 1500, true);
		plugin.registerEvent(plugin.app.workspace.on("file-open", () => check()));
		plugin.registerEvent(plugin.app.metadataCache.on("changed", (f) => f === plugin.app.workspace.getActiveFile() && check()));
	}

	async check() {
		const file = this.plugin.app.workspace.getActiveFile();
		this.file = file ?? undefined;
		if (!file || !this.plugin.settings.liveSuggestions) {
			this.item.hide();
			return;
		}
		this.found = (await suggestionsFor(this.plugin, file)).filter((s) => !this.dismissed.has(file.path + "→" + s.target));
		if (!this.found.length) {
			this.item.hide();
			return;
		}
		this.item.empty();
		const ic = el("span", { cls: "chronicle-suggest-icon" }, this.item);
		icon(ic, "sparkles");
		el("span", { text: `${this.found.length} family link${this.found.length === 1 ? "" : "s"} to add` }, this.item);
		this.item.setAttribute("aria-label", this.found.map((s) => `${s.target} as ${s.label}`).join("\n"));
		this.item.show();
	}
}

// ---- Inline helpers in notes --------------------------------------------------------------------------

/**
 * Inline code that UniverseView fills in, in reading view:
 * `age: Aldric Vane @ SE 20` → 36 · `born: Aldric Vane` → FE 790 · `died: …` · `span: Order of the Ash` → SE 12 – SE 80
 * `when: Battle of Greyford` → 14 Highsun SE 3 · `since: Battle of Greyford @ SE 40` → 37 years
 */
export function inlineHelpers(plugin: ChroniclePlugin) {
	return (root: HTMLElement, _ctx: MarkdownPostProcessorContext) => {
		root.querySelectorAll("code").forEach((code) => {
			if (code.parentElement?.tagName === "PRE") return;
			const m = code.textContent?.match(/^\s*(age|born|died|span|when|since|until)\s*:\s*(.+?)\s*(?:@\s*(.+?))?\s*$/i);
			if (!m) return;
			const result = evaluate(plugin, m[1].toLowerCase(), m[2], m[3]);
			if (!result) return;
			const span = el("span", { cls: "chronicle-inline" + (result.error ? " is-error" : ""), text: result.text, attr: { title: `${code.textContent}${result.error ? `\n${result.error}` : ""}` } });
			if (result.key) {
				const key = result.key;
				span.addClass("is-link");
				span.addEventListener("click", (evt) => openEntity(plugin, key, evt));
				plugin.hoverCards?.attach(span, key);
			}
			code.replaceWith(span);
		});
	};
}

function evaluate(plugin: ChroniclePlugin, op: string, name: string, atText?: string): { text: string; key?: string; error?: string } | null {
	const e = plugin.index.findByName(name.replace(/^\[\[|\]\]$/g, ""));
	if (!e) return { text: `? ${name}`, error: `No note called “${name}”` };
	const cal = plugin.calendars.get(e.calendar);
	let at: ChronDate | null | undefined;
	if (atText) {
		const other = plugin.index.findByName(atText.replace(/^\[\[|\]\]$/g, ""));
		at = other?.start ?? plugin.parseDate(atText, cal.id);
		if (!at) return { text: `? ${atText}`, error: `Couldn't read the date “${atText}”` };
	}
	const yearsBetween = (a: number, b: number) => Math.floor((b - a) / YEAR);
	switch (op) {
		case "age": {
			if (!e.start) return { text: "age unknown", key: e.key, error: `${e.name} has no birth date` };
			const day = at?.start ?? e.end?.start;
			if (day === undefined) return { text: "?", key: e.key, error: "Give a date: `age: Name @ date`" };
			if (e.end && day > e.end.end) return { text: `died aged ${yearsBetween(e.start.start, e.end.start)}`, key: e.key };
			return { text: String(yearsBetween(e.start.start, day)), key: e.key };
		}
		case "born":
		case "when":
			return e.start ? { text: formatDate(e.start, cal), key: e.key } : { text: "date unknown", key: e.key };
		case "died":
		case "until":
			return e.end ? { text: formatDate(e.end, cal), key: e.key } : { text: "—", key: e.key };
		case "span":
			return { text: formatSpan(e.start, e.end, cal) || "dates unknown", key: e.key };
		case "since": {
			if (!e.start) return { text: "?", key: e.key, error: `${e.name} has no date` };
			if (!at) return { text: "?", key: e.key, error: "Give a date: `since: Event @ date`" };
			const y = yearsBetween(e.start.start, at.start);
			return { text: `${y} year${y === 1 ? "" : "s"}`, key: e.key };
		}
	}
	return null;
}

// ---- Continuity check for one chapter ----------------------------------------------------------------

/** The continuity checks for the open story note (or all of them). */
export class ContinuityModal extends Modal {
	constructor(private plugin: ChroniclePlugin, private path?: string) {
		super(plugin.app);
	}

	onOpen() {
		this.containerEl.addClass("chronicle-scope-host");
		this.modalEl.addClass("chronicle-scope", "chronicle-tool-modal");
		const idx = this.plugin.index;
		const scene = idx.scenes.find((s) => s.path === this.path);
		this.titleEl.setText(scene ? `Continuity: ${scene.name}` : "Story continuity");
		if (this.path && !scene) {
			el("div", { cls: "chronicle-dash-muted", text: "This note isn't a story note yet. Give it `story-date: SE 20` (the date it happens in the world), `characters: [[A]], [[B]]` and `setting: [[Place]]`." }, this.contentEl);
			return;
		}
		const issues: { path: string; name: string; message: string }[] = [];
		continuity(idx, (path, name, _sev, message) => issues.push({ path, name, message }));
		const mine = scene ? issues.filter((i) => i.path === scene.path) : issues;
		if (scene) {
			const cal = this.plugin.calendars.get(scene.date.calendar);
			const info = el("div", { cls: "chronicle-dash-muted" }, this.contentEl);
			info.setText(`Set ${formatDate(scene.date, cal)}${scene.places.length ? ` in ${scene.places.map((p) => p.name).join(", ")}` : ""}. Ages then: ${scene.cast.map((c) => {
				const p = idx.get(c.key);
				return p?.start ? `${p.name} ${Math.floor((scene.date.start - p.start.start) / YEAR)}` : c.name;
			}).join(", ") || "no characters listed"}.`);
		}
		el("div", { cls: "chronicle-kin-answer", text: mine.length ? `${mine.length} thing${mine.length === 1 ? "" : "s"} to check` : `No problems found in ${scene ? "this chapter" : `${idx.scenes.length} story notes`}.` }, this.contentEl);
		for (const i of mine) {
			const row = el("button", { cls: "chronicle-dash-rel is-warning" }, this.contentEl);
			el("span", { cls: "chronicle-dash-rel-name", text: i.name }, row);
			el("span", { cls: "chronicle-dash-rel-note", text: i.message }, row);
			row.addEventListener("click", () => {
				this.close();
				const f = this.app.vault.getAbstractFileByPath(i.path);
				if (f instanceof TFile) void this.app.workspace.getLeaf(false).openFile(f);
			});
		}
	}

	onClose() {
		this.contentEl.empty();
	}
}

// ---- Story prompts ---------------------------------------------------------------------------------------

export class PromptsModal extends Modal {
	constructor(private plugin: ChroniclePlugin, private world?: string) {
		super(plugin.app);
	}

	onOpen() {
		this.containerEl.addClass("chronicle-scope-host");
		this.modalEl.addClass("chronicle-scope", "chronicle-tool-modal");
		this.titleEl.setText("Story ideas from your world");
		const list = el("div", {}, this.contentEl);
		const show = () => {
			list.empty();
			const fmt = (d: number, c: string) => {
				const cal = this.plugin.calendars.get(c);
				return formatDate({ start: d, end: d, precision: "year", approx: false, calendar: cal.id, raw: "" }, cal);
			};
			const ps = storyPrompts(this.plugin.index, this.world, fmt);
			if (!ps.length) el("div", { cls: "chronicle-dash-muted", text: "Not enough to go on yet: rivalries (`related-cultures` with `kind: rival`), rulers with dates and children, and dated events all give ideas." }, list);
			for (const p of ps) {
				const card = el("div", { cls: "chronicle-prompt-card" }, list);
				el("div", { cls: "chronicle-prompt-title", text: p.title }, card);
				el("div", { cls: "chronicle-prompt-text", text: p.text }, card);
				const b = el("button", { text: "Make it an event" }, card);
				b.addEventListener("click", () => {
					this.close();
					const date = p.day !== undefined && p.calendar ? fmt(p.day, p.calendar) : undefined;
					this.plugin.createEntityPrompt({ type: p.kind === "settle" ? "place" : "event", name: p.title.replace(/\?$/, ""), date, participants: p.people, places: p.places, cultures: p.cultures });
				});
			}
		};
		show();
		new Setting(this.contentEl).addButton((b) => b.setButtonText("Other ideas").onClick(show));
	}

	onClose() {
		this.contentEl.empty();
	}
}

export type { Entity };
