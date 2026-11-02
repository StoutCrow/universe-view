import { Modal, Notice } from "obsidian";
import type ChroniclePlugin from "../main";
import type { Entity } from "../types";
import { el, entityColor } from "./common";
import { hex, type ColourArea } from "./colours";
export { findColourAreas } from "./colours";
import { EntityInputSuggest } from "../ui/suggest";

/**
 * Each colour found, matched to the note whose `color:` is nearest (when near enough), or to one
 * picked by hand. Import draws one area per colour for its note (islands included).
 */
export class ColourImportModal extends Modal {
	private picks: (Entity | undefined)[];
	private replace = true;

	constructor(private plugin: ChroniclePlugin, private areas: ColourArea[], private onImport: (rows: { e: Entity; area: ColourArea }[], replace: boolean) => Promise<void>, world?: string) {
		super(plugin.app);
		// Only lands of this map's world, and not families (a house's colour isn't its land).
		const tree = plugin.realms();
		const lands = plugin.index.all().filter((e) => (e.type === "place" || (e.type === "culture" && tree.nodes.has(e.key))) && e.color && (!world || e.path.startsWith(world + "/")));
		const rgbOf = (c: string): [number, number, number] | undefined => {
			const m = /^#?([0-9a-f]{6})$/i.exec(c.trim());
			if (!m) return undefined;
			const n = parseInt(m[1], 16);
			return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
		};
		const used = new Set<string>();
		this.picks = areas.map((a) => {
			// A colour covering most of the picture is the sea or bare land, not a realm.
			if (a.share > 0.35) return undefined;
			let best: { e: Entity; d: number } | undefined;
			for (const e of lands) {
				if (used.has(e.key)) continue;
				const rgb = rgbOf(e.color!);
				if (!rgb) continue;
				const d = Math.hypot(rgb[0] - a.rgb[0], rgb[1] - a.rgb[1], rgb[2] - a.rgb[2]);
				if (d < 70 && (!best || d < best.d)) best = { e, d };
			}
			if (best) used.add(best.e.key);
			return best?.e;
		});
	}

	onOpen() {
		this.containerEl.addClass("chronicle-scope-host");
		this.modalEl.addClass("chronicle-scope", "chronicle-tool-modal", "uv-cimport");
		this.titleEl.setText("Import borders from the map's colours");
		const { contentEl } = this;
		el("p", { cls: "chronicle-dash-muted", text: `${this.areas.length} flat colours found. Each is matched to the realm or place whose colour is nearest; pick a different one, or leave a colour empty to skip it (the sea, say). Each imported colour becomes that note's area on this map, islands and all.` }, contentEl);
		const list = el("div", { cls: "uv-cimport-list" }, contentEl);
		this.areas.forEach((a, i) => {
			const row = el("div", { cls: "uv-cimport-row" }, list);
			el("span", { cls: "uv-cimport-swatch" }, row).style.background = hex(a.rgb);
			el("span", { cls: "uv-cimport-share", text: `${(a.share * 100).toFixed(1)}% · ${a.rings.length} part${a.rings.length === 1 ? "" : "s"}` }, row);
			const input = el("input", { attr: { type: "text", placeholder: "Skip (or type a realm or place)" } }, row);
			input.value = this.picks[i]?.name ?? "";
			const dot = el("span", { cls: "uv-cimport-dot" }, row);
			const show = () => dot.style.setProperty("background", this.picks[i] ? entityColor(this.plugin, this.picks[i]) : "transparent");
			show();
			new EntityInputSuggest(this.app, input, this.plugin, ["place", "culture"], (e) => {
				this.picks[i] = e;
				input.value = e.name;
				show();
			});
			input.addEventListener("change", () => {
				if (!input.value.trim()) this.picks[i] = undefined;
				else this.picks[i] = this.plugin.index.findByName(input.value.trim()) ?? this.picks[i];
				show();
			});
		});
		const opt = el("label", { cls: "uv-cimport-opt" }, contentEl);
		const box = el("input", { attr: { type: "checkbox" } }, opt);
		box.checked = this.replace;
		el("span", { text: "Replace any areas these notes already have on this map" }, opt);
		box.addEventListener("change", () => (this.replace = box.checked));
		const footer = el("div", { cls: "modal-button-container" }, contentEl);
		el("button", { text: "Cancel" }, footer).addEventListener("click", () => this.close());
		const go = el("button", { cls: "mod-cta", text: "Import" }, footer);
		go.addEventListener("click", () => void (async () => {
			const rows = this.areas.map((area, i) => ({ e: this.picks[i], area })).filter((r): r is { e: Entity; area: ColourArea } => !!r.e);
			if (!rows.length) {
				new Notice("Pick a note for at least one colour.");
				return;
			}
			go.disabled = true;
			await this.onImport(rows, this.replace);
			this.close();
		})());
	}

	onClose() {
		this.contentEl.empty();
	}
}
