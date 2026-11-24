# Databases and collections

Creating, renaming and dropping databases and collections, editing the definition of a view in the **Definition**
section of its tab, and editing the validation rules of a collection in its **Validation** section, with the
`$jsonSchema` proposed for a collection that has none.

None of these writes is recorded in the undo history: they act on whole databases and collections, or on their
options, not on documents. In the plans, `db` is the database the feature was started on, and a collection whose name
is not a plain identifier is written `db.getCollection("…")`. A command started from Go to takes the current
connection, and the database and the collection of the active tab; what is still missing is asked first, in a list to
pick from (`runner.ask`).

Mongoster has no dialog of its own for a view, a capped collection or a time series collection: its second question
takes the options of `createCollection` as text, and so does `manage.create-collection`. A view is usually created
from the pipeline editor (**Save as view…**, in the aggregate area). The statistics of a collection are shown by the
Monitor page (`monitor.show`) and, for its indexes, by the Indexes section (`index.show`): this area has no card for
them.

### `manage.create-database` — Create a database

Creates a database with its first collection, since MongoDB creates a database only together with a collection, and
opens that collection.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/manage/create-database.ts › plan(context, answers)`
- **Entry points**: **Create database…** in the menu of the connection island (`@connection-island`) and the **+**
  button at the head of the databases in the tree island (`@tree`). Go to: **Create database…**.
- **Offered when**: the current connection is a MongoDB connection, connected and not read-only.
- **Asks**: one form, **Create database**, with two fields:
  1. *Database name on Local* (the connection's name), checked while typing by `manage.name-rules` and against the
     databases listed: *This database already exists*;
  2. *Name of its first collection (MongoDB creates a database together with a collection)*, checked by
     `manage.name-rules`.

  Both are trimmed. The button is **Create**, disabled while either field has a message.
- **Reads**: the names of the databases, `db.adminCommand({ listDatabases: 1, nameOnly: true, authorizedDatabases:
  true })`, to refuse a name that exists; an empty list when it fails.
- **Plan**: `db.getSiblingDB("shop").createCollection("orders")`.
- **Danger**: None.
- **Read-only**: Refused on a read-only connection (`/read-only`), before asking anything.
- **Undo**: Cannot be undone from the undo history: creating a collection is not a write to documents. There is no
  confirmation; `manage.drop-database` removes what was created.
- **After**: the tree is read again (`tree.refresh`) and the new collection's tab opens (`tab.open`).
- **Refuses**: *The connection Production is read-only.* (`/read-only`). An error of MongoDB stops the step and is
  shown as it is (`runner.run`).
- **Commands**: `manage.create-database`
- **Uses**: `manage.name-rules`, `runner.ask`, `tree.refresh`, `tab.open`.
- **Ported from**: manage.create-database; `src/manage.ts`, `src/extension.ts`.

Acceptance:

- [ ] With `shop` and `orders`, the step run is `db.getSiblingDB("shop").createCollection("orders")`, the database
  `shop` is listed in the tree and the tab of `shop.orders` is open.
- [ ] Names are trimmed: ` shop ` creates `shop`.
- [ ] An empty name, a name with a space or one of `/ \ . " $ * < > : | ?`, or a name longer than 63 bytes cannot be
  accepted: **Create** stays disabled and the field shows the message of `manage.name-rules`.
- [ ] The name of a database that exists shows *This database already exists*.
- [ ] `Escape` or **Cancel** creates nothing.
- [ ] On a read-only connection the entries are not shown, and the command started from Go to is refused with *The
  connection Production is read-only.* before any question.

### `manage.create-collection` — Create a collection

