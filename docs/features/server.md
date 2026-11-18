# Server

The Server page of a Redis connection: what the server is and how it is doing, the clients connected to it and
disconnecting one, the slow log and clearing it, where the memory goes and which keys are the largest, the state of
replication, and the configuration, which is read-only in the first release. The page has six sections, chosen in
the section bar: **Overview**, **Clients**, **Slow log**, **Memory**, **Replication** and **Configuration**. Each
section is a View with the Reads behind it; the two things the page writes, disconnecting a client and clearing the
slow log, are Operations with their own cards.

The page of the same kind for a MongoDB connection is the Monitor page (`monitor.show`), whose toolbar, automatic
refresh and sentences this page follows.

Every command of this page exists since Redis 4.0 or earlier, so no supported server (6.2 or later) is too old for
them. What changes with the version is the fields a reply has: each card says which, and a field the server does not
give is shown as `—`. Servers that answer the same commands only in part (Valkey, KeyDB, Dragonfly, a managed
service that turns `CONFIG` off) get the sentence of `server.unavailable` in the section whose command they refuse,
and the other sections work.

The examples use the connections **Cache local** (allows writes) and **Cache production** (read-only).

### `server.show` — The Server page

One page tab per Redis connection that shows the state of its server, a section at a time, read again on demand or
by itself every few seconds.

- **Kind**: View
- **Engine**: Redis
- **Function**: `src/features/server/show.ts › view(state)`
- **Entry points**: **Server** under **Pages of** the connection in the tree island (`@tree`); Go to (**Server**,
  and **Server: Overview**, **Server: Clients**, **Server: Slow log**, **Server: Memory**, **Server: Replication**,
  **Server: Configuration**).
- **Offered when**: the current connection is a Redis connection. Opening the page connects it when it is not
  connected (`connection.connect`).
- **Reads**: `CLIENT ID` once, on the connection's ordinary client, to know which row of the Clients section is
  Datardo's own. Then the Reads of the section shown.
- **After**: the tab is titled **Server** in the group of its connection, and its path is `Cache local / Server`. A
  second request for the same connection makes the open tab active and, when a section was asked for, shows that
  section.
- **Commands**: `server.show`, `server.show:overview`, `server.show:clients`, `server.show:slow-log`,
  `server.show:memory`, `server.show:replication`, `server.show:configuration`.
- **Uses**: `server.overview`, `server.clients`, `server.slow-log`, `server.memory`, `server.replication`,
  `server.config`, `server.unavailable`, `tab.open`, `tab.restore`, `nav.inspector`, `nav.status-line`,
  `connection.read-only`.
- **Ported from**: *New in Datardo*. The toolbar, the automatic refresh and its numbers are those of Mongoster's
  server monitor (README, *Server monitor*; `src/webview/monitor.ts › setAuto`).

What the page shows, from the top:

1. The section bar (`@section-bar`): **Overview**, **Clients**, **Slow log**, **Memory**, **Replication**,
   **Configuration**. The first time the page opens it shows **Overview**; later it shows the section it showed
   last.
2. The toolbar (`@toolbar`): **Auto** with **Off**, **2 s**, **5 s** and **15 s** (5 s to start with), **Refresh**,
   and the time of the last read, *14:02:11*.
3. The section.

Refreshing:

| What | Commands | When it is read |
| --- | --- | --- |
| Everything of the section | | when the section is chosen, and with **Refresh** |
| Overview | `INFO` | also at every automatic refresh |
| Clients | `CLIENT LIST` | also at every automatic refresh |
| Slow log: the entries | `SLOWLOG GET 1000`, `SLOWLOG LEN` | also at every automatic refresh |
| Slow log: the threshold | `CONFIG GET slowlog-log-slower-than` | only when the section is chosen and with **Refresh** |
| Memory: the numbers | `MEMORY STATS` | also at every automatic refresh |
| Memory: the advice | `MEMORY DOCTOR` | only when the section is chosen and with **Refresh** |
| Memory: the largest keys | `SCAN`, `MEMORY USAGE`, `TYPE` | only with its own button (`server.largest-keys`) |
| Replication | `INFO replication` | also at every automatic refresh |
| Configuration | `CONFIG GET *` | only when the section is chosen and with **Refresh** |

The automatic refresh pauses by itself: it happens only while the tab is the active tab and the window is visible,
and a read that has not been answered yet is not sent again. Coming back to the tab reads the section at once when
more than the interval has passed. A reply that arrives after a newer request for the same thing was sent is
dropped. The section, **Auto**, the filters, the sort of each table and the choices of each section are kept with the
tab and restored with it (`tab.restore`).

Every command of the page is sent on the connection's ordinary client, and none of them changes a key or a setting,
but `CLIENT KILL` and `SLOWLOG RESET` of the two Operations.

States:

- **Loading**: the section keeps what it showed, and the status line shows the read in progress.
- **Error**: a Read that fails puts the server's message in an error line at the top of the part it feeds; the other
  parts of the section and the other sections are not affected.
- **A command the server does not allow**: the sentence of `server.unavailable` in that error line; the controls
  that need the command are disabled, with the sentence as their tooltip.
- **Read-only**: the status line shows **Read-only**; **Disconnect…** and **Clear…** are disabled with *The
  connection Cache production is read-only.* as tooltip. Everything else works.

Selecting a row of any table of the page shows it whole in the inspector island, every field the server gave with
its value, with **Copy** (`nav.inspector`); `Esc` clears the selection.

Acceptance:

- [ ] Opening **Server** on Cache local opens one tab titled **Server** in Cache local's group; opening it again
  makes that tab active and opens no second one.
- [ ] Go to, **Server: Slow log**, opens the page on **Slow log**, also when the tab is already open on another
  section.
- [ ] With a MongoDB connection current, neither the tree island nor Go to offers **Server**.
- [ ] With **Auto** at **5 s** and the Overview section shown, `INFO` is sent every 5 seconds while the tab is
  active, and not at all while another tab is active or the window is minimized.
- [ ] With **Auto** at **Off**, nothing is read until **Refresh** or a change of section.
- [ ] In the Memory section an automatic refresh sends `MEMORY STATS` and neither `MEMORY DOCTOR`, `SCAN` nor
  `MEMORY USAGE`; **Refresh** sends `MEMORY STATS` and `MEMORY DOCTOR`.
- [ ] In the Configuration section an automatic refresh sends nothing.
- [ ] A reply to a request older than the last one sent for the same part does not change what is shown.
- [ ] A server that refuses `CONFIG` shows the sentence of `server.unavailable` in the Configuration section and in
  the threshold line of the Slow log section; the entries of the slow log and the other sections are shown.
- [ ] On Cache production **Disconnect…** and **Clear…** are disabled with *The connection Cache production is
  read-only.*, and the status line shows **Read-only**.
- [ ] After a restart of Datardo the restored tab shows the section, **Auto** and the filters it had.

### `server.unavailable` — What a section shows when its command cannot run

Turns the server's refusal of a command into a sentence that says whether the user lacks a permission or the server
lacks the command.

