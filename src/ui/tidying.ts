import { isHouse } from "../render/houses";
import { Modal, Notice, Setting, TFile } from "obsidian";
import type ChroniclePlugin from "../main";
import type { Entity } from "../types";
import { formatDate, formatSpan } from "../dates/parser";
import { completeness, findContradictions, findDuplicates, findOrphans, mergeFrontmatter, relink, type Orphan } from "../index/tidy";
import { TYPE_ICONS, TYPE_LABELS, el, entityColor, icon, openEntity } from "../render/common";
import { TextPrompt } from "./TextPrompt";

function noteRow(plugin: ChroniclePlugin, parent: HTMLElement, e: Entity, note: string | undefined, onClick?: (evt: MouseEvent) => void) {
	const row = el("button", { cls: "chronicle-dash-rel" }, parent);
	row.style.setProperty("--row-color", entityColor(plugin, e));
	const ic = el("span", { cls: "chronicle-dash-rel-icon" }, row);
	icon(ic, TYPE_ICONS[e.type]);
	el("span", { cls: "chronicle-dash-rel-name", text: e.name }, row);
	if (note) el("span", { cls: "chronicle-dash-rel-note", text: note }, row);
	row.addEventListener("click", (evt) => (onClick ? onClick(evt) : openEntity(plugin, e.key, evt)));
	plugin.hoverCards?.attach(row, e.key);
	return row;
}

function backlinks(plugin: ChroniclePlugin): Map<string, string[]> {
	const resolved = (plugin.app.metadataCache as unknown as { resolvedLinks?: Record<string, Record<string, number>> }).resolvedLinks ?? {};
	const map = new Map<string, string[]>();
	for (const [from, to] of Object.entries(resolved)) for (const t of Object.keys(to)) map.set(t, [...(map.get(t) ?? []), from]);
	return map;
}

// ---- Duplicates -------------------------------------------------------------------------------------

/**
 * Merges `drop` into `keep`: properties combined (keep's win), drop's text appended under a heading,
 * every link to drop pointed at keep, and drop moved to the trash.
 */
export async function mergeNotes(plugin: ChroniclePlugin, keep: Entity, drop: Entity) {
	const { vault, metadataCache, fileManager } = plugin.app;
	const dropFm = { ...((metadataCache.getFileCache(drop.file)?.frontmatter ?? {}) as Record<string, unknown>) };
	delete dropFm.position;
	const dropBody = (await vault.read(drop.file)).replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "").trim();
	await plugin.editFrontmatter(keep.file, (f) => {
		const merged = mergeFrontmatter(f, dropFm);
		for (const k of Object.keys(f)) delete f[k];
		Object.assign(f, merged);
	}, `Merge ${drop.name} into ${keep.name}`);
	if (dropBody) await vault.process(keep.file, (t) => `${t.replace(/\s*$/, "")}\n\n## From ${drop.name}\n\n${dropBody}\n`);
	const linking = backlinks(plugin).get(drop.path) ?? [];
	for (const path of linking) {
		const f = vault.getAbstractFileByPath(path);
		if (f instanceof TFile && f.path !== drop.path) await vault.process(f, (t) => relink(t, drop.file.basename, keep.file.basename));
	}
	const fm = fileManager as unknown as { trashFile?: (f: TFile) => Promise<void> };
	if (fm.trashFile) await fm.trashFile(drop.file);
	else await vault.trash(drop.file, true);
	return linking.length;
}

export class DuplicatesModal extends Modal {
	constructor(private plugin: ChroniclePlugin) {
		super(plugin.app);
	}

	onOpen() {
		this.modalEl.addClass("chronicle-scope", "chronicle-tool-modal");
		this.titleEl.setText("Possible duplicates");
		this.render();
	}

