# Connections

Saved connections of every engine: adding them, the connection form with its TLS settings, SSH tunnel and redis-oplog
link, testing, saving, connecting, the state and latency of a connected one, reconnecting, disconnecting, duplicating
and removing; folders, colors and the read-only safeguard; the SSH host key check; where the secrets are kept; the
Overview page; importing and exporting connections, with the file formats and the encryption they use. A connection
has one engine, chosen when it is added and never changed. The tree island of the current connection is the
[tree](tree.md) area; the Home page, the connection switcher and the connection island are drawn by their own areas
and start the features of this one.

## Adding and changing a connection

### `connection.add` — Add a connection

Starts a new connection: asks which engine it is for, and opens the connection form for that engine.

- **Kind**: Operation
- **Engine**: Any
- **Function**: `src/features/connection/add.ts › plan(context, answers)`
- **Entry points**: **Add connection** on the Home page, and in the menu of a folder there, which puts the new
  connection in that folder (`@home`); **Add connection** at the bottom of the connection switcher
  (`@connection-switcher`); **Add connection** in the tree island while no connection is saved (`@tree`); **Add
  Redis connection…** in the redis-oplog section of a MongoDB connection's form (`@form`); Go to (**Add
  connection**, **Add MongoDB connection**, **Add Redis connection**).
- **Asks**: the engine, in a list to pick from titled **Add connection**, with the question **Which engine?**:
  **MongoDB** (*4.2 or later: standalone, replica set, sharded cluster, Atlas*) and **Redis** (*6.2 or later:
  standalone or one replica*). Not asked when the entry point already says the engine: the two commands with a
  variant, the Home page filtered by one engine, **Add Redis connection…**.
- **Plan**: no step. Nothing is saved until `connection.save`.
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Nothing to undo: closing the form saves nothing.
- **After**: opens the connection form (`connection.form`) for a new connection of that engine, with the folder it
  was started on.
- **Commands**: `connection.add`, `connection.add:mongodb`, `connection.add:redis`.
- **Uses**: `connection.form`, `runner.ask`, `tab.open`.
- **Ported from**: connection.add (`src/extension.ts`, `src/connections.ts`). Mongoster's two questions, the
  connection string and the name, are the first fields of the form.

Acceptance:

- [ ] **Add connection** on the Home page with no filter by engine asks **Which engine?** with **MongoDB** first;
      choosing **Redis** opens the tab **New connection** with the host `localhost` and the port `6379`.
- [ ] With the Home page filtered to Redis, **Add connection** opens the Redis form without asking.
- [ ] `connection.add:mongodb` opens the MongoDB form with the connection string `mongodb://localhost:27017` without
      asking.
- [ ] Dismissing the question opens nothing and saves nothing.
- [ ] Started from the menu of the folder **Work**, the form opens with **Folder** set to `Work`; from anywhere
      else, with no folder.
- [ ] While a form for a new connection of that engine is open, adding another of the same engine shows that tab
      instead of opening a second one.

### `connection.edit` — Edit a connection

Opens the connection form of a saved connection, to change anything about it.

- **Kind**: Operation
- **Engine**: Any
- **Function**: `src/features/connection/edit.ts › plan(context, answers)`
- **Entry points**: **Edit connection…** in the menu of a connection: on its card of the Home page (`@home`), on its
  line of the connection switcher (`@connection-switcher`) and on the connection island (`@connection-island`); the
  button **Edit connection…** of the Overview page (`@toolbar`); Go to (**Edit connection…**), for the current
  connection.
- **Asks**: from Go to with no current connection, which connection: a list of every saved connection, by folder.
- **Plan**: no step. Nothing changes until `connection.save`.
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Nothing to undo: closing the form saves nothing.
- **After**: opens the connection form of the connection (`connection.form`).
- **Commands**: `connection.edit`.
- **Uses**: `connection.form`, `connection.menu`, `tab.open`.
- **Ported from**: connection.edit, and the entry **Connection Settings (TLS / SSH)…** of connection.form
  (`src/extension.ts`, `src/connectionEditor.ts`). Mongoster's two questions are replaced by the form, because a
  saved password is never shown again.

Acceptance:

- [ ] **Edit connection…** on the connection Local opens the tab **Connection: Local** with its saved values and
      the focus on **Name**.
- [ ] Run again while that tab is open, it shows the same tab.
- [ ] A connected connection stays connected while its form is open; only saving a change to what reaches the server
      disconnects it (`connection.save`).
- [ ] The form of a read-only connection can be opened and saved.
- [ ] The connection string is shown without its password, and no password field is filled (`connection.form`).

### `connection.form` — The connection form

The app tab where a connection is written, with the fields of its engine, its TLS settings, its SSH tunnel and, for
MongoDB, its redis-oplog link, then tested and saved.

- **Kind**: View
- **Engine**: Any
- **Function**: `src/features/connection/form.ts › view(state)`
- **Entry points**: opened by `connection.add` and `connection.edit`. No command of its own.
- **Reads**: for a saved connection, its settings, and from the secret storage only which secrets are saved, never
  their values; the connection string comes without its secrets (`connection.string-secrets`); the folders in use;
  the saved Redis connections, for the redis-oplog section.
- **After**: **Test connection** (`connection.test`); **Save** and **Save and connect** (`connection.save`);
  **Cancel**, `Escape` or closing the tab closes the form without saving and without asking; **Browse…** beside each
  file opens the system's file dialog titled **Choose the CA certificate**, **Choose the client certificate and key
  (PEM)**, **Choose the SSH private key** or **Choose the queries folder**, with the button **Choose** (the
  certificates are filtered to `pem`, `crt`, `cer`, `key`, or all files).
- **Uses**: `connection.read-form`, `connection.test`, `connection.save`, `connection.redis-string`,
  `connection.string-secrets`, `connection.secrets`, `connection.link-redis`, `connection.add`, `oplog.publish`,
  `connection.color-presets`, `connection.custom-color`.
- **Ported from**: connection.form (`src/connectionEditor.ts`, `src/webview/connectionEditor.ts`,
  `media/connectionEditor.css`, `src/shared/messages.ts`). The fields of Redis, **Password** of the connection
  string, **Folder**, **Color**, **Read-only**, **Queries folder** and **Save and connect** are new in Datardo. The
  eleven presets and **Custom color…** of **Color** follow connection.set-color of Mongoster 0.9.0.

What it shows, in this order:

1. The heading: **New connection**, or **Connection <name>**, with the engine beside it. The engine cannot be
   changed.
2. **Name**, with the placeholder **Shown on Home and in the connection island (default: the host)**.
3. The address.
   - MongoDB: **Connection string**, with the placeholder `mongodb://user@host:27017/?authSource=admin`, and
     **Password**.
   - Redis: the choice **Fields** or **Connection string**. **Fields**: **Host** (`localhost`), **Port** (`6379`),
     **Username** (placeholder **Empty for the default user**), **Password** (with a user name, the password of that
     ACL user; alone, the password of `requirepass`) and **Database opened first** (`0`). **Connection string**: one
     field with the placeholder `redis://user@host:6379/0 (rediss:// for TLS)`, and **Password**. Each way shows what
     the other holds (`connection.redis-string`).
4. **Folder** (the folders in use, or a new name; empty for none), **Color** (**None**, then the eleven presets of
   `connection.color-presets` in their order, **Red** to **Gray**, each after a swatch of its color, then **Custom
   color…**, which opens the dialog **Choose a color** (`connection.custom-color`) and, once a custom color is
   chosen, shows it as its swatch and its `#rrggbb`), the checkbox **Read-only** with the hint *Datardo refuses every
   write through this connection.* and, for MongoDB, **Queries folder** with **Browse…**, the folder on disk where
   the connection's saved queries in the folder are kept.
5. The section **TLS / SSL**, with a checkbox and the hint *Encrypts the connection. Without certificates the
   system's trusted authorities are used (as with `tls=true` in the connection string).*, which for Redis ends *(as
   with `rediss://`)*. **CA certificate** (placeholder **ca.pem — to trust a private certificate authority**),
   **Client certificate** (placeholder **client.pem — certificate and private key, when the server requires one**),
   **Key password** (placeholder **If the client key is encrypted**), **Allow invalid certificates (insecure)** and
   **Allow invalid host names (insecure)**. The same fields for both engines.
6. The section **SSH tunnel**, with a checkbox and the hint *Connects through an SSH server (a bastion) that can
   reach the database. The tunnel goes to the first host of the connection string, as a direct connection to that
   server.*; for Redis the second sentence is *The tunnel goes to the host and port above.* **SSH server**
   (placeholder `bastion.example.com`), **Port** (`22`), **Username**, **Authentication** (**Password**, **Private
   key** or **SSH agent**), then **Password**; or **Private key** (placeholder `~/.ssh/id_ed25519`, with
   **Browse…**) and **Passphrase** (placeholder **If the key is encrypted**); or the hint *Uses the keys loaded in
   the running agent (SSH_AUTH_SOCK, or the Windows OpenSSH agent).*
7. For MongoDB, the section **redis-oplog**, with a checkbox and the hint *Publishes the writes made in Datardo to
   Redis as the Meteor package `cultofcoders:redis-oplog` does, so that the publications of the apps using it see
   them. Only Datardo's own writes: edits, inserts, deletes, the playground and undo.* **Redis connection**: the
   saved Redis connections by folder, and **Add Redis connection…** (`connection.link-redis`). Then **Channel
   prefix**, **Namespaces** and **Databases and collections**, which say what is published: their rules are those
   of `oplog.publish`.
8. The result of the last test, or the refusal of the form, then the buttons **Test connection**, **Cancel**,
   **Save** and **Save and connect**.

Acceptance:

- [ ] A new MongoDB connection opens the tab **New connection** with the heading **New connection**, the engine
      MongoDB beside it, the connection string `mongodb://localhost:27017`, the SSH port `22`, **Password**
      authentication and no Redis connection chosen; the focus is on the connection string.
- [ ] A new Redis connection opens with **Fields** chosen, the host `localhost`, the port `6379`, an empty user name,
      the database `0` and TLS off; the focus is on **Host**.
- [ ] A saved connection opens the tab **Connection: <name>** with the heading **Connection <name>**, its saved
      values, and the focus on **Name**.
- [ ] One form per connection, and one for a new connection of each engine: opening it again shows the open tab.
- [ ] The sections **TLS / SSL**, **SSH tunnel** and **redis-oplog** each have a checkbox; their fields are disabled
      while it is off. The SSH fields shown follow the authentication: **Password**, **Private key** (file and
      **Passphrase**) or **SSH agent**.
- [ ] No secret is sent to the form: the **Password** of the connection string or of the Redis fields, the **Key
      password**, the SSH **Password** and the **Passphrase** come empty, with the placeholder **Saved — leave empty
      to keep it** when one is saved. The connection string comes without its password
      (`mongodb://ada@db1:27017/app`), and an option of it that holds a secret comes with an empty value
      (`proxyPassword=`).
- [ ] In a saved connection, changing the user or a host of the connection string (for Redis, the user name, the
      host or the port) takes the placeholder **Saved — leave empty to keep it** away from **Password** and shows
      under it **The user or the host changed: enter the password again.**
- [ ] For Redis, typing `rediss://cache.example.com:6380/2` in **Connection string** and choosing **Fields** shows
      the host `cache.example.com`, the port `6380`, the database `2` and the **TLS / SSL** checkbox on; turning the
      checkbox off and choosing **Connection string** shows `redis://cache.example.com:6380/2`.
- [ ] A password typed inside the connection string (`redis://:s3cret@cache`) is moved to **Password** when the
      field loses the focus, and the connection string then shows `redis://cache`.
- [ ] What was typed stays in the form while another tab is in front. Nothing typed is written to disk before
      **Save**; a form tab restored at the next start (`tab.restore`) shows the saved values.
- [ ] A refusal of `connection.read-form` is shown above the buttons, with its field marked and focused; typing in
      the field takes the mark away.
- [ ] While a test or a save runs, the four buttons are disabled and **Test connection** reads **Testing…** or
      **Save** reads **Saving…**.
- [ ] With no keychain on the system, the form shows above the buttons *Passwords are not saved on this computer: no
      keychain is available.* (`connection.secrets`).
- [ ] **Color** lists **None**, **Red**, **Orange**, **Yellow**, **Green**, **Blue**, **Purple**, **Pink**, **Teal**,
      **Indigo**, **Brown**, **Gray** and **Custom color…**; choosing **Custom color…** and applying `#1e90ff` in
      **Choose a color** shows `#1e90ff` in **Color**, and **Save** saves that color; **Cancel** in the dialog leaves
      **Color** as it was.

### `connection.read-form` — What the form says, checked

Turns the fields of the connection form into the settings of a connection, or into a refusal that names a field.
`connection.test` and `connection.save` both start from it, so they refuse the same things with the same words.

- **Kind**: Derivation
- **Engine**: Any
- **Function**: `src/features/connection/read-form.ts › connectionFromForm(form, saved, files)`
- **Uses**: `connection.redis-string`, `connection.string-secrets`, `connection.ssh-tunnel-target`.
- **Refuses**: with the texts and the fields of the table below: `/connection-string`, `/host`, `/port`,
  `/database`, `/no-user`, `/file-missing`, `/ssh-host`, `/ssh-port`, `/ssh-username`, `/ssh-key`, `/srv-through-ssh`,
  `/no-linked-connection`.
- **Ported from**: connection.form and connection.save (`src/connectionEditor.ts › ConnectionEditor.parse`,
  `parseRedis`).

Rules:

- Inputs: the fields of the form; for a saved connection, its settings and which secrets it has; for each file the
  form names, whether it exists. Output: the name, the connection string without its secrets, what to do with each
  secret (keep the saved one, replace it, drop it), the TLS settings, the SSH tunnel, the folder, the color,
  read-only, the queries folder, the linked connection; or a refusal with its text, its reason and the field to
  mark.
- Every text is trimmed. An empty **Name** becomes the host part of the connection string, without the credentials:
  for MongoDB every host with its port as written (`a:1,b:2`), for Redis the host and the port (`cache:6379`).
- MongoDB: the connection string must start with `mongodb://` or `mongodb+srv://`.
- Redis: with **Fields**, the connection string is written from them; with **Connection string**, it is read
  (`connection.redis-string`). TLS is on when the checkbox is on, and the saved connection string then starts with
  `rediss://`; otherwise with `redis://`.
- The password of the connection string: a password written inside the connection string is taken; else what
  **Password** holds; with both empty, the saved one is kept only while the user and the hosts of the connection
  string are those saved (for Redis the user name, the host and the port), and otherwise there is none. The same for
  an option of the connection string that holds a secret and is left with an empty value
  (`connection.string-secrets`); an option that is removed is dropped.
- TLS on without any file is kept as TLS with no file: the system's authorities are used. An empty **Key password**
  keeps the saved one while a client certificate is set; without a client certificate the key password is dropped.
- An empty SSH **Password** or **Passphrase** keeps the saved one only while the SSH server and the user stay the
  same; with another server or user it is dropped, and an empty password is then saved as empty. An empty SSH port
  is 22.
- With the SSH tunnel on, the connection string must lead somewhere (`connection.ssh-tunnel-target`).
- A section whose checkbox is off gives nothing, whatever its fields hold.

Refusals, each with the field it marks and its reason:

| Text | Field | Reason |
| --- | --- | --- |
| **The connection string must start with mongodb:// or mongodb+srv://** | Connection string | `/connection-string` |
| **The connection string must start with redis:// or rediss://** | Connection string | `/connection-string` |
| **Invalid Redis connection string** | Connection string | `/connection-string` |
| **The connection string has no host** | Connection string | `/connection-string` |
| **The host is missing** | Host | `/host` |
| **The port must be a number from 1 to 65535** | Port | `/port` |
| **The database must be a number from 0: <text>** | Database opened first | `/database` |
| **Write the user in the connection string: mongodb://user@host** (a password with no user) | Password | `/no-user` |
| **The CA certificate file does not exist: <path>** | CA certificate | `/file-missing` |
| **The client certificate file does not exist: <path>** | Client certificate | `/file-missing` |
| **The SSH host is missing** | SSH server | `/ssh-host` |
| **The SSH port must be a number from 1 to 65535** | SSH port | `/ssh-port` |
| **The SSH username is missing** | SSH username | `/ssh-username` |
| **Choose the private key file** | Private key | `/ssh-key` |
| **The private key file does not exist: <path>** | Private key | `/file-missing` |
| **A mongodb+srv:// connection string can not go through an SSH tunnel: use the mongodb://host:port form of one of the servers.** | Connection string | `/srv-through-ssh` |
| **Choose the Redis connection** (redis-oplog on, none chosen) | Redis connection | `/no-linked-connection` |
| **The queries folder does not exist: <path>** | Queries folder | `/file-missing` |

The first refusal in the order of the form is the one returned.

Examples:

- MongoDB, new, name empty, `mongodb://u:p@a:1,b:2/db` → name `a:1,b:2`, connection string `mongodb://u@a:1,b:2/db`,
  password replaced with `p`.
- MongoDB, saved as `mongodb://ada@db1:27017/app` with a password; the form comes back unchanged, **Password** empty
  → the password is kept.
- The same, with the connection string changed to `mongodb://ada@db2:27017/app` and **Password** empty → no
  password.
