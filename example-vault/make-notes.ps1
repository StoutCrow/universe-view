# Generates the example vault notes. Run from this folder: powershell -File make-notes.ps1
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

function Note($path, $front, $body = "") {
	$full = Join-Path $root $path
	New-Item -ItemType Directory -Force (Split-Path $full) | Out-Null
	$text = "---`n$($front.Trim())`n---`n$body`n"
	[IO.File]::WriteAllText($full, $text, (New-Object Text.UTF8Encoding $false))
}

# ---------------- Tudors (Gregorian, real-world map) ----------------
$T = "Tudors"
Note "$T/Cultures/House of Tudor.md" @"
type: culture
kind: house
founded: 1485-08-22
dissolved: 1603-03-24
parent-cultures: ["[[House of Lancaster]]"]
color: "#c0392b"
"@ "Royal house that ruled England from Bosworth to the death of Elizabeth I."
Note "$T/Cultures/House of Lancaster.md" @"
type: culture
kind: house
founded: 1399
dissolved: 1471
parent-cultures: ["[[House of Plantagenet]]"]
color: "#e67e22"
"@
Note "$T/Cultures/House of Plantagenet.md" @"
type: culture
kind: house
founded: 1154
dissolved: 1485
color: "#d4ac0d"
"@
Note "$T/Cultures/House of York.md" @"
type: culture
kind: house
founded: 1461
dissolved: 1485
parent-cultures: ["[[House of Plantagenet]]"]
color: "#95a5a6"
"@
Note "$T/Cultures/Crown of Castile.md" @"
type: culture
founded: 1230
dissolved: 1715
color: "#8e44ad"
"@
Note "$T/Cultures/Church of England.md" @"
type: culture
kind: faith
founded: 1534-11
color: "#2980b9"
"@

Note "$T/People/Edmund Tudor.md" @"
type: person
born: c. 1430
died: 1456-11-03
gender: male
cultures: ["[[House of Tudor]]"]
partners:
  - person: "[[Margaret Beaufort]]"
    from: 1455-11-01
"@
Note "$T/People/Margaret Beaufort.md" @"
type: person
born: 1443-05-31
died: 1509-06-29
gender: female
cultures: ["[[House of Lancaster]]"]
"@
Note "$T/People/Henry VII.md" @"
type: person
born: 1457-01-28
died: 1509-04-21
gender: male
parents: ["[[Edmund Tudor]]", "[[Margaret Beaufort]]"]
cultures: ["[[House of Tudor]]"]
partners:
  - person: "[[Elizabeth of York]]"
    from: 1486-01-18
"@ "First Tudor king, victor at [[Battle of Bosworth Field]]."
Note "$T/People/Elizabeth of York.md" @"
type: person
born: 1466-02-11
died: 1503-02-11
gender: female
cultures: ["[[House of York]]"]
"@
Note "$T/People/Arthur Tudor.md" @"
type: person
born: 1486-09-20
died: 1502-04-02
gender: male
parents: ["[[Henry VII]]", "[[Elizabeth of York]]"]
cultures: ["[[House of Tudor]]"]
partners:
  - person: "[[Catherine of Aragon]]"
    from: 1501-11-14
    to: 1502-04-02
"@
Note "$T/People/Margaret Tudor.md" @"
type: person
born: 1489-11-28
died: 1541-10-18
gender: female
parents: ["[[Henry VII]]", "[[Elizabeth of York]]"]
cultures: ["[[House of Tudor]]"]
"@
Note "$T/People/Henry VIII.md" @"
type: person
born: 1491-06-28
died: 1547-01-28
gender: male
parents: ["[[Henry VII]]", "[[Elizabeth of York]]"]
cultures: ["[[House of Tudor]]", "[[Church of England]]"]
partners:
  - person: "[[Catherine of Aragon]]"
    from: 1509-06-11
    to: 1533-05-23
    kind: annulled
  - person: "[[Anne Boleyn]]"
    from: 1533-01-25
    to: 1536-05-17
    kind: annulled
  - person: "[[Jane Seymour]]"
    from: 1536-05-30
