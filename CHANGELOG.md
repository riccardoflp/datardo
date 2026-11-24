# Changelog

Every change the user can see, by version (R8.3). The format is [Keep a Changelog](https://keepachangelog.com/).

## Unreleased

### Added

- Datardo starts as a window of its own, which shows its name and its version.
- Datardo opens in its own frameless window with a top bar, a theme and a zoom you choose; it remembers its size and
  place, runs as one instance, can sit in the tray, and quits cleanly. About shows the version and links to the
  repository.
- The window has its rail, the explorer, the main island with the scope bar, the inspector island and the status line;
  the islands can be resized, hidden with `Ctrl+B` and reached with `F6`, and their widths are remembered.
- Every feature can ask, confirm a write with its plan, show work in progress, be cancelled and notify; the Log page
  lists what ran, and every dialog behaves the same way.
- The Settings page changes, validates and resets the settings, kept in `settings.json`; Datardo says once a day when
  a newer version exists on GitHub, and installs nothing.
- Pages open in tabs grouped by connection: tabs can be made active, closed, reordered, reopened and collapsed, and
  come back at the next start.
- Go to (`Ctrl+K`) finds and runs connections, pages, open tabs, collections, keys and commands; Home lists the
  connections by folder and the places used last.
- MongoDB and Redis connections are added in the connection form, tested, saved with their passwords in the secret
  storage, connected and disconnected, made read-only, and shown in their Overview.
- The tree island lists the databases and collections of a MongoDB connection with their estimated counts and sizes,
  and the databases and key namespaces of a Redis connection, scanned with `SCAN` only, 10,000 keys at a time with
  **Load more**; it is filtered with `Ctrl+F`, refreshed with `F5`, used from the keyboard alone, shows pinned items
  and pages, and opens the context menus of its nodes.
- Connections reach their servers through an SSH tunnel, with a password, a private key or the SSH agent; the host
  key of an SSH server is confirmed the first time, and a key that changed is a warning.
- Connections are duplicated, their connection string is copied, they are moved between folders and given a color,
  and folders are renamed and removed from their own menu; a MongoDB connection is linked to a Redis connection for
  redis-oplog, and unlinked.
- Connections are imported from a file or the clipboard (Datardo, Mongoster and Compass exports, lists of connection
  strings), with their encrypted passwords when the passphrase is given, and exported for Datardo, for Compass or as
  a list, without passwords, with them encrypted, or in clear text.
- A collection tab has its query bar: a filter, a sort, a projection, **Skip** and **Limit** in mongosh syntax, colored
  as they are typed, with suggestions of the collection's fields, operators and values; the query builder writes the
  filter from rows of fields, operators and values. The tab runs its query when it opens, keeps the query last run for
  the next start, counts the matching documents (an estimate for an empty filter, exact on a click), stops a query at the time limit of the
  settings and says so, and **Cancel** stops a query that runs. `Ctrl+F` goes to **Filter** and `Ctrl+Enter` runs.
- The documents of a query are shown in a table that draws only the rows on screen: every BSON type in its cell with
  its color, nested fields expanded into columns and arrays into sub-rows, columns hidden, moved, pinned and resized
  and remembered for each collection, a header that sorts, the keyboard to move between cells and select rows, the
  menus of a row, a cell and a header, the selection bar, copying a value, a field path or documents as mongosh,
  Extended JSON, JSON, JSON Lines, YAML, an insert command or CSV, **Refresh** (`F5`) and the paging row with its page
  size. A cell or a header dragged onto the query bar adds a condition, a sort or a projection.
- Writes to documents and keys are recorded before they run, in an undo history kept between starts: the Undo history
  page lists them with what each changed, shows what undoing one would do, and undoes it, or the last one, also from
  the notification of the write; the undo is recorded too, so it can be redone. The history keeps its limits of size,
  age and number, can be cleared, and can be turned off for one connection.
- Writes to documents through a MongoDB connection linked to a Redis connection are published for redis-oplog, in the
  background, so that the Meteor apps using it see them; a failure to publish is a warning that leaves the write done.
- A Redis database opens in a keys tab, from the tree, the rail's **Search**, the path or Go to: its keys are scanned
  with `SCAN` only, by a pattern typed and a type chosen, a page at a time with **Scan more**, and shown with their
  type, expiry and size, sorted by any column, selected with the mouse or the keyboard, and inspected in the inspector
  island; **Switch database** opens the keys of another database of the server.
- Keys are created, opened in a tab of their own, renamed, copied to another name or database, given an expiry or
  made persistent, deleted one at a time, by selection or by pattern, and their names copied; every write is shown
  before it runs, refused on a read-only connection, and recorded in the undo history when it fits.
- Keys are exported to a file of Redis commands, with their values, expiries and bytes kept, and imported from it,
  skipping, replacing or stopping at the keys that exist.
- A collection tab in **Aggregate** has the pipeline editor: stages added, renamed from the templates of the common
  stages, disabled, moved and removed, with suggestions in their bodies and marks that say what needs attention; the
  output after any stage or of the whole pipeline is shown in the table, paged and counted; the pipeline is edited as
  text, copied, and kept by the tab for the next start. A cell or a header dragged onto the editor adds a condition,
  and a click on a header sorts the output.
- A pipeline ending with `$out` or `$merge` runs only after a confirmation, which asks to type the name of a collection
  that `$out` replaces, and never on a read-only connection; a pipeline is saved as a view.
- Playgrounds run mongosh code against a MongoDB connection and database: the whole script with `Ctrl+Enter`, the
  selected lines, or one statement from its **Run** button or `Ctrl+Shift+Enter`, each run in a process of its own
  that **Stop** ends at once, even a script that never waits. A script has `db`, `use`, its collections and cursors,
  sessions and transactions with `withTransaction`, the BSON types, `print` and `printjson`; its results show the
  documents as a table or as JSON, the value of its last expression, what it printed and its error with a link to the
  line. Dropping a collection or a database is confirmed first, a read-only connection refuses every write, and the
  writes are published for redis-oplog on a linked connection. The editor colors the script and suggests the
  collections, the methods and the fields; playgrounds are opened from the tree, Go to and Home, saved as
  `.mongodb.js` files that remember their connection and database, and opened again.
- The selected document is shown in the inspector island, as a tree read with the keyboard or as text, with its values
  and paths to copy; a value is edited in its cell or in the inspector, keeping its numeric type; a document opens in a
  document tab, in mongosh syntax, and is saved with `Ctrl+S`, asking first when another client changed it meanwhile.
- Documents are inserted from the insert dialog, with a template of the collection's fields, or from the tab of a new
  document; a document is duplicated and deleted; the selected rows and the documents matching the filter are updated
  or deleted, each write shown before it runs, refused on a read-only connection and on a view, and in the undo
  history. A write that would change the type of a value (a BSON undefined, a date beyond the range of JavaScript)
  is not sent.
- The Server page of a Redis connection, from the tree or Go to, shows the server a section at a time, read again with
  **Refresh** or by itself every 2, 5 or 15 seconds while it is in view: the overview from `INFO` with the keys of each
  database, the clients with a filter and **Disconnect…**, the slow log with its threshold and **Clear…**, the memory
  with the advice of the server and the largest keys of a database, found with `SCAN` a bounded number at a time,
  replication, and the configuration, read-only, with its passwords hidden. A section whose command the server refuses
  says why and the rest of the page works; the section, **Auto** and the filters come back at the next start.
- The key tab shows the value of a string in an editor, as text, formatted JSON or hexadecimal, read a megabyte at a
  time when it is large; it is edited and saved with `Ctrl+S`, keeping the key's expiry, asking first when the value
  changed in the database meanwhile, and undone with its bytes and its time left.
- The key tab shows the fields of a hash in a table, a page at a time, filtered by name, sorted, with the expiry of
  each field on Redis 7.4; fields are added, edited and renamed in their cell, removed one at a time or by selection,
  and copied as text, hexadecimal or Redis commands; bytes that are not text are edited in hexadecimal.
- The inspector island shows the beginning of the value of the key selected in a keys tab, and the row selected in
  a key tab in full; **Refresh** (`F5`) reads the value again and says when the key is gone or changed type.
- A Redis connection opens a console tab, on a connection of its own named `datardo-console`: commands are typed with
  their colors, the suggestions of the server's commands and the hint of their arguments, run with `Enter` one line
  after the other, and their replies shown by their type, a string of a reply in the inspector island. The console
  follows its database and its transaction, keeps the commands in a history reached with `Up` and `Down`, refuses on
  a read-only connection every command that writes, confirms the commands that lose data or change the server, writes
  passwords as `***`, and **Stop** stops a command that waits. The output is cleared with `Ctrl+L`, a reply, one of
  its values or the command is copied, a command is run again from its menu, and the history can be cleared.
- **Queries** in the query bar lists the saved and recent queries of a collection: run one again, save the query or
  the pipeline of the tab for you or as a file of the connection's queries folder in Mongoster's format, rename,
  move, delete, pin, or reveal one; the folder is watched, a file that is not valid is skipped with a warning, and Go
  to finds saved queries by their name.
- Databases and collections are created, renamed and dropped from the tree, the menu of the connection island and Go
  to: names are checked while typed, a drop asks to type the name of the collection or database and says how many
  documents and indexes go with it, and a renamed collection keeps its tab, its recent and saved queries, its columns
  and its pin. The Definition section of a view and the Validation section of a collection edit them in mongosh syntax
  and save them with `Ctrl+S`; a collection without rules is offered a `$jsonSchema` generated from a sample.
- A field is renamed, removed or converted to another type from the menu of its column header or Go to, in the
  documents matching the filter of the query bar: each write is shown before it runs with the documents it touches,
  leaves out those where a parent is an array, is refused on a read-only connection and on a view, and is recorded in
  the undo history; the column follows a renamed or removed field.
- A GridFS bucket opens in a page of its own from the tree or Go to: its files are listed a hundred at a time, filtered
  by name or by a MongoDB filter, sorted by name, size or date, and the selected file is previewed in the inspector
  island (a picture, an SVG among them with nothing in it run, a text, or the hex of its first bytes) with its files
  document. Files are uploaded from the disk, adding a revision, replacing or skipping the names that exist, and
  downloaded, both a chunk at a time with their progress on the status line and **Cancel**, which leaves nothing half
  written; a file is opened with the system's application from a temporary copy, only for the types of documents,
  pictures, sound and archives; files are renamed, their metadata edited in a document tab, and deleted, and a bucket
  is created by its first upload and deleted from the tree. A read-only connection lists, previews, downloads and
  opens, and changes nothing.
- The key tab reads lists, sets, sorted sets and streams a page at a time: a list from the head, from the tail or
  from an index; a set filtered by name; a sorted set lowest or highest first, or between two scores; a stream newest
  or oldest first, or between two IDs or dates. Elements are pushed, changed in their cell, removed one at a time or by
  selection, and the list trimmed; members are added and removed; scores are changed; entries are added (also as a
  copy of another), deleted, and the stream trimmed. Every write is confirmed when it loses data, refused on a
  read-only connection, and undone with its bytes. The **Groups** section of a stream shows its consumer groups, their
  consumers and the entries they have pending.
- An MCP server lets AI assistants on the same machine read your MongoDB and Redis connections through 35 tools that
  never write: it is turned on from **MCP** in the top bar, whose dot says whether it runs, listens on `127.0.0.1`
  behind an access token kept in the secret storage, and copies the command for Claude Code or the JSON configuration
  for other assistants. A new access token, another port and the calls of the assistant in the Log are a click away;
  a taken port is said once with **Change port**, and `datardo.mcp.readData` off keeps documents and values of keys
  away from the assistant.
- Documents are exported to JSON, JSON Lines and CSV from the table's toolbar, a selection or the tree, the query or
  pipeline shown and its page kept; files of JSON, JSON Lines and CSV are imported, shown before they run; a
  collection is copied to another database or connection with its indexes; test documents are generated from a
  sample of a collection. Long work shows its progress and stops with **Cancel**, and every type and byte is kept.
- A connection, a database or a collection is backed up in mongodump's formats (an archive, or a folder compressed
  or not) and restored from them, with a checksum that stops a damaged archive; a restore, a copy and an import can be
  undone from the Undo history.
