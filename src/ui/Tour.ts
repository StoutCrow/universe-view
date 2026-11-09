import { Modal } from "obsidian";
import type ChroniclePlugin from "../main";
import { applyAppearance } from "../appearance";
import type { SurfaceStyle, ThemeId } from "../settings";
import { el } from "../render/common";
import { renderThemeCards } from "./themecards";
import { DetectModal } from "./DetectModal";
import { addSampleWorld, sampleBlurb } from "./sample";

const VIEWS: [string, string][] = [
	["Timeline", "Events, lifespans and reigns on one scale, in lanes you can group and drag."],
	["Family tree", "Ancestors and descendants of anyone, with who each person is to the one at the centre."],
	["Map", "Places, borders, wars and journeys, on an image of your own or a real map."],
	["Lineage", "How houses, nations and faiths rise, split and fall."],
	["Connections", "Who and what is linked to whom, and how."],
	["Org chart", "Who led a group, and when."],
	["Library and Board", "Browse every note and what's missing from it; arrange your own dashboard."],
];

const STEPS = ["Welcome", "What you get", "Filling it in", "Pick a look", "Begin"] as const;

/**
 * A short tour: what UniverseView does, then a step where themes and surface styles are tried on live
 * (the choice is kept only if you carry on from that step), then the ways to begin. It opens by itself
 * on a first install; Settings and a command bring it back.
 */
export class TourModal extends Modal {
	private step = 0;
	private kept = false;
	private readonly original: { theme: ThemeId; surface: SurfaceStyle };

	constructor(private plugin: ChroniclePlugin) {
		super(plugin.app);
		this.original = { theme: plugin.settings.theme, surface: plugin.settings.surfaceStyle ?? "flat" };
	}

	onOpen() {
		this.modalEl.addClass("uv-tour", "chronicle-scope");
		this.render();
	}

	onClose() {
		// Closing on the look step without carrying on puts back what you had.
		if (!this.kept) this.restore();
		this.contentEl.empty();
	}

	private restore() {
		const s = this.plugin.settings;
		s.theme = this.original.theme;
		s.surfaceStyle = this.original.surface;
		applyAppearance(s);
	}

	private render() {
		const { contentEl } = this;
		contentEl.empty();
		this.titleEl.setText(STEPS[this.step]);
		const body = el("div", { cls: "uv-tour-body" }, contentEl);
		if (this.step === 0) this.welcome(body);
		else if (this.step === 1) this.views(body);
		else if (this.step === 2) this.filling(body);
		else if (this.step === 3) this.look(body);
		else this.begin(body);

		const foot = el("div", { cls: "uv-tour-foot" }, contentEl);
		el("span", { cls: "uv-tour-count", text: `${this.step + 1} of ${STEPS.length}` }, foot);
		const last = this.step === STEPS.length - 1;
		const skip = el("button", { cls: "uv-tour-skip", text: last ? "Close" : "Skip the tour" }, foot);
		skip.addEventListener("click", () => this.close());
		if (this.step > 0) el("button", { text: "Back" }, foot).addEventListener("click", () => this.go(-1));
		if (!last) {
			const next = el("button", { cls: "mod-cta", text: this.step === 3 ? "Keep this look" : "Next" }, foot);
			next.addEventListener("click", () => this.go(1));
		}
	}

	private go(by: number) {
		// Carrying on from the look step keeps what was tried on.
		if (this.step === 3 && by > 0) {
			this.kept = true;
			void this.plugin.saveSettings();
		}
		this.step = Math.max(0, Math.min(STEPS.length - 1, this.step + by));
		this.render();
	}

	private welcome(body: HTMLElement) {
		el("p", { text: "UniverseView turns the notes in your vault into timelines, family trees, maps and more. It reads the properties you already write on a note, like born, parents, date and place." }, body);
		el("p", { text: "This takes about a minute. You can try on the themes along the way, and skip any time." }, body);
	}

	private views(body: HTMLElement) {
		const list = el("dl", { cls: "uv-tour-list" }, body);
		for (const [name, desc] of VIEWS) {
			el("dt", { text: name }, list);
			el("dd", { text: desc }, list);
		}
		el("p", { cls: "uv-tour-note", text: "They all open from the star button in the sidebar, one tab each, and each remembers its own filters." }, body);
	}

	private filling(body: HTMLElement) {
		const list = el("dl", { cls: "uv-tour-list" }, body);
		const item = (name: string, desc: string) => {
			el("dt", { text: name }, list);
			el("dd", { text: desc }, list);
		};
		item("Quick creator", "Type a line like “Battle of Hastings, 1066, at Hastings” and it makes the note, with its links.");
		item("Detect types", "Finds the people, places and events already in your notes. You review each one before anything changes.");
		item("Smart reader", "Reads facts out of a note's text and adds only the ones you approve.");
		item("Undo", "Everything UniverseView writes can be undone, one step at a time.");
	}

	private look(body: HTMLElement) {
		const s = this.plugin.settings;
		el("p", { text: "Click to try one on. The dashboard behind this window changes as you click. It's kept when you press Keep this look; close the tour instead and nothing changes." }, body);
		renderThemeCards(body, s.theme, (id) => {
			s.theme = id;
			applyAppearance(s);
		});
		el("h3", { cls: "uv-tour-sub", text: "Surface style" }, body);
		const row = el("div", { cls: "uv-tour-styles" }, body);
		const options: [SurfaceStyle, string, string][] = [
			["flat", "Flat", "Quiet, and follows your Obsidian theme."],
			["tactile", "Tactile", "Raised keys, folder tabs and inset fields, so UniverseView's own tabs stand out from Obsidian's."],
		];
		for (const [id, name, desc] of options) {
			const card = el("button", { cls: "uv-tour-style" + ((s.surfaceStyle ?? "flat") === id ? " is-active" : "") }, row);
			const sample = el("div", { cls: `uv-style-sample is-${id}` }, card);
			el("span", { cls: "uv-style-tab", text: "Tab" }, sample);
			el("span", { cls: "uv-style-key", text: "Button" }, sample);
			el("div", { cls: "uv-tour-style-name", text: name }, card);
			el("div", { cls: "uv-tour-style-desc", text: desc }, card);
			card.addEventListener("click", () => {
				row.querySelectorAll(".uv-tour-style").forEach((c) => c.removeClass("is-active"));
				card.addClass("is-active");
				s.surfaceStyle = id;
				applyAppearance(s);
			});
		}
	}

	private begin(body: HTMLElement) {
		const p = this.plugin;
		el("p", { text: "Choose how to begin. You can change the look any time in Settings → Look & cards, and retake this tour there." }, body);
		const choice = (title: string, desc: string, run: () => void) => {
			const b = el("button", { cls: "uv-setup-choice" }, body);
			const text = el("span", { cls: "uv-setup-text" }, b);
			el("strong", { text: title }, text);
			el("span", { text: desc }, text);
			b.addEventListener("click", () => {
				this.close();
				run();
			});
		};
		const notes = p.app.vault.getMarkdownFiles().length;
		if (notes) choice("Read my notes", `Find the people, places and events in your ${notes.toLocaleString()} note${notes === 1 ? "" : "s"}. You review each one before anything changes.`, () => new DetectModal(p).open());
		choice("Add a sample world", sampleBlurb(p), () => void addSampleWorld(p));
		choice("Start from scratch", "Create your first person, place, group or event.", () => p.createEntityPrompt());
	}
}
