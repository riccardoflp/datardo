# Watch changes

The Watch changes page shows the writes to a collection, to a database or to the whole deployment while they happen,
read from a MongoDB change stream: who inserts, updates, replaces and deletes what, with the fields each update
changed, the document after it and, where the collection records pre-images, the document before.

A *change event* below is one event of a change stream: an insert, an update, a replacement, a delete, or one of the
others (drop, rename, dropDatabase, invalidate and the like). It is not an event of redis-oplog, which is a message
on Redis. The *type* of a change event is its `operationType`. The *resume token* of a change event is its `_id`:
given back to the server, it opens a stream right after that change event.

Nothing of this area writes to a document. One feature changes the options of a collection
(`watch.enable-pre-images`), and one writes a file (`watch.export`).

### `watch.show` — The Watch changes page

Shows the change events of a collection, a database or the whole deployment as they arrive, newest first.

- **Kind**: View
- **Engine**: MongoDB
- **Function**: `src/features/watch/show.ts › view(state)`
- **Entry points**: **Watch changes** under **Pages of** the connection in the tree island (`@tree`), for the whole
  deployment; **Watch changes** in the context menu of a database and of a collection (`@tree-menu`); **Watch** in
  the toolbar of the Documents section of a collection tab (`@toolbar`). Go to: **Watch changes**, on the collection
  or database of the active tab, otherwise on the whole deployment of the current connection. The tool `open_watch`
  of the MCP server (`mcp.tab-tools`).
- **Offered when**: on a MongoDB connection, for the deployment, a database or a collection. Not on a view: a change
  stream cannot be opened on one. It is offered on a read-only connection: watching writes nothing.
- **Reads**: the change stream (`watch.stream`); for a collection, whether it records pre-images:
  `db.getSiblingDB("shop").getCollectionInfos({ name: "orders" })`, where `options.changeStreamPreAndPostImages.enabled`
  says so.
- **Commands**: `watch.show`
- **Uses**: `tab.open`, `nav.inspector`, `watch.stream`, `watch.pipeline`, `watch.event-summary`,
  `watch.visible-events`, `watch.pause`, `watch.stop`, `watch.resume`, `watch.clear`, `watch.event-detail`,
  `watch.enable-pre-images`, `watch.copy-events`, `watch.export`, `mcp.tab-tools`.
- **Ported from**: `src/watch.ts` (`WatchPanel`), `src/webview/watch.ts`; the README, under **Watch Changes**.
  Mongoster has no card for the page.

The page opens in a page tab of the connection's group, titled **Watch: `<collection>`**, **Watch: `<database>`** or
**Watch: `<connection>`**, one for each thing watched: opening it again makes that tab active. The stream opens by
itself when the page opens, stays open while another tab is active, and is closed when the tab is closed
(`tab.close`).

What it shows, from the top:

1. A toolbar:
   - what is watched: `<database>.<collection>`, `<database>` or **all databases**;
   - the state of the stream: **Starting…**, **Watching**, **Stopped**, or **Paused · `<n>` new**;
   - **Pause**, which becomes **Resume (`<n>`)** (`watch.pause`); **Stop**, which becomes **Start**
     (`watch.stop`); **Start from the last change**, when the stream is stopped and can go on from where it was
     (`watch.resume`); **Clear** (`watch.clear`); **Export…** (`watch.export`).
2. The filters:
   - one toggle for each type, with the number of change events of that type: **insert**, **update**, **replace**,
     **delete**, **other** (tooltips *Show the insert events* and so on; for **other**, *drop, rename, dropDatabase,
     invalidate…*);
   - a search field, with the placeholder *Search the change events* (`watch.visible-events`);
   - **Filter**, with the tooltip *A $match on the change events, or a list of stages, applied by the server*, and
     the placeholder `{ "fullDocument.status": "active" }  —  Enter applies` (`watch.pipeline`);
   - the checkbox **Current document on update**, on at first, with the tooltip *On updates, also read the current
     version of the document*;
   - when one collection is watched, **Pre-images recorded** (tooltip *The collection stores the document before
     each change: updates show the values before.*), or *Values before a change: not recorded* (tooltip *The
     collection does not store pre-images (changeStreamPreAndPostImages).*) with **Enable…**
     (`watch.enable-pre-images`).
3. The count: *`<n>` change events*, or *`<shown>` of `<n>` change events* when the filters hide some, followed by
   *(`<d>` older dropped)* when the list lost its oldest.
4. The list, newest first, a line for each change event (`watch.event-summary`):
   - **time**: `HH:MM:SS.mmm`, with the full local date and time in the tooltip;
   - **type**: `insert`, `update`, `replace`, `delete`, or the type of another change event;
   - **collection**: `<database>.<collection>`, only when a database or the deployment is watched;
   - **_id**: the `_id` of the document, in mongosh syntax;
   - **changes**: for an update *set a, b · unset c · truncated d*; for an insert and a replacement the document,
     on one line; for a rename `→ <database>.<collection>`.

   The lines that have just arrived are highlighted for a moment.