- **History** of a document, from its inspector, its row menu or its tab, lists the writes the oplog still holds,
  newest first, with what each changed and the versions they made, marking those written from Datardo; a version is
  copied, or restored after a confirmation and recorded for undo, refused on a read-only connection.
- **Watch changes** follows a collection, a database or the whole deployment live through a change stream: the change
  events arrive newest first, are filtered by the server and by type and text in the page, show what each changed in
  the inspector, can be paused, stopped, resumed from the last one, cleared, copied and exported as JSON Lines, and a
  collection can be made to record pre-images.
- A Redis connection opens a Pub/Sub page, on a connection of its own named `datardo-pubsub`: subscribe to channels
  and patterns by typing them or from the list of the channels active on the server, and see the messages as they
  arrive, the newest at the top, with the time they arrived, their channel and what they say; the list keeps the
  newest 10,000, pauses and resumes, is cleared and filtered, and a message is shown whole in the inspector island.
  Messages are copied in four ways, exported as JSON Lines, JSON or CSV, and published from a form, which says how many
  clients received them; a read-only connection subscribes and does not publish. When the page's connection drops,
  the page says so, subscribes again by itself and marks the gap in the list. **Follow events** on a MongoDB
  connection linked to Redis shows each redis-oplog event as one row with its operation, collection, document and
  fields. The subscriptions, the filter and **Events of** come back with the tab.
