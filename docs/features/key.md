# Keys

The keys of a Redis database: the keys tab with its pattern and its type filter, the scan that fills it a page at a
time, the details of a key in the inspector island, and what is done to whole keys: create, open, rename, copy, give
an expiry or make persistent, delete one, the selected ones or all those matching a pattern, export to a file and
import from one, and switch database. What a key holds is the area of values (`value.show`).

What every card of this area shares:

- **Database.** A keys tab belongs to one database of one connection. Every command of a card is sent on that
  database, through a client that selected it with `SELECT <n>`; confirmations and notifications name it (`db0`).
- **Names are bytes.** A key's name is shown as text when it is valid UTF-8 without control characters, and
  otherwise as `value.quote` writes it (`"user:\xff"`). In a step, a name is always written by `value.quote`.
- **A key that disappeared.** A key can be deleted or expire between two reads. A reply that says so (`TYPE` answers
  `none`, `PTTL` answers `-2`, `MEMORY USAGE` answers nil) marks its row **gone**: dimmed, with `—` in the other
  columns, out of the selection, until the next refresh drops it. A feature started on such a key refuses with *The
  key orders:42 no longer exists: it was deleted or it expired.* (`/gone`).
- **A key of a module's type.** `TYPE` answers a name that is none of `string`, `hash`, `list`, `set`, `zset`,
  `stream` (`ReJSON-RL`, `TSDB-TYPE`). The key is listed with that name as its type, and can be inspected, renamed,
  copied, given an expiry, made persistent, deleted, exported and imported. Its value is not shown: where the value
  would be, *Datardo does not show values of the type ReJSON-RL yet.*
- **Writes.** On a read-only connection the entries of a write are hidden, and the write refuses with *The
  connection Cache local is read-only.* (`/read-only`). Before the first step the runner keeps each key the plan
  names with `DUMP <key>` and `PTTL <key>` (`undo.record`); a key that does not exist is kept as missing, so that the
  undo deletes it. A confirmation ends with *It can be undone from the Undo history.*, or with why it cannot: *The
  undo history is off for this connection: this can't be undone.*, or *This can't be undone: the undo history keeps
  operations of up to 10,000 keys.* (the limits are those of `undo.limits`). When the dumps turn out larger than the
  undo history keeps for one operation (20 MB) while they are kept, the runner asks before the first step
  **\<Action\> without the possibility to undo?**, with the detail *The keys are more than 20 MB: too many for the
  undo history (settings `datardo.undo`).*, button **\<Action\> without undo**; the action is the button of the
  confirmation, or **Continue** for a write that has none. A write without a confirmation, with the undo history
  off, runs without asking and its notification has no **Undo**.

### `key.show` — The keys tab

The page of a keys tab: the keys of one database, or of one namespace of it, in a table that fills a page of the scan
at a time.

- **Kind**: View
- **Engine**: Redis
- **Function**: `src/features/key/show.ts › view(state)`
- **Entry points**: a click on a database or a namespace of the tree (`@tree`), which opens its keys tab, or makes it
  active when it is open already; **Open keys** in the context menu of the same nodes (`@tree-menu`); a pinned
  namespace (`@tree`); **Search** in the rail, on a Redis connection, which opens the keys tab of the database of the
  active tab, or of `db0`, with the focus in the pattern field (`@rail`); the database and the namespaces of the path
  (`@scope-bar`); Go to as **Open keys**; the tool `redis_open_keys` of the MCP server (`mcp.tab-tools`).
- **Offered when**: the connection is a Redis one. While it is not connected the page offers **Connect**
  (`connection.connect`).
- **Reads**: `key.scan` from cursor 0 when the tab opens, on `Enter` in the pattern field, when the type filter
  changes and on **Refresh**; `key.details` for the rows on screen.

The page shows, from the top:

1. The toolbar (`@toolbar`):
   - the pattern field, with the placeholder **Pattern or text, for example orders:\***. What is typed becomes the
     pattern through `key.pattern`; when it was a plain text, the pattern sent is shown at the right end of the field
     (`*orders*`). `Enter` starts a new scan; `Esc` puts back the text of the last scan. A tab opened on a namespace
     starts with the namespace's pattern (`orders:*`), a tab opened on a database with an empty field;
   - the type filter: **All types** (the default), **String**, **Hash**, **List**, **Set**, **Sorted set**,
     **Stream**;
   - **Scan more**, enabled while the scan is not complete; when it is, its tooltip reads *Every key was scanned.*;
   - **Refresh** (`F5`), which is `key.refresh`;
   - **New key** (`key.new`);
   - **More**: **Delete by pattern…** (`key.delete-by-pattern`), **Export keys…** (`key.export`), **Import keys…**
     (`key.import`).