Selecting a line, with a click or the arrow keys, shows the change event in the inspector island
(`watch.event-detail`).

Its states:

- *Starting*: *Starting the change stream…* in place of the list.
- *Watching, nothing yet*: *Waiting for changes… Insert, update or delete a document to see it here.*
- *Nothing matches*: *No change event matches the filters.*
- *Stopped*: with no change event in the list, *Not watching. Press Start.*; otherwise the list stays as it is.
- *Stream invalidated*: **Stopped**, with *The stream was invalidated: the collection or database was dropped or
  renamed.* above the list, and **Start from the last change**.
- *Standalone server*: the message of `watch.stream` above an empty list: *Change streams need a replica set or a
  sharded cluster: this server is a standalone. (A single-node replica set is enough, e.g. mongod --replSet rs0 and
  rs.initiate().)*
- *Error*: the server's message above the list, which keeps what it had; **Start** opens the stream again.
- *Read-only connection*: the page works as on any other; only **Enable…** is missing.

The tab remembers the text of **Filter**, **Current document on update**, the types hidden and the search. A tab
restored when Datardo starts (`tab.restore`) comes back with them, **Stopped** and with an empty list: Datardo opens
no stream by itself at start.

Acceptance:

- [ ] **Watch changes** on a collection of a replica set opens the tab **Watch: orders**, which says **Watching**
  and *Waiting for changes… Insert, update or delete a document to see it here.*
- [ ] Inserting a document in that collection, from Datardo or from anywhere else, adds a line `insert` at the top
  within a second or two, with its `_id` and the document under **changes**.
- [ ] Watching a database shows the **collection** column, and the writes to two of its collections arrive in the
  same list.
- [ ] **Watch changes** under **Pages of** the connection watches **all databases**, in a tab named after the
  connection.
- [ ] On a standalone server the page says *Change streams need a replica set or a sharded cluster: this server is a
  standalone. (A single-node replica set is enough, e.g. mongod --replSet rs0 and rs.initiate().)* and lists nothing.
- [ ] Dropping the watched collection adds its last change events (`drop`, `invalidate`), and the page says *The
  stream was invalidated: the collection or database was dropped or renamed.*
- [ ] The stream goes on while another tab is active: coming back, the change events of the meantime are in the list.
- [ ] Closing the tab closes the stream: the server no longer lists its cursor.
- [ ] Opening **Watch changes** twice on the same collection leaves one tab.
- [ ] A view has no **Watch changes** in its context menu.

### `watch.stream` — Open the change stream

Opens the change stream on what is watched, with the filter and the options of the page, and turns what it gives
into the change events of the list.

- **Kind**: Read
- **Engine**: MongoDB
- **Function**: `src/features/watch/stream.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: opening the page; **Start**, **Start from the last change**, `Enter` in **Filter** and the
  checkbox **Current document on update** (`@toolbar`).
- **Reads**: `db.adminCommand({ buildInfo: 1 })`, for the version of the server; then, for a collection,
  `db.getSiblingDB("shop").orders.watch(<pipeline>, <options>)`; for a database,
  `db.getSiblingDB("shop").watch(<pipeline>, <options>)`; for the deployment, `db.getMongo().watch(<pipeline>,
  <options>)`. The pipeline is that of `watch.pipeline`. The options: `maxAwaitTimeMS: 1000` always; `fullDocument:
  "updateLookup"` when **Current document on update** is on; `fullDocumentBeforeChange: "whenAvailable"` from MongoDB
  6.0; `resumeAfter` or `startAfter` with a resume token when the stream goes on from where it was (`watch.resume`).
  Every value is kept as stored, with its BSON type.
- **Refuses**: on a standalone server (error 40573, or a message saying change streams are only supported on replica
  sets): *Change streams need a replica set or a sharded cluster: this server is a standalone. (A single-node replica
  set is enough, e.g. mongod --replSet rs0 and rs.initiate().)* (`/standalone`); a **Filter** that cannot be read, as
  `watch.pipeline` says (`/invalid-filter`). Any other error of the server is shown as it is: a user without the
  permission to open a change stream, a stage the server does not accept.
- **Uses**: `watch.pipeline`, `watch.event-summary`, `watch.resume`. Used by `watch.show`.
- **Ported from**: `src/watch.ts` (`start`, `loop`, `push`, `flush`, `stop`, `explain`, `AWAIT_MS`, `FLUSH_MS`).

Rules:

1. Opening a stream closes the one the page had. While the server has not answered the page says **Starting…**; at
   the first answer, also an empty one, **Watching**.
2. The stream asks the server again every time it answers, and the server waits at most 1,000 milliseconds for a
   change before answering with nothing.
3. Each change event gets the next number of the page, starting from 1, and becomes a line (`watch.event-summary`).
   The change events are handed to the list together, at most once every 150 milliseconds, so that a burst of writes
   draws the list a few times a second and not once per write.
4. A change event `invalidate` is listed like the others; then the stream is closed and the page says **Stopped**
   with *The stream was invalidated: the collection or database was dropped or renamed.*
5. An error closes the stream; the change events received before it are in the list.
6. The page keeps the last resume token the stream gave, which moves forward also while no change event passes the
   filter (`watch.resume`).
7. Changing **Current document on update** or pressing `Enter` in **Filter** while the stream is open opens it again
   with the new options, from now; the list keeps what it had.

Acceptance:

- [ ] With **Current document on update** on, an update's change event carries the document as it is now; with it
  off, only the fields the update changed.
- [ ] On MongoDB 6.0 or later, on a collection that records pre-images, an update's change event carries the
  document before; on MongoDB 5.0 the stream opens without asking for it and no change event has one.
- [ ] A `Long`, a `Decimal128` and a date of a changed document are shown with their types, not as plain numbers
  and text.
- [ ] 500 inserts made in one second arrive all, in order, and the list is drawn at most 7 times in that second.
- [ ] On a standalone server it refuses with `/standalone` and the message above.
- [ ] A user without the role to open a change stream gets the server's own message, and the page says nothing of
  a standalone.
- [ ] Pressing `Enter` in **Filter** with `{ operationType: "delete" }` opens the stream again: from then on only
  deletes arrive, and the lines already in the list stay.
- [ ] Nothing is written to the deployment by opening, reading or closing a stream.

### `watch.pipeline` — The filter the server applies

Turns the text of **Filter** into the pipeline of the change stream.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/watch/pipeline.ts › watchPipeline(text)`
- **Uses**: `query.parse` (reads mongosh syntax). Used by `watch.stream`.
- **Ported from**: `src/watch.ts` (`start`: the `$match` built from the text), `src/webview/watch.ts` (the `$match`
  field). The list of stages is new in Datardo.

