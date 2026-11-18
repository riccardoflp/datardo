# Compare

A comparison of two collections: the documents of the left side and of the right side are paired by `_id`, and each
pair is identical or different; the others are only on one side. The two sides can be on different connections, so a
collection of a test deployment can be compared with production. The page lists the differences, shows the
difference of one document field by field, and can copy documents from one side to the other until the two sides
agree.

The page is a View with two Reads behind it. What makes two documents equal is a Derivation the user steers with
three options; the difference of one document, field by field, is another. The two writes, copying one document and
making one side like the other, are Operations.

Comparing the structures of two databases (collections, options, indexes) is another page, `structure.show`.

### `compare.show` — The comparison page of two collections

A page tab with a left and a right collection, the options of the comparison, the counts of what was found and the
list of the differences.

- **Kind**: View
- **Engine**: MongoDB
- **Function**: `src/features/compare/show.ts › view(state)`
- **Entry points**: **Compare with…** in the context menu of a collection or a view of the tree island
  (`@tree-menu`), which opens the page with that collection on the left; Go to (**Compare with…**), for the
  collection of the active tab.
- **Offered when**: the connection is a MongoDB connection.
- **Reads**: the connections, and the databases and collections of the connection chosen for the right side, for its
  three lists; `compare.read` and then `compare.read-details`, when a comparison starts.
- **After**: the tab is titled `Compare: orders` when both collections have the same name or the right side is not
  chosen yet, `Compare: orders ↔ orders2` otherwise, in the group of the connection it was opened on.
- **Commands**: `compare.show`.
- **Uses**: `compare.read`, `compare.read-details`, `compare.equality`, `compare.field-diff`,
  `compare.copy-document`, `compare.make-like`, `query.parse`, `document.open`, `connection.connect`,
  `connection.read-only`, `runner.progress`, `runner.cancel`, `tab.open`, `tab.restore`, `nav.inspector`,
  `nav.status-line`.
- **Ported from**: README, *Comparing collections*; `src/compare.ts` (`ComparePanel`, `pickOther`),
  `src/webview/compare.ts`. Mongoster asks for the other collection before it opens the page and shows the
  difference of a document under its row; choosing the right side in the page and the difference in the inspector
  island are new in Datardo.

What the page shows, from the top:

1. The sides (`@form`). **Left**: `shop.orders`, the name of its connection, and a *read-only* badge when its
   documents cannot be changed, with the reason as tooltip (*The connection Production is read-only.* or *recent is a
   view.*). **⇄** (tooltip *Swap the sides*). **Right**: three lists, **Connection**, **Database** and
   **Collection**, and the same badge.
2. The options (`@form`): **Filter** (placeholder **{ status: "active" }  —  documents compared on both sides**);
   **Ignore** (placeholder **updatedAt, __v**; tooltip *Fields left out of the comparison, separated by commas
   (address.zip, items.price…)*); **Ignore field order** (on; tooltip *Documents whose fields are the same in a
   different order are equal*); **Compare numbers by value** (on; tooltip *1 (int), 1.0 (double) and NumberLong(1)
   are equal*); **Compare** (tooltip *Compare (Enter in the fields)*), which is **Cancel** while a comparison runs.
3. The counts: four chips, *1,180 identical*, *12 different*, *3 only left*, *9 only right*, then *24 differences ·
   1.4 s*, or *The collections are the same · 1.4 s*, or with a filter *The collections are the same for the filter
   · 1.4 s*.
4. **Make right like left…** (tooltip *Insert the documents missing on the right, replace the different ones (and
   optionally delete those only on the right)*) and **Make left like right…** (the same with the sides exchanged),
   when there is at least one difference; then *Showing the first 300 of 1,204; the buttons above apply to all of
   them.* when a kind has more than the list shows.
5. The list of the differences (`@table`): the kind (**Different**, **Only left**, **Only right**), the `_id` in
   mongosh syntax, and what differs: for a different document the paths of its first 4 differing fields and the
   number of the others, `status, total, items.0.qty, ship.zip (+2)`; for a document on one side only, the document
   in mongosh syntax on one line, cut at 240 characters with `…`. Then the buttons of the row
   (`compare.copy-document`).

