# Column actions

Changing one field in the documents matching the filter of the query bar, from the menu of its column header in the
table: **Rename field…**, **Remove field…** and **Convert type…**. Which documents each one touches and the update it
sends are derivations with cards of their own below; the three operations ask, count, confirm and then write as
**Update many** does (`document.update-many`): undo history, redis-oplog, the wording for an empty filter.

Common to the three operations:

- **Where**: in the Documents section of a collection tab, in **Find**, on a collection that can be changed (not a
  view, not a collection of a read-only connection), on any column but `_id` and its sub-fields. The filter of the
  query bar must parse, otherwise *Invalid query syntax — check the highlighted field.* and nothing is asked; when it
  differs from the last query run, the query runs first (`query.run`), so that the table shows the documents
  concerned.
- **Scope**: the documents matching the filter of the query bar; with an empty filter, the whole collection. The
  texts say *of `<collection>`* for an empty filter and *matching the filter* otherwise: this is `<scope>` below.
- **Confirmation**: one confirmation, with the number of documents, the step exactly as it is sent, the notes of
  the card, and the line that says whether it can be undone (`undo.note`). With an empty filter it adds *The
  filter is empty, so every document of the collection is affected.* and its button reads **`<Action>` in all**.
  The line on undo is the one `undo.note` gives, word for word: with more documents than
  `datardo.undo.maxDocumentsPerOperation`, *This can't be undone: the undo history keeps operations of up to 10,000
  documents.* The size of the documents is known only while they are read: when it passes
  `datardo.undo.maxOperationSizeMb` then, `undo.record` asks whether to go on without the possibility to undo, before
  anything is written.
- **What is kept for undo**: the plan's `undo: { keeps }` names the documents matching the filter the step sends,
  which is the filter of the query bar narrowed to the documents the card changes, and carries `written`, the filter
  as written in the query bar. So `undo.record` can ask for the collection's name when the written filter is empty
  and the documents pass a limit while they are read (D39), although the filter sent is never empty.
- **An empty filter that cannot be undone** (D39): the three operations are *destructive* when both hold: the filter
  of the query bar is empty, that is `{}` once parsed, blank text included, and `undo.note` says the write will not
  be recorded (the undo history is off in the settings or for the connection, or the number of documents is over a
  limit of the undo history). The confirmation then also asks *Type `<collection>` to confirm*, the name of the
  collection, and its button is disabled until it is typed. In every other case they stay *confirm*: an empty filter
  whose write will be recorded, and a filter that is not empty, also when its write cannot be undone. The rule reads
  the filter as written in the query bar: not what it matches (`{ _id: { $exists: true } }` is not empty), and not
  the filter of the step, which always adds the condition on the field.
- **Counts**: each count is a `countDocuments` with `maxTimeMS` 60,000.
- **Errors of the server** are shown in a notification, and the table runs its query again.

### `field.rename` — Rename a field

