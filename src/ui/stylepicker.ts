import { el, icon } from "../render/common";

export interface StyleChoice {
	id: string;
	name: string;
	note?: string;
}

/** How a card draws its sample: `box` is the preview well, `id` the style it shows. */
export type StylePreview = (box: HTMLElement, id: string) => void;

/**
 * A grid of cards, each a live sample of one style (drawn by the real CSS through `.uv-pv`), the picked one
 * marked. The first card is "Theme": no choice of your own, so the theme's look shows. `onPick(undefined)` means that.
 */
export function stylePicker(
	parent: HTMLElement,
	opts: { choices: StyleChoice[]; value: string | undefined; themeChoice: StyleChoice; onPick: (id: string | undefined) => void; preview: StylePreview },
): HTMLElement {
	const grid = el("div", { cls: "uv-sp-grid", attr: { role: "radiogroup" } }, parent);
	const cards: HTMLElement[] = [];
	const add = (id: string | undefined, c: StyleChoice, shows: string) => {
		const on = (opts.value ?? undefined) === id;
		const card = el("div", { cls: "uv-sp-card" + (on ? " is-active" : ""), attr: { role: "radio", tabindex: "0", "aria-checked": String(on) } }, grid);
		opts.preview(el("div", { cls: "uv-sp-view" }, card), shows);
		el("div", { cls: "uv-sp-name", text: c.name }, card);
		if (c.note) el("div", { cls: "uv-sp-note", text: c.note }, card);
		cards.push(card);
		card.addEventListener("keydown", (e) => {
			if (e.key === "Enter" || e.key === " ") {
				e.preventDefault();
				card.click();
			}
		});
		card.addEventListener("click", () => {
			for (const o of cards) {
				o.removeClass("is-active");
				o.setAttribute("aria-checked", "false");
			}
			card.addClass("is-active");
			card.setAttribute("aria-checked", "true");
			opts.onPick(id);
		});
	};
	add(undefined, opts.themeChoice, opts.themeChoice.id);
	for (const c of opts.choices) add(c.id, c, c.id);
	return grid;
}

const wrap = (box: HTMLElement, kind: string, id: string) => el("div", { cls: id === "theme" ? "uv-pv" : `uv-pv uv-${kind}-${id}` }, box);

/** Two chips, one on, and a round icon button. */
export const previewButtons: StylePreview = (box, id) => {
	const w = wrap(box, "btn", id);
	w.addClass("uv-sp-row");
	el("span", { cls: "chronicle-chip", text: "Show" }, w);
	el("span", { cls: "chronicle-chip is-active", text: "On" }, w);
};

/** Three tabs, the middle one open. */
export const previewTabs: StylePreview = (box, id) => {
	const w = wrap(box, "tabs", id);
	const row = el("div", { cls: "uv-hub-tabs" }, w);
	el("button", { cls: "uv-hub-tab", text: "Map", attr: { tabindex: "-1" } }, row);
	el("button", { cls: "uv-hub-tab is-active", text: "Timeline", attr: { tabindex: "-1" } }, row);
};

/** A small panel with two lines of text. */
export const previewEdges: StylePreview = (box, id) => {
	const w = wrap(box, "edge", id);
	w.addClass("uv-sp-full");
	const card = el("div", { cls: "uv-pv-card" }, w);
	el("div", { cls: "uv-pv-line" }, card);
	el("div", { cls: "uv-pv-line is-short" }, card);
};

/** A heading and a line of text in the pair's fonts. */
export const previewFonts: StylePreview = (box, id) => {
	const w = wrap(box, "font", id);
	w.addClass("uv-sp-col");
	el("div", { cls: "uv-pv-title", text: "House of Tudor" }, w);
	el("div", { cls: "uv-pv-sample", text: "Born 1457, died 1509" }, w);
};

const ICON_NAMES = ["map", "git-fork", "calendar", "search"];

/** A few icons at the style's weight. */
export const previewIcons: StylePreview = (box, id) => {
	const w = wrap(box, "icons", id);
	for (const n of ICON_NAMES) icon(el("span", { cls: "uv-sp-icon" }, w), n);
};

/** A heading as the style marks it, then a muted line under it. */
export const previewHeadings: StylePreview = (box, id) => {
	const w = wrap(box, "head", id);
	w.addClass("uv-sp-col");
	el("div", { cls: "chronicle-module-title", text: "House of Tudor" }, w);
	el("div", { cls: "uv-pv-sample", text: "Born 1457" }, w);
};
