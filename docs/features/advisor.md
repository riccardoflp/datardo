# Index advisor

The **Index advisor** page of a MongoDB connection: from the indexes of the collections, with how often each was
used, and from the slow operations the server recorded, it says which indexes to create, which ones another index
already replaces, and which ones no query uses. Each of these is an *advice*; from an advice the index is created,
hidden or dropped with the features of the Indexes section, so the advisor itself changes one thing only: it can turn
on the profiler of a database.

Everywhere in this area: the scope of a page is the connection (every database except `admin`, `local` and
`config`), one database, or one collection; views and `system.` collections are never analyzed; nothing is read on
a timer. In the plans and the reads, a database is named whole: `db.getSiblingDB("shop")`.

### `advisor.show` — The Index advisor page

Shows the advice for a scope in three lists, with what it was computed from, and starts what acts on an advice.

- **Kind**: View
- **Engine**: MongoDB
- **Function**: `src/features/advisor/show.ts › view(state)`
- **Entry points**: **Index advisor** among the Pages of a MongoDB connection in the tree island (`@tree`), for the
  whole connection; **Index advisor** in the context menu of a database and of a collection (`@tree-menu`), for that
  database or collection. Go to: **Index advisor**, for the current connection.
- **Offered when**: the connection is MongoDB. A view has no **Index advisor**: it has no indexes of its own.
- **Reads**: `advisor.read-indexes`, then `advisor.read-slow-operations`, when the page opens, on **Refresh**, and
  after every action started from the page that ran. A reply that arrives after a newer request was sent is
  dropped.
- **Commands**: `advisor.show`
- **Uses**: `advisor.read-indexes`, `advisor.read-slow-operations`, `advisor.analyze`, `advisor.turn-on-profiler`,
  `index.create`, `index.hide`, `index.drop`, `tab.open`, `query.run`, `explain.show`, `aggregate.show`,
  `nav.status-line`.
- **Ported from**: the Index Advisor, which has no card in Mongoster; `src/advisor.ts`, `src/webview/advisor.ts`,
  `src/shared/advisor.ts`, and `src/monitor.ts` (`openOperation`).

The page opens in a tab of its own (`tab.open`), one per scope: asking for a scope whose tab is open shows that tab.
The tab is named `Index advisor` for the connection, `Index advisor · shop` for a database and `Index advisor ·
shop.orders` for a collection.

What it shows, top to bottom:

1. The toolbar (`@toolbar`): the scope (*every database*, `shop` or `shop.orders`); `Analyzed at 14:02:11`, the
   local time of the last analysis; **Refresh** (*Read the indexes and the slow operations again*), which is
   disabled and reads **Analyzing…** while the reads run.
2. The summary, its parts joined by ` · `: `12 collections`, `34 indexes`, `1.2 GB of indexes`, and `5 suggestions`
   or `nothing to suggest`. Only the collections that have at least one index are counted. A size is the bytes
   divided by 1,024 as many times as it can be, with one decimal from KB up: `512 B`, `1.2 GB`.
3. Where the slow operations come from: *Slow operations (slower than 100 ms): 240 operations from the profiler of
   shop, 12 operations from the server log, since 3 hours ago.* The database is named only when one database's
   profiler gave them all; with no operation at all the line is *Slow operations (slower than 100 ms): none.* Under
   it, when they apply:
   - *The server log can't be read: <the server's message>*;
   - for the databases whose profiler is off and gave nothing: *The profiler of shop is off: only the slow operations
     still in the server log are seen.* with **Turn on…**, or *The profiler is off on 3 databases: only the slow
     operations still in the server log are seen.* with **Turn on for shop…** for each of the first 8 of them. The
     tooltip is *Record the operations on shop slower than 100 ms*. The buttons are not shown on a read-only
     connection;
   - one line for each database whose profiler could not be read and each collection whose indexes could not be read:
     `shop: <the server's message>`, `shop.orders: <the server's message>`.
