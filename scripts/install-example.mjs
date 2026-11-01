// Copies the built plugin into the example vault so it can be opened in Obsidian.
import fs from "fs";
import path from "path";

const dest = path.join("example-vault", ".obsidian", "plugins", "universe-view");
fs.mkdirSync(dest, { recursive: true });
for (const f of ["main.js", "manifest.json", "styles.css"]) {
	if (!fs.existsSync(f)) {
		console.error(`${f} is missing: run "npm run build" first.`);
		process.exit(1);
	}
	fs.copyFileSync(f, path.join(dest, f));
}
console.log(`Installed into ${dest}. Open the example-vault folder as a vault in Obsidian and enable UniverseView.`);
