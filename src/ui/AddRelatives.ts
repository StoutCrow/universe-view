import { Menu, Modal, Notice, TFile } from "obsidian";
import type UniverseViewPlugin from "../main";
import type { Entity } from "../types";
import { addSubmenu, el } from "../render/common";
import { buildFieldAliases } from "../settings";
import { addKinChildren, addKinPartner, addLinks, kinLines, parseNames } from "../index/relatives";
import { PARENT_KINDS, PARTNER_KINDS, parseDetails, splitDetails, tieLabel } from "../index/ties";
import { LinkList } from "./CreateEntityModal";

export type RelativeKind = "parents" | "children" | "partners" | "siblings";

/** Someone to add relatives to: a person with a note, or a relative with no note yet (a card marked "Not created yet"). */
export type RelTarget = Entity | { key: string; name: string };
const hasNote = (t: RelTarget): t is Entity => "file" in t;

const KINDS: { id: RelativeKind; label: string; own: string; ghost: string }[] = [
	{ id: "parents", label: "Parents", own: "Written on this person.", ghost: "Written as a family line (up to two parents)." },
	{ id: "children", label: "Children", own: "Written on this person.", ghost: "Written as a family line, with their partner when they have one." },
	{ id: "partners", label: "Partners", own: "Written on this person.", ghost: "Written as a family line." },
	{ id: "siblings", label: "Siblings", own: "Written on their parents' notes, so they need a parent with a note.", ghost: "Written under their parents, so they need a parent already in the tree." },
];

/** Names for the menu: what each kind of relative is called, in the singular. */
const ONE: Record<RelativeKind, string> = { parents: "Parent", children: "Child", partners: "Partner", siblings: "Sibling" };

/**
 * The "Add relative" entries of a right-click menu, the same on a person and on a relative with no note: add by name
 * (no notes are made), or start a new note for a child or parent.
 */
export function relativeMenu(menu: Menu, plugin: UniverseViewPlugin, target: RelTarget, section?: string) {
	addSubmenu(menu, "Add by name", "users-round", (m) => {
		for (const k of KINDS) m.addItem((i) => i.setTitle(`${ONE[k.id]}…`).onClick(() => new AddRelativesModal(plugin, target, k.id).open()));
	}, "Add relative", section);
	if (hasNote(target)) {
		addSubmenu(menu, "New note for", "file-plus", (m) => {
			m.addItem((i) => i.setTitle("Child…").onClick(() => plugin.createEntityPrompt({ type: "person", parents: [target.name] })));
			m.addItem((i) => i.setTitle("Parent…").onClick(() => plugin.createEntityPrompt({ type: "person", childOf: target.key })));
		}, "New note", section);
	}
}

/** Whether a typed name carries details a link cannot hold: a gender, dates or custom text. */
function hasDetails(name: string): boolean {
	const { inside } = splitDetails(name);
	if (!inside) return false;
	const d = parseDetails(inside, [...PARTNER_KINDS, ...PARENT_KINDS]);
	return !!(d.gender || d.span || d.label);
}

/**
 * Grows the tree by names. Nobody gets a note: a name becomes a link on a note that already exists (or, for relatives
 * of a relative with no note, a family line on the note that mentions them), and the tree draws a card marked "Not
 * created yet". Clicking that card offers to write the note when there's something to say.
 * A name that matches someone already in the vault links to them.
 *
 * Quick: pick who they are to this person, type names, press Enter. Optionally detailed: put brackets after a name
 * (`Carol (f, 1230 – 1290, "the clever one")`) for gender, dates and a note of your own; those go in a family line,
 * because a link cannot hold them. For partners and parents, the "How" box says what kind of tie it is.
 */
export class AddRelativesModal extends Modal {
	private kind: RelativeKind;
	/** The kind of tie chosen in the "How" box: spouse, step… ("" for the ordinary one). */
	private how = "";
	/** Ghost: typed names, no notes. Noted: links to people who have a note. */
	private mode: "ghost" | "noted" = "ghost";

