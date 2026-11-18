# Undo history

The undo history, for documents and for keys: what Datardo keeps before a write, the fingerprints it keeps after it,
the **Undo history** page, undoing and redoing an operation, what happens to a document or a key that changed since,
the limits that keep the history small, and turning it off for one connection. The steps every write takes, of which
recording is the third, are in [the feature contract](../feature-contract.md#how-a-feature-runs).

An operation is on one **target**: a collection of a MongoDB connection (`Local › shop.orders`), or a database of a
Redis connection (`Cache local › db0`). What it keeps of a document is the document as stored, with every BSON type;
what it keeps of a key is its **dump**, the bytes `DUMP` returns, with its `PTTL` and its `TYPE`. A document or a key
the write creates is kept as its `_id` or its name only: undoing deletes it.

### `undo.record` — Record an operation before a write

Before a write to documents or to keys, Datardo keeps what the write is about to change as it is, so that the write
can be undone later, also after Datardo is closed and started again.

- **Kind**: Operation
- **Engine**: Any
- **Function**: `src/features/undo/record.ts › plan(context, answers)`. The runner calls it twice for one plan: before
  the first step, when it answers with the reads that keep what the `keeps` of the plan's `undo` names; and after the
  last step, with the same documents or keys read again, when it returns the plan that saves the operation, or
  nothing.
- **Entry points**: none of its own. The runner calls it for every plan whose `undo` names what to keep
  (`runner.run`).
- **Offered when**: `datardo.undo.enabled` is on, the connection keeps its undo history (`undo.per-connection`) and is
  not read-only, and the plan announces no more documents or keys than `datardo.undo.maxDocumentsPerOperation`.
- **Asks**: nothing, unless what is kept turns out too large while it is read: then **\<Action\> without the
  possibility to undo?**, with the detail *The documents matching the filter are more than 20 MB: too many for the
  undo history (settings `datardo.undo`).* (or *more than 10,000 documents*; *The keys are …* for keys) and the button
  **\<Action\> without undo**, where \<Action\> is the action the button of the plan's confirmation names
  (**Update**, **Delete**, **Copy**), or **Continue** for a plan that was not confirmed.

  When the plan's filter is empty, the question also carries the field *Type \<collection\> to confirm*, and
  **\<Action\> without undo** is disabled until the field holds exactly the collection's name, compared with case, as
  in `runner.confirm` for a destructive plan (D39): the write takes every document of the collection and will not be
  recorded. The filter is read from the `keeps` of the plan's `undo`. For the documents matching a filter, `keeps`
  holds the collection, the filter the steps send, parsed, and, optionally, `written`: the filter as the user wrote it
  in the query bar, parsed, which a plan sets when the filter it sends is narrower than the user's (the column
  actions add `{ <field>: { $exists: true } }`). The filter is empty when `written`, or the filter sent when there is
  no `written`, is `{}`, a document with no field; the name to type is the collection's. The rule reads the filter as
  written, not what it matches. With a filter that is not empty the question has no field. It never
  has one when `keeps` names documents by their `_id`s, nor for keys: deleting every key matching a pattern is
  destructive on its own and has asked for a name already.
- **Reads**: before the steps, what the `keeps` of the plan's `undo` names.
  - MongoDB, the documents matching a filter: `db.orders.find(<filter>)`.
  - MongoDB, the documents with given `_id`s: `db.orders.find({ _id: { $in: [<1,000 ids>] } })`, in batches of 1,000;
    an `_id` that is not found is kept as *did not exist*.
  - MongoDB, the `_id`s the steps insert: nothing is read, each is kept as *did not exist*; an insert that fails takes
    its `_id` out of what is kept.
  - Redis, the keys with given names, in the database of the target: `DUMP <key>`, `PTTL <key>` and `TYPE <key>` for
    each key, in pipelines of 1,000 keys *(Datardo's choice)*; a key whose `DUMP` is nil is kept as *did not exist*.

  Documents are read with every value in its BSON type (`Int32` and `Double` apart, a regular expression with its
  flags). After the steps: the same documents again by `_id`, in batches of 1,000, and the same keys again with
  `DUMP <key>` and `PTTL <key>`, to keep a fingerprint of each (`undo.kept`).
- **Plan**: no step to a deployment. `write <data folder>/<undo history>/<id>.json.gz`, then `add the operation
  "<title>" to the undo history`. The file is the gzip of canonical Extended JSON: `{ docs: [{ id, before, after }] }`
  for documents, `{ keys: [{ key, before, after }] }` for keys, with `before` the document, or `{ dump, pttl, type }`
  with the bytes in base64, or `null` for what did not exist; `after` is the fingerprint after the write, `null` when
  the document or the key no longer exists. The list of operations is written to a temporary file and renamed.
- **Danger**: None.
- **Read-only**: Nothing is recorded through a read-only connection; the write itself is refused before, by its own
  card.
- **Undo**: Cannot be undone: it is what makes the other writes undoable. A recorded operation can be removed
  (`undo.remove`) or cleared (`undo.clear`).
- **After**: the **Undo history** page, when open, shows the new operation; the write's notification has **Undo**
  (`undo.notification`); the limits are applied right after the save (`undo.limits`).
- **Refuses**: never refuses the write. When the file can't be written after the write, the write stays done and a
  warning says *The change was made, but couldn't be saved in the undo history: \<error\>*.
- **Settings**: `datardo.undo.enabled` (on), `datardo.undo.maxDocumentsPerOperation` (10,000 documents or keys),
  `datardo.undo.maxOperationSizeMb` (20), and the limits of `undo.limits`.
- **Uses**: `undo.kept`, `undo.note`, `undo.limits`, `undo.per-connection`, `runner.run`, `runner.confirm`. Recorded:
  `document.insert`, `document.delete`, `document.inline-edit`, `document.update-many`, `document.delete-many`,
  `document.restore-version`, `transfer.import`, `transfer.generate`, `transfer.copy-collection`, `backup.restore`,
  `key.delete`, `undo.revert`, and, of the cards that are not in the contract's list, saving a document tab, deleting
  the selected rows, the column actions, the comparison's **Make … like …**, and the writes of the key and value
  areas.
- **Ported from**: Mongoster's card undo.record; `src/history.ts` (`UndoHistory.start`, `Recorder`,
  `UndoHistory.save`), `src/shared/messages.ts` (`HistoryEntry`), and the "ask again" of `writeMany` in
  `src/collectionPanel.ts`. The Redis side is *New in Datardo*.

