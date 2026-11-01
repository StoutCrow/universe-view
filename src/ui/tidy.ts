import { Modal, Notice, TFile, TFolder, normalizePath } from "obsidian";
import type ChroniclePlugin from "../main";
import type { Entity } from "../types";
import { TYPE_ICONS, el, icon } from "../render/common";
import { isFolderNote, placementFor, type PlacementLinks } from "./foldernotes";

/** What a note already links to, as placement reads it, with its place in the realm tree first. */
export function entityLinks(plugin: ChroniclePlugin, e: Entity): PlacementLinks {
	const names = (refs: { name: string; resolved: boolean }[]) => refs.filter((r) => r.resolved).map((r) => r.name);
	const tree = plugin.realms();
	const under = tree.nodes.get(e.key)?.under;
	const above = under ? plugin.index.get(under)?.name : undefined;
	return {
		cultures: names(e.cultures.map((c) => c.ref)),
		parents: names(e.parents),
		places: names(e.places),
		locatedIn: [...(above ? [above] : []), ...(e.locatedIn?.resolved ? [e.locatedIn.name] : [])],
		parentCultures: [...(above && e.type === "culture" ? [above] : []), ...names(e.parentCultures)],
		participants: names(e.participants),
		dead: !!e.end,
	};
}

export interface Move {
	file: TFile;
	to: string;
	under: string;
}

/**
 * Notes that sit outside the folder note of what they belong to: a Whitmore in People/ rather than
 * House Whitmore/, a fort beside its county instead of inside it. Notes already somewhere inside that
 * folder (in Dead/, in a subfolder of their own) are left where they are, as are folder notes.
 */
export function tidyPlan(plugin: ChroniclePlugin, scope?: string): Move[] {
	const moves: Move[] = [];
	for (const e of plugin.index.all()) {
		if (scope && !e.path.startsWith(scope + "/")) continue;
		const file = plugin.app.vault.getAbstractFileByPath(e.path);
		if (!(file instanceof TFile) || isFolderNote(file)) continue;
		const pl = placementFor(plugin, e.type, entityLinks(plugin, e));
		if (!pl || !pl.inside || pl.convert) continue;
		const here = file.parent?.path ?? "";
		if (here === pl.base || here.startsWith(pl.base + "/")) continue;
		// An event filed higher up (a war under the whole continent) stays at the level it was given.
		if (e.type === "event" && pl.base.startsWith(here + "/")) continue;
		// Never into its own folder (a note that is what it would go inside).
		if (pl.folder.startsWith(e.path.replace(/\.md$/, ""))) continue;
		moves.push({ file, to: pl.folder, under: pl.under });
	}
	return moves.sort((a, b) => a.to.localeCompare(b.to) || a.file.basename.localeCompare(b.file.basename));
}

async function moveTo(plugin: ChroniclePlugin, file: TFile, folder: string): Promise<boolean> {
	const target = normalizePath(`${folder}/${file.name}`);
	if (plugin.app.vault.getAbstractFileByPath(target)) return false;
	if (!(plugin.app.vault.getAbstractFileByPath(folder) instanceof TFolder)) await plugin.app.vault.createFolder(folder);
	await plugin.app.fileManager.renameFile(file, target);
	return true;
}

/** The moves, each to tick or untick, before anything is moved. */
export class TidyModal extends Modal {
	constructor(private plugin: ChroniclePlugin, private world?: string) {
		super(plugin.app);
	}

	onOpen() {
		this.modalEl.addClass("chronicle-scope", "chronicle-tool-modal", "uv-tidy");
		this.titleEl.setText("Move notes into their folder notes");
		const moves = tidyPlan(this.plugin, this.world);
		const { contentEl } = this;
		if (!moves.length) {
			el("p", { text: "Every note already sits inside the folder note of what it belongs to." }, contentEl);
			return;
		}
		el("p", { cls: "chronicle-dash-muted", text: `${moves.length} note${moves.length === 1 ? "" : "s"} could go inside the folder note of the house, realm or place they belong to. Links keep working: Obsidian updates them as notes move. Untick any to leave.` }, contentEl);
		const picked = new Set(moves);
		const list = el("div", { cls: "uv-tidy-list" }, contentEl);
		let group = "";
		for (const m of moves) {
			if (m.to !== group) {
				group = m.to;
				const head = el("div", { cls: "uv-tidy-head" }, list);
				icon(el("span", {}, head), "folder-tree");
				el("strong", { text: m.under }, head);
				el("span", { cls: "chronicle-dash-muted", text: m.to }, head);
			}
			const row = el("label", { cls: "uv-tidy-row" }, list);
			const box = el("input", { attr: { type: "checkbox" } }, row);
			box.checked = true;
			box.addEventListener("change", () => (box.checked ? picked.add(m) : picked.delete(m)));
			const e = this.plugin.index.get(m.file.path);
			if (e) icon(el("span", { cls: "uv-tidy-icon" }, row), TYPE_ICONS[e.type]);
			el("span", { text: m.file.basename }, row);
			el("span", { cls: "chronicle-dash-muted", text: `from ${m.file.parent?.path || "the vault root"}` }, row);
		}
		const footer = el("div", { cls: "modal-button-container" }, contentEl);
		el("button", { text: "Cancel" }, footer).addEventListener("click", () => this.close());
		const go = el("button", { cls: "mod-cta", text: "Move them" }, footer);
		go.addEventListener("click", async () => {
			go.disabled = true;
			let done = 0;
			let skipped = 0;
			for (const m of picked) (await moveTo(this.plugin, m.file, m.to).catch(() => false)) ? done++ : skipped++;
			new Notice(`Moved ${done} note${done === 1 ? "" : "s"}${skipped ? `; ${skipped} left where they were (a note of that name is already there)` : ""}.`);
			this.close();
		});
	}

