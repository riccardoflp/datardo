# Indexes

The **Indexes** section of a collection tab: the collection's indexes with their keys, properties, size and usage, and
below them its Atlas Search and Vector Search indexes with their states. From it indexes are created, edited,
duplicated, hidden and dropped, and search indexes created, changed and dropped. The pure checks that decide what a
change takes, or what is pointed out before saving, have cards of their own.

Everywhere in this area: the controls that write are not shown on a read-only connection, and a feature started
anyway is refused with *The connection Production is read-only.*; the `_id_` index has no actions; a view has no
**Indexes** section, since it uses the indexes of its source collection. Index writes change no document: none is
recorded in the undo history or published for redis-oplog. In the plans, `db` is the database of the collection.

### `index.show` — The Indexes section

Lists the indexes of the collection, then its search indexes, and starts everything that changes them.

- **Kind**: View
- **Engine**: MongoDB
- **Function**: `src/features/index/show.ts › view(state)`
- **Entry points**: **Indexes** in the section bar of a collection tab (`@section-bar`); **Indexes** in the context
  menu of a collection (`@tree-menu`), which opens its tab on this section. Go to: **Indexes**, for the collection of
  the active tab.
- **Offered when**: the tab is of a collection. A view's tab has no **Indexes** section.
- **Reads**: `index.list` when the section is first shown, on **Refresh**, after every change, and every 1,000 ms
  while a change is running or an index is being built; `index.list-search` when the section is first shown, on the
  **Refresh** of the search indexes, after every change to one, and every 5,000 ms while a search index is being
  built or dropped and for 30 seconds after a change. Both only while the section is the one shown and the window is
  visible.
- **Commands**: `index.show`
- **Uses**: `index.list`, `index.list-search`, `index.properties`, `index.search-summary`, `index.inspect`,
  `index.create`, `index.duplicate`, `index.edit`, `index.hide`, `index.drop`, `index.create-search`,
  `index.edit-search`, `index.drop-search`, `nav.inspector`, `nav.status-line`.
- **Ported from**: the `Indexes` tab, which has no card in Mongoster; `src/webview/indexes.ts`,
  `src/webview/searchIndexes.ts`, `src/collectionPanel.ts`, `src/indexes.ts`, `src/searchIndexes.ts`.

What it shows, top to bottom:

1. The toolbar: **Create index…** (not on a read-only connection), **Refresh** (*Read the indexes, their sizes and
   their usage again*), and the summary, its parts joined by ` · `: the number of indexes (`4 indexes`, `1 index`),
   their size (`1.2 MB on disk`, left out when it is not known), the documents of the collection (`1,204 documents`),
   `2 never used` (the indexes with 0 uses, `_id_` not counted; left out when there are none), and `usage counted
   since 3d ago`, from the most recent start of the counters.
2. The table of indexes, one row each, in the order the server lists them:
   - **Name**;
   - **Keys**, in mongosh syntax as `createIndex` takes them (`{ status: 1, createdAt: -1 }`; for a text index its
     fields, `{ title: "text", body: "text" }`);
   - **Properties**, the badges of `index.properties`;
   - **Size**, with a bar whose length is the size against the largest index of the collection (at least 2% wide);
     the tooltip says *38% of the size of the indexes*;
   - **Usage**: `1,204 uses`, `1 use`, followed by the rate per day: `≈ 86/day`, or `< 1/day`; nothing while the
     counter is younger than one hour or has no uses. The rate is the uses divided by the days since the counter
     started, counting less than a day as one day. An index with 0 uses, other than `_id_`, is marked as never used.
     The tooltip says *Counted since* with the date and how long ago.

   A click on **Name**, **Size** or **Usage** sorts by it: the name ascending first, size and usage descending first;
   a second click reverses, a third goes back to the server's order. A hidden index is dimmed.
3. The heading **Search indexes** with **Create search index…** (not on a read-only connection; disabled on a server
   without search, with the explanation as its tooltip), **Refresh** (*Read the search indexes and their status
   again*) and the summary: `2 search indexes · 1 being built · 1 not working`, or *none yet: they are what $search
   and $vectorSearch query*.
4. The table of search indexes, shown when there is at least one:
   - **Name**;
   - **Type**: `search` or `vector search`;
   - **Status**, as the server says it, colored: `READY` good; `PENDING`, `BUILDING` and `DELETING` busy; `FAILED`,
     `STALE` and `DOES_NOT_EXIST` bad; any other muted. Its tooltip explains the status and adds the server's
     message. When a new definition is being built beside the current one, a second badge says `new definition
     BUILDING` (*A new definition is being built: queries use the previous one until it is ready*);
   - **Queryable**: `✓` (*Queries can use this index*) or `✕` (*Queries on this index return no results yet*);
   - **Definition**, the lines of `index.search-summary` joined by ` · `.

Selecting a row, of either table, shows the index in the inspector island (`index.inspect`). The context menu of a
row and its `…` button (`@row-menu`) have, for an index other than `_id_`: **Edit…**, **Duplicate…**, **Hide** or
**Unhide**, **Drop**; for a search index that is not `DELETING`: **Edit…**, **Drop**. `Delete` on a selected row
starts the drop, `Enter` the edit.

The tooltips of a status:

| Status | Tooltip |
| --- | --- |
| `READY` | *Built: queries use it* |
| `PENDING` | *Waiting to be built* |
| `BUILDING` | *Being built: until it is ready, queries use the previous definition, if any* |
| `FAILED` | *The build failed: see the message in the details* |
| `STALE` | *Queryable, but no longer kept up to date (e.g. the oplog moved past it): it returns stale results* |
| `DELETING` | *Being dropped* |
| `DOES_NOT_EXIST` | *The index can no longer be found* |

States:

- *loading*: the tables are dimmed while they are read; the rows stay.
- *error*: when the indexes cannot be read, the server's message takes the place of the first table and the summary
  is empty; the search indexes are still read, and the other way round.
- *no search on the server*: in place of the second table, *Search indexes need MongoDB Atlas, an Atlas local
  deployment (atlas deployments setup --type local) or MongoDB Community 8.3 or later with mongot: this server has no
  search.*, with the server's own words under it. It is an explanation, not an error, and the server is not asked
  again until **Refresh**.
- *read-only*: the tables and the inspector are complete; **Create index…**, **Create search index…** and the
  actions of the rows are not shown, and the status line says **Read-only**.

Acceptance:

- [ ] A collection with `_id_`, `status_1` (never used) and `email_1` (unique, 86 uses in 12 hours) shows `3 indexes`,
  `1 never used`, the badge `unique` on `email_1` and the usage `86 uses ≈ 86/day`.
- [ ] 500 uses counted for 10 days show `≈ 50/day`; 3 uses counted for 10 days show `< 1/day`; 3 uses counted for 20
  minutes show no rate.
- [ ] `_id_` with 0 uses is not counted in `never used` and its menu has no actions.
- [ ] Clicking **Size** three times sorts largest first, smallest first, then shows the server's order again.
- [ ] While an index is being built the list is read again every second and shows `building 42%`; when the section is
  not the one shown, nothing is read.
- [ ] On a server without search, the second table is replaced by the explanation, **Create search index…** is
  disabled, and showing the section again does not ask the server; **Refresh** does.
- [ ] A search index whose new definition is being built shows `READY` and `new definition BUILDING`, and the list
  is read again every 5 seconds until it settles.
- [ ] On a read-only connection the section shows every index and no control that writes.
- [ ] Without the privilege for `$indexStats`, the indexes are listed with empty **Usage**, and no error is shown.

### `index.list` — The indexes of a collection with size, usage and builds

Everything the Indexes section shows about the indexes: what the server reports about each, its size, how often it
was used, and how far a build in progress is.

