# References

MongoDB does not declare how collections refer to each other. Datardo finds the references of a database by
sampling: it reads some documents of every collection, picks the fields whose values could be the `_id` (or a unique
field) of another collection, and looks those values up there. What it finds is used in three places: the
**Relationship diagram** page of the database, **Go from here** in the inspector island, and the cells of the
table, which lead to the documents they refer to.

This area has the rule that decides what is a reference (a Derivation, with the three smaller rules it stands on:
the fields of a sample, the fields worth looking up, and the names that match), the Read that samples and looks up,
with the references kept per database, the diagram with its layout and its two exports, and the following of
references from a document.

In the diagram a **relation** is an arrow: a reference, or the link from a view to the collection it reads.

### `relation.detect` — Which fields are references

Decides, from the fields that could be references and from what a lookup of their sampled values found, which
fields refer to which collection.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/relation/detect.ts › relations(collections, candidates, found)`
- **Uses**: `relation.candidates`, `relation.fields`, `relation.read`.
- **Ported from**: `src/shared/relations.ts › isReference`, `refKey`, `describe`; `src/relationsAnalysis.ts ›
  references`, `analyzeRelations` (DBRefs and views); README, *Relationship diagram*.

Inputs: the collections and views of the database, with the fields of their samples (`relation.fields`) and, for a
view, the collection it reads; the candidates (`relation.candidates`), each with the values looked up and its
targets; per target field, which of the values looked up exist there (`relation.read`). Output: the relations of the
database, each with the collection and field it leaves, the collection and field it reaches, whether the field holds
several references, its kind (reference, DBRef or view), and how many of the values looked up were found.

Rules:

1. A candidate is a reference to a target when, of its values looked up, at least 20% exist in the target for an
   ObjectId or a UUID, or at least 60% for a string or a number; for a string or a number at least 2 values must be
   found too, unless fewer than 3 were looked up. Nothing found is never a reference. ObjectIds and UUIDs do not
   repeat by chance; strings and numbers do.
2. Values are compared as MongoDB compares them: numbers of any BSON type alike (`NumberInt(7)` is `NumberLong(7)`).
3. A field can refer to several targets: each is its own relation.
4. A field whose values are DBRefs (`{ $ref, $id }`, with or without `$db`) refers to the `_id` of the collection
   `$ref` names, without a lookup, when that collection is in this database; a `$db` equal to this database is
   accepted, another database gives no relation.
5. A view is linked to the collection it reads when that collection is in this database.
6. The field **holds several references** when it is an array or is inside one.
7. The relations are sorted by the text `from.field→to.field`; then the DBRefs, then the views.

How a relation is described, in the list of the diagram, in tooltips and by the tool `describe_relations`:

| Kind | Text |
| --- | --- |
| Reference | *orders.customerId → customers._id · many-to-one · 20 of 20 sampled values found* |
| Reference in an array | *orders.items[].productId → products._id · many-to-many (an array of references) · 18 of 20 sampled values found* |
| DBRef | *posts.author → users._id · many-to-one · DBRef* |
| View | *recent is a view of orders* |

Worked examples, in a database with `customers` (`_id` ObjectId, a unique index on `email`), `orders` (`_id`
ObjectId), `products` (`_id` string) and `stores` (`_id` `Int64`):

| Field of `orders` | Looked up in | Found | Result |
| --- | --- | --- | --- |
| `customerId`, 20 ObjectIds | `customers._id` and `orders._id` | 20 and 0 | `orders.customerId → customers._id` |
| `items[].productId`, 20 strings | `products._id` | 18 | a reference, many-to-many |
| `note`, 1 ObjectId | `customers._id` and `orders._id` | 0 and 0 | none |
| `customerEmail`, 20 strings | `customers.email` | 20 | `orders.customerEmail → customers.email` |
| `storeId`, 5 values of type `Int32` | `stores._id` | 5 | `orders.storeId → stores._id` |
| `parentId`, 20 ObjectIds | `customers._id` and `orders._id` | 0 and 4 | `orders.parentId → orders._id` (20%) |
| `refundOf`, 20 ObjectIds | `customers._id` and `orders._id` | 0 and 3 | none (15%) |
| `productId`, 20 strings | `products._id` | 11 | none (55%) |
| `productId`, 20 strings | `products._id` | 12 | a reference (60%) |
| `productId`, 1 string | `products._id` | 1 | a reference (fewer than 3 looked up) |
| `productId`, 2 strings | `products._id` | 1 | none (50%) |
| `productId`, 3 strings | `products._id` | 2 | a reference (67%, and 2 found) |
| `owner`, `{ $ref: "customers", $id: ObjectId("…") }` | nowhere | — | `orders.owner → customers._id`, DBRef |
| `owner`, `{ $ref: "customers", $id: 7, $db: "crm" }` | nowhere | — | none: another database |

Acceptance:

- [ ] The examples above give the results shown.
- [ ] An ObjectId field found in the `_id`s of two collections gives two relations, one per collection.
- [ ] A field `storeId` holding `NumberInt(7)` is a reference to `stores._id` holding `NumberLong(7)`.
- [ ] A field of DBRefs naming `customers` and `suppliers` gives two relations of the kind DBRef; a DBRef naming a
  collection that is not in the database gives none.
- [ ] A view `recent` on `orders` gives *recent is a view of orders*; a view on a collection of another database
  gives nothing.
- [ ] A field inside an array, `items[].productId`, and a field that is an array of ids, `tagIds`, both hold several
  references and are described as *many-to-many (an array of references)*.
- [ ] A database with the references `orders.customerId → customers._id` and `carts.customerId → customers._id`
  returns the one of `carts` before the one of `orders`.

### `relation.candidates` — Which fields are looked up, and where

Picks, from the samples of a database, the fields whose values could be the `_id` or a unique field of a
collection, the values to look up for each, and the collections to look them up in.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/relation/candidates.ts › candidates(samples)`
- **Uses**: `relation.fields`, `relation.name-match`.
- **Ported from**: `src/shared/relations.ts › candidates`, `idType`, `VALUES_TESTED`; README, *Relationship
  diagram*.

Inputs: per collection that is not a view, its fields with their sampled values (`relation.fields`) and the fields
of its unique indexes of one field (not partial, not `_id`). Output: the candidates, each with its collection, its
field, the type of its values, up to 20 values, and its targets (a collection and a field of it).

Rules:

1. A value can be a reference when it is an ObjectId, a UUID (binary of subtype 4), a string or a number (`Int32`,
   `Int64`, `Double` and `Decimal128` count as one type). A field holding values of two of those types is a
   candidate once per type.
2. A document's own `_id` is never a candidate. Every other field is, at any depth, array elements included.
3. The first 20 distinct sampled values of the field, for that type, are the values looked up.
4. The `_id` type of a collection is the type most of its sampled `_id`s have.
5. Where a candidate may point:
   - for an ObjectId or a UUID, the `_id` of every collection whose `_id` type is the same, its own collection
     included;
   - for a string or a number, the `_id` of a collection with that `_id` type only when the field is named after the
     collection (`relation.name-match`);
   - whatever the type, a unique field `u` of any collection, when the last name of the candidate's path is `u`'s
     last name without regard to case (`email` → `users.email`), or ends with it and what comes before is named
     after that collection (`customerEmail` → `customers.email`). A field is not a target of itself.
6. A candidate without a target is dropped: nothing is looked up for it.

Worked examples, in the database of `relation.detect`:

| Field of `orders` | Sampled values | Looked up in |
| --- | --- | --- |
| `customerId` | 45 distinct ObjectIds | `customers._id` and `orders._id`, the first 20 values |
| `items[].productId` | strings | `products._id`: the field is named after `products` |
| `status` | strings such as `"paid"` | nowhere: no collection is named after it |
| `total` | numbers | nowhere |
| `storeId` | values of type `Int32` | `stores._id`: named after `stores`, whose `_id`s are numbers |
| `customerEmail` | strings | `customers.email`: it ends with `email` and starts with the collection's name |
| `email` | strings | `customers.email`: the same last name |
| `code` | strings | nowhere; `products.code` once `products` has a unique index on `code` alone |
| `ref` | ObjectIds in some documents, strings in others | the ObjectIds in `customers._id` and `orders._id`; the strings nowhere |
| `_id` | ObjectIds | nowhere: its own `_id` |

Acceptance:

- [ ] The examples above give the targets shown.
- [ ] A field with 45 distinct sampled ObjectIds has 20 of them looked up, the first 20 in the order of the sample.
- [ ] A unique index of two fields, a partial unique index and the `_id_` index give no target.
- [ ] The `_id` of `orders` is never a candidate, also when the same ObjectIds are `_id`s of another collection.
- [ ] A collection whose sampled `_id`s are 60 ObjectIds and 40 strings has the `_id` type ObjectId: a string field
  named after it is not looked up there.
- [ ] A database with one collection has no candidate, unless a field other than `_id` holds ObjectIds and its
  `_id`s are ObjectIds too: those are looked up in its own `_id`s.

### `relation.fields` — The fields of a sample

Lists the fields the sampled documents of a collection have, with their types, how often they are there, and the
values that could be references.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/relation/fields.ts › fields(documents)`
- **Uses**: nothing.
- **Ported from**: `src/shared/relations.ts › sampleFields`, `refType`.

Inputs: the sampled documents with their BSON types. Output: the fields, each with its path, its label, its depth,
its types, the share of documents that have it and whether it holds several values; per field and type, its
distinct values that could be references; per field, the collections its DBRefs name.

Rules:

1. A field is known by its dotted path, without array positions, as a filter writes it: `items.productId`. Its
   label marks the arrays it goes through: `items[].productId`.
2. `_id` comes first; the other fields follow in the order they first appear in the sample, sub-fields after their
   parent.
3. At most 300 paths are kept per collection; fields met after that are ignored.
4. The types of a field are those seen, the most frequent first: the names the Schema section uses (`objectId`,
   `string`, `int`, `long`, `double`, `decimal`, `date`, `bool`, `null`, `object`, `array`…), and `dbref` for a
   DBRef. An array counts `array` once per element (once when empty) and then the type of each element under the
   same path; an array inside an array is skipped.
5. A sub-document counts as `object` and its fields are visited, one level deeper. A DBRef counts as `dbref` and its
   `$ref` and `$id` are not fields.
6. The share is the number of documents in which the path occurs at least once, over the documents sampled: array
   elements do not count twice.
7. A field holds several values when it is an array of values or of DBRefs, or a field of the documents of an array.
8. Per field and per type of rule 1 of `relation.candidates`, up to 100 distinct values are kept, in the order of
   the sample.

Worked example, a sample of 2 documents:

```
{ _id: ObjectId("65f1c0a2b3d4e5f6a7b8c9d0"), customerId: ObjectId("65f1c0a2b3d4e5f6a7b8c9aa"),
  items: [{ productId: "P-1", qty: 2 }, { productId: "P-7", qty: 1 }], tagIds: [ObjectId("…01"), ObjectId("…02")] }
{ _id: ObjectId("65f1c0a2b3d4e5f6a7b8c9d1"), customerId: null, ship: { city: "Turin" } }
```

| Path | Label | Depth | Types | Share | Several |
| --- | --- | --- | --- | --- | --- |
| `_id` | `_id` | 0 | `objectId` | 100% | no |
| `customerId` | `customerId` | 0 | `objectId`, `null` | 100% | no |
| `items` | `items` | 0 | `array`, `object` | 50% | no |
| `items.productId` | `items[].productId` | 1 | `string` | 50% | yes |
| `items.qty` | `items[].qty` | 1 | `int` | 50% | yes |
| `tagIds` | `tagIds` | 0 | `array`, `objectId` | 50% | yes |
| `ship` | `ship` | 0 | `object` | 50% | no |
| `ship.city` | `ship.city` | 1 | `string` | 50% | no |

Values that could be references: `customerId` 1 ObjectId; `items.productId` the strings `P-1` and `P-7`;
`items.qty` the numbers 2 and 1; `tagIds` 2 ObjectIds; `ship.city` the string `Turin`.

Acceptance:

- [ ] The example above gives the table and the values shown.
- [ ] A sample with 350 different paths keeps the first 300 in order of appearance.
- [ ] A field present in 80 of 100 sampled documents has the share 80%, also when it is a field of the elements of
  an array with several elements per document.
- [ ] `{ a: [[1, 2]] }` gives the field `a` with no type and no value: the inner array is skipped.
- [ ] `{ a: [] }` gives the field `a` with the type `array`.
- [ ] A field holding `{ $ref: "users", $id: 7 }` has the type `dbref`, names `users`, and has no sub-fields.
- [ ] A field with 250 distinct strings keeps the first 100.

### `relation.name-match` — Whether a field is named after a collection

Tells whether the name of a field points to a collection by name, as `customerId` points to `customers`: the test
that lets a string or a number be looked up as a reference.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/relation/name-match.ts › namesMatch(field, collection)`
- **Uses**: nothing.
- **Ported from**: `src/shared/relations.ts › stem`, `singular`, `namesMatch`.