- The same, with **Password** `n3w` → password replaced with `n3w`.
- MongoDB, `localhost:27017` → refused, **The connection string must start with mongodb:// or mongodb+srv://**,
  field Connection string.
- MongoDB, `mongodb://db1/app` and **Password** `x` → refused, **Write the user in the connection string:
  mongodb://user@host**.
- MongoDB, `mongodb+srv://c0.example.net/app` with the SSH tunnel on → refused, **A mongodb+srv:// connection string
  can not go through an SSH tunnel: use the mongodb://host:port form of one of the servers.**
- Redis, **Fields**: host `cache`, port `6379`, user name empty, **Password** `s3cret`, database `2`, TLS on →
  connection string `rediss://cache/2`, password replaced with `s3cret`.
- Redis, **Fields**: port `0` → refused, **The port must be a number from 1 to 65535**; database `a` → refused,
  **The database must be a number from 0: a**.
- SSH on, server `bastion`, port empty, user `me`, **Private key** with an empty file → refused, **Choose the private
  key file**.
- Saved SSH tunnel `me@bastion` with a password; the form comes back with the server `bastion2` and an empty
  **Password** → the SSH password is dropped and saved as empty.
- TLS off, **CA certificate** `C:\missing.pem` → no TLS settings and no refusal.

### `connection.redis-string` — A Redis connection string, read and written

How a `redis://` or `rediss://` connection string becomes the fields of a Redis connection, and the fields a
connection string.

- **Kind**: Derivation
- **Engine**: Redis
- **Function**: `src/features/connection/redis-string.ts › redisFromString(text)` and `› redisToString(fields)`
- **Ported from**: `src/redisOplog.ts › parseRedisUrl`, which Mongoster used for the redis-oplog address only. The
  database and the writing are new in Datardo.

Rules for reading:

- The text is trimmed. A text without a scheme is read as if `redis://` came before it.
- The form is `redis://[username][:password]@host[:port][/database]`. The scheme, in any case, is `redis://` (TLS
  off) or `rediss://` (TLS on); any other is refused with **The connection string must start with redis:// or
  rediss://**, a text that is not a URI with **Invalid Redis connection string**, one without a host with **The
  connection string has no host**.
- Before `@`: `username:password`, `:password` (a password alone, for `requirepass`) or `username` (no password).
  Both are percent-decoded.
- The host is a name, an IPv4 address, or an IPv6 address in brackets, which loses its brackets. The port is 6379
  when left out; one that is not a whole number from 1 to 65535 is refused with **The port must be a number from 1 to
  65535**.
- The path is the number of the database opened first: `/2`. None, or `/` alone, is 0. Anything that is not a whole
  number from 0 is refused with **The database must be a number from 0: <text>**.
- A query (`?…`) and a fragment (`#…`) are not read and not kept.

Rules for writing:

- `rediss://` with TLS on, `redis://` otherwise.
- Nothing before the host when the user name and the password are both empty; `:password@` with a password alone;
  `username@` with a user name alone; `username:password@` with both. Each is percent-encoded.
- An IPv6 host is written in brackets. The port is left out when it is 6379, the database when it is 0.
- Reading what was written gives the same fields.

Examples:

- `redis://localhost` → host `localhost`, port 6379, no user name, no password, database 0, TLS off; written back as
  `redis://localhost`.
- `rediss://ada:p%40ss@cache.example.com:6380/2` → user name `ada`, password `p@ss`, host `cache.example.com`, port
  6380, database 2, TLS on.
- `redis://:s3cret@10.0.0.5/1` → no user name, password `s3cret`, host `10.0.0.5`, port 6379, database 1.
- `redis://ada@cache` → user name `ada`, no password.
- `cache:6379` → host `cache`, port 6379; written back as `redis://cache`.
- `REDIS://[::1]:7000/` → host `::1`, port 7000, database 0; written back as `redis://[::1]:7000`.
- `redis://cache/3?timeout=5` → host `cache`, database 3; written back as `redis://cache/3`.
- `http://cache` → refused, **The connection string must start with redis:// or rediss://**.
- `redis://` → refused, **The connection string has no host**.
- `redis://cache/orders` → refused, **The database must be a number from 0: orders**.
- `redis://cache:70000` → refused, **The port must be a number from 1 to 65535**.
- Host `cache`, port 6379, no user name, password `a b`, database 3, TLS on → `rediss://:a%20b@cache/3`.
- Host `cache`, port 6380, user name `ada`, no password, database 0, TLS off → `redis://ada@cache:6380`.

### `connection.string-secrets` — The secrets in and out of a connection string

Takes the secrets out of a connection string, so that it can be shown, logged or exported, and puts them back before
it is used.

- **Kind**: Derivation
- **Engine**: Any
- **Function**: `src/features/connection/string-secrets.ts › withoutSecrets(connectionString, mode)` and `›
  withSecrets(connectionString, secrets)`
- **Ported from**: connection.write-file (`src/shared/connectionsFile.ts › userInfo`, `withPassword`, `urlPassword`,
  `setUriParams`). Taking the secrets of the options out is new in Datardo: Mongoster left them in the connection
  string.

Rules:

- The secrets of a connection string are: the password, between the first `:` after the scheme's `//` and the `@`
  that ends the credentials; and, for MongoDB, the values of the options `tlsCertificateKeyFilePassword` and
  `proxyPassword` and the token of the pair `AWS_SESSION_TOKEN:<token>` inside the option `authMechanismProperties`.
  Option names are compared ignoring case.
- The password is kept as it is written, percent-encoded. A password that comes from a field of the form is
  percent-encoded before it is put in.
- Taking out, mode *shown* (the connection form, the Overview page, the Log, the text of an error): the password and
  its `:` go; each secret option stays with an empty value, and the pair stays as `AWS_SESSION_TOKEN:`.
- Taking out, mode *removed* (a file exported without passwords, or with encrypted ones): the password and its `:`
  go; each secret option goes; the pair goes, and `authMechanismProperties` with it when nothing else is left in it.
- The other options keep their place and their spelling. A connection string with no credentials and no secret
  option comes back unchanged.
- Putting back: the password goes after the user as `:password`; for Redis with no user name, as `:password@`
  before the host. A secret option is set to its value, replacing one of the same name; the pair replaces an older
  `AWS_SESSION_TOKEN`.

Examples:

- `mongodb://ada:p%40ss@db1:27017/app` → `mongodb://ada@db1:27017/app`, password `p%40ss`.
- `redis://:s3cret@cache/1` → `redis://cache/1`, password `s3cret`.
- `mongodb://ada@h/?proxyHost=p&proxyPassword=pp&appName=x`: shown →
  `mongodb://ada@h/?proxyHost=p&proxyPassword=&appName=x`; removed → `mongodb://ada@h/?proxyHost=p&appName=x`;
  `proxyPassword` is `pp`.
- `mongodb://k:s@h/?authMechanism=MONGODB-AWS&authMechanismProperties=AWS_SESSION_TOKEN:tok`: shown →
  `mongodb://k@h/?authMechanism=MONGODB-AWS&authMechanismProperties=AWS_SESSION_TOKEN:`; removed →
  `mongodb://k@h/?authMechanism=MONGODB-AWS`.
- `…&authMechanismProperties=SERVICE_NAME:x,AWS_SESSION_TOKEN:tok`, removed →
  `…&authMechanismProperties=SERVICE_NAME:x`.
- `mongodb://CN=me@h/?authMechanism=MONGODB-X509` → unchanged, no secret.
- The password `p@ss`, typed in the form, put into `mongodb://ada@db1/app` → `mongodb://ada:p%40ss@db1/app`; into
  `redis://cache/1` → `redis://:p%40ss@cache/1`.

### `connection.test` — Test the connection

Tries what the form says, without saving it, and tells the server version and, for a MongoDB connection linked to a
Redis one, whether Redis answers.

- **Kind**: Read
- **Engine**: Any
- **Function**: `src/features/connection/test.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: **Test connection** in the connection form (`@form`).
- **Reads**: what `connection.server-info` reads, with the time to find the server limited to 5 seconds, through the
  SSH tunnel when it is on: for MongoDB `db.adminCommand({ buildInfo: 1 })`; for Redis `HELLO`, `PING` and `INFO
  server`. For MongoDB with the redis-oplog section on, `PING` to the linked connection, opened with its own saved
  settings.
- **Refuses**: what `connection.read-form` refuses, with the same reasons; what `connection.connect` refuses
  (`/redis-cluster`, `/redis-sentinel`, `/unsupported`).
- **Uses**: `connection.read-form`, `connection.connect`, `connection.server-info`, `connection.trust-host-key`,
  `connection.ssh-tunnel-target`, `connection.secrets`.
- **Ported from**: connection.test (`src/connectionEditor.ts › ConnectionEditor.run`, `src/connections.ts ›
  ConnectionManager.test`, `src/transport.ts › openClient`, `src/redisOplog.ts › testRedis`). The test of a Redis
  connection is new in Datardo.

Acceptance:

- [ ] Empty password fields are tried with the saved secrets, under the rules of `connection.read-form`.
- [ ] MongoDB: success reads **Connected to <host>: MongoDB <version>.**, or **Connected to <host> through
      <user>@<SSH server>: MongoDB <version>.** with the tunnel, where `<host>` is the host part of the connection
      string.
- [ ] Redis: success reads **Connected to <host>:<port>: Redis <version>.**, or **Connected to <host>:<port> through
      <user>@<SSH server>: Redis <version>.**
- [ ] With redis-oplog on, **Redis <host>:<port> answers.** is added; when Redis fails the result is a failure that
      still names MongoDB's version: **<MongoDB part> Could not connect to Redis: <reason>**, marking **Redis
      connection**.
- [ ] A failure reads **Could not connect: <reason>**; a wrong Redis password gives the server's own reason, for
      example **Could not connect: WRONGPASS invalid username-password pair or user is disabled.**
- [ ] A Redis server in cluster mode fails with **Redis Cluster is not supported yet.**; Redis 5.0.14 with **Redis
      5.0.14 is too old: Datardo needs Redis 6.2 or later.**
- [ ] A Redis server that does not answer in 5 seconds fails with **Could not connect: Redis <host>:<port> didn't
      answer in 5 seconds**.
- [ ] An unknown SSH server asks for its host key, and the answer is remembered as for a real connection.
- [ ] The client and the tunnel are closed after the test; nothing is saved, and no password appears in the result.

### `connection.save` — Save the connection form

Saves a new connection, or the changes to one, with its secrets, its TLS settings, its SSH tunnel and its redis-oplog
link.

- **Kind**: Operation
- **Engine**: Any
- **Function**: `src/features/connection/save.ts › plan(context, answers)`
- **Entry points**: **Save** and **Save and connect** in the connection form, or `Enter` in a field, which is
  **Save** (`@form`).
- **Asks**: when the form turns **Read-only** off on a saved read-only connection, the confirmation of
  `connection.allow-changes`.
- **Reads**: the saved connection and which secrets it has; whether the files the form names exist.
- **Plan**: `save the connection <name>`, an app step that writes the secrets to the secret storage and the rest to
  Datardo's saved connections (`connection.secrets`). For a connected connection whose connection string, secrets,
  TLS settings or SSH tunnel changed, `disconnect <name>` first.
- **Danger**: None: the saved settings and secrets are replaced without a confirmation.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone: the previous settings and secrets are not kept.
- **After**: the tab closes and a notification says **Connection <name> saved**. The new name, color, folder,
  read-only and link reach the Home page, the connection switcher, the connection island and the open tabs at once.
  With **Save and connect**, the connection is then made the current one and connected (`nav.switch-connection`,
  `connection.connect`).
- **Refuses**: what `connection.read-form` refuses, with its reasons; an error while saving is shown in the form,
  which stays open.
- **Uses**: `connection.read-form`, `connection.secrets`, `connection.disconnect`, `connection.connect`,
  `connection.allow-changes`, `connection.link-redis`, `connection.unlink-redis`, `nav.switch-connection`,
  `runner.notify`, `oplog.publish`.
- **Ported from**: connection.save (`src/connectionEditor.ts`, `src/connections.ts › ConnectionManager.add`,
  `setOptions`, `setRedisOplog`, `update`, `src/extension.ts › saveConnection`, `updateConnection`).

Acceptance:

- [ ] **Save** does not try the connection. **Save and connect** saves first: when it then cannot connect, the
      connection stays saved and a notification says **Could not connect to <name>: <reason>**.
- [ ] An empty name saves the host part of the connection string as the name.
- [ ] A new connection gets an id that no other connection has, and keeps it when it is renamed. It is saved with
      its engine and in the folder the form names.
- [ ] TLS on without any file is saved as TLS with no file, which connects with TLS and the system's authorities.
- [ ] An empty **Key password** keeps the saved one while a client certificate is set; without a client certificate
      the key password is deleted from the secret storage.
- [ ] An empty SSH **Password** or **Passphrase** keeps the saved one only while the SSH server and the user stay
      the same; with another server or user it is dropped (an empty password is then saved as empty).
- [ ] An empty **Password** of the connection string keeps the saved one while the user and the hosts stay the same.
- [ ] Turning TLS and SSH off deletes the key password, the SSH password and the passphrase from the secret
      storage; turning redis-oplog off removes the link (`connection.unlink-redis`) and keeps the Redis connection.
- [ ] Saving only a new name, color or folder leaves a connected connection connected; saving another host
      disconnects it, and its open tabs connect again when they next read.
- [ ] The saved connections hold no secret: the connection string is kept in the secret storage only.

### `connection.copy-string` — Copy the connection string

Puts the saved connection string on the clipboard, password included.

- **Kind**: Read
- **Engine**: Any
- **Function**: `src/features/connection/copy-string.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: **Copy connection string** in the menu of a connection (`@home`, `@connection-switcher`,
  `@connection-island`); Go to (**Copy connection string**), for the current connection.
- **Reads**: the connection string and its password in the secret storage.
- **After**: a notification says **Connection string copied (it may contain the password)**, for 4 seconds.
- **Commands**: `connection.copy-string`.
- **Uses**: `connection.secrets`, `connection.string-secrets`, `connection.menu`, `runner.notify`.
- **Ported from**: connection.copy-string (`src/extension.ts`, `src/connections.ts › ConnectionManager.uri`).

Acceptance:

- [ ] The clipboard holds the connection string with its password: `mongodb://ada:p%40ss@db1:27017/app`, or for
      Redis `rediss://:s3cret@cache/2`.
- [ ] The main process writes the clipboard: the text never reaches the window process, and the Log records
      `[connection.copy-string]` with the name of the connection, not the text.
- [ ] The TLS settings of a MongoDB connection and the SSH tunnel are not part of what is copied.
- [ ] A connection whose connection string is missing from the secret storage copies nothing and says nothing.

### `connection.duplicate` — Duplicate a connection

Saves a copy of a connection, with everything it has, under a new name.

- **Kind**: Operation
- **Engine**: Any
- **Function**: `src/features/connection/duplicate.ts › plan(context, answers)`
- **Entry points**: **Duplicate** in the menu of a connection (`@home`, `@connection-switcher`,
  `@connection-island`); Go to (**Duplicate connection**), for the current connection.
- **Reads**: the names of the saved connections, to choose the name of the copy.
- **Plan**: `save the connection <name> (2)`, an app step that copies the settings and, inside the secret storage,
  the secrets.
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone from the undo history; `connection.remove` removes the copy.
- **After**: the copy appears beside the original on the Home page and in the connection switcher, not connected. A
  notification says **Connection <name> (2) added**, with **Edit connection…** (`connection.edit`).
- **Commands**: `connection.duplicate`.
- **Uses**: `connection.secrets`, `connection.edit`, `connection.menu`, `runner.notify`, `tree.color-of`,
  `tree.excluded`.
- **Ported from**: *New in Datardo*.
- **Differs**: (M39) the copy has nothing excluded from searches.

Acceptance:

- [ ] Duplicating Local saves `Local (2)`; when that name is taken, `Local (3)`, and so on.
- [ ] The copy has the engine, the connection string with its password, the TLS settings, the SSH tunnel with its
      password or passphrase, the folder, the color, read-only, the queries folder and, for MongoDB, the same
      linked connection.
- [ ] The copy has the colors of the databases and collections of the original (`tree.color-of`) and, when the
      original is excluded from searches, is excluded too, with the same databases and collections excluded
      (`tree.excluded`). (differs)
- [ ] The copy has a new id, an empty undo history, no pins and no open tabs.
- [ ] The secrets are copied in the main process: the window process never receives them.
- [ ] Changing or removing the copy changes nothing of the original.

## Connecting

### `connection.connect` — Connect a connection

Opens the client of a connection the first time something needs it, with its TLS settings and through its SSH tunnel,
and learns what the server is.

- **Kind**: Operation
- **Engine**: Any
- **Function**: `src/features/connection/connect.ts › plan(context, answers)`
- **Entry points**: **Connect** on the card of a connection of the Home page and in its menu (`@home`); making a
  connection the current one (`nav.switch-connection`), from the connection switcher or from Go to; **Connect** on
  the connection island (`@connection-island`) and in the tree island (`@tree`) while the current connection is not
  connected; **Connect** in the menu of a connection on its line of the connection switcher (`@connection-switcher`);
  the button **Connect** of the Overview page (`@toolbar`); anything that reads a deployment through the connection: opening a tab, a scheduled task (`task.run`),
  a tool of the MCP server (`mcp.server`); Go to (**Connect**), for the current connection.
