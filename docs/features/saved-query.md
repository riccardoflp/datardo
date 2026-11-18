# Recent and saved queries

The queries and pipelines of a collection kept for later: the *recent queries*, which Datardo remembers by itself each
time one runs, and the *saved queries*, kept under a name. A saved query is either *for me*, kept in Datardo's data
folder for one connection, or *in the folder*, a JSON file in the connection's queries folder, to be shared with a team
and versioned with git.

The files in the folder have exactly the format and the layout of Mongoster's saved queries in the project
(`<database>/<collection>/<name>.json`), so a connection whose queries folder is the `.mongoster/queries` folder of a
repository reads and writes the same files as Mongoster does. Datardo has no setting for the folder: each connection
has its own queries folder, or none.

### `saved-query.show` — The queries list

The saved and the recent queries of the collection, in a list that opens under the **Queries** button, to run one
again, save, rename, move or delete one.

- **Kind**: View
- **Engine**: MongoDB
- **Function**: `src/features/saved-query/show.ts › view(state)`
- **Entry points**: **Queries** in the query bar and in the toolbar of the pipeline editor (`@query-bar`); Go to
  (**Queries**).
- **Offered when**: the active tab is a collection tab, of a collection or of a view.
- **Reads**: `saved-query.list`.
- **Commands**: `saved-query.show`
- **Uses**: `saved-query.list`, `saved-query.run`, `saved-query.save`, `saved-query.rename`, `saved-query.move`,
  `saved-query.delete`, `saved-query.remove-recent`, `saved-query.clear-recent`, `saved-query.reveal-file`,
  `nav.pin`, `aggregate.to-text`.
- **Ported from**: the History list of the collection tab: `src/webview/history.ts` (`HistoryPopover`),
  `src/collectionPanel.ts` (`postHistory`).

What it shows, top to bottom:

1. A search field, **Search queries**, with the focus, and the button **Save current**.
2. **Saved**: the saved queries, by name. Each item has its name, its description when it has one, the query on one
   line, the tag **Me** or **Folder**, the time it was saved when it is for me, a **…** button and **Delete saved
   query**. The tag **Me** explains itself as *Saved for you, in Datardo*; the tag **Folder** as *In the folder:* and
   the file's path inside the queries folder, with *Only on the connection Production* on a second line when the file
   names a connection.
3. **Recent**, with the link **Clear**: the recent queries, newest first. Each item has the query on one line, the
   time it last ran, **Save with a name** and **Remove from history**.

The query on one line: for a find, the filter with its line breaks and runs of spaces as one space, or `{}` when it is
empty, then ` sort ` and the sort, ` project ` and the projection, when they are not empty; for a pipeline, *aggregate*
and the names of its enabled stages joined by ` → `, or *aggregate empty pipeline*. The whole text is shown on hover.

The time: *just now* under 60 seconds, then *5m ago*, *3h ago*, *2d ago*, and after 7 days the date.

The **…** menu of a saved query (`@item-menu`): **Rename…**; **Move to the folder** for one that is for me, **Move to
my queries** for one in the folder; **Reveal file** for one in the folder; **Pin** (`nav.pin`); then **Delete**.

Acceptance:

- [ ] On a collection where nothing was run or saved, the list shows *Queries you run on this collection appear
      here.*
- [ ] Typing in the search field keeps the items whose name, description, filter, sort, projection or pipeline text
      contains the text, ignoring case; when none does, *No queries match your search.*
- [ ] A recent find with the filter `{ status: "paid" }` and the sort `{ createdAt: -1 }` reads `{ status: "paid" }
      sort { createdAt: -1 }`; one with only a projection reads `{} project { total: 1 }`.
- [ ] A recent pipeline of `$match`, a disabled `$sort` and `$group` reads *aggregate $match → $group*.
- [ ] A query that ran 30 seconds ago shows *just now*, 5 minutes ago *5m ago*, 3 hours ago *3h ago*, 2 days ago *2d
      ago*.
- [ ] A saved query in the folder shows **Folder** and no time; one for me shows **Me** and its time.
- [ ] A click on an item, or `Enter` on it, closes the list and runs the query (`saved-query.run`).
- [ ] The down arrow goes from the search field through the items, the up arrow back to the field; `Esc` closes the
      list and puts the focus back on **Queries**; a click outside closes it.
- [ ] While the list is open, a file added to the queries folder for this collection appears under **Saved** without
      the list being opened again.
- [ ] **Saved** is not shown when there are no saved queries, **Recent** when there are no recent ones.

### `saved-query.list` — The saved and recent queries of a collection

Reads what the queries list shows for one collection of one connection.

