# Documents

Reading and writing the documents of a MongoDB collection: the document in the inspector island, the document tab,
editing a value in its cell, the insert dialog, duplicating, deleting one document or the selected rows, **Update
many** and **Delete many**, and putting a document back as it was in a version of its document history.

A *collection that can be changed* below is one that is neither a view nor a collection of a read-only connection. On
the others every write of this area is refused before anything is asked, with *The connection `<name>` is read-only.*
(`/read-only`) or *Views are read-only.* (`/view`), and its controls are not shown.

Every write of this area keeps the same promises: its confirmation, when it has one, shows the steps exactly as they
are sent; it is recorded in the undo history (`undo.record`) within the limits (`undo.limits`); its confirmation, or
the dialog that sends it, says whether it can be undone with the line `undo.note` gives (*It can be undone from the
Undo history.*, *The undo history is off for this connection: this can't be undone.*, *This can't be undone: the
undo history keeps operations of up to 10,000 documents.*); when what must be kept passes the limit of size, which
is known only while it is read, `undo.record` asks whether to go on without the possibility to undo, before anything
is written; and its documents are published for redis-oplog (`oplog.publish`) on the connections that publish.

### `document.inspect` — The document in the inspector

Shows the document of the selected row in the inspector island, as a tree and as mongosh text, with what can be done
with it.

- **Kind**: View
- **Engine**: MongoDB
- **Function**: `src/features/document/inspect.ts › view(state)`
- **Entry points**: selecting a row of the table, with a click or the arrow keys, shows its document (`@table`);
  `Enter` on the selected cell, a double click on a cell that cannot be edited in place, and **Inspect document** in
  the context menu of a row (`@row-menu`) also show the inspector island when it is hidden and move the focus into it.
  Go to: **Inspect document**.
- **Offered when**: in the Documents section of a collection tab, on the result of a query (**Find**) and of a
  pipeline (**Aggregate**).
