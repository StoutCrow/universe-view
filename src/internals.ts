// The few parts of Obsidian (and other plugins) that aren't in its public API but UniverseView uses:
// which community plugins are on, Templater and Dataview, the templates folder and the file explorer.
// Typed here, narrowly, so the rest of the code never needs `any`; every part is optional, since any of
// it can be missing (a plugin off, an older Obsidian).
import type { App, Events, TAbstractFile, TFile, View } from "obsidian";

interface TemplaterPlugin {
	settings?: { templates_folder?: string };
	templater?: { overwrite_file_commands?(file: TFile): Promise<void> };
}

interface AppInternals {
	plugins?: {
		enabledPlugins?: Set<string>;
		plugins?: { "templater-obsidian"?: TemplaterPlugin; dataview?: { api?: unknown } };
	};
	internalPlugins?: {
		plugins?: { templates?: { instance?: { options?: { folder?: string } } } };
		getPluginById?(id: string): { instance?: { revealInFolder?(file: TAbstractFile): void } } | null;
	};
}

const internals = (app: App) => app as unknown as AppInternals;

/** Whether a community plugin is turned on. */
export function pluginEnabled(app: App, id: string): boolean {
	return !!internals(app).plugins?.enabledPlugins?.has(id);
}

/** Templater, when it's installed. */
export function templater(app: App): TemplaterPlugin | undefined {
	return internals(app).plugins?.plugins?.["templater-obsidian"];
}

/** Dataview's API, when Dataview is installed (its shape is Dataview's own). */
export function dataviewApi(app: App): unknown {
	return internals(app).plugins?.plugins?.dataview?.api ?? null;
}

/** The folders templates live in: Templater's and the core Templates plugin's. */
export function templateFolders(app: App): (string | undefined)[] {
	const i = internals(app);
	return [templater(app)?.settings?.templates_folder, i.internalPlugins?.plugins?.templates?.instance?.options?.folder];
}

/** Runs a command by its full id; false when it can't run now (it needs an open note, say). */
export function runCommand(app: App, id: string): boolean {
	return !!(app as unknown as { commands?: { executeCommandById?(id: string): boolean } }).commands?.executeCommandById?.(id);
}

/** Shows a file in the core file explorer, when it's on. */
export function revealInExplorer(app: App, file: TAbstractFile) {
	internals(app).internalPlugins?.getPluginById?.("file-explorer")?.instance?.revealInFolder?.(file);
}

/** Opens a folder in a file explorer view. */
export function expandFolder(view: View, path: string) {
	(view as unknown as { fileItems?: Record<string, { setCollapsed?(collapsed: boolean): void } | undefined> }).fileItems?.[path]?.setCollapsed?.(false);
}

/** The metadata cache as a plain event source, for events other plugins raise on it (Dataview's). */
export function metadataEvents(app: App): Events {
	return app.metadataCache;
}
