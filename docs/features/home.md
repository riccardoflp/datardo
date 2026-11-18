# Home

The page Datardo opens with, for every engine: what it shows on the first run and afterwards, **Jump back in**, every
saved connection as a card in its folder, the filter by text and by engine, **Connect** and **Go to**, and the menu
of a card. Home shows and starts; the features that add, edit, organize and remove connections belong to the
connection area, and this page names them.

Home is a tab of the app (`tab.open`): it belongs to no connection, and opening it leaves the current connection as
it is.

### `home.show` — The Home page

Where a run of Datardo starts: the way back to what was used last, and every connection one click away.

- **Kind**: View
- **Engine**: Any
- **Function**: `src/features/home/show.ts › view(state)`
- **Entry points**: **Home** on the rail (`@rail`); `Alt+Home`; Go to (**Home**); on macOS **Go › Home**
  (`@app-menu`). It is the tab Datardo starts with when no tab is restored (`tab.restore`), and the tab that opens
  when the last tab is closed (`tab.close`).
- **Reads**: the saved connections with their folders and their states; the recent places (`palette.recent`).
  Nothing is asked of a deployment: Home connects nothing by being shown.
- **Shows**:
  - **No saved connection** (the first run, or after the last one was removed), in the middle of the page
    (`@empty-state`): Datardo's icon, **Welcome to Datardo**, the line *A client for MongoDB and Redis. Add a
    connection to begin.*, and the buttons **Add connection** (`connection.add`) and **Import connections…** (the
    import of connections from a file, of the connection area).
  - **With connections**, from the top:
    1. a row with the filter field, which reads *Filter connections*; the engines **All**, **MongoDB** and **Redis**
       (`home.filter`); at the right **Add connection** (`connection.add`) and a `…` button with **Import
       connections…** and **Export connections…** (the import and the export of connections, of the connection
       area);
    2. **Jump back in** (`home.jump-back-in`), when there is a recent place;
    3. **Connections**: the cards, by folder (`home.connections`).
- **States**:
  - The page follows what happens while it is shown: a connection that connects, fails, is added, renamed or removed
    changes its card at once.
  - The filter leaves no card: *No connection matches "\<text\>".* and **Clear filter**; **Jump back in** stays.
  - The page scrolls as a whole; the row of the filter stays in sight at the top.
  - It has no sections, nothing to inspect (the inspector island is not shown: `nav.inspector`), and its path in the
    scope bar is `Home`.
  - With the focus in the page, typing a character puts the focus in the filter field and types there.
- **Commands**: `home.show`.
- **Uses**: `connection.add`, `home.filter`, `home.jump-back-in`, `home.connections`, `home.card`, `palette.recent`,
  `tab.open`, `nav.empty`.
- **Ported from**: *New in Datardo*. It takes the place of Mongoster's tree of every connection and of its welcome
  text: `package.json` (`viewsWelcome`), `src/tree.ts`.

Acceptance:

- [ ] The first start shows **Welcome to Datardo**, *A client for MongoDB and Redis. Add a connection to begin.*,
  **Add connection** and **Import connections…**, and no filter.
- [ ] **Add connection** starts the feature that adds a connection; when it is saved, Home shows its card and the
  welcome is gone.
- [ ] With saved connections, Home shows the filter row, **Jump back in** (when something was opened before) and
  **Connections**.
- [ ] Showing Home with ten saved connections, none connected, opens no connection to any server.
- [ ] A connection that fails while Home is shown shows *Failed* on its card without a refresh.
- [ ] `Alt+Home` from a collection tab makes the Home tab active and leaves the same connection in the explorer.
- [ ] Removing the last connection brings the welcome back.

### `home.jump-back-in` — Jump back in

The things used last, to go on from where the work stopped.

