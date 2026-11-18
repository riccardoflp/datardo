# The product

Datardo is a desktop client for databases, for developers and the people who look after their deployments. Today it
speaks two **engines**, MongoDB and Redis. Its window, its connections, its undo history, its scheduled tasks and its
MCP server are shared by both, so that another engine can be added later without a second product.

For MongoDB it does everything Mongoster 0.8.0 does: it opens collections in a table, runs
queries and aggregations written in mongosh syntax, edits documents, analyzes schemas, indexes and references, moves
data in and out, backs up, compares, and watches the server. For Redis it browses keys, shows and edits the values of
every type, runs commands in a console, follows Pub/Sub channels and shows the state of the server. It runs on
Windows, macOS and Linux as one application, with MongoDB 4.2 or later and Redis 6.2 or later.

This page is the map of the product for whoever builds it. The cards in [features/](features/README.md) say what each
feature does exactly; the [glossary](glossary.md) fixes the words.

## Who it is for

- **Developers** of applications that use MongoDB, Redis or both: they query, edit test data, write pipelines,
  generate code, look at what a cache or a queue holds, and let an AI assistant read the data through the MCP server.
- **Whoever looks after a deployment**: indexes, slow queries, replication, sharding, users, backups, comparing
  environments before a release, the memory and the slow log of a Redis server.
- **Teams with Meteor apps** using redis-oplog, who need the writes made in Datardo to reach the apps at once, and who
  can now watch the same events arrive on Redis in the same window.

## The window

Datardo draws its whole window: there is no title bar of the operating system. The window is made of **islands**,
rounded panels that float on the window's background with a gap between them. Only the top bar, the rail and the
status line sit directly on the background.

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│  Datardo            ⌕ Go to a collection, a key, a page or a command    Ctrl+K           MCP ●     ─  □  ✕ │
│                                                                                                            │
│ ⌂  ╭ connection island ────╮ ╭ main island ─────────────────────────────────────╮ ╭ inspector island ───╮ │
│ ▤  │ ● Local             ⇅ │ │ Local ▏orders  users  Diagram   Cache local ▏Keys │ │ orders · 65f1…a2c   │ │
│ ⌕  │   MongoDB 8.0 · rs0   │ │ ←  →  Local / shop / orders      Pin  Open on…    │ │ {                   │ │
│ ↶  │ ● Cache local · Redis │ │ Documents  Schema  Indexes  Chart  Validation  …  │ │   _id: ObjectId(…), │ │
│ ◷  ╰───────────────────────╯ │ Find ▾  { status: "paid" }   Sort   Project    ▶  │ │   status: "paid",   │ │
│    ╭ tree island ──────────╮ │ ┌────┬──────────┬────────┬───────────┬─────────┐  │ │   customer: …       │ │
│    │ Pinned                │ │ │ #  │ _id      │ status │ address ▸ │ total   │  │ │ }                   │ │
│    │   orders              │ │ ├────┼──────────┼────────┼───────────┼─────────┤  │ │ Go from here        │ │
│    │ ▾ shop                │ │ │ 1  │ 65f1…a2c │ paid   │ {3}       │ 42.50   │  │ │   customer → users  │ │
│    │     orders            │ │ │ 2  │ 65f1…a2d │ new    │ {3}       │ 12.00   │  │ │ History             │ │
│    │     users             │ │ └────┴──────────┴────────┴───────────┴─────────┘  │ │                     │ │
│ ⚙  │ Pages of Local        │ │                                                   │ │                     │ │
│    ╰───────────────────────╯ ╰───────────────────────────────────────────────────╯ ╰─────────────────────╯ │
│  ● Local · connected · 4 ms        2 of 1,204 documents · 38 ms        1 task running          Read-only   │
└────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Top bar**: the name of the app, the **Go to** field, the state of the MCP server, and the window's buttons (the
  system's own, drawn over the top bar on Windows and macOS; Datardo's on Linux). Its empty part drags the window.
