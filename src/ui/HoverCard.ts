import { Keymap, TFile } from "obsidian";
import type UniverseViewPlugin from "../main";
import type { Entity, Ref } from "../types";
import { occupationsByLand } from "../index/wars";
import { formatDate, formatSpan, yearsBetween } from "../dates/parser";
import { GROUP_KINDS, groupKind } from "../render/houses";
import { ROW_INFO } from "../index/membership";
import { personTitle } from "../render/rulertitle";
import { groupsByRow } from "./groupsplit";
import { TYPE_ICONS, TYPE_LABELS, el, entityColor, icon, iconButton, openEntity, ownershipLines, resourceUrl, svg } from "../render/common";
import { excerptOf } from "../index/text";
import { totalPopulation } from "../index/tidy";
import { miniMap } from "./minimap";

interface Excerpt {
	mtime: number;
	text: string;
	image?: string;
}

const IMAGE_EXT = /\.(png|jpe?g|webp|gif|avif|svg)$/i;

/**
 * Hover cards: a quick, smart summary of a note (dates, age, family, where it is, what happened
 * there, the opening of the note) shown when the pointer rests on it in any UniverseView view.
 * Ctrl/Cmd-hover still opens Obsidian's own Page Preview instead.
 */
/** Above windows that themes push up high (some set Obsidian's own to 1000+). */
const CARD_Z = 10000;

export class HoverCards {
	private card?: HTMLElement;
	private showTimer = 0;
	private hideTimer = 0;
	private anchor?: Element;
	private key?: string;
	private excerpts = new Map<string, Excerpt>();
	/** The note each item with a card stands for, so Alt+click can open it in the inspector wherever it is. */
	private keys = new WeakMap<Element, () => string>();
	/** Cards pinned in place (by the pin button, or by dragging them); they stay until closed. */
	private pinned: HTMLElement[] = [];
	private z = 0;

	constructor(private plugin: UniverseViewPlugin) {
		const hideNow = () => this.hide(true);
		plugin.registerDomEvent(window, "wheel", (evt) => {
			// Only an open card closes on a scroll. A card still on its way is left alone: a trackpad keeps sending
			// small scroll events after you stop, and they would cancel it just as the ring fills.
			if (this.card && !(evt.target as Element)?.closest?.(".universeview-hovercard")) hideNow();
		}, { passive: true });
		plugin.registerDomEvent(window, "keydown", (evt) => {
			if (evt.key === "Escape") {
				if (this.card) hideNow();
				else this.unpin(this.pinned[this.pinned.length - 1]);
				return;
			}
			// Shortcuts for the open card, unless you're typing somewhere.
			const card = this.card;
			const key = this.key;
			if (!card || !key || evt.ctrlKey || evt.metaKey || evt.altKey) return;
			if ((evt.target as Element)?.closest?.("input, textarea, [contenteditable='true'], .cm-editor")) return;
			const run: Record<string, () => void> = {
				p: () => this.pin(card),
				i: () => void plugin.inspect(key),
				e: () => void plugin.inspect(key, "edit"),
				o: () => openEntity(plugin, key),
			};
			const f = run[evt.key.toLowerCase()];
			if (!f) return;
			evt.preventDefault();
			if (evt.key.toLowerCase() !== "p") this.hide(true);
			f();
		});
		// A context menu wins: right-clicking cancels a card that's on its way and closes one that's open.
		plugin.registerDomEvent(window, "contextmenu", (evt) => {
			if (!this.card?.contains(evt.target as Node)) hideNow();
		}, { capture: true });
		plugin.registerDomEvent(window, "pointerdown", (evt) => {
			if (!this.card?.contains(evt.target as Node)) hideNow();
		});
		// Alt+click on anything with a hover card (a card, a pin, a bar, a row…) opens it in the inspector: one way in, everywhere.
		plugin.registerDomEvent(document, "click", (evt) => {
			if (!evt.altKey || evt.ctrlKey || evt.metaKey || evt.shiftKey) return;
			let node = (evt.target as Node | null)?.instanceOf(Element) ? (evt.target as Element) : null;
			if (node?.closest(".is-tool, .universeview-hovercard, input, textarea, select")) return;
			while (node) {
				const key = this.keys.get(node)?.();
				if (key && plugin.index.get(key)) {
					evt.preventDefault();
					evt.stopImmediatePropagation();
					this.hide(true);
					void plugin.inspect(key);
					return;
				}
				node = node.parentElement;
			}
		}, { capture: true });
		plugin.registerDomEvent(window, "pointermove", (evt) => {
			this.px = evt.clientX;
			this.py = evt.clientY;
		}, { passive: true });
		plugin.register(() => {
			this.hide(true);
			this.pinned.splice(0).forEach((c) => c.remove());
		});
	}

