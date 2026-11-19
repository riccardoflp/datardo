# Monitor

The Monitor page of a MongoDB connection: the server operations in progress and killing one, the slow queries of the
profiler or of the server log grouped by query shape, the profiler and its threshold, the statistics of the server,
of its databases and of their collections, the replica set with its members, lag and oplog, and the sharded cluster
with its shards, chunks, balancer and recent events. The page has five sections, chosen in the section bar:
**Operations**, **Slow queries**, **Stats**, **Replication** and **Sharding**. Each section is a View with the Reads
behind it; what a section writes (a kill, a server setting, an index) is an Operation with its own card.

The Monitor page of a Redis connection is the Server page (`server.show`), not this one.

### `monitor.show` — The Monitor page

One page tab per MongoDB connection that shows what its server is doing, a section at a time, read again on demand or
by itself every few seconds.

- **Kind**: View
- **Engine**: MongoDB
- **Function**: `src/features/monitor/show.ts › view(state)`
- **Entry points**: **Monitor** under **Pages of** the connection in the tree island (`@tree`); Go to (**Monitor**,
  and **Monitor: Operations**, **Monitor: Slow queries**, **Monitor: Stats**, **Monitor: Replication**, **Monitor:
  Sharding**); the tool `open_monitor` of the MCP server, with a section (`mcp.tab-tools`).
- **Offered when**: the current connection is a MongoDB connection. Opening the page connects it when it is not
  connected.
- **Reads**: `db.adminCommand({ listDatabases: 1, nameOnly: true })` once, for the **Database** lists of the Slow
  queries section, sorted by name; if it fails the lists are empty and each section says what it could not read.
  Then the Reads of the section shown.
- **After**: the tab is titled **Monitor** in the group of its connection; a second request for the same connection
  makes the open tab active and, when a section was asked for, shows that section.
- **Commands**: `monitor.show`, `monitor.show:operations`, `monitor.show:slow-queries`, `monitor.show:stats`,
  `monitor.show:replication`, `monitor.show:sharding`.
- **Uses**: `monitor.operations`, `monitor.slow-queries`, `monitor.stats`, `monitor.replication`,
  `monitor.sharding`, `tab.open`, `nav.inspector`, `nav.status-line`, `connection.read-only`.
- **Ported from**: README, *Server monitor*; `src/monitor.ts` (`MonitorPanel`), `src/webview/monitor.ts` (`setTab`,
  `refresh`, `setAuto`). The sentences for a command the server does not allow are new in Datardo.

What the page shows, from the top:

1. The section bar: **Operations**, **Slow queries**, **Stats**, **Replication**, **Sharding**. The first time the
   page opens it shows **Operations**; later it shows the section it showed last.
2. The toolbar (`@toolbar`): **Auto** with **Off**, **2 s**, **5 s** and **15 s** (5 s to start with), and
   **Refresh**.
3. The section.

Refreshing:

| What | When it is read |
| --- | --- |
| Everything of the section | when the section is chosen, and with **Refresh** |
| Operations; slow queries; the replica set and the oplog entries; the server's statistics | also at every automatic refresh |
| The statistics of the databases and of the collections of the chosen database | only when the section is chosen and with **Refresh** |
| The sharded cluster and its recent events | at every automatic refresh, without the commands run once per collection (`monitor.read-sharding`), which keep their last values |

An automatic refresh happens only while the tab is the active tab and the window is visible. A reply that arrives
after a newer request for the same thing was sent is dropped. The section, **Auto**, the filters, the sort of each
table and the choices of each section are kept with the tab and restored with it (`tab.restore`).

States:

- **Loading**: the section keeps what it showed and the status line shows the read in progress.
- **Error**: a Read that fails puts the server's message in an error line at the top of the part it feeds; the other
  parts of the section and the other sections are not affected.
- **A command the server does not allow**: when the server's error has the code 13 (`Unauthorized`) the line is
  *<command> needs a role that allows it (clusterMonitor has it): <the server's message>*; with the code 8000
  (`AtlasError`, an Atlas tier that does not allow the command, such as *CMD_NOT_ALLOWED: getLog*), 115
  (`CommandNotSupported`) or 59 (`CommandNotFound`, a server too old) it is *This server does not allow <command>:
  <the server's message>*. The controls that need that command are disabled, with the sentence as their tooltip.