	private focusInput(area: HTMLTextAreaElement, picked: LinkList) {
		if (this.mode === "noted") picked.focus();
		else area.focus();
	}

	constructor(private plugin: UniverseViewPlugin, private person: RelTarget, kind: RelativeKind = "children") {
		super(plugin.app);
		this.kind = kind;
	}

	onOpen() {
		this.containerEl.addClass("universeview-scope-host");
		this.modalEl.addClass("universeview-scope");
		this.titleEl.setText(`Add relatives of ${this.person.name}`);
		const ghost = !hasNote(this.person);
		// Two ways to add: Ghost (a name only, drawn as a "Not created yet" card) or Noted (a link to a person's note).
		const modes = el("div", { cls: "uv-subtabs uv-rel-modes", attr: { role: "tablist" } }, this.contentEl);
		const kinds = el("div", { cls: "uv-rel-kinds" }, this.contentEl);
		const note = el("p", { cls: "setting-item-description" }, this.contentEl);
		const howRow = el("label", { cls: "uv-rel-how" }, this.contentEl);
		const howName = el("span", {}, howRow);
		const howSel = el("select", { cls: "dropdown" }, howRow);
		const area = el("textarea", { cls: "uv-rel-names", attr: { rows: "5", placeholder: "One name per line. Enter adds them." } }, this.contentEl);
		const pickBox = el("div", { cls: "uv-rel-pick" }, this.contentEl);
		const self = this.person.key;
		const picked = new LinkList(pickBox, this.plugin, ["person"], [], "Type a person's name…", false, undefined, [], (e) => e.key !== self);
		const more = el("details", { cls: "uv-rel-more" }, this.contentEl);
		el("summary", { text: "Add detail" }, more);
		el("p", { cls: "setting-item-description", text: "Put brackets after a name for more: a gender (f or m), dates, and a note of your own in quotes. For example Carol (f, 1230 – 1290, \"the clever one\"). These are kept in a family line on the note, and the card shows them." }, more);
		const buttons = el("div", { cls: "modal-button-container" }, this.contentEl);
		const ok = el("button", { cls: "mod-cta", text: "Add" }, buttons);
		const again = el("button", { text: "Add and add more" }, buttons);
		el("button", { text: "Cancel" }, buttons).addEventListener("click", () => this.close());
		const chips: Record<string, HTMLElement> = {};
		const modeTabs: Record<string, HTMLElement> = {};
		for (const [id, label] of [["ghost", "Ghost"], ["noted", "Noted"]] as const) {
			const tab = (modeTabs[id] = el("button", { cls: "uv-subtab", text: label, attr: { role: "tab", title: id === "ghost" ? "Just a name, with no note: shown as a card marked “Not created yet”" : "A link to a person who has a note" } }, modes));
			tab.addEventListener("click", () => {
				this.mode = id;
				paint();
				this.focusInput(area, picked);
			});
		}
		const paint = () => {
			for (const k of KINDS) {
				chips[k.id].toggleClass("is-active", k.id === this.kind);
				chips[k.id].setAttribute("aria-pressed", String(k.id === this.kind));
			}
			for (const [id, tab] of Object.entries(modeTabs)) {
				tab.toggleClass("is-on", id === this.mode);
				tab.setAttribute("aria-selected", String(id === this.mode));
			}
			const noted = this.mode === "noted";
			area.toggleClass("is-hidden", noted);
			more.toggleClass("is-hidden", noted);
			pickBox.toggleClass("is-hidden", !noted);
			const k = KINDS.find((x) => x.id === this.kind);
			note.setText(noted
				? `Pick people who have a note; each becomes a link. ${ghost ? k?.ghost : k?.own}`
				: `No notes are made. ${ghost ? k?.ghost : k?.own} Each name shows in the tree as a card you can write up later.`);
			// How they are tied: partners (spouse, betrothed…) and parents (step, foster…).
			const options = this.kind === "partners" ? PARTNER_KINDS : this.kind === "parents" ? PARENT_KINDS.filter((x) => x !== "birth") : [];
			howRow.toggleClass("is-hidden", !options.length);
			howName.setText(this.kind === "partners" ? "They are" : "Parent by");
			howSel.empty();
			howSel.add(new Option(this.kind === "partners" ? "Not said" : "Birth", ""));
			for (const o of options) howSel.add(new Option(tieLabel(o, this.kind === "partners" ? "partner" : "parent"), o));
			this.how = "";
			howSel.value = "";
		};
		for (const k of KINDS) {
			chips[k.id] = el("button", { cls: "universeview-chip", text: k.label }, kinds);
			chips[k.id].addEventListener("click", () => {
				this.kind = k.id;
				paint();
				this.focusInput(area, picked);
			});
		}
		howSel.addEventListener("change", () => (this.how = howSel.value));
		paint();
		/** What to add: the typed names, or the picked people (only those with a note). */
		const names = (): string | null => {
			if (this.mode === "ghost") return area.value;
			const all = picked.collect();
			const unknown = all.filter((n) => !this.plugin.index.findByName(n));
			if (unknown.length) {
				new Notice(`No note for ${unknown.join(", ")}. Pick people from the suggestions, or add them on the Ghost tab.`);
				return null;
			}
			return all.join("\n");
		};
		const go = async (keepOpen = false) => {
			const text = names();
			if (text === null) return;
			if (!(await this.submit(text, keepOpen))) return;
			area.value = "";
			picked.clear();
			this.focusInput(area, picked);
		};
		ok.addEventListener("click", () => void go());
		again.addEventListener("click", () => void go(true));
		// Enter adds; Shift+Enter makes a new line.
		area.addEventListener("keydown", (evt) => {
			if (evt.key === "Enter" && !evt.shiftKey && !evt.isComposing) {
				evt.preventDefault();
				void this.submit(area.value);
			}
		});
		window.setTimeout(() => area.focus(), 30);
	}

