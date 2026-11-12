import { Component, MarkdownRenderer, Notice, TFile, normalizePath } from "obsidian";
import type UniverseViewPlugin from "../main";
import type { Entity, EntityType } from "../types";
import { formatDate, formatSpan } from "../dates/parser";
import { renderFacts } from "../render/arc";
import { clickNotice, entityColor } from "../render/common";
import { relOne } from "../index/relkinds";
import { pageName } from "../index/pagename";
import { fileOfResource } from "./export";

/**
 * A world as a small website: a home page with search, a timeline, the maps with clickable places,
 * and a page for every note with its facts, its text, everything it's connected to and the notes
 * that mention it. Plain HTML and CSS in one folder, so it opens from disk or can be put online.
 */

const SECTIONS: [EntityType, string][] = [["culture", "Peoples and powers"], ["person", "People"], ["place", "Places"], ["event", "Events"]];
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

const CSS = `
:root{--ink:#2b2118;--paper:#fbf7ee;--card:#fffdf8;--muted:#7a6a58;--rule:#e2d7c3;--accent:#8a3324}
@media (prefers-color-scheme:dark){:root{--ink:#e9e1d3;--paper:#1b1814;--card:#24201b;--muted:#a89a87;--rule:#3a342c;--accent:#e49a7a}}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:17px/1.6 Georgia,"Iowan Old Style","Palatino Linotype",serif}
header.site{position:sticky;top:0;z-index:5;background:color-mix(in srgb,var(--paper) 92%,transparent);backdrop-filter:blur(6px);border-bottom:1px solid var(--rule)}
header.site .in{max-width:1080px;margin:0 auto;padding:10px 20px;display:flex;flex-wrap:wrap;gap:6px 18px;align-items:center;font:15px/1.4 system-ui,sans-serif}
header.site .brand{font:700 1.15em Georgia,serif;color:var(--ink);margin-right:auto}
header.site a{color:var(--muted)}header.site a:hover{color:var(--accent)}
header.site input{font:inherit;padding:5px 10px;border-radius:999px;border:1px solid var(--rule);background:var(--card);color:var(--ink);width:200px}
main{max-width:1080px;margin:0 auto;padding:28px 20px 80px}
h1{font-size:2.4em;margin:.1em 0 .1em;line-height:1.15}h2{font-size:1.5em;border-bottom:2px solid var(--rule);padding-bottom:.2em;margin-top:2em}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
.lede{color:var(--muted);font-style:italic;margin:0}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px 18px;font:15px/1.45 system-ui,sans-serif;padding:0;list-style:none}
.grid li{padding:4px 0;border-bottom:1px solid var(--rule)}.grid .when{display:block;color:var(--muted);font-size:.85em}
.dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:7px;vertical-align:middle}
.page{display:grid;grid-template-columns:1fr 290px;gap:28px;align-items:start}@media (max-width:820px){.page{grid-template-columns:1fr}}
aside .universeview-facts{position:sticky;top:70px;border:1px solid var(--rule);border-top:4px solid var(--item-color,var(--accent));border-radius:8px;padding:12px 14px;font:14px/1.45 system-ui,sans-serif;background:var(--card)}
.universeview-facts-title a{font-weight:700;font-size:1.05em;color:var(--ink)}.universeview-facts-kind{color:var(--muted);font-size:.9em}
.universeview-facts-image{width:100%;border-radius:6px;margin:8px 0}.universeview-facts-rows{display:grid;grid-template-columns:auto 1fr;gap:3px 10px;margin-top:6px}
.universeview-facts-label{color:var(--muted)}.universeview-facts-summary{margin-top:8px;font-style:italic}
.body img{max-width:100%;border-radius:6px}.ties{font:15px/1.5 system-ui,sans-serif}.ties h3{font:600 1em system-ui,sans-serif;color:var(--muted);margin:1.2em 0 .3em;text-transform:uppercase;letter-spacing:.05em;font-size:.8em}
.ties ul{margin:0;padding-left:1.1em}
table{border-collapse:collapse;width:100%;font:15px/1.5 system-ui,sans-serif}td,th{border-bottom:1px solid var(--rule);padding:6px 8px;text-align:left;vertical-align:top}td.when{white-space:nowrap;color:var(--muted)}
figure.map{margin:1.5em 0}.map-box{position:relative;border-radius:8px;overflow:hidden;border:1px solid var(--rule)}.map-box img{display:block;width:100%}
.map-box svg{position:absolute;inset:0;width:100%;height:100%}.map-box polygon:hover{fill-opacity:.35}
.pin{position:absolute;transform:translate(-6px,-50%);display:flex;align-items:center;gap:4px;font:12px system-ui,sans-serif;color:#1d1a16;text-shadow:0 0 3px #fff,0 0 3px #fff,0 0 3px #fff}
.pin .dot{width:11px;height:11px;border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.35);margin:0}
figcaption{text-align:center;color:var(--muted);font-style:italic}
.hidden{display:none}footer{max-width:1080px;margin:0 auto;padding:20px;color:var(--muted);font:13px system-ui,sans-serif}
`;