- **Kind**: Read
- **Engine**: MongoDB
- **Function**: `src/features/index/list.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: read by `index.show`, `index.dialog` and `advisor.show`; the tools `describe_collection` and
  `collection_stats` of the MCP server (`mcp.server`).
- **Uses**: used by `index.show`, `index.inspect`, `index.dialog`, `index.edit`.
- **Ported from**: `src/indexes.ts` (`loadIndexes`, `buildProgress`).

Sent, for `shop.orders`:

1. `db.orders.getIndexes()`;
2. `db.orders.aggregate([{ $indexStats: {} }])`: one document per index and per member that answers (per shard on a
   sharded cluster);
3. `db.orders.aggregate([{ $collStats: { storageStats: {} } }])`: one document per shard;
4. only when one of them reports a build in progress: `db.adminCommand({ currentOp: 1, "command.createIndexes":
   "orders", "command.$db": "shop" })`.

When 2, 3 or 4 fails (a missing privilege), the indexes are returned without usage, without sizes, or without
progress: only a failure of 1 is an error.

Returned, for each index:

- its name, its key and its other options as the server reports them, as relaxed Extended JSON;
- its size: the sum of its sizes on the shards; not known when no shard reports one;
- its uses: the sum over the members that report them; and *since*, the most recent of their starts, because the
  uses are counted on every member since at least then;
- the uses of each member (`shard`, `host`, uses, since), only when more than one member reports;
- *building*, when the storage statistics list it among the builds in progress or `$indexStats` marks it; an index
  being built that `getIndexes` does not list yet is added with the definition `$indexStats` has;
- the progress of the build: done and total of the operation, and its phase, the operation's message without the
  words `Index Build:` around it. A build has phases (scanning the collection, then inserting the keys), each counted
  from zero.

And the totals of the collection: documents, data size and size of all indexes, summed over the shards; not known
when the storage statistics cannot be read.

Acceptance:

- [ ] On a replica set, an index used 10 times on the member the connection reads from is returned with 10 uses and
  no list of members.
- [ ] On a cluster of two shards where `status_1` has 300 and 500 uses and takes 1 MB and 2 MB, it is returned with
  800 uses, 3 MB, and the two members with their shard, host and uses.
- [ ] Counters started on 1 March on one member and on 5 March on the other give *since* 5 March.
- [ ] A user without the `inprog` privilege gets *building* without a progress.
- [ ] When `$collStats` fails, the indexes come back with no size and the totals are not known; nothing is an error.
- [ ] An index being built that `getIndexes` does not list is in the result, marked *building*.

### `index.list-search` — The search indexes of a collection

The Atlas Search and Vector Search indexes of the collection with their states, telling a server without search from
an error.

- **Kind**: Read
- **Engine**: MongoDB
- **Function**: `src/features/index/list-search.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: read by `index.show` and `index.search-dialog`; the tool `describe_collection` of the MCP server.
- **Uses**: `index.search-checks` (a server without search); used by `index.show`, `index.inspect`,
  `index.create-search`.
- **Ported from**: `src/searchIndexes.ts` (`loadSearchIndexes`, `toInfo`), `src/shared/searchIndexes.ts`
  (`searchIndexType`).

Sent: `db.movies.aggregate([{ $listSearchIndexes: {} }])`; with a name, `[{ $listSearchIndexes: { name: "default"
} }]`.

Returned, for each index: its name; its type, the server's `type` when it says one (Atlas does), otherwise told from
the definition as `index.search-checks` does, `search` when it has neither shape; its status and whether it is
queryable; its latest definition; the server's message; and for each host of `statusDetail` its host name, status,
queryable, message and the status of a *staged* definition, the new one being built beside the main one.

An error that says the server has no search (`index.search-checks`, rule 4) is returned as *unsupported* with the
server's message, not as an error. Any other error is returned with its text as `index.search-checks` says it.

Acceptance:

- [ ] An index of MongoDB Community's mongot, which reports no `type`, with `{ fields: [{ type: "vector", … }] }` is
  returned as `vectorSearch`; with `{ mappings: { dynamic: true } }` as `search`.
- [ ] A host whose `mainIndex` is `READY` and whose `stagedIndex` is `BUILDING` is returned with status `READY` and
  staged `BUILDING`.
- [ ] On MongoDB 7.0 without mongot the result is *unsupported*, with no indexes and no error.
- [ ] A mongot that does not answer (code 508) is an error that starts with *The server is set up for search but
  cannot reach mongot*, never *unsupported*.

### `index.properties` — The badges of an index

What the **Properties** column says about an index, from its keys and options.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/index/properties.ts › badges(index)`
- **Uses**: `index.change-plan` (the keys as `createIndex` takes them), `index.wildcard-checks`; used by
  `index.show`, `index.inspect`.
- **Ported from**: `src/webview/indexes.ts` (`badges`, `formatSeconds`, `formatBytes`).

Input: an index of `index.list`. Output: the badges in this order, each with its tooltip:

1. each index type among the values of its keys, once: `text`, `2dsphere`, `2d`, `hashed`, or any other text value
   (tooltip *Index type*);
2. `wildcard`, when a key is `$**` or ends in `.$**`: *Indexes every field, or every field below the path*;
3. `not a wildcard`, a warning, when a key has a `*` and is not a wildcard: *address.\*: the index is on a field with
   that very name, not on every field. A wildcard is written $\*\* or path.$\*\**, naming the keys;
4. `unique`: *No two documents can have the same value*;
5. `sparse`: *Only documents that have the indexed fields*;
6. `TTL 2h`: *Documents are deleted this long after the indexed date*. The time is written with the largest unit that
   divides it: `d` for days, `h`, `m`, otherwise `s`;
7. `partial`: *Only documents matching* and the filter in mongosh syntax;
8. `collation fr`, with the collation in mongosh syntax as its tooltip;
9. `clustered`: *The documents are stored in the order of this index*;
10. `hidden`, a warning: *Not used by queries, but kept up to date*;
11. `building 42%`, a warning, with the tooltip *Scanning collection: 420,000 of 1,000,000* (the phase, done and
    total), or `building` with *The index build is in progress* when the progress is not known. The percentage is
    rounded down.

Sizes are written in units of 1,024: under 1,024 as `812 B`; then with one decimal under 10 and none from 10: `1.5
KB`, `38 MB`, `2.0 GB`, up to `TB`.

Worked examples:

| Index | Badges |
| --- | --- |
| `{ email: 1 }`, unique | `unique` |
| `{ createdAt: 1 }`, `expireAfterSeconds: 7200` | `TTL 2h` |
| `{ createdAt: 1 }`, `expireAfterSeconds: 86400` | `TTL 1d` |
| `{ createdAt: 1 }`, `expireAfterSeconds: 90` | `TTL 90s` |
| `{ createdAt: 1 }`, `expireAfterSeconds: 0` | `TTL 0s` |
| `{ title: "text", body: "text" }` | `text` |
| `{ loc: "2dsphere", status: 1 }`, sparse | `2dsphere`, `sparse` |
| `{ "$**": 1 }` | `wildcard` |
| `{ "address.*": 1 }` | `not a wildcard` |
| `{ status: 1 }`, partial `{ status: "active" }`, hidden | `partial`, `hidden` |
| `{ name: 1 }`, collation `{ locale: "fr", strength: 2 }` | `collation fr` |

Acceptance:

- [ ] Each index of the examples gives its badges, in that order.
- [ ] A build at 419,999 of 1,000,000 shows `building 41%`.
- [ ] 1,536 bytes are written `1.5 KB`, 10,240 bytes `10 KB`, 1,023 bytes `1023 B`.

### `index.inspect` — An index in the inspector

Shows the index selected in the Indexes section in full: its definition as the server reports it, the command that
creates it, and where it is used.

- **Kind**: View
- **Engine**: MongoDB
- **Function**: `src/features/index/inspect.ts › view(state)`
- **Entry points**: a click on a row of either table of the Indexes section, or the arrow keys (`@table`); it is
  shown in the inspector island (`@inspector`).
- **Offered when**: a row of the Indexes section is selected and the inspector island is shown.
- **Uses**: `index.command`, `index.properties`, `index.edit`, `index.duplicate`, `index.hide`, `index.drop`,
  `index.edit-search`, `index.drop-search`, `nav.inspector`.
- **Ported from**: the details row of the `Indexes` tab; `src/webview/indexes.ts` (`details`),
  `src/webview/searchIndexes.ts` (`details`).

For an index it shows, top to bottom: the name and the badges; the actions **Edit…**, **Duplicate…**, **Hide** or
**Unhide** and **Drop** (not for `_id_`, not on a read-only connection); **Definition**, the name, the key and every
option as the server reports them, as a tree; **Command**, the mongosh command that creates the index
(`index.command`) with **Copy** (*Copy the mongosh command that creates this index*); and, when more than one member
reports uses, **Usage by member**, one line each: `shard01 · db1.example.com:27018: 300 uses since` and the date, the
shard left out on a replica set.

For a search index: the name, the type and the status; **Edit…** and **Drop** (not while `DELETING`, not on a
read-only connection); **Definition**, the latest definition as a tree; **Command** with **Copy**; **Message**, the
server's, when it has one; and **Status by host**, one line each: `mongot1:27028: READY · queryable · new definition
BUILDING — ` and the host's message, with `unknown status` when the host reports none.

States: nothing selected, the inspector says *Select an index to see its definition.*; an index that is gone after a
refresh empties it.

Acceptance:

- [ ] Selecting `email_1` shows `{ name: "email_1", key: { email: 1 }, v: 2, unique: true }` as a tree and the command
  `db.getCollection("users").createIndex({ email: 1 }, { unique: true })`.
- [ ] **Copy** puts exactly that command on the clipboard.
- [ ] On a cluster of two shards, **Usage by member** has two lines with the shard, the host and the uses; on a
  replica set read from one member the part is not shown.
- [ ] A search index on two hosts shows two lines under **Status by host**.
- [ ] On a read-only connection the inspector shows everything and no action.

### `index.command` — The mongosh command of an index

The command that creates an index or a search index, as text to copy, shown while editing and in the inspector.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/index/command.ts › indexCommand(collection, definition)` and `›
  searchIndexCommand(collection, name, type, definition, update)`
- **Uses**: `index.change-plan` (the normalized definition), `query.format` (values in mongosh syntax); used by
  `index.dialog`, `index.search-dialog`, `index.inspect`, `index.edit`.
