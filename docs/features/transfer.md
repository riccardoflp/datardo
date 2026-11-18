# Transfer

Moving documents in and out of a collection: exporting them to a JSON, JSON Lines or CSV file, importing such a file,
copying a collection to another database or connection, and generating test documents that look like a
collection's. Backups in mongodump's formats are in [backup.md](backup.md); exports that run by themselves are
scheduled tasks (`task.run`).

Export, import, copy and generate are long work: each shows on the status line what it is doing and how far it is
(`runner.progress`), with **Cancel** (`runner.cancel`). Documents are always read with every value in its BSON type
(`Int32` and `Double` apart, a regular expression with its flags), so that what is written elsewhere is what was
read.

### `transfer.export` — Export documents to a file

Writes what the table shows, the documents of a collection or view, or the selected rows to a JSON, JSON Lines or CSV
file, to read elsewhere or to import again.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/transfer/export.ts › plan(context, answers)`
- **Entry points**: **Export** in the toolbar of the Documents section of a collection tab (`@toolbar`), which exports
  what the table shows: the query, or the pipeline up to the stage shown; **Export N documents…** in the menu of a
  selected row (`@row-menu`) and on the selection bar (`@selection-bar`); **Export collection…** in the context menu
  of a collection or view of the tree (`@tree-menu`); Go to (**Export collection…**), for the collection of the active
  tab.
- **Offered when**: on collections and views, read-only connections included. **Export N documents…** when every
  selected row has an `_id`.
- **Asks**:
  1. the format, in a list titled **Export \<collection\>**: **JSON** (*Array of documents, readable (relaxed Extended
     JSON)*), **JSON Lines** (*One document per line, canonical Extended JSON: keeps every type, re-importable*),
     **CSV** (*The columns shown in the table; expanded arrays give one row per element*);
  2. from the toolbar only, in a list titled **Export \<collection\> as \<format\>**: *All results (\<count\>
     documents)*, without the count when it is not known, or *Current page (\<first\>–\<last\>)*;
  3. the file, in the system's save dialog titled **Export \<collection\>**, which proposes `<collection>.json`,
     `<collection>.jsonl` or `<collection>.csv` in the folder of the last export, otherwise in the home folder.
- **Reads**: for a query, `db.orders.find(<filter>, <projection>).sort(<sort>).skip(<skip>).limit(<limit>)`; for a
  pipeline, `db.orders.aggregate([<the stages up to the one shown>, { $skip: <skip> }, { $limit: <limit> }], {
  allowDiskUse: true })`; both in batches of 1,000, and without skip and limit for all the results. From the tree:
  the whole collection, with no filter, sort or projection. The selection: the query's filter replaced by `{ _id: {
  $in: [<ids>] } }`, or a `$match` on the `_id`s after the stage shown.
- **Plan**: `write <file>`.
  - JSON: `[`, then each document as relaxed Extended JSON indented by 2 spaces, separated by `,` and a new line,
    then `]`; `[]` when there are no documents.
  - JSON Lines: one document per line as canonical Extended JSON.
  - CSV: a UTF-8 byte order mark, then the table of `transfer.csv-write`, written once every document has been read.
- **Danger**: None. An existing file is replaced only after the save dialog's own confirmation.
- **Read-only**: Allowed, because it writes nothing to a deployment; also on views.
- **Undo**: Cannot be undone, and needs none: it writes a file, not a deployment.
- **After**: the notification *Exported \<n\> documents to \<file name\>.* with **Open** (the file, in the system's
  application for it) and **Reveal** (the file, in the system's file manager).
- **Refuses**: before asking anything, a pipeline whose last stage shown is `$out` or `$merge`: *Export failed: A
  pipeline ending with $out writes to the database and can't be exported. Select an earlier stage to export its
  output.* (`/writes`); a filter, sort, projection or stage that does not parse: *Export failed: \<error\>*
  (`/invalid-query`). An error while reading or writing: *Export failed: \<error\>*, and the partial file is removed.
- **Commands**: `transfer.export`.
- **Uses**: `transfer.csv-write`, `table.columns`, `table.selection`, `query.parse`, `aggregate.show`,
  `runner.progress`, `runner.cancel`, `runner.notify`; `task.run` writes its exports the same way.
- **Ported from**: Mongoster's card transfer.export; `src/transfer.ts` (`exportDocuments`, `exportSource`,
  `writeExport`, `FileWriter`), `src/queries.ts` (`buildPipeline`), `src/shared/csv.ts`, `src/shared/columns.ts`.

Acceptance:

- [ ] The list of formats shows **JSON** *Array of documents, readable (relaxed Extended JSON)*, **JSON Lines** *One
  document per line, canonical Extended JSON: keeps every type, re-importable* and **CSV** *The columns shown in the
  table; expanded arrays give one row per element*.
- [ ] From **Export** with a page of 50 from document 101 and 1,234 results, the second list offers *All results
  (1,234 documents)* and *Current page (101–150)*; the page exports exactly those 50 documents.
- [ ] **Export collection…** on a view exports all its documents, and does not ask which results.
- [ ] A JSON export of no documents is the text `[]` and a new line.
- [ ] A JSON Lines export writes an `Int32` 42 as `{"$numberInt":"42"}`, a `Double` 42 as `{"$numberDouble":"42.0"}`,
  an `Int64` as `$numberLong`, a `Decimal128` as `$numberDecimal`, dates as `$date` with `$numberLong`, and
  `ObjectId`s as `$oid`.
- [ ] A `Double` with a whole value, also one beyond the 32-bit range, exported as JSON Lines and imported again
  (`transfer.import`) is still a `Double`.
- [ ] A CSV file starts with the bytes `EF BB BF` and has the visible columns of the collection tab, in its order.
- [ ] Every 1,000 documents the status line's **Exporting \<collection\>** says *\<n\> documents*.
- [ ] **Cancel** removes the partial file and says *Export cancelled.*
- [ ] With the pipeline shown up to a `$merge` stage, nothing is asked and the message names `$merge`.
- [ ] The export works on a read-only connection.

### `transfer.csv-write` — Documents as CSV

How documents become the rows and cells of a CSV export, the same way the table shows them, so that a spreadsheet
reads them.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/transfer/csv-write.ts › csvTable(documents, columns)`, with `csvValue(value)` and
  `toCsv(table)` in the same module.
