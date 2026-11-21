"""Writes docs/roadmap.md from the milestones below and the cards of the catalog.

The milestones (what each builds beyond its cards, its exit criteria) are written here by hand; the lists of cards,
their links, their order and the features each milestone names that arrive later are computed from the catalog, so
that the roadmap never disagrees with it. Run it after adding, renaming or moving a card:

    python scripts/roadmap.py docs
    python scripts/catalog.py docs --index
"""
from __future__ import annotations

import re
import sys
import textwrap
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import catalog  # noqa: E402

IDENT = re.compile(r"`([a-z][a-z0-9-]*\.[a-z][a-z0-9-]*)`")
KIND_ORDER = {"Derivation": 0, "Read": 1, "Operation": 2, "View": 3}

CONNECTION_FIRST = ["add", "edit", "form", "read-form", "redis-string", "string-secrets", "tls-in-uri", "test", "save",
                    "secrets", "connect", "server-info", "disconnect", "state", "reconnect", "overview", "menu",
                    "remove", "read-only", "allow-changes"]
VALUE_FIRST = ["show", "format", "quote", "typed-bytes", "item-editor", "check", "count", "read-string",
               "save-string", "read-hash", "add-field", "edit-field", "rename-field", "remove-fields", "copy",
               "refresh"]
MONITOR_FIRST = ["show", "operations", "read-operations", "kill-operation", "slow-queries", "read-slow-queries",
                 "query-shape", "group-slow-queries", "set-profiler", "set-log-threshold", "clear-profiler",
                 "create-suggested-index", "open-slow-query"]

STANDARD_EXIT = [
    "Every acceptance line of the cards above has a test named after its card, and they pass: `npm run check`, "
    "`npm run test:integration`, `npm run test:ui`; `catalog.py --tests` reports none missing for these cards.",
    "Every page and dialog this milestone adds passes the accessibility check in both themes, and can be used from "
    "the keyboard alone (QA15, QA16).",
    "The cards above are *Built* in the [index](features/README.md), `CHANGELOG.md` says what the user can now do, "
    "and this milestone's **Status** is *done*.",
]

# Each milestone: its number, title, goal, the milestones it depends on, the cards it builds (an area's name for all
# its cards, or a pair of an area and the names of some of them, or of an area and "rest"), what it builds beyond
# the cards, its own exit criteria, and what is left out on purpose.
# The status of each milestone that is not planned: in progress, or done (its exit criteria are then ticked).
STATUS: dict[int, str] = {0: "done", 1: "done", 2: "done", 3: "done", 4: "done", 5: "done", 6: "done", 7: "done", 8: "done", 9: "done", 10: "done", 11: "done", 13: "done", 17: "done"}

