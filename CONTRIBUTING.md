# Contributing to UniverseView

Thank you for wanting to help. You do not need to be a programmer: bug reports, ideas, wording fixes and translations all matter.

UniverseView is written with AI (see the note at the top of the [README](README.md)). A person reads and tests what is merged, but it has not been reviewed line by line by an experienced developer, so careful bug reports and small, clear pull requests are especially useful.

## Ways to help

- **Report a bug or ask for a feature**: [open an issue](https://github.com/StoutCrow/universe-view/issues/new/choose) and pick the form that fits. A short example note (or a few lines of properties) that shows the problem is the most useful thing you can add.
- **Translate the interface**: no code needed. See [TRANSLATING.md](TRANSLATING.md). Native speakers who check a translation are as welcome as those who write one.
- **Improve the writing**: unclear wording in the settings, tooltips or README is a good first issue.
- **Fix something**: pull requests are welcome. For anything big, open an issue first so we can agree on the approach.

## Before you open an issue

- Check the [changelog](CHANGELOG.md) and the open issues; it may already be fixed or planned.
- Say which UniverseView version and Obsidian version you use (Settings, then UniverseView, then About).
- Back up your vault before trying fixes. Every change UniverseView makes can be undone from the history button on any view.
- Never include private notes or personal information in an issue. Trim your example down to what shows the problem.

## Making a code change

You need [Node.js](https://nodejs.org) and git.

```bash
npm install
npm test        # the unit tests (no Obsidian needed)
npm run lint    # Obsidian's own review rules
npm run build   # typecheck and bundle main.js
```

To try your build, copy `main.js`, `manifest.json` and `styles.css` into a test vault's `.obsidian/plugins/universe-view/` folder and reload Obsidian. Use a test vault, not your real one.

### House rules

- **Logic goes in `src/index/`** where it can be tested without Obsidian, and gets a test in `dev/tests.ts`.
- **Show text through the translation layer** as screens move over to it (`src/i18n/`); do not copy text between files.
- **Follow the Obsidian plugin guidelines**: sentence case in the interface, no `!important` in CSS, no hard-coded colours where an Obsidian variable exists, no `innerHTML` with user text.
- **Keep it quiet and consistent**: small radii, flat surfaces, the existing icons and spacing. See the design notes in the README.
- **Examples use public material** (the Tudors, the United States, the bundled example vault), never someone's private world.
- Keep pull requests small and about one thing. `npm test`, `npm run lint` and `npm run build` should all pass.

## Pull requests

Describe what changed and why, and how you checked it. A screenshot helps for anything you can see. By contributing you agree your work is shared under the project's [licence](LICENSE).

## Conduct

Be kind. See the [code of conduct](CODE_OF_CONDUCT.md).
