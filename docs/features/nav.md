# Getting around

How the user moves in the window, for every engine: the rail, the explorer and its two islands, the current
connection and the connection switcher, pins, the scope bar with Back, Forward, the path and **Open on another
connection**, the inspector island, the status line, how every dialog behaves, the keys that move between islands,
and what the window shows when there is no connection at all. The frame of the window is in [window.md](window.md),
the tab strip in [tab.md](tab.md), Go to in [palette.md](palette.md), the Home page in [home.md](home.md). What the
tree island lists belongs to the tree area (`tree.show`); notifications and the confirmation of a write belong to
the runner (`runner.notify`, `runner.confirm`).

## The rail and the islands

### `nav.rail` — The rail

The column of icons at the left edge of the window: the ways to the pages of the app, and the switch of the
explorer.

- **Kind**: View
- **Engine**: Any
- **Function**: `src/features/nav/rail.ts › view(state)`
- **Entry points**: always shown, on the window's background, 48 px wide *(Datardo's choice)*, from under the top bar
  to above the status line (`@rail`).
- **Shows**, from the top: **Home**, **Explorer**, **Search**, **Undo history**, **Scheduled tasks**; at the bottom,
  **Settings**. Each entry is an icon with a name a screen reader says; resting the pointer on it shows the name and
  the key, when it has one.
  - **Home** makes the Home tab active, opening it if needed (`home.show`).
  - **Explorer** shows or hides the explorer (`nav.toggle-explorer`).
  - **Search** opens the page that looks for something in the current connection: for a MongoDB connection the
    Search documents page (`search.show`); for a Redis connection the keys tab of the database the active tab is in,
    or `db0`, with the focus in its pattern (`key.show`).
  - **Undo history** opens the Undo history page (`undo.show`).
  - **Scheduled tasks** opens the Scheduled tasks page (`task.show`).
  - **Settings** opens the Settings page (`settings.page`).
- **States**: the entry whose page is in the active tab is marked; **Explorer** is marked while the explorer is
  shown. **Search** is disabled, with *Choose a connection first.* when the pointer rests on it, while no connection
  is current (`nav.current-connection`). With the focus on the rail, `Up` and `Down` move between its entries and
  `Enter` or `Space` starts the one focused.
- **Uses**: `home.show`, `nav.toggle-explorer`, `search.show`, `key.show`, `undo.show`, `task.show`,
  `settings.page`, `tab.open`.
- **Ported from**: *New in Datardo*.

Acceptance:

- [ ] The rail shows six entries: **Home**, **Explorer**, **Search**, **Undo history**, **Scheduled tasks** from the
  top, and **Settings** at the bottom.
- [ ] A click on **Undo history** opens the Undo history tab in the app's group; a second click makes that same tab
  active and opens no second one.
- [ ] With the Settings tab active, **Settings** is marked; making a collection tab active unmarks it.
- [ ] With a MongoDB connection current, **Search** opens its Search documents page; with a Redis connection current
  it opens the keys tab of `db0` with the focus in the pattern.
- [ ] With no connection current, **Search** is disabled and a click does nothing.
- [ ] With the focus on **Home**, pressing `Down` twice and `Enter` opens what **Search** opens.

### `nav.toggle-explorer` — Show or hide the explorer

Gives the main island the room of the explorer, and back.

- **Kind**: Operation
- **Engine**: Any
- **Function**: `src/features/nav/toggle-explorer.ts › plan(context, answers)`
- **Entry points**: **Explorer** on the rail (`@rail`); `Ctrl+B`; on macOS the **View** menu (`@app-menu`); Go to
  (**Hide explorer** while it is shown, **Show explorer** while it is hidden).
- **Plan**: one app step: `hide the explorer` or `show the explorer`.
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone: nothing is written to a deployment, so nothing is recorded. The same key puts it back.
- **After**: the main island takes or gives the room (`nav.layout`). The choice is remembered across starts. Hiding
  the explorer while the focus is in it moves the focus to the page of the main island. The explorer comes back with
  the width it had, the same nodes of the tree expanded and the same scroll.
