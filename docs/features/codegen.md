# Code generation

The query or the pipeline of a collection tab written as code: for mongosh and for the official drivers of Node.js,
Python, Java, C# and Go, as the few lines that make the query or as a whole program that connects, runs it and prints
the results. Every BSON type typed in the query is written with the type of the driver that keeps it: an ObjectId stays
an ObjectId, a date a date, a Long a Long.

Nothing is sent to a server and nothing of the connection is written in the code: a program reads its connection
string from the environment variable `MONGODB_URI`.

### `codegen.show` — The Code section

The code of the query in the query bar, of the pipeline, or of a chart, in the language chosen.

- **Kind**: View
- **Engine**: MongoDB
- **Function**: `src/features/codegen/show.ts › view(state)`
- **Entry points**: **Code** under **More** in the section bar of a collection tab (`@section-bar`); **Code** in the
  query bar and in the toolbar of the pipeline editor (`@query-bar`); **Code** in the Chart section (`chart.show`),
  for the aggregation of the chart; Go to (**Code**).
- **Offered when**: the active tab is a collection tab, of a collection or of a view.
- **Reads**: nothing from a deployment: `codegen.source`, each time the section is shown and each time **Code** is
  pressed.
- **Commands**: `codegen.show`
- **Uses**: `codegen.source`, `codegen.mongosh`, `codegen.nodejs`, `codegen.python`, `codegen.java`, `codegen.csharp`,
  `codegen.go`, `codegen.copy`, `query.bar`, `aggregate.show`, `chart.show`.
- **Ported from**: `src/webview/codeDialog.ts` (`CodeDialog`), `src/webview/main.ts` (`showCode`, the `code` callback
  of the chart), `src/collectionPanel.ts` (the Code dialog of `html`). Mongoster's **Open in Editor** is not ported:
  Datardo has no editor for files of code, and **Copy** takes the code where it is needed.

What it shows, top to bottom:

1. A toolbar (`@toolbar`): the title, *Code · orders · find*, *Code · orders · aggregate (3 stages)* or *Code · orders
   · bar chart*; the languages as tabs, in this order: **mongosh**, **Node.js**, **Python**, **Java**, **C#**, **Go**;
   the checkbox **Full program**, which explains itself as *Imports, connection (MONGODB_URI) and printing the
   results*; and **Copy**.
2. The code, in the monospaced font, on lines that are not wrapped; it can be selected and not edited, and scrolls in
   both directions.

States:

- At first the language is **Node.js** and **Full program** is off. The language and the checkbox are kept with the
  tab.
- Choosing a language or changing the checkbox writes the code again at once.
- A query that cannot be turned into code: the message of `codegen.source`, *Invalid query: Filter must be an object*,
  in place of the code; **Copy** is disabled.
- What is shown is the query as it was when the section was shown or **Code** was last pressed; it is not written
  again at every key typed in the query bar.

Acceptance:

- [ ] **Code** on a tab in **Find** shows the title *Code · orders · find* and the Node.js lines of the worked example
      of `codegen.nodejs` for that filter, projection and sort.
- [ ] Choosing **Python** shows the lines of `codegen.python` for the same query; choosing **Full program** shows
      its program; both choices are the same after the tab is closed and restored.
- [ ] **Code** on a tab in **Aggregate** with three enabled stages and one disabled shows *Code · orders · aggregate (3
      stages)*; with one enabled stage, *aggregate (1 stage)*.
- [ ] **Code** in the Chart section with a Bar chart drawn shows *Code · orders · bar chart* and a pipeline that ends
      with the stages of `chart.pipeline`.
- [ ] With the filter `[1]` the section shows *Invalid query: Filter must be an object*, no code, and **Copy**
      disabled.
- [ ] The languages are a group of tabs for assistive technology, the chosen one is announced as selected, and the
      arrow keys move between them.
- [ ] Showing the section, changing the language and copying send nothing to the server.
- [ ] No code shows the connection string, the user or the password of the connection.

### `codegen.source` — The query that is written as code