- **Kind**: Derivation
- **Engine**: Redis
- **Function**: `src/features/server/unavailable.ts › unavailableSentence(command, error)`
- **Uses**: `server.show`, and every Read of this page.
- **Ported from**: *New in Datardo*. The two sentences are built as those of the Monitor page for a command the
  server does not allow.

Inputs: the command as the page sent it, without its arguments but with its subcommand (`CLIENT LIST`, `MEMORY
DOCTOR`, `CONFIG GET`); the error reply of the server. Output: a sentence, a kind (*not allowed*, *not there*,
*loading*, *other*), and whether the read is tried again at the next automatic refresh.

Rules, by how the reply starts, without case:

| The reply starts with | Kind | Sentence | Tried again by itself |
| --- | --- | --- | --- |
| `NOPERM` | *not allowed* | *CLIENT LIST needs a user that may run it: <the server's message>* | no |
| `ERR unknown command` or `ERR unknown subcommand` | *not there* | *This server does not allow CLIENT LIST: <the server's message>* | no |
| `LOADING` | *loading* | *The server is loading its data and does not answer CLIENT LIST yet: <the server's message>* | yes |
| anything else | *other* | the server's message | yes |

A read of the kind *not allowed* or *not there* is sent again only with **Refresh** and when the section is chosen
again: the answer does not change by itself. *Not allowed* is what an ACL user without the command gets (`NOPERM`,
Redis 6.0 and later). *Not there* is a server older than the command, another server that does not have it, or a
command renamed or turned off (`rename-command`, a managed service).

Examples:

| Command | Reply | Sentence |
| --- | --- | --- |
| `CLIENT LIST` | `NOPERM this user has no permissions to run the 'client' command or its subcommand` (Redis 6.2) | *CLIENT LIST needs a user that may run it: NOPERM this user has no permissions to run the 'client' command or its subcommand* |
| `CLIENT LIST` | `NOPERM User app has no permissions to run the 'client\|list' command` (Redis 7) | *CLIENT LIST needs a user that may run it: NOPERM User app has no permissions to run the 'client\|list' command* |
| `CONFIG GET` | `ERR unknown command 'CONFIG', with args beginning with: 'GET' '*'` | *This server does not allow CONFIG GET: ERR unknown command 'CONFIG', with args beginning with: 'GET' '\*'* |
| `MEMORY DOCTOR` | `ERR Unknown subcommand or wrong number of arguments for 'DOCTOR'. Try MEMORY HELP.` (Redis 6.2) | *This server does not allow MEMORY DOCTOR: ERR Unknown subcommand or wrong number of arguments for 'DOCTOR'. Try MEMORY HELP.* |
| `INFO` | `LOADING Redis is loading the dataset in memory` | *The server is loading its data and does not answer INFO yet: LOADING Redis is loading the dataset in memory* |
| `SLOWLOG GET` | `ERR something else` | *ERR something else* |

Acceptance:

- [ ] Each row of the examples gives its sentence.
- [ ] After a `NOPERM` for `CLIENT LIST` with **Auto** at **2 s**, `CLIENT LIST` is not sent again until **Refresh**
  or until the section is chosen again.
- [ ] After a `LOADING` for `INFO` with **Auto** at **2 s**, `INFO` is sent again 2 seconds later.
- [ ] A user allowed `INFO` and nothing else sees the Overview and the Replication sections whole, and the sentence
  in each of the four others.

### `server.read-info` — Read INFO

What the server reports about itself, as named values the sections show.

- **Kind**: Read
- **Engine**: Redis
- **Function**: `src/features/server/read-info.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: the Overview section (`INFO`) and the Replication section (`INFO replication`).
- **Reads**: `INFO`, which gives the default sections; or `INFO replication` for that one section.
- **Uses**: `server.overview`, `server.replication`, `server.unavailable`.
- **Ported from**: *New in Datardo*.

Rules of `parse`:

1. The reply is text; its lines end with a carriage return and a line feed. An empty line is skipped.
2. A line that starts with `# ` opens a section, named by the rest of the line: `# Memory`.
3. Any other line is `field:value`, split at its first `:`. The value is kept as text and read as a number only
   where a card says so: a field that is missing or is not a number is shown as `—`, never as 0.
4. In `# Keyspace`, a line is `db0:keys=1204,expires=310,avg_ttl=86400000`: the database, then pairs separated by
   commas (Redis 7.4 adds `subexpiry`; a pair that is not known is kept and not shown).
5. In `# Replication`, a line `slave0:ip=10.0.0.6,port=6379,state=online,offset=1234,lag=0` is a replica, with its
   pairs.
6. A field met twice keeps its last value. Fields and sections that are not known are kept, and are in the inspector
   island when their tile is selected.

Acceptance:

- [ ] `redis_version:7.2.4` in `# Server` gives the field `redis_version` with the value `7.2.4`.
- [ ] `db0:keys=1204,expires=310,avg_ttl=86400000` gives the database 0 with 1,204 keys, 310 with an expiry and an
  average TTL of 86,400,000 ms.
- [ ] `executable:/usr/bin/redis-server` and `config_file:C:\redis\redis.conf` keep everything after their first `:`.
- [ ] A reply with no `# Keyspace` lines gives no databases, and the Overview says *No keys.*
- [ ] `INFO replication` gives only the fields of `# Replication`.
- [ ] A server that refuses `INFO` gives both sections the sentence of `server.unavailable` and no values.

### `server.overview` — The Overview section

The server at a glance: what it is, how long it has run, its memory, its clients, how much it works, how well its
keys are found, how many keys each database has, and whether its data is being saved.

- **Kind**: View
- **Engine**: Redis
- **Function**: `src/features/server/overview.ts › view(state)`
- **Entry points**: **Overview** in the section bar of the Server page (`@section-bar`).
- **Reads**: `server.read-info` with `INFO`, at every refresh.
- **Uses**: `server.read-info`, `server.unavailable`, `nav.inspector`, `key.show`.
- **Ported from**: *New in Datardo*.

What it shows: tiles, then the table of the databases. Each number is the field of `INFO` named beside it.

