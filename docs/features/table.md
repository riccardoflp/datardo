# The table of the Documents section

The Documents section of a collection tab and its table: one row per document, one column per field. How the columns
are found in the documents, how a value of each BSON type is written in a cell, sub-documents expanded into columns
and arrays into sub-rows; the columns' layout, sorting from a header, paging; moving between cells with the keyboard,
selecting rows, copying a value, a field path or whole documents; the context menus of a row, a cell and a column
header; refreshing; conditional formatting, which colors rows and cells by rules (from M41). The query bar above the
table is the [query bar](query.md) area.

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
  `nav.status-line`, `nav.toggle-inspector`, `table.formatting`, `table.format-table`, `table.format-scopes`.
- **Ported from**: `src/collectionPanel.ts › CollectionPanel.html`, `src/webview/main.ts › renderGrid`,
  `renderStatus`; README, **Browse documents**. The states of an empty collection, of a time series collection and of
  a first read that fails are *New in Datardo*. The buttons with icons, and the query beside the table: Mongoster
  0.9.0 (commits 98c0cb5, 0240a8c). The **Formatting** button: Mongoster 0.9.0 and 0.10.0 (query.format-rules,
  proposals 0002 and 0003; `src/webview/formatting.ts › FormattingPaneUi`, the `formattingBtn` of
  `src/collectionPanel.ts`).

What it shows, from the top:

1. The toolbar (`@toolbar`). At the left **Refresh** (`table.refresh`), **Columns** (`table.columns`) and
   **Formatting** (tooltip *Color the rows and cells by rules, in the inspector island*), which reads **Formatting
   (2)** while 2 formatting rules that reach the collection are on, and **Formatting (off)** while formatting is
   hidden (`table.toggle-formatting`). It shows the Formatting view of the inspector island, and is shown pressed
   while that view is shown; pressed again, it shows the selection (`nav.toggle-inspector`). Then the buttons of
   other areas: **Insert** (icon `add`, tooltip *Insert documents: type them or paste a copied one*,
   `document.insert`), **Export** (icon `export`, tooltip *Export the results to JSON, JSON Lines or CSV*,
   `transfer.export`) and **Watch** (icon `pulse`, tooltip *Show the changes of the collection as they happen (change
   stream)*, `watch.show`); while the main island is narrower than 900 pixels these three show their icon alone, their
   name staying their tooltip and the name a screen reader says. **Explain**, **Code**, **Update many…** and **Delete
   many…** are in the query bar (`query.bar`). At the right end the marks of what is shown: **view** (tooltip *Views are
   read-only*), **time series** (tooltip *Time series collection: each document is one measurement*), **read-only**
   (tooltip *The connection is read-only: no changes are made through it*).
2. The query bar (`query.bar`), or the pipeline editor in **Aggregate** (`aggregate.show`), with its error line; or,
   when the query is put at the right (`query.position`), the query pane at the right of items 3 to 5.
3. The selection bar, while more than one row is selected (`table.selection-bar`).
4. The table: a header row with the row number column `#` and one header per column; under it the rows (`table.rows`),
   their rows and cells colored by the formatting rules (`table.format-table`). The header row and the pinned columns
   stay in place while the rows scroll.
5. The paging row (`table.paging`).

The status line shows the count of the page while the tab is active: `50 of 1,204 documents · 38 ms`, the documents
shown, the total of the query and how long the server took for the documents.

Its states:

- *Loading, nothing shown yet*: **Loading documents…** in place of the rows.
- *Running again*: the rows shown stay, dimmed after 200 ms, until the new ones arrive; nothing in them can be started
  meanwhile. The message of an empty result stays the same way. The window is not blocked: other tabs and the bar stay
  usable.
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
- [ ] On a view the toolbar shows **view** and not **Insert**, and the query bar has neither **Update many…** nor
      **Delete many…**; **Export** and **Columns** are in the toolbar, **Explain** and **Code** in the query bar.
- [ ] In a main island 800 pixels wide, **Insert**, **Export** and **Watch** show their icon alone, and a screen reader
      says their names.
- [ ] On a time series collection the toolbar shows **time series**, and the total of an empty query is exact
      (`query.count`).
- [ ] A query that fails on a tab that shows 50 documents leaves the 50 documents and shows the message under the bar;
      a first read that fails shows **The documents could not be read.** with **Run again**.
- [ ] While a query runs again, the rows are dimmed and a double click on a cell does not open its editor; a query
      that found nothing keeps **No documents match this query.** while it runs again.
- [ ] A click on a row shows its document in the inspector island (`document.inspect`).
- [ ] The table is announced to a screen reader as a grid with its numbers of rows and columns, and each cell with the
      name of its column.
- [ ] With the row rule `{ status: "failed" }` red, the toolbar reads **Formatting (1)** and the failed orders are
      red; with it turned off, **Formatting**.
- [ ] A click on **Formatting** shows the Formatting view of the inspector island and the button is pressed; a second
      click shows the selection again.
- [ ] After **Hide formatting**, the toolbar reads **Formatting (off)** and no row is colored.
- [ ] With one rule on in each of the four formatting scopes, the toolbar reads **Formatting (4)**; with the section
      **Everywhere** left out of `shop.orders`, **Formatting (3)**.

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
- **Uses**: `table.detect-columns`, `table.cell-text`, `table.page-window`, `table.format-table`.
- **Ported from**: `src/shared/columns.ts › rowHeight`, `getAt`, `MAX_ELEMENTS`; `src/webview/main.ts › renderGrid`
  (`renderNodes`, `renderElements`, `addCell`). The colors of the rows and cells: Mongoster 0.9.0 and
  0.10.0 (query.format-table; `src/webview/main.ts › renderGrid`, `formatCell`, `src/webview/formatting.ts ›
  applyPaint`). The line *Formatting: …* in the tooltips is *New in Datardo*.

Rules of the result:

- The inputs are the documents of the page, the columns to draw (`table.detect-columns` after `table.layout`), the
  number of the first document and the formatting of the page (`table.format-table`). The result is, for each
  document, its number, its height in sub-rows, the color of its row and its cells, each with its column, its value
  or the lack of one, the sub-rows it covers, its color and, for a field of an element, which element.
- **The row number**, in the column `#`, counts from the first document of the query across the pages: the first row
  of page 3 with page size 50 is 101. It covers all the sub-rows of its document. Its tooltip is *Inspect document*.
- **Colors.** A row's color is drawn on every cell of its sub-rows but the row number; a cell's color over the row's
  (`table.format-table`). A colored row adds to the tooltip of its row number, and a colored cell to its own tooltip,
  a line that names the rule and the color: *Formatting: { status: "failed" } (red)*, *Formatting: Failed payments
  (red)* for a rule with a name, *Formatting: by status (orange)*, *Formatting: by amount (scale)*. A screen reader
  says it with the row or the cell, so that the color is never the only sign. The cells with *… more elements* and
  the empty cells that fill a group take no color of a cell rule.
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
- [ ] With the row rule `{ status: "failed" }` red, the row number of a failed order has the tooltip *Inspect
      document* and *Formatting: { status: "failed" } (red)*, and every cell of its row but the row number is red.
- [ ] With `items` expanded and the cell rule `{ "items.qty": { $gt: 1 } }` green on `items.qty`, Ada's first sub-row
      has a green `qty` with the tooltip line *Formatting: { "items.qty": { $gt: 1 } } (green)*, and her second sub-row
      has no color there.

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
      counted `1–50 of ?`. While the total is counted again, the total counted before stays, dimmed.
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
  `table.collapse`, `table.arrange-columns`, `table.columns`, `table.add-format-rule`, `table.color-by-field`.
- **Ported from**: `src/webview/main.ts › showColumnMenu`. **Sort**, **Add to filter**, **Project**, **Copy field
  path** and the expand entries in this menu are *New in Datardo*: in Mongoster they are only reached by dragging the
  header. **Format cells…** and **Color by this field**: Mongoster 0.9.0 and 0.10.0 (query.format-rules,
  `src/webview/main.ts › showColumnMenu`).

In order:

1. **Sort**, a submenu: **▲ ascending**, **▼ descending**, and **✕ remove** when the field is in the sort
   (`query.add-sort`).
2. **Add to filter**, a submenu: **exists**, **missing**, **is null** (`query.add-condition`).
3. **Project**, a submenu: **include**, **exclude**, and **✕ remove** when the field is in the projection
   (`query.add-projection`).
4. **Copy field path** (`table.copy-path`).
5. A separator, then **Color by this field** (`table.color-by-field`) and **Format cells…** (`table.add-format-rule`).
6. A separator, then **Expand `<key>`** and **Expand all levels of `<key>`**, or **Collapse `<key>`** (`table.expand`,
   `table.collapse`).
