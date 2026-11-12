# Changelog

What changed in each version of UniverseView. The [README](README.md) describes every feature in full.

## 3.3.0 — not released yet

Places get one system, and titles get more words.

### Kinds of place
- **Three layers, one job each.** The *type of place* (Settlement, Territory, Land, Water, Structure, Site, Space) follows from the kind and is never typed. The *kind* says which one exactly (hamlet, city, castle, island, planet). *Traits* in tags say what is special: a role (#Place_Role_Capital, Port, Holy, Market), a size and a status (#Place_Status_Ruined, Abandoned, Lost, Destroyed).
- **Settlements have a ladder**: hamlet, village, town, city, metropolis, each with a usual size (tiny to huge) offered in the Tag standard window.
- **Capital and port are roles, not kinds.** Kingdom, realm, province and country are Territories, set under Tier. Fortress is a fort. Notes that still say the old words look and read the same, and *Move tags to the tag scheme* tidies them.
- **Settings → Kinds of place** is one table per type of place. A list you never changed moves to the new one; a list you edited stays as it is.
- A place with a role wears that role's icon and colour on the map (a crown for a capital) whether it says kind: capital or #Place_Role_Capital.

### Titles
- A family card shows the title a person holds as *King of England* or *Duchess of Kent* (the highest ruled land, by the world setting's words and their gender), with the way they are addressed (*Her Majesty*) on hover.
- More words for a tier of land: sultanate, emirate, khanate, tsardom, shogunate, electorate, palatinate, margraviate, viscounty, parish, hundred, thanedom, manor, hamlet and more.

## 3.2.2 — 2026-11-11

More fixes from the Obsidian plugin review.

### Fixed
- The Chamfer edge style no longer clips corners (CSS clip-path); panels keep square corners with a diagonal accent line across two corners. Cards and popups keep plain square corners.
- Release builds no longer depend on git history, so the same source always gives the same main.js. Release builds show the version only; local installs still show a build number.

## 3.2.1 — 2026-11-11

Fixes from the Obsidian plugin review.

### Fixed
- Timeline shapes (arrow, diamond, chevron, hexagon, triangle, star) are drawn as SVG instead of CSS clip-path. They look the same; bars shorter than about 20px, approximate-date shaped bars and shaped bars with no end date differ slightly.
- Stylesheet no longer contains the build-time `@@` marker (invalid CSS); the ruled-heading underline uses the default thickness.
- Cross-window safety: `instanceOf` checks and `window.requestAnimationFrame`.
- Removed the deprecated slider tooltip call (the value shows inline).
- Builds are reproducible: the build date is the commit's date, so the same commit always gives the same main.js.

## 3.2.0 — 2026-11-10

Redo, the map's one Options panel, and a batch of small quality-of-life fixes.

### Small things
- **Remove empty properties**: the blank ones a template leaves behind (liases:, eign:, llies: []). A command (*Remove empty properties*) for this note, its folder or every UniverseView note, with a count first, and a *Remove N blank* button in the inspector. One undo step.
- **Forget a relative**: right-click a *Not created yet* card to take them out of the family lines and links (asks first; Undo brings them back).
- **Shortcuts**: one window (command *Shortcuts*, or ⋯ → Shortcuts…) listing every key and click.
- **Again**: the map toolbar remembers the last tool you chose from Draw, Travel or From image and offers it as one click.
- **Copy link** is in every note's right-click menu (written the way Obsidian writes a link).
- The inspector opens each kind of note on the tab you last used for it: people on Person, places on Place.
- **Long explanations wait behind a ?** Under a setting's name, the grey explanation now shows when you rest on the ? or on the name itself, instead of filling the page. Short ones, and any with a link, stay. The same in the inspector's fields.
- **Reveal the open note**: a button in the Library and the Files panel opens the folders above it, scrolls it into view and flashes it.
- **Go to a date, or to today**, from the timeline's toolbar.
- **As many dashboards as you like**: the star button and the dashboard hotkey show the one you used last, but from inside a dashboard they open another in a new tab on the same page. Ctrl/Cmd+click always opens another; Ctrl+Alt+click opens it beside this one.
- **The logo at the top of the dashboard's side tabs is a button**: click for Home, Ctrl/Cmd+click for another dashboard, right-click for the dashboard menu (views, theme, new note, check data).
- **Arrow keys in the family tree** move between cards, Enter centres the tree on the one marked, Esc lets go.

### Redo
- **Redo** takes back what you just undid. The notice after every undo is clickable ("Click here to redo it"); there is a Redo button beside Undo in the inspector, the Library and the map, a *Redo the change just undone* command (Ctrl+Alt+Y), and the Undo history lists what was undone, with a Redo for each. Making a new change clears what could be redone. What was undone is kept across a restart.

## 3.1.0 — 2026-11-10

Relatives of relatives, one right-click menu, and Alt+click for the inspector.

### Family tree: relatives of relatives
- A relative with no note can have relatives too, so a whole branch can be sketched by name without a single bare-bones note. Hover a card and use the **+** handles (parent above, child below, partner beside), or right-click → **Add by name**. Their families are kept as lines in a `relatives:` property on a note that mentions them: `Bob + Mary > Carol, Dan` is a couple and their children.
- Clicking a *Not created yet* card no longer starts a new note at once: it opens what you can do (add relatives, or write them up).
- Names keep the capitals they were typed with.

### One right-click menu
- Every note's menu is now the same everywhere: **Inspect**, **Open note** and **Open beside** (three different icons), then two submenus, **Show in** (Timeline, Family tree, Map, Connections, Dashboard…) and **Find out** (related to…, line of succession, why did this happen), then the view's own tools, then anything that removes.
- In a tree, **Add by name** and **New note for** replace the lookalike *Add relatives by name…*, *Add child* and *Add parent*.

### Opening the inspector
- **Alt+click** anything with a hover card (a card, a pin, a bar, a row in the Library or Files panel) opens it in the inspector. Every *Inspect* now opens the tab you chose as the default, instead of some opening one tab and some another.

## 3.0.0 — 2026-11-10

The look of UniverseView is now yours to build, maps are lighter and steadier, and the plugin shows which build is running.

### Version and build number
- The side tabs and Settings → About show the running version and a **build number** that goes up with every commit (a "+" marks a build from changes not yet committed).

### Looks: buttons, tabs, edges, icons, headings, fonts
- Each theme brings its own **buttons, tabs, edges, icons and headings** (listed on its card); a switch under the theme cards turns that off. Pick your own in Settings → Look → Surface & motion from cards that show each style live. They apply with the Tactile surface on or off.
- Seven button styles (Quiet, Outlined, Filled, Pill, Stamp, Glow, Ruled), seven tab styles (Underline, Folder, Segmented, Plain, Block, Glow, Rule), seven edges (Clean, Double rule, Ornate, Stitched, Hand-drawn, Cut corners, Ledger), three icon weights, five heading marks and seven font pairs built from fonts already on the device.
- **Hand-drawn** edges can be random: every frame gets its own wobble (optional).
- Parchment has a paper grain and a flourish under its title. *Copy look* and *Paste look* share a whole look between vaults.
- Controls keep a fixed width, so changing a value no longer resizes the Options panel or the toolbar. Kerning is on and figures are tabular.

### Maps
- **Roughen borders** no longer overlaps neighbours: the wobble is one field over the map, so a shared border is drawn as one line.
- **Simplify** is tried on first (old outline dashed, nothing saved until Apply) and can run on every area at once. *Simplify as I draw* thins what Fill, Brush and Expand make, keeping shared corners.
- **Grow** is a banner tool with a slider and a live preview.
- Reshaping outlines the lands that move with a shared border and names them; the choice is remembered.

### Fixed
- Hover cards sometimes did not open: leaving one item and entering another quickly cancelled the new card. They also open on the Library and Files panel rows reliably, and a scroll no longer cancels a card on its way.

## 2.9.0 — 2026-11-09

### Briefer settings
- **Modules** is one list of switches, three to a row, with what each does on hover, and the three resets in a single line.
- **About** shows the version history right on the page, newest open, instead of a button that opens it.
- **Notes**: the five *Older tag* rows are one row, and the five folder-and-template rows are one small table (Kind, Folder, Template).
- **Kinds of place**: the Colour, Pin and Layer columns are narrower, and *From the kind* is now *Auto*, so the table fits without wide empty selects.
- Fixed: *Actions…* and an arrow in two notices showed garbled characters since 2.4.0.

## 2.8.0 — 2026-11-09

### More than one dashboard
- Open as many dashboards as you like and put them side by side, for example a map in one and a family tree in the other. Use the new **columns** button at the top right of the dashboard (it opens another dashboard to the right, on the page you are on), the actions *Open another dashboard to the right* and *Open another dashboard in a new tab*, or the quick menu.
- Each dashboard remembers its own pages: two can show different maps, timelines or trees, and they come back that way after a restart. Before, every dashboard shared one saved state.
- A dashboard's tab is named after its page (*UniverseView: Map*), so several can be told apart.
- Links from notes and other views open on the dashboard you are in, or else the one you used last, instead of always the first.

## 2.7.0 — 2026-11-09

### Reshaping a border
- **Shared corners now stay shared.** A corner added on a border that two lands share is added to both, a corner removed from a shared border is removed from both, and a corner you drop on a neighbour's corner or border joins it (the neighbour gets the corner too), so the border stays matched when you move it later. Before, only the land you were editing got the new corner and the border split.
- **Clearer corners.** Corners grow when you point at them and have a larger grab area; a corner shared with a neighbour is a diamond; the dots between corners are small **+** marks. The banner is a single short line.
- **Undo, redo and reset while reshaping** (buttons, or Ctrl+Z and Ctrl+Shift+Z), including the neighbours' corners.
- **Double-click the border** to add a corner right there, not only at the middle of a side.
- **Keyboard:** the arrow keys nudge the picked corners (or the one under the pointer; Shift for bigger steps) and Delete removes them.
- The *Move shared corners together* switch is always there, and a corner you join to a neighbour counts too.

## 2.6.0 — 2026-11-09

### An inked chart
- **Calligraphic chart**, a new map look preset (Settings → Maps & realms → Map look): pen-script names, hand-wobbled ink borders, hatched lands, aged paper, a ruled frame and a compass rose.
- Each part is its own setting, so you can mix them with any look: **Lettering → Calligraphic pen script**, **Paper** (Parchment, Vellum or Sea chart: grain, stains and darkened edges over the map), **Ruled frame** (a double rule with flourished corners) and **Compass rose**. Names use your Map labels font if you set one, else a script font your system has.

## 2.5.0 — 2026-11-09

### Toolbars, one pattern
- Every view's toolbar now reads the same way: on the left what you are looking at (mode, search, folder, subject), then one **Options** button, and on the right zoom out, zoom in, fit and New.
- **Options** holds the switches and number boxes that used to crowd the bar: the family tree's generations, siblings, relationships and follow; the timeline's grouping, calendar, importance, row height and *seen by one person*; the connections view's steps, names, link drawing and fading; the org chart's levels and ties; the lineage, calendar and houses views' switches. One-off actions (How are two people related?, Convert a date, World settings) sit at the bottom of the same panel.
- When a view is showing something you would not guess from its look, such as history as one person knew it, a chip shows it and clears it.

## 2.4.0 — 2026-11-09

### One list of actions
- Obsidian's command palette used to list 59 UniverseView commands. It now keeps eight (Dashboard, Actions…, the quick menu, New note, Quick creator, the inspector, Undo, Jump to) plus the commands that edit the open note. **Actions…** opens a searchable list of everything else: every view, export, check and tool, and the dashboard's Tools tab runs the same actions. Hotkeys you set on a command that left the palette no longer fire: put them on Actions… or run it from there.

## 2.3.0 — 2026-11-09

### Fewer settings tabs
- Settings now has five tabs: Look & cards, Notes & families, Time & calendars, Maps & realms and About. The larger ones hold sub-tabs (for example Look & cards: Theme & colours, Surface & motion, Views, Inspector & icons). The dashboard's Settings tab and Obsidian's own settings window use the same layout.

### Tactile reaches the file explorer
- In the Library and the Files panel, Tactile now sinks the search box, sets the tree in a tray, puts the file icons on plates and presses the selected row in, each following its own part switch.

## 2.2.1 — 2026-11-09

### Fixed
- The dashboard's Settings tab showed only part of the old Look & cards page after the 2.2.0 split. It now has a tab for each new page (Theme & colours, Surface & motion, Views, Inspector & icons, Notes, Families, Time & calendars, Maps, Realms & tiers, Map tools, About), and the Tactile style section shows there too while Tactile is on.

## 2.2.0 — 2026-11-09

### Settings, rearranged
- The long **Look & cards** page is now smaller pages: Theme & colours, Surface & motion, Views, Inspector icons & tips, and About. Notes split into Notes and Families & relationships, and Maps and Realms & tiers are separate. Pages show their current choice (the theme, Flat or Tactile).
- **Tactile style** has its own section on Surface & motion, shown only while Tactile is on: a Parts menu (everything, controls only, files only, or custom), a switch for each part, a Strength slider from 20% to 220%, and a folder colour.

## 2.1.1 — 2026-11-09

### Add relatives by name
- The family tree's toolbar, a card's right-click menu and the inspector have **Add relatives by name…**: pick parents, children, partners or siblings and type one name per line. No notes are made. Each name becomes a link on a note you already have, and the tree draws it as a card marked *Not created yet*; click it to write it up when there is something to say. A name that matches someone in the vault links to them, and names already linked aren't added twice.

## 2.1.0 — 2026-11-09

**A tactile style**
- Settings → Look & cards → *Surface style*: *Tactile* gives UniverseView's own tabs, buttons, fields and panels a physical feel: raised keys that press in, folder tabs that join the page, inset fields and sunken sections. They're easy to tell from Obsidian's flat ones. It works with every theme, in light and dark. *Flat* stays the default.

- Tactile is made of parts you switch on and off one by one (*Tactile parts*: raised keys, toolbar, inset fields, folder tabs, sheets and wells, pressed headings, icon plates, folders and notes), with a *Depth* of subtle, normal or deep and a colour for folders.
- In the Library and the Files panel, tactile draws folders as manila folders with a tab and notes as sheets of paper (your file tints still show). Icons come back on small raised plates in headings, tabs and buttons, where the flat style leaves them out.

**Embeds are named UniverseView**
- Embedded views are now written `universeview-timeline`, `universeview-family`, `-graph`, `-lineage`, `-org`, `-map`, `-calendar` and `-houses`, in the insert commands, the docs and the example vault. The older `chronicle-` names still work in every note already written with them.

**A tour**
- On a first install, a short tour opens: what UniverseView does, how notes become views, and a step where you try on the themes and surface styles live and keep the one you like. Close it without carrying on and nothing changes. *Settings → Look & cards → Take the tour* (or the command *Take the tour*) brings it back. Anyone who already has UniverseView settings isn't shown it.

## 2.0.2 — 2026-11-09

**Fixes**
- A note made with the Quick creator keeps only the properties that have something in them. Blank ones from your template and the empty relationship lists (allies, rivals…) are no longer written, so it matches a note you wrote by hand. Notes made another way keep their template as before.

## 2.0.1 — 2026-11-09

**One tag scheme**
- Every tag says one thing, one way: what a note is (`#Place_County`, `#Character_Person`), what it belongs to (`#Group_Nation_United_States`) and facts about it (`#Character_Status_Dead`, `#Place_Size_Small`). The type words are always Character, Group, Place, Event and Map, and every note has one kind tag.
- *Move tags to the tag scheme* rewrites older tags (`#Nation_United_States`, `#Character_Dead`, `#Region_Small`, `#Title`) in the properties and in the text, after a review where you can leave any change out. Undo takes it all back in one step. Older tags keep working until you move them.
- New notes, land tags, kinds, the Quick creator and *Normalise all tags* all write the new tags. Settings → Notes explains them and keeps your older type tags for reading.
- Undo now also puts back changes UniverseView made to a note's text, unless you've written in it since.

**Timeline**
- Rows stay put when you zoom, arrows point where they should, and events are sorted by type.
- A nations lane: each nation's history is drawn as marks on its bar, a shape per category, with real reigns. The timeline and the lineage are now two modes of one view and share the same years and drawing.
- Lanes can be dragged into order.

**Notes and tags**
- Quick creator: Quick add is now a form in the inspector.
- *Normalise all tags* brings every note to the tags your vault already uses, after a review.
- Smart reader finds facts in your notes' text and adds only the ones you approve.
- The file tree moves notes and folders by dragging or with *Move to…*.
- Changing a note's type or kind can no longer drop it out of UniverseView. Land has one Kind box, where a region's landform is its kind.

**World setting**
- Choose medieval, modern or futuristic for the whole vault: the words for houses, ranks, tiers and kinds of place follow, and modern and futuristic vaults get a modern sample.

**Maps and looks**
- Textures take each land's colour; the inspector fits a narrow sidebar; the map, family tree and org chart no longer flash while they redraw, and the time slider redraws only when something changes.

**A quieter design**
- One set of corner sizes (small, medium, large) follows the Radius setting everywhere, and the default is smaller. Pills are gone from buttons, chips and badges.
- Selected buttons and chips are a plain fill, not an accent block, and the check mark on switched-on buttons is gone. The accent colour is kept for the one main action in a view, a current moment and links.
- Library, Overview, Board and the inspector use sections split by hairlines instead of boxed cards. Headings, tabs and buttons say what they are in words, without an icon each. Plain counts are text, not badges.
- Overview lists the views as an index, and Board shows its figures in one row.
- Map tool banners are neutral panels with an accent only on the main button. The legend uses small colour dots, and the border check panel loses its icon square.
- Tabs and buttons show their whole name: the dashboard's tabs, the inspector's tabs and the toolbars wrap onto another row in a narrow pane, instead of scrolling or dropping their labels.
- Timeline lane names are plain labels and bars have one even outline; family tree relation tags and generation labels are quiet; org chart logo tiles are neutral. Colours that mean something (types, houses, groups, your file tints) are unchanged.

**Fixes**
- Undo puts back only what a step changed, follows renamed notes, and survives a restart. Occupation shows everywhere.
- Stale inferred links clear, date ranges split one way everywhere, and saving a note's text alone no longer redraws every view.
- A first run with a sample world.

## 2.0.0 — 2026-11-06
UniverseView is now one dashboard for your whole world. This brings together everything from 1.3 to 1.8, listed in full below.

**The dashboard**
- The star button opens UniverseView in a single tab: big tabs down the side, smaller tabs along the top. Every view and tool lives there, and the left sidebar holds only the star.
- Links, right-click menus and commands open the view's tab in the dashboard. *Open in new tab* still gives a view its own tab.
- Switch any module off under Settings → Modules. Drag the big tabs into order, and drag, resize or hide the cards on Home and Library.
- Every view remembers its filters, layers and arrangement, and can go back to its defaults.
- Tabs answer at once: pages open in the background, and views behind another tab wait until they're shown.

**Files**
- Files panel: the Library's tree in Obsidian's left sidebar, with colours by realm and tier, search, filters and counts. Obsidian's Files gets a button to open it.
- Library has room: the tree and details resize, and its home shows problems, recent notes, saved views and how complete your world is.

**War and maps**
- Occupation: `occupied:` on a war or battle puts the occupier's stripes over a land at those dates, with no change to its borders or realm. The Occupied tool paints part of a land.
- Play on the map runs the time slider through a war.
- Land painter, Push (move a neighbour's border in the same undo) and Stay on land (keep paint off the sea).

**Writing less**
- One-line forms for sides, holders, names, lands changing hands and dated links. A battle with no `sides:` fights as its war, and `alliance:` stands for its members. Everything already written still works.
- The inspector reads every form and saves the shortest. It used to drop one-line entries when you edited them.

**Inspector and design**
- About shows what the editor holds: sides, battles, holders, names, occupations and any other property on the note.
- Flat cards, solid panels, sentence-case labels and quicker hover cards across every view. Themes keep their own shadows.
- The *Frosted glass* setting is gone. The Atelier theme keeps its glass.

## 1.8.0 — 2026-11-06
- **Occupation**: `occupied: "[[Virginia]] by [[United States]] (1861 – 1865)"` on a war or battle. At those dates the land keeps its owner's colour with the occupier's stripes over it, and its borders and realm don't change.
- **Occupied areas**: the map's Occupied tool paints part of a land held for a while, with dates, apart from real borders. Right-click one to delete it.
- **Play a war**: *Play on the map* in the inspector runs the time slider through a war.
- **Push neighbours back**: Brush can take land from a neighbour, moving both borders in one undo.
- **Stay on land**: brushing on an image map keeps paint off the sea.
- **Land painter**: the palette button on the map lists your lands: pick one and paint, pick the next.
- **Cleaner design**: flat cards unless a theme gives them shadows, solid panels instead of frosted glass (the Frosted glass setting is gone), sentence-case labels, no glows or hover wiggles, and everything arrives at once.
- **Inspector**: About now shows sides, battles, holders, names, lands changing hands, occupations, birthplaces and every other property written on the note, in the dashboard's style.

## 1.7.0 — 2026-11-06
Shorter ways to write what used to take a block of properties, and the inspector now reads them all and saves the shortest.
- **Sides**: `sides: "[[A]], [[B]] vs [[C]]"` on one line, or grouped by side (`The Crown (won): ["[[A]]", "[[B]]"]`), or `outcome:` once for everyone.
- **Battles fight as their war**: a battle with no `sides:` shows its war's parties. List them only where it differs.
- **Alliances**: `alliance: ["[[A]]", "[[B]]"]` on a note, then name that note as one party.
- **Holders and names**: `1220 C.E.: "[[William]]"`, each until the next.
- **Lands changing hands**: `"[[Land]]: [[Old realm]] > [[New realm]]"`, several lands to a line.
- **Any dated link** (cultures, memberships): `"[[House]] (king, 1220 – 1258)"`.
- The inspector used to drop one-line entries when you edited them; it keeps them now. Everything already written still works.

## 1.6.0 — 2026-11-06
- **Links stay in the dashboard**: right-click menus, links and commands that open the map, a family tree or any other view now bring you to its tab in UniverseView, opening the dashboard if it's closed. *Open in new tab* still opens its own tab.
- **Views remember**: every view keeps its filters, layers, focus and arrangement for next time, even after the dashboard closes. The arrow at the top right puts a view back to its defaults; *Reset all views* is under Settings → Modules.

## 1.5.2 — 2026-11-06
- Cards move like the big tabs: drag one by its title at any time. Its corner, shown on hover, resizes it, and right-clicking its title hides it, restores its size, or resets the page. The grid button is still there for columns and hidden cards.

## 1.5.1 — 2026-11-06
- Cards and big tabs now really drag: they move as you go, the page scrolls at its edges, and it works with touch. Library's narrow column holds two cards sooner.

## 1.5.0 — 2026-11-06
- **Customise any page**: the grid button on Home and Library lets you hide cards, drag them into order, resize them from the corner and choose how many columns. Each page remembers its own layout, and Reset puts it back.
- **Big tabs move**: drag them up or down, or right-click one to move it, hide it, show hidden tabs, switch to icons only or reset. Settings → Modules can reset tabs and all cards.

## 1.4.2 — 2026-11-06
- Library: the tree and details resize whichever way they sit, with a handle always in view, and stay side by side in much narrower panes.
- Library's home is about your world: problems, recent notes, saved views, how complete it is and statistics. Its basic settings are in Settings, and its tools on the dashboard's Tools tab.

## 1.4.1 — 2026-11-06
- The file trees take your file colours: names and bars by realm and tier, with the same strengths as Obsidian's Files, and each note's icons.
- A folder and its folder note are one row, as in Files. Click it to open the note; the arrow folds it.
- **How the tree looks** (the sliders button): colour names, bars, both or neither; folder notes as folders; kinds; counts; compact rows.
- Obsidian's Files gets a button to open the files panel, and the panel one to go back.

## 1.4.0 — 2026-11-06
- **Files panel**: the Library's tree in Obsidian's left sidebar, beside Files, at full height. Search, filter by type, counts and problems at a glance; click a note to open it, and the panel follows whatever note is open. Switch it off under Settings → Modules.
- **Library has room**: drag the tree wider, and hide the summary or the details from the toolbar. With details hidden, clicking a note opens it. The summary is one slim line, and the theme and motion menus moved out of its toolbar (they're in Settings).
- File trees work from the keyboard: arrows move, right and left open and close folders, Enter opens.

## 1.3.2 — 2026-11-06
- Calmer dashboard: a plain star, neutral selected tabs, flat tool cards with quiet icons, sentence-case headings. Overview in the dashboard drops the tiles that repeated its tabs.
- No more lifting on hover or blur behind dialogs.

## 1.3.1 — 2026-11-06
- Dashboard tabs answer at once: pages open in the background while you work, each view draws once instead of twice, and views behind another tab wait to update until they're shown.
- A very large map picture no longer brings up the "map hasn't appeared" report while it's still preparing, and the report clears once the map shows.
- The left sidebar now holds only the UniverseView star. *Sidebar button for every view* brings the others back.

## 1.3.0 — 2026-11-06
- **One dashboard for everything.** The new star button opens UniverseView in a single tab: big tabs down the side (Home, People, Groups, Places, Time, Library, Tools, Settings), smaller tabs along the top. Every view lives there, and links between views stay inside it. Each view can still open in its own tab.
- **Modules**: Settings → Modules switches any view or set of tools off, everywhere it shows.
- **Tools**: every tool is now a card under Write, Ask, Check, Tidy and Share, so none depend on remembering a command.
- The sidebar can be dragged wider or narrower, down to icons only; pages stay as you left them when you switch tabs.
- The star logo, on the ribbon and in the dashboard.
- Selected filter chips in toolbars are readable again (their text had turned the same colour as their background).

## 1.2.1 — 2026-11-02
- Stylesheet tidy-up for Obsidian's style review: no property declared twice in one rule. Nothing looks different.

## 1.2.0 — 2026-11-02
- **Needs Obsidian 1.13 or later.** Settings use Obsidian's new settings pages: five pages (*Look & cards*, *Notes*, *Time & calendars*, *Maps & realms*, *Map tools*), and every setting is found by Obsidian's own settings search. A section's help is the ? beside its heading. Opening settings from a view's settings button shows that view's settings first.
- The facts infobox in a note (`chronicle-facts`) shows again; it had collapsed to nothing.
- Exporting a picture reads the vault's own images through Obsidian, so they're embedded byte for byte.
- Styles reworked for Obsidian's style review: no `!important`, `:has()`, `all: unset` or multi-column layout. Small differences: the relationship groups on the dashboard line up in a grid, and invalid table cells are underlined straight instead of wavy.

## 1.1.3 — 2026-11-01
- Notices you can click (a file just saved, a saved view's link) respond to a click on their message, without Obsidian's deprecated notice element.
- The red Merge buttons in tidying use the warning style directly instead of a deprecated method.

## 1.1.2 — 2026-11-01
More fixes from Obsidian's community directory review.
- Deleting a note from the inspector, or a calendar in Settings, asks in an Obsidian dialog instead of the browser's.
- Property values that are lists or objects are read as text properly, never as "[object Object]".
- Settings read from disk, frontmatter and other plugins' data are typed throughout, with no `any`.
- Button actions that save or reload handle their work properly; elements are made with Obsidian's helpers; slider values use Obsidian's own display.
- A few placeholders and labels in sentence case.

## 1.1.1 — 2026-11-01
Fixes for Obsidian's community directory review.
- Needs Obsidian 1.7.2 or later (it uses Obsidian's own trash, which respects your deletion setting, and its way of revealing a view).
- Tag colours use a constructed stylesheet instead of a style element; map layers are stacked in the stylesheet; styles are set through Obsidian's helpers.
- No more `any` reaching into Obsidian's internals: the few internal parts used (other plugins, Templater, Dataview, the file explorer) are typed in one place.
- Release files come with signed build provenance (GitHub artifact attestations).
- Smaller tidy-ups: command names without the plugin's name, the settings heading *About*, unused code removed.

## 1.1.0 — 2026-11-01
- **What's new**: after an update, a window shows what changed since the version you had, and the whole version history is one click away (the *What's new* command, or Settings → Look & cards → About). Each version folds open; the newest is open. *Show what's new after an update* turns the window off.
- The changelog lists every version back to 0.7, the earlier ones pieced together from the chat history the plugin was built in.

## 1.0.0 — 2026-11-01

The first stable release. Since 0.26 most of the work has gone into the map: drawing and editing territories on real hand-drawn maps, looks in the style of grand strategy games, and speed.

### Map editing
- **Click a territory and its editing panel opens** along the bottom of the map with every tool for it: Reshape, Simplify, Expand, Brush, Grow, New area, Fill, Dates, New borders, Split, New land, Route, Map notes, Import, Check, Erase and Delete. Each has a one-key shortcut (R, S, E, B, G, F, D, X, T, C), shown on its tip.
- **Expand** circles new land and joins it to the same area; **Brush** paints land on or rubs it out. Corners the area already had stay put, and new ground stops at the neighbours' borders (*Keep off other lands*).
- **Fill land / sea**, a paint bucket by ground: click land and all the land joined to it fills, whatever is drawn on it, up to the coast, rivers and other territories; click water and the water fills. *Cross rivers* carries on past rivers; *Close gaps* stops leaks through a faint river or a hairline gap, and small pockets left beside the fill join it. *Fill same colour* keeps the colour-based fill. Fill started from the toolbar joins the area it overlaps instead of drawing a second one over it.
- **Simplify** takes out corners that barely change a border, so it's quicker to edit, keeping real detail like a jagged coast. Corners shared with a neighbour go from both borders, so they stay matched. The corner count is previewed before saving.
- **Snapping to coasts and rivers**: corners snap onto the water in the picture, read at the detail shown on screen. Between two snapped corners the line follows the neighbour's border or the coastline, all the way round winding coasts and into deep inlets, over a pixel or two where a painted river fades, and never across land.
- **Borders kept sound on every save**: spikes (including thin wedges from a slipped corner), loops and crossed borders are taken out, and small gaps left enclosed against the neighbours join the territory being saved. *Check borders → Fix all* does the same across the whole map, gaps along rivers included.
- **Map notes**: arrows and lines can be finished with *Finish*, *Undo point* takes back a point, and *Done* keeps one in progress instead of throwing it away. The points and arrowhead show as you draw.
- Drawing works with a finger on phones and tablets: one finger draws, two move the map.

### Map looks
- **Look presets**: *Standard*, *Grand strategy* (bold political colour and a strong border glow, like Crusader Kings or Europa Universalis), *Old atlas*, *Hand-drawn fantasy*, *Clean political* and *Terrain first*. Each sets fills, border colour, lettering, the border glow, roughness, rivers and every tier's style. Save your own look as a preset; switch with the *Map look: switch preset* command.
- **Realm border glow**: a soft band of each realm's colour just inside its border, fading inwards, strongest close up where the fill thins out (*Off*, *Soft* or *Strong*).
- **Rivers drawn as water**: river routes become a curved blue ribbon between darker banks, narrow at the source and widening to the mouth. Width and colour are in settings.
- **Roughen borders**: long straight borders drawn with a hand-drawn wobble. Only the look changes; the notes keep their few corners, borders go plain while a tool is open, and neighbours sharing an edge wobble together.
- Territory styles' line (solid, dashed, dotted) and texture now show on realm borders and on lands shown as their realm.
- Realm borders run along the territories' own edges, with no doubled lines and no gaps around small islands.
- **Tier names of your own**: call the tiers what your world calls them (State and County, Province, Sector…), with presets.

### Settings
- **A new Map tools tab**: snapping, following borders and coasts, keeping off other lands, brush size, and the Fill and Simplify defaults. Choices made on a tool's banner are remembered there.
- **Everything the Style Settings plugin offered is built in** under *Look & cards → Views*: timeline row height and label size, family tree card size, gender tints, and a flat style. The Style Settings plugin is no longer needed.
- **Kind of place** is grouped (settlements, defences, buildings and sites, nature, space), every kind in it reads as a place, and titles' tiers (kingdom, province, county…) are left to the Tier setting.

### Views
- **Family tree**: *Everyone related* to a person, cards as proper panels, and a cleaner look.
- **Timeline categories**: battles, treaties, coronations and more, each in its own colour and lane, any of them hidden.
- **Culture lineage** scrolls and zooms like the timeline.

### Faster and steadier
- The map's strategy look is redrawn only when what's shown changes, each realm's drawing is reused, and realm outlines are worked out in idle moments. A typical zoom does about half the work it did, without the long pauses when a realm first splits open.
- The border glow is drawn without a blur filter, and names are sorted out without laying the page out again for each one.
- Tool sliders save settings once they settle rather than on every step, so Sync has far less to carry.
- Hover cards come back after a scroll or click while the pointer stays on the same territory, and stay away while a map tool runs.
- On phones: fixes to Fill, family tree cards, pinch zoom, map panning and the layout. A notice offers to reload when an update arrives (on desktop too).

## 0.38.0 — 2026-11-01
- The map's strategy look is redrawn only when what's shown changes; each realm's drawing is reused; the border glow uses far fewer lines and points; realm outlines are worked out in idle moments.

## 0.37.5 — 2026-11-01
- Kind of place: every kind reads as a place, the list is grouped, and titles' tiers and repeats are left out.

## 0.37.4 — 2026-11-01
- The border glow is drawn without a blur filter; names are sorted out in one pass. Hover cards come back after a scroll or click and stay away while a map tool runs.

## 0.37.3 — 2026-11-01
- Clicking a territory opens its editing panel at once.

## 0.37.2 — 2026-11-01
- Map notes: arrows and lines have *Finish* and *Undo point*, and *Done* keeps one in progress.

## 0.37.1 — 2026-11-01
- Tool sliders save settings once they settle. One-key shortcuts on the territory panel. *Map look: switch preset* command.

## 0.37.0 — 2026-11-01
- Map look presets, built in and your own.

## 0.36.4 — 2026-11-01
- The realm border glow is no longer cut off along straight borders.

## 0.36.3 — 2026-10-31
- Small gaps a territory leaves enclosed against its neighbours join it when it's saved; *Fix all* fills enclosed gaps along rivers too.

## 0.36.2 — 2026-10-31
- Thin spikes are taken out of a border when it's saved.

## 0.36.1 — 2026-10-31
- Fill takes in small leftover pockets of land beside what it filled.

## 0.36.0 — 2026-10-31
- Settings overhaul: the Style Settings options built in (*Views*), a *Map tools* tab, the realm border glow's strength, and river width and colour.

## 0.35.0 — 2026-10-31
- Realm borders keep small islands' thin tips. A soft glow of each realm's colour inside its border, in the style of grand strategy games.

## 0.34.1 — 2026-10-31
- Fill from the toolbar joins the area it overlaps. The territory panel gets the Draw tools.

## 0.34.0 — 2026-10-31
- *Fill land / sea*: a paint bucket by ground rather than colour.

## 0.33.1 — 2026-10-31
- Following coasts and rivers: winding coasts, deep inlets and small breaks in a river, never across land.

## 0.33.0 — 2026-10-31
- Rivers drawn as water, widening towards the mouth.

## 0.32.1 — 2026-10-31
- Territory styles' line and texture show on realms.

## 0.32.0 — 2026-10-31
- *Simplify*: fewer corners, with shared borders kept matched.

## 0.31.0 — 2026-10-31
- *Roughen borders*: a hand-drawn wobble on long straight edges, shown only.

## 0.30.3 — 2026-10-31
- *Fix all* fills only sliver-sized pockets.

## 0.30.2 — 2026-10-31
- Territories are saved sound (no spikes or loops); the border check finds real gaps; *Fix all*.

## 0.30.1 — 2026-10-31
- Sharper water snapping and fill, lines that follow borders between corners, and drawing by finger.

## 0.30.0 — 2026-10-31
- *Expand* and *Brush*: grow the same area by circling or painting land.

## 0.29.0 — 2026-10-31
- Snap borders to coasts and rivers; timeline categories; the culture lineage scrolls and zooms like the timeline.

## 0.28.3 — 2026-10-31
- The update notice works on desktop too.

## 0.28.2 — 2026-10-31
- Realm borders follow the territories' own edges (no doubled lines).

## 0.28.1 — 2026-10-31
- Panning the map by touch works again.

## 0.28.0 — 2026-10-31
- Family tree overhaul: *Everyone related*, cards as panels, a cleaner look. Smaller editing panels on phones.

## 0.27.1 — 2026-10-31
- Phone fixes: Fill, family tree cards, pinch zoom and the layout.

## 0.27.0 — 2026-10-31
- Tier names of your own (with presets); United States examples.

## 0.26.0 — 2026-10-31
- Ready for release: licence, release workflow and a private GitHub repository. A notice offers to reload when an update arrives.

## Before 0.26

The project wasn't in a repository before 0.26, so these entries are pieced together from the chat history it was built in: what was asked for, version by version. Smaller releases in between (the `.1`, `.2`… after each) were quick fixes to what that version added. Versions before 0.7 left no record.

### 0.25.0 – 0.25.5 — 2026-10-31
- 0.25.0: the strategy map look, in the style of Crusader Kings 3 and Europa Universalis: solid realm colours from afar, bold realm borders and names curved across the land.
- 0.25.1: a county missing from the map shows again.
- 0.25.2 – 0.25.5: the plugin enables and the map opens on iPhone, including very large map pictures, shown from a smaller copy on phones.

### 0.24.0 – 0.24.1 — 2026-10-31
- Fixes found by the data checks applied across the vault, and the features from 0.23 finished.

### 0.23.0 – 0.23.8 — 2026-10-31
- A large round of new features and polish across every view, with bug fixes and optimisation.

### 0.22.0 – 0.22.11 — 2026-10-31
- Map notes and the territory editor updated; the map toolbar, the settings page and the timeline overhauled; the dashboard and inspector refreshed.
- Right-click menus tidied (Edit territory apart from Delete; *Inspect* when right-clicking a file).
- Fixes to counties whose areas drew wrongly.

### 0.21.0 – 0.21.7 — 2026-10-31
- The territory tools (shared corners, filling to neighbours, an area's dates…) given one consistent look, then gathered into one *Edit territory* tool with tabs; later the bottom editing panel.
- A delete button for territories and places, also on right-click.
- *Split from area* works.

### 0.20.0 – 0.20.2 — 2026-10-30
- Inspector overhaul: every identifier and fact, a new look, and more ways to customise it, the map and territories.

### 0.19.0 – 0.19.3 — 2026-10-30
- Shared borders done properly (growing to a neighbour adds the matching corner to it, so both move together); borders that change with wars and treaties; more from the feature list.

### 0.18.0 – 0.18.3 — 2026-10-30
- Realms and territories follow the look settings; bigger realms can be picked when zoomed out, and kingdoms appear with less zooming.
- Clean-up and fixes.

### 0.17.0 – 0.17.6 — 2026-10-30
- Geography (continents, sub-continents) told apart from sovereign realms, in the code and the note creator; the land tag standard.
- The lineage of groups restyled to match the other views.
- Settings keep their scroll position when changed; people found in their families.
- Credits to Folder Notes and Iconic in the description.

### 0.16.0 – 0.16.1 — 2026-10-30
- Ten new features from a brainstorm list.

### 0.14.0 – 0.15.1 — 2026-10-30
- Font options; icons and territories with many settings per type; settings made easier to find from every view; realms overhauled.
- The file explorer coloured by realm and tier (a county in a softer shade of its duchy), with more quality-of-life touches.

### 0.13.0 – 0.13.10 — 2026-10-28
- Hover cards: a proper delay that resets between items, a filling ring by the pointer, kept on screen and above every theme.
- Seas made editable and deletable in bulk; the realm view fixed.
- The calendar overhauled and its settings editable; plugin settings in tabs.

### 0.12.0 – 0.12.9 — 2026-10-28
- **Realm tiers** like strategy games: realms whole from afar, split into duchies and counties as you zoom in or click through.
- The inspector overhauled, built from parts, with the place's kind, size and map layer merged in; *held by* and the realm tree; the organisation view with overlords and family ties (cadet branches).
- Faster coast detection (no more freezing) and a more accurate road and river finder.
- Smarter hover cards: movable, opening after a set delay; help behind "?" tips like strategy games; less cluttered spacing.

### 0.11.0 – 0.11.5 — 2026-10-28
- Settings in the interface for the calendar and for everything tags tell the plugin.
- Map fixes: crashes, picture quality, and places missing from search and *Add place*.

### 0.10.0 — 2026-10-27
- The unified inspector; speed and ease of use; views that work together without clutter; the description showing every feature.

### 0.9.0 — 2026-10-27
- Renamed **UniverseView**. The calendar overhauled (in the spirit of Calendarium), the culture lineage restyled, and the *current year* for spans with no end.

### 0.7.0 — 2026-10-27
- The first versions: events and timelines, family trees, people and cultures, places and image maps with territories, a dashboard with places' size, layer and kind, organisation charts with logos, fading small territories, coast detection, *Fill territory*, views opened from shortcuts, menus and the sidebar, themes and customisation, movable and resizable modules, and many features from brainstorm lists.