Acceptance:

- [ ] Nothing is recorded when `datardo.undo.enabled` is off, when the connection is read-only or has **Stop keeping
  undo history** on, or when the plan announces more documents or keys than `datardo.undo.maxDocumentsPerOperation`
  (default 10,000).
- [ ] The first image wins: a document or a key read twice in one operation keeps the value it had before the first
  step.
- [ ] A document the write inserts is kept as its `_id` only; a key the write creates as its name only.
- [ ] An operation of 10,000 documents is recorded; one of 10,001 is not, and the reason is *more than 10,000
  documents*.
- [ ] An operation whose documents take more than 20 MB (BSON size, before compression) is not recorded, and the
  reason is *more than 20 MB*. For keys the size is the bytes of the dumps and of the names.
- [ ] An **Update many** whose matching documents turn out to take 25 MB asks **Update without the possibility to
  undo?** before anything is written; **Update without undo** runs it without recording, and closing the dialog
  writes nothing.
- [ ] A **Delete many** with an empty filter on `orders`, expected to be recorded, whose documents pass
  `datardo.undo.maxOperationSizeMb` while they are read, asks **Delete without the possibility to undo?** with the
  field *Type orders to confirm*: **Delete without undo** is disabled until the field holds `orders`, compared with
  case, and `Enter` in the field does nothing before. Then it deletes without recording; closing the dialog writes
  nothing.
- [ ] The same **Delete many** with the filter `{ status: "old" }` asks the question with no field, and **Delete
  without undo** is enabled at once.
- [ ] The field is there when the filter in the `keeps` of the plan's `undo` is `{}`, also when the limit passed is
  `datardo.undo.maxDocumentsPerOperation` because documents were inserted after the confirmation counted them.
  `{ _id: { $exists: true } }` is not empty, though it matches every document.
- [ ] **Remove in all** of the field `note` on `people`, with an empty query bar, whose documents pass a limit while
  they are read, asks **Remove without the possibility to undo?** with the field *Type people to confirm*: the filter
  sent is `{ note: { $exists: true } }`, and `written` is `{}`.
- [ ] The question of a plan that keeps documents by their `_id`s (the batch of an import, a delete of chosen
  documents) and the question of a plan that keeps keys never have the field.
- [ ] In a plan that runs in batches (import, copy, generate, restore), what a batch keeps is saved before that
  batch. When a batch passes a limit, the same question is asked before that batch is written: answering no stops
  the plan there, and what was written so far is recorded as one operation that can be undone. A restore says its
  limit in its confirmation instead, and asks nothing more (`backup.restore`).
- [ ] `SET orders:42 "b"` on a string with 60 seconds left keeps `DUMP orders:42`, `PTTL orders:42` (about 60000) and
  `TYPE orders:42` (`string`) before the write, and after it the SHA-1 of the new dump.
- [ ] A `DUMP` that fails (`NOPERM`, an unknown command on a server that lacks it) asks the same question, with the
  detail *The keys can't be kept for the undo history: \<error\>*.
- [ ] Documents and keys the write left as they were are not kept (`undo.kept`); a write that changed none records
  nothing, and its notification has no **Undo**.
- [ ] The operation is listed with the time, the connection, the target, the plan's title cut to 300 characters (299
  and `…`), the numbers inserted, updated and deleted, and the size of its compressed file.
- [ ] Not recorded: the playground, `$out` and `$merge`, indexes, users, GridFS files, dropping collections and
  databases, copying with **Drop and recreate**, restoring with **Drop and restore**, **Apply** of the structure
  comparison, and the commands typed in the console.
- [ ] When the file can't be written, the write stays done and the warning is *The change was made, but couldn't be
  saved in the undo history: \<error\>*.

### `undo.kept` — Which documents and keys an operation keeps

After the write, an operation keeps only what the write really changed, and counts it as inserted, updated or
deleted.

- **Kind**: Derivation
- **Engine**: Any
- **Function**: `src/features/undo/kept.ts › keptRecords(records)`
- **Inputs**: the records `{ id, before, after }` or `{ key, before, after }`. `before` is the document as stored
  before the write, or the key's dump, `PTTL` and type, or `null` when it did not exist. `after` is the fingerprint
  read after the write, `null` when the document or the key does not exist. The fingerprint of a document is the SHA-1
  of its BSON bytes, so the order of the fields and the numeric types count. The fingerprint of a key is the SHA-1 of
  its dump, so the encoding the server chose counts; beside it is kept the time its expiry falls at (the time of the
  read plus `PTTL`), or that it has none.
- **Output**: the records kept, and `inserted`, `updated`, `deleted`.
- **Rules**:
  - a document with `before` is kept when `after` differs from the fingerprint of `before`;
  - a key with `before` is kept when `after` differs from the fingerprint of the dump in `before`, or when one of the
    two has an expiry and the other has none, or when their expiry times differ by more than 1,000 ms *(Datardo's
    choice)*: `DUMP` does not hold the expiry, so a write that only changes it is found this way;
  - a record without `before` is kept when `after` is not `null`;
  - `inserted` counts the kept records without `before`; `deleted` those with `before` and `after` `null`; `updated`
    the others. The page shows them as *inserted, updated, deleted* for documents and *created, changed, deleted* for
    keys;
  - nothing kept: no operation.
- **Uses**: `undo.record`.
- **Ported from**: Mongoster's card undo.kept-documents; `src/history.ts` (`UndoHistory.save`, `Recorder.commit`,
  `fingerprint`). The rules for keys are *New in Datardo*.

Examples:

| Write | Recorded | Kept |
| --- | --- | --- |
| `$set: { status: "b" }` on a document with `status: "a"` | before `{ status: "a" }`, after its new fingerprint | kept, updated |
| `$set: { status: "a" }` on a document already `"a"` | after equals the fingerprint of before | not kept |
| insert of a document that is then deleted before the read after | before `null`, after `null` | not kept |
| delete of a document | before the document, after `null` | kept, deleted |
| Update many matching 5, changing 3 | 5 recorded | 3 kept, `3 updated` |
| `SET orders:42 "b"` on the string `"a"` | before the dump of `"a"`, after the fingerprint of the dump of `"b"` | kept, changed |
| `SET orders:42 "a"` on a persistent string `"a"` | same fingerprint, no expiry on both sides | not kept |
| `SET orders:42 "a"` on the string `"a"` with 60 seconds left | same fingerprint, the expiry is gone | kept, changed |
| `EXPIRE orders:42 60` on a persistent key | same fingerprint, an expiry appeared | kept, changed |
| `DEL orders:42` | before the dump, after `null` | kept, deleted |
| `HSET cart:7 sku x` on a key that did not exist | before `null`, after a fingerprint | kept, created |

