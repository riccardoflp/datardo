# The table of the Documents section

The Documents section of a collection tab and its table: one row per document, one column per field. How the columns
are found in the documents, how a value of each BSON type is written in a cell, sub-documents expanded into columns
and arrays into sub-rows; the columns' layout, sorting from a header, paging; moving between cells with the keyboard,
selecting rows, copying a value, a field path or whole documents; the context menus of a row, a cell and a column
header; refreshing. The query bar above the table is the [query bar](query.md) area.

The table holds every value with its BSON type, as canonical Extended JSON in the window: an `Int32`, an `Int64`, a
`Double` and a `Decimal128` stay apart in what it shows, copies and hands to the other features.

Nothing here writes to a deployment: every card works through a read-only connection and on a view. Editing, inserting
and deleting documents are the document area's (`document.inline-edit`, `document.insert`, `document.delete`);
renaming, removing and converting a field from its column are the field area's. The table only says where their
controls are.

The examples use these three documents of `shop.people`, called *the three people* below:

```
{ _id: 1, name: "Ada", address: { city: "Milano", zip: "20100" },
  items: [{ sku: "A1", qty: 2 }, { sku: "B2", qty: 1, options: { color: "red" } }], tags: ["a", "b"] }
{ _id: 2, name: "Bob", address: "unknown", email: "bob@example.com", items: [], tags: [] }
{ _id: 3, name: "Cy", address: { city: "Roma", geo: { lat: 41.9, lng: 12.5 } },
  items: [{ sku: "C3", qty: 5, parts: [{ n: 1 }] }, 7] }
```

### `table.show` — The Documents section

The first section of a collection tab: the documents of a collection or of a view, a page at a time, as a table.

- **Kind**: View
- **Engine**: MongoDB
- **Function**: `src/features/table/show.ts › view(state)`
- **Entry points**: **Documents** in the section bar of a collection tab (`@section-bar`), which is the section a
  collection tab opens on (`tab.open`); Go to, **Documents**.
- **Offered when**: the active tab is a collection tab, of a collection, a view or a time series collection, on any
  connection.
- **Commands**: `table.show`
- **Uses**: `query.bar`, `query.run`, `query.count`, `aggregate.show`, `aggregate.run`, `table.detect-columns`,
  `table.rows`, `table.cell-text`, `table.columns`, `table.paging`, `table.selection-bar`, `table.navigate`,
  `table.refresh`, `document.inspect`, `document.insert`, `document.update-many`, `document.delete-many`,
  `transfer.export`, `explain.show`, `codegen.show`, `watch.show`, `connection.connect`, `connection.read-only`,
  `nav.status-line`.
- **Ported from**: `src/collectionPanel.ts › CollectionPanel.html`, `src/webview/main.ts › renderGrid`,
  `renderStatus`; README, **Browse documents**. The states of an empty collection, of a time series collection and of
  a first read that fails are *New in Datardo*.

What it shows, from the top:

1. The toolbar (`@toolbar`). At the left **Refresh** (`table.refresh`) and **Columns** (`table.columns`). Then the
   buttons of other areas: **Insert** (tooltip *Insert documents: type them or paste a copied one*,
   `document.insert`), **Update many…** (`document.update-many`), **Delete many…** (`document.delete-many`),
   **Export** (tooltip *Export the results to JSON, JSON Lines or CSV*, `transfer.export`), **Explain**
   (`explain.show`), **Code** (`codegen.show`) and **Watch** (tooltip *Show the changes of the collection as they
   happen (change stream)*, `watch.show`). At the right end the marks of what is shown: **view** (tooltip *Views are
   read-only*), **time series** (tooltip *Time series collection: each document is one measurement*), **read-only**
   (tooltip *The connection is read-only: no changes are made through it*).
2. The query bar (`query.bar`), or the pipeline editor in **Aggregate** (`aggregate.show`), with its error line.
3. The selection bar, while more than one row is selected (`table.selection-bar`).
4. The table: a header row with the row number column `#` and one header per column; under it the rows (`table.rows`).
   The header row and the pinned columns stay in place while the rows scroll.
5. The paging row (`table.paging`).

The status line shows the count of the page while the tab is active: `50 of 1,204 documents · 38 ms`, the documents
shown, the total of the query and how long the server took for the documents.

Its states:

- *Loading, nothing shown yet*: **Loading documents…** in place of the rows.
- *Running again*: the rows shown stay, dimmed, until the new ones arrive; nothing in them can be started meanwhile.
  The window is not blocked: other tabs and the bar stay usable.
- *Documents*: the table.
- *Empty collection*, when the query is empty and the collection has no document: **This collection is empty.**, with
  **Insert** (`document.insert`) on a collection that can be changed.
- *No match*, when a query that is not empty returns nothing: **No documents match this query.**, with **Reset**
  (`query.reset`).
- *Empty output*, in **Aggregate**: **The pipeline returned no documents.**
- *Error*: the message is on the error line of the bar. When rows were shown before, they stay. When nothing was
  shown: **The documents could not be read.** with **Run again**, and with **Reconnect** (`connection.connect`) when
  the error is that the connection is not connected.
- *View*: the mark **view**; **Insert**, **Update many…** and **Delete many…** are not shown, and nothing in the table
  edits or deletes. The documents are what the view's pipeline gives, so they may have no `_id`.
- *Time series collection*: the mark **time series**; the table is that of a collection. What the server does not
  allow on a time series collection is refused by the server when it is tried, in the server's words.
- *Read-only connection*: the mark **read-only**; as for a view, nothing that writes is shown.
- *Aggregate*: the rows are the output of the pipeline; nothing in the table edits or deletes, and no entry of the
  field area is offered.

Acceptance:

- [ ] Opening `shop.orders` from the tree shows the Documents section with the first 50 documents, one per row, and
      the status line reads `50 of 1,204 documents ·` followed by the time.
- [ ] The header row stays visible while 500 rows scroll, and the row number column stays visible while the columns
      scroll sideways.
- [ ] A page of 500 documents with 40 columns scrolls without drawing every row: only the rows near the visible ones
      are in the page.
- [ ] An empty collection shows **This collection is empty.** with **Insert**; through a read-only connection it shows
      the text without the button.
- [ ] The filter `{ status: "none" }` that matches nothing shows **No documents match this query.** with **Reset**,
      and the header row is not shown.
- [ ] On a view the toolbar shows **view** and neither **Insert**, **Update many…** nor **Delete many…**; **Export**,
      **Explain**, **Code** and **Columns** are there.
- [ ] On a time series collection the toolbar shows **time series**, and the total of an empty query is exact
      (`query.count`).
- [ ] A query that fails on a tab that shows 50 documents leaves the 50 documents and shows the message under the bar;
      a first read that fails shows **The documents could not be read.** with **Run again**.
- [ ] While a query runs again, the rows are dimmed and a double click on a cell does not open its editor.
- [ ] A click on a row shows its document in the inspector island (`document.inspect`).
- [ ] The table is announced to a screen reader as a grid with its numbers of rows and columns, and each cell with the
      name of its column.

### `table.detect-columns` — The columns of a page of documents

Works out which columns the table has from the documents it shows, since a collection has no fixed schema.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/table/detect-columns.ts › columnsOfDocuments(documents, expanded)`
- **Uses**: `table.expand`, `table.layout`, `table.rows`.
- **Ported from**: `src/shared/columns.ts › buildColumns`, `objectsAt`, `isSubdocument`, `leaves`.

Rules of the result:

- The inputs are the documents of the page, in order, and the field paths the user expanded for this collection. The
  result is a tree of columns: each has its path, its dotted key (`address.city`), whether it can be expanded, whether
  expanding it gives sub-rows, and its child columns when it is expanded. The columns that are drawn are the leaves of
  the tree, from left to right; an expanded column is a group heading over its leaves.
- The columns are those of **this page**: a field no document of the page has is not a column, and turning the page
  may add and remove columns.
- At the top there is one column per field of the documents: `_id` first, then the others in the order they are first
  met, reading the documents from the first to the last and each document's fields in their order.
- A value is a **sub-document** when it is an object that is not a single BSON value: an `ObjectId`, a date, a
  `Decimal128`, a `Binary` and the like are values, however they travel.
- A column **can be expanded into columns** when, in some document of the page, its value is a sub-document with at
  least one field.
- A column **can be expanded into sub-rows** when, in some document of the page, its value is an array with at least
  one element that is a sub-document with a field. Only one level of sub-rows exists: inside the elements of an
  expanded array, an array is a plain value, while a sub-document can still be expanded into columns.
- The children of an expanded column are the fields of all the sub-documents found there in the page (for an array, of
  all its elements in all the documents), in the order they are first met.
- A path that the user expanded but that cannot be expanded in this page is one plain column; it is expanded again in
  a page where it can be.

Worked examples, on the three people, written as the leaves from the left, `▸` marking a column that can be expanded
into columns and `▸[]` into sub-rows:

- nothing expanded → `_id`, `name`, `address ▸`, `items ▸[]`, `tags`, `email`.
- `address` expanded → `_id`, `name`, `address.city`, `address.zip`, `address.geo ▸`, `items ▸[]`, `tags`, `email`.
- `address` and `address.geo` expanded → `_id`, `name`, `address.city`, `address.zip`, `address.geo.lat`,
  `address.geo.lng`, `items ▸[]`, `tags`, `email`.
- `items` expanded → `_id`, `name`, `address ▸`, `items.sku`, `items.qty`, `items.options ▸`, `items.parts`, `tags`,
  `email`.
- `name` and `tags` expanded → as with nothing expanded: a string and an array of strings cannot be expanded.

Acceptance:

- [ ] Each example above gives exactly the columns shown, in that order.
- [ ] `email`, which only the second document has, is the last column; in a page without that document there is no
      `email` column.
- [ ] `address` can be expanded although the second document has a string there.
- [ ] `items.parts`, an array of sub-documents inside the elements of `items`, cannot be expanded; `items.options`
      can.
- [ ] A field whose value is `{}` in every document, or `[]`, or an array of numbers, cannot be expanded.
- [ ] A field holding an `ObjectId` or a date is one column, not a group with `$oid` or `$date` under it.
- [ ] A page with no documents gives no columns.

### `table.cell-text` — How a value is written in a cell

Gives the text and the color of a cell from the value it holds, so that the type of every value can be read at a
glance.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/table/cell-text.ts › cellOfValue(value)`
- **Uses**: `query.format`, `query.highlight`, `window.theme`.
- **Ported from**: `src/webview/main.ts › cellText`, `typeClass`, and the cell part of `renderGrid`. The short forms
  of an `Int64` and of a `Double` with a whole value, with the typed form and the name of the type in the tooltip, are
  *New in Datardo*, where the table keeps every BSON type.

