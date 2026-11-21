# Decisions

The choices that shape Datardo, each with why, what was rejected and what it costs. A decision is never edited away:
when it changes, a new one replaces it and the old one says *Replaced by*. A decision marked *to confirm* was taken
while writing these documents and waits for the author's word; one the author confirmed says so, with the date. The
open questions are at the end.

## D1 — A desktop application of its own, on Electron

Datardo is one desktop application for Windows, macOS and Linux, built on Electron. It is not a VS Code extension and
does not imitate one. Electron is what Mongoster's desktop app already runs on, so Mongoster's core (the driver code,
mongosh syntax, the undo history, backups, the MCP server) is ported instead of rewritten, and the window is drawn by
the same browser engine on the three systems. Rejected: Tauri 2 with a Rust core (an installer of 10 to 15 MB and less
memory, but nothing of Mongoster reused, two to three times the work, and three different system web views to test);
Tauri 2 with the core in a Node process beside it (two runtimes to package and update for a small gain); a native Rust
interface with egui, as Gitardo Desktop (the lightest, but tables, editors with autocomplete, charts and diagrams would
be written by hand). The cost: an installer of about 100 MB, and more memory than a native program.

## D2 — TypeScript everywhere; Mongoster is ported, not rewritten in a clean room

Every part is TypeScript. Mongoster 0.8.0 belongs to the same author: whoever builds a feature may read its code, and
the cards name where Mongoster does the same thing (**Ported from**). What is ported is behavior and the pure code
that already has the right shape (parsing and formatting values, the archive format, schedules, comparisons). The
design is not ported: Mongoster's host classes mix decisions with VS Code calls, and Datardo's features are functions
([D9](#d9--every-feature-is-a-function-and-the-runner-carries-it-out)). The cost: a ported file must be reshaped to
the rules of this repository before it is committed, not pasted.

## D3 — React for the window, styles from tokens, no component library

The window is written with React and TypeScript. It has the widest set of well-tested pieces for what Datardo needs
(lists of a million rows drawn a screen at a time, accessible menus and dialogs, the editor's bindings). Styles are
plain CSS: one file of tokens (colors, radii, spaces, font sizes) and one CSS module per component; themes and the
color of a connection are a change of tokens. Menus, dialogs, popovers and tooltips are built on headless accessible
primitives (Radix Primitives), which bring behavior and no look. Rejected: Svelte 5 and SolidJS (less code or finer
updates, but more components to write by hand); no framework, as Mongoster's webviews (its largest views are files of
two thousand lines); Tailwind (a build dependency and noisier markup for no gain here); a component library with its
own look (the islands would be styled against it). This replaces Mongoster's choice of plain DOM, whose reason was
never recorded.

## D4 — CodeMirror 6 wherever code is typed

Filters, sorts, projections, pipelines, documents, playgrounds and the Redis console all use one editor, CodeMirror 6,
with Datardo's own highlighting and autocomplete for mongosh syntax and for Redis commands. It is light, many small
instances cost little, and its look comes from the tokens. Rejected: Monaco, which Mongoster's desktop app uses (about
5 MB, made for one large editor, awkward in a one-line field and rigid to theme); both (two editors, two themes and two
autocompletes to keep alike).

## D5 — The window draws its own frame

There is no title bar of the operating system. The top bar is part of the window and drags it. On Windows the
system's own minimize, maximize and close buttons are drawn over the top bar's right end, so that snap layouts and
the system's behavior are kept; on macOS the traffic lights are inset at its left and the system's menu bar stays; on
Linux Datardo draws its three buttons. On Windows and Linux there is no menu bar: everything is in the window and in
Go to. The cost: per-platform code for the frame, and keyboard access to what a menu bar would have given, which Go to
provides.

## D6 — Islands, a rail outside them, one connection at a time

The layout is the sketch called A1: the top bar, the rail and the status line sit on the window's background; the
connection island, the tree island, the main island and the inspector island float on it. The explorer shows one
connection, the current one, and follows the active tab; every connection is on Home and in the connection switcher;
the tabs of all connections stay in the tab strip, grouped and colored by connection. Rejected, from the sketches: one
tree of every connection, as Mongoster (it grows without bound and mixes engines); a single focused column; tiled
panes; one space per connection with a dashboard; columns that open to the right; a notebook of cells; and projects
with environments, of which only **Open on another connection** was kept. The main island is one: no split in the
first release ([Q7](#open-questions)).

## D7 — Home is the first page

Datardo opens on Home: the places used last, and every connection as a card. With the explorer showing one connection
at a time, something must show them all, and the first run needs a place that says what to do. Rejected: opening on
the last tab only (nothing to show the first time), and a tree of every connection (D6).

*Confirmed by the author on 2026-11-18, with this precision, which answers Q1*: Home is what Datardo opens on at the
first start, when there is no tab to restore, and when `datardo.tab.restore` is off. When tabs are restored, they come
back as they were and the one that was active is active again (`tab.restore`); Home is one `Ctrl+K` or one click on
the rail away.

## D8 — Engines behind one interface; MongoDB and Redis first

An engine is a module of the main process that connects, tests, runs a request and runs a step for one kind of
database, and says what the connected server can do. Everything that is not about one engine is written once: the
window, connections with folders, colors, read-only, TLS and SSH tunnels, the runner, the undo history, the Log,
scheduled tasks, the MCP server, settings. The areas of the catalog belong to the app or to one engine. Another engine
later is a new module and new areas, with no change to the others. Rejected: one product per engine; a common query
language over the engines ([D10](#d10--the-user-reads-and-writes-the-engines-own-language)).

## D9 — Every feature is a function, and the runner carries it out

A feature is one pure function that returns what it needs next: a question, a read, a refusal with a code, or a plan
of steps. The runner asks, reads, refuses, confirms, records the undo, runs the steps, logs and publishes
([feature contract](feature-contract.md)). Features are tested without a window, a server or a disk, a write is shown
before it runs exactly as it will be sent, and the Log names the feature of every step. This is the target Mongoster's
documents proposed for its new code (its open question Q1), adopted here from the first line. The cost: a feature
cannot simply call the driver, and what it needs to know must be named as a read.

## D10 — The user reads and writes the engine's own language

For MongoDB, filters, documents, pipelines and values are mongosh syntax (`ObjectId("…")`, `ISODate("…")`, `/re/i`),
parsed by Datardo and never evaluated; it is what MongoDB users know, and it keeps the BSON types that JSON loses. For
Redis, commands are written as in `redis-cli`, and values are text, JSON or bytes in hexadecimal. Datardo does not
invent a language over them.

## D11 — The official drivers, and the oldest servers they serve

MongoDB through the `mongodb` package, 4.2 or later; Redis through the `redis` package (node-redis), 6.2 or later
(`COPY`, `SCAN … TYPE`, ACL users, RESP3); SSH tunnels through `ssh2`. An older server is refused when connecting, with
its version in the message. Rejected: `ioredis` (as capable, but node-redis is the client Redis itself maintains and
documents first); Mongoster's own small RESP client (enough to publish events, not for a Redis client).

## D12 — Redis in the first release: one server

A Redis connection reaches a standalone server or one replica, with a password or an ACL user, TLS and an SSH tunnel.
Redis Cluster and Sentinel are not in the first release: a server in cluster mode is refused when connecting. Keys of a
module's type (RedisJSON, time series, search) are listed and can be renamed, expired and deleted, but their values
are not shown. The cost: no use against a cluster until that work is done ([Q6](#open-questions)).

## D13 — An undo history of Datardo's own, for documents and for keys

Neither engine has an undo. Before a write to documents, Datardo saves the documents as they were; before a write to
keys, each key as `DUMP` returns it, with its expiry. They are kept in compressed files in the data folder, with
limits on size, age and count (`datardo.undo.*`, Mongoster's defaults). Undoing writes them back and is itself
recorded. The cost: disk space, a second read before every write, and writes over the limits that cannot be undone,
which the confirmation says.

## D14 — Read-only is a safeguard of Datardo, not a permission

A connection marked read-only makes Datardo refuse every write through it; the server's user is not changed or
checked. It protects against a mistake on a production connection, not against someone who means harm. The check is
made when a write is about to run, not when a tab was opened, so that a connection made read-only stops the tabs that
were already open.

## D15 — A dangerous write shows its plan; what is lost for good is confirmed by typing its name

A plan whose danger is *Confirm* is shown in a confirmation with its steps as they will be sent, how much they touch
and whether they can be undone, and one button named after the action. A plan whose danger is *Destructive* asks the
user to type the name of what is lost: a collection, a database, a pattern of keys. The same holds wherever the plan
comes from, so dropping a collection through a structure comparison asks what dropping it from the tree asks (this
settles Mongoster's open question Q11).

## D16 — The MCP server is read-only, local and behind a token

The MCP server listens on `127.0.0.1` only, needs a bearer token kept in the secret storage, has no tool that writes,
kills an operation or changes a server setting, and gives documents and values to the AI only with
`datardo.mcp.readData`. It is off until the user turns it on. Its default port is 37018, so that Mongoster's server on
37017 can run beside it. The tools for MongoDB keep Mongoster's names; the tools for Redis start with `redis_`, and
none runs a command the assistant writes.

## D17 — redis-oplog through a linked Redis connection

Meteor apps using `cultofcoders:redis-oplog` see only the writes announced on Redis. A MongoDB connection can be linked
to a saved Redis connection, and Datardo then publishes its writes to documents there, as the package does. A Redis
error does not stop the write. The link takes the place of Mongoster's Redis URL kept per connection: the Redis server
is a connection like any other, shown under the MongoDB one, and its Pub/Sub page shows the events arriving.

## D18 — Backups in mongodump's formats, written by Datardo

Backups and restores read and write the formats of `mongodump` and `mongorestore` (folders of `.bson` and
`.metadata.json`, and the archive format, gzipped or not) with Datardo's own code, ported from Mongoster, not by
running the MongoDB Database Tools. Backups move both ways between Datardo and the tools, and nothing needs to be
installed. The cost: what the tools do and Datardo does not is left out and said.

## D19 — Scheduled tasks run inside Datardo, which is one instance

Scheduled backups and exports run while Datardo is open, in its window or in the tray; nothing is installed in the
operating system's scheduler. Datardo runs as one instance with one window: starting it again brings the window to the
front. The files of the data folder then have one writer, and Mongoster's lock between windows has no place. The cost:
no run while Datardo is closed (missed runs can run at the next start), and no second window.

## D20 — Datardo keeps its own data and starts empty

Datardo's data folder is its own. It does not read Mongoster's storage, in VS Code or in its desktop app. Connections
come over by exporting them from Mongoster and importing the file, which Datardo reads as Mongoster wrote it; saved
queries *in the folder* use Mongoster's file format, so one folder serves both. Rejected: reading Mongoster's storage
at the first start (its secrets are held by VS Code's keychain entry, and its formats carry no version).

## D21 — Every stored format carries a version from the first release

Each file Datardo writes for itself has a `version`. An older one is migrated by a function with a test that reads a
recorded old file; a newer one is never overwritten; a damaged one is kept aside under another name, the user is told,
and nothing else is deleted because of it. This answers the two ways Mongoster can lose its undo history and its
scheduled tasks to one unreadable file.

## D22 — Dependencies from a list, with their licenses checked

What runs in the product is what `package.json` lists and nothing else, bundled into the application. Adding a
dependency is a decision recorded here. Every dependency, direct or not, has a license of the allowed list (MIT, ISC,
BSD-2-Clause, BSD-3-Clause, Apache-2.0, 0BSD, BlueOak-1.0.0, CC0-1.0, and CC-BY-4.0 for the icons; the Unlicense
since [D47](#d47--the-unlicense-joins-the-allowed-licenses)), comes from the npm registry, and is pinned by the
lockfile; the notices of what is bundled are written into the installer. The list at the start: `mongodb`, `redis`, `ssh2`, `json5`, `acorn`, `chart.js`, `react`, `react-dom`, Radix Primitives, the
CodeMirror 6 packages, `@tanstack/react-virtual`, `@vscode/codicons`.

## D23 — Codicons for every icon

The icons are Codicons (`@vscode/codicons`), the set Gitardo Desktop uses, so the sibling applications look alike. They
are licensed CC BY 4.0: the About page and the notices credit them.

## D24 — Tests against real servers, and the built application driven through its window

Unit tests (Vitest) for every feature, since features are pure. Integration tests against a real `mongod` (a standalone
and a single-node replica set, started by `mongodb-memory-server`) and a real Redis server, with no mock of a driver.
Tests of the window drive the built application with Playwright, find controls by role and name and by their
`data-feature`, and run axe-core on every page. The cost: a Redis server must be found on the machine that runs the
integration tests ([testing](testing.md#throwaway-servers)).

## D25 — Windows first, then macOS and Linux

The three systems are built and tested by the CI from the first milestone, so that nothing is written for one only.
A milestone is done when its exit criteria pass on Windows; macOS and Linux are brought to the same criteria in the
milestone before the first release.

## D26 — Secrets are encrypted with a key of the system's keychain, or not kept

The secret storage is a file encrypted with Electron's `safeStorage` (DPAPI on Windows, Keychain on macOS, the secret
service on Linux). When the system offers no keychain, Datardo says so and keeps secrets in memory until it quits; it
never writes them in clear text. No secret is sent to the window process: a form shows an empty field, and an empty
field means "keep the saved one".

## D27 — The window process is a sandbox

The window process has no access to Node, to the disk or to the network. It talks to the main process through one
typed bridge, shows values from deployments as text, loads nothing from the network, and cannot navigate away. A value
in a database can therefore not run code or make Datardo write.

## D28 — These documents, and the rules they chose

The documents follow the layout of the project-spec skill, in English: product, architecture, code rules, feature
contract, platform, testing, roadmap, decisions, glossary, security, stored data, quality, risks, and the catalog of
features with one card per feature. The rules that cost work on every change were all chosen: controls carry the
identifier of their feature, every command has a card, every card has a test named after it, refusals have codes, the
Log names the feature, the settings declared are the settings documented, accessibility is checked by a test, and the
licenses of dependencies are checked. There is no `SECURITY.md` until the private channel for reports is named
([Q5](#open-questions)). *This last sentence is replaced by
[D46](#d46--a-public-repository-the-mit-license-reports-through-github), which names the channel.*

## D29 — Saved queries for me, or in the queries folder of a connection

A saved query is kept *for me*, in the data folder, or *in the folder*: a JSON file of the queries folder the user
gave the connection, one file per query, in Mongoster's format and layout, with nothing secret in it, so that a team
shares the folder through git. Datardo has no workspace, so the folder belongs to the connection.

## D30 — Numbers that are Datardo's own

Limits, defaults and timeouts are Mongoster's where it has them. The numbers Mongoster never had are chosen by Datardo
and marked *(Datardo's choice)* on their cards; they are listed together in
[features/settings.md](features/settings.md#numbers-that-are-datardos-own) so that they can be reviewed at once.

## D31 — A step says what happens when it fails

A plan stops at the first step that fails, unless that step says otherwise: *go on*, or *instead* with other steps for
the errors it names; and steps may be in groups, where a failure stops its group only. The confirmation shows all of
it. Needed by cards that Mongoster runs this way: `index.edit` (the old index is created again when the new definition
is refused), `monitor.clear-profiler`, `monitor.set-collection-balancing`, `structure.apply` (a failed step stops its
own difference), `gridfs.upload` (one file at a time). Rejected: the runner always stopping (these features would lose
their recovery), and features catching errors themselves (a feature decides, it does not run).
*Confirmed by the author on 2026-11-18.*

## D32 — Types are kept apart in the table and in what is copied

A value keeps its BSON type from the driver to the cell and back: the window holds canonical Extended JSON,
`query.format` writes `Double(5)` and `NumberLong(5)` where a plain `5` would read back as Int32, and `query.parse`
reads every constructor it writes. A document copied from the table and pasted into the insert dialog is inserted with
its types. Mongoster's table holds relaxed Extended JSON and loses them; that is its known weakness, not ported.
Rejected: keeping Mongoster's behavior for the sake of shorter text in a copy. *Confirmed by the author on 2026-11-18.*

## D33 — Closing and quitting ask about unsaved changes; drafts are for crashes

A document tab or a playground tab with unsaved changes asks before it closes, and quitting asks once for all of them
(`tab.close`, `window.quit`). The unsaved text is also kept aside as a draft, which comes back only when Datardo did
not close by itself: a crash, a kill, a forced shutdown (`tab.restore`, `window.recover`). Rejected: never asking and
always restoring (a restored edit of a document may be stale by the time it is saved).
*Confirmed by the author on 2026-11-18.*

## D34 — Removing a connection removes what Datardo keeps about it

`connection.remove` deletes the connection's secrets, its remembered state (recent queries, columns' layouts, the
console's history, playground targets), its queries saved for me, its pins and its operations of the undo history, and
its confirmation says so. Files in the user's places stay: the queries folder, backups, exports. Scheduled tasks stay
and say the connection was removed. Mongoster leaves the state behind. For a collection: a rename carries its state
along, a drop leaves it. *Confirmed by the author on 2026-11-18.*

## D35 — One line on undo, and one more question when it turns out too large

Every confirmation of a write carries the line `undo.note` gives. When what must be kept turns out over a limit while
it is read, `undo.record` asks whether to go on without the possibility to undo, before anything is written (for a
plan in batches, before the batch that passes the limit). So the user never learns after the fact that a write was not
recorded. This is Mongoster's behavior for Update many and Delete many, made the rule for every write.

## D36 — What is destructive

A plan is *destructive* (the user types a name) when it loses, beyond the undo history, something that has a name:
a database, a collection, a bucket, an index, every key matching a pattern, the destination of a copy or a restore
that drops first, the collections a structure comparison drops. Mongoster asks for several of these with one button
(`index.drop`, `index.drop-search`, `gridfs.drop-bucket`, `transfer.copy-collection`, `backup.restore`,
`structure.apply`). Writes to documents that cannot be undone only because of their size stay *confirm*, with the
line that says so. *Confirmed by the author on 2026-11-18. Its last sentence is replaced, for a write with an empty
filter, by [D39](#d39--an-empty-filter-that-cannot-be-undone-asks-for-the-collections-name).*

## D37 — Keys are exported as Redis commands

`key.export` writes a text file of Redis commands (`SET`, `HSET`, `RPUSH`, `SADD`, `ZADD`, `XADD`, `PEXPIREAT`,
and `RESTORE` for what has no command), with the extension `.redis`, which `redis-cli` can also run. It keeps the bytes
and the expiry of every key; it does not keep a stream's consumer groups. Rejected: JSON Lines (no other tool reads
it) and dumps only (tied to the server's version). *Confirmed by the author on 2026-11-18.*

## D38 — What the Redis console confirms, and what read-only refuses there

The console runs ordinary writes at once (`DEL`, `SET`): it is where the user types commands on purpose, and they are
not recorded in the undo history, which the tab says. It confirms what loses data wholesale or changes the server
(`FLUSHDB`, `FLUSHALL`, `SHUTDOWN`, `CONFIG SET`, `KEYS` on a large database), the worst by typing. On a read-only
connection it refuses every command the server flags as a write, those that change the server or other clients
without writing a key (`PUBLISH`, `CONFIG SET`, `CLIENT KILL`, `SCRIPT FLUSH`, every script), and any command it
cannot classify (`console.classify`). Datardo's own publishing for redis-oplog through a linked connection is not a
command of the user and is not stopped by that connection being read-only (`oplog.publish`).
*Confirmed by the author on 2026-11-18.*

## D39 — An empty filter that cannot be undone asks for the collection's name

A write to documents is *destructive*, and the collection's name is typed, when both hold: its filter is empty, so it
takes every document of the collection, and it will not be recorded in the undo history, because the undo history is
off in the settings or for the connection, or because what must be kept is over a limit. It concerns Update many,
Delete many and the column actions (`document.update-many`, `document.delete-many`, `field.rename`, `field.remove`,
`field.convert-type`). The cards decide it from what `undo.note` says before the confirmation; when the write was to
be recorded and turns out too large while it is read, the question of `undo.record` asks for the name in the same
way. A filter is empty when, parsed, it is `{}`: the rule reads the filter as written in the query bar, not what it
matches; a column action adds its condition on the field to it, and still reaches every document that has the field.
A pipeline
that ends with `$out` onto a collection that exists replaces it whole, and asks for that collection's name
(`aggregate.write-output`); `$merge` stays *confirm*. Every other case stays as
[D36](#d36--what-is-destructive) left it: an empty filter that will be recorded is *confirm*, and so is a filter that
is not empty, with the line that says it cannot be undone. Mongoster asks for all of these with one button. Rejected:
typing the name for every empty filter (the undo history already gives the documents back), and for every write that
cannot be undone (a filter that names its documents is a choice already made).
*Decided by the author on 2026-11-18; answers Q12.*

## D40 — The playground asks before it drops

A playground runs what its script says, and Datardo neither confirms its writes nor records them in the undo history:
the tab says so. One exception: when the script calls `dropDatabase()` or the `drop()` of a collection, also through
`runCommand` or on a database reached with `getSiblingDB`, the run waits at that call and the user types the name of
what is dropped, as for any destructive plan. Cancelled, the call is not sent and throws in the script. Every call is
asked about by itself. So the promise that what is lost for good is shown before it runs holds in the playground for
what loses the most, and a script stays a script for the rest: `deleteMany({})`, a `renameCollection` that drops its
target and a pipeline with `$out` run as written. Mongoster confirms
nothing here. Rejected: confirming every write (a script of a hundred writes would ask a hundred times), and one
confirmation of the whole script before it starts (what a script will do cannot be known without running it).
*Decided by the author on 2026-11-18; answers the first part of Q13.*

## D41 — A new user's password passes through the window, once

The password of a server user that Datardo creates or changes is typed or generated in the dialog, sent once to the
main process, and shown once after the write with **Copy password**; it is kept nowhere when the dialog and its
notification are closed, and it is written `***` in the steps, the confirmation and the Log (`user.create`,
`user.change-password`). This is the one exception to R14.3, which says so: a password the user is choosing has to be
typed somewhere, and a saved secret still never reaches the window. The threat is T21, accepted. Rejected: generating
every password in the main process and never showing it (the user must hand it to whoever will use it).
*Decided by the author on 2026-11-18; answers the first part of Q31.*

## D42 — A GridFS file opens in the system's program, for a list of extensions

**Open** writes a temporary copy of the file and hands it to the program the system has for it, only when its
extension is in the list of 22 that `gridfs.open` gives: documents, pictures, sound and archives, never a program or
a script. Every other file is downloaded where the user says, and opened by the user. The copies are deleted at
quit. An SVG is previewed as an image, where nothing runs. A document can still exploit its viewer: T20, accepted in
part, as for a file received by mail. Rejected: **Download** only (a picture stored in a bucket is opened many times
a day). *Decided by the author on 2026-11-18; answers the first part of Q32.*

## D43 — The console's history is kept on disk

The commands typed in a Redis console are remembered for each connection across starts, in the connection's state
file, up to `datardo.console.historySize` (500; 0 keeps none). Secret arguments are never written
(`console.secret-arguments`), **Clear history** empties it (`console.clear-history`), and it is deleted with the
connection ([D34](#d34--removing-a-connection-removes-what-datardo-keeps-about-it)). It holds the values the user
typed, in clear text, in the user's profile, like the undo history: T22, accepted. Rejected: memory only (the history
of a console is what makes it quick the next day).
*Decided by the author on 2026-11-18; answers the first part of Q33.*

## D44 — Datardo says when a newer version exists, and installs nothing by itself

At start, and once a day while it stays open, Datardo asks GitHub for the latest release of its repository and, when
it is newer than the one running, shows a notification with **Download**, which opens the release's page in the
system's browser (`window.check-update`). The user downloads and runs the installer. The request carries Datardo's
version and nothing about the user, the connections or the machine. It is the only call to the network that Datardo
makes by itself, and the setting `datardo.window.checkForUpdates`, on by default, turns it off (R14.9, T15); **Check
for updates** in About asks once, whatever the setting. Rejected: updating in place, which needs signed installers
([D45](#d45--the-installers-are-not-signed)); and nothing at all (a client of databases that is never updated keeps
its security fixes waiting). *Decided by the author on 2026-11-18; answers Q2.*

## D45 — The installers are not signed

No certificate is bought for now: the Windows installer is not signed, and the macOS application carries only the
ad-hoc signature that Apple silicon needs to run it, without notarization. Windows SmartScreen and macOS Gatekeeper
therefore warn at the first start, and the page of each release says how to open Datardo all the same and gives the
SHA-256 of every installer, so that a download can be checked against it. Updating in place is not possible without
signatures, and is not built (D44). The cost is known: some users will not get past the warning, and an installer
that was altered cannot be told from the real one except by its checksum (RS8, and
[what is not defended](security.md#what-is-not-defended)). Signing is taken up again by a new decision when Datardo
has users who ask for it. Rejected for now: signing from the first public release, and from M0.
*Decided by the author on 2026-11-18; answers Q3.*

## D46 — A public repository, the MIT license, reports through GitHub

Datardo's source is public on GitHub under the MIT license, like Mongoster's (`LICENSE`). A vulnerability is reported
in private through GitHub's private vulnerability reporting, the **Report a vulnerability** button of the
repository's **Security** page, as [`SECURITY.md`](../SECURITY.md) says; that file replaces the last sentence of
[D28](#d28--these-documents-and-the-rules-they-chose). The licenses allowed for dependencies
([D22](#d22--dependencies-from-a-list-with-their-licenses-checked)) all let Datardo be distributed under MIT, with
their notices in the installer. The address of the repository is given by [D48](#d48--the-repository-is-githubcomriccardoflpdatardo). Rejected: a private
repository until a release, and a license that shows the source without letting it be shared.
*Decided by the author on 2026-11-18; answers Q5.*

## D47 — The Unlicense joins the allowed licenses

`ssh2`, which D22 lists, needs `tweetnacl`, whose license is the Unlicense: a dedication to the public domain, with
no condition to meet. It is added to the licenses allowed for what Datardo bundles, and its notice ships with the
others. This adds to the list of [D22](#d22--dependencies-from-a-list-with-their-licenses-checked), which is otherwise
unchanged. Rejected: replacing `ssh2` (no other SSH client for Node does tunnels as well), and allowing `tweetnacl`
alone by name (a license allowed once is a license allowed).
*Decided while building M0, on 2026-11-18: to confirm.*

## D48 — The repository is github.com/riccardoflp/datardo

Datardo's repository is `https://github.com/riccardoflp/datardo` (its origin is
`https://github.com/riccardoflp/datardo.git`). **Documentation** and **Report an issue** in About, the check for a
newer version (`window.check-update`, which asks this repository's latest release) and `SECURITY.md` point to it. It
is written once, in `src/shared/product.ts`. This completes
[D46](#d46--a-public-repository-the-mit-license-reports-through-github), whose address was still to be given.
*Decided by the author on 2026-11-18; answers Q21.*

## D49 — A changed password of the connection's own user can be saved in the connection

When `user.change-password` changes the password of the user a connection signs in as, its notification offers
**Save in the connection**, which keeps the new password in that connection's secrets
([D26](#d26--secrets-are-encrypted-with-a-key-of-the-systems-keychain-or-not-kept)) without asking for it again. It is
offered, not done: the user may be changing it for another reason. The password still passes through the window once
([D41](#d41--a-new-users-password-passes-through-the-window-once)) and nowhere else. Rejected: leaving the saved
connection alone, which makes the next connect fail.
*Decided by the author on 2026-11-18; answers what was left of Q31.*

## D50 — A GridFS file is replaced after the new one is uploaded

**Replace** in `gridfs.upload` finds the files with the same name first, uploads the new file, and deletes the old
revisions only once the new one is complete. If the upload fails or is cancelled, the old revisions stay. For a moment
both exist, and reading by name gives the newest, which is the new one. Rejected: Mongoster's order (delete, then
upload), which loses the file when the upload fails.
*Decided by the author on 2026-11-18; answers what was left of Q32.*

## D51 — One playground at a time, and console replies as the server sends them

Two answers the cards already gave are confirmed. One playground runs at a time, in its own process, with no memory
limit of Datardo's (`playground.run`): a script that exhausts the memory ends its process and nothing else. The Redis
console shows a reply as the server sends it, secrets included (`CONFIG GET requirepass`): the user asked for it; it
is never written in the Log, in the console's history on disk or in a notification (`console.reply`,
`console.secret-arguments`). Rejected: one run per tab, a memory limit, and masking replies on screen.
*Decided by the author on 2026-11-18; answers what was left of Q13 and Q33.*

## D52 — Electron stays, after M4

Once M0 to M4 were built, the author weighed again Tauri 2 with a Rust core, the stack of Agentardo, and kept
Electron ([D1](#d1--a-desktop-application-of-its-own-on-electron) and
[D2](#d2--typescript-everywhere-mongoster-is-ported-not-rewritten-in-a-clean-room) stand). What was built is reused
whole, Mongoster's Node core (its backups and archive format, the playground's process, the MCP server) is still ported
rather than rewritten, and the UI tests drive the window on the three systems. Rejected: Tauri 2 with the window in
TypeScript and the core in Rust (about a quarter of what was built rewritten, and every later area that is not a view
written in Rust), and Tauri 2 with everything in Rust. The cost stays D1's: an installer of about 100 MB.
*Decided by the author on 2026-11-19.*

## D53 — The tree counts estimates, and a Redis database opens on its name and expands on its arrow

The tree is built as its cards say (M8). Beside each collection is its estimated count
(`estimatedDocumentCount()`, at most 5 seconds each, for the first 500 collections of a database; views, time
series and system collections have none, and a count that fails shows nothing) (`tree.count`). Clicking the name of a
Redis database, or `Enter` on it, opens its keys tab and scans nothing; only its arrow, `Right` or a double click
expands it and starts the scan (`tree.redis`, `tree.keyboard`). The databases that hold no key, other than `db0` and
the database the connection opens first, are folded under one last node **<n> empty databases** (`tree.redis`). A
prefix with one key is not a namespace: that key is found in the keys tab of its database (`tree.namespaces`).
Rejected: an exact `countDocuments` per collection (a scan of each collection when the tree opens), a scan when a
database's name is clicked, every database listed whatever it holds, and a namespace for every prefix.
*Built in M8 on 2026-11-19 as the cards say; answers Q23 unless the author decides otherwise.*

## D54 — Connections are exported in Datardo's format; Mongoster's files are still read

**Export connections…** writes Datardo's own format, Compass's, or a list of connection strings; never Mongoster's
(`connection.export`, `connection.write-file`). **Import connections…** still reads the files Mongoster 0.8.0 exports,
and a MongoDB connection of such a file with a Redis address for redis-oplog (`redisOplog.url`) is linked to the saved
Redis connection with the same host, port and user name, or to a Redis connection added for that address, named
`<host>:<port>` and put in the same folder (`connection.import`, `connection.read-file`). Rejected: writing
Mongoster's format too, which Datardo would then have to keep writing, and importing the Redis address as settings
of the MongoDB connection, which Datardo's link by id (D17) has no place for.
*Built in M7 on 2026-11-19 as Q18 proposes; answers Q18 unless the author decides otherwise.*

## D55 — The writes published for redis-oplog are those whose plan says so

A write to documents is published for redis-oplog when its plan's `publishes` is true and its MongoDB connection is
linked to a Redis connection, for the databases and collections of its scope (`oplog.publish`, `oplog.scope`): the
edits, inserts and deletes of documents, the updates and deletes of many, the restore of a version, the column
actions, the playground's writes, and the undo of documents (`undo.revert`, `undo.last`). The runner reads the `_id`s a
write by filter matches before its step, and sends the events after the steps, in the background, in the order of the
writes of each MongoDB connection. Not published, as Mongoster's README lists them: importing and generating
documents, copying a collection, restoring a backup, the writes of the comparison of two collections, GridFS, `$out`
and `$merge`, `runCommand`, and drops; their plans say `publishes: false`. Rejected: publishing every write to
documents, as Mongoster's promise says (events for writes of thousands of documents that a Meteor app would read
again one by one, and none known for `$out`, `$merge` or `runCommand`).
*Built in M11 on 2026-11-19 as the cards say; answers Q4 unless the author decides otherwise.*

## D56 — Skip and Limit are fields of the bar, an empty filter shows an estimate, and the time limit is a setting

The query bar is built as its cards say (M9). **Skip** and **Limit** are fields of their own, and the paging moves
inside their result (`query.bar`, `query.run`, `table.page-window`). An empty filter on a collection shows the count
the collection keeps of itself (`estimatedDocumentCount()`), marked as an estimate by its tooltip, and a click counts
exactly; a filter, a view or a time series collection is counted with `countDocuments` (`query.count`). The time
limit of a query is the setting `datardo.query.timeLimitSeconds`, 60 by default, and a query the server stops at it
says so with the number of the setting (`query.run`). Cells show mongosh text with its quotes (`table.cell-text`).
Rejected: the page size and the page as the only way to skip documents, as Mongoster had; an exact count of every
collection, which scans it; a fixed time limit.
*Built in M9 on 2026-11-19 as the cards say; answers Q24 unless the author decides otherwise.*

## D57 — A change of what a tab shows is a Derivation; one Datardo remembers is an Operation with an app step

The table is built as its cards say (M10). A change that only rewrites the query of the tab is a Derivation that the
window carries out and then runs the query: a header clicked sorts (`table.sort`), as a drop on the bar or the
builder writes the filter (`query.drag`, `query.builder`). A change that Datardo remembers for the collection is an
Operation whose plan has an app step that keeps it in `state/<connection id>.json`: expanding and
collapsing a column, hiding, showing, moving, pinning and resizing columns (`table.expand`, `table.collapse`,
`table.arrange-columns`). The aggregate area follows the same line when it is built: `aggregate.sort-column` is an
Operation only if what it changes is kept in a file. Rejected: every change of the view as an Operation, which would
fill the Log with sorts, and every one as a Derivation, which would leave the remembered layout without a step that
can fail and say so.
*Built in M10 on 2026-11-19 as the cards say; answers Q25 unless the author decides otherwise.*

## D58 — The undo of a key keeps its whole dump and gives back the time it had left

A write to keys is recorded with the `DUMP`, `PTTL` and `TYPE` of each key it touches, read before its steps, whatever
part of the key the write changes; the size of a key is not asked first with `MEMORY USAGE`. A write whose dumps turn
out larger than the undo history keeps asks whether to go on without undo, as D35 says. Undoing gives back each key
with `RESTORE … REPLACE` and the time it had left when it was read, not the moment it would have expired. The details
of an operation show the type, the size and the expiry of each key, not its value. Rejected: asking the size of every
key first (one more command a key, for a question the dumps already answer), and dumping only the field a write
changes (a second format of undo for each type).
*Built in M11 and M13 on 2026-11-19 as Q14 describes; answers Q14 unless the author decides otherwise.*

## Open questions

- **Q1** — *Answered on 2026-11-18 by [D7](#d7--home-is-the-first-page)*: the last active tab when tabs are restored,
  Home otherwise.
- **Q2** — *Answered on 2026-11-18 by
  [D44](#d44--datardo-says-when-a-newer-version-exists-and-installs-nothing-by-itself)*: Datardo says that a newer
  version exists, and the user installs it.
- **Q3** — *Answered on 2026-11-18 by [D45](#d45--the-installers-are-not-signed)*: not signed for now.
- **Q4** — *Answered on 2026-11-19 by [D55](#d55--the-writes-published-for-redis-oplog-are-those-whose-plan-says-so)*,
  unless the author decides otherwise: the README's list is not published, every other plan that says so is.
- **Q5** — *Answered on 2026-11-18 by [D46](#d46--a-public-repository-the-mit-license-reports-through-github)*:
  public, MIT, reports through GitHub's private vulnerability reporting.
- **Q6** — Redis Cluster and Sentinel: in which order after the first release, and whether values of module types
  (RedisJSON first) come before them.
- **Q7** — A second main island beside the first (two tabs side by side), which the layout leaves room for.
- **Q8** — Projects with environments (the same database on Local, Staging and Production, switched in one place), of
  which only **Open on another connection** exists.
- **Q9** — Letting the user change the keys of commands.
- **Q10** — Scheduled tasks for Redis (an export of keys at set times). A stored task already carries its engine
  (`task.edit`).

Raised while the catalog was written; each names the cards that hold the current answer.

- **Q11** — Is every *(Datardo's choice)* number acceptable? They are listed in
  [features/settings.md](features/settings.md#numbers-that-are-datardos-own) and tuned by the performance suite
  (RS5).
- **Q12** — *Answered on 2026-11-18 by
  [D39](#d39--an-empty-filter-that-cannot-be-undone-asks-for-the-collections-name)*: the collection's name is typed
  when the filter is empty and the write cannot be undone, and for `$out` onto a collection that exists.
- **Q13** — *Answered on 2026-11-18 by [D40](#d40--the-playground-asks-before-it-drops) and
  [D51](#d51--one-playground-at-a-time-and-console-replies-as-the-server-sends-them)*: the playground asks before it
  drops; one runs at a time, with no memory limit.
- **Q14** — *Answered on 2026-11-19 by
  [D58](#d58--the-undo-of-a-key-keeps-its-whole-dump-and-gives-back-the-time-it-had-left)*, unless the author decides
  otherwise: the whole key is dumped, its size is not asked first, and undoing gives back the time it had left.
  (`undo.record`, `undo.revert-plan`, `undo.details`, `value.edit-field`).
- **Q15** — Writes to one element of a list compare and then write in two commands; should they be one script that
  does both at once? (`value.edit-element`, `value.remove-elements`, `value.add-field`, `key.new`).
  *Built in M14 without a script, until the author decides*: the writes of strings and hashes read what they compare
  (`TYPE`, then `GET`, `HGET`, `HEXISTS`, `HPTTL` through `value.check`) and write in a second request, the steps of
  one write in `MULTI` … `EXEC` when there are several; a client that changes the value between the two is not seen.
  No `EVAL` is sent, so nothing depends on scripts being allowed on the server.
- **Q16** — With no keychain, secrets live in memory and connecting at the next start asks again. Or should saving a
  connection be refused there? (`connection.secrets`, `connection.connect`).
- **Q17** — The connection form replaces Mongoster's quick add; **Save** does not try the connection, **Save and
  connect** does. Names of connections may repeat. **Copy connection string** copies the password. There is no way
  to forget a known host. (`connection.save`, `connection.copy-string`, `connection.trust-host-key`).
- **Q18** — *Answered on 2026-11-19 by
  [D54](#d54--connections-are-exported-in-datardos-format-mongosters-files-are-still-read)*: exported in Datardo's
  format; Mongoster's files are still read, and a Redis address in one adds or links a Redis connection.
- **Q19** — Switching to a connection with no tab opens its Overview. At start only the restored active tab connects.
  One collection tab for each collection, one console tab for each connection. (`nav.current-connection`,
  `tab.restore`, `tab.same-target`).
- **Q20** — The keys chosen for commands, their macOS column, and the prefixes of Go to (`palette.commands`,
  `palette.sources`); `Ctrl+F` focuses the filter of the place that has the focus (`table.navigate`, `tree.filter`).
- **Q21** — *Answered on 2026-11-18 by [D48](#d48--the-repository-is-githubcomriccardoflpdatardo)*:
  `https://github.com/riccardoflp/datardo`.
- **Q22** — A file given to a second start is ignored: should a playground file open in a tab? On a Linux desktop
  without a tray a hidden window has no icon. The smallest window is 640 × 400. (`window.single-instance`,
  `window.tray`, `window.frame`).
- **Q23** — *Answered on 2026-11-19 by
  [D53](#d53--the-tree-counts-estimates-and-a-redis-database-opens-on-its-name-and-expands-on-its-arrow)*: The tree: an
  estimated count beside each collection; a click on a Redis database opens its keys tab and only the arrow expands
  it; databases without keys are folded under one line; a prefix with one key is not a namespace. (`tree.count`,
  `tree.redis`, `tree.namespaces`).
- **Q24** — *Answered on 2026-11-19 by
  [D56](#d56--skip-and-limit-are-fields-of-the-bar-an-empty-filter-shows-an-estimate-and-the-time-limit-is-a-setting)*:
  Skip and Limit are fields of the query bar and paging happens inside their result. An empty filter shows
  the estimated count, marked by a tooltip. The time limit of a query is a setting. Cells show mongosh text with its
  quotes, where the sketch shows plain text. (`query.bar`, `query.count`, `query.run`, `table.cell-text`).
- **Q25** — *Answered on 2026-11-19 by
  [D57](#d57--a-change-of-what-a-tab-shows-is-a-derivation-one-datardo-remembers-is-an-operation-with-an-app-step)*:
  Changes to what a tab shows (sorting from a header, switching mode, expanding a column) are written as
  Derivations in the query and table areas and as Operations with an app step in the aggregate area. One convention?
  (`table.sort`, `aggregate.sort-column`).
- **Q26** — Schema, Chart and Explain read from the server each time their section is shown; Schema analyzes the
  filter's documents also in Aggregate; a chart needs MongoDB 5.0 for histograms and dates by unit. (`schema.sample`,
  `chart.draw`, `explain.run`).
- **Q27** — Saved query files keep Mongoster's format with no version; the queries folder is the folder itself;
  **Reveal file** replaces Open File. (`saved-query.file-format`, `saved-query.choose-folder`).
- **Q28** — No notification after an edit in a cell or a save of a document tab, as in Mongoster, or one with
  **Undo**? Should a time series collection hide editing? (`document.inline-edit`, `document.save`, `table.show`).
- **Q29** — Watch changes: a restored tab comes back stopped; the filter takes a list of stages, not only a `$match`;
  the type toggles hide lines without narrowing the stream; the resume token is not kept across starts; the buttons
  keep **Copy event**. The document history's bounds stay constants. (`watch.show`, `watch.pipeline`, `watch.resume`,
  `history.read-writes`).
- **Q30** — Creating the index a slow query suggests: the advisor opens the index dialog filled in, the Monitor page
  has an operation of its own. The advisor's **Turn on** for the profiler overlaps the Monitor's control. On a
  read-only connection some pages hide the buttons that write and one disables them with a text. One rule for each.
  (`advisor.show`, `monitor.create-suggested-index`, `advisor.turn-on-profiler`, `monitor.set-profiler`).
- **Q31** — *Answered on 2026-11-18 by
  [D41](#d41--a-new-users-password-passes-through-the-window-once) and
  [D49](#d49--a-changed-password-of-the-connections-own-user-can-be-saved-in-the-connection)*: the one exception to
  R14.3; the new password of the connection's own user can be saved in the connection.
- **Q32** — *Answered on 2026-11-18 by
  [D42](#d42--a-gridfs-file-opens-in-the-systems-program-for-a-list-of-extensions) and
  [D50](#d50--a-gridfs-file-is-replaced-after-the-new-one-is-uploaded)*: **Open** stays for a list of extensions;
  replacing uploads first.
- **Q33** — *Answered on 2026-11-18 by [D43](#d43--the-consoles-history-is-kept-on-disk) and
  [D51](#d51--one-playground-at-a-time-and-console-replies-as-the-server-sends-them)*: the history is on disk;
  replies are shown as the server sends them.
- **Q34** — Pub/Sub: one row for the messages of one redis-oplog event; 10,000 messages kept where Watch changes
  keeps 1,000; an empty channel prefix follows every message of the server. The Server page shows the configuration
  without changing it, and says *master* and *replica*. (`pubsub.event-rows`, `pubsub.keep`, `pubsub.follow-oplog`,
  `server.config`, `server.replication`).
- **Q35** — MCP: with `datardo.mcp.readData` off, names of Redis keys are still returned, as structure; the tools
  about Datardo's writes are named `datardo_writes` and `datardo_write_details`; `redis_oplog_status` keeps its name;
  the JSON field named after read-only keeps Mongoster's spelling in what an assistant receives. (`mcp.read-data`,
  `mcp.debugging-tools`, `mcp.data-model-tools`).
- **Q36** — Comparisons read the documents to copy before the confirmation, so that the plan shown is the plan run;
  with very many differences that is a large read before asking. Search has no time limit, only **Stop**. The
  interface says *relations* where the glossary says reference for one kind of them. (`compare.make-like`,
  `search.scan`, `relation.diagram`).
- **Q37** — Scheduled tasks: retention deletes old outputs without a confirmation, as in Mongoster. Confirm once when
  a task that keeps a number of outputs is saved? (`task.retention`).
- **Q38** — The texts that are new in Datardo (where Mongoster had none, or where its words named VS Code) need a
  reading by the author: each card marks them in **Ported from**.
- **Q39** — Scheduled tasks need facts of the disk (the folder exists, which names are taken, what is at each
  output path) that no Read card gives; the main process passes them as answers. Should a Read card of the task area
  exist? Neither **Reveal** in a notification nor the output link on the page has a feature to show a file in the
  file manager. The place of **Keep running in the tray** on the Settings page is on no card. The field names of
  `tasks/tasks.json` and `tasks/<id>.json` are not yet in [data.md](data.md). (`task.run`, `task.retention`,
  `task.notify`, `task.tray`).
- **Q40** — Chart and Code: the **Code** button of the Chart section has no place on the card, so it carries no
  element; the message of a stage that cannot be read in the Chart section is not on the card; saving the picture
  needs a question that chooses a file, which the questions do not have yet (a text field stands in for it); is
  **Copied to the clipboard** a notification or a line of the status line? (`codegen.show`, `chart.draw`,
  `chart.save-picture`, `codegen.copy`).
- **Q41** — The Redis console: the confirmation of `EXEC` lists the queued commands as steps that run nothing, so
  that the dangerous one is shown; is there a better form? The fallback of `HELLO` matches the errors `NOPROTO` and
  `ERR unknown command` by their start. What the server says of a command's flags is remembered with the runner's
  remembered reads, per connection and per opening, not in the console's own state. The count of keys shown in a
  confirmation (`DBSIZE`, or `INFO keyspace` for `FLUSHALL`) is a read with no card. (`console.run`,
  `console.connect`, `console.command-flags`, `console.classify`).
- **Q42** — The pipeline editor: the names of collections that exist come from the read of Go to, not from
  `manage.read-options`; a read that fails (the count of a run, the check of an output collection) fails the whole
  read today, where the cards want the total left unknown or the collection taken as existing; the editor kept in a
  tab is a stored shape of its own; running while one stage is shown starts the run again after setting the pipeline,
  because a read cannot change the tab; the commands that move a stage need the stage that has the focus.
  (`aggregate.run`, `aggregate.write-output`, `aggregate.save-as-view`, `aggregate.move-stage`).
- **Q43** — Redis values: `value.check` also sends the reads that compare a value before a write (from a fixed list
  of commands that read), where the card names only `TYPE`; the text of a step cuts a long argument as `value.quote`
  does (over 256 bytes, 64 shown) while the runner cuts at 200 characters; a stream ID not greater than the last is
  left to the server's error, with no code; **Copy as command** writes one line per key, without the batches of
  `key.export-text`; the shape that tells the undo history what a write keeps is to settle with M11. (`value.check`,
  `value.quote`, `value.add-entry`, `value.copy`).
- **Q44** — Redis keys: an import that stops at a refused line and removes its key needs "instead, then stop",
  which the failure rules of D31 do not have; `key.new` asks one fixed form, since a question cannot show fields by
  type; `key.export` scans the pattern before the file dialog, so "nothing to export" comes first; the texts of a
  pattern keep the backticks of the card; the **Pin** of the row menu and the **Connect** of the keys page carry no
  element, since `nav.pin` and `connection.connect` do not list those places; `MULTI` and `EXEC` as separate steps
  need the runner to keep one client for the tab. (`key.import`, `key.new`, `key.export`, `key.show`).
- **Q45** — The query bar and the table: some buttons stand on places their cards do not list (**Explain** and
  **Code** in the table's toolbar, **Run again** and **Reconnect** in the empty state, **Cancel** in the query bar),
  so they carry the nearest listed place; in YAML `y` and `n` are written without quotes, as the card's example
  needs; a UUID of subtype 3 is written as `BinData`, and an `ISODate` without an offset is read as UTC; the button of
  the columns counts the hidden columns of the page shown; **Export** in the row menu needs every selected document to
  have an `_id`; **Watch** is not offered on a view. (`table.show`, `query.bar`, `table.copy-as`, `query.parse`,
  `table.columns`, `table.row-menu`).
- **Q46** — The Redis Server page: the share of memory is rounded up (the card's 97.49% reads 98%); times show their
  two largest units and drop a second unit of 0; the first click on Age, Idle, Subscriptions or Memory sorts the
  largest first; with the Memory section chosen, `INFO keyspace` is read too, to fill the Database menu; the notice of
  a client disconnected needs an After that depends on the reply of its step, which plans do not have.
  (`server.memory`, `server.clients`, `server.kill-client`).
- **Q47** — Documents: no notification follows an inline edit or a save; `7.0` typed in a Long field stays a Long;
  the document tab, the inspector's text and **Duplicate** write one field per line at every depth, as Mongoster did;
  text that cannot be read asks the question again with the reader's message, with no refusal code;
  `document.update-selected` uses the refusal codes of `document.update-many`; writes have 30 seconds for one
  document and 600 for many; the messages that depend on a write's result need the runner to give a plan the replies
  of its steps. (`document.inline-edit`, `document.save`, `document.update-selected`, `document.delete`).
- **Q48** — Saved queries: `..` as a folder name becomes `_`, as the rule says, where an acceptance line says `._`;
  the fields of a query file Datardo does not know are not kept on rewrite, as `saved-query.parse-file` says, where
  [data.md](data.md) says they are; saving over a folder query of the same name with no connection replaces it in
  place; moving to my queries replaces one of the same name without asking; choosing the folder needs a question
  that opens the system's folder dialog. (`saved-query.file-path`, `saved-query.parse-file`, `saved-query.save`,
  `saved-query.move`, `saved-query.choose-folder`).
- **Q49** — The undo history: the fingerprints and BSON sizes of what a write keeps are computed by the main
  process, since features cannot hash or serialize BSON; the record is made in two calls, before the steps and after
  them; a read-only connection counts as one whose history is off; **Undo all** or **unchanged only** is one choice
  with the button **Undo**; operations whose file is missing are dropped at start; the writes that are not published
  to redis-oplog are those of Mongoster's list, and each plan's `publishes` decides (Q4); a document whose fields were
  only reordered shows no changed field. (`undo.record`, `undo.note`, `undo.revert`, `undo.limits`, `oplog.publish`,
  `undo.details`).
- **Q50** — Pub/Sub: subscribing while not connected only adds the names, which reconnecting subscribes to; the
  channels are three reads, so that a refusal of one leaves the others; the filter searches messages as they are
  shown; **Export** writes only the messages listed, not those held by a pause, and a gap as a record of its own;
  **Copy as PUBLISH command** is never cut; several texts are new (the subscribe form, **Subscribe again**, **Show
  every message**, **Filter channels**); the notice of a publish needs the reply of its step. (`pubsub.subscribe`,
  `pubsub.channels`, `pubsub.filter`, `pubsub.export`, `pubsub.copy`, `pubsub.publish`).
- **Q51** — Playgrounds: one run at a time across every tab, with no memory limit in the pure code (a process that
  dies reads "may have run out of memory"); a file not seen before opens on the current MongoDB connection and the
  active tab's database, else `test`; a lazy aggregate cursor with `$out` or `$merge` is refused when it is read;
  saving a saved file with no change does nothing; the engine needs sessions, transactions, cursors kept by id and
  more methods of a collection for the playground process. (`playground.run`, `playground.open-file`,
  `playground.save`, `playground.runtime`).
- **Q52** — Schema and Explain: MongoDB 8.2 runs `$group` inside the query engine, so `$match`, `$group`, `$sort`
  lists only `$sort` after the query, where `explain.show` expects `$group` and `$sort`; the time limit of an explain
  is the command's own `maxTimeMS`, since 8.2 ignores one inside the explained command; a Long in the statistics of
  an explain is left out; `NumberLong(1200)` and `Long("1200")` are both written today and must agree; **Create…**,
  **Validation rules…**, **Expand all** and **Collapse all** have no place on their cards. (`explain.show`,
  `explain.run`, `explain.raw`, `schema.show`).
- **Q53** — Export, import and backup: generated and imported ObjectIds come from the time and a salt, so that plans
  stay pure; the seed of generated data is the one typed, else one drawn by the runner; a restore is undone collection
  by collection; dropping the destination or existing collections cannot be undone; the last folder used is not
  remembered; [data.md](data.md) is left as it is, since archives and exported files are the formats of mongodump and
  mongoexport, not files of Datardo. (`transfer.generate`, `transfer.import`, `backup.restore`,
  `transfer.copy-collection`).
- **Q54** — The document history and Watch changes: **Pause**, **Stop** and **Clear** are steps of the application,
  since the page's state changes only through a step, where the cards say "no step"; the whole deployment is watched
  as `admin` with no collection; Go to **Watch changes** on a view's tab watches its database; an error shows the
  state **Stopped**, a fifth state; most writes show as retryable, since drivers retry by default; **Open document**
  in the history's toolbar has no place on `document.open`. (`watch.pause`, `watch.stream`, `watch.show`,
  `history.show`).
- **Q55** — Connections organized: a name already taken on import is one pick-one list (**Skip**, **Replace**,
  **Keep both**) with the button **Import**, since a question has one button; the copy notice closes after the
  runner's 6 seconds, not 4; the host key is confirmed inside the connect action, and a reconnection, a scheduled
  task or an MCP tool never asks; the reads of import and export can be started by the window, so it can read the
  clipboard through `connection.import:source`, which the bridge cannot yet tell apart from a read of its own;
  renaming a folder does not keep it collapsed on Home; copying a connection whose string is missing is an error, not
  nothing. (`connection.import`, `connection.copy-string`, `connection.trust-host-key`, `connection.rename-folder`).
- **Q56** — The tree: places no card lists (**Create database…**, **Open GridFS bucket**, **Open console**, the
  hover buttons, **Collapse all**) use the tree's own; tree.md names `manage.edit-view` and `manage.edit-validation`
  where the cards are `manage.definition` and `manage.validation`; the limits are Datardo's (10 seconds for the lists,
  10,000 collections, 5 seconds a count and a `SCAN`, 200 namespaces then "<n> more namespaces"); the rows are not
  virtualized; **Move up** and **Move down** of a pin are a drag and `Alt+Up`/`Alt+Down`, since the pinned item's menu
  has only **Open** and **Unpin**. (`tree.mongodb`, `tree.redis`, `tree.namespaces`, `tree.pinned`, `nav.pin`).
- **Q57** — Collections, fields and indexes: the options of a collection are kept as canonical Extended JSON, so
  that their types survive; the 63-byte limit of a database name is checked when the form is answered; Go to on the
  wrong kind of tab asks to pick instead of refusing; the references found for a database are not forgotten until
  relations exist; notices after a field change count what was planned, not what was modified. (`manage.read-options`,
  `manage.create-database`, `manage.definition`, `manage.drop-database`, `field.rename`).
- **Q58** — *Proposed, to be decided by the author before M11 is built.* Many cards say what follows a write from
  the server's reply ("Deleted 2 of 3 documents; the others were already gone", the `_id` an insert was given, "2
  clients received it", the key that was not there any more), but a plan's **After** is fixed before its steps run.
  The proposal: an Operation may also export `afterReplies(context, answers, replies)`, pure, which the runner calls
  with the replies of the plan's engine steps, in order, once they have all run; it returns the **After** that
  replaces the plan's own, or a refusal shown as a warning. The pure cores of documents, keys, values, the Server page,
  Pub/Sub and indexes already export it (some as `afterReply` of one reply). Rejected so far: an **After** that names
  a field of a reply (a small language of its own), and a second plan started after the first (a confirmation per
  write). It changes [the feature contract](feature-contract.md) and the runner. (`runner.run`, `document.delete`,
  `key.delete`, `pubsub.publish`, `server.kill-client`).
- **Q59** — Users and GridFS: **Copy password** carries the generated password in the button of the notification, so
  it stays in the window's state until the notification closes, where a handle held by the main process would be
  safer (T21); the step text writes `db.getCollection("fs.files")` where the cards write `db.fs.files`; the folder of
  an opened GridFS copy is named from the whole key when it is short, else a part of it and a digest, so that two
  files with one name never share it; the old revisions replaced by an upload are read before the plan; each uploaded
  file is a group of its own; user commands and bucket requests have 30 seconds. (`user.generate-password`,
  `gridfs.drop-bucket`, `gridfs.open`, `gridfs.upload`).
- **Q60** — Search, relations, comparisons and structures: a search in Contains mode uses the `u` flag; a boolean
  matches only as a whole value; a reference that leads nowhere plans nothing; the documents to copy are read before
  the confirmation; rule 7 of `structure.steps` is followed where its example disagrees on `{ name: "status_1" }`;
  search indexes are taken as unsupported on the codes 31082, 59, 115, 40324 and 6047401; reads of several requests
  are written in two styles, to make one. (`search.match`, `relation.follow`, `compare.make-like`, `structure.steps`,
  `structure.read`).
- **Q61** — The MCP server: the protocol (JSON-RPC 2.0 over Streamable HTTP, without SSE or sessions) is written by
  hand, with no SDK; a tool that fails answers an error result, not a refusal; the data tools write
  `NumberDecimal("9.99")` as the query bar does, where the card writes `Decimal128("9.99")`; the setup dialog's button
  is **Choose**; turning the server off and the default port are written as no value; the times of `write_history`
  keep their milliseconds, so that writes in one second stay in order; watching needs a `watch` method of the engine
  that keeps its session. (`mcp.protocol`, `mcp.data-tools`, `mcp.setup`, `mcp.change-port`, `mcp.debugging-tools`).
- **Q62** — The Monitor page and the Index advisor: the line of slow queries counts every operation read, not those
  the filter keeps; a group gets **An index could help** when it has a suggestion; with the server's log, or with no
  database chosen, slow queries are read with `profile -1` on `admin` and `getLog`; reading the replica set or the
  balancer again 1 or 1.5 seconds after a change needs an **After** that waits, which there is not; reads of several
  steps (databases then their statistics, `hello` then the replica set) need the runner to chain them; changing the
  balancer is refused on a connection that is not a mongos; turning on the profiler from the advisor reads the
  threshold first. (`monitor.slow-queries`, `monitor.read-slow-queries`, `monitor.step-down`, `monitor.set-balancer`,
  `monitor.read-database-stats`, `advisor.turn-on-profiler`).
- **Q63** — The engine: a MongoDB request may name the session it runs in (`MongoRequest.session`), for the
  sessions and transactions of playgrounds (Q51); cursors, change streams and sessions are kept by the engine by id,
  at most 100 for each client, all closed with it; errors carry their code, its name and its labels as plain values,
  so that a feature can tell code 40573 or `TransientTransactionError`. (`playground.sessions`, `watch.stream`,
  `playground.runtime`).
- **Q64** — The undo history as built in M11: the confirmation of an undo is titled by its plan, **Undo: \<title\>**,
  where the card of `undo.revert` writes **Undo "\<title\>" in \<connection\> › \<database\>.\<collection\>?**, since a
  confirmation's title is its plan's; the read of an undo connects first a connection that is not connected, the
  details of a row do not; the row of the Undo history page expands from a button on its operation (a click on the
  row still does), since a table row cannot carry `aria-expanded`; before a write by filter, `oplog.publish` reads
  the matching `_id`s itself rather than taking those `undo.record` keeps; an operation file written for an operation
  that the index then cannot take (a newer index) stays until the index can be written again.
  (`undo.revert`, `undo.details`, `undo.show`, `oplog.publish`, `undo.record`).
- **Q65** — The keys tab as built in M13: the tabs of one connection share its client, which sends `SELECT` when a
  request names another database than the last, where `key.switch-database` says each tab has a client of its own
  that sends `SELECT` once; the requests of one read (`key.details`, `key.inspect`) are sent one after the other, not
  as one pipeline; the messages that depend on a reply (`RENAMENX` answering 0, an `UNLINK` or `PERSIST` that changed
  nothing, *Deleted 35 of 37 keys*) wait for Q58, their pure `afterReply` being tested alone; the notification of an
  export is sent by its writer, which knows how many keys it wrote and whether a stream had consumer groups, and has no
  **Show in folder**, since no feature shows a file in the file manager (Q39); the progress of an export, and of the
  scan to the end that `key.delete-by-pattern` and `key.export` start, is the work in progress and its **Cancel**, not
  a text of the status line; the delete by pattern that is not recorded is an action of the main process, which scans
  again and unlinks what each reply gives, since a plan cannot scan; after a rename the table scans again, so the row
  does not keep its place; a click on a database of the tree carries `key.switch-database@tree` while the active tab shows the keys of
  another database of the same connection, and `key.show@tree` otherwise; a click on a pinned key carries
  `key.open@tree` where the other pinned items carry `tree.pinned@tree`; in the menu of the database of the path, the
  present database starts `key.show@scope-bar` and the others `key.switch-database@scope-bar`, and **Switch
  database…** in Go to lists the databases the tree read last, which the window adds to the command; the keys of the
  table (`Enter`, `F2`, `Delete`, `Ctrl+C`, a click on a header) start their features from the grid, which carries
  their identifiers in one attribute; an import reads files of at most 512 MB, a number of Datardo's own (Q11).
  (`key.switch-database`, `key.details`, `key.rename`, `key.export`, `key.delete-by-pattern`, `key.show`, `key.open`,
  `key.import`).
- **Q66** — The pipeline editor as built in M19: the cards of the aggregate area quote the parser's messages as JSON5
  words them (*JSON5: invalid end of input at 1:11*), where `query.parse` words them its own way, so the area keeps
  its own reader of mongosh syntax (`src/features/aggregate/mongosh`), which other areas import too, while its
  suggestions are those of `query.autocomplete`; a start in the **After** of a plan gives its result to no control,
  so the Operations that change what the table shows (`aggregate.clear`, `aggregate.show-stage`,
  `aggregate.drop-condition`, `aggregate.sort-column`) leave the run of the pipeline to the window that started them,
  and the window starts `aggregate.write-output` itself for a pipeline that writes, to learn whether it was written,
  cancelled or refused; the step of a pipeline is written `db.orders.aggregate([{ … }], …)`, as every step that sends
  an array, where the cards write `[ { … } ]`; **Run** while a stage is shown shows the whole pipeline and runs it;
  a command of the editor from Go to on a tab in Find switches it to Aggregate first, and **Move stage left** or
  **right** acts on the stage whose body has the focus, or on none; after a pipeline that wrote, the status line
  says it through its notification; in Aggregate the total comes with each page and a click on it counts nothing
  more; the number of a stage is named by its tooltip, the number being seen, not said; the marks of a card are
  written as words on it; the lines about **Recent** wait for `saved-query.recent` (M20), and **Explain**, **Code**
  and the Chart section for their milestones. (`aggregate.show`, `aggregate.run`, `aggregate.write-output`,
  `aggregate.clear`, `aggregate.show-stage`, `aggregate.drop-condition`, `aggregate.sort-column`,
  `aggregate.stage-marks`, `aggregate.from-text`).
- **Q67** — Playgrounds as built in M28, the run: Datardo chose the least surprising behavior where the cards are
  silent, to be confirmed. The script runs in a `node:vm` context inside the process of the run, whose environment
  holds only the system's temporary folders: the vm keeps the runtime's names apart, and the boundary of T6 is the
  process, not the vm. `playground.run` returns once the run has started: the run is its own work on the status line,
  so that the runner's queue is free for the questions the run asks (a drop) and for **Stop**. The process is a
  utility process of Electron (`utilityProcess`), started for each run with no memory limit (D51). (`playground.run`,
  `playground.runtime`, `playground.stop`).
- **Q68** — Playgrounds as built in M28, the values: an integral double a script reads stays a double when it is
  written back (`Double`), while a number typed in the script is written as an `Int32` when it is integral, as mongosh
  writes it; `NumberLong`, `NumberDecimal`, dates, `ObjectId` and binary values cross between the process and Datardo
  as canonical Extended JSON. (`playground.runtime`, `playground.results`).
- **Q69** — Playgrounds as built in M28, publishing: for redis-oplog a `bulkWrite` reads, before and after it, the
  documents whose `_id` its operations name or its reply gives; an operation by filter in a bulk write is not
  published. An insert without an `_id` is given one in Datardo before it is sent, so that its `_id` is known.
  (`oplog.playground-writes`, `playground.writes`).
- **Q70** — Playgrounds as built in M28, saving: before the file step, `playground.save` tries the file (opened to
  append, or made then removed in its folder) and refuses with `/save-failed` when it cannot be written; a write that
  fails after that check is reported as failed with the same message. Quitting Datardo does not yet ask about the
  playgrounds with unsaved changes, because `window.quit` asks nothing about tabs yet (its card's question comes with
  `tab.close` in M4); the draft of such a playground is kept, so its text comes back at the next start. A playground
  never saved that comes back with no draft opens with the example script on `test`. (`playground.save`,
  `window.quit`, `tab.restore`).
- **Q71** — Playgrounds as built in M28, the page: the editor's lines are 24 px apart, so that each **Run** button is a
  target of 24 px (R10.5); the text typed goes to the main process 300 ms after the last key, and at once before a
  run, a save or a command of Go to; the list of autocomplete also opens after a `.`; a playground file in **Jump
  back in** opens through `playground.open-file`; the menu of a playground tab ends with **Save as…**; **Cancel** of a
  run on the status line carries `playground.stop@status-line`. `Ctrl+Enter` of a playground is a key of its editor
  (the window's `Ctrl+Enter` is `query.run`'s), and `Ctrl+Shift+Enter` in the editor runs the statement at the caret.
  (`playground.show`, `playground.autocomplete`, `playground.open-file`, `playground.save`, `playground.stop`).
- **Q72** — The documents as built in M12, while the runner gives no Operation its replies (Q58): the notification
  of a write is the one known before it runs, so **Delete**, **Delete the selected rows** and **Delete many** say the
  count confirmed (*Deleted 3 documents from people.*), **Update many** says *Updated orders: 12 matched.* without
  the count modified, an insert of documents without `_id` says *Inserted 1 document into people.*, and the lines
  *Deleted 2 of 3 documents…*, *The value changed again…* and *Document not found…* after a write are not reached
  (their `afterReplies` are written and tested); the tab of a new document becomes the tab of the inserted document
  when its text names the `_id`, and closes otherwise, since the `_id` the server gives is in a reply. Apart from
  Q58: the `_id`s the server gives to inserted documents reach `undo.record` from the replies, so that undoing such an
  insert deletes them; the engine refuses a write that carries a BSON undefined or a date beyond the range of
  JavaScript, with nothing sent, since the driver would write a null or cannot hold the date (an undo of such a
  document fails the same way); a question may carry `about`, plain values for the dialog a feature draws itself
  (the insert dialog, the form of **Update many**); a document tab carries `newDocument` and `view` in the saved
  tabs, optional fields that need no new version; its draft is kept by `tab.restore` started with `{ tab, draft }`,
  and **Save** in the question of `tab.close` starts `document.save` or `document.insert-from-tab` from the main
  process; the editor of a value takes the text the window sends with the start; **Copy as** in a document tab
  starts `table.copy-as` with no place, since no card names a place for it there; a failed insert from the insert
  dialog opens the dialog again from its error notification, with the text and the error; a collection tab always has
  something to inspect, so that the main process, which has no inspection of the window's page, offers
  `nav.toggle-inspector` there; the title of a new document's tab, *people · New document 1*, is never cut.
  (`runner.run`, `nav.toggle-inspector`, `tab.title`, `document.delete`, `document.delete-many`, `document.update-many`, `document.insert`, `document.insert-from-tab`,
  `document.inline-edit`, `document.open`, `undo.record`, `tab.restore`, `tab.close`).
- **Q73** — The Server page as built in M17: `server.slow-log` and `server.show:slow-log` both open the page on its
  Slow log section and both cards title them **Server: Slow log**, but Go to lists no two commands with one title, so
  `server.slow-log` is titled **Slow log**; **Find largest keys** of Go to opens the page on Memory and leaves a
  remembered ask (an `After` of the kind `remember`) that the page follows once, when the databases are known, since a Read cannot
  start a search that runs call after call in the window; the notifications of `server.kill-client` that depend on
  its reply (*Disconnected client 42.*, *Client 42 was already gone.*) wait for Q58, their pure `killNotification`
  being tested alone, and the page reads the clients again once the Operation ran; the page asks `CLIENT ID` with a
  Read of its own, `server.show:client-id`; the section and the choices are kept with the tab by `server.show` with
  `{ section }` or `{ choices }`, an Operation whose app step is `tab.activate`, as D57 says of a change Datardo
  remembers (the choices once they stayed unchanged for 600 ms, and only while the tab is the active tab); a read
  that fails for another reason than a refusal of the server (a connection lost) puts its message in the part's
  error line as the sentence *other*; a second click on **Duration** puts the slow log back in the server's order;
  **Keys per database** and the configuration have rows that can be selected, shown whole in the inspector island,
  while the rows of **Where the overhead goes** cannot; the requests of the largest keys of one reply of `SCAN` are
  sent one after the other, as Q65 says of the keys tab; the search is run in the window, with **Cancel** beside its
  line rather than in the status line. (`server.show`, `server.slow-log`, `server.largest-keys`,
  `server.kill-client`, `server.clients`, `server.config`, `server.overview`).
- **Q74** — The tabs of the Server page keep their choices in `session.json` as `memory.choices`, text by name (at
  most 40, of at most 1,000 characters each). The field is optional and a file without it is read as before, so the
  version of the file is unchanged and no migration is added; the author may prefer a new version with its recorded
  old file (`server.show`, `tab.restore`).
- **Q75** — The values of strings and hashes as built in M14, where the cards say otherwise or say nothing: Go to
  lists `value.copy` as **Copy Redis value**, since `table.copy-value` is already **Copy value** and Go to keeps one
  row a title; the commands of values have no keys of their own: `F5` is the key of **Refresh keys**, which a key tab
  carries out as `value.refresh`, and `Ctrl+S` is the string editor's; the form of **Add field** has **Field as** and
  **Value as** (**Text**, **JSON**, **Hex**) beside its two fields; a refusal closes the form, so *already has a field
  named* is shown as the refusal of the write and not under **Field** with the form open, and the field added is not
  put first and selected: the table is read again in the server's order; a confirmation of a write is titled by the
  name the undo history gives it (**Edit orders:42**), its question in its text, as in M13; closing the question
  **Overwrite** or **Create again** answers the window `cancelled`, so the window, not the feature, says *Not saved:
  the value changed in the database.*; the steps of one write in `MULTI` … `EXEC` are sent on the client the tabs of
  the connection share (Q65), where a request of another tab sent at the same moment could be queued inside the
  transaction; text typed and not saved does not mark the key tab as unsaved, since the window has no way to say so,
  so closing the tab does not ask (D33), while **Refresh** asks through its arguments; an empty string shows *Empty
  string.* with no editor, so it cannot be typed into; the format chosen in the inspector island is the one of the
  column, shared with the table; the compact form does not repeat **Open in a tab**, which is among the key's buttons
  above it; lists, sets, sorted sets and streams show their table read-only with **Load more**, their toolbars coming
  with M15. (`value.copy`, `value.refresh`, `value.save-string`, `value.add-field`, `value.edit-field`,
  `value.rename-field`, `value.remove-fields`, `value.show`).
- **Q76** — The Redis console as built in M16: after a command that writes, the tree and the keys tabs are read
  again even when the server answered with an error, and every time, not at most once a second, since a plan does not
  see the reply (Q58); `SELECT` of the saved database and `CLIENT SETNAME` (for a server without `HELLO`) are steps of
  the main process on the console's own client, since an engine step names the connection's ordinary client; a refusal
  is shown under its line in the output and also as every refusal is (`runner.refuse`); *The console's connection
  closed.* and *Connected again on db6.* are entries of the output that follow no command; a line that cannot be read
  is written in the output by its words, each secret argument `***`; the console's client sends `KEYS`, which the
  ordinary client refuses, since the user typed it after its count was confirmed; a command answered with an error is
  written in the Log as `error in 12 ms: WRONGTYPE`, its code alone, since a reply is never logged (D51); **Copy
  value** and a click on a line take its last string; Go to lists **Copy console reply**, **Copy console value** and
  **Copy console command**, since **Copy value** is the table's; the database menu of the toolbar lists the databases
  the tree island read, and only the console's own database while it has read none; the line of a reply selected for
  the inspector island carries `aria-current`, since a line of the output is not an option.
  (`console.run`, `console.connect`, `console.output`, `console.copy-reply`, `console.show`).
- **Q77** — Go to and the saved queries as built in M20: `palette.sources` lists the saved queries of every saved
  MongoDB connection (its acceptance line finds those of Staging, which is not connected), where
  `saved-query.connection-list` and `saved-query.run` say *the current connection*; Go to lists every one, and a
  query of another connection than the current one reads its connection's name first: *Staging / shop.orders · Me*.
  A row of Go to has no line for the query on one line, and is found by its name and its context (so by its
  collection), not by its description. The window reads `saved-query.connection-list` for each saved MongoDB
  connection when Go to opens and again when its queries change, and hands it the databases and collections its tree
  last read (`args.databases`, which the reply gives back). (`palette.sources`, `saved-query.connection-list`).
- **Q78** — `saved-query.run` as built in M20: the run of the query is the window's, as for `aggregate.clear` (Q66):
  its app step opens or activates the tab and puts the query in the app's state (the event `loaded`
  of the saved-query part, which the main process keeps until it quits); the window then shows it in the query bar
  or the pipeline editor and runs it as the run button does, once the connection is connected. The query builder is
  not filled from a find loaded this way. A recent query is added after a find or a pipeline run from the bar (the
  run button, `Enter`, **Reset**, the mode switch, a loaded query) and after `aggregate.write-output`, not after a
  page turn or **Refresh**, which run the query as last run. (`saved-query.run`, `saved-query.recent`).
- **Q79** — The queries folder dialog as built in M20: the system's folder dialog is a Read of its own,
  `saved-query.choose-folder:dialog`, which the main process answers with the folder or `null`; the question a save
  asks first, which has no field, answers `true` under its key (`Question.key`, `saved-query.choose-folder`), since
  the runner answers a question by its fields. The dialog may create a folder. (`saved-query.choose-folder`,
  `runner.ask`).
- **Q80** — Pins and saved queries as built in M20: a pin of a saved query keeps its place and, for one in the folder,
  the path of its file, for one for me the query itself, as optional fields of a pin of `pins.json`, version 1 (a
  new optional field keeps the version, data.md); a pin follows its query renamed or moved and goes with it deleted,
  through an app step of the same plan (*pin "Paid" in place of "Old" on Local*, *unpin "Paid"
  on Local*), shown only when the query is pinned; the pin of a file that is no longer in the folder is taken away
  when the folder is read again. The **Pin** entry of the **…** menu has no element of its own. (`nav.pin`,
  `saved-query.rename`, `saved-query.move`, `saved-query.delete`, `saved-query.connection-list`).
- **Q81** — The rest of M20: **Save query…**, **Save query in the folder…** and **Clear recent queries** are offered on
  any collection tab, **Choose the queries folder…** when the current connection is a MongoDB connection; a file step
  of the queries folder fails with what failed first (*Could not save the query in the folder:*, *Could not rename
  the query:*, *Could not delete the query:*, *Could not move the query:*) and the system's reason; the warning about
  the files skipped is given once per folder, with **Reveal file** on the first connection that has it; a queries
  folder that does not exist yet is watched once Datardo has written in it; `connection.remove` reads first what the
  data folder keeps of the connection (the read `connection.remove:counts`, which the main process answers).
  (`saved-query.save`, `saved-query.clear-recent`, `saved-query.choose-folder`, `saved-query.read-folder`,
  `connection.remove`).
- **Q82** — Manage collections and fields as built in M21, the reads with no card: the counts of
  `manage.drop-collection` take the names of the indexes from a read of their own,
  `manage.drop-collection:indexes` (`getIndexes`), the sample of `manage.validation` is the read
  `manage.validation:sample` (a `$sample` of 1,000 documents, summed up by `schemaSummary`), and the count of the
  values still not converted after `field.convert-type` is the read `field.convert-type:left`, started by the After
  of the write; each is named as a variant of the card that uses it and kept in a `reads/` folder, since no card
  names them (`manage.drop-collection`, `manage.validation`, `field.convert-type`).
- **Q83** — `field.convert-type` as built in M21, while the runner gives no Operation its replies (Q58): the
  notification *Converted `<field>` to `<type>` in `<k>` documents of `<collection>`.* gives the count confirmed
  before the write, and the line *`<j>` values couldn't be converted and kept their type.* comes as a second
  notification, a warning, from the count read after the write, since the first is shown before that count is
  known; the second has no **Undo**, which stays on the first (`field.convert-type`, `undo.notification`).
- **Q84** — `manage.rename-collection` as built in M21: the collection's tab is not closed and opened again under
  the new name, it is changed in place to show the new name (the tabs' `shows-changed`), so that it keeps its place
  in the tab strip, its id and with them the query that was run and its section; the other tabs on the old name
  stay, as the card says. The references are not forgotten, since `relation.detect` is not built yet (M34); the saved
  queries *for me* and the recent queries are moved through the stores the main process keeps of them (`manage.rename-collection`, `tab.open`, `tab.close`, `saved-query.save`).
- **Q85** — `manage.edit-view` and `manage.edit-validation` as built in M21: Go to offers them while the active tab
  shows the Definition or the Validation section of a connection that is not read-only; whether the text differs
  from what was read is known only in the window, which leaves **Save** disabled and makes `Ctrl+S` and the command
  do nothing when it does not. **Read-only** is said by the status line, as for every page; the section's toolbar
  does not repeat it (`manage.edit-view`, `manage.edit-validation`, `manage.definition`, `manage.validation`).
- **Q86** — Go to keeps one row a title, and M14's `value.rename-field` and M21's `field.rename` were both **Rename
  field…**: Go to lists the first as **Rename hash field…**, as Q75 did for **Copy Redis value**; the row menu of the
  hash keeps **Rename field…** (`value.rename-field`, `field.rename`).
- **Q87** — GridFS as built in M33, the transfers: Datardo chose the least surprising behavior where the cards are
  silent, and the author may decide otherwise. An upload starts with an app step that checks the files on the disk,
  which stops it before anything is deleted or written when a file chosen is gone or has another size; the chunks of a
  file are written by an app step of their own, which refuses itself on a read-only connection (the runner's guard asks
  only of engine steps) and does not stop the insert of the chunk being sent, so that **Cancel** is read before the next
  chunk and no insert lands after the chunks are deleted; an insert of a chunk, and that deletion, may take 30 s. A
  download is read through the driver's `GridFSBucket` with the engine's methods `openDownload`, `readDownload` and
  `closeDownload`, a download kept like a cursor; the folder of a copy of `gridfs.open` is made when it is missing, and
  the copies a quit could not delete are deleted at the next start. A file or an app step that takes long says how far
  it is (`progress` of the runner's ports, the `detail` of a work in progress, at most every 200 ms) and stays
  cancellable when it is a plan's only step; when it is cancelled it may say its own text in place of how far the plan
  went (`Cancelled` carries `said`: *Download cancelled.*, *Uploaded 1 file (717 KB) to Local › shop › fs, cancelled.*).
  An upload of several files whose one group fails on the server goes on with the others, and its notification is the
  one known before it ran, with the runner's warning naming the steps that failed. (`gridfs.upload`, `gridfs.download`,
  `gridfs.open`, `runner.progress`, `runner.cancel`, `runner.notify`).
- **Q88** — GridFS as built in M33, the page: a text field of a question may carry the part of its default that is
  selected when it opens (`selection`), which `gridfs.rename` uses for the name up to its extension; the save dialog of
  a download opens in the home folder; the page reads only while its connection is connected, and every refresh of
  the connection (any write made through Datardo) reads it again and forgets the previews; `↑` and `↓` select the row
  above and below, `Shift+F10` opens the menu of the selected row, and the `…` buttons are reached with the mouse only;
  the status line keeps its own **Read-only** with its own tooltip (`nav.status-line`). In Go to, **Upload files to
  GridFS bucket…** is `gridfs.upload` (two commands never share a title), and the commands of the area are offered
  when the active tab is the page of a bucket (`gridfs.create-bucket` when it is of another place of a database): those
  of a file act on the selected row and do nothing with none, and **Open GridFS bucket** shows the bucket's tab again.
  (`gridfs.show`, `gridfs.rename`, `gridfs.download`, `palette.run-command`, `nav.status-line`).
- **Q89** — The values of lists, sets, sorted sets and streams as built in M15, where the cards say otherwise or say
  nothing; each is the least surprising behavior found, until the author decides: Go to lists **Add scored member…**
  and **Remove scored members…**, since **Add member…** and **Remove members…** are the set's and Go to keeps one row
  a title; the forms of **Push…**, **Add member** of a set and of a sorted set have **Element as** or **Member as**
  (**Text**, **JSON**, **Hex**) beside their field, as **Add field** has (Q75); the form of **Trim…** of a list has no
  live *Keeps N of M* line under it, since a form of the runner cannot compute one, and its confirmation says what is
  removed; an ID typed in **Add entry** is compared, before `XADD`, with the `last-generated-id` of `XINFO STREAM` and
  refused as `/invalid` with *The ID must be greater than the last one, 1700000000000-4.*, and with `*` or `ms-*` the
  notification says *Added an entry to events.*, not the ID the server gave, which a plan does not see (Q58); for the
  same reason the notifications of **Remove…** of members, **Delete entries** and **Trim…** of a stream give the counts
  known before the write, and their texts from the reply exist and are tested but are not reached, as in Q72; after
  **Push…**, **Add member** and **Add entry** the table is read again from its first page with nothing selected (Q75),
  except a new entry with **Newest first**, which is selected; the marker of **Remove…** of elements is drawn by the
  window (32 hexadecimal digits from `crypto.getRandomValues`) and passed as `args.marker`; the commands of values are
  offered in every key tab and do nothing on a value of another type; a double click on the **Member** of a sorted set
  says *A member cannot be changed: remove it and add another.*, as for a set; a sorted set whose read fails is read
  again with the older commands after any failure, not only one that names `REV` or `BYSCORE`; the form of **Add
  entry** and of **Add a copy…** is drawn by the window from the question's `about`, as the insert dialog is; the rows
  of the groups, consumers and pending entries are chosen with buttons in their first cell (`aria-pressed`), and the
  tab **Entries** of the section bar carries no `data-feature`; a pending ID is shown by reading **Entries** from that
  ID to that ID, the entry selected; the problem line under a toolbar uses `--color-danger`, which M14 drew in
  `--color-danger-text`, unreadable in the light theme. (`value.push-element`, `value.trim-list`, `value.add-member`,
  `value.add-scored-member`, `value.remove-scored-members`, `value.remove-members`, `value.remove-elements`,
  `value.add-entry`, `value.delete-entries`, `value.trim-stream`, `value.read-sorted-set`, `value.change-score`,
  `value.stream-groups`, `value.show`).
- **Q90** — *Open, for the author.* The setup of the MCP server as built in M29: the brief of the milestone spoke of a
  one-step setup that writes the configuration files of the common assistants after showing what will be written,
  while the card `mcp.setup` only copies the command for Claude Code or the JSON configuration to the clipboard. M29
  follows the card: Datardo reads and writes no file of another application. Writing an assistant's file would be an
  outward-facing action, to be confirmed each time; whether to add it, for which assistants and where their files
  are, is for the author to decide, in a card of its own. (`mcp.setup`).
- **Q91** — *Open, for the author.* The tools offered as built in M29: a tool is offered only once its feature is
  built (the roadmap's rule), so seven of the 42 tools are left out of `tools/list` and answered as unknown tools
  until their milestones: `open_explain` (`explain.show`, M23), `open_watch` (`watch.show`, M27), `index_advice`
  (`advisor.show`, M30), `open_monitor` and `sharding_status` (`monitor.show`, M30), `describe_relations`
  (`relation.detect`, M34) and `open_search` (`search.show`, M34). The roadmap names the monitor, the advisor, the
  relations and the search; the explain and watch tabs are held back by the same rule. The server's instructions name
  only the tools offered. Each milestone that builds one of these features adds its tool back to
  `src/features/mcp/index.ts › waitingTools`. (`mcp.read-data`, `mcp.performance-tools`, `mcp.deployment-tools`,
  `mcp.data-model-tools`, `mcp.tab-tools`).
- **Q92** — The MCP server in the main process as built in M29, where the cards say nothing: the tools of Redis use
  the connection's own client, which names the database of each request (Q65), so that the database of the user's
  tabs never moves; every request a tool sends passes a guard of its own before it leaves (the methods and commands
  that read, `profile` only as `-1`, `CONFIG GET` only of `slowlog-log-slower-than`, a pipeline without `$out` or
  `$merge`), which answers *Datardo's MCP server only reads: <command> was not sent.*; the line *New access token: the
  old one no longer works* is written by the server under the source **MCP** rather than by the plan of
  `mcp.access-token`; the entries of the setup dialog carry their elements (`mcp.log@dialog`,
  `mcp.change-port@dialog`, `mcp.access-token@dialog`) on their radio buttons; the accessible name of the top bar's
  **MCP** button is its tooltip (*MCP server: off. Click to set it up.*), and its dot is
  `mcp.status@top-bar`. (`mcp.server`, `mcp.access-token`, `mcp.setup`, `mcp.status`).
- **Q93** — Export, import, copy and backups as built in M25, the runner: Datardo chose the least surprising
  behavior where the cards are silent, to be confirmed. The steps whose documents come from a file, a query, an import
  or generated values are engine steps with a feed (`FedStep`): the runner reads the feed through a port of the main
  process and sends each batch as the step's `insertMany` or `bulkWrite`, looks at **Cancel** between two batches and
  never in the middle of one, and counts each document refused with code 11000 as a duplicate and any other as failed;
  the steps fed from one archive run together, so that the file is read once. The message that ends a copy, an import,
  a generation or a restore is written by its feature from what the runner counted (`fedSummary`), not from replies
  given to the feature: this is apart from Q58, which stays to be decided. The writers of an export and of a backup
  send their own notification, done, cancelled or failed, as the writer of `key.export` does (Q65), and the runner then
  says nothing of its own. A plan of one file step that writes stays cancellable while it runs. An import is cut into
  steps of 1,000 documents, each fed with its documents, so that the progress reads *1,000 of 2,500*; a copy that
  replaces documents reads, before each batch, the documents it replaces for the undo history, and asks the question
  of `undo.record` when they go past its limits; a restore records one operation per collection and leaves out a
  collection of more than 10,000 documents; **Undo** is offered in the notification when one operation was recorded,
  also on a warning. The engine reads a query's documents as stored, in bytes (`cursorNextBytes`), so that an export, a
  copy and a backup keep every type and byte. (`runner.run`, `transfer.copy-collection`, `transfer.import`,
  `transfer.generate`, `transfer.export`, `backup.create`, `backup.restore`, `undo.record`).
- **Q94** — Export, import, copy and backups as built in M25, the features: the system's file dialogs are reads of
  the application, one action for each of the two areas, each starting in the folder last chosen in its area
  while Datardo runs, then in the home folder; a dialog closed ends the feature with nothing done and nothing said.
  **Open** and **Reveal** of an export, and **Copy mongorestore command** and **Reveal file** or **Reveal folder** of a
  backup, start the feature again with the path in its arguments, which gives one step of the application. A backup to
  a folder is one file step, written by the writer of `backup.create`, where the card lists a step per file: the
  folder is made first, never one that exists, and **Cancel** or a failure deletes it whole. An export to CSV started
  with no columns (from the tree) reads the query twice, once for the columns of every document and once to write.
  From the table, an export carries the query as last run, or the pipeline up to the stage shown, the page and the
  count shown, and the columns as drawn; **Export 2 documents…** and the entry of a row carry the `_id`s of the
  rows. A copy, a generation and a backup refuse a connection that is not connected with *Could not connect to
  \<name\>: not connected*, its reason when the connection gave one, rather than connecting first. In a restore,
  *Not restored* stays a sentence of its own, after the counts. (`transfer.export`, `transfer.import`,
  `transfer.copy-collection`, `transfer.generate`, `backup.create`, `backup.restore`, `backup.folder-layout`).