	/** Keeps a card open where it is; a hover card over it then opens on top (cards stack). */
	private pin(card: HTMLElement) {
		if (card.hasClass("is-pinned")) return;
		card.addClass("is-pinned");
		if (this.card === card) {
			this.card = undefined;
			this.anchor = undefined;
			this.key = undefined;
		}
		this.pinned.push(card);
	}

	private unpin(card?: HTMLElement) {
		if (!card) return;
		this.pinned = this.pinned.filter((c) => c !== card);
		card.removeClass("is-visible");
		window.setTimeout(() => card.remove(), 220);
	}

	/** Drag a card by any empty part of it; dragging pins it. */
	private makeMovable(card: HTMLElement) {
		card.addEventListener("pointerdown", (evt) => {
			if (evt.button !== 0 || (evt.target as Element).closest("a, button, input, textarea, select")) return;
			evt.preventDefault();
			const x0 = evt.clientX - card.offsetLeft;
			const y0 = evt.clientY - card.offsetTop;
			let moved = false;
			card.style.zIndex = String(CARD_Z + ++this.z);
			const move = (m: PointerEvent) => {
				if (!moved && Math.hypot(m.clientX - evt.clientX, m.clientY - evt.clientY) < 4) return;
				if (!moved) {
					moved = true;
					this.pin(card);
					card.addClass("is-dragging");
				}
				card.style.left = `${Math.max(0, Math.min(window.innerWidth - 60, m.clientX - x0))}px`;
				card.style.top = `${Math.max(0, Math.min(window.innerHeight - 40, m.clientY - y0))}px`;
			};
			const up = () => {
				card.removeClass("is-dragging");
				window.removeEventListener("pointermove", move);
				window.removeEventListener("pointerup", up);
			};
			window.addEventListener("pointermove", move);
			window.addEventListener("pointerup", up);
		});
	}

	/** Shows the card for `key` when the pointer rests on `target`. */
	attach(target: Element, key: string | (() => string)) {
		this.keys.set(target, typeof key === "function" ? key : () => key);
		target.addEventListener("mouseenter", (evt) => this.schedule(target, typeof key === "function" ? key() : key, evt as MouseEvent));
		target.addEventListener("mouseleave", () => this.scheduleHide());
		// A card closed by a scroll, a click or a key while the pointer stays on a big item (a whole
		// territory) would never come back, since the pointer never "enters" again: moving on over the
		// item, a little way from where it closed, brings it back.
		target.addEventListener("mousemove", (evt) => {
			const m = evt as MouseEvent;
			if (this.showTimer || (this.card && this.anchor === target)) return;
			if (Math.hypot(m.clientX - this.closedAt[0], m.clientY - this.closedAt[1]) < 12) return;
			this.schedule(target, typeof key === "function" ? key() : key, m);
		});
	}

	/** Where the pointer was when a card last closed, so it doesn't spring straight back. */
	private closedAt: [number, number] = [-99, -99];

	/** One-off version for elements created by others (links in notes). */
	hoverOnce(target: Element, key: string, evt: MouseEvent) {
		this.keys.set(target, () => key);
		if (this.anchor === target) return;
		this.schedule(target, key, evt);
		// Moving from one item to the next, the browser fires the new item's mouseover before the old one's
		// mouseleave: a leave from an item that is no longer the one waiting must not cancel the new one.
		target.addEventListener("mouseleave", () => {
			if (this.pending && this.pending !== target) return;
			this.scheduleHide();
		}, { once: true });
	}

