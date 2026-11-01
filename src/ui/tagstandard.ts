import { Modal, Notice, Setting, TFile } from "obsidian";
import type ChroniclePlugin from "../main";
import type { Entity } from "../types";
import { DEFAULT_REGION_WORDS, chainOf, tierLabel, tierName, tierRenamed, tierWords, tierWordsWith } from "../index/realms";
import { el, icon } from "../render/common";

/**
 * One standard for tagging land, so every note says the same things the same way:
 *
 *   Ruled land (a title):  #Title  #<Tier>   #Region_<Size>     e.g. #Title #Province #Region_Small
 *   A settlement:          #<Kind> #<Kind>_<Size>               e.g. #City #City_Huge
 *   Geography (a region):  #Region #Region_<Size> [#<Landform>] e.g. #Region #Region_Enormous
 *
 * A region is geography (a continent, a sub-continent, an island, a forest): it holds land but nobody
 * rules it and it is never anyone's liege. A title is ruled land (a kingdom, a duchy, a county), held
 * by someone and answering to the title above it. North America is a region; the United States, a country in it, is a title.
 */

const BUILT_IN_TIERS: [string, string, string][] = [
	["1", "Empire", "Empire"],
	["2", "Kingdom / realm", "Realm"],
	["3", "Duchy / province", "Province"],
	["4", "County", "County"],
	["5", "Barony / lordship", "Barony"],
	["6", "Settlement (city, town, fort…)", ""],
];

/** Each realm tier: its value, its label and the tag written for it (a renamed tier writes its own name: #State). */
export function realmTiers(): [string, string, string][] {
	return BUILT_IN_TIERS.map(([v, label, tag]) => {
		const t = Number(v);
		if (!tierRenamed(t)) return [v, label, tag];
		const name = tierName(t);
		return [v, t === 6 ? `${name} (or a town, fort…)` : name, t === 6 ? "" : name.replace(/\s+/g, "")];
	});
}
export const SETTLEMENT_KINDS = ["City", "Town", "Village", "Castle", "Fort", "Fortress", "Settlement"];
export const LANDFORMS = ["", "Continent", "Island", "Archipelago", "Peninsula", "Mountains", "Highlands", "Forest", "Valley", "Plains", "Desert", "Coast", "Marsh", "Sea", "Lake"];
export const SIZES: [string, string, string][] = [
	// [tag word, as a title, as geography]
	["", "No size", "No size"],
	["Gigantic", "Gigantic", "Gigantic: a continent"],
	["Enormous", "Enormous", "Enormous: a sub-continent"],
	["Huge", "Huge", "Huge: a great region"],
	["Large", "Large", "Large: a region"],
	["Medium", "Medium", "Medium: a region"],
	["Small", "Small", "Small: a land"],
	["Tiny", "Tiny", "Tiny: a locale"],
];

export interface TagChoice {
	nature: "realm" | "region";
	/** Realm tier "1"…"6"; unused for regions. */
	tier: string;
	/** For settlements: City, Town, Fort… */
	settlement: string;
	/** For regions: Island, Forest… or "". */
	landform: string;
	size: string;
}

const SIZE_WORDS = new Set(SIZES.map((s) => s[0].toLowerCase()).filter(Boolean).concat(["massive", "big", "major", "minor", "little", "middling"]));

