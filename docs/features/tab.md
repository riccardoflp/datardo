# The tab strip

The row of tabs of the main island, for every engine: what the strip shows, opening a tab, what makes two tabs the
same, making a tab active, closing one or many, tabs with unsaved changes, reordering, the groups by connection,
what the strip does when the tabs do not fit, the tabs of a connection that is disconnected or removed, the tabs
restored at the next start, and reopening a closed tab. The kinds of tabs are in the table **What a tab is** of
[the product page](../product.md); what each page shows belongs to its own area. The scope bar and Back and Forward
are in [nav.md](nav.md).

There is one main island and one tab strip: no split in the first release.

## The strip

### `tab.strip` — The tab strip

The open tabs, in groups, one group for each connection.

- **Kind**: View
- **Engine**: Any
- **Function**: `src/features/tab/strip.ts › view(state)`
- **Entry points**: the first row of the main island (`@tab-strip`).
- **Shows**: the groups in their order (`tab.groups`), and in each its tabs in theirs. A tab is:
  - the icon of its kind (a collection, a view, keys, one key, a document, a playground, a console, the icon of its
    page), drawn in the color of the tab (`tab.groups`), or in its usual color when the tab has none;
  - its title (`tab.title`);
  - a close button, shown on the active tab and on the tab under the pointer. A tab with unsaved changes shows a dot
    in its place, which becomes the close button under the pointer.
- **States**:
  - The active tab is drawn as part of the page under it; the others are flat.
  - The tabs of a connection that is not connected keep their look; the dot of their group says it
    (`tab.connection-gone`).
  - A click makes a tab active (`tab.activate`); a click with the middle button closes it (`tab.close`); a right
    click opens its menu (`tab.menu`); a drag reorders it (`tab.reorder`).
  - Resting the pointer on a tab shows its whole path, as the scope bar would write it (`Local / shop / orders`).
  - With the focus on the strip, `Left` and `Right` move between the tabs that are shown, `Home` and `End` go to the
    first and the last, `Enter` or `Space` makes the focused one active, `Delete` closes it, and `Shift+F10` or the
    menu key opens its menu.
  - A screen reader says, for a tab: its title, its kind, its connection, whether it is the active one and whether it
    has unsaved changes (`orders, collection tab, Local, selected`).
  - When the tabs do not fit: `tab.fit`.
- **Uses**: `tab.groups`, `tab.title`, `tab.activate`, `tab.close`, `tab.menu`, `tab.reorder`, `tab.fit`,
  `tree.color-of`.
- **Ported from**: *New in Datardo*. The icon of a tab in the color of its collection or database comes from the
  colors of collections and databases of Mongoster 0.9.0 and 0.10.0 (proposal 0001;
  `src/connectionColors.ts › paintTab`, `tabIcon`; `src/shared/collectionColors.ts › scopeColor`).

Acceptance:

- [ ] With the tabs Home, `orders` and `users` of Local, and the keys tab of Cache local, the strip shows three
  groups in this order: the app's, Local's, Cache local's.
- [ ] With Local red and the collection `shop.orders` teal, the icon of the tab `orders` is teal, and the icons of the
  tab `users` (no color of its own, nor of its database) and of Home are in their usual color; the line under
  Local's group is red.
- [ ] A click on `users` makes it active; a click with the middle button on `orders` closes `orders` and leaves
  `users` active.
- [ ] A document tab edited and not saved shows a dot where its close button is; moving the pointer over it shows the
  close button.
- [ ] With the focus on the tab of `orders`, `Right` moves the focus to `users` without making it active, and
  `Enter` makes it active.
- [ ] Resting the pointer on the tab `orders` shows `Local / shop / orders`.

### `tab.title` — The title of a tab

What a tab is called in the strip, in the name of the window and in the lists that name tabs.

- **Kind**: Derivation
- **Engine**: Any
- **Function**: `src/features/tab/title.ts › tabTitle(tab, siblings)`
- **Inputs**: what the tab shows; the other tabs of its group.
- **Output**: the title, and what is added to it when another tab of the group has the same title.
- **Rules**:

  | Tab | Title | Added when two are alike |
  | --- | --- | --- |
  | collection tab | the name of the collection or view: `orders` | the database: `orders · shop` |
  | document tab | the collection and the `_id` as the table shows it, cut in the middle to 8 characters when longer: `orders · 65f1…a2c` | the database |
  | keys tab of a database | **Keys** for `db0`, **Keys · db3** for another | — |
  | keys tab of a namespace | the namespace: `orders:2026:` | the database: `orders:2026: · db3` |
  | key tab | the name of the key, cut in the middle to 32 characters when longer | the database |
  | playground tab | the name of its file (`cleanup.mongodb.js`); **Playground 1**, **Playground 2**… when it was never saved, with the lowest number free in its group | the folder of the file |
  | console tab | **Console** | — |
  | page tab | the name of its page, as its area gives it; for a page of a database or a bucket, that name follows: `Diagram · shop` | — |
  | app tab | **Home**, **Settings**, **Undo history**, **Scheduled tasks**, **Log**; a connection form: **New connection**, or **Edit** and the name of the connection | — |

  A title is cut at its end with `…` when the tab is narrower than it (`tab.fit`); the cut in the middle keeps the
  first 4 and the last 3 characters of an `_id`, and the first 20 and the last 11 of a key's name *(Datardo's
  choices)*. The title never names the connection: its group does.
- **Worked examples**:
  - the collection `orders` of `shop`, alone → `orders`
  - the collections `orders` of `shop` and of `crm`, both open on Local → `orders · shop` and `orders · crm`
  - the document `_id: ObjectId("65f1c0de9a7b4e00012f3a2c")` of `orders` → `orders · 65f1…a2c`
  - the document `_id: 7` of `orders` → `orders · 7`
  - the keys of `db0` → `Keys`; of the namespace `session:` in `db3` → `session:`
  - the key `cache:product:5f0c1e2a-7b6d-4c1e-9a55-0e2d7c9b1f44:detail` (57 characters) →
    `cache:product:5f0c1e…1f44:detail`
  - a second playground never saved, while **Playground 1** is open → **Playground 2**