Choosing the right side:

- **Connection** lists the MongoDB connections, the left side's connection first, with *same connection* and
  *read-only* beside the names they apply to. Choosing one connects it when it is not connected
  (`connection.connect`); a failure shows *Could not connect to Production: <the message>* in the error line.
- **Database** lists the databases of that connection, without `local` and `config`: the one with the left
  database's name first, then by name.
- **Collection** lists the collections and views of that database, without those whose name starts with `system.`
  and without the left collection itself: the one with the left collection's name first, then by name; views are
  marked *view*. A collection with the left collection's name is chosen by itself. With nothing to list, the page
  says *Local › shop has no other collection to compare with.*
- The first time the three lists have a value the comparison starts by itself; later a change of the right side
  clears the result and waits for **Compare**.
- **⇄** exchanges the two collections (the lists then show what was on the left), says *Swapping the sides…* and
  compares again. It is disabled while a comparison runs.

Comparing:

- **Compare**, and `Enter` in **Filter** or **Ignore**, compare with what the page shows. Changing **Ignore field
  order** or **Compare numbers by value** after a comparison compares again.
- While it runs, the page and the status line (`runner.progress`) say *Reading the left side… 12,000 documents*,
  then *Comparing with the right side… 8,000 of 12,000+ documents*, then *Reading the differences… (12,000 left,
  11,950 right documents)*.
- **Cancel**, and **Cancel** on the status line (`runner.cancel`), stop it: *Comparison cancelled.*, and the result
  of the comparison before it, if any, stays.

The chips: *identical* only counts. Each of the other three, pressed, keeps only the rows of its kind in the list;
pressed again it shows them all; it is disabled at 0.

Selecting a row shows the difference of that document in the inspector island (`nav.inspector`):

- for a **Different** document, a table with the columns **field**, **left** and **right**, one row per differing
  field (`compare.field-diff`), `—` with the tooltip *The field is missing* where a side lacks the field, and the
  BSON type beside each value when the two look the same and differ by type; then **Open left** and **Open right**;
- for a document on one side only, the whole document in mongosh syntax, read when the row is selected, with
  **Open left** or **Open right**, **Copy**, and *Missing on the right side* or *Missing on the left side*; *The
  document no longer exists.* when it was deleted since the comparison.

**Open left** and **Open right** open the document in a document tab (`document.open`), read-only when that side
is.

The bounds:

| Bound | Value |
| --- | --- |
| Documents compared per side | 1,000,000; beyond, the comparison fails with *orders has more than 1,000,000 documents to compare: narrow them with a filter.* |
| Differences listed | the first 300 of each kind; all are counted, and the writes apply to all |
| Fields listed for one document | 200 |
| A document on one side only, in the list | 240 characters |
| Time | no limit: a comparison runs until it ends or is cancelled |

States:

- **No right side yet**: the lists, the options disabled, and no counts.
- **Loading**: the progress above; the options and the buttons that write are disabled.
- **Empty**: *No differences.* when the comparison found none; *Nothing of this kind.* when the chip pressed has no
  rows.
- **Error**: the message in an error line under the options: a filter that is not valid (as `query.parse` says it),
  the bound above, or the server's message. The result of the comparison before it stays.
- **Read-only**: a side that is a read-only connection or a view has the *read-only* badge, and every control that
  would write to it is disabled with the reason as tooltip; comparing works the same.

The two sides, the filter, **Ignore** and the two options are kept with the tab and restored with it
(`tab.restore`); a restored tab compares again by itself.

Acceptance:

- [ ] **Compare with…** on `shop.orders` of Local opens a tab titled `Compare: orders` with **Left** at
  `shop.orders` and **Connection** at Local, marked *same connection*.
- [ ] Choosing the connection Production, which has a database `shop` with a collection `orders`, selects them and
  starts the comparison without **Compare**.
- [ ] Choosing a collection `orders_2023` on the right changes the tab's title to `Compare: orders ↔ orders_2023`.
- [ ] On the same connection and database, **Collection** does not list `orders` itself, nor `system.views`.
- [ ] A database whose only collection is the left one says *Local › shop has no other collection to compare with.*
- [ ] With 1,180 identical documents, 12 different, 3 only on the left and 9 only on the right, the chips say so and
  the summary says *24 differences*.
