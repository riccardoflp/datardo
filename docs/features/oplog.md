# redis-oplog

Publishing the writes made in Datardo to Redis, as the Meteor package `cultofcoders:redis-oplog` does, so that the
publications of Meteor apps using it see them at once: which writes are published, the event and its channels, the
databases and collections a connection publishes, the playground's writes, and the warning when Redis fails.

A MongoDB connection publishes when the redis-oplog part of its connection form is filled in: the **linked
connection**, a saved Redis connection that receives the events (`connection.link-redis`), the **Channel prefix**,
the **Namespaces** of redis-oplog and the **Databases and collections**. That form and the linked connection shown
under the MongoDB connection in the connection island belong to the connection area; this file starts where a write
has been made. The events are sent with Datardo's Redis client, through the linked connection's address, TLS, SSH
tunnel and secrets. Whoever wants to see them arrive opens the linked connection's Pub/Sub page (`pubsub.show`).

A namespace here is redis-oplog's own: a name put before the collection in a channel (`tenant1::orders`), not a
namespace of keys.

### `oplog.publish` — Publish the events of a write to Redis

After a write to documents, sends one event per document changed to the channels redis-oplog listens on, so that a
Meteor app reads those documents again.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/oplog/publish.ts › plan(context, answers)`
- **Entry points**: none of its own. The runner calls it after the steps of every plan whose `publishes` is true
  (`runner.run`), and the playground after each write of a script (`oplog.playground-writes`).
- **Offered when**: the MongoDB connection has a linked connection, and the write's database and collection are among
  its **Databases and collections** (`oplog.scope`).
- **Reads**: before an update or a delete by filter, the `_id`s of the matching documents: those the undo history
  keeps when it records, otherwise `db.orders.find(<filter>, { _id: 1 })`. After an update whose fields aren't known
  (`oplog.updated-fields`), the documents by `_id`, `db.orders.find({ _id: { $in: [<1,000 ids>] } })`, in batches of
  1,000. After a delete that deleted fewer documents than it matched, `db.orders.find({ _id: { $in: [<1,000 ids>] }
  }, { _id: 1 })`, for those still there.
- **Plan**: to the linked connection, nothing to MongoDB: `PUBLISH <channel> <message>` for each channel of each
  event (`oplog.message`), sent in pipelines of at most 1,000 commands. A client is opened for it on first use, names
  itself with `CLIENT SETNAME datardo` (an error of that command is ignored), and is kept.
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to the MongoDB deployment and changes no key of the Redis one; a
  linked connection that is read-only still receives the events. A read-only MongoDB connection makes no writes to
  publish.
- **Undo**: Cannot be undone: an event sent can't be withdrawn. Undoing the write publishes the events of the undo
  (`undo.revert`).
- **After**: nothing is shown when the events are sent; a failure shows `oplog.publish-error`.
- **Refuses**: never refuses a write: the events go out in the background after it, and a Redis error doesn't fail
  it.
- **Uses**: `oplog.scope`, `oplog.message`, `oplog.updated-fields`, `oplog.changes`, `oplog.publish-error`,
  `connection.link-redis`, `connection.secrets`, `undo.revert`, `runner.run`, `pubsub.show`.
- **Ported from**: Mongoster's card oplog.publish; `src/redisOplog.ts` (`RedisOplog.sink`, `RedisOplog.publish`,
  `RedisOplog.enqueue`, `OplogSink`), `src/shared/oplog.ts`. Mongoster's own Redis client (`RedisConnection`,
  `parseRedisUrl`) is not ported: the linked connection and Datardo's client take its place.

Acceptance:

- [ ] These writes are published, on a connection that publishes and a collection among its databases and
  collections: `document.inline-edit`, `document.insert`, `document.delete`, `document.update-many`,
  `document.delete-many`, `document.restore-version`, `undo.revert` on documents, saving a document tab, inserting
  from a document tab, deleting the selected rows, the column actions (rename, remove and convert a field), and the
  playground's writes (`oplog.playground-writes`).
- [ ] An edit of `qty` in the document `"abc"` of `shop.orders`, with the prefix `app:` and the namespace `tenant1`,
  sends `PUBLISH app:orders {"e":"u","d":{"_id":"abc"},"f":["qty"]}`, then the same message to
  `app:tenant1::orders` and to `app:orders::abc`.
- [ ] An insert publishes `{ e: 'i', d: { _id } }` for each document inserted; a delete `{ e: 'r', d: { _id } }` for
  each document deleted.
- [ ] An update by operators publishes the fields of its operators (`oplog.updated-fields`) for each document it
  matched, when at least one was modified; an update pipeline with `$replaceWith` or `$project` publishes, for each
  document, its fields as they are after the update.
- [ ] A delete that deleted fewer documents than it matched publishes a removal only for those no longer in the
  collection.
- [ ] The events of one MongoDB connection go out in the order of the writes, also when they come from different
  collections.
- [ ] A connection without a linked connection, or a collection outside its databases and collections, publishes
  nothing and opens no client to Redis.
- [ ] One client is kept per MongoDB connection and reused; choosing another linked connection opens a new one;
  removing the MongoDB connection or unlinking it closes it.
- [ ] Publishing does not need the linked connection to be connected in the window, and does not change the state
  the window shows for it.
- [ ] A Redis that doesn't answer in 5 seconds gives the error *Redis \<host\>:\<port\> didn't answer in 5 seconds*; a
  linked connection that was removed gives *The linked connection is missing: choose it again in the connection.*;
  in both cases the write to MongoDB is done.
- [ ] A document whose `_id` can't be a Meteor id (not a string, an `ObjectId` or a number) publishes nothing.
- [ ] Not published: importing documents (`transfer.import`), generated documents (`transfer.generate`), copying a
  collection (`transfer.copy-collection`), restoring a backup (`backup.restore`), the writes of the comparison of two
  collections, GridFS, `$out` and `$merge`, `runCommand`, dropping collections.

### `oplog.scope` — Which databases and collections publish

The **Databases and collections** of the connection form, one pattern per line, decide which writes are published.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/oplog/scope.ts › inScope(patterns, database, collection)`
- **Inputs**: the patterns, the database and the collection of a write.
- **Output**: whether the write is published.
- **Rules**:
  1. No pattern (missing or empty): everything is published.
  2. A pattern without a dot is a database: it matches every collection of the databases it matches.
  3. A pattern with a dot is `<database>.<collection>`, split at the first dot: both parts must match. The collection
     part may contain dots.
  4. `*` matches any characters, also none; every other character is literal (`.`, `+`, `?` included). A pattern
     matches the whole name.
  5. One matching pattern is enough.
