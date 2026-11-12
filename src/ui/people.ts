import { Modal, Notice, Setting, TFile } from "obsidian";
import type UniverseViewPlugin from "../main";
import type { Entity } from "../types";
import { formatDate, formatSpan } from "../dates/parser";
import { activeAt } from "../index/EntityIndex";
import { type KinGraph, relationship } from "../index/kinship";
import { lineOfSuccession, RULE_NAMES, type SuccessionRule } from "../index/succession";
import { SOLE_ROLE } from "../index/validate";
import { generateNames, givenNames, trainNames } from "../index/names";
import { TYPE_ICONS, el, entityColor, icon, openEntity } from "../render/common";
import { EntityInputSuggest } from "./suggest";
import { suggestionPool } from "./CreateEntityModal";
import { asText } from "../index/text";

const YEAR = 365.25;

/** The family as the kinship and succession helpers see it. */
export function kinGraph(plugin: UniverseViewPlugin): KinGraph {
	const idx = plugin.index;
	return {
		parents: (k) => (idx.get(k)?.parents ?? []).map((r) => r.key),
		partners: (k) => idx.partners(k).map((p) => p.ref.key),
		gender: (k) => {
			const g = idx.get(k)?.gender ?? "";
			return /^m/i.test(g) ? "m" : /^f/i.test(g) ? "f" : undefined;
		},
		partnerKind: (a, b) => idx.partners(a).find((p) => p.ref.key === b)?.kind,
	};
}

function personRow(plugin: UniverseViewPlugin, parent: HTMLElement, e: Entity, note?: string, close?: () => void) {
	const row = el("button", { cls: "universeview-dash-rel" }, parent);
	row.style.setProperty("--row-color", entityColor(plugin, e));
	const ic = el("span", { cls: "universeview-dash-rel-icon" }, row);
	icon(ic, TYPE_ICONS[e.type]);
	el("span", { cls: "universeview-dash-rel-name", text: e.name }, row);
	if (note) el("span", { cls: "universeview-dash-rel-note", text: note }, row);
	row.addEventListener("click", (evt) => {
		close?.();
		openEntity(plugin, e.key, evt);
	});
	plugin.hoverCards?.attach(row, e.key);
	return row;
}

export function pickerSetting(plugin: UniverseViewPlugin, parent: HTMLElement, label: string, types: Entity["type"][], initial: string | undefined, onPick: (key: string) => void) {
	new Setting(parent).setName(label).addText((t) => {
		t.setPlaceholder("Name…");
		if (initial) t.setValue(plugin.index.get(initial)?.name ?? "");
		new EntityInputSuggest(plugin.app, t.inputEl, plugin, types, (e) => {
			t.setValue(e.name);
			onPick(e.key);
		});
	});
}

// ---- How are they related? -----------------------------------------------------------------------

export class KinshipModal extends Modal {
	private a?: string;
	private b?: string;
	private out!: HTMLElement;

	constructor(private plugin: UniverseViewPlugin, a?: string, b?: string) {
		super(plugin.app);
		this.a = a;
		this.b = b;
	}

	onOpen() {
		this.containerEl.addClass("universeview-scope-host");
		this.modalEl.addClass("universeview-scope", "universeview-tool-modal");
		this.titleEl.setText("How are they related?");
		pickerSetting(this.plugin, this.contentEl, "Person", ["person"], this.a, (k) => {
			this.a = k;
			this.show();
		});
		pickerSetting(this.plugin, this.contentEl, "And", ["person"], this.b, (k) => {
			this.b = k;
			this.show();
		});
		this.out = el("div", { cls: "universeview-kin-result" }, this.contentEl);
		this.show();
	}

	private show() {
		const out = this.out;
		out.empty();
		const idx = this.plugin.index;
		const a = idx.get(this.a);
		const b = idx.get(this.b);
		if (!a || !b) {
			el("div", { cls: "universeview-dash-muted", text: "Pick two people." }, out);
			return;
		}
		const r = relationship(kinGraph(this.plugin), a.key, b.key);
		if (!r) {
			el("div", { cls: "universeview-kin-answer", text: `No family connection found between ${a.name} and ${b.name}.` }, out);
			el("div", { cls: "universeview-dash-muted", text: "Only parents and partners written in the notes are followed." }, out);
			return;
		}
		const answer = el("div", { cls: "universeview-kin-answer" }, out);
		el("strong", { text: b.name }, answer);
		answer.append(` is ${a.name}'s `);
		el("strong", { text: r.label }, answer);
		el("div", { cls: "universeview-dash-muted", text: r.blood ? "By blood, through:" : "By marriage, through:" }, out);
		const path = el("div", { cls: "universeview-kin-path" }, out);
		r.path.forEach((k, i) => {
			const e = idx.get(k);
			if (!e) return;
			if (i) el("span", { cls: "universeview-kin-arrow", text: "→" }, path);
			personRow(this.plugin, path, e, formatSpan(e.start, e.end, this.plugin.calendars.get(e.calendar)) || undefined, () => this.close());
		});
		// The common ancestor: the person in the path both neighbours descend from.
		const common = r.path.find((k, i) => i > 0 && i < r.path.length - 1 && idx.get(r.path[i - 1])?.parents.some((p) => p.key === k) && idx.get(r.path[i + 1])?.parents.some((p) => p.key === k));
		new Setting(out).addButton((btn) =>
			btn.setButtonText("Show in the family tree").setCta().onClick(() => {
				this.close();
				const top = common ?? (r.blood ? r.path[0] : a.key);
				const depth = Math.min(6, Math.max(1, r.path.length));
				void this.plugin.activateView("chronicle-family", { options: { root: top, up: 1, down: depth, siblings: true, layout: "tree" } });
			}),
		);
	}