Creates a collection in a database, with options such as capped or time series.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/manage/create-collection.ts › plan(context, answers)`
- **Entry points**: **Create collection…** in the context menu of a database (`@tree-menu`), and the **+** button on
  the database's node (`@tree`). Go to: **Create collection…**, in the database of the active tab, or after picking
  one.
- **Offered when**: the database is of a connection that is not read-only.
- **Asks**: one form, **Create collection in shop**, with two fields:
  1. *Collection name*, checked while typing by `manage.name-rules` and against the collections of the database: *This
     collection already exists*;
  2. *Options, optional: leave empty for a regular collection*, an editor of one line in mongosh syntax with the
     placeholder `{ capped: true, size: 1048576 }  or  { timeseries: { timeField: "ts" } }`, checked while typing:
     *Options: …* with the parse error, or *Options must be an object*.

  The button is **Create**.
- **Reads**: the names of the collections and views of the database, `db.getCollectionInfos({}, { nameOnly: true,
  authorizedCollections: true })`.
- **Plan**: `db.createCollection("orders")`, or `db.createCollection("log", { capped: true, size: 1048576 })` with
  options. The options are sent with their BSON types (`NumberLong(…)`, `NumberDecimal(…)` kept).
- **Danger**: None.
- **Read-only**: Refused on a read-only connection (`/read-only`), before asking anything.
- **Undo**: Cannot be undone from the undo history: creating a collection is not a write to documents. There is no
  confirmation; `manage.drop-collection` removes it.
- **After**: the tree is read again (`tree.refresh`). No tab opens.
- **Refuses**: *The connection Production is read-only.* (`/read-only`). An error of MongoDB (options it does not
  accept) stops the step and is shown as it is.
- **Commands**: `manage.create-collection`
- **Uses**: `manage.name-rules`, `query.parse` (the options), `runner.ask`, `tree.refresh`.
- **Ported from**: manage.create-collection; `src/manage.ts`, `src/queries.ts`, `src/extension.ts`.

Acceptance:

- [ ] Empty options create a regular collection: the step is `db.createCollection("orders")`.
- [ ] `{ capped: true, size: 1048576 }` creates a capped collection of 1 MB.
- [ ] `{ timeseries: { timeField: "ts" } }` creates a time series collection.
- [ ] `{ viewOn: "orders", pipeline: [{ $match: { status: "paid" } }] }` creates a view on `orders`, as the same call
  does in mongosh.
- [ ] `{ size: NumberLong(1048576), capped: true }` is sent with `size` as a 64-bit integer.
- [ ] Options that are not an object (`[1]`, `5`) show *Options must be an object* and cannot be accepted.
- [ ] `Escape` or **Cancel** creates nothing.
- [ ] On a read-only connection the entries are not shown, and the command is refused with *The connection Production
  is read-only.*

### `manage.rename-collection` — Rename a collection

Renames a collection within its database; its open tab, its recent and saved queries, its column layout, its pin, its
color, its exclusion from searches and its formatting rules follow the new name.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/manage/rename-collection.ts › plan(context, answers)`
- **Entry points**: **Rename collection…** in the context menu of a collection (`@tree-menu`). Go to: **Rename
  collection…**, for the collection of the active tab.
- **Offered when**: a collection, not a view, of a connection that is not read-only.
- **Asks**: **Rename collection shop.orders**: *New name*, filled with the current name, checked while typing by
  `manage.name-rules` and against the other collections: *A collection with this name already exists*. The button is
  **Rename**. The same name, trimmed, ends the feature without doing anything.
- **Reads**: the names of the collections and views of the database, as `manage.create-collection`.
- **Plan**:
  1. `db.orders.renameCollection("orders_2024")`;
  2. `move what Datardo keeps for shop.orders to shop.orders_2024` (an app step): the recent queries, the saved
     queries *for me*, the column layout with its expanded columns, and the pin; the collection's color and its
     exclusion from searches, kept on the connection (`tree.color-of`, `tree.excluded`); and its formatting rules
     (`table.add-format-rule`).
- **Danger**: None.
- **Read-only**: Refused on a read-only connection (`/read-only`), before asking anything.
- **Undo**: Cannot be undone from the undo history: no document is written. Renaming back undoes it.
- **After**: the references found for the database are forgotten (`relation.detect` finds them again); the
  collection's tab, when open, is closed and opened again under the new name with the same query; the tree is read
  again.
- **Refuses**: a view (`/view`): *Views cannot be renamed.*; *The connection Production is read-only.*
  (`/read-only`). An error of MongoDB stops the first step, and then the second is not run.
- **Commands**: `manage.rename-collection`
- **Uses**: `manage.name-rules`, `saved-query.recent`, `saved-query.save`, `table.columns`, `nav.pin`, `tab.open`,
  `tab.close`, `tree.refresh`, `relation.detect`, `tree.color-of`, `tree.excluded`, `table.add-format-rule`.
- **Ported from**: manage.rename-collection; `src/manage.ts`, `src/extension.ts`, `src/collectionPanel.ts`
  (`moveCollectionState`), `src/queryHistory.ts`. The color, the exclusion and the formatting rules that follow:
  Mongoster 0.9.0 (tree.collection-color-follows, tree.exclusion-follows; `src/extension.ts`, the
  `mongoster.renameCollection` handler; `src/collectionPanel.ts › moveCollectionState`, `formattingStateKey`).
- **Differs**: (M38) the collection's color does not move, since collections have none; (M39) nor does its exclusion
  from searches; (M41) nor do its formatting rules.

Acceptance:

- [ ] The same name, or `Escape`, renames nothing and sends nothing.
- [ ] After a rename, the tab of the collection is open under the new name with the same recent queries, saved
  queries *for me*, columns and expansions; a tab that was not open is not opened.