4. **Indexes to create**, with the number of advices beside the heading. Each advice has:
   - the collection (`orders` when the scope is a database or a collection, `shop.orders` when it is the connection)
     and the keys of the index, in mongosh syntax: `{ customerId: 1, createdAt: -1 }`;
   - why: *12 slow operations, 4.2 s in total, read the whole collection. This index (equality fields, then sort,
     then range) can serve it.* The reason is *read the whole collection* when one of its queries did a collection
     scan, else *sorted in memory* when one sorted in memory, else *examined many more documents than they returned*.
     With several query shapes the second sentence ends *can serve all 2 query shapes.*;
   - its queries, slowest in total first, each as: the kind (`find`), the query shape, and `7 times · avg 350 ms ·
     12,000 examined / 20 returned · collection scan, in-memory sort`, where the documents examined and returned are
     per operation; then **Open** (*Open the slowest of these queries in the collection tab*) and **Explain** (*Open
     it and show how the server runs it now*). The first 3 queries are shown; **+2 more queries** (**+1 more query**)
     shows them all and **Fewer queries** the first 3 again;
   - **Create index…** (*Create { customerId: 1, createdAt: -1 } on shop.orders*) and **Copy** (*Copy the mongosh
     command*), which copies `db.getSiblingDB("shop").getCollection("orders").createIndex({ customerId: 1,
     createdAt: -1 })`.
5. **Redundant indexes**. Each advice has the collection, the index (its name, its keys, and those of `unique ·
   sparse · partial · collation fr · hidden` that apply), its size, and: *Every query that can use it can use
   status_1_createdAt_-1 { status: 1, createdAt: -1 }, which starts with the same fields: this one only costs writes
   and memory.*; when its uses are known, *Used 12 times since 3 days ago (the planner may pick either index).*;
   then **Hide** and **Drop…**.
6. **Unused indexes**, always with the note *Use is counted since the server started (or the index was created), on
   the server Datardo is connected to: on a replica set, check the other members too before dropping. Unique and TTL
   indexes are not listed: they work without being read by queries.* When some unused indexes are too recent to
   tell, the note goes on: *2 more indexes weren’t used yet, but their statistics started less than a day ago: check
   again later.* (*1 more index wasn’t used yet, but its statistics started less than a day ago: check again
   later.*). Each advice has the collection, the index and its size, and:
   - for an unused index: *Not used by any query since 12 days ago (<the date and time>).*, or *Not used by any query
     since the statistics started.* when the start is not known; then **Hide** and **Drop…**;
   - for a hidden index: *Hidden: no query uses it, yet every write keeps it up to date. If nothing got slower since
     it was hidden, drop it.*; then **Unhide** and **Drop…**.

Times and durations: a duration of 10,000 ms or more is whole seconds (`12 s`), of 1,000 ms or more seconds with one
decimal (`4.2 s`), else milliseconds (`350 ms`). How long ago: under 90 seconds *a minute ago*; under 90 minutes `12
minutes ago`; under 36 hours `3 hours ago`; else `12 days ago`.

What the buttons of an advice start:

| Button | Starts |
| --- | --- |
| **Create index…** | `index.create`, through the index dialog filled with the keys of the advice |
| **Hide** (*Queries stop using it, but it is kept up to date: unhide it at once if something gets slower*) | `index.hide` |
| **Unhide** (*Let queries use the index again*) | `index.hide` |
| **Drop…** | `index.drop`, whose confirmation begins with the reason of the advice |
| **Open** | the collection's tab (`tab.open`) with the slowest operation of the shape: the filter, the sort and, for a `find`, the projection in the query bar, run with `query.run`; for an `aggregate`, its stages in the pipeline editor (`aggregate.show`) |
| **Explain** | the same, on the Explain section (`explain.show`) |
| **Turn on…** | `advisor.turn-on-profiler` |

The reasons given to the drop: for a redundant index, *Its fields are the start of status_1_createdAt_-1 { status:
1, createdAt: -1 }, which serves the same queries.*; for a hidden one, *It is hidden, so no query uses it.*; for an
unused one, *No query used it since 12 days ago.*

States:

- *loading*: the first time, *Reading the indexes and the slow operations…* in place of the summary; later the lists
  stay while the reads run.
- *error*: when the databases or the collections cannot be listed, the server's message takes the place of the
  lists. A collection or a profiler that cannot be read is one line under the sources, and the rest is analyzed.
- *empty*: each list has its own text. **Indexes to create**: *No slow operation needs a new index.*, or, when no
  slow operation was read at all, *No slow operations recorded yet: turn on the profiler, use the application for a
  while, then refresh.* **Redundant indexes**: *No index is the start of another one.* **Unused indexes**: *No index
  has been unused for a day or more.* when some are too recent to tell, else *Every index was used since the
  statistics started.*
