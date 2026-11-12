import { Modal, Notice, Setting, normalizePath, stringifyYaml } from "obsidian";
import type UniverseViewPlugin from "../main";
import { GedData, parseGedcom } from "../import/gedcom";
import { el } from "../render/common";

export class GedcomModal extends Modal {
	private data?: GedData;
	private folder: string;
	private placeFolder: string;
	private eventFolder: string;
	private withEvents = false;
	private statusEl!: HTMLElement;
	private importBtn!: HTMLButtonElement;

	constructor(private plugin: UniverseViewPlugin) {
		super(plugin.app);
		this.folder = plugin.settings.newNoteFolders.person || "People";
		this.placeFolder = plugin.settings.newNoteFolders.place || "Places";
		this.eventFolder = plugin.settings.newNoteFolders.event || "Events";
	}

	onOpen() {
		this.titleEl.setText("Import a GEDCOM family tree");
		const { contentEl } = this;
		el("p", { cls: "setting-item-description", text: "Creates one note per person with birth, death, parents and partners. Existing notes with the same name are left untouched." }, contentEl);
		new Setting(contentEl).setName("GEDCOM file").setDesc(".ged files exported from Ancestry, FamilySearch, Gramps, MyHeritage…").addButton((b) => {
			const input = el("input", { attr: { type: "file", accept: ".ged,.gedcom,text/plain" } });
			input.hide();
			contentEl.appendChild(input);
			b.setButtonText("Choose file…").onClick(() => input.click());
			input.addEventListener("change", () => void (async () => {
				const file = input.files?.[0];
				if (!file) return;
				try {
					this.data = parseGedcom(await file.text());
					this.statusEl.setText(`${file.name}: ${this.data.people.size} people, ${this.data.families.size} families.`);
					this.importBtn.disabled = this.data.people.size === 0;
				} catch (err) {
					this.statusEl.setText(`Couldn't read file: ${(err as Error).message}`);
				}
			})());
		});
		new Setting(contentEl).setName("People folder").addText((t) => t.setValue(this.folder).onChange((v) => (this.folder = v)));
		new Setting(contentEl)
			.setName("Also create events and places")
			.setDesc("Births, marriages and deaths become event notes linked to place notes, so they show on the timeline and map.")
			.addToggle((t) => t.setValue(this.withEvents).onChange((v) => (this.withEvents = v)));
		this.statusEl = el("div", { cls: "universeview-import-status", text: "No file chosen." }, contentEl);
		const footer = el("div", { cls: "modal-button-container" }, contentEl);
		this.importBtn = el("button", { cls: "mod-cta", text: "Import" }, footer);
		this.importBtn.disabled = true;
		this.importBtn.addEventListener("click", () => void this.run());
	}

