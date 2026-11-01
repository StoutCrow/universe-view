/* Plain-text helpers with no Obsidian dependencies (unit-tested). */

/** A property value as text: strings as they are, numbers and yes/no written out, lists joined with commas, anything else as JSON; nothing → "". */
export function asText(v: unknown): string {
	if (v === undefined || v === null) return "";
	if (typeof v === "string") return v;
	if (typeof v === "number" || typeof v === "boolean" || typeof v === "bigint") return String(v);
	if (Array.isArray(v)) return v.map(asText).join(",");
	if (v instanceof Date) return v.toISOString();
	return JSON.stringify(v) ?? "";
}

/** Plain-text opening of a note: skips frontmatter, headings, callout titles, tables, embeds and inline fields. */
export function excerptOf(md: string, max = 240): string {
	const body = md.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "").replace(/```[\s\S]*?```/g, "").replace(/%%[\s\S]*?%%/g, "");
	const paras: string[] = [];
	let cur: string[] = [];
	const flush = () => {
		if (cur.length) paras.push(cur.join(" "));
		cur = [];
	};
	for (const raw of body.split(/\r?\n/)) {
		let line = raw.trim();
		if (!line) {
			flush();
			continue;
		}
		if (/^#{1,6}\s/.test(line) || /^>\s*\[!/.test(line) || /^\|/.test(line) || /^!\[/.test(line) || /^[-*_]{3,}$/.test(line)) {
			flush();
			continue;
		}
		if (/^[\w ./-]+::/.test(line)) continue;
		line = line.replace(/^>\s?/, "").replace(/^[-*+]\s+/, "").replace(/^\d+\.\s+/, "");
		cur.push(line);
	}
	flush();
	const clean = (s: string) =>
		s
			.replace(/!\[\[[^\]]*\]\]/g, "")
			.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
			.replace(/\[\[([^\]]+)\]\]/g, (_, t: string) => t.split("#")[0].split("/").pop() ?? t)
			.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
			.replace(/(\*\*|__|==|~~|`)/g, "")
			.replace(/(^|\s)[*_]([^*_]+)[*_]/g, "$1$2")
			.replace(/\s+/g, " ")
			.trim();
	const pick = paras.map(clean).find((s) => s.length >= 30 && /[a-z]/i.test(s)) ?? paras.map(clean).find(Boolean) ?? "";
	if (pick.length <= max) return pick;
	const cut = pick.slice(0, max);
	return cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 20)).replace(/[,.;:]$/, "") + "…";
}
