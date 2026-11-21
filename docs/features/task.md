# Scheduled tasks

Backups and exports that run by themselves at set times while Datardo is running: the Scheduled tasks page, the form of
a task, when a task runs (also across daylight saving changes), runs that were missed, how many outputs are kept, the
notifications of the runs, and when closing the window keeps Datardo in the tray. What a run writes is the backup of
`backup.create` or the export of `transfer.export`.

A task runs a backup or an export of MongoDB. Tasks for Redis are not in the first release: the form lists MongoDB
connections only, and **Schedule…** is not offered on the nodes of a Redis connection. A task is nevertheless stored
with the engine of its connection, the field `engine`, which is `mongodb` for every task today, so that tasks for
Redis can be added later without a migration of the stored tasks.

Datardo runs as one instance with one window (`window.single-instance`). Mongoster shared its tasks between several
windows under a file lock, with a card of its own (task.one-window): neither has a place here. The single instance
takes their place: one scheduler runs in the main process, a task is never run twice for the same time because nothing
else runs it, and the page always shows what that scheduler is doing.

The tasks, and for each task its state (the last scheduled time handled, its last 20 runs, the outputs it wrote), are
files of Datardo's data folder. Each is written whole to a temporary file that is then renamed, so that a crash never
leaves half a file.

### `task.show` — The Scheduled tasks page

Lists the tasks with when they run, the next run and the last result, and, for a task, its last 20 runs with what they
wrote.

- **Kind**: View
- **Engine**: Any
- **Function**: `src/features/task/show.ts › view(state)`
- **Entry points**: **Scheduled tasks** on the rail (`@rail`); **Scheduled tasks** among the pages of a MongoDB
  connection in the tree island (`@tree`); the count of running tasks on the status line (`@status-line`); **Show
  scheduled tasks** on the notifications of `task.notify` (`@notification`); Go to (**Scheduled tasks**). The output
  of a run in the details of a task is a link that shows it in the system's file manager (`@list`), as **Reveal** of
  a notification does.
- **Offered when**: always. The page is an app tab: it belongs to no connection, and there is one of it.
- **Reads**: the tasks and their states from Datardo's data folder; the saved connections, for their names and
  colors; `task.next-runs` for the next run of each task; the runs in progress, from the scheduler. It is shown again
  whenever a task, a state or a connection changes, and once a second while a run is in progress.
- **Commands**: `task.show`.
- **Settings**: `datardo.task.keepRunningInTray` (the note about the tray).
- **Uses**: `task.edit`, `task.run`, `task.cancel`, `task.enable`, `task.delete`, `task.next-runs`, `task.tray`,
  `settings.page`, `nav.rail`, `nav.status-line`, `tab.open`.
- **Ported from**: Mongoster's card task.show (`src/scheduledTasks.ts`, `src/webview/scheduledTasks.ts`,
  `src/scheduler.ts › Scheduler.list`).

What it shows, from the top:

1. The toolbar: the summary `<n> tasks, <k> enabled`, and **New task…** (`task.edit@toolbar`).
2. The note about the tray, when it applies (below).
3. The last message of the page: what `task.edit` saved, or why **Run now** did nothing.
4. The form of a task while one is being created or edited (`task.edit`).
5. The list of tasks, one item each, in the order they were created.

Each item shows: the **Enabled** switch (`task.enable@list`); the name, and under it `Backup, Archive (.agz)` (or
`Export, CSV`…); the source `<connection> › <database>.<collection>` (`<database> (all collections)`, `all databases`),
with the connection's color; the schedule as `task.next-runs` describes it; the next run; the last run; and **Run now**
(`task.run@list`), which is **Cancel** while the task runs (`task.cancel@list`). **Edit** (`task.edit@item-menu`) and
**Delete** (`task.delete@item-menu`) are in the item's context menu and under its `…` button. A click on an item, or
`Enter` on it, opens and closes its details.

States:

- **Empty**: no list; the page says *No scheduled tasks yet. New task… (or Schedule… on a connection, a database or a
  collection) backs up or exports periodically.* (`@empty-state`).
- **Running**: the item says `running` and what the run is doing (`shop.orders: 12,000 documents`); the status line says
  `1 task running` (`2 tasks running`).
- **Disabled**: the item is greyed and its next run is `—`.
- **Removed connection**: the source reads `The connection was removed › <database>.<collection>` in the error color.

Acceptance:

- [ ] Without tasks the page says *No scheduled tasks yet. New task… (or Schedule… on a connection, a database or a
  collection) backs up or exports periodically.*
- [ ] With 3 tasks of which 2 are enabled the toolbar shows `3 tasks, 2 enabled` and the button **New task…**.
- [ ] The next run reads `today 02:00`, `tomorrow 02:00` or `Fri 13 Nov 02:00`, and `—` when the task is disabled.
- [ ] The last run shows its result (`done`, `failed`, `skipped`, `cancelled`, `missed`) and when; a successful one
  `<n> collections, <n> documents, <size>, <duration>`, a failed one its error; while running, `running` and what it
  is doing; without runs, `never`.
