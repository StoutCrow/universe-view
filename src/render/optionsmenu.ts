import { el, icon } from "./common";

/** One line in a view's Options panel. */
export type OptionEntry =
	| { type: "toggle"; label: string; get: () => boolean; set: (v: boolean) => void }
	| { type: "choice"; label: string; options: [string, string][]; get: () => string; set: (v: string) => void }
	| { type: "action"; label: string; icon?: string; run: () => void };

let open: { close: () => void } | undefined;

/**
 * The "Options" button every view's toolbar uses for what isn't needed at a glance: switches, number
 * boxes and one-off actions. The panel is built when it opens (so a layout's own options show), stays
 * open while you change several things, and closes on a click elsewhere or Esc.
 */
export function optionsButton(parent: HTMLElement, entries: () => OptionEntry[], label = "Options"): HTMLElement {
	const btn = el("button", { cls: "chronicle-chip uv-options-btn", title: "Options for this view", attr: { "aria-haspopup": "dialog" } }, parent);
	icon(el("span", { cls: "chronicle-chip-icon" }, btn), "sliders-horizontal");
	el("span", { text: label }, btn);
	btn.addEventListener("click", (evt) => {
		evt.stopPropagation();
		if (btn.getAttribute("aria-expanded") === "true") {
			open?.close();
			return;
		}
		open?.close();
		const pop = el("div", { cls: "uv-options chronicle-scope", attr: { role: "dialog", "aria-label": "Options" } }, document.body);
		for (const e of entries()) {
			if (e.type === "action") {
				const b = el("button", { cls: "uv-options-action" }, pop);
				if (e.icon) icon(el("span", { cls: "chronicle-chip-icon" }, b), e.icon);
				el("span", { text: e.label }, b);
				b.addEventListener("click", () => {
					close();
					e.run();
				});
				continue;
			}
			const row = el("label", { cls: "uv-options-row" }, pop);
			el("span", { cls: "uv-options-label", text: e.label }, row);
			if (e.type === "toggle") {
				const box = el("input", { cls: "uv-options-check", attr: { type: "checkbox" } }, row);
				box.checked = e.get();
				box.addEventListener("change", () => e.set(box.checked));
			} else {
				const sel = el("select", { cls: "dropdown chronicle-select" }, row);
				for (const [v, text] of e.options) el("option", { text, attr: { value: v } }, sel);
				sel.value = e.get();
				sel.addEventListener("change", () => e.set(sel.value));
			}
		}
		const r = btn.getBoundingClientRect();
		pop.style.top = `${Math.round(r.bottom + 4)}px`;
		pop.style.left = `${Math.round(Math.max(8, Math.min(r.left, window.innerWidth - pop.offsetWidth - 8)))}px`;
		btn.setAttribute("aria-expanded", "true");
		const away = (ev: Event) => {
			if (!pop.contains(ev.target as Node) && !btn.contains(ev.target as Node)) close();
		};
		const esc = (ev: KeyboardEvent) => {
			if (ev.key === "Escape") close();
		};
		function close() {
			pop.remove();
			btn.setAttribute("aria-expanded", "false");
			document.removeEventListener("pointerdown", away, true);
			document.removeEventListener("keydown", esc, true);
			if (open?.close === close) open = undefined;
		}
		document.addEventListener("pointerdown", away, true);
		document.addEventListener("keydown", esc, true);
		open = { close };
	});
	return btn;
}
