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
  <collection>.bson` (a view: the metadata only), or `.metadata.json.gz` and `.bson.gz`; the names of the database and
  of the collection are percent-encoded as mongodump does, so that every file is inside the backup's folder whatever
  they are called (`backup.folder-layout`).
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
  `rawDocuments`, `collectionMetadata`, `mongorestoreCommand`, `uniquePath`), `src/archive.ts`; the encoded names of
  Mongoster 0.9.0 (`src/backupNames.ts › backupFileName`).
- **Differs**: (M37) a folder backup names each file and database folder with the name as it is, so a collection
  named `a/b` or `../x` makes the backup fail or write outside its folder, and one named `con` cannot be written on
  Windows (`src/features/backup/folder-layout.ts`).

Acceptance:

- [ ] **Back up…** on a connection with the databases `admin`, `shop` and `logs` offers `logs` and `shop`, both
  checked.
- [ ] A connection with one database, or a database with one collection, is not asked which.
- [ ] An archive of `shop` restores with `mongorestore --gzip --archive="<path>"` and gives the same documents, byte
  for byte.
- [ ] A compressed folder backup of `shop.orders` writes `<what>_<date>_<time>/shop/orders.bson.gz` and
  `orders.metadata.json.gz`; an uncompressed one `orders.bson` and `orders.metadata.json`.
- [ ] A folder backup of a database with the collections `a/b`, `a\b`, `a:b`, `con` and `up/../../../escaped` writes
  two files per collection, all directly in the database's subfolder (`a%2Fb.bson`, `a%5Cb.bson`, `a%3Ab.bson`,
  `%63on.bson`, `up%2F..%2F..%2F..%2Fescaped.bson`), and nothing outside the backup's folder, on Windows as on the
  other systems; `mongorestore --dir` restores them under their names. (differs)
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
       of collections, without those whose name the backup cannot choose as a target: `admin`, `local` and `config`
       in any case (*a system database*) and the names `manage.name-rules` refuses (*not a valid database name*),
       listed under the list as *Not offered: \<database\> (\<why\>), …*; with a single one left, the step is
       skipped. On a database, **database of the backup**, the one to restore into it, whatever its name;
    4. on a connection with one database chosen, **database** (*Database on \<connection\> to restore \<name\>
       into*): the name to restore it under, its own by default; empty, with *(its own name isn't proposed:
       \<why\>)* at the end of the line, when its own is that of a system database or not valid;
    5. for each database with more than one collection, **collections of \<database\>**: all checked, each with the
       size of its file, or *view or metadata only*.
  - On a collection, **BSON file or archive**: a `.bson` or `.bson.gz` file (its `.metadata.json` or
    `.metadata.json.gz` next to it is used when there is one) or an archive, with the filters *BSON or archive
    (mongodump)* (`bson`, `gz`, `agz`, `archive`) and *All files*; for an archive, **collection of the archive**,
    the one to restore into it, the same name first, unless the archive has only one.
  - Then **existing collections**: **Add documents** (*documents whose _id already exists are kept and skipped*) or
    **Drop and restore** (*each collection is dropped first, like mongorestore --drop*).
- **Reads**: the backup's list of collections: the start of an archive (`backup.archive-read`), or the files of a
  folder (`backup.folder-layout`), with their metadata (options, indexes, type, the collection's name);
  `listCollections` of each database restored into, for the collections and views that exist; with **Add documents**,
  `db.<collection>.getIndexes()` of each existing collection whose backup has a TTL index, to tell whether it has the
  same one. While it runs: an archive once from start to end, also when its
  collections alternate; a folder's `.bson` files one after the other.
- **Plan**, per collection:
  1. with **Drop and restore**, `db.<collection>.drop()` when it exists;
  2. when it doesn't exist, or was dropped, `db.createCollection("<collection>", <options>)` with, of the backup's
     options, only those `transfer.copy-collection` copies; for a view, `db.createCollection("<collection>", {
     viewOn, pipeline })`, with its `collation` when it has one;
  3. `db.<collection>.insertMany([<documents>], { ordered: false, bypassDocumentValidation: true })`, in batches of
     1,000 documents or 8 MB, whichever comes first;
  4. unless cancelled, `db.<collection>.createIndexes([<index>])` for each index of the metadata except `_id_` and a
     clustered one, without its `v` and `ns`; and, on a collection that existed and was not dropped, except an index
     with `expireAfterSeconds`, unless the collection already has one with the same key and the same delay: a TTL
     index would make the server delete documents the restore did not bring. The TTL indexes of a collection the
     restore creates, or drops first, are created.
- **Danger**: Confirm: **Restore \<n\> collections into \<connection\> › \<databases\>?**, with *From \<path\>.*,
  then *Existing collections with the same names are dropped first, with their documents and indexes: this can't be
  undone.* or *Documents are added; those whose _id already exists are skipped.*; with **Drop and restore**, when the
  backup has a view whose name is now a collection's, *The backup has a view in place of this collection, which is
  dropped with its documents: \<database\>.\<collection\>.* (*these collections, which are dropped with their
  documents: …* for several); when databases were left out at step 3, *Not restored: \<database\> (\<why\>), ….*;
  with **Add documents** the line about undo below; button **Restore**. Destructive with **Drop and restore** when at
  least one of the collections exists: their documents and indexes are lost, also those of a collection that a view
  of the backup replaces, and the user types the name of what is restored into: the collection when there is one,
  the database when they are all in one, otherwise the connection.
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
  \<collection\>.\<index\>: \<error\>* (for a TTL index kept off an existing collection: *a TTL index
  (expireAfterSeconds) would make the server delete documents that were already in the collection; create it from
  the Indexes section if it's wanted*), *Not restored: \<database\>.\<collection\> (\<why\>), \<database\>
  (\<why\>)* with the collections not restored and the databases left out (then it is a warning), and *Undo from the
  Undo history, one operation per collection* when more than one was recorded; **Undo** in the notification when
  exactly one was (`undo.notification`).
- **Refuses**: an archive that can't be read: *Can't read \<file\>: \<error\>* (`/unreadable`); one without
  collections: *\<file\> has no collections to restore.* (`/empty`); a folder without backup files: *No backup found
  in \<folder\>: expected \<collection\>.bson and \<collection\>.metadata.json files (mongodump), or a folder of them
  per database.* (`/no-backup`); on a connection, a backup of several databases none of which can be restored under
  its name: *Nothing of \<file\> is restored under the names it gives: \<database\> (\<why\>), …. To restore one of
  them, use Restore from backup… on the database to restore it into.* (`/system-databases`). Not restored, and said
  in the result: a time series collection (*a time series
  collection (use mongorestore)*) and, with **Add documents**, a view that exists (*a view that already exists*). A
  damaged or cut archive, or any error: *Restore into \<where\> failed: \<error\>*, followed by *Restored before the
  error: \<summary\>.* when something was.
  A read-only connection is refused as **Read-only** says (`/read-only`).
- **Commands**: `backup.restore`.
- **Settings**: `datardo.undo.enabled`, `datardo.undo.maxDocumentsPerOperation`.
- **Uses**: `backup.archive-read`, `backup.folder-layout`, `transfer.copy-collection` (the options copied),
  `manage.name-rules` (the names of databases),
  `undo.record`, `undo.note`, `undo.limits`, `undo.notification`, `connection.read-only`, `runner.ask`,
  `runner.confirm`, `runner.progress`, `runner.cancel`, `tree.refresh`.
- **Ported from**: Mongoster's card backup.restore; `src/backup.ts` (`Backups.restore`, `CollectionRestore`,
  `scanBackup`, `scanDatabase`, `scanArchive`, `readBson`, `readMetadata`), `src/archive.ts`, `src/copy.ts`
  (`COPIED_OPTIONS`), `src/history.ts`; the databases left out, the TTL indexes kept off and the collections a view
  replaces from Mongoster 0.9.0 (`src/backup.ts › refusedDatabase`, `collectionsReplacedByViews`,
  `CollectionRestore`; `src/backupNames.ts`).
- **Differs**: (M37) on a connection every database of a backup is offered and restored under its own name, `admin`,
  `local` and `config` included; with **Add documents** every index of the backup is created, TTL indexes included,
  on a collection that was already there; the confirmation of **Drop and restore** does not name the collections a
  view of the backup replaces; a folder's file names are taken as the collections' names as they are
  (`src/features/backup/restore.ts`, `src/features/backup/restoring/choose.ts`).

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
- [ ] A folder backup whose collections are called `a/b`, `con` and `up/../../../escaped` lists them under those names
  and restores them into collections of those names; a folder written before the names were encoded, with
  `a:b.bson`, restores `a:b`. (differs)
- [ ] With **Add documents**, a backup whose metadata has a TTL index `at_ttl` for the existing collection `orders`
  creates its other indexes, keeps the documents that were there, and ends with the warning *Index not created —
  orders.at_ttl: a TTL index (expireAfterSeconds) would make the server delete documents that were already in the
  collection; create it from the Indexes section if it's wanted*. (differs)
- [ ] The same backup creates `at_ttl` on a collection that did not exist, with **Drop and restore**, and, without a
  warning, when `orders` already has a TTL index on the same key with the same delay.
- [ ] On a connection, a backup with the databases `admin`, `shop` and `logs` offers `logs` and `shop` with *Not
  offered: admin (a system database)*; the confirmation and the result say *Not restored: admin (a system database)*.
  (differs)
- [ ] On a connection, a backup with the databases `admin` and `shop` does not ask which: it asks for the
  **database** with `shop`, and says *Not restored: admin (a system database)*; a backup with `Config` and `local`
  only is refused with *Nothing of \<file\> is restored under the names it gives: Config (a system database), local
  (a system database). …* and asks nothing more. (differs)
- [ ] On a connection, a backup of the only database `admin` asks for the **database** with an empty field and
  *(its own name isn't proposed: a system database)*: nothing is restored until a name is typed. (differs)
- [ ] **Restore from backup…** on the database `scratch` restores the `admin` database of a backup into `scratch`.
- [ ] With **Drop and restore**, a backup with the view `orders` on a database where `orders` is a collection says in
  the confirmation *The backup has a view in place of this collection, which is dropped with its documents:
  shop.orders.*, and asks to type the name. (differs)
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
    of all its documents, over all its blocks, must equal its `CRC`, when the header has one, otherwise *\<file\> is
    damaged: the checksum of \<database\>.\<collection\> doesn't match its documents.* A file that ends between two
    blocks, without the `EOF` header of a collection, is not reported: that collection's checksum is never checked.
  - A document whose size is below 5 bytes or above 48 MB: *\<file\> is not a mongodump archive (invalid document at
    byte \<n\>).* The end of the file inside the list: *\<file\> is truncated: it ends in its list of collections.*;
    inside a block: *\<file\> is truncated: \<database\>.\<collection\> is incomplete.*; inside a document: *\<file\>
    is truncated: its last document is incomplete.*
  - The documents are given as they are read: a restore has inserted those that came before the EOF header of a
    damaged collection, and they stay. The checksum is a CRC against damage by accident, checked at each collection's
    end, after its documents were inserted: it tells a damaged file, not a file someone changed on purpose, who can
    write the matching CRC or leave it out.
  - The bytes read from the file (compressed) are counted, for the progress.
- **Uses**: `backup.restore`, `task.run`.
- **Ported from**: Mongoster's card backup.archive-read, as Mongoster 0.9.0 words what the checksum checks;
  `src/archive.ts` (`readArchiveCollections`, `readArchive`, `parseArchive`, `bsonFrames`), `src/backup.ts`
  (`scanArchive`), `test/unit/archive.test.ts`.

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
- [ ] An `EOF` header without `CRC` ends its collection without a check; an archive whose last collection has no
  `EOF` header, the file ending after a terminator, gives every document of it and no error.

### `backup.folder-layout` — Backup folders and their files

What a backup folder holds and how a folder is recognized as one, the same as `mongodump --out` and `mongorestore
--dir`.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/backup/folder-layout.ts › collectionMetadata(collection, indexes)` (writing),
  `scanBackup(entries)` (reading), `mongorestoreCommand(path, format)` and `uniquePath(path, existing)`; with
  `backupFileName(name)` (a name as a file's or a folder's), `backupCollectionName(fileName, metadataName)` and
  `backupDatabaseName(folderName)` (back) in the same module.
