# Backup

Backing up connections, databases and collections, and restoring them, in mongodump's formats, so that `mongodump`
and `mongorestore` read and write the same files: a single archive (`.agz`, as `mongodump --archive --gzip` writes
it) or a folder with a subfolder per database. Backups that run by themselves are scheduled tasks (`task.run`);
exports to JSON and CSV are in [transfer.md](transfer.md).

Documents are written to a backup exactly as the server stores them, byte for byte, and restored with every value in
its BSON type. A backup and a restore are long work: each shows on the status line what it is doing and how far it
is (`runner.progress`), with **Cancel** (`runner.cancel`).

### `backup.create` — Back up a connection, a database or a collection

Saves the chosen databases, the chosen collections of a database, or one collection or view to an archive or a
folder, which `mongorestore` and **Restore from backup…** read back.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/backup/create.ts › plan(context, answers)`
- **Entry points**: **Back up…** in the context menu of a database, a collection or a view of the tree
  (`@tree-menu`); for a whole connection, in the menu of the connection island (`@connection-island`), in the context
  menu of the connection in the connection switcher (`@connection-switcher`) and of its card on Home (`@home`); Go to
  (**Back up…**), for the current connection.
- **Offered when**: on MongoDB connections, read-only ones included.
- **Asks**, each titled **Back up \<what\>: \<step\>**, where \<what\> is the connection's name, the database, or
  `<database>.<collection>`:
  1. on a connection with more than one database, **databases**: all its databases except `admin`, `local` and
     `config`, sorted, all checked; on a database with more than one collection, **collections**: all except
     `system.*`, sorted, all checked, views marked *view*;
  2. **format**: **Archive (.agz)** (*a single gzipped file; restore with mongorestore --gzip --archive*), **Folder,
     compressed (gzip)** (*.bson.gz files; restore with mongorestore --gzip --dir*), **Folder, uncompressed** (*.bson
     files*);
  3. for an archive, the system's save dialog titled **archive**, which proposes `<what>_<YYYY-MM-DD_HH-MM-SS>.agz`
     (white space and the characters `\ / : * ? " < > |` of \<what\> become `_`), with the filter *mongodump archive
     (gzip)* and the button **Back up**; for a folder, the system's folder dialog titled **folder**, with the button
     **Back up here**, in which a new folder `<what>_<YYYY-MM-DD_HH-MM-SS>` is created (`_2`, `_3`… when the name
     exists). Both start in the folder of the last backup, otherwise in the home folder.
- **Reads**: `listDatabases`, `listCollections`, `listIndexes`, `buildInfo` (the server's version, for the archive's
  header), `db.<collection>.estimatedDocumentCount()` of each collection for the progress, and the documents with
  `db.<collection>.find({})` in batches of 1,000, as stored, without decoding them.
- **Plan**: files only. For an archive, `write <file>.agz`: the gzipped archive of `backup.archive-write`. For a
  folder, `create <folder>`, then per database a subfolder with `write <collection>.metadata.json` and `write
  <collection>.bson` (a view: the metadata only), or `.metadata.json.gz` and `.bson.gz` (`backup.folder-layout`).
- **Danger**: None. An archive replaces an existing file only after the save dialog's own confirmation; a folder
  backup always writes a new folder.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone, and needs none: it writes files, not a deployment.
- **After**: *Backed up \<what\> (\<n\> collections, \<n\> documents, \<size\>) to \<path\> in \<s\> s.*, with **Copy
  mongorestore command** (it copies `mongorestore --gzip --archive="<path>"`, `mongorestore --gzip --dir "<path>"` or
  `mongorestore --dir "<path>"`) and **Reveal file** or **Reveal folder**. The size is that of the documents before
  compression. With time series collections left out it is a warning that ends with *Time series collections aren't
  supported and were left out (use mongodump): \<database\>.\<collection\>, ….*
- **Refuses**: a connection that can't be reached: *Could not connect to \<name\>: \<error\>* (`/not-connected`); no
  databases: *\<name\> has no databases to back up.* (`/no-databases`); only time series collections: *Nothing to
  back up: time series collections aren't supported (use mongodump).* (`/unsupported`); nothing else: *Nothing to
  back up in \<what\>.* (`/empty`). An error before writing: *Backup failed: \<error\>*; while writing: *Backup of
  \<what\> failed: \<error\>*, and the incomplete archive or folder is deleted.
