# Schema analysis

What the documents of a collection really contain: the Schema section reads a sample of the documents that match the
filter and shows, for each field, in how many documents it is present, with which BSON types, and with which values or
in which range. A click on a value, a range or a type adds it to the filter and analyzes the narrower set.

The `$jsonSchema` rules generated from an analysis are `manage.generate-json-schema`; the documents generated from one
are `transfer.generate`.

### `schema.show` — The Schema section

The fields of the sample in a table, one row per field, with nested fields under the field they belong to.

- **Kind**: View
- **Engine**: MongoDB
- **Function**: `src/features/schema/show.ts › view(state)`
- **Entry points**: **Schema** in the section bar of a collection tab (`@section-bar`); Go to (**Schema**).
- **Offered when**: the active tab is a collection tab, of a collection or of a view.
- **Reads**: `schema.sample`, each time the section is shown, on **Analyze**, and when **Sample** changes.
- **Commands**: `schema.show`
- **Uses**: `schema.sample`, `schema.analyze`, `schema.histogram`, `schema.share`, `schema.filter-from-value`,
  `query.bar`, `manage.edit-validation`, `transfer.generate`.
- **Ported from**: `src/webview/schemaView.ts` (`SchemaView`), `src/collectionPanel.ts` (the Schema tab of `html`),
  `src/webview/main.ts` (`runSchema`, `setMode`).

The section uses the filter of the query bar; the sort, the projection and the pipeline are not used. While it is
shown, the button of the query bar reads **Analyze**.

What it shows, top to bottom:

1. A toolbar (`@toolbar`): on the left the line of the analysis, *Random sample of 1,000 out of 52,310 documents · 84
   ms*, or *All 4 documents · 12 ms* when every matching document was read; on the right **Sample** with the sizes
   100, 1,000 and 10,000 (*Documents analyzed: a random sample when more match the filter*), **Validation rules…**
   (not on a view), **Generate…**, **Expand all** and **Collapse all**.
2. The table, with the columns **Field**, **Present**, **Types** and **Values**, the fields in the order in which the
   sample first shows them.
3. Under the table, when it applies: *Too many different fields: only the first 500 were analyzed.*

The columns:

- **Field**: the name. A field with nested fields has ▸ before its name; a click on the name shows them under it,
  indented, and ▾. The nested fields are those of its object values and those of the objects in its arrays. On hover,
  the whole path, with `[]` after each array: `items[].sku`. A field whose objects have more than 500 different names
  is followed by *(500+ fields)*.
- **Present**: a bar and the share (`schema.share`) of the documents that have the field, `null` included; for a
  nested field, of the objects that could have it. On hover, *In 2 of 4, missing in 2* or *In all 4*.
- **Types**: with one type, its name; with several, a bar divided by type and each name with its share of the values,
  `double 50%`, the most frequent first. A type explains itself as *Filter on total of type double*.
- **Values**, for each type that has something to show, under the name of the type when there are several:
  - a histogram (`schema.histogram`) for numbers and dates with more than 10 distinct values: one bar per range, the
    tallest at full height, with the smallest and the largest value under it; a bar explains itself as *15 – 20: 3.
    Click to filter on this range.*, and an empty range cannot be clicked;
  - otherwise the most frequent values, at most 10, each with its share of the values of that type, and *+12 more*
    when there are others (*+990+ more* when more than 1,000 distinct values were seen); a value explains itself as
    *"paid": 3 of 4. Click to filter on it.*;
  - when every value is different and there are at least two: *all distinct, e.g.* and three of them, without shares;
  - for an array: *1–2 elements, avg 1.5*, or *2 elements* when all have the same length, then the types and the
    values of its elements, as for a field;
  - for objects: *{ 2 fields }*.

  Values are written in mongosh syntax, except dates: `2024-03-01` for midnight UTC, else `2024-03-01 10:20` or
  `2024-03-01 10:20:30`.

States:

- While a sample is read: *Analyzing…* in place of the line, the table of the previous analysis dimmed; the status
  line offers **Cancel** (`runner.cancel`).
- No document matches: *All 0 documents* and *No documents match the filter.*
- The filter is not valid: the filter is marked and *Invalid query syntax — check the highlighted field.* is shown;
  the previous table stays.
- The server answers with an error: its message in place of the table.

The fields that are expanded and the size of the sample are kept with the tab; **Expand all** expands every field with
nested fields at every level, **Collapse all** none.

Acceptance:

- [ ] Showing the section on a collection of 4 documents shows *All 4 documents* and a time, and one row per field of
      the worked example of `schema.analyze`, in its order.
