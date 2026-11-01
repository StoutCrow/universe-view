// Reading the changelog (CHANGELOG.md): its versions, newest first, for the What's new panel. Pure, so it's testable.

export interface ChangelogEntry {
	/** "1.0.0", or a range heading such as "0.25.0 – 0.25.5". */
	version: string;
	/** The heading's text after the version (its date). */
	date: string;
	/** The entry's Markdown, without its heading. */
	body: string;
}

const versionOf = (v: string) => v.split(/[^\d.]/)[0];
/** Compares two versions ("0.9.0" < "0.10.0"); a range heading counts as its first version. */
export function compareVersions(a: string, b: string): number {
	const x = versionOf(a).split(".").map(Number);
	const y = versionOf(b).split(".").map(Number);
	for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
	return 0;
}

/** Every version in a changelog: `## 1.0.0 — date` or `### 0.25.0 – 0.25.5 — date`, newest first as written. */
export function parseChangelog(md: string): ChangelogEntry[] {
	const out: ChangelogEntry[] = [];
	const lines = md.replace(/\r/g, "").split("\n");
	let cur: ChangelogEntry | undefined;
	for (const line of lines) {
		const m = /^#{2,3}\s+(\d+\.\d+\.\d+(?:\s*[–-]\s*\d+\.\d+\.\d+)?)\s*(?:[—-]\s*(.*))?$/.exec(line);
		if (m) {
			cur = { version: m[1].replace(/\s*[–-]\s*/, " – "), date: (m[2] ?? "").trim(), body: "" };
			out.push(cur);
		} else if (/^#{1,3}\s/.test(line)) {
			// A heading that isn't a version (an intro): it ends the last entry, unless it's a part of one.
			if (/^##\s/.test(line) || /^#\s/.test(line)) cur = undefined;
			else if (cur) cur.body += `${line}\n`;
		} else if (cur) cur.body += `${line}\n`;
	}
	for (const e of out) e.body = e.body.trim();
	return out;
}
