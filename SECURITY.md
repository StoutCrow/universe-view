# Security policy

## What UniverseView does with your data

UniverseView runs inside Obsidian on your own device. It reads and writes the notes in your vault, and it keeps its own settings in the vault's plugin folder. It does not send your notes anywhere and has no account or server. It makes no network requests of its own beyond what Obsidian provides.

## Supported versions

Only the latest release gets fixes. Please update before reporting.

## Reporting a vulnerability

Please do **not** open a public issue for a security problem.

1. Go to the [Security tab](https://github.com/StoutCrow/universe-view/security) and choose **Report a vulnerability** (a private report only the maintainer can see).
2. Say what you found, how to reproduce it (a small vault or note that shows it is ideal), and which version you used.

You can expect a first reply within about a week. This is a hobby project, so fixes take as long as they take, but a real security problem is looked at before anything else.

## Things that are not vulnerabilities

- A note being changed because you asked UniverseView to change it. Every change it makes can be undone from the history button on any view.
- Bugs that only lose formatting or look wrong. Please open a normal issue for those.