- **Commands**: `backup.create`.
- **Uses**: `backup.archive-write`, `backup.folder-layout`, `runner.ask`, `runner.progress`, `runner.cancel`,
  `runner.notify`; `task.run` writes its backups the same way, without asking.
- **Ported from**: Mongoster's card backup.create; `src/backup.ts` (`Backups.backup`, `writeBackup`,
  `backupDatabases`, `backupCollections`, `leaveOutUnsupported`, `backupTotals`, `archiveOf`, `dumpCollection`,
  `rawDocuments`, `collectionMetadata`, `mongorestoreCommand`, `uniquePath`), `src/archive.ts`.

Acceptance:

- [ ] **Back up…** on a connection with the databases `admin`, `shop` and `logs` offers `logs` and `shop`, both
  checked.
- [ ] A connection with one database, or a database with one collection, is not asked which.
- [ ] An archive of `shop` restores with `mongorestore --gzip --archive="<path>"` and gives the same documents, byte
  for byte.
- [ ] A compressed folder backup of `shop.orders` writes `<what>_<date>_<time>/shop/orders.bson.gz` and
  `orders.metadata.json.gz`; an uncompressed one `orders.bson` and `orders.metadata.json`.
- [ ] A view gets only its metadata file, in a folder; in an archive it is listed and ended, without documents.
- [ ] A time series collection is left out, and the result is a warning naming it.
- [ ] The status line's **Backing up \<what\>** says *\<database\>.\<collection\>: \<n\> documents* every 1,000
  documents.
- [ ] **Cancel** stops after the current 1,000 documents, deletes the incomplete archive or folder, and says *Backup
  of \<what\> cancelled: the incomplete backup was deleted.*
- [ ] **Copy mongorestore command** puts the command on the clipboard; **Reveal folder** shows the new folder in the
  system's file manager.
- [ ] A backup of `Local shop` made on 8 October 2026 at 16:45:12 proposes `Local_shop_2026-10-08_16-45-12.agz`.
- [ ] The backup works on a read-only connection.

### `backup.restore` — Restore from a backup

