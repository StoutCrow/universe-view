import { pluginEnabled } from "../internals";
import { Modal, Notice, TFile } from "obsidian";
import type ChroniclePlugin from "../main";
import { ENTITY_TYPES, Entity, EntityType } from "../types";
import { KinFinding, NoteInfo, TypeGuess, findKinship, guessType, incomingLinks } from "../detect/classify";
import { TAG_TYPES } from "../index/reader";
import { TYPE_LABELS, el, icon, openEntity } from "../render/common";

type TypeStyle = "tag" | "cr_type" | "type";

interface TypeRow {
	file: TFile;
	guess: TypeGuess;
	chosen: EntityType | "";
	checked: boolean;
}

interface KinRow {
	person: Entity;
	finding: KinFinding;
	/** Property it will be written to: father, mother, parents, spouse, children, betrothed. */
	field: string;
	checked: boolean;
}

const DEFAULT_TAGS: Record<EntityType, string> = { person: "Character", event: "Event", culture: "Group", place: "Place", map: "Map" };

/**
 * Finds notes that look like people, places, groups or events but have no type yet, and family
 * relationships stated in the text ("son of [[X]]") that aren't properties yet. Nothing is written
 * until the user reviews the list and presses Apply.
 */
export class DetectModal extends Modal {
	private typeRows: TypeRow[] = [];
	private kinRows: KinRow[] = [];
	private style: TypeStyle = "type";
	private chartedRoots = false;
	private tagFor: Record<EntityType, string> = { ...DEFAULT_TAGS };
	private placeTags: string[] = [];
	private dateField = "date";
	private bodies = new Map<string, string>();
	private showSkipped = false;

	constructor(private plugin: ChroniclePlugin) {
		super(plugin.app);
	}

	async onOpen() {
		this.modalEl.addClass("chronicle-detect-modal", "chronicle-scope");
		this.titleEl.setText("Detect note types & relationships");
		this.contentEl.createDiv({ cls: "chronicle-detect-loading", text: "Reading notes…" });
		await this.scan();
		this.render();
	}

	private isTemplate(path: string): boolean {
		return this.plugin.index.isTemplate(path) || /(^|\/)[!_]*guide\//i.test(path);
	}

	private async scan() {
		const { app, plugin } = this;
		const idx = plugin.index;
		const files = app.vault.getMarkdownFiles().filter((f) => !this.isTemplate(f.path));
		const infos: (NoteInfo & { file: TFile })[] = [];
		for (const file of files) {
			const cache = app.metadataCache.getFileCache(file);
			const body = await app.vault.cachedRead(file);
			this.bodies.set(file.path, body);
			const props = { ...(cache?.frontmatter ?? {}) } as Record<string, unknown>;
			const tags = ([] as unknown[]).concat(props.tags ?? []).map(String);
			infos.push({ file, path: file.path, name: file.basename, props, tags, body });
		}
		this.detectConventions(infos);

		const incoming = incomingLinks(infos);
		for (const n of infos) {
			// Notes Charted Roots already typed (universes, timelines, sources…) are deliberate, not missing.
			if (idx.get(n.path) || n.props.cr_type) continue;
			const guess = guessType(n, incoming.get(n.name.toLowerCase()));
			this.typeRows.push({ file: n.file, guess, chosen: guess.type ?? "", checked: !!guess.type });
		}
		this.typeRows.sort((a, b) => Number(!!b.guess.type) - Number(!!a.guess.type) || a.file.path.localeCompare(b.file.path));

		for (const person of idx.all("person")) {
			const body = this.bodies.get(person.path) ?? "";
			const known = new Set(
				[...person.parents, ...person.children, ...person.partners.map((p) => p.ref), ...idx.children(person.key).map((k) => ({ name: idx.get(k)?.name ?? k }))]
					.map((r) => r.name.toLowerCase()),
			);
			for (const p of idx.partners(person.key)) known.add(p.ref.name.toLowerCase());
			for (const f of findKinship(person.name, body)) {
				const target = f.target.split("/").pop()!;
				if (known.has(target.toLowerCase())) continue;
				this.kinRows.push({ person, finding: { ...f, target }, field: this.fieldFor(f), checked: true });
			}
		}
	}

