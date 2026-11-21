# The catalog of features

Every feature, one card each, 642 in all. The template and the rules of the cards are in the
feature contract. This index is written by `catalog.py --index`: change a status here in the commit that
earns it, and run the script again after adding or renaming a card; the statuses are kept. A card with a
**Differs** line is *Differs*; when the line goes, it becomes *Documented*. The milestone is the roadmap's.

| File | Area | Cards |
| --- | --- | --- |
| [advisor.md](advisor.md) | Index advisor | 9 |
| [aggregate.md](aggregate.md) | The pipeline editor | 20 |
| [backup.md](backup.md) | Backup | 5 |
| [chart.md](chart.md) | Charts | 7 |
| [codegen.md](codegen.md) | Code generation | 11 |
| [compare.md](compare.md) | Compare | 7 |
| [connection.md](connection.md) | Connections | 39 |
| [console.md](console.md) | Console | 19 |
| [document.md](document.md) | Documents | 19 |
| [explain.md](explain.md) | Explain | 6 |
| [field.md](field.md) | Column actions | 10 |
| [gridfs.md](gridfs.md) | GridFS | 17 |
| [history.md](history.md) | Document history | 10 |
| [home.md](home.md) | Home | 8 |
| [index.md](index.md) | Indexes | 21 |
| [key.md](key.md) | Keys | 25 |
| [manage.md](manage.md) | Databases and collections | 12 |
| [mcp.md](mcp.md) | The MCP server | 19 |
| [monitor.md](monitor.md) | Monitor | 30 |
| [nav.md](nav.md) | Getting around | 21 |
| [oplog.md](oplog.md) | redis-oplog | 7 |
| [palette.md](palette.md) | Go to | 10 |
| [playground.md](playground.md) | Playgrounds | 14 |
| [pubsub.md](pubsub.md) | Pub/Sub | 18 |
| [query.md](query.md) | The query bar | 19 |
| [relation.md](relation.md) | References | 14 |
| [runner.md](runner.md) | The runner | 10 |
| [saved-query.md](saved-query.md) | Recent and saved queries | 17 |
| [schema.md](schema.md) | Schema analysis | 6 |
| [search.md](search.md) | Search | 7 |
| [server.md](server.md) | Server | 17 |
| [settings.md](settings.md) | Settings | 5 |
| [structure.md](structure.md) | Structure | 7 |
| [tab.md](tab.md) | The tab strip | 15 |
| [table.md](table.md) | The table of the Documents section | 23 |
| [task.md](task.md) | Scheduled tasks | 13 |
| [transfer.md](transfer.md) | Transfer | 8 |
| [tree.md](tree.md) | Tree | 18 |
| [undo.md](undo.md) | Undo history | 17 |
| [user.md](user.md) | Users and roles | 16 |
| [value.md](value.md) | Values | 33 |
| [watch.md](watch.md) | Watch changes | 14 |
| [window.md](window.md) | The window | 19 |

## Index advisor

