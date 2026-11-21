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

### Fixed

- The window opens again with exactly the size it was left with when Windows scales the display by a fraction such as
  125%, instead of growing by a few pixels at each start.

### Security

- The text of a step, in a confirmation and in the Log, hides the passwords of `ACL SETUSER` and of every `CONFIG SET`
  parameter that holds one, as the Redis console does.