Input: the text of **Filter**, in mongosh syntax. Output: the stages, or a refusal with its message.

Rules:

1. Empty text, or only spaces: no stage. Every change event arrives.
2. A document `{ … }` becomes one stage, `{ $match: <the document> }`. It is matched against the change event, not
   against the document: a field of the document is `fullDocument.<field>`, the type is `operationType`, the fields
   an update changed are under `updateDescription.updatedFields`.
3. A list `[ … ]` is taken as the stages themselves. Each must be a document with one key among those a change
   stream accepts: `$match`, `$project`, `$addFields`, `$set`, `$unset`, `$replaceRoot`, `$replaceWith`, `$redact`.
   Another stage is refused: *A change stream doesn't accept the stage `<stage>`.*
4. Anything else is refused: *The filter must be a document { … } or a list of stages [ … ].* Text that cannot be
   read is refused with *Invalid filter:* and what the parser found.
5. Values keep their types: `ObjectId("…")`, `ISODate("…")`, `NumberLong(…)` and `/regex/i` are sent as such.
6. A stage that removes the `_id` of the change events takes away their resume token: the server refuses the stream,
   and its message is shown.

Examples:

| Text | Pipeline |
| --- | --- |
| (empty) | `[]` |
| `{ "fullDocument.status": "active" }` | `[ { $match: { "fullDocument.status": "active" } } ]` |
| `{ operationType: { $in: ["insert", "delete"] } }` | `[ { $match: { operationType: { $in: ["insert", "delete"] } } } ]` |
| `{ "documentKey._id": ObjectId("65f0c1a2b3c4d5e6f7a8b9c0") }` | one `$match` on that `_id`, as an `ObjectId` |
| `[ { $match: { operationType: "update" } }, { $project: { "fullDocument.card": 0 } } ]` | those two stages |
| `[ { $group: { _id: "$operationType" } } ]` | refused: *A change stream doesn't accept the stage $group.* |
| `"active"` | refused: *The filter must be a document { … } or a list of stages [ … ].* |
| `{ status: ` | refused: *Invalid filter: …* |

Acceptance:

- [ ] Each row of the table above gives its result.
- [ ] With `{ "fullDocument.status": "active" }`, an insert of `{ status: "active" }` arrives and one of `{ status:
  "new" }` does not.
- [ ] With `{ "fullDocument.status": "active" }` and **Current document on update** off, updates do not arrive: they
  carry no document to match.
- [ ] A refused text opens no stream: the page shows the message, and the stream it had stays as it was.
- [ ] A list with a stage that is a document of two keys is refused.

### `watch.event-summary` — The line of a change event

