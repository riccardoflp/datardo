# Tree

The tree island of the explorer: what the current connection holds. Its three parts (**Pinned**, the engine's tree
and **Pages of** the connection), the nodes of each engine with what a click does, the counts beside them, how a
node loads and fails, refresh, the filter, the keyboard, several nodes selected, the colors of databases and
collections, what is excluded from searches, and the context menu of each kind of node. The features the
menus start belong to their own areas, which list this menu as `@tree-menu`; pinning is `nav.pin`; the connection
island above the tree, and the connections themselves, are the [connection](connection.md) area's.

## The island

### `tree.show` — The tree island

Shows what the current connection holds, in three parts, and follows the active tab.

- **Kind**: View
- **Engine**: Any
- **Function**: `src/features/tree/show.ts › view(state)`
- **Entry points**: the tree island is part of the explorer, which **Explorer** in the rail shows and hides
  (`nav.rail`). It always shows the current connection (`nav.switch-connection`).
- **Reads**: for MongoDB `tree.list-databases`, then `tree.list-collections` and `tree.count` for each database that
  is expanded; for Redis `tree.redis-databases`, then `tree.scan-namespaces` for each database that is expanded. The
  pins of the connection.
- **After**: the buttons of the island's header: **Filter** (`tree.filter`), **Refresh** (`tree.refresh`) and
  **Collapse all**, which collapses every node of the engine's tree.
- **Uses**: `tree.pinned`, `tree.mongodb`, `tree.redis`, `tree.pages`, `tree.filter`, `tree.refresh`,
  `tree.node-states`, `tree.keyboard`, `tree.select`, `tree.color-of`, `tree.excluded`, `tree.menu-mongodb`,
  `tree.menu-redis`, `connection.connect`, `connection.add`, `nav.switch-connection`, `nav.rail`.
- **Ported from**: the connections view of Mongoster, below a connection (`src/tree.ts › MongoTreeProvider`,
  `src/extension.ts`). One connection at a time, **Pinned** and **Pages of** are new in Datardo. The colors of
  databases and collections and several nodes selected: Mongoster 0.9.0 and 0.10.0 (tree.set-collection-color,
  tree.set-database-color, tree.exclude; `src/tree.ts`, `src/standalone/shell/tree.ts`).

What it shows, in this order:

1. The header: the buttons **Filter**, **Refresh** and **Collapse all**, and the filter field while it is open.
2. **Pinned** (`tree.pinned`), only while the connection has pinned items.
3. **Databases**: the engine's tree. For MongoDB, databases, then collections, views and GridFS buckets
   (`tree.mongodb`); for Redis, databases, then namespaces of keys (`tree.redis`).
4. **Pages of <name>** (`tree.pages`).

Acceptance:

- [ ] Making a tab of another connection active shows that connection's tree, with the nodes it had expanded, its
      selection, its scroll position and its filter as they were left; these are kept until Datardo quits.
- [ ] When a tab becomes active, the node of what it shows (its collection, view, bucket, Redis database or
      namespace) is selected and scrolled into view, expanding its database when the database is already loaded; a
      tab of the app selects nothing.
- [ ] Each of the three parts collapses and expands with a click on its heading; the state is kept per connection.
- [ ] With no saved connection, the island shows **No connections yet** and **Add connection**
      (`connection.add`).
- [ ] While the current connection is not connected, **Pinned** and **Pages of** are shown, and **Databases** shows
      **<name> is not connected** with **Connect** (`connection.connect`); nothing connects by itself because the
      island is shown.
- [ ] While it connects, **Databases** shows **Connecting…**; when it cannot, the reason and **Retry**.
- [ ] While the connection is reconnecting, the nodes already loaded stay, dimmed, and nothing is read.
- [ ] The nodes do not take the connection's color: the color is on the connection island. A node's icon takes a
      color only when its database, collection, view or bucket has one of its own (`tree.color-of`).
- [ ] The island has the role `tree`; each node says its name, its kind, its count when it has one and whether it is
      expanded.
- [ ] When a tab becomes active, its node is selected alone: nodes selected together before are not any more
      (`tree.select`).

### `tree.pinned` — Pinned items

The items of the connection the user pinned, at the top of the tree island.

- **Kind**: View
- **Engine**: Any
- **Function**: `src/features/tree/pinned.ts › view(state)`
- **Entry points**: the part **Pinned** of the tree island (`@tree`); the context menu of a pinned item
  (`@tree-menu`).
- **Reads**: the pins of the current connection, which `nav.pin` keeps.
- **After**: a click on a collection or a view opens its collection tab (`table.show`); on a namespace, its keys tab
  (`key.show`); on a key, its key tab (`key.open`); on a page, that page; on a saved query, the collection tab with
  that query, as the saved queries' own area says. The context menu has **Open** and **Unpin** (`nav.pin`).
- **Uses**: `nav.pin`, `table.show`, `key.show`, `key.open`, `tab.open`, `tree.color-of`.
- **Ported from**: *New in Datardo*.

Acceptance:

- [ ] The items are listed in the order `nav.pin` keeps them, each with the icon of its kind, its name and, after
      it, where it is: `orders` with `shop`; `orders:` with `db0`; `orders:42` with `db0`; a saved query with its
      collection; a page with nothing.
- [ ] The icon of a pinned collection, view, namespace or key takes the color its node in **Databases** takes (that
      of its collection, or of its database), and a saved query that of its collection (`tree.color-of`); a page
      takes none.
- [ ] With no pinned item the part is not shown, heading included.
- [ ] Pins belong to one connection: another connection's tree shows its own.
- [ ] The filter of the tree does not hide pinned items.
- [ ] An item whose collection or key no longer exists stays listed; opening it shows what its page says about a
      thing that is missing, and **Unpin** removes it.
- [ ] A click on an item whose tab is open makes that tab active instead of opening another.

### `tree.pages` — Pages of the connection

The pages of the current connection, at the bottom of the tree island.

- **Kind**: View
- **Engine**: Any
- **Function**: `src/features/tree/pages.ts › view(state)`
- **Entry points**: the part **Pages of <name>** of the tree island (`@tree`); the context menu of a page
  (`@tree-menu`).
- **After**: a click opens the page in a page tab, or makes its tab active. The context menu has **Open** and
  **Pin** or **Unpin** (`nav.pin`).
- **Uses**: `connection.overview`, `monitor.show`, `user.show`, `advisor.show`, `search.show`, `watch.show`,
  `playground.open`, `task.show`, `server.show`, `console.show`, `pubsub.show`, `nav.pin`, `tab.open`.
- **Ported from**: the entries of a connection's context menu in Mongoster that open something (`package.json`,
  `view/item/context` with `viewItem =~ /^connection/`: **Open Server Monitor**, **Manage Users and Roles**,
  **Index Advisor**, **Search Documents…**, **Watch Changes**, **New Playground**) and **Show Scheduled Tasks** of
  the view's title. The pages of Redis are new in Datardo.

What it shows, in this order:

- MongoDB: **Overview** (`connection.overview`), **Monitor** (`monitor.show`), **Users and roles** (`user.show`),
  **Index advisor** (`advisor.show`), **Search documents** (`search.show`), **Watch changes** (`watch.show`),
  **Playground** (`playground.open`), **Scheduled tasks** (`task.show`).
- Redis: **Overview** (`connection.overview`), **Server** (`server.show`), **Console** (`console.show`), **Pub/Sub**
  (`pubsub.show`).

Acceptance:

- [ ] The heading reads **Pages of Local** for the connection Local, and follows a rename at once.
- [ ] A MongoDB connection lists the eight pages above in that order; a Redis connection the four.
- [ ] **Monitor** clicked while its tab is open makes that tab active; **Playground** opens a new playground tab on
      the connection each time.
- [ ] A page opened from here is opened on the whole connection; the same page for one database or one collection
      is opened from that node's context menu.
- [ ] Opening a page of a connection that is not connected connects it (`connection.connect`).
- [ ] The filter of the tree does not hide the pages.

## MongoDB

### `tree.mongodb` — The MongoDB nodes

The databases of a MongoDB connection and, under each, its GridFS buckets, collections, views and time series
collections.

- **Kind**: View
- **Engine**: MongoDB
- **Function**: `src/features/tree/mongodb.ts › view(state)`
- **Entry points**: the part **Databases** of the tree island (`@tree`); a node's context menu (`@tree-menu`,
  `tree.menu-mongodb`).
- **Reads**: `tree.list-databases`; `tree.list-collections` and `tree.count` when a database is expanded.
- **After**: a click on a database selects it and expands or collapses it; a double click does that once, not
  twice. A click on a collection, a view or a time series collection opens its collection tab, or makes it active
  (`table.show`); a double click does the same and moves the focus into the page. A click on a bucket opens its
  GridFS page (`gridfs.show`). On hover or focus a database shows the buttons **Create collection…** and
  **Refresh**, a collection **Insert document**, a bucket **Upload files to GridFS…**; the heading **Databases**
  shows **Create database…**.
- **Uses**: `tree.list-databases`, `tree.list-collections`, `tree.count`, `tree.menu-mongodb`, `tree.node-states`,
  `tree.color-of`, `tree.excluded`, `tree.select`, `table.show`, `gridfs.show`, `manage.create-collection`,
  `document.insert`, `tree.refresh`, `tab.open`.