- [ ] Opening the old name again (a new collection with that name) shows no recent queries and the default columns.
- [ ] What stays under the old name: the saved queries *in the folder* (files of the queries folder), the operations
  of the undo history (undoing one writes to a collection with the old name), the open document tabs, and the other
  tabs on the collection (Watch changes, a comparison, a document history).
- [ ] A view has no **Rename collection…** in its menu, and the command started on a view is refused with *Views
  cannot be renamed.*
- [ ] When MongoDB refuses the rename, nothing Datardo keeps is moved.
- [ ] After renaming the teal `shop.orders` to `orders_2024`, the connection has `"shop.orders_2024": "teal"` and no
  `shop.orders` in `collectionColors`, and the reopened tab's icon is teal. (differs)
- [ ] After renaming the excluded `shop.logs` to `logs_old`, `exclusions` holds `shop.logs_old` and not `shop.logs`.
  (differs)
- [ ] After a rename, the collection tab under the new name colors its rows by the formatting rules the old name had;
  the old name has none. (differs)
- [ ] A collection renamed outside Datardo keeps its color, its exclusion and its formatting rules under the old name.

### `manage.drop-collection` — Drop a collection or a view

Drops a collection, with its documents and indexes, after the user types its name; or drops a view after a
confirmation.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/manage/drop-collection.ts › plan(context, answers)`
- **Entry points**: **Drop…** in the context menu of a collection or a view (`@tree-menu`). Go to: **Drop
  collection…**, for the collection or view of the active tab.
- **Offered when**: a collection or a view of a connection that is not read-only.
- **Reads**: for a collection, `db.orders.estimatedDocumentCount()` and `db.orders.getIndexes()`, for the text of
  the confirmation; either number is left out of the text when its read fails.
- **Plan**:
  1. `db.orders.drop()`;
  2. only when Datardo keeps one of them for the collection or view: `forget the color, the exclusion from searches
     and the formatting rules of shop.orders` (an app step), naming those it has: its color and its exclusion, kept
     on the connection (`tree.color-of`, `tree.excluded`), and its formatting rules (`table.add-format-rule`). It
     runs only when the drop succeeded.
- **Danger**: Destructive, for a collection: every document and index of the collection, without a copy. The
  confirmation **Drop collection shop.orders** says *Deletes 1,234 documents and 2 indexes. This cannot be undone.*
  (only *This cannot be undone.* when neither number could be read), asks *Type orders to confirm* and has the
  button **Drop**. For a view, Confirm: **Drop view shop.recent?**, *The documents of its source collection are not
  affected.*, button **Drop**.
- **Read-only**: Refused on a read-only connection (`/read-only`), before reading or asking anything.
- **Undo**: Cannot be undone: nothing is kept, a collection can be larger than the undo history may hold. Both
  confirmations say so.
- **Publishes**: Not published: the collection is dropped whole, no event per document.
- **After**: the references found for the database are forgotten; the tabs of the dropped collection or view are
  closed (`tab.close`); the tree is read again.
- **Refuses**: *The connection Production is read-only.* (`/read-only`). An error of MongoDB stops the step and is
  shown as it is.
- **Commands**: `manage.drop-collection`
- **Uses**: `runner.confirm`, `tab.close`, `tree.refresh`, `relation.detect`, `tree.color-of`, `tree.excluded`,
  `table.add-format-rule`.
- **Ported from**: manage.drop-collection; `src/manage.ts`, `src/extension.ts`. The color and the exclusion that go:
  Mongoster 0.9.0 (tree.collection-color-follows, tree.exclusion-follows; the `mongoster.dropCollection` handler).
  The formatting rules that go are Datardo's choice: Mongoster keeps them.
- **Differs**: (M38) the plan has one step: collections have no color to forget; (M39) nor an exclusion from
  searches; (M41) nor formatting rules.

Acceptance:

- [ ] Dropping a collection asks to type its exact name: **Drop** stays disabled for `Orders` or `orders ` when the
  collection is `orders`, and `Escape` drops nothing.
- [ ] A collection with one document and only the `_id_` index shows *Deletes 1 document and 1 index. This cannot be
  undone.*
- [ ] Dropping a view asks with one button, without typing, and the confirmation says that it cannot be undone.
- [ ] The confirmation shows the step `db.orders.drop()`, and the Log records `[manage.drop-collection]
  db.orders.drop()`.
- [ ] After the drop, the collection's tab is closed and the collection is gone from the tree.
- [ ] What stays: the recent and saved queries and the column layout of the collection (a new collection with the same
  name finds them), its operations in the undo history (undoing one creates the collection again with the documents of
  that operation), the open document tabs, and other tabs on it.
- [ ] On a read-only connection **Drop…** is not shown, and the command is refused with *The connection Production is
  read-only.* without reading the counts.
- [ ] Dropping the teal and excluded `shop.logs` shows the steps `db.logs.drop()` and `forget the color and the
  exclusion from searches of shop.logs`; after it, `collectionColors` and `exclusions` have no `shop.logs`, and a new
  `logs` is plain and not excluded. (differs)
- [ ] Dropping a collection with formatting rules forgets them: a new collection with the same name has none.
  (differs)
- [ ] Dropping a collection that has no color, no exclusion and no formatting rule shows one step.
- [ ] When MongoDB refuses the drop, the color, the exclusion and the formatting rules stay.

### `manage.drop-database` — Drop a database

Drops a database with all its collections, after the user types its name.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/manage/drop-database.ts › plan(context, answers)`
- **Entry points**: **Drop database…** in the context menu of a database (`@tree-menu`). Go to: **Drop database…**,
  for the database of the active tab, or after picking one.