- **Uses**: `oplog.publish`; the tool `redis_oplog_status` of the MCP server says the same in words (`mcp.server`).
- **Ported from**: Mongoster's card oplog.scope; `src/shared/oplog.ts` (`inScope`), `test/unit/oplog.test.ts`.

Examples:

| Patterns | Database, collection | Published |
| --- | --- | --- |
| *(empty)* | `app`, `users` | yes |
| `app` | `app`, `users` / `other`, `users` | yes / no |
| `app.users` | `app`, `users` / `app`, `orders` | yes / no |
| `app.*` | `app`, `orders` | yes |
| `*.logs` | `any`, `logs` / `any`, `logs2` | yes / no |
| `app.users`, `shop` | `shop`, `x` | yes |
| `app.logs.2024` | `app`, `logs.2024` / `app`, `logsX2024` | yes / no |
| `a+b` | `a+b`, `c` / `aab`, `c` | yes / no |

Acceptance:

- [ ] Each row of the table above gives its result.
- [ ] A pattern never matches part of a name: `app` does not publish the database `apps`.

### `oplog.message` — The event of a document and its channels

What is sent for one document changed: the message redis-oplog expects, on the collection's channel, on its
namespaces and on the document's dedicated channel.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/oplog/message.ts › oplogMessage(settings, collection, event)`
- **Inputs**: the connection's **Channel prefix** and **Namespaces**, the collection's name, and an event: `{ e: 'i' |
  'r', id }` or `{ e: 'u', id, fields }`.