- [ ] Two collections with the same documents show *The collections are the same* and the list says *No
  differences.*; with a filter the sentence is *The collections are the same for the filter*.
- [ ] Pressing the chip *only left* lists only the rows **Only left**; pressing it again lists all.
- [ ] With 1,204 different documents the list has 300 rows **Different** and says *Showing the first 300 of 1,204;
  the buttons above apply to all of them.*
- [ ] A side with 1,000,001 documents matching the filter fails with *orders has more than 1,000,000 documents to
  compare: narrow them with a filter.*
- [ ] `Enter` in **Filter** with `{ status: ` shows the parse error and reads nothing.
- [ ] **Cancel** during the comparison says *Comparison cancelled.* and the previous result is still listed.
- [ ] Unticking **Compare numbers by value** after a comparison compares again, and a document that differs only by
  `1` against `1.0` moves from *identical* to *different*.
- [ ] Selecting a row **Different** shows its fields in the inspector island; selecting a row **Only left** shows the
  document and *Missing on the right side*.
- [ ] With the right side on a read-only connection, **→ Right**, **Delete** for the right and **Make right like
  left…** are disabled with *The connection Production is read-only.* as tooltip.
- [ ] **⇄** puts `shop.orders` of Local on the right, and the documents that were **Only left** are now **Only
  right**.

### `compare.read` — Read both sides and pair the documents

Reads the documents of the two collections and tells, for each `_id`, whether it is on both sides with equal
documents, on both sides with different documents, or on one side only.

- **Kind**: Read
- **Engine**: MongoDB
- **Function**: `src/features/compare/read.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: `compare.show`, when a comparison starts.
- **Reads**: on the left side `db.orders.find(<filter>)`, to its end, in batches of 1,000; then the same on the right
  side. The filter is the page's **Filter**, `{}` when it is empty, and is the same for both sides. The documents
  keep their BSON types. No sort, no projection, no time limit.
- **Refuses**: a filter that is not valid, with the message of `query.parse` (`/filter`); more than 1,000,000
  documents on a side, *orders has more than 1,000,000 documents to compare: narrow them with a filter.*
  (`/too-many`).
- **Uses**: `compare.equality`, `query.parse`, `runner.progress`, `runner.cancel`.
- **Ported from**: `src/compare.ts › ComparePanel.compare`.

Rules:

1. From each document of the left side two things are kept: its `_id`, with its BSON type, and the SHA-1 of the text
   `compare.equality` gives for it. Nothing else of the document stays in memory.
2. Each document of the right side is looked up by `_id`: not found, it is **only right**; found with the same
   SHA-1, **identical**; found with another, **different**. What is left of the left side at the end is **only
   left**.
3. `_id`s are paired with their BSON type: the `_id` `1` as an `Int32` and the `_id` `NumberLong(1)` are two
   documents, one only on each side, whatever **Compare numbers by value** says.
4. The result is the four counts and, for every difference, its `_id` and its kind: the different documents and those
   only on the right in the order the right side gave them, then those only on the left in the order of the left
   side.
5. The progress reaches the page at most every 200 ms.
6. A comparison that is cancelled, or replaced by a newer one, stops reading and changes nothing of what the page
   shows.

Acceptance:

- [ ] With the filter `{ status: "active" }`, both sides are sent `find({ status: "active" })`, and a document that
  is active on the left and not on the right is **Only left**.
- [ ] A document present on both sides that differs only in a field named in **Ignore** is counted *identical*.
- [ ] An empty left collection against a right one of 5 documents gives 0 identical, 0 different, 0 only left and 5
  only right.
- [ ] Two empty collections give *The collections are the same*.
- [ ] `_id: 1` on the left and `_id: NumberLong(1)` on the right give 1 only left and 1 only right.
- [ ] `_id`s that are sub-documents are paired when their fields are in the same order with the same types.
- [ ] The 1,000,001st document of a side stops the read with the message above, naming that side's collection.
- [ ] Cancelling while the right side is read leaves the previous counts on the page.

### `compare.read-details` — Read the documents of the differences shown

Reads again, by `_id`, the documents of the differences the list shows, to say what differs in each.

- **Kind**: Read
- **Engine**: MongoDB
- **Function**: `src/features/compare/read-details.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: `compare.show`, after `compare.read`; and when a row of a document on one side only is selected.
- **Reads**: `db.orders.find({ _id: { $in: [ … ] } })`, 500 `_id`s per query, on the left side for the first 300
  different documents and the first 300 only on the left, on the right side for the first 300 different and the
  first 300 only on the right; both sides at the same time. For a selected row of one side,
  `db.orders.findOne({ _id: ObjectId("65f1c0a2b3d4e5f6a7b8c9d0") })` on that side. The documents keep their BSON
  types.