"@
Note "$T/People/Mary Tudor, Queen of France.md" @"
type: person
born: 1496-03-18
died: 1533-06-25
gender: female
parents: ["[[Henry VII]]", "[[Elizabeth of York]]"]
cultures: ["[[House of Tudor]]"]
"@
Note "$T/People/Catherine of Aragon.md" @"
type: person
born: 1485-12-16
died: 1536-01-07
gender: female
parents: ["[[Ferdinand II of Aragon]]", "[[Isabella I of Castile]]"]
cultures: ["[[Crown of Castile]]"]
"@
Note "$T/People/Anne Boleyn.md" @"
type: person
born: c. 1501
died: 1536-05-19
gender: female
parents: ["[[Thomas Boleyn]]", "[[Elizabeth Howard]]"]
cultures: ["[[Church of England]]"]
"@
Note "$T/People/Jane Seymour.md" @"
type: person
born: c. 1508
died: 1537-10-24
gender: female
cultures: ["[[Church of England]]"]
"@
Note "$T/People/Mary I.md" @"
type: person
born: 1516-02-18
died: 1558-11-17
gender: female
parents: ["[[Henry VIII]]", "[[Catherine of Aragon]]"]
cultures: ["[[House of Tudor]]"]
"@
Note "$T/People/Elizabeth I.md" @"
type: person
born: 1533-09-07
died: 1603-03-24
gender: female
parents: ["[[Henry VIII]]", "[[Anne Boleyn]]"]
cultures: ["[[House of Tudor]]", "[[Church of England]]"]
"@
Note "$T/People/Edward VI.md" @"
type: person
born: 1537-10-12
died: 1553-07-06
gender: male
parents: ["[[Henry VIII]]", "[[Jane Seymour]]"]
cultures: ["[[House of Tudor]]", "[[Church of England]]"]
"@

Note "$T/Places/England.md" @"
type: place
coordinates: [52.6, -1.5]
"@
Note "$T/Places/London.md" @"
type: place
coordinates: [51.5074, -0.1278]
located-in: "[[England]]"
"@
Note "$T/Places/Westminster Abbey.md" @"
type: place
coordinates: [51.4993, -0.1273]
located-in: "[[London]]"
"@
Note "$T/Places/Tower of London.md" @"
type: place
coordinates: [51.5081, -0.0759]
located-in: "[[London]]"
"@
Note "$T/Places/Greenwich Palace.md" @"
type: place
coordinates: [51.4826, -0.0077]
located-in: "[[London]]"
"@
Note "$T/Places/Hampton Court Palace.md" @"
type: place
coordinates: [51.4036, -0.3378]
located-in: "[[England]]"
"@
Note "$T/Places/Bosworth Field.md" @"
type: place
coordinates: [52.5916, -1.4105]
located-in: "[[England]]"
"@
Note "$T/Places/Balinghem.md" @"
type: place
coordinates: [50.8483, 1.9056]
summary: Site of the Field of the Cloth of Gold, near English-held Calais.
"@
Note "$T/Places/Gravelines.md" @"
type: place
coordinates: [50.9867, 2.1281]
"@

Note "$T/Events/Battle of Bosworth Field.md" @"
type: event
date: 1485-08-22
participants: ["[[Henry VII]]"]
places: ["[[Bosworth Field]]"]
cultures: ["[[House of Tudor]]", "[[House of York]]"]
importance: 5
tags: [war]
"@ "Henry Tudor defeats Richard III, ending the Wars of the Roses."
Note "$T/Events/Marriage of Henry VII and Elizabeth of York.md" @"
type: event
date: 1486-01-18
participants: ["[[Henry VII]]", "[[Elizabeth of York]]"]
places: ["[[Westminster Abbey]]"]
cultures: ["[[House of Tudor]]", "[[House of York]]"]
importance: 4
"@
Note "$T/Events/Coronation of Henry VIII.md" @"
type: event
date: 1509-06-24
participants: ["[[Henry VIII]]", "[[Catherine of Aragon]]"]
places: ["[[Westminster Abbey]]"]
cultures: ["[[House of Tudor]]"]
importance: 4
"@
Note "$T/Events/Field of the Cloth of Gold.md" @"
type: event
date: 1520-06-07
end: 1520-06-24
participants: ["[[Henry VIII]]", "[[Catherine of Aragon]]"]
places: ["[[Balinghem]]"]
cultures: ["[[House of Tudor]]"]
tags: [diplomacy]
"@
Note "$T/Events/Act of Supremacy.md" @"
type: event
date: 1534-11
participants: ["[[Henry VIII]]"]
places: ["[[Westminster Abbey]]"]
cultures: ["[[Church of England]]"]
importance: 5
tags: [religion]
"@
Note "$T/Events/Execution of Anne Boleyn.md" @"
type: event
date: 1536-05-19
participants: ["[[Anne Boleyn]]"]
places: ["[[Tower of London]]"]
cultures: ["[[House of Tudor]]"]
importance: 4
"@
Note "$T/Events/Birth of Elizabeth I.md" @"
type: event
date: 1533-09-07
participants: ["[[Elizabeth I]]", "[[Anne Boleyn]]"]
places: ["[[Greenwich Palace]]"]
importance: 2
"@
Note "$T/Events/Birth of Edward VI.md" @"
type: event
date: 1537-10-12
participants: ["[[Edward VI]]", "[[Jane Seymour]]"]
places: ["[[Hampton Court Palace]]"]
importance: 2
"@
Note "$T/Events/Coronation of Elizabeth I.md" @"
type: event
date: 1559-01-15
participants: ["[[Elizabeth I]]"]
places: ["[[Westminster Abbey]]"]
cultures: ["[[House of Tudor]]", "[[Church of England]]"]
importance: 4
"@
Note "$T/Events/Spanish Armada.md" @"
type: event
date: 1588-07
end: 1588-08
participants: ["[[Elizabeth I]]"]
places: ["[[Gravelines]]"]
cultures: ["[[House of Tudor]]"]
importance: 5
tags: [war]
"@

