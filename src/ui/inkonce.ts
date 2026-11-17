import type UniverseViewPlugin from "../main";

/** The headings the hand-writing animations write out (the same list as styles-ink.css). */
const HEADINGS = ".universeview-ov-title, .universeview-ov-panel-head h3, .universeview-module-title, .uv-id-name, .universeview-ov-tile-title, .universeview-tl-lane-label, .universeview-insp-section-head span:last-child, .universeview-ep-section-head span:last-child";
/** How long a title that was just written stays written when its view redraws. */
const QUIET_MS = 20000;

/**
 * A view redraws on every change, which would write its titles out again each time. A title that was written in the last
 * few seconds is left as it is the next time it appears; it is written afresh once it has been away a while.
 */
export function keepWrittenOnce(plugin: UniverseViewPlugin) {
	const written = new Map<string, number>();
	const seen = (el: HTMLElement) => {
		const key = `${el.className}|${el.textContent ?? ""}`;
		const at = written.get(key);
		const now = Date.now();
		if (at !== undefined && now - at < QUIET_MS) el.addClass("uv-seen");
		else written.set(key, now);
	};
	const visit = (node: Node) => {
		if (!node.instanceOf(HTMLElement)) return;
		if (node.matches(HEADINGS)) seen(node);
		node.querySelectorAll<HTMLElement>(HEADINGS).forEach(seen);
	};
	const observer = new MutationObserver((changes) => {
		if (!document.body.hasClass("uv-ink")) return;
		for (const c of changes) c.addedNodes.forEach(visit);
	});
	observer.observe(document.body, { childList: true, subtree: true });
	plugin.register(() => observer.disconnect());
}