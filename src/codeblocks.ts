import { MarkdownRenderChild, debounce, parseYaml } from "obsidian";
import type ChroniclePlugin from "./main";
import type { EntityFilter, EntityType } from "./types";
import { DEFAULT_TIMELINE_OPTIONS, TimelineGroup, TimelineRenderer } from "./render/timeline";
import { DEFAULT_FAMILY_OPTIONS, FamilyTreeRenderer } from "./render/family";
import { DEFAULT_NETWORK_OPTIONS, NetworkRenderer } from "./render/network";
import { LineageRenderer } from "./render/lineage";
import { DEFAULT_ORG_OPTIONS, OrgChartRenderer } from "./render/orgchart";
import { FanChartRenderer, TimeTreeRenderer } from "./render/treecharts";
import { ArcRenderer, renderFacts } from "./render/arc";
import { renderWorldStats } from "./render/stats";
import { CalendarRenderer, DEFAULT_CALENDAR_OPTIONS } from "./render/calendar";
import { DEFAULT_HOUSES_OPTIONS, HousesRenderer } from "./render/houses";
import { DEFAULT_MAP_OPTIONS, MapRenderer, WORLD_MAP } from "./render/map";
import { el } from "./render/common";
import { asText } from "./index/text";

export interface Renderer {
	refresh(): void | Promise<void>;
	destroy(): void;
}

type Config = Record<string, unknown>;
type Builder = (c: Config, host: HTMLElement, sourcePath: string) => Renderer;

/** Renderer factories by code block name, shared with dashboard modules. */
const BUILDERS: Record<string, Builder> = {};

/** Builds a view from code-block style options (used by the dashboard). Throws with a readable message. */
export function buildBlock(name: string, source: string, host: HTMLElement, sourcePath = ""): Renderer {
	const build = BUILDERS[name];
	if (!build) throw new Error(`Unknown view “${name}”.`);
	return build(parseConfig(source), host, sourcePath);
}

const list = (v: unknown): string[] | undefined => {
	if (v === undefined || v === null || v === "") return undefined;
	const arr = Array.isArray(v) ? v : asText(v).split(",");
	return arr.map((x) => String(x).replace(/^\[\[|\]\]$/g, "").trim()).filter(Boolean);
};
const str = (v: unknown) => (typeof v === "string" ? v.replace(/^\[\[|\]\]$/g, "").trim() : typeof v === "number" ? String(v) : undefined);
const bool = (v: unknown, d: boolean) => (v === undefined ? d : v === true || v === "true" || v === "yes");

class ChronicleBlock extends MarkdownRenderChild {
	private renderer?: Renderer;

	constructor(
		containerEl: HTMLElement,
		private plugin: ChroniclePlugin,
		private make: (host: HTMLElement) => Renderer,
		private height: number,
	) {
		super(containerEl);
	}

	onload() {
		this.containerEl.addClass("chronicle-block", "chronicle-scope");
		const host = el("div", { cls: "chronicle-block-host" }, this.containerEl);
		host.style.height = `${this.height}px`;
		const mount = () => {
			try {
				this.renderer = this.make(host);
				// Blocks that size to their content drop the fixed height.
				if (host.hasClass("is-auto-height")) host.style.removeProperty("height");
			} catch (err) {
				showError(this.containerEl, (err as Error).message);
			}
		};
		// The index may still be building when the note first renders.
		if (this.plugin.index.ready) mount();
		else this.registerEvent(this.plugin.index.on("changed", () => !this.renderer && mount()));
		const refresh = debounce(() => void this.renderer?.refresh(), 300, true);
		this.registerEvent(this.plugin.index.on("changed", refresh));
	}

	onunload() {
		this.renderer?.destroy();
	}
}

function showError(parent: HTMLElement, message: string) {
	const box = el("div", { cls: "chronicle-block-error" }, parent);
	el("strong", { text: "UniverseView: " }, box);
	el("span", { text: message }, box);
}

function parseConfig(source: string): Config {
	const trimmed = source.trim();
	if (!trimmed) return {};
	const parsed: unknown = parseYaml(trimmed);
	// Only comments → no options.
	if (parsed === null || parsed === undefined) return {};
	if (typeof parsed !== "object") throw new Error("Options must be written as `key: value` lines.");
	const out: Config = {};
	for (const [k, v] of Object.entries(parsed as Config)) out[k.toLowerCase()] = v;
	return out;
}

function filterFrom(plugin: ChroniclePlugin, c: Config): EntityFilter {
	const cal = plugin.calendars.get(str(c.calendar));
	const day = (v: unknown) => {
		if (v === undefined) return undefined;
		const d = plugin.parseDate(v, cal.id);
		if (!d) throw new Error(`Couldn't read date “${asText(v)}”.`);
		return d;
	};
	return {
		search: str(c.search),
		folder: str(c.folder)?.replace(/\/$/, ""),
		tags: list(c.tags ?? c.tag),
		cultures: list(c.cultures ?? c.culture),
		people: list(c.people ?? c.person),
		places: list(c.places ?? c.place),
		from: day(c.from)?.start,
		to: day(c.to)?.end,
		minImportance: c.importance !== undefined ? Number(c.importance) : undefined,
	};
}

