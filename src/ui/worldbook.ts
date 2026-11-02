import { Component, MarkdownRenderer, Notice, TFile, normalizePath } from "obsidian";
import type ChroniclePlugin from "../main";
import type { Entity, EntityType } from "../types";
import { formatDate } from "../dates/parser";
import { renderFacts } from "../render/arc";
import { clickNotice, entityColor } from "../render/common";

const SECTIONS: [EntityType, string][] = [["culture", "Peoples and powers"], ["person", "People"], ["place", "Places"], ["event", "Events"]];

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const slug = (e: Entity) => "n-" + e.path.replace(/[^\w]+/g, "-").toLowerCase();

async function fileToDataUrl(plugin: ChroniclePlugin, path: string, maxBytes = 3_000_000): Promise<string | null> {
	const f = plugin.app.vault.getAbstractFileByPath(path);
	if (!(f instanceof TFile) || f.stat.size > maxBytes) return null;
	const buf = await plugin.app.vault.readBinary(f);
	const ext = f.extension.toLowerCase();
	const mime = ext === "svg" ? "image/svg+xml" : ext === "jpg" ? "image/jpeg" : `image/${ext}`;
	let bin = "";
	const bytes = new Uint8Array(buf);
	for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	return `data:${mime};base64,${btoa(bin)}`;
}

/** Turns links between notes into links within the book, and pictures into embedded data. */
async function tidyHtml(plugin: ChroniclePlugin, root: HTMLElement, ids: Map<string, string>) {
	root.querySelectorAll("a").forEach((a) => {
		const target = (a.getAttribute("data-href") ?? a.textContent ?? "").split("#")[0].split("|")[0].trim();
		const e = plugin.index.findByName(target);
		const id = e && ids.get(e.key);
		if (id) a.setAttribute("href", `#${id}`);
		else if (a.classList.contains("internal-link")) a.removeAttribute("href");
		a.removeAttribute("target");
		a.removeAttribute("data-href");
	});
	for (const img of Array.from(root.querySelectorAll("img"))) {
		const src = img.getAttribute("src") ?? "";
		if (src.startsWith("data:")) continue;
		// Vault pictures: find the file from the end of the resource URL.
		const name = decodeURIComponent(src.split("?")[0].split("/").pop() ?? "");
		const file = plugin.app.vault.getFiles().find((f) => f.name === name);
		const data = file ? await fileToDataUrl(plugin, file.path) : null;
		if (data) img.setAttribute("src", data);
		else img.remove();
	}
}

/** One map: its picture with the places and painted areas on it, scaled to the page. */
async function mapFigure(plugin: ChroniclePlugin, m: Entity, ids: Map<string, string>): Promise<string> {
	if (!m.mapImage) return "";
	const data = await fileToDataUrl(plugin, m.mapImage, 12_000_000);
	if (!data) return "";
	const size = await new Promise<[number, number] | null>((resolve) => {
		const img = new Image();
		img.onload = () => resolve([img.naturalWidth, img.naturalHeight]);
		img.onerror = () => resolve(null);
		img.src = data;
	});
	if (!size) return "";
	const [w, h] = size;
	const idx = plugin.index;
	let areas = "";
	for (const e of idx.all()) {
		for (const t of e.territories) {
			if (t.map !== m.key) continue;
			areas += `<polygon points="${t.points.map(([x, y]) => `${x},${y}`).join(" ")}" style="fill:${entityColor(plugin, e)};fill-opacity:.2;stroke:${entityColor(plugin, e)};stroke-width:${Math.max(2, w / 500)}"><title>${esc(e.name)}</title></polygon>`;
		}
	}
	let pins = "";
	for (const p of idx.all("place")) {
		if (p.map?.key !== m.key || !p.position) continue;
		const y = p.positionFromBottom ? h - p.position[1] : p.position[1];
		const id = ids.get(p.key);
		pins += `<a class="pin" href="${id ? `#${id}` : "#"}" style="left:${(p.position[0] / w) * 100}%;top:${(y / h) * 100}%"><span class="dot" style="background:${entityColor(plugin, p)}"></span><span class="pin-name">${esc(p.name)}</span></a>`;
	}
	return `<figure class="map"><div class="map-box"><img src="${data}" alt="${esc(m.name)}"><svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">${areas}</svg>${pins}</div><figcaption>${esc(m.name)}</figcaption></figure>`;
}

