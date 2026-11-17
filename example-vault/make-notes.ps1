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
cultures: ["[[House of Tudor]]", "[[Church of England]]", "[[Latin]]"]
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
cultures: ["[[English]]"]
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

# Languages are groups of kind "language": they appear under Language on the people and places that use them.
Note "$T/Cultures/English.md" @"
type: culture
kind: language
"@ "The language of the court and the country."
Note "$T/Cultures/Latin.md" @"
type: culture
kind: language
"@ "The language of the Church, the law and diplomacy. Elizabeth I read and spoke it well."
Note "$T/Cultures/Welsh.md" @"
type: culture
kind: language
"@ "The language of Wales, where the Tudor family came from."

# A creature: it has no dates, so it stays off the timeline, and is listed under the places it is found in.
Note "$T/Creatures/Red Dragon.md" @"
type: creature
kind: dragon
places: ["[[Bosworth Field]]"]
cultures: ["[[House of Tudor]]"]
"@ "The red dragon of Wales, carried on Henry Tudor's banner at [[Battle of Bosworth Field]] and later a royal badge of the Tudors."

# An object: its holders and the places it was kept, each with dates, make its journey (the map's Trace a journey) and its bars on the timeline.
Note "$T/Objects/Bosworth Crown.md" @"
type: object
kind: crown
destroyed: 1649
cultures:
  - person: "[[Henry VII]]"
    from: 1485-08-22
    to: 1509-04-21
  - person: "[[Henry VIII]]"
    from: 1509-04-22
    to: 1547-01-28
  - person: "[[Edward VI]]"
    from: 1547-01-28
    to: 1553-07-06
  - person: "[[Mary I]]"
    from: 1553-07-19
    to: 1558-11-17
  - person: "[[Elizabeth I]]"
    from: 1558-11-17
    to: 1603-03-24
places:
  - place: "[[Bosworth Field]]"
    from: 1485-08-22
    to: 1485-08-23
  - place: "[[Westminster Abbey]]"
    from: 1485-10-30
    to: 1649-01-30
"@ "Tradition says Richard III's crown was found on the field at Bosworth and set on Henry's head. A legend; the royal regalia was sold or melted down in 1649."
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

``````chronicle-map
folder: Tudors
trace: Bosworth Crown
``````
"@

Write-Host "Example notes written."
