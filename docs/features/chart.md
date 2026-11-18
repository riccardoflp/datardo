# Charts

The Chart section draws the documents of a collection tab as a bar, line, pie or scatter chart or as a histogram. The
numbers are computed by the server: Datardo adds a few stages to the filter, or to the pipeline of the tab, runs the
aggregation and draws its output, so a chart of a collection of any size reads only the few documents it shows. A
click on a bar or a slice shows the documents behind it, and the chart is saved as a picture.

The stages need MongoDB 5.0 for a histogram (`$setWindowFields`) and for dates grouped by a unit (`$dateTrunc`);
everything else runs on every version Datardo supports.

### `chart.show` — The Chart section

The chart type, its fields and options, and the chart under them.

- **Kind**: View
- **Engine**: MongoDB
- **Function**: `src/features/chart/show.ts › view(state)`
- **Entry points**: **Chart** in the section bar of a collection tab (`@section-bar`); Go to (**Chart**).
- **Offered when**: the active tab is a collection tab, of a collection or of a view.
- **Reads**: `chart.draw`, when the section is shown with a category or a field already chosen, on **Draw**, and each
  time a choice that is complete changes.
- **Commands**: `chart.show`
- **Uses**: `chart.options`, `chart.draw`, `chart.data`, `chart.filter-from-mark`, `chart.save-picture`,
  `codegen.show`, `query.bar`, `query.autocomplete`, `aggregate.show`, `window.theme`.
- **Ported from**: `src/webview/chartView.ts` (`ChartView`), `src/webview/chartjs.ts`, `src/collectionPanel.ts` (the
  Chart tab of `html`), `src/webview/main.ts` (`runChart`, `setChartSource`, `updateChartPipelineInfo`).

What it shows, top to bottom:

1. A first row (`@toolbar`): the chart types **Bar** (*Count or measure per category*), **Line** (*Count or measure
   along a field, usually a date*), **Pie** (*Share of each category*), **Scatter** (*Two number or date fields of a
   random sample of documents*) and **Histogram** (*Distribution of a number or date field*); **Data**, with **Filter**
   and **Pipeline**; on the right **Code** and **Save picture…**.
2. A second row, with the fields of the type (`chart.options`) and **Draw**:

   | Type | Controls, in order |
   | --- | --- |
   | Bar, Line | **Category**, the unit of its dates, **Value**, its field, **Series**, **Top** (Bar) or **Points** (Line) |
   | Pie | **Category**, **Value**, its field, **Top** |
   | Scatter | **X**, **Y**, **Series**, **Sample** |
   | Histogram | **Field**, **Bins** |

   The unit of the dates is one of *exact values*, *by hour*, *by day*, *by week*, *by month*, *by year*. **Value** is
   one of *count*, *sum of*, *average of*, *minimum of*, *maximum of*; its field is shown for every value but *count*.
   **Series** is empty at first and reads *none*.
3. The line of the chart: what was drawn and the time, *20 categories (the top 20) · 31 ms* (`chart.data`).
4. The chart, which fills the rest of the section and follows its size.

**Data** says which documents are charted: with **Filter**, those that match the filter of the query bar, whose sort
and projection are not used; with **Pipeline**, the output of the pipeline of the tab up to the stage shown
(`aggregate.show`), and beside it *Aggregate: 2 stages* or *Aggregate: 2 stages (up to 2)*, counting the enabled ones,
or *Aggregate: no stages*. Each time the section is shown, **Data** follows the mode of the query bar.

The fields are typed, with the field names as suggestions: with **Filter** those of the collection, with **Pipeline**
those the stage shown puts out; fields that hold only objects are not suggested. A path such as `address.city` can be
typed.

The chart:

- Bar and histogram start the value axis at zero. The category axis is titled with the field, `createdAt (month)`
  with a unit; the value axis with *documents* or the measure, *sum of total*.
- A legend is shown when there are several series; a pie has its legend on the right, and each slice says its value
  and its share with one decimal, *700 (69.7%)*.
- A line is filled under it when it is alone; its points are drawn up to 100 categories and left out above; a
  category a series has no value for leaves no gap.