	onClose() {
		this.contentEl.empty();
	}
}

/** A notice with buttons, kept up until one is pressed or it times out. */
function ask(text: string, buttons: [string, () => void][], ms = 12000) {
	const frag = createFragment((f) => {
		f.createDiv({ text });
		const row = f.createDiv({ cls: "uv-notice-actions" });
		for (const [label, run] of buttons) {
			const b = row.createEl("button", { text: label });
			b.addEventListener("click", (evt) => {
				evt.stopPropagation();
				run();
				notice.hide();
			});
		}
	});
	const notice = new Notice(frag, ms);
}

/**
 * Keeping the vault in order as notes change: someone given a death date offers to move from Living/
 * to Dead/, and renaming a note offers to update the tags made from its name (#House_Whitmore).
 */
export function tidyWatchers(plugin: ChroniclePlugin) {
	const { app } = plugin;
	const asked = new Set<string>();
	plugin.registerEvent(app.metadataCache.on("changed", (file) => {
		if (plugin.settings.statusFolders === false || plugin.settings.livingDeadPrompt === false) return;
		window.setTimeout(() => {
			const e = plugin.index.get(file.path);
			const dir = file.parent;
			if (!e || e.type !== "person" || !e.end || !dir || !/^(living|alive|the living)$/i.test(dir.name) || asked.has(file.path)) return;
			const dead = dir.parent?.children.find((c): c is TFolder => c instanceof TFolder && /^(dead|deceased|the dead)$/i.test(c.name));
			if (!dead) return;
			asked.add(file.path);
			ask(`${e.name} has died. Move them to ${dead.name}?`, [
				[`Move to ${dead.name}`, () => void moveTo(plugin, file, dead.path)],
				["Not now", () => {}],
			]);
		}, 600);
	}));

	plugin.registerEvent(app.vault.on("rename", (file, oldPath) => {
		if (!(file instanceof TFile) || file.extension !== "md" || plugin.settings.renameTags === false) return;
		const oldName = oldPath.split("/").pop()!.replace(/\.md$/, "");
		if (oldName === file.basename) return;
		const oldTag = oldName.replace(/\s+/g, "_");
		const newTag = file.basename.replace(/\s+/g, "_");
		// #House_Whitmore, #Nation_United_States, or the name on its own as a tag.
		const re = new RegExp(`^(?:[\\w-]+_)?${oldTag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
		const hits: TFile[] = [];
		for (const f of app.vault.getMarkdownFiles()) {
			const cache = app.metadataCache.getFileCache(f);
			const tags = [...(cache?.tags ?? []).map((t) => t.tag.slice(1)), ...[cache?.frontmatter?.tags ?? []].flat().map((t) => String(t).replace(/^#/, ""))];
			if (tags.some((t) => re.test(t))) hits.push(f);
		}
		if (!hits.length) return;
		ask(`${hits.length} note${hits.length === 1 ? " is" : "s are"} tagged with ${oldName}'s old name (#…${oldTag}). Update the tags to ${newTag}?`, [
			["Update tags", () => void retag(plugin, hits, oldTag, newTag)],
			["Leave them", () => {}],
		], 20000);
	}));
}

async function retag(plugin: ChroniclePlugin, files: TFile[], oldTag: string, newTag: string) {
	const esc = oldTag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const body = new RegExp(`#((?:[\\w-]+_)?)${esc}(?![\\w/-])`, "gi");
	const bare = new RegExp(`^((?:[\\w-]+_)?)${esc}$`, "i");
	for (const f of files) {
		await plugin.app.vault.process(f, (text) => text.replace(body, (_, pre: string) => `#${pre}${newTag}`));
		await plugin.app.fileManager.processFrontMatter(f, (fm) => {
			const fix = (t: unknown) => String(t).replace(/^#/, "").replace(bare, (_, pre: string) => `${pre}${newTag}`);
			if (Array.isArray(fm.tags)) fm.tags = fm.tags.map(fix);
			else if (typeof fm.tags === "string") fm.tags = fix(fm.tags);
		});
	}
	new Notice(`Updated the tags in ${files.length} note${files.length === 1 ? "" : "s"}.`);
}