Note "$T/Tudors overview.md" "tags: [overview]" @"

# The Tudors

All views below are live: edit any note and they update.

``````chronicle-timeline
folder: Tudors
group: culture
lifespans: true
``````

``````chronicle-family
root: Henry VIII
up: 2
down: 1
``````

``````chronicle-map
folder: Tudors
trace: Henry VIII
``````

``````chronicle-lineage
folder: Tudors
``````
"@

# ---------------- Vael (custom calendar, image map) ----------------
$V = "Vael"
Note "$V/Vael Map.md" @"
type: map
image: "[[vael-map.svg]]"
"@ "The known lands of Vael, drawn by the cartographers of the Order of the Ash."

Note "$V/Cultures/Old Vaelic Peoples.md" @"
type: culture
founded: FE 40
dissolved: FE 610
color: "#a0785a"
"@
Note "$V/Cultures/Kingdom of Vael.md" @"
type: culture
founded: FE 600
parent-cultures: ["[[Old Vaelic Peoples]]"]
color: "#3b6fd4"
related-cultures:
  - culture: "[[Eastmarch]]"
    kind: rival
"@
Note "$V/Cultures/Eastmarch.md" @"
type: culture
founded: FE 655
parent-cultures: ["[[Old Vaelic Peoples]]"]
color: "#c4453a"
"@
Note "$V/Cultures/Order of the Ash.md" @"
type: culture
founded: SE 12
parent-cultures: ["[[Kingdom of Vael]]"]
color: "#6b7280"
"@
Note "$V/Cultures/Free City of Greyford.md" @"
type: culture
founded: SE 140
parent-cultures: ["[[Kingdom of Vael]]"]
color: "#16a085"
"@

Note "$V/People/Edric Vane.md" @"
type: person
born: FE 760
died: FE 811
gender: male
cultures: ["[[Kingdom of Vael]]"]
partners:
  - person: "[[Lysa Marrow]]"
    from: FE 785
"@
Note "$V/People/Lysa Marrow.md" @"
type: person
born: FE 765
died: SE 30
gender: female
parents: ["[[Oswin Marrow]]"]
cultures: ["[[Kingdom of Vael]]"]
"@
Note "$V/People/Aldric Vane.md" @"
type: person
born: FE 790
died: c. SE 40
gender: male
parents: ["[[Edric Vane]]", "[[Lysa Marrow]]"]
cultures:
  - culture: "[[Kingdom of Vael]]"
  - culture: "[[Order of the Ash]]"
    from: SE 12
    role: Knight-Commander
partners:
  - person: "[[Mira Thorne]]"
    from: SE 1
relations:
  - person: "[[Corin Hale]]"
    kind: mentor
"@ "Knight-Commander of the Order of the Ash. Use **Trace a journey** on the map to follow him."
Note "$V/People/Bran Vane.md" @"
type: person
born: FE 794
died: SE 3
gender: male
parents: ["[[Edric Vane]]", "[[Lysa Marrow]]"]
cultures: ["[[Kingdom of Vael]]"]
"@
Note "$V/People/Mira Thorne.md" @"
type: person
born: FE 795
died: SE 52
gender: female
cultures: ["[[Eastmarch]]"]
"@
Note "$V/People/Corin Hale.md" @"
type: person
born: FE 770
died: SE 20
gender: male
cultures: ["[[Order of the Ash]]"]
"@
Note "$V/People/Tamsin Vane.md" @"
type: person
born: SE 3
died: SE 70
gender: female
parents: ["[[Aldric Vane]]", "[[Mira Thorne]]"]
cultures: ["[[Free City of Greyford]]"]
partners: ["[[Jory Bell]]"]
"@
Note "$V/People/Rowan Vane.md" @"
type: person
born: 14 Thawmoon SE 6
died: SE 31
gender: male
parents: ["[[Aldric Vane]]", "[[Mira Thorne]]"]
cultures: ["[[Order of the Ash]]"]
"@
Note "$V/People/Wren Bell.md" @"
type: person
born: SE 30
gender: female
parents: ["[[Tamsin Vane]]", "[[Jory Bell]]"]
"@