- **Inputs**: the documents as relaxed Extended JSON, and the columns of the table (`table.columns`): the columns
  built from the documents with the expanded paths, then the user's layout, with hidden columns left out and the
  chosen order.
- **Output**: rows of text cells, the header first, and the CSV text.
- **Rules**:
  - The header has one cell per leaf column, its field path (`address.city`). A column that is not expanded is one
    leaf.
  - A document gives one row. An expanded array gives one row per element; the document's other values are repeated
    on each of those rows. An empty array is one row.
  - A value that is not an object at an expanded path goes in the first column of the group.
  - Cells (`csvValue`): missing and `null` are empty; strings as they are; numbers and booleans as text; `$oid`,
    `$numberDecimal`, `$numberLong`, `$numberInt`, `$numberDouble` as their inner text; `$date` as its ISO text (a
    date given as `$numberLong` converted to ISO); anything else as compact JSON.
  - Text (`toCsv`): a cell is quoted when it holds `"`, `,`, CR or LF, or starts or ends with white space; `"` inside
    is doubled; cells are joined by `,` and every row ends with CRLF.
- **Uses**: `transfer.export`, `task.run`, `table.copy-as` (copying the selected rows as CSV), `table.columns`.
- **Ported from**: Mongoster's card transfer.csv-write; `src/shared/csv.ts` (`csvTable`, `csvValue`, `toCsv`),
  `src/shared/columns.ts`, `test/unit/csv.test.ts`.

Examples:

| Input | Output |
| --- | --- |
| `{ $date: { $numberLong: '0' } }` | `1970-01-01T00:00:00.000Z` |
| `{ a: 1 }` | `{"a":1}` |
| `[1, 'x']` | `[1,"x"]` |
| the table `[['a', 'b'], ['1', 'x,y']]` | `a,b` CRLF `1,"x,y"` CRLF |
| with `address` and `items` expanded, `{ _id: 1, name: 'a', address: { city: 'Rome' }, items: [{ sku: 'x', qty: 1 }, { sku: 'y' }] }` | header `_id,name,address.city,items.sku,items.qty`, rows `1,a,Rome,x,1` and `1,a,Rome,y,` |
| the cell ` padded` (a space first) | `" padded"` |
| the cell `say "hi"` | `"say ""hi"""` |

Acceptance:

- [ ] Each row of the table above gives its output.
- [ ] With nothing expanded, three documents give four rows: the header and one per document.
- [ ] A document whose expanded array is empty gives one row, with the array's columns empty.
- [ ] A hidden column is not in the header, and the columns follow the order the user chose.

### `transfer.import` — Import documents from a file