- **Rules**: a feature that must show a node of the tree (**Reveal in the explorer**, the path's menu of databases)
  shows the explorer first, and that counts as the user's choice. An explorer hidden by `nav.layout` because the
  window is narrow is not the user's choice: it comes back when the window is wider.
- **Commands**: `nav.toggle-explorer`.
- **Uses**: `nav.layout`.
- **Ported from**: *New in Datardo*. For reference, Mongoster's desktop app hides its connections with the same key
  (README, **Desktop app**, **Window**).

Acceptance:

- [ ] `Ctrl+B` hides the connection island and the tree island together, and the main island starts right after
  the rail; `Ctrl+B` again shows them at the width they had.
- [ ] With the explorer hidden, **Explorer** on the rail is not marked and Go to lists **Show explorer**.
- [ ] A Datardo quit with the explorer hidden starts with the explorer hidden.
- [ ] Hiding the explorer with a node of the tree focused puts the focus in the page of the active tab.
- [ ] Hiding and showing keeps the database `shop` expanded as it was.

### `nav.resize` — Resize the explorer and the inspector island

The gap between two islands is a handle: dragging it changes how the width is shared.

- **Kind**: Operation
- **Engine**: Any
- **Function**: `src/features/nav/resize.ts › plan(context, answers)`
- **Entry points**: the gap between the explorer and the main island, and the gap between the main island and the
  inspector island: dragged, double-clicked, or moved with the keyboard when it has the focus. Go to (**Reset island
  widths**).
- **Plan**: one app step: `set the width of the explorer to 320 px` or `set the width of the inspector island to
  400 px`; for **Reset island widths**, both, to their defaults.
- **Rules**:
  - The explorer is 280 px wide by default and can be from 200 to 480 px; the inspector island is 360 px by default
    and can be from 240 to 640 px; the main island is never left less than 480 px *(all Datardo's choices)*.
  - The gap is 8 px wide *(Datardo's choice)*. Over it the pointer becomes the horizontal resize pointer, and the
    islands follow the drag as it goes.
  - A drag stops at the limits above. Dragged more than 60 px *(Datardo's choice)* beyond its minimum width, the
    island hides, as `nav.toggle-explorer` or `nav.toggle-inspector` would; dragged back before the button is
    released, it shows again.
  - A double click on the gap gives the island beside it its default width.
  - The gap can take the focus with `Tab`; then `Left` and `Right` move it by 16 px *(Datardo's choice)*, `Home` and
    `End` go to the minimum and the maximum, `Enter` gives the default. A screen reader says **Resize explorer** or
    **Resize inspector**, with the width.
  - The connection island and the tree island share one width; the connection island is as tall as what it shows,
    and the gap between the two is not a handle.
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone: nothing is written to a deployment, so nothing is recorded. A double click on the gap
  gives the default width back.
- **After**: the two widths are remembered across starts, for the window, not for each connection. What the window
  shows when it is too narrow for them is `nav.layout`'s, which never changes the widths remembered.
- **Commands**: `nav.resize:reset`.
- **Uses**: `nav.layout`, `nav.toggle-explorer`, `nav.toggle-inspector`.
- **Ported from**: *New in Datardo*.

Acceptance:

- [ ] Dragging the gap at the right of the explorer 40 px to the right makes the explorer 320 px wide, and it is
  320 px wide after a restart.
- [ ] The explorer cannot be dragged wider than 480 px, nor the inspector island wider than 640 px.
- [ ] In a window 1,280 px wide with the explorer at 280 px, the inspector island cannot be dragged wider than
  448 px, which leaves the main island 480 px.
- [ ] Dragging the explorer's gap to 130 px from the rail hides the explorer; releasing there leaves it hidden, and
  `Ctrl+B` shows it 200 px wide.
- [ ] A double click on the gap at the left of the inspector island makes it 360 px wide.
- [ ] With the focus on the explorer's gap, `Right` pressed twice widens the explorer by 32 px.
- [ ] **Reset island widths** gives 280 px and 360 px.

### `nav.layout` — How the islands share the window

Decides the width of each island from the width of the window, so that the main island always has room to work in.

- **Kind**: Derivation
- **Engine**: Any
- **Function**: `src/features/nav/layout.ts › layout(windowWidth, explorer, inspector)`
- **Inputs**: the inner width of the window in px, after the zoom; for the explorer and for the inspector island,
  whether it is wanted (the user's choice, and for the inspector island whether the page has something to inspect:
  `nav.inspector`) and its remembered width.
- **Output**: for each of the two, whether it is shown and its width; the width of the main island.
- **Rules**: the rail takes 48 px at the left and the window keeps 8 px free at the right; an island that is shown
  takes its width and the 8 px of the gap that follows or precedes it. So main = window − 56 − (explorer + 8 when
  shown) − (inspector + 8 when shown). The first of these that leaves the main island at least 480 px is the layout:
  1. both at their remembered widths;
  2. the inspector island narrowed by what is missing, down to 240 px;
  3. the inspector island at 240 px and the explorer narrowed by what is still missing, down to 200 px;
  4. the inspector island hidden, the explorer at its remembered width, narrowed by what is missing down to 200 px;
  5. both hidden.

  An island that is not wanted is simply left out of every line.
- **Invariants**: the main island is at least 480 px wide in every window of the minimum width (640 px) or more; the
  remembered widths and the user's choices are never changed by this, so widening the window gives everything back;
  the result depends on its inputs only.
- **Worked examples** (window; explorer and inspector both wanted, remembered at 280 and 360 px):
  - 1,280 → explorer 280, inspector 360, main 568
  - 1,100 → explorer 280, inspector 268, main 480
  - 1,000 → explorer 208, inspector 240, main 480
  - 900 → explorer 280, inspector hidden, main 556
  - 700 → both hidden, main 644
  - 640 → both hidden, main 584
  - 900, with the inspector island not wanted → explorer 280, main 556
  - 1,000, with the explorer hidden by the user → inspector 360, main 576
- **Ported from**: *New in Datardo*.

Acceptance:

- [ ] In a window 1,100 px wide, with widths of 280 and 360 px remembered, the explorer is 280 px, the inspector
  island 268 px and the main island 480 px.
- [ ] Narrowing that window to 900 px hides the inspector island and gives the explorer its 280 px back; widening it
  to 1,280 px shows the inspector island 360 px wide again, without the user doing anything.
- [ ] At 640 px, the minimum, only the rail and the main island are shown, and the main island is 584 px wide.
- [ ] After any of these, `nav.resize` still reports 280 and 360 px as the remembered widths.
- [ ] An inspector island hidden by this rule is not marked as hidden by the user: Go to still lists **Hide
  inspector**.

### `nav.focus-island` — Move between the islands with the keyboard

`F6` takes the focus from one part of the window to the next, so that no part needs the mouse.

- **Kind**: Derivation
- **Engine**: Any
- **Function**: `src/features/nav/focus-island.ts › nextIsland(shown, focused, direction)`
- **Entry points**: `F6` (forward) and `Shift+F6` (backward); Go to (**Focus next island**, **Focus previous
  island**).
- **Inputs**: the parts of the window that are shown; the part that holds the focus, or none; the direction.
- **Output**: the part that takes the focus.
- **Rules**: the order is the rail, the connection island, the tree island, the main island, the inspector island,
  the status line, and round again. A part that is not shown is skipped. With the focus in the top bar, or nowhere,
  `F6` goes to the first part of the order and `Shift+F6` to the last. Inside the part, the focus goes to the
  control that had it last; the first time, to the first entry of the rail, the connection island's own button, the
  selected node of the tree, the page of the main island (not its tab strip), the first control of the inspector
  island, the first part of the status line. While a dialog or Go to is open, `F6` does nothing: the focus stays
  inside (`nav.dialog`).
- **Invariants**: every part that is shown is reached in at most five presses; the focus is always shown with a
  ring.
- **Worked examples**:
  - everything shown, focus in the tree island, forward → the main island
  - explorer hidden, focus on the rail, forward → the main island
  - inspector island hidden, focus in the main island, forward → the status line
  - focus on the status line, forward → the rail
  - focus on the rail, backward → the status line
  - focus in the **Go to** field of the top bar after it closed, forward → the rail
- **Commands**: `nav.focus-island:next`, `nav.focus-island:previous`.
- **Uses**: `nav.dialog`.
- **Ported from**: *New in Datardo*.

Acceptance:

- [ ] With every part shown, six presses of `F6` from the rail visit the connection island, the tree island, the
  main island, the inspector island and the status line, and come back to the rail.
- [ ] With the explorer and the inspector island hidden, `F6` alternates between the rail, the main island and the
  status line.
- [ ] Coming back to the tree island with `F6` puts the focus on the node that had it, not on the first one.
- [ ] `F6` into the main island puts the focus in the page: in a collection tab, on the cell of the table that had
  it.
- [ ] With a confirmation open, `F6` leaves the focus in the confirmation.
- [ ] The control that has the focus is drawn with a ring in both themes.

## The current connection

### `nav.current-connection` — Which connection is current

The explorer shows one connection at a time. This says which.

- **Kind**: Derivation
- **Engine**: Any
- **Function**: `src/features/nav/current-connection.ts › currentConnection(activeTab, lastCurrent, connections)`
- **Inputs**: the active tab and the connection it belongs to, or none for a tab of the app; the connection that was
  last made current; the saved connections.
- **Output**: one saved connection, or none.
- **Rules**, in order:
  1. The active tab belongs to a connection: that connection.
  2. The active tab is a tab of the app: the connection last made current, when it is still saved.
  3. Otherwise none.
- **Invariants**: a tab of a connection is never active while another connection is current; being current says
  nothing about being connected; a connection that was removed is never current.
- **What follows a change**: the connection island (`nav.connection-island`), the linked connection row
  (`nav.linked-connection`), the tree island with its Pinned section (`tree.show`, `nav.pin`), the connection part
  and **Read-only** on the status line (`nav.status-line`) all show the new one at once; the latency is read for it
  (`nav.ping`); a command started from Go to or with a key starts on it.
- **Worked examples**:
  - active tab: the collection tab of `orders` on Local → Local
  - active tab: Home; last made current: Cache local → Cache local
  - active tab: Settings; last made current: Staging, removed since → none
  - first start with three saved connections and only the Home tab → none
  - active tab: Home; the user chooses Staging in the connection switcher, and Staging has two tabs → Staging, since
    `nav.switch-connection` makes its last active tab active
- **Uses**: `tab.activate`, `nav.switch-connection`.
- **Ported from**: *New in Datardo*.

Acceptance:

- [ ] Making a tab of Cache local active while Local is current shows Cache local in the connection island and its
  databases in the tree island, without any other action.
- [ ] Opening Settings from a tab of Local leaves Local in the explorer.
- [ ] Removing the current connection while Home is active leaves the explorer with no connection
  (`nav.empty`).
- [ ] With Local current and not connected, the explorer shows Local as not connected: nothing connects it by
  itself.

### `nav.connection-island` — The connection island

Shows the current connection and its state, and opens the connection switcher.

- **Kind**: View
- **Engine**: Any
- **Function**: `src/features/nav/connection-island.ts › view(state)`
- **Entry points**: the first island of the explorer (`@connection-island`).
- **Reads**: the current connection (`nav.current-connection`), its state as the connection area keeps it, what the
  server said it is when it connected, the latency (`nav.ping`).
- **Shows**: one button as wide as the island, which opens the connection switcher (`nav.switch-connection`), with:
  - first line: the dot of the connection in its color, its name, **Read-only** when it is a read-only connection,
    and the sign of the switcher at the right end;
  - second line, according to the state:

    | State | Dot | Second line | Buttons |
    | --- | --- | --- | --- |
    | No connection is current | none | **Choose a connection** | — |
    | Not connected | a ring | the engine, then *Not connected* (`MongoDB · Not connected`) | **Connect** |
    | Connecting | a ring that turns | *Connecting…* | **Cancel** |
    | Connected | filled | the engine and its version, the topology, the latency (`MongoDB 8.0 · rs0 · 4 ms`) | — |
    | Reconnecting | a ring that turns, in the warning color | the engine, then *Reconnecting…* (`MongoDB · Reconnecting…`) | **Reconnect** |
    | Failed | filled, in the error color | *Failed* and the first line of the reason | **Retry**, **Reconnect**, **Edit** |

  - at the right of the first line, the `…` button, which opens the menu of the connection (`connection.menu`): its
    entries, their order and their wording are on that card, the same here as on Home and in the connection
    switcher.
- **States**:
  - The five states of a connection, and when it passes from one to another, are those of `connection.state`: **not
    connected**, **connecting…**, **connected**, **reconnecting…** and **failed**. The island writes them with a
    capital letter because they start its line.
  - The topology of a MongoDB connection is `standalone`, the name of the replica set (`rs0`), or `sharded
    cluster`; of a Redis connection, `standalone` or `replica`.
  - The latency is as `nav.ping` gives it: `4 ms`, `<1 ms` or `1.2 s`. It is shown only while the state is
    connected: a ping that gets *no answer* makes the state reconnecting (`connection.state`).
  - Reconnecting: the connection was lost and Datardo is trying to connect again by itself, at the intervals of
    `connection.reconnect`. **Reconnect** tries at once. The reason of the drop is shown when the pointer rests on
    the line.
  - Failed: the connection could not connect, or it was lost and the attempts to reconnect ended; the line keeps the
    reason. **Reconnect** starts `connection.reconnect`, **Retry** starts `connection.connect`, **Edit** opens the
    connection form (`connection.form`).
  - **Connect** starts `connection.connect`; **Cancel** stops the connecting, which leaves the state not connected.
  - The whole reason of a failed connection is shown when the pointer rests on its first line, and is what a screen
    reader says.
  - The name is cut with `…` when it does not fit; the whole name is shown when the pointer rests on it.
- **Uses**: `nav.switch-connection`, `nav.current-connection`, `nav.ping`, `nav.linked-connection`,
  `connection.state`, `connection.connect`, `connection.reconnect`, `connection.form`, `connection.menu`.
- **Ported from**: *New in Datardo*.

Acceptance:

- [ ] With Local current and connected to a replica set `rs0` of MongoDB 8.0 answering in 4 ms, the island reads
  `Local` and `MongoDB 8.0 · rs0 · 4 ms`.
- [ ] With Cache local current and connected to Redis 7.2, it reads `Redis 7.2 · standalone` and the latency.
- [ ] With Local current and not connected, it reads `MongoDB · Not connected` and shows **Connect**; a click on
  **Connect** shows *Connecting…* with **Cancel**, then the connected line.
- [ ] **Cancel** while connecting gives `MongoDB · Not connected` back and no error.
- [ ] A connection that fails shows *Failed*, the first line of the reason and **Retry**, **Reconnect** and **Edit**;
  the whole reason is in the text shown when the pointer rests on it, and it holds no password.
- [ ] When the server of Local stops answering, the island reads `MongoDB · Reconnecting…` with **Reconnect**, and no
  latency; when Local is connected again it reads the connected line.
- [ ] When the attempts to reconnect end, the island reads *Failed* with the reason of the drop, and **Reconnect**
  starts `connection.reconnect`.
- [ ] The `…` button shows the entries of `connection.menu`, in its order.
- [ ] A read-only connection shows **Read-only** beside its name in every state.
- [ ] A click anywhere on the island that is not one of its buttons opens the connection switcher.
- [ ] With no connection current the island reads **Choose a connection**, and a click opens the connection
  switcher.

### `nav.ping` — The latency of the current connection

Measures how long the server of the current connection takes to answer, for the connection island and the status
line.

- **Kind**: Read
- **Engine**: Any
- **Function**: `src/features/nav/ping.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: none: it runs by itself for the current connection while it is connected: at once when it
  connects or becomes current, then every 10 seconds *(Datardo's choice)*. It does not run while the window is
  minimized or hidden in the tray.
- **Request**: for MongoDB `db.adminCommand({ ping: 1 })`; for Redis `PING`.
- **Parse**: the time from sending to the reply, in milliseconds, when the reply is `{ ok: 1 }` or `PONG`.
- **Rules**: under 1 ms reads `<1 ms`; from 1 to 999 ms, a whole number (`4 ms`); from 1 second, one decimal
  (`1.2 s`). A reply that does not come within 5 seconds *(Datardo's choice)*, or an error, reads *no answer*; what
  that does to the state of the connection is `connection.state`'s: it becomes reconnecting, and the island and the
  status line then show the state in the place of the latency. 500 ms or more *(Datardo's choice)* is
  shown in the warning color. Only the last value is shown. A ping is not work in progress, is not written in the
  Log and is never sent on a connection that is not current.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Uses**: `nav.connection-island`, `nav.status-line`, `connection.state`.
- **Ported from**: *New in Datardo*.

Acceptance:

- [ ] A connected Local that is current receives `ping` once when it becomes current and then once every 10
  seconds, and nothing while another connection is current.
- [ ] A Redis connection receives `PING`, and nothing else, for this.
- [ ] A reply after 0.4 ms reads `<1 ms`; after 4.4 ms, `4 ms`; after 1,240 ms, `1.2 s`.
- [ ] A ping to a server that stops answering reads *no answer* 5 seconds after it was sent; the connection island
  and the status line then show **reconnecting…** and no latency (`connection.state`).
- [ ] The Log page lists no line for a ping.
- [ ] With the window minimized for a minute, the server receives no `ping` from Datardo in that minute.

### `nav.switch-connection` — Switch to another connection

The connection switcher lists every saved connection; choosing one makes it the current one and connects it if
needed.

- **Kind**: Operation
- **Engine**: Any
- **Function**: `src/features/nav/switch-connection.ts › plan(context, answers)`
- **Entry points**: a click on the connection island (`@connection-island`); the connection part of the status line
  (`@status-line`); the first segment of the path (`@scope-bar`); `Ctrl+Shift+O`; Go to (**Switch connection…**, and
  every connection it finds: `palette.open-result`); **Connect** and **Go to** on a card of Home, with the connection
  already chosen (`@home`); the linked connection row (`@connection-island`).
- **Offered when**: always. With no saved connection the list is empty and says so.
- **Asks**: which connection, in the connection switcher (`@connection-switcher`), a list that opens under the
  connection island, as wide as the explorer and at least 320 px *(Datardo's choice)*:
  - a field, with the focus, that reads *Filter connections*;
  - the connections by folder: first the connections that are in no folder, under no heading, then the folders
    sorted by name with their names as headings, each group in the order the connections were saved;
  - each row: the dot in the connection's color (filled when connected, a ring when not, turning while connecting
    or reconnecting, in the error color when failed), the name, the engine (**MongoDB** or **Redis**), **Read-only**
    when it is, a check on the current one and, under the pointer or with the focus, a `…` button;
  - at the bottom, always in sight, **Add connection** (`connection.add`).

  The `…` button of a row, a right click on it and `Shift+F10` open the menu of that connection (`connection.menu`);
  those of a folder's heading open the menu of the folder (`connection.folder-menu`). Their entries are on those
  cards, and choosing one closes the switcher without changing the current connection.

  The filter keeps the connections whose name, folder or engine holds the text, whatever the case; with none, *No
  connection matches "\<text\>".* `Up` and `Down` move, `Enter` chooses, `Esc` or a click outside closes without
  choosing. When it opens, the current connection is the row selected. With no saved connection it reads *No
  connections yet.* above **Add connection**.
- **Plan**: the app step `make <name> the current connection`, then one of: `make the tab <title> active`, for the
  tab of that connection that was active last, or, when it has no tab, `open Overview of <name>`
  (`connection.overview`).
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone: nothing is written to a deployment, so nothing is recorded. **Back** returns to the tab
  that was active (`nav.back`).
- **After**: the explorer shows the connection chosen (`nav.current-connection`). A connection that is not connected
  starts connecting (`connection.connect`) without the switch waiting for it: the island shows *Connecting…*, and
  when it fails the connection stays current, with its error. Choosing the connection that is already current only
  closes the list.
- **Commands**: `nav.switch-connection`.
- **Uses**: `nav.current-connection`, `tab.activate`, `tab.open`, `connection.overview`, `connection.connect`,
  `connection.add`, `connection.state`, `connection.menu`, `connection.folder-menu`.
- **Ported from**: *New in Datardo*.

Acceptance:

- [ ] With the connections Local and Staging in no folder and Production in the folder `Live`, the switcher lists
  Local and Staging under no heading, then the heading `Live` with Production.
- [ ] A right click on the row of Staging shows the entries of `connection.menu`; choosing **Disconnect** there
  leaves the current connection as it was.
- [ ] The row of a connection that is reconnecting shows a dot that turns.
- [ ] Typing `red` leaves the Redis connections; typing `live` leaves Production; typing `zz` reads *No connection
  matches "zz".*
- [ ] Choosing Staging, which has the tabs `users` and `orders` of which `orders` was active last, makes `orders`
  active and Staging current.
- [ ] Choosing Cache local, which has no tab and is not connected, makes it current, opens its Overview tab and
  shows *Connecting…* in the island.
- [ ] Choosing a connection whose connecting fails leaves it current with *Failed* in the island; the tabs of the
  other connections are untouched.
- [ ] `Esc` closes the switcher with the same connection current and the focus back on the connection island.
- [ ] **Add connection** is in sight with 200 saved connections, without scrolling.
- [ ] `Ctrl+Shift+O` opens the switcher with the explorer hidden too, under the left end of the main island.

### `nav.linked-connection` — The linked connection row

Under the current connection, the connection it is linked to for redis-oplog, one click away.

- **Kind**: View
- **Engine**: Any
- **Function**: `src/features/nav/linked-connection.ts › view(state)`
- **Entry points**: the rows under the current connection, in the connection island (`@connection-island`).
- **Offered when**: the current connection is a MongoDB connection linked to a Redis connection
  (`connection.link-redis`), or a Redis connection that MongoDB connections are linked to.
- **Shows**:
  - for a MongoDB connection, one row: the dot of the Redis connection in its color and state, its name, and
    **Redis** (`Cache local · Redis`); when the pointer rests on it, *Receives the writes of Local for redis-oplog.*
  - for a Redis connection, one row for each MongoDB connection linked to it, in the order of the saved connections:
    its dot, its name and **MongoDB**; when the pointer rests on it, *Publishes its writes to Cache local.* At most
    3 rows *(Datardo's choice)*; with more, a last row **and \<n\> more**, which opens the connection switcher.
- **States**: a click on a row makes that connection the current one, with the plan of `nav.switch-connection`. The
  dot shows the state of that connection as the switcher does. A linked connection that was removed leaves no row.
- **Uses**: `nav.switch-connection`, `connection.link-redis`, `oplog.publish`.
- **Ported from**: *New in Datardo*.

Acceptance:

- [ ] With Local linked to Cache local, the island of Local shows the row `Cache local · Redis` under it; a click
  makes Cache local current.
- [ ] With Cache local current, the island shows the row `Local · MongoDB`; a click makes Local current.
- [ ] A MongoDB connection with no linked connection shows no row.
- [ ] With five MongoDB connections linked to Cache local, the island shows three rows and **and 2 more**.
- [ ] The row's dot is a ring while the linked connection is not connected.

## Pins

### `nav.pin` — Pin, unpin and reorder the items of a connection

Keeps the collections, namespaces, keys, pages and saved queries used most at the top of the tree island, for each
connection.

- **Kind**: Operation
- **Engine**: Any
- **Function**: `src/features/nav/pin.ts › plan(context, answers)`
- **Entry points**: **Pin** in the scope bar, which reads **Unpin** when what the active tab shows is pinned
  (`@scope-bar`); **Pin** or **Unpin** in the context menu of a node of the tree (`@tree-menu`) and of a tab
  (`@tab-menu`); on an item of the Pinned section: **Unpin**, **Move up** and **Move down** in its context menu
  (`@tree-menu`), a drag to another place of the section (`@tree`), `Alt+Up` and `Alt+Down` with the focus on it;
  Go to (**Pin** or **Unpin**, for the active tab).
- **Offered when**: the thing is a collection, a view, a namespace, a key, a page of the connection or a saved query
  (a database, a document, a console, a playground and the tabs of the app cannot be pinned).
- **Plan**: one app step: `pin shop.orders on Local`, `unpin shop.orders on Local` or `move shop.orders to place 1
  of the pins of Local`.
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone: nothing is written to a deployment, so nothing is recorded. **Unpin** takes a pin
  away, **Pin** puts it back at the end.
- **After**: the Pinned section of the tree island shows the pins of the current connection in the user's order, a
  new pin last. Each is its icon and its name; when two pins have the same name, the rest of the path follows it,
  dimmed (`orders` `shop`, `orders` `crm`). A click opens it as a click on its node of the tree does (`tab.open`); a
  saved query opens its collection tab with that query. The section is not shown while the connection has no pin.
- **Rules**: pins are kept with the connection in Datardo's data, across starts: each connection has its own, and
  removing the connection removes them. A pin of something the tree has read and no longer finds (a dropped
  collection) is dimmed and reads *No longer exists.* when the pointer rests on it; it stays until it is unpinned. A
  pin never reads the deployment by itself: a pinned key is not checked until it is opened.
- **Refuses**: the 51st pin of a connection: *Local already has 50 pinned items. Unpin one first.* (`/too-many`); 50
  is *Datardo's choice*.
- **Commands**: `nav.pin`.
- **Uses**: `tree.show`, `tab.open`.
- **Ported from**: *New in Datardo*.

Acceptance:

- [ ] **Pin** on the collection tab of `shop.orders` of Local adds `orders` at the end of the Pinned section of
  Local, and the button reads **Unpin**.
- [ ] Making a tab of Cache local active shows the pins of Cache local, not those of Local.
- [ ] With `shop.orders` and `crm.orders` both pinned, the two read `orders` `shop` and `orders` `crm`.
- [ ] Dragging the third pin above the first makes it the first; the order is the same after a restart.
- [ ] `Alt+Up` on the first pin changes nothing.
- [ ] **Unpin** on the last pin removes the Pinned section.
- [ ] A read-only connection can pin and unpin.
- [ ] After `shop.orders` is dropped and the tree refreshed, its pin is dimmed and reads *No longer exists.*
- [ ] The 51st **Pin** on Local is refused with *Local already has 50 pinned items. Unpin one first.*
- [ ] **Pin** is not offered on a database node, on a document tab or on Home.

## The scope bar

### `nav.scope-bar` — The scope bar

The row under the tab strip that says where the active tab is and takes the user somewhere else from there.

- **Kind**: View
- **Engine**: Any
- **Function**: `src/features/nav/scope-bar.ts › view(state)`
- **Entry points**: the row under the tab strip, in the main island (`@scope-bar`).
- **Shows**, from the left: **Back** and **Forward** (`nav.back`); the path of the active tab (`nav.path`); then, at
  the right end, **Copy path** (`nav.copy-path`), **Pin** or **Unpin** (`nav.pin`), and **Open on another
  connection** (`nav.open-on-another-connection`).
- **States**:
  - A tab of the app (Home, Settings, Undo history, Scheduled tasks, Log, a connection form): **Back**, **Forward**
    and the name of the page; none of the three buttons at the right.
  - **Back** and **Forward** are disabled when there is no place to go to.
  - **Pin** is not shown for what cannot be pinned; **Open on another connection** is shown only on the tabs its
    card names, and disabled, with its reason, when no other connection has the same engine.
  - When the row is too narrow, the buttons at the right become icons with the same names for a screen reader, and
    then the path is shortened as `nav.path` says. **Back** and **Forward** are always shown.
- **Uses**: `nav.back`, `nav.path`, `nav.copy-path`, `nav.pin`, `nav.open-on-another-connection`.
- **Ported from**: *New in Datardo*.

Acceptance:

- [ ] On the collection tab of `shop.orders` of Local the scope bar shows **Back**, **Forward**, `Local / shop /
  orders`, **Copy path**, **Pin** and **Open on another connection**.
- [ ] On Home it shows **Back**, **Forward** and `Home`, and nothing else.
- [ ] Right after Datardo starts, **Back** and **Forward** are both disabled.
- [ ] On a document tab it shows no **Pin**.
- [ ] Every button of the row can take the focus with `Tab` and has a name a screen reader says.

### `nav.back` — Back and Forward

Goes back to the place shown before, and forward again, as a browser does.

- **Kind**: Operation
- **Engine**: Any
- **Function**: `src/features/nav/back.ts › plan(context, answers)`
- **Entry points**: **Back** and **Forward** in the scope bar (`@scope-bar`); `Alt+Left` and `Alt+Right` (on macOS
  `Cmd+[` and `Cmd+]`); the back and forward buttons of a mouse; on macOS the **Go** menu (`@app-menu`); Go to
  (**Back**, **Forward**).
- **Offered when**: **Back** when a place precedes the present one, **Forward** when one follows it.
- **What counts as a place**: a *place* is a tab together with the section of it that is shown. A place is added to
  the list of places visited when:
  - a tab becomes active, however that happens: a click on it, a key, a tab that was just opened, Go to, a click in
    the tree, the connection switcher, the tab that takes over when the active one is closed;
  - the section of the active tab changes (from **Documents** to **Indexes**).

  Nothing else is a place: running a query or changing its text, the next page of results, a selection, what the
  inspector island shows, expanding a node of the tree, scrolling, a dialog, Go to opened and closed without
  choosing, a tab opened without making it active. **Back** and **Forward** themselves add no place: they move in
  the list.
- **Plan**: one app step, `go back to <path of the place>` or `go forward to <path of the place>`.
- **Rules**:
  - The list keeps the last 100 places *(Datardo's choice)*; the oldest go first. The same place twice in a row is
    kept once.
  - Visiting a new place after going back drops the places that were ahead.
  - A place names what its tab shows (`tab.same-target`), not the tab itself: going to a place whose tab was closed
    opens it again, as `tab.open` does, on the section it had; the query text of a collection tab that was closed is
    the one it had when it closed.
  - A place that cannot be opened any more is skipped and taken out of the list: its connection was removed, its
    playground was never saved to a file.
  - The list is for one run of Datardo: it is empty at start, with the tab restored as active for its first place.
  - The keys go back and forward wherever the focus is, also in an editor, which does not use them, but not while a
    dialog or Go to is open.
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone: nothing is written to a deployment, so nothing is recorded. **Forward** undoes
  **Back**.
- **After**: the tab of the place is active on its section, and its connection is current
  (`nav.current-connection`). The tab keeps what it showed: going back runs no query again. Going to a place of a
  connection that is not connected connects it only when its tab has to be opened again.
- **Commands**: `nav.back:back`, `nav.back:forward`.
- **Uses**: `tab.activate`, `tab.open`, `tab.same-target`, `nav.current-connection`.
- **Ported from**: *New in Datardo*.

Acceptance:

- [ ] After making active, in this order, the tabs `orders`, `users` and Home, `Alt+Left` makes `users` active,
  `Alt+Left` again `orders`, and `Alt+Right` `users`.
- [ ] After going from **Documents** to **Schema** to **Indexes** in the tab of `orders`, **Back** shows **Schema**
  and **Back** again **Documents**, in the same tab.
- [ ] Running three queries in the tab of `orders` adds no place: **Back** then leaves the tab.
- [ ] After `orders`, `users`, **Back** and then opening `products`, **Forward** is disabled.
- [ ] After closing the tab of `users` from another tab, **Back** to it opens the tab of `users` again, with the
  query text it had.
- [ ] **Back** to a tab of Local while Cache local is current makes Local current.
- [ ] `Alt+Left` with the focus in the query bar goes back, and the text of the query bar is unchanged.
- [ ] With a confirmation open, `Alt+Left` does nothing.
- [ ] After the connection Staging is removed, **Back** never stops on a place of Staging.
- [ ] The 101st place makes the first unreachable: 100 presses of **Back** reach the second.

### `nav.path` — The path of the active tab

Says where the active tab is, one segment for each level, and lets the user go to a sibling of any level.

- **Kind**: View
- **Engine**: Any
- **Function**: `src/features/nav/path.ts › view(state)`
- **Entry points**: the path in the scope bar; each segment is a button that opens a menu (`@scope-bar`).
- **Shows**: the segments, separated by `/`:

  | Tab | Segments | Example |
  | --- | --- | --- |
  | collection tab | connection, database, collection or view | `Local / shop / orders` |
  | document tab | connection, database, collection, the `_id` as the table shows it | `Local / shop / orders / 65f1…a2c` |
  | keys tab of a database | connection, database | `Cache local / db0` |
  | keys tab of a namespace | connection, database, one segment for each level of the namespace | `Cache local / db0 / orders: / 2026:` |
  | key tab | as its namespace, then what is left of the key's name | `Cache local / db0 / orders: / 42` |
  | page tab of a connection | connection, page | `Local / Monitor` |
  | page tab of a database | connection, database, page | `Local / shop / Relationship diagram` |
  | playground tab | connection, the tab's title | `Local / Playground 1` |
  | console tab | connection, **Console** | `Cache local / Console` |
  | app tab | the tab's title | `Home` |

- **The menus**: a click on a segment opens a menu of what could be in its place, with the present one marked:
  - the connection: the connection switcher (`nav.switch-connection`);
  - a MongoDB database: the databases of the connection; choosing one shows it expanded and selected in the tree,
    showing the explorer if it is hidden, and opens nothing;
  - a Redis database: the databases of the connection; choosing one opens its keys tab (`key.show`);
  - a collection or view: the collections and views of the same database; choosing one opens its collection tab
    (`tab.open`);
  - a level of a namespace: the namespaces beside it, as the tree has read them so far; choosing one opens its keys
    tab;
  - a page: the pages of the connection, as **Pages of** lists them in the tree island; choosing one opens it;
  - the last segment of a document tab, a key tab, a playground tab, and the segment of an app tab: no menu, and not
    a button.

  The menus list what the tree last read (`tree.show`), in its order, and send nothing to the deployment. With more
  than 10 entries *(Datardo's choice)* a menu starts with a field that filters by the text typed. A menu lists at
  most 500 entries *(Datardo's choice)* and then the line *\<n\> more. Use Go to to find them.* A level the tree has
  not read yet shows *Not read yet.* and **Read**, which starts `tree.refresh` on it.
- **States**: when the path does not fit, the segments between the connection and the last one are replaced by `…`,
  which opens a menu of the segments it hides; the last segment is always shown, cut at its end with `…` when it
  alone does not fit. A view shows the view's icon before its name. The whole path is what a screen reader says for
  the row.
- **Uses**: `nav.switch-connection`, `tab.open`, `key.show`, `tree.show`, `tree.refresh`, `nav.toggle-explorer`.
- **Ported from**: *New in Datardo*.

Acceptance:

- [ ] The collection tab of `orders` in `shop` on Local shows `Local / shop / orders`.
- [ ] The key tab of `orders:2026:42` on Cache local, in `db0`, shows `Cache local / db0 / orders: / 2026: / 42`.
- [ ] A click on `orders` lists the collections and views of `shop` with `orders` marked; choosing `users` makes the
  tab of `users` active, opening it if it was not open.
- [ ] A click on `shop` lists the databases of Local; choosing `crm` expands and selects `crm` in the tree and
  leaves the tab of `orders` active.
- [ ] A click on `db0` of a keys tab lists the databases of the Redis connection; choosing `db3` opens the keys tab
  of `db3`.
- [ ] A click on `Local` opens the connection switcher.
- [ ] The menu of a database with 40 collections starts with a filter field; typing `ord` leaves the names that
  hold `ord`.
- [ ] Opening a menu sends no command to the server.
- [ ] In a scope bar too narrow for `Local / shop / orders` the path reads `Local / … / orders`, and `…` lists
  `shop`.

### `nav.copy-path` — Copy the path

Copies the name of what the active tab shows, as the engine writes it, to paste it in code, in a message or in a
console.

- **Kind**: Operation
- **Engine**: Any
- **Function**: `src/features/nav/copy-path.ts › plan(context, answers)`
- **Entry points**: **Copy path** in the scope bar (`@scope-bar`); **Copy path** in the context menu of a tab
  (`@tab-menu`); Go to (**Copy path**).
- **Offered when**: the active tab belongs to a connection.
- **Plan**: one app step, `copy <text> to the clipboard`.
- **Rules**: the text never names the connection:
  - collection tab and document tab: the database and the collection, joined by a dot: `shop.orders`;
  - keys tab of a database: `db0`; of a namespace: its pattern, `orders:2026:*`;
  - key tab: the name of the key, `orders:2026:42`. A name that is not valid UTF-8 is copied as `value.format`
    writes bytes;
  - page tab, playground tab and console tab: the path as the scope bar shows it, without the connection: `Monitor`,
    `shop / Relationship diagram`.
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone: nothing is written to a deployment, so nothing is recorded.
- **After**: a notification says *Copied shop.orders* (`runner.notify`), with the text that was copied, cut at 80
  characters *(Datardo's choice)*.
- **Commands**: `nav.copy-path`.
- **Uses**: `runner.notify`, `value.format`.
- **Ported from**: *New in Datardo*.

Acceptance:

- [ ] On the collection tab of `orders` in `shop`, **Copy path** puts `shop.orders` on the clipboard and says
  *Copied shop.orders*.
- [ ] On the document tab of a document of `shop.orders` it puts `shop.orders`.
- [ ] On the keys tab of the namespace `orders:2026:` it puts `orders:2026:*`; on the key tab of `orders:2026:42`,
  `orders:2026:42`.
- [ ] On the Monitor page of Local it puts `Monitor`.
- [ ] On Home, **Copy path** is not shown and Go to does not list it.

### `nav.open-on-another-connection` — Open on another connection

Opens what the active tab shows, with the same query, on another connection of the same engine: the same collection
on staging and on production, the same keys on two caches.

- **Kind**: Operation
- **Engine**: Any
- **Function**: `src/features/nav/open-on-another-connection.ts › plan(context, answers)`
- **Entry points**: **Open on another connection** in the scope bar (`@scope-bar`) and in the context menu of a tab
  (`@tab-menu`); Go to (**Open on another connection…**).
- **Offered when**: the active tab is a collection tab, a keys tab or a key tab, and at least one other saved
  connection has the same engine. Otherwise the button is disabled and reads, when the pointer rests on it, *No
  other MongoDB connection.* or *No other Redis connection.*
- **Asks**: **Open on which connection?**, a list to pick from: the other saved connections of the same engine, by
  folder as in the connection switcher, each with its dot, its name and **Read-only** when it is. With only one, it
  is still asked.
- **Reads**, on the connection chosen, after connecting it if needed (`connection.connect`):
  - for a collection tab, the names of the collections and views of the same database:
    `db.getSiblingDB("shop").getCollectionInfos({}, { nameOnly: true })`;
  - for a key tab, whether the key is there: `SELECT 0`, then `EXISTS orders:2026:42`;
  - for a keys tab, whether the database is there: `SELECT 3`. Whether the namespace holds keys is not read: the
    keys tab says it when it scans.
- **Plan**: one app step: `open shop.orders on Staging`, `open the keys of orders:2026: in db0 on Cache staging` or
  `open the key orders:2026:42 in db0 on Cache staging`.
- **What is carried over**:
  - collection tab: the database, the collection, the section shown, and the text of the query bar as it is now,
    run or not: filter, sort, projection, skip and limit; when the tab shows its pipeline, the text of the pipeline.
    The layout of the columns is not carried: each connection keeps its own;
  - keys tab: the database, the namespace, the pattern and the type filter;
  - key tab: the database and the name of the key, byte for byte.
- **Danger**: None.
- **Read-only**: Allowed, on both sides, because it writes nothing to a deployment.
- **Undo**: Cannot be undone: nothing is written to a deployment, so nothing is recorded. Closing the tab undoes it.
- **After**: the tab of the other connection is active, in the group of that connection, which is now the current
  one; when that connection already had a tab for the same thing (`tab.same-target`), that tab is made active and
  takes the query text. The query runs as it does when a collection tab opens (`query.run`), the keys are scanned
  as when a keys tab opens (`key.scan`). The tab of the first connection stays as it was. Nothing is compared:
  comparing is the page of **Compare with…**.
- **Refuses**:
  - the database has no collection on the other connection: *Staging has no database shop.* (`/no-database`);
  - the database is there, the collection or view is not: *Staging has no collection orders in shop.*
    (`/no-collection`);
  - the Redis database is out of the server's range: *Cache staging has no database db3.* (`/no-database`);
  - the key is not there: *Cache staging has no key orders:2026:42 in db0.* (`/no-key`);
  - the other connection cannot be connected: the error of `connection.connect`, and nothing opens.
- **Commands**: `nav.open-on-another-connection`.
- **Uses**: `connection.connect`, `tab.open`, `tab.same-target`, `query.run`, `key.scan`, `runner.ask`,
  `runner.refuse`.
- **Ported from**: *New in Datardo*.

Acceptance:

- [ ] On the tab of `shop.orders` of Local with the filter `{ status: "paid" }` and the sort `{ total: -1 }`,
  choosing Staging opens `shop.orders` of Staging with the same filter and sort, runs
  `db.orders.find({ status: "paid" }).sort({ total: -1 })` there, and makes Staging current.
- [ ] A filter typed and not yet run is carried over as typed.
- [ ] With the tab on **Indexes**, the tab of Staging opens on **Indexes**.
- [ ] The list offers no Redis connection for a collection tab and no MongoDB connection for a keys tab, and never
  the connection of the active tab.
- [ ] When Staging has `shop` without `orders`, it says *Staging has no collection orders in shop.* and opens no
  tab; when Staging has no collection in `shop`, *Staging has no database shop.*
- [ ] On the key tab of `orders:2026:42`, choosing a connection where `EXISTS orders:2026:42` returns 0 says *Cache
  staging has no key orders:2026:42 in db0.*
- [ ] On a keys tab of `db3`, choosing a server with 2 databases says *Cache staging has no database db3.*
- [ ] A read-only connection can be the first or the second: nothing but reads is sent to either.
- [ ] With Local the only MongoDB connection, the button is disabled and reads *No other MongoDB connection.*
- [ ] Dismissing the list opens nothing and connects nothing.

## The inspector island

### `nav.inspector` — The inspector island

The island at the right of the main island, for the thing selected in the page.

- **Kind**: View
- **Engine**: Any
- **Function**: `src/features/nav/inspector.ts › view(state)`
- **Entry points**: the island at the right (`@inspector`). What it shows is given by the page of the active tab: a
  document (`document.inspect`), a key and its value (`key.inspect`), an index, a server operation.
- **Shows**: a first row with what is selected (`orders · 65f1…a2c`) and the button **Hide inspector**; under it,
  what the page's feature gives.
- **States**:
  - The page has nothing to inspect (Home, Settings, a playground, a console): the island is not shown, whatever the
    user chose, and **Show inspector** is not offered.
  - Hidden by the user (`nav.toggle-inspector`): not shown; selecting a row does not show it. A feature that asks to
    inspect something (**Inspect** on a row, `Space` on it) shows it, and that becomes the user's choice.
  - Nothing selected: **Nothing selected**, and under it the line the page gives (*Select a document to see it
    here.*, *Select a key to see its value here.*).
  - Several rows selected: **\<n\> selected**, and the line the page gives; the actions on them are in the selection
    bar of the page.
  - Loading: the first row, and a sign that turns under it, after 200 ms *(Datardo's choice)* so that a fast reply
    does not flicker.
  - Error: the message of the read that failed and **Retry**.
  - Hidden by `nav.layout` in a narrow window: not shown, and back by itself when the window is wider.
- **Rules**: the island belongs to the window, not to a tab: its width (`nav.resize`) and whether the user hid it are
  one choice for every tab, remembered across starts, shown by default. What it shows follows the active tab: each
  tab keeps its own selection.
- **Uses**: `nav.toggle-inspector`, `nav.resize`, `nav.layout`, `document.inspect`, `key.inspect`.
- **Ported from**: *New in Datardo*. It takes the place of Mongoster's dialog of a document.

Acceptance:

- [ ] On a collection tab with no row selected the island reads **Nothing selected** and *Select a document to see
  it here.*
- [ ] Selecting a row shows that document; making another tab active shows what is selected in that tab, and coming
  back shows the first document again.
- [ ] Selecting three rows reads **3 selected**.
- [ ] On Home the island is not shown and Go to lists neither **Show inspector** nor **Hide inspector**.
- [ ] After **Hide inspector**, selecting rows does not bring the island back; **Inspect** on a row does.
- [ ] The island hidden on a collection tab is hidden on a keys tab too, and after a restart.
- [ ] A document that takes 2 seconds to read shows the turning sign; one that takes 100 ms does not.

### `nav.toggle-inspector` — Show or hide the inspector island

Gives the page the room of the inspector island, and back.

- **Kind**: Operation
- **Engine**: Any
- **Function**: `src/features/nav/toggle-inspector.ts › plan(context, answers)`
- **Entry points**: **Hide inspector** in the island's first row (`@inspector`); `Ctrl+Shift+B`; on macOS the
  **View** menu (`@app-menu`); Go to (**Hide inspector** while it is shown, **Show inspector** while it is hidden).
- **Offered when**: the page of the active tab has something to inspect (`nav.inspector`).
- **Plan**: one app step: `hide the inspector island` or `show the inspector island`.
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone: nothing is written to a deployment, so nothing is recorded. The same key puts it back.
- **After**: the main island takes or gives the room (`nav.layout`); the choice is remembered. Hiding the island
  while the focus is in it moves the focus to the page. Showing it shows what is selected now.
- **Commands**: `nav.toggle-inspector`.
- **Uses**: `nav.inspector`, `nav.layout`.
- **Ported from**: *New in Datardo*.

Acceptance:

- [ ] `Ctrl+Shift+B` on a collection tab hides the island and the table takes its room; again, it shows it at the
  width it had, with the selected document.
- [ ] `Ctrl+Shift+B` on Home does nothing.
- [ ] Hiding the island with the focus in it puts the focus on the selected row of the table.
- [ ] With the island hidden, Go to lists **Show inspector** on a keys tab.

## The status line

### `nav.status-line` — The status line

The row at the bottom of the window: the state of the current connection, what the active page counts, the work in
progress, and whether the connection is read-only.

- **Kind**: View
- **Engine**: Any
- **Function**: `src/features/nav/status-line.ts › view(state)`
- **Entry points**: the row at the bottom of the window, on its background (`@status-line`).
- **Shows**, from the left; each part is there only when it has something to say:

  | Part | Shows | A click |
  | --- | --- | --- |
  | Connection | the dot in the connection's color, its name, its state as `connection.state` words it and, while connected, its latency: `Local · connected · 4 ms`, `Local · not connected`, `Local · connecting…`, `Local · reconnecting…`, `Local · failed`; **No connection** when none is current | opens the connection switcher (`nav.switch-connection`) |
  | Reconnect | **Reconnect**, right after the connection part, while the current connection is reconnecting or failed | tries to connect again at once (`connection.reconnect`) |
  | Count | what the page of the active tab counts, in the words of its feature: `2 of 1,204 documents · 38 ms`, `500 keys scanned` | starts what the page names for it: on a collection tab, the exact count (`query.count`). Not a button when the page names nothing |
  | Work in progress | with one: its title, how far it is, and **Cancel**; with several: `3 running` | **Cancel** cancels it (`runner.cancel`), and stops a playground's run (`playground.stop`); a click on the title or on the number opens the list of the work in progress, each with its own **Cancel** (`runner.progress`) |
  | Zoom | the percentage, while it is not 100%: `125%` | resets the zoom (`window.zoom`) |
  | Read-only | **Read-only**, while the current connection is a read-only connection | starts `connection.allow-changes`, which asks before anything changes |

- **States**:
  - The connection part and **Read-only** follow the current connection (`nav.current-connection`); the count
    follows the active tab; the work in progress is of the whole window, whatever tab started it.
  - **Connection** is at the left end and **Read-only** at the right end; **Reconnect** and then the count come
    after the connection, the work in progress and the zoom before **Read-only**.
  - While the current connection is reconnecting, the dot turns and no latency is shown; resting the pointer on the
    connection part shows the reason of the drop. When the attempts end, the part reads `Local · failed` and
    **Reconnect** stays.
  - When the row is too narrow, the count is cut at its end with `…` first, then the name of the connection; the
    work in progress, **Cancel** and **Read-only** are never cut.
  - Resting the pointer on **Read-only** shows *Datardo sends no writes through Local.*
  - A screen reader is told when a work in progress starts, ends or fails, and reads the count when asked, not at
    every change.
- **Uses**: `nav.switch-connection`, `nav.ping`, `query.count`, `runner.progress`, `runner.cancel`, `window.zoom`,
  `connection.state`, `connection.reconnect`, `connection.allow-changes`, `connection.read-only`.
- **Ported from**: *New in Datardo*.

Acceptance:

- [ ] With Local current, connected and answering in 4 ms, the status line starts with `Local · connected · 4 ms`.
- [ ] Making a tab of Cache local active changes the connection part to Cache local at once.
- [ ] A click on the connection part opens the connection switcher.
- [ ] While one export runs, the row shows its title, its progress and **Cancel**; a click on **Cancel** cancels it.
- [ ] While three things run, the row shows `3 running`; a click lists the three, each with **Cancel**.
- [ ] An export started from a tab of Local is still shown, with **Cancel**, after a tab of Cache local becomes
  active.
- [ ] With a read-only connection current the row ends with **Read-only**; a click starts what **Allow changes**
  starts, and nothing changes until that is confirmed.
- [ ] With a connection that is not read-only current, **Read-only** is not shown.
- [ ] When the server of Local stops answering, the row starts with `Local · reconnecting…` and **Reconnect**, with
  no latency; a click on **Reconnect** tries at once, and a click on the connection part still opens the connection
  switcher.
- [ ] When the attempts end the row starts with `Local · failed` and **Reconnect**; with Local connected or not
  connected, **Reconnect** is not shown.
- [ ] On Home with no connection current, the row shows **No connection** and no count.
- [ ] At 100% zoom no percentage is shown.

## Dialogs

### `nav.dialog` — How every dialog behaves

A dialog is a small island over the window that asks something. Every one of them behaves the same way, whatever
feature opened it.

- **Kind**: View
- **Engine**: Any
- **Function**: `src/features/nav/dialog.ts › view(state)`
- **Entry points**: opened by the runner for a question (`runner.ask`) or a confirmation (`runner.confirm`), and by a
  View that is a dialog (`window.about`).
- **Shows**: over the window, centered, with the rest of the window dimmed: a title, what is asked, and its buttons
  at the bottom right, the one that goes on last. It is at most 560 px wide and 80% of the window's height *(both
  Datardo's choices)*; what does not fit scrolls inside it, and the buttons stay in sight.
- **Rules**:
  - **One at a time**: a dialog asked for while another is open waits, and opens when the first is answered.
  - **The window behind does not answer**: no click, no key of a command (`palette.key-press`), no `F6`. The top bar
    still drags the window, and the system's buttons still work.
  - **Focus**: it goes to the first field of the dialog; in a confirmation, to its button; in a destructive
    confirmation, to the field where the name is typed. `Tab` and `Shift+Tab` go round inside the dialog and never
    leave it. When the dialog closes, the focus goes back to the control that had it, or to the page if that control
    is gone.
  - **`Esc` cancels**: the question counts as not answered, and the feature that asked stops without doing anything.
    Cancelling is not a refusal and shows no message.
  - **`Enter` confirms**: it presses the button that goes on, when what is typed is valid. In an editor of several
    lines `Enter` types a new line and `Ctrl+Enter` confirms.
  - **Except in a destructive confirmation**: there `Enter` in the field does nothing. The button, which
    `runner.confirm` enables when the name typed matches, is pressed with a click, or with `Space` or `Enter` while
    the button itself has the focus.
  - **A click outside** closes a list to pick from, as `Esc` does. It does nothing to a form or a confirmation.
  - **A dialog does not move**, cannot be resized and has no close button other than its own **Cancel**.
  - **A screen reader** is told the title when it opens, and that it is a dialog.
- **Uses**: `runner.ask`, `runner.confirm`.
- **Ported from**: *New in Datardo*.

Acceptance:

- [ ] With a confirmation open, a click on a tab of the tab strip does nothing and `Ctrl+W` closes no tab.
- [ ] `Tab` from the last button of a dialog goes to its first control.
- [ ] `Esc` in a form closes it, runs nothing and shows no notification; the focus is back on the button that opened
  it.
- [ ] `Enter` in a question that asks for a name, with a valid name typed, confirms; with an empty name it does
  nothing and the reason stays shown.
- [ ] In the confirmation of dropping the collection `orders`, with `orders` typed in the field, `Enter` in the field
  drops nothing; a click on the button drops it.
- [ ] In a confirmation that is not destructive, `Enter` presses its button.
- [ ] A click outside a list to pick from closes it without choosing; a click outside a form leaves it open with
  what was typed.
- [ ] A second question asked while a form is open appears only after the form is answered.
- [ ] A dialog with 300 lines of plan shows its buttons without scrolling.

## Without a connection

### `nav.empty` — The window with no connection

What every part of the window shows before the first connection is saved, and while none is current.

- **Kind**: View
- **Engine**: Any
- **Function**: `src/features/nav/empty.ts › view(state)`
- **Entry points**: the first start; after the last connection is removed; whenever no connection is current
  (`nav.current-connection`).
- **Shows**, with no saved connection:
  - the main island: the Home tab, in its first state (`home.show`), with **Add connection** and **Import
    connections…**;
  - the connection island: **No connections yet** and the button **Add connection** (`connection.add`);
  - the tree island: *Your databases and keys will be listed here.* (`@empty-state`);
  - the rail: every entry works but **Search**, which is disabled (`nav.rail`);
  - the scope bar: `Home`; the status line: **No connection**; no inspector island;
  - Go to: the pages of the app and the commands that need no connection (`palette.sources`).
- **Shows**, with saved connections of which none is current:
  - the connection island: **Choose a connection**, which opens the connection switcher;
  - the tree island: *Choose a connection to see what it holds.*, with **Choose a connection**
    (`nav.switch-connection`);
  - the rest as above, with Home showing the cards.
- **States**: the explorer is shown or hidden as the user left it; on the first start it is shown. Saving the first
  connection makes it the current one. A command that needs a connection and is started with none current is refused
  by its own feature with *Choose a connection first.* (`/not-connected`).
- **Uses**: `home.show`, `connection.add`, `nav.switch-connection`, `nav.rail`, `palette.sources`.
- **Ported from**: *New in Datardo*.

Acceptance:

- [ ] The first start shows Home with **Add connection** and **Import connections…**, the connection island with
  **No connections yet** and **Add connection**, and a tree island that reads *Your databases and keys will be listed
  here.*
- [ ] **Add connection** in the connection island starts the same feature as **Add connection** on Home.
- [ ] After the first connection is saved, it is the current one and the tree island shows it.
- [ ] With three saved connections and none current, the connection island reads **Choose a connection** and the
  tree island *Choose a connection to see what it holds.*
- [ ] With no connection current, the status line reads **No connection** and the scope bar `Home`.
- [ ] Removing the only connection brings the window back to the first state, and closes its tabs
  (`tab.connection-gone`).
