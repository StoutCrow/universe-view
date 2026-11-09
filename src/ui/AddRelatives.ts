import { Modal, Notice, TFile } from "obsidian";
import type ChroniclePlugin from "../main";
import type { Entity } from "../types";
import { el } from "../render/common";
import { buildFieldAliases } from "../settings";
import { addLinks, parseNames } from "../index/relatives";

export type RelativeKind = "parents" | "children" | "partners" | "siblings";

const KINDS: { id: RelativeKind; label: string; hint: string }[] = [
	{ id: "parents", label: "Parents", hint: "Written on this person." },
	{ id: "children", label: "Children", hint: "Written on this person." },
	{ id: "partners", label: "Partners", hint: "Written on this person." },
	{ id: "siblings", label: "Siblings", hint: "Written on their parents' notes, so they need a parent with a note." },
];

/**
 * Grows the tree by names. Nobody gets a note: each name becomes a link on a note that already exists, the tree
 * draws it as a card marked "Not created yet", and clicking that card writes the note when there's something to say.
 * A name that matches someone already in the vault links to them.
 */
export class AddRelativesModal extends Modal {
	private kind: RelativeKind;

	constructor(private plugin: ChroniclePlugin, private person: Entity, kind: RelativeKind = "children") {
		super(plugin.app);
		this.kind = kind;
	}

	onOpen() {
		this.containerEl.addClass("chronicle-scope-host");
		this.modalEl.addClass("chronicle-scope");
		this.titleEl.setText(`Add relatives of ${this.person.name}`);
		const kinds = el("div", { cls: "uv-rel-kinds" }, this.contentEl);
		const note = el("p", { cls: "setting-item-description" }, this.contentEl);
		const area = el("textarea", { cls: "uv-rel-names", attr: { rows: "6", placeholder: "One name per line" } }, this.contentEl);
		const buttons = el("div", { cls: "modal-button-container" }, this.contentEl);
		const ok = el("button", { cls: "mod-cta", text: "Add" }, buttons);
		el("button", { text: "Cancel" }, buttons).addEventListener("click", () => this.close());
		const chips: Record<string, HTMLElement> = {};
		const paint = () => {
			for (const k of KINDS) chips[k.id].toggleClass("is-on", k.id === this.kind);
			note.setText(`No notes are made. ${KINDS.find((k) => k.id === this.kind)?.hint ?? ""} Each name shows in the tree as a card you can write up later.`);
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
		window.setTimeout(() => area.focus(), 30);
	}

	private async submit(text: string) {
		const names = parseNames(text);
		if (!names.length) return;
		const p = this.plugin;
		const idx = p.index;
		const link = (name: string) => {
			const found = idx.findByName(name);
			return `[[${found ? found.key.split("/").pop()!.replace(/\.md$/i, "") : name}]]`;
		};
		const links = names.map(link);
		const aliases = buildFieldAliases(p.settings.fieldAliases);
		const fileOf = (key: string) => {
			const f = p.app.vault.getAbstractFileByPath(key);
			return f instanceof TFile ? f : undefined;
		};
		const label = `Add ${names.length} ${this.kind === "siblings" ? "sibling" : this.kind.replace(/s$/, "")}${names.length === 1 ? "" : "s"}`;
		let targets: { file: TFile; field: "parents" | "children" | "partners" }[];
		if (this.kind === "siblings") {
			targets = this.person.parents.map((r) => fileOf(r.key)).filter((f): f is TFile => !!f).map((file) => ({ file, field: "children" as const }));
			if (!targets.length) {
				new Notice(`${this.person.name} has no parent with a note yet. Add a parent first, then their siblings.`);
				return;
			}
		} else {
			const file = fileOf(this.person.key);
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
		new Notice(added ? `Added ${added} to ${this.person.name}'s tree. Click a "Not created yet" card to write one up.` : "They were all there already.");
	}

	onClose() {
		this.contentEl.empty();
	}
}
