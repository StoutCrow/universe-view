# UniverseView for Obsidian


> Full disclosure, **this was completely made with AI**. I 'dictated' it, but know jack about coding. It was coded completely by Claude, using different models: Opus 5.5, and Sonnet 5.5 advised by Opus.
> According to the AI, this plugin has over 550 unit tests and was exercised in a browser test harness. However it has not been reviewed line by line by a human developer. Back up your vault, and use Undo freely: every change UniverseView makes to your notes can be undone (the clock button on any view lists them all).

Turn ordinary notes into **timelines, family trees, maps, calendars, organisation charts and more**, for history, genealogy, worldbuilding, fiction and tabletop campaigns. It handles fictional calendars and hand-drawn maps.

Your notes stay plain Markdown: UniverseView only reads properties (frontmatter, and Dataview inline fields if you use Dataview), and writes back only when you edit through it.

## New in 3.0

**A look you can build.** Every theme now brings its own buttons, tabs, panel edges, icon weight and heading style (Parchment: outlined buttons, folder tabs, ornate corner brackets and a flourish under its title; Starfield: glowing buttons and capitals; Scholar: ruled buttons and small-caps headings). Settings â†’ Look â†’ Surface & motion shows each style as a live card, so you can swap any of them, add a font pair, and copy the whole look to another vault.

**Lighter maps.** *Simplify* is tried on first, with the old outline dashed and nothing saved until you press Apply, and it can run on every area at once. *Simplify as I draw* thins what Fill, Brush and Expand make. *Grow* has a live preview. *Roughen borders* now draws a shared border as one line, so it never overlaps a neighbour.

**Steadier everywhere.** Controls keep a fixed width, so the Options panel and toolbar no longer jump when a value changes, and hover cards open reliably. The side tabs and the About page show the running version and a build number that rises with every commit.

## New in 2.0

**One home for your whole world.** The star button opens UniverseView in a single tab, with big tabs down the side (Home, People, Groups, Places, Time, Library, Tools, Settings) and smaller tabs along the top.

- **Everything in one place**: every view lives in the dashboard, and links, right-click menus and commands open the right tab. *Open in new tab* still gives a view its own tab.
- **Made your own**: switch any module off in Settings â†’ Modules, drag the big tabs into order, and drag, resize or hide the cards on Home and Library. Every view remembers its filters, layers and arrangement, and one click puts it back to its defaults.
- **Files panel**: the Library's tree in Obsidian's left sidebar, with colours by realm and tier, search, type filters and counts.
- **War and occupation**: lands can be held for a while without changing their borders. The occupier's stripes show at those dates, and *Play on the map* runs the time slider through a war.
- **Faster map painting**: the Land painter moves from land to land, Push moves a neighbour's border along with yours in one undo, and Stay on land keeps paint off the sea.
- **Short forms**: one line where a block of properties used to go.

  ```yaml
  sides: "[[Union]], [[Kansas]] vs [[Confederacy]]"
  transfers: "[[Texas]]: [[Mexico]] > [[United States]]"
  occupied: "[[Virginia]] by [[United States]] (1861 â€“ 1865)"
  ```

  A battle with no `sides:` fights as its war, and `alliance:` lets one note stand for all its members. The inspector reads every form and saves the shortest.
- **A fuller inspector**: About shows what the editor holds, from sides and battles to holders, names, occupations and any other property on the note.
- **A calmer look**: flat cards and solid panels, sentence-case labels, and tabs that answer at once. Themes keep their own character.

## Everything it does

