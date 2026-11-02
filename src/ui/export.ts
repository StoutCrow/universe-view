import { Menu, Notice, TFile, normalizePath, requestUrl } from "obsidian";
import { clickNotice } from "../render/common";
import type ChroniclePlugin from "../main";

const SVG_NS = "http://www.w3.org/2000/svg";
const XHTML_NS = "http://www.w3.org/1999/xhtml";
const FOLDER = "UniverseView exports";

/** What decides how an SVG shape looks; its geometry stays in its attributes. */
const SVG_PROPS = [
	"fill", "fill-opacity", "fill-rule", "stroke", "stroke-width", "stroke-opacity", "stroke-dasharray", "stroke-dashoffset", "stroke-linecap", "stroke-linejoin",
	"opacity", "display", "visibility", "color", "font-family", "font-size", "font-weight", "font-style", "letter-spacing", "text-anchor", "dominant-baseline",
	"paint-order", "text-decoration", "mix-blend-mode",
];

/**
 * Copies computed styles onto the clone, so the picture looks the same outside Obsidian's CSS:
 * the visual properties for SVG shapes, everything for HTML (cards inside a foreignObject).
 */
function inlineStyles(src: Element, dst: Element, inHtml = false) {
	const cs = getComputedStyle(src);
	const html = inHtml || !(src.instanceOf(SVGElement));
	let text = "";
	if (html) {
		for (let i = 0; i < cs.length; i++) {
			const p = cs[i];
			text += `${p}:${cs.getPropertyValue(p)};`;
		}
	} else {
		for (const p of SVG_PROPS) {
			const v = cs.getPropertyValue(p);
			if (v) text += `${p}:${v};`;
		}
	}
	// Entrance animations would otherwise freeze at their first (invisible) frame.
	dst.setAttribute("style", text + "animation:none;transition:none;");
	const a = src.children;
	const b = dst.children;
	const childHtml = html || src.tagName.toLowerCase() === "foreignobject";
	for (let i = 0; i < a.length && i < b.length; i++) inlineStyles(a[i], b[i], childHtml);
}

/** Pictures already read, by address: a time-lapse embeds the same map picture in every frame. */
const dataUrls = new Map<string, Promise<string | null>>();

function toDataUrl(url: string): Promise<string | null> {
	if (url.startsWith("data:")) return Promise.resolve(url);
	let p = dataUrls.get(url);
	if (!p) {
		if (dataUrls.size > 24) dataUrls.delete(dataUrls.keys().next().value as string);
		dataUrls.set(url, (p = readDataUrl(url)));
		// A failed read is tried again next time.
		void p.then((d) => d === null && dataUrls.delete(url));
	}
	return p;
}

async function readDataUrl(url: string): Promise<string | null> {
	try {
		// Pictures from the web (the world map's tiles) through Obsidian's own requests; the vault's
		// own pictures are local resources, read directly.
		const blob = /^https?:\/\//.test(url)
			? await requestUrl({ url }).then((r) => new Blob([r.arrayBuffer], { type: r.headers["content-type"] ?? "image/png" }))
			: await (await fetch(url)).blob();
		return await new Promise((resolve) => {
			const r = new FileReader();
			r.onload = () => resolve(typeof r.result === "string" ? r.result : null);
			r.onerror = () => resolve(null);
			r.readAsDataURL(blob);
		});
	} catch {
		return null;
	}
}

/** Pictures inside an SVG image can't load other files, so they're embedded. */
async function embedImages(root: Element) {
	const jobs: Promise<void>[] = [];
	root.querySelectorAll("img").forEach((img) => {
		const src = img.getAttribute("src");
		if (!src) return;
		jobs.push(toDataUrl((img).src || src).then((d) => (d ? img.setAttribute("src", d) : img.remove())));
	});
	root.querySelectorAll("image").forEach((im) => {
		const href = im.getAttribute("href") ?? im.getAttribute("xlink:href");
		if (!href) return;
		jobs.push(toDataUrl(href).then((d) => (d ? im.setAttribute("href", d) : im.remove())));
	});
	await Promise.all(jobs);
}

/**
 * A stand-alone SVG of a view. Charts drawn in SVG (trees, graphs, the org chart) come out whole,
 * not just the part on screen; anything else is captured as it looks now.
 */