- **Ported from**: `src/shared/indexes.ts` (`indexCommand`), `src/shared/searchIndexes.ts` (`searchIndexCommand`).

Rules:

1. An index: `db.getCollection("<collection>").createIndex(<keys>)`, with a second argument only when the normalized
   definition has options. The definition is normalized first (`index.change-plan`, rule 1): false flags, the name
   MongoDB would generate and text weights of 1 are left out.
2. A search index: `db.getCollection("<collection>").createSearchIndex("<name>", <definition>)`; a vector search
   index: `createSearchIndex("<name>", "vectorSearch", <definition>)`; a change of definition:
   `updateSearchIndex("<name>", <definition>)`.
3. The collection's name and the index's name are written as JSON strings, so that any name is valid.

Worked examples:

| Input | Command |
| --- | --- |
| `orders`, `{ status: 1, createdAt: -1 }`, `{ unique: true }` | `db.getCollection("orders").createIndex({ status: 1, createdAt: -1 }, { unique: true })` |
| `orders`, `{ status: 1 }`, `{ unique: false, name: "status_1" }` | `db.getCollection("orders").createIndex({ status: 1 })` |
| `orders`, `{ status: 1 }`, `{ name: "byStatus" }` | `db.getCollection("orders").createIndex({ status: 1 }, { name: "byStatus" })` |
| `my "odd" name`, `{ a: 1 }` | `db.getCollection("my \"odd\" name").createIndex({ a: 1 })` |
| `movies`, `default`, search, `{ mappings: { dynamic: true } }` | `db.getCollection("movies").createSearchIndex("default", { mappings: { dynamic: true } })` |
| `movies`, `vector_index`, vector search, `{ fields: [ … ] }` | `db.getCollection("movies").createSearchIndex("vector_index", "vectorSearch", { fields: [ … ] })` |
| `movies`, `titles`, a change | `db.getCollection("movies").updateSearchIndex("titles", { … })` |

Acceptance:

- [ ] Each input of the examples gives its command.
- [ ] The command of an index, parsed back, gives the same keys and options: copying it into a playground creates the
  same index.

### `index.dialog` — The index dialog

The dialog where an index is defined, as a form or as the keys and options `createIndex` takes, with the command and
what saving takes shown while editing. `index.create`, `index.duplicate` and `index.edit` ask through it.

- **Kind**: View
- **Engine**: MongoDB
- **Function**: `src/features/index/dialog.ts › view(state)`
- **Entry points**: opened by `index.create`, `index.duplicate` and `index.edit` (`@dialog`).
- **Reads**: the indexes and the number of documents of the collection (`index.list`), for the note; the field paths
  the query bar suggests (`query.autocomplete`), for the names of the fields.
- **Uses**: `index.command`, `index.change-plan`, `index.wildcard-checks`, `index.list`, `query.autocomplete`,
  `query.parse`.
- **Ported from**: index.create (its **Asks**) and index.edit; `src/webview/indexDialog.ts`,
  `src/collectionPanel.ts` (the dialog's markup).

What it shows, top to bottom:

1. The title, *Create index · orders* or *Edit index · status_1*, and the switch **Form** (*Fields, types and the
   common options*) / **Text** (*The keys and options as createIndex takes them*).
2. In **Form**:
   - **Fields**: one row per field: the field's path (placeholder *field, nested.field or $\*\* for every field*,
     with the fields of the documents suggested); its direction or type: `1 (ascending)`, `-1 (descending)`, `text`,
     `2dsphere`, `2d`, `hashed`; for a `text` field a weight (placeholder *weight*, 1 when empty); **↑** (*Move up:
     the order of the fields is part of the index*), **↓** (*Move down*) and **✕** (*Remove the field*). **+ Field**
     adds a row (*Add a field: a compound index follows the order of its fields*). An empty row is ignored.
   - **Options**: **Name**, with the name MongoDB would generate as its placeholder (*generated from the fields*
     while there are none); **Unique** (*No two documents can have the same value in the indexed fields.*);
     **Sparse** (*Only documents that have the indexed fields are in the index.*); **Hidden** (*Kept up to date, but
     not used by queries.*); **TTL**, *Documents are deleted* a whole number of `seconds`, `minutes`, `hours` or
     `days` (default `days`) *after the date in the field.*; **Partial**, a filter in mongosh syntax with the query
     bar's suggestions (placeholder `{ status: "active" }`); **Collation** (placeholder `{ locale: "en", strength: 2
     }`); **Language**, the `default_language` of a text index, shown only when a field is `text` (placeholder
     `english`); **More options**, any other option of `createIndex` as an object (placeholder `{ wildcardProjection:
     { … }, language_override: "…", bits: 26, … }`). Typing the value of **TTL**, **Partial** or **Collation** ticks
     its box.
3. In **Text**: **Keys** (placeholder `{ status: 1, createdAt: -1 }`) and **Options** (placeholder `{ unique: true,
   name: "…", expireAfterSeconds: 3600, partialFilterExpression: { … } }`), two editors in mongosh syntax.
4. **Command**: the `createIndex` of `index.command` for what is typed; empty while it cannot be read.
5. The warnings of `index.wildcard-checks`, one per line.
6. The note, one of:
   - creating: *The collection already has an index named status_1.*; or *The index status_1 already has these keys:
     MongoDB takes a second one only with a different collation, partial filter, sparse or unique.*; or, from 100,000
     documents, *The build reads the 1,200,000 documents of the collection: it can take a while and loads the
     server.*; otherwise nothing;
   - editing: *No changes yet.*; or *Applied to the existing index: nothing is built again.*; or *MongoDB can't
     change the keys, unique of an existing index: it will be dropped and built again, after a confirmation.*, naming
     what `index.change-plan` lists.
7. The error of the last attempt, until the next one.
8. The buttons: **Copy command** (disabled while there is no command), **Cancel**, and **Create index** or **Save
   changes** (`Ctrl+Enter`), which is disabled while editing with *No changes yet.* While the change runs the button
   says **Creating…** or **Saving…**, **Cancel** becomes **Close** (*The index keeps being built: the Indexes section
   shows when it is done*) and the form cannot be changed.

Switching to **Text** writes the keys and options of the form there; a form that cannot be read yet opens as empty
text. Switching to **Form** reads the text: a parse error is shown and the dialog stays in **Text**; keys the form
cannot show (a value that is neither `1`, `-1` nor text) give *These keys can only be edited as text: the form takes
a direction (1, -1) or an index type for each field.* A dialog opened on such keys starts in **Text**. An option the
form has a control for but with a value it cannot show (`unique: "yes"`, weights on fields that are not `text`) goes
to **More options**.

What the dialog refuses before anything is sent, as its error: *Add at least one field to index.*; *The field status
is listed twice.*; *The weight of title must be a whole number from 1.*; *TTL: enter after how long the documents
expire.* (empty, negative or not whole); *Partial: enter the filter of the documents to index, e.g. { status: "active"
}*; *Collation: enter at least the locale, e.g. { locale: "en", strength: 2 }*; a text that does not parse, with the
name of its input: *More options: …*, *Partial filter: …*, *Collation: …*, *Keys: …*, *Options: …*; a text that is
not an object: *Options must be an object, e.g. { … }*; in **Text** with no keys: *Keys: enter the fields to index,
e.g. { status: 1, createdAt: -1 }*.

Acceptance:

- [ ] Fields `status` `1` and `createdAt` `-1` with **Unique** show the command
  `db.getCollection("orders").createIndex({ status: 1, createdAt: -1 }, { unique: true })`, and the placeholder of
  **Name** is `status_1_createdAt_-1`.
- [ ] **TTL** `2` `hours` gives `expireAfterSeconds: 7200` in the command; `90` `seconds` gives `90`.
- [ ] Typing a number in the TTL field ticks **TTL**.
- [ ] **Text** shows the keys and options of the form, and **Form** shows them back; `{ a: { b: 1 } }` as keys stays
  in **Text** with the message above.
- [ ] Two rows with the field `status` give *The field status is listed twice.* and nothing is sent.
- [ ] A weight of `0` or `1.5` on a text field gives *The weight of title must be a whole number from 1.*
- [ ] In a collection of 99,999 documents the note is empty; with 100,000 it says the build reads them.
- [ ] `Ctrl+Enter` does what the main button does, and nothing while that button is disabled.
- [ ] **Close** while the index is built closes the dialog and leaves the build running.

### `index.create` — Create an index

Creates an index on the collection from the index dialog, empty or filled with keys suggested elsewhere.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/index/create.ts › plan(context, answers)`
- **Entry points**: **Create index…** in the toolbar of the Indexes section (`@toolbar`); **Create…** beside the
  index the Explain section suggests (`explain.show`), **Create index…** on an advice of the Index advisor
  (`advisor.show`) and in the details of a slow query of the Monitor page (`monitor.show`): each opens the dialog
  filled with the suggested keys. Go to: **Create index…**, for the collection of the active tab.
