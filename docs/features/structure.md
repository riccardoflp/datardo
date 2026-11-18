# Structure

A structure comparison puts two databases side by side (collections and views, their options, indexes, search
indexes and shard keys) and makes the right one like the left one, the model: by running the changes (**Apply…**) or
by giving a mongosh script. The two databases can be on different connections, as development and production
before a release. The left database is never written.

The page is a View with one Read behind it, done on both sides. What each difference takes to be removed is a
Derivation, and so is the script; copying the script, opening it in a playground and applying the differences are
Operations. Comparing the documents of two collections is another page, `compare.show`.

In Datardo a step that drops a collection with its documents makes the plan of `structure.apply` *Destructive*: the
user types the collection's name, as when dropping it from the tree. Mongoster asks with a button only (its open
question Q11).

### `structure.show` — The structure comparison page of two databases

A page tab with a left and a right database, the counts of what differs between their structures, and the list of
the differences grouped by collection.

- **Kind**: View
- **Engine**: MongoDB
- **Function**: `src/features/structure/show.ts › view(state)`
- **Entry points**: **Compare structure with…** in the context menu of a database of the tree island
  (`@tree-menu`), which opens the page with that database on the left; Go to (**Compare structure with…**), for the
  database of the active tab.
- **Offered when**: the connection is a MongoDB connection.
- **Reads**: the connections, and the databases of the connection chosen for the right side, for its two lists;
  `structure.read` on both sides, when a comparison starts.
- **After**: the tab is titled `Structure: shop` when both databases have the same name or the right side is not
  chosen yet, `Structure: shop ↔ shop2` otherwise, in the group of the connection it was opened on.
- **Commands**: `structure.show`.
- **Uses**: `structure.read`, `structure.steps`, `structure.script`, `structure.copy-script`,
  `structure.open-in-playground`, `structure.apply`, `connection.connect`, `connection.read-only`,
  `runner.progress`, `runner.cancel`, `tab.open`, `tab.restore`, `nav.inspector`, `nav.status-line`.
- **Ported from**: README, *Comparing database structures*; `src/structurePanel.ts` (`StructurePanel`,
  `pickConnection`, `pickDatabase`), `src/webview/structure.ts`. Mongoster asks for the other database before it
  opens the page and shows the detail of a difference under its row; choosing the right side in the page and the
  detail in the inspector island are new in Datardo.

What the page shows, from the top:

1. The sides (`@form`). **Left · model**: the database and the name of its connection. **⇄** (tooltip *Swap the
   sides: the script then changes the other database*). **Right · changed by the script**: two lists, **Connection**
   and **Database**, and a *read-only* badge when the right connection is read-only, with *The connection Production
   is read-only.* as tooltip.
2. *The script and **Apply…** make the right database like the left one.*, and **Compare** (tooltip *Read both
   structures again*).
3. The counts: four chips, *31 same*, *4 different*, *5 only left*, *3 only right*, then *12 differences · 0.8 s* or
   *The structures are the same · 0.8 s*; under them the notes on what was not compared (`structure.steps`), such as
   *Search indexes are not compared: the right server has no search (1 search index on the left).*
