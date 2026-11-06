import type ChroniclePlugin from "../main";
import { el, iconButton } from "../render/common";

/** One page's arrangement of cards: anything not set keeps the page's own layout. */
export interface CardPrefs {
	order?: string[];
	hidden?: string[];
	/** Columns wide, by card. */
	span?: Record<string, number>;
	/** Height in pixels, by card. */
	height?: Record<string, number>;
	/** Columns on the page; none means as many as fit. */
	columns?: number;
}

/** Narrowest a column gets on its own, and when columns are asked for. */
const MIN_COLUMN = 240;
const MIN_CHOSEN_COLUMN = 180;

/** The nearest box around an element that scrolls. */
function scrollerOf(start: HTMLElement): HTMLElement | undefined {
	for (let e = start.parentElement; e; e = e.parentElement) {
		if (e.scrollHeight > e.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(e).overflowY)) return e;
	}
	return undefined;
}

/**
 * Lets an item be dragged among its neighbours by a handle, moving as the pointer goes. Done with
 * pointer events, not HTML drag and drop: Obsidian has its own use for that, and phones don't fire it.
 */
export function dragToReorder(handle: HTMLElement, item: HTMLElement, items: () => HTMLElement[], done: () => void) {
	handle.addEventListener("pointerdown", (down) => {
		if (down.button !== 0) return;
		// Followed on the document: moving the item in the page would drop a capture on it.
		const doc = handle.ownerDocument;
		const scroller = scrollerOf(item);
		let moved = false;
		const move = (e: PointerEvent) => {
			if (!moved && Math.hypot(e.clientX - down.clientX, e.clientY - down.clientY) < 5) return;
			moved = true;
			e.preventDefault();
			item.addClass("is-moving");
			if (scroller) {
				const box = scroller.getBoundingClientRect();
				if (e.clientY < box.top + 48) scroller.scrollTop -= 14;
				else if (e.clientY > box.bottom - 48) scroller.scrollTop += 14;
			}
			const list = items();
			const over = list.find((x) => {
				const r = x.getBoundingClientRect();
				return x !== item && r.width > 0 && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
			});
			if (!over) return;
			// Past a neighbour going down, it goes after it; going up, before.
			over.parentElement?.insertBefore(item, list.indexOf(item) < list.indexOf(over) ? over.nextSibling : over);
		};
		const up = () => {
			doc.removeEventListener("pointermove", move);
			doc.removeEventListener("pointerup", up);
			doc.removeEventListener("pointercancel", up);
			item.removeClass("is-moving");
			if (!moved) return;
			// The click this drag ends in isn't a click.
			const swallow = (evt: MouseEvent) => evt.stopImmediatePropagation();
			doc.addEventListener("click", swallow, { capture: true, once: true });
			window.setTimeout(() => {
				doc.removeEventListener("click", swallow, { capture: true });
				done();
			}, 0);
		};
		doc.addEventListener("pointermove", move);
		doc.addEventListener("pointerup", up);
		doc.addEventListener("pointercancel", up);
	});
}

/**
 * Lets the cards of a page be hidden, moved and resized. Pages draw their cards as usual, each marked
 * with `data-card` (its id) and `data-title`, then call apply(); `data-span="full"` starts it full width.
 */
export class CardLayout {
	editing = false;
	private grid?: HTMLElement;
	private id = "";
	private bar?: HTMLElement;
	private observer = new ResizeObserver(() => this.fit());

	/** `onToggle`: customising went on or off (the toolbar's button shows it). */
	constructor(private plugin: ChroniclePlugin, private onToggle: () => void) {}

	destroy() {
		this.observer.disconnect();
	}

	toggle() {
		this.editing = !this.editing;
		this.arrange();
		this.onToggle();
	}

	private get prefs(): CardPrefs {
		const all = (this.plugin.settings.cardLayouts ??= {});
		return (all[this.id] ??= {});
	}

	private save() {
		void this.plugin.saveSettings();
		this.arrange();
	}

	private cards(): HTMLElement[] {
		return Array.from(this.grid?.querySelectorAll<HTMLElement>(":scope > [data-card]") ?? []);
	}

	apply(grid: HTMLElement, id: string) {
		this.grid = grid;
		this.id = id;
		this.observer.disconnect();
		this.observer.observe(grid);
		this.arrange();
	}