- **Offered when**: a collection, not a view, of a connection that is not read-only.
- **Asks**: `index.dialog`, titled *Create index · orders*, empty or with the keys it was started with.
- **Reads**: `index.list`, for the dialog's note.
- **Plan**: `db.runCommand({ createIndexes: "orders", indexes: [{ key: { status: 1, createdAt: -1 }, name:
  "status_1_createdAt_-1", unique: true }] })`. The name is the one given, or the one MongoDB generates
  (`index.change-plan`, rule 5). A `commitQuorum` among the options is moved out of the index to the command. The
  options are sent as given, in one command, so that the server refuses an option it does not know instead of
  ignoring it.
- **Danger**: None: nothing is lost. The dialog's note says that the build reads the whole collection from 100,000
  documents.
- **Read-only**: Refused on a read-only connection (`/read-only`).
- **Undo**: Cannot be undone from the undo history: an index is not a document. There is no confirmation;
  `index.drop` removes it.
- **Publishes**: Not published: no document is written. The documents a TTL index later makes the server delete are
  not published either: Datardo does not delete them.
- **After**: the dialog closes; *Created index status_1_createdAt_-1.*, or *An identical index already exists:
  nothing was created.* when the server reports as many indexes after as before (`runner.notify`); the list is read
  again and shows the index as `building` with its progress while it is built. With the dialog closed during the
  build, the same notification says how it ended.
- **Refuses**: a read-only connection (`/read-only`): *The connection Production is read-only.*; a view (`/view`):
  *Views have no indexes of their own.*; no keys (`/no-keys`): *Keys: enter the fields to index, e.g. { status: 1,
  age: -1 }*; keys or options that are not objects (`/not-an-object`): *Keys must be an object*, *Options must be an
  object*. What the dialog refuses is in `index.dialog`. The server's error (an option it does not know, duplicate
  values for `unique`, a wildcard written wrong) is shown in the dialog, which stays open.
- **Commands**: `index.create`
- **Uses**: `index.dialog`, `index.change-plan`, `index.wildcard-checks`, `index.list`, `runner.notify`.
- **Ported from**: index.create; `src/indexes.ts` (`saveIndex`, `createIndex`), `src/collectionPanel.ts`,
  `src/webview/indexDialog.ts`; for the advices and the slow queries, `src/advisor.ts` and `src/monitor.ts`, which
  in Mongoster create with a confirmation of their own and no dialog.

Acceptance:

- [ ] Fields `status` `1` and `createdAt` `-1` with **Unique** create the index `status_1_createdAt_-1`, unique, and
  the Log records the `createIndexes` command above.
- [ ] **TTL** `2` `hours` on a date field creates the index with `expireAfterSeconds: 7200`.
- [ ] An option MongoDB does not know, typed in **More options** (`{ uniqe: true }`), is refused with the server's
  error in the dialog, and no index is created.
- [ ] `{ commitQuorum: "majority" }` in **More options** is sent as `commitQuorum` of the command, not of the index.
- [ ] Creating an index identical to an existing one says *An identical index already exists: nothing was created.*
- [ ] **Unique** on a field with duplicate values fails with the server's error (`E11000`) in the dialog, which
  stays open with what was typed.
- [ ] Started from an advice for `{ kind: 1, createdAt: -1 }` on `shop.events`, the dialog opens with those two
  fields and the title *Create index · events*, whatever tab is active.
- [ ] Closing the dialog while the index is built leaves the build running, and a notification says *Created index
  status_1.* when it ends.
- [ ] On a read-only connection **Create index…** is not shown, and the command is refused with *The connection
  Production is read-only.* and creates nothing; on a view it is refused with *Views have no indexes of their own.*

### `index.duplicate` — Duplicate an index

Opens the index dialog on a copy of an existing index without its name, to create a variant of it.

- **Kind**: View
- **Engine**: MongoDB
- **Function**: `src/features/index/duplicate.ts › view(state)`
- **Entry points**: **Duplicate…** in the menu of a row of the Indexes section (`@row-menu`) and in the inspector
  (`@inspector`), with the tooltip *Create another index starting from this one*.
- **Offered when**: every index but `_id_`, on a connection that is not read-only.
- **Uses**: `index.create`, which does the write; `index.dialog`; `index.change-plan` (the definition as
  `createIndex` takes it).
- **Ported from**: index.duplicate; `src/webview/indexes.ts`, `src/shared/indexes.ts` (`editableSpec`).

Acceptance:

- [ ] **Duplicate…** on `byEmail { email: 1 }` unique opens *Create index · users* with the field `email`, **Unique**
  ticked and an empty **Name**, whose placeholder is `email_1`.
- [ ] **Duplicate…** on a text index on `title` and `body` with a weight of 3 on `body` opens with two `text` fields
  and the weight `3` on `body`.
- [ ] Saving the copy unchanged creates nothing: the server refuses the same keys and options under another name,
  and an index identical to one with the generated name gives *An identical index already exists: nothing was
  created.*

### `index.edit` — Edit an index

Changes an existing index: hiding it and changing its TTL in place; anything else by dropping it and building it
again, after a confirmation, never leaving the collection without the index when that can be avoided.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/index/edit.ts › plan(context, answers)`
- **Entry points**: **Edit…** in the menu of a row of the Indexes section (`@row-menu`) and in the inspector
  (`@inspector`), with the tooltip *Change the definition of the index*; `Enter` on a selected row (`@table`).
- **Offered when**: every index but `_id_`, on a connection that is not read-only.
- **Asks**: `index.dialog` on the current definition, titled *Edit index · status_1*, with the button **Save
  changes**. Its note says what saving takes.
- **Reads**: `db.orders.getIndexes()` when saving, for the index as it is now: the plan is decided on that, not on
  what the list showed.
- **Plan**: what `index.change-plan` decides between the index as it is and the new definition:
  - *none*: no step;
  - *modify*: `db.runCommand({ collMod: "orders", index: { name: "status_1", hidden: true } })` and, for the TTL,
    `db.runCommand({ collMod: "orders", index: { name: "created_1", expireAfterSeconds: 7200 } })`, in that order,
    each only when it changed;
  - *recreate* under another name: `db.runCommand({ createIndexes: "orders", indexes: [<new definition>] })`, then
    `db.orders.dropIndex("status_1")`: the old index is dropped once the new one is built, and stays if the new
    definition is refused. When the server refuses the two side by side (codes 85 and 86: the same keys, or the same
    name), the steps are run in the order of the next case;
  - *recreate* under the same name: `db.orders.dropIndex("status_1")`, then `db.runCommand({ createIndexes: "orders",
    indexes: [<new definition>] })`. When that second step is refused, a recovery step runs: `db.runCommand({
    createIndexes: "orders", indexes: [<the index as getIndexes reported it, without v and ns>] })`.
- **Danger**: None in place. Confirm for a rebuild: **Drop and recreate the index status_1 of orders?**, *MongoDB
  can't change the keys, name and unique of an existing index: it is dropped and built again with the new definition.
  Building reads the whole collection, and until it ends queries can't use the index.* (for an index that is unique:
  *…queries can't use the index and duplicate values aren't rejected.*), button **Drop and recreate**.
- **Read-only**: Refused on a read-only connection (`/read-only`).
- **Undo**: Cannot be undone from the undo history: an index is not a document. The confirmation of a rebuild says
  so; in place, the same dialog changes it back.
- **After**: the dialog closes and a notification says what was done: *Index status_1: hidden.*, *Index status_1: no
  longer hidden.*, *Index created_1: documents expire after 2 hours.*, *Index created_1: hidden, documents expire
  after 2 hours.*, *Created index byStatus and dropped status_1.*, *Recreated index status_1.* or *No changes to the
  index status_1.*; the list is read again. Cancelling the confirmation leaves the dialog open, with no message.
- **Refuses**: a read-only connection (`/read-only`): *The connection Production is read-only.*; a view (`/view`):
  *Views have no indexes of their own.*; the `_id_` index (`/id-index`): *The _id index can't be changed.*; an index
  dropped meanwhile (`/gone`): *The index status_1 no longer exists.* A new definition the server refuses is shown in
  the dialog with its error and *The index status_1 was created again as it was.*, or, if that fails too, *The index
  status_1 was dropped and could not be created again as it was (…). Its definition:* and its `createIndex` command
  (`index.command`).
- **Commands**: `index.edit`
- **Uses**: `index.dialog`, `index.change-plan`, `index.command`, `index.list`, `runner.confirm`, `runner.notify`.
- **Ported from**: index.edit; `src/indexes.ts` (`saveIndex`), `src/collectionPanel.ts`,
  `src/webview/indexDialog.ts`, `src/shared/indexes.ts`.

Acceptance:

- [ ] Ticking **Hidden** saves with one `collMod` and says *Index status_1: hidden.*; the index is not built again
  and no confirmation is asked.
- [ ] Changing a TTL from `1` `days` to `2` `hours` says *Index created_1: documents expire after 2 hours.*
- [ ] Adding **Unique** asks **Drop and recreate the index status_1 of orders?** and, after **Drop and recreate**,
  the index is unique under the same name: *Recreated index status_1.*
- [ ] Changing the keys and the name builds the new index first and drops the old one afterwards: *Created index
  byStatus and dropped status_1.*
- [ ] Under another name with the same keys and options as before, the old index is dropped first, since MongoDB
  refuses the two side by side.
- [ ] Adding **Unique** on a field with duplicate values fails with the server's error and *The index status_1 was
  created again as it was.*, and the index is there as before.
- [ ] Without changes, **Save changes** is disabled and the note says *No changes yet.*
- [ ] The confirmation of a rebuild shows its steps in order and says that the change cannot be undone from the undo
  history.
- [ ] An index dropped by someone else while the dialog was open gives *The index status_1 no longer exists.*

### `index.hide` — Hide or unhide an index

Hides an index from the query planner without dropping it, to find out whether it is still needed, or lets queries
use it again.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/index/hide.ts › plan(context, answers)`
- **Entry points**: **Hide** (*Stop queries from using this index without dropping it*) or **Unhide** (*Let queries
  use this index again*) in the menu of a row of the Indexes section (`@row-menu`) and in the inspector
  (`@inspector`); the same buttons on an advice of the Index advisor (`advisor.show`). **Hidden** in the index dialog
  does the same through `index.edit`.