	onClose() {
		this.contentEl.empty();
	}
}

// ---- Line of succession --------------------------------------------------------------------------

/** Who holds a group's top role on a day (the latest to take it up). */
export function holderAt(plugin: UniverseViewPlugin, cultureKey: string, day: number): Entity | undefined {
	const idx = plugin.index;
	let best: { e: Entity; from: number } | undefined;
	for (const m of idx.members(cultureKey)) {
		const p = idx.get(m.key);
		if (!p || p.type !== "person" || !SOLE_ROLE.test((m.link.role ?? "").trim()) || !activeAt(m.link, day) || !idx.existsAt(p, day)) continue;
		const from = m.link.from?.start ?? -Infinity;
		if (!best || from > best.from) best = { e: p, from };
	}
	return best?.e;
}

export class SuccessionModal extends Modal {
	private holder?: string;
	private culture?: string;
	private day?: number;
	private rule: SuccessionRule;
	private out!: HTMLElement;

	constructor(private plugin: UniverseViewPlugin, key?: string) {
		super(plugin.app);
		const e = plugin.index.get(key);
		if (e?.type === "culture") this.culture = e.key;
		else if (e?.type === "person") this.holder = e.key;
		const ruleProp = asText(e?.props.succession ?? "").toLowerCase();
		this.rule = (Object.keys(RULE_NAMES) as SuccessionRule[]).find((r) => ruleProp.includes(r.split("-")[0])) ?? (e ? plugin.index.worldFor(e.path)?.succession : undefined) ?? plugin.settings.successionRule;
	}

	onOpen() {
		this.containerEl.addClass("universeview-scope-host");
		this.modalEl.addClass("universeview-scope", "universeview-tool-modal");
		this.titleEl.setText("Line of succession");
		const idx = this.plugin.index;
		let ruleDrop: { setValue: (v: string) => unknown } | undefined;
		pickerSetting(this.plugin, this.contentEl, "Of the group (optional)", ["culture"], this.culture, (k) => {
			this.culture = k;
			// A group that says how it inherits uses that.
			const own = this.groupRule(k);
			if (own) {
				this.rule = own;
				ruleDrop?.setValue(own);
			}
			this.show();
		});
		pickerSetting(this.plugin, this.contentEl, "Or after this person", ["person"], this.holder, (k) => {
			this.holder = k;
			this.culture = undefined;
			this.show();
		});
		const anchor = idx.get(this.holder ?? this.culture);
		const cal = this.plugin.calendars.get(anchor?.calendar);
		new Setting(this.contentEl).setName("On").setDesc("A date (blank = the holder's death, or today's latest record)").addText((t) => {
			t.setPlaceholder("E.g. SE 40");
			t.inputEl.addEventListener("change", () => {
				const d = t.getValue().trim() ? this.plugin.parseDate(t.getValue(), cal.id) : null;
				this.day = d ? d.end : undefined;
				this.show();
			});
		});
		const ruleSetting = new Setting(this.contentEl).setName("Rule").setDesc("How this group inherits. Remember it to save `succession:` on the group's note.").addDropdown((d) => {
			ruleDrop = d;
			for (const [k, v] of Object.entries(RULE_NAMES)) d.addOption(k, v);
			d.setValue(this.rule).onChange((v) => {
				this.rule = v as SuccessionRule;
				this.show();
			});
		});
		ruleSetting.addButton((b) => b.setButtonText("Remember for this group").onClick(() => {
			const group = this.plugin.index.get(this.culture);
			const file = group && this.plugin.app.vault.getAbstractFileByPath(group.path);
			if (!group || !(file instanceof TFile)) {
				new Notice("Pick the group first.");
				return;
			}
			void this.plugin.editFrontmatter(file, (f) => {
				f.succession = this.rule;
			}, `Succession for ${group.name}`).then(() => new Notice(`${group.name} now inherits: ${RULE_NAMES[this.rule].toLowerCase()}.`));
		}));
		this.out = el("div", { cls: "universeview-kin-result" }, this.contentEl);
		this.show();
	}

