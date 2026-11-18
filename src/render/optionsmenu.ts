import { el, helpTip, icon } from "./common";

/** What each option does, behind a "?" in the panel, for options a view gives no hint of its own. */
const OPTION_HELP: Record<string, string> = {
	"Calendar": "Which calendar dates are shown in. Calendars are set up in the settings (Time & calendars).",
	"Moons": "Show the phases of the world's moons, for calendars that define them.",
	"Holidays": "Show the calendar's holidays on their days.",
	"Birthdays": "Show people's birthdays, from their born date.",
	"Anniversaries": "Show the yearly anniversary of each event.",
	"Story dates": "Show events from your notes on the day they happened.",
	"How far out": "How many generations to draw around the person.",
	"In-laws": "Also draw the families partners come from.",
	"Generations of ancestors": "How many generations above the person to draw.",
	"Generations of descendants": "How many generations below the person to draw.",
	"Siblings": "Draw brothers and sisters beside each person.",
	"Card style": "How each person's card looks.",
	"Under the name": "What each card says under the person's name.",
	"Lines": "How the lines between family members are drawn.",
	"Relationships on cards": "Show a note's other ties (allies, rivals, mentors…) on the cards.",
	"Follow the active note": "Redraw around whichever note you open.",
	"By descent (people without a house count in their parents')": "People with no house of their own are counted in their parents' house.",
	"All groups, not just houses and clans": "Also draw realms, faiths, organisations and other societies.",
	"Rows by kind": "Give each kind of society (realms, houses, faiths…) its own row.",
	"Events": "Show events as marks along the bars.",
	"Leaders": "Show who led each group, and when.",
	"Map mode": "What the map is showing: places, realms or something else.",
	"Map style": "How the map is drawn: its colours, edges and lettering.",
	"Pins": "Which places get pins, and what colours them.",
	"Realms": "How territories are drawn on the map.",
	"Realm tiers": "Which levels of land (empire, kingdom, county…) are drawn.",
	"Only places with events": "Hide places that no event happened at.",
	"Compare with a second map": "Show another map beside this one to compare them.",
	"Steps from the focus": "How many links away from the note in the middle to draw.",
	"Names on the dots": "Write each note's name beside its dot.",
	"Draw links (or hold Alt and drag)": "Drag from one note to another to link them.",
	"Fade other times instead of hiding them": "Notes outside the chosen date stay on screen, faded.",
	"Levels shown": "How many levels of the chart to draw.",
	"Members": "Show the people in each group.",
	"Group ties": "Draw ties between groups (allies, enemies, vassals…).",
	"People ties": "Draw ties between people.",
	"Timeline": "Show a timeline under the chart.",
	"Group lanes": "How the timeline's lanes are grouped.",
	"Importance": "Hide events below this importance. Higher stays visible when you zoom out.",
};

/** One line in a view's Options panel. */
export type OptionEntry =
	| { type: "heading"; label: string }
	| { type: "toggle"; label: string; get: () => boolean; set: (v: boolean) => void; hint?: string }
	| { type: "choice"; label: string; options: [string, string][]; get: () => string; set: (v: string) => void; hint?: string }
	| { type: "action"; label: string; icon?: string; run: () => void };

let open: { close: () => void } | undefined;

/** Opens UniverseView's settings on a page; set by the views' shell so the panel can link to them. */
let openSettings: ((tab: string) => void) | undefined;
export function setOptionsSettingsOpener(fn: (tab: string) => void) {
	openSettings = fn;
}

/**
 * The "Options" button every view's toolbar uses for what isn't needed at a glance: switches, number
 * boxes and one-off actions. The panel is built when it opens (so a layout's own options show), stays
 * open while you change several things, and closes on a click elsewhere or Esc.
 */
export function optionsButton(parent: HTMLElement, entries: () => OptionEntry[], label = "Options"): HTMLElement {
	const btn = el("button", { cls: "universeview-chip uv-options-btn", title: "Options for this view", attr: { "aria-haspopup": "dialog" } }, parent);
	icon(el("span", { cls: "universeview-chip-icon" }, btn), "sliders-horizontal");
	el("span", { text: label }, btn);
	btn.addEventListener("click", (evt) => {
		evt.stopPropagation();
		if (btn.getAttribute("aria-expanded") === "true") {
			open?.close();
			return;
		}
		open?.close();
		const pop = el("div", { cls: "uv-options universeview-scope", attr: { role: "dialog", "aria-label": "Options" } }, document.body);
		for (const e of entries()) {
			if (e.type === "heading") {
				el("div", { cls: "uv-options-heading", text: e.label }, pop);
				continue;
			}
			if (e.type === "action") {
				const b = el("button", { cls: "uv-options-action" }, pop);
				if (e.icon) icon(el("span", { cls: "universeview-chip-icon" }, b), e.icon);
				el("span", { text: e.label }, b);
				b.addEventListener("click", () => {
					close();
					e.run();
				});
				continue;
			}
			const row = el("label", { cls: "uv-options-row" }, pop);
			const name = el("span", { cls: "uv-options-label", text: e.label }, row);
			const help = e.hint ?? OPTION_HELP[e.label];
			if (help) helpTip(name, help);
			if (e.type === "toggle") {
				const box = el("input", { cls: "uv-options-check", attr: { type: "checkbox" } }, row);
				box.checked = e.get();
				box.addEventListener("change", () => e.set(box.checked));
			} else {
				const sel = el("select", { cls: "dropdown universeview-select" }, row);
				for (const [v, text] of e.options) el("option", { text, attr: { value: v } }, sel);
				sel.value = e.get();
				sel.addEventListener("change", () => e.set(sel.value));
			}
		}
		// A way to the settings this view's options belong with (set on the toolbar by the view's shell).
		const tab = btn.closest<HTMLElement>("[data-uv-settings]")?.dataset.uvSettings;
		if (tab && openSettings) {
			const more = el("button", { cls: "uv-options-action uv-options-settings" }, pop);
			icon(el("span", { cls: "universeview-chip-icon" }, more), "settings");
			el("span", { text: "More settings for this view…" }, more);
			more.addEventListener("click", () => {
				close();
				openSettings?.(tab);
			});
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