- The histogram's bars touch. A point of a scatter chart says *qty 2, total 42.5*, with the name of its series before
  it when there are several.
- The colors are the 12 chart colors of the theme, used again from the first beyond 12; text, grid and background are
  the theme's, and the chart is drawn again when the theme changes.
- When the bars and slices can be clicked (`chart.filter-from-mark`), the pointer shows it and each says *Click to show
  the documents*.

States:

- Nothing chosen and nothing drawn yet: *Choose the fields of the chart, then Draw.*
- While the aggregation runs: the chart drawn before stays, dimmed; the status line offers **Cancel**
  (`runner.cancel`).
- Nothing to draw: *No documents to chart.*; for a scatter chart *No documents have numbers or dates in both qty and
  total.*; for a histogram *No documents have a number or a date in total.*; the line shows the time alone.
- An option is missing or wrong: its control is marked and the message of `chart.options` is shown; nothing runs.
- The server answers with an error: its message is shown and the chart drawn before stays, dimmed.

The type, the fields and the options are kept with the tab.

Acceptance:

- [ ] Showing the section for the first time shows the type **Bar**, **Value** at *count*, **Top** at 20 and *Choose
      the fields of the chart, then Draw.*, and sends nothing to the server.
- [ ] Typing `status` in **Category** and pressing `Enter`, or **Draw**, draws one bar per status, the largest first.
- [ ] Choosing a field from the suggestions, changing **Value**, the unit of the dates, the type or **Data** draws
      again without **Draw** when the options are complete.
- [ ] With **Value** at *count* the field of the value is not shown; at *sum of* it is.
- [ ] **Pie** shows neither the unit of the dates nor **Series**; **Histogram** shows only **Field** and **Bins**.
- [ ] Coming from a tab in **Aggregate**, **Data** reads **Pipeline** and the chart is of the output of the stage
      shown; coming from **Find**, it reads **Filter**.
- [ ] **Save picture…** is disabled until a chart is drawn.
- [ ] After the theme changes from dark to light, the chart has the light theme's text, grid and background.
- [ ] After the tab is closed and restored, the section has the same type, fields and options.
- [ ] The chart has the role of an image and the name *Chart* for assistive technology, and every control can be
      reached and used from the keyboard.

### `chart.options` — The options of a chart