Writes the collections of a backup, Datardo's or mongodump's, archive or folder, back into a connection, a database
or a collection.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/backup/restore.ts › plan(context, answers)`
- **Entry points**: **Restore from backup…** in the context menu of a database or a collection of the tree
  (`@tree-menu`); for a whole connection, in the menu of the connection island (`@connection-island`), in the context
  menu of the connection in the connection switcher (`@connection-switcher`) and of its card on Home (`@home`); Go to
  (**Restore from backup…**), for the current connection.
- **Offered when**: on MongoDB connections that are not read-only, their databases and their collections; not on
  views.
- **Asks**, each titled **Restore into \<where\>: \<step\>**, where \<where\> is `<connection>`, `<connection> ›
  <database>` or `<connection> › <database>.<collection>`:
  - On a connection or a database:
    1. **backup**: **Archive** (*a single .agz or .archive file (mongodump --archive)*) or **Folder** (*a folder
       backup (mongodump --out), or the folder of one database*);
    2. the file, with the filters *mongodump archive* (`agz`, `archive`, `gz`) and *All files*, or the folder; the
       button is **Restore**, and the dialog starts in the folder of the last backup;
    3. with more than one database in the backup: on a connection, **databases**, all checked, each with its number
       of collections; on a database, **database of the backup**, the one to restore into it;
    4. on a connection with one database chosen, **database** (*Database on \<connection\> to restore \<name\>
       into*): the name to restore it under, its own by default;
    5. for each database with more than one collection, **collections of \<database\>**: all checked, each with the
       size of its file, or *view or metadata only*.
  - On a collection, **BSON file or archive**: a `.bson` or `.bson.gz` file (its `.metadata.json` or
    `.metadata.json.gz` next to it is used when there is one) or an archive, with the filters *BSON or archive
    (mongodump)* (`bson`, `gz`, `agz`, `archive`) and *All files*; for an archive, **collection of the archive**,
    the one to restore into it, the same name first, unless the archive has only one.
  - Then **existing collections**: **Add documents** (*documents whose _id already exists are kept and skipped*) or
    **Drop and restore** (*each collection is dropped first, like mongorestore --drop*).
- **Reads**: the backup's list of collections: the start of an archive (`backup.archive-read`), or the files of a
  folder (`backup.folder-layout`), with their metadata (options, indexes, type); `listCollections` of each database
  restored into, for the collections that exist. While it runs: an archive once from start to end, also when its
  collections alternate; a folder's `.bson` files one after the other.
- **Plan**, per collection:
  1. with **Drop and restore**, `db.<collection>.drop()` when it exists;
  2. when it doesn't exist, or was dropped, `db.createCollection("<collection>", <options>)` with, of the backup's
     options, only those `transfer.copy-collection` copies; for a view, `db.createCollection("<collection>", {
     viewOn, pipeline })`, with its `collation` when it has one;
  3. `db.<collection>.insertMany([<documents>], { ordered: false, bypassDocumentValidation: true })`, in batches of
     1,000 documents or 8 MB, whichever comes first;
  4. unless cancelled, `db.<collection>.createIndexes([<index>])` for each index of the metadata except `_id_` and a
     clustered one, without its `v` and `ns`.
- **Danger**: Confirm: **Restore \<n\> collections into \<connection\> › \<databases\>?**, with *From \<path\>.*,
  then *Existing collections with the same names are dropped first, with their documents and indexes: this can't be
  undone.* or *Documents are added; those whose _id already exists are skipped.*, and with **Add documents** the line
  about undo below; button **Restore**. Destructive with **Drop and restore** when at least one of the collections
  exists: their documents and indexes are lost, and the user types the name of what is restored into: the collection
  when there is one, the database when they are all in one, otherwise the connection.
- **Read-only**: Refused on a read-only connection: *The connection \<name\> is read-only: nothing can be restored
  into it.* (`/read-only`).
- **Undo**: With **Add documents**, recorded in the undo history (`undo.record`), one operation per collection,
  titled `Restore <file>` (a folder) or `Restore <collection> from <archive>`, which keeps the `_id`s inserted; the
  confirmation says *It can be undone from the Undo history, for collections of up to 10,000 documents.*, a
  collection of more than `datardo.undo.maxDocumentsPerOperation` documents is not recorded, and nothing more is
  asked about it. When the undo history is off, the confirmation has the line of `undo.note` instead. With **Drop
  and restore**: Cannot be undone, and the confirmation says *this can't be undone*.
- **Publishes**: Not published: restoring is one of the writes Mongoster documents as not published, and Datardo
  keeps that list until the question is answered (`oplog.publish`).
- **After**: the tree and the open pages of the restored collections read again. *Restored \<n\> documents and \<k\>
  indexes in \<c\> collections into \<connection\> › \<databases\> in \<s\> s.*, followed, when they apply, by *\<k\>
  skipped (their _id already existed)*, *\<f\> failed: \<first error\>*, *Index not created —
  \<collection\>.\<index\>: \<error\>*, *Not restored: \<database\>.\<collection\> (\<why\>)* (then it is a warning),
  and *Undo from the Undo history, one operation per collection* when more than one was recorded; **Undo** in the
  notification when exactly one was (`undo.notification`).
- **Refuses**: an archive that can't be read: *Can't read \<file\>: \<error\>* (`/unreadable`); one without
  collections: *\<file\> has no collections to restore.* (`/empty`); a folder without backup files: *No backup found
  in \<folder\>: expected \<collection\>.bson and \<collection\>.metadata.json files (mongodump), or a folder of them
  per database.* (`/no-backup`). Not restored, and said in the result: a time series collection (*a time series
  collection (use mongorestore)*) and, with **Add documents**, a view that exists (*a view that already exists*). A
  damaged or cut archive, or any error: *Restore into \<where\> failed: \<error\>*, followed by *Restored before the
  error: \<summary\>.* when something was.
  A read-only connection is refused as **Read-only** says (`/read-only`).
- **Commands**: `backup.restore`.
- **Settings**: `datardo.undo.enabled`, `datardo.undo.maxDocumentsPerOperation`.
- **Uses**: `backup.archive-read`, `backup.folder-layout`, `transfer.copy-collection` (the options copied),
  `undo.record`, `undo.note`, `undo.limits`, `undo.notification`, `connection.read-only`, `runner.ask`,
  `runner.confirm`, `runner.progress`, `runner.cancel`, `tree.refresh`.
- **Ported from**: Mongoster's card backup.restore; `src/backup.ts` (`Backups.restore`, `CollectionRestore`,
  `scanBackup`, `scanDatabase`, `scanArchive`, `readBson`, `readMetadata`), `src/archive.ts`, `src/copy.ts`
  (`COPIED_OPTIONS`), `src/history.ts`.

Acceptance:

- [ ] An archive written by `mongodump --archive --gzip` and one written by `mongodump --archive` (not gzipped) are
  both recognized from their content, whatever their extension.
- [ ] A folder written by `mongodump --out` restores each database it holds; the folder of a single database
  restores that one.
- [ ] Every value comes back with its BSON type and bytes: `Int32`, `Double`, `-0.0`, `Int64`, `Decimal128`, dates,
  regular expressions, binary, UUIDs, timestamps, `MinKey`, `MaxKey`, code, and field names with dots or `$`.
- [ ] With **Add documents**, a document whose `_id` exists keeps its current value and is counted as skipped.
- [ ] With **Drop and restore**, an existing collection is dropped and created again with the backup's options, then
  its indexes are built after the documents.
- [ ] With **Drop and restore** into the database `shop` where `orders` exists, the confirmation asks to type `shop`
  and **Restore** stays disabled until it matches; where none of the collections exists, nothing is typed.
- [ ] Documents that the collection's validation rules would reject are restored.
- [ ] An archive in which two collections alternate restores both completely, reading the file once.
- [ ] An archive whose checksum of a collection doesn't match stops with *Restore into \<where\> failed: \<file\> is
  damaged: the checksum of \<database\>.\<collection\> doesn't match its documents.*
- [ ] With **Add documents**, each restored collection is one operation of the undo history, and undoing it deletes
  the documents it added, not those that were skipped.
- [ ] **Cancel** stops after the current batch with *Restore into \<where\> cancelled after \<summary\>; those stay.*;
  no index is created for the collection being restored.
- [ ] On a read-only connection the entry is not offered; started from Go to it says *The connection \<name\> is
  read-only: nothing can be restored into it.*
- [ ] With the undo history off for the connection and **Add documents**, the confirmation says *The undo history is
  off for this connection: this can't be undone.*
- [ ] On a connection that publishes for redis-oplog, a restore sends no event.
- [ ] An open collection tab of a restored collection shows the restored documents when the restore ends.

### `backup.archive-write` — Writing a mongodump archive

The bytes of an archive, as `mongodump --archive --gzip` writes them, so that `mongorestore` reads Datardo's
archives.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/backup/archive-write.ts › archivePrelude(serverVersion, collections)`, with
  `namespaceHeader(database, collection, checksum)` and the checksum `Crc64` in the same module.