	private arrange() {
		const grid = this.grid;
		if (!grid) return;
		const p = this.prefs;
		const rank = (c: HTMLElement) => {
			const at = (p.order ?? []).indexOf(c.dataset.card ?? "");
			return at < 0 ? Number.MAX_SAFE_INTEGER : at;
		};
		const cards = this.cards();
		// Cards not yet placed keep the page's own order, after the placed ones.
		cards.forEach((c, i) => (c.dataset.natural ??= String(i)));
		const natural = (c: HTMLElement) => Number(c.dataset.natural);
		[...cards].sort((a, b) => rank(a) - rank(b) || natural(a) - natural(b)).forEach((c) => grid.appendChild(c));
		this.bar?.remove();
		this.bar = undefined;
		grid.toggleClass("is-arranging", this.editing);
		for (const c of cards) {
			c.querySelector(":scope > .uv-card-tools")?.remove();
			c.querySelector(":scope > .uv-card-corner")?.remove();
			c.toggle(!(p.hidden ?? []).includes(c.dataset.card ?? ""));
			const height = p.height?.[c.dataset.card ?? ""];
			c.style.height = height ? `${height}px` : "";
			c.toggleClass("uv-card-sized", !!height);
			if (this.editing) this.tools(c);
		}
		if (this.editing) this.showBar();
		this.fit();
	}

	/** Sets the columns and spans for the width there is. */
	private fit() {
		const grid = this.grid;
		if (!grid?.clientWidth) return;
		const p = this.prefs;
		const room = (min: number) => Math.max(1, Math.floor(grid.clientWidth / min));
		const cols = p.columns ? Math.min(p.columns, room(MIN_CHOSEN_COLUMN)) : room(MIN_COLUMN);
		grid.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
		for (const c of this.cards()) {
			const own = p.span?.[c.dataset.card ?? ""] ?? (c.dataset.span === "full" || c.hasClass("is-wide") ? cols : 1);
			c.style.gridColumn = `span ${Math.min(own, cols)}`;
		}
	}

	private columnWidth(): number {
		const grid = this.grid;
		if (!grid) return MIN_COLUMN;
		return grid.clientWidth / Number(grid.style.gridTemplateColumns.match(/repeat\((\d+)/)?.[1] ?? 1);
	}

	private showBar() {
		const p = this.prefs;
		const bar = (this.bar = el("div", { cls: "uv-cards-bar" }));
		this.grid?.before(bar);
		el("span", { cls: "uv-cards-label", text: "Columns" }, bar);
		const columns = el("select", { cls: "dropdown", attr: { "aria-label": "Columns" } }, bar);
		for (const [v, label] of [["0", "As many as fit"], ["1", "1"], ["2", "2"], ["3", "3"], ["4", "4"]]) columns.add(new Option(label, v));
		columns.value = String(p.columns ?? 0);
		columns.addEventListener("change", () => {
			p.columns = Number(columns.value) || undefined;
			this.save();
		});
		const hidden = this.cards().filter((c) => (p.hidden ?? []).includes(c.dataset.card ?? ""));
		if (hidden.length) el("span", { cls: "uv-cards-label", text: "Hidden" }, bar);
		for (const c of hidden) {
			const b = el("button", { cls: "uv-cards-hidden", text: c.dataset.title ?? "", attr: { title: "Show this card" } }, bar);
			b.addEventListener("click", () => {
				p.hidden = (p.hidden ?? []).filter((x) => x !== c.dataset.card);
				this.save();
			});
		}
		el("span", { cls: "uv-cards-gap" }, bar);
		el("button", { text: "Reset" }, bar).addEventListener("click", () => {
			delete this.plugin.settings.cardLayouts?.[this.id];
			this.save();
		});
		el("button", { cls: "mod-cta", text: "Done" }, bar).addEventListener("click", () => this.toggle());
	}

	private tools(c: HTMLElement) {
		const id = c.dataset.card ?? "";
		const p = this.prefs;
		const tools = el("div", { cls: "uv-card-tools" }, c);
		const grip = iconButton(tools, "grip-vertical", "Drag to move", () => {});
		grip.addClass("uv-card-grip");
		dragToReorder(grip, c, () => this.cards(), () => {
			p.order = this.cards().map((x) => x.dataset.card ?? "");
			this.save();
		});
		iconButton(tools, "eye-off", "Hide this card", () => {
			p.hidden = [...(p.hidden ?? []), id];
			this.save();
		});
		// The corner resizes: across in whole columns, down in pixels.
		const corner = el("div", { cls: "uv-card-corner", attr: { role: "separator", "aria-label": "Resize this card" } }, c);
		corner.addEventListener("pointerdown", (down) => {
			down.preventDefault();
			corner.setPointerCapture(down.pointerId);
			const box = c.getBoundingClientRect();
			const column = this.columnWidth();
			const move = (e: PointerEvent) => {
				(p.span ??= {})[id] = Math.max(1, Math.round((e.clientX - box.left) / column));
				(p.height ??= {})[id] = Math.round(Math.max(90, e.clientY - box.top));
				c.style.height = `${p.height[id]}px`;
				c.addClass("uv-card-sized");
				this.fit();
			};
			const up = () => {
				corner.removeEventListener("pointermove", move);
				corner.removeEventListener("pointerup", up);
				void this.plugin.saveSettings();
			};
			corner.addEventListener("pointermove", move);
			corner.addEventListener("pointerup", up);
		});
	}
}
