/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * A small stand-in for the Obsidian API, just enough to run UniverseView's real views,
 * modals and code blocks in a browser for visual testing. Not shipped with the plugin.
 */
import YAML from "yaml";
import { createElement, icons } from "lucide";

// ---- DOM helpers Obsidian adds to elements ------------------------------------------------------

const N = Node.prototype as any;
const E = Element.prototype as any;
const split = (c: string[]) => c.flatMap((x) => String(x).split(/\s+/)).filter(Boolean);
N.empty = function () {
	while (this.firstChild) this.removeChild(this.firstChild);
};
N.detach = function () {
	this.parentNode?.removeChild(this);
};
E.addClass = function (...c: string[]) {
	this.classList.add(...split(c));
};
E.addClasses = function (c: string[]) {
	this.classList.add(...split(c));
};
E.removeClass = function (...c: string[]) {
	this.classList.remove(...split(c));
};
E.removeClasses = function (c: string[]) {
	this.classList.remove(...split(c));
};
E.toggleClass = function (c: string, v: boolean) {
	this.classList.toggle(c, v);
};
E.hasClass = function (c: string) {
	return this.classList.contains(c);
};
N.setText = function (t: string) {
	this.textContent = t;
};
E.setAttr = function (k: string, v: string) {
	this.setAttribute(k, v);
};
// More of Obsidian's element helpers, as the plugin uses them in place of setting styles directly.
N.instanceOf = function (type: abstract new (...args: never[]) => unknown) {
	return this instanceof type;
};
E.hide = function () {
	this.style.display = "none";
};
E.show = function () {
	this.style.display = "";
};
E.toggle = function (show: boolean) {
	this.style.display = show ? "" : "none";
};
E.setCssStyles = function (styles: Record<string, string>) {
	Object.assign(this.style, styles);
};
E.setCssProps = function (props: Record<string, string>) {
	for (const [k, v] of Object.entries(props)) this.style.setProperty(k, v);
};
function applyOpts(el: HTMLElement, o: any) {
	if (!o) return;
	if (typeof o === "string") return el.addClass(o);
	if (o.cls) el.addClass(...(Array.isArray(o.cls) ? o.cls : [o.cls]));
	if (o.text !== undefined) el.textContent = String(o.text);
	if (o.title) el.title = o.title;
	if (o.type) el.setAttribute("type", o.type);
	if (o.placeholder) el.setAttribute("placeholder", o.placeholder);
	if (o.value !== undefined) (el as any).value = o.value;
	for (const [k, v] of Object.entries(o.attr ?? {})) el.setAttribute(k, String(v));
}
N.createEl = function (tag: string, o?: any, cb?: (el: HTMLElement) => void) {
	const el = document.createElement(tag);
	applyOpts(el, o);
	this.appendChild(el);
	cb?.(el);
	return el;
};
N.createDiv = function (o?: any, cb?: any) {
	return this.createEl("div", o, cb);
};
N.createSpan = function (o?: any, cb?: any) {
	return this.createEl("span", o, cb);
};

// ---- Utilities -------------------------------------------------------------------------------------

export function setIcon(el: HTMLElement, name: string) {
	const pascal = name.replace(/(^|-)([a-z0-9])/g, (_m, _d, c: string) => c.toUpperCase());
	const node = (icons as any)[pascal];
	el.querySelectorAll("svg").forEach((s) => s.remove());
	if (!node) return;
	const svg = createElement(node);
	svg.setAttribute("class", "svg-icon");
	svg.setAttribute("width", "16");
	svg.setAttribute("height", "16");
	el.appendChild(svg);
}

export function debounce(fn: (...a: any[]) => any, ms = 0, reset = false) {
	let t: number | undefined;
	const d: any = (...args: any[]) => {
		if (t !== undefined && !reset) return d;
		window.clearTimeout(t);
		t = window.setTimeout(() => {
			t = undefined;
			fn(...args);
		}, ms);
		return d;
	};
	d.cancel = () => window.clearTimeout(t);
	d.run = () => fn();
	return d;
}

export function normalizePath(p: string) {
	return p.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\/|\/$/g, "") || "/";
}
export const parseYaml = (s: string) => YAML.parse(s);
export const stringifyYaml = (o: unknown) => YAML.stringify(o);

export function prepareFuzzySearch(q: string) {
	const query = q.toLowerCase();
	return (text: string) => {
		const t = text.toLowerCase();
		let i = 0;
		let score = 0;
		for (const ch of t) {
			if (ch === query[i]) {
				i++;
				score++;
			}
		}
		return i === query.length ? { score: score - t.length * 0.01 + (t.startsWith(query) ? 5 : 0), matches: [] } : null;
	};
}