**See your world**
- **Timeline**: events sort into lanes by type, and each nation's bar carries its history as marks: its wars and events, renamings, heirs and occupations, each category in its own shape (arrows for wars, diamonds for renamings, chevrons for heirs), with a key on the lane and the same shapes in the lineage. Drag lanes into any order (right-click a lane to reset it), with every row fixed however far you zoom (Alt + scroll makes the rows taller). From millennia down to days, framed on where your history happens (a creation myth ten thousand years back no longer squeezes it into a sliver). It has eras, eras inside eras, realms, groups, places and lifespans as spans, lanes by category (battles, treaties, coronationsâ€¦ each in its own colour, any of them hidden from the Categories menu), realm, group, place or person, arrows from causes to their consequences (leaving a long event at the moment the next one began), story chapters, and spans still going drawn to the *current year*. Drag events to change their dates; click one for its card (people, places, sides, battles) beside the timeline. One *Show* menu picks the layers, reigns and renamings included.
- **Family tree**: three layouts (tree, fan chart, over time), with half-siblings, adoption and pedigree collapse, and *How related?* for any two people.
- **Realms and dynasties**: who holds what, strategy-game style. Every title (kingdom, duchy, county, town) sits under its liege, read from what your notes already say (`location:`, `nation:`, tags like #Nation_United_States, or the folder note above), with its holder, their house and the ruler at the top. See it as a **realm tree**, as **dynasties** with their cadet branches and the titles each house holds, or as organisations; houses over time are one click away.
- **Cards for every realm, house and organisation**, with logos, holders, leaders and members. Alliances, rivalries, vassalage, trade and ties between people are drawn between the cards.
- **Lineage of groups** (the timeline's second mode: switch between Events and Lineage on its toolbar, keeping the same years, zoom and nation in view): realms, houses, faiths and peoples from founding to fall, in lanes by kind, with splits and lines of descent, events and changes of leader on each bar, a legend to filter by kind, undated groups listed, and the picked group read in a side panel.
- **Connections**: a live graph of everything, with a time slider. Drag between notes to tie them.
- **Map**: the real world or your own image maps. It has territories, routes, journeys with travel times, travel rings, borders from seats of power, coasts and roads traced from the image, a different map image per era, compare side by side, map notes, a heat map, grouped pins, and **realm tiers**: realms show whole from afar and split into their duchies and counties as you zoom in (or double-click them); a click picks one, with a trail back out, and pins and the legend coloured by realm, liege or house with who holds each.
- **Calendar**: your world's calendar as months, a week, a year, or what's coming up, with a go-to-date box, keyboard moves and anniversaries. It has weekdays, festival days outside the weeks, leap years, any number of moons, seasons, holidays, repeating events, birthdays and story chapters, and a converter between calendars.
- **Table**: any kind of note as a spreadsheet you edit in place.
- **The UniverseView dashboard**: every view and tool in one tab, with movable big tabs, modules you can switch off and pages you can rearrange.
- **Library, Board and Overview**: browse, check and arrange everything; boards hold any mix of views.

**Work on it**
- **Realms and cultures** (Ctrl+Alt+K): every realm as a tree of its titles, every house with its cadet branches, and every other group (faiths, peoples, guilds), with each one's full panel beside the list.
- **Inspector** (Ctrl+Alt+I): one side panel for the note you're on, in any view, built from parts rather than text: its picture and chips, its place in its realm, its span against today with its events, numbers at a glance, every linked person, place, group and title as a clickable chip, relationships coloured by kind; who it's under, who holds it and its vassals (or, for a person or house, everything they hold), with its kind, pin size and map layer; and a layered edit form. Tabs for its timeline, its place on the map, what links to it, and how UniverseView reads it.
- **Hover cards** on everything: pin them, drag them by their handle and stack them to compare. How long before one opens, and how long it stays, are in Settings (hold Alt to open one at once); keys while one is open: P pin, I inspect, E edit, O open.
- **Quick creator** (Ctrl+Alt+Q, or the + in the inspector): one line, or one per line with `all:` for what they share, fills in a form of what matters for that kind of note. Everything can be set by hand, tags follow your vault's own standard as you go (`#Event_War` where your events use that pattern), and you land on the new note in the inspector. Tab finishes names, and Up brings back earlier lines.
- **New notes filed where they belong**: James II goes into House Whitmore's folder (Living or Dead), a fort into its county, an event where it happened.
- **Regions and realms**: geography (continents, sub-continents, islands) is told apart from ruled land (kingdoms, duchies, counties), so a kingdom lying in a sub-continent stays sovereign. A **land tag standard** asks what each note is (title or region, tier, size) and writes `#Title #Province #Region_Small` or `#Region #Region_Enormous`, with a review of every place before anything changes.
- **Territories you shape**: split a land off an area by drawing a line, draw new lands inside one, styled edges (inner band, double line, glow, shadow) and textures (hatching, dots, parchment grain) per tier. Lands split from their realm when zoomed in and merge back into it zoomed out; moving a pin or area into another land moves its note there.
- **File explorer**: folder notes built in (click a folder to open its note, the note itself hidden, names kept in step, live folder overviews), icons for each note's type and kind, colours by realm and tier (a county in a softer shade of its duchy), the path above a note in realm colours, optional tier ordering, and hover cards.
- **Relationships**: allies, rivals, enemies, mentors, liege and vassals, trade partnersâ€¦ set up ready to fill in on new notes, with the other side shown automatically.
- **World notes**: one note per world for its calendar, today's date, main map, travel speeds, succession rule and default relationships.
- **Fog of war**: see the map, timeline or graph as one character knows it.
- **Wars and battles**: a battle's `sides:` (who fought, on which side, who won) and its `war:`. Battles show on the map as crossed swords in the winner's colour, joined in order as their war's campaign, following the time slider; a war lists its battles and each side's wins in the inspector, and the Board has a *Wars* list. A battle with no `sides:` takes its war's. `occupied:` marks lands held for a while, shown as the occupier's stripes without moving any border, and *Play on the map* runs the time slider through the war.
- **Undo history** (Ctrl+Alt+Shift+Z, or the clock button on any view): every change UniverseView made, newest first, with the notes it touched; undo one or go back to any point.
- **Settings search**: every setting shows up in Obsidian's own settings search.
- **Strategy map look** (the default; Look â†’ Map style switches to Atlas): realms in solid colour from afar that thin out as you zoom in, one bold border round each realm with thinner ones for the lands inside, and realm names in spaced capitals curved across their land, with their arms when they have a logo. **Map modes**: colour the lands by realm, title, ruling house, culture or faith, or show the bare terrain.
- **Border check** (Draw â†’ Check borders): overlaps, thin gaps, lands sticking out of their realm, partly covered lands, crossed borders and slivers, each with *Show* and a fix (close the gap, reshape, delete), or *Fix all* at once.
- **Map editing made for real maps**: click a territory for a panel of every tool; borders snap onto coasts, rivers and neighbours and follow them between corners; *Fill* works like a paint bucket over land or sea; *Expand* and *Brush* grow the same area; *Simplify* takes out needless corners while shared borders stay matched; and every save keeps borders sound (no spikes, loops or slivers between lands).
- **Map looks**: six presets (*Grand strategy* like Crusader Kings, *Old atlas*, *Hand-drawn fantasy*, *Clean political*, *Terrain first*, *Standard*) or your own saved looks; a soft glow of each realm's colour inside its border; rivers drawn as water widening to the mouth; borders roughened to look hand-drawn while staying simple to edit.
- **Map names where there's room**: each name sits in the open middle of its land (clear of its sub-lands when split open), sized to fit, and tilted along long thin lands.
- **Inspector saves as you go**: every field saves itself (a moment after you stop typing, or when you leave it), with Undo; no Save button.
- **Timeline lanes and clusters**: by realm, reigns sit with the title held and battles with each side; dots too close to tell apart become one marker with a count (click to zoom in).
- **Family tree for big houses**: fold any branch, *Find in this tree*, and the titles each person holds on their card.
- **Relatives without notes**: hover a card and use its **+** handles (parent above, child below, partner beside), or right-click â†’ *Add by name*, to grow the tree by typing names, no notes made. Relatives with no note can have relatives too: their families are kept as lines in a `relatives:` property on a note that mentions them (`Bob + Mary > Carol, Dan` is a couple and their children; `Gwen + Hal` is just a couple), and the tree draws the whole branch. Click a *Not created yet* card for what you can do with it, including writing it up as a note.
- **One right-click menu**: Inspect, Open note and Open beside, then **Show in** (the views) and **Find out** (related toâ€¦, succession, why did this happen), with the view's own tools below and anything that removes last. **Alt+click** anything with a hover card (a card, a pin, a bar, a row) opens it in the inspector.
- **Realm tree you rearrange**: drag a title onto a new liege (or a house onto its parent house); loops are refused, and links are written so two notes of the same name can't be confused.
- **Calendar bars**: events lasting several days run across them as one bar.
- **Connections**: filter by kind of link, click to pick a note (its neighbours stay lit), and notes you drag stay where you put them.
- **Linked boards**: focus a board on one note, or turn on *Linked* and click anything in a module to focus every module on it.
- **Data checks that fix**: create missing notes, place a place on its map, or make a missing map note in one click; Inspect for the rest.
- **Quick creator batches**: with several lines, untick one to leave it out, click its kind to change it, and see how each links (to notes you have, to others in the batch, or to new names).
- **Writing tools**: story continuity checks, who knows what, lines of succession, name and story ideas, ages and dates inside your text.
- **Smart reader** (Tools â†’ Check, or the command): reads your notes' text for what their properties don't say yet: birth and death dates and places, occupations, when events happened and places were founded, and other people's dates ("[[Alice]] (b. 1200)", which goes on Alice's note). Each fact shows its sentence, you can edit it, and nothing is written until you press Add. Dates are read in the note's own calendar.
- **Normalise all tags** (Tools â†’ Tidy): brings every note to the tags your vault already uses. Each spelling becomes the usual one, and a note gains the tags its folders, realm, kind and dates justify (`#Character_Dead` for someone with a death date, `#Event_War` for a war). You review every change, and one Undo reverses it.
- **Tidying**: duplicates (with merge), loose ends (including notes that share a name), moving notes into the folder notes they belong in, Living/Dead moves on a death date, tags updated when a note is renamed, tag clean-up, how complete a world is, text that contradicts the properties, and data checks.
- **Export**: PNG or SVG pictures, decorated maps, a world book, a whole website, and GEDCOM. GEDCOM import too.
- **Looks**: six themes, light and dark, and every view embeddable in a note.
- **Fits your vault**: reads Charted Roots, tag-typed vaults, lifespans like `1262 - 1294 C.E.`, and your own property names. Everything it changes can be undone.

What changed in each version is in the [changelog](CHANGELOG.md), and inside UniverseView: after an update a *What's new* window shows what changed since the version you had, and the action *What's new (version history)* (or Settings â†’ Look & cards â†’ About) shows every version.

## Installing

UniverseView isn't in Obsidian's community plugin list yet. Until it is:

- **With BRAT:** install the *BRAT* plugin from the community list, then *Add beta plugin* with this repository's address.
- **By hand:** from the latest release, download `main.js`, `manifest.json` and `styles.css` into a folder `.obsidian/plugins/universe-view/` inside your vault, then turn UniverseView on in Settings â†’ Community plugins.

It works on desktop and on phones and tablets. Very large map pictures (over 4,096 px across) are shown on phones from a smaller copy the desktop app saves in `UniverseView/Map copies/`, so open such a map once on a computer.

## Quick start

The dashboard opens by itself after installing. In a vault with nothing for it yet, Home offers to read your notes, add a small sample world (the Tudors), or start from scratch. To set a note up by hand:

1. Give a note a `type` property: `event`, `person`, `culture`, `place` or `map`
   (synonyms like `character`, `faction`, `nation`, `city` work too, as do tags like `#person` or folder rules).
2. Add a few properties:

```yaml
# Events/Battle of Greyford.md
type: event
date: 14 Highsun SE 3      # or 1243-05-14, May 1243, c. 1240, 350 BCE, 1240..1245
end: 16 Highsun SE 3
participants: ["[[Aldric Vane]]"]
places: ["[[Greyford]]"]
cultures: ["[[Kingdom of Vael]]"]
importance: 5               # 1â€“5
```

```yaml
# People/Aldric Vane.md
type: person
born: FE 790
died: c. SE 40
parents: ["[[Edric Vane]]", "[[Lysa Marrow]]"]
partners:
  - person: "[[Mira Thorne]]"
    from: SE 1
cultures:
  - culture: "[[Order of the Ash]]"
    from: SE 12
    role: Knight-Commander
relations:
  - person: "[[Corin Hale]]"
    kind: mentor
```

```yaml
# Places/London.md                     # Places/Greyford.md (on an image map)
type: place                            type: place
coordinates: [51.507, -0.128]          map: "[[Vael Map]]"
located-in: "[[England]]"              position: [330, 520]   # pixels from top-left
```

```yaml
# Vael Map.md
type: map
image: "[[vael-map.png]]"
```

Only write each relationship once â€” UniverseView infers children, siblings, the other side of a partnership, members of a culture and events at a place.

3. Click the **star** in the ribbon to open the dashboard, or use the command palette: "UniverseView: Actions..." finds every view and action by name.

## Opening the views

- **Left sidebar:** the star opens the dashboard, with every view behind its big tabs. Home has a summary of your world, quick â€œNew â€¦â€ buttons, key events, houses, people, places and recent edits. *Sidebar button for every view* in Settings gives each view its own button too.
- **Shortcuts:** none are set for you, so they never clash with yours. Turn on *Suggested shortcuts* (Settings â†’ UniverseView â†’ Look & cards) for the ones below, or set your own in Settings â†’ Hotkeys (search â€œUniverseViewâ€). The shortcuts named elsewhere in this README are these suggested ones.

  | Ctrl+Alt (âŒ˜âŒ¥ on Mac) + | Opens |
  |---|---|
  | O | Overview |
  | H | Dashboard (files, relationships, settings) |
  | B | Board (your own arrangement of views) |
  | T | Timeline |
  | F | Family tree |
  | G | Connections graph |
  | L | Culture lineage |
  | K | Realms and cultures |
  | R | Realm and dynasty chart |
  | M | Map |
  | C | Menu of all views and actions |
  | N | New note |
  | J | Jump to a note in the view that suits it |
  | Z | Undo the last change UniverseView made |
  | D | Detect types & relationships |

- **Right-click** a note, a link, a tab or inside the editor: *Show on timeline*, *Show family tree*, *Show on map*, *Show connections*, *Add childâ€¦*, *Add event hereâ€¦*. Right-click a **folder** for its overview, timeline, map or graph.
- **Command palette:** type â€œUniverseViewâ€. A few commands live in the palette itself (the dashboard, the quick menu, New note, Quick creator, the inspector, Undo and Jump to). **Actions...** opens a searchable list of everything else: every view, export, check and tool. The dashboard's Tools tab offers the same actions as cards. Right-clicking a tile on the overview offers *Open in new tab*, *Open to the right* and *Add to board*.

## Views

| View | What it does |
|---|---|
| **Timeline** | Zoomable from millennia to days. **Eras** are shaded behind it: your calendar's eras, plus any event note with `kind: era` (or age, period, reign, dynasty, war) that has a start and end. Group lanes by category, culture, place, person, tag or kind; the Categories menu shows or hides each kind of event (from a note's category:, kind: or tag). Lifespans, births/deaths and culture spans can be layered in. Double-click empty space to create an event on that date. |
| **Family tree** | Ancestors above, descendants below, siblings beside, all partners shown. Handles multiple marriages, half-siblings, adoption (dashed) and pedigree collapse (duplicate cards). Double-click someone to centre the tree on them; â€œFollow active noteâ€ keeps it in sync with the editor. Missing people appear as dashed cards you can click to create. Two more layouts: a **fan chart** of ancestors, and **over time**, descendants as bars along a time axis. **How related?** names the relationship between any two people (half-sister, great-uncle, father-in-lawâ€¦) and shows the path. |
| **Connections** | Force-directed graph of people, cultures, places and events. Focus on one note and a number of steps, and scrub the **time slider** to see who was alive and allied when. |
| **Culture lineage** | Groups as bars from founding to dissolution, each with its logo (or initial), dates and members, branches drawn from the moment they split. Groups still standing fade out at the current year, marked by a *Today* line. Hover one to bring out its whole line of descent. It moves like the timeline: the wheel zooms through time (or scrolls, when there are more groups than fit), dragging pans, and the dates stay at the top. |
| **Realms and dynasties** | Three trees in one view. **Realms:** every title under its liege, each card with its holder (and the ruler above, when someone else), house and vassals. **Dynasties:** houses with their cadet branches (`branch-of:`), heads and members, and chips for the titles each holds; *Houses over time* opens the generational view. **Organisations:** a faction, guild or company as a tree of cards: sub-organisations (`parent-org:`, `branches:`, or groups listing it under `cultures:`) below it, and in each card its **logo** (click the logo area to pick an image; a monogram stands in until then), leaders (â˜…, from roles like king, head, commander, or `leader:`/`ruler:` on the group's note) and members with their roles. **Relationships are drawn between the cards:** alliances (green), rivalries and wars (red, dashed), liege and vassal (purple arrows), trade (gold, dotted), and ties between the people on the cards (thin dotted lines). Each card also lists all its group ties as chips, including groups not on the chart. Hover a card or a line to bring out its ties; click a kind in the legend to hide it. Underneath, a timeline of when each group existed and who held which role (dashed bars are memberships without their own dates, drawn across the person's life). The time slider, or a click on the timeline's dates, shows the organisation as it stood on that day. Double-click a card to put it at the top. |
| **Library** | Every folder and note in a tree (with counts by type and problem markers). Pick a note to edit its basics in place (type, dates with live checking, kind, size and layer for places, importance, color, icon, summary) and to see every relationship in both directions with a small graph, plus plain links and backlinks and all its properties. Pick a folder for its settings (what its notes are, which calendar, leave it out) and a sortable table of its notes. With nothing picked: basic settings, problems and recent edits. Type and kind are written the way the note already marks them (a property, a tag like `#City`, or `cr_type`). Each relationship group has **+** to link another note (with role and dates for memberships) and an **Ã—** on each row to unlink it, on whichever note the link is written. In a folder's table, tick notes to set their type, kind, map layer, pin size or calendar, or add a tag, all at once. |
| **Map** | Real-world map (OpenStreetMap by default) or your own image maps. Pins show events per place, the time slider filters by date, and **Trace a journey** draws a personâ€™s path through the places of their events. â€œPlace an existing noteâ€ and â€œMove pinsâ€ write coordinates back into the note. |
| **Calendar** | Your world's calendar as months, a year or what's coming up, with moons, seasons, holidays, birthdays and repeating events; see *Calendars* below. |
| **Table** | A spreadsheet of one kind of note, edited in place. |
| **Houses over time** | Houses and dynasties across the generations, with marriages and successions (from the Dynasties toolbar, or ```` ```universeview-houses ````). |

Every view opens notes on click (Ctrl/Cmd-click for a new tab), shows Page Preview on Ctrl-hover, and has a right-click menu to jump to the same note in the other views.

**Export:** the â‹¯ menu on the timeline, family tree, connections, lineage, org chart and map saves a PNG or SVG into `UniverseView exports/`, copies the picture, or opens it for printing (where you can save a PDF). Charts come out whole, not just the part on screen. A map comes out as it shows (tiers, shading, labels, battles and legend, without the zoom buttons or pop-ups), with the time slider's date under it. *Save a time-lapse* draws the map at a series of dates and saves a captioned picture of each, plus one page with every frame.

**Undo:** every change UniverseView makes to your notes (moving pins, painting, editing in the Dashboard, linking, bulk edits) can be undone with the undo button or Ctrl+Alt+Z, up to 50 steps.

On/off buttons show their state: a toggle that's on has a soft fill and a coloured icon, and a map tool's button stays filled with the accent colour while the tool is running (click it again to stop).

## Boards: several views at once

The **Board** (Ctrl+Alt+B) is a dashboard of modules you arrange yourself: timelines, family trees, connection graphs, lineages, maps, â€œat a glanceâ€ numbers, lists of key events/people/places/groups, recent edits, or any note rendered in place.

- **Move** a module by dragging its header; the others flow out of the way. **Resize** it from its bottom-right corner.
- A module's **options** (slider icon) take the same `key: value` lines as embedded code blocks (`group: culture`, `root: Henry VIII`, `map: Vael Map`, `trace: Aldric Vane`â€¦), plus a picker for its main subject.
- The **expand** icon opens the module as a full view. Right-click a header to duplicate or remove it.
- Keep several boards (one per world or project), or start one from a template: *World overview*, *Genealogy desk*, *Atlas*, *Chronology* or *Story board*. *Lock layout* stops accidental drags.
- On narrow panes modules stack in one column. UniverseView views can still be dragged into Obsidian splits as usual.

## Themes and appearance

Settings â†’ UniverseView â†’ **Appearance**, or the action *Switch theme*. Themes restyle only UniverseView's views, boards, embeds, hover cards and dialogs; the rest of Obsidian keeps your theme. Each has a light and a dark variant (Starfield is always dark).

| Theme | Made for |
|---|---|
| **Obsidian** | Any vault: follows your theme and accent |
| **Parchment** | Fantasy worldbuilding and campaigns: aged paper, ink, wax red, engraved headings |
| **Archive** | Genealogy and family history: archival cream, photo-album portraits |
| **Starfield** | Science fiction: deep-space navy, neon glow, a star field behind every view |
| **Scholar** | History and research: crisp paper white, navy and burgundy, fine rules |
| **Atelier** | Novels and story planning: frosted glass, soft gradients, pastels |

Beyond the theme itself, **Settings â†’ Look â†’ Surface & motion** has a card grid for each of these, and a switch ("Themes set buttons, tabs, edges, icons and headings") that decides whether the theme chooses them for you:

- **Buttons**: Quiet, Outlined, Filled, Pill, Stamp, Glow, Ruled.
- **Tabs**: Underline, Folder, Segmented, Plain, Block, Glow, Rule.
- **Edges** (panels, menus, hover cards, the line under each toolbar): Clean, Double rule, Ornate, Stitched, Hand-drawn (optionally a different wobble on every frame), Cut corners, Ledger.
- **Icons**: Light, Regular, Bold. **Headings**: Plain, Ruled, Flourish, Small caps, Capitals.
- **Fonts**: seven heading-and-body pairs from fonts already on your device (nothing is downloaded).
- **Copy look / Paste look** moves your whole look to another vault.

You can also override the **accent and type colors** and choose the **motion** (Off, Snappy, Smooth, Relaxed, Bouncy; your system's reduced-motion setting is respected), **density**, **corner radius** and a **flat style**. Under *Views* are the timeline's row height and label size, the family tree's card size and gender tints â€” everything the Style Settings plugin used to offer, so it's no longer needed.

Settings are on five pages: *Look & cards*, *Notes*, *Time & calendars*, *Maps & realms* (map look, realm border band, rivers, roughen, territory styles) and *Map tools* (snapping, following coasts, keeping off other lands, brush size, Fill and Simplify defaults). The choices you make on a tool's banner are remembered there too.

## Hover cards

Rest the pointer on anything in a UniverseView view (timeline items, tree cards, graph nodes, map pins and territories, list rows) for a card with the essentials: dates with age or duration, birth and death places, parents, partners, children and siblings, who leads a culture and who belongs to it, the chain of regions a place sits in, what happened there, the events just before and after, the opening lines of the note and its first image. Hold Ctrl/Cmd for Obsidian's own page preview instead. Cards can also appear for links in your notes (while holding Alt, or always), and the delay is adjustable.

## Map features

- **Map tools** sit in three menus on the toolbar: *Draw* (paint, fill, routes, map notes), *Travel* (measure, journeys, rings) and *From the image* (coasts, roads and rivers, borders). A menu's button stays lit while one of its tools runs; click it to stop.
- **Territories:** *Draw â†’ Paint* (or right-click a pin) paints an area for a nation, house, faith or region: click corners, or hold and drag to draw freehand; Enter or double-click finishes. **Click a territory** and its editing panel opens along the bottom of the map with every tool for it (Reshape, Simplify, Expand, Brush, Grow, New area, Fill, Dates, New borders, Split, New land, Route, Map notes, Import, Check, Erase, Delete), each with a one-key shortcut. *Reshape* drags corners (click a midpoint to add one, right-click a corner to remove it). Areas follow the time slider and are saved in the note:
  ```yaml
  territory:
    - map: "[[Vael Map]]"
      points: "120,330 300,180 520,120 760,150 790,330"
  ```
- **Fill a territory** (*Draw â†’ Fill*, or *Fill* on a territory's panel; image maps only): by default it fills like a paint bucket by ground (see *Fill land / sea* below). Choose *Fill same colour* to spread over similar colours instead, stopping at coasts, rivers, the border lines drawn in your map image, and other territories. Filled land that overlaps one of the note's areas joins that area. Each click adds another area (islands become extra areas of the same note). *Tolerance* sets how different a colour may be and still count; *Close small/wide gaps* seals dotted or broken border lines; icons and labels inside the area are included. The outline is traced, smoothed and snapped onto neighbouring territories so borders line up. Backspace undoes the last click.
- **Expand and Brush** (a territory's tools, under *Shape*): *Expand* â€” circle new land (click points or drag round it) and it joins the **same** area, its outline grown to take it in. *Brush* â€” paint over land to add it to the same area, or switch to *Rub out* to take land away; Undo takes back a stroke, *Size* (or `[` `]`) sets the brush, and Space+drag moves the map. Either way the corners the area already had stay exactly where they were, so shared borders stay shared, and with *Keep off other lands* (on by default) new ground stops at the neighbours' borders. *New area* paints a separate area instead (an island, an exclave).
- **Land painter** (the palette button on the toolbar): lists your lands; pick one and paint, then pick the next. On the brush, *Push* takes ground from a neighbour and moves both borders in one undo, and *Stay on land* keeps paint off the sea on image maps.
- **Occupied areas** (*Occupied* on a territory's panel): paint part of a land held for a while, with its dates. It shows as stripes at those dates and leaves real borders alone; right-click one to delete it. For a whole land, use `occupied:` on the war or battle.
- **Fill land / sea** (the Fill tool's first choice, like a paint bucket): click land and all the land joined to it fills, whatever is drawn on it â€” hills, forests, names, shading â€” up to the coast, rivers and other territories. Click the sea or a lake and the water fills instead. *Cross rivers* carries on over rivers to the land beyond; *Close small gaps* stops it leaking through a faint stretch of river or a hairline between two lands. *Fill same colour* is the old fill, by the picture's colours.
- **Simplify** (a territory's tools, under *Shape*): fewer corners where they barely change the border, so it's quicker to edit; real detail such as a jagged coast stays. *Strength* sets how far off the line (on screen) a corner may sit and still go, with the corner count previewed before you save. Corners shared with a neighbour go from its border too, so borders stay matched; where a neighbour has corners of its own along the edge, those stay. Pairs well with *Roughen borders*.
- **Territory panel shortcuts:** with a territory's panel open and no tool running, one key starts a tool â€” R Reshape, S Simplify, E Expand, B Brush, G Grow, F Fill, X Split, T Route, C Check, D Dates (each button's tip shows its key); Esc closes the panel.
- **Map look: switch preset** (Actionsâ€¦) switches the whole map look without opening settings.
- **Look presets** (Settings â†’ Maps & realms â†’ Map look): a whole look for maps and territories in one go â€” *Standard*, *Grand strategy* (bold political colour and strong border glow, like Crusader Kings or Europa Universalis), *Old atlas* (ink borders, faint wash, parchment grain), *Hand-drawn fantasy* (wobbly ink, hatching, italic names), *Clean political* (flat strong colour, crisp lines) and *Terrain first* (barely any fill, so a painted map shows). Each sets fills, border colour, lettering, the border band, roughness, rivers and every tier's style. *Save this look* keeps your own settings as a preset to switch back to.
- **Strategy look, grand-strategy style:** from afar realms are solid political colour; close up the fill all but disappears so the drawn map shows, and each realm (and the tier below) keeps a soft band of its colour just inside its border, fading inwards.
- **Rivers** (routes of the river kind) are drawn as water: the course smoothed into curves and widened into a blue ribbon between darker banks, narrow at the source (the first point you drew) and broadening towards the mouth (the last). It widens as you zoom in, like the land; a short stream stays narrow.
- **Roughen borders** (Settings â†’ Map look): long straight borders are drawn with a hand-drawn wobble, so a few clicked corners look like a natural frontier. Only the look changes â€” the notes keep their few editable corners, borders go back to those corners while any tool is open, and the wobble returns when you finish. Neighbours sharing an edge wobble together, and detailed edges such as traced coasts are left as they are.
- **Snapping:** while painting or editing, corners snap onto the corners and edges of neighbouring territories (a ring or diamond shows where). On image maps they also snap onto the coast, lake shores and rivers in the picture, read as sharp as it's shown on screen (a blue ring shows where; switch it off with *Snap to coasts and rivers* on the drawing banner). Between two corners that snapped to the same neighbour, or both to the coast, the line **follows** that border or coastline instead of cutting straight across (*Follow borders and coasts*) â€” all the way round a winding coast or into a deep inlet, and over a pixel or two where a painted river fades or a label crosses it, but never across land. Hold Alt to place freely. Drawing works with a finger too: one finger draws, two move the map.
- **Routes:** the route button draws a road, path, river, sea lane, trade route, railway or border line for any note (a realm's road, a company's trade route, a journey). Hover a route for its length and travel time; right-click to edit or delete it. They're saved like territories:
  ```yaml
  routes:
    - map: "[[Vael Map]]"
      kind: road
      name: The King's Road
      points: "330,520 420,450 520,360"
  ```
- **Travel time:** the ruler and routes show how long a journey takes on foot, by horse, wagon, boat or ship. Image maps need a `scale:` with a real unit (km, miles, leagues); for other units or your own speeds, give the map note `travel: foot 25, horse 50, ship 150` (map units per day).
- **Overlays** (toolbar): turn places, names, territories, routes, the **event heat map** (a glow where events happened, following the time slider), campaign arrows, map notes, grouped pins, photos in pins and zoom layers on and off.
- **Places drawn as areas** show their icon (or sigil) and event count in the area's name instead of a second pin on top. The pin comes back while moving pins.
- **Realm tiers** (an overlay, on by default): from afar each realm is one block of colour (a realm with no area of its own is made of its duchies' land). Zoom in, or click it, and it splits into its duchies, then those into their counties, its border kept as a heavier outline. A trail at the top (*All â€º North America â€º United States*) shows where you are and takes you back out; Ctrl/Cmd-click opens a title's note at any tier. How big a realm gets before it splits, and your own tier words, are in *Settings â†’ Realms and tiers*. So are **tier names**: call the tiers what your world calls them (United States â€º California â€º Los Angeles County with the *Modern* names, or your own), and a state works exactly like a duchy, in every label, menu and tag. With tiers off, *Fade small areas* fades small regions instead.
- **Names never overlap:** territory and place names are shown biggest and most important first (a realm's name over a town's); the rest wait until zooming in makes room, and towns and forts appear as you zoom in, like territories splitting.
- **Colour by realm, liege or house** (toolbar): pins and the legend show the realm a place belongs to, the title directly above it, or the house that holds it, each row naming the holder ("United States â€” James II Â· House Whitmore") with a button to zoom there. Pin cards say *Under California â€º United States Â· Held by â€¦*.
- **Find coasts** (*From the image* menu, image maps): reads where the sea meets the land from the map image, smoothing over waves, grid lines, labels and frames, and leaving out rivers drawn in the sea's colour. Click the sea if it picked the wrong colour. Save the outlines as areas of an island, continent or realm, or as lines on the map.
- **Trace roads and rivers** (*From the image* menu): click a road drawn in the image, then click further along it, and the line keeps to the road round bends and across dashes. Or switch on *Find the whole network* for every line of that colour joined to the click at once (best when roads have a colour nothing else uses). Save them as routes, which journeys and travel times then follow.
- **Journeys, rings and borders:** the quickest way between two places along roads, rivers and sea lanes (`terrain: mountains` and the like slow it down); rings of 1, 3, 7 and 14 days' travel around a place; or the land shared out between the groups holding places on an image map (*borders from seats*).
- **Borders kept sound:** whenever a territory is saved, spikes and loops are taken out and small gaps it leaves enclosed against its neighbours (a river bend, a corner that doesn't quite meet) join it, so no bare slivers show between lands. *Check borders â†’ Fix all* untangles crossed borders, closes thin gaps and fills enclosed pockets on the whole map.
- **Map notes:** sticky notes, arrows and lines for planning (click points, then *Finish*; *Undo point* takes one back, and *Done* keeps one in progress), saved in the map note (on the real-world map, with the world you drew them in). **Compare** puts a second map beside the first, on another map or date, moving together.
- **Huge map images** (over 4096 px) are drawn as tiles, so they stay smooth to pan and zoom.
- **Kind, size and layer of a place:** right-click a pin (or the note) â†’ *Kind, size and map layerâ€¦* (the inspector's *Realm & map* tab), or use the Dashboard. In the note:
  ```yaml
  kind: town           # settlements (capital, city, town, village, port), castle, fort, temple, ruin, forest, lakeâ€¦
  pin-size: large      # tiny, small, medium, large, huge
  layer: 3             # 1 = always shown â€¦ 5 = only when zoomed right in
  ```
  The picker groups the kinds (settlements, defences, buildings and sites, nature). A title's rank (kingdom, duchy, county) isn't a kind of place: set it under *Tier*. Without them, a place takes its kind's size and layer (realms and regions big and always shown, villages and buildings appearing as you zoom in). You can set these per kind in *Settings â†’ Maps â†’ Kinds of place* (`village = #8e6b3a, home, tiny, layer 4`). Layers written in a note or in the settings always apply; the built-in ones only on maps with more than 25 places. The *Zoom layers* button turns layering off.
- **Colors by category:** color pins by the culture holding them, their **kind** (`kind: city`, or a tag like `#Fort`), their top-level region, or one color. Kinds get colors and icons in *Settings â†’ Maps â†’ Kinds of place*. The **legend** lists every group; click one to hide it, Alt-click to show only it.
- **Icons and logos:** `icon: castle` (any Lucide icon, an emoji, or Iconize's `LiCastle`) puts a symbol in the pin; `logo:`, `sigil:`, `crest:` or `flag:` with an image shows that instead. A culture's logo is used for its places.
- **Find a place**, **measure distances** (ruler button; image maps use the map note's `scale: 100 px = 5 km`), and **right-click the map** to create a place or event there, put an existing place there, measure from there or copy the position.
- Overlapping labels give way to more important places, each map remembers where you left it, and fly-to animations follow the motion setting.

## Embedding views in notes

Each embed is named `universeview-` and the view (`universeview-timeline`, `-family`, `-graph`, `-lineage`, `-org`, `-map`, `-calendar`, `-houses`). The older `chronicle-` names still work in notes already written with them.

````markdown
```universeview-timeline
folder: Tudors        # optional filters: tags, cultures, people, places, from, to, importance, search
group: culture
lifespans: true
height: 360
```

```universeview-family
root: Henry VIII      # defaults to the current note
up: 2
down: 2
```

```universeview-graph
focus: Aldric Vane
depth: 2
types: people, cultures
```

```universeview-lineage
folder: Vael
```

```universeview-org
root: Order of the Ash   # defaults to the current note (or every top-level group in `folder:`)
at: SE 30                # the organisation on that date
timeline: true
relations: true          # alliances, rivalries, vassalsâ€¦ between the groups
ties: true               # relationships between the people on the cards
depth: 3
```

```universeview-facts
note: Henry VIII         # an infobox of the note's key facts
```

```universeview-arc
person: Henry VIII       # a life on one strip: roles, partners, children, places, events
```

```universeview-stats
folder: Vael             # people alive over time, balance of groups, lifespans, names
```

```universeview-map
map: Vael Map         # or "world"
trace: Aldric Vane
color-by: category    # culture | category | region | type
territories: true
```
````

Embedded views scroll with the note; hold Ctrl/Cmd to zoom with the wheel. Use the command **Insert embedded view** to add one.

## Relationships

People and groups are joined by properties that list links. Write one side and the other note shows the inverse (vassals â†” liege, mentors â†” students); add dates with `- { name: "[[House Vane]]", from: SE 12, to: SE 40 }`.

| Property | For | Meaning | Also accepted |
|---|---|---|---|
| `allies` | people, groups | On the same side | ally, alliance |
| `friends` | people | Close personal ties | friend, companions |
| `rivals` | people, groups | Competing, not (yet) at war | rival, competitors |
| `enemies` | people, groups | Open hostility or war | enemy, foes, at-war-with |
| `mentors` / `students` | people | Who taught whom | mentor, teacher / apprentice, pupil |
| `liege` / `vassals` | people, groups | Who answers to whom | lord, overlord / vassal, subjects |
| `employer` / `employees` | people | Who works for whom | patron, serves / servants, agents |
| `leader` | groups | Who leads it | ruler, head, monarch |
| `trade-partners` | groups | Trade and commerce | trades-with |
| `founder` | groups | Who founded it | founded-by |

Any other property listing links (`sworn-brother: "[[X]]"`) is a relationship of that name. **New people and groups start with these properties empty**, ready to fill in, and the new-note form has a *Relationships* section. Choose which ones, or turn this off, in *Settings â†’ Relationships*, which also has the full table.

## Writing and story tools

- **Quick creator** (Ctrl+Alt+Q): one line like â€œBattle of Thornwood, SE 22, at Thornwood, Aldric Vane vs Mira Thorneâ€ becomes a note.
- **Story continuity:** chapters with `story-date:` and `characters:` are checked for people moving impossibly fast, the dead appearing and ages that don't add up. They also show on the timeline (*Story* chip).
- **Who knows what** (`knows:` / `known-by:` with dates), **lines of succession** (eldest child first, sons before daughters, or sons only; *Remember for this group* saves the rule as `succession:`), **name ideas** learned from one world's names (near copies like â€œArgaretâ€ are left out), and **story ideas** drawn from your world's own rivalries, successions and gaps.
- **Inline helpers** in reading view: `` `age: Aldric Vane @ SE 30` ``, `` `born: Mira Thorne` ``, `` `span: Battle of Greyford` ``.
- **Tidying:** possible duplicates (with merge), loose ends, kinds and tags clean-up, how complete a world is, and text that contradicts the properties.
- **World book:** exports a world's maps, timeline and entries as one HTML page.

## Calendars

Settings â†’ UniverseView â†’ Calendars lets you define calendars for your worlds, then write dates like `14 Highsun SE 3`. Start from a shape (twelve months of 30 days; twelve months with festival days between the seasons; thirteen months of 28 days; Earth-like with leap years) and rename everything. A calendar can have:

- **Months**, written one per line, `Highsun = 36`. Add `, festival` for days that sit outside the weeks (holidays between months); they don't move the weekday.
- **Weekdays**, any number of them, and which one year 1 began on.
- **Leap days**: `Midfeast = every 4, except 100, unless 400`.
- **Moons**, as many as you like: `SelÃ»ne = 30.4 days, offset 3, #cfd8ff`.
- **Seasons** (`Spring = Thaw 1`) and yearly **holidays** (`Lantern Night = Highsun 15`, or `every 4` for every few years).
- **Eras** (`FE`, `SE`), written before or after the year, and an **epoch** that lines it up with real dates and your other calendars.

A note uses its `calendar:`, then its world's calendar, then the per-folder mapping (`Vael = vaelic`), then the default. The real-world calendar has proper weekdays, the real moon and the solstices and equinoxes.

**The Calendar view** (Ctrl+Alt+C) shows a month as weeks (festival days on their own), a whole year at a glance, or what's *coming up*. Every day shows its moons' phases. Days also show events, events that repeat (give an event `repeat: yearly`, or monthly or weekly), holidays, the start of each season, birthdays (with ages) and story chapters. Click a day for everything on it, double-click to add an event there, and drag an event to another day to move it. **Today** in the world is kept on the world note (or in the settings); the â­ and â© buttons move it on by a day or a week, as a campaign goes on. The **converter** shows any date in every calendar, with weekday, season and moons. Embed a calendar with ```` ```universeview-calendar ```` (`folder:`, `mode: month | year | agenda`, `date:`).

## World notes

A note with `type: world` sets up everything in its folder in one place. The *World settings* window (command, Dashboard, Calendar view or Settings) edits it with menus, a date check, travel-speed boxes and relationship tick boxes, and makes the note when a world has none. You can also edit the properties directly:

```yaml
type: world
calendar: vaelic
today: 16 Highsun SE 3       # today in the story: the calendar's Today
map: "[[Vael Map]]"          # the map that opens first
travel: foot 30, horse 60, wagon 35, boat 60, ship 150   # km a day, for journeys and travel rings
succession: male-preference  # absolute, male-preference or agnatic
person-relations: allies, rivals, mentors   # what new people start with
group-relations: allies, enemies, vassals   # what new groups start with
```

## Current year

Each calendar has a **Current year** (Settings â†’ Calendars; a world note's `today:` wins for its world, and the real-world calendar uses today's date). Anything with no end is drawn up to it, fading out with a dashed end: groups still standing, people born within a long lifetime of it, and spans written as still going (`1292 C.E. -`, `end: present`). This applies on the timeline, culture lineage, org chart and houses. Turn it off with *Draw open spans to the current year*.

## Editing

- **Quick edit** (right-click anything, or a hover card's pencil) works in layers. At the top are the essentials: dates (checked as you type), kind and summary. Below them are the note's links as chips with autocomplete: family, groups, places, causes, and the relationships it already has. *Add a relationship* adds any other kind, and there's a row for tags. *More* holds the finer settings (importance, colour, icon, map pin size and layer, calendar) and every other property as plain text. Only what you change is saved, under the property names the note already uses, and entries with dates or roles are kept as written.
- **Hover cards** open after a short pause with a soft fade. Pin one (ðŸ“Œ), or just drag it, and it stays open where you put it. Hover a link inside a pinned card and that card opens on top, so you can stack several and compare. Esc closes the top one.

## More views and tools

- **Table** (Ctrl+Alt+E): people, places, events, groups or maps as a spreadsheet. Click a cell to change it: dates are checked as you type, lists of links are written as comma-separated names, and every value goes into the property the note already uses. Sort by any column, filter, and add a column for any other property.
- **Houses over time** (from the Dynasties toolbar): each house, family, dynasty or clan as a band across time, with its logo. Members' lives sit inside the band; people without a house of their own follow their parents'. Heads of the house are crowned and joined in order of succession. Marriages link the houses with a heart, and cadet branches drop from the house they came from. Embed with ```` ```universeview-houses ````.
- **Maps through time:** give a map note a list of images with the dates they apply, and the time slider shows each era's map:
  ```yaml
  images:
    - image: "[[vael-old.png]]"
      name: The First Era
      to: FE 811
    - image: "[[vael.png]]"
      from: SE 1
  ```
  Each image is stretched over the same area, so pins and borders stay where they are.
- **Fog of war:** *Seen by* on the map, timeline and connections shows only what one person knows by the slider's date. That covers what they're told (`knows:`), what they took part in and who was there, their family and relationships, their groups with those groups' leaders and lands, the places in their life and the regions those lie in, the chapters they appear in, and famous events (importance 5).
- **Cause and effect:** `caused-by: [[Earlier event]]` or `led-to: [[Later event]]` on either note draws arrows between events on the timeline (*Causes* turns them off). *Why did this happen?* (right-click an event, or the command) shows the chain of causes and of consequences, a few steps each way, and adds more.
- **Editing on the timeline:** drag an event to move it, or the end of its bar to change how long it lasts. Dates keep their precision (a year stays a year) and â€œc.â€ stays on approximate dates. Eras inside eras (a reign inside an age) get their own row of labels.
- **Drawing relationships:** in the connections graph, switch on *Draw links* (or hold Alt) and drag from one note to another. Pick how they're tied (parent, partner, allies, rivals, mentor, member of, leads, branch of, took part, happened at, led toâ€¦) and it's written where it belongs.
- **Website:** *Export a world as a website* writes a folder of plain web pages: a home page with search, a timeline, the maps with clickable places, and a page per note with its facts, its text, all its connections and the notes that mention it. Open it from disk or upload the folder to any static host.

## Works with

- **Dataview** â€” reads inline fields (`born:: 1210`), and exposes an API for queries:
  ```js
  const c = app.plugins.plugins["universe-view"].api;
  dv.table(["Child", "Born"], c.children("Henry VIII").map(p => [p.name, p.props.born]));
  ```
- **Iconize** â€” `icon: LiCastle`-style names work for map pins.
- **Templater / core Templates** â€” set a template per note type; Templater commands are run.
- **Page Preview / Hover Editor** â€” hover any item with Ctrl held.
- **Map View / Obsidian Leaflet notes** â€” `location: [lat, lng]` is read as coordinates.
- **Any theme** â€” all colors come from theme variables, in light and dark mode.

## Credits

Two features are modelled on other community plugins, and they deserve the credit for the ideas:

- **Folder notes** by [Lost Paul](https://github.com/LostPaul) ([obsidian-folder-notes](https://github.com/LostPaul/obsidian-folder-notes)): the folder note itself (`Folder/Folder.md`), opening it by clicking the folder, hiding it in the list, and keeping names in step. UniverseView's version follows its conventions so the two read the same vaults; turn one of them off so they don't both handle clicks.
- **Iconic** by [Holo](https://github.com/gfxholo) ([obsidian-iconic](https://github.com/gfxholo/iconic)): icons on notes in the file explorer and search, and an icon picker for any note.

UniverseView's code for these was written separately rather than copied, but the concepts and the way they work are theirs. If you want only those features, use their plugins: they do them more fully.
## Existing vaults: no rewriting needed

UniverseView reads the formats you may already use:

- **Charted Roots** â€” `cr_type`, `father`/`mother`, `spouse`, `children`, `parent_place`, `date_end`, `parent_org`, `custom_coordinates_x/y` (its bottom-origin pixel maps) and `map_id`. Pins you move are written back in Charted Roots' format.
- **Tag-typed vaults** â€” `#Character`, `#Event`, `#Family`, `#Faith`, `#Realm`, `#City`, `#Region`, `#Fort`, `#Landform`â€¦ (exact tags only, so `#Character_Male` or `#Nation_X` don't count as types; `_Male`/`_Female` tags set gender).
- **Spans and lists** â€” `lifespan: 1262 - 1294 C.E.`, `394 C.E. -`, `~1200 - ???`; `location:` lists (most specific first); `family`/`house`/`nation`/`allegience` as memberships; `branch of`/`branches` as culture lineage; `ruler`/`liege`/`lord`/`founder` as relations.
- **Calendars with eras after the year** (â€œ1262 C.E.â€), a default era for bare years, and grouped thousands (â€œ~8,000 A.E.â€).

**Detect note types and relationships** (command or ribbon menu) finds notes that look like people, places, groups or events but have no type, and family relationships written in the text (â€œson of [[X]]â€, â€œborn to [[X]] and Queen [[Y]]â€, â€œhis wife [[Z]]â€). You review everything first; it then writes in the vault's own style â€” a tag, `cr_type`, or a `type` property.

## Other commands

- **Check data for problems** â€” impossible dates (born before a parent, died before born), parent loops, missing links, unplaced places, two people holding a one-person role (king, grand master, captainâ€¦) at once, and roles that start after someone's death or before their birth.
- **Export family tree (GEDCOM)** â€” writes a `.ged` file to `UniverseView exports/` for Ancestry, FamilySearch, Gramps or MyHeritage. Dates in fictional calendars are kept as text.
- **Jump to a note** (Ctrl+Alt+J) â€” people open in the family tree, groups in the org chart, places on the map, events on the timeline.
- **Import GEDCOM family tree** â€” from Ancestry, FamilySearch, Gramps, MyHeritageâ€¦; optionally creates birth, marriage and death events with places.
- **New event / person / culture / place / map** â€” a form with link autocomplete and live date checking.

## Development

```bash
npm install
npm run build          # type-check + bundle main.js and styles.css
npm test               # unit tests: dates, calendars, GEDCOM, kinship, journeys, coasts and roadsâ€¦
npm run harness        # browser harness with the example vault at http://localhost:5178
npm run install-example  # copy the build into example-vault/ to try it in Obsidian
```

The `example-vault/` folder contains two worlds: the Tudors (Gregorian dates, real map) and Vael (custom calendar, image map).

`dev/install.ps1` (Windows) type-checks, tests, builds and copies the plugin into the vaults listed one per line in `dev/vaults.local.txt`, a file of your own that git ignores.

### Releasing

```bash
npm version patch      # or minor / major: updates package.json, manifest.json and versions.json
git push --follow-tags # the tag starts the Release workflow, which builds and drafts a GitHub release
```

The tag is the bare version (`0.26.1`, no `v`), as Obsidian expects. The workflow attaches `main.js`, `manifest.json` and `styles.css` to a *draft* release; publish the draft when it's ready.

## Licence

[MIT](LICENSE), Â© 2026 Oli_G. The built plugin includes [Leaflet](https://leafletjs.com) (BSD-2-Clause), [d3-force](https://github.com/d3/d3-force) and its d3 helpers (ISC) and [Lucide](https://lucide.dev) icons (ISC); their licences are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Privacy

UniverseView reads and writes only your vault. The only things it loads from the internet are the real-world map's tiles (OpenStreetMap by default, changeable in settings), only when you open that map, and any picture your notes themselves link from the web. It sends nothing anywhere: no accounts, no tracking.