Reads from a change event what its line of the list shows.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/watch/event-summary.ts › eventSummary(change, number)`
- **Uses**: `query.format` (writes mongosh syntax). Used by `watch.stream`, `watch.show`, `watch.visible-events`,
  `watch.event-detail` and `watch.event-diff`.
- **Ported from**: `src/watch.ts` (`toEvent`, `SUMMARY_MAX`).

Inputs: a change event as canonical Extended JSON, as the stream gave it; its number in the page. Output: the number,
the time, the type, the database and the collection, the `_id` as text, the text of **changes**, the fields the
update set, removed and truncated, the document before and the document after when the change event has them, the
resume token, and the change event itself.

Rules:

1. The time is `wallTime`; without it, the seconds of `clusterTime`; without that, the moment it was received.
2. The type is `operationType`.
3. The collection is `ns.db` and `ns.coll` joined by a dot; a change event of a whole database has only the
   database.
4. The `_id` is `documentKey._id` in mongosh syntax; empty when the change event is not about a document.
5. The text of **changes**:
   - an update: *set* and the keys of `updateDescription.updatedFields`, *unset* and `removedFields`, *truncated* and
     the fields of `truncatedArrays`, each list joined by commas, the three parts joined by ` · `, the empty ones
     left out;
   - an insert or a replacement that carries the document: the document in mongosh syntax on one line, cut after
     200 characters with `…`;
   - a rename: `→` and the new `<database>.<collection>`, from `to`;
   - anything else: empty.
6. The document after is `fullDocument`, the document before is `fullDocumentBeforeChange`.
7. The resume token is the `_id` of the change event.

Examples (received on the collection `orders` of the database `shop`):

| Change event | Type | _id | Changes |
| --- | --- | --- | --- |
| `{ operationType: "insert", documentKey: { _id: 7 }, fullDocument: { _id: 7, status: "new" } }` | `insert` | `7` | `{ _id: 7, status: "new" }` |
| `{ operationType: "update", documentKey: { _id: 7 }, updateDescription: { updatedFields: { status: "paid", "items.1.qty": 5 }, removedFields: ["note"], truncatedArrays: [] } }` | `update` | `7` | *set status, items.1.qty · unset note* |
| `{ operationType: "update", documentKey: { _id: 7 }, updateDescription: { updatedFields: {}, removedFields: [], truncatedArrays: [ { field: "tags", newSize: 2 } ] } }` | `update` | `7` | *truncated tags* |
| `{ operationType: "replace", documentKey: { _id: ObjectId("65f0c1a2b3c4d5e6f7a8b9c0") }, fullDocument: { … } }` | `replace` | `ObjectId("65f0c1a2b3c4d5e6f7a8b9c0")` | the document, on one line |
| `{ operationType: "delete", documentKey: { _id: 7 } }` | `delete` | `7` | |
| `{ operationType: "rename", ns: { db: "shop", coll: "orders" }, to: { db: "shop", coll: "orders_old" } }` | `rename` | | `→ shop.orders_old` |
| `{ operationType: "drop", ns: { db: "shop", coll: "orders" } }` | `drop` | | |

Acceptance:

- [ ] Each row of the table above gives its line.
- [ ] An insert of a document whose text is 5,000 characters long gives 200 characters and `…` under **changes**,
  and the whole document in the detail.
- [ ] A change event without `wallTime` (MongoDB before 6.0) takes its time from `clusterTime`.
- [ ] An `_id` that is a `Long` is written `NumberLong("…")`, and one that is a sub-document as that document.

### `watch.visible-events` — The change events the list shows

Keeps the newest change events up to the cap, and says which of them pass the type toggles and the search.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/watch/visible-events.ts › keepNewest(events, added)` and `› visibleEvents(events,
  hiddenTypes, search)`
- **Entry points**: the type toggles and the search field of the page (`@toolbar`).
- **Uses**: `watch.event-summary`. Used by `watch.show`, `watch.copy-events` and `watch.export`.
- **Ported from**: `src/webview/watch.ts` (`add`, `MAX_EVENTS`, `category`, `matches`, `render`).

Rules:

1. **The cap.** The page keeps the newest **1,000** change events. Adding more drops the oldest and counts them:
   the page says *(`<d>` older dropped)*. A dropped change event is gone from the list, from the search and from the
   inspector.
2. **The types.** Each change event is of one of five types for the toggles: `insert`, `update`, `replace`,
   `delete`, and **other** for every other `operationType`. A toggle shows the number of kept change events of its
   type, hidden or not. Turning a toggle off hides those lines; they are still received and kept.
3. **The search.** With text in the search field, a change event is shown when the text is, without regard to case,
   in its type, in its `<database>.<collection>`, in its `_id`, in the text of **changes**, or in the JSON of the
   document after and of the fields the update set.
4. The toggles and the search hide lines in the page only: they ask the server nothing. What the server sends is
   narrowed by **Filter** (`watch.pipeline`).
5. The lines shown are in order of arrival, newest first.
6. The count says *`<n>` change events* (*1 change event*) when none is hidden, otherwise *`<shown>` of `<n>` change
   events*.

Examples (the page holds 3 inserts, 2 updates and 1 drop):

| Toggles off | Search | Shown | Count |
| --- | --- | --- | --- |
| none | (empty) | all 6 | *6 change events* |
| **update** | (empty) | 3 inserts, 1 drop | *4 of 6 change events* |
| **insert**, **update**, **delete**, **replace** | (empty) | the drop | *1 of 6 change events* |
| none | `PAID` | the lines with `paid` in a value set or in the document | *`<shown>` of 6 change events* |
| none | `drop` | the drop | *1 of 6 change events* |