An insert that fails on an existing `_id` is never among the records: kept, it would count as inserted, since a
document with that `_id` exists after the write, and undoing it would delete the document that was already there.

Acceptance:

- [ ] An **Update many** that matches 5 documents and modifies 3 records an operation with `3 updated`.
- [ ] An update that changes nothing records no operation, and its notification has no **Undo**.
- [ ] Replacing `{ a: 1, b: 2 }` with `{ b: 2, a: 1 }` counts as a change.
- [ ] Replacing an `Int32` `1` with a `Double` `1` counts as a change.
- [ ] `EXPIRE orders:42 60` on a persistent key records an operation with `1 changed`; `PERSIST` on a key that is
  already persistent records nothing.
- [ ] Two reads of an untouched key with 60 seconds left, 300 ms apart, do not count as a change.
- [ ] Each row of the table above gives its result.

### `undo.note` — Whether a write can be undone, as its confirmation says it

Whether a write will be recorded in the undo history, and why not, known before its confirmation: the line every
confirmation of a write carries about undo, and what a feature reads to decide how dangerous its write is.

- **Kind**: Derivation
- **Engine**: Any
- **Function**: `src/features/undo/note.ts › undoNote(connection, undo, count, settings)`, which returns
  `{ recorded, why, line }`.
- **Inputs**: the connection of the write, the plan's `undo` (`{ keeps }` or `{ cannot }`), the number of documents or
  keys the plan announces, the `datardo.undo` settings.
- **Output**: `recorded`, whether the write will be recorded, yes or no; `why`, the reason when it will not, one of
  `'cannot'`, `'off'`, `'off-for-connection'`, `'over-limit'`, and nothing when it will; `line`, the text the
  confirmation shows.
- **Rules**, the first that fits:
  1. the plan's `undo` is `{ cannot }`: not recorded, `'cannot'`; the line is its reason, as the plan words it
     (*Dropping the destination can't be undone.*);
  2. `datardo.undo.enabled` is off: not recorded, `'off'`; the connection does not keep its undo history: not
     recorded, `'off-for-connection'`. The line is the same for both: *The undo history is off for this connection:
     this can't be undone.*;
  3. the number is above `datardo.undo.maxDocumentsPerOperation`: not recorded, `'over-limit'`; *This can't be undone:
     the undo history keeps operations of up to 10,000 documents.* (*… of up to 10,000 keys.* for a write to keys);
  4. otherwise: recorded; *It can be undone from the Undo history.*
- **Who reads what**: `runner.confirm` shows `line`. A feature whose danger depends on undo reads `recorded` while it
  builds its plan: a write to documents with an empty filter is destructive when `recorded` is no for `'off'`,
  `'off-for-connection'` or `'over-limit'` (D39), which `document.update-many`, `document.delete-many`,
  `field.rename`, `field.remove` and `field.convert-type` decide themselves. `recorded` yes is what is known before
  the confirmation: the size of what must be kept is known only while it is read, and when it passes a limit then,
  `undo.record` asks its question.
- **Uses**: `runner.confirm`, `undo.record`, `undo.per-connection`.
- **Ported from**: Mongoster's card undo.record (its acceptance about the confirmation); `src/history.ts`
  (`UndoHistory.note`).

Examples:

| Connection, plan, number | Recorded, why | Line |
| --- | --- | --- |
| keeps its undo history; `{ keeps }`; 3 documents | yes | *It can be undone from the Undo history.* |
| keeps its undo history; `{ keeps }`; 20,000 documents | no, `'over-limit'` | *This can't be undone: the undo history keeps operations of up to 10,000 documents.* |
| keeps its undo history, limit set to 500; `{ keeps }`; 501 keys | no, `'over-limit'` | *This can't be undone: the undo history keeps operations of up to 500 keys.* |
| **Stop keeping undo history** on; `{ keeps }`; 1 document | no, `'off-for-connection'` | *The undo history is off for this connection: this can't be undone.* |
| `datardo.undo.enabled` off; `{ keeps }`; 1 document | no, `'off'` | *The undo history is off for this connection: this can't be undone.* |
| any; `{ cannot: "Dropping the destination can't be undone." }` | no, `'cannot'` | *Dropping the destination can't be undone.* |

Acceptance:

- [ ] Each row of the table above gives whether the write will be recorded, why not, and its line.
- [ ] `recorded` is no exactly when the line is not *It can be undone from the Undo history.*
- [ ] With `datardo.undo.enabled` off, every confirmation of a write that keeps something says *The undo history is
  off for this connection: this can't be undone.*
- [ ] A limit of 1 says *… operations of up to 1 document.*

### `undo.show` — The Undo history page

Lists the recorded operations of every connection, newest first, with what each one did and the space it takes; from
here an operation is undone, inspected or removed.

- **Kind**: View
- **Engine**: Any
- **Function**: `src/features/undo/show.ts › view(state)`
- **Entry points**: **Undo history** on the rail (`@rail`); Go to (**Undo history**); the tool `open_history` of the
  MCP server (`mcp.tab-tools`).
- **Offered when**: always.
- **Reads**: the list of operations and the space they take, with each operation's connection named as it is now.
- **After**: the page follows every change of the history (a new operation, an undo, a removal, a clear, a change of
  the `datardo.undo` settings).
- **Commands**: `undo.show`.
- **Settings**: `datardo.undo.enabled` (the notice), and the limits shown in the summary (`undo.limits`).
- **Uses**: `undo.details`, `undo.revert`, `undo.last`, `undo.remove`, `undo.clear`, `undo.limits`, `settings.page`,
  `tab.open`, `nav.rail`.
- **Ported from**: Mongoster's card undo.show; `src/history.ts` (`HistoryPanel`, `UndoHistory.list`,
  `UndoHistory.usage`), `src/webview/undoHistory.ts`.

What the page shows, from the top:

1. The toolbar: a filter field (*Filter by connection, target or operation*), the summary, **Undo last change**,
   **Settings** and **Clear history…**.
2. With `datardo.undo.enabled` off, the notice *The undo history is off (setting `datardo.undo.enabled`): new changes
   aren't recorded.*
3. The message line: the result of the last undo started from the page, as an error when it failed.
4. The table, with the columns **when**, **target**, **operation**, **changes**, **size**, and on each row **Undo**
   and **✕**.