	/** The rule written on a group's note (`succession: male-preference`), if any. */
	private groupRule(key?: string): SuccessionRule | undefined {
		const prop = asText(this.plugin.index.get(key)?.props.succession ?? "").toLowerCase();
		return prop ? (Object.keys(RULE_NAMES) as SuccessionRule[]).find((r) => prop.includes(r.split("-")[0])) : undefined;
	}

	private show() {
		const out = this.out;
		out.empty();
		const idx = this.plugin.index;
		let holder = idx.get(this.holder);
		let day = this.day;
		if (this.culture) {
			// The latest recorded date for the group, if none was given.
			const c = idx.get(this.culture)!;
			day ??= Math.max(...idx.members(c.key).map((m) => m.link.from?.start ?? -Infinity), c.start?.start ?? -Infinity);
			holder = Number.isFinite(day) ? holderAt(this.plugin, c.key, day) : undefined;
			if (!holder) {
				el("div", { cls: "universeview-dash-muted", text: `No one holds a top role (king, head, grand master…) in ${c.name} on that date. Give members a role and a \`from:\` date.` }, out);
				return;
			}
		}
		if (!holder) {
			el("div", { cls: "universeview-dash-muted", text: "Pick a group or a person." }, out);
			return;
		}
		day ??= holder.end?.end ?? Math.max(...idx.all("person").map((p) => p.start?.start ?? -Infinity));
		const graph = kinGraph(this.plugin);
		const heirs = lineOfSuccession({
			children: (k) => idx.children(k, false),
			parents: (k) => graph.parents(k),
			born: (k) => idx.get(k)?.start?.start,
			died: (k) => idx.get(k)?.end?.end,
			gender: (k) => graph.gender(k),
		}, holder.key, day, this.rule);
		const cal = this.plugin.calendars.get(holder.calendar);
		el("div", { cls: "universeview-kin-answer", text: `After ${holder.name}, on ${formatDate({ start: day, end: day, precision: "day", approx: false, calendar: cal.id, raw: "" }, cal)}:` }, out);
		if (!heirs.length) el("div", { cls: "universeview-dash-muted", text: "No living relatives found in the family tree." }, out);
		const list = el("ol", { cls: "universeview-succession" }, out);
		for (const h of heirs) {
			const e = idx.get(h.key)!;
			const li = el("li", {}, list);
			li.style.setProperty("--depth", String(h.depth - 1));
			const age = e.start ? Math.floor((day - e.start.start) / YEAR) : undefined;
			const rel = relationship(graph, holder.key, e.key)?.label;
			personRow(this.plugin, li, e, [rel, age !== undefined ? `aged ${age}` : undefined].filter(Boolean).join(" · "), () => this.close());
		}
	}

	onClose() {
		this.contentEl.empty();
	}
}

// ---- Name ideas --------------------------------------------------------------------------------------

export class NamesModal extends Modal {
	private group?: string;
	private type: "person" | "place" | "culture" = "person";
	private out!: HTMLElement;
	/** Top-level folder to learn from ("" = the whole vault), so one world's names don't mix with another's. */
	private world = "";

	constructor(private plugin: UniverseViewPlugin, group?: string) {
		super(plugin.app);
		this.group = group;
		const from = this.plugin.index.get(group)?.path ?? this.plugin.app.workspace.getActiveFile()?.path ?? "";
		this.world = from.includes("/") ? from.split("/")[0] : "";
	}

	onOpen() {
		this.containerEl.addClass("universeview-scope-host");
		this.modalEl.addClass("universeview-scope", "universeview-tool-modal");
		this.titleEl.setText("Name ideas");
		new Setting(this.contentEl).setName("Names for").addDropdown((d) =>
			d.addOptions({ person: "People", place: "Places", culture: "Groups" }).setValue(this.type).onChange((v) => {
				this.type = v as typeof this.type;
				this.show();
			}),
		);
		const worlds = [...new Set(this.plugin.index.all().map((e) => (e.path.includes("/") ? e.path.split("/")[0] : "")).filter(Boolean))].sort();
		if (worlds.length > 1) {
			new Setting(this.contentEl).setName("From the world").setDesc("Learn only from this folder's names.").addDropdown((d) => {
				d.addOption("", "Whole vault");
				for (const w of worlds) d.addOption(w, w);
				d.setValue(worlds.includes(this.world) ? this.world : "").onChange((v) => {
					this.world = v;
					this.show();
				});
			});
		}
		pickerSetting(this.plugin, this.contentEl, "In the style of (optional)", ["culture"], this.group, (k) => {
			this.group = k;
			this.show();
		});
		this.out = el("div", { cls: "universeview-names" }, this.contentEl);
		new Setting(this.contentEl).addButton((b) => b.setButtonText("More").onClick(() => this.show()));
		this.show();
	}