- **Uses**: `compare.read`, `compare.field-diff`, `query.format`.
- **Ported from**: `src/compare.ts › ComparePanel.compare` (the details), `fetch`, `loadDocument`.

Rules:

1. A different document gets its field differences (`compare.field-diff`) with the options of the comparison. When
   it has none, because only the order of its fields differs, it gets the one row `(field order)`.
2. A document on one side only gets its text in mongosh syntax, on one line, cut at 240 characters with `…`.
3. A different document that is no longer on one of the sides when it is read again, and a one-side document that is
   gone, are left out of the list; the counts stay those of `compare.read`.
4. A selected one-side document that `findOne` does not find shows *The document no longer exists.*; a failure shows
   the server's message in the inspector island.

Acceptance:

- [ ] With 12 different documents, 3 only on the left and 9 only on the right, the left side is sent one `find`
  with 15 `_id`s and the right side one with 21.
- [ ] With 1,204 different documents, 300 are read again on each side, in one query of 500 or fewer `_id`s.
- [ ] A one-side document of 2,000 characters shows 240 characters and `…` in the list, and whole in the inspector
  island.
- [ ] A document deleted on the right between the comparison and the details is not in the list, and *different*
  still counts it.
- [ ] Selecting a row whose document was deleted since shows *The document no longer exists.*

### `compare.equality` — When two documents are equal

