# The pipeline editor

Aggregations on a collection or a view: the pipeline editor of the Documents section, with its stages as a list and as
text, the templates of the common stages, the output after each stage, running, and what happens when a pipeline ends
with a stage that writes (`$out`, `$merge`). The output is shown by the table of the Documents section (`table.show`);
the Explain, Code and Chart sections read the same pipeline (`explain.show`, `codegen.show`, `chart.show`), and a
pipeline is saved and found again as a saved query (`saved-query.save`).

A pipeline belongs to its collection tab: every card below works on *the pipeline of the tab*, a list of stages, each
with a name (`$match`), a body in mongosh syntax and whether it is enabled, plus *the stage shown*, the stage whose
output the table shows when it is not the whole pipeline.

### `aggregate.show` — The pipeline editor

The part of the Documents section where a pipeline is built and run, in place of the filter, sort and projection of the
query bar. The table under it shows the output.

- **Kind**: View
- **Engine**: MongoDB
- **Function**: `src/features/aggregate/show.ts › view(state)`
- **Entry points**: the mode menu of the query bar, **Find ▾** → **Aggregate** (`@query-bar`); Go to (**Aggregate**);
  the tool `open_aggregation` of the MCP server, which opens the collection tab with a pipeline and runs it
  (`mcp.tab-tools`); running a saved or recent query that is a pipeline (`saved-query.run`); **Open in collection** on
  a pipeline of the Monitor page (`monitor.show`).
- **Offered when**: the active tab is a collection tab, of a collection or of a view, on any connection, read-only
  ones too.
- **Reads**: the pipeline of the tab and the stage shown, which `tab.restore` brings back at the next start.
- **Uses**: `aggregate.add-stage`, `aggregate.stage-template`, `aggregate.remove-stage`, `aggregate.move-stage`,
  `aggregate.toggle-stage`, `aggregate.clear`, `aggregate.show-stage`, `aggregate.edit-as-text`, `aggregate.copy`,
  `aggregate.run`, `aggregate.write-output`, `aggregate.stage-marks`, `aggregate.autocomplete`,
  `aggregate.drop-condition`, `aggregate.sort-column`, `aggregate.save-as-view`, `explain.show`, `codegen.show`,
  `saved-query.save`, `saved-query.show`, `table.show`, `transfer.export`.
- **Ported from**: the Aggregate mode of the collection tab: `src/webview/pipeline.ts` (`PipelineEditor`),
  `src/shared/pipeline.ts`, `src/collectionPanel.ts` (`html`, the `aggregate-only` rows), `src/webview/main.ts`
  (`setMode`, `runAggregate`). The toolbar in two groups with icons, and the stages one under the other in the query
  pane, are Mongoster 0.9.0's: `src/queryBarHtml.ts` (the `pipeline-actions` row), `src/webview/pipeline.ts`
  (`setTextMode`, the `stage-add` button), `media/webview.css` (`body.query-side .stages`, `.stage`, `.stage-arrow`,
  `.pipeline-text`, `.pipeline-actions`); CHANGELOG 0.9.0, **Query above or beside the results**.

What it shows, top to bottom:

1. **The stage list**: one card per stage, left to right, with an arrow between two cards, then the button **+**
   (the icon `add`, with the tooltip and the name **Add a stage at the end**). A card has, in order: its number, a
   button (**Show the output up to this stage**); the name of the stage, a text field with the templates as
   suggestions; the checkbox **Enabled (uncheck to skip this stage)**; the marks **writes** and **must be first** when
   they apply; **Move left**, **Move right** and **Remove stage**; and the body, in Datardo's editor, in mongosh syntax
   with its syntax colors. A card is as wide as its longest line, from 280 to 640 px, and its body grows to 220 px
   before it scrolls.