MILESTONES = [
    dict(n=1, title="A window of its own",
         goal="Datardo starts as one window without the system's title bar, with its top bar, its buttons, its theme "
              "and its zoom; it remembers where it was, runs as one instance, can sit in the tray, and quits cleanly.",
         depends=[0], cards=[("window", "except", ["check-update"])],
         beyond=["**Modules**: `src/main` (start, one instance, the window, the tray), `src/preload` (the bridge), "
                 "`src/ui/shell` (the top bar), `src/ui/theme` (the tokens and the two themes), `src/storage` (the "
                 "versioned store, atomic writes).",
                 "**Code rules checked from now**: R10 (tokens only, roles, the accessibility check), R14.5 and "
                 "R14.6 (the sandbox, the content policy, links), R15.",
                 "**Decisions**: relies on D1, D3, D5, D6, D21, D23, D27; settles Q22; the repository is D48's.",
                 "**Threats**: mitigates T7 and T19.",
                 "**Stored data**: introduces `window.json` at version 1, and the rules of "
                 "[versions](data.md#versions) for every later file.",
                 "**Risks**: RS7 (the frame on three systems) is met here first."],
         exit=["On Windows, macOS and Linux the window can be moved by its top bar, snapped, maximized, restored and "
               "brought back on screen after a display is removed: the UI tests of `window.frame` and "
               "`window.placement`, and the manual checklist of [testing.md](testing.md#what-no-test-reaches).",
               "A damaged `window.json`, and one of a newer version, start Datardo with the default window and "
               "delete nothing (QA17)."],
         notin=["The islands, the rail and the status line: M2.", "Tabs: M4."]),
    dict(n=2, title="Islands to get around",
         goal="The window has its rail, the explorer with the connection island and the tree island, the main island "
              "with the scope bar, the inspector island and the status line; islands are resized, hidden and reached "
              "from the keyboard; dialogs behave in one way.",
         depends=[1], cards=["nav"],
         beyond=["**Modules**: `src/ui/shell` (rail, explorer, main island, inspector island, status line, dialogs), "
                 "`src/shared/state` (the app's state and its one reducer).",
                 "**Decisions**: relies on D6.",
                 "**Stored data**: introduces `pins.json` at version 1; `window.json` gains the widths of the "
                 "islands.",
                 "**Quality**: the keyboard-only test of the shell starts (QA16)."],
         exit=["With no connection saved, the window shows the rail, an empty explorer that offers to add a "
               "connection (`nav.empty`), and every island can be reached with `F6`."],
         notin=["What the islands show for a connection needs connections: M6.", "The tab strip: M4."]),
    dict(n=3, title="The runner and the settings",
         goal="Every feature can now ask, refuse, confirm a plan, run its steps, show work in progress, be "
              "cancelled, notify and write the Log; the settings are read from one schema and changed in their page.",
         depends=[2], cards=["runner", "settings", ("window", ["check-update"])],
         beyond=["**Modules**: `src/runner` (new), `src/features/runner`, `src/features/settings`, "
                 "`src/features/commands.ts`, `resources/settings.schema.json`.",
                 "**Code rules checked from now**: R2 (a module and a function for each card, a card for each "
                 "command), R3, R4 (refusal codes, the Log names the feature), R5 (the guard, the confirmation "
                 "shows the steps that are sent), R11 for the settings.",
                 "**Decisions**: relies on D9, D14, D15, D30, D31, D35, and on D44 for the check for a newer version, "
                 "which asks the repository of D48.",
                 "**Threats**: mitigates T10 and T11, with a plan made of test steps; T1 for the Log and the text "
                 "of steps (`runner.step-text`); T15: the UI test that counts the requests of a start now expects "
                 "one, the check for a newer version, answered by a server of the test, and none with "
                 "`datardo.window.checkForUpdates` off.",
                 "**Stored data**: introduces `settings.json` at version 1.",
                 "**Quality**: QA5 is met with test plans; the read-only suite of QA1 starts, built from the "
                 "catalog, and grows with every milestone that adds an Operation."],
         exit=["A test feature that returns a question, then a read, then a plan of three steps with danger "
               "*destructive* shows the dialog, the confirmation with the three steps and the field to type the "
               "name, runs them, writes five lines in the Log and notifies: one UI test.",
               "The same plan on a read-only connection sends nothing and shows the refusal (QA1)."],
         notin=["Recording what a write changes: M11.", "Publishing for redis-oplog: M11."]),
    dict(n=4, title="Tabs",
         goal="Pages open in tabs grouped by connection; tabs are made active, closed, reordered, reopened, and "
              "come back at the next start.",
         depends=[3], cards=["tab"],
         beyond=["**Modules**: `src/ui/shell` (the tab strip), `src/shared/state` (tabs and groups).",
                 "**Decisions**: relies on D33; settles Q19.",
                 "**Stored data**: introduces `session.json` at version 1, and the drafts it keeps."],
         exit=["Three page tabs opened, reordered and closed are restored at the next start in the same order, "
               "with the same one active; with `datardo.tab.restore` off, Datardo starts on Home alone."],
         notin=["The tabs of collections, keys and documents arrive with their areas."]),
    dict(n=5, title="Go to and Home",
         goal="`Ctrl+K` finds connections, pages, open tabs and commands and runs them from the keyboard; Home lists "
              "the saved connections by folder and the places used last.",
         depends=[4], cards=["palette", "home"],
         beyond=["**Modules**: `src/features/palette`, `src/features/home`, `src/ui/pages/home`.",
                 "**Code rules checked from now**: R2.3 with `catalog.py --commands` (every registered command has "
                 "a card).",
                 "**Decisions**: relies on D7 (Home at the first start, the last active tab afterwards); settles Q20 (the keys).",
                 "**Quality**: QA14 (the start with 200 connections and 20 tabs) gets its test."],
         exit=["With the pointer unplugged, a command is found by its title in Go to and run, and Home is reached "
               "and left: the keyboard-only UI test of this milestone."],
         notin=["Go to finds collections, keys and saved queries when their areas are built (M8, M13, M20)."]),
    dict(n=6, title="Connect to MongoDB and to Redis",
         goal="The user adds a connection of either engine in the connection form, tests it, saves it with its "
              "secrets in the secret storage, connects and disconnects, makes it read-only, and sees its Overview.",
         depends=[5], cards=[("connection", CONNECTION_FIRST)],
         beyond=["**Modules**: `src/engines` (the Engine interface, `mongodb/`, `redis/`, `transport/` for TLS), "
                 "`src/storage` (the connections and the secret storage), `src/ui/pages/connection`.",
                 "**Code rules checked from now**: R1.3 for the drivers (only `src/engines` imports them), R9, "
                 "R14.1 to R14.3.",
                 "**Decisions**: relies on D8, D11, D12, D14, D26; settles Q16 and Q17.",
                 "**Threats**: mitigates T1, T2, T3; states T17 in the form.",
                 "**Stored data**: introduces `connections.json` and `secrets.json` at version 1.",
                 "**Quality**: the integration tests start against a throwaway MongoDB and a throwaway Redis "
                 "([testing.md](testing.md#throwaway-servers)); QA19 is checked from here (no import between "
                 "engines).",
                 "**Risks**: RS9 (no keychain) and RS12 (a Redis Cluster is refused with its message) are met "
                 "here."],
         exit=["A MongoDB replica set and a Redis server, each with a password and TLS, are added, tested, saved, "
               "connected and shown in the Overview; after a restart they connect again without the password "
               "being asked.",
               "The password of a saved connection is in no file of the data folder in clear text, in no message "
               "of the bridge and in no line of the Log: the test of R14.1.",
               "A connection made read-only refuses the test write of M3 with `/read-only`."],
         notin=["SSH tunnels, folders, colors, import and export, linking a Redis connection: M7."]),
    dict(n=7, title="Connections, organized and shared",
         goal="Connections reach servers through an SSH tunnel, are kept in folders with colors, duplicated, "
              "imported from Mongoster, Compass and lists of connection strings, exported, and a MongoDB connection "
              "is linked to a Redis connection.",
         depends=[6], cards=[("connection", "rest")],
         beyond=["**Modules**: `src/engines/transport` (the SSH tunnel), `src/shared` (the connection files).",
                 "**Code rules checked from now**: R14.4 (files from outside are parsed with limits), R14.8 (the "
                 "host key).",
                 "**Decisions**: relies on D17, D20; settles Q18.",
                 "**Threats**: mitigates T4, and T5 for connection files.",
                 "**Stored data**: introduces `known-hosts.json` at version 1; `connections.json` gains folders, "
                 "colors and the link.",
                 "**Risks**: RS10 (the optional native part of `ssh2`) is checked by the packaged application on "
                 "three systems."],
         exit=["A file exported by Mongoster 0.8.0 with ten connections, two of them with a Redis address for "
               "redis-oplog, is imported: ten MongoDB connections, and the Redis connections linked to them.",
               "A connection through a bastion asks to confirm the host key the first time, and refuses to connect "
               "when the key has changed."],
         notin=[]),
    dict(n=8, title="The tree",
         goal="The tree island shows the databases, collections, views and buckets of a MongoDB connection, the "
              "databases and namespaces of a Redis connection, the pages of the connection and the pins; it is "
              "filtered, refreshed and used from the keyboard.",
         depends=[6], cards=["tree"],
         beyond=["**Modules**: `src/features/tree`, `src/ui/components` (the tree).",
                 "**Decisions**: settles Q23.",
                 "**Threats**: T13 for the namespaces (`SCAN` only, in bounded runs)."],
         exit=["On a Redis database of 5 million keys, expanding it sends `SCAN` calls only and shows namespaces "
               "in under 1 second (QA7, the tree's part).",
               "A MongoDB connection with 300 collections is filtered by a text and moved through with the arrows."],
         notin=["The entries of the context menus start features that arrive with their areas; an entry is shown "
                "only when its feature is built."]),
    dict(n=9, title="Query a collection",
         goal="A collection tab has its query bar: a filter, a sort, a projection, skip and limit in mongosh syntax, "
              "with colors, autocomplete, the query builder, a count, a time limit and Cancel.",
         depends=[8], cards=["query"],
         beyond=["**Modules**: `src/shared/mongosh` (mongosh syntax read and written, Extended JSON), "
                 "`src/features/query`, `src/ui/components` (the editor, CodeMirror 6).",
                 "**Code rules checked from now**: R9.1 (text is parsed, never evaluated), R9.2 (every call has a "
                 "time limit and a page size).",
                 "**Decisions**: relies on D4, D10, D32; settles Q24.",
                 "**Threats**: T13 for queries.",
                 "**Stored data**: introduces `state/<connection id>.json` at version 1.",
                 "**Quality**: QA8 for queries; RS16 (the editor's completion) is met here."],
         exit=["Every value `query.format` writes is read back by `query.parse` with the same BSON type: the "
               "round-trip test over every type (QA2, its first part).",
               "A query on a server made slow stops after the time limit and says so (QA8)."],
         notin=["The table that shows the documents: M10.", "Aggregate: M19."]),
    dict(n=10, title="The table of documents",
         goal="The documents of a query are shown in a table that draws only the rows on screen: every BSON type in "
              "its cell, nested fields and arrays expanded into columns and sub-rows, the columns' layout, the "
              "selection, copying in several formats, paging.",
         depends=[9], cards=["table"],
         beyond=["**Modules**: `src/features/table`, `src/ui/components` (the table), `src/ui/pages/collection`.",
                 "**Decisions**: relies on D32; settles Q25.",
                 "**Quality**: QA6 and QA9 get their tests in the performance suite.",
                 "**Risks**: RS11 (an accessible table that draws only the rows on screen)."],
         exit=["A collection of 10 million documents opens with one `find` and one estimated count, its first "
               "rows in under 1 second (QA6).",
               "A document with a value of every BSON type, copied as mongosh text, is text that `query.parse` "
               "reads back with every type."],
         notin=["Editing a cell, the inspector, the document tab: M12.", "The column actions: M21."]),
    dict(n=11, title="What every write does: the undo history and redis-oplog",
         goal="A write to documents or keys is recorded before it runs, listed in the Undo history page, and undone "
              "later, within limits the user sets; a write to MongoDB documents is published to the linked Redis "
              "connection for redis-oplog.",
         depends=[7, 10], cards=["undo", "oplog"],
         beyond=["**Modules**: `src/features/undo`, `src/features/oplog`, `src/storage` (the files of the undo "
                 "history), the hooks of `src/runner`.",
                 "**Code rules checked from now**: R5.5 and R5.6.",
                 "**Decisions**: relies on D13, D17, D35; settles Q4 (which writes are not published).",
                 "**Stored data**: introduces `undo/index.json` and the operation files at version 1.",
                 "**Risks**: RS4 for the undo history (an unreadable index deletes nothing) and RS13.",
                 "**Tested with**: plans of test steps on documents and on keys, until the areas that write "
                 "arrive (M12, M13)."],
         exit=["A plan that updates three documents is recorded, undone from its notification and from the page, "
               "and the documents are equal to what they were, type by type.",
               "With `undo/index.json` damaged, Datardo starts, says so, keeps the file aside and deletes no "
               "operation file (QA17).",
               "A write to documents through a connection linked to a Redis connection publishes the events "
               "Meteor's redis-oplog expects: an integration test that subscribes."],
         notin=["The writes themselves: documents in M12, keys in M13 to M15."]),
    dict(n=12, title="Read and write documents",
         goal="A document is inspected in the inspector island, opened in a document tab and saved, edited in its "
              "cell, inserted, duplicated, deleted; the selected rows and the documents matching a filter are "
              "updated or deleted, each shown before it runs and undone after.",
         depends=[11], cards=["document"],
         beyond=["**Modules**: `src/features/document`, `src/ui/pages/document`.",
                 "**Decisions**: relies on D13, D15, D33, D36, D39; settles Q28.",
                 "**Quality**: QA2 (types survive) for cells, the document tab, copy and paste and undo; QA4.",
                 "**Stage**: at the end of this milestone Datardo is a MongoDB client that browses, queries and "
                 "edits documents safely."],
         exit=["A document with a value of every BSON type is edited in a cell, in a document tab, duplicated, "
               "deleted and undone, and comes back with every type: the types-survive suite (QA2).",
               "**Update many** on 50,000 documents says in its confirmation that it cannot be undone, and runs "
               "(QA4).",
               "Every Operation of this milestone is refused on a read-only connection and on a view, with "
               "nothing sent (QA1)."],
         notin=["Restoring a version needs the document history: `document.restore-version` is built here and "
                "reached from M27."]),
    dict(n=13, title="Redis keys",
         goal="The keys tab scans a database with a pattern and a type and shows each key with its type, expiry and "
              "size; keys are inspected, created, renamed, copied, given an expiry, deleted one by one, by selection "
              "and by pattern, exported and imported.",
         depends=[11], cards=["key"],
         beyond=["**Modules**: `src/shared` (Redis replies and bytes), `src/features/key`, `src/ui/pages/keys`.",
                 "**Code rules checked from now**: R9.3 (`SCAN`, never `KEYS`).",
                 "**Decisions**: relies on D12, D36, D37; settles Q14.",
                 "**Threats**: mitigates T13 for keys.",
                 "**Quality**: QA7; QA3 for copy, export and import, and undo."],
         exit=["A database of 5 million keys opens with `SCAN` alone, its first rows in under 1 second, and the "
               "server never receives `KEYS` (QA7).",
               "A key of each type whose bytes are not valid UTF-8 is exported, deleted, imported and equal by "
               "`DUMP`, with the same expiry to the second (QA3)."],
         notin=["Editing values: M14 and M15."]),
    dict(n=14, title="Redis values: strings and hashes",
         goal="A key's value is shown in the inspector island and in a key tab, as text, JSON or hexadecimal "
              "without losing a byte; strings are edited and saved, and the fields of a hash are read a page at a "
              "time, added, changed, renamed and removed.",
         depends=[13], cards=[("value", VALUE_FIRST)],
         beyond=["**Modules**: `src/features/value`, `src/ui/pages/key`.",
                 "**Decisions**: settles Q15.",
                 "**Quality**: QA3 for editing."],
         exit=["A string and a hash whose bytes are not valid UTF-8 are edited in hexadecimal, saved and undone; "
               "`DUMP` is equal before the edit and after the undo."],
         notin=["Lists, sets, sorted sets and streams: M15."]),
    dict(n=15, title="Redis values: lists, sets, sorted sets and streams",
         goal="The other four types are read a page at a time and changed: elements pushed, changed, removed and "
              "trimmed; members added and removed; scores changed; entries added, deleted and trimmed; the consumer "
              "groups of a stream shown.",
         depends=[14], cards=[("value", "rest")],
         beyond=["**Modules**: `src/features/value`.",
                 "**Stage**: at the end of this milestone Datardo browses and edits both engines."],
         exit=["Each Operation of this milestone runs on a key of 100,000 items without reading the whole value, "
               "is undone, and is refused on a read-only connection (QA1, QA3)."],
         notin=["Values of module types are listed and not shown (Q6)."]),
    dict(n=16, title="The Redis console",
         goal="A console tab runs commands on a connection of its own, shows each reply by its type, completes "
              "commands and hints their arguments, remembers the commands, refuses what a read-only connection "
              "must not send and confirms what loses data.",
         depends=[13], cards=["console"],
         beyond=["**Modules**: `src/features/console`, `src/ui/pages/console`, the Redis extensions of the editor.",
                 "**Decisions**: relies on D38, D43; settles the rest of Q33 (replies that hold secrets).",
                 "**Threats**: mitigates T12; T16 for arguments; states T22.",
                 "**Stored data**: `state/<connection id>.json` gains the history of commands."],
         exit=["On a read-only connection `SET`, `PUBLISH`, `CONFIG SET` and a script are refused and the server "
               "receives none of them; `GET` runs (QA1).",
               "`FLUSHALL` asks to type the connection's name; `AUTH` and `CONFIG SET requirepass` are written "
               "with `***` in the output, the history and the Log."],
         notin=["Subscribing is refused in the console and offered in Pub/Sub: M18."]),
    dict(n=17, title="The Redis Server page",
         goal="A page shows the server at a glance: the overview from `INFO`, the clients, the slow log, the memory "
              "with the largest keys, replication, and the configuration as read.",
         depends=[13], cards=["server"],
         beyond=["**Modules**: `src/features/server`, `src/ui/pages/server`.",
                 "**Threats**: mitigates T16 for the configuration and the slow log.",
                 "**Decisions**: settles Q34 for this page.",
                 "**Risks**: RS15 (servers that lack a command): each section says what it shows then."],
         exit=["On a managed server that refuses `CONFIG` and `CLIENT LIST`, each section says what could not be "
               "read and the rest of the page works: tested with a server whose commands are renamed."],
         notin=[]),
    dict(n=18, title="Pub/Sub",
         goal="A page subscribes to channels and patterns, lists the messages as they arrive, pauses, filters, "
              "copies and exports them, publishes one, and follows the redis-oplog events of a linked MongoDB "
              "connection.",
         depends=[11, 14], cards=["pubsub"],
         beyond=["**Modules**: `src/features/pubsub`, `src/ui/pages/pubsub`.",
                 "**Decisions**: settles Q34 for this page.",
                 "**Stage**: the Redis client is complete."],
         exit=["A write to a document through a linked MongoDB connection shows as one row of the page that "
               "follows its events, with the collection, the `_id` and the fields.",
               "The page receiving 5,000 messages a second stays usable and keeps the newest 10,000."],
         notin=[]),
    dict(n=19, title="Aggregate",
         goal="The pipeline editor builds a pipeline stage by stage, shows the output after any stage, switches "
              "between stages and text, runs pipelines that write only after a confirmation, and saves one as a "
              "view.",
         depends=[10], cards=["aggregate"],
         beyond=["**Modules**: `src/features/aggregate`, `src/shared` (pipelines as text and as stages).",
                 "**Threats**: T5 for pipelines that end in `$out` or `$merge`.",
                 "**Quality**: QA8 for aggregations (120 seconds)."],
         exit=["A pipeline ending in `$out` is refused on a read-only connection and confirmed elsewhere, with the "
               "collection it replaces named."],
         notin=["Saving a pipeline as a query: M20."]),
    dict(n=20, title="Saved and recent queries",
         goal="The queries a collection ran are remembered; a query or a pipeline is saved for me or in the queries "
              "folder of the connection, as a file a team shares through git, and run, renamed, moved and deleted "
              "from the queries list, Go to and the pins.",
         depends=[19], cards=["saved-query"],
         beyond=["**Modules**: `src/features/saved-query`, `src/storage` (queries for me, the queries folder).",
                 "**Decisions**: relies on D20, D29; settles Q27.",
                 "**Threats**: T5 for the files of a queries folder.",
                 "**Stored data**: introduces `saved-queries/<connection id>.json` at version 1, and reads and "
                 "writes Mongoster's saved query files unchanged."],
         exit=["A folder of saved query files written by Mongoster 0.8.0 is listed, each query runs, and a query "
               "saved by Datardo is a file Mongoster reads: a test with recorded files of both.",
               "An invalid file is skipped with a warning and stops nothing."],
         notin=[]),
    dict(n=21, title="Manage collections and fields",
         goal="Databases and collections are created, renamed and dropped; a view's definition and a collection's "
              "validation rules are edited; a field is renamed, removed or converted to another type across the "
              "documents of a collection.",
         depends=[12], cards=["manage", "field"],
         beyond=["**Modules**: `src/features/manage`, `src/features/field`.",
                 "**Decisions**: relies on D34, D36."],
         exit=["Dropping a collection asks to type its name and cannot be undone; renaming one carries its recent "
               "queries, its queries saved for me, its columns' layout and its pins.",
               "Renaming a field of 3 documents is recorded and undone; of 50,000 it says it cannot be undone."],
         notin=[]),
    dict(n=22, title="Indexes",
         goal="The Indexes section lists the indexes and the search indexes of a collection with their size, usage "
              "and builds, and creates, edits, hides and drops them.",
         depends=[21], cards=["index"],
         beyond=["**Modules**: `src/features/index`.",
                 "**Decisions**: relies on D31 (editing an index puts the old one back when the new is refused), "
                 "D36.",
                 "**Tests**: search indexes need a server with search "
                 "([testing.md](testing.md#throwaway-servers))."],
         exit=["Editing an index whose new definition the server refuses leaves the old index in place, and the "
               "notification says so."],
         notin=["Advice on indexes: M30."]),
    dict(n=23, title="Schema and Explain",
         goal="The Schema section analyzes a sample of a collection, with the types and values of each field, and a "
              "click filters on a value; the Explain section sums up how a query or a pipeline ran, shard by shard, "
              "and suggests an index.",
         depends=[19, 22], cards=["schema", "explain"],
         beyond=["**Modules**: `src/features/schema`, `src/features/explain`, `src/runner/workers` (the analysis "
                 "runs on a worker thread).",
                 "**Decisions**: settles Q26."],
         exit=["The analysis of 10,000 sampled documents runs on a worker thread while the window stays usable, "
               "and is cancelled within one batch."],
         notin=[]),
    dict(n=24, title="Chart and Code",
         goal="The Chart section draws the result of a query as bars, lines, a pie or a histogram and saves it as a "
              "picture; the Code section writes the query or the pipeline as code for mongosh, Node.js, Python, "
              "Java, C# and Go.",
         depends=[23], cards=["chart", "codegen"],
         beyond=["**Modules**: `src/features/chart`, `src/features/codegen`, `src/ui/pages/collection` (chart.js).",
                 "**Quality**: QA8 for charts (120 seconds)."],
         exit=["For one query with a value of every BSON type, the code of each of the six languages is equal to "
               "its recorded text."],
         notin=[]),
    dict(n=25, title="Export, import, copy and back up",
         goal="Documents are exported to JSON, JSON Lines and CSV and imported back; a collection is copied to "
              "another database or connection; test documents are generated; a connection, a database or a "
              "collection is backed up and restored in mongodump's formats.",
         depends=[12], cards=["transfer", "backup"],
         beyond=["**Modules**: `src/features/transfer`, `src/features/backup`, `src/runner/workers` (CSV, "
                 "compression).",
                 "**Decisions**: relies on D18, D36.",
                 "**Threats**: mitigates T5 for imports and backups.",
                 "**Quality**: QA10 (a large export does not slow typing) and QA2 for JSON Lines, copy and backup."],
         exit=["An archive written by Datardo is restored by `mongorestore`, and one written by `mongodump` is "
               "restored by Datardo, with every type: an integration test with both tools.",
               "A damaged archive stops the restore at its checksum and writes nothing more."],
         notin=["Running these at set times: M26."]),
    dict(n=26, title="Scheduled tasks",
         goal="Backups and exports run by themselves at set times while Datardo runs, also from the tray; missed "
              "runs are handled, old outputs are removed, and the page shows each task's last runs.",
         depends=[25], cards=["task"],
         beyond=["**Modules**: `src/main` (the scheduler), `src/features/task`.",
                 "**Decisions**: relies on D19; settles Q37.",
                 "**Threats**: mitigates T14.",
                 "**Stored data**: introduces `tasks/tasks.json` and the state files at version 1.",
                 "**Risks**: RS4 for tasks (a damaged file loses no other task)."],
         exit=["A task set for every minute runs three times with the window closed and Datardo in the tray, and "
               "retention keeps its last two outputs and deletes only files it wrote."],
         notin=["Tasks for Redis: Q10."]),
    dict(n=27, title="Follow the writes: the document history and Watch changes",
         goal="The document history shows the writes to one document still in the oplog, rebuilds its versions and "
              "restores one; the Watch changes page follows a change stream live, filters it, shows what each "
              "change event changed and exports the list.",
         depends=[12], cards=["history", "watch"],
         beyond=["**Modules**: `src/features/history`, `src/features/watch`.",
                 "**Decisions**: settles Q29.",
                 "**Tests**: both need a replica set ([testing.md](testing.md#throwaway-servers))."],
         exit=["A document inserted, updated twice and deleted shows four writes and its versions; restoring the "
               "second version puts it back and is recorded in the undo history."],
         notin=[]),
    dict(n=28, title="Playgrounds",
         goal="A playground tab runs mongosh code against a connection, statement by statement or whole, in a "
              "process of its own that Stop ends, with sessions and transactions, and shows the results.",
         depends=[11], cards=["playground"],
         beyond=["**Modules**: `src/features/playground`, the playground process of `src/main`, "
                 "`src/shared` (statements, the rewriting of calls with acorn).",
                 "**Decisions**: relies on D40; settles the rest of Q13 (one playground at a time, a memory limit).",
                 "**Threats**: states T6.",
                 "**Risks**: RS17 is met (a script that loops for ever is stopped)."],
         exit=["A script with `while (true) {}` is stopped within 1 second and Datardo stays usable.",
               "A script that writes is refused on a read-only connection with nothing sent (QA1)."],
         notin=[]),
    dict(n=29, title="The MCP server",
         goal="AI assistants on the same machine read the user's connections through tools that never write: the "
              "server runs on 127.0.0.1 behind an access token, is set up for the common assistants in one step, "
              "and may be kept from reading data.",
         depends=[20, 17], cards=["mcp"],
         beyond=["**Modules**: `src/main/mcp`, `src/features/mcp`.",
                 "**Code rules checked from now**: R14.7.",
                 "**Decisions**: relies on D16; settles Q35.",
                 "**Threats**: mitigates T8 and T18; states T9.",
                 "**Quality**: QA13.",
                 "**Tools** for areas built later (the monitor, the advisor, relations, search) are added in "
                 "those milestones: a tool is offered only when its feature is built."],
         exit=["A request with a wrong token, another `Host`, an `Origin` of a web page or a body over 1 MB is "
               "refused: the integration tests of R14.7.",
               "With `datardo.mcp.readData` off, no tool returns a document or the value of a key."],
         notin=[]),
    dict(n=30, title="Slow queries and the Index advisor",
         goal="The Monitor page shows the operations in progress and kills one, and the slow queries by query "
              "shape from the profiler and the server's log; the Index advisor says which indexes to create and "
              "which are redundant or unused.",
         depends=[22, 23], cards=[("monitor", MONITOR_FIRST), "advisor"],
         beyond=["**Modules**: `src/features/monitor`, `src/features/advisor`, `src/ui/pages/monitor`.",
                 "**Decisions**: settles Q30."],
         exit=["A collection scan repeated ten times shows as one slow query shape, and the advisor proposes the "
               "index that the Explain section suggests for it."],
         notin=["Statistics, replication and sharding: M31."]),
    dict(n=31, title="Statistics, replication and sharding",
         goal="The Monitor page shows the server's statistics with their rates, the replica set with its lag and "
              "its last oplog entries, and the sharded cluster with its balancer, and lets the primary step down "
              "and the balancer be stopped.",
         depends=[30], cards=[("monitor", "rest")],
         beyond=["**Modules**: `src/features/monitor`.",
                 "**Tests**: replication needs a replica set of three members and sharding a small cluster "
                 "([testing.md](testing.md#throwaway-servers)); where a test cannot have one, the `parse` "
                 "functions are tested on recorded replies."],
         exit=["Every `parse` function of this milestone reads the replies recorded from MongoDB 4.2, 6.0 and "
               "8.0 in `test/fixtures`."],
         notin=[]),
    dict(n=32, title="Users and roles",
         goal="The Users and roles page lists the users and the roles of a database, and creates users, changes "
              "passwords, grants and revokes roles, and creates, edits and deletes custom roles.",
         depends=[12], cards=["user"],
         beyond=["**Modules**: `src/features/user`.",
                 "**Decisions**: relies on D41; settles the rest of Q31 (the saved connection after a change of "
                 "password).",
                 "**Threats**: states T21; T1 for the steps (a password is written `***`)."],
         exit=["Creating a user writes its password in no step, no confirmation, no line of the Log and no file."],
         notin=[]),
    dict(n=33, title="GridFS",
         goal="A bucket's files are listed, filtered, previewed, uploaded, downloaded, opened, renamed and "
              "deleted, and a bucket is created and dropped.",
         depends=[12], cards=["gridfs"],
         beyond=["**Modules**: `src/features/gridfs`.",
                 "**Decisions**: relies on D36, D42; settles the rest of Q32 (replacing files).",
                 "**Threats**: mitigates T20 as far as it goes."],
         exit=["A file of 200 MB is uploaded and downloaded with equal bytes while the window stays usable, and "
               "the upload is cancelled within one chunk.",
               "A file named `run.exe` is not handed to the system; an SVG with a script is previewed and runs "
               "nothing."],
         notin=[]),
    dict(n=34, title="Search documents and relations",
         goal="One text is looked for across the collections of a database or of every database; references "
              "between collections are found by sampling, drawn as a relationship diagram, and followed from a "
              "document in both directions.",
         depends=[12], cards=["search", "relation"],
         beyond=["**Modules**: `src/features/search`, `src/features/relation`, `src/runner/workers`.",
                 "**Decisions**: settles Q36 for these pages.",
                 "**Quality**: QA12."],
         exit=["A search across 200 collections reads three at a time and stops within one batch (QA12)."],
         notin=[]),
    dict(n=35, title="Compare collections and structures",
         goal="Two collections are compared document by document and one side is made like the other; two database "
              "structures are compared, with the script that makes the right one like the left, applied after a "
              "confirmation.",
         depends=[25, 28], cards=["compare", "structure"],
         beyond=["**Modules**: `src/features/compare`, `src/features/structure`, `src/runner/workers`.",
                 "**Decisions**: relies on D31, D36; settles Q36 for comparisons.",
                 "**Quality**: QA11.",
                 "**Stage**: Datardo does everything Mongoster 0.8.0 does."],
         exit=["Two collections of 1,000,000 documents are compared with memory proportional to their number "
               "(QA11).",
               "**Apply** with a drop asks to type the collection's name; a step that fails stops its own "
               "difference and the others are applied."],
         notin=[]),
]