- **Kind**: View
- **Engine**: Any
- **Function**: `src/features/home/jump-back-in.ts › view(state)`
- **Entry points**: the first part of Home under the filter row (`@home`).
- **Offered when**: there is at least one recent place (`palette.recent`).
- **Shows**: the heading **Jump back in**, with **Clear** at its right, and the first 8 recent places *(Datardo's
  choice)*, most recent first, in a row that wraps. Each is: the icon of its kind (a collection, a view, keys, a key,
  a document, a page); its title (`tab.title`); the dot of its connection in its color, and the connection's name;
  under them, dimmed, its path without the connection (`shop / orders`).
- **States**:
  - A click, or `Enter` with the focus on it, opens it (`tab.open`) on the section it had, and connects its
    connection if needed. A click with the middle button or with `Ctrl` opens it in the background.
  - What is open in a tab already is listed like the rest; a click makes that tab active.
  - Its context menu has **Remove from Jump back in** (`home.forget-recent`).
  - The filter of the cards does not change this part.
  - `Left` and `Right` move between the items.
- **Uses**: `palette.recent`, `tab.open`, `tab.title`, `home.forget-recent`.
- **Ported from**: *New in Datardo*.

Acceptance:

- [ ] After the tabs of `orders` and then `users` of Local were active, **Jump back in** starts with `users`, then
  `orders`, each with the dot and the name of Local and the path `shop / users` or `shop / orders`.
- [ ] A click on `orders` after a restart opens its collection tab and connects Local.
- [ ] With 12 recent places, 8 are shown.
- [ ] On a first run, with no recent place, Home shows no **Jump back in**.
- [ ] Typing `prod` in the filter leaves **Jump back in** as it was.
- [ ] A click with the middle button on an item adds its tab and leaves Home active.

### `home.forget-recent` — Remove a recent place

Takes one thing, or everything, out of **Jump back in** and of the recent places of Go to.

- **Kind**: Operation
- **Engine**: Any
- **Function**: `src/features/home/forget-recent.ts › plan(context, answers)`
- **Entry points**: **Remove from Jump back in** in the context menu of an item of **Jump back in**; **Clear** beside
  the heading (`@home`).
- **Plan**: one app step: `forget shop.orders of Local as a recent place`, or, for **Clear**, `forget every recent
  place`.
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone: nothing is written to a deployment, so nothing is recorded. Opening the thing again
  makes it a recent place again.
- **After**: the item leaves **Jump back in**, and the next recent place, if any, takes the last spot; Go to no
  longer lists it under **Recent** (`palette.recent`). After **Clear**, **Jump back in** is not shown. Open tabs,
  pins, saved queries and the places of **Back** are untouched.
- **Uses**: `palette.recent`, `home.jump-back-in`.
- **Ported from**: *New in Datardo*.

Acceptance:

- [ ] **Remove from Jump back in** on `orders` removes it from Home and from **Recent** in Go to; the tab of
  `orders`, if open, stays open.
- [ ] With 9 recent places, removing one of the 8 shown brings the ninth into view.
- [ ] **Clear** removes the whole part from Home, and Go to with nothing typed shows no **Recent**.
- [ ] Making the tab of `orders` active afterwards lists `orders` again.

### `home.connections` — The connection cards, by folder

Every saved connection, in its folder.