| Feature | Title | Kind | Milestone | Status |
| --- | --- | --- | --- | --- |
| [`advisor.show`](advisor.md#advisorshow--the-index-advisor-page) | The Index advisor page | View | M30 | Specified |
| [`advisor.read-indexes`](advisor.md#advisorread-indexes--the-indexes-of-a-scope-with-their-usage) | The indexes of a scope with their usage | Read | M30 | Specified |
| [`advisor.read-slow-operations`](advisor.md#advisorread-slow-operations--the-slow-operations-of-a-scope) | The slow operations of a scope | Read | M30 | Specified |
| [`advisor.analyze`](advisor.md#advisoranalyze--the-advice-for-a-scope) | The advice for a scope | Derivation | M30 | Specified |
| [`advisor.indexes-to-create`](advisor.md#advisorindexes-to-create--the-indexes-the-slow-operations-need) | The indexes the slow operations need | Derivation | M30 | Specified |
| [`advisor.prefix`](advisor.md#advisorprefix--whether-an-index-starts-with-the-keys-of-another) | Whether an index starts with the keys of another | Derivation | M30 | Specified |
| [`advisor.redundant-indexes`](advisor.md#advisorredundant-indexes--the-indexes-another-index-replaces) | The indexes another index replaces | Derivation | M30 | Specified |
| [`advisor.unused-indexes`](advisor.md#advisorunused-indexes--the-indexes-no-query-uses) | The indexes no query uses | Derivation | M30 | Specified |
| [`advisor.turn-on-profiler`](advisor.md#advisorturn-on-profiler--turn-on-the-profiler-of-a-database) | Turn on the profiler of a database | Operation | M30 | Specified |

## The pipeline editor

| Feature | Title | Kind | Milestone | Status |
| --- | --- | --- | --- | --- |
| [`aggregate.show`](aggregate.md#aggregateshow--the-pipeline-editor) | The pipeline editor | View | M19 | Built |
| [`aggregate.add-stage`](aggregate.md#aggregateadd-stage--add-a-stage) | Add a stage | Operation | M19 | Built |
| [`aggregate.stage-template`](aggregate.md#aggregatestage-template--templates-of-the-common-stages) | Templates of the common stages | Derivation | M19 | Built |
| [`aggregate.remove-stage`](aggregate.md#aggregateremove-stage--remove-a-stage) | Remove a stage | Operation | M19 | Built |
| [`aggregate.move-stage`](aggregate.md#aggregatemove-stage--move-a-stage) | Move a stage | Operation | M19 | Built |
| [`aggregate.toggle-stage`](aggregate.md#aggregatetoggle-stage--disable-or-enable-a-stage) | Disable or enable a stage | Operation | M19 | Built |
| [`aggregate.clear`](aggregate.md#aggregateclear--remove-all-stages) | Remove all stages | Operation | M19 | Built |
| [`aggregate.show-stage`](aggregate.md#aggregateshow-stage--show-the-output-after-a-stage) | Show the output after a stage | Operation | M19 | Built |
| [`aggregate.edit-as-text`](aggregate.md#aggregateedit-as-text--edit-the-pipeline-as-text) | Edit the pipeline as text | Operation | M19 | Built |
| [`aggregate.to-text`](aggregate.md#aggregateto-text--the-text-of-a-pipeline) | The text of a pipeline | Derivation | M19 | Built |
| [`aggregate.from-text`](aggregate.md#aggregatefrom-text--the-stages-of-a-text) | The stages of a text | Derivation | M19 | Built |
| [`aggregate.copy`](aggregate.md#aggregatecopy--copy-the-pipeline) | Copy the pipeline | Operation | M19 | Built |
| [`aggregate.build`](aggregate.md#aggregatebuild--the-pipeline-that-is-sent) | The pipeline that is sent | Derivation | M19 | Built |
| [`aggregate.run`](aggregate.md#aggregaterun--run-the-pipeline) | Run the pipeline | Read | M19 | Built |
| [`aggregate.write-output`](aggregate.md#aggregatewrite-output--run-a-pipeline-that-writes) | Run a pipeline that writes | Operation | M19 | Built |
| [`aggregate.stage-marks`](aggregate.md#aggregatestage-marks--what-a-stage-card-says-about-its-stage) | What a stage card says about its stage | View | M19 | Built |
| [`aggregate.autocomplete`](aggregate.md#aggregateautocomplete--suggestions-in-a-stage) | Suggestions in a stage | Derivation | M19 | Built |
| [`aggregate.drop-condition`](aggregate.md#aggregatedrop-condition--drop-a-condition-into-the-pipeline) | Drop a condition into the pipeline | Operation | M19 | Built |
| [`aggregate.sort-column`](aggregate.md#aggregatesort-column--sort-the-output-from-a-column-header) | Sort the output from a column header | Operation | M19 | Built |
| [`aggregate.save-as-view`](aggregate.md#aggregatesave-as-view--save-the-pipeline-as-a-view) | Save the pipeline as a view | Operation | M19 | Built |

## Backup

| Feature | Title | Kind | Milestone | Status |
| --- | --- | --- | --- | --- |
| [`backup.create`](backup.md#backupcreate--back-up-a-connection-a-database-or-a-collection) | Back up a connection, a database or a collection | Operation | M25 | Built |
| [`backup.restore`](backup.md#backuprestore--restore-from-a-backup) | Restore from a backup | Operation | M25 | Built |
| [`backup.archive-write`](backup.md#backuparchive-write--writing-a-mongodump-archive) | Writing a mongodump archive | Derivation | M25 | Built |
| [`backup.archive-read`](backup.md#backuparchive-read--reading-a-mongodump-archive) | Reading a mongodump archive | Derivation | M25 | Built |
| [`backup.folder-layout`](backup.md#backupfolder-layout--backup-folders-and-their-files) | Backup folders and their files | Derivation | M25 | Built |

## Charts

| Feature | Title | Kind | Milestone | Status |
| --- | --- | --- | --- | --- |
| [`chart.show`](chart.md#chartshow--the-chart-section) | The Chart section | View | M24 | Specified |
| [`chart.options`](chart.md#chartoptions--the-options-of-a-chart) | The options of a chart | Derivation | M24 | Specified |
| [`chart.pipeline`](chart.md#chartpipeline--the-stages-a-chart-adds) | The stages a chart adds | Derivation | M24 | Specified |
| [`chart.draw`](chart.md#chartdraw--run-the-aggregation-of-a-chart) | Run the aggregation of a chart | Read | M24 | Specified |
| [`chart.data`](chart.md#chartdata--from-the-output-of-the-stages-to-what-is-drawn) | From the output of the stages to what is drawn | Derivation | M24 | Specified |
| [`chart.filter-from-mark`](chart.md#chartfilter-from-mark--show-the-documents-of-a-bar-or-a-slice) | Show the documents of a bar or a slice | Operation | M24 | Specified |
| [`chart.save-picture`](chart.md#chartsave-picture--save-the-chart-as-a-picture) | Save the chart as a picture | Operation | M24 | Specified |

## Code generation

| Feature | Title | Kind | Milestone | Status |
| --- | --- | --- | --- | --- |
| [`codegen.show`](codegen.md#codegenshow--the-code-section) | The Code section | View | M24 | Specified |
| [`codegen.source`](codegen.md#codegensource--the-query-that-is-written-as-code) | The query that is written as code | Derivation | M24 | Specified |
| [`codegen.layout`](codegen.md#codegenlayout--how-the-code-is-laid-out) | How the code is laid out | Derivation | M24 | Specified |
| [`codegen.types`](codegen.md#codegentypes--how-each-bson-type-is-written-in-each-language) | How each BSON type is written in each language | Derivation | M24 | Specified |
| [`codegen.mongosh`](codegen.md#codegenmongosh--the-code-for-mongosh) | The code for mongosh | Derivation | M24 | Specified |
| [`codegen.nodejs`](codegen.md#codegennodejs--the-code-for-nodejs) | The code for Node.js | Derivation | M24 | Specified |
| [`codegen.python`](codegen.md#codegenpython--the-code-for-python) | The code for Python | Derivation | M24 | Specified |
| [`codegen.java`](codegen.md#codegenjava--the-code-for-java) | The code for Java | Derivation | M24 | Specified |
| [`codegen.csharp`](codegen.md#codegencsharp--the-code-for-c) | The code for C# | Derivation | M24 | Specified |
| [`codegen.go`](codegen.md#codegengo--the-code-for-go) | The code for Go | Derivation | M24 | Specified |
| [`codegen.copy`](codegen.md#codegencopy--copy-the-code) | Copy the code | Operation | M24 | Specified |

## Compare

| Feature | Title | Kind | Milestone | Status |
| --- | --- | --- | --- | --- |
| [`compare.show`](compare.md#compareshow--the-comparison-page-of-two-collections) | The comparison page of two collections | View | M35 | Built |
| [`compare.read`](compare.md#compareread--read-both-sides-and-pair-the-documents) | Read both sides and pair the documents | Read | M35 | Built |
| [`compare.read-details`](compare.md#compareread-details--read-the-documents-of-the-differences-shown) | Read the documents of the differences shown | Read | M35 | Built |
| [`compare.equality`](compare.md#compareequality--when-two-documents-are-equal) | When two documents are equal | Derivation | M35 | Built |
| [`compare.field-diff`](compare.md#comparefield-diff--the-difference-of-one-document-field-by-field) | The difference of one document, field by field | Derivation | M35 | Built |
| [`compare.copy-document`](compare.md#comparecopy-document--copy-one-document-to-the-other-side) | Copy one document to the other side | Operation | M35 | Built |
| [`compare.make-like`](compare.md#comparemake-like--make-one-side-like-the-other) | Make one side like the other | Operation | M35 | Built |

## Connections

| Feature | Title | Kind | Milestone | Status |
| --- | --- | --- | --- | --- |
| [`connection.add`](connection.md#connectionadd--add-a-connection) | Add a connection | Operation | M6 | Built |
| [`connection.edit`](connection.md#connectionedit--edit-a-connection) | Edit a connection | Operation | M6 | Built |
| [`connection.form`](connection.md#connectionform--the-connection-form) | The connection form | View | M6 | Built |
| [`connection.read-form`](connection.md#connectionread-form--what-the-form-says-checked) | What the form says, checked | Derivation | M6 | Built |
| [`connection.redis-string`](connection.md#connectionredis-string--a-redis-connection-string-read-and-written) | A Redis connection string, read and written | Derivation | M6 | Built |
| [`connection.string-secrets`](connection.md#connectionstring-secrets--the-secrets-in-and-out-of-a-connection-string) | The secrets in and out of a connection string | Derivation | M6 | Built |
| [`connection.test`](connection.md#connectiontest--test-the-connection) | Test the connection | Read | M6 | Built |
| [`connection.save`](connection.md#connectionsave--save-the-connection-form) | Save the connection form | Operation | M6 | Built |
| [`connection.copy-string`](connection.md#connectioncopy-string--copy-the-connection-string) | Copy the connection string | Read | M7 | Built |
| [`connection.duplicate`](connection.md#connectionduplicate--duplicate-a-connection) | Duplicate a connection | Operation | M7 | Built |
| [`connection.connect`](connection.md#connectionconnect--connect-a-connection) | Connect a connection | Operation | M6 | Built |
| [`connection.server-info`](connection.md#connectionserver-info--what-the-server-is) | What the server is | Read | M6 | Built |
| [`connection.disconnect`](connection.md#connectiondisconnect--disconnect) | Disconnect | Operation | M6 | Built |
| [`connection.state`](connection.md#connectionstate--the-state-and-latency-of-a-connection) | The state and latency of a connection | Read | M6 | Built |
| [`connection.reconnect`](connection.md#connectionreconnect--reconnect-after-a-drop) | Reconnect after a drop | Operation | M6 | Built |
| [`connection.ssh-tunnel-target`](connection.md#connectionssh-tunnel-target--where-the-ssh-tunnel-leads) | Where the SSH tunnel leads | Derivation | M7 | Built |
| [`connection.trust-host-key`](connection.md#connectiontrust-host-key--confirm-the-host-key-of-an-ssh-server) | Confirm the host key of an SSH server | Operation | M7 | Built |
| [`connection.overview`](connection.md#connectionoverview--the-overview-page-of-a-connection) | The Overview page of a connection | View | M6 | Built |
| [`connection.menu`](connection.md#connectionmenu--the-menu-of-a-connection) | The menu of a connection | View | M6 | Built |
| [`connection.folder-menu`](connection.md#connectionfolder-menu--the-menu-of-a-folder) | The menu of a folder | View | M7 | Built |
| [`connection.set-color`](connection.md#connectionset-color--set-the-color-of-a-connection) | Set the color of a connection | Operation | M7 | Built |
| [`connection.move-to-folder`](connection.md#connectionmove-to-folder--move-a-connection-to-a-folder) | Move a connection to a folder | Operation | M7 | Built |
| [`connection.rename-folder`](connection.md#connectionrename-folder--rename-a-folder) | Rename a folder | Operation | M7 | Built |
| [`connection.remove-folder`](connection.md#connectionremove-folder--remove-a-folder-keeping-its-connections) | Remove a folder, keeping its connections | Operation | M7 | Built |
| [`connection.remove`](connection.md#connectionremove--remove-a-connection) | Remove a connection | Operation | M6 | Built |
| [`connection.read-only`](connection.md#connectionread-only--make-a-connection-read-only) | Make a connection read-only | Operation | M6 | Built |
| [`connection.allow-changes`](connection.md#connectionallow-changes--allow-changes-through-a-read-only-connection) | Allow changes through a read-only connection | Operation | M6 | Built |
| [`connection.link-redis`](connection.md#connectionlink-redis--link-a-redis-connection-to-a-mongodb-connection) | Link a Redis connection to a MongoDB connection | Operation | M7 | Built |
| [`connection.unlink-redis`](connection.md#connectionunlink-redis--remove-the-link-to-a-redis-connection) | Remove the link to a Redis connection | Operation | M7 | Built |
| [`connection.secrets`](connection.md#connectionsecrets--keep-the-secrets-of-a-connection) | Keep the secrets of a connection | Operation | M6 | Built |
| [`connection.import`](connection.md#connectionimport--import-connections) | Import connections | Operation | M7 | Built |
| [`connection.export`](connection.md#connectionexport--export-connections) | Export connections | Operation | M7 | Built |
| [`connection.read-file`](connection.md#connectionread-file--read-a-connections-file) | Read a connections file | Derivation | M7 | Built |
| [`connection.read-list`](connection.md#connectionread-list--read-a-list-of-connection-strings) | Read a list of connection strings | Derivation | M7 | Built |
| [`connection.read-compass`](connection.md#connectionread-compass--read-a-mongodb-compass-export) | Read a MongoDB Compass export | Derivation | M7 | Built |
| [`connection.write-file`](connection.md#connectionwrite-file--write-a-connections-file) | Write a connections file | Derivation | M7 | Built |
| [`connection.encryption`](connection.md#connectionencryption--encrypt-the-passwords-of-a-file-as-compass-does) | Encrypt the passwords of a file as Compass does | Derivation | M7 | Built |
| [`connection.tls-in-uri`](connection.md#connectiontls-in-uri--tls-settings-in-and-out-of-a-mongodb-connection-string) | TLS settings in and out of a MongoDB connection string | Derivation | M6 | Built |
| [`connection.color-from-compass`](connection.md#connectioncolor-from-compass--the-closest-color-of-a-compass-connection) | The closest color of a Compass connection | Derivation | M7 | Built |

## Console

| Feature | Title | Kind | Milestone | Status |
| --- | --- | --- | --- | --- |
| [`console.show`](console.md#consoleshow--the-console-tab) | The console tab | View | M16 | Built |
| [`console.connect`](console.md#consoleconnect--open-the-consoles-own-connection) | Open the console's own connection | Operation | M16 | Built |
| [`console.input`](console.md#consoleinput--the-command-input) | The command input | View | M16 | Built |
| [`console.parse-line`](console.md#consoleparse-line--read-a-command-line-into-arguments) | Read a command line into arguments | Derivation | M16 | Built |
| [`console.run`](console.md#consolerun--run-one-command) | Run one command | Operation | M16 | Built |
| [`console.command-flags`](console.md#consolecommand-flags--what-the-server-says-a-command-does) | What the server says a command does | Read | M16 | Built |
| [`console.classify`](console.md#consoleclassify--what-is-run-refused-and-confirmed) | What is run, refused and confirmed | Derivation | M16 | Built |
| [`console.session`](console.md#consolesession--the-consoles-database-and-transaction) | The console's database and transaction | Derivation | M16 | Built |
| [`console.secret-arguments`](console.md#consolesecret-arguments--which-arguments-of-a-command-are-secrets) | Which arguments of a command are secrets | Derivation | M16 | Built |
| [`console.reply`](console.md#consolereply--a-reply-as-text-by-its-type) | A reply as text, by its type | Derivation | M16 | Built |
| [`console.output`](console.md#consoleoutput--the-output-commands-and-their-replies) | The output: commands and their replies | View | M16 | Built |
| [`console.copy-reply`](console.md#consolecopy-reply--copy-a-reply) | Copy a reply | Operation | M16 | Built |
| [`console.clear`](console.md#consoleclear--clear-the-output) | Clear the output | Operation | M16 | Built |
| [`console.history`](console.md#consolehistory--the-history-of-commands) | The history of commands | Derivation | M16 | Built |
| [`console.clear-history`](console.md#consoleclear-history--clear-the-history-of-commands) | Clear the history of commands | Operation | M16 | Built |
| [`console.command-docs`](console.md#consolecommand-docs--the-commands-the-server-knows-and-their-arguments) | The commands the server knows, and their arguments | Read | M16 | Built |
| [`console.autocomplete`](console.md#consoleautocomplete--complete-the-names-of-commands) | Complete the names of commands | Derivation | M16 | Built |
| [`console.argument-hint`](console.md#consoleargument-hint--the-hint-of-a-commands-arguments) | The hint of a command's arguments | Derivation | M16 | Built |
| [`console.stop`](console.md#consolestop--stop-waiting-for-a-reply) | Stop waiting for a reply | Operation | M16 | Built |

## Documents

| Feature | Title | Kind | Milestone | Status |
| --- | --- | --- | --- | --- |
| [`document.inspect`](document.md#documentinspect--the-document-in-the-inspector) | The document in the inspector | View | M12 | Built |
| [`document.copy-value`](document.md#documentcopy-value--copy-a-value-from-the-inspector) | Copy a value from the inspector | Operation | M12 | Built |
| [`document.copy-path`](document.md#documentcopy-path--copy-a-field-path-from-the-inspector) | Copy a field path from the inspector | Operation | M12 | Built |
| [`document.read`](document.md#documentread--read-one-document-with-its-types) | Read one document with its types | Read | M12 | Built |
| [`document.inline-edit`](document.md#documentinline-edit--edit-a-value-in-its-cell) | Edit a value in its cell | Operation | M12 | Built |
| [`document.keep-numeric-types`](document.md#documentkeep-numeric-types--keep-the-numeric-type-of-an-edited-value) | Keep the numeric type of an edited value | Derivation | M12 | Built |
| [`document.open`](document.md#documentopen--the-document-tab) | The document tab | View | M12 | Built |
| [`document.save`](document.md#documentsave--save-the-document-of-a-document-tab) | Save the document of a document tab | Operation | M12 | Built |
| [`document.insert`](document.md#documentinsert--insert-documents-from-the-insert-dialog) | Insert documents from the insert dialog | Operation | M12 | Built |
| [`document.parse-insert-text`](document.md#documentparse-insert-text--read-the-documents-of-the-insert-dialog) | Read the documents of the insert dialog | Derivation | M12 | Built |
| [`document.insert-template`](document.md#documentinsert-template--template-of-the-insert-dialog) | Template of the insert dialog | Derivation | M12 | Built |
| [`document.insert-from-tab`](document.md#documentinsert-from-tab--insert-the-new-document-of-a-document-tab) | Insert the new document of a document tab | Operation | M12 | Built |
| [`document.duplicate`](document.md#documentduplicate--duplicate-a-document) | Duplicate a document | Operation | M12 | Built |
| [`document.delete`](document.md#documentdelete--delete-a-document) | Delete a document | Operation | M12 | Built |
| [`document.delete-selected`](document.md#documentdelete-selected--delete-the-selected-rows) | Delete the selected rows | Operation | M12 | Built |
| [`document.update-selected`](document.md#documentupdate-selected--update-the-selected-rows) | Update the selected rows | Operation | M12 | Built |
| [`document.update-many`](document.md#documentupdate-many--update-many) | Update many | Operation | M12 | Built |
| [`document.delete-many`](document.md#documentdelete-many--delete-many) | Delete many | Operation | M12 | Built |
| [`document.restore-version`](document.md#documentrestore-version--restore-a-version-from-the-document-history) | Restore a version from the document history | Operation | M12 | Built |

## Explain

| Feature | Title | Kind | Milestone | Status |
| --- | --- | --- | --- | --- |
| [`explain.show`](explain.md#explainshow--the-explain-section) | The Explain section | View | M23 | Specified |
| [`explain.run`](explain.md#explainrun--ask-the-server-for-the-explain) | Ask the server for the explain | Read | M23 | Specified |
| [`explain.summary`](explain.md#explainsummary--the-summary-of-an-explain) | The summary of an explain | Derivation | M23 | Specified |
| [`explain.shards`](explain.md#explainshards--the-winning-plan-of-each-shard) | The winning plan of each shard | Derivation | M23 | Specified |
| [`explain.suggest-index`](explain.md#explainsuggest-index--the-index-that-would-serve-a-query) | The index that would serve a query | Derivation | M23 | Specified |
| [`explain.raw`](explain.md#explainraw--the-raw-output-of-an-explain) | The raw output of an explain | View | M23 | Specified |

## Column actions

| Feature | Title | Kind | Milestone | Status |
| --- | --- | --- | --- | --- |
| [`field.rename`](field.md#fieldrename--rename-a-field) | Rename a field | Operation | M21 | Built |
| [`field.remove`](field.md#fieldremove--remove-a-field) | Remove a field | Operation | M21 | Built |
| [`field.convert-type`](field.md#fieldconvert-type--convert-the-type-of-a-field) | Convert the type of a field | Operation | M21 | Built |
| [`field.path-rules`](field.md#fieldpath-rules--which-fields-a-column-action-can-change) | Which fields a column action can change | Derivation | M21 | Built |
| [`field.array-guard`](field.md#fieldarray-guard--leave-out-the-documents-where-a-parent-is-an-array) | Leave out the documents where a parent is an array | Derivation | M21 | Built |
| [`field.rename-plan`](field.md#fieldrename-plan--which-documents-a-rename-touches) | Which documents a rename touches | Derivation | M21 | Built |
| [`field.remove-plan`](field.md#fieldremove-plan--which-documents-a-removal-touches) | Which documents a removal touches | Derivation | M21 | Built |
| [`field.convert-plan`](field.md#fieldconvert-plan--which-values-a-conversion-touches) | Which values a conversion touches | Derivation | M21 | Built |
| [`field.type-counts`](field.md#fieldtype-counts--the-current-types-of-a-field) | The current types of a field | Derivation | M21 | Built |
| [`field.layout-follows`](field.md#fieldlayout-follows--the-column-follows-a-renamed-or-removed-field) | The column follows a renamed or removed field | Derivation | M21 | Built |

## GridFS

| Feature | Title | Kind | Milestone | Status |
| --- | --- | --- | --- | --- |
| [`gridfs.show`](gridfs.md#gridfsshow--the-page-of-a-bucket) | The page of a bucket | View | M33 | Built |
| [`gridfs.buckets`](gridfs.md#gridfsbuckets--the-buckets-of-a-database) | The buckets of a database | Derivation | M33 | Built |
| [`gridfs.list`](gridfs.md#gridfslist--a-page-of-the-files-of-a-bucket) | A page of the files of a bucket | Read | M33 | Built |
| [`gridfs.filter`](gridfs.md#gridfsfilter--the-filter-of-the-files) | The filter of the files | Derivation | M33 | Built |
| [`gridfs.size-text`](gridfs.md#gridfssize-text--a-size-in-words) | A size in words | Derivation | M33 | Built |
| [`gridfs.inspect`](gridfs.md#gridfsinspect--a-file-in-the-inspector) | A file in the inspector | View | M33 | Built |
| [`gridfs.preview`](gridfs.md#gridfspreview--the-preview-of-a-file) | The preview of a file | Read | M33 | Built |
| [`gridfs.hex-dump`](gridfs.md#gridfshex-dump--the-hex-dump-of-the-first-bytes) | The hex dump of the first bytes | Derivation | M33 | Built |
| [`gridfs.content-type`](gridfs.md#gridfscontent-type--the-content-type-of-a-file-name) | The content type of a file name | Derivation | M33 | Built |
| [`gridfs.upload`](gridfs.md#gridfsupload--upload-files-to-a-bucket) | Upload files to a bucket | Operation | M33 | Built |
| [`gridfs.create-bucket`](gridfs.md#gridfscreate-bucket--create-a-bucket-by-uploading-to-it) | Create a bucket by uploading to it | Operation | M33 | Built |
| [`gridfs.download`](gridfs.md#gridfsdownload--download-a-file) | Download a file | Operation | M33 | Built |
| [`gridfs.open`](gridfs.md#gridfsopen--open-a-file-with-the-systems-application) | Open a file with the system's application | Operation | M33 | Built |
| [`gridfs.rename`](gridfs.md#gridfsrename--rename-a-file) | Rename a file | Operation | M33 | Built |
| [`gridfs.edit-metadata`](gridfs.md#gridfsedit-metadata--edit-the-files-document-of-a-file) | Edit the files document of a file | Operation | M33 | Built |
| [`gridfs.delete`](gridfs.md#gridfsdelete--delete-a-file) | Delete a file | Operation | M33 | Built |
| [`gridfs.drop-bucket`](gridfs.md#gridfsdrop-bucket--delete-a-bucket) | Delete a bucket | Operation | M33 | Built |

## Document history

| Feature | Title | Kind | Milestone | Status |
| --- | --- | --- | --- | --- |
| [`history.show`](history.md#historyshow--the-document-history-page) | The document history page | View | M27 | Built |
| [`history.oplog-window`](history.md#historyoplog-window--whether-there-is-an-oplog-and-how-far-back-it-goes) | Whether there is an oplog, and how far back it goes | Read | M27 | Built |
| [`history.read-writes`](history.md#historyread-writes--read-a-documents-writes-from-the-oplog-a-part-at-a-time) | Read a document's writes from the oplog, a part at a time | Read | M27 | Built |
| [`history.document-writes`](history.md#historydocument-writes--the-writes-of-an-oplog-entry-to-one-document) | The writes of an oplog entry to one document | Derivation | M27 | Built |
| [`history.update-changes`](history.md#historyupdate-changes--the-fields-an-update-set-and-unset) | The fields an update set and unset | Derivation | M27 | Built |
| [`history.versions`](history.md#historyversions--rebuild-the-versions-of-a-document) | Rebuild the versions of a document | Derivation | M27 | Built |
| [`history.diff`](history.md#historydiff--the-difference-between-two-versions) | The difference between two versions | Derivation | M27 | Built |
| [`history.own-writes`](history.md#historyown-writes--which-writes-were-datardos-own) | Which writes were Datardo's own | Derivation | M27 | Built |
| [`history.version-detail`](history.md#historyversion-detail--a-version-in-the-inspector) | A version in the inspector | View | M27 | Built |
| [`history.copy-version`](history.md#historycopy-version--copy-a-version-of-the-document) | Copy a version of the document | Operation | M27 | Built |

## Home

| Feature | Title | Kind | Milestone | Status |
| --- | --- | --- | --- | --- |
| [`home.show`](home.md#homeshow--the-home-page) | The Home page | View | M5 | Built |
| [`home.jump-back-in`](home.md#homejump-back-in--jump-back-in) | Jump back in | View | M5 | Built |
| [`home.forget-recent`](home.md#homeforget-recent--remove-a-recent-place) | Remove a recent place | Operation | M5 | Built |
| [`home.connections`](home.md#homeconnections--the-connection-cards-by-folder) | The connection cards, by folder | View | M5 | Built |
| [`home.card`](home.md#homecard--a-connection-card) | A connection card | View | M5 | Built |
| [`home.address`](home.md#homeaddress--the-address-of-a-connection-without-credentials) | The address of a connection, without credentials | Derivation | M5 | Built |
| [`home.filter`](home.md#homefilter--filter-the-cards-by-text-and-by-engine) | Filter the cards by text and by engine | Derivation | M5 | Built |
| [`home.card-menu`](home.md#homecard-menu--the-menu-of-a-connection) | The menu of a connection | View | M5 | Built |

## Indexes

| Feature | Title | Kind | Milestone | Status |
| --- | --- | --- | --- | --- |
| [`index.show`](index.md#indexshow--the-indexes-section) | The Indexes section | View | M22 | Specified |
| [`index.list`](index.md#indexlist--the-indexes-of-a-collection-with-size-usage-and-builds) | The indexes of a collection with size, usage and builds | Read | M22 | Specified |
| [`index.list-search`](index.md#indexlist-search--the-search-indexes-of-a-collection) | The search indexes of a collection | Read | M22 | Specified |
| [`index.properties`](index.md#indexproperties--the-badges-of-an-index) | The badges of an index | Derivation | M22 | Specified |
| [`index.inspect`](index.md#indexinspect--an-index-in-the-inspector) | An index in the inspector | View | M22 | Specified |
| [`index.command`](index.md#indexcommand--the-mongosh-command-of-an-index) | The mongosh command of an index | Derivation | M22 | Specified |
| [`index.dialog`](index.md#indexdialog--the-index-dialog) | The index dialog | View | M22 | Specified |
| [`index.create`](index.md#indexcreate--create-an-index) | Create an index | Operation | M22 | Specified |
| [`index.duplicate`](index.md#indexduplicate--duplicate-an-index) | Duplicate an index | View | M22 | Specified |
| [`index.edit`](index.md#indexedit--edit-an-index) | Edit an index | Operation | M22 | Specified |
| [`index.hide`](index.md#indexhide--hide-or-unhide-an-index) | Hide or unhide an index | Operation | M22 | Specified |
| [`index.drop`](index.md#indexdrop--drop-an-index) | Drop an index | Operation | M22 | Specified |
| [`index.search-dialog`](index.md#indexsearch-dialog--the-search-index-dialog) | The search index dialog | View | M22 | Specified |
| [`index.create-search`](index.md#indexcreate-search--create-a-search-index) | Create a search index | Operation | M22 | Specified |
| [`index.edit-search`](index.md#indexedit-search--change-a-search-indexs-definition) | Change a search index's definition | Operation | M22 | Specified |
| [`index.drop-search`](index.md#indexdrop-search--drop-a-search-index) | Drop a search index | Operation | M22 | Specified |
| [`index.change-plan`](index.md#indexchange-plan--what-changing-an-index-takes) | What changing an index takes | Derivation | M22 | Specified |
| [`index.wildcard-checks`](index.md#indexwildcard-checks--wildcards-written-wrong) | Wildcards written wrong | Derivation | M22 | Specified |
| [`index.search-checks`](index.md#indexsearch-checks--what-a-search-index-definition-is-refused-for) | What a search index definition is refused for | Derivation | M22 | Specified |
| [`index.search-summary`](index.md#indexsearch-summary--a-search-index-definition-in-short) | A search index definition in short | Derivation | M22 | Specified |
| [`index.search-form`](index.md#indexsearch-form--a-search-index-definition-from-the-form) | A search index definition from the form | Derivation | M22 | Specified |

## Keys

| Feature | Title | Kind | Milestone | Status |
| --- | --- | --- | --- | --- |
| [`key.show`](key.md#keyshow--the-keys-tab) | The keys tab | View | M13 | Built |
| [`key.scan`](key.md#keyscan--scan-the-keys) | Scan the keys | Read | M13 | Built |
| [`key.pattern`](key.md#keypattern--from-what-is-typed-to-a-pattern) | From what is typed to a pattern | Derivation | M13 | Built |
| [`key.details`](key.md#keydetails--expiry-and-size-of-the-rows-on-screen) | Expiry and size of the rows on screen | Read | M13 | Built |
| [`key.sort`](key.md#keysort--sort-the-loaded-keys) | Sort the loaded keys | Derivation | M13 | Built |
| [`key.select`](key.md#keyselect--select-keys) | Select keys | View | M13 | Built |
| [`key.refresh`](key.md#keyrefresh--refresh-the-keys-tab) | Refresh the keys tab | Operation | M13 | Built |
| [`key.inspect`](key.md#keyinspect--a-key-in-the-inspector-island) | A key in the inspector island | View | M13 | Built |
| [`key.format-expiry`](key.md#keyformat-expiry--the-time-left-and-the-date-of-an-expiry) | The time left and the date of an expiry | Derivation | M13 | Built |
| [`key.parse-duration`](key.md#keyparse-duration--a-duration-as-the-user-types-it) | A duration as the user types it | Derivation | M13 | Built |
| [`key.open`](key.md#keyopen--open-a-key-in-a-key-tab) | Open a key in a key tab | Operation | M13 | Built |
| [`key.new`](key.md#keynew--new-key) | New key | Operation | M13 | Built |
| [`key.rename`](key.md#keyrename--rename-a-key) | Rename a key | Operation | M13 | Built |
| [`key.copy`](key.md#keycopy--copy-a-key) | Copy a key | Operation | M13 | Built |
| [`key.set-expiry`](key.md#keyset-expiry--set-the-expiry-of-a-key) | Set the expiry of a key | Operation | M13 | Built |
| [`key.persist`](key.md#keypersist--make-a-key-persistent) | Make a key persistent | Operation | M13 | Built |
| [`key.delete`](key.md#keydelete--delete-a-key) | Delete a key | Operation | M13 | Built |
| [`key.delete-selected`](key.md#keydelete-selected--delete-the-selected-keys) | Delete the selected keys | Operation | M13 | Built |
| [`key.delete-by-pattern`](key.md#keydelete-by-pattern--delete-the-keys-matching-a-pattern) | Delete the keys matching a pattern | Operation | M13 | Built |
| [`key.copy-name`](key.md#keycopy-name--copy-the-name-of-a-key) | Copy the name of a key | Operation | M13 | Built |
| [`key.export`](key.md#keyexport--export-keys-to-a-file) | Export keys to a file | Operation | M13 | Built |
| [`key.export-text`](key.md#keyexport-text--the-file-of-exported-keys) | The file of exported keys | Derivation | M13 | Built |
| [`key.import`](key.md#keyimport--import-keys-from-a-file) | Import keys from a file | Operation | M13 | Built |
| [`key.import-parse`](key.md#keyimport-parse--read-a-file-of-exported-keys) | Read a file of exported keys | Derivation | M13 | Built |
| [`key.switch-database`](key.md#keyswitch-database--switch-database) | Switch database | Operation | M13 | Built |

## Databases and collections

| Feature | Title | Kind | Milestone | Status |
| --- | --- | --- | --- | --- |
| [`manage.create-database`](manage.md#managecreate-database--create-a-database) | Create a database | Operation | M21 | Built |
| [`manage.create-collection`](manage.md#managecreate-collection--create-a-collection) | Create a collection | Operation | M21 | Built |
| [`manage.rename-collection`](manage.md#managerename-collection--rename-a-collection) | Rename a collection | Operation | M21 | Built |
| [`manage.drop-collection`](manage.md#managedrop-collection--drop-a-collection-or-a-view) | Drop a collection or a view | Operation | M21 | Built |
| [`manage.drop-database`](manage.md#managedrop-database--drop-a-database) | Drop a database | Operation | M21 | Built |
| [`manage.name-rules`](manage.md#managename-rules--valid-names-of-databases-and-collections) | Valid names of databases and collections | Derivation | M21 | Built |
| [`manage.read-options`](manage.md#manageread-options--the-options-of-a-collection-or-a-view) | The options of a collection or a view | Read | M21 | Built |
| [`manage.definition`](manage.md#managedefinition--the-definition-section-of-a-view) | The Definition section of a view | View | M21 | Built |
| [`manage.edit-view`](manage.md#manageedit-view--save-a-views-definition) | Save a view's definition | Operation | M21 | Built |
| [`manage.validation`](manage.md#managevalidation--the-validation-section-of-a-collection) | The Validation section of a collection | View | M21 | Built |
| [`manage.edit-validation`](manage.md#manageedit-validation--save-a-collections-validation-rules) | Save a collection's validation rules | Operation | M21 | Built |
| [`manage.generate-json-schema`](manage.md#managegenerate-json-schema--the-jsonschema-proposed-from-a-sample) | The `$jsonSchema` proposed from a sample | Derivation | M21 | Built |

## The MCP server

| Feature | Title | Kind | Milestone | Status |
| --- | --- | --- | --- | --- |
| [`mcp.server`](mcp.md#mcpserver--run-the-mcp-server-on-127001) | Run the MCP server on 127.0.0.1 | Operation | M29 | Built |
| [`mcp.status`](mcp.md#mcpstatus--the-state-of-the-mcp-server-in-the-top-bar) | The state of the MCP server in the top bar | View | M29 | Built |
| [`mcp.access-token`](mcp.md#mcpaccess-token--generate-a-new-access-token) | Generate a new access token | Operation | M29 | Built |
| [`mcp.setup`](mcp.md#mcpsetup--set-up-the-mcp-server-for-ai-assistants) | Set up the MCP server for AI assistants… | Operation | M29 | Built |
| [`mcp.change-port`](mcp.md#mcpchange-port--change-mcp-server-port) | Change MCP server port… | Operation | M29 | Built |
| [`mcp.read-data`](mcp.md#mcpread-data--the-tools-offered-without-reading-data) | The tools offered without reading data | Derivation | M29 | Built |
| [`mcp.protocol`](mcp.md#mcpprotocol--answer-a-message-of-the-model-context-protocol) | Answer a message of the Model Context Protocol | Derivation | M29 | Built |
| [`mcp.arguments`](mcp.md#mcparguments--read-the-arguments-of-a-tool) | Read the arguments of a tool | Derivation | M29 | Built |
| [`mcp.output-limits`](mcp.md#mcpoutput-limits--bound-what-a-tool-returns-and-how-long-it-runs) | Bound what a tool returns and how long it runs | Derivation | M29 | Built |
| [`mcp.refuse-write-stages`](mcp.md#mcprefuse-write-stages--refuse-pipelines-with-out-or-merge) | Refuse pipelines with $out or $merge | Derivation | M29 | Built |
| [`mcp.log`](mcp.md#mcplog--the-mcp-server-in-the-log) | The MCP server in the Log | Derivation | M29 | Built |
| [`mcp.data-tools`](mcp.md#mcpdata-tools--explore-the-connections-and-read-documents) | Explore the connections and read documents | Read | M29 | Built |
| [`mcp.debugging-tools`](mcp.md#mcpdebugging-tools--follow-what-an-application-writes) | Follow what an application writes | Read | M29 | Built |
| [`mcp.performance-tools`](mcp.md#mcpperformance-tools--find-what-makes-a-database-slow) | Find what makes a database slow | Read | M29 | Built |
| [`mcp.deployment-tools`](mcp.md#mcpdeployment-tools--read-the-state-of-the-deployment) | Read the state of the deployment | Read | M29 | Built |
| [`mcp.data-model-tools`](mcp.md#mcpdata-model-tools--answer-quick-questions-about-the-data-model) | Answer quick questions about the data model | Read | M29 | Built |
| [`mcp.redis-key-tools`](mcp.md#mcpredis-key-tools--read-the-keys-of-a-redis-server) | Read the keys of a Redis server | Read | M29 | Built |
| [`mcp.redis-server-tools`](mcp.md#mcpredis-server-tools--read-the-state-of-a-redis-server) | Read the state of a Redis server | Read | M29 | Built |
| [`mcp.tab-tools`](mcp.md#mcptab-tools--open-datardos-tabs-for-the-user) | Open Datardo's tabs for the user | Read | M29 | Built |

## Monitor

| Feature | Title | Kind | Milestone | Status |
| --- | --- | --- | --- | --- |
| [`monitor.show`](monitor.md#monitorshow--the-monitor-page) | The Monitor page | View | M30 | Specified |
| [`monitor.operations`](monitor.md#monitoroperations--the-operations-section) | The Operations section | View | M30 | Specified |
| [`monitor.read-operations`](monitor.md#monitorread-operations--read-the-operations-in-progress) | Read the operations in progress | Read | M30 | Specified |
| [`monitor.kill-operation`](monitor.md#monitorkill-operation--kill-a-server-operation) | Kill a server operation | Operation | M30 | Specified |
| [`monitor.slow-queries`](monitor.md#monitorslow-queries--the-slow-queries-section) | The Slow queries section | View | M30 | Specified |
| [`monitor.read-slow-queries`](monitor.md#monitorread-slow-queries--read-the-slow-operations) | Read the slow operations | Read | M30 | Specified |
| [`monitor.query-shape`](monitor.md#monitorquery-shape--the-shape-of-a-query) | The shape of a query | Derivation | M30 | Specified |
| [`monitor.group-slow-queries`](monitor.md#monitorgroup-slow-queries--totals-per-query-shape) | Totals per query shape | Derivation | M30 | Specified |
| [`monitor.set-profiler`](monitor.md#monitorset-profiler--set-the-profiler-of-a-database) | Set the profiler of a database | Operation | M30 | Specified |
| [`monitor.set-log-threshold`](monitor.md#monitorset-log-threshold--set-the-threshold-of-slow-operations) | Set the threshold of slow operations | Operation | M30 | Specified |
| [`monitor.clear-profiler`](monitor.md#monitorclear-profiler--clear-the-operations-the-profiler-recorded) | Clear the operations the profiler recorded | Operation | M30 | Specified |
| [`monitor.create-suggested-index`](monitor.md#monitorcreate-suggested-index--create-the-index-a-slow-query-suggests) | Create the index a slow query suggests | Operation | M30 | Specified |
| [`monitor.open-slow-query`](monitor.md#monitoropen-slow-query--open-a-slow-query-in-its-collection) | Open a slow query in its collection | Operation | M30 | Specified |
| [`monitor.stats`](monitor.md#monitorstats--the-stats-section) | The Stats section | View | M31 | Specified |
| [`monitor.read-server-status`](monitor.md#monitorread-server-status--read-the-servers-status) | Read the server's status | Read | M31 | Specified |
| [`monitor.read-database-stats`](monitor.md#monitorread-database-stats--read-the-statistics-of-the-databases) | Read the statistics of the databases | Read | M31 | Specified |
| [`monitor.read-collection-stats`](monitor.md#monitorread-collection-stats--read-the-statistics-of-a-databases-collections) | Read the statistics of a database's collections | Read | M31 | Specified |
| [`monitor.rates`](monitor.md#monitorrates--rates-between-two-reads-and-their-last-values) | Rates between two reads, and their last values | Derivation | M31 | Specified |
| [`monitor.replication`](monitor.md#monitorreplication--the-replication-section) | The Replication section | View | M31 | Specified |
| [`monitor.read-replication`](monitor.md#monitorread-replication--read-the-replica-set) | Read the replica set | Read | M31 | Specified |
| [`monitor.replication-lag`](monitor.md#monitorreplication-lag--members-and-their-lag) | Members and their lag | Derivation | M31 | Specified |
| [`monitor.read-oplog`](monitor.md#monitorread-oplog--read-the-last-oplog-entries) | Read the last oplog entries | Read | M31 | Specified |
| [`monitor.oplog-summary`](monitor.md#monitoroplog-summary--what-an-oplog-entry-changes) | What an oplog entry changes | Derivation | M31 | Specified |
| [`monitor.step-down`](monitor.md#monitorstep-down--make-the-primary-step-down) | Make the primary step down | Operation | M31 | Specified |
| [`monitor.sharding`](monitor.md#monitorsharding--the-sharding-section) | The Sharding section | View | M31 | Specified |
| [`monitor.read-sharding`](monitor.md#monitorread-sharding--read-the-sharded-cluster) | Read the sharded cluster | Read | M31 | Specified |
| [`monitor.read-sharding-events`](monitor.md#monitorread-sharding-events--read-the-recent-events-of-the-cluster) | Read the recent events of the cluster | Read | M31 | Specified |
| [`monitor.balance`](monitor.md#monitorbalance--whether-a-sharded-collection-is-balanced) | Whether a sharded collection is balanced | Derivation | M31 | Specified |
| [`monitor.set-balancer`](monitor.md#monitorset-balancer--stop-or-start-the-balancer) | Stop or start the balancer | Operation | M31 | Specified |
| [`monitor.set-collection-balancing`](monitor.md#monitorset-collection-balancing--disable-or-enable-the-balancing-of-a-collection) | Disable or enable the balancing of a collection | Operation | M31 | Specified |

## Getting around

| Feature | Title | Kind | Milestone | Status |
| --- | --- | --- | --- | --- |
| [`nav.rail`](nav.md#navrail--the-rail) | The rail | View | M2 | Built |
| [`nav.toggle-explorer`](nav.md#navtoggle-explorer--show-or-hide-the-explorer) | Show or hide the explorer | Operation | M2 | Built |
| [`nav.resize`](nav.md#navresize--resize-the-explorer-and-the-inspector-island) | Resize the explorer and the inspector island | Operation | M2 | Built |
| [`nav.layout`](nav.md#navlayout--how-the-islands-share-the-window) | How the islands share the window | Derivation | M2 | Built |
| [`nav.focus-island`](nav.md#navfocus-island--move-between-the-islands-with-the-keyboard) | Move between the islands with the keyboard | Derivation | M2 | Built |
| [`nav.current-connection`](nav.md#navcurrent-connection--which-connection-is-current) | Which connection is current | Derivation | M2 | Built |
| [`nav.connection-island`](nav.md#navconnection-island--the-connection-island) | The connection island | View | M2 | Built |
| [`nav.ping`](nav.md#navping--the-latency-of-the-current-connection) | The latency of the current connection | Read | M2 | Built |
| [`nav.switch-connection`](nav.md#navswitch-connection--switch-to-another-connection) | Switch to another connection | Operation | M2 | Built |
| [`nav.linked-connection`](nav.md#navlinked-connection--the-linked-connection-row) | The linked connection row | View | M2 | Built |
| [`nav.pin`](nav.md#navpin--pin-unpin-and-reorder-the-items-of-a-connection) | Pin, unpin and reorder the items of a connection | Operation | M2 | Built |
| [`nav.scope-bar`](nav.md#navscope-bar--the-scope-bar) | The scope bar | View | M2 | Built |
| [`nav.back`](nav.md#navback--back-and-forward) | Back and Forward | Operation | M2 | Built |
| [`nav.path`](nav.md#navpath--the-path-of-the-active-tab) | The path of the active tab | View | M2 | Built |
| [`nav.copy-path`](nav.md#navcopy-path--copy-the-path) | Copy the path | Operation | M2 | Built |
| [`nav.open-on-another-connection`](nav.md#navopen-on-another-connection--open-on-another-connection) | Open on another connection | Operation | M2 | Built |
| [`nav.inspector`](nav.md#navinspector--the-inspector-island) | The inspector island | View | M2 | Built |
| [`nav.toggle-inspector`](nav.md#navtoggle-inspector--show-or-hide-the-inspector-island) | Show or hide the inspector island | Operation | M2 | Built |
| [`nav.status-line`](nav.md#navstatus-line--the-status-line) | The status line | View | M2 | Built |
| [`nav.dialog`](nav.md#navdialog--how-every-dialog-behaves) | How every dialog behaves | View | M2 | Built |
| [`nav.empty`](nav.md#navempty--the-window-with-no-connection) | The window with no connection | View | M2 | Built |

## redis-oplog

| Feature | Title | Kind | Milestone | Status |
| --- | --- | --- | --- | --- |
| [`oplog.publish`](oplog.md#oplogpublish--publish-the-events-of-a-write-to-redis) | Publish the events of a write to Redis | Operation | M11 | Built |
| [`oplog.scope`](oplog.md#oplogscope--which-databases-and-collections-publish) | Which databases and collections publish | Derivation | M11 | Built |
| [`oplog.message`](oplog.md#oplogmessage--the-event-of-a-document-and-its-channels) | The event of a document and its channels | Derivation | M11 | Built |
| [`oplog.updated-fields`](oplog.md#oplogupdated-fields--the-fields-an-update-changes) | The fields an update changes | Derivation | M11 | Built |
| [`oplog.changes`](oplog.md#oplogchanges--the-events-of-a-write-from-the-documents-before-and-after) | The events of a write from the documents before and after | Derivation | M11 | Built |
| [`oplog.playground-writes`](oplog.md#oplogplayground-writes--publish-the-playgrounds-writes) | Publish the playground's writes | Operation | M11 | Built |
| [`oplog.publish-error`](oplog.md#oplogpublish-error--the-warning-when-redis-fails) | The warning when Redis fails | View | M11 | Built |

## Go to

| Feature | Title | Kind | Milestone | Status |
| --- | --- | --- | --- | --- |
| [`palette.open`](palette.md#paletteopen--open-go-to) | Open Go to | View | M5 | Built |
| [`palette.recent`](palette.md#paletterecent--recent-places) | Recent places | Read | M5 | Built |
| [`palette.sources`](palette.md#palettesources--where-go-to-looks) | Where Go to looks | Derivation | M5 | Built |
| [`palette.find-collections`](palette.md#palettefind-collections--the-names-of-collections-for-go-to) | The names of collections for Go to | Read | M5 | Built |
| [`palette.find-keys`](palette.md#palettefind-keys--the-keys-of-the-current-redis-connection-for-go-to) | The keys of the current Redis connection for Go to | Read | M5 | Built |
| [`palette.rank`](palette.md#paletterank--how-go-to-ranks-what-it-finds) | How Go to ranks what it finds | Derivation | M5 | Built |
| [`palette.open-result`](palette.md#paletteopen-result--open-a-result) | Open a result | Operation | M5 | Built |
| [`palette.commands`](palette.md#palettecommands--every-command-with-its-title-and-its-key) | Every command, with its title and its key | Derivation | M5 | Built |
| [`palette.run-command`](palette.md#paletterun-command--run-a-command) | Run a command | Operation | M5 | Built |
| [`palette.key-press`](palette.md#palettekey-press--which-command-a-key-starts) | Which command a key starts | Derivation | M5 | Built |

## Playgrounds

| Feature | Title | Kind | Milestone | Status |
| --- | --- | --- | --- | --- |
| [`playground.show`](playground.md#playgroundshow--the-playground-tab) | The playground tab | View | M28 | Built |
| [`playground.open`](playground.md#playgroundopen--new-playground) | New playground | Operation | M28 | Built |
| [`playground.open-file`](playground.md#playgroundopen-file--open-a-playground-file) | Open a playground file… | Operation | M28 | Built |
| [`playground.save`](playground.md#playgroundsave--save-a-playground) | Save a playground | Operation | M28 | Built |
| [`playground.target`](playground.md#playgroundtarget--the-connection-and-database-of-a-playground) | The connection and database of a playground | Operation | M28 | Built |
| [`playground.run`](playground.md#playgroundrun--run-a-playground) | Run a playground | Operation | M28 | Built |
| [`playground.statements`](playground.md#playgroundstatements--the-statements-of-a-script) | The statements of a script | Derivation | M28 | Built |
| [`playground.rewrite`](playground.md#playgroundrewrite--await-the-calls-of-a-script) | Await the calls of a script | Derivation | M28 | Built |
| [`playground.runtime`](playground.md#playgroundruntime--what-a-script-can-use) | What a script can use | Derivation | M28 | Built |
| [`playground.sessions`](playground.md#playgroundsessions--sessions-and-transactions-in-a-script) | Sessions and transactions in a script | Derivation | M28 | Built |
| [`playground.results`](playground.md#playgroundresults--the-results-of-a-run) | The results of a run | View | M28 | Built |
| [`playground.stop`](playground.md#playgroundstop--stop-a-run) | Stop a run | Operation | M28 | Built |
| [`playground.autocomplete`](playground.md#playgroundautocomplete--autocomplete-in-a-playground) | Autocomplete in a playground | Derivation | M28 | Built |
| [`playground.writes`](playground.md#playgroundwrites--the-writes-of-a-playground) | The writes of a playground | Derivation | M28 | Built |

## Pub/Sub

| Feature | Title | Kind | Milestone | Status |
| --- | --- | --- | --- | --- |
| [`pubsub.show`](pubsub.md#pubsubshow--the-pubsub-page) | The Pub/Sub page | View | M18 | Specified |
| [`pubsub.subscribe`](pubsub.md#pubsubsubscribe--subscribe-to-a-channel-or-to-a-pattern) | Subscribe to a channel or to a pattern | Operation | M18 | Specified |
| [`pubsub.subscriptions`](pubsub.md#pubsubsubscriptions--the-list-of-subscriptions) | The list of subscriptions | View | M18 | Specified |
| [`pubsub.unsubscribe`](pubsub.md#pubsubunsubscribe--remove-a-subscription) | Remove a subscription | Operation | M18 | Specified |
| [`pubsub.channels`](pubsub.md#pubsubchannels--the-channels-active-on-the-server) | The channels active on the server | Read | M18 | Specified |
| [`pubsub.messages`](pubsub.md#pubsubmessages--the-list-of-messages) | The list of messages | View | M18 | Specified |
| [`pubsub.keep`](pubsub.md#pubsubkeep--which-messages-the-list-keeps) | Which messages the list keeps | Derivation | M18 | Specified |
| [`pubsub.pause`](pubsub.md#pubsubpause--pause-and-resume-the-list) | Pause and resume the list | Operation | M18 | Specified |
| [`pubsub.clear`](pubsub.md#pubsubclear--clear-the-list-of-messages) | Clear the list of messages | Operation | M18 | Specified |
| [`pubsub.filter`](pubsub.md#pubsubfilter--filter-the-list-of-messages) | Filter the list of messages | Derivation | M18 | Specified |
| [`pubsub.inspect`](pubsub.md#pubsubinspect--a-message-in-the-inspector-island) | A message in the inspector island | View | M18 | Specified |
| [`pubsub.copy`](pubsub.md#pubsubcopy--copy-messages) | Copy messages | Operation | M18 | Specified |
| [`pubsub.export`](pubsub.md#pubsubexport--export-the-messages-to-a-file) | Export the messages to a file | Operation | M18 | Specified |
| [`pubsub.publish`](pubsub.md#pubsubpublish--publish-a-message) | Publish a message | Operation | M18 | Specified |
| [`pubsub.reconnect`](pubsub.md#pubsubreconnect--when-the-pubsub-connection-drops) | When the Pub/Sub connection drops | Operation | M18 | Specified |
| [`pubsub.follow-oplog`](pubsub.md#pubsubfollow-oplog--follow-the-redis-oplog-events-of-a-mongodb-connection) | Follow the redis-oplog events of a MongoDB connection | Operation | M18 | Specified |
| [`pubsub.oplog-event`](pubsub.md#pubsuboplog-event--read-a-message-as-a-redis-oplog-event) | Read a message as a redis-oplog event | Derivation | M18 | Specified |
| [`pubsub.event-rows`](pubsub.md#pubsubevent-rows--one-row-per-event) | One row per event | Derivation | M18 | Specified |

## The query bar

| Feature | Title | Kind | Milestone | Status |
| --- | --- | --- | --- | --- |
| [`query.bar`](query.md#querybar--the-query-bar) | The query bar | View | M9 | Built |
| [`query.mode`](query.md#querymode--switch-between-find-and-aggregate) | Switch between Find and Aggregate | Derivation | M9 | Built |
| [`query.run`](query.md#queryrun--run-the-query) | Run the query | Read | M9 | Built |
| [`query.count`](query.md#querycount--count-the-matching-documents) | Count the matching documents | Read | M9 | Built |
| [`query.reset`](query.md#queryreset--reset-the-query) | Reset the query | Derivation | M9 | Built |
| [`query.restore`](query.md#queryrestore--the-query-a-tab-remembers) | The query a tab remembers | Derivation | M9 | Built |
| [`query.parse`](query.md#queryparse--read-mongosh-syntax-into-values) | Read mongosh syntax into values | Derivation | M9 | Built |
| [`query.format`](query.md#queryformat--write-values-as-mongosh-syntax) | Write values as mongosh syntax | Derivation | M9 | Built |
| [`query.highlight`](query.md#queryhighlight--the-syntax-colors-of-mongosh-text) | The syntax colors of mongosh text | Derivation | M9 | Built |
| [`query.builder`](query.md#querybuilder--the-query-builder) | The query builder | View | M9 | Built |
| [`query.builder-filter`](query.md#querybuilder-filter--the-filter-of-the-builders-rows) | The filter of the builder's rows | Derivation | M9 | Built |
| [`query.builder-rows`](query.md#querybuilder-rows--the-builders-rows-of-a-filter) | The builder's rows of a filter | Derivation | M9 | Built |
| [`query.autocomplete`](query.md#queryautocomplete--suggestions-while-typing) | Suggestions while typing | View | M9 | Built |
| [`query.suggestions`](query.md#querysuggestions--what-is-suggested-where-the-cursor-is) | What is suggested where the cursor is | Derivation | M9 | Built |
| [`query.field-hints`](query.md#queryfield-hints--the-fields-and-frequent-values-of-a-collection) | The fields and frequent values of a collection | Read | M9 | Built |
| [`query.drag`](query.md#querydrag--drag-a-field-or-a-value-into-the-bar) | Drag a field or a value into the bar | View | M9 | Built |
| [`query.add-condition`](query.md#queryadd-condition--add-a-condition-to-the-filter) | Add a condition to the filter | Derivation | M9 | Built |
| [`query.add-sort`](query.md#queryadd-sort--add-a-field-to-the-sort) | Add a field to the sort | Derivation | M9 | Built |
| [`query.add-projection`](query.md#queryadd-projection--add-a-field-to-the-projection) | Add a field to the projection | Derivation | M9 | Built |

## References

| Feature | Title | Kind | Milestone | Status |
| --- | --- | --- | --- | --- |
| [`relation.detect`](relation.md#relationdetect--which-fields-are-references) | Which fields are references | Derivation | M34 | Specified |
| [`relation.candidates`](relation.md#relationcandidates--which-fields-are-looked-up-and-where) | Which fields are looked up, and where | Derivation | M34 | Specified |
| [`relation.fields`](relation.md#relationfields--the-fields-of-a-sample) | The fields of a sample | Derivation | M34 | Specified |
| [`relation.name-match`](relation.md#relationname-match--whether-a-field-is-named-after-a-collection) | Whether a field is named after a collection | Derivation | M34 | Specified |
| [`relation.read`](relation.md#relationread--read-the-references-of-a-database) | Read the references of a database | Read | M34 | Specified |
| [`relation.diagram`](relation.md#relationdiagram--the-relationship-diagram-page) | The Relationship diagram page | View | M34 | Specified |
| [`relation.layout`](relation.md#relationlayout--where-the-boxes-of-the-diagram-go) | Where the boxes of the diagram go | Derivation | M34 | Specified |
| [`relation.export-mermaid`](relation.md#relationexport-mermaid--copy-the-diagram-as-mermaid) | Copy the diagram as Mermaid | Operation | M34 | Specified |
| [`relation.export-svg`](relation.md#relationexport-svg--save-the-diagram-as-an-svg-image) | Save the diagram as an SVG image | Operation | M34 | Specified |
| [`relation.follow`](relation.md#relationfollow--go-from-here-the-references-of-a-document) | Go from here: the references of a document | View | M34 | Specified |
| [`relation.targets`](relation.md#relationtargets--where-a-reference-leads) | Where a reference leads | Derivation | M34 | Specified |
| [`relation.referrers`](relation.md#relationreferrers--which-documents-refer-to-a-document) | Which documents refer to a document | Derivation | M34 | Specified |
| [`relation.open-referenced`](relation.md#relationopen-referenced--open-the-documents-a-field-refers-to) | Open the documents a field refers to | Operation | M34 | Specified |
| [`relation.open-referencing`](relation.md#relationopen-referencing--open-the-documents-that-refer-to-a-document) | Open the documents that refer to a document | Operation | M34 | Specified |

## The runner

| Feature | Title | Kind | Milestone | Status |
| --- | --- | --- | --- | --- |
| [`runner.ask`](runner.md#runnerask--ask-the-questions-of-a-feature) | Ask the questions of a feature | View | M3 | Built |
| [`runner.confirm`](runner.md#runnerconfirm--the-confirmation-of-a-write-with-its-plan) | The confirmation of a write, with its plan | View | M3 | Built |
| [`runner.run`](runner.md#runnerrun--run-a-plan) | Run a plan | Operation | M3 | Built |
| [`runner.step-text`](runner.md#runnerstep-text--how-a-step-is-written) | How a step is written | Derivation | M3 | Built |
| [`runner.progress`](runner.md#runnerprogress--work-in-progress) | Work in progress | View | M3 | Built |
| [`runner.cancel`](runner.md#runnercancel--cancel-work-in-progress) | Cancel work in progress | Operation | M3 | Built |
| [`runner.refuse`](runner.md#runnerrefuse--show-a-refusal) | Show a refusal | View | M3 | Built |
| [`runner.error`](runner.md#runnererror--show-an-error-of-a-server-or-of-the-system) | Show an error of a server or of the system | Derivation | M3 | Built |
| [`runner.notify`](runner.md#runnernotify--notifications) | Notifications | View | M3 | Built |
| [`runner.log`](runner.md#runnerlog--the-log-page) | The Log page | View | M3 | Built |

## Recent and saved queries

| Feature | Title | Kind | Milestone | Status |
| --- | --- | --- | --- | --- |
| [`saved-query.show`](saved-query.md#saved-queryshow--the-queries-list) | The queries list | View | M20 | Built |
| [`saved-query.list`](saved-query.md#saved-querylist--the-saved-and-recent-queries-of-a-collection) | The saved and recent queries of a collection | Read | M20 | Built |
| [`saved-query.recent`](saved-query.md#saved-queryrecent--the-recent-queries-of-a-collection) | The recent queries of a collection | Operation | M20 | Built |
| [`saved-query.remove-recent`](saved-query.md#saved-queryremove-recent--remove-a-recent-query) | Remove a recent query | Operation | M20 | Built |
| [`saved-query.clear-recent`](saved-query.md#saved-queryclear-recent--clear-the-recent-queries) | Clear the recent queries | Operation | M20 | Built |
| [`saved-query.save`](saved-query.md#saved-querysave--save-a-query) | Save a query | Operation | M20 | Built |
| [`saved-query.file-path`](saved-query.md#saved-queryfile-path--where-the-file-of-a-saved-query-goes) | Where the file of a saved query goes | Derivation | M20 | Built |
| [`saved-query.file-format`](saved-query.md#saved-queryfile-format--the-file-of-a-saved-query) | The file of a saved query | Derivation | M20 | Built |
| [`saved-query.parse-file`](saved-query.md#saved-queryparse-file--a-saved-query-read-from-its-file) | A saved query read from its file | Derivation | M20 | Built |
| [`saved-query.read-folder`](saved-query.md#saved-queryread-folder--the-files-of-the-queries-folder) | The files of the queries folder | Read | M20 | Built |
| [`saved-query.choose-folder`](saved-query.md#saved-querychoose-folder--choose-the-queries-folder-of-a-connection) | Choose the queries folder of a connection | Operation | M20 | Built |
| [`saved-query.run`](saved-query.md#saved-queryrun--run-a-saved-or-recent-query) | Run a saved or recent query | Operation | M20 | Built |
| [`saved-query.rename`](saved-query.md#saved-queryrename--rename-a-saved-query) | Rename a saved query | Operation | M20 | Built |
| [`saved-query.move`](saved-query.md#saved-querymove--move-a-saved-query-between-for-me-and-the-folder) | Move a saved query between for me and the folder | Operation | M20 | Built |
| [`saved-query.delete`](saved-query.md#saved-querydelete--delete-a-saved-query) | Delete a saved query | Operation | M20 | Built |
| [`saved-query.reveal-file`](saved-query.md#saved-queryreveal-file--reveal-the-file-of-a-saved-query) | Reveal the file of a saved query | Operation | M20 | Built |
| [`saved-query.connection-list`](saved-query.md#saved-queryconnection-list--the-saved-queries-of-a-connection-for-go-to-and-for-pins) | The saved queries of a connection, for Go to and for pins | Read | M20 | Built |

## Schema analysis

| Feature | Title | Kind | Milestone | Status |
| --- | --- | --- | --- | --- |
| [`schema.show`](schema.md#schemashow--the-schema-section) | The Schema section | View | M23 | Specified |
| [`schema.sample`](schema.md#schemasample--the-documents-that-are-analyzed) | The documents that are analyzed | Read | M23 | Specified |
| [`schema.analyze`](schema.md#schemaanalyze--the-summary-of-a-sample-of-documents) | The summary of a sample of documents | Derivation | M23 | Specified |
| [`schema.histogram`](schema.md#schemahistogram--the-ranges-of-a-histogram) | The ranges of a histogram | Derivation | M23 | Specified |
| [`schema.share`](schema.md#schemashare--how-a-share-is-written) | How a share is written | Derivation | M23 | Specified |
| [`schema.filter-from-value`](schema.md#schemafilter-from-value--filter-on-a-value-a-range-or-a-type) | Filter on a value, a range or a type | Operation | M23 | Specified |

## Search

| Feature | Title | Kind | Milestone | Status |
| --- | --- | --- | --- | --- |
| [`search.show`](search.md#searchshow--the-search-documents-page) | The Search documents page | View | M34 | Specified |
| [`search.collections`](search.md#searchcollections--read-the-collections-a-search-reads) | Read the collections a search reads | Read | M34 | Specified |
| [`search.scan`](search.md#searchscan--read-the-documents-of-the-collections-and-find-the-matches) | Read the documents of the collections and find the matches | Read | M34 | Specified |
| [`search.text`](search.md#searchtext--what-the-typed-text-looks-for) | What the typed text looks for | Derivation | M34 | Specified |
| [`search.match`](search.md#searchmatch--the-values-of-a-document-that-match) | The values of a document that match | Derivation | M34 | Specified |
| [`search.open-in-collection`](search.md#searchopen-in-collection--open-the-documents-found-in-their-collection) | Open the documents found in their collection | Operation | M34 | Specified |
| [`search.copy-id`](search.md#searchcopy-id--copy-the-_id-of-a-document-found) | Copy the _id of a document found | Operation | M34 | Specified |

## Server

| Feature | Title | Kind | Milestone | Status |
| --- | --- | --- | --- | --- |
| [`server.show`](server.md#servershow--the-server-page) | The Server page | View | M17 | Built |
| [`server.unavailable`](server.md#serverunavailable--what-a-section-shows-when-its-command-cannot-run) | What a section shows when its command cannot run | Derivation | M17 | Built |
| [`server.read-info`](server.md#serverread-info--read-info) | Read INFO | Read | M17 | Built |
| [`server.overview`](server.md#serveroverview--the-overview-section) | The Overview section | View | M17 | Built |
| [`server.read-clients`](server.md#serverread-clients--read-the-connected-clients) | Read the connected clients | Read | M17 | Built |
| [`server.clients`](server.md#serverclients--the-clients-section) | The Clients section | View | M17 | Built |
| [`server.kill-client`](server.md#serverkill-client--disconnect-a-client) | Disconnect a client | Operation | M17 | Built |
| [`server.read-slow-log`](server.md#serverread-slow-log--read-the-slow-log) | Read the slow log | Read | M17 | Built |
| [`server.slow-log`](server.md#serverslow-log--the-slow-log-section) | The Slow log section | View | M17 | Built |
| [`server.slow-log-reset`](server.md#serverslow-log-reset--clear-the-slow-log) | Clear the slow log | Operation | M17 | Built |
| [`server.read-memory`](server.md#serverread-memory--read-the-memory-of-the-server) | Read the memory of the server | Read | M17 | Built |
| [`server.memory`](server.md#servermemory--the-memory-section) | The Memory section | View | M17 | Built |
| [`server.largest-keys`](server.md#serverlargest-keys--find-the-largest-keys) | Find the largest keys | Read | M17 | Built |
| [`server.rank-keys`](server.md#serverrank-keys--rank-keys-by-memory) | Rank keys by memory | Derivation | M17 | Built |
| [`server.replication`](server.md#serverreplication--the-replication-section) | The Replication section | View | M17 | Built |
| [`server.read-config`](server.md#serverread-config--read-the-configuration) | Read the configuration | Read | M17 | Built |
| [`server.config`](server.md#serverconfig--the-configuration-section) | The Configuration section | View | M17 | Built |

## Settings

| Feature | Title | Kind | Milestone | Status |
| --- | --- | --- | --- | --- |
| [`settings.read`](settings.md#settingsread--the-value-of-a-setting) | The value of a setting | Derivation | M3 | Built |
| [`settings.validate`](settings.md#settingsvalidate--whether-a-value-can-be-given-to-a-setting) | Whether a value can be given to a setting | Derivation | M3 | Built |
| [`settings.page`](settings.md#settingspage--the-settings-page) | The Settings page | View | M3 | Built |
| [`settings.change`](settings.md#settingschange--change-a-setting) | Change a setting | Operation | M3 | Built |
| [`settings.reset`](settings.md#settingsreset--reset-a-setting-or-all-of-them) | Reset a setting, or all of them | Operation | M3 | Built |

## Structure

| Feature | Title | Kind | Milestone | Status |
| --- | --- | --- | --- | --- |
| [`structure.show`](structure.md#structureshow--the-structure-comparison-page-of-two-databases) | The structure comparison page of two databases | View | M35 | Built |
| [`structure.read`](structure.md#structureread--read-the-structure-of-a-database) | Read the structure of a database | Read | M35 | Built |
| [`structure.steps`](structure.md#structuresteps--what-each-difference-takes) | What each difference takes | Derivation | M35 | Built |
| [`structure.script`](structure.md#structurescript--the-script-that-makes-the-right-database-like-the-left-one) | The script that makes the right database like the left one | Derivation | M35 | Built |
| [`structure.copy-script`](structure.md#structurecopy-script--copy-the-script) | Copy the script | Operation | M35 | Built |
| [`structure.open-in-playground`](structure.md#structureopen-in-playground--open-the-script-in-a-playground) | Open the script in a playground | Operation | M35 | Built |
| [`structure.apply`](structure.md#structureapply--apply-differences-to-the-right-database) | Apply differences to the right database | Operation | M35 | Built |

## The tab strip

| Feature | Title | Kind | Milestone | Status |
| --- | --- | --- | --- | --- |
| [`tab.strip`](tab.md#tabstrip--the-tab-strip) | The tab strip | View | M4 | Built |
| [`tab.title`](tab.md#tabtitle--the-title-of-a-tab) | The title of a tab | Derivation | M4 | Built |
| [`tab.groups`](tab.md#tabgroups--the-groups-of-the-strip) | The groups of the strip | Derivation | M4 | Built |
| [`tab.collapse-group`](tab.md#tabcollapse-group--collapse-or-expand-a-group) | Collapse or expand a group | Operation | M4 | Built |
| [`tab.fit`](tab.md#tabfit--how-the-tabs-share-the-strip) | How the tabs share the strip | Derivation | M4 | Built |
| [`tab.menu`](tab.md#tabmenu--the-context-menu-of-a-tab) | The context menu of a tab | View | M4 | Built |
| [`tab.open`](tab.md#tabopen--open-a-tab) | Open a tab | Operation | M4 | Built |
| [`tab.same-target`](tab.md#tabsame-target--what-makes-two-tabs-the-same) | What makes two tabs the same | Derivation | M4 | Built |
| [`tab.activate`](tab.md#tabactivate--make-a-tab-active) | Make a tab active | Operation | M4 | Built |
| [`tab.close`](tab.md#tabclose--close-a-tab) | Close a tab | Operation | M4 | Built |
| [`tab.close-many`](tab.md#tabclose-many--close-the-other-tabs-the-tabs-of-a-connection-or-all) | Close the other tabs, the tabs of a connection, or all | Operation | M4 | Built |
| [`tab.connection-gone`](tab.md#tabconnection-gone--the-tabs-of-a-connection-that-is-disconnected-or-removed) | The tabs of a connection that is disconnected or removed | View | M4 | Built |
| [`tab.reorder`](tab.md#tabreorder--reorder-the-tabs-of-a-group) | Reorder the tabs of a group | Operation | M4 | Built |
| [`tab.restore`](tab.md#tabrestore--restore-the-tabs-at-the-next-start) | Restore the tabs at the next start | Operation | M4 | Built |
| [`tab.reopen`](tab.md#tabreopen--reopen-the-last-closed-tab) | Reopen the last closed tab | Operation | M4 | Built |

## The table of the Documents section

| Feature | Title | Kind | Milestone | Status |
| --- | --- | --- | --- | --- |
| [`table.show`](table.md#tableshow--the-documents-section) | The Documents section | View | M10 | Built |
| [`table.detect-columns`](table.md#tabledetect-columns--the-columns-of-a-page-of-documents) | The columns of a page of documents | Derivation | M10 | Built |
| [`table.cell-text`](table.md#tablecell-text--how-a-value-is-written-in-a-cell) | How a value is written in a cell | Derivation | M10 | Built |
| [`table.rows`](table.md#tablerows--the-rows-of-the-table) | The rows of the table | Derivation | M10 | Built |
| [`table.expand`](table.md#tableexpand--expand-a-field-into-columns-or-sub-rows) | Expand a field into columns or sub-rows | Operation | M10 | Built |
| [`table.collapse`](table.md#tablecollapse--collapse-an-expanded-field) | Collapse an expanded field | Operation | M10 | Built |
| [`table.columns`](table.md#tablecolumns--the-columns-layout) | The columns' layout | View | M10 | Built |
| [`table.arrange-columns`](table.md#tablearrange-columns--hide-show-move-pin-and-resize-columns) | Hide, show, move, pin and resize columns | Operation | M10 | Built |
| [`table.layout`](table.md#tablelayout--the-columns-in-the-order-of-their-layout) | The columns in the order of their layout | Derivation | M10 | Built |
| [`table.sort`](table.md#tablesort--sort-from-a-column-header) | Sort from a column header | Derivation | M10 | Built |
| [`table.paging`](table.md#tablepaging--the-paging-row) | The paging row | View | M10 | Built |
| [`table.page-window`](table.md#tablepage-window--which-documents-a-page-asks-for) | Which documents a page asks for | Derivation | M10 | Built |
| [`table.navigate`](table.md#tablenavigate--move-between-cells-with-the-keyboard) | Move between cells with the keyboard | Derivation | M10 | Built |
| [`table.selection`](table.md#tableselection--select-rows) | Select rows | Derivation | M10 | Built |
| [`table.selection-bar`](table.md#tableselection-bar--the-selection-bar-of-the-table) | The selection bar of the table | View | M10 | Built |
| [`table.copy-as`](table.md#tablecopy-as--copy-documents-as-text) | Copy documents as text | Operation | M10 | Built |
| [`table.copy-text`](table.md#tablecopy-text--the-text-of-each-copy-format) | The text of each copy format | Derivation | M10 | Built |
| [`table.copy-value`](table.md#tablecopy-value--copy-the-value-of-a-cell) | Copy the value of a cell | Operation | M10 | Built |
| [`table.copy-path`](table.md#tablecopy-path--copy-a-field-path) | Copy a field path | Operation | M10 | Built |
| [`table.row-menu`](table.md#tablerow-menu--the-context-menu-of-a-row) | The context menu of a row | View | M10 | Built |
| [`table.cell-menu`](table.md#tablecell-menu--the-context-menu-of-a-cell) | The context menu of a cell | View | M10 | Built |
| [`table.column-menu`](table.md#tablecolumn-menu--the-context-menu-of-a-column-header) | The context menu of a column header | View | M10 | Built |
| [`table.refresh`](table.md#tablerefresh--refresh-the-documents) | Refresh the documents | Read | M10 | Built |

## Scheduled tasks

| Feature | Title | Kind | Milestone | Status |
| --- | --- | --- | --- | --- |
| [`task.show`](task.md#taskshow--the-scheduled-tasks-page) | The Scheduled tasks page | View | M26 | Specified |
| [`task.edit`](task.md#taskedit--create-or-edit-a-task) | Create or edit a task | Operation | M26 | Specified |
| [`task.next-runs`](task.md#tasknext-runs--when-a-task-runs) | When a task runs | Derivation | M26 | Specified |
| [`task.due`](task.md#taskdue--due-and-missed-runs) | Due and missed runs | Derivation | M26 | Specified |
| [`task.file-names`](task.md#taskfile-names--the-names-of-what-a-run-writes) | The names of what a run writes | Derivation | M26 | Specified |
| [`task.run`](task.md#taskrun--run-a-task) | Run a task | Operation | M26 | Specified |
| [`task.cancel`](task.md#taskcancel--cancel-a-run) | Cancel a run | Operation | M26 | Specified |
| [`task.retention`](task.md#taskretention--keep-the-last-n-outputs) | Keep the last N outputs | Operation | M26 | Specified |
| [`task.missed`](task.md#taskmissed--runs-missed-while-datardo-was-closed) | Runs missed while Datardo was closed | Operation | M26 | Specified |
| [`task.enable`](task.md#taskenable--enable-or-disable-a-task) | Enable or disable a task | Operation | M26 | Specified |
| [`task.delete`](task.md#taskdelete--delete-a-task) | Delete a task | Operation | M26 | Specified |
| [`task.notify`](task.md#tasknotify--notifications-of-runs) | Notifications of runs | View | M26 | Specified |
| [`task.tray`](task.md#tasktray--keep-datardo-running-in-the-tray-for-the-tasks) | Keep Datardo running in the tray for the tasks | Derivation | M26 | Specified |

## Transfer

| Feature | Title | Kind | Milestone | Status |
| --- | --- | --- | --- | --- |
| [`transfer.export`](transfer.md#transferexport--export-documents-to-a-file) | Export documents to a file | Operation | M25 | Built |
| [`transfer.csv-write`](transfer.md#transfercsv-write--documents-as-csv) | Documents as CSV | Derivation | M25 | Built |
| [`transfer.import`](transfer.md#transferimport--import-documents-from-a-file) | Import documents from a file | Operation | M25 | Built |
| [`transfer.import-files`](transfer.md#transferimport-files--what-an-import-file-holds) | What an import file holds | Derivation | M25 | Built |
| [`transfer.csv-read`](transfer.md#transfercsv-read--csv-rows-as-documents) | CSV rows as documents | Derivation | M25 | Built |
| [`transfer.copy-collection`](transfer.md#transfercopy-collection--copy-a-collection-to-another-database-or-connection) | Copy a collection to another database or connection | Operation | M25 | Built |
| [`transfer.generate`](transfer.md#transfergenerate--generate-test-documents) | Generate test documents | Operation | M25 | Built |
| [`transfer.generate-values`](transfer.md#transfergenerate-values--fake-documents-from-a-schema-analysis) | Fake documents from a schema analysis | Derivation | M25 | Built |

## Tree

| Feature | Title | Kind | Milestone | Status |
| --- | --- | --- | --- | --- |
| [`tree.show`](tree.md#treeshow--the-tree-island) | The tree island | View | M8 | Built |
| [`tree.pinned`](tree.md#treepinned--pinned-items) | Pinned items | View | M8 | Built |
| [`tree.pages`](tree.md#treepages--pages-of-the-connection) | Pages of the connection | View | M8 | Built |
| [`tree.mongodb`](tree.md#treemongodb--the-mongodb-nodes) | The MongoDB nodes | View | M8 | Built |
| [`tree.list-databases`](tree.md#treelist-databases--list-the-databases) | List the databases | Read | M8 | Built |
| [`tree.list-collections`](tree.md#treelist-collections--list-the-collections-of-a-database) | List the collections of a database | Read | M8 | Built |
| [`tree.count`](tree.md#treecount--counts-and-sizes-beside-the-nodes) | Counts and sizes beside the nodes | Read | M8 | Built |
| [`tree.redis`](tree.md#treeredis--the-redis-nodes) | The Redis nodes | View | M8 | Built |
| [`tree.redis-databases`](tree.md#treeredis-databases--list-the-redis-databases) | List the Redis databases | Read | M8 | Built |
| [`tree.scan-namespaces`](tree.md#treescan-namespaces--scan-the-keys-of-a-database-for-its-namespaces) | Scan the keys of a database for its namespaces | Read | M8 | Built |
| [`tree.namespaces`](tree.md#treenamespaces--namespaces-from-key-names) | Namespaces from key names | Derivation | M8 | Built |
| [`tree.refresh`](tree.md#treerefresh--refresh-the-tree) | Refresh the tree | Read | M8 | Built |
| [`tree.filter`](tree.md#treefilter--filter-the-tree) | Filter the tree | View | M8 | Built |
| [`tree.match`](tree.md#treematch--whether-a-node-matches-the-filter) | Whether a node matches the filter | Derivation | M8 | Built |
| [`tree.keyboard`](tree.md#treekeyboard--moving-in-the-tree-with-the-keyboard) | Moving in the tree with the keyboard | View | M8 | Built |
| [`tree.node-states`](tree.md#treenode-states--loading-empty-and-failed-nodes) | Loading, empty and failed nodes | View | M8 | Built |
| [`tree.menu-mongodb`](tree.md#treemenu-mongodb--the-context-menu-of-a-mongodb-node) | The context menu of a MongoDB node | View | M8 | Built |
| [`tree.menu-redis`](tree.md#treemenu-redis--the-context-menu-of-a-redis-node) | The context menu of a Redis node | View | M8 | Built |

## Undo history

| Feature | Title | Kind | Milestone | Status |
| --- | --- | --- | --- | --- |
| [`undo.record`](undo.md#undorecord--record-an-operation-before-a-write) | Record an operation before a write | Operation | M11 | Built |
| [`undo.kept`](undo.md#undokept--which-documents-and-keys-an-operation-keeps) | Which documents and keys an operation keeps | Derivation | M11 | Built |
| [`undo.note`](undo.md#undonote--whether-a-write-can-be-undone-as-its-confirmation-says-it) | Whether a write can be undone, as its confirmation says it | Derivation | M11 | Built |
| [`undo.show`](undo.md#undoshow--the-undo-history-page) | The Undo history page | View | M11 | Built |
| [`undo.details`](undo.md#undodetails--what-undoing-an-operation-would-do) | What undoing an operation would do | Read | M11 | Built |
| [`undo.changed-since`](undo.md#undochanged-since--which-documents-and-keys-changed-since-the-operation) | Which documents and keys changed since the operation | Derivation | M11 | Built |
| [`undo.revert`](undo.md#undorevert--undo-an-operation) | Undo an operation | Operation | M11 | Built |
| [`undo.revert-plan`](undo.md#undorevert-plan--what-undo-does-to-each-document-and-key) | What undo does to each document and key | Derivation | M11 | Built |
| [`undo.notification`](undo.md#undonotification--undo-from-a-writes-notification) | Undo from a write's notification | View | M11 | Built |
| [`undo.last`](undo.md#undolast--undo-last-change) | Undo last change | Operation | M11 | Built |
| [`undo.clear`](undo.md#undoclear--clear-the-undo-history) | Clear the undo history | Operation | M11 | Built |
| [`undo.remove`](undo.md#undoremove--remove-one-operation) | Remove one operation | Operation | M11 | Built |
| [`undo.limits`](undo.md#undolimits--limits-and-pruning) | Limits and pruning | Operation | M11 | Built |
| [`undo.prune-order`](undo.md#undoprune-order--which-operations-the-limits-keep) | Which operations the limits keep | Derivation | M11 | Built |
| [`undo.writes-of`](undo.md#undowrites-of--datardos-writes-to-one-document) | Datardo's writes to one document | Derivation | M11 | Built |
| [`undo.per-connection`](undo.md#undoper-connection--stop-or-keep-the-undo-history-of-a-connection) | Stop or keep the undo history of a connection | Operation | M11 | Built |
| [`undo.forget-connection`](undo.md#undoforget-connection--removing-a-connection-deletes-its-operations) | Removing a connection deletes its operations | Operation | M11 | Built |

## Users and roles

| Feature | Title | Kind | Milestone | Status |
| --- | --- | --- | --- | --- |
| [`user.show`](user.md#usershow--the-users-and-roles-page) | The Users and roles page | View | M32 | Specified |
| [`user.list`](user.md#userlist--the-users-of-a-database-or-of-all-databases) | The users of a database or of all databases | Read | M32 | Specified |
| [`user.list-roles`](user.md#userlist-roles--the-roles-of-a-database-or-of-all-databases) | The roles of a database or of all databases | Read | M32 | Specified |
| [`user.signed-in`](user.md#usersigned-in--who-the-connection-is-signed-in-as) | Who the connection is signed in as | Read | M32 | Specified |
| [`user.inspect`](user.md#userinspect--a-user-or-a-role-in-the-inspector) | A user or a role in the inspector | View | M32 | Specified |
| [`user.create`](user.md#usercreate--create-a-user) | Create a user | Operation | M32 | Specified |
| [`user.change-password`](user.md#userchange-password--change-the-password-of-a-user) | Change the password of a user | Operation | M32 | Specified |
| [`user.grant-role`](user.md#usergrant-role--grant-a-role-to-a-user) | Grant a role to a user | Operation | M32 | Specified |
| [`user.revoke-role`](user.md#userrevoke-role--revoke-a-role-from-a-user) | Revoke a role from a user | Operation | M32 | Specified |
| [`user.delete`](user.md#userdelete--delete-a-user) | Delete a user | Operation | M32 | Specified |
| [`user.create-role`](user.md#usercreate-role--create-a-custom-role) | Create a custom role | Operation | M32 | Specified |
| [`user.edit-role`](user.md#useredit-role--edit-a-custom-role) | Edit a custom role | Operation | M32 | Specified |
| [`user.delete-role`](user.md#userdelete-role--delete-a-custom-role) | Delete a custom role | Operation | M32 | Specified |
| [`user.role-reference`](user.md#userrole-reference--how-a-role-is-written-suggested-and-sent) | How a role is written, suggested and sent | Derivation | M32 | Specified |
| [`user.privilege-summary`](user.md#userprivilege-summary--the-privileges-of-a-role-in-short) | The privileges of a role in short | Derivation | M32 | Specified |
| [`user.generate-password`](user.md#usergenerate-password--a-random-password) | A random password | Derivation | M32 | Specified |

## Values

| Feature | Title | Kind | Milestone | Status |
| --- | --- | --- | --- | --- |
| [`value.show`](value.md#valueshow--the-value-of-a-key) | The value of a key | View | M14 | Built |
| [`value.format`](value.md#valueformat--how-bytes-are-shown) | How bytes are shown | Derivation | M14 | Built |
| [`value.quote`](value.md#valuequote--bytes-as-an-argument-of-a-command) | Bytes as an argument of a command | Derivation | M14 | Built |
| [`value.typed-bytes`](value.md#valuetyped-bytes--from-what-is-typed-to-the-bytes-saved) | From what is typed to the bytes saved | Derivation | M14 | Built |
| [`value.item-editor`](value.md#valueitem-editor--edit-an-item-in-its-cell) | Edit an item in its cell | View | M14 | Built |
| [`value.check`](value.md#valuecheck--check-that-the-key-is-still-what-the-view-shows) | Check that the key is still what the view shows | Read | M14 | Built |
| [`value.count`](value.md#valuecount--how-many-items-a-value-has) | How many items a value has | Read | M14 | Built |
| [`value.read-string`](value.md#valueread-string--read-a-string) | Read a string | Read | M14 | Built |
| [`value.save-string`](value.md#valuesave-string--save-a-string) | Save a string | Operation | M14 | Built |
| [`value.read-hash`](value.md#valueread-hash--read-the-fields-of-a-hash) | Read the fields of a hash | Read | M14 | Built |
| [`value.add-field`](value.md#valueadd-field--add-a-field-to-a-hash) | Add a field to a hash | Operation | M14 | Built |
| [`value.edit-field`](value.md#valueedit-field--change-the-value-of-a-field) | Change the value of a field | Operation | M14 | Built |
| [`value.rename-field`](value.md#valuerename-field--rename-a-field-of-a-hash) | Rename a field of a hash | Operation | M14 | Built |
| [`value.remove-fields`](value.md#valueremove-fields--remove-fields-from-a-hash) | Remove fields from a hash | Operation | M14 | Built |
| [`value.read-list`](value.md#valueread-list--read-the-elements-of-a-list) | Read the elements of a list | Read | M15 | Built |
| [`value.push-element`](value.md#valuepush-element--push-an-element-to-a-list) | Push an element to a list | Operation | M15 | Built |
| [`value.edit-element`](value.md#valueedit-element--change-an-element-of-a-list) | Change an element of a list | Operation | M15 | Built |
| [`value.remove-elements`](value.md#valueremove-elements--remove-elements-from-a-list) | Remove elements from a list | Operation | M15 | Built |
| [`value.trim-list`](value.md#valuetrim-list--trim-a-list) | Trim a list | Operation | M15 | Built |
| [`value.read-set`](value.md#valueread-set--read-the-members-of-a-set) | Read the members of a set | Read | M15 | Built |
| [`value.add-member`](value.md#valueadd-member--add-a-member-to-a-set) | Add a member to a set | Operation | M15 | Built |
| [`value.remove-members`](value.md#valueremove-members--remove-members-from-a-set) | Remove members from a set | Operation | M15 | Built |
| [`value.read-sorted-set`](value.md#valueread-sorted-set--read-the-members-of-a-sorted-set) | Read the members of a sorted set | Read | M15 | Built |
| [`value.add-scored-member`](value.md#valueadd-scored-member--add-a-member-to-a-sorted-set) | Add a member to a sorted set | Operation | M15 | Built |
| [`value.change-score`](value.md#valuechange-score--change-the-score-of-a-member) | Change the score of a member | Operation | M15 | Built |
| [`value.remove-scored-members`](value.md#valueremove-scored-members--remove-members-from-a-sorted-set) | Remove members from a sorted set | Operation | M15 | Built |
| [`value.read-stream`](value.md#valueread-stream--read-the-entries-of-a-stream) | Read the entries of a stream | Read | M15 | Built |
| [`value.add-entry`](value.md#valueadd-entry--add-an-entry-to-a-stream) | Add an entry to a stream | Operation | M15 | Built |
| [`value.delete-entries`](value.md#valuedelete-entries--delete-entries-from-a-stream) | Delete entries from a stream | Operation | M15 | Built |
| [`value.trim-stream`](value.md#valuetrim-stream--trim-a-stream) | Trim a stream | Operation | M15 | Built |
| [`value.stream-groups`](value.md#valuestream-groups--consumer-groups-of-a-stream) | Consumer groups of a stream | View | M15 | Built |
| [`value.copy`](value.md#valuecopy--copy-a-value-or-a-part-of-it) | Copy a value or a part of it | Operation | M14 | Built |
| [`value.refresh`](value.md#valuerefresh--refresh-a-value) | Refresh a value | Operation | M14 | Built |

## Watch changes

| Feature | Title | Kind | Milestone | Status |
| --- | --- | --- | --- | --- |
| [`watch.show`](watch.md#watchshow--the-watch-changes-page) | The Watch changes page | View | M27 | Built |
| [`watch.stream`](watch.md#watchstream--open-the-change-stream) | Open the change stream | Read | M27 | Built |
| [`watch.pipeline`](watch.md#watchpipeline--the-filter-the-server-applies) | The filter the server applies | Derivation | M27 | Built |
| [`watch.event-summary`](watch.md#watchevent-summary--the-line-of-a-change-event) | The line of a change event | Derivation | M27 | Built |
| [`watch.visible-events`](watch.md#watchvisible-events--the-change-events-the-list-shows) | The change events the list shows | Derivation | M27 | Built |
| [`watch.pause`](watch.md#watchpause--pause-and-resume-the-list) | Pause and resume the list | Operation | M27 | Built |
| [`watch.stop`](watch.md#watchstop--stop-and-start-the-stream) | Stop and start the stream | Operation | M27 | Built |
| [`watch.resume`](watch.md#watchresume--start-again-from-the-last-change-event) | Start again from the last change event | Operation | M27 | Built |
| [`watch.clear`](watch.md#watchclear--clear-the-list) | Clear the list | Operation | M27 | Built |
| [`watch.event-detail`](watch.md#watchevent-detail--a-change-event-in-the-inspector) | A change event in the inspector | View | M27 | Built |
| [`watch.event-diff`](watch.md#watchevent-diff--what-a-change-event-changed) | What a change event changed | Derivation | M27 | Built |
| [`watch.enable-pre-images`](watch.md#watchenable-pre-images--record-pre-images-of-a-collection) | Record pre-images of a collection | Operation | M27 | Built |
| [`watch.copy-events`](watch.md#watchcopy-events--copy-change-events) | Copy change events | Operation | M27 | Built |
| [`watch.export`](watch.md#watchexport--export-the-change-events-to-a-file) | Export the change events to a file | Operation | M27 | Built |

## The window

| Feature | Title | Kind | Milestone | Status |
| --- | --- | --- | --- | --- |
| [`window.frame`](window.md#windowframe--the-frame-on-each-platform) | The frame on each platform | Derivation | M1 | Built |
| [`window.title`](window.md#windowtitle--the-name-of-the-window-for-the-system) | The name of the window for the system | Derivation | M1 | Built |
| [`window.top-bar`](window.md#windowtop-bar--the-top-bar) | The top bar | View | M1 | Built |
| [`window.size`](window.md#windowsize--minimize-maximize-and-restore-the-window) | Minimize, maximize and restore the window | Operation | M1 | Built |
| [`window.remember`](window.md#windowremember--remember-the-size-the-place-and-the-maximized-state) | Remember the size, the place and the maximized state | Operation | M1 | Built |
| [`window.placement`](window.md#windowplacement--where-the-window-opens) | Where the window opens | Derivation | M1 | Built |
| [`window.theme`](window.md#windowtheme--choose-the-theme) | Choose the theme | Operation | M1 | Built |
| [`window.zoom`](window.md#windowzoom--zoom-in-zoom-out-reset-the-zoom) | Zoom in, zoom out, reset the zoom | Operation | M1 | Built |
| [`window.full-screen`](window.md#windowfull-screen--full-screen) | Full screen | Operation | M1 | Built |
| [`window.single-instance`](window.md#windowsingle-instance--one-instance-one-window) | One instance, one window | Operation | M1 | Built |
| [`window.close`](window.md#windowclose--close-the-window) | Close the window | Operation | M1 | Built |
| [`window.tray`](window.md#windowtray--the-tray-icon-and-its-menu) | The tray icon and its menu | View | M1 | Built |
| [`window.quit`](window.md#windowquit--quit-datardo) | Quit Datardo | Operation | M1 | Built |
| [`window.about`](window.md#windowabout--about-datardo) | About Datardo | View | M1 | Built |
| [`window.check-update`](window.md#windowcheck-update--say-when-a-newer-version-exists) | Say when a newer version exists | Read | M3 | Built |
| [`window.open-data-folder`](window.md#windowopen-data-folder--open-the-data-folder) | Open the data folder | Operation | M1 | Built |
| [`window.open-link`](window.md#windowopen-link--open-a-link-in-the-systems-browser) | Open a link in the system's browser | Operation | M1 | Built |
| [`window.app-menu`](window.md#windowapp-menu--the-menu-bar-on-macos) | The menu bar on macOS | View | M1 | Built |
| [`window.recover`](window.md#windowrecover--the-window-process-crashes-or-stops-answering) | The window process crashes or stops answering | View | M1 | Built |