- **Offered when**: every index but `_id_`, on a connection that is not read-only.
- **Plan**: `db.runCommand({ collMod: "orders", index: { name: "status_1", hidden: true } })`, or `hidden: false`.
- **Danger**: None: the index is kept up to date and comes back at once with **Unhide**.
- **Read-only**: Refused on a read-only connection (`/read-only`).
- **Undo**: Cannot be undone from the undo history: an index is not a document. There is no confirmation; **Unhide**
  reverses it.
- **After**: the list is read again, with the index marked `hidden` or not. Started from an advice, a notification
  says *The index status_1 of shop.orders is hidden: queries no longer use it, but it is still kept up to date.
  Unhide it if something gets slower.* or *The index status_1 of shop.orders is used again.*
- **Refuses**: a read-only connection (`/read-only`): *The connection Production is read-only.*; a view (`/view`):
  *Views are read-only.*; the `_id_` index (`/id-index`): *The _id index can't be changed.* An error of the server
  is shown as it is.
- **Commands**: `index.hide`
- **Uses**: `index.list`, `runner.notify`.
- **Ported from**: index.hide; `src/collectionPanel.ts` (`hideIndex`), `src/webview/indexes.ts`; for the advices,
  `src/advisor.ts` (`hide`).

Acceptance:

- [ ] **Hide** on `status_1` sends `collMod` with `hidden: true`, with no confirmation, and the row then has the
  badge `hidden` and offers **Unhide**.
- [ ] **Unhide** sends `hidden: false`.
- [ ] On a read-only connection neither is shown, and the command is refused with *The connection Production is
  read-only.* and changes nothing.
- [ ] On MongoDB 4.2, which has no hidden indexes, the server's error is shown and the list is unchanged.

### `index.drop` — Drop an index

Drops an index after a confirmation that suggests hiding it first.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/index/drop.ts › plan(context, answers)`
- **Entry points**: **Drop** in the menu of a row of the Indexes section (`@row-menu`) and in the inspector
  (`@inspector`); `Delete` on a selected row (`@table`); **Drop…** on an advice of the Index advisor
  (`advisor.show`).
- **Offered when**: every index but `_id_`, on a connection that is not read-only.
- **Plan**: `db.orders.dropIndex("status_1")`.
- **Danger**: Destructive: the index is gone, and building it again reads the whole collection. The confirmation
  **Drop index status_1 on orders?** says *Queries that use it will fall back to other indexes or a collection scan.
  Hiding the index first lets you check the impact without losing it.*, asks to type `status_1` and has the button
  **Drop**. Started from an advice, the text begins with the advice's reason (*No query used it since 12 days ago.*).
- **Read-only**: Refused on a read-only connection (`/read-only`).
- **Undo**: Cannot be undone from the undo history: an index is not a document. The confirmation says so; the
  inspector's command, copied before, creates it again.
- **After**: the list is read again; *Dropped the index status_1 of shop.orders.* (`runner.notify`).
- **Refuses**: a read-only connection (`/read-only`): *The connection Production is read-only.*; a view (`/view`):
  *Views are read-only.*; the `_id_` index (`/id-index`): *The _id index can't be changed.* An error of the server
  is shown as it is.
- **Commands**: `index.drop`
- **Uses**: `index.list`, `runner.confirm`, `runner.notify`.
- **Ported from**: index.drop; `src/collectionPanel.ts` (`dropIndex`), `src/webview/indexes.ts`; for the advices,
  `src/advisor.ts` (`drop`).

Acceptance:

- [ ] **Drop** on `status_1` asks **Drop index status_1 on orders?**; after typing `status_1` and **Drop**, the index
  is gone from the list.
- [ ] **Drop** stays disabled until the name typed is exactly `status_1`; closing the confirmation drops nothing.
- [ ] The confirmation shows the step `db.orders.dropIndex("status_1")` and says that the drop cannot be undone from
  the undo history.
- [ ] `_id_` has no **Drop**, and the command started on it is refused with *The _id index can't be changed.*
- [ ] On a read-only connection **Drop** is not shown, and the command is refused with *The connection Production is
  read-only.* and drops nothing.

### `index.search-dialog` — The search index dialog

The dialog where a search index is named and defined: the definition as text, with a form above it that follows what
is typed and rewrites the parts of it that it shows. `index.create-search` and `index.edit-search` ask through it.

- **Kind**: View
- **Engine**: MongoDB
- **Function**: `src/features/index/search-dialog.ts › view(state)`
- **Entry points**: opened by `index.create-search` and `index.edit-search` (`@dialog`).
- **Reads**: the search indexes of the collection (`index.list-search`), for the note about a name already taken; the
  sampled fields the query bar suggests, with their types and, for arrays of numbers only, the shortest and longest
  length seen (`query.autocomplete`).
- **Uses**: `index.search-form`, `index.search-checks`, `index.command`, `index.list-search`, `query.autocomplete`,
  `query.parse`.
- **Ported from**: index.create-search (its **Asks**) and index.edit-search; `src/webview/searchIndexDialog.ts`,
  `src/collectionPanel.ts` (the dialog's markup).

What it shows, top to bottom:

1. The title: *Create search index · movies* or *Edit search index · titles*.
2. **Name**, whose placeholder is the name an empty one gets (`default`, or `vector_index`). When editing it cannot
   be changed: *A search index keeps its name: to rename it, create another one and drop this one*.
3. The type: **Search** or **Vector Search**. When editing it cannot be changed. When creating, switching keeps what
   was written for each type and puts it back when switching again.
4. For **Search**: **Dynamic mapping** (*Index every field of a supported type*) and **Static mappings** (*Index the
   fields of the documents one by one, with the types seen in them*), which replace the definition with the template
   of `index.search-form`; and **Fields** (*Fields indexed one by one (static mapping), with the types seen in the
   documents*): the sampled fields that can be indexed, each with a box, ticked when the definition maps it, and the
   search types it would get.
5. For **Vector Search**: **Path**, with the arrays of numbers suggested and their length (`1536 numbers`,
   `384–1536 numbers`); **Dimensions**, filled in from the longest sampled array of the path until the user types a
   number; **Similarity**: `cosine`, `euclidean`, `dotProduct`; **Quantization**: `none`, `scalar`, `binary` (*scalar
   or binary: smaller index, faster, a little less precise*); and **Filter fields** (*Fields $vectorSearch can
   pre-filter on (its filter option)*): the sampled fields of type string, int, long, double, decimal, bool, date,
   objectId or binData that are not vectors, each with a box.
6. **Definition**, an editor in mongosh syntax with colors and suggestions (mapping options, field types, analyzers;
   the options of a vector field). A new index starts from `{ mappings: { dynamic: true } }`, or from the vector
   template with the first array of numbers found.
7. **Command**: the command of `index.command` for what is typed.
8. The notes, which warn without refusing:
   - *The collection already has a search index named default.*;
   - *The vectors of embedding in the documents sampled have 1536 numbers, not 768: documents whose vector has
     another length aren't indexed.* (or *384 to 1536 numbers*);
   - *embedding isn't an array of numbers in the documents sampled.*;
   - *No field is mapped: the index would find nothing. Turn on the dynamic mapping or tick some fields.*;
   - editing: *No changes yet.*, or *The index is built again with the new definition, in the background: queries
     keep using the current one until it is ready.*
9. The error of the last attempt.
10. **Copy command**, **Cancel**, and **Create search index** or **Save changes** (`Ctrl+Enter`), disabled while
    editing with *No changes yet.*; **Creating…** or **Saving…** while it runs.

The form and the text follow each other: a tick or a change in the form rewrites the definition
(`index.search-form`); typing in the definition updates the ticks and the vector fields. While the definition does
not parse, the boxes are disabled, and a change through the form says *Fix the definition before changing it with the
form: …* with the parse error. A field ticked in the definition and not in the sample is listed too, with the tooltip
*Not in the documents sampled*; a sampled one with *string | int · in 87% of the documents sampled*. With no field to
list: *No field of a type that can be indexed here.*, or *The fields of the documents are being read…* before the
sample has arrived.

What the dialog refuses before anything is sent: *Enter the definition of the index.*; *Definition: …* with the parse
error; *The definition must be an object, e.g. { mappings: { dynamic: true } }*.

Acceptance:

- [ ] A new dialog on a collection with a field `embedding` of 1,536 numbers, switched to **Vector Search**, shows the
  path `embedding`, the dimensions `1536` and the definition `{ fields: [{ type: "vector", path: "embedding",
  numDimensions: 1536, similarity: "cosine" }] }`.
- [ ] Ticking `title` (string) in **Fields** on `{ mappings: { dynamic: true } }` adds `fields: { title: { type:
  "string" } }` and keeps `dynamic: true`.
- [ ] Typing `quantization: "scalar"` into the vector field of the definition sets **Quantization** to `scalar`.
- [ ] Dimensions `768` on a path whose sampled vectors have 1,536 numbers show the note about another length; the
  index can still be saved.
- [ ] `{ mappings: { dynamic: false } }` shows *No field is mapped: the index would find nothing. …*
- [ ] Switching from **Search** to **Vector Search** and back shows the search definition as it was typed.
- [ ] When editing, **Name** and the type cannot be changed, and **Save changes** is disabled until the definition
  differs.

### `index.create-search` — Create a search index

Creates an Atlas Search or Vector Search index from its name, type and definition.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/index/create-search.ts › plan(context, answers)`
- **Entry points**: **Create search index…** beside **Search indexes** in the Indexes section (`@toolbar`). Go to:
  **Create search index…**, for the collection of the active tab.