Inputs: the path of a field and the name of a collection. Output: yes or no.

Rules:

1. Only the last name of the field's path counts (`billing.customerId` is `customerId`), and only the part of the
   collection's name after its last dot (`crm.customers` is `customers`).
2. The **stem** of the field: its ending `id`, `ids`, `ref`, `refs`, `key` or `keys`, with or without a `_` before
   it and in any case, is removed once; then `_`, `-` and spaces are removed and the rest is lower-cased. An empty
   stem matches nothing.
3. The **singular** of a name, after removing `_`, `-` and spaces and lower-casing: `people` is `person`; a final
   `ies` becomes `y`; a final `es` after `ss`, `sh`, `ch`, `x` or `z` is removed; otherwise a final `s` that is not
   `ss` is removed.
4. The names match when the stem is the singular of the collection, or the collection's name itself (lower-cased,
   without `_`, `-` and spaces), or when the singular of the stem is the singular of the collection.

Worked examples:

| Field | Stem | Collection | Singular | Match |
| --- | --- | --- | --- | --- |
| `customerId` | `customer` | `customers` | `customer` | yes |
| `customer_id` | `customer` | `customers` | `customer` | yes |
| `user_ids` | `user` | `users` | `user` | yes |
| `authorRef` | `author` | `authors` | `author` | yes |
| `orderKey` | `order` | `orders` | `order` | yes |
| `categoryId` | `category` | `categories` | `category` | yes |
| `addressId` | `address` | `addresses` | `address` | yes |
| `boxId` | `box` | `boxes` | `box` | yes |
| `personId` | `person` | `people` | `person` | yes |
| `billing.customerId` | `customer` | `crm.customers` | `customer` | yes |
| `customers` | `customers` | `customers` | `customer` | yes: the collection's own name |
| `line-item_id` | `lineitem` | `line_items` | `lineitem` | yes |
| `parentId` | `parent` | `categories` | `category` | no |
| `id` | (empty) | `ids` | `id` | no |
| `statusId` | `status` | `statuses` | `statuse` | no: this plural is not known |
| `paid` | `pa` | `pas` | `pa` | yes: the ending is removed wherever it is |

Acceptance:

- [ ] The examples above give the results shown.
- [ ] `CUSTOMERID` matches `Customers`: the case never counts.
- [ ] `customerIds` and `customer_refs` match `customers`.
- [ ] `class` has the stem `class` and matches `classes`.

### `relation.read` — Read the references of a database

Samples every collection of a database, looks up the values that could be references, and keeps what was found for
the tabs of that database.