	private render() {
		this.contentEl.empty();
		const pairs = findDuplicates(this.plugin.index.all()).slice(0, 60);
		if (!pairs.length) {
			el("div", { cls: "chronicle-kin-answer", text: "No likely duplicates found." }, this.contentEl);
			return;
		}
		el("div", { cls: "chronicle-dash-muted", text: "Merging keeps one note, adds the other's properties and text to it, points every link at it, and moves the other to the trash. Text changes can't be undone from UniverseView, so check first." }, this.contentEl);
		for (const p of pairs) {
			const box = el("div", { cls: "chronicle-dupe" }, this.contentEl);
			el("div", { cls: "chronicle-dupe-reason", text: `${p.reason} · ${Math.round(p.score * 100)}% likely` }, box);
			const sides = el("div", { cls: "chronicle-dupe-sides" }, box);
			for (const [keep, drop] of [[p.a, p.b], [p.b, p.a]] as [Entity, Entity][]) {
				const side = el("div", { cls: "chronicle-dupe-side" }, sides);
				noteRow(this.plugin, side, keep, `${keep.path}${keep.start ? ` · ${formatSpan(keep.start, keep.end, this.plugin.calendars.get(keep.calendar))}` : ""}`);
				const b = el("button", { text: `Keep this one` }, side);
				b.addEventListener("click", () => {
					const confirm = new Modal(this.app);
					confirm.titleEl.setText(`Merge ${drop.name} into ${keep.name}?`);
					el("p", { text: `${drop.path} will be moved to the trash after its properties and text are added to ${keep.path}, and links to it are pointed at ${keep.name}.` }, confirm.contentEl);
					new Setting(confirm.contentEl)
						.addButton((x) => x.setButtonText("Cancel").onClick(() => confirm.close()))
						.addButton((x) => x.setButtonText("Merge").setWarning().onClick(async () => {
							confirm.close();
							const n = await mergeNotes(this.plugin, keep, drop);
							new Notice(`Merged ${drop.name} into ${keep.name}${n ? `; updated links in ${n} notes` : ""}.`);
							window.setTimeout(() => this.render(), 600);
						}));
					confirm.open();
				});
			}
			const no = el("button", { cls: "mod-muted", text: "Not duplicates" }, box);
			no.addEventListener("click", () => box.remove());
		}
	}

	onClose() {
		this.contentEl.empty();
	}
}

// ---- Orphans --------------------------------------------------------------------------------------

const ORPHAN_TITLES: Record<Orphan["problem"], string> = {
	duplicate: "Possible duplicates",
	unlinked: "Not connected to anything",
	"no-family": "People without family",
	"not-on-map": "Places not on a map",
	undated: "Events without a date",
	"no-place": "Events without a place",
};

export class OrphansModal extends Modal {
	constructor(private plugin: ChroniclePlugin, private world?: string) {
		super(plugin.app);
	}

	/** Two notes that seem to be one: keep either, and the other is folded into it. */
	private duplicateRow(parent: HTMLElement, a: Entity, b: Entity, why: string) {
		const box = el("div", { cls: "chronicle-dupe" }, parent);
		el("div", { cls: "chronicle-dupe-reason", text: why }, box);
		const sides = el("div", { cls: "chronicle-dupe-sides" }, box);
		for (const [keep, drop] of [[a, b], [b, a]] as [Entity, Entity][]) {
			const side = el("div", { cls: "chronicle-dupe-side" }, sides);
			const links = (backlinks(this.plugin).get(keep.path) ?? []).length;
			noteRow(this.plugin, side, keep, `${keep.path} · ${links} link${links === 1 ? "" : "s"} to it`);
			const btn = el("button", { text: `Keep this, merge ${drop.name} in` }, side);
			btn.addEventListener("click", () => {
				const confirm = new Modal(this.app);
				confirm.titleEl.setText(`Merge ${drop.name} into ${keep.name}?`);
				el("p", { text: `${drop.name}'s properties and text are added to ${keep.name}, every link to ${drop.name} is pointed at ${keep.name}, and ${drop.path} goes to the trash. Text changes can't be undone from UniverseView, so check first.` }, confirm.contentEl);
				new Setting(confirm.contentEl)
					.addButton((x) => x.setButtonText("Cancel").onClick(() => confirm.close()))
					.addButton((x) => x.setButtonText("Merge").setWarning().onClick(async () => {
						confirm.close();
						const n = await mergeNotes(this.plugin, keep, drop);
						new Notice(`Merged ${drop.name} into ${keep.name}${n ? `; updated links in ${n} notes` : ""}.`);
						box.remove();
					}));
				confirm.open();
			});
		}
		const no = el("button", { cls: "mod-muted", text: "Not the same" }, box);
		no.addEventListener("click", () => box.remove());
	}