7. **Hide `<key>`**, **Pin `<top>` to the left** or **Unpin `<top>`**, **Reset width** (`table.arrange-columns`);
   **Columns…** (`table.columns`); **Reset all columns** (`table.arrange-columns`).
8. A separator, then the entries of the field area: **Rename field…**, **Remove field…**, **Convert type…**.

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
- [ ] **Format cells…** is in the menu of every column but the row number, in **Find** and in **Aggregate**, on a view
      and on a read-only connection.
- [ ] **Color by this field** is in the menu of every column but the row number, before **Format cells…**, in
      **Find** and in **Aggregate**, on a view and on a read-only connection.

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

## Conditional formatting

Formatting rules color the rows and the cells of the table, as conditional formatting does in a spreadsheet: every
document stays in the page, and the ones that matter stand out. A **condition rule** has a condition written as a
filter (`{ status: "failed" }`), a color and what it colors, the row or one field's cell; a **field rule** colors
by the values of one field with no condition. The rules are edited in the Formatting view of the inspector
island (`table.formatting`), beside the table they color, and the table follows each change at once.

The rules are Datardo's own data, in the file `formatting.json` of the data folder: a collection's own rules,
and those of its database, of its connection and those for everywhere (`table.format-scopes`). Nothing of
them is written to a deployment, so formatting works on a view, through a read-only connection and on the output of
**Aggregate**; nothing of them is in the undo history, which is for writes to deployments. MongoDB only.

The colors are the eleven presets of `connection.color-presets` (red, orange, yellow, green, blue, purple, pink, teal,
indigo, brown, gray), never a custom `#rrggbb`: a color of the user's own would be unreadable under the text of one
theme or the other sooner or later, which the presets are made not to be (R10.10).

### `table.match` — Whether a document matches a filter

Whether a document of the page matches a filter, decided in the window as MongoDB decides it, for the colors of the
table only: nothing that writes may rely on it.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/table/match.ts › matcherOfFilter(filter)`
- **Uses**: `query.parse`.
- **Ported from**: query.match (Mongoster 0.9.0, proposal 0002; `src/shared/match.ts › compileFilter`,
  `test/unit/match.test.ts`). Datardo has no matcher of query operators to start from: `search.match` looks for a
  text in the values of a document, `compare.equality` compares two whole documents, `tree.match`, `oplog.scope` and
  `watch.visible-events` match names and texts. Only the rule that an `Int32`, an `Int64` and a `Double` of the same
  value are equal can share `compare.equality`'s way of writing the three as one key. Comparing `Int64` values
  exactly and `$type` by the exact BSON type are *New in Datardo*: Mongoster matches relaxed Extended JSON, where a
  whole number is an `int`, a `long` and a `double` at once and an `Int64` beyond 2⁵³ is rounded.

Rules of the result:

- The inputs are a filter as `query.parse` reads it, every value with its BSON type, and a document as the table holds
  it, in canonical Extended JSON. The result is a predicate on documents, or a refusal with a message for the user.
  The predicate is made once for each rule when the rules or the page change, then run on each document of the page
  (500 at most).
- **Paths**: a dotted path goes through sub-documents and into the elements of arrays (`items.qty` matches when the
  `qty` of any element does); a numeric segment is also an index (`items.1.qty`); a missing field is equal to `null`,
  and `undefined` only to `undefined`, as in MongoDB 8.0 *(differs from Mongoster, where it is equal to `null`)*.
- **Equality** (`{ f: v }`, `$eq`): the same type and value. Numbers are equal across `Int32`, `Int64`, `Double` and
  `Decimal128` by their value: `5`, `NumberLong(5)`, `Double(5)` and `NumberDecimal("5.0")` are equal. A sub-document
  is equal to one with the same fields in the same order, their values equal by these rules. An array matches when it
  is equal or one of its elements is. A regular expression as the value matches the strings it matches, as `$regex`
  does.
- **Comparison** (`$gt`, `$gte`, `$lt`, `$lte`): only values of the same type bracket compare (numbers, strings, dates,
  ObjectIds, booleans, timestamps…), as MongoDB does: `{ amount: { $gt: 5 } }` does not match `amount: "10"`. Strings
  compare by code point, which is the order of the UTF-8 bytes MongoDB compares, without the collection's collation.
  Each bound may be met by a different element of an array. `$ne` and `$nin` are the negations of `$eq` and `$in`.
- **Numbers**: `Int32`, `Int64` and `Double` compare exactly, an `Int64` beyond 2⁵³ too; a `Decimal128` compares as a
  JavaScript number, rounded beyond 15 significant digits, as in Mongoster.
- **Sets and arrays**: `$in` (values and regular expressions), `$nin`, `$all` (an empty one matches nothing), `$size`,
  `$elemMatch` with operators or a sub-filter.
- **Others**: `$exists` (a `null` exists); `$type` by name, by number or `"number"`, by the exact BSON type of the
  value (`"long"` matches an `Int64` only, `"number"` any of the four numbers); `$regex` with `$options` (`i`, `m`,
  `s`, `x`); `$mod` on the integer part; `$not` with an operator or a regular expression.
- **Logic**: `$and`, `$or`, `$nor` at the top and inside `$elemMatch`, and the fields of a document joined by an and;
  `$comment` is ignored.
- **Refused**, with the message the user reads under the condition:
  - `$expr`, `$where`, `$text`, `$jsonSchema`, `$sampleRate`, `$search`, `$vectorSearch`, the geospatial operators
    (`$geoWithin`, `$geoIntersects`, `$near`, `$nearSphere`) and the bitwise ones (`$bitsAllSet`, `$bitsAllClear`,
    `$bitsAnySet`, `$bitsAnyClear`): *\<op\> is not supported in a formatting rule.* They need the server; they are
    refused rather than approximated.
  - any other key that starts with `$` where an operator goes: *Unknown operator \<op\>.*
  - a condition that is not a document: *The condition must be a document: { field: value }.*
  - operands MongoDB would refuse: *$in needs an array.*, *$all needs an array.*, *$size needs a whole number.*,
    *$mod needs an array of two numbers: [ divisor, remainder ].*, *$mod: the divisor can not be 0.*, *$type: unknown
    type "text".*, *$options needs $regex.*, *$elemMatch needs a document.*, *$not needs an operator such as { $gt: 1
    } or a regular expression.*, *$and needs a non-empty array of conditions.*, *The conditions of $and must be
    documents.*, *$gt can't compare with a regular expression.*, *$and goes at the top of the condition or inside
    $elemMatch, not on a field.*, *$in can't contain an operator.*, *$type needs at least one type.*, *$regex needs a
    string or a regular expression.*, *$options must be a string.*, *Invalid regular expression /\<pattern\>/:
    \<reason\>*.
- A document the predicate cannot read (a value of a form it does not expect) does not match; drawing the table never
  stops because of a rule.

Worked examples:

| Filter | Document | Matches |
| --- | --- | --- |
| `{ amount: { $gt: 5 } }` | `{ amount: "10" }` | no: a string never compares with a number |
| `{ n: 5 }` | `{ n: NumberDecimal("5.0") }` | yes |
| `{ n: { $type: "long" } }` | `{ n: 5 }` | no: `5` is an `Int32` |
| `{ n: NumberLong("9007199254740993") }` | `{ n: NumberLong("9007199254740992") }` | no |
| `{ "items.sku": "b" }` | `{ items: [ { sku: "a" }, { sku: "b" } ] }` | yes |
| `{ deletedAt: null }` | `{ a: 1 }` | yes |
| `{ deletedAt: { $exists: true } }` | `{ deletedAt: null }` | yes |
| `{ status: { $ne: "ok" } }` | `{ other: 1 }` | yes |
| `{ scores: { $elemMatch: { $gt: 80, $lt: 85 } } }` | `{ scores: [70, 95] }` | no |
| `{ scores: { $gt: 80, $lt: 85 } }` | `{ scores: [70, 95] }` | yes: each bound by another element |

Acceptance:

- [ ] Each example above gives the answer shown.
- [ ] `{ amount: { $gt: 1000 } }` matches `{ amount: 1500 }` and not `{ amount: 1000 }` nor `{ amount: "2000" }`.
- [ ] `{ tags: "red" }` matches `{ tags: ["blue", "red"] }`; `{ tags: { $ne: "red" } }` does not.
- [ ] `{ n: { $type: "number" } }` matches `5`, `NumberLong(5)`, `Double(5)` and `NumberDecimal("5")`; `{ n: { $type:
      "double" } }` matches `Double(5)` only of the four.
- [ ] `{ name: /^a/i }` and `{ name: { $regex: "^a", $options: "i" } }` match `{ name: "Ada" }`.
- [ ] `{ s: { $gt: "�" } }` matches `{ s: "😀" }`, whose code point is above it.
- [ ] `{ items: { $elemMatch: { sku: "A1", qty: { $gt: 1 } } } }` matches Ada of the three people, and `{ items: {
      $elemMatch: { sku: "B2", qty: { $gt: 1 } } } }` does not.
- [ ] `{ $expr: { $gt: ["$a", "$b"] } }` is refused with *$expr is not supported in a formatting rule.*; `{ a: {
      $foo: 1 } }` with *Unknown operator $foo.*; `{ a: { $mod: [0, 1] } }` with *$mod: the divisor can not be 0.*

### `table.format-table` — What colors each row and cell

Which color each row and each cell of the page takes from the formatting rules: the first rule that gives one wins,
a cell's color over its row's.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/table/format-table.ts › tableFormat(rules, documents, hidden, now)`, and `›
  colorOfCell(format, cell)` for a cell of `table.rows`