| Tile | Shows | Fields of `INFO` |
| --- | --- | --- |
| **Version** | *7.2.4*, and under it the operating system and the port. A server that names itself shows its name and its own version first: *valkey 8.0.1 · answers as Redis 7.2.4*. | `redis_version`; `os`, `tcp_port`; `server_name` with `valkey_version` |
| **Mode** | *standalone*, or *sentinel*. (A server in the mode *cluster* is refused when connecting.) | `redis_mode` |
| **Role** | *master*, with *2 replicas* under it; or *replica of 10.0.0.5:6379*, with *link up* or *link down* under it. | `role` (`master`; `slave` is shown as *replica*), `connected_slaves`; `master_host`, `master_port`, `master_link_status` |
| **Uptime** | *3 d 5 h* | `uptime_in_seconds` |
| **Memory** | *1.2 GB of 4.0 GB (30%)* with a bar, or *1.2 GB · no limit*; under it *peak 1.9 GB* and the eviction policy, *allkeys-lru*. | `used_memory`, `maxmemory` (0 is no limit), `used_memory_peak`, `maxmemory_policy` |
| **Clients** | *340 connected*, and under it *2 blocked · up to 10,000*. | `connected_clients`, `blocked_clients`, `maxclients` |
| **Commands per second** | *1,250*, and under it *in 96.2 KB/s · out 410.5 KB/s*. | `instantaneous_ops_per_sec`; `instantaneous_input_kbps`, `instantaneous_output_kbps` |
| **Hit rate** | *93.4%*, and under it *934 hits · 66 misses since the server started or its statistics were reset*. | `keyspace_hits`, `keyspace_misses` |
| **Keys** | *1,204,311 in 3 databases*, and under it *12,400 expired · 0 evicted*. | the `keys` of every line of `# Keyspace`; `expired_keys`, `evicted_keys` |
| **Persistence** | The lines of the rules below. | `loading`, `rdb_bgsave_in_progress`, `rdb_last_bgsave_status`, `rdb_last_save_time`, `rdb_changes_since_last_save`, `aof_enabled`, `aof_rewrite_in_progress`, `aof_last_bgrewrite_status`, `aof_last_write_status` |

The table **Keys per database**, from `# Keyspace`, one row per database that has keys: **Database** (`db0`),
**Keys** (`keys`), **With an expiry** (`expires`), **Average TTL** (`avg_ttl`, milliseconds, written as a time; `—`
when it is 0). A double click on a row opens the keys tab of that database (`key.show`).

Rules of the numbers:

1. Sizes are written with units of 1,024 and one decimal: `512 B`, `1.5 KB`, `1.2 GB`; the tooltip has the bytes,
   *1,288,490,188 bytes*. Counts have a separator of thousands.
2. A time is written with its two largest units among `d`, `h`, `min` and `s`: `3 d 5 h`, `4 h 12 min`, `12 min 5 s`,
   `42 s`.