- **Inputs**: the server's version, the collections with their metadata and type, and each collection's documents as
  stored.
- **Output**: the bytes of the archive, before gzip.
- **Rules**:
  - The archive is, gzipped as a whole: the magic number `0x8199e26d` (4 bytes, little-endian); the header document
    `{ concurrent_collections: 1, version: '0.1', server_version: <the version of buildInfo, or '0.0.0'>,
    tool_version: 'Datardo' }`; one document per collection `{ db, collection, metadata: <canonical Extended JSON
    text>, size: 0, type }`; a terminator (`ff ff ff ff`).
  - Then each collection in turn, never alternating: if it has documents, a namespace header `{ db, collection, EOF:
    false, CRC: 0 }`, its documents exactly as stored, a terminator; then, also for a view or an empty collection, an
    EOF header `{ db, collection, EOF: true, CRC: <checksum> }` and a terminator.
  - The checksum is the CRC-64/XZ (the ECMA polynomial, as Go's `hash/crc64`) of the bytes of all the collection's
    documents, as a signed int64; 0 for no documents.
  - The metadata is that of `backup.folder-layout`.
- **Uses**: `backup.create`, `task.run`, `backup.folder-layout`.
- **Ported from**: Mongoster's card backup.archive-write; `src/archive.ts` (`archivePrelude`, `namespaceHeader`,
  `Crc64`), `src/backup.ts` (`archiveOf`), `test/unit/archive.test.ts`, `test/integration/backup.test.ts`.

