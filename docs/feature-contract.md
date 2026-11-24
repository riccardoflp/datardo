# The feature contract

How a feature of Datardo is shaped in the code, how it is described in a card, and the list of areas the catalog is
split into. The cards are in [features/](features/README.md). The words are those of the [glossary](glossary.md).

## Why

A feature written as one function, with everything it needs given to it and everything it does returned from it, can
be read in one place, tested without a window, a server or a disk, shown before it runs, logged as it runs and undone
after. The machinery that feeds these functions and carries out what they return, the **runner**, is written once; the
features are many, and a new engine adds features, not machinery.

## The four kinds

| Kind | What it is | Pure? |
| --- | --- | --- |
| **Read** | Asks a deployment, a file or Datardo's own data something and returns it. Changes nothing. Split into `request`, which builds what is sent, and `parse`, which turns the reply into data; both pure, so that `parse` is tested on recorded replies. | The two halves are. |
| **Operation** | Something the user does that changes something: a deployment, a file, Datardo's own data. Returns questions, then a plan of steps. Runs nothing itself. | Yes. |
| **View** | A page, a section, a dialog or a part of one: what is shown, and which feature each control starts. Changes no state, runs nothing. | Yes, given its state. |
| **Derivation** | Turns data into other data: a filter from the builder's rows, a schema from a sample, a script, a layout, the text of a value. | Yes. |

A feature the user sees is usually one Operation or View plus the Reads and Derivations it uses; its card names them.

## How a feature runs

A control, a command or a tool of the MCP server sends an **intent**: the identifier of a feature and what it was
started on. The runner, in the main process, then calls the feature again and again, each time with what has been
learned so far, and each time the feature says what it needs next:

- **ask** a question of the user: text with validation, pick one, pick many, a form. The answer comes back by key;
- **read** something more, through a Read feature; the result comes back by key;
- **refuse**, with a code and a message in words for the user;
- **run** a plan.

```ts
/** Feature: document.delete */
export function plan(context: Context, answers: Answers): Outcome;

type Outcome =
  | { kind: 'ask'; question: Question }
  | { kind: 'read'; read: FeatureId; args: unknown }
  | { kind: 'refuse'; code: RefusalCode; message: string }
  | { kind: 'run'; plan: Plan };

interface Plan {
  title: string;                         // as the confirmation, the Log and the undo history show it
  steps: Step[];                         // each exactly what the confirmation shows and the Log records
  danger: 'none' | 'confirm' | 'destructive';
  undo: { keeps: Kept } | { cannot: string };   // what to save before the steps, or why it cannot be undone
  publishes: boolean;                    // MongoDB document writes: whether redis-oplog hears of them
  after: After[];                        // refresh, select, open, copy, notify, offer a next step
}
```

`Context` is an immutable snapshot: the connection the feature was started on (its engine, name, read-only, what the
server is and can do), the target (a database, a collection, documents, keys, a tab), the settings, the state Datardo
last read, the current time and the platform. A feature never reads the clock, the environment, a global or a server.

A **step** is the only way a feature changes anything. It is one of:

- a command to an engine: for MongoDB a call written in mongosh syntax (`db.orders.deleteOne({ _id: ObjectId("…")
  })`), for Redis a command (`DEL orders:42`);
- a file step (`write C:\backups\shop.agz`, `delete …`);
- an app step, a change to Datardo's own data (`save the connection Local`).

The runner, not the feature:

1. refuses any step that writes to a deployment through a read-only connection or a view, as a last guard: the
   feature has already refused with its own code;
2. confirms according to the plan's danger: *none* runs at once; *confirm* shows the confirmation with the title, the
   steps, how much they touch and whether they can be undone, and one button named after the action; *destructive*
   shows the same and asks the user to type the name of what is lost;
3. saves what the plan's `undo: { keeps }` names before the first step, when the undo history is on (`undo.record`);
   when that turns out too large to keep, it asks whether to go on without undo before anything is written;
4. runs the steps in order, shows the work in progress, stops at the first step that fails unless the step says
   otherwise (below), and writes each step in the Log with the feature's identifier;
5. publishes the events of a MongoDB document write for redis-oplog, on the connections that publish
   (`oplog.publish`);
