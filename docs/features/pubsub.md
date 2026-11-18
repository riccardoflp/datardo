# Pub/Sub

The Pub/Sub page of a Redis connection: subscribing to channels and to patterns, the list of the messages as they
arrive with its pause, its filter and its limit, the detail of a message, copying and exporting the messages,
publishing one, the channels active on the server, and what happens when the connection drops. The page also follows
the redis-oplog events of a MongoDB connection: opened from the linked connection, it shows each event Datardo and
the Meteor apps publish, with its operation, its collection and its document.

Redis keeps nothing of Pub/Sub: a message goes to whoever is subscribed when it is published and is then gone. The
page therefore shows what arrived while it was subscribed, and says so where a gap is possible.

The examples use the Redis connections **Cache local** (allows writes) and **Cache production** (read-only), and the
MongoDB connection **Local**, linked to Cache local with the channel prefix `app:` and the namespace `tenant1`.

### `pubsub.show` — The Pub/Sub page

One page tab per Redis connection that subscribes to channels and patterns and lists their messages.

- **Kind**: View
- **Engine**: Redis
- **Function**: `src/features/pubsub/show.ts › view(state)`
- **Entry points**: **Pub/Sub** under **Pages of** the connection in the tree island (`@tree`); Go to (**Pub/Sub**);
  **Open Pub/Sub** on the console's refusal of `SUBSCRIBE` (`console.classify`); **Follow events** on a linked
  connection (`pubsub.follow-oplog`).
- **Offered when**: the current connection is a Redis connection. Opening the page connects it when it is not
  connected (`connection.connect`).
- **After**: the tab is titled **Pub/Sub** in the group of its connection, and its path is `Cache local / Pub/Sub`.
  A second request for the same connection makes the open tab active and opens no second one.
- **Commands**: `pubsub.show`
- **Uses**: `pubsub.subscribe`, `pubsub.subscriptions`, `pubsub.unsubscribe`, `pubsub.channels`, `pubsub.messages`,
  `pubsub.pause`, `pubsub.clear`, `pubsub.filter`, `pubsub.inspect`, `pubsub.copy`, `pubsub.export`,
  `pubsub.publish`, `pubsub.reconnect`, `pubsub.follow-oplog`, `tab.open`, `tab.restore`, `nav.inspector`,
  `nav.status-line`, `connection.read-only`.
- **Ported from**: *New in Datardo*. The words of its state, **Pause**, **Resume** and **Clear** are those of
  Mongoster's Watch tab (`src/webview/watch.ts`).

What the page shows:

1. The toolbar (`@toolbar`): the field **Channel or pattern** with its kind (**Auto**, **Channel**, **Pattern**) and
   **Subscribe** (`pubsub.subscribe`); **Pause** (`pubsub.pause`); **Clear** (`pubsub.clear`); the field **Filter
   messages** (`pubsub.filter`); **Events of** (`pubsub.follow-oplog`), shown when a MongoDB connection is linked to
   this one; **Export…** (`pubsub.export`); **Publish…** (`pubsub.publish`).
2. The state, on one line: **● Listening**, **❚❚ Paused · 42 new**, **○ Connecting…**, **■ Disconnected · trying
   again in 4 s** or **■ Not subscribed**; then the counts, *3 subscriptions · 1,204 messages*.
3. At the left, two lists: **Subscriptions** (`pubsub.subscriptions`) and **Active channels** (`pubsub.channels`).
4. The list of messages (`pubsub.messages`), the newest at the top.

The inspector island shows the message selected (`pubsub.inspect`).

States:

- **Not subscribed**: the list of messages shows *Subscribe to a channel or to a pattern to see its messages. A
  message published before you subscribe is not shown: Redis does not keep it.* (`@empty-state`), with the active
  channels still listed.
- **Listening, no message yet**: *Listening. No message has arrived yet.*
- **Disconnected**: the banner of `pubsub.reconnect`.
- **Read-only**: the status line shows **Read-only**; **Publish…** is disabled with *The connection Cache
  production is read-only.* as tooltip. Subscribing is allowed.

The subscriptions, the kind of the field, the filter, **Events of** and the last channel published to are kept with
the tab and restored with it (`tab.restore`): after a restart the page subscribes again to the same channels and
patterns. The messages are not kept: the list starts empty.

The subscriptions live as long as the tab is open, also while another tab is active: messages keep arriving and are
listed when the user comes back. Channels do not belong to a database: the page has no database.

The status line shows, for the active page, *37 of 1,204 messages* with a filter and *1,204 messages* without.

Acceptance:

- [ ] Opening **Pub/Sub** on Cache local opens one tab titled **Pub/Sub** in Cache local's group; opening it again
  makes that tab active and opens no second one.
- [ ] With a MongoDB connection current, neither the tree island nor Go to offers **Pub/Sub**.
- [ ] A page with no subscription shows **■ Not subscribed** and the empty state above, and sends neither
  `SUBSCRIBE` nor `PSUBSCRIBE`.
- [ ] With the Pub/Sub tab open and another tab active, a message published to a subscribed channel is in the list
  when the user comes back to the tab.
- [ ] After a restart of Datardo the restored page shows the same subscriptions, is subscribed to them, and has no
  messages.
- [ ] Closing the tab closes the page's connection: `PUBSUB NUMSUB orders` from another client no longer counts it.
- [ ] On Cache production **Publish…** is disabled with *The connection Cache production is read-only.*, and
  **Subscribe** works.

### `pubsub.subscribe` — Subscribe to a channel or to a pattern

Starts receiving the messages of one or more channels, or of every channel whose name matches a pattern.

- **Kind**: Operation
- **Engine**: Redis
- **Function**: `src/features/pubsub/subscribe.ts › plan(context, answers)`
- **Entry points**: the field **Channel or pattern** with `Enter`, and **Subscribe** beside it (`@toolbar`);
  **Subscribe** on an item of **Active channels** and a double click on it (`@list`); Go to (**Subscribe to a
  channel…**), which asks for the name and the kind.
- **Offered when**: a Pub/Sub page is active.
- **Asks**: nothing from the toolbar. From Go to: **Channel or pattern** (text, required) and its kind (**Auto**,
  the default, **Channel**, **Pattern**).
- **Reads**: the address and the credentials of the saved connection, for the page's own connection
  (`connection.secrets`).
- **Plan**: the names typed are read as `console.parse-line` reads a line, so several names are separated by spaces
  and a name with a space is in quotes. With the kind **Auto**, a name that holds `*`, `?` or `[` is a pattern and
  any other is a channel. Then:
  1. Only when the page has no connection of its own yet: `open a connection to cache.example.com:6379 for Pub/Sub`,
     then `HELLO 3 AUTH app *** SETNAME datardo-pubsub`, as `console.connect` does for the console, with the same
     fall-back to `AUTH` and `CLIENT SETNAME datardo-pubsub` on a server without `HELLO 3`.
  2. `SUBSCRIBE orders invoices`, with every new channel in one command.
  3. `PSUBSCRIBE orders:*`, with every new pattern in one command.

  A name the page is already subscribed to, with the same kind, is left out. The title is **Subscribe to orders**.
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment: a subscription changes only what the server
  sends to Datardo's own connection.