Decides whether two documents with the same `_id` are identical or different, and so which documents the copy
buttons write. The user sets it with **Ignore**, **Ignore field order** and **Compare numbers by value**.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/compare/equality.ts › comparable(document, options)`
- **Uses**: nothing.
- **Ported from**: compare.equality; `src/shared/compare.ts › comparable`, `normalize`, `parseIgnore`.

Inputs: the two documents as canonical Extended JSON (every BSON type told apart), and the options `ignore` (paths),
`ignoreOrder`, `numbersByValue`. Output: a text that is the same exactly when the documents compare equal;
`compare.read` hashes it with SHA-1, one hash per `_id`.

Rules:

1. A field whose path is in **Ignore** is left out, at any depth. The path of a field of array elements is the
   array's path and the field's name, without an index: `items.price`. Only the exact path is left out: `b` does not
   leave out `a.b`.
2. With **Ignore field order**, the fields of every document and sub-document are compared sorted by name; without
   it, the order counts. The order of array elements always counts.
3. With **Compare numbers by value**, an `Int32`, an `Int64` and a `Double` with the same value are equal. Longs are
   compared exactly, beyond the 53 bits of a double. `-0` equals `0`; `NaN` equals `NaN`; `Infinity` and `-Infinity`
   differ. `Decimal128` is never equal to the other number types. Without the option, the BSON type counts.
4. Every other value is compared with its BSON type: a string `"1"` never equals the number `1`, a date never equals
   its number of milliseconds.
5. **Ignore** splits on commas, spaces and new lines, without blanks or duplicates: ` a, b.c  a\n,d ,` is `a`, `b.c`,
   `d`.

Worked examples (left → right: result):

| Left | Right | Options | Result |
| --- | --- | --- | --- |
| `{ a: 1, b: 2 }` | `{ b: 2, a: 1 }` | field order counts | different |
| `{ a: 1, b: 2 }` | `{ b: 2, a: 1 }` | **Ignore field order** | identical |
| `{ x: [{ a: 1, b: 2 }] }` | `{ x: [{ b: 2, a: 1 }] }` | **Ignore field order** | identical |
| `{ a: [1, 2] }` | `{ a: [2, 1] }` | both options on | different |
| `{ n: 1 }` (int) | `{ n: 1.0 }` (double) | numbers by type | different |
| `{ n: 1 }` (int) | `{ n: NumberLong(1) }` | **Compare numbers by value** | identical |
| `{ n: 1.5 }` | `{ n: 1 }` (int) | **Compare numbers by value** | different |
| `{ n: NumberLong("9007199254740993") }` | `{ n: 9007199254740992.0 }` | by value | different |
| `{ n: NumberLong("9007199254740992") }` | `{ n: 9007199254740992.0 }` | by value | identical |
| `{ updatedAt: 1, meta: { rev: 1, v: 1 }, items: [{ a: 1, tmp: 1 }] }` | the same with `updatedAt: 2`, `rev: 2`, `tmp: 2` | **Ignore** `updatedAt, meta.rev, items.tmp` | identical |
| `{ a: { b: 1 } }` | `{ a: { b: 2 } }` | **Ignore** `b` | different |

Acceptance:

- [ ] The examples above give the results shown.
- [ ] A document identical under the options is counted as identical and is never written by `compare.copy-document`
  or `compare.make-like`.
- [ ] A different document is written whole, as it is on the source side: ignored fields and field order included.
- [ ] `{ n: -0.0 }` and `{ n: 0 }` are identical with **Compare numbers by value**, and `{ n: NumberDecimal("1") }`
  and `{ n: 1 }` are different.
- [ ] The **Ignore** text ` a, b.c  a\n,d ,` gives the three paths `a`, `b.c` and `d`.

### `compare.field-diff` — The difference of one document, field by field

Lists the fields in which two documents with the same `_id` differ, each with its value on the left and on the
right.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/compare/field-diff.ts › fieldDiff(left, right, options)`
- **Uses**: `compare.equality`, `query.format`.
- **Ported from**: `src/shared/compare.ts › fieldDiff`, `fieldsSummary`, `typeName`; `src/webview/compare.ts ›
  diffTable`, `valueCell`.

Inputs: the two documents with their BSON types, and the options of the comparison. Output: rows, each with a path,
the left value and the right value when that side has the field, and the two BSON types when they are the only
difference; and the summary of the rows for the list.

Rules:

1. Two values are the same when `compare.equality` says so with **Ignore** and **Compare numbers by value** as the
   comparison has them, and always without regard to the order of fields: the order of fields is never a row of a
   field.
2. Two sub-documents that are not the same are compared inside: the fields of the left one in their order, then the
   fields only the right one has. A field missing on one side is a row with the value of the other side alone. A
   field whose path is in **Ignore** gives no row.
3. Two arrays of the same length that are not the same are compared element by element; the index is in the path,
   `items.1.qty`, and is not in the path **Ignore** is matched with (`items.qty`).
4. Any other two values that are not the same are one row with both values whole: values of different types, arrays
   of different lengths, a sub-document against a value.
5. When the two values of a row are written the same in mongosh's relaxed form and differ by BSON type, the row has
   the two types, shown beside the values: `int`, `long`, `double`, `decimal`, `date`, `timestamp`, `objectId`,
   `binData`, `regex`, `symbol`, `null`, `array`, `object`, `string`, `boolean`.
6. At most 200 rows are returned.
7. Two different documents that give no row differ only by the order of their fields: the result is the one row
   `(field order)`, shown as *Same fields and values in a different order*.
8. The summary is the paths of the rows joined by `, `; with more than 4, the first 4 and the number of the others:
   `a, b, c, d (+2)`.

Worked examples:

| Left | Right | Options | Rows (path: left / right) |
| --- | --- | --- | --- |
| `{ _id: 1, status: "new", total: 10 }` | `{ _id: 1, status: "paid", total: 10 }` | any | `status`: `"new"` / `"paid"` |
| `{ _id: 1, a: 1 }` | `{ _id: 1, a: 1, b: 2 }` | any | `b`: — / `2` |
| `{ _id: 1, ship: { city: "Turin", zip: "10100" } }` | `{ _id: 1, ship: { city: "Turin", zip: "10121" } }` | any | `ship.zip`: `"10100"` / `"10121"` |
| `{ _id: 1, items: [{ sku: "A", qty: 1 }, { sku: "B", qty: 2 }] }` | the same with `qty: 3` in the second | any | `items.1.qty`: `2` / `3` |
| `{ _id: 1, tags: ["a", "b"] }` | `{ _id: 1, tags: ["a", "b", "c"] }` | any | `tags`: `["a", "b"]` / `["a", "b", "c"]` |
| `{ _id: 1, n: 1 }` (int) | `{ _id: 1, n: 1.0 }` (double) | numbers by type | `n`: `1` int / `1` double |
| `{ _id: 1, v: "1" }` | `{ _id: 1, v: 1 }` | any | `v`: `"1"` / `1` |
| `{ _id: 1, a: 1, b: 2 }` | `{ _id: 1, b: 2, a: 1 }` | field order counts | `(field order)` |
| `{ _id: 1, a: "x", updatedAt: 1 }` | `{ _id: 1, a: "y", updatedAt: 2 }` | **Ignore** `updatedAt` | `a`: `"x"` / `"y"` |
| `{ _id: 1, items: [{ price: 1, tmp: 1 }] }` | `{ _id: 1, items: [{ price: 2, tmp: 2 }] }` | **Ignore** `items.tmp` | `items.0.price`: `1` / `2` |

Acceptance:

- [ ] The examples above give the rows shown.
- [ ] A document that differs in 6 top-level fields `a` to `f` has the summary `a, b, c, d (+2)`.
- [ ] A field only on the left is a row with `—` on the right and the tooltip *The field is missing*.
- [ ] Two documents that differ in 250 fields give 200 rows.
- [ ] With **Compare numbers by value** on, `{ n: 1 }` against `{ n: 1.0 }` gives no row for `n`.
- [ ] A row `(field order)` is shown as *Same fields and values in a different order* across the two value columns.

### `compare.copy-document` — Copy one document to the other side

