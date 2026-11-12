import { ItemView, Menu, Notice, TFile, type ViewStateResult, type WorkspaceLeaf } from "obsidian";
import { QuickCreator } from "../ui/QuickCreator";
import type UniverseViewPlugin from "../main";
import { el, entityColor, helpTip, icon, tuckDescriptions, TYPE_ICONS } from "../render/common";
import type { Entity, EntityType } from "../types";
import { chainOf, holdingsOf } from "../index/realms";
import { GROUP_KINDS, groupKind } from "../render/houses";
import { placeStyleFields } from "../ui/PlaceStyleModal";
import { entityPanel, noteChip } from "../ui/EntityPanel";
import { EntityInputSuggest } from "../ui/suggest";
import { buildEditor, type NoteEditor } from "../ui/writing";
import { TAB_INFO, linksTab, mapTab, noteTab, tabsFor, timelineTab, type InspectorTab } from "../ui/inspectortabs";
import { readChoice, restandardise, standardFields } from "../ui/tagstandard";
import { identityHeader } from "../ui/identity";
import { battlesOf, isBattle, isWar, victorOf, warOf, warTally } from "../index/wars";
import { ROW_FORMATS } from "../index/periods";
import { nameRows, writeNames } from "../index/renames";
import { formatDay } from "../dates/parser";
import { ConfirmPrompt } from "../ui/TextPrompt";

export const VIEW_INSPECTOR = "chronicle-inspector";

/**
 * One panel for the note you're working on, whichever view you're in: its facts, relationships and
 * shortcuts to every view (About), and the layered edit form (Edit). It follows the note you open or
 * pick in any view; the lock keeps it on one note.
 */
export class InspectorView extends ItemView {
	private key?: string;
	private tab: InspectorTab | "realm" = "about";
	private locked = false;
	private editor?: NoteEditor;
	private bodyEl!: HTMLElement;
	private headEl!: HTMLElement;
	/** Making a new note here, rather than showing one. */
	private creator?: QuickCreator;

	constructor(leaf: WorkspaceLeaf, private plugin: UniverseViewPlugin) {
		super(leaf);
		// The tab notes open on (Settings → Look & cards → Inspector).
		this.tab = (plugin.settings.inspectorDefaultTab as InspectorTab | undefined) ?? "about";
	}

	getViewType() {
		return VIEW_INSPECTOR;
	}
	getDisplayText() {
		return "Inspector";
	}
	getIcon() {
		return "panel-right";
	}
	getState(): Record<string, unknown> {
		return { key: this.key, tab: this.tab, locked: this.locked };
	}
	async setState(state: unknown, result: ViewStateResult) {
		const s = state as { key?: string; tab?: InspectorTab | "realm"; locked?: boolean } | undefined;
		if (s?.tab) {
			this.tab = s.tab;
			this.explicitTab = true;
		}
		if (s?.locked !== undefined) this.locked = s.locked;
		if (s?.key) this.show(s.key, true);
		await super.setState(state, result);
	}

	async onOpen() {
		this.contentEl.empty();
		this.contentEl.addClass("universeview-inspector", "universeview-scope");
		this.headEl = el("div", { cls: "universeview-insp-head" }, this.contentEl);
		this.bodyEl = el("div", { cls: "universeview-insp-body" }, this.contentEl);
		this.registerEvent(this.app.workspace.on("file-open", (f: TFile | null) => f && this.follow(f.path)));
		this.registerEvent(this.plugin.index.on("changed", () => this.onIndexChanged()));
		const active = this.app.workspace.getActiveFile();
		if (!this.key && active) this.follow(active.path);
		this.render();
	}

	/** A note was opened or picked elsewhere: follow it unless locked or mid-edit. */
	follow(key: string) {
		if (this.creator || this.locked || key === this.key || !this.plugin.index.get(key)) return;
		// Edits in progress are saved first, then it follows: nothing is lost and nothing to answer.
		void this.flushEdits().then(() => this.show(key));
	}

	/**
	 * Every section folds: click its heading. What's folded is remembered across notes (by heading,
	 * counts aside), so a section you never need stays out of the way.
	 */
	private foldable() {
		const p = this.plugin;
		const id = (h: Element) => (h.textContent ?? "").replace(/\(\d+\)|\?/g, "").trim();
		const folded = new Set(p.settings.inspectorCollapsed ?? []);
		for (const head of Array.from(this.bodyEl.querySelectorAll<HTMLElement>(".universeview-insp-section > .universeview-insp-section-head, .universeview-ep-section > .universeview-ep-section-head"))) {
			const section = head.parentElement!;
			const key = id(head);
			if (!key) continue;
			section.addClass("uv-foldable");
			section.toggleClass("is-folded", folded.has(key));
			const chev = el("span", { cls: "uv-fold-chevron" }, head);
			icon(chev, "chevron-down");
			head.addEventListener("click", (evt) => {
				// The help mark and any buttons in the heading keep their own clicks.
				if ((evt.target as Element).closest(".universeview-help, button, a, [role=button]:not(.universeview-insp-section-head)")) return;
				const now = !section.hasClass("is-folded");
				section.toggleClass("is-folded", now);
				const list = new Set(p.settings.inspectorCollapsed ?? []);
				if (now) list.add(key);
				else list.delete(key);
				p.settings.inspectorCollapsed = [...list];
				void p.saveSettings();
			});
		}
	}

