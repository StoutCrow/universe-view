import { Modal, Notice, Setting } from "obsidian";
import type ChroniclePlugin from "../main";
import { formatDay } from "../dates/parser";
import { REL_KINDS, presetKinds } from "../index/relkinds";
import { SPEED_KM } from "../render/travel";
import { el } from "../render/common";

const MODES: [string, string][] = [["foot", "On foot"], ["horse", "By horse"], ["wagon", "By wagon"], ["boat", "By river boat"], ["ship", "By ship"]];

/**
 * A world's settings with proper controls: its calendar, today's date, main map, travel speeds,
 * how its houses inherit and which relationships new notes start with. Saved in the world note
 * (made when the world doesn't have one), where they can also be edited as properties.
 */
export class WorldSettingsModal extends Modal {
	constructor(private plugin: ChroniclePlugin, private folder: string) {
		super(plugin.app);
	}

	onOpen() {
		const p = this.plugin;
		const idx = p.index;
		const folder = this.folder;
		const world = idx.worlds.get(folder);
		this.containerEl.addClass("chronicle-scope-host");
		this.modalEl.addClass("chronicle-scope", "chronicle-tool-modal");
		this.titleEl.setText(`World settings: ${folder || this.app.vault.getName()}`);
		const box = this.contentEl;
		el("div", { cls: "setting-item-description", text: world ? `Saved in ${world.path}.` : "Saving makes a world note for this folder; these settings then apply to every note in it." }, box);
		const v = {
			calendar: world?.calendar ?? idx.calendarFor(folder),
			today: world?.today ?? "",
			map: world?.map ?? "",
			travel: { ...Object.fromEntries(MODES.map(([k]) => [k, SPEED_KM[k]])), ...(world?.travel ?? {}) } as Record<string, number>,
			succession: world?.succession ?? p.settings.successionRule,
			person: new Set(presetKinds("person", world?.presets.person || p.settings.relationPresets.person)),
			culture: new Set(presetKinds("culture", world?.presets.culture || p.settings.relationPresets.culture)),
		};
		if (!world?.today) {
			const t = p.todayFor(folder, v.calendar);
			if (t !== undefined) v.today = formatDay(t, p.calendars.get(v.calendar));
		}

		new Setting(box).setName("Calendar").addDropdown((d) => {
			for (const c of p.calendars.all()) d.addOption(c.id, c.name);
			d.setValue(v.calendar).onChange((x) => {
				v.calendar = x;
				check();
			});
		});
		const todaySetting = new Setting(box).setName("Today in the world").setDesc("The calendar's Today, and where open spans end");
		let check = () => {};
		todaySetting.addText((t) => {
			t.setPlaceholder("E.g. 16 Highsun SE 3").setValue(v.today);
			check = () => {
				const d = v.today.trim() ? p.parseDate(v.today, v.calendar) : null;
				todaySetting.setDesc(!v.today.trim() ? "The calendar's Today, and where open spans end" : d ? `= ${formatDay(d.start, p.calendars.get(v.calendar))}` : "This calendar can't read that date");
				todaySetting.descEl.toggleClass("mod-warning", !!v.today.trim() && !d);
			};
			t.onChange((x) => {
				v.today = x;
				check();
			});
			check();
		});
		const maps = idx.all("map").filter((m) => !folder || m.path.startsWith(folder + "/"));
		new Setting(box).setName("Main map").setDesc("Opens first in the map view for this world").addDropdown((d) => {
			d.addOption("", "(None)");
			for (const m of maps) d.addOption(m.name, m.name);
			d.setValue(v.map).onChange((x) => (v.map = x));
		});

		el("h4", { text: "Travel speeds (km a day)" }, box);
		el("div", { cls: "setting-item-description", text: "Used for journeys, travel times and the rings of how far you get in a day." }, box);
		const speeds = el("div", { cls: "chronicle-world-speeds" }, box);
		for (const [k, label] of MODES) {
			const cell = el("label", { cls: "chronicle-world-speed" }, speeds);
			el("span", { text: label }, cell);
			const input = el("input", { attr: { type: "number", min: "1", step: "1" } }, cell);
			input.value = String(v.travel[k] ?? "");
			input.addEventListener("change", () => (v.travel[k] = Number(input.value) || SPEED_KM[k]));
		}

		new Setting(box).setName("Succession").setDesc("How houses here inherit, unless a group sets its own").addDropdown((d) => d.addOptions({ absolute: "Eldest child first", "male-preference": "Sons before daughters", agnatic: "Sons only, through sons" }).setValue(v.succession).onChange((x) => (v.succession = x as typeof v.succession)));

		for (const [type, label] of [["person", "New people start with"], ["culture", "New groups start with"]] as const) {
			el("h4", { text: label }, box);
			const grid = el("div", { cls: "chronicle-world-kinds" }, box);
			for (const k of REL_KINDS.filter((x) => x.on.includes(type))) {
				const l = el("label", { cls: "chronicle-world-kind", attr: { title: k.desc } }, grid);
				const cb = el("input", { attr: { type: "checkbox" } }, l);
				cb.checked = v[type].has(k.key);
				cb.addEventListener("change", () => (cb.checked ? v[type].add(k.key) : v[type].delete(k.key)));
				el("span", { text: k.label }, l);
			}
		}

		new Setting(box)
			.addButton((b) => b.setButtonText("Open the world note").onClick(() => {
				this.close();
				void p.openWorldNote(folder);
			}))
			.addButton((b) => b.setButtonText("Save").setCta().onClick(async () => {
				const file = await p.ensureWorldNote(folder);
				await p.editFrontmatter(file, (f) => {
					f.type = f.type ?? "world";
					f.calendar = v.calendar;
					if (v.today.trim()) f.today = v.today.trim();
					else delete f.today;
					if (v.map) f.map = `[[${v.map}]]`;
					else delete f.map;
					f.travel = MODES.map(([k]) => `${k} ${Math.round(v.travel[k] ?? SPEED_KM[k])}`).join(", ");
					f.succession = v.succession;
					f["person-relations"] = REL_KINDS.filter((k) => v.person.has(k.key)).map((k) => k.key).join(", ");
					f["group-relations"] = REL_KINDS.filter((k) => v.culture.has(k.key)).map((k) => k.key).join(", ");
				}, `World settings for ${folder || "the vault"}`);
				new Notice("Saved the world settings.");
				this.close();
			}));
	}

	onClose() {
		this.contentEl.empty();
	}
}
