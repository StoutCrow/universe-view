/* Read-only dry run of the detector over a vault folder: `node dev/out/scan.js <vault path>`. */
import fs from "fs";
import path from "path";
import YAML from "yaml";
import { NoteInfo, findKinship, guessType, incomingLinks } from "../src/detect/classify";

const root = process.argv[2];
const onlyUntyped = !process.argv.includes("--all");
const files: string[] = [];
const walk = (d: string) => {
	for (const e of fs.readdirSync(d, { withFileTypes: true })) {
		if (e.name.startsWith(".")) continue;
		const f = path.join(d, e.name);
		if (e.isDirectory()) walk(f);
		else if (e.name.endsWith(".md")) files.push(f);
	}
};
walk(root);
const infos: NoteInfo[] = [];
for (const f of files) {
	const rel = path.relative(root, f).split(path.sep).join("/");
	if (/(^|\/)!*(templates?|guide)\//i.test(rel)) continue;
	const text = fs.readFileSync(f, "utf8");
	const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	let props: Record<string, unknown> = {};
	try {
		props = m ? YAML.parse(m[1], { logLevel: "silent" }) ?? {} : {};
	} catch {
		props = {};
	}
	const tags = ([] as unknown[]).concat(props.tags ?? []).map(String);
	const name = path.basename(f, ".md");
	const typed = !!props.cr_type || !!props.type || tags.length > 0;
	const body = m ? text.slice(m[0].length) : text;
	infos.push({ path: rel, name, props, tags, body });
	(infos[infos.length - 1] as NoteInfo & { typed?: boolean }).typed = typed;
}
const incoming = incomingLinks(infos);
for (const n of infos as (NoteInfo & { typed?: boolean })[]) {
	const { path: rel, name, props, tags, body, typed } = n;
	if (!typed || !onlyUntyped) {
		const g = guessType({ path: rel, name, props, tags, body }, incoming.get(name.toLowerCase()));
		console.log(`${typed ? "  (typed)" : "UNTYPED "} ${rel}\n          → ${g.type ?? "skip"} (score ${g.score}) ${g.reasons.join("; ")} ${JSON.stringify(g.suggestions)}`);
	}
	const isPerson = tags.includes("Character") || props.cr_type === "person";
	if (isPerson) for (const k of findKinship(name, body)) console.log(`KIN      ${name}: ${k.relation} → ${k.target}   « ${k.sentence} »`);
}