	/** Pointer movement over an item with no card open or on its way (one a click or scroll just closed): a little way on, it comes back. */
	nudge(target: Element, key: string, evt: MouseEvent) {
		if (this.showTimer || (this.card && this.anchor === target)) return;
		if (Math.hypot(evt.clientX - this.closedAt[0], evt.clientY - this.closedAt[1]) < 12) return;
		this.schedule(target, key, evt);
	}

	/** The item a card is currently on its way for. */
	private pending?: Element;

	private schedule(target: Element, key: string, evt: MouseEvent) {
		if (!this.plugin.settings.hoverCards || Keymap.isModEvent(evt)) return;
		// No cards over a map while a tool runs there (drawing, filling), or a tree during a drag: they'd cover the work.
		if (target.closest?.(".is-tool, .is-dragging")) return;
		// Moving onto something else lets the open card close as usual; only coming back to its own
		// item (or onto the card) keeps it.
		const sameItem = target === this.anchor || !!this.card?.contains(target);
		if (sameItem) window.clearTimeout(this.hideTimer);
		window.clearTimeout(this.showTimer);
		// Every item waits its full delay (with the ring), unless switching straight from one card to
		// the next is turned on in the settings. Alt opens it at once.
		const swap = this.plugin.settings.hoverSwapFast === true && !!this.card?.hasClass("is-visible");
		const delay = swap || evt.altKey ? 60 : Math.max(0, this.plugin.settings.hoverDelay);
		this.pending = target;
		this.startRing(target, evt, delay);
		this.showTimer = window.setTimeout(() => {
			this.showTimer = 0;
			this.pending = undefined;
			this.stopRing();
			// A view that redraws while you wait (hover highlights, live updates) replaces the item; if the
			// pointer is still where it started, the card still belongs there.
			if (!target.isConnected && Math.hypot(this.px - evt.clientX, this.py - evt.clientY) > 40) return;
			this.show(target, key);
		}, delay);
	}

	/**
	 * A little ring by the pointer that fills up while a card is on its way (like a strategy game's
	 * tooltip timer), so you can see it coming and move off or click before it opens.
	 */
	private ring?: HTMLElement;
	private ringMove?: (evt: MouseEvent) => void;
	private ringTarget?: Element;

	private startRing(target: Element, evt: MouseEvent, delay: number) {
		this.stopRing();
		if (delay < 200 || this.plugin.settings.hoverRing === false) return;
		const ring = document.body.createDiv({ cls: "universeview-hover-ring" });
		const ringSvg = svg("svg", { viewBox: "0 0 20 20" }, ring);
		svg("circle", { class: "universeview-hover-ring-track", cx: 10, cy: 10, r: 7 }, ringSvg);
		svg("circle", { class: "universeview-hover-ring-fill", cx: 10, cy: 10, r: 7 }, ringSvg);
		ring.style.setProperty("--ring-ms", `${delay}ms`);
		const place = (m: MouseEvent) => {
			ring.style.left = `${m.clientX + 14}px`;
			ring.style.top = `${m.clientY + 14}px`;
		};
		place(evt);
		this.ring = ring;
		this.ringMove = place;
		this.ringTarget = target;
		target.addEventListener("mousemove", place);
		// Start filling on the next frame, so the transition runs from empty.
		window.setTimeout(() => ring.addClass("is-filling"), 16);
	}

	private stopRing() {
		if (this.ringTarget && this.ringMove) this.ringTarget.removeEventListener("mousemove", this.ringMove);
		this.ring?.remove();
		this.ring = undefined;
		this.ringMove = undefined;
		this.ringTarget = undefined;
	}

	private scheduleHide() {
		window.clearTimeout(this.showTimer);
		this.showTimer = 0;
		this.pending = undefined;
		window.clearTimeout(this.hideTimer);
		this.stopRing();
		const wait = Math.max(260, this.plugin.settings.hoverHideDelay ?? 180);
		const attempt = () => {
			// Still on its item, on the card, or crossing the gap between them (the card may be fading
			// in and not yet catching the pointer): keep it, and look again shortly.
			if (this.card && this.pointerNear()) {
				this.hideTimer = window.setTimeout(attempt, 150);
				return;
			}
			// The pointer has already moved on to another item whose card is on its way: close this card, but leave
			// that one alone (this timer is the old item's, and must not cancel the new one's).
			this.hide(false, !!this.pending);
		};
		this.hideTimer = window.setTimeout(attempt, wait);
	}