- **Inputs**: for writing, a collection's name, type, options, UUID and indexes, and its database's name; for
  reading, the names of the files and folders of a folder, and the `collectionName` of each metadata file.
- **Output**: the metadata of a collection; the names of its files and of its database's folder; the databases and
  collections of a backup folder; the command that restores a backup; a path that replaces nothing.
- **Rules**:
  - A backup is a folder with one subfolder per database. Each collection has `<name>.bson`, its documents as stored
    one after the other, and `<name>.metadata.json`; compressed, `<name>.bson.gz` and `<name>.metadata.json.gz`. A
    view has only the metadata.
  - `<name>`, and the subfolder's name, is the collection's or the database's name as `backupFileName` gives it:
    letters, digits, `_`, `-` and `.` are kept, every other byte of its UTF-8 is `%XX` with upper-case hexadecimal
    digits (`%` itself too); a dot at either end is `%2E`; the first letter of a name Windows reserves (`con`, `prn`,
    `aux`, `nul`, `com0`–`com9`, `lpt0`–`lpt9`, in any case, alone or before a dot) is encoded. A result longer than
    238 characters is cut to its first 208 (never inside a `%XX`), followed by `%24` and the SHA-1 of the name in
    base64url (27 characters), as mongodump does: with `.metadata.json.gz` the file name stays within 255 bytes. So no
    name leaves its folder or names a device, and `mongorestore` decodes them.
  - The metadata is canonical Extended JSON with the keys in mongodump's order: `options` (when there are any),
    `indexes` (without `ns`; none for a view), `uuid` (hexadecimal, when known), `collectionName`, `type`.
  - Reading a folder: if it holds files named `<name>.bson`, `<name>.bson.gz`, `<name>.metadata.json` or
    `<name>.metadata.json.gz` itself, it is the folder of one database named after it; otherwise each subfolder
    holding such files is a database. Collections whose name starts with `system.` are left out, whatever their file
    is called; collections and databases are sorted by name.
  - The collection of a file (`backupCollectionName`): a `<name>` without `%` is the collection's name (also in
    backups written before the names were encoded). With a `%`, the `collectionName` of its metadata is the name when
    `<name>` is that name as it is (an earlier backup of a collection with a `%` in its name), encoded as above,
    percent-encoded in another way (mongodump), or cut with the hash of that name; otherwise, and without metadata,
    `<name>` is percent-decoded, or kept as it is when it cannot be.
  - The database of a folder (`backupDatabaseName`): its name, decoded only when it is exactly what `backupFileName`
    gives for the decoded name; any other folder (mongodump's, an earlier backup's) keeps its name.
  - A new backup folder or the output of a scheduled task never replaces something: when the name exists, `_2`,
    `_3`… is added before the extension.
  - The command to restore: `mongorestore --gzip --archive="<file>"` for an archive, `mongorestore --gzip --dir
    "<folder>"` for a compressed folder, `mongorestore --dir "<folder>"` for an uncompressed one.