- **Ported from**: `src/tree.ts` (`DatabaseNode`, `CollectionNode`, `BucketNode`, `MongoTreeProvider.databases`,
  `collections`), `src/shared/gridfs.ts › bucketNames`. The time series node and the document counts are new in
  Datardo. The colored icons and the excluded nodes: Mongoster 0.9.0 and 0.10.0 (`src/tree.ts › connectionIcon`,
  `markExcluded`).

What each node shows:

| Node | Icon | After the name | Hover text |
| --- | --- | --- | --- |
| Database | database | its size on disk (`1.5 MB`), nothing when it is 0 | the name |
| Collection | table | its estimated number of documents (`1,204`) | `shop.orders` |
| View | eye | nothing | `shop.active_orders (view)` |
| Time series collection | clock | nothing | `shop.weather (time series)` |
| GridFS bucket | files | **GridFS** | **GridFS bucket shop.fs (fs.files and fs.chunks)** |

A node whose database, collection, view or bucket has a color of its own has its icon in that color
(`tree.color-of`); its name keeps the usual color. A node excluded from searches (`tree.excluded`) has its icon and
its name dimmed, whatever its color; after its name, before what the table says, **excluded** when it has an entry of
its own, or **excluded with its database** under an excluded database, joined by ` · ` (`excluded · 1,204`); and its
hover text has a last line *Excluded from searches*, or *Excluded from searches with the database archive*.

Acceptance:

- [ ] Databases are sorted by name; `admin`, `config` and `local` are listed like the others.
- [ ] Under a database come first its buckets, sorted by name; then its collections, views and time series
      collections together, sorted by name; then the collections whose name starts with `system.`, sorted by name
      and dimmed.
- [ ] A bucket is listed for every pair `<bucket>.files` and `<bucket>.chunks`; the two collections stay listed
      too.
- [ ] A time series collection `weather` is one node with its own icon; its `system.buckets.weather` is listed with
      the system collections.
- [ ] A system collection opens like any other collection.
- [ ] A view and a time series collection show no count; a collection shows none until it is counted, and none
      when counting fails.
- [ ] Clicking `orders` while its collection tab is open makes that tab active and opens no second tab.
- [ ] On a read-only connection the buttons **Create database…**, **Create collection…**, **Insert document** and
      **Upload files to GridFS…** are not shown.
- [ ] A database that was dropped outside Datardo disappears at the next refresh; an open tab of one of its
      collections stays, and says what its page says.
- [ ] With `databaseColors: { shop: "teal" }` and `collectionColors: { "shop.orders": "#1e90ff", "shop.logs": "none"
      }` on a red connection, the icon of `shop` is teal, of `orders` `#1e90ff`, of `users` teal, of `logs` plain, and
      every node of `crm` plain; no name changes color.
- [ ] With `exclusions: ["archive", "shop.logs"]`, `archive` shows `excluded · 3.2 MB` after its name, its
      collections **excluded with its database**, `logs` `excluded · 120`, and all of them are dimmed; `shop` and
      its other collections are not.
- [ ] A screen reader says **excluded** with the name of an excluded node.

### `tree.list-databases` — List the databases

Reads the databases of a MongoDB connection with their sizes.

- **Kind**: Read
- **Engine**: MongoDB
- **Function**: `src/features/tree/list-databases.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: none of its own: `tree.show`, `tree.refresh`, `tree.filter` and `connection.overview` use it.
- **Reads**: `db.adminCommand({ listDatabases: 1, authorizedDatabases: true })`.
- **Ported from**: `src/tree.ts › MongoTreeProvider.databases`.

Acceptance:

- [ ] Each database comes with its `name` and its `sizeOnDisk`; they are sorted by name.
- [ ] A user who may not list the databases gets one database, the one named in the connection string, or `test`
      when it names none, with no size; no error is shown.
- [ ] A user with roles on some databases only gets those databases.
- [ ] A deployment with no database gives an empty list, which the tree shows as **No databases**.
- [ ] On a sharded cluster the sizes are the totals `listDatabases` gives, not those of one shard.

### `tree.list-collections` — List the collections of a database

Reads the collections, views and time series collections of one database, and finds its GridFS buckets.

- **Kind**: Read
- **Engine**: MongoDB
- **Function**: `src/features/tree/list-collections.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: none of its own: expanding a database in the tree, `tree.refresh`, `tree.filter` and
  `connection.overview` use it.
- **Reads**: `db.getSiblingDB("<database>").getCollectionInfos({}, { nameOnly: true, authorizedCollections: true })`.
- **Ported from**: `src/tree.ts › MongoTreeProvider.collectionInfos`, `collections`; `src/shared/gridfs.ts ›
  bucketNames`.

Acceptance:

- [ ] Each entry comes with its `name` and its kind, from `type`: `collection`, `view` or `timeseries`.
- [ ] The buckets are the names `X` for which both `X.files` and `X.chunks` are listed, sorted by name:
      `fs.files`, `fs.chunks` and `img.files` give the bucket `fs` only.
- [ ] The order is that of `tree.mongodb`: names starting with `system.` last, the others by name.
- [ ] A user who may read some collections only gets those.
- [ ] A database with no collection gives an empty list, which the tree shows as **No collections**.
- [ ] No option, index or count is read here: `nameOnly` keeps the command from locking the collections.

### `tree.count` — Counts and sizes beside the nodes

Reads the number of documents of the collections of an expanded database, and writes counts and sizes in short.

- **Kind**: Read
- **Engine**: MongoDB
- **Function**: `src/features/tree/count.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: none of its own: expanding a database in the tree and `tree.refresh` use it.
- **Reads**: `db.getSiblingDB("<database>").<collection>.estimatedDocumentCount()` for each collection of the
  database that is not a view, a time series collection or a system collection, for the first 500 *(Datardo's
  choice)* in the order of the tree.
- **Ported from**: `src/tree.ts › formatBytes` for the sizes. The document counts are new in Datardo.

Acceptance:

- [ ] The count is the estimate the server keeps, not a count of a query: it is read without scanning the
      collection.
- [ ] A number under 10,000 is written with thousands separators: `0`, `980`, `1,204`. From 10,000 it is written in
      thousands, millions or billions, with one decimal while the figure is under 100 and no `.0`: `12.3K`, `120K`,
      `1.3M` for 1,260,000, `2B` for 2,000,000,000 *(Datardo's choice)*.
- [ ] A size is written in `B`, `KB`, `MB`, `GB` or `TB`, by 1,024, with one decimal except for `B`: `512 B`, `1.5
      KB` for 1,536, `1.0 GB` for 1,073,741,824; a size of 0 is not written.
- [ ] The collections are listed at once; each count appears when it arrives, and the tree does not wait for
      them.
- [ ] A count that fails (no permission, a timeout) leaves that collection without a count and shows no error.
- [ ] The collections beyond the first 500 of a database show no count.
- [ ] The key counts of Redis are written by the same rule for numbers (`tree.redis`).

## Redis

### `tree.redis` — The Redis nodes

The databases of a Redis connection and, under each, the namespaces of its keys.

- **Kind**: View
- **Engine**: Redis
- **Function**: `src/features/tree/redis.ts › view(state)`
- **Entry points**: the part **Databases** of the tree island (`@tree`); a node's context menu (`@tree-menu`,
  `tree.menu-redis`).
- **Reads**: `tree.redis-databases`; `tree.scan-namespaces` when a database is expanded, turned into nodes by
  `tree.namespaces`.
- **After**: a click on the name of a database opens the keys tab of that database, and on the name of a namespace
  the keys tab of that namespace, or makes it active (`key.show`); a click on the arrow before the name, or a double
  click, expands or collapses the node without opening anything. **Load more** scans further
  (`tree.scan-namespaces`). **<n> more namespaces** opens the keys tab of the parent.
- **Uses**: `tree.redis-databases`, `tree.scan-namespaces`, `tree.namespaces`, `tree.count`, `tree.menu-redis`,
  `tree.node-states`, `tree.color-of`, `key.show`, `tab.open`.
- **Settings**: `datardo.key.separator`, the text key names are split at, `:` by default.
- **Ported from**: *New in Datardo*. The color of a database: Mongoster 0.10.0, for its MongoDB
  databases (tree.set-database-color).

What each node shows:

| Node | Name | After the name | Hover text |
| --- | --- | --- | --- |
| Database | `db0`, `db1`, … | its number of keys (`1,204`), from `INFO keyspace` | **db0: 1,204 keys, 310 with an expiry** |
| Namespace | its last part (`2024` for `orders:2024:`) | the keys seen under it (`312`, or `312+`) | its pattern (`orders:2024:*`) |

A database with a color of its own has its icon, and the icons of its namespaces, in that color (`tree.color-of`);
the names keep the usual color. Nothing of Redis is excluded from searches but the whole connection
(`tree.excluded`), which leaves the tree as it is.

Acceptance:

- [ ] The databases listed are those that hold keys, `db0`, and the database the connection opens first, in the
      order of their numbers; the others are under a last node **<n> empty databases**, collapsed.
- [ ] Opening the tree, or clicking a database's name, scans nothing: only expanding a database starts a scan.
- [ ] Expanding `db0` shows its namespaces sorted by name, ignoring case, each with its own namespaces under it.
- [ ] A key with no separator in its name, and a key that is alone under its prefix, is not a node: it is found in
      the keys tab of its database.
- [ ] When the scan stopped before the end, the last line under the database reads **Scanned 10,000 of 1,204,000
      keys** with **Load more**, and every count of a namespace ends with `+`.
- [ ] Clicking the name `orders` under `db0` opens the keys tab of the pattern `orders:*` in database 0; clicking
      it again makes that tab active.
- [ ] A node with more than 200 *(Datardo's choice)* namespaces under it shows the first 200 and a last line **<n>
      more namespaces**.
- [ ] With `datardo.key.separator` set to `/`, the keys `img/1` and `img/2` give the namespace `img`, and `a:b` is
      under none; changing the setting rebuilds the nodes from the keys already scanned, without scanning again.
- [ ] A database with no key shows **No keys** when expanded; one whose keys form no namespace shows **No
      namespaces**.
- [ ] With `databaseColors: { "3": "green" }` on a red connection, the icon of `db3` and of every namespace under it
      is green, and `db0` and its namespaces are plain.

### `tree.redis-databases` — List the Redis databases

Reads how many databases a Redis server has and how many keys each holds.

- **Kind**: Read
- **Engine**: Redis
- **Function**: `src/features/tree/redis-databases.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: none of its own: `tree.show`, `tree.refresh` and `connection.overview` use it.
- **Reads**: `INFO keyspace` and `CONFIG GET databases`.
- **Ported from**: *New in Datardo*.