- *read-only*: the advice is complete; **Create index…**, **Hide**, **Unhide** and **Drop…** are disabled with the
  tooltip *The connection is read-only*, the **Turn on…** buttons are not shown, and the status line says
  **Read-only**. **Copy**, **Open** and **Explain** work.

Acceptance:

- [ ] Opened from the Pages of `Local`, the page analyzes every database except `admin`, `local` and `config`, and
  an advice names its collection as `shop.orders`; opened from the database `shop`, it names it `orders`.
- [ ] 12 collections with 34 indexes of 1,288,490,189 bytes in all and 5 advices show `12 collections · 34 indexes ·
  1.2 GB of indexes · 5 suggestions`; with no advice the summary ends with `nothing to suggest`.
- [ ] An advice with 5 query shapes shows 3 of them and **+2 more queries**; after a click it shows 5 and **Fewer
  queries**.
- [ ] A shape with 7 operations, 2,450 ms, 84,000 documents examined and 140 returned in all, read with a collection
  scan, shows `7 times · avg 350 ms · 12,000 examined / 20 returned · collection scan`.
- [ ] **Copy** on the advice `{ customerId: 1, createdAt: -1 }` of `shop.orders` puts
  `db.getSiblingDB("shop").getCollection("orders").createIndex({ customerId: 1, createdAt: -1 })` on the clipboard,
  also on a read-only connection.
- [ ] **Create index…** opens the index dialog on `shop.orders` with the keys `customerId` ascending and `createdAt`
  descending; after the index is created the page analyzes again and the advice is gone.
- [ ] **Drop…** on an unused index opens the confirmation of `index.drop` whose text begins with *No query used it
  since 12 days ago.*; after the drop the page analyzes again.
- [ ] **Open** on a `find` opens the tab of `shop.orders` with the filter and the sort of the slowest operation of
  that shape and runs it; **Explain** shows the Explain section for it.
- [ ] With the profiler of `shop` off and no operation from it, the page says *The profiler of shop is off: only the
  slow operations still in the server log are seen.* with **Turn on…**; with 10 such databases it shows 8 buttons.
- [ ] When the indexes of `shop.audit` cannot be read, the page shows `shop.audit: <the server's message>` and the
  advice for the other collections.
- [ ] On a read-only connection the three lists are complete, the buttons that change an index are disabled with
  *The connection is read-only*, and no **Turn on…** is shown.
- [ ] Nothing is read again until **Refresh** or an action of the page that ran.

### `advisor.read-indexes` — The indexes of a scope with their usage

The collections of the scope, each with its indexes, their sizes, how often each was used and since when.

- **Kind**: Read
- **Engine**: MongoDB
- **Function**: `src/features/advisor/read-indexes.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: read by `advisor.show`; the tool `index_advice` of the MCP server (`mcp.server`).
- **Uses**: used by `advisor.show`, `advisor.analyze`.
- **Ported from**: `src/advisor.ts` (`databases`, `collections`).

Sent:

1. For the scope of a connection only: `db.adminCommand({ listDatabases: 1, nameOnly: true, authorizedDatabases:
   true })`. The databases are those listed, without `admin`, `local` and `config`, sorted by name. When the command
   is refused, the one database is the default database of the connection.
2. For each database: `db.getSiblingDB("shop").runCommand({ listCollections: 1, filter: {}, authorizedCollections:
   true })`, with the filter `{ name: "orders" }` for the scope of a collection. Views and the collections whose
   name starts with `system.` are left out. A database is *profiled* when it has a `system.profile` collection (for
   the scope of a collection this is asked with the filter `{ name: "system.profile" }`).
3. For each collection, eight collections at a time:
   - `db.getSiblingDB("shop").orders.getIndexes()`;
   - `db.getSiblingDB("shop").orders.aggregate([{ $indexStats: {} }])`;
   - `db.getSiblingDB("shop").orders.aggregate([{ $collStats: { storageStats: {} } }])`, whose first document gives
     `storageStats.indexSizes`;
   - `db.getSiblingDB("shop").orders.estimatedDocumentCount()`.

   When `$indexStats`, `$collStats` or the count fails (a missing privilege), the indexes are returned without
   usage, without sizes, or the collection without its number of documents. When `getIndexes` fails, the collection
   is returned as failed, with the server's message.

Returned:

- the databases and which of them are profiled;
- the collections that have at least one index, each with its number of documents and, for each index: its name;
  its key as relaxed Extended JSON; `unique`, `sparse`, `hidden`; `expireAfterSeconds`; `partialFilterExpression`;
  the locale of its collation; its size in bytes; its uses (`accesses.ops`) and their start (`accesses.since`), from
  the first document `$indexStats` returns for it; and whether it is being built;
- the collections that failed, as `shop.orders` and the message.

Acceptance:

- [ ] For the connection `Local` with the databases `admin`, `config`, `crm`, `local` and `shop`, the collections of
  `crm` and `shop` are read, `crm` first.
- [ ] When `listDatabases` is refused and the connection string names `shop`, only `shop` is read.
- [ ] A view, `system.views` and `system.profile` are not in the result; a database with `system.profile` is marked
  as profiled.
- [ ] For the scope `shop.orders`, `listCollections` is sent with the filter `{ name: "orders" }` and one collection
  is returned.
- [ ] Without the privilege for `$indexStats` the indexes have no uses and no start, and the read does not fail.
- [ ] An index reported with `accesses: { ops: NumberLong(0), since: ISODate("2026-11-06T09:00:00Z") }` is returned
  with 0 uses since that time.
- [ ] A collection whose `getIndexes` fails is in the list of failed collections and the others are returned.

### `advisor.read-slow-operations` — The slow operations of a scope

The slow operations the server still remembers on the collections of the scope: from the profiler of each database
that has one, from the server log for the others.

- **Kind**: Read
- **Engine**: MongoDB
- **Function**: `src/features/advisor/read-slow-operations.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: read by `advisor.show`, after `advisor.read-indexes`; the tool `index_advice` of the MCP server
  (`mcp.server`).
