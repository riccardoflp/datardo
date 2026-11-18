# Risks and debt

What is known to be weak or uncertain in Datardo before its first line of code. *Source: arc42 §11.* A **risk** may go
wrong; **debt** is already wrong and costs on every change. There is no debt yet, since there is no code: the rows
below are risks, and a row is removed in the commit that settles it. The [roadmap](roadmap.md) says when each is dealt
with.

*How likely* is a judgment: *likely*, *possible*, *unlikely*.

## The size of the work

| | What | If it bites | How likely | What we do |
| --- | --- | --- | --- | --- |
| RS1 | The catalog has several hundred cards. Reaching what Mongoster does takes many milestones, and the product is of little use until the collection tab and the writes to documents are there. | The work stops before Datardo can replace Mongoster. | possible | The roadmap orders the milestones so that each ends with something usable alone: connections and browsing first, then writing documents, then Redis, then the rest by how often it is used. |
| RS2 | The cards were written by several authors at once, each on its areas. `catalog.py` checks identifiers, not meanings: two cards may disagree on a detail. | A feature is built to a card that another card contradicts. | likely, a few times | The cards of a milestone are read together before its code starts, and marked *Reviewed* in the index; a contradiction becomes an open question. |
| RS3 | Porting Mongoster's code brings its shape along: host classes that decide and call the platform in one place. | The feature contract is kept in name only. | possible | Only pure code is ported; the layers are checked (R1.3, R2.2); a feature is reviewed against its card, not against Mongoster. |
| RS4 | Mongoster's own known weaknesses come along with the port: an unreadable index that empties the undo history, tasks lost to a damaged file, a write through a tab opened before the connection became read-only, types lost by export and by duplicate, confirmations that do not say a write cannot be undone, secrets reaching the form, values reaching the AI with the setting off. | The same faults, again. | possible | Datardo's cards state the wanted behavior for each, and rules R5.2, R5.3, R5.5, R5.6, R14.1 to R14.3 and R15.3 have tests that fail on the old behavior. |
| RS5 | The numbers that are Datardo's own (scan sizes, page sizes, caps, intervals) were chosen without measuring. | A page that is slow, or that loads a server more than it should. | likely, for some | They are named constants, listed in [features/settings.md](features/settings.md#numbers-that-are-datardos-own), and tuned by the performance suite before the first release. |

## The platform

| | What | If it bites | How likely | What we do |
| --- | --- | --- | --- | --- |
| RS6 | Electron: an installer of about 100 MB and a few hundred MB of memory, where the sibling applications are native. | Datardo feels heavy beside them. | likely | Accepted ([D1](decisions.md#d1--a-desktop-application-of-its-own-on-electron)); the start time and the window's responsiveness are scenarios of [quality.md](quality.md). |
| RS7 | The frame is drawn by Datardo, differently on each system: window managers on Linux, several monitors with different scaling, the system's buttons over the top bar on Windows. | A window that cannot be moved, snapped or brought back on screen. | possible | The frame is the first thing built (M1), is tested on the three systems by the CI, and is on the manual checklist of every release. |
| RS8 | The installers are not signed ([D45](decisions.md#d45--the-installers-are-not-signed)). | Windows SmartScreen and macOS Gatekeeper warn at the first start, and some users stop there; updating in place is not possible; an altered installer is told from the real one only by its checksum. | certain, accepted | The page of each release says how to open Datardo and gives the SHA-256 of every installer; Datardo says when a newer version exists (D44). Signing is a new decision when users ask for it. |
| RS9 | A Linux session without a secret service gives no key to encrypt secrets. | Secrets are asked again at every start ([D26](decisions.md#d26--secrets-are-encrypted-with-a-key-of-the-systems-keychain-or-not-kept)). | possible | Said plainly in the window; never clear text. |
| RS10 | `ssh2` has an optional native part, and the drivers have optional native add-ons. | A package that builds on one system and fails on another. | possible | The optional native parts are left out of the bundle; the CI packages and starts the application on the three systems from M0. |
| RS11 | An accessible table that draws only the rows on screen, and an accessible custom frame, are hard to get right; the automated check finds part of the problems. | A product that passes its check and still cannot be used with a screen reader. | possible | Roles and keyboard movement of the table are part of its cards; a screen reader is on the manual checklist. |

## The engines

| | What | If it bites | How likely | What we do |
| --- | --- | --- | --- | --- |
| RS12 | No Redis Cluster and no Sentinel in the first release ([D12](decisions.md#d12--redis-in-the-first-release-one-server)). | Many production Redis deployments cannot be opened. | certain | Refused with a clear message; [Q6](decisions.md#open-questions) orders the work after the first release. The engine's interface is written so that a cluster is another way to connect, not another engine. |
| RS13 | Recording a Redis write keeps each key with `DUMP`, which is costly for a very large key and blocks the server while it runs. | An edit of one field of a huge hash stalls the server. | possible | The size is read first (`MEMORY USAGE`); a key over the limit of the undo history is not kept, and the confirmation says the write cannot be undone. |
| RS14 | Redis has no build for Windows: the integration tests need a server in WSL, in Docker, or Memurai. | They are skipped on a developer's Windows machine, and a fault is found only by the CI. | likely | The CI never skips them; the skip is said in the test summary. |
| RS15 | Servers that speak Redis's protocol without being Redis (Valkey, KeyDB, Dragonfly, managed services that rename or forbid commands). | A page fails on a command the server lacks. | possible | Each card says what is shown when a command is refused; the engine asks the server what it can do once, when connecting. |
| RS16 | Autocomplete and coloring of mongosh syntax and of Redis commands are written for CodeMirror, where Mongoster's desktop app had Monaco's. | More work than a port, and a poorer editor at first. | possible | Mongoster's own tokenizer and completion (its `src/shared`) are pure and are ported; the editor only binds them. |
| RS17 | A playground runs the user's code, which may loop for ever or use all the memory. | Datardo stops answering. | possible | A playground runs in a process of its own, which **Stop** ends; never in the main process. |

## Security and privacy

| | What | If it bites | How likely | What we do |
| --- | --- | --- | --- | --- |
| RS18 | The undo history and backups hold copies of the user's data, not encrypted, in the user's folders. | Whoever reads the profile reads the data. | unlikely | Said in [security.md](security.md#what-is-not-defended); the undo history has limits of age and size and can be turned off per connection. |
| RS19 | An AI assistant, steered by text inside the data, reads more than the user meant. | Data goes to the assistant's provider. | possible | No tool writes; `datardo.mcp.readData` is the user's choice; every call is in the Log. Accepted beyond that. |
| RS20 | Files read from outside (imports, backups, connection files, saved query files) may be huge or crafted. | Datardo runs out of memory. | unlikely | Limits on size and depth (R14.4), with tests. |

## The documents

| | What | If it bites | How likely | What we do |
| --- | --- | --- | --- | --- |
| RS21 | Open questions that shape a release: which writes publish for redis-oplog (Q4). Updates, signing, the license and the repository were answered (D44 to D46, D48). | A milestone waits for an answer. | likely | Each is named in the roadmap by the milestone that needs it. |
| RS22 | `catalog.py` is a Python script in a Node project. | A contributor without Python cannot run the full check. | unlikely | Python 3.10 is a build requirement ([platform](platform.md#minimum-versions)); the script uses the standard library only. |