	onOpen() {
		this.modalEl.addClass("chronicle-scope", "chronicle-tool-modal");
		this.titleEl.setText("Loose ends");
		const links = backlinks(this.plugin);
		const all = findOrphans(this.plugin.index, (p) => (links.get(p) ?? []).filter((x) => x !== p).length, (g) => isHouse(this.plugin, g)).filter((o) => !this.world || o.e.path.startsWith(this.world + "/"));
		if (!all.length) {
			el("div", { cls: "chronicle-kin-answer", text: "No loose ends: everything is connected." }, this.contentEl);
			return;
		}
		for (const problem of Object.keys(ORPHAN_TITLES) as Orphan["problem"][]) {
			const list = all.filter((o) => o.problem === problem);
			if (!list.length) continue;
			const details = el("details", { cls: "chronicle-orphans" }, this.contentEl);
			if (list.length <= 8) details.open = true;
			el("summary", { text: `${ORPHAN_TITLES[problem]} (${list.length})` }, details);
			const shownPairs = new Set<string>();
			for (const o of list.slice(0, 80)) {
				// The same person written twice: merge one into the other here, links and all.
				if (problem === "duplicate" && o.other) {
					const pair = [o.e.key, o.other.key].sort().join("|");
					if (shownPairs.has(pair)) continue;
					shownPairs.add(pair);
					this.duplicateRow(details, o.e, o.other, o.text);
					continue;
				}
				const fix = problem === "not-on-map" ? "Put it on the map" : problem === "no-family" || problem === "unlinked" ? "Link it in the Dashboard" : "Edit";
				noteRow(this.plugin, details, o.e, fix, () => {
					this.close();
					if (problem === "not-on-map") void this.plugin.placeOnMap(o.e.key);
					else if (problem === "undated" || problem === "no-place") void this.plugin.inspect(o.e.key, "edit");
					else void this.plugin.openDashboard(o.e.key);
				});
			}
		}
	}

	onClose() {
		this.contentEl.empty();
	}
}

// ---- Kinds and tags ---------------------------------------------------------------------------------

export class CleanupModal extends Modal {
	private tab: "kinds" | "tags" = "kinds";

	constructor(private plugin: ChroniclePlugin) {
		super(plugin.app);
	}

	onOpen() {
		this.modalEl.addClass("chronicle-scope", "chronicle-tool-modal");
		this.titleEl.setText("Tidy kinds and tags");
		this.render();
	}

	private render() {
		const c = this.contentEl;
		c.empty();
		const tabs = el("div", { cls: "chronicle-tabs" }, c);
		for (const [k, label] of [["kinds", "Kinds"], ["tags", "Tags"]] as const) {
			const b = el("button", { cls: "chronicle-chip" + (this.tab === k ? " is-active" : ""), text: label }, tabs);
			b.addEventListener("click", () => {
				this.tab = k;
				this.render();
			});
		}
		if (this.tab === "kinds") this.kinds(c);
		else this.tags(c);
	}