The page is an app tab: it belongs to no connection, has no sections and hides the inspector island.

Acceptance:

- [ ] There is one **Undo history** tab for all connections, in the app's group of tabs; opening it again makes it
  active.
- [ ] The summary reads `12 operations · 3.4 MB of 100 MB`; with a filter, `2 shown · 12 operations · 3.4 MB of 100
  MB`. Its tooltip reads *Kept for 7 days, up to 200 operations and 100 MB; operations of more than 10,000 documents
  or keys aren't recorded.* Sizes have one decimal below 10 of a unit above bytes: `512 B`, `3.4 MB`, `12 MB`.
- [ ] **Settings** opens the Settings page at the undo history's settings (`settings.page`).
- [ ] **when**: today's operations show `14:05:09`, yesterday's `yesterday 14:05`, older ones `10-08 14:05`; the
  tooltip has the whole date and time.
- [ ] **target** is `<connection> › <database>.<collection>` for documents and `<connection> › db<n>` for keys;
  **changes** reads `1 inserted, 2 updated, 3 deleted` for documents and `1 created, 2 changed, 3 deleted` for keys,
  leaving out the numbers that are 0.
- [ ] The filter matches the connection's name, the target without the connection (`shop.orders`, `db0`) and the
  operation's title, ignoring case, and is kept while another tab is active.
- [ ] Each row has **Undo** (`undo.revert`; tooltip *Put the documents back as they were before this operation*, or
  *Put the keys back …*) and **✕** (`undo.remove`). While its undo runs, **Undo** reads **Undoing…** and is
  disabled.
- [ ] An operation already undone shows `undone`, with *Undone \<date and time\>* in its tooltip, no size, and can't
  be expanded.
- [ ] A click on a row that isn't undone expands it with what undoing does (`undo.details`); `Enter` on the row does
  the same.
- [ ] With no operations the page says *No operations yet: changes made from Datardo to documents and keys show up
  here, to undo them.*; with none matching the filter, *No operations match the filter.*

### `undo.details` — What undoing an operation would do

Expanding a row of the **Undo history** page shows, for each document or key of the operation, how it is now and how
it will be after the undo.