- **Offered when**: the connection is not connected.
- **Asks**: only the host key of an SSH server that is unknown or changed (`connection.trust-host-key`).
- **Reads**: the connection string, the TLS settings and the SSH tunnel with their secrets, in the secret storage;
  the SSH private key file; then what the server is (`connection.server-info`).
- **Plan**: `connect <name>`, an app step. It opens the SSH tunnel when there is one, then the client. For MongoDB
  the driver connects and Datardo sends `db.adminCommand({ hello: 1 })` and `db.adminCommand({ buildInfo: 1 })`. For
  Redis it sends `HELLO 3 AUTH <username> <password> SETNAME datardo` (`HELLO 3 SETNAME datardo` without a password;
  the user name `default` with a password alone), then `PING`, then `INFO server`, then `SELECT <n>` when the
  database opened first is not 0.
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Nothing to undo: `connection.disconnect` closes it.
- **After**: the connection is connected: the connection island shows its engine, version and topology, the Home
  page and the connection switcher mark it, and its state and latency are followed (`connection.state`).
- **Refuses**: a connection string missing from the secret storage, **Connection string not found. Remove and re-add
  this connection.** (`/no-connection-string`); a Redis server in cluster mode, **Redis Cluster is not supported
  yet.** (`/redis-cluster`); a Redis Sentinel, **Redis Sentinel is not supported yet.** (`/redis-sentinel`); a Redis
  server older than 6.2, **Redis <version> is too old: Datardo needs Redis 6.2 or later.** (`/unsupported`); a host
  key that is not confirmed, **SSH: the host key of <host>:<port> was not trusted** (`/host-key`); secrets that
  were never written because the system has no keychain, **The secrets of <name> were not saved: open its form and
  enter them again.** (`/no-secrets`).
- **Commands**: `connection.connect`.
- **Uses**: `connection.server-info`, `connection.ssh-tunnel-target`, `connection.trust-host-key`,
  `connection.secrets`, `connection.state`, `connection.reconnect`, `runner.progress`, `runner.refuse`.
- **Ported from**: connection.connect (`src/connections.ts › ConnectionManager.getClient`, `connect`,
  `src/transport.ts › openClient`, `SshTunnel.open`, `tlsClientOptions`, `tunnelTarget`, `throughTunnel`); for
  Redis, `src/redisOplog.ts › RedisConnection.open`. Connecting a Redis connection as a connection of its own is new
  in Datardo.

Acceptance:

- [ ] One client per connection, shared by every tab, task and tool until it is disconnected. The MongoDB client has
      `appName` `datardo` and 10 seconds to find a server; the Redis clients are named `datardo`.
- [ ] While it connects, the status line shows **Connecting to <host>…**, with **Cancel**.
- [ ] A connect that fails is not kept: the next use tries again. A notification says **Could not connect to <name>:
      <reason>**.
- [ ] The TLS settings of MongoDB become `tls: true` plus `tlsCAFile`, `tlsCertificateKeyFile`,
      `tlsCertificateKeyFilePassword`, `tlsAllowInvalidCertificates` and `tlsAllowInvalidHostnames` when set. For
      Redis the same settings open a TLS socket with that authority, that certificate and key, and the same two
      exceptions.
- [ ] With an SSH tunnel, the SSH server is reached on its port (22 by default) within 15 seconds, with keepalives
      every 30 seconds, authenticated by password, by the private key file (and its passphrase) or by the agent
      (`SSH_AUTH_SOCK`, or `\\.\pipe\openssh-ssh-agent` on Windows).
- [ ] The client then connects to a local port on `127.0.0.1` forwarded to the target of the tunnel
      (`connection.ssh-tunnel-target`); for MongoDB as a direct connection. With a host name (not an IP address), TLS
      checks the certificate against that name, not against `127.0.0.1`.
- [ ] SSH failures read **SSH: authentication failed for <user>@<host>:<port>**, **SSH: no private key file.**,
      **SSH: can't read the private key <file>: <reason>**, **SSH: no SSH agent found (SSH_AUTH_SOCK is not set).**;
      a forward that fails reads **SSH tunnel: <host>:<port> can't reach <target host>:<target port> (<reason>)**.
- [ ] Redis: with the user name `ada` and a password, the first command is `HELLO 3 AUTH ada <password> SETNAME
      datardo`; with a password alone, `HELLO 3 AUTH default <password> SETNAME datardo`. A server that answers
      `HELLO` with an unknown command error gets `AUTH` and `CLIENT SETNAME datardo` instead.
- [ ] Redis: a server whose `INFO server` says `redis_mode:cluster` is refused with **Redis Cluster is not supported
      yet.**, `redis_mode:sentinel` with **Redis Sentinel is not supported yet.**, `redis_version:5.0.14` with
      **Redis 5.0.14 is too old: Datardo needs Redis 6.2 or later.**; the client is closed in each case.
- [ ] Redis: a server that does not answer in 10 seconds *(Datardo's choice)* fails with **Redis <host>:<port>
      didn't answer in 10 seconds**.
- [ ] The Log writes `[connection.connect] connect <name>` and the commands sent with `***` in place of the
      password; no secret is written.

### `connection.server-info` — What the server is

Reads the version of the server and what kind of deployment it is, for the connection island, the test of the form,
the Overview page and every feature that must know what the server can do.

- **Kind**: Read
- **Engine**: Any
- **Function**: `src/features/connection/server-info.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: none of its own: `connection.connect`, `connection.test` and `connection.overview` use it.
- **Reads**: MongoDB: `db.adminCommand({ buildInfo: 1 })` and `db.adminCommand({ hello: 1 })`. Redis: `INFO server`;
  for the Overview page also `INFO replication`, `INFO memory` and `INFO clients`.
- **Uses**: `connection.connect`.
- **Ported from**: `src/connections.ts › ConnectionManager.test` (the version, from `buildInfo`). The topology and
  everything about Redis are new in Datardo.

Acceptance:

- [ ] MongoDB: the version is `version` of `buildInfo`. The topology is **Sharded cluster** when `hello` has `msg:
      "isdbgrid"`, **Replica set <setName>** when it has `setName`, **Standalone** otherwise.
- [ ] MongoDB: the hosts of a replica set are `hosts`, `passives` and `arbiters` of `hello`, each with its role:
      **primary** for the one named by `primary`, **arbiter** for the arbiters, **secondary** for the others.
- [ ] Redis: the version is `redis_version` of `INFO server`, compared number by number: `6.2.0` and `7.4.1` are
      accepted, `6.0.20` is not. The mode is `redis_mode`.
- [ ] Redis: a server whose `INFO server` has `valkey_version` is shown as **Valkey <valkey_version>**; every other
      as **Redis <redis_version>**. What is accepted is still decided by `redis_version`.
- [ ] Redis: the role is `role` of `INFO replication`: **master**, or **replica of <master_host>:<master_port>** for
      `slave`.
- [ ] `INFO` lines are read as `name:value`; lines that start with `#` and empty lines are skipped; a name that is
      missing gives no value, not an error.
- [ ] The connection island shows the result with the first two numbers of the version and the topology:
      **MongoDB 8.0 · rs0**, **MongoDB 7.0 · standalone**, **MongoDB 8.0 · sharded cluster**, **Redis 7.4 ·
      standalone**, or **Redis 7.4 · replica** for a server whose role is `slave`.

### `connection.disconnect` — Disconnect

Closes the client of a connection, and its SSH tunnel.

- **Kind**: Operation
- **Engine**: Any
- **Function**: `src/features/connection/disconnect.ts › plan(context, answers)`
- **Entry points**: **Disconnect** in the menu of a connected connection (`@home`, `@connection-switcher`,
  `@connection-island`); the button **Disconnect** of the Overview page (`@toolbar`); Go to (**Disconnect**), for
  the current connection.
- **Offered when**: the connection is connected, connecting or reconnecting.
- **Plan**: `disconnect <name>`, an app step that closes every client of the connection and its SSH tunnel.
- **Danger**: None: no confirmation; work in progress through the client fails.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Nothing to undo: the next use connects again (`connection.connect`).
- **After**: the connection is shown as not connected. Its open tabs stay open and connect again when they next
  read.
- **Commands**: `connection.disconnect`.
- **Uses**: `connection.connect`, `connection.state`, `connection.menu`.
- **Ported from**: connection.disconnect (`src/connections.ts › ConnectionManager.disconnect`, `src/extension.ts`).

Acceptance:

- [ ] After **Disconnect**, the connection island, the Home page and the connection switcher no longer show the
      connection as connected, and its menu offers **Connect** instead of **Disconnect**.
- [ ] A query run afterwards in an open collection tab connects again without asking.
- [ ] Saving a change to what reaches the server and removing the connection disconnect it too.
- [ ] Disconnecting stops its pings (`connection.state`) and any attempt to reconnect (`connection.reconnect`).
- [ ] Disconnecting a Redis connection that MongoDB connections publish through does not stop the publishing: the
      next write opens it again (`oplog.publish`).
- [ ] Quitting Datardo disconnects every connection.

### `connection.state` — The state and latency of a connection

Keeps the state of every saved connection from what happens to its client, and takes the latency of the current one
from its ping.

- **Kind**: Read
- **Engine**: Any
- **Function**: `src/features/connection/state.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: none to start it. Its result is shown on the connection island and on the status line for the
  current connection, with the latency; on the cards of the Home page and in the connection switcher for every
  connection, without it.
- **Reads**: no command of its own. There is one ping, the one `nav.ping` describes and shows:
  `db.adminCommand({ ping: 1 })` for MongoDB or `PING` for Redis, sent to the current connection while it is
  connected, at once when it connects or becomes current and then every 10 seconds, with 5 seconds to answer, and
  not while the window is minimized or hidden in the tray. `nav.ping` says how the latency is written; this card
  says what the answer does to the state.
- **After**: a ping that gets *no answer*, the end of the SSH connection, the close of the socket of a Redis client
  or a MongoDB client that finds no server starts `connection.reconnect`.
- **Uses**: `nav.ping`, `connection.reconnect`, `connection.connect`, `connection.disconnect`, `nav.status-line`.
- **Ported from**: *New in Datardo*. Mongoster shows only whether a connection is connected.

Acceptance:

- [ ] The states and their texts: **not connected**, **connecting…**, **connected**, **reconnecting…** and
      **failed**. A connection is **failed** when it could not connect, or when it was lost and the attempts to
      reconnect ended; it keeps the reason, which the connection island shows.
- [ ] One ping only: with Local current and connected, its server receives one `ping` every 10 seconds, the one of
      `nav.ping`, and no second one for the state.
- [ ] A ping that reads *no answer* (an error, or no reply within 5 seconds) puts the current connection in the
      state **reconnecting…**; a reply that comes after the 5 seconds changes nothing.
- [ ] The latency is the last value of `nav.ping`, written as it writes it (`<1 ms`, `4 ms`, `1.2 s`). Only the
      current connection has one: a card of the Home page and a line of the connection switcher show the state
      alone.
- [ ] A connected connection that is not the current one is not pinged: its state changes when its client reports
      the drop (the SSH connection ends, a socket closes, no server is found), or when its next use fails.
- [ ] A connection that is not connected is never pinged, and nothing connects it to ping it.
- [ ] While the window is minimized or hidden in the tray no ping is sent: a drop is then noticed from the client,
      or at the first ping after the window is shown.
- [ ] No ping is written in the Log, not even one with no answer; the drop is written once, with its reason, by
      `connection.reconnect`.

### `connection.reconnect` — Reconnect after a drop

Connects again a connection that was lost, by itself at growing intervals, or at once when the user asks.

- **Kind**: Operation
- **Engine**: Any
- **Function**: `src/features/connection/reconnect.ts › plan(context, answers)`
- **Entry points**: by itself, when a ping fails (`connection.state`), when the SSH connection ends or when the
  socket of a Redis client closes; **Reconnect** on the connection island (`@connection-island`), in the menu of the
  connection (`@home`, `@connection-switcher`), on the status line (`@status-line`) and in the notification of the
  lost connection (`@notification`); Go to (**Reconnect**), for the current connection.
- **Offered when**: the connection is reconnecting or failed.
- **Plan**: `disconnect <name>`, then `connect <name>` (`connection.connect`).
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Nothing to undo.
- **After**: once connected, the state is **connected** again; pages that follow something live (Watch changes,
  Pub/Sub, a console) start again as their own cards say; the other pages read again when they next read.
- **Refuses**: what `connection.connect` refuses; a refusal ends the attempts.
- **Commands**: `connection.reconnect`.
- **Uses**: `connection.connect`, `connection.disconnect`, `connection.state`, `runner.notify`.
- **Ported from**: connection.connect, which disconnects when the SSH connection drops and connects at the next use
  (`src/connections.ts`). Trying again by itself is new in Datardo.

Acceptance:

- [ ] After a drop the state is **reconnecting…** and Datardo tries after 1, 2, 5, 10 and 30 seconds, then every 30
      seconds *(Datardo's choice)*.
- [ ] When 5 minutes *(Datardo's choice)* have passed since the drop, it stops: the state is **failed** and
      a notification says **Lost the connection to <name>: <reason>**, with **Reconnect**.
- [ ] **Reconnect** tries at once, also while the attempts are running, and starts the intervals again when it
      fails.
- [ ] A wrong password, a refusal of `connection.connect` or an SSH host key that changed stops the attempts at
      once with the state **failed**. The question about a changed host key is asked only when the user chooses
      **Reconnect**.
- [ ] A step that was running when the connection dropped fails with the driver's error, and its plan stops
      (`runner.run`); no step is sent twice.
- [ ] A read started while the state is **reconnecting…** waits for the connection for up to 10 seconds, then fails
      with **<name> is not connected: <reason>**.
- [ ] `connection.disconnect` during the attempts ends them, with the state **not connected**.

### `connection.ssh-tunnel-target` — Where the SSH tunnel leads

The host the tunnel forwards to, and the address the client then uses.

- **Kind**: Derivation
- **Engine**: Any
- **Function**: `src/features/connection/ssh-tunnel-target.ts › tunnelTarget(engine, connectionString)` and `›
  throughTunnel(engine, connectionString, localPort)`
- **Uses**: `connection.redis-string`.
- **Ported from**: connection.ssh-tunnel-target (`src/transport.ts › tunnelTarget`, `throughTunnel`). The rules for
  Redis are new in Datardo.

Rules:

- MongoDB: the target is the first host of the connection string, its port or 27017; an IPv6 address in brackets
  loses its brackets; the host is percent-decoded.
- MongoDB, refused: a text that is not a `mongodb://` connection string (**The connection string must start with
  mongodb://**), a `mongodb+srv://` one (**A mongodb+srv:// connection string can not go through an SSH tunnel: use
  the mongodb://host:port form of one of the servers.**), no host (**Unexpected host in the connection string:
  (none)**).
- MongoDB: the client's connection string keeps the scheme, the credentials, the path (`/` when there is none) and
  the options, with the hosts replaced by `127.0.0.1:<local port>` and `directConnection=true` replacing any
  `directConnection` (in any case), added last.
- Redis: the target is the host of the connection string and its port, or 6379. The client connects to `127.0.0.1`
  and the local port, with the same user name, password and database.

Examples (local port 50000):

- `mongodb://u:p@db1:27018,db2/app?replicaSet=rs0` → target `db1:27018`, client
  `mongodb://u:p@127.0.0.1:50000/app?replicaSet=rs0&directConnection=true`.
- `mongodb://[::1]/?directConnection=false&tls=true` → target `::1:27017`, client
  `mongodb://127.0.0.1:50000/?tls=true&directConnection=true`.
- `mongodb://h` → target `h:27017`, client `mongodb://127.0.0.1:50000/?directConnection=true`.
- `mongodb://a%40b@my%2Dhost:1/db` → target `my-host:1`, client
  `mongodb://a%40b@127.0.0.1:50000/db?directConnection=true`.
- `rediss://ada@cache.internal:6380/2` → target `cache.internal:6380`, client `127.0.0.1:50000` with the user name
  `ada`, the database 2 and TLS checked against `cache.internal`.
- `redis://cache` → target `cache:6379`.

### `connection.trust-host-key` — Confirm the host key of an SSH server

The key of an SSH server is shown for confirmation the first time, and a different key later is a warning.

- **Kind**: Operation
- **Engine**: Any
- **Function**: `src/features/connection/trust-host-key.ts › plan(context, answers)`
- **Entry points**: connecting through an SSH tunnel (`connection.connect`, `connection.reconnect`) and **Test
  connection** (`connection.test`). Its two questions are dialogs (`@dialog`).
- **Asks**: an unknown server: **Trust the SSH server <host>:<port>?**, with the detail **Its host key fingerprint
  is** / the fingerprint / **Compare it with the one of the server (ssh-keygen -lf
  /etc/ssh/ssh_host_ed25519_key.pub) before trusting it. It is remembered for the next connections.** and the button
  **Trust**. A server whose key changed: see **Danger**.
- **Reads**: the known hosts, in Datardo's data folder.
- **Plan**: `remember the host key of <host>:<port>`, an app step that writes the fingerprint in the known hosts,
  which are not secret.
- **Danger**: Confirm, for a key that changed: **The SSH host key of <host>:<port> has changed!**, with the detail
  **Remembered: <old>** / **Now: <new>** / **The server may have been reinstalled, or someone may be intercepting
  the connection. Trust the new key only if you know why it changed.** and the button **Trust new key**. None for a
  key that is already known.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone: there is no command to forget a known host.
