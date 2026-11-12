import { Modal, Notice } from "obsidian";
import type UniverseViewPlugin from "../main";
import type { Entity } from "../types";
import { parseDate } from "../dates/parser";
import { readNote, type Finding, type ReadField } from "../detect/reader";
import { buildFieldAliases, type FieldName } from "../settings";
import { el, icon, openEntity } from "../render/common";

interface Row {
	/** The note the fact goes on. */
	target: Entity;
	/** The note it was read in. */
	source: Entity;
	finding: Finding;
	checked: boolean;
}

const LABELS: Record<ReadField, string> = { born: "Born", died: "Died", birthPlace: "Born at", deathPlace: "Died at", occupation: "Occupation", date: "Date", founded: "Founded" };
const MAX_SHOWN = 300;

/** The properties each finding goes in, under the name the vault uses. */
const FIELDS: Partial<Record<ReadField, FieldName>> = { born: "born", died: "died", birthPlace: "birthPlace", deathPlace: "deathPlace", date: "date", founded: "founded" };

/** Reads the text of the vault's notes for facts their properties don't have, to review and add. */
export class SmartReaderModal extends Modal {
	private rows: Row[] = [];
	private countEl?: HTMLElement;
	private applyBtn?: HTMLButtonElement;

	/** With `only`, just that note. */
	constructor(private plugin: UniverseViewPlugin, private only?: Entity) {
		super(plugin.app);
	}

	async onOpen() {
		this.modalEl.addClass("universeview-detect-modal", "universeview-scope");
		this.titleEl.setText(this.only ? `Smart reader: ${this.only.name}` : "Smart reader");
		const status = this.contentEl.createDiv({ cls: "universeview-detect-loading", text: "Reading notes…" });
		await this.scan(status);
		this.render();
	}

	private has(e: Entity | undefined, field: ReadField): boolean {
		if (!e) return true;
		switch (field) {
			case "born": return e.type !== "person" || !!e.start;
			case "died": return e.type !== "person" || !!e.end;
			case "birthPlace": return !!e.birthPlace;
			case "deathPlace": return !!e.deathPlace;
			case "date": case "founded": return !!e.start;
			case "occupation": return ["occupation", "occupations", "profession", "job", "trade"].some((k) => k in e.props);
		}
	}

	private async scan(status: HTMLElement) {
		const { plugin, app } = this;
		const idx = plugin.index;
		const notes = this.only ? [this.only] : idx.all().filter((e) => e.type !== "map");
		const named = (name: string, ...types: string[]) => {
			const e = idx.findByName(name);
			return e && types.includes(e.type) ? e.name : undefined;
		};
		let done = 0;
		for (const e of notes) {
			const cal = plugin.calendars.get(e.calendar);
			const found = readNote(await app.vault.cachedRead(e.file), {
				name: e.name,
				type: e.type,
				has: (field, about) => this.has(about ? idx.findByName(about) : e, field),
				isDate: (text) => !!parseDate(text, cal),
				place: (name) => named(name, "place", "culture"),
				person: (name) => named(name, "person"),
			});
			for (const finding of found) {
				const target = finding.about ? idx.findByName(finding.about) : e;
				if (!target) continue;
				// The same fact in two notes is one suggestion.
				if (this.rows.some((r) => r.target === target && r.finding.field === finding.field)) continue;
				this.rows.push({ target, source: e, finding, checked: true });
			}
			// Keeps the window answering on a big vault.
			if (++done % 200 === 0) {
				status.setText(`Reading notes… ${done.toLocaleString()} of ${notes.length.toLocaleString()}`);
				await new Promise((r) => window.setTimeout(r));
			}
		}
		this.rows.sort((a, b) => a.target.name.localeCompare(b.target.name));
	}

	private render() {
		const { contentEl } = this;
		contentEl.empty();
		el("p", { cls: "universeview-detect-intro", text: "Facts written in your notes that their properties don't have yet. Nothing changes until you press Add, and Undo takes it all back in one step." }, contentEl);
		const list = el("div", { cls: "universeview-detect-list" }, contentEl);
		if (!this.rows.length) el("div", { cls: "universeview-detect-empty", text: "Nothing new: your notes' properties already say what their text does." }, list);
		for (const row of this.rows.slice(0, MAX_SHOWN)) this.row(list, row);
		if (this.rows.length > MAX_SHOWN) el("div", { cls: "universeview-detect-empty", text: `Showing the first ${MAX_SHOWN} of ${this.rows.length.toLocaleString()}. Add these, then run it again for the rest.` }, list);
		const footer = el("div", { cls: "modal-button-container" }, contentEl);
		this.countEl = el("span", { cls: "universeview-detect-count" }, footer);
		el("button", { text: "Cancel" }, footer).addEventListener("click", () => this.close());
		this.applyBtn = el("button", { cls: "mod-cta", text: "Add" }, footer);
		this.applyBtn.addEventListener("click", () => void this.apply());
		this.updateCount();
	}

	private shown() {
		return this.rows.slice(0, MAX_SHOWN).filter((r) => r.checked && r.finding.value.trim());
	}

	private updateCount() {
		const n = this.shown().length;
		this.countEl?.setText(`${n} fact${n === 1 ? "" : "s"} selected`);
		if (this.applyBtn) this.applyBtn.disabled = n === 0;
	}

	private row(parent: HTMLElement, row: Row) {
		const r = el("div", { cls: "universeview-detect-row" }, parent);
		const cb = el("input", { attr: { type: "checkbox", "aria-label": `Add ${LABELS[row.finding.field]} to ${row.target.name}` } }, r);
		cb.checked = row.checked;
		cb.addEventListener("change", () => {
			row.checked = cb.checked;
			this.updateCount();
		});
		const main = el("div", { cls: "universeview-detect-main" }, r);
		const line = el("div", { cls: "universeview-detect-kin" }, main);
		const who = el("a", { cls: "internal-link", text: row.target.name }, line);
		who.addEventListener("click", (evt) => openEntity(this.plugin, row.target.key, evt));
		icon(el("span", { cls: "universeview-detect-arrow" }, line), "arrow-right");
		el("span", { text: LABELS[row.finding.field] }, line);
		el("div", { cls: "universeview-detect-quote", text: `“${row.finding.quote}”${row.source !== row.target ? `, in ${row.source.name}` : ""}` }, main);
		const side = el("div", { cls: "universeview-detect-side" }, r);
		const value = el("input", { attr: { type: "text", "aria-label": "Value" } }, side);
		value.value = row.finding.value;
		value.addEventListener("input", () => {
			row.finding.value = value.value;
			this.updateCount();
		});
	}

	private async apply() {
		const { plugin } = this;
		const aliases = buildFieldAliases(plugin.settings.fieldAliases);
		const rows = this.shown();
		await plugin.undoGroup(`Smart reader: ${rows.length} fact${rows.length === 1 ? "" : "s"}`, async () => {
			for (const row of rows) {
				const field = FIELDS[row.finding.field];
				const names = field ? aliases[field] : ["occupation"];
				await plugin.editFrontmatter(row.target.file, (front) => {
					if (!names.some((k) => front[k])) front[names[0]] = row.finding.value.trim();
				});
			}
		});
		new Notice(`Added ${rows.length} fact${rows.length === 1 ? "" : "s"} to your notes.`);
		this.close();
	}

	onClose() {
		this.contentEl.empty();
	}
}