- [ ] On a collection of 52,310 documents with **Sample** at 1,000 the line reads *Random sample of 1,000 out of 52,310
      documents*.
- [ ] In the worked example, `qty` shows 50% under **Present** and *In 2 of 4, missing in 2* on hover; `status` shows
      100% and *In all 4*.
- [ ] `total` shows a bar of three parts and `double 50%`, `int 25%`, `null 25%`; `status` shows `string` alone,
      without a bar.
- [ ] `status` shows the values `"paid"` 75% and `"new"` 25%; `_id` shows *all distinct, e.g.* and three values.
- [ ] `tags` shows *1–2 elements, avg 1.5*, the type `string` and the values `"a"` 67% and `"b"` 33%.
- [ ] A click on `address` shows `city` (100%, *In all 2*) and `zip` (50%, *In 1 of 2, missing in 1*) under it; a
      click on `items` shows `sku` and `qty`, whose paths on hover are `items[].sku` and `items[].qty`.
- [ ] **Expand all** shows the nested fields of every level; **Collapse all** leaves only the fields of the documents.
- [ ] A field of 100 integers from 18 to 77 shows a histogram of 13 bars with `18` and `77` under it.
- [ ] On a view, **Validation rules…** is not shown and the analysis works; **Generate…** is disabled until an
      analysis with at least one document is shown.

### `schema.sample` — The documents that are analyzed

Reads the sample: every document that matches the filter when they are few, a random sample of them otherwise.

