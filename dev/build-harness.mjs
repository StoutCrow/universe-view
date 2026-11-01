// Builds dev/out/harness.js (plugin + Obsidian mock + example vault) and serves it.
import esbuild from "esbuild";
import fs from "fs";
import path from "path";
import http from "http";
import { fileURLToPath } from "url";

// Paths below are relative to the project root, wherever this is launched from.
process.chdir(path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));

// VAULT=<path> loads another vault (read-only: the harness keeps every change in memory).
const vaultDir = process.env.VAULT || "example-vault";
const files = {};
function walk(dir) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (entry.name.startsWith(".")) continue;
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) walk(full);
		else if (entry.name.endsWith(".md")) files[path.relative(vaultDir, full).split(path.sep).join("/")] = fs.readFileSync(full, "utf8");
		else files[path.relative(vaultDir, full).split(path.sep).join("/")] = "";
	}
}
walk(vaultDir);
const dataPath = path.join(vaultDir, ".obsidian/plugins/universe-view/data.json");
const pluginData = fs.existsSync(dataPath) ? JSON.parse(fs.readFileSync(dataPath, "utf8")) : {};

fs.mkdirSync("dev/out", { recursive: true });
await esbuild.build({
	absWorkingDir: process.cwd(),
	entryPoints: ["dev/harness.ts"],
	bundle: true,
	format: "iife",
	target: "es2020",
	outfile: "dev/out/harness.js",
	sourcemap: "inline",
	alias: { obsidian: "./dev/obsidian-mock.ts" },
	define: { VAULT_FILES: JSON.stringify(files), PLUGIN_DATA: JSON.stringify(pluginData), UV_CHANGELOG: JSON.stringify(fs.readFileSync("CHANGELOG.md", "utf8")) },
	logLevel: "info",
});
// The running server serves images from whichever vault was bundled last.
fs.writeFileSync("dev/out/vault.txt", path.resolve(vaultDir));
console.log(`Bundled ${Object.keys(files).length} vault files.`);

if (process.argv.includes("--serve")) {
	const port = Number(process.env.PORT) || 5178;
	const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp" };
	http.createServer((req, res) => {
		// Dev only: the harness can hand back a note it changed, saved under dev/out/staged (never into
		// the vault itself), to be looked over and copied across by hand.
		if (req.method === "POST" && req.url.startsWith("/dev-stage?")) {
			const rel = new URL(req.url, "http://x").searchParams.get("path") ?? "";
			const target = path.resolve("dev/out/staged", rel);
			if (!rel.endsWith(".md") || !target.startsWith(path.resolve("dev/out/staged"))) return res.writeHead(400).end();
			let body = "";
			req.on("data", (c) => (body += c));
			req.on("end", () => {
				fs.mkdirSync(path.dirname(target), { recursive: true });
				fs.writeFileSync(target, body);
				res.writeHead(200).end("ok");
			});
			return;
		}
		let url = decodeURIComponent(req.url.split("?")[0]);
		if (url === "/") url = "/dev/harness.html";
		const vault = fs.readFileSync("dev/out/vault.txt", "utf8");
		const file = url.startsWith("/vault/") ? path.join(vault, url.slice(7)) : path.join(".", url);
		const allowed = [path.resolve("."), path.resolve(vault)];
		if (!allowed.some((dir) => path.resolve(file).startsWith(dir))) return res.writeHead(403).end();
		fs.readFile(file, (err, data) => {
			if (err) return res.writeHead(404).end("not found");
			res.writeHead(200, { "content-type": types[path.extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
			res.end(data);
		});
	}).listen(port, () => console.log(`Harness on http://localhost:${port}`));
}
