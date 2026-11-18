# Values

What a Redis key holds, as it is shown and changed: the value in the inspector island and in the key tab, the view
of each type (string, hash, list, set, sorted set, stream), how bytes become text, JSON or hexadecimal and back, and
the writes to one item: a string saved, a field, an element, a member or an entry added, changed or removed. Large
values are read a page at a time. The key itself (its name, its expiry, deleting it) is the area of keys
(`key.show`).

What every card of this area shares:

- **Bytes.** A string, a field's name and value, an element, a member, and a field of an entry are bytes. They are
  read and written as bytes; `value.format` decides how they are shown, `value.typed-bytes` what is saved from what
  was typed, and `value.quote` how they are written in a step. Nothing the user did not change is ever written back
  changed.
- **Database.** Every command is sent on the database of the key's tab, as the cards of keys say.
- **A page** is 200 items *(Datardo's choice)*. A table shows the pages read so far and, while there are more,
  **Load more** as its last row.
- **Before every write** the feature reads `TYPE <key>` (`value.check`) and refuses when the key is gone, *The key
  user:7 no longer exists: it was deleted or it expired.* (`/gone`), or is no longer of the type the view shows,
  *user:7 is now a list: it was a hash when this tab read it. Refresh to see it.* (`/type-changed`).
- **The last item.** A hash, a list, a set or a sorted set cannot be empty: the server deletes the key with its last
  item. A removal that takes every item says so in its confirmation: *They are all the fields of user:7: the key is
  deleted with them.*
- **Writes.** On a read-only connection the controls of a write are hidden, and the write refuses with *The
  connection Cache local is read-only.* (`/read-only`). Before the first step the runner keeps the key with `DUMP
  <key>` and `PTTL <key>` (`undo.record`): the whole key, also for a write to one item. A confirmation ends with *It
  can be undone from the Undo history.*, or with why it cannot (*The undo history is off for this connection: this
  can't be undone.*). When the key's dump is larger than the undo history keeps for one operation (20 MB,
  `undo.limits`), the runner asks before the first step **Continue without the possibility to undo?**, with the
  detail *The keys are more than 20 MB: too many for the undo history (settings `datardo.undo`).*, button **Continue
  without undo**; after a confirmation the question takes the word of its button (**Remove without the possibility
  to undo?**, **Trim without undo**). A write without a confirmation, with the undo history off, runs without asking
  and its notification has no **Undo**.
- **After a write** the view reads the count and the page again, and keeps the item selected.

### `value.show` — The value of a key

Shows what a key holds, with the view of its type: in short in the inspector island, in full in the key tab.

- **Kind**: View
- **Engine**: Redis
- **Function**: `src/features/value/show.ts › view(state)`
- **Entry points**: the inspector island, under the details of the key selected in a keys tab (`@inspector`): the
  compact form; the page of a key tab (`key.open`): the full form. The tool `redis_read_value` of the MCP server
  reads a value a part at a time in its own way, and only with `datardo.mcp.readData` on (`mcp.read-data`).
- **Offered when**: the key is of one of the six types. For a key of a module's type the place of the value reads
  *Datardo does not show values of the type ReJSON-RL yet.*, with **Open the console** (`console.show`).
- **Reads**: `value.check`, `value.count`, and the read of the type: `value.read-string`, `value.read-hash`,
  `value.read-list`, `value.read-set`, `value.read-sorted-set`, `value.read-stream`.

**The full form** shows, from the top:

1. The key: its name, type, expiry (time left and date), size, encoding and count, as `key.inspect` shows them, and
   the toolbar of the key (`@toolbar`): **Refresh** (`F5`, `value.refresh`), **Rename…**, **Copy to…**, **Set
   expiry…**, **Make persistent**, **Copy name**, **Delete key…**.
2. The view of the type:

| Type | Its toolbar | It shows |
| --- | --- | --- |
| String | **Text**, **JSON**, **Hex**; **Save** (`Ctrl+S`), **Revert**; **Copy** | The value in an editor, and its length (*1,204 bytes*). |
| Hash | **Filter fields**; **Add field** | A table: **Field**, **Value**; and **Expiry** on Redis 7.4 or later, when a field of the page has one. |
| List | **From the head**, **From the tail**; **Go to index**; **Push…**; **Trim…** | A table: **Index**, **Element**. |
| Set | **Filter members**; **Add member** | A table: **Member**. |
| Sorted set | **Lowest first**, **Highest first**; **Min score**, **Max score**; **Add member** | A table: **Rank**, **Member**, **Score**. |
| Stream | **Newest first**, **Oldest first**; **From**, **To**; **Add entry**; **Trim…** | A table: **ID**, **Time**, **Fields**. The section bar has **Entries** and **Groups** (`value.stream-groups`). |

In a table, a cell shows its item in the compact form of `value.format`. A click selects a row, and the inspector
island then shows the selected item in full, with **Text**, **JSON**, **Hex** and **Copy**; with nothing selected
it reads **Nothing selected** and *Select a row to see its value here.*, and the key tab of a string, which has
nothing to select, does not show it. A double click or `F2` on a cell that can be changed opens
`value.item-editor`: a value of a hash, the name of a field, an element, a score. A member and an entry cannot be
changed: their cells say so in a tooltip, *A member cannot be changed: remove it and add another.* and *An entry of
a stream cannot be changed: add another and delete this one.* `Delete` removes the selected rows. Rows are selected
as in every table (`table.selection`), by field name, index, member or ID; while more than one is selected the
selection bar (`@selection-bar`) shows **3 fields selected**, **Copy**, **Copy as command**, **Remove…** and
**Clear**. The context menu of a row (`@row-menu`) has **Edit**, **Rename field…** (a hash), **Copy**, **Copy as
command** and **Remove…** (**Delete entry…** for a stream).

The loaded rows of a hash and of a set can be sorted by a click on a column header; a list, a sorted set and a
stream have only their own order. While not everything is loaded, the toolbar says *Sorted among the 200 fields
loaded.*

**The compact form** shows the count and the beginning of the value, and nothing that writes: the first 4,096 bytes
*(Datardo's choice)* of a string (*First 4 KB of 12.4 MB.*), or the first 20 items *(Datardo's choice)* of the
others (*First 20 of 1,204 fields.*), with **Open in a tab** (`key.open`). A stream shows its newest entries.

States, in both forms:

- loading: the key's lines at once, a placeholder for the value;
- an empty string: *Empty string.*; a stream without entries: *No entries.*; a filter that finds nothing: *No
  fields match `*nick*`.*, with **Load more** while the scan is not complete;
- the key is gone: *The key user:7 no longer exists: it was deleted or it expired.*, and in a key tab **Close tab**
  (`tab.close`); nothing else is shown, and what was typed and not saved stays in the editor, to be copied;
- the type changed: without unsaved changes the view of the new type is loaded, under the notice *user:7 is now a
  list: it was a hash when this tab read it.*; with unsaved changes the view stays, with the same notice and
  **Reload**;
- error: the server's message, with **Retry**;
- read-only connection: no **Save**, **Add…**, **Push…**, **Trim…**, **Remove…** or editor in a cell; the string's
  editor cannot be typed in.

- **Uses**: `value.format`, `value.item-editor`, `value.check`, `value.count`, `value.refresh`, `value.copy`,
  `value.read-string`, `value.save-string`, `value.read-hash`, `value.add-field`, `value.edit-field`,
  `value.rename-field`, `value.remove-fields`, `value.read-list`, `value.push-element`, `value.edit-element`,
  `value.remove-elements`, `value.trim-list`, `value.read-set`, `value.add-member`, `value.remove-members`,
  `value.read-sorted-set`, `value.add-scored-member`, `value.change-score`, `value.remove-scored-members`,
  `value.read-stream`, `value.add-entry`, `value.delete-entries`, `value.trim-stream`, `value.stream-groups`,
  `key.inspect`, `key.open`, `key.format-expiry`, `table.selection`, `console.show`, `tab.close`.
- **Ported from**: *New in Datardo*

Acceptance:

- [ ] The key tab of the hash `user:7` shows its name, **Hash**, its expiry, size, encoding, **2 fields**, and a
  table with the columns **Field** and **Value**.
- [ ] The key tab of a string shows an editor with **Text**, **JSON**, **Hex**, **Save**, **Revert** and **Copy**.
- [ ] Selecting a row of a hash shows the field's value in full in the inspector island; clearing the selection
  shows **Nothing selected** there.
- [ ] In the inspector island of a keys tab, a hash of 1,204 fields shows 20 of them, *First 20 of 1,204 fields.*
  and **Open in a tab**, and no control that writes.
- [ ] A double click on a member of a set opens no editor and shows *A member cannot be changed: remove it and add
  another.*
- [ ] When another client deletes the key, the next read shows *The key user:7 no longer exists: it was deleted or
  it expired.* and **Close tab**.
- [ ] When another client replaces the hash with a list, **Refresh** shows the list's table under *user:7 is now a
  list: it was a hash when this tab read it.*
- [ ] On a read-only connection the hash's toolbar has **Filter fields** only, and a double click on a value opens
  no editor.
- [ ] A key of the type `ReJSON-RL` shows *Datardo does not show values of the type ReJSON-RL yet.*

### `value.format` — How bytes are shown

Decides whether bytes are shown as text, as formatted JSON or in hexadecimal, and writes them so. What the user
chooses wins over what it decides.

- **Kind**: Derivation
- **Engine**: Redis
- **Function**: `src/features/value/format.ts › shown(bytes, choice, form)`
- **Entry points**: **Text**, **JSON** and **Hex** in the toolbar of a string (`@toolbar`), in the inspector island
  of an item (`@inspector`) and in `value.item-editor` (`@editor`).
- **Uses**: used by `value.show`, `value.item-editor`, `value.copy`, `value.typed-bytes`.
- **Ported from**: *New in Datardo*

Inputs: the bytes; the choice, which is none, **Text**, **JSON** or **Hex**; the form, full or compact. Output: the
format, its text, and a note when the choice could not be kept.

With no choice, in this order:

1. No bytes: text, empty.
2. Bytes that are not valid UTF-8 are hexadecimal. Valid means strictly so: no byte that cannot start or continue a
   character, no character cut short, no overlong form, no surrogate (`ed a0 80`), nothing above U+10FFFF.
3. Valid UTF-8 that holds a control character other than tab, line feed and carriage return (U+0000 to U+0008,
   U+000B, U+000C, U+000E to U+001F, U+007F to U+009F) is hexadecimal: it reads as text and is not.
4. Text of at most 1,048,576 bytes *(Datardo's choice)* that, without the white space around it, starts with `{` or
   `[` and parses as JSON (RFC 8259) is JSON. A number, a string in quotes, `true`, `false` and `null` alone are
   text.
5. Anything else is text.

How each format is written:

- **Text**: the characters as they are, with their own line breaks.
- **JSON**: the same tokens, indented by two spaces, one member or element a line. Only the white space between
  tokens changes: every number keeps its digits (`12345678901234567890`, `1.0`, `1e3`), every string its escapes,
  every object the order of its names and its repeated names.
- **Hex**: lines of 16 bytes: the offset in 8 hexadecimal digits, the bytes as pairs of lower-case digits with one
  more space after the eighth, and the same bytes as ASCII between `|`, with `.` for a byte that is not a printable
  ASCII character.
- Compact, in a cell: text and JSON are the value's own text on one line, with a line break shown as `↵` and a tab
  as `→`, cut after 200 characters *(Datardo's choice)* with `…`; hexadecimal is the first 32 bytes *(Datardo's
  choice)* as pairs, then `…` and the length, `(1,024 bytes)`.

With a choice:

- **Hex** is always possible.
- **Text** on bytes that rule 2 refuses shows each byte that is not text as `�`, cannot be edited, and has the note
  *Not valid UTF-8: the bytes that are not text are shown as �. Edit the value as Hex.* On bytes that rule 3
  refuses it shows the control characters as their pictures (`␀`, `␛`), with the note *Holds control characters:
  edit the value as Hex.*
- **JSON** on text that does not parse shows the text, with the note *Not JSON: \<the parser's error, with line
  and column\>*.

The choice is kept for the key's tab until it is closed, and for each column of a table apart.

Examples, with no choice:

| Bytes | Shown as | Why |
| --- | --- | --- |
| `68 65 6c 6c 6f` | text `hello` | |
| `63 61 66 c3 a9` | text `café` | valid UTF-8 |
| `6c 31 0a 6c 32 09 78` | text, two lines, the second with a tab | tab and line breaks are text |
| `7b 22 61 22 3a 31 7d` | JSON, `{`, `  "a": 1`, `}` on three lines | parses as an object |
| `[1, 2]` and a line feed | JSON | white space around it is passed over |
| `{"id":12345678901234567890,"n":1.0}` | JSON, with `12345678901234567890` and `1.0` as written | tokens are not changed |
| `34 32` (`42`) | text `42` | a number alone is not shown as JSON |
| `22 68 69 22` (`"hi"`) | text `"hi"` | a string alone is not shown as JSON |
| `{"a":1` | text | does not parse |
| `63 61 66 e9` (`café` in Latin-1) | hexadecimal | `e9` starts a character that is not there |
| `61 62 63 00` | hexadecimal | valid UTF-8, with a NUL |
| `1b 5b 33 31 6d 72 65 64` (`ESC[31mred`) | hexadecimal | valid UTF-8, with an escape character |
| `00 00 00 2a` | hexadecimal | control characters |
| `ff fe 68 00 69 00` (`hi` in UTF-16) | hexadecimal | `ff` is never UTF-8 |
| `c0 af` | hexadecimal | overlong form |
| `e2 82` | hexadecimal | a character cut short |
| `1f 8b 08 00` (the start of gzip) | hexadecimal | `8b` cannot start a character |
| `82 a1 61 01` (MessagePack) | hexadecimal | `82` cannot start a character |
| `ac ed 00 05` (a serialized Java object) | hexadecimal | `ac` cannot start a character |

The 16 bytes `de ad be ef 00 01 02 03 68 65 6c 6c 6f 0a ff fe` in the full hexadecimal form:

```
00000000  de ad be ef 00 01 02 03  68 65 6c 6c 6f 0a ff fe  |........hello...|
```

Nothing is decompressed or decoded: a value in gzip, MessagePack, Protocol Buffers or a language's own serialization
is shown in hexadecimal.

Acceptance:

- [ ] Each row of the table above gives its format.
- [ ] The 16 bytes of the example give exactly the line shown.
- [ ] `{"id":12345678901234567890}` shown as JSON reads `"id": 12345678901234567890`, not `12345678901234567000`.
- [ ] `{"a":1,"a":2}` shown as JSON has both members.
- [ ] Choosing **Hex** on `hello` shows `68 65 6c 6c 6f`; choosing **Text** on `63 61 66 e9` shows `caf�`, read-only,
  with the note about UTF-8.
- [ ] Choosing **JSON** on `hello` shows `hello` and a note that starts with *Not JSON:*.
- [ ] In a cell, a text of 500 characters shows its first 200 and `…`; a value of 1,024 bytes that is not text shows
  32 pairs, `…` and `(1,024 bytes)`.
- [ ] A text of 2 MB that is valid JSON is shown as text until **JSON** is chosen.

### `value.quote` — Bytes as an argument of a command

Writes a name or a value as one argument of a Redis command, as the confirmation, the Log, a copied command and an
exported file show it, and so that `redis-cli` and the console read the same bytes back.

- **Kind**: Derivation
- **Engine**: Redis
- **Function**: `src/features/value/quote.ts › quoted(bytes, where)`
- **Uses**: used by every plan of the keys and values areas, by `key.export-text`, `key.copy-name`, `value.copy`.
- **Ported from**: *New in Datardo*

Inputs: the bytes; where it is written: a step shown to the user, or a file or the clipboard. Output: text.

Rules:

1. Bare, as it is, when it is not empty, every byte is a printable ASCII character other than the space, `"`, `'`
   and `\` (`21` to `7e` but `22`, `27`, `5c`), and it does not start with `#`.
2. Otherwise between double quotes, with `"` written `\"`, `\` written `\\`, a line feed `\n`, a carriage return
   `\r`, a tab `\t`; a space as itself; a character above U+009F of valid UTF-8 as itself; every other byte as
   `\xHH`, with two lower-case hexadecimal digits.
3. No bytes: `""`.
4. In a step shown to the user, an argument longer than 256 bytes *(Datardo's choice)* is cut: its first 64 bytes
   *(Datardo's choice)* written as above, cut back to a whole character, then `…`, the closing quote, and the length
   in parentheses: `"{\"user\":7,\"cart\":[…" (12,345 bytes)`. The command sent has every byte. In a file and on
   the clipboard nothing is cut.

Examples:

| Bytes | Written |
| --- | --- |
| `orders:42` | `orders:42` |
| `hello world` | `"hello world"` |
| (none) | `""` |
| `{"a":1}` | `"{\"a\":1}"` |
| `C:\tmp` | `"C:\\tmp"` |
| `it's` | `"it's"` |
| `#tag` | `"#tag"` |
| `café` (`63 61 66 c3 a9`) | `"café"` |
| `63 61 66 e9` | `"caf\xe9"` |
| `00 ff` | `"\x00\xff"` |
| `a`, a line feed, `b` | `"a\nb"` |
| `1.5` | `1.5` |

Acceptance:

- [ ] Each row of the table above gives its text.
- [ ] For any bytes, splitting the result as `redis-cli` splits a line gives one argument with the same bytes.
- [ ] In a confirmation, a value of 12,345 bytes shows its first 64 bytes, `…` and `(12,345 bytes)`, and the command
  sent has all 12,345.
- [ ] In an exported file the same value is written in full.

### `value.typed-bytes` — From what is typed to the bytes saved

Turns the text of an editor back into bytes, by the format it was typed in, changing nothing the user did not type.

- **Kind**: Derivation
- **Engine**: Redis
- **Function**: `src/features/value/typed-bytes.ts › typedBytes(text, format, original)`
- **Uses**: `value.format`; used by `value.item-editor`, `value.save-string`, `key.new`, and every card here that
  asks for a value.
- **Ported from**: *New in Datardo*

Inputs: the text typed; the format, **Text**, **JSON** or **Hex**; the bytes the editor started from, or none for a
new value. Output: the bytes, or an error.

Rules:

1. Text that is as the editor showed it gives the original bytes, whatever the format: nothing changed.
2. **Text**: the UTF-8 of the characters. No line break is added at the end, none is converted, and no character is
   normalized. A line break the user types is a line feed, or a carriage return and a line feed when the value's
   first line break is that.
3. **JSON**: the text must parse, or the error is *Not valid JSON: \<the parser's error, with line and column\>*.
   When the original bytes were compact, that is their tokens with no white space between, the bytes are the typed
   tokens joined in the same way, numbers and strings as typed. Otherwise, and for a new value typed on several
   lines, the bytes are the text as typed, and the editor says under it *Saved as formatted here: the original
   spacing is not kept. Use Text to keep it.* A new value typed on one line is saved as typed.
4. **Hex**: the hexadecimal digits, two a byte, in either case; spaces and line breaks are passed over. An odd
   number of digits: *Hexadecimal needs two digits a byte: 3 digits found.* Any other character: *Not hexadecimal:
   "z" at position 1.*

Examples:

| Format | Original | Typed | Bytes saved |
| --- | --- | --- | --- |
| Text | `hello` | `hello world` | `68 65 6c 6c 6f 20 77 6f 72 6c 64` |
| Text | none | `café` | `63 61 66 c3 a9` |
| Text | `a`, CR, LF, `b` | a third line `c` added | `61 0d 0a 62 0d 0a 63` |
| JSON | `{"a":1,"id":12345678901234567890}` | the formatted text, with `1` made `2` | `{"a":2,"id":12345678901234567890}` |
| JSON | `{ "a": 1 }` | the formatted text, with `1` made `2` | `{`, line feed, `  "a": 2`, line feed, `}` |
| JSON | `{"a":1}` | the formatted text, untouched | the original 7 bytes |
| JSON | any | `{"a":}` | *Not valid JSON: …* |
| Hex | `00 ff` | `00 FF 0a` | `00 ff 0a` |
| Hex | any | `0 ff` | *Hexadecimal needs two digits a byte: 3 digits found.* |
| Hex | any | `zz` | *Not hexadecimal: "z" at position 1.* |

Acceptance:

- [ ] Each row of the table above gives its result.
- [ ] Opening a value in **JSON** and saving without typing writes nothing: **Save** is disabled.
- [ ] A compact JSON value of 3 members, with one string changed in the JSON editor, is saved compact, and the bytes
  of the other two members are the same as before.
- [ ] A text that ends without a line break is saved without one.

### `value.item-editor` — Edit an item in its cell

The editor that opens over a cell of a value's table, for one field's value or name, one element or one score.

- **Kind**: View
- **Engine**: Redis
- **Function**: `src/features/value/item-editor.ts › view(state)`
- **Entry points**: a double click or `F2` on a cell that can be changed (`@table`); **Edit** in the row's context
  menu (`@row-menu`).
- **Offered when**: on a connection that is not read-only, on a value of a hash, a field's name, an element of a
  list or a score.

The editor (`@editor`) opens over the cell with the item whole, in the format `value.format` gives it: an item that
is not text opens in **Hex**, as pairs of digits. It has **Text**, **JSON** and **Hex** to change the format, and
the hint *Enter to save · Shift+Enter new line · Esc to cancel*. `Enter` saves, through the write of the cell
(`value.edit-field`, `value.rename-field`, `value.edit-element`, `value.change-score`); `Esc`, or a click elsewhere,
cancels and writes nothing. What cannot be read (`value.typed-bytes`) is shown in place of the hint, and nothing is
sent; so is what the write refuses, with the editor still open. An item of more than 200 characters *(Datardo's
choice)* or of several lines opens the same editor as a dialog titled **Edit the value of name**, with **Save**
(`Ctrl+Enter`) and **Cancel**. A score is typed as a number, `inf` or `-inf`, and has no formats.

- **Uses**: `value.format`, `value.typed-bytes`, `value.edit-field`, `value.rename-field`, `value.edit-element`,
  `value.change-score`.
- **Ported from**: *New in Datardo*

Acceptance:

- [ ] A double click on the value `Ada` opens the editor with `Ada` selected, and the hint *Enter to save ·
  Shift+Enter new line · Esc to cancel*.
- [ ] `Esc`, and a click outside the editor, write nothing.
- [ ] A value with the bytes `00 ff` opens in **Hex** showing `00 ff`; typing ` 0a` after it and `Enter` saves the
  three bytes `00 ff 0a`.
- [ ] `0 ff` in **Hex** shows *Hexadecimal needs two digits a byte: 3 digits found.* in place of the hint, and
  nothing is sent.
- [ ] A value of 5,000 characters opens the dialog **Edit the value of name**.
- [ ] On a read-only connection no cell opens the editor.

### `value.check` — Check that the key is still what the view shows

Asks the type of the key again before a write and at each refresh, so that nothing is written to a key that is gone
or has become something else.

- **Kind**: Read
- **Engine**: Redis
- **Function**: `src/features/value/check.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: none of its own: every write of this area, and `value.refresh`.
- **Reads**: `TYPE <key>`. `none` means the key is gone; a type other than the one the view shows means it changed.
- **Uses**: used by every operation of this area and by `value.show`.
- **Ported from**: *New in Datardo*

Acceptance:

- [ ] Every write of this area sends `TYPE <key>` before its first step.
- [ ] On a key that expired, a save is refused with *The key user:7 no longer exists: it was deleted or it
  expired.*, and nothing is written.
- [ ] On a hash that another client replaced with a list, adding a field is refused with *user:7 is now a list: it
  was a hash when this tab read it. Refresh to see it.*
- [ ] A write refused this way is not in the undo history.

### `value.count` — How many items a value has

Reads the size of a value in its own unit, for the key's lines and the notes of the pages.

- **Kind**: Read
- **Engine**: Redis
- **Function**: `src/features/value/count.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: none of its own: `value.show`, in the same pipeline as the first page, and after each write.
- **Reads**: by type: `STRLEN <key>` for a string, `HLEN <key>` for a hash, `LLEN <key>` for a list, `SCARD <key>`
  for a set, `ZCARD <key>` for a sorted set, `XLEN <key>` for a stream.
- **After**: shown as **1,204 bytes**, **12 fields**, **3 elements**, **5 members**, **1,000 entries**, and in the
  singular for one (**1 field**). With a filter the table's note reads *38 fields found of 1,204*. It is not read
  again while pages are loaded.
- **Ported from**: *New in Datardo*

Acceptance:

- [ ] Opening the hash `user:7` sends `HLEN user:7`, and the key's lines show **2 fields**.
- [ ] A list of one element shows **1 element**.
- [ ] After a field is added, the count is read again and shows **3 fields**.
- [ ] **Load more** sends no `HLEN`.

### `value.read-string` — Read a string

Reads the bytes of a string: whole when it is small, a part at a time when it is large.

- **Kind**: Read
- **Engine**: Redis
- **Function**: `src/features/value/read-string.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: none of its own: `value.show`; **Load more** and **Load the whole value** under the editor of a
  large string (`@toolbar`).
- **Reads**: `STRLEN <key>`, then:
  - up to 1,048,576 bytes *(Datardo's choice)*: `GET <key>`;
  - longer: `GETRANGE <key> 0 1048575`, and the view says *Showing the first 1 MB of 12.4 MB.* **Load more** reads
    the next part, `GETRANGE <key> 1048576 2097151`. **Load the whole value** reads every part left, one after the
    other, and is offered up to 16,777,216 bytes *(Datardo's choice)*;
  - in the compact form: `GETRANGE <key> 0 4095`.
- **After**: each part is sent with `STRLEN <key>` again: when the length is no longer the first one read, the value
  is read again from the start, with the note *The value changed while it was read: loaded again.* The format is
  decided (`value.format`) on the bytes loaded, without the bytes of a character that the end of a part cuts. A
  string that is not whole cannot be edited; one longer than 16,777,216 bytes says *This value is 512 MB: Datardo
  edits strings of up to 16 MB.*
- **Uses**: `value.format`, `value.count`.
- **Ported from**: *New in Datardo*

Acceptance:

- [ ] A string of 1,204 bytes is read with `STRLEN` and `GET`, and can be edited.
- [ ] A string of 3 MB is first read with `GETRANGE orders:blob 0 1048575`; the editor is read-only and the view
  says *Showing the first 1 MB of 3 MB.*
- [ ] **Load more** sends `GETRANGE orders:blob 1048576 2097151`.
- [ ] **Load the whole value** on that string sends the two parts left, and the editor can then be edited.
- [ ] A string of 20 MB has no **Load the whole value**.
- [ ] A part that ends in the middle of the two bytes of `é` is shown without them until the next part is loaded,
  and the value is still shown as text.
- [ ] In the inspector island of a keys tab the string is read with `GETRANGE orders:blob 0 4095`.

### `value.save-string` — Save a string

Replaces the value of a string with what the editor holds, keeping the key's expiry.

- **Kind**: Operation
- **Engine**: Redis
- **Function**: `src/features/value/save-string.ts › plan(context, answers)`
- **Entry points**: **Save** in the toolbar of a string (`@toolbar`); `Ctrl+S` in its editor (`@editor`); Go to as
  **Save value**. **Revert** puts back the value as it was loaded and writes nothing.
- **Offered when**: on a connection that is not read-only, when the whole value is loaded and the editor's bytes
  differ from it.
- **Asks**: nothing, unless the value is no longer the one loaded: **orders:42 was changed in the database after it
  was loaded. Overwrite it?**, button **Overwrite**; or, when the key is gone: **The key orders:42 no longer exists.
  Create it again?**, with the detail *It is created without an expiry.*, button **Create again**.
- **Reads**: `value.check`; `GET <key>`, to compare its bytes with those loaded.
- **Plan**: `SET orders:42 <value> KEEPTTL`; after **Create again**, `SET orders:42 <value>`. The value is the
  bytes `value.typed-bytes` gives, written by `value.quote`.
- **Danger**: None. Confirm when the value changed or the key is gone meanwhile: the texts above.
- **Read-only**: Refused on a read-only connection (`/read-only`).
- **Undo**: Recorded in the undo history (`undo.record`) as `Edit orders:42`, keeping the key.
- **After**: *Saved orders:42.*, with **Undo**; the value, its length and the key's size are read again; the editor
  is no longer marked as changed.
- **Refuses**: what cannot be read (*Not valid JSON: …*, the errors of hexadecimal), under the editor, with the text
  kept (`/invalid`); a key that became another type: the text of `value.check` (`/type-changed`); a question that
  is closed: *Not saved: the value changed in the database.* (`/changed`); a server that refuses `KEEPTTL`: *This
  server does not support SET with KEEPTTL: saving would remove the expiry.* (`/unsupported`).
- **Commands**: `value.save-string`
- **Settings**: `datardo.undo.*` (whether it is recorded).
- **Uses**: `value.typed-bytes`, `value.quote`, `value.check`, `value.read-string`, `undo.record`,
  `undo.notification`, `connection.read-only`.
- **Ported from**: *New in Datardo*

A number is a string like any other: `42` is edited to `43` and saved; there is no control for `INCRBY` or
`APPEND`, which the console has (`console.run`).

Acceptance:

- [ ] Changing `hello` to `hello world` and `Ctrl+S` sends `TYPE orders:42`, `GET orders:42`, then `SET orders:42
  "hello world" KEEPTTL`.
- [ ] A key that expires in an hour still expires in an hour after the save.
- [ ] A value `41` edited to `42` is saved with `SET counter 42 KEEPTTL`.
- [ ] When another client changed the value after it was loaded, **Overwrite** is asked; closing the question
  writes nothing and says *Not saved: the value changed in the database.*
- [ ] When the key expired meanwhile, **Create again** sends `SET orders:42 "hello world"`, without `KEEPTTL`.
- [ ] Text that is not JSON, saved from **JSON**, shows *Not valid JSON: …* and sends nothing.
- [ ] **Undo** puts the old value back, with the time the key had left.
- [ ] On a read-only connection the editor cannot be typed in and `Ctrl+S` does nothing.

### `value.read-hash` — Read the fields of a hash

Reads the fields of a hash a page at a time, all of them or those whose name matches a filter.

- **Kind**: Read
- **Engine**: Redis
- **Function**: `src/features/value/read-hash.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: none of its own: `value.show`; **Load more** (`@table`); `Enter` in **Filter fields**
  (`@toolbar`).
- **Reads**: `HSCAN <key> <cursor> MATCH <pattern> COUNT 200`, from cursor 0. `MATCH` is there only with a filter;
  what is typed in **Filter fields** becomes the pattern as for keys (`key.pattern`): `nick` gives `*nick*`. In the
  compact form, `HSCAN <key> 0 COUNT 20`. On Redis 7.4 or later, with each reply, `HPTTL <key> FIELDS <n> <field>
  …` for its fields, for the **Expiry** column.
- **After**: the page calls it again with the reply's cursor until the cursor is 0, or this run found 200 fields or
  more, or this run made 100 calls *(Datardo's choice)*, about 20,000 fields scanned; then **Load more** continues.
  A field returned twice is listed once. A small hash, which the server keeps in one piece, comes whole in the first
  reply whatever the `COUNT`. Fields come in the server's order, which is no order.
- **Uses**: `key.pattern`, `value.count`, `value.format`.
- **Ported from**: *New in Datardo*

Acceptance:

- [ ] Opening `user:7` sends `HLEN user:7` and `HSCAN user:7 0 COUNT 200`.
- [ ] Typing `nick` in **Filter fields** and `Enter` sends `HSCAN user:7 0 MATCH *nick* COUNT 200`, and the note
  reads *1 field found of 12*.
- [ ] On a hash of 100,000 fields the first run stops when 200 or more are found, and **Load more** continues from
  the cursor.
- [ ] A filter that matches nothing in 100,000 fields stops after 100 calls and offers **Load more**.
- [ ] On Redis 7.4, a field with its own expiry shows it in the **Expiry** column; on Redis 6.2 no `HPTTL` is sent
  and there is no such column.
- [ ] A value that is not text is shown in its cell as pairs of hexadecimal digits.

### `value.add-field` — Add a field to a hash

Adds a field with its value to a hash, never over a field that is there.

- **Kind**: Operation
- **Engine**: Redis
- **Function**: `src/features/value/add-field.ts › plan(context, answers)`
- **Entry points**: **Add field** in the toolbar of a hash (`@toolbar`); Go to as **Add field…**.
- **Offered when**: on a connection that is not read-only, in the key tab of a hash.
- **Asks**: the form **Add a field to user:7**: **Field** and **Value**, each typed as text, JSON or hexadecimal
  (`value.typed-bytes`); the button **Add**. The value may be empty, the name too.
- **Reads**: `value.check`; `HEXISTS <key> <field>`.
- **Plan**: `HSET user:7 nickname Ada`.
- **Danger**: None.
- **Read-only**: Refused on a read-only connection (`/read-only`).
- **Undo**: Recorded in the undo history (`undo.record`) as `Add field nickname to user:7`, keeping the key.
- **After**: *Added the field nickname to user:7.*, with **Undo**; the field is the first row, selected; the count
  is read again.
- **Refuses**: a field that exists: *user:7 already has a field named nickname: edit its value instead.*
  (`/exists`), under **Field**, with the form still open; what cannot be read (`/invalid`); the refusals of
  `value.check`.
- **Commands**: `value.add-field`
- **Settings**: `datardo.undo.*` (whether it is recorded).
- **Uses**: `value.typed-bytes`, `value.quote`, `value.check`, `undo.record`, `undo.notification`,
  `connection.read-only`.
- **Ported from**: *New in Datardo*

Acceptance:

- [ ] Adding `nickname` with `Ada` sends `TYPE user:7`, `HEXISTS user:7 nickname`, then `HSET user:7 nickname Ada`.
- [ ] A value `Ada Lovelace` is sent as `HSET user:7 nickname "Ada Lovelace"`.
- [ ] A field that exists shows *user:7 already has a field named nickname: edit its value instead.*, and nothing
  is written.
- [ ] The key keeps its expiry.
- [ ] **Undo** removes the field and leaves the others as they are.
- [ ] On a read-only connection there is no **Add field**.

### `value.edit-field` — Change the value of a field

Changes the value of one field of a hash, from its cell.

- **Kind**: Operation
- **Engine**: Redis
- **Function**: `src/features/value/edit-field.ts › plan(context, answers)`
- **Entry points**: `Enter` in the editor of a **Value** cell (`value.item-editor`, `@editor`).
- **Offered when**: on a connection that is not read-only, in the key tab of a hash.
- **Asks**: the new value, in the editor. When the value in the database is no longer the one shown: **visits of
  user:7 was changed to 13 in the database after it was loaded. Overwrite it?**, or **visits of user:7 was removed
  in the database after it was loaded. Overwrite it?**, button **Overwrite**.
- **Reads**: `value.check`; `HGET <key> <field>`, to compare its bytes with those shown; on Redis 7.4 or later,
  `HPTTL <key> FIELDS 1 <field>`.
- **Plan**: `HSET user:7 visits 14`. When the field has an expiry of its own, which `HSET` would remove: `MULTI`,
  `HSET user:7 visits 14`, `HPEXPIRE user:7 86400000 FIELDS 1 visits` with the milliseconds it had left, `EXEC`.
- **Danger**: None. Confirm when the value changed or was removed meanwhile: the texts above.
- **Read-only**: Refused on a read-only connection (`/read-only`).
- **Undo**: Recorded in the undo history (`undo.record`) as `Edit field visits of user:7`, keeping the key.
- **After**: the editor closes, the row shows the new value and stays selected; *Saved the field visits of user:7.*,
  with **Undo**.
- **Refuses**: what cannot be read, in place of the editor's hint (`/invalid`); a question that is closed: *Not
  saved: the value changed in the database.* (`/changed`); the refusals of `value.check`.
- **Commands**: `value.edit-field`
- **Settings**: `datardo.undo.*` (whether it is recorded).
- **Uses**: `value.item-editor`, `value.typed-bytes`, `value.quote`, `value.check`, `undo.record`,
  `undo.notification`, `connection.read-only`.
- **Ported from**: *New in Datardo*

Acceptance:

- [ ] Changing `visits` from `12` to `14` sends `TYPE user:7`, `HGET user:7 visits`, then `HSET user:7 visits 14`.
- [ ] When another client set `visits` to `13` meanwhile, the question **visits of user:7 was changed to 13 in the
  database after it was loaded. Overwrite it?** is asked; closing it writes nothing.
- [ ] A value saved without a change writes nothing.
- [ ] On Redis 7.4, a field that expires in a day is saved with `MULTI`, `HSET`, `HPEXPIRE user:7 86400000 FIELDS 1
  visits`, `EXEC`, and still expires in a day.
- [ ] The other fields and the key's expiry are as they were.
- [ ] **Undo** puts the old value back.

### `value.rename-field` — Rename a field of a hash

Gives a field another name, keeping its value. Redis has no command for it: the field is set under the new name and
removed under the old one, in one transaction.

- **Kind**: Operation
- **Engine**: Redis
- **Function**: `src/features/value/rename-field.ts › plan(context, answers)`
- **Entry points**: `Enter` in the editor of a **Field** cell (`@editor`), opened by a double click or `F2`;
  **Rename field…** in the row's context menu (`@row-menu`).
- **Offered when**: on a connection that is not read-only, in the key tab of a hash.
- **Asks**: the new name, in the editor.
- **Reads**: `value.check`; `HGET <key> <old name>`, for the value to carry; `HEXISTS <key> <new name>`; on Redis
  7.4 or later, `HPTTL <key> FIELDS 1 <old name>`.
- **Plan**: `MULTI`, `HSET user:7 nick Ada`, `HDEL user:7 nickname`, `EXEC`. When the field has an expiry of its
  own, `HPEXPIRE user:7 86400000 FIELDS 1 nick` follows the `HSET`.
- **Danger**: None.
- **Read-only**: Refused on a read-only connection (`/read-only`).
- **Undo**: Recorded in the undo history (`undo.record`) as `Rename field nickname to nick of user:7`, keeping the
  key.
- **After**: the row shows the new name and stays selected; *Renamed the field nickname to nick.*, with **Undo**.
- **Refuses**: the same name: nothing is written; a name that exists: *user:7 already has a field named nick.*
  (`/exists`); a field that is gone: *The field nickname is no longer in user:7.* (`/gone-item`); the refusals of
  `value.check`.
- **Commands**: `value.rename-field`
- **Settings**: `datardo.undo.*` (whether it is recorded).
- **Uses**: `value.item-editor`, `value.typed-bytes`, `value.quote`, `value.check`, `undo.record`,
  `undo.notification`, `connection.read-only`.
- **Ported from**: *New in Datardo*

Acceptance:

- [ ] Renaming `nickname`, whose value is `Ada`, to `nick` sends `MULTI`, `HSET user:7 nick Ada`, `HDEL user:7
  nickname`, `EXEC`.
- [ ] The value of `nick` has the same bytes `nickname` had, also when they are not text.
- [ ] With `nick` existing, the rename is refused with *user:7 already has a field named nick.*, and nothing is
  written.
- [ ] A field removed by another client meanwhile gives *The field nickname is no longer in user:7.*
- [ ] `Enter` without a change sends nothing.
- [ ] **Undo** gives the hash its field `nickname` back and no field `nick`.

### `value.remove-fields` — Remove fields from a hash

Removes one field of a hash, or the selected ones.

- **Kind**: Operation
- **Engine**: Redis
- **Function**: `src/features/value/remove-fields.ts › plan(context, answers)`
- **Entry points**: **Remove…** in the row's context menu (`@row-menu`) and in the selection bar
  (`@selection-bar`); `Delete` on the selected rows (`@table`).
- **Offered when**: on a connection that is not read-only, in the key tab of a hash, with a row selected.
- **Asks**: the confirmation.
- **Reads**: `value.check`; `HLEN <key>`, to know whether every field is removed.
- **Plan**: `HDEL user:7 nickname visits`, 500 names *(Datardo's choice)* a command.
- **Danger**: Confirm: **Remove the field nickname from user:7?**, or **Remove 3 fields from user:7?**, with the
  note of the last item when they are all its fields and the line about the undo, button **Remove**.
- **Read-only**: Refused on a read-only connection (`/read-only`).
- **Undo**: Recorded in the undo history (`undo.record`) as `Remove field nickname from user:7`, or `Remove 3
  fields from user:7`, keeping the key.
- **After**: *Removed the field nickname from user:7.*, or *Removed 3 fields from user:7.*, or *Removed 2 of 3
  fields from user:7: the others were already gone.*, with **Undo**; the rows leave the table. When no field is
  left: *user:7 has no fields left: the key was deleted.*, and the view shows the key as gone.
- **Refuses**: the refusals of `value.check`.
- **Commands**: `value.remove-fields`
- **Settings**: `datardo.undo.*` (whether it is recorded).
- **Uses**: `value.check`, `value.quote`, `runner.confirm`, `undo.record`, `undo.notification`,
  `connection.read-only`.
- **Ported from**: *New in Datardo*

Acceptance:

- [ ] `Delete` on the row `nickname` asks **Remove the field nickname from user:7?**; **Remove** sends `HDEL user:7
  nickname`.
- [ ] With three rows selected, one `HDEL` with the three names is sent.
- [ ] Closing the confirmation sends nothing.
- [ ] Removing both fields of a hash of two says in the confirmation *They are all the fields of user:7: the key is
  deleted with them.*, and afterwards *user:7 has no fields left: the key was deleted.*
- [ ] **Undo** after that puts the key back with both fields and its expiry.
- [ ] On a read-only connection `Delete` does nothing.

### `value.read-list` — Read the elements of a list

Reads the elements of a list a page at a time, from either end or from an index.

- **Kind**: Read
- **Engine**: Redis
- **Function**: `src/features/value/read-list.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: none of its own: `value.show`; **Load more** (`@table`); **From the head** and **From the
  tail**, and `Enter` in **Go to index** (`@toolbar`).
- **Reads**: with `LLEN <key>` in the same pipeline:
  - **From the head** (the default): `LRANGE <key> 0 199`, then `LRANGE <key> 200 399`, and so on;
  - **From the tail**: `LRANGE <key> -200 -1`, then `LRANGE <key> -400 -201`, shown last element first;
  - **Go to index** 5000: `LRANGE <key> 5000 5199`; a negative index counts from the tail (`-1` is the last);
  - in the compact form: `LRANGE <key> 0 19`.
- **After**: the **Index** column is the place from the head, starting at 0; from the tail it is counted from the
  `LLEN` read with the page. A list has no filter: `LRANGE` reads by place only. A list other clients push to and
  pop from moves under the pages: a page shows what was at its indexes when it was read.
- **Refuses**: an index that is not a whole number: *Enter an index, for example 0, 5000 or -1.* (`/invalid`); one
  beyond the ends shows *No element at index 5000: the list has 1,204.*
- **Uses**: `value.count`, `value.format`.
- **Ported from**: *New in Datardo*

Acceptance:

- [ ] Opening `queue:mail` sends `LLEN queue:mail` and `LRANGE queue:mail 0 199`; **Load more** sends `LRANGE
  queue:mail 200 399`.
- [ ] **From the tail** on a list of 1,204 elements sends `LRANGE queue:mail -200 -1` and shows the element at
  index 1203 first.
- [ ] **Go to index** `5000` sends `LRANGE queue:mail 5000 5199`; `-1` shows the last element.
- [ ] `abc` in **Go to index** is refused with *Enter an index, for example 0, 5000 or -1.*
- [ ] A list of 150 elements has no **Load more**.
- [ ] Two equal elements are two rows, each with its index.

### `value.push-element` — Push an element to a list

Adds an element at the head or at the tail of a list.

- **Kind**: Operation
- **Engine**: Redis
- **Function**: `src/features/value/push-element.ts › plan(context, answers)`
- **Entry points**: **Push…** in the toolbar of a list (`@toolbar`); Go to as **Push element…**.
- **Offered when**: on a connection that is not read-only, in the key tab of a list.
- **Asks**: the form **Push to queue:mail**: **Element**, typed as text, JSON or hexadecimal
  (`value.typed-bytes`); **At**: **The tail** (the default) or **The head**; the button **Push**.
- **Reads**: `value.check`.
- **Plan**: `RPUSH queue:mail welcome` for the tail; `LPUSH queue:mail welcome` for the head.
- **Danger**: None.
- **Read-only**: Refused on a read-only connection (`/read-only`).
- **Undo**: Recorded in the undo history (`undo.record`) as `Push to queue:mail`, keeping the key.
- **After**: *Pushed an element to the tail of queue:mail.*, with **Undo**; the view shows the end it was pushed
  to, with the new element selected; the count is read again.
- **Refuses**: what cannot be read (`/invalid`); the refusals of `value.check`.
- **Commands**: `value.push-element`
- **Settings**: `datardo.undo.*` (whether it is recorded).
- **Uses**: `value.typed-bytes`, `value.quote`, `value.check`, `undo.record`, `undo.notification`,
  `connection.read-only`.
- **Ported from**: *New in Datardo*

Acceptance:

- [ ] Pushing `welcome` with the default sends `TYPE queue:mail`, then `RPUSH queue:mail welcome`, and the element
  is the last of the list.
- [ ] With **The head** it sends `LPUSH queue:mail welcome`, and the element is at index 0.
- [ ] An element typed in **Hex** as `00 ff` is sent as `RPUSH queue:mail "\x00\xff"`.
- [ ] On a list deleted meanwhile, nothing is pushed and the key is not created again.
- [ ] **Undo** leaves the list as it was before the push.

### `value.edit-element` — Change an element of a list

Changes the element at one index of a list.

- **Kind**: Operation
- **Engine**: Redis
- **Function**: `src/features/value/edit-element.ts › plan(context, answers)`
- **Entry points**: `Enter` in the editor of an **Element** cell (`value.item-editor`, `@editor`).
- **Offered when**: on a connection that is not read-only, in the key tab of a list.
- **Asks**: the new element, in the editor.
- **Reads**: `value.check`; `LINDEX <key> <index>`, to compare its bytes with the element shown.
- **Plan**: `LSET queue:mail 3 welcome`.
- **Danger**: None.
- **Read-only**: Refused on a read-only connection (`/read-only`).
- **Undo**: Recorded in the undo history (`undo.record`) as `Edit element 3 of queue:mail`, keeping the key.
- **After**: the editor closes, the row shows the new element; *Saved the element 3 of queue:mail.*, with **Undo**.
- **Refuses**: an element at the index that is no longer the one shown, or no element there: *The element at index
  3 of queue:mail is no longer the one shown: the list changed. Refresh and retry.* (`/changed`), with nothing
  written: an index names a place, not an element, and overwriting would change another one; what cannot be read
  (`/invalid`); the refusals of `value.check`.
- **Commands**: `value.edit-element`
- **Settings**: `datardo.undo.*` (whether it is recorded).
- **Uses**: `value.item-editor`, `value.typed-bytes`, `value.quote`, `value.check`, `undo.record`,
  `undo.notification`, `connection.read-only`.
- **Ported from**: *New in Datardo*

Acceptance:

- [ ] Changing the element at index 3 to `welcome` sends `TYPE queue:mail`, `LINDEX queue:mail 3`, then `LSET
  queue:mail 3 welcome`.
- [ ] The other elements, their order and the key's expiry are as they were.
- [ ] When another client pushed at the head meanwhile, so that index 3 holds another element, the save is refused
  with *The element at index 3 of queue:mail is no longer the one shown: the list changed. Refresh and retry.*
- [ ] A list that became shorter than 4 elements gives the same refusal.
- [ ] **Undo** puts the old element back at index 3.

### `value.remove-elements` — Remove elements from a list

Removes the element at one index of a list, or at the selected indexes, and no other, also when the list holds
equal elements.

- **Kind**: Operation
- **Engine**: Redis
- **Function**: `src/features/value/remove-elements.ts › plan(context, answers)`
- **Entry points**: **Remove…** in the row's context menu (`@row-menu`) and in the selection bar
  (`@selection-bar`); `Delete` on the selected rows (`@table`).
- **Offered when**: on a connection that is not read-only, in the key tab of a list, with a row selected.
- **Asks**: the confirmation.
- **Reads**: `value.check`; `LINDEX <key> <index>` for each index, to compare with the elements shown; `LLEN
  <key>`, to know whether every element is removed.
- **Plan**: `MULTI`, `LSET queue:mail 3 __datardo_removed__:6f1c0c9e2b7a4d0f8a51c3e9d2b4a701` for each index,
  `LREM queue:mail 1 __datardo_removed__:6f1c0c9e2b7a4d0f8a51c3e9d2b4a701` with the number of indexes marked in the
  place of `1`, `EXEC`. The marker is `__datardo_removed__:` and 32 hexadecimal digits the runner draws for the
  plan.
- **Danger**: Confirm: **Remove the element at index 3 from queue:mail?**, with the element in its compact form, or
  **Remove 3 elements from queue:mail?**, with the note of the last item when they are all its elements and the
  line about the undo, button **Remove**.
- **Read-only**: Refused on a read-only connection (`/read-only`).
- **Undo**: Recorded in the undo history (`undo.record`) as `Remove element 3 from queue:mail`, or `Remove 3
  elements from queue:mail`, keeping the key.
- **After**: *Removed the element at index 3 from queue:mail.*, or *Removed 3 elements from queue:mail.*, with
  **Undo**; the page is read again, since the indexes after the removed ones moved. When no element is left:
  *queue:mail has no elements left: the key was deleted.*
- **Refuses**: an element at an index that is no longer the one shown: the text of `value.edit-element`
  (`/changed`), with nothing written; the refusals of `value.check`.
- **Commands**: `value.remove-elements`
- **Settings**: `datardo.undo.*` (whether it is recorded).
- **Uses**: `value.check`, `value.edit-element`, `value.quote`, `runner.confirm`, `undo.record`,
  `undo.notification`, `connection.read-only`.
- **Ported from**: *New in Datardo*

Why this way: Redis removes from a list by value (`LREM`) or from an end, not by index. `LREM` with the element's
own value would remove the first element equal to it, which may be another one. So the element is first replaced,
at its index, by a marker no list holds, and `LREM` then removes the marker; inside `MULTI` and `EXEC` no other
client ever sees the marker or the list between the two.

Acceptance:

- [ ] On the list `a`, `b`, `a`, `c`, removing the row at index 2 sends `MULTI`, `LSET queue:mail 2 <marker>`, `LREM
  queue:mail 1 <marker>`, `EXEC`, and leaves `a`, `b`, `c`: the `a` at index 0 is still there.
- [ ] Removing the rows at indexes 0 and 2 sends two `LSET` with the same marker and `LREM queue:mail 2 <marker>`,
  and leaves `b`, `c`.
- [ ] The marker starts with `__datardo_removed__:` and differs from one plan to the next.
- [ ] When the element at index 2 is no longer the one shown, nothing is sent after the `LINDEX`.
- [ ] Removing the only element says in the confirmation that the key is deleted with it.
- [ ] **Undo** puts the list back with its elements in their order.

### `value.trim-list` — Trim a list

Keeps a range of a list and removes the rest.

- **Kind**: Operation
- **Engine**: Redis
- **Function**: `src/features/value/trim-list.ts › plan(context, answers)`
- **Entry points**: **Trim…** in the toolbar of a list (`@toolbar`); Go to as **Trim list…**.
- **Offered when**: on a connection that is not read-only, in the key tab of a list.
- **Asks**: the form **Trim queue:mail**: **Keep the elements from index** (default `0`) **to** (default `-1`, the
  last); a negative index counts from the tail; under them, what the range does (*Keeps 100 of 1,204 elements.*);
  the button **Trim**. Then the confirmation.
- **Reads**: `value.check`; `LLEN <key>`, to say how many elements are removed.
- **Plan**: `LTRIM queue:mail 0 99`.
- **Danger**: Confirm: **Trim queue:mail to 100 elements?**, with the detail *1,104 of 1,204 elements are removed:
  those before index 0 and after index 99.* and the line about the undo, button **Trim**.
- **Read-only**: Refused on a read-only connection (`/read-only`).
- **Undo**: Recorded in the undo history (`undo.record`) as `Trim queue:mail to 0…99`, keeping the key.
- **After**: *Trimmed queue:mail to 100 elements.*, with **Undo**; the first page and the count are read again.
- **Refuses**: indexes that are not whole numbers (`/invalid`); a range that keeps everything: *This range keeps
  every element: there is nothing to trim.* (`/nothing`); a range that keeps nothing: *This range keeps no element:
  the key would be deleted. Use Delete key instead.* (`/empty-range`); the refusals of `value.check`.
- **Commands**: `value.trim-list`
- **Settings**: `datardo.undo.*` (whether it is recorded).
- **Uses**: `value.check`, `runner.confirm`, `undo.record`, `undo.notification`, `connection.read-only`.
- **Ported from**: *New in Datardo*

Acceptance:

- [ ] On a list of 1,204 elements, keeping `0` to `99` asks **Trim queue:mail to 100 elements?** with *1,104 of
  1,204 elements are removed: those before index 0 and after index 99.*; **Trim** sends `LTRIM queue:mail 0 99`.
- [ ] Keeping `-100` to `-1` sends `LTRIM queue:mail -100 -1` and keeps the last 100 elements.
- [ ] `0` to `-1` is refused with *This range keeps every element: there is nothing to trim.*
- [ ] `5000` to `6000` on that list is refused with the text of the range that keeps nothing.
- [ ] Closing the confirmation sends nothing.
- [ ] **Undo** puts the 1,204 elements back.

### `value.read-set` — Read the members of a set

Reads the members of a set a page at a time, all of them or those that match a filter.

- **Kind**: Read
- **Engine**: Redis
- **Function**: `src/features/value/read-set.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: none of its own: `value.show`; **Load more** (`@table`); `Enter` in **Filter members**
  (`@toolbar`).
- **Reads**: `SSCAN <key> <cursor> MATCH <pattern> COUNT 200`, from cursor 0, with `MATCH` only with a filter, made
  into a pattern as for keys (`key.pattern`). In the compact form, `SSCAN <key> 0 COUNT 20`.
- **After**: as for a hash (`value.read-hash`): a run stops at cursor 0, at 200 members found or more, or after
  100 calls; **Load more** continues; a member returned twice is listed once; the order is the server's.
- **Uses**: `key.pattern`, `value.count`, `value.format`.
- **Ported from**: *New in Datardo*

Acceptance:

- [ ] Opening `tags` sends `SCARD tags` and `SSCAN tags 0 COUNT 200`.
- [ ] Typing `red` in **Filter members** sends `SSCAN tags 0 MATCH *red* COUNT 200`.
- [ ] A set of 50,000 members shows 200 or more after the first run, and **Load more**.
- [ ] A member that is not text is shown as pairs of hexadecimal digits.
- [ ] A member returned by two replies is one row.

### `value.add-member` — Add a member to a set

Adds a member to a set.

- **Kind**: Operation
- **Engine**: Redis
- **Function**: `src/features/value/add-member.ts › plan(context, answers)`
- **Entry points**: **Add member** in the toolbar of a set (`@toolbar`); Go to as **Add member…**.
- **Offered when**: on a connection that is not read-only, in the key tab of a set.
- **Asks**: the form **Add a member to tags**: **Member**, typed as text, JSON or hexadecimal
  (`value.typed-bytes`); the button **Add**.
- **Reads**: `value.check`; `SISMEMBER <key> <member>`.
- **Plan**: `SADD tags redis`.
- **Danger**: None.
- **Read-only**: Refused on a read-only connection (`/read-only`).
- **Undo**: Recorded in the undo history (`undo.record`) as `Add member redis to tags`, keeping the key.
- **After**: *Added the member redis to tags.*, with **Undo**; the member is the first row, selected; the count is
  read again.
- **Refuses**: a member that is there: *redis is already a member of tags.* (`/exists`), under the field; what
  cannot be read (`/invalid`); the refusals of `value.check`.
- **Commands**: `value.add-member`
- **Settings**: `datardo.undo.*` (whether it is recorded).
- **Uses**: `value.typed-bytes`, `value.quote`, `value.check`, `undo.record`, `undo.notification`,
  `connection.read-only`.
- **Ported from**: *New in Datardo*

Acceptance:

- [ ] Adding `redis` sends `TYPE tags`, `SISMEMBER tags redis`, then `SADD tags redis`.
- [ ] A member that is there shows *redis is already a member of tags.*, and nothing is written or recorded.
- [ ] A member with a space is sent in quotes: `SADD tags "key value"`.
- [ ] **Undo** removes the member.
- [ ] On a read-only connection there is no **Add member**.

### `value.remove-members` — Remove members from a set

Removes one member of a set, or the selected ones.

- **Kind**: Operation
- **Engine**: Redis
- **Function**: `src/features/value/remove-members.ts › plan(context, answers)`
- **Entry points**: **Remove…** in the row's context menu (`@row-menu`) and in the selection bar
  (`@selection-bar`); `Delete` on the selected rows (`@table`).
- **Offered when**: on a connection that is not read-only, in the key tab of a set, with a row selected.
- **Asks**: the confirmation.
- **Reads**: `value.check`; `SCARD <key>`, to know whether every member is removed.
- **Plan**: `SREM tags redis cache`, 500 members *(Datardo's choice)* a command.
- **Danger**: Confirm: **Remove the member redis from tags?**, or **Remove 3 members from tags?**, with the note of
  the last item when they are all its members and the line about the undo, button **Remove**.
- **Read-only**: Refused on a read-only connection (`/read-only`).
- **Undo**: Recorded in the undo history (`undo.record`) as `Remove member redis from tags`, or `Remove 3 members
  from tags`, keeping the key.
- **After**: *Removed the member redis from tags.*, or *Removed 3 members from tags.*, or *Removed 2 of 3 members
  from tags: the others were already gone.*, with **Undo**; the rows leave the table. When no member is left: *tags
  has no members left: the key was deleted.*
- **Refuses**: the refusals of `value.check`.
- **Commands**: `value.remove-members`
- **Settings**: `datardo.undo.*` (whether it is recorded).
- **Uses**: `value.check`, `value.quote`, `runner.confirm`, `undo.record`, `undo.notification`,
  `connection.read-only`.
- **Ported from**: *New in Datardo*

Acceptance:

- [ ] `Delete` on the row `redis` asks **Remove the member redis from tags?**; **Remove** sends `SREM tags redis`.
- [ ] With three rows selected, one `SREM` with the three members is sent.
- [ ] When one of the three was removed by another client, the message is *Removed 2 of 3 members from tags: the
  others were already gone.*
- [ ] Removing every member says in the confirmation that the key is deleted with them.
- [ ] **Undo** puts the members back.

### `value.read-sorted-set` — Read the members of a sorted set

Reads the members of a sorted set with their scores, by rank, a page at a time, lowest or highest first, all of
them or those in a range of scores.

- **Kind**: Read
- **Engine**: Redis
- **Function**: `src/features/value/read-sorted-set.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: none of its own: `value.show`; **Load more** (`@table`); **Lowest first** and **Highest
  first**, and `Enter` in **Min score** or **Max score** (`@toolbar`).
- **Reads**: with `ZCARD <key>` in the same pipeline:
  - **Lowest first** (the default): `ZRANGE <key> 0 199 WITHSCORES`, then `ZRANGE <key> 200 399 WITHSCORES`;
  - **Highest first**: `ZRANGE <key> 0 199 REV WITHSCORES`;
  - with a range of scores: `ZRANGE <key> <min> <max> BYSCORE LIMIT 0 200 WITHSCORES`, the next page with `LIMIT 200
    200`; highest first, `ZRANGE <key> <max> <min> BYSCORE REV LIMIT 0 200 WITHSCORES`; and `ZCOUNT <key> <min>
    <max>` for the note *38 members of 1,204*;
  - in the compact form: `ZRANGE <key> 0 19 WITHSCORES`.
- **After**: **Min score** and **Max score** take a number, `-inf` or `+inf`, with `(` before a number to leave
  that score out; an empty one is `-inf` or `+inf`. A score is shown as the server writes it (`1.5`, `3`, `inf`).
  The **Rank** column counts from 0 in the order shown, and is there only without a range of scores.
- **Refuses**: a bound that cannot be read: *Enter a number, -inf or +inf; put ( before it to leave it out.*
  (`/invalid`). `REV` and `BYSCORE` in `ZRANGE` are in Redis since 6.2: on a compatible server that refuses them,
  the same pages are read with `ZREVRANGE <key> 0 199 WITHSCORES`, `ZRANGEBYSCORE <key> <min> <max> WITHSCORES LIMIT
  0 200` and `ZREVRANGEBYSCORE <key> <max> <min> WITHSCORES LIMIT 0 200`.
- **Uses**: `value.count`, `value.format`.
- **Ported from**: *New in Datardo*

Acceptance:

- [ ] Opening `board` sends `ZCARD board` and `ZRANGE board 0 199 WITHSCORES`, and shows the member with the lowest
  score at rank 0.
- [ ] **Highest first** sends `ZRANGE board 0 199 REV WITHSCORES`.
- [ ] **Min score** `10` and **Max score** `(20` send `ZRANGE board 10 (20 BYSCORE LIMIT 0 200 WITHSCORES` and
  `ZCOUNT board 10 (20`; a member with the score 20 is not shown.
- [ ] The same range with **Highest first** sends `ZRANGE board (20 10 BYSCORE REV LIMIT 0 200 WITHSCORES`.
- [ ] With only **Min score** `10`, the range is `10 +inf`.
- [ ] `ten` in **Min score** is refused with *Enter a number, -inf or +inf; put ( before it to leave it out.*
- [ ] With a range of scores the table has no **Rank** column.

### `value.add-scored-member` — Add a member to a sorted set

Adds a member with its score to a sorted set, never changing the score of a member that is there.

- **Kind**: Operation
- **Engine**: Redis
- **Function**: `src/features/value/add-scored-member.ts › plan(context, answers)`
- **Entry points**: **Add member** in the toolbar of a sorted set (`@toolbar`); Go to as **Add member…**.
- **Offered when**: on a connection that is not read-only, in the key tab of a sorted set.
- **Asks**: the form **Add a member to board**: **Member**, typed as text, JSON or hexadecimal
  (`value.typed-bytes`); **Score** (default `0`): a number, `inf` or `-inf`; the button **Add**.
- **Reads**: `value.check`; `ZSCORE <key> <member>`.
- **Plan**: `ZADD board NX 1.5 ada`. The score is sent as it was typed.
- **Danger**: None.
- **Read-only**: Refused on a read-only connection (`/read-only`).
- **Undo**: Recorded in the undo history (`undo.record`) as `Add member ada to board`, keeping the key.
- **After**: *Added the member ada to board.*, with **Undo**; the page that holds its rank is shown, with the
  member selected; the count is read again.
- **Refuses**: a member that is there: *ada is already a member of board, with the score 3: change its score
  instead.* (`/exists`); a score that is not one: *Enter a number, inf or -inf.* (`/invalid`); what cannot be read
  (`/invalid`); the refusals of `value.check`.
- **Commands**: `value.add-scored-member`
- **Settings**: `datardo.undo.*` (whether it is recorded).
- **Uses**: `value.typed-bytes`, `value.quote`, `value.check`, `undo.record`, `undo.notification`,
  `connection.read-only`.
- **Ported from**: *New in Datardo*

Acceptance:

- [ ] Adding `ada` with the score `1.5` sends `TYPE board`, `ZSCORE board ada`, then `ZADD board NX 1.5 ada`.
- [ ] With the default score it sends `ZADD board NX 0 ada`.
- [ ] A member that is there shows *ada is already a member of board, with the score 3: change its score
  instead.*, and its score stays 3.
- [ ] `nan` and `high` as a score are refused with *Enter a number, inf or -inf.*
- [ ] `-inf` is accepted and sent as `ZADD board NX -inf ada`.
- [ ] **Undo** removes the member.

### `value.change-score` — Change the score of a member

Changes the score of one member of a sorted set, from its cell.

- **Kind**: Operation
- **Engine**: Redis
- **Function**: `src/features/value/change-score.ts › plan(context, answers)`
- **Entry points**: `Enter` in the editor of a **Score** cell (`value.item-editor`, `@editor`).
- **Offered when**: on a connection that is not read-only, in the key tab of a sorted set.
- **Asks**: the new score, in the editor. When the score in the database is no longer the one shown: **The score
  of ada in board was changed to 2 in the database after it was loaded. Overwrite it?**, button **Overwrite**.
- **Reads**: `value.check`; `ZSCORE <key> <member>`.
- **Plan**: `ZADD board XX 2.5 ada`.
- **Danger**: None. Confirm when the score changed meanwhile: the text above.
- **Read-only**: Refused on a read-only connection (`/read-only`).
- **Undo**: Recorded in the undo history (`undo.record`) as `Change score of ada in board`, keeping the key.
- **After**: the editor closes; the page that holds the member's new rank is shown, with the member selected;
  *Saved the score of ada in board.*, with **Undo**.
- **Refuses**: a score that is not one: *Enter a number, inf or -inf.*, in place of the hint (`/invalid`); a member
  that is gone: *ada is no longer a member of board.* (`/gone-item`); a question that is closed: *Not saved: the
  score changed in the database.* (`/changed`); the refusals of `value.check`.
- **Commands**: `value.change-score`
- **Settings**: `datardo.undo.*` (whether it is recorded).
- **Uses**: `value.item-editor`, `value.check`, `value.quote`, `undo.record`, `undo.notification`,
  `connection.read-only`.
- **Ported from**: *New in Datardo*

Acceptance:

- [ ] Changing the score of `ada` from `1.5` to `2.5` sends `TYPE board`, `ZSCORE board ada`, then `ZADD board XX
  2.5 ada`.
- [ ] After the save `ada` is shown at its new rank, selected.
- [ ] A member removed by another client meanwhile gives *ada is no longer a member of board.*, and is not added
  again.
- [ ] When another client set the score to 2 meanwhile, **Overwrite** is asked; closing the question writes
  nothing.
- [ ] `Enter` with the same score sends nothing.
- [ ] **Undo** gives `ada` the score 1.5 again.

### `value.remove-scored-members` — Remove members from a sorted set

Removes one member of a sorted set, or the selected ones.

- **Kind**: Operation
- **Engine**: Redis
- **Function**: `src/features/value/remove-scored-members.ts › plan(context, answers)`
- **Entry points**: **Remove…** in the row's context menu (`@row-menu`) and in the selection bar
  (`@selection-bar`); `Delete` on the selected rows (`@table`).
- **Offered when**: on a connection that is not read-only, in the key tab of a sorted set, with a row selected.
- **Asks**: the confirmation.
- **Reads**: `value.check`; `ZCARD <key>`, to know whether every member is removed.
- **Plan**: `ZREM board ada bob`, 500 members *(Datardo's choice)* a command.
- **Danger**: Confirm: **Remove the member ada from board?**, or **Remove 3 members from board?**, with the note of
  the last item when they are all its members and the line about the undo, button **Remove**.
- **Read-only**: Refused on a read-only connection (`/read-only`).
- **Undo**: Recorded in the undo history (`undo.record`) as `Remove member ada from board`, or `Remove 3 members
  from board`, keeping the key.
- **After**: *Removed the member ada from board.*, or *Removed 3 members from board.*, or *Removed 2 of 3 members
  from board: the others were already gone.*, with **Undo**; the page is read again, since the ranks moved. When no
  member is left: *board has no members left: the key was deleted.*
- **Refuses**: the refusals of `value.check`.
- **Commands**: `value.remove-scored-members`
- **Settings**: `datardo.undo.*` (whether it is recorded).
- **Uses**: `value.check`, `value.quote`, `runner.confirm`, `undo.record`, `undo.notification`,
  `connection.read-only`.
- **Ported from**: *New in Datardo*

Acceptance:

- [ ] `Delete` on the row `ada` asks **Remove the member ada from board?**; **Remove** sends `ZREM board ada`.
- [ ] With three rows selected, one `ZREM` with the three members is sent.
- [ ] Closing the confirmation sends nothing.
- [ ] Removing every member says in the confirmation that the key is deleted with them.
- [ ] **Undo** puts the members back with their scores.

### `value.read-stream` — Read the entries of a stream

Reads the entries of a stream a page at a time, newest or oldest first, all of them or those between two IDs or two
dates.

- **Kind**: Read
- **Engine**: Redis
- **Function**: `src/features/value/read-stream.ts › request(context, args)` and `› parse(reply)`
- **Entry points**: none of its own: `value.show`; **Load more** (`@table`); **Newest first** and **Oldest
  first**, and `Enter` in **From** or **To** (`@toolbar`).
- **Reads**: with `XLEN <key>` in the same pipeline:
  - **Newest first** (the default): `XREVRANGE <key> + - COUNT 200`, then `XREVRANGE <key> (<last ID shown> - COUNT
    200`;
  - **Oldest first**: `XRANGE <key> - + COUNT 200`, then `XRANGE <key> (<last ID shown> + COUNT 200`;
  - with **From** and **To**, their IDs take the place of `-` and `+`;
  - in the compact form: `XREVRANGE <key> + - COUNT 20`.
- **After**: **From** and **To** take an ID (`1700000000000-0`), the first part of one (`1700000000000`), or a date
  and time in the local time zone (`2026-11-18 12:00`), which is read as its milliseconds since 1970 UTC; an empty
  one is the end of the stream. The **Time** column is the first part of the ID read as milliseconds since 1970, in
  the local time zone, and `—` when that part is less than 946,684,800,000 *(Datardo's choice)*, the year 2000: such
  an ID is not a time. The **Fields** column is the pairs of the entry on one line, as `type=signup user=7`, each
  part in its compact form; the inspector island shows the selected entry's pairs one a line, in their order, also
  when a name is repeated.
- **Refuses**: a bound that is neither an ID nor a date: *Enter an ID, for example 1700000000000-0, or a date and
  time.* (`/invalid`).
- **Uses**: `value.count`, `value.format`.
- **Ported from**: *New in Datardo*

Acceptance:

- [ ] Opening `events` sends `XLEN events` and `XREVRANGE events + - COUNT 200`, and shows the newest entry first.
- [ ] **Load more** after a page that ends with `1700000000000-0` sends `XREVRANGE events (1700000000000-0 - COUNT
  200`.
- [ ] **Oldest first** sends `XRANGE events - + COUNT 200`.
- [ ] **From** `1700000000000` and **Oldest first** send `XRANGE events 1700000000000 + COUNT 200`.
- [ ] An entry with the ID `1700000000000-0` shows 2023-11-14 22:13:20 UTC in the user's time zone in **Time**; one
  with the ID `1-1` shows `—`.
- [ ] An entry with `type` `signup` and `user` `7` shows `type=signup user=7` in **Fields**.
- [ ] A stream without entries shows *No entries.*

### `value.add-entry` — Add an entry to a stream

Appends an entry to a stream.

- **Kind**: Operation
- **Engine**: Redis
- **Function**: `src/features/value/add-entry.ts › plan(context, answers)`
- **Entry points**: **Add entry** in the toolbar of a stream (`@toolbar`); **Add a copy…** in the context menu of
  an entry (`@row-menu`), which opens the form with that entry's pairs; Go to as **Add entry…**.
- **Offered when**: on a connection that is not read-only, in the key tab of a stream.
- **Asks**: the form **Add an entry to events**: **ID** (default `*`: the server gives it); one or more rows of
  **Field** and **Value**, each typed as text, JSON or hexadecimal (`value.typed-bytes`), with **Add a field** for
  another row; the button **Add**.
- **Reads**: `value.check`.
- **Plan**: `XADD events NOMKSTREAM * type signup user 7`. `NOMKSTREAM` keeps a stream that was deleted meanwhile
  from being created again.
- **Danger**: None.
- **Read-only**: Refused on a read-only connection (`/read-only`).
- **Undo**: Recorded in the undo history (`undo.record`) as `Add entry to events`, keeping the key.
- **After**: *Added the entry 1795003200000-0 to events.*, with **Undo**; with **Newest first** the entry is the
  first row, selected; the count is read again.
- **Refuses**: no pair, or a pair without a name: *An entry needs at least one field with a name.* (`/invalid`); an
  ID that is not `*`, `<milliseconds>` or `<milliseconds>-<sequence>`: *Enter \*, or an ID such as
  1700000000000-0.* (`/invalid`); `<milliseconds>-*` on a server older than 7.0: *This server needs \* or a full
  ID.* (`/unsupported`); an ID not greater than the stream's last: *The ID must be greater than the last one,
  1795003100000-3.*, from the server's error; a nil reply: the text of a key that is gone (`/gone`); the refusals of
  `value.check`.
- **Commands**: `value.add-entry`
- **Settings**: `datardo.undo.*` (whether it is recorded).
- **Uses**: `value.typed-bytes`, `value.quote`, `value.check`, `undo.record`, `undo.notification`,
  `connection.read-only`.
- **Ported from**: *New in Datardo*

Acceptance:

- [ ] Adding `type` `signup` and `user` `7` with the default ID sends `TYPE events`, then `XADD events NOMKSTREAM *
  type signup user 7`, and the message has the ID the server gave.
- [ ] An ID `1700000000000-5` is sent in the place of `*`.
- [ ] An ID lower than the stream's last one is refused with *The ID must be greater than the last one, …*, and
  nothing is added.
- [ ] A form without a pair is refused with *An entry needs at least one field with a name.*
- [ ] **Add a copy…** on an entry opens the form with its pairs and the ID `*`.
- [ ] **Undo** leaves the stream without the entry.

### `value.delete-entries` — Delete entries from a stream

Deletes one entry of a stream, or the selected ones.

- **Kind**: Operation
- **Engine**: Redis
- **Function**: `src/features/value/delete-entries.ts › plan(context, answers)`
- **Entry points**: **Delete entry…** in the row's context menu (`@row-menu`); **Remove…** in the selection bar
  (`@selection-bar`); `Delete` on the selected rows (`@table`).
- **Offered when**: on a connection that is not read-only, in the key tab of a stream, with a row selected.
- **Asks**: the confirmation.
- **Reads**: `value.check`.
- **Plan**: `XDEL events 1700000000000-0 1700000000001-0`, 500 IDs *(Datardo's choice)* a command.
- **Danger**: Confirm: **Delete the entry 1700000000000-0 from events?**, or **Delete 3 entries from events?**,
  with the detail *Consumer groups keep an entry they have pending in their lists, without its fields.* and the
  line about the undo, button **Delete**.
- **Read-only**: Refused on a read-only connection (`/read-only`).
- **Undo**: Recorded in the undo history (`undo.record`) as `Delete entry 1700000000000-0 from events`, or `Delete
  3 entries from events`, keeping the key, with its consumer groups.
- **After**: *Deleted the entry 1700000000000-0 from events.*, or *Deleted 3 entries from events.*, or *Deleted 2
  of 3 entries from events: the others were already gone.*, with **Undo**; the rows leave the table. A stream that
  loses its last entry stays, empty.
- **Refuses**: the refusals of `value.check`.
- **Commands**: `value.delete-entries`
- **Settings**: `datardo.undo.*` (whether it is recorded).
- **Uses**: `value.check`, `runner.confirm`, `undo.record`, `undo.notification`, `connection.read-only`.
- **Ported from**: *New in Datardo*

Acceptance:

- [ ] `Delete` on an entry asks **Delete the entry 1700000000000-0 from events?**; **Delete** sends `XDEL events
  1700000000000-0`.
- [ ] With three rows selected, one `XDEL` with the three IDs is sent.
- [ ] Deleting the only entry leaves the key, and the view shows *No entries.*
- [ ] When one of the three was deleted by another client, the message is *Deleted 2 of 3 entries from events: the
  others were already gone.*
- [ ] **Undo** puts the entries back with their IDs.
- [ ] A double click on a cell of an entry opens no editor.

### `value.trim-stream` — Trim a stream

Keeps the newest entries of a stream, by number or from an ID, and deletes the older ones.

- **Kind**: Operation
- **Engine**: Redis
- **Function**: `src/features/value/trim-stream.ts › plan(context, answers)`
- **Entry points**: **Trim…** in the toolbar of a stream (`@toolbar`); Go to as **Trim stream…**.
- **Offered when**: on a connection that is not read-only, in the key tab of a stream.
- **Asks**: the form **Trim events**: **Keep the newest** with a number of entries (the default choice, empty), or
  **Keep the entries from** with an ID or a date and time, read as in `value.read-stream`; the button **Trim**.
  Then the confirmation.
- **Reads**: `value.check`; `XLEN <key>`, to say how many entries are deleted.
- **Plan**: `XTRIM events MAXLEN 1000`, or `XTRIM events MINID 1700000000000-0`. The trim is exact: neither is sent
  with `~`.
- **Danger**: Confirm: **Trim events to its newest 1,000 entries?**, with the detail *4,200 of 5,200 entries are
  deleted.*; or **Trim events to the entries from 1700000000000-0?**, with the detail *Every older entry is
  deleted.*; then the line about the undo, button **Trim**.
- **Read-only**: Refused on a read-only connection (`/read-only`).
- **Undo**: Recorded in the undo history (`undo.record`) as `Trim events to 1,000 entries`, or `Trim events from
  1700000000000-0`, keeping the key.
- **After**: *Deleted 4,200 entries from events.*, the number being the server's reply, with **Undo**; the first
  page and the count are read again.
- **Refuses**: a number that is not a whole number of 0 or more (`/invalid`); a number not less than the entries
  there are: *events has 5,200 entries: there is nothing to trim.* (`/nothing`); an ID that cannot be read
  (`/invalid`); the refusals of `value.check`.
- **Commands**: `value.trim-stream`
- **Settings**: `datardo.undo.*` (whether it is recorded).
- **Uses**: `value.check`, `value.read-stream`, `runner.confirm`, `undo.record`, `undo.notification`,
  `connection.read-only`.
- **Ported from**: *New in Datardo*

Acceptance:

- [ ] On a stream of 5,200 entries, keeping the newest `1000` asks **Trim events to its newest 1,000 entries?**
  with *4,200 of 5,200 entries are deleted.*; **Trim** sends `XTRIM events MAXLEN 1000` and says *Deleted 4,200
  entries from events.*
- [ ] Keeping the entries from `1700000000000-0` sends `XTRIM events MINID 1700000000000-0`.
- [ ] Keeping the newest `6000` of 5,200 is refused with *events has 5,200 entries: there is nothing to trim.*
- [ ] Keeping the newest `0` leaves the stream empty, and the key is still there.
- [ ] Closing the confirmation sends nothing.
- [ ] **Undo** puts the 5,200 entries back.

### `value.stream-groups` — Consumer groups of a stream

Shows the consumer groups of a stream, their consumers and the entries they have pending. In the first release
nothing here writes.

- **Kind**: View
- **Engine**: Redis
- **Function**: `src/features/value/stream-groups.ts › view(state)`
- **Entry points**: **Groups** in the section bar of the key tab of a stream (`@section-bar`).
- **Offered when**: the key is a stream.
- **Reads**: when the section opens and on **Refresh**: `XINFO STREAM <key>` and `XINFO GROUPS <key>`. When a
  group is selected: `XINFO CONSUMERS <key> <group>`, `XPENDING <key> <group>`, and `XPENDING <key> <group> - + 200`,
  the next page with `XPENDING <key> <group> (<last ID shown> + 200`. When a consumer is selected, its name ends the
  last two: `XPENDING <key> <group> - + 200 <consumer>`.

The section shows, from the top:

1. The stream: **Entries**, **Last generated ID**, **First entry** and **Last entry**, as `XINFO STREAM` answers.
2. The table of groups: **Group**, **Consumers**, **Pending**, **Last delivered ID**, **Lag**. The lag is in the
   reply from Redis 7.0; on an older server the column shows `—`.
3. For the selected group, the table of its consumers: **Consumer**, **Pending**, **Idle**, and **Inactive** from
   Redis 7.2; times are written as a time left is (`5 min 12 s`).
4. For the selected group or consumer, the table of pending entries, a page at a time, with **Load more**: **ID**,
   **Consumer**, **Idle**, **Deliveries**. A click on an ID shows that entry in the **Entries** section.
5. The line *Groups are read-only in this release: use the console to create, acknowledge or claim.*, with **Open
   the console** (`console.show`).

States: a stream without groups shows the stream's lines and *No consumer groups.*; a group without pending entries
shows *Nothing pending.*; an error shows the server's message with **Retry**. The section is the same on a
read-only connection.

- **Uses**: `value.read-stream`, `value.refresh`, `key.format-expiry`, `console.show`.
- **Ported from**: *New in Datardo*

Acceptance:

- [ ] Opening **Groups** on `events` sends `XINFO STREAM events` and `XINFO GROUPS events`, and nothing else.
- [ ] Selecting the group `mailers` sends `XINFO CONSUMERS events mailers`, `XPENDING events mailers` and `XPENDING
  events mailers - + 200`.
- [ ] Selecting the consumer `worker-1` sends `XPENDING events mailers - + 200 worker-1`.
- [ ] On Redis 6.2 the **Lag** column shows `—` and there is no **Inactive** column.
- [ ] A group with 450 pending entries shows 200 and **Load more**, which sends `XPENDING events mailers (<last ID>
  + 200`.
- [ ] A stream without groups shows *No consumer groups.*
- [ ] The section has no control that creates, changes or deletes a group, a consumer or a pending entry.

### `value.copy` — Copy a value or a part of it

Puts a value, or the selected items of it, on the clipboard: as it reads, in hexadecimal, or as the Redis command
that would write it.

- **Kind**: Operation
- **Engine**: Redis
- **Function**: `src/features/value/copy.ts › plan(context, answers)`
- **Entry points**: **Copy** in the toolbar of a string (`@toolbar`), which opens **Value**, **As hexadecimal** and
  **As a command**; **Copy**, **Copy as hexadecimal** and **Copy as command** in the context menu of a cell
  (`@cell-menu`) and of a row (`@row-menu`); **Copy** and **Copy as command** in the selection bar
  (`@selection-bar`); **Copy** in the inspector island of an item (`@inspector`); `Ctrl+C` on a selected cell or on
  the selected rows (`@table`); Go to as **Copy value**. Text selected in an editor is copied by `Ctrl+C` as in any
  editor.
- **Offered when**: a value is shown.
- **Reads**: for a string that is not whole, the parts not loaded yet (`value.read-string`); nothing else: items
  are copied as they were read.
- **Plan**: no step: what follows copies.
- **Danger**: None.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone: there is nothing to undo.
- **After**: the clipboard holds:
  - **Copy** on a cell, or **Value**: the item's own text when `value.format` shows it as text or as JSON, without
    the indentation of the JSON view; otherwise its bytes as pairs of hexadecimal digits with a space between;
  - **As hexadecimal**: those pairs, whatever the item is;
  - **Copy** on rows: one row a line, the cells of a row with a tab between, each cell written by `value.quote`;
  - **Copy as command**, **As a command**: the lines `key.export-text` writes for the key with only those items:
    `SET orders:42 "hello world"`, `HSET user:7 name Ada visits 12`, `RPUSH queue:mail a "c d"`, `SADD tags redis`,
    `ZADD board 1.5 ada`, `XADD events 1700000000000-0 type signup user 7`.

  The status line says **Copied**.
- **Refuses**: more than 16,777,216 bytes *(Datardo's choice)* to copy: *Too large to copy: export the key to a
  file instead.* (`/too-large`).
- **Commands**: `value.copy`
- **Uses**: `value.format`, `value.quote`, `key.export-text`, `value.read-string`, `key.export`.
- **Ported from**: *New in Datardo*

Acceptance:

- [ ] `Ctrl+C` on the cell `Ada Lovelace` puts `Ada Lovelace` on the clipboard, without quotes.
- [ ] **Copy** on a value shown as JSON copies `{"a":1}` as it is stored, not its indented form.
- [ ] **Copy** on a cell with the bytes `00 ff` copies `00 ff`; **Copy as hexadecimal** on `hello` copies `68 65 6c
  6c 6f`.
- [ ] **Copy as command** with the rows `name` and `visits` of `user:7` selected copies `HSET user:7 name Ada visits
  12`.
- [ ] **Copy** with the same two rows copies two lines, `name`, a tab, `Ada`, and `visits`, a tab, `12`.
- [ ] **As a command** on the string `orders:42` holding `hello world` copies `SET orders:42 "hello world"`.
- [ ] **Value** on a string of 3 MB of which 1 MB is loaded reads the rest first, then copies the 3 MB.
- [ ] A string of 20 MB is refused with *Too large to copy: export the key to a file instead.*
- [ ] It works on a read-only connection.

### `value.refresh` — Refresh a value

Reads the key and its value again, as they are now.

- **Kind**: Operation
- **Engine**: Redis
- **Function**: `src/features/value/refresh.ts › plan(context, answers)`
- **Entry points**: **Refresh** in the toolbar of a key tab (`@toolbar`); `F5` in a key tab; Go to as **Refresh
  value**.
- **Offered when**: a key tab is active.
- **Asks**: with changes typed and not saved: **Discard your changes to orders:42?**, button **Discard**.
- **Reads**: `value.check`; the key's lines, as `key.inspect` reads them (`PTTL`, `MEMORY USAGE`, `OBJECT
  ENCODING`); `value.count`; the first page of the type's read, with the same filter, order and range; in the
  **Groups** section, the reads of `value.stream-groups`.
- **Plan**: no step on the deployment: the pages loaded are dropped and read again.
- **Danger**: None. Confirm only to discard changes: the text above.
- **Read-only**: Allowed, because it writes nothing to a deployment.
- **Undo**: Cannot be undone: there is nothing to undo.
- **After**: the table is back at its first page; the selection is kept by field name, member or ID where the first
  page has it, and dropped in a list, whose indexes may name other elements now; the format chosen is kept. A key
  that is gone, or of another type, is shown as `value.show` says. Nothing refreshes by itself, except after a write
  of Datardo to the key.
- **Commands**: `value.refresh`
- **Uses**: `value.check`, `value.count`, `value.show`, `value.stream-groups`, `key.inspect`.
- **Ported from**: *New in Datardo*

Acceptance:

- [ ] `F5` in the key tab of `user:7` sends `TYPE user:7`, `PTTL user:7`, `MEMORY USAGE user:7`, `OBJECT ENCODING
  user:7`, `HLEN user:7` and `HSCAN user:7 0 COUNT 200`.
- [ ] With **Filter fields** set to `nick`, the refresh scans with `MATCH *nick*`.
- [ ] A field added by another client is a row after the refresh.
- [ ] With a string edited and not saved, `F5` asks **Discard your changes to orders:42?**; closing the question
  reads nothing and keeps the text.
- [ ] After the refresh of a hash, the field that was selected is still selected.
- [ ] On a key deleted meanwhile the tab shows *The key user:7 no longer exists: it was deleted or it expired.*
