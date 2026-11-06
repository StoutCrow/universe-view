import { Modal, Notice } from "obsidian";
import type ChroniclePlugin from "../main";
import type { Entity } from "../types";
import { chainOf, holdingsOf } from "../index/realms";
import { factsFromPath, tagFixes, type TagFix, type TagNote } from "../index/tagrules";
import { el, openEntity } from "../render/common";

/** What UniverseView knows about a note that a tag might state. */
export function tagFacts(plugin: ChroniclePlugin, e: Entity): string[] {
	const idx = plugin.index;
	const tree = plugin.realms();
	const realm = tree.nodes.has(e.key) ? chainOf(tree, e.key).map((k) => idx.get(k)?.name ?? "") : [];
	return [
		...factsFromPath(e.path),
		...realm,
		...e.cultures.map((c) => c.ref.name),
		e.category ?? "",
		e.gender === "m" ? "male" : e.gender === "f" ? "female" : "",
		e.type === "person" && e.end ? "dead" : "",
		holdingsOf(tree, e.key).length ? "ruler" : "",
	];
}

interface Row {
	entity: Entity;
	fix: TagFix;
	/** Tags and renames left out, by name. */
	off: Set<string>;
}

/** Brings every note's tags to the scheme the vault already uses, after a review. */
export class NormaliseTagsModal extends Modal {
	private rows: Row[] = [];
	private countEl?: HTMLElement;
	private applyBtn?: HTMLButtonElement;

	constructor(private plugin: ChroniclePlugin) {
		super(plugin.app);
	}

	onOpen() {
		const { plugin } = this;
		this.modalEl.addClass("chronicle-detect-modal", "chronicle-scope");
		this.titleEl.setText("Normalise all tags");
		const notes: TagNote[] = plugin.index.all().map((e) => ({ path: e.key, type: e.type, tags: e.tags, facts: tagFacts(plugin, e) }));
		const required = plugin.settings.typeStyle === "tag" ? plugin.settings.typeTags : {};
		this.rows = tagFixes(notes, required).flatMap((fix) => {
			const entity = plugin.index.get(fix.path);
			return entity ? [{ entity, fix, off: new Set<string>() }] : [];
		}).sort((a, b) => a.entity.name.localeCompare(b.entity.name));
		this.render();
	}

	private render() {
		const { contentEl } = this;
		contentEl.empty();
		el("p", { cls: "chronicle-detect-intro", text: "Brings every note to the tags your vault already uses: each spelling becomes the usual one, and a note gains the tags its folders, realm, kind and dates say it should have. Click a tag to leave it out. Nothing changes until you press Apply, and Undo takes it all back in one step." }, contentEl);
		const list = el("div", { cls: "chronicle-detect-list" }, contentEl);
		if (!this.rows.length) el("div", { cls: "chronicle-detect-empty", text: "Every note already follows your tags." }, list);
		for (const row of this.rows) this.row(list, row);
		const footer = el("div", { cls: "modal-button-container" }, contentEl);
		this.countEl = el("span", { cls: "chronicle-detect-count" }, footer);
		el("button", { text: "Cancel" }, footer).addEventListener("click", () => this.close());
		this.applyBtn = el("button", { cls: "mod-cta", text: "Apply" }, footer);
		this.applyBtn.addEventListener("click", () => void this.apply());
		this.updateCount();
	}

	private chosen(row: Row) {
		return { add: row.fix.add.filter((t) => !row.off.has(t)), rename: row.fix.rename.filter(([from]) => !row.off.has(from)) };
	}

	private updateCount() {
		const n = this.rows.reduce((sum, r) => {
			const c = this.chosen(r);
			return sum + c.add.length + c.rename.length;
		}, 0);
		const notes = this.rows.filter((r) => {
			const c = this.chosen(r);
			return c.add.length + c.rename.length > 0;
		}).length;
		this.countEl?.setText(`${n} change${n === 1 ? "" : "s"} to ${notes} note${notes === 1 ? "" : "s"}`);
		if (this.applyBtn) this.applyBtn.disabled = n === 0;
	}

	private row(parent: HTMLElement, row: Row) {
		const r = el("div", { cls: "chronicle-detect-row" }, parent);
		const main = el("div", { cls: "chronicle-detect-main" }, r);
		const name = el("a", { cls: "internal-link", text: row.entity.name }, main);
		name.addEventListener("click", (evt) => openEntity(this.plugin, row.entity.key, evt));
		const tags = el("div", { cls: "uv-creator-tag-list" }, main);
		const chip = (id: string, text: string, label: string) => {
			const b = el("button", { cls: "uv-creator-tag", text, attr: { "aria-pressed": "true", "aria-label": label } }, tags);
			b.addEventListener("click", () => {
				const off = !row.off.has(id);
				if (off) row.off.add(id);
				else row.off.delete(id);
				b.toggleClass("is-off", off);
				b.setAttribute("aria-pressed", String(!off));
				this.updateCount();
			});
		};
		for (const t of row.fix.add) chip(t, `+ #${t}`, `Add #${t}`);
		for (const [from, to] of row.fix.rename) chip(from, `#${from} → #${to}`, `Rename #${from} to #${to}`);
	}

	private async apply() {
		const { plugin } = this;
		let notes = 0;
		await plugin.undoGroup("Normalise tags", async () => {
			for (const row of this.rows) {
				const { add, rename } = this.chosen(row);
				if (!add.length && !rename.length) continue;
				notes++;
				await plugin.editFrontmatter(row.entity.file, (front) => {
					const field = "tags" in front || !("tag" in front) ? "tags" : "tag";
					const swap = new Map(rename.map(([from, to]) => [from.toLowerCase(), to]));
					const now = ([] as unknown[]).concat(front[field] ?? []).filter((t) => t !== null && t !== "").map(String).map((t) => swap.get(t.replace(/^#/, "").toLowerCase()) ?? t);
					front[field] = [...new Set([...now, ...add])];
				});
			}
		});
		new Notice(`Normalised the tags on ${notes} note${notes === 1 ? "" : "s"}.`);
		this.close();
	}

	onClose() {
		this.contentEl.empty();
	}
}
