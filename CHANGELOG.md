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