	/** Where the pointer last was, for deciding whether a card is still wanted. */
	private px = -1;
	private py = -1;

	/** Whether the pointer is over the open card, its item, or the strip between the two. */
	private pointerNear(): boolean {
		const card = this.card;
		if (!card || this.px < 0) return false;
		const inside = (r: DOMRect, pad: number) => this.px >= r.left - pad && this.px <= r.right + pad && this.py >= r.top - pad && this.py <= r.bottom + pad;
		const c = card.getBoundingClientRect();
		if (inside(c, 6)) return true;
		const a = this.anchor?.isConnected ? this.anchor.getBoundingClientRect() : undefined;
		if (!a || !a.width) return false;
		if (inside(a, 2)) return true;
		// The gap: the box spanning the item and the card, narrowed to where they overlap sideways.
		const left = Math.max(Math.min(a.left, c.left), Math.max(a.left, c.left) - 24);
		const right = Math.min(Math.max(a.right, c.right), Math.min(a.right, c.right) + 24);
		const top = Math.min(a.bottom, c.bottom);
		const bottom = Math.max(a.top, c.top);
		return this.px >= left && this.px <= right && this.py >= Math.min(top, bottom) - 2 && this.py <= Math.max(top, bottom) + 2;
	}

	hide(immediate = false, keepPending = false) {
		if (!keepPending) {
			window.clearTimeout(this.showTimer);
			this.showTimer = 0;
			this.pending = undefined;
			this.stopRing();
		}
		window.clearTimeout(this.hideTimer);
		this.closedAt = [this.px, this.py];
		const card = this.card;
		if (!card) return;
		this.card = undefined;
		this.anchor = undefined;
		this.key = undefined;
		card.removeClass("is-visible");
		if (immediate) card.remove();
		else window.setTimeout(() => card.remove(), 220);
	}

	private show(target: Element, key: string, retry = true) {
		const e = this.plugin.index.get(key);
		if (!e) {
			// The index can be rebuilding at that instant (a sync, an edit): look once more shortly instead of dropping the card.
			if (retry) window.setTimeout(() => this.show(target, key, false), 250);
			return;
		}
		if (this.key === key && this.anchor === target && this.card) return;
		// Hovering a link inside the open card keeps that card (pinned) and stacks the new one on top.
		if (this.card?.contains(target)) this.pin(this.card);
		this.hide(true);
		this.anchor = target;
		this.key = key;
		const card = el("div", { cls: "universeview-hovercard universeview-scope" }, document.body);
		card.style.setProperty("--card-accent", entityColor(this.plugin, e));
		this.card = card;
		try {
			this.fill(card, e);
		} catch (err) {
			// One odd note must not leave a ring that fills and then nothing: show the name, and say why in the console.
			console.error("UniverseView: hover card failed for", key, err);
			card.empty();
			const head = el("div", { cls: "universeview-hc-head" }, card);
			const name = el("a", { cls: "universeview-hc-name", text: e.name }, head);
			name.addEventListener("click", (evt) => {
				this.hide(true);
				openEntity(this.plugin, e.key, evt);
			});
		}
		card.addEventListener("mouseenter", () => window.clearTimeout(this.hideTimer));
		card.addEventListener("mouseleave", () => this.scheduleHide());
		card.style.zIndex = String(CARD_Z + ++this.z);
		const tools = el("div", { cls: "universeview-hc-tools" }, card);
		// A handle to show it can be dragged (any empty part works too).
		const grip = el("span", { cls: "universeview-hc-grip", attr: { "aria-label": "Drag to move (keeps the card open)" } }, tools);
		icon(grip, "grip-horizontal");
		const tool = (ic: string, label: string, run: () => void) => {
			const b = el("button", { cls: "clickable-icon", attr: { "aria-label": label } }, tools);
			icon(b, ic);
			b.addEventListener("click", () => {
				this.hide(true);
				run();
			});
		};
		// One button for the inspector, which reads and edits (I or E).
		tool("panel-right", "Inspect (I), or Alt+click anything", () => void this.plugin.inspect(key));
		const pinBtn = el("button", { cls: "clickable-icon universeview-hc-pin", attr: { "aria-label": "Keep this card open (P, or drag it)" } }, tools);
		icon(pinBtn, "pin");
		pinBtn.addEventListener("click", () => this.pin(card));
		const close = el("button", { cls: "clickable-icon universeview-hc-close", attr: { "aria-label": "Close" } }, tools);
		icon(close, "x");
		close.addEventListener("click", () => (card.hasClass("is-pinned") ? this.unpin(card) : this.hide()));
		this.makeMovable(card);
		this.position(card, target);
		// Fades in first; only once it's fully there can it be clicked, so a click meant for what's
		// under it doesn't land on a half-visible card.
		window.setTimeout(() => card.addClass("is-visible"), 16);
		window.setTimeout(() => card.addClass("is-interactive"), Math.max(0, this.plugin.settings.hoverFadeMs ?? 220) + 10);
	}

