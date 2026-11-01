import esbuild from "esbuild";

await esbuild.build({
	entryPoints: ["dev/tests.ts"],
	bundle: true,
	platform: "node",
	format: "cjs",
	target: "node18",
	outfile: "dev/out/tests.js",
	alias: { obsidian: "./dev/obsidian-mock.ts" },
	logLevel: "warning",
});

await esbuild.build({
	entryPoints: ["dev/scan.ts"],
	bundle: true,
	platform: "node",
	format: "cjs",
	target: "node18",
	outfile: "dev/out/scan.js",
	logLevel: "warning",
});
