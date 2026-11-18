# Explain

How the server runs the query or the pipeline of a collection tab: the Explain section asks MongoDB for the explain
with its execution statistics and shows a summary of it: whether an index was used, how many keys and documents were
examined for those returned, the winning plan stage by stage and shard by shard, and the index that would serve the
query, ready to be created. The whole output of the server is one click away.

In these cards *the explain* is what the server returns and *the winning plan* is the plan the server chose; neither is
the plan of an operation.

### `explain.show` — The Explain section

The summary of the explain of the query in the query bar, or of the pipeline.

- **Kind**: View
- **Engine**: MongoDB
- **Function**: `src/features/explain/show.ts › view(state)`
- **Entry points**: **Explain** under **More** in the section bar of a collection tab (`@section-bar`); **Explain** in
  the query bar and in the toolbar of the pipeline editor (`@query-bar`); Go to (**Explain**); **Explain** on a slow
  query of the Monitor page (`monitor.show`) and on an advice of the Index advisor (`advisor.show`); the tool
  `open_explain` of the MCP server (`mcp.tab-tools`).
- **Offered when**: the active tab is a collection tab, of a collection or of a view.
- **Reads**: `explain.run`, each time the section is shown and each time **Explain** is pressed.
- **Commands**: `explain.show`
- **Uses**: `explain.run`, `explain.summary`, `explain.shards`, `explain.suggest-index`, `explain.raw`,
  `index.create`, `query.bar`, `aggregate.show`, `query.format`.
- **Ported from**: `src/webview/explainView.ts` (`ExplainView`, `planTree`), `src/webview/main.ts` (`explain`),
  `src/collectionPanel.ts` (the Explain dialog of `html`).

What it shows, top to bottom:

1. A toolbar (`@toolbar`): the title, *Explain · find* or *Explain · pipeline*, and on the right **Raw**, which reads
   **Summary** while the raw output is shown (`explain.raw`).
2. **The verdict**, as marks in a row:
   - **COLLSCAN**, as a warning, when a stage reads the whole collection; it explains itself as *Every document of the
     collection is read: no index is used for the filter*;
   - **index status_1**, as good, once for each index the winning plan uses;
   - the name of the first stage, plain, when there is neither;
   - **in-memory sort**, as a warning: *No index provides the sort order: results are sorted in memory (limited to 100
     MB unless spilling to disk)*;
   - **1 rejected plan** or **2 rejected plans**, plain, when the server considered others.

   A warning and a good mark differ by an icon as well as by color.
3. **The numbers**, each a figure over its name, left out when the explain does not have it: **returned**, **keys
   examined**, **documents examined**, **time**, in milliseconds. Figures have thousands separators.
4. **The note**, when the documents examined are at least ten times those returned: *333 documents examined for each
   one returned.*, or, with none returned, *1,000 documents examined, none returned.*
5. **The suggested index** (`explain.suggest-index`), when there is a COLLSCAN or an in-memory sort and the query has
   something an index can serve: *Suggested index:* and the keys in mongosh syntax, `{ status: 1, createdAt: -1,
   total: 1 }`, explained as *Equality fields first, then the sort, then range fields (ESR rule)*, with the button
   **Create…**, *Open the index dialog with this index ready to create*. **Create…** starts `index.create` with these
   keys; it is not shown on a view or on a read-only connection.
6. **Winning plan**: the stages as a tree, the stage that produces the result first, each input under its stage,
   indented and marked `└`. A row has the name of the stage, then what the explain gives for it, *120 out · 120 keys ·
   120 docs*, and under it its details on one line, each as its name and its value in mongosh syntax, cut with the
   whole text on hover: `indexName: "status_1"  keyPattern: { status: 1 }  direction: "forward"`. `COLLSCAN` and
   `SORT` are drawn as warnings, `IXSCAN` and `IDHACK` as good. Each shard of a sharded collection is a row `SHARD`
   with its name and its own numbers (`explain.shards`).
7. **Pipeline stages after the query**, for a pipeline whose later stages run outside the query: one row per stage,
   with *4 out · ~2 ms* when the explain gives them.

States:

- While the explain runs: the title and *Running explain…*; **Raw** is disabled; the status line offers **Cancel**
  (`runner.cancel`).