- **Go to** (`Ctrl+K`): the command palette. It finds collections, keys, pages, connections, saved queries and
  commands, and is the keyboard's way to everything.
- **Rail**: a column of icons on the window's background, not an island. **Home**, **Explorer** (shows or hides the
  explorer), **Search**, **Undo history**, **Scheduled tasks**, and at the bottom **Settings**.
- **Explorer**: the column of two islands beside the rail. It shows **one connection at a time**, the *current
  connection*.
  - **Connection island**: the current connection with its color, name, engine, version, topology, state and latency.
    A click opens the **connection switcher**, the list of every saved connection by folder, with a filter. Under it,
    the *linked connection* when there is one: the Redis connection that receives this MongoDB connection's writes for
    redis-oplog.
  - **Tree island**: what the current connection holds. **Pinned** (the items the user pinned on this connection),
    the engine's tree (for MongoDB: databases, then collections, views and GridFS buckets; for Redis: databases, then
    namespaces of keys), and **Pages of** the connection (for MongoDB: **Overview**, **Monitor**, **Users and
    roles**, **Index advisor**, **Search documents**, **Watch changes**, **Playground**, **Scheduled tasks**; for
    Redis: **Overview**, **Server**, **Console**, **Pub/Sub**).
- **Main island**: the work.
  - **Tab strip**: the open tabs, in groups, one group per connection with its name and color; the tabs of the app
    itself (Home, Settings, Undo history, Scheduled tasks, Log) form the first group. Making a tab active makes its
    connection the current one, and the explorer follows.
  - **Scope bar**: **Back** and **Forward** through the places visited, the path of the active tab (`Local / shop /
    orders`, where each segment opens a menu of its siblings), **Pin**, and **Open on another connection**, which
    opens the same database, collection and query on another connection of the same engine.
  - **Section bar**: the sections of the active tab when its page has several. A collection tab has **Documents**,
    **Schema**, **Indexes**, **Chart**, **Validation** and, under **More**, **Explain**, **Code** and the others.
  - **The page**: what the tab shows.
- **Inspector island**: the thing selected in the page: a document (as a tree and as mongosh text, with **Go from
  here** for its references and **History** for its versions), a key with its value, an index, an operation of the
  server. It can be hidden, and a page with nothing to inspect hides it.
- **Status line**: on the window's background, at the bottom. The current connection's state and latency, what the
  active page counts, the work in progress with **Cancel**, and **Read-only** when the current connection is.
- **Dialogs** are small islands over the window: the confirmation of a write with its plan, forms, lists to pick
  from. **Notifications** appear at the bottom right, with their actions (**Undo**).

### Home

The page Datardo opens with, and the first entry of the rail: **Jump back in** (the tabs and items used last), and
every saved connection as a card, grouped by folder, with a filter by engine, **Connect** or **Go to**, and **Add
connection**.

### What a tab is

A tab belongs to a connection, or to the app. It shows one page; the kinds of tabs:

| Tab | Engine | Shows |
| --- | --- | --- |
| collection tab | MongoDB | A collection or a view: the table with the query bar, and the other sections. |
| keys tab | Redis | The keys of a database or of a namespace, with the pattern and the type filter. |
| key tab | Redis | One key and its value, with all the room of the main island. |
| document tab | MongoDB | One document in an editor, saved with `Ctrl+S`. |
| playground tab | MongoDB | A script in mongosh code and its results. |
| console tab | Redis | Commands typed one at a time, and their replies. |
| page tab | either | One page of a connection or of a database: Overview, Monitor, Server, Pub/Sub, Users and roles, Index advisor, Search documents, Watch changes, Relationship diagram, GridFS, the comparisons. |
| app tab | — | Home, Settings, Undo history, Scheduled tasks, Log, a connection form. |

## The engines

An engine is a kind of database Datardo speaks. Everything that is not about one engine is written once: the window,
connections with folders, colors, read-only, TLS and SSH tunnels, the runner that confirms and runs writes, the undo
history, the log, scheduled tasks, the MCP server, settings.

