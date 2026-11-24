# Glossary

The words of Datardo, as the user reads them and as the code names them. One meaning per word. A word that is not here
means what the documentation of MongoDB or Redis, or a dictionary, says. The cards, the text of the interface and the
code use these words; `catalog.py` reports the words of the **Avoid** column anywhere in the documents.

## The window

| Term | Means | Not to be confused with | Avoid | In code |
| --- | --- | --- | --- | --- |
| island | A rounded panel of the window that floats on its background, apart from the others. | a dialog | — | `Island` |
| top bar | The strip at the top of the window: the app's name, Go to, the MCP state, the window's buttons. It drags the window. | the title bar of the operating system, which Datardo does not have | header bar | `TopBar` |
| rail | The column of icons at the left edge, on the window's background: Home, Explorer, Search, Undo history, Scheduled tasks, Settings. | the explorer | sidebar | `Rail` |
| explorer | The column beside the rail, made of the connection island and the tree island. Shows one connection at a time. | the tree alone | — | `Explorer` |
| connection island | The island of the explorer that shows the current connection and opens the connection switcher. | the connection form | — | `ConnectionIsland` |
| connection switcher | The list of every saved connection by folder, opened from the connection island, to make another one current. | Home | connection picker | `ConnectionSwitcher` |
| current connection | The connection the explorer shows. It is the connection of the active tab. | a connected connection: several can be connected, one is current | active connection | `currentConnectionId` |
| linked connection | The Redis connection that receives a MongoDB connection's writes for redis-oplog, shown under it in the connection island. | the current connection | — | `Connection.publishesTo` |
| tree island | The island of the explorer with Pinned, the engine's tree and the pages of the connection. | the tree | — | `TreeIsland` |
| tree | The nodes of the current connection: databases, collections, views and buckets for MongoDB; databases and namespaces for Redis. | the document shown as a tree in the inspector | — | `Tree`, `TreeNode` |
| pinned | An item of a connection (a collection, a namespace, a key, a page, a saved query) the user keeps at the top of the tree island. | a pinned column | favorite | `Pin` |
| main island | The island with the tab strip, the scope bar, the section bar and the page. | — | — | `MainIsland` |
| tab | An item of the tab strip, belonging to a connection or to the app, showing one page. | a section | — | `Tab` |
| tab strip | The row of tabs of the main island, in groups. | the section bar | — | `TabStrip` |
| group | The tabs of one connection in the tab strip, with its name and color; the first group is the app's. | a folder of connections | — | `TabGroup` |
| page | What a tab shows: the collection tab's content, Monitor, Home, Settings. | a page of results | — | `Page` |
| section | One of the parts of a page that has several, chosen in the section bar: Documents, Schema, Indexes. | a tab | — | `Section` |
| section bar | The row under the scope bar that lists the sections of the active tab. | the tab strip | — | `SectionBar` |
| scope bar | The row under the tab strip: Back, Forward, the path of the active tab, Pin, Open on another connection. | the status line | breadcrumb bar | `ScopeBar` |
| path | In the scope bar, where the active tab is: connection, database, collection; or connection, database, namespace. | the path of a field; a file path | — | `TabPath` |
| inspector island | The island at the right that shows the thing selected in the page (a document, a key, an index, an operation) or, beside a collection's table, its formatting rules (the Formatting view). | a dialog | details pane | `Inspector` |
| status line | The row at the bottom of the window, on its background: connection state, counts, work in progress, Read-only. | the scope bar | status bar | `StatusLine` |
| Go to | The field of the top bar and the list it opens (`Ctrl+K`): finds collections, keys, pages, connections, saved queries and commands. | Search, which looks inside documents | command bar | `Palette` |
| command | Something the user can start from Go to or with a key, named by the identifier of its card. | a Redis command; a MongoDB command | — | `Command` |
| Home | The page Datardo opens on at the first start and when no tab is restored: Jump back in, and every connection as a card. | the connection switcher | start page | `HomePage` |
| dialog | A small island over the window that asks something: a confirmation, a form, a list to pick from. | a notification | popup | `Dialog` |
| confirmation | The dialog shown before a dangerous write, with its plan. | a notification | — | `Confirmation` |
| notification | A message at the bottom right that goes away by itself, with its actions. | a dialog | toast | `Notification` |
| Log | The app's page that lists what Datardo did: every step run, every refusal, the MCP server's calls. | the oplog; the undo history | — | `LogPage`, `LogEntry` |
| theme | The colors of the window: dark, light, or as the system. | a connection's color | skin | `Theme` |
| token | A named color, radius, space or font size of the theme, which every style uses instead of a value. | the access token | — | `tokens.css` |
| editor | Datardo's code input (CodeMirror 6), wherever code is typed. | a tab | — | `CodeEditor` |
| node | One line of the tree that stands for something: a database, a collection, a view, a bucket, a namespace. Lines that only say something (*Loading…*, **Load more**) are not nodes. | a member of a replica set; a server | — | `TreeNode` |
| place | A tab together with the section of it that is shown; what Back and Forward move between. | the place of an entry point (`@toolbar`) | — | `Place` |
| recent places | The places used last, most recent first, kept across starts; shown by Go to with nothing typed and by Jump back in. | recent queries | — | `RecentPlace` |
| Jump back in | The part of Home that lists the first recent places. | — | — | `JumpBackIn` |
| connection card | One saved connection as Home shows it. | a card of the catalog; a stage card | — | `ConnectionCard` |
| Overview | The page tab of a connection that says what it is, how it is reached and what the server holds. | the Overview section of the Server page | — | `OverviewPage` |
| unsaved changes | Text of a document tab or a playground tab that differs from what was last saved. Closing the tab or quitting asks about them. | a draft | — | `hasUnsavedChanges` |
| draft | The unsaved text of a document tab or a playground tab, kept aside so that a crash does not lose it. | a saved query | — | `Draft` |
| prefix (of Go to) | A first character that narrows Go to to one source: `>` commands, `@` connections, `#` collections, `:` keys, `/` pages, `?` saved queries, `=` open tabs. | the prefix of a namespace | — | `SourcePrefix` |
| window's buttons | Minimize, maximize or restore, and close: the system's on Windows and macOS, Datardo's on Linux. | — | — | `WindowButtons` |
| tray | The system's area of icons where Datardo's icon sits while it runs without its window. | — | — | `Tray` |
| paging row | The row under a table with the range shown, the page buttons and the page size. | the status line | — | `PagingRow` |