	private show() {
		this.out.empty();
		const g = this.plugin.index.get(this.group);
		const pool = suggestionPool(this.plugin, this.type, g ? [g.name] : [], this.world || undefined);
		const names = generateNames(trainNames(this.type === "person" ? givenNames(pool) : pool), 12);
		if (names.length < 3) {
			el("div", { cls: "universeview-dash-muted", text: `Not enough ${this.type === "person" ? "people" : this.type + "s"} to learn from yet (a dozen or so helps).` }, this.out);
			return;
		}
		el("div", { cls: "universeview-dash-muted", text: `Learned from ${pool.length} names. Click one to copy it, or + to make a note.` }, this.out);
		const grid = el("div", { cls: "universeview-names-grid" }, this.out);
		for (const n of names) {
			const chip = el("div", { cls: "universeview-name-chip" }, grid);
			const copy = el("button", { cls: "universeview-name-text", text: n }, chip);
			copy.addEventListener("click", () => {
				void navigator.clipboard?.writeText(n);
				new Notice(`Copied “${n}”`);
			});
			const add = el("button", { cls: "universeview-name-add", attr: { "aria-label": `New ${this.type} called ${n}` } }, chip);
			icon(add, "plus");
			add.addEventListener("click", () => {
				this.close();
				this.plugin.createEntityPrompt({ type: this.type, name: n, cultures: g ? [g.name] : undefined });
			});
		}
	}

	onClose() {
		this.contentEl.empty();
	}
}

// ---- Who knows what -------------------------------------------------------------------------------

/** What someone knows (secrets, events) on a day, from `knows:` on them or `known-by:` on the secret. */
export class KnowledgeModal extends Modal {
	private person?: string;
	private day?: number;
	private out!: HTMLElement;

	constructor(private plugin: UniverseViewPlugin, person?: string) {
		super(plugin.app);
		this.person = person;
	}

	onOpen() {
		this.containerEl.addClass("universeview-scope-host");
		this.modalEl.addClass("universeview-scope", "universeview-tool-modal");
		this.titleEl.setText("Who knows what");
		pickerSetting(this.plugin, this.contentEl, "Person", ["person", "culture"], this.person, (k) => {
			this.person = k;
			this.show();
		});
		const cal = this.plugin.calendars.get(this.plugin.index.get(this.person)?.calendar);
		new Setting(this.contentEl).setName("On").setDesc("Blank = everything they ever learn").addText((t) => {
			t.setPlaceholder("E.g. SE 20");
			t.inputEl.addEventListener("change", () => {
				const d = t.getValue().trim() ? this.plugin.parseDate(t.getValue(), cal.id) : null;
				this.day = d ? d.end : undefined;
				this.show();
			});
		});
		this.out = el("div", { cls: "universeview-kin-result" }, this.contentEl);
		this.show();
	}

	private show() {
		this.out.empty();
		const idx = this.plugin.index;
		const p = idx.get(this.person);
		if (!p) {
			el("div", { cls: "universeview-dash-muted", text: "Pick someone. Write `knows: [[The Secret]]` on a person (with `from:` for when they learn it), or `known-by: [[Person]]` on the secret." }, this.out);
			return;
		}
		const known = idx.knowledgeOf.get(p.key) ?? [];
		const now = known.filter((k) => this.day === undefined || !k.from || k.from.start <= this.day);
		const later = known.filter((k) => !now.includes(k));
		el("div", { cls: "universeview-kin-answer", text: now.length ? `${p.name} knows about ${now.length} thing${now.length === 1 ? "" : "s"}` : `${p.name} doesn't know any recorded secrets${this.day !== undefined ? " yet" : ""}.` }, this.out);
		const cal = this.plugin.calendars.get(p.calendar);
		for (const k of now) {
			const e = idx.get(k.ref.key);
			if (e) personRow(this.plugin, this.out, e, k.from ? `since ${formatDate(k.from, cal)}` : undefined, () => this.close());
		}
		if (later.length) {
			el("div", { cls: "universeview-dash-muted", text: "Learns later:" }, this.out);
			for (const k of later) {
				const e = idx.get(k.ref.key);
				if (e) personRow(this.plugin, this.out, e, k.from ? `from ${formatDate(k.from, cal)}` : undefined, () => this.close());
			}
		}
	}

	onClose() {
		this.contentEl.empty();
	}
}
