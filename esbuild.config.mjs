import esbuild from "esbuild";
import process from "process";
import fs from "fs";
import { builtinModules } from "node:module";

const prod = process.argv[2] === "production";

// Obsidian only loads styles.css, so Leaflet's stylesheet is concatenated in front of ours.
function buildStyles() {
	const leaflet = fs.readFileSync("node_modules/leaflet/dist/leaflet.css", "utf8");
	// Base styles, then the modern layer (motion, boards, hover cards, map tools) and the themes.
	const own = ["src/styles.css", "src/styles-ui.css", "src/styles-views.css", "src/styles-tools.css", "src/styles-calendar.css", "src/styles-calendar-extra.css", "src/styles-panels.css", "src/styles-map.css", "src/styles-realms.css", "src/styles-explorer.css", "src/styles-notes.css", "src/styles-settings.css", "src/styles-hub.css", "src/styles-tactile.css", "src/themes.css"].map((f) => fs.readFileSync(f, "utf8").replace(/^\uFEFF/, "")).join("\n\n");
	// Style Settings requires its @settings block to be the first comment it finds, so it stays on top.
	const marker = "/* @settings";
	const start = own.indexOf(marker);
	const end = own.indexOf("*/", start) + 2;
	const settings = start >= 0 ? own.slice(start, end) : "";
	const rest = start >= 0 ? own.slice(0, start) + own.slice(end) : own;
	fs.writeFileSync("styles.css", `${settings}\n\n/* ---- Leaflet ---- */\n${leaflet}\n\n/* ---- UniverseView ---- */\n${rest}`);
}

const stylesPlugin = {
	name: "styles",
	setup(build) {
		build.onEnd(() => buildStyles());
	},
};

const context = await esbuild.context({
	entryPoints: ["src/main.ts"],
	bundle: true,
	external: [
		"obsidian",
		"electron",
		"@codemirror/autocomplete",
		"@codemirror/collab",
		"@codemirror/commands",
		"@codemirror/language",
		"@codemirror/lint",
		"@codemirror/search",
		"@codemirror/state",
		"@codemirror/view",
		"@lezer/common",
		"@lezer/highlight",
		"@lezer/lr",
		...builtinModules,
	],
	format: "cjs",
	// Obsidian on iPhone and iPad runs in Safari's engine: build for it too, so syntax and regular
	// expressions it can't read are rewritten, or reported here instead of failing on the phone.
	target: ["es2020", "safari15", "ios15"],
	logLevel: "info",
	sourcemap: prod ? false : "inline",
	treeShaking: true,
	outfile: "main.js",
	// The version this code is, fixed when it's built: Obsidian may refresh the plugin's manifest from
	// disk while the old code keeps running, so the update check can't go by the manifest alone.
	// The changelog goes into the code too, for the What's new panel: the history travels with the plugin.
	define: {
		UV_BUILD_VERSION: JSON.stringify(JSON.parse(fs.readFileSync("manifest.json", "utf8")).version),
		UV_CHANGELOG: JSON.stringify(fs.readFileSync("CHANGELOG.md", "utf8")),
	},
	plugins: [stylesPlugin],
});

if (prod) {
	await context.rebuild();
	process.exit(0);
} else {
	await context.watch();
}