## Connections

| Term | Means | Not to be confused with | Avoid | In code |
| --- | --- | --- | --- | --- |
| engine | A kind of database Datardo speaks: MongoDB or Redis. | the runner | database type | `Engine`, `EngineId` |
| connection | A saved way to reach a deployment of one engine: a name, its address and options, kept by Datardo. | the open client while it is connected | server profile | `Connection` |
| connection string | The `mongodb://`, `mongodb+srv://`, `redis://` or `rediss://` URI of a connection, with its credentials. Kept in the secret storage. | the connection's name | connection URL | `connectionString` |
| connected | A connection with an open client. | read-only; current | — | `ConnectionState` |
| read-only connection | A connection through which Datardo refuses every write. A safeguard of Datardo, not a permission of the server. | a server user with read roles; a view | readonly | `Connection.readOnly` |
| folder | A group of connections, on Home and in the connection switcher. Removing it keeps its connections. | a folder on disk; a namespace | — | `Connection.folder` |
| color | One of eleven presets, or a custom color, that marks a connection (its island, its group of tabs, its card) or, as its own color, a database or a collection (their icons in the tree and on their tabs). | the syntax colors of the theme | label color | `Color`, `ConnectionColor` |
| preset | One of the eleven named colors, red to gray, drawn with a token of each theme. | a custom color | — | `PresetColor` |
| custom color | A color the user chooses as `#rrggbb` in **Choose a color**, drawn as it is in both themes. Never a color of a formatting rule. | a preset | — | `HexColor` |
| own color | The color a database or a collection has itself, which wins over its database's and its connection's; **None** is an own color too. | the connection's color | — | `ownColor` |
| excluded from searches | A connection, database, collection, view or GridFS bucket the user left out of searches: it stays in the tree, dimmed, and Go to still finds it by its name. | a filter of the tree; a read-only connection | — | `excluded`, `exclusions` |
| SSH tunnel | The SSH server a connection goes through to reach its host. | TLS | SSH proxy | `SshTunnel`, `SshOptions` |
| known host | An SSH server key fingerprint the user has confirmed once. | — | trusted host | `KnownHosts` |
| host key fingerprint | `SHA256:…` of an SSH server's key, shown to be confirmed. | the fingerprint of a document | — | `HostKeyCheck` |
| secret storage | Where Datardo keeps secrets: a file encrypted with a key held by the system's keychain. | the settings file | — | `SecretStorage` |
| connection form | The page where a connection is added or edited: address, authentication, TLS, SSH tunnel, redis-oplog. | the connection switcher | — | `ConnectionForm` |
| passphrase | What encrypts the passwords of an exported connections file, as Compass does. | a password of a connection | — | `connectionsFile` |
| queries folder | A folder on disk a connection is given, where its saved queries *in the folder* are files. | a folder of connections | — | `Connection.queriesFolder` |
| deployment | What a connection reaches: a MongoDB standalone, replica set or sharded cluster, or a Redis server. | a database | — | `Deployment` |
| state (of a connection) | One of *not connected*, *connecting*, *connected*, *reconnecting*, *connection lost*. | read-only; current | — | `ConnectionState` |
| latency | The round trip of the last ping of a connected connection, in milliseconds. | replication lag | — | `latencyMs` |
| secret option | An option of a connection string that holds a secret (`tlsCertificateKeyFilePassword`, `proxyPassword`). Shown empty in the connection form; empty keeps the saved one. | — | — | `SecretOption` |
| ordinary client | The client Datardo uses for the pages of a Redis connection. The console and the Pub/Sub page each open a connection of their own. | a client of the server | — | `RedisClient` |