Rules of the result:

- The input is the value of a field in a document, or the fact that the document has no such field. The result is the
  text of the cell, the text of its tooltip and the kind that gives its color.
- The input value has its BSON type. The text is the value in mongosh syntax on one line, as `query.format` writes it,
  with two shorter forms for the value of the cell itself: an `Int64` shows its digits alone (`1204`, and every digit
  beyond ±9,007,199,254,740,991), and a `Double` with a whole value shows them with `.0` (`5.0`). Inside an array or a
  sub-document every value is written as `query.format` writes it.
- An array has its number of elements before it, and a sub-document its number of fields: `[3] [1, 2, 3]`,
  `{2} { city: "Milano", zip: "20100" }`.
- A text longer than 300 characters is cut there and ends with `…`.
- The tooltip has the value exactly as `query.format` writes it, so with its type (`NumberLong(1204)`, `Double(5)`),
  cut at 2,000 characters, and under it the name of its BSON type: `string`, `int`, `long`, `double`, `decimal`,
  `bool`, `null`, `objectId`, `date`, `timestamp`, `regex`, `binData`, `array`, `object`.
- A field the document does not have is an empty cell with no tooltip, drawn differently from a cell that holds `null`
  or `""`, which show `null` and `""`.

| Value | Text of the cell | Kind |
| --- | --- | --- |
| String | `"paid"` | string |
| `Int32` | `42` | number |
| `Double` | `42.5`, `5.0`, `NaN` | number |
| `Int64` | `1204`, `9007199254740993` | number |
| `Decimal128` | `NumberDecimal("12.50")` | number |
| Boolean | `true`, `false` | boolean |
| Null, undefined | `null`, `undefined` | null |
| `ObjectId` | `ObjectId("65f1c0de65f1c0de65f1c0de")` | id |
| `Date` | `ISODate("2024-03-15T10:30:00.000Z")` | date |
| `Timestamp` | `Timestamp({ t: 1700000000, i: 1 })` | date |
| Regular expression | `/^mario/i` | regular expression |
| `Binary` | `UUID("0f8fad5b-d9cb-469f-a165-70867728950e")`, `BinData(0, "aGVsbG8=")` | special |
| `MinKey`, `MaxKey`, code, symbol | `MinKey()`, `MaxKey()`, `Code("…")`, `BSONSymbol("x")` | special |
| Array | `[2] ["a", "b"]`, `[0] []` | array |
| Sub-document | `{1} { color: "red" }`, `{0} {}` | sub-document |

- Each kind has one color in each theme, the same as the role of that kind in an editor (`query.highlight`).

Acceptance:

- [ ] Each row of the table gives the text and the kind shown.
- [ ] A string of 400 characters shows its opening quote, 299 characters and `…`; its tooltip shows the whole string
      in quotes.
- [ ] A document without `email` has an empty cell under `email`; one with `email: null` shows `null`; one with
      `email: ""` shows `""`.
- [ ] A date before 1970 is written as a date: `ISODate("1969-12-31T23:59:59.000Z")`.
- [ ] The text of a cell, pasted as the value of a field in **Filter**, is read by `query.parse` as the value of the
      cell with its type, for every row of the table above but an `Int64`, whose typed form is in the tooltip and is
      what **Copy value** copies, arrays and sub-documents, whose count comes first, and a text that was cut.
- [ ] Four documents whose `n` is an `Int32`, an `Int64`, a `Double` and a `Decimal128` of the value 5 show `5`, `5`,
      `5.0` and `NumberDecimal("5")`; their tooltips read `5` and *int*, `NumberLong(5)` and *long*, `Double(5)` and
      *double*, `NumberDecimal("5")` and *decimal*.
- [ ] A cell holding an array of an `Int64` 1 and a `Double` 2 shows `[2] [NumberLong(1), Double(2)]`.
- [ ] The name of the type in the tooltip is also what a screen reader says after the value, for whoever does not tell
      the colors apart.

### `table.rows` — The rows of the table

Lays the documents out as rows: one row per document, or one sub-row per element when an array is expanded.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/table/rows.ts › rowsOfDocuments(documents, columns, firstNumber)`
- **Uses**: `table.detect-columns`, `table.cell-text`, `table.page-window`.
- **Ported from**: `src/shared/columns.ts › rowHeight`, `getAt`, `MAX_ELEMENTS`; `src/webview/main.ts › renderGrid`
  (`renderNodes`, `renderElements`, `addCell`).

Rules of the result:

- The inputs are the documents of the page, the columns to draw (`table.detect-columns` after `table.layout`) and the
  number of the first document. The result is, for each document, its number, its height in sub-rows and its cells,
  each with its column, its value or the lack of one, the sub-rows it covers and, for a field of an element, which
  element.
- **The row number**, in the column `#`, counts from the first document of the query across the pages: the first row
  of page 3 with page size 50 is 101. It covers all the sub-rows of its document. Its tooltip is *Inspect document*.
- **The value of a cell** is the value at the path of its column. A document where the path does not exist, or where a
  parent on the way is not a sub-document, has no value there.
- **An expanded sub-document.** Where the value is a sub-document, each child column gets its field. Where it is
  anything else (a string, `null`, an array), that value is shown once, in one cell as wide as the whole group, with
  the tooltip *`<key>` is not a sub-document here* before its text.
- **An expanded array.** A document whose value there is an array that is not empty gets one sub-row per element, up
  to 20. An element that is a sub-document fills the child columns; any other element is shown in one cell as wide as
  the group, with the tooltip *This element of `<key>` is not a sub-document*. A value that is not an array, or an
  empty array, is shown once across the group, with the tooltip *`<key>` is not an array of sub-documents here*.
- **More than 20 elements.** After the twentieth sub-row comes one more with a cell across the group that reads *…
  `<n>` more elements — open the document to see all*, where `n` is the number left out.
- **The height** of a document is the largest number of sub-rows any of its expanded arrays needs, and 1 with none.
  The cells of the columns outside an expanded array cover all the sub-rows of the document; under an array shorter
  than the height, one empty cell fills the rest.
- Two expanded arrays of the same document lie side by side: the first element of each on the first sub-row, and so
  on. Nothing is multiplied.

Worked examples, on the three people with `items` expanded:

- Ada has height 2: sub-row 1 holds `"A1"`, `2` and no value under `items.options`; sub-row 2 holds `"B2"`, `1` and
  `{1} { color: "red" }`. Her `_id`, `name`, `address` and `tags` cells cover both sub-rows.
- Bob has height 1: `[0] []` in one cell across the four columns of `items`, with the tooltip *items is not an array
  of sub-documents here*.
- Cy has height 2: sub-row 1 holds `"C3"`, `5`, nothing under `items.options`, and `[1] [{ n: 1 }]` under
  `items.parts`; sub-row 2 holds `7` in one cell across the group, with the tooltip *This element of items is not a
  sub-document*.
- With `address` expanded, Bob shows `"unknown"` in one cell across the columns of `address`, with the tooltip
  *address is not a sub-document here*.
- A document with 25 elements in `items` has height 21: twenty sub-rows, then *… 5 more elements — open the document
  to see all*.

