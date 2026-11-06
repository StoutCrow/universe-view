import { TidyModal, tidyPlan } from "../src/ui/tidy";
import { QuickAddModal } from "../src/ui/writing";
import { viewToSvg } from "../src/ui/export";
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Browser harness: runs the real UniverseView plugin against the example vault using the
 * Obsidian mock, so views can be checked visually without Obsidian.
 */
import YAML from "yaml";
import { Events, TFile, TFolder, WorkspaceLeaf, setIcon } from "obsidian";
import ChroniclePlugin from "../src/main";
import { validate } from "../src/index/validate";
import * as trace from "../src/render/trace";
import * as relations from "../src/ui/relations";
import * as website from "../src/ui/website";

declare const VAULT_FILES: Record<string, string>;
declare const PLUGIN_DATA: unknown;

// ---- Vault -------------------------------------------------------------------------------------------

const files = new Map<string, TFile>();
const contents = new Map<string, string>();
const caches = new Map<string, any>();
const folders = new Map<string, TFolder>();

function folderFor(path: string): TFolder {
	const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "/";
	let f = folders.get(dir);
	if (!f) {
		f = new TFolder();
		f.path = dir;
		f.name = dir.split("/").pop() ?? "";
		folders.set(dir, f);
		// Folders know their parent and are listed in it, as in a real vault.
		if (dir !== "/") {
			const up = folderFor(dir);
			f.parent = up;
			up.children.push(f);
		}
	}
	return f;
}