What a chart is made from, what each type uses of it, and what is wrong with it.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/chart/options.ts › chartOptions(input)`
- **Ported from**: `src/shared/chart.ts` (`ChartSpec`, `CHART_LIMITS`, `normalizeSpec`, `specError`),
  `src/webview/chartView.ts` (`setType`, `updateFields`).

Input: the type, the first field (category, x, or the field measured), the second field (the field of the value, or
y), the value (`count`, `sum`, `avg`, `min`, `max`), the series field, the unit of the dates (none, `hour`, `day`,
`week`, `month`, `year`) and the limit. Output: the options the type uses, or a message.

Rules:

- Fields are taken without the spaces around them.
- What a type does not use is dropped: the second field unless the type is Scatter or the value is not `count`; the
  value, which is `count`, for Scatter and Histogram; the series for Pie and Histogram; the unit of the dates for Pie,
  Scatter and Histogram.
- A field is valid when it has no space in it and does not start with `$`.
- The limit, by type:

  | Type | Its name | At first | Most | What it limits |
  | --- | --- | --- | --- | --- |
  | Bar | **Top** | 20 | 500 | *The categories with the largest values* |
  | Pie | **Top** | 10 | 50 | *The categories with the largest values* |
  | Line | **Points** | 500 | 5,000 | *The first points along the category* |
  | Scatter | **Sample** | 1,000 | 20,000 | *Documents in the random sample* |
  | Histogram | **Bins** | 20 | 200 | *Number of bins* |

- Changing the type keeps the limit that was typed, and puts the new type's first value when the limit was the old
  type's first value, was empty, or is above the new type's most.
- The first thing wrong is reported, in this order:

  | Wrong | Message |
  | --- | --- |
  | no valid first field | *Choose the field of the categories* (Bar, Line, Pie), *Choose the field of the x axis* (Scatter), *Choose the field to measure* (Histogram) |
  | Scatter without a valid second field | *Choose the field of the y axis* |
  | a value other than `count` without a valid field | *Choose the field to sum*, *Choose the field to average*, *Choose the field to min*, *Choose the field to max* |
  | a series field that is not valid | *The series field is not valid* |
  | a limit that is not a whole number from 1 to the most | *Top must be from 1 to 500*, with the name and the most of the type |

Worked examples (input → output):

- Bar, `status`, value `count`, second field `total` left from before → Bar of `status`, count, no second field.
- Pie, `status`, series `country`, unit `day` → Pie of `status`, without series and without unit.
- Bar, ` status ` → the field `status`.
- Bar, `$status` → *Choose the field of the categories*.
- Bar, `status`, value `avg`, no second field → *Choose the field to average*.
- Pie, `status`, limit 51 → *Top must be from 1 to 50*.
- Bar with the limit 20, changed to Pie → limit 10; Bar with the limit 30, changed to Pie → limit 30; Bar with the
  limit 300, changed to Pie → limit 10.

Acceptance:

- [ ] The worked examples give exactly these results.
- [ ] Each message of the table is given for its case, and marks its control: the first field, the second field,
      **Series** or the limit.
- [ ] A limit of 0, of 2.5 or left empty is refused with the message of the limit.
- [ ] A field `address.city` is valid; a field `first name` is not.
- [ ] A Histogram never has a series, whatever was typed in **Series** before the type was chosen.

### `chart.pipeline` — The stages a chart adds

The aggregation stages that compute a chart, put after the filter or after the pipeline of the tab.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/chart/pipeline.ts › chartStages(options)`
- **Uses**: `chart.options`. Used by `chart.draw` and, for **Code**, by `codegen.show`.
- **Ported from**: `src/shared/chart.ts` (`chartStages`), `test/unit/chart.test.ts`.

Rules:

- **Bar, Line and Pie** group in two steps. First `$unwind` on the category, keeping documents without it, so that an
  array counts once for each of its elements. Then a `$group` by category, and by series when there is one, with the
  value: `{ $sum: 1 }` for count, `$sum`, `$avg`, `$min` or `$max` of the field otherwise. Then a `$group` by category
  alone, with the total of its values and the list of its series. Then the order and the limit: Bar and Pie keep the
  categories with the largest totals; Line keeps the first in order of category.
- With a unit, the category is `{ $dateTrunc: { date: "$createdAt", unit: "month" } }`: UTC, weeks from Sunday. A
  Bar with a unit takes the periods with the largest totals and then puts them in order of time.
- **Scatter** keeps the documents where both fields are numbers or dates, takes a random sample of them, and reads the
  two fields, and the series field when there is one.
- **Histogram** keeps the documents where the field is a number or a date, turns each value into a double (a date
  into its milliseconds), finds the smallest and the largest over all of them, and counts the documents of each of
  the equal ranges between the two; the largest value falls in the last range.
- The stages hold only plain values, strings and numbers, so they are the same as BSON and as text.

Worked examples (options → stages):

- Bar of `status`, count, top 20 →

  ```js
  { $unwind: { path: "$status", preserveNullAndEmptyArrays: true } }
  { $group: { _id: { x: "$status" }, v: { $sum: 1 } } }
  { $group: { _id: "$_id.x", total: { $sum: "$v" }, items: { $push: { s: "$_id.s", v: "$v" } } } }
  { $sort: { total: -1, _id: 1 } }
  { $limit: 20 }
  ```

- Bar of `status`, sum of `total`, series `country` → the same, with the second stage

  ```js
  { $group: { _id: { x: "$status", s: "$country" }, v: { $sum: "$total" } } }
  ```

- Bar of `createdAt` by month, count, top 20 → the second stage is

  ```js
  { $group: { _id: { x: { $dateTrunc: { date: "$createdAt", unit: "month" } } }, v: { $sum: 1 } } }
  ```

  and a sixth stage follows the limit: `{ $sort: { _id: 1 } }`.

