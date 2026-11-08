import { Modal, Notice } from "obsidian";
import type ChroniclePlugin from "../main";
import type { Entity } from "../types";
import { DEFAULT_REGION_WORDS, chainOf, holdingsOf, tierName, tierWords, tierWordsWith } from "../index/realms";
import { typeFromTag } from "../index/reader";
import { applyMigration, migrateBodyTags, migrateTags, migrationKind, tidyKinds, type MigrateNote, type MigrateWords, type Migration } from "../index/tagscheme";
import { factsFromPath, tagFixes, type TagFix, type TagNote } from "../index/tagrules";
import { el, openEntity } from "../render/common";

/** What UniverseView knows about a note that a tag might state. */
export function tagFacts(plugin: ChroniclePlugin, e: Entity): string[] {
	const idx = plugin.index;
	const tree = plugin.realms();
	// The titles above it, not itself: a realm doesn't belong to itself.
	const realm = tree.nodes.has(e.key) ? chainOf(tree, e.key).filter((k) => k !== e.key).map((k) => idx.get(k)?.name ?? "") : [];
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

/** Everything a note's tags go through to reach the tag scheme (`tagscheme.ts`). */
export function schemeMigrations(plugin: ChroniclePlugin): { entity: Entity; fix: Migration }[] {
	const s = plugin.settings;
	const words: MigrateWords = {
		bareType: (w) => (w.includes("_") ? null : typeFromTag(w, "", s.typeTags)),
		tiers: tierWordsWith(s.tierWords),
		regions: { ...DEFAULT_REGION_WORDS, ...tierWords(s.regionWords ?? "") },
	};
	const tree = plugin.realms();
	// Tags in the properties and in the text, each once.
	const ownTags = (e: Entity) => {
		const cache = plugin.app.metadataCache.getFileCache(e.file);
		const all = ([] as unknown[]).concat(cache?.frontmatter?.tags ?? []).filter((t) => t !== null && t !== "").map((t) => String(t).replace(/^#/, ""));
		for (const t of cache?.tags ?? []) all.push(t.tag.replace(/^#/, ""));
		return [...new Map(all.map((t) => [t.toLowerCase(), t])).values()];
	};
	const noteOf = (e: Entity): MigrateNote => {
		const node = tree.nodes.get(e.key);
		return {
			type: e.type,
			name: e.name,
			kind: e.category,
			tags: ownTags(e),
			land: node ? { nature: node.nature, tier: node.nature === "realm" && node.rank < 9 ? tierName(node.rank) : undefined } : undefined,
			world: plugin.index.worldFor(e.path)?.name,
			folders: factsFromPath(e.path),
		};
	};
	const out: { entity: Entity; fix: Migration }[] = [];
	for (const e of plugin.index.all()) {
		const note = noteOf(e);
		// A vault that marks types with properties only gets tags where it already has some.
		if (!note.tags.length && s.typeStyle !== "tag") continue;
		const fix = migrateTags(note, (name) => {
			const t = plugin.index.findByName(name);
			return t && { type: t.type, name: t.name, kind: migrationKind(noteOf(t), words), self: t.key === e.key };
		}, words);
		if (fix.rename.length || fix.drop.length || fix.add.length) out.push({ entity: e, fix });
	}
	return out.sort((a, b) => a.entity.name.localeCompare(b.entity.name));
}

interface Row {
	entity: Entity;
	fix: TagFix | Migration;
	/** Tags and renames left out, by name. */
	off: Set<string>;
}

/** Brings every note's tags to the scheme the vault already uses, after a review. */
export class NormaliseTagsModal extends Modal {
	private rows: Row[] = [];
	private countEl?: HTMLElement;
	private applyBtn?: HTMLButtonElement;

	/** `scheme`: moves older tags to the tag scheme instead (Type_Kind, Type_Kind_Name, Type_Field_Value). */
	constructor(private plugin: ChroniclePlugin, private scheme = false) {
		super(plugin.app);
	}

	onOpen() {
		const { plugin } = this;
		this.modalEl.addClass("chronicle-detect-modal", "chronicle-scope");
		this.titleEl.setText(this.scheme ? "Move tags to the tag scheme" : "Normalise all tags");
		if (this.scheme) {
			this.rows = schemeMigrations(plugin).map(({ entity, fix }) => ({ entity, fix, off: new Set<string>() }));
			this.render();
			return;
		}
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
		const intro = this.scheme
			? "Rewrites tags into one scheme: what a note is (#Place_County, #Character_Person), what it belongs to (#Group_Nation_United_States) and facts (#Character_Status_Dead, #Place_Size_Small). #Title and bare type tags go: the kind says it. Tags in the properties and in the text change (not in code). Click a change to leave it out. Nothing changes until you press Apply, and Undo takes it all back in one step."
			: undefined;
		el("p", { cls: "chronicle-detect-intro", text: intro ?? "Brings every note to the tags your vault already uses: each spelling becomes the usual one, and a note gains the tags its folders, realm, kind and dates say it should have. Click a tag to leave it out. Nothing changes until you press Apply, and Undo takes it all back in one step." }, contentEl);
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
		const drop = "drop" in row.fix ? row.fix.drop.filter((t) => !row.off.has("-" + t)) : [];
		return { add: row.fix.add.filter((t) => !row.off.has(t)), rename: row.fix.rename.filter(([from]) => !row.off.has(from)), drop };
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
		if ("drop" in row.fix) for (const t of row.fix.drop) chip("-" + t, `− #${t}`, `Remove #${t}`);
	}

	private async apply() {
		const { plugin } = this;
		let notes = 0;
		await plugin.undoGroup(this.scheme ? "Move tags to the tag scheme" : "Normalise tags", async () => {
			for (const row of this.rows) {
				const { add, rename, drop } = this.chosen(row);
				if (!add.length && !rename.length && !drop.length) continue;
				notes++;
				await plugin.editFrontmatter(row.entity.file, (front) => {
					const field = "tags" in front || !("tag" in front) ? "tags" : "tag";
					const swap = new Map(rename.map(([from, to]) => [from.toLowerCase(), to]));
					const own = ([] as unknown[]).concat(front[field] ?? []).filter((t) => t !== null && t !== "").map(String);
					const now = this.scheme ? applyMigration(own, { rename, drop, add }) : own.map((t) => swap.get(t.replace(/^#/, "").toLowerCase()) ?? t);
					// Normalising can add a kind tag beside the default one: one kind tag per type.
					const next = this.scheme ? now : tidyKinds([...new Set([...now, ...add])]);
					// A note whose tags are all in its text gets no empty tags property.
					if (next.length || field in front) front[field] = next;
				});
				// Tags written in the text follow, in the same undo step.
				await plugin.editBody(row.entity.file, (body) => migrateBodyTags(body, { rename, drop: this.scheme ? drop : [] }));
			}
		});
		new Notice(`${this.scheme ? "Moved to the tag scheme" : "Normalised"} the tags on ${notes} note${notes === 1 ? "" : "s"}.`);
		this.close();
	}

	onClose() {
		this.contentEl.empty();
	}
}