On a row of the list, copies that document to the other side (insert or replace), or deletes it from the side where
the other side lacks it, so that the two sides agree on that `_id`.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/compare/copy-document.ts › plan(context, answers)`
- **Entry points**: the buttons on each row of the list (`@table`): **→ Right** (tooltip *Replace the right document
  with the left one*) and **← Left** (*Replace the left document with the right one*) on a different document; **→
  Right** (*Insert the document into the right collection*) and **Delete** (*Delete the document from the left
  collection*) on a document only on the left; **Delete** (*Delete the document from the right collection*) and **←
  Left** (*Insert the document into the left collection*) on a document only on the right.
- **Offered when**: a comparison has a result. The buttons are disabled while a comparison runs and for a side that
  is read-only, with the reason as their tooltip.
- **Reads**: for an insert or a replace, the document on the source side by `_id`, `db.orders.find({ _id: { $in:
  [ObjectId("65f1c0a2b3d4e5f6a7b8c9d0")] } })`, with its BSON types and the order of its fields.
- **Plan**: one step on the target side. For an insert or a replace, `db.orders.bulkWrite([{ replaceOne: { filter: {
  _id: ObjectId("65f1c0a2b3d4e5f6a7b8c9d0") }, replacement: { _id: ObjectId("65f1c0a2b3d4e5f6a7b8c9d0"), status:
  "paid", total: 42.5 }, upsert: true } }], { ordered: false })`, the replacement being the source document whole.
  For a delete, `db.orders.deleteMany({ _id: { $in: [ObjectId("65f1c0a2b3d4e5f6a7b8c9d0")] } })`. The plan's title is
  `Make like Local › shop.orders`, with the connection, database and collection of the source side.
- **Danger**: Confirm: *Make right like left: insert 1 document in Production › shop.orders?* (or *replace 1
  document*, *delete 1 document*; *Make left like right: …* towards the left), with *Documents are written as they
  are now on the other side.*; button **Apply**. A replace overwrites the target document, a delete removes it.
- **Read-only**: Refused when the target side is a read-only connection (`/read-only`) or a view (`/view`).
- **Undo**: Recorded in the undo history (`undo.record`), which keeps the target document as it was (or that it was
  not there), under the plan's title, within `undo.limits`.
- **Publishes**: Not published: the comparison's writes are among those Mongoster's README lists as not published
  for redis-oplog.
- **After**: a notification *Wrote 1 document in Production › shop.orders.* or *Deleted 1 in Production ›
  shop.orders.* (*Nothing changed in Production › shop.orders.* when the server changed nothing), with **Undo** when
  recorded (`undo.notification`); the open collection tabs of the target run their query again; the tree island is
  refreshed (`tree.refresh`); the page compares again with the same options.
- **Refuses**: *The connection Production is read-only. Its documents can't be changed.* (`/read-only`); *recent is a
  view. Its documents can't be changed.* (`/view`); *Wait for the comparison to finish.* while a comparison runs
  (`/comparing`); *Nothing to change: compare again.* when the `_id` is no longer among the differences, as after
  **⇄**, or the source document no longer exists (`/stale`).
- **Settings**: `datardo.undo.enabled`, `datardo.undo.maxDocumentsPerOperation`.
- **Uses**: `compare.equality`, `compare.read`, `undo.record`, `undo.limits`, `undo.notification`, `tree.refresh`,
  `runner.confirm`, `runner.notify`.
- **Ported from**: compare.copy-document; `src/compare.ts › ComparePanel.apply`, `src/webview/compare.ts ›
  rowActions`. Mongoster reads the source document after the confirmation and says the result in the page only.

Acceptance:

- [ ] On a document only on the left, **→ Right** asks *Make right like left: insert 1 document in Local ›
  shop.orders?* and, after **Apply**, the right collection has the document with the same `_id`.
- [ ] A copied document keeps every BSON type: an `Int32` field stays `Int32`, a `Decimal128` stays `Decimal128`,
  and its fields keep their order.
- [ ] On a different document, **← Left** replaces the left document with the right one, ignored fields included.
- [ ] On a document only on the right, **Delete** asks *Make right like left: delete 1 document in …?* and removes
  it from the right collection with `deleteMany({ _id: { $in: [<the _id>] } })`.
- [ ] Closing the confirmation writes nothing.
- [ ] With a read-only connection or a view on the target side, the button is disabled, and the feature started
  anyway is refused with *… Its documents can't be changed.* and writes nothing.
- [ ] The write is in the undo history as `Make like Local › shop.orders`, and **Undo** in the notification puts the
  target document back as it was: the replaced document as before, the inserted one gone, the deleted one there.
- [ ] On a connection that publishes for redis-oplog, nothing is published for the copied or deleted document.
- [ ] After the write the page compares again and the row is gone; an open collection tab of the target shows the
  document as written.
- [ ] A source document deleted since the comparison is refused with *Nothing to change: compare again.*
- [ ] While a comparison runs, the feature is refused with *Wait for the comparison to finish.*

### `compare.make-like` — Make one side like the other

Copies every document missing or different on one side from the other side and, if chosen, deletes the documents
found only on that side, for all the differences of the comparison, not only those shown.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/compare/make-like.ts › plan(context, answers)`
- **Entry points**: **Make right like left…** and **Make left like right…** above the list of the comparison page
  (`@toolbar`).
- **Offered when**: the comparison found at least one difference. Disabled while a comparison runs and for a side
  that is read-only, with the reason as tooltip.
- **Asks**: only when there are documents to copy and documents found only on the target side: *4 documents only on
  the right side can also be deleted.*, pick one of **Keep them** (the default) and **Delete them**.
- **Reads**: the source documents by `_id`, `db.orders.find({ _id: { $in: [ … ] } })`, 500 `_id`s per query, with
  their BSON types and the order of their fields.
- **Plan**: on the target side, in this order: per 500 documents to copy, `db.orders.bulkWrite([{ replaceOne: {
  filter: { _id: … }, replacement: { … }, upsert: true } }, … ], { ordered: false })`, the documents missing on the
  target first, then the different ones; then, when the documents only on the target are deleted, per 500 of them,
  `db.orders.deleteMany({ _id: { $in: [ … ] } })`. The plan's title is `Make like Local › shop.orders`, with the
  connection, database and collection of the source side.
