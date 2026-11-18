# Document history

The writes to one document that are still in the oplog of its replica set, newest first, and the versions of the
document rebuilt from them: what each write changed, who made it, the document after it, and how far back the oplog
goes. The oplog keeps the new values of an update and never the old ones, so a version is *exact* only when it can be
rebuilt from an insert or a replacement still in the oplog, or when it is the current document; the others are
*partial*, with `?` where a value is not known. Putting a version back is the document area's
`document.restore-version`.

A *write* below is one insert, update, replacement or delete of the document found in the oplog, on its own or
inside a transaction, or a drop or rename of its collection. Nothing of this area writes to a deployment.

### `history.show` — The document history page

Lists the writes to one document that are still in the oplog, newest first, and shows the version after each.

- **Kind**: View
- **Engine**: MongoDB
- **Function**: `src/features/history/show.ts › view(state)`
- **Entry points**: **History** in the inspector, under the document (`@inspector`); **History…** in the context menu
  of a row (`@row-menu`); **History** in the toolbar of a document tab (`@toolbar`). Go to: **Document history**, on
  the selected row or the active document tab.
- **Offered when**: on a document with an `_id`, of a collection, in **Find**: not on a view, not on the result of a
  pipeline, not on a new document that was not inserted yet. It is offered on a read-only connection: only restoring
  is refused there.
- **Reads**: whether there is an oplog to read and how far back it goes (`history.oplog-window`); the document's
  writes, one part of the oplog at a time (`history.read-writes`); the document as it is now (`document.read`);
  Datardo's own writes to the document (`history.own-writes`).
- **Refuses**: started from Go to with no document selected: *Open a document of a collection first: a new document
  has no history yet.* (`/no-document`).
- **Commands**: `history.show`
- **Uses**: `tab.open`, `nav.inspector`, `history.oplog-window`, `history.read-writes`, `history.versions`,
  `history.diff`, `history.own-writes`, `history.version-detail`, `history.copy-version`, `document.read`,
  `document.open`, `document.restore-version`.
- **Ported from**: `src/docHistory.ts` (`DocumentHistoryPanel`), `src/webview/docHistory.ts`; the README, under
  **Document history**. Mongoster has no card for the page.

The page opens in a tab of the connection's group, titled **History: `<_id>`**, one per document: opening it again
for the same document makes that tab active and reads the oplog again from the newest write.

What it shows, from the top:

1. A toolbar: `<database>.<collection>` and `_id: <_id>`; **Open document** (tooltip *Open the document as it is now
   in a document tab*, `document.open`); **Refresh** (tooltip *Read the oplog again*).
2. The line on the oplog: *The oplog goes back to `<date and time>` (`<duration>`): older writes are no longer
   there.*, or *The oplog is empty.*, then *`<n>` writes found in `<s>` s.* (*1 write found …*), the seconds with one
   decimal. The duration is between the oplog's first and last oplog entry: `45 s` under two minutes, `45 min` under
   an hour, `3.2 h` under three days, `12.0 days` beyond.
3. The message of the last restore, when there was one (`document.restore-version`).
4. When `history.versions` reports a conflict: *Some writes rebuilt from an insert lead to a different document than
   the one there is now (writes missing from the oplog read, or made while reading): those versions are shown from
   the current document instead.*
