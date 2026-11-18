# Search

The Search documents page of a MongoDB connection: one text looked for in any field of the documents, nested or
inside arrays too, across the collections of a database or of every database. MongoDB has no query for "any field":
Datardo reads the documents of each collection, three collections at a time, and checks them itself. The page is a
View; what is read is two Reads (the collections of the scope, then their documents); what the typed text looks for
and which values match it are two Derivations with worked examples; opening the documents found in their collection
tab and copying an `_id` are Operations that write nothing to a deployment.

A search is bounded only by **Read**, the number of documents read per collection, and by **Stop**: it has no time
limit, and no `maxTimeMS` is sent.

### `search.show` — The Search documents page

One page tab per MongoDB connection where the user types a text, chooses where to look for it, and gets the documents
that contain it, grouped by collection, while the collections are still being read.

- **Kind**: View
- **Engine**: MongoDB
- **Function**: `src/features/search/show.ts › view(state)`
- **Entry points**: **Search** in the rail (`@rail`); **Search documents** under **Pages of** the connection in the
  tree island (`@tree`); **Search documents…** in the context menu of a database, a collection or a view of the tree
  island (`@tree-menu`), which sets the scope to that node; Go to (**Search documents**); the tool `open_search` of
  the MCP server, which fills the page and starts the search (`mcp.tab-tools`).
- **Offered when**: the current connection is a MongoDB connection. Opening the page connects the connection when it
  is not connected.
- **Reads**: `search.collections` and then `search.scan`, when **Search** is pressed; nothing when the page opens.
  The names for the lists of **In** and **Collections** are those the tree island last read (`tree.show`).
- **After**: the tab is titled **Search documents** in the group of its connection; a second request for the same
  connection makes the open tab active and, when it came from a node of the tree, sets the scope to that node without
  starting a search or stopping the one that runs.
- **Commands**: `search.show`.
- **Uses**: `search.collections`, `search.scan`, `search.text`, `search.match`, `search.open-in-collection`,
  `search.copy-id`, `document.inspect`, `document.open`, `runner.progress`, `runner.cancel`, `tab.open`,
  `tab.restore`, `tree.show`, `nav.inspector`, `nav.status-line`, `mcp.tab-tools`.
- **Ported from**: README, *Global search*; `src/search.ts` (`SearchPanel`), `src/webview/search.ts`,
  `src/mcpTools.ts` (`open_search`). Mongoster opens one page per scope, fixed when it opens; choosing the scope in
  the page, and several collections of a database as a scope, are new in Datardo.

What the page shows, from the top:

1. The search row (`@toolbar`): the text, with the placeholder **Text, _id, number or date to find in any field  — 
   Enter searches** (in **Regex** mode **^mario|rossi$  or  /^ma/i  —  Enter searches**); the mode, **Contains** or
   **Regex** (tooltip *Contains: the text anywhere in a value (an _id, a number or a date as a whole); Regex: a
   regular expression*); and **Search**, which is **Stop** while a search runs.
2. The scope row (`@toolbar`): **In**, with **Every database** and then each database of the connection; and, when a
   database is chosen, **Collections**, with **All collections** and then each collection and view of that database,
   of which any number can be ticked.
3. The options row (`@toolbar`): **Match case** (off); **Field names** (off; tooltip *Also find the text in field
   names*); **Views** (off; tooltip *Views usually show documents of a collection already searched*; disabled while
   collections are ticked, because a ticked view is always read); **Read** with **every document**, **the first
   1,000**, **the first 10,000**, **the first 100,000**, followed by **per collection** (**every document** to start
   with); and the summary of the search.
4. The error line, when a search could not start.
5. The results (`@list`), one group per collection that has at least one matching document or could not be read, in
   the order of `search.collections`.

Starting and stopping:

- `Enter` in the text, and **Search**, start a search with what the page shows. A search that runs is stopped first.
  Changing an option or the scope does not search again.
- **Stop**, `Esc` while a search runs, and **Cancel** on the status line (`runner.cancel`) stop the search: the
  cursors are closed, nothing more is read, and what was found stays, with *stopped* as its state. Closing the tab
  stops the search too.
- While a search runs the status line shows the work in progress as *Searching “mario” in Local* with **Cancel**
  (`runner.progress`).

The summary, its parts joined by ` · `:

| Part | When |
| --- | --- |
| *Listing the collections…* | until `search.collections` has answered |
| *2 of 14 collections read* | while the search runs |
| *14 collections* | when it ended |
| *14 collections (5 read)* | when it was stopped |
| *12,400 documents read* | always, once a document was read |
| *37 documents found in 3 collections* | when at least one was found |
| *1 not readable* | when collections could not be read |
| *2.4 s* | when it ended or was stopped |

and its state, *searching…*, *stopped*, *done* or *error*.

A group:

1. Its head: the collection's name (`database.collection` when **In** is **Every database**), a *view* badge for a
   view, then *3 documents*; while it is read *reading… 1,200 / 50,000* (documents read and the estimated count; the
   read count alone for a view); *first 1,000 read* when **Read** stopped it there; the server's message when it
   could not be read. Then **Open in collection** (tooltip *Open shop.orders filtered on the matching documents (up
   to 1,000)*). The head folds and unfolds the group.
2. One item per matching document, for the first 50 of the collection: its `_id` in mongosh syntax, **Copy _id**,
   and one line per match, up to 5 (`search.match`): the path of the field, the kind of value when it is not a
   string (**ObjectId**, **date**, **UUID**, **number**, **boolean**, **regex**, **code**, **field name**), and the
   text around the match with the match highlighted. Then *+3 more matches in this document* when it has more than
   5.
3. *+12 more documents — Open in collection* when the collection has more than 50.

Selecting an item (a click, or the arrow keys) shows the document in the inspector island (`document.inspect`); a
double click or `Enter` opens it in a document tab (`document.open`), read-only when the connection is read-only or
the collection is a view. The context menu of an item (`@item-menu`) has **Open document**, **Open in collection**
and **Copy _id**.

States:

- **Before the first search**: no results and no summary; the text has the focus.
- **Loading**: the groups appear and grow as their collections are read, at most every 200 ms.
- **Empty**: *No document contains “mario”.* when the search ended and found nothing; *No document contains “mario”
  in the collections read.* when it was stopped.