Inserts the documents of a JSON, JSON Lines or CSV file, or of a file in mongosh syntax, into a collection.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/transfer/import.ts › plan(context, answers)`
- **Entry points**: **Import documents…** in the context menu of a collection of the tree (`@tree-menu`); Go to
  (**Import documents…**), for the collection of the active tab.
- **Offered when**: on a collection, not on a view, not on a read-only connection.
- **Asks**: the file, in the system's open dialog titled **Import into \<database\>.\<collection\>**, with the
  filters *JSON, JSON Lines, CSV* (`json`, `jsonl`, `ndjson`, `csv`) and *All files*.
- **Reads**: the file (`transfer.import-files`).
- **Plan**: `db.<collection>.insertMany([<1,000 documents>], { ordered: false })`, one step per batch of 1,000. While
  the undo history records, a document without `_id` is given a new `ObjectId` before it is inserted, so that the
  undo can delete it.
- **Danger**: Confirm: **Import \<n\> documents from \<file\> into \<database\>.\<collection\>?**, with *\<k\> of them
  have an _id: documents whose _id already exists are skipped.* or *New _id values will be generated.*, then the line
  of `undo.note`; button **Import**.
- **Read-only**: Refused on a read-only connection (`/read-only`) and on a view (`/view`): *\<database\>.\<collection\>
  is read-only.*
- **Undo**: Recorded in the undo history (`undo.record`) as one operation `Import <file name>`, which keeps the `_id`s
  of the inserted documents; not recorded beyond `datardo.undo.maxDocumentsPerOperation` documents, and the
  confirmation says so.
- **Publishes**: Not published: import is one of the writes Mongoster documents as not published, and Datardo keeps
  that list until the question is answered (`oplog.publish`).
- **After**: when something was inserted, the open pages of the collection and the tree read again. *Imported \<i\> of
  \<n\> documents into \<collection\>.*, with **Undo**; with failures, a warning: *Imported \<i\> of \<n\> documents
  into \<collection\>. \<f\> failed: \<first error\>*, with **Undo** too when something was inserted.
- **Refuses**: a file that does not parse: *Can't import \<file\>: \<error\>* (`/unreadable`); a file without
  documents: *\<file\> contains no documents.* (`/empty`). An error of the server other than a write error: *Import
  failed: \<error\>*.
- **Commands**: `transfer.import`.
- **Settings**: `datardo.undo.enabled`, `datardo.undo.maxDocumentsPerOperation`.
- **Uses**: `transfer.import-files`, `transfer.csv-read`, `undo.record`, `undo.note`, `undo.limits`,
  `undo.notification`, `connection.read-only`, `runner.confirm`, `runner.progress`, `runner.cancel`, `tree.refresh`.
- **Ported from**: Mongoster's card transfer.import; `src/transfer.ts` (`importDocuments`, `insertDocuments`,
  `parseImport`), `src/shared/csv.ts`, `src/history.ts`.

Acceptance:

- [ ] A file of 2,500 documents is inserted in 3 batches; the status line's **Importing \<file\>** says *1,000 of
  2,500*, *2,000 of 2,500*, *2,500 of 2,500*.
- [ ] Of 10 documents of which 2 have an `_id` already in the collection, 8 are inserted and the warning ends with *2
  failed: E11000 duplicate key error …*; the documents after the duplicates are inserted too.
- [ ] **Undo** in the notification deletes exactly the inserted documents: a document that failed on an existing
  `_id` is not touched.
- [ ] Import is not in the menu of a view or of a collection of a read-only connection; started on one from Go to, it
  says *\<database\>.\<collection\> is read-only.* and opens no dialog.
- [ ] A file of 20,000 documents shows *This can't be undone: the undo history keeps operations of up to 10,000
  documents.* in its confirmation.
- [ ] On a connection that publishes for redis-oplog, an import sends no event.
- [ ] **Cancel** stops between batches; the documents already inserted stay, and are one operation of the undo
  history.
- [ ] An empty file, or one with only white space, says *\<file\> contains no documents.* and asks nothing more.

### `transfer.import-files` — What an import file holds

How the text of an import file becomes documents.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/transfer/import-files.ts › parseImport(text, fileName)`
- **Inputs**: the text of the file and its name.
- **Output**: the documents, with their BSON types, or an error.
- **Rules**:
  - A file whose name ends with `.csv` (any case) is CSV (`transfer.csv-read`). Any other file is JSON-like.
  - JSON-like: a leading byte order mark is removed and the text trimmed; empty text gives no documents.
    - Text starting with `[` is one array of documents. It is read as JSON; if that fails, as mongosh syntax
      (`query.parse`); if both fail, the JSON error is reported. A value that is not an array: *Expected an array of
      documents*.
    - Otherwise each line that is not blank is a document (JSON Lines), JSON first, mongosh syntax second. If the
      first line fails, the whole text is tried as one document (a document written on several lines). Otherwise the
      error is *Line \<n\>: \<error\>*.
  - Every value must be an object: *Document \<n\> is not an object*.
  - Values become BSON as Extended JSON says: canonical and relaxed Extended JSON keep their types; a plain whole
    number becomes an `Int32` (an `Int64` beyond 32 bits), another plain number a `Double`.