4. The toolbar (`@toolbar`): **Only differences** and **All** (tooltips *Only what differs* and *Also what is the
   same on both sides*; **Only differences** to start with); **Include drops in the script** (off; tooltip *Steps
   that drop indexes, collections or data are in the script without the // in front*); on the right **Copy script**,
   **Open in playground** and **Apply all…**.
5. The list (`@table`), grouped by collection in order of name. A group's head has the name, *view* or *time series*
   when it is one, and *· 3 differences* or *· same*; a click folds or unfolds it; it has **Apply…** (tooltip *Apply
   the 3 differences of orders to the right database*) when more than one of its differences can be applied. Under
   it, one row per difference: the kind (**Same**, **Different**, **Only left**, **Only right**); the object
   (`collection`, `view`, `time series`, `options`, `index status_1`, `search index default`, `shard key`); the
   summary (*Missing on the right: { status: 1 }*, *Only on the right: { old: 1 }*, *Collection missing on the
   right, with 2 indexes*, *View missing on the right (on orders)*, *Collection only on the right*, *A view on the
   left, a collection on the right*, *Different definition*, *Sharded on the left by { region: 1 }, not on the
   right*); and **Apply…** when a command can apply it (tooltip *Change the right database (after a confirmation)*,
   or *Change the right database, dropping something (after a confirmation)*).

Choosing the right side:

- **Connection** lists the MongoDB connections, the left side's connection first, with *same connection* and
  *read-only* beside the names they apply to; its tooltip is *The connection of the other database, which the script
  changes (e.g. production)*. Choosing one connects it when it is not connected (`connection.connect`); a failure
  shows *Could not connect to Production: <the message>* in the error line.
- **Database** lists the databases of that connection without `admin`, `local` and `config`, and without the left
  database itself on the same connection: the one with the left database's name first, then by name. A database
  with the left database's name is chosen by itself. With nothing to list, the page says *Local has no other
  database to compare with.*
- The first time both lists have a value the comparison starts by itself; later a change of the right side clears
  the result and waits for **Compare**.
- **⇄** exchanges the two databases, says *Swapping the sides…* and compares again. It is disabled while a
  comparison runs.

Comparing:

- **Compare** reads both structures again. While it runs the page and the status line (`runner.progress`) say
  *Reading the structures… left 3 of 12 collections, right 5 of 9 collections* (`…` for a side whose collections are
  not listed yet); **Cancel** on the status line (`runner.cancel`) stops it and keeps the result before it.
- A chip, pressed, keeps only the rows of its kind; pressed again it shows them all; it is disabled at 0. Its
  tooltip is *Show only what is the same*, *Show only what is different*, *Show only what is only left* or *Show
  only what is only right*. Pressing *same* turns **All** on.
- With **Only differences**, the rows **Same** are hidden, and so are the groups that have no other row.

Selecting a row shows the difference in the inspector island (`nav.inspector`):

1. **Copy script** (tooltip *Copy the steps of this difference*) when it has steps, and **Apply…** when a command
   can apply it; *The same on both sides* for a row **Same**; *No command can do this: the script says what to do*
   when its steps are only notes.
2. When the two definitions differ in fields, a table with the columns **field**, **left** and **right**, with `—`
   and the tooltip *Missing on this side* where a side lacks the field.
3. Both definitions whole, in mongosh syntax, under **Left** and **Right**.
4. *Steps on the right*: the lines of the script for this difference, as **Include drops in the script** has them.

States:

- **No right side yet**: the lists, and no counts.
- **Loading**: the progress above; **Compare**, **⇄** and every **Apply…** are disabled.
- **Empty**: *No differences: the collections, options and indexes are the same on both sides.* when there is
  nothing to list with **Only differences**; *Nothing of this kind.* when the chip pressed has no rows.
- **Error**: the server's message in an error line; the result of the comparison before it stays.
- **Read-only**: with a read-only right connection the comparison, **Copy script** and **Open in playground** work,
  and every **Apply…** and **Apply all…** is disabled with *The connection Production is read-only.* as tooltip. The
  left connection may be read-only: it is only read.

The two sides, **Only differences** or **All**, the chip pressed, the folded groups and **Include drops in the
script** are kept with the tab and restored with it (`tab.restore`); a restored tab compares again by itself.

Acceptance:

- [ ] **Compare structure with…** on the database `shop` of Dev opens a tab titled `Structure: shop` with **Left ·
  model** at `shop` of Dev and **Connection** at Dev, marked *same connection*.
- [ ] Choosing the connection Production, which has a database `shop`, selects it and starts the comparison without
  **Compare**.
- [ ] On the same connection **Database** does not list `shop` itself, nor `admin`, `local` and `config`; a
  connection whose only other databases are those three says *Dev has no other database to compare with.*
- [ ] Choosing the database `shop_staging` changes the tab's title to `Structure: shop ↔ shop_staging`.
- [ ] With 31 objects the same, 4 different, 5 only on the left and 3 only on the right, the chips say so and the
  summary says *12 differences*.
- [ ] Two databases with the same structure show *The structures are the same* and *No differences: the
  collections, options and indexes are the same on both sides.*
- [ ] With **Only differences**, a collection whose objects are all the same has no group; with **All** it has one
  that says *· same*.
- [ ] A collection with 3 differences a command can apply has **Apply…** on its head; one with a single such
  difference has it only on the row.
- [ ] A difference no command can apply (another collation) has no **Apply…** and the inspector island says *No
  command can do this: the script says what to do*.
- [ ] Selecting the row `index status_1` shows both definitions and, under *Steps on the right*,
  `db.getCollection("orders").createIndex({ status: 1 });`.
- [ ] With a read-only right connection the comparison runs, **Copy script** works, and **Apply all…** is disabled
  with *The connection Production is read-only.*
- [ ] **⇄** makes Production's database the model: what was **Only left** is now **Only right**.

### `structure.read` — Read the structure of a database

Reads what a database is made of, without reading any document: its collections and views with their options, their
indexes, their search indexes and their shard keys.

- **Kind**: Read
- **Engine**: MongoDB
- **Function**: `src/features/structure/read.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: `structure.show`, for each side, both sides at the same time.
- **Reads**, in order:
  1. `db.runCommand({ listCollections: 1, nameOnly: false })`; the collections whose name starts with `system.` are
     left out, the others sorted by name. Each is a view, a time series or a collection;
  2. `db.adminCommand({ hello: 1 })`; when it answers `msg: "isdbgrid"` the deployment is a sharded cluster, and the
     shard keys are read with `db.getSiblingDB("config").collections.find({ _id: /^shop\./, dropped: { $ne: true }
     })`: the key of each collection and whether it is unique;
  3. per collection that is not a view, 8 collections at a time, `db.getCollection("orders").getIndexes()`; the
     index `_id_` is left out and the others sorted by name;
  4. per collection that is neither a view nor a time series, one after the other,
     `db.getCollection("orders").getSearchIndexes()`, sorted by name. The first answer tells whether the server has
     search: when it has not, no other collection is asked and the database has no search indexes to compare; when
     the read fails for another reason, the same, and the reason is kept for a note.
- **Uses**: `structure.steps`, the read of search indexes of the Indexes area, `runner.progress`.
- **Ported from**: `src/structure.ts › readStructure`, `readShardKeys`; `src/structurePanel.ts ›
  StructurePanel.compare`; `src/searchIndexes.ts › loadSearchIndexes`.

Rules:

1. The options of a collection and the definition of an index are reduced to what `structure.steps` compares before
   they are returned: defaults and what does not count are left out.
2. The progress is the number of collections whose indexes were read, over the collections of the database.
3. A `hello` that fails, or a `config.collections` that cannot be read, means no shard keys: the database is treated
   as not sharded.
4. A failure of `listCollections` or of `getIndexes` fails the comparison with the server's message.
5. No document of the database's collections is read, and nothing is written.

Acceptance:

- [ ] A database with `orders`, the view `recent` and `system.views` gives two entries, `orders` as a collection and
  `recent` as a view, and `getIndexes` is sent to `orders` only.
- [ ] The index `_id_` is never part of a structure.
- [ ] With 20 collections, no more than 8 `getIndexes` run at the same time.
- [ ] On a server without search, `getSearchIndexes` is sent to the first collection only, and the page notes
  *Search indexes are not compared: the right server has no search (1 search index on the left).* when the other
  side has one.
- [ ] Through a mongos, a collection sharded on `{ region: 1 }` has that shard key; on a replica set
  `config.collections` is not read.
- [ ] A user who may not read `config.collections` gets a structure without shard keys and no error.
- [ ] A user who may not list the indexes of a collection gets the server's message and no result.

### `structure.steps` — What each difference takes

For each difference between the two databases, the steps that make the right side like the left one, which of them
drop something, and what no command can do. **Apply…** runs the steps; the script writes them.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/structure/steps.ts › diffStructure(left, right)`
- **Uses**: `structure.read`, the rule of the Indexes area that says whether an index can change in place.
- **Ported from**: structure.steps; `src/shared/structure.ts › diffStructure`, `optionSteps`, `normalizeOptions`,
  `indexShape`; `src/shared/indexes.ts › planIndexChange`.

Inputs: the structure of each database: collections with their type, the options that matter, indexes without
`_id_`, search indexes when the server has search, shard keys through a mongos. Output: the differences, each with a
kind (same, different, only left, only right), a summary, both definitions, and its steps; plus notes on what was
not compared.

What is compared:

- Collection options: `validator`, `validationLevel`, `validationAction`, `capped`, `size`, `max`, `timeseries`,
  `expireAfterSeconds`, `clusteredIndex`, `collation`, `changeStreamPreAndPostImages`; defaults are left out
  (`validationLevel: "strict"`, `validationAction: "error"`, an empty validator, pre- and post-images off, the
  collation's `version`). Views: `viewOn`, `pipeline`, `collation`.
- Indexes, paired first by name and identity, then by identity, then by name. The identity is the keys with the
  collation and the partial filter: two indexes with the same keys and another collation are two indexes. `v`, `ns`,
  `background`, the generated name and options at their default don't count.
- Search indexes only when both servers have search; otherwise, when the other side has some, a note: *Search
  indexes are not compared: the right server has no search (1 search index on the left).* When they could not be
  read: *Search indexes are not compared: they could not be read on the right: <the reason>*.
- Shard keys only when both are sharded clusters; otherwise a note: *Shard keys are not compared: only the left is a
  sharded cluster.*

Rules (difference → steps on the right; *destructive* steps are applied only with drops and commented out of the
script without them):

| Difference | Steps | Destructive |
| --- | --- | --- |
| Collection or view only on the left | `createCollection` with its options; for a collection, `createIndex` for each index, then `shardCollection` (both sharded) and `createSearchIndex` for each search index (both with search) | no |
| Collection or view only on the right | `drop`, with the note *Its documents and indexes are deleted.* for a collection | yes |
| A view on one side, a collection on the other; or a time series on one side only | `drop`, with the note *The collection is dropped and created again as a view: its documents are deleted.* (without the last part when a view is dropped), then the steps that create it as on the left | all |
| Options of a collection | one `collMod` with what differs: `validator` (the left's, or `{}`), `validationLevel` (or `"strict"`), `validationAction` (or `"error"`), `changeStreamPreAndPostImages` (or `{ enabled: false }`), `expireAfterSeconds` of a time series or clustered collection (or `"off"`), `timeseries: { granularity }` when only the granularity differs, `cappedSize` and `cappedMax` when both are capped | no |
| Capped on the left only | `convertToCapped` with the left's size | yes |
| Capped on the right only; another collation; clustered on one side only; time series options other than the granularity | none: a note says what to do by hand | — |
| A view's `viewOn` or `pipeline` | `collMod` with `viewOn` and `pipeline` | no |
| A view's collation | `drop`, then `createCollection` as on the left (a view holds no data) | no |
| Index only on the left | `createIndex` with its keys and options, named as on the left | no |
| Index only on the right | `dropIndex` | yes |
| Paired index, only `hidden` or the TTL differ (both with a TTL) | `collMod: { index: { name: <right name>, hidden, expireAfterSeconds } }` | no |
| Paired index, anything else (keys, name, `unique`, partial filter, adding or removing a TTL…) | `dropIndex` of the right one, then `createIndex` of the left one, with the note *MongoDB can't change <what> of an index: it is dropped and built again. Queries can't use it in the meantime.* | yes |
| Search index only on the left | `createSearchIndex` | no |
| Search index with another definition, same type | `updateSearchIndex` | no |
| Search index of another type | `dropSearchIndex`, then `createSearchIndex` | yes |
| Search index only on the right | `dropSearchIndex` | yes |
| Sharded on the left only | `shardCollection`, with the note *The collection needs an index that starts with the shard key.* | no |
| Sharded on the right only | none: `unshardCollection` (MongoDB 8.0 or later) is said in a note | — |
| Another shard key | none: `reshardCollection` (MongoDB 5.0 or later) is said in a note | — |

Worked examples (left; right → difference and steps):

- `orders` with `{ validator: { a: { $exists: true } } }` and indexes `status_1 { status: 1 }`, `byDate { date: -1 }`
  with `expireAfterSeconds: 3600`; nothing on the right → only left, *Collection missing on the right, with 2
  indexes*: `createCollection("orders", { validator })`, `createIndex({ status: 1 }, { name: "status_1" })`,
  `createIndex({ date: -1 }, { expireAfterSeconds: 3600, name: "byDate" })`; nothing destructive.
- `byStatus { status: 1 }`; `status_1 { status: 1 }` → one different pair, *Same keys { status: 1 }, named
  status_1 on the right*: `dropIndex("status_1")`, `createIndex({ status: 1 }, { name: "byStatus" })`, both
  destructive.
- `main { a: 1, b: 1 }`; `main { b: 1, a: 1 }` → *Same name, different keys: { a: 1, b: 1 } on the left, { b: 1, a: 1
  } on the right*: `dropIndex`, `createIndex`.
- `a_1 { a: 1 }` hidden with TTL 60; `a_1 { a: 1 }` with TTL 30 → *Different hidden, expireAfterSeconds*: `collMod: {
  index: { name: "a_1", hidden: true, expireAfterSeconds: 60 } }`.
- `a_1 { a: 1 }` unique; `a_1 { a: 1 }` → *Different unique*: `dropIndex`, `createIndex`, destructive.
- `a_fr { a: 1 }` with collation `fr` and `a_1 { a: 1 }`; `a_1 { a: 1 }` and `a_part { a: 1 }` with a partial filter →
  `a_1` same, `a_fr` only on the left, `a_part` only on the right.
- Capped 8192 with max 10; capped 4096 → `collMod: { cappedSize: 8192, cappedMax: 10 }`. Capped 8192; not capped →
  `convertToCapped` 8192, destructive. Not capped; capped → a note *A capped collection can't be made uncapped: …*.
- Time series with `granularity: "hours"` and `expireAfterSeconds: 60`; the same with `"seconds"` and no expiry →
  `collMod: { expireAfterSeconds: 60, timeseries: { granularity: "hours" } }`.

Acceptance:

- [ ] The examples above give the differences and steps shown.
- [ ] A difference of the kind same has no steps, and a step with no command only has its note.
- [ ] Every step that drops a collection, an index or data is marked destructive, except dropping a view to change
  its collation.
- [ ] Two databases of which only the left is a sharded cluster with sharded collections give the note *Shard keys
  are not compared: only the left is a sharded cluster.* and no difference of shard keys.
- [ ] An index that differs only by `v`, `ns`, `background` or a generated name is the same.

### `structure.script` — The script that makes the right database like the left one

A mongosh script with the steps of every difference, in an order that runs, the steps that drop something commented
out unless asked, and what no command can do explained in comments.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/structure/script.ts › structureScript(differences, options)`
- **Uses**: `structure.steps`, `query.format`.
- **Ported from**: structure.script; `src/shared/structure.ts › structureScript`, `orderForScript`, `stepLines`,
  `opCommand`, `diffTitle`; `src/shared/indexes.ts › indexCommand`; `src/shared/searchIndexes.ts ›
  searchIndexCommand`.

Inputs: the differences of the comparison (all of them, also those the list hides), the right database's name, the
`connection › database` of each side, and whether drops are included. Output: the script text, ending with a new
line. It writes nothing to a database: a playground on a read-only connection refuses its writes when run.

Rules:

1. The header: `// Makes <right> like <left>.`, `// Generated by Datardo (Compare structure).`, then, when a step
   drops something, `// Steps that drop something are commented out: remove the // in front of them to run them
   too.` (or, with drops, `// Steps marked DESTRUCTIVE drop indexes, collections or data: check them before running
   the script.`), an empty line and `use("<database>");`.
2. The order: collections to create; collections to recreate; options and indexes; shard keys; views, each after the
   view it is on; search indexes; last, whatever is only on the right. Within a group, by collection name.
3. Each difference: an empty line, `// <collection>: <object> – <summary>`, then for each step its note as a `//`
   line and its command with a `;`.
4. A destructive step without drops: `// DESTRUCTIVE, optional: remove the // to run it.` and every line of the
   command behind `// `. With drops: `// DESTRUCTIVE` above the command.
5. A step no command can do is only its note.
6. Nothing to change: `// Nothing to change: the structures are the same.` after `use`.
7. The commands:

| Step | Command |
| --- | --- |
| create a collection | `db.createCollection("c")`, `db.createCollection("c", { capped: true, size: 4096 })` |
| create a view | `db.createView("v", "c", [{ $match: { a: 1 } }], { collation: { locale: "fr" } })` |
| collMod | `db.runCommand({ collMod: "c", validationLevel: "strict" })` |
| convertToCapped | `db.runCommand({ convertToCapped: "c", size: 10 })` |
| drop | `db.getCollection("c").drop()` |
| createIndex | `db.getCollection("c").createIndex({ a: 1 })`, `….createIndex({ a: 1 }, { name: "mine", unique: true })` (a generated name is left out) |
| dropIndex | `db.getCollection("c").dropIndex("a_1")` |
| createSearchIndex | `db.getCollection("c").createSearchIndex("default", { mappings: { dynamic: true } })`; a vector index adds `"vectorSearch"` before the definition |
| updateSearchIndex | `db.getCollection("c").updateSearchIndex("default", { mappings: { dynamic: false } })` |
| dropSearchIndex | `db.getCollection("c").dropSearchIndex("default")` |
| shardCollection | `db.adminCommand({ shardCollection: "shop.c", key: { a: "hashed" } })` |

Worked example: left `dev › shop` with `orders` (index `status_1`), `users`, and the views `recent` on `orders` and
`big` on `recent`; right `prod › shop` with `orders` (index `old_1`), `legacy`, and `users` with a validator. Without
drops:

```js
// Makes prod › shop like dev › shop.
// Generated by Datardo (Compare structure).
// Steps that drop something are commented out: remove the // in front of them to run them too.

use("shop");

// orders: index status_1 – Missing on the right: { status: 1 }
db.getCollection("orders").createIndex({ status: 1 });

// users: options – Different validator
db.runCommand({ collMod: "users", validator: {} });

// recent: view – View missing on the right (on orders)
db.createView("recent", "orders", [{ $sort: { date: -1 } }]);

// big: view – View missing on the right (on recent)
db.createView("big", "recent", [{ $match: { total: { $gt: 100 } } }]);

// legacy: collection – Collection only on the right
// Its documents and indexes are deleted.
// DESTRUCTIVE, optional: remove the // to run it.
// db.getCollection("legacy").drop();

// orders: index old_1 – Only on the right: { old: 1 }
// DESTRUCTIVE, optional: remove the // to run it.
// db.getCollection("orders").dropIndex("old_1");
```

With drops, the two last steps are `// DESTRUCTIVE` followed by the command, uncommented.

Acceptance:

- [ ] The example above gives exactly that script; with **Include drops in the script** on, the drops run.
- [ ] Running the script with drops in a playground on the right database leaves only the differences no command can
  make.
- [ ] The script of a read-only right connection can be copied and opened, and its playground refuses the writes.
- [ ] Two databases with the same structure give the script that says `// Nothing to change: the structures are the
  same.`
- [ ] A view `big` on the view `recent`, both missing on the right, has `recent` created before `big`, whatever
  their names.
- [ ] A command of several lines that is destructive has `// ` in front of each of its lines without drops.

### `structure.copy-script` — Copy the script

Copies the script of the comparison, or the steps of one difference, to paste them in a shell, a migration or a
review.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/structure/copy-script.ts › plan(context, answers)`
- **Entry points**: **Copy script** in the toolbar of the structure comparison page (`@toolbar`; tooltip *Copy the
  mongosh script that makes the right database like the left one*), for every difference; **Copy script** in the
  inspector island on a selected difference (`@inspector`; tooltip *Copy the steps of this difference*), for its
  steps alone.
- **Offered when**: a comparison has a result; in the inspector island, when the difference has steps.
- **Plan**: one app step: `copy the script that makes Production › shop like Dev › shop to the clipboard`, or `copy
  the steps of orders index status_1 to the clipboard`.
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone: nothing is written to a deployment.
- **After**: a notification *Copied to the clipboard* that leaves by itself after 2 seconds.
- **Uses**: `structure.script`, `runner.notify`.
- **Ported from**: structure.script; `src/structurePanel.ts › StructurePanel.receive` (`copy`),
  `src/webview/structure.ts › detail`.

Acceptance:

- [ ] **Copy script** in the toolbar puts the whole script of `structure.script` on the clipboard, with the drops
  commented out or not as **Include drops in the script** says.
- [ ] The script copied holds the steps of every difference, also of the rows a chip or **Only differences** hides.
- [ ] **Copy script** on the difference `orders index status_1` copies its lines alone, without the header and
  without `use("shop");`, ending with a new line.
- [ ] With the same structures the script copied says `// Nothing to change: the structures are the same.`
- [ ] On a read-only right connection **Copy script** works.

### `structure.open-in-playground` — Open the script in a playground

Opens the script in a new playground on the right connection and database, where it can be read, changed and run.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/structure/open-in-playground.ts › plan(context, answers)`
- **Entry points**: **Open in playground** in the toolbar of the structure comparison page (`@toolbar`; tooltip
  *Open the script in a new playground on the right connection*).
- **Offered when**: a comparison has a result.
- **Plan**: one app step: `open a playground on Production › shop with the script that makes it like Dev › shop`.
- **Danger**: None: nothing runs until the user runs the playground (`playground.run`), which has its own rules for
  writes.
- **Read-only**: Allowed, because it writes nothing to a deployment: the playground of a read-only connection
  refuses the script's writes when it is run.
- **Undo**: Cannot be undone: nothing is written; closing the playground tab is enough.
- **After**: a new playground tab is active in the group of the right connection, on the right database, with the
  script as its text, the drops commented out or not as **Include drops in the script** says.
- **Uses**: `structure.script`, `playground.open`, `playground.run`, `tab.open`.
- **Ported from**: structure.script; `src/structurePanel.ts › StructurePanel.receive` (`openPlayground`).

Acceptance:

- [ ] **Open in playground** opens a new playground tab on Production and `shop` whose text is exactly the script of
  `structure.script`; pressing it twice opens two playgrounds.
- [ ] Nothing is sent to the right database until the playground is run.
- [ ] Running that playground with drops included leaves only the differences no command can make.
- [ ] On a read-only right connection the playground opens, and running it is refused for its writes.

### `structure.apply` — Apply differences to the right database

Makes the right database like the left one for one difference, the differences of one collection, or all of them,
after a confirmation that lists the commands.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/structure/apply.ts › plan(context, answers)`
- **Entry points**: in the structure comparison page, **Apply…** on a difference's row (`@table`) and in the
  inspector island on a selected difference (`@inspector`); **Apply…** on a collection's head, when it has more than
  one difference a command can apply (`@table`); **Apply all…** in the toolbar (`@toolbar`; tooltip *Apply every
  difference to the right database, after a confirmation*).
- **Offered when**: the difference has at least one step a command can run (`structure.steps`). The controls are
  disabled while a comparison runs and when the right connection is read-only, with *The connection Production is
  read-only.* as tooltip.
- **Asks**: only for several differences that have both steps that drop nothing and steps that drop something: *2
  steps drop something: dropIndex, createIndex.*, pick one of **Apply without drops** (the default) and **Apply
  including drops**. The steps of one difference are always all applied, its drops included.
- **Reads**: nothing more of the structures: the differences of the last comparison. For each collection a step
  drops with its documents, `db.getCollection("legacy").estimatedDocumentCount()`, so that the confirmation says how
  many documents are lost.
- **Plan**: on the right database, the steps of the chosen differences in the order of `structure.script` (rule 2),
  each as the script writes it (rule 7), without the steps that drop something when they were left out and without
  the steps no command can do. For the worked example of `structure.script`, with drops:
  1. `db.getCollection("orders").createIndex({ status: 1 })`
  2. `db.runCommand({ collMod: "users", validator: {} })`
  3. `db.createView("recent", "orders", [{ $sort: { date: -1 } }])`
  4. `db.createView("big", "recent", [{ $match: { total: { $gt: 100 } } }])`
  5. `db.getCollection("legacy").drop()`
  6. `db.getCollection("orders").dropIndex("old_1")`
- **Danger**: Confirm, or Destructive.
  - The confirmation of one difference is *Apply to Production › shop: orders index status_1?*, with the button
    **Apply**, **Apply and drop** when it also has steps that drop something, or **Drop** when it has only such
    steps. Of several differences it is *Make Production › shop like Dev › shop?*, with the button **Apply**,
    **Apply including drops**, or **Apply drops** when every step drops something.
  - Its text has, one line each: *3 changes: createIndex ×2, collMod.* (the steps that drop nothing, counted by
    command); *2 steps drop something: dropIndex, createIndex.* when they are applied; *1 difference can't be
    applied by a command and is left out (the script says what to do).*; and always *Index builds can take a while
    on large collections. These changes can't be undone from the undo history.*
  - Destructive when a step that will run drops a collection with its documents: a `drop()` of what is, on the
    right, a collection or a time series (one only on the right, or one created again as a view or as another
    type). A collection, its documents and its indexes are lost for good, and the user types the collection's name,
    as for `manage.drop-collection`. When the steps drop several collections the user types the name of the right
    database *(Datardo's choice)*.
  - It stays Confirm for the other steps that drop something: `dropIndex`, an index dropped and built again (queries
    can't use it until it is built), `dropSearchIndex`, the `drop()` of a view, and `convertToCapped`, which loses
    the oldest documents beyond the size and drops the indexes other than `_id`.
- **Read-only**: Refused when the right connection is read-only (`/read-only`). The left database is never written,
  and its connection may be read-only.
- **Undo**: Cannot be undone: structure changes are not recorded in the undo history, and the confirmation says so.
- **Publishes**: Not published: no document is written. The documents removed by `drop` or `convertToCapped` are
  not published either.
- **After**: a notification *Applied 6 changes to Production › shop.* or *Nothing was changed in Production › shop.*,
  followed, when steps failed, by *2 differences failed: orders index status_1: <the error> · users options: <the
  error>* (the first 3, then ` …`); the tree island is refreshed (`tree.refresh`) when something changed; the page
  compares again.
- **Refuses**: *The connection Production is read-only. Its structure can't be changed.* (`/read-only`); *Wait for
  the comparison to finish.* while a comparison runs (`/comparing`); *Nothing to change: compare again.* when the
  differences are no longer there, as after **⇄** (`/stale`); *These differences can't be applied by a command: the
  script says what to do.* when none of them has a step a command can run (`/no-command`).
- **Uses**: `structure.steps`, `structure.script`, `manage.drop-collection`, `tree.refresh`, `runner.ask`,
  `runner.confirm`, `runner.notify`. Its index steps are sent as the script writes them, not through
  `index.create`.
- **Ported from**: structure.apply; `src/structurePanel.ts › StructurePanel.apply`, `describe`; `src/structure.ts ›
  applyOp`; `src/shared/structure.ts › planSummary`, `orderForScript`, `diffTitle`. Mongoster asks in one
  confirmation with the buttons Apply and Apply Including Drops, and never asks for a name to be typed.

A step that fails stops the remaining steps of its difference only, because they need it; the steps of the other
differences go on, and the notification names each difference that failed with the server's error.

Acceptance:

- [ ] **Apply…** on an index missing on the right asks *Apply to Production › shop: orders index status_1?* with
  **Apply**, and after it the right collection has the index with the same keys, name and options.
- [ ] **Apply…** on an index with the same keys and another name asks with **Drop** and *2 steps drop something:
  dropIndex, createIndex.*, and after it the right index has the left one's name.
- [ ] **Apply all…** with **Apply without drops** creates what is missing and changes what collMod can change, and
  leaves every collection and index only on the right in place; the documents stay.
- [ ] **Apply all…** with **Apply including drops** also drops what is only on the right and rebuilds the indexes
  that differ, after which only the differences no command can make remain.
- [ ] When no chosen difference has a step that drops something, nothing is asked before the confirmation; when
  every step drops something, nothing is asked and the button is **Apply drops**.
- [ ] Applying the difference *Collection only on the right* of `legacy` shows `db.getCollection("legacy").drop()`,
  says how many documents `legacy` has, and its button stays disabled until `legacy` is typed.
- [ ] **Apply all…** including drops, with `legacy` and `tmp` only on the right, asks to type `shop`, the name of
  the right database.
- [ ] Dropping a view only on the right, an index only on the right or a search index only on the right asks for no
  name.
- [ ] **Apply all…** without drops never asks for a name, also when a collection is only on the right.
- [ ] A step that fails stops the remaining steps of its difference only; the others go on, and the notification
  names the failed difference with the server's error.
- [ ] A difference that only a script comment can solve (a collation, uncapping, clustering, resharding) has no
  **Apply…** and is left out of **Apply all…**, whose confirmation says how many were left out.
- [ ] With a read-only right connection the controls are disabled, and the feature started anyway is refused with
  *The connection Production is read-only. Its structure can't be changed.* and changes nothing.
- [ ] The confirmation always says *These changes can't be undone from the undo history.*, and nothing is added to
  the undo history.
- [ ] Closing the question or the confirmation changes nothing.
- [ ] After the changes the page compares again and the applied differences are gone; the tree island shows the
  collections created and no longer those dropped.
- [ ] On a connection that publishes for redis-oplog, nothing is published for the documents of a dropped
  collection.