Renames a field, or moves it to another field path, in the documents matching the filter.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/field/rename.ts › plan(context, answers)`
- **Entry points**: **Rename field…** in the menu of a column header (`@column-menu`), with the tooltip *$rename in
  the documents matching the filter*. Go to: **Rename field…**, on the column of the selected cell.
- **Offered when**: see *Where* above.
- **Asks**: the new name, in a dialog titled **Rename `<field>`**, with the prompt *New name of `<field>` in the
  documents `<scope>` (a dotted path moves it into a sub-document)*, the current name with its last part selected,
  and the checks of `field.path-rules` as the text is typed.
- **Reads**: three counts: the documents to rename, those that have the field (through arrays or not), those that
  already have the new name (`field.rename-plan`); whether the documents fit the undo history (`undo.limits`).
- **Plan**: `db.people.updateMany({ $and: [ { kind: "x" }, { name: { $exists: true } } ] }, { $rename: { name:
  "fullName" } })`, with the filter of `field.rename-plan`.
- **Danger**: Confirm: *Rename `<field>` to `<new name>` in `<n>` documents `<scope>`?*, with *`<k>` documents
  already have `<new name>`: its value is replaced by that of `<field>`.* (*1 document already has …*) and *`<k>`
  documents with `<field>` or `<new name>` inside an array are left out: $rename can't go through arrays.* (*1
  document … is left out …*) when they apply; button **Rename**, or **Rename in all** with an empty filter. A value
  already at the new name is replaced. Destructive (D39) when the filter of the query bar is empty and `undo.note`
  says the rename will not be recorded: the confirmation then also asks *Type `<collection>` to confirm*, the name
  of the collection, and **Rename in all** is disabled until it is typed. In every other case it stays Confirm.
- **Read-only**: Refused on a read-only connection (`/read-only`) and on a view (`/view`); the menu has no entry
  there.
- **Undo**: Recorded in the undo history (`undo.record`) as *Rename field `<field>` to `<new name>`*, followed by
  * where `<filter>`* when there is a filter (the whole cut at 300 characters), up to
  `datardo.undo.maxDocumentsPerOperation` documents and `datardo.undo.maxOperationSizeMb`. The confirmation carries
  the line of `undo.note`. The plan's `undo: { keeps }` names the documents matching the filter of
  `field.rename-plan` and carries `written`, the filter of the query bar (see *What is kept for undo* above).
- **Publishes**: Published for redis-oplog (`oplog.publish`): an update of each renamed document, with the old and
  the new name as its fields.
- **After**: a notification *Renamed `<field>` to `<new name>` in `<k>` documents of `<collection>`.* (`k` modified;
  *1 document*), with **Undo** when recorded; the column keeps its place, width, pin and visibility under the new
  name, and the expanded columns follow (`field.layout-follows`); the table runs its query again.
- **Refuses**: *The connection `<name>` is read-only.* (`/read-only`); *Views are read-only.* (`/view`); *`<field>`:
  `<reason>`.* when the field path cannot be changed (`/invalid-path`, `field.path-rules`); on a field of the
  elements of an expanded array, *items[].sku is a field of the elements of the array items: $rename can't change
  fields inside arrays.* with *Use Update many with a pipeline that rewrites the array, e.g. [ { $set: { items: {
  $map: { input: "$items", in: … } } } } ].* (`/array-element`); when no document has the field, *No document
  `<scope>` has `<field>`.*, followed by the documents left out, if any (`/no-field`); *Invalid query syntax — check
  the highlighted field.* (`/invalid-filter`).
- **Commands**: `field.rename`
- **Settings**: `datardo.undo.enabled`, `datardo.undo.maxDocumentsPerOperation`, `datardo.undo.maxOperationSizeMb`.
- **Uses**: `field.path-rules`, `field.rename-plan`, `field.array-guard`, `field.layout-follows`,
  `document.update-many`, `query.bar`, `query.parse`, `query.run`, `runner.ask`, `runner.confirm`, `runner.notify`,
  `undo.note`, `undo.record`, `undo.limits`, `undo.notification`, `oplog.publish`, `connection.read-only`.
- **Ported from**: field.rename; `src/collectionPanel.ts` (`fieldAction`, `writeMany`), `src/fieldActions.ts`
  (`renameField`, `renameError`, `fieldPathError`), `src/webview/main.ts` (`fieldItems`, `fieldAction`,
  `fieldChanged`).

Acceptance:

- [ ] With the filter `{ kind: "x" }`, renaming `name` to `fullName` asks *Rename name to fullName in 3 documents
  matching the filter?*, says *1 document already has fullName: its value is replaced by that of name.*, and renames
  it in those 3 only.
- [ ] The confirmation shows the `updateMany` with `{ $rename: { name: "fullName" } }` exactly as it is sent.
- [ ] Renaming `addr.city` to `city` moves it out of `addr` where `addr` is a sub-document, and leaves out, and
  counts in the confirmation, a document where `addr` is an array.
- [ ] Renaming `a` to `a.b` or `a.b` to `a` is refused in the dialog as on the same path; the same name asks for a
  different one.
- [ ] With an empty filter on `people`, the undo history on and the documents under its limits, the confirmation
  reads *Rename name to fullName in `<n>` documents of people?* with *The filter is empty, so every document of the
  collection is affected.*, *It can be undone from the Undo history.* and the button **Rename in all**; it has no
  field to type; closing it writes nothing.
- [ ] With an empty filter and `datardo.undo.enabled` off, the same confirmation says *The undo history is off for
  this connection: this can't be undone.* and asks *Type people to confirm*: **Rename in all** is disabled until the
  field holds `people`, compared with case.
- [ ] With the filter `{ kind: "x" }` and the undo history off, the confirmation says *The undo history is off for
  this connection: this can't be undone.*, has no field to type, and its button is **Rename**.
- [ ] After the rename the column `fullName` has the width, place and pin `name` had.
- [ ] **Rename field…** on `items[].sku` writes nothing and says to use **Update many** with `$map`.
- [ ] When no document matching the filter has the field, it says *No document matching the filter has name.* and
  asks nothing more.
- [ ] The rename is in the undo history as *Rename field name to fullName where { kind: "x" }*, and undoing it gives
  back `name`.
- [ ] On a connection that publishes for redis-oplog, each renamed document publishes
  `{ e: 'u', d: { _id }, f: ['name', 'fullName'] }`.
- [ ] On a view, on a read-only connection and in **Aggregate** the header's menu has no **Rename field…**.

### `field.remove` — Remove a field

Removes a field from the documents matching the filter, also from every element of an expanded array.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/field/remove.ts › plan(context, answers)`
- **Entry points**: **Remove field…** in the menu of a column header (`@column-menu`), with the tooltip *$unset in
  the documents matching the filter*. Go to: **Remove field…**, on the column of the selected cell.
