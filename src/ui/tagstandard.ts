import { Menu, Modal, Notice, Setting, TFile } from "obsidian";
import { IconPickerModal } from "./icons";
import type UniverseViewPlugin from "../main";
import type { Entity, EntityType } from "../types";
import { TYPE_WORDS, factTag, kindTag, parseTag } from "../index/tagscheme";
import { DEFAULT_REGION_WORDS, REGION_SIZE_OFFSET, REGION_TIER_LABELS, SIZE, chainOf, regionLevelOf, tierLabel, tierName, tierRenamed, tierWords, tierWordsWith } from "../index/realms";
import { el, glyph, icon } from "../render/common";
import { LAND_FORMS, PLACE_ROLES, PLACE_STATUSES, STATUS_ICONS, SETTLEMENT_LADDER, defaultRoles, defaultStatuses, type PlaceTrait, normaliseKind, resolvePlace, usualSize } from "../index/placekinds";

/**
 * One standard for tagging land, so every note says the same things the same way:
 *
 * in the tag scheme (`index/tagscheme.ts`): the land's kind and its size.
 *
 *   Ruled land (a title):  #Place_<Tier>        #Place_Size_<Size>   e.g. #Place_Province #Place_Size_Small
 *   A settlement:          #Place_<Kind>        #Place_Size_<Size>   e.g. #Place_City #Place_Size_Huge
 *   Geography (a region):  #Place_<Landform>    #Place_Size_<Size>   e.g. #Place_Region #Place_Size_Enormous
 *   A realm kept as a group note writes #Group_<Tier> (#Group_Realm).
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
const cap1 = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** The word written for each region level (1 continent … 6 spot). */
const LEVEL_WORDS = ["", "Continent", "Subcontinent", "Region", "Area", "Locale", "Spot"];

/** Icons offered at once when adding your own role or status; any other icon or an emoji is one click away. */
const OWN_ICONS = {
	role: ["castle", "anchor", "church", "store", "landmark", "shield", "graduation-cap", "hammer", "pickaxe", "wheat", "flask-conical", "lock"],
	status: ["flame", "skull", "eye-off", "swords", "scale", "waves", "biohazard", "ghost"],
};

/** Your own role or status: a name and an icon, chosen together so no entry is left without one. */
class OwnTraitModal extends Modal {
	private chosen = "circle";

	constructor(private plugin: UniverseViewPlugin, private kind: "role" | "status", private onDone: (name: string, icon: string) => void) {
		super(plugin.app);
	}

	onOpen() {
		this.containerEl.addClass("universeview-scope-host");
		this.modalEl.addClass("universeview-scope");
		this.titleEl.setText(`Your own ${this.kind}`);
		const name = el("input", { cls: "universeview-prompt-input", attr: { type: "text", placeholder: this.kind === "role" ? "Spaceport" : "Quarantined", "aria-label": "Name" } }, this.contentEl);
		const row = el("div", { cls: "uv-own-icons" }, this.contentEl);
		const preview = el("span", { cls: "uv-own-preview", attr: { title: "The icon it will wear" } }, row);
		const paint = () => {
			preview.empty();
			if (!glyph(preview, this.chosen)) icon(preview, "circle");
		};
		paint();
		for (const ic of OWN_ICONS[this.kind]) {
			const b = el("button", { cls: "clickable-icon", attr: { "aria-label": ic, title: ic } }, row);
			glyph(b, ic);
			b.addEventListener("click", () => {
				this.chosen = ic;
				paint();
			});
		}
		const more = el("button", { text: "More icons…" }, row);
		more.addEventListener("click", () => new IconPickerModal(this.plugin, (id) => {
			if (id) this.chosen = id;
			paint();
		}, this.chosen).open());
		const buttons = el("div", { cls: "modal-button-container" }, this.contentEl);
		const add = el("button", { cls: "mod-cta", text: "Add" }, buttons);
		const submit = () => {
			const word = name.value.trim();
			if (!word) return;
			this.close();
			this.onDone(word, this.chosen);
		};
		add.addEventListener("click", submit);
		name.addEventListener("keydown", (evt) => {
			if (evt.key === "Enter") submit();
		});
		window.setTimeout(() => name.focus(), 30);
	}

