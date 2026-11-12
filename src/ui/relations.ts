import { Modal, Notice, Setting, TFile } from "obsidian";
import type UniverseViewPlugin from "../main";
import type { Entity, EntityType } from "../types";
import { buildFieldAliases, type FieldName } from "../settings";
import { EntityInputSuggest } from "./suggest";
import { linkTarget } from "../index/reader";
import { relKind, relOne } from "../index/relkinds";
import { asText } from "../index/text";

/** Where a relationship is written: a property on one of the two notes. */
export interface LinkSpec {
	field: FieldName;
	/** "self": on the note being viewed; "other": on the note being linked (e.g. a child's `parents`). */
	on: "self" | "other";
	types: EntityType[];
	/** Only one value (located-in). */
	single?: boolean;
	/** Ask for a role (memberships) or a kind (relations: mentor, rival…). */
	ask?: "role" | "kind";
	/** Ask for from/to dates. */
	dates?: boolean;
	/** Key for the link in the object form ({ culture: "[[X]]", role: … }). */
	objKey?: string;
	label: string;
}

/** One place a link can be removed from. */
export interface Unlink {
	path: string;
	field: FieldName;
	name: string;
	/**
	 * Relations only: which kind to remove ("rivals"), so unlinking a rival doesn't also drop the same
	 * person from `friends:`. "" means an untyped entry in a general `relations:` list.
	 */
	kind?: string;
}

/** Property names that hold relations of any kind (the kind is written on each entry). */
const GENERIC_RELATIONS = new Set(["relations", "relationships", "related", "related-cultures", "related_cultures", "relatedcultures"]);

/** One name for a relation kind however it's spelled ("Rival", "rivals", "rivalry" → "rivals"). */
const kindKey = (k: string | undefined) => (k ? relKind(k)?.key ?? k.trim().toLowerCase() : "");


/** Adds a link to a note's property, in the property name the note already uses. */
export async function addLink(plugin: UniverseViewPlugin, file: TFile, spec: Pick<LinkSpec, "field" | "single" | "objKey">, name: string, extra: Record<string, string> = {}) {
	const aliases = buildFieldAliases(plugin.settings.fieldAliases)[spec.field];
	await plugin.editFrontmatter(file, (front) => {
		let key = aliases.find((a) => a in front) ?? aliases[0];
		// A known kind of relation goes in its own property ("rivals:"), under the spelling the note already uses.
		const kind = spec.field === "relations" ? relKind(extra.kind) : undefined;
		if (kind) {
			key = Object.keys(front).find((k) => relKind(k)?.key === kind.key) ?? kind.key;
			extra = { ...extra };
			delete extra.kind;
		}
		const link = `[[${name}]]`;
		if (spec.single) {
			front[key] = link;
			return;
		}
		const cur = front[key];
		const list: unknown[] = Array.isArray(cur) ? cur : cur === undefined || cur === null || cur === "" ? [] : [cur];
		if (list.some((v) => linkTarget(v)?.toLowerCase() === name.toLowerCase())) return;
		const filled = Object.fromEntries(Object.entries(extra).filter(([, v]) => v.trim()));
		list.push(Object.keys(filled).length ? { [spec.objKey ?? "link"]: link, ...filled } : link);
		front[key] = list;
	}, `Link ${name} to ${file.basename}`);
}

/** Removes every link to `name` from a property (under any of its names). Returns whether one was found. */
export async function removeLink(plugin: UniverseViewPlugin, u: Unlink): Promise<boolean> {
	const file = plugin.app.vault.getAbstractFileByPath(u.path);
	if (!(file instanceof TFile)) return false;
	const aliases = buildFieldAliases(plugin.settings.fieldAliases)[u.field];
	let found = false;
	await plugin.editFrontmatter(file, (front) => {
		const want = u.kind === undefined ? undefined : kindKey(u.kind);
		for (const key of aliases) {
			if (!(key in front)) continue;
			const cur = front[key];
			const generic = GENERIC_RELATIONS.has(key.toLowerCase());
			// With a kind, only that kind's property, or entries of that kind in a general list.
			if (want !== undefined && !generic && kindKey(key) !== want) continue;
			const kindOf = (v: unknown) => kindKey(v && typeof v === "object" ? asText((v as Record<string, unknown>).kind ?? "") : "");
			const matches = (v: unknown) => linkTarget(v)?.toLowerCase() === u.name.toLowerCase() && (want === undefined || !generic || kindOf(v) === want);
			if (Array.isArray(cur)) {
				const next = cur.filter((v) => !matches(v));
				if (next.length === cur.length) continue;
				found = true;
				if (next.length) front[key] = next;
				else delete front[key];
			} else if (matches(cur)) {
				found = true;
				delete front[key];
			}
		}
	}, `Unlink ${u.name} from ${file.basename}`);
	return found;
}