Acceptance:

- [ ] Each example above gives the heights and the cells shown.
- [ ] On page 3 with page size 50 the rows are numbered 101 to 150; with **Skip** at 10 the first row of page 1 is
      still 1.
- [ ] A document with `items` of 2 elements and `payments` of 3, both expanded, has height 3: the third sub-row holds
      the third payment, and an empty cell under `items`.
- [ ] A cell of an element knows its element: dragging the `sku` of Ada's second sub-row gives the value `"B2"` and
      the array `items`.
- [ ] The cells with *… more elements* and the empty cells that fill a group hold no value: they cannot be dragged,
      copied or edited.
- [ ] The row number covers every sub-row of its document, and a click on it selects the document.

### `table.expand` — Expand a field into columns or sub-rows

Shows the fields of a sub-document as columns of their own, and the elements of an array of sub-documents as sub-rows,
without changing the query.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/table/expand.ts › plan(context, answers)`
- **Entry points**: the `▸` button in the header of a column that can be expanded (`@table`), with the tooltip *Expand
  `<key>` into columns (Alt+click: expand all levels)*, or for an array *Expand the elements of `<key>` into columns,
  one sub-row per element (Alt+click: expand all levels)*; **Expand `<key>`** and **Expand all levels of `<key>`** in
  the menu of a column header (`@column-menu`) and of a cell (`@cell-menu`).
- **Offered when**: the column can be expanded in the page shown (`table.detect-columns`) and is not expanded; in
  **Find** and in **Aggregate**.
- **Plan**: one app step: `expand the column address of Local / shop / people`, or
  `expand the column address and all its levels of Local / shop / people`.
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone from the undo history: it changes how the collection is shown, not a deployment.
  `table.collapse` reverses it.
- **After**: the table is drawn again from the documents it has, without running the query; the focus goes to the
  first of the new columns.
- **Commands**: `table.expand`, `table.expand:all-levels`
- **Uses**: `table.detect-columns`, `table.rows`, `table.columns`, `table.collapse`.
- **Ported from**: `src/webview/main.ts` (the `expander` click, `expandableBelow`, `saveExpanded`),
  `src/shared/columns.ts › expandableBelow`, `src/collectionPanel.ts` (`columnsKey`, the `saveColumns` message);
  README, **Expand nested fields**.

*All levels* expands the column and every column under it that can be expanded in the page shown: the sub-documents of
a sub-document, and the sub-documents of the elements of an array.

Acceptance:

- [ ] On the three people, expanding `address` replaces its column with `address.city`, `address.zip` and
      `address.geo` under a group heading `address`, and sends nothing to the server.
- [ ] Expanding `items` shows `items.sku`, `items.qty`, `items.options` and `items.parts`, with two sub-rows for Ada
      and for Cy.
- [ ] `Alt` with a click on the `▸` of `address` also expands `address.geo`; on the `▸` of `items` it also expands
      `items.options`.
- [ ] The expanded columns of `shop.people` are the same after the tab is closed and opened again, after a restart,
      and in a tab opened on the same collection by another feature.
- [ ] Expanding a column of `shop.people` on the connection Local does not expand it on another connection that has a
      `shop.people`.
- [ ] It is offered on a view, on a read-only connection and in **Aggregate**.
- [ ] A child column has the header of its last name (`city`) under the group heading, and its tooltip has the whole
      path, `address.city`.

### `table.collapse` — Collapse an expanded field

Puts an expanded sub-document or array back into one column.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/table/collapse.ts › plan(context, answers)`
- **Entry points**: a click on the group heading of an expanded column (`@table`), with the tooltip *Collapse
  `<path>`*; **Collapse `<key>`** in the menu of a column header (`@column-menu`) and of a cell (`@cell-menu`) under
  that heading.
- **Offered when**: the column is expanded.
- **Plan**: one app step: `collapse the column address of Local / shop / people`.
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone from the undo history: it changes how the collection is shown, not a deployment.
  `table.expand` reverses it.
- **After**: the table is drawn again without running the query; the focus goes to the column that takes the place of
  the group.
- **Commands**: `table.collapse`
- **Uses**: `table.expand`, `table.detect-columns`, `table.columns`.
- **Ported from**: `src/webview/main.ts` (the click on a `collapser`), `src/collectionPanel.ts` (the `saveColumns`
  message).

Acceptance:

- [ ] Collapsing `address` with `address.geo` expanded under it shows one `address` column; expanding `address` again
      shows `address.geo` expanded as it was.
- [ ] Collapsing `items` gives each document one row again.
- [ ] What was hidden, moved or resized among the columns of the group is kept, and is back when the group is expanded
      again.
- [ ] The collapsed state is remembered for the collection as the expanded one is.

### `table.columns` — The columns' layout

The **Columns** panel, where the columns of a collection are hidden, shown, reordered and pinned, and what Datardo
remembers of the columns for each collection.

- **Kind**: View
- **Engine**: MongoDB
- **Function**: `src/features/table/columns.ts › view(state)`
- **Entry points**: **Columns** in the toolbar of the Documents section (`@toolbar`), which reads **Columns (2
  hidden)** while columns are hidden; **Columns…** in the menu of a column header (`@column-menu`); Go to,
  **Columns…**. Its rows and buttons are in the panel (`@list`).
- **Offered when**: the Documents section is shown, in **Find** and in **Aggregate**, on any connection.
- **Commands**: `table.columns`
- **Uses**: `table.arrange-columns`, `table.layout`, `table.detect-columns`, `table.expand`, `table.collapse`.
- **Ported from**: `src/webview/columnsUi.ts › ColumnsPanel`, `src/collectionPanel.ts` (`layoutKey`, `columnsKey`, the
  `saveLayout` and `saveColumns` messages); README, **Arrange the columns**.

What it shows: a panel under the button, with

1. a box to narrow the list, placeholder *Search columns*, and the buttons **Show all** (tooltip *Show the hidden
   columns*) and **Reset** (tooltip *Natural order, no hidden or pinned columns, automatic widths*);
2. one row per column of the page, in the order of the table, the children of an expanded column indented under it: a
   checkbox that shows or hides the column, its name, and for a top-level column a pin button (tooltip *Pin to the
   left (stays visible while scrolling sideways)*, or *Unpin*). A row is dragged to move its column;
3. *No columns* when the page has none or the search matches none.

What is remembered, in Datardo's data, for each collection of a connection (connection, database and collection name):

- the **layout**: the hidden columns, the order, the pinned columns and the widths set by hand (`table.layout`);
- the **expanded** field paths (`table.expand`).

Both are the same for every tab on that collection and for **Find** and **Aggregate**, and are not part of the query
of the tab. They follow a collection that is renamed from Datardo and a field that is renamed or removed from its
column, which the manage area and the field area do.

Acceptance:

- [ ] With `email` and `tags` hidden the button reads **Columns (2 hidden)**; with none hidden, **Columns**.
- [ ] Unticking `name` in the panel hides the column at once, and the panel stays open.
- [ ] Typing `ci` in the search box leaves `address` and, under it, `city`; while a search is typed the rows cannot be
      dragged.
- [ ] **Show all** ticks every row; **Reset** also puts the columns in their natural order, unpins them and forgets
      the widths. Neither changes which columns are expanded.
- [ ] A column hidden in `shop.people` is hidden when the collection is opened again after a restart, and in
      **Aggregate** when the output has a field of that name.
- [ ] A hidden column that is not in the page shown is not listed, and is still hidden when a page has it.
- [ ] The panel closes with `Esc` and with a click outside it; with the keyboard, the arrows move through the rows,
      `Space` ticks, and `Alt+↑` and `Alt+↓` move the row among its siblings.
- [ ] The layout of `shop.people` on Local is not that of `shop.people` on another connection.

### `table.arrange-columns` — Hide, show, move, pin and resize columns

Changes the layout of the columns of a collection and remembers it.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/table/arrange-columns.ts › plan(context, answers)`
- **Entry points**: in the menu of a column header (`@column-menu`): **Hide `<key>`**, **Pin `<top>` to the left** or
  **Unpin `<top>`**, **Reset width**, **Reset all columns**; on a header (`@table`): dragging it onto another header
  to move it, dragging its right edge to resize it (tooltip *Drag to resize · double-click for automatic width*), a
  double click on that edge; in the **Columns** panel (`@list`): the checkbox, the pin button and the dragging of a
  row, **Show all** and **Reset**.
- **Offered when**: the Documents section shows columns. Pinning is offered for a top-level column, and for a child
  column it pins the top-level column it belongs to.
- **Plan**: one app step: `save the columns' layout of Local / shop / people`.
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone from the undo history: it changes how the collection is shown, not a deployment. **Reset
  all columns** puts back the natural layout.
- **After**: the table is drawn again from the documents it has, without running the query.
- **Refuses**: moving a column next to one that is not at its level, *`<source>` can only be moved among the columns
  at its level.* (`/level`).