- **Offered when**: see *Where* above; also on a field of the elements of an expanded array (`items[].sku`).
- **Asks**: nothing but the confirmation.
- **Reads**: two counts: the documents to change, and those that have the field (`field.remove-plan`); whether the
  documents fit the undo history (`undo.limits`).
- **Plan**: `db.people.updateMany({ tmp: { $exists: true } }, { $unset: { tmp: "" } })`, or with
  `{ $unset: { "items.$[].sku": "" } }` for a field of the elements of an array, with the filter of
  `field.remove-plan`.
- **Danger**: Confirm: *Remove `<field>` from `<n>` documents `<scope>`?*, or for a field of the elements of an array
  *Remove items[].sku from the elements of items in `<n>` documents `<scope>`?*, with the documents left out when
  there are any (*`<k>` documents where `<field>` is inside an array are left out: remove it from the elements with
  Update many and $[].*, or *`<k>` documents where items isn't an array are left out.*); button **Remove**, or
  **Remove in all** with an empty filter. The values of the field are gone. Destructive (D39) when the filter of the
  query bar is empty and `undo.note` says the removal will not be recorded: the confirmation then also asks *Type
  `<collection>` to confirm*, the name of the collection, and **Remove in all** is disabled until it is typed. In
  every other case it stays Confirm.
- **Read-only**: Refused on a read-only connection (`/read-only`) and on a view (`/view`).
- **Undo**: Recorded in the undo history (`undo.record`) as *Remove field `<field>`* (`items[].sku` for a field of
  the elements of an array), followed by * where `<filter>`* when there is a filter, within the limits. The
  confirmation carries the line of `undo.note`. The plan's `undo: { keeps }` names the documents matching the filter
  of `field.remove-plan` and carries `written`, the filter of the query bar (see *What is kept for undo* above).
- **Publishes**: Published for redis-oplog (`oplog.publish`): an update of each changed document, with the field
  cut at the array (`items.$[].sku` gives `items`).
- **After**: a notification *Removed `<field>` from `<k>` documents of `<collection>`.*, with **Undo** when recorded;
  the field's columns leave the layout (hidden, order, pins, widths) and the expanded columns
  (`field.layout-follows`); the table runs its query again.
- **Refuses**: *The connection `<name>` is read-only.* (`/read-only`); *Views are read-only.* (`/view`); *`<field>`:
  `<reason>`.* (`/invalid-path`); *No document `<scope>` has `<field>`.*, followed by the documents left out, if any
  (`/no-field`); *Invalid query syntax — check the highlighted field.* (`/invalid-filter`).
- **Commands**: `field.remove`
- **Settings**: `datardo.undo.enabled`, `datardo.undo.maxDocumentsPerOperation`, `datardo.undo.maxOperationSizeMb`.
- **Uses**: `field.path-rules`, `field.remove-plan`, `field.array-guard`, `field.layout-follows`,
  `document.update-many`, `query.bar`, `query.parse`, `query.run`, `runner.confirm`, `runner.notify`, `undo.note`,
  `undo.record`, `undo.limits`, `undo.notification`, `oplog.publish`, `connection.read-only`.
- **Ported from**: field.remove; `src/collectionPanel.ts` (`fieldAction`, `writeMany`), `src/fieldActions.ts`
  (`removeField`, `fieldPathError`), `src/webview/main.ts` (`fieldItems`, `fieldChanged`).

Acceptance:

- [ ] Removing `tmp` removes it from every matching document, also where it is `null`.
- [ ] Removing `meta.a` removes it where `meta` is a sub-document and leaves out, and counts, a document where
  `meta` is an array.
- [ ] Removing `items[].sku` asks *Remove items[].sku from the elements of items in `<n>` documents …?*, runs
  `{ $unset: { "items.$[].sku": "" } }`, removes `sku` from every element of `items`, and leaves out a document where
  `items` is not an array.
- [ ] Closing the confirmation writes nothing.
- [ ] With an empty filter on `people`, the undo history on and the documents under its limits, the confirmation
  *Remove tmp from `<n>` documents of people?* has the button **Remove in all** and no field to type.
- [ ] With an empty filter and `datardo.undo.enabled` off, the same confirmation says *The undo history is off for
  this connection: this can't be undone.* and asks *Type people to confirm*: **Remove in all** is disabled until the
  field holds `people`, compared with case.
- [ ] With the filter `{ kind: "x" }` and the undo history off, the confirmation says *The undo history is off for
  this connection: this can't be undone.*, has no field to type, and its button is **Remove**.
- [ ] After the removal the column `tmp` is no longer in the table's layout.
- [ ] The removal is in the undo history as *Remove field tmp*, and undoing it puts the values back.
- [ ] On a connection that publishes for redis-oplog, each changed document publishes an update with the field;
  removing `items[].sku` publishes `f: ['items']`.
- [ ] On a view and on a read-only connection the header's menu has no **Remove field…**.

### `field.convert-type` — Convert the type of a field

Converts the values of a field to another BSON type with `$convert`, keeping the values that cannot be converted.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/field/convert-type.ts › plan(context, answers)`
- **Entry points**: **Convert type…** in the menu of a column header (`@column-menu`), with the tooltip *Convert the
  values ($convert) in the documents matching the filter*. Go to: **Convert type…**, on the column of the selected
  cell.
- **Offered when**: see *Where* above; on a field of the elements of an array it is refused (below).
- **Asks**: the type, in a list to pick from titled **Convert `<field>`**, with the line *Type to convert the values
  to · now: `<type>` `<n>` · `<type>` `<n>`* (the current types, most frequent first; without them when counting
  fails or takes more than 30 seconds), listing `string`, `int`, `long`, `double`, `decimal`, `bool`, `date` and
  `objectId` with their descriptions (`field.convert-plan`).
- **Reads**: the types of the field (`field.type-counts`, an `aggregate` with `maxTimeMS` 30,000); two counts: the
  values to convert, with and without the array guard; whether the documents fit the undo history (`undo.limits`);
  after the write, the count of the values still not converted.
- **Plan**: `db.people.updateMany({ v: { $exists: true, $not: { $type: ["int", "null", "array"] } } }, [ { $set: { v:
  { $convert: { input: "$v", to: "int", onError: "$v", onNull: "$v" } } } } ])`, with the filter of
  `field.convert-plan`.
- **Danger**: Confirm: *Convert `<field>` to `<type>` in `<n>` documents `<scope>`?*, with *Values that can't be
  converted keep their value and type; null and arrays are left as they are.* and, when it applies, *`<k>` documents
  where `<field>` is inside an array are left out.*; button **Convert**, or **Convert in all** with an empty filter.
  A converted value loses its old type (`7.9` to `int` is `7`). Destructive (D39) when the filter of the query bar
  is empty and `undo.note` says the conversion will not be recorded: the confirmation then also asks *Type
  `<collection>` to confirm*, the name of the collection, and **Convert in all** is disabled until it is typed. In
  every other case it stays Confirm.
- **Read-only**: Refused on a read-only connection (`/read-only`) and on a view (`/view`).
- **Undo**: Recorded in the undo history (`undo.record`) as *Convert field `<field>` to `<type>`*, followed by
  * where `<filter>`* when there is a filter, within the limits. The confirmation carries the line of `undo.note`.
  The plan's `undo: { keeps }` names the documents matching the filter of `field.convert-plan` and carries `written`,
  the filter of the query bar (see *What is kept for undo* above).
- **Publishes**: Published for redis-oplog (`oplog.publish`): an update of each converted document, with the field.
- **After**: a notification *Converted `<field>` to `<type>` in `<k>` documents of `<collection>`.*, followed by
  * `<j>` values couldn't be converted and kept their type.* (*1 value couldn't be converted and kept its type.*)
  when some are left, with **Undo** when recorded; the table runs its query again.
- **Refuses**: *The connection `<name>` is read-only.* (`/read-only`); *Views are read-only.* (`/view`); *`<field>`:
  `<reason>`.* (`/invalid-path`); on a field of the elements of an array, *items[].sku is a field of the elements of
  the array items: Convert type can't change fields inside arrays.* with the same advice on **Update many** and
  `$map` as `field.rename` (`/array-element`); when nothing needs converting, *No value of `<field>` `<scope>` needs
  converting to `<type>`: null, missing values and arrays are left as they are.* (`/nothing-to-convert`); *Invalid
  query syntax — check the highlighted field.* (`/invalid-filter`).
- **Commands**: `field.convert-type`
- **Settings**: `datardo.undo.enabled`, `datardo.undo.maxDocumentsPerOperation`, `datardo.undo.maxOperationSizeMb`.
- **Uses**: `field.path-rules`, `field.convert-plan`, `field.type-counts`, `field.array-guard`,
  `document.update-many`, `query.bar`, `query.parse`, `query.run`, `runner.ask`, `runner.confirm`, `runner.notify`,
  `undo.note`, `undo.record`, `undo.limits`, `undo.notification`, `oplog.publish`, `connection.read-only`.
- **Ported from**: field.convert-type; `src/collectionPanel.ts` (`fieldAction`, `writeMany`), `src/fieldActions.ts`
  (`convertField`, `typeCounts`, `CONVERT_TYPES`), `src/webview/main.ts` (`fieldItems`).

Acceptance:

- [ ] On `v` with the values `"42"`, `7.9`, `"not a number"`, `null`, `[1, 2]` and `Int32(5)`, the list shows the
  current types; converting to `int` asks about 3 documents, makes `"42"` `Int32(42)` and `7.9` `Int32(7)`, keeps
  `"not a number"`, `null` and the array, and ends with *… 1 value couldn't be converted and kept its type.*
- [ ] Converting to `long`, `decimal`, `string`, `date` and `objectId` gives a `Long`, a `Decimal128`, a string, a
  date from ISO text and an `ObjectId` from 24 hexadecimal characters.
- [ ] Converting `nested.n` leaves out, and counts, a document where `nested` is an array.
- [ ] When every value already has the type, nothing is written and it says *No value of v matching the filter needs
  converting to int: null, missing values and arrays are left as they are.*
- [ ] When counting the types takes more than 30 seconds, the list opens without the *now:* part.
- [ ] **Convert type…** on `items[].qty` writes nothing.
- [ ] With an empty filter on `people`, the undo history on and the documents under its limits, the confirmation
  *Convert v to int in `<n>` documents of people?* has the button **Convert in all** and no field to type.
- [ ] With an empty filter and `datardo.undo.enabled` off, the same confirmation says *The undo history is off for
  this connection: this can't be undone.* and asks *Type people to confirm*: **Convert in all** is disabled until
  the field holds `people`, compared with case.
- [ ] With the filter `{ kind: "x" }` and the undo history off, the confirmation says *The undo history is off for
  this connection: this can't be undone.*, has no field to type, and its button is **Convert**.
- [ ] The conversion is in the undo history as *Convert field v to int*, and undoing it gives back the old values
  and types.
- [ ] On a connection that publishes for redis-oplog, each converted document publishes an update with the field.
- [ ] On a view and on a read-only connection the header's menu has no **Convert type…**.

### `field.path-rules` — Which fields a column action can change

Decides whether a field path can be changed by a column action, and whether a new name is acceptable for a rename.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/field/path-rules.ts › fieldPathError(path)` and `› renameError(from, to)`
- **Uses**: used by `field.rename` (the field, and the new name as it is typed), `field.remove` and
  `field.convert-type`.
- **Ported from**: field.path-rules; `src/fieldActions.ts` (`fieldPathError`, `renameError`).

Rules of `fieldPathError` (nothing means acceptable):

1. Empty: *Enter a field name*.
2. A part between dots is empty: *"`<path>`" has an empty part: write names separated by single dots*.
3. A part starts with `$`: *Field names can't start with $*.
4. The first part is `_id`: *_id can't be changed*.

Rules of `renameError`: the rules above on the new name; the same name: *Enter a different name*; one field path
inside the other: *`<from>` and `<to>` are on the same path: a field can't be moved inside itself or its parent*.

Examples:

| Input | Result |
| --- | --- |
| `fieldPathError('a..b')`, `fieldPathError('a.')` | an empty part |
| `fieldPathError('$a')`, `fieldPathError('a.$b')` | *Field names can't start with $* |
| `fieldPathError('_id')`, `fieldPathError('_id.x')` | *_id can't be changed* |
| `fieldPathError('a._id')`, `fieldPathError('address.city')` | acceptable |
| `renameError('a', 'a')` | *Enter a different name* |
| `renameError('a', 'a.b')`, `renameError('a.b', 'a')` | on the same path |
| `renameError('a', 'ab')`, `renameError('a.b', 'c.d')` | acceptable |
| `renameError('a', '')` | *Enter a field name* |

Acceptance:

- [ ] Each row of the table above gives its result.
- [ ] A new name with spaces around it is checked without them.

### `field.array-guard` — Leave out the documents where a parent is an array

An update by field path cannot go through an array: `$rename` fails on the whole update, `$unset` does nothing,
`$set` would write into every element. The column actions leave such documents out, and count them to say so.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/field/array-guard.ts › noArrayParents(path)` and `› and(...parts)`
- **Uses**: used by `field.rename-plan`, `field.remove-plan`, `field.convert-plan` and `field.type-counts`.
- **Ported from**: field.array-guard; `src/fieldActions.ts` (`noArrayParents`, `and`).

Rules:

1. `noArrayParents(path)` gives one condition `{ <parent>: { $not: { $type: "array" } } }` for each parent of the
   field path, from the outermost; none for a top-level field.
2. `and(...)` drops the empty conditions: none left is `{}`, one is itself, more are `{ $and: [ … ] }`.

Examples:

| Input | Result |
| --- | --- |
| `noArrayParents('a')` | `[]` |
| `noArrayParents('a.b.c')` | `[{ a: { $not: { $type: "array" } } }, { "a.b": { $not: { $type: "array" } } }]` |
| `and({}, {})` | `{}` |
| `and({ a: 1 }, {})` | `{ a: 1 }` |
| `and({ a: 1 }, { b: 2 })` | `{ $and: [{ a: 1 }, { b: 2 }] }` |

Acceptance:

- [ ] Each row of the table above gives its result.
- [ ] `$rename` of `addr.city` with the guard succeeds on a collection where one document has `addr` as an array,
  and fails without it.

### `field.rename-plan` — Which documents a rename touches

The filter and the update of **Rename field…**, and the filters that count what it overwrites and what it leaves
out.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/field/rename-plan.ts › renamePlan(filter, from, to)`
- **Uses**: `field.array-guard`. Used by `field.rename`.
- **Ported from**: field.rename-plan; `src/fieldActions.ts` (`renameField`).

Inputs: the user's filter, the field, the new name. Output: `{ filter, update, reached, overwrites }`.

Rules:

1. `reached`: the user's filter and `{ <from>: { $exists: true } }`.
2. `filter`: `reached`, and the array guard of both `from` and `to` (`field.array-guard`).
3. `update`: `{ $rename: { <from>: <to> } }`.
4. `overwrites`: `filter` and `{ <to>: { $exists: true } }`: the documents whose value at `to` is replaced.
5. The documents left out because of arrays are the count of `reached` less the count of `filter`.

Examples (`<not array>` stands for `{ $not: { $type: "array" } }`):

- `renamePlan({}, 'old', 'new')` gives `filter` and `reached` `{ old: { $exists: true } }`, `update`
  `{ $rename: { old: "new" } }`, `overwrites` `{ $and: [{ old: { $exists: true } }, { new: { $exists: true } }] }`.
- `renamePlan({ status: 'a' }, 'a.b', 'c.d.e')` gives `filter` `{ $and: [{ $and: [{ status: "a" }, { "a.b": {
  $exists: true } }] }, { a: <not array> }, { c: <not array> }, { "c.d": <not array> }] }`.
- Against the documents `{ _id: 1, name: "a", kind: "x" }`, `{ _id: 5, name: "e", fullName: "kept?", kind: "x" }`
  and others, `renamePlan({ kind: 'x' }, 'name', 'fullName')` overwrites one document, `_id` 5, whose `fullName`
  becomes `"e"`.

Acceptance:

- [ ] Each example above gives its result.
- [ ] With one document where `addr` is an array among four that have `addr.city`, `reached` counts 4 and `filter`
  3.

### `field.remove-plan` — Which documents a removal touches

The filter and the update of **Remove field…**, for a field and for a field of the elements of an expanded array.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/field/remove-plan.ts › removePlan(filter, field, array?)`
- **Uses**: `field.array-guard`. Used by `field.remove`.
- **Ported from**: field.remove-plan; `src/fieldActions.ts` (`removeField`).

Inputs: the user's filter, the field (`items.sku`), and `array`, the field path of the expanded array whose elements
have the field (`items`), when the column is a field of the elements of an array. Output:
`{ filter, update, reached }`.

Rules:

1. `reached`: the user's filter and `{ <field>: { $exists: true } }`.
2. Without `array`: `filter` is `reached` and the array guard of the field; `update` is
   `{ $unset: { <field>: "" } }`.
3. With `array`: `filter` is `reached`, the array guard of `array`, and `{ <array>: { $type: "array" } }` (`$[]`
   fails on a document where it is not an array); `update` is
   `{ $unset: { "<array>.$[].<rest of the field>": "" } }`.

Examples:

- `removePlan({ x: 1 }, 'a.b')` gives `filter` `{ $and: [{ $and: [{ x: 1 }, { "a.b": { $exists: true } }] }, { a:
  <not array> }] }` and `update` `{ $unset: { "a.b": "" } }`.
- `removePlan({}, 'items.sku', 'items')` gives `filter` `{ $and: [{ "items.sku": { $exists: true } }, { items: {
  $type: "array" } }] }` and `update` `{ $unset: { "items.$[].sku": "" } }`.
- `removePlan({}, 'order.items.meta.sku', 'order.items')` gives `update`
  `{ $unset: { "order.items.$[].meta.sku": "" } }`, and `order` must not be an array.

Acceptance:

- [ ] Each example above gives its result.
- [ ] Applied to a collection, the second example removes `sku` from every element of `items` and matches no
  document where `items` is a sub-document.

### `field.convert-plan` — Which values a conversion touches

The filter and the update pipeline of **Convert type…**, and the types it offers.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/field/convert-plan.ts › convertPlan(filter, field, type)` and `› CONVERT_TYPES`
- **Uses**: `field.array-guard`. Used by `field.convert-type`.
- **Ported from**: field.convert-plan; `src/fieldActions.ts` (`convertField`, `notYet`, `CONVERT_TYPES`).

Inputs: the user's filter, the field, the type to convert to. Output: `{ filter, update, reached }`.

Rules:

1. The values still to convert: `{ <field>: { $exists: true, $not: { $type: [<type>, "null", "array"] } } }`.
2. `filter`: the user's filter, the array guard of the field, and rule 1. Counted again after the write, it gives
   the values that could not be converted.
3. `reached`: the user's filter and rule 1, without the array guard.
4. `update`: the pipeline `[ { $set: { <field>: { $convert: { input: "$<field>", to: <type>, onError: "$<field>",
   onNull: "$<field>" } } } } ]`: a value that fails keeps its value and type.
5. The types offered, in this order, with their descriptions:

| Type | Description |
| --- | --- |
| `string` | *Numbers, dates (ISO), ObjectIds and booleans as text* |
| `int` | *32-bit integer: decimals are truncated, integer text is parsed* |
| `long` | *64-bit integer: decimals are truncated, integer text is parsed, dates become milliseconds* |
| `double` | *Floating point number; numeric text is parsed* |
| `decimal` | *Decimal128, exact decimals; numeric text is parsed* |
| `bool` | *Numbers: 0 is false; any text, even "false", is true* |
| `date` | *ISO text ("2024-03-15", "2024-03-15T10:00:00Z"), milliseconds (long, double), ObjectId* |
| `objectId` | *24 hexadecimal characters* |

Examples:

- `convertPlan({ k: 1 }, 'price', 'decimal')` gives `filter` and `reached` `{ $and: [{ k: 1 }, { price: { $exists:
  true, $not: { $type: ["decimal", "null", "array"] } } }] }`.
- `convertPlan({}, 'a.b', 'int')` gives `filter` `{ $and: [{ a: <not array> }, { "a.b": { $exists: true, $not: {
  $type: ["int", "null", "array"] } } }] }`.

Acceptance:

- [ ] Each example above gives its result.
- [ ] Applied to `"42"`, `7.9`, `"not a number"`, `null`, `[1, 2]` and `Int32(5)` with `int`, it matches 3
  documents, modifies 2, and 1 still matches afterwards.
- [ ] The types are offered in the order of the table, each with its description.

### `field.type-counts` — The current types of a field

The pipeline that counts the BSON types of a field, shown in the list of **Convert type…**.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/field/type-counts.ts › typeCountsPipeline(filter, field)`
- **Uses**: `field.array-guard`. Used by `field.convert-type`.
- **Ported from**: field.type-counts; `src/fieldActions.ts` (`typeCounts`).

Rule: `[ { $match: <the user's filter, the array guard, { <field>: { $exists: true } }> }, { $group: { _id: { $type:
"$<field>" }, n: { $sum: 1 } } }, { $sort: { n: -1 } } ]`: one row per type, most frequent first. The list shows them
as `<type> <n>` joined by ` · `, the numbers with thousands separators.

Example: `typeCountsPipeline({ x: 1 }, 'a.b')` gives a `$match` of `{ $and: [{ x: 1 }, { a: <not array> }, { "a.b":
{ $exists: true } }] }` and a `$group` on `{ $type: "$a.b" }`.

Acceptance:

- [ ] The example above gives its result.
- [ ] On `v` with the values `"42"`, `"x"`, `7.9` and `null`, the list of **Convert type…** shows *now: string 2 ·
  double 1 · null 1*.
- [ ] After converting `v` to `int` in the collection of `field.convert-plan`, the first row is
  `{ _id: "int", n: 3 }`.

### `field.layout-follows` — The column follows a renamed or removed field

After a rename the column keeps its layout under the new name; after a removal its layout is dropped.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/field/layout-follows.ts › renamedLayout(layout, from, to?)` and
  `› renamedKey(key, from, to?)`