- **Reads**: nothing: the document as the table has it (every value with its BSON type, with the query's projection).
- **Commands**: `document.inspect`
- **Uses**: `nav.inspector`, `table.selection`, `table.copy-as`, `query.format`, `document.inline-edit`,
  `document.copy-value`, `document.copy-path`, `document.open`, `document.duplicate`, `document.delete`,
  `relation.follow`, `history.show`.
- **Ported from**: document.dialog; `src/webview/main.ts` (`openDocument`, `jsonNode`, `closeDocument`),
  `src/collectionPanel.ts` (the dialog's markup).

What it shows, from the top:

1. The header, `<collection> · <_id>`, the `_id` in mongosh syntax and cut in the middle when it is long
   (`orders · 65f1…a2c`). Its tooltip is `Document <n> · <_id>` in full, where `n` counts from the first row of the
   query, across the pages of results.
2. The buttons: **Previous document** (`‹`) and **Next document** (`›`), which select the row before and after in the
   table and are disabled on the first and the last row of the page of results; **Expand all** (`⊞`) and **Collapse
   all** (`⊟`); the switch **Tree** / **Text**; **Copy as** (`table.copy-as`); **Open in a tab** (`document.open`);
   and a `…` menu with **Duplicate…** (`document.duplicate`) and **Delete document** (`document.delete`).
3. The document. As a **Tree**: one line per field, values in mongosh syntax with the colors of their types, open
   down to three levels; a folded sub-document or array shows `<n> fields` or `<n> items`. A double click on a value,
   or `F2` on it, edits it there (`document.inline-edit`); the context menu of a line has **Copy value**
   (`document.copy-value`) and **Copy field path** (`document.copy-path`). As **Text**: the document in mongosh
   syntax, indented by two spaces (`query.format`), which can be selected and not typed in.
4. **Go from here**: the references of the document, the fields that point to other collections and the collections
   that point to it (`relation.follow`). Only in **Find**, and only when the document has any.
5. **History**: opens the document history (`history.show`).

Its states:

- *Nothing selected*: **Select a document to inspect it.**
- *Several rows selected*: **`<n>` documents selected**, and nothing else: what can be done with them is in the
  selection bar.
- *Aggregate*: the document and **Copy as** only: no **Open in a tab**, **Duplicate…**, **Delete document**, **Go from
  here** or **History**, and no value can be edited.
- *Read-only connection or view*: no **Duplicate…** and no **Delete document**, no value can be edited, and **Open in
  a tab** opens the document read-only. On a view there is no **History**.
- *No `_id`*: **Open in a tab**, **Delete document** and **History** are disabled, with the tooltip *Not available:
  the document has no _id (excluded by the projection?)*.
- *Hidden*: the inspector island can be hidden (`nav.inspector`); selecting a row then shows nothing.

When the table runs its query again, the inspector shows the same document as it is now; when that document is no
longer in the page of results, it goes back to *Nothing selected*.

Acceptance:

- [ ] Selecting the third row of the second page of 50 shows that document, and the tooltip of the header reads
  `Document 53 · <_id>`.
- [ ] **Next document** shows the next document and selects its row in the table; on the last row of the page of
  results it is disabled.
- [ ] Sub-documents deeper than three levels are folded and show `<n> fields`; **Expand all** unfolds them.
- [ ] **Text** shows the same document in mongosh syntax, with `ObjectId("…")` and `ISODate("…")`, indented by two
  spaces.
- [ ] With a projection that leaves out `_id`, **Open in a tab**, **Delete document** and **History** are disabled
  with the tooltip *Not available: the document has no _id (excluded by the projection?)*.
- [ ] On a read-only connection there is no **Duplicate…** and no **Delete document**, a double click on a value
  edits nothing, and **Open in a tab** opens the document read-only.
- [ ] In **Aggregate** the inspector has the document and **Copy as** only.
- [ ] With three rows selected the inspector says **3 documents selected**.
- [ ] `Enter` on a selected cell while the inspector island is hidden shows it with that row's document.

### `document.copy-value` — Copy a value from the inspector

Copies one value of the inspected document, in mongosh syntax.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/document/copy-value.ts › plan(context, answers)`
- **Entry points**: **Copy value** in the context menu of a line of the inspector's tree (`@inspector`); `Ctrl+C` on
  the selected line.
- **Offered when**: a line of the tree is selected, in every state of `document.inspect`.
- **Plan**: no step: it writes nothing.
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone: nothing is written.
- **After**: the value is on the clipboard in mongosh syntax (`query.format`), a sub-document or an array on several
  lines; the status line says *Copied to the clipboard*.
- **Uses**: `document.inspect`, `query.format`.
- **Ported from**: the row menu's **Copy value** of `src/webview/main.ts`; in the inspector it is new in Datardo.

Acceptance:

- [ ] **Copy value** on `createdAt` copies `ISODate("2024-03-15T10:00:00.000Z")`.
- [ ] **Copy value** on a `Long` beyond the safe integers copies `NumberLong("9007199254740993")`.
- [ ] **Copy value** on `address` copies the whole sub-document, which pastes into the query bar as it is.
- [ ] It works on a read-only connection, on a view and in **Aggregate**.

### `document.copy-path` — Copy a field path from the inspector

Copies the dotted path of a field of the inspected document, to paste it into a filter, a sort or a projection.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/document/copy-path.ts › plan(context, answers)`
- **Entry points**: **Copy field path** in the context menu of a line of the inspector's tree (`@inspector`).
- **Offered when**: a line of the tree is selected.
- **Plan**: no step: it writes nothing.
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone: nothing is written.
- **After**: the path is on the clipboard: the names joined by dots, an element of an array by its position
  (`items.2.qty`); the status line says *Copied to the clipboard*.
- **Uses**: `document.inspect`.
- **Ported from**: *New in Datardo*.

Acceptance:

- [ ] On `city` inside `address` it copies `address.city`.
- [ ] On `qty` of the third element of `items` it copies `items.2.qty`.
- [ ] On a field whose name has a dot or starts with `$` it still copies the names joined by dots, as they are.

### `document.read` — Read one document with its types

Reads one document by its `_id` exactly as it is stored, for the features that edit it, compare it or write it back.

- **Kind**: Read
- **Engine**: MongoDB
- **Function**: `src/features/document/read.ts › request(context, args)` and `› parse(reply)`
- **Reads**: `db.orders.find({ _id: ObjectId("…") }).limit(1)`, or with a projection of one top-level field
  (`db.orders.find({ _id: ObjectId("…") }, { qty: 1 }).limit(1)`) when only one value is wanted. Values are not
  promoted: an `Int32`, a `Double` and a `Long` stay apart, and a regular expression stays a BSON one.
- **Uses**: used by `document.inline-edit`, `document.open`, `document.save`, `document.duplicate`,
  `document.delete`, `document.restore-version` and `history.show`.
- **Ported from**: `src/documentFs.ts` (`readFile`, `byId`), `src/collectionPanel.ts` (`updateField`).

`parse` gives the document as canonical Extended JSON, or nothing when no document has that `_id`.

Acceptance:

- [ ] A document with `{ a: Int32(1), b: Double(1), c: Long(1) }` is returned with the three types apart.
- [ ] An `_id` that is a number is matched by value: asking for `1` finds the document whose `_id` is `Double(1)`.
- [ ] An `_id` no document has gives nothing, not an error.
- [ ] With the projection `{ qty: 1 }` only `_id` and `qty` are read.

### `document.inline-edit` — Edit a value in its cell

Changes one value of one document from the table or from the inspector's tree, in mongosh syntax, without opening
the document.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/document/inline-edit.ts › plan(context, answers)`
- **Entry points**: a double click on a cell, or `F2` on the selected cell (`@table`); **Edit value** in the context
  menu of a cell (`@cell-menu`); a double click on a value of the inspector's tree, or `F2` on it (`@inspector`). Go
  to: **Edit value**, on the selected cell.
- **Offered when**: in **Find**, on a collection that can be changed, on a row whose document has an `_id`, on any
  cell but `_id` and its sub-fields, a `… N more` cell or a filler. An empty cell edits a missing field; a cell of an
  expanded array edits that element (`items.2.qty`). A double click where editing is not possible shows the document
  in the inspector (`document.inspect`).
- **Asks**: the new value, in an editor over the cell (or over the line of the tree): the current value in mongosh
  syntax (a string with the inside of its quotes selected; a sub-document or an array formatted on several lines),
  with the hint *Enter to save · Shift+Enter new line · Esc to cancel*. Text that does not parse shows the parser's
  error in place of the hint and is not sent.
- **Reads**: the document by `_id`, only the top-level field of the path (`document.read`), to tell whether the value
  is still the one the table shows.
- **Plan**: `db.orders.updateOne({ _id: ObjectId("…"), qty: 3 }, { $set: { qty: 5 } })`: the filter carries the value
  just read, so that the write applies only if it is still there. For a field that was missing the filter is
  `{ _id: ObjectId("…"), qty: { $exists: false } }`.
- **Danger**: None: one value, saved by an explicit `Enter`; `Esc` or a click elsewhere cancels. Confirm, only when
  the value in the database is no longer the one shown: *`<path>` was changed to `<value>` in the database after it
  was loaded. Overwrite it?*, or *`<path>` was removed in the database after it was loaded. Overwrite it?*, button
  **Overwrite**.
- **Read-only**: Refused on a read-only connection (`/read-only`) and on a view (`/view`): the editor does not open.
- **Undo**: Recorded in the undo history (`undo.record`) as *Edit `<path>` of `<_id>`*, with the document as it was.
  With the undo history off for the connection, the hint under the editor adds the line `undo.note` gives: *The
  undo history is off for this connection: this can't be undone.*
- **Publishes**: Published for redis-oplog (`oplog.publish`): an update of the document with the field of the `$set`,
  cut at a position of an array (`items.2.qty` gives `items`), only when the document was modified.
- **After**: the editor closes and the table runs its query again; the row and the cell stay selected, and the
  inspector shows the new value. No notification. When **Overwrite** is declined nothing is written, the editor stays
  open with *Not saved: the value changed in the database.* and the table runs its query again.
- **Refuses**: *The connection `<name>` is read-only.* (`/read-only`); *Views are read-only.* (`/view`); *_id cannot
  be changed.* (`/id`); *Document not found: it may have been deleted.* (`/not-found`); *`<path>` changed again in
  the database: refresh and retry.* when the conditional update matched nothing (`/changed-again`). An error of the
  server is shown under the editor, which stays open.
- **Commands**: `document.inline-edit`
- **Settings**: `datardo.undo.enabled` (whether the edit is recorded).
- **Uses**: `document.read`, `document.keep-numeric-types`, `query.parse`, `query.format`, `query.run`,
  `runner.confirm`, `undo.note`, `undo.record`, `oplog.publish`, `connection.read-only`.
- **Ported from**: document.inline-edit; `src/collectionPanel.ts` (`updateField`), `src/webview/main.ts`
  (`editTarget`, `startEdit`), `src/webview/cellEditor.ts`, `src/documentFs.ts` (`restoreTypes`).

Acceptance:

- [ ] A double click on `qty` of a document of `shop.orders`, typing `5` and `Enter` runs
  `db.orders.updateOne({ _id: <id>, qty: 3 }, { $set: { qty: 5 } })`, and the table shows 5.
- [ ] A `Double` field edited to `6` stays a `Double`; a `Long` field edited to `7` stays a `Long`; `NumberLong(8)`
  typed in an `Int32` field makes it a `Long`.
- [ ] Editing an empty cell adds the field to that document only, with `{ qty: { $exists: false } }` in the filter.
- [ ] Editing `items[].qty` of the third element sets `items.2.qty` and leaves the other elements as they were.
- [ ] `Esc`, or a click outside the editor, writes nothing; `Shift+Enter` adds a new line instead of saving.
- [ ] Text that does not parse shows the parser's error under the editor and nothing is sent.
- [ ] When another client changed the value after the table was loaded, saving asks *qty was changed to 9 in the
  database after it was loaded. Overwrite it?*; declining writes nothing and says *Not saved: the value changed in
  the database.*
- [ ] Cells of `_id` and of rows without `_id` do not open the editor; in **Aggregate**, on a view and on a read-only
  connection no cell does.
- [ ] A double click on `status` in the inspector's tree opens the same editor and saves the same way.
- [ ] The edit is in the undo history as *Edit qty of `<_id>`*, and undoing it puts the old value back.
- [ ] On a connection that publishes for redis-oplog, the edit publishes `{ e: 'u', d: { _id }, f: ['qty'] }`; an
  edit of `items.2.qty` publishes `f: ['items']`.

### `document.keep-numeric-types` — Keep the numeric type of an edited value

A number typed as plain text cannot say whether it is an `Int32`, a `Double` or a `Long`; the value keeps the type it
had in the database, unless the user wrote another type explicitly.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/document/keep-numeric-types.ts › withKeptTypes(next, prev)`
- **Uses**: `query.parse`. Used by `document.inline-edit`, with the value read from the database, and by
  `document.save`, with the document as it was opened.
- **Ported from**: document.keep-numeric-types; `src/documentFs.ts` (`restoreTypes`).

Inputs: `next`, the value parsed from the user's text (`query.parse`), in which each number is either *plain* (`5`,
`6.5`, `5000000000`) or *explicit*, written with its type (`NumberInt(5)`, `NumberLong(8)`, `NumberDecimal("1.10")`);
`prev`, the value as stored (`document.read`), or nothing. Output: the value to write.

Rules:

1. An explicit number is kept as written, whatever `prev` is.
2. A plain number, when `prev` is an `Int32`, a `Double` or a `Long`:
   - when it reads the same as `prev` (the same text), the result is `prev` unchanged;
   - when `prev` is a `Double`, the result is a `Double` of the new value;
   - when `prev` is a `Long` and the new value is an integer that fits 64 bits, the result is a `Long`;
   - otherwise the value as parsed: an integer within 32 bits is an `Int32`, a larger one a `Long`, a number with
     decimals a `Double`.
3. An array is restored element by element, each against the element at the same position of `prev`.
4. A sub-document is restored field by field, each against the field of the same name in `prev`.
5. Anything else (strings, dates, `Decimal128`, a `prev` that is not a number or is missing) is `next`.

Examples:

| `prev` | Text typed | Result |
| --- | --- | --- |
| `Double(5.5)` | `6` | `Double(6)` |
| `Long(5)` | `7` | `Long(7)` |
| `Int32(1)` | `1.5` | `Double(1.5)` |
| `Int32(1)` | `NumberLong(2)` | `Long(2)` |
| `Int32(1)` | `5000000000` | `Long(5000000000)` |
| `Double(5.5)` | `5000000000` | `Double(5000000000)` |
| `Double(5.5)` | `NumberInt(5)` | `Int32(5)` |
| `Long(5)` | `7.5` | `Double(7.5)` |
| `"5"` | `5` | `Int32(5)` |
| `{ a: Double(1), b: [Long(2)] }` | `{ a: 2, b: [3], c: 4 }` | `{ a: Double(2), b: [Long(3)], c: Int32(4) }` |

Acceptance:

- [ ] Each row of the table above gives its result.
- [ ] A value that is not changed keeps its exact BSON value, whatever its type.
- [ ] `5000000000` typed in a `Double` field gives `Double(5000000000)`, not a `Long`.
- [ ] `NumberInt(5)` typed in a `Double` field gives `Int32(5)`.
- [ ] A `Decimal128` field edited to `1.5` becomes a `Double`, and edited to `NumberDecimal("1.5")` stays a
  `Decimal128`.

### `document.open` — The document tab

Opens one document in a tab of its own, in Datardo's editor and in mongosh syntax, to read it with all the room of
the main island and to change it as a whole.

- **Kind**: View
- **Engine**: MongoDB
- **Function**: `src/features/document/open.ts › view(state)`
- **Entry points**: **Open in a tab** in the inspector (`@inspector`) and in the context menu of a row
  (`@row-menu`); **Open document** on the document history page (`history.show`) and in the detail of a change event
  (`watch.event-detail`); **Open document** in the context menu of a document found on the Search documents page
  (`search.show`, `@item-menu`); **Open in a tab** in the insert dialog, for a new document (`@dialog`). Go to: **Open
  document in a tab**, on the selected row.
- **Offered when**: the document has an `_id`; in **Find**. On a view or a read-only connection the tab opens
  read-only.
- **Reads**: the document by `_id` (`document.read`) when the tab opens, again after each save, and on **Revert**.
- **Commands**: `document.open`
- **Uses**: `tab.open`, `tab.close`, `tab.restore`, `document.read`, `document.save`, `document.insert-from-tab`,
  `history.show`, `table.copy-as`, `query.format`, `connection.read-only`.
- **Ported from**: document.edit-in-editor and document.insert-in-editor, the part that opens the tab;
  `src/documentFs.ts` (`open`, `openNew`, `readFile`, `formatDocument`, `fileLabel`), `src/collectionPanel.ts`
  (`editDocument`, `insertInEditor`).

The tab belongs to the group of its connection (`tab.open`); opening a document that already has a tab makes that
tab active. Its title is the `_id` in mongosh syntax, cut at 60 characters; the title of a new document is **New
document `<n>`**, `n` counting the new documents opened since Datardo started. The path in the scope bar is
connection, database, collection, then the `_id`.

What it shows:

1. A toolbar: **Save** (`Ctrl+S`, `document.save`), which reads **Insert** on a new document
   (`document.insert-from-tab`); **Revert**, which loads the document again and drops the changes, after *Discard
   your changes to `<_id>`?* with the button **Discard** when there are any; **History** (`history.show`); **Copy
   as** (`table.copy-as`).
2. The editor, with the document in mongosh syntax indented by two spaces (`query.format`), or for a new document
   the text of the insert dialog, or the empty document (`{`, an indented empty line, `}`).

Its states:

- *Loading*: **Loading…** in place of the editor.
- *Unsaved changes*: the text differs from what was loaded: a `●` before the title in the tab strip, and **Save** is
  enabled. Closing the tab then asks first (`tab.close`).
- *Read-only*: a view, or a read-only connection: the editor cannot be typed in, **Save** and **Revert** are
  disabled and a **Read-only** mark has the reason as its tooltip (*The connection `<name>` is read-only.* or *Views
  are read-only.*). The state is the connection's as it is now: making the connection read-only makes its open
  document tabs read-only at once, and allowing changes makes them editable again.
- *Gone*: no document has that `_id`: **This document no longer exists in `<database>.<collection>`.**
- *Error*: the server's message, with **Retry**.
- *New document*: nothing is read; **History** is disabled, with the tooltip *Open a document of a collection first:
  a new document has no history yet.*

Acceptance:

- [ ] **Open in a tab** on the document with `_id` `ObjectId("65f1…a2c")` of `shop.orders` opens a tab in the group
  of its connection, titled `ObjectId("65f1…a2c")`, with the document in mongosh syntax indented by two spaces.
- [ ] A `Long` field beyond the safe integers is shown as `NumberLong("…")`, a date as `ISODate("…")`.
- [ ] Opening the same document again makes the existing tab active and opens no other.
- [ ] Typing in the editor shows `●` before the title; **Revert** asks *Discard your changes to `<_id>`?* and, after
  **Discard**, shows the document as it is in the database.
- [ ] On a view or a read-only connection the editor cannot be typed in and **Save** is disabled.
- [ ] After **Make read-only** on the connection, a document tab opened before can no longer be typed in; after
  **Allow changes** it can again, without being opened again.
- [ ] A document deleted before the tab opened shows **This document no longer exists in shop.orders.**
- [ ] **Open in a tab** in the insert dialog with `{ name: "Ada" }` opens **New document 1** with that text and
  closes the dialog.

### `document.save` — Save the document of a document tab

Replaces the document in MongoDB with the text of its document tab.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/document/save.ts › plan(context, answers)`
- **Entry points**: `Ctrl+S` in the editor of a document tab (`@editor`); **Save** in its toolbar (`@toolbar`). Go
  to: **Save document**.
- **Offered when**: the active tab is a document tab of an existing document with unsaved changes, on a collection
  that can be changed.
- **Asks**: nothing, unless the document changed in the database since the tab loaded it (see **Danger**).
- **Reads**: the document by `_id` (`document.read`), to compare it byte for byte with the one the tab loaded.
- **Plan**: `db.orders.replaceOne({ _id: ObjectId("…") }, { … })`, the document in full as the confirmation and the
  Log show it; after **Insert again**, `db.orders.insertOne({ _id: ObjectId("…"), … })`.
- **Danger**: None when the document is still as the tab loaded it. Confirm when it changed: *This document was
  changed in the database after you opened it.*, with *Overwrite replaces those changes with yours. Revert loads the
  latest version instead.*, button **Overwrite**. Confirm when it was deleted: *This document was deleted from the
  database after you opened it.*, button **Insert again**.
- **Read-only**: Refused on a read-only connection (`/read-only`) and on a view (`/view`), as the connection is when
  the save is asked, not as it was when the tab opened.
- **Undo**: Recorded in the undo history (`undo.record`) as *Edit document `<_id>`*, with the document as it was; a
  document inserted again is recorded as new. The confirmation carries the line of `undo.note`; with no
  confirmation and the undo history off, the tab's toolbar shows that line beside **Save**: *The undo history is off
  for this connection: this can't be undone.* A document larger than `datardo.undo.maxOperationSizeMb` is found so
  only while it is read: `undo.record` then asks before the save.
- **Publishes**: Published for redis-oplog (`oplog.publish`): an update with every field of the document before and
  after, but `_id`, only when the document was modified; an insert after **Insert again**.
- **After**: the tab reads the document again and has no unsaved changes; the collection tabs of that collection
  run their query again. No notification.
- **Refuses**: *The connection `<name>` is read-only.* (`/read-only`); *Views are read-only.* (`/view`); *Invalid
  document: `<parser error>`* (`/invalid`); *A document must be an object { … }* (`/not-a-document`); *_id cannot be
  changed. Use Duplicate to create a copy with a new _id.* (`/id`). After a refusal, and after a confirmation that is
  closed, nothing is written and the text stays in the tab, unsaved.
- **Commands**: `document.save`
- **Settings**: `datardo.undo.enabled`, `datardo.undo.maxOperationSizeMb` (whether the save is recorded).
- **Uses**: `document.open`, `document.read`, `document.keep-numeric-types`, `query.parse`, `runner.confirm`,
  `undo.note`, `undo.record`, `oplog.publish`, `connection.read-only`.
- **Ported from**: document.edit-in-editor; `src/documentFs.ts` (`writeFile`, `restoreTypes`, `byId`).

Acceptance:

- [ ] Changing `status` to `"paid"` and `Ctrl+S` runs `db.orders.replaceOne({ _id: <id> }, { … })` with the whole
  document; the tab loses its `●` and the collection tab shows the new value.
- [ ] A field that was a `Long` or a `Double` keeps its type when its number changes; `NumberLong(…)` forces a
  `Long`; `ObjectId(…)` and `ISODate(…)` are accepted.
- [ ] Removing `_id` from the text and saving keeps the document's `_id`; changing it is refused with *_id cannot be
  changed. Use Duplicate to create a copy with a new _id.*, and nothing is written.
- [ ] `[ { a: 1 } ]` is refused with *A document must be an object { … }*.
- [ ] When another client changed the document after it was opened, saving asks **Overwrite**; closing the
  confirmation writes nothing and the tab stays unsaved.
- [ ] When the document was deleted meanwhile, saving asks **Insert again**, which runs `insertOne` with the same
  `_id`.
- [ ] After **Make read-only** on the connection, saving a document tab opened before is refused with *The
  connection `<name>` is read-only.*
- [ ] The save is in the undo history as *Edit document `<_id>`*, and undoing it puts the document back.
- [ ] On a connection that publishes for redis-oplog, saving a change of `status` publishes an update of the document
  with the fields of the document before and after.

### `document.insert` — Insert documents from the insert dialog

Inserts one or more documents typed or pasted in a dialog, without a document tab.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/document/insert.ts › plan(context, answers)`
- **Entry points**: **Insert** in the toolbar of the Documents section (`@toolbar`); **Insert documents…** in the
  context menu of a collection of the tree (`@tree-menu`); **Insert** in what an empty collection shows in place of
  the table (`@empty-state`). Go to: **Insert documents…**. In the dialog, `Ctrl+Enter` or its **Insert** button
  inserts (`@dialog`).
- **Offered when**: on a collection that can be changed: on a view and on a read-only connection **Insert** is not
  shown.
- **Asks**: the documents, in the dialog **Insert into `<collection>`**: an editor with the hint *One document
  `{ … }` or several `[ { … }, { … } ]`, in mongosh syntax or Extended JSON: paste what Copy gives. `ObjectId(…)`,
  `ISODate(…)` and `NumberLong(…)` keep their types; without `_id` one is generated.*, which completes field names
  and values (`query.autocomplete`). It takes one document, an array, one document per line, or a pasted
  `db.<collection>.insertOne(…)` or `insertMany(…)` (`document.parse-insert-text`). A quarter of a second after the
  last key it says *`<n>` document(s) to insert*, or the parser's error; the button reads **Insert `<n>` documents**
  for several, and *Inserting…* while it runs. **Template** (tooltip *Start from the fields most documents of the
  collection have*) fills it from the collection's fields (`document.insert-template`). **Open in a tab** moves the
  text to a document tab (`document.open`). **Keep open** (tooltip *Stay open after inserting, to insert more*).
  **Cancel**, `Esc` and a click outside close it. The dialog opens with the text left in it when it was last closed
  without inserting.
- **Reads**: nothing before writing.
- **Plan**: `db.people.insertOne({ name: "Ada" })` for one document, `db.people.insertMany([ { … }, { … } ])`
  (ordered) for several. Without `_id`, each document gets a new `ObjectId`.
- **Danger**: None.
- **Read-only**: Refused on a read-only connection (`/read-only`) and on a view (`/view`); nothing opens.
- **Undo**: Recorded in the undo history (`undo.record`) as *Insert document* or *Insert `<n>` documents*, with the
  `_id` of each inserted document. When `undo.note` says the insert will not be recorded (more documents than
  `datardo.undo.maxDocumentsPerOperation`, or the undo history off), the dialog shows its line under the count
  before anything is sent, and the notification has no **Undo**.
- **Publishes**: Published for redis-oplog (`oplog.publish`): an insert for each document inserted.
- **After**: the dialog closes and forgets its text, unless **Keep open** is checked: then it stays open with the
  text and says the result. A notification *Inserted document `<_id>` into `<collection>`.* or *Inserted `<n>`
  documents into `<collection>`.*, with **Undo** when recorded; the table runs its query again; the tree is refreshed
  (`tree.refresh`). When one of several documents is refused (a duplicate key, the validation rules), the ones before
  it stay inserted, the dialog says *Inserted `<k>` of `<n>` documents, then: `<error>`* and keeps the text, and the
  notification says *Inserted `<k>` of `<n>` documents into `<collection>`.*; when none was inserted the dialog shows
  the server's error. A duplicate `_id` adds *. Remove _id to insert a copy with a new one.* to the error.
- **Refuses**: *The connection `<name>` is read-only.* (`/read-only`); *Views are read-only.* (`/view`). Text that
  does not parse is not a refusal: the dialog shows the error and nothing is sent (*Enter a document, e.g. { name:
  "Ada" }* when it is empty).
- **Commands**: `document.insert`
- **Settings**: `datardo.undo.enabled`, `datardo.undo.maxDocumentsPerOperation`, `datardo.undo.maxOperationSizeMb`
  (whether the insert is recorded).
- **Uses**: `document.parse-insert-text`, `document.insert-template`, `document.open`, `query.autocomplete`,
  `query.run`, `runner.ask`, `runner.notify`, `undo.note`, `undo.record`, `undo.limits`, `undo.notification`,
  `oplog.publish`, `tree.refresh`, `connection.read-only`.
- **Ported from**: document.insert; `src/collectionPanel.ts` (`insertDocuments`), `src/webview/insertDialog.ts`,
  `src/shared/formats.ts` (`parseDocuments`, `insertTemplate`).

Acceptance:

- [ ] `{ name: "Ada" }` and `Ctrl+Enter` runs `db.people.insertOne({ name: "Ada" })`, inserts one document with a new
  `ObjectId` and says *Inserted document ObjectId("…") into people.*
- [ ] `[ { a: 1 }, { a: 2 } ]` shows *2 documents to insert*, the button **Insert 2 documents**, and inserts both
  with one `insertMany`.
- [ ] Pasting what **Copy as** gives as mongosh, Extended JSON or an `insertOne` command inserts the same documents
  with the same types.
- [ ] Inserting `{ _id: 1 }` where `_id` 1 exists says the duplicate key error followed by *. Remove _id to insert a
  copy with a new one.*, and the text stays in the dialog.
- [ ] Of `[ { _id: 5 }, { _id: 1 }, { _id: 6 } ]` with `_id` 1 existing, `_id` 5 is inserted, `_id` 6 is not, and the
  dialog says *Inserted 1 of 3 documents, then: …*
- [ ] With **Keep open** checked, the dialog stays open after inserting and says the result.
- [ ] Closing the dialog without inserting keeps its text for the next **Insert**.
- [ ] **Insert documents…** on a collection of a read-only connection says *The connection `<name>` is read-only.*
  and opens nothing; on a view the entry is not there.
- [ ] The insert is in the undo history, and undoing it deletes the inserted documents.
- [ ] With 10,001 documents in the dialog and `datardo.undo.maxDocumentsPerOperation` at 10,000, the dialog says
  *This can't be undone: the undo history keeps operations of up to 10,000 documents.* before inserting, and the
  notification has no **Undo**.
- [ ] On a connection that publishes for redis-oplog, each inserted document publishes `{ e: 'i', d: { _id } }`.

### `document.parse-insert-text` — Read the documents of the insert dialog

Turns the text of the insert dialog into the documents to insert, accepting what Datardo's copy formats and
mongoexport write.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/document/parse-insert-text.ts › documentsOfText(text)`
- **Uses**: `query.parse`. Used by `document.insert`.
- **Ported from**: document.parse-insert-text; `src/shared/formats.ts` (`parseDocuments`, `unwrapInsertCall`,
  `matchingClose`).

Input: the dialog's text. Output: the documents, in order, each value with its type; or an error, whose message the
dialog shows.

Rules:

1. A whole `db.<name>.insertOne(…)`, `db.<name>.insertMany(…)`, `db.<name>.insert(…)`,
   `db.getCollection("…").insert…(…)` or `db["…"].insert…(…)`, with or without a final `;`, is replaced by its first
   argument; the options after it (`{ ordered: false }`) are dropped.
2. The text is parsed as mongosh syntax (`query.parse`). If that fails and the text has at least two lines that are
   not empty, each of the form `{ … }` with an optional final comma, each line is parsed as one document
   (mongoexport's JSON Lines); otherwise the parser's error is the result.
3. An array gives its elements; anything else is one document.
4. Empty text: *Enter a document, e.g. { name: "Ada" }*. An empty array: *The array is empty: add the documents to
   insert*. An element that is not a sub-document, or is one Extended JSON value such as `{ $oid: … }`: *Item `<i>`
   is not a document: each must be an object { … }* for several, *A document must be an object { … }* for one.

Examples:

| Text | Result |
| --- | --- |
| `{ name: "Ada" }` | one document |
| `[ { a: 1 }, { a: 2 } ]` | two documents |
| `{"a":1}` and `{"a":2}` on two lines | two documents |
| `db.people.insertMany([ { a: 1 } ], { ordered: false })` | one document, `{ a: 1 }` |
| `db.getCollection("my-people").insertOne({ a: 1 });` | one document, `{ a: 1 }` |
| `[ { a: 1 }, 2 ]` | *Item 2 is not a document: each must be an object { … }* |
| `{ $oid: "65a1b2c3d4e5f60718293a4b" }` | *A document must be an object { … }* |
| `[]` | *The array is empty: add the documents to insert* |

Acceptance:

- [ ] Each row of the table above gives its result.
- [ ] Text written by `table.copy-as` as mongosh, Extended JSON, JSON Lines or an insert command reads back to the
  same documents, `Int32`, `Long`, `Decimal128` and `ObjectId` included.
- [ ] One line `{ a: 1 },` alone is the parser's error, not a document: the rule of lines needs at least two.

### `document.insert-template` — Template of the insert dialog

Starts the insert dialog from a document shaped like most of the collection's.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/document/insert-template.ts › templateText(fields)`
- **Uses**: `query.autocomplete` (the fields come from its sample of 500 documents), `query.format`. Used by
  `document.insert`.
- **Ported from**: document.insert-template; `src/shared/formats.ts` (`insertTemplate`, `TEMPLATE_VALUES`),
  `src/webview/insertDialog.ts` (**Template**).

Input: the sampled fields, each with its field path, its types (most frequent first) and the share of documents that
have it. Output: mongosh text.

Rules:

1. Only top-level fields (no dot in the field path), not `_id`, present in at least half of the documents (a share
   of 0.5 or more), at most 30, in the order given.
2. Each gets an empty value of its most frequent type: `""` for `string`, `0` for `int`, `double`, `long` and
   `decimal`, `false` for `bool`, `ISODate()` for `date` (the time of the insert), `{}` for `object`, `[]` for
   `array`, `null` for any other type.
3. No such field: the empty document (`{`, an indented empty line, `}`).

Example: the fields `_id` (objectId, 1), `name` (string, 1), `age` (int, 0.9), `address.city` (string, 0.8),
`nickname` (string, 0.2), `createdAt` (date, 1) give `{ name: "", age: 0, createdAt: ISODate() }`, written on
several lines.

Acceptance:

- [ ] The example above gives those three fields, without `_id`, `address.city` and `nickname`.
- [ ] A field present in exactly half of the documents is in the template; one present in 49% is not.
- [ ] A collection of 40 fields that every document has gives the first 30.
- [ ] A collection without fields in half of its documents, and an empty collection, give the empty document.

### `document.insert-from-tab` — Insert the new document of a document tab

Inserts the document written in a document tab that was opened for a new document.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/document/insert-from-tab.ts › plan(context, answers)`
- **Entry points**: `Ctrl+S` in the editor of a new document's tab (`@editor`); **Insert** in its toolbar
  (`@toolbar`). The tab itself is opened by **Open in a tab** of the insert dialog (`document.open`).
- **Offered when**: the active tab is the document tab of a new document. **Open in a tab** is offered while the
  dialog holds at most one document; with several it is disabled, with the tooltip *A document tab inserts one
  document: use Insert for several*; otherwise its tooltip is *Edit in a document tab instead: saving it (Ctrl+S)
  inserts the document*.
- **Asks**: nothing.
- **Reads**: nothing before inserting.
- **Plan**: `db.people.insertOne({ name: "Ada" })`.
- **Danger**: None.
- **Read-only**: Refused on a read-only connection (`/read-only`) and on a view (`/view`), as the connection is when
  the insert is asked; **Open in a tab** is refused the same way.
- **Undo**: Recorded in the undo history (`undo.record`) as *Insert document*; with the undo history off for the
  connection the tab's toolbar shows the line of `undo.note` beside **Insert**.
- **Publishes**: Published for redis-oplog (`oplog.publish`): an insert.
- **After**: a notification *Inserted document `<_id>`*, with **Undo** when recorded; the tab becomes the tab of the
  inserted document, titled with its `_id`, and saving it again replaces that document (`document.save`); the
  collection tabs of that collection run their query again.
- **Refuses**: *The connection `<name>` is read-only.* (`/read-only`); *Views are read-only.* (`/view`); *Invalid
  document: `<parser error>`* (`/invalid`); *A document must be an object { … }*, for an array too
  (`/not-a-document`). An error of the server (a duplicate key, the validation rules) is shown in the tab, and the
  text stays unsaved.
- **Settings**: `datardo.undo.enabled`.
- **Uses**: `document.open`, `document.insert`, `document.save`, `query.parse`, `runner.notify`, `undo.note`,
  `undo.record`, `undo.notification`, `oplog.publish`, `connection.read-only`.
- **Ported from**: document.insert-in-editor; `src/documentFs.ts` (`writeFile`, `openNew`),
  `src/webview/insertDialog.ts` (**Open in Editor**).

Acceptance:

- [ ] `Ctrl+S` in **New document 1** holding `{ name: "Ada" }` runs `db.people.insertOne({ name: "Ada" })` and says
  *Inserted document ObjectId("…")*.
- [ ] After the insert the tab is titled with the new `_id`; saving it again changes that document and inserts no
  other.
- [ ] With two documents in the insert dialog, **Open in a tab** is disabled with the tooltip *A document tab inserts
  one document: use Insert for several*.
- [ ] `[ { a: 1 }, { a: 2 } ]` typed in the tab is refused with *A document must be an object { … }*.
- [ ] A duplicate `_id` shows the server's error, and the tab stays a new document with its text.
- [ ] The insert is in the undo history as *Insert document* and, on a connection that publishes for redis-oplog,
  publishes `{ e: 'i', d: { _id } }`.

### `document.duplicate` — Duplicate a document

Opens the insert dialog with a copy of a document without its `_id`, to insert it as a new one.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/document/duplicate.ts › plan(context, answers)`
- **Entry points**: **Duplicate…** in the `…` menu of the inspector (`@inspector`, tooltip *Insert a copy without
  _id*) and in the context menu of a row (`@row-menu`). Go to: **Duplicate document…**, on the selected row.
- **Offered when**: in **Find**, on a collection that can be changed, on a document with an `_id`.
- **Reads**: the document by `_id` in full and with its types (`document.read`): the copy does not depend on the
  query's projection.
- **Plan**: no step: it writes nothing by itself. **Insert** in the dialog does (`document.insert`).
- **Danger**: None.
- **Read-only**: Refused on a read-only connection (`/read-only`) and on a view (`/view`).
- **Undo**: Cannot be undone: nothing is written; the insert that follows is recorded by `document.insert`.
- **After**: the insert dialog **Insert into `<collection>`** opens with the document in mongosh syntax, indented by
  two spaces, without `_id`. A number whose type a plain number would lose is written with its type: `NumberLong(7)`
  for a `Long`, `Double(5)` for a `Double` without decimals.
- **Refuses**: *The connection `<name>` is read-only.* (`/read-only`); *Views are read-only.* (`/view`); *Document not
  found: it may have been deleted.* (`/not-found`).
- **Commands**: `document.duplicate`
- **Uses**: `document.read`, `document.insert`, `query.format`.
- **Ported from**: document.duplicate; `src/webview/main.ts` (`duplicate`), `src/webview/insertDialog.ts` (`open`).

Acceptance:

- [ ] **Duplicate…** opens **Insert into `<collection>`** with the document in mongosh syntax, indented by two
  spaces, without `_id`.
- [ ] Inserting it gives a new document with a new `_id` and the same fields.
- [ ] A `Double` field of value `5.0` and a `Long` field of value `7` are a `Double` and a `Long` in the inserted
  copy.
- [ ] With the projection `{ name: 1 }` in the query bar, the copy still has every field of the document.
- [ ] On a view, on a read-only connection and in **Aggregate** there is no **Duplicate…**.
- [ ] A document deleted meanwhile says *Document not found: it may have been deleted.* and opens nothing.

### `document.delete` — Delete a document

Deletes one document after a confirmation.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/document/delete.ts › plan(context, answers)`
- **Entry points**: **Delete document** in the context menu of a row (`@row-menu`) and in the `…` menu of the
  inspector (`@inspector`); the `Delete` key on a selected cell, or while one row is selected (`@table`). Go to:
  **Delete document**, on the selected row.
- **Offered when**: in **Find**, on a collection that can be changed, on a document with an `_id`.
- **Reads**: the document by `_id` (`document.read`), to know that it is still there and what the undo history will
  keep.
- **Plan**: `db.people.deleteOne({ _id: 7 })`.
- **Danger**: Confirm: *Delete document `<_id>` from `<collection>`?*, with the step, the line that says whether it
  can be undone (`undo.note`), and the button **Delete**.
- **Read-only**: Refused on a read-only connection (`/read-only`) and on a view (`/view`).
- **Undo**: Recorded in the undo history (`undo.record`) as *Delete document `<_id>`*, with the document. The
  confirmation carries the line of `undo.note`. A document larger than `datardo.undo.maxOperationSizeMb` is found so
  only while it is read: `undo.record` then asks whether to delete without the possibility to undo.
- **Publishes**: Published for redis-oplog (`oplog.publish`): a removal, when a document was deleted.
- **After**: a notification *Deleted document `<_id>` from `<collection>`.*, with **Undo** when recorded; the table
  runs its query again and the inspector goes back to nothing selected; the tree is refreshed (`tree.refresh`). When
  the step deleted nothing, a warning *Document not found: it may have been deleted already.* instead.
- **Refuses**: *The connection `<name>` is read-only.* (`/read-only`); *Views are read-only.* (`/view`); *Document
  not found: it may have been deleted already.* when the read finds none (`/not-found`). An error of the server is
  shown as *Delete failed: `<error>`*.
- **Commands**: `document.delete`
- **Settings**: `datardo.undo.enabled`, `datardo.undo.maxOperationSizeMb`.
- **Uses**: `document.read`, `runner.confirm`, `runner.notify`, `query.run`, `undo.note`, `undo.record`,
  `undo.notification`, `oplog.publish`, `tree.refresh`, `connection.read-only`.
- **Ported from**: document.delete; `src/collectionPanel.ts` (`deleteDocument`), `src/webview/main.ts` (the row
  menu, the `Delete` key, `deleteRows`).

Acceptance:

- [ ] **Delete document** on the document with `_id` 7 of `shop.people` asks *Delete document 7 from people?* and
  shows `db.people.deleteOne({ _id: 7 })`; **Delete** removes the document and the table no longer shows it.
- [ ] Closing the confirmation deletes nothing.
- [ ] The confirmation says *It can be undone from the Undo history.*; with the undo history off for the connection
  it says *The undo history is off for this connection: this can't be undone.*
- [ ] After a delete that was not recorded, the notification *Deleted document 7 from people.* is still shown,
  without **Undo**.
- [ ] A document deleted meanwhile by another client gives *Document not found: it may have been deleted already.*
- [ ] The `Delete` key on a cell asks the same confirmation; in **Aggregate**, on a view and on a read-only
  connection it does nothing.
- [ ] After the delete, **Undo** in the notification puts the document back with the same `_id`.
- [ ] On a connection that publishes for redis-oplog, the delete publishes `{ e: 'r', d: { _id } }`.

### `document.delete-selected` — Delete the selected rows

Deletes the documents of the rows selected in the table, after one confirmation.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/document/delete-selected.ts › plan(context, answers)`
- **Entry points**: **Delete `<n>` documents…** in the selection bar (`@selection-bar`) and in the context menu of a
  selected row (`@row-menu`), with the tooltip *After a confirmation (Delete)*; the `Delete` key while rows are
  selected (`@table`). A selection of one row is `document.delete`.
- **Offered when**: in **Find**, on a collection that can be changed, when more than one row is selected and every
  selected document has an `_id`.
- **Reads**: whether the selected documents fit the undo history by their number (`undo.note`); their size is known
  only while `undo.record` reads them.
- **Plan**: `db.people.deleteMany({ _id: { $in: [ 1, 2, 3 ] } })`.
- **Danger**: Confirm: *Delete `<n>` documents from `<collection>`?*, with *The `<n>` documents selected in the
  table.*, the step, the line that says whether it can be undone (`undo.note`), and the button **Delete**.
- **Read-only**: Refused on a read-only connection (`/read-only`) and on a view (`/view`).
- **Undo**: Recorded in the undo history (`undo.record`) as *Delete `<n>` documents `<_id>`, `<_id>`, …* (cut at 300
  characters), up to `datardo.undo.maxDocumentsPerOperation` documents and `datardo.undo.maxOperationSizeMb`. With
  more documents than the first, the confirmation says so with the line of `undo.note`: *This can't be undone: the
  undo history keeps operations of up to 10,000 documents.* When the documents pass the size while they are read,
  `undo.record` asks whether to delete without the possibility to undo, before anything is deleted.
- **Publishes**: Published for redis-oplog (`oplog.publish`): a removal for each document deleted.
- **After**: a notification *Deleted `<n>` documents from `<collection>`.*, or *Deleted `<k>` of `<n>` documents from
  `<collection>`: the others were already gone.*, with **Undo** when recorded; the table runs its query again, and
  the selection, kept by `_id`, is left with the rows still there; the tree is refreshed (`tree.refresh`).
- **Refuses**: *The connection `<name>` is read-only.* (`/read-only`); *Views are read-only.* (`/view`). An error of
  the server is shown as *Delete failed: `<error>`*.
- **Settings**: `datardo.undo.enabled`, `datardo.undo.maxDocumentsPerOperation`, `datardo.undo.maxOperationSizeMb`.
- **Uses**: `table.selection`, `document.delete`, `runner.confirm`, `runner.notify`, `query.run`, `undo.note`,
  `undo.record`, `undo.limits`, `undo.notification`, `oplog.publish`, `tree.refresh`, `connection.read-only`.
- **Ported from**: document.delete-selected; `src/collectionPanel.ts` (`deleteDocuments`, `writeMany`),
  `src/webview/main.ts` (`selectionItems`, `selectionKey`, `deleteRows`, `canWriteRows`).

Acceptance:

- [ ] With the rows of `_id` 1, 2 and 3 selected, `Delete` asks *Delete 3 documents from people?* with *The 3
  documents selected in the table.*, `db.people.deleteMany({ _id: { $in: [ 1, 2, 3 ] } })` and *It can be undone from
  the Undo history.*; **Delete** removes the three.
- [ ] A sub-row of an expanded array deletes its document once.
- [ ] When one of the three was deleted meanwhile, the result says *Deleted 2 of 3 documents from people: the others
  were already gone.*
- [ ] With 10,001 rows' worth of documents selected and the default limits, the confirmation says *This can't be
  undone: the undo history keeps operations of up to 10,000 documents.*, and the notification has no **Undo**.
- [ ] In **Aggregate**, on a view and on a read-only connection there is no **Delete 3 documents…** and `Delete`
  deletes nothing.
- [ ] **Undo** puts the three documents back.
- [ ] On a connection that publishes for redis-oplog, each deleted document publishes a removal.

### `document.update-selected` — Update the selected rows

Runs **Update many** on exactly the documents selected in the table, whatever the query bar's filter is.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/document/update-selected.ts › plan(context, answers)`
- **Entry points**: **Update `<n>` documents…** in the selection bar (`@selection-bar`) and in the context menu of a
  selected row (`@row-menu`), with the tooltip *Update many, with the filter on their _id*.
- **Offered when**: in **Find**, on a collection that can be changed, when more than one row is selected and every
  selected document has an `_id`.
- **Asks**: the form of `document.update-many`, **Update many · `<collection>`**, with the filter
  `{ _id: { $in: [ … ] } }` of the selected documents in mongosh syntax, and the update.
- **Reads**: as `document.update-many`: the count of the filter (`query.count`), and whether the documents fit the
  undo history.
- **Plan**: `db.people.updateMany({ _id: { $in: [ 2, 3, 5 ] } }, { $set: { status: "archived" } })`.
- **Danger**: Confirm, as `document.update-many`: the step, *3 documents match the filter.*, the line that says
  whether it can be undone (`undo.note`), and the button **Update 3 documents**.
- **Read-only**: Refused on a read-only connection (`/read-only`) and on a view (`/view`).
- **Undo**: Recorded in the undo history (`undo.record`) as *Update many `<filter>` with `<update>`*, within the
  limits of `document.update-many`.
- **Publishes**: Published for redis-oplog (`oplog.publish`), as `document.update-many`.
- **After**: as `document.update-many`; the selection is kept.
- **Refuses**: as `document.update-many`.
- **Uses**: `table.selection`, `document.update-many`.
- **Ported from**: document.update-selected; `src/webview/main.ts` (`selectionItems`, `idFilter`, `canWriteRows`),
  `src/webview/bulk.ts` (`open`).

Acceptance:

- [ ] With the rows of `_id` 2, 3 and 5 selected, **Update 3 documents…** opens **Update many · people** showing
  `{ _id: { $in: [ 2, 3, 5 ] } }` and *3 documents match the filter.*
- [ ] Applying `{ $set: { status: "archived" } }` changes those three documents only, whatever the filter of the
  query bar is.
- [ ] A sub-row of an expanded array counts its document once.
- [ ] With one row selected, and when a selected document has no `_id`, the entry is not there.

### `document.update-many` — Update many

Applies update operators or an update pipeline to every document matching the filter of the query bar.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/document/update-many.ts › plan(context, answers)`
- **Entry points**: **Update many…** in the toolbar of the Documents section (`@toolbar`), with the tooltip *Update
  every document matching the filter*; **Update `<n>` documents…** on selected rows (`document.update-selected`). Go
  to: **Update many…**. `Ctrl+Enter` in the form continues (`@form`).
- **Offered when**: in **Find**, on a collection that can be changed. The filter of the query bar must parse:
  otherwise *Invalid query syntax — check the highlighted field.* and no form. When the filter differs from the last
  query run, the query runs first (`query.run`), so that the table shows the documents concerned.
- **Asks**: the form **Update many · `<collection>`**: the filter as written, or `{ }  — no filter: every document of
  the collection`; *Counting matching documents…*, then *`<n>` documents match the filter.* (*1 document matches the
  filter.*, *No documents match the filter.*); and **Update**, an editor for operators
  (`{ $set: { status: "archived" }, $inc: { version: 1 } }`) or a pipeline (`[ { $set: … } ]`), which completes
  operators and field names (`query.autocomplete`). **Continue** is disabled while nothing matches. The form checks
  the update before it goes on: *Enter the changes, e.g. { $set: { field: "value" } }* when empty; *Update: use update
  operators like { $set: { field: "value" } } (a plain document would replace whole documents)*; *Update: a pipeline
  is a list of stages like { $set: { … } }*; *Update: `<parser error>`*.
- **Reads**: `db.orders.countDocuments({ status: "new" })` for the form (`query.count`); whether the matching
  documents fit the undo history by their number (`undo.note`); their size is known only while `undo.record` reads
  them.
- **Plan**: `db.orders.updateMany({ status: "new" }, { $set: { status: "archived" } })`.
- **Danger**: Confirm: the step, *`<n>` documents match the filter.*, the line that says whether it can be undone
  (`undo.note`), and the button **Update `<n>` documents**. With an empty filter the confirmation reads *Update all
  `<n>` documents of `<collection>`?* with *The filter is empty, so every document of the collection is affected.*,
  and its button is **Update all**. Destructive (D39) when both hold: the filter is empty, that is `{}` once parsed,
  blank text included, and `undo.note` says the update will not be recorded (the undo history is off in the settings
  or for the connection, or `<n>` is over a limit of the undo history). The confirmation then also asks *Type
  `<collection>` to confirm*, the name of the collection, and **Update all** is disabled until it is typed. In every
  other case it stays Confirm: an empty filter whose update will be recorded, and a filter that is not empty, also
  when its update cannot be undone. The rule reads the filter as written, not what it matches:
  `{ _id: { $exists: true } }` is not empty.
- **Read-only**: Refused on a read-only connection (`/read-only`) and on a view (`/view`): **Update many…** is not
  shown there.
- **Undo**: Recorded in the undo history (`undo.record`) as *Update many `<filter>` with `<update>`* (on one line,
  cut at 300 characters), up to `datardo.undo.maxDocumentsPerOperation` documents and
  `datardo.undo.maxOperationSizeMb`. The confirmation carries the line of `undo.note`: with more documents than the
  first, *This can't be undone: the undo history keeps operations of up to 10,000 documents.*; with the undo history
  off, *The undo history is off for this connection: this can't be undone.* When the documents pass the size while
  they are read, `undo.record` asks **Update without the possibility to undo?** before anything is written.
- **Publishes**: Published for redis-oplog (`oplog.publish`): an update of each matched document with the fields the
  update changes, or, for a pipeline whose fields cannot be told from its stages, every field of each document as it
  is after the update; nothing when no document was modified.
- **After**: a notification *Updated `<collection>`: `<m>` matched, `<k>` modified.*, with **Undo** when recorded;
  the table runs its query again; the tree is refreshed (`tree.refresh`). Closing the form or the confirmation
  writes nothing.
- **Refuses**: *The connection `<name>` is read-only.* (`/read-only`); *Views are read-only.* (`/view`); *Invalid
  query syntax — check the highlighted field.* (`/invalid-filter`); *Filter: `<parser error>`* when the filter no
  longer parses as it is sent (`/invalid-filter`). An error of the server is shown in the confirmation's place, with
  nothing written by the step that failed.
- **Commands**: `document.update-many`
- **Settings**: `datardo.undo.enabled`, `datardo.undo.maxDocumentsPerOperation`, `datardo.undo.maxOperationSizeMb`.
- **Uses**: `query.bar`, `query.parse`, `query.run`, `query.count`, `query.autocomplete`, `runner.ask`,
  `runner.confirm`, `runner.notify`, `undo.note`, `undo.record`, `undo.limits`, `undo.notification`,
  `oplog.publish`, `tree.refresh`, `connection.read-only`.
- **Ported from**: document.update-many; `src/collectionPanel.ts` (`bulkApply`, `writeMany`, `confirmEmptyFilter`),
  `src/webview/bulk.ts`, `src/webview/main.ts` (`openBulk`), `src/queries.ts` (`toUpdate`, `toBson`).

Acceptance:

- [ ] With the filter `{ status: "new" }` matching 12 documents, the form says *12 documents match the filter.*
- [ ] `{ $set: { status: "archived" } }` and **Continue** show the confirmation with
  `db.orders.updateMany({ status: "new" }, { $set: { status: "archived" } })` and the button **Update 12 documents**;
  it changes the 12 documents and says *Updated orders: 12 matched, 12 modified.*
- [ ] `[ { $set: { total: { $add: ["$a", "$b"] } } } ]` is applied as an update pipeline.
- [ ] `{ status: "archived" }` is refused by the form with *Update: use update operators like { $set: { field:
  "value" } } (a plain document would replace whole documents)*, and nothing is written.
- [ ] With an empty filter on a collection of 1,204 documents, the undo history on and the documents under its
  limits, the confirmation reads *Update all 1,204 documents of orders?* with *It can be undone from the Undo
  history.* and the button **Update all**; it has no field to type; closing it writes nothing.
- [ ] With an empty filter and `datardo.undo.enabled` off, the same confirmation says *The undo history is off for
  this connection: this can't be undone.* and asks *Type orders to confirm*: **Update all** is disabled until the
  field holds `orders`, compared with case. A blank filter and `{}` are the same empty filter.
- [ ] With an empty filter and `datardo.undo.maxDocumentsPerOperation` set to 1,000, the confirmation of the 1,204
  documents asks *Type orders to confirm* too.
- [ ] With the filter `{ _id: { $exists: true } }` and the undo history off, the confirmation has no field to type
  and its button is **Update 1,204 documents**: the filter is not empty.
- [ ] With no matching document **Continue** is disabled.
- [ ] With the filter `{ status: "new" }` and the undo history off for the connection, the confirmation says *The
  undo history is off for this connection: this can't be undone.* and has no field to type.
- [ ] Above `datardo.undo.maxDocumentsPerOperation` documents the confirmation says *This can't be undone: the undo
  history keeps operations of up to 10,000 documents.*; closing it writes nothing; going on updates, and the
  notification has no **Undo**.
- [ ] **Undo** in the notification puts the 12 documents back as they were.
- [ ] On a connection that publishes for redis-oplog, each modified document publishes
  `{ e: 'u', d: { _id }, f: ['status'] }`.
- [ ] On a view and on a read-only connection there is no **Update many…**.

### `document.delete-many` — Delete many

Deletes every document matching the filter of the query bar.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/document/delete-many.ts › plan(context, answers)`
- **Entry points**: **Delete many…** in the toolbar of the Documents section (`@toolbar`), with the tooltip *Delete
  every document matching the filter*. Go to: **Delete many…**.
- **Offered when**: as `document.update-many`: in **Find**, on a collection that can be changed, with a filter that
  parses; the query runs first when the filter differs from the last one run.
- **Asks**: nothing but the confirmation.
- **Reads**: `db.orders.countDocuments({ status: "draft" })` (`query.count`); whether the matching documents fit the
  undo history (`undo.limits`).
- **Plan**: `db.orders.deleteMany({ status: "draft" })`.
- **Danger**: Confirm: **Delete many · `<collection>`**, with the filter as written (or `{ }  — no filter: every
  document of the collection`), the step, *`<n>` documents match the filter.*, the line that says whether it can be
  undone (`undo.note`), and the button **Delete `<n>` documents**. With an empty filter it reads *Delete all `<n>`
  documents of `<collection>`?* with *The filter is empty, so every document of the collection is affected.*, and
  its button is **Delete all**. Destructive (D39) when both hold: the filter is empty, that is `{}` once parsed,
  blank text included, and `undo.note` says the delete will not be recorded (the undo history is off in the settings
  or for the connection, or `<n>` is over a limit of the undo history). The confirmation then also asks *Type
  `<collection>` to confirm*, the name of the collection, and **Delete all** is disabled until it is typed. In every
  other case it stays Confirm: an empty filter whose delete will be recorded, and a filter that is not empty, also
  when its delete cannot be undone. The rule reads the filter as written, not what it matches:
  `{ _id: { $exists: true } }` is not empty.
- **Read-only**: Refused on a read-only connection (`/read-only`) and on a view (`/view`): **Delete many…** is not
  shown there.
- **Undo**: Recorded in the undo history (`undo.record`) as *Delete many `<filter>`* (on one line, cut at 300
  characters), within the same limits as `document.update-many`. The confirmation carries the line of `undo.note`,
  as there; when the documents pass the size while they are read, `undo.record` asks **Delete without the
  possibility to undo?** before anything is deleted.
- **Publishes**: Published for redis-oplog (`oplog.publish`): a removal for each document deleted; when fewer were
  deleted than matched, only for those gone.
- **After**: a notification *Deleted `<n>` documents from `<collection>`.* (*Deleted 1 document from
  `<collection>`.*), with **Undo** when recorded; the table runs its query again; the tree is refreshed
  (`tree.refresh`).
- **Refuses**: *The connection `<name>` is read-only.* (`/read-only`); *Views are read-only.* (`/view`); *Invalid
  query syntax — check the highlighted field.* and *Filter: `<parser error>`* (`/invalid-filter`); *No documents
  match the filter.* (`/no-match`).
- **Commands**: `document.delete-many`
- **Settings**: `datardo.undo.enabled`, `datardo.undo.maxDocumentsPerOperation`, `datardo.undo.maxOperationSizeMb`.
- **Uses**: `document.update-many`, `query.bar`, `query.parse`, `query.run`, `query.count`, `runner.confirm`,
  `runner.notify`, `undo.note`, `undo.record`, `undo.limits`, `undo.notification`, `oplog.publish`, `tree.refresh`,
  `connection.read-only`.
- **Ported from**: document.delete-many; `src/collectionPanel.ts` (`bulkApply`, `writeMany`, `confirmEmptyFilter`),
  `src/webview/bulk.ts`, `src/webview/main.ts` (`openBulk`).

Acceptance:

- [ ] With the filter `{ status: "draft" }` matching 4 documents, the confirmation shows
  `db.orders.deleteMany({ status: "draft" })` and *4 documents match the filter.*; **Delete 4 documents** deletes
  them and says *Deleted 4 documents from orders.*
- [ ] With an empty filter on `orders`, the undo history on and its 1,204 documents under the limits, *Delete all
  1,204 documents of orders?* is asked, with *It can be undone from the Undo history.* and the button **Delete
  all**; it has no field to type; closing it deletes nothing.
- [ ] With an empty filter and `datardo.undo.enabled` off, the same confirmation says *The undo history is off for
  this connection: this can't be undone.* and asks *Type orders to confirm*: **Delete all** is disabled until the
  field holds `orders`, compared with case. A blank filter and `{}` are the same empty filter.
- [ ] With an empty filter and `datardo.undo.maxDocumentsPerOperation` set to 1,000, the confirmation of the 1,204
  documents asks *Type orders to confirm* too.
- [ ] With the filter `{ _id: { $exists: true } }` and the undo history off, the confirmation has no field to type
  and its button is **Delete 1,204 documents**: the filter is not empty.
- [ ] With a filter that matches nothing it says *No documents match the filter.* and asks nothing.
- [ ] With the filter `{ status: "draft" }` and the undo history off for the connection, the confirmation says *The
  undo history is off for this connection: this can't be undone.* and has no field to type.
- [ ] **Undo** in the notification puts the 4 documents back with their `_id`s.
- [ ] On a connection that publishes for redis-oplog, each deleted document publishes a removal.
- [ ] On a view and on a read-only connection there is no **Delete many…**.

### `document.restore-version` — Restore a version from the document history

Puts a document back as it was in one of its versions in the document history, or inserts again a deleted one.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/document/restore-version.ts › plan(context, answers)`
- **Entry points**: on the document history page (`history.show`): **Restore…** on a write of the list (`@list`),
  **Restore this version…** in the inspector, under the version shown (`@inspector`); **Insert again…** in their
  place when the document no longer exists.
- **Offered when**: on a version whose fields are all known (*exact*), that is not the current one. The buttons are
  disabled while the history loads and on a read-only connection, with the tooltip *The connection `<name>` is
  read-only.*; otherwise their tooltip is *Replace the document as it is now with this version (after a
  confirmation)*, or *The document was deleted: insert it again as it was in this version (after a confirmation)*.
- **Reads**: the document as it is now (`document.read`), to count the fields that differ from the version as
  `history.diff` counts them.
- **Plan**: `db.orders.replaceOne({ _id: 7 }, { … })`, the version in full; or `db.orders.insertOne({ … })` when the
  document was deleted.
- **Danger**: Confirm: *Restore `<_id>` as of `<date and time>`?* with *It replaces the document as it is now in
  `<database>.<collection>`: `<n>` fields differ.* (*1 field differs.*), the step, the line that says whether it can
  be undone (`undo.note`), and the button **Restore**. For a deleted document: *Insert `<_id>` as of `<date and
  time>` again?* with *The document was deleted: it is inserted again in `<database>.<collection>`.*, button
  **Insert again**.
- **Read-only**: Refused on a read-only connection (`/read-only`). A view has no document history (`history.show`).
- **Undo**: Recorded in the undo history (`undo.record`) as *Restore `<_id>` as of `<date and time>`*; the
  confirmation carries the line of `undo.note`.
- **Publishes**: Published for redis-oplog (`oplog.publish`): from the document before and after, an update with the
  fields that differ, or an insert.
- **After**: the page says *Restored `<_id>` as of `<date and time>`.* or *Inserted `<_id>` as of `<date and time>`
  again.*; a notification with the same text and **Undo** when recorded; the collection tabs of that collection run
  their query again; the tree is refreshed (`tree.refresh`); the document history is read again.
- **Refuses**: *The connection `<name>` is read-only: nothing can be restored through it.* (`/read-only`); *The
  connection no longer exists.* (`/not-connected`); *Only a version whose fields are all known can be restored.*
  (`/partial`); *The document is already as it was in this version.* (`/same`). When the document is deleted between
  the confirmation and the step: *Restore failed: The document was deleted meanwhile: restore again to insert it.*
  Any other error: *Restore failed: `<error>`*.
- **Settings**: `datardo.undo.enabled`, `datardo.undo.maxOperationSizeMb`.
- **Uses**: `history.show`, `history.versions`, `history.diff`, `document.read`, `runner.confirm`, `runner.notify`,
  `undo.note`, `undo.record`, `undo.notification`, `oplog.publish`, `tree.refresh`, `connection.read-only`.
- **Ported from**: document.restore-version; `src/docHistory.ts` (`restore`), `src/webview/docHistory.ts`
  (`restoreButton`), `src/shared/compare.ts` (`fieldDiff`).

Acceptance:

- [ ] On an exact version of the document with `_id` 7, changed since, **Restore this version…** asks *Restore 7 as
  of …?* with *…: 2 fields differ.*, `db.orders.replaceOne({ _id: 7 }, { … })` and *It can be undone from the Undo
  history.*; **Restore** makes the document equal to that version, types included.
- [ ] On a deleted document, **Insert again…** runs `insertOne` with the version and its `_id`.
- [ ] A version marked `partial`, and the current version, have no button.
- [ ] Restoring a version that differs from the current document only in the order of its fields says *The document
  is already as it was in this version.*
- [ ] Closing the confirmation writes nothing.
- [ ] On a read-only connection the buttons are disabled, and a restore started anyway is refused with *The
  connection `<name>` is read-only: nothing can be restored through it.*
- [ ] The restore is in the undo history, and undoing it puts the document back as it was before the restore.
- [ ] On a connection that publishes for redis-oplog, the restore publishes an update with the fields that differ.
