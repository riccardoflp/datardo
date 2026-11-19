# Users and roles

The **Users and roles** page of a MongoDB connection: the users of one database or of all of them with their roles,
the custom roles with their privileges, and the built-in roles on request. From it a user is created and deleted, its
password changed, its roles granted and revoked; a custom role is created, edited and deleted. A user is edited by
its parts, its password and its roles: its custom data is shown and not changed.

Everywhere in this area:

- A user is written `app@shop` and a role `read@shop`: the name, then the database where it is defined.
- The controls that write are not shown on a read-only connection, and a feature started anyway is refused with *The
  connection Production is read-only: users and roles can't be changed.*
- No write of this area is recorded in the undo history, and its confirmations say so: users and roles are not
  documents Datardo writes but records the server keeps and changes only through its commands, and a password cannot
  be read back from the server, so what was there before cannot be kept. They are not published for redis-oplog
  either.
- A password is never written: in the steps of a plan, in a confirmation and in the Log it is `***`
  (`runner.log`), and no notification or error repeats it.
- In the plans, the database of the user or of the role is named whole: `db.getSiblingDB("shop")`.
- An error of the server (a missing privilege, a name already taken, an unknown role) stops the step and is shown as
  it is (`runner.run`).

### `user.show` — The Users and roles page

Lists the users and the roles of the connection and starts everything that changes them.

- **Kind**: View
- **Engine**: MongoDB
- **Function**: `src/features/user/show.ts › view(state)`
- **Entry points**: **Users and roles** among the Pages of a MongoDB connection in the tree island (`@tree`);
  **Users and roles** in the context menu of a database (`@tree-menu`), which opens the page with that database
  chosen. Go to: **Users and roles**, for the current connection.
- **Offered when**: the connection is MongoDB.
- **Reads**: when the page opens, when **Database** or **Built-in roles** changes, on **Refresh** and after every
  change: `db.adminCommand({ listDatabases: 1, nameOnly: true })` for the databases, `user.list`,
  `user.list-roles`; `user.signed-in` when the page opens and when the connection is edited. A reply that arrives
  after a newer request was sent is dropped.
- **Commands**: `user.show`
- **Uses**: `user.list`, `user.list-roles`, `user.signed-in`, `user.inspect`, `user.role-reference`,
  `user.privilege-summary`, `user.create`, `user.change-password`, `user.delete`, `user.create-role`,
  `user.edit-role`, `user.delete-role`, `tab.open`, `nav.inspector`, `nav.status-line`.
- **Ported from**: Manage Users and Roles, which has no card in Mongoster; `src/users.ts` (`UsersPanel`, `load`),
  `src/webview/users.ts`.

The page opens in a tab of its own (`tab.open`), one per connection, named `Users and roles`: asking for it again
shows that tab, with the database asked for.

What it shows, top to bottom:

1. The section bar (`@section-bar`): **Users** and **Roles**.
2. The toolbar (`@toolbar`), the same for both sections:
   - **Database**: **All databases**, then the databases. They are `admin`, those `listDatabases` returns, those of
     the users and roles read, and the one chosen, without `local` and `config`, sorted by name. When `listDatabases`
     is refused, the others are still listed;
   - the filter, with the placeholder *Filter by name, role or privilege*;
   - **Refresh** (*Reload the users and roles*).
3. Who the connection is signed in as (`user.signed-in`): *Connected as app@admin · roles readWrite@shop,
   clusterMonitor@admin*; or *Connected without signing in: access control may be disabled on this server, so users
   and roles take effect only once it is enabled.*; or *Signed-in user unknown: <the server's message>*.
4. In **Users**: **Create user…** (not on a read-only connection), the count (`12 users`, `1 user`, `3 of 12 users`
   with a filter) and the table, one row per user, sorted by database and then by name:
   - **User**: the name, with the tag `you` on the user the connection is signed in as;
   - **Database**;
   - **Roles**: the labels of `user.role-reference` joined by `, `, or `(no roles)`; the tooltip lists them whole,
     one per line;
   - **Mechanisms**, joined by `, ` (`SCRAM-SHA-1, SCRAM-SHA-256`).
5. In **Roles**: **Create role…** (not on a read-only connection), the checkbox **Built-in roles** (*Also list the
   roles MongoDB provides (read, readWrite, dbAdmin…)*), the count (`2 custom roles`, `1 custom role`, `2 custom
   roles, 17 built-in`) and the table, one row per role, custom roles first, then by database and by name:
   - **Role**: the name, with the tag `built-in`;
   - **Database**;
   - **Privileges**: the summary of `user.privilege-summary`, with the whole summary as its tooltip;
   - **Inherits**: the labels of the roles it inherits, joined by `, `;
   - **Users**: how many of the users listed have the role; empty for none.

Selecting a row shows the user or the role in the inspector island (`user.inspect`). The context menu of a row and
its `…` button (`@row-menu`) have, on a connection that is not read-only: for a user, **Password…** (*Set a new
password*) and **Delete** (*Delete the user*); for a custom role, **Edit…** (*Change its privileges and inherited
roles*) and **Delete** (*Delete the role*). A built-in role has no actions.

The filter narrows both tables as it is typed, without reading again and whatever the case: a user matches when the
text is in its `name@database`, in one of its roles written `role@database`, or in one of its mechanisms; a role
when it is in its `name@database`, in one of the roles it inherits, in one of its resources or in one of its
actions.

States:

- *loading*: the tables are dimmed while they are read; the rows stay.
- *error*: the users and the roles are read apart: when one cannot be read, the server's message takes the place of
  its table and the other is still shown.