- **Read-only**: the status line shows **Read-only**; the controls that write (**Kill**, the profiler's **Apply**
  and **Clear**, **Create index…**, **Step down…**, the balancer's buttons) are disabled with *The connection
  <name> is read-only.* as tooltip.

Selecting a row of any table of the page shows it whole in the inspector island, as mongosh text with **Copy**
(`nav.inspector`); `Esc` clears the selection.

Acceptance:

- [ ] Opening **Monitor** on the connection Local opens one tab titled **Monitor** in Local's group; opening it again
  makes that tab active and opens no second one.
- [ ] `open_monitor` with the section `replication` opens the page on **Replication**, also when the tab is already
  open on another section.
- [ ] With **Auto** at **5 s** and the Operations section shown, `currentOp` is sent every 5 seconds while the tab is
  active, and not at all while another tab is active or the window is minimized.
- [ ] With **Auto** at **Off**, nothing is read until **Refresh** or a change of section.
- [ ] In the Stats section an automatic refresh sends `serverStatus` and neither `dbStats` nor `$collStats`;
  **Refresh** sends all three.
- [ ] A reply to a request older than the last one sent for the same part does not change what is shown.
- [ ] A server that answers `getLog` with the code 8000 shows *This server does not allow getLog: …* in the Slow
  queries section, and the Operations section still lists the operations.
- [ ] On a read-only connection every writing control of the page is disabled with *The connection Production is
  read-only.* and the status line shows **Read-only**.
- [ ] After a restart of Datardo the restored tab shows the section, **Auto** and the filters it had.

### `monitor.operations` — The Operations section

The server operations in progress, the longest first, with a filter, and **Kill** on each.

- **Kind**: View
- **Engine**: MongoDB
- **Function**: `src/features/monitor/operations.ts › view(state)`
- **Entry points**: **Operations** in the section bar of the Monitor page (`@section-bar`).
- **Reads**: `monitor.read-operations`, at every refresh.
- **Uses**: `monitor.read-operations`, `monitor.kill-operation`, `nav.inspector`.
- **Ported from**: README, *Server monitor › Operations*; `src/webview/monitor.ts › renderOps`.

What it shows:

1. A toolbar (`@toolbar`): a filter with the placeholder **Filter by namespace, type, client or command**;
   **Running ≥** a number of seconds (0 to start with, steps of 0.1); **Idle connections** (off); **System
   operations** (off); and the count, *3 of 12 operations · 14:02:11* (shown, read, and the time of the read).
2. The table, one row per operation: **Opid**, **Type** (with a lock mark and the tooltip *Waiting for a lock* when
   it waits for one), **Namespace**, **Running**, **Client** (the application name and the client's address, joined
   by ` · `; the user as tooltip), **Plan**, **Command** (on one line, at most 300 characters, then `…`).

Rules:

- A row is shown when it is not a system operation or **System operations** is on, it has run for at least
  **Running ≥** seconds, and the filter's text is found, whatever the case, in its namespace, type, client,
  application name, description, command, user or opid.
- **Idle connections** reads again with `$all: true`; **System operations** and the filter only change what is shown.
- **Running** is *idle* for an operation that is not active; otherwise the time as `850 ms`, `12.4 s`, `3m 20s` or
  `2h 5m`. It takes the theme's warning color from 5 seconds and its danger color from 30 seconds.
- A **Plan** that starts with `COLLSCAN` is highlighted.
- Selecting a row shows the whole `currentOp` document in the inspector island, with **Kill…** there too. A row
  whose operation has ended at the next read leaves the selection.
- **Empty**: *No operations running.* when nothing was read; *No operation matches the filters.* when the filters
  hide them all.
- **Read-only**: no **Kill** on the rows.

Acceptance:

- [ ] An active `find` on `shop.orders` running for 6.2 seconds shows **Running** *6.2 s* in the warning color; one
  running for 31 seconds shows *31.0 s* in the danger color.
- [ ] With **Running ≥** 5, an operation running for 4.9 seconds is hidden and the count says *0 of 1 operation*.
- [ ] Typing `orders` in the filter keeps the operations whose namespace or command contains `orders`, whatever the
  case.
- [ ] An operation without a client's address is hidden until **System operations** is on.
- [ ] Turning **Idle connections** on sends `currentOp` with `$all: true` and lists the idle connections as *idle*.
- [ ] A command longer than 300 characters ends with `…` in the table and is whole in the inspector island.
- [ ] With nothing running the section says *No operations running.*
- [ ] On a read-only connection the rows have no **Kill**.

### `monitor.read-operations` — Read the operations in progress

What `currentOp` reports, as rows of the Operations section.

- **Kind**: Read
- **Engine**: MongoDB
- **Function**: `src/features/monitor/read-operations.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: the Operations section; the tool `current_operations` of the MCP server.
- **Reads**: `db.adminCommand({ currentOp: 1, $all: false })`, with `$all: true` when idle connections are asked
  for.
- **Uses**: `query.format`.
- **Ported from**: `src/monitor.ts › loadOps`, `toOp`, `summarize`.

Rules of `parse`:

1. The `currentOp` command that produced the list is left out.
2. Per operation: the opid (a number; on a sharded cluster the text the mongos gives, such as `shard01:4721`); the
   type (`op`, else `type`); the namespace; the time running in microseconds (`microsecs_running`, else
   `secs_running` × 1,000,000); whether it is active; the client (`client`, else `client_s`); the application name;
   the description; the users as `name@database` joined by `, `; the plan (`planSummary`); whether it waits for a
   lock; and the command on one line.
3. An operation without a client's address is a system operation.
4. The command on one line is the command (`command`, else `query`) in mongosh syntax without the fields that are
   not the query (`lsid`, `$clusterTime`, `$db`, `$readPreference`, `txnNumber`, `autocommit`, `startTransaction`,
   `readConcern`, `writeConcern`, `apiVersion`, `$audit`, `$client`, `mayBypassWriteBlocking`), cut at 300
   characters with `…`; when there is no command, the operation's `msg`.
5. The order: active operations first, then the longest running first.

Acceptance:

- [ ] The reply's own `currentOp` operation is not in the result.
- [ ] `{ find: "orders", filter: { status: "paid" }, lsid: { … }, $db: "shop" }` becomes `{ find: "orders", filter:
  { status: "paid" } }`.
- [ ] An operation with `secs_running: 3` and no `microsecs_running` has 3,000,000 microseconds.
- [ ] Two active operations of 2 and 9 seconds and an idle one of 60 seconds come out as 9, 2, idle.
- [ ] An operation with `effectiveUsers: [{ user: "app", db: "admin" }]` has the user `app@admin`.
- [ ] A server that refuses `currentOp` gives the Operations section its error line and no rows.

### `monitor.kill-operation` — Kill a server operation

Stops one operation in progress: its client receives an error.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/monitor/kill-operation.ts › plan(context, answers)`
- **Entry points**: **Kill…** in the context menu of a row of the Operations section and on its `…` button
  (`@row-menu`); **Kill…** in the inspector island when a server operation is selected (`@inspector`).
- **Offered when**: the operation has an opid and the connection is not read-only. While the kill of an operation
  runs, its **Kill…** is disabled.
- **Plan**: one step, `db.adminCommand({ killOp: 1, op: 4721 })`, with the opid as `currentOp` gave it (a number,
  or the text of a mongos: `db.adminCommand({ killOp: 1, op: "shard01:4721" })`). The title is **Kill operation
  4721?**
- **Danger**: Confirm: **Kill operation 4721?**, under it the operation as *find shop.orders — running 12.4 s* and
  its command on one line, then *The operation is interrupted and its client receives an error. Writes already done
  are not undone.* The button is **Kill**.
- **Read-only**: Refused on a read-only connection (`/read-only`).
- **Undo**: Cannot be undone: a killed operation cannot be started again, and what it wrote stays written; the
  confirmation says so.
- **After**: notifies *Killed operation 4721.* and reads the operations again (`monitor.read-operations`). An error
  of the server is shown in the section's error line.
- **Refuses**: *The connection Production is read-only.* (`/read-only`).
- **Uses**: `runner.confirm`, `runner.run`, `runner.notify`, `monitor.read-operations`.
- **Ported from**: `src/monitor.ts › killOp`; `src/webview/monitor.ts › renderOps`.

It is not offered to an AI assistant: the MCP server has no tool that kills an operation.

Acceptance:

- [ ] **Kill…** on the operation 4721, a `find` on `shop.orders` running for 12.4 seconds, shows **Kill operation
  4721?** with *find shop.orders — running 12.4 s*, the step `db.adminCommand({ killOp: 1, op: 4721 })` and the
  button **Kill**.
- [ ] After **Kill** the server receives exactly that command, the page says *Killed operation 4721.* and the
  operations are read again.
- [ ] Closing the confirmation sends nothing.
- [ ] Through a mongos, the opid `shard01:4721` is sent as text, not as a number.
- [ ] On a read-only connection nothing is sent and the refusal is *The connection Production is read-only.* with
  the code `monitor.kill-operation/read-only`.
- [ ] The Log has the line `[monitor.kill-operation] db.adminCommand({ killOp: 1, op: 4721 })`.
- [ ] When the server answers that the operation is not found, its message is in the section's error line and the
  list is read again.

### `monitor.slow-queries` — The Slow queries section

The slow operations a server recorded, from the profiler of one database or from the server log, as one row per
query shape or one row per operation.

- **Kind**: View
- **Engine**: MongoDB
- **Function**: `src/features/monitor/slow-queries.ts › view(state)`
- **Entry points**: **Slow queries** in the section bar of the Monitor page (`@section-bar`).
- **Reads**: `monitor.read-slow-queries`, at every refresh and when **Source**, **Database** or **Since** changes.
- **Uses**: `monitor.read-slow-queries`, `monitor.query-shape`, `monitor.group-slow-queries`,
  `monitor.set-profiler`, `monitor.set-log-threshold`, `monitor.clear-profiler`,
  `monitor.create-suggested-index`, `monitor.open-slow-query`, `nav.inspector`, `query.format`.
- **Ported from**: README, *Server monitor › Slow queries*; `src/webview/monitor.ts › renderProfile`,
  `renderGroups`, `renderOperations`, `profileDetail`. The sentences for a mongos and for a server older than 4.4
  are new in Datardo.

What it shows:

1. A toolbar (`@toolbar`): **Source** with **Profiler** and **Server log**; **Database** (for the profiler, the
   first database that is not `admin`, `local` or `config`; for the server log, **All databases** first); **Since**
   with **15 minutes**, **1 hour** (to start with), **24 hours** and **All**; **By query** and **All**; and a filter
   with the placeholder **Filter by namespace, operation, plan or query**.
2. A second row: on the left what is recorded and found, such as *Recording operations slower than 100 ms · 42
   operations · 7 queries · the latest 1,000*; on the right the controls of `monitor.set-profiler` and
   `monitor.clear-profiler` (source **Profiler**) or of `monitor.set-log-threshold` (source **Server log**).
3. The table.

The line of what is recorded starts with *Profiler off*, *Recording operations slower than 100 ms* or *Recording all
operations* for the profiler, and *The server logs the operations slower than 100 ms* for the server log. It ends
with *· the latest 1,000* when the profiler has more, and with *· older lines are no longer in the log* when the log
has dropped lines.

**By query** (to start with) shows one row per group of `monitor.group-slow-queries`: **Count** (the `getMore`
batches as tooltip), **Total ms**, **Avg ms**, **Max ms**, **Examined / returned**, **Op** (with a flag when an
index could help), **Namespace**, **Query** (the query shape), **Plan**, **Last**. The rows start sorted by **Total
ms**, the largest first; a click on **Count**, **Total ms**, **Avg ms**, **Max ms**, **Examined / returned** or
**Last** sorts by it, a second click reverses.

**All** shows one row per operation, the most recent first: **Time**, **Op** (with *(getMore)*), **Namespace**,
**Ms**, **Docs examined**, **Keys examined**, **Returned**, **Plan**, **Command**.

Colors: a time of 100 ms or more takes the warning color, of 1,000 ms or more the danger color; **Examined /
returned** takes the warning color when 100 or more documents are examined per document returned; a plan with
`COLLSCAN` is highlighted.

Selecting a row shows in the inspector island:

- when the group has a suggestion, why and which index, with **Create index…** (`monitor.create-suggested-index`):
  *The plan scans the whole collection (COLLSCAN).*, *The results are sorted in memory.* or *1,250 documents are
  examined per document returned.*, followed by *An index on { status: 1, createdAt: -1 } (equality fields, then
  sort, then range) could serve this query.*;
- **Open in collection** and **Explain** (`monitor.open-slow-query`), when the operation is a `find`, `aggregate`,
  `count`, `distinct`, `findAndModify`, `update` or `delete` on a collection;
- **Copy query**, which copies the query's parts in mongosh syntax;
- for a group, **Show operations**, which switches to **All** with the group's shape as the filter, and the line
  *example: the slowest, 1,840 ms at 17/11/2026, 14:02:11 · 3 getMore batches · apps: checkout*;
- the query, and under **Profiler document** or **Log entry** the whole record.

States:

- **Empty**: *No operation matches the filter.* when the filter hides them all; for the server log, *No operations
  slower than 100 ms in the server log in the last hour. Lower the threshold to log more of them.*; for the profiler
  when it is off, *The profiler of this database is off: choose "slow operations" and Apply to record the
  operations slower than the threshold, or look at the server log.*; otherwise *No operations recorded in the last
  hour.* **Since** gives *in the last 15 minutes*, *in the last hour*, *in the last 24 hours*, or nothing for
  **All**.
- **Through a mongos**: **Source** offers **Server log** only, with the note *A mongos keeps no profiler: connect to
  a shard to use it.*
- **A server older than 4.4**: with **Server log**, *The server log lists slow queries in a form Datardo reads from
  MongoDB 4.4: use the profiler.*
- **Read-only**: the profiler's and the threshold's controls and **Create index…** are disabled.

Acceptance:

- [ ] With the profiler of `shop` at level 1 and 100 ms, the line reads *Recording operations slower than 100 ms · …*
  and **Since** starts at **1 hour**.
- [ ] 42 operations of 7 shapes show 7 rows under **By query** and 42 under **All**, and the line says *42
  operations · 7 queries* (without *· 7 queries* under **All**).
- [ ] A click on **Avg ms** sorts the groups by average, the largest first; a second click the smallest first.
- [ ] **Show operations** on the group `{ status: ? }` switches to **All** with `{ status: ? }` in the filter.
- [ ] A group with 12,500 documents examined and 10 returned shows *12,500 / 10* in the warning color, with the
  tooltip *1,250 documents examined per document returned*.
- [ ] With the profiler off and nothing recorded the section says *The profiler of this database is off: …*
- [ ] Through a mongos, **Source** has **Server log** only and the note *A mongos keeps no profiler: connect to a
  shard to use it.*
- [ ] **Copy query** on a `find` with a filter and a sort copies `{ filter: { … }, sort: { … } }` in mongosh
  syntax; on an `aggregate` it copies the pipeline.
- [ ] An `insert` has neither **Open in collection** nor **Explain**.

### `monitor.read-slow-queries` — Read the slow operations

The slow operations of the profiler of a database, or of the "Slow query" lines of the server log.

- **Kind**: Read
- **Engine**: MongoDB
- **Function**: `src/features/monitor/read-slow-queries.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: the Slow queries section; the Index advisor page (`advisor.show`); the tool `slow_queries` of
  the MCP server.
- **Reads**: with the source, the database and the minutes of **Since** (0 for all):
  1. `db.getSiblingDB("shop").runCommand({ profile: -1 })` (on `admin` when no database is chosen): the profiler's
     level (`was`) and the threshold (`slowms`). The threshold is the server's; the level is the database's.
  2. Profiler: `db.getSiblingDB("shop").system.profile.find({ ts: { $gte: ISODate("…") } }).sort({ ts: -1
     }).limit(1001)`, with `{}` as the filter for **All**. The 1,001st document only says that there are more: at
     most 1,000 are kept.
  3. Server log: `db.adminCommand({ getLog: "global" })`: the server's recent log, 1,024 lines at most. There are
     older lines when `totalLinesWritten` is greater than the number of lines returned.
- **Uses**: `monitor.query-shape`, `query.format`.
- **Ported from**: `src/monitor.ts › loadProfile`; `src/shared/profile.ts › fromProfileDoc`, `fromLogLine`,
  `readCommand`, `isNoise`.

Rules of `parse`:

1. A profiler document gives: the time (`ts`), the namespace, the milliseconds (`millis`), `docsExamined`,
   `keysExamined`, `nreturned`, the plan (`planSummary`), an in-memory sort (`hasSortStage`), the application, the
   client, the users (`allUsers`, as `name@database`), and the command (`command`, else `query`).
2. A log line counts when it is JSON, its `msg` is `Slow query` and it has `attr`. It gives: the time (`t`), the
   namespace (`attr.ns`), the milliseconds (`durationMillis`), `docsExamined`, `keysExamined`, `nreturned`, the plan,
   an in-memory sort, the application, the client (`remote`) and the command. The line of a batch of updates or
   deletes (a namespace ending in `.$cmd` whose command has `update` or `delete`) is left out: each statement has a
   line of its own. Log lines are narrowed to the chosen database and to **Since**, and listed the most recent first.
3. The kind of the operation and its query: a statement of an update (`op` or `type` `update`) is `update` with the
   filter `q` and the update `u`; of a delete (`remove`), `delete` with the filter `q`. Otherwise the first field
   of the command that is not one of the fields left out decides: `find` (filter, sort, projection), `aggregate`
   (pipeline), `count` and `distinct` (filter from `query`), `findAndModify` (filter from `query`, sort, update),
   `insert`; anything else is its own name, with no query.
4. A `getMore` takes the kind, the query and the shape of the command that opened its cursor
   (`originatingCommand`) and is marked as a `getMore`.
5. Fields left out when the command is read: those of `monitor.read-operations`, and `apiStrict`,
   `apiDeprecationErrors`, `cursor`, `batchSize`, `comment`, `maxTimeMS`, `allowDiskUse`, `ordered`,
   `bypassDocumentValidation`, `shardVersion`, `databaseVersion`.
6. Left out of the result: operations on a `system.profile` collection, on the `local` and `config` databases, and
   those whose kind is `profile`, `getLog`, `hello`, `isMaster`, `ismaster`, `ping`, `currentOp`, `serverStatus`,
   `dbStats`, `collStats`, `listDatabases`, `buildInfo`, `getParameter`, `endSessions`, `saslStart`, `saslContinue`
   or `killCursors`: the profiler's own, the monitor's and the drivers'.

Acceptance:

- [ ] With **Since** at **1 hour** at 14:00, the profiler is asked for `{ ts: { $gte: ISODate("…T13:00:00Z") } }`,
  sorted by `ts` descending, with the limit 1,001.
- [ ] With 1,500 documents in `system.profile`, 1,000 operations are returned and the result says there are more.
- [ ] The log line `{"t":{"$date":"2026-11-17T13:02:11.000Z"},"msg":"Slow query","attr":{"ns":"shop.orders",
  "command":{"find":"orders","filter":{"status":"paid"}},"planSummary":"COLLSCAN","durationMillis":1840}}` becomes a
  `find` on `shop.orders` of 1,840 ms with the plan `COLLSCAN` and the shape `{ status: ? }`.
- [ ] A log line that is not JSON, or whose `msg` is not `Slow query`, gives nothing.
- [ ] A log line on `shop.$cmd` with `{ update: "orders", updates: [ … ] }` gives nothing; the lines of type
  `update` on `shop.orders` give one `update` each.
- [ ] A `getMore` whose `originatingCommand` is an `aggregate` is an `aggregate` marked as a `getMore`, with that
  pipeline's shape.
- [ ] An operation on `shop.system.profile`, one on `local.oplog.rs` and a `serverStatus` are not in the result.
- [ ] With the server log and the database `shop`, an operation on `crm.users` is not in the result.

### `monitor.query-shape` — The shape of a query

A query with its literal values replaced by `?`, on one line: what makes two runs of the same query with other
values one row of the Slow queries section.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/monitor/query-shape.ts › queryShape(kind, query)`
- **Uses**: `query.format`.
- **Ported from**: `src/shared/profile.ts › shapeOf`, `shapeOfQuery`.

Inputs: the kind of the operation and its query parts as relaxed Extended JSON (filter, sort, projection, pipeline,
update). Output: one line of text.

Rules:

1. A string, a number, a boolean, `null`, and a value with a BSON type of its own (an `ObjectId`, a date, a
   `Decimal128`, binary data) become `?`. A regular expression becomes `/?/`.
2. A string that starts with `$` stays, in double quotes: it is a field path, part of the shape.
3. A document keeps its field names in their order, each followed by the shape of its value: `{ a: ?, b: { $gt: ?
   } }`. A name that is not an identifier is in double quotes. An empty document is `{}`.
4. An array becomes the distinct shapes of its elements, in order: `[?]` when they are all values, whatever their
   number, so that `$in` lists of any length have one shape; `[]` when it is empty.
5. Inside a sort and a projection (the parts named `sort` and `projection`, and the stages `$sort` and `$project`)
   numbers and booleans stay: `{ createdAt: -1 }` is the shape.
6. An `aggregate` is the shape of its pipeline. Any other kind joins with ` · `: the filter's shape; `sort` and the
   sort's; `project` and the projection's; `update` and the update's. With no part at all, a `find`, a `count` and a
   `distinct` are `{}`; other kinds are empty.

Worked examples (kind, query → shape):

| Kind | Query | Shape |
| --- | --- | --- |
| `find` | filter `{ status: "paid", age: { $gt: 30 } }` | `{ status: ?, age: { $gt: ? } }` |
| `find` | filter `{ status: "new" }`, sort `{ createdAt: -1 }`, projection `{ name: 1, _id: 0 }` | `{ status: ? } · sort { createdAt: -1 } · project { name: 1, _id: 0 }` |
| `find` | filter `{ status: { $in: ["a", "b", "c"] } }` | `{ status: { $in: [?] } }` |
| `find` | filter `{ tags: { $in: [] } }` | `{ tags: { $in: [] } }` |
| `find` | filter `{ $or: [{ a: 1 }, { b: 2 }, { a: 5 }] }` | `{ $or: [{ a: ? }, { b: ? }] }` |
| `find` | filter `{ name: /^ma/i, _id: ObjectId("65f1c0de9a1b2c3d4e5f6a2c") }` | `{ name: /?/, _id: ? }` |
| `find` | filter `{ "address.city": "Rome", deletedAt: null }` | `{ "address.city": ?, deletedAt: ? }` |
| `find` | no filter | `{}` |
| `count` | filter `{}` | `{}` |
| `update` | filter `{ _id: 7 }`, update `{ $set: { status: "paid" } }` | `{ _id: ? } · update { $set: { status: ? } }` |
| `aggregate` | `[{ $match: { status: "paid" } }, { $sort: { total: -1 } }, { $group: { _id: "$customerId", n: { $sum: 1 } } }, { $limit: 10 }]` | `[{ $match: { status: ? } }, { $sort: { total: -1 } }, { $group: { _id: "$customerId", n: { $sum: ? } } }, { $limit: ? }]` |
| `aggregate` | `[{ $project: { name: 1, active: true } }]` | `[{ $project: { name: 1, active: true } }]` |
| `insert` | — | (empty) |

Acceptance:

- [ ] The examples above give the shapes shown.
- [ ] `{ status: "paid" }` and `{ status: "new" }` have the same shape; `{ status: "paid" }` and `{ state: "paid" }`
  do not.
- [ ] `{ a: 1, b: 2 }` and `{ b: 2, a: 1 }` have different shapes: the order of the fields counts.
- [ ] `$in` lists of 1 and of 500 values have the same shape.
- [ ] A sort by `{ createdAt: 1 }` and one by `{ createdAt: -1 }` have different shapes.

### `monitor.group-slow-queries` — Totals per query shape

Slow operations grouped by namespace, kind and shape, with their totals, their slowest run and whether an index
could help.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/monitor/group-slow-queries.ts › slowQueryGroups(operations)`
- **Uses**: `monitor.query-shape`; the index the Explain section suggests for a filter and a sort (`explain.show`).
- **Ported from**: `src/shared/profile.ts › groupOps`, `indexableQuery`.

Inputs: the operations of `monitor.read-slow-queries`, after the section's filter. Output: the groups, the one with
the largest total time first, then the one with more runs.

Rules:

1. Two operations are in one group when their namespace, kind and shape are equal. A `getMore` is counted with its
   query.
2. Per group: the number of runs, of which how many are `getMore` batches; the total, the maximum and the average
   of the milliseconds (total ÷ runs); the sums of the documents examined, the keys examined and the documents
   returned; the distinct plans and applications, in order of appearance; whether any plan has `COLLSCAN`; whether
   any run sorted in memory; the time of the last run.
3. The example of the group is its slowest run that is not a `getMore`; a `getMore` is the example only when the
   group has nothing else.
4. A group gets a suggestion when a plan has `COLLSCAN`, or a run sorted in memory, or the documents examined are
   at least 10 times the documents returned (returned counted as 1 when it is 0). The suggestion is the index that
   the Explain section suggests for the example's filter and sort: equality fields, then sort fields, then range
   fields. For an `aggregate` the filter is a leading `$match` and the sort a `$sort` right after it, or a leading
   `$sort` alone; any other pipeline has no suggestion. When nothing in the filter or the sort can use an index,
   there is no suggestion.

Worked examples:

- Three `find` on `shop.orders` with the shape `{ status: ? } · sort { createdAt: -1 }`, of 120, 300 and 90 ms,
  examining 5,000 documents each and returning 20, 20 and 10, with the plan `COLLSCAN` → one group: count 3, total
  510, average 170, maximum 300, examined 15,000, returned 50, example the run of 300 ms, suggestion `{ status: 1,
  createdAt: -1 }`.
- A `find` of 40 ms and its two `getMore` of 900 and 700 ms → one group: count 3, 2 `getMore` batches, total 1,640,
  example the `find` of 40 ms.
- An `aggregate` `[{ $match: { customerId: 7, total: { $gt: 100 } } }, { $sort: { date: -1 } }]` that sorted in
  memory → suggestion `{ customerId: 1, date: -1, total: 1 }`.
- An `aggregate` that starts with `$group` and scanned the collection → no suggestion.
- A `find` with the plan `IXSCAN { status: 1 }`, 80 documents examined and 20 returned → no suggestion (4 examined
  per returned).

Acceptance:

- [ ] The examples above give the groups and suggestions shown.
- [ ] Operations with the same shape on two collections are two groups.
- [ ] A group with 100 documents examined and 0 returned has a suggestion (100 per returned).
- [ ] Groups come out by total time, the largest first.

### `monitor.set-profiler` — Set the profiler of a database

Turns the profiler of one database on or off, and sets the time over which it records an operation.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/monitor/set-profiler.ts › plan(context, answers)`
- **Entry points**: in the Slow queries section with the source **Profiler** (`@toolbar`): **Profile** with **Off**,
  **Slow operations** and **All operations**, **slower than** a number of **ms**, and **Apply**.
- **Offered when**: a database is chosen, the connection is not read-only and it is not a mongos.
- **Asks**: nothing more: the level and the milliseconds are the controls' values, which start as the server
  reported them (100 ms when it reported nothing). The milliseconds are rounded to a whole number, 0 at least.
- **Plan**: one step: `db.getSiblingDB("shop").runCommand({ profile: 1, slowms: 100 })`, with `profile: 0` for
  **Off** and `profile: 2` for **All operations**. The title is **Set the profiler of shop**.
- **Danger**: None. It is a server setting: the profiler adds work to every operation of the database it records,
  and `slowms` is the threshold of the whole server, also for what it logs.
- **Read-only**: Refused on a read-only connection (`/read-only`).
- **Undo**: Cannot be undone from the undo history: it changes a server setting, not documents. Setting the former
  values puts it back.
- **After**: the section says *The profiler of shop is off.*, *The profiler of shop records operations slower than
  100 ms.* or *The profiler of shop records every operation.*, and reads the slow operations again. A failure says
  *Profiler not changed: <the server's message>*.
- **Refuses**: *The connection Production is read-only: the profiler can't be changed.* (`/read-only`); *A mongos
  keeps no profiler: connect to a shard to use it.* (`/unsupported`).
- **Uses**: `runner.run`, `runner.notify`, `monitor.read-slow-queries`.
- **Ported from**: `src/monitor.ts › setProfile`; `src/webview/monitor.ts` (`profileApply`).

Acceptance:

- [ ] With `shop`, **Slow operations** and 250, **Apply** sends `db.getSiblingDB("shop").runCommand({ profile: 1,
  slowms: 250 })` and the section says *The profiler of shop records operations slower than 250 ms.*
- [ ] **Off** sends `{ profile: 0, slowms: 250 }` and says *The profiler of shop is off.*
- [ ] **All operations** sends `profile: 2` and says *The profiler of shop records every operation.*
- [ ] `12.6` typed as the milliseconds is sent as `13`; `-5` as `0`.
- [ ] On a read-only connection nothing is sent, and the refusal is *The connection Production is read-only: the
  profiler can't be changed.* with the code `monitor.set-profiler/read-only`.
- [ ] A server that refuses the command leaves the controls as they were and says *Profiler not changed: …*
- [ ] The MCP server has no tool that changes the profiler.

### `monitor.set-log-threshold` — Set the threshold of slow operations

Changes the time over which the server writes an operation to its log as a slow query, without turning a profiler
on.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/monitor/set-log-threshold.ts › plan(context, answers)`
- **Entry points**: in the Slow queries section with the source **Server log** (`@toolbar`): **Log operations
  slower than** a number of **ms**, and **Apply**.
- **Offered when**: the connection is not read-only.
- **Asks**: nothing more: the milliseconds are the control's value, which starts as the server reported it (100 ms
  by default on a server). Rounded to a whole number, 0 at least.
- **Plan**: one step: `db.adminCommand({ profile: -1, slowms: 50 })`. The level `-1` leaves every profiler as it is.
  The title is **Log operations slower than 50 ms**.
- **Danger**: None. It is a server setting: a low threshold makes the server log more.
- **Read-only**: Refused on a read-only connection (`/read-only`).
- **Undo**: Cannot be undone from the undo history: it changes a server setting. Setting the former value puts it
  back.
- **After**: the section says *Operations slower than 50 ms are now logged.* and reads the slow operations again. A
  failure says *Profiler not changed: <the server's message>*.
- **Refuses**: *The connection Production is read-only: the profiler can't be changed.* (`/read-only`).
- **Uses**: `runner.run`, `runner.notify`, `monitor.read-slow-queries`.
- **Ported from**: `src/monitor.ts › setProfile` (level `-1`); `src/webview/monitor.ts` (`logApply`).

Acceptance:

- [ ] With 50, **Apply** sends `db.adminCommand({ profile: -1, slowms: 50 })` and the section says *Operations
  slower than 50 ms are now logged.*
- [ ] The profiler level of every database is the same before and after.
- [ ] After it, the line of the section reads *The server logs the operations slower than 50 ms · …*
- [ ] On a read-only connection nothing is sent and the refusal has the code
  `monitor.set-log-threshold/read-only`.

### `monitor.clear-profiler` — Clear the operations the profiler recorded

Empties `system.profile` of one database and leaves the profiler recording as before.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/monitor/clear-profiler.ts › plan(context, answers)`
- **Entry points**: **Clear** in the Slow queries section with the source **Profiler** (`@toolbar`).
- **Offered when**: a database is chosen, the connection is not read-only and it is not a mongos.
- **Reads**: `db.getSiblingDB("shop").runCommand({ profile: -1 })`, for the level and the threshold to set back;
  whether `system.profile` exists, from the list of the database's collections.
- **Plan**: with the profiler at level 1 and 100 ms:
  1. `db.getSiblingDB("shop").runCommand({ profile: 0 })`
  2. `db.getSiblingDB("shop").system.profile.drop()`
  3. `db.getSiblingDB("shop").runCommand({ profile: 1, slowms: 100 })`

  The server drops `system.profile` only while the profiler is off. Steps 1 and 3 are left out when the profiler is
  already off; step 2 when the collection does not exist. The title is **Clear the profiler of shop**.
- **Danger**: Confirm: **Clear the operations recorded by the profiler of shop?** with *The system.profile
  collection is emptied; the profiler keeps recording with the same settings.* The button is **Clear**.
- **Read-only**: Refused on a read-only connection (`/read-only`).
- **Undo**: Cannot be undone: the recorded operations are not kept anywhere else; the confirmation says so.
- **After**: the section says *Cleared the profiler of shop.* and reads the slow operations again. When step 2
  fails the profiler stays off: the error names the step, and the section then reads *Profiler off*.
- **Refuses**: *The connection Production is read-only.* (`/read-only`); *A mongos keeps no profiler: connect to a
  shard to use it.* (`/unsupported`); *The profiler of shop could not be read: nothing was cleared.* (`/not-read`).
- **Uses**: `runner.confirm`, `runner.run`, `runner.notify`, `monitor.read-slow-queries`.
- **Ported from**: `src/monitor.ts › clearProfile`.

Acceptance:

- [ ] With the profiler of `shop` at level 1 and 100 ms, the confirmation lists the three steps above, and after
  **Clear** `system.profile` is empty and `{ profile: -1 }` answers `was: 1, slowms: 100`.
- [ ] With the profiler off, the plan is the one step `db.getSiblingDB("shop").system.profile.drop()`.
- [ ] With the profiler at level 2 and no `system.profile` yet, the plan has steps 1 and 3 only, and step 3 is
  `{ profile: 2, slowms: 100 }`.
- [ ] Closing the confirmation sends nothing.
- [ ] On a read-only connection nothing is sent and the refusal is *The connection Production is read-only.*
- [ ] The confirmation says that it cannot be undone.

### `monitor.create-suggested-index` — Create the index a slow query suggests

Creates on the collection the index that would serve a slow query, after saying what building it costs.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/monitor/create-suggested-index.ts › plan(context, answers)`
- **Entry points**: **Create index…** in the inspector island, beside the suggestion of a selected group of the Slow
  queries section (`@inspector`).
- **Offered when**: the group has a suggestion (`monitor.group-slow-queries`) and the connection is not read-only.
- **Reads**: the indexes of the collection (`db.orders.getIndexes()`), to refuse when one has the same keys in the
  same order.
- **Plan**: one step: `db.getSiblingDB("shop").orders.createIndex({ status: 1, createdAt: -1 })`, with no options:
  the server names the index. The title is **Create the index { status: 1, createdAt: -1 } on shop.orders**.
- **Danger**: Confirm: **Create the index { status: 1, createdAt: -1 } on shop.orders?** with *Building an index
  reads the whole collection: on a large collection it takes time and loads the server. Every write then also
  updates the index.* The button is **Create index**.
- **Read-only**: Refused on a read-only connection (`/read-only`).
- **Undo**: Cannot be undone from the undo history: an index is not a document. Dropping the index in the Indexes
  section (`index.show`) removes it; the confirmation says so.
- **After**: the section says *Created the index status_1_createdAt_-1 on shop.orders.* and reads the slow
  operations again; the tree island and an open Indexes section of the collection are read again. A failure says
  *Index not created: <the server's message>*.
- **Refuses**: *The connection Production is read-only.* (`/read-only`); *shop.orders already has the index
  status_1_createdAt_-1 on { status: 1, createdAt: -1 }.* (`/exists`); a view (`/view`).
- **Uses**: `runner.confirm`, `runner.run`, `runner.notify`, `index.create`, `monitor.group-slow-queries`.
- **Ported from**: `src/monitor.ts › createIndex`; `src/webview/monitor.ts › profileDetail`.

Acceptance:

- [ ] On a group of `shop.orders` with the suggestion `{ status: 1, createdAt: -1 }`, **Create index…** shows the
  confirmation above with the step `db.getSiblingDB("shop").orders.createIndex({ status: 1, createdAt: -1 })` and
  the button **Create index**.
- [ ] After **Create index** the collection has an index with those keys in that order, and the section says
  *Created the index status_1_createdAt_-1 on shop.orders.*
- [ ] When the collection already has `{ status: 1, createdAt: -1 }` under the name `byStatus`, nothing is asked and
  the refusal is *shop.orders already has the index byStatus on { status: 1, createdAt: -1 }.*
- [ ] An index `{ createdAt: -1, status: 1 }` is not the same index: the creation is offered.
- [ ] On a read-only connection the button is disabled, and a request sent anyway is refused with
  `monitor.create-suggested-index/read-only`.
- [ ] Closing the confirmation creates nothing.

### `monitor.open-slow-query` — Open a slow query in its collection

Puts the filter, sort and projection of a slow operation, or its pipeline, in the collection tab, and optionally
explains it as the server runs it now.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/monitor/open-slow-query.ts › plan(context, answers)`
- **Entry points**: **Open in collection** and **Explain** in the inspector island, on a selected group or operation
  of the Slow queries section (`@inspector`).
- **Offered when**: the kind is `find`, `aggregate`, `count`, `distinct`, `findAndModify`, `update` or `delete`, and
  the namespace has a collection that does not start with `$cmd`.
- **Plan**: one app step: `open shop.orders with the filter { status: "paid" }`. For an `aggregate`, `open
  shop.orders with the pipeline`, each stage enabled, in the pipeline editor (`aggregate.show`). The projection is
  carried only for a `find`; the sort for a `find` and a `findAndModify`. **Explain** opens the same and shows the
  Explain section (`explain.show`).
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment: it opens a query, and an `update` or a `delete`
  opens as the filter that chose its documents.
- **Undo**: Cannot be undone: nothing is written; closing the tab is enough.
- **After**: the collection tab is active with the query run (`query.run`); for **Explain**, on the Explain section.
- **Refuses**: *This operation cannot be opened in its collection.* (`/unsupported`), for an operation it is not
  offered on.
- **Uses**: `tab.open`, `query.bar`, `query.format`, `query.run`, `aggregate.show`, `explain.show`.
- **Ported from**: `src/monitor.ts › openOperation`; `src/shared/profile.ts › canOpen`, `splitNs`.

A namespace is split at its first dot: `shop.orders.archive` is the collection `orders.archive` of `shop`.

Acceptance:

- [ ] **Open in collection** on a `find` of `shop.orders` with the filter `{ status: "paid" }`, the sort `{
  createdAt: -1 }` and the projection `{ total: 1 }` opens the collection tab of `shop.orders` with those three in
  the query bar, in mongosh syntax.
- [ ] On a `count` with the same filter, the projection is empty.
- [ ] On an `aggregate` it opens the pipeline editor with one enabled stage per stage of the pipeline.
- [ ] **Explain** opens the same query and shows the Explain section with the plan as it is now.
- [ ] On an `update` with `q: { _id: 7 }` it opens the filter `{ _id: 7 }` and writes nothing.
- [ ] An operation on `shop.$cmd.aggregate` has neither button.

### `monitor.stats` — The Stats section

The server at a glance, then the size of each database and, for a chosen one, of each collection.

- **Kind**: View
- **Engine**: MongoDB
- **Function**: `src/features/monitor/stats.ts › view(state)`
- **Entry points**: **Stats** in the section bar of the Monitor page (`@section-bar`).
- **Reads**: `monitor.read-server-status` at every refresh; `monitor.read-database-stats` when the section is chosen
  and with **Refresh**; `monitor.read-collection-stats` for the chosen database, then and when a database is chosen.
- **Uses**: `monitor.read-server-status`, `monitor.read-database-stats`, `monitor.read-collection-stats`,
  `monitor.rates`.
- **Ported from**: README, *Server monitor › Stats*; `src/webview/monitor.ts › renderServer`, `renderDatabases`,
  `renderCollections`, `sortableTable`. The line drawn in the tiles is new in Datardo.

What it shows:

1. The tiles, each with a label, a value and a smaller line:
   - **Server**: the version; the host.
   - **Uptime**: `3d 4h`, `5h 12m` or `7m 20s`.
   - **Connections**: the current ones; *1,204 available · 88,112 created*.
   - **Operations / s**: the total rate; *query 12 · insert 0.4 · update 3.1 · delete 0 · getmore 0.2 · command
     41*. Before the second read, **Operations** with the total since the start and *since start · rates after the
     next refresh*.
   - **Network / s**: *↓* and the bytes in per second; *↑* and the bytes out per second. Only from the second read.
   - **Memory**: the resident megabytes; *4,096 MB virtual*. Only when the server reports it.

   **Connections**, **Operations / s** and **Network / s** also draw their last values as a line
   (`monitor.rates`).
2. **Databases**: a table with **Database**, **Collections**, **Views**, **Documents**, **Data**, **Storage**,
   **Indexes**, **Index size**. A click on a header sorts by it (numbers the largest first, names from A), a second
   click reverses. A database whose statistics could not be read shows its name alone, with the server's message as
   the row's tooltip.
3. A click on a database selects it and shows **Collections of shop**: **Collection**, **Type**, **Documents**,
   **Avg size**, **Data**, **Storage**, **Indexes**, **Index size**, the largest data first until a header is
   clicked. A view has its name and type only.

Sizes are written with the units `B`, `KB`, `MB`, `GB` and `TB` of 1,024, with one decimal under 10 (`1.5 MB`, `12
MB`, `840 B`); counts with thousands separators.

States: each of the three parts has its own error line. **Empty**: a server without databases shows the table's
headers alone.

Acceptance:

- [ ] After the first read the tile is **Operations** with *since start · rates after the next refresh*; after the
  second it is **Operations / s**.
- [ ] A rate under 10 has one decimal (`3.1`); from 10 it is whole (`41`).
- [ ] 1,572,864 bytes are shown as `1.5 MB`, 12,582,912 as `12 MB`, 840 as `840 B`.
- [ ] A click on **Data** sorts the databases by data size, the largest first; a second click the smallest first.
- [ ] A click on the database `shop` shows **Collections of shop**, the collection with the most data first.
- [ ] A view of `shop` is listed with the type `view` and empty numbers.
- [ ] A database the user cannot read is listed by name with the server's message as tooltip, and the others have
  their numbers.
- [ ] `system.` collections are not listed.

### `monitor.read-server-status` — Read the server's status

Version, uptime, connections, operation counters, memory and network of the server the connection reaches.

- **Kind**: Read
- **Engine**: MongoDB
- **Function**: `src/features/monitor/read-server-status.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: the Stats section; the tool `server_status` of the MCP server.
- **Reads**: `db.adminCommand({ serverStatus: 1, repl: 0, metrics: 0, locks: 0 })`.
- **Ported from**: `src/monitor.ts › loadServer`.

`parse` keeps: `host`, `version`, `uptime` in seconds; the connections `current`, `available` and `totalCreated`;
the counters `insert`, `query`, `update`, `delete`, `getmore` and `command` of `opcounters`; `resident` and
`virtual` of `mem`, in megabytes, when the server reports `mem`; `bytesIn`, `bytesOut` and `numRequests` of
`network`, when it reports `network`; and the time of the read, from the context. A missing number is 0. Counters
that arrive as `Long` are numbers.

Acceptance:

- [ ] The command is sent with `repl: 0`, `metrics: 0` and `locks: 0`.
- [ ] A reply without `mem` gives no memory, and the Stats section shows no **Memory** tile.
- [ ] A reply whose `opcounters` has `query: NumberLong(1200)` gives the number 1,200.
- [ ] Through a mongos the reply is the mongos's own, and the section shows it as it is.

### `monitor.read-database-stats` — Read the statistics of the databases

The collections, views, documents and sizes of every database.

- **Kind**: Read
- **Engine**: MongoDB
- **Function**: `src/features/monitor/read-database-stats.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: the Stats section; the tool `database_stats` of the MCP server.
- **Reads**: `db.adminCommand({ listDatabases: 1, nameOnly: true })`, then for each database
  `db.getSiblingDB("shop").runCommand({ dbStats: 1 })`, 8 databases at a time.
- **Ported from**: `src/monitor.ts › loadDatabases`, `inBatches`.

`parse` keeps per database: `collections`, `views`, `objects` (the documents), `dataSize`, `storageSize`,
`indexes`, `indexSize`. A database whose `dbStats` fails keeps its name and the server's message, and does not fail
the others. A failure of `listDatabases` fails the Read.

Acceptance:

- [ ] With 20 databases, at most 8 `dbStats` are in flight at once.
- [ ] A database whose `dbStats` is refused is in the result with its name and the error; the other 19 have their
  numbers.
- [ ] A user who cannot list the databases gets the error line of the **Databases** part, with the server's
  message.

### `monitor.read-collection-stats` — Read the statistics of a database's collections

The documents and sizes of each collection of one database.

- **Kind**: Read
- **Engine**: MongoDB
- **Function**: `src/features/monitor/read-collection-stats.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: the Stats section, when a database is chosen.
- **Reads**: the collections of the database (`db.getSiblingDB("shop").getCollectionInfos()`), without those whose
  name starts with `system.`; then for each one that is not a view `db.getSiblingDB("shop").orders.aggregate([{
  $collStats: { storageStats: {} } }])`, 8 at a time.
- **Ported from**: `src/monitor.ts › loadCollections`, `collectionStats`.

`parse` keeps per collection, from `storageStats`: `count`, `size`, `avgObjSize`, `storageSize`, `nindexes`,
`totalIndexSize`, and whether it is capped; with its name and type (`collection`, `timeseries`, `view`). A view is
not asked and has no numbers. A collection whose `$collStats` fails keeps its name, its type and the server's
message. The result is sorted by `size`, the largest first, the collections without a size last.

Acceptance:

- [ ] A database with the collections `orders` (2 GB), `users` (10 MB) and the view `recent` gives `orders`,
  `users`, `recent`, the view without numbers and without a `$collStats`.
- [ ] `system.views` and `system.profile` are not in the result.
- [ ] Through a mongos, the numbers of a sharded collection are those of the first document `$collStats` returns
  (one shard's); the data of every shard is in the Sharding section.
- [ ] A collection whose `$collStats` is refused keeps its row, with the error as tooltip.

### `monitor.rates` — Rates between two reads, and their last values

Turns the counters of the server, which only grow, into operations and bytes per second, and keeps the last values
for the lines of the tiles.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/monitor/rates.ts › rates(previous, current, history)`
- **Ported from**: `src/webview/monitor.ts › renderServer` (the rates). The history and its lines are *New in
  Datardo*.

Inputs: the previous and the current result of `monitor.read-server-status`, each with the time of its read, and
the history so far. Output: the rates, and the history with the new point.

Rules:

1. With no previous read, or when no time passed between the two, there are no rates.
2. The rate of a counter is (current − previous) ÷ the seconds between the two reads, never under 0: a counter that
   went down (the server restarted) gives 0.
3. The total of **Operations / s** is the sum of the rates of `query`, `insert`, `update`, `delete`, `getmore` and
   `command`, written in that order.
4. A rate is written with one decimal under 10 and whole from 10.
5. The history keeps the last 60 points *(Datardo's choice)* of the connections, of the total operations per second
   and of the bytes in and out per second, while the page is open; it starts empty when the page opens and is not
   restored. Each tile draws its points as a line, from the smallest to the largest value of the points shown. A
   tile with fewer than 2 points draws no line.

Worked examples:

- `query` 1,000 at 14:00:00 and 1,060 at 14:00:05 → 12 per second, written `12`.
- `insert` 500 and 502 over 5 seconds → 0.4, written `0.4`.
- `command` 9,000 then 120 over 5 seconds (a restart) → 0.
- `bytesIn` 10,000,000 and 17,864,320 over 5 seconds → 1,572,864 bytes per second, written `↓ 1.5 MB`.
- 61 reads in a row → the history has the last 60 points.

Acceptance:

- [ ] The examples above give the values shown.
- [ ] With **Auto** at **5 s**, the line of **Operations / s** covers the last 5 minutes at most (60 points).
- [ ] Closing and opening the page starts the lines again from nothing.

### `monitor.replication` — The Replication section

The replica set the server belongs to: its members with their state and lag, how much time the oplog covers, and
the last replicated operations.

- **Kind**: View
- **Engine**: MongoDB
- **Function**: `src/features/monitor/replication.ts › view(state)`
- **Entry points**: **Replication** in the section bar of the Monitor page (`@section-bar`).
- **Reads**: `monitor.read-replication` and `monitor.read-oplog`, at every refresh.
- **Uses**: `monitor.read-replication`, `monitor.replication-lag`, `monitor.read-oplog`, `monitor.oplog-summary`,
  `monitor.step-down`, `nav.inspector`.
- **Ported from**: README, *Server monitor › Replication*; `src/webview/monitor.ts › renderRepl`, `renderMembers`,
  `renderOplog`.

What it shows on a replica set:

1. The tiles:
   - **Replica set**: its name; *term 12 · protocol v1*.
   - **Primary**: its host, or *none* in the danger color; *connected to db2.example.net:27017 (secondary)*.
   - **Members**: *3 / 3 healthy*, in the danger color when one is not; *1 primary · 2 secondary*.
   - **Replication lag**: the largest lag among the members that are not delayed on purpose, as `0 s`, `45 s` or
     `3m 20s`; the member that has it, or *every member is up to date*, and *delayed members left out* when there
     are some. Warning color from 10 seconds, danger color from 60.
   - **Oplog window**: the time between the first and the last entry of the oplog, which is how far a member can
     fall behind and still catch up; *1.2 GB of 4.0 GB · 1,204,331 entries · since 2026-11-12 08:14:02*.
   - **Elections**: *10 s timeout*; *heartbeat every 2 s · chaining allowed* (or *chaining not allowed*).
2. **Members**, with *as of 14:02:11* and **Step down…** (`monitor.step-down`), disabled with *There is no
   primary* when there is none. The table: **Member** (a star on the server Datardo is connected to), **State**
   (`PRIMARY`, `SECONDARY`, `ARBITER`, …; *(down)* after it when the member is not healthy), **Lag**, **Last
   applied**, **Heartbeat** (*4 s ago*), **Ping** (*2 ms*), **Sync source**, **Priority**, **Votes**, **Notes**,
   **Uptime**. **Notes** joins with ` · `: *hidden*, *delayed 1h 0m*, *never primary* (priority 0 and not an
   arbiter), *no index builds*, the tags as `name: value`, and the member's message. Selecting a member shows its
   `replSetGetStatus` and `replSetGetConfig` entries in the inspector island.
3. **Oplog**: a filter with the placeholder **Database or collection (shop, shop.users)**, read 300 ms after the
   last key; **Operation** with **All but no-ops** (to start with), **Insert**, **Update**, **Delete**, **Command /
   transaction**, **No-op** and **Everything**; **Last** with **50** (to start with), **200** and **1,000**; and
   *the 50 most recent entries, newest first* (or *all 12 most recent matching entries, newest first* when there
   are no more). The table: **Time** (with milliseconds; the date too when it is not today), **Op**, **Namespace**,
   **_id**, **Change** (`monitor.oplog-summary`). Selecting an entry shows it whole in the inspector island.

What it says elsewhere:

- **A standalone server**: *db1.example.net:27017 is a standalone server: it is not part of a replica set, so there
  is no replication and no oplog.* (*This server* when the server does not say its name). No tiles, no tables.
- **A mongos**: *Connected to a mongos (sharded cluster): add a connection to a shard to see its replica set and
  oplog. The Sharding section shows the cluster.*
- **Without the role for `replSetGetStatus`**: *Member details need the clusterMonitor role: <the server's
  message>*; the members are those `hello` names, with their state and nothing else.
- **An oplog that cannot be read** (a role without access to `local`, an Atlas tier that does not allow it):
  *Oplog: <the server's message>*, no **Oplog window** tile, and the oplog table's own error line.
- **Oplog empty**: *The oplog is empty.*; with a filter, *No entry matches.*
- **Read-only**: **Step down…** is disabled.

Acceptance:

- [ ] A set of three healthy members shows **Members** *3 / 3 healthy* and *1 primary · 2 secondary*.
- [ ] A secondary 12 seconds behind shows **Lag** *12 s* in the warning color; 75 seconds behind, *1m 15s* in the
  danger color.
- [ ] A member delayed by 3,600 seconds is left out of the **Replication lag** tile, which then says *delayed
  members left out*, and its **Notes** say *delayed 1h 0m*.
- [ ] On a standalone server the section shows the sentence above and neither tiles nor tables.
- [ ] On a mongos it shows *Connected to a mongos (sharded cluster): …*
- [ ] A user without `clusterMonitor` sees the members named by `hello` and the line *Member details need the
  clusterMonitor role: …*
- [ ] Typing `shop` in the oplog's filter reads the oplog once, 300 ms after the last key.
- [ ] With **Last** at **50** and 51 or more matching entries, the count reads *the 50 most recent entries, newest
  first*.
- [ ] A member whose heartbeat was 4 seconds before the read shows *4 s ago*; the member Datardo is connected to
  shows `—`.

### `monitor.read-replication` — Read the replica set

The kind of server, the members of its replica set with their configuration, and the size and window of the oplog.

- **Kind**: Read
- **Engine**: MongoDB
- **Function**: `src/features/monitor/read-replication.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: the Replication section; the tool `replica_set_status` of the MCP server.
- **Reads**:
  1. `db.adminCommand({ hello: 1 })`: a mongos when `msg` is `isdbgrid`; a standalone server when it has no
     `setName`; otherwise a replica set, with `setName`, `me` and `primary`. Nothing more is read unless it is a
     replica set.
  2. `db.adminCommand({ replSetGetStatus: 1 })` and `db.adminCommand({ replSetGetConfig: 1 })`, together. The
     second may fail alone: the members then have no priority, votes or notes.
  3. `db.getSiblingDB("local").oplog.rs.aggregate([{ $collStats: { storageStats: {} } }])`: `size`, `maxSize` and
     `count` of the oplog.
  4. `db.getSiblingDB("local").oplog.rs.find({}, { ts: 1, wall: 1 }).sort({ $natural: 1 }).limit(1)` and the same
     with `{ $natural: -1 }`: the first and the last entry.
- **Uses**: `monitor.replication-lag`.
- **Ported from**: `src/monitor.ts › loadReplication`; `src/replication.ts › replMembers`, `helloMembers`.

Rules of `parse`:

1. The term is the status's `term`. The election settings are the configuration's `electionTimeoutMillis`,
   `heartbeatIntervalMillis` and `chainingAllowed`, and its `protocolVersion`.
2. Members come from the status, each paired with the configuration's member of the same `_id`
   (`monitor.replication-lag`).
3. When `replSetGetStatus` fails, the members are those `hello` lists: its `hosts`, its `passives` with priority 0,
   its `arbiters` as arbiters. One is `PRIMARY` when it is `hello`'s primary, `ARBITER` when it is an arbiter,
   `SECONDARY` when it is the server itself and `hello` says `secondary`, and `?` otherwise. The failure's message
   is kept for the section.
4. The oplog window is the seconds of the last entry's timestamp minus the seconds of the first one's, 0 at least.
   The time shown for an entry is its `wall`, else its timestamp's seconds.
5. A failure of step 3 or 4 keeps everything else and gives the section its *Oplog: …* line.

Acceptance:

- [ ] On a standalone server only `hello` is sent.
- [ ] A first entry with the timestamp `Timestamp(1763366400, 1)` and a last one with `Timestamp(1763452800, 7)`
  give a window of 86,400 seconds, shown as `1d 0h`.
- [ ] When `replSetGetConfig` is refused and `replSetGetStatus` is not, the members have their state and lag and no
  priority.
- [ ] When `replSetGetStatus` is refused, `hello` with `hosts: ["a:27017", "b:27017"]`, `arbiters: ["c:27017"]`,
  `primary: "a:27017"` and `me: "b:27017"`, `secondary: true` gives `a` `PRIMARY`, `b` `SECONDARY` (itself) and `c`
  `ARBITER`.
- [ ] A user who cannot read `local` gets the members and the line *Oplog: …*, and no oplog window.

### `monitor.replication-lag` — Members and their lag

Pairs what the replica set reports about each member with how it is configured, and says how far each is behind the
primary.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/monitor/replication-lag.ts › members(statusMembers, configMembers)`
- **Ported from**: `src/replication.ts › replMembers`.

Inputs: the `members` of `replSetGetStatus` and of `replSetGetConfig`, as relaxed Extended JSON. Output: one member
per status member, in the status's order.

Rules:

1. The reference time is the `optimeDate` of the member whose state is `PRIMARY`; with no primary, the latest
   `optimeDate` among the members.
2. A member's lag is the reference time minus its `optimeDate`, in seconds, 0 at least. A member has no lag when it
   is an arbiter, or when its `optimeDate` is in 1970 (it never applied anything).
3. A member is healthy when its `health` is 1. `lastHeartbeat` in 1970 is no heartbeat.
4. From the configuration's member with the same `_id`: `priority`, `votes`, `hidden`, `arbiterOnly`, the delay
   (`secondaryDelaySecs`, or `slaveDelay` on a server before 5.0), `tags`, and `buildIndexes` when it is false.
5. The member's message is its `infoMessage`, else its `lastHeartbeatMessage`.

Worked examples:

- Primary at 14:00:10, secondaries at 14:00:10 and 14:00:02 → lags 0, 0 and 8 seconds.
- No primary, members at 14:00:10 and 14:00:04 → reference 14:00:10: lags 0 and 6.
- An arbiter with `optimeDate` 1970-01-01 → no lag, no last applied.
- A secondary ahead of the primary by 1 second (clocks) → lag 0.
- Status member `_id: 2` and configuration member `_id: 2` with `priority: 0`, `hidden: true`, `secondaryDelaySecs:
  3600`, `tags: { dc: "east" }` → priority 0, hidden, delay 3,600, tag `dc: east`.

Acceptance:

- [ ] The examples above give the values shown.
- [ ] A member whose configuration has `slaveDelay: 600` and no `secondaryDelaySecs` has a delay of 600 seconds.
- [ ] A status member with no configuration member of its `_id` has its state and lag and no priority.

### `monitor.read-oplog` — Read the last oplog entries

The most recent replicated operations, newest first, narrowed to a database or a collection and to a kind of
operation.

- **Kind**: Read
- **Engine**: MongoDB
- **Function**: `src/features/monitor/read-oplog.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: the Replication section, on a replica set.
- **Reads**: `db.getSiblingDB("local").oplog.rs.find(<filter>).sort({ $natural: -1 }).limit(51).maxTimeMS(10000)`:
  one entry more than **Last** (51, 201 or 1,001), which only says that there are more.
- **Uses**: `monitor.oplog-summary`.
- **Ported from**: `src/monitor.ts › loadOplog`; `src/replication.ts › oplogFilter`.

The filter, from the text and from **Operation**:

| Text | Operation | Filter |
| --- | --- | --- |
| (empty) | **All but no-ops** | `{ op: { $ne: "n" } }` |
| (empty) | **Everything** | `{}` |
| (empty) | **Update** | `{ op: "u" }` |
| `shop` | **All but no-ops** | `{ op: { $ne: "n" }, $or: [{ ns: { $regex: "^shop\\." } }, { "o.applyOps.ns": { $regex: "^shop\\." } }] }` |
| `shop.users` | **Delete** | `{ op: "d", $or: [{ ns: "shop.users" }, { "o.applyOps.ns": "shop.users" }] }` |
| `my.db` | **Everything** | `{ $or: [{ ns: "my.db" }, { "o.applyOps.ns": "my.db" }] }` |

**Insert**, **Update**, **Delete**, **Command / transaction** and **No-op** are `i`, `u`, `d`, `c` and `n`. A text
without a dot is a database: every namespace that starts with it and a dot, the characters of a regular expression
escaped. A text with a dot is one namespace. The second branch of `$or` finds the operations inside transactions.

When the read takes more than 10 seconds the error is *Few entries match and the oplog is long: reading it took
more than 10 s. <the server's message>*.

Acceptance:

- [ ] The rows of the table above give the filters shown.
- [ ] With **Last** at **200**, the limit sent is 201, and 201 entries read give 200 rows and the mark that there
  are more.
- [ ] An insert into `shop.users` inside a transaction is found by the text `shop.users`.
- [ ] The text `a.b` (database `a`, collection `b`) does not find `a.bc`.
- [ ] A read stopped by `maxTimeMS` shows *Few entries match and the oplog is long: reading it took more than 10 s.
  …*

### `monitor.oplog-summary` — What an oplog entry changes

One line per oplog entry: its kind, the `_id` it is about and what it changes.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/monitor/oplog-summary.ts › oplogRow(entry)`
- **Uses**: `query.format`.
- **Ported from**: `src/replication.ts › oplogEntry`, `updatedFields`.

Input: an oplog entry as relaxed Extended JSON. Output: its timestamp as `seconds:increment` (what tells entries
apart), its time, its kind, its namespace, the `_id` in mongosh syntax, and a summary of at most 300 characters,
then `…`.

Rules:

| `op` | Kind | `_id` | Summary |
| --- | --- | --- | --- |
| `i` | `insert` | of `o` | the inserted document, in mongosh syntax |
| `u` | `update` | of `o2` | `set` and the fields set, `unset` and the fields removed, joined by ` · `; *no change* when there are none; `replace with` and the document when the entry holds a whole document |
| `d` | `delete` | of `o` | (empty) |
| `n` | `noop` | — | the entry's `msg`, else `o` in mongosh syntax |
| `c` with `applyOps` | `transaction` | — | *3 operations:* and each distinct operation with its namespace, `2 × ` before one that repeats; *(part of a larger transaction)* at the end when the entry has `partialTxn` or a previous entry |
| `c` otherwise | `command` | — | the command's name; the namespace it names, when its value is text, as `database.collection`; the rest of `o` in mongosh syntax |

The fields of an update come from the entry's `diff` (the `$v: 2` format): `u` and `i` name fields set, `d` fields
removed; a key `s<name>` is the sub-document `name`, whose fields are written `name.field`; inside it, `u<n>` is the
element `n` of the array, `l` the array's new length (written `name (length)`), and `a` is skipped. Without a
`diff`, the fields are those of `$set` and `$unset`. A field named twice is written once.

Worked examples (entry → summary):

- `{ op: "u", ns: "shop.orders", o2: { _id: 7 }, o: { $v: 2, diff: { u: { status: "paid" }, d: { tempToken: false },
  saddress: { u: { city: "Rome" } } } } }` → `update`, `_id` `7`, `set status, address.city · unset tempToken`.
- `{ op: "u", o: { $set: { a: 1 }, $unset: { b: "" } } }` → `set a · unset b`.
- `{ op: "u", o: { $v: 2, diff: { sitems: { a: true, u0: { qty: 2 }, l: 3 } } } }` → `set items.0, items (length)`.
- `{ op: "u", o2: { _id: 7 }, o: { _id: 7, status: "new" } }` → `replace with { _id: 7, status: "new" }`.
- `{ op: "c", ns: "shop.$cmd", o: { create: "orders", idIndex: { v: 2, key: { _id: 1 }, name: "_id_" } } }` →
  `command`, `create shop.orders { idIndex: { v: 2, key: { _id: 1 }, name: "_id_" } }`.
- `{ op: "c", ns: "admin.$cmd", o: { applyOps: [{ op: "i", ns: "shop.orders", … }, { op: "i", ns: "shop.orders", …
  }, { op: "u", ns: "shop.users", … }] } }` → `transaction`, `3 operations: 2 × insert shop.orders, update
  shop.users`.
- `{ op: "n", o: { msg: "periodic noop" } }` → `noop`, `periodic noop`.

Acceptance:

- [ ] The examples above give the kinds and summaries shown.
- [ ] An inserted document of 2,000 characters gives a summary of 300 characters and `…`; the inspector island shows
  the whole entry.
- [ ] An entry with the timestamp `Timestamp(1763366400, 3)` has the key `1763366400:3`.
- [ ] An entry without `wall` has the time of its timestamp's seconds.

### `monitor.step-down` — Make the primary step down

Asks the primary of the replica set to step down, so that the members elect another one: a way to try a failover.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/monitor/step-down.ts › plan(context, answers)`
- **Entry points**: **Step down…** beside **Members** in the Replication section (`@toolbar`).
- **Offered when**: the server is in a replica set that has a primary, and the connection is not read-only.
- **Reads**: `db.adminCommand({ hello: 1 })`, for the name of the set and its primary as they are now.
- **Plan**: one step: `db.adminCommand({ replSetStepDown: 60, secondaryCatchUpPeriodSecs: 10 })`. The primary does
  not seek election for 60 seconds and waits up to 10 for a secondary to catch up. The title is **Step down the
  primary db1.example.net:27017 of rs0**.
- **Danger**: Confirm: **Step down the primary db1.example.net:27017 of rs0?** with *The members elect a new
  primary: writes fail until then (usually a few seconds). The current primary can not be elected again for 60
  seconds.* The button is **Step down**.
- **Read-only**: Refused on a read-only connection (`/read-only`).
- **Undo**: Cannot be undone: the election is the replica set's; the confirmation says so.
- **After**: the section says *db1.example.net:27017 stepped down: a new primary is being elected.* and reads the
  replica set again 1.5 seconds later. An error of the server is shown in the section.
- **Refuses**: *The connection Production is read-only.* (`/read-only`); *There is no primary to step down.*
  (`/no-primary`), also on a standalone server and on a mongos.
- **Uses**: `runner.confirm`, `runner.run`, `runner.notify`, `monitor.read-replication`.
- **Ported from**: `src/monitor.ts › stepDown`.

The command goes to the server the connection reaches: the driver sends it to the primary.

Acceptance:

- [ ] On `rs0` with the primary `db1.example.net:27017`, **Step down…** shows the confirmation above with the step
  `db.adminCommand({ replSetStepDown: 60, secondaryCatchUpPeriodSecs: 10 })` and the button **Step down**.
- [ ] After **Step down** the command is sent, the section says *db1.example.net:27017 stepped down: a new primary
  is being elected.* and the members are read again after 1.5 seconds.
- [ ] With no primary the button is disabled, and a request sent anyway is refused with *There is no primary to
  step down.*
- [ ] On a read-only connection nothing is sent and the refusal has the code `monitor.step-down/read-only`.
- [ ] When no secondary can catch up in 10 seconds, the server's message is shown and the primary stays.
- [ ] Closing the confirmation sends nothing.

### `monitor.sharding` — The Sharding section

The sharded cluster behind a mongos: its shards, its sharded collections with their chunks and data per shard, the
balancer, and the recent migrations and splits.

- **Kind**: View
- **Engine**: MongoDB
- **Function**: `src/features/monitor/sharding.ts › view(state)`
- **Entry points**: **Sharding** in the section bar of the Monitor page (`@section-bar`).
- **Reads**: `monitor.read-sharding` and `monitor.read-sharding-events`, at every refresh; the commands run once per
  collection only when the section is chosen and with **Refresh**.
- **Uses**: `monitor.read-sharding`, `monitor.read-sharding-events`, `monitor.balance`, `monitor.set-balancer`,
  `monitor.set-collection-balancing`, `nav.inspector`.
- **Ported from**: README, *Server monitor › Sharding*; `src/webview/monitor.ts › renderSharding`, `renderShards`,
  `renderShardCollections`, `shardCollectionDetail`, `renderShardEvents`, `mergeSharding`.

What it shows through a mongos:

1. The tiles:
   - **Shards**: how many; *1 draining · 1 not active · zones: east, west* or *no zones*.
   - **Sharded collections**: how many; *2 with balancing off · 1 not balanced*.
   - **Chunks**: how many; *3 jumbo* or *no jumbo chunks*, and *chunk size 128 MB*.
   - **Balancer**: *enabled*, *disabled*, the server's own word for another mode, or `?`; *round in progress* or
     *idle*, *1,204 rounds*, *window 23:00–06:00 (config server time)*, *no secondary throttle*.
   - **Migrations (24 h)**: *12 done · 1 failed*; *2 balancer rounds with errors*, or *see the recent events*.
   - **Config servers**: the replica set's name; *3 members · 2 of 2 mongos active · mongos 8.0.4*.
2. **Shards**, with *as of 14:02:11* and **Stop balancer…** or **Start balancer…** (`monitor.set-balancer`). The
   table: **Shard** (with its color), **Replica set** (*(standalone)* when it has none), **Members**, **State**
   (*active*, or *state 0*), **Draining**, **Zones**, **Chunks**, **Data**, **Documents**, **Primary of**. **Data**
   and **Documents** are of the sharded collections only; the tooltip of **Data** gives the share, *34% of the
   sharded data*. Selecting a shard shows its `listShards` entry in the inspector island.
3. **Sharded collections**, with a filter (placeholder **Filter by namespace or shard key**) and *12 of 40
   collections*. The table: **Namespace**, **Shard key** (`{ customerId: 1, _id: "hashed" }`), **Unique**,
   **Balancing** (*on*, *off*), **Chunks**, **Chunks per shard** (*shard01 12 · shard02 11*), **Data**,
   **Documents**, **Distribution** (a bar with one segment per shard in the shard's color, by data, or by chunks
   when the data is not known; the tooltip lists each shard with its amount and share), **Balance**
   (`monitor.balance`), **Jumbo**. It starts sorted by **Namespace**; every header but **Chunks per shard** and
   **Distribution** sorts.
4. Selecting a sharded collection shows in the inspector island: **Disable balancing…** or **Enable balancing…**
   (`monitor.set-collection-balancing`); **Copy shard key**; the balancer's verdict; a table of **Shard**,
   **Chunks**, **Data**, **Documents** and **Share** for the shards that hold some of it; **Zones**, each with its
   range as `{ region: "eu" } → { region: "ev" }` and *on shard01, shard02*, or *no shard in this zone*; *No zone
   ranges for this collection.* when it has none; and its document of `config.collections`.
5. **Recent events**, with a filter (placeholder **Database or collection (shop, shop.orders)**, read 300 ms after
   the last key), **Show** with **Migrations, splits, balancer** (to start with) and **Every event**, and *the 100
   most recent, newest first · 2 with errors*. The table: **Time**, **Event** (with a warning mark on a failure),
   **Namespace**, **Shard**, **Details**. Selecting an event shows it whole in the inspector island.

What it says elsewhere:

- **A standalone server**: *db1.example.net:27017 is a standalone server: it is not part of a sharded cluster.*
- **A replica set that is not a shard**: *db1.example.net:27017 is a replica set member, not a mongos: it is not
  part of a sharded cluster.*
- **A member of a shard**: *db1.example.net:27017 is a member of the shard shard01 of a sharded cluster (config
  servers cfg/c1:27019,c2:27019): connect to a mongos to see the whole cluster.*
- **A config server**: *c1.example.net:27019 is a config server of a sharded cluster: connect to a mongos to see the
  shards, the sharded collections and the balancer.*
- **Not everything could be read**: *Not everything could be read (the cluster's state needs the clusterMonitor
  role, the balancer status of each collection clusterManager):* and one line per part that failed, such as
  *balancer (balancerStatus): not authorized on admin*. The parts that were read are shown.
- **Empty**: *The cluster has no shards yet (addShard).* or *The shards could not be read.*; *No collection is
  sharded yet.*, *No collection matches the filter.* or *The sharded collections could not be read.*; *No events
  recorded.* or *No event for this namespace.*
- **More than 100 sharded collections, on a server before 6.0.3**: *· data per shard of the first 100 only* after
  the count.
- **Read-only**: the balancer's buttons are disabled.

Acceptance:

- [ ] Through a mongos with 2 shards and 3 sharded collections the section shows the six tiles and the three
  tables.
- [ ] On a standalone server, on a replica set, on a member of a shard and on a config server it shows the sentence
  of that case and no table.
- [ ] A user without `clusterManager` sees the collections without a **Balance** from the balancer and the line
  *balancer status of the collections (balancerCollectionStatus, clusterManager role): …*
- [ ] An automatic refresh does not send `balancerCollectionStatus`, and the **Balance** column keeps the values of
  the last **Refresh**.
- [ ] A collection with balancing disabled shows **Balancing** *off* in the warning color and counts in *1 with
  balancing off*.
- [ ] A jumbo chunk shows in **Jumbo** and makes the **Chunks** tile say *1 jumbo* in the warning color.
- [ ] Typing `customerId` in the collections' filter keeps the collections whose namespace or shard key contains
  it.
- [ ] A shard removed since still owning chunks appears in the tooltip of **Distribution** without a segment's
  color.

### `monitor.read-sharding` — Read the sharded cluster

The kind of server and, through a mongos, its shards, sharded collections, chunks, zones, balancer and the
migrations of the last 24 hours.

- **Kind**: Read
- **Engine**: MongoDB
- **Function**: `src/features/monitor/read-sharding.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: the Sharding section; the tool `sharding_status` of the MCP server.
- **Reads**: first `db.adminCommand({ hello: 1 })`. When `msg` is not `isdbgrid` the server is not a mongos: it is a
  config server when `hello` has `configsvr`; else, in a replica set, `db.adminCommand({ shardingState: 1 })` says
  whether it is a member of a shard, of which shard and with which config servers (a refusal of it leaves it a
  replica set); else a standalone server. Through a mongos, all of these together, each allowed to fail alone:
  1. `db.adminCommand({ buildInfo: 1 })`
  2. `db.adminCommand({ listShards: 1 })`
  3. `db.adminCommand({ balancerStatus: 1 })`
  4. `db.getSiblingDB("config").settings.find({})`
  5. `db.getSiblingDB("config").collections.find({ dropped: { $ne: true } }).sort({ _id: 1 })`
  6. `db.getSiblingDB("config").chunks.aggregate([{ $group: { _id: { uuid: "$uuid", ns: "$ns", shard: "$shard" },
     n: { $sum: 1 }, jumbo: { $sum: { $cond: [{ $eq: ["$jumbo", true] }, 1, 0] } } } }])`
  7. `db.getSiblingDB("config").tags.find({}).sort({ ns: 1, min: 1 })`
  8. `db.getSiblingDB("config").databases.find({}, { primary: 1 })`
  9. `db.adminCommand({ serverStatus: 1, repl: 0, metrics: 0, locks: 0, opcounters: 0, opcountersRepl: 0, network:
     0, connections: 0, mem: 0, extra_info: 0 })`
  10. `db.getSiblingDB("config").changelog.aggregate([{ $match: { time: { $gte: <24 hours ago> }, what: { $in:
      ["moveChunk.commit", "moveChunk.from", "moveChunk.error"] } } }, { $group: { _id: { what: "$what", ok: { $eq:
      ["$details.note", "success"] } }, n: { $sum: 1 } } }])`
  11. `db.getSiblingDB("config").actionlog.countDocuments({ time: { $gte: <24 hours ago> }, $or: [{
      "details.errorOccured": true }, { "details.errorOccurred": true }] })`
  12. `db.getSiblingDB("config").mongos.find({}, { ping: 1 })`
  13. `db.getSiblingDB("admin").aggregate([{ $shardedDataDistribution: {} }])`

  The aggregations and the count have `maxTimeMS` 15,000. On a full read, also, for the first 100 sharded
  collections and 8 at a time: `db.adminCommand({ balancerCollectionStatus: "shop.orders" })`; and, only when
  step 13 failed (a server before 6.0.3), `db.getSiblingDB("shop").orders.aggregate([{ $collStats: { storageStats:
  {} } }, { $project: { shard: 1, "storageStats.size": 1, "storageStats.count": 1 } }])`, which gives one document
  per shard.
- **Uses**: `query.format`.
- **Ported from**: `src/sharding.ts › shardingStatus`, `formatShardKey`, `parseShardHost`.

Rules of `parse`:

1. **Balancer**: the mode of `balancerStatus`; without it, from the `balancer` document of `config.settings`, `off`
   when it is stopped and `full` otherwise. Whether a round is in progress and the number of rounds, from
   `balancerStatus`. The active window, when the document has its start and its stop. The chunk size in megabytes,
   from the `chunksize` document, else from `maxChunkSizeInBytes` of `serverStatus`.
2. **Migrations**: done is the count of `moveChunk.commit`; failed is the larger of the count of `moveChunk.error`
   and of the `moveChunk.from` whose note is not `success` (a failed migration can log both).
3. **Routers**: a mongos is active when its `ping` is less than 60 seconds old.
4. **Collections**: per document of `config.collections`, the namespace, the shard key in mongosh syntax, `unique`,
   balancing (on unless `noBalance` is true), the chunks per shard and in all and the jumbo ones (chunks matched by
   the collection's `uuid`, or by `ns` on a server whose chunks have no `uuid`), the data and documents per shard,
   and its zone ranges with `min` and `max` in mongosh syntax.
5. **Shards**: per shard of `listShards`, its name, its host split as `rs0/a:27018,b:27018` into the replica set
   `rs0` and its members (no replica set without a `/`), its state, whether it drains, its zones, its chunks, the
   sums of the data and the documents of the sharded collections on it (unknown when no collection's data was
   read), and the databases it is the primary shard of, sorted.
6. **Zones**: the distinct zones of the shards and of the ranges, sorted.
7. **Config servers**: `configsvrConnectionString` of `serverStatus`; without it, the `config` entry of
   `db.adminCommand({ getShardMap: 1 })`.
8. A part whose read failed is named in the errors as `<part> (<what>): <the server's message>`, the message
   without the command some servers append (` to execute command { … }`). The parts are *shards (listShards)*,
   *balancer (balancerStatus)*, *settings (config.settings)*, *sharded collections (config.collections)*, *chunks
   (config.chunks)*, *zones (config.tags)*, *migrations (config.changelog)*, *data per shard
   ($shardedDataDistribution, $collStats)* and *balancer status of the collections (balancerCollectionStatus,
   clusterManager role)*. The last two are errors only when every collection failed.
9. A read that is not full keeps, for each collection, the balancer's verdict and the data per shard of the last
   full read, and its two errors.

Acceptance:

- [ ] On a server that is not a mongos, only `hello` (and `shardingState`, in a replica set) is sent.
- [ ] `hello` with `configsvr: 2` gives a config server.
- [ ] `listShards` with the host `rs0/a:27018,b:27018` gives the replica set `rs0` and the members `a:27018` and
  `b:27018`; the host `a:27018` gives no replica set and one member.
- [ ] With 4 `moveChunk.commit`, 1 `moveChunk.error` and 1 `moveChunk.from` whose note is `aborted`, the migrations
  are 4 done and 1 failed.
- [ ] A mongos whose `ping` is 61 seconds old is not active.
- [ ] On a server where `$shardedDataDistribution` fails, a full read sends `$collStats` for the first 100 sharded
  collections, and with 140 collections the result says the data per shard is of the first 100.
- [ ] A read that is not full sends neither `balancerCollectionStatus` nor that `$collStats`.
- [ ] An error *not authorized on config to execute command { find: "chunks", … }* is kept as *chunks
  (config.chunks): not authorized on config*.
- [ ] A shard key `{ customerId: 1, _id: "hashed" }` is written exactly so.

### `monitor.read-sharding-events` — Read the recent events of the cluster

The last migrations, splits, merges and balancer rounds, newest first.

- **Kind**: Read
- **Engine**: MongoDB
- **Function**: `src/features/monitor/read-sharding-events.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: the Sharding section, through a mongos.
- **Reads**: `db.getSiblingDB("config").changelog.find(<filter>).sort({ time: -1 }).limit(100).maxTimeMS(15000)`
  and, when no namespace is asked for, `db.getSiblingDB("config").actionlog.find({}).sort({ time: -1
  }).limit(100).maxTimeMS(15000)` (the balancer's rounds, which are not about one collection). The two are merged by
  time and the 100 most recent kept.
- **Uses**: `query.format`.
- **Ported from**: `src/sharding.ts › shardingEvents`, `shardingEvent`.

The filter: with **Migrations, splits, balancer**, `{ what: { $regex:
"^(moveChunk|moveRange|split|multi-split|merge|autoMerge|balancer|rangeDeletion|cleanUpOrphaned)" } }`; with **Every
event**, `{}`. A text adds `ns`: the namespace itself when it has a dot, else `{ $regex: "^shop\\." }`.

Rules of `parse`, per event: its time, its `what`, its namespace, its shard (`shard`, else `server`), and a summary
of at most 300 characters whose parts are joined by ` · `:

- a `moveChunk` or a `moveRange`: the range as `{ a: MinKey() } → { a: 100 }`; `shard01 → shard02`; *12,400
  documents copied*; the note, when it is not `success`;
- a `split`: *at* and the split point; the range before;
- a `multi-split`: *2 of 5*; the chunk's range;
- a `balancer.round`: *2 chunks moved*, *5 candidates*, *340 ms*;
- anything else: its details in mongosh syntax;
- then the error message, when it has one.

An event is a failure when its `what` ends in `.error`, or it has an error message, or it is a `moveChunk.from` or
`moveChunk.to` whose note is not `success`, or its details say that an error occurred.

Acceptance:

- [ ] With **Migrations, splits, balancer** and no text, both collections are read with the limit 100 and the
  result has at most 100 events, newest first.
- [ ] With the text `shop.orders`, the filter has `ns: "shop.orders"` and `config.actionlog` is not read.
- [ ] A `moveChunk.commit` of `{ a: 0 } → { a: 100 }` from `shard01` to `shard02` with `counts.cloned: 12400` has
  the summary `{ a: 0 } → { a: 100 } · shard01 → shard02 · 12,400 documents copied`.
- [ ] A `moveChunk.from` with the note `aborted` is a failure and has `aborted` in its summary.
- [ ] A `balancer.round` with `chunksMoved: 1`, `candidateChunks: 5` and `executionTimeMillis: 340` has the summary
  `1 chunk moved · 5 candidates · 340 ms`.
- [ ] A failure of the read shows *config.changelog: <the server's message>* in the events' error line and leaves
  the rest of the section.

### `monitor.balance` — Whether a sharded collection is balanced

The word of the **Balance** column: the balancer's own verdict when it could be read, otherwise an estimate from
the data on each shard.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/monitor/balance.ts › balance(collection, shards, chunkSizeMb)`
- **Ported from**: `src/webview/monitor.ts › balanceOf`.

Inputs: a sharded collection with the verdict of `balancerCollectionStatus` (when read) and its data per shard
(when read); the shards; the chunk size in megabytes (128 when unknown). Output: a word, whether it is a warning,
and a tooltip.

Rules:

1. The balancer says it is compliant: *balanced*, with the tooltip *balancerCollectionStatus: compliant*.
2. The balancer says it is not: a warning, with the first violation as *uneven chunks* (`chunksImbalance`), *zone
   violation* (`zoneViolation`), *draining* (`draining`) or *defragmenting* (`defragmentingChunks`); another
   violation by the server's word; none named, *not balanced*. The tooltip is *balancerCollectionStatus: <the
   violation>: the balancer has chunks of this collection to move or merge*.
3. No verdict: with the data per shard known and at least 2 shards that are not draining, it is *uneven*, a
   warning, when all of these hold: the collection has data; the largest shard holds at least 1.5 times an even
   share (the total ÷ the number of those shards); and the largest shard holds more than the smallest by more than 3
   chunk sizes. The tooltip is *The largest shard holds 75% of the data*. Otherwise the cell is empty.

Worked examples (no verdict, chunk size 128 MB, so the gap must exceed 384 MB):

| Data per shard | Even share × 1.5 | Gap | Result |
| --- | --- | --- | --- |
| 3 GB, 1 GB | 3 GB | 2 GB | *uneven*, *The largest shard holds 75% of the data* |
| 600 MB, 300 MB | 675 MB | 300 MB | empty (600 MB is under 675 MB) |
| 500 MB, 100 MB, 100 MB | 350 MB | 400 MB | *uneven*, *The largest shard holds 71% of the data* |
| 400 MB, 100 MB, 100 MB | 300 MB | 300 MB | empty (the gap is not over 384 MB) |
| 0, 0 | 0 | 0 | empty |
| 5 GB on one shard, the other draining | — | — | empty (one shard that is not draining) |

Acceptance:

- [ ] The examples above give the results shown.
- [ ] A compliant collection is *balanced* whatever its data per shard.
- [ ] `firstComplianceViolation: "zoneViolation"` gives *zone violation* as a warning.
- [ ] A collection whose data per shard was not read and without a verdict has an empty cell.
- [ ] Sorting the collections by **Balance** sorts by this word.

### `monitor.set-balancer` — Stop or start the balancer

Stops the balancer of the cluster, or starts it again.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/monitor/set-balancer.ts › plan(context, answers)`
- **Entry points**: **Stop balancer…** beside **Shards** in the Sharding section when the balancer is on, **Start
  balancer…** when it is off (`@toolbar`).
- **Offered when**: through a mongos, the balancer's mode could be read, and the connection is not read-only.
- **Plan**: one step: `db.adminCommand({ balancerStop: 1 })` or `db.adminCommand({ balancerStart: 1 })`. The title
  is **Stop the balancer** or **Start the balancer**.
- **Danger**: Confirm. **Stop the balancer?** with *No more chunks are moved between the shards until it is started
  again: the data can become uneven and ranges can stay on shards outside their zone. A migration in progress is
  completed first (balancerStop waits for it).* and the button **Stop balancer**. **Start the balancer?** with *The
  balancer moves chunks between the shards to even out the data and to respect the zones (within its active window,
  if one is set). Migrations load the shards involved.* and the button **Start balancer**.
- **Read-only**: Refused on a read-only connection (`/read-only`).
- **Undo**: Cannot be undone from the undo history: it changes a setting of the cluster. The other button puts it
  back; the chunks already moved stay where they are.
- **After**: the section says *The balancer is stopped.* or *The balancer is started.* and reads the cluster again,
  in full, 1 second later. An error of the server is shown in the section.
- **Refuses**: *The connection Production is read-only.* (`/read-only`); not through a mongos (`/unsupported`).
- **Uses**: `runner.confirm`, `runner.run`, `runner.notify`, `monitor.read-sharding`.
- **Ported from**: `src/monitor.ts › setBalancer`; `src/sharding.ts › setBalancer`.

Acceptance:

- [ ] With the balancer on, the button is **Stop balancer…**; its confirmation shows `db.adminCommand({
  balancerStop: 1 })` and the button **Stop balancer**.
- [ ] After it the section says *The balancer is stopped.*, the tile reads *disabled* and the button is **Start
  balancer…**
- [ ] **Start balancer…** sends `db.adminCommand({ balancerStart: 1 })` and says *The balancer is started.*
- [ ] When the balancer's mode could not be read there is no button.
- [ ] On a read-only connection nothing is sent and the refusal has the code `monitor.set-balancer/read-only`.
- [ ] Closing the confirmation sends nothing.

### `monitor.set-collection-balancing` — Disable or enable the balancing of a collection

Tells the balancer to leave the chunks of one sharded collection where they are, or to move them again.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/monitor/set-collection-balancing.ts › plan(context, answers)`
- **Entry points**: **Disable balancing…** or **Enable balancing…** in the inspector island, on a selected sharded
  collection of the Sharding section (`@inspector`).
- **Offered when**: through a mongos, and the connection is not read-only.
- **Plan**: one step: `db.adminCommand({ configureCollectionBalancing: "shop.orders", enableBalancing: false })`.
  On a server that answers it with the code 40415 (an unknown field) or 59 (an unknown command), the step is
  instead `db.getSiblingDB("config").collections.updateOne({ _id: "shop.orders" }, { $set: { noBalance: true } })`,
  run without a second confirmation; the confirmation shows both and says which one a server takes. The title is
  **Disable balancing for shop.orders** or **Enable balancing for shop.orders**.
- **Danger**: Confirm. **Disable balancing for shop.orders?** with *The balancer no longer moves the chunks of this
  collection (a migration in progress is completed): its data can become uneven across the shards.* and the button
  **Disable balancing**. **Enable balancing for shop.orders?** with *The balancer can move the chunks of this
  collection again.* and the button **Enable balancing**.
- **Read-only**: Refused on a read-only connection (`/read-only`).
- **Undo**: Cannot be undone from the undo history: it changes a setting of the cluster. The other button puts it
  back.
- **After**: the section says *Balancing disabled for shop.orders (configureCollectionBalancing).* or, by the other
  way, *Balancing disabled for shop.orders (config.collections (noBalance)).*, and reads the cluster again, in full,
  1 second later.
- **Refuses**: *The connection Production is read-only.* (`/read-only`); *shop.orders is not a sharded collection.*
  when the second step matches no document (`/not-sharded`); not through a mongos (`/unsupported`).
- **Uses**: `runner.confirm`, `runner.run`, `runner.notify`, `monitor.read-sharding`.
- **Ported from**: `src/monitor.ts › setCollectionBalancing`; `src/sharding.ts › setCollectionBalancing`.

Acceptance:

- [ ] On a collection with balancing on, the button is **Disable balancing…** and its confirmation shows
  `db.adminCommand({ configureCollectionBalancing: "shop.orders", enableBalancing: false })`.
- [ ] After it the section says *Balancing disabled for shop.orders (configureCollectionBalancing).* and the
  collection's **Balancing** is *off*.
- [ ] On a server that answers with the code 40415, `config.collections` is updated with `noBalance: true` and the
  section says *Balancing disabled for shop.orders (config.collections (noBalance)).*
- [ ] **Enable balancing…** sends `enableBalancing: true`, or sets `noBalance: false`.
- [ ] Another error of the first step (not authorized, for example) is shown and nothing else is sent.
- [ ] On a read-only connection nothing is sent and the refusal has the code
  `monitor.set-collection-balancing/read-only`.