	/** A tab was asked for (by a menu or a saved layout): it wins over the one remembered for this kind of note. */
	private explicitTab = false;

	/** Shows a note, whatever was showing. */
	show(key: string, quiet = false) {
		// Each kind of note opens on the tab you last used for it (people on Person, places on Place…).
		// Only a different note opens on its kind's remembered tab: showing the same note again (a refresh after an
		// edit, the note being focused) keeps the tab and the scroll position you were on.
		const again = key === this.key && !this.creator;
		const type = this.plugin.index.get(key)?.type;
		const remembered = type ? this.plugin.settings.inspectorTabByType?.[type] : undefined;
		if (!again && !this.explicitTab && remembered) this.tab = remembered as InspectorTab;
		this.explicitTab = false;
		this.creator = undefined;
		this.key = key;
		if (!again || !this.editor?.dirty()) this.editor = undefined;
		this.render();
		if (!quiet) this.app.workspace.requestSaveLayout();
	}

	private redrawWaiting = false;

	/** Opens the Quick creator in this panel, saving what's being edited first. */
	startCreating(world?: string) {
		void this.flushEdits().then(() => {
			this.editor = undefined;
			this.creator = new QuickCreator(this.plugin, {
				world,
				created: (path) => void this.showCreated(path),
				close: () => {
					this.creator = undefined;
					this.render();
				},
			});
			this.render();
		});
	}

	/** On to the new note, ready to edit, as soon as the index has it. */
	private async showCreated(path: string) {
		const idx = this.plugin.index;
		if (!idx.get(path)) {
			await new Promise<void>((done) => {
				const ref = idx.on("changed", () => {
					if (!idx.get(path)) return;
					idx.offref(ref);
					done();
				});
				window.setTimeout(() => {
					idx.offref(ref);
					done();
				}, 3000);
			});
		}
		this.tab = "edit";
		this.explicitTab = true;
		this.show(path);
	}

	private onIndexChanged() {
		// The form holds what's been typed; it reads the index when it needs to.
		if (this.creator) return;
		// Redraw with the new data, but never under someone's typing: once they leave the field.
		if (this.editor?.dirty() || this.typing()) {
			if (!this.redrawWaiting) {
				this.redrawWaiting = true;
				const later = () => window.setTimeout(() => {
					if (this.typing() || this.editor?.dirty()) return;
					this.bodyEl.removeEventListener("focusout", later);
					this.redrawWaiting = false;
					this.render();
				}, 120);
				this.bodyEl.addEventListener("focusout", later);
			}
			return;
		}
		this.render();
	}

	/** Redraws, keeping your place when it's the same note on the same tab (after a save, or an edit elsewhere). */
	private lastShown = "";
	private render() {
		const here = `${this.key ?? ""}|${this.tab}`;
		const same = here === this.lastShown;
		this.lastShown = here;
		const tops = same ? [this.contentEl.scrollTop, this.bodyEl?.scrollTop ?? 0] : [0, 0];
		this.draw();
		tuckDescriptions(this.bodyEl);
		this.foldable();
		const restore = () => {
			this.contentEl.scrollTop = tops[0];
			if (this.bodyEl) this.bodyEl.scrollTop = tops[1];
		};
		restore();
		// Content that fills in a moment later (a tab that builds its list after a frame) is taller only then.
		if (same && (tops[0] || tops[1])) window.requestAnimationFrame(restore);
	}