/** Search on every page: matches as you type, from a list of every page in the site. */
const SEARCH = (index: string) => `<script>
const PAGES=${index};
const box=document.getElementById("q"),out=document.getElementById("hits");
function show(q){q=q.trim().toLowerCase();if(!out)return;out.innerHTML="";if(!q){out.classList.add("hidden");return;}
const hits=PAGES.filter(p=>p.n.toLowerCase().includes(q)||(p.s||"").toLowerCase().includes(q)).slice(0,40);
out.classList.remove("hidden");out.innerHTML=hits.length?hits.map(p=>'<li><a href="'+p.u+'"><span class="dot" style="background:'+p.c+'"></span>'+p.n.replace(/[&<>]/g,"")+'</a><span class="when">'+(p.k||"")+'</span></li>').join(""):"<li>Nothing found.</li>";}
if(box){box.addEventListener("input",()=>show(box.value));box.addEventListener("keydown",e=>{if(e.key==="Enter"&&!out){location.href="index.html?q="+encodeURIComponent(box.value)}});
const q=new URLSearchParams(location.search).get("q");if(q){box.value=q;show(q)}}
</script>`;

export interface SitePage {
	path: string;
	text?: string;
	/** A vault file copied as is (pictures). */
	copy?: string;
}

/** Every page and picture of the site, by path inside the site folder. */
export async function buildWebsite(plugin: UniverseViewPlugin, world: string | undefined): Promise<SitePage[]> {
	const idx = plugin.index;
	const inScope = (e: Entity) => !world || e.path.startsWith(world + "/");
	const entries = idx.all().filter(inScope).filter((e) => e.type !== "map").sort((a, b) => a.name.localeCompare(b.name));
	const taken = new Set(["index.html", "timeline.html", "maps.html", "style.css"]);
	const pages = new Map(entries.map((e) => [e.key, pageName(e, taken)]));
	const out: SitePage[] = [];
	const assets = new Map<string, string>();
	/** A picture from the vault, copied once into assets/. */
	const asset = (path: string | undefined): string | undefined => {
		if (!path) return undefined;
		const f = plugin.app.vault.getAbstractFileByPath(path);
		if (!(f instanceof TFile)) return undefined;
		let name = assets.get(f.path);
		if (!name) {
			name = `assets/${f.basename.replace(/[^\w-]+/g, "-")}-${assets.size + 1}.${f.extension}`;
			assets.set(f.path, name);
			out.push({ path: name, copy: f.path });
		}
		return name;
	};
	const title = world || plugin.app.vault.getName();
	const link = (key: string, name?: string) => {
		const e = idx.get(key);
		const p = e && pages.get(e.key);
		return p ? `<a href="${p}">${esc(e.name)}</a>` : esc(name ?? key.replace(/^\?/, ""));
	};
	const when = (e: Entity) => formatSpan(e.start, e.end, plugin.calendars.get(e.calendar));
	const searchIndex = JSON.stringify(entries.map((e) => ({ n: e.name, u: pages.get(e.key), c: entityColor(plugin, e), k: [e.category ?? e.type, when(e)].filter(Boolean).join(" · "), s: e.summary ?? "" })));
	const shell = (name: string, body: string, home = false) =>
		`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(name)} · ${esc(title)}</title><link rel="stylesheet" href="style.css"></head><body>` +
		`<header class="site"><div class="in"><a class="brand" href="index.html">${esc(title)}</a><a href="index.html">Home</a><a href="timeline.html">Timeline</a><a href="maps.html">Maps</a><input id="q" type="search" placeholder="Search…" aria-label="Search"></div></header>` +
		`<main>${home ? "" : `<ul id="hits" class="grid hidden"></ul>`}${body}</main><footer>Made with UniverseView · ${new Date().toLocaleDateString()}</footer>${SEARCH(searchIndex)}</body></html>`;

	// Links inside rendered notes point at the pages; vault pictures are copied.
	const tidy = (root: HTMLElement) => {
		root.querySelectorAll("a").forEach((a) => {
			const target = (a.getAttribute("data-href") ?? a.getAttribute("href") ?? a.textContent ?? "").split("#")[0].split("|")[0].trim();
			const e = a.classList.contains("internal-link") || !/^[a-z]+:/i.test(target) ? idx.findByName(target.replace(/\.md$/, "").split("/").pop() ?? "") : undefined;
			const p = e && pages.get(e.key);
			if (p) a.setAttribute("href", p);
			else if (a.classList.contains("internal-link")) a.removeAttribute("href");
			["target", "data-href", "rel", "class"].forEach((x) => a.removeAttribute(x));
		});
		root.querySelectorAll("img").forEach((img) => {
			const file = fileOfResource(plugin.app, img.getAttribute("src") ?? "");
			const a = file ? asset(file.path) : undefined;
			if (a) img.setAttribute("src", a);
			else if (!/^https?:/.test(img.getAttribute("src") ?? "")) img.remove();
		});
	};

	// Home
	let home = `<p class="lede">A world of ${entries.length} entries</p><h1>${esc(title)}</h1><ul id="hits" class="grid hidden"></ul>`;
	for (const [t, label] of SECTIONS) {
		const list = entries.filter((e) => e.type === t);
		if (!list.length) continue;
		home += `<h2>${label}</h2><ul class="grid">${list.map((e) => `<li><a href="${pages.get(e.key)}"><span class="dot" style="background:${entityColor(plugin, e)}"></span>${esc(e.name)}</a>${when(e) ? `<span class="when">${esc(when(e))}</span>` : ""}</li>`).join("")}</ul>`;
	}
	out.push({ path: "index.html", text: shell("Home", home, true) });

	// Timeline
	const events = entries.filter((e) => e.type === "event" && e.start).sort((a, b) => a.start!.start - b.start!.start);
	let tl = `<h1>Timeline</h1><table><thead><tr><th>When</th><th>What</th><th>Where</th><th>Who</th></tr></thead><tbody>`;
	for (const e of events) {
		tl += `<tr><td class="when">${esc(formatDate(e.start, plugin.calendars.get(e.calendar)))}</td><td>${link(e.key)}${e.summary ? `<br><span class="lede">${esc(e.summary)}</span>` : ""}</td><td>${e.places.map((p) => link(p.key, p.name)).join(", ")}</td><td>${[...e.participants.map((p) => link(p.key, p.name)), ...e.cultures.map((c) => link(c.ref.key, c.ref.name))].join(", ")}</td></tr>`;
	}
	tl += `</tbody></table>`;
	out.push({ path: "timeline.html", text: shell("Timeline", events.length ? tl : "<h1>Timeline</h1><p>No dated events yet.</p>") });

	// Maps
	let maps = `<h1>Maps</h1>`;
	for (const m of idx.all("map").filter(inScope)) {
		const img = asset(m.mapImage);
		if (!img || !m.mapImage) continue;
		const size = await imageSize(plugin, m.mapImage);
		if (!size) continue;
		const [w, h] = size;
		let svgAreas = "";
		for (const e of idx.all()) for (const t of e.territories) {
			if (t.map !== m.key) continue;
			const p = pages.get(e.key);
			const poly = `<polygon points="${t.points.map(([x, y]) => `${x},${y}`).join(" ")}" style="fill:${entityColor(plugin, e)};fill-opacity:.18;stroke:${entityColor(plugin, e)};stroke-width:${Math.max(2, w / 500)}"><title>${esc(e.name)}</title></polygon>`;
			svgAreas += p ? `<a href="${p}">${poly}</a>` : poly;
		}
		let pins = "";
		for (const p of idx.all("place")) {
			if (p.map?.key !== m.key || !p.position) continue;
			const y = p.positionFromBottom ? h - p.position[1] : p.position[1];
			pins += `<a class="pin" href="${pages.get(p.key) ?? "#"}" style="left:${(p.position[0] / w) * 100}%;top:${(y / h) * 100}%"><span class="dot" style="background:${entityColor(plugin, p)}"></span>${esc(p.name)}</a>`;
		}
		maps += `<figure class="map"><div class="map-box"><img src="${img}" alt="${esc(m.name)}"><svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">${svgAreas}</svg>${pins}</div><figcaption>${esc(m.name)}</figcaption></figure>`;
	}
	out.push({ path: "maps.html", text: shell("Maps", maps) });

	// A page per note
	const comp = new Component();
	comp.load();
	const resolved = (plugin.app.metadataCache as unknown as { resolvedLinks?: Record<string, Record<string, number>> }).resolvedLinks ?? {};
	for (const e of entries) {
		const facts = createDiv();
		renderFacts(plugin, facts, e.key);
		const body = createDiv();
		body.className = "body";
		const text = (await plugin.app.vault.cachedRead(e.file)).replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "").replace(/```(?:universeview|chronicle)-[\s\S]*?```/g, "");
		await MarkdownRenderer.render(plugin.app, text, body, e.path, comp);
		tidy(facts);
		tidy(body);
		const ties: [string, string[]][] = [];
		const add = (label: string, items: string[]) => {
			if (items.length) ties.push([label, items]);
		};
		add("Parents", e.parents.map((p) => link(p.key, p.name)));
		add("Children", idx.children(e.key).map((k) => link(k)));
		add("Partners", idx.partners(e.key).map((p) => link(p.ref.key, p.ref.name)));
		add("Members", idx.members(e.key).map((m) => link(m.key) + (m.link.role ? ` <span class="lede">(${esc(m.link.role)})</span>` : "")));
		add("Belongs to", e.cultures.map((c) => link(c.ref.key, c.ref.name) + (c.role ? ` <span class="lede">(${esc(c.role)})</span>` : "")));
		add("Relationships", (idx.relationsOf.get(e.key) ?? []).map((r) => `${link(r.ref.key, r.ref.name)} <span class="lede">(${esc(relOne(r.kind))})</span>`));
		add("Events", idx.events(e.key).filter(inScope).sort((a, b) => (a.start?.start ?? 0) - (b.start?.start ?? 0)).map((x) => `${link(x.key)} <span class="lede">${esc(when(x))}</span>`));
		add("Led to it", [...(idx.causesOf.get(e.key) ?? [])].map((k) => link(k)));
		add("What it led to", [...(idx.effectsOf.get(e.key) ?? [])].map((k) => link(k)));
		const mentions = Object.entries(resolved).filter(([src, targets]) => src !== e.path && targets[e.path]).map(([src]) => idx.get(src)).filter((x): x is Entity => !!x && inScope(x));
		add("Mentioned in", mentions.map((x) => link(x.key)));
		const tiesHtml = ties.length ? `<section class="ties">${ties.map(([l, items]) => `<h3>${l}</h3><ul>${items.map((i) => `<li>${i}</li>`).join("")}</ul>`).join("")}</section>` : "";
		const sub = [e.category ?? e.type, when(e)].filter(Boolean).join(" · ");
		const page = `<p class="lede">${esc(sub)}</p><h1>${esc(e.name)}</h1><div class="page"><article>${body.innerHTML}${tiesHtml}</article><aside>${facts.innerHTML}</aside></div>`;
		out.push({ path: pages.get(e.key)!, text: shell(e.name, page) });
	}
	comp.unload();
	out.push({ path: "style.css", text: CSS });
	return out;
}