- **Uses**: `table.columns` (the layout it changes, and the expanded columns, which are renamed the same way and
  saved with it). Used by `field.rename` and `field.remove`.
- **Ported from**: field.layout-follows; `src/shared/columns.ts` (`renameInLayout`, `renamedKey`),
  `src/webview/main.ts` (`fieldChanged`).

Rules:

1. A key equal to `from`, or starting with `from` and a dot, becomes `to` followed by the rest; without `to` it is
   dropped. Other keys stay.
2. The hidden columns and the order are renamed and keep one of each key; the pinned columns are renamed and keep
   only top-level keys; the widths move to the new keys.

Examples:

| Input | Result |
| --- | --- |
| `renamedKey('addr.city', 'addr', 'address')` | `address.city` |
| `renamedKey('name', 'addr', 'address')` | `name` |
| `renamedKey('address', 'addr', 'location')` | `address`: it only starts with the same letters |
| `renamedKey('tmp', 'tmp')` | dropped |
| renaming `name` to `info.name`, with `name` pinned | `name` leaves the pinned columns, and `info.name` is not pinned |

Acceptance:

- [ ] Each row of the table above gives its result.
- [ ] After renaming `name` to `fullName`, a hidden `name` column is a hidden `fullName` column, with the same
  width.
- [ ] After renaming `addr` to `address` while `addr` is expanded, `address` is expanded and shows `address.city`.
- [ ] After removing `tmp`, no key of the layout is `tmp` or starts with `tmp` and a dot.