HEAD = """# Roadmap

No milestone is in progress: the next one is [M0](#m0--the-workshop). A milestone is taken by reading its section,
then every card it lists, in order; nothing outside it is built without asking. The
[index of the catalog](features/README.md) shows each card's milestone and status.

The milestones come in three stages. **M0 to M12** make a MongoDB client that browses, queries and edits documents
safely. **M13 to M18** add Redis: keys, values, the console, the server, Pub/Sub. **M19 to M35** bring the rest of
what Mongoster does, by how often it is used. Each milestone ends with something that runs.

In each list of **Features** the cards are in the order to build them: what a card uses inside the milestone comes
before it. A card often names a feature of a later milestone (a menu entry, a button that opens another page): build
the card without that part, and finish it in the milestone that brings the feature; each milestone lists these under
**Not in this milestone**. The lists and the links are written by `python scripts/roadmap.py docs` from the catalog.

## M0 — The workshop

**Goal**: the repository builds, checks and packages an application that starts and shows an empty window, so that
every later milestone only adds features.
**Depends on**: nothing.
**Status**: planned

### Beyond the cards

- **Structure**: the folders of [architecture](architecture.md#modules), each with its entry file; `package.json`
  with the dependencies of D22 and no other; the lockfile.
- **Build**: electron-vite for the three bundles (main, bridge, window); electron-builder for the installers;
  `npm run dev` with its data in `./.data` (`DATARDO_DATA`).
- **The window**: one sandboxed window that loads the bundled page and shows the application's name; the bridge
  exposes one typed object with one call, `ping`.
- **Checks**: `npm run check` runs `tsc`, ESLint, stylelint, Prettier, dependency-cruiser, license-checker,
  `scripts/check.mjs`, `python scripts/catalog.py docs` and the unit tests
  ([code rules](code-rules.md#what-the-checks-enforce)).
- **Code rules checked from now**: R1, R6, R7, R8, R12, R13; the others start with the milestone that brings what
  they are about.
- **Tests**: Vitest with one unit test; the throwaway MongoDB and Redis of
  [testing.md](testing.md#throwaway-servers) with one integration test each (connect, ping); Playwright driving the
  built application with one UI test (the window opens, the accessibility check passes).
- **CI**: on Windows, macOS and Linux: `npm ci`, the checks, the three kinds of tests, `npm run package`, and
  starting the packaged application (RS10).
- **Documents**: `CHANGELOG.md`; `"license": "MIT"` in `package.json`, beside the `LICENSE` that is already there; `resources/settings.schema.json` with no setting yet; the notices of the licenses
  written by `scripts/notices.mjs`.
- **Decisions**: relies on D1, D2, D3, D22, D24, D25, D28, D45 (nothing is signed; the macOS build is signed
  ad hoc), D46.
- **Threats**: T15 (no network call of its own) is checked by a UI test that counts the requests of a start.
- **Quality**: QA18 is met.

### Exit criteria

- [ ] `npm ci` and `npm run check` pass on a fresh clone, on the three systems.
- [ ] `npm run dev` opens the window; `npm run package` writes an installer in `release/`; the installed application
      starts.
- [ ] `npm test`, `npm run test:integration` and `npm run test:ui` each run at least one test, and the integration
      tests are not skipped in the CI.
- [ ] An import from `src/features` to `src/engines`, and a dependency that D22 does not list, each fail the check:
      tried once by hand and kept as tests of `scripts/check.mjs`.
- [ ] `python scripts/catalog.py docs` says *no problems*.

### Not in this milestone

- The frame without the system's title bar, and everything else the user sees: M1.
"""

