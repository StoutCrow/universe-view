/**
 * Which build this is: the version, and a build number that goes up with every commit (written in by esbuild.config.mjs),
 * with a "+" when it was built from changes not yet committed. The test harness has none of it and shows "dev".
 */
declare const UV_BUILD_INFO: { build: number; dirty: boolean; at: string } | undefined;

export interface BuildLabel {
	/** "v3.0.0 · build 143" */
	short: string;
	/** "3.0.0 · build 143, built 10 Nov 2026, 14:03" */
	long: string;
}

export function buildLabel(version: string): BuildLabel {
	const info = typeof UV_BUILD_INFO === "object" ? UV_BUILD_INFO : undefined;
	if (!info) return { short: `v${version} · dev`, long: `${version} · dev build` };
	// A release build carries no build number (it must not depend on git): show just the version.
	if (!info.build) return { short: `v${version}`, long: version };
	const n = `build ${info.build}${info.dirty ? "+" : ""}`;
	const when = new Date(info.at);
	const at = Number.isNaN(when.getTime()) ? "" : `, built ${when.toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}`;
	return { short: `v${version} · ${n}`, long: `${version} · ${n}${at}` };
}