- Line of `createdAt` by day, average of `total`, 500 points → the value is `v: { $avg: "$total" }`, the fourth stage
  `{ $sort: { _id: 1 } }`, the fifth `{ $limit: 500 }`, and there is no sixth.
- Pie of `status`, count, top 10 → the stages of the first example with `{ $limit: 10 }`.
- Scatter of `qty` and `total`, series `status`, sample 1,000 →

  ```js
  { $match: { qty: { $type: ["number", "date"] }, total: { $type: ["number", "date"] } } }
  { $sample: { size: 1000 } }
  { $project: { _id: 0, x: "$qty", y: "$total", s: "$status" } }
  ```

- Histogram of `total`, 20 bins →

  ```js
  { $match: { total: { $type: ["number", "date"] } } }
  { $project: { _id: 0, v: { $toDouble: "$total" }, d: { $eq: [{ $type: "$total" }, "date"] } } }
  { $setWindowFields: { output: { min: { $min: "$v" }, max: { $max: "$v" } } } }
  { $group: { _id: { $min: [19, { $floor: { $multiply: [{ $divide: [{ $subtract: ["$v", "$min"] }, { $max: [{ $subtract: ["$max", "$min"] }, 1e-300] }] }, 20] } }] }, count: { $sum: 1 }, min: { $first: "$min" }, max: { $first: "$max" }, dates: { $max: "$d" } } }
  { $sort: { _id: 1 } }
  ```

Acceptance:

- [ ] The seven worked examples give exactly these stages.
- [ ] On documents whose `tags` are `["a", "b"]`, `["a"]` and missing, a Bar of `tags` counts `a` 2, `b` 1 and no
      value 1.
- [ ] A Scatter without a series has no `s` in its `$project`.
- [ ] A Histogram of 4 bins over the values 0, 10, 60 and 100 counts 2, 0, 1 and 1: 100 is in the last range.
- [ ] A Histogram of a field with one value in every document gives one range holding them all.
- [ ] A Bar by month of dates in three months of 2024 gives its bars in order of time, whatever their totals.
- [ ] Two documents with the same category and different series give one category with two entries in `items`.

### `chart.draw` — Run the aggregation of a chart