- [ ] The details of an item show `Writes: <format> in <folder>, named <pattern>`, `Query: filter …, projection …` for
  an export with a filter or a projection, `Keeps: the last <n> files it wrote` (`folders` for a folder backup) or
  `Keeps: everything it writes`, `Missed runs: run when Datardo starts` when set, then the runs: started, how
  (`scheduled`, `Run now`, `missed, run late`), result, details (with `<n> old outputs deleted`), and the output.
  Without runs: *No runs yet.*
- [ ] The output of a run is a link that shows the file or folder in the system's file manager; an output that
  retention deleted is greyed, with the tooltip **Deleted by retention**.
- [ ] The items whose details are open stay open while another tab is active, and after the page is closed and opened
  again in the same session.
- [ ] With at least one enabled task and `datardo.task.keepRunningInTray` off, the page says *Tasks run while Datardo
  is open.* followed by the link **Keep running in the tray**, which opens that setting in the Settings page. With the
  setting on, or no task enabled, the note is not shown.
- [ ] A task of a Redis connection cannot exist: the page lists none and offers no way to create one.

### `task.edit` — Create or edit a task

The form of a task: what it saves, where, under which name, when, and how many outputs it keeps.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/task/edit.ts › plan(context, answers)`
- **Entry points**: **New task…** in the toolbar of the page (`@toolbar`) and in its empty state (`@empty-state`);
  **Edit** on a task (`@item-menu`), and a double click on it (`@list`); **Schedule…** in the context menu of a
  database, a collection or a view of the tree (`@tree-menu`) and in the menu of the connection island
  (`@connection-island`), which open the page with a new task of that source; Go to (**New scheduled task…**). In the
  form, **Create task** (or **Save**) and **Browse…** (`@form`).
- **Offered when**: always for **New task…**; **Schedule…** only on a MongoDB connection, read-only connections
  included.
- **Asks**, in a form titled **New scheduled task**, or **Edit <name>**, with **Create task** (or **Save**) and
  **Cancel**:
  - **Name**: `Back up <what>` for a new task, where `<what>` is `<database>.<collection>`, the database or the
    connection's name, or `Backup` when there is no source; switching the kind renames a name still at its default to
    `Export <what>` and back.
  - **Kind**: **Backup** (format **Archive (.agz)** by default; under it *In the mongodump formats, as Back up… writes
    them: restore with Restore from backup… or mongorestore.*) or **Export** (format **JSON Lines** by default; *The
    documents of a collection, as Export collection… writes them.*).
  - **Connection**, a list of the saved MongoDB connections; **Database** and **Collection**, with the names of the
    server suggested. Empty database (`empty: all databases`): all databases except `admin`, `local` and `config`;
    empty collection (`empty: all collections of the database`): all collections of the database except those whose
    name starts with `system.`. An export needs both.
  - **Format**: **Archive (.agz)**, **Folder, compressed (gzip)**, **Folder, uncompressed** for a backup; **JSON**,
    **JSON Lines**, **CSV** for an export, then **Filter** (`{ status: "active" }, empty: all documents`) and
    **Projection** (`{ name: 1, email: 1 }, empty: all fields`) in mongosh syntax; with CSV, *CSV has the columns of the
    collection's tab, as laid out there.*
  - **Folder**, typed or chosen with **Browse…**, which opens the system's folder dialog titled **Folder of the
    scheduled task** with the button **Choose folder**; by default the folder of the last backup made by hand
    (`backup.create`), else the home folder.
  - **File name**: `{name}_{date}_{time}` by default (`task.file-names`), with an example name under it (`e.g.
    shop_2026-11-17_02-00-00.agz`) and *Placeholders: {name} {connection} {database} {collection} {date} {time} {YYYY}
    {MM} {DD} {HH} {mm} {ss} {weekday}. A number is added if the name exists.*
  - **When**: **Every few hours** (every 1, 2, 3, 4, 6, 8 or 12 hours, at a time), **Daily** at a time, **Weekly** on
    chosen days at a time; under it the schedule and the next three runs (`Daily at 02:00. Next: today 02:00, tomorrow
    02:00, Fri 13 Nov 02:00`) and *Local time. Tasks run while Datardo is open.* A new task: **Daily** at `02:00`.
  - **Keep**: `the last <n> files` (`folders` for a folder backup), 7 for a new task, 0 keeps everything
    (`task.retention`); under it *Older ones written by this task are deleted after each successful run; nothing else
    in the folder is touched. 0 keeps them all.*
  - **Options**: **Run a missed run when Datardo starts** (`task.missed`), off for a new task; **Notify after
    successful runs too** (`task.notify`), off; **Enabled**, on.
  - A field that is wrong says so under it, once it lost the focus or the form's button was pressed, and the form is
    not saved: *Enter a name*; *Choose a connection*; *Enter the database of the collection*; *Enter the database*;
    *An export is of one collection: enter it*; *Choose JSON, JSON Lines or CSV*; *Choose a backup format*; *Filter must
    be an object, e.g. { status: "active" }* (or *Filter: <parse error>*), the same for **Projection**; *Choose the
    folder*; the errors of `task.file-names`; *Enter a time as HH:MM, e.g. 02:30*; *Choose at least one day*; *Every 1,
    2, 3, 4, 6, 8, 12 hours*; *Enter how many to keep (0: all)*.
- **Reads**: the databases of the connection (`listDatabases` with `nameOnly: true`) or the collections of the database
  (`listCollections` with `nameOnly: true`), once each, for the suggestions; a connection that cannot be reached gives
  no suggestions and the names are typed.
- **Plan**: `save the scheduled task "<name>"`, an app step. A new task, a task that was disabled and is now enabled,
  or a task whose schedule changed counts its runs from now, so it has no missed runs from before (`task.due`).
- **What is stored**: the fields of the form, the task's id, when its runs count from, and `engine`, the engine of its
  connection: `mongodb` for every task of the first release. The engine is not asked: it is that of the connection
  chosen, and it says which kinds, formats and sources the task can have. Tasks for Redis, when they are added, are
  stored with `engine: "redis"` beside these, with no migration of the tasks already stored.
- **Danger**: None. **Keep** above 0 lets later runs delete older outputs without asking (`task.retention`): the text
  under the field says so.
- **Read-only**: Allowed, because it writes nothing to a deployment, and neither does a run.
- **Undo**: Cannot be undone from the undo history, which holds writes to documents and keys; a task is edited again.
- **After**: the form closes and the page says *Saved "<name>" (<schedule>). Next run: <date and time>.*, or *Saved
  "<name>" (<schedule>). It is disabled.*
- **Refuses**: a connection that is no longer saved, *Choose a connection* (`/no-connection`); a task whose fields are
  still wrong when the plan is made, with the first of the messages above (`/invalid`); a file that cannot be written,
  *Could not save the task: <error>* (`/save-failed`). Each is shown in the page, and the form stays open.
- **Commands**: `task.edit`.
- **Uses**: `task.show`, `task.next-runs`, `task.file-names`, `task.retention`, `task.missed`, `task.notify`,
  `task.due`, `query.parse`, `backup.create`, `transfer.export`, `runner.ask`.
- **Ported from**: Mongoster's card task.edit (`src/scheduledTasks.ts`, `src/scheduler.ts › Scheduler.save`,
  `src/webview/scheduledTasks.ts`, `src/shared/schedule.ts › taskErrors`).

Acceptance:

- [ ] **Schedule…** on the database `shop` of the connection Local opens the page with the form: name `Back up shop`,
  kind **Backup**, **Archive (.agz)**, connection Local, database `shop`, no collection, **Daily** at `02:00`, keep 7,
  enabled.
- [ ] **Schedule…** on the collection `orders` of `shop` names the task `Back up shop.orders`; choosing **Export**
  renames it `Export shop.orders` and sets the format to **JSON Lines**; a name the user typed is not renamed.
- [ ] Choosing **Export** with no collection shows *An export is of one collection: enter it* and nothing is saved.
- [ ] The file name `backup` shows *Include the date or time, e.g. {date}_{time}, so the runs write different files*.
- [ ] A weekly schedule without days shows *Choose at least one day*; the next runs disappear until one is chosen.
- [ ] Saving shows the next run; a disabled task is saved with *It is disabled.*
- [ ] Changing only the name of a task keeps when its runs count from; changing its time restarts it from now.
- [ ] The list of **Connection** holds no Redis connection, and **Schedule…** is not in the context menu of a Redis
  database or namespace.
- [ ] A task can be created and saved on a read-only connection.
- [ ] A task saved on the connection Local is stored with `engine: "mongodb"`; editing it and saving again keeps the
  field.

### `task.next-runs` — When a task runs

The times a schedule gives, in local time, also on the days daylight saving starts and ends.

- **Kind**: Derivation
- **Engine**: Any
- **Function**: `src/features/task/next-runs.ts › nextRuns(schedule, after, count)`, with `nextRun(schedule, after)`,
  `previousRun(schedule, at)` and `describeSchedule(schedule)`.
- **Uses**: nothing; used by `task.show`, `task.edit`, `task.due`, `task.run`.
- **Ported from**: Mongoster's card task.next-runs (`src/shared/schedule.ts › nextRun`, `› previousRun`, `› nextRuns`,
  `› describeSchedule`).

Rules:

- A schedule is `{ kind: 'hours', every, time }`, `{ kind: 'daily', time }` or `{ kind: 'weekly', days, time }`;
  `time` is `HH:MM` (also `H:MM`), with hours below 24 and minutes below 60; `days` are 0 (Sunday) to 6 (Saturday);
  `every` is 1, 2, 3, 4, 6, 8 or 12.
- Every N hours runs at the hours `h mod N`, then every N hours up to 23, at the minutes of `time`: every 6 hours at
  02:30 is 02:30, 08:30, 14:30, 20:30.
- The times are local. On the day daylight saving starts, a time that does not exist runs when the clock gets there in
  the new time (02:30 runs at 03:30), and a time that then falls on another run is one run. On the day it ends, a
  time that happens twice runs once, the first time.
- `nextRun(schedule, after)`: the first run strictly after `after`, looking from the day before for 10 days;
  undefined when there is none (a weekly schedule without days, a time that does not parse). `previousRun(schedule,
  at)`: the last run at or before `at`, looking back 10 days. `nextRuns(schedule, after, count)`: the next `count`
  runs, each strictly after the one before.
- `describeSchedule`: `Every <n> hours (<times>)`, `Every hour at :<mm>`, `Daily at <HH:MM>`, `<days> at <HH:MM>` with
  the days from Monday (`Mon, Thu`), `Weekdays` for Monday to Friday, `Every day` for all seven; `No days chosen`;
  `Invalid time`.

Worked examples (Europe/Rome; daylight saving starts on 2026-03-29 and ends on 2026-10-25):

- Daily at 02:30 after 2026-11-11 01:00 → 2026-11-11 02:30; after 02:30 that day → 2026-11-12 02:30; after
  2026-12-31 23:00 → 2027-01-01 02:30.
- Every 6 hours at 08:15 after 2026-11-11 00:00 → 02:15, 08:15, 14:15, 20:15, then 2026-11-12 02:15.
- Weekly on Mon and Thu at 23:30, after Wednesday 2026-11-11 12:00 → 11-12, 11-16, 11-19, at 23:30.
- Daily at 02:30 from 2026-03-27 → 03-28 02:30, 03-29 03:30, 03-30 02:30; from 2026-10-24 → 10-25 02:30, 10-26 02:30
  (25 hours later).
- Every hour at :30 on 2026-03-29 after 00:45 → 01:30, 03:30, 04:30.
- `describeSchedule({ kind: 'hours', every: 6, time: '02:30' })` → `Every 6 hours (02:30, 08:30, 14:30, 20:30)`;
  `{ kind: 'weekly', days: [1, 2, 3, 4, 5], time: '07:00' }` → `Weekdays at 07:00`; `{ kind: 'weekly', days: [],
  time: '07:00' }` → `No days chosen`; `{ kind: 'daily', time: '25:00' }` → `Invalid time`.

Acceptance:

- [ ] Each worked example above gives its result with the system's time zone set to Europe/Rome.
- [ ] Across the start of daylight saving no day is skipped and none has two runs of a daily schedule.
- [ ] `nextRun` of a weekly schedule without days, and of a time that does not parse, is undefined.
- [ ] `previousRun` of a daily schedule at 02:30, asked at 2026-11-11 02:30:00 exactly, is 2026-11-11 02:30.

### `task.due` — Due and missed runs

Whether a task has a run to do now, and whether that run was missed because Datardo was not running.

- **Kind**: Derivation
- **Engine**: Any
- **Function**: `src/features/task/due.ts › dueRun(task, state, now)`, with `nextTaskRun(task, state)` and
  `addRun(state, run)`.
- **Uses**: `task.next-runs`; used by `task.run`, `task.missed`, `task.show` (the next run).
- **Ported from**: Mongoster's card task.due (`src/shared/schedule.ts › dueRun`, `› runsCountFrom`, `› nextTaskRun`,
  `› addRun`).

Rules:

- A disabled task has nothing due and no next run.
- Runs count from the later of `since` (when the task was created, enabled or rescheduled) and `lastSlot` (the last
  scheduled time handled: run, skipped or missed). The next run is `nextRun` after that.
- Nothing is due while that next run is in the future. Otherwise the slot is the latest scheduled time at or before
  now: of several runs due, only the latest counts.
- The slot is a run when it is at most 5 minutes old, otherwise it was missed.
- The run log keeps the 20 newest runs, newest first.

Worked examples (daily at 02:30):

- Last handled 2026-11-10 02:30: at 11-11 02:29 nothing; at 02:31 a run for 11-11 02:30. Once 11-11 02:30 is handled,
  nothing until 11-12 02:30.
- Last handled 2026-11-08 02:30, opened on 11-11 at 09:00: one missed run, 11-11 02:30; at 02:34 it would have been a
  run.
- Created on 2026-11-11 at 03:00: nothing due at 09:00 the same day.
- A log of 20 runs to which one is added → 20 runs, the new one first, the oldest gone.

Acceptance:

- [ ] Each worked example above gives its result.
- [ ] A slot exactly 5 minutes old is a run; one second older, it was missed.
- [ ] A task disabled at the time of a run and enabled an hour later has nothing due for that time.

### `task.file-names` — The names of what a run writes

The name of the file or folder each run writes, from the task's file name pattern, and which patterns are accepted.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/task/file-names.ts › outputName(task, date, connectionName)`, with
  `patternError(pattern)`.