- **Kind**: Read
- **Engine**: MongoDB
- **Function**: `src/features/relation/read.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: by itself, when the first collection tab of a database shows its documents (in the background);
  the Relationship diagram, when it opens and with **Sample** and **Refresh**; the tool `describe_relations` of the
  MCP server (`mcp.read-data`), with a database, optionally a collection (only the references from and to it) and a
  sample from 1 to 2,000 (100 when not given).
- **Reads**, in order:
  1. `db.runCommand({ listCollections: 1, nameOnly: false, authorizedCollections: true })`; the collections whose
     name starts with `system.` are left out, the others sorted by name; a view is not sampled and keeps the name of
     the collection it reads;
  2. per collection, 6 collections at a time: `db.orders.estimatedDocumentCount({ maxTimeMS: 20000 })` and
     `db.orders.getIndexes()` together, then the sample: `db.orders.aggregate([{ $sample: { size: 100 } }], {
     maxTimeMS: 20000 })` when the estimated count is above the sample's size, `db.orders.find({}).limit(100)
     .maxTimeMS(20000)` otherwise. The documents keep their BSON types;
  3. per target field of `relation.candidates`, 6 at a time: `db.customers.find({ _id: { $in: [ … ] } }, { _id: 1 })
     .maxTimeMS(20000)`, with the values of every candidate that points to that field, without duplicates (numbers
     of any type are one value), 1,000 values per query; for a unique field, `db.customers.find({ email: { $in: [ …
     ] } }, { email: 1 }).maxTimeMS(20000)`.
- **Settings**: `datardo.relation.detect` (on by default): whether the references are found by themselves when a
  collection tab needs them.
- **Uses**: `relation.fields`, `relation.candidates`, `relation.detect`, `runner.progress`, `tree.refresh`,
  `connection.disconnect`, `mcp.read-data`.
- **Ported from**: `src/relationsAnalysis.ts › analyzeRelations`, `references`, `RelationsCache`;
  `src/collectionPanel.ts › loadReferences`; `src/mcp/data.ts` (`describe_relations`); README, *Follow references*.
  The work in progress on the status line is new in Datardo.

The sample's size is 100 in the background; 100, 500 or 2,000 in the diagram (**Sample**).

What can go wrong:

- A count that fails leaves the collection without a number of documents, and the sample is taken with `find`.
  Indexes that cannot be listed leave it without unique fields.
- A collection whose sample cannot be read (permissions, a timeout after 20 seconds) is shown without fields and
  takes no part in the references; the tool lists it as *Not readable: …*.
- A lookup that fails finds nothing in that target: no reference to it.
- A failure to list the collections fails the whole read with the server's message.

Progress, on the status line (`runner.progress`) and in the diagram: *Sampling 12 collections…*, then *Sampled 3 of
12 collections…* after each collection, then *Checking 9 possible references in 4 collections…*.

The references kept, per connection and database:

1. They are found once, with a sample of 100, when the first collection tab of the database shows its documents,
   without delaying the table; they are then kept until Datardo quits. Tabs that ask while they are being found
   wait for the same read: the database is not sampled twice.
2. When they arrive, the open collection tabs of that database and the inspector island show them at once
   (`relation.follow`).
3. **Refresh** in the tree island (`tree.refresh`) makes them old: they are still used, and found again when a
   collection tab next needs them; the tabs then show the new ones. A read under way when **Refresh** is pressed
   finishes and is kept.
4. A Relationship diagram of the database replaces them with what it found, whatever its sample, each time it
   samples; the open tabs show them at once.
5. They are forgotten when the connection is disconnected or removed.
6. A read that fails keeps nothing (old references stay, as old): the next collection tab tries again.
7. With `datardo.relation.detect` off, nothing is read by itself: the tabs use only what a Relationship diagram of
   the database found, and nothing until one was opened.
8. A view has the references of the collection it reads.
9. The tool `describe_relations` reads with its own sample and does not change what is kept.

Acceptance:

- [ ] Opening the collection `orders` of `shop` for the first time sends `listCollections` to `shop` and samples its
  collections with a size of 100; opening `customers` of `shop` afterwards sends nothing.
- [ ] A collection with an estimated 5,000 documents is sampled with `$sample: { size: 100 }`; one with 80 with
  `find({}).limit(100)`.
- [ ] With 14 collections, no more than 6 are sampled at the same time.
- [ ] Two fields pointing to `customers._id`, with 20 values each of which 5 are the same, cause one `find` on
  `customers` with 35 values in `$in`.
- [ ] A collection the user may not read appears in the diagram as a box saying *empty, or not readable* and the
  other collections still get their references.
- [ ] After **Refresh** in the tree island the links of an open tab stay; the next collection tab opened in that
  database samples it again, and both tabs then show the new references.
- [ ] Opening the Relationship diagram of `shop` with **Sample** at **500** replaces the references of `shop`: a
  reference only the larger sample found becomes a link in the open tabs of `shop` without reading them again.
- [ ] With `datardo.relation.detect` off, opening `orders` sends no sample and its cells have no links; after the
  Relationship diagram of `shop` was opened, they have.
- [ ] After disconnecting and connecting again, the first collection tab of `shop` samples it again.
- [ ] `describe_relations` on `shop` with the collection `orders` answers with the references from `orders` and to
  `orders`, in the texts of `relation.detect`; with a collection that does not exist it answers *shop.nope doesn't
  exist on Local: use list_collections.*

### `relation.diagram` — The Relationship diagram page

A page of a database that draws its collections as boxes, with their fields and types, and the references between
them as arrows.

- **Kind**: View
- **Engine**: MongoDB
- **Function**: `src/features/relation/diagram.ts › view(state)`
- **Entry points**: **Relationship diagram** in the context menu of a database, a collection or a view of the tree
  island (`@tree-menu`); **Relationship diagram** in the inspector island under **Go from here**, when references
  are not found by themselves (`@inspector`); Go to (**Relationship diagram**), for the database of the active tab.
- **Offered when**: the connection is a MongoDB connection and a database is known.
- **Reads**: `relation.read`, when the page opens, when **Sample** changes and with **Refresh**.
- **After**: the tab is titled `Diagram: shop` in the group of its connection; a second request for the same
  database makes the open tab active. Opened from a collection or a view, the page selects its box and brings it
  into view, also when the tab was already open.
- **Commands**: `relation.diagram`.
- **Uses**: `relation.read`, `relation.detect`, `relation.layout`, `relation.export-mermaid`, `relation.export-svg`,
  `tab.open`, `tab.restore`, `runner.progress`, `nav.status-line`.
- **Ported from**: README, *Relationship diagram*; `src/relations.ts` (`DiagramPanel`), `src/webview/diagram.ts`,
  `src/shared/relations.ts › shownFields`, `rowLabel`, `edgePath`. Keeping the moved boxes, the zoom and the options
  when the tab is restored is new in Datardo.

What the page shows, from the top:

1. The toolbar (`@toolbar`): the count of what is drawn; **Sample** with **100**, **500** and **2,000** (100 to
   start with; tooltip *Documents read per collection to find the fields and the references*); **Keys only**
   (off; tooltip *Show only _id, unique fields and the fields of the relations*); **Refresh** (tooltip *Sample the
   collections again*).
2. A second row (`@toolbar`): **−** (*Zoom out*), **+** (*Zoom in*), **Fit** (*Fit the diagram in the tab*), **Reset
   layout** (*Put the collections back where the automatic layout places them*); on the right **Copy Mermaid**
   (*Copy the diagram as a Mermaid erDiagram (for Markdown, GitHub, docs)*) and **Save SVG…** (*Save the diagram as
   an SVG image*).
3. The drawing.
4. **Relations (9)**, a list that folds, at the bottom (`@list`): one line per relation, in the text of
   `relation.detect`.

The count: *12 collections · 9 relations · 1 view · 100 documents sampled per collection*. The collections count the
views too; the relations count the references and the DBRefs; the views are those linked to their collection, and
that part is left out when there are none. While the page reads, the count is the progress of `relation.read`.

A box:

- Its head: the name of the collection and, on the right, *1,204 docs* (the estimated count) or *view*. A view's
  head has another color.
- One row per field, at most 14: the name on the left, on the right the mark `PK` for `_id`, `FK` for a field that
  refers elsewhere, `UK` for a field with a unique index, and the first type of the field that is not `null`,
  joined by ` · ` (*FK · objectId*). The keys (`_id`, the unique fields, the fields a relation leaves or reaches)
  are always shown; the other fields fill what is left of the 14 rows, in the order of the document. Sub-documents
  are shown through their fields, indented under their parent when it is shown, with their whole path otherwise.
  With **Keys only**, only the keys.
- *+3 more fields* when fields were left out; *empty, or not readable* for a collection without sampled documents.
- The tooltip of a row: *items[].productId: string | null · in 80% of the sampled documents* (the share is left out
  at 100%).

An arrow goes from the row of the field that refers to the row of the field it reaches (to the head of the box when
that row is not shown), as a curve leaving the side that faces the other box; a collection that refers to itself has
a loop on its right. `N` on an arrow marks a field that holds several references. The link of a view is dashed. The
tooltip of an arrow is the text of the relation.

Moving and zooming:

- Dragging a box moves it; its arrows follow. Moved boxes keep their place while the tab is open and when it is
  restored (`tab.restore`), until **Reset layout**, **Keys only** or a new sample, which lay the boxes out again
  (`relation.layout`).
- Dragging the background moves the whole drawing. The wheel zooms around the pointer; **+** multiplies the scale by
  1.25 and **−** by 0.8, around the middle of the page. The scale stays between 15% and 300%.
- **Fit** shows every box with a margin of 40 pixels, never above 100%. The page fits the drawing when it first
  draws it.

Selecting:

- A click on a box selects it: its arrows and the boxes they connect stand out, the rest fades, and its relations
  are marked in the list. A click on a line of the list selects that relation and brings its two boxes into view. A
  click on the background, or `Esc`, clears the selection.
- With the keyboard: `Tab` moves between the boxes, `Space` selects one, `Enter` opens its collection.
- A double click on a box, or `Enter`, opens the collection tab of that collection or view (`tab.open`).

States:

- **Loading**: *Sampling the collections…* and then the progress of `relation.read`; what was drawn stays until the
  new sample arrives.
- **Empty**: *shop has no collections.* in place of the drawing. With collections and no relations, the boxes are
  drawn in a grid and the list says *No field of the sampled documents refers to another collection.*
- **Error**: the server's message in an error line above the drawing; the drawing of the last good sample stays.
- **Read-only**: the page writes nothing to the deployment and works the same.

Acceptance:

- [ ] **Relationship diagram** on the database `shop` of Local opens one tab titled `Diagram: shop`; asking again
  from the collection `orders` makes that tab active with the box of `orders` selected and in view.
- [ ] A database with 12 collections, 1 view and 9 references sampled at 100 shows *13 collections · 9 relations · 1
  view · 100 documents sampled per collection* and **Relations (10)**.
- [ ] A collection with 20 fields, none a sub-document, whose last 2 fields refer elsewhere, shows 14 rows in the
  order of the document, those 2 and `_id` among them, and *+6 more fields*.
- [ ] With **Keys only** that box shows 3 rows and no *more fields* line.
- [ ] `orders.items[].productId` has an arrow with `N` to `products`; a view `recent` has a dashed arrow to `orders`.
- [ ] Changing **Sample** to **500** sends the samples again with a size of 500 and lays the boxes out again.
- [ ] A box dragged 200 pixels to the right keeps that place after switching to another tab and back, and after a
  restart of Datardo; **Reset layout** puts it back.
- [ ] The wheel never brings the scale below 15% or above 300%.
- [ ] A double click on the box of `customers` opens the collection tab of `shop.customers`.
- [ ] A database without collections shows *shop has no collections.* and **Copy Mermaid** and **Save SVG…** are
  disabled.
- [ ] A sample that fails with a server error shows the message and keeps the previous drawing.

### `relation.layout` — Where the boxes of the diagram go

Places the boxes of the collections in columns that follow the references, so that most arrows point left and
related collections are near each other.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/relation/layout.ts › layout(graph, keysOnly)`
- **Uses**: `relation.detect`.
- **Ported from**: `src/shared/relations.ts › layout`, `boxHeight`, `shownFields`.

