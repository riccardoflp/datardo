# The runner

The runner is what carries out every feature: it asks the questions a feature returns, makes its reads, shows its
refusals, confirms its plans, runs their steps, shows the work in progress, notifies, and writes the Log. It is written
once, in `src/runner`, and no feature repeats any of it. The cards of this area describe the runner itself, so their
functions are in `src/runner` and not in `src/features`; its views and its one derivation are features like the
others. How a feature and the runner talk is in the [feature contract](../feature-contract.md#how-a-feature-runs).

### `runner.ask` — Ask the questions of a feature

A feature that needs something from the user returns a question; the runner shows it in a dialog and gives the answer
back. Every feature asks through these four forms, so every question looks and behaves the same.

- **Kind**: View
- **Engine**: Any
- **Function**: `src/features/runner/ask.ts › view(state)`, drawn for the question `src/runner/ask.ts` holds.
- **Entry points**: opened by the runner, never by the user. Its buttons are in the dialog (`@dialog`).
- **Refuses**: a question for a feature that a tool of the MCP server started, since nobody is there to answer
  (`/needs-a-person`).
- **Uses**: `runner.run`.
- **Ported from**: *New in Datardo*; it takes the place of VS Code's quick picks and input boxes in Mongoster.

Acceptance:

- [ ] A question is one of four forms: **text** (one line, with a validation that shows its message under the field
      as the user types and disables the button while it fails), **pick one** (a list with a filter field once it has
      more than 8 items *(Datardo's choice)*), **pick many** (the same list with checkboxes), and **form** (several
      named fields of the three other forms).
- [ ] The dialog's title is the feature's title, its button is named by the question (never **OK**), and **Cancel**
      is always there.
- [ ] `Enter` answers with the default button; `Esc`, **Cancel** and a click outside the dialog cancel.
- [ ] Cancelling ends the feature: nothing is run, nothing is said, and the Log has no line for it.
- [ ] A question with a default shows it filled in and selected.
- [ ] While a question is open the rest of the window does not take clicks or keys, and focus goes back to the control
      that started the feature when the dialog closes.
- [ ] A feature started by a tool of the MCP server is never asked a question: it is refused with
      `runner.ask/needs-a-person`.

### `runner.confirm` — The confirmation of a write, with its plan

Before a dangerous write, the user sees exactly what will be sent, how much it touches and whether it can be undone,
and decides.

- **Kind**: View
- **Engine**: Any
- **Function**: `src/features/runner/confirm.ts › view(state)`
- **Entry points**: opened by the runner when a plan's danger is *Confirm* or *Destructive*. The button that runs
  the plan and **Cancel** are in the dialog (`@dialog`).
- **Uses**: `runner.run`, `runner.step-text`, `undo.note`, `undo.record`.
- **Ported from**: *New in Datardo*; it takes the place of VS Code's modal warnings in Mongoster, whose texts the
  cards keep.

Acceptance:

- [ ] A plan whose danger is *None* runs with no confirmation.
- [ ] A plan whose danger is *Confirm* shows a dialog with, from the top: the plan's title; the text of the
      confirmation its card gives; how much it touches (*3 documents*, *1,204 keys*); the steps, each as
      `runner.step-text` writes it; one line on undo; the button named after the action (**Delete**, **Update**,
      **Drop index**) and **Cancel**.
- [ ] The line on undo is the one `undo.note` gives, word for word: *It can be undone from the Undo history.* when
      the plan will be recorded, and otherwise the reason it will not: the undo history is off for the app or for the
      connection, the write is over a limit, or the card says the kind of write is never recorded.
- [ ] The count shown is read when the confirmation opens, with the same filter or pattern the steps use.
- [ ] The first 20 steps are shown *(Datardo's choice)*; a plan with more shows *and 37 more* as a button that shows
      them all.
- [ ] Focus starts on **Cancel**. `Enter` on the action's button runs the plan; `Esc` cancels.
- [ ] A plan whose danger is *Destructive* shows the same dialog and, above the buttons, a field labelled *Type
      <name> to confirm*, where the name is what the card says is lost. The action's button is disabled until the
      field holds exactly that name, compared with case, and `Enter` in the field does nothing while it does not.
- [ ] Cancelling ends the feature: nothing is run, nothing is recorded in the undo history, and the Log has no line.
- [ ] A confirmation asked by a run in progress (a drop that a playground's script reaches, `playground.writes`)
      leaves the **Stop** of that run usable beside the dialog; stopping the run closes the confirmation as
      cancelled.
- [ ] The steps shown hold no secret: `runner.step-text` has masked them.

### `runner.run` — Run a plan

The steps of a plan are run in order, with everything that must happen around a write happening every time, in the
same order.

- **Kind**: Operation
- **Engine**: Any
- **Function**: `src/runner/run.ts › runPlan(plan, context)`
- **Entry points**: none of its own: every Operation of the catalog ends here.
- **Plan**: the plan it is given. Around its steps, in this order: the read-only guard; the confirmation
  (`runner.confirm`); recording what the undo history keeps (`undo.record`); the steps, one by one; publishing for
  redis-oplog (`oplog.publish`); what the plan says follows; the notification (`runner.notify`).
- **Danger**: the plan's.
- **Read-only**: Refused on a read-only connection (`/read-only`) for any plan with a step that writes to a
  deployment, whatever the feature said. This is a last guard: a feature that writes refuses first, with its own code.
- **Undo**: the plan's; the runner records it before the first step, or the confirmation has said why it cannot.
- **After**: reads again what the open pages show of the target, then notifies.
- **Refuses**: a step that writes to a deployment through a read-only connection, *The connection <name> is
  read-only.* (`/read-only`); through a MongoDB view, *<name> is a view: it cannot be written to.* (`/view`); a
  connection that is not connected, *<name> is not connected.* (`/not-connected`).
- **Uses**: `runner.confirm`, `runner.progress`, `runner.cancel`, `runner.notify`, `runner.log`, `runner.error`,
  `undo.record`, `oplog.publish`, `connection.read-only`.
- **Ported from**: Mongoster's write pipeline (its architecture page, "Writing to a database"), which each of its
  features repeats by hand: `src/docHistory.ts › DocumentHistoryPanel.restore` is a short example.

Acceptance:

- [ ] The read-only guard looks at the connection as it is when the plan is about to run: a plan made before the
      connection was made read-only is refused with `runner.run/read-only`, and nothing is sent.
- [ ] The guard runs again before each step that writes: making the connection read-only while a plan of many steps
      runs stops it before the next step.
- [ ] Each step is written in the Log before it is sent, as `[<feature>] <step text>`, and its outcome after: the
      count it changed and the time it took, or the error.
- [ ] A step that fails stops the plan: the steps before it stay done, the steps after it are not sent, and the
      message says *Stopped at step 3 of 5.* with the error (`runner.error`).
- [ ] A step may say what happens when it fails, and only its card decides it: *stop* (the default); *go on* with
      the next step; or *instead*, other steps that are run in its place, for all its errors or for the server's
      codes it names. The confirmation shows the steps of *instead* under their step, as *if this fails:*. A plan
      that went on after a failed step ends with a warning that lists the steps that failed.
- [ ] A plan may be made of groups of steps, each with a title (one difference of a structure comparison, one file of
      an upload): a step that fails stops its group only, and the next group runs.
- [ ] When what the undo history must keep turns out too large while it is read, the question of `undo.record`
      (**\<Action\> without the possibility to undo?**) is asked before the first step is sent; answering no ends
      the plan with nothing written. In a plan that runs in batches the question is asked before the batch that
      passes the limit, and answering no stops there, with what was written recorded.
- [ ] What `undo.record` kept for a plan that stopped part way stays in the undo history, so that the steps that ran
      can be undone.
- [ ] Nothing is recorded in the undo history and nothing is published for a plan that was refused or cancelled
      before its first step.
- [ ] Publishing for redis-oplog happens after the steps and only for what they changed; an error while publishing
      does not fail the plan and shows a warning at most every 30 seconds.
- [ ] A plan that runs longer than 400 ms *(Datardo's choice)* shows as work in progress (`runner.progress`).
- [ ] After a plan, every open page that shows the target reads it again, whether or not it is the active tab.
- [ ] Two plans on the same connection run one after the other, in the order they were confirmed.

### `runner.step-text` — How a step is written

The one text of a step: what the confirmation shows, what the Log records, and what a test compares.

- **Kind**: Derivation
- **Engine**: Any
- **Function**: `src/features/runner/step-text.ts › stepText(step)`
- **Uses**: `query.format`.
- **Ported from**: *New in Datardo*.

Rules of the result:

- A MongoDB step is the call as the user would type it in mongosh, on one line, with its values in mongosh syntax as
  `query.format` writes them: `db.orders.deleteOne({ _id: ObjectId("65f1c0ffee0000000000a2c1") })`. The database is
  not in the text when it is the plan's target; a step on another database starts with `db.getSiblingDB("other")`.
- A Redis step is the command and its arguments separated by spaces, an argument with a space, a quote or a byte that
  is not printable written in double quotes with `\"`, `\\` and `\xNN`: `SET "user 7" "a\x00b" KEEPTTL`.
- A file step is `write`, `delete` or `create folder` and the full path. An app step is a short sentence: `save the
  connection Local`.
- A value longer than 200 characters *(Datardo's choice)* is cut to its first 200 followed by `… (1,804 more)`; a
  list of more than 10 documents or arguments shows the first 10 and `… and 990 more`. The step that is sent is never
  cut.
- A secret is never written: a password, a passphrase, a key or a token in a step is `***`. The arguments masked in
  Redis commands are those after `AUTH`, the password of `HELLO … AUTH`, of `MIGRATE … AUTH` and `AUTH2`, and the
  value of `CONFIG SET requirepass` and `masterauth`; in MongoDB commands, `pwd` of `createUser` and `updateUser`.
- The same step always gives the same text.

Examples:

- `updateMany` on `shop.orders` with filter `{ status: "new" }` and update `{ $set: { status: "paid" } }` →
  `db.orders.updateMany({ status: "new" }, { $set: { status: "paid" } })`.
- Redis `["DEL", "orders:42"]` → `DEL orders:42`.
- Redis `["AUTH", "app", "s3cret"]` → `AUTH app ***`.
- MongoDB `createUser` with `pwd: "s3cret"` → `db.createUser({ user: "app", pwd: "***", roles: ["read"] })`.

Acceptance:

- [ ] Each example above gives exactly the text shown.
- [ ] No text holds a value marked as a secret, for every kind of step.
- [ ] Cutting never splits an escape (`\xNN`) or a multi-byte character.

### `runner.progress` — Work in progress

What takes long is shown on the status line while it runs, so the window never looks stuck and the user can go on
working.

- **Kind**: View
- **Engine**: Any
- **Function**: `src/features/runner/progress.ts › view(state)`
- **Entry points**: the status line shows the count of work in progress (`@status-line`); a click opens the list of
  work (`@list`).
- **Uses**: `runner.cancel`, `nav.status-line`.
- **Ported from**: *New in Datardo*; it takes the place of VS Code's progress notifications in Mongoster.

Acceptance:

- [ ] A read, a plan or a task that runs longer than 400 ms *(Datardo's choice)* becomes an item of work in progress;
      one that ends sooner never shows.
- [ ] The status line shows *1 task running* or *3 tasks running*, and nothing when there is none.
- [ ] The list shows for each item its title, the connection, the time since it started, and its progress: *4,000 of
      52,310 documents* with a bar when the total is known, a moving bar when it is not.
- [ ] Each item has **Cancel**; an item that cannot be cancelled says why in place of it.
- [ ] An item leaves the list when it ends; one that failed stays, with its error, until dismissed.
- [ ] Work in progress does not stop the user from changing tab or running something else.
- [ ] The work of a tab that is closed is cancelled, except a plan that has started to write, which goes on.

### `runner.cancel` — Cancel work in progress

Stops something that is running: a query, a scan, an export, a plan between two of its batches.

- **Kind**: Operation
- **Engine**: Any
- **Function**: `src/runner/cancel.ts › cancel(workId)`
- **Entry points**: **Cancel** on an item of the list of work (`@list`); **Cancel** beside a running query in its page
  (`query.bar`); Go to, **Cancel work in progress**, which cancels the item started last.
- **Offered when**: there is work in progress.
- **Plan**: no step. The work's `AbortSignal` is raised; a MongoDB operation in progress is also stopped on the
  server with `killOp` of its own operation when the server allows it.
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone: there is nothing to put back. What a cancelled plan had already written stays, and is
  in the undo history when it was recorded.
- **After**: the item says *Cancelled* and leaves the list; a cancelled plan notifies with how far it went: *Stopped
  after 4,000 of 52,310 documents.*
- **Commands**: `runner.cancel`
- **Uses**: `runner.progress`, `runner.notify`.
- **Ported from**: *New in Datardo*; Mongoster's `Cancel` of its progress notifications does the same per feature.

Acceptance:

- [ ] Cancelling a read stops waiting for it at once, and its page shows *Cancelled* with **Run again**.
- [ ] Cancelling a plan that works in batches stops it after the batch in progress, never in the middle of one.
- [ ] What a cancelled plan wrote is in the undo history when the plan was recorded, and undoing it puts back exactly
      what was written.
- [ ] A plan of one step that has been sent cannot be cancelled, and its item says *Already sent to the server.*
- [ ] Cancelling is written in the Log as `[<feature>] cancelled` with how far the work went.

### `runner.refuse` — Show a refusal

When a feature will not run, the user reads why in a sentence, where they are looking.

- **Kind**: View
- **Engine**: Any
- **Function**: `src/features/runner/refuse.ts › view(state)`
- **Entry points**: shown by the runner. A refusal's **Details** is in the notification (`@notification`).
- **Uses**: `runner.notify`, `runner.log`.
- **Ported from**: *New in Datardo*; the messages are those of Mongoster's `errorMessage` (`src/tree.ts`) and of its
  features.

Acceptance:

- [ ] A refusal shows its message as a notification of the kind *warning*, never as a dialog, and never with a stack
      trace.
- [ ] **Details** shows the refusal's code (`document.delete/read-only`) and can be copied.
- [ ] The Log records `[<feature>] refused: <code>` and the message.
- [ ] A control whose feature would certainly refuse is shown disabled, with the refusal's message as its tooltip,
      for the reasons known without asking the server: a read-only connection, a view, a connection not connected.
- [ ] A refusal to a tool of the MCP server is returned to the assistant as the tool's error, with the code and the
      message.

### `runner.error` — Show an error of a server or of the system

An error Datardo did not decide (the server said no, the network dropped, the disk is full) is said in the product's
words, with the original under it.

- **Kind**: Derivation
- **Engine**: Any
- **Function**: `src/features/runner/error.ts › errorMessage(error, context)`
- **Uses**: `runner.notify`, `runner.log`.
- **Ported from**: Mongoster's `src/tree.ts › errorMessage`.

Rules of the result:

- The result has a message for the user, the original text and code of the server or the system as **Details**, and
  a kind: *not connected*, *timed out*, *not allowed*, *not found*, *conflict*, *invalid*, *disk*, *other*.
- MongoDB: an authentication failure (code 18) and an authorization failure (code 13) are *not allowed*: *The user of
  <connection> is not allowed to do this.*; `MaxTimeMSExpired` (code 50) is *timed out*: *The server took longer than
  <n> seconds.*; a duplicate key (code 11000) is *conflict*: *A document with the same <index> already exists.*; a
  network error or a server selection timeout is *not connected*.
- Redis: a reply starting with `NOAUTH` or `WRONGPASS` or `NOPERM` is *not allowed*; `WRONGTYPE` is *invalid*: *The
  key holds another type of value.*; `READONLY` is *not allowed*: *This server is a replica and does not accept
  writes.*; `OOM` is *other*: *The server is out of memory.*; a closed socket is *not connected*.
- The system: `ENOSPC` is *disk*: *The disk is full.*; `EACCES` and `EPERM` are *not allowed*: *Datardo may not write
  to <path>.*
- Anything else keeps the original text as the message, without its stack trace.
- No message holds a secret: a connection string in an error's text has its password replaced by `***`.

Acceptance:

- [ ] Each case above gives its kind and its message.
- [ ] An error whose text holds `mongodb://app:s3cret@host` is shown with `mongodb://app:***@host`.
- [ ] An error inside a page (a query that fails) is shown in the page, under the control that caused it, with
      **Details** and **Run again**; an error of a plan is shown as a notification of the kind *error*.
- [ ] An error of the kind *not connected* offers **Reconnect**, which starts `connection.connect`.

### `runner.notify` — Notifications

Short messages at the bottom right of the window say what just happened and offer what follows, without stopping the
user.

- **Kind**: View
- **Engine**: Any
- **Function**: `src/features/runner/notify.ts › view(state)`
- **Entry points**: shown by the runner and by features' **After**. Closing one is in the notification
  (`@notification`); **Show in log** is there too (`@notification`).
- **Settings**: `datardo.runner.systemNotifications`.
- **Uses**: `undo.notification`, `runner.log`.
- **Ported from**: *New in Datardo*; it takes the place of VS Code's notifications in Mongoster, whose texts the cards
  keep.

Acceptance:

- [ ] A notification has a kind (*info*, *success*, *warning*, *error*), one or two lines of text, and up to two
      actions; the first action of a write that was recorded is **Undo** (`undo.notification`).
- [ ] *info* and *success* go away after 6 seconds *(Datardo's choice)*, and stay while the pointer or the focus is
      on them; *warning* and *error* stay until closed.
- [ ] At most 3 notifications show at once *(Datardo's choice)*, the newest at the bottom; an older one leaves the
      screen but stays in the Log.
- [ ] The same message arriving again within 30 seconds does not add a notification: the one shown counts them (*×3*).
- [ ] Every notification is also a line of the Log, and **Show in log** opens the Log at that line.
- [ ] A notification never takes the focus; `F6` reaches the notifications after the islands; a screen reader is told
      of each one, at once for an *error* and politely for the others.
- [ ] While the window is not in front, the end of work that ran longer than 30 seconds *(Datardo's choice)* also
      shows as a notification of the operating system, when `datardo.runner.systemNotifications` is on (the default).

### `runner.log` — The Log page

Everything Datardo did, in order: every step sent, every refusal, every call of an AI assistant, every run of a
task. It answers "what did it just do?" and "what did the assistant read?".

- **Kind**: View
- **Engine**: Any
- **Function**: `src/features/runner/log.ts › view(state)`
- **Entry points**: Go to, **Show log**; **Show in log** of a notification (`@notification`); **Show the log** of the MCP
  dialog opens it filtered to the source **MCP** (`mcp.log`). Its own controls are in its toolbar (`@toolbar`).
- **Commands**: `runner.log`
- **Uses**: `runner.step-text`, `tab.open`.
- **Ported from**: *New in Datardo*; it takes the place of Mongoster's output channels (`Mongoster MCP`, `Mongoster
  Playground`).

Acceptance:

- [ ] The Log is an app tab. Each line has the time to the millisecond, the connection, the source, and the text. The
      source is the identifier of the feature for a step or a refusal, **MCP** for a call of a tool, **Tasks** for a
      run of a scheduled task, **Playground** for what a playground prints, **Console** for a command of the Redis
      console.
- [ ] A step is two lines: when it is sent, and its outcome with the count it changed and the time it took.
- [ ] The toolbar filters by source, by connection, by kind (steps, refusals, errors) and by a text; **Follow** keeps
      the newest line in view and turns off when the user scrolls up.
- [ ] The Log keeps the last 5,000 lines *(Datardo's choice)* in memory. It is never written to disk by itself, since
      its lines hold values of the user's data; **Export…** writes the lines shown to a file the user chooses.
- [ ] **Copy** copies the selected lines as text; **Clear** empties the Log after no confirmation, since nothing but
      the Log is lost.
- [ ] No line holds a secret (`runner.step-text`, `runner.error`).
- [ ] A click on a line's feature identifier does nothing in the product; it is there to be searched for.
- [ ] The page passes the accessibility check with 5,000 lines, of which only those on screen are drawn.