const CSS = `
:root{--ink:#2b2118;--paper:#fbf7ee;--muted:#7a6a58;--rule:#d9cdb8;--accent:#8a3324}
@media (prefers-color-scheme:dark){:root{--ink:#e9e1d3;--paper:#1d1a16;--muted:#a89a87;--rule:#3a342c;--accent:#e08a6a}}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:17px/1.6 Georgia,"Iowan Old Style","Palatino Linotype",serif}
main{max-width:860px;margin:0 auto;padding:48px 24px 96px}h1{font-size:2.6em;margin:.2em 0;letter-spacing:.01em}h2{font-size:1.7em;border-bottom:2px solid var(--rule);padding-bottom:.2em;margin-top:2.4em}
h3{font-size:1.25em;margin:2em 0 .3em}a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
.lede{color:var(--muted);font-style:italic}.toc{columns:2 260px;font-size:.95em}.toc a{display:block}
.entry{overflow:hidden;border-bottom:1px solid var(--rule);padding-bottom:1em}
.chronicle-facts{float:right;width:260px;margin:0 0 1em 1.4em;border:1px solid var(--rule);border-top:4px solid var(--item-color,var(--accent));border-radius:6px;padding:10px 12px;font:14px/1.45 system-ui,sans-serif;background:color-mix(in srgb,var(--paper) 92%,var(--ink))}
.chronicle-facts-title a{font-weight:700;font-size:1.05em;color:var(--ink)}.chronicle-facts-kind{color:var(--muted);font-size:.9em}
.chronicle-facts-image{width:100%;border-radius:4px;margin:8px 0}.chronicle-facts-rows{display:grid;grid-template-columns:auto 1fr;gap:3px 10px;margin-top:6px}
.chronicle-facts-label{color:var(--muted)}.chronicle-facts-summary{margin-top:8px;font-style:italic}
.body img{max-width:100%}table{border-collapse:collapse;width:100%;font:14px/1.5 system-ui,sans-serif}td,th{border-bottom:1px solid var(--rule);padding:4px 8px;text-align:left;vertical-align:top}
figure.map{margin:2em 0}.map-box{position:relative}.map-box img{display:block;width:100%}.map-box svg{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
.pin{position:absolute;transform:translate(-5px,-50%);display:flex;align-items:center;gap:4px;font:12px system-ui,sans-serif;color:#1d1a16;text-shadow:0 0 3px #fff,0 0 3px #fff}
.pin .dot{width:10px;height:10px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.3)}figcaption{text-align:center;color:var(--muted);font-style:italic}
@media print{body{background:#fff;color:#000;font-size:12pt}main{max-width:none;padding:0}h2{page-break-before:always}.entry{page-break-inside:avoid}a{color:#000}}
`;

/** A single web page with everything about a world: its maps, a timeline, and an entry per note. */
export async function buildWorldBook(plugin: ChroniclePlugin, world: string | undefined): Promise<string> {
	const idx = plugin.index;
	const inScope = (e: Entity) => !world || e.path.startsWith(world + "/");
	const entries = idx.all().filter(inScope).filter((e) => e.type !== "map").sort((a, b) => a.name.localeCompare(b.name));
	const ids = new Map(entries.map((e) => [e.key, slug(e)]));
	const comp = new Component();
	comp.load();
	const title = world || plugin.app.vault.getName();
	let html = `<header><p class="lede">A world book</p><h1>${esc(title)}</h1><p class="lede">${entries.length} entries · made with UniverseView on ${new Date().toLocaleDateString()}</p></header>`;
	// Contents
	html += `<nav class="toc">`;
	for (const [t, label] of SECTIONS) if (entries.some((e) => e.type === t)) html += `<a href="#sec-${t}">${label}</a>`;
	html += `<a href="#sec-timeline">Timeline</a><a href="#sec-maps">Maps</a></nav>`;
	// Maps
	const maps = idx.all("map").filter(inScope);
	if (maps.length) {
		html += `<h2 id="sec-maps">Maps</h2>`;
		for (const m of maps) html += await mapFigure(plugin, m, ids);
	}
	// Timeline
	const events = entries.filter((e) => e.type === "event" && e.start).sort((a, b) => a.start!.start - b.start!.start);
	if (events.length) {
		html += `<h2 id="sec-timeline">Timeline</h2><table><thead><tr><th>When</th><th>What</th><th>Where</th></tr></thead><tbody>`;
		for (const e of events) {
			const where = e.places.map((p) => {
				const id = ids.get(p.key);
				return id ? `<a href="#${id}">${esc(p.name)}</a>` : esc(p.name);
			}).join(", ");
			html += `<tr><td>${esc(formatDate(e.start, plugin.calendars.get(e.calendar)))}</td><td><a href="#${ids.get(e.key)}">${esc(e.name)}</a></td><td>${where}</td></tr>`;
		}
		html += `</tbody></table>`;
	}
	// Entries, by section
	for (const [t, label] of SECTIONS) {
		const list = entries.filter((e) => e.type === t);
		if (!list.length) continue;
		html += `<h2 id="sec-${t}">${label}</h2>`;
		for (const e of list) {
			const facts = createDiv();
			renderFacts(plugin, facts, e.key);
			const body = createDiv();
			body.className = "body";
			const text = (await plugin.app.vault.cachedRead(e.file)).replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "").replace(/```chronicle-[\s\S]*?```/g, "");
			await MarkdownRenderer.render(plugin.app, text, body, e.path, comp);
			await tidyHtml(plugin, facts, ids);
			await tidyHtml(plugin, body, ids);
			html += `<section class="entry" id="${ids.get(e.key)}"><h3>${esc(e.name)}</h3>${facts.innerHTML}${body.innerHTML}</section>`;
		}
	}
	comp.unload();
	return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title><style>${CSS}</style></head><body><main>${html}</main></body></html>`;
}

export async function exportWorldBook(plugin: ChroniclePlugin, world: string | undefined) {
	const notice = new Notice("Writing the world book…", 0);
	try {
		const html = await buildWorldBook(plugin, world);
		const { vault } = plugin.app;
		if (!vault.getAbstractFileByPath("UniverseView exports")) await vault.createFolder("UniverseView exports");
		const path = normalizePath(`UniverseView exports/${(world || vault.getName()).replace(/[\\/:*?"<>|#^[\]]/g, "-")} world book.html`);
		const existing = vault.getAbstractFileByPath(path);
		if (existing instanceof TFile) await vault.modify(existing, html);
		else await vault.create(path, html);
		notice.hide();
		clickNotice(`Saved ${path}. Click to open it in your browser, where you can also print it or save it as a PDF.`, 12000, () => {
			const app = plugin.app as unknown as { openWithDefaultApp?: (p: string) => void };
			app.openWithDefaultApp?.(path);
		});
	} catch (err) {
		notice.hide();
		console.error("UniverseView world book:", err);
		new Notice(`Couldn't write the world book: ${(err as Error).message ?? err}`);
	}
}
