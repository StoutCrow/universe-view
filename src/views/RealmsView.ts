import { Notice, TFile, type ViewStateResult } from "obsidian";
import type { Entity } from "../types";
import { chainOf, holdingsOf, tierLabel } from "../index/realms";
import { occupationsByLand } from "../index/wars";
import { GROUP_KINDS, groupKind, isHouse } from "../render/houses";
import { bindHover, el, entityColor, helpTip, icon, iconButton, resourceUrl, showEntityMenu, TYPE_ICONS } from "../render/common";
import { EntityPickerModal } from "../ui/suggest";
import { moveInto } from "../ui/mapsync";
import { entityPanel } from "../ui/EntityPanel";
import { ChronicleView } from "./base";

export const VIEW_REALMS = "chronicle-realms";

type Tab = "realms" | "houses" | "cultures";

interface RealmsState {
	tab: Tab;
	selected?: string;
	folder?: string;
	search: string;
	/** Rows folded shut. */
	closed: string[];
}


/**
 * Realms, houses and cultures in one place: every title in its realm tree, every house with its cadet
 * branches, and every other group (faiths, peoples, guilds). Pick one to see everything about it
 * beside the list: who holds it, its vassals, members, events and relationships.
 */
export class RealmsView extends ChronicleView {
	private state: RealmsState = { tab: "realms", search: "", closed: [] };
	private listEl!: HTMLElement;
	private detailEl!: HTMLElement;

	getViewType() {
		return VIEW_REALMS;
	}
	getDisplayText() {
		return "Realms and cultures";
	}
	getIcon() {
		return "crown";
	}
	getState(): Record<string, unknown> {
		return { realms: this.state };
	}
	async setState(state: unknown, result: ViewStateResult) {
		const s = (state as { realms?: Partial<RealmsState>; select?: string } | undefined) ?? {};
		if (s.realms) this.state = { ...this.state, ...s.realms };
		if (s.select) this.select(s.select, false);
		if (this.isBuilt) {
			this.fillToolbar();
			this.render();
		}
		await super.setState(state, result);
	}

	protected build() {
		this.state.folder ??= this.defaultScope();
		this.fillToolbar();
		// One wrapper fills the view (its children are laid out side by side): every direct child of
		// a view's body is stretched over the whole of it, as maps and charts need.
		const wrap = el("div", { cls: "chronicle-realms" }, this.body);
		this.listEl = el("div", { cls: "chronicle-realms-list" }, wrap);
		this.detailEl = el("div", { cls: "chronicle-realms-detail" }, wrap);
		this.render();
	}

	/** Shows a note's panel and switches to the tab it belongs to. */
	select(key: string, save = true) {
		const e = this.plugin.index.get(key);
		if (!e) return;
		this.state.selected = key;
		const tree = this.plugin.realms();
		this.state.tab = tree.nodes.has(key) ? "realms" : e.type === "culture" && isHouse(this.plugin, e) ? "houses" : e.type === "culture" ? "cultures" : this.state.tab;
		// Open the rows above it.
		const closed = new Set(this.state.closed);
		for (const k of tree.nodes.has(key) ? chainOf(tree, key) : []) closed.delete(k);
		this.state.closed = [...closed];
		if (this.isBuilt) {
			this.fillToolbar();
			this.render();
		}
		if (save) this.app.workspace.requestSaveLayout();
	}

	private fillToolbar() {
		this.rebuildToolbar(() => {
			const s = this.state;
			const left = this.group();
			const tabs = el("div", { cls: "chronicle-segmented" }, left);
			for (const [id, label, ic] of [["realms", "Realms", "crown"], ["houses", GROUP_KINDS.house.plural, GROUP_KINDS.house.icon], ["cultures", "Peoples & groups", "flag"]] as const) {
				const b = el("button", { cls: "chronicle-segment" + (s.tab === id ? " is-active" : "") }, tabs);
				icon(el("span", {}, b), ic);
				el("span", { text: label }, b);
				b.addEventListener("click", () => {
					s.tab = id;
					this.fillToolbar();
					this.render();
					this.app.workspace.requestSaveLayout();
				});
			}
			helpTip(left, "Realms: every title under its liege, from each note's `location:`, `nation:`, a tag like #Nation_X or the folder note above it, with who holds it (`lord:`, `holder:`, `ruler:`).\n\nHouses: every house, family or dynasty, with its cadet branches (`branch-of:`) nested under it.\n\nCultures: every other group, faiths, peoples, guilds and orders, by kind.\n\nPick one to see everything about it on the right.");
			this.scopePicker(left, s.folder, (v) => {
				s.folder = v;
				this.render();
			});
			this.searchBox(left, s.search, "Filter…", (v) => {
				s.search = v;
				this.renderList();
			});
			this.spacer();
			const right = this.group();
			iconButton(right, "network", "As a chart (realm tree, dynasties or organisations)", () => void this.plugin.openOrgChart(s.selected));
			iconButton(right, "git-branch", "Culture lineage over time", () => void this.plugin.openLineage(s.selected));
			iconButton(right, "map", "Show on the map", () => void this.plugin.openMap(s.selected));
			iconButton(right, "plus", s.tab === "realms" ? "New realm or title" : s.tab === "houses" ? "New house" : "New culture", () => this.plugin.createEntityPrompt({ type: "culture", groupKind: s.tab === "realms" ? "realm" : s.tab === "houses" ? "house" : undefined, scope: s.folder || undefined }), "mod-cta-icon");
		});
	}

