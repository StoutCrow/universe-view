import { Modal, Notice } from "obsidian";
import type UniverseViewPlugin from "../main";
import type { Entity } from "../types";
import { DEFAULT_REGION_WORDS, chainOf, holdingsOf, tierName, tierWords, tierWordsWith } from "../index/realms";
import { typeFromTag } from "../index/reader";
import { applyMigration, migrateBodyTags, migrateTags, migrationKind, tidyKinds, type MigrateNote, type MigrateWords, type Migration } from "../index/tagscheme";
import { factsFromPath, tagFixes, type TagFix, type TagNote } from "../index/tagrules";
import { el, openEntity } from "../render/common";
import { kindFix, knownKindWords } from "../index/kindcheck";
import { groupKind } from "../render/houses";
import { CATEGORY_KEYS } from "../index/reader";

/** What UniverseView knows about a note that a tag might state. */
export function tagFacts(plugin: UniverseViewPlugin, e: Entity): string[] {
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
export function schemeMigrations(plugin: UniverseViewPlugin): { entity: Entity; fix: Migration }[] {
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
	/** A group with no kind yet: what its name and tags say it is, when they say (never for a realm, whose tier is its kind). */
	const guessedKind = (e: Entity): string | undefined => {
		if (e.type !== "culture" || tree.nodes.has(e.key)) return undefined;
		const kind = groupKind(plugin, e);
		return kind === "group" ? undefined : kind;
	};
	const noteOf = (e: Entity): MigrateNote => {
		const node = tree.nodes.get(e.key);
		return {
			type: e.type,
			name: e.name,
			kind: e.category ?? guessedKind(e),
			tags: ownTags(e),
			land: node ? { nature: node.nature, tier: node.nature === "realm" && node.rank < 9 ? tierName(node.rank) : undefined } : undefined,
			world: plugin.index.worldFor(e.path)?.name,
			folders: factsFromPath(e.path),
		};
	};
	const out: { entity: Entity; fix: Migration }[] = [];
	// Broken kinds in the `kind:` property: older words, plurals and typos (index/kindcheck.ts).
	const known = knownKindWords();
	const used = new Map<string, number>();
	for (const p of plugin.index.all("place")) if (p.category) used.set(p.category, (used.get(p.category) ?? 0) + 1);
	const byKey = new Map<string, Migration>();
	// Groups with no kind: propose the one their name and tags point to (house, faith, organisation, culture).
	for (const e of plugin.index.all("culture")) {
		const guess = !e.category ? guessedKind(e) : undefined;
		if (guess) byKey.set(e.key, { kind: { from: "", to: guess, why: "worked out from its name and tags" }, rename: [], drop: [], add: [] });
	}
	for (const e of plugin.index.all("place")) {
		const fix = kindFix(e.category, known, (w) => used.get(w) ?? 0);
		if (fix) byKey.set(e.key, { kind: { from: fix.from, to: fix.to, why: fix.why }, rename: [], drop: [], add: fix.add });
	}
	for (const e of plugin.index.all()) {
		const note = noteOf(e);
		// A vault that marks types with properties only gets tags where it already has some.
		if (!note.tags.length && s.typeStyle !== "tag") continue;
		const fix = migrateTags(note, (name) => {
			const t = plugin.index.findByName(name);
			return t && { type: t.type, name: t.name, kind: migrationKind(noteOf(t), words), self: t.key === e.key };
		}, words);
		const kindOnly = byKey.get(e.key);
		if (kindOnly) {
			byKey.delete(e.key);
			fix.kind = kindOnly.kind;
			for (const t of kindOnly.add) if (!fix.add.some((x) => x.toLowerCase() === t.toLowerCase())) fix.add.push(t);
		}
		if (fix.kind || fix.rename.length || fix.drop.length || fix.add.length) out.push({ entity: e, fix });
	}
	// Notes with no tags to move still get their broken kind fixed.
	for (const [key, fix] of byKey) {
		const entity = plugin.index.get(key);
		if (entity) out.push({ entity, fix });
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
	constructor(private plugin: UniverseViewPlugin, private scheme = false) {
		super(plugin.app);
	}

	onOpen() {
		const { plugin } = this;
		this.modalEl.addClass("universeview-detect-modal", "universeview-scope");
		this.titleEl.setText(this.scheme ? "Fix kinds and tags" : "Normalise all tags");
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
			? "Fixes broken kinds (an older word such as capital or fortress, a plural, a typo) and rewrites tags into one scheme: what a note is (#Place_County, #Character_Person), what it belongs to (#Group_Nation_United_States) and facts (#Character_Status_Dead, #Place_Size_Small). #Title and bare type tags go: the kind says it. Tags in the properties and in the text change (not in code). Click a change to leave it out. Nothing changes until you press Apply, and Undo takes it all back in one step."
			: undefined;
		el("p", { cls: "universeview-detect-intro", text: intro ?? "Brings every note to the tags your vault already uses: each spelling becomes the usual one, and a note gains the tags its folders, realm, kind and dates say it should have. Click a tag to leave it out. Nothing changes until you press Apply, and Undo takes it all back in one step." }, contentEl);
		const list = el("div", { cls: "universeview-detect-list" }, contentEl);
		if (!this.rows.length) el("div", { cls: "universeview-detect-empty", text: "Every note already follows your tags." }, list);
		for (const row of this.rows) this.row(list, row);
		const footer = el("div", { cls: "modal-button-container" }, contentEl);
		this.countEl = el("span", { cls: "universeview-detect-count" }, footer);
		el("button", { text: "Cancel" }, footer).addEventListener("click", () => this.close());
		this.applyBtn = el("button", { cls: "mod-cta", text: "Apply" }, footer);
		this.applyBtn.addEventListener("click", () => void this.apply());
		this.updateCount();
	}

	private chosen(row: Row) {
		const drop = "drop" in row.fix ? row.fix.drop.filter((t) => !row.off.has("-" + t)) : [];
		const kind = "kind" in row.fix && row.fix.kind && !row.off.has("kind") ? row.fix.kind : undefined;
		return { add: row.fix.add.filter((t) => !row.off.has(t)), rename: row.fix.rename.filter(([from]) => !row.off.has(from)), drop, kind };
	}

	private updateCount() {
		const n = this.rows.reduce((sum, r) => {
			const c = this.chosen(r);
			return sum + c.add.length + c.rename.length + (c.kind ? 1 : 0);
		}, 0);
		const notes = this.rows.filter((r) => {
			const c = this.chosen(r);
			return c.add.length + c.rename.length + (c.kind ? 1 : 0) > 0;
		}).length;
		this.countEl?.setText(`${n} change${n === 1 ? "" : "s"} to ${notes} note${notes === 1 ? "" : "s"}`);
		if (this.applyBtn) this.applyBtn.disabled = n === 0;
	}

	private row(parent: HTMLElement, row: Row) {
		const r = el("div", { cls: "universeview-detect-row" }, parent);
		const main = el("div", { cls: "universeview-detect-main" }, r);
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
		if ("kind" in row.fix && row.fix.kind) chip("kind", row.fix.kind.from ? `kind: ${row.fix.kind.from} → ${row.fix.kind.to}` : `kind → ${row.fix.kind.to}`, `Change the kind from ${row.fix.kind.from} to ${row.fix.kind.to}: ${row.fix.kind.why}`);
		for (const t of row.fix.add) chip(t, `+ #${t}`, `Add #${t}`);
		for (const [from, to] of row.fix.rename) chip(from, `#${from} → #${to}`, `Rename #${from} to #${to}`);
		if ("drop" in row.fix) for (const t of row.fix.drop) chip("-" + t, `− #${t}`, `Remove #${t}`);
	}

	private async apply() {
		const { plugin } = this;
		let notes = 0;
		await plugin.undoGroup(this.scheme ? "Fix kinds and tags" : "Normalise tags", async () => {
			for (const row of this.rows) {
				const { add, rename, drop, kind } = this.chosen(row);
				if (!add.length && !rename.length && !drop.length && !kind) continue;
				notes++;
				await plugin.editFrontmatter(row.entity.file, (front) => {
					// A broken kind in the `kind:` property is corrected where it is written.
					if (kind) {
						const clean = (v: unknown) => (typeof v === "string" ? v.replace(/^\[\[|\]\]$/g, "").replace(/^#/, "").trim().toLowerCase().replace(/[\s_-]+/g, " ") : "");
						const key = CATEGORY_KEYS.find((k) => clean(front[k]) === kind.from);
						if (key) front[key] = kind.to;
						else if (!kind.from) plugin.setKindMark(front, row.entity.category, kind.to);
					}
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
		new Notice(`${this.scheme ? "Fixed the kinds and tags" : "Normalised the tags"} on ${notes} note${notes === 1 ? "" : "s"}.`);
		this.close();
	}

	onClose() {
		this.contentEl.empty();
	}
}