- **Offered when**: a collection, not a view, of a connection that is not read-only, on a server that has search.
- **Asks**: `index.search-dialog`, titled *Create search index · movies*.
- **Reads**: `index.list-search` with the name, when saving, to refuse a name already taken; when that read fails,
  the command is sent and says what is wrong.
- **Plan**: `db.movies.createSearchIndex("default", { mappings: { dynamic: true } })`, or
  `db.movies.createSearchIndex("vector_index", "vectorSearch", { fields: [ … ] })`.
- **Danger**: None.
- **Read-only**: Refused on a read-only connection (`/read-only`).
- **Undo**: Cannot be undone from the undo history: an index is not a document. There is no confirmation;
  `index.drop-search` removes it.
- **After**: the dialog closes; *Created search index default: it is being built, and can be queried once its status
  is READY.* (`runner.notify`); the list is read again, every 5 seconds while the index is being built.
- **Refuses**:
  - a read-only connection (`/read-only`): *The connection Production is read-only.*;
  - a view (`/view`): *Views have no indexes of their own: manage the search indexes from the Indexes section of the
    source collection.*;
  - a type that is neither (`/unknown-type`): *Unknown search index type text: it is search or vectorSearch.*;
  - a definition that does not parse (`/invalid`): *Definition: …*; not an object (`/not-an-object`): *The definition
    must be an object, e.g. { mappings: { dynamic: true } }*;
  - a definition of the other type (`/type-mismatch`), with the text of `index.search-checks`, rule 2;
  - a name already taken (`/name-taken`): *A search index named default already exists: open it in the list to
    change its definition, or choose another name.*

  The server's errors are shown in the dialog as `index.search-checks` says them: without the command's path, and
  with what the server lacks when it has no search or cannot reach mongot.
- **Commands**: `index.create-search`
- **Uses**: `index.search-dialog`, `index.search-checks`, `index.list-search`, `runner.notify`.
- **Ported from**: index.create-search; `src/searchIndexes.ts` (`saveSearchIndex`), `src/collectionPanel.ts`,
  `src/webview/searchIndexDialog.ts`, `src/shared/searchIndexes.ts`.

Acceptance:

- [ ] An empty name with `{ mappings: { dynamic: true } }` creates the search index `default`; an empty name for a
  vector index creates `vector_index`.
- [ ] A name already taken is refused with *A search index named default already exists: …*, and nothing is created.
- [ ] A **Search** index given `{ fields: [ … ] }` is refused with *A search index is defined by its mappings, …*
- [ ] An invalid field type (`{ type: "strin" }`) is refused with the server's message starting with
  `"mappings.fields.title.type" must be one of`.
- [ ] On a server without search, a command started anyway fails with an error that starts with *Search indexes need
  MongoDB Atlas, an Atlas local deployment (atlas deployments setup --type local) or MongoDB Community 8.3 or later
  with mongot: this server has no search.*
- [ ] On a read-only connection **Create search index…** is not shown, and the command is refused with *The
  connection Production is read-only.* and creates nothing.

### `index.edit-search` — Change a search index's definition

Gives a search index a new definition; the server builds it in the background, and queries use the old one until
then.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/index/edit-search.ts › plan(context, answers)`
- **Entry points**: **Edit…** in the menu of a row of **Search indexes** (`@row-menu`) and in the inspector
  (`@inspector`), with the tooltip *Change the definition of the index: it is built again in the background*; `Enter`
  on a selected row (`@table`).
- **Offered when**: the index is not `DELETING`, on a connection that is not read-only.
- **Asks**: `index.search-dialog` on the current definition, with the name and the type fixed.
- **Plan**: `db.movies.updateSearchIndex("titles", { mappings: { dynamic: false, fields: { title: { type: "string" }
  } } })`.
- **Danger**: None: the old definition answers queries until the new one is ready.
- **Read-only**: Refused on a read-only connection (`/read-only`).
- **Undo**: Cannot be undone from the undo history: an index is not a document. There is no confirmation; the same
  dialog, with the definition as it was, changes it back.
- **After**: *Search index titles: the new definition is being built. Queries keep using the previous one until it is
  ready.* (`runner.notify`); the list follows the build.
- **Refuses**: as `index.create-search`, except the name: `/read-only`, `/view`, `/invalid`, `/not-an-object`,
  `/type-mismatch`. The server's error for an index that no longer exists is shown in the dialog.
- **Commands**: `index.edit-search`
- **Uses**: `index.search-dialog`, `index.search-checks`, `index.list-search`, `runner.notify`.
- **Ported from**: index.edit-search; `src/searchIndexes.ts` (`saveSearchIndex`), `src/collectionPanel.ts`,
  `src/webview/searchIndexes.ts`.

Acceptance:

- [ ] Saving a new definition of `titles` says *Search index titles: the new definition is being built. …*, and
  while the new one is `BUILDING` the index is still queryable with the old one.
- [ ] Changing an index that no longer exists fails with the server's error naming it.
- [ ] A vector search index given `{ mappings: { dynamic: true } }` is refused with *A vector search index is defined
  by a fields list, …*
- [ ] An index that is `DELETING` has no **Edit…**.

### `index.drop-search` — Drop a search index

Drops a search index after a confirmation; the server removes it in the background.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/index/drop-search.ts › plan(context, answers)`
- **Entry points**: **Drop** in the menu of a row of **Search indexes** (`@row-menu`) and in the inspector
  (`@inspector`); `Delete` on a selected row (`@table`).
- **Offered when**: the index is not `DELETING`, on a connection that is not read-only.
- **Plan**: `db.movies.dropSearchIndex("titles")`.
- **Danger**: Destructive: the index is gone, and the stages that use it return nothing. The confirmation **Drop
  search index titles on movies?** says *The $search, $searchMeta and $vectorSearch stages that use it will return no
  results. The server removes it in the background.*, asks to type `titles` and has the button **Drop**.
- **Read-only**: Refused on a read-only connection (`/read-only`).
- **Undo**: Cannot be undone from the undo history: an index is not a document. The confirmation says so.
- **After**: the list is read again and shows the index as `DELETING` until it is gone.
- **Refuses**: a read-only connection (`/read-only`): *The connection Production is read-only.*; a view (`/view`):
  *Views have no indexes of their own: manage the search indexes from the Indexes section of the source collection.*
  An error of the server is shown as `index.search-checks` says it.
- **Commands**: `index.drop-search`
- **Uses**: `index.search-checks`, `index.list-search`, `runner.confirm`.
- **Ported from**: index.drop-search; `src/searchIndexes.ts` (`dropSearchIndex`), `src/collectionPanel.ts`,
  `src/webview/searchIndexes.ts`.

Acceptance:

- [ ] **Drop** on `titles` asks **Drop search index titles on movies?**; after typing `titles` and **Drop**, the index
  is `DELETING` and then gone.
- [ ] The confirmation shows the step `db.movies.dropSearchIndex("titles")` and says that the drop cannot be undone
  from the undo history.
- [ ] Dropping an index that no longer exists shows the server's error naming it.
- [ ] On a read-only connection **Drop** is not shown, and the command is refused with *The connection Production is
  read-only.* and drops nothing.

### `index.change-plan` — What changing an index takes