- **Kind**: Read
- **Engine**: MongoDB
- **Function**: `src/features/chart/draw.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: **Draw** in the Chart section (`@toolbar`); `Enter` in a field of the section; the button of the
  query bar, which reads **Draw** while the section is shown (`@query-bar`); a change of a complete choice.
- **Offered when**: the Chart section is shown.
- **Reads**: one aggregation: the documents chosen by **Data**, then the stages of `chart.pipeline`.
  - With **Filter**: `db.orders.aggregate([{ $match: { status: "paid" } }, …the chart's stages], { allowDiskUse: true,
    maxTimeMS: 120000 })`; an empty filter adds no `$match`. The sort and the projection are not sent.
  - With **Pipeline**: the enabled stages of the pipeline up to the stage shown (`aggregate.build`), then the chart's
    stages, with the same options.
- **After**: the reply goes to `chart.data` and the chart is drawn, with its line; the options are kept with the tab.
- **Refuses**:
  - options that are missing or wrong, with the message of `chart.options` (`/options`);
  - a filter that is not valid: *Invalid query syntax — check the highlighted field.* (`/invalid-filter`); a stage
    that is not valid, as `aggregate.run` refuses it (`/invalid-stage`);
  - a pipeline whose last stage writes: *A pipeline ending with $out can't be charted: select an earlier stage.*, or
    the same with `$merge` (`/writes`);
  - a histogram, or dates grouped by a unit, on a deployment older than 5.0: *Histograms need MongoDB 5.0 or later:
    this deployment runs 4.4.* and *Grouping dates by month needs MongoDB 5.0 or later: this deployment runs 4.4.*
    (`/unsupported`); *exact values* draws on any version.
- **Commands**: `chart.draw`
- **Uses**: `chart.options`, `chart.pipeline`, `chart.data`, `aggregate.build`, `query.parse`, `runner.cancel`.
- **Ported from**: `src/collectionPanel.ts` (`chart`), `src/webview/main.ts` (`runChart`, `chartSourceOf`). The
  refusal on a deployment older than 5.0 is new in Datardo: Mongoster shows the server's error.

Rules:

- The aggregation is given up after 120 seconds, and may use temporary files on the server.
- Only the last request counts: the reply of an earlier one that arrives later is dropped.
- It writes nothing and runs the same through a read-only connection; it is never recorded among the recent queries.

Acceptance:

- [ ] A Bar of `status` with the filter `{ total: { $gte: 100 } }` sends an `aggregate` whose first stage is `{
      $match: { total: { $gte: 100 } } }` followed by the five stages of `chart.pipeline`.
- [ ] With an empty filter the first stage sent is the `$unwind`.
- [ ] With **Pipeline** and the second of three stages shown, the aggregation starts with the first two stages; a
      disabled stage among them is not sent.
- [ ] A pipeline shown up to a `$out` stage sends nothing and says *A pipeline ending with $out can't be charted:
      select an earlier stage.*
- [ ] With the filter `{ status: ` nothing is sent and the filter is marked.
- [ ] On MongoDB 4.4, **Histogram** sends nothing and says *Histograms need MongoDB 5.0 or later: this deployment
      runs 4.4.*; a Bar of `status` draws.
- [ ] **Cancel** on the status line ends the aggregation on the server; the chart drawn before stays.
- [ ] An error of the server, such as a field of the wrong type for `$dateTrunc`, is shown with the server's words.

### `chart.data` — From the output of the stages to what is drawn

Labels, series, points and the line of the chart, from the documents the aggregation returns.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/chart/data.ts › chartData(options, rows)`
- **Uses**: `chart.options`, `query.format` (values in mongosh syntax).
- **Ported from**: `src/shared/chart.ts` (`toChartData`, `formatLabel`, `formatDate`, `formatNumber`, `dateRange`,
  `toNumber`, `MAX_SERIES`), `src/webview/chartView.ts` (`describe`, `emptyMessage`).

Rules:

- **Labels** of categories and series: *(none)* for `null` and for a missing value; *(empty)* for the empty string; a
  string as it is; a date by the unit, `2024` by year, `2024-01` by month, `2024-03-10` by day and by week,
  `2024-03-10 13:00` by hour, and without a unit `2024-03-10` at midnight UTC or `2024-03-10 13:05`; any other value in
  mongosh syntax, `true`, `42`, `ObjectId("65f1c0de9a1b2c3d4e5f6a7b")`, `{}`.
- **Bar, Line, Pie**: one label per row, in the order of the rows. Without a series field there is one series, named
  *documents* for a count and by the measure otherwise: *sum of total*, *avg of total*, *min of total*, *max of
  total*. With a series field there is one series per value of it, the largest first by the sum of its absolute
  values; a category a series has no value for counts 0, and for a Line has no point.
- **Series limit**: at most 12 series are drawn, the largest, and the line says *3 more series not shown (the 12
  largest are).*
- **Scatter**: one point per row whose two values are numbers or dates, dates as their time; one series per value of
  the series field, the largest first by number of points, at most 12; without a series field, one series named by the
  y field.
- **Histogram**: the ranges are the span from the smallest to the largest value divided by the number of bins; one
  bar per range, 0 for a range the reply does not have. A range reads `0 – 25`: numbers with four significant digits
  and thousands separators, `1,235`, or as `1.23e+9` from a billion and below a thousandth; dates as days when a
  range is a day or more, else with hours and minutes. When the smallest and the largest are equal there is one bar,
  labelled with the value.
- **The condition of a mark**, for `chart.filter-from-mark`: for a category its value, `null` for *(none)*; with a
  unit, the period: from its start to the start of the next, `{ $gte: ISODate("2024-03-10T00:00:00.000Z"), $lt:
  ISODate("2024-03-17T00:00:00.000Z") }` for a week; for a range of a histogram `{ $gte: 0, $lt: 25 }`, and for the
  last `{ $gte: 75, $lte: 100 }`; for a series its value.
- **The line**: for Bar and Pie *3 categories* or *1 category*, followed by *(the top 20)* when as many came as the
  limit; for a Line *500 points (the first 500)*; for a Scatter *1,000 sampled documents*, or *312 documents* when
  fewer came than the sample; for a Histogram *1,204 documents in 20 bins*; then the note about series, then the
  time, joined by ` · `.

Worked examples (options and rows → what is drawn):

- Bar of `status`, count; rows `{ _id: "paid", total: 700, items: [{ v: 700 }] }`, `{ _id: "new", total: 300, items:
  [{ v: 300 }] }`, `{ _id: null, total: 4, items: [{ v: 4 }] }` → labels *paid*, *new*, *(none)*; one series
  *documents* with 700, 300 and 4; conditions `"paid"`, `"new"` and `null`; line *3 categories*.
- Bar of `createdAt` by month; row `{ _id: ISODate("2024-01-01T00:00:00.000Z"), total: 12, items: [{ v: 12 }] }` →
  label `2024-01`; condition `{ $gte: ISODate("2024-01-01T00:00:00.000Z"), $lt:
  ISODate("2024-02-01T00:00:00.000Z") }`.
- Bar of `status`, sum of `total`, series `country`; rows `{ _id: "paid", total: 90, items: [{ s: "IT", v: 60 }, { s:
  "FR", v: 30 }] }`, `{ _id: "new", total: 5, items: [{ s: "FR", v: 5 }] }` → labels *paid*, *new*; series *IT* with 60
  and 0, *FR* with 30 and 5, in that order.
- Histogram of `total`, 4 bins; rows `{ _id: 0, count: 5, min: 0, max: 100, dates: false }`, `{ _id: 3, count: 2, min:
  0, max: 100, dates: false }` → labels `0 – 25`, `25 – 50`, `50 – 75`, `75 – 100`; values 5, 0, 0, 2; conditions `{
  $gte: 0, $lt: 25 }`, `{ $gte: 25, $lt: 50 }`, `{ $gte: 50, $lt: 75 }`, `{ $gte: 75, $lte: 100 }`; line *7 documents
  in 4 bins*.
- Histogram, 4 bins; row `{ _id: 0, count: 7, min: 5, max: 5, dates: false }` → one bar labelled `5` with 7; condition
  `5`; line *7 documents in 1 bin*.
- The period of the hour that starts at `2024-03-10T13:00:00.000Z` → up to `2024-03-10T14:00:00.000Z`; of the month
  of December 2024 → up to `2025-01-01T00:00:00.000Z`.

Acceptance:

- [ ] The six worked examples give exactly these labels, series, conditions and lines.
- [ ] 14 series give 12 drawn and *2 more series not shown (the 12 largest are).* in the line.
- [ ] A Line with the series *IT* missing in one category has no point there and the line goes on across it; a Bar
      has a bar of 0.
- [ ] A row of a Scatter whose `y` is a string is left out; a date on an axis is drawn at its time and the axis
      reads dates.
- [ ] A Long, a Decimal128 and a Double of the same amount give the same height.
- [ ] 20 rows with the limit 20 read *20 categories (the top 20)*; 19 rows read *19 categories*.
- [ ] No rows give no labels, and the section shows the text of its empty state.

### `chart.filter-from-mark` — Show the documents of a bar or a slice

A click on a bar, a point of a line, a slice or a range adds its category, and its series, to the filter and shows the
documents.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/chart/filter-from-mark.ts › plan(context, answers)`
- **Entry points**: a click on a mark of the chart (`@chart`), which says *Click to show the documents*.
- **Offered when**: the chart drawn is a Bar, a Line, a Pie or a Histogram, and **Data** was **Filter** when it was
  drawn. Not for a Scatter, and not for a chart of a pipeline, whose output is not the documents of the collection.
- **Plan**: one app step, `add status: "paid" to the filter of orders`.
- **Danger**: None
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone from the undo history: it changes the filter of the tab, not a deployment. Editing the
  filter takes the condition away, and **Back** returns to the chart.
- **After**: the filter of the query bar has the conditions; the tab shows its Documents section in **Find** and runs
  the query (`query.run`); the filter blinks once.
- **Refuses**: a filter that is not valid: *Fix the filter first:* and the reason (`/invalid-filter`).
- **Uses**: `chart.data` (the condition of a mark), `query.bar`, `query.run`, `query.format`, `nav.back`, and the
  merging of a condition into a filter that the query bar does for a value dropped on it.
- **Ported from**: `src/webview/chartView.ts` (`click`), `src/webview/main.ts` (the `filter` callback of the chart),
  `src/shared/query.ts` (`mergeCondition`).

Rules:

- The condition on the category field is the one `chart.data` gives for the mark; with a series field, a second
  condition is added on it with the value of the series, `null` for *(none)*.
- Conditions are merged into the filter as the query bar does: operators on a field join the operators already
  there, a value replaces what was there.

Worked examples (chart, click → filter, from an empty one):

- Bar of `status`; the bar *paid* → `{ status: "paid" }`.
- Bar of `status` with the series `country`; the part *IT* of the bar *paid* → `{ status: "paid", country: "IT" }`.
- Bar of `createdAt` by week; the bar `2024-03-10` → `{ createdAt: { $gte: ISODate("2024-03-10T00:00:00.000Z"), $lt:
  ISODate("2024-03-17T00:00:00.000Z") } }`.
- Histogram of `total` with 4 bins over 0 to 100; the last bar → `{ total: { $gte: 75, $lte: 100 } }`.
- Bar of `status`; the bar *(none)* → `{ status: null }`.
- Bar of `tags`; the bar *a* → `{ tags: "a" }`, which matches the documents whose array holds it.

Acceptance:

- [ ] The six worked examples give exactly these filters, and the Documents section shows the documents that match.
- [ ] With the filter `{ total: { $gte: 100 } }`, a click on the bar *paid* gives `{ total: { $gte: 100 }, status:
      "paid" }`.
- [ ] The number of documents shown equals the height of the bar clicked, for a count on a field that is not an
      array.
- [ ] With **Data** at **Pipeline**, a click on a bar does nothing and the pointer does not change over it.
- [ ] A click on a point of a Scatter does nothing.
- [ ] A click on an empty part of the chart does nothing.
- [ ] After the click, the Chart section still has its type and its fields when it is shown again.

### `chart.save-picture` — Save the chart as a picture

Writes the chart as it is drawn to a PNG file.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/chart/save-picture.ts › plan(context, answers)`
- **Entry points**: **Save picture…** in the Chart section (`@toolbar`), which explains itself as *Save the chart as a
  PNG image*; Go to (**Save chart as picture…**).
- **Offered when**: a chart is drawn.
- **Asks**: the file, in the system's save dialog titled **Save chart**, for files of the kind *PNG image*, with the
  name of the collection and the type proposed, `orders-bar.png`; each run of the characters `\ / : * ? " < > |` of
  the collection's name is written `_`.
- **Plan**: one file step, `write C:\Users\ada\Pictures\orders-bar.png`.
- **Danger**: None. The system's dialog asks before a file is replaced.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone: the file is written, and deleting it is up to the user.
- **After**: a notification says *Saved the chart to C:\Users\ada\Pictures\orders-bar.png.*
- **Refuses**: a file that cannot be written: *Could not save the chart:* and the reason.
- **Commands**: `chart.save-picture`
- **Uses**: `runner.ask`, `runner.notify`.
- **Ported from**: `src/webview/chartView.ts` (the Export PNG button), `src/collectionPanel.ts` (`savePng`).

Rules:

- The picture is the chart as shown: its size in the window at the resolution of the screen, with the legend and the
  axes, on the background of the theme, not a transparent one.
- The controls of the section and the line of the chart are not in the picture.

Acceptance:

- [ ] **Save picture…** on a Bar chart of `orders` proposes `orders-bar.png`; on a Histogram of `a/b`,
      `a_b-histogram.png`.
- [ ] The file written is a PNG whose size in pixels is that of the chart on screen times the scale of the screen.
- [ ] In the dark theme the picture has the dark background; in the light theme the light one.
- [ ] Cancelling the dialog writes nothing and says nothing.
- [ ] A folder that cannot be written gives *Could not save the chart:* with the system's reason.
- [ ] It works on a read-only connection, and sends nothing to the server.