- **Kind**: Read
- **Engine**: MongoDB
- **Function**: `src/features/saved-query/list.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: read by `saved-query.show`; the tool `list_saved_queries` of the MCP server (`mcp.server`), which
  gives an AI assistant the same list as text.
- **Reads**: Datardo's data, for the queries for me and the recent ones of this connection, database and collection;
  `saved-query.read-folder`, for the files of the connection's queries folder.
- **Uses**: `saved-query.read-folder`, `saved-query.recent`.
- **Ported from**: `src/savedQueryActions.ts` (`saved`), `src/shared/savedQueries.ts` (`matchesCollection`,
  `mergeSavedQueries`, `projectSavedQuery`), `src/queryHistory.ts` (`recent`, `saved`), `src/mcp/workspace.ts`
  (`list_saved_queries`).

Rules:

- A saved query for me belongs to one connection, one database and one collection, and is listed only there.
- A file of the folder is listed on the collection when its `database` and `collection` are those of the collection,
  whatever the folder it lies in, and when it has no `connection` or its `connection` is the name of this connection,
  ignoring case and the spaces around it.
- A connection without a queries folder lists only the queries for me.
- The saved queries are in order of name, ignoring case and reading numbers as numbers (*Top 2* before *Top 10*).
  With the same name: first a file that names this connection, then a file that names none, then the one for me; two
  files, by their path.
- The recent queries are newest first.

Acceptance:

- [ ] On the connection Local, with *b* for me, a file named *b* with no `connection`, a file named *b* with
      `"connection": "Local"`, *A 10* and *a 2* for me, the order is *a 2*, *A 10*, *b* (the file for Local), *b* (the
      other file), *b* (for me).
- [ ] A file with `"connection": "production"` is listed on the connection named Production and on no other.
- [ ] A file whose `database` is `shop` and `collection` is `orders`, lying in the folder `misc` of the queries
      folder, is listed on `shop.orders`.
- [ ] A saved query for me on Local is not listed on another connection, even one to the same deployment.
- [ ] `list_saved_queries` answers *No saved or recent queries for shop.orders on Local.* when there are none.
- [ ] `list_saved_queries` is offered with `datardo.mcp.readData` off; what it then leaves out of the texts is the MCP
      server's rule (`mcp.read-data`).

### `saved-query.recent` — The recent queries of a collection

Each query or pipeline that runs is remembered for its collection, so that the last ones can be run again without
having been saved.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/saved-query/recent.ts › plan(context, answers)`
- **Entry points**: none of its own: it follows a query that ran (`query.run`) and a pipeline that ran
  (`aggregate.run`, `aggregate.write-output`).
- **Offered when**: a find or a pipeline of a collection tab has just ended without an error.
- **Plan**: one app step, `add the query to the recent queries of Local / shop / orders`.
- **Danger**: None
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone from the undo history: it changes Datardo's own data. **Remove from history** takes one
  away.
- **After**: the queries list, when open, shows the query first under **Recent**.
- **Uses**: `query.parse`.
- **Ported from**: `src/queryHistory.ts` (`record`, `sameQuery`, `normalize`, `MAX_RECENT`), `src/collectionPanel.ts`
  (`runQuery`, `runAggregate`, `moveCollectionState`).

Rules:

- The recent queries are kept per connection, database and collection, in Datardo's data folder, and are there again
  at the next start.
- At most 50 are kept: adding one beyond 50 drops the oldest.
- A query is added only when it ran without an error. Paging through its results adds nothing new.
- A find with an empty filter, sort and projection is not added; nor is a pipeline with no enabled stage.
- What is kept: for a find, the filter, the sort and the projection as typed, without the spaces around them; for a
  pipeline, every stage with its name trimmed, its body as typed, and whether it is enabled. And the time.
- The same query is never there twice: when the one that ran equals a recent one, the older is removed and the new one
  goes first. Two finds are equal when their filter, sort and projection parse to the same values, so spaces, quotes
  and line breaks do not count; a text that does not parse is compared as text. Two pipelines are equal when they have
  the same stages in the same order, each with the same name, the same parsed body and the same enabled state.
- A find and a pipeline are never equal.
- Renaming a collection carries its recent and saved queries for me to the new name; removing a connection deletes
  them (`connection.remove`).

Acceptance:

- [ ] After `{ status: "paid" }` runs on `shop.orders` of Local, it is the first recent query of that collection, on
      Local only.
- [ ] Running `{status:'paid'}` afterwards leaves one recent query, the new text, first.
- [ ] Running the same filter with another sort adds a second recent query.
- [ ] With 50 recent queries, a 51st that is new leaves 50, without the one that ran longest ago.
- [ ] A find with everything empty is not added; a pipeline whose stages are all disabled is not added.
- [ ] A query the server refuses is not added.
- [ ] A pipeline with a disabled stage is kept with that stage, still disabled, and comes back so when run again.
- [ ] After Datardo is closed and started again, the recent queries are the same.
- [ ] After `shop.orders` is renamed to `shop.sales`, its recent queries are those of `shop.sales`.

### `saved-query.remove-recent` — Remove a recent query

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/saved-query/remove-recent.ts › plan(context, answers)`
- **Entry points**: **Remove from history** on an item of **Recent** (`@list`).
- **Offered when**: the queries list shows recent queries.
- **Plan**: one app step, `remove a query from the recent queries of Local / shop / orders`.
- **Danger**: None
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone: the query is forgotten; running it again adds it back.
- **After**: the item leaves the list, which stays open.
- **Ported from**: `src/queryHistory.ts` (`remove`), `src/webview/history.ts`.

Acceptance:

- [ ] **Remove from history** on the second of three recent queries leaves the other two, in their order.
- [ ] No confirmation is asked, and the query in the query bar is not changed.
- [ ] The saved query equal to the one removed stays under **Saved**.
- [ ] Removing the last recent query hides **Recent**; with no saved queries either, the list shows *Queries you run
      on this collection appear here.*

### `saved-query.clear-recent` — Clear the recent queries

Forgets every recent query of the collection. The saved queries stay.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/saved-query/clear-recent.ts › plan(context, answers)`
- **Entry points**: **Clear** beside **Recent** in the queries list (`@list`); Go to (**Clear recent queries**).
- **Offered when**: the collection has recent queries.
- **Plan**: one app step, `clear the recent queries of Local / shop / orders`.
- **Danger**: Confirm: *Clear the recent queries of orders?* with *Saved queries are kept.* and the button **Clear**.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone: the recent queries are forgotten; the confirmation says so.
- **After**: **Recent** is no longer shown.
- **Commands**: `saved-query.clear-recent`
- **Uses**: `runner.confirm`.
- **Ported from**: `src/collectionPanel.ts` (the `clearHistory` message), `src/queryHistory.ts` (`clearRecent`).

