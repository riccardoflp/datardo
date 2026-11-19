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
- Connections reach their servers through an SSH tunnel, with a password, a private key or the SSH agent; the host
  key of an SSH server is confirmed the first time, and a key that changed is a warning.
- Connections are duplicated, their connection string is copied, they are moved between folders and given a color,
  and folders are renamed and removed from their own menu; a MongoDB connection is linked to a Redis connection for
  redis-oplog, and unlinked.
- Connections are imported from a file or the clipboard (Datardo, Mongoster and Compass exports, lists of connection
  strings), with their encrypted passwords when the passphrase is given, and exported for Datardo, for Compass or as
  a list, without passwords, with them encrypted, or in clear text.