	private position(card: HTMLElement, target: Element) {
		let r = target.getBoundingClientRect();
		// A big item (a territory, a lane, a whole row) would put the card far from the pointer, or off screen:
		// the card follows the pointer instead.
		if (!target.isConnected || r.width > 220 || r.height > 120) {
			const x = this.px >= 0 ? this.px : r.left;
			const y = this.py >= 0 ? this.py : r.top;
			r = new DOMRect(x - 12, y - 8, 24, 16);
		}
		const cw = card.offsetWidth || 320;
		const ch = card.offsetHeight || 200;
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		const gap = 10;
		let top = r.bottom + gap;
		let placement = "below";
		if (top + ch > vh - 8 && r.top - gap - ch > 8) {
			top = r.top - gap - ch;
			placement = "above";
		}
		top = Math.max(8, Math.min(top, vh - ch - 8));
		let left = r.left + Math.min(r.width, 40) / 2 - 24;
		left = Math.max(8, Math.min(left, vw - cw - 8));
		card.style.top = `${top}px`;
		card.style.left = `${left}px`;
		card.dataset.placement = placement;
	}

	// ---- Content ---------------------------------------------------------------------------------

	/** The card's content (also used by the inspector panel). */
	fill(card: HTMLElement, e: Entity) {
		const p = this.plugin;
		const head = el("div", { cls: "universeview-hc-head" }, card);
		const thumb = el("div", { cls: "universeview-hc-thumb" }, head);
		const imgUrl = resourceUrl(p, e.image ?? e.logo);
		if (imgUrl) el("img", { attr: { src: imgUrl, alt: "" } }, thumb);
		else this.glyph(thumb, e);
		const titles = el("div", { cls: "universeview-hc-titles" }, head);
		const kindLabel = e.type === "culture" ? GROUP_KINDS[groupKind(p, e)].label : TYPE_LABELS[e.type];
		const eyebrow = [kindLabel, e.category && e.category.toLowerCase() !== kindLabel.toLowerCase() ? cap(e.category) : ""].filter(Boolean).join(" · ");
		el("div", { cls: "universeview-hc-eyebrow", text: eyebrow }, titles);
		const name = el("a", { cls: "universeview-hc-name", text: e.name }, titles);
		name.addEventListener("click", (evt) => {
			this.hide(true);
			openEntity(p, e.key, evt);
		});
		const sub = this.subtitle(e);
		if (sub) el("div", { cls: "universeview-hc-sub", text: sub }, titles);
		// Parts left out in Settings → Hover cards.
		const hide = new Set(p.settings.hoverHide ?? []);
		// A title: who it's under and who holds it.
		if ((e.type === "place" || e.type === "culture") && !hide.has("owner")) ownershipLines(p, card, e.key, undefined, "universeview-owner universeview-hc-owner");
		// Where it lies, as a small outline.
		if ((e.type === "place" || e.type === "culture") && p.settings.hoverMiniMap !== false && !hide.has("map")) miniMap(p, card, e);

		const facts = hide.has("facts") ? [] : this.facts(e);
		if (facts.length) {
			const dl = el("div", { cls: "universeview-hc-facts" }, card);
			for (const [label, value] of facts) {
				el("div", { cls: "universeview-hc-label", text: label }, dl);
				const dd = el("div", { cls: "universeview-hc-value" }, dl);
				if (typeof value === "string") dd.setText(value);
				else this.links(dd, value);
			}
		}

		const excerpt = el("div", { cls: "universeview-hc-excerpt" }, card);
		if (hide.has("excerpt")) excerpt.remove();
		else if (e.summary) excerpt.setText(e.summary);
		else {
			excerpt.addClass("is-loading");
			void this.loadExcerpt(e).then((x) => {
				excerpt.removeClass("is-loading");
				if (!x?.text) excerpt.remove();
				else excerpt.setText(x.text);
				if (x?.image && !imgUrl && card.isConnected) {
					const url = resourceUrl(p, x.image);
					if (url) {
						thumb.empty();
						thumb.removeClass("is-glyph");
						el("img", { attr: { src: url, alt: "" } }, thumb);
					}
				}
				if (this.anchor && card.isConnected) this.position(card, this.anchor);
			});
		}

		const chips = [...e.tags.filter((t) => !/^(person|character|event|place|culture|map)$/i.test(t)).slice(0, 4).map((t) => "#" + t)];
		if (e.issues.length) chips.push(`⚠ ${e.issues.length} issue${e.issues.length === 1 ? "" : "s"}`);
		if (chips.length && !hide.has("tags")) {
			const row = el("div", { cls: "universeview-hc-tags" }, card);
			for (const c of chips) el("span", { cls: "universeview-hc-tag" + (c.startsWith("⚠") ? " is-warning" : ""), text: c }, row);
		}

		const actions = el("div", { cls: "universeview-hc-actions" }, card);
		if (hide.has("actions")) actions.addClass("is-hidden");
		const act = (iconName: string, label: string, run: () => void) =>
			iconButton(actions, iconName, label, () => {
				this.hide(true);
				run();
			});
		act("file-text", "Open note", () => openEntity(p, e.key));
		act("separator-vertical", "Open to the right", () => {
			const f = p.app.vault.getAbstractFileByPath(e.key);
			if (f instanceof TFile) void p.app.workspace.getLeaf("split").openFile(f);
		});
		if (e.start || e.end) act("calendar-range", "Show on timeline", () => void p.openTimeline({ focus: e.key }));
		if (e.type === "person") act("git-fork", "Family tree", () => void p.openFamilyTree(e.key));
		if (e.type === "culture") act("git-branch", "Lineage", () => void p.openLineage(e.key));
		if (e.type === "place" || e.type === "map" || e.places.length || e.territories.length) act("map", "Show on map", () => void p.openMap(e.key));
		act("waypoints", "Connections", () => void p.openNetwork(e.key));
		// Fix a date, the kind, the size or the names without opening the note.
		act("panel-right", "Inspect", () => void p.inspect(e.key));
	}