- **Undo**: Cannot be undone from the undo history: nothing is written. `pubsub.unsubscribe` ends a subscription.
- **After**: each new subscription joins **Subscriptions**; the field is emptied; the state becomes **● Listening**.
  An error of the server for one of the commands is shown under the field and the names of that command are not
  added: with a reply that starts with `NOPERM`, *The user of this connection may not subscribe to orders: <the
  server's message>*.
- **Refuses**: every name typed is already subscribed, *Already subscribed to orders.* (`/already-subscribed`); the
  page would have more than 100 subscriptions *(Datardo's choice)*, *A Pub/Sub page holds up to 100 subscriptions.
  Use a pattern to follow many channels.* (`/too-many`); the text cannot be read, with the message of
  `console.parse-line` (`/invalid-name`); the saved connection is not connected and cannot be connected, *Cache
  local is not connected.* (`/not-connected`).
- **Commands**: `pubsub.subscribe`
- **Uses**: `console.parse-line`, `console.connect`, `pubsub.subscriptions`, `pubsub.messages`,
  `pubsub.reconnect`, `connection.secrets`, `runner.ask`, `runner.run`, `runner.log`.
- **Ported from**: *New in Datardo*.

The page's connection is its own, apart from the connection's ordinary client and from the console's: a connection
that subscribes cannot run other commands on RESP2, and a flood of messages must not delay the keys tabs. It is
opened by the first subscription and closed when the last one is removed or the tab is closed.

Sharded Pub/Sub (`SSUBSCRIBE`, Redis 7.0) belongs to Redis Cluster, which Datardo does not support yet: the page
does not offer it.

Acceptance:

- [ ] `orders` with the kind **Auto** sends `SUBSCRIBE orders`; `orders:*` sends `PSUBSCRIBE orders:*`.
- [ ] `orders:*` with the kind **Channel** sends `SUBSCRIBE orders:*`, and only a message published to the channel
  named `orders:*` is listed.
- [ ] `orders invoices "my channel" news:*` with **Auto** sends `SUBSCRIBE orders invoices "my channel"` and
  `PSUBSCRIBE news:*`, and adds four subscriptions.
- [ ] After `SUBSCRIBE orders`, `PUBLISH orders hello` from another client adds one message to the list, with the
  channel `orders` and the message `hello`.
- [ ] The first subscription opens one more client on the server, named `datardo-pubsub`; the second opens none.
- [ ] Subscribing to `orders` twice sends one `SUBSCRIBE orders`; the second time is refused with
  `pubsub.subscribe/already-subscribed`.
- [ ] `orders` as a channel and `orders` as a pattern are two subscriptions.
- [ ] With 100 subscriptions, one more is refused with `pubsub.subscribe/too-many` and nothing is sent.
- [ ] On Cache production, a read-only connection, `SUBSCRIBE orders` is sent and the messages are listed.
- [ ] A user whose ACL allows no channel gets *The user of this connection may not subscribe to orders: …* under the
  field, and `orders` is not in **Subscriptions**.
- [ ] The Log has `[pubsub.subscribe] PSUBSCRIBE orders:*`.

### `pubsub.subscriptions` — The list of subscriptions

The channels and the patterns the page is subscribed to, with how many messages each has brought.

- **Kind**: View
- **Engine**: Redis
- **Function**: `src/features/pubsub/subscriptions.ts › view(state)`
- **Entry points**: the list **Subscriptions** at the left of the Pub/Sub page (`@list`), each item with a context
  menu (`@item-menu`).
- **Uses**: `pubsub.unsubscribe`, `pubsub.publish`, `pubsub.filter`, `pubsub.copy`.
- **Ported from**: *New in Datardo*.

What it shows:

1. The header **Subscriptions** with their number, and **Unsubscribe from all** when there are two or more.
2. One item per subscription, in the order they were made: a mark for its kind (**channel** or **pattern**, also said
   by its tooltip), its name, the number of messages received through it since it was made, and `✕` (**Unsubscribe**).
3. The context menu of an item: **Show only its messages**, which puts the subscription in the filter
   (`pubsub.filter`); **Publish to this channel…** on a channel (`pubsub.publish`); **Copy name**; **Unsubscribe**.

A name that is not valid UTF-8 is written as the console writes a string, with `\xNN` for its bytes.

Acceptance:

- [ ] After subscribing to `orders` and to `news:*`, the list has two items in that order, the first marked
  **channel**, the second **pattern**.
- [ ] Three messages published to `orders` make the count of `orders` 3; clearing the list of messages
  (`pubsub.clear`) puts every count back to 0.
- [ ] A subscription whose command the server has not answered yet is shown dimmed, with the tooltip *Subscribing…*
- [ ] **Publish to this channel…** is not in the menu of a pattern.
- [ ] With no subscription the list shows *No subscriptions.*

### `pubsub.unsubscribe` — Remove a subscription

Stops receiving the messages of one channel or pattern, or of all of them.

- **Kind**: Operation
- **Engine**: Redis
- **Function**: `src/features/pubsub/unsubscribe.ts › plan(context, answers)`
- **Entry points**: `✕` on an item of **Subscriptions** and **Unsubscribe** in its context menu (`@list`,
  `@item-menu`); `Delete` on a focused item; **Unsubscribe from all** in the header of the list (`@list`); Go to
  (**Unsubscribe from all channels**).
- **Offered when**: the page has a subscription.
- **Plan**: `UNSUBSCRIBE orders` for a channel, `PUNSUBSCRIBE orders:*` for a pattern. For all: `UNSUBSCRIBE` with
  every channel, then `PUNSUBSCRIBE` with every pattern. When no subscription is left: `close the Pub/Sub connection
  to Cache local`.
- **Danger**: None: no confirmation, since nothing is lost that subscribing again does not bring back, and the
  messages already listed stay.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone from the undo history: nothing is written. Subscribing again starts it again; the
  messages published in between are not received.
- **After**: the subscription leaves the list at once; its messages stay in the list of messages. With none left the
  state is **■ Not subscribed**.
- **Commands**: `pubsub.unsubscribe`, `pubsub.unsubscribe:all`
- **Uses**: `pubsub.subscriptions`, `pubsub.messages`, `runner.run`.
- **Ported from**: *New in Datardo*.

Acceptance:

- [ ] `✕` on the channel `orders` sends `UNSUBSCRIBE orders`; a message published to `orders` afterwards is not
  listed, and the messages of `orders` already listed are still there.
- [ ] `✕` on the pattern `orders:*` sends `PUNSUBSCRIBE orders:*`.
- [ ] **Unsubscribe from all** with the channels `a`, `b` and the pattern `c:*` sends `UNSUBSCRIBE a b` and
  `PUNSUBSCRIBE c:*`, then closes the page's connection: the server no longer has a client named `datardo-pubsub`.
- [ ] Removing a subscription while the page is disconnected removes it from the list and sends nothing; it is not
  subscribed again when the connection comes back.
- [ ] While paused, removing a subscription keeps the messages held for it.

### `pubsub.channels` — The channels active on the server

Lists the channels that have at least one subscriber right now, with how many, so that the user sees what there is
to follow.

- **Kind**: Read
- **Engine**: Redis
- **Function**: `src/features/pubsub/channels.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: the list **Active channels** at the left of the Pub/Sub page (`@list`), with its own filter field
  and **Refresh**; each item has **Subscribe** (`pubsub.subscribe`) and, in its context menu (`@item-menu`),
  **Publish to this channel…** (`pubsub.publish`) and **Copy name**.
- **Reads**: on the connection's ordinary client, not on the page's own:
  1. `PUBSUB CHANNELS`, or `PUBSUB CHANNELS *paid*` when the list's filter holds `paid`. A filter with `*`, `?` or
     `[` is sent as it is typed, as a pattern.
  2. `PUBSUB NUMSUB <channels>`, with the first 200 channels *(Datardo's choice)* by name.
  3. `PUBSUB NUMPAT`.

  They are read when the page opens, with **Refresh**, when the filter changes (300 ms after the last key
  *(Datardo's choice)*), and every 5 seconds *(Datardo's choice)* while the tab is the active tab and the window is
  visible.
- **Uses**: `pubsub.subscribe`, `pubsub.publish`, `pubsub.show`.
- **Ported from**: *New in Datardo*.

Rules of `parse`:

1. The channels are sorted by name, as bytes. The first 200 are shown, with *200 of 12,400 channels* under them when
   there are more; the filter narrows them.
2. Each channel has the count `PUBSUB NUMSUB` gave it: the clients subscribed to it by name. A subscription of this
   page counts as one, and the item then says *(this page too)*.
3. The line under the list is *3 patterns subscribed on the server*, from `PUBSUB NUMPAT`; this page's patterns are
   among them.
4. A channel that only pattern subscribers follow is not listed: the server lists the channels subscribed to by
   name.
5. A reply that arrives after a newer request was sent is dropped.

What the list shows when a command cannot run:

- a reply that starts with `NOPERM`: *PUBSUB CHANNELS needs a user that may run it: <the server's message>*, and no
  channels. When only `PUBSUB NUMSUB` or `PUBSUB NUMPAT` is refused, the channels are listed without counts, or the
  line of the patterns is left out;
- a reply that starts with `ERR unknown command` or `ERR unknown subcommand`: *This server does not allow PUBSUB
  CHANNELS: <the server's message>*.

Subscribing by typing a name still works in both cases. The three commands exist since Redis 2.8, so no supported
server is too old for them.

Acceptance:

- [ ] With two clients subscribed to `orders` and one to `invoices`, the list shows `invoices` with 1 and `orders`
  with 2, in that order.
- [ ] After this page subscribes to `orders`, the next read shows `orders` with 3 and *(this page too)*.
- [ ] Typing `inv` in the list's filter sends `PUBSUB CHANNELS *inv*`; typing `inv:*` sends `PUBSUB CHANNELS inv:*`.
- [ ] With 12,400 active channels, `PUBSUB NUMSUB` is sent with 200 channels, and the list says *200 of 12,400
  channels*.
- [ ] With another tab active for 30 seconds, no `PUBSUB` command is sent in that time.
- [ ] A server with no subscriber shows *No active channels: nobody is subscribed to a channel by name.*
- [ ] A user whose ACL denies `PUBSUB` sees *PUBSUB CHANNELS needs a user that may run it: …* in place of the list,
  and can still subscribe to `orders` by typing it.

### `pubsub.messages` — The list of messages

The messages the page received, the newest at the top, each with the time it arrived, its channel and what it says.

- **Kind**: View
- **Engine**: Redis
- **Function**: `src/features/pubsub/messages.ts › view(state)`
- **Entry points**: the main part of the Pub/Sub page: a table (`@table`) whose rows have a context menu
  (`@row-menu`); with rows selected, the bar of the selection (`@selection-bar`).
- **Uses**: `pubsub.keep`, `pubsub.filter`, `pubsub.inspect`, `pubsub.copy`, `pubsub.export`, `pubsub.publish`,
  `pubsub.oplog-event`, `pubsub.event-rows`, `value.format`, `nav.inspector`.
- **Ported from**: *New in Datardo*.

What it shows:

1. The columns **Time**, **Channel** and **Message**.
   - **Time** is when Datardo received the message, in the computer's time, to the millisecond: `14:05:09.123`. A
     message of another day shows its date too: `11-16 14:05:09.123`. A message carries no time of its own.
   - **Channel** is the channel the message was published to. For a message that arrived through a pattern, the
     tooltip adds *through the pattern orders:\**.
   - **Message** is the value as `value.format` shows it on one line: text when it is valid UTF-8, JSON on one line
     when it parses, hexadecimal otherwise; cut at 200 characters *(Datardo's choice)* with `…`.
2. With **Events of** set to a MongoDB connection (`pubsub.follow-oplog`), the columns are **Time**, **Operation**,
   **Collection**, **Document** and **Fields**, one row per event (`pubsub.event-rows`): the operation is *insert*,
   *update* or *remove*, the document is the event's `_id` in mongosh syntax, the fields are those of an update,
   separated by commas. A message that is not an event keeps its channel and its message across the last four
   columns.
3. Under the table, when the limit dropped messages: *The list keeps the last 10,000 messages: 2,300 older ones were
   dropped.* (`pubsub.keep`).
4. The context menu of a row: **Copy message**, **Copy channel**, **Copy as JSON**, **Copy as PUBLISH command**
   (`pubsub.copy`); **Publish again…** (`pubsub.publish`); **Subscribe to this channel** when the message came through
   a pattern (`pubsub.subscribe`).
5. The bar of the selection: *3 selected*, **Copy**, **Export…**, **Clear selection**.

A message that reaches the page through two subscriptions, a channel and a pattern that matches it, is listed once
for each, as the server delivers it.

Rows are selected with a click, `Ctrl` and a click, `Shift` and a click, and `Ctrl+A` for all the rows shown; `Esc`
ends the selection. A click on a row shows it in the inspector island (`pubsub.inspect`). The table draws only the
rows on screen, and adds what arrived at most 10 times a second *(Datardo's choice)*, so that a flood of messages
does not stop the window; with the first row on screen the table stays at the top, otherwise it keeps its place and
shows **12 new** at its top, which goes there.

Acceptance:

- [ ] `PUBLISH orders hello` from another client adds a row at the top with the time, `orders` and `hello`.
- [ ] A message of 9 bytes `{"a":"b"}` shows `{"a":"b"}`; a message of the 3 bytes 00 FF 41 shows them in
  hexadecimal, as `value.format` writes them.
- [ ] A message of 5,000 characters shows 200 of them and `…`; the inspector island shows it whole.
- [ ] With the subscriptions `orders:1` (a channel) and `orders:*` (a pattern), one `PUBLISH orders:1 x` adds two
  rows, and the tooltip of one says *through the pattern orders:\**.
- [ ] 5,000 messages published within one second are all in the list a second later, and the window answered clicks
  meanwhile.
- [ ] With the table scrolled down, new messages do not move it and **12 new** shows; a click on it goes to the top.
- [ ] `Ctrl+A` with a filter that shows 37 rows selects 37.
- [ ] The table is read by a screen reader as a table with its column names, and a new message is announced
  politely, at most once every 5 seconds *(Datardo's choice)*, as *12 new messages*.

### `pubsub.keep` — Which messages the list keeps

Adds the messages that arrive to the list, holds them while the list is paused, and drops the oldest beyond the
limit.

- **Kind**: Derivation
- **Engine**: Redis
- **Function**: `src/features/pubsub/keep.ts › messagesAfter(state, arrived)`
- **Uses**: `pubsub.messages`, `pubsub.pause`, `pubsub.clear`, `pubsub.event-rows`.
- **Ported from**: *New in Datardo*; the rules are those of Mongoster's Watch tab (`src/webview/watch.ts › add`),
  with a limit of 10,000 in place of 1,000.

Inputs: the state (`listed`, the rows of the list; `held`, the messages that arrived while paused; `paused`;
`dropped`, a count) and the messages that arrived, in the order the server sent them. Output: the state after.

Rules:

1. Each message gets a number, counted from 1 since the tab was opened, and the time it was received. The numbers
   never repeat, so two equal messages stay two.
2. Not paused: the messages join `listed`. Paused: they join `held`, and the list does not change.
3. Resuming moves `held` to `listed`, in the order they arrived.
4. `listed` and `held` together keep at most 10,000 messages *(Datardo's choice)*. Beyond that the oldest are
   dropped, from `listed` first, and `dropped` counts them.
5. Clearing empties `listed` and `held` and sets `dropped` to 0. The numbering goes on.
6. With **Events of** on, the limit counts rows of `pubsub.event-rows`, each of which may hold several messages.

Examples, with a limit of 3 in place of 10,000 to keep them short:

| State before | Arrives | State after |
| --- | --- | --- |
| listed 1, 2; not paused | 3 | listed 1, 2, 3 |
| listed 1, 2, 3; not paused | 4 | listed 2, 3, 4; dropped 1 |
| listed 1, 2; paused | 3 | listed 1, 2; held 3 |
| listed 1, 2; held 3; paused | 4 | listed 2; held 3, 4; dropped 1 |
| listed 2; held 3, 4; resumed | — | listed 2, 3, 4 |
| listed nothing; held 3, 4, 5; paused | 6 | held 4, 5, 6; dropped 1 more |

Acceptance:

- [ ] Each row of the table gives its state.
- [ ] The 10,001st message drops the oldest one, and the line under the table says *The list keeps the last 10,000
  messages: 1 older one was dropped.*
- [ ] A message that was dropped is in no export and in no copy.

### `pubsub.pause` — Pause and resume the list

Holds the new messages without unsubscribing, so that the list stands still while it is read.

- **Kind**: Operation
- **Engine**: Redis
- **Function**: `src/features/pubsub/pause.ts › plan(context, answers)`
- **Entry points**: **Pause** in the toolbar, which reads **Resume (42)** while paused, with the number of messages
  held (`@toolbar`); Go to (**Pause Pub/Sub messages**, **Resume Pub/Sub messages**).
- **Offered when**: the page has a subscription, or is paused.
- **Plan**: no step to a deployment and no command: the subscriptions stay. One app step, `pause the messages of the
  Pub/Sub page of Cache local`, or `resume …`.
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone from the undo history: nothing is written. **Resume** ends the pause.
- **After**: paused, the state reads **❚❚ Paused**, then **❚❚ Paused · 42 new** as messages are held
  (`pubsub.keep`). Resumed, the held messages join the list and the state reads **● Listening**.
- **Commands**: `pubsub.pause`, `pubsub.pause:resume`
- **Uses**: `pubsub.keep`, `pubsub.messages`.
- **Ported from**: *New in Datardo*; **Pause** and **Resume (N)** behave as in Mongoster's Watch tab
  (`src/webview/watch.ts`).

Acceptance:

- [ ] While paused, three messages published to a subscribed channel add no row, and the button reads **Resume
  (3)**.
- [ ] **Resume** adds the three rows, with the times they arrived, not the time of the resume.
- [ ] Pausing sends no command to the server: `PUBSUB NUMSUB orders` from another client counts the page before and
  after.
- [ ] A page that is disconnected while paused is no longer paused when it is connected again, and the held messages
  are in the list.
- [ ] The pause is not kept with the tab: a restored page listens.

### `pubsub.clear` — Clear the list of messages

Empties the list, to start watching from now.

- **Kind**: Operation
- **Engine**: Redis
- **Function**: `src/features/pubsub/clear.ts › plan(context, answers)`
- **Entry points**: **Clear** in the toolbar (`@toolbar`); Go to (**Clear Pub/Sub messages**).
- **Offered when**: the list or the held messages are not empty.
- **Plan**: no step to a deployment. One app step, `clear the messages of the Pub/Sub page of Cache local`.
- **Danger**: None: no confirmation, as **Clear** of the Watch changes page. The tooltip says *Empty the list. The
  messages are not kept anywhere else.*
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone: the messages are kept nowhere else, and Redis does not have them any more.
- **After**: the list is empty, with the messages held by a pause; the counts of **Subscriptions** are 0; the
  selection and the inspector island are emptied. The subscriptions, the filter and the pause stay.
- **Commands**: `pubsub.clear`
- **Uses**: `pubsub.keep`, `pubsub.messages`, `pubsub.subscriptions`.
- **Ported from**: *New in Datardo*; as **Clear** of Mongoster's Watch tab.

Acceptance:

- [ ] **Clear** with 1,204 messages listed and 42 held leaves none of either, and the button reads **Resume** with
  no number when the page is paused.
- [ ] After **Clear** the page is still subscribed: the next message published is listed.
- [ ] **Clear** sends nothing to the server.

### `pubsub.filter` — Filter the list of messages

Shows only the messages whose channel or text holds what is typed, without changing what is received or kept.

- **Kind**: Derivation
- **Engine**: Redis
- **Function**: `src/features/pubsub/filter.ts › shownMessages(messages, filter)`
- **Entry points**: the field **Filter messages** of the toolbar (`@toolbar`), with `✕` to empty it; **Show only its
  messages** on a subscription (`pubsub.subscriptions`), which adds the subscription to the filter as a mark beside
  the field, removed with its `✕`.
- **Uses**: `pubsub.messages`, `pubsub.subscriptions`, `pubsub.export`, `value.format`.
- **Ported from**: *New in Datardo*.

Inputs: the rows of the list; the text of the field; the subscription chosen, if any. Output: the rows shown, in the
same order.

Rules:

1. The text is split at spaces into words. A row is shown when every word is in its channel or in its message,
   without case. An empty text shows every row.
2. The message is searched as the text `value.format` gives it: the text of a value that is valid UTF-8, the
   hexadecimal digits of one that is not, without spaces.
3. With **Events of** on, the words are also looked for in the operation, the collection, the document and the
   fields of the row.
4. With a subscription chosen, a row is shown only when it arrived through that subscription.
5. The filter applies to the messages that arrive later too, and to those a pause holds when they are resumed.
6. The line of the counts reads *37 of 1,204 messages* while a filter is on.

Examples, on the three messages `orders` → `{"status":"paid"}`, `orders` → `{"status":"new"}`, `invoices` → `PAID
42`:

| Filter | Shown |
| --- | --- |
| *(empty)* | all three |
| `paid` | the first and the third |
| `orders paid` | the first |
| `ORDERS` | the first and the second |
| `refund` | none: the list shows *No message matches the filter.* |
| the subscription `invoices` | the third |

Acceptance:

- [ ] Each row of the table gives its messages.
- [ ] With the filter `paid`, a message `{"status":"new"}` that arrives is kept and not shown; emptying the filter
  shows it.
- [ ] A message of the bytes 00 FF 41 is found by the filter `00ff`.
- [ ] The filter is kept with the tab and restored with it.

### `pubsub.inspect` — A message in the inspector island

Shows the selected message whole: when and where it arrived, and its value as text, as formatted JSON or in
hexadecimal.

- **Kind**: View
- **Engine**: Redis
- **Function**: `src/features/pubsub/inspect.ts › view(state)`
- **Entry points**: a click on a row of the list of messages, or `Enter` on it (`@table`); its own buttons are in
  the inspector island (`@inspector`).
- **Uses**: `value.format`, `pubsub.copy`, `pubsub.publish`, `pubsub.oplog-event`, `nav.inspector`.
- **Ported from**: *New in Datardo*.

What it shows, from the top:

1. The title: the channel.
2. **Received**: the date and the time to the millisecond, `2026-11-17 14:05:09.123`.
3. **Through**: *the channel orders*, or *the pattern orders:\**.
4. **Size**: *42 bytes*.
5. For a row of an event (`pubsub.oplog-event`): **Operation**, **Collection**, **Document** and **Fields**, then
   **Channels**, the channels the event arrived on with the time of each.
6. The value, as `value.format` shows it, with its choice of **Text**, **JSON** and **Hexadecimal**: JSON formatted
   on several lines when the value parses, hexadecimal when it is not valid UTF-8.
7. **Copy** (the message, `pubsub.copy`) and **Publish again…** (`pubsub.publish`).

Acceptance:

- [ ] A click on the message `{"e":"u","d":{"_id":"abc"},"f":["qty"]}` of `app:orders` shows the title `app:orders`,
  *39 bytes*, and the JSON on several lines.
- [ ] A message of the 3 bytes 00 FF 41 shows **Hexadecimal** chosen, **Text** and **JSON** disabled, and *3 bytes*.
- [ ] A message of 1 MB is shown whole, drawn a part at a time as `value.format` does for a large value.
- [ ] When the selected message is dropped by the limit or by **Clear**, the inspector island is emptied.
- [ ] With no row selected the page hides the inspector island.

### `pubsub.copy` — Copy messages

Copies the selected messages, or one part of a message, to the clipboard.

- **Kind**: Operation
- **Engine**: Redis
- **Function**: `src/features/pubsub/copy.ts › plan(context, answers)`
- **Entry points**: **Copy message**, **Copy channel**, **Copy as JSON** and **Copy as PUBLISH command** in the
  context menu of a row (`@row-menu`); **Copy** in the bar of the selection, and `Ctrl+C` in the table, which copy
  the messages (`@selection-bar`); **Copy** in the inspector island (`@inspector`).
- **Offered when**: at least one row is selected, or the menu was opened on a row.
- **Plan**: no step to a deployment. One app step, `copy 3 messages to the clipboard`.
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone: it changes only the clipboard.
- **After**: notifies *Copied 3 messages.*
- **Commands**: `pubsub.copy:message`, `pubsub.copy:channel`, `pubsub.copy:json`, `pubsub.copy:command`
- **Uses**: `pubsub.messages`, `value.format`, `console.reply`, `runner.notify`.
- **Ported from**: *New in Datardo*.

What each one copies, for several rows one per line, the oldest first:

| Entry | Copies |
| --- | --- |
| **Copy message** | the message: its text when it is valid UTF-8, else its bytes in hexadecimal as `value.format` writes them |
| **Copy channel** | the channel's name |
| **Copy as JSON** | one object per message, as `pubsub.export` writes a line of JSON Lines |
| **Copy as PUBLISH command** | `PUBLISH`, the channel and the message, each written as `console.reply` writes a string when it needs quotes, so that the console reads the same bytes back: `PUBLISH orders "{\"status\":\"paid\"}"` |

Acceptance:

- [ ] **Copy message** on `{"status":"paid"}` copies exactly those 17 characters.
- [ ] **Copy as PUBLISH command** on the message `hello world` of `orders` copies `PUBLISH orders "hello world"`,
  and on the bytes 00 FF 41 copies `PUBLISH orders "\x00\xffA"`; pasted in the console, each publishes the same
  bytes again.
- [ ] `Ctrl+C` with three rows selected copies three lines, the oldest first.
- [ ] Copying sends nothing to the server.

### `pubsub.export` — Export the messages to a file

Writes the messages of the list to a file, to keep them or to read them with another tool.

- **Kind**: Operation
- **Engine**: Redis
- **Function**: `src/features/pubsub/export.ts › plan(context, answers)`
- **Entry points**: **Export…** in the toolbar (`@toolbar`) and in the bar of the selection (`@selection-bar`); Go to
  (**Export Pub/Sub messages…**).
- **Offered when**: the list has at least one message.
- **Asks**: a form, then the system's file dialog.
  1. **Messages**: **The 3 selected**, **The 37 shown by the filter**, **All 1,204**. Only the choices that apply are
     offered; the default is the first of them.
  2. **Format**: **JSON Lines** (the default), **JSON**, **CSV**.
  3. The file, with the name `pubsub-cache-local-20261117-140509` (the connection's name in lower case with `-` for
     what is neither a letter nor a digit, then the date and the time) and the extension `.jsonl`, `.json` or
     `.csv`.
- **Plan**: one file step, `write C:\Users\ada\Documents\pubsub-cache-local-20261117-140509.jsonl`. The title is
  **Export 1,204 messages**.
- **Danger**: None. Replacing a file that exists is asked by the system's file dialog.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone from the undo history: it writes a file, which the user can delete.
- **After**: notifies *Exported 1,204 messages to pubsub-cache-local-20261117-140509.jsonl.* with **Show in
  folder**. Messages that arrive while the file is written are not in it.
- **Refuses**: there is nothing to export, *There are no messages to export.* (`/empty`).
- **Commands**: `pubsub.export`
- **Uses**: `pubsub.messages`, `pubsub.filter`, `pubsub.keep`, `runner.ask`, `runner.run`, `runner.notify`.
- **Ported from**: *New in Datardo*.

What is written, one message of the list per record, the oldest first, in UTF-8. With **Events of** on, every
message of every row is written, not one record per event.

- **JSON Lines**: one object per line, with `time` (ISO 8601 in UTC, to the millisecond), `channel`, `pattern`
  (only for a message that arrived through a pattern) and `message`:
  `{"time":"2026-11-17T13:05:09.123Z","channel":"orders:1","pattern":"orders:*","message":"hello"}`. A message that
  is not valid UTF-8 has `messageHex` in place of `message`, with its bytes in lower-case hexadecimal:
  `"messageHex":"00ff41"`; a channel that is not, `channelHex` in place of `channel`. A message that holds JSON is
  written as a string, as it arrived, not as an object.
- **JSON**: one array of the same objects.
- **CSV**: the header `time,channel,pattern,message`, then one line per message, with the fields quoted as RFC 4180
  says. A value that is not valid UTF-8 is written as `0x` and its hexadecimal digits.

Acceptance:

- [ ] Exporting two messages as JSON Lines writes two lines, the older first, each an object that parses.
- [ ] The message `{"status":"paid"}` is written as `"message":"{\"status\":\"paid\"}"`.
- [ ] A message of the bytes 00 FF 41 is written with `"messageHex":"00ff41"` and no `message`; in CSV as
  `0x00ff41`.
- [ ] A message with a comma, a quote and a line break is one record of the CSV file, read back whole by a reader of
  RFC 4180.
- [ ] With a filter that shows 37 of 1,204 messages and none selected, the form offers **The 37 shown by the
  filter** and **All 1,204**, the first chosen.
- [ ] Cancelling the form or the file dialog writes no file.
- [ ] With an empty list **Export…** is disabled, and the command is refused with `pubsub.export/empty`.

### `pubsub.publish` — Publish a message

Sends one message to a channel, for example to try what a subscriber does with it.

- **Kind**: Operation
- **Engine**: Redis
- **Function**: `src/features/pubsub/publish.ts › plan(context, answers)`
- **Entry points**: **Publish…** in the toolbar (`@toolbar`); **Publish to this channel…** in the context menu of a
  subscription and of an active channel (`@item-menu`); **Publish again…** in the context menu of a message
  (`@row-menu`) and in the inspector island (`@inspector`); Go to (**Publish a message…**).
- **Offered when**: the current connection is a Redis connection that is not read-only.
- **Asks**: a form titled **Publish a message**, with the button **Publish**:
  1. **Channel** (text, required): the channel of the entry point; else the one published to last from this page.
  2. **Message** (the editor, several lines; may be empty): the message of **Publish again…**; else empty.
  3. **Send as**: **Text** (the default), **JSON**, **Hexadecimal**. **Publish again…** chooses **Hexadecimal** for a
     message that is not valid UTF-8, and **Text** otherwise.

  Under the button: *A published message cannot be taken back.*
- **Plan**: one step, `PUBLISH orders "{\"status\":\"paid\"}"`, sent on the connection's ordinary client. The title
  is **Publish to orders**. What is sent as the message:
  - **Text**: the text as typed, in UTF-8, line breaks as line feeds.
  - **JSON**: the text as typed, once it has been checked to parse; it is not reformatted.
  - **Hexadecimal**: the bytes the pairs of digits name; spaces and line breaks between pairs are ignored.
- **Danger**: None. No confirmation is needed: a message deletes and overwrites nothing, the form the user has just
  filled shows everything a confirmation would show, and its button is named after the action.
- **Read-only**: Refused on a read-only connection (`/read-only`).
- **Undo**: Cannot be undone: a message that was delivered cannot be withdrawn, and Redis keeps no copy of it. The
  form says so.
- **After**: notifies with the number the server answers, the clients that received the message: *Published to
  orders: 2 clients received it.*, *Published to orders: 1 client received it.*, or *Published to orders: no client
  is subscribed, so nobody received it.* When this page is subscribed to the channel, the message arrives in its
  list like any other. An error of the server is shown as the runner shows every error; a reply that starts with
  `NOPERM` (a user whose ACL does not allow the channel or the command) is of its kind *not allowed*.
- **Refuses**: *The connection Cache production is read-only.* (`/read-only`); an empty channel, *Type the channel to
  publish to.* (`/no-channel`); with **JSON**, a message that does not parse, *The message is not valid JSON:
  <the parser's message>.* (`/invalid-json`); with **Hexadecimal**, an odd number of digits or a character that is
  not one, *Hexadecimal is pairs of the digits 0-9 and a-f: 3 digits is not a whole number of bytes.*
  (`/invalid-hex`); a message of more than 1 MB *(Datardo's choice)*, *The message is 2.4 MB: this form sends up to
  1 MB.* (`/too-large`). The form shows each under its field as the user types and disables **Publish** meanwhile.
- **Commands**: `pubsub.publish`
- **Uses**: `runner.ask`, `runner.run`, `runner.notify`, `runner.log`, `pubsub.messages`, `connection.read-only`.
- **Ported from**: *New in Datardo*.

It is not offered to an AI assistant: the MCP server never writes.

Acceptance:

- [ ] Publishing `{"status":"paid"}` as **Text** to `orders` sends `PUBLISH orders "{\"status\":\"paid\"}"`, and
  with two clients subscribed the notification reads *Published to orders: 2 clients received it.*
- [ ] No confirmation opens between **Publish** and the command.
- [ ] Publishing to a channel nobody follows reads *Published to orders: no client is subscribed, so nobody received
  it.*
- [ ] `00 ff 41` as **Hexadecimal** sends a message of 3 bytes; `00 ff 4` disables **Publish** with the message of
  `/invalid-hex`.
- [ ] `{"status":` as **JSON** disables **Publish**; `{ "status": "paid" }` as **JSON** is sent with its spaces.
- [ ] An empty message is sent: a subscriber receives a message of 0 bytes.
- [ ] On Cache production **Publish…** is disabled with *The connection Cache production is read-only.*; started
  from Go to it is refused with `pubsub.publish/read-only`, and nothing is sent.
- [ ] The Log has `[pubsub.publish] PUBLISH orders "{\"status\":\"paid\"}"`.
- [ ] A publish adds no operation to the undo history, and its notification has no **Undo**.
- [ ] Opening **Publish…** again shows the channel published to last.

### `pubsub.reconnect` — When the Pub/Sub connection drops

Opens the page's connection again and subscribes again, and marks in the list where messages may be missing.

- **Kind**: Operation
- **Engine**: Redis
- **Function**: `src/features/pubsub/reconnect.ts › plan(context, answers)`
- **Entry points**: none for the first try: it starts when the page's connection closes while the page has
  subscriptions. **Reconnect now** in the banner of the page (`@toolbar`).
- **Plan**: `open a connection to cache.example.com:6379 for Pub/Sub`; `HELLO 3 AUTH app *** SETNAME
  datardo-pubsub`; `SUBSCRIBE` with every channel of the list; `PSUBSCRIBE` with every pattern.
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone: nothing is written.
- **After**: see below.
- **Uses**: `pubsub.subscribe`, `pubsub.messages`, `pubsub.subscriptions`, `connection.connect`,
  `connection.disconnect`.
- **Ported from**: *New in Datardo*.

What happens, in order:

1. The state becomes **■ Disconnected**, and a banner over the list says *The Pub/Sub connection closed at 14:05:09.
   Messages published since then are not received: Redis does not keep them.* with **Reconnect now**. The
   subscriptions stay in their list, dimmed. A pause ends, and the messages it held join the list.
2. Datardo tries again after 1, 2, 4, 8 and 16 seconds, then every 30 seconds *(all Datardo's choice)*, for as long
   as the saved connection is connected and the tab is open. The state counts down: **■ Disconnected · trying again
   in 4 s**. An error of a try is shown in the banner, under its first line.
3. When a try succeeds, the banner goes, the state is **● Listening**, and the list gets a row that is not a
   message: *Disconnected from 14:05:09 to 14:05:12: messages published in between were not received.* The row is
   kept, copied and exported with the others (as a record with `"gap":true` and its two times), and counts for the
   limit.
4. When the user disconnects the saved connection (`connection.disconnect`), there is no retry: the state is **■ Not
   connected**, with **Connect** (`connection.connect`). Connecting again subscribes again, with the same row for
   the gap.

A server closes the connection of a subscriber that reads too slowly (its `client-output-buffer-limit` for
`pubsub`); that is one more way to get here, and it is handled the same.

Acceptance:

- [ ] Killing the client `datardo-pubsub` with `CLIENT KILL` from another client shows the banner with the time, and
  within 2 seconds the page is **● Listening** again with a row *Disconnected from … to …*.
- [ ] After that, `PUBLISH orders x` adds a row: the page is subscribed again to every channel and pattern it had.
- [ ] With the server stopped, the tries are 1, 2, 4, 8 and 16 seconds apart, then 30; **Reconnect now** tries at
  once.
- [ ] A message published while the page was disconnected is never listed.
- [ ] After `connection.disconnect` no try is made; after `connection.connect` the page subscribes again.
- [ ] A subscription removed while disconnected is not subscribed again.

### `pubsub.follow-oplog` — Follow the redis-oplog events of a MongoDB connection

Opens the Pub/Sub page of the Redis connection a MongoDB connection is linked to, subscribed to the channels of its
redis-oplog events, and shows each event with its operation, its collection and its document: the writes made in
Datardo and those of the Meteor apps, as they reach Redis.

- **Kind**: Operation
- **Engine**: Any
- **Function**: `src/features/pubsub/follow-oplog.ts › plan(context, answers)`
- **Entry points**: **Follow events** on the row of the linked connection in the connection island
  (`@connection-island`); Go to (**Follow redis-oplog events**); in the Pub/Sub page, the menu **Events of** of the
  toolbar, which lists **Off** and the MongoDB connections linked to this Redis connection (`@toolbar`).
- **Offered when**: the current connection is a MongoDB connection with a linked connection
  (`connection.link-redis`); for **Events of**, the Redis connection of the page is the linked connection of at
  least one MongoDB connection.
- **Reads**: the link of the MongoDB connection: the Redis connection, the channel prefix and the namespaces
  (`connection.link-redis`).
- **Plan**:
  1. `open the Pub/Sub page of Cache local`, connecting Cache local when it is not connected.
  2. `show the events of Local`: **Events of** is set to the MongoDB connection.
  3. `PSUBSCRIBE app:*`, as `pubsub.subscribe` does, left out when the page already has that pattern.

  The pattern is the channel prefix followed by `*`, with a backslash before each `*`, `?`, `[` and `\` of the
  prefix, so that the prefix is matched as it is written. The title is **Follow the events of Local**.
- **Danger**: None.
- **Read-only**: Allowed on both connections, because it writes nothing to a deployment.
- **Undo**: Cannot be undone from the undo history: nothing is written. **Events of › Off** and
  `pubsub.unsubscribe` end it.
- **After**: the Pub/Sub tab of Cache local is the active tab, so Cache local is the current connection; the list of
  messages has the columns of the events (`pubsub.messages`). With an empty prefix the page says, over the list:
  *Local has no channel prefix: the pattern \* receives every message of Cache local, not only the events of
  redis-oplog.*
- **Refuses**: the MongoDB connection has no linked connection, *Local has no linked Redis connection. Link one in
  its connection form.* (`/no-link`); the linked connection cannot be connected, *Cache local is not connected.*
  (`/not-connected`).
- **Commands**: `pubsub.follow-oplog`
- **Uses**: `connection.link-redis`, `connection.connect`, `pubsub.show`, `pubsub.subscribe`, `pubsub.messages`,
  `pubsub.oplog-event`, `pubsub.event-rows`, `oplog.publish`, `tab.open`.
- **Ported from**: *New in Datardo*. The channels and the message of an event are those Mongoster publishes
  (oplog.message; `src/shared/oplog.ts › oplogMessage`).

The patterns of some prefixes:

| Channel prefix | Pattern |
| --- | --- |
| `app:` | `app:*` |
| *(empty)* | `*` |
| `shop*1:` | `shop\*1:*` |
| `a[b]?` | `a\[b]\?*` |

The channels carry the collection and not the database, and the databases and collections a connection publishes
are not part of them: the page shows the events of every collection published with that prefix, by Datardo and by
the apps, whatever their database.

Acceptance:

- [ ] **Follow events** on Local opens the Pub/Sub tab of Cache local, sends `PSUBSCRIBE app:*`, and shows **Events
  of** set to **Local**.
- [ ] Editing `qty` of the document `"abc"` of `shop.orders` in Datardo then adds one row to the page: *update*,
  `orders`, `"abc"`, `qty`.
- [ ] An insert made by a Meteor app with the same prefix adds a row too: *insert*, its collection and its `_id`.
- [ ] Following twice sends `PSUBSCRIBE app:*` once.
- [ ] With the prefix `shop*1:` the command is `PSUBSCRIBE shop\*1:*`, and a message on the channel `shopX1:orders`
  is not received.
- [ ] With an empty prefix the command is `PSUBSCRIBE *` and the page shows the sentence about the prefix.
- [ ] On a MongoDB connection with no linked connection, **Follow events** is not shown, and the command is refused
  with `pubsub.follow-oplog/no-link`.
- [ ] **Events of › Off** puts back the columns **Time**, **Channel**, **Message**, keeps the subscription and the
  messages, and shows each message of an event as its own row.
- [ ] Both connections read-only: the page opens and lists the events.

### `pubsub.oplog-event` — Read a message as a redis-oplog event

Tells whether a message is an event of redis-oplog, and which operation, collection and document it is about.

- **Kind**: Derivation
- **Engine**: Any
- **Function**: `src/features/pubsub/oplog-event.ts › oplogEvent(channel, message, link)`
- **Uses**: `pubsub.messages`, `pubsub.inspect`, `pubsub.event-rows`, `pubsub.follow-oplog`, `query.format`.
- **Ported from**: *New in Datardo*. It reads back what Mongoster's oplog.message writes (`src/shared/oplog.ts ›
  oplogMessage`, `idStringify`).

Inputs: the channel and the message as bytes; the link of the MongoDB connection (its channel prefix, its
namespaces). Output: nothing, or an event: `operation` (*insert*, *update*, *remove*), `collection`, `document` (the
`_id` in mongosh syntax), `fields` (for an update), `channelKind` (*collection*, *namespace* or *document*) and, for
a namespace channel, the `namespace`.

Rules:

1. The message must be valid UTF-8 and parse as a JSON object with `e` equal to `"i"`, `"u"` or `"r"`, and with `d`
   an object whose `_id` is a string, a finite number, or `{ "$type": "oid", "$value": <24 hexadecimal digits> }`.
   Otherwise the message is not an event.
2. The channel must be valid UTF-8 and start with the channel prefix. Otherwise the message is not an event. The
   *rest* is the channel without the prefix.
3. The operation is *insert* for `i`, *update* for `u`, *remove* for `r`.
4. The document is the `_id` as `query.format` writes it: a string in double quotes, a number as it is, and
   `ObjectId("…")` for the object with `$type` `oid`.
5. The fields are `f` when it is an array of strings; an update without it has no fields. Any other member of the
   message is ignored (the apps add `u`, their own mark, and may send the document's fields in `d`).
6. The suffix of a document's channel is the `_id` as Meteor writes it: an ObjectId as its 24 hexadecimal digits; a
   string as itself, with `-` before it when it starts with `-`, `~` or `{` or is 24 hexadecimal digits; a number as
   `~` and its JSON (`~3`).
7. When the rest ends with `::` and that suffix: the channel is the document's, and the collection is what comes
   before the `::`.
8. Else, when the rest starts with a namespace of the link followed by `::` (the longest such namespace): the channel
   is that namespace's, and the collection is what follows.
9. Else the channel is the collection's, and the collection is the rest.

Examples, with the prefix `app:` and the namespace `tenant1` unless said:

| Channel | Message | Event |
| --- | --- | --- |
| `app:orders` | `{"e":"u","d":{"_id":"abc"},"f":["qty"]}` | *update* · `orders` · `"abc"` · `qty` · collection |
| `app:tenant1::orders` | the same | *update* · `orders` · `"abc"` · `qty` · namespace `tenant1` |
| `app:orders::abc` | the same | *update* · `orders` · `"abc"` · `qty` · document |
| `users::0123456789abcdef01234567`, no prefix | `{"e":"i","d":{"_id":{"$type":"oid","$value":"0123456789abcdef01234567"}}}` | *insert* · `users` · `ObjectId("0123456789abcdef01234567")` · document |
| `c::~3`, no prefix | `{"e":"r","d":{"_id":3}}` | *remove* · `c` · `3` · document |
| `c::-0123456789abcdef01234567`, no prefix | `{"e":"r","d":{"_id":"0123456789abcdef01234567"}}` | *remove* · `c` · `"0123456789abcdef01234567"` · document |
| `app:orders` | `{"e":"u","d":{"_id":"abc","qty":2},"f":["qty"],"u":"k3J"}` | *update* · `orders` · `"abc"` · `qty` · collection |
| `app:orders::xyz` | `{"e":"u","d":{"_id":"abc"},"f":["qty"]}` | *update* · `orders::xyz` · `"abc"` · `qty` · collection (the suffix is not this document's) |
| `other:orders` | `{"e":"u","d":{"_id":"abc"},"f":["qty"]}` | not an event: the channel does not start with `app:` |
| `app:orders` | `hello` | not an event |
| `app:orders` | `{"e":"x","d":{"_id":"abc"}}` | not an event |
| `app:orders` | `{"e":"i","d":{"_id":{"a":1}}}` | not an event: no Meteor id |

Acceptance:

- [ ] Each row of the table gives its result.
- [ ] For every event `oplog.publish` sends, on each of its channels, the result has the operation, the collection
  and the `_id` of the write.
- [ ] A message that is not valid UTF-8 is never an event, and is listed as any other message.

### `pubsub.event-rows` — One row per event

redis-oplog publishes each event on several channels: the collection's, one per namespace, and the document's. With
**Events of** on, the list shows the event once and keeps the channels it arrived on.

- **Kind**: Derivation
- **Engine**: Any
- **Function**: `src/features/pubsub/event-rows.ts › rowsAfter(rows, arrived)`
- **Uses**: `pubsub.oplog-event`, `pubsub.messages`, `pubsub.keep`, `pubsub.inspect`.
- **Ported from**: *New in Datardo*.

Inputs: the rows of the list, and a message that just arrived with its time, its channel and what
`pubsub.oplog-event` made of it. Output: the rows after.

Rules:

1. A message that is not an event is a row of its own.
2. An event joins the newest row that: is an event of the same collection; has a message equal to this one, byte for
   byte; has not yet a message from this channel; and whose first message arrived less than 2 seconds before
   *(Datardo's choice)*. Joining adds the channel and its time to the row; the row keeps its place and its time.
3. An event that joins no row is a new row.
4. Two equal events therefore stay two rows: the second one's first message comes from a channel the first row
   already has.
5. Turning **Events of** off shows every message as its own row again, in the order they arrived; turning it on
   builds the rows again by these rules.

Examples: an update of the fields `qty` of the document `"abc"` of `orders`, sent on `app:orders`,
`app:tenant1::orders` and `app:orders::abc`:

| Messages, in the order they arrive | Rows |
| --- | --- |
| the three messages of one event | 1 row, with 3 channels |
| the three messages, then the same three again 500 ms later (the same update made twice) | 2 rows, each with 3 channels |
| `app:orders` of a first event, `app:orders` of an equal second event, then `app:orders::abc` twice | 2 rows, each with 2 channels |
| `app:orders`, then `app:orders::abc` 3 seconds later | 2 rows, each with 1 channel |
| the three messages, with a message `hello` on `app:news` between the first and the second | 2 rows: the event with 3 channels, and `hello` |
| events of `"abc"` and of `"xyz"` with their messages interleaved | 2 rows, one per document: their messages differ |

Acceptance:

- [ ] Each row of the table gives its rows.
- [ ] The inspector island lists, for a row with 3 channels, the three channels with the time of each.
- [ ] The number of rows never exceeds the number of messages, and every message is in exactly one row.