	private kinds(c: HTMLElement) {
		el("div", { cls: "chronicle-dash-muted", text: "Rename a kind to change it on every note; rename it to one that already exists to merge them. Undo puts them back." }, c);
		const counts = new Map<string, Entity[]>();
		for (const e of this.plugin.index.all()) if (e.category) counts.set(`${e.type}:${e.category}`, [...(counts.get(`${e.type}:${e.category}`) ?? []), e]);
		const rows = [...counts.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
		for (const [id, notes] of rows) {
			const [type, kind] = id.split(":");
			new Setting(c)
				.setName(kind)
				.setDesc(`${TYPE_LABELS[type as Entity["type"]]} · ${notes.length} note${notes.length === 1 ? "" : "s"}`)
				.addButton((b) => b.setButtonText("Rename or merge…").onClick(() => new TextPrompt(this.plugin, `Rename “${kind}” (${notes.length} notes) to`, kind, (to) => {
					const next = to.trim().toLowerCase();
					if (!next || next === kind) return;
					void this.plugin.undoGroup(`Rename kind ${kind} → ${next}`, async () => {
						for (const e of notes) await this.plugin.editFrontmatter(e.file, (f) => this.plugin.setKindMark(f, kind, next));
					}).then(() => {
						new Notice(`Renamed ${kind} to ${next} on ${notes.length} notes`);
						window.setTimeout(() => this.render(), 500);
					});
				}).open()));
		}
	}

	private tags(c: HTMLElement) {
		el("div", { cls: "chronicle-dash-muted", text: "Renames the tag in properties and in the text of every note (including nested tags like #old/child). Changes to the text itself can't be undone from UniverseView." }, c);
		const tags = (this.app.metadataCache as unknown as { getTags?: () => Record<string, number> }).getTags?.() ?? {};
		const rows = Object.entries(tags).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 300);
		if (!rows.length) el("div", { cls: "chronicle-dash-muted", text: "No tags in this vault." }, c);
		for (const [tag, n] of rows) {
			new Setting(c)
				.setName(tag)
				.setDesc(`${n} use${n === 1 ? "" : "s"}`)
				.addButton((b) => b.setButtonText("Rename or merge…").onClick(() => new TextPrompt(this.plugin, `Rename ${tag} to`, tag.replace(/^#/, ""), (to) => void this.renameTag(tag.replace(/^#/, ""), to.replace(/^#/, "").trim())).open()));
		}
	}

	private async renameTag(from: string, to: string) {
		if (!to || to === from) return;
		const esc = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const inline = new RegExp(`(^|[\\s(\\[,;])#${esc}(?=$|[\\s/.,;:!?)\\]])`, "gim");
		let changed = 0;
		await this.plugin.undoGroup(`Rename #${from} → #${to}`, async () => {
			for (const file of this.app.vault.getMarkdownFiles()) {
				const cache = this.app.metadataCache.getFileCache(file);
				const inText = (cache?.tags ?? []).some((t) => t.tag.toLowerCase() === `#${from}`.toLowerCase() || t.tag.toLowerCase().startsWith(`#${from}/`.toLowerCase()));
				const fmTags = ([] as unknown[]).concat(cache?.frontmatter?.tags ?? cache?.frontmatter?.tag ?? []).map(String);
				const inProps = fmTags.some((t) => t.replace(/^#/, "").toLowerCase() === from.toLowerCase() || t.replace(/^#/, "").toLowerCase().startsWith(from.toLowerCase() + "/"));
				if (!inText && !inProps) continue;
				changed++;
				if (inProps) {
					await this.plugin.editFrontmatter(file, (f) => {
						const key = "tags" in f ? "tags" : "tag";
						const list = ([] as unknown[]).concat(f[key] ?? []).map(String).map((t) => {
							const bare = t.replace(/^#/, "");
							if (bare.toLowerCase() === from.toLowerCase()) return to;
							if (bare.toLowerCase().startsWith(from.toLowerCase() + "/")) return to + bare.slice(from.length);
							return t;
						});
						f[key] = [...new Set(list)];
					});
				}
				if (inText) {
					await this.app.vault.process(file, (text) => {
						const m = text.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
						const head = m ? m[0] : "";
						return head + text.slice(head.length).replace(inline, (_x, pre: string) => `${pre}#${to}`);
					});
				}
			}
		});
		new Notice(`Renamed #${from} to #${to} in ${changed} notes`);
		window.setTimeout(() => this.render(), 500);
	}

	onClose() {
		this.contentEl.empty();
	}
}

// ---- How complete is the world? ---------------------------------------------------------------------

export function renderCompleteness(plugin: ChroniclePlugin, host: HTMLElement, world?: string, onPick?: (e: Entity) => void) {
	const rows = completeness(plugin.index, world);
	if (!rows.length) {
		el("div", { cls: "chronicle-dash-muted", text: "Nothing to measure yet." }, host);
		return;
	}
	// Each check counts equally, so the rows covering every note (summaries, pictures) don't swamp the rest.
	const scored = rows.filter((r) => r.total > 0);
	const share = scored.reduce((s, r) => s + r.done / r.total, 0) / Math.max(1, scored.length);
	const overall = el("div", { cls: "chronicle-complete-overall" }, host);
	el("strong", { text: `${Math.round(share * 100)}%` }, overall);
	el("span", { text: " filled in overall" }, overall);
	for (const r of rows) {
		const pct = Math.round((r.done / r.total) * 100);
		const row = el("div", { cls: "chronicle-complete-row" }, host);
		const head = el("div", { cls: "chronicle-complete-head" }, row);
		el("span", { text: r.label }, head);
		el("span", { cls: "chronicle-complete-num", text: `${r.done} of ${r.total}` }, head);
		const track = el("div", { cls: "chronicle-complete-track", attr: { role: "progressbar", "aria-valuenow": String(pct), "aria-valuemin": "0", "aria-valuemax": "100", "aria-label": r.label } }, row);
		const bar = el("div", { cls: "chronicle-complete-bar" + (pct === 100 ? " is-done" : "") }, track);
		bar.style.width = `${pct}%`;
		if (r.missing.length) {
			const more = el("details", { cls: "chronicle-complete-missing" }, row);
			el("summary", { text: `Show the ${r.missing.length} missing` }, more);
			for (const e of r.missing.slice(0, 40)) noteRow(plugin, more, e, e.path.split("/").slice(0, -1).join("/"), onPick ? () => onPick(e) : undefined);
		}
	}
}

export class CompletenessModal extends Modal {
	constructor(private plugin: ChroniclePlugin, private world?: string) {
		super(plugin.app);
	}

	onOpen() {
		this.modalEl.addClass("chronicle-scope", "chronicle-tool-modal");
		this.titleEl.setText(this.world ? `How complete is ${this.world}?` : "How complete is the world?");
		renderCompleteness(this.plugin, this.contentEl, this.world, (e) => {
			this.close();
			void this.plugin.openDashboard(e.key);
		});
	}

	onClose() {
		this.contentEl.empty();
	}
}

// ---- Text that disagrees with properties ------------------------------------------------------------

export class ContradictionsModal extends Modal {
	constructor(private plugin: ChroniclePlugin) {
		super(plugin.app);
	}

	async onOpen() {
		this.modalEl.addClass("chronicle-scope", "chronicle-tool-modal");
		this.titleEl.setText("Text that disagrees with properties");
		const status = el("div", { cls: "chronicle-dash-muted", text: "Reading notes…" }, this.contentEl);
		const idx = this.plugin.index;
		const found: { e: Entity; text: string; about: string }[] = [];
		for (const e of idx.all()) {
			if (e.type === "map") continue;
			const body = await this.app.vault.cachedRead(e.file);
			const cal = this.plugin.calendars.get(e.calendar);
			const parse = (s: string) => (/\d/.test(s) ? this.plugin.parseDate(s, cal.id) : null);
			for (const c of findContradictions(e, body, parse, (n) => idx.findByName(n), (d) => formatDate(d, cal))) found.push({ e, text: c.text, about: c.about });
		}
		status.setText(found.length ? `${found.length} places where a note's text and the properties disagree. Either may be the one that's wrong.` : "No disagreements found between notes' text and their dates.");
		for (const f of found) {
			const about = idx.get(f.about);
			noteRow(this.plugin, this.contentEl, f.e, f.text + (about && about.key !== f.e.key ? ` (${about.name})` : ""), (evt) => {
				this.close();
				openEntity(this.plugin, f.e.key, evt);
			});
		}
	}

	onClose() {
		this.contentEl.empty();
	}
}
