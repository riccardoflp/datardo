# Go to

The field of the top bar and the list it opens, for every engine: what it lists before anything is typed, where it
looks, the prefixes that narrow it to one source, how it ranks what it finds, opening a result, and the commands
with their keys. Go to is the keyboard's way to everything: whatever a control of the window starts, a command
starts too. Search, which looks inside documents, is another thing (`search.show`).

## The list

### `palette.open` — Open Go to

One field that finds the open tabs, collections, keys, pages, connections, saved queries and commands.

- **Kind**: View
- **Engine**: Any
- **Function**: `src/features/palette/open.ts › view(state)`
- **Entry points**: `Ctrl+K`; a click on the **Go to** field of the top bar (`@top-bar`); `Ctrl+Shift+P`, which opens
  it with `>` typed (**Show all commands**); **All tabs** at the end of a tab strip that scrolls, which opens it
  with `=` typed (`@tab-strip`); on macOS **View › Go to…** (`@app-menu`).
- **Offered when**: always, except while a dialog is open (`nav.dialog`).
- **Shows**: the field of the top bar becomes a text field with the focus, and a list opens under it, 640 px wide
  *(Datardo's choice)* or as wide as the window allows, with at most 12 rows in sight *(Datardo's choice)* and the
  rest by scrolling.
  - Nothing typed: the recent places (`palette.recent`) under the heading **Recent**, then a line that names the
    prefixes: `>` commands, `@` connections, `#` collections, `:` keys, `/` pages, `?` saved queries, `=` open tabs.
    With no recent place, that line alone, under *Type to find a collection, a key, a page, a connection, a saved
    query or a command.*
  - Something typed: what `palette.sources` finds, in the order of `palette.rank`, then the keys of
    `palette.find-keys` under their own heading.
  - A row is: the icon of its kind; its name, with the letters that matched in bold; its context, dimmed (`Local /
    shop`); at the right, the word for its kind (**tab**, **collection**, **view**, **key**, **page**,
    **connection**, **saved query**, **command**) or, for a command, its key.
  - Nothing found: *Nothing matches "\<text\>".*
- **States**:
  - The first row is selected. `Down` and `Up` move the selection and go round at the ends; `PageDown` and `PageUp`
    move by the rows in sight; the pointer selects the row it moves over.
  - `Enter` or a click opens the selected row and closes Go to; `Ctrl+Enter`, or a click with `Ctrl` or with the
    middle button, opens it and leaves the list open (`palette.open-result`).
  - `Esc`, `Ctrl+K` again, or a click outside closes it, and the focus goes back to the control that had it. The
    text is not kept: it opens empty the next time.
  - The list follows the text as it is typed, with no delay for what Datardo already knows; the keys of a Redis
    connection arrive after their scan and are added under the rest, so that a row never moves under the pointer.
  - Opening Go to connects nothing and, until something is typed, sends nothing to a deployment.
  - A screen reader is told the number of results, and for the selected row its name, its kind and its context.
- **Commands**: `palette.open`, `palette.open:commands`, `palette.open:tabs`.
- **Uses**: `palette.recent`, `palette.sources`, `palette.rank`, `palette.find-keys`, `palette.open-result`,
  `nav.dialog`.
- **Ported from**: *New in Datardo*.

Acceptance:

- [ ] `Ctrl+K` puts the focus in the field of the top bar and lists the recent places under **Recent**.
- [ ] A click on the field of the top bar does the same.
- [ ] `Ctrl+Shift+P` opens Go to with `>` in the field and every command listed by title.
- [ ] Typing `ord` lists the collections whose name holds `ord`, with `ord` in bold in each name.
- [ ] `Down` on the last row selects the first.
- [ ] `Esc` closes the list and puts the focus back in the cell of the table that had it; opening Go to again shows
  an empty field.
- [ ] Typing `zzzz`, which nothing matches, shows *Nothing matches "zzzz".*
- [ ] With a confirmation open, `Ctrl+K` does nothing.
- [ ] Opening Go to and closing it sends no command to any server.

### `palette.recent` — Recent places

The things used last, most recent first: what Go to lists before anything is typed, and what Home offers under
**Jump back in**.