	private glyph(thumb: HTMLElement, e: Entity) {
		thumb.addClass("is-glyph");
		const ic = e.icon;
		if (ic && !/^[a-z0-9-]+$/.test(ic)) thumb.setText(ic);
		else if (e.type === "person") thumb.setText(initials(e.name));
		else icon(thumb, ic ?? TYPE_ICONS[e.type]);
	}

	private links(parent: HTMLElement, refs: Ref[]) {
		const shown = refs.slice(0, 3);
		shown.forEach((r, i) => {
			if (i) parent.append(", ");
			const a = el("a", { cls: "universeview-hc-link" + (r.resolved ? "" : " is-unresolved"), text: r.name }, parent);
			if (r.resolved) this.attach(a, r.key);
			a.addEventListener("click", (evt) => {
				this.hide(true);
				if (r.resolved) openEntity(this.plugin, r.key, evt);
			});
		});
		if (refs.length > shown.length) el("span", { cls: "universeview-hc-more", text: ` +${refs.length - shown.length}` }, parent);
	}

	private subtitle(e: Entity): string {
		const cal = this.plugin.calendars.get(e.calendar);
		const span = formatSpan(e.start, e.end, cal);
		const parts: string[] = [];
		if (span) parts.push(span);
		if (e.start && e.end) {
			const d = duration(e.start.start, e.end.end, cal);
			const age = yearsBetween(e.start.start, e.end.start, cal);
			if (e.type === "person") {
				if (age >= 0) parts.push(`aged ${age}`);
			} else if (d) parts.push(d);
		}
		return parts.join(" · ");
	}