- **Uses**: `advisor.read-indexes`, for the databases, the profiled ones and the collections; the reading of a
  profiler document and of a "Slow query" log line, which is the one of the Slow queries section of the Monitor
  page (`monitor.show`). Used by `advisor.show`, `advisor.analyze`.
- **Ported from**: `src/advisor.ts` (`slowOps`); `src/shared/profile.ts` (`fromProfileDoc`, `fromLogLine`,
  `isNoise`).

Sent:

1. For each database: `db.getSiblingDB("shop").runCommand({ profile: -1 })`, which changes nothing and returns the
   level of the profiler (`was`) and the threshold (`slowms`). The threshold shown by the page is the first one
   returned.
2. For each profiled database: `db.getSiblingDB("shop").system.profile.find({}).sort({ ts: -1 }).limit(5000)`: the
   5,000 most recent operations.
3. Once: `db.adminCommand({ getLog: "global" })`: the last lines of the server log, 1,024 at most, of which the
   "Slow query" lines are read.

Returned:

- the operations, each with its time, its namespace, its kind, its milliseconds, the documents examined and
  returned, its plan, whether it sorted in memory, whether it is a `getMore`, and its query (filter, sort,
  projection, or pipeline);
- per database: the profiler's level, the number of operations it gave, or the message of the error;
- the number of operations from the log, or the message of the error;
- the threshold, and the time of the oldest operation returned.

Rules:

1. An operation is kept only when its namespace is a collection returned by `advisor.read-indexes`.
2. Left out: the operations on a `system.profile` collection and on the `local` and `config` databases, and those
   whose kind is `profile`, `getLog`, `hello`, `isMaster`, `ismaster`, `ping`, `currentOp`, `serverStatus`,
   `dbStats`, `collStats`, `listDatabases`, `buildInfo`, `getParameter`, `endSessions`, `saslStart`, `saslContinue`
   or `killCursors`.
3. A log line is left out when its database gave at least one operation from its profiler: the profiler already has
   it.
4. An error of one profiler or of the log is kept in the result and does not fail the read.

Acceptance:

- [ ] With `shop` profiled and `crm` not, the profiler of `shop` is asked for its 5,000 most recent documents and
  `crm.system.profile` is not read.
- [ ] A log line on `shop.orders` is left out when the profiler of `shop` gave operations, and kept when it gave
  none; a log line on `crm.users` is kept.
- [ ] For the scope `shop.orders`, an operation on `shop.customers` is not returned.
- [ ] A `serverStatus`, an operation on `shop.system.profile` and one on `local.oplog.rs` are not returned.
- [ ] With the profiler of `shop` at level 0 and an empty `system.profile`, the result says level 0 and 0 operations
  for `shop`.
- [ ] When `getLog` is refused, the profiler's operations are returned with the log's error beside them.
- [ ] The oldest of operations of 09:00, 11:30 and 12:00 gives 09:00 as the time the page shows as *since*.