- The Users and roles page of a MongoDB connection lists the users and the roles of one database or of all, with who
  the connection is signed in as, a filter and the built-in roles on request; the inspector shows a user's roles as
  chips that revoke, grants a role, and shows a role's privileges, the roles it inherits and the users that have it.
  Users are created with a generated password, their password changed and deleted; custom roles are created, edited
  and deleted. A password is written `***` in every step, confirmation and line of the Log, and the new password of
  the connection's own user can be saved in the connection.
- The Indexes section of a collection lists its indexes with their keys, properties, sizes and uses (and which were
  never used), sorted by a click on a column, with the build in progress and its percentage; the selected index is
  shown in the inspector with its definition and the command that creates it, to copy. Indexes are created,
  duplicated and edited in a dialog, as a form or as the keys and options of `createIndex`, which shows the command
  and what saving takes and stays open on the server's error; a change MongoDB cannot make in place drops and builds
  the index again after a confirmation, and puts the old one back when the new definition is refused. Indexes are
  hidden, unhidden and dropped from their row, the keyboard or Go to. Search and Vector Search indexes are listed with
  their status, created, changed and dropped on a server with search; a server without search says what it needs.
- Search documents (Go to, or the menu of a database or a collection) looks for a text or a regular expression in
  every value, and optionally in field names, of the collections of a database or of every database, three at a time
  with no time limit until **Stop**; the documents found are grouped by collection, shown in the inspector island,
  opened in a document tab, opened together in their collection with **Open in collection**, and their `_id` copied.