	onClose() {
		this.contentEl.empty();
	}
}

/** Whether a choice is a settlement (a city, town, fort…): only those have roles; regions and larger ruled lands don't. */
export function isSettlement(c: TagChoice): boolean {
	return c.nature === "realm" && c.tier === "6";
}

/** Where a choice ranks (lower is bigger): a title's tier plus its size, or a region's level plus its size. Undefined when nothing says. */
export function rankOfChoice(c: TagChoice, regionWords: Record<string, number> = DEFAULT_REGION_WORDS): number | undefined {
	const size = c.size.toLowerCase();
	if (c.nature === "region") {
		const level = Number(c.level) || regionWords[c.landform.toLowerCase()];
		return level ? Math.max(1, level + (REGION_SIZE_OFFSET[size] ?? 0)) : undefined;
	}
	return Number(c.tier) + (SIZE[size] ?? 0);
}
/** The ladder of settlements, biggest first (metropolis … hamlet), then holdings and the plain word. */
export const SETTLEMENT_KINDS = [...SETTLEMENT_LADDER.map(([k]) => cap1(k)).reverse(), "Castle", "Fort", "Settlement"];
export const LANDFORMS = ["", ...LAND_FORMS];
export const SIZES: [string, string, string][] = [
	// [tag word, as a title, as geography]
	["", "No size", "No size"],
	["Gigantic", "Gigantic", "Gigantic"],
	["Enormous", "Enormous", "Enormous"],
	["Huge", "Huge", "Huge"],
	["Large", "Large", "Large"],
	["Medium", "Medium", "Medium"],
	["Small", "Small", "Small"],
	["Tiny", "Tiny", "Tiny"],
];

export interface TagChoice {
	nature: "realm" | "region";
	/** Realm tier "1"…"6"; unused for regions. */
	tier: string;
	/** For settlements: City, Town, Fort… */
	settlement: string;
	/** For regions: Island, Forest… or "". */
	landform: string;
	/** For regions: its level "1" (continent) … "6" (spot), or "" to let its landform say; written as the level's word when there is no landform. */
	level?: string;
	size: string;
	/** A place's role (Capital, Port…) and status (Ruined…): "" for none, undefined where the note isn't a place. */
	role?: string;
	status?: string;
}

const SIZE_WORDS = new Set(SIZES.map((s) => s[0].toLowerCase()).filter(Boolean).concat(["massive", "big", "major", "minor", "little", "middling"]));

