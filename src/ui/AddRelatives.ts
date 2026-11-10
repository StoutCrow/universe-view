import { Menu, Modal, Notice, TFile } from "obsidian";
import type ChroniclePlugin from "../main";
import type { Entity } from "../types";
import { addSubmenu, el } from "../render/common";
import { buildFieldAliases } from "../settings";
import { addKinChildren, addKinPartner, addLinks, kinLines, parseNames } from "../index/relatives";

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
export function relativeMenu(menu: Menu, plugin: ChroniclePlugin, target: RelTarget, section?: string) {
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

/**
 * Grows the tree by names. Nobody gets a note: a name becomes a link on a note that already exists (or, for relatives
 * of a relative with no note, a family line on the note that mentions them), and the tree draws a card marked "Not
 * created yet". Clicking that card offers to write the note when there's something to say.
 * A name that matches someone already in the vault links to them.
 */
export class AddRelativesModal extends Modal {
	private kind: RelativeKind;

	constructor(private plugin: ChroniclePlugin, private person: RelTarget, kind: RelativeKind = "children") {
		super(plugin.app);
		this.kind = kind;
	}

	onOpen() {
		this.containerEl.addClass("chronicle-scope-host");
		this.modalEl.addClass("chronicle-scope");
		this.titleEl.setText(`Add relatives of ${this.person.name}`);
		const ghost = !hasNote(this.person);
		const kinds = el("div", { cls: "uv-rel-kinds" }, this.contentEl);
		const note = el("p", { cls: "setting-item-description" }, this.contentEl);
		const area = el("textarea", { cls: "uv-rel-names", attr: { rows: "6", placeholder: "One name per line" } }, this.contentEl);
		const buttons = el("div", { cls: "modal-button-container" }, this.contentEl);
		const ok = el("button", { cls: "mod-cta", text: "Add" }, buttons);
		el("button", { text: "Cancel" }, buttons).addEventListener("click", () => this.close());
		const chips: Record<string, HTMLElement> = {};
		const paint = () => {
			for (const k of KINDS) chips[k.id].toggleClass("is-on", k.id === this.kind);
			const k = KINDS.find((x) => x.id === this.kind);
			note.setText(`No notes are made. ${ghost ? k?.ghost : k?.own} Each name shows in the tree as a card you can write up later.`);
		};
		for (const k of KINDS) {
			chips[k.id] = el("button", { cls: "chronicle-chip", text: k.label }, kinds);
			chips[k.id].addEventListener("click", () => {
				this.kind = k.id;
				paint();
				area.focus();
			});
		}
		paint();
		ok.addEventListener("click", () => void this.submit(area.value));
		area.addEventListener("keydown", (evt) => {
			if (evt.key === "Enter" && (evt.ctrlKey || evt.metaKey)) void this.submit(area.value);
		});
		window.setTimeout(() => area.focus(), 30);
	}

	private async submit(text: string) {
		const names = parseNames(text);
		if (!names.length) return;
		const p = this.plugin;
		const idx = p.index;
		const fileOf = (key: string) => {
			const f = p.app.vault.getAbstractFileByPath(key);
			return f instanceof TFile ? f : undefined;
		};
		const label = `Add ${names.length} ${this.kind === "siblings" ? "sibling" : this.kind.replace(/s$/, "")}${names.length === 1 ? "" : "s"}`;
		const person = this.person;
		if (!hasNote(person)) {
			await this.submitForGhost(person, names, label);
			return;
		}
		const link = (name: string) => {
			const found = idx.findByName(name);
			return `[[${found ? found.key.split("/").pop()!.replace(/\.md$/i, "") : name}]]`;
		};
		const links = names.map(link);
		const aliases = buildFieldAliases(p.settings.fieldAliases);
		let targets: { file: TFile; field: "parents" | "children" | "partners" }[];
		if (this.kind === "siblings") {
			targets = person.parents.map((r) => fileOf(r.key)).filter((f): f is TFile => !!f).map((file) => ({ file, field: "children" as const }));
			if (!targets.length) {
				new Notice(`${person.name} has no parent with a note yet. Add a parent first, then their siblings.`);
				return;
			}
		} else {
			const file = fileOf(person.key);
			if (!file) return;
			targets = [{ file, field: this.kind }];
		}
		let added = 0;
		for (const t of targets) {
			await p.editFrontmatter(t.file, (front) => {
				added = Math.max(added, addLinks(front, aliases[t.field], p.fieldName(t.field), links));
			}, label);
		}
		this.close();
		new Notice(added ? `Added ${added} to ${person.name}'s tree. Click a "Not created yet" card to write one up.` : "They were all there already.");
	}

	/**
	 * Relatives of a relative with no note: there is no note to write on, so each goes into a family line (`relatives:`)
	 * on the note that mentions them.
	 */
	private async submitForGhost(person: { key: string; name: string }, typed: string[], label: string) {
		const p = this.plugin;
		const idx = p.index;
		const anchor = idx.kinAnchor(person.key);
		const file = anchor && p.app.vault.getAbstractFileByPath(anchor.key);
		if (!anchor || !(file instanceof TFile)) {
			new Notice(`No note mentions ${person.name} yet, so there is nowhere to write this. Write ${person.name} up as a note first.`);
			return;
		}
		// A name matching a note in the vault means that person.
		const names = typed.map((n) => idx.findByName(n)?.name ?? n);
		const me = idx.ghostName(person.key) ?? person.name;
		const parents = idx.parentsOf(person.key).map((r) => r.name);
		const partners = idx.partners(person.key).map((x) => x.ref.name);
		if (this.kind === "siblings" && !parents.length) {
			new Notice(`${person.name} has no parent in the tree yet. Add a parent first, then their siblings.`);
			return;
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
			} else if (this.kind === "partners") for (const n of names) added += addKinPartner(lines, me, n);
			else added = addKinChildren(lines, parents.slice(0, 2), names);
			if (added) front[prop] = lines;
		}, label);
		this.close();
		new Notice(added ? `Added ${added} to the tree, written on ${anchor.name}'s note. Click a "Not created yet" card to write one up.` : "They were all there already.");
	}

	onClose() {
		this.contentEl.empty();
	}
}