Note "$V/Places/Vael Crown.md" @"
type: place
map: "[[Vael Map]]"
position: [520, 360]
cultures: ["[[Kingdom of Vael]]"]
summary: Royal seat of the Kingdom of Vael.
importance: 5
"@
Note "$V/Places/Greyford.md" @"
type: place
map: "[[Vael Map]]"
position: [330, 520]
cultures: ["[[Free City of Greyford]]"]
"@
Note "$V/Places/Eastmarch Keep.md" @"
type: place
map: "[[Vael Map]]"
position: [905, 300]
cultures: ["[[Eastmarch]]"]
"@
Note "$V/Places/Ashen Abbey.md" @"
type: place
map: "[[Vael Map]]"
position: [640, 175]
cultures: ["[[Order of the Ash]]"]
"@
Note "$V/Places/Thornwood.md" @"
type: place
map: "[[Vael Map]]"
position: [760, 560]
"@

Note "$V/Events/Founding of Vael.md" @"
type: event
date: FE 600
places: ["[[Vael Crown]]"]
cultures: ["[[Kingdom of Vael]]"]
importance: 5
"@
Note "$V/Events/Sundering of the East.md" @"
type: event
date: c. FE 655
places: ["[[Eastmarch Keep]]"]
cultures: ["[[Eastmarch]]", "[[Old Vaelic Peoples]]"]
importance: 4
tags: [war]
"@
Note "$V/Events/Coronation of Edric.md" @"
type: event
date: 12 Seedrise FE 790
participants: ["[[Edric Vane]]", "[[Lysa Marrow]]"]
places: ["[[Vael Crown]]"]
cultures: ["[[Kingdom of Vael]]"]
importance: 4
"@
Note "$V/Events/Marriage of Aldric and Mira.md" @"
type: event
date: 3 Greenmoot SE 1
participants: ["[[Aldric Vane]]", "[[Mira Thorne]]"]
places: ["[[Vael Crown]]"]
cultures: ["[[Kingdom of Vael]]", "[[Eastmarch]]"]
"@
Note "$V/Events/Battle of Greyford.md" @"
type: event
date: 14 Highsun SE 3
end: 16 Highsun SE 3
participants: ["[[Aldric Vane]]", "[[Bran Vane]]", "[[Corin Hale]]"]
places: ["[[Greyford]]"]
cultures: ["[[Kingdom of Vael]]", "[[Eastmarch]]"]
importance: 5
tags: [war]
"@
Note "$V/Events/Founding of the Order of the Ash.md" @"
type: event
date: SE 12
participants: ["[[Aldric Vane]]", "[[Corin Hale]]"]
places: ["[[Ashen Abbey]]"]
cultures: ["[[Order of the Ash]]"]
importance: 4
"@
Note "$V/Events/Siege of Eastmarch Keep.md" @"
type: event
date: SE 20
end: SE 22
participants: ["[[Aldric Vane]]", "[[Rowan Vane]]", "[[Corin Hale]]"]
places: ["[[Eastmarch Keep]]"]
cultures: ["[[Order of the Ash]]", "[[Eastmarch]]"]
importance: 4
tags: [war]
"@
Note "$V/Events/Death of Aldric.md" @"
type: event
date: c. SE 40
participants: ["[[Aldric Vane]]"]
places: ["[[Thornwood]]"]
importance: 3
"@
Note "$V/Events/Greyford Charter.md" @"
type: event
date: SE 140
places: ["[[Greyford]]"]
cultures: ["[[Free City of Greyford]]", "[[Kingdom of Vael]]"]
importance: 4
tags: [politics]
"@

Note "$V/Vael overview.md" "tags: [overview]" @"

# The world of Vael

Dates here use the **Vaelic Reckoning** (see Settings → Chronicle → Calendars).

``````chronicle-timeline
folder: Vael
group: culture
``````

``````chronicle-map
map: Vael Map
trace: Aldric Vane
``````

``````chronicle-graph
focus: Aldric Vane
depth: 2
``````
"@
Write-Host "Example notes written."
