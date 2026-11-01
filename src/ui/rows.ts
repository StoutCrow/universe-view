import { TFolder, type App } from "obsidian";
import { el, icon, glyph } from "../render/common";

/** One field in a row: what it edits and with which control. */
export type Field<T> = {
	key: keyof T & string;
	label: string;
	/** CSS grid width, e.g. "2fr" or "90px". */
	width?: string;
	placeholder?: string;
	title?: string;
} & (
	| { kind: "text"; list?: "folders" }
	| { kind: "number"; min?: number; step?: number }
	| { kind: "select"; options: () => [string, string][] }
	| { kind: "color" }
	| { kind: "toggle" }
	/** A Lucide icon name or emoji, with a live preview. */
	| { kind: "icon" }
);

export interface RowEditorOptions<T> {
	/** A new, empty row. */
	blank: () => T;
	addLabel: string;
	/** Shown when there are no rows. */
	empty?: string;
	/** Rows can be moved up and down (order matters: months, weekdays). */
	reorder?: boolean;
}

/** A shared list of the vault's folders for folder fields to suggest from. */
function folderList(app: App): string {
	const id = "chronicle-folder-list";
	let dl = document.getElementById(id);
	if (!dl) {
		dl = document.body.createEl("datalist", { attr: { id } });
		const folders = new Set<string>();
		const all = typeof app.vault.getAllLoadedFiles === "function" ? app.vault.getAllLoadedFiles() : [];
		for (const f of all) if (f instanceof TFolder && f.path !== "/") folders.add(f.path);
		// Otherwise, the folders the files are in.
		if (!folders.size) for (const f of app.vault.getFiles()) for (let p = f.parent?.path; p && p !== "/"; p = p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "") folders.add(p);
		for (const path of [...folders].sort()) dl.createEl("option", { attr: { value: path } });
	}
	return id;
}

/**
 * A small table of rows with proper controls (text, numbers, menus, colours, switches, icons), plus
 * add, remove and reorder. `onChange` gets the whole list whenever a value is committed.
 */
export function rowEditor<T extends Record<string, unknown>>(app: App, parent: HTMLElement, fields: Field<T>[], initial: T[], onChange: (rows: T[]) => void, opts: RowEditorOptions<T>) {
	const rows = initial.map((r) => ({ ...r }));
	const box = el("div", { cls: "chronicle-rows" }, parent);
	const cols = `${fields.map((f) => f.width ?? "1fr").join(" ")} auto`;
	const commit = () => onChange(rows.map((r) => ({ ...r })));
	const render = () => {
		box.empty();
		if (rows.length) {
			const head = el("div", { cls: "chronicle-rows-head" }, box);
			head.style.gridTemplateColumns = cols;
			for (const f of fields) el("div", { text: f.label, attr: f.title ? { title: f.title } : {} }, head);
			el("div", {}, head);
		} else if (opts.empty) el("div", { cls: "chronicle-rows-empty", text: opts.empty }, box);
		rows.forEach((row, i) => {
			const line = el("div", { cls: "chronicle-rows-row" }, box);
			line.style.gridTemplateColumns = cols;
			for (const f of fields) {
				const cell = el("div", { cls: `chronicle-rows-cell kind-${f.kind}` }, line);
				const v = row[f.key];
				const set = (x: unknown) => {
					(row as Record<string, unknown>)[f.key] = x;
					commit();
				};
				if (f.kind === "toggle") {
					const cb = el("input", { attr: { type: "checkbox", "aria-label": f.label } }, cell);
					cb.checked = !!v;
					cb.addEventListener("change", () => set(cb.checked));
				} else if (f.kind === "select") {
					const s = el("select", { cls: "dropdown", attr: { "aria-label": f.label } }, cell);
					for (const [val, text] of f.options()) s.add(new Option(text, val));
					s.value = v === undefined || v === null ? "" : String(v);
					s.addEventListener("change", () => set(s.value));
				} else if (f.kind === "color") {
					const c = el("input", { attr: { type: "color", "aria-label": f.label } }, cell);
					c.value = typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : "#888888";
					const clear = el("button", { cls: "clickable-icon", attr: { "aria-label": "No colour" } }, cell);
					icon(clear, "x");
					cell.toggleClass("is-unset", !v);
					c.addEventListener("change", () => {
						cell.removeClass("is-unset");
						set(c.value);
					});
					clear.addEventListener("click", () => {
						cell.addClass("is-unset");
						set(undefined);
					});
				} else {
					const input = el("input", { attr: { type: f.kind === "number" ? "number" : "text", placeholder: f.placeholder ?? "", "aria-label": f.label } }, cell);
					if (f.kind === "number") {
						if (f.min !== undefined) input.min = String(f.min);
						input.step = String(f.step ?? 1);
					}
					if (f.kind === "text" && f.list === "folders") input.setAttribute("list", folderList(app));
					input.value = v === undefined || v === null ? "" : String(v);
					let preview: HTMLElement | undefined;
					if (f.kind === "icon") {
						preview = el("span", { cls: "chronicle-rows-icon" }, cell);
						cell.prepend(preview);
						const show = () => {
							preview!.empty();
							if (input.value.trim()) glyph(preview!, input.value.trim());
						};
						show();
						input.addEventListener("input", show);
					}
					input.addEventListener("change", () => set(f.kind === "number" ? (input.value === "" ? undefined : Number(input.value)) : input.value.trim()));
				}
			}
			const tools = el("div", { cls: "chronicle-rows-tools" }, line);
			const button = (ic: string, label: string, run: () => void, disabled = false) => {
				const b = el("button", { cls: "clickable-icon", attr: { "aria-label": label } }, tools);
				icon(b, ic);
				b.disabled = disabled;
				b.addEventListener("click", () => {
					run();
					commit();
					render();
				});
			};
			if (opts.reorder) {
				button("arrow-up", "Move up", () => rows.splice(i - 1, 0, rows.splice(i, 1)[0]), i === 0);
				button("arrow-down", "Move down", () => rows.splice(i + 1, 0, rows.splice(i, 1)[0]), i === rows.length - 1);
			}
			button("trash-2", "Remove", () => rows.splice(i, 1));
		});
		const add = el("button", { cls: "chronicle-rows-add" }, box);
		icon(el("span", {}, add), "plus");
		el("span", { text: opts.addLabel }, add);
		add.addEventListener("click", () => {
			rows.push(opts.blank());
			commit();
			render();
			(box.querySelector(".chronicle-rows-row:last-of-type input, .chronicle-rows-row:last-of-type select") as HTMLElement | null)?.focus();
		});
	};
	render();
	return { refresh: render };
}