- **Uses**: `backup.create`, `backup.restore`, `backup.archive-write`, `task.run`.
- **Ported from**: Mongoster's card backup.folder-layout; `src/backup.ts` (`collectionMetadata`, `scanBackup`,
  `scanDatabase`, `mongorestoreCommand`, `uniquePath`), `test/integration/scheduledTasks.test.ts`,
  `test/integration/backup.test.ts`; the encoded names of Mongoster 0.9.0 (`src/backupNames.ts › backupFileName`,
  `backupCollectionName`, `backupDatabaseName`; `test/unit/backupNames.test.ts`).
- **Differs**: (M37) names are written and read as they are: the file of the collection `a/b` is `a/b.bson`, in a
  folder `a`, and a file name is always taken as the collection's name (`src/features/backup/folder-layout.ts`).

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
| the collections `a/b`, `../x`, `con`, `nul.txt`, `%2e%2e` and `été` | the files `a%2Fb`, `%2E.%2Fx`, `%63on`, `%6Eul.txt`, `%252e%252e` and `%C3%A9t%C3%A9` (`.bson`, `.metadata.json`) |
| the collections `console` and `fs.files` | `console` and `fs.files`, as they are |
| a collection name of 300 letters `a` | `a` 208 times, then `%24` and 27 characters of base64url: 238 characters |
| `a%2Fb.bson` with the `collectionName` `a/b` | the collection `a/b` |
| `a%2Fb.bson` with the `collectionName` `a%2Fb` (an earlier backup) | the collection `a%2Fb` |
| `a%2Fb.bson` without metadata | `a/b`; `100%.bson` without metadata → `100%` |
| `shop/system.views.bson`, and `shop/system%2Eviews.bson` | left out |
| the folders `%6Eul` and `50%` | the databases `nul` and `50%` |

Acceptance:

- [ ] Each row of the table above gives its result.
- [ ] A folder written by Datardo is restored by `mongorestore --dir`, and compressed by `mongorestore --gzip --dir`.
- [ ] The metadata of a view has `options` with `viewOn` and `pipeline`, an empty `indexes` and the type `view`.
- [ ] The metadata of a collection without options has no `options` key.
- [ ] No name of a collection or a database gives a file or a folder outside the backup's folder, a name with `/`,
  `\`, `:` or a control character, or a name Windows reserves; two different names never give the same file.
  (differs)
- [ ] A folder written by mongodump with collections whose names hold `/` or `%`, and a folder written by Datardo
  before the names were encoded, are read with the collections' own names. (differs)