- **Refuses**: a key that is not confirmed: the SSH connection fails with **SSH: the host key of <host>:<port> was
  not trusted** (`/not-trusted`).
- **Uses**: `runner.ask`, `runner.confirm`.
- **Ported from**: connection.trust-host-key (`src/connections.ts › ConnectionManager.checkHostKey`,
  `src/transport.ts › SshTunnel.open`, `fingerprint`).

Acceptance:

- [ ] The fingerprint is OpenSSH's: `SHA256:` and the base64 of the SHA-256 of the key, without `=` padding.
- [ ] A key equal to the remembered one connects without asking.
- [ ] Hosts are told apart by `host:port` of the SSH server (port 22 by default), whichever connection of whichever
      engine uses them.
- [ ] Dismissing either question refuses the key and remembers nothing.
- [ ] Removing a connection keeps its known hosts.
- [ ] A scheduled task or a tool of the MCP server that meets an unknown or changed key does not ask: it fails with
      **SSH: the host key of <host>:<port> was not trusted**.

## The Overview page

### `connection.overview` — The Overview page of a connection

The page of a connection: what it is, how it is reached, and what the server holds, for each engine.

- **Kind**: View
- **Engine**: Any
- **Function**: `src/features/connection/overview.ts › view(state)`
- **Entry points**: **Overview** in **Pages of** the connection, in the tree island (`@tree`); **Open overview** in
  the menu of a connection (`@home`, `@connection-switcher`, `@connection-island`); **Refresh** of the page, which
  reads it again (`@toolbar`); Go to (**Overview**), for the current connection.