6. does what follows: reads again what the pages show, and notifies, with **Undo** when the write was recorded.

A step that fails stops the plan. A step may say otherwise, and its card says why: *go on* (the next step runs), or
*instead* (other steps run in its place, for the errors it names); and the steps of a plan may be in groups with a
title, where a failure stops its group only. The confirmation shows all of it, and the runner never decides it by
itself ([D31](decisions.md#d31--a-step-says-what-happens-when-it-fails)).

A Read exports `request(context, args)` and `parse(reply)`. A View exports `view(state)`, which returns what is shown
and, for each control, the intent it sends; a React component of the window draws it and nothing else. A Derivation
exports one function named for what it returns.

## Identifiers

`area.action`, lower case, words joined by `-`: `document.delete-many`, `key.set-expiry`. The identifier:

- heads its card;
- names its module, `src/features/<area>/<action>.ts`, and is written in the doc comment of its function (`/**
  Feature: document.delete-many */`);
- starts the name of each of its tests: `describe('document.delete-many', …)`;
- is the identifier of its **command**, when it can be started from Go to or with a key. A feature with several fixed
  variants registers one command per variant, as `area.action:variant` (`window.zoom:in`);
- is carried by every control that starts it, with the place of the control: `data-feature="document.delete@row-menu"`;
- starts the code of each of its refusals: `document.delete/read-only`;
- starts each line the Log writes for it: `[document.delete] db.orders.deleteOne({ … })`.

The page of an area is the View `<area>.show` (`monitor.show`, `undo.show`, `home.show`).

### Places

The place of a control is one word of this list. A card names the places of its controls in **Entry points**.

| Place | Where |
| --- | --- |
| `top-bar` | The top bar. |
| `rail` | The rail. |
| `connection-island` | The connection island. |
| `connection-switcher` | The connection switcher. |
| `tree` | A node of the tree island, by click or double click, and the island's own buttons. |
| `tree-menu` | The context menu of a node of the tree island. |
| `tab-strip` | The tab strip. |
| `tab-menu` | The context menu of a tab. |
| `scope-bar` | The scope bar. |
| `section-bar` | The section bar. |
| `inspector` | The inspector island. |
| `status-line` | The status line. |
| `home` | The Home page. |
| `notification` | A button of a notification. |
| `tray` | The tray icon's menu. |
| `app-menu` | The system's menu bar on macOS. |
| `toolbar` | The toolbar of the page or section the feature belongs to. |
| `query-bar` | The query bar. |
| `table` | A table: a click, a double click or a key on a row or a cell. |
| `column-menu` | The menu of a column header. |
| `row-menu` | The context menu of a row, and its `…` button. |
| `cell-menu` | The context menu of a cell. |
| `selection-bar` | The bar that appears while rows are selected. |
| `list` | A list of a page that is not a table: a click or a key on an item. |
| `item-menu` | The context menu of an item of such a list. |
| `editor` | Inside the editor: a button beside a line, a key. |
| `form` | A form of a page. |
| `dialog` | A dialog the feature itself opened. |
| `empty-state` | What a page shows when it has nothing to show. |
| `paging` | The row under a table with the range shown, the page buttons and the page size. |
| `chart` | A mark of a drawn chart: a bar, a point, a slice. |

A feature started only from Go to or with a key has a command and no place.

### Refusal codes

A refusal's code is `area.action/reason`; the card lists the reasons in **Refuses** as `/reason`. Reasons that mean the
same everywhere are spelled the same: `/read-only` (a read-only connection), `/view` (a MongoDB view),
`/not-connected`, `/unsupported` (the server is too old or lacks what is needed). Cancelling a question is not a
refusal.

## The card

Leave out a line that does not apply rather than writing "none", except **Engine** on every card, and **Danger**,
**Read-only** and **Undo** on an operation, which are always said.

````markdown
### `area.action` — Title in sentence case

What it is for, in one or two sentences, from the user's side.

- **Kind**: Operation | Read | View | Derivation
- **Engine**: MongoDB | Redis | Any
- **Function**: `src/features/area/action.ts › plan(context, answers)` for an Operation; `› request(context, args)`
  and `› parse(reply)` for a Read; `› view(state)` for a View; `› nameOfTheResult(input)` for a Derivation.
- **Entry points**: where the user finds it, each control with its place: the context menu of a row (`@row-menu`), the
  toolbar (`@toolbar`). Then the key, if any (`Delete`), Go to with the title it has there (**Delete document**), and
  the tool of the MCP server, if any.
- **Offered when**: the conditions under which the entry points show it.
- **Asks**: the questions, in order, with their defaults.
- **Reads**: what it needs to know before it can decide, and why; by identifier when it is a Read with a card.
- **Plan**: the steps, as the confirmation shows them and the Log records them.
- **Danger**: None | Confirm: the text of the confirmation and of its button | Destructive: what is lost, and what the
  user types.
- **Read-only**: Refused on a read-only connection (`/read-only`) | Allowed, because it writes nothing to a deployment.
- **Undo**: Recorded in the undo history (`undo.record`) | Cannot be undone: why; the confirmation says so.
- **Publishes**: only for a write to MongoDB documents: Published for redis-oplog (`oplog.publish`) | Not published:
  why.
- **After**: what is read again, selected, said or offered once it has run.
- **Refuses**: when, what it says, and its code: a view (`/view`), *The connection Production is read-only.*
  (`/read-only`).
- **Commands**: the commands that start it, and nothing else in backticks: `area.action`.
- **Settings**: the `datardo.*` settings that change what it does.
- **Uses**: other features, by identifier.
- **Ported from**: where Mongoster does this, for whoever builds it: Mongoster's card by name, without backticks
  (document.delete), and its files (`src/collectionPanel.ts`); 0.8.0 unless the card names the later version that
  brought it (0.9.0 or 0.10.0). *New in Datardo* when it does not.
- **Differs**: only on a card built by an earlier milestone and changed since: what the code built today does that
  the card no longer says, with the milestone that changes it: `(M38) …`.

Acceptance:

- [ ] A sentence a test can check, from the user's side, with exact values.
- [ ] …
````

A **Derivation** card replaces the operation lines with the rules of its result: inputs, outputs, invariants, and
worked examples (input → output). For an algorithm, name a published one and say what the result must satisfy.

A **View** card says what the page shows, in which order and in which states (loading, empty, error, read-only), and
names in **Uses** the features its controls start.

### A card that changes after it was built

A card the index marks *Built* is changed in place, never copied: its lines say what Datardo will do, its **Differs**
line says what the code does today, and each acceptance line the code does not meet yet ends with *(differs)*. The
index then shows it *Differs*. The milestone that changes it lists it in its **Features** with *(changed)* before
it, beside the milestone that built it ([roadmap](roadmap.md)); when that milestone is done, the **Differs** line and
the marks go and the card is *Built* again.

### What makes an acceptance line good

- It can fail. "Works correctly" cannot; "Deleting the document with `_id` 7 of `shop.orders` runs
  `db.orders.deleteOne({ _id: 7 })`" can.
- It is about what the user sees or what the deployment ends up as, not about internal calls.
- It has the exact numbers, texts and commands: 10,000 documents, *Nothing to undo*, `SCAN 0 MATCH orders:* COUNT 500`.
- It covers the refusals and the edge cases the card names, not only the happy path: the read-only connection, the
  view, the empty collection, the value that is not text, the server that is too old.

### Conventions of the cards

- **Text of the interface** in bold, word for word: **Delete document**, *The connection Production is read-only.*
  Labels, buttons, menu entries and titles are in sentence case; `…` ends an entry that asks something more. Where
  Mongoster already has the text of a message, a question or a confirmation, keep it word for word, with Datardo for
  Mongoster and sentence case for what was in title case (`Compare Structure With…` becomes **Compare structure
  with…**).
- **Keys** as `Ctrl+K`, `Shift+Enter`, `F5`. On macOS `Cmd` takes the place of `Ctrl`; the cards say `Ctrl`.
- **Numbers** (limits, defaults, timeouts) are Mongoster's where it has them. A number Datardo needs and Mongoster
  never had is chosen, and the card says *(Datardo's choice)* beside it.
- **Backticks** are for identifiers of cards, places, codes, commands, settings, keys, and text the user types or the
  engine receives. Never put in backticks a dotted lower-case name that starts with the prefix of an area and is not a
  card (a field named "user" dot "name", a file named "key" dot "pem"): the check reads it as a card that does not
  exist. Use another example (`customer.name`, `client.pem`).
- **Tools of the MCP server** keep Mongoster's names for MongoDB (`find_documents`); the tools for Redis start with
  `redis_` (`redis_scan_keys`).

## Areas

Each area has a file named after its prefix, in `features/`. Cross-references use these prefixes only.

### The app, for every engine

| File | Prefix | Area |
| --- | --- | --- |
| `window.md` | `window.` | The window itself: its frame without a title bar of the system, the top bar, the window's buttons, the theme, zoom, the size and place it remembers, one instance, the tray, the system's menu on macOS, About, quitting with work in progress. |
| `nav.md` | `nav.` | Getting around: the rail, the explorer, the connection island and the connection switcher, pins, the scope bar (Back, Forward, the path, Open on another connection), the inspector island, the status line, how dialogs and notifications behave, the keys that move between islands. |
| `tab.md` | `tab.` | The tab strip: opening, making active, closing, reordering, the groups by connection, what is restored at the next start, reopening a closed tab. |
| `palette.md` | `palette.` | Go to: what it finds, how it ranks, commands and their keys. |
| `home.md` | `home.` | The Home page: Jump back in, the connection cards, the filter by engine. |
| `connection.md` | `connection.` | Saved connections of every engine: add, the connection form, TLS and SSH tunnel, test, connect, disconnect, remove, folders, color, read-only, import and export, secrets, the Overview page. |
| `tree.md` | `tree.` | The tree island: the nodes of each engine, refresh, the filter, counts, the pages of the connection. |
| `runner.md` | `runner.` | What carries out every feature: questions, the confirmation with its plan, running the steps, the work in progress and Cancel, refusals and errors, notifications, the Log page. |
| `undo.md` | `undo.` | The undo history, for documents and for keys: recording, the page, undo, limits, per connection. |
| `task.md` | `task.` | Scheduled tasks: backups and exports that run by themselves. |
| `mcp.md` | `mcp.` | The MCP server for AI assistants and its tools, for both engines. |
| `settings.md` | `settings.` | The `datardo.*` settings and the Settings page. |

### MongoDB

| File | Prefix | Area |
| --- | --- | --- |
| `query.md` | `query.` | The query bar of the Documents section: filter, sort, projection, skip and limit, running and cancelling, the query builder, autocomplete, drag and drop into the bar, counting, mongosh syntax read and written. |
| `table.md` | `table.` | The table of the Documents section: rows and cells, how each BSON type is shown, nested fields and arrays as columns and sub-rows, the columns' layout, the selection, copying, paging. |
| `aggregate.md` | `aggregate.` | The pipeline editor: stages, templates, the result of each stage, text and stages, `$out` and `$merge`. |
| `saved-query.md` | `saved-query.` | Recent queries, and saved queries for me and in the queries folder. |
| `document.md` | `document.` | Reading and writing documents: the inspector, the document tab, editing a value in its cell, insert, duplicate, delete, the selected rows, update many, delete many, restoring a version. |
| `field.md` | `field.` | The column actions: rename, remove or convert a field. |
| `history.md` | `history.` | The document history: the writes to one document still in the oplog, and its versions. |
| `manage.md` | `manage.` | Create, rename and drop databases and collections; view definitions; validation rules. |
| `schema.md` | `schema.` | The Schema section: the analysis of a sample, types and values of each field. |
| `chart.md` | `chart.` | The Chart section. |
| `explain.md` | `explain.` | The Explain section: the summary of how a query or a pipeline ran, per shard too, and the index it suggests. |
| `codegen.md` | `codegen.` | The Code section: a query or a pipeline as code for mongosh, Node.js, Python, Java, C# and Go. |
| `index.md` | `index.` | The Indexes section: indexes and search indexes, listed, created, edited, hidden, dropped. |
| `advisor.md` | `advisor.` | The Index advisor page. |
| `search.md` | `search.` | The Search documents page: one text looked for across collections and databases. |
| `relation.md` | `relation.` | References between collections: finding them, the Relationship diagram page, Go from here. |
| `playground.md` | `playground.` | Playground tabs: running mongosh code, sessions, transactions, results. |
| `monitor.md` | `monitor.` | The Monitor page: server operations, slow queries and the profiler, statistics, replication, sharding. |
| `user.md` | `user.` | The Users and roles page. |
| `gridfs.md` | `gridfs.` | GridFS buckets and their files. |
| `watch.md` | `watch.` | The Watch changes page: change streams. |
| `transfer.md` | `transfer.` | Export, import, copy a collection, generate test documents. |
| `backup.md` | `backup.` | Back up and restore in mongodump's formats. |
| `compare.md` | `compare.` | The comparison of two collections, and copying documents from one side to the other. |
| `structure.md` | `structure.` | The comparison of two database structures, its script, Apply. |
| `oplog.md` | `oplog.` | Publishing writes to Redis for redis-oplog. |

### Redis

| File | Prefix | Area |
| --- | --- | --- |
| `key.md` | `key.` | Keys: the keys tab, scanning with a pattern and a type, a key's details, new key, rename, copy, expiry, delete, delete by pattern, export and import. |
| `value.md` | `value.` | Values: the key tab and the inspector for each type (string, hash, list, set, sorted set, stream), how bytes are shown, editing, adding and removing fields, elements, members and entries, large values a page at a time. |
| `console.md` | `console.` | The console tab: running commands, replies, history, autocomplete, what is refused and what is confirmed. |
| `pubsub.md` | `pubsub.` | The Pub/Sub page: subscribing to channels and patterns, the messages, publishing one. |
| `server.md` | `server.` | The Server page: information, clients, the slow log, memory and the largest keys, configuration as read. |

### Identifiers the other areas rely on

Written by the author of their area with exactly these names:

- `runner.ask`, `runner.confirm`, `runner.run`, `runner.progress`, `runner.cancel`, `runner.refuse`, `runner.notify`,
  `runner.log`.
- `window.single-instance`, `window.theme`, `window.tray`, `window.quit`.
- `nav.switch-connection`, `nav.pin`, `nav.back`, `nav.open-on-another-connection`, `nav.inspector`,
  `nav.status-line`, `nav.rail`.
- `tab.open`, `tab.close`, `tab.restore`.
- `palette.open`, `palette.commands`.
- `home.show`.
- `connection.add`, `connection.form`, `connection.connect`, `connection.disconnect`, `connection.remove`,
  `connection.read-only`, `connection.allow-changes`, `connection.secrets`, `connection.overview`,
  `connection.link-redis`.
- `tree.show`, `tree.refresh`, `tree.filter`.
- `undo.record`, `undo.show`, `undo.revert`, `undo.notification`, `undo.limits`.
- `task.show`, `task.run`, `task.tray`.
- `mcp.server`, `mcp.read-data`, `mcp.tab-tools`.
- `settings.read`, `settings.page`.
- `query.bar`, `query.run`, `query.parse`, `query.format`, `query.autocomplete`, `query.count`.
- `table.show`, `table.columns`, `table.selection`, `table.copy-as`.
- `aggregate.show`, `aggregate.run`.
- `saved-query.save`, `saved-query.recent`.
- `document.inspect`, `document.open`, `document.inline-edit`, `document.insert`, `document.delete`,
  `document.update-many`, `document.delete-many`, `document.restore-version`.
- `history.show`.
- `manage.create-collection`, `manage.drop-collection`, `manage.drop-database`, `manage.edit-view`,
  `manage.edit-validation`, `manage.generate-json-schema`.
- `schema.show`, `schema.analyze`; `chart.show`; `explain.show`; `codegen.show`; `index.show`, `index.create`;
  `advisor.show`; `search.show`.
- `relation.detect`, `relation.diagram`, `relation.follow`.
- `playground.open`, `playground.run`.
- `monitor.show`; `user.show`; `gridfs.show`; `watch.show`.
- `transfer.export`, `transfer.import`, `transfer.copy-collection`, `transfer.generate`; `backup.create`,
  `backup.restore`.
- `compare.show`, `compare.equality`; `structure.show`, `structure.apply`.
- `oplog.publish`.
- `key.show`, `key.scan`, `key.inspect`, `key.open`, `key.delete`; `value.show`, `value.format`;
  `console.show`, `console.run`; `pubsub.show`; `server.show`, `server.slow-log`.