- **Kind**: Read
- **Engine**: Any
- **Function**: `src/features/undo/details.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: a click or `Enter` on a row of the **Undo history** page (`@table`).
- **Offered when**: the operation is not undone.
- **Reads**: the operation's file, and the first 100 of its documents as they are now, with `db.orders.find({ _id: {
  $in: [<ids>] } })`, or the first 100 of its keys with `DUMP <key>`, `PTTL <key>` and `TYPE <key>`.
- **Refuses**: shown in the expanded box, not in a dialog: *This operation is no longer in the undo history.*
  (`/gone`), *This operation was already undone.* (`/already-undone`), *The connection \<name\> no longer exists.*
  (`/no-connection`).
- **Uses**: `undo.changed-since`, `undo.revert-plan`, `query.format` (the `_id` in mongosh syntax), `value.format`
  (the name of a key).
- **Ported from**: Mongoster's card undo.details; `src/history.ts` (`UndoHistory.details`),
  `src/webview/undoHistory.ts` (`detailContent`, `documentBox`, `diffTable`), `src/shared/compare.ts` (`fieldDiff`).
  The keys are *New in Datardo*.

Acceptance:

- [ ] At most 100 documents or keys are shown; with more, the box starts with *First 100 of 2,500 documents.* (*… of
  2,500 keys.*)
- [ ] Each document shows its `_id` in mongosh syntax and what the operation did: `inserted: the undo deletes it`,
  `updated: the undo restores it`, `deleted: the undo inserts it again`; one changed since is marked `changed since`.
- [ ] Each key shows its name and `created: the undo deletes it`, `changed: the undo restores it` or `deleted: the
  undo creates it again`, and the same `changed since`.
- [ ] When some changed since, the box says *3 documents changed after the operation: undoing overwrites those
  changes too.* (*3 keys changed …*)
- [ ] The fields of a document are compared in order and by type, in a table with **field**, **now**, **after the
  undo**; a value missing on one side shows `—` (tooltip *Missing now*, *Missing after the undo*); a document missing
  on one side is one row, `(document)`.
- [ ] A key shows two cells, **now** and **after the undo**, each with its type, the size of its dump and its expiry
  (`string · 1.2 KB · no expiry`); the value itself is not shown, because a dump is read only by the server. A key
  missing on one side shows `—`.
- [ ] A document or a key already as the undo would leave it shows *Already as it was: the undo changes nothing.*; an
  inserted document or a created key that is already gone shows *Already deleted.*
- [ ] While the reads run the box says *Loading…*; a refusal or an error of the server is shown in the box.

### `undo.changed-since` — Which documents and keys changed since the operation

Before undoing, Datardo finds what someone changed after the operation, because undoing would overwrite those changes;
the answer decides what the undo asks.

- **Kind**: Derivation
- **Engine**: Any
- **Function**: `src/features/undo/changed-since.ts › changedSince(records, current)`
- **Inputs**: the records of the operation (`undo.kept`) and the same documents or keys as they are now: documents
  read by `_id` with every BSON type, keys read with `DUMP` and `PTTL`.
- **Output**: the records changed since, the question to ask and the line of the confirmation.
- **Rules**:
  - a document changed since when the fingerprint of its current value (`null` when it does not exist) differs from
    `after`;
  - a key changed since when the fingerprint of its current dump (`null` when it does not exist) differs from `after`,
    or when its expiry differs from the one kept after the write as in `undo.kept`. A key that expired by itself
    since then counts: the undo would create it again;
  - none changed: nothing is asked, and the confirmation's button is **Undo**;
  - all changed: nothing is asked, the confirmation adds its line and its button is **Undo anyway**;
  - some changed: the question **Undo all** or **Undo unchanged only** is asked first, with the line; the
    confirmation's button is then **Undo anyway** after **Undo all**, and **Undo** after **Undo unchanged only**;
  - the line: *The document changed after the operation: undoing overwrites those changes too.* (an operation of one
    document, changed), *All of them changed after the operation: …* or *2 of them changed after the operation: …*;
    *The key changed …* for an operation of one key.
- **Uses**: `undo.revert`, `undo.details`, `undo.kept`.
- **Ported from**: Mongoster's card undo.changed-since; `src/history.ts` (`UndoHistory.undo`, `fingerprint`,
  `fetchByIds`). The keys are *New in Datardo*.

Examples:

| Operation did | Since then | Changed since |
| --- | --- | --- |
| updated `status` to `"b"` | nothing | no |
| updated `status` to `"b"` | someone set `status: "c"` | yes |
| updated `status` to `"b"` | someone replaced it with the same fields in another order | yes |
| inserted it | someone deleted it | yes (`after` is a fingerprint, now `null`) |
| deleted it | nothing | no (`null` and `null`) |
| deleted it | someone inserted a document with the same `_id` | yes |
| `SET orders:42 "b"` | nothing | no |
| `SET orders:42 "b"` | `APPEND orders:42 "c"` | yes |
| `SET orders:42 "b" EX 60` | 61 seconds passed | yes (the key is gone) |
| `SET orders:42 "b" EX 60` | 20 seconds passed | no (the same expiry time) |
| `DEL orders:42` | `SET orders:42 "z"` | yes |

Acceptance:

- [ ] Undoing an **Update many** of 3 documents of which 1 changed since asks **Undo all** or **Undo unchanged only**
  and says *1 of them changed after the operation: undoing overwrites those changes too.*
- [ ] Undoing a deletion of one document that someone inserted again confirms with **Undo anyway** and says *The
  document changed after the operation: undoing overwrites those changes too.*
- [ ] Undoing `DEL orders:42` after someone set the key again confirms with **Undo anyway** and says *The key changed
  after the operation: undoing overwrites those changes too.*
- [ ] Each row of the table above gives its result.

### `undo.revert` — Undo an operation

Puts the documents or the keys of an operation back as they were: deletes what it created, restores what it changed,
creates again what it deleted, with the same BSON types and the same bytes. The undo is an operation too, so it can
be undone (redo).

- **Kind**: Operation
- **Engine**: Any
- **Function**: `src/features/undo/revert.ts › plan(context, answers)`
- **Entry points**: **Undo** on a row of the **Undo history** page (`@table`); **Undo** in the notification of a
  write (`@notification`, `undo.notification`); `undo.last`.
- **Offered when**: the operation is not undone.
- **Asks**: when some of the documents or keys changed since, and not all: **Undo all** or **Undo unchanged only**
  (`undo.changed-since`).
- **Reads**: the operation's file; its documents or keys as they are now (`undo.changed-since`), which are also what
  the undo keeps for its own record.
- **Plan**: the steps of `undo.revert-plan`.
  - Documents, one step per 1,000: `db.orders.bulkWrite([<operations>], { ordered: false })`, each operation `{
    deleteOne: { filter: { _id: <id> } } }` for an inserted document or `{ replaceOne: { filter: { _id: <id> },
    replacement: <before>, upsert: true } }` for the others.
  - Keys, one step per key, sent in pipelines of 1,000 to the database of the target: `DEL <key>` for a key the
    operation created, `RESTORE <key> <ttl> <dump> REPLACE` for the others. `<ttl>` is the `PTTL` kept, in
    milliseconds, or `0` for a key that had no expiry: the key gets back the time it had left when the operation ran.
    The confirmation and the Log write the dump as `<dump, 1.2 KB>`.
- **Danger**: Confirm: **Undo "\<title\>" in \<connection\> › \<database\>.\<collection\>?** (**… in
  \<connection\> › db0?** for keys), with *The undo deletes 2 inserted documents, restores 3 updated documents,
  inserts again 1 deleted document.* (*The undo deletes 2 created keys, restores 3 changed keys, creates again 1
  deleted key.*), the line of `undo.changed-since`, and the line of `undo.note` for the undo itself. Button
  **Undo**, or **Undo anyway** when what is taken changed since.
- **Read-only**: Refused on a read-only connection: *The connection \<name\> is read-only: nothing can be undone
  through it.* (`/read-only`).
- **Undo**: Recorded in the undo history (`undo.record`) as **Undo: \<title\>**, marked as the undo of the operation;
  undoing it is the redo.
- **Publishes**: Published for redis-oplog (`oplog.publish`) when the operation is on documents: the events come from
  the documents before and after the undo (`oplog.changes`).
- **After**: on success the operation is marked undone, its file is deleted and its size becomes 0. The tree and every
  open page that shows the collection or the keys read again. Started from the page, the result shows in the page's
  message line; otherwise in a notification, with **Undo** for the redo (`runner.notify`).
- **Refuses**: *This operation is no longer in the undo history.* (`/gone`), *This operation was already undone.*
  (`/already-undone`), *The connection \<name\> no longer exists.* (`/no-connection`), the read-only message above
  (`/read-only`). Any error of the server: *Undo failed: \<error\>*.
- **Settings**: those of `undo.record`, for the undo's own record.
- **Uses**: `undo.changed-since`, `undo.revert-plan`, `undo.note`, `undo.record`, `oplog.publish`, `runner.confirm`,
  `runner.notify`, `tree.refresh`, `connection.connect` (a connection that is not connected is connected first).
- **Ported from**: Mongoster's card undo.revert; `src/history.ts` (`UndoHistory.undo`, `UndoHistory.undoAndReport`,
  `HistoryPanel.receive`), `src/webview/undoHistory.ts`, `src/redisOplog.ts`. The keys are *New in Datardo*.

Acceptance:

- [ ] Undoing an **Update many** puts every changed field back with its BSON type (`Int32` stays `Int32`).
- [ ] Undoing a **Delete many** inserts the deleted documents again with their `_id`s.
- [ ] Undoing an insert deletes the inserted documents.
- [ ] Undoing `DEL orders:42`, a hash that had 90 seconds left when it was deleted, sends `RESTORE orders:42 90000
  <dump> REPLACE` to `db0`, and the hash is back with the same fields and 90 seconds left.
- [ ] Undoing `SET session:9 x` on a key that did not exist sends `DEL session:9`.
- [ ] **Undo unchanged only** leaves what changed since as it is, and the operation is still marked undone.
- [ ] On success the message is *Undid "\<title\>": 5 documents in \<connection\> › \<database\>.\<collection\>.*
  (*… 5 keys in \<connection\> › db0.*)
- [ ] When some fail, the message is *Undo of "\<title\>" incomplete: 2 documents of 5 failed: \<error\>*, the
  operation stays in the history to try again, and what was undone is recorded as its own operation. A `RESTORE`
  the server refuses (*ERR DUMP payload version or checksum are wrong*, after the server changed version) is such a
  failure.
- [ ] The undo of `X` is titled `Undo: X`, the undo of `Undo: X` is `Redo: X`, the undo of `Redo: X` is `Undo: X`.
- [ ] On a connection that publishes for redis-oplog, the undo of documents is published like any other write.
- [ ] After an undo, an open collection tab of the collection, or keys tab of the database, shows the documents or
  the keys as they are now.
- [ ] With **Stop keeping undo history** on for the connection, or more documents than
  `datardo.undo.maxDocumentsPerOperation`, the confirmation says that the undo itself can't be undone.
- [ ] Closing the confirmation started from the page leaves the row's **Undo** button as it was.
- [ ] On a connection made read-only since, **Undo** says *The connection \<name\> is read-only: nothing can be undone
  through it.* and sends nothing.

### `undo.revert-plan` — What undo does to each document and key

The steps an undo sends, and what it records of its own, from the operation's records.

- **Kind**: Derivation
- **Engine**: Any
- **Function**: `src/features/undo/revert-plan.ts › revertSteps(records, changed, choice, title)`
- **Inputs**: the records of the operation, the records changed since (`undo.changed-since`), the answer to **Undo
  all** or **Undo unchanged only**, the operation's title.
- **Output**: the steps, what the undo keeps for its own record, the undo's title.
- **Rules**:
  - **Undo unchanged only** takes the records not changed since; every other answer takes all of them;
  - a document without `before` (the operation inserted it): `deleteOne({ _id })`;
  - a document with `before`: `replaceOne({ _id }, before, { upsert: true })`, which also inserts again a deleted one;
  - a key without `before` (the operation created it): `DEL <key>`;
  - a key with `before`: `RESTORE <key> <ttl> <dump> REPLACE`, with `<ttl>` the `PTTL` kept, and `0` when it was `-1`
    (no expiry); `REPLACE` overwrites the key as it is now, and creates again a deleted one;
  - the undo keeps each record taken as it is now (as *did not exist* when it does not exist), so that undoing the
    undo puts it back;
  - the title: `Undo: <title>`; for a title that starts with `Undo: `, `Redo: ` and the rest; for one that starts
    with `Redo: `, `Undo: ` and the rest;
  - the steps are idempotent: running them twice leaves the same documents and keys.
- **Uses**: `undo.revert`.
- **Ported from**: Mongoster's card undo.revert-plan; `src/history.ts` (`UndoHistory.undo`). The keys are *New in
  Datardo*.

Examples:

| Recorded | Now | Step | Kept by the undo |
| --- | --- | --- | --- |
| before `null` (inserted) | `{ _id: 1, a: 1 }` | `deleteOne({ _id: 1 })` | before `{ _id: 1, a: 1 }`, after `null`: deleted |
| before `{ _id: 2, a: 1 }` (updated) | `{ _id: 2, a: 2 }` | `replaceOne({ _id: 2 }, { _id: 2, a: 1 }, { upsert: true })` | before `{ _id: 2, a: 2 }`: updated |
| before `{ _id: 3, a: 1 }` (deleted) | missing | `replaceOne({ _id: 3 }, { _id: 3, a: 1 }, { upsert: true })` | `_id` 3 only: inserted |
| before `null` (created) | the string `"x"` | `DEL session:9` | before the dump of `"x"`, after `null`: deleted |
| before a dump, `PTTL` -1 (changed) | another value | `RESTORE orders:42 0 <dump> REPLACE` | before the dump of the other value: changed |
| before a dump, `PTTL` 90000 (deleted) | missing | `RESTORE orders:42 90000 <dump> REPLACE` | the name only: created |

Acceptance:

- [ ] Undoing the undo of an operation leaves the documents and the keys as the operation had left them.
- [ ] Each row of the table above gives its step and its record.
- [ ] `Undo: Undo: X` is never a title: it is `Redo: X`.

### `undo.notification` — Undo from a write's notification

The notification that reports a recorded write has an **Undo** button, for undoing it at once.

- **Kind**: View
- **Engine**: Any
- **Function**: `src/features/undo/notification.ts › view(state)`
- **Entry points**: **Undo** in the notification of a write (`@notification`). The notification itself is drawn by
  `runner.notify`.
- **Offered when**: the write recorded an operation.
- **Uses**: `undo.revert`, `undo.record`, `runner.notify`.
- **Ported from**: Mongoster's card undo.notification; `src/history.ts` (`UndoHistory.notify`,
  `UndoHistory.undoAndReport`), and its callers in `src/collectionPanel.ts`, `src/docHistory.ts`, `src/transfer.ts`,
  `src/backup.ts`, `src/copy.ts`, `src/generate.ts`.

Acceptance:

- [ ] A write that recorded an operation shows its result with **Undo**; one that recorded nothing shows the result
  without it.
- [ ] **Undo** starts `undo.revert` on that operation: the question and the confirmation are those of that card.
- [ ] The result of the undo shows in a notification, with **Undo** again for the redo, or as an error.
- [ ] A restore of several collections shows no **Undo** and says *Undo from the Undo history, one operation per
  collection*.
- [ ] Once the notification is gone, the operation can still be undone from the **Undo history** page.
- [ ] **Undo** on an operation removed in the meantime says *This operation is no longer in the undo history.*

### `undo.last` — Undo last change

Undoes the newest operation that isn't undone yet, without opening the page.

- **Kind**: Operation
- **Engine**: Any
- **Function**: `src/features/undo/last.ts › plan(context, answers)`
- **Entry points**: **Undo last change** in the toolbar of the **Undo history** page (`@toolbar`); Go to (**Undo last
  change**).
- **Offered when**: always.
- **Asks**: what `undo.revert` asks.
- **Reads**: the list of operations, for the newest one that isn't undone.
- **Plan**: the plan of `undo.revert` for that operation.
- **Danger**: Confirm: the confirmation of `undo.revert`.
- **Read-only**: Refused on a read-only connection, as `undo.revert` (`/read-only`).
- **Undo**: Recorded in the undo history (`undo.record`), as `undo.revert`.
- **Publishes**: Published for redis-oplog (`oplog.publish`), as `undo.revert`.
- **After**: as `undo.revert` started from a notification.
- **Refuses**: with no operation left to undo, *Nothing to undo: the undo history is empty.* (`/empty`).
- **Commands**: `undo.last`.
- **Uses**: `undo.revert`.
- **Ported from**: Mongoster's card undo.last; `src/extension.ts` (where Undo Last Change is registered),
  `src/history.ts` (`UndoHistory.last`).

Acceptance:

- [ ] It undoes the newest operation of any connection and engine that isn't undone, which may be an `Undo: …` (then
  it redoes).
- [ ] It works from Go to whatever tab is active.
- [ ] With every operation undone, or none, it says *Nothing to undo: the undo history is empty.*
- [ ] When the newest operation is on a connection made read-only since, it says the read-only message and undoes
  nothing, also the next time.

### `undo.clear` — Clear the undo history

Deletes every recorded operation and its file.

- **Kind**: Operation
- **Engine**: Any
- **Function**: `src/features/undo/clear.ts › plan(context, answers)`
- **Entry points**: **Clear history…** in the toolbar of the **Undo history** page (`@toolbar`); Go to (**Clear undo
  history**).
- **Reads**: the list of operations, for their number.
- **Plan**: `delete the 12 operations of the undo history`: their files are deleted and the empty list is written.
- **Danger**: Confirm: **Clear the undo history?**, *12 operations can then no longer be undone.*, button **Clear
  history**.
- **Read-only**: Allowed, because it writes nothing to a deployment (operations of read-only connections are cleared
  too).
- **Undo**: Cannot be undone: the files are deleted, and the confirmation says the operations can no longer be undone.
- **After**: the **Undo history** page shows the empty list.
- **Refuses**: from Go to, with an empty history, *The undo history is already empty.* (`/empty`); the page's button
  is disabled then.
- **Commands**: `undo.clear`.
- **Uses**: `runner.confirm`.
- **Ported from**: Mongoster's card undo.clear; `src/history.ts` (`UndoHistory.clear`, `HistoryPanel.receive`),
  `src/extension.ts` (where Clear Undo History is registered).

Acceptance:

- [ ] The number in the confirmation includes the operations already undone.
- [ ] After **Clear history** the folder of the undo history holds only the list of operations, empty.
- [ ] It works from Go to whatever tab is active.
- [ ] With one operation the confirmation says *1 operation can then no longer be undone.*

### `undo.remove` — Remove one operation

Deletes one operation from the undo history, so that its file no longer takes space.

- **Kind**: Operation
- **Engine**: Any
- **Function**: `src/features/undo/remove.ts › plan(context, answers)`
- **Entry points**: **✕** on a row of the **Undo history** page (`@table`), with the tooltip *Remove from the history
  (the operation can no longer be undone)*; `Delete` on the row.
- **Offered when**: on every row, also an undone one.
- **Plan**: `delete the operation "<title>" from the undo history`: its file is deleted and the list is written.
- **Danger**: None: nothing is asked; the tooltip says it can no longer be undone.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone: the file is deleted.
- **After**: the row disappears.
- **Ported from**: Mongoster's card undo.remove; `src/history.ts` (`UndoHistory.clear`, `HistoryPanel.receive`),
  `src/webview/undoHistory.ts`.

Acceptance:

- [ ] A click on **✕** removes the row and its file at once, without asking.
- [ ] Removing an undone operation removes its row; there is no file to delete.
- [ ] Removing the expanded row closes its details.
- [ ] The summary counts one operation less and the space of its file less.

### `undo.limits` — Limits and pruning

The undo history keeps at most a size, an age and a number of operations, deleting the oldest first, so that its
folder stays small.

- **Kind**: Operation
- **Engine**: Any
- **Function**: `src/features/undo/limits.ts › plan(context, answers)`
- **Entry points**: none: it runs when Datardo starts, after each operation is saved, and when a `datardo.undo`
  setting changes.
- **Reads**: the list of operations and the files of the folder of the undo history.
- **Plan**: `delete the 3 operations beyond the limits of the undo history`: their files are deleted and the list is
  written. At start, also `delete 2 files of the undo history that belong to no operation`.
- **Danger**: None: it runs by itself and asks nothing. The operations beyond the limits can no longer be undone;
  the summary's tooltip on the page says the limits.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone: the files are deleted.
- **After**: the **Undo history** page shows what is left.
- **Settings**: `datardo.undo.maxSizeMb` (100), `datardo.undo.maxDays` (7), `datardo.undo.maxOperations` (200); a
  value that isn't a number of 0 or more takes the default. The limits of one operation,
  `datardo.undo.maxDocumentsPerOperation` (10,000) and `datardo.undo.maxOperationSizeMb` (20), are applied by
  `undo.record`.
- **Uses**: `undo.prune-order`.
- **Ported from**: Mongoster's card undo.limits; `src/history.ts` (`UndoHistory.prune`, `historyLimits`,
  `UndoHistory.load`, `UndoHistory.save`), `package.json` (the settings of the history).

Acceptance:

- [ ] With the defaults, the 201st operation drops the oldest one.
- [ ] An operation older than 7 days is dropped at the next start, save or change of the settings.
- [ ] Lowering `datardo.undo.maxOperations` to 10 keeps the newest 10 at once, and the page shows them.
- [ ] At start, operations whose file is missing are dropped (undone ones have no file and stay), and files with no
  operation are deleted.
- [ ] Undone operations count towards `datardo.undo.maxOperations` and `datardo.undo.maxDays`, with no size.
- [ ] An operation whose own file is larger than `datardo.undo.maxSizeMb` is dropped as soon as it is saved, its
  notification has no **Undo**, and the older operations stay in the history.
- [ ] `datardo.undo.maxSizeMb` set to `-5` or to text counts as 100.
- [ ] Operations on documents and on keys share the same limits: 150 operations on documents and 51 on keys drop the
  oldest of the 201.

### `undo.prune-order` — Which operations the limits keep

Given the operations and the limits, which ones stay.

- **Kind**: Derivation
- **Engine**: Any
- **Function**: `src/features/undo/prune-order.ts › keptOperations(operations, now, limits)`
- **Inputs**: the operations with their `time` and `size` (bytes of the compressed file, 0 once undone); now; the
  limits `maxBytes`, `maxDays`, `maxEntries`.
- **Output**: the operations kept; the others are dropped with their files.
- **Rules**:
  - walk the operations from the newest to the oldest;
  - an operation whose own size exceeds `maxBytes` is dropped, and the walk goes on;
  - stop at the first one whose time is not after now minus `maxDays` days, or when `maxEntries` are already kept, or
    when its size added to those kept exceeds `maxBytes`;
  - keep every operation before the stop; drop the one at the stop and every older one, even one that would still
    fit.
- **Uses**: `undo.limits`.
- **Ported from**: Mongoster's card undo.prune-order; `src/history.ts` (`UndoHistory.prune`). The second rule is what
  Mongoster's card wanted and its code did not do.

Examples (`maxBytes` 100 MB, `maxDays` 7, `maxEntries` 200 unless said):

| Operations, newest first | Kept |
| --- | --- |
| 250 of 100 KB in the last 3 days | the newest 200 |
| 60 MB, 30 MB, 20 MB, 1 KB | 60 MB and 30 MB: the 20 MB one stops the walk, and the 1 KB one goes with it |
| 1 day old, 8 days old, 2 days old (the clock was changed) | the first only |
| `maxBytes` 1 MB: a new one of 2 MB, then 10 of 10 KB | the ten of 10 KB: the 2 MB one is dropped alone |
| `maxDays` 0: a new one | none: its time is not after now |
| `maxEntries` 0: any | none |

Acceptance:

- [ ] Operations of 60 MB, 30 MB, 20 MB and 1 KB, newest first, keep the first two.
- [ ] With `maxBytes` 1 MB, a new operation of 2 MB and ten older ones of 10 KB keep the ten.
- [ ] Each row of the table above gives its result.

### `undo.writes-of` — Datardo's writes to one document

Which recorded operations wrote one document between two times, and what each did to it: the document history uses
it to say that a write in the oplog was made by Datardo.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/undo/writes-of.ts › writesOf(operations, records, target, id, from, to)`
- **Inputs**: the connection, database and collection; the document's `_id`; a range of time; the operations of the
  undo history and the records of their files.