- **Output**: the channels and the message, or nothing.
- **Rules**:
  1. The Meteor id: a string, or a finite number, as it is; an `Int32` or a `Double` as a number; a `Long` as a
     number when it is a safe integer; an `ObjectId` as `{ $type: 'oid', $value: <24 hex> }`. Any other `_id` (`UUID`,
     a document, `null`, `NaN`, a `Long` beyond 2^53) has none, and nothing is sent.
  2. The message is JSON: `{ "e": "u", "d": { "_id": <id> }, "f": [<fields>] }` for an update, `{ "e": "i" | "r", "d":
     { "_id": <id> } }` for an insert or a removal.
  3. The channels, in this order: `<collection>`; `<namespace>::<collection>` for each namespace; the dedicated
     channel `<collection>::<idStringify(id)>`. The prefix (redis-oplog's `globalRedisPrefix`) goes before each one.
     The database is not part of any channel.
  4. `idStringify` is Meteor's `MongoID.idStringify`: an `ObjectId` is its hex; a string is itself, with `-` before it
     when it starts with `-`, `~` or `{`, or is 24 hexadecimal characters; an empty string stays empty; a number is `~`
     and its JSON (`~5`).
- **Uses**: `oplog.publish`.
- **Ported from**: Mongoster's card oplog.message; `src/shared/oplog.ts` (`oplogMessage`, `meteorId`, `idStringify`),
  `test/unit/oplog.test.ts`.

Examples:

| Settings, collection, event | Channels | Message |
| --- | --- | --- |
| prefix `p:`, namespaces `ns1`, `ns2`; `users`; `u` of `'abc'`, fields `a`, `b.c` | `p:users`, `p:ns1::users`, `p:ns2::users`, `p:users::abc` | `{"e":"u","d":{"_id":"abc"},"f":["a","b.c"]}` |
| none; `users`; `i` of `ObjectId("0123456789abcdef01234567")` | `users`, `users::0123456789abcdef01234567` | `{"e":"i","d":{"_id":{"$type":"oid","$value":"0123456789abcdef01234567"}}}` |
| none; `c`; `r` of `3` | `c`, `c::~3` | `{"e":"r","d":{"_id":3}}` |
| none; `c`; `i` of `{ a: 1 }` | — | nothing |

`idStringify`: `'abc'` → `abc`; `'-x'` → `--x`; `'~x'` → `-~x`; `'{x'` → `-{x`; `'0123456789abcdef01234567'` →
`-0123456789abcdef01234567`; `5` → `~5`.

Acceptance:

- [ ] Each row and example above gives its result.
- [ ] A `Long` of 9007199254740993 as `_id` sends nothing; a `Long` of 42 sends the number `42`.

### `oplog.updated-fields` — The fields an update changes

The `f` of an update event: the fields a Meteor app reads again, computed as redis-oplog's `getFields` does.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/oplog/updated-fields.ts › updatedFields(update)`, and `documentFields(...documents)` in
  the same module.
- **Inputs**: an update: a document of operators, a replacement document or an update pipeline.
- **Output**: the fields, or nothing when they can't be known.
- **Rules** of `updatedFields`:
  1. An update by operators: the keys of every operator's body; for `$rename`, also its new names.
  2. A replacement document: its keys.
  3. A path is cut at its first part that is a number or starts with `$` (`items.1.qty`, `tags.$`, `list.$[el].v` →
     `items`, `tags`, `list`); a part that only contains digits after other characters is not a position (`a.b1`,
     `a.1b`).
  4. An update pipeline: the keys of `$set` and `$addFields`, the names of `$unset` (a string or an array); any other
     stage (`$project`, `$replaceWith`, …) gives nothing: the fields aren't known, and the caller uses
     `documentFields` of the documents instead.
  5. `_id` is never a field; each field once, in the order met; no update gives no fields.
- **Rules** of `documentFields`: every key of the documents given, once, but `_id`; `null` and missing documents are
  skipped.
- **Uses**: `oplog.publish`, `oplog.changes`, `oplog.playground-writes`.
- **Ported from**: Mongoster's card oplog.updated-fields; `src/shared/oplog.ts` (`updatedFields`, `documentFields`),
  `test/unit/oplog.test.ts`.

Examples:

| Update | Fields |
| --- | --- |
| `{ $set: { a: 1, b: 2 }, $inc: { n: 1 }, $unset: { c: '' }, $setOnInsert: { _id: 1 } }` | `a`, `b`, `n`, `c` |
| `{ $set: { 'address.city': 'x', 'items.1.qty': 2, 'tags.$': 'y', 'list.$[el].v': 1, 'a.b.0': 1 } }` | `address.city`, `items`, `tags`, `list`, `a.b` |
| `{ $rename: { old: 'new', 'a.b': 'c.d', 'list.0': 'x' } }` | `old`, `a.b`, `list`, `new`, `c.d`, `x` |
| `{ _id: 1, name: 'x', age: 3 }` | `name`, `age` |
| `[{ $set: { a: 1 } }, { $addFields: { 'b.c': 2 } }, { $unset: ['d', 'e.1'] }, { $unset: 'f' }]` | `a`, `b.c`, `d`, `e`, `f` |
| `[{ $set: { a: 1 } }, { $replaceWith: '$b' }]` | not known |
| `{}`, no update, `[]` | none |

`documentFields({ _id: 1, a: 1, b: 2 }, { _id: 1, b: 3, c: 4 }, null)` → `a`, `b`, `c`.

Acceptance:

- [ ] Each row and example above gives its result.
- [ ] `{ $set: { 'a.b1': 1, 'a.1b': 2 } }` gives `a.b1` and `a.1b`, uncut.

### `oplog.changes` — The events of a write from the documents before and after

For writes whose effect isn't known in advance (restoring a version, an undo, a playground `bulkWrite`), the events
come from the documents they may have touched, read by `_id` before and after.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/oplog/changes.ts › changeEvents(before, after)`
- **Inputs**: the documents before, the documents after, each by `_id`.
- **Output**: the events, which `oplog.publish` then sends.
- **Rules**:
  1. A document after whose `_id` wasn't before: an insert.
  2. A document before whose `_id` isn't after: a removal.
  3. A document in both: an update with the fields (`documentFields` of both) whose values differ, compared as
     canonical Extended JSON; none when nothing differs.
  4. A document after that appears twice counts once. Inserts and updates come in the order of the documents after,
     then the removals.
- **Uses**: `oplog.publish`, `oplog.updated-fields`, `undo.revert`, `document.restore-version`,
  `oplog.playground-writes`.
- **Ported from**: Mongoster's card oplog.changes; `src/redisOplog.ts` (`OplogSink.changes`), `src/history.ts`,
  `src/docHistory.ts`, `src/playground/oplogWrites.ts`.

Examples:

| Before | After | Events |
| --- | --- | --- |
| `[{ _id: 1, a: 1 }, { _id: 2, a: 1 }]` | `[{ _id: 1, a: 2, b: 1 }, { _id: 3 }]` | `u` of 1 with `a`, `b`; `i` of 3; `r` of 2 |
| `[{ _id: 1, a: 1 }]` | `[{ _id: 1, a: 1 }]` | none |
| `[{ _id: 1, n: Int32(1) }]` | `[{ _id: 1, n: Double(1) }]` | `u` of 1 with `n` |
| `[]` | `[{ _id: 4 }, { _id: 4 }]` | `i` of 4, once |

Acceptance:

- [ ] Each row of the table above gives its events.

### `oplog.playground-writes` — Publish the playground's writes

The writes of a playground script are published like the others, and those of a transaction only once it commits.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/oplog/playground-writes.ts › plan(context, answers)`
- **Entry points**: none of its own: running a playground (`playground.run`), when the script writes.
- **Offered when**: the playground's connection publishes and the written collection is among its databases and
  collections, whatever the database the script uses (`db.getSiblingDB`, `session.getDatabase`).
- **Reads**: before a write of one document (`updateOne`, `replaceOne`, `deleteOne`, `findOneAndUpdate`,
  `findOneAndReplace`, `findOneAndDelete`), `findOne(<filter>)` with the write's `sort`, for its `_id` (the whole
  document for a replacement); before `updateMany` and `deleteMany`, the `_id`s of the matching documents; for
  `bulkWrite`, the documents each operation may touch, before and after. With a session in the write's options, these
  reads run in it, so a transaction sees its own writes.