## MongoDB data

| Term | Means | Not to be confused with | Avoid | In code |
| --- | --- | --- | --- | --- |
| database | A MongoDB database; or one of the numbered databases of a Redis server (`db0`). | the deployment | — | `DatabaseRef` |
| collection | A MongoDB collection, including time series and capped ones. | a view; the table | — | `CollectionRef` |
| view | A read-only MongoDB view defined by a pipeline on a collection. Datardo writes nothing through it. | a page; a read-only connection | virtual collection | `CollectionRef.isView` |
| document | A MongoDB document. | a row of the table | — | `Document` |
| field | A key of a document, possibly nested; or one name of a Redis hash. | a column; a Redis key | — | `FieldPath` |
| field path | A field's dotted name: `address.city`. `items[].sku` is the field of the elements of an array. | the path of the scope bar | — | `FieldPath` |
| bucket | A GridFS pair of collections, `<bucket>.files` and `<bucket>.chunks`. | — | — | `BucketRef` |
| collection tab | The tab of a collection or view: Documents, with the table and the query bar, and the other sections. | the keys tab | — | `CollectionPage` |
| table | The grid of the Documents section: one row per document (or per element of an expanded array), one column per field. Also the grid of a keys tab. | a collection | — | `Table` |
| row | A document as shown in the table; a sub-row is an element of an expanded array. | a document in the database | — | `Row` |
| column | A field as shown in the table, with its layout (hidden, order, width, pinned). | a field | — | `Column`, `ColumnLayout` |
| query bar | The part of a collection tab where the filter, the sort, the projection and the limits are typed and run, with the buttons that act on the query (Explain, Code, Update many…, Delete many…): above the table, or in the query pane. | Go to | — | `QueryBar` |
| query pane | The query bar put at the right of the table, inside the main island, with a splitter to change its width; one place and one width for every collection tab. | the inspector island | side panel | `QueryPane` |
| query | A filter, a sort and a projection, run with `find`. | a pipeline | — | `QueryText`, `ParsedQuery` |
| filter | The condition that chooses documents, in mongosh syntax. | the filter of the tree | where clause | `filter` |
| pipeline | The stages of an aggregation. | a query | — | `PipelineStage[]` |
| stage | One step of a pipeline: `$match`, `$group`. | a step of a plan | — | `PipelineStage` |
| mongosh syntax | How Datardo writes and reads MongoDB values: `ObjectId("…")`, `ISODate("…")`, `/re/i`. | JSON | shell syntax | `src/shared/mongosh` |
| Extended JSON | MongoDB's JSON with types: *canonical* keeps every type, *relaxed* is easier to read. What crosses from the main process to the window is canonical Extended JSON, so that no type is lost on the way. | JSON | — | `src/shared/ejson` |
| saved query | A query or pipeline kept under a name: *for me* in Datardo's data, or *in the folder* as a file of the connection's queries folder. | the recent queries | favorite | `SavedQuery` |
| selection | The rows chosen with Ctrl or Shift and a click, kept by `_id` (or by key name in a keys tab); in the tree, the nodes chosen the same way. | the text selected in an editor | — | `Selection` |
| column action | **Rename field…**, **Remove field…**, **Convert type…** on a column header. | the column's layout | — | `src/features/field` |
| conditional formatting | Coloring the rows and cells of the table by formatting rules: by conditions on their documents, or by the values of a field. | the syntax colors of values; a connection's color | — | `TableFormat` |
| formatting rule | What colors rows or cells of the table: a condition rule or a field rule, optionally named, kept in a formatting scope, in order; the first that gives a color wins. | a filter; validation rules | format rule | `FormatRule` |
| condition rule | A formatting rule with a condition (a filter), a color and what it colors: the row or one field's cell. | a field rule | — | `ConditionRule` |
| field rule | A formatting rule that colors by the values of one field, with no condition: true and false, a scale for numbers and dates, or a color per value. | a condition rule on one field's cell | — | `FieldRule` |
| pinned value | A value of a field rule given a color of its own; no other value of the rule takes it. | a pinned item; a pinned column | — | `FieldRule.pinned` |
| formatting scope | Where a formatting rule applies: this collection, its database, its connection, or everywhere; the nearest is tried first, and a collection can leave any of them out. | the scope of a page (advisor, search) | — | `FormatScope` |
| Formatting view | The view of the inspector island that lists a collection's formatting rules, edits them in place and shows the legends. | the selection; the Columns panel | — | `FormattingView` |
| legend | What a field rule shows for the page: each value with its color and count, or the scale's two ends. | — | — | `Legend` |
| formatting file | A `.datardo-formatting.json` file of formatting rules, one group per scope, with nothing of a connection in it. | a connections file | — | `FormattingFile` |
| system database | `admin`, `local` and `config`, the databases MongoDB keeps for itself; a restore never takes them as a target under the backup's name. | a system collection | — | `systemDatabases` |
| query shape | A query with its literal values replaced by `?`, used to group slow operations. | a query | — | `QueryShape` |
| reference | A field whose values point to documents of another collection, as found by sampling. | a DBRef only | — | `Reference` |
| search index | An Atlas Search or Vector Search index, managed with `createSearchIndex`. | an index | — | `SearchIndex` |
| validation rules | A collection's `validator`, `validationLevel` and `validationAction`. | the schema analysis | — | `ValidationRules` |
| view definition | A view's `viewOn` and `pipeline`. | — | — | `ViewDefinition` |
| playground | A script of mongosh code run against a MongoDB connection, in a playground tab. | the console | script editor | `Playground` |
| oplog | MongoDB's replication log of a replica set, read by the document history and the server monitor. | redis-oplog; the Log | — | `OplogEntry` |
| document history | The writes to one document still in the oplog, and its versions. | the undo history | audit log | `DocumentHistory` |
| version | One state of a document in its document history: *exact* when every field is known, *partial* otherwise. | a release of Datardo | — | `DocumentVersion` |
| time series collection | A collection whose type is `timeseries`; a node kind of its own in the tree. | — | — | `CollectionKind` |
| system collection | A collection whose name starts with `system.`; listed last and dimmed. | — | — | `isSystem` |
| document tab | The tab that shows one document in an editor, saved with `Ctrl+S`. | the inspector island, which shows it without a tab | — | `DocumentTab` |
| insert dialog | The dialog where one or more new documents are typed or pasted in mongosh syntax. | — | — | `InsertDialog` |
| page of results | The documents of a query that the table shows at once; the page size is how many. | a page | — | `ResultPage` |
| sub-row | One line of the table for one element of an expanded array. | a row, which is a whole document | — | `SubRow` |
| expanded column | A column of a sub-document, or of an array of them, shown as a group of child columns. | — | — | `ExpandedColumn` |
| columns' layout | What Datardo remembers of the columns of a collection: hidden, order, pinned, widths. | — | — | `ColumnsLayout` |
| query builder | The rows of field, operator and value under the query bar that write the filter. | the pipeline editor | — | `QueryBuilder` |
| recent query | A query or pipeline Datardo remembered because it ran: the last 50 of each collection. | a saved query; a recent place | — | `RecentQuery` |
| queries list | The list of the saved and recent queries of a collection, opened by **Queries**. | the queries folder | — | `QueriesList` |
| for me, in the folder | The two places of a saved query: Datardo's data folder, or a file of the connection's queries folder. | — | — | `SavedQueryPlace` |
| stage shown | The stage of a pipeline whose output the table shows; the pipeline is run, explained, charted and exported up to it. | — | — | `shownStage` |
| stage card | The box of one stage in the pipeline editor. | a card of the catalog | — | `StageCard` |
| sample | The documents read to learn about a collection without reading all of it: for the Schema section, for autocomplete, for references. | — | — | `Sample` |
| the explain | The output of the server's explain for a query or a pipeline; the verdict is the row of marks that sums it up. | — | — | `Explain`, `Verdict` |
| suggested index | The index keys computed from a filter and a sort: equality fields, then sort, then range. | advice | — | `SuggestedIndex` |
| advice | One suggestion of the Index advisor: an index to create, a redundant one, an unused one, a hidden one. | a suggested index | — | `Advice` |
| redundant index, unused index | An index whose keys are the start of another index that serves the same queries; an index with 0 uses for at least 24 hours. | — | — | `Advice.kind` |
| scope | What a page works on: for the Index advisor a connection, a database or a collection; for a search every database, one database or chosen collections. | the scope bar | — | `Scope` |
| category, series, measure | The three parts of a chart: the field on the axis, the field that splits it, the count or the computed number. | — | — | `ChartOptions` |
| mark | A bar, a point, a slice or a range of a chart, which can be clicked. | a mark of the verdict | — | `ChartMark` |
| statement | A top-level statement of a playground's script, with a **Run** button of its own. | a step | — | `Statement` |
| default database | The database a playground runs on until its script calls `use("…")`. | — | — | `defaultDatabase` |
| change stream | MongoDB's feed of the writes to a collection, a database or the deployment, which the Watch changes page reads. | Pub/Sub | — | `ChangeStream` |
| change event | One event of a change stream: an insert, an update, a replacement, a delete, a drop, a rename. Its type is its `operationType`. | an event of redis-oplog; an operation | — | `ChangeEvent` |
| pre-image | The document before a change, which MongoDB 6.0 and later keep for a collection that asks for it. | a version of the document history | — | `preImage` |
| resume token | The `_id` of a change event; given back to the server, it opens a stream right after that event. | an access token | — | `ResumeToken` |
| oplog entry | One record of the oplog; it can hold several writes. | an entry of a Redis stream | — | `OplogEntry` |
| server operation | An operation in progress on a MongoDB server, as `currentOp` lists it. | an operation of the undo history | — | `ServerOperation` |
| slow query | An operation the profiler or the server's log recorded because it took longer than the threshold. | the slow log of Redis | — | `SlowQuery` |
| profiler | MongoDB's recording of slow operations of one database, in `system.profile`, with a level and a threshold. | the slow log of Redis | — | `ProfilerState` |
| replication lag | How far the last operation a secondary applied is behind the primary's. | latency | — | `lagSeconds` |
| shard, balancer | The parts of a sharded cluster the Sharding section shows. | — | — | `Shard`, `BalancerState` |
| chunk | A range of a sharded collection held by one shard. Also one document of a bucket's chunks collection, holding a piece of a file. | — | — | `Chunk`, `GridFsChunk` |
| files document, revision | The document that describes one GridFS file; one of several files with the same name, of which reading by name gives the newest. | a version | — | `FilesDocument` |
| built-in role, custom role | A role MongoDB provides; a role defined with `createRole`. A privilege is a resource and the actions a role allows on it. | the role of a server in replication | — | `Role`, `Privilege` |
| signed-in user | The user the connection authenticated as, written `app@admin`. | — | — | `SignedInUser` |
| relation | An arrow of the relationship diagram: a reference, a DBRef, or the link from a view to the collection it reads. | a reference, which is one kind of relation | — | `Relation` |
| DBRef | MongoDB's `{ $ref, $id, $db }` value, which names the collection it points to. | a reference found by sampling | — | `DbRef` |
| candidate | A field whose sampled values are looked up to see whether it is a reference. | — | — | `Candidate` |
| match, result | In a search: one place of a document where the text is found; a document with at least one match. | the `$match` stage | — | `Match`, `SearchResult` |