Inputs: the collections with the fields their boxes show, the relations, and **Keys only**. Output: for each
collection a box (left, top, width, height), and the width and height of the whole drawing.

The algorithm is a layered drawing of a directed graph (the method of Sugiyama, Tagawa and Toda) with the layers
taken from the longest path and the order inside a layer from barycenters:

1. A box is 240 wide. Its height is 30 for the head, 19 per row shown (one more row for *+N more fields*), and 8.
2. Relations of a collection to itself are ignored here. A collection with no other relation is **unrelated**.
3. The column of a related collection is 0 when it refers to nothing, otherwise one more than the highest column of
   the collections it refers to; views count as referring to their source. The collections are visited in order of
   name, and a relation that would close a cycle is ignored for the column.
4. Inside a column the collections start in order of name; then, 6 times over the columns from left to right, each
   column is sorted by the average position of the collections its members are related to in the other columns (a
   position is 0 for the first of a column, 1 for the last), keeping the order of names between equals.
5. Columns are 130 apart, boxes of a column 36 apart; each column is centered on the height of the tallest one.
6. The unrelated collections go in a grid below, in order of name: as many per row as there are columns, and at
   least 3; 65 between the boxes of a row; the first row 72 below the tallest column (at the top when there is no
   related collection); 36 between a row and the tallest box of the row above.

The result must satisfy: no two boxes overlap; the same input gives the same output; a reference goes from a box to
a box in a column on its left, except inside a cycle; every collection has exactly one box.

Worked example, without **Keys only**: `customers` (3 rows), `products` (2 rows), `orders` (4 rows) with
`orders.customerId → customers._id` and `orders.productId → products._id`, and the unrelated `audit` and `logs` (1
row each):

| Collection | Column | Left | Top | Height |
| --- | --- | --- | --- | --- |
| `customers` | 0 | 0 | 0 | 95 |
| `products` | 0 | 0 | 131 | 76 |
| `orders` | 1 | 370 | 46.5 | 114 |
| `audit` | grid | 0 | 279 | 57 |
| `logs` | grid | 305 | 279 | 57 |

The drawing is 610 wide and 336 high.

Acceptance:

- [ ] The example above gives the boxes and the size shown.
- [ ] Adding `reviews` (1 row) with `reviews.orderId → orders._id` puts `reviews` in column 2, at the left 740.
- [ ] Two collections that refer to each other are placed in two different columns and the layout ends.
- [ ] A collection that refers only to itself is placed in the grid of the unrelated ones.
- [ ] Seven unrelated collections and no related one are placed in rows of 3, 3 and 1, the first row at the top 0.
- [ ] With **Keys only**, a box that showed 14 rows and has 2 keys is 76 high.
- [ ] Calling the function twice with the same input gives the same boxes.

### `relation.export-mermaid` — Copy the diagram as Mermaid