- **Kind**: View
- **Engine**: Any
- **Function**: `src/features/home/connections.ts › view(state)`
- **Entry points**: the part **Connections** of Home (`@home`).
- **Reads**: the saved connections; the filter (`home.filter`).
- **Shows**: the heading **Connections**, then:
  - first the connections that are in no folder, under no heading;
  - then one group for each folder, the folders sorted by name: the name of the folder, the number of its
    connections that are shown, a `…` button, and its cards.

  In a group, the cards are in the order the connections were saved, in a grid: each card is at least 280 px wide
  *(Datardo's choice)*, and a row holds as many as fit, all of the same width.
- **States**:
  - A click on the name of a folder collapses or expands its group; which folders are collapsed is remembered across
    starts. While a filter is on, every group that has a card left is shown expanded.
  - A folder none of whose connections passes the filter is not shown.
  - The `…` button and the context menu of a folder's heading open the menu of the folder
    (`connection.folder-menu`), whose entries are on that card. The connections in no folder have no heading and no
    such menu.
  - The card of the current connection is marked with a line in its color (`nav.current-connection`).
  - With the focus on a card, the arrow keys move between the cards, across the groups; `Enter` presses the card's
    button; `Shift+F10` or the menu key opens its menu (`home.card-menu`).
- **Uses**: `home.card`, `home.filter`, `home.card-menu`, `connection.folder-menu`, `nav.current-connection`.
- **Ported from**: *New in Datardo*. Mongoster's tree sorts the folders by name in the same way: `src/tree.ts`
  (`getChildren`), `src/connections.ts` (`folders`).

Acceptance:

- [ ] With Production in the folder `Live`, Staging in the folder `Dev`, and Local and Cache local in no folder,
  Home shows the cards of Local and Cache local under no heading, then the groups `Dev` and `Live`, in this order.
- [ ] With no folder at all, the cards are shown under **Connections** with no other heading.
- [ ] A click on `Live` hides its cards and shows `Live 1`; it is still collapsed after a restart.
- [ ] With `Live` collapsed, typing `prod` in the filter shows the card of Production.
- [ ] In a main island 900 px wide, a row holds three cards of the same width.
- [ ] The context menu of `Live` shows the entries of `connection.folder-menu`; the cards in no folder have no
  heading to open one on.
- [ ] `Right` on the last card of a group moves the focus to the first card of the next group.

### `home.card` — A connection card

One saved connection: what it is, where it leads, how it is, and the button to go there.

- **Kind**: View
- **Engine**: Any
- **Function**: `src/features/home/card.ts › view(state)`
- **Entry points**: each card of **Connections** (`@home`).
- **Reads**: the connection as it is saved (never its connection string, which stays in the secret storage:
  `connection.secrets`), and its state.
- **Shows**:
  - a band in the color of the connection, at the left edge; grey when it has no color;
  - its name, cut with `…` when it does not fit;
  - its engine, **MongoDB** or **Redis**, and, while it is connected, the version (`MongoDB 8.0`);
  - its address, without credentials (`home.address`);
  - its marks, in this order, each only when it applies: **Read-only**, **SSH** (it goes through an SSH tunnel),
    **redis-oplog** (a MongoDB connection linked to a Redis connection: `connection.link-redis`);
  - its state, one of the five of `connection.state`, without the latency: nothing when it is not connected;
    *Connecting…*; *Connected*; *Reconnecting…*, with the reason of the drop when the pointer rests on it; *Failed*,
    with the first line of the reason, and the whole reason when the pointer rests on it;
  - one button, according to the state: **Connect** when it is not connected or failed, **Cancel** while it is
    connecting, **Go to** when it is connected or reconnecting;
  - the `…` button, which opens the menu of the card (`home.card-menu`); a right click on the card opens it too.
- **States**:
  - Reconnecting: the connection was lost and Datardo is trying again by itself (`connection.reconnect`). The card
    has no button of its own for it: **Reconnect** is in its menu (`connection.menu`), for a reconnecting and for a
    failed connection.
  - **Connect** and **Go to** both start `nav.switch-connection` with this connection chosen: it becomes the current
    one, its tab that was active last becomes active or its Overview opens, and it connects if it was not connected.
    A double click on the card does the same.
  - **Cancel** stops the connecting; the card is back to **Connect**.
  - A connection that fails after **Connect** stays current, and the page that was opened shows the error; back on
    Home, its card reads *Failed*.
  - A screen reader says, for a card: the name, the engine, the address, the marks and the state.
- **Uses**: `home.address`, `home.card-menu`, `nav.switch-connection`, `connection.state`, `connection.connect`,
  `connection.reconnect`, `connection.menu`, `connection.secrets`, `connection.link-redis`.
- **Ported from**: *New in Datardo*. The marks **Read-only**, **SSH** and **redis-oplog** are those Mongoster writes
  beside a connection: `src/tree.ts` (`ConnectionNode`).

Acceptance:

- [ ] The card of Production, a red read-only MongoDB connection through an SSH tunnel, shows a red band,
  `Production`, **MongoDB**, its address, **Read-only** and **SSH**, and the button **Connect**.
- [ ] No card shows a user name, a password or the options of a connection string, in its text or in what is shown
  when the pointer rests on it.
- [ ] **Connect** on Local makes Local the current connection, opens its Overview tab when it has no tab, and
  connects it.
- [ ] While Local is connecting its card shows *Connecting…* and **Cancel**; **Cancel** gives **Connect** back.
- [ ] The card of a connected connection shows *Connected*, its version and **Go to**; **Go to** makes its last
  active tab active.
- [ ] The card of a connection whose connecting failed shows *Failed*, the first line of the reason and **Connect**;
  its menu has **Reconnect**.
- [ ] The card of a connection that was lost shows *Reconnecting…* and **Go to**, and no latency; when the attempts
  end it shows *Failed* and **Connect**.
- [ ] A MongoDB connection linked to a Redis connection shows **redis-oplog**; the Redis connection does not.

### `home.address` — The address of a connection, without credentials

What a card shows for where a connection leads: enough to tell two connections apart, and nothing that is secret.

- **Kind**: Derivation
- **Engine**: Any
- **Function**: `src/features/home/address.ts › address(connection)`
- **Inputs**: what the connection area keeps beside the connection for showing it: its hosts, each as it was
  written (a name or an address, and a port if one was written), whether it is an SRV name, and the host of its SSH
  tunnel if it has one. Not the connection string: this never reads the secret storage.
- **Output**: one line of text.
- **Rules**:
  1. One host: the host, and `:` and the port when a port was written. No default port is added.
  2. An SRV name: the name alone.
  3. Several hosts: the first, as in rule 1, then a space and `+<n>`, the number of the others.
  4. An IPv6 address keeps its brackets.
  5. With an SSH tunnel: the line is followed by ` via ` and the host of the SSH server, without its user or port.
  6. Never in it: the scheme, a user, a password, a database, an option.
- **Invariants**: the result holds no character of the user name or of the password; two connections with the same
  hosts and the same tunnel have the same address, whatever their credentials.
- **Worked examples** (the connection string the user typed → the address shown):
  - `mongodb://app:s3cret@db1.example.com:27017,db2.example.com:27017,db3.example.com:27017/shop?replicaSet=rs0` →
    `db1.example.com:27017 +2`
  - `mongodb+srv://app:s3cret@cluster0.ab12c.mongodb.net/shop` → `cluster0.ab12c.mongodb.net`
  - `mongodb://localhost` → `localhost`
  - `mongodb://[::1]:27017` → `[::1]:27017`
  - `redis://:s3cret@localhost:6379/2` → `localhost:6379`
  - `rediss://default:s3cret@cache.example.com:6380` → `cache.example.com:6380`
  - `mongodb://10.0.0.5:27017`, through an SSH tunnel to `deploy@bastion.example.com:2222` → `10.0.0.5:27017 via
    bastion.example.com`
- **Uses**: `connection.secrets`, for what must not be read.
- **Ported from**: *New in Datardo*.

Acceptance:

- [ ] Each worked example above gives exactly that line.
- [ ] Building the address of a connection asks nothing of the secret storage.
- [ ] Resting the pointer on `db1.example.com:27017 +2` shows the three hosts, one for each line, and nothing else.
- [ ] Two connections to `localhost:27017` with different users show the same address.

### `home.filter` — Filter the cards by text and by engine

Narrows the cards to the connections that are looked for.

- **Kind**: Derivation
- **Engine**: Any
- **Function**: `src/features/home/filter.ts › filterConnections(text, engine, connections)`
- **Entry points**: the filter field and the engines **All**, **MongoDB**, **Redis** in the first row of Home
  (`@home`); `Ctrl+F` with the focus in Home puts the focus in the field; `Esc` in the field empties it.
- **Inputs**: the text of the field; the engine chosen; the saved connections, each with its name, its folder, its
  engine and its address (`home.address`).
- **Output**: the connections whose cards are shown; for each engine, the number beside its name.
- **Rules**:
  - The text is split at spaces into words. A connection passes when every word is found in its name, in the name of
    its folder or in its address, without regard to case or to accents. An empty text lets every connection pass.
  - The engine: **All** lets every connection pass, **MongoDB** and **Redis** only those of that engine.
  - A connection is shown when it passes both.
  - Beside each engine is the number of connections that pass the text: **All 7**, **MongoDB 5**, **Redis 2**.
  - The three engines are shown only when the saved connections are not all of one engine.
  - The engine chosen is remembered across starts; the text is not.
  - The filter never changes the order of the cards (`home.connections`).
- **Worked examples**. The connections: Local (MongoDB, no folder, `localhost:27017`), Cache local (Redis, no folder,
  `localhost:6379`), Staging (MongoDB, folder `Dev`, `staging.example.com:27017`), Production (MongoDB, folder
  `Live`, `db1.example.com:27017 +2`), Cache production (Redis, folder `Live`, `cache.example.com:6380`).
  - no text, **All** → the five; **All 5**, **MongoDB 3**, **Redis 2**
  - no text, **Redis** → Cache local, Cache production
  - `local`, **All** → Local, Cache local (both by their names and by `localhost`); **All 2**, **MongoDB 1**, **Redis
    1**
  - `live`, **All** → Production, Cache production (by their folder)
  - `live cache`, **All** → Cache production
  - `example`, **MongoDB** → Staging, Production
  - `6380`, **All** → Cache production
  - `zz`, **All** → none; **All 0**, **MongoDB 0**, **Redis 0**
- **Uses**: `home.address`, `home.connections`.
- **Ported from**: *New in Datardo*.

Acceptance:

- [ ] Each worked example above shows exactly those cards and those numbers.
- [ ] `LOCAL` gives the same cards as `local`.
- [ ] With only MongoDB connections saved, the row shows the field and no engine.
- [ ] Choosing **Redis**, quitting and starting again shows Home with **Redis** chosen and an empty field.
- [ ] `Esc` in the field empties it and every card of the chosen engine is back.
- [ ] A text that matches the user name of a connection string, and nothing else, shows no card.

### `home.card-menu` — The menu of a connection

Where the menu of a connection opens on Home. Its entries are not Home's: they are those of the connection area,
the same wherever a connection is shown.

- **Kind**: View
- **Engine**: Any
- **Function**: `src/features/home/card-menu.ts › view(state)`
- **Entry points**: the `…` button of a card and a right click on the card (`@home`); `Shift+F10` or the menu key
  with the focus on a card.
- **Shows**: the entries of `connection.menu`, in its order, with its wording and its lines between the groups, for
  the connection of the card. Home adds no entry and leaves none out.
- **States**:
  - The menu opens beside the `…` button, or where the pointer is for a right click; the card stays marked while it
    is open. The arrows move, `Enter` chooses, `Esc` closes and gives the focus back to the card.
  - Opening the menu does not make the connection the current one, and neither does choosing an entry: **Connect** in
    the menu connects and leaves Home active, which is the way to connect several connections from Home. Going to a
    connection is the button of its card (`home.card`).
  - What each entry asks, confirms and refuses is on the card of its feature.
  - The connection island and the connection switcher open the same menu from their own controls
    (`nav.connection-island`, `nav.switch-connection`).
- **Uses**: `connection.menu`, `home.card`.
- **Ported from**: *New in Datardo*. Mongoster's context menu of a connection is ported by the card that holds the
  entries, `connection.menu`.

Acceptance:

- [ ] The `…` of a card, a right click on the card and `Shift+F10` with the focus on it open the same menu.
- [ ] Its entries, their order and their wording are those of `connection.menu`: on a connection that is not
  connected it starts with **Connect** and **Open overview**, and it has no **Go to**.
- [ ] **Connect** in the menu connects the connection and leaves Home active, with the same current connection as
  before.
- [ ] The menu of a failed connection has **Reconnect**, which starts `connection.reconnect`.
- [ ] `Esc` closes the menu, runs nothing and puts the focus back on the card.
