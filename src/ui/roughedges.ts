/** Hand-drawn edges, each one different: every frame the Hand-drawn edge style draws gets its own random wobble. */
const SEL = ".chronicle-module, .chronicle-ov-panel, button.chronicle-ov-tile, .chronicle-dash-card, .uv-options, .chronicle-hovercard";
const rnd = (lo: number, hi: number) => Math.round((lo + Math.random() * (hi - lo)) * 10) / 10;

let observer: MutationObserver | undefined;
let queued = false;
const waiting = new Set<Element>();

function roughen(node: HTMLElement) {
	if (node.dataset.uvRough) return;
	node.dataset.uvRough = "1";
	const r = Array.from({ length: 8 }, () => rnd(3, 22));
	node.setCssProps({ "--uve-r": `${r[0]}px ${r[1]}px ${r[2]}px ${r[3]}px / ${r[4]}px ${r[5]}px ${r[6]}px ${r[7]}px`, "--uve-bw": `${rnd(1.2, 2.3)}px` });
}

function scan(root: Element) {
	if (root.matches(SEL)) roughen(root as HTMLElement);
	root.querySelectorAll<HTMLElement>(SEL).forEach(roughen);
}

/** Starts or stops giving new and existing frames their own wobble. */
export function setRoughEdges(on: boolean) {
	if (on) {
		if (observer) return;
		scan(document.body);
		observer = new MutationObserver((changes) => {
			for (const c of changes) c.addedNodes.forEach((n) => n instanceof Element && waiting.add(n));
			if (queued) return;
			queued = true;
			requestAnimationFrame(() => {
				queued = false;
				waiting.forEach(scan);
				waiting.clear();
			});
		});
		observer.observe(document.body, { childList: true, subtree: true });
		return;
	}
	observer?.disconnect();
	observer = undefined;
	waiting.clear();
	document.querySelectorAll<HTMLElement>("[data-uv-rough]").forEach((node) => {
		delete node.dataset.uvRough;
		node.setCssProps({ "--uve-r": "", "--uve-bw": "" });
	});
}