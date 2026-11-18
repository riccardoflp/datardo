# Console

The console tab of a Redis connection: Redis commands typed one at a time and their replies. This area covers the
tab and its own connection to the server, the input, how a line becomes the arguments of a command, running it, what
is refused and what is confirmed before it is sent, the reply shown by its type, the database and the transaction of
the console, the history of commands, autocomplete and the hint of a command's arguments, stopping a command, clearing
the output and copying a reply.

The console is the one place of Datardo where the user writes to Redis in the server's own words, so two promises of
the [product page](../product.md#what-stays-the-same) are kept here command by command: a read-only connection sends
nothing that writes, and a command that loses data or changes the server is shown and confirmed before it runs. What
the console does not promise is undo: its commands are not recorded in the undo history, like the writes of a
playground, and the tab says so.

The examples use the connections **Cache local** (allows writes) and **Cache production** (read-only).

### `console.show` — The console tab

One tab per Redis connection where commands are typed and their replies read, on a connection of its own to the
server.

- **Kind**: View
- **Engine**: Redis
- **Function**: `src/features/console/show.ts › view(state)`
- **Entry points**: **Console** under **Pages of** the connection in the tree island (`@tree`); Go to (**Console**).
- **Offered when**: the current connection is a Redis connection. Opening the tab connects it when it is not
  connected (`connection.connect`).
- **After**: the tab is titled **Console** in the group of its connection, and its path is `Cache local / Console`.
  A second request for the same connection makes the open tab active and opens no second one. The tab can be pinned
  (`nav.pin`).
- **Commands**: `console.show`
- **Uses**: `console.connect`, `console.input`, `console.output`, `console.run`, `console.session`, `console.clear`,
  `console.stop`, `tab.open`, `tab.restore`, `nav.inspector`, `nav.status-line`, `connection.read-only`.
- **Ported from**: *New in Datardo*.

What the tab shows, from the top:

1. The toolbar (`@toolbar`): the database of the console as a menu (**db0**), which lists the databases the tree
   island shows and sends `SELECT <n>` through `console.run` as if it were typed; **Clear output**; and the notice
   *Commands run here are not recorded in the undo history.* On a read-only connection the notice continues with
   *This connection is read-only: commands that write are refused.*
2. The output (`console.output`): each command with its reply, the oldest at the top.
3. The input (`console.input`), with the prompt of `console.session` before it: `db0>`.

States:

- **Connecting**: the input shows *Connecting…* and takes text; `Enter` waits for the connection.
- **Empty**: the output shows *Type a Redis command and press Enter. Up and Down go through the commands you ran
  before.*
- **Running**: the prompt is replaced by a moving mark, **Run** becomes **Stop** (`console.stop`), and the status
  line shows the command as work in progress once it has run for 400 ms.
- **Connection closed**: the output gets the line *The console's connection closed.*; the next command opens it again
  (`console.connect`).
- **Read-only**: the status line shows **Read-only** and the notice above is shown; nothing is disabled, since most
  commands read.

The status line shows, for the active console, the database, the protocol and the time of the last reply: *db0 ·
RESP3 · 12 ms*.

Acceptance:

- [ ] Opening **Console** on Cache local opens one tab titled **Console** in Cache local's group; opening it again
  makes that tab active and opens no second one.
- [ ] With a MongoDB connection current, neither the tree island nor Go to offers **Console**.
- [ ] The notice reads *Commands run here are not recorded in the undo history.*; on Cache production it reads
  *Commands run here are not recorded in the undo history. This connection is read-only: commands that write are
  refused.*
- [ ] A new console shows the prompt `db0>` when the connection's database is 0, and `db2>` when the connection was
  saved with the database 2.
- [ ] Choosing **db3** in the database menu shows the command `SELECT 3` and its reply `OK` in the output, and the
  prompt becomes `db3>`.
- [ ] Closing the tab closes the console's connection: `CLIENT LIST`, run from another client, no longer has a line
  with `name=datardo-console`.
- [ ] After a restart of Datardo the restored tab has an empty output, its history of commands and the database of
  the connection.

### `console.connect` — Open the console's own connection

The console talks to the server on a connection that nothing else in Datardo uses, so that `SELECT`, `MULTI`, `WATCH`
and a command that takes long change nothing for the keys tabs, the tree island and the other pages.

- **Kind**: Operation
- **Engine**: Redis
- **Function**: `src/features/console/connect.ts › plan(context, answers)`
- **Entry points**: none of its own: the console tab when it is first shown, the first command after the connection
  closed, and `console.stop`.
- **Reads**: the address, TLS, SSH tunnel, user name, password and database of the saved connection
  (`connection.secrets`).
- **Plan**:
  1. `open a connection to cache.example.com:6379 for the console`, through the same TLS options and SSH tunnel as
     the connection.
  2. `HELLO 3 AUTH app *** SETNAME datardo-console`, without `AUTH app ***` when the connection has no password, and
     with the user `default` when it has a password and no user name.
  3. `SELECT 2`, only when the console's database is not 0: the database of the saved connection the first time, the
     one the console was on when it opens again.

  When the server answers step 2 with an error that starts with `ERR unknown command` or `NOPROTO` (a server
  without RESP3), the plan goes on with `AUTH app ***` (when there is a password) and `CLIENT SETNAME
  datardo-console`, and the console reads replies in RESP2.
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone: nothing is written. Closing the tab closes the connection.
- **After**: the prompt shows the database. When the connection is opened again after it closed, the output gets
  *Connected again on db2.*, and when a transaction was open, *The transaction was discarded: the console's
  connection closed.* (`console.session`).
- **Refuses**: the saved connection is not connected and cannot be connected, *Cache local is not connected.*
  (`/not-connected`).
- **Uses**: `connection.connect`, `connection.secrets`, `console.session`, `runner.run`, `runner.log`.
- **Ported from**: *New in Datardo*.

Acceptance:

- [ ] After the console opens, `CLIENT LIST` from another client shows one client with `name=datardo-console`; from
  Redis 7.0 on, where the line has the field, with `resp=3`.
- [ ] While `BLPOP queue 10` waits in the console, a keys tab of the same connection lists keys without waiting.
- [ ] After `SELECT 3` in the console, a keys tab of db0 still lists the keys of db0, and a key written from the
  inspector island goes to the database of its own tab.
- [ ] The Log has `[console.connect] HELLO 3 AUTH app *** SETNAME datardo-console` and never the password.
- [ ] A server that answers `HELLO` with `ERR unknown command 'HELLO'` gets `AUTH app ***` and `CLIENT SETNAME
  datardo-console`, and the status line then shows *RESP2*.
- [ ] A server at its limit of clients answers `ERR max number of clients reached`: the output shows that error and
  the command that was typed stays in the input.
- [ ] After the server closed an idle console's connection, the next `GET greeting` opens it again, shows *Connected
  again on db2.* and then the reply, when the console was on db2.
- [ ] Disconnecting the connection (`connection.disconnect`) closes the console's connection too; the tab stays, with
  its output.

### `console.input` — The command input

Where a command is typed: Datardo's editor on one line that grows, with the colors of a Redis command, the history on
`Up` and `Down`, and autocomplete.

- **Kind**: View
- **Engine**: Redis
- **Function**: `src/features/console/input.ts › view(state)`
- **Entry points**: the bottom of the console tab (`@editor`). `Ctrl+L` clears the output (`console.clear`).
- **Uses**: `console.run`, `console.history`, `console.autocomplete`, `console.argument-hint`, `console.parse-line`,
  `console.stop`, `console.clear`.
- **Ported from**: *New in Datardo*.

What it shows:

1. The prompt (`console.session`) and the editor, with the placeholder **Type a command, for example GET
   orders:42**. The name of the command, quoted text, numbers and escapes (`\n`, `\xNN`) each have their color; a
   quote that is never closed is underlined as an error while it is typed.
2. **Run** at its right (`@editor`), which becomes **Stop** while a command runs.
3. Under it, the hint of the command being typed (`console.argument-hint`).

Keys:

| Key | Does |
| --- | --- |
| `Enter` | Runs the line (`console.run`), also while the list of suggestions is open. |
| `Shift+Enter` | Adds a line. The input grows to 8 lines *(Datardo's choice)* and then scrolls. |
| `Up`, `Down` | With the caret on the first line (`Up`) or the last line (`Down`) and no list of suggestions open: the older or the newer command of the history (`console.history`). |
| `Tab` | Takes the selected suggestion (`console.autocomplete`). |
| `Ctrl+Space` | Opens the list of suggestions. |
| `Esc` | Closes the list of suggestions; with no list open and a command running, stops it (`console.stop`). |
| `Ctrl+L` | Clears the output (`console.clear`). |

A text of several lines is several commands: `Enter` sends `console.run` for each line that is not empty, in order,
each after the reply of the one before. The run stops at the first line that is refused, that cannot be read, or
whose confirmation is cancelled, and the lines not run stay in the input; an error reply of the server does not stop
it. A text of more than 500 lines *(Datardo's choice)* is not run (`console.run/too-many-lines`).

Acceptance:

- [ ] `Enter` on `GET greeting` runs it and empties the input; the focus stays in the input.
- [ ] After a refusal or a cancelled confirmation the line is still in the input, with the caret where it was.
- [ ] `Shift+Enter` adds a line and runs nothing.
- [ ] Pasting the three lines `SET a 1`, `SET b 2`, `GET a` and pressing `Enter` shows three commands and three
  replies in the output, in that order.
- [ ] Pasting `SET a 1`, `SET b "2` and `GET a` runs `SET a 1`, refuses the second line with
  `console.run/invalid-line` and leaves `SET b "2` and `GET a` in the input.
- [ ] A paste of 501 lines runs nothing and says *The console runs up to 500 lines at a time. To load many keys, use
  Import in the keys tab.*
- [ ] `Enter` on an empty input, or on one that holds only spaces, does nothing.
- [ ] Every control of the input has a name a screen reader says: **Command**, **Run**, **Stop**.

### `console.parse-line` — Read a command line into arguments

Turns the line the user typed into the arguments the server receives, with the quoting rules of `redis-cli`, so that
a line copied from a terminal or from Redis's documentation means the same in Datardo.

- **Kind**: Derivation
- **Engine**: Redis
- **Function**: `src/features/console/parse-line.ts › commandArguments(line)`
- **Uses**: `console.run`, `console.autocomplete`.
- **Ported from**: *New in Datardo*. The rules are those of `sdssplitargs` in Redis's `sds.c`, which `redis-cli`
  uses.

Input: one line of text. Output: the arguments in order, each a sequence of bytes, or an error with the column
(counted from 1) where it was found. The first argument is the command's name, whose case does not matter.

Rules:

1. Spaces and tabs between arguments separate them and are dropped, at the start and at the end too. A line with
   nothing else gives no arguments.
2. Outside quotes every character is itself, a backslash included: `a\nb` is the four characters typed, with no line
   break in it.
3. `"` opens text that ends at the next `"` not preceded by a backslash. Inside it: `\n`, `\r`, `\t`, `\b` and `\a`
   are the line feed, the carriage return, the tab, the backspace and the bell; `\xNN`, with two hexadecimal digits
   in either case, is the byte `NN`; a backslash before any other character gives that character (`\"` is `"`, `\\`
   is `\`, `\q` is `q`).
4. `'` opens text that ends at the next `'` not preceded by a backslash. Inside it only `\'` is an escape, and gives
   `'`; every other character is itself, a backslash included.
5. A quote in the middle of an argument continues that argument: `a"b c"` is the one argument `ab c`.
6. A closing quote must be followed by a space, a tab or the end of the line. Otherwise the line is invalid.
7. A quote that is never closed makes the line invalid.
8. Text is encoded as UTF-8. `\xNN` is the only way to write a byte that is not text.
9. `""` and `''` are an empty argument.

Examples:

| Line | Arguments |
| --- | --- |
| `GET greeting` | `GET`, `greeting` |
| `  get   greeting  ` | `get`, `greeting` |
| `SET greeting "hello world"` | `SET`, `greeting`, `hello world` |
| `SET note 'it\'s here'` | `SET`, `note`, `it's here` |
| `SET note "say \"hi\""` | `SET`, `note`, `say "hi"` |
| `SET text "line1\nline2"` | `SET`, `text`, the 11 bytes of `line1`, a line feed (0A) and `line2` |
| `SET text 'line1\nline2'` | `SET`, `text`, the 12 characters `line1\nline2`, backslash and `n` included |
| `SET text line1\nline2` | the same as the line above |
| `SET bin "\x00\xff\x41"` | `SET`, `bin`, the 3 bytes 00 FF 41 |
| `SET name "caf\xc3\xa9"` | `SET`, `name`, the 5 bytes of `café` |
| `SET name café` | the same as the line above |
| `SET empty ""` | `SET`, `empty`, and an argument of 0 bytes |
| `SET k a"b c"` | `SET`, `k`, `ab c` |
| `SET k "\q\x4"` | `SET`, `k`, `qx4` (`\x4` is not two hexadecimal digits) |
| `SET k "abc` | invalid: *The quote opened at column 7 is never closed.* |
| `SET k "a"b` | invalid: *The closing quote at column 9 must be followed by a space.* |
| *(only spaces)* | no arguments |

Invariants: the result never depends on the server or on the connection; the same line always gives the same
arguments; for a list of arguments, parsing the text the runner writes for its step gives the same arguments back
when nothing was masked or cut.

Acceptance:

- [ ] Each row of the table gives its result.
- [ ] `SET bin "\x00\xff\x41"` followed by `STRLEN bin` answers `(integer) 3`.
- [ ] `SET name café` followed by `STRLEN name` answers `(integer) 5`.
- [ ] An invalid line is not sent, not even in part: the refusal is `console.run/invalid-line` with the message of
  the table.

### `console.run` — Run one command

Sends the command typed in the console to the server and shows its reply, after refusing what a read-only connection
must not send and what would hold the console's connection, and after confirming what loses data or changes the
server.

- **Kind**: Operation
- **Engine**: Redis
- **Function**: `src/features/console/run.ts › plan(context, answers)`
- **Entry points**: `Enter` in the input and **Run** beside it (`@editor`); the database menu of the console's
  toolbar, which runs `SELECT <n>` (`@toolbar`); **Run again** in the context menu of a command of the output
  (`@item-menu`), which runs it as if it were typed.
- **Offered when**: a console tab is active and its input is not empty.
- **Reads**: `console.command-flags` for the command's name, the first time it is run on this console's connection.
  Before a confirmation that says how many keys are touched: `DBSIZE` for `FLUSHDB` and `KEYS`, `INFO keyspace` for
  `FLUSHALL`; when that read fails, the confirmation leaves the count out.
- **Plan**: one step, the command with its arguments as `console.parse-line` read them: `SET greeting "hello
  world"`. The arguments `console.secret-arguments` marks are secrets of the step, which the confirmation and the Log
  write as `***`. The title is the command's name in upper case, with its subcommand when it has one: `SET`, `CONFIG
  SET`. An `EXEC` that needs a confirmation has the steps `console.classify` gives it.
- **Danger**: what `console.classify` says for the command: None for most; Confirm or Destructive for the commands of
  its table, with their texts.
- **Read-only**: Refused on a read-only connection (`/read-only`) for every command that writes or changes the
  server, as `console.classify` decides; the commands that only read are allowed.
- **Undo**: Cannot be undone: commands run in the console are not recorded in the undo history. The notice of the
  tab says so, and so does every confirmation: *This cannot be undone: commands run in the console are not recorded
  in the undo history.*
- **After**: the output gets the command and its reply, with the time it took (`console.output`, `console.reply`);
  the command joins the history (`console.history`); the database and the transaction of the console follow the
  reply (`console.session`). After a command that writes and was not answered with an error, the tree island
  (`tree.refresh`) and the keys tab or key tab on screen for the same connection are read again, at most once a
  second *(Datardo's choice)*. Nothing is notified: the reply is in the output.
- **Refuses**: each refusal is shown in the output under the command, in the error color, as well as the way every
  refusal is shown (`runner.refuse`):
  - the line cannot be read, with the message of `console.parse-line` (`/invalid-line`);
  - a command is still running on the console's connection, *Wait for BLPOP to answer, or stop it.* (`/busy`);
  - more than 500 lines at once (`/too-many-lines`);
  - the saved connection is not connected, *Cache local is not connected.* (`/not-connected`);
  - and the refusals of `console.classify`: `/read-only`, `/unknown-command`, `/subscribe`, `/monitor`,
    `/replication-stream`, `/connection-state`, `/blocks-forever`.
- **Commands**: `console.run`
- **Uses**: `console.parse-line`, `console.command-flags`, `console.classify`, `console.secret-arguments`,
  `console.session`, `console.reply`, `console.output`, `console.history`, `console.connect`, `runner.confirm`,
  `runner.run`, `runner.refuse`, `runner.log`, `tree.refresh`, `connection.read-only`.
- **Ported from**: *New in Datardo*.

The Log records every command the console sends, reads included, as `[console.run] <step text>` with the source
**Console**, and its outcome after: the time it took, or the error. A reply is never written in the Log. A refused
command is written with its code and its name only, never its arguments.

A command is sent as an array of arguments, never as a line of text, so no argument can be read by the server as
another command.

When the connection closes after the command was sent and before its reply arrived, the output says *The connection
closed before the reply arrived. The server may have run the command.* and the command is not sent again.

It is not offered to an AI assistant: the MCP server has no tool that runs a command typed by the assistant.

Acceptance:

- [ ] `SET greeting "hello world"` on Cache local sends the three arguments `SET`, `greeting` and `hello world`, the
  output shows `OK`, and the Log has `[console.run] SET greeting "hello world"`.
- [ ] `set greeting hi` in lower case runs the same as `SET greeting hi`.
- [ ] On Cache production `SET greeting hi` sends nothing: the output shows *The connection Cache production is
  read-only. SET writes, so the console did not send it.*, the code is `console.run/read-only`, and `GET greeting`
  on the same connection runs.
- [ ] On Cache production `EVAL "return 1" 0` is refused with `console.run/read-only`, and `EVAL_RO "return 1" 0` is
  sent.
- [ ] `FLUSHDB` on db0 of Cache local, which holds 1,204 keys, opens a confirmation titled **Run FLUSHDB on Cache
  local?** with *1,204 keys*, the step `FLUSHDB` and a field *Type db0 to confirm*; **Run FLUSHDB** is disabled until
  the field holds `db0`, and cancelling sends nothing.
- [ ] `SUBSCRIBE orders` sends nothing and the output offers **Open Pub/Sub**.
- [ ] `BLPOP queue 0` is refused with `console.run/blocks-forever`; `BLPOP queue 5` on an empty list answers `(nil)`
  after 5 seconds.
- [ ] `AUTH app s3cret` shows `AUTH app ***` in the output, the Log has `[console.run] AUTH app ***`, and `Up` does
  not bring the command back.
- [ ] `Enter` on a second command while `BLPOP queue 30` waits is refused with `console.run/busy` and the second
  command stays in the input.
- [ ] `DEL greeting` run in the console adds no operation to the undo history, and its reply has no **Undo**.
- [ ] After `SET orders:99 x` in the console, the keys tab of db0 on screen lists `orders:99` without the user
  refreshing it.
- [ ] `FOO` on Cache local is sent, and the output shows the server's error, `(error) ERR unknown command 'FOO', with
  args beginning with:`.

### `console.command-flags` — What the server says a command does

Asks the server for the flags of a command, to know whether it writes.

- **Kind**: Read
- **Engine**: Redis
- **Function**: `src/features/console/command-flags.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: none of its own: `console.run`, the first time a command's name is run on a console's
  connection.
- **Reads**: `COMMAND INFO <name>`, with the name in lower case: `COMMAND INFO set`. It is sent on the console's own
  connection, and its answer is kept for as long as that connection is open.
- **Uses**: `console.classify`.
- **Ported from**: *New in Datardo*.

Rules of `parse`:

1. The reply is an array with one element per name asked. A nil element means the server does not know the command:
   the result is *unknown*.
2. The flags are the third element of the command's entry (`write`, `readonly`, `denyoom`, `admin`, `pubsub`,
   `noscript`, `blocking`, `fast`, `movablekeys`, …), as a set of lower-case words.
3. From Redis 7.0 the entry has a tenth element, the subcommands, each an entry of the same shape named
   `<command>|<subcommand>` (`function|flush`). When the line typed has a second argument that names one of them,
   the flags are that subcommand's. On Redis 6.2 a command with subcommands has one set of flags for all of them.
4. When the server refuses `COMMAND` (a reply that starts with `NOPERM`, or `ERR unknown command`), the result is
   *not told*, and `console.classify` uses its built-in table alone.

Acceptance:

- [ ] `COMMAND INFO set` on Redis 6.2 and on Redis 7.2 gives a set of flags that holds `write`.
- [ ] `COMMAND INFO get` gives a set that holds `readonly` and not `write`.
- [ ] On Redis 7.2, `FUNCTION FLUSH` gets the flags of `function|flush`, which hold `write`; `FUNCTION LIST` gets
  those of `function|list`, which do not.
- [ ] `COMMAND INFO mymodule.do` on a server without that command gives *unknown*.
- [ ] A user whose ACL denies `COMMAND` gives *not told*, and the console still runs `GET greeting`.
- [ ] Running `SET` three times on one console's connection sends `COMMAND INFO set` once.

### `console.classify` — What is run, refused and confirmed

Decides, for a command about to be sent from the console, whether it runs at once, is refused, or is confirmed first,
and with which words.

- **Kind**: Derivation
- **Engine**: Redis
- **Function**: `src/features/console/classify.ts › classification(command, flags, session, connection)`
- **Uses**: `console.run`, `console.command-flags`, `console.session`, `pubsub.show`, `connection.read-only`.
- **Ported from**: *New in Datardo*.

Inputs: the arguments of the command; its flags (a set, *unknown* or *not told*); the console's session (whether a
transaction is open, the commands queued in it, the protocol); the connection (its name, whether it is read-only);
the version of the server; the number of keys of the console's database, when it was read. Output: one of *run*,
*refuse* with a code and a message, or *confirm* with a danger, a text, and for a destructive one the name to type;
and whether the command writes, which the runner's read-only guard uses.

The name of a command is compared without case; so are its subcommand and its option words (`ASYNC`, `NOSAVE`,
`BLOCK`). The rules are applied in this order, and the first that applies decides.

**1. Commands that would break the console's connection** are refused on every connection:

| Command | Code | Message |
| --- | --- | --- |
| `SUBSCRIBE`, `PSUBSCRIBE`, `SSUBSCRIBE` (Redis 7.0) | `/subscribe` | *SUBSCRIBE would turn the console's connection into a subscriber, which runs no other command. Follow channels in the Pub/Sub page.* The refusal has the button **Open Pub/Sub** (`pubsub.show`). |
| `MONITOR` | `/monitor` | *MONITOR sends every command the server runs, without end, and slows the server down. The console does not run it.* |
| `SYNC`, `PSYNC` | `/replication-stream` | *PSYNC starts a replication stream, which the console cannot read.* |
| `HELLO` with a protocol version other than the one in use; `RESET`; `CLIENT REPLY OFF`, `CLIENT REPLY SKIP`; `CLIENT TRACKING ON` | `/connection-state` | *RESET changes how the console's connection reads replies, so the console does not send it. Close the tab and open the console again to start afresh.* |

`UNSUBSCRIBE` and `PUNSUBSCRIBE` are run: outside a subscription they answer and change nothing. `QUIT` is run, and
the console's connection then closes.

**2. On a read-only connection**, refused with `/read-only` and *The connection Cache production is read-only. SET
writes, so the console did not send it.*:

- every command whose flags hold `write`;
- the scripts that may write, whatever their flags: `EVAL`, `EVALSHA`, `FCALL`. Their forms that cannot write are
  allowed: `EVAL_RO`, `EVALSHA_RO`, `FCALL_RO` (all Redis 7.0; a 6.2 server answers them with `ERR unknown command`,
  shown as any error);
- the commands that send to others: `PUBLISH`, `SPUBLISH`;
- the commands that change the server, which the server does not flag as writes: `SHUTDOWN`, `CONFIG SET`, `CONFIG
  REWRITE`, `CONFIG RESETSTAT`, every `DEBUG` but `DEBUG HELP`, `SCRIPT FLUSH`, `SCRIPT KILL`, `FUNCTION KILL`,
  `REPLICAOF`, `SLAVEOF`, `FAILOVER`, `ACL SETUSER`, `ACL DELUSER`, `ACL LOAD`, `ACL SAVE`, `ACL LOG RESET`, `MODULE
  LOAD`, `MODULE LOADEX`, `MODULE UNLOAD`, `CLIENT KILL`, `CLIENT PAUSE`, `CLIENT UNPAUSE`, `CLIENT UNBLOCK`, `SAVE`,
  `BGSAVE`, `BGREWRITEAOF`, `SLOWLOG RESET`, `LATENCY RESET`, `MEMORY PURGE`.

The middle of the message says what the command does: *SET writes* for a command flagged `write`, *EVAL may write*
for the scripts, *PUBLISH sends a message to other clients* for the two that publish, *CONFIG SET changes the server*
for the last group.

For the commands that have a form that only reads, the message ends with it: *Use SORT_RO to read.* for `SORT`,
`GEORADIUS_RO` for `GEORADIUS`, `GEORADIUSBYMEMBER_RO` for `GEORADIUSBYMEMBER`, `BITFIELD_RO` for `BITFIELD`,
`EVAL_RO`, `EVALSHA_RO` and `FCALL_RO` for the scripts. `SORT_RO` and the three script forms need Redis 7.0: on an
older server that ending is left out.

A command whose flags are *unknown*, or *not told* while it is not in Datardo's built-in list of commands
(`console.command-docs`), is refused with `/unknown-command`: *The connection Cache production is read-only, and
Datardo cannot tell whether MYMODULE.DO writes. The console did not send it.* When the flags are *not told* and the
command is in the built-in list, the list's flags are used.

`MULTI`, `EXEC`, `DISCARD`, `WATCH`, `UNWATCH`, `SELECT`, `AUTH` and `SCRIPT LOAD` are allowed on a read-only
connection: none of them changes a key or a setting of the server. In a transaction each command is classified when
it is typed, so a write is refused before it is queued, and the transaction stays open.

**3. Commands that would wait forever** are refused with `/blocks-forever` when no transaction is open (in a
transaction the server never waits):

| Command | The timeout is | Refused when |
| --- | --- | --- |
| `BLPOP`, `BRPOP`, `BZPOPMIN`, `BZPOPMAX`, `BRPOPLPUSH`, `BLMOVE` | the last argument, in seconds | it is the number 0 (`0`, `0.0`) |
| `BLMPOP`, `BZMPOP` (Redis 7.0) | the first argument, in seconds | it is the number 0 |
| `XREAD`, `XREADGROUP` | the argument after `BLOCK`, in milliseconds | it is 0; without `BLOCK` they do not wait |
| `WAIT`, `WAITAOF` (Redis 7.2) | the last argument, in milliseconds | it is 0 |

The message is *BLPOP with the timeout 0 waits until another client pushes, however long, and holds the console's
connection. Give it a timeout, for example BLPOP queue 5.* With a timeout the command runs, and **Stop** ends the
wait (`console.stop`).

**4. Commands that lose data or change the server** are confirmed, on a connection that allows writes. Every
confirmation has the title **Run FLUSHALL on Cache local?** (the command with its subcommand, and the connection's
name), the text of the table, the count where one is given, the step as it is sent, the line *This cannot be undone:
commands run in the console are not recorded in the undo history.*, and the button **Run FLUSHALL**.

| Command | Danger | Text | Touches | The user types |
| --- | --- | --- | --- | --- |
| `FLUSHALL` | Destructive | *FLUSHALL deletes every key of every database of this server, for every client.* | *1,204,311 keys in 3 databases*, from `INFO keyspace` | the connection's name, `Cache local` |
| `FLUSHDB` | Destructive | *FLUSHDB deletes every key of db0, for every client.* | *1,204 keys*, from `DBSIZE` | the database, `db0` |
| `SHUTDOWN`, but `SHUTDOWN ABORT` (Redis 7.0) | Destructive | *The server stops and every client is disconnected. Datardo cannot start it again.* With `NOSAVE`: *What changed since the last save is lost.* | | the connection's name |
| `REPLICAOF <host> <port>`, `SLAVEOF <host> <port>` | Destructive | *The server deletes its own keys and copies those of 10.0.0.5:6379.* | *1,204,311 keys in 3 databases* | the connection's name |
| `FUNCTION FLUSH` (Redis 7.0) | Destructive | *FUNCTION FLUSH deletes every library of functions of this server.* | | the connection's name |
| `DEBUG SEGFAULT`, `DEBUG PANIC`, `DEBUG OOM`, `DEBUG ASSERT`, `DEBUG RESTART`, `DEBUG CRASH-AND-RECOVER` | Destructive | *This command stops or restarts the server.* | | the connection's name |
| every other `DEBUG`, but `DEBUG HELP` | Confirm | *DEBUG commands are made for developing Redis: some block the server or change its data.* | | |
| `SWAPDB <a> <b>` | Confirm | *Every client connected to db0 sees the keys of db1 at once, and the other way round.* | | |
| `REPLICAOF NO ONE`, `SLAVEOF NO ONE` | Confirm | *The server stops copying its master and accepts writes.* | | |
| `FAILOVER` (Redis 6.2) | Confirm | *A replica takes the place of this master; its clients must follow.* | | |
| `CONFIG SET` | Confirm | *The change applies at once, for every client. It is lost when the server restarts, unless CONFIG REWRITE saves it.* | | |
| `CONFIG REWRITE` | Confirm | *The server writes its current configuration over its configuration file.* | | |
| `CONFIG RESETSTAT` | Confirm | *The counters of INFO, the latency data and the statistics of the commands start again from zero.* | | |
| `SCRIPT FLUSH` | Confirm | *Every cached script is removed: clients that call EVALSHA get NOSCRIPT until they load their scripts again.* | | |
| `FUNCTION DELETE`, and `FUNCTION RESTORE` with `FLUSH` or `REPLACE` (Redis 7.0) | Confirm | *Libraries of functions are deleted or replaced, for every client.* | | |
| `ACL SETUSER`, `ACL DELUSER`, `ACL LOAD`, `ACL SAVE` | Confirm | *This changes who may connect and what they may run. The user of this connection can lock itself out.* | | |
| `MODULE LOAD`, `MODULE LOADEX` (Redis 7.0), `MODULE UNLOAD` | Confirm | *This loads code into the server, or removes it.* | | |
| `CLIENT KILL` | Confirm | *The connections of other clients are closed.* | | |
| `CLIENT PAUSE` | Confirm | *The server stops serving its clients for the time given.* | | |
| `MIGRATE` without `COPY` | Confirm | *The keys are deleted from this server once the other one has them.* | | |
| `SAVE` | Confirm | *The server serves no client until the whole dataset is written to disk.* | | |
| `KEYS`, when the console's database has more than 10,000 keys *(Datardo's choice)* | Confirm | *KEYS reads every key of db0 in one command, and the server serves no other client meanwhile. The keys tab lists the same keys a page at a time.* | *1,204,311 keys*, from `DBSIZE` | |

`KEYS` is run at once when the number of keys could not be read. The other commands that write (`DEL`, `UNLINK`,
`RENAME`, `EXPIRE`, `RESTORE … REPLACE`, and the rest) run with no confirmation: typing the command is the user's
decision, and the keys tab is where a deletion is confirmed and can be undone (`key.delete`).

**5. In a transaction** the commands of rule 4 are queued with no confirmation, since nothing runs yet. `EXEC` is
then confirmed once, with the worst danger of the queued commands, the texts of each of them, and the steps `MULTI`,
the queued commands in order, and `EXEC`. Cancelling it leaves the transaction open.

**6. Everything else** is run.

What the rules do not see: a script is not read, so `EVAL "redis.call('FLUSHALL')" 0` runs with no confirmation on a
connection that allows writes (and is refused on a read-only one, as every `EVAL`); a command renamed on the server
(`rename-command`) is classified by the name typed.

Examples (Cache local allows writes, Cache production is read-only; db0 has 1,204 keys):

| Command | Connection | Result |
| --- | --- | --- |
| `GET greeting` | either | run |
| `SET greeting hi` | Cache local | run, writes |
| `SET greeting hi` | Cache production | refuse `/read-only` |
| `SORT queue` | Cache production, Redis 7.2 | refuse `/read-only`, ending *Use SORT_RO to read.* |
| `PUBLISH orders hi` | Cache production | refuse `/read-only` |
| `SCRIPT LOAD "return 1"` | Cache production | run |
| `MYMODULE.DO x`, flags *unknown* | Cache production | refuse `/unknown-command` |
| `MYMODULE.DO x`, flags *unknown* | Cache local | run |
| `subscribe orders` | either | refuse `/subscribe` |
| `HELLO` | either | run |
| `HELLO 2`, console on RESP3 | either | refuse `/connection-state` |
| `BLPOP queue 0` | Cache local | refuse `/blocks-forever` |
| `BLPOP queue 0` | Cache production | refuse `/read-only` (rule 2 comes first) |
| `XREAD BLOCK 0 STREAMS events $` | either | refuse `/blocks-forever` |
| `XREAD COUNT 10 STREAMS events 0` | either | run |
| `FLUSHDB ASYNC` | Cache local | confirm, Destructive, the user types `db0` |
| `SHUTDOWN ABORT` | Cache local | run |
| `CONFIG GET maxmemory` | either | run |
| `CONFIG SET maxmemory 1gb` | Cache local | confirm, Confirm |
| `CONFIG SET maxmemory 1gb` | Cache production | refuse `/read-only` |
| `KEYS *`, db0 with 10,000 keys | Cache local | run |
| `KEYS *`, db0 with 10,001 keys | either | confirm, Confirm |
| `FLUSHALL` while a transaction is open | Cache local | run (it is queued); the `EXEC` that follows is confirmed, Destructive |

Acceptance:

- [ ] Each row of the examples gives its result.
- [ ] Each command of the table of rule 4 gives its danger, its text and its name to type.
- [ ] On a read-only connection no command of rule 2 is ever sent, whatever its case and whatever the flags the
  server gives it.
- [ ] `BLPOP queue 0` typed after `MULTI` is queued, not refused.
- [ ] After `MULTI`, `SET a 1`, `FLUSHDB`, the `EXEC` opens one confirmation with the steps `MULTI`, `SET a 1`,
  `FLUSHDB`, `EXEC` and the field *Type db0 to confirm*; cancelling it sends no `EXEC` and the prompt still shows the
  transaction.
- [ ] On a Redis 6.2 server the refusal of `SORT queue` on a read-only connection does not mention `SORT_RO`.

### `console.session` — The console's database and transaction

Keeps track of what the console's connection is in: which database, and whether a transaction is open with which
commands queued. The prompt and the status line show it, and `console.classify` reads it.

- **Kind**: Derivation
- **Engine**: Redis
- **Function**: `src/features/console/session.ts › sessionAfter(session, command, reply)`
- **Uses**: `console.run`, `console.classify`, `console.connect`, `console.show`.
- **Ported from**: *New in Datardo*.

Inputs: the session before (`database`, a number; `transaction`, nothing or the list of the queued commands and
whether one of them was rejected; `watching`, whether `WATCH` is in force; `protocol`, 2 or 3), the command sent and
its reply. Output: the session after, and the prompt.

Rules:

1. `SELECT <n>` answered `OK` sets the database to `n`. Answered with an error, nothing changes.
2. `MULTI` answered `OK` opens a transaction with nothing queued.
3. In a transaction, a command answered `QUEUED` joins the queue. A command answered with an error does not, and the
   transaction is marked as rejected: the server will answer `EXEC` with `EXECABORT`.
4. `EXEC`, whatever its reply, and `DISCARD` answered `OK` close the transaction and end the watching.
5. A `SELECT <n>` that was queued sets the database when `EXEC` answers: to the `n` of the last queued `SELECT`
   whose own reply in the array of `EXEC` is `OK`.
6. `WATCH` answered `OK` starts the watching; `UNWATCH` ends it.
7. `SWAPDB` does not change the number of the database. A `SELECT` made inside a script does not either: the server
   puts the connection back on its database when the script ends.
8. When the connection is opened again, the database is the same (`console.connect` selects it), and the transaction
   and the watching are gone.
9. The prompt is `db<n>>`; with a transaction open, `db<n> (MULTI, 2 queued)>`; with a rejected one, `db<n> (MULTI,
   rejected)>`.

When `EXEC` answers nil because a watched key changed, the output adds under `(nil)` the line *The transaction did
not run: a watched key changed.*

Examples, each starting on db0 with no transaction:

| Commands and replies | Session after | Prompt |
| --- | --- | --- |
| `SELECT 3` → `OK` | database 3 | `db3>` |
| `SELECT 99` → `ERR DB index is out of range` | database 0 | `db0>` |
| `MULTI` → `OK`; `SET a 1` → `QUEUED`; `INCR a` → `QUEUED` | transaction with 2 queued | `db0 (MULTI, 2 queued)>` |
| the same, then `EXEC` → `1) OK`, `2) (integer) 2` | no transaction | `db0>` |
| `MULTI` → `OK`; `SET a` → `ERR wrong number of arguments for 'set' command` | transaction, rejected | `db0 (MULTI, rejected)>` |
| the same, then `EXEC` → `EXECABORT Transaction discarded because of previous errors.` | no transaction | `db0>` |
| `MULTI` → `OK`; `SELECT 2` → `QUEUED`; `EXEC` → `1) OK` | database 2, no transaction | `db2>` |
| `MULTI` → `OK`; `DISCARD` → `OK` | no transaction | `db0>` |
| `WATCH a` → `OK`; `MULTI` → `OK`; `SET a 1` → `QUEUED`; `EXEC` → `(nil)` | no transaction, not watching | `db0>` |

Acceptance:

- [ ] Each row of the table gives its session and its prompt.
- [ ] After `SELECT 3`, `SET greeting hi` writes to db3: `GET greeting` in a console on db0 of another connection to
  the same server answers `(nil)`.
- [ ] Closing the tab with a transaction open sends neither `EXEC` nor `DISCARD`: the connection closes and the
  server discards the queue.
- [ ] After the console's connection closed with 2 commands queued, the next command shows *The transaction was
  discarded: the console's connection closed.* and the prompt has no `MULTI`.

### `console.secret-arguments` — Which arguments of a command are secrets

Marks the arguments that hold a password, so that the output, the confirmation, the Log and the history never show
one.

- **Kind**: Derivation
- **Engine**: Redis
- **Function**: `src/features/console/secret-arguments.ts › secretArguments(command)`
- **Uses**: `console.run`, `console.output`, `console.history`, `server.slow-log`, `connection.secrets`.
- **Ported from**: *New in Datardo*.

Input: the arguments of a command. Output: the positions (counted from 0, the command's name being 0) of the
arguments that are secrets. The step of `console.run` carries them, and the runner's text of a step writes `***` in
their place.

Rules, with names and option words compared without case:

1. `AUTH <password>`: position 1. `AUTH <username> <password>`: position 2.
2. `HELLO <version> … AUTH <username> <password> …`: the second argument after the word `AUTH`.
3. `MIGRATE <host> <port> <key> <db> <timeout> …`: from position 6 on and before the word `KEYS`, the argument after
   `AUTH`, and the second argument after `AUTH2`.
4. `CONFIG SET <parameter> <value> [<parameter> <value> …]` (several pairs from Redis 7.0): the value of every
   parameter that is a secret. A parameter is a secret when its name is `requirepass`, or ends with `pass`,
   `password`, `auth` or `secret`: `requirepass`, `masterauth`, `tls-key-file-pass`, `tls-client-key-file-pass`, and
   those other servers add with such names.
5. `ACL SETUSER <username> <rule> …`: every rule that starts with `>`, `<`, `#` or `!` (a password or its hash,
   added or removed).
6. A command with fewer arguments than its rule expects has no secret at a position it does not have.
7. A script is not read: a password written inside the text of `EVAL` is not found.

Examples:

| Command | Secret positions | As the output and the Log write it |
| --- | --- | --- |
| `AUTH s3cret` | 1 | `AUTH ***` |
| `auth app s3cret` | 2 | `auth app ***` |
| `HELLO 3 AUTH app s3cret SETNAME cli` | 4 | `HELLO 3 AUTH app *** SETNAME cli` |
| `MIGRATE 10.0.0.5 6379 "" 0 5000 AUTH2 app s3cret KEYS orders:1 AUTH` | 8 | `MIGRATE 10.0.0.5 6379 "" 0 5000 AUTH2 app *** KEYS orders:1 AUTH` |
| `CONFIG SET requirepass s3cret` | 3 | `CONFIG SET requirepass ***` |
| `CONFIG SET maxmemory 1gb masterauth s3cret` | 5 | `CONFIG SET maxmemory 1gb masterauth ***` |
| `CONFIG SET maxmemory 1gb` | none | `CONFIG SET maxmemory 1gb` |
| `ACL SETUSER app on >s3cret ~orders:* +get` | 4 | `ACL SETUSER app on *** ~orders:* +get` |
| `GET AUTH` | none | `GET AUTH` |
| `AUTH` | none | `AUTH` |

Acceptance:

- [ ] Each row of the table gives its positions and its text.
- [ ] After every command of the table is run, the text `s3cret` is nowhere in the output, in the Log, in a
  confirmation or in the file of the history.
- [ ] The key `AUTH` of the `MIGRATE` example, after `KEYS`, is not masked and masks nothing.

### `console.reply` — A reply as text, by its type

Writes a reply of the server as lines of text that say what type each part is, close to what `redis-cli` prints, so
that nil, an empty string, the text `nil` and the number 0 never look alike.

- **Kind**: Derivation
- **Engine**: Redis
- **Function**: `src/features/console/reply.ts › replyLines(reply, command, protocol)`
- **Uses**: `console.output`, `console.copy-reply`, `console.parse-line`.
- **Ported from**: *New in Datardo*.

Input: the reply as the driver gives it with every RESP type kept apart (a bulk string as bytes, an integer as a
64-bit integer, not as a floating-point number), the name of the command, and the protocol. Output: lines of text,
each with a kind (*value*, *error*, *note*) for its color.

Rules:

| Type | Written as |
| --- | --- |
| Null (RESP3 null, RESP2 null bulk string and null array) | `(nil)` |
| Integer | `(integer) 42`, exact up to 64 bits: `(integer) 9223372036854775807` |
| Simple string | the text with no quotes: `OK`, `QUEUED`, `PONG` |
| Bulk string | in double quotes, written so that `console.parse-line` reads the same bytes back: text that is valid UTF-8 as it is, with `\"` and `\\`, and `\n`, `\r`, `\t`, `\b`, `\a` for those five; every other control character as `\xNN` for each of its bytes; and, in a string that is not valid UTF-8, every byte that is not printable ASCII as `\xNN`, in lower case |
| Verbatim string (RESP3) | its text with no quotes, on as many lines as it has: `INFO`, `CLIENT LIST`, `MEMORY DOCTOR` |
| Double (RESP3) | `(double) 12.5`; `(double) inf`, `(double) -inf`, `(double) nan` |
| Boolean (RESP3) | `(true)`, `(false)` |
| Big number (RESP3) | `(big number) 3492890328409238509324850943850943825024385` |
| Error (simple and bulk) | `(error) ` and the server's text, kind *error*: `(error) WRONGTYPE Operation against a key holding the wrong kind of value` |
| Array | one line per element, numbered from 1: `1) "a"`. An empty one is `(empty array)` |
| Map (RESP3) | one line per pair, numbered from 1: `1# "name" => "Ada"`. An empty one is `(empty map)` |
| Set (RESP3) | one line per member, numbered from 1: `1~ "red"`. An empty one is `(empty set)` |
| Push (RESP3) | as an array, its first line starting with `(push) ` |

More rules:

1. The numbers of an array, a map or a set are right-aligned to the width of the largest one, and what is nested
   inside an element starts under that element's value:

   ```
   1) 1) "orders:1"
      2) (integer) 3
   2) (nil)
   ```

2. On RESP2 the server has neither maps, sets, doubles, booleans nor verbatim strings: `HGETALL` answers a flat array
   of fields and values, `ZSCORE` a bulk string. The console shows what arrived and makes nothing up. One exception,
   as in `redis-cli`: on RESP2 the bulk string that answers `INFO`, `CLIENT LIST`, `CLIENT INFO`, `MEMORY DOCTOR`,
   `MEMORY MALLOC-STATS`, `LATENCY DOCTOR`, `CLUSTER INFO` or `CLUSTER NODES` is written as a verbatim string.
3. A string is decided as a whole: one that is valid UTF-8 is text; one that is not has each of its bytes written as
   printable ASCII or as `\xNN`.
4. Nothing is cut here: `console.output` decides how much is drawn.

Examples (RESP3 unless said):

| Command, on what | Lines |
| --- | --- |
| `GET missing` | `(nil)` |
| `GET empty`, an empty string | `""` |
| `GET word`, the text `nil` | `"nil"` |
| `INCR counter` | `(integer) 42` |
| `SET greeting hi` | `OK` |
| `GET greeting`, the text `hello world` | `"hello world"` |
| `GET name`, the 5 bytes of `café` | `"café"` |
| `GET text`, `line1`, a line feed, `line2` | `"line1\nline2"` |
| `GET json`, the text `{"a":"b"}` | `"{\"a\":\"b\"}"` |
| `GET bin`, the 3 bytes 00 FF 41 | `"\x00\xffA"` |
| `LRANGE queue 0 -1`, two elements | `1) "a"`, `2) "b"` |
| `LRANGE queue 0 -1`, no key | `(empty array)` |
| `HGETALL customer:1` | `1# "name" => "Ada"`, `2# "age" => "36"` |
| `HGETALL customer:1`, RESP2 | `1) "name"`, `2) "Ada"`, `3) "age"`, `4) "36"` |
| `SMEMBERS tags` | `1~ "red"`, `2~ "blue"` |
| `ZSCORE board ada` | `(double) 12.5` |
| `ZSCORE board ada`, RESP2 | `"12.5"` |
| `EXEC` after `SET a 1` and `INCR a` | `1) OK`, `2) (integer) 2` |
| `LPUSH greeting x`, a string key | `(error) WRONGTYPE Operation against a key holding the wrong kind of value` |
| `INFO server` | the lines of the reply as they are, starting with `# Server` |

Acceptance:

- [ ] Each row of the table gives its lines.
- [ ] The line written for a bulk string, pasted as an argument of `SET copy <line>`, stores the same bytes: `GET
  bin` shows `"\x00\xffA"`, and after `SET copy "\x00\xffA"` the two keys are equal for `STRLEN` and for `GETRANGE`.
- [ ] `INCRBY big 9223372036854775806` on a key holding 1 shows `(integer) 9223372036854775807`, not a rounded
  number.
- [ ] An array of 12 elements numbers them ` 1)` to `12)`, aligned to the right.
- [ ] An error reply inside the array of `EXEC` is written `(error) …` on its line, in the error color, and the other
  lines keep theirs.

### `console.output` — The output: commands and their replies

The list of what was run in this console since it was opened or cleared, each command followed by its reply.

- **Kind**: View
- **Engine**: Redis
- **Function**: `src/features/console/output.ts › view(state)`
- **Entry points**: the console tab, above the input. Its items are a list (`@list`), each with a context menu
  (`@item-menu`).
- **Uses**: `console.reply`, `console.secret-arguments`, `console.copy-reply`, `console.run`, `console.clear`,
  `value.format`, `nav.inspector`.
- **Ported from**: *New in Datardo*.

What it shows, for each command, the oldest at the top:

1. The prompt the command was typed at and the command as typed, with each secret argument replaced by `***`
   (`console.secret-arguments`); at its right the time it was sent (`14:05:09`) and the time the reply took (`0.4
   ms`, `12 ms`, `1.24 s`).
2. The reply, as the lines of `console.reply`, in a monospaced font; errors, refusals and notes each in their color.
3. A context menu: **Copy reply**, **Copy value**, **Copy command** (`console.copy-reply`), **Run again**
   (`console.run`).

Limits, all *(Datardo's choice)*:

- The output keeps the last 500 commands with their replies; older ones are dropped from the top.
- An array, a map or a set shows its first 1,000 elements, then the button **Show 1,000 more** with *1,000 of
  12,500*.
- A string longer than 10,000 characters shows its first 10,000, then `…` and **Show all** with its size (*1.0
  MB*).
- A reply of more than 16 MB is kept up to 16 MB, and ends with the note *Cut at 16 MB of 512.0 MB.*

The output follows the newest reply unless the user scrolled up; then a button **Newest** appears at its bottom.

A click on a string of a reply selects it, and the inspector island shows that value through `value.format`: as text,
as formatted JSON when it parses, in hexadecimal when it is not valid UTF-8, with its size in bytes and **Copy**
(`nav.inspector`). `Esc` clears the selection. A console with nothing selected hides the inspector island.

Acceptance:

- [ ] After `GET greeting` the output ends with the line `db0> GET greeting`, the time, and under it `"hello
  world"`.
- [ ] The 501st command drops the first one from the output.
- [ ] `LRANGE queue 0 -1` on a list of 12,500 elements shows 1,000 lines and **Show 1,000 more**; a click shows
  2,000.
- [ ] `GET blob` on a string of 1,048,576 characters shows 10,000 of them and **Show all**; **Copy reply** copies
  all 1,048,576.
- [ ] A click on the reply `"{\"a\":\"b\"}"` shows in the inspector island the JSON formatted on three lines, and
  *9 bytes*.
- [ ] A click on the reply `"\x00\xffA"` shows `00 ff 41` in the inspector island, and *3 bytes*.
- [ ] With the output scrolled up, a new reply does not move it, and **Newest** goes to the bottom.
- [ ] A refused command shows its line and, under it, the refusal's message in the error color; nothing else.
- [ ] The output is read by a screen reader as a list, each item as its command followed by its reply.

### `console.copy-reply` — Copy a reply

Copies a reply, one of its values, or the command, to the clipboard.

- **Kind**: Operation
- **Engine**: Redis
- **Function**: `src/features/console/copy-reply.ts › plan(context, answers)`
- **Entry points**: **Copy reply**, **Copy value** and **Copy command** in the context menu of an item of the output
  (`@item-menu`); `Ctrl+C` with an item of the output focused and no text selected copies its reply; **Copy** in the
  inspector island for the selected value (`@inspector`).
- **Offered when**: **Copy value** only when the menu was opened on a string of the reply.
- **Plan**: no step to a deployment. One app step, `copy the reply of GET greeting to the clipboard`.
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone: it changes only the clipboard.
- **After**: notifies *Copied.*
- **Commands**: `console.copy-reply:reply`, `console.copy-reply:value`, `console.copy-reply:command`
- **Uses**: `console.reply`, `console.output`, `value.format`, `runner.notify`.
- **Ported from**: *New in Datardo*.

Acceptance:

- [ ] **Copy reply** copies every line of `console.reply` for the whole reply, also the parts the output has not
  drawn yet, joined by line feeds.
- [ ] **Copy value** on `"hello world"` copies `hello world`, without the quotes and with its escapes undone.
- [ ] **Copy value** on a string that is not valid UTF-8 copies its bytes in hexadecimal, as `value.format` writes
  them: `00ff41`.
- [ ] **Copy command** on `AUTH app ***` copies `AUTH app ***`: the password was never kept.
- [ ] Copying writes nothing in the Log but the app step, and sends nothing to the server.

### `console.clear` — Clear the output

Empties the output of the console. The history of commands, the database and an open transaction stay.

- **Kind**: Operation
- **Engine**: Redis
- **Function**: `src/features/console/clear.ts › plan(context, answers)`
- **Entry points**: **Clear output** in the console's toolbar (`@toolbar`); `Ctrl+L` in the input; Go to (**Clear
  console output**).
- **Offered when**: a console tab is active.
- **Plan**: no step to a deployment. One app step, `clear the output of the console of Cache local`.
- **Danger**: None: no confirmation, since nothing but what is on screen is lost, and the commands are still in the
  history and in the Log.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone: the replies are not kept anywhere else.
- **After**: the output shows its empty state; the focus is in the input.
- **Commands**: `console.clear`
- **Uses**: `console.output`.
- **Ported from**: *New in Datardo*.

Acceptance:

- [ ] `Ctrl+L` empties the output and sends nothing to the server.
- [ ] After clearing, `Up` still brings back the last command.
- [ ] Clearing with a transaction open leaves the prompt `db0 (MULTI, 2 queued)>`.
- [ ] Clearing while a command runs keeps that command in the output, with its reply when it arrives.

### `console.history` — The history of commands

The commands run in the console of a connection, kept between sessions, so that `Up` brings back what was typed
yesterday. A command with a password is never kept.

- **Kind**: Derivation
- **Engine**: Redis
- **Function**: `src/features/console/history.ts › historyAfter(history, line, secrets, size)`
- **Settings**: `datardo.console.historySize`, how many commands are kept for each connection: 500 by default
  *(Datardo's choice)*, from 0 (none) to 5,000.
- **Uses**: `console.run`, `console.input`, `console.secret-arguments`, `console.clear-history`,
  `connection.remove`.
- **Ported from**: *New in Datardo*.

Inputs: the history of the connection (lines of text, the oldest first), the line just sent, the secret positions
`console.secret-arguments` found in it, and the size. Output: the history after.

Rules:

1. A line is kept as it was typed, without the spaces at its ends. A run of several lines keeps each line as its own
   command.
2. A line is kept when it was sent to the server, whatever the reply. A line that was refused, that could not be
   read, or whose confirmation was cancelled is not kept: it is still in the input.
3. A line with a secret argument is never kept. Neither is any `AUTH`, nor any `HELLO` that has the word `AUTH`,
   whatever its arguments.
4. A line equal to the newest one of the history is not added again.
5. Beyond the size, the oldest lines are dropped. With the size 0 nothing is kept.

The history is kept per connection, in a file of Datardo's data folder, and is the same for every console of that
connection across restarts. Removing the connection deletes it (`connection.remove`). It is not part of an exported
connections file.

Going through it, in the input (`console.input`): `Up` shows the line before the one shown, `Down` the one after;
`Down` past the newest brings back what was being typed before the first `Up`. A line brought back can be edited
before it is run; the history keeps the line as it was.

Examples (size 500 unless said):

| History before | Line sent | History after |
| --- | --- | --- |
| *(empty)* | `GET greeting` | `GET greeting` |
| `GET greeting` | `GET greeting` | `GET greeting` |
| `GET greeting` | `  SET a 1  ` | `GET greeting`, `SET a 1` |
| `GET greeting`, `SET a 1` | `GET greeting` | `GET greeting`, `SET a 1`, `GET greeting` |
| `GET greeting` | `AUTH app s3cret` | `GET greeting` |
| `GET greeting` | `CONFIG SET requirepass s3cret` | `GET greeting` |
| `GET greeting` | `CONFIG SET maxmemory 1gb` | `GET greeting`, `CONFIG SET maxmemory 1gb` |
| `a`, `b`, with the size 2 | `c` | `b`, `c` |
| `a`, `b`, with the size 0 | `c` | *(empty)* |

Acceptance:

- [ ] Each row of the table gives its history.
- [ ] After `GET a`, `GET b`, `GET c`: `Up`, `Up` shows `GET b`; `Down` shows `GET c`; `Down` again shows the empty
  input.
- [ ] With `GET x` typed and not run, `Up` then `Down` shows `GET x` again.
- [ ] A command run in the console of Cache local is not offered by `Up` in the console of Cache production.
- [ ] After a restart of Datardo, `Up` in the console of Cache local shows the last command run before the restart.
- [ ] The file of the history never holds a line that `console.secret-arguments` marks.
- [ ] After the connection is removed, its file of history is gone.

### `console.clear-history` — Clear the history of commands

Deletes the commands kept for the console of one connection.

- **Kind**: Operation
- **Engine**: Redis
- **Function**: `src/features/console/clear-history.ts › plan(context, answers)`
- **Entry points**: Go to (**Clear console history**).
- **Offered when**: the current connection is a Redis connection.
- **Plan**: no step to a deployment. One app step, `clear the console history of Cache local`.
- **Danger**: Confirm: **Clear the console history of Cache local?** with *The 212 commands kept for this connection
  are forgotten.* The button is **Clear history**.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone: the commands are kept nowhere else; the confirmation says so.
- **After**: notifies *Cleared the console history of Cache local.* The output of an open console stays.
- **Refuses**: the history is already empty, *The console history of Cache local is already empty.* (`/empty`).
- **Commands**: `console.clear-history`
- **Uses**: `console.history`, `runner.confirm`, `runner.notify`.
- **Ported from**: *New in Datardo*.

Acceptance:

- [ ] After **Clear history**, `Up` in the console of Cache local shows nothing, and the console of another
  connection still has its history.
- [ ] The confirmation says how many commands are forgotten and that it cannot be undone.
- [ ] With an empty history the refusal is `console.clear-history/empty` and no confirmation opens.

### `console.command-docs` — The commands the server knows, and their arguments

The names, the summaries and the arguments of the server's commands, for autocomplete and for the hint.

- **Kind**: Read
- **Engine**: Redis
- **Function**: `src/features/console/command-docs.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: none of its own: the console tab, once for each time its connection is opened, without making
  the input wait.
- **Reads**: `COMMAND DOCS`, with no argument, on a server whose version is 7.0 or later. It is sent on the
  connection's ordinary client, not on the console's, so that a command typed meanwhile does not wait for it.
- **Uses**: `console.autocomplete`, `console.argument-hint`, `console.classify`.
- **Ported from**: *New in Datardo*.

Rules:

1. From the reply, per command: its name, `summary`, `since`, `group`, `arguments`, `subcommands` (each with the
   same fields, named `<command>|<subcommand>`), and whether it is deprecated (`doc_flags` holds `deprecated`), with
   `deprecated_since` and `replaced_by`. The commands of the modules loaded on the server are in the reply like the
   others.
2. An argument has a `name`, a `type` (`string`, `integer`, `double`, `key`, `pattern`, `unix-time`, `pure-token`,
   `oneof`, `block`), maybe a `display_text`, a `token`, `flags` (`optional`, `multiple`, `multiple_token`) and, for
   `oneof` and `block`, its own `arguments`.
3. `COMMAND DOCS` needs Redis 7.0. On an older server, on a server that answers it with an error (`ERR unknown
   subcommand`, `NOPERM`), and until the reply arrives, the result is Datardo's built-in list: the commands of
   Redis 7.2 *(Datardo's choice)* with the same fields and the flags of `COMMAND INFO`, made from the documentation
   of Redis and shipped with the app.
4. From the built-in list, the commands and the arguments whose `since` is later than the version of the server
   (`redis_version` of `INFO`) are left out.

Acceptance:

- [ ] On Redis 7.2 the names offered are those `COMMAND DOCS` answered, a module's commands included.
- [ ] On Redis 6.2 no `COMMAND DOCS` is sent, the names come from the built-in list, and `FCALL`, `FUNCTION`,
  `EVAL_RO`, `LMPOP` and `SINTERCARD` (all 7.0) are not among them.
- [ ] On Redis 6.2 the hint of `SET` has `GET` and `EXAT` (both 6.2), and the hint of `EXPIRE` has no `NX` (7.0).
- [ ] A user whose ACL denies `COMMAND` on Redis 7.2 gets the built-in list, and no error is shown.
- [ ] Typing while the reply has not arrived completes from the built-in list.

### `console.autocomplete` — Complete the names of commands

Offers, as the user types, the commands and the subcommands that start with what is typed.

- **Kind**: Derivation
- **Engine**: Redis
- **Function**: `src/features/console/autocomplete.ts › suggestions(text, caret, docs)`
- **Uses**: `console.command-docs`, `console.input`, `console.argument-hint`.
- **Ported from**: *New in Datardo*.

Inputs: the text of the line the caret is on, the place of the caret, and the commands of `console.command-docs`.
Output: the suggestions in order, each with the text it writes, its summary and a mark when it is deprecated; and the
part of the line a suggestion replaces.

Rules:

1. With the caret in the first word of the line: the commands whose name starts with the letters typed, without
   case. One letter is enough; with nothing typed the list opens only on `Ctrl+Space`, with every command.
2. With the caret in the second word, and a first word that names a command with subcommands (`CONFIG`, `CLIENT`,
   `OBJECT`, `MEMORY`, `XGROUP`, …): its subcommands that start with the letters typed; with nothing typed after the
   space, all of them.
3. Anywhere else, and inside quotes: nothing.
4. The order is by name; deprecated commands come after the others, each with what `deprecated_since` and
   `replaced_by` say: *deprecated since 2.0.0: use GETRANGE* for `SUBSTR`.
5. A suggestion writes the name in upper case, in place of the word typed, followed by one space.
6. The list shows 10 suggestions at a time *(Datardo's choice)* and scrolls; the first is selected. `Up` and `Down`
   move in it while it is open, `Tab` takes the selected one, `Esc` closes it, and `Enter` runs the line as it is.

Examples, with the commands of Redis 7.2 (`|` is the caret):

| Line | Suggestions |
| --- | --- |
| `ge|` | `GEOADD`, `GEODIST`, `GEOHASH`, `GEOPOS`, `GEOSEARCH`, `GEOSEARCHSTORE`, `GET`, `GETBIT`, `GETDEL`, `GETEX`, `GETRANGE`, then `GEORADIUS`, `GEORADIUSBYMEMBER`, `GEORADIUSBYMEMBER_RO`, `GEORADIUS_RO`, `GETSET`, deprecated |
| `GETR|` | `GETRANGE` |
| `config |` | `GET`, `HELP`, `RESETSTAT`, `REWRITE`, `SET` |
| `config re|` | `RESETSTAT`, `REWRITE` |
| `GET gre|` | none |
| `SET k "ge|` | none |
| `|`, after `Ctrl+Space` | every command, by name |
| `zz|` | none: the list does not open |

Acceptance:

- [ ] Each row of the table gives its suggestions.
- [ ] `Tab` on `GETRANGE` after `getr` makes the line `GETRANGE ` with the caret after the space.
- [ ] `Tab` on `REWRITE` after `config re` makes the line `config REWRITE `.
- [ ] `Enter` with the list open on `ge` runs `ge`, which the server answers with an error; it does not take
  `GEOADD`.
- [ ] On a Redis 6.2 server `Ctrl+Space` does not list `FCALL`.

### `console.argument-hint` — The hint of a command's arguments

Shows, under the input, how the command being typed is written, as the documentation of Redis writes it.

- **Kind**: Derivation
- **Engine**: Redis
- **Function**: `src/features/console/argument-hint.ts › syntaxLine(commandDocs)`
- **Uses**: `console.command-docs`, `console.input`.
- **Ported from**: *New in Datardo*. The syntax is the one of the pages of redis.io, built from the same data.

Input: the entry of `console.command-docs` for the command the first word of the line names, or for its subcommand
when the second word names one. Output: the syntax on one line, the summary, and *Since 6.2.0*; nothing when the
first word names no command.

Rules of the syntax, for each argument in order, joined by spaces after the command's name in upper case:

1. An argument of the type `pure-token` is its `token`: `NX`.
2. Any other argument is its `display_text`, else its `name`; with a `token`, the token comes before it: `EX
   seconds`.
3. A `oneof` is its arguments joined by ` | `, between `<` and `>` when it is not optional: `<NX | XX>`.
4. A `block` is its arguments joined by spaces.
5. With the flag `multiple`, what was written is followed by itself in brackets with three dots: `key [key ...]`.
   With `multiple_token` too, the token is repeated: `[GET pattern [GET pattern ...]]` in `SORT`.
6. With the flag `optional`, the whole is between `[` and `]`.

Examples:

- `GET` → `GET key` · *Returns the string value of a key.* · *Since 1.0.0*
- `SET` → `SET key value [NX | XX] [GET] [EX seconds | PX milliseconds | EXAT unix-time-seconds | PXAT
  unix-time-milliseconds | KEEPTTL]`
- `HSET` → `HSET key field value [field value ...]`
- `DEL` → `DEL key [key ...]`
- `SCAN` → `SCAN cursor [MATCH pattern] [COUNT count] [TYPE type]`
- `ZADD` → `ZADD key [NX | XX] [GT | LT] [CH] [INCR] score member [score member ...]`
- `CONFIG SET` (Redis 7.0) → `CONFIG SET parameter value [parameter value ...]`
- `BLPOP` → `BLPOP key [key ...] timeout`

The hint appears when the first word is complete (a space follows it) or names a command exactly, and stays while
the rest of the line is typed. It is one line, cut with `…` when it does not fit, whole in its tooltip.

Acceptance:

- [ ] Each example gives exactly its syntax, with the documentation of Redis 7.2.
- [ ] Typing `set ` shows the hint of `SET`; typing `config set ` shows the hint of `CONFIG SET`, not of `CONFIG`.
- [ ] Typing `foo ` shows no hint.
- [ ] On a Redis 6.2 server the hint of `SET` is `SET key value [NX | XX] [GET] [EX seconds | PX milliseconds | EXAT
  unix-time-seconds | PXAT unix-time-milliseconds | KEEPTTL]`, and the hint of `EXPIRE` is `EXPIRE key seconds`.
- [ ] A screen reader is told the hint when it changes, politely.

### `console.stop` — Stop waiting for a reply

Ends the wait for a command that takes too long: a blocking pop, a script, a `KEYS` on a large database.

- **Kind**: Operation
- **Engine**: Redis
- **Function**: `src/features/console/stop.ts › plan(context, answers)`
- **Entry points**: **Stop**, which takes the place of **Run** while a command runs (`@editor`); `Esc` in the input
  with no list of suggestions open; Go to (**Stop console command**).
- **Offered when**: a command of the console is waiting for its reply.
- **Plan**: no command to the server. The app step `close the console's connection to Cache local`, then the plan of
  `console.connect`.
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone: there is nothing to put back. What the command had already written stays written.
- **After**: under the command, the output says *Stopped after 12.4 s. The console's connection was closed and
  opened again; the server may still finish the command.* The database is selected again; an open transaction is
  discarded, and the output says so (`console.connect`).
- **Commands**: `console.stop`
- **Uses**: `console.connect`, `console.session`, `console.output`.
- **Ported from**: *New in Datardo*.

A command that was sent cannot be taken back, which is why the list of work in progress shows it with *Already sent
to the server.* and no **Cancel**: closing the connection is the one way to stop waiting. A client that waits in a
blocking command is dropped by the server with its connection, and pops nothing. A script or a `KEYS` goes on until
it ends: the server does not notice the closed connection before.

Acceptance:

- [ ] **Stop** during `BLPOP queue 30` shows the note at once, and `LPUSH queue x` from another client afterwards
  leaves `x` in the list: nothing popped it.
- [ ] After **Stop** the prompt shows the same database as before, and the next command runs.
- [ ] **Stop** with a transaction open shows *The transaction was discarded: the console's connection closed.*
- [ ] After **Stop** during a script that writes, the keys the script wrote before and after the stop are on the
  server: the note says that the server may still finish the command.
- [ ] With no command running, `Esc` in the input does nothing and **Stop** is not shown.