Acceptance:

- [ ] **Clear** shows *Clear the recent queries of orders?* and *Saved queries are kept.*; **Clear** there empties
      **Recent**.
- [ ] Cancelling the confirmation keeps every recent query.
- [ ] The saved queries for me and in the folder are the same before and after.
- [ ] The recent queries of other collections and of other connections are not touched.

### `saved-query.save` — Save a query

Keeps the query or the pipeline of the tab, or a recent one, under a name: for me, or as a file in the folder.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/saved-query/save.ts › plan(context, answers)`
- **Entry points**: **Save current** in the queries list (`@list`); **Save with a name** on a recent query (`@list`);
  Go to (**Save query…**, and **Save query in the folder…**, which does not ask where).
- **Offered when**: the active tab is a collection tab.
- **Asks**:
  1. The name, in a dialog titled **Save query** (or **Save query in the folder**) with *Name for this orders query*.
     It starts with the name of a saved query equal to this one, when there is one. Empty: *Enter a name*.
  2. Where, unless the command already says it: **For me**, *kept by Datardo, on Local only*; **In the folder**, *a
     file in C:\repo\.mongoster\queries, shared through git, on every connection with this folder and shop.orders*, or
     *a file in a folder you choose* when the connection has no queries folder. The place chosen last time is offered
     first; the first time, **For me**.
  3. The queries folder, when **In the folder** is chosen and the connection has none (`saved-query.choose-folder`).
- **Reads**: `saved-query.list`, for the names already there.
- **Plan**: for me, one app step, `save the query "Paid this month" of shop.orders for me on Local`; in the folder, one
  file step, `write C:\repo\.mongoster\queries\shop\orders\paid-this-month.json`.
- **Danger**: None for me, and in the folder when no file there has the name. Confirm when the folder already has a
  query of this collection with this name and no `connection`, and it is not equal to the one being saved: *The folder
  already has a query of orders named "Paid this month". Replace it?* with *Its file shop/orders/paid-this-month.json
  is overwritten.* and the button **Replace**.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone from the undo history, which keeps documents and keys; a file that is replaced is lost
  unless the folder is versioned, and the confirmation says so.
- **After**: the queries list shows the query under **Saved**; saved in the folder, the status line says *Saved
  shop/orders/paid-this-month.json*. The place chosen is remembered for the next time.
- **Refuses**: nothing to save: *Nothing to save: filter, sort and projection are empty.* or *Nothing to save: the
  pipeline has no stages.* (`/empty`); a text of the pipeline that does not parse (`/invalid-text`). A file that cannot
  be written: *Could not save the query in the folder:* and the reason.
- **Commands**: `saved-query.save`, `saved-query.save:folder`
- **Uses**: `saved-query.file-format`, `saved-query.file-path`, `saved-query.choose-folder`, `saved-query.list`,
  `runner.ask`, `runner.confirm`.
- **Ported from**: `src/savedQueryActions.ts` (`save`, `askPlace`, `saveInProject`), `src/projectQueries.ts` (`save`),
  `src/queryHistory.ts` (`save`), `src/webview/history.ts` (`saveCurrent`), Mongoster's decision D15.

Rules:

- What is saved is what is typed in the tab, run or not: the filter, the sort and the projection in Find; every stage
  of the pipeline in Aggregate, disabled ones included.
- For me: a saved query for me of this collection with the same name is replaced, without a question.
- In the folder: a file of this collection with the same name and no `connection`, lying in the queries folder, is
  written again in place, and its description is kept. Otherwise a new file is written at the path of
  `saved-query.file-path`, creating the folders it needs.
- A file that names a connection is never replaced by a save: a new file is written beside it.
- Nothing secret is written: not the connection string, not the name of the connection.

Acceptance:

- [ ] **Save current** with the filter `{ status: "paid" }`, named *Paid*, **For me**, on Local: the list shows *Paid*
      with **Me**, and it is listed on `shop.orders` of Local only.
- [ ] The same, **In the folder**, with the queries folder `C:\repo\.mongoster\queries`: the file
      `C:\repo\.mongoster\queries\shop\orders\paid.json` is written with the content of `saved-query.file-format`, and
      the list shows *Paid* with **Folder**.
- [ ] Saving *Paid* for me again with another filter leaves one *Paid* for me, with the new filter.
- [ ] Saving *Paid* in the folder again with another filter asks *The folder already has a query of orders named
      "Paid". Replace it?*; **Replace** overwrites the same file; cancelling writes nothing.
- [ ] Saving in the folder a query equal to the file that has its name writes the file again and asks nothing; the
      next save offers **In the folder** first.
- [ ] **Save current** with an empty filter, sort and projection saves nothing and says *Nothing to save: filter, sort
      and projection are empty.*; with a pipeline of no stages, *Nothing to save: the pipeline has no stages.*
- [ ] **Save with a name** on a recent query starts with an empty name, or with the name of the saved query equal to
      it.
- [ ] **Save query in the folder…** from Go to asks the name and not where.
- [ ] On a read-only connection a query is saved, for me and in the folder.
- [ ] With a queries folder that cannot be written, the save says *Could not save the query in the folder:* and the
      system's reason, and nothing is listed.

### `saved-query.file-path` — Where the file of a saved query goes

The path of a new file inside the queries folder, from the database, the collection and the name of the query.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/saved-query/file-path.ts › queryFilePath(database, collection, name, taken)`
- **Ported from**: `src/shared/savedQueries.ts` (`queryFileName`, `folderName`, `queryFilePath`),
  `src/projectQueries.ts` (`save`, `rename`).