- **Uses**: `tab.fit`.
- **Ported from**: *New in Datardo*.

Acceptance:

- [ ] Opening `crm.orders` while `shop.orders` is open on the same connection changes both titles, to `orders ·
  crm` and `orders · shop`; closing one gives the other `orders` back.
- [ ] The same two collections open on two different connections are both titled `orders`.
- [ ] The document tab of `_id` `ObjectId("65f1c0de9a7b4e00012f3a2c")` is titled `orders · 65f1…a2c`.
- [ ] Closing **Playground 1** and opening a new playground while **Playground 2** is open titles it **Playground
  1**.
- [ ] No title holds the name of the connection.

### `tab.groups` — The groups of the strip

The tabs of one connection stay together, under its name and color.

- **Kind**: Derivation
- **Engine**: Any
- **Function**: `src/features/tab/groups.ts › groups(tabs, connections)`
- **Inputs**: the open tabs, each with its connection or none and what it shows, in the order they hold; the saved
  connections with their names, their colors and the colors of their databases and collections (`tree.color-of`);
  which groups are collapsed.
- **Output**: the groups in order, each with its label and its tabs, each tab with its color or none.
- **Rules**:
  - The first group is the app's: the tabs that belong to no connection (Home, Settings, Undo history, Scheduled
    tasks, Log, the connection forms). It has no label and no color.
  - Then one group for each connection that has a tab, in the order in which the groups were first opened: a new
    group goes at the end. The order of the groups does not change when a tab becomes active, and groups cannot be
    dragged.
  - A group is there while it has a tab. A connection whose last tab closed and that opens a tab again later gets a
    new group, at the end.
  - A new tab goes at the end of its group; a tab never leaves its group.
  - The label of a group is the dot of the connection in its color and state (filled when connected, a ring when
    not, in the error color when failed) and its name, cut to 24 characters *(Datardo's choice)* with `…`. A line in
    the connection's color runs under the group's tabs. The group of the current connection has its label in the
    stronger text color.
  - A group that is collapsed (`tab.collapse-group`) shows its label, the number of its tabs, and no tab; but the
    active tab is never hidden: collapsing its group leaves that one tab shown after the label.
  - The group always takes the connection's own color, for its dot and its line, whatever the colors of the
    databases and collections of its tabs.
  - Each tab may take a color of its own, which `tab.strip` draws on its icon, by what it shows. It is the color
    `tree.color-of` gives for what the tab was opened on, when that color comes from the collection or the
    database; a color that comes from the connection alone is shown by the group, and the tab takes none:

    | The tab shows | Its color |
    | --- | --- |
    | a collection, a view or a bucket, or something of one: a collection tab, the page of a bucket (GridFS), a document tab, the document history page, Watch changes or the Index advisor on one collection | the color of that collection, its own or its database's; a bucket by its `.files` collection |
    | the comparison of two collections, or the structure comparison of two databases | the color both sides share, or the only color one side has, or none (`tree.color-of`) |
    | one database, and nothing narrower: Watch changes or the Index advisor on a database, the Relationship diagram; for Redis, the keys tab of a database or of a namespace, and a key tab | the database's own color |
    | the whole connection: Overview, Monitor, Users and roles, Search documents, Watch changes or the Index advisor on the deployment, a playground tab, the console tab, Pub/Sub, Server | none: the group shows the connection's color |
    | nothing of a connection: an app tab | none |

    An own **None** of a database or a collection is no color, even in a colored connection: its tabs have none.
  - Renaming a connection or changing its color changes its group at once; changing the color of a database or a
    collection (`tree.set-database-color`, `tree.set-collection-color`) changes the color of its open tabs at once.
- **Worked examples**:
  - opened in this order: Home, `orders` of Local, the keys of Cache local, `users` of Local, Settings → the app's
    group (Home, Settings), Local (`orders`, `users`), Cache local (**Keys**)
  - then every tab of Local closed, and `products` of Local opened → the app's group, Cache local, Local
    (`products`)
  - Local collapsed while **Keys** of Cache local is active → `Local 2`, with no tab; Cache local as before
  - Local red, the database `shop` teal, the collection `shop.orders` with **None**, the collection `shop.users`
    with no color of its own: the tab `orders` has none, `users` is teal, the Relationship diagram of `shop` teal,
    `crm.users` and Monitor none, and the dot and the line of Local's group red
  - Cache local with no color, its database `db3` pink (kept as `"3"`): the keys tab of `db3` and the key tab of
    `session:42` in `db3` are pink, the keys tab of `db0` and the console have none
- **Uses**: `tab.collapse-group`, `nav.current-connection`, `tree.color-of`, `tree.set-database-color`,
  `tree.set-collection-color`.
- **Ported from**: *New in Datardo*. Which tab takes which color follows the colors of collections and databases of
  Mongoster 0.9.0 and 0.10.0 (proposal 0001; `src/shared/collectionColors.ts ›
  scopeColor`, `colorOf`; the collection, GridFS, document history, search, watch, advisor, diagram, compare and
  structure tabs). Mongoster's Search documents can be one tab per collection or database; Datardo's is one page
  tab per connection, so it keeps the connection's color.

Acceptance:

- [ ] A tab opened on Local while Cache local's group is the last one goes at the end of Local's group, not at the
  end of the strip.
- [ ] Making a tab of Cache local active does not move its group before Local's.
- [ ] Setting the color of Local to red turns the dot and the line of its group red without a restart.
- [ ] Each worked example above gives exactly those colors.
- [ ] Giving `shop.orders` the color pink while its collection tab and the document tab `orders · 7` are open turns
  both pink at once, and leaves the dot and the line of Local's group in Local's color.
- [ ] The app's group shows no name; with no tab of the app open, the strip starts with the first connection's
  group.
- [ ] Disconnecting Local turns the dot of its group into a ring, and its tabs stay.

### `tab.collapse-group` — Collapse or expand a group

Puts away the tabs of a connection that is not being worked on, without closing them.

- **Kind**: Operation
- **Engine**: Any
- **Function**: `src/features/tab/collapse-group.ts › plan(context, answers)`
- **Entry points**: a click on the label of a group (`@tab-strip`); **Collapse group** or **Expand group** in the
  context menu of the label (`@tab-menu`); Go to (**Collapse group**, **Expand group**, for the group of the active
  tab).
- **Offered when**: the group is the group of a connection. The app's group has no label and cannot be collapsed.
- **Plan**: one app step: `collapse the group of Local` or `expand the group of Local`.
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone: nothing is written to a deployment, so nothing is recorded. A click on the label puts
  it back.
- **After**: the group is drawn as `tab.groups` says. The tabs of a collapsed group stay open and keep what they
  show: their work in progress goes on. Whether each group is collapsed is saved with the tabs (`tab.restore`).
- **Rules**: making a tab of a collapsed group active, in any way (Go to, the tree, Back, the list of all tabs),
  expands its group. `Ctrl+Tab` and the keys with a number skip the tabs that are not shown (`tab.activate`). The
  context menu of a label also has **Close tabs of Local** (`tab.close-many`).
- **Commands**: `tab.collapse-group`.
- **Uses**: `tab.groups`, `tab.activate`, `tab.close-many`, `tab.restore`.
- **Ported from**: *New in Datardo*.

Acceptance:

- [ ] A click on the label `Local`, with four tabs of which none is active, leaves `Local 4` and no tab of Local in
  the strip; a second click shows the four again, in their order.
- [ ] Collapsing the group of the active tab leaves that tab shown and active.
- [ ] A query running in a tab of a collapsed group finishes, and its result is there when the group is expanded.
- [ ] Choosing a tab of a collapsed group in Go to expands the group and makes the tab active.
- [ ] A group collapsed when Datardo quits is collapsed at the next start.

### `tab.fit` — How the tabs share the strip

Decides the width of the tabs, and what happens when even the narrowest do not fit.

- **Kind**: Derivation
- **Engine**: Any
- **Function**: `src/features/tab/fit.ts › fit(stripWidth, labels, tabs)`
- **Inputs**: the width of the strip in px; the width of each group's label; the tabs that are shown, each with the
  width its whole title needs.
- **Output**: the width of each tab; whether the strip scrolls.
- **Rules**:
  1. A tab is as wide as its icon, its title and its close button need, and at most 200 px *(Datardo's choice)*.
  2. When the labels and the tabs at those widths are wider than the strip, the tabs wider than a common limit are
     narrowed to that limit, lowered until everything fits, down to 96 px *(Datardo's choice)*; the titles are cut
     with `…`. The active tab is narrowed like the others.
  3. When they do not fit even with every tab at 96 px or less, the tabs keep 96 px (or less, for a shorter title)
     and the strip scrolls sideways: with the wheel of the mouse over it, with a drag on a touch screen, and by
     itself to keep the active tab and the tab with the focus in sight. No scroll bar is drawn; the edge where tabs
     are hidden fades.
  4. While the strip scrolls, the button **All tabs** is shown at its right end, outside the part that scrolls. It
     opens Go to on the open tabs (`palette.open`, with the prefix `=`).
  5. The last 40 px *(Datardo's choice)* of the strip are kept for **All tabs** whenever it is shown.
- **Invariants**: the active tab is always in sight; no tab is ever narrower than 96 px unless its whole title needs
  less; the labels of the groups are never narrowed.
- **Worked examples** (one group with a label of 80 px; tabs that need 200 px each or more):
  - strip 1,000 px, 4 tabs → 4 × 200 = 800 ≤ 920: each 200 px, no scrolling
  - strip 1,000 px, 6 tabs → 920 / 6 = 153: each 153 px, no scrolling
  - strip 1,000 px, 9 tabs → 920 / 9 = 102: each 102 px, no scrolling
  - strip 1,000 px, 10 tabs → 920 / 10 = 92 < 96: each 96 px, the strip scrolls, **All tabs** is shown
  - strip 1,000 px, 6 tabs of which two need only 100 px → the two keep 100 px, the other four share 720 px: 180 px
    each
- **Uses**: `tab.title`, `palette.open`.
- **Ported from**: *New in Datardo*.

Acceptance:

- [ ] Opening tabs one after the other narrows them all together until they are 96 px wide; the next one makes the
  strip scroll and shows **All tabs**.
- [ ] A tab titled `db0` is never widened to match the others.
- [ ] Making active, with `Ctrl+Tab`, a tab that is out of sight scrolls the strip until it is in sight.
- [ ] Turning the wheel of the mouse over a strip that scrolls moves the tabs sideways.
- [ ] **All tabs** opens Go to listing every open tab under the name of its group; choosing one makes it active.
- [ ] Closing tabs until they fit again removes **All tabs**.

### `tab.menu` — The context menu of a tab

What can be done to a tab from the strip.

- **Kind**: View
- **Engine**: Any
- **Function**: `src/features/tab/menu.ts › view(state)`
- **Entry points**: a right click on a tab; `Shift+F10` or the menu key with the focus on it (`@tab-menu`).
- **Shows**, in this order:
  1. **Close** `Ctrl+W` (`tab.close`);
  2. **Close others**, **Close tabs of \<connection\>**, **Close all** (`tab.close-many`);
  3. a separator, then **Reopen closed tab** `Ctrl+Shift+T` (`tab.reopen`);
  4. a separator, then **Pin** or **Unpin** (`nav.pin`), **Copy path** (`nav.copy-path`), **Open on another
     connection…** (`nav.open-on-another-connection`);
  5. on a playground tab, a separator, then **Save as…** `Ctrl+Shift+S` (`playground.save`).
- **States**: the entries act on the tab the menu was opened on, which is not made active by opening the menu; **Open
  on another connection…** makes it active first. **Close others** is disabled when it is the only tab. **Close tabs
  of \<connection\>** names the connection of the tab and is not shown on a tab of the app. **Reopen closed tab** is
  disabled when no closed tab can be reopened. The entries of the fourth part are shown only where their own cards
  offer them.
- **Uses**: `tab.close`, `tab.close-many`, `tab.reopen`, `nav.pin`, `nav.copy-path`,
  `nav.open-on-another-connection`, `playground.save`.
- **Ported from**: *New in Datardo*. For reference, the menu of a tab of Mongoster's desktop app has **Close**,
  **Close others** and **Close all**: `src/standalone/main.ts` (`tabContext`).

Acceptance:

- [ ] The menu of the tab `orders` of Local shows **Close**, **Close others**, **Close tabs of Local**, **Close
  all**, **Reopen closed tab**, **Pin**, **Copy path** and **Open on another connection…**.
- [ ] The menu of the Home tab shows **Close**, **Close others**, **Close all** and **Reopen closed tab**, and
  nothing of the fourth part.
- [ ] A right click on a tab that is not active leaves the active tab active; **Close** in that menu closes the tab
  that was clicked.
- [ ] With one tab open, **Close others** is disabled.

## Opening and showing

### `tab.open` — Open a tab

Shows something in a tab of the main island. What already has a tab gets no second one.

- **Kind**: Operation
- **Engine**: Any
- **Function**: `src/features/tab/open.ts › plan(context, answers)`
- **Entry points**: none of its own: it is what every feature that shows a page starts, with what to show. A node of
  the tree (`tree.show`), a result of Go to, an item of Home (`home.show`), a pin (`nav.pin`), the menus of the path
  (`nav.path`), an entry of the rail (`nav.rail`), a button of a notification (`runner.notify`), the tools of the MCP server that open a
  tab (`mcp.tab-tools`).
- **Reads**: the open tabs, to find the one that shows the same thing (`tab.same-target`).
- **Plan**: one app step: `open the tab shop.orders of Local`, or, when it is open already, `make the tab
  shop.orders of Local active`.
- **Rules**:
  - **The same thing, the same tab**: when a tab shows the same thing, as `tab.same-target` defines it, that tab is
    made active and nothing is opened. What came with the request is given to it: a query (from a saved query, from
    **Go from here**, from a tool of the MCP server) replaces the text of its query bar and is run, the text it
    replaces staying in the recent queries (`saved-query.recent`); a section is shown.
  - **Where it goes**: a new tab goes at the end of the group of its connection, which is created at the end of the
    strip if it was not there (`tab.groups`).
  - **Active or not**: the new tab becomes active (`tab.activate`), unless it was asked for in the background: a
    click with the middle button or with `Ctrl` on what opens it, `Ctrl+Enter` in Go to. A tab opened in the
    background is drawn in the strip and loads its page only when it is first made active.
  - **Connecting**: opening a tab of a connection that is not connected starts `connection.connect`; the tab is
    there at once and its page shows the connecting, then what it reads or the error.
  - There is no limit to the number of tabs.
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone: nothing is written to a deployment, so nothing is recorded. Closing the tab undoes it.
- **After**: a place is added for **Back** when the tab becomes active (`nav.back`); the open tabs are saved
  (`tab.restore`).
- **Refuses**: the connection was removed in the meantime: *That connection no longer exists.* (`/no-connection`).
- **Uses**: `tab.same-target`, `tab.activate`, `tab.groups`, `connection.connect`, `saved-query.recent`,
  `query.run`, `tab.restore`, `nav.back`.
- **Ported from**: *New in Datardo*. For reference, Mongoster keeps one tab for each collection and gives it the
  query it is opened with: `src/collectionPanel.ts` (`CollectionPanel.show`).

Acceptance:

- [ ] A click on `orders` in the tree opens its collection tab at the end of Local's group and makes it active; a
  second click opens nothing and leaves that tab active.
- [ ] Opening a saved query of `shop.orders` while its tab shows the filter `{ status: "new" }` puts the saved
  filter in that tab and runs it; `{ status: "new" }` is then the first of the recent queries.
- [ ] A click with the middle button on `users` in the tree adds the tab `users` and leaves the active tab active;
  no `find` on `users` is sent until the tab is made active.
- [ ] Opening the first tab of Cache local adds its group after the last group.
- [ ] Opening a collection of a connection that is not connected shows the tab at once and connects it; when the
  connecting fails the tab stays, with the error in its page.
- [ ] A notification's button that opens a tab of a connection removed in the meantime says *That connection no
  longer exists.*

### `tab.same-target` — What makes two tabs the same

Says whether something asked to be opened is already open.

- **Kind**: Derivation
- **Engine**: Any
- **Function**: `src/features/tab/same-target.ts › targetKey(target)`
- **Inputs**: what a tab shows, or what is asked to be opened.
- **Output**: a key; two things are the same when their keys are equal.
- **Rules**: the key is made of the kind of tab and:

  | Tab | The same when they have the same |
  | --- | --- |
  | collection tab | connection, database, name of the collection or view. The query, the section and the layout are not part of it |
  | document tab | connection, database, collection and `_id`. Two `_id` are the same when they have the same BSON type and value; numbers are compared by value, whatever their type (`7`, `7.0` and `NumberLong(7)` are one document, `"7"` is another). A document that is being written and has not been inserted yet is the same as nothing |
  | keys tab | connection, database, namespace. The pattern and the type filter are not part of it |
  | key tab | connection, database, name of the key, byte for byte |
  | playground tab | the file, by its full path, without regard to case on Windows and macOS. A playground never saved is the same as nothing |
  | console tab | connection: one console for each connection |
  | page tab | connection, page, and what the page is of: the database, the bucket, or for a comparison its two sides in their order |
  | app tab | the page: one Home, one Settings, one Undo history, one Scheduled tasks, one Log. A connection form: the connection it edits; the form of a new connection is one |

  The connection is the saved connection, by its identity, not by its name: two connections to the same server are
  two.
- **Invariants**: no two open tabs have equal keys; the key never holds a secret, the text of a query or a value.
- **Worked examples**:
  - `shop.orders` on Local with the filter `{ status: "paid" }`, and `shop.orders` on Local with no filter → the
    same
  - `shop.orders` on Local, and `shop.orders` on Staging → different
  - the document `_id: 7` and the document `_id: NumberLong(7)` of `shop.orders` → the same
  - the document `_id: 7` and the document `_id: "7"` → different
  - the keys of `db0` with the pattern `orders:*`, and the keys of `db0` with no pattern → the same
  - the keys of the namespace `orders:` and the keys of `db0` → different
  - `C:\work\cleanup.mongodb.js` and `c:\WORK\cleanup.mongodb.js` on Windows → the same
  - two playgrounds never saved → different
  - the Monitor page of Local, twice → the same
  - the comparison of `shop.orders` on Local with `shop.orders` on Staging, and the one with the two sides swapped →
    different
- **Uses**: `tab.open`, `nav.back`, `tab.reopen`.
- **Ported from**: *New in Datardo*.

Acceptance:

- [ ] Asking for `shop.orders` of Local twice, the second time with another filter, leaves one tab.
- [ ] Opening the document `_id: NumberLong(7)` while the document tab of `_id: 7` is open makes that tab active.
- [ ] **New playground** twice opens two tabs; opening the same file twice opens one.
- [ ] **Console** in the pages of Cache local, chosen twice, leaves one console tab.
- [ ] The same collection on two connections has two tabs, one in each group.

### `tab.activate` — Make a tab active

Shows a tab, and makes the rest of the window follow it.

- **Kind**: Operation
- **Engine**: Any
- **Function**: `src/features/tab/activate.ts › plan(context, answers)`
- **Entry points**: a click on a tab, or `Enter` on it with the focus on the strip (`@tab-strip`); `Ctrl+Tab` and
  `Ctrl+PageDown` (**Next tab**), `Ctrl+Shift+Tab` and `Ctrl+PageUp` (**Previous tab**); `Ctrl+1` to `Ctrl+8` (**Go
  to tab 1** to **Go to tab 8**) and `Ctrl+9` (**Go to last tab**); Go to, with the same titles and with every open
  tab it finds; and every feature that opens what is open already (`tab.open`). On macOS `Ctrl+Tab` and
  `Ctrl+Shift+Tab` keep `Ctrl`.
- **Plan**: two app steps: `make the tab shop.orders of Local active`, and, for a tab of a connection,
  `remember shop.orders of Local as a recent place` (`palette.recent`).
- **Rules**:
  - **Next** and **previous** follow the order of the strip, through every group, and go round at the ends. Tabs
    that are not shown because their group is collapsed are skipped.
  - **The number** counts the tabs that are shown, from the left, the app's group first; `Ctrl+9` is always the
    last tab, however many there are *(Datardo's choice, as browsers do)*. A number with no tab does nothing.
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone: nothing is written to a deployment, so nothing is recorded. **Back** returns to the tab
  that was active (`nav.back`).
- **After**, at once and together:
  - the page of the tab is shown as it was left: its query text, its results, its scroll, its selection and its
    section. Nothing is read again because the tab became active; a tab opened in the background, or restored and
    not yet shown, loads now;
  - the connection of the tab becomes the current one (`nav.current-connection`): the connection island, the tree
    island and the status line show it. A tab of the app leaves the current connection as it is;
  - the tree shows the node of what the tab shows selected, expanding what holds it, when the tree has read it; it
    reads nothing for this (`tree.show`);
  - the scope bar, the section bar, the inspector island (with the tab's own selection) and the count on the status
    line are those of the tab; the name of the window changes (`window.title`);
  - the group of the tab is expanded if it was collapsed, and the strip scrolls to show the tab (`tab.fit`);
  - a place is added for **Back** (`nav.back`);
  - the focus goes to the page, unless the tab was made active with a key of the strip, which keeps the focus on
    the strip.

  Making a tab active never connects its connection: the page connects when it next reads.
- **Commands**: `tab.activate:next`, `tab.activate:previous`, `tab.activate:1`, `tab.activate:2`, `tab.activate:3`,
  `tab.activate:4`, `tab.activate:5`, `tab.activate:6`, `tab.activate:7`, `tab.activate:8`, `tab.activate:last`.
- **Uses**: `nav.current-connection`, `tree.show`, `nav.back`, `tab.fit`, `tab.groups`, `palette.recent`,
  `window.title`.
- **Ported from**: *New in Datardo*. For reference, Mongoster's desktop app has `Ctrl+PageDown` and `Ctrl+PageUp`
  (README, **Desktop app**, **Window**).

Acceptance:

- [ ] With the tabs Home, `orders` and `users` of Local and **Keys** of Cache local, `Ctrl+Tab` from `users` makes
  **Keys** active and Cache local current; `Ctrl+Tab` again makes Home active and leaves Cache local current.
- [ ] `Ctrl+Shift+Tab` from Home makes **Keys** active.
- [ ] With those four tabs, `Ctrl+2` makes `orders` active, `Ctrl+9` makes **Keys** active and `Ctrl+7` does
  nothing.
- [ ] With Local's group collapsed and Home active, `Ctrl+Tab` makes **Keys** active.
- [ ] Coming back to the tab of `orders` shows the same rows, the same scroll and the same selected row, and sends
  nothing to the server.
- [ ] Making the tab of `orders` active selects `orders` under `shop` in the tree, expanding `shop`.
- [ ] Making active a tab of a connection that is not connected does not connect it.
- [ ] After `orders` of Local was made active, it is the first of the recent places of Go to.

## Closing

### `tab.close` — Close a tab

Closes one tab. A tab with changes that are not saved asks first.

- **Kind**: Operation
- **Engine**: Any
- **Function**: `src/features/tab/close.ts › plan(context, answers)`
- **Entry points**: the close button of a tab and a click with the middle button on it (`@tab-strip`); **Close** in
  its context menu (`@tab-menu`); `Ctrl+W`, for the active tab; `Delete` with the focus on a tab of the strip; on
  macOS **File › Close tab** (`@app-menu`); Go to (**Close tab**).
- **Offered when**: always, except for Home while it is the only tab.
- **Asks**: only when the tab has unsaved changes, after making it active: *Do you want to save the changes you made
  to \<title of the tab\>?*, with the line *Your changes will be lost if you don't save them.* and the buttons
  **Save**, **Don't save** and **Cancel**.
  - **Save** saves as `Ctrl+S` does in that tab, then closes. When the save is refused or fails (a read-only
    connection, a document the validation rules reject, a file that cannot be written), its message is shown and the
    tab stays open.
  - **Don't save** closes and loses the changes.
  - **Cancel**, or `Esc`, keeps the tab.
- **Which tabs have unsaved changes**: a document tab whose text differs from the document as it was read or last
  saved; a playground tab whose text differs from its file, or that was never saved and has text other than the text
  it opened with. No other kind of tab asks: the text of a query bar, a pattern, a form that was not sent are closed
  without a question.
- **Plan**: one app step, `close the tab shop.orders of Local`.
- **Danger**: None: the question above is asked by the feature itself, and nothing in a deployment is lost.
- **Read-only**: Allowed, because closing writes nothing to a deployment; **Save** is the save of the tab, which a
  read-only connection refuses with its own message.
- **Undo**: Cannot be undone: nothing is written to a deployment, so nothing is recorded. **Reopen closed tab**
  opens it again (`tab.reopen`), without the changes that were not saved.
- **After**:
  - the reads of its page that are still running are cancelled (a query, a count, a scan), as `runner.cancel` does;
    a plan it started that is in progress (an export, an update of many documents) goes on, on the status line;
  - when it was the active tab, the tab that was active before it becomes active (`tab.activate`); with none left,
    the Home tab is opened: the strip is never empty;
  - its group goes when it was its last tab (`tab.groups`); the current connection changes only as the newly active
    tab says (`nav.current-connection`);
  - it is remembered for `tab.reopen`, and the open tabs are saved (`tab.restore`).
- **Rules**: a feature that removes what a tab shows closes the tab without this question, since its own
  confirmation came first: dropping a collection or a database (`manage.drop-collection`, `manage.drop-database`),
  deleting a key (`key.delete`), removing a connection (`tab.connection-gone`).
- **Commands**: `tab.close`.
- **Uses**: `runner.ask`, `runner.cancel`, `tab.activate`, `tab.groups`, `tab.reopen`, `tab.restore`, `home.show`.
- **Ported from**: *New in Datardo*. The question and its buttons are those of Mongoster's desktop app:
  `src/standalone/vscode/documents.ts` (`confirmClose`).

Acceptance:

- [ ] `Ctrl+W` on a collection tab with a filter typed and not run closes it without a question.
- [ ] `Ctrl+W` on the document tab `orders · 7` with an edit not saved asks *Do you want to save the changes you
  made to orders · 7?* with **Save**, **Don't save** and **Cancel**.
- [ ] **Save** writes the document as `Ctrl+S` would and closes the tab; **Don't save** closes it and the document
  in the database is unchanged; **Cancel** keeps the tab with its edit.
- [ ] **Save** on a read-only connection shows the refusal of the save and keeps the tab open.
- [ ] A playground never saved and left as it opened closes without a question; one with a line typed asks.
- [ ] Closing the active tab makes active the tab that was active before it, not its neighbor.
- [ ] Closing the last tab opens Home; the close button of Home is not shown while Home is the only tab.
- [ ] Closing a collection tab whose query is still running cancels the query; closing the tab that started an
  export leaves the export running, with **Cancel** on the status line.
- [ ] A click with the middle button on a tab that is not active closes it and leaves the active tab active.

### `tab.close-many` — Close the other tabs, the tabs of a connection, or all

Closes several tabs at once.

- **Kind**: Operation
- **Engine**: Any
- **Function**: `src/features/tab/close-many.ts › plan(context, answers)`
- **Entry points**: **Close others**, **Close tabs of \<connection\>** and **Close all** in the context menu of a tab
  (`@tab-menu`); **Close tabs of \<connection\>** in the context menu of a group's label (`@tab-menu`); Go to
  (**Close other tabs**, **Close tabs of this connection**, **Close all tabs**, for the active tab).
- **Offered when**: **Close others** when another tab is open; **Close tabs of \<connection\>** on a tab or a label
  of a connection; **Close all** always.
- **Which tabs**: **Close others**: every tab of the strip but the one it was started on, in every group. **Close
  tabs of \<connection\>**: every tab of that group. **Close all**: every tab.
- **Asks**: for each of those tabs that has unsaved changes, in the order of the strip, after making it active, the
  question of `tab.close`. All the questions come before anything is closed. **Cancel** on any of them closes
  nothing; what was answered with **Save** before it stays saved.
- **Plan**: one app step for each tab, in the order of the strip: `close the tab shop.orders of Local`.
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone: nothing is written to a deployment, so nothing is recorded. **Reopen closed tab**
  opens them again one at a time, the last closed first (`tab.reopen`).
- **After**: as `tab.close` for each. After **Close all**, the Home tab is the only tab. After **Close others**, the
  tab it was started on is active. After **Close tabs of \<connection\>**, when the active tab was one of them, the
  tab that was active last among those left becomes active, and its connection, if it has one, becomes current.
- **Commands**: `tab.close-many:others`, `tab.close-many:connection`, `tab.close-many:all`.
- **Uses**: `tab.close`, `tab.activate`, `tab.reopen`, `home.show`.
- **Ported from**: *New in Datardo*. For reference, Mongoster's desktop app: `src/standalone/main.ts`
  (`tabContext`), `src/standalone/vscode/documents.ts` (`confirmCloseAll`).

Acceptance:

- [ ] **Close others** on `orders` of Local, with Home, `users` of Local and **Keys** of Cache local open, leaves
  `orders` alone in the strip, active.
- [ ] **Close tabs of Local** closes `orders` and `users`, removes the group of Local and leaves Home and **Keys**.
- [ ] **Close all** leaves the Home tab only.
- [ ] With two document tabs with unsaved changes among those to close, both questions are asked before any tab
  closes; **Cancel** on the second leaves every tab open, the first one saved if **Save** was its answer.
- [ ] After **Close tabs of Local** closed three tabs, `Ctrl+Shift+T` three times brings the three back.
- [ ] The Home tab's menu does not show **Close tabs of**.

### `tab.connection-gone` — The tabs of a connection that is disconnected or removed

What happens to the tabs when their connection stops being connected, and when it stops being saved.

- **Kind**: View
- **Engine**: Any
- **Function**: `src/features/tab/connection-gone.ts › view(state)`
- **Entry points**: none: it follows `connection.disconnect`, a connection that fails or drops, the save of a
  connection form, and `connection.remove`.
- **States**:
  - **Disconnected** (by **Disconnect**, by a drop of the network, by a failure): the tabs stay open with what they
    show; the dot of their group becomes a ring, or takes the error color when the connection failed
    (`tab.groups`). Nothing is asked. A read that was running fails with the message of its page. The next read of
    a page (running a query, **Refresh**, opening another section) connects again without asking
    (`connection.connect`). Text that is not saved stays in its tab.
  - **Edited** (the connection form was saved): the tabs stay; the label and the color of the group follow; the
    connection is disconnected as above when its address or its options changed.
  - **Removed** (`connection.remove`): every tab of the connection is closed, of every kind, and its group goes. The
    tabs with unsaved changes are asked about first, with the question of `tab.close`, after the confirmation of
    the removal and before anything is removed: **Cancel** there keeps the connection and every tab. The tabs
    closed this way are not offered by **Reopen closed tab**; their places are taken out of **Back** and **Forward**
    (`nav.back`), of the recent places (`palette.recent`) and of the pins (`nav.pin`). When the active tab was one
    of them, the tab that was active last among those left becomes active, or Home.
  - **A page that compares two connections** is closed when either is removed.
- **Uses**: `connection.disconnect`, `connection.connect`, `connection.remove`, `tab.close`, `tab.groups`,
  `tab.reopen`, `nav.back`, `palette.recent`, `nav.pin`.
- **Ported from**: connection.disconnect and connection.remove of Mongoster, for what follows them in the tabs:
  `src/extension.ts` (the handler of the removal), `src/collectionPanel.ts` (`CollectionPanel.close`). Every tab
  closes, the collection tabs included.

Acceptance:

- [ ] After **Disconnect** on Local, its tabs are still open with their rows, and the dot of the group is a ring.
- [ ] Running a query in one of those tabs connects Local again without a question, and the dot is filled.
- [ ] Removing Local closes its collection tabs, document tabs, playground tabs and page tabs, and its group is
  gone.
- [ ] Removing Local with an edited document tab asks *Do you want to save the changes you made to orders · 7?*;
  **Cancel** leaves Local saved and all its tabs open.
- [ ] After Local is removed, `Ctrl+Shift+T` reopens no tab of Local and **Back** stops on no place of Local.
- [ ] Removing Staging closes the comparison of Local with Staging, which is in the group of Local.
- [ ] Renaming Local to Dev changes the label of its group to `Dev` and leaves its tabs open.

## Order

### `tab.reorder` — Reorder the tabs of a group

Moves a tab to another place among the tabs of its connection.

- **Kind**: Operation
- **Engine**: Any
- **Function**: `src/features/tab/reorder.ts › plan(context, answers)`
- **Entry points**: dragging a tab along the strip (`@tab-strip`); `Ctrl+Shift+PageUp` (**Move tab left**) and
  `Ctrl+Shift+PageDown` (**Move tab right**), for the active tab; Go to with the same titles.
- **Offered when**: the group of the tab has more than one tab.
- **Plan**: one app step, `move the tab users of Local to place 1`.
- **Rules**: a tab moves only inside its group: it belongs to its connection. While it is dragged, the other tabs
  of the group make room where it would land; over another group, or outside the strip, no room is made, and
  releasing it there puts it back where it was. `Esc` during the drag puts it back. A drag starts after the pointer
  has moved 4 px *(Datardo's choice)*, so that a click is never a drag. The keys stop at the ends of the group.
  Groups are not reordered (`tab.groups`).
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone: nothing is written to a deployment, so nothing is recorded. Dragging it back puts it
  back.
- **After**: the order is saved with the tabs (`tab.restore`); `Ctrl+Tab` and the keys with a number follow the new
  order. The active tab stays the active one.
- **Commands**: `tab.reorder:left`, `tab.reorder:right`.
- **Uses**: `tab.groups`, `tab.restore`.
- **Ported from**: *New in Datardo*.

Acceptance:

- [ ] Dragging `users` before `orders` in Local's group makes the group `users`, `orders`; the order is the same
  after a restart.
- [ ] Releasing a tab of Local over the group of Cache local leaves it where it was, in Local.
- [ ] `Ctrl+Shift+PageUp` on the first tab of its group changes nothing.
- [ ] Dragging a tab that is not active reorders it and does not make it active.
- [ ] `Esc` during a drag puts the tab back.

## Across starts

### `tab.restore` — Restore the tabs at the next start

Datardo starts with the tabs it had, in their groups and order, on the tab that was active.

- **Kind**: Operation
- **Engine**: Any
- **Function**: `src/features/tab/restore.ts › plan(context, answers)`
- **Entry points**: none: it saves by itself while Datardo runs and restores when Datardo starts. The setting is in
  the Settings page (`settings.page`).
- **Plan**: while running, one app step, `save the open tabs`, 1 second *(Datardo's choice)* after the last change
  to what is saved, and when Datardo quits (`window.quit`); at start, `open the saved tabs`.
- **What is saved**, in a file of the data folder:
  - the tabs in their order, with what each shows (`tab.same-target`), the order of the groups and which are
    collapsed, and the active tab;
  - for each tab, its section; for a collection tab, the text of its query bar and of its pipeline; for a keys tab,
    its pattern and type filter; for a playground tab, its file;
  - the *draft* of a tab with unsaved changes: the text of a playground never saved, and the text of a playground
    or of a document tab that differs from what was saved, with the document as it was read.

  Never saved: results, documents, values of keys, the selection, the scroll, a connection string, a password.
- **What is restored**:
  - the tabs, the groups, the collapsed state and the active tab, as saved. A tab whose connection is no longer
    saved is left out; with none left, Home;
  - only the active tab loads its page, which connects its connection (`connection.connect`); every other tab is
    drawn in the strip and loads when it is first made active (`tab.activate`). Nothing connects for a tab that is
    not shown;
  - a collection tab loads with its saved query text and runs it, as when it is opened; what no longer exists (a
    dropped collection, an expired key, a file that was moved) is said by the page, in its own words;
  - a draft comes back as the text of its tab, marked as unsaved. Drafts are left only by a Datardo that did not
    quit by itself (a crash, a kill, a shutdown of the system, `window.recover`): a quit asks about every unsaved
    change first (`window.quit`), so nothing is left to restore.
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone: nothing is written to a deployment, so nothing is recorded.
- **After**: **Back** and **Forward** start empty (`nav.back`); the list of closed tabs starts empty (`tab.reopen`).
- **Settings**: `datardo.tab.restore`: on by default. Off, Datardo starts with the Home tab only, and saves nothing
  but drafts; a tab that has a draft is restored whatever the setting says, since the text would be lost otherwise.
- **Uses**: `tab.same-target`, `tab.activate`, `tab.groups`, `connection.connect`, `window.quit`, `window.recover`,
  `settings.read`.
- **Ported from**: *New in Datardo*.

Acceptance:

- [ ] Quitting with Home, `orders` and `users` of Local and **Keys** of Cache local open, `users` active, and
  starting again shows the same four tabs in the same groups, with `users` active.
- [ ] After that start, Local is connecting or connected and Cache local is not: no command reaches the Redis
  server until its tab is made active.
- [ ] The tab of `orders` restored with the filter `{ status: "paid" }` shows that filter and, when made active,
  runs it.
- [ ] The saved file holds no document, no value of a key and no connection string.
- [ ] With `datardo.tab.restore` off, Datardo starts with Home only.
- [ ] After Datardo's processes are killed with a line typed 5 seconds before in **Playground 1**, the next start
  shows **Playground 1** with that line, marked as unsaved, with the setting on or off.
- [ ] A tab of a connection removed from the connections file while Datardo was closed is not restored, and no
  error is shown.
- [ ] A restored tab of a collection dropped in the meantime opens, and its page says the collection does not
  exist.

### `tab.reopen` — Reopen the last closed tab

Brings back the tab that was just closed, with the section and the query it had.

- **Kind**: Operation
- **Engine**: Any
- **Function**: `src/features/tab/reopen.ts › plan(context, answers)`
- **Entry points**: `Ctrl+Shift+T`; **Reopen closed tab** in the context menu of a tab (`@tab-menu`); on macOS
  **File › Reopen closed tab** (`@app-menu`); Go to (**Reopen closed tab**).
- **Offered when**: a closed tab can be reopened. Otherwise the entries are disabled and the key does nothing.
- **Plan**: one app step, `open the tab shop.orders of Local`, as `tab.open` writes it.
- **Rules**:
  - Datardo remembers the last 20 tabs closed *(Datardo's choice)* in this run, the last closed first; the list is
    empty at start.
  - A tab comes back in its group, at the place it had or at the end if that place is gone, active, on the section
    it had, with its query text (or pattern and type filter); its page reads again, as a tab just opened.
  - A document tab or a playground tab closed with **Don't save** comes back without the changes: the document as it
    is read now, the file as it is on disk.
  - Not remembered: a playground never saved (there is nothing to open), the tabs closed because their connection
    was removed or what they showed was dropped or deleted.
  - When what the closed tab showed has a tab again (`tab.same-target`), that entry is skipped and the next one is
    taken.
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone: nothing is written to a deployment, so nothing is recorded. Closing the tab undoes it.
- **After**: as `tab.open`: the connection of the tab becomes current, and connects if it was not connected.
- **Commands**: `tab.reopen`.
- **Uses**: `tab.open`, `tab.same-target`, `tab.close`.
- **Ported from**: *New in Datardo*.

Acceptance:

- [ ] Closing `orders` (on **Indexes**) and then `users`, `Ctrl+Shift+T` opens `users` and `Ctrl+Shift+T` again
  opens `orders` on **Indexes**.
- [ ] A tab closed from the middle of its group comes back in the middle.
- [ ] After closing `orders` and opening it again from the tree, `Ctrl+Shift+T` does not open a second `orders`: it
  opens the tab closed before it, or does nothing.
- [ ] A document tab closed with **Don't save** comes back showing the document as it is in the database.
- [ ] Right after Datardo starts, **Reopen closed tab** is disabled.
- [ ] The 21st tab closed makes the first one unreachable.
- [ ] A collection dropped with Datardo while its tab was open is not offered again.
