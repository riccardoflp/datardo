# The MCP server

Datardo's Model Context Protocol server lets an AI assistant on the same computer (Claude Code, Cursor and other MCP
clients) work with the saved connections of both engines: how the server runs and is reached, its state in the top
bar, its access token, the setup and port commands, what `datardo.mcp.readData` hides, the limits every tool keeps,
what it writes in the Log, and the tools, one card per group. The tools for MongoDB keep the names, arguments and
bounds they have in Mongoster; the tools for Redis are new, and all start with `redis_`.

Every card of this area keeps the promise of the product: no tool writes, kills an operation, changes the profiler or
a server setting, runs a command the assistant writes, reads a `system.*` collection the assistant names, or returns a
connection string or a password; and documents, field values and the values of Redis keys go to the AI only with
`datardo.mcp.readData` on, in no result, count or error text. Each group card has an acceptance line for it.

The default port is 37018 *(Datardo's choice, so that Mongoster's server on 37017 can run beside it)*. Datardo runs
as one instance with one window (`window.single-instance`), so one server listens and the tabs the AI opens appear in
that window: Mongoster's handing of the port from one window to another is not ported.

### `mcp.server` — Run the MCP server on 127.0.0.1

While `datardo.mcp.enabled` is on, Datardo answers the Model Context Protocol on `127.0.0.1`, so that an AI assistant
can call its tools.

- **Kind**: Operation
- **Engine**: Any
- **Function**: `src/features/mcp/server.ts › plan(context, answers)`
- **Entry points**: the setting `datardo.mcp.enabled`, turned on by `mcp.setup` or in the Settings page; `POST
  http://127.0.0.1:37018/mcp` from an AI client. It has no control of its own.
- **Offered when**: `datardo.mcp.enabled` is on; it is off by default.
- **Reads**: the access token in the secret storage (`mcp.access-token`), the settings `datardo.mcp.enabled` and
  `datardo.mcp.port`.
- **Plan**: `start the MCP server on http://127.0.0.1:37018/mcp`, or `stop the MCP server`, an app step. The first
  start stores a new access token.
- **Danger**: None.
- **Read-only**: Allowed: the server writes nothing to a deployment, and its tools read through read-only connections
  too.
- **Undo**: Nothing to undo: turning `datardo.mcp.enabled` off stops the server.
- **After**: the Log says `Listening on http://127.0.0.1:37018/mcp` (`mcp.log`); the top bar shows the new state
  (`mcp.status`).
- **Refuses**: HTTP requests that are not a tool call from a local client with the token, by status (below). A port
  that cannot be used: the server does not start, and says why (below).
- **Settings**: `datardo.mcp.enabled` (default `false`), `datardo.mcp.port` (default 37018, 1024 to 65535). Changing
  either starts or stops the server again at once.
- **Uses**: `mcp.access-token`, `mcp.protocol`, `mcp.read-data`, `mcp.log`, `mcp.status`, `mcp.change-port`,
  `connection.secrets`, `settings.read`, `runner.notify`.
- **Ported from**: Mongoster's card mcp.server (`src/mcpServer.ts › McpServer.restart`, `› start`, `› handle`); the
  limit of a batch from Mongoster 0.9.0 (`src/mcp/http.ts › handleRequest`, `MAX_BATCH`). The route `/mcp/release`,
  the proof of the token it takes in 0.9.0 and the header by which its windows recognized each other are not ported.
- **Differs**: (M37) a JSON array of any length is answered, every message of it run (`src/main/mcp/http.ts ›
  answerBody`).

Acceptance:

- [ ] With `datardo.mcp.enabled` off nothing listens. Turned on, the server listens at once on `127.0.0.1` on port
  `datardo.mcp.port` (37018 by default), never on another address.
- [ ] Only `POST /mcp` carrying `Authorization: Bearer <token>` reaches the tools. The answers are plain JSON (the
  Streamable HTTP transport without server-sent events or sessions), each with `Connection: close`.
- [ ] The checks, in this order: a `Host` other than `127.0.0.1:<port>` or `localhost:<port>` gets 403
  `{ "error": "Forbidden host" }`; an `Origin` other than `http://` or `https://` `127.0.0.1` or `localhost` (any port)
  gets 403 `Forbidden origin`; a path other than `/mcp` gets 404 `Not found`; a missing or wrong token gets 401
  (`mcp.access-token`); a method other than POST gets 405 `Method not allowed` with `Allow: POST`; a body over 1 MB
  gets 413 `Request too large`; a body that is not JSON gets 400 with the JSON-RPC error -32700 `Parse error`.
- [ ] A JSON array of at most 20 messages is answered with the array of their answers; a request with only
  notifications gets 202 with no body.
- [ ] A JSON array of more than 20 messages gets 400 with the JSON-RPC error -32600 `Too many requests in one batch:
  at most 20` and `id: null`; none of its messages runs, and the Log has no line for it. (differs)
- [ ] Mongoster's server on port 37017 and Datardo's on 37018 run at the same time, each with its own token.
- [ ] A port used by another program: the server does not start, the Log says `Not started: Port 37018 is used by
  another program.`, and Datardo shows, once per port, the warning *Datardo's MCP server is not running. Port 37018 is
  used by another program.* with the button **Change port** (`@notification`), which starts `mcp.change-port` with a
  free port suggested. Any other error of listening is said with its own message.
- [ ] While the server is on and could not start, it tries again every 3 seconds: when the other program frees the
  port, the server starts within a few seconds, without a second warning.
- [ ] Turning the setting off stops listening at once and lets the calls in progress finish.
- [ ] The promise: the server has no route and no tool that writes to a deployment, kills an operation or changes a
  server setting.

### `mcp.status` — The state of the MCP server in the top bar

The top bar says whether the MCP server is running, and a click opens its setup.

- **Kind**: View
- **Engine**: Any
- **Function**: `src/features/mcp/status.ts › view(state)`
- **Entry points**: **MCP** with its dot, at the right of the top bar (`@top-bar`).
- **Offered when**: always.
- **Reads**: the state of the server from `mcp.server`.
- **Uses**: `mcp.setup`, `mcp.server`.
- **Ported from**: *New in Datardo*.

What it shows, by state:

| State | Dot | Tooltip |
| --- | --- | --- |
| Off (`datardo.mcp.enabled` is off) | hollow | **MCP server: off. Click to set it up.** |
| Running | green | **MCP server: running on http://127.0.0.1:37018/mcp** |
| Starting | grey | **MCP server: starting** |
| Not running | orange | **MCP server: not running. Port 37018 is used by another program.** |

Acceptance:

- [ ] A click, or `Enter` on it, opens the dialog of `mcp.setup`; with the server off, the dialog offers to turn it on
  and turns nothing on by itself.
- [ ] The dot changes within a second of the server starting, stopping or failing to start.
- [ ] The state is never told by color alone: the name a screen reader says is the tooltip's text.
- [ ] The tooltip never holds the access token.

### `mcp.access-token` — Generate a new access token

The AI clients authenticate with a bearer token that Datardo creates and keeps in the secret storage. A new one
replaces it when the old one may have leaked.

- **Kind**: Operation
- **Engine**: Any
- **Function**: `src/features/mcp/access-token.ts › plan(context, answers)`
- **Entry points**: **Generate a new access token** in the dialog of `mcp.setup` (`@dialog`); Go to (**Generate a new
  MCP access token**).
- **Asks**: nothing.
- **Plan**: `store a new access token of the MCP server`, an app step: 32 random bytes, in base64url, in the secret
  storage.
- **Danger**: None: there is no confirmation. The entry of the dialog says under it *The configured clients stop
  working until they get the new one*.
- **Read-only**: Allowed: it writes nothing to a deployment.
- **Undo**: Cannot be undone: the old token is gone. The clients work again once the configuration is copied again.
- **After**: the notification *Datardo's MCP server has a new access token: copy the configuration again.*; the Log
  line `New access token: the old one no longer works`.
- **Commands**: `mcp.access-token`.
- **Uses**: `mcp.setup`, `mcp.log`, `connection.secrets`, `runner.notify`.
- **Ported from**: Mongoster's card mcp.access-token (`src/mcpServer.ts › McpServer.newToken`, `› ensureToken`,
  `› authorized`).

Acceptance:

- [ ] The first start of the server stores a token when there is none. The token never goes to the settings, a file
  outside the secret storage, the Log or a tool's answer; it leaves the secret storage only through the copies of
  `mcp.setup`.
- [ ] A request without `Authorization`, with something other than `Bearer <token>`, or with another token (compared
  in constant time) gets 401 `{ "error": "Unauthorized" }` with `WWW-Authenticate: Bearer`, before any tool runs;
  nothing is logged for it.
- [ ] After **Generate a new access token**, the old token gets 401 at once, and the new one is 43 characters of
  base64url.
- [ ] With the server off, a new token is stored and nothing starts.

### `mcp.setup` — Set up the MCP server for AI assistants…

One command turns the server on and gives the configuration for the AI client in use.

- **Kind**: Operation
- **Engine**: Any
- **Function**: `src/features/mcp/setup.ts › plan(context, answers)`
- **Entry points**: the state of the MCP server in the top bar (`@top-bar`, `mcp.status`); Go to (**Set up the MCP
  server for AI assistants…**); **Copy configuration…** on the notification of `mcp.change-port` (`@notification`).
- **Asks**: a list to pick from, titled `Datardo MCP server · <status>`, with the line *Copy the configuration for
  your AI assistant.* and these entries: **Copy the command for Claude Code**, **Copy the JSON configuration**, **Show
  the log** (*The tools the AI called*), **Change the port…**, **Generate a new access token**, **Turn the server
  off**. With the server off, the first entry is **Turn the server on** and **Turn the server off** is not listed.
- **Plan**: one app step, by the entry picked: `set datardo.mcp.enabled to true` or `to false`; `copy to the
  clipboard` for the two copies. The other entries start their own features.
- **Danger**: None.
- **Read-only**: Allowed: it writes nothing to a deployment.
- **Undo**: **Turn the server off** sets `datardo.mcp.enabled` back to `false`.
- **After**: after a copy, the notification *Copied. It contains the access token of the MCP server: keep it private.*
- **Commands**: `mcp.setup`.
- **Settings**: `datardo.mcp.enabled`, `datardo.mcp.port`.
- **Uses**: `mcp.server`, `mcp.status`, `mcp.access-token`, `mcp.change-port`, `mcp.log`, `runner.ask`,
  `runner.notify`.
- **Ported from**: Mongoster's card mcp.setup (`src/mcpServer.ts › McpServer.setup`, `› claudeCommand`). What it did
  for the AI assistant of its host, which found the server on its own, is not ported.

Acceptance:

- [ ] Started from Go to with the server off, the command sets `datardo.mcp.enabled` to `true` and starts the server
  before the dialog opens; started from the top bar with the server off, it changes nothing until **Turn the server
  on** is picked.
- [ ] The title's status is `Running on http://127.0.0.1:37018/mcp`, `Off`, or `Not running: <why>` (`starting` when
  there is no reason yet).
- [ ] **Copy the command for Claude Code** copies
  `claude mcp add --transport http datardo http://127.0.0.1:37018/mcp --header "Authorization: Bearer <token>"`; the
  line under it shows the same command with `…` in place of the token.