Copies the diagram as the text of a Mermaid `erDiagram`, to paste into a README, a wiki or an issue.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/relation/export-mermaid.ts › plan(context, answers)`
- **Entry points**: **Copy Mermaid** in the toolbar of the Relationship diagram (`@toolbar`).
- **Offered when**: the diagram has at least one collection.
- **Plan**: one app step: `copy the Mermaid diagram of shop to the clipboard`.
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone: nothing is written to a deployment.
- **After**: a notification *Copied to the clipboard* that leaves by itself after 2 seconds.
- **Uses**: `relation.diagram`, `runner.notify`.
- **Ported from**: `src/shared/relations.ts › toMermaid`; `src/webview/diagram.ts` (the button).

The text:

1. The first line is `erDiagram`.
2. One block per collection, in order of name: `  name {`, one line per row its box shows (so the keys alone with
   **Keys only**) as `    type field` followed by ` PK` for `_id`, else ` FK` for a field that refers elsewhere,
   else ` UK` for a unique field, and `  }`. The type is the first type of the field that is not `null` (`null`
   when it has no other, `any` when it has none). The field is its label without `[]`.
3. One line per relation, in the order of `relation.detect`: `  orders }o--|| customers : "customerId"`; with
   `}o--o{` for a field that holds several references; `||--||` and the label `view of` for a view. The label is
   the label of the field, with `[]`, and a `"` in it becomes `'`.
4. In names, types and fields every character that is not a letter, a digit, `_` or `-` becomes `_`.
5. The text ends with a new line.

Worked example, for the database of `relation.layout` without `audit` and `logs`:

```
erDiagram
  customers {
    objectId _id PK
    string name
    string email UK
  }
  orders {
    objectId _id PK
    objectId customerId FK
    string productId FK
    double total
  }
  products {
    string _id PK
    string name
  }
  orders }o--|| customers : "customerId"
  orders }o--|| products : "productId"
```

Acceptance:

- [ ] The example above is copied exactly, with a new line at its end.
- [ ] `orders.items[].productId → products._id` gives the field line `string items_productId FK` and the relation
  `orders }o--o{ products : "items[].productId"`.
- [ ] A view `recent` on `orders` gives `recent ||--|| orders : "view of"`.
- [ ] A collection named `crm.customers` is written `crm_customers` in its block and in its relations.
- [ ] With **Keys only**, a collection's block has only `_id`, the unique fields and the fields of its relations.
- [ ] Moving boxes does not change the text.

### `relation.export-svg` — Save the diagram as an SVG image

Saves the diagram as a picture, with the boxes where they are on the page.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/relation/export-svg.ts › plan(context, answers)`
- **Entry points**: **Save SVG…** in the toolbar of the Relationship diagram (`@toolbar`).
- **Offered when**: the diagram has at least one collection.
- **Asks**: where to save, in the system's dialog titled **Save the diagram**, with the name `shop-diagram.svg`
  (the database's name and `-diagram.svg`) in the user's home folder and the file type **SVG image**. The system
  asks before replacing a file.
- **Plan**: one file step: `write C:\Users\ada\shop-diagram.svg`.
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone: nothing is written to a deployment; the file can be deleted.
- **After**: a notification *Saved the diagram of shop to C:\Users\ada\shop-diagram.svg.* with **Open**
  (`@notification`), which opens the file with the system's program for it. When the file cannot be written, an
  error notification *Diagram not saved: <the system's message>*.
- **Uses**: `relation.diagram`, `relation.layout`, `runner.ask`, `runner.notify`.
- **Ported from**: `src/relations.ts › DiagramPanel.saveSvg`; `src/shared/relations.ts › toSvg`.

The picture:

1. It is a file that needs nothing else: no script, no style sheet, no font file; UTF-8, starting with the XML
   declaration.
2. It always has the light colors, on a white background, whatever the theme of Datardo.
3. It holds every box, at the place it has on the page (moved boxes included), with a margin of 20 around the
   drawing; the zoom and what part of the drawing the page shows do not count.
4. A box has what it has on the page: the name (followed by ` (view)` for a view), *1,204 docs*, the rows with their
   marks and types, *+3 more fields*. **Keys only** applies.
5. An arrow is a curve with an arrowhead at the field it reaches, dashed for a view, with the text of the relation
   as its title. The selection is not drawn.

Acceptance:

- [ ] **Save SVG…** on the diagram of `shop` proposes `shop-diagram.svg`; saving writes the file and the notification
  says *Saved the diagram of shop to <path>.* with **Open**.
- [ ] Closing the dialog writes nothing and says nothing.
- [ ] The file opens in a browser and shows the same boxes at the same places relative to each other as the page,
  with a box that was dragged where it was dragged.
- [ ] With the dark theme the file still has a white background and dark text.
- [ ] Zooming to 30% before saving changes nothing in the file.
- [ ] Saving to a folder that cannot be written shows *Diagram not saved: …* and no file is left.
- [ ] On a read-only connection **Save SVG…** works.

### `relation.follow` — Go from here: the references of a document

Shows, for a document, the documents it refers to and the collections whose documents refer to it, in the inspector
island and on the cells of the table, and leads to them.

- **Kind**: View
- **Engine**: MongoDB
- **Function**: `src/features/relation/follow.ts › view(state)`
- **Entry points**: **Go from here** in the inspector island, for the selected document of a collection tab
  (`@inspector`); the cells of the table that hold references (`@table`), their context menu (`@cell-menu`) and the
  context menu of a row (`@row-menu`).
- **Offered when**: the Documents section shows the collection's own documents (the results of a find, not of an
  aggregation), and the references of the database are known (`relation.read`).
- **Reads**: the references kept for the database (`relation.read`), which finds them when the first collection tab
  of the database shows its documents.
- **Settings**: `datardo.relation.detect`.
- **Uses**: `relation.read`, `relation.targets`, `relation.referrers`, `relation.open-referenced`,
  `relation.open-referencing`, `relation.diagram`, `document.inspect`, `table.show`, `nav.inspector`.
- **Ported from**: README, *Follow references*; `src/webview/main.ts › markReferences`, `cellTargets`,
  `followReference`, `referenceItems`; `src/collectionPanel.ts › postReferences`. Mongoster follows references from
  the table only; **Go from here** in the inspector island is new in Datardo.

**Go from here**, under the selected document in the inspector island, lists:

1. One line per target of each field of the document that holds a reference, in the order of the document's fields:
   the field and the collection it leads to, `customer → users`; with the field reached when it is not `_id`,
   `customerEmail → customers.email`; with the number of documents when the field holds several, `tagIds → tags
   (3)`. A click opens the referenced documents (`relation.open-referenced`); the tooltip is the filter it opens.
2. Under **Referenced by**, one line per field of another collection (or of this one) that refers to this
   collection, sorted by name: `orders.userId`, `posts.comments[].authorId`. A click opens the documents that
   refer to this one (`relation.open-referencing`); the tooltip is the filter it opens.

A field whose value is null, missing, empty or of a type that cannot be a reference has no line. A filter longer
than 300 characters is cut in the tooltip and ends with `…`.

States of **Go from here**:

- **Loading**: *Finding the references of shop…* while `relation.read` runs for the first time; the lines appear
  when it ends, without selecting the document again.
- **Empty**: *This document refers to no other, and no collection refers to its collection.*
- **Not detected**: with `datardo.relation.detect` off and no diagram opened on the database, *References are not
  found by themselves: the relationship diagram of shop finds them.* with **Relationship diagram**
  (`relation.diagram`).
- **Aggregation**: no **Go from here** for a row of an aggregation's results.
- **Read-only**: the same; following a reference writes nothing.

In the table:

- A cell that holds a reference is underlined when the pointer is on it and, with `Ctrl` held, looks like a link.
  Its tooltip ends with *Ctrl+click: open the referenced document in users*, *Ctrl+click: open the 3 referenced
  documents in tags*, or, when the field refers to several collections, *Ctrl+click: open the referenced document
  (in users, admins)*.
- `Ctrl`+click on such a cell, and `Ctrl+Enter` on the selected cell, follow the reference instead of selecting the
  row (the row is selected from its number or from another cell).
- The context menu of the cell has **Open referenced document**, or **Open referenced documents** when the cell
  holds several; when the field refers to several collections the entry has a submenu with one entry per target
  (`users._id`), and its tooltip is *The field references several collections*.
- The context menu of a row has **Find referencing documents**, with a submenu of the lines of **Referenced by**,
  and the tooltip *The documents of other collections (or of this one) whose fields reference this one*. It is not
  there when nothing refers to the collection.
- The fields of sub-documents and the columns of an expanded array are links too; a column `author.$id` of an
  expanded DBRef leads where the DBRef leads.
- When the references are found again, the marks of the open tabs are redrawn.

Acceptance:

- [ ] Selecting an order whose `customer` field refers to `users` shows `customer → users` under **Go from here**; a
  click opens `shop.users` with the filter `{ _id: ObjectId("…") }` of that value.
- [ ] A document whose `tagIds` holds 3 ObjectIds shows `tagIds → tags (3)`.
- [ ] Selecting a user that `orders.userId` and `posts.comments[].authorId` refer to shows those two lines under
  **Referenced by**, `orders.userId` first.
- [ ] A document whose `customer` field is null has no line for it.
- [ ] While the references of `shop` are being found for the first time, **Go from here** says *Finding the
  references of shop…*, and then lists them.
- [ ] With `datardo.relation.detect` off and no diagram opened, **Go from here** says *References are not found by
  themselves: the relationship diagram of shop finds them.*, and the cells have no links.
- [ ] `Ctrl`+click on a cell of the column `customer` opens the referenced document and does not change the
  selection of rows.
- [ ] A cell of a field that refers to both `users` and `admins` opens, on `Ctrl`+click, a menu headed *Open the
  referenced document in* with `users._id` and `admins._id`.
- [ ] In the results of an aggregation no cell is a link and the row menu has no **Find referencing documents**.
- [ ] A tab on the view `recent` of `orders` has the same links as a tab on `orders`.

### `relation.targets` — Where a reference leads

Works out, from the references of a database, the collection and the filter the value of a field leads to.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/relation/targets.ts › referenceTargets(outgoing, path, value, database)`
- **Uses**: `relation.detect`, `query.format`.
- **Ported from**: `src/shared/references.ts › collectionReferences`, `referenceTargets`, `isReferenceValue`,
  `referenceKeys`.

Inputs: the **outgoing** references of a collection, which are the relations of the database, views left out, whose
field is one of its fields; the path of a field; its value; the name of the database. Output: targets, each with a
collection, a filter in mongosh syntax, a label and the number of values looked for.

Rules:

1. The path is the dotted path of the field without array positions. A value that is null or missing leads nowhere.
2. A value can be a reference when it is a non-empty string, a finite number, an ObjectId, a UUID, or a number of
   any BSON type; an array gives each of its elements, without duplicates and in their order.
3. For each outgoing reference of that path: the collection it reaches, filtered on the field it reaches: `{ _id:
   <value> }`, or `{ _id: { $in: [<values>] } }` for several; for a unique field, `{ email: "ada@example.com" }`.
   The label is `users._id`.
4. A field that refers to several collections gives one target per collection, in the order of the references; two
   references reaching the same field of the same collection give one target.
5. A DBRef leads to the collection its `$ref` names, on `_id`, with its `$id`, when that collection is a target the
   analysis found and its `$db` is missing or is this database. The path `author.$id` of an expanded DBRef leads
   where `author` leads, with that value.

Worked examples, with the references `orders.customer → users._id`, `orders.tagIds → tags._id` (several),
`orders.customerEmail → users.email`, `orders.owner → users._id` and `orders.owner → admins._id`, `posts.author →
users._id` (DBRef), `posts.tagIds → tags._id` (several):

| Field | Value | Targets |
| --- | --- | --- |
| `customer` of an order | `ObjectId("65f1c0a2b3d4e5f6a7b8c9aa")` | `users` with `{ _id: ObjectId("65f1c0a2b3d4e5f6a7b8c9aa") }`, label `users._id`, 1 |
| `tagIds` of an order | `[ObjectId("…01"), ObjectId("…02"), ObjectId("…01")]` | `tags` with `{ _id: { $in: [ObjectId("…01"), ObjectId("…02")] } }`, 2 |
| `tagIds` of an order | `[ObjectId("…01")]` | `tags` with `{ _id: ObjectId("…01") }`, 1 |
| `customerEmail` of an order | `"ada@example.com"` | `users` with `{ email: "ada@example.com" }`, label `users.email` |
| `owner` of an order | `ObjectId("…aa")` | `users` with `{ _id: ObjectId("…aa") }` and `admins` with the same filter |
| `author` of a post | `{ $ref: "users", $id: ObjectId("…aa") }` | `users` with `{ _id: ObjectId("…aa") }` |
| `author.$id` of a post, in an expanded column | `ObjectId("…aa")` | `users` with `{ _id: ObjectId("…aa") }` |
| `author` of a post | `{ $ref: "users", $id: ObjectId("…aa"), $db: "crm" }` in `shop` | none |
| `customer` of an order | `null`, `""`, `true`, a date | none |
| `total` of an order | `42.5` | none: the field is not a reference |

Acceptance:

- [ ] The examples above give the targets shown.
- [ ] A number that is a `Long` is written `NumberLong(7)` in the filter, a UUID as `UUID("…")`.
- [ ] An array holding a null, a string and two equal ObjectIds, in a field that refers to `tags`, gives `{ _id: {
  $in: ["a", ObjectId("…01")] } }`: the null is dropped, the duplicate counted once.
- [ ] The relation of a view to its source collection never gives a target.

### `relation.referrers` — Which documents refer to a document

Works out, from the references of a database, the collections and the filters that find the documents referring to
a document.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/relation/referrers.ts › referencingTargets(incoming, document)`
- **Uses**: `relation.detect`, `relation.fields`, `query.format`.
- **Ported from**: `src/shared/references.ts › collectionReferences`, `referencingTargets`, `isReferenceValue`.

Inputs: the **incoming** references of a collection, which are the relations of the database, views left out, that
reach one of its fields; a document of that collection. Output: targets, each with a collection, a filter in mongosh
syntax and a label.

Rules:

1. For each incoming reference whose reached field (`_id` or a unique field) has, in the document, a value that can
   be a reference (rule 2 of `relation.targets`): the referring collection, filtered on its field with that value,
   `{ userId: <_id> }`; for a DBRef field, `{ "author.$id": <_id> }`. A field inside an array is written the same
   way: MongoDB matches the documents whose array holds the value.
2. The label is the referring collection and the label of its field (`relation.fields`): `orders.userId`,
   `posts.comments[].authorId`; an array of values has no `[]`: `posts.tagIds`.
3. Two references that give the same collection and the same filter give one target. The targets are sorted by
   label.

Worked examples, with the references of `relation.targets`:

| Document | Targets |
| --- | --- |
| a user with `_id` `ObjectId("…aa")` and `email` `"ada@example.com"` | `orders` with `{ customer: ObjectId("…aa") }`, label `orders.customer`; `orders` with `{ customerEmail: "ada@example.com" }`; `orders` with `{ owner: ObjectId("…aa") }`; `posts` with `{ "author.$id": ObjectId("…aa") }`, label `posts.author` |
| a user with `_id` `ObjectId("…ab")` and no `email` | the same without `orders.customerEmail` |
| a tag with `_id` `ObjectId("…01")` | `orders` with `{ tagIds: ObjectId("…01") }`, label `orders.tagIds`; `posts` with `{ tagIds: ObjectId("…01") }` |
| an admin with `_id` `ObjectId("…ac")` | `orders` with `{ owner: ObjectId("…ac") }` |
| an order | none: nothing refers to `orders` |

Acceptance:

- [ ] The examples above give the targets shown.
- [ ] The targets of a user are in the order `orders.customer`, `orders.customerEmail`, `orders.owner`,
  `posts.author`.
- [ ] A document whose `_id` is a sub-document gives no target for the references to `_id`.
- [ ] The relation of a view to its source collection never gives a target.

### `relation.open-referenced` — Open the documents a field refers to

Opens the collection a reference leads to, filtered on the documents the value names.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/relation/open-referenced.ts › plan(context, answers)`
- **Entry points**: a line of **Go from here** in the inspector island (`@inspector`); `Ctrl`+click on a cell that
  holds a reference and `Ctrl+Enter` on the selected cell (`@table`); **Open referenced document** and **Open
  referenced documents** in the context menu of the cell (`@cell-menu`).
- **Offered when**: `relation.targets` gives at least one target for the field and its value.
- **Asks**: when the field refers to several collections and the request did not come from a line that names one:
  pick one, under the heading **Open the referenced document in**, among the labels of the targets (`users._id`,
  `admins._id`), each with its filter as tooltip.
- **Plan**: one app step: `open shop.users with the filter { _id: ObjectId("65f1c0a2b3d4e5f6a7b8c9aa") }`. The sort
  and the projection are empty.
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone: nothing is written; `nav.back` returns to where the user was.
- **After**: the collection tab of the target is active on its Documents section with the query run (`query.run`).
  A reference whose document no longer exists shows the table empty, as any filter that finds nothing.
- **Commands**: `relation.open-referenced`.
- **Uses**: `relation.targets`, `relation.follow`, `tab.open`, `query.bar`, `query.run`, `runner.ask`, `nav.back`.
- **Ported from**: `src/webview/main.ts › followReference`, `openTarget`, `referenceItems`;
  `src/collectionPanel.ts` (`openReference`).

Acceptance:

- [ ] `Ctrl`+click on the `customer` cell of an order opens `shop.users` with the filter `{ _id:
  ObjectId("65f1c0a2b3d4e5f6a7b8c9aa") }` and the table shows that user.
- [ ] On a cell holding 3 references the menu entry is **Open referenced documents** and the filter is `{ _id: {
  $in: [ … ] } }` with the 3 values.
- [ ] On a field that refers to `users` and `admins`, `Ctrl+Enter` asks **Open the referenced document in** with
  `users._id` and `admins._id`; choosing `admins._id` opens `shop.admins`; closing the question opens nothing.
- [ ] The line `customer → users` of **Go from here** opens `shop.users` without asking, also when the field refers
  to `admins` too.
- [ ] A reference to a unique field opens the filter on that field: `{ email: "ada@example.com" }`.
- [ ] A referenced document that was deleted gives an empty table and no error.
- [ ] After following a reference, `nav.back` returns to the tab and the query the user came from.
- [ ] On a read-only connection the reference is followed and the target opens read-only.

### `relation.open-referencing` — Open the documents that refer to a document

Opens a collection whose field refers to the collection of a document, filtered on the documents that refer to that
one.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/relation/open-referencing.ts › plan(context, answers)`
- **Entry points**: a line under **Referenced by** in the inspector island (`@inspector`); an entry of the submenu
  of **Find referencing documents** in the context menu of a row (`@row-menu`).
- **Offered when**: `relation.referrers` gives at least one target for the document.
- **Plan**: one app step: `open shop.orders with the filter { userId: ObjectId("65f1c0a2b3d4e5f6a7b8c9aa") }`. The
  sort and the projection are empty.
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone: nothing is written; `nav.back` returns to where the user was.
- **After**: the collection tab of the referring collection is active on its Documents section with the query run
  (`query.run`).
- **Uses**: `relation.referrers`, `relation.follow`, `tab.open`, `query.bar`, `query.run`, `nav.back`.
- **Ported from**: `src/webview/main.ts › referenceItems`, `openTarget`; `src/shared/references.ts ›
  referencingTargets`.

Acceptance:

- [ ] On a user that `orders.userId` refers to, **Find referencing documents** › `orders.userId` opens `shop.orders`
  with the filter `{ userId: ObjectId("65f1c0a2b3d4e5f6a7b8c9aa") }`.
- [ ] `posts.tagIds` on a tag opens `shop.posts` with `{ tagIds: ObjectId("…01") }`, and the table shows the posts
  whose array holds that tag.
- [ ] `posts.comments[].authorId` on a user opens `shop.posts` with `{ "comments.authorId": ObjectId("…aa") }`.
- [ ] A collection that refers to itself (`categories.parentId → categories._id`) is listed, and opens the same
  collection with `{ parentId: <the _id> }`.
- [ ] A field that holds DBRefs opens the filter `{ "author.$id": <the _id> }`.
- [ ] A collection that nothing refers to has no **Find referencing documents** in its row menu and no **Referenced
  by** in the inspector island.
- [ ] No document referring to the selected one gives an empty table and no error.