## Redis data

| Term | Means | Not to be confused with | Avoid | In code |
| --- | --- | --- | --- | --- |
| key | A name in a Redis database, with a value of one type and maybe an expiry. | a field of a document; an index key | — | `KeyRef` |
| value | What a key holds: a string, a hash, a list, a set, a sorted set or a stream. | a field's value in a document | — | `RedisValue` |
| type | Of a key: `string`, `hash`, `list`, `set`, `zset`, `stream`, or the name a module gives. | a BSON type | — | `KeyType` |
| namespace | The part of key names before a separator, `:` unless a setting says otherwise. The tree shows namespaces as nodes: `orders:` holds `orders:42`. | a MongoDB namespace (`database.collection`), which Datardo calls by its two names; a folder | key folder | `Namespace` |
| pattern | A glob that chooses keys, as `SCAN … MATCH` reads it: `orders:*`. | a regular expression; a filter | — | `KeyPattern` |
| expiry | When a key is deleted by the server; shown as the time left (TTL) and as a date. A key without one is *persistent*. | retention | — | `Expiry` |
| member | One value of a set or of a sorted set; in a sorted set it has a *score*. | a member of a replica set, which the cards call a replica set member | — | `Member` |
| element | One value of a list, at an index. | a member | — | `ListElement` |
| entry | One record of a stream, with its ID and its fields. | an operation of the undo history; a line of the Log | — | `StreamEntry` |
| keys tab | The tab of a Redis database or namespace: its keys in a table, with the pattern and the type filter. | the key tab | — | `KeysPage` |
| key tab | The tab of one key: its value, with all the room of the main island. | the keys tab | — | `KeyPage` |
| console | The tab where Redis commands are typed one at a time and their replies shown. | a playground; the Log | — | `ConsolePage` |
| Pub/Sub | The page that subscribes to Redis channels and patterns, lists the messages and publishes one. | redis-oplog's publishing | — | `PubSubPage` |
| channel | A Redis Pub/Sub channel. For redis-oplog: the channel an event goes to, the collection's (`<namespace>::<collection>`) or the document's (`<collection>::<id>`). | — | — | `Channel` |
| slow log | The Redis server's list of commands that took longer than its threshold (`SLOWLOG GET`). | slow queries of the MongoDB monitor | — | `SlowLogEntry` |
| item | One field of a hash, element of a list, member of a set or sorted set, or entry of a stream: what a row of a value's table shows. | — | — | `Item` |
| score, rank | The number a member of a sorted set is ordered by; its place in that order, from 0. | — | — | `score`, `rank` |
| separator | The text key names are split at to make namespaces (`datardo.key.separator`, `:` by default). | — | — | `separator` |
| prefix (of a namespace) | The namespace's whole text, ending with the separator (`orders:2024:`); its name is the last part (`2024`). | the prefix of Go to; the channel prefix of redis-oplog | — | `Namespace.prefix` |
| dump | A key's value as `DUMP` returns it: bytes only a server reads, kept by the undo history with the key's expiry and type. | a backup | — | `KeyDump` |
| size (of a key) | The bytes `MEMORY USAGE` answers: an estimate for large values. | the number of items | — | `memoryBytes` |
| encoding | How the server stores a value, as `OBJECT ENCODING` answers. | how bytes are shown (text, JSON, hexadecimal) | — | `encoding` |
| module's type | A type of key that a Redis module defines; listed, its value not shown. | — | — | `KeyType` |
| gone | Said of a key deleted or expired between two reads. | — | — | `gone` |
| compact form, full form | The two forms of a value: in the inspector island, and in the key tab. | — | — | `ValueForm` |
| keys file | The `.redis` file of Redis commands that exporting keys writes and importing keys reads. | a backup | — | `KeysFile` |
| consumer group | A group of consumers of a stream, with its pending entries, as `XINFO` and `XPENDING` report them. | a group of tabs | — | `ConsumerGroup` |
| reply | What the server answers to a command of the console, shown by its type. | a message | — | `Reply` |
| message | What is published to a channel and received by its subscribers. | a notification; an event | — | `PubSubMessage` |
| subscription | A channel or a pattern a Pub/Sub page is subscribed to. An active channel is one with a subscriber right now. | — | — | `Subscription` |
| history of commands | The commands run in the console of a connection, kept between starts. | the undo history; the document history; recent queries | — | `ConsoleHistory` |
| session (of the console) | The database, the open transaction and the watched keys of the console's own connection. | a session of a playground | — | `ConsoleSession` |
| client | One connection to a Redis server, as `CLIENT LIST` lists it. | a saved connection | — | `ServerClient` |
| master, replica | The two roles of a Redis server in replication. | a member of a replica set | — | `ReplicationRole` |
| secret argument | An argument of a Redis command that holds a password, written `***` wherever a command is shown or logged. | a secret option | — | `SecretArgument` |