	/** Matches how the vault already stores things: type tags, Charted Roots' cr_type, or a type property. */
	private detectConventions(infos: NoteInfo[]) {
		const idx = this.plugin.index;
		let tagTyped = 0;
		let crTyped = 0;
		let propTyped = 0;
		const tagCounts = new Map<string, number>();
		let lifespanEvents = 0;
		let dateEvents = 0;
		for (const n of infos) {
			const e = idx.get(n.path);
			if (!e) continue;
			if (n.props.cr_type) crTyped++;
			else if (n.props.type || n.props.category) propTyped++;
			else if (n.tags.some((t) => TAG_TYPES[t.toLowerCase()])) tagTyped++;
			for (const t of n.tags) if (TAG_TYPES[t.toLowerCase()]) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
			if (e.type === "event") {
				if (n.props.lifespan) lifespanEvents++;
				if (n.props.date) dateEvents++;
			}
		}
		this.style = crTyped >= tagTyped && crTyped >= propTyped && crTyped > 0 ? "cr_type" : tagTyped > propTyped ? "tag" : "type";
		// The vault's own spelling of each type tag ("Character" rather than "person").
		for (const type of ENTITY_TYPES) {
			const best = [...tagCounts.entries()].filter(([t]) => TAG_TYPES[t.toLowerCase()] === type).sort((a, b) => b[1] - a[1])[0];
			if (best) this.tagFor[type] = best[0];
		}
		this.placeTags = [...tagCounts.keys()].filter((t) => TAG_TYPES[t.toLowerCase()] === "place");
		this.dateField = lifespanEvents > dateEvents ? "lifespan" : "date";
		this.chartedRoots = pluginEnabled(this.app, "charted-roots") || infos.some((n) => "father" in n.props || "mother" in n.props);
	}

	private fieldFor(f: KinFinding): string {
		switch (f.relation) {
			case "father":
			case "mother":
				return f.relation;
			case "parent": {
				const gender = this.plugin.index.findByName(f.target)?.gender ?? f.targetGender;
				if (gender === "m") return "father";
				if (gender === "f") return "mother";
				return this.chartedRoots ? "father" : "parents";
			}
			case "spouse":
				return this.chartedRoots ? "spouse" : "partners";
			case "child":
				return "children";
			case "betrothed":
				return "betrothed";
		}
	}

	/** For places, prefer a specific tag the vault uses ("City") when the note's opening mentions it. */
	private tagForRow(row: TypeRow): string {
		const type = row.chosen as EntityType;
		if (type === "place" && this.placeTags.length) {
			const opening = (this.bodies.get(row.file.path) ?? "").slice(0, 600).toLowerCase();
			const specific = this.placeTags.find((t) => new RegExp(`\\b${t.toLowerCase()}\\b`).test(opening));
			if (specific) return specific;
		}
		return this.tagFor[type];
	}

	private describeWrite(row: TypeRow): string {
		if (!row.chosen) return "";
		const parts: string[] = [];
		if (this.style === "tag") parts.push(`#${this.tagForRow(row)}`);
		else parts.push(`${this.style}: ${row.chosen === "culture" && this.style === "cr_type" ? "organization" : row.chosen}`);
		for (const [k, v] of Object.entries(row.guess.suggestions)) if (row.chosen === "event") parts.push(`${k === "date" ? this.dateField : k}: ${v}`);
		return "adds " + parts.join(", ");
	}

	private render() {
		const { contentEl } = this;
		contentEl.empty();
		const suggested = this.typeRows.filter((r) => r.guess.type);
		const skipped = this.typeRows.filter((r) => !r.guess.type);
		const styleText = this.style === "tag" ? "type tags (like #Character)" : this.style === "cr_type" ? "Charted Roots’ cr_type" : "a type property";
		el("p", {
			cls: "chronicle-detect-intro",
			text: `Nothing changes until you press Apply. Types are written as ${styleText}, matching how this vault already marks notes.`,
		}, contentEl);

		// ---- Types ----
		const typesHead = el("div", { cls: "chronicle-detect-head" }, contentEl);
		el("h3", { text: `Notes without a type (${suggested.length} look like entities)` }, typesHead);
		const list = el("div", { cls: "chronicle-detect-list" }, contentEl);
		if (!this.typeRows.length) el("div", { cls: "chronicle-detect-empty", text: "Every note that looks like an entity already has a type." }, list);
		for (const row of suggested) this.typeRow(list, row);
		if (skipped.length) {
			const toggle = el("button", { cls: "chronicle-chip", text: `${this.showSkipped ? "Hide" : "Show"} ${skipped.length} notes that look like concepts or articles` }, list);
			toggle.addEventListener("click", () => {
				this.showSkipped = !this.showSkipped;
				this.render();
			});
			if (this.showSkipped) for (const row of skipped) this.typeRow(list, row);
		}

		// ---- Relationships ----
		el("h3", { cls: "chronicle-detect-h", text: `Relationships written in the text (${this.kinRows.length})` }, contentEl);
		const kin = el("div", { cls: "chronicle-detect-list" }, contentEl);
		if (!this.kinRows.length) el("div", { cls: "chronicle-detect-empty", text: "No new family relationships found in people’s notes." }, kin);
		for (const row of this.kinRows) this.kinRow(kin, row);

		const footer = el("div", { cls: "modal-button-container" }, contentEl);
		const count = this.typeRows.filter((r) => r.checked && r.chosen).length + this.kinRows.filter((r) => r.checked).length;
		el("span", { cls: "chronicle-detect-count", text: `${count} change${count === 1 ? "" : "s"} selected` }, footer);
		const cancel = el("button", { text: "Cancel" }, footer);
		cancel.addEventListener("click", () => this.close());
		const apply = el("button", { cls: "mod-cta", text: "Apply" }, footer);
		apply.disabled = count === 0;
		apply.addEventListener("click", () => void this.apply());
	}