- The Relationship diagram of a database samples its collections, finds the fields that refer to another collection
  and draws them as boxes and arrows that can be moved, zoomed and opened; it is copied as a Mermaid `erDiagram` or
  saved as an SVG image, and the MCP tool `describe_relations` uses the same references.
- A document of a collection tab shows **Go from here** in the inspector island: the documents it refers to and the
  collections that refer to it, each opened filtered in its collection; a reference cell opens what it refers to with
  `Ctrl`+click, `Ctrl+Enter` or its context menu.
- **Compare with…** compares two collections of any MongoDB connections document by document, with a filter, fields
  to ignore and numbers compared by value or by type: the counts, the first 300 differences of each kind, the
  difference of a document field by field in the inspector, and one document or a whole side made like the other
  after a confirmation, every BSON type kept and recorded for undo, refused on a read-only side or a view.
- **Compare structure with…** compares the collections, views, options, indexes, search indexes and shard keys of two
  databases, and makes the right one like the left one: with the script copied or opened in a playground, or applied
  after a confirmation that asks to type the name of what it drops.
- Scheduled tasks back up a connection, a database or a collection, or export a collection with a filter and a
  projection, every few hours, daily or weekly while Datardo runs, also from the tray: **Schedule…** on a connection,
  a database or a collection, or **New task…** on the Scheduled tasks page, which shows each task's next run and last
  runs. A run missed while Datardo was closed is logged or run once at the next start, older outputs past **Keep**
  are deleted (never a file the task did not write), a run can be run now or cancelled, and failed runs notify.
