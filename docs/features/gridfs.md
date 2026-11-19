# GridFS

The files MongoDB keeps in GridFS buckets. A bucket is a pair of collections, `fs.files` with one document per file
and `fs.chunks` with their bytes; the tree shows it as one node under its database, and its page lists the files, to
filter, preview, download, open, upload, rename and delete them, and to edit their metadata. A bucket is created by
its first upload and dropped from the tree.

Everywhere in this area:

- The bucket is written `Local › shop › fs` in titles and messages: the connection, the database, the bucket. In the
  plans, `db` is the database of the bucket and `fs` its name.
- A size is written with `gridfs.size-text`: `717 KB`.
- The controls that write are not shown on a read-only connection, and a feature started anyway is refused.
  Downloading, opening and previewing write nothing to the deployment and are allowed.
- The writes of this area are not recorded in the undo history, and their confirmations say so: keeping a file means
  keeping all its chunks, which the undo history is not made for (`undo.limits`). They are not published for
  redis-oplog either. Only the edit of a files document goes through the document tab, with its own rules.
- An error of the server or of the disk stops the step and is shown as it is (`runner.run`).

### `gridfs.show` — The page of a bucket

Lists the files of a bucket, a page at a time, and starts everything that is done with them.

- **Kind**: View
- **Engine**: MongoDB
- **Function**: `src/features/gridfs/show.ts › view(state)`
- **Entry points**: a click on a bucket in the tree island (`@tree`); **Open GridFS bucket** in its context menu
  (`@tree-menu`); **Open** in the notification of an upload started from the tree (`@notification`). Go to: the
  name of the bucket.
- **Offered when**: the database has a bucket (`gridfs.buckets`).
- **Reads**: `gridfs.list` when the page opens, 300 ms after the filter was last typed in, when the sort or the page
  changes, on **Refresh** and after every change. A reply that arrives after a newer request was sent is dropped.
- **Commands**: `gridfs.show`
- **Uses**: `gridfs.list`, `gridfs.filter`, `gridfs.size-text`, `gridfs.inspect`, `gridfs.upload`,
  `gridfs.download`, `gridfs.open`, `gridfs.rename`, `gridfs.delete`, `tab.open`, `nav.inspector`,
  `nav.status-line`.
- **Ported from**: the GridFS tab, which has no card in Mongoster; `src/gridfs.ts` (`GridFSPanel`),
  `src/webview/gridfs.ts`, `src/extension.ts` (the command that opens a bucket).

The page opens in a tab of its own (`tab.open`), one per bucket, named after the bucket: asking for a bucket whose
tab is open shows that tab.

What it shows, top to bottom:

1. The toolbar (`@toolbar`): the filter, with the placeholder *Filter by name, or { metadata.contentType:
   "image/png" }*; the summary, `1,234 files · 2.1 GB` (`1 file · 717 KB`; nothing when there is no file), of the
   files that match the filter; **Upload…** (*Upload files from disk*), not on a read-only connection; **Refresh**
   (*Reload the files*).
2. The table (`@table`), one row per file:
   - **Name**, the file name, whole in its tooltip;
   - **Size**; the tooltip says `734,003 bytes · chunks of 255 KB`;
   - **Uploaded**, as `2026-11-18 14:02:11` in the local time; the tooltip has the date as the server holds it;
   - **Type**, the content type the files document declares (`gridfs.list`); empty when it declares none;
   - **Metadata**, the `metadata` of the files document without its `contentType`, on one line in mongosh syntax;
     empty when nothing else is there;
   - **_id**, in mongosh syntax.

   A click on **Name**, **Size** or **Uploaded** sorts by it: the name ascending first, the size and the date
   descending first; a second click reverses. The page starts sorted by **Uploaded**, the newest first. Sorting is
   done by the server and goes back to the first page.
3. The pager, only when more than 100 files match: **‹ Previous**, `101–200 of 1,234`, **Next ›**. A page has 100
   files. When a page beyond the end is asked for (files were deleted meanwhile), the last page is shown.