TAIL = """## Not planned

Every card of the catalog is in a milestone. What the product leaves out has no card yet, and gets its cards when a
decision takes it in:

- Redis Cluster and Sentinel, and the values of module types (Q6, RS12).
- Scheduled tasks for Redis (Q10).
- A second main island (Q7), projects with environments (Q8), keys the user can change (Q9).
- Updating in place, and signed installers (D44, D45).

## Before a release

A release can be cut after any milestone from M12 on. Before each:

- [ ] The repository is public with its `LICENSE` and its `SECURITY.md`, private vulnerability reporting is turned on
      in its settings on GitHub (D46), at the address of D48 that `window.check-update` and the links of About
      point to.
- [ ] The page of the release says how to open an installer that is not signed, on Windows and on macOS, and gives
      the SHA-256 of every installer (D45).
- [ ] The decisions marked *to confirm* that the release contains are confirmed or replaced.
- [ ] The numbers of [features/settings.md](features/settings.md#numbers-that-are-datardos-own) used by the release
      are tuned by the performance suite (Q11, RS5).
- [ ] The read-only suite and the types-survive suite pass for every card built (QA1 to QA3).
- [ ] [security.md](security.md) is read again against what was built; [risks.md](risks.md) has no row that the
      release makes untrue.
- [ ] The manual checklist of [testing.md](testing.md#what-no-test-reaches) is done on Windows, macOS and Linux,
      with a screen reader on one of them.
- [ ] The installers of the three systems install over the previous version and keep its data folder; a data folder
      of every earlier release is read (the migration tests).
- [ ] `CHANGELOG.md` and the notices of the licenses are those of the release.
"""