async function imageSize(plugin: UniverseViewPlugin, path: string): Promise<[number, number] | null> {
	const f = plugin.app.vault.getAbstractFileByPath(path);
	if (!(f instanceof TFile)) return null;
	const url = plugin.app.vault.getResourcePath(f);
	return new Promise((resolve) => {
		const img = new Image();
		img.onload = () => resolve([img.naturalWidth, img.naturalHeight]);
		img.onerror = () => resolve(null);
		img.src = url;
	});
}

/** Writes the website into `UniverseView exports/<world> website/` and offers to open it. */
export async function exportWebsite(plugin: UniverseViewPlugin, world: string | undefined) {
	const notice = new Notice("Building the website…", 0);
	try {
		const files = await buildWebsite(plugin, world);
		const { vault } = plugin.app;
		const root = normalizePath(`UniverseView exports/${(world || vault.getName()).replace(/[\\/:*?"<>|#^[\]]/g, "-")} website`);
		for (const dir of ["UniverseView exports", root, `${root}/assets`]) if (!vault.getFolderByPath(dir)) await vault.createFolder(dir);
		for (const f of files) {
			const path = normalizePath(`${root}/${f.path}`);
			const existing = vault.getFileByPath(path);
			if (f.text !== undefined) {
				if (existing) await vault.modify(existing, f.text);
				else await vault.create(path, f.text);
			} else if (f.copy) {
				const src = vault.getFileByPath(f.copy);
				if (!src) continue;
				const data = await vault.readBinary(src);
				if (existing) await vault.modifyBinary(existing, data);
				else await vault.createBinary(path, data);
			}
		}
		notice.hide();
		const pagesCount = files.filter((f) => f.path.endsWith(".html")).length;
		clickNotice(`Saved a ${pagesCount}-page website in ${root}. Click to open it in your browser. To put it online, upload the folder to any static host.`, 12000, () => {
			const app = plugin.app as unknown as { openWithDefaultApp?: (p: string) => void };
			app.openWithDefaultApp?.(`${root}/index.html`);
		});
	} catch (err) {
		notice.hide();
		console.error("UniverseView website:", err);
		new Notice(`Couldn't build the website: ${(err as Error).message ?? err}`);
	}
}