- The Schema section of a collection analyzes a sample of 100, 1,000 or 10,000 documents of the filter, at random
  when more match, on a worker thread that **Cancel** stops within one batch: each field with its share of the
  documents, its types, its most frequent values or a histogram, the sizes of its arrays, and its nested fields,
  expanded one by one or all at once. A click on a value, a range or a type adds it to the filter and analyzes again.
- The Explain section shows how a find or a pipeline ran: whether it read the whole collection, sorted in memory or
  used an index, the documents returned and examined, the winning plan as a tree, shard by shard on a sharded
  cluster, and the stages after the query; it suggests an index by the equality, sort and range rule, which
  **Create…** opens in the index dialog, and **Raw** shows the server's output as it came.
- The Chart section of a collection draws the documents of the filter or the output of the pipeline as bars, lines, a
  pie, a scatter of two fields or a histogram, counted or measured by category, by date unit and by series, in the
  colors of the theme; a click on a bar or a slice shows its documents, **Save picture…** writes the chart as a PNG,
  and the type, the fields and the options are kept with the tab.
- The Code section writes the query of the bar, the pipeline or the aggregation of a chart as code for mongosh,
  Node.js, Python, Java, C# and Go, as a few lines or as a full program that reads `MONGODB_URI`, with every BSON
  type kept; **Copy** puts it on the clipboard, and the language chosen is kept with the tab.
- The Monitor page of a MongoDB connection shows the operations in progress, filtered by namespace, by how long they
  have run and with idle connections or not, refreshed by **Auto** or **Refresh**; **Kill…** stops one after a
  confirmation. Its Slow queries section reads the profiler of a database or the server log, groups the operations by
  query shape with their count, average and worst time, says when an index could help and creates the index it
  suggests, opens a slow query in its collection or in Explain, and sets or clears the profiler and the log threshold
  after showing the command. The page keeps its section and its choices with its tab; a read-only connection never
  changes the profiler or kills an operation.
- The Index advisor of a connection, a database or a collection lists the indexes to create for the slow operations
  of the profiler or the server log (the same index Explain suggests), the unused indexes with how long their use has
  been counted, and the redundant indexes that start another one; **Create index…** opens the index dialog with the
  keys of the advice, and **Turn on…** turns on the profiler of a database after a confirmation.
- The MCP server offers `index_advice`, the advice of the Index advisor as text, read only, and `open_monitor`, which
  opens the Monitor page; no tool changes the profiler.
- The Stats section of the Monitor page shows the server's version, uptime, connections, operations, network and
  memory, with the rates since the last refresh drawn as a line, the size of every database, and the collections of
  the database chosen, each table sorted by a click on a header.
