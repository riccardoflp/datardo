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
- Playgrounds run mongosh code against a MongoDB connection and database: the whole script with `Ctrl+Enter`, the
  selected lines, or one statement from its **Run** button or `Ctrl+Shift+Enter`, each run in a process of its own
  that **Stop** ends at once, even a script that never waits. A script has `db`, `use`, its collections and cursors,
  sessions and transactions with `withTransaction`, the BSON types, `print` and `printjson`; its results show the
  documents as a table or as JSON, the value of its last expression, what it printed and its error with a link to the
  line. Dropping a collection or a database is confirmed first, a read-only connection refuses every write, and the
  writes are published for redis-oplog on a linked connection. The editor colors the script and suggests the
  collections, the methods and the fields; playgrounds are opened from the tree, Go to and Home, saved as
  `.mongodb.js` files that remember their connection and database, and opened again.

### Security

- The text of a step, in a confirmation and in the Log, hides the passwords of `ACL SETUSER` and of every `CONFIG SET`
  parameter that holds one, as the Redis console does.
