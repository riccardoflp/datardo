# Settings

The settings of Datardo and the page that changes them. A setting is a named value that changes what a feature does,
for the whole application. What belongs to one connection (read-only, its color, whether its undo history is kept, its
queries folder, its linked Redis connection) is part of the connection and is changed in the connection form, not
here.

Every setting is named `datardo.<group>.<name>`, where the group is the area that reads it, and is declared once, in
`resources/settings.schema.json`, with its type, its default, its bounds and its description. The values the user
changed are kept in `settings.json` in the data folder ([stored data](../data.md#the-data-folder)); a setting left at
its default is not written. There is one scope: the application. Datardo has no workspace and no settings per folder.

### `settings.read` — The value of a setting

Every feature that depends on a setting reads it through one function, which always answers with a valid value.

- **Kind**: Derivation
- **Engine**: Any
- **Function**: `src/features/settings/read.ts › settingValue(schema, stored, name)`
- **Inputs**: the schema of the settings; the stored values; the full name of a setting.
- **Output**: the value to use, of the type the schema declares.
- **Rules**:
  - A setting that is not stored has its default.
  - A stored value of the wrong type (text where a number is declared) is ignored: the default is used.
  - A stored number outside the setting's bounds is brought to the nearest bound.
  - A stored value that is not one of a setting's choices is ignored: the default is used.
  - A stored name the schema does not declare is kept in the file, ignored, and never shown in the Settings page: a
    newer or an older version of Datardo may know it.
  - A name that is not declared cannot be read: the function has no answer for it, and the check of R11 fails the
    build when the sources read a name the schema lacks.
- **Uses**: `settings.validate`.
- **Ported from**: *New in Datardo*; Mongoster reads its settings through VS Code's configuration, which applies the
  defaults of its `package.json`.

Acceptance:

- [ ] With nothing stored, `datardo.undo.maxDays` is 7 and `datardo.mcp.port` is 37018.
- [ ] With `"datardo.undo.maxDays": "ten"` stored, the value is 7.
- [ ] With `"datardo.window.zoom": 500` stored, the value is 200; with 10, it is 50.
- [ ] With `"datardo.window.theme": "blue"` stored, the value is `system`.
- [ ] A stored `"datardo.future.thing": true` is still in `settings.json` after another setting is changed.
- [ ] Every setting of the table of this page is declared in `resources/settings.schema.json` with the same default,
      and the schema declares no other.

### `settings.validate` — Whether a value can be given to a setting

Says, while the user types, whether a value is accepted, and why not.

- **Kind**: Derivation
- **Engine**: Any
- **Function**: `src/features/settings/validate.ts › settingProblem(schema, name, value)`
- **Inputs**: the schema; the name of a setting; the value typed, as text.
- **Output**: nothing when the value is accepted, or the message to show under the field.
- **Rules**:
  - A number must be a whole number within the bounds: *Enter a whole number from 50 to 200.*, with the setting's
    own bounds.
  - A number with no upper bound says *Enter a whole number, 0 or more.* (or *1 or more*).
  - Text that must not be empty: *This can't be empty.*
  - `datardo.mcp.port`: *Enter a port from 1024 to 65535.*
  - `datardo.key.separator`: at most 8 characters *(Datardo's choice)*, not empty, and no `*`, `?`, `[`, `]` or `\`,
    which have a meaning in a pattern: *The separator can't contain \*, ?, [, ] or \\.*
- **Uses**: `settings.read`.
- **Ported from**: *New in Datardo*.

Acceptance:

- [ ] `settingProblem(schema, 'datardo.window.zoom', '250')` is *Enter a whole number from 50 to 200.*
- [ ] `settingProblem(schema, 'datardo.undo.maxDays', '1.5')` is *Enter a whole number, 0 or more.*
- [ ] `settingProblem(schema, 'datardo.mcp.port', '80')` is *Enter a port from 1024 to 65535.*
- [ ] `settingProblem(schema, 'datardo.key.separator', '')` is *This can't be empty.*; with `*` it is *The separator
      can't contain \*, ?, [, ] or \\.*; with `::` it is nothing.
- [ ] A value that is accepted is never changed by `settings.read`.

### `settings.page` — The Settings page

One page lists every setting by group, with what it does, its value and its default, and changes take effect at once.

- **Kind**: View
- **Engine**: Any
- **Function**: `src/features/settings/page.ts › view(state)`
- **Entry points**: **Settings** at the bottom of the rail (`@rail`); `Ctrl+,`; Go to (**Settings**); **Settings…** in
  the menu bar on macOS (`@app-menu`); **Settings** on pages that depend on a group of settings, which opens the page
  at that group (the Undo history page, the Scheduled tasks page, the dialog that sets up the MCP server).
- **Shows**, from the top:
  - a filter field, *Filter settings*, which keeps the settings whose title, description or name contains every word
    typed, without regard to case;
  - the groups, each with a heading, in this order: **Window**, **Tabs**, **Notifications**, **Queries**,
    **Relationships**, **Undo history**, **Scheduled tasks**, **MCP server**, **Redis keys**, **Redis console**; a
    list of the groups at the left jumps to each (`@list`);
  - for each setting (`@form`): its title in sentence case, its description, its control, its name in small text,
    and, when the value is not the default, a dot before the title and **Reset** beside the control;
  - at the bottom, **About Datardo** (`window.about`) and **Open data folder** (`window.open-data-folder`).
- **Controls**: a switch for on and off; a number field for a number; a menu for a choice; a text field for text.
- **States**: a filter that matches nothing shows *No setting matches "\<text\>".* with **Clear filter**
  (`@empty-state`). When `settings.json` was written by a newer version of Datardo, a line at the top says *These
  settings were written by a newer version of Datardo. Changes are not saved until Datardo is updated.* and the
  controls are disabled.
- **Commands**: `settings.page`.
- **Uses**: `settings.read`, `settings.validate`, `settings.change`, `settings.reset`, `window.about`,
  `window.open-data-folder`, `tab.open`.
- **Ported from**: *New in Datardo*; it takes the place of VS Code's Settings editor, and of the `settings.json` the
  user edited by hand in Mongoster's desktop app.

Acceptance:

- [ ] `Ctrl+,` opens the Settings page as a page tab; with one already open, it becomes the active tab.
- [ ] Every setting of the table of this page is listed, under its group, with the default the table gives.
- [ ] Typing `undo days` in the filter leaves **Days to keep** of **Undo history** and hides every group with no
      setting left.
- [ ] A setting whose value differs from its default has the dot and **Reset**; one at its default has neither.
- [ ] **Settings** on the Undo history page opens the Settings page scrolled to **Undo history**, with the focus on
      its first control.
- [ ] Every control has a label a screen reader reads, made of the setting's title and description.
- [ ] The name under a setting (`datardo.undo.maxDays`) can be selected and copied.

### `settings.change` — Change a setting

A change in the Settings page is saved and takes effect at once, without a **Save** button.

- **Kind**: Operation
- **Engine**: Any
- **Function**: `src/features/settings/change.ts › plan(context, answers)`
- **Entry points**: every control of the Settings page (`@form`); the features that have a control of their own for
  one setting start it too (the theme in the menu bar on macOS, the zoom keys, **Change MCP server port…**).
- **Offered when**: `settings.json` can be written (it is not of a newer version).
- **Plan**: one app step, `set datardo.undo.maxDays to 14`.
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone from the undo history: nothing is written to a deployment. **Reset** puts the default
  back.
- **After**: the features that read the setting act on the new value at once, as their cards say: the theme changes,
  the MCP server starts, stops or moves to the new port, the limits of the undo history are applied. A switch and a
  menu save at the change; a number or text field saves when the field loses the focus or at `Enter`, and only when
  `settings.validate` accepts it.
- **Refuses**: a value `settings.validate` does not accept: its message is shown under the field, and nothing is
  saved (`/invalid`). A settings file of a newer version (`/newer-version`).
- **Uses**: `settings.validate`, `settings.read`, `runner.run`.
- **Ported from**: *New in Datardo*.

Acceptance:

- [ ] Turning **Keep the undo history** off writes `"datardo.undo.enabled": false` in `settings.json`, and the next
      write to a document is confirmed as one that cannot be undone.
- [ ] Typing `0` in **Zoom** and leaving the field shows *Enter a whole number from 50 to 200.* and writes nothing;
      `Esc` puts the saved value back in the field.
- [ ] Setting a value back to its default by hand removes the setting from `settings.json`.
- [ ] The Log has `[settings.change] set datardo.undo.maxDays to 14`.
- [ ] A change is on disk within 1 second, and survives quitting right after it.

### `settings.reset` — Reset a setting, or all of them

Puts a setting back to its default.

- **Kind**: Operation
- **Engine**: Any
- **Function**: `src/features/settings/reset.ts › plan(context, answers)`
- **Entry points**: **Reset** beside a setting that is not at its default (`@form`); **Reset all settings…** in the
  toolbar of the Settings page (`@toolbar`); Go to (**Reset all settings…**).
- **Offered when**: at least one setting is not at its default, for **Reset all settings…**.
- **Plan**: one app step for each setting, `reset datardo.undo.maxDays to 7`.
- **Danger**: None for one setting. Confirm for all: **Reset all settings to their defaults?**, with the list of the
  settings that change and their values now, and the button **Reset all**.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone: nothing is written to a deployment; the confirmation of **Reset all settings…** lists
  the values that are lost.
- **After**: as after `settings.change`. Connections and their options are not touched.
- **Refuses**: a settings file of a newer version (`/newer-version`).
- **Commands**: `settings.reset`.
- **Uses**: `settings.change`, `runner.confirm`.
- **Ported from**: *New in Datardo*.

Acceptance:

- [ ] **Reset** beside **Days to keep** set to 14 puts 7 back, removes the setting from `settings.json`, and the dot
      and **Reset** go away.
- [ ] **Reset all settings…** with three settings changed lists the three with their values; **Reset all** leaves
      `settings.json` with its version and no setting.
- [ ] With every setting at its default, **Reset all settings…** is disabled and Go to does not list it.
- [ ] Resetting all settings removes no connection, pin, saved query or operation of the undo history.

## The settings

| Setting | Default | Values | What it does | Read by | In Mongoster |
| --- | --- | --- | --- | --- | --- |
| `datardo.window.theme` | `system` | `system`, `dark`, `light` | The theme of the window. | `window.theme` | **New** (VS Code's theme) |
| `datardo.window.zoom` | 100 | 50 to 200 | The size of everything in the window, in percent. | `window.zoom` | **New** |
| `datardo.window.checkForUpdates` | on | on, off | Whether Datardo asks GitHub, at start and once a day, if a newer version exists. Nothing is downloaded. | `window.check-update` | **New** |
| `datardo.tab.restore` | on | on, off | Whether the tabs open at quit come back at the next start. | `tab.restore` | **New** |
| `datardo.runner.systemNotifications` | on | on, off | Whether long work that ends while the window is not in front shows a notification of the system. | `runner.notify` | **New** |
| `datardo.query.timeLimitSeconds` | 60 | 1 to 3,600 | How long the server may work on one query before it is stopped. | `query.run` | **New**: fixed at 60 |
| `datardo.query.position` | `top` | `top`, `right` | Where a collection tab puts its query: above the table, or in the query pane at its right. One place for every collection tab. | `query.position` | `mongoster.queryBar.position` (0.9.0) |
| `datardo.relation.detect` | on | on, off | Whether references between collections are found when a database is opened. | `relation.detect` | `mongoster.references.detect` |
| `datardo.undo.enabled` | on | on, off | Whether writes to documents and keys are kept in the undo history. | `undo.record` | `mongoster.history.enabled` |
| `datardo.undo.maxSizeMb` | 100 | 0 or more | The most disk space the undo history takes, in MB. | `undo.limits` | `mongoster.history.maxSizeMB` |
| `datardo.undo.maxDays` | 7 | 0 or more | How many days an operation is kept. | `undo.limits` | `mongoster.history.maxDays` |
| `datardo.undo.maxOperations` | 200 | 0 or more | How many operations are kept. | `undo.limits` | `mongoster.history.maxOperations` |
| `datardo.undo.maxDocumentsPerOperation` | 10,000 | 1 or more | The most documents or keys one operation keeps; a larger write is not recorded. | `undo.record` | `mongoster.history.maxDocumentsPerOperation` |
| `datardo.undo.maxOperationSizeMb` | 20 | 1 or more | The most data one operation keeps, in MB; a larger write is not recorded. | `undo.record` | `mongoster.history.maxOperationSizeMB` |
| `datardo.task.keepRunningInTray` | off | on, off | Whether closing the window keeps Datardo in the tray while a scheduled task is enabled. | `task.tray` | `mongoster.scheduledTasks.keepRunningInTray` |
| `datardo.mcp.enabled` | off | on, off | Whether the MCP server runs. | `mcp.server` | `mongoster.mcp.enabled` |
| `datardo.mcp.port` | 37018 | 1024 to 65535 | The port of the MCP server on 127.0.0.1. | `mcp.server` | `mongoster.mcp.port` (37017) |
| `datardo.mcp.readData` | on | on, off | Whether the tools of the MCP server may return documents and the values of keys. Off, the tools that return them and `explain_query` are not offered, `count_documents` gives only totals, and what could quote a value (commands, validators, view pipelines, partial filters, saved queries, a server's error) is reduced to its shape or its code. | `mcp.read-data` | `mongoster.mcp.readDocuments` |
| `datardo.key.separator` | `:` | text | The text key names are split at to make namespaces. | `tree.namespaces`, `key.pattern` | **New** |
| `datardo.console.historySize` | 500 | 0 to 5,000 | How many commands of the console are remembered for each connection. | `console.history` | **New** |

Their titles in the Settings page, by group: **Window**: Theme, Zoom, Check for a newer version. **Tabs**: Restore
tabs at start. **Notifications**: Notify when long work ends. **Queries**: Time limit of a query, in seconds, Place of
the query. **Relationships**: Find references between collections. **Undo history**: Keep the undo history, Disk
space, in MB, Days to keep, Operations to keep, Documents or keys in one operation, Data in one operation, in MB.
**Scheduled tasks**: Keep running in the tray. **MCP server**: Run the MCP server, Port, Let assistants read data.
**Redis keys**: Separator of namespaces. **Redis console**: Commands remembered.

### Settings of Mongoster that have no place

- `mongoster.savedQueries.folder`, a path inside the project open in VS Code: Datardo has no project. Each connection
  has its own queries folder instead, chosen in the connection form or with `saved-query.choose-folder`
  ([D29](../decisions.md#d29--saved-queries-for-me-or-in-the-queries-folder-of-a-connection)).

## Numbers that are Datardo's own

Limits, sizes and times that Mongoster never had, chosen without measuring and marked *(Datardo's choice)* on their
cards ([D30](../decisions.md#d30--numbers-that-are-datardos-own)). Each is a named constant in its feature's module,
not a setting; the performance suite tunes them before the first release (RS5 of [risks](../risks.md), Q11). The card
holds the exact rule; this table is for reviewing them at once. Every other number in the catalog is Mongoster's.

| Card | Number |
| --- | --- |
| `runner.ask` | a list gets a filter field from 8 items |
| `runner.confirm` | the first 20 steps are shown |
| `runner.progress` | work shows as in progress after 400 ms; a step's text is cut at 200 characters |
| `runner.notify` | 6 seconds for a notification that goes away; 3 shown at once; the same message within 30 seconds is counted, not repeated; a notification of the system for work over 30 seconds |
| `runner.log` | 5,000 lines kept |
| `settings.validate` | a separator of at most 8 characters |
| `window.frame` | top bar 40 px; 78 px left free for the system's buttons on macOS; buttons of 46 × 40 px on Linux |
| `window.top-bar` | Go to field 480 px wide, a button below 200 px |
| `window.remember` | saved 500 ms after the last move or resize |
| `window.placement` | 100 px of the window must be on a display |
| `window.zoom` | steps 50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200% |
| `window.quit` | 5 seconds waited for cancelled work |
| `window.about` | **Copied** shown for 2 seconds |
| `window.check-update` | 10 seconds after the window shows, then every 24 hours; a time limit of 10 seconds; a reply of at most 1 MB |
| `window.recover` | 3 crashes within 60 seconds stop offering a plain reload; 30 seconds before the dialog returns after **Wait** |
| `nav.rail` | 48 px wide |
| `nav.resize`, `nav.layout` | explorer 280 px (200 to 480); inspector island 360 px (240 to 640); main island at least 480 px; gap 8 px; 60 px past the minimum hides an island; 16 px for each arrow key |
| `nav.ping` | every 10 seconds; no answer after 5 seconds; warning color from 500 ms |
| `nav.switch-connection` | switcher at least 320 px wide |
| `nav.linked-connection` | 3 rows at most on a Redis connection |
| `nav.pin` | 50 pins for each connection |
| `nav.back` | 100 places kept |
| `nav.path` | a menu gets a filter over 10 entries; 500 entries at most |
| `nav.copy-path` | 80 characters of the copied text in the notification |
| `nav.inspector` | loading sign after 200 ms |
| `nav.dialog` | 560 px wide, 80% of the window's height at most |
| `tab.title` | an `_id` cut to its first 4 and last 3 characters; a key's name to 32 |
| `tab.groups` | 24 characters of a group's label |
| `tab.fit` | a tab from 96 to 200 px; 40 px kept for **All tabs** |
| `tab.reorder` | a drag starts after 4 px |
| `tab.restore` | saved 1 second after the last change |
| `tab.reopen` | 20 closed tabs remembered |
| `palette.open` | 640 px wide, 12 rows in sight |
| `palette.recent` | 50 recent places kept, 12 shown |
| `palette.sources` | 50 rows for a prefix with nothing after it |
| `palette.find-collections` | names read again after 5 minutes; 10,000 names for each connection |
| `palette.find-keys` | from 2 characters; `COUNT 1000`; 5 `SCAN` calls; 20 keys; 200 ms after the last character |
| `palette.rank` | 50 results; the scores of a term and of an open tab, a recent place, the current connection |
| `home.jump-back-in` | 8 recent places |
| `home.connections` | a card at least 280 px wide |
| `connection.connect` | 10 seconds for a Redis server to answer |
| `connection.reconnect` | attempts after 1, 2, 5, 10 and 30 seconds, then every 30; gives up after 5 minutes; a read waits up to 10 seconds |
| `connection.overview` | collection counts for the first 100 databases |
| `tree.count` | document counts for the first 500 collections of a database; numbers written short from 10,000 |
| `tree.scan-namespaces` | `COUNT 1000`; 10,000 keys for each expand or **Load more** |
| `tree.namespaces` | a prefix is a namespace from 2 keys |
| `tree.redis` | 200 namespaces under one node |
| `tree.keyboard` | what was typed is remembered for 1 second |
| `tree.node-states` | *Loading…* after 200 ms |
| `query.run` | the time limit can be set from 1 to 3,600 seconds |
| `query.position` | a splitter 8 px wide between the table and the query pane |
| `undo.record`, `undo.revert` | 1,000 keys or commands in a pipeline |
| `undo.kept` | two expiry times within 1,000 ms count as the same |
| `undo.details` | the first 100 keys |
| `watch.pause` | 1,000 change events held while paused |
| `monitor.rates` | 60 points kept for the lines of the tiles |
| `gridfs.open` | the 22 extensions handed to the system's program |
| `task.cancel` | a cancelled run stops within 2 seconds |
| `playground.show` | the **Run** buttons are computed 300 ms after the last key |
| `playground.open-file` | 5 MB at most |
| `playground.statements` | 5,000 lines in under 100 ms |
| `playground.stop` | **Stop** ends a run within 1 second |
| `mcp.server` | port 37018; a busy port is tried again every 3 seconds |
| `mcp.access-token` | 43 characters |
| `mcp.redis-key-tools` | `redis_scan_keys` 1 to 1,000 keys (100), 20 `SCAN` calls, `COUNT` 500 at most; `redis_read_value` 1 to 100 items (20), a string 4,000 bytes at a time, a value cut at 1,500 characters; 30 seconds for a reply |
| `mcp.redis-server-tools` | `redis_slow_log` 1 to 128 entries (20), a command cut at 300 characters; `redis_clients` 1 to 500 (50) |
| `key.show` | 100,000 keys at most in one table |
| `key.scan` | `COUNT 500`; a run stops at 500 keys found or after 200 calls |
| `key.details`, `key.inspect` | read 150 ms after the table or the selection settles |
| `key.sort` | by expiry or size up to 10,000 loaded keys; 500 commands in a pipeline |
| `key.delete-selected`, `key.delete-by-pattern` | 500 names for each `UNLINK`; `COUNT 500` |
| `key.export`, `key.export-text` | pages of 500 items; strings in parts of 1,048,576 bytes; 100 pairs, elements or members on a line |
| `key.import` | 500 commands in a pipeline |
| `value.show` | a page is 200 items; the compact form shows 4,096 bytes of a string or 20 items |
| `value.format` | JSON tried up to 1,048,576 bytes; compact text cut at 200 characters; compact hexadecimal shows 32 bytes |
| `value.quote` | in a step, an argument over 256 bytes is cut to its first 64 |
| `value.item-editor` | an item over 200 characters, or of several lines, opens as a dialog |
| `value.read-string` | read whole up to 1,048,576 bytes; edited up to 16,777,216 bytes |
| `value.read-hash`, `value.read-set` | `COUNT 200`; a run stops at 200 found or after 100 calls |
| `value.remove-fields`, `value.remove-members`, `value.delete-entries` | 500 names or IDs in a command |
| `value.copy` | 16,777,216 bytes at most to the clipboard |
| `console.input` | grows to 8 lines; 500 lines at most in one run of several lines |
| `console.run` | pages on screen are read again at most once a second after writes |
| `console.classify` | `KEYS` is confirmed above 10,000 keys in the database |
| `console.output` | 500 commands kept; 1,000 elements and 10,000 characters shown at a time; 16 MB of a reply kept |
| `console.command-docs` | the built-in list of commands is that of Redis 7.2 |
| `console.autocomplete` | 10 suggestions |
| `pubsub.subscribe` | 100 subscriptions for each page |
| `pubsub.channels` | 200 channels; read every 5 seconds; filter sent after 300 ms |
| `pubsub.messages` | 200 characters in a cell; drawn 10 times a second at most |
| `pubsub.keep` | 10,000 messages kept |
| `pubsub.publish` | 1 MB at most for a message |
| `pubsub.reconnect` | tries after 1, 2, 4, 8 and 16 seconds, then every 30 |
| `pubsub.event-rows` | the messages of one event join one row within 2 seconds |
| `server.overview`, `server.memory` | memory bar yellow from 80% and red from 95%; fragmentation yellow from 1.5 |
| `server.read-slow-log` | 1,000 entries read |
| `server.largest-keys` | `COUNT 500`; `SAMPLES 5`; 100,000 keys and 30 seconds for each search; the 100 largest |