### `advisor.analyze` — The advice for a scope

Puts the three kinds of advice together, in the order the page and the MCP tool give them.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/advisor/analyze.ts › advice(collections, operations, now)`
- **Entry points**: computed by `advisor.show` after its reads; the tool `index_advice` of the MCP server
  (`mcp.server`) returns the same advice for a connection, a database or a collection.
- **Uses**: `advisor.indexes-to-create`, `advisor.redundant-indexes`, `advisor.unused-indexes`.
- **Ported from**: `src/shared/advisor.ts` (`analyze`).

Inputs: the collections of `advisor.read-indexes`, the operations of `advisor.read-slow-operations`, and the current
time. Output: the list of advices and the number of unused indexes too recent to tell.

Rules:

1. The advices are, in this order: the indexes to create, the one whose queries took the most time in total first;
   the redundant indexes, the largest first; the unused and the hidden indexes together, the largest first. An index
   whose size is not known counts as 0 bytes.
2. An index is in one list at most: a redundant index is not also listed as unused or hidden.
3. Each advice has an identifier that stays the same from one analysis to the next:
   `create:shop.orders:{ customerId: 1, createdAt: -1 }`, `redundant:shop.orders:status_1`,
   `unused:shop.orders:status_1`, `hidden:shop.orders:status_1`.
4. The number of suggestions of the summary is the number of advices.

Worked example: `shop.orders` has `_id_`, `status_1` (2 MB, 0 uses for 12 days), `status_1_createdAt_-1` (5 MB,
used), `note_1` (9 MB, 0 uses for 30 days) and `old_1` (1 MB, hidden); the slow operations give one index to create.
The advices are: the index to create; `status_1` as redundant; then `note_1` (unused, 9 MB) and `old_1` (hidden, 1
MB). `status_1` is not listed as unused. The summary says `4 suggestions`.

Acceptance:

- [ ] The example above gives those four advices in that order.
- [ ] Two indexes to create whose queries took 4,200 ms and 9,000 ms in total are listed with the one of 9,000 ms
  first.
- [ ] The same collections and operations analyzed twice give the same identifiers.
- [ ] With no collection and no operation the result is no advice and 0 indexes too recent.

### `advisor.indexes-to-create` — The indexes the slow operations need

From the slow operations, the indexes that would serve them and that no existing index already provides, one advice
per index.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/advisor/indexes-to-create.ts › indexesToCreate(collections, operations)`
- **Uses**: `advisor.prefix`; the grouping of slow operations by query shape of the Slow queries section of the
  Monitor page (`monitor.show`) and the index the Explain section suggests for a filter and a sort
  (`explain.show`). Used by `advisor.analyze`.
- **Ported from**: `src/shared/advisor.ts` (`analyze`, `served`); `src/shared/profile.ts` (`groupOps`,
  `indexableQuery`); `src/shared/explain.ts` (the suggested index).

Rules:

1. The operations are grouped by namespace, kind and query shape, as the Monitor's Slow queries section groups them;
   a `getMore` is counted with the query that opened its cursor.
2. A group asks for an index when one of its operations did a collection scan, or one sorted in memory, or its
   documents examined are at least 10 times its documents returned (returned counted as 1 when it is 0).
3. The index is the one the Explain section suggests for the filter and the sort of the group's slowest operation:
   the fields compared for equality, ascending; then the fields of the sort with their directions; then the fields
   compared by range, ascending. For an `aggregate`, the filter is a leading `$match` and the sort a `$sort` right
   after it, or a leading `$sort` alone. A group whose query gives no field has no advice.
4. A group is dropped when an index of the collection already serves it: an index that is not hidden, not partial,
   not sparse and has no collation, and that starts with the suggested keys (`advisor.prefix`). Such a group was
   recorded before the index existed, or the planner chose otherwise.
5. Groups of one collection that ask for the same keys make one advice.
6. Taken from the longest keys to the shortest, an advice whose keys are the start of an advice already kept
   (`advisor.prefix`) is merged into it: one index serves both.
7. Per query of an advice: its operations are the group's operations without the `getMore` batches (all of them when
   the group has nothing else); its total time is that of all of them, batches included; its average is the total
   divided by its operations. The queries are listed by total time, the largest first.
8. Per advice: the operations and the total time are the sums over its queries.

Worked examples, on `shop.orders` with the indexes `_id_` and `status_1 { status: 1 }`:

| Slow operations | Advice |
| --- | --- |
| 7 `find` with the filter `{ customerId: 42 }` and the sort `{ createdAt: -1 }`, collection scans | `{ customerId: 1, createdAt: -1 }`, 7 operations |
| a `find` with the filter `{ status: "paid", total: { $gt: 100 } }` and the sort `{ createdAt: -1 }`, sorted in memory | `{ status: 1, createdAt: -1, total: 1 }` |
| a `find` with the filter `{ status: "paid" }`, 50,000 examined, 20 returned, plan `IXSCAN { status: 1 }` | none: `status_1` starts with `{ status: 1 }` |
| the same, when `status_1` is hidden, or partial, or sparse, or has a collation | `{ status: 1 }` |
| `find` with `{ kind: "a" }` and `find` with `{ kind: "a", user: 7 }`, collection scans | one advice, `{ kind: 1, user: 1 }`, with both queries |
| `find` with `{ user: 7 }` and `find` with `{ kind: "a", user: 7 }`, collection scans | two advices, `{ kind: 1, user: 1 }` and `{ user: 1 }` |
| `find` sorted by `{ createdAt: -1 }` with no filter, sorted in memory, when the index `{ createdAt: 1 }` exists | none: the index read backwards serves it |
| an `aggregate` `[{ $match: { customerId: 7 } }, { $sort: { date: -1 } }]`, collection scan | `{ customerId: 1, date: -1 }` |
| an `aggregate` that starts with `$group`, collection scan | none |
| a `find` of 40 ms and its two `getMore` of 900 and 700 ms, collection scan | 1 operation, 1,640 ms in total, average 1,640 ms (`1 time · avg 1.6 s`) |
| a `find` with the plan `IXSCAN`, 80 examined and 20 returned | none: 4 examined per returned |

Acceptance:

- [ ] The examples above give the advices shown.
- [ ] Two shapes that ask for `{ kind: 1 }` and `{ kind: 1, user: 1 }` on two different collections give two
  advices.
- [ ] An advice merged from two shapes of 3 and 9 operations and 1,200 and 3,000 ms says 12 operations and 4,200 ms,
  and lists the shape of 3,000 ms first.
- [ ] An operation on a collection that is not in the scope gives no advice.
- [ ] 100 documents examined and 0 returned ask for an index; 90 examined and 10 returned do not.

### `advisor.prefix` — Whether an index starts with the keys of another

The one rule behind "already served" and "redundant": an index whose keys begin with other keys can do everything an
index on those keys does.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/advisor/prefix.ts › startsWith(key, prefix)`
- **Uses**: used by `advisor.indexes-to-create`, `advisor.redundant-indexes`.
- **Ported from**: `src/shared/advisor.ts` (`startsWith`).

Inputs: the key of an index and the keys looked for, each as fields in order with `1`, `-1`, or a kind (`"text"`,
`"2dsphere"`, `"hashed"`). Output: yes or no.

Rules:

1. No when the keys looked for are empty or longer than the key.
2. The fields must be the same, in the same order, from the first one.
3. Yes when each of them has the same direction or the same kind. Any negative number is descending, any other
   number ascending.
4. Yes also when every one of them is a number on both sides and each direction is the opposite: an index is read
   both ways.
5. No otherwise: some reversed and some not, or a kind against a direction or another kind.

Worked examples (key, keys looked for → result):

| Key | Keys looked for | Result |
| --- | --- | --- |
| `{ a: 1, b: 1 }` | `{ a: 1 }` | yes |
| `{ a: 1, b: -1, c: 1 }` | `{ a: 1, b: -1 }` | yes |
| `{ a: -1, b: 1, c: 1 }` | `{ a: 1, b: -1 }` | yes, reversed |
| `{ a: 1, b: 1, c: 1 }` | `{ a: 1, b: -1 }` | no |
| `{ a: 1, b: 1 }` | `{ b: 1 }` | no |
| `{ a: 1 }` | `{ a: 1, b: 1 }` | no |
| `{ a: 1 }` | `{ a: 1 }` | yes |
| `{ a: -1 }` | `{ a: 1 }` | yes, reversed |
| `{ a: "hashed" }` | `{ a: 1 }` | no |
| `{ a: "hashed" }` | `{ a: "hashed" }` | yes |
| `{ loc: "2dsphere", at: -1 }` | `{ loc: "2dsphere" }` | yes |
| `{ a: 1 }` | `{}` | no |

Acceptance:

- [ ] The examples above give the results shown.
- [ ] The order of the fields always counts: `{ a: 1, b: 1 }` does not start with `{ b: 1, a: 1 }`.

### `advisor.redundant-indexes` — The indexes another index replaces

The indexes whose every query another index of the same collection can serve, so that they only cost writes and
memory.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/advisor/redundant-indexes.ts › redundantIndexes(collection)`
- **Uses**: `advisor.prefix`. Used by `advisor.analyze`, `advisor.unused-indexes`.
- **Ported from**: `src/shared/advisor.ts` (`redundantWith`, `analyze`).

