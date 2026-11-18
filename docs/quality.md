# Quality

The qualities that matter most to Datardo, in order, and the scenarios that make them checkable. *Source: ISO/IEC
25010:2023 for the qualities; arc42 §10 for the scenarios.* Every scenario names the test that checks it; the numbers
that are not Mongoster's are Datardo's choices and are tuned by the performance suite, on the reference machine: the
CI's standard Windows runner, with the servers on the same machine.

## The goals

1. **Safety of the data** (25010: *reliability* and *security*, integrity). Datardo is pointed at production
   deployments. A write never reaches a read-only connection, is exactly what the confirmation showed, and can be
   undone when the confirmation said so. Traded for: speed (a second read before each write, to record it) and disk
   space (the undo history).
2. **Fidelity of values** (25010: *functional suitability*, correctness). A BSON value keeps its type and a Redis
   value keeps its bytes through every path. Traded for: the simplicity of plain JSON and of plain text, everywhere.
3. **A window that never waits** (25010: *performance efficiency*). Large collections, millions of keys, slow
   servers: every read has a bound, long work shows its progress and can be cancelled, and the window stays usable
   meanwhile. Traded for: completeness (samples, pages, the first results).
4. **Usable by everyone, from the keyboard** (25010: *interaction capability*). Every feature can be reached without
   a pointer and read by a screen reader. Traded for: the freedom to draw controls that have no role.
5. **Changeability** (25010: *maintainability* and *flexibility*). Agents and people change the code often, and
   another engine will come: the cards, the rules and the tests say what must not move, and an engine is added
   without touching the others.

## Scenarios

| | When | What must happen | Measure | Checked by |
| --- | --- | --- | --- | --- |
| QA1 | A write is attempted on a read-only connection, from any entry point: a page, the tree, a document tab opened before the connection was made read-only, a playground, the Redis console, a comparison, a restore. | Nothing is sent to the server; the user reads why. | 0 writing commands received by the server; the code `/read-only` | the read-only suite of [testing.md](testing.md#special-suites), built from the catalog |
| QA2 | A document with a value of every BSON type is edited in a cell, edited in a document tab, copied and pasted, duplicated, exported as JSON Lines and imported, copied to another connection, backed up and restored, compared, and undone. | Every value comes back with its type. | every type kept on every path; the formats written for other tools (JSON, CSV, YAML) say in the interface that they are not a way back | the types-survive suite |
| QA3 | A key of each Redis type whose bytes are not valid UTF-8 is edited, copied, exported and imported, and undone. | The bytes are the same; the expiry is the same to the second. | `DUMP` equal before and after | the types-survive suite |
| QA4 | **Update many** on 50,000 documents. | The confirmation says it cannot be undone, since it is over 10,000 documents, and the update runs. | the confirmation's line on undo | unit tests of `runner.confirm` and `undo.limits`; one integration test |
| QA5 | What the confirmation showed, and what was sent. | The steps sent are the steps shown, and the count shown is the count of the filter the steps use. | equal texts | the runner's tests; one integration test per bulk write card |
| QA6 | A collection of 10 million documents is opened with no filter. | The first page shows without counting every document. | one `find` with the page's limit and one `estimatedDocumentCount`; first rows in under 1 second | integration test (the commands sent); performance suite (the time) |
| QA7 | A Redis database of 5 million keys is opened. | The first keys show from `SCAN` alone; the server is never asked for all the keys. | no `KEYS`; first rows in under 1 second; each `SCAN` under 50 ms on the server | integration test; performance suite |
| QA8 | A query runs on a slow server. | It stops after the time limit of its kind and says so. | 20 seconds for samples, 60 for counts, 120 for aggregations and charts | integration tests with a server made slow |
| QA9 | A table holds 10,000 rows of 50 columns, and the user scrolls. | Only the rows on screen are drawn. | at most 200 row elements in the page; no task of the window process over 100 ms | performance suite |
| QA10 | An export of 1 GB runs while the user types in a query bar. | Typing does not stutter, and **Cancel** answers at once. | no task of the window process over 100 ms; cancelled within one batch | performance suite |
| QA11 | Two collections of 1,000,000 documents each are compared. | The comparison finishes with one fingerprint per document in memory and lists the first 300 differences of each kind. | memory proportional to the number of documents, not their size | performance suite |
| QA12 | Search documents across 200 collections. | Three collections at a time, each with its progress, and stopping interrupts within one batch. | 3 in parallel | integration test |
| QA13 | A tool of the MCP server is called on a slow server. | It stops after 30 seconds and returns at most 60,000 characters. | 30,000 ms; 60,000 characters | unit and integration tests of the `mcp.` cards |
| QA14 | Datardo starts with 200 saved connections and 20 tabs to restore. | Home, or the last tab, is usable. | under 2 seconds from the process starting to the first input accepted | performance suite |
| QA15 | Any page or dialog, in the dark and in the light theme. | It passes the automated accessibility check. | 0 violations of WCAG 2.2 A and AA that axe-core covers | the UI tests (R10.5) |
| QA16 | Any feature, with the pointer unplugged. | It can be started and finished from the keyboard. | every command has a card; every control is reached by `Tab`, the arrows or `F6` | the keyboard-only UI tests, one per area; the manual checklist with a screen reader |
| QA17 | A file of the data folder is damaged, or comes from a newer version. | Datardo starts, says so, keeps the file aside or leaves it alone, and deletes nothing else. | 0 files lost | the storage tests (R15.3) |
| QA18 | A change to a feature. | Its card, its tests and the changelog change in the same commit, and the checks pass. | `catalog.py`: *no problems* | `npm run check`; review |
| QA19 | A third engine is added. | No module of the two others changes, and the shared areas change only where they list engines. | 0 imports between engines | dependency-cruiser (R1.3); review |