- **Reads**: the saved settings of the connection, without secrets; its state (`connection.state`); the server
  (`connection.server-info`). MongoDB: the databases with their sizes (`tree.list-databases`) and, for each of the
  first 100 *(Datardo's choice)* in the order of their names, its collections (`tree.list-collections`). Redis: the
  databases with their key counts (`tree.redis-databases`).
- **After**: **Refresh** reads everything again; **Edit connection…** (`connection.edit`); **Connect**
  (`connection.connect`) or **Disconnect** (`connection.disconnect`); **Open Monitor** (`monitor.show`) for MongoDB
  and **Open Server** (`server.show`) for Redis; a click on a MongoDB database shows it in the tree island, expanded;
  a click on a Redis database opens its keys tab (`key.show`).
- **Commands**: `connection.overview`.
- **Uses**: `connection.server-info`, `connection.state`, `connection.edit`, `connection.connect`,
  `connection.disconnect`, `connection.string-secrets`, `tree.list-databases`, `tree.list-collections`,
  `tree.redis-databases`, `monitor.show`, `server.show`, `key.show`, `tab.open`.
- **Ported from**: *New in Datardo*. The lines about the SSH tunnel, TLS and redis-oplog come from the tooltip of a
  connection in Mongoster (`src/tree.ts › ConnectionNode`), the sizes from its database nodes.

What it shows, in this order:

1. The header: the color, the name, the engine, the state and latency, **Read-only** when the connection is; then
   the buttons **Refresh**, **Edit connection…** and **Connect** or **Disconnect**.
2. **Connection**: the address (the connection string without its secrets), the folder, and the lines that apply:
   **Through the SSH tunnel <user@host>**; **TLS certificates or options set**; **Read-only: Datardo refuses writes
   through this connection**; **Changes aren't kept in the undo history**; for MongoDB **Publishes its writes to
   Redis for redis-oplog through <name>**; for Redis **Receives the writes of <names> for redis-oplog**.
3. **Server**, while connected.
   - MongoDB: **Version**; **Topology** (**Standalone**, **Replica set <name>** or **Sharded cluster**); **Hosts**,
     a table of host and role (**primary**, **secondary**, **arbiter**; **mongos** for the hosts of a sharded
     cluster's connection string; the one host of a standalone).
   - Redis: **Version**; **Mode**; **Role**; **Uptime**; **Memory**: used, peak, limit (**no limit** when
     `maxmemory` is 0) and the eviction policy; **Clients**: connected, blocked and the limit.
4. **Databases**, while connected.
   - MongoDB: a table of name, size on disk, collections and views, sorted by name, and a last line with the totals.
   - Redis: a table of database (`db0`), keys, keys with an expiry and average TTL, for the databases that hold
     keys.

Acceptance:

- [ ] The page is a page tab of the connection, one per connection: opening it again shows the open tab.
- [ ] Not connected, it shows the header and **Connection** only, with **Connect**; nothing is read from the server
      and opening the page does not connect.
- [ ] While it reads, each of **Server** and **Databases** shows **Loading…**; one that fails shows the server's
      error and **Retry**, and the other is still shown. Read again (**Refresh**, `F5`, coming back to its tab),
      **Server** keeps what it showed, dimmed, until the answer comes.
- [ ] MongoDB: sizes are written as the tree writes them (`tree.count`): `1.5 KB`, `1.0 GB`. A database beyond the
      first 100 shows its size and no counts.
- [ ] MongoDB: a user who may not list the databases sees the one database of the connection string, as the tree
      does.
- [ ] Redis: `INFO replication` with `role:slave`, `master_host:10.0.0.5` and `master_port:6379` shows **Role**
      **replica of 10.0.0.5:6379**.
- [ ] Redis: `db0:keys=1204,expires=310,avg_ttl=86400000` shows `db0`, **1,204** keys, **310** with an expiry and an
      average TTL of 86,400 seconds, written **1 d**; a server with no keys shows **No keys**.
- [ ] A user that may not run `INFO` sees the server's error under **Server** (`NOPERM …`) and the rest of the page.
- [ ] No secret is shown: `mongodb://ada@db1:27017/app`, never the password.
- [ ] The page does not read again by itself; **Refresh** and `F5` do.

## Organizing connections

### `connection.menu` — The menu of a connection

The entries offered on a saved connection, the same wherever the connection is shown.

- **Kind**: View
- **Engine**: Any
- **Function**: `src/features/connection/menu.ts › view(state)`
- **Entry points**: the `…` button and the context menu of a connection's card on the Home page (`@home`) and of its
  line in the connection switcher (`@connection-switcher`); the `…` button of the connection island, for the current
  connection (`@connection-island`).
- **Uses**: `connection.connect`, `connection.disconnect`, `connection.reconnect`, `connection.overview`,
  `connection.edit`, `connection.duplicate`, `connection.copy-string`, `connection.move-to-folder`,
  `connection.set-color`, `connection.read-only`, `connection.allow-changes`, `connection.link-redis`,
  `connection.unlink-redis`, `tree.exclude-from-searches`, `backup.create`, `backup.restore`, `task.edit`,
  `connection.remove`.
- **Ported from**: the context menu of a connection in Mongoster (`package.json`, `view/item/context` with `viewItem
  =~ /^connection/`). Its entries that open a page are in **Pages of** the connection, in the tree island; those
  that create, back up and restore are in the tree island's own menu. **Exclude from searches** and **Include in
  searches** come from tree.exclude of Mongoster 0.9.0 (`package.json`, `mongoster.exclude`, `mongoster.include`),
  which offers them on the connection's node of its tree.
- **Differs**: (M39) the menu has no **Exclude from searches** and no **Include in searches**.

What it shows, in this order, with a line between the groups:

1. **Connect** when the connection is not connected, **Disconnect** when it is connected, connecting or
   reconnecting; **Reconnect** as well when it is reconnecting or failed. **Open overview**.
2. **Edit connection…**, **Duplicate**, **Copy connection string**.
3. **Move to folder…**, **Set color…**, **Exclude from searches** or, on a connection excluded from searches,
   **Include in searches**, which belong to the tree area (`tree.exclude-from-searches@connection-island`,
   `@home`, `@connection-switcher`), **Make read-only** or, on a read-only connection, **Allow changes**; **Stop
   keeping undo history** or **Keep undo history**, which belong to the undo area; for a MongoDB connection, **Link
   a Redis connection…** and, when one is linked, **Unlink <name of the Redis connection>**.
4. For a MongoDB connection, **Back up…** and, unless it is read-only, **Restore from backup…**, which belong to the
   backup area; on the connection island, **Schedule…** too, read-only or not, which belongs to the scheduled tasks
   area (`task.edit@connection-island`, the one place its card names in this menu: Q116).
5. **Remove connection**.

Acceptance:

- [ ] The entries and their order are the same on the Home page, in the connection switcher and on the connection
      island, but for **Schedule…**, on the connection island only.
- [ ] A connected connection shows **Disconnect** and no **Connect**; a failed one shows **Connect** and **Reconnect**.
- [ ] A read-only connection shows **Allow changes** and no **Make read-only**.
- [ ] A Redis connection shows no entry about linking; a MongoDB connection linked to Cache local shows **Link a
      Redis connection…** and **Unlink Cache local**.
- [ ] A MongoDB connection shows **Back up…** and **Restore from backup…**; a read-only one **Back up…** only; a Redis
      connection neither.
- [ ] Every entry can be reached with the keyboard: `Shift+F10` on a card or a line opens the menu, the arrows move,
      `Enter` chooses, `Escape` closes.
- [ ] A MongoDB connection and a Redis connection both show **Exclude from searches** after **Set color…**; once
      excluded, the menu shows **Include in searches** in its place, also on a read-only connection. (differs)

### `connection.folder-menu` — The menu of a folder

The entries offered on a folder of connections.

- **Kind**: View
- **Engine**: Any
- **Function**: `src/features/connection/folder-menu.ts › view(state)`
- **Entry points**: the `…` button and the context menu of a folder's heading on the Home page (`@home`) and in the
  connection switcher (`@connection-switcher`).
- **Uses**: `connection.add`, `connection.rename-folder`, `connection.remove-folder`, `connection.import`,
  `connection.export`.
- **Ported from**: the context menu of a folder in Mongoster (`package.json`, `view/item/context` with `viewItem ==
  folder`).

What it shows, in this order: **Add connection**; **Rename folder…**, **Remove folder (keep connections)**; **Import
connections…**, **Export connections…**.

Acceptance:

- [ ] **Add connection** from the folder Work opens a form whose **Folder** is `Work`.
- [ ] **Import connections…** from a folder puts what is imported in that folder without asking where.
- [ ] **Export connections…** from a folder starts with only the connections of that folder checked.
- [ ] Connections with no folder are listed first, under no heading and with no such menu.

### `connection.set-color` — Set the color of a connection

Marks everything of a connection with one of eleven preset colors or a custom one, for example red for production.

- **Kind**: Operation
- **Engine**: Any
- **Function**: `src/features/connection/set-color.ts › plan(context, answers)`
- **Entry points**: **Set color…** in the menu of a connection (`@home`, `@connection-switcher`,
  `@connection-island`); **Color** in the connection form, saved with it (`@form`); Go to (**Set color…**), for the
  current connection.
- **Asks**: a list to pick from titled **Color of <name>**, with the placeholder **Shown on its island, its group of
  tabs and its card, e.g. red for production**, and the items **Red**, **Orange**, **Yellow**, **Green**, **Blue**,
  **Purple**, **Pink**, **Teal**, **Indigo**, **Brown**, **Gray** (each after a swatch of its color), **None** and
  **Custom color…**, described with the custom color in use (`#1e90ff`) when there is one; the current one is
  described **current**. **Custom color…** then opens the dialog **Choose a color** (`connection.custom-color`).
- **Plan**: `set the color of <name> to <color>` (`set the color of Local to teal`, or `… to #1e90ff` for a custom
  color), or `remove the color of <name>`: an app step.
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone from the undo history; choose the previous color again.
- **After**: the connection island, the connection's group of tabs, its card on the Home page and its line in the
  connection switcher change at once.
- **Commands**: `connection.set-color`.
- **Uses**: `connection.menu`, `connection.color-presets`, `connection.custom-color`, `tree.color-of`,
  `tab.groups`, `runner.ask`.
- **Ported from**: connection.set-color (`src/extension.ts`, `src/connections.ts`, `src/connectionColors.ts`,
  `src/tree.ts`); the eleven presets and **Custom color…** from connection.set-color of Mongoster 0.9.0 (proposal
  0001, revision 2; `src/shared/colors.ts › PRESET_COLORS`, `colorChoices`, `src/extension.ts › askColor`).
  Mongoster shows a custom color as its nearest preset where VS Code takes only theme colors; Datardo draws every
  color itself, so a custom color is exact everywhere.

Acceptance:

- [ ] Dismissing the list changes nothing; dismissing the dialog **Choose a color** of **Custom color…** changes
      nothing either.
- [ ] Choosing **Red** for Local shows red on the connection island while Local is current, on the heading of its
      group of tabs, on its card and on its line in the connection switcher, without reopening anything.
- [ ] The list shows the eleven presets in the order **Red**, **Orange**, **Yellow**, **Green**, **Blue**,
      **Purple**, **Pink**, **Teal**, **Indigo**, **Brown**, **Gray**, then **None** and **Custom color…**; on a
      connection colored `#1e90ff`, **Custom color…** is described `#1e90ff · current`.
- [ ] Applying `#1e90ff` in **Choose a color** colors Local with exactly `#1e90ff` on the connection island, the dot
      and the line of its group of tabs, its card and its line in the connection switcher, in the dark and in the
      light theme.
- [ ] Every open tab of the connection, whatever its kind, takes the color at once, a playground tab included: the
      dot and the line of its group are the connection's color (`tab.groups`).
- [ ] The icon of a tab takes a color only from its database's or its collection's own color (`tree.color-of`): the
      tab of `shop.orders`, whose database is teal, stays teal when Local's color changes, and the tab of
      `crm.users`, with no color of its own, keeps its icon as it is.
- [ ] **None** removes the color everywhere; a connection without a color has the neutral mark of the theme.
- [ ] A preset is drawn with the theme's token of that name (`connection.color-presets`), so it is readable in the
      dark and in the light theme; it is never the only sign of anything: the name is always beside it.
- [ ] The color does not change the tree island's nodes or the syntax colors: a node's icon takes a color only from
      a database's or a collection's own color (`tree.color-of`).

### `connection.color-presets` — The preset colors and custom colors

The eleven colors offered wherever something is colored, a color of the user's own as `#rrggbb`, how a color read
from a text is told, and the preset nearest to a custom color, which a Compass file needs.

- **Kind**: Derivation
- **Engine**: Any
- **Function**: `src/features/connection/color-presets.ts › readColor(value)`, `› nearestPreset(color)` and `›
  colorLabel(color)`
- **Uses**: `window.theme`.
- **Ported from**: connection.nearest-preset and the colors of connection.set-color in Mongoster 0.9.0 (proposal
  0001, revision 2; `src/shared/colors.ts › PRESET_COLORS`, `normalizeHex`, `isColor`, `readColor`,
  `nearestPreset`, `colorLabel`, `PRESET_DEFAULTS`). Mongoster needs the nearest preset wherever VS Code takes only
  theme colors; Datardo draws every color itself and needs it only to write a Compass file
  (`connection.color-from-compass`). The tokens are Datardo's.

Rules:

- A color is a preset or a custom color. The presets, in the order every list shows them: `red`, `orange`,
  `yellow`, `green`, `blue`, `purple`, `pink`, `teal`, `indigo`, `brown`, `gray`, shown as **Red**, **Orange**,
  **Yellow**, **Green**, **Blue**, **Purple**, **Pink**, **Teal**, **Indigo**, **Brown**, **Gray**. A custom color
  is kept as `#` and six hexadecimal digits in lower case, and shown as it is kept (`#12abef`).
- Reading a color (`readColor`), from a field, a file or a setting: the text is trimmed and its case ignored; a
  preset's name is that preset; `#rrggbb` and `#rgb`, with or without `#`, are a custom color, `#rgb` doubling each
  digit; anything else, and what is not a text, is no color.
- A preset is drawn with its token of the theme in use, `--color-connection-<name>`; a custom color is drawn as it
  is, in both themes. The tokens *(the five last are Datardo's choice)*:

  | Preset | Dark | Light |
  | --- | --- | --- |
  | red | `#ff7a7a` | `#bb2828` |
  | orange | `#ffa45c` | `#a94e08` |
  | yellow | `#f2c35b` | `#7f5300` |
  | green | `#5bd38c` | `#17703e` |
  | blue | `#7db8ff` | `#1d55c2` |
  | purple | `#c4a7ff` | `#7136c8` |
  | pink | `#f58cc3` | `#a8245c` |
  | teal | `#4fd1c5` | `#00706a` |
  | indigo | `#9fa8ff` | `#4041b5` |
  | brown | `#d4a373` | `#7a4a24` |
  | gray | `#a9b0bb` | `#5b6270` |

- Each token is at least 4.5:1 against every surface of its theme (canvas, island, raised, hover, selected), as
  R10.10 holds text. A custom color is not held to a ratio: a color is never the only sign of anything, its name is
  always beside it.
- The nearest preset (`nearestPreset`): a preset is itself. For a custom color, with its channels from 0 to 1: when
  the largest and the smallest differ by less than 0.12, gray; otherwise its hue is taken, and a color whose largest
  channel is under 0.65 with a hue from 10° to 45° is brown; otherwise the preset of the nearest hue, red 0°, orange
  30°, yellow 55°, green 125°, teal 170°, blue 215°, purple 280°, pink 330°, the distance going round the circle;
  and blue with a hue of 220° or more and a largest channel under 0.8 is indigo.

Examples:

- `readColor`: `' Teal '` → teal; `'#1E90FF'` → `#1e90ff`; `'abc'` → `#aabbcc`; `'#12345'` → none; `'chartreuse'` →
  none; `7` → none.
- `nearestPreset`: `#ff0000` → red; `#ffa500` → orange; `#20b2aa` → teal; `#1e90ff` → blue; `#5c6bc0` → indigo;
  `#4b0082` → purple; `#ff69b4` → pink; `#8b4513` → brown; `#808080` → gray; `#12abef` → blue.
- `colorLabel`: pink → **Pink**; `#12abef` → `#12abef`.

Acceptance:

- [ ] Each example above gives exactly that result.
- [ ] `tokens.css` has the eleven tokens with the values of the table in each theme, and the contrast check of
      R10.10 finds every one at least 4.5:1 on canvas, island, raised, hover and selected.
- [ ] A connection colored teal shows `#4fd1c5` in the dark theme and `#00706a` in the light one; one colored
      `#12abef` shows `#12abef` in both.

### `connection.custom-color` — Choose a custom color

The dialog **Choose a color**, opened by **Custom color…**: a color of the user's own, as `#rrggbb`, for a
connection, a database or a collection.

- **Kind**: View
- **Engine**: Any
- **Function**: `src/features/connection/custom-color.ts › view(state)`
- **Entry points**: **Custom color…**, the last item of the list of `connection.set-color`, `tree.set-database-color`
  and `tree.set-collection-color`; **Custom color…** of **Color** in the connection form (`@form`). Its controls are
  in the dialog (`@dialog`).
- **Shows**, in a dialog (`nav.dialog`) titled **Choose a color**, under the line **Color of <name>** (the
  connection, the database or the collection):
  1. the system's color picker, and beside it the field **Color**, with the placeholder `#rrggbb`;
  2. the eleven presets as swatches, in their order (`connection.color-presets`), each named **Red** to **Gray** to a
     screen reader and when the pointer rests on it;
  3. a preview: the dot and the band of a card, and the icon of a tab, in the color chosen, on the island's surface;
  4. the buttons **Cancel** and **Apply**.
- **States**:
  - It starts on the color in use: a custom color in the picker and the field, a preset with its swatch selected;
    else, for a database or a collection, the color it follows (`tree.color-of`); else blue.
  - The picker and the field follow each other. The field takes what `readColor` reads: `#rrggbb`, `#rgb`, any case,
    or a preset's name. A swatch chooses the preset itself, which stays drawn with its token in each theme, not its
    value: the field then shows the preset's name (`teal`) and the picker its value in the theme in use.
  - While the field reads as no color, **Apply** is disabled and the field shows under it **Enter a color as
    #rrggbb**.
  - **Apply**, or `Enter` in the field, closes the dialog and gives the color to the feature that opened it, which
    writes it as its card says. **Cancel** and `Esc` close it and nothing is written.
  - `Tab` goes from the picker to the field, the swatches, **Cancel** and **Apply**; the arrows move between the
    swatches, and `Space` or `Enter` chooses one.
- **Uses**: `nav.dialog`, `runner.ask`, `connection.color-presets`, `connection.set-color`, `connection.form`,
  `tree.set-database-color`, `tree.set-collection-color`, `tree.color-of`.
- **Ported from**: connection.custom-color of Mongoster 0.9.0 (proposal 0001, revision 2; `src/colorPicker.ts ›
  pickCustomColor`, `src/webview/colorPicker.ts`, `media/colorPicker.css`, `src/shared/colors.ts › readColor`).
  Mongoster opens a tab; Datardo a dialog. Mongoster's line **Shown as <preset> in the tree, on tab icons and on the
  names of editor tabs, which take only the presets.** is left out: Datardo draws a custom color exactly everywhere.

Acceptance:

- [ ] **Custom color…** on Local, colored red, opens **Choose a color** with **Color of Local**, the swatch **Red**
      selected and the field `red`.
- [ ] Typing `#1E90FF` in the field moves the picker and the preview to that color; **Apply** colors Local
      `#1e90ff` and closes the dialog.
- [ ] Typing `#abc` and pressing `Enter` applies `#aabbcc`.
- [ ] Choosing the swatch **Teal** and **Apply** gives Local the preset teal, which shows `#4fd1c5` in the dark theme
      and `#00706a` in the light one.
- [ ] Typing `#12345` disables **Apply** and shows **Enter a color as #rrggbb**.
- [ ] **Cancel** and `Esc` leave the color as it was.
- [ ] On a collection with no color of its own, in a database with none, of a connection colored red, the dialog
      starts on **Red**; with no color anywhere, on **Blue**.

### `connection.move-to-folder` — Move a connection to a folder

Groups connections in folders, on the Home page and in the connection switcher.

- **Kind**: Operation
- **Engine**: Any
- **Function**: `src/features/connection/move-to-folder.ts › plan(context, answers)`
- **Entry points**: **Move to folder…** in the menu of a connection (`@home`, `@connection-switcher`,
  `@connection-island`); **Folder** in the connection form, saved with it (`@form`); Go to (**Move to folder…**),
  for the current connection.
- **Asks**: a list to pick from titled **Move <name> to folder**, with the other folders in use (sorted by name),
  **New folder…** and, when the connection is in a folder, **No folder**; **New folder…** asks for the name (title
  **New folder**, prompt **Folder name**, refused when empty with **Enter a name**).
- **Plan**: `move <name> to the folder <folder>`, or `move <name> out of its folder`: an app step.
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone from the undo history; move it back.
- **Commands**: `connection.move-to-folder`.
- **Uses**: `connection.menu`, `runner.ask`.
- **Ported from**: connection.move-to-folder (`src/extension.ts`, `src/connections.ts › ConnectionManager.update`,
  `folders`).

Acceptance:

- [ ] The connection's current folder is not offered.
- [ ] A new folder with the name of one in use puts the connection in that folder.
- [ ] A folder exists only while a connection is in it: moving the last connection out removes the folder from the
      Home page and from the connection switcher.
- [ ] Connections of both engines can share a folder.
- [ ] Folders are listed sorted by name; the connections with no folder come first.

### `connection.rename-folder` — Rename a folder

Gives a folder another name, for every connection in it.

- **Kind**: Operation
- **Engine**: Any
- **Function**: `src/features/connection/rename-folder.ts › plan(context, answers)`
- **Entry points**: **Rename folder…** in the menu of a folder (`@home`, `@connection-switcher`).
- **Asks**: the new name, in a dialog titled **Rename folder <folder>**, filled with the current name.
- **Plan**: `rename the folder <folder> to <new name>`, an app step that changes the folder of every connection in
  it.
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone from the undo history; rename it back.
- **Refuses**: in the dialog, an empty name (**Enter a name**) and the name of another folder in use (**This folder
  already exists**).
- **Uses**: `connection.folder-menu`, `runner.ask`.
- **Ported from**: connection.rename-folder (`src/connections.ts › ConnectionManager.renameFolder`,
  `src/extension.ts`).

Acceptance:

- [ ] Every connection of the folder moves to the new name; the name is trimmed.
- [ ] The same name, or dismissing the dialog, changes nothing.
- [ ] Renaming Work to the name of the folder Clients is refused with **This folder already exists**; the two
      folders are not merged.

### `connection.remove-folder` — Remove a folder, keeping its connections

Takes a folder away and leaves its connections with no folder.

- **Kind**: Operation
- **Engine**: Any
- **Function**: `src/features/connection/remove-folder.ts › plan(context, answers)`
- **Entry points**: **Remove folder (keep connections)** in the menu of a folder (`@home`, `@connection-switcher`).
- **Plan**: `remove the folder <folder>`, an app step that takes the folder off every connection in it.
- **Danger**: None: no confirmation, no connection is removed.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone from the undo history; move the connections back with `connection.move-to-folder`.
- **Uses**: `connection.folder-menu`.
- **Ported from**: connection.remove-folder (`src/connections.ts › ConnectionManager.renameFolder`,
  `src/extension.ts`).

Acceptance:

- [ ] The folder disappears and its connections are shown with those that have no folder, with their secrets and
      settings.
- [ ] Connected connections of the folder stay connected, and their open tabs stay open.

### `connection.remove` — Remove a connection

Removes a saved connection, with its secrets and everything Datardo keeps for it.

- **Kind**: Operation
- **Engine**: Any
- **Function**: `src/features/connection/remove.ts › plan(context, answers)`
- **Entry points**: **Remove connection** in the menu of a connection (`@home`, `@connection-switcher`,
  `@connection-island`); Go to (**Remove connection**), for the current connection.
- **Reads**: how many operations of the undo history, how many queries saved *for me* and how many pins belong to
  the connection; whether Datardo remembers anything else of it (its file of `state/` in the data folder); for a
  Redis connection, which MongoDB connections publish through it; which of its tabs have unsaved changes.
- **Asks**: after the confirmation, and before anything is removed, the question of `tab.close` for each tab of the
  connection with unsaved changes, as `tab.connection-gone` says; **Cancel** there keeps the connection, all its
  data and every tab.
- **Plan**: `disconnect <name>` when it is connected; `delete the secrets of <name>`; `delete the <n> operations of
  <name> from the undo history` (`undo.forget-connection`); `delete the <n> queries saved for me on <name>`;
  `delete the <n> pins of <name>`; `delete what Datardo remembers of <name>`, which is its file of `state/` (the
  recent queries, the columns' layouts, the console's history, the targets of the playgrounds, the last folders
  used); `delete the <n> formatting rules of <name>`, those of its section **Connection \<name\>**, of its databases
  and of its collections (`table.format-scopes`); for a Redis connection, `unlink <MongoDB connection> from <name>`
  for each one that publishes through it; `remove the connection <name>`. All app steps; a step with nothing to
  delete is left out.
- **Danger**: Confirm: **Remove connection "<name>"?**, with the detail **Deleted with it:** and the list of what is,
  each on its line and only when there is some: **its connection string and passwords**, **<n> queries saved for me**,
  **<n> pins**, **<n> operations of the undo history**, **<n> formatting rules**, **what Datardo remembers of it
  (recent queries, the layout of the columns, the history of the console)**; then **This cannot be undone. The files
  of its queries folder, its backups, its exports and its scheduled tasks are kept.** and, for a Redis connection that
  others publish through, **<names> will no longer publish their writes for redis-oplog.**; the button is **Remove**.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone: the secrets and Datardo's data of the connection are deleted; the confirmation says
  so.
- **After**: every tab of the connection closes, of every kind, its connection form included, and its group goes;
  the closed tabs are not offered again, and their places leave **Back**, **Forward** and the recent places, as
  `tab.connection-gone` says. When it was the current connection, the explorer shows the connection of the tab that
  becomes active, or none.
- **Commands**: `connection.remove`.
- **Uses**: `connection.disconnect`, `connection.secrets`, `connection.unlink-redis`, `connection.menu`,
  `tab.connection-gone`, `tab.close`, `undo.forget-connection`, `saved-query.save`, `nav.pin`, `task.run`,
  `table.format-scopes`, `runner.confirm`.
- **Ported from**: connection.remove (`src/extension.ts`, `src/connections.ts › ConnectionManager.remove`,
  `src/history.ts › UndoHistory.clear`, `src/redisOplog.ts`). Mongoster left the state it kept for the
  connection's collections behind, and its collection tabs open; Datardo deletes the one and closes the others. It
  also left the formatting rules of the connection (Mongoster 0.10.0); Datardo deletes them.
- **Differs**: (M41) there are no formatting rules to delete.

Acceptance:

- [ ] Only **Remove** removes; dismissing the confirmation keeps everything.
- [ ] The confirmation of a connection with 12 queries saved for me, no pin and 3 operations in the undo history
      lists **its connection string and passwords**, **12 queries saved for me**, **3 operations of the undo
      history** and **what Datardo remembers of it (recent queries, the layout of the columns, the history of the
      console)**, and no line about pins.
- [ ] The order is: the confirmation; then, for a document tab of the connection with unsaved changes, the question
      of `tab.close`; then the steps. **Cancel** on that question leaves the connection saved, connected as it was,
      with all its data and all its tabs.
- [ ] The client and the SSH tunnel are closed before the secrets are deleted.
- [ ] Afterwards the secret storage has no value of the connection; the data folder has no file of `state/` and no
      file of `saved-queries/` named after its id; the pins hold none of its items; the undo history lists none of
      its operations and has none of their files.
- [ ] A connection with 2 rules in its section **Connection Local** and 3 rules of its collections lists **5
      formatting rules**; afterwards `formatting.json` holds none of them, and the rules of **Everywhere** stay.
      (differs)
- [ ] Every tab of the connection closes, the collection tabs, keys tabs, document tabs and playground tabs
      included, and a page that compares it with another connection.
- [ ] Kept: the files of its queries folder, the backups and the exports it wrote, the known hosts, and its
      scheduled tasks, whose next run fails with **The connection was removed** (`task.run`).
- [ ] Removing the Redis connection Cache local, which Local and Staging publish through, says **Local, Staging will
      no longer publish their writes for redis-oplog.**; afterwards neither has a linked connection and their writes
      are not published.
- [ ] Removing a MongoDB connection that has a linked connection keeps the Redis connection and everything of it.
- [ ] The data of the other connections is untouched.

## Read-only connections

### `connection.read-only` — Make a connection read-only

Turns on the safeguard that makes Datardo refuse every write through the connection.

- **Kind**: Operation
- **Engine**: Any
- **Function**: `src/features/connection/read-only.ts › plan(context, answers)`
- **Entry points**: **Make read-only** in the menu of a connection (`@home`, `@connection-switcher`,
  `@connection-island`); **Read-only** in the connection form, saved with it (`@form`); Go to (**Make read-only**),
  for the current connection.
- **Offered when**: the connection is not read-only.
- **Plan**: `make <name> read-only`, an app step.
- **Danger**: None: no confirmation, it only takes rights away.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone from the undo history; `connection.allow-changes` turns it off.
- **After**: the open tabs of the connection become read-only at once; the status line shows **Read-only** while the
  connection is the current one.
- **Commands**: `connection.read-only`.
- **Uses**: `connection.allow-changes`, `connection.menu`. The writes it stops are, for MongoDB, those of
  `document.inline-edit`, `document.insert`, `document.delete`, `document.update-many`, `document.delete-many`,
  `document.restore-version`, `manage.create-collection`, `manage.drop-collection`, `manage.drop-database`,
  `manage.edit-view`, `manage.edit-validation`, `index.create`, `transfer.import`, `transfer.generate`,
  `transfer.copy-collection`, `backup.restore`, `structure.apply`, `undo.revert`, the save of a document tab, the
  column actions, editing and dropping an index, the copies of a comparison, the uploads and deletions of GridFS,
  the writes of a playground and a pipeline with `$out` or `$merge`; for Redis, those of `key.delete`, every other
  write to a key or to its value, and the commands that write typed in a console (`console.run`).
- **Ported from**: connection.read-only (`src/extension.ts`, `src/connections.ts › ConnectionManager.update`,
  `src/tree.ts › ConnectionNode`, `src/collectionPanel.ts › readOnlyMessage`).

Acceptance:

- [ ] The card, the line in the connection switcher and the connection island show a lock and **read-only** after
      the name; the Overview page says **Read-only: Datardo refuses writes through this connection**; the menu offers
      **Allow changes** instead of **Make read-only**.
- [ ] Every open tab of the connection becomes read-only without being reopened; a write from a collection tab is
      refused with **The connection <name> is read-only.** (`/read-only`).
- [ ] A document tab or a definition already open can no longer be saved: `Ctrl+S` is refused with the same text.
- [ ] Nothing is recorded in or undone from the undo history through the connection.
- [ ] MongoDB: queries, aggregations without `$out` or `$merge`, schema, explain and export stay available. Redis:
      scanning, reading values, `SUBSCRIBE` and the commands that only read stay available.
- [ ] A Redis connection that is read-only still receives the events MongoDB connections publish through it for
      redis-oplog: `PUBLISH` changes no key.
- [ ] Datardo's own export keeps the flag; importing over a read-only connection with **Replace** keeps it read-only
      (`connection.import`).
- [ ] The runner refuses a step that writes through the connection even when a feature did not
      (`runner.refuse`).

### `connection.allow-changes` — Allow changes through a read-only connection

Turns the read-only safeguard off, after a confirmation.

- **Kind**: Operation
- **Engine**: Any
- **Function**: `src/features/connection/allow-changes.ts › plan(context, answers)`
- **Entry points**: **Allow changes** in the menu of a read-only connection (`@home`, `@connection-switcher`,
  `@connection-island`); saving the connection form with **Read-only** turned off (`@form`); Go to (**Allow
  changes**), for the current connection.
- **Offered when**: the connection is read-only.
- **Plan**: `allow changes through <name>`, an app step.
- **Danger**: Confirm: **Allow changes through <name>?**, with the detail **Documents, indexes, collections and
  databases can then be modified from Datardo.** for MongoDB and **Keys and their values can then be modified from
  Datardo.** for Redis; the button is **Allow changes**.
- **Read-only**: Allowed: it is how the safeguard is turned off; it writes nothing to a deployment.
- **Undo**: Cannot be undone from the undo history; `connection.read-only` turns it on again.
- **After**: the open tabs of the connection allow writes at once; **Read-only** leaves the status line.
- **Commands**: `connection.allow-changes`.
- **Uses**: `connection.read-only`, `connection.menu`, `runner.confirm`.
- **Ported from**: connection.allow-changes (`src/extension.ts`, `src/connections.ts › ConnectionManager.update`).

Acceptance:

- [ ] Only **Allow changes** turns the safeguard off; dismissing the confirmation keeps the connection read-only.
- [ ] Saving the form of a read-only connection with **Read-only** off asks the same confirmation; dismissing it
      saves nothing and leaves the form open.
- [ ] The lock and **read-only** are gone from the card, the connection switcher and the connection island; the open
      tabs offer their writes again, a document tab included.
- [ ] A view stays read-only whatever the connection is.
- [ ] The MCP server writes nothing through the connection before or after.

## The redis-oplog link

### `connection.link-redis` — Link a Redis connection to a MongoDB connection

Chooses the saved Redis connection that receives the writes of a MongoDB connection for redis-oplog. Which databases
and collections publish, and how, is `oplog.publish`.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/connection/link-redis.ts › plan(context, answers)`
- **Entry points**: **Redis connection** in the redis-oplog section of the connection form, saved with it
  (`@form`); **Link a Redis connection…** in the menu of a MongoDB connection (`@home`, `@connection-switcher`,
  `@connection-island`); Go to (**Link a Redis connection…**), for the current connection.
- **Offered when**: the connection is a MongoDB one.
- **Asks**: a list to pick from titled **Publish the writes of <name> through**, with every saved Redis connection
  by folder, the linked one described **current**, and **Add Redis connection…** (`connection.add`).
- **Plan**: `link <name> to <Redis connection>`, an app step.
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment; a read-only MongoDB connection publishes
  nothing, since nothing is written through it.
- **Undo**: Cannot be undone from the undo history; `connection.unlink-redis` removes the link.
- **After**: the connection island shows the linked connection under the current one, with its color, its name and
  **Redis**; a click on it makes it the current connection (`nav.switch-connection`). From then on the writes to
  documents through the MongoDB connection are published (`oplog.publish`).
- **Commands**: `connection.link-redis`.
- **Uses**: `connection.unlink-redis`, `connection.add`, `connection.form`, `connection.menu`, `oplog.publish`,
  `nav.switch-connection`, `runner.ask`.
- **Ported from**: the Redis address of the redis-oplog section of connection.form and connection.save
  (`src/connectionEditor.ts › parseRedis`, `src/connections.ts › ConnectionManager.setRedisOplog`). In Datardo the
  address is a saved Redis connection, with its own TLS settings and SSH tunnel.

Acceptance:

- [ ] The list offers only Redis connections; with none saved it offers only **Add Redis connection…**, which opens
      the Redis form, and nothing is linked until the question is answered again.
- [ ] A MongoDB connection has at most one linked connection; choosing another replaces the link.
- [ ] Several MongoDB connections can be linked to the same Redis connection.
- [ ] The link holds the id of the Redis connection: renaming it, moving it or changing its address keeps the link.
- [ ] Linking does not connect either connection. Publishing opens the Redis connection with its saved settings
      when the first write is published, also when it is not shown as connected.
- [ ] Linking from the menu publishes every database and collection; the fields of the form that narrow it are
      those of `oplog.publish`.
- [ ] The linked connection is shown under a MongoDB connection only: a Redis connection shows none.
- [ ] `connection.test` of the MongoDB form also sends `PING` through the linked connection.

### `connection.unlink-redis` — Remove the link to a Redis connection

Stops publishing the writes of a MongoDB connection for redis-oplog, keeping both connections.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/connection/unlink-redis.ts › plan(context, answers)`
- **Entry points**: **Unlink <name of the Redis connection>** in the menu of a MongoDB connection that has a linked
  one (`@home`, `@connection-switcher`, `@connection-island`); turning the redis-oplog section of the connection form
  off and saving (`@form`); removing the linked connection (`connection.remove`); Go to (**Unlink the Redis
  connection**), for the current connection.
- **Offered when**: the MongoDB connection has a linked connection.
- **Plan**: `unlink <name> from <Redis connection>`, an app step.
- **Danger**: None: no confirmation; no data is lost.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone from the undo history; `connection.link-redis` links it again.
- **After**: the connection island no longer shows a linked connection; a notification says **Writes through <name>
  are no longer published for redis-oplog.**
- **Commands**: `connection.unlink-redis`.
- **Uses**: `connection.link-redis`, `connection.remove`, `connection.menu`, `oplog.publish`, `runner.notify`.
- **Ported from**: turning the redis-oplog section off in connection.save (`src/connections.ts ›
  ConnectionManager.setRedisOplog`).

Acceptance:

- [ ] After unlinking, a write to a document through the MongoDB connection publishes nothing.
- [ ] The Redis connection, its secrets and its open tabs are untouched.
- [ ] What the form says about what is published (channel prefix, namespaces, databases and collections) is kept
      with the MongoDB connection, and used again when a connection is linked.
- [ ] Events already handed to the Redis connection when the link is removed are still sent; none is sent after.

## Secrets

### `connection.secrets` — Keep the secrets of a connection

Where the connection string and the passwords of a connection are kept, when they are deleted, and where they can
and cannot go.

- **Kind**: Operation
- **Engine**: Any
- **Function**: `src/features/connection/secrets.ts › plan(context, answers)`
- **Entry points**: every card of this area that saves, reads or removes a connection.
- **Plan**: `save the secrets of <name>` or `delete the secrets of <name>`: app steps on the secret storage, a file
  of Datardo's data folder whose values are encrypted with a key held by the system's keychain (Electron's
  `safeStorage`).
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone: a replaced or deleted secret is not kept anywhere.
- **Uses**: `connection.save`, `connection.duplicate`, `connection.remove`, `connection.import`,
  `connection.export`, `connection.string-secrets`. The access token of the MCP server is kept in the same storage
  (`mcp.server`).
- **Ported from**: connection.secrets (`src/connections.ts › ConnectionManager`, `src/transport.ts`,
  `src/standalone/vscode/storage.ts`). The colors of databases and collections and the exclusions from searches
  are kept on the connection as Mongoster 0.9.0 keeps them (`src/shared/collectionColors.ts`,
  `src/shared/exclusions.ts`).
- **Differs**: (M39) the saved connections keep nothing excluded from searches.

What is kept where:

- In the secret storage, under the id of the connection: the connection string with its password and its secret
  options; the key password of the client certificate; the password of the SSH tunnel; the passphrase of the SSH
  private key. For Redis the password is the one of the connection string.
- In Datardo's saved connections, which are not secret: the id, the name, the engine, the folder, the color (a
  preset or a custom `#rrggbb`: `connection.color-presets`), the colors of its databases and of its collections,
  views and buckets (`tree.color-of`), whether it is excluded from searches and which of its databases and
  collections are (`tree.excluded`), read-only, whether the undo history is kept, the queries folder, the paths of
  the certificate and key files, the two TLS exceptions, the SSH server, port, user and kind of authentication, the
  id of the linked connection and what `oplog.publish` keeps about what is published. The known hosts are kept
  apart, and are not secret.

Acceptance:

- [ ] Deleted: the key password, the SSH password and the passphrase when the form is saved with TLS and SSH off;
      everything when the connection is removed. The connection string is replaced, never left behind, when it is
      changed.
- [ ] Each value is encrypted with `safeStorage.encryptString` before it is written; the file is written through a
      temporary file that then takes its place. A value that cannot be decrypted reads as missing, and connecting
      then says **Connection string not found. Remove and re-add this connection.**
- [ ] No secret is ever written in clear text. When the system offers no encryption
      (`safeStorage.isEncryptionAvailable()` is false, or its backend on Linux is `basic_text`), secrets are kept in
      memory until Datardo quits and are not written; the Home page and the connection form say **Passwords are not
      saved on this computer: no keychain is available.**; at the next start, connecting says **The secrets of
      <name> were not saved: open its form and enter them again.** (`/no-secrets`, from `connection.connect`).
- [ ] No secret goes to the window process: the form gets which secrets are saved, never their values; an empty
      field means *keep the saved one*, for the password of the connection string, the key password, the SSH
      password and the passphrase.
- [ ] No log gets a secret: the Log and Datardo's own output write no connection string with a password, no
      password and no passphrase; a command with a password is written with `***` in its place; an error of a
      driver that quotes the connection string is shown and logged without its secrets
      (`connection.string-secrets`).
- [ ] The confirmation of a plan never shows a secret in its steps.
- [ ] The AI gets no secret: `list_connections` returns the name, the id, the engine, the folder, `readOnly` and
      `connected`.
- [ ] A file exported **Without passwords** holds no secret of any connection (`connection.export`).
- [ ] The settings file holds no secret.

## Import and export

### `connection.import` — Import connections

Adds connections from a MongoDB Compass export, a Datardo or Mongoster export, or a list of connection strings of
either engine, from a file or the clipboard.

- **Kind**: Operation
- **Engine**: Any
- **Function**: `src/features/connection/import.ts › plan(context, answers)`
- **Entry points**: **Import connections…** on the Home page and in the menu of a folder (`@home`,
  `@connection-switcher`); Go to (**Import connections…**).
- **Asks**: 1. **Import connections**, with the question **Where are the connections?**: **From a file…** (the
  system's file dialog with the button **Import**, filtered to `json`, `txt`, `text`, `list`, `csv`, or all files) or
  **From the clipboard**; 2. for a file with encrypted passwords, the passphrase, in a password field titled **Import
  connections: Passphrase**, with the prompt **The passwords in this file are encrypted: enter the passphrase used
  to export it. Leave it empty to import without the passwords.**; after a wrong one, **Wrong passphrase: try again,
  or leave it empty to import without the passwords.**; 3. the connections, in a list to pick several from titled
  **Import connections from <file name or "the clipboard">**, with the placeholder **<Compass export | Datardo
  export | Mongoster export | list>: <n> connection(s)[ (<n> line(s)/entries were not a connection)]. Choose those
  to import**; 4. when names are taken, **A connection named <name> already exists.** or **<n> connections with the
  same name already exist.**, with up to 10 names, the detail **Skip: leave them out. Replace: the existing
  connections take the connection string and the settings of the imported ones. Keep both: the imported ones are
  added with a number after the name. Replace cannot be undone.** and the buttons **Skip**, **Replace** and **Keep
  both**; 5. unless it was started on a folder, **Import connections: Folder**, with the placeholder **Where to put
  the imported connections**: **Folders from the file** (only when a chosen connection has a folder), **No folder**,
  the folders in use, **New folder…**.
- **Reads**: the file or the clipboard, in the main process; the saved connection strings of the connections with the
  same names, to tell which are the same.
- **Plan**: for each connection added, `save the connection <name>`; for each one replaced, `replace the connection
  <name>`, after `disconnect <name>` when it is connected; for a Redis connection added to carry a redis-oplog link,
  `save the connection <host>:<port>` and `link <name> to <host>:<port>`. All app steps.
- **Danger**: None beyond the question about the names taken, where **Replace** is chosen and which says that it
  cannot be undone.
- **Read-only**: Allowed, because it writes nothing to a deployment. **Replace** never turns a read-only connection
  writable.
- **Undo**: Cannot be undone: **Replace** overwrites the connection string, the secrets and the settings.
- **After**: a notification says **<n> connection(s) imported, <n> connection(s) replaced, <n> skipped.** (or
  **Nothing imported.**), followed, when some came without a password, by **Without a password: <up to 5 names>; set
  it with Edit connection….** While the passwords are decrypted, the status line shows **Decrypting the
  passwords…**.
- **Refuses**: **No connections found in <source>[ (…was not a connection)].** (`/nothing-found`); any failure as
  **Could not import the connections: <reason>**, with the reasons of `connection.read-file`.
- **Commands**: `connection.import`.
- **Uses**: `connection.read-file`, `connection.read-list`, `connection.read-compass`, `connection.encryption`,
  `connection.secrets`, `connection.read-only`, `connection.link-redis`, `connection.folder-menu`,
  `connection.string-secrets`, `connection.redis-string`, `tree.color-of`, `tree.excluded`, `runner.ask`,
  `runner.notify`.
- **Ported from**: connection.import (`src/connectionsTransfer.ts › importConnections`, `readSource`, `parse`,
  `askFolder`, `summary`; `src/shared/connectionsFile.ts`). Lists with Redis lines, Datardo's own format and the
  Redis connection made for a redis-oplog link are new in Datardo. What the detail says beyond the host, the colors
  of databases and collections and the exclusions come from connection.import of Mongoster 0.9.0
  (`src/shared/connectionsFile.ts › securityNotes`, `urlHost`; `src/connectionsTransfer.ts › summary`, and the
  **Replace** of `importConnections`). The queries folder in the detail is new in Datardo, which keeps one per
  connection.
- **Differs**: (M37) the detail of an item names only **TLS**, **SSH <user>@<host>** and **redis-oplog**: not the
  invalid certificates and host names allowed, a proxy, the SSH port, the host redis-oplog publishes to, the undo
  history left off or the queries folder; (M39) it says nothing of the exclusions from searches, and **Replace**
  carries none.

Acceptance:

- [ ] Each item shows the name, the engine, the host and, for a name already used, **✓ already exists**, or **✓
      already exists (same connection string)** when the saved connection string is the same; its detail lists the
      folder, the color, **<n> database color(s)**, **<n> collection color(s)**, **excluded from searches**, **<n>
      database(s) or collection(s) excluded from searches**, **read-only**, what the connection does beyond its
      host (below) and the notes (**no password**, **no SSH password**, **passwords not imported (encrypted)**,
      **In-Use Encryption settings not imported**…). (differs)
- [ ] What the connection does beyond its host, since the file may come from someone else, in this order and each
      only when it applies: **TLS**; **invalid certificates allowed** and **invalid host names allowed**, from the
      TLS settings or from the options `tlsInsecure`, `tlsAllowInvalidCertificates` and `tlsAllowInvalidHostnames`
      left in the connection string; **proxy <host>[:<port>]**, from `proxyHost` and `proxyPort`; **SSH
      <user>@<host>[:<port>]**, the port only when it is not 22; **redis-oplog → <host>:<port>**, the Redis server
      the writes would be published to; **no undo history**; **queries folder <path>**. (differs)
- [ ] An entry `Prod` of a Datardo file with `"uri":
      "mongodb://ada@db1/app?proxyHost=socks.example.com&proxyPort=1080&tlsInsecure=true"`, `"ssh": { "host": "jump",
      "port": 2200, "username": "me", "auth": "password" }`, `"noHistory": true`, `"queriesFolder": "/home/eve/.ssh"`
      and a `redisOplog` linked to an entry with `"uri": "rediss://cache.example.com:6380"` has the detail `MongoDB ·
      db1 · invalid certificates allowed · invalid host names allowed · proxy socks.example.com:1080 · SSH
      me@jump:2200 · redis-oplog → cache.example.com:6380 · no undo history · queries folder /home/eve/.ssh · no
      password · no SSH password`. (differs)
- [ ] No password is ever part of the detail: a Mongoster file's Redis address `redis://:s3cret@cache:6379/0` shows
      as **redis-oplog → cache:6379**, and one whose host cannot be read as **redis-oplog → a host that could not be
      read**. (differs)
- [ ] A Datardo file entry with `"color": "#1E90FF"`, `"databaseColors": { "shop": "teal" }`,
      `"collectionColors": { "shop.orders": "none", "shop.logs": "#12abef" }`, `"excluded": true` and
      `"exclusions": ["archive"]` has in its detail `#1e90ff`, **1 database color**, **2 collection colors**,
      **excluded from searches** and **1 database or collection excluded from searches**, and is imported with
      them. (differs)
- [ ] Connections already there with the same name and the same connection string start unchecked; all others start
      checked.
- [ ] **Skip** leaves out the chosen connections whose name is taken; **Keep both** adds them as `name (2)`, `name
      (3)`…; dismissing the question imports nothing.
- [ ] **Replace** gives the existing connection the imported connection string, TLS settings, SSH tunnel, redis-oplog
      settings and color, and the chosen folder; it stays read-only if it was, and becomes read-only if the imported
      one is. A file without passwords therefore replaces the saved password with none.
- [ ] With **Replace**, the colors of databases, the colors of collections and the databases and collections
      excluded from searches are replaced by the file's, each kept when the file has none (a Compass file or a list
      never has them); the connection stays excluded from searches if it was, and becomes excluded if the imported
      one is. (differs)
- [ ] A connection is never replaced by one of the other engine: with **Replace**, an imported Redis connection
      whose name belongs to a MongoDB connection is added as `name (2)`.
- [ ] Started on a folder, every imported connection goes to that folder without asking; **Folders from the file**
      keeps each connection's own folder; **New folder…** asks for a name (**Enter a name** when empty).
- [ ] An empty passphrase imports without the encrypted passwords; dismissing the passphrase imports nothing.
- [ ] A MongoDB connection of a Mongoster export with a Redis address (`redisOplog.url`) is linked to the saved
      Redis connection with the same host, port and user name; when there is none, a Redis connection named
      `<host>:<port>` is added in the same folder, with that address and its password, and linked.
- [ ] A list with the lines `Shop = mongodb://db1/shop` and `Cache = rediss://:pw@cache:6380/1` imports one MongoDB
      connection and one Redis connection with TLS on and the database 1.
- [ ] A replaced connection's open tabs take its new name and color at once, and its client is closed.

### `connection.export` — Export connections

Writes the chosen connections to a file for Datardo, for Compass, or as a list of connection strings, with or
without their passwords.

- **Kind**: Operation
- **Engine**: Any
- **Function**: `src/features/connection/export.ts › plan(context, answers)`
- **Entry points**: **Export connections…** on the Home page and in the menu of a folder (`@home`,
  `@connection-switcher`); Go to (**Export connections…**).
- **Asks**: 1. **Export connections**, with the placeholder **Choose the connections to export**: every connection,
  sorted by folder then name, described by engine, folder, **SSH**, **TLS**, **redis-oplog**, **read-only**; all
  checked, or on a folder only its own; 2. **Export connections: Format**: **Datardo (JSON)**, **MongoDB Compass
  (JSON)** (only when a MongoDB connection is chosen), **Connection strings (text)**; 3. **Export connections:
  Passwords**, with the placeholder **Include the passwords?**: **Without passwords** (first), **With passwords,
  encrypted with a passphrase** (not for the list), **With passwords in clear text**; 4. for encryption, the
  passphrase twice (**Export connections: Passphrase (1/2)**, refused under 8 characters with **At least 8
  characters**; **(2/2)**, with the prompt **The same passphrase again**, refused with **The passphrases don't
  match**); 5. where to save, in the system's file dialog with the button **Export**, proposing
  `datardo-connections.json`, `compass-connections.json` or `connections.txt` in the home folder.
- **Reads**: each chosen connection's connection string and secrets in the secret storage, in the main process.
- **Plan**: `write <path of the file>`, a file step whose content `connection.write-file` gives.
- **Danger**: Confirm, for clear text only: **Export the passwords in clear text?**, with the detail **The file will
  contain the passwords of the connection strings and SSH as they are: whoever reads it can connect. Keep it safe,
  or export with a passphrase instead.** and the button **Export with passwords**. None otherwise.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Nothing to undo in Datardo; the file is written where the user chose, replacing a file of that name.
- **After**: a notification says **<n> connection(s) exported to <file name>.**, followed by **Note: <what the
  format left out>.** when something was left out. While it works, the status line shows **Encrypting the
  passwords…** or **Exporting the connections…**.
- **Refuses**: **There are no connections to export.** (`/no-connections`); any failure as **Could not export the
  connections: <reason>**.
- **Commands**: `connection.export`.
- **Uses**: `connection.write-file`, `connection.encryption`, `connection.string-secrets`, `connection.secrets`,
  `connection.folder-menu`, `runner.ask`, `runner.confirm`, `runner.notify`.
- **Ported from**: connection.export (`src/connectionsTransfer.ts › exportConnections`, `portable`, `askPassphrase`;
  `src/shared/connectionsFile.ts › serializeConnections`, `Encrypter`). Datardo's own format takes the place of
  Mongoster's. The colors of databases and collections, the custom colors and the exclusions from searches, with
  their notes, come from connection.export of Mongoster 0.9.0 (`src/connectionsTransfer.ts › portable`,
  `src/shared/connectionsFile.ts › serializeConnections`).
- **Differs**: (M39) it writes no exclusions from searches, and no note says that the other formats left them out.

Acceptance:

- [ ] Dismissing any question writes nothing.
- [ ] **Without passwords** is the first choice and is offered for every format; the list offers no encryption.
- [ ] A file exported **Without passwords** contains no password, passphrase or token of any connection, including
      those written as options of a connection string (`proxyPassword`, `tlsCertificateKeyFilePassword`,
      `AWS_SESSION_TOKEN`); one exported with a passphrase contains none in clear text.
- [ ] Connections whose connection string is missing from the secret storage are left out of the file and of the
      count.
- [ ] In Datardo's format, the linked Redis connection of a chosen MongoDB connection is written too, also when it
      was not chosen, with the note **<n> linked Redis connection(s) was/were added**.
- [ ] The Compass format holds only the MongoDB connections, with the note **<n> Redis connection(s) was/were left
      out (Compass doesn't have them)**.
- [ ] The other notes read, as they apply: **folders, read-only and redis-oplog were left out (Compass doesn't have
      them)**, **Compass can't use the SSH agent: those tunnels have no password or key**, **<n> SSH tunnel(s)
      was/were left out (a connection string can't hold one)**, **folders, colors, read-only and redis-oplog were
      left out**, **the TLS certificate files of <n> Redis connection(s) were left out (a redis:// connection string
      can't hold them)**.
- [ ] Datardo's format carries the color of each connection, a custom `#rrggbb` included, the colors of its
      databases and collections, and what is excluded from searches; importing the file gives them back
      (`connection.write-file`). (differs)
- [ ] The Compass format adds, as they apply, the notes **colors of databases and collections were left out (Compass
      doesn't have them)** and **exclusions from searches were left out (Compass doesn't have them)**; the list
      counts the colors of databases and collections in **folders, colors, read-only and redis-oplog were left out**
      and adds **exclusions from searches were left out**. (differs)
- [ ] No secret passes through the window process: the questions carry names and choices, and the main process
      reads the secrets and writes the file.

## Formats of the files

### `connection.read-file` — Read a connections file

Tells the format of the text to import, and reads Datardo's and Mongoster's own exports.

- **Kind**: Derivation
- **Engine**: Any
- **Function**: `src/features/connection/read-file.ts › connectionsFromText(text, passphrase)`
- **Uses**: `connection.read-list`, `connection.read-compass`, `connection.encryption`,
  `connection.color-from-compass`, `connection.color-presets`, `connection.string-secrets`,
  `connection.redis-string`, `tree.color-of`, `tree.excluded`.
- **Ported from**: connection.read-file (`src/shared/connectionsFile.ts › parseConnections`, `detectFormat`,
  `isEncrypted`, `fromMongoster`, `plain`, `parseJson`, `decryptSecrets`, `missingSecrets`, `lacksPassword`,
  `withPassword`, `colorFrom`). The format **Datardo Connections**, the engine of an entry and the Redis entries
  are new in Datardo. The custom colors, `databaseColors`, `collectionColors`, `excluded` and `exclusions` come
  from connection.read-file of Mongoster 0.9.0 (`src/shared/connectionsFile.ts › fromMongoster`,
  `src/shared/collectionColors.ts › readDatabaseColors`, `readCollectionColors`, `src/shared/exclusions.ts ›
  readExclusions`); the colors of Redis databases are new in Datardo.
- **Differs**: (M39) `excluded` and `exclusions` are not read.

Rules:

- Input: the text of a file or of the clipboard, and the passphrase when there is one. Output: the format
  (`compass`, `datardo`, `mongoster`, `list`), the connections (name, engine, connection string, folder, color, the
  colors of databases and of collections, whether it is excluded from searches and what of it is, read-only,
  whether the undo history is kept, queries folder, TLS, SSH, the redis-oplog link and settings, notes) and how many
  entries were skipped.
- A text that does not start with `{` (after a byte order mark and spaces) is a list (`connection.read-list`).
- JSON whose `type` is `Compass Connections` is Compass's (`connection.read-compass`), `Datardo Connections`
  Datardo's, `Mongoster Connections` Mongoster's; another JSON is refused with **This JSON file is neither a Compass
  export ("Compass Connections") nor a Datardo or Mongoster export**, invalid JSON with **Not a valid JSON file:
  <reason>**.
- Canonical Extended JSON numbers (`{ "$numberInt": "1" }`) are read as numbers, `$date` and `$oid` as their values.
- `version` must be 1 (**Unsupported version of the file: <version> (expected 1)**); `connections` must be an array
  (**The file has no list of connections**).
- A file is encrypted when an entry has a non-empty string `connectionSecrets` (Compass) or `secrets` (Datardo,
  Mongoster).
- The engine of an entry is its `engine`, `mongodb` or `redis`; an entry without one, and every entry of a Mongoster
  file, is MongoDB. Another value skips the entry.
- An entry that is not an object, or whose `uri` is not a connection string of its engine with a host
  (`mongodb://` or `mongodb+srv://`; `redis://` or `rediss://`), is skipped and counted.
- An entry gives: the name (trimmed; the host part of the connection string when empty), the folder (trimmed), the
  color (`connection.color-from-compass`, which keeps a custom color in these two formats), `databaseColors` and,
  on a MongoDB entry, `collectionColors` (below), `excluded` only when `true` and, on a MongoDB entry, `exclusions`
  (below), `readOnly` and `noHistory` only when `true`, `queriesFolder`; `tls` with
  `caFile`, `certificateKeyFile`, the key password only with a certificate file, the two `allowInvalid…` only when
  `true`; `ssh` only with a host, `auth` `privateKey` or `agent` or else `password`, port 22 left out, the password
  for password authentication, the key file and passphrase for a key. A Redis entry whose `uri` starts with
  `rediss://` has TLS on, also without `tls`.
- `databaseColors` and `collectionColors`, objects, keep only their valid entries: a key that names a database
  (`databaseColors`) or a collection as `database.collection` (`collectionColors`), as `tree.color-of` writes them,
  and a value that `readColor` reads (`connection.color-presets`), or `none`. An object left empty, and a value that
  is not an object, give nothing.
- `exclusions`, an array, keeps only the texts that are a database's name or a `database.collection`, as
  `tree.excluded` writes them, sorted and without repeats; left empty, or not an array, it gives nothing.
- `redisOplog`, on a MongoDB entry only, with `prefix`, and `namespaces` and `scope` as trimmed non-empty strings.
  In a Datardo file it is read only with a `connection`, the `id` of a Redis entry of the same file; when no entry
  has that id, the link is left out with the note **redis-oplog link not imported: its Redis connection is not in
  the file**. In a Mongoster file it is read only with a `url`, a Redis connection string, from which
  `connection.import` makes or finds a Redis connection.
- Decrypted secrets (`password`, `tlsCertificateKeyFilePassword`, `proxyPassword`, `awsSessionToken`,
  `sshPassword`, `sshPassphrase`, and `redisPassword` in a Mongoster file) win over the same values in clear; they
  go back into the connection string (`connection.string-secrets`).
- Encrypted secrets without a passphrase: left out, with the note **passwords not imported (encrypted)** and no other
  note about missing passwords. A wrong passphrase fails the whole file (**Wrong passphrase, or the file is
  damaged**).
- Notes about what is missing: **no password** when a MongoDB connection string has a user without a password and
  its `authMechanism` is not `MONGODB-X509`, `GSSAPI`, `MONGODB-AWS` or `MONGODB-OIDC`, or when a Redis connection
  string has a user name without a password; **no SSH password** for password authentication without one.

Examples:

- `{ "type": "Something" }` → refused, **…neither a Compass export…**.
- A Mongoster file exported **Without passwords** with `uri: "mongodb://ada@db1:27017/app"` and an SSH tunnel by
  password → one MongoDB connection, `uri` as is, an empty SSH password, notes **no password**, **no SSH password**.
- The same file exported with the passphrase `right`, read without a passphrase → `uri:
  "mongodb://ada@db1:27017,db2:27017/app?replicaSet=rs0"`, Redis address `redis://cache:6379/0`, note **passwords
  not imported (encrypted)**.
- `mongodb://CN=me@h/?authMechanism=MONGODB-X509` → no **no password** note.
- A Datardo file with the entries `{ "id": "a1", "name": "Local", "engine": "mongodb", "uri": "mongodb://db1/shop",
  "redisOplog": { "connection": "c7", "prefix": "app:" } }` and `{ "id": "c7", "name": "Cache local", "engine":
  "redis", "uri": "rediss://cache:6380/1" }` → Local, MongoDB, linked to Cache local with the prefix `app:`; Cache
  local, Redis, TLS on, database 1.
- A Datardo entry `{ "name": "Odd", "engine": "postgres", "uri": "postgres://h" }` → skipped (1).
- A Datardo entry with `"engine": "redis"` and `"uri": "mongodb://h"` → skipped (1).
- A Datardo or Mongoster entry `{ "name": "Shop", "uri": "mongodb://db1/shop", "color": "#1E90FF",
  "databaseColors": { "shop": "teal", "a.b": "red" }, "collectionColors": { "shop.orders": "none",
  "shop.fs.files": "pink", "nodot": "red", "shop.logs": "chartreuse" }, "excluded": true, "exclusions":
  ["shop.logs", "archive", "archive", 7] }` → color `#1e90ff`, database colors `{ "shop": "teal" }`, collection
  colors `{ "shop.orders": "none", "shop.fs.files": "pink" }`, excluded, exclusions `["archive", "shop.logs"]`.
  (differs)
- A Mongoster file of an earlier version, without these fields → no colors of databases or collections and nothing
  excluded, as before.

### `connection.read-list` — Read a list of connection strings

Reads a text with one connection string per line, of either engine, with or without a name.

- **Kind**: Derivation
- **Engine**: Any
- **Function**: `src/features/connection/read-list.ts › connectionsFromList(text)`
- **Uses**: `connection.tls-in-uri`, `connection.redis-string`.
- **Ported from**: connection.read-list (`src/shared/connectionsFile.ts › parseList`, `isConnectionString`,
  `hostOf`, `tlsFromUri`, `missingSecrets`). The Redis lines are new in Datardo. The name taken from the `//`
  comment above a line comes from connection.read-list of Mongoster 0.9.0 (`parseList`).

Rules:

- One connection per line; lines end with `\n` or `\r\n`; a byte order mark is dropped.
- Empty lines and lines starting with `#` or `//` are ignored, not counted.
- A line without `mongodb://`, `mongodb+srv://`, `redis://` or `rediss://` (any case) is skipped and counted; so is
  one whose connection string has no host right after the scheme. The scheme gives the engine.
- The connection string runs from the scheme to the first space, without trailing `"`, `'`, `` ` ``, `,`, `;`.
- The name is what comes before it, without trailing spaces, `=`, `:`, `,`, `;`, `|`, quotes and without leading
  quotes; without a name, the text of a `//` comment on the line right above, trimmed and without the `//`; without
  either, the host part of the connection string, credentials left out: for Redis the host and the port
  (`cache:6379`).
- A `//` comment names only the line right below it: an empty line, a `#` comment, another `//` comment or a line
  that is not a connection in between forgets it, and an empty `//` names nothing.
- MongoDB: TLS certificate files in the connection string move to the TLS settings (`connection.tls-in-uri`).
- Redis: the line is read as `connection.redis-string` says; `rediss://` turns TLS on. A line it refuses is skipped
  and counted.
- Notes: **no password** as in `connection.read-file`.

Examples:

- `mongodb://localhost:27017/app` → MongoDB, name `localhost:27017`.
- `Production = mongodb+srv://ada:pw@cluster0.x.mongodb.net/shop?retryWrites=true` → MongoDB, name `Production`, the
  connection string unchanged.
- `"Quoted Name" = "mongodb://h1:27017/db",` → `Quoted Name`, `mongodb://h1:27017/db`.
- `'Single': mongodb://h2/db;` → `Single`, `mongodb://h2/db`; `Tabbed<Tab>mongodb://h3/db` → `Tabbed`.
- `not a connection` and `mongodb:// broken` → skipped (2).
- `Secure = mongodb://ada@h/db?tls=true&tlsCAFile=%2Fca.pem` → `mongodb://ada@h/db`, TLS `{ caFile: "/ca.pem" }`,
  note **no password**.
- `Cache = redis://:s3cret@cache:6379/2` → Redis, name `Cache`, host `cache`, password `s3cret`, database 2.
- `rediss://ada@cache.example.com:6380` → Redis, name `cache.example.com:6380`, TLS on, note **no password**.
- `redis://cache/orders` → skipped (1).
- `// Production` then `mongodb+srv://ada@cluster0.x.mongodb.net/shop` on the next line → name `Production`.
- `// Sessions` then `rediss://cache.example.com:6380/2` → Redis, name `Sessions`.
- `// Reports` then `Main = mongodb://r1/db` → `Main`; `// Old`, an empty line, then `mongodb://h1/db` → `h1`;
  `//` alone then `mongodb://h2/db` → `h2`; `// A`, `// B`, then `mongodb://h3/db` → `B`.

### `connection.read-compass` — Read a MongoDB Compass export

Reads the connections of the file Compass writes with **Export saved connections**.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/connection/read-compass.ts › connectionsFromCompass(json, passphrase)`
- **Uses**: `connection.encryption`, `connection.tls-in-uri`, `connection.color-from-compass`,
  `connection.string-secrets`.
- **Ported from**: connection.read-compass (`src/shared/connectionsFile.ts › fromCompass`, `decryptSecrets`,
  `withPassword`, `setUriParams`, `tlsFromUri`, `colorFrom`, `missingSecrets`); the eleven presets from
  connection.color-from-compass of Mongoster 0.9.0.

Rules:

- An entry has `id`, `favorite` (`name`, `color`), `savedConnectionType`, `connectionOptions` (`connectionString`,
  `sshTunnel`, `fleOptions`…) and, when encrypted, `connectionSecrets`. One without a valid `connectionString`, or
  that is not an object, is skipped and counted. Every connection is a MongoDB one.
- Decrypted secrets go back as Compass's `mergeSecrets` puts them: `password` into the connection string,
  `tlsCertificateKeyFilePassword` and `proxyPassword` as options of it, `awsSessionToken` as
  `AWS_SESSION_TOKEN:<token>` in `authMechanismProperties`, replacing an older one.
- Then the TLS files move out of the connection string (`connection.tls-in-uri`).
- The name is the `name` of `favorite`, trimmed, or the host part; the color is one of the eleven presets, never a
  custom color (`connection.color-from-compass`). A Compass file has no colors of databases or collections and
  nothing excluded from searches.
- `sshTunnel` with a host: with a `mongodb+srv://` connection string it is left out with the note **SSH tunnel not
  imported: a mongodb+srv:// connection string can't go through one**; otherwise port (22 left out), user, and
  `privateKey` authentication when `identityKeyFile` is set (its first element when it is an array, with the
  passphrase), else `password` authentication with the password (empty when unknown). With several hosts the note
  **the SSH tunnel goes to the first host only**.
- Left out with a note: In-Use Encryption (`autoEncryption` of `fleOptions` not empty: **In-Use Encryption settings
  not imported**), the application proxy (**application proxy setting not imported**).
- Without the passphrase: **passwords not imported (encrypted)**; otherwise **no password** / **no SSH password** as
  in `connection.read-file`.

Examples:

- `favorite: { name: " Prod ", color: "color3" }`, `connectionString:
  "mongodb://admin:secret@db1:27017,db2:27017/?replicaSet=rs0&tls=true&tlsCAFile=%2Fca.pem"`, `sshTunnel: { host:
  "bastion", port: 2222, username: "ubuntu", identityKeyFile: ["/id_rsa"], identityKeyPassphrase: "kp" }`, In-Use
  Encryption set → name `Prod`, `mongodb://admin:secret@db1:27017,db2:27017/?replicaSet=rs0`, TLS `{ caFile:
  "/ca.pem" }`, color `blue`, SSH `{ host: "bastion", port: 2222, username: "ubuntu", auth: "privateKey",
  privateKeyFile: "/id_rsa", passphrase: "kp" }`, notes **the SSH tunnel goes to the first host only**, **In-Use
  Encryption settings not imported**.
- `connectionString: "mongodb://admin@h:27017/?authSource=admin&tlsCertificateKeyFile=%2Fk.pem"`, encrypted secrets
  `{ password: "p%40ss", sshTunnelPassword: "sshpw", tlsCertificateKeyFilePassword: "kp" }`, the right passphrase →
  `mongodb://admin:p%40ss@h:27017/?authSource=admin`, TLS `{ certificateKeyFile: "/k.pem",
  certificateKeyFilePassword: "kp" }`, SSH password `sshpw`, no notes. Without the passphrase →
  `mongodb://admin@h:27017/?authSource=admin`, SSH password empty, note **passwords not imported (encrypted)**.
- `mongodb://key@h/?authMechanism=MONGODB-AWS&authMechanismProperties=AWS_SESSION_TOKEN:old` with the secret
  `awsSessionToken: "tok"` → `…&authMechanismProperties=AWS_SESSION_TOKEN%3Atok`.

### `connection.write-file` — Write a connections file

Gives the text of an exported file, in Datardo's format, in Compass's, or as a list of connection strings.

- **Kind**: Derivation
- **Engine**: Any
- **Function**: `src/features/connection/write-file.ts › connectionsToText(connections, format, secrets, passphrase)`
- **Uses**: `connection.encryption`, `connection.tls-in-uri`, `connection.color-from-compass`,
  `connection.string-secrets`, `tree.color-of`, `tree.excluded`.
- **Ported from**: connection.write-file (`src/shared/connectionsFile.ts › serializeConnections`, `tlsIntoUri`,
  `withPassword`, `urlPassword`, `setUriParams`, `Encrypter`). Datardo's format takes the place of Mongoster's;
  taking every secret out of the connection string is new. The custom colors, `databaseColors`,
  `collectionColors`, `excluded`, `exclusions` and their notes come from connection.write-file of Mongoster 0.9.0
  (`serializeConnections`).
- **Differs**: (M39) Datardo's format writes no `excluded` and `exclusions`, and the other formats no note about them.

Rules:

- Input: the connections with their secrets, the format, the secrets mode (`remove`, `include`, `encrypt`) and the
  passphrase. Output: the text (ending with a new line) and the notes on what the format left out.
- Refused: `encrypt` without a passphrase (**A passphrase is needed to encrypt the passwords**), a list with
  `encrypt` (**A list of connection strings can't be encrypted**).
- In every format and every mode, the secrets are first taken out of the connection string in the mode *removed*
  of `connection.string-secrets`; `include` then puts them back in place.
- **Datardo**: `{ "type": "Datardo Connections", "version": 1, "secrets": "removed" | "included" | "encrypted",
  "connections": [...] }`, two-space indented; each entry has `id`, `name`, `engine`, `uri`, and when set `folder`,
  `color`, `databaseColors`, `collectionColors` (MongoDB only), `excluded`, `exclusions` (MongoDB only),
  `readOnly`, `noHistory`, `queriesFolder`, `tls`, `ssh`, and on a MongoDB entry with a linked connection
  `redisOplog` (`connection`, the `id` of the Redis entry, plus the settings of `oplog.publish`). `color` is a
  preset's name or a custom `#rrggbb`; the maps of colors are written as `tree.color-of` keeps them, each value a
  preset's name, a `#rrggbb` or `none`; `excluded` is `true`, and `exclusions` the keys `tree.excluded` keeps,
  sorted. The secrets taken
  out are the password and the secret options of the connection string, the `certificateKeyFilePassword` of `tls`,
  and the `password` and `passphrase` of `ssh`; `include` puts them back in place, `encrypt` writes them as one
  `secrets` string per entry (`{"secrets":{ password, tlsCertificateKeyFilePassword, proxyPassword,
  awsSessionToken, sshPassword, sshPassphrase }}` encrypted), `remove` drops them. Other options of the connection
  string are written as they are. The Redis entry a `redisOplog` names is always in the file.
- **Compass**: `{ "type": "Compass Connections", "version": 1, "connections": [...] }`, with the MongoDB connections
  only; each entry has a new random `id`, `favorite: { name, color: <code> }`, `savedConnectionType: "favorite"`
  and `connectionOptions: { connectionString, sshTunnel? }`. The TLS settings are written into the connection
  string; `include` puts the password and the key password in the connection string and `password` and
  `identityKeyPassphrase` in `sshTunnel`; `encrypt` writes `connectionSecrets` (`password`,
  `tlsCertificateKeyFilePassword`, `proxyPassword`, `awsSessionToken`, `sshTunnelPassword`, `sshTunnelPassphrase`);
  `remove` drops them. An agent tunnel is written without authentication. The color is written as Compass's code
  (`connection.color-from-compass`), a custom color as the code of its nearest preset. Folders, read-only, the undo
  history setting, the queries folder and redis-oplog are left out; so are the colors of databases and collections,
  with the note **colors of databases and collections were left out (Compass doesn't have them)**, and what is
  excluded from searches, with the note **exclusions from searches were left out (Compass doesn't have them)**.
- **List**: a first line `# Connections exported from Datardo: name = connection string`, with ` (without
  passwords)` for `remove`, then `<name> = <connection string>` per connection, with new lines and `=` of the name
  turned into spaces. For MongoDB the TLS settings are in the connection string, the key password only with
  `include`; for Redis the scheme says whether TLS is on, and the certificate files are left out. `remove` takes
  the secrets out. SSH tunnels, folders, colors (of connections, databases and collections), read-only and
  redis-oplog are left out, with the note **folders, colors, read-only and redis-oplog were left out**; what is
  excluded from searches too, with the note **exclusions from searches were left out**.

Examples:

- `Full`, MongoDB, `mongodb://ada:p%40ss@db1:27017/app`, folder `Work`, orange, read-only, TLS `{ caFile:
  "/ca.pem", certificateKeyFile: "/k.pem", certificateKeyFilePassword: "kp" }`, SSH `jump:2200` user `me` by
  password `sshpw`, linked to `Cache`, Redis, `redis://:r3dis@cache`, with the prefix `app:`:
  - Datardo, `remove` → `"secrets": "removed"`; for `Full`: `"engine": "mongodb"`, `"uri":
    "mongodb://ada@db1:27017/app"`, `"tls": { "caFile": "/ca.pem", "certificateKeyFile": "/k.pem" }`, `"ssh": {
    "host": "jump", "port": 2200, "username": "me", "auth": "password" }`, `"redisOplog": { "connection": <the id of
    Cache>, "prefix": "app:" }`; for `Cache`: `"engine": "redis"`, `"uri": "redis://cache"`.
  - Compass, `remove` → `favorite: { name: "Full", color: "color8" }`, `connectionString:
    "mongodb://ada@db1:27017/app?tls=true&tlsCAFile=%2Fca.pem&tlsCertificateKeyFile=%2Fk.pem"`, `sshTunnel: { host:
    "jump", port: 2200, username: "me" }`, notes **folders, read-only and redis-oplog were left out (Compass doesn't
    have them)**, **1 Redis connection was left out (Compass doesn't have them)**.
  - List, `remove` → `Full = mongodb://ada@db1:27017/app?tls=true&tlsCAFile=%2Fca.pem&tlsCertificateKeyFile=%2Fk.pem`
    and `Cache = redis://cache`, notes **1 SSH tunnel was left out (a connection string can't hold one)**,
    **folders, colors, read-only and redis-oplog were left out**.
  - List, `include` → `Cache = redis://:r3dis@cache`.
- `mongodb://ada:pw@h/?proxyHost=p&proxyPassword=pp`, Datardo, `remove` → `"uri": "mongodb://ada@h/?proxyHost=p"`.
- `Shop`, MongoDB, `mongodb://db1/shop`, colored `#1e90ff`, the database `shop` teal, the collection `shop.orders`
  with **None**, `shop.logs` excluded from searches, and the connection excluded too (differs):
  - Datardo → `"color": "#1e90ff"`, `"databaseColors": { "shop": "teal" }`, `"collectionColors": { "shop.orders":
    "none" }`, `"excluded": true`, `"exclusions": ["shop.logs"]`.
  - Compass → `favorite: { name: "Shop", color: "color3" }`, notes **colors of databases and collections were left
    out (Compass doesn't have them)**, **exclusions from searches were left out (Compass doesn't have them)**.
  - List → `Shop = mongodb://db1/shop`, notes **folders, colors, read-only and redis-oplog were left out**,
    **exclusions from searches were left out**.
- Every format read back with `connection.read-file` gives the same connections, less what the format leaves out.

### `connection.encryption` — Encrypt the passwords of a file as Compass does

The encryption of the passwords in an exported file, the same as Compass's, so that each reads the other's files.

- **Kind**: Derivation
- **Engine**: Any
- **Function**: `src/features/connection/encryption.ts › encryptSecrets(text, passphrase)` and `›
  decryptSecrets(data, passphrase)`
- **Ported from**: connection.encryption (`src/shared/connectionsFile.ts › Encrypter.encrypt`, `Decrypter.decrypt`,
  `deriveKey`, `PassphraseError`).

Rules:

- The key is PBKDF2 with SHA-512, 100,000 iterations, 32 bytes, of the passphrase in UTF-8 and a random 16-byte
  salt.
- Each value is encrypted with AES-256-GCM, a random 16-byte IV and a 16-byte authentication tag.
- The result is the base64 of: the version `0x0001` (2 bytes, big endian) ‖ salt (16) ‖ IV (16) ‖ tag (16) ‖
  ciphertext. This is the format of Compass's `encrypt.ts`, so each side reads the other's files.
- One salt, and one key derivation, per file; a new IV per value. Decrypting derives the key once per salt.
- The plaintext is the JSON `{"secrets":{…}}` of one connection.
- Refused: data shorter than 50 bytes (**The encrypted data is too short**), another version (**Unknown encrypted
  data version: 0x<n>**), a tag that does not match, from a wrong passphrase or damaged data (**Wrong passphrase, or
  the file is damaged**).
- The export asks for a passphrase of at least 8 characters; the import takes any.
- The salt and the IVs are random: they are given to the function, which reads no source of randomness itself.

Examples:

- A value encrypted by Compass with `phrase` → decrypted with `phrase` to the same text; with `wrong` → **Wrong
  passphrase, or the file is damaged**.
- Two values encrypted for one file → bytes 2–17 (the salt) equal, bytes 18–33 (the IV) different.
- `AAE=` → **The encrypted data is too short**; the version changed to 2 → **Unknown encrypted data version: 0x2**.

### `connection.tls-in-uri` — TLS settings in and out of a MongoDB connection string

Datardo keeps the certificate files apart from the connection string; Compass and the list keep them in it.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/connection/tls-in-uri.ts › tlsFromUri(connectionString)` and `›
  tlsIntoUri(connectionString, tls, withSecrets)`
- **Ported from**: connection.tls-in-uri (`src/shared/connectionsFile.ts › tlsFromUri`, `tlsIntoUri`, `uriParams`,
  `setUriParams`).

Rules:

- Out (`tlsFromUri`): only when `tlsCAFile` or `tlsCertificateKeyFile` is set and `tls` (or `ssl`) is not `false`.
  The TLS settings take the two files, the key password (only with a certificate file), and
  `allowInvalidCertificates` / `allowInvalidHostnames` from their options or from `tlsInsecure=true`. The options
  `tls`, `ssl`, `tlsCAFile`, `tlsCertificateKeyFile`, `tlsCertificateKeyFilePassword`,
  `tlsAllowInvalidCertificates`, `tlsAllowInvalidHostnames` and `tlsInsecure` are then removed. Option names are
  compared ignoring case; values are decoded.
- In (`tlsIntoUri`): with TLS settings, sets `tls=true`, the files, the key password only when secrets are
  included, and the two `allowInvalid…` when on, removing `ssl` and `tlsInsecure`; the options are added at the
  end, encoded, replacing those of the same name; the others keep their place and spelling.

Examples:

- `mongodb://h:27017/db?tls=true&tlsCAFile=C%3A%5Ccerts%5Cca.pem&tlsCertificateKeyFile=%2Fk.pem&tlsCertificateKeyFilePassword=kp&tlsAllowInvalidHostnames=true&appName=x`
  → `mongodb://h:27017/db?appName=x` and `{ caFile: "C:\certs\ca.pem", certificateKeyFile: "/k.pem",
  certificateKeyFilePassword: "kp", allowInvalidHostnames: true }`.
- `mongodb://h/?ssl=true&tlsCAFile=ca.pem&tlsInsecure=true` → `{ caFile: "ca.pem", allowInvalidCertificates: true,
  allowInvalidHostnames: true }`.
- `mongodb://h/?tls=true&tlsAllowInvalidCertificates=true` and `mongodb://h/?tls=false&tlsCAFile=ca.pem` →
  unchanged, no TLS settings.
- `mongodb://h/db?ssl=true` with `{ caFile: "ca.pem", certificateKeyFile: "k.pem", certificateKeyFilePassword: "kp",
  allowInvalidCertificates: true }` and secrets →
  `mongodb://h/db?tls=true&tlsCAFile=ca.pem&tlsCertificateKeyFile=k.pem&tlsCertificateKeyFilePassword=kp&tlsAllowInvalidCertificates=true`;
  without secrets, no `kp`.

### `connection.color-from-compass` — The closest color of a Compass connection

Turns the color of a connection in a file into one of Datardo's eleven presets, or keeps a custom color of Datardo's
and Mongoster's own formats, and turns a color back into Compass's codes.

- **Kind**: Derivation
- **Engine**: Any
- **Function**: `src/features/connection/color-from-compass.ts › colorFrom(value, keepCustom)` and `›
  compassColor(color)`
- **Uses**: `connection.color-presets`.
- **Ported from**: connection.color-from-compass (`src/shared/connectionsFile.ts › colorFrom`, `TO_COMPASS`), as
  Mongoster 0.9.0 has it (proposal 0001, revision 2; `FROM_COMPASS`, `TO_COMPASS`, `compassColor`).

Rules:

- Datardo's eleven preset names (`connection.color-presets`), in any case and with spaces around, are kept.
- Compass's codes and names, in any case: `color1` → green, `color2` → teal, `color3` → blue, `color4` and `iris` →
  indigo, `color5` → purple, `color6` → red, `color7` → pink, `color8` → orange, `color9` → yellow, `color10` →
  gray.
- A hex color (`#rgb`, `#rrggbb`, with or without `#`, as `readColor` reads it): with `keepCustom`, which Datardo's
  and Mongoster's formats use, it is kept as a custom color, `#rrggbb` in lower case; otherwise, from Compass's
  format (older Compass wrote hex colors), it is its nearest preset (`nearestPreset`).
- Anything else, or not a string: none.
- Export to Compass (`compassColor`): red `color6`, orange `color8`, yellow `color9`, green `color1`, blue `color3`,
  purple `color5`, pink `color7`, teal `color2`, indigo `color4`, gray `color10`; brown, which Compass lacks,
  `color8`; a custom color as the code of its nearest preset.

Examples:

- `color3` → blue; `color2` → teal; `iris` → indigo; `color7` → pink; `color10` → gray; `' Blue '` → blue; `#ff0000`
  → red; `#00f` → blue; `ffa500` → orange; `#808080` → gray; `#xyz` → none; `3` → none.
- With `keepCustom`: `#12ABEF` → `#12abef`; `color4` → indigo.
- Export: teal → `color2`; brown → `color8`; `#12abef` → `color3`; `#5c6bc0` → `color4`.
- Every preset but brown written to Compass and read back is itself; brown comes back orange.