- [ ] **Copy the JSON configuration** copies
  `{ "mcpServers": { "datardo": { "type": "http", "url": "http://127.0.0.1:37018/mcp", "headers": { "Authorization": "Bearer <token>" } } } }`,
  indented by two spaces; the line under it is *For the mcpServers of .mcp.json, Cursor, Windsurf and other clients
  that support HTTP servers*.
- [ ] **Show the log** opens the Log page on the source **MCP** (`mcp.log`); **Change the port…** (under it `Now 37018.
  The configured clients need the new address`) starts `mcp.change-port`; **Generate a new access token** starts
  `mcp.access-token`; **Turn the server off** sets the setting to `false` and stops the server.
- [ ] `Escape` closes the dialog: nothing else changes beyond a server turned on by the command.
- [ ] The access token is never shown in the dialog, only copied.

### `mcp.change-port` — Change MCP server port…

Moves the server to another port, for when 37018 is taken.

- **Kind**: Operation
- **Engine**: Any
- **Function**: `src/features/mcp/change-port.ts › plan(context, answers)`
- **Entry points**: Go to (**Change MCP server port…**); **Change the port…** in the dialog of `mcp.setup`
  (`@dialog`); **Change port** on the warning of a taken port (`@notification`, `mcp.server`).
- **Asks**: a number, in a dialog titled **Port of Datardo's MCP server**, with the line `On 127.0.0.1, now 37018. The
  AI clients you configured need the new address afterwards.` (`now 37018 (taken)` when the port is taken). The value
  is the current port, or, when it is taken, the first free port from the next one, up to 50 ports further. An entry
  that is not a number from 1024 to 65535 shows *A number from 1024 to 65535*.
- **Reads**: whether a port is free, by listening on it on `127.0.0.1` for a moment.
- **Plan**: `set datardo.mcp.port to <port>`, an app step.
- **Danger**: None.
- **Read-only**: Allowed: it writes nothing to a deployment.
- **Undo**: Run it again with the old port.
- **After**: the server starts again; once it listens on the new port, the notification *Datardo's MCP server now
  listens on port 37019. Give the new address to the AI clients configured with port 37018.* with the button **Copy
  configuration…**, which starts `mcp.setup`.
- **Commands**: `mcp.change-port`.
- **Settings**: `datardo.mcp.port`.
- **Uses**: `mcp.server`, `mcp.setup`, `runner.ask`, `runner.notify`.
- **Ported from**: Mongoster's card mcp.change-port (`src/mcpServer.ts › McpServer.changePort`, `› freePort`).

Acceptance:

- [ ] The port is said to be taken when the server is on, does not listen, and failed to start.
- [ ] With 37018 taken and 37019 and 37020 free, the dialog suggests 37019; with 37019 taken too, 37020.
- [ ] `Escape`, or the port that is already set, changes nothing.
- [ ] `80`, `70000` and `abc` show *A number from 1024 to 65535* and cannot be confirmed.
- [ ] With the server off, the new port is saved, nothing starts and nothing is said.
- [ ] When the new port cannot be used either, the notification is not shown: the warning of `mcp.server` is.

### `mcp.read-data` — The tools offered without reading data

`datardo.mcp.readData` decides whether the AI may read documents, field values and the values of Redis keys. Turned
off, the tools that return them are not offered, and the tools that stay give no value by another way: the AI sees
the structure, the statistics, the names of keys and the query shapes, and opens tabs where the user sees the data.

- **Kind**: Derivation
- **Engine**: Any
- **Function**: `src/features/mcp/read-data.ts › offeredTools(tools, settings)`, with `shapeOf`, `validatorShape`
  and `errorText` in the same module.
- **Settings**: `datardo.mcp.readData` (default on).
- **Uses**: `mcp.protocol`; used by every group of tools.
- **Ported from**: Mongoster's card mcp.read-documents (`src/mcpTools.ts › mcpTools`, `src/shared/mcp.ts ›
  McpTool.documents`); what the tools that stay leave out, from Mongoster 0.9.0 (`src/mcp/context.ts ›
  safeErrorText`, `errorCode`, `shape`, `schemaShape`, `validatorShape`; `src/mcp/data.ts`, `src/mcp/topology.ts ›
  formatShardingStatus`).
- **Differs**: (M37) with the setting off `explain_query` is offered; `count_documents` counts any filter; validators,
  view pipelines and partial filter expressions are given with their values (`collection_options`,
  `collection_stats`, `describe_collection`); `sharding_status` gives the details of its events and the text of what
  it could not read; a server's error reaches the AI with its text (`src/features/mcp/read-data.ts ›
  hiddenWithoutReadData`).

Rules:

- Input: the 42 tools of the groups (32 for MongoDB and Datardo's own state, 10 for Redis), and the setting, read
  again at every request: no restart is needed.
- On (the default): all 42 tools are listed and can be called, and return what their cards say.
- Off: these eight are neither listed by `tools/list` nor callable: `find_documents`, `aggregate`, `distinct_values`,
  `explain_query`, `watch_changes`, `write_history`, `datardo_write_details`, `redis_read_value`. The other 34 stay.
  `explain_query` goes because its plan quotes the bounds of the query, a failed explain the values it failed on, and
  documents examined against returned is a count per filter.
- Off, `count_documents` gives only a collection's total: a filter that is not empty is refused before anything is
  sent, because a count per filter tells the values one question at a time (`{ email: /^a/ }`).
- Off: these tools that stay write `?` where a value would be, the field names and operators kept.
  `current_operations` gives the command of each operation as its query shape (`find shop.orders: { status: ?, total:
  { $gt: ? } }`). `list_saved_queries` gives the saved and recent queries with their literal values as `?`; names,
  descriptions and files stay. `datardo_writes` gives the title of each operation without the `_id` values and
  filters it carries (`Delete document`, not `Delete document ObjectId("…")`). `redis_slow_log` gives each command
  with its name and `?` for every argument (`HSET ? ? ?`). A view's pipeline (`collection_options`,
  `collection_stats`) and the partial filter expression of an index (`describe_collection`, `collection_stats`) are
  given as their shapes.
- Off, a validator is given as field names and types: of a `$jsonSchema` the `properties`, `patternProperties`,
  `bsonType`, `type`, `required` and the sizes (`minItems`, `maxItems`, `minLength`, `maxLength`, `minProperties`,
  `maxProperties`, `uniqueItems`) stay, and `items`, `allOf`, `anyOf`, `oneOf`, `not` and `additionalProperties` are
  followed inside; `enum`, `pattern`, bounds (`minimum`, `maximum`…), `description` and any other keyword become `?`. A
  query validator is given as its shape.
- Off, `sharding_status` leaves out the details of the recent events (they quote chunk ranges, which are shard key
  values) and, of what it could not read, the server's text; the zones stay as names, as they are with the setting on.
- Off, the text of a MongoDB server's error is replaced by its code and code name, in every tool, because the server
  quotes the values it failed on: `server error 241 (ConversionFailure); its text is left out because
  datardo.mcp.readData is off`. Errors that are not the server's (the network, a time limit of Datardo's, a filter
  that cannot be parsed, a refusal of `mcp.arguments`) keep their text, and so do Redis errors, which quote no value
  of a key *(Datardo's choice)*.
- The names of databases, collections, fields, indexes and keys are structure, not data: they are returned with the
  setting off.
- `tools/list` declares `listChanged: false`: a client that listed the tools before the setting changed keeps its list
  until it lists them again, and a call to a tool left out gets the JSON-RPC error -32602 `Unknown tool: <name>`.

Worked examples (the setting off):

- `tools/call` of `find_documents` → error -32602 `Unknown tool: find_documents`.
- `tools/call` of `redis_read_value` or `explain_query` → error -32602 `Unknown tool: redis_read_value`.
- `count_documents` with `{ status: "active" }` → `A filter is refused because datardo.mcp.readData is off: counting
  what matches a filter tells the values of the documents. Call it without a filter for the total, or use open_query
  to show the user the matching documents.`; with no filter, or `{}` → `shop.orders has 2 documents.` and the
  estimate.
- `slow_queries` → shapes such as `find shop.orders: { a: ?, s: ? } · sort { b: 1 }`, never the values of the queries.
- `redis_scan_keys` with the pattern `orders:*` → the names and types of the keys; `redis_key_details` of `orders:42`
  → its type, encoding, size and expiry.
- A running `update` with `{ $set: { email: "ada@example.com" } }` in `current_operations` → `update shop.users:
  { _id: ? } · { $set: { email: ? } }`.
- The validator `{ $jsonSchema: { required: ["plan"], properties: { plan: { bsonType: "string", enum: ["free",
  "pro"] } } } }` → `{ $jsonSchema: { required: ["plan"], properties: { plan: { bsonType: "string", enum: ? } } } }`.
- The view pipeline `[ { $match: { status: "paid" } } ]` → `[ { $match: { status: ? } } ]`.
- A command the server refuses with `{ code: 241, codeName: "ConversionFailure", errmsg: "Failed to parse number
  'ada@example.com' …" }` → `server error 241 (ConversionFailure); its text is left out because datardo.mcp.readData
  is off`.

Acceptance:

- [ ] With the setting off, the eight tools above are missing from `tools/list` and a call to any of them is refused
  as an unknown tool. (differs)
- [ ] Tools offered with the setting off: `describe_collection` (types and how often fields are present, index
  definitions), `count_documents` (the total only), `slow_queries` and `index_advice` (query shapes, values as `?`),
  the deployment tools, the Redis tools other than `redis_read_value`, and the tools that open tabs (the AI gets a
  sentence, the user the data).
- [ ] With the setting off, `count_documents` with a filter that is not empty is refused with the sentence above
  before anything is sent to MongoDB; with no filter, or `{}`, it gives the total and the estimate. (differs)
- [ ] With the setting off, `collection_options` gives `Validator ($jsonSchema; field names and types only,
  datardo.mcp.readData is off): …` and `Pipeline (values replaced by ?, datardo.mcp.readData is off): …`, and
  `describe_collection` lists an index as `- active: { status: 1 } partial { status: ? }`. (differs)
- [ ] With the setting off, a tool whose command the server refuses gives `server error <code> (<code name>); its
  text is left out because datardo.mcp.readData is off`; a refusal of Datardo's own (`filter: …`, a collection that
  does not exist) and a network error keep their text. (differs)
- [ ] With the setting off, no tool returns a field value of a document, a value of a Redis key, or a value of a
  query or a command the AI did not write: not in a result, not in a count, and not in the text of an error. (differs)
- [ ] With the setting on, every tool returns its full commands, validators, pipelines, queries, titles and error
  texts.
- [ ] Turning the setting on makes the eight tools callable at the next request, without restarting the server.

### `mcp.protocol` — Answer a message of the Model Context Protocol

The JSON-RPC 2.0 messages the server understands, and how a tool's success or failure reaches the model.

- **Kind**: Derivation
- **Engine**: Any
- **Function**: `src/features/mcp/protocol.ts › answer(message, tools, info)`
- **Uses**: `mcp.read-data`, `mcp.log`.
- **Ported from**: Mongoster's card mcp.protocol (`src/shared/mcp.ts › handleMessage`, `src/mcpServer.ts ›
  INSTRUCTIONS`); the batches of at most 20 messages from Mongoster 0.9.0 (`src/mcp/http.ts › handleRequest`).
- **Differs**: (M37) a tool that fails gives the server's error text whatever `datardo.mcp.readData` says.

Rules:

- A body is one message, or a JSON array of at most 20 messages, each answered as below and the answers given back
  as an array in the same order, without those of notifications; more than 20 are refused as a whole by `mcp.server`.

- A message that is not an object gets -32600 `Invalid request` with `id: null`. A message without `jsonrpc: "2.0"`
  or a string `method` gets -32600 when it has an `id`, nothing when it is a notification. A notification (no `id`)
  never gets an answer.
- `initialize`: `protocolVersion` is the one asked when it is `2025-06-18`, `2025-03-26` or `2024-11-05`, otherwise
  `2025-06-18`; `capabilities: { tools: { listChanged: false } }`; `serverInfo` `{ name: "datardo", title: "Datardo",
  version: <Datardo's version> }`; and the instructions, which start `Datardo is the database client open on the
  user's computer. Its tools read the MongoDB and Redis connections the user saved there and never write to a
  database.` and go on: `Start with list_connections: each connection says its engine.` They then name the tools of
  each group in the order to use them, say that filters, sorts, projections and pipelines are in mongosh syntax, and
  that the tools whose name starts with `open_` or `redis_open_` show the results to the user.
- `ping` gets `{}`.
- `tools/list` gives each tool's `name`, `title`, `description`, `inputSchema` and
  `annotations: { title, readOnlyHint: true, destructiveHint: false, openWorldHint: false }`.
- `tools/call`: an unknown name gets -32602 `Unknown tool: <name>`; arguments that are not an object get -32602
  `The arguments must be an object`; a required argument absent, null or `""` gives the result
  `Missing argument: connection.` (`Missing arguments: database, collection.` for several) with `isError: true`; a
  tool that fails gives its message as the result with `isError: true` (a server's error as `mcp.read-data` says);
  otherwise the result is `{ content: [{ type: "text", text }] }`.
- Any other method gets -32601 `Method not found: <method>`.
- Each `tools/call` that reaches a known tool is passed to the Log with its outcome: `ok`, `error: <message>` or
  `missing <keys>`.

Worked examples:

- `{ "jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": { "name": "list_databases", "arguments": {} } }` →
  result `{ content: [{ type: "text", text: "Missing argument: connection." }], isError: true }`.
- `{ "jsonrpc": "2.0", "method": "notifications/initialized" }` → no answer (HTTP 202).
- `{ "jsonrpc": "2.0", "id": 2, "method": "resources/list" }` → error -32601 `Method not found: resources/list`.
- `initialize` asking for `protocolVersion: "2023-01-01"` → `protocolVersion: "2025-06-18"`.

Acceptance:

- [ ] Every failure of a tool reaches the model as a result with `isError: true` and a sentence it can act on, not as
  a protocol error.
- [ ] With `datardo.mcp.readData` off, a tool that failed on a server's error gives `server error <code> (<code
  name>); its text is left out because datardo.mcp.readData is off` as its result, with `isError: true`. (differs)
- [ ] Every tool is announced with `readOnlyHint: true` and `destructiveHint: false`.
- [ ] Each worked example above gives its answer.
- [ ] The instructions name no tool that `tools/list` does not offer with `datardo.mcp.readData` on.

### `mcp.arguments` — Read the arguments of a tool

How every tool finds the connection, the database and the collection or key it is given, and reads its other
arguments, with the refusals the model sees.

- **Kind**: Derivation
- **Engine**: Any
- **Function**: `src/features/mcp/arguments.ts › toolTarget(args, connections)`, with `stringArg`, `intArg`, `boolArg`,
  `timeArg` and `resumeToken`.
- **Uses**: `mcp.refuse-write-stages`, `query.parse`, `connection.connect`.
- **Ported from**: Mongoster's card mcp.arguments (`src/mcp/context.ts › toolContext`, `src/shared/mcp.ts ›
  stringArg`, `› intArg`, `› boolArg`, `src/mcp/changes.ts › parseTime`, `› resumeToken`); the refusal of the
  `system.*` collections from Mongoster 0.9.0 (`src/mcp/context.ts › refuseSystemCollection`).
- **Differs**: (M37) a `system.*` collection is read like any other (`src/features/mcp/arguments.ts › toolTarget`).

Rules:

- `connection` is a connection's id, or else its name in any case. Two connections with that name:
  `More than one connection is named "<name>": use the id (<id>, <id>).` None:
  `No connection "<name>". Connections: <names>.` (`none` when there is no connection).
- A tool is for one engine. A tool for MongoDB given a Redis connection: `<connection> is a Redis connection: use the
  redis_ tools (redis_scan_keys, redis_key_details).` A `redis_` tool given a MongoDB connection: `<connection> is a
  MongoDB connection: use list_databases, list_collections and the other tools without redis_.`
- A tool on a connection that is not connected connects it, as opening it in the window would (`connection.connect`).
  A connection that needs something only the user can give (an SSH host key to confirm, a password that is not saved)
  is refused: `<connection> is not connected and needs the user to connect it in Datardo.`
- MongoDB: `database` and `collection` must exist: `<database>.<collection> doesn't exist on <connection>: use
  list_collections.` `collection` without `database` gives `collection needs database.`
- MongoDB: a `collection` whose name starts with `system.` is refused in every database, by every tool that takes a
  collection, whatever `datardo.mcp.readData` says, before anything is sent: `<database>.<collection> is a system
  collection: Datardo's MCP server doesn't read the system.* collections (users, profiler, views…).` The tools that
  need one read it by themselves (`slow_queries` the profiler).
- Asked for by name, a connection, a database or a collection excluded from searches (`tree.excluded`) answers like
  any other: only the lists of `mcp.data-tools` leave them out.
- Redis: `database` is a whole number, the index of the database (`0` for `db0`); left out, it is the database of the
  connection string, else 0. An index the server does not have: `<connection> has no database <n>.` `key` is the name
  of a key; a name that is not valid UTF-8 is written and read with `\x` and two hexadecimal digits for each such byte,
  and `\\` for a backslash (`cache:\xff\x01`).
- Strings are trimmed and an empty one counts as absent; anything else gives `<key> must be a string.`
- Whole numbers may come as numbers or digit strings: `<key> must be a whole number.`, and outside the range
  `<key> must be between <min> and <max>.`
- Booleans must be `true` or `false`: `<key> must be true or false.`
- `filter`, `sort` and `projection` are mongosh syntax (`ObjectId("…")`, `ISODate("…")`, `/re/i`); a parse error is
  given as the parser says it.
- Times (`since`, `until`) are an ISO date or a time ago: a number and `s`, `m`, `h`, `d` or `w` (`90s`, `15m`, `2h`,
  `1d`, `1w`); anything else gives
  `<key> must be an ISO date (e.g. 2024-05-01T10:00:00Z) or a time ago like "15m", "2h", "1d".`
- A resume token is the hex `_data` string, `{ _data: "…" }` as text, or that object; anything else gives
  `resumeAfter must be the resume token returned by watch_changes: its _data string (hex), or { _data: "…" }.`
- Lists (`operationTypes`, `operations`) are an array or a comma-separated string of known names; an unknown one gives
  `<key>: unknown <names>. Use <allowed>.`
- One of a fixed set of names (`type`, `section`, `source`): `<key> must be one of <names>.`

Worked examples:

- `timeArg("15m", "since", now)` → `now` minus 15 minutes; `timeArg("yesterday", "since")` → the refusal above.
- `resumeToken('{ _data: "82AB" }')` → `{ _data: "82AB" }`; `resumeToken("not a token")` → the refusal above.
- `intArg({ limit: "5" }, "limit", 20, 1, 100)` → 5; `intArg({ limit: 500 }, "limit", 20, 1, 100)` →
  `limit must be between 1 and 100.`
- `{ connection: "nope" }` with one connection named `test` → `No connection "nope". Connections: test.`
- `find_documents` with `{ connection: "Cache local" }`, a Redis connection → `Cache local is a Redis connection: use
  the redis_ tools (redis_scan_keys, redis_key_details).`
- `redis_key_details` with `{ connection: "Cache local", database: 16 }` on a server with 16 databases → `Cache local
  has no database 16.`
- `describe_collection` with `{ database: "admin", collection: "system.users" }` → `admin.system.users is a system
  collection: Datardo's MCP server doesn't read the system.* collections (users, profiler, views…).`

Acceptance:

- [ ] A connection is found by id before name, and a name used twice is refused with the ids to choose from.
- [ ] `find_documents`, `count_documents`, `describe_collection`, `collection_stats`, `watch_changes`,
  `write_history`, `open_query` and every other tool that takes a collection refuse `system.users`, `system.profile`
  and `system.views` with the sentence above, with `datardo.mcp.readData` on or off, and send nothing. (differs)
- [ ] Every refusal above reaches the model as a result with `isError: true` and the exact sentence.
- [ ] No tool for one engine sends anything to a deployment of the other.
- [ ] A tool never opens a dialog in the window to connect: what only the user can answer is refused with the sentence
  above.

### `mcp.output-limits` — Bound what a tool returns and how long it runs

A result must not flood the model's context, and a query or a command must not run for long on the user's server.

- **Kind**: Derivation
- **Engine**: Any
- **Function**: `src/features/mcp/output-limits.ts › truncated(text, max)`, with the constants `MAX_OUTPUT`,
  `MAX_TIME_MS`, `COUNT_CAP`, `SKIP_MAX` and `MAX_BATCH`.
- **Uses**: nothing; used by every group of tools.
- **Ported from**: Mongoster's card mcp.output-limits (`src/shared/mcp.ts › truncate`, `src/mcp/context.ts`,
  `src/mcp/changes.ts › clipped`); `SKIP_MAX` and `MAX_BATCH` from Mongoster 0.9.0 (`src/mcp/context.ts`,
  `src/mcp/http.ts`).
- **Differs**: (M37) `find_documents` takes any `skip` up to 9,007,199,254,740,991, and a batch has no limit
  (`src/features/mcp/data-tools.ts`, `src/main/mcp/http.ts`).

Rules:

- `MAX_OUTPUT` is 60,000 characters, for every tool with no exception. A longer text is cut at the last line break
  before 60,000 when that is past 30,000, otherwise at 60,000, and ends with `… (output truncated at 60,000
  characters)` on a line of its own.
- `MAX_TIME_MS` is 30,000: the `maxTimeMS` of every query and command the tools send to MongoDB, the lists of
  databases and collections, `currentOp` and `getLog` included. A Redis tool waits 30 seconds for a reply *(Datardo's
  choice, the same time)* and then gives up with `<connection> did not answer within 30 s.`
- `COUNT_CAP` is 100,000: counts stop there unless `exact` is asked (`count_documents`), and the text says
  `at least 100,000 documents`.
- `SKIP_MAX` is 1,000,000: the largest `skip` of `find_documents`, so that a call cannot make the server walk a
  collection for nothing; past it, `skip must be between 0 and 1000000.`
- `MAX_BATCH` is 20: the messages of one JSON-RPC batch, each of which may run a command for `MAX_TIME_MS`
  (`mcp.server`).
- The tools' own bounds for MongoDB: documents and results 1 to 100 (default 20); distinct values 1 to 500 (default
  50), each cut at 300 characters; a value in a change or an oplog entry cut at 1,500 characters with
  `… (<n> more characters)`; 400 field lines in `describe_collection`; 300 characters of a running operation's
  command.
- The tools' own bounds for Redis: keys 1 to 1,000 per call (default 100), found with at most 20 `SCAN` calls *(both
  Datardo's choice)*; fields, elements, members and entries 1 to 100 (default 20), each value cut at 1,500 characters
  with `… (<n> more characters)`; 4,000 bytes of a string per call *(Datardo's choice)*; 300 characters of a slow
  command.
- `watch_changes`, `write_history` and `redis_scan_keys` keep 2,000 characters for their head and foot: the events,
  entries or keys that do not fit are left out whole and counted, and what the foot gives to go on (a resume token, a
  cursor) then points at the last one shown, so the next call gets the rest.

Worked examples:

- A 70,000-character text whose last line break before 60,000 is at 59,990 → its first 59,990 characters, then
  `\n… (output truncated at 60,000 characters)`.
- A 70,000-character text with no line break → its first 60,000 characters, then the same line.
- A 2,000-character value in a change event → its first 1,500 characters and `… (500 more characters)`.

Acceptance:

- [ ] No tool returns more than 60,000 characters, plus the line that says it was truncated: `list_connections`,
  `list_databases` and `list_collections` on a deployment with 5,000 collections included.
- [ ] Every query or command a tool sends to MongoDB carries `maxTimeMS: 30000`.
- [ ] A Redis server that does not answer makes the tool fail after 30 seconds with the sentence above, and the next
  call of a tool works again.
- [ ] `find_documents` with `skip: 1000000` runs; with `skip: 1000001` it is refused with `skip must be between 0 and
  1000000.` and sends nothing. (differs)
- [ ] Each worked example above gives its result.

### `mcp.refuse-write-stages` — Refuse pipelines that write, are not a plain read, or read a system collection

Pipelines are the one way a read of MongoDB could write, stay open, or reach what the collection does not hold: a
pipeline with `$out` or `$merge`, with a stage that is not a plain read of the collection, or that joins a `system.*`
collection is refused before anything is sent.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/mcp/refuse-write-stages.ts › readPipeline(text)`
- **Uses**: `mcp.arguments`, `aggregate.run` (how a pipeline's text is read into stages); used by `aggregate`,
  `explain_query`, `open_aggregation` and `open_explain`.
- **Ported from**: Mongoster's card mcp.refuse-write-stages (`src/mcp/context.ts › toolContext`,
  `src/shared/pipeline.ts › isWriteStage`); the nested pipelines, the stages that are not a plain read and the joined
  system collections from Mongoster 0.9.0 (`src/shared/pipeline.ts › notPlainReadStage`, `joinedCollections`,
  `NOT_PLAIN_READ_STAGES`; `src/mcp/context.ts › isSystemCollection`).
- **Differs**: (M37) only the stages at the top of the pipeline are looked at, and only for `$out` and `$merge`: a
  `$currentOp`, a `$changeStream`, a `$merge` inside a `$facet` or a `$lookup` of `system.users` is sent to the server
  (`src/features/mcp/refuse-write-stages.ts › writeStageOf`).

Rules:

- The `pipeline` argument is mongosh text, read into stages as the pipeline editor reads it.
- No stage: `The pipeline is empty.`
- The stages are looked for at the top of the pipeline and in the nested pipelines: the facets of `$facet`, the
  `pipeline` of `$lookup` and of `$unionWith`, to any depth up to 20. A pipeline nested deeper, which no real read
  needs, is refused: `Pipeline: The pipeline is nested too deeply`.
- A stage named `$out` or `$merge` (spaces around the name ignored): `<stage> writes to the database: Datardo's MCP
  server only reads.`
- A stage that is not a plain read of the collection, `$changeStream`, `$changeStreamSplitLargeEvent`, `$currentOp`,
  `$listSessions`, `$listLocalSessions`, `$queryStats`, `$listSampledQueries` or `$planCacheStats`: `<stage> is
  refused: Datardo's MCP server runs only pipelines that read the collection (watch_changes follows the changes,
  current_operations lists the operations, slow_queries gives the query shapes).`
- A `$lookup` or `$graphLookup` whose `from`, or a `$unionWith` whose collection (the string, or its `coll`), starts
  with `system.`: `The pipeline reads <collection>: Datardo's MCP server doesn't read the system.* collections (users,
  profiler, views…).`
- These refusals hold whatever `datardo.mcp.readData` says.
- Text that cannot be read: `Pipeline: <the parser's message>`.
- Otherwise the stages are built into the pipeline sent to MongoDB, or put in the collection tab.
- `watch_changes`' `filter` is only ever a `$match` of the change stream, so it cannot add a stage.

Worked examples:

- `[ { $match: {} }, { $out: "copy" } ]` → `$out writes to the database: Datardo's MCP server only reads.`
- `[ { $merge: { into: "x" } } ]` given to `open_aggregation` → the same refusal for `$merge`; no tab opens.
- `[]` → `The pipeline is empty.`
- `[ { $match: { status: "paid" } }, { $group: { _id: "$city", n: { $sum: 1 } } } ]` → two stages, `$match` and
  `$group`.
- `[ { $facet: { a: [ { $out: "copy" } ] } } ]` → the refusal for `$out`.
- `[ { $lookup: { from: "x", as: "y", pipeline: [ { $unionWith: { coll: "z", pipeline: [ { $merge: { into: "w" } } ]
  } } ] } } ]` → the refusal for `$merge`.
- `[ { $currentOp: { allUsers: true } } ]` → `$currentOp is refused: …`
- `[ { $lookup: { from: "system.users", localField: "a", foreignField: "user", as: "u" } } ]` on the `admin`
  database → `The pipeline reads system.users: …`
- `[ { $unionWith: "system.profile" } ]` → `The pipeline reads system.profile: …`

Acceptance:

- [ ] No tool sends, explains or opens in a tab a pipeline that contains `$out` or `$merge`, at any depth. (differs)
- [ ] `{ " $out ": "copy" }` as a stage is refused like `$out`.
- [ ] No tool sends, explains or opens in a tab a pipeline with `$changeStream`, `$changeStreamSplitLargeEvent`,
  `$currentOp`, `$listSessions`, `$listLocalSessions`, `$queryStats`, `$listSampledQueries` or `$planCacheStats`, at
  any depth. (differs)
- [ ] No tool reads a `system.*` collection as the source of a `$lookup`, `$graphLookup` or `$unionWith`, at any
  depth. (differs)
- [ ] Each worked example above gives its result, and the refused ones send nothing and open no tab. (differs)

### `mcp.log` — The MCP server in the Log

What the server did and which tools the AI called, for the user to check: the lines of the source **MCP** of the Log
page.

- **Kind**: Derivation
- **Engine**: Any
- **Function**: `src/features/mcp/log.ts › logLine(event)`
- **Entry points**: the Log page filtered by the source **MCP** (`runner.log`); **Show the log** in the dialog of
  `mcp.setup` (`@dialog`), which opens it so.
- **Uses**: `runner.log`, `mcp.server`, `mcp.protocol`.
- **Ported from**: Mongoster's card mcp.log (`src/mcpServer.ts › McpServer.log`, `› logOnce`, `› summary`); the
  error cut to one line from Mongoster 0.9.0 (`src/shared/mcp.ts › logText`).
- **Differs**: (M37) the message of an error is written whole, its line breaks included (`src/features/mcp/log.ts ›
  outcomeText`).

Rules:

- Each call of a known tool is one line: its name, its arguments as JSON on one line (cut at 300 characters with `…`),
  an arrow and the outcome: `ok`, `error: <message>` or `missing <keys>`.
- The message of an error is cut at 300 characters with `…`, and its line breaks become spaces, so that a long or
  many-line error of the server neither floods the Log nor passes for other lines.
- The server's state is one line when it changes, and not again while the server tries the port every 3 seconds:
  `Listening on <url>`, `Stopped`, `Not started: <why>`, `New access token: the old one no longer works`.
- The Log gives each line its time and its source, as it does for every line.
- Not logged: `initialize`, `tools/list`, `ping`, calls of unknown or hidden tools, and the requests refused by the
  HTTP checks. The access token is never written.

Worked examples:

- `find_documents` on `shop.orders` of Local that succeeded →
  `find_documents {"connection":"Local","database":"shop","collection":"orders"} → ok`.
- `list_databases` without arguments → `list_databases {} → missing connection`.
- `aggregate` with `$out` → `aggregate {…} → error: $out writes to the database: Datardo's MCP server only reads.`
- A filter of 500 characters → the first 300 characters of the JSON, then `…`.
- A failed call whose error is 1,000 characters on three lines → `… → error: ` and the first 300 characters of the
  error on one line, then `…`.

Acceptance:

- [ ] Each worked example above gives its line, under the source **MCP**. (differs)
- [ ] No line the MCP server writes in the Log has a line break, whatever the server's error says. (differs)
- [ ] A port still taken after ten tries is logged once as `Not started: Port 37018 is used by another program.`
- [ ] A request with a wrong token leaves no line.
- [ ] The Log filtered by **MCP** shows no line of a feature the user started in the window.

### `mcp.data-tools` — Explore the connections and read documents

The basic tools: what is saved in Datardo, what each MongoDB deployment holds, the shape of a collection, and
documents found with a query or an aggregation.

- **Kind**: Read
- **Engine**: MongoDB
- **Function**: `src/features/mcp/data-tools.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: the tools `list_connections`, `list_databases`, `list_collections`, `describe_collection`,
  `find_documents` and `aggregate` of the MCP server.
- **Reads**: the saved connections of both engines (names, ids, engines, folders, read-only, connected),
  `listDatabases`, `listCollections`, `estimatedDocumentCount`, a `$sample`, `listIndexes`, `$listSearchIndexes`,
  `find`, `countDocuments` and `aggregate`.
- **Settings**: `datardo.mcp.readData` hides `find_documents` and `aggregate`, and off makes `describe_collection`
  give a partial filter expression as its shape.
- **Uses**: `mcp.arguments`, `mcp.output-limits`, `mcp.refuse-write-stages`, `mcp.read-data`, `schema.analyze`,
  `query.parse`, `tree.excluded`.
- **Ported from**: Mongoster's card mcp.data-tools (`src/mcpTools.ts › mcpTools`, `› flattenFields`,
  `src/mcp/context.ts`); the bound of `skip`, the `system.*` collections refused and the partial filters as shapes
  from Mongoster 0.9.0; the lists without what is excluded from searches from Mongoster 0.9.0 (`src/mcpTools.ts`,
  `src/shared/exclusions.ts › ownExclusion`).
- **Differs**: (M37) `find_documents` takes any `skip`; a `system.*` collection is described, found and aggregated;
  `describe_collection` gives a partial filter expression with its values whatever `datardo.mcp.readData` says.
  (M39) the three lists give every connection, database and collection, since nothing can be excluded from searches
  yet.

The tools:

| Tool | Arguments | Returns | Without `readData` |
| --- | --- | --- | --- |
| `list_connections` | none | JSON, for the connections of both engines: `name`, `id`, `engine` (`mongodb` or `redis`), `folder` when set, `readOnly: true` on a read-only connection, `connected`, of the connections not excluded from searches; `No connections are saved in Datardo.`, or `The user excluded every connection saved in Datardo from searches.` | offered |
| `list_databases` | `connection` | JSON: `name`, `sizeOnDisk`, `empty` of each database not excluded from searches | offered |
| `list_collections` | `connection`, `database` | JSON sorted by name: `name`, `type`, `viewOn` for a view, of the collections without an exclusion of their own; `<database> has no collections.`, or `The user excluded every collection of <database> from searches.` | offered |
| `describe_collection` | `connection`, `database`, `collection`, `sample` (1 to 1000, default 200) | the estimated count, the indexes with their options, the search indexes when the server has them, and each field of a random sample with its types and how often it is present | offered; a partial filter expression as its shape |
| `find_documents` | `connection`, `database`, `collection`, `filter`, `sort`, `projection`, `skip` (0 to 1,000,000, default 0), `limit` (1 to 100, default 20) | how many match and the documents in mongosh syntax | hidden |
| `aggregate` | `connection`, `database`, `collection`, `pipeline`, `limit` (1 to 100, default 20) | the first results in mongosh syntax | hidden |

Acceptance:

- [ ] The promise: `list_connections` never returns a connection string, a password, an SSH passphrase or the name of
  the user a connection signs in with, and none of these tools writes: they send only `listDatabases`,
  `listCollections`, `$sample`, `listIndexes`, `$listSearchIndexes`, `find`, `count`, and `aggregate` without `$out`,
  `$merge` or the other stages of `mcp.refuse-write-stages`, and never on a `system.*` collection. (differs)
- [ ] `list_connections` with a MongoDB connection Local and a Redis connection Cache local lists both, each with its
  `engine`.
- [ ] `describe_collection` starts with `shop.orders: about 1,234 documents, 200 documents sampled.` (`unknown number
  of` when the estimate fails), lists `Indexes:` as `- name: { key } unique sparse TTL 3600s partial { … } hidden`
  (`- none (a view)` for a view), adds the search indexes (the `index` of `$search` and `$vectorSearch`) only where
  the server has them, and lists up to 400 fields as `- address.city: string 98%, null 2% (100%)`, the percentage in
  brackets being the share of sampled documents that have the field.
- [ ] `find_documents` starts with `shop.orders: 3 documents match, showing 1–3.`; past 100,000 it says
  `At least 100,000 documents match`, and when the count fails `An unknown number of documents match`; with no
  document, `none returned` and `[]`.
- [ ] `aggregate` starts with `shop.orders: 20 results (the first 20; there are more).` when the pipeline gives more
  than `limit`.
- [ ] Values keep their BSON type in the text: `ObjectId("…")`, `ISODate("…")`, `NumberLong(…)`, `Decimal128(…)`.
- [ ] A view can be described, found and aggregated like a collection.
- [ ] `list_databases` on a Redis connection is refused with the sentence of `mcp.arguments`.
- [ ] With the connection Staging excluded from searches, `list_connections` leaves it out; with the database `logs`
  of Local excluded, `list_databases` of Local leaves it out; with `shop.audit` excluded, `list_collections` of `shop`
  leaves out `audit` and keeps the others, and with `shop` excluded it still lists every collection of `shop` that
  has no exclusion of its own. (differs)
- [ ] With every connection excluded, `list_connections` says `The user excluded every connection saved in Datardo
  from searches.`; with every collection of `shop` excluded, `list_collections` says `The user excluded every
  collection of shop from searches.` (differs)
- [ ] What is excluded still answers when it is named: `list_databases` of Staging, `describe_collection` of
  `shop.audit` and `find_documents` on a collection of `logs` answer as if nothing were excluded (`mcp.arguments`).

### `mcp.debugging-tools` — Follow what an application writes

The tools for debugging an application: the writes to MongoDB as they happen, the recent writes kept in the oplog, and
the writes made from Datardo itself, to documents and to keys, with what was there before.

- **Kind**: Read
- **Engine**: Any
- **Function**: `src/features/mcp/debugging-tools.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: the tools `watch_changes`, `write_history`, `datardo_writes` and `datardo_write_details` of the
  MCP server. The first two are for MongoDB; the two others read the undo history, which holds both engines.
- **Reads**: a change stream (`watch` on a collection, a database or the deployment), `local.oplog.rs`, `hello` and
  `buildInfo`, and the files of the undo history.
- **Refuses**: a standalone server for change streams and the oplog; a sharded cluster for the oplog; missing roles
  (below).
- **Settings**: `datardo.mcp.readData` hides `watch_changes`, `write_history` and `datardo_write_details`, and takes
  the values out of the titles `datardo_writes` returns; `datardo.undo.enabled` is reported by `datardo_writes`.
- **Uses**: `mcp.arguments`, `mcp.output-limits`, `mcp.read-data`, `undo.record`, `undo.limits`, `undo.show`.
- **Ported from**: Mongoster's card mcp.debugging-tools (`src/mcp/changes.ts › changesTools`, `src/mcp/workspace.ts ›
  workspaceTools`), where the last two tools are named mongoster_writes and mongoster_write_details; the `system.*`
  collections left out from Mongoster 0.9.0 (`src/mcp/changes.ts`).
- **Differs**: (M37) `write_history` lists the writes to the `system.*` collections with the others, and
  `watch_changes` and `write_history` take a `system.*` collection as their `collection`.

The tools:

| Tool | Arguments | Returns | Without `readData` |
| --- | --- | --- | --- |
| `watch_changes` | `connection`, `database`, `collection`, `waitSeconds` (0 to 25, default 10), `maxEvents` (1 to 200, default 50), `resumeAfter`, `operationTypes`, `filter` (a `$match` on the event), `since`, `fullDocument` (default true) | the events: time, operation, namespace, `_id`, fields set and unset, truncated arrays, the document after (and before, where the collection records pre-images); then the resume token | hidden |
| `write_history` | `connection`, `database`, `collection`, `id` (mongosh syntax), `operations` (`insert`, `update`, `delete`, `command`), `since`, `until`, `limit` (1 to 500, default 50) | the oplog's writes, newest first: time, operation, namespace, `_id`, the inserted document, an update's fields set and unset with their values, commands; transactions expanded; the oplog window | hidden |
| `datardo_writes` | `connection`, `database`, `collection`, `limit` (1 to 200, default 20) | the undo history, newest first: id, time (UTC), connection, `database.collection` or the Redis database (`db0`), title, counts, undone or undo of | offered, titles without values |
| `datardo_write_details` | `id`, `limit` (1 to 100, default 20) | what one operation kept, as it was before: documents updated and deleted in full, inserted by `_id`; keys by name, type, size and expiry | hidden |

Acceptance:

- [ ] The promise: these tools write nothing. `watch_changes` only opens a change stream and closes it before
  answering; `write_history` only reads `local.oplog.rs`; the two others only read the files of the undo history, and
  undo nothing.
- [ ] `watch_changes` waits up to `waitSeconds`, returns as soon as `maxEvents` arrived, and starts with
  `Changes of shop.orders: 3 events, waited 4 s.`; the head says why it stopped (`stopped at maxEvents (50): more
  changes may be waiting, call again with resumeAfter`, `1 more event didn't fit in the output: call again with
  resumeAfter to get them`, or that the stream was invalidated). It ends with `Resume token: <hex>` and
  `(pass it as resumeAfter to get the changes after these)`; called again with it, it returns the changes right after,
  none lost and none repeated.
- [ ] `watch_changes` refusals: `Change streams need a replica set or a sharded cluster: <connection> is a standalone
  server.`; `Use resumeAfter or since, not both.`; a token older than the oplog (`The resume token is older than the
  oplog: …`); `Invalid resume token: …`; missing roles (`Not authorized to open a change stream on <connection>: …`);
  expanded events (`create`, `createIndexes`, `dropIndexes`, `modify`, `shardCollection`, `refineCollectionShardKey`,
  `reshardCollection`) before MongoDB 6.0 (`… events need MongoDB 6.0 or later.`).
- [ ] `write_history` starts with `Writes to shop.orders (_id "w1", since …), newest first: 3 operations.`, lists the
  operations of a transaction under one heading (`transaction, lsid …, txnNumber …`), and ends with
  `Oplog window: <first> → <last> (3.2 h).`
- [ ] `write_history` never shows a write to a `system.*` collection (a user created in `admin.system.users`,
  `system.views` changed by a view's creation), with or without `collection`, and the count of its head leaves them out;
  `watch_changes` and `write_history` refuse a `system.*` collection as their `collection` (`mcp.arguments`).
  (differs)
- [ ] `write_history` refusals: a mongos (`<connection> is a sharded cluster (mongos): the oplog is on each shard. …`),
  a standalone server (`The oplog exists only on replica sets: <connection> is a standalone server. …`), missing roles
  (`Not authorized to read the oplog of <connection>: …`), `since is after until.`, and a read over 30 s that found
  nothing (`Reading the oplog took more than 30 s without finding a match: …`).
- [ ] `datardo_writes` lists each operation as `- id <id> · <time> · Local › shop.orders · <title> · 3 updated`, an
  operation on keys as `- id <id> · <time> · Cache local › db0 · <title> · 2 keys`, and adds `undone <time>` or `undo
  of <id>`. It ends with the limits of the history (`undo.limits`), by default `The history keeps up to 200 writes from
  the last 7 days, of up to 10,000 documents each: older or larger writes aren't listed.`, and says when the history
  is off (`The undo history is off (setting datardo.undo.enabled): new writes aren't recorded.`) or a connection's
  writes are not recorded (`Writes aren't recorded for: Prod (read-only).`).
- [ ] `datardo_writes` with `collection` and a Redis connection is refused: `collection is for MongoDB connections.`
- [ ] `datardo_write_details` refuses an unknown id (`No write <id> in the undo history: use datardo_writes (it may
  have been removed by the history's limits).`) and an undone operation (`The write u was undone on
  2026-01-01T00:00:00Z: its documents are no longer kept.`).
- [ ] `datardo_write_details` of an operation on keys lists each key as `- orders:42 · hash · 1.2 KB · expires in 59
  m` (`persistent`, or `did not exist` for a key the operation created); the values, kept as the server dumps them, are
  not returned.
- [ ] With `datardo.mcp.readData` off, `datardo_writes` returns `Delete document` for the operation titled `Delete
  document ObjectId("65f1…a2c")` (`mcp.read-data`).

### `mcp.performance-tools` — Find what makes a database slow

How a query runs, the slow operations by query shape, what the MongoDB server runs now, the indexes to create or
drop, and the size of a collection and of its indexes.

- **Kind**: Read
- **Engine**: MongoDB
- **Function**: `src/features/mcp/performance-tools.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: the tools `explain_query`, `slow_queries`, `current_operations`, `index_advice` and
  `collection_stats` of the MCP server.
- **Reads**: `explain("executionStats")`, `profile: -1` (the level, without changing it), `system.profile`,
  `getLog: "global"`, `currentOp`, `listIndexes`, `$indexStats`, `$collStats`, `estimatedDocumentCount`.
- **Refuses**: missing roles, saying which (`Not authorized to <action>: the user needs the <role> role (…)`).
- **Settings**: `datardo.mcp.readData` hides `explain_query`; off, `current_operations` writes each command as its
  query shape, and `collection_stats` a view's pipeline and the partial filter expressions as their shapes.
- **Uses**: `mcp.arguments`, `mcp.output-limits`, `mcp.refuse-write-stages`, `mcp.read-data`, `explain.show` (the
  summary and the suggested index), `advisor.show` (the advice).
- **Ported from**: Mongoster's card mcp.performance-tools (`src/mcp/performance.ts › performanceTools`); what
  `datardo.mcp.readData` hides from Mongoster 0.9.0.
- **Differs**: (M37) `explain_query` is offered with `datardo.mcp.readData` off, and `collection_stats` gives a view's
  pipeline with its values (`src/features/mcp/performance-tools.ts`).

The tools (all but `explain_query` offered with `datardo.mcp.readData` off):

| Tool | Arguments | Returns |
| --- | --- | --- |
| `explain_query` | `connection`, `database`, `collection`, and either `filter`, `sort`, `projection`, `limit` (0 for none) or `pipeline` | how it ran (COLLSCAN or the index, in-memory sort, rejected candidates), keys and documents examined against returned, time, the stages after the query layer, and the index to create by the ESR rule with its `createIndex` command |
| `slow_queries` | `connection`, `database`, `source` (`auto`, `profiler`, `log`), `sinceMinutes` (default 60, 0 for all), `namespace`, `limit` (1 to 200, default 20) | the slow operations grouped by query shape, slowest in total first: count, total, average and maximum time, documents and keys examined against returned, index used, in-memory sort, an index that could help, last time, apps |
| `current_operations` | `connection`, `minSeconds` (default 0), `namespace`, `waitingForLock`, `includeIdle`, `limit` (1 to 500, default 50) | the operations running now, active and longest first: opid, time, type, namespace, the command on one line, index used, client, app, user, locks, transaction |
| `index_advice` | `connection`, `database`, `collection` | the indexes to create for the slow operations with their command and the shapes they serve, the redundant indexes and the one that serves them, the unused and hidden ones, with sizes |
| `collection_stats` | `connection`, `database`, `collection` | documents, data size, storage size and compression, free space, average document, capped, and each index with its size, uses since when, unique, sparse, TTL, partial, hidden, building |

Acceptance:

- [ ] The promise: these tools never change the profiler (they send `profile: -1`, which only reads the level), never
  kill an operation, and never create or drop an index: the `createIndex` commands are only text for the user. After
  `slow_queries` on a database whose profiler is at level 2, the level is still 2.
- [ ] `explain_query` with both a pipeline and `filter`, `sort`, `projection` or `limit` is refused:
  `Give either a pipeline or filter/sort/projection/limit, not both: put a $match, $sort, $project or $limit stage in
  the pipeline instead.` A collection scan reads `Plan: COLLSCAN (every document of the collection is read: no index
  serves the filter).`
- [ ] `slow_queries` gives shapes with `?` in place of the values (`find shop.orders: { a: ?, s: ? } · sort { b: 1 }`)
  and never the values of the queries. `source: "auto"` reads the profiler of `database` when it is on or has entries,
  otherwise the last 1,024 lines of the server log; `source: "profiler"` without `database` is refused with
  `database is required with source "profiler": each database has its own profiler.` When the profiler is off, the text
  says how to turn it on (the Monitor page's profiler, or `db.setProfilingLevel(1, { slowms: 100 })`) without doing
  it.
- [ ] `current_operations` leaves out its own `currentOp`, the session fields (`lsid`, `$clusterTime`, `txnNumber` and
  the like) and starts with `0 operations running 3600 s or more, in shop (of 12 active).`; without the `inprog`
  privilege it shows the user's own operations and says
  `Only the user's own operations: seeing all of them needs the clusterMonitor role (inprog).`
- [ ] `current_operations` cuts each command at 300 characters; with `datardo.mcp.readData` on it has the command's
  literal values, with it off `?` in their place (`mcp.read-data`).
- [ ] `index_advice` on a view answers that a view has no indexes of its own; with no advice it says
  `No advice: no missing, redundant, unused or hidden index found.`; indexes whose statistics started less than 24 hours
  ago are counted apart, not called unused.
- [ ] `explain_query` is not offered with `datardo.mcp.readData` off: its plan quotes the bounds of the query, a failed
  explain the values it failed on, and documents examined against returned is a count per filter (`mcp.read-data`).
  (differs)
- [ ] `collection_stats` on a view with `datardo.mcp.readData` off gives `… is a view on orders with the pipeline [ {
  $match: { status: ? } } ] …`. (differs)

### `mcp.deployment-tools` — Read the state of the deployment

The server's status, the sizes of the databases and collections, the replica set and the sharded cluster, for when the
problem is the MongoDB deployment rather than the data.

- **Kind**: Read
- **Engine**: MongoDB
- **Function**: `src/features/mcp/deployment-tools.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: the tools `server_status`, `database_stats`, `replica_set_status` and `sharding_status` of the MCP
  server.
- **Reads**: `hello`, `buildInfo`, `serverStatus`, `listDatabases`, `dbStats`, `$collStats`, `replSetGetStatus`,
  `replSetGetConfig`, the first and last entries of `local.oplog.rs`, and on a mongos `listShards`, `balancerStatus`,
  `balancerCollectionStatus`, `getShardMap` and the `config` database.
- **Refuses**: a database that does not exist (`The database <name> doesn't exist on <connection>: use
  list_databases.`).
- **Settings**: `datardo.mcp.readData` hides none of them; off, `sharding_status` leaves out what quotes shard key
  values.
- **Uses**: `mcp.arguments`, `mcp.output-limits`, `mcp.read-data`, `monitor.show` (the same readings).
- **Ported from**: Mongoster's card mcp.deployment-tools (`src/mcp/topology.ts › topologyTools`); what
  `datardo.mcp.readData` hides from Mongoster 0.9.0 (`src/mcp/topology.ts › formatShardingStatus`).
- **Differs**: (M37) `sharding_status` gives the details of its events and the server's text of what it could not
  read whatever `datardo.mcp.readData` says (`src/features/mcp/tool/sharding.ts › eventLines`).

The tools (all offered with `datardo.mcp.readData` off):

| Tool | Arguments | Returns |
| --- | --- | --- |
| `server_status` | `connection` | host, mongod or mongos and version, uptime, storage engine, topology, connections, operation counters (and replicated ones on a replica set), network, memory, WiredTiger cache, global lock queues, asserts, transactions |
| `database_stats` | `connection`, `database`, `limit` (1 to 1000, default 50) | every database (or the one given) largest on disk first, with collections, views, documents, data, storage and index sizes and a total; with `database`, also its collections, largest data first, and its views |
| `replica_set_status` | `connection` | the set's name, term, primary, every member (state, health, uptime, last applied, lag, heartbeat, ping, sync source, priority, votes, hidden, arbiter, delay, tags), the settings and the oplog window and size |
| `sharding_status` | `connection`, `events` (0 to 100, default 20) | on a mongos: the balancer, migrations of the last 24 hours, shards, sharded collections with their key, chunks, data per shard and balance, and the recent changelog events, failures first |

Acceptance:

- [ ] The promise: these tools write nothing and change no setting of the server: they never step down a primary and
  never start or stop the balancer. They show hosts and replica set names, never a connection string.
- [ ] `server_status` on a standalone server says `Topology: standalone server.`; on a primary,
  `Topology: member of the replica set rs0, state PRIMARY; primary host:27017, 1 electable member`.
- [ ] Without the role a command needs, the tools show what they could read and say which role is missing:
  `serverStatus could not be read: … (needs the clusterMonitor role). Only what hello and buildInfo tell is shown.`
- [ ] `replica_set_status` on a standalone server says `<host> is a standalone server, not a replica set member: there
  are no members, no replication and no oplog.`, and on a mongos points to `sharding_status`.
- [ ] `sharding_status` on a server that is not a mongos says what it is (`… is a standalone server: it is not a
  sharded cluster.`, `… is a replica set member, not a mongos: it is not a sharded cluster (use
  replica_set_status).`).
- [ ] With `datardo.mcp.readData` off, `sharding_status` gives the zones by name, as with it on, the recent events
  without their details, adding `(the events' details are left out: they quote shard key values and
  datardo.mcp.readData is off)`, and of what could not be read only what it was and the role it needs, without the
  server's text (`mcp.read-data`). (differs)
- [ ] `database_stats` with `limit: 2` on a deployment with five databases lists the two largest and says that three
  more are not listed.

### `mcp.data-model-tools` — Answer quick questions about the data model

Counts, the values of a field, the references between collections, a collection's definition, the queries the user
saved, and whether a MongoDB connection publishes for redis-oplog.

- **Kind**: Read
- **Engine**: MongoDB
- **Function**: `src/features/mcp/data-model-tools.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: the tools `count_documents`, `distinct_values`, `describe_relations`, `collection_options`,
  `list_saved_queries` and `redis_oplog_status` of the MCP server. The last keeps Mongoster's name: it is a tool on a
  MongoDB connection, although its name starts like those for Redis.
- **Reads**: `countDocuments`, `estimatedDocumentCount`, an aggregation for the distinct values, samples of every
  collection of a database, `listCollections`, `config.collections`; the user's saved and recent queries and the files
  of the connection's queries folder; the linked connection of the MongoDB connection, and with `check` a `PING` to
  it.
- **Settings**: `datardo.mcp.readData` hides `distinct_values`, and off makes `count_documents` refuse a filter,
  `collection_options` give the validator and a view's pipeline without their values, and `list_saved_queries` write
  `?` for the values of the queries.
- **Uses**: `mcp.arguments`, `mcp.output-limits`, `mcp.read-data`, `relation.detect`, `saved-query.save`,
  `saved-query.recent`, `oplog.publish`, `connection.link-redis`.
- **Ported from**: Mongoster's card mcp.data-model-tools (`src/mcp/data.ts › dataTools`, `src/mcp/workspace.ts ›
  workspaceTools`); what `datardo.mcp.readData` hides from Mongoster 0.9.0 (`src/mcp/data.ts`, `› optionsText`).
- **Differs**: (M37) with `datardo.mcp.readData` off, `count_documents` counts any filter and `collection_options`
  gives the validator and a view's pipeline with their values (`src/features/mcp/data-model-tools.ts`,
  `src/features/mcp/tool/collection-options.ts`).

The tools:

| Tool | Arguments | Returns | Without `readData` |
| --- | --- | --- | --- |
| `count_documents` | `connection`, `database`, `collection`, `filter`, `exact` (default false) | the count, stopping at 100,000 unless `exact`; with no filter also the estimate from the metadata | the total only: a filter is refused |
| `distinct_values` | `connection`, `database`, `collection`, `field` (a field path), `filter`, `limit` (1 to 500, default 50) | the values most frequent first with how many documents have each, their types when mixed, the number of distinct values, and the documents with null and without the field | hidden |
| `describe_relations` | `connection`, `database`, `collection`, `sample` (1 to 2000, default 100) | the fields that reference other collections (`orders.customerId → customers._id (one per document; 20 of 20 sampled values found, 100%)`), DBRefs and views; with `collection`, only those from and to it | offered |
| `collection_options` | `connection`, `database`, `collection` | the kind (collection, capped, clustered, view, time series), validator with its level and action, a view's source and pipeline, capped size, time series options, clustered index, `expireAfterSeconds`, collation, pre- and post-images, shard key | offered; the validator as field names and types, a view's pipeline as its shape |
| `list_saved_queries` | `connection`, `database`, `collection` | the saved queries, those in the queries folder first with their file, then those for me, and the recent ones, newest first, as written | offered, values as `?` |
| `redis_oplog_status` | `connection`, `database`, `collection`, `check` (default false) | whether the connection publishes, the name of its linked connection, the channel prefix, namespaces and patterns published, the channels of a collection, the last publishing error, and with `check` whether Redis answers | offered |

Acceptance:

- [ ] The promise: these tools write nothing to MongoDB or to Redis (`check` sends only `PING`), and
  `redis_oplog_status` never returns the connection string of the linked connection: it says `Linked connection: Cache
  local.` or `Linked connection: missing: nothing can be published until a Redis connection is linked again in the
  connection form.`, and any `redis://` or `rediss://` text in an error becomes `<Redis connection string>`.
- [ ] `count_documents` with no filter says `shop.items has 5 documents.` and
  `Estimate from the collection's metadata: 5 documents.`; with a filter, `shop.items: 2 documents match { status:
  "active" }.` (`1 document matches`); past 100,000 without `exact`, `at least 100,000 documents` and
  `(counting stopped there: pass exact: true for the exact number)`. A failing count gives `The count failed: …`.
- [ ] `distinct_values` counts an array's element once per document, and refuses a field that starts with `$` or has an
  empty part (`field must be a field path like address.city, not "$status".`); a failing aggregation gives
  `The aggregation failed: …`. Each value is cut at 300 characters.
- [ ] `collection_options` explains the validation: `validationLevel: strict (default): every insert and update is
  validated.`, `validationAction: error (default): invalid writes are refused (error 121, Document failed
  validation).`, or `No validator: any document is accepted.`
- [ ] `list_saved_queries` lists a query of the queries folder as `- "Open orders", in the folder: <file>` and one for
  me as `- "Open orders", saved for the user 2026-11-17T10:20:30Z`, each followed by its `filter`, `sort` and
  `projection` or its `pipeline`; on a collection with nothing stored it checks that the collection exists, then says
  `No saved or recent queries for shop.orders on Local.`
- [ ] `redis_oplog_status` on a connection that does not publish says
  `<connection> doesn't publish Datardo's writes to Redis for redis-oplog (it can be turned on in the connection
  form).`; on a read-only connection it adds `<connection> is read-only: Datardo makes no writes through it, so nothing
  is published.`
- [ ] `redis_oplog_status` with `database: "shop"` and `collection: "orders"` in the published scope says on which
  channels the writes go, with `<_id>` in place of the document's id; out of the scope, `The writes on shop.orders are
  not published (no pattern matches).`
- [ ] With `datardo.mcp.readData` off, a saved filter `{ status: "paid", total: { $gt: 100 } }` is returned as
  `filter: { status: ?, total: { $gt: ? } }` (`mcp.read-data`).
- [ ] With `datardo.mcp.readData` off, `count_documents` with a filter that is not empty is refused before anything
  is sent, with `A filter is refused because datardo.mcp.readData is off: …`; with no filter, or `{}`, it gives the
  total and the estimate (`mcp.read-data`). (differs)
- [ ] With `datardo.mcp.readData` off, `collection_options` gives `Validator ($jsonSchema; field names and types
  only, datardo.mcp.readData is off): …` and `Pipeline (values replaced by ?, datardo.mcp.readData is off): …`
  (`mcp.read-data`). (differs)

### `mcp.redis-key-tools` — Read the keys of a Redis server

The keys of a Redis database a page at a time, what a key is, and its value a part at a time.

- **Kind**: Read
- **Engine**: Redis
- **Function**: `src/features/mcp/redis-key-tools.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: the tools `redis_scan_keys`, `redis_key_details` and `redis_read_value` of the MCP server.
- **Reads**: `SELECT <database>` on a client the MCP server keeps for itself, so that the database of the user's tabs
  never moves; then only `SCAN`, `TYPE`, `PTTL`, `OBJECT ENCODING`, `MEMORY USAGE`, `STRLEN`, `HLEN`, `LLEN`, `SCARD`,
  `ZCARD`, `XLEN`, `GETRANGE`, `HSCAN`, `LRANGE`, `SSCAN`, `ZRANGE` and `XRANGE`.
- **Refuses**: a key that does not exist; the value of a key of a module's type; arguments that do not fit the key's
  type (below).
- **Settings**: `datardo.mcp.readData` hides `redis_read_value`.
- **Uses**: `mcp.arguments`, `mcp.output-limits`, `mcp.read-data`, `key.scan` (the same way of listing),
  `value.format` (how bytes are written).
- **Ported from**: *New in Datardo*.

The tools:

| Tool | Arguments | Returns | Without `readData` |
| --- | --- | --- | --- |
| `redis_scan_keys` | `connection`, `database`, `pattern` (default `*`), `type` (`string`, `hash`, `list`, `set`, `zset`, `stream`), `cursor` (default `0`), `limit` (1 to 1,000, default 100) | the keys found from the cursor on, each with its type, and the cursor to go on with, or that the scan is complete | offered |
| `redis_key_details` | `connection`, `database`, `key` | the key's type, encoding, number of fields, elements, members or entries (bytes for a string), memory used, and expiry | offered |
| `redis_read_value` | `connection`, `database`, `key`, `from`, `count` (1 to 100, default 20), `match` | a part of the value: bytes of a string, fields of a hash, elements of a list, members of a set or of a sorted set with their scores, entries of a stream; then where the next part starts | hidden |

How each works:

- `redis_scan_keys` sends `SCAN <cursor> MATCH <pattern> COUNT <n>`, with ` TYPE <type>` when a type is given; `n` is
  `limit`, at most 500. It sends it again with the cursor returned until it has `limit` keys, the cursor is `0`, or it
  has sent it 20 times *(Datardo's choice)*. It never sends `KEYS`. A key the server returned twice is listed once.
  Without `type`, it then sends `TYPE <key>` for every key found, in one round trip.
- `redis_key_details` sends `TYPE`, `PTTL`, `OBJECT ENCODING`, `MEMORY USAGE` and the length of the key's type:
  `STRLEN`, `HLEN`, `LLEN`, `SCARD`, `ZCARD` or `XLEN`.
- `redis_read_value` reads by the key's type. `from` is where the part starts, and the answer ends with the `from` of
  the next part:
  - string: `GETRANGE <key> <from> <from + 3999>`; `from` is a byte offset, default 0; `count` is not used. A
    character of several bytes cut at the end of a part is left for the next one.
  - hash: `HSCAN <key> <from> COUNT <count>`, with ` MATCH <match>` when given; `from` is a cursor, default `0`.
  - list: `LRANGE <key> <from> <from + count - 1>`; `from` is an index, default 0.
  - set: `SSCAN <key> <from> COUNT <count>`, with ` MATCH <match>` when given; `from` is a cursor, default `0`.
  - sorted set: `ZRANGE <key> <from> <from + count - 1> WITHSCORES`; `from` is a rank, default 0.
  - stream: `XRANGE <key> <from> + COUNT <count>`; `from` is an entry ID, default `-`; the next part starts at
    `(<last ID>`, the entries after the last one shown.
- A value, a field, an element or a member that is valid UTF-8 is written as text in double quotes; any other as
  `hex:` and its bytes in hexadecimal (`value.format`). Each is cut at 1,500 characters with `… (<n> more
  characters)`.

Acceptance:

- [ ] The promise: these tools send only the commands listed in **Reads**. None of them writes, changes an expiry,
  or runs a command the assistant writes: there is no argument that holds a command.
- [ ] `redis_scan_keys` with `pattern: "orders:*"`, `type: "hash"` and the default limit sends `SCAN 0 MATCH orders:*
  COUNT 100 TYPE hash`; with `limit: 1000`, `COUNT 500`.
- [ ] `redis_scan_keys` starts with `Cache local db0: 100 keys match orders:* (type hash), the scan is not finished.`,
  lists each key as `- orders:42 · hash`, and ends with `Cursor: 4096` and `(pass it as cursor to go on from here)`.
  When the cursor came back as `0` it says `the scan is complete.` and gives no cursor.
- [ ] A scan that found nothing in 20 calls says `Cache local db0: no keys match orders:* so far, the scan is not
  finished.` and gives the cursor: an empty answer is not the end.
- [ ] The pages the server returns are listed whole, so that no key is skipped: the answer can hold more keys than
  `limit`. When they do not fit in the output, the foot says `12 more keys didn't fit in the output: scan again from
  the same cursor with a smaller limit.` and gives the cursor the call started from (`mcp.output-limits`).
- [ ] `redis_scan_keys` refusals: `type must be one of string, hash, list, set, zset, stream.`; `cursor must be the
  cursor returned by redis_scan_keys.` for anything that is not digits.
- [ ] `redis_key_details` of a hash answers `orders:42 in db0 of Cache local`, `Type: hash`, `Encoding: listpack`,
  `Fields: 12`, `Memory: 1.2 KB`, `Expiry: in 59 m 12 s (2026-11-18T10:20:30Z)`; a key without an expiry, `Expiry:
  none (the key is persistent)`.
- [ ] A key that does not exist is refused by both tools: `The key orders:42 doesn't exist in db0 of Cache local: use
  redis_scan_keys.`
- [ ] A key of a module's type: `redis_key_details` gives its type as the server names it, its memory and its expiry,
  without a length; `redis_read_value` is refused with `The value of orders:idx (type ReJSON-RL) can't be read: Datardo
  doesn't show the values of module types.`
- [ ] `redis_read_value` of a string of 10,240 bytes starts with `orders:42:note (string, 10,240 bytes), bytes
  0–3,999:` and ends with `Next: from 4000`; the last part ends with `That is the end of the value.`
- [ ] `redis_read_value` of a hash lists each field as `- status: "paid"` and ends with `Next: from 96`, or with the
  end when the cursor came back as `0`. A small hash or set that the server returns whole in one page shows its first
  100 fields or members and says `412 more in this page are not shown: narrow them with match.`
- [ ] `redis_read_value` of a list lists `- [0] "a"`; of a sorted set `- "ada" · score 12.5`; of a stream
  `- 1700000000000-0: { status: "paid", total: "42.50" }`.
- [ ] A value that is not valid UTF-8 is returned as `hex:` and its bytes, never as broken text.
- [ ] `redis_read_value` refusals: `match is for hashes and sets.`; `from must be a whole number for a string, a list
  or a sorted set.`; `from must be an entry ID like 1700000000000-0 for a stream.`
- [ ] With `datardo.mcp.readData` off, `redis_scan_keys` and `redis_key_details` answer as above and
  `redis_read_value` is an unknown tool (`mcp.read-data`).

### `mcp.redis-server-tools` — Read the state of a Redis server

The server's information, its slow log, its clients and its memory, for when the problem is the server rather than
the keys.

- **Kind**: Read
- **Engine**: Redis
- **Function**: `src/features/mcp/redis-server-tools.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: the tools `redis_server_info`, `redis_slow_log`, `redis_clients` and `redis_memory` of the MCP
  server.
- **Reads**: only `INFO`, `SLOWLOG GET`, `SLOWLOG LEN`, `CONFIG GET slowlog-log-slower-than`, `CLIENT LIST`, `MEMORY
  STATS` and `MEMORY DOCTOR`.
- **Refuses**: a section that does not exist (below).
- **Settings**: `datardo.mcp.readData` hides none of them; off, `redis_slow_log` writes `?` for every argument of a
  command.
- **Uses**: `mcp.arguments`, `mcp.output-limits`, `mcp.read-data`, `server.show` and `server.slow-log` (the same
  readings).
- **Ported from**: *New in Datardo*.

The tools (all offered with `datardo.mcp.readData` off):

| Tool | Arguments | Returns |
| --- | --- | --- |
| `redis_server_info` | `connection`, `section` (`server`, `clients`, `memory`, `persistence`, `stats`, `replication`, `cpu`, `keyspace`) | without `section` a summary: version, mode, role, uptime, clients, memory against its limit and the eviction policy, operations per second, hits and misses, persistence, replicas, and the keys of each database with how many have an expiry; with `section`, the lines of that section as the server gives them |
| `redis_slow_log` | `connection`, `limit` (1 to 128, default 20) | the slow log, newest first: id, time, duration, the command, the client's address and name; the number of entries the server holds and its threshold |
| `redis_clients` | `connection`, `limit` (1 to 500, default 50) | the clients connected, least idle first: id, address, name, database, age, idle time, flags, last command, user, library, memory |
| `redis_memory` | `connection` | memory used, resident and at its peak, the fragmentation ratio, the limit and the eviction policy, the overhead and the size of the data, the keys counted, and what the server's own diagnosis says |

Acceptance:

- [ ] The promise: these tools send only the commands listed in **Reads**. They never send `SLOWLOG RESET`, `CLIENT
  KILL`, `CONFIG SET`, `CONFIG REWRITE` or `MEMORY PURGE`, and `CONFIG GET` only for the one parameter named, so no
  password of the server's configuration is ever read.
- [ ] `redis_server_info` without `section` starts with `Cache local: Redis 7.2.4, standalone, role master, up 12 d 3
  h.` and lists the keys as `Keys: db0 12,345 (1,200 with an expiry); db1 3.`; a server with no keys, `Keys: none.`
- [ ] `redis_server_info` with `section: "replication"` sends `INFO replication` and returns its lines as `name:
  value`; an unknown section is refused: `section must be one of server, clients, memory, persistence, stats,
  replication, cpu, keyspace.`
- [ ] `redis_slow_log` sends `SLOWLOG GET 20` by default and starts with `Slow log of Cache local: 20 of 57 entries,
  newest first (commands slower than 10 ms are logged).`; each entry is `- #1234 · 2026-11-17T10:20:30Z · 152.4 ms ·
  HGETALL orders:42 · 10.0.0.5:51234 "api"`, the command cut at 300 characters. An empty log: `The slow log of Cache
  local is empty.`
- [ ] A server that refuses `CONFIG GET` (a managed one) still gets its slow log, with `(threshold unknown: the server
  doesn't allow CONFIG GET)`.
- [ ] With `datardo.mcp.readData` off, the entry above reads `HGETALL ?` (`mcp.read-data`).
- [ ] `redis_clients` starts with `Cache local: 12 clients.` (`the 50 least idle of 3,200` when there are more than
  `limit`) and lists each as `- id 77 · 10.0.0.5:51234 · "api" · db0 · age 2 h · idle 3 s · last command get`.
- [ ] `redis_memory` gives `Used: 1.2 GB (peak 1.5 GB), resident 1.4 GB, fragmentation 1.17.` and `Limit: 2.0 GB,
  policy allkeys-lru.` (`Limit: none.` without `maxmemory`), then the diagnosis of `MEMORY DOCTOR` as the server
  writes it. A server without the `MEMORY` commands gets what `INFO memory` tells, and a line that says so.

### `mcp.tab-tools` — Open Datardo's tabs for the user

When the user wants to see, browse or edit the results, the AI opens them in Datardo: for MongoDB a query, an
aggregation, a search, a change stream, the Monitor page or an explain; for Redis the keys of a pattern, one key or
the Server page; and the undo history.

- **Kind**: Read
- **Engine**: Any
- **Function**: `src/features/mcp/tab-tools.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: the tools `open_query`, `open_aggregation`, `open_search`, `open_watch`, `open_monitor`,
  `open_explain`, `open_history`, `redis_open_keys`, `redis_open_key` and `redis_open_server` of the MCP server.
- **Reads**: that the collection exists (`listCollections` with its name); `hello`, for `open_watch` to tell a
  standalone server; `TYPE <key>`, for `redis_open_key` to tell a key that does not exist.
- **After**: the tool sends the intent of `tab.open`: the tab opens in Datardo's window, becomes the active tab, and
  runs what it was given; the AI gets one sentence. A window hidden in the tray stays hidden, and the sentence ends
  with `Datardo's window is hidden in the tray: the user sees the tab when they open it.`
- **Settings**: none: `datardo.mcp.readData` hides none of them.
- **Uses**: `mcp.arguments`, `mcp.refuse-write-stages`, `tab.open`, `query.run`, `aggregate.show`, `explain.show`,
  `search.show`, `watch.show`, `monitor.show`, `undo.show`, `key.show`, `key.scan`, `key.open`, `server.show`,
  `server.slow-log`, `window.tray`.
- **Ported from**: Mongoster's card mcp.tab-tools (`src/mcpTools.ts › mcpTools`, `src/mcp/workspace.ts ›
  workspaceTools`); the three tools for Redis are *New in Datardo*; the pipelines and the `system.*` collections
  refused as in Mongoster 0.9.0.
- **Differs**: (M37) `open_aggregation` and `open_explain` refuse only `$out` and `$merge` at the top of a pipeline,
  and the tools open a `system.*` collection like any other.

The tools (all offered with `datardo.mcp.readData` off):

| Tool | Arguments | Opens, and answers |
| --- | --- | --- |
| `open_query` | `connection`, `database`, `collection`, `filter`, `sort`, `projection` | the collection tab with the query filled in and run; `Opened shop.orders on Local with the filter { a: 1 }, sort { b: -1 }.` |
| `open_aggregation` | `connection`, `database`, `collection`, `pipeline` | the collection tab with the pipeline editor and its stages, run; `Opened shop.orders on Local in Aggregate mode with 2 stages: $match, $group.` |
| `open_search` | `connection`, `database`, `collection`, `text`, `regex`, `matchCase`, `fieldNames`, `views` (all default false), `limit` (0, 1000, 10000 or 100000; default 0, all) | the Search documents page, searching; `Opened the search for "…" in every database on Local. The results appear in Datardo's Search documents page.` |
| `open_watch` | `connection`, `database`, `collection` | the Watch changes page on the scope; `Opened the Watch changes page on shop.orders of Local.` |
| `open_monitor` | `connection`, `section` (`operations`, `slow-queries`, `stats`, `replication`, `sharding`) | the Monitor page on that section; `Opened the Monitor page of Prod on slow-queries.` |
| `open_explain` | `connection`, `database`, `collection`, and either `filter`, `sort`, `projection` or `pipeline` | the collection tab with the query or the stages, on its Explain section; `Opened shop.orders on Local with the filter { a: 1 }, sort { b: -1 } and its explain plan.` |
| `open_history` | none | the Undo history page; `Opened the Undo history page (1 write recorded; the history is off, new writes are not recorded).` |
| `redis_open_keys` | `connection`, `database`, `pattern` (default `*`), `type` | the keys tab of the database with the pattern and the type filter, scanning; `Opened the keys of db0 on Cache local with the pattern orders:* (type hash).` |
| `redis_open_key` | `connection`, `database`, `key` | the key tab of that key; `Opened the key orders:42 of db0 on Cache local.` |
| `redis_open_server` | `connection`, `section` (`overview`, `clients`, `slow-log`, `memory`, `replication`, `configuration`) | the Server page on that section (`server.show`), **Overview** without one the first time, else the section it showed last; `Opened the Server page of Cache local on slow-log.` |

Acceptance:

- [ ] The promise: opening a tab writes nothing. The tabs open with what the user can do there (edit, delete a key,
  kill an operation, undo, change the profiler), but no tool clicks for the user: those stay the user's own actions,
  with their own confirmations.
- [ ] A pipeline with `$out` or `$merge` is refused and no tab opens (`mcp.refuse-write-stages`); a collection that does
  not exist is refused before anything opens.
- [ ] A pipeline refused by `mcp.refuse-write-stages` at any depth (`$currentOp`, a `$merge` inside a `$facet`, a
  `$lookup` of `system.users`), and a `system.*` collection given to `open_query`, `open_aggregation`, `open_search`,
  `open_watch` or `open_explain`, are refused and no tab opens. (differs)
- [ ] `open_explain` with both a pipeline and `filter`, `sort` or `projection` is refused with
  `Give either filter/sort/projection or pipeline, not both.`; with a pipeline it answers `Opened shop.orders on Local
  in Aggregate mode with 2 stages ($match, $group) and its explain plan.`
- [ ] `open_search` refuses `collection` without `database` (`collection needs database.`), an invalid regular
  expression (`Invalid regular expression: …`) and a `limit` not in the list (`limit must be one of 0, 1000, 10000,
  100000.`).
- [ ] `open_watch` on a standalone server still opens the page and adds
  `The server is a standalone: change streams need a replica set or a sharded cluster, so the page shows an error.`
- [ ] `open_monitor` refuses an unknown section: `section must be one of operations, slow-queries, stats, replication,
  sharding.`
- [ ] `redis_open_keys` opens the keys tab and the tab itself scans, as when the user types the pattern (`SCAN 0 MATCH
  orders:* COUNT 500 TYPE hash`); the tool returns no key.
- [ ] `redis_open_key` on a key that does not exist is refused with `The key orders:42 doesn't exist in db0 of Cache
  local: use redis_scan_keys.` and opens nothing; the tab shows the value to the user also with `datardo.mcp.readData`
  off, and the tool returns none of it.
- [ ] `redis_open_server` accepts the six sections of the Server page, in its order, and refuses any other: `section
  must be one of overview, clients, slow-log, memory, replication, configuration.` With `section: "replication"` it
  answers `Opened the Server page of Cache local on replication.`, also when the tab is already open on another
  section.
- [ ] A tab opened by a tool makes its connection the current one, as a tab opened by the user does, and can be closed
  like any other.
- [ ] No tool opens a console tab or a playground tab, and none fills in a command or a script for the user to run.