- **Uses**: `transfer.import`, `transfer.csv-read`, `query.parse`.
- **Ported from**: Mongoster's card transfer.import-files; `src/transfer.ts` (`parseImport`, `parseJson`,
  `parseLines`), `src/shared/query.ts` (`parseQuery`).

Examples:

| Text | Documents |
| --- | --- |
| `[{ "_id": { "$oid": "64b000000000000000000001" } }]` | one document with an `ObjectId` `_id` |
| `{ "a": 1 }` and `{ "a": 2 }` on two lines | two documents, `a` an `Int32` |
| `{ when: ISODate("2024-01-01T00:00:00Z") }` | one document with a date |
| `{"price":{"$numberDouble":"42.0"}}` | one document, `price` a `Double` |
| `{ "n": 3000000000 }` | one document, `n` an `Int64` |
| a document written on five lines, the first being `{` | one document |
| `[1, 2]` | *Document 1 is not an object* |
| `{ "a": 1 }` then `{ oops` on the second line | *Line 2: \<error\>* |
| `{ "a": 1 }` in a file named `DATA.CSV` | read as CSV: no documents, the text is a header without rows |

Acceptance:

- [ ] Each row of the table above gives its result.
- [ ] A file that starts with a byte order mark is read as one without it.
- [ ] Blank lines between the documents of a JSON Lines file are skipped.

### `transfer.csv-read` — CSV rows as documents

How CSV text is read and turned into documents for an import.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/transfer/csv-read.ts › parseCsv(text)` and `csvToDocuments(rows)`
- **Inputs**: the text of a CSV file.
- **Output**: the documents as relaxed Extended JSON, or an error.
- **Rules**:
  - Parsing (RFC 4180): a leading byte order mark is skipped; a field starting with `"` is quoted until the next lone
    `"`, and `""` inside it is one `"`; a `"` in the middle of an unquoted field is kept; rows end at LF, CR or CRLF;
    a last row without a new line counts; blank lines are dropped, a row of empty fields is kept. An open quote at the
    end: *Unterminated quoted field*.
  - The first row is the header. A header with dots builds sub-documents (`address.city` → `{ address: { city } }`).
  - A row with more fields than the header: *Row \<n\> has \<k\> fields, the header has \<h\>* (`n` counts the header
    as row 1). Empty cells are left out of the document.
  - Values, in this order: an integer (`-?(0|[1-9]\d*)`) is a number when it is a safe integer, otherwise an `Int64`
    (`{ $numberLong }`); a decimal or exponent number is a number; `true` and `false`; `null`; an ISO date ending in
    `Z` (`YYYY-MM-DDTHH:MM:SS[.fff]Z`) is a date; 24 hexadecimal characters under the header `_id` are an `ObjectId`;
    text starting with `[` or `{` that parses as JSON is that JSON; anything else is a string.
- **Uses**: `transfer.import-files`.
- **Ported from**: Mongoster's card transfer.csv-read; `src/shared/csv.ts` (`parseCsv`, `csvToDocs`),
  `test/unit/csv.test.ts`.

Examples:

| Cell or rows | Value |
| --- | --- |
| `00123` | the string `00123` |
| `12345678901234567890` | `{ $numberLong: '12345678901234567890' }` |
| `1e3` | the number 1000 |
| `2024-01-02` | the string `2024-01-02` |
| `2024-01-02T03:04:05Z` | a date |
| `{nope` | the string `{nope` |
| header `a.b,a.c,d`, row `1,,x` | `{ a: { b: 1 }, d: 'x' }` |
| a row of empty cells | `{}` |
| `64b000000000000000000001` under `ref` | a string |
| `64b000000000000000000001` under `_id` | an `ObjectId` |
| header `a,b`, row `1,2,3` | *Row 2 has 3 fields, the header has 2* |
| text with no header | no documents |

Acceptance:

- [ ] Each row of the table above gives its result.
- [ ] LF, CR and CRLF line ends give the same rows, and a last row without a new line is read.
- [ ] `"a ""quoted"" word"` is the field `a "quoted" word`; `"open` at the end of the text is *Unterminated quoted
  field*.
- [ ] The table of `transfer.csv-write`, written as CSV and read again, gives documents with the same values.

### `transfer.copy-collection` — Copy a collection to another database or connection