/** Adds a link to a plain list property (`led-to:`, `founder:`…), keeping what's there. */
async function addToList(plugin: UniverseViewPlugin, file: TFile, prop: string, name: string, label: string) {
	await plugin.editFrontmatter(file, (f) => {
		const key = Object.keys(f).find((k) => k.toLowerCase() === prop) ?? prop;
		const list = ([] as unknown[]).concat(f[key] ?? []).filter((v) => v !== null && v !== "");
		if (!list.some((v) => linkTarget(v)?.toLowerCase() === name.toLowerCase())) list.push(`[[${name}]]`);
		f[key] = list;
	}, label);
}

/**
 * The ways two notes can be tied, for drawing a line between them: family and relationships for
 * people, membership and leadership between people and groups, alliances and vassalage between
 * groups, cause and effect between events, and so on. Each choice is written where it belongs.
 */
export function linkChoices(plugin: UniverseViewPlugin, a: Entity, b: Entity): { label: string; icon: string; run: () => Promise<void> }[] {
	const out: { label: string; icon: string; run: () => Promise<void> }[] = [];
	const rel = (on: Entity, other: Entity, kind: string, label: string, ic = "link") =>
		out.push({ label, icon: ic, run: () => addLink(plugin, on.file, { field: "relations", objKey: "link" }, other.name, { kind }) });
	const field = (on: Entity, other: Entity, f: FieldName, label: string, ic: string, extra: Record<string, string> = {}, objKey?: string, single?: boolean) =>
		out.push({ label, icon: ic, run: () => addLink(plugin, on.file, { field: f, objKey, single }, other.name, extra) });
	const list = (on: Entity, other: Entity, prop: string, label: string, ic: string) =>
		out.push({ label, icon: ic, run: () => addToList(plugin, on.file, prop, other.name, label) });
	const pair = (x: Entity["type"], y: Entity["type"]) => (a.type === x && b.type === y ? [a, b] : b.type === x && a.type === y ? [b, a] : null);
	let p: Entity[] | null;
	if (a.type === "person" && b.type === "person") {
		field(b, a, "parents", `${a.name} is ${b.name}'s parent`, "baby");
		field(a, b, "parents", `${b.name} is ${a.name}'s parent`, "baby");
		field(a, b, "partners", "Partners", "heart");
		rel(a, b, "allies", "Allies", "handshake");
		rel(a, b, "friends", "Friends", "smile");
		rel(a, b, "rivals", "Rivals", "swords");
		rel(a, b, "enemies", "Enemies", "skull");
		rel(a, b, "mentors", `${b.name} taught ${a.name}`, "graduation-cap");
		rel(a, b, "students", `${a.name} taught ${b.name}`, "graduation-cap");
		rel(a, b, "liege", `${a.name} serves ${b.name} (${relOne("liege")})`, "crown");
		rel(a, b, "employer", `${a.name} works for ${b.name}`, "briefcase");
	} else if ((p = pair("person", "culture"))) {
		const [person, group] = p;
		field(person, group, "cultures", `${person.name} belongs to ${group.name}`, "flag", {}, "culture");
		field(person, group, "cultures", `${person.name} leads ${group.name}`, "crown", { role: "Leader" }, "culture");
		list(group, person, "founder", `${person.name} founded ${group.name}`, "sparkles");
		rel(person, group, "allies", `${person.name} is allied with ${group.name}`, "handshake");
		rel(person, group, "enemies", `${person.name} is an enemy of ${group.name}`, "skull");
	} else if (a.type === "culture" && b.type === "culture") {
		rel(a, b, "allies", "Allies", "handshake");
		rel(a, b, "rivals", "Rivals", "swords");
		rel(a, b, "enemies", "At war (enemies)", "skull");
		rel(a, b, "trade-partners", "Trade partners", "coins");
		rel(a, b, "vassals", `${b.name} is ${a.name}'s ${relOne("vassals")}`, "crown");
		rel(b, a, "vassals", `${a.name} is ${b.name}'s ${relOne("vassals")}`, "crown");
		field(a, b, "parentCultures", `${a.name} is a branch of ${b.name}`, "git-branch");
		field(b, a, "parentCultures", `${b.name} is a branch of ${a.name}`, "git-branch");
	} else if ((p = pair("event", "person"))) {
		field(p[0], p[1], "participants", `${p[1].name} took part`, "users");
	} else if ((p = pair("event", "place"))) {
		field(p[0], p[1], "places", `It happened at ${p[1].name}`, "map-pin");
	} else if ((p = pair("event", "culture"))) {
		field(p[0], p[1], "cultures", `${p[1].name} took part`, "flag");
	} else if (a.type === "event" && b.type === "event") {
		list(a, b, "led-to", `${a.name} led to ${b.name}`, "git-pull-request-arrow");
		list(b, a, "led-to", `${b.name} led to ${a.name}`, "git-pull-request-arrow");
	} else if (a.type === "place" && b.type === "place") {
		field(a, b, "locatedIn", `${a.name} is in ${b.name}`, "map", {}, undefined, true);
		field(b, a, "locatedIn", `${b.name} is in ${a.name}`, "map", {}, undefined, true);
	} else if ((p = pair("place", "culture"))) {
		field(p[0], p[1], "cultures", `${p[1].name} holds ${p[0].name}`, "flag", {}, "culture");
	} else if ((p = pair("person", "place"))) {
		field(p[0], p[1], "places", `${p[0].name} lived at ${p[1].name}`, "home");
		field(p[0], p[1], "birthPlace", `${p[0].name} was born at ${p[1].name}`, "baby", {}, undefined, true);
	}
	return out;
}