Examples:

| Input | Output |
| --- | --- |
| the checksum of the 9 bytes `123456789` | `0x995dc9bbdf1939fa`, as a signed int64 |
| the checksum of `hello, ` then `archive` | that of `hello, archive` |
| the checksum of no bytes | 0 |
| `shop.things` with 3 documents, then the view `shop.recent` | prelude; header of `things`, 3 documents, terminator, EOF header of `things`, terminator; EOF header of `recent` with `CRC: 0`, terminator |

Acceptance:

- [ ] Each row of the table above gives its result.
- [ ] An archive written by Datardo is listed and restored by `mongorestore --gzip --archive`.
- [ ] An archive written and read again (`backup.archive-read`) gives back every document byte for byte, then the
  end of each collection.
- [ ] An `Int64` in a view's pipeline is still an `Int64` in the metadata of the archive.

### `backup.archive-read` — Reading a mongodump archive

How an archive, Datardo's or mongodump's, gzipped or not, is read: its list of collections, then its documents, in
one pass.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/backup/archive-read.ts › readArchiveCollections(bytes)` (the list only) and
  `readArchive(bytes)` (the documents and the end of each collection), over `bsonFrames(bytes)`.
- **Inputs**: the bytes of the file, as they are read.
- **Output**: the list of collections with their metadata and type; then each document with its collection, and the
  end of each collection; or an error.
- **Rules**:
  - Gzip is recognized from the first two bytes (`1f 8b`), not from the extension. The first 4 bytes after it must be
    the magic number, otherwise *\<file\> is not a mongodump archive (mongodump --archive, with or without --gzip).*
  - After the header document, the collection documents until a terminator give the list: database, collection,
    metadata (canonical Extended JSON, so an `Int64` in a view's pipeline stays an `Int64`) and type (`collection`
    when missing). For a restore, entries without a database (mongodump's `--oplog`) and `system.*` collections are
    left out, and databases and collections are sorted by name.
  - Then: a namespace header without `EOF` starts a block; the documents until the next terminator belong to it, each
    given byte for byte. Blocks of different collections may alternate. An `EOF` header ends a collection: the CRC-64
    of all its documents, over all its blocks, must equal its `CRC`, otherwise *\<file\> is damaged: the checksum of
    \<database\>.\<collection\> doesn't match its documents.*
  - A document whose size is below 5 bytes or above 48 MB: *\<file\> is not a mongodump archive (invalid document at
    byte \<n\>).* The end of the file inside the list: *\<file\> is truncated: it ends in its list of collections.*;
    inside a block: *\<file\> is truncated: \<database\>.\<collection\> is incomplete.*; inside a document: *\<file\>
    is truncated: its last document is incomplete.*
  - The documents are given as they are read: a restore has inserted those that came before the EOF header of a
    damaged collection.
  - The bytes read from the file (compressed) are counted, for the progress.
- **Uses**: `backup.restore`, `task.run`.
- **Ported from**: Mongoster's card backup.archive-read; `src/archive.ts` (`readArchiveCollections`, `readArchive`,
  `parseArchive`, `bsonFrames`), `src/backup.ts` (`scanArchive`), `test/unit/archive.test.ts`.

Examples:

| Archive | Read as |
| --- | --- |
| blocks `a(x1, x2)`, `b(y)`, `a(z)`, EOF `b`, EOF `a` | documents of `a`, `a`, `b`, `a`, then the ends of `b` and `a`; the checksum of `a` is over `x1`, `x2`, `z` |
| `shop.things` (3 documents), `logs.events.2024` (1) and `shop.empty` (none) | `things` 3 times, the end of `things`, `events.2024`, its end, the end of `empty` |
| a plain `.bson` file, or one gzipped, given as an archive | *… is not a mongodump archive (mongodump --archive, with or without --gzip).* |
| an archive cut in the middle of a document | *… is truncated: its last document is incomplete.* |
| an archive whose list of collections has no terminator | *… is truncated: it ends in its list of collections.* |

Acceptance:

- [ ] Each row of the table above gives its result.
- [ ] A document split across two reads of the file is given whole.
- [ ] A gzipped archive named with the extension `.archive` and a plain one named `.agz` are both read.
- [ ] One changed byte in a document of `shop.things` gives *\<file\> is damaged: the checksum of shop.things doesn't
  match its documents.* at the end of that collection.

### `backup.folder-layout` — Backup folders and their files

What a backup folder holds and how a folder is recognized as one, the same as `mongodump --out` and `mongorestore
--dir`.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/backup/folder-layout.ts › collectionMetadata(collection, indexes)` (writing),
  `scanBackup(entries)` (reading), `mongorestoreCommand(path, format)` and `uniquePath(path, existing)`.