export async function viewToSvg(target: HTMLElement): Promise<{ svg: string; width: number; height: number }> {
	// Read styles with entrance animations finished (a half-faded card would export faded).
	target.addClass("chronicle-exporting");
	void target.offsetHeight;
	try {
		return await snapshot(target);
	} finally {
		target.removeClass("chronicle-exporting");
	}
}

async function snapshot(target: HTMLElement): Promise<{ svg: string; width: number; height: number }> {
	const bg = getComputedStyle(document.body).getPropertyValue("--background-primary").trim() || "#ffffff";
	const canvas = target.querySelector<SVGSVGElement>("svg.chronicle-canvas");
	const layer = canvas?.querySelector(":scope > g:not(defs)") as SVGGElement | null;
	if (canvas && layer && layer.getBBox().width > 0) {
		const box = layer.getBBox();
		const pad = 24;
		const clone = canvas.cloneNode(true) as SVGSVGElement;
		inlineStyles(canvas, clone);
		const cl = clone.querySelector(":scope > g:not(defs)");
		cl?.removeAttribute("transform");
		// Cards drawn as HTML over the SVG (on phones) go into the picture where their slots are.
		target.querySelectorAll<HTMLElement>(".uv-card-html").forEach((slot) => {
			const card = slot.firstElementChild;
			if (!card || !cl) return;
			const fo = document.createElementNS(SVG_NS, "foreignObject");
			for (const [k, v] of Object.entries({ x: parseFloat(slot.style.left), y: parseFloat(slot.style.top), width: parseFloat(slot.style.width), height: parseFloat(slot.style.height) })) fo.setAttribute(k, String(v));
			const copy = card.cloneNode(true) as HTMLElement;
			inlineStyles(card, copy, true);
			fo.appendChild(copy);
			cl.appendChild(fo);
		});
		const w = Math.ceil(box.width + pad * 2);
		const h = Math.ceil(box.height + pad * 2);
		clone.setAttribute("xmlns", SVG_NS);
		clone.setAttribute("viewBox", `${box.x - pad} ${box.y - pad} ${w} ${h}`);
		clone.setAttribute("width", String(w));
		clone.setAttribute("height", String(h));
		clone.style.background = bg;
		const rect = document.createElementNS(SVG_NS, "rect");
		for (const [k, v] of Object.entries({ x: box.x - pad, y: box.y - pad, width: w, height: h, fill: bg })) rect.setAttribute(k, String(v));
		clone.insertBefore(rect, clone.firstChild);
		clone.querySelectorAll("foreignObject > *").forEach((n) => n.setAttribute("xmlns", XHTML_NS));
		await embedImages(clone);
		return { svg: new XMLSerializer().serializeToString(clone), width: w, height: h };
	}
	// HTML views (timeline, map): a snapshot of what's on screen.
	const r = target.getBoundingClientRect();
	const w = Math.ceil(r.width);
	const h = Math.ceil(r.height);
	const clone = target.cloneNode(true) as HTMLElement;
	inlineStyles(target, clone);
	clone.setCssStyles({ margin: "0", position: "relative", inset: "auto" });
	clone.style.width = `${w}px`;
	clone.style.height = `${h}px`;
	clone.style.background = bg;
	clone.setAttribute("xmlns", XHTML_NS);
	await embedImages(clone);
	const svg = document.createElementNS(SVG_NS, "svg");
	svg.setAttribute("xmlns", SVG_NS);
	svg.setAttribute("width", String(w));
	svg.setAttribute("height", String(h));
	svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
	const fo = document.createElementNS(SVG_NS, "foreignObject");
	fo.setAttribute("width", "100%");
	fo.setAttribute("height", "100%");
	fo.appendChild(clone);
	svg.appendChild(fo);
	return { svg: new XMLSerializer().serializeToString(svg), width: w, height: h };
}

async function svgToPng(svg: string, width: number, height: number): Promise<Blob> {
	const scale = Math.min(2, 8000 / Math.max(width, height));
	const img = new Image();
	img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
	await img.decode();
	const c = createEl("canvas");
	c.width = Math.max(1, Math.round(width * scale));
	c.height = Math.max(1, Math.round(height * scale));
	const ctx = c.getContext("2d")!;
	ctx.scale(scale, scale);
	ctx.drawImage(img, 0, 0, width, height);
	return await new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("The picture couldn't be made."))), "image/png"));
}