- **Commands**: `table.arrange-columns:hide`, `table.arrange-columns:show-all`, `table.arrange-columns:pin`,
  `table.arrange-columns:unpin`, `table.arrange-columns:move-left`, `table.arrange-columns:move-right`,
  `table.arrange-columns:reset-width`, `table.arrange-columns:reset`, all on the column of the selected cell.
- **Uses**: `table.layout`, `table.columns`, `runner.notify`.
- **Ported from**: `src/webview/main.ts` (`saveLayout`, `showColumnMenu`, the drop of a header on a header, the
  `col-resize` handle), `src/shared/columns.ts › moveColumn`, `src/webview/columnsUi.ts`. The commands that move a
  column from the keyboard are *New in Datardo*.

Acceptance:

- [ ] **Hide name** removes the column `name`; the toolbar reads **Columns (1 hidden)**.
- [ ] Dropping the header `tags` on the left half of the header `name` puts `tags` right before `name`; on the right
      half, right after.
- [ ] Dropping `tags` next to `_id` while `_id` is pinned pins `tags` too; dropping a pinned column next to one that
      is not pinned unpins it.
- [ ] Dropping `address.zip` on `address.city` reorders the two inside their group; dropping `address.zip` on `name`
      changes nothing and notifies *address.zip can only be moved among the columns at its level.*
- [ ] Dropping `name` on the right half of `address.zip`, a child of the expanded group `address`, puts `name` right
      after the whole group.
- [ ] A column cannot be made narrower than 40 px; a double click on the edge, or **Reset width**, gives it its
      automatic width again.
- [ ] **Pin address to the left**, chosen on `address.city`, pins the whole group; pinned columns come first, after
      the row number, and stay in place while the others scroll sideways.
- [ ] **Reset all columns** shows every column in its natural order, none pinned, with automatic widths, and leaves
      the expanded columns expanded.
- [ ] Every change is still there after the tab is closed and opened again.
- [ ] `table.arrange-columns:move-right` on the last column of its level changes nothing.

### `table.layout` — The columns in the order of their layout

Applies the remembered layout to the columns found in a page.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/table/layout.ts › arrangedColumns(columns, layout)`
- **Uses**: `table.detect-columns`, `table.arrange-columns`.
- **Ported from**: `src/shared/columns.ts › applyLayout`, `moveColumn`, `pinnedLeafCount`.

Rules of the result:

- The inputs are the tree of columns of `table.detect-columns` and the layout: a list of hidden keys, a list of keys
  in the order wanted, a list of pinned top-level keys, and a width for some keys. The result is the tree with the
  hidden columns removed and the others in order, and how many of the leading leaves are pinned.
- A hidden key removes its column; a hidden group removes all its children. A group all of whose children are hidden
  is removed too.
- Among siblings, the columns named in the order list come first, in the order of the list; those not named follow in
  their natural order. A column that appears in a later page therefore goes to the end until it is moved.
- Pinned top-level columns come before all the others, in their order.
- A key of the layout that no column of the page has is ignored, and kept.
- Moving a column next to a sibling writes the order of all the siblings into the list. A target inside a group that
  is a sibling counts as that group. Any other move between columns of different levels gives nothing. Moving a
  top-level column next to a pinned one adds it to the pinned list, and next to one that is not pinned removes it.
- A width is used for the leaf with that key, never less than 40 px; a leaf with no width takes the automatic one.

Worked examples, on the three people with `address` expanded (the natural leaves are `_id`, `name`, `address.city`,
`address.zip`, `address.geo`, `items`, `tags`, `email`):

- an empty layout → the natural leaves, none pinned.
- hidden `name` and `address.zip`, pinned `tags`, order `email`, `_id` → `tags`, `email`, `_id`, `address.city`,
  `address.geo`, `items`, with 1 pinned.
- moving `tags` before `name` from an empty layout → the order list becomes `_id`, `tags`, `name`, `address`, `items`,
  `email`.
- moving `tags` after `_id` while `_id` is pinned → pinned `_id`, `tags`; the order list as above.
- moving `address.zip` before `address.city` → the order list gets `address.zip`, `address.city`, `address.geo`.
- moving `address.zip` next to `name` → nothing.

Acceptance:

- [ ] Each example above gives exactly the result shown.
- [ ] A layout that hides `phone` leaves the three people's columns as they are, and still hides `phone` in a page
      that has it.
- [ ] Hiding `address.city`, `address.zip` and `address.geo` removes the group `address`.
- [ ] A width of 10 for `name` draws the column 40 px wide.

### `table.sort` — Sort from a column header

A click on a column header sorts the documents by that field, without typing a sort.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/table/sort.ts › sortAfterClick(sortText, field)`
- **Entry points**: a click on a column header (`@table`); `Enter` on a header that has the focus. The tooltip of a
  header is its key, then *Click to sort · drag to the filter, sort or projection, or onto another column ·
  right-click for options*.
- **Offered when**: in **Find**. In **Aggregate** the click is the aggregate area's, which sorts with a `$sort` stage.
- **Commands**: `table.sort`, on the column of the selected cell.
- **Uses**: `query.parse`, `query.format`, `query.run`, `query.add-sort`.
- **Ported from**: `src/webview/main.ts › toggleSort`, `currentSort`, and the `sort-indicator` of `renderGrid`.

Rules of the result:

- The inputs are the text of **Sort** and the key of the column. The result is the new text of **Sort**, which
  replaces the whole sort.
- The direction the field has in the current sort decides: none gives `{ <field>: 1 }`; `1` gives `{ <field>: -1 }`;
  `-1` gives an empty sort.
- A text of **Sort** that cannot be read counts as an empty sort.
- The query runs at once from the first page (`query.run`).
- The header of every field of the current sort shows `▲` for 1 and `▼` for −1 after its name, whether the sort came
  from a click, was typed or was dropped.
- To sort by several fields, drop the headers on **Sort** or use **Sort** in the menu of a header (`query.add-sort`):
  a click always leaves one field.
- A child column sorts by its dotted path, also inside an expanded array: `items.sku`.

Worked examples, as sort + click → sort:

- empty + `total` → `{ total: 1 }`; again → `{ total: -1 }`; again → empty.
- `{ status: 1, total: -1 }` + `createdAt` → `{ createdAt: 1 }`.
- `{ status: 1, total: -1 }` + `total` → empty.
- `{ status: ` + `total` → `{ total: 1 }`.
- empty + `address.city` → `{ "address.city": 1 }`.

Acceptance:

- [ ] Each example above gives exactly the text shown, and the query runs from page 1.
- [ ] With the sort `{ status: 1, total: -1 }` typed and run, the header `status` shows `▲` and the header `total`
      shows `▼`.
- [ ] A click on the `▸` button, on the edge that resizes, or the end of a drag does not sort.
- [ ] The direction is said to a screen reader on the header: *sorted ascending*, *sorted descending*.
- [ ] On a view and on a read-only connection the click sorts the same.

### `table.paging` — The paging row

The row under the table that says which documents of the result are shown and moves between its pages.

- **Kind**: View
- **Engine**: MongoDB
- **Function**: `src/features/table/paging.ts › view(state)`
- **Entry points**: the row under the table (`@paging`): **Previous page** (`‹`), **Next page** (`›`) and the list
  **Page size**; Go to, **Next page**, **Previous page** and **First page**.
- **Offered when**: the Documents section is shown, in **Find** and in **Aggregate**.
- **Commands**: `table.paging:next`, `table.paging:previous`, `table.paging:first`
- **Uses**: `table.page-window`, `query.run`, `query.count`, `aggregate.run`, `query.restore`.
- **Ported from**: `src/collectionPanel.ts › CollectionPanel.html` (the `pager`), `src/webview/main.ts › renderStatus`
  and the `prev`, `next` and `pageSize` handlers.

What it shows, from the left: the range, `1–50 of 1,204`; **Previous page** and **Next page**; **Page size**, a list
of 10, 20, 50, 100, 200 and 500, which starts at 50.

Acceptance:

- [ ] Page 1 of 1,204 documents with page size 50 reads `1–50 of 1,204`; the last page reads `1,201–1,204 of 1,204`.
- [ ] A result with no documents reads `0–0 of 0`; a total not known yet reads `1–50 of …`, and one that could not be
      counted `1–50 of ?`.
- [ ] **Previous page** is disabled on the first page. **Next page** is disabled when the last document shown is the
      last of the total; with the total unknown, when the page shown has fewer documents than the page size.
- [ ] **Next page** runs the same query for the next page, as it was last run and not as the bar reads now, and does
      not count again.
- [ ] Choosing the page size 100 on page 3 of 50 shows the first page with 100 documents.
- [ ] The page and the page size are kept with the query of the tab (`query.restore`); another tab keeps its own.
- [ ] An estimated total has the tooltip and the click of `query.count`.
- [ ] After a page turn the table is scrolled to its top and the selected cell is the first of the first row.
- [ ] In **Aggregate** the row works the same on the output of the pipeline (`aggregate.run`).