- **Output**: `{ title, time, kind }` per operation, `kind` being `inserted`, `updated` or `deleted`.
- **Rules**:
  - an operation counts when it is on the same collection of the same connection and its time is in the range;
  - an operation not undone is read from its own records: no `before` is `inserted`, `after` `null` is `deleted`,
    otherwise `updated`;
  - an undone operation has no file: it is read from its undo (the operation marked as the undo of it), where the
    document went the other way: no `before` is `deleted`, `after` `null` is `inserted`, otherwise `updated`;
  - an operation whose undo was undone in turn (its file gone too), or whose file can't be read, is left out;
  - the `_id` is compared with its BSON type: `1` as `Int32` and `1` as `Double` are two documents.
- **Uses**: `history.show`, `document.restore-version`, `undo.revert-plan`.
- **Ported from**: Mongoster's card undo.writes-of; `src/history.ts` (`UndoHistory.writesOf`), `src/docHistory.ts`.

Examples:

| Operation | Read from | Kind |
| --- | --- | --- |
| `Delete document 1`, not undone | its file: before the document, after `null` | deleted |
| `Insert document`, undone | its undo: before the document, after `null` | inserted |
| `Edit status of 1`, undone | its undo: before and after both set | updated |
| `Update many`, undone, and its undo undone too | neither has a file | left out |