	private draw() {
		const head = this.headEl;
		const body = this.bodyEl;
		if (!head || !body) return;
		head.empty();
		body.empty();
		const e = this.key ? this.plugin.index.get(this.key) : undefined;
		// Find any note, right here.
		const find = el("div", { cls: "universeview-insp-find" }, head);
		const input = el("input", { attr: { type: "search", placeholder: e ? `Inspecting ${e.name}… (type to switch)` : "Find a note to inspect…" } }, find);
		new EntityInputSuggest(this.app, input, this.plugin, undefined, (x) => this.show(x.key));
		const lock = el("button", { cls: "clickable-icon universeview-insp-lock" + (this.locked ? " is-active" : ""), attr: { "aria-label": this.locked ? "Locked to this note: click to follow the open note again" : "Follows the note you open: click to keep this one" } }, find);
		icon(lock, this.locked ? "lock" : "lock-open");
		lock.addEventListener("click", () => {
			this.locked = !this.locked;
			this.app.workspace.requestSaveLayout();
			this.render();
		});
		const add = el("button", { cls: "clickable-icon" + (this.creator ? " is-active" : ""), attr: { "aria-label": "Quick creator: make a new note here" } }, find);
		icon(add, "plus");
		add.addEventListener("click", () => {
			if (!this.creator) return this.startCreating(this.plugin.index.defaultScope(this.key));
			this.creator = undefined;
			this.render();
		});
		if (this.creator) {
			this.contentEl.removeClass("has-id");
			return this.creator.mount(body);
		}
		if (!e) {
			const empty = el("div", { cls: "universeview-insp-empty" }, body);
			icon(el("div", { cls: "universeview-insp-empty-icon" }, empty), "panel-right");
			el("div", { text: "Open or pick a person, place, event or group in any view, and it shows here to read and edit." }, empty);
			return;
		}
		// Who or what this is, at a glance, above the tabs.
		const strip = this.plugin.settings.inspectorHeader !== false;
		this.contentEl.toggleClass("has-id", strip);
		if (strip) identityHeader(this.plugin, head, e, (k) => this.show(k));
		const tabs = el("div", { cls: "universeview-insp-tabs" }, head);
		// Reading, editing (named for what the note is), then whichever of timeline, map, links and the note's own reading it has.
		if (this.tab === "realm") this.tab = "edit";
		const hidden = new Set(this.plugin.settings.inspectorHiddenTabs ?? []);
		const have = tabsFor(this.plugin, e).filter((t) => t === "about" || t === "edit" || !hidden.has(t));
		if (!have.includes(this.tab)) this.tab = "about";
		const tabList: [InspectorTab, string, string][] = have.map((id) => (id === "edit" ? [id, this.editLabel(e), "pencil"] : id === "about" ? [id, "About", TYPE_ICONS[e.type]] : [id, TAB_INFO[id][0], TAB_INFO[id][1]]));
		for (const [id, label, ic] of tabList) {
			const b = el("button", { cls: "universeview-insp-tab" + (this.tab === id ? " is-active" : ""), attr: { "aria-label": label } }, tabs);
			icon(el("span", {}, b), ic);
			el("span", { text: label }, b);
			b.addEventListener("click", () => {
				if (this.tab === id) return;
				void this.flushEdits().then(() => {
					this.tab = id;
					const types = (this.plugin.settings.inspectorTabByType ??= {});
					types[e.type] = id;
					void this.plugin.saveSettings();
					this.editor = undefined;
					this.app.workspace.requestSaveLayout();
					this.render();
				});
			});
		}
		const ctx = { pick: (k: string) => this.show(k), host: this.contentEl };
		if (this.tab === "timeline") return timelineTab(this.plugin, body, e, ctx);
		if (this.tab === "map") return mapTab(this.plugin, body, e, ctx);
		if (this.tab === "links") return linksTab(this.plugin, body, e, ctx);
		if (this.tab === "note") return noteTab(this.plugin, body, e, ctx);
		if (this.tab === "about") {
			entityPanel(this.plugin, body, e, {
				pick: (k) => this.show(k),
				tab: () => {
					this.tab = "edit";
					this.editor = undefined;
					this.app.workspace.requestSaveLayout();
					this.render();
				},
				host: this.contentEl,
			});
			return;
		}
		// Realm and map first (they save as you change them), then the note's own fields with a save bar.
		this.renderRealm(body, e);
		const details = el("section", { cls: "universeview-insp-section" }, body);
		const dh = el("div", { cls: "universeview-insp-section-head" }, details);
		icon(el("span", {}, dh), "pencil");
		el("span", { text: "Details" }, dh);
		helpTip(dh, "The note's own properties, in layers: the basics first, then dates, family and relationships. Like everything in this panel, changes save themselves (a moment after you stop typing, or when you leave the field), and Undo takes them back.");
		const form = el("div", { cls: "universeview-insp-form" }, details);
		this.renderRemove(body, e);
		// One line saying where the edits stand, with Undo: no Save button to forget.
		const bar = el("div", { cls: "universeview-insp-savebar is-auto" }, body);
		const status = el("span", { cls: "universeview-insp-status", text: "Changes save as you make them" }, bar);
		const undo = el("button", { cls: "is-hidden", text: "Undo" }, bar);
		undo.addEventListener("click", () => void this.plugin.undo());
		// Blank properties a template left behind: one click clears them (and Undo brings them back).
		const file = this.app.vault.getAbstractFileByPath(e.key);
		const blanks = file instanceof TFile ? this.plugin.emptyCountOf(file) : 0;
		if (file instanceof TFile && blanks) {
			const tidy = el("button", { text: `Remove ${blanks} blank`, attr: { title: "Remove the empty properties (a name with nothing after it, or an empty list) from this note" } }, bar);
			tidy.addEventListener("click", () => void this.plugin.tidyEmptyProperties([file]).then((r) => new Notice(`Removed ${r.props} blank propert${r.props === 1 ? "y" : "ies"}. Undo brings them back.`)));
		}
		// Redo sits beside it, so a click on Undo that was a slip is one click to take back.
		const redo = el("button", { text: "Redo" }, bar);
		redo.toggleClass("is-hidden", !this.plugin.redoLabel);
		redo.addEventListener("click", () => {
			void this.plugin.redo();
			redo.addClass("is-hidden");
		});
		this.registerEvent(this.app.workspace.on("universeview:history-changed" as "quit", () => redo.toggleClass("is-hidden", !this.plugin.redoLabel)));
		let timer = 0;
		const flush = async () => {
			window.clearTimeout(timer);
			if (!this.editor?.dirty()) return;
			status.setText("Saving…");
			bar.addClass("is-dirty");
			const wrote = await this.editor.save();
			bar.removeClass("is-dirty");
			status.setText(wrote ? "Saved" : "Changes save as you make them");
			undo.toggleClass("is-hidden", !wrote);
		};
		this.flushEdits = flush;
		// The realm and map sections above already cover where it lies, who holds it, its kind and its pin.
		this.editor = buildEditor(this.plugin, form, e, () => {
			status.setText("Editing…");
			window.clearTimeout(timer);
			timer = window.setTimeout(() => void flush(), 1200);
		}, { realmFields: true });
		// Leaving a field, a picked chip or a dropdown saves at once.
		form.addEventListener("change", () => void flush());
		form.addEventListener("focusout", () => window.setTimeout(() => {
			if (!form.contains(document.activeElement)) void flush();
		}, 0));
	}

