import { Notice, TFile, TFolder } from "obsidian";
import type UniverseViewPlugin from "../main";
import type { EntityType } from "../types";
import { formatDate } from "../dates/parser";
import { EVENT_KINDS } from "../index/eventkinds";
import { namesOf } from "../index/aliases";
import { CREATOR_FIELDS, parseQuickAdd, quickAddFrontmatter, withFields, type CreatorField, type QuickAdd } from "../import/quickadd";
import { factsFromPath, standardTag, standardTagsFor, type TagSample } from "../index/tagrules";
import { factTag, kindTag, parseTag, tidyKinds } from "../index/tagscheme";
import { TYPE_ICONS, TYPE_LABELS, el, icon } from "../render/common";
import { GROUP_KINDS } from "../render/houses";
import { LinkList } from "./CreateEntityModal";
import { makeFolderNote, placementFor } from "./foldernotes";
import { SETTLEMENT_KINDS, choiceTags, standardFields, type TagChoice } from "./tagstandard";

export interface CreatorHost {
	/** The world new notes belong to. */
	world?: string;
	/** A note was made and the creator is done. */
	created(path: string): void;
	close(): void;
}

/** What to make: read from the line, or chosen. */
const CHOICES: [string, string, string, EntityType | undefined, string | undefined][] = [
	["auto", "wand-2", "Auto", undefined, undefined],
	["event", TYPE_ICONS.event, "Event", "event", undefined],
	["person", TYPE_ICONS.person, "Person", "person", undefined],
	["place", TYPE_ICONS.place, "Place", "place", undefined],
	["realm", GROUP_KINDS.realm.icon, "Realm", "culture", "realm"],
	["house", GROUP_KINDS.house.icon, "House", "culture", "house"],
	["group", GROUP_KINDS.group.icon, "Group", "culture", undefined],
];