async function saveToVault(plugin: ChroniclePlugin, name: string, ext: string, data: ArrayBuffer): Promise<TFile> {
	const { vault } = plugin.app;
	if (!vault.getAbstractFileByPath(FOLDER)) await vault.createFolder(FOLDER);
	const stamp = new Date().toISOString().slice(0, 16).replace("T", " ").replace(":", ".");
	const safe = name.replace(/[\\/:*?"<>|#^[\]]/g, "-");
	let path = normalizePath(`${FOLDER}/${safe} ${stamp}.${ext}`);
	for (let i = 2; vault.getAbstractFileByPath(path); i++) path = normalizePath(`${FOLDER}/${safe} ${stamp} ${i}.${ext}`);
	return vault.createBinary(path, data);
}

/**
 * A map dressed up for sharing: aged paper, a double border, a title cartouche and a compass rose
 * around the picture.
 */
export function decorateMap(inner: string, w: number, h: number, title: string): { svg: string; width: number; height: number } {
	const P = Math.round(Math.max(40, Math.min(w, h) * 0.06));
	const T = Math.round(P * 1.3);
	const W = w + 2 * P;
	const H = h + 2 * P + T;
	const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
	const body = inner.replace(/^<\?xml[^>]*>/, "").replace(/^<svg\b/, `<svg x="${P}" y="${P + T}"`);
	const r = Math.max(28, Math.min(w, h) * 0.07);
	const cx = W - P - r - 12;
	const cy = H - P - r - 12;
	const star = (len: number, wid: number, rot: number) => `<path transform="rotate(${rot} ${cx} ${cy})" d="M${cx},${cy - len} L${cx + wid},${cy} L${cx},${cy + len} L${cx - wid},${cy} Z"/>`;
	const fontSize = Math.round(T * 0.48);
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs><radialGradient id="parch" cx="50%" cy="45%" r="75%"><stop offset="0" stop-color="#f6ecd2"/><stop offset=".75" stop-color="#ead9b0"/><stop offset="1" stop-color="#cdb27c"/></radialGradient></defs>
<rect width="${W}" height="${H}" fill="url(#parch)"/>
<rect x="${P * 0.35}" y="${P * 0.35}" width="${W - P * 0.7}" height="${H - P * 0.7}" fill="none" stroke="#5a4126" stroke-width="3"/>
<rect x="${P * 0.35 + 7}" y="${P * 0.35 + 7}" width="${W - P * 0.7 - 14}" height="${H - P * 0.7 - 14}" fill="none" stroke="#5a4126" stroke-width="1"/>
<text x="${W / 2}" y="${P * 0.35 + T * 0.62 + 7}" text-anchor="middle" font-family="Georgia, 'Palatino Linotype', serif" font-size="${fontSize}" letter-spacing="${fontSize * 0.12}" fill="#3b2a18">${esc(title.toUpperCase())}</text>
<line x1="${W / 2 - fontSize * 4}" x2="${W / 2 + fontSize * 4}" y1="${P * 0.35 + T * 0.62 + 7 + fontSize * 0.45}" y2="${P * 0.35 + T * 0.62 + 7 + fontSize * 0.45}" stroke="#5a4126" stroke-width="1"/>
${body}
<rect x="${P}" y="${P + T}" width="${w}" height="${h}" fill="none" stroke="#5a4126" stroke-width="2"/>
<g fill="#5a4126" opacity=".9"><circle cx="${cx}" cy="${cy}" r="${r * 0.62}" fill="none" stroke="#5a4126" stroke-width="1.5"/>${star(r, r * 0.16, 45)}${star(r, r * 0.16, -45)}</g>
<g fill="#3b2a18">${star(r * 1.15, r * 0.2, 0)}${star(r * 1.15, r * 0.2, 90)}</g>
<text x="${cx}" y="${cy - r * 1.22}" text-anchor="middle" font-family="Georgia, serif" font-size="${Math.round(r * 0.45)}" font-weight="bold" fill="#3b2a18">N</text>
</svg>`;
	return { svg, width: W, height: H };
}

/** A band under the picture with a line of text (the map's date, say). */
export function withCaption(snap: { svg: string; width: number; height: number }, caption: string): { svg: string; width: number; height: number } {
	const bg = getComputedStyle(document.body).getPropertyValue("--background-primary").trim() || "#ffffff";
	const fg = getComputedStyle(document.body).getPropertyValue("--text-normal").trim() || "#222222";
	const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
	const band = 38;
	const body = snap.svg.replace(/^<\?xml[^>]*>/, "").replace(/^<svg\b/, `<svg x="0" y="0"`);
	const h = snap.height + band;
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${snap.width}" height="${h}" viewBox="0 0 ${snap.width} ${h}"><rect width="${snap.width}" height="${h}" fill="${bg}"/>${body}<text x="14" y="${snap.height + band / 2 + 6}" font-family="system-ui, 'Segoe UI', sans-serif" font-size="16" font-weight="600" fill="${fg}">${esc(caption)}</text></svg>`;
	return { svg, width: snap.width, height: h };
}

export async function exportView(plugin: ChroniclePlugin, target: HTMLElement, name: string, format: "png" | "svg" | "copy" | "decorated", caption?: string) {
	const notice = new Notice("Making the picture…", 0);
	try {
		let snap = await viewToSvg(target);
		const title = name.replace(/^Map:\s*/, "");
		if (caption && format !== "decorated") snap = withCaption(snap, `${title} · ${caption}`);
		const { svg, width, height } = format === "decorated" ? decorateMap(snap.svg, snap.width, snap.height, caption ? `${title} · ${caption}` : title) : snap;
		if (format === "svg") {
			const file = await saveToVault(plugin, name, "svg", new TextEncoder().encode(svg).buffer);
			done(plugin, file);
			return;
		}
		const png = await svgToPng(svg, width, height);
		if (format === "copy") {
			await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
			new Notice("Copied the picture. Paste it into a note or another app.");
			return;
		}
		done(plugin, await saveToVault(plugin, name, "png", await png.arrayBuffer()));
	} catch (err) {
		console.error("UniverseView export:", err);
		new Notice(`Couldn't export the picture: ${(err as Error).message ?? err}`);
	} finally {
		notice.hide();
	}
}

function done(plugin: ChroniclePlugin, file: TFile) {
	clickNotice(`Saved ${file.path}. Click to open it.`, 8000, () => void plugin.app.workspace.getLeaf(true).openFile(file));
}

export interface ExportExtras {
	/** A line under the picture, such as the date the map shows. */
	caption?: () => string | undefined;
	/** More entries for the menu (the map's time-lapse). */
	extra?: (menu: Menu) => void;
}

export function exportMenu(plugin: ChroniclePlugin, target: HTMLElement, name: string, evt: MouseEvent, extras: ExportExtras = {}) {
	const menu = new Menu();
	const cap = () => extras.caption?.();
	menu.addItem((i) => i.setTitle("Save as PNG image").setIcon("image").onClick(() => void exportView(plugin, target, name, "png", cap())));
	if (target.querySelector(".chronicle-map")) menu.addItem((i) => i.setTitle("Save as a decorated map (PNG)").setIcon("scroll").onClick(() => void exportView(plugin, target, name, "decorated", cap())));
	menu.addItem((i) => i.setTitle("Save as SVG (sharp at any size)").setIcon("file-code").onClick(() => void exportView(plugin, target, name, "svg", cap())));
	menu.addItem((i) => i.setTitle("Copy as image").setIcon("copy").onClick(() => void exportView(plugin, target, name, "copy", cap())));
	menu.addItem((i) => i.setTitle("Print or save as PDF…").setIcon("printer").onClick(() => void printView(target, name)));
	if (extras.extra) {
		menu.addSeparator();
		extras.extra(menu);
	}
	menu.showAtMouseEvent(evt);
}

/**
 * A time-lapse as a series of pictures: the view is moved to each date in turn and captured, each
 * frame captioned with its date, plus a contact sheet of every frame on one page. All go into one
 * folder under the exports folder. Returns the contact sheet.
 */
export async function exportTimelapse(plugin: ChroniclePlugin, target: HTMLElement, name: string, frames: { label: string; go: () => Promise<void> }[], restore: () => Promise<void>): Promise<TFile | undefined> {
	const { vault } = plugin.app;
	const stamp = new Date().toISOString().slice(0, 16).replace("T", " ").replace(":", ".");
	const safe = name.replace(/^Map:\s*/, "").replace(/[\\/:*?"<>|#^[\]]/g, "-");
	const folder = normalizePath(`${FOLDER}/${safe} time-lapse ${stamp}`);
	if (!vault.getAbstractFileByPath(FOLDER)) await vault.createFolder(FOLDER);
	if (!vault.getAbstractFileByPath(folder)) await vault.createFolder(folder);
	const notice = new Notice("", 0);
	const thumbs: { img: HTMLImageElement; label: string }[] = [];
	try {
		for (let i = 0; i < frames.length; i++) {
			notice.setMessage(`Time-lapse: frame ${i + 1} of ${frames.length} (${frames[i].label})…`);
			await frames[i].go();
			const shot = withCaption(await viewToSvg(target), `${name.replace(/^Map:\s*/, "")} · ${frames[i].label}`);
			const png = await svgToPng(shot.svg, shot.width, shot.height);
			const num = String(i + 1).padStart(2, "0");
			await vault.createBinary(normalizePath(`${folder}/${num} ${frames[i].label.replace(/[\\/:*?"<>|#^[\]]/g, "-")}.png`), await png.arrayBuffer());
			const img = new Image();
			img.src = URL.createObjectURL(png);
			await img.decode();
			thumbs.push({ img, label: frames[i].label });
		}
		// Every frame on one page, in reading order.
		notice.setMessage("Time-lapse: the contact sheet…");
		const cols = Math.min(4, Math.ceil(Math.sqrt(thumbs.length)));
		const tw = 480;
		const th = Math.round((tw * (thumbs[0]?.img.height ?? 300)) / Math.max(1, thumbs[0]?.img.width ?? 400));
		const gap = 12;
		const rows = Math.ceil(thumbs.length / cols);
		const c = createEl("canvas");
		c.width = cols * tw + (cols + 1) * gap;
		c.height = rows * th + (rows + 1) * gap;
		const ctx = c.getContext("2d")!;
		ctx.fillStyle = getComputedStyle(document.body).getPropertyValue("--background-secondary").trim() || "#f2f2f2";
		ctx.fillRect(0, 0, c.width, c.height);
		thumbs.forEach((t, i) => ctx.drawImage(t.img, gap + (i % cols) * (tw + gap), gap + Math.floor(i / cols) * (th + gap), tw, th));
		thumbs.forEach((t) => URL.revokeObjectURL(t.img.src));
		const sheet = await new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("The contact sheet couldn't be made."))), "image/png"));
		const file = await vault.createBinary(normalizePath(`${folder}/All frames.png`), await sheet.arrayBuffer());
		done(plugin, file);
		return file;
	} catch (err) {
		console.error("UniverseView time-lapse:", err);
		new Notice(`Couldn't finish the time-lapse: ${(err as Error).message ?? err}`);
		return undefined;
	} finally {
		notice.hide();
		await restore();
	}
}