- **Kind**: Read
- **Engine**: Any
- **Function**: `src/features/palette/recent.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: none of its own: `palette.open` and `home.jump-back-in` show it.
- **Request**: the list of recent places kept in Datardo's data. Nothing is asked of a deployment.
- **Parse**: the entries, most recent first, each with what it shows (`tab.same-target`), its title (`tab.title`), the
  name and color of its connection, its path as the scope bar writes it, and when it was last active.
- **Rules**:
  - An entry is added, or moved to the front when it is there already, each time a tab of a connection becomes
    active (`tab.activate`). The tabs of the app and the playgrounds never saved are not recent places.
  - The list keeps 50 entries *(Datardo's choice)*, across starts; the oldest go first. It holds names only: no
    query text, no document, no value.
  - Go to shows the first 12 *(Datardo's choice)*, leaving out what the active tab shows.
  - An entry of a connection that is removed goes with it (`tab.connection-gone`). An entry of something that no
    longer exists stays until it is opened, when its page says so; it can be removed by hand (`home.forget-recent`).
- **Uses**: `tab.activate`, `tab.same-target`, `tab.title`.
- **Ported from**: *New in Datardo*.

Acceptance:

- [ ] After making active `orders`, then `users`, then `orders` again, the list starts with `orders`, then `users`,
  and holds `orders` once.
- [ ] With `orders` active, Go to with nothing typed starts with `users`, not with `orders`.
- [ ] Settings and Home never appear among the recent places.
- [ ] The list is the same after quitting and starting again.
- [ ] After 51 different collections were opened, the first one is no longer listed.
- [ ] Removing the connection Staging removes every recent place of Staging.

### `palette.sources` — Where Go to looks

Turns the text typed into the sources to look in and the text to look for.

- **Kind**: Derivation
- **Engine**: Any
- **Function**: `src/features/palette/sources.ts › sources(text, state)`
- **Inputs**: the text of the field; what the window knows: the open tabs, the saved connections and which are
  connected, the current connection, the names read by `palette.find-collections`, the saved queries, the commands.
- **Output**: the sources to look in, the text to look for (the *terms*: the text split at spaces), and the
  candidates of each source, each with a name and a context.
- **Rules**:
  - A text that starts with one of the prefixes below looks in that source only; the prefix is not part of the text
    to look for, and spaces after it are ignored. Any other text looks in every source.
  - The sources:

    | Source | Prefix | Candidates | Name | Context |
    | --- | --- | --- | --- | --- |
    | open tabs | `=` | every open tab | its title | its connection |
    | collections | `#` | the collections, views and GridFS buckets of every connected MongoDB connection (`palette.find-collections`) | its name | connection and database: `Local / shop` |
    | keys | `:` | the keys of the current connection, when it is a connected Redis connection (`palette.find-keys`) | its name | connection and database |
    | pages | `/` | the pages of every connected connection, as **Pages of** lists them, and the pages of the app: Home, Settings, Undo history, Scheduled tasks, Log | its name | its connection, or **Datardo** |
    | connections | `@` | every saved connection | its name | its folder and its engine |
    | saved queries | `?` | the saved queries of every saved MongoDB connection, for me and in the folder | its name | connection, database and collection |
    | commands | `>` | the commands of `palette.commands` that `palette.run-command` offers now | its title | — |

  - A connection that is not connected gives its name, its saved queries and nothing else: Go to never connects in
    order to look.
  - A prefix with nothing after it lists its whole source, at most 50 rows *(Datardo's choice)*: the commands by
    title, the connections as the connection switcher orders them, the tabs in the order of the strip, the pages of
    the current connection and then those of the app, the collections of the current connection by database and
    name, the saved queries by name. `:` alone lists nothing and shows *Type part of a key's name.*
  - Two candidates that show the same thing (`tab.same-target`) are one row: an open tab and its collection, a
    recent place and its collection. The row keeps the kind of the tab when a tab is open.
- **Worked examples** (text → sources; text to look for):
  - `ord` → every source; `ord`
  - `us ord` → every source; the two terms `us` and `ord`
  - `>zoom` → commands; `zoom`
  - `> zoom` → commands; `zoom`
  - `@prod` → connections; `prod`
  - `#` → collections; nothing: the collections of the current connection
  - `:orders:4` → keys; `orders:4`
  - `orders:4` → every source; `orders:4`
  - `=` → open tabs; nothing: every open tab, in the order of the strip
  - three spaces → nothing typed: the recent places
- **Uses**: `palette.find-collections`, `palette.find-keys`, `palette.commands`, `palette.run-command`,
  `palette.rank`, `tab.same-target`.
- **Ported from**: *New in Datardo*.

Acceptance:

- [ ] `@` lists every saved connection, by folder, and nothing else.
- [ ] `>zoom` lists **Zoom in**, **Zoom out** and **Reset zoom**, and no collection named `zoom`.
- [ ] `ord` lists the collection `orders` of Local, which is connected, and nothing of Staging, which is not, except
  Staging's saved queries whose name holds `ord`.
- [ ] With `orders` of Local open in a tab, `ord` lists `orders` of Local once, as a **tab**.
- [ ] `/mon` lists the Monitor page of each connected MongoDB connection.
- [ ] `:` alone shows *Type part of a key's name.* and sends nothing to the server.
- [ ] `=` lists the open tabs in the order of the strip, with the name of each one's connection.

### `palette.find-collections` — The names of collections for Go to

Reads the names of the databases, collections and views of a connected MongoDB connection, once, so that Go to
finds them without a delay.

- **Kind**: Read
- **Engine**: MongoDB
- **Function**: `src/features/palette/find-collections.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: none: it runs the first time Go to opens after a MongoDB connection connected.
- **Request**: `db.adminCommand({ listDatabases: 1, nameOnly: true })`, then for each database
  `db.getSiblingDB("<name>").getCollectionInfos({}, { nameOnly: true, authorizedCollections: true })`, one database
  at a time.
- **Parse**: for each name, its database and whether it is a collection, a view or a GridFS bucket. It keeps the
  same databases and collections the tree lists and leaves out the same ones (`tree.show`); a bucket is one
  candidate, not its two collections.
- **Rules**:
  - The names are kept for the connection until it is disconnected. They are read again when the tree is refreshed
    (`tree.refresh`), when Datardo creates, renames or drops a database or a collection, and when Go to opens more
    than 5 minutes *(Datardo's choice)* after the last read; meanwhile Go to shows what it has, and the list is
    updated when the new names arrive.
  - At most 10,000 names *(Datardo's choice)* are kept for a connection; beyond them Go to shows, under the results,
    *Local has more than 10,000 collections. Use the tree to reach the others.*
  - A read that fails (a user who may not list the databases, a connection that drops) shows nothing in Go to: the
    names the tree has read are used instead, and the Log gets one line (`runner.log`).
  - It is not work in progress on the status line, and it stops when the connection is disconnected.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Refuses**: nothing: without names, Go to lists the other sources.
- **Uses**: `tree.show`, `tree.refresh`, `runner.log`.
- **Ported from**: *New in Datardo*.

Acceptance:

- [ ] After Local connects, the first `Ctrl+K` sends `listDatabases` and one `listCollections` for each database;
  the second `Ctrl+K`, a minute later, sends nothing.
- [ ] A collection of a database never expanded in the tree is found by Go to.
- [ ] After **Create collection…** adds `invoices` to `shop`, Go to finds `invoices` without a refresh.
- [ ] The collections `fs.files` and `fs.chunks` are one row, the bucket `fs`.
- [ ] With a user who may not run `listDatabases`, Go to shows no error and finds the collections the tree shows.
- [ ] Nothing is sent to a connection that is not connected.

### `palette.find-keys` — The keys of the current Redis connection for Go to

Looks for keys by a part of their name, with a scan that is stopped early so that it never weighs on the server.

- **Kind**: Read
- **Engine**: Redis
- **Function**: `src/features/palette/find-keys.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: none: Go to starts it when the keys are among its sources (`palette.sources`).
- **Offered when**: the current connection is a connected Redis connection, and the text to look for has at least 2
  characters, or 1 after the prefix `:` *(Datardo's choices)*. The database is the one of the active tab when that
  is a keys tab or a key tab of the same connection, otherwise `db0`.
- **Request**: `SCAN 0 MATCH *<text>* COUNT 1000`, then `SCAN <cursor> MATCH *<text>* COUNT 1000` with the cursor
  each reply gives, until one of: the cursor is `0`; 20 keys were found; 5 calls were made *(all Datardo's
  choices)*. Never `KEYS`.
  - In the text, the characters `*`, `?`, `[`, `]` and `\` are written with a `\` before them, so that they mean
    themselves. After the prefix `:`, a text that holds `*`, `?` or `[` is used as the pattern, as it is typed, with
    nothing added around it.
  - With several terms, the pattern is made of the first, and the others are checked on the names that come back.
  - The scan starts 200 ms *(Datardo's choice)* after the last character typed. When the text changes, the scan in
    progress is abandoned: no further call is made for it and what it returns is ignored.
- **Parse**: the names found, as bytes; whether the whole database was looked at (the cursor came back `0`) or the
  scan was stopped.
- **Shows**, in Go to, after the other results, under the heading **Keys of \<connection\> · \<database\>**:
  - while the scan runs: *Looking for keys…*;
  - the keys found, at most 20, ordered among themselves by `palette.rank`; a name that is not valid UTF-8 is
    written as `value.format` writes bytes;
  - the whole database looked at and nothing found: *No key of db0 holds "\<text\>".*;
  - the scan stopped before the end: *Looked at about 5,000 keys of db0.* and **Scan all in Keys**, which opens the
    keys tab of that database with the same pattern (`key.show`), where the scan goes on a page at a time
    (`key.scan`).
- **Rules**: names are matched as `MATCH` matches them, with regard to case: `ord` does not find `Orders:1`. The
  type of a key is not read: the row shows the icon of a key. A scan that fails shows *Keys could not be read:
  \<error\>* under the heading, and the other results stay.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Uses**: `key.show`, `key.scan`, `key.open`, `value.format`, `palette.rank`.
- **Ported from**: *New in Datardo*.

Acceptance:

- [ ] With Cache local current and connected, typing `sess` sends `SCAN 0 MATCH *sess* COUNT 1000` 200 ms after the
  last character, and no `KEYS`.
- [ ] Typing `s` alone sends nothing; typing `:s` sends `SCAN 0 MATCH *s* COUNT 1000`.
- [ ] Typing `:orders:4*` sends `SCAN 0 MATCH orders:4* COUNT 1000`.
- [ ] Typing `a*b` without the prefix sends `MATCH *a\*b*`.
- [ ] On a database of a million keys of which none matches, exactly 5 `SCAN` calls are sent, and Go to shows
  *Looked at about 5,000 keys of db0.* with **Scan all in Keys**.
- [ ] On a database of 300 keys of which none matches, Go to shows *No key of db0 holds "sess".*
- [ ] No more than 20 keys are listed, whatever the scan finds.
- [ ] Typing `sess` and then `sessi` before the first reply shows only the keys that hold `sessi`.
- [ ] With a MongoDB connection current, no `SCAN` is sent to any Redis connection.
- [ ] With the active tab on the keys of `db3`, the scan runs in `db3` and the heading reads **Keys of Cache local ·
  db3**.

### `palette.rank` — How Go to ranks what it finds

Gives every candidate a score for the text typed, and orders the list by it. The rules are exact, so that the same
text always gives the same list.

- **Kind**: Derivation
- **Engine**: Any
- **Function**: `src/features/palette/rank.ts › rank(terms, candidates)`
- **Inputs**: the terms (`palette.sources`); the candidates, each with its name, its context, and three facts:
  whether it is open in a tab, whether it is among the recent places (`palette.recent`), whether it belongs to the
  current connection.
- **Output**: the candidates that match, in order, each with the letters of its name that matched; at most 50
  *(Datardo's choice)*.
- **Rules**:
  1. **Comparing**: names, contexts and terms are compared without regard to case and without their accents (`cafe`
     finds `Café`).
  2. **Word starts** of a name: its first character; a character that follows a space, `.`, `_`, `-`, `:` or `/`;
     an upper-case letter that follows a lower-case letter or a digit (`userOrders` has two: `u` and `O`).
  3. **The score of one term** against a candidate is the highest of these that applies:

     | Score | When |
     | --- | --- |
     | 100 | the name is the term |
     | 90 | the name starts with the term |
     | 80 | the term is in the name, starting at a word start |
     | 70 | the term is in the name, anywhere |
     | 50 | each letter of the term is a word start of the name, in order (`oi` in `order_items`) |
     | 30 | the letters of the term are in the name in order, the first of them at a word start (`usr` in `users`) |
     | 10 | the term is in the context |

     A term to which none applies does not match.
  4. **A candidate matches** when every term matches. Its score is the sum of the scores of the terms, plus 15 when
     it is open in a tab, plus 10 when it is among the recent places, plus 5 when it belongs to the current
     connection *(all the numbers of rules 3 and 4 are Datardo's choices)*.
  5. **Order**: the higher score first; then the shorter name; then the name, compared character by character
     without regard to case; then the context, in the same way.
  6. **The letters in bold** are those of the match that gave each term its score: for the scores 50 and 30, the
     leftmost letters that satisfy it.
- **Invariants**: the same terms and candidates always give the same order; a candidate one of whose terms matches
  nothing is never listed; typing one more character at the end of the last term never adds a candidate to the
  list; no candidate is listed twice.
- **Worked examples**. The candidates: on Local, the current connection, the collections `orders` (open in a tab,
  and a recent place), `order_items`, `users` and `userOrders` of the database `shop`, and `orders` of the database
  `crm`; the page **Monitor** of Local; the commands **Zoom in**, **Zoom out** and **Reset zoom**.
  - `ord` → `orders` of `shop` (90 + 15 + 10 + 5 = 120), `orders` of `crm` (90 + 5 = 95), `order_items` (90 + 5 =
    95, a longer name), `userOrders` (80 + 5 = 85)
  - `oi` → `order_items` (50 + 5 = 55), and nothing else
  - `us ord` → `userOrders` (90 + 80 + 5 = 175), and nothing else: `users` has no `ord`, `orders` has no `us`
  - `crm ord` → `orders` of `crm` (10 + 90 + 5 = 105), and nothing else
  - `usr` → `users` (30 + 5 = 35), `userOrders` (30 + 5 = 35, a longer name)
  - `users` → `users` (100 + 5 = 105), `userOrders` (30 + 5 = 35)
  - `mon` → **Monitor** (90 + 5 = 95)
  - `>zoom` → **Zoom in** (90), **Zoom out** (90, a longer title), **Reset zoom** (80)
- **Uses**: `palette.sources`, `palette.recent`.
- **Ported from**: *New in Datardo*.

Acceptance:

- [ ] Each worked example above gives exactly that list in that order.
- [ ] `ORD` gives the same list as `ord`.
- [ ] With `orders` of `crm` open in a tab instead of `orders` of `shop`, and neither a recent place, `ord` lists
  `orders` of `crm` first (110), then `orders` of `shop` (95).
- [ ] `ordx` lists nothing, and no text that starts with `ordx` lists anything that `ordx` did not.
- [ ] With 300 collections whose names start with `log_`, `log` lists 50 rows.
- [ ] In the row of `order_items` for `oi`, the letters in bold are the `o` of `order` and the `i` of `items`.

### `palette.open-result` — Open a result

Opens what is selected in the list, with or without leaving the list.

- **Kind**: Operation
- **Engine**: Any
- **Function**: `src/features/palette/open-result.ts › plan(context, answers)`
- **Entry points**: on a row of Go to's list: `Enter` or a click; `Ctrl+Enter`, a click with `Ctrl` or with the
  middle button, to open without leaving the list.
- **Plan**: none of its own: it starts the feature of the row, with what the row names:

  | Row | What it starts |
  | --- | --- |
  | an open tab | `tab.activate` |
  | a collection or a view | `tab.open`, with its collection tab |
  | a GridFS bucket | `gridfs.show` |
  | a key | `key.open` |
  | a page | the feature of that page (`monitor.show`, `console.show`, `settings.page`, `home.show`…), through `tab.open` |
  | a connection | `nav.switch-connection`, with that connection chosen |
  | a saved query | the collection tab of its collection with that query in its query bar, run, as opening a saved query does |
  | a recent place | `tab.open`, on the section it had |
  | a command | `palette.run-command` |

- **Rules**:
  - `Enter` closes Go to first, then starts the feature; the focus goes where the feature puts it.
  - `Ctrl+Enter` on a row that opens a tab opens it in the background (`tab.open`): the active tab stays active, Go
    to stays open with its text, and the row reads **opened** at its right. On an open tab, a connection or a
    command, `Ctrl+Enter` does what `Enter` does.
  - A row of a connection that is not connected (a saved query, a recent place) connects it, as opening its tab
    does (`connection.connect`).
- **Danger**: None of its own: that of the feature it starts.
- **Read-only**: Allowed, because it writes nothing to a deployment itself; the feature it starts answers for
  itself.
- **Undo**: Cannot be undone: nothing is written to a deployment by opening, so nothing is recorded. **Back** returns
  to the tab that was active (`nav.back`).
- **After**: what the feature it starts says.
- **Uses**: `tab.activate`, `tab.open`, `gridfs.show`, `key.open`, `nav.switch-connection`, `palette.run-command`,
  `connection.connect`.
- **Ported from**: *New in Datardo*.

Acceptance:

- [ ] `Enter` on the collection `users` of Local closes Go to and makes the collection tab of `users` active,
  opening it if needed.
- [ ] `Ctrl+Enter` on `users` and then on `order_items` adds both tabs to Local's group, leaves the active tab
  active and Go to open with its text, and marks both rows **opened**.
- [ ] `Enter` on the connection Staging makes Staging the current connection, as choosing it in the connection
  switcher does.
- [ ] `Enter` on the key `session:9f2c` opens what a click on that key in a keys tab opens.
- [ ] `Enter` on a saved query of `shop.orders` opens the tab of `shop.orders` with the saved filter in the query
  bar and its results.
- [ ] `Enter` on **Zoom in** closes Go to and the zoom is 110%.
- [ ] `Enter` on a row of an open tab of a collapsed group expands the group and makes the tab active.

## Commands

### `palette.commands` — Every command, with its title and its key

The one list of what can be started from Go to or with a key. Go to shows it after `>`, the system's menu bar on
macOS is made from it, and the documentation of the keys is generated from it.

- **Kind**: Derivation
- **Engine**: Any
- **Function**: `src/features/palette/commands.ts › commands(features, platform)`
- **Inputs**: the features, each with what its card writes in **Commands** and **Entry points**; the platform.
- **Output**: the commands, each with its identifier, its title, its default key or none, the engine of its
  feature, and where its key works.
- **Rules**:
  - A command's identifier is that of its feature, or `feature:variant` for a feature with several fixed variants.
  - A title is in sentence case, starts with a verb or names a page, and ends with `…` when the command asks
    something before it acts. A command that switches between two states has a title for each (**Show explorer**,
    **Hide explorer**) and is listed with the one that applies now.
  - A key is either *of the window*, and works wherever the focus is, or *of a place*, and works while the focus is
    in that place (`Delete` on a row of a table). `palette.key-press` says which command a key starts.
  - On macOS a key is shown with the system's signs, `Cmd` in the place of `Ctrl` unless the table says otherwise.
  - **Keys cannot be changed in the first release**: there is no setting and no file for them. A command without a
    key in this list has none.
  - Never the key of a command: `Ctrl+C`, `Ctrl+X`, `Ctrl+V`, `Ctrl+A`, `Ctrl+Z`, `Ctrl+Y` and `Ctrl+Shift+Z`, which
    belong to the text being typed; `Esc`, `Enter`, `Tab` and `Shift+Tab`, which belong to dialogs, lists and the
    focus; the keys the system keeps (`Alt+Tab`, `Alt+F4`, the keys with `Win`; on macOS `Cmd+Tab`, `Cmd+H`,
    `Cmd+M`).
- **Invariants**: no two commands have the same identifier or the same title; no two commands have the same key in
  the same place, and a key of a place is never also a key of the window; every command is in Go to after `>`; every
  entry of the macOS menu bar that is not the system's is a command of this list (`window.app-menu`).
- **The commands of the window, of getting around, of the tabs, of Go to and of Home**; those of every other area are
  on its cards:

  | Command | Title | Key | On macOS |
  | --- | --- | --- | --- |
  | `palette.open` | **Go to…** | `Ctrl+K` | `Cmd+K` |
  | `palette.open:commands` | **Show all commands** | `Ctrl+Shift+P` | `Cmd+Shift+P` |
  | `palette.open:tabs` | **Show open tabs** | — | — |
  | `home.show` | **Home** | `Alt+Home` | `Cmd+Shift+H` |
  | `nav.switch-connection` | **Switch connection…** | `Ctrl+Shift+O` | `Cmd+Shift+O` |
  | `nav.toggle-explorer` | **Show explorer**, **Hide explorer** | `Ctrl+B` | `Cmd+B` |
  | `nav.toggle-inspector` | **Show inspector**, **Hide inspector** | `Ctrl+Shift+B` | `Cmd+Shift+B` |
  | `nav.resize:reset` | **Reset island widths** | — | — |
  | `nav.focus-island:next` | **Focus next island** | `F6` | `F6` |
  | `nav.focus-island:previous` | **Focus previous island** | `Shift+F6` | `Shift+F6` |
  | `nav.back:back` | **Back** | `Alt+Left` | `Cmd+[` |
  | `nav.back:forward` | **Forward** | `Alt+Right` | `Cmd+]` |
  | `nav.pin` | **Pin**, **Unpin** | — | — |
  | `nav.copy-path` | **Copy path** | — | — |
  | `nav.open-on-another-connection` | **Open on another connection…** | — | — |
  | `tab.activate:next` | **Next tab** | `Ctrl+Tab`, `Ctrl+PageDown` | `Ctrl+Tab`, `Cmd+Option+Right` |
  | `tab.activate:previous` | **Previous tab** | `Ctrl+Shift+Tab`, `Ctrl+PageUp` | `Ctrl+Shift+Tab`, `Cmd+Option+Left` |
  | `tab.activate:1` to `tab.activate:8` | **Go to tab 1** to **Go to tab 8** | `Ctrl+1` to `Ctrl+8` | `Cmd+1` to `Cmd+8` |
  | `tab.activate:last` | **Go to last tab** | `Ctrl+9` | `Cmd+9` |
  | `tab.close` | **Close tab** | `Ctrl+W` | `Cmd+W` |
  | `tab.close-many:others` | **Close other tabs** | — | — |
  | `tab.close-many:connection` | **Close tabs of this connection** | — | — |
  | `tab.close-many:all` | **Close all tabs** | — | — |
  | `tab.reopen` | **Reopen closed tab** | `Ctrl+Shift+T` | `Cmd+Shift+T` |
  | `tab.reorder:left` | **Move tab left** | `Ctrl+Shift+PageUp` | `Cmd+Shift+Option+Left` |
  | `tab.reorder:right` | **Move tab right** | `Ctrl+Shift+PageDown` | `Cmd+Shift+Option+Right` |
  | `tab.collapse-group` | **Collapse group**, **Expand group** | — | — |
  | `window.zoom:in` | **Zoom in** | `Ctrl+=`, `Ctrl++` | `Cmd+=`, `Cmd++` |
  | `window.zoom:out` | **Zoom out** | `Ctrl+-` | `Cmd+-` |
  | `window.zoom:reset` | **Reset zoom** | `Ctrl+0` | `Cmd+0` |
  | `window.full-screen` | **Enter full screen**, **Exit full screen** | `F11` | `Ctrl+Cmd+F` |
  | `window.theme:system` | **Theme: follow the system** | — | — |
  | `window.theme:dark` | **Theme: dark** | — | — |
  | `window.theme:light` | **Theme: light** | — | — |
  | `window.size:minimize` | **Minimize window** | — | the system's `Cmd+M` |
  | `window.size:maximize` | **Maximize window** | — | — |
  | `window.size:restore` | **Restore window** | — | — |
  | `window.close` | **Close window** | the system's `Alt+F4` | — |
  | `window.quit` | **Quit Datardo** | `Ctrl+Q` | `Cmd+Q` |
  | `window.about` | **About Datardo** | — | — |
  | `window.open-data-folder` | **Open data folder** | — | — |

  All the keys of this table are keys of the window.
- **Uses**: `palette.key-press`, `palette.run-command`, `window.app-menu`.
- **Ported from**: *New in Datardo*. For reference, Mongoster's commands and their titles are in the `contributes`
  of its `package.json`; its desktop app opens them with `Ctrl+Shift+P`.

Acceptance:

- [ ] `>` in Go to lists every command of every area by title, each with its key at the right when it has one.
- [ ] Every command of the table above is listed with exactly that title and that key.
- [ ] No two rows of that list have the same title, and no two the same key.
- [ ] With the explorer shown the list has **Hide explorer** and not **Show explorer**.
- [ ] On macOS, **Go to…** is shown with the sign of `Cmd` and `K`, and **Next tab** with the sign of `Ctrl` and
  `Tab`.
- [ ] No setting of the Settings page, and no file of the data folder, changes a key.
- [ ] `Ctrl+C` in a table copies, as its own feature says, and starts no command of the window.

### `palette.run-command` — Run a command

Starts the feature of a command on what the user is looking at.

- **Kind**: Operation
- **Engine**: Any
- **Function**: `src/features/palette/run-command.ts › plan(context, answers)`
- **Entry points**: a command chosen in Go to (`palette.open-result`); its key (`palette.key-press`); its entry of
  the system's menu bar on macOS (`@app-menu`).
- **Offered when**: Go to lists a command when its feature is for every engine, or for the engine of the current
  connection; with no connection current, only the commands for every engine. A command its own card says is not
  offered now (**Zoom in** at 200%, **Back** with no place before) is not listed either, and its key does nothing.
- **Plan**: none of its own: it sends the intent of the command's feature, started on the current connection
  (`nav.current-connection`), the active tab and what is selected in it. The feature then asks, in a dialog, for
  what it still needs: **Drop collection…** started on a collection tab is about that collection, and started on
  Home it asks which.
- **Danger**: None of its own: that of the feature it starts.
- **Read-only**: Allowed for the start; the feature it starts answers for itself, and refuses with its own message
  on a read-only connection.
- **Undo**: Cannot be undone as such: what is recorded is what the feature it starts does (`undo.record`).
- **After**: what the feature says. A refusal is shown as every refusal is (`runner.refuse`): a command that cannot
  run here says why, in words.
- **Rules**: a command started with a key and one started from Go to do exactly the same. A command is never started
  twice by a key held down: the repeats of the keyboard are ignored for every command but **Next tab**, **Previous
  tab**, **Back**, **Forward**, **Zoom in** and **Zoom out**.
- **Uses**: `palette.commands`, `nav.current-connection`, `runner.ask`, `runner.refuse`.
- **Ported from**: *New in Datardo*.

Acceptance:

- [ ] With a Redis connection current, `>` lists no command of a MongoDB area, and the commands of the window, of
  the tabs and of Home are all there.
- [ ] With no connection current, `>index` lists nothing.
- [ ] A command that needs a collection, started on Home with a MongoDB connection current, asks for the database
  and the collection in a dialog; started on a collection tab it asks for neither.
- [ ] A command that writes, started on a read-only connection, shows the refusal of its feature and sends nothing.
- [ ] Holding `Ctrl+W` down closes one tab, not all.
- [ ] Holding `Ctrl+Tab` down keeps moving through the tabs.

### `palette.key-press` — Which command a key starts

Decides what a key does, given where the focus is.

- **Kind**: Derivation
- **Engine**: Any
- **Function**: `src/features/palette/key-press.ts › commandFor(key, focus, state, platform)`
- **Inputs**: the key pressed, with `Ctrl`, `Shift`, `Alt` and `Cmd`; where the focus is (a place, and whether it
  is an editor or a text field); whether a dialog or Go to is open; the platform.
- **Output**: a command of `palette.commands`, or none, in which case the key goes to the control that has the
  focus.
- **Rules**, in order:
  1. A dialog is open: none. `Esc`, `Enter` and `Tab` are the dialog's (`nav.dialog`).
  2. Go to is open: `Ctrl+K` and `Esc` close it; the keys of its list are its own (`palette.open`); no other
     command.
  3. The key is a key of the place that has the focus: that command.
  4. The key is a key of the window: that command, wherever the focus is. An editor and a text field never use a key
     of the window for themselves.
  5. Otherwise none.

  On macOS the key is first read as the last column of the table of `palette.commands` says.
- **Invariants**: one key press starts at most one command; a key that types a character in a text field (a letter,
  a digit, a sign, alone or with `Shift`) never starts a command of the window.
- **Worked examples**:
  - `Ctrl+K`, focus in a cell of a table, nothing open → `palette.open`
  - `Ctrl+K`, Go to open → Go to closes
  - `Ctrl+W`, a confirmation open → none
  - `Alt+Left`, focus in the editor of a playground → `nav.back:back`
  - `Ctrl+B`, focus in the query bar → `nav.toggle-explorer`
  - `Ctrl+Z`, focus in the query bar → none: the editor undoes what was typed
  - `Delete`, focus on a tab of the strip → `tab.close`, the key of that place
  - `Delete`, focus in the query bar → none: the editor deletes a character
  - `Cmd+[` on macOS, focus anywhere, nothing open → `nav.back:back`
  - `F6`, Go to open → none
- **Uses**: `palette.commands`, `nav.dialog`.
- **Ported from**: *New in Datardo*.

Acceptance:

- [ ] Each worked example above gives exactly that result.
- [ ] `Ctrl+Shift+T` reopens the last closed tab with the focus in an editor, in a table, in the tree or on the
  rail.
- [ ] With a form open, no key of the table of `palette.commands` does anything outside the form.
- [ ] Typing `b` in the query bar types `b`; `Ctrl+B` there hides the explorer and types nothing.
- [ ] On macOS `Ctrl+Tab` goes to the next tab and `Cmd+Tab` is left to the system.