Acceptance:

- [ ] A document deleted from Datardo and then restored by an undo shows the deletion as Datardo's, and the undo as
  Datardo's too.
- [ ] An operation on the same collection name of another connection is not counted.
- [ ] An operation one millisecond after the range is not counted.
- [ ] Each row of the table above gives its result.

### `undo.per-connection` — Stop or keep the undo history of a connection

Turns the undo history off for one connection, for example one whose bulk writes are too large to keep, and back on.

- **Kind**: Operation
- **Engine**: Any
- **Function**: `src/features/undo/per-connection.ts › plan(context, answers)`
- **Entry points**: **Stop keeping undo history** and **Keep undo history** in the menu of the connection island
  (`@connection-island`), in the context menu of a connection in the connection switcher (`@connection-switcher`) and
  of its card on Home (`@home`); Go to, with the same two titles, for the current connection.
- **Offered when**: **Stop keeping undo history** on a connection that keeps it, **Keep undo history** on one that
  doesn't; neither on a read-only connection.
- **Plan**: `save the connection <name>`, with its undo history off or on.
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment; not offered on a read-only connection, which
  records nothing anyway.
- **Undo**: Cannot be undone from the undo history; the other entry turns it back.
- **After**: the connection island says *Changes aren't kept in the undo history* in the connection's tooltip; the
  open tabs of the connection follow at once.
