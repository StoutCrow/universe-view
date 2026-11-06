import { Keymap, Menu, Platform, ViewStateResult } from "obsidian";
import type { Entity, EntityType } from "../types";
import { rangeOf } from "../index/EntityIndex";
import { validate } from "../index/validate";
import { TYPE_ICONS, el, icon, iconButton, setPressed } from "../render/common";
import { GROUP_KINDS, groupKind } from "../render/houses";
import { LIST_INFO, ListKind, kinCount, listRows, renderList } from "../render/panels";
import { VIEW_DASHBOARD } from "./DashboardView";
import { ValidateModal } from "../ui/ValidateModal";
import { DetectModal } from "../ui/DetectModal";
import { CardLayout } from "../ui/cardlayout";
import { ChronicleView } from "./base";
import { VIEW_TIMELINE } from "./TimelineView";
import { VIEW_FAMILY } from "./FamilyTreeView";
import { VIEW_NETWORK } from "./NetworkView";
import { VIEW_LINEAGE } from "./LineageView";
import { VIEW_MAP } from "./MapView";

export const VIEW_OVERVIEW = "chronicle-overview";

const PLURAL: Record<EntityType, string> = { person: "People", event: "Events", culture: "Groups", place: "Places", map: "Maps" };

/** The UniverseView "main menu": a summary of one world with ways into every view. */
export class OverviewView extends ChronicleView {
	/** Top-level folder (one world) to summarise; empty for the whole vault. */
	private world?: string;
	private page?: HTMLElement;
	private layout = new CardLayout(this.plugin, () => this.fillToolbar());

	getViewType() {
		return VIEW_OVERVIEW;
	}
	getDisplayText() {
		return this.world ? `${this.world} overview` : "UniverseView overview";
	}
	getIcon() {
		return "library";
	}

	getState(): Record<string, unknown> {
		return { scope: this.world };
	}

	async setState(state: unknown, result: ViewStateResult) {
		const s = state as { scope?: string } | undefined;
		if (s && "scope" in s) {
			this.world = s.scope;
			if (this.isBuilt) {
				this.fillToolbar();
				this.render();
			}
		}
		await super.setState(state, result);
	}

	protected build() {
		this.world ??= this.defaultScope();
		this.register(() => this.layout.destroy());
		this.fillToolbar();
		this.page = el("div", { cls: "chronicle-overview" }, this.body);
		this.render();
	}

	protected onIndexChanged() {
		this.fillToolbar();
		this.render();
	}

	private fillToolbar() {
		this.rebuildToolbar(() => {
			const left = this.group();
			this.scopePicker(left, this.world, (v) => {
				this.world = v;
				(this.leaf as unknown as { updateHeader?: () => void }).updateHeader?.();
				this.app.workspace.requestSaveLayout();
				this.render();
			});
			setPressed(iconButton(left, "layout-grid", "Customise this page: hide, move and resize its cards", () => this.layout.toggle()), this.layout.editing);
		});
	}

	private inScope(e: Entity): boolean {
		return !this.world || e.path.startsWith(this.world + "/");
	}

	private hotkey(key: string): string {
		return Platform.isMacOS ? `⌘⌥${key}` : `Ctrl+Alt+${key}`;
	}