Acceptance:

- [ ] Each row of the table above gives its lines and its count.
- [ ] With 1,000 change events in the list, 5 more leave 1,000, the newest, and the page says *(5 older dropped)*.
- [ ] The toggle **update** off and 10 updates arriving: the list does not change and the toggle counts 10 more.
- [ ] Searching the value of a field that only the document after has finds its change event.
- [ ] With every toggle off the page says *No change event matches the filters.*

### `watch.pause` — Pause and resume the list

Holds the new change events out of the list while the user reads it, without closing the stream.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/watch/pause.ts › plan(context, answers)`
- **Entry points**: **Pause** in the toolbar of the page (`@toolbar`), with the tooltip *Hold the new change events
  without stopping the stream*; it becomes **Resume**, or **Resume (`<n>`)** with the number held.
- **Offered when**: the stream is starting or watching.
- **Plan**: no step: it writes nothing.
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone: nothing is written.
- **After**: paused, the state says **Paused**, then **Paused · `<n>` new** as change events arrive; the list does
  not move. **Resume** adds the held change events to the list, in order, under the cap of `watch.visible-events`.
- **Uses**: `watch.stream`, `watch.visible-events`. Used by `watch.show`.
- **Ported from**: `src/webview/watch.ts` (the `pause` button, `held`, `renderStatus`).

While paused the page holds at most 1,000 change events *(Datardo's choice: the cap of the list, since more would be
dropped on **Resume** anyway; Mongoster holds them without a bound)*; the older ones are dropped and counted with
those the list dropped.

Acceptance:

- [ ] **Pause**, then 3 inserts: the list shows none of them, the state says **Paused · 3 new** and the button
  **Resume (3)**.
- [ ] **Resume** adds the 3 at the top in the order they happened, and the state says **Watching**.
- [ ] When the stream stops or fails while paused, the held change events are added to the list and the pause ends.
- [ ] **Clear** while paused also empties what is held.
- [ ] Paused for 1,500 change events, **Resume** shows the newest 1,000 and the page counts the others as dropped.
- [ ] It works on a read-only connection.

### `watch.stop` — Stop and start the stream

Closes the change stream, and opens it again from now.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/watch/stop.ts › plan(context, answers)`
- **Entry points**: **Stop** in the toolbar of the page (`@toolbar`), with the tooltip *Close the change stream*;
  when the stream is stopped or in error it is **Start**, with the tooltip *Open the change stream (changes made
  while stopped are not shown)*.
- **Plan**: no step: it writes nothing.
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone: nothing is written.
- **After**: **Stop** closes the stream and its cursor on the server; the state says **Stopped**, a pause ends and
  what was held is added to the list, which stays. **Start** ends a pause and opens the stream as `watch.stream`
  says, from now: what was written in between is not shown, unless **Start from the last change** is used instead
  (`watch.resume`).
- **Uses**: `watch.stream`, `watch.resume`. Used by `watch.show`.
- **Ported from**: `src/watch.ts` (`stop`, `start`), `src/webview/watch.ts` (the `startStop` button, `start`).

Acceptance:

- [ ] **Stop** makes the state **Stopped**; a write made after it adds no line.
- [ ] **Start** after it makes the state **Starting…** and then **Watching**; a write made after it adds a line, and
  the write made while stopped is not there.
- [ ] After **Stop** with an empty list the page says *Not watching. Press Start.*
- [ ] After an error, **Start** opens the stream again with the **Filter** and the options of the page.
- [ ] It works on a read-only connection.

### `watch.resume` — Start again from the last change event

Opens the stream right after the last change event the page received, with its resume token, so that what was
written while the stream was closed is not lost: after **Stop**, after an error, and after the drop or the rename
that invalidated the stream.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/watch/resume.ts › plan(context, answers)`
- **Entry points**: **Start from the last change** in the toolbar of the page, beside **Start** (`@toolbar`), with
  the tooltip *Open the change stream right after the last change event received, so that nothing is missed*.
- **Offered when**: the stream is stopped or in error, and the page has a resume token: the stream gave one before
  it closed.
- **Reads**: the stream of `watch.stream`, with `resumeAfter: <the resume token>`; after an `invalidate`, with
  `startAfter: <the resume token of the invalidate>`, because the server refuses `resumeAfter` there.
- **Plan**: no step: it writes nothing.
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone: nothing is written.
- **After**: the change events made in between arrive first, in order, with their own times, and then the new ones.
  After a drop, the stream watches the collection of that name again: it lists the writes to the collection created
  again with the same name.
- **Refuses**: when the oplog no longer holds the point of the resume token (error 286, `ChangeStreamHistoryLost`):
  *The changes after the last change event are no longer in the oplog: the stream can only start from now.*
  (`/history-lost`), with **Start**; when the server no longer accepts the resume token for another reason, its
  message.
- **Uses**: `watch.stream`, `watch.stop`. Used by `watch.show`.
- **Ported from**: *New in Datardo*. Mongoster's page only starts from now; its MCP tool `watch_changes` resumes
  with a token (`src/mcp/changes.ts`).

The resume token is the last one the stream gave: that of the last change event received, or a later one the
server gave while no change event passed the filter. It is kept with the tab while Datardo runs, and is not kept
across a restart. The **Filter** may be changed before starting again: the token still holds.

Acceptance:

- [ ] **Stop**, two inserts from elsewhere, **Start from the last change**: the two inserts arrive, with the times
  at which they were made, and nothing is listed twice.
- [ ] **Stop**, two inserts, **Start**: neither arrives.
- [ ] After the watched collection is dropped and created again with one insert, **Start from the last change**
  lists that insert; the request carries `startAfter`.
- [ ] After **Stop**, the request of **Start from the last change** carries `resumeAfter` and not `startAfter`.
- [ ] With a resume token older than the oplog it says *The changes after the last change event are no longer in the
  oplog: the stream can only start from now.*, and **Start** works.
- [ ] A page that never opened a stream (a standalone server, a tab just restored) has no **Start from the last
  change**.
- [ ] **Clear** does not forget the resume token.

### `watch.clear` — Clear the list

Empties the list of change events.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/watch/clear.ts › plan(context, answers)`
- **Entry points**: **Clear** in the toolbar of the page (`@toolbar`), with the tooltip *Remove the change events
  from the list*.
