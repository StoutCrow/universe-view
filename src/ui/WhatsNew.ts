import { Component, MarkdownRenderer, Modal, type App } from "obsidian";
import type ChroniclePlugin from "../main";
import { compareVersions, parseChangelog, type ChangelogEntry } from "../index/changelog";

/** The changelog, put into the code when it's built (CHANGELOG.md), so the history travels with the plugin. */
declare const UV_CHANGELOG: string | undefined;

/** The changelog built into this copy of UniverseView (empty when it was built without one). */
export function builtInChangelog(): ChangelogEntry[] {
	return typeof UV_CHANGELOG === "string" ? parseChangelog(UV_CHANGELOG) : [];
}

/** Each version as a folded section (the first few open), its notes rendered. Shared by the window and the About settings. */
export function renderHistory(app: App, host: HTMLElement, entries: ChangelogEntry[], component: Component, open: number) {
	entries.forEach((e, n) => {
		const sec = host.createEl("details", { cls: "uv-whatsnew-entry" });
		if (n < open) sec.open = true;
		const sum = sec.createEl("summary");
		sum.createSpan({ cls: "uv-whatsnew-version", text: e.version });
		if (e.date) sum.createSpan({ cls: "uv-whatsnew-date", text: e.date });
		const body = sec.createDiv({ cls: "uv-whatsnew-body markdown-rendered" });
		void MarkdownRenderer.render(app, e.body, body, "", component);
	});
}

/**
 * What's new: the versions since the one you last saw (after an update), or the whole history.
 * Each version is a section; the full history is a click away.
 */
export class WhatsNewModal extends Modal {
	private component = new Component();

	constructor(private plugin: ChroniclePlugin, private since?: string) {
		super(plugin.app);
	}

	onOpen() {
		this.component.load();
		this.modalEl.addClass("uv-whatsnew", "chronicle-scope");
		this.render(this.since);
	}

	private render(since?: string) {
		const { contentEl } = this;
		contentEl.empty();
		const all = builtInChangelog();
		const running = this.plugin.manifest.version;
		const shown = since ? all.filter((e) => compareVersions(e.version, since) > 0) : all;
		this.titleEl.setText(since ? `What's new in UniverseView ${running}` : "UniverseView: version history");
		if (since && shown.length) contentEl.createEl("p", { cls: "uv-whatsnew-sub", text: `Since ${since}, the version you had before.` });
		if (!shown.length) contentEl.createEl("p", { cls: "uv-whatsnew-sub", text: all.length ? "Nothing new since you last looked." : "This copy was built without its version history." });
		const list = contentEl.createDiv({ cls: "uv-whatsnew-list" });
		renderHistory(this.app, list, shown, this.component, since ? 6 : 1);
		const foot = contentEl.createDiv({ cls: "uv-whatsnew-foot" });
		if (since) foot.createEl("button", { text: "Full version history" }).addEventListener("click", () => this.render());
		foot.createEl("button", { cls: "mod-cta", text: "Close" }).addEventListener("click", () => this.close());
	}

	onClose() {
		this.component.unload();
		this.contentEl.empty();
	}
}