	/** The handful of facts that matter most for this kind of note. */
	private facts(e: Entity): [string, string | Ref[]][] {
		const p = this.plugin;
		const idx = p.index;
		const ref =(k: string): Ref => ({ key: k, name: idx.get(k)?.name ?? k.replace(/^\?/, ""), resolved: !!idx.get(k) });
		const out: [string, string | Ref[]][] = [];
		const add = (label: string, v: string | Ref[] | undefined) => {
			if (v && v.length) out.push([label, v]);
		};
		const cultures = e.cultures.map((c) => (c.role ? { ...c.ref, name: `${c.ref.name} (${c.role})` } : c.ref));
		switch (e.type) {
			case "person": {
				// What they hold, as on their family tree card: "Queen of England", with how she is addressed.
				const held = personTitle(p, e);
				if (held) add("Title", [held.lead || held.titles.slice(0, 2).join(", "), held.address].filter(Boolean).join(" · "));
				if (e.birthPlace) add("Born in", [e.birthPlace]);
				if (e.deathPlace) add("Died in", [e.deathPlace]);
				add("Parents", e.parents);
				add("Partners", idx.partners(e.key).map((x) => x.ref));
				add("Children", idx.children(e.key).map(ref));
				add("Siblings", idx.siblings(e.key).map(ref));
				// What they belong to, by question: realm, house, culture, faith, organisation.
				for (const [row, refs] of groupsByRow(p, e.cultures)) add(ROW_INFO[row].label, refs.map((c) => (c.role ? { ...c.ref, name: `${c.ref.name} (${c.role})` } : c.ref)));
				const rel = idx.relationsOf.get(e.key)?.filter((r) => r.kind) ?? [];
				for (const r of rel.slice(0, 2)) add(cap(r.kind!), [r.ref]);
				break;
			}
			case "event": {
				add("Where", e.places);
				add("Who", e.participants);
				add("Sides", cultures);
				const [prev, next] = this.neighbours(e);
				if (prev) add("Before", [ref(prev.key)]);
				if (next) add("After", [ref(next.key)]);
				break;
			}
			case "culture": {
				const members = idx.members(e.key).filter((m) => idx.get(m.key)?.type === "person");
				const leaders = (idx.relationsOf.get(e.key) ?? []).filter((r) => /ruler|leader|head|monarch|founder|king|queen|lord/i.test(r.kind ?? ""));
				add("Led by", leaders.map((r) => r.ref));
				add("Members", members.length ? members.map((m) => ref(m.key)) : undefined);
				add("Descends from", e.parentCultures);
				add("Branches", [...(idx.childCulturesOf.get(e.key) ?? [])].map(ref));
				add("Seat", e.places);
				add("Part of", cultures);
				add("Occupied by", occupationsByLand(idx).get(e.key)?.map((o) => o.by));
				break;
			}
			case "place": {
				const chain: Ref[] = [];
				let cur = e.locatedIn;
				for (let i = 0; cur && i < 4; i++) {
					chain.push(cur);
					cur = idx.get(cur.key)?.locatedIn;
				}
				add("Located in", chain);
				const pop = totalPopulation(idx, e.key);
				if (pop) add("Population", `${pop.total.toLocaleString()}${pop.counted > 1 ? ` in ${pop.counted} places` : ""}`);
				add("Held by", cultures);
				add("Occupied by", occupationsByLand(idx).get(e.key)?.map((o) => o.by));
				const subs = [...(idx.subPlacesOf.get(e.key) ?? [])].map(ref);
				add("Contains", subs);
				const born = idx.all("person").filter((x) => x.birthPlace?.key === e.key).map((x) => ref(x.key));
				add("Born here", born);
				if (e.map) add("Map", [e.map]);
				else if (e.coords) add("Coordinates", e.coords.map((n) => n.toFixed(3)).join(", "));
				break;
			}
			case "map": {
				const n = idx.placesOnMap.get(e.key)?.size ?? 0;
				add("Places", n ? `${n} place${n === 1 ? "" : "s"} pinned` : "No places pinned yet");
				break;
			}
		}
		// Secrets: who knows about this, or what this person knows.
		const knownTo = [...idx.knowledgeOf.entries()].filter(([, list]) => list.some((k) => k.ref.key === e.key)).map(([k]) => ref(k));
		if (knownTo.length) add("Known to", knownTo);
		const knows = idx.knowledgeOf.get(e.key) ?? [];
		if (knows.length) add("Knows about", knows.map((k) => k.ref));
		// What happened here / to them, most recent first.
		if (e.type !== "event" && e.type !== "map") {
			const evs = idx.events(e.key).filter((x) => x.type === "event").sort((a, b) => (b.start?.start ?? 0) - (a.start?.start ?? 0));
			if (evs.length) {
				const last = evs[0];
				const when = formatDate(last.start, p.calendars.get(last.calendar));
				add(`Events (${evs.length})`, [{ key: last.key, name: when ? `${last.name}, ${when}` : last.name, resolved: true }, ...evs.slice(1).map((x) => ref(x.key))]);
			}
		}
		return out.slice(0, 7);
	}