export function registerCodeBlocks(plugin: ChroniclePlugin) {
	// Each embed has two names: `universeview-timeline` (what UniverseView writes and documents) and the older
	// `chronicle-timeline`, which keeps working in every note already written with it.
	const reg = (name: string, build: Builder, defaultHeight = 360) => {
		for (const alias of [name.replace(/^chronicle-/, "universeview-"), name]) {
			BUILDERS[alias] = build;
			plugin.registerMarkdownCodeBlockProcessor(alias, (source, elx, ctx) => {
				let config: Config;
				try {
					config = parseConfig(source);
				} catch (err) {
					showError(elx, (err as Error).message);
					return;
				}
				const height = Number(config.height) > 80 ? Number(config.height) : defaultHeight;
				ctx.addChild(new ChronicleBlock(elx, plugin, (host) => build(config, host, ctx.sourcePath), height));
			});
		}
	};

	reg("chronicle-timeline", (c, host) => {
		const group = (str(c.group) ?? "none") as TimelineGroup;
		return new TimelineRenderer(host, plugin, {
			...structuredClone(DEFAULT_TIMELINE_OPTIONS),
			filter: filterFrom(plugin, c),
			group: ["none", "category", "realm", "culture", "place", "person", "tag", "type"].includes(group) ? group : "none",
			focus: str(c.focus) ? plugin.index.findByName(str(c.focus)!)?.key : undefined,
			lifespans: bool(c.lifespans, false),
			lifeEvents: bool(c.births ?? c["life-events"], plugin.settings.showLifeEvents),
			cultures: bool(c["show-cultures"], false),
			eras: bool(c.eras, true),
			calendar: str(c.calendar),
		}, true);
	}, 300);

	reg("chronicle-family", (c, host, sourcePath) => {
		const rootName = str(c.root ?? c.person);
		const root = rootName ? plugin.index.findByName(rootName) : plugin.index.get(sourcePath);
		if (rootName && !root) throw new Error(`No person called “${rootName}”.`);
		const layout = (["tree", "everyone", "fan", "time"] as const).find((l) => l === str(c.layout));
		const opts = {
			...DEFAULT_FAMILY_OPTIONS,
			root: root?.key,
			up: c.up !== undefined ? Number(c.up) : layout === "fan" ? 4 : DEFAULT_FAMILY_OPTIONS.up,
			down: c.down !== undefined ? Number(c.down) : layout === "time" ? 4 : DEFAULT_FAMILY_OPTIONS.down,
			siblings: bool(c.siblings, true),
			layout,
			steps: c.steps !== undefined ? (str(c.steps) === "all" ? 99 : Number(c.steps)) : DEFAULT_FAMILY_OPTIONS.steps,
			inLaws: bool(c["in-laws"] ?? c.inlaws, false),
			relations: bool(c.relations, true),
		};
		if (layout === "fan") return new FanChartRenderer(host, plugin, opts, true);
		if (layout === "time") return new TimeTreeRenderer(host, plugin, opts, true);
		return new FamilyTreeRenderer(host, plugin, opts, true);
	}, 420);

	// An always-current infobox for a note (defaults to the note it's in).
	reg("chronicle-facts", (c, host, sourcePath) => {
		const name = str(c.note ?? c.of ?? c.person ?? c.place);
		const e = name ? plugin.index.findByName(name) : plugin.index.get(sourcePath);
		if (name && !e) throw new Error(`No note called “${name}”.`);
		host.addClass("is-auto-height");
		const draw = () => renderFacts(plugin, host, e?.key);
		draw();
		return { refresh: draw, destroy: () => host.empty() };
	}, 120);

	// A person's life on one line: roles, partners, children, where they were, events.
	reg("chronicle-arc", (c, host, sourcePath) => {
		const name = str(c.person ?? c.of);
		const e = name ? plugin.index.findByName(name) : plugin.index.get(sourcePath);
		if (name && !e) throw new Error(`No person called “${name}”.`);
		host.addClass("is-auto-height");
		return new ArcRenderer(host, plugin, e?.key);
	}, 120);

	// Statistics about a world: people alive over time, balance of groups, lifespans, names, families.
	reg("chronicle-stats", (c, host) => {
		const folder = str(c.folder)?.replace(/\/$/, "");
		host.addClass("is-auto-height");
		const draw = () => renderWorldStats(plugin, host, folder);
		draw();
		return { refresh: draw, destroy: () => host.empty() };
	}, 120);

	// Houses as bands over the generations, with marriages and successions.
	reg("chronicle-houses", (c, host) => new HousesRenderer(host, plugin, {
		...DEFAULT_HOUSES_OPTIONS,
		folder: str(c.folder)?.replace(/\/$/, ""),
		all: bool(c.all, false),
		descent: bool(c.descent, true),
	}, true), 420);

	// A month, a year or what's coming up, in the world's calendar.
	reg("chronicle-calendar", (c, host) => {
		const folder = str(c.folder)?.replace(/\/$/, "");
		const calId = str(c.calendar);
		const cal = plugin.calendars.get(calId ?? plugin.index.calendarFor(folder ?? ""));
		const at = c.date !== undefined ? plugin.parseDate(c.date, cal.id) : null;
		const mode = str(c.mode)?.toLowerCase();
		const pos = at ? cal.fromDays(at.start) : undefined;
		host.addClass("is-auto-height");
		return new CalendarRenderer(host, plugin, {
			...DEFAULT_CALENDAR_OPTIONS,
			folder,
			calendar: calId,
			mode: mode === "year" ? "year" : mode === "week" ? "week" : mode === "agenda" || mode === "upcoming" ? "agenda" : "month",
			year: pos?.y,
			month: pos?.m,
			selected: at?.start,
			moons: bool(c.moons, true),
			birthdays: bool(c.birthdays, true),
			holidays: bool(c.holidays, true),
			story: bool(c.story, true),
		}, true);
	}, 420);

	reg("chronicle-graph", (c, host, sourcePath) => {
		const focusName = str(c.focus);
		const focus = focusName ? plugin.index.findByName(focusName) : plugin.index.get(sourcePath);
		const typeNames: Record<string, EntityType> = {
			person: "person", people: "person", persons: "person", character: "person", characters: "person",
			culture: "culture", cultures: "culture", place: "place", places: "place", event: "event", events: "event",
		};
		const types = (list(c.types) ?? []).map((t) => typeNames[t.toLowerCase()]).filter(Boolean);
		return new NetworkRenderer(host, plugin, {
			...structuredClone(DEFAULT_NETWORK_OPTIONS),
			filter: filterFrom(plugin, c),
			types: types.length ? types : DEFAULT_NETWORK_OPTIONS.types,
			focus: focus?.key,
			depth: c.depth !== undefined ? Number(c.depth) : 2,
			labels: bool(c.labels, true),
		}, true);
	}, 400);

	reg("chronicle-lineage", (c, host) => {
		const focus = str(c.focus ?? c.culture);
		return new LineageRenderer(host, plugin, {
			folder: str(c.folder)?.replace(/\/$/, ""),
			focus: focus ? plugin.index.findByName(focus)?.key : undefined,
			calendar: str(c.calendar),
		}, true);
	}, 320);

	reg("chronicle-org", (c, host, sourcePath) => {
		const rootName = str(c.root ?? c.organisation ?? c.organization ?? c.culture);
		const self = plugin.index.get(sourcePath);
		const root = rootName ? plugin.index.findByName(rootName) : self?.type === "culture" ? self : undefined;
		if (rootName && !root) throw new Error(`No organisation called “${rootName}”.`);
		const cal = plugin.calendars.get(str(c.calendar) ?? root?.calendar);
		const at = c.at !== undefined ? plugin.parseDate(c.at, cal.id) : null;
		if (c.at !== undefined && !at) throw new Error(`Couldn't read date “${asText(c.at)}”.`);
		return new OrgChartRenderer(host, plugin, {
			...DEFAULT_ORG_OPTIONS,
			root: root?.key,
			folder: str(c.folder)?.replace(/\/$/, ""),
			at: at?.end,
			members: bool(c.members, true),
			timeline: bool(c.timeline, true),
			relations: bool(c.relations ?? c.relationships, true),
			ties: bool(c.ties ?? c["people-ties"], true),
			depth: c.depth !== undefined ? Number(c.depth) : DEFAULT_ORG_OPTIONS.depth,
			calendar: str(c.calendar),
		}, true);
	}, 520);

	reg("chronicle-map", (c, host, sourcePath) => {
		const mapName = str(c.map);
		const mapEntity = mapName && mapName.toLowerCase() !== "world" ? plugin.index.findByName(mapName) : undefined;
		if (mapName && mapName.toLowerCase() !== "world" && !mapEntity) throw new Error(`No map note called “${mapName}”.`);
		const focusName = str(c.focus);
		const self = plugin.index.get(sourcePath);
		const focus = focusName ? plugin.index.findByName(focusName) : self?.type === "place" ? self : undefined;
		const trace = str(c.trace);
		let map = mapEntity?.key ?? WORLD_MAP;
		if (!mapName && focus?.map) map = focus.map.key;
		return new MapRenderer(host, plugin, {
			...DEFAULT_MAP_OPTIONS,
			map,
			focus: focus?.key,
			trace: trace ? plugin.index.findByName(trace)?.key : undefined,
			folder: str(c.folder)?.replace(/\/$/, ""),
			onlyWithEvents: bool(c["events-only"], false),
			showTerritories: bool(c.territories, true),
			showLabels: bool(c.labels, true),
			showRoutes: bool(c.routes, true),
			fadeSmall: bool(c["fade-small"] ?? c.fade, true),
			tiers: bool(c.tiers, true),
			heatmap: bool(c.heatmap ?? c["heat-map"], false),
			colorBy: (["culture", "category", "region", "type"] as const).find((x) => x === str(c["color-by"] ?? c.colors)),
		}, true);
	}, 400);
}