- **Kind**: Read
- **Engine**: MongoDB
- **Function**: `src/features/schema/sample.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: **Analyze** in the query bar and `Enter` in the filter, while the Schema section is shown
  (`@query-bar`); **Sample** in the toolbar of the section (`@toolbar`); showing the section.
- **Offered when**: the Schema section of a collection tab is shown.
- **Reads**: two commands, with the filter of the query bar and the size chosen in **Sample**, 100, 1,000 (the one
  chosen at first) or 10,000:
  1. the number of matching documents: `db.orders.estimatedDocumentCount()` when the filter is empty and the tab is
     not of a view, otherwise `db.orders.countDocuments({ status: "paid" }, { maxTimeMS: 60000 })`;
  2. the documents: `db.orders.aggregate([{ $match: { status: "paid" } }, { $sample: { size: 1000 } }], {
     allowDiskUse: true, maxTimeMS: 120000 })` when more documents match than the size, and the same with `{ $limit:
     1000 }` in place of `$sample` when they do not. Without a filter the `$match` stage is left out.
- **After**: the documents go to `schema.analyze`; the section shows the summary, the number of matching documents and
  the time the two commands and the analysis took.
- **Refuses**: a filter that is not valid mongosh or is not an object: *Invalid query syntax — check the highlighted
  field.* (`/invalid-filter`).
- **Commands**: `schema.sample`
- **Uses**: `schema.analyze`, `query.parse`, `runner.cancel`.
- **Ported from**: `src/collectionPanel.ts` (`analyzeSchema`), `src/webview/main.ts` (`runSchema`).

Rules:

- The documents are read with their BSON types kept apart: an Int32 `2` and a Double `2.0` are two types, a Long is
  not a number of JavaScript.
- The number shown as *out of* is the count, or the number of documents read when that is larger, as it can be with an
  estimated count.
- Only the last request counts: the reply of an earlier one that arrives later is dropped.
- Nothing is written; it runs the same through a read-only connection.

Acceptance:

- [ ] With an empty filter on a collection of 52,310 documents and **Sample** at 1,000, the server receives
      `estimatedDocumentCount` and an `aggregate` whose only stage is `{ $sample: { size: 1000 } }`.
- [ ] With the filter `{ status: "paid" }` matching 300 documents, the server receives `countDocuments` with that
      filter and an `aggregate` of `{ $match: { status: "paid" } }` and `{ $limit: 1000 }`, and 300 documents are
      analyzed.
- [ ] On a view with an empty filter, the count is a `countDocuments({})`, not an estimated count.
- [ ] Changing **Sample** to 100 reads again, with `{ $sample: { size: 100 } }`.
- [ ] A field that holds an Int32 in one document and a Double in another is reported with the two types `int` and
      `double`.
- [ ] With the filter `{ status: ` the server receives nothing and the filter is marked as invalid.
- [ ] **Cancel** on the status line while the sample is read ends the command on the server, and the section shows
      *Cancelled* with **Run again**.
- [ ] The sort and the projection typed in the query bar are not sent.

### `schema.analyze` — The summary of a sample of documents

From documents to what the Schema section shows: fields, presence, types, values, ranges, nested fields.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/schema/analyze.ts › schemaSummary(documents, options)`
- **Uses**: `schema.histogram`. Used by `schema.show`, `manage.generate-json-schema`, `transfer.generate`,
  `query.autocomplete` (the field names of a page of results) and the tools of the MCP server that describe a
  collection (`mcp.server`).
- **Ported from**: `src/shared/schema.ts` (`analyzeSchema`, `bsonType`, `FieldAcc`, `typeSchema`, `typeDetails`),
  `test/unit/schema.test.ts`.

Input: documents with their BSON types. Output: the number of documents analyzed and, for each field, its name, its
path, its label, `count`, `of`, its types and its nested fields.

Rules:

- **Fields**: one per name, in the order in which the names first appear. `count` is the number of documents that
  have the field, `null` included; `of` is the number of documents.
- **Types**: one of `string`, `int`, `double`, `long`, `decimal`, `bool`, `date`, `objectId`, `null`, `object`,
  `array`, `binData` (a UUID too), `regex`, `timestamp`, `javascript`, `symbol`, `minKey`, `maxKey`, `undefined`,
  `dbPointer`. The types of a field are in order of count, the most frequent first, and with the same count in the
  order in which they were first seen.
- **Nested fields**: the object values of a field are analyzed as documents are: their fields have the path
  `address.city`, and `of` is the number of object values of the parent.
- **Arrays**: a type `array` has the smallest, the largest and the average length, to one decimal, and its elements
  described as one field named `[]`: `count` is the number of elements, `of` the number of arrays. The elements have
  the path of the array, because a filter on the array's path matches a document that contains the value, and the
  label `items[]`; the fields of objects in an array have the path `items.sku` and the label `items[].sku`. An array
  with no elements in the whole sample has lengths and no elements.
- **Values**: for `string`, `int`, `double`, `long`, `decimal`, `bool`, `date` and `objectId`, the distinct values are
  counted, up to 1,000 of them: values first seen after the thousandth are not counted, and the type is marked as
  having more. Numbers and dates also have their smallest and largest value, `NaN` apart.
- **Histogram or frequent values**: a number or date type with more than 10 distinct values, or more than 1,000, and
  a smallest value below its largest, has the ranges of `schema.histogram`. Every other value type has its 10 most
  frequent values with their counts, the most frequent first, and with the same count the first seen first.
- **Other types** (`null`, `binData`, `regex`…) have their count only.
- **Limit**: in one object, or in the documents taken together, at most 500 different names are analyzed; the names
  seen after them are skipped and the object, or the summary, is marked as having more.
- A value that is not a document is skipped and not counted among the documents analyzed.
- **With details** (asked by `transfer.generate`), each type also has: every distinct value with its count when there
  are at most 200 and they take at most 50,000 characters; for strings the smallest, largest and average length; for
  `double` and `decimal` the most digits after the decimal point, at most 15; for dates whether all are at midnight
  UTC; for arrays the 20 most frequent lengths with their counts; for the other types the first value seen, a binary
  value cut to 256 characters of base64.

Worked example. The sample:

```js
{ _id: ObjectId("65f1c0de9a1b2c3d4e5f6a01"), status: "paid", total: 42.5, qty: 2,
  address: { city: "Milano", zip: "20100" },
  items: [{ sku: "A1", qty: 1 }, { sku: "B2", qty: 3 }], tags: ["a", "b"] }
{ _id: ObjectId("65f1c0de9a1b2c3d4e5f6a02"), status: "new", total: 12, qty: NumberLong(5),
  address: { city: "Roma" }, items: [], tags: ["a"] }
{ _id: ObjectId("65f1c0de9a1b2c3d4e5f6a03"), status: "paid", total: null, address: "unknown",
  items: [{ sku: "A1", qty: 2 }] }
{ _id: ObjectId("65f1c0de9a1b2c3d4e5f6a04"), status: "paid", total: 7.0 }
```

gives 4 documents analyzed and:

| Field (label) | `count` of `of` | Types | Values |
| --- | --- | --- | --- |
| `_id` | 4 of 4 | `objectId` 4 | 4 distinct, each once |
| `status` | 4 of 4 | `string` 4 | `"paid"` 3, `"new"` 1 |
| `total` | 4 of 4 | `double` 2, `int` 1, `null` 1 | `double`: 42.5 and 7, smallest 7, largest 42.5; `int`: 12 |
| `qty` | 2 of 4 | `int` 1, `long` 1 | `int`: 2; `long`: 5 |
| `address` | 3 of 4 | `object` 2, `string` 1 | `string`: `"unknown"` 1 |
| `address.city` | 2 of 2 | `string` 2 | `"Milano"` 1, `"Roma"` 1 |
| `address.zip` | 1 of 2 | `string` 1 | `"20100"` 1 |
| `items` | 3 of 4 | `array` 3 | lengths 0 to 2, average 1 |
| `items[]` | 3 of 3 | `object` 3 | |
| `items[].sku` | 3 of 3 | `string` 3 | `"A1"` 2, `"B2"` 1 |
| `items[].qty` | 3 of 3 | `int` 3 | 1, 2 and 3, smallest 1, largest 3 |
| `tags` | 2 of 4 | `array` 2 | lengths 1 to 2, average 1.5 |
| `tags[]` | 3 of 2 | `string` 3 | `"a"` 2, `"b"` 1 |

Acceptance:

- [ ] The worked example gives exactly the rows of the table, in that order, `address.city` and `address.zip` nested
      in `address`, `items[].sku` and `items[].qty` in the elements of `items`.
- [ ] The path of `items[].sku` is `items.sku`, and the path of the elements of `tags` is `tags`.
- [ ] `total` in the example has `double` before `int` and `null`, and `7.0` counts as a `double`.
- [ ] A field with the values 1 to 10 has the ten values and no ranges; with the values 1 to 11 it has ranges and no
      list of values.
- [ ] A string field with 1,500 different values reports 1,000 distinct values and that there are more, with its 10
      most frequent among the first thousand.
- [ ] A document with 600 fields gives 500 fields and the mark that there are more; an object value with 600 fields
      gives the same mark on its field.
- [ ] A field that is `[]` in every document has the type `array` with the lengths 0 to 0 and no elements.
- [ ] A `double` field with a `NaN` among its values counts it in the type and leaves it out of the smallest and the
      largest value.
- [ ] Asked with details, a field with 3 distinct strings has the three with their counts and the lengths of the
      strings; asked without, it has none of them.

### `schema.histogram` — The ranges of a histogram

Divides the numbers or the dates of a field into about twelve ranges with round bounds.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/schema/histogram.ts › ranges(values, type)`
- **Ported from**: `src/shared/schema.ts` (`histogram`, `niceStep`, `DATE_STEPS`, `BINS`).

Rules:

- Input: the values of one type of one field, as numbers (dates as milliseconds), with the smallest below the
  largest. Output: ranges, each with `from` (included), `to` (excluded) and a count.
- The raw width is the largest value minus the smallest, divided by 12.
- For numbers the width is the raw width rounded up to 1, 2, 2.5, 5 or 10 times a power of ten; for `int` and `long`
  2.5 is not used and the width is at least 1 and a whole number.
- For dates the width is the first of these that is not below the raw width: 1, 5, 15 and 30 seconds; 1, 5, 15 and 30
  minutes; 1, 3, 6 and 12 hours; 1, 2, 7, 14, 30, 91, 182 and 365 days; beyond that, a whole number of times 365 days.
- The first range starts at the largest multiple of the width that is not above the smallest value; dates count from
  1970-01-01 UTC. Ranges follow one another until the one that holds the largest value.
- The bounds of numbers are rounded to 12 significant digits; the bounds of dates are dates.
- A range without values is kept, with the count 0.

Worked examples (values → width, ranges):

- 100 `int` values from 18 to 77 → raw width 4.92, width 5; 13 ranges, `15 – 20` to `75 – 80`.
- 100 `double` values from 1 to 37.63 → raw width 3.05, width 5; 8 ranges, `0 – 5` to `35 – 40`.
- `int` values from 1000 to 1300 → raw width 25, width 50; 7 ranges, `1000 – 1050` to `1300 – 1350`. The same as
  `double` → width 25; 13 ranges, `1000 – 1025` to `1300 – 1325`.
- `double` values from 0.02 to 0.98 → raw width 0.08, width 0.1; 10 ranges, `0 – 0.1` to `0.9 – 1`.
- 100 dates from 2024-01-01 to 2024-10-24 → raw width 24.75 days, width 30 days; 11 ranges, from `2023-12-19 –
  2024-01-18` to `2024-10-14 – 2024-11-13`.
- Dates from 10:00:00 to 10:09:00 of one day → raw width 45 seconds, width 1 minute; 10 ranges, one per minute.

Acceptance:

- [ ] The six worked examples give exactly these widths and ranges.
- [ ] Every value is counted in exactly one range, and the counts add up to the number of values.
- [ ] A value equal to a bound is counted in the range that starts with it: 20 is in `20 – 25`.
- [ ] `int` values from 1 to 15 give the width 2, never 1.25 or 2.5.
- [ ] Bounds such as 0.30000000000000004 are written `0.3`.
- [ ] Dates 30 years apart give ranges of 1,095 days.

### `schema.share` — How a share is written

The percentage shown beside a presence, a type or a value.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/schema/share.ts › share(count, of)`
- **Ported from**: `src/webview/schemaView.ts` (`pct`).

Rules: the share is `count` divided by `of`, as a percentage, followed by `%`. From 99.95, and below 0.05, it is
rounded to a whole number; below 10 it has one decimal; otherwise it is rounded to a whole number. With `of` at 0
nothing is written.

Worked examples (count of → share):

- 4 of 4 → `100%`; 3 of 4 → `75%`; 1 of 3 → `33%`; 2 of 3 → `67%`; 1 of 10 → `10%`.
- 1 of 40 → `2.5%`; 3 of 1,000 → `0.3%`; 99 of 1,000 → `9.9%`.
- 1 of 10,000 → `0%`; 9,999 of 10,000 → `100%`; 994 of 1,000 → `99%`.
- 0 of 4 → `0%`; 1 of 0 → nothing.

Acceptance:

- [ ] The worked examples give exactly these texts.
- [ ] No share has more than one decimal, and none is written with a decimal at 10 or above.
- [ ] A presence of 995 documents of 1,000 reads `100%`, and its hover text still says *In 995 of 1,000, missing in
      5*.
- [ ] The shares of the types of a field are of the values of the field, not of the documents: a field present in 2
      of 4 documents, once as `int` and once as `long`, reads `int 50%` and `long 50%`.

### `schema.filter-from-value` — Filter on a value, a range or a type

A click in the Schema section adds a condition on that field to the filter and analyzes what is left.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/schema/filter-from-value.ts › plan(context, answers)`
- **Entry points**: a value, a bar of a histogram and a type in the table of the Schema section (`@table`).
- **Offered when**: the Schema section shows an analysis. A bar of an empty range is not offered.
- **Plan**: one app step, `add status: "paid" to the filter of orders`.
- **Danger**: None
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone from the undo history: it changes the filter of the tab, not a deployment. Editing the
  filter takes the condition away.
- **After**: the filter of the query bar shows the condition, formatted as the query bar formats a filter it changes,
  and blinks once; the query builder follows; the sample is read again (`schema.sample`).
- **Refuses**: a filter that is not valid, or is not an object: *Fix the filter before adding conditions by drag &
  drop:* and the reason; the filter is marked and left as typed (`/invalid-filter`).
- **Uses**: `schema.sample`, `query.bar`, `query.parse`, `query.format`, and the merging of a condition into a filter
  that the query bar does for a value dropped on it.
- **Ported from**: `src/webview/schemaView.ts` (`topValues`, `histogram`, `typeBar`), `src/webview/main.ts`
  (`addCondition`), `src/shared/query.ts` (`mergeCondition`).

The condition, on the path of the field (`schema.analyze`):

| Click on | Condition added |
| --- | --- |
| the value `"paid"` of `status` | `status: "paid"` |
| the bar `15 – 20` of `age` | `age: { $gte: 15, $lt: 20 }` |
| a bar of the dates of `at` | `at: { $gte: ISODate("2024-01-18T00:00:00.000Z"), $lt: ISODate("2024-02-17T00:00:00.000Z") }` |
| the type `double` of `total` | `total: { $type: "double" }` |
| the value `"a"` of the elements of `tags` | `tags: "a"` |
| the value `"A1"` of `items[].sku` | `"items.sku": "A1"` |

A condition made of operators is merged with the operators the filter already has on the field; a value replaces what
the filter had on it.

Acceptance:

- [ ] With an empty filter, a click on `"paid"` makes the filter `{ status: "paid" }` and the section analyzes the
      documents with that status.
- [ ] Then a click on the bar `15 – 20` of `age` makes it `{ status: "paid", age: { $gte: 15, $lt: 20 } }`.
- [ ] Then a click on the type `int` of `age` makes it `{ status: "paid", age: { $gte: 15, $lt: 20, $type: "int" }
      }`.
- [ ] Then a click on the value `"new"` replaces the condition on `status`.
- [ ] A click on the value `ObjectId("65f1c0de9a1b2c3d4e5f6a01")` of `_id` adds it as an ObjectId, not as a string;
      a click on a `long` value adds a number that matches it.
- [ ] A click on `"A1"` under `items[].sku` gives a filter that matches the documents with at least one such item.
- [ ] With the filter `{ status: ` typed, a click adds nothing and shows *Fix the filter before adding conditions by
      drag & drop:* with the reason.
- [ ] Nothing is sent to the server but the two reads of `schema.sample`.