export function getAllTags(cache: any): string[] {
	const out: string[] = [];
	const fmTags = cache?.frontmatter?.tags;
	for (const t of Array.isArray(fmTags) ? fmTags : fmTags ? [fmTags] : []) out.push("#" + String(t).replace(/^#/, ""));
	for (const t of cache?.tags ?? []) out.push(t.tag);
	return out;
}

export const Keymap = {
	isModEvent(evt?: MouseEvent | KeyboardEvent) {
		return evt && (evt.ctrlKey || evt.metaKey) ? "tab" : false;
	},
};

/** Obsidian's request helper, played by fetch. */
export async function requestUrl(o: { url: string }): Promise<{ status: number; arrayBuffer: ArrayBuffer; headers: Record<string, string> }> {
	const r = await fetch(o.url);
	return { status: r.status, arrayBuffer: await r.arrayBuffer(), headers: { "content-type": r.headers.get("content-type") ?? "" } };
}

// ?mobile=1 plays a phone: no status bar (the worst case: Obsidian gives nothing back for one).
const MOBILE = typeof location !== "undefined" && /[?&]mobile=1/.test(location.search);
export const Platform = { isMobile: MOBILE, isDesktop: !MOBILE, isMacOS: false };

// ---- Events / Component ----------------------------------------------------------------------------

export class Events {
	private _ev: Record<string, { fn: (...a: any[]) => any; ctx?: any }[]> = {};
	on(name: string, fn: (...a: any[]) => any, ctx?: any) {
		(this._ev[name] ??= []).push({ fn, ctx });
		return { e: this, name, fn };
	}
	off(name: string, fn: (...a: any[]) => any) {
		this._ev[name] = (this._ev[name] ?? []).filter((x) => x.fn !== fn);
	}
	offref(ref: any) {
		ref?.e?.off(ref.name, ref.fn);
	}
	trigger(name: string, ...args: any[]) {
		for (const h of [...(this._ev[name] ?? [])]) h.fn.apply(h.ctx, args);
	}
}

export class Component {
	private _cleanups: (() => void)[] = [];
	private _children: Component[] = [];
	_loaded = false;
	load() {
		if (this._loaded) return;
		this._loaded = true;
		this.onload();
	}
	onload() {}
	unload() {
		this._children.forEach((c) => c.unload());
		this._cleanups.forEach((f) => f());
		this._cleanups = [];
		this._loaded = false;
		this.onunload();
	}
	onunload() {}
	addChild<T extends Component>(c: T): T {
		this._children.push(c);
		if (this._loaded) c.load();
		return c;
	}
	register(fn: () => void) {
		this._cleanups.push(fn);
	}
	registerEvent(ref: any) {
		this._cleanups.push(() => ref?.e?.offref?.(ref) ?? ref?.e?.off?.(ref.name, ref.fn));
	}
	registerDomEvent(el: any, type: string, cb: any, opts?: any) {
		el.addEventListener(type, cb, opts);
		this._cleanups.push(() => el.removeEventListener(type, cb, opts));
	}
	registerInterval(id: number) {
		this._cleanups.push(() => window.clearInterval(id));
		return id;
	}
}

// ---- Vault model -------------------------------------------------------------------------------------

export class TAbstractFile {
	vault: any;
	path = "";
	name = "";
	parent: TFolder | null = null;
}
export class TFolder extends TAbstractFile {
	children: TAbstractFile[] = [];
	isRoot() {
		return this.path === "/";
	}
}
export class TFile extends TAbstractFile {
	basename = "";
	extension = "";
	stat = { ctime: 0, mtime: 0, size: 0 };
}

// ---- UI: notices, menus, modals, settings -------------------------------------------------------------

function toastHost() {
	let host = document.querySelector(".notice-container") as HTMLElement | null;
	if (!host) host = document.body.createDiv("notice-container");
	return host;
}
export class Notice {
	noticeEl: HTMLElement;
	constructor(message: string, timeout = 4000) {
		this.noticeEl = toastHost().createDiv({ cls: "notice", text: message });
		if (timeout) window.setTimeout(() => this.hide(), timeout);
	}
	setMessage(m: string) {
		this.noticeEl.setText(m);
		return this;
	}
	hide() {
		this.noticeEl.remove();
	}
}

class MenuItem {
	title = "";
	icon = "";
	cb?: (evt: MouseEvent) => void;
	setTitle(t: string) {
		this.title = t;
		return this;
	}
	setIcon(i: string) {
		this.icon = i;
		return this;
	}
	setDisabled() {
		return this;
	}
	setSection() {
		return this;
	}
	setChecked(v: boolean) {
		if (v) this.icon = "check";
		return this;
	}
	setWarning() {
		return this;
	}
	onClick(cb: (evt: MouseEvent) => void) {
		this.cb = cb;
		return this;
	}
}
export class Menu {
	private items: (MenuItem | "sep")[] = [];
	addItem(cb: (i: MenuItem) => void) {
		const i = new MenuItem();
		cb(i);
		this.items.push(i);
		return this;
	}
	addSeparator() {
		this.items.push("sep");
		return this;
	}
	showAtMouseEvent(evt: MouseEvent) {
		this.showAtPosition({ x: evt.clientX, y: evt.clientY });
	}
	showAtPosition(p: { x: number; y: number }) {
		document.querySelectorAll(".menu").forEach((m) => m.remove());
		const menu = document.body.createDiv("menu");
		menu.style.left = `${p.x}px`;
		menu.style.top = `${p.y}px`;
		for (const it of this.items) {
			if (it === "sep") {
				menu.createDiv("menu-separator");
				continue;
			}
			const row = menu.createDiv("menu-item");
			const ic = row.createDiv("menu-item-icon");
			setIcon(ic, it.icon);
			row.createDiv({ cls: "menu-item-title", text: it.title });
			row.addEventListener("click", (e) => {
				menu.remove();
				it.cb?.(e);
			});
		}
		window.setTimeout(() => document.addEventListener("click", () => menu.remove(), { once: true }), 0);
	}
}

export class Scope {
	keys: { mods: string[]; key: string; fn: () => any }[] = [];
	register(mods: string[], key: string, fn: () => any) {
		this.keys.push({ mods, key, fn });
	}
}

export class Modal {
	app: any;
	containerEl: HTMLElement;
	modalEl: HTMLElement;
	titleEl: HTMLElement;
	contentEl: HTMLElement;
	scope = new Scope();
	constructor(app: any) {
		this.app = app;
		this.containerEl = document.createElement("div");
		this.containerEl.className = "modal-container";
		this.containerEl.createDiv("modal-bg").addEventListener("click", () => this.close());
		this.modalEl = this.containerEl.createDiv("modal");
		const close = this.modalEl.createDiv("modal-close-button");
		close.addEventListener("click", () => this.close());
		this.titleEl = this.modalEl.createDiv("modal-title");
		this.contentEl = this.modalEl.createDiv("modal-content");
		this.containerEl.addEventListener("keydown", (e) => {
			if (e.key === "Escape") this.close();
			for (const k of this.scope.keys) if (e.key === k.key && (!k.mods.includes("Mod") || e.ctrlKey || e.metaKey)) k.fn();
		});
	}
	open() {
		document.body.appendChild(this.containerEl);
		this.onOpen();
	}
	close() {
		this.containerEl.remove();
		this.onClose();
	}
	onOpen() {}
	onClose() {}
}

abstract class BaseSuggestModal<T> extends Modal {
	inputEl: HTMLInputElement;
	resultContainerEl: HTMLElement;
	constructor(app: any) {
		super(app);
		this.modalEl.addClass("prompt");
		this.inputEl = this.modalEl.createEl("input", { cls: "prompt-input", attr: { type: "text" } }) as HTMLInputElement;
		this.resultContainerEl = this.modalEl.createDiv("prompt-results");
		this.inputEl.addEventListener("input", () => this.renderList());
	}
	setPlaceholder(p: string) {
		this.inputEl.placeholder = p;
	}
	onOpen() {
		this.renderList();
		this.inputEl.focus();
	}
	abstract items(q: string): { value: T; render: (el: HTMLElement) => void }[];
	abstract choose(v: T, evt: MouseEvent): void;
	private renderList() {
		this.resultContainerEl.empty();
		for (const it of this.items(this.inputEl.value).slice(0, 40)) {
			const row = this.resultContainerEl.createDiv("suggestion-item");
			it.render(row);
			row.addEventListener("click", (e) => {
				this.close();
				this.choose(it.value, e);
			});
		}
	}
}

export abstract class SuggestModal<T> extends BaseSuggestModal<T> {
	abstract getSuggestions(q: string): T[];
	abstract renderSuggestion(v: T, el: HTMLElement): void;
	abstract onChooseSuggestion(v: T, evt: MouseEvent): void;
	items(q: string) {
		return this.getSuggestions(q).map((v) => ({ value: v, render: (el: HTMLElement) => this.renderSuggestion(v, el) }));
	}
	choose(v: T, evt: MouseEvent) {
		this.onChooseSuggestion(v, evt);
	}
}

export abstract class FuzzySuggestModal<T> extends BaseSuggestModal<T> {
	abstract getItems(): T[];
	abstract getItemText(v: T): string;
	abstract onChooseItem(v: T, evt: MouseEvent): void;
	renderSuggestion(m: { item: T }, el: HTMLElement) {
		el.setText(this.getItemText(m.item));
	}
	items(q: string) {
		const f = prepareFuzzySearch(q);
		return this.getItems()
			.map((v) => ({ v, m: q ? f(this.getItemText(v)) : { score: 0 } }))
			.filter((x) => x.m)
			.sort((a, b) => b.m!.score - a.m!.score)
			.map((x) => ({ value: x.v, render: (el: HTMLElement) => this.renderSuggestion({ item: x.v }, el) }));
	}
	choose(v: T, evt: MouseEvent) {
		this.onChooseItem(v, evt);
	}
}

export abstract class AbstractInputSuggest<T> {
	private box: HTMLElement | null = null;
	constructor(public app: any, private inputEl: HTMLInputElement) {
		inputEl.addEventListener("input", () => this.show());
		inputEl.addEventListener("focus", () => this.show());
		inputEl.addEventListener("blur", () => window.setTimeout(() => this.close(), 150));
	}
	abstract getSuggestions(q: string): T[] | Promise<T[]>;
	abstract renderSuggestion(v: T, el: HTMLElement): void;
	selectSuggestion(_v: T, _evt: MouseEvent | KeyboardEvent) {}
	setValue(v: string) {
		this.inputEl.value = v;
	}
	async show() {
		const list = await this.getSuggestions(this.inputEl.value);
		this.close();
		if (!list.length) return;
		const r = this.inputEl.getBoundingClientRect();
		const box = document.body.createDiv("suggestion-container");
		box.style.left = `${r.left}px`;
		box.style.top = `${r.bottom + 4}px`;
		box.style.minWidth = `${Math.max(240, r.width)}px`;
		for (const v of list.slice(0, 30)) {
			const row = box.createDiv("suggestion-item");
			this.renderSuggestion(v, row);
			row.addEventListener("mousedown", (e) => {
				e.preventDefault();
				this.selectSuggestion(v, e);
			});
		}
		this.box = box;
	}
	close() {
		this.box?.remove();
		this.box = null;
	}
}

class ValueComponent<V> {
	protected cb?: (v: V) => any;
	onChange(cb: (v: V) => any) {
		this.cb = cb;
		return this;
	}
}
class TextComponent extends ValueComponent<string> {
	inputEl: HTMLInputElement;
	constructor(parent: HTMLElement, area = false) {
		super();
		this.inputEl = parent.createEl(area ? "textarea" : "input", area ? {} : { attr: { type: "text" } }) as HTMLInputElement;
		this.inputEl.addEventListener("input", () => this.cb?.(this.inputEl.value));
	}
	setValue(v: string) {
		this.inputEl.value = v;
		return this;
	}
	getValue() {
		return this.inputEl.value;
	}
	setPlaceholder(p: string) {
		this.inputEl.placeholder = p;
		return this;
	}
}
class ToggleComponent extends ValueComponent<boolean> {
	toggleEl: HTMLElement;
	private v = false;
	constructor(parent: HTMLElement) {
		super();
		this.toggleEl = parent.createDiv("checkbox-container");
		this.toggleEl.addEventListener("click", () => {
			this.setValue(!this.v);
			this.cb?.(this.v);
		});
	}
	setValue(v: boolean) {
		this.v = v;
		this.toggleEl.toggleClass("is-enabled", v);
		return this;
	}
	setTooltip(t: string) {
		this.toggleEl.title = t;
		return this;
	}
}
class DropdownComponent extends ValueComponent<string> {
	selectEl: HTMLSelectElement;
	constructor(parent: HTMLElement) {
		super();
		this.selectEl = parent.createEl("select", "dropdown") as HTMLSelectElement;
		this.selectEl.addEventListener("change", () => this.cb?.(this.selectEl.value));
	}
	addOption(v: string, t: string) {
		const o = this.selectEl.createEl("option", { text: t }) as HTMLOptionElement;
		o.value = v;
		return this;
	}
	addOptions(o: Record<string, string>) {
		for (const [k, v] of Object.entries(o)) this.addOption(k, v);
		return this;
	}
	setValue(v: string) {
		this.selectEl.value = v;
		return this;
	}
}
class SliderComponent extends ValueComponent<number> {
	sliderEl: HTMLInputElement;
	constructor(parent: HTMLElement) {
		super();
		this.sliderEl = parent.createEl("input", { cls: "slider", attr: { type: "range" } }) as HTMLInputElement;
		this.sliderEl.addEventListener("input", () => this.cb?.(+this.sliderEl.value));
	}
	setLimits(a: number, b: number, s: number) {
		Object.assign(this.sliderEl, { min: a, max: b, step: s });
		return this;
	}
	setValue(v: number) {
		this.sliderEl.value = String(v);
		return this;
	}
	setDynamicTooltip() {
		return this;
	}
}
class ColorComponent extends ValueComponent<string> {
	colorPickerEl: HTMLInputElement;
	constructor(parent: HTMLElement) {
		super();
		this.colorPickerEl = parent.createEl("input", { attr: { type: "color" } }) as HTMLInputElement;
		this.colorPickerEl.addEventListener("input", () => this.cb?.(this.colorPickerEl.value));
	}
	setValue(v: string) {
		this.colorPickerEl.value = v;
		return this;
	}
}
class ButtonComponent {
	buttonEl: HTMLButtonElement;
	constructor(parent: HTMLElement, extra = false) {
		this.buttonEl = parent.createEl("button", extra ? "clickable-icon extra-setting-button" : "") as HTMLButtonElement;
	}
	setButtonText(t: string) {
		this.buttonEl.setText(t);
		return this;
	}
	setCta() {
		this.buttonEl.addClass("mod-cta");
		return this;
	}
	setIcon(i: string) {
		setIcon(this.buttonEl, i);
		return this;
	}
	setTooltip(t: string) {
		this.buttonEl.setAttribute("aria-label", t);
		return this;
	}
	onClick(cb: () => any) {
		this.buttonEl.addEventListener("click", cb);
		return this;
	}
}

export class Setting {
	settingEl: HTMLElement;
	infoEl: HTMLElement;
	nameEl: HTMLElement;
	descEl: HTMLElement;
	controlEl: HTMLElement;
	constructor(parent: HTMLElement) {
		this.settingEl = parent.createDiv("setting-item");
		this.infoEl = this.settingEl.createDiv("setting-item-info");
		this.nameEl = this.infoEl.createDiv("setting-item-name");
		this.descEl = this.infoEl.createDiv("setting-item-description");
		this.controlEl = this.settingEl.createDiv("setting-item-control");
	}
	setName(n: string) {
		this.nameEl.setText(n);
		return this;
	}
	setDesc(d: string) {
		this.descEl.prepend(document.createTextNode(d));
		return this;
	}
	setHeading() {
		this.settingEl.addClass("setting-item-heading");
		return this;
	}
	setClass(c: string) {
		this.settingEl.addClass(c);
		return this;
	}
	addText(cb: (c: TextComponent) => any) {
		cb(new TextComponent(this.controlEl));
		return this;
	}
	addTextArea(cb: (c: TextComponent) => any) {
		cb(new TextComponent(this.controlEl, true));
		return this;
	}
	addToggle(cb: (c: ToggleComponent) => any) {
		cb(new ToggleComponent(this.controlEl));
		return this;
	}
	addDropdown(cb: (c: DropdownComponent) => any) {
		cb(new DropdownComponent(this.controlEl));
		return this;
	}
	addSlider(cb: (c: SliderComponent) => any) {
		cb(new SliderComponent(this.controlEl));
		return this;
	}
	addColorPicker(cb: (c: ColorComponent) => any) {
		cb(new ColorComponent(this.controlEl));
		return this;
	}
	addButton(cb: (c: ButtonComponent) => any) {
		cb(new ButtonComponent(this.controlEl));
		return this;
	}
	addExtraButton(cb: (c: ButtonComponent) => any) {
		cb(new ButtonComponent(this.controlEl, true));
		return this;
	}
}

export class PluginSettingTab {
	containerEl = document.createElement("div");
	constructor(public app: any, public plugin: any) {
		this.containerEl.className = "vertical-tab-content";
	}
	display() {}
}

// ---- Workspace -------------------------------------------------------------------------------------

export class View extends Component {
	app: any;
	containerEl: HTMLElement;
	constructor(public leaf: WorkspaceLeaf) {
		super();
		this.app = leaf.app;
		this.containerEl = document.createElement("div");
		this.containerEl.className = "workspace-leaf-content";
	}
	getState() {
		return {};
	}
	async setState(_s: unknown, _r: unknown) {}
	getViewType() {
		return "";
	}
	getDisplayText() {
		return "";
	}
	getIcon() {
		return "";
	}
}
export class ItemView extends View {
	contentEl: HTMLElement;
	hoverPopover: unknown = null;
	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
		this.containerEl.createDiv("view-header");
		this.contentEl = this.containerEl.createDiv("view-content");
	}
	async onOpen() {}
	async onClose() {}
}

export class WorkspaceLeaf {
	view: any = null;
	constructor(public app: any, public host: HTMLElement) {}
	async setViewState(s: { type: string; state?: any }) {
		const create = this.app._views[s.type];
		if (!this.view || this.view.getViewType() !== s.type) {
			if (this.view) {
				await this.view.onClose?.();
				this.view.unload();
			}
			this.host.empty();
			this.view = create(this);
			this.host.appendChild(this.view.containerEl);
			this.view.load();
			await this.view.onOpen();
		}
		if (s.state) await this.view.setState(s.state, {});
		this.app.workspace.trigger("layout-change");
	}
	async openFile(file: TFile) {
		this.app.workspace._active = file;
		new Notice(`Opened note: ${file.path}`, 2500);
		this.app.workspace.trigger("file-open", file);
	}
	updateHeader() {}
}

export const MarkdownRenderer = {
	async render(_app: any, md: string, el: HTMLElement) {
		for (const block of md.split(/\n\s*\n/)) {
			const b = block.trim();
			if (!b) continue;
			const h = b.match(/^(#{1,6})\s+(.*)/);
			if (h) el.createEl(("h" + Math.min(6, h[1].length + 1)) as any, { text: h[2] });
			else el.createEl("p", { text: b.replace(/\[\[([^\]|]+\|)?([^\]]+)\]\]/g, "$2") });
		}
	},
};

export class MarkdownRenderChild extends Component {
	constructor(public containerEl: HTMLElement) {
		super();
	}
}

export class Plugin extends Component {
	constructor(public app: any, public manifest: any) {
		super();
	}
	async loadData() {
		return this.app._pluginData;
	}
	async saveData(d: any) {
		this.app._pluginData = d;
	}
	registerView(type: string, creator: (leaf: WorkspaceLeaf) => any) {
		this.app._views[type] = creator;
	}
	registerHoverLinkSource() {}
	registerMarkdownCodeBlockProcessor(name: string, fn: any) {
		this.app._codeblocks[name] = fn;
	}
	registerMarkdownPostProcessor(fn: any) {
		(this.app._postProcessors ??= []).push(fn);
	}
	registerObsidianProtocolHandler(action: string, fn: any) {
		(this.app._protocol ??= {})[action] = fn;
	}
	addStatusBarItem(): HTMLElement {
		if (MOBILE) return undefined as unknown as HTMLElement;
		let bar = document.querySelector(".status-bar") as HTMLElement | null;
		if (!bar) {
			bar = document.createElement("div");
			bar.className = "status-bar";
			bar.style.cssText = "position:fixed;right:8px;bottom:4px;display:flex;gap:8px;font-size:12px;z-index:50";
			document.body.appendChild(bar);
		}
		const item = document.createElement("div");
		item.className = "status-bar-item";
		bar.appendChild(item);
		return item;
	}
	addSettingTab(tab: any) {
		this.app._settingTab = tab;
	}
	addRibbonIcon(icon: string, title: string, cb: (e: MouseEvent) => void) {
		this.app._ribbon.push({ icon, title, cb });
		return document.createElement("div");
	}
	addCommand(c: any) {
		this.app._commands.push(c);
		return c;
	}
}

export type App = any;
export type Editor = any;
export type MarkdownPostProcessorContext = any;
export type ViewStateResult = any;
export type EventRef = any;
export type FrontMatterCache = any;
export type HoverParent = any;

/** Icon names Obsidian knows (a handful, for the icon picker in the harness). */
export function getIconIds(): string[] {
	return ["lucide-castle", "lucide-crown", "lucide-map-pin", "lucide-flag", "lucide-swords", "lucide-tent", "lucide-church", "lucide-anchor"];
}