- **Offered when**: a database of a connection that is not read-only.
- **Reads**: the names of the collections and views of the database, as `manage.create-collection`, leaving out
  `system.*`, for the number in the confirmation; the number is left out when the read fails.
- **Plan**:
  1. `db.getSiblingDB("shop").dropDatabase()`;
  2. only when Datardo keeps one of them for the database or one of its collections: `forget the colors, the
     exclusions from searches and the formatting rules of shop and its collections` (an app step), naming those it
     has: the colors and the exclusions of the database and of its collections, views and buckets, kept on the
     connection (`tree.color-of`, `tree.excluded`); the formatting rules of its collections (`table.add-format-rule`)
     and those of the database (`table.format-scopes`). It runs only when the drop succeeded.
- **Danger**: Destructive: every collection, view, document and index of the database, without a copy. The
  confirmation **Drop database shop** says *Deletes 3 collections with all their documents. This cannot be undone.*
  (only *This cannot be undone.* when the collections could not be listed), asks *Type shop to confirm* and has the
  button **Drop**.
- **Read-only**: Refused on a read-only connection (`/read-only`), before reading or asking anything.
- **Undo**: Cannot be undone: nothing is kept. The confirmation says so.
- **Publishes**: Not published: the collections are dropped whole.
- **After**: the references found for the database are forgotten; every tab of the database is closed that shows one
  of its collections, views or GridFS buckets; the tree is read again.
- **Refuses**: *The connection Production is read-only.* (`/read-only`). An error of MongoDB stops the step and is
  shown as it is.
- **Commands**: `manage.drop-database`
- **Uses**: `runner.confirm`, `tab.close`, `tree.refresh`, `relation.detect`, `tree.color-of`, `tree.excluded`,
  `table.add-format-rule`, `table.format-scopes`.
- **Ported from**: manage.drop-database; `src/manage.ts`, `src/extension.ts`. The colors and the exclusions that go:
  Mongoster 0.9.0 and 0.10.0 (tree.collection-color-follows, tree.exclusion-follows; the `mongoster.dropDatabase`
  handler). The formatting rules that go are Datardo's choice.
- **Differs**: (M38) the plan has one step: databases and collections have no color to forget; (M39) nor exclusions
  from searches; (M41) nor formatting rules of collections; (M42) nor formatting rules of a database.

Acceptance:

- [ ] Dropping a database asks to type its exact name; `Escape` or another text drops nothing.
- [ ] The number in the confirmation counts the collections and views of the database, without `system.*`: a database
  with `orders`, `users`, the view `recent` and `system.views` shows *Deletes 3 collections with all their documents.*
- [ ] A database with one collection shows *Deletes 1 collection with all their documents. This cannot be undone.*
- [ ] After the drop, every collection tab and GridFS tab of the database is closed and the database is gone from the
  tree.
- [ ] What stays: the recent and saved queries and the layouts of its collections, their operations in the undo
  history, the open document tabs, and the other tabs on the database (Watch changes, a structure comparison, the
  Relationship diagram).
- [ ] On a read-only connection **Drop database…** is not shown, and the command is refused with *The connection
  Production is read-only.*
- [ ] Dropping `shop`, teal, with `shop.orders` `#1e90ff` and `shop.logs` excluded, shows the step `forget the colors
  and the exclusions from searches of shop and its collections`; after it, `databaseColors`, `collectionColors` and
  `exclusions` have no `shop` nor any key that starts with `shop.`, and the entries of `crm` stay. (differs)