| | MongoDB | Redis |
| --- | --- | --- |
| Servers | 4.2 or later: standalone, replica set, sharded cluster, Atlas | 6.2 or later, standalone or one replica; servers that answer the same commands (Valkey, KeyDB, Dragonfly) as far as they do |
| Not yet | — | Redis Cluster, Sentinel, the values of module types (RedisJSON, RediSearch, time series) |
| The user types | mongosh syntax | Redis commands, and values as text, JSON or bytes in hexadecimal |
| The tree | databases, collections, views, GridFS buckets | databases (`db0`, `db1`, …), namespaces of keys split at `:` |
| The main tab | collection tab | keys tab |
| What is written | documents, and databases, collections, indexes, users | keys and their values and expiry |
| Driver | `mongodb` (the official Node.js driver) | `redis` (node-redis, the official client) |

How Redis is handled, where the cards need one rule:

- Keys are listed with `SCAN`, a page at a time, never with `KEYS`. A pattern uses `MATCH`, a type filter `TYPE`.
- Types shown and edited: string, hash, list, set, sorted set, stream. A key of a module's type is listed with its
  type and can be renamed, given an expiry or deleted, but its value is not shown.
- Values are bytes. A value that is valid UTF-8 is shown as text, and as formatted JSON when it parses; any other is
  shown in hexadecimal. Editing never changes bytes the user did not touch.
- A server in cluster mode is refused when connecting, with *Redis Cluster is not supported yet.*
- Before a write to keys, the runner keeps each key as `DUMP` returns it, with its `PTTL`; undo puts it back with
  `RESTORE … REPLACE`, or deletes a key that did not exist.
- Commands typed in the console are not recorded in the undo history, like the writes of a playground.

## What replaces Mongoster and VS Code

Mongoster is a VS Code extension, and its desktop app imitates VS Code. Datardo has a window of its own. Wherever a
source says one of the things on the left, Datardo has the thing on the right, and the cards never name the left one.

