// French. Only the keys that are translated need to be here: anything missing shows in English.
// Keys are in en.ts; keep every {name} exactly as written there.
import type { TextKey } from "./en";

export const fr: Partial<Record<TextKey, string>> = {
	"common.cancel": "Annuler",
	"common.save": "Enregistrer",
	"common.close": "Fermer",
	"common.add": "Ajouter",
	"common.delete": "Supprimer",
	"common.undo": "Annuler la dernière action",
	"common.open": "Ouvrir {name}",
};