const fileName = (name: string) => name.replace(/[\\/:*?"<>|#^[\]]/g, "-");

/**
 * The Quick creator, in the inspector. One line reads into a form of what matters for that kind of
 * note; anything can be set by hand; tags follow the vault's own standard as it fills in. Several
 * lines make several notes.
 */
export class QuickCreator {
	private text = "";
	private choice = "auto";
	private folder = "";
	private folderManual = false;
	private made: { name: string; path: string }[] = [];
	/** Lines left out of a batch, and lines whose type was changed there. */
	private skipped = new Set<string>();
	private rowType = new Map<string, EntityType>();
	/** What's been set by hand in the form. */
	private fields: Partial<Record<keyof QuickAdd, string | string[]>> = {};
	private lists = new Map<keyof QuickAdd, LinkList>();
	private tagsOff = new Set<string>();
	private tagsOwn: string[] = [];
	private std: TagChoice = { nature: "realm", tier: "6", settlement: "City", landform: "", size: "" };
	private stdUsed = false;
	/** "More about it" stays open between notes once opened. */
	private moreOpen = false;
	private samples: TagSample[] = [];
	private known: string[] = [];

	private input!: HTMLTextAreaElement;
	private chipEls = new Map<string, HTMLElement>();
	private formEl!: HTMLElement;
	private batchEl!: HTMLElement;
	private tagsEl!: HTMLElement;
	private whereHint!: HTMLElement;
	private folderInput!: HTMLInputElement;
	private unknownEl!: HTMLElement;
	private madeEl!: HTMLElement;

	constructor(private plugin: UniverseViewPlugin, private host: CreatorHost) {}

	private get cal() {
		const idx = this.plugin.index;
		return this.plugin.calendars.get(idx.dominantCalendar(this.host.world));
	}

	private parseLine(line: string, useRow = false) {
		const p = this.plugin;
		const q = parseQuickAdd(line, {
			find: (n) => {
				const e = p.index.findByName(n);
				return e ? { name: e.name, type: e.type } : undefined;
			},
			isDate: (s) => !!p.parseDate(s, this.cal.id),
		});
		const c = CHOICES.find((x) => x[0] === this.choice);
		if (c?.[3]) q.type = c[3];
		// A row's own type, changed in the batch, wins.
		const own = useRow ? this.rowType.get(line) : undefined;
		if (own) q.type = own;
		const kind = c?.[4] ?? (q.type === "culture" && /^house\b/i.test(q.name) ? "house" : undefined);
		return { q, kind };
	}

	/**
	 * One note per line. A line starting "all:" (or "each:") is added to every other line, so James's
	 * children are their names, then "all: child of James II Whitmore, of House Whitmore".
	 */
	private lines() {
		const ls = this.text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
		const shared = ls.filter((l) => /^(all|each|every)\s*:/i.test(l)).map((l) => l.replace(/^\w+\s*:\s*/, ""));
		return ls.filter((l) => !/^(all|each|every)\s*:/i.test(l)).map((l) => [l, ...shared].join(", "));
	}

	/** The note being made: the line, with the form on top. */
	private current() {
		const { q, kind } = this.parseLine(this.lines()[0] ?? "");
		return { q: withFields(q, this.fields), kind };
	}

	private placement(q: QuickAdd) {
		return placementFor(this.plugin, q.type, { cultures: q.cultures, parents: q.parents, places: q.places, locatedIn: q.type === "place" ? q.places.slice(0, 1) : [], parentCultures: q.type === "culture" ? q.cultures : [], participants: q.participants, dead: !!q.end && q.type === "person" });
	}

	private typeFolder(t: EntityType) {
		const folder = this.plugin.settings.newNoteFolders[t] ?? "";
		const world = this.host.world;
		return world && !folder.startsWith(world) ? [world, folder].filter(Boolean).join("/") : folder;
	}

	/** The land form's tags apply to places and realms, once it's been used. */
	private landTags(q: QuickAdd, kind?: string) {
		if (!this.stdUsed || (q.type !== "place" && kind !== "realm")) return [];
		// The kind already written says which settlement it is.
		const settlement = SETTLEMENT_KINDS.find((k) => k.toLowerCase() === q.kind?.toLowerCase());
		return choiceTags(settlement ? { ...this.std, settlement } : this.std, q.type);
	}

	/** Every tag this note gets, in the vault's standard. */
	private tagsFor(q: QuickAdd, kind?: string): string[] {
		const facts = [q.kind, kind, q.gender, q.occupation, q.type === "person" && q.end ? "dead" : "", ...factsFromPath(`${this.folder}/`), ...q.cultures, ...q.places].filter(Boolean) as string[];
		const land = this.landTags(q, kind);
		// Once the land form has spoken, it decides between title and region, whatever most notes are.
		const shared = standardTagsFor(q.type, facts, q.kind, this.samples).filter((t) => !land.length || !/^(title|region)$/i.test(t));
		// A vault on the tag scheme gets the note's kind and facts as scheme tags (#Character_Gender_Female).
		const scheme: string[] = [];
		if (this.plugin.settings.typeStyle === "tag" || this.known.some((t) => parseTag(t))) {
			if (!land.length) scheme.push(kindTag(q.type, q.kind || kind));
			const g = /^(m|male)$/i.test(q.gender ?? "") ? "male" : /^(f|female)$/i.test(q.gender ?? "") ? "female" : "";
			if (q.type === "person" && g) scheme.push(factTag("person", "gender", g));
			if (q.type === "person" && q.end) scheme.push(factTag("person", "status", "dead"));
		}
		const all = [...scheme, ...shared, ...land, ...q.tags, ...this.tagsOwn];
		const out = new Map(all.map((t) => standardTag(t, this.known)).map((t) => [t.toLowerCase(), t]));
		return tidyKinds([...out.values()]);
	}

	mount(parent: HTMLElement) {
		const idx = this.plugin.index;
		this.samples = idx.all().map((e) => ({ type: e.type, tags: e.tags }));
		this.known = [...new Set(this.samples.flatMap((s) => s.tags.map((t) => t.replace(/^#/, ""))))];
		const root = el("div", { cls: "uv-creator uv-quickadd" }, parent);
		const head = el("div", { cls: "uv-creator-head" }, root);
		el("h3", { text: "Quick creator" }, head);
		const close = el("button", { cls: "clickable-icon", attr: { "aria-label": "Close the creator" } }, head);
		icon(close, "x");
		close.addEventListener("click", () => this.host.close());

		const chips = el("div", { cls: "uv-quickadd-chips" }, root);
		this.chipEls.clear();
		for (const [id, ic, label] of CHOICES) {
			const b = el("button", { cls: "uv-quickadd-chip" }, chips);
			icon(el("span", {}, b), ic);
			el("span", { text: label }, b);
			b.addEventListener("click", () => {
				this.choice = id;
				if (id === "realm") {
					this.stdUsed = true;
					this.std = { ...this.std, nature: "realm", tier: this.std.tier === "6" ? "2" : this.std.tier };
				}
				this.lineChanged();
				this.input.focus();
			});
			this.chipEls.set(id, b);
		}

		this.input = el("textarea", { cls: "universeview-quickadd-input", attr: { rows: "2", placeholder: "Name, date, at Place, son of Parent, of House…" } }, root);
		this.input.value = this.text;
		const keys = el("div", { cls: "uv-quickadd-keys" }, root);
		this.unknownEl = el("div", { cls: "universeview-dash-problem" }, root);
		this.batchEl = el("div", { cls: "uv-quickadd-card" }, root);
		this.formEl = el("div", { cls: "uv-creator-form" }, root);
		this.tagsEl = el("div", { cls: "uv-creator-tags" }, root);

		// Where it goes: inside what it belongs to, or a folder typed here.
		const where = el("div", { cls: "uv-quickadd-where" }, root);
		this.whereHint = el("div", { cls: "uv-create-placement" }, where);
		const folderWrap = el("div", { cls: "universeview-create-folder" }, where);
		icon(el("span", {}, folderWrap), "folder");
		this.folderInput = el("input", { attr: { type: "text", placeholder: "Vault root", list: "uv-creator-folders", "aria-label": "Folder" } }, folderWrap);
		const dl = el("datalist", { attr: { id: "uv-creator-folders" } }, folderWrap);
		for (const f of this.plugin.app.vault.getAllLoadedFiles()) if (f instanceof TFolder && f.path !== "/") el("option", { attr: { value: f.path } }, dl);
		this.folderInput.addEventListener("input", () => {
			this.folder = this.folderInput.value;
			this.folderManual = true;
			this.refresh();
		});

		const footer = el("div", { cls: "uv-creator-footer" }, root);
		const create = el("button", { cls: "mod-cta", text: "Create" }, footer);
		const another = el("button", { text: "Create and add another" }, footer);
		const openToggle = el("label", { cls: "uv-quickadd-open" }, footer);
		const openBox = el("input", { attr: { type: "checkbox" } }, openToggle);
		openBox.checked = this.plugin.settings.quickAddOpen === true;
		el("span", { text: "Open the note too" }, openToggle);
		openBox.addEventListener("change", () => {
			this.plugin.settings.quickAddOpen = openBox.checked;
			void this.plugin.saveSettings();
		});
		const more = el("a", { cls: "uv-creator-more", text: "Relationships, colour, logo and more…" }, footer);
		more.addEventListener("click", () => this.moreOptions());
		this.madeEl = el("div", { cls: "uv-quickadd-made" }, root);
		create.addEventListener("click", () => void this.make(false));
		another.addEventListener("click", () => void this.make(true));

		this.bindInput(keys);
		this.lineChanged();
		this.showMade();
		window.setTimeout(() => this.input.focus(), 30);
	}

	private bindInput(keys: HTMLElement) {
		const { plugin, input } = this;
		const idx = plugin.index;
		// Tab finishes the name being typed from the notes you have (after a comma, "of", "at", "by"…).
		const completion = () => {
			const before = input.value.slice(0, input.selectionStart ?? input.value.length);
			const m = before.match(/^[\s\S]*(?:^|,|\n|\b(?:of|at|in|by|with|vs\.?|and|from|under|for)\b)\s*([^,\n]{2,})$/i);
			if (!m) return undefined;
			const frag = m[1].trim();
			const low = frag.toLowerCase();
			// Any name a note goes by completes to its own name, so the link finds it.
			const hit = idx.all().filter((e) => namesOf(e).some((n) => n.toLowerCase().startsWith(low) && n.length > frag.length)).sort((a, b) => a.name.length - b.name.length)[0];
			return hit ? { frag, name: hit.name, at: before.length - m[1].length + m[1].indexOf(frag) } : undefined;
		};
		const showKeys = () => {
			const c = completion();
			keys.setText(c ? `Tab: ${c.name}` : "Enter creates · Ctrl/Cmd+Enter creates and stays here · Shift+Enter for another line (one note each; “all: …” applies to every line) · ↑ for earlier lines");
			keys.toggleClass("has-completion", !!c);
		};
		const typed = () => {
			this.text = input.value;
			this.lineChanged();
		};
		let back = -1;
		input.addEventListener("input", () => {
			back = -1;
			typed();
			showKeys();
		});
		input.addEventListener("click", showKeys);
		input.addEventListener("keydown", (evt) => {
			if (evt.key === "Tab") {
				const c = completion();
				if (!c) return;
				evt.preventDefault();
				const end = input.selectionStart ?? input.value.length;
				input.value = input.value.slice(0, c.at) + c.name + input.value.slice(end);
				input.selectionStart = input.selectionEnd = c.at + c.name.length;
				typed();
				showKeys();
				return;
			}
			// Earlier lines, newest first, while the box is empty or showing one of them.
			const hist = plugin.settings.quickAddHistory ?? [];
			if ((evt.key === "ArrowUp" || evt.key === "ArrowDown") && hist.length && (!input.value || back >= 0) && !input.value.includes("\n")) {
				evt.preventDefault();
				back = evt.key === "ArrowUp" ? Math.min(hist.length - 1, back + 1) : back - 1;
				input.value = back >= 0 ? hist[back] : "";
				typed();
				return;
			}
			if (evt.key !== "Enter" || evt.shiftKey) return;
			evt.preventDefault();
			back = -1;
			void this.make(evt.ctrlKey || evt.metaKey);
		});
		showKeys();
	}

	/** The line or the type changed: the form follows it. */
	private lineChanged() {
		for (const [id, b] of this.chipEls) b.toggleClass("is-active", id === this.choice);
		const many = this.lines().length > 1;
		this.formEl.toggleClass("is-hidden", many);
		this.batchEl.toggleClass("is-empty", !many);
		if (!many) this.renderForm();
		this.refresh();
	}

	private renderForm() {
		const { q, kind } = this.current();
		this.formEl.empty();
		this.lists.clear();
		// The fields that matter come first, in columns that follow the width of the pane; the rest fold under "More about it".
		const grid = el("div", { cls: "uv-creator-grid" }, this.formEl);
		const name = this.row("Name", grid, true);
		const nameInput = el("input", { attr: { type: "text", "aria-label": "Name" } }, name);
		nameInput.value = q.name;
		const exists = el("div", { cls: "uv-quickadd-warn" }, name);
		const checkName = (v: string) => {
			const hit = v ? this.plugin.index.findByName(v) : undefined;
			exists.setText(!hit ? "" : hit.name.toLowerCase() === v.trim().toLowerCase() ? "A note with this name exists" : `${hit.name} also goes by this name`);
		};
		checkName(q.name);
		nameInput.addEventListener("input", () => {
			this.fields.name = nameInput.value;
			checkName(nameInput.value);
			this.refresh();
		});
		const fields = CREATOR_FIELDS[q.type];
		for (const f of fields.filter((x) => !x.more)) this.field(f, q, grid);
		const extra = fields.filter((x) => x.more);
		if (extra.length) {
			const more = el("details", { cls: "universeview-create-relations uv-creator-moredetails" }, this.formEl);
			// Open when asked for, or when something in it is already filled in.
			more.open = this.moreOpen || extra.some((f) => { const v = this.fields[f.key] ?? q[f.key]; return Array.isArray(v) ? v.length > 0 : !!v; });
			el("summary", { text: "More about it" }, more);
			more.addEventListener("toggle", () => (this.moreOpen = more.open));
			const moreGrid = el("div", { cls: "uv-creator-grid" }, more);
			for (const f of extra) this.field(f, q, moreGrid);
		}
		if (q.type === "place" || kind === "realm") {
			const box = el("details", { cls: "universeview-create-relations uv-create-land" }, this.formEl);
			box.open = this.stdUsed;
			el("summary", { text: "What land it is: tier and size" }, box);
			box.addEventListener("toggle", () => {
				if (!box.open) return;
				this.stdUsed = true;
				this.refresh();
			});
			standardFields(box, this.std, (c) => {
				this.std = c;
				this.stdUsed = true;
				this.refresh();
			});
		}
	}

	private row(label: string, into: HTMLElement, wide = false): HTMLElement {
		const r = el("div", { cls: "uv-creator-row" + (wide ? " is-wide" : "") }, into);
		el("label", { text: label }, r);
		return el("div", { cls: "uv-creator-value" }, r);
	}

	/** The picture names the vault has, offered as the box is typed in. */
	private imageNames(): string[] {
		return this.plugin.app.vault.getFiles().filter((f) => /^(png|jpe?g|webp|gif|svg|avif)$/i.test(f.extension)).sort((a, b) => b.stat.mtime - a.stat.mtime).slice(0, 300).map((f) => f.name);
	}

	private field(f: CreatorField, q: QuickAdd, into: HTMLElement) {
		const cell = this.row(f.label, into, f.wide);
		const value = q[f.key];
		const set = (v: string | string[]) => {
			this.fields[f.key] = v;
			this.refresh();
		};
		if (f.input === "links" || f.input === "link") {
			const single = f.input === "link";
			const start = Array.isArray(value) ? value : value ? [String(value)] : [];
			const list = new LinkList(cell, this.plugin, f.types, single ? start.slice(0, 1) : start, "Type to search…", single);
			list.onChange = () => set(Array.isArray(value) ? [...list.values] : list.values[0] ?? "");
			this.lists.set(f.key, list);
			return;
		}
		if (f.input === "choice") {
			const select = el("select", { cls: "dropdown", attr: { "aria-label": f.label } }, cell);
			for (const [v, label] of f.options ?? []) el("option", { text: label, attr: { value: v } }, select);
			select.value = String(value ?? "");
			select.addEventListener("change", () => set(select.value));
			return;
		}
		if (f.input === "color") {
			// No colour until one is picked; "None" takes it away again.
			const wrap = el("div", { cls: "uv-creator-color" + (value ? "" : " is-unset") }, cell);
			const pick = el("input", { attr: { type: "color", "aria-label": f.label } }, wrap);
			pick.value = /^#[0-9a-f]{6}$/i.test(String(value ?? "")) ? String(value) : "#7c5cff";
			const none = el("button", { cls: "uv-creator-clear", text: "None", attr: { "aria-label": `No ${f.label.toLowerCase()}` } }, wrap);
			pick.addEventListener("input", () => {
				wrap.removeClass("is-unset");
				set(pick.value);
			});
			none.addEventListener("click", () => {
				wrap.addClass("is-unset");
				set("");
			});
			return;
		}
		const input = el("input", { attr: { type: "text", "aria-label": f.label, ...(f.hint ? { placeholder: f.hint } : {}), ...(f.input === "number" ? { inputmode: "numeric" } : {}) } }, cell);
		input.value = Array.isArray(value) ? value.join(", ") : String(value ?? "");
		if (f.input === "image") {
			const id = `uv-creator-images-${f.key}`;
			input.setAttribute("list", id);
			const dl = el("datalist", { attr: { id } }, cell);
			for (const n of this.imageNames()) el("option", { attr: { value: n } }, dl);
		}
		if (f.input === "words") {
			input.addEventListener("input", () => set(input.value.split(",").map((x) => x.trim()).filter(Boolean)));
			return;
		}
		if (f.key === "kind") {
			const id = `uv-creator-kinds-${q.type}`;
			input.setAttribute("list", id);
			const dl = el("datalist", { attr: { id } }, cell);
			for (const c of new Set([...(q.type === "event" ? EVENT_KINDS.map((k) => k.key) : []), ...this.plugin.index.all(q.type).flatMap((e) => e.category ?? [])])) el("option", { attr: { value: c } }, dl);
		}
		const hint = f.input === "date" ? el("div", { cls: "uv-creator-hint" }, cell) : undefined;
		const check = () => {
			if (!hint) return;
			const v = input.value.trim();
			const d = v ? this.plugin.parseDate(v, this.cal.id) : null;
			hint.setText(!v ? "" : d ? formatDate(d, this.cal) : "Not a date yet");
			hint.toggleClass("is-bad", !!v && !d);
		};
		check();
		input.addEventListener("input", () => {
			check();
			set(input.value);
		});
	}

	/** What depends on everything: the tags, where it goes, and a batch's rows. */
	private refresh() {
		const lines = this.lines();
		const { q, kind } = this.current();
		this.unknownEl.setText(q.unknown.length && lines.length === 1 ? `Not understood: ${q.unknown.join(" · ")}` : "");
		const pl = this.text.trim() || q.name ? this.placement(q) : undefined;
		if (!this.folderManual) {
			this.folder = pl?.folder ?? this.typeFolder(q.type);
			this.folderInput.value = this.folder;
		}
		this.whereHint.empty();
		const placed = pl && this.folder === pl.folder;
		icon(el("span", {}, this.whereHint), placed ? "folder-tree" : this.folderManual ? "folder-pen" : "folder");
		el("span", { text: placed ? `Inside ${pl.under}${pl.convert ? " (made into a folder note)" : ""}${pl.folder.split("/").pop() !== pl.under ? ` › ${pl.folder.split("/").pop()}` : ""}` : this.folderManual ? "In the folder you chose" : `In the ${TYPE_LABELS[q.type].toLowerCase()} folder` }, this.whereHint);
		if (this.folderManual) {
			const reset = el("a", { cls: "uv-create-placement-reset", text: "Place it for me" }, this.whereHint);
			reset.addEventListener("click", () => {
				this.folderManual = false;
				this.refresh();
			});
		}
		this.renderTags(q, kind);
		if (lines.length > 1) this.renderBatch(lines);
	}

	private renderTags(q: QuickAdd, kind?: string) {
		const box = this.tagsEl;
		box.empty();
		el("label", { text: "Tags" }, box);
		const list = el("div", { cls: "uv-creator-tag-list" }, box);
		// In a vault that marks types with tags, this one is how the note says what it is: it always goes on.
		const s = this.plugin.settings;
		const typeTag = s.typeStyle === "tag" ? s.typeTags[q.type]?.replace(/^#/, "").toLowerCase() : undefined;
		for (const t of this.tagsFor(q, kind)) {
			const fixed = t.toLowerCase() === typeTag;
			const off = !fixed && this.tagsOff.has(t.toLowerCase());
			const isNew = !this.known.some((k) => k.toLowerCase() === t.toLowerCase());
			const chip = el("button", { cls: "uv-creator-tag" + (off ? " is-off" : "") + (isNew ? " is-new" : ""), text: `#${t}`, attr: { "aria-label": fixed ? `#${t} marks this as a ${TYPE_LABELS[q.type].toLowerCase()}` : `${off ? "Add" : "Leave off"} #${t}${isNew ? " (new to this vault)" : ""}`, "aria-pressed": String(!off) } }, list);
			chip.disabled = fixed;
			chip.addEventListener("click", () => {
				if (off) this.tagsOff.delete(t.toLowerCase());
				else this.tagsOff.add(t.toLowerCase());
				this.renderTags(q, kind);
			});
		}
		const add = el("input", { attr: { type: "text", placeholder: "Add a tag…", list: "uv-creator-known-tags", "aria-label": "Add a tag" } }, list);
		const dl = el("datalist", { attr: { id: "uv-creator-known-tags" } }, list);
		for (const t of this.known.slice(0, 300)) el("option", { attr: { value: t } }, dl);
		const commit = () => {
			const t = add.value.trim();
			if (!t) return;
			this.tagsOwn.push(t);
			this.renderTags(q, kind);
			this.tagsEl.querySelector<HTMLInputElement>("input")?.focus();
		};
		add.addEventListener("keydown", (evt) => {
			if (evt.key !== "Enter" && evt.key !== ",") return;
			evt.preventDefault();
			evt.stopPropagation();
			commit();
		});
		add.addEventListener("change", commit);
	}

	/** Several at once: one row each, with its links, where it goes, and a box to leave it out. */
	private renderBatch(many: string[]) {
		const idx = this.plugin.index;
		const box = this.batchEl;
		box.empty();
		const parsed = many.map((line) => ({ line, ...this.parseLine(line, true) }));
		const batch = new Set(parsed.filter((x) => !this.skipped.has(x.line)).map((x) => x.q.name.toLowerCase()));
		const kept = parsed.filter((x) => !this.skipped.has(x.line)).length;
		el("div", { cls: "uv-quickadd-head", text: `${kept} of ${many.length} notes` }, box);
		const TYPES: EntityType[] = ["person", "place", "event", "culture"];
		for (const { line, q, kind } of parsed) {
			const off = this.skipped.has(line);
			const row = el("div", { cls: "uv-quickadd-many" + (off ? " is-off" : "") }, box);
			const check = el("input", { attr: { type: "checkbox", "aria-label": "Make this one" } }, row);
			check.checked = !off;
			check.addEventListener("change", () => {
				if (check.checked) this.skipped.delete(line);
				else this.skipped.add(line);
				this.refresh();
			});
			icon(el("span", { cls: "uv-quickadd-icon" }, row), kind ? GROUP_KINDS[kind as keyof typeof GROUP_KINDS]?.icon ?? TYPE_ICONS[q.type] : TYPE_ICONS[q.type]);
			el("strong", { text: q.name || "(no name)" }, row);
			// Click the type to change what it makes (person → place → event → group).
			const t = el("button", { cls: "uv-quickadd-type is-switch", text: kind ?? TYPE_LABELS[q.type], attr: { title: "Click to make it another kind of note" } }, row);
			t.addEventListener("click", (evt) => {
				evt.preventDefault();
				this.rowType.set(line, TYPES[(TYPES.indexOf(q.type) + 1) % TYPES.length]);
				this.refresh();
			});
			const where = this.folderManual ? undefined : this.placement(q);
			el("span", { cls: "universeview-dash-muted uv-quickadd-folder", text: where ? `in ${where.under}` : `in ${this.folderManual ? this.folder || "the vault root" : this.typeFolder(q.type) || "the vault root"}` }, row);
			if (idx.findByName(q.name)) el("span", { cls: "uv-quickadd-warn", text: "exists" }, row);
			// How it links: to notes you have, to others in this batch, or to names with no note yet.
			const links = [...q.parents.map((n) => ["child of", n]), ...q.cultures.map((n) => ["of", n]), ...q.places.map((n) => ["at", n]), ...q.participants.map((n) => ["with", n])] as [string, string][];
			if (links.length && !off) {
				const lk = el("div", { cls: "uv-quickadd-links" }, row);
				for (const [how, n] of links) {
					const known = idx.findByName(n);
					const here = batch.has(n.toLowerCase());
					const chip = el("span", { cls: "universeview-linkchip" + (known ? "" : here ? " is-batch" : " is-unresolved"), text: `${how} ${n}` }, lk);
					chip.setAttribute("aria-label", known ? `Links to ${known.name}` : here ? "Made in this batch" : "No note yet: the link waits for one");
				}
			}
		}
	}

	private remember() {
		const p = this.plugin;
		p.settings.quickAddHistory = [this.text, ...(p.settings.quickAddHistory ?? []).filter((x) => x !== this.text)].slice(0, 30);
		void p.saveSettings();
	}

	private clear() {
		this.text = "";
		this.input.value = "";
		this.fields = {};
		this.tagsOff.clear();
		this.tagsOwn = [];
		this.stdUsed = false;
		this.skipped.clear();
		this.rowType.clear();
		this.folderManual = false;
		this.lineChanged();
		this.showMade();
		this.input.focus();
	}

	/** Writes one note, with its tags in the standard. */
	private async write(q: QuickAdd, kind: string | undefined, folder: string) {
		const p = this.plugin;
		const fm = quickAddFrontmatter(q);
		const tags = this.tagsFor(q, kind).filter((t) => !this.tagsOff.has(t.toLowerCase()));
		if (tags.length) fm.tags = tags;
		else delete fm.tags;
		if (kind) fm.__kind = kind;
		return p.createEntityNote(fileName(q.name), folder, fm, q.type, p.settings.quickAddOpen === true, true);
	}

	private async make(keepGoing: boolean) {
		const all = this.lines();
		if (all.length > 1) return this.makeMany(all);
		for (const [key, list] of this.lists) {
			const typedIn = list.collect();
			const many = CREATOR_FIELDS[this.current().q.type].find((f) => f.key === key)?.input === "links";
			if (typedIn.length) this.fields[key] = many ? [...typedIn] : typedIn[0];
		}
		const { q, kind } = this.current();
		if (!q.name.trim()) {
			new Notice("Give it a name first.");
			return;
		}
		const pl = this.placement(q);
		try {
			if (pl?.convert && this.folder === pl.folder) await makeFolderNote(this.plugin, pl.convert);
			const file = await this.write(q, kind, this.folder);
			if (this.text.trim()) this.remember();
			new Notice(`Created ${q.name} in ${file.parent?.path === "/" ? "the vault root" : file.parent?.path}`);
			if (!keepGoing) return this.host.created(file.path);
			this.made.unshift({ name: q.name, path: file.path });
			this.clear();
		} catch (err) {
			new Notice(`Couldn't create it: ${(err as Error).message}`);
		}
	}

	private async makeMany(all: string[]) {
		let n = 0;
		for (const line of all) {
			if (this.skipped.has(line)) continue;
			const { q, kind } = this.parseLine(line, true);
			if (!q.name.trim()) continue;
			const pl = this.folderManual ? undefined : this.placement(q);
			try {
				if (pl?.convert) await makeFolderNote(this.plugin, pl.convert);
				const file = await this.write(q, kind, pl?.folder ?? (this.folderManual ? this.folder : this.typeFolder(q.type)));
				this.made.unshift({ name: q.name, path: file.path });
				n++;
			} catch (err) {
				new Notice(`Couldn't create ${q.name}: ${(err as Error).message}`);
			}
		}
		this.remember();
		new Notice(`Created ${n} note${n === 1 ? "" : "s"}.`);
		this.clear();
	}

	private showMade() {
		this.madeEl.empty();
		if (!this.made.length) return;
		el("div", { cls: "universeview-dash-muted", text: "Made just now" }, this.madeEl);
		for (const m of this.made.slice(0, 8)) {
			const a = el("a", { cls: "uv-quickadd-made-item", text: m.name }, this.madeEl);
			a.addEventListener("click", () => {
				const f = this.plugin.app.vault.getAbstractFileByPath(m.path);
				if (f instanceof TFile) this.host.created(f.path);
			});
		}
	}

	/** The full window, for what the creator leaves out, with everything so far filled in. */
	private moreOptions() {
		const { q, kind } = this.current();
		this.host.close();
		this.plugin.createEntityPrompt({
			type: q.type,
			groupKind: kind === "realm" || kind === "house" ? kind : undefined,
			name: q.name,
			date: q.date,
			places: q.places,
			participants: q.participants,
			parents: q.parents,
			cultures: q.type === "culture" ? undefined : q.cultures,
			parentCultures: q.type === "culture" ? q.cultures : undefined,
			scope: this.host.world,
		});
	}
}