- The Replication section shows the members of a replica set with their state, lag, heartbeat and ping, the window of
  the oplog and its last entries filtered by namespace and by operation; **Step down…** asks the primary to step down
  after a confirmation. A standalone server and a mongos say why they have no replication.
- The Sharding section of a mongos shows the shards in their colors, the sharded collections with their shard key,
  chunks, data per shard and whether the balancer finds them balanced, and the recent migrations and splits;
  **Stop balancer…** and **Start balancer…**, and **Disable balancing…** and **Enable balancing…** of a collection,
  run after a confirmation, and never on a read-only connection.
- The MCP server offers `sharding_status`: the shards, the balancer, the sharded collections and the recent events of
  a cluster, read through its mongos.
- The query of a collection tab can sit at the right of the results, in a pane you resize with its splitter (drag,
  arrow keys, `Home`, `End`, double click). Choose it with the toggle in the query bar, from Go to, or with **Place of
  the query** in Settings; the place and the width are remembered, and a tab too narrow keeps the query above and says
  why. In the pane the stages of a pipeline are laid one under the other, moved with **Move up** and **Move down**.
- A cell dragged from the table can be dropped on **Sort** and **Project** too.
- Connections can take eleven preset colors (red, orange, yellow, green, blue, purple, pink, teal, indigo, brown,
  gray) or a custom color chosen in the new dialog **Choose a color**, from **Set color…** or the connection form.
- **Set color…** on a database (MongoDB or Redis) or on a collection, view or GridFS bucket gives it a color of its own,
  shown on its icon in the tree, on pinned items and on the icons of its tabs; Go to has **Set database color…** and
  **Set collection color…**. A collection's color follows its rename, and dropping a collection, a bucket or a
  database from Datardo forgets their colors.
- Connection files keep custom colors and the colors of databases and collections: Datardo's format writes them,
  files of Mongoster 0.9 and 0.10 and of Datardo are imported with them, and the list of an import counts them; a
  Compass export notes that they were left out.
- **Exclude from searches** on a database, a collection, a view or a GridFS bucket in the tree, or on a connection,
  leaves it out of the tree's filter, Search documents and the MCP server's lists of connections, databases and
  collections; it stays in the tree, dimmed and marked **excluded**, naming it still finds it, and **Include in
  searches** puts it back. The summary of a search says how many it left out, and the Home card of an excluded
  connection says **Excluded from searches**.
- Several databases, collections and buckets of the tree can be selected with `Ctrl+click`, `Shift+click`,
  `Shift+Down` and `Shift+Up`, to exclude or include them together; `Escape` keeps only the focused one.
- Renaming or dropping a collection, a database or a bucket from Datardo moves or forgets its exclusion with its
  color, and Datardo's connection files carry the exclusions; imports from Compass files and lists say they were
  left out.

### Changed

- The colors are those of the first sketch: a teal accent, islands with a border of their own, wider steps between the
  canvas, the islands and what is raised, and a selected line tinted with the accent. Text reads at 4.5:1 at least on
  every surface, and the border of a field and the focus at 3:1, in both themes.
- An island of a connection with a color shows it on its border.
- Datardo ships the fonts Inter and JetBrains Mono, so the window looks the same on every system.
- The MCP indicator of the top bar is a pill, and the section of a collection tab that is shown is underlined in the
  accent.
- The title bar drawn by the system takes the color of the new canvas.
- **Explain**, **Code**, **Update many…** and **Delete many…** moved from the table's toolbar into the query bar. The
  buttons of the query bar, the builder, the pipeline and the table's toolbar have icons, and in a narrow tab some show
  their icon alone.
- Compass colors are read as their own presets (teal, indigo, pink, gray) instead of the closest of six.
- In a list of connection strings, a `// name` comment names only the line right below it.

### Fixed

- Nothing moves when the pointer passes over it: **Add connection** and the buttons of the explorer, the buttons of a
  line of the tree, and the close button of a tab kept their place and size only some of the time.