- [ ] Dropping a database forgets the formatting rules of its collections. (differs)
- [ ] Dropping a database forgets the formatting rules of its section **Database shop**; those of the connection and
  of **Everywhere** stay. (differs)

### `manage.name-rules` — Valid names of databases and collections

The names Datardo refuses while they are typed, before asking MongoDB, whose messages say less.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/manage/name-rules.ts › nameError(kind, name)`
- **Uses**: used by `manage.create-database`, `manage.create-collection`, `manage.rename-collection`.
- **Ported from**: manage.name-rules; `src/manage.ts` (`databaseNameError`, `collectionNameError`).

Input: the kind (database or collection) and the name typed, trimmed. Output: the message shown under the field, or
none when the name is valid.

Rules, checked in this order; the checks against existing names come after them, in the cards that use them:

- a database: empty → *Enter a name*; one of space, `/`, `\`, `.`, `"`, `$`, `*`, `<`, `>`, `:`, `|`, `?` or the NUL
  character → *A database name cannot contain spaces or / \ . " $ \* < > : | ?*; more than 63 bytes in UTF-8 → *A
  database name is at most 63 bytes*;
- a collection: empty → *Enter a name*; `$` or NUL → *A collection name cannot contain $*; starting with `system.` →
  *Names starting with "system." are reserved*; starting or ending with `.` → *A collection name cannot start or end
  with a dot*.

Worked examples:

| Name | As | Message |
| --- | --- | --- |
| `shop` | database | none |
| `my shop` | database | *A database name cannot contain spaces or / \ . " $ \* < > : \| ?* |
| 64 × `a` | database | *A database name is at most 63 bytes* |
| 32 × `é` (64 bytes) | database | *A database name is at most 63 bytes* |
| `orders.2024` | collection | none |
| `system.users` | collection | *Names starting with "system." are reserved* |
| `orders.` | collection | *A collection name cannot start or end with a dot* |
| `$orders` | collection | *A collection name cannot contain $* |
| empty | either | *Enter a name* |

Acceptance:

- [ ] Each name of the examples gives its message.
- [ ] `$system.users` as a collection gives *A collection name cannot contain $*: the first rule that fails decides.

### `manage.read-options` — The options of a collection or a view

What MongoDB reports about one collection or view: its type and its options, among them the definition of a view and
the validation rules of a collection.

- **Kind**: Read
- **Engine**: MongoDB
- **Function**: `src/features/manage/read-options.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: read by `manage.definition` and `manage.validation` when they open and after a save; the tool
  `collection_options` of the MCP server (`mcp.server`).
- **Uses**: used by `manage.definition`, `manage.validation`, `manage.edit-view`, `manage.edit-validation`.
- **Ported from**: manage.edit-view and manage.edit-validation (their reads); `src/definitionFs.ts` (`readFile`).

Sent: `db.getCollectionInfos({ name: "orders" })`.

Returned: whether it exists, its type (`collection`, `view` or `timeseries`), and its options as relaxed Extended
JSON. From them:

- a view definition is `{ viewOn, pipeline }`, with `pipeline` an empty array when the server reports none;
- the validation rules are `{ validator, validationLevel, validationAction }`, with `validationLevel` *strict* and
  `validationAction` *error* when the server reports none. A missing validator and `{}` both mean *no rules*.

Acceptance:

- [ ] For a view on `orders` with `[{ $match: { status: "paid" } }]`, the definition is `{ viewOn: "orders",
  pipeline: [{ $match: { status: "paid" } }] }`.
- [ ] For a collection whose options have a validator and nothing else, `validationLevel` is `strict` and
  `validationAction` is `error`.
- [ ] A name that no longer exists gives *not found*, not an empty definition.
- [ ] A date inside a validator (`{ $gte: ISODate("2024-01-01T00:00:00Z") }`) comes back as a date, not as text.

### `manage.definition` — The Definition section of a view

Shows the source and the pipeline of a view in an editor, where they are changed and saved.

- **Kind**: View
- **Engine**: MongoDB
- **Function**: `src/features/manage/definition.ts › view(state)`
- **Entry points**: **Definition** in the section bar of a view's tab (`@section-bar`); **Edit view definition…** in
  the context menu of a view (`@tree-menu`), which opens the view's tab on this section. Go to: **Edit view
  definition…**, for the view of the active tab.
- **Offered when**: the tab is of a view. A view's tab has **Definition** where a collection's has **Indexes** and
  **Validation**.
- **Reads**: `manage.read-options`, when the section is first shown, on **Reload**, and after a save.
- **Commands**: `manage.definition`
- **Uses**: `manage.edit-view` (**Save**), `manage.read-options`, `query.autocomplete` (stages and the fields of the
  source collection, in the pipeline).
- **Ported from**: manage.edit-view (opening); `src/definitionFs.ts` (`open`, `readFile`), `src/extension.ts`.

What it shows, top to bottom:

1. the toolbar: **Save** (`Ctrl+S`), disabled until the text differs from what was read; **Discard changes**, which
   puts back the text as it was read; **Reload**, which reads the definition again and, with unsaved changes, first
   asks **Discard your changes to the definition of shop.recent?** with the button **Discard**;
2. the editor, with the definition as text in mongosh syntax, two-space indented:

   ```
   {
     viewOn: "orders",
     pipeline: [
       { $match: { status: "paid" } }
     ]
   }
   ```

3. under the editor, the message of the last save that was refused, until the text changes.

States: *loading* while the definition is read; *error* with the server's message and **Reload** when it cannot be
read; *read-only* on a read-only connection: the editor cannot be typed in, **Save** and **Discard changes** are not
shown, and the status line says **Read-only**. A view that no longer exists shows *The view shop.recent no longer
exists.* The unsaved text is kept while the tab is open, also when another section is shown.

Acceptance:

- [ ] The section of the view `recent` on `orders` shows `viewOn: "orders"` and its pipeline, two-space indented, with
  values in mongosh syntax (`ISODate("…")`, `ObjectId("…")`).
- [ ] **Save** is disabled until a character of the text changes, and again after a save.
- [ ] Typing, showing **Documents** and coming back to **Definition** shows the text as typed.
- [ ] On a read-only connection the editor is read-only and there is no **Save**.
- [ ] A collection's tab has no **Definition** section.

### `manage.edit-view` — Save a view's definition

Applies the source and the pipeline typed in the Definition section to the view.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/manage/edit-view.ts › plan(context, answers)`
- **Entry points**: **Save** in the toolbar of the Definition section (`@toolbar`); `Ctrl+S` in its editor
  (`@editor`).