- *empty*: **Users**: *No users in shop.*, *No users.* with **All databases**, or *No user matches the filter.*
  **Roles**: *No custom roles in shop: Create role… defines one, Built-in roles lists those of MongoDB.* (without *in
  shop* with **All databases**), or *No role matches the filter.*
- *read-only*: both tables and the inspector are complete; **Create user…**, **Create role…**, the actions of the
  rows, and the controls of the inspector that grant and revoke are not shown, and the status line says
  **Read-only**.

Acceptance:

- [ ] Opened from the database `shop`, the page has `shop` chosen in **Database** and lists the users and the custom
  roles defined in `shop`; opened from the Pages, it has **All databases** chosen.
- [ ] The databases offered never include `local` and `config`, always include `admin`, and include `reporting`
  when a user is defined there even if `listDatabases` is refused.
- [ ] With 12 users and the filter `readwrite`, the users having `readWrite` on any database are shown and the count
  says `3 of 12 users`.
- [ ] The filter `find` shows, in **Roles**, the roles with the action `find`; the filter `shop.orders` those with a
  privilege on that resource.
- [ ] The user the connection is signed in as has the tag `you`.
- [ ] With **Built-in roles** ticked and `shop` chosen, the built-in roles of `shop` follow its custom roles and the
  count says `2 custom roles, 6 built-in`.
- [ ] When `usersInfo` is refused and `rolesInfo` is not, **Users** shows the server's message and **Roles** its
  table.
- [ ] On a read-only connection no control that writes is shown, in the page or in the inspector.
- [ ] A built-in role has neither **Edit…** nor **Delete**.

### `user.list` — The users of a database or of all databases

- **Kind**: Read
- **Engine**: MongoDB
- **Function**: `src/features/user/list.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: read by `user.show`.
- **Uses**: used by `user.show`, `user.inspect`.
- **Ported from**: `src/users.ts` (`load`, `toUser`, `roleRef`).

Sent:

- for one database: `db.getSiblingDB("shop").runCommand({ usersInfo: 1 })`;
- for **All databases**: `db.getSiblingDB("admin").runCommand({ usersInfo: { forAllDBs: true } })`.

Returned, for each user of the reply's `users`, sorted by database and then by name:

- its name (`user`) and its database (`db`);
- its roles, each as a name and a database: a role the server reports as a bare name is in the user's database;
- its mechanisms (`mechanisms`), none when the server reports none;
- its custom data (`customData`), when it has some;
- the whole document as the server returned it, as relaxed Extended JSON. The server returns no password and no
  credentials with these commands.

Acceptance:

- [ ] With `shop` chosen, `usersInfo: 1` is sent to `shop`; with **All databases**, `usersInfo: { forAllDBs: true }`
  is sent to `admin`.
- [ ] The users `zoe@admin`, `app@shop` and `bob@admin` are returned as `bob@admin`, `zoe@admin`, `app@shop`.
- [ ] A user reported with the roles `[{ role: "readWrite", db: "shop" }, { role: "read", db: "reporting" }]` has
  those two roles; one reported without `mechanisms` has none.
- [ ] The custom data `{ team: "billing", since: ISODate("2026-01-10T00:00:00Z") }` is returned with its date as a
  date.
- [ ] A server that refuses the command gives its message as the error of the users, and the roles are still read.

### `user.list-roles` — The roles of a database or of all databases

- **Kind**: Read
- **Engine**: MongoDB
- **Function**: `src/features/user/list-roles.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: read by `user.show`.
- **Uses**: `user.privilege-summary`, for the text of a resource. Used by `user.show`, `user.inspect`,
  `user.role-reference`.
- **Ported from**: `src/users.ts` (`load`, `toRole`, `resourceText`).

Sent:

1. For **All databases** only: `db.getSiblingDB("admin").system.roles.distinct("db")`, the databases that have
   custom roles. The databases asked are `admin` and those. When this is refused, they are every database the page
   knows.
2. For each database asked, or for the one chosen: `db.getSiblingDB("shop").runCommand({ rolesInfo: 1,
   showPrivileges: true, showBuiltinRoles: false })`. `showBuiltinRoles` is `true` when **Built-in roles** is ticked
   and either one database is chosen or the database asked is `admin`: with **All databases** the built-in roles are
   listed once, those of `admin`, and not again for every database.

Returned, for each role of the replies' `roles`, custom roles first, then by database and by name:

- its name (`role`) and its database (`db`);
- whether it is built-in (`isBuiltin`);
- its own privileges (`privileges`), each as the text of its resource and its actions; the privileges it inherits
  are not listed with its own;
- the roles it inherits directly (`roles`), each as a name and a database;
- the whole document as the server returned it, as relaxed Extended JSON.

Acceptance:

- [ ] With `shop` chosen and **Built-in roles** not ticked, one `rolesInfo` is sent to `shop` with
  `showBuiltinRoles: false`.
- [ ] With **All databases** and custom roles in `shop` and `crm`, `rolesInfo` is sent to `admin`, `shop` and `crm`;
  with **Built-in roles** ticked only the one sent to `admin` has `showBuiltinRoles: true`.
- [ ] When `admin.system.roles` cannot be read, `rolesInfo` is sent to every database the page lists.
- [ ] The roles `read@admin` (built-in), `reader@shop` and `auditor@admin` are returned as `auditor@admin`,
  `reader@shop`, `read@admin`.
- [ ] A role with the privilege `{ resource: { db: "shop", collection: "" }, actions: ["find", "listIndexes"] }` is
  returned with the resource `shop.*` and those two actions.