Acceptance:

- [ ] A line `db0:keys=1204,expires=310,avg_ttl=86400000` of `INFO keyspace` gives database 0 with 1,204 keys, 310
      of them with an expiry and an average TTL of 86,400,000 milliseconds; parts the line also has
      (`subexpiry=0`) are ignored.
- [ ] A database with no key has no line, and is given with 0 keys.
- [ ] The number of databases is the answer to `CONFIG GET databases` (16 unless the server says otherwise).
- [ ] When `CONFIG` is refused (an ACL, a hosted service), the number of databases is the highest number in `INFO
      keyspace` plus one, and at least 16; no error is shown.
- [ ] A server with no key at all gives `db0` to `db15`, each with 0 keys.
- [ ] The counts are those the server keeps: no key is scanned to count.

### `tree.scan-namespaces` — Scan the keys of a database for its namespaces

Reads a bounded number of key names of one database, from which the tree makes its namespaces.

- **Kind**: Read
- **Engine**: Redis
- **Function**: `src/features/tree/scan-namespaces.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: expanding a database in the tree (`@tree`); **Load more** under it (`@tree`); `tree.refresh`.
- **Reads**: in the database of the node (`SELECT <n>` on a client of its own), `SCAN <cursor> COUNT 1000`
  *(Datardo's choice)*, from the cursor `0` or from where the last scan stopped, again and again until the server
  returns the cursor `0` or 10,000 *(Datardo's choice)* more keys have been returned.
- **After**: the key names go to `tree.namespaces`; the tree shows **Load more** while the cursor is not `0`.
- **Uses**: `tree.namespaces`, `runner.progress`, `runner.cancel`.
- **Ported from**: *New in Datardo*.

Acceptance:

- [ ] Expanding `db1` sends `SELECT 1`, then `SCAN 0 COUNT 1000`, then `SCAN <cursor> COUNT 1000` with each cursor
      the server returned. `KEYS` is never sent, and neither `MATCH` nor `TYPE` is used here.
- [ ] The scan stops after the call that brings the keys returned to 10,000 or more, or when the cursor is `0`; a
      database of 3,500 keys is scanned to the end, and shows no **Load more**.
- [ ] **Load more** continues from the cursor kept, for 10,000 more keys, and adds them to those already seen; a
      key returned twice is counted once.
- [ ] Key names are kept as bytes: a name that is not valid UTF-8 is scanned and counted like any other.
- [ ] While it scans, the database shows **Loading…** and the status line the work in progress, with **Cancel**;
      cancelled, the keys seen so far are kept and **Load more** is offered.
- [ ] The scan does not change the database other tabs of the connection are using.
- [ ] The key names seen are kept in memory for the tree only, until the database is refreshed, the connection is
      disconnected or Datardo quits; they are never written to disk.

### `tree.namespaces` — Namespaces from key names

Turns the key names seen in a database into the namespaces the tree shows, with their counts and their patterns.

- **Kind**: Derivation
- **Engine**: Redis
- **Function**: `src/features/tree/namespaces.ts › namespacesOf(keyNames, separator, complete)`
- **Uses**: `value.format`, for a part of a name that is not text.
- **Settings**: `datardo.key.separator`.
- **Ported from**: *New in Datardo*.

Rules:

- Inputs: the key names seen, as bytes, each once; the separator, a text of one character or more (`:` by default);
  whether the scan reached the end. Output: the namespaces as a tree, each with its prefix, its name, its count, its
  pattern and its own namespaces; and the number of keys seen.
- A key name is cut at every place the separator occurs. Each cut gives a prefix, which ends with the separator:
  `orders:2024:42` has the prefixes `orders:` and `orders:2024:`. A name without the separator has none.
- A prefix is a namespace when at least 2 *(Datardo's choice)* of the keys seen start with it. Its count is the
  number of keys seen that start with it, those of its own namespaces included.
- A namespace is under the longest shorter prefix that is a namespace too, or under the database.
- The name of a namespace is the part between the last two separators of its prefix: `2024` for `orders:2024:`. An
  empty part is named **(empty)**. A part that is not valid UTF-8 is written as `value.format` writes such bytes.
- Namespaces under the same node are sorted by name ignoring case, and by their bytes when the names are equal.
- A count is followed by `+` when the scan did not reach the end.
- The pattern of a namespace is its prefix, with `\` before each `*`, `?`, `[`, `]` and `\` in it, followed by `*`.
- The separator is compared as bytes of its UTF-8 text; an empty separator gives no namespace.
- The same key names give the same tree, in whatever order they were seen.

Examples (separator `:` and a scan that reached the end, unless said):

- `orders:1`, `orders:2`, `users:1`, `counter` → one namespace, `orders:` named `orders`, count 2, pattern
  `orders:*`; `users:` has one key and is not a namespace; 4 keys seen.
- `app:cache:a`, `app:cache:b`, `app:session:x` → `app:` (count 3), with under it `app:cache:` named `cache` (count
  2, pattern `app:cache:*`); `app:session:` is not a namespace.
- `a::b`, `a::c` → `a:` (count 2), with under it `a::` named **(empty)** (count 2).
- `:x`, `:y` → the namespace `:` named **(empty)** (count 2).
- `orders:` and `orders:1` → `orders:` (count 2): the key named `orders:` starts with the prefix.
- `Orders:1`, `Orders:2`, `orders:1`, `orders:2` → two namespaces, `Orders:` and `orders:`, in the order of their
  bytes.
- `a[1]:x`, `a[1]:y` → `a[1]:` named `a[1]`, pattern `a\[1\]:*`.
- Separator `/`: `img/1`, `img/2`, `a:b` → `img/` named `img` (count 2); `a:b` has no prefix.
- Separator `::`: `a::b::1`, `a::b::2`, `a:c` → `a::` (count 2), with under it `a::b::` (count 2).
- The scan stopped early with `orders:1`, `orders:2` seen → `orders:` with the count `2+`.
- No key → no namespace, 0 keys seen.

## Refresh, filter and keyboard

### `tree.refresh` — Refresh the tree

Reads again what the tree shows, for the whole connection or for one database.

- **Kind**: Read
- **Engine**: Any
- **Function**: `src/features/tree/refresh.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: **Refresh** in the header of the tree island, and the button **Refresh** of a database
  (`@tree`); **Refresh** in the context menu of the heading **Databases**, of a database and of a namespace
  (`@tree-menu`); `F5` while the tree island has the focus; Go to (**Refresh the tree**). The features of other
  areas that create, rename or drop something ask for it in their **After**.
- **Reads**: for the whole connection, the databases (`tree.list-databases` or `tree.redis-databases`) and, for each
  database that is expanded, what is under it (`tree.list-collections` and `tree.count`, or `tree.scan-namespaces`
  from the cursor `0`). For one database, that database only.
- **After**: the references Datardo found between collections are forgotten for what was refreshed, so that they are
  found again when next needed (`relation.detect`).
- **Commands**: `tree.refresh`.
- **Uses**: `tree.list-databases`, `tree.list-collections`, `tree.count`, `tree.redis-databases`,
  `tree.scan-namespaces`, `relation.detect`, `connection.connect`.