5. The list of writes, newest first, one line each:
   - **time**: the local date and time of the write; its tooltip has the ISO time and the oplog timestamp,
     `Timestamp({ t: <t>, i: <i> })`.
   - **write**: *Insert*, *Update*, *Replace*, *Delete*, *Removed* (the collection or its database was dropped, or
     the collection was renamed away) or *Renamed* (another collection was renamed into this one).
   - **changes**: *inserted a document of `<n>` fields*; *replaced with a document of `<n>` fields*; *deleted*; for an
     update *set a, b · unset c · resized items to 2* (`history.update-changes`), or *no change*; for a drop or a
     rename what happened to the collection (`history.document-writes`).
   - **by**: who or what made the write. **Datardo**, with the tooltip *Written from Datardo: `<title>` (in the Undo
     history)* (`history.own-writes`); *transaction*, with its session and transaction number and, when they apply,
     *part of a large transaction (several oplog entries)* and *prepared transaction*; *batch*, with *One command
     writing several documents, logged as one applyOps*; *retryable write*, with its session; *chunk migration*, with
     *Written by the balancer moving a chunk to another shard, not by a client*.
   - **version**: *current* (tooltip *The document as it is now*) on the newest write of a document that exists;
     *partial* (*Some values of this version aren't known: `<field paths>`*); *unknown* (*What the document was at this
     point isn't known: the write before it isn't in the part of the oplog read*); *no document* (*The document
     didn't exist after this write*); nothing for an exact version.
   - **Restore…**, or **Insert again…** when the document no longer exists, on an exact version that is not the
     current one (`document.restore-version`).
6. After the list, when the oplog was read back to its first oplog entry and the document existed before the oldest
   write found: *Older versions are no longer in the oplog.*
7. When the oplog was not read back to its first oplog entry: *The oplog was read back to `<date and time>`. Older
   writes of this document may be in the rest.*, starting with *Reading stopped at the time limit: the oplog was read
   back to …* when the read ran out of time, and **Load older** (tooltip *Read the older part of the oplog*).

Selecting a write, with a click or the arrow keys, shows its version in the inspector island
(`history.version-detail`). When the page first loads, the newest write is selected.

Its states:

- *Loading*: **Reading the oplog…**; **Refresh**, **Load older** and the restore buttons are disabled. While
  **Load older** reads: *Reading older entries of the oplog…*, with the list as it is.
- *Empty*: *No write to this document is left in the oplog: it was last written before `<date and time of the oplog's
  first oplog entry>`.* when the whole oplog was read; otherwise *No write to this document in the part of the oplog
  read: Load older reads further back.*
- *No oplog*: the message of `history.oplog-window` in place of the list: on a standalone server *A standalone server
  has no oplog, so there is no history of the writes: it needs a replica set. A single-node one is enough (mongod
  --replSet rs0, then rs.initiate()).*; through a mongos, for a view and without the permission, its other messages.
- *Error*: the server's message in place of the list; **Refresh** reads again.
- *Read-only connection*: the page works; the restore buttons are disabled, with the tooltip *The connection
  `<name>` is read-only.*

Acceptance:

- [ ] **History** on a document inserted and then updated twice lists three writes, newest first: two *Update* and
  one *Insert*, the newest marked *current* and selected.
- [ ] An update that set `status` and unset `note` reads *set status · unset note* under **changes**.
- [ ] A write made inside a transaction says *transaction* under **by**, with its session in the tooltip.
- [ ] A write made from Datardo says **Datardo** under **by**, with the title it has in the undo history.
- [ ] On a standalone server the page shows *A standalone server has no oplog, so there is no history of the writes:
  it needs a replica set. A single-node one is enough (mongod --replSet rs0, then rs.initiate()).* and no list.
- [ ] On a document whose insert is no longer in the oplog, the versions before its last replacement are marked
  *partial* or *unknown*, and after the list it says *Older versions are no longer in the oplog.*
- [ ] On a document never written since the oplog's first oplog entry, it says *No write to this document is left in
  the oplog: it was last written before …*
- [ ] After a read that stopped at 100 writes, the page says *The oplog was read back to …* and **Load older** adds
  the older writes under those shown.
- [ ] Opening **History…** twice for the same document leaves one tab, which reads the oplog again.
- [ ] On a view the row's menu has no **History…**; Go to **Document history** with nothing selected says *Open a
  document of a collection first: a new document has no history yet.*

### `history.oplog-window` — Whether there is an oplog, and how far back it goes

Checks that the document's writes can be read from an oplog, and reads the oplog's first and last oplog entry.

- **Kind**: Read
- **Engine**: MongoDB
- **Function**: `src/features/history/oplog-window.ts › request(context, args)` and `› parse(reply)`
- **Reads**: `db.adminCommand({ hello: 1 })`; `db.getSiblingDB("shop").getCollectionInfos({ name: "orders" })`; then,
  together, `db.getSiblingDB("local").oplog.rs.find({}, { ts: 1, wall: 1 }).sort({ $natural: 1 }).limit(1)` and the
  same with `{ $natural: -1 }`.
- **Refuses**: a mongos (`hello` answers `msg: "isdbgrid"`): *This is a sharded cluster (mongos): each shard has its
  own oplog. Connect to the replica set of the shard that holds the document to see its history.* (`/sharded`); no
  `setName` in `hello`: *A standalone server has no oplog, so there is no history of the writes: it needs a replica
  set. A single-node one is enough (mongod --replSet rs0, then rs.initiate()).* (`/standalone`); a view:
  *`<collection>` is a view: its documents are written in its source collection. Open the history from there.*
  (`/view`); error 13 or *not authorized* from the oplog: *Not authorized to read the oplog: reading local.oplog.rs
  needs a role such as clusterMonitor or readAnyDatabase (or read on the local database). Atlas shared tiers (M0,
  Flex) don't allow it at all.* (`/not-authorized`).
- **Uses**: used by `history.show` and `history.read-writes`.
- **Ported from**: `src/oplogHistory.ts` (`DocumentOplog.check`, `OplogHistoryError`, `authError`).

`parse` gives the time of the first and of the last oplog entry: the entry's wall clock time when it has one,
otherwise the seconds of its timestamp. An empty oplog gives neither.

Acceptance:

- [ ] On a single-node replica set it gives the times of the oldest and of the newest oplog entry.
- [ ] On a standalone server, through a mongos, on a view and with a user that cannot read the `local` database, it
  refuses with the four messages above and their codes.
- [ ] A collection that no longer exists is not a view: the check passes, and the history of a document of a dropped
  collection can still be read.

### `history.read-writes` — Read a document's writes from the oplog, a part at a time

Reads the oplog backwards from the newest oplog entry, in windows of time that grow, until it has enough writes of
the document, its time is up or the oplog's first oplog entry is reached, so that a large oplog is never read whole.
Each such *read* takes up where the one before stopped.

- **Kind**: Read
- **Engine**: MongoDB
- **Function**: `src/features/history/read-writes.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: opening the page; **Refresh** in its toolbar (`@toolbar`), which starts again from the newest
  write; **Load older** after its list (`@list`), which reads the part of the oplog before what was read.
- **Reads**: for each window, `db.getSiblingDB("local").oplog.rs.find({ ts: { $gte: Timestamp({ t: <from>, i: 0 }),
  $lt: <to> }, $or: [ <the document's writes>, <its writes inside applyOps>, <the commands on its collection> ] })
  .sort({ $natural: -1 }).maxTimeMS(<what is left of the read's time, at least 500>).batchSize(200)`, with every
  value kept as stored. For the document with `_id` 7 of `shop.orders` the three conditions are:
  - `{ op: { $in: ["i", "u", "d"] }, ns: "shop.orders", $or: [ { "o._id": 7 }, { "o2._id": 7 } ] }`;
  - `{ op: "c", "o.applyOps": { $elemMatch: { op: { $in: ["i", "u", "d"] }, ns: "shop.orders", $or: [ { "o._id": 7 },
    { "o2._id": 7 } ] } } }`;
  - `{ op: "c", ns: "shop.$cmd", $or: [ { "o.drop": "orders" }, { "o.renameCollection": "shop.orders" }, { "o.to":
    "shop.orders" }, { "o.dropDatabase": { $exists: true } } ] }`.
- **Refuses**: as `history.oplog-window` when the oplog cannot be read (`/not-authorized`); when the first window
  runs out of time before any oplog entry is returned: *Reading the oplog took more than 8 s without reaching any
  entry: the server may be too busy, try again.* (`/too-slow`).
- **Uses**: `history.oplog-window`, `history.document-writes`. Used by `history.show`.
- **Ported from**: `src/oplogHistory.ts` (`DocumentOplog.readPage`, `filter`, `PAGE_OPERATIONS`, `PAGE_MS`,
  `FIRST_SPAN`), `src/mcp/changes.ts` (`writesFilter`).

Bounds of one read: at most **100 writes** of the document and **8 seconds**.

Rules:

1. The first window of the first read ends one second after the newest oplog entry and is 3,600 seconds long. Each
   next window of the same read ends where the one before started and is 4 times longer. No window starts before the
   oplog's first oplog entry. The first window of a later read ends where the read before stopped.
2. The oplog entries of a window are read newest first, and each gives its writes of the document
   (`history.document-writes`).
3. The read stops, and remembers how far back it went:
   - when it has found 100 writes or more: it went back to the oplog entry that completed them, so a read can carry
     a few writes more than 100 when that entry holds several;
   - when a query runs out of time (error 50, `MaxTimeMSExpired`): it went back to the oldest oplog entry returned,
     and the page says that reading stopped at the time limit;
   - when a window reaches the oplog's first oplog entry: the oplog was read whole, and there is nothing older to
     load;
   - when 8 seconds have gone by at the end of a window: it went back to the start of that window.
4. The writes of all the reads made so far are kept together; the versions are rebuilt from all of them
   (`history.versions`) with the document as it is now, read again after each of them (`document.read`).

Example: an oplog of 30 days, a document last written 2 days ago. The first window covers the last hour and finds
nothing; the second the 4 hours before it; the third the 16 hours before those; the fourth the 64 hours before, which
reach the write of 2 days ago. If the document has 3 writes in all, the read goes on with windows of 256 and 1,024
hours until it reaches the oplog's first oplog entry or its 8 seconds are up.

Acceptance:

- [ ] On a document with 250 writes in the last hour, the first read returns the newest 100 and the page says the
  oplog was read back to the time of the hundredth; **Load older** returns the next 100, then the last 50.
- [ ] A write made inside a transaction with writes to other documents is found, and only the document's own write
  is listed.
- [ ] Dropping the collection adds a write *Removed*, with *collection dropped* under **changes**.
- [ ] With an `_id` stored as `Long(7)`, the writes logged with `7` as an `Int32` or a `Double` are found too.
- [ ] A read that takes more than 8 seconds stops; the page shows the writes found so far and says *Reading stopped
  at the time limit: the oplog was read back to …*
- [ ] Once the oplog's first oplog entry is reached there is no **Load older**.
- [ ] Nothing is read from any collection but the oplog and the document's own.

### `history.document-writes` — The writes of an oplog entry to one document

Turns one oplog entry into the writes it made to the document: the entry itself, those of its `applyOps`, or a drop
or rename of the collection.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/history/document-writes.ts › documentWrites(entry, collection, idKey)`
- **Uses**: used by `history.read-writes`, `history.versions` and `history.show`.
- **Ported from**: `src/shared/docHistory.ts` (`documentOps`, `opKind`, `collectionCommand`, `matches`,
  `isTransactionEntry`, `session`, `idKey`, `opKey`).

Inputs: an oplog entry as canonical Extended JSON; the collection, as the oplog names it in `ns`,
`<database>.<collection>`; the key of the `_id`, which is the same for the `_id` values MongoDB holds equal (`1`,
`1.0` and `NumberLong(1)` are one `_id`). Output: the writes, each with the oplog timestamp (`t`, `i`), its position
in the `applyOps` (-1 for an entry of its own), the wall clock time when the entry has one, `op`, `o`, `o2`, and what
is known of who made it.

Rules:

1. An entry `i`, `u` or `d` on the collection whose `_id` (`o2._id` for an update, `o._id` otherwise) has the key
   gives one write.
2. An entry `c` with `o.applyOps` gives one write for each element of that list that matches rule 1, with its
   position. The group is a *transaction* when the entry has a session (`lsid`), has no `multiOpType`, and none of
   the elements has a `stmtId`; otherwise it is a *batch*: one command writing several documents. It is *partial*
   when `partialTxn` is true or `prevOpTime` is not zero, *prepared* when `o.prepare` is true.
3. Another entry `c` on `<database>.$cmd` gives one write when it concerns the collection: *collection dropped*
   (`o.drop`), *database dropped* (`o.dropDatabase`), *collection renamed to `<database>.<collection>`*
   (`o.renameCollection` is this collection), *renamed into this collection from `<database>.<collection>`* (`o.to`
   is this collection). Any other gives none.
4. The session and the transaction number (`lsid.id`, `txnNumber`) are kept in mongosh syntax; `fromMigrate` marks
   a chunk migration, on the entry or on an element of its `applyOps`.
5. The kind of a write: `i` an insert; `d` a delete; `u` an update when a key of `o` starts with `$`, otherwise a
   replacement; a command a *rename into* when it renamed another collection into this one, otherwise a *drop*.
6. The key of a write, `<t>:<i>:<position>`, is the same each time the oplog is read.

Examples (the collection `orders` of the database `shop`, the `_id` 1):

| Oplog entry | Writes |
| --- | --- |
| `{ op: "i", ns: "shop.orders", o: { _id: 1, a: 1 } }` | one insert, position -1 |
| `{ op: "u", ns: "shop.orders", o2: { _id: 1 }, o: { $v: 2, diff: { u: { a: 2 } } } }` | one update |
| `{ op: "u", ns: "shop.orders", o2: { _id: 1 }, o: { _id: 1, a: 3 } }` | one replacement |
| `{ op: "d", ns: "shop.orders", o: { _id: NumberLong(1) } }` | one delete: the same `_id` |
| `{ op: "i", ns: "shop.orders", o: { _id: 2 } }` | none |
| `{ op: "c", ns: "admin.$cmd", lsid: { … }, txnNumber: NumberLong(3), o: { applyOps: [ { op: "u", ns: "shop.users", … }, { op: "i", ns: "shop.orders", o: { _id: 1 } } ] } }` | one insert, position 1, in a transaction |
| the same with `stmtId` on the elements of its `applyOps`, or without `lsid` | one insert, position 1, in a batch |
| `{ op: "c", ns: "shop.$cmd", o: { drop: "orders" } }` | a drop, *collection dropped* |
| `{ op: "c", ns: "shop.$cmd", o: { renameCollection: "shop.old", to: "shop.orders" } }` | a rename into, *renamed into this collection from shop.old* |
| `{ op: "c", ns: "shop.$cmd", o: { create: "other" } }` | none |

Acceptance:

- [ ] Each row of the table above gives its result.
- [ ] Two writes to the document in one transaction give two writes with the same timestamp and the positions they
  have in the `applyOps`, and two different keys.
- [ ] An entry with `fromMigrate: true` gives a write marked as a chunk migration.

### `history.update-changes` — The fields an update set and unset

Reads from the oplog entry of an update the field paths it set, those it unset and the arrays it resized, for the
**changes** column.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/history/update-changes.ts › updateChanges(o)`
- **Uses**: used by `history.show` and `history.versions`.
- **Ported from**: `src/shared/docHistory.ts` (`updateChanges`), `src/webview/docHistory.ts` (`changesText`).

Input: `o` of an update's oplog entry. Output: `{ set, unset, truncated }`, or nothing for a replacement.

Rules:

1. An entry with `diff` (the format `$v: 2`): in each section, `u` and `i` give field paths set, `d` field paths
   unset; `s<field>` is walked with `<field>.` before its names; in the section of an array (marked `a: true`),
   `u<position>` sets `<array>.<position>` and `l` gives *`<array>` to `<length>`* among the resized.
2. An entry with `$set` and `$unset` (the older format): their keys.
3. An entry without a key starting with `$`: a replacement, nothing.
4. The **changes** column joins what is not empty with ` · `: *set `<paths>`*, *unset `<paths>`*, *resized
   `<arrays>`*, the paths joined by commas; with none of them, *no change*.

Examples:

| `o` | Result | Shown |
| --- | --- | --- |
| `{ $v: 2, diff: { u: { status: "paid" }, d: { note: false } } }` | set `status`; unset `note` | *set status · unset note* |
| `{ $v: 2, diff: { saddress: { u: { city: "Rome" } } } }` | set `address.city` | *set address.city* |
| `{ $v: 2, diff: { sitems: { a: true, u1: { qty: 5 }, l: 2 } } }` | set `items.1`; resized `items to 2` | *set items.1 · resized items to 2* |
| `{ $v: 1, $set: { status: "paid", "address.city": "Rome" }, $unset: { note: true } }` | set `status`, `address.city`; unset `note` | *set status, address.city · unset note* |
| `{ $v: 2, diff: {} }` | nothing set, unset or resized | *no change* |
| `{ _id: 1, status: "paid" }` | nothing: a replacement | *replaced with a document of 2 fields* |

Acceptance:

- [ ] Each row of the table above gives its result.
- [ ] An update of one field inside an element of an array, `{ sitems: { a: true, s0: { u: { qty: 2 } } } }`, gives
  set `items.0.qty`.

### `history.versions` — Rebuild the versions of a document

Rebuilds the document as it was after each write, from the writes read and the document as it is now, and says how
much of each version is known.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/history/versions.ts › documentHistory(writes, current)`
- **Uses**: `history.document-writes`, `history.update-changes`, `history.diff`. Used by `history.show` and
  `document.restore-version`.
- **Ported from**: `src/shared/docHistory.ts` (`buildHistory`, `applyUpdate`, `revertUpdate`, `markUnknown`,
  `agrees`, `unknownPaths`).

Inputs: the writes, in any order; the document as it is now, as canonical Extended JSON so that every BSON type
survives, or nothing when it does not exist. Output: the versions, oldest first, one per write, each with its state,
its document, the field paths of its unknown values, its difference from the version before (`history.diff`) and, when
it could not be rebuilt from the version before, why; the state of the document before the oldest write; and
whether there was a conflict.

The state of a version is *exact* (every field known), *partial* (a document with unknown values), *absent* (no
document: deleted, or not inserted yet; shown as *no document*) or *unknown* (nothing known).

Rules:

1. The writes are put in order of oplog timestamp, then of position in their `applyOps`.
2. **Forwards.** Before the oldest write the document is unknown. An insert gives its document; a replacement its
   document, with the `_id` of `o2` when `o` has none; a delete or a drop gives *absent*; a rename into gives
   *unknown*. An update is applied to the version before when that is a document: `$set` and `$unset` by field path,
   or the `$v: 2` diff section by section. Where it cannot be applied (it changes a field the document does not have,
   it goes through a value that is not a sub-document or an array, its format is not one of the two) the version is
   *unknown* and the reason is kept; an update after a delete is *An update of a document that was deleted*.
   Applying follows the server: a `$set` beyond the end of an array pads it with `null`, and a `$unset` of an element
   of an array leaves `null` in its place.
3. **Backwards.** After the newest write the document is the current one, or *absent*. Going back through an insert
   gives *absent*. Going back through an update gives the document after it with what the update changed made
   unknown: the fields it set, unset or added; for the older format, a sub-document left with only unknown values
   becomes unknown as a whole, since the update may have created it; an array the update resized is unknown as a
   whole, since its old length is not known. Going back through a replacement, a delete, a drop or a rename gives
   *unknown*.
4. **Choosing.** Each stretch of versions rebuilt forwards from one insert, replacement, delete or drop is kept when
   it agrees with what is known backwards at every point: the same kind, and documents equal wherever the backwards
   one is known (an unknown value fits anything, also a missing field). A stretch that disagrees anywhere is dropped
   whole, its versions come from the backwards pass instead, and the result reports a **conflict**: a write is
   missing from what was read, or one was made while reading.
5. A version with no unknown value is *exact*; with some it is *partial*, and lists their field paths (`status`,
   `items.1`, or `(document)`).
6. Restoring is offered only on an exact version (`document.restore-version`).

Worked examples (the `_id` is 1; `?` is an unknown value):

**A. Exact versions from an insert.** Writes: an insert of `{ _id: 1, status: "new", qty: 1 }`, then an update that
sets `status` to `"paid"`. Current document: `{ _id: 1, status: "paid", qty: 1 }`.

| After | State | Document |
| --- | --- | --- |
| (before the insert) | absent | — |
| the insert | exact | `{ _id: 1, status: "new", qty: 1 }` |
| the update | exact, current | `{ _id: 1, status: "paid", qty: 1 }` |

**B. Partial versions: the insert is no longer in the oplog.** Writes: an update that sets `status` to `"paid"`, then
an update with the diff `{ u: { qty: 3 }, d: { note: false } }`. Current document: `{ _id: 1, status: "paid", qty: 3
}`. Nothing can be rebuilt forwards, so every version comes from the current document, walking back.

| After | State | Document | Unknown |
| --- | --- | --- | --- |
| (before the first update) | partial | `{ _id: 1, status: ?, qty: ?, note: ? }` | `status`, `qty`, `note` |
| the first update | partial | `{ _id: 1, status: "paid", qty: ?, note: ? }` | `qty`, `note` |
| the second update | exact, current | `{ _id: 1, status: "paid", qty: 3 }` | |

**C. A replacement in the middle.** Writes: an update that sets `a`, a replacement with `{ _id: 1, a: 5, b: 1 }`, an
update that sets `b` to 2. Current document: `{ _id: 1, a: 5, b: 2 }`.

| After | State | Document |
| --- | --- | --- |
| the first update | unknown | — |
| the replacement | exact | `{ _id: 1, a: 5, b: 1 }` |
| the second update | exact, current | `{ _id: 1, a: 5, b: 2 }` |

**D. A deleted document.** Writes: an insert of `{ _id: 1, a: 1 }`, then a delete. No current document. The version
after the insert is exact, the one after the delete is *absent*; the page offers **Insert again…** on the first.

**E. A conflict.** Writes: an insert of `{ _id: 1, a: 1 }` only. Current document: `{ _id: 1, a: 3 }`. The insert
does not lead to the current document, so its stretch is dropped: the version after the insert is shown as the
current document, and the result reports a conflict.

**F. Arrays, walking back.** The document after is `{ _id: 1, items: [ { qty: 1 }, { qty: 5 } ] }`.

| Update | Document before | Unknown |
| --- | --- | --- |
| `{ $set: { "items.1.qty": 5 } }` (older format) | `{ _id: 1, items: [ { qty: 1 }, ? ] }` | `items.1` |
| `{ diff: { sitems: { a: true, s1: { u: { qty: 5 } } } } }` | `{ _id: 1, items: [ { qty: 1 }, { qty: ? } ] }` | `items.1.qty` |
| `{ diff: { sitems: { a: true, l: 2 } } }` | `{ _id: 1, items: ? }` | `items` |

**G. Arrays, going forwards.** On `{ _id: 1, tags: ["a", "b"] }`, `{ $set: { "tags.3": "d" } }` gives `tags: ["a",
"b", null, "d"]`, and `{ $unset: { "tags.0": true } }` gives `tags: [null, "b"]`.

Acceptance:

- [ ] Each example above gives its versions, states and unknown field paths.
- [ ] A version rebuilt from an insert keeps every type of the inserted document: an `Int32`, a `Long`, a
  `Decimal128` and a date are the same in the version as in the oplog entry.
- [ ] The newest version of a document that exists is always equal to the current document.
- [ ] An update whose diff changes a field the version before does not have gives a version that carries *The diff
  changes `<field>`, which the document doesn't have* and is not exact.
- [ ] Writes given in any order give the same versions.
- [ ] No writes and a current document give no version, and a state before that is the current document.

### `history.diff` — The difference between two versions

Says, field by field, what changed from one version to the next, with `?` where a value is not known.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/history/diff.ts › versionDiff(before, after)`
- **Uses**: `compare.equality` (when two values count as equal). Used by `history.versions`,
  `history.version-detail` and `document.restore-version`.
- **Ported from**: `src/shared/docHistory.ts` (`versionDiff`, `diffValues`, `row`, `displayValue`),
  `src/shared/compare.ts` (`fieldDiff`, `normalize`, `typeName`).

Inputs: two versions, each a document (possibly with unknown values), *absent* or *unknown*. Output: rows, each with
a field path and, on each side, a value, the mark of an unknown value, or nothing when the field is missing; and
the two type names when the values look the same and differ by type only.

Rules:

1. When the version after is *unknown*: no rows.
2. When the version before is *unknown*: one row for each top-level field of the version after whose value is
   known, with `?` before.
3. Otherwise the two documents are compared, an *absent* one counting as a document without fields:
   - a field missing on both sides, or unknown on both sides, gives no row;
   - a field unknown or missing on one side gives one row;
   - two values without unknown values inside are compared as a whole: sub-documents are compared inside, field by
     field, and so are arrays of the same length, element by element (`items.2.qty`); anything else gives one row.
     The order of the fields does not count; every BSON type does: `Int32(1)` and `Double(1)` differ, and since they
     look the same the row carries their types, `int` and `double`;
   - two values with unknown values inside are walked the same way, sub-documents by field and arrays of the same
     length by element; otherwise they give one row.
4. A comparison of two values gives at most 200 rows.
5. A row of the whole document has the field path `(document)`.

Examples:

| Before | After | Rows |
| --- | --- | --- |
| absent | `{ _id: 1, a: 1 }` | `_id`: — → `1`; `a`: — → `1` |
| `{ _id: 1, status: "new", qty: 1 }` | `{ _id: 1, status: "paid", qty: 1 }` | `status`: `"new"` → `"paid"` |
| `{ _id: 1, status: ?, qty: ?, note: ? }` | `{ _id: 1, status: "paid", qty: ?, note: ? }` | `status`: `?` → `"paid"` |
| `{ _id: 1, qty: ?, note: ? }` | `{ _id: 1, qty: 3 }` | `qty`: `?` → `3`; `note`: `?` → — |
| `{ _id: 1, n: Int32(1) }` | `{ _id: 1, n: Double(1) }` | `n`: `1` int → `1` double |
| `{ _id: 1, a: 1, b: 2 }` | `{ _id: 1, b: 2, a: 1 }` | none |
| `{ _id: 1, tags: ["a"] }` | `{ _id: 1, tags: ["a", "b"] }` | `tags`: `["a"]` → `["a", "b"]` |
| unknown | `{ _id: 1, a: 5 }` | `_id`: `?` → `1`; `a`: `?` → `5` |
| `{ _id: 1, a: 1 }` | absent | `_id`: `1` → —; `a`: `1` → — |

Acceptance:

- [ ] Each row of the table above gives its rows.
- [ ] A change inside the third element of an array of the same length gives the row `items.2.qty`, not a row for the
  whole array.
- [ ] Two documents of 300 different fields give 200 rows.

### `history.own-writes` — Which writes were Datardo's own

Tells which writes found in the oplog were made from Datardo, by matching them with the operations of the undo
history that wrote the same document.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/history/own-writes.ts › ownWrites(versions, recorded)`
- **Uses**: the undo history, which gives the operations it recorded on one document between two times, each with
  its title, its time and what it did to the document (inserted, updated or deleted). Used by `history.show`.
- **Ported from**: `src/docHistory.ts` (`ownWrites`, `BEFORE_MS`, `AFTER_MS`); undo.writes-of of Mongoster's
  `src/history.ts` for what the undo history gives.

Inputs: the versions that have a wall clock time and are not drops or renames; the operations the undo history
recorded on the document from 60 seconds before the oldest of those times to 300 seconds after the newest. Output:
for each write matched, the title of its operation.

Rules:

1. A write can only match an operation that did the same thing to the document: an insert one that inserted it, a
   delete one that deleted it, an update or a replacement one that updated it.
2. The operation's time must be between 60 seconds before and 300 seconds after the write's wall clock time: the
   computer's clock and the server's differ, and an operation is recorded when it starts.
3. The writes are taken oldest first; each takes the nearest operation in time among those left, and an operation is
   used once.
4. A write without a match is not Datardo's, as far as it can tell.

Examples (the times are of the same day):

| Writes in the oplog | Operations of the undo history | Result |
| --- | --- | --- |
| an update at 10:00:00 | *Edit qty of 1*, updated, at 10:00:01 | the update is *Edit qty of 1* |
| updates at 10:00:00 and 10:02:58 | *Edit qty of 1* at 10:00:01, *Edit status of 1* at 10:03:00 | the first is *Edit qty of 1*, the second *Edit status of 1* |
| an update at 10:00:00 | *Edit qty of 1* at 09:58:30 | none: 90 seconds before |
| a delete at 10:00:00 | *Edit qty of 1*, updated, at 10:00:00 | none: not the same kind |
| two updates at 10:00:00 and 10:00:02 | *Edit qty of 1* at 10:00:01 | the first only: an operation is used once |

Acceptance:

- [ ] Each row of the table above gives its result.
- [ ] A document deleted from Datardo and then put back by an undo shows the delete as Datardo's, and the insert of
  the undo as Datardo's too.
- [ ] With the undo history off for the connection, no write is marked **Datardo**.
- [ ] A write without a wall clock time is never marked.

### `history.version-detail` — A version in the inspector

Shows, for the write selected on the document history page, what it changed and the document after it.

- **Kind**: View
- **Engine**: MongoDB
- **Function**: `src/features/history/version-detail.ts › view(state)`
- **Entry points**: selecting a write of the list, with a click or the arrow keys (`@list`); `Enter` on it shows the
  inspector island when it is hidden and moves the focus into it.
- **Reads**: nothing: the version as `history.versions` rebuilt it.
- **Uses**: `nav.inspector`, `history.versions`, `history.diff`, `history.copy-version`, `document.restore-version`,
  `query.format`.
- **Ported from**: `src/webview/docHistory.ts` (`detail`, `diffTable`, `valueCell`, `restoreButton`, `fill`).

What it shows, from the top:

1. The write and its time: `<local date and time> · Timestamp({ t: <t>, i: <i> })`.
2. The buttons: **Restore this version…**, or **Insert again…** when the document no longer exists, on an exact
   version that is not the current one (`document.restore-version`); **Copy** (tooltip *Copy this version of the
   document*) on an exact version (`history.copy-version`).
3. The notes that apply:
   - *Partial: the values marked ? aren't known (`<field paths>`). The oplog keeps the new values of an update, not
     the old ones: a version is known in full from an insert or a replacement still in the oplog, or when it is the
     current document.*
   - *The document at this point isn't known: it was rebuilt neither from an insert or replacement in the oplog nor
     back from the current document.*
   - *This write doesn't fit the version before as rebuilt (`<reason>`): some writes are missing from the part of
     the oplog read.*
   - *Written from Datardo: `<title>`.*
4. The difference from the version before (`history.diff`), as a table **field**, **before**, **after**: values in
   mongosh syntax; `?` for an unknown value, with the tooltip *Not known: the oplog keeps the new values of an update,
   not the old ones (it may also have been missing)*; `—` for a missing field, with the tooltip *The field is
   missing*; the type after a value when two values look the same and differ by type. A field only after is marked
   as added, only before as removed, otherwise as changed. An update with no difference says *No field changed.*
5. **Document after this write**, or **Document after this write (partial)**: the document as a tree and as mongosh
   text, as `document.inspect` shows one, with `?` for the unknown values and nothing to edit. It is open when there
   is no difference to show, folded otherwise. Not shown for *no document* and *unknown*.

Its states: *nothing selected* (**Select a write to see what it changed.**); the page loading or in error: empty.

Acceptance:

- [ ] Selecting an update that set `status` from `"new"` to `"paid"` shows one row, `status`, `"new"`, `"paid"`.
- [ ] On a partial version the unknown values are drawn as `?` in the table and in the document, and the note lists
  their field paths.
- [ ] On the insert of a document, every field is a row marked as added, with `—` before.
- [ ] An update that set a field to the value it already had says *No field changed.*
- [ ] On a version after a delete there is no **Document after this write**.
- [ ] The current version has **Copy** and no **Restore this version…**; a partial version has neither.
- [ ] On a read-only connection **Restore this version…** is disabled with the tooltip *The connection `<name>` is
  read-only.*

### `history.copy-version` — Copy a version of the document

Copies the document as it was in an exact version, in mongosh syntax.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/history/copy-version.ts › plan(context, answers)`
- **Entry points**: **Copy** in the inspector, under the version shown (`@inspector`).
- **Offered when**: the version is exact. A partial version cannot be copied: its unknown values have no text.
- **Plan**: no step: it writes nothing.
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone: nothing is written.
- **After**: the version is on the clipboard in mongosh syntax on several lines (`query.format`), ready for the
  insert dialog (`document.insert`); the status line says *Copied to the clipboard*.
- **Uses**: `history.version-detail`, `query.format`.
- **Ported from**: `src/webview/docHistory.ts` (**Copy** of `detail`), `src/docHistory.ts` (the `copy` message).

Acceptance:

- [ ] **Copy** on an exact version copies the document with `ObjectId("…")`, `ISODate("…")` and `NumberLong("…")`
  as its types need.
- [ ] Pasted into the insert dialog of another collection, it inserts a document equal to the version.
- [ ] A partial version and a version without a document have no **Copy**.
- [ ] It works on a read-only connection.