- **Offered when**: the tab is of a view, the connection is not read-only, and the text differs from what was read.
- **Reads**: nothing more: the text of the editor is its input.
- **Plan**: `db.runCommand({ collMod: "recent", viewOn: "orders", pipeline: [{ $match: { status: "paid" } }] })`, with
  the values in their BSON types.
- **Danger**: None: saving applies at once, as a file is saved. No document is touched.
- **Read-only**: Refused on a read-only connection (`/read-only`). The connection is checked when **Save** is
  pressed, not when the tab was opened.
- **Undo**: Cannot be undone from the undo history: the definition is not a document, and the one before is not kept.
  There is no confirmation; **Discard changes** before saving is the way back.
- **After**: *Saved view shop.recent.* (`runner.notify`); the section reads the definition again; the **Documents**
  section of the view's tab, when it has run a query, runs it again (`query.run`).
- **Refuses**: each leaves the view as it was and is shown under the editor:
  - text that is not mongosh syntax (`/invalid`): *Invalid definition: …* with the parse error;
  - not an object (`/not-an-object`): *The definition must be an object*;
  - `viewOn` missing, empty or not text (`/view-on`): *viewOn: the name of the source collection or view*;
  - `pipeline` not an array (`/pipeline`): *pipeline: an array of stages*;
  - another field (`/unknown-field`): *Unknown field collation: a view has viewOn and pipeline*, naming the first one;
  - a read-only connection (`/read-only`): *The connection Production is read-only.*

  An error of MongoDB is shown as *Not applied: …* with its message, and the text stays unsaved.
- **Commands**: `manage.edit-view`
- **Uses**: `manage.definition`, `query.parse`, `query.run`, `runner.notify`.
- **Ported from**: manage.edit-view; `src/definitionFs.ts` (`writeFile`), `src/shared/query.ts`.

Acceptance:

- [ ] Changing the `$match` of the pipeline to `{ status: "new" }` and saving sends `collMod` with the new pipeline;
  the view then returns the documents with `status: "new"`, and its **Documents** section shows them.
- [ ] Values written in mongosh syntax (`ISODate("2024-01-01")`, `ObjectId("65f1…")`) are applied with their types.
- [ ] `{ viewOn: "orders" }` is refused with *pipeline: an array of stages*; `{ pipeline: [] }` with *viewOn: the
  name of the source collection or view*; `[]` with *The definition must be an object*.
- [ ] `{ viewOn: "orders", pipeline: [], collation: { locale: "en" } }` is refused with *Unknown field collation: a
  view has viewOn and pipeline*.
- [ ] A pipeline MongoDB refuses (`[{ $out: "x" }]`) shows *Not applied: …*, the view is unchanged and **Save** stays
  enabled.
- [ ] A save through a connection made read-only after the tab was opened is refused with *The connection Production
  is read-only.*, and nothing is sent.