Selecting a row shows the file in the inspector island (`gridfs.inspect`). The context menu of a row and its `…`
button (`@row-menu`) have **Open** (*Open the file with the system's application (a temporary copy)*),
**Download…** (*Save the file to disk*) and, on a connection that is not read-only, **Rename…** and **Delete**
(*Delete the file and its chunks*). `Delete` on a selected row starts the delete.

States:

- *loading*: the table is dimmed while it is read; the rows stay.
- *error*: the message takes the place of the table: the server's, or `Filter:` followed by the error of a filter
  that cannot be read.
- *empty*: *No file matches the filter.* with a filter; otherwise *The bucket is empty: Upload… adds files.*, or
  *The bucket is empty.* on a read-only connection.
- *read-only*: the files, their previews, **Open** and **Download…** work; **Upload…**, **Rename…** and **Delete**
  are not shown, the inspector offers **Show document** in place of **Edit metadata**, and the status line says
  **Read-only**, with the tooltip *The connection is read-only: files can't be uploaded, renamed or deleted*.

Acceptance:

- [ ] A bucket of 1,234 files of 2,254,857,830 bytes in all shows `1,234 files · 2.1 GB`, the first 100 files, the
  newest first, and the pager `1–100 of 1,234` with **‹ Previous** disabled.
- [ ] **Next ›** shows `101–200 of 1,234`; on the last page **Next ›** is disabled; a bucket of 100 files has no
  pager.
- [ ] Typing `logo` in the filter reads the files once, 300 ms after the last key, from the first page, and the
  summary counts only the files that match.
- [ ] A click on **Name** sorts by name ascending; a second click descending; a click on **Size** sorts the largest
  first.
- [ ] A file of 734,003 bytes uploaded with the driver's chunk size shows `717 KB` and the tooltip `734,003 bytes ·
  chunks of 255 KB`.
- [ ] A file with the metadata `{ contentType: "image/png", owner: "ada" }` shows the type `image/png` and the
  metadata `{ owner: "ada" }`; with `{ contentType: "image/png" }` alone the metadata is empty.
- [ ] After the last file of page 13 is deleted, the page shows the files of page 12.
- [ ] The filter `{ length: ` shows `Filter:` and the parser's error in place of the table.
- [ ] On a read-only connection the page lists and previews the files, downloads one, and shows no **Upload…**,
  **Rename…** or **Delete**.

### `gridfs.buckets` — The buckets of a database

Which collections of a database make a bucket, for the tree.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/gridfs/buckets.ts › bucketNames(collections)`
- **Entry points**: the tree island shows the buckets of a database under it (`tree.show`), each with the tooltip
  *GridFS bucket shop.fs (fs.files and fs.chunks)*.
- **Uses**: used by `tree.show`, `gridfs.show`.
- **Ported from**: `src/shared/gridfs.ts` (`bucketNames`).

Inputs: the names of the collections of a database. Output: the names of its buckets.

Rules:

1. A name `X` is a bucket when the database has both `X.files` and `X.chunks`.
2. The buckets are sorted by name.
3. A `.files` collection without its `.chunks`, or the other way round, is not a bucket.

Worked examples (collections → buckets):

| Collections | Buckets |
| --- | --- |
| `orders`, `fs.files`, `fs.chunks` | `fs` |
| `photos.files`, `photos.chunks`, `fs.chunks`, `fs.files` | `fs`, `photos` |
| `media.thumbs.files`, `media.thumbs.chunks` | `media.thumbs` |
| `fs.files` | none |
| `fs.chunks`, `files`, `chunks` | none |

Acceptance:

- [ ] The examples above give the buckets shown.
- [ ] A bucket appears in the tree after its first upload and disappears after it is dropped.

### `gridfs.list` — A page of the files of a bucket

- **Kind**: Read
- **Engine**: MongoDB
- **Function**: `src/features/gridfs/list.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: read by `gridfs.show`.
- **Uses**: `gridfs.filter`. Used by `gridfs.show`, `gridfs.inspect`.
- **Refuses**: a filter that cannot be read (`/filter`): `Filter:` followed by the error of the parser, which the
  page shows in place of the table; nothing is sent.
- **Ported from**: `src/gridfs.ts` (`load`, `toFile`).

Sent, together, with the filter of `gridfs.filter`, the sort and the page:

1. `db.fs.files.find({}).sort({ uploadDate: -1, _id: -1 }).skip(0).limit(100)`. The sort is by `filename`, `length`
   or `uploadDate`, then by `_id` in the same direction, so that files with the same value keep one order from page
   to page.
2. `db.fs.files.aggregate([{ $match: {} }, { $group: { _id: null, n: { $sum: 1 }, bytes: { $sum: "$length" } } }])`:
   the number of files that match and the sum of their sizes.

Returned:

- for each file: its `_id`, as a value with its type and as mongosh text; its name (`filename`, empty when missing);
  its size (`length`); its chunk size (`chunkSize`); its date (`uploadDate`); its content type, which is
  `metadata.contentType` when that is a string, else the `contentType` at the top of the document, which older
  drivers wrote; its `metadata`; and the whole files document as relaxed Extended JSON;
- the number of files that match and their bytes; 0 and 0 when none matches.

Acceptance:

- [ ] The second page sorted by name ascending sends `.sort({ filename: 1, _id: 1 }).skip(100).limit(100)`.
- [ ] The filter `{ filename: { $regex: "logo", $options: "i" } }` is in both the `find` and the `$match`.
- [ ] A files document with `contentType: "image/gif"` at the top and no `metadata` has the type `image/gif`; with
  both, `metadata.contentType` wins.
- [ ] An `_id` that is a string, a number or a UUID is returned with its type, and the features that act on the file
  send it back with that type.
- [ ] An empty bucket returns no file, 0 files and 0 bytes.

### `gridfs.filter` — The filter of the files

What the text of the filter means: part of a name, or a MongoDB filter on the files documents.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/gridfs/filter.ts › filesFilter(text)`
- **Uses**: `query.parse`. Used by `gridfs.list`.
- **Ported from**: `src/gridfs.ts` (`filesFilter`).

Rules, on the text without the spaces around it:

1. Empty → `{}`.
2. Starting with `{` → the filter it writes, in mongosh syntax (`query.parse`). A text that cannot be read is an
   error that starts with `Filter:`.
3. Anything else → the files whose name contains the text, whatever the case: `{ filename: { $regex: <the text>,
   $options: "i" } }`, with a `\` put before each of `. * + ? ^ $ { } ( ) | [ ] \` so that the text is taken as it
   is and not as a regular expression.

Worked examples (text → filter):

| Text | Filter |
| --- | --- |
| (empty) | `{}` |
| `logo` | `{ filename: { $regex: "logo", $options: "i" } }` |
| `logo.png` | `{ filename: { $regex: "logo\\.png", $options: "i" } }` |
| `a+b (1)` | `{ filename: { $regex: "a\\+b \\(1\\)", $options: "i" } }` |
| `{ "metadata.contentType": "image/png" }` | `{ "metadata.contentType": "image/png" }` |
| `{ length: { $gt: 1048576 } }` | `{ length: { $gt: 1048576 } }` |
| `{ uploadDate: { $gte: ISODate("2026-11-01") } }` | the same, with the date as a date |
| `{ length: ` | error: `Filter:` and the parser's message |

Acceptance:

- [ ] The examples above give the filters shown.
- [ ] `LOGO` finds `logo.png` and `Logo-old.png`; `logo.png` does not find `logoXpng`.

### `gridfs.size-text` — A size in words

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/gridfs/size-text.ts › sizeText(bytes)`
- **Uses**: used by `gridfs.show`, `gridfs.inspect`, `gridfs.preview`, `gridfs.upload`, `gridfs.download`,
  `gridfs.delete`.
- **Ported from**: `src/gridfs.ts` (`size`); `src/webview/gridfs.ts` (`size`).

Rules:

1. The bytes are divided by 1,024 while they are 1,024 or more, up to four times: the units are `B`, `KB`, `MB`,
   `GB`, `TB`.
2. In bytes, and from 10 up in any unit, the number is rounded to a whole number. Under 10 in a unit other than
   bytes it has one decimal.

Worked examples: 0 → `0 B`; 512 → `512 B`; 1,023 → `1023 B`; 1,024 → `1.0 KB`; 1,536 → `1.5 KB`; 10,199 → `10.0 KB`;
10,240 → `10 KB`; 261,120 → `255 KB`; 734,003 → `717 KB`; 4,194,304 → `4.0 MB`; 2,254,857,830 → `2.1 GB`.

Acceptance:

- [ ] The examples above give the texts shown.

### `gridfs.inspect` — A file in the inspector

Shows the selected file: its preview, its files document, and what is done with one file.

- **Kind**: View
- **Engine**: MongoDB
- **Function**: `src/features/gridfs/inspect.ts › view(state)`
- **Entry points**: selecting a row of the page of a bucket (`@table`) shows the file in the inspector island
  (`@inspector`).
- **Offered when**: a file is selected.
- **Reads**: `gridfs.preview`, when a file is selected for the first time. The preview is kept until **Refresh** or a
  change of the bucket made from the page.
- **Uses**: `gridfs.preview`, `gridfs.size-text`, `gridfs.open`, `gridfs.download`, `gridfs.rename`,
  `gridfs.delete`, `gridfs.edit-metadata`, `query.format`, `nav.inspector`.
- **Ported from**: `src/webview/gridfs.ts` (`detail`), where the details open under the row.

What it shows, top to bottom:

1. The name of the file, its size, its date and its type.
2. **Open**, **Download…**, and on a connection that is not read-only **Rename…** and **Delete**.
3. **Edit metadata**, or **Show document** on a read-only connection (*Open the files document in a document tab;
   saving it writes it back*); **Copy _id**, which copies the `_id` in mongosh syntax; **Copy name**.
4. The preview:
   - *Loading the preview…* while it is read;
   - an image, shown whole within the width of the inspector, with the file name as its description;
   - a text, as it is, in a fixed-width font; when it was cut, under it *The first 256 KB of 3.2 MB: Open shows the
     whole file.*;
   - for a binary file, *Binary file: the first 512 bytes*, or *Binary file* when it has no more than that, and the
     hex dump of `gridfs.hex-dump`;
   - *The image is larger than 4.0 MB: Open shows it.*;
   - an error, as it is: *The file no longer exists.*, or the server's.
5. **Files document**: the files document in mongosh syntax, on several lines (`query.format`).

Acceptance:

- [ ] Selecting `logo.png` of 12 KB shows the image; selecting it again later does not read it again; **Refresh**
  does.
- [ ] A text file of 3,355,443 bytes shows its first part and *The first 256 KB of 3.2 MB: Open shows the whole
  file.*
- [ ] A file of 300 bytes that is not text shows *Binary file* and 19 lines of hex; one of 2 MB shows *Binary file:
  the first 512 bytes* and 32 lines.
- [ ] **Copy _id** on a file whose `_id` is an ObjectId copies `ObjectId("65f1c0ffee0000000000a2c1")`.
- [ ] On a read-only connection the button is **Show document** and neither **Rename…** nor **Delete** is shown.
- [ ] Selecting a file that was deleted meanwhile shows *The file no longer exists.*

### `gridfs.preview` — The preview of a file

Reads as much of a file as a preview needs and decides whether it is an image, a text or binary.

- **Kind**: Read
- **Engine**: MongoDB
- **Function**: `src/features/gridfs/preview.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: read by `gridfs.inspect`.
- **Uses**: `gridfs.content-type`, `gridfs.hex-dump`, `gridfs.size-text`. Used by `gridfs.inspect`.
- **Ported from**: `src/gridfs.ts` (`preview`, `trimUtf8`, `IMAGE_TYPES`, `isTextType`).

Sent:

1. `db.fs.files.findOne({ _id: ObjectId("65f1c0ffee0000000000a2c1") })`. No document: *The file no longer exists.*
2. `db.fs.chunks.find({ files_id: ObjectId("65f1c0ffee0000000000a2c1") }).sort({ n: 1 })`, limited to the chunks
   that hold the bytes wanted: all of them for an image, those of the first 262,144 bytes (256 KB) otherwise; for a
   file with chunks of 255 KB, 2 chunks. Nothing is read of a file of 0 bytes.

Rules of the result:

1. The type is the content type of the files document or, when it has none, the one of the file's extension
   (`gridfs.content-type`).
2. *Image*, when the type is `image/png`, `image/jpeg`, `image/gif`, `image/webp`, `image/bmp`, `image/x-icon` or
   `image/svg+xml`: the whole file is read and returned with its type. An image of more than 4,194,304 bytes (4 MB)
   is not read: *The image is larger than 4.0 MB: Open shows it.* An SVG image is shown as an image only: nothing in
   it is run or loaded.
3. Otherwise the first 262,144 bytes are read, or the whole file when it is smaller. They are *text* when:
   - the type is a text type (it starts with `text/`, or contains `json`, `xml`, `yaml` or `javascript`): the bytes
     are decoded as UTF-8, and a byte that is not valid becomes `�`; or
   - the type is not a text type, the first 8,192 bytes have no zero byte, and the bytes are valid UTF-8.

   When the file was cut, the last multi-byte character at the cut is dropped before decoding, and the result is
   marked as cut.
4. Otherwise *binary*: the hex dump (`gridfs.hex-dump`) of the first 512 bytes, marked as cut when the file has more
   than 512 bytes.

Worked examples:

| File | Result |
| --- | --- |
| `logo.png`, type `image/png`, 12 KB | image |
| `scan.png`, no type, 5 MB | *The image is larger than 4.0 MB: Open shows it.* |
| `notes.txt`, no type, 1 KB of UTF-8 | text, whole |
| `data.json`, type `application/json`, 3.2 MB | text, the first 256 KB, cut |
| `export.csv`, type `text/csv`, with the byte `0xFF` in it | text, with `�` in its place |
| `README`, no type and no extension, UTF-8 without a zero byte | text |
| `blob`, no type, with a zero byte among its first 8,192 bytes | binary |
| `latin1.dat`, no type, no zero byte, not valid UTF-8 | binary |
| `archive.zip`, type `application/zip`, 2 MB | binary, the first 512 bytes, cut |
| `empty`, 0 bytes | text, empty |

Acceptance:

- [ ] The examples above give the results shown.
- [ ] For `data.json` of 3.2 MB with chunks of 255 KB, two chunks are read and no more.
- [ ] A text cut in the middle of `é` ends before it, with no `�` at the end.
- [ ] An image of exactly 4,194,304 bytes is shown; one byte more is not read.
- [ ] An SVG with a script in it is shown as a picture and the script does not run.
- [ ] The preview works on a read-only connection.

### `gridfs.hex-dump` — The hex dump of the first bytes

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/gridfs/hex-dump.ts › hexDump(bytes)`
- **Uses**: used by `gridfs.preview`.
- **Ported from**: `src/shared/gridfs.ts` (`hexDump`).

Rules:

1. One line for every 16 bytes; the lines are joined by a line break.
2. A line is: the offset of its first byte in hexadecimal, 8 digits; two spaces; the bytes in hexadecimal, two
   lower-case digits each, separated by one space, and padded with spaces to 47 characters; two spaces; the bytes as
   characters, those from 32 to 126 as they are and every other as `.`.
3. No bytes give an empty text.

Worked examples:

- The 16 bytes `89 50 4E 47 0D 0A 1A 0A 00 00 00 0D 49 48 44 52` →
  `00000000  89 50 4e 47 0d 0a 1a 0a 00 00 00 0d 49 48 44 52  .PNG........IHDR`.
- The 3 bytes of `Hi!` → `00000000  48 69 21` followed by 39 spaces, two spaces, and `Hi!`.
- 20 bytes → two lines, the second starting with `00000010`.

Acceptance:

- [ ] The examples above give the texts shown.
- [ ] 512 bytes give 32 lines, the last starting with `000001f0`.
- [ ] The bytes 31, 32, 126 and 127 are shown as `.`, a space, `~` and `.`.

### `gridfs.content-type` — The content type of a file name

The type an upload writes in the metadata, and the type a preview assumes when the files document has none.

- **Kind**: Derivation
- **Engine**: MongoDB
- **Function**: `src/features/gridfs/content-type.ts › contentTypeOf(filename)`
- **Uses**: used by `gridfs.upload`, `gridfs.preview`, `gridfs.open`.
- **Ported from**: `src/gridfs.ts` (`MIME`, `contentTypeOf`).

Rules: the extension is what follows the last dot of the name, whatever its case. A name without a dot, one that
only starts with a dot, and an extension that is not in the table have no type.

| Extension | Type |
| --- | --- |
| `.txt`, `.log`, `.ts` | `text/plain` |
| `.md` | `text/markdown` |
| `.csv` | `text/csv` |
| `.html`, `.htm` | `text/html` |
| `.css` | `text/css` |
| `.js`, `.mjs` | `text/javascript` |
| `.json` | `application/json` |
| `.xml` | `application/xml` |
| `.yaml`, `.yml` | `application/yaml` |
| `.svg` | `image/svg+xml` |
| `.png` | `image/png` |
| `.jpg`, `.jpeg` | `image/jpeg` |
| `.gif` | `image/gif` |
| `.webp` | `image/webp` |
| `.bmp` | `image/bmp` |
| `.ico` | `image/x-icon` |
| `.pdf` | `application/pdf` |
| `.zip` | `application/zip` |
| `.gz` | `application/gzip` |
| `.mp3` | `audio/mpeg` |
| `.mp4` | `video/mp4` |
| `.wav` | `audio/wav` |

Worked examples: `logo.PNG` → `image/png`; `backup.tar.gz` → `application/gzip`; `Makefile` → none; `.gitignore` →
none; `photo.heic` → none.

Acceptance:

- [ ] Every row of the table and the examples above give the types shown.

### `gridfs.upload` — Upload files to a bucket

Stores files from the disk in the bucket, asking first what to do with the names it already has.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/gridfs/upload.ts › plan(context, answers)`
- **Entry points**: **Upload…** in the toolbar of the page of a bucket (`@toolbar`); **Upload files to GridFS…** in
  the context menu of a bucket (`@tree-menu`). Started for a database, it is `gridfs.create-bucket`.
- **Offered when**: a bucket, on a connection that is not read-only.
- **Asks**:
  1. the files, in the system's file dialog titled *Upload files to Local › shop › fs*, which takes several and
     whose button is **Upload**;
  2. only when the bucket already has files with some of those names, what to do with them (`runner.ask`), under the
     title `a.png, b.png, c.png and 2 more already in Local › shop › fs` (the first 3 names):
     - **Add a new revision** — *GridFS keeps both; reading by name gives the newest*;
     - **Replace** — *delete the files with the same name once the new one is uploaded*;
     - **Skip** — *upload only the new names*.
- **Reads**: `db.fs.files.distinct("filename", { filename: { $in: ["a.png", "b.png"] } })`, with the names of the
  files chosen, and the size of each file on the disk.
- **Plan**: the files one after the other, in the order they were chosen; with **Skip**, without those whose name
  exists. For each file:
  1. with **Replace**, when its name exists: `db.fs.files.find({ filename: "logo.png" }, { _id: 1 })`, to know the
     files to delete once the new one is in place ([D50](../decisions.md#d50--a-gridfs-file-is-replaced-after-the-new-one-is-uploaded));
  2. its chunks, read from the disk as they are sent, never the whole file in memory: one
     `db.fs.chunks.insertOne({ files_id: ObjectId("65f1c0ffee0000000000b001"), n: 0, data: BinData(0, "…") })` for
     every 261,120 bytes (255 KB, the driver's chunk size), `n` counting from 0;
  3. its files document: `db.fs.files.insertOne({ _id: ObjectId("65f1c0ffee0000000000b001"), length: 734003,
     chunkSize: 261120, uploadDate: ISODate("2026-11-18T13:02:11.000Z"), filename: "logo.png", metadata: {
     contentType: "image/png" } })`. The name is the file's name without its folder; the metadata is `{ contentType:
     … }` with the type of `gridfs.content-type`, or `{}` when the name has none;
  4. with **Replace**, for each file found in step 1, `db.fs.files.deleteOne({ _id:
     ObjectId("65f1c0ffee0000000000a2c1") })` and `db.fs.chunks.deleteMany({ files_id:
     ObjectId("65f1c0ffee0000000000a2c1") })`. When the upload of the file fails or is cancelled, these steps are not
     run and the old revisions stay.

  Before the first chunk of an empty bucket the driver creates its two indexes: `db.fs.files.createIndex({ filename:
  1, uploadDate: 1 })` and `db.fs.chunks.createIndex({ files_id: 1, n: 1 }, { unique: true })`. In the confirmation
  and in the Log the chunks of one file are one step, written with the first chunk and their number.
- **Danger**: None with **Add a new revision**, **Skip** or no name that exists: files are only added. Confirm with
  **Replace** *(Datardo's choice: Mongoster runs it at once)*: **Replace 2 files in Local › shop › fs?** says *The
  files with these names are deleted, with all their revisions, once the new ones are uploaded. This can't be
  undone.* and lists the steps;
  the button is **Replace**.
- **Read-only**: Refused on a read-only connection (`/read-only`).
- **Undo**: Cannot be undone from the undo history: GridFS files are not recorded. A file uploaded by mistake is
  deleted with **Delete**; a file replaced is gone.
- **Publishes**: nothing: the writes of GridFS are not published for redis-oplog.
- **After**: while it runs, the status line shows *Uploading to Local › shop › fs* with `logo.png (1 of 3) · 1.2 MB
  of 4.5 MB`, the bytes being those of all the files, refreshed at most every 200 ms, and **Cancel**
  (`runner.progress`). **Cancel** stops the file being sent, whose chunks already written are deleted
  (`db.fs.chunks.deleteMany({ files_id: … })`), and does not start the others; the files already uploaded stay. At
  the end: *Uploaded 2 files (4.5 MB) to Local › shop › fs.*, with *, skipped 1 that already existed* and *,
  cancelled* before the full stop when they apply (`runner.notify`); started from the tree, the notification has
  **Open**, which opens the page of the bucket. The page and the tree are read again.
- **Refuses**: a read-only connection (`/read-only`): *The connection Production is read-only: files can't be
  changed.* Closing the file dialog or the question ends the feature and nothing is sent.
- **Commands**: `gridfs.upload`
- **Uses**: `gridfs.content-type`, `gridfs.size-text`, `gridfs.show`, `runner.ask`, `runner.confirm`, `runner.run`,
  `runner.progress`, `runner.cancel`, `runner.notify`, `tree.refresh`.
- **Ported from**: `src/gridfs.ts` (`uploadFiles`, `counter`); `src/extension.ts` (the upload command).

Acceptance:

- [ ] Uploading `logo.png` of 734,003 bytes to an empty bucket creates the two indexes, writes 3 chunks (`n` 0, 1
  and 2, the last of 211,763 bytes) and one files document with `length: 734003`, `chunkSize: 261120`, `filename:
  "logo.png"` and `metadata: { contentType: "image/png" }`.
- [ ] A file named `Makefile` is uploaded with `metadata: {}`; a file of 0 bytes with `length: 0` and no chunk.
- [ ] With no name already in the bucket, no question is asked and no confirmation is shown.
- [ ] With `a.png`, `b.png`, `c.png`, `d.png` and `e.png` already there, the question is titled `a.png, b.png, c.png
  and 2 more already in Local › shop › fs`.
- [ ] **Add a new revision** leaves the old `logo.png` and adds a second file with the same name and a later date.
- [ ] **Skip** with 3 files, one of which exists, uploads 2 and says *Uploaded 2 files (4.5 MB) to Local › shop › fs,
  skipped 1 that already existed.*
- [ ] **Replace** asks **Replace 1 file in Local › shop › fs?**; after **Replace**, both old revisions of `logo.png`
  and their chunks are deleted and one new file has that name; cancelling the confirmation deletes and uploads
  nothing.
- [ ] **Replace** whose upload fails at the second chunk, or is cancelled, leaves both old revisions of `logo.png`
  with their chunks, and no chunk of the new one.
- [ ] **Cancel** during the second of 3 files leaves the first in the bucket, no chunk of the second, and says
  *Uploaded 1 file (717 KB) to Local › shop › fs, cancelled.*
- [ ] A file that can no longer be read from the disk when the upload starts stops it before anything is deleted or
  written.
- [ ] A file of 2 GB is uploaded without Datardo holding more than a few chunks of it in memory.
- [ ] On a read-only connection **Upload…** is not shown, and the command is refused with *The connection Production
  is read-only: files can't be changed.* and the code `gridfs.upload/read-only`.

### `gridfs.create-bucket` — Create a bucket by uploading to it

A bucket exists once it has a file: this asks for its name and uploads the first files.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/gridfs/create-bucket.ts › plan(context, answers)`
- **Entry points**: **Upload files to GridFS…** in the context menu of a database (`@tree-menu`). Go to: **Upload
  files to GridFS…**, for the database of the active tab.
- **Offered when**: a database, on a connection that is not read-only.
- **Asks**: the name of the bucket (`runner.ask`), under the title *Upload files to GridFS in Local › shop* with the
  note *Bucket name: its files go in <bucket>.files and <bucket>.chunks*; it starts as `fs`. A name with a space, a
  `$` or a zero byte, and an empty one, is not accepted: *Enter a name without spaces or $*. The spaces around the
  name are left out. Then everything `gridfs.upload` asks.
- **Plan**: the plan of `gridfs.upload` for that bucket. Nothing is created before the first file is sent: with a
  new name, the driver creates the two collections and their indexes with the first chunk. With the name of a bucket
  that exists, the files are uploaded to it.
- **Danger**: that of `gridfs.upload`.
- **Read-only**: Refused on a read-only connection (`/read-only`).
- **Undo**: Cannot be undone from the undo history: GridFS files are not recorded. Dropping the bucket removes it.
- **Publishes**: nothing.
- **After**: as `gridfs.upload` started from the tree: the notification has **Open**, and the tree is read again and
  shows the bucket.
- **Refuses**: a read-only connection (`/read-only`): *The connection Production is read-only.*; a name that is not
  accepted (`/bucket-name`): *Enter a name without spaces or $*, shown under the field.
- **Commands**: `gridfs.create-bucket`
- **Uses**: `gridfs.upload`, `gridfs.show`, `runner.ask`, `runner.notify`, `tree.refresh`.
- **Ported from**: `src/extension.ts` (the upload command, started on a database); `src/gridfs.ts` (`uploadFiles`).

Acceptance:

- [ ] On `shop`, the name `photos` and one file create `photos.files` and `photos.chunks`, and the tree shows the
  bucket `photos` under `shop`.
- [ ] The field starts with `fs`; `my files`, `a$b` and an empty name show *Enter a name without spaces or $* and
  cannot be confirmed; ` photos ` is taken as `photos`.
- [ ] Closing the file dialog after the name was given creates nothing.
- [ ] With the name of a bucket that exists, the files are added to it and the existing names are asked about.
- [ ] **Open** in the notification opens the page of the bucket.
- [ ] On a read-only connection the entry is not shown, and the command is refused with *The connection Production
  is read-only.* and the code `gridfs.create-bucket/read-only`.

### `gridfs.download` — Download a file

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/gridfs/download.ts › plan(context, answers)`
- **Entry points**: **Download…** in the menu of a file's row (`@row-menu`) and in the inspector (`@inspector`).
- **Offered when**: a file. Also on a read-only connection.
- **Asks**: where to save it, in the system's save dialog titled *Download logo.png*. The name proposed is the file
  name after its last `/` or `\`, or `download` when that is empty, in the home folder. The dialog asks before
  replacing a file that exists.
- **Reads**: `db.fs.files.findOne({ _id: … })`, then the chunks in order, `db.fs.chunks.find({ files_id: …
  }).sort({ n: 1 })`, written to the disk as they arrive.
- **Plan**: one file step: `write C:\Users\ada\logo.png`.
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone from the undo history: it writes a file on the disk, which the user deletes.
- **After**: while it runs, the status line shows *Downloading logo.png* with `1.2 MB of 4.5 MB`, refreshed at most
  every 200 ms, and **Cancel** (`runner.progress`). At the end: *Downloaded logo.png (717 KB) to
  C:\Users\ada\logo.png.* (`runner.notify`). When it is cancelled or fails, the part written is deleted, and the
  message is *Download cancelled.* or the error.
- **Refuses**: a file deleted meanwhile (`/gone`): *The file no longer exists.*
- **Commands**: `gridfs.download`
- **Uses**: `gridfs.size-text`, `runner.ask`, `runner.run`, `runner.progress`, `runner.cancel`, `runner.notify`.
- **Ported from**: `src/gridfs.ts` (`download`, `save`, `counter`).

Acceptance:

- [ ] Downloading `logo.png` writes a file with exactly the bytes that were uploaded, and says *Downloaded logo.png
  (717 KB) to* followed by the path.
- [ ] A file named `reports/2026/q1.pdf` is proposed as `q1.pdf`; one named `reports/` as `download`.
- [ ] **Cancel** at half leaves no file at the path and says *Download cancelled.*
- [ ] A chunk missing in the bucket stops the download with the driver's error and leaves no file at the path.
- [ ] A file of 2 GB is downloaded without Datardo holding it in memory.
- [ ] It works on a read-only connection.
- [ ] Closing the save dialog reads no chunk and writes nothing.

### `gridfs.open` — Open a file with the system's application

Downloads a temporary copy of a file and opens it with the application the system uses for its type. In Mongoster
the copy opens in the editor of its host, which runs nothing; Datardo has no such editor, so it opens only the kinds
of files that are safe to hand to the system.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/gridfs/open.ts › plan(context, answers)`
- **Entry points**: **Open** in the menu of a file's row (`@row-menu`) and in the inspector (`@inspector`); `Enter`
  on a selected row (`@table`).
- **Offered when**: a file. Also on a read-only connection.
- **Reads**: as `gridfs.download`.
- **Plan**: one file step and one app step:
  1. `write <the system's temporary folder>\datardo-gridfs\<folder>\logo.png`. The folder's name is the first 48
     characters of the base64url of the connection's identifier, the database, the bucket and the `_id`, so that
     opening the same file again replaces its copy and two files with one name do not collide. The copy's name is
     the file name with each of `\ / : * ? " < > |` replaced by `_`, or `file` when that leaves nothing or only
     dots.
  2. `open the copy with the system's application`.
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone from the undo history: it writes a temporary copy. The copies are deleted when Datardo
  quits *(Datardo's choice)*.
- **After**: while it runs, the status line shows *Opening logo.png* with the bytes and **Cancel**, as a download.
  Changes made to the copy are not written back to the bucket.
- **Refuses**: a file deleted meanwhile (`/gone`): *The file no longer exists.*; a type Datardo does not hand to
  the system (`/type`): *Datardo doesn't open files of this type: download it instead.* The types it opens are those
  with one of these extensions *(Datardo's choice)*: `.txt`, `.log`, `.md`, `.csv`, `.json`, `.xml`, `.yaml`,
  `.yml`, `.css`, `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.bmp`, `.ico`, `.pdf`, `.mp3`, `.mp4`, `.wav`, `.zip`,
  `.gz`. Programs, scripts, and the pages and pictures that can run scripts (`.html`, `.htm`, `.js`, `.mjs`,
  `.svg`), like every extension that is not in the list and a name without one, are refused before anything is
  read.
- **Commands**: `gridfs.open`
- **Uses**: `gridfs.download`, `runner.run`, `runner.progress`, `runner.cancel`, `runner.refuse`.
- **Ported from**: `src/gridfs.ts` (`open`, `save`); the list of types and the removal of the copies are *New in
  Datardo*.

Acceptance:

- [ ] **Open** on `report.pdf` writes a copy named `report.pdf` under `datardo-gridfs` in the temporary folder and
  asks the system to open it.
- [ ] Opening the same file twice writes to the same path; two files named `report.pdf` with different `_id` get
  different folders.
- [ ] A file named `reports/2026/q1.pdf` is copied as `reports_2026_q1.pdf`.
- [ ] `setup.exe`, `run.bat`, `page.html`, `script.js`, `picture.svg`, `Makefile` and `photo.PDF.lnk` are refused
  with *Datardo doesn't open files of this type: download it instead.* and nothing is written; `PHOTO.PNG` is
  opened.
- [ ] **Cancel** leaves no copy and opens nothing.
- [ ] It works on a read-only connection.
- [ ] After Datardo quits, the `datardo-gridfs` folder is gone.

### `gridfs.rename` — Rename a file

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/gridfs/rename.ts › plan(context, answers)`
- **Entry points**: **Rename…** in the menu of a file's row (`@row-menu`) and in the inspector (`@inspector`); `F2`
  on a selected row (`@table`).
- **Offered when**: a file, on a connection that is not read-only.
- **Asks**: the new name (`runner.ask`), under the title **Rename logo.png**. The field starts with the current
  name, selected up to its extension. An empty name is not accepted: *Enter a name*. The spaces around the name are
  left out.
- **Plan**: one step: `db.fs.files.updateOne({ _id: ObjectId("65f1c0ffee0000000000a2c1") }, { $set: { filename:
  "brand.png" } })`. The chunks, the metadata and the content type do not change. With the name unchanged there is
  no plan: nothing is sent.
- **Danger**: None.
- **Read-only**: Refused on a read-only connection (`/read-only`).
- **Undo**: Cannot be undone from the undo history: GridFS files are not recorded. Renaming it back reverses it.
- **Publishes**: nothing: the writes of GridFS are not published for redis-oplog.
- **After**: the page is read again; *Renamed logo.png to brand.png.* (`runner.notify`).
- **Refuses**: a read-only connection (`/read-only`): *The connection Production is read-only: files can't be
  changed.*; a file deleted meanwhile (`/gone`): *The file no longer exists.*; an empty name (`/no-name`): *Enter a
  name*, shown under the field.
- **Commands**: `gridfs.rename`
- **Uses**: `runner.ask`, `runner.run`, `runner.notify`.
- **Ported from**: `src/gridfs.ts` (`receive`, `rename`).

Acceptance:

- [ ] **Rename…** on `logo.png` opens the field with `logo` selected; `brand.png` sends the `updateOne` above and
  the row then shows `brand.png` with the same `_id`, size and date.
- [ ] The name of another file of the bucket is accepted: the two become revisions of one name.
- [ ] An empty name shows *Enter a name*; the same name sends nothing and shows no notification.
- [ ] A file renamed to `notes.txt` keeps the type `image/png` its metadata declares.
- [ ] On a read-only connection **Rename…** is not shown, and the command is refused with the code
  `gridfs.rename/read-only`.

### `gridfs.edit-metadata` — Edit the files document of a file

Opens the files document in a document tab, where its metadata, or anything else of it, is edited and saved as any
document.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/gridfs/edit-metadata.ts › plan(context, answers)`
- **Entry points**: **Edit metadata**, or **Show document** on a read-only connection, in the inspector of a file
  (`@inspector`).
- **Offered when**: a file.
- **Plan**: one app step: `open the document ObjectId("65f1c0ffee0000000000a2c1") of shop.fs.files`.
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment: on a read-only connection the document tab
  shows the document and does not save.
- **Undo**: Cannot be undone: nothing is written; closing the tab is enough. A save made in the document tab is the
  document tab's write, with its own confirmation, undo and publishing.
- **After**: the document tab of the files document is active (`document.open`). After a save there, **Refresh**
  shows the change in the page of the bucket.
- **Commands**: `gridfs.edit-metadata`
- **Uses**: `document.open`, `tab.open`.
- **Ported from**: `src/gridfs.ts` (`receive`, `editMetadata`).

Acceptance:

- [ ] **Edit metadata** on `logo.png` opens the document tab of its document in `shop.fs.files`, found by its `_id`
  with its type.
- [ ] Adding `owner: "ada"` to `metadata` there and saving shows `{ owner: "ada" }` in the **Metadata** column after
  **Refresh**.
- [ ] Changing `metadata.contentType` to `text/plain` there makes the preview treat the file as text.
- [ ] On a read-only connection the button is **Show document** and the document tab cannot save.

### `gridfs.delete` — Delete a file

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/gridfs/delete.ts › plan(context, answers)`
- **Entry points**: **Delete** in the menu of a file's row (`@row-menu`) and in the inspector (`@inspector`);
  `Delete` on a selected row (`@table`).
- **Offered when**: a file, on a connection that is not read-only.
- **Reads**: `db.fs.files.findOne({ _id: … })`, for the name and the size the confirmation shows.
- **Plan**: two steps: `db.fs.files.deleteOne({ _id: ObjectId("65f1c0ffee0000000000a2c1") })`, then
  `db.fs.chunks.deleteMany({ files_id: ObjectId("65f1c0ffee0000000000a2c1") })`.
- **Danger**: Confirm. **Delete logo.png (717 KB) from Local › shop › fs?** says *Its chunks are deleted too. This
  can't be undone.* The button is **Delete**.
- **Read-only**: Refused on a read-only connection (`/read-only`).
- **Undo**: Cannot be undone from the undo history: GridFS files are not recorded. Download the file first to keep
  it.
- **Publishes**: nothing: the writes of GridFS are not published for redis-oplog.
- **After**: the page is read again; *Deleted logo.png.* (`runner.notify`).
- **Refuses**: a read-only connection (`/read-only`): *The connection Production is read-only: files can't be
  changed.*; a file deleted meanwhile (`/gone`): *The file no longer exists.*
- **Commands**: `gridfs.delete`
- **Uses**: `gridfs.size-text`, `runner.confirm`, `runner.run`, `runner.notify`.
- **Ported from**: `src/gridfs.ts` (`receive`, `delete`).

Acceptance:

- [ ] **Delete** on `logo.png` asks **Delete logo.png (717 KB) from Local › shop › fs?**; after **Delete**, its
  files document and its 3 chunks are gone and the notification says *Deleted logo.png.*
- [ ] The confirmation shows both steps and says that the delete cannot be undone from the undo history.
- [ ] Of two revisions named `logo.png`, only the one selected is deleted.
- [ ] Cancelling the confirmation deletes nothing.
- [ ] The undo history has no operation for the delete.
- [ ] On a read-only connection **Delete** is not shown, and the command is refused with *The connection Production
  is read-only: files can't be changed.* and the code `gridfs.delete/read-only`.

### `gridfs.drop-bucket` — Delete a bucket

Drops the two collections of a bucket, with every file in it.

- **Kind**: Operation
- **Engine**: MongoDB
- **Function**: `src/features/gridfs/drop-bucket.ts › plan(context, answers)`
- **Entry points**: **Delete GridFS bucket…** in the context menu of a bucket (`@tree-menu`).
- **Offered when**: a bucket, on a connection that is not read-only.
- **Reads**: `db.fs.files.estimatedDocumentCount()`, for the number of files the confirmation shows.
- **Plan**: two steps: `db.fs.files.drop()`, then `db.fs.chunks.drop()`.
- **Danger**: Destructive: two collections are lost for good. **Delete the GridFS bucket Local › shop › fs and its
  1,234 files?** (*its 1 file*) says *Drops fs.files and fs.chunks. This can't be undone.*, asks to type `fs`, and
  has the button **Delete**. Mongoster asks with the button alone.
- **Read-only**: Refused on a read-only connection (`/read-only`).
- **Undo**: Cannot be undone from the undo history: GridFS files are not recorded, and a dropped collection is not a
  write to documents. A backup of the database is the way to keep the files.
- **Publishes**: nothing.
- **After**: the tab of the bucket, when it is open, is closed (`tab.close`); the tree is read again and no longer
  shows the bucket.
- **Refuses**: a read-only connection (`/read-only`): *The connection Production is read-only.*
- **Commands**: `gridfs.drop-bucket`
- **Uses**: `runner.confirm`, `runner.run`, `tab.close`, `tree.refresh`.
- **Ported from**: `src/gridfs.ts` (`dropBucket`); `src/extension.ts` (the command that drops a bucket).

Acceptance:

- [ ] **Delete GridFS bucket…** on `fs` with 1,234 files asks **Delete the GridFS bucket Local › shop › fs and its
  1,234 files?**; **Delete** stays disabled until `fs` is typed; after it, `fs.files` and `fs.chunks` no longer
  exist.
- [ ] The confirmation shows `db.fs.files.drop()` and `db.fs.chunks.drop()` and says that the drop cannot be undone
  from the undo history.
- [ ] After the drop the bucket's tab is closed and the tree no longer shows the bucket; the other collections of
  the database are untouched.
- [ ] Cancelling the confirmation drops nothing and leaves the tab open.
- [ ] The bucket `photos` of the same database is not touched by dropping `fs`.
- [ ] On a read-only connection the entry is not shown, and the command is refused with *The connection Production
  is read-only.* and the code `gridfs.drop-bucket/read-only`.