Inputs: the indexes of one collection, in the order the server lists them. Output: the redundant indexes, each with
the index that replaces it.

Rules. An index is redundant with another index of the collection when all of these hold:

1. it is not `_id_`, not unique and not a TTL index: those have a job of their own;
2. neither index is hidden or being built;
3. both have the same partial filter, or none;
4. the other is not sparse, unless this one is sparse too;
5. both have the same collation locale, or none;
6. the other's key starts with this one's key (`advisor.prefix`).

The indexes are examined from the last listed to the first, and the index that replaces one must not itself have
been found redundant: of two indexes on the same keys, the one listed last is the redundant one, and the other is
kept. When several indexes could replace one, the first listed is named.

Worked examples (the indexes in the server's order → redundant):

| Indexes | Redundant |
| --- | --- |
| `status_1 { status: 1 }`, `status_1_createdAt_-1 { status: 1, createdAt: -1 }` | `status_1`, replaced by `status_1_createdAt_-1` |
| `a_1 { a: 1 }`, `a_-1 { a: -1 }` | `a_-1`, replaced by `a_1` |
| `a_1 { a: 1 }`, `a_1_b_1 { a: 1, b: 1 }`, `a_1_b_1_c_1 { a: 1, b: 1, c: 1 }` | `a_1_b_1` and `a_1`, both replaced by `a_1_b_1_c_1` |
| `email_1 { email: 1 }` unique, `email_1_name_1 { email: 1, name: 1 }` | none |
| `at_1 { at: 1 }` TTL, `at_1_kind_1 { at: 1, kind: 1 }` | none |
| `a_1 { a: 1 }`, `a_1_b_1 { a: 1, b: 1 }` hidden | none |
| `a_1 { a: 1 }`, `a_1_b_1 { a: 1, b: 1 }` partial `{ active: true }` | none |
| `a_1 { a: 1 }` partial `{ active: true }`, `a_1_b_1 { a: 1, b: 1 }` partial `{ active: true }` | `a_1` |
| `a_1 { a: 1 }`, `a_1_b_1 { a: 1, b: 1 }` sparse | none |
| `a_1 { a: 1 }` sparse, `a_1_b_1 { a: 1, b: 1 }` | `a_1` |
| `name_1 { name: 1 }` collation `fr`, `name_1_at_1 { name: 1, at: 1 }` | none |
| `a_hashed { a: "hashed" }`, `a_1_b_1 { a: 1, b: 1 }` | none |

Acceptance:

- [ ] The examples above give the results shown.
- [ ] An index is never redundant with itself, and `_id_` is never redundant.
- [ ] Two indexes with the same keys give one advice, for the one listed last.
- [ ] The advice of `status_1` names `status_1_createdAt_-1 { status: 1, createdAt: -1 }` as the index that serves
  the same queries.

### `advisor.unused-indexes` — The indexes no query uses

The indexes that were not used since their statistics started, when that is long enough ago to tell, and the hidden
ones.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/advisor/unused-indexes.ts › unusedIndexes(collection, redundant, now)`
- **Uses**: `advisor.redundant-indexes`. Used by `advisor.analyze`.
- **Ported from**: `src/shared/advisor.ts` (`analyze`, `unusedCandidate`, `observedLongEnough`,
  `UNUSED_AFTER_MS`).

Inputs: the indexes of one collection with their uses and the start of their statistics, the indexes found
redundant, and the current time. Output: the *unused* and the *hidden* advices, and the number of indexes too recent
to tell.

Rules, for each index in the server's order:

1. `_id_`, a redundant index and an index being built are skipped.
2. A hidden index is a *hidden* advice, whatever its uses.
3. An index is a candidate when its uses are known and 0, and it is neither unique nor a TTL index. An index whose
   uses are not known is never listed.
4. A candidate whose statistics started at least 24 hours before now is an *unused* advice. A candidate whose
   statistics started later, or whose start is not known, is counted as too recent and not listed: a new index, or a
   server restarted an hour ago, says nothing yet.

Worked examples, at 2026-11-18 12:00:

| Index | Result |
| --- | --- |
| `note_1`, 0 uses since 2026-11-06 12:00 | unused: *Not used by any query since 12 days ago* |
| `note_1`, 0 uses since 2026-11-17 12:00 | unused: exactly 24 hours |
| `note_1`, 0 uses since 2026-11-18 09:00 | too recent |
| `note_1`, 3 uses since 2026-10-01 | nothing |
| `email_1` unique, 0 uses since 2026-10-01 | nothing |
| `at_1` TTL, 0 uses since 2026-10-01 | nothing |
| `old_1` hidden, 40 uses since 2026-10-01 | hidden |
| `note_1`, uses not known | nothing |
| `status_1`, 0 uses since 2026-10-01, found redundant | nothing here: it is in the redundant list |
| `_id_`, 0 uses since 2026-10-01 | nothing |

Acceptance:

- [ ] The examples above give the results shown.
- [ ] Two candidates of 3 hours and 5 hours give no advice and the count 2, and the page says *2 more indexes
  weren’t used yet, but their statistics started less than a day ago: check again later.*
- [ ] Without the privilege for `$indexStats` no index is listed as unused, and hidden indexes still are.
- [ ] An index hidden from the page is listed as hidden at the next analysis, with **Unhide**.

### `advisor.turn-on-profiler` — Turn on the profiler of a database

Makes a database record its slow operations, so that the advisor has more than the last lines of the server log to
work on.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/advisor/turn-on-profiler.ts › plan(context, answers)`
- **Entry points**: **Turn on…**, or **Turn on for shop…**, under the sources of the Index advisor page (`@toolbar`).
- **Offered when**: the profiler of the database is off (level 0) and gave no operation, on a connection that is not
  read-only.
- **Reads**: `db.getSiblingDB("shop").runCommand({ profile: -1 })`, for the threshold (`slowms`); 100 when the
  server reports none.
- **Plan**: one step: `db.getSiblingDB("shop").runCommand({ profile: 1, slowms: 100 })`, with the threshold just
  read, so that the threshold of the server does not change.
- **Danger**: Confirm. **Turn on the profiler of shop?** says *Operations on shop slower than 100 ms will be recorded
  in shop.system.profile (a small capped collection), so the advisor can see which queries need an index. Profiling
  adds a little work to slow operations; it can be turned off from the Monitor page.* The button is **Turn on**.
- **Read-only**: Refused on a read-only connection (`/read-only`).
- **Undo**: Cannot be undone from the undo history: it changes a setting of the server, not documents. The Slow
  queries section of the Monitor page turns the profiler off again.
- **After**: *The profiler of shop records operations slower than 100 ms. Use the application for a while, then
  refresh.* (`runner.notify`); the page reads and analyzes again. A failure says *Profiler not changed: <the
  server's message>*.
- **Refuses**: a read-only connection (`/read-only`): *The connection Production is read-only: the profiler can't be
  changed.*
- **Commands**: `advisor.turn-on-profiler`
- **Uses**: `runner.confirm`, `runner.run`, `runner.notify`, `advisor.show`.
- **Ported from**: `src/advisor.ts` (`enableProfiler`); `src/webview/advisor.ts` (`renderSources`).

Acceptance:

- [ ] **Turn on…** for `shop` on a server whose threshold is 250 ms asks **Turn on the profiler of shop?** with
  *Operations on shop slower than 250 ms will be recorded in shop.system.profile …*, and **Turn on** sends
  `db.getSiblingDB("shop").runCommand({ profile: 1, slowms: 250 })`.
- [ ] After it ran, the notification says *The profiler of shop records operations slower than 250 ms. Use the
  application for a while, then refresh.* and the page no longer says that the profiler of `shop` is off.
- [ ] Cancelling the confirmation sends nothing but the read of `profile: -1`.
- [ ] On a read-only connection the button is not shown, and the command is refused with *The connection Production
  is read-only: the profiler can't be changed.* and the code `advisor.turn-on-profiler/read-only`.
- [ ] Through a mongos, which keeps no profiler, the server's error is shown as *Profiler not changed: …* and nothing
  else changes.
- [ ] The level and the threshold of the other databases' profilers are the same before and after.