### `table.page-window` — Which documents a page asks for

Works out the `skip` and the `limit` a page sends, and the total the paging shows, from the page, the page size and
the **Skip** and **Limit** of the query bar.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/table/page-window.ts › pageWindow(page, pageSize, skip, limit, count)`
- **Uses**: `query.run`, `query.count`, `table.paging`.
- **Ported from**: `src/webview/main.ts` (`state.skip`, `state.limit`, `renderStatus`). The **Skip** and **Limit** of
  the bar, and so the rules that join them to the page, are *New in Datardo*.

Rules of the result:

- The inputs: the page, from 1; the page size; **Skip**, 0 when empty; **Limit**, none when empty; the count of the
  filter, which may be unknown. The result: the `skip` and the `limit` to send, the total, the numbers of the first
  and last row, and whether there is a page before and after.
- `skip` sent = **Skip** + (page − 1) × page size.
- `limit` sent = the page size; with a **Limit**, the smaller of the page size and **Limit** − (page − 1) × page size.
- total = the count less **Skip**, not below 0, and not above **Limit**. With the count unknown the total is unknown.
- The first row is (page − 1) × page size + 1 and the last is the first plus the documents received less 1; with no
  document both are 0.
- There is a page before when the page is not 1. There is a page after when the last row is below the total; with the
  total unknown, when the documents received are as many as the page size and **Limit** is not reached.
- The pages are those of the result after **Skip** and **Limit**: row 1 is the first document after the skipped ones.

Worked examples, with a count of 1,204:

- page 1, size 50, no skip, no limit → `skip` 0, `limit` 50, total 1,204, rows 1–50.
- page 3, size 50 → `skip` 100, `limit` 50, rows 101–150.
- page 1, size 50, **Skip** 1,000 → `skip` 1,000, `limit` 50, total 204.
- page 3, size 50, **Limit** 120 → `skip` 100, `limit` 20, total 120, rows 101–120, no page after.
- page 2, size 50, **Skip** 10, **Limit** 500 → `skip` 60, `limit` 50, total 500, rows 51–100.
- **Skip** 2,000 → total 0, no rows.

Acceptance:

- [ ] Each example above gives exactly the numbers shown.
- [ ] With **Limit** 120 and page size 50, the third page asks for 20 documents and **Next page** is disabled on it.
- [ ] With the count unknown and a full page of 50, there is a page after; with 37 documents received there is none.
- [ ] The `limit` sent is never 0: a page that would start at or past **Limit** is not a page.

### `table.navigate` — Move between cells with the keyboard

Says which cell is selected after a key, so that the whole table can be used without a mouse.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/table/navigate.ts › cellAfterKey(rows, columns, cell, key)`
- **Entry points**: the keys below while the table has the focus (`@table`); a click on a cell selects it.
- **Uses**: `table.rows`, `table.selection`, `table.copy-value`, `document.inspect`, `document.inline-edit`,
  `document.delete`, `relation.follow`, `table.cell-menu`, `table.column-menu`.
- **Ported from**: *New in Datardo* for the movement: Mongoster selects a cell with a click and has the keys `Ctrl+C`,
  `F2`, `Enter`, `Delete` and `Ctrl+Enter` on it (`src/webview/main.ts`, the `keydown` handler and `selectCell`).

Rules of the result:

- The table is one stop for `Tab`: `Tab` enters it on the selected cell, or on the first cell of the first row, and
  `Tab` again leaves it. Inside, one cell is selected, or one column header.
- The inputs are the rows and the columns drawn, the selected cell and the key; the result is the cell selected next.
  Selecting a cell of another document selects that row alone (`table.selection`), so the inspector follows.

| Key | Selects |
| --- | --- |
| `←`, `→` | the cell before or after in the same sub-row; it stops at the row number and at the last column |
| `↑`, `↓` | the cell above or below in the same column: the next sub-row inside an expanded array, otherwise the next document. `↑` on the first row selects the column header |
| `Home`, `End` | the first and the last cell of the row |
| `Ctrl+Home`, `Ctrl+End` | the first cell of the first row, the last cell of the last row |
| `PageUp`, `PageDown` | the cell as many rows up or down as are visible |

- A cell that covers several sub-rows is one cell: `↓` from it goes to the next document; `→` from it goes to the
  first sub-row of the group at its right.
- The selected cell is always scrolled into view.
- What the other keys start on the selected cell:

| Key | Starts |
| --- | --- |
| `Enter` | the inspector, with the focus in it (`document.inspect`); on a column header, the sort (`table.sort`) |
| `F2` | editing the value (`document.inline-edit`) |
| `Delete` | deleting the document (`document.delete`), or the selected rows when several are |
| `Ctrl+C` | `table.copy-value` |
| `Ctrl+Enter` | following the reference of the cell (`relation.follow`), as `Ctrl` with a click does |
| `Shift+F10`, the menu key | the menu of the cell, or of the column header |
| `Shift+↑`, `Shift+↓`, `Ctrl+Space`, `Ctrl+A`, `Esc` | the selection of rows (`table.selection`) |

Acceptance:

- [ ] On the three people with `items` expanded, `↓` from Ada's `"A1"` selects `"B2"`, and `↓` again Bob's cell across
      `items`; `↓` from Ada's `name` selects Bob's `name`.
- [ ] `→` from the last column and `←` from the row number change nothing.
- [ ] `↑` from a cell of the first row selects its column header; `↓` from the header goes back to the first row.
- [ ] `Ctrl+End` selects the last cell of the last row and scrolls it into view.
- [ ] Moving with `↓` from one document to the next changes the document of the inspector island.
- [ ] `Tab` from the query bar reaches the table in one stop, and one more `Tab` reaches the paging row.
- [ ] `F2` on a cell of a view, of a read-only connection or of **Aggregate** starts nothing.
- [ ] The selected cell has a visible outline in both themes, also when the table has not the focus, where it is
      fainter.

### `table.selection` — Select rows

Says which documents are selected after a click or a key: one, to inspect it, or several, to copy, export, update or
delete them together.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/table/selection.ts › selectionAfter(selection, action, documents)`
- **Entry points**: a click on a row, `Ctrl` with a click, `Shift` with a click (`@table`); `Shift+↑`, `Shift+↓`,
  `Ctrl+Space`, `Ctrl+A`, `Esc` while the table has the focus; **Clear** on the selection bar (`@selection-bar`) and
  **Clear selection** in the menu of a selected row (`@row-menu`); Go to, **Select all documents of the page** and
  **Clear selection**.
- **Offered when**: the table shows documents, in **Find** and in **Aggregate**.
- **Commands**: `table.selection:all`, `table.selection:clear`
- **Uses**: `table.selection-bar`, `table.navigate`, `document.inspect`, `table.copy-as`, `transfer.export`.
- **Ported from**: `src/webview/main.ts` (`selected`, `toggleRow`, `selectRange`, `clearSelection`, `rowKey`, the
  click and `keydown` handlers); README, **Select several documents**. The keys other than `Ctrl+A` and `Esc` are *New
  in Datardo*.

Rules of the result:

- The selection is a set of documents of the page, with an anchor: the document last clicked or moved to without
  `Shift`. A document is known by its `_id`; one without an `_id` (a projection that excludes it, the output of a
  pipeline) by its place in the page.
- A click on a cell, on a row number or an arrow key: that document alone is selected, and is the anchor.
- `Ctrl` with a click, or `Ctrl+Space` on the selected cell: adds the document to the selection, or takes it out when
  it is in; it becomes the anchor.
- `Shift` with a click, or `Shift+↑` and `Shift+↓`: the selection is every document from the anchor to that one, both
  included; the anchor stays.
- `Ctrl+A`: every document of the page. `Esc`, **Clear**: none.
- A sub-row selects its document: a document is selected whole, never one element.
- One selected document is shown in the inspector island (`document.inspect`); with several, the inspector says how
  many and the selection bar appears (`table.selection-bar`).
- The selection survives a refresh of the same page: the documents still in the page stay selected, the others leave
  it. It ends when the query is run again from the bar, when the page or the page size changes, and when the mode
  changes.
- The selection is of the tab: another tab on the same collection has its own.

Acceptance:

- [ ] A click on row 2, then `Ctrl` with a click on row 5: rows 2 and 5 are selected. `Ctrl` with a click on row 2
      again: row 5 alone.
- [ ] A click on row 2, then `Shift` with a click on row 6: rows 2 to 6; then `Shift` with a click on row 4: rows 2 to
      4.
- [ ] `Ctrl+A` with the focus in the table selects the 50 rows of the page, not the 1,204 of the query; with the focus
      in **Filter** it selects the text of the filter.
- [ ] `Esc` empties the selection and the inspector reads **Select a document to inspect it.**
- [ ] With `items` expanded, a click on Ada's second sub-row selects Ada, and both her sub-rows are drawn as selected.
- [ ] After **Refresh**, rows 2 and 5 are still selected when their documents are still in the page; a document
      deleted meanwhile is no longer in the selection.
- [ ] **Next page** empties the selection.
- [ ] In a page of documents without `_id`, rows 2 and 5 can be selected and copied; what needs an `_id` is not
      offered for them.
- [ ] A selected row is said as selected to a screen reader, and the number of selected rows when it changes.

### `table.selection-bar` — The selection bar of the table

Shows how many documents are selected and what can be done with them together.

- **Kind**: View
- **Engine**: MongoDB
- **Function**: `src/features/table/selection-bar.ts › view(state)`
- **Entry points**: it appears between the query bar and the table while more than one row is selected
  (`@selection-bar`).
- **Offered when**: more than one row is selected.
- **Uses**: `table.selection`, `table.copy-as`, `transfer.export`.
- **Ported from**: `src/webview/main.ts › renderSelection` and the selection part of the row menu;
  `src/collectionPanel.ts › CollectionPanel.html` (`selInfo`).

What it shows, from the left:

1. **3 selected**, with the number of selected documents.
2. **Copy as**, a menu of the formats for several documents (`table.copy-as`).
3. **Export 3 documents…** (tooltip *JSON, JSON Lines or CSV, like Export*, `transfer.export`).
4. **Update 3 documents…** and **Delete 3 documents…**, which are the document area's: updating and deleting the
   selected rows.
5. **Clear** (tooltip *Clear the selection (Esc)*).

Acceptance:

- [ ] With one row selected there is no bar; with a second one it appears and reads **2 selected**.
- [ ] **Export 3 documents…**, **Update 3 documents…** and **Delete 3 documents…** are shown only when each of the
      selected documents has an `_id`.
- [ ] **Update 3 documents…** and **Delete 3 documents…** are not shown on a view, on a read-only connection or in
      **Aggregate**; **Copy as** and **Clear** always are.
- [ ] **Clear** empties the selection and the bar goes away; the table does not move when the bar appears or goes: its
      place is kept.
- [ ] The number follows the selection as rows are added and taken out.

### `table.copy-as` — Copy documents as text

Copies the document of a row, or the selected documents, to the clipboard in one of several formats, to paste them
into a query, a playground, the insert dialog, a file or another tool.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/table/copy-as.ts › plan(context, answers)`
- **Entry points**: **Copy as** in the menu of a row (`@row-menu`) and, as **Copy 3 documents as**, in the menu of a
  selected row; **Copy as** on the selection bar (`@selection-bar`) and in the inspector island (`@inspector`); Go to,
  **Copy document as…**, which asks the format.
