// The English text of the interface, one key for each sentence. English is also the fallback: a key a
// translation lacks shows its English text. Add a key here first, then use `t("key")` where it is shown.
// Words that change with the text around them take {names}: "Open {name}".
export const en = {
	"common.cancel": "Cancel",
	"common.save": "Save",
	"common.close": "Close",
	"common.add": "Add",
	"common.delete": "Delete",
	"common.undo": "Undo",
	"common.open": "Open {name}",
} as const;

export type TextKey = keyof typeof en;
