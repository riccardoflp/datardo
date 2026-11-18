# The query bar

The query bar of the Documents section of a collection tab: the filter, the sort, the projection, skip and limit,
typed in mongosh syntax and run with `find`; running and cancelling, the time limit and the errors of the server; the
query builder; the syntax colors and the autocomplete of the editors; dragging a field or a value into the bar; the
query a tab remembers; counting the matching documents. This area also holds the two functions every other area uses
to read and write MongoDB values as text: `query.parse` and `query.format`. The table under the bar is the
[table](table.md) area; the pipeline editor that takes the bar's place in Aggregate is the aggregate area's
`aggregate.show`; recent and saved queries are the saved-query area's.

Every card here reads and never writes to a deployment, so all of it works through a read-only connection and on a
view.

### `query.bar` — The query bar

The row of the Documents section where a query is typed and run: which documents, in which order, which of their
fields, and how many.

- **Kind**: View
- **Engine**: MongoDB
- **Function**: `src/features/query/bar.ts › view(state)`
- **Entry points**: the top of the Documents section of a collection tab, under its toolbar; its own controls are in
  the query bar (`@query-bar`). `Ctrl+F`, while the tab has the focus, moves it to **Filter**; Go to, **Focus
  filter**.
- **Offered when**: the active tab is a collection tab showing its Documents section, for a collection or a view,
  whatever the connection allows.
- **Commands**: `query.bar`
- **Uses**: `query.mode`, `query.run`, `query.reset`, `query.builder`, `query.highlight`, `query.autocomplete`,
  `query.drag`, `query.restore`, `aggregate.show`, `runner.cancel`.
- **Ported from**: `src/collectionPanel.ts › CollectionPanel.html` (the rows marked `find-only`),
  `src/webview/main.ts` (`run`, `autosize`, the keys of the inputs); README, **Filter / Sort / Project**. **Skip** and
  **Limit** as fields of their own are *New in Datardo*: Mongoster only has the page size and the page.

What it shows, from the left; on a narrow island the fields after **Filter** wrap to a second row:

1. The mode switch, **Find ▾**: a menu with **Find** (tooltip *Filter, sort and project documents*) and **Aggregate**
   (tooltip *Build an aggregation pipeline*). It starts `query.mode`.
2. **Filter**: an editor of several lines. Placeholder: `{ field: "value" }  —  or drag a cell / column here`. Empty
   means every document.
3. **Sort**: an editor of one line. Placeholder: `{ field: -1 }  —  or drag a column here`. Empty means the order the
   server returns.
4. **Project**: an editor of one line. Placeholder: `{ field: 1 }  —  or drag a column here`. Empty means every field.
5. **Skip**: a whole number, 0 or more. Placeholder: `0`. Empty means 0.
6. **Limit**: a whole number, 1 or more. Placeholder: *no limit*. Empty means every matching document, a page at a
   time.
7. **Builder** (tooltip *Build the filter from fields, operators and values*), which shows or hides `query.builder`
   under the bar; **Queries**, which opens the list of the recent and saved queries of the collection, the saved-query
   area's; **Reset** (tooltip *Clear filter, sort and projection*), which starts `query.reset`; and the run button,
   **Find** (tooltip *Run query (Ctrl+Enter)*), which starts `query.run`.

Under the bar: the builder when it is open, then the error line.

Acceptance:

- [ ] A collection tab opened for the first time shows **Find**, the five fields empty with the placeholders above,
      the builder closed, and no error line.
- [ ] **Filter**, **Sort** and **Project** are Datardo's editor: they color what is typed (`query.highlight`) and
      suggest fields, operators and values (`query.autocomplete`). **Skip** and **Limit** take digits only.
- [ ] **Filter** grows with its text up to 240 px high, then scrolls; **Sort** and **Project** stay one line and
      scroll sideways.
- [ ] `Ctrl+Enter` in any of the five fields runs the query. `Enter` runs it in **Sort**, **Project**, **Skip** and
      **Limit**, and adds a line in **Filter**. While the list of suggestions is open, `Enter` and `Tab` insert the
      suggestion instead.
- [ ] While a query runs, the run button reads **Cancel** and starts `runner.cancel`; when the query ends, by itself
      or cancelled, it reads **Find** again.
- [ ] A field whose text cannot be read is outlined as invalid when the query is run, and the outline goes as soon as
      its text is edited.
- [ ] The error line shows one message at a time, the last one, and is empty after a query that succeeds. A message of
      the server has **Details** and **Run again**, as the runner shows every error inside a page.
- [ ] In **Aggregate** the fields, **Builder** and **Reset** give way to the pipeline editor (`aggregate.show`); back
      in **Find** they hold the texts they had.
- [ ] On a read-only connection and on a view the bar is the same: nothing in it writes.
- [ ] `Ctrl+F` puts the cursor in **Filter** with its text selected. `Tab` goes through the controls in the order
      above, and each has a name a screen reader says: *Query mode*, *Filter*, *Sort*, *Project*, *Skip*, *Limit*,
      *Builder*, *Queries*, *Reset*, *Run query*.

### `query.mode` — Switch between Find and Aggregate

A collection tab queries its collection in one of two ways: a filter run with `find`, or an aggregation pipeline. The
switch changes which one the bar shows and the table follows.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/query/mode.ts › switchedMode(state, mode)`
- **Entry points**: the mode switch of the query bar (`@query-bar`); Go to, **Switch to Find** and **Switch to
  Aggregate**.
- **Offered when**: the active tab is a collection tab; the mode it is already in is ticked in the menu and does
  nothing.
- **Commands**: `query.mode:find`, `query.mode:aggregate`
- **Uses**: `query.run`, `aggregate.run`, `aggregate.show`, `query.restore`.
- **Ported from**: `src/webview/main.ts › setMode`. Mongoster's switch also has **Schema**, **Chart** and **Indexes**,
  which in Datardo are sections of the section bar.

Rules of the result:

- The input is the tab's state and the mode wanted, `find` or `aggregate`. The result is the same state with that
  mode, the first page, an empty error line and an empty selection; the texts of the bar and the stages of the
  pipeline are not touched.
- After the switch the query of the new mode runs at once: `query.run` in Find, `aggregate.run` in Aggregate.
- The mode is part of what the tab remembers (`query.restore`).

Acceptance:

- [ ] With the filter `{ status: "paid" }` in **Find**, switching to **Aggregate** shows the pipeline editor and the
      output of the pipeline; switching back shows `{ status: "paid" }` in **Filter** and runs it again from the first
      page.
- [ ] Switching mode on page 3 shows page 1 of the other mode.
- [ ] Switching mode clears the error line and ends the selection of rows.
- [ ] Choosing the mode the tab is already in sends nothing to the server.
- [ ] In **Aggregate** the table offers no writing of documents; they are offered again in **Find**.
- [ ] A tab closed in **Aggregate** is in **Aggregate** when it is restored at the next start.

### `query.run` — Run the query

Sends the filter, the sort and the projection of the bar to the server with `find` and shows one page of the result in
the table.

- **Kind**: Read
- **Engine**: MongoDB
- **Function**: `src/features/query/run.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: the run button of the query bar (`@query-bar`); `Ctrl+Enter` in a field of the bar, `Enter` in
  **Sort**, **Project**, **Skip**, **Limit** and in a row of the builder; Go to, **Run query**. It also runs by itself
  when a collection tab opens (`tab.open`, `tab.restore`), when the page or the page size changes, after
  `query.reset`, a drop into the bar, a click on a column header, and when another feature loads a query into the tab:
  a recent or saved query, `relation.follow`, `nav.open-on-another-connection`, the tool `open_query` of the MCP
  server (`mcp.tab-tools`).
- **Offered when**: the tab is in **Find**.
- **Reads**: the texts of the bar, each through `query.parse`; the page and the page size of the table, through
  `table.page-window`. The connection is connected first when it is not (`connection.connect`).
- **After**: the table shows the documents, each value with its BSON type (`table.show`); `query.count` fills in the
  total; the query is added to the recent queries of the collection (`saved-query.recent`) and kept as the tab's query
  (`query.restore`); the first time a tab shows documents, the references of its database are looked for in the
  background (`relation.detect`).
- **Refuses**: a field whose text is not valid mongosh syntax or is not an object, *Invalid query syntax — check the
  highlighted field.* (`/syntax`); a **Skip** that is not a whole number, 0 or more, *Skip must be a whole number, 0
  or more.* (`/skip`); a **Limit** that is not a whole number, 1 or more, *Limit must be a whole number, 1 or more, or
  empty.* (`/limit`). These are shown on the error line, not as notifications, and the fields at fault are outlined.
- **Commands**: `query.run`
- **Settings**: `datardo.query.timeLimitSeconds`: how long the server may work on one query before it stops it; 60 by
  default, which is Mongoster's fixed limit; from 1 to 3,600 *(Datardo's choice)*.
- **Uses**: `query.parse`, `query.count`, `table.page-window`, `table.show`, `runner.progress`, `runner.cancel`,
  `saved-query.recent`, `settings.read`.