2. The table, with the columns **Key**, **Type**, **Expiry** and **Size**. A row is a key. The type is one of
   **String**, **Hash**, **List**, **Set**, **Sorted set**, **Stream**, or the name a module gives. The expiry is the
   time left as `key.format-expiry` writes it, or `—` for a persistent key; the size is what `MEMORY USAGE` answers.
   Expiry and size are empty until `key.details` has read them. Only the rows on screen are drawn. The table holds
   at most 100,000 keys *(Datardo's choice)*: at that number **Scan more** is disabled and its tooltip reads
   *100,000 keys loaded: narrow the pattern to see others.*
3. On a row (`@table`): a click selects it and shows the key in the inspector island (`key.inspect`); a double click
   or `Enter` opens it (`key.open`); `F2` renames it; `Delete` deletes it; `Ctrl+C` copies its name. Its context
   menu (`@row-menu`), in order: **Open**, **Rename…**, **Copy to…**, **Set expiry…**, **Make persistent**, **Copy
   name**, **Export…**, **Pin** (`nav.pin`), **Delete key…**.

There is one keys tab for a database and one for each namespace opened; its path is that of the database or the
namespace (`Cache local / db0`, `Cache local / db0 / orders:`), whatever the pattern field holds now, and the
pattern and the type are kept with the tab. The status line (`nav.status-line`) counts: **500 of 1,204,331 keys**
while a scan with no pattern and no type is not complete, **1,204 keys** when it is; with a pattern or a type, **37
keys found · about 100,000 of 1,204,331 scanned**, then **37 of 1,204,331 keys** when the scan is complete.

States:

- loading: the toolbar, and a placeholder in the table until the first reply; a scan that goes on shows on the
  status line with **Cancel** (`runner.progress`). A new scan (a new pattern, a new type, **Refresh**) leaves the
  rows of the last one in place, dimmed once it has lasted 300 ms, until its first page comes; **Cancel** in the
  toolbar keeps its place, unseen, while no scan runs;
- empty database (`DBSIZE` answers 0): *db0 has no keys.*, with **New key** and **Import keys…** (`@empty-state`);
- nothing found, scan complete: *No keys match `orders:*`.*, or *No keys of type Hash match `orders:*`.* with a type;
- nothing found yet: *No keys found among the about 100,000 scanned of 1,204,331.*, with **Scan more**
  (`@empty-state`);
- error: the server's message, with **Retry**;
- read-only connection: no **New key**, no **Import keys…**, no **Delete by pattern…**, and no entry of a write in
  the menus.

- **Uses**: `key.scan`, `key.pattern`, `key.details`, `key.sort`, `key.select`, `key.refresh`, `key.inspect`,
  `key.open`, `key.new`, `key.rename`, `key.copy`, `key.set-expiry`, `key.persist`, `key.copy-name`, `key.delete`,
  `key.delete-selected`, `key.delete-by-pattern`, `key.export`, `key.import`, `key.switch-database`,
  `key.format-expiry`, `nav.pin`, `nav.status-line`, `nav.rail`, `mcp.tab-tools`, `connection.connect`.
- **Commands**: `key.show`
- **Ported from**: *New in Datardo*

Acceptance:

- [ ] A click on `db0` in the tree opens a keys tab with an empty pattern field and **All types**, and the first
  command sent is `SCAN 0 COUNT 500`.
- [ ] A click on the namespace `orders:` opens a keys tab whose pattern field reads `orders:*` and whose path is
  `Cache local / db0 / orders:`.
- [ ] Typing `orders` and `Enter` shows `*orders*` at the right end of the field and scans with `MATCH *orders*`.
- [ ] Typing in the pattern field sends nothing until `Enter`.
- [ ] Choosing **Hash** scans again from cursor 0 with `TYPE hash`.
- [ ] A database of 120 keys shows 120 rows, **120 keys** on the status line and **Scan more** disabled.
- [ ] A key of the type `ReJSON-RL` is a row whose type reads `ReJSON-RL`.
- [ ] On an empty database the page says *db0 has no keys.* and offers **New key**.
- [ ] On a read-only connection the toolbar has no **New key**, and the context menu of a row has neither
  **Rename…** nor **Delete key…**.
- [ ] With 100,000 keys loaded **Scan more** is disabled.

### `key.scan` — Scan the keys

Lists the keys of a database that match a pattern and a type, a page at a time, without ever blocking the server.

- **Kind**: Read
- **Engine**: Redis
- **Function**: `src/features/key/scan.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: none of its own: the keys tab (`key.show`) and **Scan more** (`@toolbar`, `@empty-state`). The
  tool `redis_scan_keys` of the MCP server lists keys in the same way, with numbers of its own (`mcp.server`).
- **Reads**: with the arguments database, pattern, type and cursor:
  - `SCAN <cursor> MATCH <pattern> TYPE <type> COUNT 500`. `MATCH` is left out when the pattern is `*`, `TYPE` when
    the filter is **All types**. `COUNT` is 500 *(Datardo's choice)*. `KEYS` is never sent;
  - with the reply, when no type is asked, one pipeline of `TYPE <key>` for each key it returned;
  - with the first call of a new scan (cursor 0), `DBSIZE`, the total the status line shows; and, when the text typed
    was plain (`key.pattern`), `TYPE <text>`: a key with exactly that name is the first row, before the scan finds it
    (with a type filter, only when its type is the one asked).
- **After**: the page calls it again with the cursor each reply gives, until one of:
  - the cursor is 0: the scan is complete;
  - this run found 500 keys or more *(Datardo's choice)*;
  - this run made 200 calls *(Datardo's choice)*, about 100,000 keys scanned.

  Then **Scan more** starts another run from the cursor it stopped at. A key the server returns twice is listed once.
  The number scanned is the calls made times 500, never more than `DBSIZE`, and is shown as *about*. **Cancel**
  stops after the call in flight; the keys found and the cursor are kept.
- **Refuses**: a server that does not accept `TYPE` in `SCAN`: *This server cannot filter keys by type.*
  (`/unsupported`), and the filter goes back to **All types**; a user without the permission: the server's error.
- **Uses**: `key.pattern`, `runner.progress`, `runner.cancel`, `mcp.server`.
- **Ported from**: *New in Datardo*

`SCAN` gives no snapshot: a key that is there for the whole scan is returned, one created or deleted while it runs
may or may not be. Keys arrive in the order of the server's table, which is no order (`key.sort`).

Acceptance:

- [ ] With the pattern `orders:*` and **All types**, the first command is `SCAN 0 MATCH orders:* COUNT 500`, and the
  next uses the cursor the reply gave.
- [ ] With the pattern `orders:*` and **Hash**, the command is `SCAN 0 MATCH orders:* TYPE hash COUNT 500` and no
  `TYPE <key>` is sent.
- [ ] With an empty pattern field the command is `SCAN 0 COUNT 500`.
- [ ] No feature of Datardo sends `KEYS`.
- [ ] A run stops at the first reply that brings the keys found in it to 500 or more, and **Scan more** continues
  from that reply's cursor.
- [ ] With a pattern that matches nothing in a database of 1,204,331 keys, the first run stops after 200 calls and
  the page says *No keys found among the about 100,000 scanned of 1,204,331.*
- [ ] A key returned by two replies is one row.
- [ ] Typing `orders:42`, the name of a hash, shows the row `orders:42` first, read with `TYPE orders:42`.
- [ ] **Cancel** during a run keeps the rows found, and **Scan more** continues.
- [ ] The total is what `DBSIZE` answered when the scan started.

### `key.pattern` — From what is typed to a pattern

Turns the text of the pattern field, or a namespace, into the pattern `SCAN … MATCH` receives, so that a plain word
finds the keys that contain it.

- **Kind**: Derivation
- **Engine**: Redis
- **Function**: `src/features/key/pattern.ts › pattern(input)`
- **Settings**: `datardo.key.separator`, which ends a namespace (`:` by default).
- **Uses**: used by `key.scan`, `key.show`, `key.delete-by-pattern`, `key.export`, and by the filters of
  `value.show`.
- **Ported from**: *New in Datardo*

Inputs: the text typed, or a namespace with its separator (`orders:`). Output: the pattern, and whether the text was
plain.

Rules:

1. A namespace gives its name, with `\` put before each `*`, `?`, `[`, `]` and `\` in it, followed by `*`.
2. An empty text gives `*`.
3. A text that contains `*`, `?`, `[` or `\` is a pattern and is sent as it is: `*` is any run of characters, `?`
   one character, `[ab]`, `[a-c]` and `[^a]` a set, `\` takes the next character literally.
4. Any other text is plain, and gives `*<text>*`.
5. Nothing is trimmed, and no letter changes case: names may hold spaces, and `MATCH` tells upper case from lower.
6. The pattern is sent as UTF-8.

Examples:

| Typed | Pattern | Plain |
| --- | --- | --- |
| (empty) | `*` | no |
| `orders` | `*orders*` | yes |
| `orders:` | `*orders:*` | yes |
| `orders:*` | `orders:*` | no |
| `user:?` | `user:?` | no |
| `user:[0-9]*` | `user:[0-9]*` | no |
| `50%` | `*50%*` | yes |
| `what\?` | `what\?` (the key named `what?`) | no |
| `a b` | `*a b*` | yes |
| `Orders` | `*Orders*` (does not find `orders:1`) | yes |
| the namespace `orders:` | `orders:*` | no |
| the namespace `a[1]:` | `a\[1\]:*` | no |

Acceptance:

- [ ] Each row of the table above gives its pattern.
- [ ] A pattern made from a namespace matches every key that starts with the namespace and no other.
- [ ] A text with a leading space keeps it in the pattern.

### `key.details` — Expiry and size of the rows on screen

Reads the expiry and the size of the keys the table shows, and of no other, so that a table of a hundred thousand
keys costs the server only what the user looks at.

- **Kind**: Read
- **Engine**: Redis
- **Function**: `src/features/key/details.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: none of its own: the table of the keys tab, 150 ms *(Datardo's choice)* after it stops
  scrolling, for the rows on screen that have not been read.
- **Reads**: one pipeline with `PTTL <key>` and `MEMORY USAGE <key>` for each of those keys. `MEMORY USAGE` is sent
  without `SAMPLES`, so the size of a large hash, list, set, sorted set or stream is the server's estimate from 5
  elements.
- **After**: what was read is kept for the tab until **Refresh**; a write of Datardo to a key drops what was read of
  it. `PTTL` `-1` is a persistent key (`—`); `-2`, or a nil size, marks the row **gone**. The expiry is kept as a
  date (the time of the read plus the `PTTL`), and the time left is counted again from the clock every second; at
  zero the cell reads **expired** and the key is read again.
- **Refuses**: nothing. When the server refuses `MEMORY USAGE` (an unknown command, no permission), the **Size**
  column shows `—` on every row, with the tooltip *This server does not report the size of a key.*, and the command
  is not sent again in this tab.
- **Uses**: `key.format-expiry`, `key.sort`.
- **Ported from**: *New in Datardo*

A size is written in bytes with units of 1,024: `512 B`, `1.2 KB`, `3.4 MB`, `1.1 GB`, one decimal from KB up.

Acceptance:

- [ ] After a scan of 500 keys with 30 rows on screen, 30 `PTTL` and 30 `MEMORY USAGE` are sent, in one pipeline.
- [ ] Scrolling through 2,000 rows without stopping sends nothing; 150 ms after stopping, the rows then on screen
  are read.
- [ ] Rows read once are not read again when they come back on screen.
- [ ] A key with `PTTL` 7,500,000 shows `2 h 5 min`; one with `-1` shows `—`.
- [ ] A key deleted by another client after the scan shows **gone** when its row is read, and leaves the selection.
- [ ] A key of 1,228 bytes shows `1.2 KB`.
- [ ] On a server that answers `ERR unknown command` to `MEMORY USAGE`, every size is `—` and no other `MEMORY
  USAGE` is sent.

### `key.sort` — Sort the loaded keys

Orders the rows of the keys tab by a column. Keys arrive in scan order, so a sort is always among the keys loaded so
far, and the page says so.

- **Kind**: Derivation
- **Engine**: Redis
- **Function**: `src/features/key/sort.ts › sortedKeys(rows, column, direction)`
- **Entry points**: a click on a column header of the table (`@table`): ascending, descending, then scan order
  again; **Sort ascending**, **Sort descending** and **Scan order** in the header's menu (`@column-menu`).
- **Uses**: `key.details`, `server.show`.
- **Ported from**: *New in Datardo*

Inputs: the rows loaded, in the order they arrived, with what `key.details` read of each; the column; the direction.
Output: the rows in order.

Rules:

1. With no column, the order is that of arrival: the scan's. The server cannot scan in any other order, so nothing
   but the loaded rows is ever sorted.
2. **Key**: by the bytes of the name, so that `Z` comes before `a`.
3. **Type**: by the type's name as `TYPE` gives it, then by key.
4. **Expiry**: by the date of expiry; persistent keys last when ascending, first when descending.
5. **Size**: by the bytes `MEMORY USAGE` answered; keys without a size last.
6. Rows marked **gone** are last in either direction. Equal rows keep their order of arrival.
7. Sorting by **Expiry** or **Size** needs both of every loaded key: `key.details` reads them all, 500 commands
   *(Datardo's choice)* a pipeline. It is offered up to 10,000 loaded keys *(Datardo's choice)*; beyond, the two
   headers do not sort and their tooltip reads *Too many keys to sort: narrow the pattern. The largest keys are on
   the Server page.*
8. While the scan is not complete, the toolbar shows *Sorted among the 500 keys loaded: scan the rest to sort them
   all.* Keys that **Scan more** brings are put in their place in the order.

Examples, with the rows `b` (string, 2 KB, persistent), `a` (hash, 1 KB, expires in 5 min), `C` (hash, 3 KB, expires
in 1 min), arrived in this order:

| Column, direction | Order |
| --- | --- |
| none | `b`, `a`, `C` |
| **Key**, ascending | `C`, `a`, `b` |
| **Type**, ascending | `C`, `a`, `b` |
| **Expiry**, ascending | `C`, `a`, `b` |
| **Expiry**, descending | `b`, `a`, `C` |
| **Size**, descending | `C`, `b`, `a` |

Acceptance:

- [ ] Each row of the table above gives its order.
- [ ] A third click on the **Key** header puts the rows back in the order they arrived.
- [ ] With 500 keys loaded of an unfinished scan, sorting shows *Sorted among the 500 keys loaded: scan the rest to
  sort them all.*
- [ ] Sorting 800 loaded keys by **Size** reads the size of the keys not read yet, in pipelines of 500 commands.
- [ ] With 10,001 keys loaded, a click on the **Size** header sorts nothing and its tooltip is the text of rule 7.
- [ ] After **Scan more**, the new keys appear in their place in the order, and the selection is kept.

### `key.select` — Select keys

Chooses the keys that the next action applies to, and shows what can be done with them.

- **Kind**: View
- **Engine**: Redis
- **Function**: `src/features/key/select.ts › view(state)`
- **Entry points**: on the table (`@table`): a click selects one row, `Ctrl` and a click adds or removes one,
  `Shift` and a click extends to it, `Ctrl+A` selects every loaded key, `Esc` clears.
- **Offered when**: the table has rows.

The selection is kept by key name: it survives sorting and **Scan more**. After **Refresh**, a new pattern or a new
type filter it keeps the keys the first run of the new scan finds, and the others leave it; a row marked **gone**
leaves it. `Ctrl+A` selects the keys loaded, not those the scan has not
reached. With one key selected the inspector island shows it (`key.inspect`); with none it reads **Nothing
selected** and *Select a key to see its value here.*; with several, **37 selected** and *Select one key to see its
value.*

While more than one key is selected, the selection bar (`@selection-bar`) shows **37 keys selected**, then **Copy
names** (`key.copy-name`), **Export…** (`key.export`), **Delete…** (`key.delete-selected`) and **Clear**. The same
entries are in the context menu of a selected row (`@row-menu`), as **Copy 37 names**, **Export 37 keys…** and
**Delete 37 keys…**, in place of the entries for one key. On a read-only connection there is no **Delete…**.

- **Uses**: `table.selection`, `key.copy-name`, `key.export`, `key.delete-selected`, `key.inspect`.
- **Ported from**: *New in Datardo*

Acceptance:

- [ ] A click on a row, then `Shift` and a click five rows below, selects six keys and shows **6 keys selected**.
- [ ] Sorting by **Key** keeps the same six keys selected.
- [ ] `Ctrl+A` with 500 keys loaded of 1,204,331 selects 500 keys.
- [ ] **Refresh** keeps selected the keys the first run finds, and a key deleted meanwhile leaves the selection.
- [ ] With one key selected there is no selection bar, and the inspector island shows that key; with three it
  reads **3 selected** and *Select one key to see its value.*
- [ ] On a read-only connection the selection bar has **Copy names** and **Export…** only, besides **Clear**.

### `key.refresh` — Refresh the keys tab

Scans again from the start with the same pattern and type, and forgets what was read of each key.

- **Kind**: Operation
- **Engine**: Redis
- **Function**: `src/features/key/refresh.ts › plan(context, answers)`
- **Entry points**: **Refresh** in the toolbar (`@toolbar`); `F5` in a keys tab; Go to as **Refresh keys**.
- **Offered when**: a keys tab is active.
- **Reads**: `key.scan` from cursor 0.
- **Plan**: no step on the deployment: the rows, the cursor, the sort's reads and what `key.details` read are
  dropped, and the scan starts again.
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone: there is nothing to undo.
- **After**: the sort column and direction, the pattern and the type are kept; the rows stay drawn until the first
  page comes; the selection keeps the keys the scan's first run finds; the inspector island reads the selected key
  again, and empties if the first run does not find it.
- **Commands**: `key.refresh`
- **Uses**: `key.scan`, `key.details`.
- **Ported from**: *New in Datardo*

Acceptance:

- [ ] `F5` sends `DBSIZE` and `SCAN 0 …` with the pattern and type of the last scan.
- [ ] After a refresh, the size of a row that was read before is read again when the row is on screen.
- [ ] A key deleted by another client is no longer a row after the refresh.
- [ ] The table stays sorted by the column it was sorted by.

### `key.inspect` — A key in the inspector island

Shows the selected key: what it is, when it expires, how much it takes, and its value in short.

- **Kind**: View
- **Engine**: Redis
- **Function**: `src/features/key/inspect.ts › view(state)`
- **Entry points**: selecting a row of the keys tab, or `Space` on it, which also shows the inspector island when
  the user had hidden it (`@table`).
- **Offered when**: exactly one key is selected.
- **Reads**: 150 ms *(Datardo's choice)* after the selection settles, one pipeline: `TYPE <key>`, `PTTL <key>`,
  `MEMORY USAGE <key>`, `OBJECT ENCODING <key>`; then the value, through `value.show` in its compact form.

The inspector island (`@inspector`) shows, in order:

1. the name, whole, on as many lines as it takes, with **Copy name** (`key.copy-name`);
2. **Type**: **String**, **Hash**, **List**, **Set**, **Sorted set**, **Stream**, or the name a module gives;
3. **Expiry**: the time left and the date, as `key.format-expiry` writes them (*in 2 h 5 min · 2026-11-18
   14:05:09*), counted again every second; or **Persistent**. Beside it **Set expiry…** (`key.set-expiry`) and, on a
   key with an expiry, **Make persistent** (`key.persist`);
4. **Size**: what `MEMORY USAGE` answers (`1.2 KB`), with the tooltip *The memory the key takes on the server, as
   MEMORY USAGE reports it; for a large value it is an estimate.*;
5. **Encoding**: what `OBJECT ENCODING` answers, as it is (`listpack`, `hashtable`, `quicklist`, `intset`,
   `skiplist`, `embstr`, `int`, `raw`, `stream`);
6. the count of what the key holds and its value, compact (`value.show`);
7. **Open in a tab** (`key.open`), **Rename…** (`key.rename`), **Copy to…** (`key.copy`), **Delete key…**
   (`key.delete`).

States: loading (the name and the labels of the lines at once, the rest when read; while another key is read, the
key shown before stays, dimmed once the read has lasted 300 ms, value included); a key that is gone (*The key orders:42 no longer exists: it
was deleted or it expired.*, and nothing else); a key of a module's type (the lines 1 to 5 and 7, and *Datardo does
not show values of the type ReJSON-RL yet.* in place of the value); a line the server refuses (`MEMORY USAGE`,
`OBJECT ENCODING` without the permission) reads `—`; on a read-only connection there are no **Set expiry…**, **Make
persistent**, **Rename…**, **Copy to…** and **Delete key…**. It is read again after every write of Datardo to the
key and on **Refresh**.

- **Uses**: `value.show`, `key.format-expiry`, `key.open`, `key.rename`, `key.copy`, `key.set-expiry`,
  `key.persist`, `key.copy-name`, `key.delete`, `nav.inspector`.
- **Ported from**: *New in Datardo*

Acceptance:

- [ ] Selecting the hash `user:7` sends `TYPE user:7`, `PTTL user:7`, `MEMORY USAGE user:7` and `OBJECT ENCODING
  user:7` in one pipeline, and shows **Hash**, **Persistent**, its size, `listpack` and its fields.
- [ ] A key with `PTTL` 7,500,000 read at 12:00:00 shows *in 2 h 5 min · 2026-11-18 14:05:00*, and one second later
  *in 2 h 4 min · 2026-11-18 14:05:00*.
- [ ] Moving through ten rows with the arrow keys in less than 150 ms each reads only the last one.
- [ ] A key deleted meanwhile shows *The key orders:42 no longer exists: it was deleted or it expired.*
- [ ] A key of the type `ReJSON-RL` shows its type, expiry, size and encoding, and *Datardo does not show values of
  the type ReJSON-RL yet.*
- [ ] On a read-only connection the island has **Copy name** and **Open in a tab** and no other button.
- [ ] After **Make persistent** the island shows **Persistent** without a refresh.

### `key.format-expiry` — The time left and the date of an expiry

Writes when a key expires as the user reads it: how long is left, and the date.

- **Kind**: Derivation
- **Engine**: Redis
- **Function**: `src/features/key/format-expiry.ts › expiryText(expiresAt, now)`
- **Uses**: used by `key.show`, `key.inspect`, `key.details`, `key.set-expiry`, `value.show`.
- **Ported from**: *New in Datardo*

Inputs: the date of expiry in milliseconds, or none; the current time. Outputs: the time left, and the date.

Rules:

1. No expiry: **Persistent** (the table shows `—`).
2. The time left is the date minus now. Zero or less: **expired**.
3. Less than a second: `< 1 s`. Less than a minute: seconds (`42 s`). Less than an hour: minutes and seconds (`5
   min 12 s`). Less than a day: hours and minutes (`2 h 5 min`). Otherwise days and hours (`3 d 4 h`, `812 d 3 h`).
4. Units are cut, not rounded, and a second unit of zero is left out (`2 h`, `5 min`, `3 d`).
5. The date is in the local time zone, as `2026-11-18 14:05:09`.
6. The inspector island joins them: *in 2 h 5 min · 2026-11-18 14:05:09*.

Examples, with now at 2026-11-18 12:00:00.000 local time:

| Time left in ms | Time left | Date |
| --- | --- | --- |
| none | **Persistent** | |
| 0 | **expired** | 2026-11-18 12:00:00 |
| 999 | `< 1 s` | 2026-11-18 12:00:00 |
| 42,900 | `42 s` | 2026-11-18 12:00:42 |
| 312,000 | `5 min 12 s` | 2026-11-18 12:05:12 |
| 300,000 | `5 min` | 2026-11-18 12:05:00 |
| 7,509,000 | `2 h 5 min` | 2026-11-18 14:05:09 |
| 7,200,000 | `2 h` | 2026-11-18 14:00:00 |
| 273,600,000 | `3 d 4 h` | 2026-11-21 16:00:00 |

Acceptance:

- [ ] Each row of the table above gives its two texts.
- [ ] 3,599,999 ms gives `59 min 59 s`, not `1 h`.

### `key.parse-duration` — A duration as the user types it

Reads the duration typed in **Set expiry** and in **New key** as a number of seconds.

- **Kind**: Derivation
- **Engine**: Redis
- **Function**: `src/features/key/parse-duration.ts › seconds(text)`
- **Uses**: used by `key.set-expiry` and `key.new`.
- **Ported from**: *New in Datardo*

Input: the text. Output: a whole number of seconds, 1 or more; or the error *Enter a duration, for example 90, 15m,
2h or 7d.*

Rules:

1. Spaces around the text and between its parts are ignored; letters are read in either case.
2. A whole number alone is seconds.
3. Otherwise the text is one or more parts, each a whole number followed by a unit: `s` (seconds), `m` or `min`
   (60), `h` (3,600), `d` (86,400), `w` (604,800). The parts are added.
4. Anything else is the error: an empty text, a sign, a decimal point, a unit alone, a total of 0.

Examples:

| Typed | Seconds |
| --- | --- |
| `90` | 90 |
| `90s` | 90 |
| `15m` | 900 |
| `15 min` | 900 |
| `2h` | 7,200 |
| `1h 30m` | 5,400 |
| `7d` | 604,800 |
| `1w2d` | 777,600 |
| `0`, `-5`, `1.5h`, `h`, `soon` | the error |

Acceptance:

- [ ] Each row of the table above gives its result.
- [ ] `2H` gives 7,200.

### `key.open` — Open a key in a key tab

Opens one key in a tab of its own, where its value has all the room of the main island.

- **Kind**: Operation
- **Engine**: Redis
- **Function**: `src/features/key/open.ts › plan(context, answers)`
- **Entry points**: a double click or `Enter` on a row of the keys tab (`@table`); **Open** in the row's context
  menu (`@row-menu`); **Open in a tab** in the inspector island (`@inspector`); a click on a pinned key of the tree
  (`@tree`); a key found in Go to (`palette.open`); Go to as **Open key…**, which asks the name; the tool
  `redis_open_key` of the MCP server (`mcp.tab-tools`).
- **Offered when**: the connection is connected.
- **Asks**: from **Open key…** only: the name of the key, in the database of the active tab.
- **Reads**: `TYPE <key>`, to know which view the tab has and that the key exists.
- **Plan**: an app step, `open the key tab orders:42 of db0 on Cache local` (`tab.open`). Nothing is sent that
  changes the deployment.
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone: there is nothing to undo; the tab is closed with `tab.close`.
- **After**: the tab is in the group of its connection, titled with the key's name, with the path `Cache local /
  db0 / orders: / 42`, and shows `value.show` in full. There is one key tab for a key: opening it again makes that tab
  active. A key of a module's type opens too, with its details and *Datardo does not show values of the type
  ReJSON-RL yet.*
- **Refuses**: a key that does not exist: *The key orders:42 no longer exists: it was deleted or it expired.*
  (`/gone`); from **Open key…**, *There is no key named orders:42 in db0.* (`/not-found`); *Cache local is not
  connected.* (`/not-connected`).
- **Commands**: `key.open`
- **Uses**: `tab.open`, `value.show`, `palette.open`, `mcp.tab-tools`.
- **Ported from**: *New in Datardo*

Acceptance:

- [ ] A double click on the row `orders:42` sends `TYPE orders:42` and opens a tab titled `orders:42` with the path
  `Cache local / db0 / orders: / 42`.
- [ ] Opening `orders:42` again makes its tab active and opens no other.
- [ ] `Enter` on a row marked **gone** opens nothing and says *The key orders:42 no longer exists: it was deleted or
  it expired.*
- [ ] **Open key…** with the name `nothing:here` says *There is no key named nothing:here in db0.*
- [ ] On a read-only connection the key opens, and its tab has no control that writes.
- [ ] The key tab of a key of the type `ReJSON-RL` shows no value.

### `key.new` — New key

Creates a key of a chosen type with its first value. A hash, a list, a set, a sorted set or a stream cannot exist
empty, so the form asks for the first field, element, member or entry.

- **Kind**: Operation
- **Engine**: Redis
- **Function**: `src/features/key/new.ts › plan(context, answers)`
- **Entry points**: **New key** in the toolbar of the keys tab (`@toolbar`) and on an empty database
  (`@empty-state`); **New key…** in the context menu of a database or a namespace of the tree (`@tree-menu`); Go to
  as **New key…**.
- **Offered when**: on a connection that is not read-only.
- **Asks**: the form **New key in db0**:
  - **Name**: starts with the namespace of the tab or of the node (`orders:`), empty on a database;
  - **Type**: **String** (the default), **Hash**, **List**, **Set**, **Sorted set**, **Stream**;
  - the first value, by type: **Value** for a string, which may be empty; **Field** and **Value** for a hash;
    **Element** for a list; **Member** for a set; **Member** and **Score** (default `0`) for a sorted set; **ID**
    (default `*`, the server gives it), **Field** and **Value** for a stream. Each value is typed as text, JSON or
    hexadecimal (`value.typed-bytes`);
  - **Expiry**: **None** (the default), **In** with a duration (`key.parse-duration`), or **On** with a date and
    time;
  - the button **Create**.
- **Reads**: `EXISTS <name>`, to refuse a name that is taken before anything is written.
- **Plan**: by type, with the arguments written by `value.quote`:
  - string: `SET orders:42 hello NX`; with an expiry `SET orders:42 hello NX EX 3600` or `SET orders:42 hello NX PXAT
    1796083200000`;
  - hash: `HSET user:7 name Ada`; list: `RPUSH queue:mail welcome`; set: `SADD tags redis`; sorted set: `ZADD board 0
    ada`; stream: `XADD events * type signup`;
  - with an expiry, any type but string runs as `MULTI`, the command above, `EXPIRE user:7 3600` or `PEXPIREAT user:7
    1796083200000`, `EXEC`, so that the key is never left without its expiry.
- **Danger**: None.
- **Read-only**: Refused on a read-only connection (`/read-only`).
- **Undo**: Recorded in the undo history (`undo.record`) as `New hash user:7`: the key is kept as missing, and the
  undo deletes it.
- **After**: *Created the hash user:7 in db0.*, with **Undo** and **Open**. In a keys tab whose pattern and type
  the key matches, it becomes the first row, selected; the tree is refreshed (`tree.refresh`).
- **Refuses**: an empty name: *Enter the name of the key.* (`/invalid`); a name that exists: *A key named user:7
  already exists.* (`/exists`), under the field, with the form still open; `SET … NX` that answers nil: *Not created:
  a key named orders:42 was created meanwhile.* (`/exists`); a value that cannot be read (`value.typed-bytes`), a
  score that is not a number, `inf` or `-inf`, a duration that cannot be read, a date in the past (*The date is in
  the past: the key would be deleted at once.*), an ID the server refuses: each under its field (`/invalid`).
  On a read-only connection: *The connection Cache local is read-only.* (`/read-only`).
- **Commands**: `key.new`
- **Settings**: `datardo.undo.*` (whether it is recorded).
- **Uses**: `value.typed-bytes`, `value.quote`, `key.parse-duration`, `undo.record`, `undo.notification`,
  `tree.refresh`, `key.open`, `connection.read-only`.
- **Ported from**: *New in Datardo*

Acceptance:

- [ ] **New key** in the tab of the namespace `orders:` opens the form with **Name** `orders:` and **Type**
  **String**.
- [ ] A string `orders:42` with the value `hello` and no expiry sends `EXISTS orders:42`, then `SET orders:42 hello
  NX`.
- [ ] A string with the expiry **In** `1h` sends `SET orders:42 hello NX EX 3600`.
- [ ] A hash `user:7` with the field `name`, the value `Ada` and the expiry **In** `1h` sends `MULTI`, `HSET user:7
  name Ada`, `EXPIRE user:7 3600`, `EXEC`.
- [ ] A sorted set `board` with the member `ada` and the default score sends `ZADD board 0 ada`.
- [ ] A stream `events` with the default ID, the field `type` and the value `signup` sends `XADD events * type
  signup`.
- [ ] A string with an empty value is created, with `SET orders:42 "" NX`.
- [ ] A name that exists shows *A key named user:7 already exists.* under **Name**, and nothing is written.
- [ ] **Undo** in the notification deletes the new key.
- [ ] On a read-only connection there is no **New key**, and the command says *The connection Cache local is
  read-only.*

### `key.rename` — Rename a key

Gives a key another name, keeping its value and its expiry, without ever replacing another key unless the user says
so.

- **Kind**: Operation
- **Engine**: Redis
- **Function**: `src/features/key/rename.ts › plan(context, answers)`
- **Entry points**: **Rename…** in the context menu of a row (`@row-menu`), in the inspector island (`@inspector`)
  and in the toolbar of a key tab (`@toolbar`); `F2` on a row (`@table`); Go to as **Rename key…**.
- **Offered when**: on a connection that is not read-only, with one key selected or a key tab active; also on a key
  of a module's type.
- **Asks**: the new name, in a dialog titled **Rename orders:42**, starting with the present name. When a key with
  the new name exists: **A key named orders:43 already exists. Replace it?**, with the detail *Its value and its
  expiry are lost: orders:43 becomes what orders:42 is now.* and the line about the undo, button **Replace**.
- **Reads**: `EXISTS <new name>`.
- **Plan**: `RENAMENX orders:42 orders:43`. After **Replace**: `RENAME orders:42 orders:43`.
- **Danger**: None. Confirm when a key is replaced: the text above, button **Replace**.
- **Read-only**: Refused on a read-only connection (`/read-only`).
- **Undo**: Recorded in the undo history (`undo.record`) as `Rename orders:42 to orders:43`, keeping both keys: the
  undo puts the old one back and deletes the new one, or puts back the one that was replaced.
- **After**: *Renamed orders:42 to orders:43.*, with **Undo**. The row keeps its place with the new name and stays
  selected; an open key tab of the key takes the new name and path; a pin of the key follows it (`nav.pin`); the tree
  is refreshed.
- **Refuses**: an empty name, or the same name: *Enter a different name.* (`/invalid`); `RENAMENX` that answers 0:
  *Not renamed: a key named orders:43 was created meanwhile.* (`/exists`), and nothing has changed; `ERR no such
  key`: the text of a key that is gone (`/gone`).
  On a read-only connection: *The connection Cache local is read-only.* (`/read-only`).
- **Commands**: `key.rename`
- **Settings**: `datardo.undo.*` (whether it is recorded).
- **Uses**: `undo.record`, `undo.notification`, `nav.pin`, `tree.refresh`, `connection.read-only`.
- **Ported from**: *New in Datardo*

`RENAMENX` is used, and not `RENAME`, because `RENAME` deletes whatever has the new name without a word. Replacing a
large key frees it while the server waits, as `DEL` does.

Acceptance:

- [ ] Renaming `orders:42` to the free name `orders:43` sends `EXISTS orders:43`, then `RENAMENX orders:42
  orders:43`, and says *Renamed orders:42 to orders:43.*
- [ ] A key that expires in an hour still expires in an hour under its new name.
- [ ] With `orders:43` existing, the question **A key named orders:43 already exists. Replace it?** is asked;
  closing it writes nothing; **Replace** sends `RENAME orders:42 orders:43`.
- [ ] A key created with the new name between the read and the write gives *Not renamed: a key named orders:43 was
  created meanwhile.*, and both keys are as they were.
- [ ] After a replace, **Undo** puts back `orders:42` and the `orders:43` that was replaced, each with its expiry.
- [ ] An open key tab of `orders:42` is titled `orders:43` after the rename.
- [ ] A key of the type `ReJSON-RL` can be renamed.
- [ ] On a read-only connection `F2` does nothing.

### `key.copy` — Copy a key

Makes a copy of a key, with its value and its expiry, under another name or in another database of the same server.

- **Kind**: Operation
- **Engine**: Redis
- **Function**: `src/features/key/copy.ts › plan(context, answers)`
- **Entry points**: **Copy to…** in the context menu of a row (`@row-menu`), in the inspector island (`@inspector`)
  and in the toolbar of a key tab (`@toolbar`); Go to as **Copy key to…**.
- **Offered when**: on a connection that is not read-only, with one key selected or a key tab active.
- **Asks**: the form **Copy orders:42**: **To**, the name of the copy, starting with the present name; **Database**,
  the databases of the server as `key.switch-database` lists them, starting with the present one; the button
  **Copy**. When the destination exists: **A key named orders:42 already exists in db1. Replace it?**, with the
  detail *Its value and its expiry are lost.* and the line about the undo, button **Replace**.
- **Reads**: `EXISTS <name>` on the destination's database.
- **Plan**: `COPY orders:42 orders:42-old` in the same database; `COPY orders:42 orders:42 DB 1` to another; with
  `REPLACE` at the end after **Replace**.
- **Danger**: None. Confirm when a key is replaced: the text above, button **Replace**.
- **Read-only**: Refused on a read-only connection (`/read-only`).
- **Undo**: Recorded in the undo history (`undo.record`) as `Copy orders:42 to orders:42-old`, or `Copy orders:42
  to db1`, keeping the destination key in its database: the undo deletes the copy, or puts back what it replaced.
- **After**: *Copied orders:42 to orders:42-old.*, or *Copied orders:42 to orders:42 in db1.*, with **Undo**; a
  keys tab of the destination that the copy matches shows it after its next refresh; the tree is refreshed.
- **Refuses**: the same name in the same database: *Enter a different name or choose another database.*
  (`/invalid`); `COPY` that answers 0: *Not copied: orders:42 no longer exists, or a key named orders:42-old was
  created meanwhile.* (`/not-copied`); a server without `COPY`: *This server has no COPY command.* (`/unsupported`);
  a module's type that cannot be copied: the server's error.
  On a read-only connection: *The connection Cache local is read-only.* (`/read-only`).
- **Commands**: `key.copy`
- **Settings**: `datardo.undo.*` (whether it is recorded).
- **Uses**: `key.switch-database`, `undo.record`, `undo.notification`, `tree.refresh`, `connection.read-only`.
- **Ported from**: *New in Datardo*

`COPY` is in Redis since 6.2, the oldest server Datardo speaks to; a compatible server that lacks it is refused as
above, and nothing is put together from other commands in its place.

Acceptance:

- [ ] Copying `orders:42` to `orders:42-old` sends `EXISTS orders:42-old`, then `COPY orders:42 orders:42-old`.
- [ ] Copying it to `db1` with the same name sends `COPY orders:42 orders:42 DB 1`.
- [ ] The copy of a key that expires in an hour expires in an hour.
- [ ] With the destination existing, **Replace** sends `COPY orders:42 orders:42 DB 1 REPLACE`; closing the
  question writes nothing.
- [ ] The same name with the same database is refused with *Enter a different name or choose another database.*
- [ ] **Undo** after a copy to `db1` deletes the copy in `db1` and leaves `db0` as it is.
- [ ] A server that answers `ERR unknown command` says *This server has no COPY command.*

### `key.set-expiry` — Set the expiry of a key

Makes a key expire after a time, or at a date.

- **Kind**: Operation
- **Engine**: Redis
- **Function**: `src/features/key/set-expiry.ts › plan(context, answers)`
- **Entry points**: **Set expiry…** in the context menu of a row (`@row-menu`), in the inspector island
  (`@inspector`) and in the toolbar of a key tab (`@toolbar`); Go to as **Set expiry…**.
- **Offered when**: on a connection that is not read-only, with one key selected or a key tab active; also on a key
  of a module's type.
- **Asks**: the form **Set expiry of orders:42**, which says the present expiry (*Now: in 2 h 5 min · 2026-11-18
  14:05:09*, or *Now: persistent*): **In**, a duration (`key.parse-duration`), the default choice, empty; or
  **On**, a date and time in the local time zone, starting with the present date of expiry, or with one hour from
  now; the button **Set expiry**.
- **Reads**: nothing more: the present expiry is the one `key.inspect` read.
- **Plan**: for **In**, `EXPIRE orders:42 3600`; for **On**, `PEXPIREAT orders:42 1796083200000`, the date in
  milliseconds since 1970 UTC.
- **Danger**: None.
- **Read-only**: Refused on a read-only connection (`/read-only`).
- **Undo**: Recorded in the undo history (`undo.record`) as `Set expiry of orders:42`; the undo puts the key back
  with the expiry it had, also after it has expired.
- **After**: *orders:42 expires in 1 h.*, with **Undo**; the row, the inspector island and an open key tab show the
  new expiry.
- **Refuses**: a duration that cannot be read: *Enter a duration, for example 90, 15m, 2h or 7d.* (`/invalid`); a
  date that is not after now: *The date is in the past: the key would be deleted at once. Use Delete key instead.*
  (`/invalid`); a command that answers 0: the text of a key that is gone (`/gone`).
  On a read-only connection: *The connection Cache local is read-only.* (`/read-only`).
- **Commands**: `key.set-expiry`
- **Settings**: `datardo.undo.*` (whether it is recorded).
- **Uses**: `key.parse-duration`, `key.format-expiry`, `key.inspect`, `undo.record`, `undo.notification`,
  `connection.read-only`.
- **Ported from**: *New in Datardo*

Acceptance:

- [ ] **In** `1h` on `orders:42` sends `EXPIRE orders:42 3600` and says *orders:42 expires in 1 h.*
- [ ] **On** 2026-12-01 00:00:00 UTC sends `PEXPIREAT orders:42 1796083200000`.
- [ ] `0` and `1.5h` are refused with *Enter a duration, for example 90, 15m, 2h or 7d.*, and nothing is sent.
- [ ] A date one minute ago is refused with the text of the past date.
- [ ] On a key that expired meanwhile, `EXPIRE` answers 0 and the message is *The key orders:42 no longer exists:
  it was deleted or it expired.*
- [ ] **Undo** on a key that was persistent makes it persistent again.
- [ ] A key of the type `ReJSON-RL` can be given an expiry.

### `key.persist` — Make a key persistent

Removes the expiry of a key, so that the server no longer deletes it.

- **Kind**: Operation
- **Engine**: Redis
- **Function**: `src/features/key/persist.ts › plan(context, answers)`
- **Entry points**: **Make persistent** in the context menu of a row (`@row-menu`), in the inspector island
  (`@inspector`) and in the toolbar of a key tab (`@toolbar`); Go to as **Make key persistent**.
- **Offered when**: on a connection that is not read-only, on a key that has an expiry; also on a key of a module's
  type.
- **Asks**: nothing.
- **Plan**: `PERSIST orders:42`.
- **Danger**: None.
- **Read-only**: Refused on a read-only connection (`/read-only`).
- **Undo**: Recorded in the undo history (`undo.record`) as `Make orders:42 persistent`; the undo gives the key the
  time it had left when it was made persistent.
- **After**: *orders:42 no longer expires.*, with **Undo**; the row and the inspector island show `—` and
  **Persistent**. When `PERSIST` answers 0, the key is read again: gone, the text of a key that is gone (`/gone`);
  already persistent, *orders:42 is already persistent.*
- **Refuses**: a read-only connection: *The connection Cache local is read-only.* (`/read-only`); `PERSIST` that answers 0 on a key that is
  gone: the text of a key that is gone (`/gone`).
- **Commands**: `key.persist`
- **Settings**: `datardo.undo.*` (whether it is recorded).
- **Uses**: `undo.record`, `undo.notification`, `connection.read-only`.
- **Ported from**: *New in Datardo*

Acceptance:

- [ ] **Make persistent** on `orders:42` sends `PERSIST orders:42` and says *orders:42 no longer expires.*
- [ ] The entry is not in the menu of a key without an expiry.
- [ ] On a key made persistent by another client meanwhile, the message is *orders:42 is already persistent.*
- [ ] **Undo** on a key that had 90 seconds left gives it 90 seconds again.
- [ ] On a read-only connection there is no **Make persistent**.

### `key.delete` — Delete a key

Deletes one key, after a confirmation.

- **Kind**: Operation
- **Engine**: Redis
- **Function**: `src/features/key/delete.ts › plan(context, answers)`
- **Entry points**: **Delete key…** in the context menu of a row (`@row-menu`), in the inspector island
  (`@inspector`) and in the toolbar of a key tab (`@toolbar`); `Delete` on a row while one row is selected
  (`@table`); Go to as **Delete key…**.
- **Offered when**: on a connection that is not read-only, with one key selected or a key tab active; also on a key
  of a module's type.
- **Asks**: the confirmation.
- **Reads**: nothing more: the type and the size are those `key.inspect` or `key.details` read, when they did.
- **Plan**: `UNLINK orders:42`.
- **Danger**: Confirm: **Delete key orders:42 from db0?**, with the detail *A hash, 1.2 KB.* and the line about
  the undo (*It can be undone from the Undo history.*, or why it cannot), button **Delete**.
- **Read-only**: Refused on a read-only connection (`/read-only`).
- **Undo**: Recorded in the undo history (`undo.record`) as `Delete key orders:42`, with the key and its expiry;
  a key whose dump is larger than the undo history keeps is asked about as **Delete without the possibility to
  undo?**, button **Delete without undo**.
- **After**: *Deleted key orders:42 from db0.*, with **Undo**; the row leaves the table; an open key tab of the key
  closes (`tab.close`); the tree is refreshed. When `UNLINK` answers 0: *Key not found: it may have been deleted
  already, or have expired.*, and the row leaves the table.
- **Refuses**: a read-only connection: *The connection Cache local is read-only.* (`/read-only`).
- **Commands**: `key.delete`
- **Settings**: `datardo.undo.*` (whether it is recorded).
- **Uses**: `runner.confirm`, `undo.record`, `undo.limits`, `undo.notification`, `tab.close`, `tree.refresh`,
  `connection.read-only`.
- **Ported from**: *New in Datardo*

`UNLINK` is sent, never `DEL`: both remove the name at once and answer the same, but `DEL` frees the value while the
server waits, which for a key of millions of items stops every client for that time, and `UNLINK` frees it in
another thread. Every server Datardo speaks to has it (Redis 4.0).

Acceptance:

- [ ] **Delete key…** on the hash `orders:42` asks **Delete key orders:42 from db0?** with *A hash, 1.2 KB. It can
  be undone from the Undo history.*; **Delete** sends `UNLINK orders:42` and the row leaves the table.
- [ ] Closing the confirmation sends nothing.
- [ ] With the undo history off for the connection, the confirmation says *The undo history is off for this
  connection: this can't be undone.*
- [ ] A key deleted meanwhile by another client gives *Key not found: it may have been deleted already, or have
  expired.*
- [ ] **Undo** in the notification puts the key back with its value, its type and the time it had left.
- [ ] A key whose dump takes more than 20 MB asks **Delete without the possibility to undo?**; closing it deletes
  nothing.
- [ ] On a read-only connection `Delete` does nothing and the menu has no **Delete key…**.
- [ ] Datardo never sends `DEL` for this.

### `key.delete-selected` — Delete the selected keys

Deletes the keys selected in the table, after one confirmation.

- **Kind**: Operation
- **Engine**: Redis
- **Function**: `src/features/key/delete-selected.ts › plan(context, answers)`
- **Entry points**: **Delete…** in the selection bar (`@selection-bar`); **Delete 37 keys…** in the context menu of
  a selected row (`@row-menu`); `Delete` while more than one row is selected (`@table`). A selection of one key is
  `key.delete`.
- **Offered when**: on a connection that is not read-only, with more than one key selected.
- **Asks**: the confirmation.
- **Plan**: `UNLINK <key> <key> …`, 500 names *(Datardo's choice)* a command, in the order of the table.
- **Danger**: Confirm, when the delete is recorded: **Delete 37 keys from db0?**, with the detail *The 37 keys
  selected in the table. It can be undone from the Undo history.*, button **Delete**. Destructive, when it cannot
  be: the keys are lost for good, the detail says why it cannot be undone, and the user types the number of keys,
  `37`.
- **Read-only**: Refused on a read-only connection (`/read-only`).
- **Undo**: Recorded in the undo history (`undo.record`) as `Delete 37 keys`, within the limits of `undo.limits`.
  Cannot be undone beyond them, or with the undo history off: the confirmation says so.
- **After**: *Deleted 37 keys from db0.*, or *Deleted 35 of 37 keys from db0: the others were already gone.*, with
  **Undo** when recorded; the rows leave the table and the selection is cleared; open key tabs of those keys close;
  the tree is refreshed.
- **Refuses**: a read-only connection: *The connection Cache local is read-only.* (`/read-only`).
- **Commands**: `key.delete-selected`
- **Settings**: `datardo.undo.*` (whether it is recorded).
- **Uses**: `key.select`, `key.delete`, `runner.confirm`, `runner.progress`, `undo.record`, `undo.limits`,
  `undo.notification`, `tree.refresh`, `connection.read-only`.
- **Ported from**: *New in Datardo*

Acceptance:

- [ ] With 3 keys selected, `Delete` asks **Delete 3 keys from db0?**; **Delete** sends one `UNLINK` with the three
  names.
- [ ] With 1,200 keys selected, three `UNLINK` are sent, of 500, 500 and 200 names.
- [ ] When one of 3 keys was gone already, the message is *Deleted 2 of 3 keys from db0: the others were already
  gone.*
- [ ] With 10,001 keys selected, the confirmation says *This can't be undone: the undo history keeps operations of
  up to 10,000 keys.* and the button is disabled until `10001` is typed.
- [ ] **Undo** puts the 3 keys back, each with its expiry.
- [ ] On a read-only connection there is no **Delete…** in the selection bar, and `Delete` does nothing.

### `key.delete-by-pattern` — Delete the keys matching a pattern

Deletes every key of a database that matches a pattern, and a type if one is chosen, however many they are.

- **Kind**: Operation
- **Engine**: Redis
- **Function**: `src/features/key/delete-by-pattern.ts › plan(context, answers)`
- **Entry points**: **Delete by pattern…** under **More** in the toolbar of the keys tab (`@toolbar`); **Delete
  keys by pattern…** in the context menu of a database or a namespace of the tree (`@tree-menu`); Go to as **Delete
  keys by pattern…**.
- **Offered when**: on a connection that is not read-only.
- **Asks**: the form **Delete by pattern in db0**: **Pattern**, starting with the pattern of the tab as it was sent
  (`*orders*`), or with the namespace's (`orders:*`); here what is typed is sent as it is, and a text without `*`,
  `?` or `[` names one key; **Type**, starting with the tab's; the button **Count the keys**. Then the
  confirmation.
- **Reads**: every key that matches, with `SCAN <cursor> MATCH <pattern> TYPE <type> COUNT 500` as `key.scan` sends
  it, from cursor 0 until the cursor is 0 again, with the work in progress on the status line (*Counting the keys
  matching `session:*`: 1,200 found, about 40% scanned*) and **Cancel**. The names are kept when the delete is to
  be recorded, and only counted beyond the number of keys the undo history keeps in one operation.
- **Plan**:
  - when the delete is recorded: `UNLINK <key> <key> …`, 500 names a command, for the names the count found;
  - when it is not: `SCAN 0 MATCH session:* COUNT 500`, repeated with the cursor of each reply until it is 0, and
    after each reply `UNLINK` with the keys of that reply.
- **Danger**: Destructive: every key that matches is lost. The confirmation is titled **Delete every key matching
  `session:*` in db0 of Cache local?**, says *1,832 keys match now, of 1,204,331 in db0.*, then, when the delete is
  not recorded, *Keys that match when the delete runs are deleted too.*, then the line about the undo, and shows the
  steps. The user types the pattern, `session:*`; the button reads **Delete 1,832 keys**. With the pattern `*` and
  no type, the title is **Delete every key of db0 of Cache local?**
- **Read-only**: Refused on a read-only connection (`/read-only`).
- **Undo**: Recorded in the undo history (`undo.record`) as `Delete keys matching session:*`, when the keys are no
  more than the undo history keeps in one operation (10,000) and their dumps no larger than it keeps (20 MB).
  Cannot be undone beyond that, or with the undo history off: the confirmation says so, and a size found too large
  while the keys are kept is asked about before anything is deleted (**Delete without the possibility to undo?**).
- **After**: *Deleted 1,832 keys matching `session:*` from db0.*, with **Undo** when recorded; the keys tab and the
  tree are refreshed; open key tabs of deleted keys close. **Cancel** while it runs stops after the command in
  flight: *Stopped: 900 keys matching `session:*` were deleted from db0.*; when recorded, **Undo** puts those back.
- **Refuses**: an empty pattern: *Enter a pattern, for example session:\*.* (`/invalid`); no key found: *No keys
  match `session:*`: nothing to delete.* (`/nothing`); a count that is cancelled deletes nothing.
  On a read-only connection: *The connection Cache local is read-only.* (`/read-only`).
- **Commands**: `key.delete-by-pattern`
- **Settings**: `datardo.undo.*` (whether it is recorded).
- **Uses**: `key.scan`, `key.pattern`, `runner.confirm`, `runner.progress`, `runner.cancel`, `undo.record`,
  `undo.limits`, `undo.notification`, `key.refresh`, `tree.refresh`, `connection.read-only`.
- **Ported from**: *New in Datardo*

Acceptance:

- [ ] From a tab whose field reads `orders`, the form starts with the pattern `*orders*`.
- [ ] Typing `orders` in the form counts with `MATCH orders`, and finds at most the key named `orders`.
- [ ] With 1,832 keys matching `session:*`, the confirmation says *1,832 keys match now, of 1,204,331 in db0.* and
  *It can be undone from the Undo history.*; its button is disabled until `session:*` is typed.
- [ ] Confirming sends four `UNLINK`, of 500, 500, 500 and 332 names, and no `KEYS`, `DEL` or `FLUSHDB`.
- [ ] With 25,000 keys matching, the confirmation says *This can't be undone: the undo history keeps operations of
  up to 10,000 keys.*, and the delete scans again from `SCAN 0 MATCH session:* COUNT 500`, sending one `UNLINK` after
  each reply that has keys.
- [ ] A key matching `session:*` that is created after the count is still there after a recorded delete.
- [ ] With **Hash** chosen, a string named `session:1` is not deleted.
- [ ] **Undo** puts the 1,832 keys back, each with its value and its expiry.
- [ ] **Cancel** during the count deletes nothing; a pattern that matches nothing says *No keys match `session:*`:
  nothing to delete.*
- [ ] On a read-only connection there is no **Delete by pattern…**.

### `key.copy-name` — Copy the name of a key

Puts the name of a key, or of the selected keys, on the clipboard.

- **Kind**: Operation
- **Engine**: Redis
- **Function**: `src/features/key/copy-name.ts › plan(context, answers)`
- **Entry points**: **Copy name** in the context menu of a row (`@row-menu`), in the inspector island
  (`@inspector`) and in the toolbar of a key tab (`@toolbar`); `Ctrl+C` on a row (`@table`); **Copy names** in the
  selection bar (`@selection-bar`); Go to as **Copy key name**.
- **Offered when**: a key is selected, or a key tab is active.
- **Plan**: no step: what follows copies.
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone: there is nothing to undo.
- **After**: the clipboard holds the name, as text when it is valid UTF-8 without control characters, and as
  `value.quote` writes it otherwise; several names are one a line, in the order of the table. The status line says
  **Copied**.
- **Commands**: `key.copy-name`
- **Uses**: `value.quote`, `key.select`.
- **Ported from**: *New in Datardo*

Acceptance:

- [ ] `Ctrl+C` on the row `orders:42` puts `orders:42` on the clipboard.
- [ ] A name with a space, `my key`, is copied as `my key`, without quotes.
- [ ] A name with the bytes `75 73 65 72 3a ff` is copied as `"user:\xff"`.
- [ ] **Copy names** with three keys selected copies three lines, in the order of the table.
- [ ] It works on a read-only connection.

### `key.export` — Export keys to a file

Writes keys to a file of Redis commands that creates them again: on this server, on another, with Datardo or with
`redis-cli`.

- **Kind**: Operation
- **Engine**: Redis
- **Function**: `src/features/key/export.ts › plan(context, answers)`
- **Entry points**: **Export keys…** under **More** in the toolbar of the keys tab (`@toolbar`); **Export…** in the
  context menu of a row (`@row-menu`) and in the selection bar (`@selection-bar`); **Export keys…** in the context
  menu of a database or a namespace of the tree (`@tree-menu`); Go to as **Export keys…**.
- **Offered when**: the connection is connected.
- **Asks**: what to export, when keys are selected: **The 37 selected keys** (the default then) or **Every key
  matching `orders:*`**, with the type when the tab has one; then the file, with the system's file dialog, named
  `cache-local-db0.redis` after the connection and the database.
- **Reads**: the keys, for a pattern with `SCAN` as `key.scan` sends it, to the end. Then, key by key:
  - `TYPE <key>`, and the expiry: `PEXPIRETIME <key>` on Redis 7.0 or later; on an older server `PTTL <key>`, added
    to the time of the read;
  - the value, a page of 500 items *(Datardo's choice)* at a time: `STRLEN` and `GET`, or `GETRANGE` in parts of
    1,048,576 bytes *(Datardo's choice)* for a longer string;
    `HSCAN <key> <cursor> COUNT 500`; `LRANGE <key> <start> <stop>`, 500 elements a page; `SSCAN <key> <cursor>
    COUNT 500`; `ZRANGE <key> <start> <stop> WITHSCORES`, 500 members a page; `XRANGE <key> - + COUNT 500`, then
    `XRANGE <key> (<last ID> + COUNT 500`;
  - `DUMP <key>` for a key of a module's type and for a stream without entries.
- **Plan**: a file step, `write C:\exports\cache-local-db0.redis`, in the format of `key.export-text`. The file is
  written beside its place as `cache-local-db0.redis.part` and renamed when it is complete.
- **Danger**: None. A file that exists is asked about by the system's file dialog.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone: it writes a file, which the user can delete.
- **After**: the work in progress on the status line (*Exporting keys: 1,200 of 1,832*) with **Cancel**, which
  deletes the part written; then *Exported 1,832 keys to C:\exports\cache-local-db0.redis.*, with **Show in
  folder**. A key that is gone when its turn comes is left out: *Exported 1,830 of 1,832 keys to …: the others were
  already gone.*
- **Refuses**: nothing to export: *No keys match `orders:*`: nothing to export.* (`/nothing`); a file that cannot
  be written: the system's error.
- **Commands**: `key.export`
- **Uses**: `key.export-text`, `key.scan`, `key.select`, `runner.progress`, `runner.cancel`, `key.import`.
- **Ported from**: *New in Datardo*

What the file does not keep, and the result says when it applies: the consumer groups of a stream and its last
generated ID (*Consumer groups of streams are not exported.*), and the expiry of single fields of a hash (Redis 7.4).
The export is not a snapshot: a value that changes while its pages are read is written as it was read.

Acceptance:

- [ ] Exporting the selected keys `session:1` and `user:7` writes a file with the lines of `key.export-text` for
  those two keys, in the order of the table.
- [ ] Exporting by the pattern `orders:*` scans to the end before the first key is read.
- [ ] On Redis 7.2 the expiry is read with `PEXPIRETIME`; on 6.2 with `PTTL`.
- [ ] A string of 3 MB is read with three `GETRANGE` of 1,048,576 bytes.
- [ ] A key of the type `ReJSON-RL` is written as a `RESTORE` line.
- [ ] **Cancel** leaves neither the file nor the `.part` file.
- [ ] A stream with a consumer group is exported with its entries, and the result says *Consumer groups of streams
  are not exported.*
- [ ] On a read-only connection the export runs.
- [ ] Importing the file into an empty database (`key.import`) gives keys with the same types, the same bytes and
  the same dates of expiry.

### `key.export-text` — The file of exported keys

The format of an exported key: the Redis commands that create it again, with its type, its bytes and its expiry.

- **Kind**: Derivation
- **Engine**: Redis
- **Function**: `src/features/key/export-text.ts › exportText(key)`
- **Uses**: `value.quote`; used by `key.export` and `value.copy`; read back by `key.import-parse`.
- **Ported from**: *New in Datardo*

Inputs: one key: its name, its type, its value as bytes, in the order the server gave its items, and its date of
expiry in milliseconds, or none. Output: lines of text.

Rules:

1. One command a line. The file is UTF-8, lines end with a line feed, and there is no heading and no empty line.
2. Every argument is written by `value.quote`, in full: bare when it is plain ASCII, in double quotes with `\"`,
   `\\`, `\n`, `\r`, `\t` and `\xHH` otherwise. No line ever holds a raw line break.
3. A string: `SET <key> <value>`. A value longer than 1,048,576 bytes is `SET` with its first 1,048,576 bytes, then
   one `APPEND <key> <part>` for each further part of that size.
4. A hash: `HSET <key> <field> <value> …`, at most 100 pairs *(Datardo's choice)* a line.
5. A list: `RPUSH <key> <element> …`, from the head, at most 100 elements a line.
6. A set: `SADD <key> <member> …`, at most 100 members a line.
7. A sorted set: `ZADD <key> <score> <member> …`, at most 100 pairs a line, the score as the server gave it (`1.5`,
   `3`, `inf`, `-inf`).
8. A stream: `XADD <key> <ID> <field> <value> …`, one entry a line, oldest first, with its own ID.
9. A key of a module's type, and a stream without entries: `RESTORE <key> 0 <payload>`, the payload being what
   `DUMP` answered. Such a line is read only by a server that knows the type, of the same or a later version.
10. A key with an expiry: after its other lines, `PEXPIREAT <key> <milliseconds since 1970 UTC>`.
11. The lines of one key are together, and the keys are in the order they were given.

Worked example. The keys: the string `session:1` holding `{"user":7}` that expires on 2027-01-01 00:00:00 UTC; the
hash `user:7` with `name` `Ada Lovelace` and `visits` `12`; the list `queue:mail` with `a`, `c d` and the two bytes
`00 ff`; the sorted set `board` with `ada` at 1.5 and `bob` at 3; the stream `events` with the entry
`1700000000000-0` of `type` `signup` and `user` `7`. The file:

```
SET session:1 "{\"user\":7}"
PEXPIREAT session:1 1798761600000
HSET user:7 name "Ada Lovelace" visits 12
RPUSH queue:mail a "c d" "\x00\xff"
ZADD board 1.5 ada 3 bob
XADD events 1700000000000-0 type signup user 7
```

Acceptance:

- [ ] The keys of the example give exactly the six lines above.
- [ ] A hash of 250 fields gives three `HSET` lines, of 100, 100 and 50 pairs.
- [ ] A string of 2,500,000 bytes gives one `SET` and two `APPEND` lines.
- [ ] A value with a line feed is written with `\n`, on one line.
- [ ] A persistent key has no `PEXPIREAT` line.
- [ ] A sorted set member with the score `inf` is written `ZADD board inf ada`.
- [ ] Piping the file to `redis-cli` on an empty database creates the same keys as `key.import` does.

### `key.import` — Import keys from a file

Creates the keys of a file that `key.export` wrote, in the database of the tab.

- **Kind**: Operation
- **Engine**: Redis
- **Function**: `src/features/key/import.ts › plan(context, answers)`
- **Entry points**: **Import keys…** under **More** in the toolbar of the keys tab (`@toolbar`) and on an empty
  database (`@empty-state`); **Import keys…** in the context menu of a database of the tree (`@tree-menu`); Go to
  as **Import keys…**.
- **Offered when**: on a connection that is not read-only.
- **Asks**: the file, with the system's file dialog; then **When a key already exists**: **Skip it** (the default),
  **Replace it**, or **Stop**; then the confirmation.
- **Reads**: the file, through `key.import-parse`, which gives its keys and the commands of each; then `EXISTS
  <key>` for each key, 500 a pipeline.
- **Plan**: for each key that is imported, in the order of the file: `UNLINK <key>` first when it replaces one,
  then its lines as the file has them. The commands are sent 500 a pipeline *(Datardo's choice)*. A key that is
  skipped has no step.
- **Danger**: Confirm: **Import 1,832 keys from cache-local-db0.redis into db0 of Cache local?**, with the detail
  *1,829 are new. 3 already exist and are skipped.* (or *… and are replaced: their values and expiry are lost.*) and
  the line about the undo, button **Import**. Destructive, when keys are replaced and the import cannot be undone:
  the user types the number of keys replaced.
- **Read-only**: Refused on a read-only connection (`/read-only`).
- **Undo**: Recorded in the undo history (`undo.record`) as `Import cache-local-db0.redis`, keeping each key as it
  was (missing, for a new one), within the limits of `undo.limits`. Cannot be undone beyond them, or with the undo
  history off: the confirmation says so.
- **After**: the work in progress on the status line (*Importing keys: 1,200 of 1,832*) with **Cancel**; then
  *Imported 1,829 keys into db0; 3 skipped because they exist.*, with **Undo** when recorded; the keys tab and the
  tree are refreshed. It stops at the first command the server refuses: *Imported 40 of 1,832 keys, then at line
  212: \<error\>*; the keys before stay, and the key of that line is deleted with `UNLINK`, so that no key is left
  half made. A `RESTORE` refused for its payload adds *: this key was exported from a newer or a different server.*
- **Refuses**: a file `key.import-parse` cannot read: its error, with the line (`/invalid-file`); a file without
  keys: *The file has no keys.* (`/empty`); with **Stop**, a key that exists: *Nothing imported: the key user:7
  already exists in db0.* (`/exists`).
  On a read-only connection: *The connection Cache local is read-only.* (`/read-only`).
- **Commands**: `key.import`
- **Settings**: `datardo.undo.*` (whether it is recorded).
- **Uses**: `key.import-parse`, `key.export`, `runner.confirm`, `runner.progress`, `runner.cancel`, `undo.record`,
  `undo.limits`, `undo.notification`, `key.refresh`, `tree.refresh`, `connection.read-only`.
- **Ported from**: *New in Datardo*

Acceptance:

- [ ] Importing the file of the example of `key.export-text` into an empty database asks **Import 5 keys from … into
  db0 of Cache local?** and sends its six lines.
- [ ] With `user:7` existing and **Skip it**, no command names `user:7` and the result says *Imported 4 keys into
  db0; 1 skipped because they exist.*
- [ ] With **Replace it**, `UNLINK user:7` is sent before `HSET user:7 …`.
- [ ] With **Stop**, nothing is sent and the message is *Nothing imported: the key user:7 already exists in db0.*
- [ ] A file with the line `FLUSHALL` is refused before anything is sent.
- [ ] **Undo** deletes the keys the import created and puts back those it replaced.
- [ ] A file of 12,000 new keys says in its confirmation *This can't be undone: the undo history keeps operations of
  up to 10,000 keys.*
- [ ] When line 212 is refused by the server, the keys of the lines before it exist, and the key of line 212 does
  not.
- [ ] On a read-only connection there is no **Import keys…**.

### `key.import-parse` — Read a file of exported keys

Reads the text of an export back into keys and their commands, and refuses anything an export would not have
written, so that importing a file can never run a command the user did not expect.

- **Kind**: Derivation
- **Engine**: Redis
- **Function**: `src/features/key/import-parse.ts › importedKeys(text)`
- **Uses**: reads what `key.export-text` writes; used by `key.import`.
- **Ported from**: *New in Datardo*

Input: the text of the file. Output: the keys in the order they first appear, each with its type, its commands and
the lines they are on; or an error with its line.

Rules:

1. Lines end with a line feed, with or without a carriage return before it. Empty lines and lines that start with
   `#` are passed over.
2. A line is split into arguments as `redis-cli` does: at spaces and tabs; an argument in double quotes may hold
   spaces and the escapes `\"`, `\\`, `\n`, `\r`, `\t`, `\a`, `\b` and `\xHH`; one in single quotes may hold `\'`.
   Quotes that do not close: *Line 7: unbalanced quotes.*
3. The first argument is the command, in either case; the second is the key. Only these are read:
   - `SET <key> <value>`, with nothing after the value;
   - `APPEND <key> <value>`, after the `SET` of the same key;
   - `HSET <key>` with one or more pairs; `RPUSH <key>` and `SADD <key>` with one or more values;
   - `ZADD <key>` with one or more pairs of a score (a number, `inf`, `+inf` or `-inf`) and a member, without
     options;
   - `XADD <key> <ID>` with one or more pairs, the ID written in full (`1700000000000-0`), not `*`;
   - `RESTORE <key> 0 <payload>`, without options;
   - `PEXPIREAT <key> <milliseconds>`, a whole number, after another line of the same key.
4. Any other command: *Line 12: only the commands Datardo exports can be imported (SET, APPEND, HSET, RPUSH, SADD,
   ZADD, XADD, RESTORE, PEXPIREAT): found FLUSHALL.* A wrong number of arguments: *Line 3: HSET needs a key and
   pairs of field and value.*, and the like for each command.
5. The first command of a key gives its type. A later command of another type: *Line 9: user:7 is a hash earlier
   in the file.* A second `SET` or `RESTORE` of the same key: *Line 9: user:7 is already set at line 2.*
6. The lines of a key need not be together: the key is the union of its lines, in order.

Examples:

| Text | Result |
| --- | --- |
| `SET a 1` | one key `a`, a string |
| `HSET h f "v w"` then `PEXPIREAT h 1798761600000` | one key `h`, a hash, with two commands |
| `hset h f v` | one key `h`, a hash |
| `RPUSH q a` then `SADD s m` then `RPUSH q b` | two keys, `q` with two commands and `s` with one |
| `# comment` then an empty line then `SET a 1` | one key `a` |
| `SET a 1 EX 10` | *Line 1: SET needs a key and a value.* |
| `SET a "1` | *Line 1: unbalanced quotes.* |
| `DEL a` | *Line 1: only the commands Datardo exports can be imported (…): found DEL.* |
| `SET a 1` then `HSET a f v` | *Line 2: a is a string earlier in the file.* |
| `PEXPIREAT a 1798761600000` | *Line 1: a has no value before its expiry.* |

Acceptance:

- [ ] Each row of the table above gives its result.
- [ ] The text `key.export-text` writes for a key reads back to the same name, type, bytes and expiry, also for
  values with quotes, line breaks and bytes that are not text.
- [ ] `XADD s * f v` is refused with *Line 1: XADD needs a full ID, not \*.*
- [ ] A file that ends without a final line feed is read to its last line.

### `key.switch-database` — Switch database

Shows the keys of another database of the same server.

- **Kind**: Operation
- **Engine**: Redis
- **Function**: `src/features/key/switch-database.ts › plan(context, answers)`
- **Entry points**: the database of the path of a keys tab or a key tab, whose menu lists the databases
  (`@scope-bar`); a database of the tree (`@tree`); Go to as **Switch database…**.
- **Offered when**: the connection is a connected Redis one.
- **Asks**: from Go to only: the database, in a list: each as `db0 · 1,204 keys`, or `db3 · empty`, the present one
  marked.
- **Reads**: nothing of its own: the databases and their numbers of keys are those the tree last read (`tree.show`),
  from `INFO keyspace` and `CONFIG GET databases`. Opening the menu or the list sends nothing to the server.
- **Plan**: an app step, `open the keys tab of db3 on Cache local` (`tab.open`). No command is sent on the tabs
  that are open: the tab of `db3` has a client of its own, which sends `SELECT 3` once.
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone: there is nothing to undo; the other tab is still open.
- **After**: the keys tab of that database is active, with an empty pattern and **All types**; if it was open
  already, it is made active as it is. The tab left stays open on its database.
- **Refuses**: a database the server does not have: *This server has no db16: it has 16 databases, db0 to db15.*
  (`/out-of-range`).
- **Commands**: `key.switch-database`
- **Uses**: `key.show`, `tab.open`, `tree.show`.
- **Ported from**: *New in Datardo*

Acceptance:

- [ ] On a server with keys in databases 0 and 3 and `databases` 16, **Switch database…** lists `db0` to `db15`,
  with `db0 · 1,204 keys` and `db1 · empty`, and sends nothing to the server.
- [ ] Choosing `db3` opens a keys tab with the path `Cache local / db3`, whose first commands are `SELECT 3`, then
  `DBSIZE` and `SCAN 0 COUNT 500`.
- [ ] A command of the tab of `db0`, sent after the switch, still runs on database 0.
- [ ] Choosing `db16` on a server of 16 databases, from a list read before the server was restarted with fewer, says
  *This server has no db16: it has 16 databases, db0 to db15.*
- [ ] Choosing the database of an open keys tab makes that tab active, with its pattern as it was.