- **Plan**: the script's write, restricted to the document found: its filter with `_id: <found>` (inside `$and` when
  the filter already has `_id`), as redis-oplog does; unchanged when nothing was found (an upsert). Then the
  `PUBLISH` commands of `oplog.publish`.
- **Danger**: None of its own: what a playground asks before a write is on `playground.run`.
- **Read-only**: Refused on a read-only connection by the playground itself, so nothing is published; read-only
  transactions work.
- **Undo**: Cannot be undone from the undo history: the playground's writes aren't recorded.
- **Publishes**: Published for redis-oplog (`oplog.publish`): this card is how.
- **After**: nothing more than the playground's result.
- **Uses**: `oplog.publish`, `oplog.changes`, `oplog.updated-fields`, `playground.run`.
- **Ported from**: Mongoster's card oplog.playground-writes; `src/playground/oplogWrites.ts` (`publishedWrites`),
  `src/playground/shell.ts`, `src/redisOplog.ts` (`OplogSink.deferred`), `test/integration/shell.test.ts`,
  `test/integration/transactions.test.ts`.

Acceptance:

- [ ] `insertOne({ _id: 10 })` and `insertMany([{ _id: 11 }, { _id: 12 }])` publish inserts of 10, 11 and 12;
  `insertOne({ x: 1 })` publishes an insert with the `ObjectId` the driver gave it.