	private render() {
		if (!this.listEl) return;
		this.renderList();
		this.renderDetail();
	}

	private inScope(e: Entity): boolean {
		return !this.state.folder || e.path.startsWith(this.state.folder + "/");
	}

	private renderList() {
		const box = this.listEl;
		box.empty();
		const s = this.state;
		const idx = this.plugin.index;
		const tree = this.plugin.realms();
		const q = s.search.trim().toLowerCase();
		const closed = new Set(s.closed);
		// With a filter, everything matching shows, with the rows above it for context.
		const matches = (e: Entity) => !q || e.name.toLowerCase().includes(q);
		const row = (parent: HTMLElement, e: Entity, depth: number, sub: string, kids: string[], extra?: string) => {
			const r = el("div", { cls: "chronicle-realms-row" + (s.selected === e.key ? " is-selected" : "") + (matches(e) ? "" : " is-context") }, parent);
			r.style.setProperty("--depth", String(depth));
			r.style.setProperty("--row-color", entityColor(this.plugin, e));
			const twisty = el("span", { cls: "chronicle-realms-twisty" + (kids.length ? "" : " is-leaf") }, r);
			if (kids.length) {
				icon(twisty, closed.has(e.key) && !q ? "chevron-right" : "chevron-down");
				twisty.addEventListener("click", (evt) => {
					evt.stopPropagation();
					if (closed.has(e.key)) closed.delete(e.key);
					else closed.add(e.key);
					s.closed = [...closed];
					this.renderList();
				});
			}
			const pic = el("span", { cls: "chronicle-realms-pic" }, r);
			const url = resourceUrl(this.plugin, e.logo ?? e.image);
			if (url) el("img", { attr: { src: url, alt: "" } }, pic);
			else icon(pic, e.icon ? "circle" : TYPE_ICONS[e.type]);
			const text = el("span", { cls: "chronicle-realms-text" }, r);
			el("span", { cls: "chronicle-realms-name", text: e.name }, text);
			if (sub) el("span", { cls: "chronicle-realms-sub", text: sub }, text);
			if (extra) el("span", { cls: "chronicle-realms-badge", text: extra }, r);
			r.addEventListener("click", () => this.select(e.key));
			bindHover(this.plugin, r, e.key, this.hoverHost);
			this.makeDraggable(r, e);
			r.addEventListener("contextmenu", (evt) => {
				evt.preventDefault();
				showEntityMenu(this.plugin, e.key, evt, {
					top: s.tab === "cultures" ? undefined : (menu) => menu.addItem((i) => i.setTitle(s.tab === "realms" ? "Move under…" : "Make a branch of…").setIcon("corner-down-right").onClick(() => {
						new EntityPickerModal(this.plugin, s.tab === "realms" ? ["place", "culture"] : ["culture"], (t) => void this.reparent(e, t), s.tab === "realms" ? `Which title should ${e.name} answer to?` : `Which house is ${e.name} a branch of?`).open();
					})),
				});
			});
			return !closed.has(e.key) || !!q;
		};
		// Does this subtree have anything matching the filter?
		const anyMatch = (k: string, kidsOf: (k: string) => string[], seen = new Set<string>()): boolean => {
			if (seen.has(k)) return false;
			seen.add(k);
			const e = idx.get(k);
			return !!e && (matches(e) || kidsOf(k).some((c) => anyMatch(c, kidsOf, seen)));
		};
		const walk = (parent: HTMLElement, k: string, depth: number, kidsOf: (k: string) => string[], sub: (e: Entity) => string, badge: (e: Entity, kids: string[]) => string | undefined, seen: Set<string>) => {
			const e = idx.get(k);
			if (!e || seen.has(k) || depth > 12 || !anyMatch(k, kidsOf)) return;
			seen.add(k);
			const kids = kidsOf(k).filter((c) => anyMatch(c, kidsOf));
			if (row(parent, e, depth, sub(e), kids, badge(e, kids))) for (const c of kids) walk(parent, c, depth + 1, kidsOf, sub, badge, seen);
		};
		const empty = (title: string, text: string) => {
			const d = el("div", { cls: "chronicle-realms-empty" }, box);
			el("div", { cls: "chronicle-realms-empty-title", text: title }, d);
			el("div", { text }, d);
		};
		if (s.tab === "realms") {
			const kidsOf = (k: string) => tree.nodes.get(k)?.children.filter((c) => { const x = idx.get(c); return !!x && this.inScope(x); }) ?? [];
			const occupied = occupationsByLand(idx);
			const sub = (e: Entity) => {
				const n = tree.nodes.get(e.key);
				const tier = tierLabel(n);
				const by = [...new Set(occupied.get(e.key)?.map((o) => o.by.name))].join(", ");
				return [tier, n?.holder?.name, n?.house?.name, by && `occupied by ${by}`].filter(Boolean).join(" · ");
			};
			const roots = tree.roots.filter((k) => { const e = idx.get(k); const n = tree.nodes.get(k); return !!e && this.inScope(e) && (!!n?.children.length || !!n?.holder); });
			if (!roots.length) return empty("No realms yet", "A title goes under its liege by its `location:`, `nation:`, a tag like #Nation_X, or the folder note above it; `lord:`, `holder:` or `ruler:` says who holds it.");
			const seen = new Set<string>();
			for (const k of roots) walk(box, k, 0, kidsOf, sub, (_e, kids) => (kids.length ? String(kids.length) : undefined), seen);
		} else if (s.tab === "houses") {
			const houses = idx.all("culture").filter((c) => this.inScope(c) && isHouse(this.plugin, c));
			const keys = new Set(houses.map((h) => h.key));
			const kidsOf = (k: string) => [...(idx.childCulturesOf.get(k) ?? [])].filter((c) => keys.has(c));
			const sub = (e: Entity) => {
				const held = holdingsOf(tree, e.key).filter((k) => k !== e.key);
				const head = idx.members(e.key).find((m) => /head|lord|lady|king|queen|patriarch|matriarch/i.test(m.link.role ?? ""));
				return [head ? idx.get(head.key)?.name : undefined, held.length ? `${held.length} title${held.length === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ");
			};
			const members = (e: Entity) => {
				const n = idx.members(e.key).filter((m) => idx.get(m.key)?.type === "person").length;
				return n ? String(n) : undefined;
			};
			const roots = houses.filter((h) => !h.parentCultures.some((p) => keys.has(p.key))).sort((a, b) => holdingsOf(tree, b.key).length - holdingsOf(tree, a.key).length || a.name.localeCompare(b.name));
			if (!roots.length) return empty("No houses yet", "Houses are group notes tagged or named as a house, family or dynasty; a cadet branch says `branch-of: [[House X]]`.");
			const seen = new Set<string>();
			for (const h of roots) walk(box, h.key, 0, kidsOf, sub, members, seen);
		} else {
			// Everything that's neither a realm nor a house: faiths, peoples, organisations, other groups.
			const groups = idx.all("culture").filter((c) => this.inScope(c) && !["realm", "house"].includes(groupKind(this.plugin, c)));
			const keys = new Set(groups.map((g) => g.key));
			const kidsOf = (k: string) => [...(idx.childCulturesOf.get(k) ?? [])].filter((c) => keys.has(c));
			const byKind = new Map<string, Entity[]>();
			for (const g of groups) {
				if (g.parentCultures.some((p) => keys.has(p.key))) continue;
				const label = GROUP_KINDS[groupKind(this.plugin, g)].plural;
				byKind.set(label, [...(byKind.get(label) ?? []), g]);
			}
			if (!byKind.size) return empty("No other groups", "Every group here is a realm or a house. Faiths, peoples, guilds and orders show here: group notes tagged or kinded as such (#Faith, #Culture, #Guild…).");
			const sub = (e: Entity) => {
				const n = idx.members(e.key).filter((m) => idx.get(m.key)?.type === "person").length;
				return n ? `${n} member${n === 1 ? "" : "s"}` : "";
			};
			const seen = new Set<string>();
			for (const [kind, list] of [...byKind].sort((a, b) => a[0].localeCompare(b[0]))) {
				el("div", { cls: "chronicle-realms-heading", text: kind }, box);
				for (const g of list.sort((a, b) => a.name.localeCompare(b.name))) walk(box, g.key, 0, kidsOf, sub, () => undefined, seen);
			}
		}
		box.querySelector(".is-selected")?.scrollIntoView({ block: "nearest" });
	}

	// ---- Rearranging by dragging -------------------------------------------------------------------

	private dragKey?: string;

	/** Whether `target` is `key` itself or anywhere below it (dropping there would make a loop). */
	private isBelow(target: string, key: string): boolean {
		if (this.state.tab === "realms") return chainOf(this.plugin.realms(), target).includes(key);
		const idx = this.plugin.index;
		const seen = new Set<string>();
		const up = (k: string): boolean => {
			if (k === key) return true;
			if (seen.has(k)) return false;
			seen.add(k);
			return (idx.get(k)?.parentCultures ?? []).some((p) => up(p.key));
		};
		return up(target);
	}

	/**
	 * Realms: drop a title on another to make it that title's vassal (it's written as `under:`, and
	 * its file moves into the new liege's folder note, as the map does). Houses: drop a house on
	 * another to make it a cadet branch (`branch-of:`). Undo puts it back.
	 */
	private makeDraggable(r: HTMLElement, e: Entity) {
		const tab = this.state.tab;
		if (tab === "cultures") return;
		r.draggable = true;
		r.addEventListener("dragstart", (evt) => {
			this.dragKey = e.key;
			evt.dataTransfer?.setData("text/plain", e.name);
			if (evt.dataTransfer) evt.dataTransfer.effectAllowed = "move";
			this.listEl.addClass("is-dragging");
			r.addClass("is-drag-source");
		});
		r.addEventListener("dragend", () => {
			this.dragKey = undefined;
			this.listEl.removeClass("is-dragging");
			this.listEl.querySelectorAll(".is-drop-target, .is-drag-source").forEach((x) => x.removeClass("is-drop-target", "is-drag-source"));
		});
		r.addEventListener("dragover", (evt) => {
			const from = this.dragKey;
			if (!from || this.isBelow(e.key, from)) return;
			evt.preventDefault();
			if (evt.dataTransfer) evt.dataTransfer.dropEffect = "move";
			r.addClass("is-drop-target");
		});
		r.addEventListener("dragleave", () => r.removeClass("is-drop-target"));
		r.addEventListener("drop", (evt) => {
			evt.preventDefault();
			r.removeClass("is-drop-target");
			const from = this.dragKey && this.plugin.index.get(this.dragKey);
			if (from && !this.isBelow(e.key, from.key)) void this.reparent(from, e);
		});
	}

	/** Puts `e` under `target`: a title's new liege, or a house's parent house. */
	private async reparent(e: Entity, target: Entity) {
		if (e.key === target.key || this.isBelow(target.key, e.key)) {
			new Notice(`${target.name} is part of ${e.name}: it can't also be above it.`);
			return;
		}
		if (this.state.tab === "realms") await moveInto(this.plugin, e, target);
		else {
			const file = this.app.vault.getAbstractFileByPath(e.path);
			if (!(file instanceof TFile)) return;
			await this.plugin.editFrontmatter(file, (fm) => {
				const k = ["branch-of", "branch_of", "parent-culture", "parent_culture", "part-of"].find((x) => x in fm) ?? "branch-of";
				fm[k] = this.plugin.wikilink(target.key, e.path);
			}, `${e.name}: a branch of ${target.name}`);
			new Notice(`${e.name} is now a branch of ${target.name}. Undo puts it back.`);
		}
		this.select(e.key);
	}

	private renderDetail() {
		const box = this.detailEl;
		box.empty();
		const e = this.state.selected ? this.plugin.index.get(this.state.selected) : undefined;
		if (!e) {
			const d = el("div", { cls: "chronicle-realms-empty" }, box);
			icon(el("div", { cls: "chronicle-realms-empty-icon" }, d), "crown");
			el("div", { text: "Pick a realm, house or culture to see who holds it, what it holds, its people, events and relationships." }, d);
			return;
		}
		entityPanel(this.plugin, box, e, { pick: (k) => this.select(k), host: this.hoverHost });
	}

	protected onIndexChanged() {
		this.render();
	}
}