/** Picks a note to link, with role/kind and dates when the relationship has them. */
export class AddRelationModal extends Modal {
	private picked?: Entity;

	constructor(private plugin: UniverseViewPlugin, private self: Entity, private spec: LinkSpec) {
		super(plugin.app);
	}

	onOpen() {
		this.containerEl.addClass("universeview-scope-host");
		this.modalEl.addClass("universeview-scope");
		this.titleEl.setText(`${this.self.name}: add to “${this.spec.label}”`);
		let nameInput!: HTMLInputElement;
		new Setting(this.contentEl).setName("Note").setDesc("Pick one, or type a name for a note that doesn't exist yet.").addText((t) => {
			nameInput = t.inputEl;
			t.setPlaceholder("Name…");
			new EntityInputSuggest(this.app, t.inputEl, this.plugin, this.spec.types, (e) => {
				this.picked = e;
				t.setValue(e.name);
			});
		});
		const extra: Record<string, string> = {};
		if (this.spec.ask) {
			new Setting(this.contentEl)
				.setName(this.spec.ask === "role" ? "Role" : "Kind of relationship")
				.addText((t) => t.setPlaceholder(this.spec.ask === "role" ? "Knight, steward, member…" : "mentor, rival, ally…").onChange((v) => (extra[this.spec.ask!] = v)));
		}
		if (this.spec.dates) {
			new Setting(this.contentEl).setName("From").addText((t) => t.setPlaceholder("Optional").onChange((v) => (extra.from = v)));
			new Setting(this.contentEl).setName("To").addText((t) => t.setPlaceholder("Optional").onChange((v) => (extra.to = v)));
		}
		const submit = async () => {
			const name = (this.picked && nameInput.value === this.picked.name ? this.picked.name : nameInput.value).trim();
			if (!name) return;
			const other = this.picked && this.picked.name === name ? this.picked : this.plugin.index.findByName(name);
			this.close();
			if (this.spec.on === "self") await addLink(this.plugin, this.self.file, this.spec, name, extra);
			else if (other) await addLink(this.plugin, other.file, this.spec, this.self.name, extra);
			else {
				new Notice(`“${name}” doesn't exist yet; create it first, then link it.`);
				return;
			}
			new Notice(`Linked ${name}`);
		};
		new Setting(this.contentEl).addButton((b) => b.setButtonText("Add").setCta().onClick(() => void submit()));
		window.setTimeout(() => nameInput.focus(), 30);
	}

	onClose() {
		this.contentEl.empty();
	}
}