## Writes and their history

| Term | Means | Not to be confused with | Avoid | In code |
| --- | --- | --- | --- | --- |
| write | Anything Datardo sends that changes a deployment: for MongoDB insert, update, replace, delete and the commands that create, change or drop; for Redis any command that writes. | an export to a file | mutation | — |
| feature | One thing the user can do or see, with one card and one function. | a command, which is one way to start it | — | `src/features` |
| runner | The part of Datardo that takes what a feature returns and carries it out: asks, reads, refuses, confirms, runs the steps, records the undo, logs. | an engine | executor | `Runner` |
| plan | What an operation returns to be run: a title, the steps in order, its danger, how it is undone, what follows. | an explain plan, which the cards call the winning plan or the explain | — | `Plan` |
| step | One thing a plan does, written exactly as the confirmation shows it and the Log records it: a command to an engine, a file written, a change to Datardo's own state. | a stage of a pipeline | — | `Step` |
| refusal | A feature saying it will not run, with a message for the user and a code. | an error of the server | — | `Refusal` |
| code | The stable name of a refusal: `area.action/reason`. | generated code | error id | `RefusalCode` |
| danger | How much a plan can lose: *None*, *Confirm* (a confirmation with one button), *Destructive* (the user types the name of what is lost). | — | — | `Danger` |
| undo history | The operations Datardo recorded with the documents or the keys as they were, so that they can be undone. Kept in files. | the oplog; the document history; the Log | undo log, undo stack | `UndoHistory`, `UndoEntry` |
| operation | One entry of the undo history: one write, with its title, target and what it kept. Also the kind of feature that changes something. | an operation of the server, which the monitor calls a server operation | — | `UndoEntry` |
| undo | Putting the documents or the keys of an operation back as they were. The undo is itself an operation (redo). | Ctrl+Z in an editor | — | `undo.revert` |
| fingerprint | The SHA-1 of a document's BSON bytes, or of a key's dump, kept after a write to tell whether it changed since. | a host key fingerprint | — | `Fingerprint` |
| redis-oplog | The Meteor package `cultofcoders:redis-oplog`, and Datardo's publishing of its writes to Redis for it. | the oplog | redis oplog | `OplogSink` |
| publish | Sending the events of a write to Redis for redis-oplog; or sending one message in the Pub/Sub page. | release a version | — | `oplog.publish` |
| event | One message published for redis-oplog about one document: `{ e, d: { _id }, f }`. | a change stream event | — | `OplogEvent` |
| Meteor id | An `_id` a Meteor app can have: a string, an `ObjectId` or a number. Others are not published. | — | — | `MeteorId` |
| backup | A copy of databases or collections in mongodump's formats: an archive (`.agz`) or a folder. | an export; a copy of a collection | — | `Backup` |
| archive | mongodump's single-file format: `.agz` (gzipped) or `.archive`. | a backup folder | — | `Archive` |
| checksum | The CRC-64 of a collection's data in an archive, checked on restore. | the fingerprint of a document | — | `Crc64` |
| restore | Writing a backup back into a deployment. | undo | — | `Restore` |
| export | Writing documents to a JSON, JSON Lines or CSV file, or keys to a file. | a backup | — | `Export` |
| scheduled task | A backup or export that runs by itself at set times. A *run* is one execution of it. | a step; work in progress | cron job | `ScheduledTask`, `TaskRun` |
| output | The file or folder one run of a scheduled task wrote. Also, in a console tab, the list of the commands run and their replies. | the Log | — | `TaskRun.output` |
| retention | Deleting a task's older outputs beyond **Keep the last N**. | the limits of the undo history; expiry | — | `Retention` |
| missed run | A run due while Datardo was closed or the computer asleep. | a failed run | — | `MissedRun` |
| file name pattern | The name of what a run writes, with placeholders such as `{name}` and `{date}`. | a pattern of keys | — | `FileNamePattern` |
| run | One execution: of a scheduled task (by its schedule or by **Run now**), or of a playground's script. Also one series of `SCAN` calls, up to **Scan more**. The run log is the list of a task's last 20 runs. | a step | — | `TaskRun`, `PlaygroundRun`, `ScanRun` |
| target (of an operation) | What an operation of the undo history is on: a collection of a MongoDB connection, or a database of a Redis connection. | the target of a tab | — | `OperationTarget` |
| changed since | Said of a document or a key that is no longer as the operation left it; undoing overwrites that change. | — | — | `changedSince` |
| redis-oplog namespace | A name put before the collection in a channel (`tenant1::orders`). | a namespace of keys | — | `oplogNamespaces` |
| seed | The text that makes generated test documents the same again. | — | — | `seed` |