- An error, of the query or of the server: its message in place of the summary; **Raw** is disabled.
- An explain in which nothing is recognized: no verdict and no winning plan, and **Raw** shows what the server
  returned.

Acceptance:

- [ ] **Explain** with the filter `{ status: "paid" }` on a collection without an index on `status` shows **COLLSCAN**,
      the four numbers, the note, *Suggested index:* `{ status: 1 }` and a winning plan of one row, `COLLSCAN`.
- [ ] The same after the index is created shows **index status_1**, no note and no suggestion, and a winning plan of
      `FETCH` with `IXSCAN` under it.
- [ ] The first worked example of `explain.summary` shows the numbers 3, 0, 1,000 and 7 ms and the note *333 documents
      examined for each one returned.*
- [ ] The second shows **index status_1**, **in-memory sort** and **1 rejected plan**, in that order, and three rows
      `SORT`, `└ FETCH`, `└ IXSCAN`, the last two each indented one level more.
- [ ] **Create…** opens the index dialog with the suggested keys in their order and directions, and creating the
      index is `index.create`, with its plan and its refusals.
- [ ] On a read-only connection the suggestion is shown without **Create…**.
- [ ] A pipeline of `$match`, `$group` and `$sort` shows *Explain · pipeline*, the winning plan of its `$match` and,
      under **Pipeline stages after the query**, `$group` and `$sort`.
- [ ] Pressing **Explain** again, after the query changed, replaces the summary; the reply of the earlier explain,
      arriving late, is not shown.
- [ ] Each mark of the verdict and each stage drawn as a warning can be told from the good ones without color.

### `explain.run` — Ask the server for the explain