| In Mongoster | In Datardo |
| --- | --- |
| The Activity bar icon and the connections view: a tree of every connection, in folders | The rail and the explorer of one connection at a time. Every connection, in its folder, is on the Home page and in the connection switcher. |
| The context menu of a tree node, the buttons of the view's title | The context menu of a tree node, the `…` button of a row, the buttons of the connection island. |
| The Command Palette and the `mongoster.*` commands | **Go to** (`Ctrl+K`). A command's identifier is the identifier of its card. |
| A command run with no argument asks with a quick pick for the connection, the database, the collection | The command starts from the current connection and the active tab; what is still missing is asked in a dialog. |
| Webview tabs in the editor area, in two groups | Tabs of the main island, grouped by connection. One main island: no split in the first release. |
| The sections of the collection tab (`Table`, `Schema`, `Indexes`, `Explain`, `Chart`, `History`) | The section bar of the collection tab. |
| The document dialog (a modal that shows one document as a tree) | The inspector island. |
| A document in an editor tab (`mongoster://`), saved with `Ctrl+S` | A document tab, with Datardo's editor, saved with `Ctrl+S`. |
| A view definition or the validation rules in an editor tab (`mongoster-def://`) | The **Definition** section of a view's tab and the **Validation** section of a collection tab: an editor and **Save**. |
| Generated code in an editor tab | The **Code** section, with **Copy**. |
| A playground: a `.mongodb.js` file, CodeLens, VS Code's completion | A playground tab: Datardo's editor, a **Run** button beside each statement, files opened and saved with the system's file dialogs. |
| The editor (VS Code's, Monaco in the desktop app) | Datardo's editor (CodeMirror 6) wherever code is typed: filters, pipelines, documents, playgrounds, the Redis console. |
| VS Code's modal messages, quick picks and input boxes | Datardo's dialogs: the confirmation with the plan, a list to pick from, a form. |
| VS Code's notifications, and progress with `Cancel` | Notifications, and the work in progress on the status line with **Cancel**. |
| Output channels (`Mongoster MCP`, `Mongoster Playground`) | The **Log** page, which can be filtered by source. |
| VS Code's Settings; `mongoster.*` in its `settings.json` | The Settings page; `datardo.*` in Datardo's own `settings.json`. |
| VS Code's color theme and token colors | Datardo's themes: dark, light, or as the system. |
| The color of a connection on its tree nodes and tab icons | The color of a connection on its island, its group of tabs and its cards. |
| `SecretStorage` | Datardo's secret storage: a file encrypted with a key of the system's keychain. |
| `globalState`, the global storage folder | Files in Datardo's data folder ([stored data](data.md)). |
| The workspace folder (`.mongoster/queries`), the trust of a workspace | No workspace. A connection may be given a **queries folder**; a playground is a file the user opens. |
| Several VS Code windows that share the scheduled tasks under a lock | One instance of Datardo with one window; starting it again brings that window to the front. |
| The desktop app's menu bar, `Tools` menu and tray | No menu bar on Windows and Linux; the system's menu on macOS; the tray. |
| The Redis URL of a connection, for redis-oplog | A saved Redis connection, linked to the MongoDB connection. |
| The file pickers of VS Code | The system's file dialogs. |
| The Marketplace, which updates the extension | Installers. How Datardo updates is an open question ([decisions](decisions.md#open-questions)). |

What the old host gave for security, and Datardo now does itself: keeping secrets (the secret storage), isolating the
pages from the system (the window's process has no access to Node or to the disk), and deciding what a file opened
from someone else may do (a playground runs only when the user runs it). Each is a threat of the
[security page](security.md).

## Settings

Settings are named `datardo.<group>.<name>`, where the group is the area of the catalog that reads the setting
(`datardo.undo.maxSizeMb`, `datardo.mcp.port`). They are declared in one schema, kept in `settings.json` in Datardo's
data folder, changed in the Settings page, and listed with the cards that read each in
[features/settings.md](features/settings.md). Mongoster's settings keep their meaning and their defaults under the new
names: `mongoster.history.*` becomes `datardo.undo.*`, `mongoster.mcp.*` becomes `datardo.mcp.*` (and `readDocuments`
becomes `readData`, since it now covers the values of Redis keys too), `mongoster.references.detect` becomes
`datardo.relation.detect`, `mongoster.scheduledTasks.keepRunningInTray` becomes `datardo.task.keepRunningInTray`, and
`mongoster.savedQueries.folder` becomes the queries folder of each connection.

## What stays the same

The promises every feature keeps. A card that cannot keep one says so in its lines.

- **Read-only means no writes.** Through a read-only connection, and through a MongoDB view, Datardo sends nothing
  that changes data, indexes, users or server settings. The Redis console refuses the commands that write.
- **A dangerous write is shown before it runs.** The confirmation shows the commands exactly as they will be sent, how
  much they touch, and whether they can be undone. What is lost for good is confirmed by typing its name.
- **Writes to documents and to keys can be undone** from the undo history, within its limits, and the confirmation
  says when one cannot.
- **Types survive.** A BSON value that is read, edited, copied, compared, backed up or restored keeps its type
  (`Int32` stays `Int32`, `Decimal128` stays `Decimal128`). A Redis value keeps its bytes.
- **What the user types and reads is the engine's own language**: mongosh syntax for MongoDB, Redis commands for
  Redis. What Datardo writes to a file for other tools is Extended JSON or the format of the MongoDB tools
  (`mongodump`, `mongoexport`).
- **Writes to documents reach redis-oplog** on the connections that publish, with the exceptions the cards name.
- **The MCP server never writes**, kills an operation or changes a server setting, and gives documents and values to
  an AI only with `datardo.mcp.readData` on.
- **Secrets stay in the secret storage**: connection strings, passwords, passphrases and the access token never go to
  settings, logs, the confirmation's commands, files exported without passwords, or the AI.
- **The window never waits.** Anything that can take long runs away from the window, shows its progress on the status
  line and can be cancelled.
- **Everything can be done from the keyboard**, and every control has a name a screen reader can say.