Copies the documents of a collection or view, optionally filtered, with its indexes and options, into a collection of
any database on any MongoDB connection, for example from production to a local server.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/transfer/copy-collection.ts › plan(context, answers)`
- **Entry points**: **Copy collection to…** in the context menu of a collection or view of the tree (`@tree-menu`);
  Go to (**Copy collection to…**), for the collection of the active tab.
- **Offered when**: on collections and views, also of read-only connections: they can be the source.
- **Asks**, each titled **Copy \<database\>.\<collection\>: \<step\>**:
  1. **destination connection** (*Where the copy goes*): the MongoDB connections, the source's first, marked *same
     connection*, then the others; read-only ones are marked *read-only*;
  2. **database on \<connection\>**: the source's database name first if it exists there, the others except `admin`,
     `local` and `config`, and **New database…**, which asks *Database name on \<connection\>* and answers *This
     database already exists* when it does;
  3. **destination collection** (*Collection in \<connection\> › \<database\> (an existing one can be appended to or
     replaced)*): `<collection>_copy` in the same database, otherwise `<collection>`; refused names: *That is the
     collection being copied*, *A view has this name*;
  4. when the collection exists, **\<collection\> exists in \<connection\> › \<database\>**: **Append** (*insert the
     documents; those whose _id already exists are skipped*), **Replace matching** (*documents with the same _id are
     replaced, the others inserted*), **Drop and recreate** (*the \<count\> documents and indexes of \<collection\>
     are deleted first*);
  5. **filter (optional)** (*Only the documents matching this filter are copied; leave empty for all*), in mongosh
     syntax, checked as it is typed, with the example `{ status: "active", createdAt: { $gte: ISODate("2024-01-01") }
     }`; empty copies everything;
  6. **also copy**, not for a view, both checked: **Indexes** (*\<n\> besides _id*, when there are any) and, for a new
     or recreated collection, **Collection options** (*validation rules, capped size, collation, time series…*).
- **Reads**: `listDatabases` and `listCollections` of the destination; `listIndexes` and, for the options,
  `listCollections` of the source; the number of documents, `db.orders.countDocuments(<filter>, { maxTimeMS: 60000
  })` with a filter or on a view, `db.orders.estimatedDocumentCount()` otherwise; then `db.orders.find(<filter>)` in
  batches of 1,000.
- **Plan**, on the destination:
  1. with **Drop and recreate**, `db.<collection>.drop()`;
  2. for a new or recreated collection, `db.createCollection("<collection>", <options>)`, where the options are empty
     unless **Collection options** is checked, and then hold only `validator`, `validationLevel`, `validationAction`,
     `capped`, `size`, `max`, `collation`, `timeseries`, `expireAfterSeconds`, `clusteredIndex` and
     `changeStreamPreAndPostImages`;
  3. per batch of 1,000, `db.<collection>.insertMany([<documents>], { ordered: false })`, or with **Replace
     matching** `db.<collection>.bulkWrite([{ replaceOne: { filter: { _id: <id> }, replacement: <document>, upsert:
     true } }, …], { ordered: false })`, with `insertOne` for a document without `_id`;
  4. last, unless cancelled, `db.<collection>.createIndexes([<index>])` for each index except `_id_` and a clustered
     one, without its `v` and `ns`.
- **Danger**: Confirm: **Copy \<n\> documents of \<source connection\> › \<database\>.\<collection\> to
  \<destination\>?**, with *Destination: \<into the new collection | appending to | replacing matching documents in |
  dropping and recreating\> \<destination\>.*, *Filter: \<filter\>* or *All documents.*, *Indexes are created after
  the documents.*, *The collection is created with the options of the source.*, and *Dropping the destination can't
  be undone.* or the line of `undo.note`; button **Copy**. Destructive with **Drop and recreate**: the destination's
  documents and indexes are lost, and the user types the name of the destination collection.
- **Read-only**: Refused when the destination connection is read-only: *The connection \<name\> is read-only: it
  can't receive a copy.* (`/read-only`). A read-only connection can be the source.
- **Undo**: Recorded in the undo history (`undo.record`) for **Append** and **Replace matching**, as `Copy <source
  connection> › <database>.<collection>` (`Copy filtered …` with a filter), on the destination: the `_id`s of the
  inserted documents and, for **Replace matching**, the replaced documents as they were, kept batch by batch. Cannot
  be undone with **Drop and recreate**: the confirmation says *Dropping the destination can't be undone.* Not
  recorded beyond `datardo.undo.maxDocumentsPerOperation` documents, which the confirmation says, or beyond the size
  of an operation, which is asked before the batch that passes it (`undo.record`).
- **Publishes**: Not published: copying is one of the writes Mongoster documents as not published, and Datardo keeps
  that list until the question is answered (`oplog.publish`).
- **After**: the tree and the open pages of the destination collection read again. *Copied \<n\> documents[ and \<k\>
  indexes] to \<destination\> in \<s\> s.*, followed, when they apply, by *\<k\> skipped (their _id already existed)*,
  *\<f\> failed: \<first error\>*, *Index not created — \<name\>: \<error\>* and *It can't be undone: \<reason\>, too
  many for the undo history* (then it is a warning); with **Open**, which opens the copy in a collection tab
  (`tab.open`), and **Undo** when recorded.
- **Refuses**: a destination that cannot be reached: *Could not connect to \<name\>: \<error\>* (`/not-connected`); a
  count that fails: its error. An error while copying: *Copy failed: \<error\>*.
- **Commands**: `transfer.copy-collection`.
- **Settings**: `datardo.undo.enabled`, `datardo.undo.maxDocumentsPerOperation`, `datardo.undo.maxOperationSizeMb`.
- **Uses**: `undo.record`, `undo.note`, `undo.limits`, `undo.notification`, `connection.read-only`,
  `connection.connect`, `query.parse`, `runner.ask`, `runner.confirm`, `runner.progress`, `runner.cancel`,
  `tree.refresh`, `tab.open`.
- **Ported from**: Mongoster's card transfer.copy-collection; `src/copy.ts` (`Copier.start`, `copyCollection`,
  `COPIED_OPTIONS`), `src/manage.ts` (`databaseNameError`, `collectionNameError`), `src/history.ts`.

Acceptance:

- [ ] Copying 2,500 documents of `shop.orders` to a new collection on another connection writes 3 batches, with the
  status line's **Copying shop.orders → \<destination\>** saying *1,000 of 2,500 documents* and so on.
- [ ] `Int32`, `Double`, `Int64`, `Decimal128` and regular expressions with their flags are identical in the copy.
- [ ] With **Append**, documents whose `_id` exists are counted as skipped, not failed, and the existing ones are
  unchanged.
- [ ] With **Replace matching**, a document with the same `_id` is replaced and **Undo** puts the old one back.
- [ ] With **Drop and recreate** and the options checked, a capped source with a validator gives a capped destination
  with the same validator; its old documents and indexes are gone. The confirmation asks to type the destination
  collection's name, and **Copy** stays disabled until it matches.
- [ ] The filter `{ status: "active" }` copies only those documents, and the confirmation shows *Filter: { status:
  "active" }*.
- [ ] Indexes other than `_id_` are created after the documents; one that fails is listed, the others are created.
- [ ] **Cancel** stops after the current batch: *Copy cancelled after \<n\> of \<total\> documents; those stay in
  \<destination\>.*, and no index is created.
- [ ] Choosing a read-only destination connection shows *The connection \<name\> is read-only: it can't receive a
  copy.* and asks nothing more.
- [ ] A view is copied as a collection with its documents, without indexes or options being offered.
- [ ] On a destination that publishes for redis-oplog, a copy sends no event.
- [ ] An open collection tab of the destination shows the copied documents when the copy ends.
- [ ] A **Replace matching** whose replaced documents pass 20 MB asks **Copy without the possibility to undo?**
  before the batch that passes it.

### `transfer.generate` — Generate test documents

Inserts fake documents that look like a collection's, into it or into another collection on any MongoDB connection.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/transfer/generate.ts › plan(context, answers)`
- **Entry points**: **Generate test documents…** in the context menu of a collection or view of the tree
  (`@tree-menu`); **Generate…** in the toolbar of the Schema section (`@toolbar`), enabled once an analysis with
  documents is shown; Go to (**Generate test documents…**), for the collection of the active tab.