- [ ] An ordered `insertMany([{ _id: 20 }, { _id: 1 }, { _id: 21 }])` failing on `_id` 1 publishes only the insert
  of 20.
- [ ] `updateOne({ n: { $gte: 2 } }, { $set: { name: "B", "tags.0": "y" }, $inc: { n: 1 } }, { sort: { n: -1 } })`
  changes only the document found first in that order, and publishes an update of it with the fields `name`, `tags`,
  `n`.
- [ ] An update that modifies nothing publishes nothing; an upsert publishes an insert of the new `_id`.
- [ ] `updateMany` and `deleteMany` publish one event for each document they matched.
- [ ] `replaceOne` publishes the fields of the document before and after, added or removed.
- [ ] `findOneAndUpdate`, `findOneAndDelete` and an upserting `findOneAndReplace` publish an update, a removal and an
  insert.
- [ ] `bulkWrite` publishes the events of `oplog.changes` for the documents it touched, also when some operations
  failed.
- [ ] In a transaction, nothing is published before the commit; after `commitTransaction()` the events go out in the
  order of the writes; after `abortTransaction()`, a failed commit, or a session ended with its transaction open,
  nothing is published.
- [ ] With `withTransaction`, a callback that is tried again publishes only the events of the attempt that committed.
- [ ] Without a linked connection, the writes run unchanged and nothing is published.

### `oplog.publish-error` — The warning when Redis fails

Tells the user that a write was saved but couldn't be published, without repeating it at every write.

- **Kind**: View
- **Engine**: MongoDB
- **Function**: `src/features/oplog/publish-error.ts › view(state)`
- **Entry points**: none: a warning that `runner.notify` draws when the events of a published write can't be sent:
  Redis not reachable, a refused `AUTH`, an error reply, the linked connection missing.
- **Offered when**: at most once every 30 seconds for each MongoDB connection; the errors in between are only kept as
  the connection's last error, which the tool `redis_oplog_status` of the MCP server reports (`mcp.server`).
- **Uses**: `oplog.publish`, `runner.notify`, `connection.link-redis`.
- **Ported from**: Mongoster's card oplog.publish-error; `src/redisOplog.ts` (`RedisOplog.warn`,
  `RedisOplog.lastError`).

The warning is *The change was saved, but couldn't be published to Redis for redis-oplog (\<connection name\>):
\<error\>*, where the name is the MongoDB connection's. The error never holds the linked connection's connection
string or its password. The events of the failed batch are not sent again; the next write opens a new client.

Acceptance:

- [ ] With Redis stopped, an edit is saved in MongoDB and the warning names the connection and the error.
- [ ] Ten edits within 30 seconds with Redis stopped show one warning; an edit 30 seconds after the warning shows it
  again.
- [ ] Two MongoDB connections failing at the same time each show their warning.
- [ ] The warning never contains the linked connection's connection string or password.
- [ ] Once Redis answers again, the next write is published without restarting Datardo.
- [ ] A linked connection removed since gives the warning with *The linked connection is missing: choose it again in
  the connection.*