	private async run() {
		if (!this.data) return;
		this.importBtn.disabled = true;
		const { vault } = this.app;
		const p = this.plugin;
		const f = (x: Parameters<typeof p.fieldName>[0]) => p.fieldName(x);
		const names = new Map<string, string>();
		const used = new Set(vault.getMarkdownFiles().map((x) => x.basename.toLowerCase()));
		const unique = (base: string, hint?: string) => {
			let n = base;
			if (used.has(n.toLowerCase()) && hint) n = `${base} (${hint})`;
			let i = 2;
			while (used.has(n.toLowerCase())) n = `${base} ${i++}`;
			used.add(n.toLowerCase());
			return n;
		};
		for (const person of this.data.people.values()) {
			const year = person.born?.match(/-?\d{1,4}/)?.[0];
			names.set(person.id, unique(person.name.replace(/[\\/:*?"<>|#^[\]]/g, "-"), year ? `b. ${year}` : undefined));
		}
		const ensureFolder = async (folder: string) => {
			const path = normalizePath(folder);
			if (path && path !== "/" && !vault.getAbstractFileByPath(path)) await vault.createFolder(path);
			return path;
		};
		const write = async (folder: string, name: string, fm: Record<string, unknown>) => {
			const dir = await ensureFolder(folder);
			const path = normalizePath(`${dir}/${name}.md`);
			if (vault.getAbstractFileByPath(path)) return;
			await vault.create(path, `---\n${stringifyYaml(fm)}---\n`);
		};
		const placeNames = new Map<string, string>();
		const placeLink = async (plac?: string) => {
			if (!plac || !this.withEvents) return undefined;
			if (placeNames.has(plac)) return `[[${placeNames.get(plac)}]]`;
			const parts = plac.split(",").map((x) => x.trim()).filter(Boolean);
			let parentLink: string | undefined;
			// "Boston, Suffolk, Massachusetts" → nested places, outermost first.
			for (let i = parts.length - 1; i >= 0; i--) {
				const full = parts.slice(i).join(", ");
				if (!placeNames.has(full)) {
					const exists = p.index.findByName(parts[i]);
					const name = exists ? exists.name : parts[i];
					placeNames.set(full, name);
					if (!exists) {
						const fm: Record<string, unknown> = { [f("type")]: "place" };
						if (parentLink) fm[f("locatedIn")] = parentLink;
						await write(this.placeFolder, name, fm);
					}
				}
				parentLink = `[[${placeNames.get(full)}]]`;
			}
			return parentLink;
		};

		let count = 0;
		const notice = new Notice("Importing…", 0);
		try {
			for (const person of this.data.people.values()) {
				const fm: Record<string, unknown> = { [f("type")]: "person" };
				if (person.born) fm[f("born")] = person.born;
				if (person.died) fm[f("died")] = person.died;
				if (person.gender) fm[f("gender")] = person.gender;
				const parents: string[] = [];
				for (const famId of person.famc) {
					const fam = this.data.families.get(famId);
					for (const id of [fam?.husband, fam?.wife]) if (id && names.has(id)) parents.push(`[[${names.get(id)}]]`);
				}
				if (parents.length) fm[f("parents")] = [...new Set(parents)];
				const partners: unknown[] = [];
				for (const famId of person.fams) {
					const fam = this.data.families.get(famId);
					const other = fam && (fam.husband === person.id ? fam.wife : fam.husband);
					if (!other || !names.has(other)) continue;
					// Only one side stores the partnership; the index infers the reverse.
					if (other < person.id) continue;
					const entry: Record<string, unknown> = { person: `[[${names.get(other)}]]` };
					if (fam.married) entry.from = fam.married;
					if (fam.divorced) entry.to = fam.divorced === "unknown" ? undefined : fam.divorced;
					if (fam.divorced) entry.kind = "divorced";
					partners.push(Object.keys(entry).length === 1 ? entry.person : JSON.parse(JSON.stringify(entry)));
				}
				if (partners.length) fm[f("partners")] = partners;
				await write(this.folder, names.get(person.id)!, fm);
				count++;
				if (this.withEvents) {
					const name = names.get(person.id)!;
					if (person.born) {
						const place = await placeLink(person.birthPlace);
						await write(this.eventFolder, `Birth of ${name}`, { [f("type")]: "event", [f("date")]: person.born, [f("participants")]: [`[[${name}]]`], ...(place ? { [f("places")]: [place] } : {}), [f("importance")]: 2 });
					}
					if (person.died) {
						const place = await placeLink(person.deathPlace);
						await write(this.eventFolder, `Death of ${name}`, { [f("type")]: "event", [f("date")]: person.died, [f("participants")]: [`[[${name}]]`], ...(place ? { [f("places")]: [place] } : {}), [f("importance")]: 2 });
					}
				}
				if (count % 25 === 0) notice.setMessage(`Importing… ${count} people`);
			}
			if (this.withEvents) {
				for (const fam of this.data.families.values()) {
					if (!fam.married || !fam.husband || !fam.wife || !names.has(fam.husband) || !names.has(fam.wife)) continue;
					const a = names.get(fam.husband)!;
					const b = names.get(fam.wife)!;
					const place = await placeLink(fam.marriagePlace);
					await write(this.eventFolder, `Marriage of ${a} and ${b}`, { [f("type")]: "event", [f("date")]: fam.married, [f("participants")]: [`[[${a}]]`, `[[${b}]]`], ...(place ? { [f("places")]: [place] } : {}), [f("importance")]: 2 });
				}
			}
			notice.hide();
			new Notice(`Imported ${count} people.`);
			this.close();
		} catch (err) {
			notice.hide();
			new Notice(`Import stopped: ${(err as Error).message}`);
			this.importBtn.disabled = false;
		}
	}

	onClose() {
		this.contentEl.empty();
	}
}