function parseNote(text: string) {
	const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
	const frontmatter = m ? YAML.parse(m[1], { uniqueKeys: false }) ?? {} : undefined;
	const body = m ? text.slice(m[0].length) : text;
	const tags = [...body.matchAll(/(^|\s)#([\w/-]+)/g)].map((x) => ({ tag: "#" + x[2] }));
	return { frontmatter, tags };
}

function addFile(path: string, text: string) {
	const f = new TFile();
	f.path = path;
	f.name = path.split("/").pop()!;
	f.extension = f.name.includes(".") ? f.name.split(".").pop()! : "";
	f.basename = f.name.replace(/\.[^.]+$/, "");
	f.parent = folderFor(path);
	f.parent.children.push(f);
	f.stat = { ctime: 0, mtime: Date.now() - Math.random() * 9e8, size: text.length };
	files.set(path, f);
	contents.set(path, text);
	if (f.extension === "md") caches.set(path, parseNote(text));
	return f;
}

for (const [path, text] of Object.entries(VAULT_FILES)) addFile(path, text);

const metadataCache: any = new Events();
metadataCache.getFileCache = (f: TFile) => caches.get(f.path) ?? null;
metadataCache.fileToLinktext = (f: TFile) => (f.extension === "md" ? f.basename : f.name);
metadataCache.getFirstLinkpathDest = (link: string) => {
	const l = link.replace(/\.md$/, "").toLowerCase();
	for (const f of files.values()) {
		const noExt = f.path.replace(/\.md$/, "").toLowerCase();
		if (noExt === l || f.path.toLowerCase() === l) return f;
	}
	for (const f of files.values()) if (f.basename.toLowerCase() === l || f.name.toLowerCase() === l) return f;
	return null;
};

const vault: any = new Events();
vault.getMarkdownFiles = () => [...files.values()].filter((f) => f.extension === "md");
vault.getFiles = () => [...files.values()];
vault.getAllLoadedFiles = () => [...folders.values(), ...files.values()];
vault.getAbstractFileByPath = (p: string) => files.get(p) ?? folders.get(p) ?? null;
vault.read = async (f: TFile) => contents.get(f.path) ?? "";
vault.cachedRead = vault.read;
vault.getName = () => (window as any).VAULT_NAME ?? "Vault";
vault.getResourcePath = (f: TFile) => "vault/" + f.path.split("/").map(encodeURIComponent).join("/");
(vault as unknown as { readBinary: (f: TFile) => Promise<ArrayBuffer> }).readBinary = (f: TFile) => fetch(vault.getResourcePath(f)).then((r) => r.arrayBuffer());
vault.createFolder = async (p: string) => folderFor(p + "/x");
// Exports: keep the bytes so tests can inspect them (window.__exports).
vault.createBinary = async (p: string, data: ArrayBuffer) => {
	((window as any).__exports ??= []).push({ path: p, size: data.byteLength, data });
	return addFile(p, "");
};
vault.modify = async (f: TFile, text: string) => {
	contents.set(f.path, text);
};
vault.create = async (p: string, text: string) => {
	const f = addFile(p, text);
	metadataCache.trigger("changed", f);
	return f;
};

function writeFrontmatter(f: TFile, fm: any) {
	const text = contents.get(f.path) ?? "";
	const body = text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
	const out = `---\n${YAML.stringify(fm)}---\n${body}`;
	contents.set(f.path, out);
	caches.set(f.path, parseNote(out));
	metadataCache.trigger("changed", f);
}

// ---- App -------------------------------------------------------------------------------------------

const main = document.getElementById("main")!;
// ?mobile=1: Obsidian marks phones and tablets with this class.
if (/[?&]mobile=1/.test(location.search)) {
	document.body.classList.add("is-mobile");
	// Obsidian's floating bottom bar, which views run under; its button slides the harness's nav in.
	const bar = document.body.createDiv("mobile-navbar");
	bar.createEl("button", { text: "☰ Nav" }).addEventListener("click", () => document.body.classList.toggle("nav-open"));
	document.getElementById("nav")!.addEventListener("click", (evt) => (evt.target as HTMLElement).closest(".nav-btn") && document.body.classList.remove("nav-open"));
}
const workspace: any = new Events();
const app: any = {
	vault,
	metadataCache,
	workspace,
	fileManager: {
		processFrontMatter: async (f: TFile, fn: (fm: any) => void) => {
			const fm = { ...(caches.get(f.path)?.frontmatter ?? {}) };
			fn(fm);
			writeFrontmatter(f, fm);
		},
	},
	plugins: { plugins: {}, enabledPlugins: new Set() },
	_views: {} as Record<string, any>,
	_codeblocks: {} as Record<string, any>,
	_commands: [] as any[],
	commands: {
		executeCommandById(id: string) {
			const c = app._commands.find((x: any) => id.endsWith(":" + x.id));
			if (!c?.callback) return false;
			c.callback();
			return true;
		},
	},
	_ribbon: [] as any[],
	_pluginData: PLUGIN_DATA,
	_settingTab: null as any,
};
const leaf = new WorkspaceLeaf(app, main);
workspace.getLeaf = () => leaf;
workspace.getLeavesOfType = (t: string) => (leaf.view?.getViewType() === t ? [leaf] : []);
workspace.getMostRecentLeaf = () => leaf;
workspace.getActiveViewOfType = (type: any) => (leaf.view instanceof type ? leaf.view : null);
// One pane in the harness: the inspector opens in it like any other view.
workspace.getRightLeaf = () => leaf;
workspace.revealLeaf = async () => {};
workspace.setActiveLeaf = () => {};
workspace.onLayoutReady = (cb: () => void) => cb();
workspace.getActiveFile = () => workspace._active ?? null;
workspace.requestSaveLayout = () => {};

const plugin = new ChroniclePlugin(app, { id: "UniverseView", version: "dev" });
(window as any).chronicle = plugin;
(window as any).QuickAddModal = QuickAddModal;
(window as any).TidyModal = TidyModal;
(window as any).tidyPlan = tidyPlan;
(window as any).chronicleTrace = trace;
(window as any).chronicleRelations = relations;
(window as any).chronicleWebsite = website;
(window as any).app = app;
(window as any).chronicleExport = { viewToSvg };

// ---- Shell ----------------------------------------------------------------------------------------

const nav = document.getElementById("nav")!;
function navButton(label: string, iconName: string, onClick: () => void) {
	const b = nav.createEl("button", { cls: "nav-btn" });
	const ic = b.createSpan();
	setIcon(ic, iconName);
	b.createSpan({ text: label });
	b.addEventListener("click", () => {
		nav.querySelectorAll(".nav-btn").forEach((x) => x.removeClass("is-active"));
		b.addClass("is-active");
		onClick();
	});
	return b;
}

async function showView(type: string, state?: any) {
	await leaf.setViewState({ type, state });
	location.hash = type + (state ? "?" + encodeURIComponent(JSON.stringify(state)) : "");
}

function showEmbeds(notePath: string) {
	leaf.view?.unload();
	leaf.view = null;
	main.empty();
	const page = main.createDiv("markdown-preview-view");
	const text = contents.get(notePath) ?? "";
	const blocks = [...text.matchAll(/```(chronicle-[a-z]+)\n([\s\S]*?)```/g)];
	page.createEl("h1", { text: notePath.split("/").pop()!.replace(/\.md$/, "") });
	for (const [, name, source] of blocks) {
		page.createEl("h4", { text: name, cls: "embed-label" });
		// Like Obsidian, render the block while it is still detached, then attach it.
		const slot = page.createDiv();
		const host = document.createElement("div");
		host.className = "block-language-" + name;
		const children: any[] = [];
		const ctx = { sourcePath: notePath, addChild: (c: any) => (children.push(c), c.load()) };
		app._codeblocks[name](source, host, ctx);
		window.setTimeout(() => slot.replaceWith(host), 0);
	}
	location.hash = "embeds:" + notePath;
}

function boot() {
	plugin.onload().then(() => {
		navButton("UniverseView", "universe-view", () => void showView("chronicle-hub"));
		navButton("Overview", "library", () => void showView("chronicle-overview"));
		navButton("Board", "layout-dashboard", () => void showView("chronicle-dashboard"));
		navButton("Timeline", "calendar-range", () => void showView("chronicle-timeline"));
		navButton("Family tree", "git-fork", () => void showView("chronicle-family", { options: { root: plugin.index.findByName("Henry VIII")?.key ?? plugin.index.all("person")[0]?.key, up: 2, down: 2, siblings: true } }));
		navButton("Connections", "waypoints", () => void showView("chronicle-network"));
		navButton("Culture lineage", "git-branch", () => void showView("chronicle-lineage"));
		navButton("Org chart", "network", () => void showView("chronicle-orgchart"));
		navButton("Dashboard", "panels-top-left", () => void showView("chronicle-explorer"));
		navButton("Map", "map", () => void showView("chronicle-map"));
		navButton("Embeds: Tudors", "file-text", () => showEmbeds("Tudors/Tudors overview.md"));
		navButton("Embeds: Vael", "file-text", () => showEmbeds("Vael/Vael overview.md"));
		navButton("New note…", "plus", () => plugin.createEntityPrompt({ type: "event" }));
		navButton("Check data", "shield-check", () => app._commands.find((c: any) => c.id === "check-data").callback());
		navButton("Detect types…", "wand-2", () => app._commands.find((c: any) => c.id === "detect-types").callback());
		navButton("Settings", "settings", () => {
			leaf.view?.unload();
			leaf.view = null;
			main.empty();
			const tab = app._settingTab;
			main.appendChild(tab.containerEl);
			tab.display();
		});
		const theme = nav.createEl("button", { cls: "nav-btn theme-toggle", text: "Toggle dark mode" });
		theme.addEventListener("click", () => {
			document.body.classList.toggle("theme-dark");
			document.body.classList.toggle("theme-light");
		});
		const pick = nav.createEl("button", { cls: "nav-btn theme-toggle", text: "UniverseView theme…" });
		pick.addEventListener("click", (evt) => plugin.showThemeMenu(evt));
		const h = decodeURIComponent(location.hash.slice(1));
		if (h.startsWith("embeds:")) showEmbeds(h.slice(7));
		else if (h.startsWith("UniverseView-")) {
			const [type, state] = h.split("?");
			void showView(type, state ? JSON.parse(state) : undefined);
		} else void showView("chronicle-timeline");
		(window as any).issues = () => validate(plugin.index);
	});
}
boot();
