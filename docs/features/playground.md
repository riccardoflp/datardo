# Playgrounds

A playground is a script of mongosh code run against a MongoDB connection, in a playground tab: Datardo's editor with
the script, a **Run** button beside each statement, **Run all**, and the results under it. This area covers opening
and saving a playground, the connection and database it runs against, running all of it, the selection or one
statement, what the script can use, how it is rewritten so that calls need no `await`, the results, stopping a run,
autocomplete, and what holds for the writes a script makes.

A playground runs the user's own code with the user's connections. It runs only when the user runs it, never by being
opened, restored at the next start, or opened by another feature with a script in it. The code never runs in Datardo's
main process: each run has a process of its own, which **Stop** ends.

A playground runs what its script says. Dropping a collection or a database is confirmed first, each call by itself
(decision D40); every other write runs as the script wrote it, with no confirmation, and nothing a playground does is
recorded in the undo history. The tab says so, and the cards `playground.run` and `playground.writes` say where this
leaves the promises of the product.

### `playground.show` — The playground tab

The page of a playground: the script in Datardo's editor, the controls that run it, and the results of the last run.

- **Kind**: View
- **Engine**: MongoDB
- **Function**: `src/features/playground/show.ts › view(state)`
- **Entry points**: a playground tab, opened by `playground.open` or `playground.open-file`, or restored at the next
  start (`tab.restore`).