Decides whether an index edited in the dialog is unchanged, changed in place with `collMod`, or dropped and built
again, and lists what changed. `index.edit` and the steps of a structure comparison (`structure.show`) both use it.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/index/change-plan.ts › indexChange(current, next)`, with `› editableDefinition(name,
  key, reported)`, `› normalized(definition)` and `› generatedName(keys)`
- **Uses**: used by `index.edit`, `index.dialog`, `index.duplicate`, `index.command`, `index.properties`,
  `structure.show`.
- **Ported from**: index.change-plan; `src/shared/indexes.ts` (`planIndexChange`, `normalizeSpec`, `editableSpec`,
  `defaultIndexName`, `indexName`, `stable`, `ttlParts`, `ttlSeconds`).

Inputs: the index as it is (from `getIndexes`, through the editable definition) and the new definition, each as keys
and `createIndex` options. Output: *none*; *modify* with `hidden` and/or `expireAfterSeconds`; or *recreate* with the
list of what changed (`keys`, `name`, and option names).

Rules:

1. Both sides are normalized first: false `unique`, `sparse` and `hidden`, `background`, `null` options, the name
   MongoDB would generate, and text weights of 1 are left out. From `getIndexes`, `v`, `ns`, `textIndexVersion`,
   `2dsphereIndexVersion`, the collation's `version` and the text defaults (`default_language: "english"`,
   `language_override: "language"`) are left out, and a text index's `_fts` / `_ftsx` become its fields with
   `"text"`.
2. The keys are compared in order; the options by value, whatever the order of their fields.
3. Only `hidden` and `expireAfterSeconds` changed, and a TTL is on both sides when it changed → *modify*.
4. Anything else, including adding or removing a TTL, → *recreate*.
5. The generated name is `<field>_<value>` joined by `_`: `{ a: 1, "b.c": -1 }` → `a_1_b.c_-1`; `{ loc: "2dsphere",
   name: "text" }` → `loc_2dsphere_name_text`.
6. A TTL is shown as a count of the largest unit that divides it: 86,400 seconds → `1` `days`, 7,200 → `2` `hours`,
   90 → `90` `seconds`, 0 → `0` `seconds`; and read back as the count times the unit.

Worked examples (current → new: result):

| Current | New | Result |
| --- | --- | --- |
| `{ a: 1 }`, collation `{ locale: "fr", strength: 1 }` | the same collation as `{ strength: 1, locale: "fr" }` | none |
| `{ a: 1, b: 1 }` | `{ b: 1, a: 1 }` | recreate: `keys`, `name` |
| `{ a: 1 }` | `{ a: 1 }` hidden | modify: hidden |
| `{ a: 1 }` hidden | `{ a: 1 }` | modify: not hidden |
| `{ a: 1 }` TTL 60 | `{ a: 1 }` TTL 120, hidden | modify: hidden, TTL 120 |
| `{ a: 1 }` | `{ a: 1 }` TTL 60 | recreate: `expireAfterSeconds` |
| `{ a: 1 }` TTL 60 | `{ a: 1 }` | recreate: `expireAfterSeconds` |
| `{ a: 1 }` | `{ a: 1 }` unique, hidden | recreate: `unique`, `hidden` |
| `{ a: 1 }` | `{ a: 1 }` named `renamed` | recreate: `name` |
| `a_1 { a: 1 }` TTL 60, as `getIndexes` reports it with `v: 2` | `{ a: 1 }` TTL 60, `unique: false` | none |

The editable definition of the index `cat_1_title_text_body_text` reported with the key `{ cat: 1, _fts: "text",
_ftsx: 1 }` and the options `{ weights: { title: 1, body: 3 }, default_language: "english", language_override:
"language", textIndexVersion: 3 }` → keys `{ cat: 1, title: "text", body: "text" }`, options `{ weights: { body: 3 }
}`.

Acceptance:

- [ ] The examples above give the results shown.
- [ ] An index read back from `getIndexes` and saved unchanged is *none*: the dialog says *No changes yet.*
- [ ] The order of the options never matters; the order of the keys always does.

### `index.wildcard-checks` — Wildcards written wrong

Points out, while the index dialog is edited and on the rows of the list, a wildcard written so that MongoDB would
index something else than meant, or given options a wildcard index cannot have. The checks only warn: the server
decides, and what it accepts depends on its version.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/index/wildcard-checks.ts › wildcardWarnings(definition)`, with `› isWildcard(field)`
- **Uses**: `index.change-plan` (the normalized definition); used by `index.dialog`, `index.properties`.
- **Ported from**: index.wildcard-checks; `src/shared/indexes.ts` (`wildcardWarnings`, `isWildcard`,
  `misspelledWildcards`).

Inputs: the keys and options of the dialog. Output: the warnings, in this order.

Rules:

1. A wildcard is `$**` or `path.$**`, with no `*` and no part starting with `$` in the path.
2. A key with a `*` that is not a wildcard: *address.\* isn't a wildcard: MongoDB would index a field with that very
   name. Write $\*\* for every field, or path.$\*\* for every field below a path.*; or, when a part of it starts with
   `$`, *a.$\*\*.b isn't a wildcard: write $\*\* for every field or path.$\*\* for every field below a path, with
   nothing after it.* The list marks an existing index with such a key `not a wildcard`.
3. More than one wildcard: *An index can have only one wildcard field.*
4. `{ "$**": "text" }` is a text index on every string field: none of the rules below apply to it.
5. A wildcard that is not `1` or `-1`: *$\*\*: a wildcard field is ascending or descending (1 or -1).*
6. A wildcard with `unique`, `sparse` or a TTL: *A wildcard index can't be unique or TTL.*, naming the options given,
   joined by *or*.
7. `wildcardProjection` with `path.$**`: *wildcardProjection only goes with $\*\*: a.$\*\* already says which fields
   are indexed.*; without any wildcard: *wildcardProjection is only for wildcard indexes.*
8. `$**` with other fields and no `wildcardProjection`: *A compound index with $\*\* needs a wildcardProjection that
   leaves out its other fields, e.g. wildcardProjection: { status: 0 }.*, with the first other field.

Worked examples (keys, options → warnings):

| Keys | Options | Warnings |
| --- | --- | --- |
| `{ "address.*": 1 }` | | *address.\* isn't a wildcard: MongoDB would index a field with that very name. …* |
| `{ "**": 1 }` | | *\*\* isn't a wildcard: MongoDB would index a field with that very name. …* |
| `{ "$**": 1, "a.$**": 1 }` | | *An index can have only one wildcard field.* |
| `{ "$**": "hashed" }` | | *$\*\*: a wildcard field is ascending or descending (1 or -1).* |
| `{ "$**": 1 }` | `{ unique: true, expireAfterSeconds: 5 }` | *A wildcard index can't be unique or TTL.* |
| `{ "$**": 1 }` | `{ sparse: true }` | *A wildcard index can't be sparse.* |
| `{ "a.$**": 1 }` | `{ wildcardProjection: { b: 1 } }` | *wildcardProjection only goes with $\*\*: a.$\*\* already says which fields are indexed.* |
| `{ a: 1 }` | `{ wildcardProjection: { b: 1 } }` | *wildcardProjection is only for wildcard indexes.* |
| `{ "$**": 1, status: 1 }` | | *… e.g. wildcardProjection: { status: 0 }.* |
| `{ "$**": 1, status: 1 }` | `{ wildcardProjection: { status: 0 } }` | none |
| `{ "$**": 1 }`, `{ "a.$**": -1 }`, `{ "$**": "text" }`, `{ a: 1 }` | | none |

Acceptance:

- [ ] The examples above give the warnings shown, while typing, above the dialog's note.
- [ ] A definition with warnings can still be saved; the server's answer is shown.
- [ ] `unique: false` on a wildcard gives no warning: the definition is normalized first.

### `index.search-checks` — What a search index definition is refused for