	/** The events just before and after this one in the same world. */
	private neighbours(e: Entity): [Entity | undefined, Entity | undefined] {
		if (!e.start) return [undefined, undefined];
		const top = e.path.includes("/") ? e.path.split("/")[0] + "/" : "";
		const list = this.plugin.index
			.all("event")
			.filter((x) => x.start && (!top || x.path.startsWith(top)))
			.sort((a, b) => a.start!.start - b.start!.start || a.name.localeCompare(b.name));
		const i = list.findIndex((x) => x.key === e.key);
		return [list[i - 1], list[i + 1]];
	}

	/** First real paragraph of the note, and its first embedded image. */
	private async loadExcerpt(e: Entity): Promise<Excerpt | undefined> {
		const f = e.file;
		const cached = this.excerpts.get(e.key);
		if (cached && cached.mtime === f.stat.mtime) return cached;
		let text = "";
		try {
			text = await this.plugin.app.vault.cachedRead(f);
		} catch {
			return undefined;
		}
		const result: Excerpt = { mtime: f.stat.mtime, text: excerptOf(text) };
		const img = text.match(/!\[\[([^\]|#]+?\.(?:png|jpe?g|webp|gif|avif|svg))(?:[|#][^\]]*)?\]\]/i) ?? text.match(/!\[[^\]]*\]\(([^)\s]+)\)/);
		if (img) {
			const target = decodeURI(img[1]);
			if (/^https?:/.test(target)) result.image = target;
			else if (IMAGE_EXT.test(target)) {
				const dest = this.plugin.app.metadataCache.getFirstLinkpathDest(target, f.path);
				if (dest) result.image = dest.path;
			}
		}
		this.excerpts.set(e.key, result);
		return result;
	}
}

function cap(s: string): string {
	return s.charAt(0).toUpperCase() + s.slice(1);
}

function initials(name: string): string {
	return name
		.split(/\s+/)
		.filter((w) => /^[A-Za-zÀ-ÿ]/.test(w))
		.slice(0, 2)
		.map((w) => w[0].toUpperCase())
		.join("");
}

/** "3 days", "5 months", "312 years". */
export function duration(a: number, b: number, cal: { fromDays(d: number): { y: number; m: number; d: number } }): string {
	const days = b - a;
	if (days < 1) return "";
	if (days < 60) return `${Math.round(days)} day${Math.round(days) === 1 ? "" : "s"}`;
	if (days < 730) {
		const m = Math.round(days / 30.44);
		return `${m} month${m === 1 ? "" : "s"}`;
	}
	const y = cal.fromDays(b).y - cal.fromDays(a).y;
	return `${y} year${y === 1 ? "" : "s"}`;
}