- **Offered when**: the tab is active.
- **Reads**: the text of the script; `playground.statements`, for the **Run** buttons, again 300 ms after the last
  key *(Datardo's choice)*; the state of the run in progress, if any.
- **Uses**: `playground.run`, `playground.stop`, `playground.target`, `playground.save`, `playground.open-file`,
  `playground.statements`, `playground.results`, `playground.autocomplete`, `tab.open`, `tab.close`, `tab.restore`,
  `window.quit`.
- **Ported from**: `src/playground/playground.ts` (the lenses and the label of the connection) and
  `src/playground/resultPanel.ts`; the README's item **Playground**.

What it shows, from the top:

1. The toolbar: **Run all** (`playground.run@toolbar`), with the tooltip *Run the script (Ctrl+Enter). Drops are
   confirmed first; nothing is recorded in the undo history.*, which is **Stop** while a run is in progress
   (`playground.stop@toolbar`); the connection and database the playground runs against, as a button, `Local › shop`,
   followed by `(read-only)` on a read-only connection (`playground.target@toolbar`), with the tooltip **Connection
   and default database of this playground**; **Open…** (`playground.open-file@toolbar`) and **Save**
   (`playground.save@toolbar`).
2. The editor, with line numbers and the syntax colors of the theme. Beside the first line of each statement, a
   **Run** button (`playground.run@editor`). After a run that failed with a line, that line is marked until the text
   changes or another run starts.
3. The results of the last run (`playground.results`), under the editor. The line between the two can be dragged; each
   starts with half of the page *(Datardo's choice)*.

What a playground does is said in the tab: before the first run, under *Run a playground with Ctrl+Enter.*, the
results say *A playground runs what its script says. Dropping a collection or a database is confirmed first; every
other write runs as written. Nothing a playground does is recorded in the undo history.*; afterwards the tooltip of
**Run all** goes on saying it. On a read-only connection the sentence is *The connection is read-only: the script can
read, and every write it makes is refused.*

The tab belongs to the group of its connection, with the connection's color. Its title is the file's name
(`report.mongodb.js`), or **Playground 1** for one that was never saved. The path in the scope bar is `Local /
Playground 1`.

A playground has unsaved changes while its text differs from its file, or, for one that was never saved, from the
text it opened with. Its tab then shows the dot of a tab with unsaved changes, and both closing the tab (`tab.close`)
and quitting Datardo (`window.quit`) ask whether to save it first. So nothing unsaved is left by a quit; only when
Datardo did not quit by itself (a crash, a kill, a forced shutdown of the system) does the text come back at the next
start, as a draft still marked as unsaved (`tab.restore`).

Acceptance:

- [ ] The database on the button is the one of the last `use("…")` of the script, else the playground's default
  database: with `use("shop")` in the script the button of a playground on `test` reads `Local › shop`.
- [ ] A script with three statements shows three **Run** buttons, each on the first line of its statement; a script
  that does not parse shows none, and **Run all** stays.
- [ ] Opening a playground, restoring it at the next start and making its tab active send nothing to the deployment
  beyond what `playground.autocomplete` reads when the user types.
- [ ] Before the first run the results say *Run a playground with Ctrl+Enter.* and, under it, *A playground runs what
  its script says. Dropping a collection or a database is confirmed first; every other write runs as written. Nothing
  a playground does is recorded in the undo history.*; on a read-only connection the second sentence is *The
  connection is read-only: the script can read, and every write it makes is refused.*
- [ ] While a run is in progress the toolbar shows **Stop** in the place of **Run all**, the **Run** buttons are
  disabled, and the editor can still be typed in.
- [ ] Changing the connection of the playground moves the tab to the group of the new connection and gives it that
  connection's color.
- [ ] A new playground left as it opened has no dot, and closes without a question; typing a character gives it the
  dot, and deleting that character takes the dot away.
- [ ] After Datardo's processes are killed with a line typed in **Playground 1** and not saved, the next start shows
  **Playground 1** with that line and its dot (`tab.restore`), and runs nothing of it.
- [ ] Every control of the toolbar and every **Run** button can be reached with the keyboard and has a name: the
  button of line 4 is **Run the statement at line 4**.

### `playground.open` — New playground

Opens a new, unsaved playground on a connection and a database, with an example script or with a script another
feature wrote.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/playground/open.ts › plan(context, answers)`
- **Entry points**: **Playground** among the pages of a MongoDB connection in the tree island (`@tree`); **New
  playground** in the context menu of a database, a collection or a view of the tree (`@tree-menu`); Go to (**New
  playground**). Other features start it with a script: the structure comparison opens its script so.
- **Offered when**: on a MongoDB connection, read-only connections included.
- **Asks**: nothing when it is started on a node of the tree or with a MongoDB connection current. From Go to with no
  MongoDB connection current, the connection and the database, as `playground.target` asks them.
- **Reads**: nothing from the deployment.
- **Plan**: `open the playground Playground <n>`, an app step. Nothing is run.
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone, and needs none: the tab is closed.
- **After**: the playground tab is open and active, the caret at the end of the last line of the example. The tab is
  not saved: it has no file until `playground.save`.
- **Refuses**: no MongoDB connection saved, *Add a MongoDB connection first.* (`/no-connection`); from Go to, a
  connection picked that cannot be reached when its databases are listed, *Could not connect to <connection>: <error>*
  (`/not-connected`).
- **Commands**: `playground.open`.
- **Uses**: `playground.show`, `playground.target`, `playground.save`, `tab.open`, `structure.show`.
- **Ported from**: `src/playground/playground.ts › Playgrounds.create`; the README's item **Playground**.

The script of a new playground, started on the collection `orders` of `shop`:

```js
// Datardo playground: Ctrl+Enter runs the script (or the selected lines) on the connection shown above.
// mongosh syntax; the value of the last expression is shown below, print() and printjson() write to the output.

use("shop");

db.orders.find({}).limit(20);
```

Acceptance:

- [ ] The tab is titled **Playground 1**; with **Playground 1** open, the next is **Playground 2**; with only
  **Playground 2** open, the next is **Playground 1**.
- [ ] Started on a database, the last line is `db.getCollectionNames();`; started on a connection, there is no `use`
  line, the last line is `db.getMongo().getDBNames();`, and the default database is `test`.
- [ ] A collection named `order-items` is written `db.getCollection("order-items")`; so are the collections named
  `getCollection`, `getName`, `aggregate`, `stats` and `version`, which `db` has as methods.
- [ ] Started by another feature with a script, the tab holds that script and no example, with the caret at its first
  line; nothing of it is run.
- [ ] A new playground on a read-only connection opens, and its button reads `Production › shop (read-only)`.
- [ ] With only Redis connections saved, **New playground** from Go to says *Add a MongoDB connection first.* and
  opens nothing; the tree of a Redis connection has no **Playground** page.

### `playground.open-file` — Open a playground file…

Opens a file of mongosh code as a playground, with the connection and the database it had the last time.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/playground/open-file.ts › plan(context, answers)`
- **Entry points**: **Open…** in the toolbar of a playground tab (`@toolbar`); `Ctrl+O`; Go to (**Open playground…**);
  the playgrounds of **Jump back in** on the Home page (`@home`); `tab.restore`, with the path and no dialog.
- **Offered when**: always.
- **Asks**: the file, in the system's file dialog titled **Open playground**, with the filter **Playgrounds
  (`*.mongodb.js`, `*.js`)** and **All files**. Then, only when Datardo cannot tell them, the connection and the
  database, as `playground.target` asks them.
- **Reads**: the file, as UTF-8 text; the connection and the database Datardo remembers for that path. They are kept
  in Datardo's data, by the file's path: nothing about them is written in the file.
- **Plan**: `open the playground <path>`, an app step. Nothing is run.
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone, and needs none: the tab is closed.
- **After**: the playground tab is open and active, in the group of its connection, with the caret at the first line.
- **Refuses**: a file that no longer exists, *The file <path> doesn't exist.* (`/no-file`); a file over 5 MB
  *(Datardo's choice)*, *<file> is too large to open as a playground (over 5 MB).* (`/too-large`); a file that is not
  UTF-8 text, *<file> is not a text file.* (`/not-text`); a file that cannot be read, *Could not open <file>: <error>*
  (`/open-failed`); no MongoDB connection saved, *Add a MongoDB connection first.* (`/no-connection`); a connection
  picked that cannot be reached when its databases are listed, *Could not connect to <connection>: <error>*
  (`/not-connected`).
- **Commands**: `playground.open-file`.
- **Uses**: `playground.show`, `playground.target`, `tab.open`, `tab.restore`, `home.show`, `runner.ask`.
- **Ported from**: the README's section **Desktop app** (`File › Open File…`, `Ctrl+O`, which opens a playground
  again with the connection it had); `src/playground/playground.ts` (`TARGETS_KEY`, `setTarget`).

Acceptance:

- [ ] A file saved from a playground on Local and `shop` opens again on Local and `shop`, without a question, also
  after Datardo was restarted.
- [ ] A file Datardo never opened opens on the current connection when it is a MongoDB one, with the database of the
  active tab, else `test`. With a Redis connection current, or none, the list of the MongoDB connections is asked;
  `Escape` there opens nothing.
- [ ] A file whose remembered connection was removed asks for the connection like a file never opened.
- [ ] A file already open in a tab is not opened twice: its tab becomes active.
- [ ] Opening a file runs nothing of it: a file whose only line is `db.dropDatabase()` leaves the database as it was.
- [ ] A file of 6 MB is refused with *<file> is too large to open as a playground (over 5 MB).*
- [ ] At the next start, the tab of a saved playground is restored from its file as it is on disk; when the file is
  gone the tab is not restored and Datardo says *The file <path> doesn't exist.*

### `playground.save` — Save a playground

Writes the script to its file; a playground that has none yet is saved where the user chooses.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/playground/save.ts › plan(context, answers)`
- **Entry points**: **Save** in the toolbar of the tab (`@toolbar`); `Ctrl+S`; **Save as…** in the context menu of the
  tab (`@tab-menu`); `Ctrl+Shift+S` *(Datardo's choice)*; Go to (**Save playground**, **Save playground as…**); the
  button **Save** of the question asked when a playground with unsaved changes is closed (`tab.close`) or Datardo
  quits (`window.quit`).
- **Offered when**: a playground tab is active. **Save** is disabled while the text has no changes and the playground
  has a file.
- **Asks**: for a playground without a file, and for **Save as…**: the file, in the system's file dialog titled
  **Save playground**, with the name `Playground 1.mongodb.js` (or the file's own name) and the filter **Playgrounds
  (`*.mongodb.js`)**. A name typed without an extension gets `.mongodb.js`.
- **Plan**: `write <path>`, a file step: the text of the editor as UTF-8, with the line endings it has. Then `remember
  the connection and the database of <path>`, an app step.
- **Danger**: None. The system's dialog asks before a file that exists is replaced.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone from the undo history, which holds writes to documents and keys.
- **After**: the tab's title is the file's name, without the dot of unsaved changes; the playground is in **Jump back
  in**. When the save was asked by the question of `tab.close` or `window.quit`, the tab then closes, or the quit goes
  on.
- **Refuses**: a file that cannot be written, *Could not save <file>: <error>* (`/save-failed`); the text stays in the
  tab, with its dot, and a close or a quit that asked for the save stops there. Cancelling the file dialog does the
  same, without a message.
- **Commands**: `playground.save`, `playground.save:as`.
- **Uses**: `playground.show`, `playground.open-file`, `tab.close`, `tab.restore`, `window.quit`, `runner.ask`.
- **Ported from**: the README's section **Desktop app** (*A new playground is saved as a `.mongodb.js` file wherever
  you like*); `src/playground/playground.ts` (a saved playground keeps its connection).

Acceptance:

- [ ] `Ctrl+S` in **Playground 1** opens the file dialog; saved as `report`, the file is `report.mongodb.js`, the tab
  is titled `report.mongodb.js`, and the next `Ctrl+S` writes it without a question.
- [ ] A playground saved on Local and `shop` keeps that connection and database when it is opened again
  (`playground.open-file`).
- [ ] **Save as…** writes a second file and the tab goes on with it; the first file stays as it was last saved.
- [ ] Closing a playground with unsaved changes asks the question of `tab.close`: *Do you want to save the changes you
  made to Playground 1?* with *Your changes will be lost if you don't save them.* and the buttons **Save**, **Don't
  save** and **Cancel**. **Save** on a playground that has a file writes it and closes the tab; on one that has none it
  opens the file dialog first, and cancelling that dialog keeps the tab open with its changes.
- [ ] Quitting Datardo with unsaved changes in **Playground 1** and in `report.mongodb.js` makes each of the two tabs
  active in turn and asks the same question (`window.quit`); **Cancel** at either, or cancelling the file dialog of
  **Playground 1**, stops the quit and closes no tab.
- [ ] After a quit answered with **Don't save**, the next start shows `report.mongodb.js` as its file is on disk, and
  no text that was not saved: a quit leaves no draft (`tab.restore`).
- [ ] A save that fails while Datardo is quitting shows *Could not save <file>: <error>*, and Datardo stays open with
  the text in its tab.
- [ ] Saving runs nothing, and sends nothing to the deployment.
- [ ] A folder that cannot be written gives *Could not save <file>: <error>* and loses no text.

### `playground.target` — The connection and database of a playground

Chooses the connection a playground runs on and its default database, used until the script calls `use("…")`.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/playground/target.ts › plan(context, answers)`
- **Entry points**: the button with the connection and the database in the toolbar of the tab (`@toolbar`); Go to
  (**Change playground connection…**); asked by `playground.open`, `playground.open-file` and `playground.run` when
  the playground has no connection they can use.
- **Offered when**: a playground tab is active, and no run of it is in progress.
- **Asks**, in order:
  1. A list to pick from, titled **Playground connection**, with the line *Connection the playground runs on*: the
     saved MongoDB connections by folder, each with `current` when it is the playground's, `connected`, and
     `read-only`. Redis connections are not listed.
  2. A list to pick from, titled **Default database on <connection>**, with the line *Used until the script calls
     use("…")*: the databases of the connection, then **Other database…**.
  3. Only after **Other database…**: a text, titled **Default database**, with the line *Database name*; an empty
     name shows *Required*.
- **Reads**: the databases of the connection picked (`listDatabases` with `nameOnly: true`), connecting it when it is
  not connected (`connection.connect`).
- **Plan**: `set the playground <title> to <connection> › <database>`, an app step.
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment; a read-only connection can be picked.
- **Undo**: Cannot be undone, and needs none: it is chosen again.
- **After**: the button of the toolbar shows the new connection and database; the tab moves to the group of the
  connection; for a playground with a file, Datardo remembers them for its path.
- **Refuses**: no MongoDB connection saved, *Add a MongoDB connection first.* (`/no-connection`); a connection that
  cannot be reached, *Could not connect to <connection>: <error>* (`/not-connected`), and nothing changes.
- **Commands**: `playground.target`.
- **Uses**: `playground.show`, `connection.connect`, `runner.ask`.
- **Ported from**: `src/playground/playground.ts › Playgrounds.change`, `› setTarget`, `› label`.

Acceptance:

- [ ] `Escape` at any of the three questions changes nothing.
- [ ] Picking Production (read-only) and `shop` shows `Production › shop (read-only)`.
- [ ] **Other database…** with `reports`, a database that does not exist yet, is accepted: the button shows `Local ›
  reports`.
- [ ] A script with `use("archive")` shows `Local › archive` whatever the default database is; removing the line shows
  the default database again.
- [ ] While a run is in progress the button is disabled.
- [ ] The connection of a playground never changes by itself: not when another connection becomes the current one, and
  not when another tab is made active.

### `playground.run` — Run a playground

Runs the whole script, the selected lines or one statement on the playground's connection, in a process of its own,
and shows what it returned.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/playground/run.ts › plan(context, answers)`
- **Entry points**: **Run all** in the toolbar of the tab (`@toolbar`); the **Run** button beside a statement
  (`@editor`), which runs that statement; `Ctrl+Enter` in the editor (`@editor`), which runs the selected text, or the
  whole script when nothing is selected; `Ctrl+Shift+Enter` *(Datardo's choice)*, which runs the statement at the
  caret; Go to (**Run playground**, **Run selection**, **Run statement**).
- **Offered when**: a playground tab is active and no playground is running.
- **Asks**: nothing to start. A playground whose connection was removed asks for another first (`playground.target`).
  While it runs, each drop of a collection or of a database the script reaches is confirmed (Danger, below).
- **Reads**: the text to run and its first line in the script; for a selection or a statement, the database of the
  last `use("…")` written before it (`playground.statements`), else the playground's default database.
- **Plan**: one step, `run <title> on <connection> › <database>`. The runner carries it out so:
  1. The text is rewritten by `playground.rewrite`. A text that does not parse fails here, and nothing is started.
  2. Datardo starts a process for this run and gives it the rewritten text. The process has the names of
     `playground.runtime` and nothing else of Datardo: no connection string, no secret, no file, no access to the
     window.
  3. Each call the script makes to the database goes from that process to the main process, which checks it
     (`playground.writes`): it refuses it, asks about it first when it is a drop, or runs it through the MongoDB engine
     on the playground's connection and sends the reply back. The code of the script never runs in the main process or
     in the window.
  4. When the script ends, the process sends the value of its last expression and ends. Sessions still open are ended
     and their transactions aborted (`playground.sessions`).
- **Danger**: None to start the run: the code is the user's own, in front of them, and runs because they ran it.
  Destructive for each drop the script reaches (decision D40): at a call of `drop()` on a collection or of
  `dropDatabase()`, written as a method or given to `runCommand`, the run waits and Datardo shows the destructive
  confirmation of `runner.confirm`, with the call as `runner.step-text` writes it and the field *Type <name> to
  confirm*. **Drop** sends the call and the script goes on with its result; **Cancel** sends nothing and the call
  throws *Dropping shop.orders was cancelled.* in the script (`playground.writes` has the rules and the texts). Every
  other write runs as the script wrote it, with no confirmation, `deleteMany({})` included: there the promise that a
  dangerous write is shown before it runs is kept only by the script being in front of the user.
- **Read-only**: Allowed to run on a read-only connection: what the script reads works, and each write it makes is
  refused (`playground.writes`).
- **Undo**: Cannot be undone: the writes of a playground are not recorded in the undo history (`playground.writes`),
  a confirmed drop no more than the others; the confirmation and the tab say so.
- **Publishes**: Published for redis-oplog (`oplog.publish`), for the writes to documents made with the methods of a
  collection, those of a transaction once it commits (`playground.writes`). Not published: what a script writes with
  `runCommand`, `$out` or `$merge`.
- **After**: the results (`playground.results`). The Log has the run under the source **Playground**: `▶ <title> on
  <connection> › <database>`, each printed line, each drop asked about with its answer (`db.orders.drop(): confirmed`,
  `db.orders.drop(): cancelled`), and for a failure `✖ <message> (line <n>)`. When the text that ran
  holds one of the words `insert`, `update`, `replace`, `delete`, `drop`, `create`, `rename`, `bulkWrite` or
  `findOneAnd`, the tree and the open pages of the connection are read again (`tree.refresh`).
- **Refuses**: no playground tab active, when started from Go to, *Open a playground to run it: New playground creates
  one.* (`/no-playground`); a run already in progress, in this or another playground tab, *A playground is already
  running.* (`/running`); a connection that cannot be reached, *Could not connect to <connection>: <error>*
  (`/not-connected`); a playground whose connection was removed, with no MongoDB connection saved, *Add a MongoDB
  connection first.* (`/no-connection`). A script that fails is not a refusal: its error is a result.
- **Commands**: `playground.run:all`, `playground.run:selection`, `playground.run:statement`.
- **Uses**: `playground.statements`, `playground.rewrite`, `playground.runtime`, `playground.sessions`,
  `playground.writes`, `playground.results`, `playground.stop`, `playground.target`, `connection.connect`,
  `oplog.publish`, `tree.refresh`, `runner.run`, `runner.confirm`, `runner.step-text`, `runner.progress`,
  `runner.log`, `nav.status-line`.
- **Ported from**: `src/playground/playground.ts › Playgrounds.run`, `src/playground/shell.ts › runPlayground`; the
  README's item **Playground**. Running the script in a process started for the run is *New in Datardo*: Mongoster
  runs it in the one process that does everything else, where a script that never waits cannot be stopped. The
  confirmation of drops is *New in Datardo* too: Mongoster confirms nothing a playground does.

Acceptance:

- [ ] **Run all** on **Playground 1** runs every line; the title of the run is `Playground 1`. With lines 3 to 5
  selected, `Ctrl+Enter` runs only their text and the title is `Playground 1 (lines 3–5)`; with a selection inside
  line 4, `Playground 1 (line 4)`.
- [ ] The **Run** button of a statement on lines 4 to 6 runs lines 4 to 6 alone, with the title `Playground 1 (lines
  4–6)`; a name declared by an earlier statement is not defined: *ReferenceError: paid is not defined*.
- [ ] A selection, or a statement, under a line `use("shop")` runs on `shop` although that line is not run; without
  one it runs on the playground's default database.
- [ ] While `while (true) {}` runs, the window stays usable: another tab opens, a query in a collection tab runs and
  returns, the status line shows `Running Playground 1…` with **Cancel**, and Datardo's main process answers the MCP
  server.
- [ ] A script that allocates memory without end ends with *The playground's process ended before the script did: it
  may have run out of memory.*; Datardo and its other tabs go on, and the next run starts a new process.
- [ ] The process of a run is gone when the run ends, also after an error; two runs never share one, so a variable of
  the first run is not defined in the second.
- [ ] The script cannot reach what the runtime does not give it: `require("fs")` fails with *ReferenceError: require is
  not defined*, and so do `process` and `fetch`.
- [ ] A second run while one is in progress, from any playground tab, says *A playground is already running.* and
  starts nothing.
- [ ] `db.orders.find({ status: "paid" }).limit(5)` as the last statement runs `db.orders.find({ status: "paid"
  }).limit(5)` on the server once, when the result is read, and shows five documents.
- [ ] A script whose last line is `db.orders.insertOne({ _id: 1 })` inserts the document without a confirmation, shows
  `{ acknowledged: true, insertedId: 1 }`, adds nothing to the undo history, and the tree's count of `orders` is read
  again.
- [ ] On a connection that publishes for redis-oplog, that insert publishes one event for `_id` 1.
- [ ] A script with `db.orders.drop()` on line 4 runs lines 1 to 3, then shows the confirmation **Drop collection
  shop.orders** with the step `db.orders.drop()` and the field *Type orders to confirm*; nothing of the drop is sent
  until `orders` is typed and **Drop** pressed, after which the script goes on with `true` as the value of the call.
- [ ] While that confirmation is open the status line still shows `Running Playground 1…` with its time going on, and
  **Stop** closes the confirmation and ends the run with the collection still there.
- [ ] `db.orders.deleteMany({})`, `db.orders.updateMany({}, { $set: { seen: true } })` and `db.orders.dropIndex("a_1")`
  run with no confirmation.
- [ ] A script with a syntax error starts no process and sends nothing: the result is *SyntaxError: Unexpected token*
  with its line.

### `playground.statements` — The statements of a script

Where the statements of a script start and end: what each **Run** button runs, and on which database.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/playground/statements.ts › statements(source)`, with `databaseAt(source, offset)`.
- **Uses**: `playground.rewrite` (the same parser); used by `playground.show`, `playground.run`,
  `playground.autocomplete`.
- **Ported from**: *New in Datardo* for the statements; `src/playground/context.ts › databaseAt` for the database.

Rules:

- The script is parsed as `playground.rewrite` parses it. Each statement at the top level of the script is one item of
  the result, with its first and last line (from 1) and its start and end in the text.
- Left out: empty statements (`;`), directives (`"use strict"`), and function and class declarations, which do nothing
  alone. Comments belong to no statement.
- Statements that start on the same line are one item, from the start of the first to the end of the last: a line has
  at most one **Run** button.
- A script that does not parse has no statements.
- **Run** runs the text of the item, from its start to its end, alone.
- The statement at the caret is the one whose lines hold the caret's line; else the first that starts after it; else
  the last.
- `databaseAt(source, offset)`: the name in the last `use("…")` written before `offset` with a name in quotes (`"`,
  `'` or a backtick), at the start of a line or after a space or a `;`; undefined when there is none. A `use(name)`
  with a variable is not seen.

Worked example:

```js
use("shop");                                    // line 1

// paid orders
const paid = db.orders                          // line 4
  .find({ status: "paid" })
  .toArray();                                   // line 6
print(paid.length); db.orders.countDocuments(); // line 7
function total(o) { return o.total }            // line 8
db.orders.find({}).limit(20)                    // line 9
```

→ four items: line 1; lines 4–6; line 7 (two statements, one button); line 9. Line 8 has no button.

- `databaseAt` at the start of line 4 → `shop`; at the start of line 1 → undefined.
- The caret on line 3 → the item of lines 4–6; on line 5 → the same; on line 8 → the item of line 9.
- **Run** on line 7 runs `print(paid.length); db.orders.countDocuments();` on `shop`, and fails with *ReferenceError:
  paid is not defined*, line 7.
- The same script with `.find({ status: "paid" }` (a bracket missing) on line 5 → no items.

Acceptance:

- [ ] The worked example gives its four items and its results.
- [ ] `use("a"); use('b')` before a statement → the statement runs on `b`.
- [ ] `const name = "shop"; use(name)` before a statement → the statement runs on the playground's default database.
- [ ] A script of 5,000 lines gives its statements in less than 100 ms *(Datardo's choice)*, so that the buttons
  follow the typing.

### `playground.rewrite` — Await the calls of a script

A script is written like mongosh, without `await`: `db.users.findOne({ … }).name` works. Before it runs, the script is
rewritten so that every call is awaited where it is, and the value of its last expression is returned.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/playground/rewrite.ts › rewritten(source)`
- **Uses**: nothing; used by `playground.run`, `playground.statements`.
- **Ported from**: `src/playground/rewrite.ts › rewritePlayground`; the README's item **Playground** (*As in mongosh,
  `await` isn't needed*).

Rules:

- The source is parsed as a script of the latest ECMAScript, with `await` and `return` allowed at the top level and a
  `#!` line allowed at the start. A source that does not parse gives a syntax error with the parser's message, its
  line and its column (from 1).
- The result is the source of an async function that runs the script: `(async () => { let V; <code>\n; return V;
  })()`, where `V` stands for the name `__datardoResult`. Text is only inserted, never on a new line, so an error
  thrown while running reports the script's own line.
- *Awaiting* an expression wraps it: `(await R((<expression>)))`, where `R` stands for the function
  `__datardoResolve`. At the start of a statement the outer brackets are left out, `await R((<expression>))`, because
  a line that starts with `(` would continue the line before it when that one has no semicolon.
- `R(value)` gives back a cursor of the runtime as it is, and awaits anything else. So `db.c.find().sort(…).limit(5)`
  stays one lazy cursor until a method that reads it.
- Every call, and every tagged template, is awaited where it is.
- An expression statement is awaited as a whole. The last statement of the script, when it is an expression
  statement, also gives the result: `V = await R((<expression>))`.
- The initializer of a `const`, `let` or `var`, and the value of a `return`, is awaited as a whole, unless it is a
  call (awaited as every call is) or cannot be a promise: a literal, a template literal, an object, an array, a
  unary, binary or update expression, a function or a class. The calls inside those are still awaited.
- Code is rewritten in the script, in its blocks (`if`, `for`, `for…of`, `for…in`, `while`, `do`, `try`, `catch`,
  `finally`, `switch`, labels) and in the bodies of functions that are `async`. A function that is not `async` is
  left as it is, because `await` is not allowed there: a callback of `map` or `forEach` of an array gets promises.
  Parameters are never touched.
- The first argument of `….withTransaction(…)`, when it is a function or an arrow function written in place, becomes
  `async` and is rewritten like the script, so that every write in it is awaited before the commit.
- In an optional chain, a call that comes after a `?.` and is followed by more links is not awaited alone, which
  would lose the chain's short circuit; the whole chain is awaited.

Worked examples (`R` for `__datardoResolve`, `V` for `__datardoResult`; each is a whole script, so its last
expression statement gives the result):

```text
db.users.countDocuments()
→ V = await R((db.users.countDocuments()))

const u = db.users.findOne({ name: "Ada" }); u.name
→ const u = (await R((db.users.findOne({ name: "Ada" })))); V = await R((u.name))

const n = db.stock.findOne({}).n
→ const n = (await R(((await R((db.stock.findOne({})))).n)))

db.users.find().toArray().length
→ V = await R(((await R(((await R((db.users.find()))).toArray()))).length))

print(db.users.countDocuments())
→ V = await R((print((await R((db.users.countDocuments()))))))

if (db.users.findOne({ name: "Ada" })) { print("found") }
→ if ((await R((db.users.findOne({ name: "Ada" }))))) { await R((print("found"))) }

const o = { name: "Ada", n: db.users.countDocuments() }
→ const o = { name: "Ada", n: (await R((db.users.countDocuments()))) }

`${db.users.countDocuments()} users`
→ V = await R((`${(await R((db.users.countDocuments())))} users`))

[1, 2].map((n) => db.items.findOne({ n }))
→ V = await R(([1, 2].map((n) => db.items.findOne({ n }))))

session.withTransaction(() => { orders.insertOne({ _id: 1 }); })
→ V = await R((session.withTransaction(async () => { await R((orders.insertOne({ _id: 1 }))); })))

db.users.findOne({ name: "Ada" })?.address.city
→ V = await R(((await R((db.users.findOne({ name: "Ada" }))))?.address.city))

u?.best().name
→ V = await R((u?.best().name))

async function total(id) { return db.orders.countDocuments({ userId: id }) }
→ async function total(id) { return (await R((db.orders.countDocuments({ userId: id })))) }

function total(id) { return db.orders.countDocuments({ userId: id }) }
→ function total(id) { return db.orders.countDocuments({ userId: id }) }
```

Acceptance:

- [ ] Each worked example above gives exactly its text, inside `(async () => { let V; ` and `\n; return V; })()`.
- [ ] The rewritten text has as many lines as the source plus one, and each line of the source is on its own line
  number: an error thrown on line 7 of the script is reported on line 7.
- [ ] Two lines without semicolons, `const a = db.users.countDocuments()` and `db.orders.countDocuments()`, stay two
  statements: the second is rewritten to start with `V = await`, not with a bracket.
- [ ] `[1, 2].map((n) => db.items.findOne({ n }))` gives an array of promises, not of documents; with
  `.map(async (n) => db.items.findOne({ n }))` the calls in the callback are awaited inside it.
- [ ] `db.users.find({` gives the syntax error *Unexpected token* at line 1; nothing is run.
- [ ] A script whose last statement is a declaration, an `if` or a loop gives no result: `V` stays undefined.
- [ ] A script that already writes `await db.users.findOne({})` runs the same as one that does not.

### `playground.runtime` — What a script can use

The names a script has: `db`, collections with the methods of mongosh, cursors, the BSON types, and printing.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/playground/runtime.ts › runtime(run)`
- **Uses**: `playground.sessions`, `playground.writes`; used by `playground.run`, `playground.autocomplete`.
- **Ported from**: `src/playground/shell.ts` (`Shell`, `ShellCursor`, `ShellMongo`, `helpers`); the README's item
  **Playground** (*Available*).

Rules:

- The script has the names below and those of the language (`Date`, `Math`, `JSON`, `Promise`, `Map`…). It has no
  `require`, no `import`, no `process`, no timers, no files and no network: what it does to a deployment it does
  through `db`.
- `db` is the current database: the playground's default database, or the one of the last `use("name")`, which
  answers `switched to db <name>`. `use()` with anything but a name: *use(): the database name is a string*.
- Methods of `db`: `getName`, `getCollection`, `getSiblingDB`, `getMongo`, `getCollectionNames` (sorted),
  `getCollectionInfos`, `runCommand` and `adminCommand` (a command as an object, or its name), `stats`,
  `serverStatus`, `version`, `hostInfo`, `currentOp`, `aggregate`, `createCollection`, `createView`, `dropDatabase`.
  Any other name is the collection of that name: `db.orders`; and so on for dotted names, `db.logs.archive`,
  `db.system.views`.
- Methods of a collection, reading: `getName`, `getFullName`, `find` and `findOne` (filter, projection, options),
  `aggregate` (a pipeline, or the stages as separate arguments), `countDocuments`, `count` (the same),
  `estimatedDocumentCount`, `distinct`, `getIndexes`, `getSearchIndexes`, `stats`, and `explain()`, whose `find` and
  `aggregate` give the explain with `executionStats`.
- Methods of a collection, writing: `insertOne`, `insertMany`, `insert`, `updateOne`, `updateMany`, `replaceOne`,
  `deleteOne`, `deleteMany`, `findOneAndUpdate`, `findOneAndReplace`, `findOneAndDelete`, `bulkWrite`, `createIndex`,
  `createIndexes`, `dropIndex` (a name or a key), `dropIndexes`, `createSearchIndex` (name and definition; name, type
  and definition; or one object), `updateSearchIndex`, `dropSearchIndex`, `drop`, `renameCollection`.
- `find` and `aggregate` give a cursor, which sends nothing until it is read. It is shaped with `sort`, `limit`,
  `skip`, `project` (or `projection`), `hint`, `collation`, `comment`, `maxTimeMS`, `batchSize`, `allowDiskUse`,
  `pretty` (which changes nothing) and `map`; and read with `toArray`, `forEach`, `hasNext`, `next`, `count` (of a
  `find`: the documents that match its filter), `itcount`, `size`, `explain` (`queryPlanner` unless told), or `for
  await`. A method an aggregation's cursor lacks: *cursor.<method>() is not available on this cursor*.
- `db.getMongo()` has `startSession` (`playground.sessions`), `getDB`, `getDBNames` and `getDBs`.
- The BSON types: `ObjectId`, `ISODate`, `NumberLong`, `NumberInt`, `Int32`, `Double`, `NumberDecimal`, `Decimal128`,
  `UUID`, `BinData` (subtype, base64), `Timestamp` (`t` and `i`, or `{ t, i }`), `MinKey`, `MaxKey`, `Code`, and
  `EJSON`.
- Printing: `print` and `printjson`, and the methods `log`, `info`, `warn`, `error` and `dir` of `console`. Each call
  prints one line: strings as they are, anything else in mongosh syntax on one line, on several lines for `printjson`
  and `dir`; a cursor prints as `[cursor]`, the connection as `[Mongo]`.
- `sleep(ms)` waits.
- A value read from the deployment keeps its BSON type through the script and back: an `Int32` read and written again
  is an `Int32`.

Worked examples:

- `db.orders.find({ status: "paid" }).sort({ total: -1 }).limit(3).toArray().length` → `3`, with one `find` sent.
- `use("shop")` as the last statement → `switched to db shop`.
- `db.getSiblingDB("archive").orders.countDocuments()` counts `archive.orders` and leaves `db` as it was.
- `db.orders.aggregate({ $match: { status: "paid" } }, { $count: "n" })` runs the pipeline of two stages.
- `print("total", NumberLong(5), { a: 1 })` prints `total NumberLong(5) { a: 1 }`.
- `db.orders.find().count()` with 1,204 documents → `1204`, counted on the server, with no document read.
- `db.orders.aggregate([{ $match: {} }]).hint({ status: 1 })` → *cursor.hint() is not available on this cursor*.

Acceptance:

- [ ] Each worked example above gives its result.
- [ ] `db.orders.find()` as the last statement sends one `find` and reads at most 201 documents
  (`playground.results`).
- [ ] `db.getCollection("order-items").findOne({})` and `db["order-items"].findOne({})` read the same collection.
- [ ] `ObjectId()` gives a new id; `ISODate()` the time of the call; `NumberDecimal("1.10")` keeps its two decimals.
- [ ] `db.createView("paid", "orders", [{ $match: { status: "paid" } }])` creates the view and answers `{ ok: 1 }`;
  `db.dropDatabase()`, once confirmed (`playground.writes`), answers `{ ok: 1, dropped: "shop" }`.
- [ ] `sleep(2000)` holds the script for two seconds and the window stays usable.
- [ ] `setTimeout`, `require`, `process` and `fetch` are not defined.

### `playground.sessions` — Sessions and transactions in a script

A script starts sessions and transactions as in mongosh, and what it leaves open is closed for it.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/playground/sessions.ts › session(runtime, options)`
- **Uses**: `playground.runtime`, `playground.writes`, `oplog.publish`; used by `playground.run`, `playground.stop`.
- **Ported from**: `src/playground/shell.ts` (`ShellSession`, `Shell.startSession`, `Shell.closeSessions`,
  `transactionOptions`); the README's item **Playground** (*Sessions and transactions*).

Rules:

- `db.getMongo().startSession(options)` gives a session. Its `readConcern`, `writeConcern` and `readPreference`, and
  those of `defaultTransactionOptions`, are the defaults of its transactions; `readPreference` may be a mode, or `{
  mode, tags, maxStalenessSeconds }`.
- `session.getDatabase("name")` gives a `db` whose collections run every operation in the session: cursors,
  `findOne`, counts, `distinct`, writes, `bulkWrite`, `runCommand`. It has `getSession()` too. A name that is not a
  string: *getDatabase(): the database name is a string*.
- A session has `startTransaction(options)`, `commitTransaction()` and `abortTransaction()` (both answer `{ ok: 1
  }`), `withTransaction(fn, options)`, `endSession()` (which aborts a transaction still open), `inTransaction()`,
  `hasEnded()`, `getSessionId()`, `getClusterTime()`, `getOperationTime()` and `getMongo()`. As a result it shows as
  `{ id, inTransaction, hasEnded }`.
- `withTransaction(fn)` runs `fn(session)` in a transaction and commits it, with the driver's retries: the whole
  callback again on a transient error (a write conflict), the commit again when its outcome is unknown. A first
  argument that is not a function: *withTransaction(): the first argument is a function*. A callback written in place
  needs no `await` (`playground.rewrite`).
- The events for redis-oplog of the writes made in a transaction wait, and go out in order only after the commit. An
  abort drops them; each retry of `withTransaction` starts them over (`playground.writes`).
- When the script ends, fails or is stopped, every session still open is ended, and a transaction still open is
  aborted, never committed. The output then has a note: *Note: The transaction still open was aborted at the end of
  the script: nothing of it was committed (session.commitTransaction() commits).* (*after the error*, or *because the
  run was cancelled*; for several, *The 2 transactions still open were aborted …: nothing of them was committed …*),
  and for sessions without a transaction *Note: a session left open was ended.* (*2 sessions left open were ended.*).
- After a stop the script can start no session: *The run was cancelled.*
- Transactions need a replica set or a sharded cluster. On a standalone server the first operation of the transaction
  fails with the server's message, to which is added *— transactions need a replica set or a sharded cluster (a
  single-node replica set is enough).*
- On a read-only connection sessions and transactions that only read work; the writes in them are refused
  (`playground.writes`).

Worked example:

```js
const session = db.getMongo().startSession();
const shop = session.getDatabase("shop");
session.withTransaction(() => {
  shop.orders.insertOne({ _id: 1, item: "pen" });
  shop.stock.updateOne({ item: "pen" }, { $inc: { n: -1 } });
});
shop.orders.countDocuments()
```

→ both writes are committed together, the result is the count, and the output ends with *Note: a session left open was
ended.*

Acceptance:

- [ ] In the worked example, another client sees neither write before the commit and both after it.
- [ ] A callback that throws after its first write leaves no write behind, and the script fails with the error it
  threw.
- [ ] `session.startTransaction(); shop.orders.insertOne({ _id: 2 })` with no commit: `_id` 2 is not in the
  collection after the run, and the output has the note *aborted at the end of the script*.
- [ ] On a connection that publishes for redis-oplog, the events of the worked example's two writes are published
  after the commit, the insert before the update; a transaction that is aborted publishes none.
- [ ] On a standalone server the worked example fails with the server's message and the added sentence about replica
  sets.
- [ ] A transaction that only reads runs on a read-only connection; `shop.orders.insertOne({})` in it fails with
  *insertOne() is not allowed: the connection is read-only.*

### `playground.results` — The results of a run

What a run returned, under the editor: the documents as a table or as text, a single value, the lines the script
printed, or the error with its line.

- **Kind**: View
- **Engine**: MongoDB
- **Function**: `src/features/playground/results.ts › view(state)`
- **Entry points**: the lower part of a playground tab (`playground.show`). Its toolbar has **Table** and **JSON**
  (`@toolbar`), **Copy** and **Copy as JSON** (`@toolbar`); the line of an error is a link (`@list`).
- **Reads**: the result of the last run of this tab: its title, connection and database, duration, value, printed
  lines and error.
- **Uses**: `playground.run`, `playground.stop`, `table.show` (how a value of each BSON type is written and colored),
  `query.format` (mongosh syntax).
- **Ported from**: `src/webview/playground.ts`, `src/playground/resultPanel.ts`, `src/playground/shell.ts › result`,
  `› serialize`, `› toPlaygroundError`. Mongoster's **Open in Editor** is **Copy as JSON** here.

What it shows, from the top:

1. The summary: `<title> · <connection> › <database> · <n> ms`, and for documents `· <n> documents`. The database is
   the one current when the script ended.
2. The error, when the run failed: its message and, when the line is known, the link `line <n>` (**Show the line in
   the playground**), which puts the caret on that line of the editor.
3. **Output**: the lines the script printed, in order, in a fixed-width font. Left out when it printed nothing.
4. The value of the last expression, by its kind:
   - *documents* (a cursor, or an array in which every element is a document): as a table, or as text with **JSON**;
   - *value* (anything else): as text in mongosh syntax; **Table** is disabled;
   - *none* (the last statement has no value).

States:

- **Before the first run**: *Run a playground with Ctrl+Enter.* and, under it, what a playground does: *A playground
  runs what its script says. Dropping a collection or a database is confirmed first; every other write runs as
  written. Nothing a playground does is recorded in the undo history.*, or on a read-only connection *The connection
  is read-only: the script can read, and every write it makes is refused.*
- **Running**: `Running <title> on <connection> › <database>…`; the results of the run before stay, dimmed. The same
  while the run waits for the confirmation of a drop (`playground.writes`).
- **No value**: *The script ran; its last statement has no value.*, only when nothing was printed either.
- **No documents**: *No documents.*
- **Failed**: the error, the output up to it, and no value.
- **Stopped**: the error *Cancelled. Operations already sent may still complete on the server.* and the output up to
  it (`playground.stop`).

Acceptance:

- [ ] A cursor as the last expression shows its first 200 documents; when it has more, the summary says `200 documents
  (first 200; add .limit() or .toArray() for others)` and no more than 201 are read from the server.
- [ ] The table has the column `#`, then `_id`, then the other fields in the order they are first met in the first
  1,000 documents; a document without a field has an empty cell, not `null`. With more than 1,000 documents (an array
  the script built), the table shows 1,000 and says *Showing 1000 of <n> documents.*
- [ ] A cell shows its value in mongosh syntax with the color of its type, cut at 160 characters with `…`; a value
  longer than 40 characters has the whole of it, up to 4,000 characters, as its tooltip.
- [ ] **JSON** shows the documents as mongosh text (`ObjectId("…")`, `ISODate("…")`), indented; the choice between
  **Table** and **JSON** is kept for the next runs.
- [ ] **Copy** copies the value as that mongosh text; **Copy as JSON** copies it as relaxed Extended JSON indented by
  two spaces. Both are disabled when there is no value. After either, *Copied to the clipboard*.
- [ ] `db.orders.countDocuments()` shows `1204` as text; a function shows as `[Function total]` (`[Function
  anonymous]` without a name); `db.getMongo()` as `[Mongo]`.
- [ ] A run of 38 ms on Local and `shop` that returned 2 documents is summarized `Playground 1 · Local › shop · 38 ms
  · 2 documents`; `1 document` for one.
- [ ] `print("a"); printjson({ b: 1 })` shows under **Output** the line `a` and then `{ b: 1 }` on its own lines.
- [ ] An error thrown on line 4 shows its message and the link `line 4`; when lines 3 to 5 were run alone, the link
  still says the line of the script, 4, and a click puts the caret there.
- [ ] An error other than a plain `Error` starts with its name: *TypeError: u is null*; a syntax error reads
  *SyntaxError: Unexpected token* with its line.
- [ ] A value the script could not turn into BSON (a cycle) is shown as the text JavaScript gives it, and the run does
  not fail.
- [ ] The results of a run stay in the tab while another tab is active, and are gone when the tab is closed or Datardo
  restarts.

### `playground.stop` — Stop a run

Ends the run of a playground at once, whatever its script is doing.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/playground/stop.ts › plan(context, answers)`
- **Entry points**: **Stop** in the toolbar of the tab, in the place of **Run all** (`@toolbar`); **Cancel** beside the
  work in progress on the status line (`@status-line`); Go to (**Stop playground**). Quitting Datardo stops it too,
  after the confirmation of `window.quit`, which lists the run among the work in progress it cancels. Closing the tab
  of a running playground does not stop it: like any plan in progress when its tab closes (`tab.close`), the run goes
  on, on the status line, where **Cancel** stops it.
- **Offered when**: a playground is running, also while it waits for the confirmation of a drop
  (`playground.writes`): stopping then closes the confirmation, and the drop is not sent.
- **Asks**: nothing.
- **Plan**: `stop the run of <title>`: the main process ends the process of the run, without waiting for the script;
  it then aborts the transactions the run left open and ends its sessions (`playground.sessions`), and closes its
  cursors. No operation is killed on the server.
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone: the writes the script had already made stay, and are not in the undo history.
- **Publishes**: Published for redis-oplog (`oplog.publish`), for the writes to documents the run made outside a
  transaction before it was stopped. Not published: the writes of a transaction it left open, which are aborted.
- **After**: the results show the output up to the stop, the notes about what was aborted, and the error *Cancelled.
  Operations already sent may still complete on the server.* (`playground.results`). **Run all** is back, and a new
  run can start at once. The tree and the open pages of the connection are read again as after a run.
- **Commands**: `playground.stop`.
- **Uses**: `playground.run`, `playground.sessions`, `playground.results`, `runner.cancel`, `tab.close`,
  `window.quit`.
- **Ported from**: `src/playground/playground.ts › Playgrounds.run` (the cancellation), `src/playground/shell.ts ›
  Shell.closeSessions`. Ending the process, so that a script that never waits is stopped too, is *New in Datardo*.

Acceptance:

- [ ] `while (true) {}` is stopped by **Stop** within a second, and so is a script that fills the memory.
- [ ] `sleep(600000)` is stopped within a second, and the results say *Cancelled. Operations already sent may still
  complete on the server.*
- [ ] A script stopped inside `session.startTransaction()` and before its commit leaves none of the transaction's
  writes, and the output ends with *Note: The transaction still open was aborted because the run was cancelled:
  nothing of it was committed (session.commitTransaction() commits).*
- [ ] A script stopped while `db.orders.updateMany({}, { $set: { seen: true } })` is running on the server: the update
  may complete there, as the message says; Datardo sends no `killOp`.
- [ ] After **Stop**, the process of the run no longer exists, and **Run all** starts a new one.
- [ ] **Cancel** on the status line does the same as **Stop**, from any tab.
- [ ] A run stopped while the confirmation of `db.orders.drop()` is open: the confirmation closes, `orders` is still
  there, and the script's `catch` around the call does not run.
- [ ] Closing the tab of a running playground leaves the run going, with **Cancel** on the status line; what it prints
  and its error are in the Log under **Playground**, and no other playground can run until it ends or is cancelled.
- [ ] Quitting Datardo with a run in progress asks **Quit Datardo?** with the run among the work it cancels
  (`window.quit`); **Quit** ends the process of the run within a second and leaves none behind; dismissing the
  confirmation leaves the run going.

### `playground.autocomplete` — Autocomplete in a playground

Suggestions while typing a script: the collections and methods after `db.`, the methods of a collection, a cursor, the
connection and a session, and inside a call the fields, operators and values the query bar suggests.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/playground/autocomplete.ts › completions(text, offset, hints)`
- **Entry points**: typing in the editor of a playground (`@editor`): the list opens after `.`, `$`, `"`, `'`, `{`,
  `:`, `[` and `,`, and while a name is typed; `Ctrl+Space` opens it anywhere.
- **Reads**: the names of the collections of the database (`listCollections` with `nameOnly: true`), sorted; a sample
  of the collection, `db.<collection>.aggregate([{ $sample: { size: 300 } }])` with `maxTimeMS: 10000`, analyzed by
  `schema.analyze` for its fields, their types and values. Each is kept for 120 seconds. When either fails, the list
  goes on without it.
- **Uses**: `query.autocomplete` (the suggestions inside a call), `schema.analyze`, `playground.statements` (the
  database at the caret), `playground.runtime` (the methods).
- **Ported from**: `src/playground/context.ts` (`memberAt`, `callAt`, `argumentKind`, `databaseAt`),
  `src/playground/playground.ts › Playgrounds.completions`; the README's item **Playground** (*Autocomplete in the
  file*).

Rules:

- The database is the one of the last `use("…")` before the caret, else the playground's default database; after
  `session.getDatabase("x").`, `db.getSiblingDB("x").` and `db.getMongo().getDB("x").` it is `x`.
- After `db.`: the collections of the database, then the methods of `db`. A collection whose name is not a plain
  identifier is inserted as `getCollection("<name>")`.
- After a collection (`db.users.`, `db.logs.archive.`, `db.getCollection("x").`, `db["x"].`): the methods of a
  collection. After a cursor (`db.users.find(…).`, and after any method chained on it): the methods of a cursor. After
  `db.getMongo().`: `startSession`, `getDB`, `getDBNames`, `getDBs`. After a session: its methods.
- A variable counts as what it was last declared to be with `const`, `let` or `var` before the caret: a database, a
  collection, the connection or a session (`const session = db.getMongo().startSession()`), through up to three
  variables. A variable that holds a cursor or a document is not followed.
- Each method is inserted with its brackets and the caret inside them: `find({ })`, `updateOne({ }, { $set: { } })`,
  `withTransaction(() => { })`.
- Inside the arguments of a call on a collection, the suggestions are those of `query.autocomplete` for that argument:
  a filter for the first argument of `find`, `findOne`, `countDocuments`, `count`, `deleteOne`, `deleteMany`,
  `findOneAndDelete`, `updateOne`, `updateMany`, `findOneAndUpdate`, `replaceOne` and `findOneAndReplace`, and for the
  second of `distinct`; a projection for the second of `find` and `findOne`; an update for the second of `updateOne`,
  `updateMany` and `findOneAndUpdate`; a field name for the first of `distinct`; an index key for `createIndex`; a
  pipeline for `aggregate` and `watch`. After a cursor: a sort in `sort`, a projection in `project` and `projection`,
  an index key in `hint`.
- Nothing is suggested after a `.` inside a string, a comment or a regular expression, and nothing inside a call
  while the caret is in a comment or a regular expression.

Worked examples (`|` is the caret; the database `shop` has the collections `orders`, `order-items` and `users`):

- `db.|` → `order-items` (inserted as `getCollection("order-items")`), `orders`, `users`, then `getCollection`,
  `getCollectionNames`, `getCollectionInfos`, `getName`, `getSiblingDB`, `getMongo`, `aggregate`, `runCommand`,
  `adminCommand`, `stats`, `serverStatus`, `version`, `currentOp`, `createCollection`, `createView`, `dropDatabase`.
- `db.orders.fi|` → `find`, `findOne`, `findOneAndUpdate`, `findOneAndReplace`, `findOneAndDelete`.
- `db.orders.find({ sta| })` → the field `status` of the sample, with its types.
- `db.orders.find({ status: "paid" }).|` → `sort`, `limit`, `skip`, `project`, `toArray`, `count`, `forEach`, `map`,
  `hint`, `collation`, `maxTimeMS`, `explain`, `hasNext`, `next`, `itcount`.
- `db.orders.find({}).sort({ | })` → the fields of `orders`, as for a sort.
- `const s = db.getMongo().startSession(); s.|` → `getDatabase`, `startTransaction`, `commitTransaction`,
  `abortTransaction`, `withTransaction`, `endSession`, `inTransaction`, `hasEnded`, `getSessionId`, `getClusterTime`,
  `getOperationTime`, `getMongo`.
- `s.getDatabase("archive").|` → the collections of `archive`, then the methods of `db`.
- `// db.|` → nothing.

Acceptance:

- [ ] Each worked example above gives its list, in that order.
- [ ] After `use("archive")` on an earlier line, `db.|` lists the collections of `archive`.
- [ ] Typing in a playground whose connection is not connected suggests the methods and no collection or field, and
  connects nothing.
- [ ] The sample of a collection is read once for 120 seconds of typing in calls on it, and never for a collection the
  script does not name.
- [ ] On a view the fields come from a sample of the view; on a collection the sample cannot be read from (no
  privilege), operators are still suggested.
- [ ] Autocomplete sends only `listCollections` and the `$sample` aggregation: it never runs a line of the script.

### `playground.writes` — The writes of a playground

What holds for every write a script makes: refused on a read-only connection, confirmed first when it drops a
collection or a database and never otherwise, not recorded in the undo history, and published for redis-oplog when it
is a write to documents.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/playground/writes.ts › writeCheck(call, connection)`, which says of a call whether it is
  sent, refused, or asked about first, and then with which name.
- **Uses**: `connection.read-only`, `runner.confirm`, `runner.step-text`, `manage.drop-collection` and
  `manage.drop-database` (the sentences of the confirmation), `oplog.publish`, `undo.record` (which a playground does
  not use); used by `playground.run`, `playground.runtime`, `playground.sessions`, `playground.stop`.
- **Ported from**: `src/playground/shell.ts` (`Shell.guard`, `refuse`, `READ_COMMANDS`, `WRITE_STAGES`,
  `checkPipeline`, `command`), `src/playground/oplogWrites.ts`; the README's item **Playground** and its list of what
  cannot be undone. The confirmation of drops is *New in Datardo* (decision D40): Mongoster confirms nothing a
  playground does.

Rules:

- The check is made in the main process, on each call it receives from the process of the run, before anything is
  sent: no code of the script can go around it.
- On a read-only connection, a method that writes fails with *<method>() is not allowed: the connection is
  read-only.*: `insertOne`, `insertMany`, `insert`, `updateOne`, `updateMany`, `replaceOne`, `deleteOne`,
  `deleteMany`, `findOneAndUpdate`, `findOneAndReplace`, `findOneAndDelete`, `bulkWrite`, `createIndex`,
  `createIndexes`, `dropIndex`, `dropIndexes`, `createSearchIndex`, `updateSearchIndex`, `dropSearchIndex`, `drop`,
  `renameCollection`, and of `db`: `createCollection`, `createView`, `dropDatabase`.
- On a read-only connection, an `aggregate` whose pipeline has a stage `$out` or `$merge` fails with *A pipeline with
  $out is not allowed: the connection is read-only.* (or *with $merge*), on a collection, on `db` and through
  `runCommand`.
- On a read-only connection, `runCommand` and `adminCommand` run only these commands: `find`, `aggregate`, `count`,
  `distinct`, `listCollections`, `listIndexes`, `listDatabases`, `dbStats`, `collStats`, `serverStatus`, `buildInfo`,
  `buildinfo`, `ping`, `hello`, `isMaster`, `ismaster`, `explain`, `connectionStatus`, `hostInfo`, `getParameter`,
  `currentOp`, `top`, `getLog`, `replSetGetStatus`, `getCmdLineOpts`, `validate`, `dataSize`, `listCommands`,
  `whatsmyuri`, `features`, `getMore`, `profile`. Any other fails with *The command <name> is not allowed: the
  connection is read-only.*
- The error is an error of the script: it has the line of the call, the script stops there unless it catches it, and
  what it did before stays done.
- A write through a view is refused by the server, with the server's message.
- No write is recorded in the undo history, a confirmed drop no more than the others: nothing is kept before it, the
  Undo history page does not list it, and no notification offers **Undo**.

Rules of the drops (decision D40), on a connection that is not read-only:

- A drop is one of four calls: `drop()` on a collection or a view; `dropDatabase()` on a database; `runCommand` or
  `adminCommand` with the command `drop` and a name that is a string (`{ drop: "orders" }`); `runCommand` or
  `adminCommand` with the command `dropDatabase`, as an object or as its name (`{ dropDatabase: 1 }`,
  `"dropDatabase"`). The database is the one the call is made on: `db`, a database of `getSiblingDB`, of
  `getMongo().getDB` or of a session; for `adminCommand` it is `admin`.
- Before a drop is sent, the run waits at that call and Datardo asks, with the destructive confirmation of
  `runner.confirm`. Nothing else is confirmed: `deleteMany({})`, `updateMany`, `insertMany`, `bulkWrite`,
  `dropIndex`, `dropIndexes`, `dropSearchIndex`, `renameCollection` (also with its second argument `true`, which
  drops the collection of the new name) and a pipeline with `$out` or `$merge` run as the script wrote them.
- A collection that does not exist is not asked about. This is known by a read made before asking, `listCollections`
  with the name as its filter, in the database of the call: when it answers with no collection, the call is sent as it
  is and the server answers it. When that read fails, the question is asked. `dropDatabase` is asked about every time,
  whatever the database holds.
- The confirmation of a collection: the title **Drop collection shop.orders**; *The script of Playground 1 drops it at
  line 4.*; *Deletes 1,234 documents and 2 indexes. This cannot be undone.*, with the numbers read as
  `manage.drop-collection` reads them, and only *This cannot be undone.* when they could not be read; the step, as
  `runner.step-text` writes it; the field *Type orders to confirm*; the buttons **Drop** and **Cancel**. For a view the
  title is **Drop view shop.recent** and the sentence *The documents of its source collection are not affected. This
  cannot be undone.*
- The confirmation of a database: the title **Drop database shop**; *The script of Playground 1 drops it at line 4.*;
  *Deletes 3 collections with all their documents. This cannot be undone.*, as `manage.drop-database` reads and writes
  it; the step; the field *Type shop to confirm*; **Drop** and **Cancel**.
- The step is the call as the script made it: `db.orders.drop()`, `db.dropDatabase()`, `db.runCommand({ drop:
  "orders" })`. The database is left out when it is the script's current database at that call; any other is written
  `db.getSiblingDB("archive").orders.drop()`, whatever way the script reached it.
- The line of the confirmation is the line of the call in the script, also when a selection or a statement runs alone.
  The playground's tab is made active before the question when it is still open.
- **Drop**: the call is sent, and the script goes on with its result (`true`, `{ ok: 1, dropped: "shop" }`, the
  server's reply for `runCommand`).
- **Cancel**, or `Esc`: nothing is sent, and the call throws in the script an `Error` whose message is *Dropping
  shop.orders was cancelled.* for a collection or a view, *Dropping the database shop was cancelled.* for a database.
  The script can catch it and go on. A script that does not catch it ends there, as with any other error: the result
  shows the message with its line, and what the script did before stays done.
- Each call is asked about by itself, in the order the script reaches them: a loop that drops three collections asks
  three times. No answer covers a later call, and the confirmation has no way to answer for all.
- While the question is open nothing is sent for the run, its time goes on, and **Stop** of the toolbar, **Cancel**
  of the status line and the command of `playground.stop` stay usable: they close the question, send nothing of the
  drop, and stop the run. A transaction the script left open while it waits can expire on the server, as it can
  during a `sleep`.
- On a read-only connection the question is never reached: the drop is refused first, as the rules above say.
- Each answer is written in the Log under the source **Playground**: `db.orders.drop(): confirmed`, `db.orders.drop():
  cancelled`.

Rules of publishing:

- On a connection that publishes for redis-oplog, the writes to documents made with the methods of a collection are
  published, for the collections in the connection's scope, whatever database the script uses. How each write gives
  its events is the oplog area's card on the writes of a playground. The events of a transaction go out after its
  commit (`playground.sessions`).
- Not published: what a script writes with `runCommand` or `adminCommand`, with `$out` or `$merge`, and what is not a
  write to documents (indexes, collections, views).

Worked examples (a read-only connection):

- `db.orders.deleteMany({})` → *deleteMany() is not allowed: the connection is read-only.*, line 1; nothing is sent.
- `db.orders.aggregate([{ $match: {} }, { $out: "copy" }])` → *A pipeline with $out is not allowed: the connection is
  read-only.*
- `db.runCommand({ ping: 1 })` → `{ ok: 1 }`. `db.runCommand({ create: "x" })` → *The command create is not allowed:
  the connection is read-only.* `db.runCommand("dropDatabase")` → *The command dropDatabase is not allowed: the
  connection is read-only.*
- `db.orders.find({}).toArray().length` → the count: reading is not refused.
- `try { db.orders.insertOne({}) } catch (e) { print(e.message) }` → prints *insertOne() is not allowed: the
  connection is read-only.* and the script goes on.
- `db.orders.drop()` → *drop() is not allowed: the connection is read-only.*, with no confirmation.

Worked examples (the connection Local, which allows writes; the database `shop` has the collections `orders`, with
1,234 documents and 2 indexes, and `users`, and no collection `old`):

- `db.orders.drop()` → the confirmation **Drop collection shop.orders**, step `db.orders.drop()`, *Type orders to
  confirm*. Confirmed → `true`. Cancelled → the script fails with *Dropping shop.orders was cancelled.*, line 1.
- `db.old.drop()` → no confirmation; the call is sent and the result is what the server answers.
- `db.runCommand({ drop: "orders" })` → the same confirmation with the step `db.runCommand({ drop: "orders" })`.
  Confirmed → the server's reply, with `ok: 1`.
- `db.getSiblingDB("archive").dropDatabase()` → **Drop database archive**, step
  `db.getSiblingDB("archive").dropDatabase()`, *Type archive to confirm*.
- `db.runCommand({ dropDatabase: 1 })` and `db.runCommand("dropDatabase")` → **Drop database shop**, *Type shop to
  confirm*.
- `try { db.orders.drop() } catch (e) { print(e.message) } print("after")`, cancelled → prints *Dropping shop.orders
  was cancelled.* and then `after`; `orders` is still there and the run does not fail.
- `for (const name of ["orders", "users"]) db.getCollection(name).drop()` → two confirmations, one after the other,
  the first for `orders`; confirming the first and cancelling the second leaves `orders` dropped and `users` there.
- `db.orders.deleteMany({})`, `db.orders.renameCollection("users", true)`, `db.orders.dropIndexes()` → no
  confirmation.

Acceptance:

- [ ] Each worked example above gives its result, and after those of the read-only connection the deployment is as it
  was.
- [ ] While the confirmation of `db.orders.drop()` is open, the server has received nothing of the drop; with `order`
  typed in the field **Drop** is disabled, and with `orders` it is enabled.
- [ ] Two `drop()` calls of existing collections ask twice, and three in a loop three times; confirming the first
  answers nothing for the second.
- [ ] A cancelled drop that the script does not catch ends the run with *Dropping shop.orders was cancelled.* and the
  link to its line; the lines before it have run and the lines after it have not.
- [ ] **Stop** while the confirmation is open closes it, sends nothing of the drop, and the results say *Cancelled.
  Operations already sent may still complete on the server.*
- [ ] A drop confirmed in a playground adds nothing to the Undo history page, and the Log has `db.orders.drop():
  confirmed` under **Playground**.
- [ ] When `listCollections` is refused to the user, `db.old.drop()` is asked about like a collection that exists,
  with *This cannot be undone.* alone.
- [ ] On a read-only connection every method of the two lists above is refused, with its own name in the message.
- [ ] On a connection that is not read-only, `db.orders.deleteMany({ status: "old" })` deletes without a confirmation,
  the Undo history page has no new operation, and no notification with **Undo** appears.
- [ ] On a connection that publishes for redis-oplog with `shop.orders` in its scope, `db.orders.updateOne({ _id: 7 },
  { $set: { status: "paid" } })` publishes one update event for `_id` 7 with the field `status`; the same write on a
  collection out of the scope publishes nothing.
- [ ] `db.runCommand({ insert: "orders", documents: [{ _id: 8 }] })` inserts the document and publishes nothing.
- [ ] A script that redefines `db`, or calls a method through `db["orders"]["deleteMany"]`, is still refused on a
  read-only connection.