- **Ported from**: the command **Refresh** of Mongoster (`src/extension.ts`, `mongoster.refresh`; `src/tree.ts ›
  MongoTreeProvider.refresh`; `package.json`, the view's title and the nodes of a connection and of a database).

Acceptance:

- [ ] After a refresh the nodes that were expanded are expanded, the selection and the scroll position are kept,
      and the filter still applies.
- [ ] A collection created outside Datardo appears under its expanded database after **Refresh**; one that was
      dropped disappears, and so does a database that no longer exists.
- [ ] Refreshing one database reads nothing about the others.
- [ ] Redis: refreshing a database forgets the keys seen and scans its first 10,000 again from the cursor `0`;
      what **Load more** had added is gone.
- [ ] A database that is collapsed is not read: its collections or namespaces are read when it is next expanded.
- [ ] `F5` refreshes the whole connection when the focus is on a heading, and the database of the node otherwise.
- [ ] Refreshing a connection that is not connected connects it first (`connection.connect`).
- [ ] The open tabs are not read again by a refresh of the tree.

### `tree.filter` — Filter the tree

Shows only the databases and the collections, or the namespaces, whose name contains what is typed.

- **Kind**: View
- **Engine**: Any
- **Function**: `src/features/tree/filter.ts › view(state)`
- **Entry points**: **Filter** in the header of the tree island (`@tree`); `Ctrl+F` while the tree island has the
  focus; Go to (**Filter the tree**).
- **Reads**: MongoDB: the collections of every database that is not excluded from searches
  (`tree.list-collections`), to tell which databases hold a match. Redis: nothing more than the tree has already
  read.
- **After**: the field opens under the header, with the placeholder **e.g. orders, shop, shop.ord** for MongoDB and
  **e.g. orders, db1, orders:2024** for Redis, and the hint **Part of a database or collection name, or
  database.collection; empty shows everything** for MongoDB, **Part of a database or namespace name; empty shows
  everything** for Redis. **Clear filter**, at the end of the field, empties it.
- **Commands**: `tree.filter`.
- **Uses**: `tree.match`, `tree.excluded`, `tree.list-collections`, `tree.node-states`.
- **Ported from**: the README's **Filtering the tree**; `src/extension.ts › filterTree`, `setTreeFilter`;
  `src/tree.ts › MongoTreeProvider.setFilter`, `matches`, `databases`, `collections`; `package.json` (**Filter
  Databases and Collections…**, **Clear Filter**). The filter of Redis is new in Datardo. Skipping what is excluded:
  Mongoster 0.9.0 (tree.excluded; `src/tree.ts › MongoTreeProvider.matches`, `databases`, `collections`).

Acceptance:

- [ ] The tree follows the text 300 milliseconds after the last key typed, not at each key.
- [ ] MongoDB: a database is shown when its name matches or when one of its collections or buckets matches
      (`tree.match`); it is shown expanded, with only the collections and buckets that match. Typing `ord` shows
      `shop` with `orders` and `orders_archive`; typing `shop` shows `shop` with all its collections.
- [ ] Redis: a database is shown when its name matches or when one of its namespaces matches; a namespace when its
      prefix matches or one under it does. Only databases already expanded are looked into: the filter scans
      nothing.
- [ ] Nothing matching reads **Nothing matches "<text>"** under **Databases**; a database shown for its name whose
      collections do not match reads **No collections match "<text>"** under it.
- [ ] An empty field shows everything; the databases the filter expanded stay expanded.
- [ ] `Escape` in the field empties it, closes it and gives the focus back to the tree; `Down` moves from the field
      to the first node shown.
- [ ] While a filter applies, the button **Filter** is shown as on, and the field stays open with its text.
- [ ] The filter is kept for each connection until Datardo quits, and is not saved.
- [ ] **Pinned** and **Pages of** are not filtered.
- [ ] A database whose collections cannot be listed is shown only when its own name matches; no error is shown for
      it.
- [ ] MongoDB, with `exclusions: ["archive", "shop.logs"]`: typing `o` shows `shop` with `orders` and not `logs`, and
      no `archive` nor anything of it; typing `archive` shows **Nothing matches "archive"**; no `listCollections` is
      sent for `archive`.
- [ ] With the field empty, the excluded nodes are shown again, dimmed (`tree.mongodb`).

### `tree.match` — Whether a node matches the filter

The rule that decides which names the filter keeps.

- **Kind**: Derivation
- **Engine**: Any
- **Function**: `src/features/tree/match.ts › matches(filter, node)`
- **Uses**: `tree.excluded`.
- **Ported from**: `src/tree.ts › MongoTreeProvider.matches`; what is excluded never matches since Mongoster 0.9.0
  (`src/shared/exclusions.ts › isExcluded`).

Rules:

- The filter is trimmed. An empty filter matches every node, excluded nodes too.
- A node excluded from searches, by an entry of its own or through its database (`tree.excluded`), matches no filter
  that is not empty, whatever its text. A connection excluded as a whole changes nothing here: its tree is the one
  being filtered.
- A node matches when its text contains the filter, both in lower case.
- The text of a MongoDB database is its name; of a collection, a view, a time series collection or a bucket,
  `<database>.<name>`.
- The text of a Redis database is `db<n>`; of a namespace, its prefix (`orders:2024:`).
- Nothing in the filter is a wildcard: `*`, `?` and `.` are looked for as they are.

Examples:

- `ord` and the collection `orders` of `shop` (`shop.orders`) → matches.
- `shop.ord` and `shop.orders` → matches; `orders.shop` and `shop.orders` → does not.
- `SHOP` and the database `shop` → matches; ` Shop ` → matches, trimmed.
- `shop` and `shop.users` → matches: the database's name is part of the text.
- `fs` and the bucket `fs` of `media` (`media.fs`) → matches.
- `2024` and the namespace `orders:2024:` → matches; `orders:*` and `orders:2024:` → does not.
- `db1` and the databases `db1`, `db10`, `db15` → all match; `db0` → does not.

Examples with what is excluded:

- `ord` and `shop.orders`, with `exclusions: ["shop.orders"]` → does not; with `exclusions: ["shop"]` → does not
  either; with `exclusions: ["shop"]` and an empty filter → matches.
- `arch` and the database `archive`, with `exclusions: ["archive"]` → does not.
- `fs` and the bucket `fs` of `media`, with `exclusions: ["media.fs.files"]` → does not.

Acceptance:

- [ ] The examples give the results shown.
- [ ] The examples with what is excluded give the results shown.

### `tree.keyboard` — Moving in the tree with the keyboard

Everything the tree island does with the mouse, done with keys.

- **Kind**: View
- **Engine**: Any
- **Function**: `src/features/tree/keyboard.ts › view(state)`
- **Entry points**: keys, while the tree island has the focus. How the focus moves between the islands is the
  navigation area's.
- **Uses**: `tree.refresh`, `tree.filter`, `tree.select`, `tree.menu-mongodb`, `tree.menu-redis`, `tree.pinned`,
  `tree.pages`.
- **Ported from**: *New in Datardo*; the keys are those of the tree pattern of the WAI-ARIA Authoring Practices.
  `Shift+Up` and `Shift+Down`: Mongoster 0.9.0's desktop app (`src/standalone/shell/tree.ts`).

What each key does:

| Key | Does |
| --- | --- |
| `Down`, `Up` | Moves to the next or the previous node shown, through the three parts and their headings. |
| `Shift+Down`, `Shift+Up` | Moves to the next or the previous node of **Databases** of a MongoDB connection, and selects every node from the anchor to it (`tree.select`). |
| `Escape` | With several nodes selected, leaves only the node with the focus selected. |
| `Right` | Expands a collapsed node; on an expanded one, moves to the first node under it; nothing on a node with nothing under it. |
| `Left` | Collapses an expanded node; otherwise moves to the node it is under. |
| `Home`, `End` | Moves to the first or the last node shown. |
| `Enter` | Does what a click on the name does: opens the tab of a collection, a view, a bucket, a Redis database, a namespace, a page or a pinned item; expands or collapses a MongoDB database or a heading. |
| `Space` | Expands or collapses the node, and opens nothing. |
| A letter or a digit | Moves to the next node shown whose name starts with what was typed in the last second *(Datardo's choice)*. |
| `Shift+F10`, the menu key | Opens the context menu of the node. |
| `F5` | Refreshes (`tree.refresh`). |
| `Ctrl+F` | Opens the filter (`tree.filter`). |

Acceptance:

- [ ] The tree is one stop of `Tab`: `Tab` enters it on the node that had the focus last, or on the selected node,
      and `Tab` again leaves it.
- [ ] The node with the focus is always scrolled into view and has a visible outline.
- [ ] `Enter` on **Load more** scans further; on **Retry**, reads again; on **Connect**, connects.
- [ ] `Right` on a collapsed Redis database expands it and starts its scan; `Enter` on it opens its keys tab and
      scans nothing.
- [ ] Typing `or` quickly moves to `orders`; typing `o`, waiting two seconds and typing `r` moves to the next node
      that starts with `r`.
- [ ] The buttons a node shows on hover are reached through its context menu, where each has an entry.
- [ ] No key of the tree writes to a deployment: `Delete` does nothing.
- [ ] After a click on `orders`, with `shop` expanded, `Shift+Down` twice selects `orders` and the two collections
      after it; `Escape` then leaves the last one selected alone.

### `tree.select` — Several nodes selected

Selects several databases, collections, views and GridFS buckets of a MongoDB connection, to exclude them from
searches, or include them again, together.

- **Kind**: View
- **Engine**: MongoDB
- **Function**: `src/features/tree/select.ts › view(state)`
- **Entry points**: `Ctrl+click` and `Shift+click` on a node of **Databases** (`@tree`); `Shift+Down` and `Shift+Up`
  while the tree island has the focus (`tree.keyboard`).
- **Offered when**: the connection is a MongoDB connection. A Redis connection has no entry that acts on several
  nodes: there `Ctrl+click` and `Shift+click` do what a click does *(Datardo's choice)*.
- **After**: the context menu opened on one of the selected nodes acts on all of them (`tree.menu-mongodb`).
- **Uses**: `tree.exclude-from-searches`, `tree.menu-mongodb`, `tree.keyboard`, `tree.mongodb`.
- **Ported from**: tree.exclude of Mongoster 0.9.0, its desktop app (`src/standalone/shell/tree.ts › select`,
  `selectedWith`; `src/standalone/vscode/tree.ts › nodeArguments`).

What can be selected together: the databases, collections, views, time series collections and GridFS buckets of
**Databases**, in any mix. The headings, the lines that are not nodes (**Loading…**, **Load more**, **Retry**, the
messages), the pinned items and the pages are selected one at a time: `Ctrl+click` and `Shift+click` on them do what
a click does.

How the selection changes:

| Done | Selection | Opens |
| --- | --- | --- |
| A click | that node alone, which becomes the anchor | what a click opens (`tree.mongodb`) |
| `Enter` | the node with the focus alone, which becomes the anchor | what `Enter` opens (`tree.keyboard`) |
| A key that moves the focus without `Shift` (`Down`, `Up`, `Home`, `End`, letters typed) | unchanged | nothing |
| `Ctrl+click` | that node added, or removed when it was selected; it becomes the anchor | nothing |
| `Shift+click` | every node shown from the anchor to that node, in the order of the tree | nothing |
| `Shift+Down`, `Shift+Up` | the focus moves one node, and the selection is every node from the anchor to it; they stop at the first and the last node of **Databases** | nothing |
| `Escape` | the node with the focus alone | nothing |
| A tab becomes active | the node of what it shows alone (`tree.show`) | — |

- With no anchor in **Databases**, `Shift+click` selects that node alone and makes it the anchor; `Shift+Down` and
  `Shift+Up` take the node they start from as the anchor.
- A node that stops being shown (its database collapsed, the filter, a refresh where it is gone) leaves the
  selection.
- On macOS `Cmd+click` takes the place of `Ctrl+click`.

The context menu:

- Opened on one of several selected nodes (a right click, `Shift+F10`, the menu key or its `…` button), it offers
  only the entries that act on all of them *(Datardo's choice)*: **Exclude from searches**, when at least one of
  them is not excluded by an entry of its own, and **Include in searches**, when at least one is; each acts on the
  selected nodes it changes (`tree.exclude-from-searches`). The other entries act on one node: to use them, click
  the node alone.
- Opened on a node that is not selected, it is that node's menu, and the selection does not change
  (`tree.menu-mongodb`).

Acceptance:

- [ ] `Ctrl+click` on `orders` with `users` selected selects both and opens no tab; `Ctrl+click` on `users` again
      leaves `orders` alone selected.
- [ ] With `archive` selected, `Shift+click` on `orders` under `shop` selects `archive`, `crm` and its collections
      shown, `shop` and the collections shown above `orders`, and `orders`.
- [ ] A click on `orders` with several nodes selected selects `orders` alone and opens its tab.
- [ ] A right click on one of 3 selected nodes, none of them excluded, opens a menu with **Exclude from searches**
      alone; choosing it excludes the three.
- [ ] A right click on a node outside the selection opens that node's whole menu and keeps the selection.
- [ ] `Ctrl+click` on a pinned item, on a page or on a node of a Redis connection does what a click does.
- [ ] The tree says it can have several nodes selected (`aria-multiselectable`), and each selected node says it is
      selected.

### `tree.node-states` — Loading, empty and failed nodes

What a node shows under it while it loads, when it holds nothing, and when reading it fails.

- **Kind**: View
- **Engine**: Any
- **Function**: `src/features/tree/node-states.ts › view(state)`
- **Entry points**: the lines under a node of the tree island; **Retry** (`@tree`).
- **After**: **Retry** reads that node again (`tree.refresh`).
- **Uses**: `tree.refresh`, `tree.filter`, `tree.scan-namespaces`.
- **Ported from**: `src/tree.ts › MessageNode` and the messages of `MongoTreeProvider` (**No databases**, **No
  collections**, **Nothing matches "…"**, **No collections match "…"**, the error of a node). **Loading…**,
  **Retry** and the lines of Redis are new in Datardo.

Acceptance:

- [ ] A node that is being read shows **Loading…** under it once 200 milliseconds *(Datardo's choice)* have passed;
      a read that is faster shows nothing in between.
- [ ] A read that fails shows the error of the server under the node, in the color of errors, with **Retry**; the
      other nodes are not touched, and the node can be collapsed.
- [ ] MongoDB: **No databases** under **Databases**; **No collections** under a database with none.
- [ ] Redis: **No keys** under a database with none; **No namespaces** under one whose keys form none; **Scanned <n>
      of <total> keys** with **Load more** while the scan has not reached the end.
- [ ] With a filter: **Nothing matches "<text>"** and **No collections match "<text>"** (`tree.filter`).
- [ ] These lines are not nodes of a deployment: they have no context menu, and `Enter` on one does only what its
      button does.
- [ ] A user who may not list the collections of `shop` sees the server's message under `shop`, for example **not
      authorized on shop to execute command { listCollections: 1, … }**, and the other databases as usual.
- [ ] An error never shows a connection string or a password (`connection.secrets`).

## Colors and searches

The colors of single databases and collections, and what is excluded from searches, are kept on their connection, in
its entry of the saved connections ([data](../data.md)), beside its own color: removing the connection removes them,
and its export in Datardo's format carries them. The connection's own color and the presets are the
[connection](connection.md) area's (`connection.set-color`, `connection.color-presets`).

### `tree.set-collection-color` — Set the color of a collection, a view or a bucket

Gives one collection its own color, which takes the place of its database's on its icon in the tree and on the icons
of its tabs, to tell some collections apart inside one connection: those not to touch by hand, those being migrated.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/tree/set-collection-color.ts › plan(context, answers)`
- **Entry points**: **Set color…** in the context menu of a collection, a view, a time series collection or a GridFS
  bucket (`@tree-menu`); Go to (**Set collection color…**), for the collection, view or bucket of the active tab.
- **Offered when**: a collection, a view, a time series collection, a system collection or a bucket, read-only
  connections included; one node, not several selected (`tree.select`).
- **Asks**: a list to pick from (`runner.ask`) titled **Color of orders** (**Color of fs** for a bucket), with the
  placeholder **Shown on its icon in the tree and on its tabs**, or **Shown on its icon in the tree and on its tabs,
  instead of the color of the database shop** when the database has a color of its own, and the items:
  1. the eleven presets of `connection.color-presets`, **Red** to **Gray**, each after a circle of its color;
  2. **None**, *Plain, even in a colored database*;
  3. **Connection's color**, described with the connection's color (**red**, a custom `#rrggbb`, or **none**); in
     its place **Database's color**, described with the database's color (or **none**), when the database has a
     color of its own (`tree.set-database-color`), **None** included;
  4. **Custom color…**, described with the collection's custom color when it has one, which opens the dialog
     **Choose a color** (`connection.custom-color`) with that color, or the color the collection shows now.

  The current choice is described **current**: **Connection's color** or **Database's color** when the collection
  has no color of its own.
- **Plan**: one app step: `set the color of shop.orders on Local to teal` (`to #1e90ff`, `to none`), or `remove the
  color of shop.orders on Local` for **Connection's color** and **Database's color**; for a bucket, `the GridFS
  bucket shop.fs` in place of `shop.orders`. It writes the entry of the collection in `collectionColors` on the
  connection, under `shop.orders`, or under `shop.fs.files` for the bucket `fs` (`tree.color-of`).
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone from the undo history; choose the previous color again.
- **After**: the tree island and the open tabs of the connection take the color at once (`tree.color-of`); nothing
  is reopened.
- **Commands**: `tree.set-collection-color`.
- **Uses**: `tree.color-of`, `connection.color-presets`, `connection.custom-color`, `runner.ask`.
- **Ported from**: tree.set-collection-color of Mongoster 0.9.0, and **Database's color** from its changes after it
  (its proposal 0001; `src/extension.ts › askColor`, `changeCollectionColors`; `src/shared/collectionColors.ts ›
  ownColorOf`, `setCollectionColor`; `src/shared/colors.ts › colorChoices`).

Acceptance:

- [ ] **Teal** on `shop.orders` of Local writes `collectionColors: { "shop.orders": "teal" }` on Local; the icon of
      `orders` in the tree and the icons of its open collection tab and document tabs turn teal without reopening
      anything; the names keep their color.
- [ ] Dismissing the list, or **Cancel** in **Choose a color**, changes nothing.
- [ ] On the bucket `fs` of `media` the entry is `media.fs.files`: the bucket and its collection `fs.files` show the
      same color, and setting either sets both.
- [ ] **None** on `shop.orders` in the teal database `shop` writes `"none"`, and its icon is plain.
- [ ] With `databaseColors: { shop: "teal" }` the list has **Database's color** described **teal**, and no
      **Connection's color**; choosing it removes the entry, and the last entry removes `collectionColors`.
- [ ] **Custom color…** then **Apply** with `#1E90FF` writes `"#1e90ff"`, and **Custom color…** is then described
      `#1e90ff` and **current**.
- [ ] On a read-only connection the entry is offered and the color is set; nothing is sent to the server.
- [ ] **Set collection color…** from Go to, with the collection tab of `shop.orders` active, asks the color of
      `orders`; with no such tab it is not listed.

### `tree.set-database-color` — Set the color of a database

Gives one database its own color, shown on its icon and on those of its collections, views, buckets or namespaces
without a color of their own, and on their tabs.

- **Kind**: Operation
- **Engine**: Any
- **Function**: `src/features/tree/set-database-color.ts › plan(context, answers)`
- **Entry points**: **Set color…** in the context menu of a MongoDB database or of a Redis database, `db0` to `db15`
  or as many as the server has (`@tree-menu`); Go to (**Set database color…**), for the database of the active tab
  (a collection tab, a GridFS page, a keys tab or a key tab, and the pages opened on one database).
- **Offered when**: a database of a connection of either engine, read-only connections included; one node, not
  several selected (`tree.select`).
- **Asks**: a list to pick from (`runner.ask`) titled **Color of shop** (**Color of db3** for Redis), with the
  placeholder **Shown on its icon in the tree, and on its collections without a color of their own and their tabs**
  (Redis: **Shown on its icon in the tree, and on its namespaces and its tabs**), and the items: the eleven presets,
  **None** (*No color of its own*) and **Custom color…**; the current choice is described **current**, **None** when
  the database has no color of its own. Mongoster offers **None** and **Connection's color** apart; in Datardo the
  connection's color never reaches an icon (`tree.color-of`), so the two would look the same, and **None** is the
  only one *(Datardo's choice)*.
- **Plan**: one app step: `set the color of the database shop on Local to teal` (`to #1e90ff`), or
  `remove the color of the database shop on Local`; for Redis `db3` in place of `the database shop`. It writes the
  entry of the database in `databaseColors` on the connection: under `shop`, or under `3` for `db3`
  (`tree.color-of`).
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone from the undo history; choose the previous color again.
- **After**: the tree island and the open tabs of the connection take the color at once (`tree.color-of`).
- **Commands**: `tree.set-database-color`.
- **Uses**: `tree.color-of`, `tree.set-collection-color`, `connection.color-presets`, `connection.custom-color`,
  `runner.ask`.
- **Ported from**: tree.set-database-color of Mongoster 0.10.0 (`src/extension.ts`, the
  `mongoster.setDatabaseColor` handler, `askColor`; `src/shared/collectionColors.ts`). For a Redis database, *new in
  Datardo*.

Acceptance:

- [ ] **Teal** on `shop` of Local writes `databaseColors: { shop: "teal" }`; the icons of `shop` and of its
      collections, views and buckets without a color of their own turn teal, and so do the icons of their open tabs;
      `orders`, which is `#1e90ff`, keeps it.
- [ ] **Green** on `db3` of Cache local writes `databaseColors: { "3": "green" }`; the icons of `db3`, of its
      namespaces, of its keys tab and of its key tabs turn green.
- [ ] **None** removes the entry, and the last entry removes `databaseColors`; an entry `"none"` read from a file of
      Mongoster is kept, shows as no color, and **None** is described **current**.
- [ ] Dismissing the list changes nothing.
- [ ] With **None** on `shop`, **Set color…** on `orders` offers **Database's color** described **none**.
- [ ] On a read-only connection the entry is offered and the color is set; nothing is sent to the server.

### `tree.color-of` — Which color something of a database or a collection takes

The rule every surface of a database or a collection follows: the collection's own color, otherwise its database's
own, otherwise its connection's; an own **None** is no color. The same module keeps the maps of colors in step when
one is set, and when Datardo renames or drops what they name.

- **Kind**: Derivation
- **Engine**: Any
- **Function**: `src/features/tree/color-of.ts › colorOf(connection, target)`
- **Uses**: `connection.color-presets`, `tab.groups`.
- **Ported from**: tree.color-of-collection and tree.collection-color-follows of Mongoster 0.9.0 and 0.10.0
  (`src/shared/collectionColors.ts › colorOf`, `scopeColor`, `ownColorOf`, `setCollectionColor`,
  `renameCollectionColor`, `dropCollectionColors`, `readCollectionColors`, `readDatabaseColors`). The color of a Redis
  database is *new in Datardo*.

What is kept, on the connection's entry of the saved connections (absent when empty):

- `databaseColors`: an object from a database to its color. A MongoDB database by its name (`shop`); a Redis
  database by its number written in decimal (`"3"`).
- `collectionColors`: an object from a collection to its color, MongoDB only, keyed by `<database>.<collection>`
  (`shop.orders`, `media.fs.files`): a database's name has no `.`, so the first one separates the two. A GridFS
  bucket has no key of its own: it is its `.files` collection's.
- A color is a preset's name (`red`, `orange`, `yellow`, `green`, `blue`, `purple`, `pink`, `teal`, `indigo`,
  `brown`, `gray`), a custom color `#rrggbb` in lower case (`connection.color-presets`), or `none`. Reading the file
  keeps only the entries with a valid key and color, and leaves the others out.

Rules of `colorOf`:

- Input: the connection (its `color`, `databaseColors`, `collectionColors`), and a target: a database, or a
  collection, view or bucket of a database. Output: no color, or a color with where it comes from: the collection,
  the database or the connection.
- The collection's entry wins: a color gives that color, `none` gives no color, whatever the database and the
  connection have. Without one, the database's entry decides in the same way. Without either, the connection's color
  applies, or none.
- For a database, only its own entry and the connection's color count. A namespace or a key of Redis is its
  database's. A bucket looks up `<bucket>.files`.
- An icon (below) takes the color only when it comes from the collection or the database: the connection's color
  alone leaves the tree and the icons of the tabs as they are, since the connection island, the group of tabs and
  the connection's card already show it (`connection.set-color`). A preset is drawn with the theme's token of its
  name, so it reads in the dark and the light theme; a custom color is drawn exactly. A color is never the only sign
  of anything: the name is always beside it.

Where it applies:

- the tree island: the icon of a database's node and of each node under it, collections, views, time series and
  system collections, buckets and Redis namespaces (`tree.mongodb`, `tree.redis`), and of their pinned items
  (`tree.pinned`); a node excluded from searches is dimmed instead (`tree.excluded`);
- the icon, in the tab strip, of the tabs opened on one collection, view or bucket (its collection tab, its GridFS
  page, its document tabs, a document history, Watch changes and Index advisor on it, a comparison of two
  collections), and of those opened on one database (Watch changes, Index advisor, the Relationship diagram, a
  structure comparison, a Redis keys tab or key tab): the color of what they were opened on. A comparison takes the
  color both sides share, or the only one there is, or none. `tab.groups` says it tab by tab.
- Not: the tabs of the whole connection (Overview, Monitor, Users and roles, Search documents, whose scope changes
  in the page, Watch changes and Index advisor on the deployment, Playground, Console, Server, Pub/Sub), and the
  dot and line of the group of tabs, which stay the connection's.

The changes of the maps, each returning the map unchanged when there is nothing to change and nothing when it is
left empty:

- `withColor(colors, key, color)`: the entry set to the color, or removed when the color is to follow what is above.
- `renamedColors(colors, database, from, to)`: the entry of `database.from` moved to `database.to`.
- `droppedColors(connection, dropped)`, `dropped` a collection or view, a bucket or a database: without the entry of
  the dropped collection or view; of a dropped bucket, the entries of its `.files` and `.chunks` collections; of a
  dropped database, its entry in `databaseColors` and every entry of `collectionColors` that starts with
  `database.`.
- They are used by `manage.rename-collection`, `manage.drop-collection`, `manage.drop-database` and
  `gridfs.drop-bucket`, after the server's step succeeded. A collection renamed or dropped elsewhere (mongosh, a
  restore that drops, a copy that replaces) keeps its entry, which applies again to a collection of the same name;
  removing the connection removes all its entries.

Worked examples, on Local, `red`, with `databaseColors: { shop: "teal", archive: "none" }` and `collectionColors: {
"shop.orders": "#1e90ff", "shop.logs": "none", "media.fs.files": "pink" }`:

| Target | Color | From | Its icon |
| --- | --- | --- | --- |
| `shop.orders` | `#1e90ff` | the collection | `#1e90ff` |
| `shop.users` | teal | the database | teal |
| `shop.logs` | none | the collection | plain |
| the database `shop` | teal | the database | teal |
| `crm.users` | red | the connection | plain |
| the database `crm` | red | the connection | plain |
| `archive.old` | none | the database | plain |
| the bucket `fs` of `media` | pink | the collection `fs.files` | pink |
| `media.fs.chunks` | red | the connection | plain |

- `renamedColors` of the map above, `shop`, `orders` → `orders_2024`: `"shop.orders_2024": "#1e90ff"`, and no
  `shop.orders`; `users` → `clients`: the map unchanged.
- `droppedColors` for the bucket `fs` of `media`: no `media.fs.files`; for the database `shop`: no `shop` in
  `databaseColors`, and no `shop.orders` nor `shop.logs`; then for `archive`: `databaseColors` left empty, so absent.
- On Cache local with `databaseColors: { "3": "green" }`: `db3`, its namespace `orders:` and its key `orders:42` →
  green, from the database; `db0` → the connection's.

Acceptance:

- [ ] The worked examples give the results shown.
- [ ] An open tab takes a new color of its collection or database at once, and loses it when **Connection's color**
      is chosen.
- [ ] A Watch changes tab of `shop.orders` takes `#1e90ff`, one of `shop` teal, one of the whole connection none.
- [ ] Reading `databaseColors: { "a.b": "red", shop: "lime" }` and `collectionColors: { "orders": "red",
      "shop.orders": "#ABC" }` keeps `"shop.orders": "#aabbcc"` alone.

### `tree.exclude-from-searches` — Exclude from searches, or include again

Leaves a database, a collection, a view or a GridFS bucket, or a whole connection, out of searches, for what the
user does not use or does not want searched; or puts it back. The node stays in the tree, dimmed.

- **Kind**: Operation
- **Engine**: Any
- **Function**: `src/features/tree/exclude-from-searches.ts › plan(context, answers)`
- **Entry points**: **Exclude from searches** or **Include in searches** in the context menu of a MongoDB database,
  collection, view, time series collection or GridFS bucket (`@tree-menu`), on that node, or on the selected nodes
  when the menu was opened on one of several selected (`tree.select`); in the menu of a connection of either engine
  (`connection.menu`: `@connection-island`, `@connection-switcher`, `@home`), on the whole connection; Go to
  (**Exclude from searches**, **Include in searches**), for the collection, view or bucket of the active tab.
- **Offered when**: **Exclude from searches** on a node that is not excluded by an entry of its own, a collection of
  an excluded database included; **Include in searches** on a node that is. On a connection, **Exclude from
  searches** when it is not excluded, **Include in searches** when it is. Read-only connections included. Not on a
  Redis database or namespace, the headings, the pinned items or the pages.
- **Plan**: one app step, which writes the connection's entry of the saved connections (`tree.excluded`):
  - `exclude from searches on Local: the database archive, the collection shop.logs, the GridFS bucket media.fs`,
    which adds `archive`, `shop.logs` and `media.fs.files` to `exclusions`;
  - `include in searches on Local: the collection shop.logs`, which removes its key; the last key removes
    `exclusions`;
  - `exclude the connection Local from searches`, which writes `excluded: true`; `include the connection Local in
    searches`, which removes it.

  A view or a time series collection is named `the view` or `the collection`, as its node. With several selected
  nodes, only those the entry changes are in the step.
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone from the undo history; **Include in searches** puts it back.
- **After**: the nodes are dimmed and marked, or plain again, at once (`tree.mongodb`); the filter of the tree
  follows (`tree.filter`); an open Search documents page leaves them out from its next search, and a search that
  runs goes on with what it planned (`search.collections`). An excluded connection is marked where the connection
  area shows it (`connection.menu`), and its tree does not change.
- **Commands**: `tree.exclude-from-searches`, titled **Exclude from searches** or **Include in searches** as it
  applies to the active tab.
- **Uses**: `tree.excluded`, `tree.select`, `tree.menu-mongodb`, `connection.menu`.
- **Ported from**: tree.exclude of Mongoster 0.9.0 (`src/extension.ts › setExcluded`; `src/shared/exclusions.ts ›
  exclusionKey`, `bucketExclusionKey`, `setExclusions`; `src/tree.ts › markExcluded`, `ConnectionNode`). The menu of
  a connection in Datardo is not in the tree, which shows one connection.

Acceptance:

- [ ] **Exclude from searches** on `shop.logs` writes `exclusions: ["shop.logs"]` on Local; `logs` is dimmed, shows
      **excluded** after its name, and its menu offers **Include in searches** and no **Exclude from searches**.
- [ ] With `shop.logs` and `archive` selected, **Exclude from searches** writes `exclusions: ["archive",
      "shop.logs"]`, in one step.
- [ ] The collections of `archive` show **excluded with its database** and offer **Exclude from searches**; excluding
      `archive.old` then adds `archive.old`, and including `archive` leaves `archive.old` excluded.
- [ ] **Exclude from searches** on the bucket `fs` of `media` writes `media.fs.files`; the collection `fs.files` is
      then excluded too.
- [ ] With `archive` excluded and `crm` not, both selected, the menu has **Exclude from searches**, which writes
      `crm` alone, and **Include in searches**, which removes `archive` alone.
- [ ] **Include in searches** on the last excluded node removes `exclusions` from the connection's entry.
- [ ] **Exclude from searches** in the menu of the connection Cache local writes `excluded: true` on it; its tree
      shows nothing dimmed.
- [ ] A Redis database and a namespace have neither entry.
- [ ] On a read-only connection the entries are offered and work; nothing is sent to the server.

### `tree.excluded` — What searches leave out

Whether a node is excluded from searches, by an entry of its own or through its database, and what each search does
with it: what is excluded is left out, unless it is what was asked for by name.

- **Kind**: Derivation
- **Engine**: Any
- **Function**: `src/features/tree/excluded.ts › exclusionOf(connection, target)`
- **Uses**: `tree.color-of` (the key of a collection and of a bucket).
- **Ported from**: tree.excluded and tree.exclusion-follows of Mongoster 0.9.0 (`src/shared/exclusions.ts ›
  isExcluded`, `ownExclusion`, `leaveOutExcluded`, `setExclusions`, `renameExclusion`, `dropExclusions`,
  `readExclusions`).

What is kept, on the connection's entry of the saved connections (absent when empty or false):

- `excluded`: `true` when the whole connection is excluded, of either engine.
- `exclusions`: a list of keys, MongoDB only: a database by its name (`archive`), a collection, a view or a time
  series collection by `<database>.<collection>` (`shop.logs`), a GridFS bucket by its `.files` collection
  (`media.fs.files`), as `collectionColors` keys them (`tree.color-of`). The list is sorted by the code units of its
  keys *(Datardo's choice)*, without repeats. Reading the file keeps only strings that are a database's name or
  `<database>.<collection>`.

Rules of `exclusionOf`:

- Input: the connection (`excluded`, `exclusions`) and a target: the connection, a database, or a collection, view
  or bucket of a database. Output: *own* (it has an entry of its own), *with its database* (a collection, view or
  bucket of a database that has one), or *not excluded*.
- A connection is *own* when `excluded` is `true`. That says nothing of what is in it: its databases and collections
  are excluded only by their own entries *(as Mongoster)*.
- **Include in searches** is offered on *own* only; *with its database* offers **Exclude from searches**
  (`tree.exclude-from-searches`).

What each place does with it:

- The tree shows everything, dimmed when *own* or *with its database* (`tree.mongodb`); its filter never matches
  those (`tree.match`) and does not read the collections of an excluded database (`tree.filter`).
- Search documents, over every database, leaves out the databases with an entry, and in the others the collections
  with an entry of their own; over one database, its collections with an entry of their own, even when the database
  itself is excluded; ticked collections are read whatever their entries. It says how many it left out
  (`search.collections`).
- The MCP server's lists of connections, databases and collections leave out what has an entry of its own, as the
  MCP area says; a tool given a name answers for it.
- Not left out: Go to, which finds an excluded connection, database or collection by its name
  (`palette.find-collections`); opening it; a search started on it; backups, exports, scheduled tasks, Watch
  changes, the Index advisor, the Relationship diagram, comparisons and the Monitor.

The changes of the list, each returning the list unchanged when there is nothing to change and nothing when it is
left empty: `withExclusions(list, keys, excluded)` adds or removes keys; `renamedExclusions(list, database, from,
to)` moves the key of a renamed collection; `droppedExclusions(list, dropped)`, `dropped` a collection or view, a
bucket or a database as for `droppedColors` (`tree.color-of`), removes the key of a dropped collection or view, the
keys of a dropped bucket's `.files` and `.chunks` collections, or a dropped database's key and every key that starts
with `database.`. They are used, after the server's step succeeded, by
`manage.rename-collection`, `manage.drop-collection`, `manage.drop-database` and `gridfs.drop-bucket`; a rename or a
drop done elsewhere keeps the key, which applies again to a collection of the same name.

Worked examples, with `excluded: true` and `exclusions: ["archive", "media.fs.files", "shop.logs"]`:

| Target | Result |
| --- | --- |
| the connection | *own* |
| the database `archive` | *own* |
| `archive.old` | *with its database* |
| `shop.logs` | *own* |
| `shop.orders` | *not excluded*: the connection's `excluded` does not reach it |
| the database `shop` | *not excluded* |
| the bucket `fs` of `media`, and the collection `media.fs.files` | *own* |
| `media.fs.chunks` | *not excluded* |

- `withExclusions(["shop.logs"], ["archive", "shop.logs"], true)` → `["archive", "shop.logs"]`;
  `withExclusions(["shop.logs"], ["shop.logs"], false)` → nothing.
- `renamedExclusions` of the list above, `shop`, `logs` → `logs_old`: `["archive", "media.fs.files",
  "shop.logs_old"]`.
- `droppedExclusions` for the database `archive` with `["archive", "archive.old", "shop.logs"]` → `["shop.logs"]`.

Acceptance:

- [ ] The worked examples give the results shown.
- [ ] Reading `exclusions: ["shop.logs", 3, "shop.logs", ".x", "archive"]` keeps `["archive", "shop.logs"]`.

## The context menus

### `tree.menu-mongodb` — The context menu of a MongoDB node

The entries offered on the heading **Databases**, a database, a collection, a view, a time series collection and a
GridFS bucket. Each entry starts a feature of another area, which says when it is offered and what it does.

- **Kind**: View
- **Engine**: MongoDB
- **Function**: `src/features/tree/menu-mongodb.ts › view(state)`
- **Entry points**: a right click, `Shift+F10` or the `…` button of a node (`@tree-menu`).
- **Uses**: `table.show`, `nav.pin`, `manage.create-collection`, `manage.drop-collection`, `manage.drop-database`,
  `manage.edit-view`, `manage.edit-validation`, `document.insert`, `playground.open`, `search.show`,
  `relation.diagram`, `index.show`, `watch.show`, `advisor.show`, `user.show`, `transfer.import`,
  `transfer.generate`, `transfer.export`, `transfer.copy-collection`, `compare.show`, `structure.show`,
  `backup.create`, `backup.restore`, `gridfs.show`, `tree.refresh`, `tree.set-database-color`,
  `tree.set-collection-color`, `tree.exclude-from-searches`, `tree.select`.
- **Ported from**: `package.json` of Mongoster, `view/item/context`, with the conditions on `viewItem` (`database`,
  `collection`, `view`, `bucket` and their `.readonly` forms) and the groups that give the order. **Open**,
  **Pin**, **Refresh** on every node and the menu of the heading are new in Datardo. **Set color…**, **Exclude from
  searches** and **Include in searches** (the `.excluded` forms, the group `4_organize`): Mongoster 0.9.0 and
  0.10.0.

What it shows, with a line between the groups. In brackets, the feature behind an entry.

- The heading **Databases**: **Create database…** (creating a database, of the area that manages databases and
  collections), **New playground** (`playground.open`); **Back up…** (`backup.create`), **Restore from backup…**
  (`backup.restore`), **Schedule…** (scheduling a backup, of the scheduled tasks' area); **Refresh**
  (`tree.refresh`), **Collapse all**.
- A database: **Create collection…** (`manage.create-collection`), **New playground**; **Set color…**
  (`tree.set-database-color`), **Exclude from searches** or **Include in searches** (`tree.exclude-from-searches`);
  **Search documents…**
  (`search.show`), **Relationship diagram** (`relation.diagram`); **Back up…**, **Restore from backup…**,
  **Schedule…**; **Manage users and roles** (`user.show`), **Watch changes** (`watch.show`), **Index advisor**
  (`advisor.show`); **Compare structure with…** (`structure.show`), **Upload files to GridFS…** (uploading to a
  bucket, of the GridFS area); **Refresh**; **Drop database…** (`manage.drop-database`).
- A collection: **Open** (`table.show`), **Pin** or **Unpin** (`nav.pin`); **Set color…**
  (`tree.set-collection-color`), **Exclude from searches** or **Include in searches**; **Insert document**
  (`document.insert`), **New playground**; **Search documents…**, **Relationship diagram**, **Indexes**
  (`index.show`); **Watch changes**, **Index advisor**; **Import documents…** (`transfer.import`), **Generate test
  documents…** (`transfer.generate`), **Export collection…** (`transfer.export`), **Copy collection to…**
  (`transfer.copy-collection`), **Compare with…** (`compare.show`), **Back up…**, **Restore from backup…**,
  **Schedule…**; **Rename collection…** (renaming a collection, of the area that manages databases and
  collections), **Edit validation rules…** (`manage.edit-validation`); **Drop…** (`manage.drop-collection`).
- A view: **Open**, **Pin** or **Unpin**; **Set color…**, **Exclude from searches** or **Include in searches**;
  **New playground**; **Search documents…**, **Relationship diagram**;
  **Export collection…**, **Copy collection to…**, **Compare with…**, **Back up…**, **Schedule…**; **Edit view
  definition…** (`manage.edit-view`); **Drop…**.
- A time series collection: the entries of a collection, without **Rename collection…**, **Edit validation
  rules…** and **Watch changes**, which MongoDB does not allow on one.
- A GridFS bucket: **Open GridFS bucket** (`gridfs.show`); **Set color…**, **Exclude from searches** or **Include
  in searches**; **Upload files to GridFS…**; **Delete GridFS bucket…** (deleting a bucket, of the GridFS area).
- Several nodes selected, the menu opened on one of them (`tree.select`): **Exclude from searches** and **Include in
  searches**, each when it changes one of them, acting on all the selected nodes it changes; no other entry.

Acceptance:

- [ ] Each entry sends the intent of its feature with the node it was opened on: **Drop…** on `shop.orders` starts
      `manage.drop-collection` on that collection, and the tree runs nothing itself.
- [ ] On a read-only connection the entries that only write are not shown: **Create database…**, **Create
      collection…**, **Restore from backup…**, **Upload files to GridFS…**, **Drop database…**, **Insert document**,
      **Import documents…**, **Generate test documents…**, **Rename collection…**, **Drop…**, **Delete GridFS
      bucket…**. **Edit validation rules…** and **Edit view definition…** stay, and open what cannot be saved.
- [ ] A view never shows **Insert document**, **Import documents…**, **Generate test documents…**, **Restore from
      backup…**, **Indexes**, **Watch changes** or **Index advisor**: Datardo writes nothing through a view.
- [ ] **Pin** reads **Unpin** on a node that is pinned.
- [ ] A database of a MongoDB connection has no **Open**: there is no page of a database to open.
- [ ] A system collection has the entries of a collection.
- [ ] The menu opens at the node with `Shift+F10`, closes with `Escape`, and gives the focus back to the node.
- [ ] A menu opened on a node that is not selected does not change the selection or the active tab.
- [ ] A database, a collection, a view, a time series collection and a bucket have **Set color…**, also on a
      read-only connection.
- [ ] A node with an exclusion of its own has **Include in searches** in place of **Exclude from searches**; a
      collection of an excluded database has **Exclude from searches**; both stay on a read-only connection.
- [ ] With `orders`, `users` and `logs` selected, the menu opened on `users` has only **Exclude from searches**, and
      choosing it excludes the three; opened on `crm`, which is not selected, it is the whole menu of `crm` and acts
      on `crm` alone.

### `tree.menu-redis` — The context menu of a Redis node

The entries offered on the heading **Databases**, a database and a namespace. Each entry starts a feature of another
area, which says when it is offered and what it does.

- **Kind**: View
- **Engine**: Redis
- **Function**: `src/features/tree/menu-redis.ts › view(state)`
- **Entry points**: a right click, `Shift+F10` or the `…` button of a node (`@tree-menu`).
- **Uses**: `key.show`, `console.show`, `nav.pin`, `tree.refresh`, `tree.namespaces`, `tree.set-database-color`.
- **Ported from**: *New in Datardo*. **Set color…** on a database: Mongoster 0.10.0, for its MongoDB
  databases.

What it shows, with a line between the groups. In brackets, the feature behind an entry.

- The heading **Databases**: **Open console** (`console.show`); **Refresh** (`tree.refresh`), **Collapse all**.
- A database: **Open keys** (`key.show`), **Open console here** (`console.show`, on that database); **Set color…**
  (`tree.set-database-color`); **New key…**
  (creating a key, of the keys' area); **Import keys…** and **Export keys…** (importing and exporting keys, of the
  keys' area); **Delete keys by pattern…** (deleting by pattern, of the keys' area); **Refresh**.
- A namespace: **Open keys** (`key.show`), **Pin** or **Unpin** (`nav.pin`); **New key…**, with the name starting
  with the namespace's prefix; **Export keys…** and **Delete keys by pattern…**, with the namespace's pattern
  (`orders:*`); **Refresh**, which refreshes its database.

Acceptance:

- [ ] Each entry sends the intent of its feature with the database, and for a namespace its pattern as
      `tree.namespaces` gives it: **Delete keys by pattern…** on `a[1]:` starts with the pattern `a\[1\]:*`.
- [ ] On a read-only connection **New key…**, **Import keys…** and **Delete keys by pattern…** are not shown.
- [ ] **Open console here** on `db2` opens a console tab whose database is 2.
- [ ] The node **<n> empty databases** has no menu; an empty database under it has the menu of a database.
- [ ] **Pin** reads **Unpin** on a namespace that is pinned.
- [ ] The menu opens at the node with `Shift+F10`, closes with `Escape`, and gives the focus back to the node.
- [ ] A database has **Set color…**, also on a read-only connection; a namespace has none, and neither has **Exclude
      from searches**.