### `manage.validation` — The Validation section of a collection

Shows the validator, the validation level and the validation action of a collection in an editor, where they are
changed and saved. For a collection without rules it proposes a `$jsonSchema` generated from its documents.

- **Kind**: View
- **Engine**: MongoDB
- **Function**: `src/features/manage/validation.ts › view(state)`
- **Entry points**: **Validation** in the section bar of a collection tab (`@section-bar`); **Edit validation
  rules…** in the context menu of a collection (`@tree-menu`); **Validation rules…** in the toolbar of the Schema
  section (`schema.show`). Go to: **Edit validation rules…**, for the collection of the active tab.
- **Offered when**: the tab is of a collection, not of a view.
- **Reads**: `manage.read-options`, when the section is first shown, on **Reload**, and after a save. When the
  collection has no rules: a random sample of 1,000 documents, `db.orders.aggregate([{ $sample: { size: 1000 } }])`
  with a limit of 60 seconds, analyzed by `schema.analyze` and turned into rules by `manage.generate-json-schema`.
- **Commands**: `manage.validation`
- **Uses**: `manage.edit-validation` (**Save**), `manage.read-options`, `manage.generate-json-schema`,
  `schema.analyze`, `query.autocomplete`.
- **Ported from**: manage.edit-validation (opening); `src/definitionFs.ts` (`open`, `readFile`),
  `src/collectionPanel.ts`, `src/webview/main.ts`.

What it shows, top to bottom:

1. the toolbar: **Save** (`Ctrl+S`), **Discard changes** and **Reload**, as in `manage.definition`. With generated
   rules **Save** is enabled at once: the text differs from the rules of the collection, which has none;
2. for generated rules, the note *orders has no validation rules: this $jsonSchema was generated from 1,000 documents.
   Review it, then save (Ctrl+S) to apply it. validationAction "warn" only logs invalid documents.* The number is the
   documents sampled: fewer in a smaller collection;
3. the editor, with the rules as text in mongosh syntax, two-space indented:

   ```
   {
     validator: { $jsonSchema: { bsonType: "object", required: ["_id", "status"], properties: { … } } },
     validationLevel: "strict",
     validationAction: "error"
   }
   ```

4. under the editor, the message of the last save that was refused, until the text changes.

States: *loading* while the rules are read (*Reading 1,000 documents to propose rules…* while the sample is read);
*error* with the server's message and **Reload**; *read-only* on a read-only connection: the rules can only be read,
nothing is generated for a collection without rules, which shows *orders has no validation rules.*, and there is no
**Save**. The unsaved text is kept while the tab is open.

Acceptance:

- [ ] A collection with rules shows `validator`, `validationLevel` (`strict` when unset) and `validationAction`
  (`error` when unset), and no note.
- [ ] A collection without rules shows a generated `$jsonSchema` with `validationLevel: "strict"` and
  `validationAction: "error"`, and the note with the number of documents sampled: *generated from 37 documents* for a
  collection of 37.
- [ ] An empty collection without rules shows `validator: {}` and no note.
- [ ] Nothing is sent to change the collection until **Save**: leaving the section with generated rules leaves the
  collection without rules.
- [ ] A view's tab has no **Validation** section.
- [ ] On a read-only connection the editor is read-only, there is no **Save**, and no sample is read.

### `manage.edit-validation` — Save a collection's validation rules