	/** Saves the edit form's pending changes now (before switching notes or tabs). */
	private flushEdits: () => Promise<void> = async () => {};

	/** Whether someone is typing in the panel (a redraw now would take their cursor away). */
	private typing(): boolean {
		const a = document.activeElement as HTMLElement | null;
		return !!a && this.bodyEl?.contains(a) && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.isContentEditable);
	}

	/** The editing tab's name: what you're editing. */
	private editLabel(e: Entity): string {
		const tree = this.plugin.realms();
		if (e.type === "place") return "Realm & map";
		if (tree.nodes.has(e.key)) return "Realm";
		if (e.type === "culture") return GROUP_KINDS[groupKind(this.plugin, e)].label;
		if (e.type === "person") return holdingsOf(tree, e.key).length ? "Holdings" : "Person";
		if (e.type === "map") return "Map";
		return "Event";
	}

	/** Taking a place off the map (its pin, its painted areas), and deleting the note, each clearly separate. */
	private renderRemove(body: HTMLElement, e: Entity) {
		const p = this.plugin;
		const file = this.app.vault.getAbstractFileByPath(e.key);
		if (!(file instanceof TFile)) return;
		const s = el("section", { cls: "universeview-insp-section universeview-insp-danger" }, body);
		const h = el("div", { cls: "universeview-insp-section-head" }, s);
		icon(el("span", {}, h), "trash-2");
		el("span", { text: "Remove" }, h);
		helpTip(h, "Remove from the map takes away its pin or painted areas but keeps the note and everything in it; Undo (Ctrl+Alt+Z) brings them back.\n\nDelete note moves the note itself to Obsidian's trash (as set in Settings → Files and links). Links to it from other notes stay, as unresolved links.");
		const row = el("div", { cls: "universeview-insp-actions" }, s);
		const pinKeys = ["position", "map-position", "pos", "xy", "coordinates", "coords", "latlng", "lat-lng", "custom_coordinates", "custom_coordinates_x", "custom_coordinates_y", "custom_coordinates_map", "coordinates_lat", "coordinates_long"];
		const hasPin = !!(e.position || e.coords);
		const areas = e.territories.length;
		if (hasPin || areas) {
			const b = el("button", {}, row);
			icon(el("span", {}, b), "map-pin-off");
			el("span", { text: "Remove from map…" }, b);
			b.addEventListener("click", (evt) => {
				const menu = new Menu();
				const strip = (pin: boolean, area: boolean, label: string) =>
					void p.editFrontmatter(file, (fm) => {
						if (pin) for (const k of pinKeys) delete fm[k];
						if (area) for (const k of ["territory", "territories", "borders"]) delete fm[k];
					}, label).then(() => new Notice(`${label}. Undo puts it back.`));
				if (hasPin) menu.addItem((i) => i.setTitle("Remove its pin").setIcon("map-pin-off").onClick(() => strip(true, false, `Removed ${e.name}'s pin`)));
				if (areas) menu.addItem((i) => i.setTitle(`Remove its painted area${areas === 1 ? "" : "s"} (${areas})`).setIcon("eraser").onClick(() => strip(false, true, `Removed ${e.name}'s areas`)));
				if (hasPin && areas) menu.addItem((i) => i.setTitle("Remove both").setIcon("trash").onClick(() => strip(true, true, `Took ${e.name} off the map`)));
				menu.showAtMouseEvent(evt);
			});
		}
		const del = el("button", { cls: "mod-warning" }, row);
		icon(el("span", {}, del), "trash-2");
		el("span", { text: "Delete note…" }, del);
		del.addEventListener("click", () => {
			new ConfirmPrompt(this.plugin, `Delete the note “${e.name}”?`, "It moves to Obsidian's trash. Its pin and areas go with it; links to it from other notes stay as unresolved links.", "Delete", () => {
				this.editor = undefined;
				this.key = undefined;
				void this.app.fileManager.trashFile(file).then(() => {
					new Notice(`Moved “${e.name}” to the trash.`);
					this.render();
				});
			}).open();
		});
	}

	/**
	 * A list of rows written as one property (`holders:`, `transfers:`…): each row a few fields, some of
	 * them links (with note search), saved as you leave a field.
	 */
	private renderRows(body: HTMLElement, e: Entity, o: { title: string; icon: string; help: string; field: string; add: string; cols: { key: string; ph: string; link?: EntityType[] }[] }) {
		const p = this.plugin;
		const file = this.app.vault.getAbstractFileByPath(e.key);
		if (!(file instanceof TFile)) return;
		const s = el("section", { cls: "universeview-insp-section" }, body);
		const h = el("div", { cls: "universeview-insp-section-head" }, s);
		icon(el("span", {}, h), o.icon);
		el("span", { text: o.title }, h);
		helpTip(h, o.help);
		const front: Record<string, unknown> | undefined = this.app.metadataCache.getFileCache(file)?.frontmatter;
		const format = ROW_FORMATS[o.field];
		const rows = format.read(front?.[o.field], front);
		const list = el("div", { cls: "uv-names" }, s);
		const save = () =>
			void p.editFrontmatter(file, (fm) => {
				const clean = rows.filter((r) => r[o.cols[0].key]?.trim());
				if (clean.length) fm[o.field] = format.write(clean);
				else delete fm[o.field];
				// Each side now says how it ended.
				if (o.field === "sides") delete fm.outcome;
			}, `${e.name}: ${o.title.toLowerCase()}`);
		const draw = () => {
			list.empty();
			rows.forEach((r, i) => {
				const row = el("div", { cls: "uv-names-row" }, list);
				row.style.gridTemplateColumns = `${o.cols.map((_, k) => (k === 0 ? "1.4fr" : "1fr")).join(" ")} auto`;
				for (const c of o.cols) {
					const inp = el("input", { attr: { type: "text", placeholder: c.ph } }, row);
					inp.value = r[c.key] ?? "";
					if (c.link) new EntityInputSuggest(this.app, inp, p, c.link, (x) => {
						inp.value = x.name;
						r[c.key] = x.name;
						save();
					});
					inp.addEventListener("change", () => {
						r[c.key] = inp.value;
						save();
					});
				}
				const x = el("button", { cls: "clickable-icon", attr: { "aria-label": "Remove" } }, row);
				icon(x, "x");
				x.addEventListener("click", () => {
					rows.splice(i, 1);
					draw();
					save();
				});
			});
			const add = el("button", { cls: "uv-names-add" }, list);
			icon(el("span", {}, add), "plus");
			el("span", { text: o.add }, add);
			add.addEventListener("click", () => {
				rows.push({});
				draw();
				list.querySelectorAll(".uv-names-row")[rows.length - 1]?.querySelector("input")?.focus();
			});
		};
		draw();
	}

	/**
	 * Battles and wars: who fought on which side and who won (`sides:`); for a battle, the war it was
	 * part of (`war:`); for a war, its battles in order with each party's wins and losses.
	 */
	private renderWar(body: HTMLElement, e: Entity) {
		const p = this.plugin;
		const idx = p.index;
		const battle = isBattle(e);
		const war = !battle && isWar(idx, e);
		if (!battle && !war && !e.sides?.length) return;
		this.renderRows(body, e, { title: "Sides", icon: "swords", field: "sides", add: "Add a party", help: "Who fought, on which side, and how it ended for them. Parties with the same side fought together (A and B, or names like the Crown and the Rebels). Outcome: won, lost or draw. The map colours a battle's crossed swords by the winner; a war's winner is its own, or whoever won most of its battles. Written as `sides:` (or the short `victor:` and `defeated:`).", cols: [{ key: "party", ph: "Who", link: ["culture", "person", "place"] }, { key: "side", ph: "Side (A, B…)" }, { key: "outcome", ph: "Won, lost…" }] });
		const parent = battle && !e.sides ? warOf(idx, e) : undefined;
		if (parent?.sides) el("p", { cls: "universeview-dash-muted", text: `Fought by the sides of ${parent.name}. Add parties only where this battle differs.` }, body);
		const file = this.app.vault.getAbstractFileByPath(e.key);
		if (!(file instanceof TFile)) return;
		const s = el("section", { cls: "universeview-insp-section" }, body);
		const h = el("div", { cls: "universeview-insp-section-head" }, s);
		icon(el("span", {}, h), battle ? "flag" : "list-ordered");
		el("span", { text: battle ? "Part of a war" : "Battles" }, h);
		if (battle) {
			helpTip(h, "The war or campaign this battle was fought in. The map joins a war's battles in the order fought, and the war's page lists them with each side's wins. Written as `war:`.");
			const row = el("div", { cls: "universeview-insp-pick" }, s);
			el("span", { cls: "universeview-insp-pick-label", text: "War" }, row);
			const input = el("input", { attr: { type: "text", placeholder: "None (type to choose)" } }, row);
			input.value = warOf(idx, e)?.name ?? "";
			const put = (name: string | null) =>
				void p.editFrontmatter(file, (fm) => {
					// "part-of" also means where a place lies, so the war goes in its own field.
					if (typeof fm["part-of"] === "string" && warOf(idx, e)) delete fm["part-of"];
					delete fm.campaign;
					if (name) fm.war = `[[${name}]]`;
					else delete fm.war;
				}, `${e.name}: part of a war`);
			new EntityInputSuggest(this.app, input, p, ["event"], (x) => put(x.name));
			const clear = el("button", { cls: "clickable-icon", attr: { "aria-label": "Clear the war" } }, row);
			icon(clear, "x");
			clear.addEventListener("click", () => {
				input.value = "";
				put(null);
			});
			return;
		}
		helpTip(h, "The battles that name this war as theirs (their `war:`), in the order fought, and how each party fared across them.");
		const battles = battlesOf(idx, e);
		if (!battles.length) {
			el("div", { cls: "universeview-insp-empty", text: "No battles name this war yet. On a battle, choose it under Part of a war." }, s);
			return;
		}
		const list = el("div", { cls: "uv-war-battles" }, s);
		for (const b of battles) {
			const row = el("div", { cls: "uv-war-battle" }, list);
			const won = victorOf(idx, b);
			const dot = el("span", { cls: "uv-war-dot" }, row);
			if (won) dot.style.background = entityColor(p, won);
			const a = el("a", { text: b.name }, row);
			a.addEventListener("click", () => this.show(b.key));
			el("span", { cls: "uv-war-sub", text: [b.start ? formatDay(b.start.start, p.calendars.get(b.calendar), "year") : "", won ? `won by ${won.name}` : ""].filter(Boolean).join(" · ") }, row);
		}
		const tally = warTally(idx, e).filter((r) => r.won || r.lost);
		if (tally.length) {
			const t = el("div", { cls: "uv-war-tally" }, s);
			for (const r of tally) {
				const row = el("div", { cls: "uv-war-tally-row" }, t);
				el("span", { text: r.party.name }, row);
				el("span", { cls: "uv-war-sub", text: `${r.won} won · ${r.lost} lost` }, row);
			}
		}
		const win = victorOf(idx, e);
		if (win) el("div", { cls: "uv-war-sub", text: `${e.sides?.some((x) => /^won/.test(x.outcome ?? "")) ? "Victor" : "Most battles won"}: ${win.name}` }, s);
	}

	/** What it was called when: a list of names with their dates, written as `names:`. */
	private renderNames(body: HTMLElement, e: Entity) {
		const p = this.plugin;
		const file = this.app.vault.getAbstractFileByPath(e.key);
		if (!(file instanceof TFile)) return;
		const s = el("section", { cls: "universeview-insp-section" }, body);
		const h = el("div", { cls: "universeview-insp-section-head" }, s);
		icon(el("span", {}, h), "history");
		el("span", { text: "Names over time" }, h);
		helpTip(h, "Earlier or later names, each with when it applied. The map shows the name for the time slider's date, and the timeline and lineage show each renaming. Leave a date empty for open-ended. Written as `names:`.");
		const raw = (this.app.metadataCache.getFileCache(file)?.frontmatter?.names ?? []) as unknown;
		const rows = nameRows(raw);
		const list = el("div", { cls: "uv-names" }, s);
		const save = () =>
			void p.editFrontmatter(file, (fm) => {
				const clean = rows.filter((r) => r.name.trim());
				if (clean.length) fm.names = writeNames(clean);
				else delete fm.names;
			}, `${e.name}: names over time`);
		const draw = () => {
			list.empty();
			rows.forEach((r, i) => {
				const row = el("div", { cls: "uv-names-row" }, list);
				const input = (key: "name" | "from" | "to", ph: string) => {
					const inp = el("input", { attr: { type: "text", placeholder: ph } }, row);
					inp.value = r[key];
					inp.addEventListener("change", () => {
						r[key] = inp.value;
						save();
					});
				};
				input("name", "Name");
				input("from", "From");
				input("to", "To");
				const x = el("button", { cls: "clickable-icon", attr: { "aria-label": "Remove" } }, row);
				icon(x, "x");
				x.addEventListener("click", () => {
					rows.splice(i, 1);
					draw();
					save();
				});
			});
			const add = el("button", { cls: "uv-names-add" }, list);
			icon(el("span", {}, add), "plus");
			el("span", { text: "Add a name" }, add);
			add.addEventListener("click", () => {
				rows.push({ name: "", from: "", to: "" });
				draw();
				(list.querySelectorAll(".uv-names-row input")[rows.length * 3 - 3] as HTMLInputElement | undefined)?.focus();
			});
		};
		draw();
	}

	/** What kind of land it is, asked the standard way, with the tags that says written on Apply. */
	private renderLand(body: HTMLElement, e: Entity) {
		const p = this.plugin;
		const s = el("section", { cls: "universeview-insp-section" }, body);
		const h = el("div", { cls: "universeview-insp-section-head" }, s);
		icon(el("span", {}, h), "shapes");
		el("span", { text: "What it is" }, h);
		helpTip(h, "Ruled land is a title: a kingdom, a duchy, a county or a city, held by someone and answering to the title above. Geography is a region: a continent, a sub-continent, an island or a forest. Nobody rules it and it's never anyone's liege, so a kingdom lying in a sub-continent stays sovereign.\n\nApply writes the standard tags (#Title #Province #Region_Small, or #Region #Region_Enormous) and keeps the rest, like #Nation_United_States.");
		const choice = readChoice(p, e);
		const before = e.tags.map((t) => t.replace(/^#/, ""));
		const row = el("div", { cls: "universeview-insp-actions" }, s);
		const apply = el("button", { cls: "mod-cta", text: "Apply" }, row);
		apply.disabled = true;
		standardFields(s, choice, () => (apply.disabled = false), { kinds: false });
		s.appendChild(row);
		apply.addEventListener("click", () => {
			const file = this.app.vault.getAbstractFileByPath(e.key);
			if (!(file instanceof TFile)) return;
			void p.editFrontmatter(file, (fm) => {
				const own = ([] as unknown[]).concat(fm.tags ?? before).map((t) => String(t).replace(/^#/, ""));
				fm.tags = restandardise(p, own, choice, e.type);
			}, `${e.name}: what it is`);
		});
	}

	/** Who a title is under and who holds it (editable), its vassals, what a person or house holds, and how a place shows on the map. */
	private renderRealm(body: HTMLElement, e: Entity) {
		const p = this.plugin;
		const idx = p.index;
		const tree = p.realms();
		const node = tree.nodes.get(e.key);
		// Explanations sit behind a "?" by each heading.
		const section = (title: string, ic: string, help?: string) => {
			const s = el("section", { cls: "universeview-insp-section" }, body);
			const h = el("div", { cls: "universeview-insp-section-head" }, s);
			icon(el("span", {}, h), ic);
			el("span", { text: title }, h);
			if (help) helpTip(h, help);
			return s;
		};
		// Linked titles as the same chips the About tab uses.
		const chips = (parent: HTMLElement) => el("div", { cls: "universeview-ep universeview-ep-people" }, parent);
		const link = (parent: HTMLElement, key: string, extra?: string) => noteChip(p, parent, { key, name: idx.get(key)?.name ?? key }, { pick: (k) => this.show(k), host: this.contentEl }, extra);
		const write = (label: string, fn: (fm: Record<string, unknown>) => void) => {
			const file = this.app.vault.getAbstractFileByPath(e.key);
			if (file instanceof TFile) void p.editFrontmatter(file, fn, label);
		};
		// A field with a picker: shows the current link, type to change it, × to clear it.
		const picker = (parent: HTMLElement, label: string, current: string | undefined, types: EntityType[], put: (name: string | null) => void) => {
			const row = el("div", { cls: "universeview-insp-pick" }, parent);
			el("span", { cls: "universeview-insp-pick-label", text: label }, row);
			const input = el("input", { attr: { type: "text", placeholder: "None (type to choose)" } }, row);
			input.value = current ?? "";
			new EntityInputSuggest(this.app, input, p, types, (x) => put(x.name));
			const clear = el("button", { cls: "clickable-icon", attr: { "aria-label": `Clear ${label.toLowerCase()}` } }, row);
			icon(clear, "x");
			clear.addEventListener("click", () => {
				input.value = "";
				put(null);
			});
		};

		if (node || e.type === "place") this.renderLand(body, e);
		if (node || e.type === "place" || e.type === "culture") this.renderNames(body, e);
		// Who held this title when: the map's "held by" follows the time slider, the timeline shows each reign.
		if (node && node.nature !== "region") this.renderRows(body, e, { title: "Holders over time", icon: "crown", field: "holders", add: "Add a holder", help: "Each person who held this title, with when. The map's held-by, the realm tree and the legend follow the time slider; the timeline shows each one's time holding it, and the lineage marks each change. Written as `holders:`; leave a date empty for open-ended.", cols: [{ key: "holder", ph: "Who", link: ["person"] }, { key: "from", ph: "From" }, { key: "to", ph: "To" }] });
		// Wars and treaties: lands changing hands on this event's date.
		if (e.type === "event") this.renderWar(body, e);
		if (e.type === "event") this.renderRows(body, e, { title: "Lands changing hands", icon: "swords", field: "transfers", add: "Add a land", help: "Lands this event moved from one realm to another (a war, a treaty, a marriage). From the event's date the land answers to the new realm, and before it to the old one: the map, realm tree and colours follow the time slider. Leave To empty for a land that became independent. Written as `transfers:`.", cols: [{ key: "land", ph: "Land", link: ["place", "culture"] }, { key: "from", ph: "From realm", link: ["place", "culture"] }, { key: "to", ph: "To realm", link: ["place", "culture"] }] });
		if (e.type === "event") this.renderRows(body, e, { title: "Lands occupied", icon: "flag", field: "occupied", add: "Add a land", help: "Lands held for a while by someone else: the land keeps its owner, with the occupier's stripes over it on the map at those dates. Leave the dates empty for as long as this event lasts. To show part of a land, paint it with Occupied in the map's territory panel. Written as `occupied:`, one line each.", cols: [{ key: "land", ph: "Land", link: ["place", "culture"] }, { key: "by", ph: "Held by", link: ["culture", "person"] }, { key: "from", ph: "From" }, { key: "to", ph: "To" }] });
		if (node) {
			const s = section(
				node.nature === "region" ? "Region" : "Realm",
				"crown",
				"Ruled under is political: the title it answers to (a county under its duchy, a duchy under its kingdom). It's read from `under:`, `nation:`, a tag like #Nation_United_States, the folder note above it, or else where it lies; choosing one here writes `under:`, which wins over all of those.\n\nLies in is geographic: the region, island or continent it's in, whoever rules it (`located-in:` or `location:`). The two often match, but an enclave, a colony or a conquered province lies in one place and is ruled from another.\n\nHeld by is read from `lord:`, `holder:`, `owner:` or `ruler:`; choosing one here writes into whichever of those the note already uses.",
			);
			picker(s, node.nature === "region" ? "Part of" : "Ruled under", node.under ? idx.get(node.under)?.name : undefined, ["place", "culture"], (name) =>
				write(name ? `${e.name} under ${name}` : `${e.name} under no one`, (fm) => {
					if (name) fm.under = `[[${name}]]`;
					else delete fm.under;
				}),
			);
			// Geography, kept apart from rule: a place's `located-in:` (or the `location:` it already has).
			if (e.type === "place") {
				picker(s, "Lies in", e.locatedIn?.name, ["place"], (name) =>
					write(name ? `${e.name} lies in ${name}` : `${e.name} lies nowhere in particular`, (fm) => {
						const key = ["located-in", "located_in", "locatedIn", "location", "region", "within", "part-of"].find((k) => k in fm) ?? "located-in";
						const cur = fm[key];
						if (!name) delete fm[key];
						else if (Array.isArray(cur)) {
							// A list (itself, then its region, then its continent…): change only the region.
							const self = (v: unknown) => String(v).replace(/^\[\[|\]\]$/g, "").split("|")[0].trim() === e.name;
							const i = cur.findIndex((v) => !self(v));
							const next: unknown[] = [...(cur as unknown[])];
							if (i < 0) next.push(`[[${name}]]`);
							else next[i] = `[[${name}]]`;
							fm[key] = next;
						} else fm[key] = `[[${name}]]`;
					}),
				);
			}
			// The property it's already written in (lord:, holder:…), so nothing is duplicated. Nobody holds a region.
			// With holders over time, they say who holds it (edited below), not a single holder.
			if (node.nature !== "region" && !e.holders?.length) picker(s, "Held by", node.holder?.name, ["person"], (name) =>
				write(name ? `${e.name} held by ${name}` : `${e.name} held by no one`, (fm) => {
					const key = ["holder", "owner", "lord", "lady"].find((k) => k in fm) ?? "holder";
					if (name) fm[key] = `[[${name}]]`;
					else delete fm[key];
				}),
			);
			// Who it answers to in the end, when that's someone other than its holder.
			if (node.ruler && node.ruler.key !== node.holder?.key) {
				const row = el("div", { cls: "universeview-insp-pick" }, s);
				el("span", { cls: "universeview-insp-pick-label", text: "Ruler" }, row);
				const c = chips(row);
				noteChip(p, c, node.ruler, { pick: (k) => this.show(k), host: this.contentEl }, "from the realm above");
			}
			if (node.children.length) {
				const v = section(`Vassals (${node.children.length})`, "git-fork", "Titles directly under this one, with who holds each. A title goes under this one when it names it in `location:` or `under:`, or sits in this note's folder.");
				const c = chips(v);
				for (const k of node.children) {
					const n = tree.nodes.get(k);
					link(c, k, [n?.holder?.name, n?.house?.name].filter(Boolean).join(" · "));
				}
			}
		}
		const held = e.type === "person" || e.type === "culture" ? holdingsOf(tree, e.key).filter((k) => k !== e.key) : [];
		if (held.length) {
			const h = section(`Holds (${held.length})`, "landmark", "Every title held by this person (or house), largest first, with the realm each sits in.");
			const c = chips(h);
			for (const k of held) link(c, k, chainOf(tree, k).slice(0, -1).map((x) => idx.get(x)?.name).filter(Boolean).join(" › "));
		}
		if (e.type === "place") {
			const m = section("On the map", "map-pin", "Kind sets the pin's colour and icon (from `kind:` or a tag like #City).\n\nPin size and layer say how big it is and how far in you must zoom before it shows; Automatic takes them from its kind, or from its tier as a title.");
			placeStyleFields(m, p, e);
		}
		const actions = el("div", { cls: "universeview-insp-actions" }, body);
		const action = (ic: string, label: string, run: () => void) => {
			const b = el("button", {}, actions);
			icon(el("span", {}, b), ic);
			el("span", { text: label }, b);
			b.addEventListener("click", run);
		};
		if (e.type === "place" || e.territories.length || node?.children.length) action("map", "Show on map", () => void p.openMap(e.key));
		if (node) action("crown", "Realm tree", () => void p.openOrgChart(chainOf(tree, e.key)[0]));
		if (e.type === "culture" && !node) action("castle", "Dynasty tree", () => void p.openOrgChart(e.key));
	}
}