### `user.signed-in` — Who the connection is signed in as

- **Kind**: Read
- **Engine**: MongoDB
- **Function**: `src/features/user/signed-in.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: read by `user.show`; read again by `user.change-password`, `user.revoke-role` and
  `user.delete` when they start, to say whether the user is the connection's own.
- **Uses**: used by `user.show`, `user.change-password`, `user.revoke-role`, `user.delete`.
- **Ported from**: `src/users.ts` (`me`).

Sent: `db.adminCommand({ connectionStatus: 1 })`.

Returned: the users of `authInfo.authenticatedUsers`, each as a name and a database, and the roles of
`authInfo.authenticatedUserRoles`, each as a name and a database. Both are empty on a connection that did not sign
in.

A feature that asks whether a user is the connection's own takes "no" for an answer when this read fails: the
question never stops a write.

Acceptance:

- [ ] A connection signed in as `app` on `admin` with `readWrite` on `shop` gives the user `app@admin` and the role
  `readWrite@shop`, and the page says *Connected as app@admin · roles readWrite@shop*.
- [ ] A connection without credentials gives no user, and the page says *Connected without signing in: access
  control may be disabled on this server, so users and roles take effect only once it is enabled.*
- [ ] When the command fails, the page says *Signed-in user unknown: <the server's message>* and lists the users and
  the roles all the same.

### `user.inspect` — A user or a role in the inspector

Shows everything about the selected user or role, and grants and revokes the roles of a user.

- **Kind**: View
- **Engine**: MongoDB
- **Function**: `src/features/user/inspect.ts › view(state)`
- **Entry points**: selecting a row of the **Users** or the **Roles** section (`@table`) shows it in the inspector
  island (`@inspector`).
- **Offered when**: a row is selected.
- **Reads**: nothing more: it shows what `user.list` and `user.list-roles` returned.
- **Uses**: `user.role-reference`, `user.privilege-summary`, `user.grant-role`, `user.revoke-role`,
  `user.change-password`, `user.delete`, `user.edit-role`, `user.delete-role`, `query.format`, `nav.inspector`.
- **Ported from**: `src/webview/users.ts` (`userDetail`, `roleDetail`, `describeRole`), where the details open under
  the row.

For a user, top to bottom:

1. `app@shop`, with the tag `you` when the connection is signed in as it; on a connection that is not read-only,
   **Password…** and **Delete**.
2. **Roles**: one chip per role, written whole (`read@reporting`), or `none`. The tooltip of a chip is what the role
   grants, when the role is among those read: the role, then up to 12 of its privileges, one per line, as `shop.orders:
   find, insert` with up to 8 actions and `…` when there are more, then `inherits read@shop` when it inherits roles.
   On a connection that is not read-only each chip has `✕` (*Revoke read@reporting*), which starts
   `user.revoke-role`.
3. **Grant**, on a connection that is not read-only: a field for the role (placeholder *role to grant*) that
   suggests the names of `user.role-reference`, *in*, the database (it starts as the user's and becomes `admin` when
   the role exists only there), and the button **Grant**. `Enter` in the field grants too. They start
   `user.grant-role`.
4. **Custom data**, when the user has some: the document in mongosh syntax (`query.format`).
5. **Raw**: the document as the server returned it, in mongosh syntax, with **Copy**.

For a role, top to bottom:

1. `reader@shop`, with the tag `built-in`; for a custom role on a connection that is not read-only, **Edit…** and
   **Delete**.
2. **Privileges**: a table with **Resource** and **Actions**, one row per privilege, the actions joined by `, ` and
   all shown. Left out when the role has no privileges of its own.
3. **Inherits**: one chip per role it inherits, written whole, with the same tooltip as above. Left out when there
   are none.
4. **Users**: one chip per user listed that has the role (`app@shop`). Left out when there are none.
5. **Raw**, as for a user.

Acceptance:

- [ ] The user `app@shop` with `readWrite@shop` and `read@reporting` shows two chips, each with `✕`, and the tooltip
  of `✕` on the second is *Revoke read@reporting*.
- [ ] A user without roles shows `none` under **Roles** and can still be granted one.
- [ ] Typing `clusterMonitor` in **Grant** sets the database to `admin`; typing `read` leaves it as it was.
- [ ] The chip of a role with 15 privileges, the first with 10 actions, has a tooltip of 13 lines whose second ends
  with `…`.
- [ ] The role `reader@shop` held by `app@shop` and `bob@shop` shows both under **Users**; with **Database** set to
  `crm`, where neither is listed, it shows none.
- [ ] **Copy** under **Raw** copies the document in mongosh syntax, with its `UUID(…)` as a UUID.
- [ ] On a read-only connection the inspector shows the roles, the custom data and **Raw**, and neither `✕` nor
  **Grant** nor the buttons.

### `user.create` — Create a user

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/user/create.ts › plan(context, answers)`
- **Entry points**: **Create user…** in the **Users** section (`@toolbar`). Go to: **Create user…**.
- **Offered when**: the connection is not read-only.
- **Asks**: in the dialog **New user** (`@dialog`, `runner.ask`):
  - **Name** (placeholder *user name*);
  - **Database**, with the note *Where the user is defined (authSource in the connection string)*: it starts as the
    database chosen in the page, or `admin` with **All databases**;
  - **Password** (placeholder *password*), hidden as it is typed, with **Generate** (*A random password of 24 letters
    and digits*), which fills it with `user.generate-password` and shows it; **Show** or **Hide**; and **Copy**;
  - **Roles**: rows of a role (placeholder *role (readWrite, read, dbAdmin…)*, suggesting the names of
    `user.role-reference`), *in*, a database, and `✕` (*Remove*); **+ Role** (*Add a role*) adds a row. A row starts
    in the user's database and moves to `admin` when its role exists only there. The dialog starts with one row,
    `readWrite` in the database chosen in the page, and with none with **All databases**. Rows with no role are left
    out;
  - **Custom data** (placeholder *{ team: "billing" }  (optional)*), a document in mongosh syntax.

  The button is **Create user**; `Enter` in a field does the same.