Applies the validator, the validation level and the validation action typed in the Validation section.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/manage/edit-validation.ts › plan(context, answers)`
- **Entry points**: **Save** in the toolbar of the Validation section (`@toolbar`); `Ctrl+S` in its editor
  (`@editor`).
- **Offered when**: the tab is of a collection, the connection is not read-only, and the text differs from the rules
  the collection has.
- **Reads**: nothing more: the text of the editor is its input.
- **Plan**: `db.runCommand({ collMod: "orders", validator: { $jsonSchema: { … } }, validationLevel: "strict",
  validationAction: "error" })`, with only the fields present in the text.
- **Danger**: None: saving applies at once. The rules apply to later writes, not to the documents already there.
- **Read-only**: Refused on a read-only connection (`/read-only`). The connection is checked when **Save** is
  pressed, not when the tab was opened.
- **Undo**: Cannot be undone from the undo history: the rules are not a document, and those before are not kept.
  There is no confirmation; **Discard changes** before saving is the way back.
- **After**: *Applied the validation rules of shop.orders.* (`runner.notify`); the section reads the rules again, and
  the note of generated rules goes away; the **Documents** section, when it has run a query, runs it again.
- **Refuses**: each leaves the rules as they were and is shown under the editor:
  - text that is not mongosh syntax (`/invalid`): *Invalid definition: …* with the parse error;
  - not an object (`/not-an-object`): *The definition must be an object*;
  - a field other than the three (`/unknown-field`): *Unknown field validatorLevel: use validator, validationLevel,
    validationAction*, naming the first one;
  - `validator` not an object (`/validator`): *validator must be an object ({} removes the rules)*;
  - a view (`/view`): *Views have no validation rules.*;
  - a read-only connection (`/read-only`): *The connection Production is read-only.*

  An error of MongoDB is shown as *Not applied: …* with its message, and the text stays unsaved.
- **Commands**: `manage.edit-validation`
- **Uses**: `manage.validation`, `manage.generate-json-schema`, `query.parse`, `query.run`, `runner.notify`.
- **Ported from**: manage.edit-validation; `src/definitionFs.ts` (`writeFile`).

Acceptance:

- [ ] Saving `{ validator: {} }` removes the rules: the step is `db.runCommand({ collMod: "orders", validator: {} })`,
  with no `validationLevel` and no `validationAction`.
- [ ] After saving rules with `validationAction: "error"`, an insert that breaks them is refused by MongoDB.
- [ ] After saving the same rules with `validationAction: "warn"`, the same insert is accepted.
- [ ] `{ validator: 5 }` is refused with *validator must be an object ({} removes the rules)*; `{ validatorLevel:
  "strict" }` with *Unknown field validatorLevel: use validator, validationLevel, validationAction*.
- [ ] A validator MongoDB refuses (`{ $jsonSchema: { bsonType: "strin" } }`) shows *Not applied: …* and leaves the
  rules as they were.
- [ ] A save through a connection made read-only after the tab was opened is refused with *The connection Production
  is read-only.*, and nothing is sent.

### `manage.generate-json-schema` — The `$jsonSchema` proposed from a sample

The validation rules proposed for a collection without any: the BSON types seen for each field, nested and in arrays,
and as required the fields present in every document.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/manage/generate-json-schema.ts › jsonSchema(summary)`
- **Uses**: `schema.analyze` (the summary it starts from); used by `manage.validation`.
- **Ported from**: manage.generate-json-schema; `src/shared/schema.ts` (`toJsonSchema`, `analyzeSchema`).

Input: the summary of a sample of documents (`schema.analyze`): for each field, the number of objects it could appear
in, the number where it is present (`null` included), its BSON types by frequency, its sub-fields, the elements of its
arrays. Output: `{ bsonType: "object", required?, properties }`.

Rules:

- each field is `{ bsonType: <type> }`, or `{ bsonType: [<types>] }` with several types, most frequent first, using
  MongoDB's aliases (`objectId`, `string`, `int`, `long`, `double`, `decimal`, `bool`, `date`, `null`, `binData`,
  `regex`, `timestamp`, …);
- `required` lists the fields present in every object that could have them, `null` values counting as present; there
  is no `required` when none is;
- a field with object values has `properties` (and `required`) of their sub-fields, merged across documents;
- a field with array values has `items`, the schema of their elements; arrays that are always empty give no `items`;
- no `additionalProperties`: fields not seen are allowed;
- fields beyond the first 500 different keys of an object are not analyzed, so they are not in the schema.

Worked examples (sample → schema):

| Sample | Schema |
| --- | --- |
| `{ _id: 1, name: "a", age: 3 }`, `{ _id: 2, name: "b", age: "x" }`, `{ _id: 3, name: null }` | `required: ["_id", "name"]`; `_id: { bsonType: "int" }`, `name: { bsonType: ["string", "null"] }`, `age: { bsonType: ["int", "string"] }` |
| `{ a: { b: 1, c: true }, tags: ["x"] }`, `{ a: { b: 2 }, tags: [] }` | `a: { bsonType: "object", required: ["b"], properties: { b: int, c: bool } }`, `tags: { bsonType: "array", items: { bsonType: "string" } }` |
| `{ a: 1 }`, `{ b: 1 }` | no `required` |
| `{ items: [{ sku: "x", qty: 1 }, { sku: "y" }] }` | `items: { bsonType: "array", items: { bsonType: "object", required: ["sku"], properties: { sku: string, qty: int } } }` |
| `{ tags: [] }`, `{ tags: [] }` | `tags: { bsonType: "array" }`, with no `items` |

Acceptance:

- [ ] Each sample of the examples gives its schema.
- [ ] A schema generated from a collection and saved unchanged accepts every document of the sample.
- [ ] `NumberLong(1)` and `1` in the same field give `bsonType: ["int", "long"]` or `["long", "int"]`, the more
  frequent first: the two types are never merged into one.