- A field of one line, such as the filter of the query bar, no longer shows a scroll bar when its text is longer than
  the field.
- A notification no longer covers the pager row of a tab.
- The latency of the status line keeps one width as it changes, so the parts after it no longer move at every ping.
- The total of the pager and the pin of a pinned column can be read again: they were drawn in the color meant for
  text on the accent.
- A read in progress leaves what was shown in place until its answer comes, and dims it or says it is working only
  after 200 ms: the table of a collection or of a pipeline, its pager and its total, the keys tab, the key in the
  inspector and the largest keys of the Server page, the value of a key tab and the groups of a stream, the header of
  a key tab, the overview of a connection, the Monitor page, and the definition and validation of a collection. Before,
  each of them emptied itself or showed **Loading…** for a moment at every refresh.
- Refreshing the keys tab keeps the keys selected that are still found; a selected consumer of a stream stays selected
  after Refresh.
- While the inspector still shows the key selected before, its buttons are disabled until the new key is read.
- The console keeps its prompt while a command runs, and **Run** and **Stop** have the same width; **Cancel** of the
  keys tab and **Make persistent** of a key tab keep their place while hidden.
- The list of Go to no longer scrolls under the pointer.
- A data folder where a file stands in place of a folder is treated as empty on Linux and macOS too, as on Windows.
- The license check of `npm run check` works on Linux and macOS.
- What a read of a key tab's toolbar refuses, said under the toolbar, can be read in the light theme.
- The window opens again with exactly the size it was left with when Windows scales the display by a fraction such as
  125%, instead of growing by a few pixels at each start.
- On Linux the Log no longer shows two lines of `window.remember` at each start, when the window has not moved.
- A file selected in a bucket and a row selected on the Server page show in the inspector at once, instead of only
  once something else in the window was drawn again.
- A menu of the tree taller than the window scrolls, instead of leaving its first entries out of reach.
- A table of the Server page with a horizontal scroll bar and few rows shows its last row, instead of hiding it under
  the header.

### Security

- The MCP server refuses a batch of more than 20 messages, a `skip` above 1,000,000, any `system.*` collection a tool
  is given, and pipelines that write or are not a plain read (`$currentOp`, `$changeStream`…) at any depth, with joins
  of `system.*` collections, before anything is sent; `write_history` never shows writes to `system.*` collections.
- With `datardo.mcp.readData` off, `explain_query` is no longer offered, `count_documents` gives only totals,
  validators, view pipelines and partial filters are given without their values, `sharding_status` leaves out the
  details of its events, and a server's error is reduced to its code. The MCP server's errors are written on one line
  in the Log, cut at 300 characters.
- The list of an import says what each connection weakens or where else it connects: invalid certificates or host
  names allowed, a proxy, the SSH port, the Redis server of redis-oplog, no undo history, the queries folder.
- A folder backup writes any name of a database or a collection as mongodump does (`a/b`, `con`, `..x`), and still
  reads folders written before. A restore never offers a system database or an invalid name, never creates a backup's
  TTL index on a collection that was already there, and names the collections a view would replace and what it leaves
  out.
- **Open** after an export opens only the file just written, and only a `.json`, `.jsonl` or `.csv`; any other file is
  shown in its folder. The notification of **Save SVG…** has **Reveal**, which shows the diagram in its folder instead
  of opening it. The window can no longer ask for any other file to be opened.
- Copies of GridFS files go in a folder of Datardo's own with a random name, readable only by you and deleted at quit;
  control characters in their names are replaced.
- On macOS and Linux the files of the data folder are readable only by you (0600, folders 0700), also those an older
  version wrote.
- The installed Datardo cannot be started as a plain Node.js, with `NODE_OPTIONS`, with a debugger, or with an `app`
  folder beside `app.asar`.
- The text of a step, in a confirmation and in the Log, hides the passwords of `ACL SETUSER` and of every `CONFIG SET`
  parameter that holds one, as the Redis console does.