- **Plan**: no step: it writes nothing.
- **Danger**: None. It asks nothing: the change events are a view of what happened, not data.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone: nothing is written.
- **After**: the list, what a pause holds and the count of the dropped are empty; the inspector island shows nothing;
  the stream goes on as it was, and the next change event has the next number.
- **Uses**: `watch.visible-events`. Used by `watch.show`.
- **Ported from**: `src/webview/watch.ts` (the `clear` button).

Acceptance:

- [ ] **Clear** on a list of 40 change events leaves *Waiting for changes… Insert, update or delete a document to
  see it here.* while the stream is open, and the toggles count 0.
- [ ] A write made after **Clear** adds a line.
- [ ] After **Clear** the count no longer says *older dropped*.
- [ ] **Clear** on a stopped page leaves *Not watching. Press Start.*

### `watch.event-detail` — A change event in the inspector

Shows the selected change event: what changed, the documents it carries, and the change event as the server sent it.

- **Kind**: View
- **Engine**: MongoDB
- **Function**: `src/features/watch/event-detail.ts › view(state)`
- **Entry points**: selecting a line of the list, with a click or the arrow keys (`@list`); `Enter` on it shows the
  inspector island when it is hidden and moves the focus into it.
- **Reads**: nothing: the change event as received.
- **Uses**: `nav.inspector`, `watch.event-summary`, `watch.event-diff`, `watch.copy-events`, `document.open`,
  `document.inspect`, `query.format`.
- **Ported from**: `src/webview/watch.ts` (`detail`, `diff`, `changesTable`, `section`).

What it shows, from the top:

1. The type, the `<database>.<collection>`, the `_id` and the full local date and time.
2. The buttons: **Open document**, with the tooltip *Open the current version of the document in a document tab*
   (`document.open`), when the change event has an `_id` and a collection and is not a delete; **Copy event**
   (`watch.copy-events`).
3. The sections that apply, each a document as a tree and as mongosh text, as `document.inspect` shows one, with
   nothing to edit:
   - an update: **Changes**, a table **field**, **before**, **after** of what `watch.event-diff` gives; without the
     document before, **Changes (the values before are not recorded)**, a table **field**, **value**. A removed
     field shows *(removed)*, a truncated array *truncated to `<n>` elements*, a missing value `—`. With no row:
     *No field changed.*
   - an insert: **Inserted document**.
   - a replacement: with the document before, **Changes** as for an update; without it, **New document**.
   - a delete: **Deleted document**, the document before; without it, *Not recorded: the collection does not store
     pre-images.*
   - an update or a replacement: **Current document**, folded; without it, *Current document (not read: enable
     "Current document on update", or the document was deleted)*.
   - always, last and folded: **Change event**, the change event as the server sent it.

Its states: *nothing selected* (**Select a change event to see what it changed.**); the selected change event
dropped by the cap or by **Clear**: back to *nothing selected*.

Acceptance:

- [ ] An update of `status` on a collection that records pre-images shows **Changes** with one row: `status`, the
  value before, the value after.
- [ ] The same update on a collection that does not shows **Changes (the values before are not recorded)** with
  `status` and its new value.
- [ ] A delete on a collection that records pre-images shows **Deleted document** with the whole document; on one
  that does not, *Not recorded: the collection does not store pre-images.*
- [ ] An insert shows **Inserted document** with every type as stored: `ObjectId("…")`, `ISODate("…")`,
  `NumberLong("…")`.
- [ ] **Open document** on an update opens the document as it is now in a document tab; a delete and a `drop` have
  no **Open document**.