- **Uses**: `table.match`, `query.parse`, `table.format-field`, `table.format-scopes`, `table.cell-text`,
  `connection.color-presets`.
- **Ported from**: query.format-table (Mongoster 0.9.0 and 0.10.0, proposals 0002 and 0003;
  `src/shared/formatting.ts › TableFormat`, `withElement`, `paintLevel`, `media/webview.css`, `[data-fmt]`). The
  shares are those of Mongoster 0.10.0 from the start: rows 12 %, cells 28 % (0.9.0 had 25 % for both).
  The formatting tokens of the theme and the contrast they hold are *New in Datardo*.

Rules of the result:

- The inputs are the rules that reach the collection in the order they are tried (those of
  the four formatting scopes, `table.format-scopes`), the documents of the page (of **Find** or of the output of
  **Aggregate**), whether formatting is hidden (`table.toggle-formatting`) and the time the page was read, which
  `ISODate()`, `new Date()` and `ObjectId()` in a condition stand for (`query.parse`). The result is, for each
  document, the color of its row and the colors of its cells by column key and, in an expanded array, by element,
  each with the rule that gave it; and, for each rule that cannot be used, why.
- A color is a preset, with a strength from 0 to 1 when a field rule gives one (`table.format-field`), a second preset
  and its share for a scale between two colors, and an outline for a pinned value among the shades of its own color.
- **Rows**: the first enabled rule that colors rows and gives the document a color colors its row: every cell of the
  document's sub-rows, not the row number. A condition rule gives its color to the documents its condition matches
  (`table.match`).
- **Cells**: the first enabled rule of a field's cell that gives a color colors that cell, over the row's color; the
  row's other cells keep the row's. The condition is about the whole document: `{ status: "failed" }` on the cell of
  `amount` colors the `amount` of the failed documents.
- **Expanded arrays**: a cell rule of a field of the elements (`items.qty`) is matched, for each element, against the
  document with the array replaced by that element alone: `{ "items.qty": { $gt: 5 } }` colors the `qty` of the
  elements over 5, not every `qty` of a document where one element is. A row rule colors all the sub-rows of its
  document. The cell with *… more elements* and the cells that fill a group take no cell color.
- **Field rules**: a field rule gives a color when its field has a value it can color (`table.format-field`),
  and gives none to the other documents, which the rules after it may color. Rules of both kinds are in one order: the
  first that gives a color wins. In an expanded array, a field rule of a field of the elements colors each element's
  cell by that element's value.
- A rule turned off colors nothing. A rule whose condition cannot be used colors nothing either, and the result says
  why: *Type a condition, such as { status: "failed" }.* for an empty one, *Invalid syntax: \<the error of
  `query.parse`\>* for one that does not parse, or the refusal of `table.match`. The other rules still apply.
- While formatting is hidden, nothing is colored; the rules are as they were.
- **How a color is drawn**: the preset's formatting token of the theme, `--color-format-<preset>`, mixed into the
  surface of the table: 12 % for a row and 28 % for a cell, so that a colored cell reads on a colored row. With a
  strength, from 4 % to 22 % for a row and from 6 % to 45 % for a cell; a scale between two presets mixes the two by
  its share first. The result gives the share in percent; the style only mixes.
- The formatting tokens are not the presets' tokens of the connections, which are bright enough to mark a name on an
  island and would leave text unreadable under them (at 28 %, the muted text on yellow would be 3.7:1 in the dark
  theme): each is the preset's hue, chosen in each theme so that the text, the muted text and every syntax color stay
  at least 4.5:1 over it at the strongest share, 45 % (R10.10).
- A colored cell keeps the color of its value's kind (`table.cell-text`), and a missing field keeps its own look over
  the color. The hover, the selected rows and the selected cell's outline are drawn over the color as on any row: a
  selected row shows the selection's background, and its color again once it is no longer selected.
- The rule that gave a color, with the color's name, is in the tooltip of the row number or of the cell
  (`table.rows`): the color is never the only sign.

Worked examples:

| Rules, in order | Document | Row | Cell `amount` |
| --- | --- | --- | --- |
| row `{ status: "failed" }` red; row `{ amount: { $gt: 1000 } }` yellow | `{ status: "failed", amount: 5000 }` | red | red (the row's) |
| the same | `{ status: "ok", amount: 5000 }` | yellow | yellow (the row's) |
| row `{ status: "failed" }` red; cell of `amount` `{ amount: { $gt: 1000 } }` green | `{ status: "failed", amount: 5000 }` | red | green |
| row `{}` red, turned off; row `{}` blue | `{ a: 1 }` | blue | blue (the row's) |
| cell of `amount` `{ status: "failed" }` red | `{ status: "failed", amount: 5 }` | — | red |

Acceptance:

- [ ] Each example above gives the colors shown.
- [ ] With the row rules `{ status: "failed" }` red and `{ amount: { $gt: 1000 } }` yellow, `{ status: "ok", amount:
      5000 }` is yellow and `{ status: "ok", amount: 5 }` is not colored.
- [ ] With the cell rules of `amount` `{ amount: { $gt: 1000 } }` green then `{ amount: { $gt: 0 } }` blue, the
      amount 5000 is green and 5 is blue.
- [ ] For `{ items: [ { qty: 1 }, { qty: 7 } ] }`, `items` expanded and the cell rule `{ "items.qty": { $gt: 5 } }`
      on `items.qty`, the element 0 is not colored and the element 1 is.
- [ ] The rules `{ status: ` and `{ $expr: … }` color nothing and give *Invalid syntax: …* and *$expr is not supported
      in a formatting rule.*; the other rules still apply.
- [ ] A row's color is the formatting token mixed at 12 % and a cell's at 28 %; with formatting hidden, no row and no
      cell has a color.
- [ ] In the dark and in the light theme, the text, the muted text and each syntax color are at least 4.5:1 over each
      of the eleven formatting tokens mixed at 45 % and at 22 % into the surface of the table
      (`test/unit/theme/contrast.test.ts`).
- [ ] The same rules color the output of a pipeline in **Aggregate**; a rule about a field the output does not have
      colors nothing.
- [ ] A selected red row shows the selection's background; selecting another row shows it red again.

### `table.formatting` — The Formatting view of the inspector island

The formatting rules that color the table, listed, edited in place and turned on and off beside the table, which
follows each change while the user watches it.

- **Kind**: View
- **Engine**: MongoDB
- **Function**: `src/features/table/formatting.ts › view(state)`
- **Entry points**: the Formatting view of the inspector island (`@inspector`), shown by **Formatting** in the
  island's first row and in the toolbar of the Documents section, `Ctrl+Shift+F` and Go to, **Formatting rules**
  (`nav.toggle-inspector`), and by **Format cells…** and **Color by this field** in the menu of a column header
  (`table.add-format-rule`, `table.color-by-field`). Its controls are `@inspector`.
- **Offered when**: the active tab is a collection tab showing its Documents section, in **Find** and in
  **Aggregate**, on a collection, a view or a time series collection, through any connection, read-only included.
- **Uses**: `nav.inspector`, `nav.toggle-inspector`, `table.add-format-rule`, `table.edit-format-rule`,
  `table.toggle-formatting`, `table.format-table`, `table.color-by-field`, `table.edit-field-rule`,
  `table.format-field`, `table.format-scopes`, `table.move-format-rule`, `table.export-formatting`,
  `table.import-formatting`.
- **Ported from**: query.format-rules (Mongoster 0.9.0 and 0.10.0, proposals 0002 and 0003;
  `src/webview/formatting.ts › FormattingPaneUi`, `media/webview.css`, `.fmt-pane`). Mongoster's pane docked at the
  right of the table is a view of the inspector island here (the author's decision of 2026-11-24): the rules are
  edited while the table changes, and no room is taken from the table. Its width is the island's (`nav.resize`).

What it shows, from the top:

1. The head: **Add rule…**, a menu of **Condition…** (tooltip *Color the row or a cell of the documents matching a
   filter*, `table.add-format-rule`) and **By field…** (tooltip *Color by a field's values: true and
   false, a scale for numbers and dates, a color per value*, `table.color-by-field`); **Hide formatting** or **Show
   formatting** (`table.toggle-formatting`); `…`, a menu of **Export formatting…** and **Import
   formatting…** (`table.export-formatting`, `table.import-formatting`).
2. A line at the top of the list for what a change could not do, such as *A collection keeps at most 100 formatting
   rules.*, until the next change.
3. The rules, in four sections, **This collection**, **Database
   \<name\>**, **Connection \<name\>** and **Everywhere**, in that order (`table.format-scopes`), each with its count of
   rules, a checkbox and its rules; a section without rules is its head alone, dimmed.
4. A rule's line: a handle to drag it; a checkbox that turns it on and off (tooltip *Turn off* or *Turn on*); its
   color, a swatch whose name is the color's (*Red*), or for a field rule the bar of its scale or the swatches of its
   first values; **Row**, or the field whose cell it colors; its name, or else its condition on one line (`{ status:
   "failed" }`) or `by <field>`, cut with `…`; `⚠` when its condition cannot be used; `…`, a menu of **Move up**,
   **Move down**, **Move to** and **Copy to** (`table.move-format-rule`), and **Remove**; and **Remove
   rule** (`✕`). The line's tooltip has the name, then *The row when the document matches { status: "failed" }*,
   *The cell of amount when the document matches …*, *The row by the value of status* or *The cell of status by the
   value of status*, then why it cannot be used, *No \<field\> in this table.*, and *Drag to reorder, or into
   another section: the first rule that gives a color wins · click to edit · F2 to name*.
5. The open rule, under its line: one rule at a time is open, by a click on its line or `Enter` on it; what it shows
   is `table.edit-format-rule`'s, and for a field rule `table.edit-field-rule`'s, with its legend.

Its states:

- *No rules*: *No formatting rules. Add one, or use Color by this field or Format cells… in a column header's menu.*
- *Hidden*: the head reads **Show formatting**; the rules are listed as they are, and the table shows no color.
- *A rule that cannot be used*: `⚠` on its line, with the reason in its tooltip and, when it is open, under its
  condition.
- *A rule about a field the table does not have*: its line is dimmed, with *No \<field\> in this table.* in its
  tooltip. For a rule of a wider section that is the usual case, not an error.
- *Running again*: the view stays as it is; the legends follow when the new page arrives.
- On a view, through a read-only connection and in **Aggregate**, the view is the same: nothing it does writes to a
  deployment.

With the keyboard, the list is one stop of `Tab`: `Up` and `Down` move between the lines, `Enter` or `Space` opens
and closes the focused rule, `F2` goes to its **Name**, `Alt+Up` and `Alt+Down` move it among its section's rules,
`Shift+F10` or the menu key opens its `…` menu. Inside an open rule `Tab` goes through its controls and `Esc` closes
it, giving the focus back to its line.

Acceptance:

- [ ] On the Documents section of `shop.orders`, **Formatting** in the toolbar shows the view; on the Indexes section
      and on a keys tab the island has no **Formatting**.
- [ ] With no rule, the view reads *No formatting rules. Add one, or use Color by this field or Format cells… in a
      column header's menu.*
- [ ] The row rule `{ status: "failed" }` red reads, on its line, a swatch named *Red*, **Row** and `{ status: "failed"
      }`, and its tooltip *The row when the document matches { status: "failed" }*.
- [ ] A condition longer than the line ends with `…`, and its tooltip has it whole.
- [ ] With the focus on the first line, `Down` then `Enter` opens the second rule; `Esc` closes it and the focus is on
      its line again.
- [ ] The view passes the accessibility check of the UI tests in both themes, with a rule open (R10.5); every swatch
      and every checkbox has a name a screen reader says.
- [ ] Narrowed to 240 px, the island shows every line without a horizontal scroll bar (R10.9).

### `table.add-format-rule` — Add a condition rule

Adds a rule that colors the rows, or one field's cells, of the documents matching a condition.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/table/add-format-rule.ts › plan(context, answers)`
- **Entry points**: **Add rule…** › **Condition…** in the head of the Formatting view (`@inspector`); **Format
  cells…** in the menu of a column header (`@column-menu`), with the tooltip *Color the cells of \<field\> when the
  document matches a condition*; Go to, **Add formatting rule…**, and **Format cells…** on the column of the selected
  cell.
- **Offered when**: the Documents section of a collection tab is shown, in **Find** and in **Aggregate**, on a
  collection, a view or a time series collection, through any connection. **Format cells…** on every column but the
  row number.
- **Asks**: nothing in a dialog. The Formatting view is shown (`nav.toggle-inspector`), with the new rule open last
  in the collection's rules and the focus in **When the document matches**:
  - **Color the cell of**: empty, which colors the whole row; with **Format cells…**, the column's field (`items.qty`
    for a column of the elements of an expanded array);
  - **When the document matches**: empty; with **Format cells…**, `{ <field>: <the value of the selected cell> }`
    when a cell of that column is selected, the value as **Copy value** writes it (`table.copy-value`), else `{
    <field>: { $exists: true } }`;
  - the color: the first of the eleven presets, in their order, that no condition rule reaching the collection uses
    yet; red when all of them are used.
- **Plan**: one app step, as soon as the condition can be used: `save the formatting rules of Local / shop / orders`.
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone from the undo history: it changes how the table is shown, not a deployment. **Remove
  rule** takes it away.
- **After**: the table is colored by the rule at once, and the toolbar's count changes (`table.show`). A new rule
  whose condition is still empty, or cannot be used, is shown open with the reason under its condition and is not
  saved; it is dropped when another rule is opened or the view is left.
- **Refuses**: the 101st rule of the collection: *A collection keeps at most 100 formatting rules.* (`/too-many`), on
  the line at the top of the view; a condition that cannot be used (`/condition`), with the message of
  `table.format-table` under it.
- **Commands**: `table.add-format-rule`, `table.add-format-rule:cells`
- **Uses**: `table.formatting`, `table.edit-format-rule`, `table.format-table`, `table.match`, `table.copy-value`,
  `query.format`, `nav.toggle-inspector`.
- **Ported from**: query.format-rules (Mongoster 0.9.0 and 0.10.0; `src/webview/formatting.ts ›
  FormattingPaneUi.addCondition`, `unusedColor`; `src/webview/main.ts › showColumnMenu`, `Format Cells…`).

Acceptance:

- [ ] **Format cells…** on `status`, with the cell `"failed"` of a row selected and no rule yet, shows the Formatting
      view with a new rule open: the cell of `status`, `{ status: "failed" }`, red; the `status` of every failed order
      is red at once.
- [ ] **Format cells…** on `amount` with a cell of another column selected proposes `{ amount: { $exists: true } }`.
- [ ] **Format cells…** on `address.city`, with Ada's `"Milano"` selected, proposes `{ "address.city": "Milano" }`;
      on a column `n` with the `Int64` 1204 selected, `{ n: NumberLong(1204) }`.
- [ ] **Add rule…** › **Condition…** with the rules red and orange already there opens a row rule in yellow with an
      empty condition, which is saved only once `{ a: 1 }` is typed; opening another rule before that adds nothing.
- [ ] With the inspector island hidden, **Format cells…** shows the island on the Formatting view, and the island
      stays shown afterwards.
- [ ] It is offered and works on a view, through a read-only connection and in **Aggregate**, and writes nothing to
      the deployment.
- [ ] With 100 rules in `shop.orders`, **Format cells…** adds none and the view reads *A collection keeps at most 100
      formatting rules.*

### `table.edit-format-rule` — Edit, name, turn off, reorder and remove formatting rules

Changes the rules in the Formatting view, in place, while the table shows what each change does.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/table/edit-format-rule.ts › plan(context, answers)`
- **Entry points**: in the Formatting view (`@inspector`): on a rule's line, its checkbox, its handle dragged to
  another place of its section, `Alt+Up` and `Alt+Down`, **Move up**, **Move down** and **Remove** in its `…` menu,
  **Remove rule** (`✕`); in the open rule, **Name** (`F2` on the line goes to it) and, for a condition rule, **Color
  the cell of**, **When the document matches** and the eleven colors; the checkbox of a section.
- **Offered when**: as `table.formatting`.
- **Asks**: nothing: every change is made in place. The open condition rule shows, from the top:
  - **Name**, with the placeholder of its condition (or *Name*) and the tooltip *A name for the rule, shown in place of
    its condition or field*; 200 characters at most;
  - **Color the cell of**, a field, with the tooltip *The field whose cell is colored; empty: the document's whole
    row*; the columns of the page are offered as it is typed;
  - **When the document matches**, the condition, in the editor with the colors of `query.highlight` and the
    suggestions of `query.autocomplete`, with the placeholder *{ status: "failed" } — a filter, as in the query bar*;
    under it, why it cannot be used, when it cannot;
  - **Color**: the eleven presets as swatches, each a button named by its color, the rule's own marked.
- **Plan**: one app step for each change: `save the formatting rules of Local / shop / orders`, or for the
  section that changed, `save the formatting rules of the database Local / shop`, `… of the connection Local` or
  `save the formatting rules for everywhere`, and for a section's checkbox `leave the rules of the database shop out of
  Local / shop / orders` or `color Local / shop / orders by the rules of the database shop again`. Text typed is saved
  when the user stops typing for 1 second *(Datardo's choice)*, leaves the box, or presses `Enter` in a box of one
  line; the table follows at each key.
- **Danger**: None. **Remove rule** asks nothing: turning a rule off is the way to keep it aside.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone from the undo history: it changes how the table is shown, not a deployment. A removed
  rule is made again.
- **After**: the table is colored again at once, as are the other open tabs the changed rules reach; the legends
  follow; the toolbar's count changes (`table.show`).
- **Refuses**: a condition that does not parse (*Invalid syntax: …*) or that `table.match` refuses (its message),
  shown under it while it is typed: the rule keeps its last condition that can be used, and colors by it
  (`/condition`); a field that starts with `$`: the box is outlined and the rule unchanged (`/field`).
- **Uses**: `table.formatting`, `table.format-table`, `table.match`, `query.parse`, `query.highlight`,
  `query.autocomplete`, `table.format-scopes`.
- **Ported from**: query.format-rules (Mongoster 0.9.0 and 0.10.0; `src/webview/formatting.ts ›
  FormattingPaneUi`, `src/shared/formatting.ts › conditionError`, `ruleSummary`, `moveRule` within a scope,
  `readScopesOff`). Saving a second after the last key, and the keys that move a rule, are *New in Datardo*:
  Mongoster stores at each key and moves only by dragging.

Acceptance:

- [ ] Typing `{ status: "failed" }` in a new row rule colors the failed orders as soon as the closing brace is typed;
      while it reads `{ status: ` the message *Invalid syntax: …* is under it, and an existing rule meanwhile still
      colors by its last condition.
- [ ] A rule named `Failed payments` with `F2` shows *Failed payments* on its line in place of its condition, and its
      tooltip has both.
- [ ] Unticking a rule takes its color off the table; the rule stays in the list, also after a restart.
- [ ] Dragging the third rule above the first makes it the first, and it wins over the others where both match;
      `Alt+Up` on the first rule changes nothing.
- [ ] **Remove rule** removes the rule at once without asking.
- [ ] The condition `{ a: { $where: 1 } }` reads *$where is not supported in a formatting rule.*; an empty one reads
      *Type a condition, such as { status: "failed" }.*
- [ ] **Color the cell of** `$a` outlines the box and leaves the rule as it was.
- [ ] Changing the color of a rule to **Teal** recolors its rows at once and is saved: after a restart it is teal.
- [ ] The rules of `shop.orders` on Local are not those of `shop.orders` on another connection; after **Rename
      collection…** to `orders_2024` from Datardo they are those of `shop.orders_2024` (`manage.rename-collection`);
      after **Drop…** from Datardo, a new `shop.orders` has none (`manage.drop-collection`).

### `table.toggle-formatting` — Hide and show formatting

Shows every table without its colors, and back, without changing a rule.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/table/toggle-formatting.ts › plan(context, answers)`
- **Entry points**: **Hide formatting** or **Show formatting** in the head of the Formatting view (`@inspector`), with
  the tooltip *Show the tables without colors; the rules stay as they are* or *Color the tables again by the rules*;
  Go to, **Hide formatting** while formatting is shown and **Show formatting** while it is hidden.
- **Offered when**: from the Formatting view; from Go to, while the active tab is a collection tab.
- **Plan**: one app step: `hide formatting` or `show formatting`.
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone from the undo history: it changes how the tables are shown, not a deployment. The same
  button puts it back.
- **After**: every table of every collection tab is drawn without colors, or colored again; the toolbar's button reads
  **Formatting (off)** while formatting is hidden (`table.show`). The choice is for every tab and is remembered across
  starts.
- **Commands**: `table.toggle-formatting`
- **Uses**: `table.format-table`, `table.formatting`, `table.show`.
- **Ported from**: Mongoster 0.10.0 (`Hide Formatting`; proposal 0003, its open question 1 settled for
  every tab; `src/webview/formatting.ts`, the `formattingEye`; `src/shared/formatting.ts › readFormattingPane`,
  `hidden`).

Acceptance:

- [ ] **Hide formatting** takes every color off the table of `shop.orders` and of another open collection tab; the
      rules are listed as they were, the head reads **Show formatting** and the toolbar **Formatting (off)**.
- [ ] Formatting hidden before a quit is hidden after the restart.
- [ ] A rule added while formatting is hidden colors nothing until **Show formatting**.
- [ ] It works on a view and through a read-only connection.

### `table.format-field` — The color a field rule gives a value

Which color a value of the field gets from a field rule, and what the rule's legend shows for a page.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/table/format-field.ts › colorOfValue(rule, page, value)`, where `page` is `›
  fieldOnPage(rule, documents)`, and `› legendOfRule(rule, documents)`
- **Uses**: `query.format`.
- **Ported from**: query.format-field (Mongoster 0.10.0, proposal 0003; `src/shared/formatField.ts ›
  fieldPaint`, `fieldMode`, `resolveField`, `paletteOf`, `fieldLegend`, `valuesOf`). Knowing a value by the text of
  `query.format`, with its type, *differs from Mongoster*, whose text of `5` and of `NumberLong(5)` is the same.

Rules of the result:

- The inputs are a field rule (its field, its mode `auto`, `boolean`, `scale` or `values`, and what each mode keeps),
  the documents of the page as the table holds them, and a value. The result is a color with its strength, or none.
- **The values of the field**: the path goes through sub-documents and through arrays of sub-documents, one value per
  element, as the table shows them once the array is expanded; missing and `null` are left out. An array that is the
  field's value is one value.
- **`auto`** is decided from the values of the page: all booleans give `boolean`; all numbers (`Int32`, `Int64`,
  `Double`, `Decimal128` in any mix), or all dates, give `scale`; anything else, a mix, or no value gives `values`.
- A missing or `null` value gets no color in any mode, nor does a value of another type than the mode's (a string
  under a scale, a number under `boolean`).
- **`boolean`**: `true` green and `false` red, at strength 0.6; swapped when the rule's scale is `{ from: "green", to:
  "red" }`.
- **`scale`**: the value's place between the rule's two ends, a date as its milliseconds, an `Int64` and a
  `Decimal128` as JavaScript numbers; a value outside the ends gets the nearer end's color. With one color (`scale.to`,
  blue when the rule has none), that color from strength 0 to 1; with `scale.from` too, from `from` to yellow over the
  first half and from yellow to `to` over the second, at strength 0.6. An end the rule does not have is the smallest or
  the largest value of the page; with no value, no color. Ends that are equal give every value the strong end.
- **`values`**: a value is known by its text, as `query.format` writes it on one line (`"home"`, `42`,
  `NumberLong(42)`, `ObjectId("…")`): so `5` and `NumberLong(5)` are two values. A pinned value gets its pinned color at
  strength 1, with an outline when that color is the palette's own. Any other value gets the color at the place `hash
  mod n` of the palette, where `hash` is FNV-1a of 32 bits over the UTF-16 code units of the text and `n` the number
  of colors of the palette: the same value has the same color on every page, in every collection, for every user of
  the same rule, and in Mongoster for a value whose text it writes alike.
- **The palette** `all` is the ten presets other than gray (which reads as no color), in the order red, orange,
  yellow, green, blue, purple, pink, teal, indigo, brown, less the colors that pinned values use, all ten when every
  one is used. The palette of one color is five shades of it, at the strengths 0.1, 0.325, 0.55, 0.775 and 1.
- **The legend** of a page: for `values`, the pinned values first, in their order, also when the page has none of them,
  then the page's values by how many rows have each, the most first and then by their text, each with its color and
  its count, at most 60 *(as in Mongoster)* (the others are still colored), with the number of colors the values that
  are not pinned share; for `boolean`, `true` then `false` with their counts; for `scale`, the two ends and whether
  they are dates. When the page has more values that are not pinned than the palette has colors, the legend says
  *\<field\> has \<n\> values on this page: the colors repeat.*

Acceptance:

- [ ] `auto` is `boolean` for `true` and `false`; `scale` for `1`, `NumberLong(5)` and `NumberDecimal("2.5")`, and
      for two dates; `values` for a number with a date, for a string with a number, and for no value.
- [ ] With the ends 0 and 200 and the color orange, 50 is orange at strength 0.25, 900 at 1, −5 at 0, and a string
      gets nothing.
- [ ] From red to green between 0 and 100, 25 is red half-way to yellow and 100 is green.
- [ ] A rule on `n` without ends, on a page with 10, 30, `null` and a document without `n`, is a scale from 10 to 30;
      with the ends 0 and 100 in the rule, from 0 to 100.
- [ ] With `"home"` pinned to green, `"home"` is green and none of 200 other values is.
- [ ] With the palette of gray, the other values are shades of gray and a pinned value keeps its color; pinned to
      gray, it is outlined.
- [ ] The legend of a rule on `status` with `"gone"` pinned, on `"ok"`, `"ok"`, `"failed"` and a document without
      `status`, is `"gone"` (0, pinned), `"ok"` (2), `"failed"` (1), with nine colors for the values that are not
      pinned.
- [ ] The values `5` and `NumberLong(5)` are two entries of a legend, each with its own color.
- [ ] The text `"failed"` gets the same color in two collections and on two pages.

### `table.color-by-field` — Color by this field

Adds a field rule that colors the table by the values of one field, with no condition to write.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/table/color-by-field.ts › plan(context, answers)`
- **Entry points**: **Color by this field** in the menu of a column header (`@column-menu`), with the tooltip *Color
  the table by the values of \<field\>: true and false, a scale for numbers and dates, a color per value*; **Add
  rule…** › **By field…** in the head of the Formatting view (`@inspector`); Go to, **Color by this field**, on the
  column of the selected cell.
- **Offered when**: as `table.add-format-rule`; **Color by this field** on every column but the row number.
- **Asks**: nothing. A field rule in `auto` is added last to the collection's rules and shown open in the Formatting
  view (`nav.toggle-inspector`): with **Color by this field**, for that column's field; with **By field…**, with an
  empty **Field** that has the focus. The first field rule of the collection's rules colors the row, the next ones
  their cell; a scale takes its two ends from the page.
- **Plan**: one app step, once the rule has a field: `save the formatting rules of Local / shop / orders`.
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone from the undo history: it changes how the table is shown, not a deployment. **Remove
  rule** takes it away.
- **After**: the table is colored by the rule at once; the rule's legend lists the page's values with their colors.
- **Refuses**: the 101st rule of the collection: *A collection keeps at most 100 formatting rules.* (`/too-many`); a
  rule of **By field…** whose field is empty or starts with `$` is not saved: the box is outlined (`/field`).
- **Commands**: `table.color-by-field`
- **Uses**: `table.formatting`, `table.edit-field-rule`, `table.format-field`, `table.format-table`,
  `nav.toggle-inspector`.
- **Ported from**: query.format-rules, `Color by This Field` and `By Field…` (Mongoster 0.10.0, proposal
  0003; `src/webview/formatting.ts › FormattingPaneUi.addField`, `withEnds`; `src/webview/main.ts ›
  showColumnMenu`).

Acceptance:

- [ ] **Color by this field** on `status`, on a page of `"ok"` and `"failed"` orders and one without `status`, adds
      the row rule `by status` in **Automatic (A color per value)**: the ok rows and the failed rows take two colors of
      the ten, and the row without `status` none. Nothing is asked.
- [ ] **Color by this field** on `amount` next adds a cell rule: the amounts are a scale of blue between the smallest
      and the largest of the page, which the rule keeps as its ends.
- [ ] With the row rules `by status` then `{ n: 2 }` purple, `{ status: "ok", n: 1 }` takes the color of `"ok"` and `{
      n: 2 }` is purple; with the cell rules of `status` `{ status: "failed" }` red then `by status`, a failed order's
      `status` is red.
- [ ] For `{ items: [ { qty: 0 }, { qty: 10 } ] }`, `items` expanded, and the cell rule `by items.qty`, the element 0
      is at the faint end of the scale and the element 1 at the strong end.
- [ ] **Color by this field** on `flag`, whose values are `true` and `false`, colors `true` green and `false` red.
- [ ] **By field…** with the **Field** left empty adds nothing once another rule is opened.

### `table.edit-field-rule` — Edit a field rule

Chooses what a field rule colors and how: the row or the cell, the kind of coloring, the scale's colors and ends, the
values pinned to a color and the palette of the others.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/table/edit-field-rule.ts › plan(context, answers)`
- **Entry points**: in an open field rule of the Formatting view (`@inspector`): **Field**, **Color**, **As**, **Swap
  colors**, **Scale** and its color, the two ends, **From this page**, **Palette**, the swatch of a value in the
  legend, **Unpin**, **Pin a value…**.
- **Offered when**: as `table.formatting`, on a field rule.
- **Asks**: nothing: every change is made in place. The open field rule shows, from the top, after **Name**
  (`table.edit-format-rule`):
  - **Field**, with the tooltip *The field whose values choose the color*; the columns of the page are offered;
  - **Color**: **The cell** or **The whole row** (*What the value colors*);
  - **As**: **Automatic (\<what it chose\>)**, **A color per value**, **A scale, for numbers and dates**, **True and
    false** (*How the values are colored; Automatic decides from the values of the page*);
  - for true and false: **Swap colors** (*True and false exchange their colors*);
  - for a scale: **Scale**: **One color, stronger as the value grows**, **Red to green**, **Green to red**; for one
    color, the eleven swatches; the two ends, in mongosh syntax (`0`, `ISODate("2024-01-01T00:00:00Z")`), with the
    tooltips *The value that gets the first color; smaller values get it too. Empty: the smallest of each page* and
    *The value that gets the last color; larger values get it too. Empty: the largest of each page*; **From this
    page**, which sets both to the smallest and the largest value of the page;
  - for a color per value: **Palette** (*Where the values that are not pinned take their colors*): **All colors**,
    **Shades of gray**, **Shades of red** and so on for each of the ten others;
  - the legend (`table.format-field`): each value with its swatch, its count and, when pinned, a pin mark (*Pinned*)
    and **Unpin** (*The value takes a color of the palette again*); a swatch (*Pin this value to a color*, or *Pinned
    to this color: choose another, or unpin*) opens the eleven presets; **Pin a value…**, a box (*A value in mongosh
    syntax to give a color of its own (Enter); the page need not show it*); for a scale, its bar with the two ends;
    *No \<field\> on this page.* when the page has no value of it.
- **Plan**: one app step for each change: `save the formatting rules of Local / shop / orders`, or of the section the
  rule is in (`table.edit-format-rule`).
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone from the undo history: it changes how the table is shown, not a deployment.
- **After**: the table and the legend change at once.
- **Refuses**: a field that is empty or starts with `$` (`/field`), and an end that is not a number or a date
  (`/end`): the box is outlined and the rule unchanged; a value of **Pin a value…** that `query.parse` cannot read,
  with *Invalid syntax: …* under it (`/value`); the 101st pinned value of a rule: *A rule keeps at most 100 pinned
  values.* (`/too-many-pins`) *(the message is Datardo's choice; the limit is Mongoster's)*.
- **Uses**: `table.format-field`, `table.format-table`, `table.formatting`, `table.edit-format-rule`, `query.parse`,
  `query.format`.
- **Ported from**: query.format-rules, the field rule's part (Mongoster 0.10.0, proposal 0003;
  `src/webview/formatting.ts › FormattingPaneUi`, the legend and `Pin a Value…`; `src/shared/formatting.ts ›
  MAX_PINNED`).

Acceptance:

- [ ] **Swap colors** on a rule of `flag` makes `true` red and `false` green.
- [ ] On a scale of `amount` with the ends 0 and 200, **From this page** on a page whose amounts go from 12 to 480
      sets the ends to 12 and 480; the ends stay when the next page has other amounts.
- [ ] The end `abc` outlines its box and leaves the ends as they were; `ISODate("2024-01-01T00:00:00Z")` is taken on
      a scale of dates.
- [ ] A click on the swatch of `"failed"` in the legend, then **Red**, pins `"failed"` to red: it moves to the top of
      the legend with the pin mark, and no other value is red. **Unpin** gives it a color of the palette again.
- [ ] **Pin a value…** `"gone"` with `Enter` adds `"gone"` to the legend with the count 0.
- [ ] **Palette** › **Shades of blue** colors the values that are not pinned in shades of blue.
- [ ] **Color** › **The whole row** colors the rows by the value instead of the cell.

### `table.format-scopes` — The rules a collection tab uses

Which formatting rules color a collection's table, from the four formatting scopes, and in which order they are
tried.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/table/format-scopes.ts › rulesInOrder(rules, collection)`; which tabs a change reaches,
  `› scopeReaches(place, collection)`; what follows what, `› withoutConnection`, `› withoutDatabase`, `›
  withoutCollection` and `› withRenamedCollection`
- **Uses**: `table.format-table`.
- **Ported from**: query.format-rules and query.format-table, scopes (Mongoster 0.10.0, proposal 0003;
  `src/shared/formatting.ts › rulesInOrder`, `scopeOfRule`, `readScopesOff`; `src/formattingStore.ts ›
  readFormatting`, `scopeReaches`, `removeConnectionFormatting`). Removing every rule of a connection with it, its
  collections' own too, and the rules of a collection or a database going with a drop made from Datardo *differ from
  Mongoster*, which keeps them.

Rules of the result:

- The inputs are every formatting rule Datardo keeps, by scope, and a collection: its connection, its database and its
  name. The result is its rules in the order they are tried, each with its scope, and the scopes it leaves out.
- **The four scopes**, from the nearest: **This collection** (the rules of that collection of that connection),
  **Database \<name\>** (every collection of that database of that connection), **Connection \<name\>** (every
  collection of that connection), **Everywhere** (every collection of every MongoDB connection). A connection is
  known by its id, so renaming it keeps its rules.
- The rules are tried scope by scope, the nearest first, each list in its order: a rule for one collection wins over
  a rule for everywhere, as a collection's color wins over its connection's (`tree.color-of`).
- A collection may leave out the rules of any of its four scopes, its own included (a section's checkbox,
  `table.edit-format-rule`): a rule for everywhere that does not suit one collection is left out of that collection
  alone. What a collection leaves out is kept with it.
- A rule whose id was seen in a nearer scope is left out.
- A scope keeps at most 100 rules *(as in Mongoster)*.
- **Which tabs a change reaches**: a change to a collection's rules reaches the tabs of that collection; to a
  database's, the tabs of every collection of that database on that connection; to a connection's, every collection
  tab of that connection; to everywhere's, every collection tab.
- **What follows what**, which other features do with these rules:
  - **Rename collection…** made from Datardo moves the collection's rules and what it leaves out to the new name
    (`manage.rename-collection`).
  - **Drop…** of a collection or a view made from Datardo removes its rules and what it leaves out
    (`manage.drop-collection`); **Drop database…** removes the database's rules and those of its collections
    (`manage.drop-database`). A collection or a database dropped or renamed elsewhere keeps its rules: a collection
    made again with that name finds them.
  - **Remove** of a connection removes the rules of the connection, of its databases and of its collections
    (`connection.remove`).

Acceptance:

- [ ] With rules for `Local / shop / orders`, for the database `Local / shop`, for the connection Local and for
      everywhere, the table of `shop.orders` on Local tries them in that order; that of `shop.customers` on Local, all
      but the first; that of `shop.orders` on another connection, those for everywhere only.
- [ ] With a row rule `{}` in each scope, the collection's colors the row; with **This collection** left out, the
      database's does.
- [ ] Leaving **Everywhere** out of `shop.orders` keeps it in `shop.customers`.
- [ ] A change to the database's rules colors again an open tab of `shop.customers` and not one of `crm.leads`; a
      change to everywhere's colors again every collection tab.
- [ ] Removing the connection Local removes its rules, its databases' and its collections', and keeps the rules for
      everywhere.
- [ ] After **Drop database…** of `shop` from Datardo, a new `shop.orders` has no rule of its own and no rule of the
      database; a collection dropped from mongosh keeps its rules.

### `table.move-format-rule` — Move or copy a rule to another section

Makes a rule apply to a whole database, a whole connection or everywhere, or to one collection again, so that a rule
on `status` or `deleted` is written once.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/table/move-format-rule.ts › plan(context, answers)`
- **Entry points**: in the Formatting view (`@inspector`): a rule's line dragged into another section, before or
  after one of its rules or on its head; `…` on a rule › **Move to** (*The rule leaves this scope for another*) or
  **Copy to** (*A copy of the rule in another scope*) › **This collection**, **This database**, **This connection**,
  **Everywhere**, without the rule's own section in **Move to**.
- **Offered when**: as `table.formatting`.
- **Plan**: one app step: `move a formatting rule from Local / shop / orders to the database Local / shop`, or `copy a
  formatting rule from Local / shop / orders to everywhere`; it saves the two sections that change.
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone from the undo history: it changes how the tables are shown, not a deployment. Moving it
  back puts it back.
- **After**: a moved rule leaves its section and keeps its id; a copy gets a new id and the first stays where it was.
  Either goes beside the rule it is dropped on, or last. Every open tab the two sections reach is colored again.
- **Refuses**: a section that has 100 rules: *\<section\> keeps at most 100 formatting rules.* (`/too-many`), with the
  section's name (*Everywhere keeps at most 100 formatting rules.*), on the line at the top of the view; a rule moved
  within its own section is reordered (`table.edit-format-rule`), which no limit refuses.
- **Uses**: `table.format-scopes`, `table.formatting`, `table.edit-format-rule`.
- **Ported from**: query.format-rules, moving between scopes (Mongoster 0.10.0, proposal 0003;
  `src/shared/formatting.ts › moveRule`, `SCOPE_FULL`; `src/webview/formatting.ts`, `Move To ▸`, `Copy To ▸`).

Acceptance:

- [ ] Moving the collection's rule `a` of the rules `a`, `b` to everywhere, whose rules are `g`, leaves the
      collection `b` and makes everywhere `g`, `a`; dropped before `g`, `a`, `g`.
- [ ] **Copy to** › **This connection** leaves the collection's rules as they were and adds a rule with a new id to the
      connection's.
- [ ] Moving a rule to **Everywhere** colors at once the open tab of another collection that has its field.
- [ ] Moving into a section that has 100 rules is refused with its message; reordering within it is not.

### `table.export-formatting` — Export formatting rules to a file

Writes formatting rules to a file, to pass them to someone else; nothing of the connection is in it.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/table/export-formatting.ts › plan(context, answers)`
- **Entry points**: `…` in the head of the Formatting view › **Export formatting…** (`@inspector`), with the tooltip
  *Write formatting rules to a file, to share them; nothing of the connection is in it*; Go to, **Export
  formatting…**, for the collection of the active tab.
- **Offered when**: the active tab is a collection tab; also on a view and through a read-only connection.
- **Asks**: 1. **Export formatting**, a list to pick several from, with the placeholder **Choose the rules to
  export**: the scopes that reach the collection and have rules, **Collection \<name\>**, **Database \<name\>**,
  **Connection \<name\>**, **Everywhere**, each described by its number of rules, all checked; 2. where to save, in the
  system's file dialog titled **Export formatting** with the button **Export**, filtered to **Formatting rules
  (JSON)**, proposing `<collection>.datardo-formatting.json` in the home folder, with every character of the
  collection's name other than a letter, a digit, `.`, `-` or `_` written `_`.
- **Reads**: the rules of the chosen scopes, from Datardo's data.
- **Plan**: `write <path of the file>`, a file step whose content `table.formatting-file` gives.
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Nothing to undo in Datardo; the file is written where the user chose, replacing a file of that name.
- **After**: a notification says *\<n\> rules exported to \<file name\>. The file has nothing of the connection: no
  name, no address, no password.*
- **Refuses**: no rule in any scope that reaches the collection: *There are no formatting rules to export.*
  (`/no-rules`); a file that cannot be written: *The formatting rules could not be exported: \<reason\>*.
- **Commands**: `table.export-formatting`
- **Uses**: `table.formatting-file`, `table.format-scopes`, `runner.ask`, `runner.notify`.
- **Ported from**: query.format-transfer (Mongoster 0.10.0, proposal 0003; `src/formattingTransfer.ts ›
  exportFormatting`). `Export All Formatting…`, which Mongoster's proposal left out, is not offered either.

Acceptance:

- [ ] Dismissing either question writes nothing.
- [ ] With rules in `shop.orders`, in `shop` and everywhere, the list offers **Collection orders** (2 rules),
      **Database shop** and **Everywhere**, all checked, and no **Connection Local**.
- [ ] The file exported from `shop.orders` is proposed as `orders.datardo-formatting.json`; from `my orders/2024` as
      `my_orders_2024.datardo-formatting.json`.
- [ ] The file has no connection id, no connection name, no host and no secret; the names `shop` and `orders` are in
      it.
- [ ] With no rule anywhere, **Export formatting…** says *There are no formatting rules to export.* and asks nothing.

### `table.import-formatting` — Import formatting rules from a file

Adds the formatting rules of a file to the user's own, where the user chooses; nothing is replaced.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/table/import-formatting.ts › plan(context, answers)`
- **Entry points**: `…` in the head of the Formatting view › **Import formatting…** (`@inspector`), with the tooltip
  *Add the formatting rules of a file to the ones already here*; Go to, **Import formatting…**, for the collection of
  the active tab.
- **Offered when**: as `table.export-formatting`.
- **Asks**: 1. the file, in the system's file dialog titled **Import formatting** with the button **Import**, filtered
  to **Formatting rules (JSON)** or all files; 2. **Import formatting**, a list to pick several from, with the
  placeholder **Choose the rules to import**: the file's groups, **Everywhere**, **A connection**, **Database
  \<name\>** (or **A database**), **Collection \<database\>.\<collection\>** (or **A collection**), each described by
  its number of rules, all checked; 3. a list to pick one from, with the placeholder **Where do the rules go? They are
  added after the ones already there**: **The same scopes** (*into orders, shop, Local and everywhere, each group in
  its own*: the tab's collection, database and connection, whatever names the file has), **All into collection
  orders**, **All into database shop**, **All into connection Local**, **All into everywhere**.
- **Reads**: the file, in the main process, 1 MB at most (`table.formatting-file`); the rules already in the scopes it
  goes into.
- **Plan**: one app step for each scope that gets rules: `add 3 formatting rules to Local / shop / orders`, `add 2
  formatting rules to everywhere`.
- **Danger**: None: an import adds rules after the ones already there, each with a new id, and replaces none.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone from the undo history; an imported rule is removed in the Formatting view.
- **After**: a notification says *Imported \<n\> formatting rules, \<m\> were already there.*, followed by *\<k\> rules
  could not be read.* and *\<j\> rules did not fit: a scope keeps at most 100.* when so; every open tab the scopes reach
  is colored again.
- **Refuses**: what `table.formatting-file` refuses, with its message: a file over 1 MB (`/too-large`), not JSON
  (`/not-json`), not a file of formatting rules (`/not-formatting`), of a later version (`/newer`); a file without a
  rule that can be used: *The file has no formatting rules.*, or *The file has no formatting rule that can be read
  (\<k\> could not).* (`/empty`); a file that cannot be read: *The file could not be read: \<reason\>*
  (`/unreadable`).
- **Commands**: `table.import-formatting`
- **Uses**: `table.formatting-file`, `table.format-scopes`, `runner.ask`, `runner.notify`.
- **Ported from**: query.format-transfer (Mongoster 0.10.0, proposal 0003; `src/formattingTransfer.ts ›
  importFormatting`; `src/shared/formattingFile.ts › mergeImport`, `groupLabel`, `importSummary`).

Acceptance:

- [ ] Importing three rules into a scope where one of them already is (equal but for its id) adds two with new ids
      after the existing ones and says *Imported 2 formatting rules, 1 was already there.*; importing the same file
      again adds none.
- [ ] Importing two rules into a scope that has 99 adds one and says *1 rule did not fit: a scope keeps at most 100.*
- [ ] **The same scopes** puts a file's group `collection` of `crm.leads` into the rules of the tab's `shop.orders`,
      and its group `database` into those of `shop`.
- [ ] **All into everywhere** puts every chosen group into the rules for everywhere.
- [ ] A file exported by Mongoster (`.mongoster-formatting.json`) is imported like one of Datardo's.
- [ ] Dismissing any question adds nothing.

### `table.formatting-file` — The file of formatting rules

What a `.datardo-formatting.json` file holds, how it is written, and how it is read back without trusting it; and how
the rules of a file are added to the rules of a scope.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/table/formatting-file.ts › formattingFileText(rules, scopes, place)`,
  `› groupsOfFormattingFile(text)` and `› rulesWithImported(existing, incoming, newId)`; the rules themselves are read
  by `src/shared/formatting-rules.ts › readFormatRules(value)`, which `src/storage` can use too
- **Uses**: `table.format-scopes`.
- **Ported from**: query.format-transfer (Mongoster 0.10.0, proposal 0003; `src/shared/formattingFile.ts ›
  formattingFile`, `readFormattingFile`, `mergeImport`; `src/shared/formatting.ts › readFormatRules`). The name of
  the version's property, `datardoFormatting`, and reading Mongoster's files too are *Datardo's choice*.

Rules of the result:

- **Written**: JSON indented by two spaces, ending with a line break:

  ```json
  {
    "datardoFormatting": 1,
    "groups": [
      { "scope": "global", "rules": [ … ] },
      { "scope": "connection", "rules": [ … ] },
      { "scope": "database", "database": "shop", "rules": [ … ] },
      { "scope": "collection", "database": "shop", "collection": "orders", "rules": [ … ] }
    ]
  }
  ```

  one group for each chosen scope that has rules, the widest first. Nothing of the connection is written: no id, no
  name, no host. The names of the database and the collection are, to say where the rules came from.
- **A rule**, in the file as in Datardo's data: a condition rule `{ id, condition, field?, color, name?, enabled? }`;
  a field rule `{ id, kind: "field", field, target, mode, min?, max?, scale?, pinned?, palette?, name?, enabled? }`,
  where `target` is `row` or `cell`, `mode` is `auto`, `boolean`, `scale` or `values`, `scale` is `{ from?, to }`,
  `pinned` a list of `{ value, color }` with the value's text, `palette` `all` or a preset; `color`, `from`, `to` are
  preset names; `enabled` is written only as `false`. This is Mongoster's form, so either reads the other's rules.
- **Read**: a text over 1 MB is refused: *The file is larger than 1 MB: it is not a file of formatting rules.*; one
  that is not JSON: *The file is not JSON: \<the parser's message\>*; one that is not an object with a number
  `datardoFormatting`, or Mongoster's `mongosterFormatting`, and a list `groups`: *The file is not a file of
  formatting rules exported from Datardo or Mongoster.*; a version above 1: *The file was exported by a newer Datardo:
  update Datardo to import it.*
- Each group of a known scope keeps the rules it can use, and the others are counted: a condition rule needs a string
  id, a string condition and a known color; a field rule a string id and a field that is not empty, its target and
  mode taking `cell` and `auto` when unknown, and what can be used of its ends (numbers), its scale (known colors), its
  pinned values (a string value and a known color, each value once, 100 at most) and its palette. An id seen already,
  a kind that is neither, and every property not named above are dropped; a name is trimmed and cut at 200
  characters; a group keeps at most 100 rules; the names of a database and a collection are cut at 200 characters. A
  group of an unknown scope is dropped with its rules, counted.
- Nothing in the file is run: a condition stays text, read by `query.parse` and matched by `table.match` when a table
  is drawn, which has no `$where` and runs a regular expression on the page shown only.
- **Added to a scope**: the rules of a group go after the rules already there, each with a new id; a rule equal to one
  already there, all but its id, is skipped and counted as already there; past 100 rules, the rest are counted as not
  fitting. Nothing is replaced.
- The rules of `formatting.json`, Datardo's own file, are read with the same rules
  (`src/shared/formatting-rules.ts › readStoredFormatting(value)`).

Acceptance:

- [ ] The file of a collection with rules in the collection, the database and everywhere has the groups `global`,
      `database` with the database's name, and `collection` with both names, in that order, and is read back as
      written.
- [ ] From a group with a rule that can be used (with an unknown property), a rule without a condition and a string,
      the first is kept without the property and two are counted as could not be read; a group of the scope `table`
      is dropped with its rules, counted.
- [ ] `[]`, an object without `datardoFormatting`, a version 2 and a text over 1 MB are each refused with their
      message.
- [ ] A file of Mongoster with `"mongosterFormatting": 1`, condition rules without `kind` and a field rule, is read
      with all its rules.
- [ ] A field rule with a scale, pinned values, a palette and a name is read back as written; one with an unknown
      target, mode, palette or scale color keeps its field with `cell` and `auto`.
- [ ] Adding three rules to a scope where one is equal but for its id adds two with new ids after the existing ones
      and counts one as already there.