/** What a note is now, read the way the realm tree reads it. */
export function readChoice(plugin: ChroniclePlugin, e: Entity): TagChoice {
	const node = plugin.realms().nodes.get(e.key);
	const tags = e.tags.map((t) => t.replace(/^#/, ""));
	const size = tags.map((t) => t.split("_")).find((p) => p.length === 2 && SIZE_WORDS.has(p[1].toLowerCase()))?.[1] ?? "";
	const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
	const settlement = SETTLEMENT_KINDS.find((k) => tags.some((t) => t.toLowerCase() === k.toLowerCase()) || e.category === k.toLowerCase()) ?? "City";
	const landform = LANDFORMS.find((l) => l && tags.some((t) => t.toLowerCase() === l.toLowerCase())) ?? "";
	// Nothing says its tier yet: a realm note (a group) is most likely a kingdom, a place a county.
	const tier = node && node.nature !== "region" && node.rank < 9 ? String(Math.max(1, Math.min(6, Math.round(node.rank)))) : e.type === "culture" ? "2" : "4";
	return { nature: node?.nature ?? "realm", tier, settlement, landform, size: SIZES.some((s) => s[0] === cap(size)) ? cap(size) : "" };
}

/** The tags a choice stands for. */
export function choiceTags(c: TagChoice): string[] {
	const size = c.size ? `_${c.size}` : "";
	if (c.nature === "region") return ["Region", ...(c.size ? [`Region${size}`] : []), ...(c.landform && c.landform !== "Continent" ? [c.landform] : [])];
	if (c.tier === "6") return [c.settlement, ...(c.size ? [`${c.settlement}${size}`] : [])];
	const tierTag = realmTiers().find((t) => t[0] === c.tier)?.[2] ?? "Province";
	return ["Title", tierTag, ...(c.size ? [`Region${size}`] : [])];
}

/**
 * A note's tags with the land tags swapped for the standard ones: anything naming a tier, a kind
 * of settlement, a region or a size goes; other tags (#Nation_United_States, #City_Capital, type tags) stay.
 */
export function restandardise(plugin: ChroniclePlugin, tags: string[], c: TagChoice): string[] {
	const words = tierWordsWith(plugin.settings.tierWords);
	const regionWords = { ...DEFAULT_REGION_WORDS, ...tierWords(plugin.settings.regionWords ?? "") };
	// The vault's own type tags (#Location, #Character…) are never touched.
	const typeTags = new Set(Object.values(plugin.settings.typeTags).map((x) => x.toLowerCase().replace(/^#/, "")));
	const land = (t: string) => {
		if (plugin.settings.typeStyle === "tag" && typeTags.has(t.replace(/^#/, "").toLowerCase())) return false;
		const parts = t.replace(/^#/, "").toLowerCase().split(/[_/\s-]+/);
		const head = parts[0];
		const isWord = head === "title" || words[head] !== undefined || regionWords[head] !== undefined;
		if (parts.length === 1) return isWord;
		return parts.length === 2 && isWord && SIZE_WORDS.has(parts[1]);
	};
	const kept = tags.map((t) => t.replace(/^#/, "")).filter((t) => !land(t));
	const out = [...choiceTags(c), ...kept];
	return out.filter((t, i) => out.findIndex((x) => x.toLowerCase() === t.toLowerCase()) === i);
}

/**
 * The three questions, with what they mean: ruled land or geography, which tier (or landform),
 * and how big. Calls back with each change.
 */
export function standardFields(parent: HTMLElement, c: TagChoice, onChange: (c: TagChoice) => void) {
	const box = el("div", { cls: "uv-std" }, parent);
	const draw = () => {
		box.empty();
		const what = el("div", { cls: "uv-std-nature" }, box);
		const opt = (id: "realm" | "region", ic: string, title: string, desc: string) => {
			const b = el("button", { cls: "uv-std-card" + (c.nature === id ? " is-active" : "") }, what);
			icon(el("span", { cls: "uv-std-card-icon" }, b), ic);
			el("strong", { text: title }, b);
			el("span", { text: desc }, b);
			b.addEventListener("click", (evt) => {
				evt.preventDefault();
				c.nature = id;
				onChange(c);
				draw();
			});
		};
		opt("realm", "crown", "Ruled land (a title)", "A kingdom, duchy, county or city. Someone holds it, and it answers to the title above it.");
		opt("region", "mountain", "Geography (a region)", "A continent, sub-continent, island or forest. Nobody rules it; realms lie in it.");
		if (c.nature === "realm") {
			new Setting(box).setName("Tier").setDesc("Its rank among titles: what it rules and answers to.").addDropdown((d) => {
				for (const [v, label] of realmTiers()) d.addOption(v, label);
				d.setValue(c.tier).onChange((v) => {
					c.tier = v;
					onChange(c);
					draw();
				});
			});
			if (c.tier === "6") {
				new Setting(box).setName("Kind of settlement").addDropdown((d) => {
					for (const k of SETTLEMENT_KINDS) d.addOption(k, k);
					d.setValue(c.settlement).onChange((v) => {
						c.settlement = v;
						onChange(c);
					});
				});
			}
		} else {
			new Setting(box).setName("Landform").setDesc("Optional: what kind of land it is.").addDropdown((d) => {
				for (const l of LANDFORMS) d.addOption(l, l || "Just a region");
				d.setValue(c.landform).onChange((v) => {
					c.landform = v;
					if (v === "Continent" && !c.size) c.size = "Gigantic";
					onChange(c);
					draw();
				});
			});
		}
		new Setting(box)
			.setName("Size")
			.setDesc(c.nature === "region" ? "For geography the size is its scale: gigantic is a continent, enormous a sub-continent." : "Between titles of the same tier: a small duchy, a huge kingdom.")
			.addDropdown((d) => {
				for (const [v, asTitle, asRegion] of SIZES) d.addOption(v, c.nature === "region" ? asRegion : asTitle);
				d.setValue(c.size).onChange((v) => {
					c.size = v;
					onChange(c);
					draw();
				});
			});
		el("div", { cls: "uv-std-tags", text: `Tags: ${choiceTags(c).map((t) => "#" + t).join(" ")}` }, box);
	};
	draw();
	return box;
}

/**
 * Every place and realm in a review list: what it is now, what its tags would become, and where it
 * sits. Change any row; Apply writes the standard tags to the notes that changed.
 */
export class TagStandardModal extends Modal {
	constructor(private plugin: ChroniclePlugin, private world?: string) {
		super(plugin.app);
	}

	onOpen() {
		const p = this.plugin;
		this.modalEl.addClass("chronicle-scope", "chronicle-tool-modal", "uv-std-modal");
		this.titleEl.setText("Standardise land tags");
		const { contentEl } = this;
		el("p", { cls: "chronicle-dash-muted", text: "One way to tag land. Ruled land: #Title, its tier (#Realm, #Province, #County…) and #Region_<Size>. Settlements: #City and #City_<Size>. Geography: #Region, #Region_<Size> (gigantic is a continent, enormous a sub-continent) and a landform. Other tags such as #Nation_United_States stay. Only rows you change, or that don't match the standard yet, are written." }, contentEl);
		const tree = p.realms();
		const notes = p.index.all().filter((e) => tree.nodes.has(e.key) && (!this.world || e.path.startsWith(this.world + "/")));
		notes.sort((a, b) => chainOf(tree, a.key).map((k) => p.index.get(k)?.name).join("›").localeCompare(chainOf(tree, b.key).map((k) => p.index.get(k)?.name).join("›")));
		const rows: { e: Entity; c: TagChoice; next: () => string[] }[] = [];
		const filter = el("input", { cls: "uv-std-filter", attr: { type: "search", placeholder: "Filter by name…" } }, contentEl);
		const onlyOff = el("label", { cls: "uv-std-only" }, contentEl);
		const only = el("input", { attr: { type: "checkbox" } }, onlyOff);
		el("span", { text: "Only notes that don't match yet" }, onlyOff);
		const list = el("div", { cls: "uv-std-list" }, contentEl);
		const same = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.some((y) => y.toLowerCase() === x.toLowerCase()));
		for (const e of notes) {
			const c = readChoice(p, e);
			const before = e.tags.map((t) => t.replace(/^#/, ""));
			const next = () => restandardise(p, before, c);
			rows.push({ e, c, next });
			const row = el("div", { cls: "uv-std-row" }, list);
			row.dataset.name = e.name.toLowerCase();
			const head = el("div", { cls: "uv-std-row-head" }, row);
			const node = tree.nodes.get(e.key);
			el("strong", { text: e.name }, head);
			el("span", { cls: "uv-std-badge", text: tierLabel(node) || (node?.nature === "region" ? "Region" : "Title") }, head);
			const where = [node?.under ? `under ${p.index.get(node.under)?.name}` : node?.nature === "realm" ? "sovereign" : "", node?.region && node.region !== node.under ? `lies in ${p.index.get(node.region)?.name}` : ""].filter(Boolean).join(" · ");
			el("span", { cls: "chronicle-dash-muted", text: where }, head);
			const now = el("div", { cls: "uv-std-now" }, row);
			const show = () => {
				const n = next();
				const ok = same(n, before);
				row.toggleClass("is-standard", ok);
				now.setText(ok ? `✓ ${before.map((t) => "#" + t).join(" ")}` : `${before.map((t) => "#" + t).join(" ") || "(no tags)"}  →  ${n.map((t) => "#" + t).join(" ")}`);
			};
			const line = el("div", { cls: "uv-std-inline" }, row);
			const sel = (opts: [string, string][], v: string, put: (v: string) => void) => {
				const s = el("select", { cls: "dropdown" }, line);
				for (const [k, label] of opts) s.add(new Option(label, k));
				s.value = v;
				s.addEventListener("change", () => {
					put(s.value);
					redraw();
				});
				return s;
			};
			const redraw = () => {
				line.empty();
				sel([["realm", "Ruled land"], ["region", "Geography"]], c.nature, (v) => (c.nature = v as TagChoice["nature"]));
				if (c.nature === "realm") {
					sel(realmTiers().map(([v, l]) => [v, l]), c.tier, (v) => (c.tier = v));
					if (c.tier === "6") sel(SETTLEMENT_KINDS.map((k) => [k, k]), c.settlement, (v) => (c.settlement = v));
				} else sel(LANDFORMS.map((l) => [l, l || "Region"]), c.landform, (v) => (c.landform = v));
				sel(SIZES.map(([v, a, b]) => [v, c.nature === "region" ? b : a]), c.size, (v) => (c.size = v));
				show();
			};
			redraw();
		}
		const applyFilter = () => {
			const q = filter.value.trim().toLowerCase();
			for (const r of Array.from(list.children) as HTMLElement[]) r.toggleClass("is-hidden", (!!q && !r.dataset.name?.includes(q)) || (only.checked && r.hasClass("is-standard")));
		};
		filter.addEventListener("input", applyFilter);
		only.addEventListener("change", applyFilter);
		const footer = el("div", { cls: "modal-button-container" }, contentEl);
		el("button", { text: "Cancel" }, footer).addEventListener("click", () => this.close());
		const go = el("button", { cls: "mod-cta", text: "Apply" }, footer);
		go.addEventListener("click", () => void (async () => {
			go.disabled = true;
			let n = 0;
			for (const r of rows) {
				const before = r.e.tags.map((t) => t.replace(/^#/, ""));
				const next = r.next();
				if (same(next, before)) continue;
				const file = p.app.vault.getAbstractFileByPath(r.e.path);
				if (!(file instanceof TFile)) continue;
				await p.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
					// Tags written in the body stay there; the land tags go in the properties.
					const own = ([] as unknown[]).concat(fm.tags ?? []).map((t) => String(t).replace(/^#/, ""));
					fm.tags = restandardise(p, own, r.c);
				});
				n++;
			}
			new Notice(`Standardised the tags of ${n} note${n === 1 ? "" : "s"}.`);
			this.close();
		})());
	}

	onClose() {
		this.contentEl.empty();
	}
}