- **Offered when**: a row is selected or under the menu, in **Find** and in **Aggregate**, on any connection.
- **Asks**: the format, by the entry chosen. From Go to, a list to pick from titled **Copy as**, with the entries and
  the descriptions below.
- **Plan**: no step: it writes nothing.
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone: nothing is written.
- **After**: the text of `table.copy-text` is on the clipboard; the status line says *Copied to the clipboard* for 2
  seconds.
- **Commands**: `table.copy-as`, `table.copy-as:mongosh`, `table.copy-as:extended-json`, `table.copy-as:json-lines`,
  `table.copy-as:json`, `table.copy-as:yaml`, `table.copy-as:insert-command`, `table.copy-as:csv`
- **Uses**: `table.copy-text`, `table.selection`, `table.layout`, `nav.status-line`.
- **Ported from**: `src/webview/main.ts` (`copyText`, `copyDocuments`, `showMenu`, `showSelectionMenu`),
  `src/shared/formats.ts` (`COPY_FORMATS`, `COPY_MANY_FORMATS`); README, **Copy documents**.

The formats of one document, with their descriptions:

| Entry | Description |
| --- | --- |
| **mongosh** | *ObjectId(…), ISODate(…): pastes into a query, the playground or Insert* |
| **Extended JSON** | *Keeps every type ({ "$oid": … }), like mongoexport: pastes into Insert* |
| **JSON** | *Plain JSON: ids and dates as strings, for other tools* |
| **YAML** | *Ids as strings, dates as YAML timestamps* |
| **insertOne command** | *db.getCollection(…).insertOne(…) for mongosh* |

The formats of several documents:

| Entry | Description |
| --- | --- |
| **mongosh** | *An array with ObjectId(…), ISODate(…): pastes into Insert, a query or the playground* |
| **Extended JSON** | *An array keeping every type ({ "$oid": … }): pastes into Insert* |
| **JSON Lines** | *One document per line in Extended JSON, as mongoexport writes them: pastes into Insert* |
| **JSON** | *A plain JSON array: ids and dates as strings, for other tools* |
| **YAML** | *A YAML list: ids as strings, dates as YAML timestamps* |
| **insertMany command** | *db.getCollection(…).insertMany([…]) for mongosh* |
| **CSV** | *The visible columns, as Export writes them* |

Acceptance:

- [ ] **Copy as** › **mongosh** on a row puts the document on the clipboard as `table.copy-text` writes it, and the
      status line reads *Copied to the clipboard*.
- [ ] With three rows selected, the menu of a selected row offers **Copy 3 documents as** with the seven formats; the
      menu of a row that is not selected offers the five formats for that row alone.
- [ ] The documents are copied in the order of the table, not in the order they were selected.
- [ ] What is copied is the document as the table has it: with the projection `{ name: 1 }` only `_id` and `name` are
      copied.
- [ ] A document holding an `Int32` 5, an `Int64` 5, a `Double` 5, a `Decimal128` 12.50, a date, an `ObjectId`, a
      `Binary` of subtype 4 and the regular expression `/^a/i`, copied as **mongosh**, as **Extended JSON**, as **JSON
      Lines** or as **insertOne command** and pasted into the insert dialog of another collection (`document.insert`),
      is inserted with every type unchanged: read with its types, the new document is equal to the one copied, field
      by field, and the `Decimal128` keeps its trailing zero.
- [ ] **CSV** copies the columns as the table shows them: a hidden column is left out, and an expanded array gives one
      line per element.
- [ ] It works on a view, on a read-only connection and in **Aggregate**, and on documents without `_id`.
- [ ] When the clipboard cannot be written, a notification says so and nothing else changes.

### `table.copy-text` — The text of each copy format

Writes documents in each of the formats `table.copy-as` offers.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/table/copy-text.ts › copyText(documents, format, collection, columns)`
- **Uses**: `query.format`, `table.layout`.
- **Ported from**: `src/shared/formats.ts › formatDocument`, `formatDocuments`, `toYaml`, `plainJson`;
  `src/shared/csv.ts › csvTable`, `toCsv`. Writing every BSON type in the mongosh, Extended JSON and JSON Lines
  formats and in the insert commands differs from Mongoster, which writes them from relaxed values.

Rules of the result:

- The inputs are the documents, the format, the name of the collection and, for CSV, the columns drawn. With one
  document the result is the document; with several, the form for several of that format. The text has no line break
  at its end unless said.
- **mongosh**: the **indented** layout of `query.format`, so every value with its type (`NumberLong(5)`, `Double(5)`);
  several documents are an array.
- **Extended JSON**: Extended JSON indented by two spaces, in which every value is read back with its type. A string,
  a boolean, null, an `Int32` and a `Double` with a fraction are written plainly (`42`, `42.5`), and a date from the
  year 1970 to 9999 as `{ "$date": "2024-03-15T10:30:00.000Z" }`. Every other value has its canonical form: an `Int64`
  `{ "$numberLong": "5" }`; a `Double` with a whole value `{ "$numberDouble": "5.0" }`, and so `NaN` and the
  infinities; a `Decimal128` `{ "$numberDecimal": "12.50" }`; an `ObjectId` `{ "$oid": "…" }`; any other date
  `{ "$date": { "$numberLong": "…" } }`; and `$binary`, `$regularExpression`, `$timestamp`, `$minKey`, `$maxKey`.
  Several documents are an array.
- **JSON Lines**: the same Extended JSON, one document per line with no spaces, and a line break after the last.
- **JSON**: plain JSON, indented by two spaces, for tools that know nothing of BSON; like **YAML** and **CSV** it is
  written for them and is not offered as a way back into a collection. An `ObjectId` and a UUID are their text; a date
  is its ISO text; an `Int64` or a `Decimal128` is a number when a JSON number holds it exactly as written, otherwise
  a string (`12.5` but `"12.50"`); a `Binary` is its base64; a regular expression is `"/^a/i"`; a `Timestamp` is
  `{ "t": …, "i": … }`; `MinKey` and `MaxKey` are the strings `"MinKey"` and `"MaxKey"`; undefined is `null`. Several
  documents are an array.
- **YAML**: block style, two spaces, with the same plain values as **JSON** and a line break at the end. A string is
  written without quotes when YAML reads it back as that string, otherwise in double quotes (`"yes"`, `"12.50"`, an
  id); a text of several lines is a block (`|-`); a date is a YAML timestamp without quotes; `[]` and `{}` for empty
  ones. Several documents are a list.
- **Insert command**: `db.getCollection("<collection>").insertOne(<document>);` with the document in the indented
  layout; for several, `insertMany([ … ]);`.
- **CSV**: a header line with the keys of the columns drawn, then one line per document, or one per element of its
  expanded arrays with the other values of the document repeated on each; every element, also past the twentieth. A
  string is written as it is; a number and a boolean as their text; an `ObjectId`, an `Int64` and a `Decimal128` as
  their text; a date as its ISO text; null and a missing value as an empty field; anything else as JSON. A field with
  a comma, a quote, a line break or a space at either end is in double quotes, a quote doubled. Every line ends with
  CR LF. It is the text the export writes as CSV, which is the transfer area's.

Worked examples, for the document

```
{ _id: ObjectId("65f1c0de65f1c0de65f1c0de"), status: "paid", total: 42.5,
  createdAt: ISODate("2024-03-15T10:30:00.000Z"), tags: ["a", "b"] }