/** What a note is now, read the way the realm tree reads it. */
export function readChoice(plugin: UniverseViewPlugin, e: Entity): TagChoice {
	const node = plugin.realms().nodes.get(e.key);
	const tags = e.tags.map((t) => t.replace(/^#/, ""));
	const schemeSize = tags.map((t) => parseTag(t)).find((p) => p?.role === "fact" && p.field === "size");
	const size = (schemeSize?.role === "fact" ? schemeSize.value : undefined) ?? tags.map((t) => t.split("_")).find((p) => p.length === 2 && SIZE_WORDS.has(p[1].toLowerCase()))?.[1] ?? "";
	const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
	// The note's kind says it first (it's what the Kind box shows), then its tags.
	// An older word (fortress, capital) counts as the kind it now is.
	const own = normaliseKind(e.category).kind;
	const named = (list: string[]) => list.find((k) => k && own === k.toLowerCase()) ?? list.find((k) => k && tags.some((t) => t.toLowerCase() === k.toLowerCase() || normaliseKind(t.replace(/^.*?_/, "")).kind === k.toLowerCase()));
	const facts = e.type === "place" ? resolvePlace(e.category, e.tags) : undefined;
	const settlement = named(SETTLEMENT_KINDS) ?? "City";
	const landform = named(LANDFORMS) ?? "";
	// Nothing says its tier yet: a realm note (a group) is most likely a kingdom, a place a county.
	const tier = node && node.nature !== "region" && node.rank < 9 ? String(Math.max(1, Math.min(6, Math.round(node.rank)))) : e.type === "culture" ? "2" : "4";
	const level = regionLevelOf(e, { ...DEFAULT_REGION_WORDS, ...tierWords(plugin.settings.regionWords ?? "") });
	return { nature: node?.nature ?? "realm", tier, settlement, landform, level: level ? String(level) : "", size: SIZES.some((s) => s[0] === cap(size)) ? cap(size) : "", role: facts ? cap(facts.roles[0] ?? "") : undefined, status: facts ? cap(facts.status ?? "") : undefined };
}

/** The tags a choice stands for, in the tag scheme (`tagscheme.ts`): its kind and its size. */
export function choiceTags(c: TagChoice, type: EntityType = "place"): string[] {
	const size = c.size ? [factTag(type, "size", c.size)] : [];
	// A place's traits go with its kind: a role and a status, each only when there is one.
	if (type === "place") {
		if (c.role && isSettlement(c)) size.push(factTag(type, "role", c.role));
		if (c.status) size.push(factTag(type, "status", c.status));
	}
	if (c.nature === "region") return [kindTag(type, c.landform || LEVEL_WORDS[Number(c.level)] || "region"), ...size];
	if (c.tier === "6") return [kindTag(type, c.settlement), ...size];
	return [kindTag(type, realmTiers().find((t) => t[0] === c.tier)?.[2] || "Province"), ...size];
}

/**
 * A note's tags with the land tags swapped for the standard ones: anything naming a tier, a kind
 * of settlement, a region or a size goes; other tags (#Nation_United_States, #City_Capital, type tags) stay.
 */
export function restandardise(plugin: UniverseViewPlugin, tags: string[], c: TagChoice, type: EntityType = "place"): string[] {
	const words = tierWordsWith(plugin.settings.tierWords);
	const regionWords = { ...DEFAULT_REGION_WORDS, ...tierWords(plugin.settings.regionWords ?? "") };
	// The vault's own type tags (#Location, #Character…) are never touched.
	const typeTags = new Set(Object.values(plugin.settings.typeTags).map((x) => x.toLowerCase().replace(/^#/, "")));
	const land = (t: string) => {
		// The scheme's own kind and size tags give way to the new ones; its facts and belonging tags stay.
		const s = parseTag(t);
		if (s) return s.type === type && (s.role === "kind" || (s.role === "fact" && (s.field === "size" || (type === "place" && (s.field === "role" || s.field === "status")))));
		if (TYPE_WORDS[type].toLowerCase() === t.replace(/^#/, "").toLowerCase()) return true;
		if (plugin.settings.typeStyle === "tag" && typeTags.has(t.replace(/^#/, "").toLowerCase())) return false;
		const parts = t.replace(/^#/, "").toLowerCase().split(/[_/\s-]+/);
		const head = parts[0];
		const isWord = head === "title" || words[head] !== undefined || regionWords[head] !== undefined;
		if (parts.length === 1) return isWord;
		return parts.length === 2 && isWord && SIZE_WORDS.has(parts[1]);
	};
	const kept = tags.map((t) => t.replace(/^#/, "")).filter((t) => !land(t));
	const out = [...choiceTags(c, type), ...kept];
	return out.filter((t, i) => out.findIndex((x) => x.toLowerCase() === t.toLowerCase()) === i);
}

/**
 * The three questions, with what they mean: ruled land or geography, which tier (or landform),
 * and how big. Calls back with each change.
 */
export function standardFields(parent: HTMLElement, c: TagChoice, onChange: (c: TagChoice) => void, opts: { kinds?: boolean; plugin?: UniverseViewPlugin } = {}) {
	/** Chips shown before "more": the first few roles or statuses. */
	const CHIPS_SHOWN = 8;
	const expanded = new Set<string>();
	/** Changes the user's own list of roles or statuses (kept in Settings), then draws again. */
	const editTraits = (p: UniverseViewPlugin, kind: "role" | "status", fn: (list: PlaceTrait[]) => PlaceTrait[]) => {
		const s = p.settings;
		if (kind === "role") s.placeRoles = fn(s.placeRoles ?? defaultRoles());
		else s.placeStatuses = fn(s.placeStatuses ?? defaultStatuses());
		void p.saveSettings().then(() => draw());
	};
	// Where a Kind box sits beside these (the inspector), the landform and kind of settlement are that box.
	const kinds = opts.kinds !== false;
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
			if (c.tier === "6" && kinds) {
				new Setting(box).setName("Kind of settlement").addDropdown((d) => {
					for (const k of SETTLEMENT_KINDS) d.addOption(k, k);
					d.setValue(c.settlement).onChange((v) => {
						c.settlement = v;
						// A village is usually small, a city large: the size is offered, never forced.
						if (!c.size) c.size = cap1(usualSize(v) ?? "");
						onChange(c);
						draw();
					});
				});
			}
		} else if (kinds) {
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
		// A region has levels too: a continent holds sub-continents, which hold regions, and so on down to a spot.
		if (c.nature === "region" && !c.landform) {
			new Setting(box).setName("Level").setDesc("Where it sits among regions, largest first.").addDropdown((d) => {
				d.addOption("", "Not set");
				for (let i = 1; i <= 6; i++) d.addOption(String(i), `${i}. ${REGION_TIER_LABELS[i]}`);
				d.setValue(c.level ?? "").onChange((v) => {
					c.level = v;
					onChange(c);
					draw();
				});
			});
		}
		// Sizes are named for the kind of thing they size: a large duchy and a large county are different things.
		const noun = (c.nature === "region" ? REGION_TIER_LABELS[Number(c.level)] || c.landform || "region" : c.tier === "6" ? c.settlement || "settlement" : tierName(Number(c.tier))).toLowerCase();
		new Setting(box)
			.setName("Size")
			.setDesc(c.nature === "region" ? "How big it is beside regions of the same level." : "How big it is beside titles of the same tier.")
			.addDropdown((d) => {
				for (const [v] of SIZES) d.addOption(v, v ? `${v} ${noun}` : "No size");
				d.setValue(c.size).onChange((v) => {
					c.size = v;
					onChange(c);
					draw();
				});
			});
		// What that makes of its rank, in one line: lower is bigger, and the tree and map order by it.
		const rank = rankOfChoice(c);
		el("div", { cls: "uv-std-rank", text: rank === undefined ? "Rank: not set (give it a level)." : `Rank ${Math.round(rank * 10) / 10}: ${c.size ? `${c.size} ` : ""}${noun}. Lower ranks are bigger.` }, box);
		if (c.role !== undefined) {
			// Picked from chips, so every option is in view at once; pressing the chosen one clears it.
			const chips = (name: "role" | "status", desc: string, options: [string, string][], get: () => string | undefined, set: (v: string) => void) => {
				const title = cap1(name);
				new Setting(box).setName(title).setDesc(desc).settingEl.addClass("uv-std-chip-head");
				const grid = el("div", { cls: "uv-std-chips", attr: { role: "group", "aria-label": title } }, box);
				const chosen = (get() ?? "").toLowerCase();
				// Only the first few show until opened; the chosen one always does.
				const open = expanded.has(name);
				const shown = options.filter(([v], i) => open || i < CHIPS_SHOWN || v === chosen);
				const p = opts.plugin;
				for (const [v, ic] of shown) {
					const on = chosen === v;
					const b = el("button", { cls: "uv-std-chip" + (on ? " is-active" : ""), attr: { "aria-pressed": String(on) } }, grid);
					if (!glyph(el("span", {}, b), ic)) icon(el("span", {}, b), "circle");
					el("span", { text: cap1(v) }, b);
					b.addEventListener("click", (evt) => {
						evt.preventDefault();
						set(on ? "" : cap1(v));
						onChange(c);
						draw();
					});
					// Right-click: a different icon, or take it off the list (both live in Settings too).
					if (p) {
						b.addEventListener("contextmenu", (evt) => {
							evt.preventDefault();
							const menu = new Menu();
							menu.addItem((i) => i.setTitle("Change icon…").setIcon("image").onClick(() => new IconPickerModal(p, (id) => id && editTraits(p, name, (list) => list.map((t) => (t.name.toLowerCase() === v ? { ...t, icon: id } : t))), ic).open()));
							menu.addItem((i) => i.setTitle(`Remove this ${name}`).setIcon("trash-2").onClick(() => editTraits(p, name, (list) => list.filter((t) => t.name.toLowerCase() !== v))));
							menu.showAtMouseEvent(evt);
						});
					}
				}
				if (options.length > shown.length || open) {
					const more = el("button", { cls: "uv-std-chip is-more", text: open ? "Show fewer" : `${options.length - shown.length} more`, attr: { "aria-expanded": String(open) } }, grid);
					more.addEventListener("click", (evt) => {
						evt.preventDefault();
						if (!expanded.delete(name)) expanded.add(name);
						draw();
					});
				}
				// Your own: a name, then an icon from all of Obsidian's (or an emoji); it joins the list in Settings.
				if (p) {
					const add = el("button", { cls: "uv-std-chip is-add", attr: { "aria-label": `Add your own ${name}` } }, grid);
					icon(el("span", {}, add), "plus");
					el("span", { text: "Your own" }, add);
					add.addEventListener("click", (evt) => {
						evt.preventDefault();
						new OwnTraitModal(p, name, (word, ic) => {
							editTraits(p, name, (list) => [...list.filter((t) => t.name.toLowerCase() !== word.toLowerCase()), { name: word, icon: ic }]);
							expanded.add(name);
							set(cap1(word));
							onChange(c);
						}).open();
					});
				}
			};
			if (isSettlement(c)) chips("role", "What the settlement does, beyond what it is: its pin wears the role's icon.", PLACE_ROLES.map((r) => [r.role, r.icon]), () => c.role, (v) => (c.role = v));
			chips("status", "How it stands now. Nothing chosen means as it was.", PLACE_STATUSES.map((s) => [s, STATUS_ICONS[s] ?? "circle"]), () => c.status, (v) => (c.status = v));
		}
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
	constructor(private plugin: UniverseViewPlugin, private world?: string) {
		super(plugin.app);
	}

	onOpen() {
		const p = this.plugin;
		this.containerEl.addClass("universeview-scope-host");
		this.modalEl.addClass("universeview-scope", "universeview-tool-modal", "uv-std-modal");
		this.titleEl.setText("Standardise land tags");
		const { contentEl } = this;
		el("p", { cls: "universeview-dash-muted", text: "One way to tag land: its kind and its size. Ruled land: its tier (#Place_Realm, #Place_Province, #Place_County…). Settlements: #Place_City, #Place_Town… Geography: #Place_Region or a landform (#Place_Island). Size: #Place_Size_Small (for geography, gigantic is a continent, enormous a sub-continent). Other tags such as #Group_Nation_United_States stay. Only rows you change, or that don't match the standard yet, are written." }, contentEl);
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
			const next = () => restandardise(p, before, c, e.type);
			rows.push({ e, c, next });
			const row = el("div", { cls: "uv-std-row" }, list);
			row.dataset.name = e.name.toLowerCase();
			const head = el("div", { cls: "uv-std-row-head" }, row);
			const node = tree.nodes.get(e.key);
			el("strong", { text: e.name }, head);
			el("span", { cls: "uv-std-badge", text: tierLabel(node) || (node?.nature === "region" ? "Region" : "Title") }, head);
			const where = [node?.under ? `under ${p.index.get(node.under)?.name}` : node?.nature === "realm" ? "sovereign" : "", node?.region && node.region !== node.under ? `lies in ${p.index.get(node.region)?.name}` : ""].filter(Boolean).join(" · ");
			el("span", { cls: "universeview-dash-muted", text: where }, head);
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
					fm.tags = restandardise(p, own, r.c, r.e.type);
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