- **Kind**: Read
- **Engine**: MongoDB
- **Function**: `src/features/explain/run.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: **Explain** in the query bar and in the toolbar of the pipeline editor (`@query-bar`); showing the
  Explain section.
- **Offered when**: the active tab is a collection tab.
- **Reads**: one command, with the level `executionStats`, so the server runs the query to count what it examines:
  - in **Find**: `db.orders.find({ status: "paid" }, { total: 1 }).sort({ createdAt: -1
    }).maxTimeMS(60000).explain("executionStats")`, with the filter, the sort and the projection as they are typed in
    the query bar, run or not, and without the skip and the limit of the page;
  - in **Aggregate**: `db.orders.explain("executionStats").aggregate([…], { allowDiskUse: true, maxTimeMS: 60000 })`,
    with the enabled stages up to the stage shown (`aggregate.build`).
- **After**: the output goes to `explain.summary` and `explain.suggest-index`, and the section shows them; the output
  itself is kept for `explain.raw`, with its types.
- **Refuses**:
  - a filter, a sort or a projection that is not valid: the field is marked and *Invalid query syntax — check the
    highlighted field.* (`/invalid-query`); a stage that is not valid, as `aggregate.run` refuses it
    (`/invalid-stage`);
  - a pipeline whose last stage writes: *A pipeline ending with $out can't be explained here: select an earlier
    stage.*, or the same with `$merge` (`/writes`).
- **Commands**: `explain.run`
- **Uses**: `explain.summary`, `explain.suggest-index`, `aggregate.build`, `query.parse`, `runner.cancel`.
- **Ported from**: `src/collectionPanel.ts` (`explain`), `src/webview/main.ts` (`explain`).

Rules:

- The explain is given up after 60 seconds.
- It writes nothing: a pipeline that writes is refused before anything is sent, so it runs the same through a
  read-only connection.
- The query explained is not added to the recent queries and does not change what the Documents section shows.
- For a pipeline, the filter and the sort given to `explain.suggest-index` are those of a first enabled `$match`
  stage and of a `$sort` stage right after it, or of a first `$sort` stage; any other pipeline gives none.

Acceptance:

- [ ] With the filter `{ status: "paid" }`, the sort `{ createdAt: -1 }` and an empty projection, the server receives
      an `explain` of a `find` with that filter and sort, the verbosity `executionStats` and `maxTimeMS` 60000, without
      `skip` and `limit`.
- [ ] A filter typed and not yet run is the one explained.
- [ ] In **Aggregate** with the second of three stages shown, the pipeline explained has the first two stages; a
      disabled one is not sent.
- [ ] A pipeline shown up to `$out` sends nothing and says *A pipeline ending with $out can't be explained here:
      select an earlier stage.*
- [ ] With the sort `{ createdAt: ` nothing is sent and the sort is marked.
- [ ] **Cancel** on the status line ends the command on the server and the section shows *Cancelled* with **Run
      again**.
- [ ] On a read-only connection the explain of a find and of a pipeline without a stage that writes runs.
- [ ] An explain that takes longer than 60 seconds shows the server's error about the time limit.

### `explain.summary` — The summary of an explain

From the output of the server to the verdict, the numbers and the tree of the winning plan.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/explain/summary.ts › explainSummary(output)`
- **Uses**: `explain.shards`. Used by `explain.show`, by the tools of the MCP server that explain a query
  (`mcp.server`) and by the Monitor page (`monitor.show`).
- **Ported from**: `src/shared/explain.ts` (`summarizeExplain`, `toNode`, `findWith`, `DETAIL_KEYS`, `isClassic`),
  `test/unit/explain.test.ts`.

Input: the explain as the server returns it, for a find or an aggregate, from a replica set or through mongos. Output:
the tree of the winning plan or none; the names of the indexes used; whether there is a COLLSCAN; whether there is an
in-memory sort; the four numbers; the number of rejected plans; the stages of the pipeline after the query.

Rules:

1. **Where the query is.** The first object that has `queryPlanner`, searching the output in depth, objects and arrays,
   to eight levels: the output itself for a find, the `$cursor` stage of an aggregate, a shard's entry otherwise.
2. **The statistics** are the `executionStats` beside that `queryPlanner`, or else the first `executionStats` found
   in the same way. The numbers are its `nReturned`, `totalKeysExamined`, `totalDocsExamined` and
   `executionTimeMillis`; one that is missing or not a number is left out. For an aggregate these are the numbers of
   the query, not of the stages after it.
3. **The tree.** When the `executionStages` of the statistics are classic, a stage whose name is in capitals, the
   tree is made from them, and has the numbers of each stage. Otherwise, as with the slot-based engine, it is made
   from `queryPlanner.winningPlan`, or from the `queryPlan` inside it when there is one, and has no numbers. Without
   either there is no tree.
4. **A node** has the name of the stage (`?` without one); the details, in this order and only those present:
   `indexName`, `keyPattern`, `indexBounds`, `filter`, `sortPattern`, `transformBy`, `limitAmount`, `skipAmount`,
   `direction`, `isMultiKey`; its `nReturned`, `keysExamined`, `docsExamined` and `executionTimeMillisEstimate`; and
   as children its `inputStage`, then its `inputStages`, then its `queryPlan`, then its shards (`explain.shards`).
5. **The verdict.** Over every node of the tree: the indexes are the different `indexName` values, in the order met;
   COLLSCAN is true when a stage is named `COLLSCAN`; the in-memory sort when one is named `SORT`.
6. **Rejected plans**: the length of `queryPlanner.rejectedPlans`; when it is not there, the sum of the lengths of
   the `rejectedPlans` of the shards of the winning plan.
7. **The stages after the query**: for an output with `stages`, each stage but `$cursor`, by the name of its key that
   starts with `$`, with its `nReturned` and its `executionTimeMillisEstimate`.
8. Anything else, `null`, a number, an object without a `queryPlanner`, gives no tree, no index, false, false, no
   numbers, 0 and no stages; it never fails.

Worked examples (only the parts of the output that are read):

- A find with no index →

  ```js
  { queryPlanner: { winningPlan: { stage: "COLLSCAN", filter: { status: { $eq: "paid" } }, direction: "forward" },
                    rejectedPlans: [] },
    executionStats: { nReturned: 3, executionTimeMillis: 7, totalKeysExamined: 0, totalDocsExamined: 1000,
      executionStages: { stage: "COLLSCAN", filter: { status: { $eq: "paid" } }, nReturned: 3,
                         executionTimeMillisEstimate: 5, direction: "forward", docsExamined: 1000 } } }
  ```

  gives COLLSCAN true, no index, no in-memory sort, 0 rejected plans; the numbers 3, 0, 1000 and 7; a tree of one
  node, `COLLSCAN`, 3 out, 1,000 docs, with the details `filter: { status: { $eq: "paid" } }  direction: "forward"`.

- A find served by an index and sorted in memory →

  ```js
  { queryPlanner: { winningPlan: { stage: "SORT", … }, rejectedPlans: [{ … }] },
    executionStats: { nReturned: 120, executionTimeMillis: 4, totalKeysExamined: 120, totalDocsExamined: 120,
      executionStages: { stage: "SORT", nReturned: 120, sortPattern: { createdAt: -1 },
        inputStage: { stage: "FETCH", nReturned: 120, docsExamined: 120,
          inputStage: { stage: "IXSCAN", nReturned: 120, keysExamined: 120, indexName: "status_1",
                        keyPattern: { status: 1 }, isMultiKey: false, direction: "forward",
                        indexBounds: { status: ["[\"paid\", \"paid\"]"] } } } } } }
  ```

  gives the index `status_1`, in-memory sort true, COLLSCAN false, 1 rejected plan; the numbers 120, 120, 120 and 4;
  the tree `SORT` (120 out, `sortPattern: { createdAt: -1 }`) → `FETCH` (120 out, 120 docs) → `IXSCAN` (120 out, 120
  keys, with `indexName`, `keyPattern`, `indexBounds`, `direction`, `isMultiKey` in that order).

- The slot-based engine →

  ```js
  { queryPlanner: { winningPlan: { queryPlan: { stage: "FETCH", inputStage: { stage: "IXSCAN", indexName: "x_1" } },
                                   slotBasedPlan: { … } } },
    executionStats: { nReturned: 1, executionStages: { stage: "nlj", nReturned: 1 } } }
  ```

  gives the tree `FETCH` → `IXSCAN` from the `queryPlan`, without numbers on its nodes; the index `x_1`; returned 1.

- An aggregate →

  ```js
  { stages: [
      { $cursor: { queryPlanner: { winningPlan: { stage: "IXSCAN", indexName: "status_1" } },
                   executionStats: { nReturned: 10, totalKeysExamined: 10, totalDocsExamined: 10 } },
        nReturned: 10 },
      { $group: { _id: "$customer" }, nReturned: 4, executionTimeMillisEstimate: 2 },
      { $sort: { sortKey: { _id: 1 } }, nReturned: 4 } ] }
  ```

  gives the index `status_1`; the numbers 10, 10 and 10, without the time; the stages after the query `$group`, 4 out,
  about 2 ms, and `$sort`, 4 out.

- A plan with two inputs: `SORT` over `FETCH` over `OR` with two `IXSCAN` stages on `a_1` and `c_1` in its
  `inputStages` → the indexes `a_1` and `c_1`, in-memory sort true, and `OR` with two children.

Acceptance:

- [ ] The five worked examples give exactly these results.
- [ ] Each of `null`, `42`, `"x"`, `{}` and `{ ok: 1 }` gives no tree, no index, no COLLSCAN, 0 rejected plans and no
      stages.
- [ ] An index used by two stages is listed once.
- [ ] A stage `SORT_KEY_GENERATOR` or `SORT_MERGE` does not count as an in-memory sort; only a stage named `SORT`
      does.
- [ ] An output whose `queryPlanner` is nine levels deep is treated as having none.
- [ ] A number given by the server as a Long, not as a number, is left out and not shown as 0.
- [ ] The details of a node are in the order of rule 4, whatever their order in the output.

### `explain.shards` — The winning plan of each shard

On a sharded collection the explain has one plan per shard; each is shown with its own numbers.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/explain/shards.ts › shardNodes(stage, plannerShards)`
- **Uses**: used by `explain.summary`, whose tree and verdict include what it returns.
- **Ported from**: `src/shared/explain.ts` (`shardNode`, `PlannerShards`), `test/unit/explain.test.ts`.

Rules:

- A stage that has `shards`, such as `SINGLE_SHARD`, `SHARD_MERGE` or `SHARD_MERGE_SORT`, gets one child per shard,
  after its other inputs, in the order of the output.
- The node of a shard is named `SHARD`; its detail is `shardName`; its numbers are the shard's `nReturned`,
  `totalKeysExamined`, `totalDocsExamined` and `executionTimeMillis`.
- Its only child is the plan of that shard: its `executionStages` when they are classic; otherwise its logical plan,
  which is the shard's own `winningPlan`, or the `winningPlan` of the shard with the same name in the `queryPlanner`,
  because the statistics do not repeat it, with the `queryPlan` inside it when there is one. A shard with neither has
  no child.
- The verdict of `explain.summary` goes through the shards: an index used by any shard is listed, a COLLSCAN in any
  shard is a COLLSCAN, and the rejected plans are added up over the shards.

Worked examples:

- One shard, without statistics →

  ```js
  { queryPlanner: { winningPlan: { stage: "SINGLE_SHARD",
      shards: [{ shardName: "rs0", winningPlan: { stage: "COLLSCAN" } }] } } }
  ```

  gives `SINGLE_SHARD` → `SHARD` (`shardName: "rs0"`) → `COLLSCAN`, and COLLSCAN true.

- Two shards, the second run by the slot-based engine →

  ```js
  { queryPlanner: { winningPlan: { stage: "SHARD_MERGE", shards: [
      { shardName: "sh1", winningPlan: { stage: "FETCH", inputStage: { stage: "IXSCAN", indexName: "a_1" } },
        rejectedPlans: [{ … }] },
      { shardName: "sh2", winningPlan: { stage: "COLLSCAN" }, rejectedPlans: [] } ] } },
    executionStats: { nReturned: 5, totalDocsExamined: 40,
      executionStages: { stage: "SHARD_MERGE", nReturned: 5, shards: [
        { shardName: "sh1", nReturned: 2, totalKeysExamined: 2, totalDocsExamined: 2,
          executionStages: { stage: "FETCH", nReturned: 2,
            inputStage: { stage: "IXSCAN", indexName: "a_1", keysExamined: 2 } } },
        { shardName: "sh2", nReturned: 3, totalDocsExamined: 38, executionStages: { stage: "filter" } } ] } } }
  ```

  gives `SHARD_MERGE` (5 out) with two children: `SHARD` `sh1` (2 out, 2 keys, 2 docs) → `FETCH` (2 out) → `IXSCAN`
  (2 keys, `indexName: "a_1"`); and `SHARD` `sh2` (3 out, 38 docs) → `COLLSCAN`, taken from the `queryPlanner`. The
  verdict: the index `a_1`, COLLSCAN true, 1 rejected plan; the numbers: returned 5, documents examined 40.

Acceptance:

- [ ] The two worked examples give exactly these trees and verdicts.
- [ ] The Explain section shows, for the second, **COLLSCAN**, **index a_1** and **1 rejected plan**, and the rows
      `SHARD_MERGE`, `└ SHARD` with `shardName: "sh1"`, its plan, `└ SHARD` with `shardName: "sh2"`, its plan.
- [ ] A shard whose entry has neither stages nor a plan is a `SHARD` row with its name and no child.
- [ ] A shard without `shardName` is a `SHARD` row without details.
- [ ] On a collection that is not sharded, no `SHARD` row is shown.

### `explain.suggest-index` — The index that would serve a query

The keys of an index for a filter and a sort, by the rule of equality, sort, range.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/explain/suggest-index.ts › suggestedIndex(filter, sort)`
- **Uses**: used by `explain.show`, which offers it only when the explain has a COLLSCAN or an in-memory sort; by the
  Index advisor (`advisor.show`), the Monitor page (`monitor.show`) and the MCP server (`mcp.server`). Creating the
  index is `index.create`.
- **Ported from**: `src/shared/explain.ts` (`suggestIndex`, `RANGE_OPS`), `test/unit/explain.test.ts`.

Input: a filter and a sort, parsed. Output: the keys of the index with their directions, in order, or nothing.

Rules:

1. Only the fields at the top of the filter count; a key that starts with `$`, such as `$or`, `$and` or `$expr`, is
   skipped with everything inside it.
2. A field is an **equality** field when its condition is a value, of any type, `null` included; or has `$eq` or
   `$in`; or has `$elemMatch` and none of the range operators.
3. A field is a **range** field when its condition is a regular expression, or has one of `$gt`, `$gte`, `$lt`,
   `$lte`, `$ne`, `$nin`, `$regex`, `$exists`, `$not` and neither `$eq` nor `$in`.
4. A field with only other operators, such as `$size`, `$all` or `$type`, is left out.
5. The keys are: the equality fields in the order of the filter, each ascending; then the fields of the sort not
   already there, in the order of the sort, descending for `-1` and ascending otherwise; then the range fields not
   already there, in the order of the filter, each ascending.
6. With no key the result is nothing.

Worked examples (filter, sort → keys):

- `{ status: "paid", total: { $gte: 100 } }`, `{ createdAt: -1 }` → `{ status: 1, createdAt: -1, total: 1 }`.
- `{ age: { $gte: 18 }, status: "active", country: { $in: ["it", "fr"] } }`, `{ createdAt: -1 }` → `{ status: 1,
  country: 1, createdAt: -1, age: 1 }`.
- `{ status: "paid" }`, `{ status: -1, createdAt: -1 }` → `{ status: 1, createdAt: -1 }`: a field of both is kept
  once, as equality.
- `{ name: /^ma/i }`, no sort → `{ name: 1 }`.
- `{ name: /^a/, a: { $ne: 1 }, b: { $exists: true }, c: { $eq: 2 }, tags: { $elemMatch: { k: "x" } } }`, no sort →
  the keys `c`, `tags`, `name`, `a`, `b`.
- `{ a: { $gt: 1, $in: [1, 2] }, b: { $size: 2 }, c: { $all: [1] }, d: null }`, no sort → `{ a: 1, d: 1 }`.
- `{ $or: [{ a: 1 }, { b: 2 }], c: 1 }`, no sort → `{ c: 1 }`.
- `{ _id: ObjectId("0123456789abcdef01234567"), d: ISODate("2024-01-01T00:00:00Z") }`, no sort → `{ _id: 1, d: 1 }`.
- `{}`, `{ ts: -1 }` → `{ ts: -1 }`.
- `{ $expr: { $gt: ["$a", "$b"] } }`, no sort → nothing; `{}`, `{}` → nothing.

Acceptance:

- [ ] The worked examples give exactly these keys, in these orders.
- [ ] The suggestion for the filter `{ status: "paid", total: { $gte: 100 } }` and the sort `{ createdAt: -1 }`,
      created as an index, makes the explain of that query show no COLLSCAN and no in-memory sort.
- [ ] A pipeline that starts with `{ $match: { status: "paid" } }` and `{ $sort: { createdAt: -1 } }` gets `{ status:
      1, createdAt: -1 }`; one that starts with `$group` gets nothing.
- [ ] An explain with an index and no in-memory sort shows no suggestion, even when the index is not the one this rule
      would give.
- [ ] A filter that is not an object gives the keys of the sort alone.

### `explain.raw` — The raw output of an explain

Everything the server returned, for what the summary does not show.

- **Kind**: View
- **Engine**: MongoDB
- **Function**: `src/features/explain/raw.ts › view(state)`
- **Entry points**: **Raw** in the toolbar of the Explain section (`@toolbar`); **Summary** there goes back.
- **Offered when**: the section shows an explain that did not fail.
- **Uses**: `explain.run` (the output it keeps), `query.format`.
- **Ported from**: `src/webview/explainView.ts` (`render`, the Raw button), `src/webview/main.ts` (`jsonNode`).

What it shows: the output as a tree, in place of the summary.

- An object is a row with `{`, its fields under it and `}`; an array the same with `[` and `]`. A click on the row
  folds it, and it then reads its size, *3 fields* or *2 items*. The first three levels start unfolded, the deeper
  ones folded.
- A value is written in mongosh syntax and colored by its type, as in a document: `NumberLong(1200)`,
  `Timestamp({ t: 1700000000, i: 1 })`, `ISODate("2024-03-01T10:20:30.123Z")`; a Long stays a Long.
- The fields are in the order of the server; nothing is left out or cut.
- **Raw** and **Summary** switch without asking the server again, and the choice stays while the section shows other
  explains.

Acceptance:

- [ ] **Raw** on the explain of a find shows the fields `queryPlanner`, `executionStats` and `serverInfo` at the first
      level, in the server's order.
- [ ] `executionStats.executionStages.inputStage` and what is under it starts folded and reads its number of fields;
      a click unfolds it.
- [ ] **Summary** shows the summary again, the same as before, and the server receives nothing.
- [ ] The `rejectedPlans` that the summary only counts can be read here whole.
- [ ] A `$clusterTime` with a Timestamp and a binary signature is shown with their types.
- [ ] After an explain that failed, **Raw** is disabled.