- [ ] With **Current document on update** off, an update says *Current document (not read: enable "Current document
  on update", or the document was deleted)*.
- [ ] **Change event** shows the resume token (`_id`), `clusterTime` and `documentKey` as received.
- [ ] Nothing in the inspector can be edited.

### `watch.event-diff` — What a change event changed

Gives, field by field, what an update or a replacement changed, with the value before when the change event carries
the document before.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/watch/event-diff.ts › eventDiff(event)`
- **Uses**: `watch.event-summary`. Used by `watch.event-detail`.
- **Ported from**: `src/webview/watch.ts` (`diff`, `flatten`, `getPath`).

Input: a change event as `watch.event-summary` gives it. Output: rows, each with a field path, a kind (*added*,
*changed*, *removed* or *truncated*), the value before and the value after when known, and a note.

Rules:

1. A change event with the fields of an update:
   - each field set gives a row with its new value: *added* when the document before is there and does not have the
     field path, *changed* otherwise; its value before is read from the document before by field path, when it is
     there;
   - each field removed gives a row *removed*, with its value before when the document before is there;
   - each truncated array gives a row *truncated*, with the note *truncated to `<n>` elements* (*1 element*).
2. A change event without them that has both the document before and the document after (a replacement on a
   collection that records pre-images): both documents are flattened to their innermost fields, going into
   sub-documents and not into arrays, and compared by field path: only before gives *removed*, only after *added*,
   on both with different values *changed*. Equal values give no row.
3. Any other change event gives no row.
4. Two values are different when their canonical Extended JSON differs: `1` as an `Int32` and as a `Double` are a
   change.

Examples:

| Change event | Rows |
| --- | --- |
| update, set `{ status: "paid" }`, no document before | `status` changed: → `"paid"` |
| update, set `{ status: "paid" }`, before `{ _id: 7, status: "new" }` | `status` changed: `"new"` → `"paid"` |
| update, set `{ note: "gift" }`, before `{ _id: 7 }` | `note` added: — → `"gift"` |
| update, removed `["note"]`, before `{ _id: 7, note: "gift" }` | `note` removed: `"gift"` → *(removed)* |
| update, set `{ "address.city": "Rome" }`, before `{ _id: 7, address: { city: "Milan" } }` | `address.city` changed: `"Milan"` → `"Rome"` |
| update, truncated `[ { field: "tags", newSize: 2 } ]` | `tags` truncated: *truncated to 2 elements* |
| replace, before `{ _id: 7, a: 1, b: { c: 2 } }`, after `{ _id: 7, a: 1, b: { c: 3 }, d: [1] }` | `b.c` changed: `2` → `3`; `d` added: — → `[1]` |
| replace, no document before | none |
| insert | none |

Acceptance:

- [ ] Each row of the table above gives its rows.
- [ ] A replacement that changes one element of an array gives one row for the whole array, with the two arrays.
- [ ] A replacement with the same document gives no row, and the detail says *No field changed.*
- [ ] An update that sets a field from `Int32(1)` to `Double(1)`, with the document before, gives a row *changed*.

### `watch.enable-pre-images` — Record pre-images of a collection

Turns on, for the watched collection, the option that makes MongoDB keep the document before each change, so that
the page can show the values before.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/watch/enable-pre-images.ts › plan(context, answers)`
- **Entry points**: **Enable…** beside *Values before a change: not recorded* in the page (`@toolbar`), with the
  tooltip *Record the document before each change (collMod)*.
- **Offered when**: one collection is watched, it does not record pre-images, and the connection is not read-only.
  The mark and its button are not shown when a database or the deployment is watched, nor on a server before
  MongoDB 6.0, which has no pre-images.
- **Asks**: nothing but the confirmation.
- **Plan**: titled *Record pre-images of shop.orders?*, with the line *Enables changeStreamPreAndPostImages on the
  collection (collMod): from now on, the document before each update, replace and delete is stored, so it can be
  shown here. It uses storage, and is a change to the collection options.* One step:
  `db.getSiblingDB("shop").runCommand({ collMod: "orders", changeStreamPreAndPostImages: { enabled: true } })`.
- **Danger**: Confirm, with the button **Enable**.
- **Read-only**: Refused: *The connection `<name>` is read-only: the collection options can't be changed.*
  (`/read-only`).
- **Undo**: Cannot be undone: it changes the options of the collection, not its documents. The same command with
  `enabled: false` turns it off again.
- **After**: the page reads the options of the collection again and says **Pre-images recorded**. The stream stays
  open: it already asks for the document before when there is one, so the change events of the writes made from now
  on carry it.
- **Refuses**: `/read-only`, above; an error of the server: *Pre-images not enabled: `<the server's message>`*.
- **Uses**: `runner.confirm`, `runner.run`, `connection.read-only`. Used by `watch.show`.
- **Ported from**: `src/watch.ts` (`enablePreImages`, `preImages`), `src/webview/watch.ts` (the `preImages` mark).

Acceptance:

- [ ] On a collection without pre-images the page says *Values before a change: not recorded* and **Enable…**; the
  confirmation has the title, the line and the step above, and the button **Enable**.
- [ ] After **Enable** the page says **Pre-images recorded**, and the next update of a document shows **Changes**
  with the values before, without starting the stream again.
- [ ] The collection's options then have `changeStreamPreAndPostImages: { enabled: true }`, and nothing else of them
  changed.
- [ ] Cancelling the confirmation runs nothing.
- [ ] On a read-only connection there is no **Enable…**, and the feature started any other way is refused with *The
  connection `<name>` is read-only: the collection options can't be changed.*
- [ ] A user without the permission to run `collMod` gets *Pre-images not enabled:* and the server's message, and
  the page still says *Values before a change: not recorded*.
- [ ] Nothing is added to the undo history, and the Log has the step as it was sent.
- [ ] Watching a database shows neither the mark nor **Enable…**.

### `watch.copy-events` — Copy change events

Copies one change event, or those the list shows, as text.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/watch/copy-events.ts › plan(context, answers)`
- **Entry points**: **Copy event** in the inspector, on the change event shown (`@inspector`), and in the context
  menu of a line of the list (`@item-menu`); `Ctrl+C` on the selected line (`@list`); **Copy the events shown** in
  the context menu of a line (`@item-menu`).
- **Plan**: no step: it writes nothing.
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone: nothing is written.
- **After**: the clipboard has the change event as the server sent it, in mongosh syntax on several lines
  (`query.format`); for **Copy the events shown**, a list `[ … ]` of those that pass the toggles and the search
  (`watch.visible-events`), oldest first. The status line says *Copied to the clipboard*.
- **Uses**: `watch.visible-events`, `query.format`, `nav.status-line`. Used by `watch.show` and
  `watch.event-detail`.
- **Ported from**: `src/webview/watch.ts` (**Copy event** of `detail`), `src/watch.ts` (the `copy` message). Copying
  the events shown is new in Datardo.

Acceptance:

- [ ] **Copy event** on an insert copies the change event with its `_id` (the resume token), `operationType`,
  `documentKey` and `fullDocument`, with `ObjectId("…")` and `ISODate("…")` as their types need.
- [ ] `Ctrl+C` on the selected line copies the same text.
- [ ] **Copy the events shown** with the toggle **update** off copies no update; with 3 lines shown it copies a
  list of 3, the oldest first.
- [ ] The status line says *Copied to the clipboard*.
- [ ] It works on a read-only connection.

### `watch.export` — Export the change events to a file

Writes the change events of the list to a file, one per line, with every type kept.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/watch/export.ts › plan(context, answers)`
- **Entry points**: **Export…** in the toolbar of the page (`@toolbar`). Go to: **Export change events**, on the
  active Watch changes page.
- **Offered when**: the list holds at least one change event.
- **Asks**: which ones, **The `<shown>` shown** or **All `<n>`**, asked only when the toggles or the search hide
  some; then the file, in the system's dialog for saving, which proposes `watch-<collection, database or
  connection>-<yyyyMMdd-HHmmss>.jsonl` and asks before replacing a file.
- **Plan**: one file step, `write C:\exports\watch-orders-20261118-101500.jsonl`.
- **Danger**: None.
- **Read-only**: Allowed, because it writes a file and nothing to a deployment.
- **Undo**: Cannot be undone: it writes a file, which the user can delete.
- **After**: a notification, *Exported `<n>` change events to `<file>`*, with **Show in folder**. The list and the
  stream are untouched.
- **Refuses**: with an empty list (`/nothing-to-export`): *There is no change event to export.*; a file that cannot
  be written: the system's message.
- **Uses**: `watch.visible-events`, `runner.ask`, `runner.run`, `runner.notify`. Used by `watch.show`.
- **Ported from**: *New in Datardo*.

The file is JSON Lines in UTF-8 *(Datardo's choice)*: one change event on each line, as canonical Extended JSON, so
that every BSON type survives, oldest first. Each line is the change event as the server sent it: its `_id` (the
resume token), `operationType`, `clusterTime`, `ns`, `documentKey`, and `updateDescription`, `fullDocument` and
`fullDocumentBeforeChange` when it has them. The change events a pause holds are not in the list and are not
written; those the cap dropped are gone.

Acceptance:

- [ ] **Export…** on a list of 3 change events writes a file of 3 lines, each a JSON document, the oldest first.
- [ ] A `Long` of a changed document is written `{ "$numberLong": "…" }` and a date `{ "$date": { "$numberLong":
  "…" } }`.
- [ ] With the toggle **delete** off and a delete in the list, it asks **The `<shown>` shown** or **All `<n>`**, and
  the file has the delete only with the second.
- [ ] With nothing hidden it asks only for the file.
- [ ] The notification says *Exported 3 change events to …* and **Show in folder** shows the file.
- [ ] It works on a read-only connection, and while the stream is open: a change event arriving during the export
  is not in the file.
- [ ] The first line's `_id`, given to the MCP tool `watch_changes` as `resumeAfter`, is accepted as a resume
  token.
