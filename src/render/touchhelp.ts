/**
 * A tool's help said for fingers: "tap" for "click", "long-press" for "right-click", and no keyboard
 * keys (Alt, Shift, Enter, Backspace, Escape), whose jobs the banner's own buttons do on a phone.
 */
export function touchHelp(text: string): string {
	const keys = /\b(Alt|Shift|Ctrl|Cmd|Backspace|Escape|Esc|Space)\b|\[ and \]/;
	return text
		// Asides about keys: "; Alt stops it" (keeping the rest of its brackets), "(hold Alt to stop)", "(Enter to finish)".
		.replace(/;\s*Alt stops it/g, "")
		.replace(/\s*\([^)]*\b(Alt|Shift|Enter|Ctrl|Cmd)\b[^)]*\)/g, "")
		.split(/\s+·\s+/)
		// "Enter or double-click to finish": the Finish button says it better.
		.map((part) => part.replace(/^Enter or double-click to \w+$/, "").replace(/\bEnter or /g, ""))
		.filter((part) => part.trim() && !keys.test(part))
		.join(" · ")
		.replace(/\bdouble-click/g, "double-tap")
		.replace(/\bDouble-click/g, "Double-tap")
		.replace(/\bright-click/g, "long-press")
		.replace(/\bRight-click/g, "Long-press")
		.replace(/\bclicks?\b/g, (w) => (w === "clicks" ? "taps" : "tap"))
		.replace(/\bClick/g, "Tap");
}