- **Error**: *Type something to search.* for a blank text; the engine's message for a regular expression that is not
  valid (*Invalid regular expression: /([/: Unterminated character class*); the server's message when the
  collections could not be listed. A collection that cannot be read does not stop the others.
- **Read-only**: the page writes nothing to the deployment and works the same; the status line shows **Read-only**.

The text, the mode, the scope and the options are kept with the tab and restored with it (`tab.restore`); the
results are not: a restored tab searches again only when the user asks.

Acceptance:

- [ ] **Search** in the rail on the connection Local opens one tab titled **Search documents** in Local's group, with
  **In** at **Every database**; pressing it again makes that tab active and opens no second one.
- [ ] **Search documents…** on the collection `orders` of `shop` opens the page with **In** at `shop` and only
  `orders` ticked in **Collections**, and starts no search.
- [ ] With a search running, **Search documents…** on another database changes **In** and the running search goes on
  with its own scope.
- [ ] `Enter` with a blank text shows *Type something to search.* and reads nothing.
- [ ] In **Regex** mode, `([` shows *Invalid regular expression: /([/: Unterminated character class* and reads
  nothing.
- [ ] A collection with 62 matching documents lists 50 items, then *+12 more documents — Open in collection*, and
  its head says *62 documents*.
- [ ] A document with 8 matches lists 5 lines and *+3 more matches in this document*.
- [ ] `Esc` during a search stops it: the summary says *14 collections (5 read)* and *stopped*, the groups found so
  far stay, and no further `find` is sent.
- [ ] A search that finds nothing says *No document contains “zzz”.*; stopped before its end it says *No document
  contains “zzz” in the collections read.*
- [ ] A collection the user may not read is counted as *1 not readable*, shows the server's message in its group, and
  the other collections are still searched.
- [ ] With collections ticked, **Views** is disabled and a ticked view is read.
- [ ] Selecting an item shows its document in the inspector island; `Enter` opens it in a document tab.
- [ ] `open_search` with the text `mario` and the database `shop` opens the page with them and starts the search;
  with `regex` true and the text `([` it answers *Invalid regular expression: …* and opens nothing.
- [ ] After a restart of Datardo the restored tab has its text, mode, scope and options, and no results.

### `search.collections` — Read the collections a search reads

The collections of the scope, in the order they are read and shown, each with its estimated number of documents.

- **Kind**: Read
- **Engine**: MongoDB
- **Function**: `src/features/search/collections.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: `search.show`, when a search starts.
- **Reads**:
  - with **In** at **Every database**, `db.adminCommand({ listDatabases: 1, nameOnly: true, authorizedDatabases: true
    })`; the databases `admin`, `local` and `config` are left out and the others sorted by name. When the user may
    not list the databases, the one database named in the connection string is used instead;
  - per database, `db.runCommand({ listCollections: 1, nameOnly: false, authorizedCollections: true })`; with
    collections ticked, only those are kept;
  - per collection that is not a view, `db.orders.estimatedDocumentCount()`, for the progress; a count that fails
    leaves the progress without a total.
- **Uses**: the rule of the GridFS area that tells which collections are the chunks of a bucket.
- **Ported from**: `src/search.ts › SearchPanel.collections`; README, *Global search*.

Rules:

1. With **All collections**, a collection is left out when its name starts with `system.`, when it holds the chunks
   of a GridFS bucket (`fs.chunks` when `fs.files` exists too: they are the contents of files, not documents to
   search), or when it is a view and **Views** is off.
2. A ticked collection is always read: a view, a `system.` collection or the chunks of a bucket too.
3. The collections of a database are sorted by name; the databases come in order of name.
4. A view has no estimated count.
5. A failure to list the collections of a database ends the search with the server's message in the error line.

Acceptance:

- [ ] On a deployment with the databases `admin`, `config`, `local`, `crm` and `shop`, **Every database** reads the
  collections of `crm` and then of `shop`, and sends nothing to the other three.
- [ ] In `shop`, with the collections `fs.chunks`, `fs.files`, `orders`, `system.views` and the view `recent`, and
  **Views** off, the collections read are `fs.files` and `orders`.
- [ ] With **Views** on, `recent` is read too, after `orders`, with a *view* badge and no estimated count.
- [ ] With `recent` and `fs.chunks` ticked in **Collections**, exactly those two are read.
- [ ] A user who may not run `listDatabases`, connected with a connection string that names `shop`, searches `shop`
  alone.
- [ ] A collection whose `estimatedDocumentCount` fails is still read, and its progress shows the documents read
  without a total.

### `search.scan` — Read the documents of the collections and find the matches

Reads each collection of the search from its first document and keeps the documents in which the text is found.

- **Kind**: Read
- **Engine**: MongoDB
- **Function**: `src/features/search/scan.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: `search.show`, after `search.collections`.
- **Reads**: per collection, `db.orders.find({})` in batches of 500, with `.limit(1000)`, `.limit(10000)` or
  `.limit(100000)` when **Read** is not **every document**. Nothing is filtered, sorted or projected by the server.
  The documents are read with their BSON types as they are (an `Int32` stays an `Int32`, a regular expression stays
  one). Three collections are read at the same time; the next starts when one ends.
- **Uses**: `search.match`, `search.text`, `runner.progress`, `runner.cancel`.
- **Ported from**: `src/search.ts › SearchPanel.search`, `scan`, `progress`, `stop`.

Rules:

1. Each document goes through `search.match`; one with at least one match is a result of its collection.
2. Per collection, the first 50 results are kept to be listed; the others are only counted. The `_id`s of the first
   1,000 results are kept for `search.open-in-collection`.
3. Progress (the documents read, the results) reaches the page at most every 200 ms; a collection without results
   reports the documents read every 250 documents.
4. A collection ends as *read*; as *first 1,000 read* when it gave as many documents as **Read** allows; or with the
   server's message when a read failed, keeping what was found before. The other collections go on.
5. There is no time limit: a collection is read to its end or to **Read**. Stopping the search, or starting another,
   closes every open cursor at once; a reply that arrives for a search that is no longer the current one is dropped.
6. The search has ended when every collection has; the time shown is from **Search** to then.

Acceptance:

- [ ] With **Read** at **the first 1,000**, a collection of 5,000 documents is sent `db.orders.find({}).limit(1000)`
  and its group says *first 1,000 read*; one of 800 documents says nothing of the kind.
- [ ] With **every document**, no `limit` is sent and no `maxTimeMS`.
- [ ] With 14 collections, no more than 3 have an open cursor at any time.
- [ ] A collection with 2,345 matching documents lists 50, counts *2,345 documents*, and keeps 1,000 `_id`s.
- [ ] A read that fails after 300 documents shows the server's message in that group with the results found in those
  300, and the summary counts *1 not readable*.
- [ ] After **Stop**, the cursors still open are closed and the page shows nothing that arrives later.
- [ ] A field holding `NumberInt(42)` is matched as an `Int32`: the text `42` finds it and the kind shown is
  **number**.

### `search.text` — What the typed text looks for

Turns the text of the search row, with the mode and **Match case**, into what is looked for in each value: a pattern,
the same pattern without regard to case, and, in **Contains** mode, the text to compare with numbers and booleans as
whole values.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/search/text.ts › wanted(text, mode, matchCase)`
- **Uses**: nothing.
- **Ported from**: `src/search.ts › needleOf`, `unwrap`, `escapeRe`.

Inputs: the text as typed, the mode (**Contains** or **Regex**), **Match case**. Output: the pattern, the pattern
without regard to case, and the whole text (in **Contains** mode only); or an error.

Rules:

1. The text is trimmed. A blank text is the error *Type something to search.*
2. **Contains**: a text written as a mongosh value gives the value inside. `ObjectId(…)`, `ISODate(…)`, `Date(…)`,
   `UUID(…)`, `NumberLong(…)`, `NumberInt(…)`, `NumberDecimal(…)`, `Long(…)`, `Int32(…)`, `Double(…)` and
   `Decimal128(…)`, with or without `new`, in any case, give what is between the parentheses without its quotes; a
   text between two `"` or two `'` gives what is between them. If nothing is left, the error is *Type something to
   search.*
3. **Contains**: the pattern finds that text literally (a `.` is a dot, a `*` is an asterisk), anywhere in a value,
   without regard to case unless **Match case** is on. The whole text is the same text.
4. **Regex**: a text written as `/source/flags` gives that source and those flags; any other text is the source. The
   flags `g` and `y` are dropped; `i` is added unless **Match case** is on or it is already there. A source that is
   not a valid regular expression is the error the engine gives. There is no whole text: numbers and booleans are
   matched by the pattern on their text.
5. The pattern without regard to case is the same pattern with `i`: `search.match` uses it for ObjectIds, UUIDs and
   dates, whatever **Match case** says.

Worked examples (typed → looked for):

| Typed | Mode, **Match case** | Looked for |
| --- | --- | --- |
| `mario` | Contains, off | `mario` anywhere, in any case: finds `Mario Rossi` |
| `Mario` | Contains, on | `Mario` in that case: does not find `mario rossi` |
| `  rossi  ` | Contains, off | `rossi` |
| `a.b` | Contains, off | `a.b` literally: does not find `axb` |
| `"mario rossi"` | Contains, off | `mario rossi` |
| `ObjectId("65f1c0a2b3d4e5f6a7b8c9d0")` | Contains, off | `65f1c0a2b3d4e5f6a7b8c9d0` |
| `new ObjectId('65f1c0a2b3d4e5f6a7b8c9d0')` | Contains, off | `65f1c0a2b3d4e5f6a7b8c9d0` |
| `ISODate("2024-03-15")` | Contains, off | `2024-03-15` |
| `NumberLong(42)` | Contains, off | `42`, and as a whole value 42 |
| `""` | Contains, off | error: *Type something to search.* |
| `^ma` | Regex, off | `/^ma/i` |
| `^ma` | Regex, on | `/^ma/` |
| `/^Ma/` | Regex, off | `/^Ma/i` |
| `/^ma/gs` | Regex, on | `/^ma/s` |
| `ObjectId("65f1")` | Regex, off | `/ObjectId("65f1")/i`: nothing is unwrapped in this mode |
| `([` | Regex, off | error: *Invalid regular expression: /([/: Unterminated character class* |

Acceptance:

- [ ] The examples above give the results shown.
- [ ] A text of spaces alone gives *Type something to search.* in both modes.
- [ ] `objectid( "65f1c0a2b3d4e5f6a7b8c9d0" )` gives `65f1c0a2b3d4e5f6a7b8c9d0`: the name is read in any case and
  the spaces inside the parentheses are dropped.
- [ ] In **Contains** mode `1+1` finds the string `1+1=2` and not `11`.
- [ ] In **Regex** mode with **Match case** on, `/abc/i` keeps its `i`.

### `search.match` — The values of a document that match

Finds, in one document, every value (and, when asked, every field name) in which the text is found, with what the
page shows of each match.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/search/match.ts › matches(document, wanted, fieldNames)`
- **Uses**: `search.text`.
- **Ported from**: `src/search.ts › matchDocument`, `leafOf`, `sameNumber`, `hit`; README, *Global search*.

Inputs: a document with its BSON types, the result of `search.text`, and **Field names**. Output: nothing when the
document has no match; otherwise its `_id`, the first 5 matches in the order of the document's fields, and the number
of matches beyond those 5.

How each type of value is searched:

| Value | Text it is matched on | How |
| --- | --- | --- |
| String, symbol | the string | the pattern, anywhere |
| `Int32`, `Double`, `Long`, `Decimal128` | the number as text (`42`, `1.5`, `42.0`) | **Contains**: as a whole value, rule 3; **Regex**: the pattern |
| Boolean | `true` or `false` | **Contains**: the whole text equal to it; **Regex**: the pattern |
| Date | its ISO text in UTC, `2024-03-15T10:30:00.000Z` | the pattern without regard to case, anywhere |
| ObjectId | its 24 hexadecimal digits, lower case | the pattern without regard to case, anywhere, with rule 4 |
| UUID (binary of subtype 4, 16 bytes) | `8-4-4-4-12` hexadecimal digits with dashes, lower case | as an ObjectId |
| Regular expression | its pattern, without the flags | the pattern, anywhere |
| JavaScript code | the code | the pattern, anywhere |
| Null, `MinKey`, `MaxKey`, timestamp, other binary data, a date that is not valid | nothing | never matches |

Rules:

1. Every field is visited, in the order of the document: the fields of sub-documents with the path joined by dots
   (`customer.email`), the elements of arrays with their index in the path (`items.0.sku`), to any depth.
2. With **Field names**, the name of each field is matched with the pattern too, before its value; such a match has
   the kind **field name** and the path of the field.
3. A number matches in **Contains** mode when its text is the whole text, or when both are finite numbers of the same
   value: `42` finds `42`, `NumberLong(42)` and `NumberDecimal("42.0")`, and not `420` or `142`.
4. In **Contains** mode a whole text shorter than 6 characters does not match part of an ObjectId or of a UUID (`42`
   is a number, not a piece of an `_id`).
5. A match shows up to 40 characters before it and 40 after it, with `…` on the side where the value goes on; a
   matched text longer than 120 characters is cut there and ends with `…`; new lines and tabs are shown as one space.
6. The 6th match of a document and those after it are counted and not kept.
7. The `_id` is shown in mongosh syntax: `ObjectId("65f1c0a2b3d4e5f6a7b8c9d0")`, `42`, `"A-17"`, `{ a: 1, b: 2 }`.

Worked examples, in **Contains** mode with **Match case** off unless said:

| Document | Text | Matches |
| --- | --- | --- |
| `{ _id: 1, name: "Mario Rossi" }` | `rossi` | `name`: Mario **Rossi** |
| `{ _id: 1, items: [{ sku: "A-17" }, { sku: "B-02" }] }` | `b-02` | `items.1.sku`: **B-02** |
| `{ _id: 1, qty: NumberLong(42), total: 420 }` | `42` | `qty`, kind **number**; not `total` |
| `{ _id: 1, price: NumberDecimal("42.0") }` | `42` | `price`, kind **number** |
| `{ _id: 1, code: "A42" }` | `42` | `code`: A**42** |
| `{ _id: 1, active: true, note: "true story" }` | `true` | `active`, kind **boolean**; `note`: **true** story |
| `{ _id: 1, at: ISODate("2024-03-15T10:30:00Z") }` | `2024-03-15` | `at`, kind **date**: **2024-03-15**T10:30:00.000Z |
| `{ _id: ObjectId("65f1c0a2b3d4e5f6a7b8c9d0") }` | `65F1C0A2B3D4E5F6A7B8C9D0` | `_id`, kind **ObjectId** |
| `{ _id: 2, customerId: ObjectId("65f1c0a2b3d4e5f6a7b8c9d0") }` | `b3d4e5` | `customerId`, kind **ObjectId** |
| `{ _id: 2, customerId: ObjectId("65f1c0a2b3d4e5f6a7b8c9d0") }` | `65f1c` | none: 5 characters |
| `{ _id: 3, total: 1250 }` | `^12` in **Regex** mode | `total`, kind **number**: **12**50 |
| `{ _id: 4, status: "paid" }` | `stat` with **Field names** | `status`, kind **field name**: **stat**us |
| `{ _id: 5, deletedAt: null }` | `null` | none |

Acceptance:

- [ ] The examples above give the matches shown.
- [ ] Pasting the ObjectId of a customer finds the customer by its `_id` and every document of other collections
  that holds it in a field or in an array.
- [ ] A UUID `3f2b8c1e-5d4a-4e7b-9c6f-1a2b3c4d5e6f` is found by `5d4a-4e7b` and by `3F2B8C1E`, and not by `5d4a`.
- [ ] A string of 500 characters with the match in its middle shows `…`, 40 characters, the match, 40 characters,
  `…`.
- [ ] A match that spans a new line is shown on one line, with a space for the new line.
- [ ] A document with 8 matching fields returns 5 matches and 3 more.
- [ ] With **Match case** on, `Mario` does not find `mario`, and `65F1C0…` still finds the ObjectId `65f1c0…`.
- [ ] `1e2` finds a field holding 100; `true` does not find a field holding the number 1.

### `search.open-in-collection` — Open the documents found in their collection

Opens the collection tab of a group filtered on the documents the search found in it, where they can be seen as a
table, sorted, changed and exported.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/search/open-in-collection.ts › plan(context, answers)`
- **Entry points**: **Open in collection** on the head of a group and after *+12 more documents —* (`@list`), for
  every document found in that collection; **Open in collection** in the context menu of an item (`@item-menu`), for
  that document alone.
- **Offered when**: the group has at least one matching document.
- **Plan**: one app step: `open shop.orders with the filter { _id: { $in: [ObjectId("65f1c0a2b3d4e5f6a7b8c9d0"),
  ObjectId("65f1c0a2b3d4e5f6a7b8c9d1")] } }`, with the `_id`s of the first 1,000 documents found, in the order they
  were found, in mongosh syntax. With one document the filter is `{ _id: ObjectId("65f1c0a2b3d4e5f6a7b8c9d0") }`.
  The sort and the projection are empty.
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone: nothing is written; closing the tab is enough.
- **After**: the collection tab is active on its Documents section with the query run (`query.run`). When the
  collection has more matching documents than the 1,000 kept, a notification says *orders: the filter has the first
  1,000 of 2,345 matching documents.*
- **Uses**: `tab.open`, `query.bar`, `query.format`, `query.run`, `runner.notify`.
- **Ported from**: `src/search.ts › SearchPanel.showInCollection`. The entry on one item is new in Datardo.

Acceptance:

- [ ] On a group of `shop.orders` with 3 documents found, **Open in collection** opens the collection tab with the
  filter `{ _id: { $in: [<the three _ids>] } }` and the table shows those 3 documents.
- [ ] On a group with one document found the filter is `{ _id: <its _id> }`, without `$in`.
- [ ] On a group with 2,345 documents found the filter has 1,000 `_id`s and the notification says *orders: the
  filter has the first 1,000 of 2,345 matching documents.*
- [ ] **Open in collection** in the context menu of an item opens the filter `{ _id: <that _id> }`, whatever the
  number of documents of its group.
- [ ] An `_id` that is a `Long`, a string, a UUID or a sub-document is written in the filter with its type
  (`NumberLong(42)`, `"A-17"`, `UUID("3f2b8c1e-5d4a-4e7b-9c6f-1a2b3c4d5e6f")`, `{ a: 1, b: 2 }`) and finds its
  document.
- [ ] While the search still runs, the filter has the documents found so far.
- [ ] On a read-only connection the entry works and the collection tab opens read-only.

### `search.copy-id` — Copy the _id of a document found

Copies the `_id` of a result, as the page shows it, to paste it in a filter or in another search.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/search/copy-id.ts › plan(context, answers)`
- **Entry points**: **Copy _id** beside the `_id` of an item (`@list`) and in its context menu (`@item-menu`).
- **Plan**: one app step: `copy ObjectId("65f1c0a2b3d4e5f6a7b8c9d0") to the clipboard`, the `_id` in mongosh syntax.
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone: nothing is written to a deployment.
- **After**: a notification *Copied to the clipboard* that leaves by itself after 2 seconds.
- **Uses**: `runner.notify`.
- **Ported from**: `src/search.ts › SearchPanel.receive` (`copy`), `src/webview/search.ts › renderResult`.

Acceptance:

- [ ] **Copy _id** on the document with the `_id` `ObjectId("65f1c0a2b3d4e5f6a7b8c9d0")` puts exactly
  `ObjectId("65f1c0a2b3d4e5f6a7b8c9d0")` on the clipboard and says *Copied to the clipboard*.
- [ ] An `_id` that is the string `A-17` is copied as `"A-17"`, with its quotes.
- [ ] Pasting what was copied in the text of the page and pressing `Enter` finds the same document by its `_id`.
- [ ] **Copy _id** does not select the item and does not open the document.
