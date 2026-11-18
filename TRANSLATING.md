# Translating UniverseView

The interface text lives in `src/i18n/`. English is `en.ts` (one key per sentence); each language is one file (`fr.ts`). A key a translation lacks shows in English, so a language can be added a little at a time.

## To translate or proofread
1. Open `src/i18n/en.ts` (the keys and their English) and the language file (for French, `fr.ts`).
2. Copy a key you want to translate into the language file and write the text after it.
3. Keep every `{name}` exactly as in English (`"Open {name}"` → `"Ouvrir {name}"`). Don't translate what is inside the braces.
4. Open an issue or a pull request with the file. No code needed.

## A new language
Copy `fr.ts` to `<code>.ts` (the Obsidian language code: `de`, `es`, `pt`...), rename the export, and add it to `PACKS` in `src/i18n/index.ts`.

## For the code
Show text with `t("key")` (`t("common.open", { name })` when it has a `{name}`) instead of a string. The language comes from Obsidian's own setting when the plugin loads. Strings are being moved over a part at a time (Settings pages and dashboard tabs first); until a screen is moved, it shows English.