	private typeRow(parent: HTMLElement, row: TypeRow) {
		const r = el("div", { cls: "chronicle-detect-row" }, parent);
		const cb = el("input", { attr: { type: "checkbox" } }, r);
		cb.checked = row.checked;
		cb.addEventListener("change", () => {
			row.checked = cb.checked;
			this.render();
		});
		const main = el("div", { cls: "chronicle-detect-main" }, r);
		const name = el("a", { cls: "internal-link", text: row.file.basename }, main);
		name.addEventListener("click", (evt) => openEntity(this.plugin, row.file.path, evt));
		el("div", { cls: "chronicle-detect-sub", text: row.file.parent?.path && row.file.parent.path !== "/" ? row.file.parent.path : "Vault root" }, main);
		if (row.guess.reasons.length) el("div", { cls: "chronicle-detect-why", text: row.guess.reasons.join(" · ") }, main);
		const side = el("div", { cls: "chronicle-detect-side" }, r);
		const select = el("select", { cls: "dropdown" }, side);
		for (const [v, label] of [["", "Not an entity"], ...ENTITY_TYPES.map((t) => [t, TYPE_LABELS[t]])] as [string, string][]) {
			const o = el("option", { text: label }, select);
			o.value = v;
		}
		select.value = row.chosen;
		select.addEventListener("change", () => {
			row.chosen = select.value as EntityType | "";
			row.checked = !!row.chosen;
			this.render();
		});
		el("div", { cls: "chronicle-detect-write", text: this.describeWrite(row) }, side);
	}

	private kinRow(parent: HTMLElement, row: KinRow) {
		const r = el("div", { cls: "chronicle-detect-row" }, parent);
		const cb = el("input", { attr: { type: "checkbox" } }, r);
		cb.checked = row.checked;
		cb.addEventListener("change", () => {
			row.checked = cb.checked;
			this.render();
		});
		const main = el("div", { cls: "chronicle-detect-main" }, r);
		const line = el("div", { cls: "chronicle-detect-kin" }, main);
		const who = el("a", { cls: "internal-link", text: row.person.name }, line);
		who.addEventListener("click", (evt) => openEntity(this.plugin, row.person.key, evt));
		const arrow = el("span", { cls: "chronicle-detect-arrow" }, line);
		icon(arrow, "arrow-right");
		el("code", { text: `${row.field}: [[${row.finding.target}]]` }, line);
		el("div", { cls: "chronicle-detect-quote", text: `“${row.finding.sentence}”` }, main);
		const side = el("div", { cls: "chronicle-detect-side" }, r);
		const select = el("select", { cls: "dropdown" }, side);
		for (const f of ["father", "mother", "parents", "spouse", "partners", "children", "betrothed"]) {
			const o = el("option", { text: f }, select);
			o.value = f;
		}
		select.value = row.field;
		select.addEventListener("change", () => {
			row.field = select.value;
			this.render();
		});
	}

	private async apply() {
		const fm = this.app.fileManager;
		let changed = 0;
		for (const row of this.typeRows) {
			if (!row.checked || !row.chosen) continue;
			const type = row.chosen;
			await fm.processFrontMatter(row.file, (front: Record<string, unknown>) => {
				if (this.style === "tag") {
					const tags = ([] as unknown[]).concat(front.tags ?? []).filter((t) => t !== null && t !== "").map(String);
					const tag = this.tagForRow(row);
					if (!tags.includes(tag)) front.tags = [tag, ...tags];
				} else if (this.style === "cr_type") {
					front.cr_type = type === "culture" ? "organization" : type;
					front.name ??= row.file.basename;
				} else {
					front[this.plugin.fieldName("type")] = type;
				}
				if (type === "event" && row.guess.suggestions.date && !front[this.dateField]) front[this.dateField] = row.guess.suggestions.date;
			});
			changed++;
		}
		for (const row of this.kinRows) {
			if (!row.checked) continue;
			const link = `[[${row.finding.target}]]`;
			await fm.processFrontMatter(row.person.file, (front: Record<string, unknown>) => {
				const single = row.field === "father" || row.field === "mother";
				const current = front[row.field];
				if (single) {
					if (!current) front[row.field] = link;
					return;
				}
				const list = ([] as unknown[]).concat(current ?? []).filter((v) => v !== null && v !== "");
				if (!list.some((v) => String(v).toLowerCase() === link.toLowerCase())) list.push(link);
				front[row.field] = list;
			});
			changed++;
		}
		new Notice(`UniverseView updated ${changed} note${changed === 1 ? "" : "s"}.`);
		this.close();
	}

	onClose() {
		this.contentEl.empty();
	}
}
