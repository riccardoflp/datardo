# Security

What Datardo protects, from whom, and how. *Source: the Threat Modeling Manifesto (2020) for the four questions below;
STRIDE (Microsoft; Adam Shostack, "Threat Modeling", 2014) to find the threats; OWASP ASVS as the checklist of
mitigations for the MCP server.* Each mitigation is a code rule (R5 and R14 of [code-rules.md](code-rules.md)), an
acceptance line of a card, or a decision.

## What we are working on

The picture is the context diagram of [architecture.md](architecture.md#context): Datardo on the user's machine,
holding the credentials of MongoDB deployments and Redis servers that are often production ones, talking to them
directly or through SSH, and serving AI assistants on `127.0.0.1`.

Worth protecting, in order:

1. **The data in the deployments**: against writes the user did not mean (a read-only connection that lets one
   through, a confirmation that showed something else, a command pasted in the console), against load that harms a
   production server, and against reading by someone who should not.
2. **The credentials**: connection strings with passwords, TLS keys, SSH keys and passwords, the MCP access token.
   Each opens a deployment or a service.
3. **The user's machine and files**: Datardo writes backups and exports, deletes old ones (retention), runs
   playground scripts, and keeps copies of data in its undo history.

The trust boundaries:

- between Datardo and everything in **Not trusted** on the diagram: the deployments, the SSH servers;
- between the main process and the window process, which shows data that came from a deployment;
- between Datardo and other programs on the same machine, at the MCP server's port;
- between Datardo and the files it reads that someone else may have written: imports, connection files, backups,
  saved query files of a shared folder, playgrounds, exported keys.

What VS Code gave Mongoster and Datardo now does itself: keeping secrets, isolating the pages from the system, and
deciding what an opened file may do ([product](product.md#what-replaces-mongoster-and-vs-code)). They are T1 to T3,
T7 and T6.

## What can go wrong

| | STRIDE | The threat | Where | Mitigation | Status |
| --- | --- | --- | --- | --- | --- |
| T1 | I | A credential is read from where Datardo keeps it, or from a place it was copied to: the settings, the connections file, the Log, the steps of a confirmation, an error's text, an exported file. | `connection.secrets`, `runner.step-text`, `runner.error`, `runner.log` | Secrets only in the secret storage (R14.1); steps and errors are written with secrets masked; the Log is not written to disk; an export without passwords leaves out every secret of a connection string and of its options, not only the main password | Mitigated by design; the test of R14.1 searches the data folder and the Log |
| T2 | I | On a system without a keychain, secrets are written in clear text. | `connection.secrets` | Never written: kept in memory until Datardo quits, and the user is told ([D26](decisions.md#d26--secrets-are-encrypted-with-a-key-of-the-systems-keychain-or-not-kept), R14.2) | Mitigated by design |
| T3 | I | A secret reaches the window process, where a fault of the page could read it. | `connection.form` | No secret crosses the bridge: a form shows an empty field, and an empty field keeps the saved one (R14.3) | Mitigated by design |
| T4 | S | A machine in the middle poses as the SSH server and receives the tunnel's credentials and traffic. | `connection.connect` | The host key is confirmed the first time and checked every time after (R14.8) | Mitigated by design |
| T5 | T, D | A file from someone else makes Datardo run code, write where it should not, or run out of memory: a connection file, a backup, an import, a saved query of a shared folder, exported keys. A backup names the databases, collections and indexes it creates. | `backup.restore`, `backup.folder-layout`, `backup.archive-read`, `connection.import`, `transfer.import`, `saved-query.save`, `aggregate.run` | Parsed, never evaluated (R9.1, R14.4); limits on size and depth; a folder backup's file names are percent-encoded as mongodump does, so that no collection's or database's name leaves the backup's folder or names a device (`backup.folder-layout`); a restore on a connection offers no system database (`admin`, `local`, `config`) nor an invalid name under the name the backup gives, creates no TTL index of the backup on a collection that was already there (the server would delete its documents), and names in its confirmation the collections a view of the backup would replace (`backup.restore`); the list of an import says what each connection weakens or where else it connects (`connection.import`); a saved pipeline that ends in `$out` or `$merge` is a write and is confirmed like any other | Mitigated by design for code and for where files are written (M37). An archive's checksum is a CRC against damage by accident, not against a file changed on purpose, and is checked at each collection's end, after its documents were inserted: what came before a bad checksum stays (`backup.archive-read`) |
| T6 | E | A playground written by someone else runs with the user's connections when the user runs it. | `playground.run` | Runs only when the user runs it, never by being opened; in a process of its own, which is given the database objects and nothing of the system; writes refused on a read-only connection | Accepted beyond that: the user chose to run the code |
| T7 | T, E | A value in a database holds HTML or script that the window renders, and the script asks the main process to write, or sends data away. | every page | Values shown as text (R14.5); the window process is a sandbox with a policy that allows only the application's own files, no navigation and no network ([D27](decisions.md#d27--the-window-process-is-a-sandbox), R14.6) | Mitigated by design |
| T8 | S, I, D | Another program, or a web page, on the same machine calls the MCP server and reads data, or makes it send many commands at once. | `mcp.server`, `mcp.output-limits` | Listens only on `127.0.0.1`; refuses another `Host`, an `Origin` other than `127.0.0.1` or `localhost` (against DNS rebinding from a web page), a missing or wrong token, a body over 1 MB (413, the body read to its end so that the client gets the answer) and a JSON-RPC batch of more than 20 messages (400, none of them run) (R14.7); every command a tool sends has a time limit of 30 s; off until turned on. One instance listens, so there is no handing of the port between windows, and the token never leaves the secret storage but through the copies of `mcp.setup` | Mitigated by design; the batch limit from M37 |
| T9 | I | An AI assistant, steered by text inside the data, reads more than the user meant and sends it to its provider. | `mcp.read-data`, `mcp.refuse-write-stages`, `mcp.arguments` | No tool writes; no tool runs a command the assistant writes; documents and values only with `datardo.mcp.readData`: with it off the tools that return them and `explain_query` are not offered, `count_documents` takes no filter, the commands of running operations, validators, view pipelines, partial filter expressions, saved queries, titles of the undo history, the details of sharding events and the slow commands of Redis are reduced to their shapes or left out, and a server's error text is replaced by its code; whatever the setting, the `system.*` collections (users, profiler, views) and the stages that are not a plain read of the collection (`$currentOp`, `$changeStream`, `$listSessions`, `$queryStats`…) are refused, at any depth of a pipeline; every call is in the Log, its error cut to one line | Accepted: reading is what the server is for, and the setting is the user's choice; the reach of the setting off and the refusals from M37. What the user excluded from searches is left out of the lists of connections, databases and collections, but still answers when the assistant names it: an exclusion is not an access control (M39) |
| T10 | T | A write goes through a read-only connection or a view because one entry point skips the check. | `runner.run`, `connection.read-only` | Every write is a step run by the runner, which checks the connection as it is when the step runs (R5.1, R5.2); features cannot reach an engine | Mitigated by construction; the read-only suite of the tests |
| T11 | T | A write the user confirmed changes more than the confirmation said: another filter, a stale count, a step that was not shown. | `runner.confirm` | The confirmation shows the steps that are sent, and counts with their filter (R5.4) | Mitigated by construction |
| T12 | T | A command pasted or mistyped in the Redis console destroys data. | `console.run` | Commands that lose data or change the server are confirmed, the worst by typing; on a read-only connection every command the server flags as a write is refused | Mitigated by design; the console's writes cannot be undone, and the tab says so |
| T13 | D | Datardo itself harms a production server: a `KEYS`, a scan without bounds, a query without a time limit. | `key.scan`, `query.run` | `SCAN` only, in bounded pages (R9.3); every call has a time limit and a page size (R9.2) | Mitigated by design |
| T14 | D, T | Retention of a scheduled task deletes files that are not its own outputs. | the `task.` cards | Only the outputs recorded in the task's state are deleted, by exact path | Mitigated by design |
| T15 | I | Datardo contacts the network on its own and reveals that it is used, or what with. | the whole product | No call the user did not cause or a setting did not allow (R14.9); no usage data. The one call Datardo makes by itself, the check for a newer version (`window.check-update`), tells GitHub the address of the machine and Datardo's version and nothing else, and `datardo.window.checkForUpdates` turns it off | Mitigated by design; the check is accepted, on by default ([D44](decisions.md#d44--datardo-says-when-a-newer-version-exists-and-installs-nothing-by-itself)) |
| T16 | I | A secret of a server is shown or logged because the server returned it: `requirepass` in `CONFIG GET`, a password in a slow command. | `server.read-config`, `server.slow-log`, `console.secret-arguments`, `runner.step-text` | Known secret settings and arguments are masked in the Server page and wherever a command is shown or logged. A reply the user asked for in the console is shown as it is, and never logged | Mitigated by design, for the names known; a reply of the console is shown as the server sends it and never logged ([D51](decisions.md#d51--one-playground-at-a-time-and-console-replies-as-the-server-sends-them)) |
| T17 | S | TLS with invalid certificates or host names allowed, or Redis without TLS, lets a machine in the middle read the password and the data. | `connection.form` | Off by default; the form says what each option gives up | Accepted: the user's explicit choice |
| T18 | I | A connection string or a password is given to an AI. | `mcp.server` | No tool returns a secret; errors returned to the assistant are masked like the others | Mitigated by design |
| T19 | E | A link in a value opens something on the machine. | `window.open-link` | Only `https` links open, in the system's browser (R14.6) | Mitigated by design |
| T20 | E, T, I | A file stored in GridFS by someone else is opened with the system's program and runs, or exploits its viewer; an SVG shown as a preview runs a script or loads something; another user of the machine reads, or replaces before it is opened, the temporary copy in a shared temporary folder. | `gridfs.open`, `gridfs.preview` | **Open** hands over only files whose extension is in a list of document, picture, sound and archive types, never a program or a script, and the main process checks the type again; the copies go in a private temporary folder of Datardo's own, made anew with a random name and readable only by the user (0700 on macOS and Linux), deleted at quit. A preview is drawn as an image, where nothing runs and nothing is loaded (R14.6) | Accepted in part: a document can still exploit its viewer ([D42](decisions.md#d42--a-gridfs-file-opens-in-the-systems-program-for-a-list-of-extensions)); the private folder from M37 |
| T21 | I | The password of a new server user passes through the window process, where a fault of the page could read it. | `user.create`, `user.change-password` | Typed or generated in the dialog, sent once to the main process, kept nowhere after the dialog and its notification close; written `***` in steps, confirmations and the Log | Accepted as the one exception to R14.3 ([D41](decisions.md#d41--a-new-users-password-passes-through-the-window-once)) |
| T22 | I | The history of the console, kept on disk, holds values the user typed. | `console.history`, `console.secret-arguments` | Secret arguments are never written; `datardo.console.historySize` set to 0 keeps none; `console.clear-history` empties it; it is deleted with the connection; the file can be read only by the user (T25) | Accepted: the file is in the user's profile, like the undo history ([D43](decisions.md#d43--the-consoles-history-is-kept-on-disk)) |
| T23 | E | Another program starts the installed Datardo as a plain Node.js (`ELECTRON_RUN_AS_NODE`), with code of its own (`NODE_OPTIONS`, `--inspect`), or with an `app` folder put beside `app.asar`, to act with Datardo's identity: the keychain's key of the secret storage, the MCP access token. | the packaged application | Electron's fuses, set in the binary by `electron-builder.yml` ([platform](platform.md#the-packaged-application)): `runAsNode`, `enableNodeOptionsEnvironmentVariable` and `enableNodeCliInspectArguments` off, `onlyLoadAppFromAsar` and `enableCookieEncryption` on | Mitigated in part (M37): `app.asar`'s integrity is not validated while the installers are not signed ([D45](decisions.md#d45--the-installers-are-not-signed)), since whoever can change `app.asar` could then change the fuses too |
| T24 | E | The window process, made to misbehave by a fault of the page, asks the main process to open a file of its choosing with the system's program: a program, a script, a page that runs scripts. | `transfer.export`, `relation.export-svg`, `gridfs.open`, `window.open-data-folder` | The main process opens with the system's program only the file an export of this session wrote, and only when its extension is its format's own (`.json`, `.jsonl`, `.csv`), otherwise it shows it in its folder; a GridFS copy only for the types of `gridfs.open`'s list, checked again in the main process; a diagram saved as SVG is only shown in its folder, since a browser would run its scripts, and only the file the feature wrote. Any other path the window names is refused. The data folder is opened from the main process's own state, not from a path the window gives. Showing a file in its folder runs nothing | Mitigated by design (M37); before it, the window could name any path to `transfer.export`'s **Open** and `relation.export-svg`'s |
| T25 | I | Another user of the same machine reads the files Datardo keeps in the data folder: the undo history, which holds documents and keys as they were, the console's history, the saved queries, the connections and their hosts. | the data folder | On macOS and Linux every file Datardo writes there is readable only by the user (0600) and every folder only by the user (0700); files and folders an older version made are changed when Datardo starts ([platform](platform.md#per-system)). On Windows the profile folder's permissions do it | Mitigated by design (M37) |
| T26 | T, D | A file of formatting rules from someone else (**Import formatting…**) carries something other than rules: code, a huge list, or a condition written to hang the table. | `table.import-formatting`, `table.formatting-file` | JSON of at most 1 MB, keeping only the known properties of the known kinds of rule and 100 rules per scope; a condition stays text, read by `query.parse` and never evaluated, and matched by `table.match`, which has no `$where` and no `$function`; a regular expression runs on the page shown only (500 documents at most) | Mitigated by design (M42) |

Nothing is built yet: "mitigated by design" means the cards and the rules require it, and the tests named in the
rules prove it once written. A threat whose mitigation turns out not to hold becomes a row of [risks.md](risks.md).

## What we do about it

The mitigations above are the rules R14.1 to R14.9, the rules of writes R5.1 to R5.6, the decisions D14, D15, D16,
D26, D27, D38 and D39 to D45, the acceptance lines of the cards named in the table, and the packaged application's
fuses and the permissions of the data folder ([platform](platform.md)).

## Secrets

| Secret | Kept in the secret storage as | Who reads it | Never in |
| --- | --- | --- | --- |
| The connection string of a connection, or its password when it was given as fields | `connection/<id>/string` | the engine, to connect; copying the connection string; an export with passwords | the connections file, settings, the Log, the bridge, the MCP server's answers |
| TLS and SSH options of a connection: keys, passwords, passphrases | `connection/<id>/options` | `src/engines/transport` | the same, and a form (an empty field keeps the saved one) |
| The MCP access token | `mcp/token` | the MCP server; the setup that copies it into a client's configuration | the Log |
| Passwords of new server users | not kept | shown once, with **Copy password** | anywhere after the page is closed, and the steps shown or logged |

The secret storage is one file of the data folder, each value encrypted with Electron's `safeStorage`, whose key the
system's keychain holds. Only the main process reads it.

## Input that is not trusted

| Source | What Datardo does with it |
| --- | --- |
| Documents and values from a deployment | Parsed by the driver; shown as text; never evaluated; never set as HTML |
| Replies of servers (operations in progress, logs, profiler entries, `INFO`, `CLIENT LIST`, the slow log) | Parsed by a `parse` function tested on recorded replies; shown as text; known secrets masked |
| Names of databases, collections, fields and keys | Shown as text; keys are bytes and are escaped when they are not text; never used to build a path on disk without being made safe |
| Connection files (Compass's, Mongoster's, Datardo's, lists of connection strings) | Parsed; passwords decrypted only with the user's passphrase |
| Backups (archives, folders) | Parsed; the names of a folder's files decoded and checked against their metadata; checksums checked at each collection's end, and a damaged archive stops the restore (what was inserted before stays); no system database restored under its own name; no TTL index created on a collection that was already there |
| Imports (JSON, JSON Lines, CSV, mongosh text; exported keys) | Parsed with limits; inserted as data |
| Saved query files of a queries folder | Parsed as JSON; an invalid one is skipped with a warning; a pipeline that writes is confirmed |
| Playground files | Run only when the user runs them, in a process of their own |
| Files of a GridFS bucket | Previewed as text, as an image or as a hex dump, never run; handed to the system's program only for the listed extensions |
| Messages of Pub/Sub channels | Shown as bytes, by `value.format`; a message read as a redis-oplog event is parsed with limits |
| Requests to the MCP server | The token, the host, the origin, the size and the number of messages of a batch are checked; arguments are parsed and bounded; `system.*` collections and pipelines that are not a plain read are refused; output and time are bounded |
| What the window process asks of the main process | Intents of features, which the runner checks like any other; a path to open with the system's program is opened only when the main process wrote it in this session, and only for the types it opens as data |
| What the user types (a filter, a pipeline, a command line) | Parsed, never evaluated; a Redis command is checked against what is refused and what is confirmed before it is sent |

## What is not defended

- A user, or a program, with the rights of the user's account on the machine: it can ask the keychain for the key,
  read the data folder, and read the undo history, which holds documents and keys as they were.
- The undo history, backups and the console's history are not encrypted: they are copies of the data, or of what the
  user typed, in the user's folders.
- What a playground does: it asks before it drops a database or a collection, confirms no other write and records
  nothing in the undo history ([D40](decisions.md#d40--the-playground-asks-before-it-drops)).
- The server user's own permissions: a read-only connection is a safeguard of Datardo, not a limit of the server
  ([D14](decisions.md#d14--read-only-is-a-safeguard-of-datardo-not-a-permission)).
- The AI provider: what the MCP server returns goes wherever the assistant sends it (T9).
- A playground the user chose to run (T6).
- Who made a write: Datardo is used by one person, and the Log is in memory; the servers' own logs are the record.
- Installers that are not signed cannot be told from altered ones, except by comparing their SHA-256 with the one
  the release's page gives ([D45](decisions.md#d45--the-installers-are-not-signed)); for the same reason the
  installed application does not check its own `app.asar` (T23).

## Did we do a good enough job

Read this page again when a change adds a secret, a listening port, a kind of file read from outside, a new way for a
write to reach a deployment, a network call, a file the main process opens with the system's program, or a
dependency; and before each release.