What the code is made from: the values of the query bar, of the pipeline or of a chart, with their types.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/codegen/source.ts › codeQuery(source)`
- **Uses**: `query.parse`, `aggregate.build`, `chart.pipeline`. Used by `codegen.show`.
- **Ported from**: `src/webview/codeDialog.ts` (`toCodeQuery`, `open`, `show`), `src/webview/main.ts` (`showCode`, the
  `code` callback of the chart), `src/shared/codegen.ts` (`CodeQuery`, `CodeTarget`).

Output: a find, with a filter, an optional projection and an optional sort; or an aggregate, with its stages; the
names of the database and of the collection, or the view, of the tab; and the words of the title.

Rules:

- **Find**: the filter, the projection and the sort as typed in the query bar, run or not, parsed with their types
  (`query.parse`). An empty filter is `{}`. An empty projection or sort, and one that is `{}`, is left out. The page
  and the page size are not part of the code. The title says *find*.
- **Aggregate**: every enabled stage of the pipeline, whatever stage is shown, each as one document with the name of
  the stage and its body. The title says *aggregate (3 stages)*, counting them.
- **Chart**: the documents the chart reads, then its stages (`chart.pipeline`): with **Data** at **Filter**, a
  `$match` with the filter, left out when the filter is empty; with **Pipeline**, the enabled stages up to the stage
  shown. The title says the type and *chart*: *bar chart*, *histogram chart*.
- What cannot be parsed gives a message and no code: *Invalid query:* followed by *Filter must be an object*,
  *Project must be an object* or *Sort must be an object* for a value that is not a document, and by the parser's
  message otherwise.
- A stage that writes is written like any other: the code is only shown.

The two queries the worked examples of the languages use, on `shop.orders`:

- *the find example*: the filter `{ status: "paid", customer: ObjectId("65f1c0de9a1b2c3d4e5f6a7b"), createdAt: { $gte:
  ISODate("2024-01-01") } }`, the projection `{ total: 1, status: 1 }` and the sort `{ createdAt: -1 }`;
- *the pipeline example*: the stages `$match` `{ status: "paid" }`, `$group` `{ _id: "$customer", total: { $sum:
  "$total" }, orders: { $sum: 1 } }`, `$sort` `{ total: -1 }` and `$limit` `10`.

Worked examples (source → output):

- The find example → a find with the three documents; `customer` is an ObjectId and `createdAt.$gte` a date.
- A filter `{ status: "paid" }` with the sort `{}` and no projection → a find with the filter alone.
- Nothing typed → a find with the filter `{}`.
- The pipeline example with its `$sort` disabled → an aggregate of three stages, titled *aggregate (3 stages)*.
- The pipeline example with its second stage shown → an aggregate of all four stages.
- A Bar chart of `status`, count, top 20, with the filter `{ total: { $gte: 100 } }` → an aggregate of `{ $match: {
  total: { $gte: 100 } } }` and the five stages of the chart, titled *bar chart*.
- The projection `"total"` → *Invalid query: Project must be an object*.
- The filter `{ a: ` → *Invalid query:* and the parser's message.

Acceptance:

- [ ] The eight worked examples give exactly these results.
- [ ] A filter typed and not yet run is the one written as code.
- [ ] The code of a chart of a pipeline shown up to its second stage has two stages before the chart's.
- [ ] On the tab of a view, the name written in the code is the view's.
- [ ] A comment typed in the filter is not in the code, and the values are.

### `codegen.layout` — How the code is laid out

One rule decides where a value is broken over several lines, in every language.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/codegen/layout.ts › laidOut(items, level, style)`
- **Ported from**: `src/shared/codegen.ts` (`layout`, `WIDTH`, the `object` and `initializer` methods of the
  printers), `src/shared/query.ts` (`prettyShell`).

Rules:

- The width is 80 columns.
- A document, an array or a list is written on one line when its text, with the indentation of its level, is not
  longer than 80 columns and none of its items is itself broken. Otherwise each item is on its own line, one level
  deeper, and the closing bracket is on its own line at the level of the opening one.
- What is counted is the value and its indentation: not the key or the declaration before it, nor the punctuation
  after it, so a line can pass 80 columns by the length of those.
- One level of indentation is 2 spaces in mongosh and Node.js, 4 spaces in Python, Java and C#, one tab in Go, which
  counts as one column.
- A value that cannot be broken, a string, a date, a constructor, stays whole, even beyond 80 columns.
- An empty document or array is never broken.
- Go puts a comma after the last item of a broken value, as its formatter does; the others do not.
- Java breaks a document before each `.append(`, one level deeper than the document; C# breaks a document or an array
  into an initializer with `{` and `}` on their own lines.
- A whole program indents the lines of the query by the level it puts them at: 3 levels in Java, 1 in Go, none in
  the others; the 80 columns count that indentation.
- The text ends with one line break and has no spaces at the end of a line.

Worked examples:

- In Node.js `{ total: 1, status: 1 }` fits and stays on one line; the filter of the find example, 129 columns on
  one line, is written on five lines.
- In the pipeline example for mongosh and Node.js, the `$group` stage is 80 columns long and indented by 2, so the
  stage is broken; its body, 68 columns indented by 4, stays on one line.
- In Go the same stage is broken twice, because the body does not fit either.

Acceptance:

- [ ] No value of generated code that can be broken is, with its indentation, longer than 80 columns.
- [ ] The three worked examples are laid out as the worked examples of `codegen.nodejs`, `codegen.mongosh` and
      `codegen.go` show them.
- [ ] A filter with one field and a short value is one line in every language.
- [ ] The same query gives the same text each time, byte for byte.

### `codegen.types` — How each BSON type is written in each language

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/codegen/types.ts › written(value, language)`
- **Uses**: `query.parse` (the values and their types), `codegen.layout`.
- **Ported from**: `src/shared/codegen.ts` (`Printer`, `JsPrinter`, `PyPrinter`, `JavaPrinter`, `CsPrinter`,
  `GoPrinter`, `GO_HELPERS`), `test/unit/codegen.test.ts`.

Rules that hold for every language:

- Strings are written between double quotes, with the escapes of JSON.
- A date is written in UTC, to the millisecond.
- An integer and a double are written as numbers; a number typed `2.0` is written `2`.
- A Long and a Decimal128 are never written as a plain number: their digits are copied as text.
- A document keeps the order of its fields.

**mongosh**: the value as the query bar formats it (`query.format`): `ObjectId("65f1c0de9a1b2c3d4e5f6a7b")`,
`ISODate("2024-03-01T00:00:00.000Z")` for a date typed `ISODate("2024-03-01")`, `NumberLong("5")` for
`NumberLong(5)`, `NumberDecimal("0.10")`, `/^ma/i`, `UUID("3b241101-e2bb-4255-8caf-4136c566a962")`, `BinData(0,
"AQID")`, `Timestamp({ t: 1700000000, i: 1 })`, `MinKey()`, `MaxKey()`, `null`, `NaN`, `Infinity`; keys without
quotes when they are identifiers.

**Node.js**: the names in the third column are imported from the driver in a full program.

| Typed | Written | Imports |
| --- | --- | --- |
| `ObjectId("65f1c0de9a1b2c3d4e5f6a7b")` | `new ObjectId("65f1c0de9a1b2c3d4e5f6a7b")` | ObjectId |
| `ISODate("2024-03-01T10:20:30.123Z")` | `new Date("2024-03-01T10:20:30.123Z")` | |
| `NumberLong("9007199254740993")` | `Long.fromString("9007199254740993")` | Long |
| `NumberDecimal("0.10")` | `Decimal128.fromString("0.10")` | Decimal128 |
| `42`, `2.5`, `3000000000` | `42`, `2.5`, `3000000000` | |
| `/^ma/i` | `/^ma/i` | |
| `/^ma/x` | `new BSONRegExp("^ma", "x")` | BSONRegExp |
| `UUID("3b241101-e2bb-4255-8caf-4136c566a962")` | `new UUID("3b241101-e2bb-4255-8caf-4136c566a962")` | UUID |
| `BinData(0, "AQID")` | `new Binary(Buffer.from("AQID", "base64"), 0x00)` | Binary |
| `Timestamp({ t: 1700000000, i: 1 })` | `new Timestamp({ t: 1700000000, i: 1 })` | Timestamp |
| `MinKey()`, `MaxKey()` | `new MinKey()`, `new MaxKey()` | MinKey, MaxKey |
| `null`, `true` | `null`, `true` | |
| `NaN`, `Infinity`, `-Infinity` | `NaN`, `Infinity`, `-Infinity` | |
| `[1, "a"]`, `[]` | `[1, "a"]`, `[]` | |
| `{ a: 1 }`, `{ "a b": 1, $gt: 2 }`, `{}` | `{ a: 1 }`, `{ "a b": 1, $gt: 2 }`, `{}` | |

A regular expression is written as a literal when it has a pattern and only the options `i`, `m`, `s`, `u`, with each
`/` of the pattern escaped; otherwise as a `BSONRegExp`.

**Python** (PyMongo): the third column is the import line a full program adds.

| Typed | Written | Imports |
| --- | --- | --- |
| `ObjectId("65f1c0de9a1b2c3d4e5f6a7b")` | `ObjectId("65f1c0de9a1b2c3d4e5f6a7b")` | `from bson import ObjectId` |
| `ISODate("2024-03-01T10:20:30.123Z")` | `datetime(2024, 3, 1, 10, 20, 30, 123000, tzinfo=timezone.utc)` | `from datetime import datetime, timezone` |
| `ISODate("2024-03-01T10:20:00Z")` | `datetime(2024, 3, 1, 10, 20, 0, tzinfo=timezone.utc)` | the same |
| `ISODate("2024-03-01")` | `datetime(2024, 3, 1, tzinfo=timezone.utc)` | the same |
| `NumberLong("9007199254740993")` | `Int64(9007199254740993)` | `from bson.int64 import Int64` |
| `NumberDecimal("0.10")` | `Decimal128("0.10")` | `from bson.decimal128 import Decimal128` |
| `42`, `2.5`, `3000000000` | `42`, `2.5`, `3000000000` | |
| `/^ma/i` | `Regex("^ma", "i")` | `from bson.regex import Regex` |
| `UUID("3b241101-e2bb-4255-8caf-4136c566a962")` | `Binary.from_uuid(UUID("3b241101-e2bb-4255-8caf-4136c566a962"))` | `from uuid import UUID`, `from bson.binary import Binary` |
| `BinData(0, "AQID")` | `Binary(base64.b64decode("AQID"), 0)` | `import base64`, `from bson.binary import Binary` |
| `Timestamp({ t: 1700000000, i: 1 })` | `Timestamp(1700000000, 1)` | `from bson.timestamp import Timestamp` |
| `MinKey()`, `MaxKey()` | `MinKey()`, `MaxKey()` | `from bson.min_key import MinKey`, `from bson.max_key import MaxKey` |
| `null`, `true`, `false` | `None`, `True`, `False` | |
| `NaN`, `Infinity`, `-Infinity` | `float("nan")`, `float("inf")`, `float("-inf")` | |
| `[1, "a"]`, `[]` | `[1, "a"]`, `[]` | |
| `{ a: 1 }`, `{}` | `{"a": 1}`, `{}` | |

The microseconds of a date are written only when it has milliseconds, and the time only when it is not midnight UTC.
The subtype of a binary value is written in decimal.

**Java** (the synchronous driver, `org.bson.Document`): the third column is what a full program imports.

| Typed | Written | Imports |
| --- | --- | --- |
| `ObjectId("65f1c0de9a1b2c3d4e5f6a7b")` | `new ObjectId("65f1c0de9a1b2c3d4e5f6a7b")` | `org.bson.types.ObjectId` |
| `ISODate("2024-03-01T10:20:30.123Z")` | `Date.from(Instant.parse("2024-03-01T10:20:30.123Z"))` | `java.time.Instant`, `java.util.Date` |
| `NumberLong("9007199254740993")` | `9007199254740993L` | |
| `NumberDecimal("0.10")` | `Decimal128.parse("0.10")` | `org.bson.types.Decimal128` |
| `42`, `2.5` | `42`, `2.5` | |
| `3000000000` | `3000000000L` | |
| `/^ma/i` | `new BsonRegularExpression("^ma", "i")` | `org.bson.BsonRegularExpression` |
| `UUID("3b241101-e2bb-4255-8caf-4136c566a962")` | `new BsonBinary(UUID.fromString("3b241101-e2bb-4255-8caf-4136c566a962"))` | `java.util.UUID`, `org.bson.BsonBinary` |
| `BinData(0, "AQID")` | `new Binary((byte) 0x00, Base64.getDecoder().decode("AQID"))` | `java.util.Base64`, `org.bson.types.Binary` |
| `Timestamp({ t: 1700000000, i: 1 })` | `new BsonTimestamp(1700000000, 1)` | `org.bson.BsonTimestamp` |
| `MinKey()`, `MaxKey()` | `new MinKey()`, `new MaxKey()` | `org.bson.types.MinKey`, `org.bson.types.MaxKey` |
| `null`, `true` | `null`, `true` | |
| `NaN`, `Infinity`, `-Infinity` | `Double.NaN`, `Double.POSITIVE_INFINITY`, `Double.NEGATIVE_INFINITY` | |
| `[1, "a"]`, `[]` | `Arrays.asList(1, "a")`, `Arrays.asList()` | `java.util.Arrays` |
| `{ a: 1 }` | `new Document("a", 1)` | |
| `{ "a b": 1, $gt: 2 }` | `new Document("a b", 1).append("$gt", 2)` | |
| `{}` | `new Document()` | |

A whole number beyond 2,147,483,647 in size, which does not fit an `int`, is written with `L`.

**C#** (the .NET driver, `BsonDocument`): a full program needs only its two `using` lines.

| Typed | Written |
| --- | --- |
| `ObjectId("65f1c0de9a1b2c3d4e5f6a7b")` | `new ObjectId("65f1c0de9a1b2c3d4e5f6a7b")` |
| `ISODate("2024-03-01T10:20:30.123Z")` | `new DateTime(2024, 3, 1, 10, 20, 30, DateTimeKind.Utc).AddMilliseconds(123)` |
| `ISODate("2024-03-01")` | `new DateTime(2024, 3, 1, 0, 0, 0, DateTimeKind.Utc)` |
| `NumberLong("9007199254740993")` | `9007199254740993L` |
| `NumberDecimal("0.10")` | `Decimal128.Parse("0.10")` |
| `42`, `2.5` | `42`, `2.5` |
| `3000000000` | `3000000000L` |
| `/^ma/i` | `new BsonRegularExpression("^ma", "i")` |
| `UUID("3b241101-e2bb-4255-8caf-4136c566a962")` | `new BsonBinaryData(Guid.Parse("3b241101-e2bb-4255-8caf-4136c566a962"), GuidRepresentation.Standard)` |
| `BinData(0, "AQID")` | `new BsonBinaryData(Convert.FromBase64String("AQID"), (BsonBinarySubType)0x00)` |
| `Timestamp({ t: 1700000000, i: 1 })` | `new BsonTimestamp(1700000000, 1)` |
| `MinKey()`, `MaxKey()` | `BsonMinKey.Value`, `BsonMaxKey.Value` |
| `null`, `true` | `BsonNull.Value`, `true` |
| `NaN`, `Infinity`, `-Infinity` | `double.NaN`, `double.PositiveInfinity`, `double.NegativeInfinity` |
| `[1, "a"]`, `[]` | `new BsonArray { 1, "a" }`, `new BsonArray()` |
| `{ a: 1 }` | `new BsonDocument("a", 1)` |
| `{ "a b": 1, $gt: 2 }` | `new BsonDocument { { "a b", 1 }, { "$gt", 2 } }` |
| `{}` | `new BsonDocument()` |

A document of one field is written with the constructor of two arguments; one of several fields as an initializer.

**Go** (the driver version 2, `bson.D`): the third column is what the code adds.

| Typed | Written | Adds |
| --- | --- | --- |
| `ObjectId("65f1c0de9a1b2c3d4e5f6a7b")` | `objectID("65f1c0de9a1b2c3d4e5f6a7b")` | the function `objectID` |
| `ISODate("2024-03-01T10:20:30.123Z")` | `bson.NewDateTimeFromTime(time.Date(2024, time.March, 1, 10, 20, 30, 123000000, time.UTC))` | the import `time` |
| `NumberLong("9007199254740993")` | `int64(9007199254740993)` | |
| `NumberDecimal("0.10")` | `decimal128("0.10")` | the function `decimal128` |
| `42`, `2.5`, `3000000000` | `42`, `2.5`, `3000000000` | |
| `/^ma/i` | `bson.Regex{Pattern: "^ma", Options: "i"}` | |
| `UUID("3b241101-e2bb-4255-8caf-4136c566a962")` | `bson.Binary{Subtype: 0x04, Data: []byte{0x3b, 0x24, 0x11, 0x01, 0xe2, 0xbb, 0x42, 0x55, 0x8c, 0xaf, 0x41, 0x36, 0xc5, 0x66, 0xa9, 0x62}}` | |
| `BinData(0, "AQID")` | `bson.Binary{Subtype: 0x00, Data: []byte{0x01, 0x02, 0x03}}` | |
| `Timestamp({ t: 1700000000, i: 1 })` | `bson.Timestamp{T: 1700000000, I: 1}` | |
| `MinKey()`, `MaxKey()` | `bson.MinKey{}`, `bson.MaxKey{}` | |
| `null`, `true` | `nil`, `true` | |
| `NaN`, `Infinity`, `-Infinity` | `math.NaN()`, `math.Inf(1)`, `math.Inf(-1)` | the import `math` |
| `[1, "a"]`, `[]` | `bson.A{1, "a"}`, `bson.A{}` | |
| `{ a: 1 }` | `bson.D{{Key: "a", Value: 1}}` | |
| `{}` | `bson.D{}` | |

An ObjectId and a Decimal128 are made by a small function written after the code, which stops the program when the
text is not valid:

```go
func objectID(hex string) bson.ObjectID {
	id, err := bson.ObjectIDFromHex(hex)
	if err != nil {
		panic(err)
	}
	return id
}

func decimal128(s string) bson.Decimal128 {
	d, err := bson.ParseDecimal128(s)
	if err != nil {
		panic(err)
	}
	return d
}
```

Only the functions the code uses are written, `decimal128` before `objectID`.

Acceptance:

- [ ] Each row of the five tables gives exactly its text, and mongosh the texts of its paragraph.
- [ ] A filter with the Long `9007199254740993` keeps all its digits in every language; none writes
      `9007199254740992`.
- [ ] `NumberDecimal("0.10")` keeps its last zero in every language.
- [ ] `/^ma/i` is a literal in Node.js and `/^ma/x` a `BSONRegExp`; both are a `Regex`, a `BsonRegularExpression` or
      a `bson.Regex` in the other drivers, with the pattern and the options as two strings.
- [ ] A string with a double quote, a backslash and a line break is written with `\"`, `\\` and `\n` in every
      language.
- [ ] A filter with an ObjectId and no Decimal128 has the function `objectID` after its Go code and not `decimal128`.
- [ ] A Python date at 10:20 without seconds is written with `10, 20, 0` and without microseconds.

### `codegen.mongosh` — The code for mongosh

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/codegen/mongosh.ts › mongoshCode(query, target)`
- **Uses**: `codegen.source`, `codegen.types`, `codegen.layout`, `query.format`.
- **Ported from**: `src/shared/codegen.ts` (`shell`), `test/unit/codegen.test.ts`.

Rules:

- A find is `db.getCollection("orders").find(filter)`, with the projection as a second argument when there is one,
  and `.sort(sort)` when there is one; an aggregate is `db.getCollection("orders").aggregate([…])`. The statement ends
  with `;`.
- The collection is always reached with `getCollection`, so that any name works.
- The values are in mongosh syntax, laid out in 80 columns.
- A full program puts `use("shop");` and an empty line before the statement. It can be pasted in mongosh or run as a
  playground (`playground.run`).

Worked examples:

- The find example →

```js
db.getCollection("orders").find({
  status: "paid",
  customer: ObjectId("65f1c0de9a1b2c3d4e5f6a7b"),
  createdAt: { $gte: ISODate("2024-01-01T00:00:00.000Z") }
}, { total: 1, status: 1 }).sort({ createdAt: -1 });
```

- The same as a full program → the line `use("shop");`, an empty line, and the same five lines.
- The pipeline example →

```js
db.getCollection("orders").aggregate([
  { $match: { status: "paid" } },
  {
    $group: { _id: "$customer", total: { $sum: "$total" }, orders: { $sum: 1 } }
  },
  { $sort: { total: -1 } },
  { $limit: 10 }
]);
```

- Nothing typed → `db.getCollection("orders").find({});`

Acceptance:

- [ ] The four worked examples give exactly these texts.
- [ ] A filter with a sort and no projection gives `.find({ … }).sort({ … })` with one argument to `find`.
- [ ] A collection named `my-coll.2024` is written `db.getCollection("my-coll.2024")`.
- [ ] The text parses as JavaScript, and pasted in a playground of the same connection it returns the documents the
      tab shows.

### `codegen.nodejs` — The code for Node.js

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/codegen/nodejs.ts › nodejsCode(query, target)`
- **Uses**: `codegen.source`, `codegen.types`, `codegen.layout`.
- **Ported from**: `src/shared/codegen.ts` (`javascript`, `JsPrinter`), `test/unit/codegen.test.ts`.

Rules:

- The lines of a find declare `filter`, then `projection` and `sort` when there are any, then, after an empty line,
  `cursor`, from `client.db("shop").collection("orders").find(filter, { projection, sort })`; the second argument has
  only the options there are, and is left out without any.
- The lines of an aggregate declare `pipeline` and, after an empty line, `cursor` from `.aggregate(pipeline)`.
- The lines assume a connected `MongoClient` named `client`.
- A full program is an ES module: the line `import { MongoClient, … } from "mongodb";`, with after `MongoClient` the
  BSON classes the values use, in order of their names, capitals first; an empty line; the client, made from the
  environment variable or from `mongodb://localhost:27017`; an empty line; the declarations; an empty line; then a
  `try` block that makes the cursor and prints each document it gives with the log function of the console, inside a
  `for await` loop, and a `finally` block that closes the client.

Worked examples:

- The find example →

```js
const filter = {
  status: "paid",
  customer: new ObjectId("65f1c0de9a1b2c3d4e5f6a7b"),
  createdAt: { $gte: new Date("2024-01-01T00:00:00.000Z") }
};
const projection = { total: 1, status: 1 };
const sort = { createdAt: -1 };

const cursor = client.db("shop").collection("orders").find(filter, { projection, sort });
```

- The same as a full program starts with

```js
import { MongoClient, ObjectId } from "mongodb";

const client = new MongoClient(process.env.MONGODB_URI ?? "mongodb://localhost:27017");
```

  followed by the three declarations above, and ends with

```js
} finally {
  await client.close();
}
```

- The pipeline example →

```js
const pipeline = [
  { $match: { status: "paid" } },
  {
    $group: { _id: "$customer", total: { $sum: "$total" }, orders: { $sum: 1 } }
  },
  { $sort: { total: -1 } },
  { $limit: 10 }
];

const cursor = client.db("shop").collection("orders").aggregate(pipeline);
```

- Nothing typed → `const filter = {};`, an empty line, and `const cursor =
  client.db("shop").collection("orders").find(filter);`

Acceptance:

- [ ] The worked examples give exactly these texts.
- [ ] The full program of the find example has 20 lines; its `try` block holds the line that makes the cursor and a
      `for await` loop of three lines.
- [ ] A filter with a Long, a Decimal128 and the regular expression `/^a/x` imports `MongoClient, BSONRegExp,
      Decimal128, Long`, in that order.
- [ ] A find with a projection and no sort ends with `.find(filter, { projection });`.
- [ ] The lines and the full program parse as an ES module.

### `codegen.python` — The code for Python

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/codegen/python.ts › pythonCode(query, target)`
- **Uses**: `codegen.source`, `codegen.types`, `codegen.layout`.
- **Ported from**: `src/shared/codegen.ts` (`python`, `PyPrinter`), `test/unit/codegen.test.ts`.

Rules:

- The lines of a find declare `query`, then `projection` and `sort` when there are any, then, after an empty line,
  `cursor` from `client["shop"]["orders"].find(query, projection, sort=sort)`; the arguments are only those there are.
- A sort is PyMongo's list of pairs, `[("createdAt", -1)]`, in the order of its fields.
- The lines of an aggregate declare `pipeline` and `cursor` from `.aggregate(pipeline)`.
- The lines assume a `MongoClient` named `client`.
- A full program has: `import os` and the imports of the standard library the values need, `import` lines before
  `from` lines and each kind in order; an empty line; `from pymongo import MongoClient` and the imports of `bson` the
  values need, in order; an empty line; the client, from the environment variable or `mongodb://localhost:27017`, and
  `collection`; an empty line; the declarations; an empty line; a `for` loop over the find or the aggregate of
  `collection` that prints each document.

Worked examples:

- The find example →

```python
query = {
    "status": "paid",
    "customer": ObjectId("65f1c0de9a1b2c3d4e5f6a7b"),
    "createdAt": {"$gte": datetime(2024, 1, 1, tzinfo=timezone.utc)}
}
projection = {"total": 1, "status": 1}
sort = [("createdAt", -1)]

cursor = client["shop"]["orders"].find(query, projection, sort=sort)
```

- The same as a full program →

```python
import os
from datetime import datetime, timezone

from pymongo import MongoClient
from bson import ObjectId

client = MongoClient(os.environ.get("MONGODB_URI", "mongodb://localhost:27017"))
collection = client["shop"]["orders"]

query = {
    "status": "paid",
    "customer": ObjectId("65f1c0de9a1b2c3d4e5f6a7b"),
    "createdAt": {"$gte": datetime(2024, 1, 1, tzinfo=timezone.utc)}
}
projection = {"total": 1, "status": 1}
sort = [("createdAt", -1)]

for doc in collection.find(query, projection, sort=sort):
    print(doc)
```

- The pipeline example →

```python
pipeline = [
    {"$match": {"status": "paid"}},
    {
        "$group": {"_id": "$customer", "total": {"$sum": "$total"}, "orders": {"$sum": 1}}
    },
    {"$sort": {"total": -1}},
    {"$limit": 10}
]

cursor = client["shop"]["orders"].aggregate(pipeline)
```

- Nothing typed → `query = {}`, an empty line, and `cursor = client["shop"]["orders"].find(query)`.
- An empty pipeline → `pipeline = []`.

Acceptance:

- [ ] The worked examples give exactly these texts.
- [ ] A find with a sort and no projection ends with `.find(query, sort=sort)`.
- [ ] A sort `{ status: 1, createdAt: -1 }` is `[("status", 1), ("createdAt", -1)]`.
- [ ] A full program whose filter has a Long, a UUID and a binary value starts with `import os`, `import base64`,
      `from uuid import UUID`, an empty line, `from pymongo import MongoClient`, `from bson.binary import Binary`,
      `from bson.int64 import Int64`.
- [ ] `true`, `false` and `null` in the filter are `True`, `False` and `None`.

### `codegen.java` — The code for Java

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/codegen/java.ts › javaCode(query, target)`
- **Uses**: `codegen.source`, `codegen.types`, `codegen.layout`.
- **Ported from**: `src/shared/codegen.ts` (`java`, `JavaPrinter`), `test/unit/codegen.test.ts`.

Rules:

- A document is `new Document("key", value)` followed by one `.append("key", value)` for each other field.
- The lines of a find declare `Document filter`, then `Document projection` and `Document sort` when there are any,
  then, after an empty line, `FindIterable<Document> results` from
  `collection.find(filter).projection(projection).sort(sort)`, with only the calls there are.
- The lines of an aggregate declare `List<Document> pipeline` as `Arrays.asList(…)`, one stage per line unless the
  whole list, with its indentation, is at most 50 columns long, and `AggregateIterable<Document> results` from
  `collection.aggregate(pipeline)`.
- The lines assume a `MongoCollection<Document>` named `collection`.
- A full program has: the imports, each once, in order as text: the three of the driver's client, `org.bson.Document`
  and those the values need; the class `Main` with `main`; the connection string from the environment variable or
  `mongodb://localhost:27017`; the client in a `try` with resources; `collection`; the declarations; and a `for` loop
  that prints each document as JSON.

Worked examples:

- The find example →

```java
Document filter = new Document("status", "paid")
    .append("customer", new ObjectId("65f1c0de9a1b2c3d4e5f6a7b"))
    .append("createdAt", new Document("$gte", Date.from(Instant.parse("2024-01-01T00:00:00.000Z"))));
Document projection = new Document("total", 1).append("status", 1);
Document sort = new Document("createdAt", -1);

FindIterable<Document> results = collection.find(filter).projection(projection).sort(sort);
```

- The same as a full program →

```java
import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoClients;
import com.mongodb.client.MongoCollection;
import java.time.Instant;
import java.util.Date;
import org.bson.Document;
import org.bson.types.ObjectId;

public class Main {
    public static void main(String[] args) {
        String uri = System.getenv().getOrDefault("MONGODB_URI", "mongodb://localhost:27017");
        try (MongoClient client = MongoClients.create(uri)) {
            MongoCollection<Document> collection = client.getDatabase("shop").getCollection("orders");

            Document filter = new Document("status", "paid")
                .append("customer", new ObjectId("65f1c0de9a1b2c3d4e5f6a7b"))
                .append("createdAt", new Document("$gte", Date.from(Instant.parse("2024-01-01T00:00:00.000Z"))));
            Document projection = new Document("total", 1).append("status", 1);
            Document sort = new Document("createdAt", -1);

            for (Document doc : collection.find(filter).projection(projection).sort(sort)) {
                System.out.println(doc.toJson());
            }
        }
    }
}
```

- The pipeline example →

```java
List<Document> pipeline = Arrays.asList(
    new Document("$match", new Document("status", "paid")),
    new Document("$group", new Document("_id", "$customer")
            .append("total", new Document("$sum", "$total"))
            .append("orders", new Document("$sum", 1))),
    new Document("$sort", new Document("total", -1)),
    new Document("$limit", 10)
);

AggregateIterable<Document> results = collection.aggregate(pipeline);
```

- Nothing typed → `Document filter = new Document();`, an empty line, and `FindIterable<Document> results =
  collection.find(filter);`

Acceptance:

- [ ] The worked examples give exactly these texts.
- [ ] A find with a sort and no projection ends with `collection.find(filter).sort(sort);`.
- [ ] The full program of the pipeline example imports `java.util.Arrays` and `java.util.List`, and its loop is over
      `collection.aggregate(pipeline)`.
- [ ] The number `3000000000` is written `3000000000L`, and `NumberLong(5)` is written `5L`.
- [ ] No import is written twice, and the imports are in order as text.

### `codegen.csharp` — The code for C#

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/codegen/csharp.ts › csharpCode(query, target)`
- **Uses**: `codegen.source`, `codegen.types`, `codegen.layout`.
- **Ported from**: `src/shared/codegen.ts` (`csharp`, `CsPrinter`), `test/unit/codegen.test.ts`.

Rules:

- The lines of a find declare `var filter`, then `var sort` and `var projection` when there are any, in that order,
  then, after an empty line, `var results` from `collection.Find(filter).Sort(sort).Project(projection).ToList()`,
  with only the calls there are.
- The lines of an aggregate declare `var pipeline` as `new[] { … }`, one stage per line between `{` and `}` on their
  own lines unless the whole array is at most 65 columns long, and `var results` from
  `collection.Aggregate<BsonDocument>(pipeline).ToList()`.
- The lines assume an `IMongoCollection<BsonDocument>` named `collection`.
- A full program is made of top-level statements: `using MongoDB.Bson;` and `using MongoDB.Driver;`; an empty line;
  the connection string from the environment variable or `mongodb://localhost:27017`, the client and `collection`;
  an empty line; the declarations; an empty line; a `foreach` loop that prints each document.

Worked examples:

- The find example →

```csharp
var filter = new BsonDocument
{
    { "status", "paid" },
    { "customer", new ObjectId("65f1c0de9a1b2c3d4e5f6a7b") },
    { "createdAt", new BsonDocument("$gte", new DateTime(2024, 1, 1, 0, 0, 0, DateTimeKind.Utc)) }
};
var sort = new BsonDocument("createdAt", -1);
var projection = new BsonDocument { { "total", 1 }, { "status", 1 } };

var results = collection.Find(filter).Sort(sort).Project(projection).ToList();
```

- The same as a full program →

```csharp
using MongoDB.Bson;
using MongoDB.Driver;

var uri = Environment.GetEnvironmentVariable("MONGODB_URI") ?? "mongodb://localhost:27017";
var client = new MongoClient(uri);
var collection = client.GetDatabase("shop").GetCollection<BsonDocument>("orders");

var filter = new BsonDocument
{
    { "status", "paid" },
    { "customer", new ObjectId("65f1c0de9a1b2c3d4e5f6a7b") },
    { "createdAt", new BsonDocument("$gte", new DateTime(2024, 1, 1, 0, 0, 0, DateTimeKind.Utc)) }
};
var sort = new BsonDocument("createdAt", -1);
var projection = new BsonDocument { { "total", 1 }, { "status", 1 } };

foreach (var doc in collection.Find(filter).Sort(sort).Project(projection).ToList())
{
    Console.WriteLine(doc);
}
```

- The pipeline example →

```csharp
var pipeline = new[]
{
    new BsonDocument("$match", new BsonDocument("status", "paid")),
    new BsonDocument("$group", new BsonDocument
    {
        { "_id", "$customer" },
        { "total", new BsonDocument("$sum", "$total") },
        { "orders", new BsonDocument("$sum", 1) }
    }),
    new BsonDocument("$sort", new BsonDocument("total", -1)),
    new BsonDocument("$limit", 10)
};

var results = collection.Aggregate<BsonDocument>(pipeline).ToList();
```

- Nothing typed → `var filter = new BsonDocument();`, an empty line, and `var results =
  collection.Find(filter).ToList();`

Acceptance:

- [ ] The worked examples give exactly these texts.
- [ ] A find with a projection and no sort ends with `collection.Find(filter).Project(projection).ToList();`.
- [ ] `null` in the filter is `BsonNull.Value`, never the `null` of C#.
- [ ] A date with milliseconds ends with `.AddMilliseconds(123)`; one without has no such call.
- [ ] A UUID is written with `GuidRepresentation.Standard`.

### `codegen.go` — The code for Go

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/codegen/go.ts › goCode(query, target)`
- **Uses**: `codegen.source`, `codegen.types`, `codegen.layout`.
- **Ported from**: `src/shared/codegen.ts` (`go`, `GoPrinter`, `GO_HELPERS`), `test/unit/codegen.test.ts`.

Rules:

- The code is for version 2 of the driver. Documents are `bson.D`, which keeps the order of the fields; arrays are
  `bson.A`. It is indented with tabs.
- The lines of a find declare `filter`, then `projection` and `sort` when there are any, then `opts` as
  `options.Find()` with `.SetProjection(projection)` and `.SetSort(sort)`, only when there is one of them; then,
  after an empty line, `cursor, err := collection.Find(ctx, filter, opts)`, without `opts` when it was not declared.
- The lines of an aggregate declare `pipeline` as a `mongo.Pipeline` with one `bson.D` per stage, and `cursor, err :=
  collection.Aggregate(ctx, pipeline)`.
- The lines assume a collection named `collection` and a context named `ctx`.
- The functions the values need (`codegen.types`) follow, after an empty line.
- A full program has: `package main`; the imports in two groups, those of the standard library in order, `context`,
  `fmt`, `os` and those the values need, then the three packages of the driver; `main`, which reads the connection
  string from the environment variable or uses `mongodb://localhost:27017`, connects, defers the disconnection, gets
  `collection`, runs the query, reads every result and prints each, and stops the program at any error; then the
  functions the values need.

Worked examples:

- The find example →

```go
filter := bson.D{
	{Key: "status", Value: "paid"},
	{Key: "customer", Value: objectID("65f1c0de9a1b2c3d4e5f6a7b")},
	{Key: "createdAt", Value: bson.D{
		{Key: "$gte", Value: bson.NewDateTimeFromTime(time.Date(2024, time.January, 1, 0, 0, 0, 0, time.UTC))},
	}},
}
projection := bson.D{{Key: "total", Value: 1}, {Key: "status", Value: 1}}
sort := bson.D{{Key: "createdAt", Value: -1}}
opts := options.Find().SetProjection(projection).SetSort(sort)

cursor, err := collection.Find(ctx, filter, opts)

func objectID(hex string) bson.ObjectID {
	id, err := bson.ObjectIDFromHex(hex)
	if err != nil {
		panic(err)
	}
	return id
}
```

- The same as a full program →

```go
package main

import (
	"context"
	"fmt"
	"os"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

func main() {
	uri := os.Getenv("MONGODB_URI")
	if uri == "" {
		uri = "mongodb://localhost:27017"
	}
	client, err := mongo.Connect(options.Client().ApplyURI(uri))
	if err != nil {
		panic(err)
	}
	ctx := context.Background()
	defer client.Disconnect(ctx)
	collection := client.Database("shop").Collection("orders")

	filter := bson.D{
		{Key: "status", Value: "paid"},
		{Key: "customer", Value: objectID("65f1c0de9a1b2c3d4e5f6a7b")},
		{Key: "createdAt", Value: bson.D{
			{Key: "$gte", Value: bson.NewDateTimeFromTime(time.Date(2024, time.January, 1, 0, 0, 0, 0, time.UTC))},
		}},
	}
	projection := bson.D{{Key: "total", Value: 1}, {Key: "status", Value: 1}}
	sort := bson.D{{Key: "createdAt", Value: -1}}
	opts := options.Find().SetProjection(projection).SetSort(sort)

	cursor, err := collection.Find(ctx, filter, opts)
	if err != nil {
		panic(err)
	}
	var results []bson.M
	if err := cursor.All(ctx, &results); err != nil {
		panic(err)
	}
	for _, doc := range results {
		fmt.Println(doc)
	}
}

func objectID(hex string) bson.ObjectID {
	id, err := bson.ObjectIDFromHex(hex)
	if err != nil {
		panic(err)
	}
	return id
}
```

- The pipeline example →

```go
pipeline := mongo.Pipeline{
	bson.D{{Key: "$match", Value: bson.D{{Key: "status", Value: "paid"}}}},
	bson.D{
		{Key: "$group", Value: bson.D{
			{Key: "_id", Value: "$customer"},
			{Key: "total", Value: bson.D{{Key: "$sum", Value: "$total"}}},
			{Key: "orders", Value: bson.D{{Key: "$sum", Value: 1}}},
		}},
	},
	bson.D{{Key: "$sort", Value: bson.D{{Key: "total", Value: -1}}}},
	bson.D{{Key: "$limit", Value: 10}},
}

cursor, err := collection.Aggregate(ctx, pipeline)
```

- Nothing typed → `filter := bson.D{}`, an empty line, and `cursor, err := collection.Find(ctx, filter)`.

Acceptance:

- [ ] The worked examples give exactly these texts, indented with tabs.
- [ ] A find with only a sort declares `opts := options.Find().SetSort(sort)`; one with neither declares no `opts`.
- [ ] A full program whose filter has a date and `NaN` imports `context`, `fmt`, `math`, `os` and `time`, in that
      order, then the three packages of the driver.
- [ ] A filter without a date does not import `time`.
- [ ] Every broken value has a comma after its last item.

### `codegen.copy` — Copy the code

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/codegen/copy.ts › plan(context, answers)`
- **Entry points**: **Copy** in the toolbar of the Code section (`@toolbar`); Go to (**Copy code**).
- **Offered when**: the Code section shows code.
- **Plan**: one app step, `copy the Python code of orders to the clipboard`.
- **Danger**: None
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone: it changes only the clipboard.
- **After**: the status line says *Copied to the clipboard*.
- **Commands**: `codegen.copy`
- **Uses**: `codegen.show`.
- **Ported from**: `src/webview/codeDialog.ts` (the Copy button), `src/collectionPanel.ts` (the `copy` message).

Acceptance:

- [ ] **Copy** puts on the clipboard exactly the text shown, in the language chosen, with its line breaks, its tabs
      in Go and one line break at the end.
- [ ] With **Full program** on, the whole program is copied.
- [ ] After **Copy**, the status line says *Copied to the clipboard*.
- [ ] When the section shows *Invalid query:*, **Copy** is disabled and Go to does not offer **Copy code**.
- [ ] The text copied holds no connection string and no password.