- **Plan**: one step: `db.getSiblingDB("shop").runCommand({ createUser: "app", pwd: "***", roles: ["readWrite", {
  role: "clusterMonitor", db: "admin" }], customData: { team: "billing" } })`. The roles are written as
  `user.role-reference` says; `customData` is there only when some was given. The step is sent with the password and
  written, everywhere, with `***`.
- **Danger**: None: it adds a user and changes nothing that exists.
- **Read-only**: Refused on a read-only connection (`/read-only`).
- **Undo**: Cannot be undone from the undo history: a user is not a document Datardo writes. **Delete** removes it.
- **After**: the lists are read again; *Created the user app@shop with readWrite@shop, clusterMonitor@admin.*, or
  *Created the user app@shop without roles.* (`runner.notify`), with **Copy password** (*Copy the new password: it
  can't be read back from MongoDB*). The password is kept in memory for that button only until the notification
  closes.
- **Refuses**: a read-only connection (`/read-only`): *The connection Production is read-only: users and roles can't
  be changed.*; an empty name (`/no-name`): *Enter the name of the user.*; an empty password (`/no-password`):
  *Enter a password, or generate one.*; custom data that cannot be read (`/custom-data`): *Custom data:* followed by
  the error, or *Custom data must be an object*. The last three are shown in the dialog, which stays open with what
  was typed.
- **Commands**: `user.create`
- **Uses**: `user.generate-password`, `user.role-reference`, `query.parse`, `runner.ask`, `runner.run`,
  `runner.notify`, `runner.log`.
- **Ported from**: `src/users.ts` (`change`, `createUser`); `src/webview/users.ts` (`openUserForm`, `rolePicker`,
  `passwordField`).

Acceptance:

- [ ] With `shop` chosen in the page, the dialog starts with the database `shop` and the role `readWrite` in `shop`;
  with **All databases**, with `admin` and no role.
- [ ] `app` in `shop` with the roles `readWrite` in `shop` and `clusterMonitor` in `admin` sends `createUser: "app"`
  to `shop` with `roles: ["readWrite", { role: "clusterMonitor", db: "admin" }]` and the password as typed.
- [ ] The Log has the line `[user.create] db.getSiblingDB("shop").runCommand({ createUser: "app", pwd: "***", roles:
  ["readWrite", { role: "clusterMonitor", db: "admin" }] })`, and the password is in no line of the Log, in no
  notification and in no error.
- [ ] Without custom data the command has no `customData`; with `{ team: "billing" }` it has that document; with
  `[1, 2]` the dialog says *Custom data must be an object* and nothing is sent.
- [ ] A name of spaces only is refused with *Enter the name of the user.*; the name is sent without the spaces
  around it.
- [ ] An empty password is refused with *Enter a password, or generate one.*
- [ ] The notification of a user created without roles says *Created the user app@shop without roles.*, and **Copy
  password** puts the password on the clipboard.
- [ ] A name the server already has leaves the dialog's answers as they were and shows the server's error.
- [ ] On a read-only connection **Create user…** is not shown, and the command is refused with the code
  `user.create/read-only` and sends nothing.

### `user.change-password` — Change the password of a user

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/user/change-password.ts › plan(context, answers)`
- **Entry points**: **Password…** in the menu of a user's row (`@row-menu`) and in the inspector (`@inspector`).
- **Offered when**: a user, on a connection that is not read-only.
- **Asks**: in the dialog **New password for app@shop** (`@dialog`, `runner.ask`): **Password**, with **Generate**,
  **Show** or **Hide**, and **Copy**, as in `user.create`. When the connection is signed in as that user, the note
  *This connection signs in as this user: Datardo offers to save the new password in it afterwards.* The button is
  **Change password**.
- **Reads**: `user.signed-in`, to know whether the user is the connection's own.
- **Plan**: one step: `db.getSiblingDB("shop").runCommand({ updateUser: "app", pwd: "***" })`, sent with the
  password and written with `***`. Nothing else of the user is in the command, so its roles and custom data stay.
- **Danger**: None: there is no confirmation beyond the dialog. What signs in with the old password can no longer do
  so.
- **Read-only**: Refused on a read-only connection (`/read-only`).
- **Undo**: Cannot be undone from the undo history: the old password cannot be read from the server, so it cannot be
  kept or put back.
- **After**: *Changed the password of app@shop.* (`runner.notify`), with **Copy password**; when the connection signs
  in as that user the text goes on: *This connection signs in as that user.*, and the notification also has **Save in
  the connection**, which keeps the new password in the connection's secrets (`connection.secrets`) without asking
  for it again, so that the next connect uses it
  ([D49](../decisions.md#d49--a-changed-password-of-the-connections-own-user-can-be-saved-in-the-connection)). Until
  then the saved connection is not changed. The connection stays connected either way.
- **Refuses**: a read-only connection (`/read-only`): *The connection Production is read-only: users and roles can't
  be changed.*; an empty password (`/no-password`): *Enter a password, or generate one.*, shown in the dialog.
- **Commands**: `user.change-password`
- **Uses**: `user.signed-in`, `user.generate-password`, `connection.form`, `connection.secrets`, `runner.ask`, `runner.run`,
  `runner.notify`, `runner.log`.
- **Ported from**: `src/users.ts` (`change`, `setPassword`); `src/webview/users.ts` (`openUserForm`).

Acceptance:

- [ ] **Change password** for `app@shop` sends `updateUser: "app"` to `shop` with the password only, and the roles
  of the user are the same afterwards.
- [ ] The Log has `[user.change-password] db.getSiblingDB("shop").runCommand({ updateUser: "app", pwd: "***" })` and
  the password nowhere.
- [ ] For the user the connection is signed in as, the dialog has the note and the notification has **Save in the
  connection**; after it, the connection's secrets hold the new password, which is in no file in clear text, in no
  message of the bridge and in no line of the Log, and the next connect signs in with it.
- [ ] For another user the notification has no **Save in the connection**.
- [ ] An empty password is refused with *Enter a password, or generate one.* and nothing is sent.
- [ ] After **Generate**, the field shows 24 characters and **Copy** copies them.
- [ ] On a read-only connection **Password…** is not shown, and the command is refused with the code
  `user.change-password/read-only`.

### `user.grant-role` — Grant a role to a user

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/user/grant-role.ts › plan(context, answers)`
- **Entry points**: **Grant**, or `Enter` in its field, in the inspector of a user (`@inspector`).
- **Offered when**: a user, on a connection that is not read-only.
- **Asks**: nothing more: the role and its database are the values of the inspector's controls.
- **Plan**: one step: `db.getSiblingDB("shop").runCommand({ grantRolesToUser: "app", roles: ["read"] })`; for a role
  of another database, `roles: [{ role: "read", db: "reporting" }]` (`user.role-reference`).
- **Danger**: None: the role is taken away again with its `✕`.
- **Read-only**: Refused on a read-only connection (`/read-only`).
- **Undo**: Cannot be undone from the undo history: a user is not a document Datardo writes. Revoking the role
  reverses it.
- **After**: the lists are read again; *Granted read@reporting to app@shop.* (`runner.notify`).
- **Refuses**: a read-only connection (`/read-only`): *The connection Production is read-only: users and roles can't
  be changed.*; no role (`/no-role`): *Choose a role to grant.*
- **Commands**: `user.grant-role`
- **Uses**: `user.role-reference`, `runner.run`, `runner.notify`.
- **Ported from**: `src/users.ts` (`change`, `grantRoles`); `src/webview/users.ts` (`userDetail`).

Acceptance:

- [ ] `read` in `shop` for `app@shop` sends `{ grantRolesToUser: "app", roles: ["read"] }` to `shop`; `read` in
  `reporting` sends `roles: [{ role: "read", db: "reporting" }]`.
- [ ] After it, the user's row and inspector show the new role and the notification says *Granted read@reporting to
  app@shop.*
- [ ] **Grant** with an empty field sends nothing.
- [ ] A role the server does not know leaves the user as it was and shows the server's error.
- [ ] On a read-only connection **Grant** is not shown, and the command is refused with the code
  `user.grant-role/read-only`.

### `user.revoke-role` — Revoke a role from a user

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/user/revoke-role.ts › plan(context, answers)`
- **Entry points**: `✕` on the chip of a role in the inspector of a user (`@inspector`).
- **Offered when**: a role of a user, on a connection that is not read-only.
- **Reads**: `user.signed-in`, to know whether the user is the connection's own.
- **Plan**: one step: `db.getSiblingDB("shop").runCommand({ revokeRolesFromUser: "app", roles: ["read"] })`; for a
  role of another database, `roles: [{ role: "read", db: "reporting" }]`.
- **Danger**: Confirm. **Revoke read@reporting from app@shop?** says *The user loses the privileges of the role.*,
  or, when the connection is signed in as that user, *This connection signs in as that user: it may lose access.*
  The button is **Revoke**.
- **Read-only**: Refused on a read-only connection (`/read-only`).
- **Undo**: Cannot be undone from the undo history: a user is not a document Datardo writes. Granting the role again
  reverses it.
- **After**: the lists are read again; *Revoked read@reporting from app@shop.* (`runner.notify`).
- **Refuses**: a read-only connection (`/read-only`): *The connection Production is read-only: users and roles can't
  be changed.*
- **Commands**: `user.revoke-role`
- **Uses**: `user.signed-in`, `user.role-reference`, `runner.confirm`, `runner.run`, `runner.notify`.
- **Ported from**: `src/users.ts` (`change`, `revokeRole`); `src/webview/users.ts` (`userDetail`).

Acceptance:

- [ ] `✕` on `read@reporting` of `app@shop` asks **Revoke read@reporting from app@shop?** and, after **Revoke**,
  sends `{ revokeRolesFromUser: "app", roles: [{ role: "read", db: "reporting" }] }` to `shop`.
- [ ] The confirmation shows the step and says that it cannot be undone from the undo history.
- [ ] For the user the connection is signed in as, the confirmation says *This connection signs in as that user: it
  may lose access.*
- [ ] Cancelling the confirmation sends nothing and the chip stays.
- [ ] On a read-only connection `✕` is not shown, and the command is refused with the code
  `user.revoke-role/read-only`.

### `user.delete` — Delete a user

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/user/delete.ts › plan(context, answers)`
- **Entry points**: **Delete** in the menu of a user's row (`@row-menu`) and in the inspector (`@inspector`);
  `Delete` on a selected row (`@table`).
- **Offered when**: a user, on a connection that is not read-only.
- **Reads**: `user.signed-in`, to know whether the user is the connection's own.
- **Plan**: one step: `db.getSiblingDB("shop").runCommand({ dropUser: "app" })`.
- **Danger**: Confirm. **Delete the user app@shop?** says *Applications that use it can no longer sign in. This
  can't be undone.*, which begins with *This connection signs in as that user.* when it does. The button is
  **Delete**.
- **Read-only**: Refused on a read-only connection (`/read-only`).
- **Undo**: Cannot be undone from the undo history: a user is not a document Datardo writes, and its password cannot
  be read back to create it again as it was.
- **After**: the lists are read again; *Deleted the user app@shop.* (`runner.notify`). Deleting the connection's own
  user does not disconnect it: the server decides when the session ends.
- **Refuses**: a read-only connection (`/read-only`): *The connection Production is read-only: users and roles can't
  be changed.*
- **Commands**: `user.delete`
- **Uses**: `user.signed-in`, `runner.confirm`, `runner.run`, `runner.notify`.
- **Ported from**: `src/users.ts` (`change`, `dropUser`); `src/webview/users.ts` (`renderUsers`).

Acceptance:

- [ ] **Delete** on `app@shop` asks **Delete the user app@shop?** with *Applications that use it can no longer sign
  in. This can't be undone.*; after **Delete**, `{ dropUser: "app" }` is sent to `shop` and the row is gone.
- [ ] For the user the connection is signed in as, the text is *This connection signs in as that user. Applications
  that use it can no longer sign in. This can't be undone.*
- [ ] Cancelling sends nothing.
- [ ] The users `app@shop` and `app@crm` are two users: deleting the first leaves the second.
- [ ] On a read-only connection **Delete** is not shown, and the command is refused with the code
  `user.delete/read-only`.

### `user.create-role` — Create a custom role

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/user/create-role.ts › plan(context, answers)`
- **Entry points**: **Create role…** in the **Roles** section (`@toolbar`). Go to: **Create role…**.
- **Offered when**: the connection is not read-only.
- **Asks**: in the dialog **New role** (`@dialog`, `runner.ask`):
  - **Name** (placeholder *role name*);
  - **Database**, with the note *Roles defined in admin can grant privileges on every database*: it starts as the
    database chosen in the page, or `admin` with **All databases**;
  - **Privileges**, an editor (`@editor`) of 8 lines with the note *mongosh syntax; collection "" means every
    collection of the database* and, while it is empty, the example
    `[{ resource: { db: "shop", collection: "orders" }, actions: ["find", "insert", "update"] }, { resource: { db:
    "shop", collection: "" }, actions: ["find"] }]` on four lines;
  - **Inherits**: rows of a role, *in*, a database, as the **Roles** of `user.create`, with **+ Role**; none to
    start with.

  The button is **Create role**.
- **Plan**: one step: `db.getSiblingDB("shop").runCommand({ createRole: "reader", privileges: [{ resource: { db:
  "shop", collection: "orders" }, actions: ["find"] }], roles: ["read"] })`. Empty **Privileges** are sent as
  `privileges: []`, no inherited roles as `roles: []`; the roles are written as `user.role-reference` says.
- **Danger**: None: a new role grants nothing until it is granted.
- **Read-only**: Refused on a read-only connection (`/read-only`).
- **Undo**: Cannot be undone from the undo history: a role is not a document Datardo writes. **Delete** removes it.
- **After**: the lists are read again; *Created the role reader@shop.* (`runner.notify`).
- **Refuses**: a read-only connection (`/read-only`): *The connection Production is read-only: users and roles can't
  be changed.*; an empty name (`/no-name`): *Enter the name of the role.*; privileges that cannot be read
  (`/privileges`): *Privileges:* followed by the error; privileges that are not a list (`/not-a-list`): *Privileges
  must be an array: [{ resource: { db: "shop", collection: "" }, actions: ["find"] }]*. The last three are shown in
  the dialog, which stays open with what was typed.
- **Commands**: `user.create-role`
- **Uses**: `user.role-reference`, `query.parse`, `runner.ask`, `runner.run`, `runner.notify`.
- **Ported from**: `src/users.ts` (`change`, `saveRole`); `src/webview/users.ts` (`openRoleForm`).

Acceptance:

- [ ] `reader` in `shop` with the privileges `[{ resource: { db: "shop", collection: "orders" }, actions: ["find"]
  }]` and inheriting `read` in `shop` sends `createRole: "reader"` to `shop` with that list and `roles: ["read"]`.
- [ ] With **Privileges** empty and one inherited role, `privileges: []` is sent.
- [ ] `{ resource: { db: "shop", collection: "" }, actions: ["find"] }` without the brackets is refused with
  *Privileges must be an array: …*; `[{ resource: ` is refused with *Privileges:* and the error of the parser.
- [ ] A role inherited from `admin` is sent as `{ role: "clusterMonitor", db: "admin" }`.
- [ ] After it the role is listed among the custom roles, with the summary `shop.orders: find`.
- [ ] On a read-only connection **Create role…** is not shown, and the command is refused with the code
  `user.create-role/read-only`.

### `user.edit-role` — Edit a custom role

Replaces the privileges and the inherited roles of a custom role.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/user/edit-role.ts › plan(context, answers)`
- **Entry points**: **Edit…** in the menu of a custom role's row (`@row-menu`) and in the inspector (`@inspector`);
  `Enter` on a selected row (`@table`).
- **Offered when**: a custom role, on a connection that is not read-only. A built-in role cannot be edited.
- **Asks**: in the dialog **Edit reader@shop** (`@dialog`, `runner.ask`), the fields of `user.create-role`: **Name**
  and **Database** show the role and cannot be changed; **Privileges** starts with the role's own privileges as the
  server reports them, in mongosh syntax, one per line, and empty when it has none; **Inherits** starts with the
  roles it inherits. The button is **Save role**.
- **Plan**: one step: `db.getSiblingDB("shop").runCommand({ updateRole: "reader", privileges: [{ resource: { db:
  "shop", collection: "" }, actions: ["find"] }], roles: [] })`. Both lists are always sent and each replaces the
  role's: emptying **Privileges** removes them all.
- **Danger**: None: there is no confirmation beyond the dialog. Every user and role that has the role gains or loses
  the privileges at once.
- **Read-only**: Refused on a read-only connection (`/read-only`).
- **Undo**: Cannot be undone from the undo history: a role is not a document Datardo writes. The role's **Raw**,
  copied before, has the privileges and the roles it had.
- **After**: the lists are read again; *Updated the role reader@shop.* (`runner.notify`).
- **Refuses**: as `user.create-role`, with the codes of this card (`/read-only`, `/privileges`, `/not-a-list`); a
  built-in role (`/built-in`): *Built-in roles can't be changed.*; a role that is no longer there when it is read
  (`/gone`): *The role reader@shop no longer exists.*
- **Commands**: `user.edit-role`
- **Uses**: `user.list-roles`, `user.role-reference`, `query.parse`, `query.format`, `runner.ask`, `runner.run`,
  `runner.notify`.
- **Ported from**: `src/users.ts` (`change`, `saveRole`); `src/webview/users.ts` (`openRoleForm`).

Acceptance:

- [ ] **Edit…** on `reader@shop` opens the dialog with its name and database fixed, its privileges as text and its
  inherited roles as rows.
- [ ] Saved without a change, it sends `updateRole` with the same privileges and roles the server reported.
- [ ] Removing the last inherited role sends `roles: []`; emptying **Privileges** sends `privileges: []`.
- [ ] A privilege on `{ cluster: true }` read from the server is written `{ resource: { cluster: true }, actions:
  […] }` in the dialog and sent back the same.
- [ ] A built-in role has no **Edit…**, and the command started on one is refused with *Built-in roles can't be
  changed.* and sends nothing.
- [ ] On a read-only connection **Edit…** is not shown, and the command is refused with the code
  `user.edit-role/read-only`.

### `user.delete-role` — Delete a custom role

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/user/delete-role.ts › plan(context, answers)`
- **Entry points**: **Delete** in the menu of a custom role's row (`@row-menu`) and in the inspector
  (`@inspector`); `Delete` on a selected row (`@table`).
- **Offered when**: a custom role, on a connection that is not read-only.
- **Plan**: one step: `db.getSiblingDB("shop").runCommand({ dropRole: "reader" })`.
- **Danger**: Confirm. **Delete the role reader@shop?** says *The users and roles that have it lose its privileges.
  This can't be undone.* The button is **Delete**.
- **Read-only**: Refused on a read-only connection (`/read-only`).
- **Undo**: Cannot be undone from the undo history: a role is not a document Datardo writes, and the server forgets
  who had it. Creating it again from its **Raw**, copied before, does not grant it again.
- **After**: the lists are read again; *Deleted the role reader@shop.* (`runner.notify`).
- **Refuses**: a read-only connection (`/read-only`): *The connection Production is read-only: users and roles can't
  be changed.*; a built-in role (`/built-in`): *Built-in roles can't be changed.*
- **Commands**: `user.delete-role`
- **Uses**: `runner.confirm`, `runner.run`, `runner.notify`.
- **Ported from**: `src/users.ts` (`change`, `dropRole`); `src/webview/users.ts` (`renderRoles`).

Acceptance:

- [ ] **Delete** on `reader@shop` asks **Delete the role reader@shop?**; after **Delete**, `{ dropRole: "reader" }`
  is sent to `shop` and the row is gone.
- [ ] After it, a user that had the role no longer lists it.
- [ ] Cancelling sends nothing.
- [ ] A built-in role has no **Delete**, and the command started on one is refused with *Built-in roles can't be
  changed.*
- [ ] On a read-only connection **Delete** is not shown, and the command is refused with the code
  `user.delete-role/read-only`.

### `user.role-reference` — How a role is written, suggested and sent

One role in the three forms the area needs: the label of a table, the whole name, and the argument of a command;
and the names a field for a role suggests.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/user/role-reference.ts › roleLabel(role, database)`, with `› roleName(role)`, `›
  roleArgument(role, database)`, `› suggestedRoles(customRoles)` and `› existsOnlyInAdmin(name)`
- **Uses**: used by `user.show`, `user.inspect`, `user.create`, `user.grant-role`, `user.revoke-role`,
  `user.create-role`, `user.edit-role`.
- **Ported from**: `src/users.ts` (`rolesArg`, `refText`); `src/webview/users.ts` (`roleLabel`, `roleKey`,
  `ADMIN_ONLY`, the list of role names).

Rules:

1. The whole name is `role@database`: `read@reporting`.
2. The label of a role beside a user or a role of a given database is the role alone when it is of that database,
   the whole name otherwise.
3. The argument of a command sent to a database is the role's name as a string when the role is of that database,
   and `{ role: "<name>", db: "<database>" }` otherwise.
4. The names suggested are, in this order: `read`, `readWrite`, `dbAdmin`, `dbOwner`, `userAdmin`, `clusterAdmin`,
   `clusterManager`, `clusterMonitor`, `hostManager`, `backup`, `restore`, `readAnyDatabase`,
   `readWriteAnyDatabase`, `userAdminAnyDatabase`, `dbAdminAnyDatabase`, `enableSharding`, `root`; then the custom
   roles read, each name once. Any other name can be typed.
5. The built-in roles that exist only in `admin` are all of those but `read`, `readWrite`, `dbAdmin`, `dbOwner` and
   `userAdmin`. Choosing one sets the database beside it to `admin`; the database can still be changed afterwards.

Worked examples:

| Role | Beside | Label | Argument |
| --- | --- | --- | --- |
| `readWrite` of `shop` | the user `app@shop` | `readWrite` | `"readWrite"` |
| `read` of `reporting` | the user `app@shop` | `read@reporting` | `{ role: "read", db: "reporting" }` |
| `clusterMonitor` of `admin` | the user `app@shop` | `clusterMonitor@admin` | `{ role: "clusterMonitor", db: "admin" }` |
| `clusterMonitor` of `admin` | the user `ops@admin` | `clusterMonitor` | `"clusterMonitor"` |
| `read` of `shop` | the role `reader@shop` | `read` | `"read"` |

Acceptance:

- [ ] The examples above give the labels and the arguments shown.
- [ ] `root`, `backup` and `readAnyDatabase` exist only in `admin`; `dbOwner` and `userAdmin` do not.
- [ ] With the custom roles `reader@shop` and `reader@crm`, `reader` is suggested once, after `root`.

### `user.privilege-summary` — The privileges of a role in short

The text of a resource, and the one line that says what a role grants.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/user/privilege-summary.ts › privilegeSummary(role)`, with `› resourceText(resource)`
- **Uses**: used by `user.list-roles`, `user.show`, `user.inspect`.
- **Ported from**: `src/users.ts` (`resourceText`); `src/webview/users.ts` (`privilegeSummary`).

Rules of the text of a resource, the first that applies:

1. `{ cluster: true }` → `cluster`.
2. `{ anyResource: true }` → `any resource`.
3. A resource with `db` or `collection` → `<db>.<collection>`, an empty or missing one written `*`.
4. Anything else → the resource as JSON.

Rules of the summary:

1. Each privilege is `<resource>: <actions>`, the actions joined by `, `. With more than 4 actions, the first 4 are
   followed by ` +N`, N being the others.
2. The privileges are joined by ` · `, in the order the server reports them.
3. A role with no privileges of its own is `(inherited only)` when it inherits roles, `(none)` otherwise.

Worked examples:

| Resource | Text |
| --- | --- |
| `{ db: "shop", collection: "orders" }` | `shop.orders` |
| `{ db: "shop", collection: "" }` | `shop.*` |
| `{ db: "", collection: "users" }` | `*.users` |
| `{ db: "", collection: "" }` | `*.*` |
| `{ cluster: true }` | `cluster` |
| `{ anyResource: true }` | `any resource` |
| `{ system_buckets: "metrics" }` | `{"system_buckets":"metrics"}` |

| Privileges of the role | Summary |
| --- | --- |
| `find`, `insert` on `shop.orders` | `shop.orders: find, insert` |
| `find`, `insert` on `shop.orders`; 7 actions on `shop.*`, the first four `find`, `insert`, `update`, `remove` | `shop.orders: find, insert · shop.*: find, insert, update, remove +3` |
| exactly 4 actions `find`, `insert`, `update`, `remove` on `shop.*` | `shop.*: find, insert, update, remove` |
| none, inherits `read@shop` | `(inherited only)` |
| none, inherits nothing | `(none)` |

Acceptance:

- [ ] The examples above give the texts shown.
- [ ] The tooltip of the **Privileges** cell has the same text as the cell, whole.
- [ ] The **Privileges** table of the inspector lists all the actions of a privilege, not the first 4.

### `user.generate-password` — A random password

The password **Generate** proposes: long enough not to be guessed, and made only of characters that need no escaping
in a connection string and are not mistaken for one another.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/user/generate-password.ts › generatePassword(randomBytes)`
- **Entry points**: **Generate** in the dialogs of `user.create` and `user.change-password` (`@dialog`).
- **Uses**: used by `user.create`, `user.change-password`.
- **Ported from**: `src/webview/users.ts` (`generatePassword`).

Inputs: bytes from the system's cryptographic random generator, as many as it takes. Output: a text of 24
characters.

Rules:

1. The alphabet has 57 characters: `ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789`. It has no `I`, `O`,
   `l`, `0` or `1`, and no punctuation.
2. Each byte below 228 gives the character at the position *byte modulo 57*. A byte of 228 or more is thrown away:
   228 is four times 57, so every character is equally likely.
3. Bytes are taken until there are 24 characters: about 140 bits.
4. The password is made where it is typed and goes nowhere but the field: it is not stored, not logged, and not
   remembered after the dialog and its notification close.

Worked examples (bytes → characters): `0` → `A`; `56` → `9`; `57` → `A`; `24` → `a`; `227` → `9`; `228` → no
character; `255` → no character.

Acceptance:

- [ ] The examples above give the characters shown.
- [ ] 24 bytes of `0` give `AAAAAAAAAAAAAAAAAAAAAAAA`; the bytes `228, 0` repeated give the same after 48 bytes.
- [ ] Every password has 24 characters, all of the alphabet.
- [ ] Two passwords generated one after the other differ.
- [ ] After **Generate** the field shows the password and its button says **Hide**.