## Comparing

| Term | Means | Not to be confused with | Avoid | In code |
| --- | --- | --- | --- | --- |
| comparison | A page that compares two collections (**Compare with…**) or two database structures (**Compare structure with…**), and what it found. | Open on another connection, which compares nothing | — | `Comparison` |
| side | Left or right in a comparison; in a structure comparison the left side is the model, the right side is changed. | — | — | `Side` |
| difference | One row of a comparison. | — | — | `Difference` |
| structure | A database's collections, views, options, indexes, search indexes and shard keys. | the schema of documents | — | `Structure` |
| script | The mongosh script of a structure comparison that makes the right side like the left. | a playground | — | `StructureScript` |
| kind (of a difference) | *identical*, *different*, *only left*, *only right*. | the kind of a feature | — | `DifferenceKind` |
| chip | A count above a comparison's list that, pressed, keeps only the rows of its kind. | a badge of an index | — | `Chip` |
| note | A sentence of a structure comparison on what was not compared, or on what no command can do. | the note on undo of a confirmation | — | `StructureNote` |
| badge | A short word on a row for one of its properties (`unique`, `hidden`). | a chip | — | `Badge` |

## Elsewhere

| Term | Means | Not to be confused with | Avoid | In code |
| --- | --- | --- | --- | --- |
| MCP server | Datardo's Model Context Protocol server on `127.0.0.1`, for AI assistants. Never writes. | a database server | AI server | `McpServer` |
| tool | A function the MCP server offers to an AI assistant (`find_documents`). | a command | — | `McpTool` |
| access token | The bearer token an AI assistant sends to the MCP server. Kept in the secret storage. | a password; a token of the theme | API key | `accessToken` |
| main process | The part of Datardo that runs in Node: the runner, the engines, the files, the MCP server. | a server | — | `src/main` |
| window process | The part of Datardo that draws the window, in a browser sandbox with no access to Node or the disk. | the main process | — | `src/ui` |
| data folder | The folder of the user's profile where Datardo keeps its settings, connections, undo history and tasks. | the queries folder | — | `dataFolder` |
| work in progress | Something long that is running: a query, an export, a backup, a plan. Shown on the status line, with **Cancel**. | a scheduled task | — | `Work` |