- **Ported from**: `src/collectionPanel.ts › CollectionPanel.runQuery`, `src/queries.ts › toBson`,
  `src/webview/main.ts › run`, `isValidObject`. The setting is *New in Datardo*: Mongoster's limit is fixed at 60
  seconds. The documents reach the window with every BSON type kept, as canonical Extended JSON, which differs from
  Mongoster: it sends them relaxed (`relaxEjson`).

What is sent, as the Log records it; a part whose field is empty is left out, and `skip` and `limit` are the page's,
as `table.page-window` gives them:

```
db.orders.find({ status: "paid" }, { total: 1, status: 1 }).sort({ createdAt: -1 }).skip(50).limit(50).maxTimeMS(60000)
```

Acceptance:

- [ ] With every field empty, opening `shop.orders` sends `db.orders.find({}).skip(0).limit(50).maxTimeMS(60000)` and
      the table shows the first 50 documents.
- [ ] The filter `{ status: "paid" }`, the sort `{ createdAt: -1 }` and the projection `{ total: 1 }` on page 2 with
      page size 50 send
      `db.orders.find({ status: "paid" }, { total: 1 }).sort({ createdAt: -1 }).skip(50).limit(50).maxTimeMS(60000)`.
- [ ] Running from the run button, a key, a drop, a header or **Reset** shows the first page; changing the page keeps
      the query and moves the page.
- [ ] The filter `{ status: }` sends nothing, outlines **Filter** and shows *Invalid query syntax — check the
      highlighted field.*; so does the sort `[1]`, which is valid mongosh syntax but not an object, outlining
      **Sort**.
- [ ] `ISODate()` in the filter is the time the query was run, the same for the documents and for the count.
- [ ] A value keeps its type on the way to the server: `{ qty: NumberLong("9007199254740993") }` is sent as an `Int64`
      with that exact value, `{ price: NumberDecimal("12.50") }` as a `Decimal128`.
- [ ] A value keeps its type on the way back: four documents whose `n` is an `Int32`, an `Int64`, a `Double` and a
      `Decimal128` of the value 5 are four different values in the window; an `Int64` beyond 9,007,199,254,740,991 has
      every digit, and a date before 1970 or after the year 9999 is a date.
- [ ] An error of the server is shown on the error line in the server's words, for example *unknown operator: $foo*,
      and the table keeps the documents it showed before.
- [ ] A query the server stops at the time limit shows *The server took longer than 60 seconds.*, with the number of
      the setting; with `datardo.query.timeLimitSeconds` at 5 the query is sent with `maxTimeMS(5000)`.
- [ ] A query that runs longer than 400 ms shows as work in progress on the status line, with **Cancel** there and in
      the bar; cancelling it shows *Cancelled* with **Run again** and leaves the table as it was.
- [ ] Running a query while another of the same tab is still running cancels the first: the table never shows the
      result of a query older than the last one run.
- [ ] A query that succeeds is the first of the recent queries of the collection; one that is refused or fails is not
      added.
- [ ] Through a read-only connection and on a view the query runs the same.

### `query.count` — Count the matching documents

Says how many documents the query matches, so that the paging and the status line can show *1–50 of 1,204*.

- **Kind**: Read
- **Engine**: MongoDB
- **Function**: `src/features/query/count.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: it runs by itself beside every `query.run`, with the same filter. A click on the count of the
  status line (`@status-line`) or on the total of the paging (`@paging`), while the total is an estimate or `?`,
  counts exactly. The tool `count_documents` of the MCP server counts the same way (`mcp.read-data`).
- **Reads**: the filter as `query.run` read it, and whether the target is a collection, a view or a time series
  collection.
- **After**: `table.paging` and the status line show the total; with a **Skip** or a **Limit**, the total they show is
  the one `table.page-window` works out from this count.
- **Uses**: `query.run`, `query.parse`, `table.page-window`, `table.paging`, `nav.status-line`, `runner.progress`,
  `runner.cancel`.
- **Ported from**: `src/collectionPanel.ts › countDocuments`, `src/webview/main.ts › renderStatus`.

What is sent:

- with an empty filter, on a collection: `db.orders.estimatedDocumentCount({ maxTimeMS: 10000 })`, the count the
  collection keeps of itself, which costs nothing. It is an **estimate**: it can be wrong after an unclean shutdown,
  and on a sharded cluster while chunks move;
- with any filter, and with an empty filter on a view or on a time series collection, which keep no count:
  `db.orders.countDocuments({ status: "paid" }, { maxTimeMS: 10000 })`, which is exact;
- when the user asks for the exact count with a click: `countDocuments` with the filter last run, also when it is
  empty, and the time limit of `query.run` in place of the 10 seconds. It shows as work in progress and can be
  cancelled (`runner.cancel`). The count by a click is *New in Datardo*.

Acceptance:

- [ ] With an empty filter on the collection `shop.orders`, `estimatedDocumentCount` is sent and `countDocuments` is
      not.
- [ ] With the filter `{ status: "paid" }`, `db.orders.countDocuments({ status: "paid" }, { maxTimeMS: 10000 })` is
      sent.
- [ ] With an empty filter on a view, `countDocuments({})` is sent.
- [ ] An estimated total has the tooltip *Estimated: the count the collection keeps of itself. Click to count
      exactly.*; an exact one has no tooltip and is not a button.
- [ ] A click on an estimated total of 1,204 sends `db.orders.countDocuments({}, { maxTimeMS: 60000 })` and, when it
      answers 1,198, the paging and the status line show 1,198 with no tooltip; the documents are not read again.
- [ ] A click on a total shown as `?` counts again with the time limit of the query; when that fails too, the total
      stays `?` and the error line of the bar says why.
- [ ] The documents are shown as soon as `find` returns them: a count that takes longer fills in the total when it
      arrives, and meanwhile the total reads `…`.
- [ ] A count that fails or takes longer than 10 seconds shows the total as `?`, with no message: the documents stay,
      and **Next page** is enabled as long as the page shown is full.
- [ ] The count is not sent again when only the page changes: the total of the query last run is kept until the query,
      or a refresh, runs again.
- [ ] A count of 1,204 is written `1,204`.

### `query.reset` — Reset the query

Empties the bar and shows the collection again from its first document.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/query/reset.ts › resetQuery(state)`
- **Entry points**: **Reset** in the query bar (`@query-bar`); **Reset** under *No documents match this query.*
  (`@empty-state`); Go to, **Reset query**.
- **Offered when**: the tab is in **Find**. In **Aggregate** the pipeline editor has its own **Clear**.
- **Commands**: `query.reset`
- **Uses**: `query.run`, `query.builder`.
- **Ported from**: `src/webview/main.ts` (the `reset` button). Clearing **Skip** and **Limit** too is *New in
  Datardo*, with the fields.

Rules of the result:

- The result is the state with **Filter**, **Sort**, **Project**, **Skip** and **Limit** empty, the first page, an
  empty error line and an empty selection. The mode, the page size, the columns and whether the builder is open are
  not touched.
- `query.run` starts at once with the empty query.
- The builder, when open, shows one empty row.

Acceptance:

- [ ] With the filter `{ status: "paid" }`, the sort `{ total: -1 }` and page 3, **Reset** empties both fields and
      shows the first 50 documents of the collection.
- [ ] **Reset** removes the outline of a field that was invalid and empties the error line.
- [ ] **Reset** keeps the page size, the hidden and pinned columns and the expanded columns.
- [ ] The query that was in the bar is still in the recent queries.
- [ ] **Reset** with everything already empty runs the empty query again: it is also a way to read the collection
      again.

### `query.restore` — The query a tab remembers

