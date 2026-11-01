/** A file name for a note's web page: readable, unique, safe on every system. No Obsidian here. */
export function pageName(e: { name: string; path: string }, taken: Set<string>): string {
	const base = e.name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "note";
	let name = `${base}.html`;
	for (let i = 2; taken.has(name); i++) name = `${base}-${i}.html`;
	taken.add(name);
	return name;
}