- **Refuses**: from Go to with no current connection, or with a read-only one: *The connection \<name\> is read-only:
  nothing is recorded through it.* (`/read-only`).
- **Commands**: `undo.per-connection:stop`, `undo.per-connection:keep`.
- **Uses**: `undo.record`, `undo.note`, `connection.read-only`.
- **Ported from**: Mongoster's card undo.per-connection; `src/extension.ts` (where Stop Keeping Undo History and Keep
  Undo History are registered), `src/connections.ts` (`ConnectionInfo.noHistory`), `src/history.ts`
  (`UndoHistory.recording`).

Acceptance:

- [ ] After **Stop keeping undo history**, writes through the connection are not recorded and their confirmations say
  *The undo history is off for this connection: this can't be undone.*
- [ ] The operations recorded before stay, and can still be undone; that undo is not recorded, and its confirmation
  says so.
- [ ] **Keep undo history** records the next writes again.
- [ ] A read-only connection records nothing and undoes nothing, whatever this choice.
- [ ] It works the same on a MongoDB and on a Redis connection.
- [ ] The choice is kept when Datardo is closed and started again.

### `undo.forget-connection` — Removing a connection deletes its operations

When a connection is removed, its recorded operations are deleted with it, since they could no longer be undone.

- **Kind**: Operation
- **Engine**: Any
- **Function**: `src/features/undo/forget-connection.ts › plan(context, answers)`
- **Entry points**: none of its own: `connection.remove` puts its step in its own plan.
- **Reads**: the list of operations, for those of the connection.
- **Plan**: `delete the 12 operations of <name> from the undo history`: their files are deleted and the list is
  written. With no operation of the connection there is no step.
- **Danger**: Confirm: the confirmation of `connection.remove`, which shows this step with the others.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone: the files are deleted.
- **After**: the **Undo history** page no longer lists them.
- **Uses**: `connection.remove`, `undo.clear`.
- **Ported from**: Mongoster's card undo.forget-connection; `src/extension.ts` (where Remove Connection is
  registered), `src/history.ts` (`UndoHistory.clear`).

Acceptance:

- [ ] After removing a connection, none of its operations are in the undo history or in its folder.
- [ ] The operations of the other connections stay.
- [ ] The confirmation of the removal shows `delete the 12 operations of Local from the undo history`.
- [ ] Removing a Redis connection that is the linked connection of a MongoDB one deletes the operations on its keys,
  not those on the MongoDB connection's documents.
