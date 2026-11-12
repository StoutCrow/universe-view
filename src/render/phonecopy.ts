import { TFile, normalizePath } from "obsidian";
import type UniverseViewPlugin from "../main";
import type { Pyramid } from "./bigimage";

/**
 * Phones and tablets can't open a huge map picture (a 16,000 px map needs about a gigabyte to
 * decode, more than an iPhone allows). The computer, which can, saves a copy at most PHONE_MAX
 * across into the vault, where it syncs like any file; phones show that copy, stretched over the
 * same area, so every pin and border stays where it is.
 */

/** The longest side of a phone copy, in pixels (well inside what iPhones and iPads can decode). */
export const PHONE_MAX = 4096;

const FOLDER = "UniverseView/Map copies";

/** Whether a picture of this size is too big to open on a phone. */
export function tooBigForPhone(size: [number, number]): boolean {
	return Math.max(size[0], size[1]) > PHONE_MAX;
}

/** Where a picture's phone copy lives: one per picture, named after it (with a short tag, so two pictures of the same name in different folders don't clash). */
export function phoneCopyPath(imagePath: string): string {
	let h = 0;
	for (const ch of imagePath) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
	const base = imagePath.split("/").pop()!.replace(/\.[^.]+$/, "");
	return normalizePath(`${FOLDER}/${base} ${h.toString(36).slice(0, 5)}.jpg`);
}

/** The phone copy, when there is one. */
export function phoneCopy(plugin: UniverseViewPlugin, imagePath: string): TFile | undefined {
	const f = plugin.app.vault.getAbstractFileByPath(phoneCopyPath(imagePath));
	return f instanceof TFile ? f : undefined;
}

/**
 * A phone copy found by the picture's name alone: for a device the original never reached (too big
 * for the sync plan, say), where the link to it can't be followed to a path.
 */
export function phoneCopyByName(plugin: UniverseViewPlugin, link: string): TFile | undefined {
	const name = link.replace(/^!?\[\[|\]\]$/g, "").split("|")[0].split("/").pop()?.replace(/\.[^.]+$/, "").trim();
	if (!name) return undefined;
	const dir = plugin.app.vault.getAbstractFileByPath(FOLDER);
	const kids = (dir as { children?: unknown[] } | null)?.children ?? [];
	return kids.find((f): f is TFile => f instanceof TFile && f.basename.startsWith(`${name} `) && f.basename.length <= name.length + 6);
}

const making = new Set<string>();

/**
 * Saves (or refreshes) a picture's phone copy from the downscaled copies the computer already made
 * to show it. Does nothing when the copy is newer than the picture.
 */
export async function savePhoneCopy(plugin: UniverseViewPlugin, imagePath: string, pyramid: Pyramid): Promise<void> {
	const { vault } = plugin.app;
	const image = vault.getAbstractFileByPath(imagePath);
	if (!(image instanceof TFile) || making.has(imagePath)) return;
	const existing = phoneCopy(plugin, imagePath);
	if (existing && existing.stat.mtime >= image.stat.mtime) return;
	making.add(imagePath);
	try {
		// The smallest kept copy still at least PHONE_MAX across, shrunk to exactly that (the sharpest
		// result); the largest copy when none is that big.
		const big = pyramid.levels.filter((l) => Math.max(l.width, l.height) >= PHONE_MAX);
		const level = big[big.length - 1] ?? pyramid.levels[0];
		const k = Math.min(1, PHONE_MAX / Math.max(level.width, level.height));
		const c = createEl("canvas");
		c.width = Math.round(level.width * k);
		c.height = Math.round(level.height * k);
		const ctx = c.getContext("2d");
		if (!ctx) return;
		ctx.imageSmoothingQuality = "high";
		ctx.drawImage(level.src, 0, 0, c.width, c.height);
		const blob = await new Promise<Blob | null>((resolve) => c.toBlob(resolve, "image/jpeg", 0.86));
		if (!blob) return;
		const data = await blob.arrayBuffer();
		const path = phoneCopyPath(imagePath);
		for (const dir of ["UniverseView", FOLDER]) if (!vault.getAbstractFileByPath(dir)) await vault.createFolder(dir).catch(() => {});
		if (existing) await vault.modifyBinary(existing, data);
		else await vault.createBinary(path, data);
	} catch (err) {
		console.warn("UniverseView: couldn't save a phone copy of the map", err);
	} finally {
		making.delete(imagePath);
	}
}