- **Danger**: Confirm: *Make right like left in Production › shop.orders?*, with *insert 3, replace 2 documents from
  the left side.* and, when they are deleted, *delete 4 documents only on the right side.*; button **Apply**, or
  **Delete** when there is nothing to copy. Different documents are overwritten; the documents only on the target
  side are deleted when the user chose so.
- **Read-only**: Refused when the target side is a read-only connection (`/read-only`) or a view (`/view`).
- **Undo**: Recorded in the undo history (`undo.record`) as one operation under the plan's title, which keeps every
  target document written or deleted as it was, when the documents written and deleted are within
  `datardo.undo.maxDocumentsPerOperation` (`undo.limits`); beyond it the confirmation says that it cannot be undone.
- **Publishes**: Not published: the comparison's writes are among those Mongoster's README lists as not published
  for redis-oplog.
- **After**: a notification *Wrote 5 documents, deleted 4 in Production › shop.orders.* (*Wrote 5 documents in …*,
  *Deleted 4 in …*, or *Nothing changed in …*), with **Undo** when recorded (`undo.notification`); the open
  collection tabs of the target run their query again; the tree island is refreshed (`tree.refresh`); the page
  compares again with the same options.
- **Refuses**: *The connection Production is read-only. Its documents can't be changed.* (`/read-only`); *recent is a
  view. Its documents can't be changed.* (`/view`); *Wait for the comparison to finish.* while a comparison runs
  (`/comparing`); *Nothing to change: compare again.* when the comparison has no difference left to apply, as after
  **⇄** (`/stale`).
- **Settings**: `datardo.undo.enabled`, `datardo.undo.maxDocumentsPerOperation`.
- **Uses**: `compare.equality`, `compare.read`, `compare.copy-document`, `undo.record`, `undo.limits`,
  `undo.notification`, `tree.refresh`, `runner.ask`, `runner.confirm`, `runner.notify`.
- **Ported from**: compare.make-like; `src/compare.ts › ComparePanel.apply`, `src/webview/compare.ts › renderBulk`.
  Mongoster asks in one confirmation with the buttons Apply, Apply and Delete 4 and Delete, reads the source
  documents after it, and says the result in the page only.

Acceptance:

- [ ] With 3 documents only on the left, 2 different and 4 only on the right, **Make right like left…** asks *4
  documents only on the right side can also be deleted.* with **Keep them** and **Delete them**.
- [ ] With **Keep them**, the confirmation says *insert 3, replace 2 documents from the left side.*, its button is
  **Apply**, and it inserts the 3, replaces the 2 and leaves the 4 on the right untouched.
- [ ] With **Delete them**, the confirmation also says *delete 4 documents only on the right side.* and the 4 are
  deleted after the copies.
- [ ] With only documents on the target side to delete, nothing is asked, the one button is **Delete**, and nothing
  is copied.
- [ ] With nothing only on the target side, nothing is asked before the confirmation.
- [ ] With a filter, only documents matching the filter on both sides are written or deleted.
- [ ] Documents that are equal by `compare.equality` (for example, different only in an ignored field) are not
  written.
- [ ] Differences beyond the first 300 of each kind shown in the list are written too.
- [ ] 1,200 documents to copy are sent as three `bulkWrite`s of 500, 500 and 200 `replaceOne`s.
- [ ] The copied documents keep their BSON types and field order.
- [ ] With the undo history on and 10,000 documents or fewer, the write is one operation of the undo history, and
  undoing it restores the target side, deleted documents included.
- [ ] With more documents than `datardo.undo.maxDocumentsPerOperation`, the confirmation says *This can't be undone:
  the undo history keeps operations of up to 10,000 documents.*
- [ ] With the target side read-only (connection or view), both controls for that side are disabled and nothing is
  written.
- [ ] On a connection that publishes for redis-oplog, nothing is published for the documents written and deleted.
- [ ] A step that fails stops the plan: the batches before it stay written, the notification says where it stopped,
  and the page compares again.