Rules:

- The path is `<database>/<collection>/<file>.json`, relative to the queries folder.
- The file name is the name of the query: decomposed (Unicode NFKD) and without its combining marks, in lower case,
  each run of characters other than `a` to `z` and `0` to `9` replaced by one `-`, without `-` at its ends, cut to 60
  characters and without a `-` left at the end. A name that leaves nothing gives the file name *query*.
- A folder name is the database or collection name with each of `<`, `>`, `:`, `"`, `/`, `\`, `|`, `?`, `*` and the
  control characters replaced by `_`, the dots and spaces at its end replaced by one `_`, and `_` put before a name
  Windows reserves (`con`, `prn`, `aux`, `nul`, `com1`…, `lpt1`…, with or without an extension). An empty name gives
  `_`.
- When the path is taken, by a file on disk, `-2` is added to the file name, then `-3`, and so on, until one is free.

Worked examples (database, collection, name → path):

- `shop`, `orders`, *Paid this month* → `shop/orders/paid-this-month.json`; taken →
  `shop/orders/paid-this-month-2.json`.
- `shop`, `orders`, *Città più attive!* → `shop/orders/citta-piu-attive.json`.
- `shop`, `orders`, *Top 10 — by total* → `shop/orders/top-10-by-total.json`.
- `shop`, `orders`, *???* → the file named *query* with the extension `.json`, in `shop/orders/`.
- `shop`, `orders`, a name of 70 letters `A` → a file name of 60 letters `a`.
- `my:db`, `a/b`, *x* → `my_db/a_b/x.json`.
- `con`, `logs 2024 `, *x* → `_con/logs 2024_/x.json`.

Acceptance:

- [ ] The seven worked examples give exactly these paths.
- [ ] The same path is written on Windows, macOS and Linux for the same names.
- [ ] Two queries named *Paid!* and *paid?* of the same collection get `paid.json` and `paid-2.json`.
- [ ] No path leaves the queries folder, whatever the names: a collection named `..` is the folder `._`.

### `saved-query.file-format` — The file of a saved query

The text of a file in the queries folder: JSON that reads well and gives small differences in git.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/saved-query/file-format.ts › queryFileText(query)`
- **Uses**: `saved-query.parse-file`, which reads the same format.
- **Ported from**: `src/shared/savedQueries.ts` (`serializeProjectQuery`, `textValue`), Mongoster's decision D15
  (`docs/08-decisions.md`).

Rules:

- The file is one JSON object, indented by two spaces, in UTF-8, ending with one line break. Its fields are always in
  this order:
  1. `name`: the name of the query;
  2. `description`: only when there is one;
  3. `connection`: only when the query is to be listed on the connections with this name only. Datardo never adds it
     and never removes it;
  4. `database` and `collection`;
  5. for a find, `filter`, `sort` and `projection`, each only when it is not empty; when all three are empty, `filter`
     is `"{}"`. For a pipeline, `pipeline`: an array with, for each stage, `stage` (its name), `body`, and `enabled:
     false` only when the stage is disabled.
- A filter, a sort, a projection, a body and a description are the mongosh text as the user typed it, without the
  spaces around it: nothing is parsed, formatted or converted, so comments and layout are kept.
- A text of one line is a JSON string. A text of several lines is an array with one string per line, whatever line
  breaks it had, so that git compares it line by line.
- The file has no version field and nothing that belongs to one machine: no identifier of the connection, no
  connection string, no time.

Worked examples:

- The find *Paid this month* of `shop.orders`, with the description *Orders paid since the first of the month*, a
  filter on four lines and the sort `{ createdAt: -1 }` →

  ```json
  {
    "name": "Paid this month",
    "description": "Orders paid since the first of the month",
    "database": "shop",
    "collection": "orders",
    "filter": [
      "{",
      "  status: \"paid\",",
      "  createdAt: { $gte: ISODate(\"2024-03-01\") }",
      "}"
    ],
    "sort": "{ createdAt: -1 }"
  }
  ```

- The pipeline *Totals by customer*, for the connection Production only, with its third stage disabled →

  ```json
  {
    "name": "Totals by customer",
    "connection": "Production",
    "database": "shop",
    "collection": "orders",
    "pipeline": [
      {
        "stage": "$match",
        "body": "{ status: \"paid\" }"
      },
      {
        "stage": "$group",
        "body": [
          "{",
          "  _id: \"$customer\",",
          "  total: { $sum: \"$total\" }",
          "}"
        ]
      },
      {
        "stage": "$sort",
        "body": "{ total: -1 }",
        "enabled": false
      }
    ]
  }
  ```

- A find *All* with nothing typed → the four fields `name`, `database`, `collection` and `"filter": "{}"`.

Acceptance:

- [ ] The three worked examples give exactly these files, byte for byte, with `\n` line ends and one at the end.
- [ ] A file written by Datardo and read by `saved-query.parse-file` gives back the same query, and writing that again
      gives the same bytes.
- [ ] A file written by Mongoster 0.8.0 for the same query has the same bytes, and a folder shared by Datardo and
      Mongoster shows the same saved queries in both.