2. **The text**, in place of the stage list after **Edit as text**: the whole pipeline in one editor.
3. **The toolbar**, in two groups, each button with a Codicon before its name
   ([D23](../decisions.md#d23--codicons-for-every-icon)):
   - **Run** (icon `play`, tooltip *Run the whole pipeline (Ctrl+Enter in a stage)*), **Edit as text** (icon `json`,
     tooltip *Edit or paste the whole pipeline as text*), which reads **Edit as stages** while the text is shown and
     keeps its icon, and **Clear** (icon `clear-all`, tooltip *Remove all stages*);
   - **Explain** (icon `telescope`, tooltip *Show how MongoDB runs the pipeline (up to the stage shown)*), **Code**
     (icon `code`, tooltip *The pipeline as code for mongosh, Node.js, Python, Java, C# or Go*), **Copy** (icon
     `copy`, tooltip *Copy the pipeline (mongosh syntax)*) and **Save as view…** (icon `save-as`, tooltip *Create a
     view with the pipeline up to the stage shown*).
4. **The line of what the table shows**: *2 of 3 stages enabled*, or *Output of stage 2 ($group) ·* and the link
   **show full pipeline**.

In the query pane at the right of the table (`query.position`), the same parts, in the same order, are laid out for a
narrow column:

- the cards are one under the other, each as wide as the pane: the width from 280 to 640 px by the longest line is
  for the cards above the table only. The arrow between two cards points down, and **+** is under the last card. A
  body grows to 220 px before it scrolls, as above the table. On a card, **Move left** and **Move right** read **Move
  up** and **Move down** (`aggregate.move-stage`);
- the text is as wide as the pane and at least 240 px high (Mongoster's), and grows with its lines without a limit:
  the pane scrolls;
- each group of the toolbar has a line of its own, under the stages;
- the conditions offered while a cell or a header is dragged (`aggregate.drop-condition`) go two by two, as over
  **Filter** (`query.drag`).

Acceptance:

- [ ] Choosing **Aggregate** in the mode menu of a collection tab that has no pipeline shows no card and the text *No
      stages: the pipeline returns the documents unchanged. Add a stage, paste a pipeline with "Edit as text", or drag
      a cell here.*
- [ ] With three stages of which one is disabled and no stage shown, the line reads *2 of 3 stages enabled*; with one
      stage it reads *1 of 1 stage enabled*.
- [ ] While stage 2 of three is shown, the line reads *Output of stage 2 ($group) ·* followed by **show full
      pipeline**, the card of stage 2 is marked as the one shown, and the card of stage 3 is dimmed.
- [ ] While the text is shown and a stage is disabled, the line ends with * · disabled stages are not shown in text*.
- [ ] A stage whose body is `{ customer: ObjectId("65f1c0de9a1b2c3d4e5f6a7b") }` has a card wide enough to show the
      `ObjectId` on one line; a body of 40 lines scrolls inside a card 220 px high.
- [ ] Going back to **Find** and then to **Aggregate** shows the same stages, the same disabled stages and the same
      stage shown; so does closing Datardo and starting it again with the tab restored.
- [ ] On a read-only connection the editor is shown and runs pipelines that do not write; **Save as view…** is not
      offered.
- [ ] In **Aggregate** the cells of the table cannot be edited (`document.inline-edit` is not offered); the rows can be
      copied (`table.copy-as`) and exported.
- [ ] Every control of the editor can be reached and used with the keyboard, and each has a name a screen reader
      says: the number of stage 2 is **Show the output up to this stage**.
- [ ] The toolbar reads, from the left, **Run**, **Edit as text**, **Clear**, then apart **Explain**, **Code**,
      **Copy**, **Save as view…**, with the icons `play`, `json`, `clear-all`, `telescope`, `code`, `copy`, `save-as`;
      **Edit as text** keeps the icon `json` when it reads **Edit as stages**.
- [ ] With the query in a pane 380 px wide, the three stages `$match`, `$group`, `$sort` are three cards one under the
      other, each as wide as the pane, with an arrow pointing down between two of them and **+** under the third; a
      `$match` whose body is one short line is as wide as a `$lookup` of four lines.
- [ ] In the query pane, **Edit as text** shows the text as wide as the pane and at least 240 px high; a pipeline of
      60 lines shows all its lines, and the pane scrolls.
- [ ] In the query pane, **Run**, **Edit as text** and **Clear** are on one line, and **Explain**, **Code**, **Copy**
      and **Save as view…** on the next.

### `aggregate.add-stage` — Add a stage

Adds a `$match` stage at the end of the pipeline, ready to be typed over.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/aggregate/add-stage.ts › plan(context, answers)`
- **Entry points**: **+** after the last card (`@list`); **Add a stage** in the text that an empty pipeline shows
  (`@empty-state`); Go to (**Add stage**).
- **Offered when**: the pipeline editor is shown.
- **Plan**: one app step, `add the stage $match to the pipeline of orders`.
- **Danger**: None
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone from the undo history: it changes the pipeline of the tab, not a deployment. **Remove
  stage** takes it away.
- **After**: the new card is scrolled into view and its name is focused with its text selected, so that typing another
  name replaces `$match`. The stage shown becomes the whole pipeline. Nothing runs.
- **Refuses**: while the text is shown and it does not parse, *Invalid pipeline: …* with the parser's message
  (`/invalid-text`).
- **Commands**: `aggregate.add-stage`
- **Uses**: `aggregate.stage-template`, `aggregate.from-text`.
- **Ported from**: `src/webview/pipeline.ts` (`addStage`).

Acceptance:

- [ ] **+** on a pipeline of two stages adds a third card named `$match` whose body is the template of `$match`, an
      object with one empty line, and the line reads *3 of 3 stages enabled*.
- [ ] After **+** the focus is in the name of the new stage with `$match` selected; typing `$group` replaces it.
- [ ] **+** while stage 1 of two is shown ends that: the line no longer reads *Output of stage 1*, and the table keeps
      what it showed until the pipeline is run.
- [ ] **Add stage** from Go to while the text is shown and is valid goes back to the stage list with the stages of the
      text and the new one after them.
- [ ] **+** while the text is `[ { $match: ` adds nothing and says *Invalid pipeline:* followed by the parser's
      message.

### `aggregate.stage-template` — Templates of the common stages

The starting body of a stage, by its name, so that a stage starts from something that already parses.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/aggregate/stage-template.ts › stageTemplate(name)` and `› bodyAfterRename(stage, name)`
- **Entry points**: the suggestions of the name of a stage (`@list`), which list the 22 names below in this order.
- **Uses**: `aggregate.autocomplete`.
- **Ported from**: `src/shared/pipeline.ts` (`STAGE_TEMPLATES`), `src/webview/pipeline.ts` (the `input` listener of
  the stage name).

The templates, in the order of the suggestions (a body on several lines is indented by two spaces):

| Stage | Body |
| --- | --- |
| `$match` | `{`, an empty line, `}` |
| `$project` | `{ field: 1 }` on three lines |
| `$addFields` | `{ newField: "$field" }` on three lines |
| `$set` | `{ field: "value" }` on three lines |
| `$unset` | `"field"` |
| `$group` | `{ _id: "$field", count: { $sum: 1 } }`, one entry per line |
| `$sort` | `{ field: -1 }` on three lines |
| `$limit` | `10` |
| `$skip` | `10` |
| `$unwind` | `"$arrayField"` |
| `$lookup` | `{ from: "collection", localField: "field", foreignField: "_id", as: "joined" }`, one entry per line |
| `$count` | `"count"` |
| `$sortByCount` | `"$field"` |
| `$replaceRoot` | `{ newRoot: "$field" }` on three lines |
| `$sample` | `{ size: 10 }` on three lines |
| `$facet` | `{ facetName: [ { $count: "count" } ] }`, the stage of the facet on its own line |
| `$bucket` | `{ groupBy: "$field", boundaries: [0, 10, 100], default: "other" }`, one entry per line |
| `$search` | `{ index: "default", text: { query: "word", path: "field" } }`, one entry per line |
| `$searchMeta` | `{ index: "default", exists: { path: "field" }, count: { type: "total" } }`, one entry per line |
| `$vectorSearch` | `{ index: "vector_index", path: "embedding", queryVector: [0.1, 0.2, 0.3], numCandidates: 100, limit: 10 }`, one entry per line |
| `$out` | `"outputCollection"` |
| `$merge` | `{ into: "outputCollection" }` on three lines |

Rules of `bodyAfterRename`, applied each time the name of a stage changes:

- the new name, trimmed, has a template, and the body is empty or is exactly the template of the name the stage had
  when the field was focused → the body becomes the template of the new name;
- otherwise the body is left as it is.

Worked examples (name before, body before, name typed → body after):

- `$match`, the template of `$match`, `$group` → the template of `$group`.
- `$match`, `{ status: "paid" }`, `$group` → `{ status: "paid" }`, unchanged.
- `$match`, empty, `$limit` → `10`.
- `$match`, the template of `$match`, `$densify` → the template of `$match`, unchanged: `$densify` has no template.

Acceptance:

- [ ] The suggestions of a stage name list exactly the 22 names of the table, `$match` first and `$merge` last.
- [ ] A new stage renamed from `$match` to `$lookup` without touching its body gets the four lines `from`,
      `localField`, `foreignField` and `as` of the table.
- [ ] A stage whose body was edited keeps it when the stage is renamed.
- [ ] Every template parses with `query.parse`, so that a new stage is never marked as invalid before it is edited.
- [ ] Renaming a stage to `$out` shows the mark **writes** on its card at once; renaming it back removes the mark.

### `aggregate.remove-stage` — Remove a stage

Takes one stage out of the pipeline.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/aggregate/remove-stage.ts › plan(context, answers)`
- **Entry points**: **Remove stage** on the card (`@list`); **Remove stage** in the context menu of the card
  (`@item-menu`).
- **Offered when**: the stage list is shown.
- **Plan**: one app step, `remove stage 2 ($group) from the pipeline of orders`.
- **Danger**: None
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone from the undo history: it changes the pipeline of the tab, not a deployment.
- **After**: the cards after it are numbered again. The stage shown follows: removing the stage shown or one before it
  shows the stage before, and when that leaves no stage before or the last one, the whole pipeline is shown. Nothing
  runs.
- **Ported from**: `src/webview/pipeline.ts` (`remove`).

Acceptance:

- [ ] Removing stage 2 of `$match`, `$group`, `$sort` leaves `$match` as 1 and `$sort` as 2.
- [ ] With stage 2 of four shown, removing stage 1 leaves the same stage shown, now numbered 1.
- [ ] With stage 1 of two shown, removing stage 1 shows the whole pipeline: the line reads *1 of 1 stage enabled*.
- [ ] Removing the only stage shows the text of the empty pipeline.
- [ ] Removing a stage that was marked with an error removes the mark from the list.
- [ ] No confirmation is asked, and the table keeps what it showed until the pipeline is run.

### `aggregate.move-stage` — Move a stage

Changes the place of a stage among the others.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/aggregate/move-stage.ts › plan(context, answers)`
- **Entry points**: **Move left** and **Move right** on the card (`@list`) and in its context menu (`@item-menu`). In
  the query pane (`query.position`), where the cards are one under the other, they read **Move up** and **Move down**
  *(Datardo's choice)*, on the card and in its menu.
- **Offered when**: the stage list is shown. **Move left** is disabled on the first stage, **Move right** on the last.
- **Plan**: one app step, `move stage 2 ($group) of the pipeline of orders to place 1`.
- **Danger**: None
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone from the undo history: it changes the pipeline of the tab, not a deployment.
- **After**: the whole pipeline is shown, and a mark of error is removed. Nothing runs.
- **Commands**: `aggregate.move-stage:left`, `aggregate.move-stage:right`, which move the stage whose body has the
  focus.
- **Ported from**: `src/webview/pipeline.ts` (`move` in `card`). Mongoster 0.9.0 keeps **Move left** and **Move
  right** in its query pane too; the names **Move up** and **Move down** there are *New in Datardo*.

Acceptance:

- [ ] **Move right** on stage 1 of `$match`, `$sort`, `$limit` gives `$sort`, `$match`, `$limit`.
- [ ] With the query in the query pane, the buttons of a card and the entries of its menu read **Move up** and **Move
      down**, and **Move down** on stage 1 of `$match`, `$sort`, `$limit` gives `$sort`, `$match`, `$limit`; the
      commands `aggregate.move-stage:left` and `aggregate.move-stage:right` move the stage the same way in both
      places.
- [ ] **Move left** on stage 1 and **Move right** on the last stage are disabled.
- [ ] Moving a stage while stage 2 is shown ends that: the line reads *3 of 3 stages enabled*.
- [ ] Moving `$search` from place 1 to place 2 shows **must be first** on its card; moving it back removes the mark.
- [ ] A disabled stage stays disabled when it is moved.

### `aggregate.toggle-stage` — Disable or enable a stage

Skips a stage without losing it, to see what the pipeline returns without it.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/aggregate/toggle-stage.ts › plan(context, answers)`
- **Entry points**: the checkbox **Enabled (uncheck to skip this stage)** on the card (`@list`); **Disable stage** or
  **Enable stage** in the context menu of the card (`@item-menu`).
- **Offered when**: the stage list is shown.
- **Plan**: one app step, `disable stage 2 ($group) of the pipeline of orders` or `enable stage 2 ($group) of the
  pipeline of orders`.
- **Danger**: None
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone from the undo history: it changes the pipeline of the tab, not a deployment.
- **After**: the card is dimmed while its stage is disabled, the line of what the table shows counts again, and the
  marks **must be first** are worked out again. Nothing runs.
- **Ported from**: `src/webview/pipeline.ts` (the `change` listener of the checkbox), `src/shared/pipeline.ts`
  (`isWriteStage`, `misplacedFirstStages`).

Acceptance:

- [ ] Unchecking stage 2 of three changes the line from *3 of 3 stages enabled* to *2 of 3 stages enabled*.
- [ ] A pipeline run with stage 2 disabled is sent without that stage (`aggregate.build`).
- [ ] A disabled stage whose body does not parse does not stop the pipeline from running.
- [ ] With `$match` disabled before `$search`, `$search` is the first enabled stage and is not marked **must be
      first**; enabling `$match` marks it.
- [ ] A disabled `$out` as the last stage does not make the pipeline one that writes: **Run** asks nothing.
- [ ] A disabled stage is kept when the pipeline is saved (`saved-query.save`) and comes back disabled.

### `aggregate.clear` — Remove all stages

Empties the pipeline and shows the documents of the collection again.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/aggregate/clear.ts › plan(context, answers)`
- **Entry points**: **Clear** in the toolbar of the pipeline editor (`@toolbar`); Go to (**Clear pipeline**).
- **Offered when**: the pipeline editor is shown.
- **Plan**: one app step, `remove every stage from the pipeline of orders`.
- **Danger**: None
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone from the undo history: it changes the pipeline of the tab, not a deployment. A pipeline
  that ran is still among the recent queries (`saved-query.recent`).
- **After**: the empty pipeline is run (`aggregate.run`), so the table shows the first page of the documents.
- **Commands**: `aggregate.clear`
- **Uses**: `aggregate.run`.
- **Ported from**: `src/webview/pipeline.ts` (`clearPipeline`).

Acceptance:

- [ ] **Clear** on a pipeline of three stages leaves no card, shows the text of the empty pipeline and runs
      `db.orders.aggregate([ { $skip: 0 }, { $limit: 50 } ], …)` with a page of 50.
- [ ] **Clear** asks no confirmation.
- [ ] **Clear** while the text is shown empties the text to `[]`.
- [ ] After **Clear**, a pipeline that had run before is found under **Recent** in the queries list.

### `aggregate.show-stage` — Show the output after a stage

Shows in the table what the pipeline returns up to one stage, to see what each stage does. The stages after it are not
sent.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/aggregate/show-stage.ts › plan(context, answers)`
- **Entry points**: the number of a stage (`@list`); the link **show full pipeline** in the line of what the table
  shows (`@toolbar`).
- **Offered when**: the stage list is shown.
- **Plan**: one app step, `show the output of stage 2 ($group) of the pipeline of orders`, or `show the output of the
  whole pipeline of orders`.
- **Danger**: None
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone from the undo history: it changes what the tab shows, not a deployment.
- **After**: the pipeline is run up to that stage (`aggregate.run`) from its first page, with its count; the stages
  after it are dimmed.
- **Uses**: `aggregate.run`, `aggregate.build`.
- **Ported from**: `src/webview/pipeline.ts` (`preview`, `runAll`, `renderInfo`).

Rules:

- the number of the stage already shown → the whole pipeline is shown;
- the number of the last stage → the whole pipeline is shown, since it is the same output;
- any other number → that stage is shown;
- **show full pipeline** and **Run** → the whole pipeline is shown.

Acceptance:

- [ ] Clicking 1 on `$match`, `$group`, `$sort` runs the pipeline with `$match` only, and the line reads *Output of
      stage 1 ($match) ·* **show full pipeline**.
- [ ] Clicking 1 again, or **show full pipeline**, runs the three stages and the line reads *3 of 3 stages enabled*.
- [ ] Clicking 3, the last, shows the whole pipeline: no stage is marked as shown.
- [ ] While stage 1 is shown, a pipeline whose stage 3 is `$out` writes nothing: only stage 1 is sent.
- [ ] The number of the stage shown has the name **Previewing this stage — click to show the full pipeline**; the
      others **Show the output up to this stage**.
- [ ] The table pages through the output of the stage shown and counts it, as it does for the whole pipeline.
- [ ] Export, Explain, **Save as view…** and the Chart section read the pipeline up to the stage shown.

### `aggregate.edit-as-text` — Edit the pipeline as text

Switches between the stage list and one editor with the whole pipeline, to paste a pipeline from elsewhere or to edit
it as code.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/aggregate/edit-as-text.ts › plan(context, answers)`
- **Entry points**: **Edit as text**, which reads **Edit as stages** while the text is shown (`@toolbar`); Go to
  (**Edit pipeline as text**, **Edit pipeline as stages**).
- **Offered when**: the pipeline editor is shown.
- **Plan**: one app step, `show the pipeline of orders as text` or `show the pipeline of orders as stages`.
- **Danger**: None
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone from the undo history: it changes how the tab shows the pipeline, not a deployment.
- **After**: going to the text, the editor holds the text of the stages (`aggregate.to-text`) and has the focus. Going
  back, the stages are those of the text (`aggregate.from-text`), all enabled, and the whole pipeline is shown; when
  the text was not changed, the stages are left as they were, disabled ones included.
- **Refuses**: going back to the stages, or running, copying or adding a stage, with a text that does not parse:
  *Invalid pipeline: …* with the reason (`/invalid-text`); the text stays shown, marked as invalid until it is edited.
- **Commands**: `aggregate.edit-as-text:text`, `aggregate.edit-as-text:stages`
- **Uses**: `aggregate.to-text`, `aggregate.from-text`, `aggregate.autocomplete`.
- **Ported from**: `src/webview/pipeline.ts` (`setTextMode`, `applyText`, `prepare`).

Acceptance:

- [ ] **Edit as text** on `$match { status: "paid" }` and `$limit 10` shows a text of four lines: `[`, the two stages
      as `{ $match: { status: "paid" } },` and `{ $limit: 10 }`, each indented by two spaces, and `]`.
- [ ] An empty pipeline shows `[]`; the empty editor shows the hint `[ { $match: { field: "value" } }, { $group: { _id:
      "$field", n: { $sum: 1 } } } ]`.
- [ ] Pasting `[ { $match: { a: 1 } }, { $sort: { a: -1 } } ]` and pressing **Edit as stages** gives two enabled cards,
      `$match` with `{ a: 1 }` and `$sort` with `{ a: -1 }`.
- [ ] With a disabled stage, going to the text and back without typing keeps the stage, still disabled; after any
      change of the text, the disabled stage is gone.
- [ ] **Edit as stages** with the text `[ { a: 1 } ]` stays on the text and says *Invalid pipeline: Stage 1 must be an
      object with a single $operator key*.
- [ ] `Ctrl+Enter` in the text applies it and runs the whole pipeline; with a text that does not parse nothing is
      sent.
- [ ] Autocomplete works in the text as in a stage (`aggregate.autocomplete`).

### `aggregate.to-text` — The text of a pipeline

Writes the stages as one mongosh text, `[ { $match: … }, … ]`, for **Edit as text**, **Copy**, and the queries list.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/aggregate/to-text.ts › pipelineText(stages)`
- **Uses**: `query.parse`, `query.format`.
- **Ported from**: `src/shared/pipeline.ts` (`pipelineToText`, `summarizePipeline`), `src/shared/query.ts`
  (`prettyShell`).

Rules:

- Input: the stages, each with its name, its body and whether it is enabled. Output: text.
- Disabled stages are left out.
- No enabled stage → `[]`.
- Otherwise `[`, one stage per item indented by two spaces and separated by `,` and a line break, then `]`.
- A stage is `{ <name>: <body> }` with the body parsed and written again in mongosh syntax: on one line when the stage
  with its two spaces of indentation fits in 76 columns, otherwise with one entry per line, each level indented by two
  more spaces, and so on for each value that does not fit.
- A stage whose name or body does not parse is written as it was typed, `{ <name>: <body> }`, so that the text can
  still be read and corrected.
- BSON types are written as mongosh writes them: a date typed as `ISODate("2024-01-01")` comes back as
  `ISODate("2024-01-01T00:00:00.000Z")`.
- The short form used in lists is the names of the enabled stages joined by ` → `, or *empty pipeline*.

Worked examples (stages → text):

- `$match` with `{ status: "paid", createdAt: { $gte: ISODate("2024-01-01") } }`, `$group` with `_id: "$customer"` and
  `total: { $sum: "$total" }` on separate lines, `$sort` with `{ total: -1 }` disabled, `$limit` with `10` →

  ```
  [
    {
      $match: {
        status: "paid",
        createdAt: { $gte: ISODate("2024-01-01T00:00:00.000Z") }
      }
    },
    { $group: { _id: "$customer", total: { $sum: "$total" } } },
    { $limit: 10 }
  ]
  ```

  and the short form `$match → $group → $limit`.
- No stages → `[]`, and the short form *empty pipeline*.
- `$match` with the unfinished body `{ status: ` → the item `{ $match: { status: }`, as typed.

Acceptance:

- [ ] The three worked examples give exactly these texts.
- [ ] The text of any pipeline whose stages parse, given to `aggregate.from-text`, gives back stages that send the
      same pipeline to the server, with the same BSON types (`NumberLong("5")` stays an `Int64`).
- [ ] A stage of 30 characters stays on one line; a `$lookup` with four options longer than 76 columns is written
      with one option per line.
- [ ] A disabled stage is in neither the text nor the short form.

### `aggregate.from-text` — The stages of a text

Reads a pipeline typed or pasted as text into stages.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/aggregate/from-text.ts › pipelineStages(text)`
- **Uses**: `query.parse`, `query.format`.
- **Ported from**: `src/shared/pipeline.ts` (`textToPipeline`).

Rules:

- Input: text in mongosh syntax. Output: stages, all enabled; or an error with a message.
- Empty text, or only spaces → no stages.
- The text is parsed with `query.parse`: comments, single quotes, unquoted field names and the mongosh types are
  accepted, as in a filter.
- An array → one stage per item. A single object → a pipeline of that one stage.
- Each item must be an object with exactly one field whose name starts with `$`; otherwise *Stage N must be an object
  with a single $operator key*, N counted from 1.
- The body of a stage is its value written in mongosh syntax on one line when it fits in 36 columns, otherwise with one
  entry per line.
- A text that `query.parse` cannot read gives the parser's message with its line and column.

Worked examples (text → stages):

- `[ { $match: { status: "paid" } }, { $group: { _id: "$customer", total: { $sum: "$total" }, orders: { $sum: 1 } } },
  { $limit: 10 } ]` → `$match` with `{ status: "paid" }`; `$group` with a body of five lines, `{`, `_id: "$customer",`,
  `total: { $sum: "$total" },`, `orders: { $sum: 1 }`, `}`; `$limit` with `10`.
- `{ $match: { a: 1 } }` → one stage, `$match` with `{ a: 1 }`.
- `[ { a: 1 } ]`, `[ { $match: {}, $sort: {} } ]` and `[ 5 ]` → *Stage 1 must be an object with a single $operator
  key*.
- `{ $match: ` → the parser's message, *JSON5: invalid end of input at 1:11*.
- The empty text → no stages.

Acceptance:

- [ ] The five worked examples give exactly these stages and messages.
- [ ] `[ { $match: { _id: ObjectId("65f1c0de9a1b2c3d4e5f6a7b") } } ]` gives a `$match` whose body is `{ _id:
      ObjectId("65f1c0de9a1b2c3d4e5f6a7b") }` on three lines, since it is longer than 36 columns.
- [ ] A text with a `// comment` line between two stages gives the two stages.
- [ ] The second item of `[ { $match: {} }, { limit: 5 } ]` is reported as *Stage 2 must be an object with a single
      $operator key*.

### `aggregate.copy` — Copy the pipeline

Copies the pipeline as mongosh text, to paste it in a playground, in mongosh or in code.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/aggregate/copy.ts › plan(context, answers)`
- **Entry points**: **Copy** in the toolbar of the pipeline editor (`@toolbar`); Go to (**Copy pipeline**).
- **Offered when**: the pipeline editor is shown.
- **Plan**: one app step, `copy the pipeline of orders to the clipboard`.
- **Danger**: None
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone: it changes only the clipboard.
- **After**: the status line says *Copied to the clipboard*.
- **Refuses**: while the text is shown and it does not parse, *Invalid pipeline: …* (`/invalid-text`); nothing is
  copied.
- **Commands**: `aggregate.copy`
- **Uses**: `aggregate.to-text`.
- **Ported from**: `src/webview/pipeline.ts` (`copyPipeline`), `src/collectionPanel.ts` (the `copy` message).

Acceptance:

- [ ] **Copy** on `$match { status: "paid" }` and `$limit 10` puts on the clipboard the four lines `[`, `  { $match: {
      status: "paid" } },`, `  { $limit: 10 }`, `]`.
- [ ] The whole pipeline is copied even while stage 1 is shown.
- [ ] A disabled stage is not copied.
- [ ] **Copy** on an empty pipeline copies `[]`.
- [ ] With the text `[ { $match: ` shown, **Copy** copies nothing and says *Invalid pipeline:* with the reason.

### `aggregate.build` — The pipeline that is sent

Turns the stages of the editor into the pipeline the server receives, or says which stage is wrong.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/aggregate/build.ts › builtPipeline(stages, upTo)`
- **Uses**: `query.parse`.
- **Ported from**: `src/queries.ts` (`buildPipeline`, `StageError`, `fromRelaxed`), `src/shared/pipeline.ts`
  (`parseStageBody`, `isWriteStage`, `misplacedFirstStages`).

Rules:

- Input: the stages, and the index of the stage shown (the last one for the whole pipeline). Output: the pipeline, and
  the stage that writes when it ends with one; or an error with a message and the stage it is about.
- Only the stages up to the stage shown are read, and of those only the enabled ones.
- A stage number in a message counts every stage of the editor from 1, disabled ones included.
- For each stage, in order:
  - its name, trimmed, must be `$` followed by letters only; otherwise *Stage 2 (match): "match" is not a stage
    operator (e.g. $match)*;
  - its body must not be empty; otherwise *Stage 2 ($match): The stage body is empty*;
  - its body is parsed with `query.parse`; a failure is *Stage 2 ($match):* followed by the parser's message;
  - its value keeps the BSON types as typed: `NumberLong("5")` is sent as an `Int64`, `NumberDecimal("0.10")` as a
    `Decimal128`, `5` as an `Int32`, `5.5` as a `Double`.
- `$search`, `$searchMeta` and `$vectorSearch` must be the first enabled stage; one found elsewhere is *$search must be
  the first stage of the pipeline*, on that stage.
- `$out` and `$merge` must be the last enabled stage; one found before another enabled stage is *$out must be the last
  stage of the pipeline*, on that stage.
- A pipeline whose last enabled stage is `$out` or `$merge` *writes*; that stage is returned with the pipeline.

Worked examples (stages, stage shown → result):

- `$match { status: "paid" }`, `$group { _id: "$customer", n: { $sum: 1 } }`, `$sort { n: -1 }`, whole pipeline →
  `[ { $match: { status: "paid" } }, { $group: { _id: "$customer", n: { $sum: 1 } } }, { $sort: { n: -1 } } ]`.
- The same, stage 2 shown → `[ { $match: { status: "paid" } }, { $group: { _id: "$customer", n: { $sum: 1 } } } ]`.
- The same with stage 1 disabled, whole pipeline → `[ { $group: { _id: "$customer", n: { $sum: 1 } } }, { $sort: { n:
  -1 } } ]`.
- `$match { a: 1 }`, `$out "copy"`, whole pipeline → `[ { $match: { a: 1 } }, { $out: "copy" } ]`, which writes with
  `$out`.
- The same, stage 1 shown → `[ { $match: { a: 1 } } ]`, which does not write.
- `$out "copy"`, `$match { a: 1 }` → the error *$out must be the last stage of the pipeline*, on stage 1.
- `$match { a: 1 }`, `$search { index: "default", text: { query: "x", path: "name" } }` → the error *$search must be the
  first stage of the pipeline*, on stage 2.
- `$match` disabled, `$group` with the body `{ _id: ` → the error *Stage 2 ($group): JSON5: invalid end of input at
  1:8*, on stage 2.
- No stages → the empty pipeline `[]`.

Acceptance:

- [ ] The nine worked examples give exactly these pipelines and messages.
- [ ] A disabled stage is never parsed: a disabled stage with the body `{{{` gives no error.
- [ ] A stage after the stage shown is never parsed: with stage 1 shown, a broken stage 3 gives no error.
- [ ] An error names the number the stage has in the editor: with stage 1 disabled, a broken second stage is *Stage
      2*.
- [ ] `$match { n: NumberLong("9007199254740993") }` is sent with an `Int64` of that exact value.
- [ ] A disabled `$out` in the middle of the pipeline gives no error and does not make the pipeline write.

### `aggregate.run` — Run the pipeline

Sends the pipeline, up to the stage shown, and shows a page of its output in the table with its count.

- **Kind**: Read
- **Engine**: MongoDB
- **Function**: `src/features/aggregate/run.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: **Run** in the toolbar of the pipeline editor, which runs the whole pipeline (`@toolbar`);
  `Ctrl+Enter` in the body of a stage, which runs up to the stage shown, and in the text, which runs the whole pipeline
  (`@editor`); Go to (**Run pipeline**); the paging of the table and its refresh, which run it again for another page;
  the features that change what is shown (`aggregate.show-stage`, `aggregate.clear`, `aggregate.drop-condition`,
  `aggregate.sort-column`, `saved-query.run`).
- **Offered when**: the pipeline editor is shown, on any connection, on a collection or a view.
- **Reads**: the stages and the stage shown; the page size and the page of the table (10, 20, 50, 100, 200 or 500 rows,
  50 unless changed).
- **Plan**: nothing is planned: it reads. What is sent, both at once:
  - the page: `db.orders.aggregate([ …stages, { $skip: 0 }, { $limit: 50 } ], { allowDiskUse: true, maxTimeMS: 60000
    })`, with the `$skip` and `$limit` of the page;
  - the count: `db.orders.aggregate([ …stages, { $count: "n" } ], { allowDiskUse: true, maxTimeMS: 10000 })`.
- **After**: the table shows the documents with their BSON types kept (`table.show`); the status line says how many of
  how many and the time; the pipeline is added to the recent queries of the collection when it has at least one enabled
  stage (`saved-query.recent`). An empty output shows *The pipeline returned no documents.* A count that fails or takes
  longer than 10 seconds leaves the total unknown, and the page is shown without it.
- **Refuses**: a text that does not parse, *Invalid pipeline: …* (`/invalid-text`); a stage that does not parse, a
  search stage that is not first, a `$out` or `$merge` that is not last, with the message of `aggregate.build`
  (`/invalid-stage`), and that stage is marked (`aggregate.stage-marks`). An error of the server is shown above the
  table, as the server words it, and the table keeps what it showed.
- **Commands**: `aggregate.run`
- **Uses**: `aggregate.build`, `aggregate.write-output` when the pipeline writes, `table.show`, `saved-query.recent`,
  `runner.progress`, `runner.cancel`, `aggregate.stage-marks`.
- **Ported from**: `src/collectionPanel.ts` (`runAggregate`, `countPipeline`), `src/webview/main.ts`
  (`runAggregate`, the `result` and `error` messages).

Limits: the page is given up after 60 seconds and the count after 10 seconds (`maxTimeMS`); both may use temporary
files on the server (`allowDiskUse`). While it runs, the status line shows the work in progress with **Cancel**
(`runner.cancel`), which stops the page and the count as it stops a query of `query.run`; the table keeps what it
showed. A newer run takes the place of one still going: the reply of the older one is dropped.

Acceptance:

- [ ] **Run** on `$match { status: "paid" }` and `$group { _id: "$customer", total: { $sum: "$total" } }` of
      `shop.orders`, page size 50, sends `db.orders.aggregate([ { $match: { status: "paid" } }, { $group: { _id:
      "$customer", total: { $sum: "$total" } } }, { $skip: 0 }, { $limit: 50 } ], { allowDiskUse: true, maxTimeMS: 60000
      })` and the same pipeline ending with `{ $count: "n" }` and `maxTimeMS: 10000`.
- [ ] The third page of 20 is sent with `{ $skip: 40 }, { $limit: 20 }`.
- [ ] A pipeline with no stages sends `[ { $skip: 0 }, { $limit: 50 } ]` and shows the documents of the collection
      unchanged; it is not added to the recent queries. A pipeline that returns nothing shows *The pipeline returned
      no documents.*
- [ ] A `NumberLong` in the output is shown as a `NumberLong`, not as a rounded number.
- [ ] **Run** while stage 1 is shown runs the whole pipeline and ends showing stage 1; `Ctrl+Enter` in the body of a
      stage keeps the stage shown.
- [ ] With stage 2 holding the body `{ _id: `, **Run** sends nothing, shows *Stage 2 ($group): JSON5: invalid end of
      input at 1:8* above the table and marks the card of stage 2.
- [ ] A pipeline on a view runs the same way, and so does one through a read-only connection.
- [ ] **Cancel** on the status line while a pipeline runs ends the work in progress, and the table still shows the
      rows it had.
- [ ] A pipeline that ends with an enabled `$out` is not sent by this read: **Run** starts `aggregate.write-output`.
- [ ] A pipeline that ran is the first of **Recent** in the queries list, shown as *aggregate $match → $group*.

### `aggregate.write-output` — Run a pipeline that writes

Runs a pipeline whose last stage is `$out` or `$merge`: the server writes its output into a collection instead of
returning it.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/aggregate/write-output.ts › plan(context, answers)`
- **Entry points**: the entry points of `aggregate.run`, when the pipeline that would be sent writes.
- **Offered when**: the last enabled stage, among those up to the stage shown, is `$out` or `$merge`
  (`aggregate.build`).
- **Reads**: `aggregate.build`, for the pipeline and the stage that writes. For `$out`, when the confirmation opens,
  whether the collection it names exists (`manage.read-options`): `db.getCollectionInfos({ name: "archive" })`, or
  `db.getSiblingDB("reports").getCollectionInfos({ name: "archive" })` when the stage names another database. A
  collection and a time series collection exist; a view of that name is not a collection. When the read fails, the
  collection is taken as existing.
- **Plan**: one step, the whole pipeline without paging: `db.orders.aggregate([ { $match: { status: "paid" } }, { $out:
  "paid_orders" } ], { allowDiskUse: true, maxTimeMS: 600000 })`.
- **Danger**: Destructive, when the last stage is `$out` and the collection it names exists (D39): that collection is
  replaced whole, and the documents it holds are lost without a copy. The confirmation says *Run this pipeline? Its
  $out stage writes to "archive".* with *It replaces the collection archive: the documents it holds now are lost.
  Select an earlier stage to preview without writing.*, asks *Type archive to confirm* and has the button **Run**. The
  name to type is the name of the collection that is replaced, with its database before it, `reports.archive`, when
  the stage names another database. Confirm, for `$out` to a collection that does not exist yet and for `$merge` in
  every form: *Run this pipeline? Its $out stage writes to "paid_orders".* with *This modifies the database. Select an
  earlier stage to preview without writing.* and the button **Run**, with no name to type. In both, the target is the
  body of the stage in mongosh syntax on one line: for `$merge`, *Its $merge stage writes to { into: "totals",
  whenMatched: "replace" }.*
- **Read-only**: Refused on a read-only connection (`/read-only`). Allowed from the tab of a view: the pipeline reads
  the view and the stage writes to another collection, nothing through the view.
- **Undo**: Cannot be undone: the server writes the output itself, so Datardo never holds the documents that `$out`
  replaced or `$merge` changed; the confirmation says so.
- **Publishes**: Not published: the documents are written by the server and Datardo does not know which they are.
- **After**: the table shows no rows and *Pipeline output written by $out to "paid_orders".*, and the status line the
  same text and the time; the tree is read again (`tree.refresh`), so a new collection appears; the pipeline is added
  to the recent queries (`saved-query.recent`). Cancelling the confirmation runs nothing and shows *Not run: the $out
  stage was cancelled.* above the table.
- **Refuses**: a read-only connection, *The connection Production is read-only. Pipelines ending with $out write to the
  database.* (`/read-only`); the stage errors of `aggregate.build` (`/invalid-stage`).
- **Commands**: `aggregate.run`
- **Uses**: `aggregate.build`, `manage.read-options`, `runner.confirm`, `runner.progress`, `runner.cancel`,
  `tree.refresh`, `saved-query.recent`.
- **Ported from**: `src/collectionPanel.ts` (`runAggregate`, the branch of `write`), `src/shared/pipeline.ts`
  (`WRITE_STAGES`, `isWriteStage`). Mongoster asks the same confirmation for every pipeline that writes; typing the
  name of a collection that `$out` replaces is new in Datardo (D39).

What the two stages do, as the confirmation must let the user understand: `$out` replaces the whole target collection
with the output, creating it when it does not exist, which is why its plan is destructive when the collection is
there; `$merge` inserts the output into the target and, by its options, replaces, merges or keeps the documents
already there. A `$out` that creates a time series collection follows the same rule as any other. The step is given
up after 600 seconds.

Acceptance:

- [ ] `[{ $match: { status: "paid" } }, { $out: "paid_orders" }]` on `shop.orders`, with no collection `paid_orders`,
      shows the confirmation *Run this pipeline? Its $out stage writes to "paid_orders".* with the step
      `db.orders.aggregate([ { $match: { status: "paid" } }, { $out: "paid_orders" } ], { allowDiskUse: true,
      maxTimeMS: 600000 })`, the note that it cannot be undone and the button **Run**, without a field to type.
- [ ] `[{ $match: { status: "paid" } }, { $out: "archive" }]` with the collection `archive` existing shows *It replaces
      the collection archive: the documents it holds now are lost.* and the field *Type archive to confirm*; **Run** is
      disabled until the field holds exactly `archive`, and stays disabled for `Archive` and for `archive `.
- [ ] `{ $out: { db: "reports", coll: "archive" } }` with `reports.archive` existing asks to type `reports.archive`,
      and with no such collection shows no field; `$out "orders"` run on `shop.orders` itself asks to type `orders`.
- [ ] `{ $merge: { into: "archive", whenMatched: "replace" } }` with `archive` existing shows no field to type. A
      `$out` with `timeseries` options asks to type the name when the collection exists and shows no field when it
      does not.
- [ ] Whether the collection exists is read each time the confirmation opens: after `archive` is dropped in mongosh,
      the same pipeline shows the confirmation without a field.
- [ ] After **Run**, the collection `shop.paid_orders` holds exactly the paid orders, the tree shows it, and the table
      shows *Pipeline output written by $out to "paid_orders".* Cancelling the confirmation sends nothing and shows
      *Not run: the $out stage was cancelled.*
- [ ] On the read-only connection Production nothing is sent, the existence of the collection is not read, and the
      message is *The connection Production is read-only. Pipelines ending with $out write to the database.*
      (`aggregate.write-output/read-only`).
- [ ] Showing stage 1 of the same pipeline, or running it with the `$out` stage disabled, writes nothing and asks
      nothing: the output of `$match` is shown. `$out "copy"` followed by an enabled `$limit 5` is refused with *$out
      must be the last stage of the pipeline* and the card of `$out` is marked; nothing is sent.
- [ ] From the tab of the view `shop.paid_view`, a pipeline ending with `$out "snapshot"` is confirmed and run.
      Nothing is recorded in the undo history and nothing is published for redis-oplog, on a connection that does
      both for other writes.
- [ ] A pipeline that writes cannot be explained, charted, exported or saved as a view from its last stage: each says
      to select an earlier stage (`explain.run`, `chart.draw`, `aggregate.save-as-view`).

### `aggregate.stage-marks` — What a stage card says about its stage

The marks on a card that tell, before and after running, that something about its stage needs attention.

- **Kind**: View
- **Engine**: MongoDB
- **Function**: `src/features/aggregate/stage-marks.ts › view(state)`
- **Entry points**: shown on the cards of the stage list (`@list`).
- **Reads**: the stages; the stage of the last error of `aggregate.build`.
- **Uses**: `aggregate.build`, `query.parse`.
- **Ported from**: `src/webview/pipeline.ts` (`markError`, `markMisplaced`, `isValidBody`, `isValidOp`, the
  `stage-badge` spans).

What a card shows, and when:

| Mark | When |
| --- | --- |
| the name marked as invalid | the name, trimmed, is not `$` followed by letters only |
| the body marked as invalid | the body is empty or `query.parse` cannot read it, checked at each key |
| **writes** | the name is `$out` or `$merge`, enabled or not |
| **must be first** | the stage is enabled, is `$search`, `$searchMeta` or `$vectorSearch`, and is not the first enabled stage. Its explanation reads *Atlas Search stages ($search, $searchMeta, $vectorSearch) only work as the first stage of the pipeline* |
| the card marked with an error | the last run stopped on this stage; the card is scrolled into view |
| dimmed | the stage is disabled, or comes after the stage shown |
| shown | the stage is the stage shown |

The message of the error is shown above the table. The mark of error goes away when the body of that stage is edited,
when the stage is removed or moved, and at the next run.

Acceptance:

- [ ] Typing `match` as a name marks the name; typing `$match` removes the mark.
- [ ] Deleting the closing brace of a body marks the body at once; typing it back removes the mark.
- [ ] A card named `$merge` shows **writes** whether its checkbox is checked or not.
- [ ] With `$match` then `$vectorSearch`, the second card shows **must be first** and running sends nothing, with
      *$vectorSearch must be the first stage of the pipeline* above the table.
- [ ] After a run that stopped on stage 3 of five, card 3 is marked and scrolled into view; editing its body removes
      the mark.
- [ ] An error of the server, such as an unknown stage name, marks no card: its message is shown above the table as the
      server words it.
- [ ] Each mark has a text a screen reader says, and none is told by color alone.

### `aggregate.autocomplete` — Suggestions in a stage

What is suggested while typing the name or the body of a stage, or the pipeline as text: stages, operators, fields and
values that fit where the cursor is.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/aggregate/autocomplete.ts › stageSuggestions(text, cursor, stage, fields)`
- **Entry points**: typing in the body of a stage or in the text (`@editor`); `Ctrl+Space` opens the suggestions where
  the cursor is.
- **Reads**: the fields of the collection from a random sample of 500 documents, `db.orders.aggregate([ { $sample: {
  size: 500 } } ], { maxTimeMS: 20000 })`, analyzed with `schema.analyze`; the search indexes of the collection, as the
  Indexes section lists them (`index.show`).
- **Uses**: `query.autocomplete`, for the list, its keys (`Tab` or `Enter` insert, the arrows move, `Esc` closes) and
  the suggestions of a filter; `schema.analyze`.
- **Ported from**: `src/shared/complete.ts` (`STAGES`, `ACCUMULATORS`, `EXPR_OPS`, `stageContext`, the Atlas Search
  tables), `src/webview/main.ts` (`fieldsBefore`), `src/collectionPanel.ts` (`loadFields`).

Rules:

- **Which fields**: for the first stage, the fields of the sample of the collection, nested ones too, each with its
  BSON types and the share of documents that have it. For a later stage, when the table shows the output of the stage
  just before it and that output is not empty, the fields of the documents in the table; otherwise those of the
  collection.
- **By stage**: inside `$match`, what a filter suggests; inside `$sort`, fields and `1` or `-1`; inside `$project`,
  `$addFields` and `$set`, fields, expression operators and `"$field"` references; inside `$group`, expressions for
  `_id` and accumulators for the other fields; inside `$unset`, field names; inside `$unwind`, `"$field"` and the
  options `path`, `includeArrayIndex`, `preserveNullAndEmptyArrays`; inside `$lookup`, `from`, `localField`,
  `foreignField`, `as`, `let`, `pipeline`; inside `$merge`, `into`, `on`, `whenMatched` (`"replace"`, `"keepExisting"`,
  `"merge"`, `"fail"`), `whenNotMatched` (`"insert"`, `"discard"`, `"fail"`); inside `$facet` and the `pipeline` of
  `$lookup` and `$unionWith`, stages again. `$limit`, `$skip`, `$count` and `$out` suggest nothing.
- **Stages**, in the text and wherever a stage is expected, each with a note and a skeleton in which the cursor lands:
  `$match`, `$project`, `$addFields`, `$set`, `$unset`, `$group`, `$sort`, `$limit`, `$skip`, `$unwind`, `$lookup`,
  `$count`, `$sortByCount`, `$replaceRoot`, `$replaceWith`, `$sample`, `$facet`, `$bucket`, `$bucketAuto`,
  `$unionWith`, `$graphLookup`, `$setWindowFields`, `$redact`, `$search`, `$searchMeta`, `$vectorSearch`, `$out`,
  `$merge`: 28 stages.
- **Accumulators**: `$sum`, `$avg`, `$min`, `$max`, `$first`, `$last`, `$push`, `$addToSet`, `$count`,
  `$mergeObjects`, `$stdDevPop`, `$stdDevSamp`.
- **Expressions**: the arithmetic, comparison, boolean, conditional, string, array, date, conversion and object
  operators of Mongoster's list (`$add` to `$max`, 68 of them), and the variables `$$ROOT`, `$$NOW`, `$$CURRENT`,
  `$$REMOVE`.
- **Atlas Search**: inside `$search` and `$searchMeta`, their options (`index`, `highlight`, `count`, `sort`,
  `returnStoredSource`, `scoreDetails`, `concurrent`; for `$searchMeta` `index`, `facet`, `count`) and the operators
  `text`, `compound`, `autocomplete`, `phrase`, `equals`, `range`, `in`, `exists`, `wildcard`, `regex`, `queryString`,
  `near`, `moreLikeThis`, `embeddedDocument`, each with a skeleton, also inside `compound`; inside `$vectorSearch`,
  `index`, `path`, `queryVector`, `numCandidates`, `limit`, `filter`, `exact`. `index` suggests the names of the
  collection's search indexes of the right kind; the `path` of `$vectorSearch` suggests first the fields that hold
  arrays of numbers. In `$project` and `$addFields`, `{ $meta: "searchScore" }` and `{ $meta: "vectorSearchScore" }`.

Worked examples (stage, text with the cursor as `|` → first suggestions):

- `$group`, `{ _id: "$customer", total: { $| } }` → `$sum`, `$avg`, `$min`, `$max`; choosing `$sum` inserts `$sum: 1`.
- `$sort`, `{ | }` after a `$group` whose output is in the table → `_id`, `total`: the fields of the output, not those
  of the collection.
- The text, `[ { $| } ]` → the 28 stages, `$match` first; choosing `$lookup` inserts `$lookup: { from: "", localField:
  "", foreignField: "", as: "" }` with the cursor inside the quotes of `from`.
- `$merge`, `{ into: "totals", whenMatched: | }` → `"replace"`, `"keepExisting"`, `"merge"`, `"fail"`.
- `$vectorSearch`, `{ index: "|" }` on a collection with the search indexes `default` (search) and `vec`
  (vectorSearch) → `vec` only.

Acceptance:

- [ ] The five worked examples suggest exactly these.
- [ ] In the first stage, `{ addr| }` in `$match` suggests `address` and `address.city` with their BSON types and
      shares, from the sample of 500 documents.
- [ ] In a stage whose output of the stage before is not in the table, the fields suggested are those of the
      collection.
- [ ] `$limit`, `$skip`, `$count` and `$out` open no list while typing.
- [ ] On a collection that cannot be sampled, operators and stages are still suggested and no error is shown.
- [ ] `Tab` and `Enter` insert the suggestion, `Esc` closes the list, `Ctrl+Space` opens it where the cursor is.

### `aggregate.drop-condition` — Drop a condition into the pipeline

A cell or a column header dragged from the table adds its condition to the pipeline at the point the table shows, so
that the output can be narrowed without typing.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/aggregate/drop-condition.ts › plan(context, answers)`
- **Entry points**: dropping a cell or a column header of the table on one of the conditions offered over the pipeline
  editor while dragging (`@table`); the choices are those of the drag and drop of the query bar (`query.bar`): equals,
  not equal, from, to, in, exists, missing, is null.
- **Offered when**: the pipeline editor is shown and something is dragged from the table. Sort and projection are not
  offered here: a header is clicked to sort (`aggregate.sort-column`).
- **Plan**: one app step, `add { status: "paid" } to stage 2 ($match) of the pipeline of orders`, or `add the stage
  $match { status: "paid" } after stage 2 of the pipeline of orders`.
- **Danger**: None
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone from the undo history: it changes the pipeline of the tab, not a deployment.
- **After**: the pipeline is run up to the stage that received the condition (`aggregate.run`), and that card flashes.
- **Refuses**: the stage shown is a `$match` whose body does not parse or is not an object: *Fix stage 2 before adding
  conditions by drag & drop: …* with the reason, and the card is marked (`/invalid-stage`); the text shown does not
  parse (`/invalid-text`).
- **Uses**: `aggregate.run`, `query.parse`, `query.format`, and the merging of a condition into a filter that the drag
  and drop of the query bar does.
- **Ported from**: `src/webview/pipeline.ts` (`addCondition`, `dropTarget`, `insert`), `src/shared/query.ts`
  (`mergeCondition`), `src/webview/main.ts` (the pipeline drop zones).

Rules:

- The stage that the table shows is the stage shown, or the last stage for the whole pipeline.
- That stage is an enabled `$match` → the condition is merged into its body, as into a filter: operators on the same
  field join into one range, and a condition on a field of the elements of an expanded array goes into the
  `$elemMatch` of that array.
- Otherwise → a new enabled `$match` with the condition is inserted right after it; when a stage was shown, the new
  stage becomes the stage shown.
- While dragging, the editor says where the condition will go: *Drop to add the condition into $match (stage 2)*,
  *Drop to add the condition as a new $match after stage 2*, or, on an empty pipeline, *Drop to add the condition as a
  new $match stage*.

Acceptance:

- [ ] On an empty pipeline, dropping the cell `paid` of `status` on **equals** creates stage 1, `$match` with `{ status:
      "paid" }`, and runs it.
- [ ] With the whole pipeline `$match { total: { $gte: 10 } }` shown, dropping the cell 50 of `total` on **to** changes
      the body to `{ total: { $gte: 10, $lte: 50 } }`.
- [ ] With the whole pipeline `$match`, `$group` shown, dropping `_id` = `ObjectId("65f1c0de9a1b2c3d4e5f6a7b")` on
      **equals** adds stage 3, `$match` with that condition on `_id`.
- [ ] With stage 1 of `$group`, `$sort` shown, the new `$match` is inserted as stage 2 and becomes the stage shown;
      `$sort` is now stage 3 and is not sent.
- [ ] Dropping the cell `A1` of the sub-row `items[].sku` gives `{ items: { $elemMatch: { sku: "A1" } } }`.
- [ ] With the stage shown being a `$match` with the body `{ a: `, the drop changes nothing and says *Fix stage 1
      before adding conditions by drag & drop:* with the parser's message.

### `aggregate.sort-column` — Sort the output from a column header

A click on a column header sorts the output shown, by adding or changing a `$sort` stage at that point.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/aggregate/sort-column.ts › plan(context, answers)`
- **Entry points**: a click on a column header of the table while the pipeline editor is shown (`@table`).
- **Offered when**: the pipeline editor is shown.
- **Plan**: one app step: `add the stage $sort { total: 1 } after stage 2 of the pipeline of orders`, `set stage 3
  ($sort) of the pipeline of orders to { total: -1 }`, or `remove stage 3 ($sort) from the pipeline of orders`.
- **Danger**: None
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone from the undo history: it changes the pipeline of the tab, not a deployment.
- **After**: the pipeline is run (`aggregate.run`); the header shows the direction, as in Find.
- **Refuses**: the text shown does not parse (`/invalid-text`).
- **Uses**: `aggregate.run`, `table.columns`.
- **Ported from**: `src/webview/pipeline.ts` (`toggleSort`, `currentSort`), `src/webview/main.ts` (the header click).

Rules, where the stage that the table shows is the stage shown or the last stage:

- that stage is not an enabled `$sort` → a stage `$sort` with `{ <field>: 1 }` is inserted right after it, and becomes
  the stage shown when a stage was shown;
- it is an enabled `$sort` and the field is not in it, or is there ascending → its body becomes `{ <field>: 1 }` in the
  first case and `{ <field>: -1 }` in the second: one field at a time, as the header click does in Find;
- it is an enabled `$sort` with the field descending → the stage is removed.

The field of the column of an expanded array is its dotted field path (`items.sku`).

Acceptance:

- [ ] On `$match`, `$group` with the whole pipeline shown, a click on the header `total` adds stage 3, `$sort` with `{
      total: 1 }`, and the output is ascending by `total`.
- [ ] A second click changes stage 3 to `{ total: -1 }`; a third removes stage 3.
- [ ] With stage 3 `$sort { total: 1 }` shown, a click on the header `_id` changes its body to `{ _id: 1 }`.
- [ ] With stage 1 of three shown, the click inserts the `$sort` as stage 2 and shows it; the stages after it are
      dimmed.
- [ ] A click on the header `items[].sku` sorts by `items.sku`.

### `aggregate.save-as-view` — Save the pipeline as a view

Creates a view on the collection whose definition is the pipeline up to the stage shown.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/aggregate/save-as-view.ts › plan(context, answers)`
- **Entry points**: **Save as view…** in the toolbar of the pipeline editor (`@toolbar`); Go to (**Save pipeline as
  view…**).
- **Offered when**: the pipeline editor is shown and the connection is not read-only.
- **Asks**: the name of the view, in a dialog titled **Save pipeline as view** with *Name of the view on orders (2
  stages)*. The name is checked as a collection name is when a collection is created (`manage.create-collection`), and
  a name already in the database gives *A collection or view with this name already exists*.
- **Reads**: the names of the collections and views of the database, `db.getCollectionNames()`; `aggregate.build`.
- **Plan**: one step: `db.createView("paid_orders", "orders", [ { $match: { status: "paid" } }, { $sort: { createdAt:
  -1 } } ])`.
- **Danger**: None
- **Read-only**: Refused on a read-only connection (`/read-only`). Allowed from the tab of a view: the new view is
  defined on that view.
- **Undo**: Cannot be undone from the undo history, which keeps documents and keys: the view is removed with
  `manage.drop-collection`, which loses no documents.
- **After**: the tree is read again (`tree.refresh`); a notification says *Created view shop.paid_orders.* with **Open
  view**, which opens its tab (`tab.open`).
- **Refuses**: a read-only connection, *The connection Production is read-only.* (`/read-only`); a pipeline that ends
  with `$out` or `$merge`, *A view can't contain $out: select an earlier stage.* (`/writes`); a stage that does not
  parse or is misplaced, with the message of `aggregate.build` (`/invalid-stage`); the text shown does not parse
  (`/invalid-text`). An error of the server (a stage a view may not hold, no permission) is shown as the server words
  it.
- **Commands**: `aggregate.save-as-view`
- **Uses**: `aggregate.build`, `runner.ask`, `tree.refresh`, `tab.open`, `manage.edit-view` to change the definition
  later.
- **Ported from**: `src/collectionPanel.ts` (`saveView`).

Acceptance:

- [ ] **Save as view…** on `$match { status: "paid" }` and `$sort { createdAt: -1 }` of `shop.orders`, named
      `paid_orders`, runs `db.createView("paid_orders", "orders", [ { $match: { status: "paid" } }, { $sort: {
      createdAt: -1 } } ])`, and the tree shows the view.
- [ ] The dialog reads *Name of the view on orders (2 stages)*; with one stage, *(1 stage)*.
- [ ] Typing the name of an existing collection shows *A collection or view with this name already exists* and the
      dialog cannot be confirmed.
- [ ] With stage 1 of three shown, the view holds stage 1 only; disabled stages are left out.
- [ ] A pipeline whose last enabled stage is `$out` is refused with *A view can't contain $out: select an earlier
      stage.* and no name is asked.
- [ ] On the read-only connection Production, the command from Go to answers *The connection Production is
      read-only.* (`aggregate.save-as-view/read-only`).
- [ ] **Open view** in the notification opens the tab of `shop.paid_orders`, whose table shows the paid orders.
