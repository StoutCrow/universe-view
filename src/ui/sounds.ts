import type UniverseViewPlugin from "../main";
import { THEMES } from "../appearance";

/** The sounds of writing: all made here with Web Audio, so nothing is downloaded and nothing is stored. */
export const SOUND_SETS: { id: string; name: string; note: string }[] = [
	{ id: "typewriter", name: "Typewriter", note: "Clack, thud and a bell" },
	{ id: "keyboard", name: "Keyboard", note: "A soft key tick" },
	{ id: "retro", name: "Retro", note: "1980s computer beeps" },
	{ id: "synth", name: "Synth", note: "Short synth blips" },
	{ id: "pop", name: "Bubble", note: "Soft pops" },
	{ id: "thud", name: "Thud", note: "A dull, heavy tap" },
];

/** What each theme sounds like when the set is "theme". */
const THEME_SOUND: Record<string, string> = {
	notebook: "keyboard", journal: "keyboard", manuscript: "keyboard", archive: "keyboard", scholar: "keyboard", watercolor: "pop", atelier: "keyboard", woodcut: "thud",
	typewriter: "typewriter", desktop: "retro", neon: "synth", starfield: "keyboard", synth: "synth", glass: "pop", neumorph: "pop", brutalist: "thud", obsidian: "keyboard",
};

type Kind = "key" | "space" | "enter" | "back" | "click" | "stroke";

/** Writing and typing noises (Settings → Theme settings → Sounds). Silent until a set is chosen. */
export class Sounds {
	private ctx?: AudioContext;
	private last = 0;
	private noise?: AudioBuffer;

	constructor(private plugin: UniverseViewPlugin) {
		const on = <K extends keyof DocumentEventMap>(type: K, fn: (e: DocumentEventMap[K]) => void) => plugin.registerDomEvent(document, type, fn, true);
		on("keydown", (e) => this.onKey(e));
		on("pointerdown", (e) => this.onPointer(e));
		on("animationstart", (e) => this.onAnimation(e));
	}

	/** The set in force: the chosen one, or the theme's own; undefined when silent. */
	current(): string | undefined {
		const s = this.plugin.settings;
		if (!s.soundSet || s.soundSet === "off") return undefined;
		return s.soundSet === "theme" ? THEME_SOUND[s.theme] ?? "keyboard" : s.soundSet;
	}

	private onKey(e: KeyboardEvent) {
		const s = this.plugin.settings;
		if (!s.soundTyping || e.ctrlKey || e.metaKey || e.key.length > 1 && !["Enter", "Backspace", "Delete", "Tab"].includes(e.key)) return;
		const t = e.target as HTMLElement | null;
		if (!t || !(t.matches("input, textarea, [contenteditable='true'], .cm-content") || t.closest(".cm-content"))) return;
		this.play(e.key === " " ? "space" : e.key === "Enter" ? "enter" : e.key === "Backspace" || e.key === "Delete" ? "back" : "key");
	}

	private onPointer(e: PointerEvent) {
		if (!this.plugin.settings.soundClicks) return;
		const t = e.target as HTMLElement | null;
		if (t?.closest(".universeview-chip, .universeview-icon-btn, .uv-hub-tab, .universeview-segment, .universeview-theme-card, .universeview-ov-action, .universeview-ov-tile")) this.play("click");
	}

	/** Titles being written (a scratch every so often) or typed (a tick for each letter). */
	private onAnimation(e: AnimationEvent) {
		if (!this.plugin.settings.soundWriting) return;
		if (e.animationName === "uv-caret") return;
		const typed = (e.target as HTMLElement | null)?.style.length !== undefined && getComputedStyle(e.target as HTMLElement).borderRightWidth !== "0px";
		if (e.animationName !== "uv-write") return;
		const set = this.current();
		if (!set) return;
		const count = typed ? 20 : 6;
		const every = typed ? 60 : 220;
		for (let i = 0; i < count; i++) window.setTimeout(() => this.play(typed ? "key" : "stroke", true), i * every);
	}

	/** Plays a sound now (the settings' "Try it" uses this). */
	play(kind: Kind, force = false) {
		const set = this.current();
		if (!set) return;
		const now = performance.now();
		if (!force && now - this.last < 18) return;
		this.last = now;
		const ctx = (this.ctx ??= new AudioContext());
		void ctx.resume();
		const vol = Math.max(0, Math.min(1, (this.plugin.settings.soundVolume ?? 40) / 100));
		this.voice(ctx, set, kind, vol);
	}

	private burst(ctx: AudioContext, dur: number, type: BiquadFilterType, freq: number, q: number, gain: number, at = 0) {
		const buf = (this.noise ??= (() => {
			const b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
			const d = b.getChannelData(0);
			for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
			return b;
		})());
		const src = ctx.createBufferSource();
		src.buffer = buf;
		src.loop = true;
		const f = ctx.createBiquadFilter();
		f.type = type;
		f.frequency.value = freq * (0.9 + Math.random() * 0.2);
		f.Q.value = q;
		const g = ctx.createGain();
		const t = ctx.currentTime + at;
		g.gain.setValueAtTime(0.0001, t);
		g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.01, dur / 3));
		g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
		src.connect(f).connect(g).connect(ctx.destination);
		src.start(t, Math.random());
		src.stop(t + dur + 0.02);
	}

	private tone(ctx: AudioContext, wave: OscillatorType, from: number, to: number, dur: number, gain: number, at = 0) {
		const o = ctx.createOscillator();
		o.type = wave;
		const t = ctx.currentTime + at;
		o.frequency.setValueAtTime(from, t);
		o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
		const g = ctx.createGain();
		g.gain.setValueAtTime(gain, t);
		g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
		o.connect(g).connect(ctx.destination);
		o.start(t);
		o.stop(t + dur + 0.02);
	}

	private voice(ctx: AudioContext, set: string, kind: Kind, v: number) {
		const big = kind === "space" || kind === "enter";
		switch (set) {
			case "typewriter":
				this.burst(ctx, 0.015, "highpass", 1800, 0.7, 0.3 * v);
				this.tone(ctx, "sine", big ? 90 : 150, 60, 0.05, 0.22 * v);
				if (kind === "enter") this.tone(ctx, "sine", 2300, 2290, 0.7, 0.07 * v, 0.06);
				return;
			case "keyboard": this.burst(ctx, 0.012, "bandpass", 4200, 2, 0.16 * v); return this.tone(ctx, "sine", big ? 160 : 230, 130, 0.03, 0.1 * v);
			case "retro": return this.tone(ctx, "square", kind === "back" ? 440 : kind === "enter" ? 1320 : 880, kind === "back" ? 440 : 880, 0.045, 0.06 * v);
			case "synth": return this.tone(ctx, "sawtooth", kind === "back" ? 220 : 330 * (1 + Math.random() * 0.5), 200, 0.07, 0.05 * v);
			case "pop": return this.tone(ctx, "sine", 380, 900, 0.07, 0.14 * v);
			case "thud": this.burst(ctx, 0.05, "lowpass", 400, 1, 0.3 * v); return this.tone(ctx, "sine", 100, 60, 0.08, 0.25 * v);
			default: return this.tone(ctx, "sine", 500, 400, 0.04, 0.1 * v);
		}
	}
}

export const themeSoundName = (theme: string) => SOUND_SETS.find((s) => s.id === THEME_SOUND[theme])?.name ?? "Keyboard";
export const knownThemes = THEMES.length;