	/** Adds the typed names. Returns whether anything was written (so "add more" knows to clear the box). */
	private async submit(text: string, keepOpen = false): Promise<boolean> {
		const names = parseNames(text);
		if (!names.length) return false;
		const p = this.plugin;
		const idx = p.index;
		const fileOf = (key: string) => {
			const f = p.app.vault.getAbstractFileByPath(key);
			return f instanceof TFile ? f : undefined;
		};
		const label = `Add ${names.length} ${this.kind === "siblings" ? "sibling" : this.kind.replace(/s$/, "")}${names.length === 1 ? "" : "s"}`;
		const person = this.person;
		if (!hasNote(person)) {
			return this.submitForGhost(person, names, label, keepOpen);
		}
		// Names with details go in a family line (a link cannot hold a gender or dates); the rest are links.
		const detailed = names.filter(hasDetails);
		const plain = names.filter((n) => !hasDetails(n));
		let added = 0;
		const tie = this.how ? ` (${this.how})` : "";
		const link = (name: string) => {
			const clean = splitDetails(name).name;
			const found = idx.findByName(clean);
			return `[[${found ? found.key.split("/").pop()!.replace(/\.md$/i, "") : clean}]]${tie}`;
		};
		const aliases = buildFieldAliases(p.settings.fieldAliases);
		if (plain.length) {
			const links = plain.map(link);
			let targets: { file: TFile; field: "parents" | "children" | "partners" }[];
			if (this.kind === "siblings") {
				targets = person.parents.map((r) => fileOf(r.key)).filter((f): f is TFile => !!f).map((file) => ({ file, field: "children" as const }));
				if (!targets.length) {
					new Notice(`${person.name} has no parent with a note yet. Add a parent first, then their siblings.`);
					return false;
				}
			} else {
				const file = fileOf(person.key);
				if (!file) return false;
				targets = [{ file, field: this.kind }];
			}
			for (const t of targets) {
				await p.editFrontmatter(t.file, (front) => {
					added = Math.max(added, addLinks(front, aliases[t.field], p.fieldName(t.field), links));
				}, label);
			}
		}
		if (detailed.length) added += await this.writeLines(person, detailed, label);
		if (!keepOpen) this.close();
		new Notice(added ? `Added ${added} to ${person.name}'s tree. Click a "Not created yet" card to write one up.` : "They were all there already.");
		return true;
	}

