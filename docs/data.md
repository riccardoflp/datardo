# Stored data

Everything Datardo keeps between runs. What a version writes, the next version must read: from the first release these
files and their fields are promises (R15 of [code-rules.md](code-rules.md#r15--stored-data)). Datardo starts empty: it
never reads Mongoster's storage ([D20](decisions.md#d20--datardo-keeps-its-own-data-and-starts-empty)).

## What is stored

### The data folder

`%APPDATA%\Datardo` on Windows, `~/Library/Application Support/Datardo` on macOS, `~/.config/Datardo` on Linux, or the
folder the environment variable `DATARDO_DATA` names ([platform](platform.md)). Only `src/storage`, in the main
process, reads and writes it.

Every file below is JSON in UTF-8 with LF line endings, an object whose first field is `"version": 1`.

| Path in the data folder | Holds | Written by | May be lost? |
| --- | --- | --- | --- |
| `settings.json` | The settings the user changed, by their full names; a setting left at its default is not written | `settings.page` | No, though losing it only brings the defaults back |
| `connections.json` | The saved connections, with nothing secret: id, name, engine, folder, color, read-only, whether the undo history is kept, the hosts as shown, whether TLS and SSH are used and the SSH host and user, the queries folder, the linked Redis connection and the redis-oplog options | `connection.add`, `connection.remove` and the other cards of that area | **No**: the user's connections |
| `secrets.json` | The secrets, each value encrypted with Electron's `safeStorage` and written in base64: `connection/<id>/string`, `connection/<id>/options`, `mcp/token` ([security](security.md#secrets)) | `connection.secrets`, `mcp.server` | **No**. Not written at all on a system without a keychain ([D26](decisions.md#d26--secrets-are-encrypted-with-a-key-of-the-systems-keychain-or-not-kept)) |
| `known-hosts.json` | The SSH host keys the user confirmed, by host and port | `connection.trust-host-key`, `connection.connect` | Losing it asks again: safe, but surprising |
| `window.json` | The window's place, size and maximized state, the widths of the islands, which islands are closed | `window.remember` | Yes |
| `session.json` | The open tabs with their groups and what each shows (the target, the filter, the section), the selected connection, the page of the rail | `tab.restore` | Yes: Datardo opens on Home |
| `pins.json` | The pins of each connection, in order | `nav.pin` | **No** |
| `home.json` | The recent places of Go to and of **Jump back in** (what each showed, its section, when), the engine Home is filtered to, the folders collapsed on Home | `palette.recent`, `home.filter`, `home.connections` | Yes: the recent places start again |
| `state/<connection id>.json` | What Datardo remembers of one connection that is not a setting: for each collection the recent queries (the last 50), the columns' layout (hidden, order, widths, pinned) and the expanded nested columns; for each Redis database the separator of the key tree and the pattern last used; the console's last commands; the target of each playground file; the last folders used for a backup and an export | `saved-query.recent`, `table.columns`, `key.show`, `console.run`, `playground.open`, `backup.create` | Yes |
| `saved-queries/<connection id>.json` | The queries saved *for me* on that connection, by database and collection | `saved-query.save` | **No** |
| `undo/index.json` | The list of the operations of the undo history: id, time, connection, target, title, the numbers inserted, updated and deleted, the size of its file | `undo.record`, `undo.limits` | **No**: see [versions](#versions) |
| `undo/<id>.json.gz` | One operation: the gzip of canonical Extended JSON, the documents and the keys as they were, with the fingerprint of each after the write (`undo.record` gives the shape) | `undo.record`, once | Yes, one by one: that operation can no longer be undone, and the page says so |
| `tasks/tasks.json` | The scheduled tasks | `task.show` and the cards of that area that change a task | **No**: the user's tasks |
| `tasks/<id>.json` | The state of one task: the last scheduled time handled, its last 20 runs, the outputs it wrote | `task.run` | Losing it forgets the runs, and the outputs that retention would delete then stay |
| `chromium/` | What Electron and Chromium keep for themselves (caches, the GPU's shader cache) | Electron | Yes: Datardo keeps nothing of its own there |

A file named after a connection is deleted with the connection, as are its pins, its secrets and its operations of
the undo history (`connection.remove`, `undo.forget-connection`); Mongoster left them behind. Inside `state/` and
`saved-queries/`, what belongs to a collection follows its rename (`manage.rename-collection`) and stays when it is
dropped ([D34](decisions.md#d34--removing-a-connection-removes-what-datardo-keeps-about-it)).

A pin of a saved query in `pins.json` names its database, collection and name, and may also keep `place` (`me` or
`folder`), `file` (the path of its file inside the queries folder) and `query` (the query of one for me): optional
fields of version 1, which an older Datardo leaves out when it reads the file ([Q79](decisions.md#open-questions)).

The Log is kept in memory and is never written to disk ([security](security.md#what-can-go-wrong), T1). Datardo writes
no crash report and no usage data.

### Files in the user's places

Datardo writes these where the user says, and reads them back. Their formats are shared with other programs, so they
carry no `version` of Datardo's, and R15.1 does not apply to them.

| What | Where | Format | Promise |
| --- | --- | --- | --- |
| Saved queries *in the folder* | the queries folder of a connection: `<folder>/<database>/<collection>/<name>.json` | Mongoster's: `name`, `description`, `database`, `collection`, optional `connection`, `filter`, `sort`, `projection` or `pipeline` in mongosh syntax, text of several lines as an array of lines | One folder serves Datardo and Mongoster, and a team shares it through git ([D29](decisions.md#d29--saved-queries-for-me-or-in-the-queries-folder-of-a-connection)). A field Datardo does not know is kept when the file is written again; an invalid file is skipped with a warning |
| Backups of MongoDB | the folder the user picks | mongodump's: an archive (gzipped or not), or a folder of `.bson` and `.metadata.json` files | Readable by `mongorestore`, and Datardo restores what `mongodump` wrote ([D18](decisions.md#d18--backups-in-mongodumps-formats-written-by-datardo)) |
| Exports of documents | the file the user picks | JSON, JSON Lines (canonical Extended JSON, as `mongoexport` writes it), CSV with a UTF-8 byte order mark | Importable again by Datardo and by `mongoimport` |
| Exports of Redis keys | the file the user picks | a keys file: Redis commands as text, extension `.redis` (`key.export-text`, [D37](decisions.md#d37--keys-are-exported-as-redis-commands)) | Importable again by Datardo with the bytes and the expiry of every key, and runnable by `redis-cli` |
| Change events and Pub/Sub messages | the file the user picks | JSON Lines (`watch.export`, `pubsub.export`) | None beyond the format |
| Pictures | the file the user picks | PNG for a chart, SVG for a relationship diagram | None |
| Connection files | the file the user picks | Datardo's JSON (which is Mongoster's, with the engine added), Compass's JSON, a list of connection strings | Datardo reads the three, and Mongoster's as Mongoster wrote it; passwords are written only when the user asks, encrypted with the user's passphrase |
| Playgrounds | the files the user opens and saves | JavaScript text | Never changed by running them |
| Outputs of scheduled tasks | the folder of the task | a backup or an export, as above | Retention deletes only the outputs recorded in the task's state, by exact path |

## Versions

Every file of the data folder carries `"version"`, a whole number that starts at 1
([D21](decisions.md#d21--every-stored-format-carries-a-version-from-the-first-release)). A change that an older
Datardo could not read adds 1; a new optional field does not.

What Datardo does when it opens a file:

| The file | What happens | What the user sees |
| --- | --- | --- |
| Is missing | It is read as empty. | Nothing |
| Has the current version | It is read. Fields Datardo does not know are kept and written back. | Nothing |
| Has an older version | The migrations run in order, in memory. The file is written in the new version at its next change, after the old one is copied to `<name>.v<old version>.bak`. | Nothing |
| Has a newer version | It is read as far as the current version understands it, and **never written**: every change that would write it is refused for this run. | *This data was written by a newer version of Datardo. Changes to \<what the file holds\> are not saved until Datardo is updated.* |
| Cannot be parsed, or has no `version` | It is renamed `<name>.damaged-<date and time>.json`, and read as empty. Nothing else is deleted because of it. | *\<What the file holds\> could not be read and was set aside as \<file name\>.* with **Open data folder** (`window.open-data-folder`) |

Two cases that Mongoster got wrong, and what Datardo does:

- **`undo/index.json` is damaged.** It is set aside and the list starts empty, but the operation files are **not**
  treated as orphans: none is deleted in that run. At the next start with a readable index, a file with no entry is
  deleted only if it is older than `datardo.undo.maxDays`. An entry whose file is missing shows as an operation that
  can no longer be undone.
- **`tasks/tasks.json` is damaged.** It is set aside and no task runs. The next task the user saves starts a new
  file; the old one is still there under its other name.

A value of `secrets.json` that cannot be decrypted (the keychain's key changed) is read as missing: the connection
asks for its password again and says why.

## Migrations

| File | From | To | What changes | Function | Test |
| --- | --- | --- | --- | --- | --- |

None yet: version 1 is the first. The rule for each one (R15.2):

- the function is `src/storage/migrations/<file>/v<from>-to-v<to>.ts`, pure, from the old object to the new one;
- a file recorded from the old version is added to `test/fixtures/stored/<file>/v<from>/` in the same commit, and a
  test reads it through the migrations and compares the result;
- a row is added to the table above;
- a change to a format users share (saved query files, connection files, exported keys) is a decision first, since
  other programs and other versions read them.

## How it is written

- **Atomically**: the whole file is written beside as `<name>.tmp`, flushed, then renamed over the old one. On Windows
  the rename is tried again for up to 1 second when another program (an antivirus, a backup) holds the file.
- **By one writer**: Datardo is one instance
  ([D19](decisions.md#d19--scheduled-tasks-run-inside-datardo-which-is-one-instance), `window.single-instance`), and only the main
  process writes. Writes to one file are queued, so two changes never interleave. There are no lock files.
- **Small files often, large files once**: a store is written a moment after its last change (300 ms), and at quit.
  An operation file of the undo history is written once, before its entry is added to the index, so that an entry
  never names a file that is not there yet.
- **Never in clear text**: `secrets.json` holds only encrypted values; with no keychain it is not written.
- A data folder that cannot be written (read-only, full disk) never stops Datardo: what could not be saved is said
  once in a notification, and the window's place and the session are simply not remembered.

## What never changes

- The names of the settings (`datardo.<group>.<name>`), listed in [features/settings.md](features/settings.md).
- The names of the files above and of their fields.
- The keys of the secrets.
- The format and layout of saved query files, of backups and of exports.
- The environment variable `DATARDO_DATA`.

Renaming any of them is a decision, with the code that reads the old name (R15.5).
