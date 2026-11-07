/** Where a note or folder lands in a folder ("" is the vault's root); undefined when it can't go there. */
export function moveTarget(path: string, isFolder: boolean, dest: string): string | undefined {
	if (isFolder && (dest === path || dest.startsWith(`${path}/`))) return undefined;
	const name = path.split("/").pop() ?? path;
	const target = dest ? `${dest}/${name}` : name;
	return target === path ? undefined : target;
}

/** A path after `from` became `to`, whether it was that item or something inside it. */
export function followPath(path: string, from: string, to: string): string {
	if (path === from) return to;
	return path.startsWith(`${from}/`) ? to + path.slice(from.length) : path;
}
