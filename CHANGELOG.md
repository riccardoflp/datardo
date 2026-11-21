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

### Fixed

- What a read of a key tab's toolbar refuses, said under the toolbar, can be read in the light theme.
- The window opens again with exactly the size it was left with when Windows scales the display by a fraction such as
  125%, instead of growing by a few pixels at each start.

### Security

- The text of a step, in a confirmation and in the Log, hides the passwords of `ACL SETUSER` and of every `CONFIG SET`
  parameter that holds one, as the Redis console does.