- [ ] A filter typed as `{ _id: ObjectId('65f1c0de9a1b2c3d4e5f6a7b') } // mine` is written as typed, with its single
      quotes and its comment.
- [ ] A filter typed with `\r\n` line ends is written as an array of lines with no `\r` in them.
- [ ] No file holds a connection string, a password, or the identifier Datardo gives a connection.

### `saved-query.parse-file` — A saved query read from its file

Reads one file of the queries folder, or says what is wrong with it.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/saved-query/parse-file.ts › parsedQueryFile(text)`
- **Ported from**: `src/shared/savedQueries.ts` (`parseProjectQuery`, `QueryFileError`).

Rules:

- Input: the text of the file. Output: the query, or a message.
- A byte order mark at the start is skipped.
- `name`, `database` and `collection` must be strings that are not empty; the spaces around them are dropped.
- `description`, `filter`, `sort`, `projection` and the `body` of a stage are a string or an array of strings, which is
  joined with line breaks; missing or `null` is the empty text.
- `connection` is a string, or is missing or `null`; an empty one counts as missing.
- `pipeline`, when present, is an array of objects with `stage`, a name that starts with `$` followed by letters,
  digits or `_`, an optional `body`, and an optional `enabled`, `true` or `false`; a stage without `enabled` is
  enabled. A file with `pipeline` is a pipeline, even an empty one.
- Fields the format does not name are ignored and, when Datardo writes the file again, not kept.
- The texts are not parsed as mongosh here: a filter that is not valid mongosh is listed, and is refused when it is
  run.

The messages, each completing *Datardo skipped the saved query <file>:*

| The file | Message |
| --- | --- |
| is not JSON | *not valid JSON:* and the parser's reason |
| is JSON but not an object | *it must be a JSON object.* |
| has no `name`, or an empty one, or one that is not a string | *"name" is missing: it must be a non-empty string.* (the same for `database` and `collection`) |
| has a `filter` that is a number | *"filter" must be a string or an array of lines.* (the same for `sort`, `projection`, `description`) |
| has a `connection` that is not a string | *"connection" must be a string.* |
| has `pipeline` and a `filter`, `sort` or `projection` that is not empty | *it has both a "pipeline" and "filter", "sort" or "projection": keep one or the other.* |
| has a `pipeline` that is not an array | *"pipeline" must be an array of stages.* |
| has a stage that is not an object | *stage 1 of "pipeline" must be an object with "stage" and "body".* |
| has a stage whose `stage` is `match` | *"stage" of stage 1 must be a stage name such as "$match".* |
| has a stage whose `enabled` is `"no"` | *"enabled" of stage 1 must be true or false.* |
| has a stage whose `body` is a number | *"body" of stage 1 must be a string or an array of lines.* |

Worked examples (file → result):

- `{"name":"a","database":"shop","collection":"orders"}` → the find *a* of `shop.orders` with an empty filter, sort
  and projection.
- The second file of `saved-query.file-format` → the pipeline *Totals by customer* for the connection Production, with
  three stages, the body of `$group` on four lines, `$sort` disabled.
- `{"name":"a","database":"shop"}` → *"collection" is missing: it must be a non-empty string.*
- `[]` → *it must be a JSON object.*

Acceptance:

- [ ] Each row of the table gives exactly its message, and the four worked examples their results.
- [ ] A file saved with a byte order mark is read.
- [ ] A file with `"filter": ["{", "  a: 1", "}"]` gives the filter on three lines.
- [ ] A file with an extra field `"owner": "ada"` is read, and the field is ignored.
- [ ] A file whose filter is `{ a: ` is read and listed; running it marks the filter as invalid, as `query.run` does
      for a filter typed so.

### `saved-query.read-folder` — The files of the queries folder

Reads every saved query of a connection's queries folder, follows the folder as it changes, and warns about the files
it cannot read.

- **Kind**: Read
- **Engine**: MongoDB
- **Function**: `src/features/saved-query/read-folder.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: read by `saved-query.list` and `saved-query.connection-list`; **Reveal file** in the warning
  (`@notification`).
- **Offered when**: the connection has a queries folder. It is read when the connection is first shown, when its
  queries folder changes, and each time something in the folder changes.
- **Reads**: the files whose name ends with `.json`, ignoring case, in the queries folder and in its folders, to six
  levels below it, in order of name; `saved-query.parse-file` for each.
- **After**: the queries lists that are open, Go to and **Pinned** show what was read. The files that could not be
  read are skipped, and a warning notification names them.
- **Uses**: `saved-query.parse-file`, `saved-query.reveal-file`, `runner.notify`.
- **Ported from**: `src/projectQueries.ts` (`read`, `reload`, `restart`, `schedule`, `report`, `jsonFiles`,
  `MAX_FILES`, `MAX_BYTES`, `MAX_DEPTH`).

Rules:

- Limits: at most 2,000 files are read, the first in order of name, folder by folder; a file larger than 1 MB is
  skipped with *the file is larger than 1 MB.*; folders more than six levels below the queries folder are not entered.
- A queries folder that does not exist yet is an empty one, without a warning: it is created by the first save.
- The folder is watched, with its folders. A file created, changed or deleted, by Datardo, by git or by hand, makes
  the whole folder be read again 250 ms after the last change; changes that arrive while it is being read make it be
  read once more.
- A file that cannot be read is skipped and the others are listed. The warning is one notification:
  - one file: *Datardo skipped the saved query shop/orders/paid.json: "name" is missing: it must be a non-empty
    string.*
  - several: *Datardo skipped 3 saved query files that aren't valid, such as shop/orders/paid.json: "name" is missing:
    it must be a non-empty string.*

  with the action **Reveal file**, for the first of them. The path is the file's path inside the queries folder.
- A file is reported once: it is not reported again at the next reading unless its message has changed, and it is
  reported again after it was read well in between.
- Two connections with the same queries folder read the same files; the folder is watched once.

Acceptance:

- [ ] A file saved by a `git pull` into `shop/orders/` of the queries folder is listed in the open queries list of
      `shop.orders` within a second, without anything being pressed.
- [ ] A file deleted by hand leaves the list in the same way.
- [ ] A file holding `{` is not listed, the other files are, and the notification reads *Datardo skipped the saved
      query shop/orders/broken.json: not valid JSON:* with the parser's reason, with **Reveal file**.
- [ ] The same broken file gives no second notification when another file of the folder changes; after it is
      corrected and broken again, it does.
- [ ] Three broken files found at once give one notification, *Datardo skipped 3 saved query files that aren't valid,
      such as* the first of them.
- [ ] A file of 2 MB is skipped with *the file is larger than 1 MB.*
- [ ] A file seven folders below the queries folder is not read, and gives no warning.
- [ ] With 2,500 files, 2,000 are read.
- [ ] A file named `PAID.JSON` is read; a file named `notes.txt` is not.
- [ ] A connection with no queries folder reads nothing and warns about nothing.

### `saved-query.choose-folder` — Choose the queries folder of a connection

Gives a connection the folder where its saved queries in the folder are files, or changes it.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/saved-query/choose-folder.ts › plan(context, answers)`
- **Entry points**: asked by `saved-query.save` and `saved-query.move` when the connection has no queries folder
  (`@dialog`); Go to (**Choose the queries folder…**), for the current connection. The same folder is a field of the
  connection form (`connection.form`).
- **Offered when**: the current connection is a MongoDB connection.
- **Asks**: when it was started by a save, first *Choose the queries folder of Local.* with *Saved queries are written
  there as files, one per query, to be shared and versioned with git.* and the button **Choose folder…**. Then the
  folder, in the system's folder dialog titled **Queries folder of Local**, which starts in the folder the connection
  has, or in the user's home folder.
- **Plan**: one app step, `save the connection Local`, with its queries folder.
- **Danger**: None
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone from the undo history: it changes a connection of Datardo. Choosing again puts another
  folder; no file is moved or deleted either way.
- **After**: the folder is read and watched (`saved-query.read-folder`); a notification says *Queries saved in the
  folder go to C:\repo\.mongoster\queries.*
- **Commands**: `saved-query.choose-folder`
- **Uses**: `saved-query.read-folder`, `connection.form`, `runner.ask`, `runner.notify`.
- **Ported from**: `src/projectQueries.ts` (`pickFolder`, `chooseProjectFolder`); Mongoster's setting
  for the folder of the saved queries and its command for choosing it.

Acceptance:

- [ ] The first **In the folder** save on a connection without a queries folder shows *Choose the queries folder of
      Local.*; **Choose folder…** opens the system's folder dialog, and the folder chosen receives the file.
- [ ] Cancelling either dialog saves nothing and leaves the connection without a queries folder.
- [ ] After choosing `C:\repo\.mongoster\queries`, the files already there are listed on their collections at once.
- [ ] The folder chosen is the folder itself: files are written to `<folder>\<database>\<collection>\`, with nothing
      added in between.
- [ ] Choosing another folder lists the files of the new one and no longer those of the old one, whose files are
      still on disk.
- [ ] The queries folder of Local is not the queries folder of another connection until it is chosen there too.
- [ ] The queries folder is kept with the connection and is there at the next start.

### `saved-query.run` — Run a saved or recent query

Puts a saved or recent query back in its collection tab and runs it.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/saved-query/run.ts › plan(context, answers)`
- **Entry points**: a click or `Enter` on an item of the queries list (`@list`); a saved query found in Go to; a
  pinned saved query in the tree island (`@tree`).
- **Offered when**: the query is listed; from Go to and **Pinned**, on the current connection.
- **Plan**: one app step, `set the query of orders to "Paid this month"`.
- **Danger**: None
- **Read-only**: Allowed, because it writes nothing to a deployment. A pipeline that ends with `$out` or `$merge` is
  then run by `aggregate.write-output`, with its confirmation and its refusal.
- **Undo**: Cannot be undone from the undo history: it changes the query of the tab, not a deployment. The query the
  tab had, when it had run, is among the recent ones.
- **After**: a find fills the filter, the sort and the projection, shows them in the query builder when it can, and
  runs (`query.run`); a pipeline shows the pipeline editor with its stages, the whole pipeline shown, and runs
  (`aggregate.run`). From Go to and **Pinned**, the collection tab is opened first, or made active when it is open
  (`tab.open`).
- **Uses**: `tab.open`, `query.bar`, `query.run`, `aggregate.show`, `aggregate.run`, `saved-query.connection-list`.
- **Ported from**: `src/webview/history.ts` (`choose`), `src/webview/main.ts` (`loadQuery`).

Acceptance:

- [ ] Running the saved find *Paid this month* replaces the filter, the sort and the projection of the tab with its
      three texts as saved, an empty one emptying its field, and shows its first page.
- [ ] Running a saved pipeline from a tab in **Find** switches the tab to **Aggregate** with its stages, disabled ones
      disabled, and runs it.
- [ ] Running a saved find from a tab in **Aggregate** switches the tab to **Find**; the pipeline of the tab is kept.
- [ ] Choosing the saved query *Paid this month* of `shop.orders` in Go to, with no tab of `shop.orders` open, opens
      one and runs the query there.
- [ ] A saved pipeline ending with `$out "copy"` asks the confirmation of `aggregate.write-output` before anything is
      written, with the name `copy` to type when that collection exists, and through a read-only connection writes
      nothing.
- [ ] A saved find whose filter is not valid mongosh fills the filter, marks it as invalid and sends nothing.
- [ ] Running a query adds it to the recent queries, as any query that runs.

### `saved-query.rename` — Rename a saved query

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/saved-query/rename.ts › plan(context, answers)`
- **Entry points**: **Rename…** in the **…** menu of a saved query (`@item-menu`).
- **Offered when**: the query is a saved one.
- **Asks**: the name, in a dialog titled **Rename saved query**, with *New name*, or for a query in the folder *New
  name (the file shop/orders/paid.json is renamed too)*, starting with the name it has. Empty: *Enter a name*. A name
  another saved query of the same place has: *Another saved query of yours has this name* or *Another saved query in
  the folder has this name*.
- **Plan**: for me, one app step, `rename the query "Paid" of shop.orders to "Paid this month"`. In the folder, two
  file steps: `rename C:\repo\.mongoster\queries\shop\orders\paid.json to paid-this-month.json`, then `write
  C:\repo\.mongoster\queries\shop\orders\paid-this-month.json`; only the second when the file name does not change.
- **Danger**: None
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone from the undo history; renaming again puts the name back.
- **After**: the queries list shows the new name in its place by name; a pin of the query follows it.
- **Refuses**: nothing: confirming the same name does nothing. A file that cannot be renamed or written: *Could not
  rename the query:* and the reason.
- **Uses**: `saved-query.file-path`, `saved-query.file-format`, `runner.ask`.
- **Ported from**: `src/savedQueryActions.ts` (`rename`), `src/projectQueries.ts` (`rename`), `src/queryHistory.ts`
  (`rename`).

Rules for a query in the folder: the file stays in its folder and takes the file name of the new name
(`saved-query.file-path`), with `-2`, `-3`… when that name is taken by another file; its `name` becomes the new name;
its description, its `connection` and its query are kept.

Acceptance:

- [ ] Renaming *Paid* for me to *Paid this month* leaves one saved query, *Paid this month*, with the same filter.
- [ ] Renaming the file `shop/orders/paid.json` to *Paid this month* leaves `shop/orders/paid-this-month.json`, whose
      `name` is *Paid this month*, and no `paid.json`.
- [ ] Renaming *Paid* to *PAID!* in the folder keeps the file `paid.json` and changes only its `name`.
- [ ] Typing the name of another saved query for me shows *Another saved query of yours has this name* and the dialog
      cannot be confirmed; a query in the folder may have the name of one for me.
- [ ] A file with `"connection": "Production"` and a description keeps both after a rename.
- [ ] A pinned saved query is still pinned after a rename, under its new name.

### `saved-query.move` — Move a saved query between for me and the folder

Shares a query kept for me by making it a file of the folder, or takes a query out of the folder to keep it for me.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/saved-query/move.ts › plan(context, answers)`
- **Entry points**: **Move to the folder**, which explains itself as *Save it as a file in the folder, shared through
  git*, and **Move to my queries**, *Keep it only for you and delete its file from the folder*, in the **…** menu of a
  saved query (`@item-menu`).
- **Offered when**: **Move to the folder** on a query for me; **Move to my queries** on a query in the folder.
- **Asks**: the queries folder, when moving to the folder and the connection has none (`saved-query.choose-folder`).
- **Plan**: to the folder, `write C:\repo\.mongoster\queries\shop\orders\paid.json`, then `remove the query "Paid" of
  shop.orders for me on Local`. To my queries, `save the query "Paid" of shop.orders for me on Local`, then `delete
  C:\repo\.mongoster\queries\shop\orders\paid.json`.
- **Danger**: to the folder, None, or the Confirm of `saved-query.save` when the folder already has another query of
  this name. To my queries, Confirm: *Move "Paid" from the folder to your queries?* with *Its file
  shop/orders/paid.json is deleted from the folder: once the change is committed, the others no longer have it.* and
  the button **Move**.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone from the undo history; moving it back makes a new file. The confirmation says that the
  file is deleted.
- **After**: the queries list shows the query with its new tag. A folder of the queries folder left empty by the
  move is deleted, up to the queries folder itself, which is kept.
- **Refuses**: a file that cannot be written or deleted: *Could not move the query:* and the reason; the query stays
  where it was.
- **Uses**: `saved-query.save`, `saved-query.file-format`, `saved-query.file-path`, `saved-query.choose-folder`,
  `runner.confirm`.
- **Ported from**: `src/savedQueryActions.ts` (`move`), `src/projectQueries.ts` (`save`, `remove`).

Acceptance:

- [ ] **Move to the folder** on *Paid* writes `shop/orders/paid.json` with its filter, sort, projection and
      description, and *Paid* is listed once, with **Folder**.
- [ ] **Move to my queries** on it asks *Move "Paid" from the folder to your queries?*; **Move** deletes the file and
      lists *Paid* once, with **Me**; cancelling changes nothing.
- [ ] Moving to my queries a query that has the name of one for me replaces the one for me.
- [ ] Moving to the folder when the folder has another *Paid* asks to replace it; cancelling leaves the query for me.
- [ ] After the only file of `shop/orders/` is moved to my queries, the folders `shop/orders` and `shop` are gone
      and the queries folder is still there.
- [ ] A query moved from the folder to my queries is listed on this connection only, and loses its `connection`.

### `saved-query.delete` — Delete a saved query

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/saved-query/delete.ts › plan(context, answers)`
- **Entry points**: **Delete saved query** on an item of **Saved** (`@list`); **Delete** in its **…** menu
  (`@item-menu`).
- **Offered when**: the query is a saved one.
- **Plan**: for me, one app step, `delete the query "Paid" of shop.orders for me on Local`. In the folder, one file
  step, `delete C:\repo\.mongoster\queries\shop\orders\paid.json`.
- **Danger**: None for a query for me. Confirm for one in the folder: *Delete the saved query "Paid" from the folder?*
  with *Its file shop/orders/paid.json is deleted.* and the button **Delete**.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone from the undo history: a query for me is forgotten, and a file is deleted for good unless
  the folder is versioned; the confirmation says so.
- **After**: the query leaves the list, Go to and **Pinned**. A folder left empty is deleted, up to the queries
  folder, which is kept.
- **Refuses**: a file that cannot be deleted: *Could not delete the query:* and the reason.
- **Uses**: `runner.confirm`, `nav.pin`.
- **Ported from**: `src/savedQueryActions.ts` (`remove`), `src/projectQueries.ts` (`remove`), `src/queryHistory.ts`
  (`remove`).

Acceptance:

- [ ] **Delete** on a query for me removes it at once, without a question.
- [ ] **Delete** on a query in the folder shows *Delete the saved query "Paid" from the folder?* and *Its file
      shop/orders/paid.json is deleted.*; **Delete** removes the file; cancelling keeps it.
- [ ] Deleting the file of a query leaves the other files of its folder untouched.
- [ ] A deleted query that was pinned is no longer under **Pinned**.
- [ ] Deleting a saved query does not remove the recent query equal to it.
- [ ] A file that is open in another program and cannot be deleted gives *Could not delete the query:* with the
      system's reason, and the query stays listed.

### `saved-query.reveal-file` — Reveal the file of a saved query

Shows the file of a saved query in the system's file manager, to open it in an editor or to see it beside the others.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/saved-query/reveal-file.ts › plan(context, answers)`
- **Entry points**: **Reveal file** in the **…** menu of a saved query in the folder (`@item-menu`); **Reveal file**
  in the warning about a file that was skipped (`@notification`).
- **Offered when**: the query is in the folder, or the warning names a file.
- **Plan**: one app step, `reveal C:\repo\.mongoster\queries\shop\orders\paid.json in the file manager`.
- **Danger**: None
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone: there is nothing to put back.
- **Refuses**: the file is no longer there: *Could not open the file:* and the reason.
- **Ported from**: `src/savedQueryActions.ts` (`openFile`), `src/projectQueries.ts` (`openFile`, `report`), where the
  file is opened in the editor; Datardo has no editor for files of this kind.

Acceptance:

- [ ] **Reveal file** opens the system's file manager on the folder of the file, with the file selected.
- [ ] The entry is not in the menu of a query for me.
- [ ] **Reveal file** in the warning about `shop/orders/broken.json` reveals that file.
- [ ] After the file is corrected and saved in any editor, the query is listed, with nothing pressed in Datardo.

### `saved-query.connection-list` — The saved queries of a connection, for Go to and for pins

Every saved query the current connection can run, whatever its collection, so that Go to finds a query by its name and
the tree island keeps the pinned ones at hand.

- **Kind**: Read
- **Engine**: MongoDB
- **Function**: `src/features/saved-query/connection-list.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: read by Go to (`palette.open`) and by **Pinned** of the tree island (`nav.pin`).
- **Reads**: Datardo's data, for the queries for me of the connection; `saved-query.read-folder`; the databases and
  collections the tree last read (`tree.show`).
- **Uses**: `saved-query.read-folder`, `saved-query.run`, `palette.open`, `nav.pin`, `tree.show`.
- **Ported from**: *New in Datardo*: Mongoster lists saved queries in the tab of their collection only
  (`src/projectQueries.ts` `list`, `src/queryHistory.ts`).

Rules:

- Listed: every saved query for me of the current connection; and every file of its queries folder that has no
  `connection` or names this connection, and whose database and collection are among those the tree last read. A
  database whose collections were not read yet lists its files.
- Recent queries are not listed.
- In Go to an item reads the name of the query, then *shop.orders · Me* or *shop.orders · Folder*, and the query on
  one line as in the queries list. It is found by its name, its description and the name of its collection.
- A pin holds, for a query for me, the query itself, and for one in the folder, the path of its file inside the
  queries folder; a pinned query reads its name, and on hover its collection and its query.
- Choosing an item, or a pin, starts `saved-query.run`.

Acceptance:

- [ ] Typing *paid* in Go to on Local lists the saved query *Paid this month* as *Paid this month* and *shop.orders ·
      Folder*; choosing it opens `shop.orders` with the query run.
- [ ] A file with `"connection": "Production"` is not found by Go to on Local.
- [ ] A file for `shop.archive`, a collection Local does not have, is not found by Go to on Local.
- [ ] A saved query for me of Local is not found by Go to while another connection is the current one.
- [ ] **Pin** on *Paid this month* puts it under **Pinned** of Local; a click on it there runs it.
- [ ] A pin of a query in the folder is there again after Datardo is started again, and is gone after its file is
      deleted on disk.
- [ ] On a connection with no saved query, Go to lists none and says nothing about it.