- **Offered when**: on collections and views, also of read-only connections: they can be imitated.
- **Asks**, each titled **Generate documents like \<database\>.\<collection\>: \<step\>**:
  1. **how many** (*Number of documents to generate (up to 1,000,000), like the \<k\> analyzed*): `100` by default, a
     whole number from 1 to 1,000,000; spaces, `,`, `_` and `'` between digits are accepted; otherwise *A whole number
     from 1 to 1,000,000*;
  2. **destination**, only when the source can be written to (not a view, not read-only): **This collection** or
     **Another collection…** (*new or existing, on any connection*). Another collection: the connection (*Where the
     generated documents go*, the source's first), the database (as in `transfer.copy-collection`, with **New
     database…**) and the collection (*Collection in \<connection\> › \<database\>: a new one, or an existing one to
     add the documents to*), `<collection>_generated` in the same database, otherwise `<collection>`; a view's name
     is refused with *A view has this name: views are read-only*;
  3. **seed (optional)** (*The same seed and analysis give the same documents (new ObjectId _ids still differ); leave
     empty for random ones*), with the example *e.g. 42*.
- **Reads**: from the tree and from Go to, a random sample analyzed first, shown on the status line as **Analyzing a
  sample of \<database\>.\<collection\>**: `db.orders.aggregate([{ $sample: { size: 1000 } }], { maxTimeMS: 120000,
  allowDiskUse: true })`, then `schema.analyze` with details. From the Schema section: the analysis shown and its
  filter. For an `int` or `long` `_id`, the largest numeric `_id` of the destination: `db.<collection>.find({ _id: {
  $type: "number" } }, { _id: 1 }).sort({ _id: -1 }).limit(1)`.