def wrap(text: str, first: str, rest: str) -> str:
    """Wraps a line of Markdown at 118 columns without breaking inside a code span."""
    kept = re.sub(r"`[^`]*`", lambda span: span.group(0).replace(" ", "\x00"), text)
    filled = textwrap.fill(kept, width=118, initial_indent=first, subsequent_indent=rest, break_long_words=False,
                           break_on_hyphens=False)
    return filled.replace("\x00", " ")


def main() -> int:
    docs = Path(sys.argv[1] if len(sys.argv) > 1 else "docs")
    cards = catalog.find_cards(docs / "features")
    by_id = {card["id"]: card for card in cards}
    order = {card["id"]: number for number, card in enumerate(cards)}
    by_area: dict[str, list[str]] = {}
    for card in cards:
        by_area.setdefault(card["id"].split(".")[0], []).append(card["id"])

    taken: dict[str, int] = {}
    chosen: dict[int, list[str]] = {}
    for milestone in MILESTONES:
        ids: list[str] = []
        for spec in milestone["cards"]:
            if isinstance(spec, str):
                ids += by_area[spec]
            elif spec[1] == "except":
                ids += [identifier for identifier in by_area[spec[0]]
                        if identifier.split(".", 1)[1] not in spec[2]]
            elif spec[1] == "rest":
                ids += [identifier for identifier in by_area[spec[0]] if identifier not in taken]
            else:
                ids += [f"{spec[0]}.{name}" for name in spec[1]]
        for identifier in ids:
            if identifier not in by_id:
                raise SystemExit(f"M{milestone['n']}: no card {identifier}")
            if identifier in taken:
                raise SystemExit(f"{identifier} is in M{taken[identifier]} and M{milestone['n']}")
            taken[identifier] = milestone["n"]
        chosen[milestone["n"]] = ids
    missing = [identifier for identifier in by_id if identifier not in taken]
    if missing:
        raise SystemExit("in no milestone: " + ", ".join(missing))

    uses = {card["id"]: [name for name in IDENT.findall(card["texts"].get("Uses", "")) if name in by_id
                         and name != card["id"]] for card in cards}

    head = HEAD
    if STATUS.get(0) == "done":
        workshop = head[head.index("## M0"):]
        head = head[:head.index("## M0")] + workshop.replace("**Status**: planned", "**Status**: done", 1).replace("- [ ] ", "- [x] ")
    out = [head]
    for milestone in MILESTONES:
        number = milestone["n"]
        ids = chosen[number]
        inside = set(ids)
        # What a card uses inside the milestone comes first; ties and cycles go by kind, then by the catalog's order.
        rank = lambda identifier: (KIND_ORDER.get(by_id[identifier]["kind"], 9), order[identifier])
        left = sorted(ids, key=rank)
        done: list[str] = []
        while left:
            ready = [identifier for identifier in left
                     if all(used in done or used not in inside for used in uses[identifier])]
            pick = ready[0] if ready else left[0]
            done.append(pick)
            left.remove(pick)
        later: dict[int, list[str]] = {}
        for identifier in ids:
            for used in uses[identifier]:
                if taken[used] > number and used not in later.setdefault(taken[used], []):
                    later[taken[used]].append(used)

        depends = ", ".join("[M0](#m0--the-workshop)" if n == 0 else f"M{n}" for n in milestone["depends"])
        out.append(f"## M{number} — {milestone['title']}\n")
        out.append(wrap(f"**Goal**: {milestone['goal']}", "", ""))
        out.append(f"**Depends on**: {depends}.")
        out.append(f"**Status**: {STATUS.get(number, 'planned')}\n")
        out.append("### Features\n")
        out.append(f"{len(done)} cards, in the order to build them; each card's acceptance lines are this "
                   "milestone's tests.\n")
        for position, identifier in enumerate(done, start=1):
            card = by_id[identifier]
            link = f"[`{identifier}`](features/{card['file']}#{catalog.anchor(card['heading'])})"
            out.append(wrap(f"{link} — {card['title']}. *{card['kind']}.*", f"{position}. ",
                            " " * (len(str(position)) + 2)))
        out.append("\n### Beyond the cards\n")
        for line in milestone["beyond"]:
            out.append(wrap(line, "- ", "  "))
        out.append("\n### Exit criteria\n")
        tick = "- [x] " if STATUS.get(number) == "done" else "- [ ] "
        for line in milestone["exit"] + STANDARD_EXIT:
            out.append(wrap(line, tick, "      "))
        out.append("\n### Not in this milestone\n")
        for line in milestone["notin"]:
            out.append(wrap(line, "- ", "  "))
        for target in sorted(later):
            names = ", ".join(f"`{name}`" for name in sorted(later[target], key=lambda name: order[name]))
            out.append(wrap(f"Named by cards above and built in M{target}: {names}.", "- ", "  "))
        if not milestone["notin"] and not later:
            out.append("- Nothing that its cards name.")
        out.append("")
    out.append(TAIL)
    (docs / "roadmap.md").write_text("\n".join(out), encoding="utf-8", newline="\n")
    print(f"{len(taken)} cards in {len(MILESTONES)} milestones")
    for milestone in MILESTONES:
        print(f"M{milestone['n']}: {len(chosen[milestone['n']])}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
