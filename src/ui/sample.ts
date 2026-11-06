import { Notice, TFolder } from "obsidian";
import type ChroniclePlugin from "../main";

export const SAMPLE_FOLDER = "UniverseView sample";

/** A small real world to look round in: a family, a house, a war, a battle and places on the real map. */
const NOTES: [string, string][] = [
	["People/Henry VII", `type: person\nborn: 1457-01-28\ndied: 1509-04-21\ngender: male\ncultures: ["[[House of Tudor]]"]\npartners:\n  - person: "[[Elizabeth of York]]"\n    from: 1486-01-18`],
	["People/Elizabeth of York", `type: person\nborn: 1466-02-11\ndied: 1503-02-11\ngender: female\ncultures: ["[[House of York]]"]`],
	["People/Henry VIII", `type: person\nborn: 1491-06-28\ndied: 1547-01-28\ngender: male\nparents: ["[[Henry VII]]", "[[Elizabeth of York]]"]\ncultures: ["[[House of Tudor]]"]\npartners:\n  - person: "[[Catherine of Aragon]]"\n    from: 1509-06-11\n    to: 1533-05-23\n  - person: "[[Anne Boleyn]]"\n    from: 1533-01-25\n    to: 1536-05-19`],
	["People/Catherine of Aragon", `type: person\nborn: 1485-12-16\ndied: 1536-01-07\ngender: female`],
	["People/Anne Boleyn", `type: person\nborn: 1501\ndied: 1536-05-19\ngender: female`],
	["People/Mary I", `type: person\nborn: 1516-02-18\ndied: 1558-11-17\ngender: female\nparents: ["[[Henry VIII]]", "[[Catherine of Aragon]]"]\ncultures: ["[[House of Tudor]]"]`],
	["People/Elizabeth I", `type: person\nborn: 1533-09-07\ndied: 1603-03-24\ngender: female\nparents: ["[[Henry VIII]]", "[[Anne Boleyn]]"]\ncultures: ["[[House of Tudor]]"]`],
	["People/Richard III", `type: person\nborn: 1452-10-02\ndied: 1485-08-22\ngender: male\ncultures: ["[[House of York]]"]`],
	["Groups/House of Tudor", `type: culture\nkind: house\nstart: 1485\nend: 1603`],
	["Groups/House of York", `type: culture\nkind: house\nstart: 1385\nend: 1499`],
	["Groups/House of Lancaster", `type: culture\nkind: house\nstart: 1361\nend: 1471`],
	["Places/England", `type: place\ncoordinates: [52.5, -1.5]`],
	["Places/London", `type: place\nkind: city\ncoordinates: [51.5074, -0.1278]\nlocated-in: "[[England]]"`],
	["Places/Bosworth Field", `type: place\nkind: site\ncoordinates: [52.59, -1.41]\nlocated-in: "[[England]]"`],
	["Events/Wars of the Roses", `type: event\ndate: 1455-05-22\nend: 1487-06-16\nimportance: 5\nsides: "[[House of Lancaster]], [[House of Tudor]] vs [[House of York]]"\nplaces: ["[[England]]"]`],
	["Events/Battle of Bosworth Field", `type: event\ndate: 1485-08-22\nimportance: 5\nwar: "[[Wars of the Roses]]"\nparticipants: ["[[Henry VII]]", "[[Richard III]]"]\nplaces: ["[[Bosworth Field]]"]`],
];

/** Writes the sample notes, leaving any that are already there. Delete the folder to remove them. */
export async function addSampleWorld(plugin: ChroniclePlugin) {
	const { vault } = plugin.app;
	for (const sub of ["", "/People", "/Groups", "/Places", "/Events"]) {
		if (!(vault.getAbstractFileByPath(SAMPLE_FOLDER + sub) instanceof TFolder)) await vault.createFolder(SAMPLE_FOLDER + sub);
	}
	for (const [name, front] of NOTES) {
		const path = `${SAMPLE_FOLDER}/${name}.md`;
		if (!vault.getAbstractFileByPath(path)) await vault.create(path, `---\n${front}\n---\n`);
	}
	new Notice(`Added ${NOTES.length} sample notes in "${SAMPLE_FOLDER}". Delete that folder when you're done with them.`);
}