A collection tab comes back as it was left: its mode, its query, its page.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/query/restore.ts › restoredQuery(kept)`
- **Entry points**: none: it is used when a collection tab is opened again (`tab.open`) or restored at the start
  (`tab.restore`).
- **Uses**: `tab.restore`, `tab.open`, `query.run`, `table.columns`.
- **Ported from**: `src/webview/main.ts` (`QueryState`, `vscode.setState`, the boot at the end of the file).

Rules of the result:

- What is kept for a tab: the mode; the texts of **Filter**, **Sort** and **Project**; **Skip** and **Limit**; the
  page and the page size; whether the builder is open. The pipeline of the tab is kept with them by the aggregate
  area. What is kept is the query as it was last **run**, not a text typed and never run.
- It is kept when the query is sent, when the mode is switched and when the builder is opened or closed.
- The input is what was kept, which may be missing or partly missing. A missing or unusable part takes its default:
  mode `find`; empty texts; no skip and no limit; page 1; page size 50; builder closed. A page size that is not one of
  10, 20, 50, 100, 200 and 500 becomes 50.
- A restored tab runs its query at once.
- The columns' layout and the expanded columns are not part of this: they are remembered for the collection, not for
  the tab (`table.columns`).
- There is one tab for a collection of a connection: opening the collection again makes that tab active with its
  query; opening it with a query from another feature replaces the query and runs it from the first page.

Acceptance:

- [ ] A tab closed on page 3 of `{ status: "paid" }`, sorted by `{ total: -1 }` with page size 100, opens at the next
      start with those texts, on page 3, with page size 100, and runs.
- [ ] `{ status: ` typed in **Filter** and never run is not there when the tab is restored: the filter last run is.
- [ ] A tab with nothing kept opens in **Find** with empty fields, page 1 and page size 50.
- [ ] Kept data with a page size of 37 opens with page size 50.
- [ ] The builder is open in a restored tab when it was open, and shows the rows of the restored filter.
- [ ] A restored page that is past the end of the result, because documents were deleted meanwhile, shows the last
      page that has documents.

### `query.parse` — Read mongosh syntax into values

Turns the text the user types (a filter, a sort, a value in a cell, a document to insert) into values with their BSON
types. It reads the text; it never evaluates it, so nothing typed can run code.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/query/parse.ts › parsedValue(text, now, newId)`
- **Uses**: `query.format`.
- **Ported from**: `src/shared/query.ts › parseQuery`, `shellToJson5`; `src/queries.ts › toBson`, `fromRelaxed`.
  Reading `Long(…)`, `Int32(…)`, `Double(…)`, `Decimal128(…)`, `ObjectId()`, `new ObjectId(…)`, `HexData(…)`,
  `MD5(…)`, `DBRef(…)`, `Code(…)`, `BSONSymbol(…)`, `undefined` and `new Date(<milliseconds>)` *differs from
  Mongoster, which refuses them*; so does reading a number written with a decimal point as a `Double`, which Mongoster
  reads as an `Int32` when it is whole.

Rules of the result:

- The inputs are a text, the current time and a maker of new ids. The result is one value (an object, an array or a
  single value) with the type of each value known, or an error with a message, a line and a column. An empty text is
  not a value: the caller decides what an empty field means.
- The base is JSON with the freedoms of JSON5: keys without quotes when they are identifiers (`status`, `$gte`,
  `_id`), strings in double or single quotes, a comma after the last entry, `// …` and `/* … */` comments, numbers
  written `0x1F`, `.5`, `5.` or `+1`, and `Infinity`, `-Infinity` and `NaN`.
- A number takes its type from how it is written. Written with digits alone, or as `0x…`, it is a whole number: an
  `Int32` from −2,147,483,648 to 2,147,483,647, an `Int64` beyond that when it fits 64 bits, a `Double` when it does
  not. Written with a decimal point or an exponent it is a `Double`, also when its value is whole: `5.0`, `5.5`, `.5`,
  `1e3`. `Infinity`, `-Infinity` and `NaN` are `Double` values.
- These helpers are read where a value can stand, with single or double quotes, and never inside a string. They are
  every constructor `query.format` writes and `query.highlight` colors. The word `new` may come before `Date` and
  `ObjectId`:

| Text | Value |
| --- | --- |
| `ObjectId("65f1c0de65f1c0de65f1c0de")`, `new ObjectId("65f1c0de65f1c0de65f1c0de")` | `ObjectId`; exactly 24 hexadecimal digits |
| `ObjectId()`, `new ObjectId()` | `ObjectId`: a new id, from the maker given to the function |
| `ISODate("2024-01-01")`, `new Date("2024-03-15T10:30:00+01:00")` | `Date`, of any text JavaScript's `Date` reads: `2024-01-01T00:00:00.000Z`, `2024-03-15T09:30:00.000Z` |
| `ISODate()`, `new Date()` | `Date`: the current time given to the function |
| `new Date(1710498600000)` | `Date`: that number of milliseconds from the start of 1970 |
| `NumberLong(5)`, `NumberLong("9007199254740993")`, `Long(5)`, `Long("5")` | `Int64`, exact |
| `NumberInt(7)`, `NumberInt("7")`, `Int32(7)` | `Int32` |
| `Double(5)`, `Double("5.5")` | `Double`, also with a whole value |
| `NumberDecimal("12.50")`, `NumberDecimal(1.5)`, `Decimal128("12.50")` | `Decimal128`, with the digits as written; also `NaN`, `Infinity`, `-Infinity` |
| `UUID("0F8FAD5B-D9CB-469F-A165-70867728950E")` | `Binary` of subtype 4; 32 hexadecimal digits with or without dashes, any case |
| `BinData(0, "aGVsbG8=")` | `Binary` with that subtype, written in decimal, and base64 data |
| `HexData(0, "68656c6c6f")` | `Binary` with that subtype and its bytes written in hexadecimal |
| `MD5("5d41402abc4b2a76b9719d911017c592")` | `Binary` of subtype 5; 32 hexadecimal digits |
| `Timestamp(1700000000, 1)`, `Timestamp({ t: 1700000000, i: 1 })` | `Timestamp` |
| `MinKey()`, `MaxKey()` | `MinKey`, `MaxKey` |
| `DBRef("users", ObjectId("65f1c0de65f1c0de65f1c0de"))`, `DBRef("users", 7, "shop")` | the document `{ $ref: "users", $id: … }`, with `$db: "shop"` when a database is given; the id is any value |
| `Code("function () { return 1 }")`, `Code("…", { x: 1 })` | code, with its scope when one is given; it is kept as text and never run |
| `BSONSymbol("x")` | the deprecated symbol type |
| `undefined` | the deprecated undefined type |
| `/^mario/i` | regular expression, pattern `^mario`, options `i` |

- A `/` opens a regular expression only where a value starts: at the beginning of the text or after `:`, `[`, `,` or
  `(`. The pattern stays on one line; `\/` is a slash inside it. Of the letters after it, `i`, `m`, `s`, `x` and `u`
  are kept, each once and in alphabetical order; any other letter, such as `g`, is dropped.
- Extended JSON is read too, since it is JSON: `{ "$oid": "…" }`, `{ "$date": "…" }`, `{ "$numberInt": "5" }`,
  `{ "$numberLong": "5" }`, `{ "$numberDouble": "5.0" }`, `{ "$numberDecimal": "1.5" }`,
  `{ "$date": { "$numberLong": "1710498600000" } }`, `{ "$code": "…" }`, `{ "$symbol": "x" }`,
  `{ "$undefined": true }`, `{ "$binary": { "base64": "…", "subType": "00" } }`, `{ "$uuid": "…" }`,
  `{ "$regularExpression": { "pattern": "…", "options": "i" } }`, `{ "$timestamp": { "t": 1, "i": 2 } }`,
  `{ "$minKey": 1 }`, `{ "$maxKey": 1 }`, and a DBRef as `{ "$ref": "users", "$id": … }`.
- Anything else is refused with the place of the first character that cannot be read: a helper with a wrong argument,
  a name that is not a helper, a word without quotes as a value, arithmetic, a function, a template string, a call on
  `db`.
- The callers add their own rule on the result: the fields of the query bar need an object (`query.run`), the insert
  dialog a document or a list of documents, a cell any value.

Worked examples:

- `{ status: "paid" }` → `{ status: "paid" }`, a string.
- `{ 'address.city': 'Milano', } // north` → `{ "address.city": "Milano" }`.
- `{ n: 5 }` → `Int32` 5. `{ n: 5.0 }`, `{ n: 5.5 }`, `{ n: 1e3 }` → `Double`. `{ n: 3000000000 }` → `Int64`.
  `{ n: 0x1F }` → `Int32` 31.
- `{ a: Int32(5), b: Long("5"), c: Double(5), d: Decimal128("5") }` → an `Int32`, an `Int64`, a `Double` and a
  `Decimal128`, each of the value 5.
- `{ by: DBRef("users", 7) }` → `{ by: { $ref: "users", $id: 7 } }`. `{ a: undefined }` → the undefined type.
  `{ h: HexData(0, "68656c6c6f") }` → the same `Binary` as `BinData(0, "aGVsbG8=")`.
- `{ createdAt: { $gte: ISODate("2024-01-01") } }` → the date `2024-01-01T00:00:00.000Z` under `$gte`.
- `{ name: /^mario/i }` → pattern `^mario`, options `i`. `{ name: /a/gi }` → pattern `a`, options `i`.
- `{ tags: [/a/, /b/m] }` → two regular expressions in an array.
- `{ note: "ObjectId(\"x\")" }` → the string `ObjectId("x")`, untouched.
- `{ "_id": { "$oid": "65f1c0de65f1c0de65f1c0de" } }` → the same `ObjectId` as `ObjectId("65f1c0de65f1c0de65f1c0de")`.
- `42` → `Int32` 42. `[1, 2]` → an array.
- Refused: `{ a: ObjectId("123") }` (not 24 digits), `{ a: MD5("abc") }`, `{ a: Double("x") }`, `{ a: Binary("x") }`,
  `{ n: 1 + 1 }`, `{ r: 10 / 2 }`, `{ a: b }`, `{ d: Date.now() }`, `{ a: 1` (the text ends early),
  `db.orders.find({})`.

Acceptance:

- [ ] Each example above gives the value shown, and each refused text gives an error whose line and column point at
      the first character that cannot be read: column 6 for `{ a: b }`.
- [ ] `{ at: ISODate() }` read with the current time `2026-11-18T09:00:00.000Z` gives that date; read twice with the
      same time, it gives the same value.
- [ ] `NumberLong("9007199254740993")` keeps every digit; `NumberDecimal("12.50")` keeps its trailing zero.
- [ ] `UUID("0F8FAD5BD9CB469FA16570867728950E")` and `UUID("0f8fad5b-d9cb-469f-a165-70867728950e")` give the same
      value.
- [ ] `ISODate("tomorrow")` is refused with *Invalid date: "tomorrow"*.
- [ ] `{ a: 1 /* note */, // why` followed by a new line and `b: 2 }` gives `{ a: 1, b: 2 }`.
- [ ] `{ _id: ObjectId() }` read with a maker that gives `65f1c0de65f1c0de65f1c0de` gives that id: the function draws
      no random value itself.
- [ ] No text makes the function run code, read a file, or call the server: `{ a: process.exit() }` and
      `{ a: (() => 1)() }` are refused as text, and `Code("process.exit()")` is a value that holds that text.
- [ ] For every value `v` of every BSON type, `query.parse` of the text `query.format` writes for `v` gives `v` back
      with the same type: an `Int32`, an `Int64`, a `Double` and a `Decimal128` of the value 5 come back as four
      different values.

### `query.format` — Write values as mongosh syntax

Turns values back into the text the user reads and can type again: in cells, in the inspector, in filters built by the
builder or by a drop, in the steps of a confirmation, in what is copied.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/query/format.ts › formattedValue(value, layout)`
- **Uses**: `query.parse`.
- **Ported from**: `src/shared/query.ts › toShell`, `prettyShell`, `formatFilter`, `formatWrapper`, `formatKey`,
  `escapeSlashes`. Writing a `Double` with a whole value as `Double(5)`, every `Int64` as `NumberLong(…)`, a symbol as
  `BSONSymbol("…")` and code with its scope *differs from Mongoster*, which writes a plain number, a string and code
  alone: in Datardo every text is read back by `query.parse` with the type it had.

Rules of the result:

- The input is a value with its BSON type and a layout; the result is a text that `query.parse` reads back as the same
  value of the same type. How each type is written:

| Type | Text |
| --- | --- |
| String | `"paid"`, in double quotes with JSON's escapes: `"line one\nline two"` |
| `Int32` | `42` |
| `Double` | with a fraction, `42.5`; with a whole value, `Double(5)`; `NaN`, `Infinity`, `-Infinity` |
| `Int64` | `NumberLong(1204)` when it is within ±9,007,199,254,740,991; beyond, `NumberLong("9007199254740993")` |
| `Decimal128` | `NumberDecimal("12.50")` |
| Boolean, null | `true`, `false`, `null` |
| `ObjectId` | `ObjectId("65f1c0de65f1c0de65f1c0de")` |
| `Date` | `ISODate("2024-03-15T10:30:00.000Z")`, always UTC with milliseconds, also before 1970; a date JavaScript cannot hold is `new Date(<milliseconds>)` |
| Regular expression | `/^mario/i`, with a `/` of the pattern written `\/` |
| `Binary` of subtype 4, or of subtype 3 with 16 bytes | `UUID("0f8fad5b-d9cb-469f-a165-70867728950e")` |
| Any other `Binary` | `BinData(0, "aGVsbG8=")`, the subtype in decimal |
| `Timestamp` | `Timestamp({ t: 1700000000, i: 1 })` |
| `MinKey`, `MaxKey` | `MinKey()`, `MaxKey()` |
| Array, object | `[1, 2]`, `{ a: 1 }`; empty ones `[]`, `{}` |
| DBRef | `{ $ref: "users", $id: ObjectId("…") }` |
| Deprecated types | undefined: `undefined`; symbol: `BSONSymbol("x")`; code: `Code("…")`, or `Code("…", { x: 1 })` with its scope |

- A key is written without quotes when it is an identifier (letters, digits, `_` and `$`, not starting with a digit),
  otherwise in double quotes: `{ status: 1, $gte: 5, "address.city": 1, "2fa": true }`.
- The layouts:
  - **one line**: `{ a: 1, b: [1, 2] }`, with a space inside the braces and none inside the brackets. Used in cells,
    steps, sorts and projections.
  - **filter**: one line when it is at most 70 characters long; otherwise one top-level field per line, each on one
    line, indented by two spaces. Used for the text of **Filter**.
  - **pretty**, with a width (76 unless the caller gives another): a value that fits the width from where it starts
    stays on one line; otherwise each of its entries goes on its own line, indented by two spaces, by the same rule.
    Used in the inspector, the document tab and the editor of a cell.
  - **indented**: every entry of every array and object on its own line, indented by two spaces. Used by the mongosh
    format of `table.copy-text`.
- The same value always gives the same text.

Worked examples:

- Numbers, one per type: an `Int32` 5 → `5`; a `Double` 5 → `Double(5)`; a `Double` 5.5 → `5.5`; an `Int64` 5 →
  `NumberLong(5)`; an `Int64` 9007199254740993 → `NumberLong("9007199254740993")`; a `Decimal128` 12.50 →
  `NumberDecimal("12.50")`.
- One line:

```
{ _id: ObjectId("65f1c0de65f1c0de65f1c0de"), status: "paid", total: 42.5, qty: 2, views: NumberLong(1204), tags: ["a", "b"] }
```

- Filter, short: `{ status: "paid" }`. Filter, long:

```
{
  status: "paid",
  createdAt: { $gte: ISODate("2024-01-01T00:00:00.000Z"), $lt: ISODate("2025-01-01T00:00:00.000Z") }
}
```

- Pretty, width 76:

```
{
  _id: ObjectId("65f1c0de65f1c0de65f1c0de"),
  status: "paid",
  customer: { name: "Mario Rossi", email: "mario@example.com" },
  items: [{ sku: "A1", qty: 2 }, { sku: "B2", qty: 1 }]
}
```

Acceptance:

- [ ] Each row of the table of types gives exactly the text shown, and each example above its text.
- [ ] A date one second before 1970 is written `ISODate("1969-12-31T23:59:59.000Z")`.
- [ ] The regular expression with the pattern `a/b` and the option `i` is written `/a\/b/i`, and `query.parse` of that
      text gives it back.
- [ ] A filter of exactly 70 characters stays on one line; one of 71 goes one field per line.
- [ ] The **indented** layout writes `{ a: 1, b: [1, { c: 2 }], e: {}, ea: [] }` on ten lines, with `e: {}` and
      `ea: []` each on one.
- [ ] `query.parse` of the text gives back the same value of the same type for every row of the table of types: `5` an
      `Int32`, `Double(5)` a `Double`, `NumberLong(5)` an `Int64`, `NumberDecimal("5")` a `Decimal128`; undefined, a
      symbol and code with its scope too.
- [ ] A `Double` of 1e21 is written `Double(1e+21)`, and a `Double` of 3000000000 `Double(3000000000)`, which is read
      back as a `Double` and not as an `Int64`.

### `query.highlight` — The syntax colors of mongosh text

Says what each part of a text in mongosh syntax is, so that the editors color field names, operators, strings,
numbers, ids, dates, regular expressions and comments as the user types.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/query/highlight.ts › syntaxTokens(text)`
- **Entry points**: none: every editor that takes mongosh syntax uses it: **Filter**, **Sort** and **Project**, the
  stages of a pipeline and the pipeline as text, the update of `document.update-many`, the insert dialog, the editor
  of a cell, the keys and the partial filter of `index.create`.
- **Uses**: `window.theme`.
- **Ported from**: `src/shared/syntax.ts › tokenize`, `src/webview/highlight.ts`, `src/shared/tokenColors.ts`.
  Mongoster lays colored text over a plain input and takes the colors of VS Code's theme; in Datardo the roles are the
  tokens of a language of the editor (CodeMirror 6) and the colors are the theme's.

Rules of the result:

- The result is a list of tokens, each with where it starts, where it ends and a role, in the order of the text and
  never overlapping. Text with no role (braces, colons, commas, unknown words) has no token.
- The roles: `key`, `op`, `string`, `ref`, `number`, `bool`, `oid`, `date`, `regex`, `comment`.
- `comment`: `// …` to the end of its line, and `/* … */`, also unfinished.
- A text in double quotes, single quotes or backticks is a `key` when a `:` follows it, an `op` when it is such a key
  and starts with `$`; otherwise a `ref` when it starts with `$` and a letter, `_` or `$` (`"$total"`, `"$$ROOT"`),
  otherwise a `string`. A string that is not closed ends at the end of its line.
- `regex`: `/…/` with its letters, only where a value can start: at the beginning, or after one of
  `: [ , ( = ! & | ? {`. Elsewhere a `/` is a division and has no role.
- `number`: digits with an optional fraction and exponent, `0x…`, and a `-` before them where a value can start.
- A word followed by `:` is a `key`, or an `op` when it starts with `$`. Otherwise a word has a role only when it is
  one of: `ObjectId`, `UUID`, `BinData`, `Binary`, `HexData`, `MD5`, `DBRef`, `Code`, `BSONSymbol` (`oid`); `ISODate`,
  `Date`, `Timestamp` (`date`); `NumberLong`, `NumberInt`, `NumberDecimal`, `Decimal128`, `Long`, `Int32`, `Double`,
  `NaN`, `Infinity` (`number`); `true`, `false`, `null`, `undefined`, `MinKey`, `MaxKey` (`bool`); `new` (`op`).
- A word of the roles `oid`, `date` and `number` takes its argument with it when that is one string or one number in
  parentheses, or nothing: `ObjectId("65f1c0de65f1c0de65f1c0de")`, `NumberLong(5)` and `ISODate()` are one token each.
- Each role has one color in each theme (`window.theme`), and the same color wherever a value of that kind is shown:
  in the cells of the table (`table.cell-text`), in the inspector, in the results of a playground.

Worked example:

```
{ name: /mario/i, age: { $gte: 18 }, _id: ObjectId("65f1c0de65f1c0de65f1c0de"),
  "address.city": "Milano", ref: "$total", ok: true } // adults
```

gives `name` key, `/mario/i` regex, `age` key, `$gte` op, `18` number, `_id` key,
`ObjectId("65f1c0de65f1c0de65f1c0de")` oid, `"address.city"` key, `"Milano"` string, `ref` key, `"$total"` ref, `ok`
key, `true` bool, `// adults` comment.

Acceptance:

- [ ] The example above gives exactly those 14 tokens, in that order.
- [ ] In `{ ratio: 10 / 2 }` the `/` has no role and `10` and `2` are numbers; in `{ name: /2/ }` the `/2/` is a
      regex.
- [ ] `{ note: "// not a comment" }` has a string and no comment.
- [ ] A text that `query.parse` refuses is still colored up to its end: `{ status: "pai` colors `status` as a key and
      `"pai` as a string.
- [ ] Changing the theme from dark to light changes the colors in every open editor and cell without running anything
      again.
- [ ] Coloring a filter of 10,000 characters does not delay typing: only the lines shown are colored.

### `query.builder` — The query builder

Builds the filter from rows of a field, an operator and a value, for whoever does not want to write mongosh syntax.
The rows and the text of **Filter** follow each other.

- **Kind**: View
- **Engine**: MongoDB
- **Function**: `src/features/query/builder.ts › view(state)`
- **Entry points**: **Builder** in the query bar shows or hides it (`@query-bar`); its rows and buttons are under the
  bar (`@query-bar`); Go to, **Show or hide the query builder**.
- **Offered when**: the tab is in **Find**.
- **Commands**: `query.builder`
- **Uses**: `query.builder-filter`, `query.builder-rows`, `query.field-hints`, `query.format`, `query.parse`,
  `query.run`, `query.restore`.
- **Ported from**: `src/webview/builder.ts › FilterBuilder`, `src/shared/builder.ts` (`BUILDER_OPS`, `BUILDER_TYPES`);
  README, **Visual query builder**.

What it shows:

1. A head: **Match**, a choice between **all** and **any**, **of these conditions**; at the right **+ Condition**
   (tooltip *Add a condition*) and **Clear** (tooltip *Remove every condition (and the filter)*).
2. One row per condition: the field, with the placeholder *field* and the fields of the collection as suggestions
   (`query.field-hints`); the operator; the value; and a button that removes the row (tooltip *Remove the condition*).
3. A note, when there is something to say.

The operators, with their tooltips:

| Operator | Tooltip | Value |
| --- | --- | --- |
| `=` | *equals (an array field: contains the value)* | a value |
| `≠` | *not equal ($ne)* | a value |
| `>` | *greater than ($gt)* | a value |
| `≥` | *greater than or equal ($gte)* | a value |
| `<` | *less than ($lt)* | a value |
| `≤` | *less than or equal ($lte)* | a value |
| `in` | *one of the values ($in)* | values; placeholder `1, 2, 3  or  "a", "b"` |
| `not in` | *none of the values ($nin)* | values; the same placeholder |
| `matches` | *matches the regular expression ($regex)* | placeholder `/^mario/i` |
| `exists` | *the field is present ($exists: true)* | none |
| `missing` | *the field is absent ($exists: false)* | none |
| `type` | *the value has this BSON type ($type)* | a list: string, number, int, long, double, decimal, bool, date, objectId, object, array, null, regex, binData, timestamp |
| `size` | *an array with this many elements ($size)* | placeholder `3` |

The placeholder of a value is `Mario, 42, true, ISODate("2024-01-01"), ObjectId("…")`, and its suggestions are the
most frequent values of the row's field, in mongosh syntax.

Acceptance:

- [ ] Opening the builder with an empty filter shows one empty row with the operator `=` and the cursor in its field.
- [ ] Filling a row with `status`, `=`, `paid` writes `{ status: "paid" }` in **Filter** as it is typed, without
      running it; `Enter` in the row runs the query.
- [ ] A row without a field, or without a value where its operator needs one, is drawn with a dashed outline and is
      not part of the filter.
- [ ] Typing `{ age: { $gte: 20, $lte: 30 } }` in **Filter** shows two rows, `age ≥ 20` and `age ≤ 30`; so does a
      filter that comes from a drop, a recent query or a saved one. Rows still being filled in stay, after the others.
- [ ] A filter with a syntax error shows no rows and the note *The filter has a syntax error: fix it in the box above
      to edit it here.*; **+ Condition** and the choice are disabled.
- [ ] The filter `{ items: { $elemMatch: { sku: "A1" } } }` shows no rows and the note *This filter uses operators the
      rows can't show ($elemMatch, $expr, nested $or…): edit it in the box above, or Clear to start over here.*, and
      the text of **Filter** is left exactly as it is.
- [ ] **Clear** removes every row, empties **Filter** and leaves one empty row; it does not run the query.
- [ ] Choosing `type` puts `string` as the value and shows the list of types; choosing `exists` or `missing` removes
      the value; leaving `type` for another operator empties the value.
- [ ] A row with `tags`, `size`, `x` shows the note *tags: size needs a whole number* and leaves **Filter** as it was.
- [ ] The builder is open or closed for each tab by itself, and a tab is restored with it as it was left.
- [ ] Every control of a row has a name a screen reader says: *Field of condition 1*, *Operator of condition 1*,
      *Value of condition 1*.

### `query.builder-filter` — The filter of the builder's rows

Turns the rows of the builder into the filter that is written in **Filter**.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/query/builder-filter.ts › filterOfRows(rows, combine)`
- **Uses**: `query.parse`, `query.format`.
- **Ported from**: `src/shared/builder.ts › rowsToFilter`, `parseValue`, `rowComplete`.

Rules of the result:

- The input is the rows (a field, an operator, a value as text) and how they combine, *all* or *any*. The result is a
  filter, or an error when a value does not fit its operator. The text written in **Filter** is that filter in the
  **filter** layout of `query.format`, and an empty text for a filter with no condition.
- Only complete rows count: a field that is not blank and, unless the operator is `exists` or `missing`, a value that
  is not blank. The field is used without the spaces around it.
- A value is read as mongosh syntax (`query.parse`); a text that is not, such as `Mario Rossi`, is that text as a
  string. So `42` is a number, `"42"` and `abc` are strings, `true` is a boolean, `null` is null.
- `in` and `not in` take an array (`[1, 2]`) or values separated by commas (`1, 2, 3`, `"a", "b"`, `paid, new`); words
  without quotes are one string each.
- `matches` takes a regular expression (`/^mario/i`) or a plain text, which is the pattern with no options.
- `type` takes the name chosen. `size` takes a whole number, 0 or more; anything else is the error *<field>: size
  needs a whole number*.
- The condition of one row: `=` is the value itself, `{ field: value }`, or `{ field: { $eq: value } }` when the value
  is an object whose keys start with `$`; `matches` is the regular expression itself; `exists` and `missing` are
  `{ $exists: true }` and `{ $exists: false }`; every other operator is `{ $op: value }`.
- *any*: one row gives its condition alone; several give `{ $or: [ … ] }`, one condition per row, in the order of the
  rows.
- *all*: a field with one row gives its condition. A field with several rows gives one object with all their
  operators, `=` as `$eq` and `matches` as `$regex`. When two rows of a field have the same operator, they cannot
  share an object: the whole filter is then `{ $and: [ … ] }`, one condition per row.
- The fields are in the order of their first row.

Worked examples, written as field, operator, value → filter:

- `status = paid` → `{ status: "paid" }`; `status = "paid"` gives the same.
- `age ≥ 20`, `age ≤ 30` → `{ age: { $gte: 20, $lte: 30 } }`.
- `age > 20`, `age > 30` → `{ $and: [{ age: { $gt: 20 } }, { age: { $gt: 30 } }] }`.
- *any* of `status = paid`, `total > 100` → `{ $or: [{ status: "paid" }, { total: { $gt: 100 } }] }`.
- `status in paid, new` → `{ status: { $in: ["paid", "new"] } }`; `n not in [1, 2]` → `{ n: { $nin: [1, 2] } }`.
- `name matches /^mario/i`, `city matches mil` → `{ name: /^mario/i, city: /mil/ }`.
- `name = mario`, `name matches /^m/` → `{ name: { $eq: "mario", $regex: /^m/ } }`.
- `email exists`, `phone missing`, `age type int`, `tags size 3` →
  `{ email: { $exists: true }, phone: { $exists: false }, age: { $type: "int" }, tags: { $size: 3 } }`.
- `createdAt ≥ ISODate("2024-01-01")` → `{ createdAt: { $gte: ISODate("2024-01-01T00:00:00.000Z") } }`.
- `status = paid`, a row with no field, `total >` with no value → `{ status: "paid" }`.
- No complete row → `{}`, written as an empty **Filter**.

Acceptance:

- [ ] Each example above gives exactly the filter shown.
- [ ] `tags size 2.5`, `tags size -1` and `tags size x` give the error *tags: size needs a whole number*.
- [ ] `a exists` and `a missing` together give `{ $and: [{ a: { $exists: true } }, { a: { $exists: false } }] }`.
- [ ] A value `{ $x: 1 }` with `=` gives `{ a: { $eq: { $x: 1 } } }`, so that it is compared as a value and not read
      as an operator.
- [ ] `query.builder-rows` of the result gives the same complete rows back, in the same order, for every example
      above.

### `query.builder-rows` — The builder's rows of a filter

Turns a filter written by hand, dropped or taken from a recent query into the rows of the builder, when rows can say
it.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/query/builder-rows.ts › rowsOfFilter(filter)`
- **Uses**: `query.format`, `query.builder-filter`.
- **Ported from**: `src/shared/builder.ts › filterToRows`, `rowsOf`.

Rules of the result:

- The input is a filter already read by `query.parse`. The result is the rows and how they combine, or *cannot be
  shown* when the filter uses something rows cannot say. An empty filter gives no rows, combined with *all*.
- A filter whose only key is `$or` or `$and`, with a list that is not empty, gives *any* or *all*: every item must be
  an object with exactly one key that is a field, and under `$or` every item must give exactly one row.
- Any other filter is *all*, and every one of its top-level keys must be a field: a key that starts with `$` cannot be
  shown.
- The value of a field gives rows this way: a regular expression gives `matches`; a value that is not an object of
  operators gives `=` with the value written by `query.format`; an object of operators gives one row per operator:
  `$eq`, `$ne`, `$gt`, `$gte`, `$lt`, `$lte`; `$in` and `$nin` with an array; `$exists` with a boolean or a number, as
  `exists` or `missing`; `$regex` with a string, with its `$options` when they are a string, or with a regular
  expression and no `$options`; `$type` with one name; `$size` with a number.
- Anything else cannot be shown: `$elemMatch`, `$not`, `$all`, `$mod`, `$type` with a list, `$in` without an array, an
  object that mixes operators and fields, `$expr`, `$nor`, `$text`, an `$or` beside other keys, an `$or` inside an
  `$and`.

Worked examples:

- `{ status: "paid", age: { $gte: 20, $lte: 30 } }` → *all*: `status = "paid"`, `age ≥ 20`, `age ≤ 30`.
- `{ $or: [{ status: "paid" }, { total: { $gt: 100 } }] }` → *any*: `status = "paid"`, `total > 100`.
- `{ $and: [{ age: { $gt: 20 } }, { age: { $gt: 30 } }] }` → *all*: `age > 20`, `age > 30`.
- `{ name: /^mario/i, city: { $regex: "mil", $options: "i" } }` → *all*: `name matches /^mario/i`,
  `city matches /mil/i`.
- `{ address: { city: "Milano" } }` → *all*: `address = { city: "Milano" }`.
- `{ s: { $in: ["a", "b"] }, n: { $nin: [1] } }` → *all*: `s in ["a", "b"]`, `n not in [1]`.
- Cannot be shown: `{ items: { $elemMatch: { sku: "A1" } } }`, `{ $expr: { $gt: ["$a", "$b"] } }`,
  `{ $or: [{ a: 1 }], b: 2 }`, `{ $or: [{ a: { $gt: 1, $lt: 5 } }] }`, `{ $or: [{ a: 1, b: 2 }] }`,
  `{ a: { $not: { $gt: 1 } } }`, `{ a: { $type: ["int", "long"] } }`.

Acceptance:

- [ ] Each example above gives exactly the rows shown, or *cannot be shown*.
- [ ] `{}` gives no rows and *all*.
- [ ] `{ email: { $exists: 1 } }` gives `email exists`; `{ email: { $exists: 0 } }` gives `email missing`.
- [ ] A filter that cannot be shown is never changed by the builder: the text of **Filter** stays the same, character
      for character.

### `query.autocomplete` — Suggestions while typing

While a filter, a sort or a projection is typed, a list under the cursor offers the collection's own field names, the
operators that fit there, and the values the field most often has.

- **Kind**: View
- **Engine**: MongoDB
- **Function**: `src/features/query/autocomplete.ts › view(state)`
- **Entry points**: inside an editor that takes mongosh syntax (`@editor`): it opens by itself while typing, and with
  `Ctrl+Space`.
- **Offered when**: the cursor is in **Filter**, **Sort** or **Project**; in a stage of a pipeline or the pipeline as
  text (`aggregate.show`); in the update of `document.update-many`; in the insert dialog (`document.insert`); in the
  keys and the partial filter of `index.create` and in the definition of a search index; in a playground, inside the
  calls that take a filter or a pipeline (`playground.open`).
- **Uses**: `query.suggestions`, `query.field-hints`.
- **Ported from**: `src/webview/autocomplete.ts › Completer`; README, **Autocomplete**.

What it shows: a list of at most 50 suggestions under the cursor, or above it when there is no room below. Each line
has a mark of its kind (a field, an operator, a stage, a value), its text with the part already typed in bold, and at
the right a detail: for a field its types and, when not every sampled document has it, the share that has
(`string · 80%`); for a value how many sampled documents have it (`×310`); for an operator what it does (*greater or
equal*).

Acceptance:

- [ ] Typing a letter, a digit, `_`, `$`, a quote, `:`, `{` or `.` opens the list when there is something to suggest.
      With nothing typed yet, it opens by itself only right after `{`, `[`, `:` or `,`.
- [ ] `Ctrl+Space` opens it wherever the cursor is, also with nothing typed.
- [ ] `↓` and `↑` move through the list and go round at its ends; `PageDown` and `PageUp` move by 8; `Enter` or `Tab`
      inserts the suggestion in place of what was typed; `Esc` closes the list and leaves the text; `←`, `→`, `Home`,
      `End` and a click in the editor close it.
- [ ] A click on a suggestion inserts it and the editor keeps the focus.
- [ ] In `{ st`, the list shows `status`; `Enter` writes `{ status: ` and the list opens again at once with the values
      of `status`: `"paid"` with `×310`, `"new"` with `×120`.
- [ ] An operator comes with the skeleton of its value and the cursor inside it: `$in` writes `$in: []` with the
      cursor between the brackets, `$elemMatch` writes `$elemMatch: {  }` with the cursor between the braces.
- [ ] When a `:` already follows the word being typed, only the name is inserted, not a second `: `.
- [ ] An insertion is one step for `Ctrl+Z`.
- [ ] While the field names of the collection are still being read, operators are suggested; the fields join the open
      list when they arrive.
- [ ] The list has the role of a list box for a screen reader, which says the suggestion the keys move to.

### `query.suggestions` — What is suggested where the cursor is

Decides, from the text before the cursor, whether a key or a value is expected there and of what, and gives the
suggestions in order.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/query/suggestions.ts › suggestions(text, cursor, kind, fields, searchIndexes)`
- **Uses**: `query.field-hints`, `query.format`.
- **Ported from**: `src/shared/complete.ts › complete`, `scan`, `child`, `keyItems`, `valueItems`, `matchScore`, and
  its vocabularies (`QUERY_TOP`, `QUERY_OPS`, `UPDATE_OPS`, `STAGES`, `ACCUMULATORS`, `EXPR_OPS`, `SEARCH_OPS` and the
  options of the search stages and of the search index definitions), which are ported whole with their descriptions
  and skeletons.

Rules of the result:

- The inputs: the text, the place of the cursor, the kind of the text, the fields of the collection
  (`query.field-hints`) and, for the search stages, its search indexes. The result is nothing, or: the range of the
  text a suggestion replaces, what was typed of it, whether a **key** or a **value** stands there, and the suggestions
  in order. A suggestion has a label, a detail, a kind (field, operator, stage, value), the text to insert and where
  the cursor goes in it.
- The kinds of text: `filter`, `sort`, `project`, `update`, `index` (the keys of an index), `pipeline` (a list of
  stages), one stage as an object, the body of a stage of a given operator, a document to insert, the name of a field
  as a string, and the definitions of a search index and of a vector search index.
- **Where the cursor is.** The text before the cursor is read once, without evaluating it: strings, comments, regular
  expressions and the nesting of `{`, `[` and `(`. Inside an object the cursor is at a key (after `{` or `,`) or at a
  value (after `:`); inside an array it is at a value. Nothing is suggested inside a comment, inside a regular
  expression, inside the parentheses of a helper such as `ObjectId(…)`, between a key and its `:`, after a value that
  is complete, and after the end of the whole value.
- **What stands there**, in a filter:
  - a key at the top, or inside the objects of `$and`, `$or` and `$nor`: the fields, then `$and`, `$or`, `$nor`,
    `$expr`, `$text`, `$jsonSchema`, `$where`, `$comment`;
  - a key inside the object of a field: `$eq`, `$ne`, `$gt`, `$gte`, `$lt`, `$lte`, `$in`, `$nin`, `$exists`, `$type`,
    `$regex`, `$options`, `$elemMatch`, `$size`, `$all`, `$not`, `$mod`;
  - a key inside `$elemMatch` of an array: the fields of its elements, without the array's name (`sku` for
    `items.sku`), then both lists of operators;
  - the value of a field, of `$eq`, `$ne`, `$gt`, `$gte`, `$lt`, `$lte`, and each value in the list of `$in`, `$nin`
    and `$all`: the most frequent values of that field;
  - the value of `$exists`: `true`, `false`; of `$type`: `"string"`, `"int"`, `"double"`, `"long"`, `"decimal"`,
    `"bool"`, `"date"`, `"objectId"`, `"object"`, `"array"`, `"null"`, `"number"`; inside `$not`, the operators of the
    field again; inside `$expr`, the expression operators and the fields as `"$field"`.
- In a sort, a key is a field and its value is `1` or `-1`. In a projection, a key is a field and its value is `1` or
  `0`. In the keys of an index, a value is `1`, `-1`, `"text"`, `"2dsphere"` or `"hashed"`.
- The other kinds follow the same scheme with their own vocabularies: update operators at the top of an update and
  fields under them; stage operators in a pipeline, and in each stage what that stage takes (a filter in `$match`,
  accumulators in `$group`, expressions and `"$field"` references in `$project` and `$addFields`, the options of
  `$lookup`, `$unwind`, `$merge` and the search stages); the fields of the collection, one level at a time, in a
  document to insert.
- **The skeletons.** An operator at a key is inserted with `: ` and the skeleton of its value, the cursor where the
  value goes: `$and: [{ | }]`, `$or: [{ | }]`, `$nor: [{ | }]`, `$expr: { | }`, `$text: { $search: "|" }`,
  `$jsonSchema: { | }`, `$where: "|"`, `$comment: "|"`, `$in: [|]`, `$nin: [|]`, `$all: [|]`, `$exists: true|`,
  `$type: "|"`, `$regex: /|/`, `$options: "i|"`, `$elemMatch: { | }`, `$not: { | }`, `$mod: [|, 0]`, where `|` is the
  cursor; the others get `: ` alone. A field is inserted with `: `. When a `:` already follows, nothing is added after
  the name.
- **Names.** A field that is not an identifier is inserted in double quotes: `"address.city"`. Inside a string already
  opened, the name or the value is inserted without its opening quote and with the closing one, and only string values
  are suggested.
- **Order and matching.** With nothing typed, the suggestions are in the order of their lists: the fields as the
  sample gave them, then the operators. With something typed, a suggestion that starts with it comes first; then one
  that starts with it ignoring case and the `$`; then a field one of whose later segments starts with it (`ci` finds
  `address.city`); then one that contains it, when at least 2 characters were typed. The rest is left out, and so is a
  suggestion equal to what was typed. Typing `$` leaves only what starts with `$`. Equal ranks keep the order of the
  lists.

Worked examples, `|` being the cursor, with the fields `_id`, `status` (values `"paid"` ×310, `"new"` ×120), `total`,
`address`, `address.city`, `items`, `items.sku`:

- `{ |` → key: `_id`, `status`, `total`, `address`, `address.city`, `items`, `items.sku`, `$and`, `$or`, `$nor`,
  `$expr`, `$text`, `$jsonSchema`, `$where`, `$comment`.
- `{ st|` → key: `status`, inserted as `status: `.
- `{ ci|` → key: `address.city`, inserted as `"address.city": `.
- `{ status: |` → value: `"paid"`, `"new"`. `{ status: "|` → value: the same two, inserted as `paid"` and `new"`.
- `{ total: { |` → key: the 17 operators of a field, `$eq` first. `{ total: { $g|` → `$gt`, `$gte`.
- `{ status: { $in: [|` → value: `"paid"`, `"new"`.
- `{ items: { $elemMatch: { |` → key: `sku`, then the operators.
- `{ $|` → key: the 8 operators of the top, and no field.
- `{ status: "paid" }|`, `{ a: 1 } // |` and `{ name: /ma|` → nothing.
- Sort: `{ total: |` → value: `1`, `-1`. Projection: `{ status: |` → value: `1`, `0`.

Acceptance:

- [ ] Each example above gives exactly the suggestions shown, in that order.
- [ ] `{ "addr|` suggests `address` and `address.city`, inserted as `address"` and `address.city"`.
- [ ] `{ addr|: 1 }` suggests `address` and `"address.city"` and inserts the name alone, since the `:` is there.
- [ ] The detail of `total`, present in 98% of the sample as a double or an int, is `double | int · 98%`; the detail
      of `status`, present in all of it, is `string`.
- [ ] With no field read yet, `{ |` in a filter suggests the 8 operators of the top.
- [ ] The same text, cursor, kind and fields always give the same suggestions.

### `query.field-hints` — The fields and frequent values of a collection

Reads a sample of the collection to know which fields its documents have, of which types, and which values come up
most, for the suggestions and for the builder.

- **Kind**: Read
- **Engine**: MongoDB
- **Function**: `src/features/query/field-hints.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: none: it is read once when a collection tab opens, and again the next time suggestions are needed
  after documents were written from the tab.
- **Reads**: a random sample of 500 documents, with their types kept apart (an `Int32` is not a `Double`).
- **Uses**: `schema.analyze`, `query.suggestions`, `query.builder`.
- **Ported from**: `src/collectionPanel.ts › CollectionPanel.loadFields` (`FIELD_SAMPLE`),
  `src/shared/complete.ts › fieldHints`, `src/webview/main.ts › fieldsOfCollection`, `fieldsBefore`.

What is sent: `db.orders.aggregate([{ $sample: { size: 500 } }], { maxTimeMS: 20000 })`.

Rules of the result:

- The sample is analyzed as the Schema section does (`schema.analyze`), and flattened to one entry per field path: the
  path, its types, the share of the sampled documents (or of the parent objects) that have it, and its 10 most
  frequent values with how many documents have each.
- The fields of the elements of an array are under the array's path: `items.sku` for `{ items: [{ sku: "A1" }] }`; the
  values of the elements count as values of the array's field.
- A field that only holds arrays of numbers also has the shortest and the longest length seen, for the path of a
  vector search.
- In a pipeline, from the second stage on, when the table shows the output of the stage before, the fields are those
  of the documents shown instead of the collection's.

Acceptance:

- [ ] Opening `shop.orders` sends `db.orders.aggregate([{ $sample: { size: 500 } }], { maxTimeMS: 20000 })` once.
- [ ] A field present in 400 of 500 sampled documents has the share 0.8; its 10 most frequent values come with their
      counts, the most frequent first.
- [ ] A collection of 30 documents gives the fields of all 30.
- [ ] A sample that fails or takes longer than 20 seconds gives no fields and shows no error: the suggestions are then
      operators only.
- [ ] After a document is inserted or edited from the tab, the next suggestion asked for reads the sample again.
- [ ] On a view the sample is read from the view.
- [ ] The values of the sample go to the window for the suggestions and nowhere else: they are not logged and not kept
      after the tab closes.

### `query.drag` — Drag a field or a value into the bar

A cell or a column header dragged from the table shows, over the bar, the conditions it can become; dropping it on one
adds that condition and runs the query.

- **Kind**: View
- **Engine**: MongoDB
- **Function**: `src/features/query/drag.ts › view(state)`
- **Entry points**: dragging a cell or a column header of the table (`@table`); the zones appear over **Filter**,
  **Sort** and **Project** (`@query-bar`).
- **Offered when**: in **Find**, for a cell that has a value and for any column header. A cell with no value, a
  `… more elements` cell and the row number cannot be dragged. In **Aggregate** the drop goes to the pipeline
  (`aggregate.show`).
- **Uses**: `query.add-condition`, `query.add-sort`, `query.add-projection`, `query.run`, `query.builder`,
  `table.arrange-columns`.
- **Ported from**: `src/webview/main.ts` (`zonesFor`, `showDropzones`, `showOptionZones`, `dropzone`, `addCondition`,
  `setOption`); README, **Drag & drop into the filter, sort and projection**.

The zones. Each shows its label and the field, written `items[].sku` for a field of the elements of an expanded array:

| Dragged | Over | Zone | Tooltip | Adds |
| --- | --- | --- | --- | --- |
| a cell | **Filter** | **= equals** | *Match this exact value* | the value |
| a cell | **Filter** | **≠ not equal** | *$ne* | `{ $ne: value }` |
| a cell with a number, a date or a string | **Filter** | **≥ from** | *$gte (combines with ≤ for a range)* | `{ $gte: value }` |
| a cell with a number, a date or a string | **Filter** | **≤ to** | *$lte (combines with ≥ for a range)* | `{ $lte: value }` |
| a cell with an array that is not empty | **Filter** | **∈ in** | *$in: any of these values* | `{ $in: value }` |
| a header | **Filter** | **exists** | *<field>: { $exists: true }* | `{ $exists: true }` |
| a header | **Filter** | **missing** | *<field>: { $exists: false }* | `{ $exists: false }` |
| a header | **Filter** | **is null** | *<field>: null* | `null` |
| a header | **Sort** | **▲ ascending** | *<field>: 1 (after the fields already in the sort)* | `1` |
| a header | **Sort** | **▼ descending** | *<field>: -1 (after the fields already in the sort)* | `-1` |
| a header of a field in the sort | **Sort** | **✕ remove** | *Remove <field> from the sort* | removes it |
| a header | **Project** | **include** | *<field>: 1 (only the included fields are shown, and _id)* | `1` |
| a header | **Project** | **exclude** | *<field>: 0 (every field but the excluded ones is shown)* | `0` |
| a header of a field in the projection | **Project** | **✕ remove** | *Remove <field> from the projection* | removes it |

Acceptance:

- [ ] Dragging the cell `status` of a paid order shows **= equals** and **≠ not equal**, **≥ from** and **≤ to**, each
      with `status`; dropping it on **= equals** writes `{ status: "paid" }` in **Filter**, flashes the field once and
      runs the query from the first page.
- [ ] Dragging a cell with `true`, with an `ObjectId` or with a sub-document shows **= equals** and **≠ not equal**
      only.
- [ ] Dropping `total` 10 on **≥ from**, then `total` 50 on **≤ to**, gives `{ total: { $gte: 10, $lte: 50 } }`.
- [ ] Dragging the `sku` of the second element of `items`, in an expanded array, shows the field as `items[].sku` and
      the tooltip ends with *· same element of items ($elemMatch)*; dropping it on **= equals** gives
      `{ items: { $elemMatch: { sku: "B2" } } }`.
- [ ] Dragging the header `createdAt` shows three zones over **Filter**, two over **Sort** and two over **Project**;
      with `createdAt` already in the sort, **✕ remove** is there too.
- [ ] With **Filter** holding `{ status: `, a drop on it changes nothing and shows *Fix the filter before adding
      conditions by drag & drop:* followed by the reason; with a bad sort or projection the message starts *Fix the
      sort before adding fields by drag & drop:* or *Fix the projection before adding fields by drag & drop:*.
- [ ] Letting go outside a zone changes nothing and the zones go away; `Esc` while dragging does the same.
- [ ] A drop updates the rows of the builder when it is open.
- [ ] A header dropped on another header moves the column and adds nothing to the query (`table.arrange-columns`).
- [ ] Everything a drop does can be done without dragging: the same entries are in **Add to filter**, **Sort** and
      **Project** of the menus of a cell and of a column header.

### `query.add-condition` — Add a condition to the filter

Merges one more condition on a field into the filter that is already in the bar, instead of replacing it.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/query/add-condition.ts › filterWithCondition(text, field, condition, within)`
- **Entry points**: the zones over **Filter** while a cell or a header is dragged (`@query-bar`); **Add to filter** in
  the menu of a cell (`@cell-menu`) and of a column header (`@column-menu`); a click on a value, a bar or a type in
  the Schema section and on a part of a chart, which add their condition the same way.
- **Uses**: `query.parse`, `query.format`, `query.run`.
- **Ported from**: `src/shared/query.ts › mergeCondition`, `mergeField`.

Rules of the result:

- The inputs: the text of **Filter**, a field path, a condition (a value, or an object of operators) and, for a field
  of the elements of an expanded array, the path of the array. The result is the new text, in the **filter** layout of
  `query.format`, or an error.
- An empty text is an empty filter. A text that `query.parse` refuses gives its error; a text that is not an object
  gives the error *must be an object*.
- When the field already has an object of operators and the condition is one too, the two are joined, the new operator
  replacing the same one: `$gte` then `$lte` make a range. In every other case the new condition replaces the field's.
- A field not yet in the filter is added after the others; one already there keeps its place.
- With the path of an array, the condition goes inside the `$elemMatch` of that array, under the field's name without
  the array's, joined in the same way; the other operators the array already has are kept, and a plain value it had is
  replaced. Conditions added this way on two fields of the same array therefore apply to the same element.
- The comments of the text are lost, since the text is written again.

Worked examples, as text + field, condition → text:

- empty + `status`, `"paid"` → `{ status: "paid" }`.
- `{ total: { $gte: 10 } }` + `total`, `{ $lte: 50 }` → `{ total: { $gte: 10, $lte: 50 } }`.
- `{ total: { $gte: 10 } }` + `total`, `42` → `{ total: 42 }`.
- `{ tags: "x" }` + `tags`, `{ $in: ["red", "blue"] }` → `{ tags: { $in: ["red", "blue"] } }`.
- `{ status: "paid" }` + `items.sku`, `"A1"`, within `items` →
  `{ status: "paid", items: { $elemMatch: { sku: "A1" } } }`.
- `{ items: { $elemMatch: { sku: "A1" } } }` + `items.qty`, `{ $gte: 4 }`, within `items` →
  `{ items: { $elemMatch: { sku: "A1", qty: { $gte: 4 } } } }`.
- `{ items: { $size: 2 } }` + `items.qty`, `{ $gte: 4 }`, within `items` →
  `{ items: { $size: 2, $elemMatch: { qty: { $gte: 4 } } } }`.
- `[1]` + anything → the error *must be an object*.

Acceptance:

- [ ] Each example above gives exactly the text shown.
- [ ] A result longer than 70 characters is written one top-level field per line.
- [ ] A field of a sub-document inside the elements, `items.options.color` within `items`, goes into the `$elemMatch`
      as `"options.color"`.
- [ ] An element of an array that is not a sub-document, such as one tag of `tags`, is added on the array itself:
      `{ tags: "red" }`.
- [ ] A value keeps its type in the text: an `Int64` is written `NumberLong(…)`, a `Double` with a whole value
      `Double(…)`, a `Decimal128` `NumberDecimal("…")`, a date `ISODate("…")`.

### `query.add-sort` — Add a field to the sort

Sets, changes or removes the direction of one field in the sort, keeping the others.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/query/add-sort.ts › sortWithField(text, field, direction)`
- **Entry points**: the zones over **Sort** while a column header is dragged (`@query-bar`); **Sort** in the menu of a
  column header (`@column-menu`).
- **Uses**: `query.parse`, `query.format`, `query.run`.
- **Ported from**: `src/shared/query.ts › mergeSort`.

Rules of the result:

- The inputs: the text of **Sort**, a field path, and `1`, `-1` or *remove*. The result is the new text on one line,
  or an error as for `query.add-condition`.
- A field already in the sort keeps its place, so its priority; a new one goes after the others.
- Removing the last field gives an empty text.
- A field of the elements of an array is sorted by its dotted path: `items.sku`.

Worked examples:

- empty + `total`, `-1` → `{ total: -1 }`.
- `{ status: 1 }` + `total`, `1` → `{ status: 1, total: 1 }`.
- `{ status: 1, total: -1 }` + `status`, `-1` → `{ status: -1, total: -1 }`.
- `{ status: 1 }` + `status`, *remove* → empty.

Acceptance:

- [ ] Each example above gives exactly the text shown.
- [ ] `{ "address.city": 1 }` + `total`, `-1` gives `{ "address.city": 1, total: -1 }`.
- [ ] With the text `{ a: `, the result is an error and the text is not changed.

### `query.add-projection` — Add a field to the projection

Includes or excludes one field in the projection, or removes it, and drops the entries MongoDB would not accept beside
it.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/query/add-projection.ts › projectionWithField(text, field, value)`
- **Entry points**: the zones over **Project** while a column header is dragged (`@query-bar`); **Project** in the
  menu of a column header (`@column-menu`).
- **Uses**: `query.parse`, `query.format`, `query.run`.
- **Ported from**: `src/shared/query.ts › mergeProjection`.

Rules of the result:

- The inputs: the text of **Project**, a field path, and `1` (include), `0` (exclude) or *remove*. The result is the
  new text on one line, or an error as for `query.add-condition`.
- Including or excluding a field other than `_id` first drops the entries that cannot stay with it: those of the other
  kind, except `_id`, which may be excluded from an inclusion; and those on a path above or below the field, which
  MongoDB refuses as a path collision.
- Including or excluding `_id` drops nothing.
- Removing the last entry gives an empty text.

Worked examples:

- `{ name: 1 }` + `email`, `1` → `{ name: 1, email: 1 }`.
- `{ name: 1, _id: 0 }` + `age`, `0` → `{ _id: 0, age: 0 }`.
- `{ address: 1 }` + `address.city`, `1` → `{ "address.city": 1 }`.
- `{ "address.city": 1, name: 1 }` + `address`, `1` → `{ name: 1, address: 1 }`.
- `{ name: 1 }` + `_id`, `0` → `{ name: 1, _id: 0 }`.
- `{ name: 1 }` + `name`, *remove* → empty.

Acceptance:

- [ ] Each example above gives exactly the text shown.
- [ ] An entry written `false` counts as an exclusion: `{ name: false }` + `age`, `1` gives `{ age: 1 }`.
- [ ] No result is a projection MongoDB refuses for mixing inclusions and exclusions or for a path collision.