```

**mongosh**:

```
{
  _id: ObjectId("65f1c0de65f1c0de65f1c0de"),
  status: "paid",
  total: 42.5,
  createdAt: ISODate("2024-03-15T10:30:00.000Z"),
  tags: [
    "a",
    "b"
  ]
}
```

**Extended JSON**:

```
{
  "_id": {
    "$oid": "65f1c0de65f1c0de65f1c0de"
  },
  "status": "paid",
  "total": 42.5,
  "createdAt": {
    "$date": "2024-03-15T10:30:00.000Z"
  },
  "tags": [
    "a",
    "b"
  ]
}
```

**JSON**:

```
{
  "_id": "65f1c0de65f1c0de65f1c0de",
  "status": "paid",
  "total": 42.5,
  "createdAt": "2024-03-15T10:30:00.000Z",
  "tags": [
    "a",
    "b"
  ]
}
```

**YAML**:

```
_id: "65f1c0de65f1c0de65f1c0de"
status: paid
total: 42.5
createdAt: 2024-03-15T10:30:00.000Z
tags:
  - a
  - b
```

**insertOne command**, for the collection `orders`:

```
db.getCollection("orders").insertOne({
  _id: ObjectId("65f1c0de65f1c0de65f1c0de"),
  status: "paid",
  total: 42.5,
  createdAt: ISODate("2024-03-15T10:30:00.000Z"),
  tags: [
    "a",
    "b"
  ]
});
```

For the two documents `{ _id: 1, status: "new" }` and `{ _id: 2, status: "paid", tags: ["x"] }`, **JSON Lines**:

```
{"_id":1,"status":"new"}
{"_id":2,"status":"paid","tags":["x"]}
```

**YAML**:

```
- _id: 1
  status: new
- _id: 2
  status: paid
  tags:
    - x