	/** Family lines on a person's own note, for relatives who carry details. */
	private async writeLines(person: Entity, typed: string[], label: string): Promise<number> {
		const p = this.plugin;
		const file = p.app.vault.getAbstractFileByPath(person.key);
		if (!(file instanceof TFile)) return 0;
		const parents = p.index.parentsOf(person.key).map((r) => r.name);
		let added = 0;
		await p.editFrontmatter(file, (front) => {
			const prop = "kin" in front && !("relatives" in front) ? "kin" : "relatives";
			const lines = kinLines(front[prop]);
			if (this.kind === "children") added = addKinChildren(lines, [person.name], typed);
			else if (this.kind === "parents") for (const n of typed) added += addKinChildren(lines, [n], [person.name]);
			else if (this.kind === "partners") for (const n of typed) added += addKinPartner(lines, person.name, n, this.how || undefined);
			else if (parents.length) added = addKinChildren(lines, parents.slice(0, 2), typed);
			if (added) front[prop] = lines;
		}, label);
		return added;
	}

	/**
	 * Relatives of a relative with no note: there is no note to write on, so each goes into a family line (`relatives:`)
	 * on the note that mentions them.
	 */
	private async submitForGhost(person: { key: string; name: string }, typed: string[], label: string, keepOpen: boolean): Promise<boolean> {
		const p = this.plugin;
		const idx = p.index;
		const anchor = idx.kinAnchor(person.key);
		const file = anchor && p.app.vault.getAbstractFileByPath(anchor.key);
		if (!anchor || !(file instanceof TFile)) {
			new Notice(`No note mentions ${person.name} yet, so there is nowhere to write this. Write ${person.name} up as a note first.`);
			return false;
		}
		// A name matching a note in the vault means that person (and the details have nothing to add).
		const names = typed.map((n) => idx.findByName(splitDetails(n).name)?.name ?? n);
		const me = idx.ghostName(person.key) ?? person.name;
		const parents = idx.parentsOf(person.key).map((r) => r.name);
		const partners = idx.partners(person.key).map((x) => x.ref.name);
		if (this.kind === "siblings" && !parents.length) {
			new Notice(`${person.name} has no parent in the tree yet. Add a parent first, then their siblings.`);
			return false;
		}
		let added = 0;
		await p.editFrontmatter(file, (front) => {
			const prop = "kin" in front && !("relatives" in front) ? "kin" : "relatives";
			const lines = kinLines(front[prop]);
			if (this.kind === "children") added = addKinChildren(lines, partners.length === 1 ? [me, partners[0]] : [me], names);
			else if (this.kind === "parents") {
				if (names.length >= 2) added += addKinChildren(lines, [names[0], names[1]], [me]);
				else added += addKinChildren(lines, [names[0]], [me]);
				for (const extra of names.slice(2)) added += addKinChildren(lines, [extra], [me]);
			} else if (this.kind === "partners") for (const n of names) added += addKinPartner(lines, me, n, this.how || undefined);
			else added = addKinChildren(lines, parents.slice(0, 2), names);
			if (added) front[prop] = lines;
		}, label);
		if (!keepOpen) this.close();
		new Notice(added ? `Added ${added} to the tree, written on ${anchor.name}'s note. Click a "Not created yet" card to write one up.` : "They were all there already.");
		return true;
	}

	onClose() {
		this.contentEl.empty();
	}
}