3. The share of the memory limit is `used_memory / maxmemory`, rounded to a whole percent; the bar is yellow from
   80% and red from 95% *(Datardo's choice)*. With `maxmemory` 0 there is neither share nor bar.
4. The hit rate is `keyspace_hits / (keyspace_hits + keyspace_misses)` as a percentage with one decimal, and `—`
   when both are 0.
5. Persistence, each line shown only when it applies:
   - `loading` 1: *Loading the dataset from disk.*, in the warning color;
   - `rdb_bgsave_in_progress` 1: *Saving a snapshot now.*;
   - `rdb_last_bgsave_status` not `ok`: *The last snapshot failed.*, in the error color;
   - always: *Last snapshot 12 min ago · 1,204 changes since.* (`rdb_last_save_time`, a Unix time in seconds, as the
     time since; `rdb_changes_since_last_save`);
   - `aof_enabled` 0: *Append-only file off.*; 1: *Append-only file on.*, with *Rewriting it now.* when
     `aof_rewrite_in_progress` is 1 and *The last rewrite failed.* or *The last write to it failed.*, in the error
     color, when `aof_last_bgrewrite_status` or `aof_last_write_status` is not `ok`.
6. `rejected_connections` above 0 adds under **Clients**, in the warning color, *37 connections were refused: the
   limit of clients was reached.*

Fields by version: `maxclients` is given from Redis 6.2; `server_name` only by the servers that name themselves.
Any field a server does not give is `—`, and its tile is still shown.

Examples:

| Fields | Shown |
| --- | --- |
| `used_memory:1288490188`, `maxmemory:4294967296` | *1.2 GB of 4.0 GB (30%)* |
| `used_memory:1288490188`, `maxmemory:0` | *1.2 GB · no limit* |
| `used_memory:4187593113`, `maxmemory:4294967296` | *3.9 GB of 4.0 GB (98%)*, the bar red |
| `keyspace_hits:934`, `keyspace_misses:66` | *93.4%* |
| `keyspace_hits:0`, `keyspace_misses:0` | `—` |
| `keyspace_hits:0`, `keyspace_misses:5` | *0.0%* |
| `uptime_in_seconds:277920` | *3 d 5 h* |
| `uptime_in_seconds:42` | *42 s* |
| `role:slave`, `master_host:10.0.0.5`, `master_port:6379`, `master_link_status:down` | *replica of 10.0.0.5:6379*, *link down* in the error color |

Acceptance:

- [ ] Each row of the examples shows what it says.
- [ ] A server with `db0:keys=1204,…` and `db3:keys=7,…` shows *1,211 in 2 databases* and a table of two rows; a
  double click on `db3` opens the keys tab of db3.
- [ ] A server with no keys shows *No keys.* in place of the table.
- [ ] A server whose `INFO` has no `maxclients` shows *340 connected* and `—` for the limit.
- [ ] With `rdb_last_bgsave_status:err` the Persistence tile shows *The last snapshot failed.* in the error color.
- [ ] With `aof_enabled:0` the tile shows *Append-only file off.* and nothing about a rewrite.
- [ ] Selecting the **Memory** tile shows every field of `# Memory` with its value in the inspector island.
- [ ] A user whose ACL denies `INFO` sees *INFO needs a user that may run it: …* in place of the tiles.

### `server.read-clients` — Read the connected clients

The clients connected to the server, as rows of the Clients section.

- **Kind**: Read
- **Engine**: Redis
- **Function**: `src/features/server/read-clients.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: the Clients section.
- **Reads**: `CLIENT LIST`.
- **Uses**: `server.clients`, `server.unavailable`.
- **Ported from**: *New in Datardo*.

Rules of `parse`:

1. The reply is text, one client per line. A line is pairs `field=value` separated by spaces; a value may be empty
   (`name=`) and holds no space.
2. Per client: `id`, `addr` (its address and port), `laddr` (the server's address it reached), `name`, `user`, `db`,
   `age` and `idle` (seconds), `flags`, `cmd` (its last command, in lower case, as `client|list` from Redis 7.0),
   `sub`, `psub` and `ssub` (its subscriptions), `multi` (the commands queued in a transaction, -1 when none),
   `tot-mem` (bytes), `omem` (the bytes waiting to be sent to it), `resp`, `lib-name`, `lib-ver`.
3. A field the line does not have is missing, not 0. By version: `user`, `tot-mem` from 6.0; `laddr` from 6.2;
   `ssub`, `resp` from 7.0; `lib-name`, `lib-ver` from 7.2.
4. Every other field of the line is kept, for the inspector island.
5. The client whose `id` is the one `CLIENT ID` answered to this page is marked as the page's own. A client whose
   `name` starts with `datardo` is marked as Datardo's (`datardo-console`, `datardo-pubsub`, and the connection's
   ordinary client).

Acceptance:

- [ ] The line `id=42 addr=10.0.0.7:52144 laddr=10.0.0.2:6379 fd=8 name=orders-api age=3600 idle=3 flags=b db=0 sub=0
  psub=0 multi=-1 cmd=blpop user=app tot-mem=22298` gives the client 42 with each of those values.
- [ ] `name=` gives an empty name, shown as `—`.
- [ ] A line without `laddr`, as a Redis 6.0 server writes it, gives a client with no local address and all its
  other fields.
- [ ] A field that is not known (`io-thread=1`) is in the inspector island of its row and in no column.
- [ ] A server that refuses `CLIENT LIST` gives the Clients section the sentence of `server.unavailable` and no
  rows.

### `server.clients` — The Clients section

Who is connected to the server, what each is doing, and **Disconnect…** on each.

- **Kind**: View
- **Engine**: Redis
- **Function**: `src/features/server/clients.ts › view(state)`
- **Entry points**: **Clients** in the section bar of the Server page (`@section-bar`).
- **Reads**: `server.read-clients`, at every refresh.
- **Uses**: `server.read-clients`, `server.kill-client`, `server.unavailable`, `nav.inspector`.
- **Ported from**: *New in Datardo*.

What it shows:

1. A toolbar (`@toolbar`): a filter with the placeholder **Filter by address, name, user or command**; **Idle ≤** a
   number of seconds (empty to start with: every client); and the count, *12 of 340 clients · 14:02:11* (shown,
   read, and the time of the read).
2. The table, one row per client: **ID** (`id`), **Address** (`addr`), **Name** (`name`, with the mark **Datardo**
   for Datardo's own clients and **this page** for the page's own), **User** (`user`), **DB** (`db`), **Age**
   (`age`) and **Idle** (`idle`), both written as a time, **Command** (`cmd`), **State** (from `flags`, below),
   **Subscriptions** (`sub` + `psub` + `ssub`, with *2 channels, 1 pattern* as tooltip; empty when 0) and **Memory**
   (`tot-mem`, as a size).
3. The context menu of a row and its `…` button (`@row-menu`): **Disconnect…** (`server.kill-client`), **Copy
   address**, **Copy row**.

**State** writes the letters of `flags` as words, separated by commas: `N` nothing; `S` *replica*; `M` *master*; `P`
*subscriber*; `O` *monitor*; `x` *in a transaction*; `b` *blocked*; `d` *watched key changed*; `t` *tracking*; `c`
and `A` *closing*; `r` *read-only*; `U` *unix socket*; `e` *not evicted* (7.0); `T` *no-touch* (7.2). A letter that
is not in this list is written as it is.

The table is sorted by **ID** to start with; a click on a column header sorts by it, a second click the other way.
The filter looks, without case, in the address, the name, the user, the command and the state. A row selected stays
selected across refreshes by its `id`, and leaves the inspector island when its client is gone.

Acceptance:

- [ ] A client with `flags=xb` shows *in a transaction, blocked*; one with `flags=N` shows nothing; one with
  `flags=Nq` shows *q*.
- [ ] The filter `blpop` shows the clients whose last command is `blpop`, and the count reads *3 of 340 clients*.
- [ ] **Idle ≤** `10` shows the clients idle for 10 seconds or less.
- [ ] `age=3725` is shown as *1 h 2 min*.
- [ ] The row of the connection the page reads with has the marks **Datardo** and **this page**, and its
  **Disconnect…** is disabled with *This is the connection Datardo reads this page with. Use Disconnect in the
  connection island.*
- [ ] With 10,000 clients the table draws only the rows on screen, and sorting by **Memory** puts the largest
  first.
- [ ] On a Redis 6.0 server, which gives no `laddr`, the table is the same and the inspector island has no local
  address.
- [ ] A user whose ACL denies `CLIENT` sees *CLIENT LIST needs a user that may run it: …* and no table.

### `server.kill-client` — Disconnect a client

Closes the connection of one client of the server.

- **Kind**: Operation
- **Engine**: Redis
- **Function**: `src/features/server/kill-client.ts › plan(context, answers)`
- **Entry points**: **Disconnect…** in the context menu of a row of the Clients section and on its `…` button
  (`@row-menu`); **Disconnect…** in the inspector island when a client is selected (`@inspector`).
- **Offered when**: the connection is not read-only and the client is not the page's own. While the disconnection of
  a client runs, its **Disconnect…** is disabled.
- **Plan**: one step, `CLIENT KILL ID 42`, with the `id` as `CLIENT LIST` gave it. The title is **Disconnect client
  42?**
- **Danger**: Confirm: **Disconnect client 42?**, under it the client as *10.0.0.7:52144 · orders-api · user app ·
  idle 3 s · last command blpop*, then *Its connection is closed at once, and a transaction it had open is
  discarded. Most clients connect again by themselves.* For a client whose state is *replica*: *This client is a
  replica: it will connect again and may copy the whole dataset.* For one whose state is *master*: *This is the
  link to the master: this server stops replicating until it connects again.* The button is **Disconnect**.
- **Read-only**: Refused on a read-only connection (`/read-only`).
- **Undo**: Cannot be undone: a closed connection cannot be opened again from the server, and what the client had
  not finished is lost; the confirmation says so.
- **After**: the server answers the number of clients closed. 1: notifies *Disconnected client 42.*; 0: *Client 42
  was already gone.* Then the clients are read again (`server.read-clients`). An error of the server is shown in the
  section's error line, a `NOPERM` as the sentence of `server.unavailable` for `CLIENT KILL`.
- **Refuses**: *The connection Cache production is read-only.* (`/read-only`); the page's own client, *This is the
  connection Datardo reads this page with. Use Disconnect in the connection island.* (`/own-connection`).
- **Uses**: `runner.confirm`, `runner.run`, `runner.notify`, `runner.log`, `server.read-clients`,
  `server.unavailable`, `connection.disconnect`.
- **Ported from**: *New in Datardo*; built as Mongoster's kill of a server operation (`src/monitor.ts › killOp`).

`CLIENT KILL ID` exists since Redis 2.8.12. It is not offered to an AI assistant: the MCP server has no tool that
disconnects a client.

Acceptance:

- [ ] **Disconnect…** on the client 42 shows **Disconnect client 42?** with *10.0.0.7:52144 · orders-api · user app
  · idle 3 s · last command blpop*, the step `CLIENT KILL ID 42` and the button **Disconnect**.
- [ ] After **Disconnect** the server receives exactly that command, the page says *Disconnected client 42.*, and
  the client 42 is no longer in the table.
- [ ] Closing the confirmation sends nothing.
- [ ] When the client left before the command arrived, the page says *Client 42 was already gone.* and the table is
  read again.
- [ ] The confirmation of a client with `flags=S` has the sentence about the replica.
- [ ] Disconnecting the client named `datardo-pubsub` is allowed, and the Pub/Sub page of the connection then
  connects again by itself (`pubsub.reconnect`).
- [ ] On Cache production nothing is sent and the refusal is *The connection Cache production is read-only.* with
  the code `server.kill-client/read-only`.
- [ ] The Log has the line `[server.kill-client] CLIENT KILL ID 42`.
- [ ] No operation is added to the undo history, and the notification has no **Undo**.

### `server.read-slow-log` — Read the slow log

The commands the server logged as slow, and the threshold above which it logs.

- **Kind**: Read
- **Engine**: Redis
- **Function**: `src/features/server/read-slow-log.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: the Slow log section.
- **Reads**: `SLOWLOG GET 1000`, the newest 1,000 entries *(Datardo's choice)*, and `SLOWLOG LEN`, at every refresh;
  `CONFIG GET slowlog-log-slower-than`, when the section is chosen and with **Refresh**.
- **Uses**: `server.slow-log`, `server.unavailable`, `console.secret-arguments`.
- **Ported from**: *New in Datardo*.

Rules of `parse`:

1. An entry of `SLOWLOG GET` is an array: its id (a number that grows and is never used again until the server
   restarts), the Unix time in seconds when the command ran, the time it took in microseconds, the array of its
   arguments, and, since Redis 4.0, the address and the name of its client.
2. The command is its arguments written on one line as the runner writes a Redis step, with the arguments
   `console.secret-arguments` marks written `***`. A server before 7.0 logs `CONFIG SET requirepass` and `MIGRATE …
   AUTH` with their password; Datardo masks them before the entry leaves the main process.
3. The server itself keeps at most 32 arguments of a command, the last one saying how many it left out (`... (4 more
   arguments)`), and at most 128 bytes of each (`... (2048 more bytes)`). Those texts are shown as they are.
4. The entries stay in the order of the server, the newest first.
5. The threshold is the value of `slowlog-log-slower-than`, in microseconds: a positive number is the limit, 0 means
   every command is logged, a negative number means the slow log is off.
6. When `SLOWLOG GET` cannot run, the section has the sentence of `server.unavailable` and no entries. When only
   `CONFIG GET` cannot run, the entries are shown and the threshold is *not known*, with its sentence.

Acceptance:

- [ ] The entry `[14, 1794924309, 12345, ["LRANGE", "queue", "0", "-1"], "10.0.0.7:52144", "orders-api"]` gives the
  id 14, the duration 12,345 microseconds, the command `LRANGE queue 0 -1`, the client `10.0.0.7:52144` and the
  name `orders-api`.
- [ ] An entry whose arguments are `CONFIG`, `SET`, `requirepass`, `s3cret` gives the command `CONFIG SET requirepass
  ***`, and `s3cret` is nowhere in what the window process receives.
- [ ] An argument the server cut is shown with its `... (2048 more bytes)`.
- [ ] `CONFIG GET slowlog-log-slower-than` answering `10000` gives a threshold of 10 ms; `0`, every command; `-1`,
  off.
- [ ] With 4,096 entries on the server, 1,000 are read and `SLOWLOG LEN` gives 4,096.

### `server.slow-log` — The Slow log section

The commands that took the server longer than its threshold, the newest first, with a filter, and **Clear…**.

- **Kind**: View
- **Engine**: Redis
- **Function**: `src/features/server/slow-log.ts › view(state)`
- **Entry points**: **Slow log** in the section bar of the Server page (`@section-bar`); Go to (**Server: Slow
  log**).
- **Reads**: `server.read-slow-log`.
- **Commands**: `server.slow-log`
- **Uses**: `server.read-slow-log`, `server.slow-log-reset`, `server.unavailable`, `console.show`,
  `nav.inspector`.
- **Ported from**: *New in Datardo*.

What it shows:

1. The threshold, on one line: *The server logs the commands that take longer than 10 ms (slowlog-log-slower-than
   10000).* With 0: *The server logs every command (slowlog-log-slower-than 0).* With a negative number: *The slow
   log is off (slowlog-log-slower-than -1): no command is logged.* When it cannot be read: *The threshold is not
   known:* and the sentence of `server.unavailable` for `CONFIG GET`. Then, since the configuration is read-only in
   this release: *To change it, run CONFIG SET slowlog-log-slower-than in the console.* with **Open console**
   (`console.show`).
2. A toolbar (`@toolbar`): a filter with the placeholder **Filter by command, client or name**; **Slower than** a
   number of milliseconds (0 to start with); the count, *12 of 128 entries · 14:02:11*, or *12 of 1,000 entries
   (the server has 4,096)* when it has more than were read; and **Clear…** (`server.slow-log-reset`).
3. The table, one row per entry: **Time** (`14:05:09`, with the date for another day, `11-16 14:05:09`),
   **Duration** (`12.345 ms`; from one second, `1.24 s`), **Command** (on one line, cut at 300 characters with `…`,
   as the commands of the Monitor page), **Client** and **Name**.
4. Under the table: *A duration is the time the server spent running the command. It leaves out the time the
   command waited for its turn and the time on the network.*

The table is in the order of the server, the newest first; a click on **Duration** sorts by it, the slowest first.
Selecting a row shows the entry in the inspector island: its id, its time with the date, its duration in
microseconds, its client, and the command on as many lines as it has arguments, with **Copy command**.

Acceptance:

- [ ] An entry of 12,345 microseconds shows `12.345 ms`; one of 1,240,000 shows `1.24 s`.
- [ ] With the threshold 10000 the line reads *The server logs the commands that take longer than 10 ms
  (slowlog-log-slower-than 10000).*
- [ ] **Slower than** `100` shows only the entries of more than 100 ms, and the count reads *3 of 128 entries*.
- [ ] The filter `orders-api` shows the entries of the clients with that name.
- [ ] An empty slow log shows *No slow commands: none took longer than 10 ms since the log was last cleared.*; with
  the slow log off it shows the line of the threshold and *Nothing is logged.*
- [ ] A click on **Duration** puts the slowest entry first; an automatic refresh keeps that order.
- [ ] A managed server that refuses `CONFIG` shows the entries and *The threshold is not known: This server does not
  allow CONFIG GET: …*
- [ ] A user whose ACL denies `SLOWLOG` sees *SLOWLOG GET needs a user that may run it: …*, no table, and **Clear…**
  disabled with that sentence.
- [ ] No command shown in the section or in the inspector island holds a password (`console.secret-arguments`).

### `server.slow-log-reset` — Clear the slow log

Empties the server's slow log, to see what is slow from now on.

- **Kind**: Operation
- **Engine**: Redis
- **Function**: `src/features/server/slow-log-reset.ts › plan(context, answers)`
- **Entry points**: **Clear…** in the toolbar of the Slow log section (`@toolbar`); Go to (**Clear slow log…**).
- **Offered when**: the connection is not read-only.
- **Reads**: `SLOWLOG LEN`, for the number of entries the confirmation says.
- **Plan**: one step, `SLOWLOG RESET`. The title is **Clear the slow log of Cache local**.
- **Danger**: Confirm: **Clear the slow log of Cache local?** with *The 128 entries are removed from the server, for
  every client and every tool that reads them. The server goes on logging with the same threshold.* The button is
  **Clear**.
- **Read-only**: Refused on a read-only connection (`/read-only`).
- **Undo**: Cannot be undone: the entries are kept nowhere else; the confirmation says so.
- **After**: notifies *Cleared the slow log of Cache local.* and reads the slow log again (`server.read-slow-log`).
  An error of the server is shown in the section's error line.
- **Refuses**: *The connection Cache production is read-only.* (`/read-only`); the slow log has no entry, *The slow
  log of Cache local is already empty.* (`/empty`).
- **Commands**: `server.slow-log-reset`
- **Uses**: `runner.confirm`, `runner.run`, `runner.notify`, `runner.log`, `server.read-slow-log`.
- **Ported from**: *New in Datardo*; built as Mongoster's **Clear** of the profiler (`src/monitor.ts ›
  clearProfile`).

It is not offered to an AI assistant.

Acceptance:

- [ ] **Clear…** with 128 entries shows **Clear the slow log of Cache local?**, *128 entries*, the step `SLOWLOG
  RESET` and the button **Clear**.
- [ ] After **Clear** the server receives `SLOWLOG RESET`, `SLOWLOG LEN` answers 0, and the section shows its empty
  state.
- [ ] `CONFIG GET slowlog-log-slower-than` answers the same before and after.
- [ ] Closing the confirmation sends nothing.
- [ ] The confirmation says that it cannot be undone.
- [ ] On Cache production nothing is sent and the refusal is *The connection Cache production is read-only.* with
  the code `server.slow-log-reset/read-only`.
- [ ] With no entry the refusal is `server.slow-log-reset/empty` and no confirmation opens.
- [ ] The Log has the line `[server.slow-log-reset] SLOWLOG RESET`.

### `server.read-memory` — Read the memory of the server

Where the server's memory goes, by its own account, and what it advises.

- **Kind**: Read
- **Engine**: Redis
- **Function**: `src/features/server/read-memory.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: the Memory section.
- **Reads**: `MEMORY STATS`, at every refresh; `MEMORY DOCTOR`, when the section is chosen and with **Refresh**.
  Both exist since Redis 4.0.
- **Uses**: `server.memory`, `server.unavailable`.
- **Ported from**: *New in Datardo*.

Rules of `parse`:

1. `MEMORY STATS` answers pairs of a name and a value: a map on RESP3, a flat array of names and values on RESP2.
   Both give the same result.
2. The values are numbers of bytes, counts, percentages or ratios, as the name says. A value named `db.0`, `db.1`, …
   is itself pairs: `overhead.hashtable.main` and `overhead.hashtable.expires`, the bytes the tables of that
   database take.
3. Names that are not known are kept, for the inspector island. By version: `functions.caches` is given from Redis
   7.0. A name the server does not give is missing, not 0.
4. `MEMORY DOCTOR` answers text, kept as it is, with its line breaks.
5. Each of the two commands that cannot run gives its part of the section the sentence of `server.unavailable`; the
   other part is shown.

Acceptance:

- [ ] The same statistics read on RESP3 and on RESP2 give the same values.
- [ ] `db.0` with `overhead.hashtable.main` 72,000 and `overhead.hashtable.expires` 4,000 gives 76,000 bytes of
  tables for db0.
- [ ] On a Redis 6.2 server there is no value for the functions, and the section shows `—` in its row.
- [ ] A server that has `MEMORY STATS` and not `MEMORY DOCTOR` shows the numbers, and *This server does not allow
  MEMORY DOCTOR: …* in place of the advice.

### `server.memory` — The Memory section

How much memory the server uses and for what, what the server advises, and the largest keys.

- **Kind**: View
- **Engine**: Redis
- **Function**: `src/features/server/memory.ts › view(state)`
- **Entry points**: **Memory** in the section bar of the Server page (`@section-bar`).
- **Reads**: `server.read-memory`; `server.largest-keys`, only with its button.
- **Uses**: `server.read-memory`, `server.largest-keys`, `server.rank-keys`, `server.unavailable`, `nav.inspector`.
- **Ported from**: *New in Datardo*.

What it shows, from the top. Each number is the name of `MEMORY STATS` beside it.

1. Tiles:

   | Tile | Shows | Names of `MEMORY STATS` |
   | --- | --- | --- |
   | **Allocated** | *1.2 GB* | `total.allocated` |
   | **Peak** | *1.9 GB*, and under it *now at 63% of the peak* | `peak.allocated`, `peak.percentage` |
   | **Data** | *1.1 GB*, and under it *92% of what is allocated beyond the start* | `dataset.bytes`, `dataset.percentage` |
   | **Overhead** | *96.4 MB* | `overhead.total` |
   | **Keys** | *1,204,311*, and under it *about 1.0 KB each* | `keys.count`, `keys.bytes-per-key` |
   | **Fragmentation** | *1.08*, and under it *96.0 MB more in the system than allocated*; yellow from 1.5 *(Datardo's choice)* | `fragmentation`, `fragmentation.bytes` |

2. The table **Where the overhead goes**, one row per part, with its size: **The server at start**
   (`startup.allocated`), **Replication backlog** (`replication.backlog`), **Buffers of the replicas**
   (`clients.slaves`), **Buffers of the clients** (`clients.normal`), **Append-only file buffer** (`aof.buffer`),
   **Cached scripts** (`lua.caches`), **Functions** (`functions.caches`, Redis 7.0), and **Tables of db0** for each
   database (the two values of `db.0` added).
3. **Advice of the server**: the text of `MEMORY DOCTOR`, as the server wrote it, in a box.
4. **Largest keys**: a **Database** menu, **Find largest keys**, and the table of `server.largest-keys`.

Sizes, counts and percentages are written as in the Overview section.

Acceptance:

- [ ] `total.allocated` 1,288,490,188 shows *1.2 GB* in **Allocated**, with *1,288,490,188 bytes* as tooltip.
- [ ] `fragmentation` 1.62 shows *1.62* in yellow; 1.08 in the ordinary color.
- [ ] The advice of a healthy server is shown word for word as the server wrote it, with no line added by Datardo.
- [ ] Until **Find largest keys** is pressed, the part of the largest keys shows *Find the keys that take the most
  memory in a database. Datardo examines up to 100,000 keys at a time.* and no command of it is sent.
- [ ] Selecting a tile shows every name of `MEMORY STATS` with its value in the inspector island.
- [ ] A user whose ACL denies `MEMORY` sees *MEMORY STATS needs a user that may run it: …* in place of the tiles and
  the table, and the same for the advice.

### `server.largest-keys` — Find the largest keys

Examines the keys of one database, a bounded number at a time, and lists the ones that take the most memory.

- **Kind**: Read
- **Engine**: Redis
- **Function**: `src/features/server/largest-keys.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: **Find largest keys** in the Memory section, with its **Database** menu (`@toolbar`); **Examine
  100,000 more** under its table (`@toolbar`); Go to (**Find largest keys**). The rows of its table (`@table`,
  `@row-menu`).
- **Offered when**: the Server page is open. The **Database** menu lists the databases of `# Keyspace` of `INFO`,
  each with its number of keys, and starts on the one with the most.
- **Reads**: on the database chosen, never with `KEYS`:
  1. `SCAN 0 COUNT 500`, then `SCAN <cursor> COUNT 500` with the cursor each reply gives, until the cursor is 0.
  2. After each reply of `SCAN`, for each key it returned, `MEMORY USAGE <key> SAMPLES 5`, all in one round trip.
  3. At the end, `TYPE <key>` for each key of the result, in one round trip.

  It stops at the first of: the cursor 0 (every key was examined); 100,000 keys examined; 30 seconds, checked after
  each reply of `SCAN`. All of 500, 5, 100,000 and 30 are *Datardo's choice*; `SAMPLES 5` is also the server's own
  default.
- **Commands**: `server.largest-keys`
- **Uses**: `server.rank-keys`, `server.memory`, `server.unavailable`, `key.inspect`, `key.open`, `key.delete`,
  `runner.progress`, `runner.cancel`.
- **Ported from**: *New in Datardo*.

It changes nothing: it is allowed on a read-only connection. `SCAN` and `MEMORY USAGE` exist since Redis 2.8 and
4.0.

While it runs it is work in progress, *Finding the largest keys of db0 — 12,500 of about 1,204,311 keys*, with
**Cancel** (`runner.cancel`), which stops it after the reply in progress; the table shows the ranking so far, and
grows as keys are examined. The automatic refresh of the page does not start it again.

Rules of the result:

1. The ranking is the one of `server.rank-keys`: the 100 keys *(Datardo's choice)* with the largest `MEMORY USAGE`
   among those examined.
2. `MEMORY USAGE` answering nil is a key that went away between the two commands: it is skipped. An error for one
   key (a `NOPERM` for a key the user's ACL does not allow) is counted and does not stop the rest.
3. The line over the table says how far it went:
   - every key: *Examined all 12,500 keys of db0 in 1.8 s.*
   - a bound reached: *Examined 100,000 of about 1,204,311 keys of db0 in 12.4 s. Larger keys may be among the
     others.* with **Examine 100,000 more**, which goes on from the cursor with the same bounds and the ranking so
     far;
   - cancelled: *Stopped after 37,500 of about 1,204,311 keys of db0.* with **Examine 100,000 more**;
   - with keys that could not be measured, the line continues: *1,204 keys could not be measured: the user of this
     connection may not read them.*

   The number after *about* is the `keys` of the database in `INFO`, read when the search starts.
4. Under the table: *The size of a hash, a list, a set, a sorted set or a stream is an estimate: the server measures
   5 of its elements (SAMPLES 5).*
5. The table has the columns **#**, **Key**, **Type** and **Memory** (as a size, the bytes as tooltip). A name that
   is not valid UTF-8 is written as the console writes a string. A click on a row shows the key in the inspector
   island (`key.inspect`); a double click opens its key tab (`key.open`); the context menu has **Open key**, **Copy
   name** and **Delete key…** (`key.delete`, with its own confirmation and its own refusal on a read-only
   connection).
6. When `SCAN` cannot run, the part shows the sentence of `server.unavailable` for `SCAN`; when `MEMORY USAGE`
   cannot run at all (the first one answers `ERR unknown command` or `NOPERM` for the command), the search stops
   there with the sentence for `MEMORY USAGE`. When only `TYPE` cannot run, the column **Type** shows `—`.
7. A search and its result are per database and are not kept with the tab: a restored page shows the empty state.

Acceptance:

- [ ] On a database of 12,500 keys the commands are `SCAN 0 COUNT 500` and its followers until the cursor 0, one
  `MEMORY USAGE <key> SAMPLES 5` per key returned, and at most 100 `TYPE`; no `KEYS` is ever sent.
- [ ] On a database of 1,204,311 keys the search stops once 100,000 keys were examined, the table has 100 rows, and
  the line reads *Examined 100,000 of about 1,204,311 keys of db0 in … Larger keys may be among the others.*
- [ ] **Examine 100,000 more** sends `SCAN` with the cursor the last reply gave, not 0, and a larger key found then
  takes its place in the table.
- [ ] A search that reaches 30 seconds stops after the reply in progress, with the same line and its own count.
- [ ] **Cancel** after 37,500 keys leaves the table with the ranking of those 37,500.
- [ ] A key deleted by another client between `SCAN` and `MEMORY USAGE` is in no row and stops nothing.
- [ ] A double click on a row opens the key tab of that key, on the database of the search.
- [ ] On Cache production the search runs, and **Delete key…** on a row is refused by `key.delete`.
- [ ] An empty database shows *db0 has no keys.* and sends one `SCAN`.

### `server.rank-keys` — Rank keys by memory

Keeps, as keys are measured, the ones that take the most memory.

- **Kind**: Derivation
- **Engine**: Redis
- **Function**: `src/features/server/rank-keys.ts › largestKeys(ranking, measured, limit)`
- **Uses**: `server.largest-keys`.
- **Ported from**: *New in Datardo*.

Inputs: the ranking so far (`keys`, at most `limit` of them, each a name as bytes and a size in bytes; `examined`,
`skipped` and `failed`, three counts); the keys just measured, each a name and what `MEMORY USAGE` answered (a
number, nil, or an error); the limit, 100. Output: the ranking after.

Rules:

1. A key answered with a number is examined; with nil, skipped; with an error, failed. Each adds 1 to its count.
2. A key whose name is already in the ranking replaces the one there (`SCAN` may return a key twice, and its size
   may have changed); it is counted as examined once more.
3. The keys are ordered by size, the largest first; two keys of the same size by name, compared as bytes, the
   smaller first.
4. Only the first `limit` keys are kept.
5. The result does not depend on how the measured keys were split into batches, nor on their order.

Examples, with a limit of 3:

| Ranking before | Measured | Ranking after |
| --- | --- | --- |
| *(empty)* | `a` 100, `b` 300, `c` 200 | `b` 300, `c` 200, `a` 100 · examined 3 |
| `b` 300, `c` 200, `a` 100 | `d` 250 | `b` 300, `d` 250, `c` 200 · examined 4 |
| `b` 300, `d` 250, `c` 200 | `e` 50 | unchanged · examined 5 |
| `b` 300, `d` 250, `c` 200 | `c` 400 | `c` 400, `b` 300, `d` 250 · examined 6 |
| `b` 300, `d` 250, `c` 200 | `f` nil, `g` error | unchanged · skipped 1, failed 1 |
| *(empty)* | `z` 100, `y` 100, `x` 100, `w` 100 | `w` 100, `x` 100, `y` 100 · examined 4 |

Acceptance:

- [ ] Each row of the table gives its ranking and its counts.
- [ ] 1,000 keys given in one batch, in ten batches, and in reverse order give the same 100 keys in the same order.
- [ ] The ranking never holds two keys with the same name.

### `server.replication` — The Replication section

Whether the server is a master or a replica, who replicates from it or whom it follows, and how far behind.

- **Kind**: View
- **Engine**: Redis
- **Function**: `src/features/server/replication.ts › view(state)`
- **Entry points**: **Replication** in the section bar of the Server page (`@section-bar`).
- **Reads**: `server.read-info` with `INFO replication`, at every refresh.
- **Uses**: `server.read-info`, `server.unavailable`, `nav.inspector`.
- **Ported from**: *New in Datardo*. The colors of the lag are those of Mongoster's Replication section (yellow from
  10 seconds, red from 60).

Each value is the field of `INFO replication` named beside it.

On a master (`role:master`):

1. Tiles: **Role** *master*; **Replicas** (`connected_slaves`); **Offset** (`master_repl_offset`, with the
   replication ID `master_replid` as tooltip); **Backlog** *on · 1.0 MB* or *off* (`repl_backlog_active`,
   `repl_backlog_size`); and, when the server gives it and it is not `no-failover`, **Failover**
   (`master_failover_state`, Redis 6.2).
2. The table of the replicas, one row per line `slave0`, `slave1`, …: **Address** (`ip` and `port`), **State**
   (`state`: `online`, `wait_bgsave`, `send_bulk`), **Offset** (`offset`), **Behind** (`master_repl_offset` minus the
   replica's `offset`, as a size; *0 B* when equal) and **Lag** (`lag`, the seconds since the replica last
   acknowledged; yellow from 10, red from 60).
3. With no replica: *No replica is connected to this server.*

On a replica (`role:slave`):

1. Tiles: **Role** *replica of 10.0.0.5:6379* (`master_host`, `master_port`); **Link** *up* or *down*
   (`master_link_status`; down is in the error color, with *for 42 s* from `master_link_down_since_seconds`); **Last
   contact** *3 s ago* (`master_last_io_seconds_ago`; yellow from 10, red from 60); **Offset** (`slave_repl_offset`);
   **Sync** *in progress · 12.0 MB left* when `master_sync_in_progress` is 1 (`master_sync_left_bytes`), not shown
   otherwise; **Priority** (`slave_priority`).
2. The line *This server is a replica: it refuses writes.* when `slave_read_only` is 1.
3. Its own replicas, when `connected_slaves` is above 0, in the same table as on a master.

The section only reads: stopping, starting or changing replication is done with `REPLICAOF` in the console, which
confirms it (`console.classify` has the texts).

Acceptance:

- [ ] `role:master`, `connected_slaves:1`, `master_repl_offset:1500` and `slave0:ip=10.0.0.6,port=6379,state=online,
  offset=1234,lag=1` show one row: `10.0.0.6:6379`, *online*, 1,234, *266 B* behind, *1 s*.
- [ ] A replica with `lag=75` has its lag in red; with `lag=12`, in yellow.
- [ ] `role:slave` with `master_link_status:down` and `master_link_down_since_seconds:42` shows **Link** *down for
  42 s* in the error color.
- [ ] A master with no replica shows *No replica is connected to this server.* and no table.
- [ ] A replica with `slave_read_only:1` shows *This server is a replica: it refuses writes.*
- [ ] A server whose `INFO` has no `master_failover_state` shows no **Failover** tile.
- [ ] A user whose ACL denies `INFO` sees *INFO needs a user that may run it: …*

### `server.read-config` — Read the configuration

The parameters of the server and their values, with the secrets masked before they go anywhere.

- **Kind**: Read
- **Engine**: Redis
- **Function**: `src/features/server/read-config.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: the Configuration section.
- **Reads**: `CONFIG GET *`, when the section is chosen and with **Refresh**.
- **Uses**: `server.config`, `server.unavailable`, `console.secret-arguments`.
- **Ported from**: *New in Datardo*.

Rules of `parse`:

1. The reply is pairs of a parameter and its value: a map on RESP3, a flat array on RESP2. Both give the same
   result.
2. The parameters are sorted by name.
3. A parameter is a secret by the rule of `console.secret-arguments` for `CONFIG SET`: its name is `requirepass`,
   or ends with `pass`, `password`, `auth` or `secret` (`requirepass`, `masterauth`, `tls-key-file-pass`,
   `tls-client-key-file-pass`, and the like).
4. The value of a secret that is not empty is replaced by `***` in the main process, as soon as the reply is read:
   the real value is never given to the window process, to the Log, to the clipboard or to an AI assistant. An empty
   secret stays empty, so that the page can say that no password is set.
5. Every other value is kept as text, as the server wrote it (`maxmemory` as `4294967296`, `save` as `3600 1 300
   100 60 10000`).

Acceptance:

- [ ] `requirepass` with the value `s3cret` gives `***`; `masterauth` and `tls-key-file-pass` too.
- [ ] `requirepass` with an empty value gives an empty value.
- [ ] `masteruser`, `maxmemory` and `tls-auth-clients` are not masked.
- [ ] After the section was read, the text `s3cret` is nowhere in the messages from the main process to the window
  process, nor in the Log.
- [ ] The same configuration read on RESP3 and on RESP2 gives the same rows.

### `server.config` — The Configuration section

The parameters of the server as a table with a filter. In the first release it only reads.

- **Kind**: View
- **Engine**: Redis
- **Function**: `src/features/server/config.ts › view(state)`
- **Entry points**: **Configuration** in the section bar of the Server page (`@section-bar`).
- **Reads**: `server.read-config`, when the section is chosen and with **Refresh**; never at an automatic refresh.
- **Uses**: `server.read-config`, `server.unavailable`, `console.show`, `nav.inspector`.
- **Ported from**: *New in Datardo*.

What it shows:

1. A toolbar (`@toolbar`): a filter with the placeholder **Filter by parameter or value**, and the count, *12 of 198
   parameters · 14:02:11*.
2. The notice *The configuration is read-only in this release. To change a parameter, run CONFIG SET in the
   console, which confirms it.* with **Open console** (`console.show`).
3. The table, one row per parameter, by name: **Parameter** and **Value**. An empty value is shown as *empty*,
   dimmed; a masked secret as `***`, with the tooltip *Hidden: Datardo does not show the passwords of the server.*; a
   secret that is empty as *not set*.
4. The context menu of a row (`@row-menu`): **Copy parameter**, **Copy value**.

The filter looks, without case, in the name and in the value as shown: a secret is never found by its real value.
The table has no control that edits, on any connection.

Acceptance:

- [ ] The filter `maxmem` shows `maxmemory`, `maxmemory-policy`, `maxmemory-samples` and the other parameters whose
  name or value holds it, and the count says how many.
- [ ] The row of `requirepass` shows `***` on a server with a password and *not set* on one without.
- [ ] **Copy value** on the row of `requirepass` copies `***`.
- [ ] The filter `s3cret` shows no row on a server whose password is `s3cret`.
- [ ] A double click on a value starts no edit.
- [ ] With **Auto** at **2 s**, `CONFIG GET *` is sent once when the section is chosen and not again until
  **Refresh**.
- [ ] A managed server that turned `CONFIG` off shows *This server does not allow CONFIG GET: …* and no table; a
  user whose ACL denies it shows *CONFIG GET needs a user that may run it: …*