The checks Datardo makes before sending a search index, and how a refusal of the server is said.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/index/search-checks.ts › typeMismatch(type, definition)`, with `›
  definitionType(definition)`, `› isSearchUnsupported(error)`, `› isSearchUnreachable(error)` and `›
  searchErrorText(message)`
- **Uses**: used by `index.create-search`, `index.edit-search`, `index.drop-search`, `index.list-search`.
- **Ported from**: index.search-checks; `src/shared/searchIndexes.ts`, `src/searchIndexes.ts` (`explain`).

Inputs: the chosen type, the definition, and the server's error. Output: a refusal message, or none; and the text of
a server's error.

Rules:

1. The type of a definition is *search* when it has a `mappings` object, *vector search* when it has a `fields` list,
   unknown otherwise.
2. A definition of the other type is refused: for **Search**, *A search index is defined by its mappings, e.g. {
   mappings: { dynamic: true } }; this definition has a fields list, as a vector search index has.*; for **Vector
   Search**, *A vector search index is defined by a fields list, e.g. { fields: [{ type: "vector", path: "embedding",
   numDimensions: 1536, similarity: "cosine" }] }; this definition has mappings, as a search index has.* A definition
   of unknown type is sent, and the server judges it.
3. An empty name is `default` for **Search** and `vector_index` for **Vector Search**.
4. A server without search: an error with the code 31082, 59, 115, 40324 or 6047401, or whose message matches one of
   *requires additional configuration*, *only supported with Atlas* (or *on Atlas*, *on MongoDB Atlas*),
   *Unrecognized pipeline stage name: '$listSearchIndexes'*, *no such command: 'createSearchIndex* (or `update`,
   `drop`), *search index commands are not supported*, or the word *mongot*, and that is not of rule 5. The error is
   then preceded by *Search indexes need MongoDB Atlas, an Atlas local deployment (atlas deployments setup --type
   local) or MongoDB Community 8.3 or later with mongot: this server has no search.*
5. A server that cannot reach mongot: the code 508, the code name `SearchIndexManagementHostUnreachable`, or a message
   with *Error connecting to Search Index Management service* or *connectivity of gRPC channel*. The error is
   preceded by *The server is set up for search but cannot reach mongot, the process that builds and queries the
   search indexes: check that it is running and that mongotHost and searchIndexManagementHostAndPort point to it.*
   Rule 5 is checked before rule 4.
6. A validation error of mongot loses the path of the command: `"userCommand.indexes[0].mappings" is required` →
   `"mappings" is required`.

Worked examples:

| Type | Definition or error | Result |
| --- | --- | --- |
| search | `{ mappings: { dynamic: true } }` | no refusal |
| vector search | `{ fields: [] }` | no refusal |
| search | `{}` | no refusal: unknown type, the server judges |
| search | `{ fields: [{ type: "vector" }] }` | *A search index is defined by its mappings, …* |
| vector search | `{ mappings: { dynamic: true } }` | *A vector search index is defined by a fields list, …* |
| | code 31082 | no search: the help of rule 4, then the server's message |
| | code 508, message naming mongot | cannot reach mongot: the help of rule 5 |
| | `"userCommand.indexes[0].mappings.fields.title.type" must be one of …` | `"mappings.fields.title.type" must be one of …` |

Acceptance:

- [ ] Each row of the examples gives its result.
- [ ] A mongot that does not answer is never reported as a server without search.
- [ ] A real error (a duplicate key, a network error) is neither: it is shown as it is.

### `index.search-summary` — A search index definition in short

The lines the **Definition** column shows for a search index: what it maps, and with which analyzers; for a vector
index, its vector fields and filter fields.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/index/search-summary.ts › searchSummary(type, definition)`
- **Uses**: used by `index.show`.
- **Ported from**: `src/shared/searchIndexes.ts` (`summarizeSearchDefinition`, `mappedPaths`, `vectorFields`).

Rules, for a search index:

1. Each mapped field is written `path (types)`, with the types it is indexed as, each once: `title (string,
   autocomplete)`. A field mapped as a document with fields of its own is not listed: its fields are, with dotted
   paths (`address.city`). A mapping without a type counts as `document`.
2. First line: with a dynamic mapping, *dynamic mapping: every field*, or *dynamic mapping, plus* and up to 3 fields;
   without one, `2 fields:` and up to 4 fields, or *no field mapped*. Fields beyond the limit are counted: `+2`.
3. Second line, when there is something to say, joined by ` · `: `analyzer lucene.standard`; `search analyzer …` when
   it differs from the analyzer; `2 custom analyzers`; `synonyms`; `stored source`.

For a vector search index: one line per field of type `vector`, `autoEmbed` or `text`, joined by ` · `: its path, `1536
dims`, its similarity, `scalar quantization` (not for `none`), its type when it is not `vector`, its model; *no vector
field* when there is none; then `filter:` and up to 4 filter paths.

Worked examples:

| Type | Definition | Lines |
| --- | --- | --- |
| search | `{ mappings: { dynamic: true } }` | *dynamic mapping: every field* |
| search | `{ mappings: { dynamic: false, fields: { title: { type: "string" }, year: { type: "number" } } } }` | `2 fields: title (string), year (number)` |
| search | `{ analyzer: "lucene.english", mappings: { dynamic: true, fields: { title: [{ type: "string" }, { type: "autocomplete" }] } } }` | *dynamic mapping, plus title (string, autocomplete)*; `analyzer lucene.english` |
| search | six string fields `a` to `f`, not dynamic | `6 fields: a (string), b (string), c (string), d (string) +2` |
| search | `{ mappings: { fields: { address: { type: "document", fields: { city: { type: "string" } } } } } }` | `1 field: address.city (string)` |
| search | `{ mappings: { dynamic: false } }` | *no field mapped* |
| vector search | `{ fields: [{ type: "vector", path: "embedding", numDimensions: 1536, similarity: "cosine" }, { type: "filter", path: "genre" }] }` | `embedding · 1536 dims · cosine`; `filter: genre` |
| vector search | the same with `quantization: "scalar"` | `embedding · 1536 dims · cosine · scalar quantization` |
| vector search | `{ fields: [{ type: "filter", path: "genre" }] }` | *no vector field*; `filter: genre` |

Acceptance:

- [ ] Each definition of the examples gives its lines.
- [ ] The **Definition** column shows the lines joined by ` · `, and its tooltip one line each.

### `index.search-form` — A search index definition from the form

How the buttons and boxes of the search index dialog write the definition, and how the form reads it back.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/index/search-form.ts › staticDefinition(fields)`, `› withFieldMapped(definition, path,
  on, fields)`, `› vectorForm(definition)` and `› withVectorForm(definition, form)`
- **Uses**: used by `index.search-dialog`.
- **Ported from**: `src/shared/searchIndexes.ts` (`dynamicDefinition`, `staticDefinition`, `setMapped`,
  `searchFieldTypes`, `mappedPaths`, `vectorCandidates`, `readVectorForm`, `writeVectorForm`).

Inputs: the sampled fields with their BSON types, and the definition being edited. Outputs: a new definition, never
the one given changed in place; or the form's values read from a definition.

Rules, for a search index:

1. **Dynamic mapping** is `{ mappings: { dynamic: true } }`.
2. The search type of a sampled BSON type: `string` → `string`; `int`, `long`, `double`, `decimal` → `number`; `date`
   → `date`; `bool` → `boolean`; `objectId` → `objectId`; `object` → `document`. Other types cannot be indexed, and a
   field with none of these is not offered.
3. Ticking a field maps it: `{ type: <search type> }`; with several types, a list of such mappings; an object is
   mapped `{ type: "document", dynamic: true }`. `dynamic: false` is written when the definition says nothing about
   `dynamic`; a `dynamic: true` already there is kept. A nested field (`address.city`) is mapped under a `document`
   mapping of each parent, created when missing.
4. Unticking a field removes its mapping, then every parent `document` left with no fields and no `dynamic: true`. A
   document with mapped fields of its own, unticked, keeps them and loses `dynamic`.
5. **Static mappings** is `{ mappings: { dynamic: false, fields: … } }` with the first 30 sampled fields that can be
   indexed, without `_id`, without arrays of numbers (they belong in a vector index) and without fields that are only
   objects (they are mapped through their fields).
6. The ticked fields of a definition are its mapped paths: a document mapped through fields of its own is ticked only
   when it also maps the rest dynamically or has another mapping.

For a vector search index:

7. The form reads the first field of type `vector`: its path, dimensions, similarity (`cosine` when missing) and
   quantization (`none` when missing), and the paths of the fields of type `filter`.
8. Writing the form replaces that first vector field, keeping its other options (`hnswOptions`) and the other fields;
   with no vector field, one is added first. `quantization` is written only when it is not `none`. Empty dimensions
   are written `0`.
9. The filter fields are those ticked: the unticked are removed, the newly ticked added at the end as `{ type:
   "filter", path }`.

Worked examples:

| Start | Action | Result |
| --- | --- | --- |
| `{ mappings: { dynamic: true } }` | tick `title` (string) | `{ mappings: { dynamic: true, fields: { title: { type: "string" } } } }` |
| `{}` | tick `price` (int, double) | `{ mappings: { dynamic: false, fields: { price: { type: "number" } } } }` |
| `{ mappings: { dynamic: false, fields: {} } }` | tick `code` (string, int) | `fields: { code: [{ type: "string" }, { type: "number" }] }` |
| `{ mappings: { dynamic: false, fields: {} } }` | tick `address.city` (string) | `fields: { address: { type: "document", fields: { city: { type: "string" } } } }` |
| the result above | untick `address.city` | `{ mappings: { dynamic: false, fields: {} } }` |
| `{ mappings: { dynamic: false, fields: {} } }` | tick `address` (object) | `fields: { address: { type: "document", dynamic: true } }` |
| fields `_id` (objectId), `title` (string), `embedding` (1,536 numbers), `address` (object), `address.city` (string) | **Static mappings** | `fields: { title: { type: "string" }, address: { type: "document", fields: { city: { type: "string" } } } }` |
| `{ fields: [] }` | path `embedding`, dimensions `1536`, `cosine`, `none` | `{ fields: [{ type: "vector", path: "embedding", numDimensions: 1536, similarity: "cosine" }] }` |
| the result above | quantization `scalar`, tick the filter `genre` | `{ fields: [{ type: "vector", path: "embedding", numDimensions: 1536, similarity: "cosine", quantization: "scalar" }, { type: "filter", path: "genre" }] }` |
| a vector field with `hnswOptions: { maxEdges: 32 }` | similarity `euclidean` | the same field with `similarity: "euclidean"` and `hnswOptions` kept |

Acceptance:

- [ ] Each row of the examples gives its result.
- [ ] A definition written by the form and read back gives the same ticks and the same vector values.
- [ ] The definition given is never changed: the result is a copy.