- **Plan**: `db.<collection>.insertMany([<1,000 documents>], { ordered: false })`, one step per batch of 1,000, the
  documents being those of `transfer.generate-values`; the 3 documents the confirmation shows are the first ones
  inserted.
- **Danger**: Confirm: **Insert \<n\> generated documents into \<destination\>?**, with *They look like the \<k\>
  documents analyzed in \<connection\> › \<database\>.\<collection\>[ matching \<filter\>][, seed \<seed\>]. For
  example:*, the first 3 documents in mongosh syntax, each cut at 400 characters, *Like Import, the inserts are not
  published to Redis for redis-oplog.* when the destination publishes, and the line of `undo.note`; button
  **Insert**.
- **Read-only**: Refused: the destination is never a view or a collection of a read-only connection. Choosing a
  read-only connection says *The connection \<name\> is read-only.* (`/read-only`).
- **Undo**: Recorded in the undo history (`undo.record`) as `Generate <n> documents like <database>.<collection>`,
  which keeps the `_id`s of the inserted documents; not when `<n>` is above `datardo.undo.maxDocumentsPerOperation`
  (10,000 by default), which the confirmation says.
- **Publishes**: Not published: generated documents are one of the writes Mongoster documents as not published, and
  Datardo keeps that list until the question is answered (`oplog.publish`); the confirmation says so when the
  destination publishes.
- **After**: the open pages of the destination and the tree read again. *Inserted \<i\> generated documents into
  \<destination\> in \<s\> s.* (a warning with *\<f\> failed: \<first error\>* when some failed), with **Open**
  (`tab.open`) and **Undo** when recorded.
- **Refuses**: nothing to imitate: *\<database\>.\<collection\> has no documents to imitate.* from the tree, or *No
  documents match the filter: there is nothing to imitate.* from the Schema section (`/nothing-to-imitate`); the
  sample fails: *Could not analyze \<database\>.\<collection\>: \<error\>*; the destination can't be reached: *Could
  not connect to \<name\>: \<error\>* (`/not-connected`). An error while inserting: *Generating documents failed after
  \<i\> inserted: \<error\>*.
- **Commands**: `transfer.generate`.
- **Settings**: `datardo.undo.enabled`, `datardo.undo.maxDocumentsPerOperation`.
- **Uses**: `transfer.generate-values`, `schema.analyze`, `schema.show`, `query.format`, `undo.record`, `undo.note`,
  `undo.limits`, `undo.notification`, `connection.read-only`, `runner.ask`, `runner.confirm`, `runner.progress`,
  `runner.cancel`, `tree.refresh`, `tab.open`.
- **Ported from**: Mongoster's card transfer.generate; `src/generate.ts` (`Generator.start`, `Generator.pickTarget`,
  `parseCount`), `src/shared/schema.ts` (`analyzeSchema`), `src/shared/generate.ts`, `src/history.ts`.

Acceptance:

- [ ] **Generate test documents…** on a collection of 5,000 documents analyzes 1,000 of them and proposes `100`.
- [ ] `0`, `1000001` and `12a` are refused; `1,000` and `10 000` mean 1,000.
- [ ] On a view or a read-only connection, **This collection** is not offered and the destination connection is
  asked directly.
- [ ] The confirmation shows 3 documents in mongosh syntax, and the first 3 inserted documents are those; asking for
  2 documents shows 2.
- [ ] 2,500 documents are inserted in 3 batches, the status line's **Generating documents into \<destination\>**
  saying *1,000 of 2,500 documents* and so on; **Cancel** stops after the current batch with *Generation cancelled
  after \<i\> of 2,500 documents; those stay in \<destination\>.*
- [ ] With integer `_id`s up to 7 in the destination, the generated `_id`s are 8, 9, 10…
- [ ] **Undo** deletes exactly the generated documents; for 20,000 documents the confirmation says *This can't be
  undone: the undo history keeps operations of up to 10,000 documents.*
- [ ] The same seed and analysis give the same documents except the `ObjectId` `_id`s.
- [ ] On a destination that publishes for redis-oplog, the confirmation has the line *Like Import, the inserts are
  not published to Redis for redis-oplog.*, and no event is sent.
- [ ] An empty collection says *\<database\>.\<collection\> has no documents to imitate.* and asks nothing.

### `transfer.generate-values` — Fake documents from a schema analysis