	private render() {
		const page = this.page;
		if (!page) return;
		const scrollTop = page.scrollTop;
		page.empty();
		const idx = this.plugin.index;
		const all = idx.all().filter((e) => this.inScope(e));
		const of = (t: EntityType) => all.filter((e) => e.type === t);
		const cal = this.plugin.calendars.get(idx.dominantCalendar(this.world || undefined));
		const options = (extra: Record<string, unknown> = {}) => ({ options: { filter: { folder: this.world ?? "" }, ...extra } });

		// ---- Header ----
		const hero = el("div", { cls: "chronicle-ov-hero" }, page);
		el("h1", { cls: "chronicle-ov-title", text: this.world || this.app.vault.getName() }, hero);
		let min = Infinity;
		let max = -Infinity;
		for (const e of all) {
			const r = rangeOf(e);
			if (r) [min, max] = [Math.min(min, r[0]), Math.max(max, r[1])];
		}
		// Groups counted by what they are: realms, houses and the rest apart.
		const groups = of("culture");
		const byKind = new Map<string, number>();
		for (const g of groups) {
			const k = groupKind(this.plugin, g);
			byKind.set(k, (byKind.get(k) ?? 0) + 1);
		}
		const groupCounts = [...byKind].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n} ${(n === 1 ? GROUP_KINDS[k as keyof typeof GROUP_KINDS].label : GROUP_KINDS[k as keyof typeof GROUP_KINDS].plural).toLowerCase()}`);
		const counts = [...(["person", "event", "place"] as EntityType[]).map((t) => `${of(t).length} ${PLURAL[t].toLowerCase()}`), ...groupCounts];
		const span = Number.isFinite(min) ? ` · ${cal.formatYear(cal.fromDays(min).y)} – ${cal.formatYear(cal.fromDays(max).y)}` : "";
		el("div", { cls: "chronicle-ov-sub", text: counts.join(" · ") + span }, hero);

		if (!all.length) {
			const empty = el("div", { cls: "chronicle-ov-emptynote" }, page);
			empty.setText("No people, places, events, realms or houses here yet. Create one, or let UniverseView detect them in your existing notes.");
		}

		// ---- Views ----
		const p = this.plugin;
		const tiles = el("div", { cls: "chronicle-ov-tiles" }, page);
		const biggestFamily = of("person").sort((a, b) => kinCount(p, b) - kinCount(p, a))[0];
		let n = 0;
		const tile = (type: string, iconName: string, title: string, desc: string, stat: string, key: string, state: Record<string, unknown>) => {
			const t = el("button", { cls: "chronicle-ov-tile" }, tiles);
			t.style.setProperty("--i", String(n++));
			const ic = el("div", { cls: "chronicle-ov-tile-icon" }, t);
			icon(ic, iconName);
			el("div", { cls: "chronicle-ov-tile-title", text: title }, t);
			el("div", { cls: "chronicle-ov-tile-desc", text: desc }, t);
			const foot = el("div", { cls: "chronicle-ov-tile-foot" }, t);
			el("span", { text: stat }, foot);
			el("kbd", { text: this.hotkey(key) }, foot);
			t.addEventListener("click", (evt) => void p.activateView(type, state, Keymap.isModEvent(evt) ? "tab" : false));
			t.addEventListener("contextmenu", (evt) => {
				evt.preventDefault();
				const menu = new Menu();
				menu.addItem((i) => i.setTitle("Open").setIcon(iconName).onClick(() => void p.activateView(type, state)));
				menu.addItem((i) => i.setTitle("Open in new tab").setIcon("plus-square").onClick(() => void p.activateView(type, state, "tab")));
				menu.addItem((i) => i.setTitle("Open to the right").setIcon("separator-vertical").onClick(() => void p.activateView(type, state, "split")));
				if (type !== VIEW_DASHBOARD) {
					menu.addItem((i) => i.setTitle("Add to board").setIcon("layout-dashboard").onClick(() => void p.addToBoard(type, this.world)));
				}
				menu.showAtMouseEvent(evt);
			});
		};
		const mapState = { options: { folder: this.world ?? "", ...(of("map")[0] && !of("place").some((x) => x.coords) ? { map: of("map")[0].key } : {}) } };
		tile("chronicle-explorer", "panels-top-left", "Library", "Every folder and note with its relationships, basics to edit, and folder settings.", `${p.app.vault.getMarkdownFiles().length} notes`, "H", {});
		tile(VIEW_DASHBOARD, "layout-dashboard", "Board", "Your own dashboard: arrange timelines, maps, trees and lists side by side.", `${p.settings.boards.length || 1} board${p.settings.boards.length > 1 ? "s" : ""}`, "B", { scope: this.world ?? "" });
		tile(VIEW_TIMELINE, "calendar-range", "Timeline", "Every dated event, lifespan and era, zoomable from millennia to days.", `${of("event").length} events`, "T", options());
		tile(VIEW_FAMILY, "git-fork", "Family tree", biggestFamily ? `Ancestors and descendants, starting with ${biggestFamily.name}.` : "Ancestors, descendants and marriages.", `${of("person").length} people`, "F",
			biggestFamily ? { options: { root: biggestFamily.key } } : {});
		tile(VIEW_NETWORK, "waypoints", "Connections", "How people, cultures, places and events link together, at any point in time.", `${all.length} notes`, "G", options());
		tile(VIEW_LINEAGE, "git-branch", "Lineage of groups", "Realms, houses, faiths and peoples: when they rose, split and fell, in lanes by kind.", `${of("culture").length} groups`, "L", { options: { folder: this.world ?? "" } });
		tile("chronicle-orgchart", "network", "Organisation chart", "Who leads and serves in each faction, house or guild, with a timeline of roles.", `${of("culture").length} organisations`, "R", { options: { folder: this.world ?? "" } });
		tile(VIEW_MAP, "map", "Map", "Places, territories and journeys on your maps, with what happened where.", `${of("place").filter((x) => x.position || x.coords).length} of ${of("place").length} places placed`, "M", mapState);
		// ---- Actions ----
		const grid = el("div", { cls: "chronicle-ov-grid" }, page);
		const actions = el("div", { cls: "chronicle-ov-actions", attr: { "data-card": "actions", "data-title": "Quick actions", "data-span": "full" } }, grid);
		const action = (iconName: string, label: string, run: () => void, badge?: number, cls = "") => {
			const b = el("button", { cls: `chronicle-ov-action ${cls}`.trim() }, actions);
			const ic = el("span", {}, b);
			icon(ic, iconName);
			el("span", { text: label }, b);
			if (badge) el("span", { cls: "chronicle-ov-badge", text: String(badge) }, b);
			b.addEventListener("click", run);
		};
		for (const t of ["event", "person", "culture", "place"] as EntityType[]) {
			action(TYPE_ICONS[t], `New ${t}`, () => p.createEntityPrompt({ type: t, scope: this.world || undefined }));
		}
		const issues = validate(idx).filter((i) => i.severity !== "info" && (!this.world || i.key.startsWith(this.world + "/")));
		action("wand-2", "Detect types", () => new DetectModal(p).open());
		action("shield-check", "Check data", () => new ValidateModal(p).open(), issues.length, issues.length ? "has-issues" : "");

		// ---- Panels ----
		const panel = (kind: ListKind, i: number, more?: () => void) => {
			const box = el("section", { cls: "chronicle-ov-panel", attr: { "data-card": kind, "data-title": LIST_INFO[kind].title } }, grid);
			box.style.setProperty("--i", String(i));
			const head = el("div", { cls: "chronicle-ov-panel-head" }, box);
			const ic = el("span", {}, head);
			icon(ic, LIST_INFO[kind].icon);
			el("h3", { text: LIST_INFO[kind].title }, head);
			if (more) {
				const m = el("a", { cls: "chronicle-ov-more", text: "Open view" }, head);
				m.addEventListener("click", more);
			}
			const { rows, detail } = listRows(p, kind, this.world || undefined);
			renderList(p, box, rows, detail, this.hoverHost);
		};
		const people = listRows(p, "people", this.world || undefined).rows;
		panel("events", 0, () => void p.activateView(VIEW_TIMELINE, options()));
		panel("cultures", 1, () => void p.activateView(VIEW_LINEAGE, { options: { folder: this.world ?? "" } }));
		panel("people", 2, () => void p.activateView(VIEW_FAMILY, people[0] ? { options: { root: people[0].key } } : {}));
		panel("places", 3, () => void p.activateView(VIEW_MAP, { options: { folder: this.world ?? "" } }));
		panel("recent", 4);
		this.layout.apply(grid, "overview");
		page.scrollTop = scrollTop;
	}
}