- **Uses**: nothing; used by `task.edit` (the example name) and `task.run`, which adds a number when the name exists.
- **Ported from**: Mongoster's card task.file-names (`src/shared/schedule.ts › outputName`, `› expandPattern`,
  `› patternError`, `› patternValues`, `› outputExtension`, `› safeFileName`).

Rules:

- Placeholders: `{name}` (the collection, else the database, else the connection's name), `{connection}`,
  `{database}`, `{collection}` (empty when the task has none), `{date}` (`YYYY-MM-DD`), `{time}` (`HH-mm-ss`), `{YYYY}`,
  `{MM}`, `{DD}`, `{HH}`, `{mm}`, `{ss}`, `{weekday}` (`Sun` to `Sat`), in local time at the start of the run.
- After expanding, every run of `\ / : * ? " < > |` and white space becomes `_`, leading and trailing `.` and `_` are
  removed, and an empty name becomes `output`.
- The extension is added: `.agz` for an archive, none for a folder backup, `.json`, `.jsonl` or `.csv` for an export.
- Refused patterns: empty (*Enter a file name*); with `/` or `\` (*The file name cannot contain / or \: choose the
  folder instead*); with another placeholder (*Unknown placeholder {day}: use {name} {connection} {database}
  {collection} {date} {time} {YYYY} {MM} {DD} {HH} {mm} {ss} {weekday}*); without one of `{date}`, `{time}`,
  `{YYYY}`, `{MM}`, `{DD}`, `{HH}`, `{mm}`, `{ss}`, `{weekday}` (*Include the date or time, e.g. {date}_{time}, so the
  runs write different files*).

Worked examples (2026-10-08 16:45:12, a Thursday):

- `{name}_{date}_{time}`, database `shop` → `shop_2026-10-08_16-45-12.agz`; as a compressed folder →
  `shop_2026-10-08_16-45-12`; an export of `orders` to CSV → `orders_2026-10-08_16-45-12.csv`; a connection `My
  Server` without a database → `My_Server_2026-10-08_16-45-12.agz`.
- `{connection}-{database}.{collection}-{YYYY}{MM}{DD}-{HH}{mm}{ss}-{weekday}`, connection `Prod DB` →
  `Prod_DB-shop.orders-20261008-164512-Thu`.
- `{collection}{date}` on a task without a collection, as an archive → `2026-10-08.agz`.
- `{day}` → *Unknown placeholder {day}: use …*; `backup` → *Include the date or time, …*; `daily/{date}` → *The file
  name cannot contain / or \: choose the folder instead*.

Acceptance:

- [ ] Each worked example above gives its result.
- [ ] A pattern with only `{weekday}` is accepted: seven names, one per day of the week.
- [ ] The names never hold a character Windows refuses in a file name, whatever the names of the connection, the
  database and the collection.

### `task.run` — Run a task

Runs a task at its time, or now with **Run now**, without asking anything: a backup or an export written as a new file
or folder in the task's folder.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/task/run.ts › plan(context, answers)`
- **Entry points**: the schedule, checked by the scheduler of the main process 3 seconds after Datardo starts and then
  every 15 seconds, which sends this feature's intent for each task that is due (no place); **Run now** on a task
  (`@list`), with the tooltip *Run it once now (the schedule stays as it is)*.
- **Offered when**: **Run now** on every task that is not running, disabled ones included.
- **Asks**: nothing.
- **Reads**: the task and its state again, just before running; `task.due`, for a scheduled run, which runs only if it
  is still due. The deployment: for a backup what `backup.create` reads, of the connection (all databases except
  `admin`, `local`, `config`), a database (all collections except those whose name starts with `system.`) or a
  collection; for an export `db.<collection>.find(<filter>, <projection>)` in batches of 1,000, with 64-bit integers
  kept as `Long`.
- **Plan**:
  1. `write <folder>\<name>`, a file step: a new file or folder in the task's folder, named by `task.file-names`, with
     `_2`, `_3`… added before the extension when the name exists. It holds the backup of `backup.create` or the export
     of `transfer.export` (CSV with the columns of the collection tab, `table.columns`).
  2. `delete <path>`, a file step for each older output beyond **Keep** (`task.retention`).
  The state of the task is saved as the plan runs: the run in progress, then the run in the log and the output in the
  list of outputs, before retention.
- **Danger**: None: a run asks nothing, at its time or with **Run now**, because nobody may be there to answer. The
  older outputs that step 2 deletes are lost without a confirmation at that moment; the form of the task says so when
  the task is saved (`task.edit`). This is where the area does not keep the promise that a dangerous write is shown
  before it runs.
- **Read-only**: Allowed, because a run writes nothing to a deployment.
- **Undo**: Cannot be undone, and needs none for the deployment; the files are kept or deleted by `task.retention`.
- **After**: the page follows the progress once a second (`<database>.<collection>: <n> documents` for a backup, `<n>
  documents` for an export); the run is logged as `done` with its size, documents and collections; `task.notify`. The
  Log records the steps under `[task.run]`.
- **Refuses**: **Run now** while the task runs, *"<name>" is already running.* (`/running`), said in the page. Each of
  these is logged and notified as a failed run: a folder that does not exist is not created, *The folder <folder>
  doesn't exist (is the drive connected?)* (`/no-folder`); *Nothing to back up: time series collections aren't supported
  (use mongodump).* and *Nothing to back up: there are no collections.* (`/nothing`); *The collection
  <database>.<collection> doesn't exist.* (`/no-collection`); an export without database or collection, *An export needs
  a database and a collection.* (`/invalid`); any error of the server or of the disk. Logged and notified as a skipped
  run: *The connection was removed* (`/no-connection`), *Connection unavailable: <error>* (`/not-connected`).
- **Settings**: `datardo.task.keepRunningInTray` (Datardo keeps running with its window closed, `task.tray`).
- **Uses**: `backup.create`, `transfer.export`, `table.columns`, `task.file-names`, `task.due`, `task.next-runs`,
  `task.retention`, `task.missed`, `task.cancel`, `task.notify`, `connection.connect`, `runner.run`, `runner.log`.
- **Ported from**: Mongoster's card task.run (`src/scheduler.ts › Scheduler.execute`, `› perform`, `› tick`, `›
  runNow`; `src/taskRunner.ts › runTask`). Its file lock (`src/fileLock.ts`) is not ported.

Acceptance:

- [ ] A daily backup of `shop` at 02:00 with the default pattern writes `shop_2026-11-01_02-00-00.agz` on 1 November;
  a second run with the same name writes `shop_2026-11-01_02-00-00_2.agz` and replaces nothing.
- [ ] An export with the filter `{ status: "open" }` and the projection `{ total: 1 }` writes only those documents and
  fields.
- [ ] A time series collection is left out of a backup, and the run's details say *Time series collections left out
  (use mongodump): <database>.<collection>*.
- [ ] With the folder on a drive that is not connected, the run fails with *The folder <folder> doesn't exist (is the
  drive connected?)* and creates nothing.
- [ ] An export whose filter the server refuses fails and leaves no file.
- [ ] **Run now** runs a task once, also a disabled one, logs it as `Run now`, and does not change the next run.
- [ ] **Run now** while the task runs says *"<name>" is already running.* and starts nothing.
- [ ] A run due while the previous one is still going is skipped, and the running one's details say *The run due at
  <time> was skipped: this one was still going*.
- [ ] A run interrupted because Datardo was closed is logged as failed with *Interrupted: Datardo was closed during
  the run* at the task's next run.
- [ ] A task of a removed connection is logged as skipped with *The connection was removed*; a connection that cannot
  be reached, with *Connection unavailable: <error>*.
- [ ] A task of a read-only connection runs and writes its output.
- [ ] A task due at 02:00 runs once, with the window open, minimized or hidden in the tray, at most 18 seconds after
  02:00.

### `task.cancel` — Cancel a run

Stops the run of a task and deletes what it wrote so far.

- **Kind**: Operation
- **Engine**: Any
- **Function**: `src/features/task/cancel.ts › plan(context, answers)`
- **Entry points**: **Cancel** on a running task, in the place of **Run now** (`@list`), with the tooltip *Stop the
  run: what it wrote so far is deleted*.
- **Offered when**: the task is running.
- **Asks**: nothing.
- **Plan**: `cancel the run of "<name>"`, an app step; the run then deletes its incomplete output: `delete <path>`.
- **Danger**: None: what is deleted is a file the run had not finished.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone; the task is run again with **Run now**.
- **After**: the run is logged as `cancelled` with *Cancelled: the incomplete output was deleted*; no notification
  (`task.notify`); retention does not run, and the outputs of earlier runs stay.
- **Uses**: `task.run`, `task.show`.
- **Ported from**: Mongoster's card task.run, its **Cancel** (`src/scheduler.ts › Scheduler.cancel`). The cancel file
  that told another window to stop is not ported.

Acceptance:

- [ ] **Cancel** on a backup that has written 2 of 5 collections stops it within 2 seconds, and its archive or folder
  is no longer in the task's folder.
- [ ] The run is logged as `cancelled` with *Cancelled: the incomplete output was deleted*, and no notification is
  shown.
- [ ] The next run of the task is unchanged, and **Run now** is offered again.
- [ ] A run that ended in the moment **Cancel** was pressed is logged as `done`, and its output stays.

### `task.retention` — Keep the last N outputs

After each successful run, deletes the older files or folders that this task wrote beyond the number kept, and never
anything else.

- **Kind**: Operation
- **Engine**: Any
- **Function**: `src/features/task/retention.ts › plan(context, answers)`, choosing with `outputsToDelete(outputs,
  keep)`.
- **Entry points**: none of its own: the end of every successful run (`task.run`); the number is the form's **Keep**
  (`task.edit`).
- **Reads**: the list of outputs of the task in its state, and what is at each output's path on disk.
- **Plan**: `delete <path>` for each output chosen: a file, or a folder with everything in it, permanently, not to the
  system's recycle bin. The list of outputs is then saved without them.
- **Danger**: None when it runs: there is no confirmation, because it runs by itself. The deleted backups and exports
  are lost; the form says *Older ones written by this task are deleted after each successful run; nothing else in the
  folder is touched. 0 keeps them all.*
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone: the files are deleted, not moved to the recycle bin.
- **After**: the run's details say `<n> old outputs deleted`; the run log shows their names greyed (**Deleted by
  retention**).
- **Uses**: `task.run`, `task.edit`, `task.delete`.
- **Ported from**: Mongoster's card task.retention (`src/taskRunner.ts › applyRetention`, `src/shared/schedule.ts ›
  outputsToDelete`).

Rules, which files it may delete:

- Only the outputs in the task's list: each is the exact path of a file or folder that a successful run of this task
  (scheduled, missed or **Run now**) created, recorded with the run's time, its size and whether it is a folder. The
  new output is recorded before retention runs, so it is never deleted.
- An output is recognized by its recorded path and kind only: names, patterns and the content of the folder are never
  looked at. A path that no longer exists is dropped from the list; a path that is now a folder where a file was
  recorded, or a file where a folder was, is left alone and dropped from the list. A file put at exactly the path of a
  recorded output, of the same kind, would be deleted as that output.
- With **Keep** = N > 0, the outputs are ordered by the time of their run (of two at the same time, the one recorded
  later is newer) and all but the N newest are deleted. With 0 nothing is deleted. A change of **Keep** applies at the
  next successful run.
- A path that cannot be deleted stays in the list and is tried again after the next run; the run's details say *Could
  not delete <path>: <error>*.
- Never deleted: anything else in the folder, also with names that match the pattern; outputs of a failed or cancelled
  run (removed at once by the run itself, and never recorded); anything after a failed, skipped, cancelled or missed
  run; outputs of a deleted task (its list is deleted with it, `task.delete`). Outputs recorded in a folder the task
  no longer uses are still the task's, and are deleted there.

Worked examples:

- Outputs of runs at 1, 2, 3, 4, 5 (any order), keep 3 → the outputs of 1 and 2 are deleted.
- Keep 4 → the oldest; keep 5 or 0 → none.
- Keep 2, three daily runs into a folder that also holds `shop_2020-01-01_02-00-00.agz` written by someone else → the
  first run's archive is deleted, the 2020 file stays.
- Keep 1, a folder backup run twice with the same name → `shop-20261101` is deleted with everything in it,
  `shop-20261101_2` stays.

Acceptance:

- [ ] Each worked example above gives its result.
- [ ] With keep 2, after the third successful run the task's folder holds the two newest outputs of the task and every
  file the task did not write.
- [ ] A recorded archive that was replaced by a folder of the same name is not deleted and is no longer in the list.
- [ ] An output that cannot be deleted because another program holds it is reported in the run's details and deleted
  after a later run, once it is free.
- [ ] After a failed, a cancelled and a skipped run nothing is deleted.

### `task.missed` — Runs missed while Datardo was closed

A run whose time came while Datardo was closed, or the computer was asleep: recorded as missed, or run once late.

- **Kind**: Operation
- **Engine**: Any
- **Function**: `src/features/task/missed.ts › plan(context, answers)`
- **Entry points**: the scheduler's check, 3 seconds after Datardo starts and every 15 seconds; the form's option **Run
  a missed run when Datardo starts**, with the tooltip *If Datardo was closed (or the computer asleep) at the time of
  a run, it runs once when it is open again*.
- **Reads**: `task.due` on the task and its state, read again just before recording.
- **Plan**: `record the missed run of "<name>"`, an app step that saves the scheduled time as handled and a run with
  the result `missed`; or, with the option on, the plan of `task.run`, logged as `missed, run late`.
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone, and needs none: it records a run in the log.
- **After**: nothing is notified for a run recorded as missed (`task.notify`).
- **Uses**: `task.due`, `task.run`.
- **Ported from**: Mongoster's card task.missed (`src/scheduler.ts › Scheduler.tick`, `› recordMissed`).

Acceptance:

- [ ] A daily task at 02:30, with Datardo closed from Sunday to Wednesday 09:00, logs one run `missed` for Wednesday
  02:30 with *Datardo wasn't running (or the computer was asleep) at that time*, and shows no notification.
- [ ] With **Run a missed run when Datardo starts**, it runs once instead, logged as `missed, run late`.
- [ ] A run found less than 5 minutes late runs as a scheduled run.
- [ ] A task created, enabled or rescheduled after the time of a run has no missed run for it.
- [ ] A computer that slept from 01:00 to 08:00 with Datardo open records the 02:30 run as missed within 15 seconds of
  waking.

### `task.enable` — Enable or disable a task

The switch of a task, or **Enabled** in the form, stops or starts a task's runs without deleting it.

- **Kind**: Operation
- **Engine**: Any
- **Function**: `src/features/task/enable.ts › plan(context, answers)`
- **Entry points**: the switch of a task in the list (`@list`), with the tooltip *Enabled: click to disable* or
  *Disabled: click to enable*; **Enabled** in the form (`task.edit`).
- **Asks**: nothing.
- **Plan**: `enable the scheduled task "<name>"` or `disable the scheduled task "<name>"`, an app step. Enabling counts
  the runs from now: those whose time came while the task was disabled are neither run nor recorded as missed.
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone from the undo history; the switch is clicked again.
- **After**: the page shows the task greyed, or with its next run; the summary of the toolbar and the note about the
  tray follow.
- **Uses**: `task.due`, `task.tray` (whether a task is enabled), `task.show`.
- **Ported from**: Mongoster's card task.enable (`src/scheduler.ts › Scheduler.setEnabled`).

Acceptance:

- [ ] A disabled task is greyed, its next run is `—`, and it does not run at its time.
- [ ] Enabling it again on Thursday after a week disabled logs no missed runs.
- [ ] **Run now** still runs a disabled task.
- [ ] Disabling a task while it runs lets the run finish.
- [ ] Disabling the only enabled task with `datardo.task.keepRunningInTray` on: closing the window then quits Datardo
  (`task.tray`).

### `task.delete` — Delete a task

Deletes the task and its run log, and leaves the files it wrote.

- **Kind**: Operation
- **Engine**: Any
- **Function**: `src/features/task/delete.ts › plan(context, answers)`
- **Entry points**: **Delete** on a task (`@item-menu`), with the tooltip *Delete the task (the files it wrote stay)*;
  `Delete` on the selected item of the list (`@list`).
- **Asks**: nothing more than the confirmation.
- **Plan**: `cancel the run of "<name>"`, only when the task is running (`task.cancel`); `delete the scheduled task
  "<name>" and its run log`, an app step that removes the task and its state.
- **Danger**: Confirm: **Delete the scheduled task "<name>"?** with *Its run log is deleted too. The backups and
  exports it wrote stay where they are.*; button **Delete**. The run log and the list of outputs are lost: retention
  no longer deletes the outputs the task wrote.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone; the confirmation says the run log is deleted.
- **After**: the task is gone from the page.
- **Uses**: `task.cancel`, `task.retention`, `runner.confirm`.
- **Ported from**: Mongoster's card task.delete (`src/scheduler.ts › Scheduler.remove`, `src/scheduledTasks.ts`).

Acceptance:

- [ ] After **Delete**, the task is gone from the page, and every file and folder it wrote is still there.
- [ ] **Cancel** in the confirmation, or `Escape`, deletes nothing.
- [ ] Deleting a task while it runs stops the run and deletes its incomplete output; the outputs of its earlier runs
  stay.
- [ ] After the task is deleted, a new task with the same name, folder and pattern never deletes the files the old one
  wrote.

### `task.notify` — Notifications of runs

Failed and skipped runs are told at once; successful ones only when the task asks for it.

- **Kind**: View
- **Engine**: Any
- **Function**: `src/features/task/notify.ts › view(state)`
- **Entry points**: none of its own: the end of every run (`task.run`); the form's option **Notify after successful
  runs too**, with the tooltip *Failed and skipped runs always notify* (`task.edit`).
- **Uses**: `runner.notify`, `task.show` (**Show scheduled tasks**), `window.tray`.
- **Ported from**: Mongoster's card task.notify (`src/scheduler.ts › Scheduler.report`, `src/standalone/main.ts ›
  notifyFromTray`).

Acceptance:

- [ ] A failed run shows the error notification *Scheduled task "<name>" failed: <error>* with **Show scheduled
  tasks** (`@notification`), which opens the page.
- [ ] A skipped run shows the warning *Scheduled task "<name>" was skipped: <error>* with **Show scheduled tasks**.
- [ ] A successful run shows nothing, unless **Notify after successful runs too** is on: *Scheduled task "<name>" done
  (<n> collections, <n> documents, <size>) in <s> s: <file name>* with **Reveal**, which shows the output in the
  system's file manager, and **Show scheduled tasks**. An export leaves out the collections: *done (<n> documents,
  <size>)*.
- [ ] Cancelled and missed runs show no notification.
- [ ] With the window hidden in the tray, a failed or skipped run shows a notification of the system, *Scheduled task
  "<name>" failed: <error>* (or *was skipped: <error>*); clicking it shows the window (`window.tray`).
- [ ] The seconds of a successful run have one decimal: `12.4 s`.

### `task.tray` — Keep Datardo running in the tray for the tasks

Says when closing the window leaves Datardo running in the tray, so that the tasks keep running. The tray icon, its
menu and showing the window again are `window.tray`.

- **Kind**: Derivation
- **Engine**: Any
- **Function**: `src/features/task/tray.ts › keepsRunning(settings, tasks)`
- **Settings**: `datardo.task.keepRunningInTray` (default off).
- **Uses**: nothing; used by `window.tray`, `window.quit`, `task.show` (the note about the tray).
- **Ported from**: Mongoster's card task.tray (`src/standalone/main.ts › keepInTray`, `src/scheduler.ts ›
  Scheduler.hasEnabledTasks`, `src/scheduledTasks.ts`).

Rules:

- Inputs: the setting `datardo.task.keepRunningInTray`, and the tasks.
- Result: true when the setting is on and at least one task is enabled, whatever its schedule; false otherwise.
- When it is true, closing the window hides it and Datardo goes on running in the tray; when it is false, closing the
  window quits Datardo. Quitting on purpose always quits (`window.quit`).
- The result is worked out again when the window is closed, so a change of the setting or of a task needs no restart.

Worked examples:

- Setting on, tasks: one enabled, one disabled → true.
- Setting on, tasks: two disabled → false.
- Setting on, no tasks → false.
- Setting off, three enabled tasks → false.

Acceptance:

- [ ] With the setting on and at least one task enabled, closing the window hides it and shows the tray icon with the
  tooltip **Datardo: scheduled tasks keep running**; a task due afterwards runs at its time.
- [ ] Opening the window again from the tray shows the page with the runs made meanwhile.
- [ ] With the setting off, or no task enabled, closing the window quits Datardo.
- [ ] **Quit** (from the tray, the system's menu on macOS, or the keyboard) quits Datardo even with the setting on.
- [ ] A run in progress when the window is closed to the tray goes on and is logged as `done`.