```

**insertMany command**:

```
db.getCollection("orders").insertMany([
  {
    _id: 1,
    status: "new"
  },
  {
    _id: 2,
    status: "paid",
    tags: [
      "x"
    ]
  }
]);
```

**CSV**, for those two and `{ _id: 3, status: "a, b", items: [{ sku: "A" }, { sku: "B" }] }` with `items` expanded:

```
_id,status,tags,items.sku
1,new,,
2,paid,"[""x""]",
3,"a, b",,A
3,"a, b",,B
```

Acceptance:

- [ ] Each example above gives exactly the text shown; the CSV lines end with CR LF, the last one too.
- [ ] A document with `price: NumberDecimal("12.50")` and `n: NumberDecimal("12.5")` gives, as **JSON**,
      `"price": "12.50"` and `"n": 12.5`; as **YAML**, `price: "12.50"` and `n: 12.5`.
- [ ] An `Int64` of 9007199254740993 is `NumberLong("9007199254740993")` as mongosh,
      `{ "$numberLong": "9007199254740993" }` as Extended JSON and `"9007199254740993"` as JSON.
- [ ] An `Int32` of 5 is `5` as mongosh and as Extended JSON; an `Int64` of 5 is `NumberLong(5)` and
      `{ "$numberLong": "5" }`; a `Double` of 5 is `Double(5)` and `{ "$numberDouble": "5.0" }`; a `Double` of 5.5 is
      `5.5` in both.
- [ ] A note of two lines is `note: |-` followed by its two lines indented in YAML, and `"line one\nline two"` in the
      other formats.
- [ ] A string `yes` is `"yes"` in YAML, and a key `yes` is `"yes":`.
- [ ] A collection named `my-orders` gives `db.getCollection("my-orders").insertOne(` followed by the document.
- [ ] The texts of **mongosh**, **Extended JSON**, **JSON Lines** and the insert commands, pasted into the insert
      dialog, are read back as the same documents, every value with the BSON type it had (`document.insert`).
- [ ] The same documents and format always give the same text.

### `table.copy-value` — Copy the value of a cell

Copies the value of the selected cell in mongosh syntax.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/table/copy-value.ts › plan(context, answers)`
- **Entry points**: **Copy value** in the menu of a cell (`@cell-menu`), with the tooltip *mongosh syntax (Ctrl+C)*;
  `Ctrl+C` on the selected cell (`@table`); Go to, **Copy value**.
- **Offered when**: the cell holds a value: not on an empty cell, a *… more elements* cell or the row number.
- **Plan**: no step: it writes nothing.
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone: nothing is written.
- **After**: the value is on the clipboard, written by `query.format` on one line with its type, whole, and never in
  the short form of the cell: no count before an array or a sub-document, an `Int64` as `NumberLong(…)`, a `Double`
  with a whole value as `Double(…)`; the status line says *Copied to the clipboard* for 2 seconds.
- **Commands**: `table.copy-value`
- **Uses**: `query.format`, `table.navigate`, `nav.status-line`.
- **Ported from**: `src/webview/main.ts` (**Copy value** of `showMenu`, the `Ctrl+C` of the `keydown` handler,
  `copyText`).

Acceptance:

- [ ] `Ctrl+C` on a cell showing `"paid"` copies `"paid"`, with its quotes; on a date it copies
      `ISODate("2024-03-15T10:30:00.000Z")`.
- [ ] On a cell showing `[2] ["a", "b"]` it copies `["a", "b"]`.
- [ ] On a cell showing `1204` that holds an `Int64` it copies `NumberLong(1204)`; on a cell showing `5.0` it copies
      `Double(5)`; on a cell showing `42` that holds an `Int32` it copies `42`. Each, pasted into the editor of
      another cell or into the insert dialog, is read with the type it had.
- [ ] On a cell whose text is cut at 300 characters it copies the whole value.
- [ ] On a cell of an element, in an expanded array, it copies the value of that element's field.
- [ ] `Ctrl+C` on an empty cell copies nothing and leaves the clipboard as it was.
- [ ] While text is selected in an editor of the bar, `Ctrl+C` copies that text and not a cell.
- [ ] It works on a view, on a read-only connection and in **Aggregate**.

### `table.copy-path` — Copy a field path

Copies the dotted path of the field of a cell or of a column, to type it in a filter, a sort, a projection or code.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/table/copy-path.ts › plan(context, answers)`
- **Entry points**: **Copy field path** in the menu of a cell (`@cell-menu`) and of a column header (`@column-menu`);
  Go to, **Copy field path**, on the selected cell.
- **Offered when**: on any column but the row number.
- **Plan**: no step: it writes nothing.
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone: nothing is written.
- **After**: the key of the column is on the clipboard, as a query uses it: the names joined by dots, with no position
  for an element of an expanded array (`items.sku`); the status line says *Copied to the clipboard* for 2 seconds.
- **Commands**: `table.copy-path`
- **Uses**: `table.detect-columns`, `nav.status-line`.
- **Ported from**: *New in Datardo*.

Acceptance:

- [ ] **Copy field path** on a cell of `address.city` copies `address.city`, without quotes.
- [ ] On Ada's second sub-row, under `items.sku`, it copies `items.sku`, which a filter and a sort read; the path with
      the position, `items.1.sku`, is what the inspector copies.
- [ ] On the header `tags` it copies `tags`.
- [ ] It is offered on an empty cell too, since the column has a path.
- [ ] It works on a view, on a read-only connection and in **Aggregate**.

### `table.row-menu` — The context menu of a row

What can be done with the document of a row, or with the selected documents.

- **Kind**: View
- **Engine**: MongoDB
- **Function**: `src/features/table/row-menu.ts › view(state)`
- **Entry points**: a right click on the row number of a row; it is also the second part of the menu of a cell
  (`table.cell-menu`). Its entries are `@row-menu`.
- **Offered when**: the table shows documents.
- **Uses**: `document.inspect`, `document.open`, `history.show`, `table.copy-as`, `document.delete`,
  `transfer.export`, `table.selection`.
- **Ported from**: `src/webview/main.ts › showMenu`, `showSelectionMenu`; `src/webview/popupMenu.ts`.

On a row that is not part of a selection of several, in order:

1. **Inspect document** (`document.inspect`).
2. **Open in a tab** (`document.open`).
3. **History…** (`history.show`).
4. A separator, then **Copy as**, a submenu: **mongosh**, **Extended JSON**, **JSON**, **YAML**, **insertOne command**
   (`table.copy-as`).
5. A separator, then **Duplicate…**, which is the document area's, and **Delete document** (`document.delete`).

On a row that is one of several selected, in order:

1. **Copy 3 documents as**, a submenu: **mongosh**, **Extended JSON**, **JSON Lines**, **JSON**, **YAML**,
   **insertMany command**, **CSV** (`table.copy-as`).
2. **Export 3 documents…** (`transfer.export`).
3. A separator, then **Update 3 documents…** and **Delete 3 documents…**, which are the document area's.
4. A separator, then **Clear selection** (`table.selection`).

Acceptance:

- [ ] A right click on a row that is not selected selects it alone first, then opens the menu of one row.
- [ ] A right click on one of three selected rows keeps the selection and opens the menu of the selection, with the
      number 3 in its entries.
- [ ] On a view, on a read-only connection and in **Aggregate**, **Duplicate…**, **Delete document**, **Update 3
      documents…** and **Delete 3 documents…** are not in the menu.
- [ ] On a view and in **Aggregate**, **History…** is not in the menu; in **Aggregate**, **Open in a tab** is not
      either.
- [ ] On a document without `_id`, **Open in a tab**, **History…**, **Duplicate…** and **Delete document** are
      disabled, with the tooltip *Not available: the document has no _id (excluded by the projection?)*.
- [ ] The menu opens with `Shift+F10` or the menu key on the row number, the arrows move through it, `Enter` starts an
      entry, `→` opens a submenu and `Esc` closes it and gives the focus back to the cell.
- [ ] Every entry is also in Go to, for the selected row.

### `table.cell-menu` — The context menu of a cell

What can be done with the value of a cell and its field, followed by what can be done with its row.

- **Kind**: View
- **Engine**: MongoDB
- **Function**: `src/features/table/cell-menu.ts › view(state)`
- **Entry points**: a right click on a cell; `Shift+F10` or the menu key on the selected cell. Its entries are
  `@cell-menu`.
- **Offered when**: the table shows documents.
- **Uses**: `document.inline-edit`, `table.copy-value`, `table.copy-path`, `relation.follow`, `query.add-condition`,
  `table.expand`, `table.collapse`, `table.row-menu`.
- **Ported from**: `src/webview/main.ts › showMenu` (**Copy value**, the reference entries). **Edit value**, **Copy
  field path**, **Add to filter** and the expand entries in this menu are *New in Datardo*.

In order:

1. **Edit value** (`document.inline-edit`).
2. **Copy value** (`table.copy-value`) and **Copy field path** (`table.copy-path`).
3. On a cell that holds a reference: **Open referenced document**, or **Open referenced documents** for an array of
   them; on a cell of `_id`: **Find referencing documents** (`relation.follow`).
4. **Add to filter**, a submenu with what dragging the cell offers over **Filter**: **= equals**, **≠ not equal**, and
   by the type of the value **≥ from**, **≤ to**, **∈ in** (`query.add-condition`).
5. **Expand `<key>`** and **Expand all levels of `<key>`**, or **Collapse `<key>`**, when the column can be expanded
   or is under an expanded one (`table.expand`, `table.collapse`).
6. A separator, then the entries of `table.row-menu` for the row of the cell.

Acceptance:

- [ ] A right click on a cell selects it, and its row, before the menu opens.
- [ ] On a cell with a number the submenu **Add to filter** has four entries; on a cell with `true`, two; on a cell
      with an array that is not empty, **= equals**, **≠ not equal** and **∈ in**.
- [ ] **Add to filter** › **= equals** on the cell `status` of a paid order writes `{ status: "paid" }` in **Filter**
      and runs the query, as the drop does.
- [ ] On an empty cell the menu has **Edit value**, **Copy field path** and the entries of the row; **Copy value** and
      **Add to filter** are not there.
- [ ] On a view, on a read-only connection, in **Aggregate**, on a cell of `_id` and on a document without `_id`,
      **Edit value** is not in the menu.
- [ ] In **Aggregate**, **Add to filter** adds the condition to the pipeline, which is the aggregate area's.
- [ ] The reference entries are there only in **Find** and only on a cell where a reference was found.

### `table.column-menu` — The context menu of a column header

What can be done with a column and with its field in the documents.

- **Kind**: View
- **Engine**: MongoDB
- **Function**: `src/features/table/column-menu.ts › view(state)`
- **Entry points**: a right click on a column header; `Shift+F10` or the menu key on a header that has the focus. Its
  entries are `@column-menu`.
- **Offered when**: the table shows columns.
- **Uses**: `query.add-sort`, `query.add-condition`, `query.add-projection`, `table.copy-path`, `table.expand`,
  `table.collapse`, `table.arrange-columns`, `table.columns`.
- **Ported from**: `src/webview/main.ts › showColumnMenu`. **Sort**, **Add to filter**, **Project**, **Copy field
  path** and the expand entries in this menu are *New in Datardo*: in Mongoster they are only reached by dragging the
  header.

In order:

1. **Sort**, a submenu: **▲ ascending**, **▼ descending**, and **✕ remove** when the field is in the sort
   (`query.add-sort`).
2. **Add to filter**, a submenu: **exists**, **missing**, **is null** (`query.add-condition`).
3. **Project**, a submenu: **include**, **exclude**, and **✕ remove** when the field is in the projection
   (`query.add-projection`).
4. **Copy field path** (`table.copy-path`).
5. A separator, then **Expand `<key>`** and **Expand all levels of `<key>`**, or **Collapse `<key>`** (`table.expand`,
   `table.collapse`).
6. **Hide `<key>`**, **Pin `<top>` to the left** or **Unpin `<top>`**, **Reset width** (`table.arrange-columns`);
   **Columns…** (`table.columns`); **Reset all columns** (`table.arrange-columns`).
7. A separator, then the entries of the field area: **Rename field…**, **Remove field…**, **Convert type…**.

Acceptance:

- [ ] The menu of `address.city` reads **Hide address.city** and **Pin address to the left**; when `address` is pinned
      it reads **Unpin address**.
- [ ] **Reset width** is there only when the width of the column was set by hand.
- [ ] **Sort** › **▼ descending** on `total`, with the sort `{ status: 1 }`, gives `{ status: 1, total: -1 }` and runs
      the query, as the drop does.
- [ ] **Rename field…**, **Remove field…** and **Convert type…** are in the menu only in **Find**, on a collection
      that can be changed, on a column other than `_id` and its sub-fields: not on a view, not on a read-only
      connection, not in **Aggregate**.
- [ ] In **Aggregate** the menu has no **Sort** and no **Project**: a click on the header sorts there, and **Add to
      filter** adds its condition to the pipeline, both the aggregate area's.
- [ ] The menu of the row number column has **Columns…** and **Reset all columns** only.
- [ ] The menu opens and is used with the keyboard as that of a row.

### `table.refresh` — Refresh the documents

Reads the page shown again, to see what changed in the database meanwhile.

- **Kind**: Read
- **Engine**: MongoDB
- **Function**: `src/features/table/refresh.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: **Refresh** in the toolbar of the Documents section (`@toolbar`); `F5` while the collection tab
  has the focus; Go to, **Refresh documents**. It also runs after a write made from the tab by the features of the
  document area and of the field area.
- **Offered when**: the Documents section is shown.
- **Reads**: the query as it was **last run** and the page shown, not what the bar reads now: `query.run` in **Find**,
  `aggregate.run` in **Aggregate**, each with its count.
- **After**: the table shows the page again; the selection, the selected cell and the scroll position are kept where
  their documents are still there; the inspector shows the selected document as it is now; the fields for the
  suggestions are read again the next time they are needed (`query.field-hints`).
- **Commands**: `table.refresh`
- **Uses**: `query.run`, `query.count`, `aggregate.run`, `table.selection`, `table.page-window`, `document.inspect`,
  `query.field-hints`.
- **Ported from**: `src/webview/main.ts` (`reload`, the `refresh` button, the `refresh` message),
  `src/collectionPanel.ts` (`postRefresh`).

Acceptance:

- [ ] With `{ status: "paid" }` run and `{ status: "new" }` typed and not run, **Refresh** reads the paid ones again
      and leaves `{ status: "new" }` in **Filter**.
- [ ] **Refresh** on page 3 reads page 3 again; when the result now ends before page 3, it shows the last page that
      has documents.
- [ ] A refresh counts again: a total of 1,204 becomes 1,205 after a document was inserted elsewhere.
- [ ] A document changed elsewhere shows its new values, in the table and in the inspector, and stays selected.
- [ ] `F5` with the focus in the tree refreshes the tree, not the table.
- [ ] A refresh is not added to the recent queries a second time.
- [ ] A refresh that fails leaves the rows shown and puts the message on the error line of the bar.