/**
 * Opens the picture alone in a print window, where the system print dialog can save a PDF.
 */
export async function printView(target: HTMLElement, name: string) {
	try {
		const { svg, width, height } = await viewToSvg(target);
		const win = window.open("", "_blank", `width=${Math.min(1200, width + 40)},height=${Math.min(900, height + 40)}`);
		if (!win) throw new Error("The print window was blocked.");
		win.document.title = name;
		const holder = win.document.createElement("div");
		// The picture, parsed as SVG and moved into the print window (not written in as HTML).
		const parsed = new DOMParser().parseFromString(svg, "image/svg+xml").documentElement;
		const s = parsed.nodeName.toLowerCase() === "svg" ? (win.document.importNode(parsed, true) as unknown as SVGSVGElement) : null;
		if (s) holder.appendChild(s);
		if (s) {
			s.setAttribute("width", "100%");
			s.removeAttribute("height");
		}
		win.document.body.appendChild(holder);
		// The print window is a page of its own (not Obsidian's): its few styles go in its own stylesheet.
		const style = win.document.createElement("style");
		style.textContent = "@page { margin: 12mm; } body { margin: 0; } svg { display: block; max-width: 100%; }";
		win.document.head.appendChild(style);
		window.setTimeout(() => win.print(), 300);
	} catch (err) {
		new Notice(`Couldn't open the print view: ${(err as Error).message ?? err}`);
	}
}