The rules that make a generated document look like the analyzed ones, field by field.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/transfer/generate-values.ts › nextDocument(generator)`, with `generateDocuments(schema,
  count, options)` and `seededRandom(seed)` in the same module.
- **Inputs**: a schema analysis (`schema.analyze`), with or without details, and the options: a random source
  (`seededRandom(seed)`: sfc32 over a cyrb128 hash of the seed's text; without a seed the runner draws one), `nextId`
  and `now`.
- **Output**: documents as canonical Extended JSON, `_id` first. Nothing else is read: the same analysis, seed and
  `now` give the same documents.
- **Rules**:
  - Presence: a field is in a document with the probability `count / of` of the analysis. Its type is chosen weighted
    by the counts of its types. Sub-documents are generated the same way; `null` stays `null`.
  - Few values: when every value of a type is known (the details, or top values that are all of them) and the field
    is not `_id`, the values are used again, weighted by how often they were seen, if the type is boolean, or there
    is one value, or the type was seen at least twice as often as it has values. Numbers and dates with more than 50
    values use their range instead.
  - Numbers: a bin of the histogram chosen by its count, then a value in it, within the minimum and maximum. `int`
    and `long` stay integers (`int` within 32 bits); `decimal` with the decimals seen (2 when unknown, at most 20);
    `double` rounded to the decimals seen when they are few.
  - Dates: like numbers, in milliseconds; at UTC midnight when every date seen was.
  - `ObjectId`s other than `_id`: new ones whose time is between the earliest and the latest seen.
  - Arrays: a length drawn from the lengths seen (or uniform between the minimum and maximum), elements by the
    elements' analysis. Binary: random bytes of the example's size and subtype (a 16-byte subtype 4 is a version-4
    UUID). Timestamps: `now` with an increasing counter. Other types: the example value.
  - Strings, the first rule that fits, from the field's name (lower case without separators) and its examples: UUIDs
    (80% of the examples, or a name with `uuid` or `guid`); emails (80% of the examples; with the domains seen, else
    `example.com`, `example.org`, `example.net`); URLs (80% of the examples; same host, the path segments that take
    few values kept); ISO dates in strings; phone numbers; values without spaces, with digits and a common prefix of
    at least 2 characters, from at least 3 examples (`user1234`, `ORD-2024-…`); first, last and user names; full
    names of people; cities; countries (2-letter codes when the examples are); streets; ids; hexadecimal ids of one
    length of at least 8; codes; single words or slugs; text with spaces of a similar length. Empty strings keep
    their share.
  - Shaped values: a random example with its digits and letters replaced by others of the same kind, except the
    positions where all the examples of that length (at least 3) have the same character; a phone keeps its
    `+<country>` prefix.
  - `_id`: none in the analysis, or `objectId`: a new `ObjectId` with the time `now` and a counter, all different.
    `int` or `long`: counting up from `nextId` (the destination's largest plus 1), or from the largest analyzed plus
    1; an `int` beyond 32 bits becomes a `long`. Other types: values like the field's, tried up to 20 times so that
    they don't repeat.
  - Values are not related across fields: an email does not match the name in the same document.
- **Uses**: `transfer.generate`, `schema.analyze`.
- **Ported from**: Mongoster's card transfer.generate-values; `src/shared/generate.ts` (`DocumentGenerator`,
  `generateDocuments`, `seededRandom`), `src/shared/schema.ts`, `test/unit/generate.test.ts`.

Examples:

| Analysis and options | Documents |
| --- | --- |
| `_id`s 1, 7, 3 | `_id`s `{ $numberInt: '8' }`, then 9, 10 |
| the same, with `nextId: 100` | `_id`s 100, 101 |
| the same, with `nextId: 2 ** 31` | `_id` `{ $numberLong: '2147483648' }` |
| 50 `_id`s `ORD-1000`, `ORD-1007`… | 300 different `_id`s matching `ORD-\d{4}` |
| `status` seen 60% `active`, 30% `pending`, 10% `closed` | the same three values in about the same shares |
| `email` seen as `<name>@example.org` | every generated email ends with `@example.org` |
| `price` seen as `Double`s with 2 decimals between 1 and 99 | `Double`s with at most 2 decimals between 1 and 99 |
| `qty` seen as `Int32` in half of the documents | `qty` an `Int32`, in about half of the documents |
| an empty analysis | documents with only an `ObjectId` `_id` created at `now` |

Acceptance:

- [ ] Each row of the table above gives its result.
- [ ] The same analysis, seed and `now` give the same documents twice; another seed gives others.
- [ ] Every generated document is valid canonical Extended JSON, with `_id` as its first field.
- [ ] A field seen as `Int32` in 70% and as a string in 30% of its values is generated with about those shares.
- [ ] Dates that were all at UTC midnight are generated at UTC midnight.
- [ ] A 16-byte binary of subtype 4 is generated as a version-4 UUID of subtype 4.
- [ ] String `_id`s do not repeat among 300 generated documents.