- **Inputs**: for writing, a collection's name, type, options, UUID and indexes; for reading, the names of the files
  and folders of a folder.
- **Output**: the metadata of a collection; the databases and collections of a backup folder; the command that
  restores a backup; a path that replaces nothing.
- **Rules**:
  - A backup is a folder with one subfolder per database. Each collection has `<name>.bson`, its documents as stored
    one after the other, and `<name>.metadata.json`; compressed, `<name>.bson.gz` and `<name>.metadata.json.gz`. A
    view has only the metadata.
  - The metadata is canonical Extended JSON with the keys in mongodump's order: `options` (when there are any),
    `indexes` (without `ns`; none for a view), `uuid` (hexadecimal, when known), `collectionName`, `type`.
  - Reading a folder: if it holds files named `<name>.bson`, `<name>.bson.gz`, `<name>.metadata.json` or
    `<name>.metadata.json.gz` itself, it is the folder of one database named after it; otherwise each subfolder
    holding such files is a database. `system.*` files are left out; collections and databases are sorted by name.
  - A new backup folder or the output of a scheduled task never replaces something: when the name exists, `_2`,
    `_3`… is added before the extension.
  - The command to restore: `mongorestore --gzip --archive="<file>"` for an archive, `mongorestore --gzip --dir
    "<folder>"` for a compressed folder, `mongorestore --dir "<folder>"` for an uncompressed one.
- **Uses**: `backup.create`, `backup.restore`, `backup.archive-write`, `task.run`.
- **Ported from**: Mongoster's card backup.folder-layout; `src/backup.ts` (`collectionMetadata`, `scanBackup`,
  `scanDatabase`, `mongorestoreCommand`, `uniquePath`), `test/integration/scheduledTasks.test.ts`,
  `test/integration/backup.test.ts`.

Examples:

| Input | Output |
| --- | --- |
| a folder `dump/` with `shop/orders.bson` and `shop/orders.metadata.json` | one database `shop` with the collection `orders` |
| a folder `shop/` with `orders.bson.gz` and `system.views.bson` | one database `shop` with `orders` |
| a folder `shop/` with only `recent.metadata.json` | one database `shop` with `recent`, a view or metadata only |
| a folder with no such files, at any level | no database |
| `shop-orders-20261101` existing | the next is `shop-orders-20261101_2`, then `shop-orders-20261101_3` |
| `nightly.agz` existing | the next is `nightly_2.agz` |
| a capped collection `events` with one index besides `_id_` | `{ "options": { "capped": true, … }, "indexes": [ … ], "uuid": "…", "collectionName": "events", "type": "collection" }` |

Acceptance:

- [ ] Each row of the table above gives its result.
- [ ] A folder written by Datardo is restored by `mongorestore --dir`, and compressed by `mongorestore --gzip --dir`.
- [ ] The metadata of a view has `options` with `viewOn` and `pipeline`, an empty `indexes` and the type `view`.
- [ ] The metadata of a collection without options has no `options` key.
