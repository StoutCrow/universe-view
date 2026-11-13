import { Modal, Notice, TFile } from "obsidian";
import type UniverseViewPlugin from "../main";
import { readAliases } from "../index/aliases";
import { Issue, Severity, validate } from "../index/validate";
import { el, icon, openEntity } from "../render/common";

const ICONS: Record<Severity, string> = { error: "circle-x", warning: "triangle-alert", info: "info" };

export class ValidateModal extends Modal {
	private filter: Severity | "all" = "all";

	constructor(private plugin: UniverseViewPlugin) {
		super(plugin.app);
	}

	onOpen() {
		this.modalEl.addClass("universeview-validate-modal", "universeview-scope");
		this.titleEl.setText("Check UniverseView data");
		this.render();
	}

	private render() {
		const { contentEl } = this;
		contentEl.empty();
		const issues = validate(this.plugin.index);
		const counts = { error: 0, warning: 0, info: 0 };
		issues.forEach((i) => counts[i.severity]++);
		const summary = el("div", { cls: "universeview-validate-summary" }, contentEl);
		const total = this.plugin.index.entities.size;
		el("span", { text: `${total} notes checked.` }, summary);
		const tabs = el("div", { cls: "universeview-validate-tabs" }, contentEl);
		const tab = (key: Severity | "all", label: string) => {
			const b = el("button", { cls: "universeview-chip" + (this.filter === key ? " is-active" : ""), text: label }, tabs);
			b.addEventListener("click", () => {
				this.filter = key;
				this.render();
			});
		};
		tab("all", `All ${issues.length}`);
		tab("error", `Errors ${counts.error}`);
		tab("warning", `Warnings ${counts.warning}`);
		tab("info", `Notes ${counts.info}`);
		const list = el("div", { cls: "universeview-validate-list" }, contentEl);
		const shown = issues.filter((i) => this.filter === "all" || i.severity === this.filter);
		if (!shown.length) {
			const ok = el("div", { cls: "universeview-validate-ok" }, list);
			const ic = el("span", {}, ok);
			icon(ic, "circle-check");
			el("span", { text: issues.length ? "Nothing in this category." : "Everything looks consistent." }, ok);
			return;
		}
		for (const issue of shown.slice(0, 500)) this.row(list, issue);
	}

	private row(list: HTMLElement, issue: Issue) {
		const row = el("div", { cls: `universeview-validate-row is-${issue.severity}` }, list);
		const ic = el("span", { cls: "universeview-validate-icon" }, row);
		icon(ic, ICONS[issue.severity]);
		const body = el("div", {}, row);
		const name = el("a", { cls: "internal-link", text: issue.name }, body);
		name.addEventListener("click", (evt) => {
			openEntity(this.plugin, issue.key, evt);
			this.close();
		});
		el("div", { cls: "universeview-validate-msg", text: issue.message }, body);
		// Inspect for anything; a one-click fix where the fix is clear.
		const acts = el("div", { cls: "universeview-validate-actions" }, body);
		const btn = (ic: string, text: string, run: (b: HTMLButtonElement) => void | Promise<void>, cls = "") => {
			const b = el("button", { cls }, acts);
			icon(el("span", {}, b), ic);
			el("span", { text }, b);
			b.addEventListener("click", () => {
				b.disabled = true;
				void Promise.resolve(run(b)).finally(() => (b.disabled = false));
			});
		};
		const fix = issue.fix;
		if (fix?.kind === "create") {
			const n = fix.items.length;
			btn("file-plus", n === 1 ? `Create ${fix.items[0].name}` : `Create the ${n} notes`, async () => {
				const from = this.app.vault.getAbstractFileByPath(issue.key);
				const folder = from?.parent?.path ?? "";
				for (const it of fix.items) {
					if (this.plugin.index.findByName(it.name)) continue;
					const target = this.plugin.settings.newNoteFolders?.[it.type] || folder;
					await this.plugin.createEntityNote(it.name, target, { type: it.type }, it.type);
				}
				new Notice(`Created ${n === 1 ? fix.items[0].name : `${n} notes`}${folder ? ` in ${folder}` : ""}.`);
				window.setTimeout(() => this.render(), 600);
			}, "mod-cta");
		} else if (fix?.kind === "place") {
			btn("map-pin-plus", "Place it on the map", () => {
				this.close();
				void this.plugin.placeOnMap(issue.key);
			}, "mod-cta");
		} else if (fix?.kind === "alias") {
			const target = this.plugin.index.get(fix.target);
			btn("tag", `Make it an alias of ${target?.name ?? "that note"}`, async () => {
				const file = this.app.vault.getAbstractFileByPath(fix.target);
				if (!(file instanceof TFile)) return;
				await this.plugin.editFrontmatter(file, (front) => {
					const key = "alias" in front && !("aliases" in front) ? "alias" : "aliases";
					front[key] = [...readAliases(front[key], file.basename), fix.name];
				}, "Add an alias");
				new Notice(`${fix.name} now finds ${file.basename}.`);
				window.setTimeout(() => this.render(), 600);
			}, "mod-cta");
		} else if (fix?.kind === "create-map") {
			btn("map", `Create the map note “${fix.name}”`, async () => {
				const from = this.app.vault.getAbstractFileByPath(issue.key);
				await this.plugin.createEntityNote(fix.name, this.plugin.settings.newNoteFolders?.map || from?.parent?.path || "", { type: "map" }, "map");
				new Notice(`Created the map note ${fix.name}: add its picture with image: in the note.`);
				window.setTimeout(() => this.render(), 600);
			}, "mod-cta");
		}
		btn("panel-right", "Inspect", () => {
			this.close();
			void this.plugin.inspect(issue.key, "edit");
		});
	}

	onClose() {
		this.contentEl.empty();
	}
}
