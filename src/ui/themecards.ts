import { THEMES } from "../appearance";
import type { ThemeId } from "../settings";
import { el } from "../render/common";

/** The theme cards (a small preview, the name and what it suits), one of them marked; `onPick` hears each click. Settings and the tour share them. */
export function renderThemeCards(parent: HTMLElement, selected: ThemeId, onPick: (id: ThemeId) => void): HTMLElement {
	const grid = el("div", { cls: "chronicle-theme-grid" }, parent);
	for (const th of THEMES) {
		const card = el("button", { cls: "chronicle-theme-card" + (selected === th.id ? " is-active" : "") }, grid);
		const preview = el("div", { cls: `chronicle-theme-preview preview-${th.id}` }, card);
		const [bg, panel, text, accent, ...types] = th.swatches;
		preview.style.setProperty("--pv-bg", bg);
		preview.style.setProperty("--pv-panel", panel);
		preview.style.setProperty("--pv-text", text);
		preview.style.setProperty("--pv-accent", accent);
		const bar = el("div", { cls: "chronicle-pv-bar" }, preview);
		for (let i = 0; i < 3; i++) el("span", {}, bar);
		const rows = el("div", { cls: "chronicle-pv-rows" }, preview);
		types.forEach((c, i) => {
			const r = el("span", { cls: "chronicle-pv-row" }, rows);
			r.style.setProperty("--pv-c", c);
			r.style.setProperty("--pv-w", `${[70, 45, 85, 55][i]}%`);
			r.style.setProperty("--pv-x", `${[4, 30, 12, 38][i]}%`);
		});
		el("div", { cls: "chronicle-theme-name", text: th.name }, card);
		el("div", { cls: "chronicle-theme-for", text: th.forWhat }, card);
		el("div", { cls: "chronicle-theme-for uv-theme-looks", text: `${th.buttons} buttons · ${th.tabs} tabs · ${th.edges} edges · ${th.icons} icons · ${th.headings} headings` }, card);
		card.setAttribute("aria-label", th.description);
		card.addEventListener("click", () => {
			grid.querySelectorAll(".chronicle-theme-card").forEach((c) => c.removeClass("is-active"));
			card.addClass("is-active");
			onPick(th.id);
		});
	}
	return grid;
}
