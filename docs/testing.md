# Testing

How Datardo is tested, where the tests live, and how the acceptance lines of a card become tests. The rules are R11
of [code-rules.md](code-rules.md); the choice of real servers over mocks is
[D24](decisions.md#d24--tests-against-real-servers-and-the-built-application-driven-through-its-window).

## The kinds, from cheapest to most real

| Kind | Tests what | Where | How it runs |
| --- | --- | --- | --- |
| Unit | Every feature's function: what it asks, reads, refuses and plans for a given context; every derivation on its worked examples; every `parse` on recorded replies; `src/shared`; the reducer of the app's state. | `test/unit/<area>/<action>.test.ts` | `npm test` (Vitest), in milliseconds, with no server and no window |
| Runner | The runner with an engine that records what it is sent: the order around a write, the guard, the confirmation's content, stopping at a failing step, the Log. | `test/unit/runner/` | `npm test` |
| Storage | Every stored file: written, read back, an older version migrated, a newer one left alone, a damaged one kept aside. | `test/unit/storage/`, with recorded files in `test/fixtures/stored/` | `npm test`, in a temporary folder |
| Integration | Requests and steps against real servers: that a plan's steps do what the card says to a real collection or key, the undo history end to end, backups read by `mongorestore`'s format, the MCP server over HTTP, the SSH tunnel. | `test/integration/<area>/` | `npm run test:integration` |
| UI | The built application driven through its window: that a control with its `data-feature` starts its feature, what a page shows in each state, the keyboard alone, and axe-core on every page in both themes. | `test/ui/<area>/` | `npm run test:ui` (Playwright, with Electron) |

A test's name starts with the identifier of the card it checks: `describe('document.delete', () => { it('refuses on a
read-only connection', …) })`. `catalog.py --tests test` reports a card with no test and a test whose card is gone.

## Throwaway servers

- **MongoDB**: `test/integration/servers.ts` starts a standalone `mongod` and a single-node replica set (for
  sessions, transactions, change streams and the oplog) with `mongodb-memory-server`. It downloads MongoDB the first
  time; `MONGOMS_SYSTEM_BINARY` points it at an installed one instead.
- **Redis**: the same file starts `redis-server` on a free port with no persistence, from `DATARDO_TEST_REDIS_BINARY`
  when set, else from the `PATH`. On Windows, where Redis has no build of its own, set `DATARDO_TEST_REDIS_URL` to a
  server that may be emptied (Redis in WSL or in Docker, or Memurai): the tests use databases 14 and 15 of it and
  flush only those. With neither, the Redis integration tests are skipped and say so in their summary; the CI never
  skips them.
- **A second Redis with an ACL user, TLS and a password**, for the connection tests, is started the same way with a
  configuration of `test/fixtures/redis/`.
- **SSH**: an `ssh2` server started in the test, with a key of `test/fixtures/ssh/`, in front of the throwaway
  servers.
- **Search indexes** need a server with search and are skipped unless `DATARDO_TEST_SEARCH_URI` gives one; they work
  in a database of their own, which they drop.
- Each test file uses a database (or a key prefix) named after itself and drops it at the end, so files run in
  parallel.

## Determinism

- The time is `context.now`, given by the test; no feature reads the clock (R3.1).
- Generated values (test documents) take a seed.
- UI tests run at a fixed window size (1440 × 900), with the bundled fonts, animations off, and the data folder of
  `DATARDO_DATA` in a temporary folder. Screenshots are compared only for the shell's layout, in both themes.
- Recorded replies of servers (`test/fixtures/replies/`) say in their name the server version they came from.

## From a card to a test

Each card ends with acceptance lines. A line becomes a test of the cheapest kind that can check it:

- what a feature asks, refuses or plans: a unit test of its function, comparing the plan's steps as
  `runner.step-text` writes them with the card's **Plan**;
- what ends up in a deployment: an integration test that runs the plan with the real runner and reads the server
  after;
- what is seen: a UI test.

A refusal is tested by its code, never by its message. A milestone is done when every acceptance line of its cards
has a test and the tests pass ([roadmap](roadmap.md)).

## Special suites

- **Types survive** (R5.5): one document with a value of every BSON type is taken through each path that reads and
  writes (the cell editor, the document tab, copy as and paste, export and import in each format, copy to another
  collection, backup and restore, the comparison, undo) and compared type by type. One key of every Redis type with
  bytes that are not text is taken through edit, copy, export and import, and undo.
- **Read-only** (R5.2): a table lists every Operation card that writes to a deployment; one test per card runs it on a
  read-only connection and checks the code `/read-only` and that the server received nothing. The table is built from
  the catalog, so a new write card without its test fails.
- **mongosh syntax**: `query.parse` and `query.format` are tested against each other (what one writes the other
  reads back to the same value) on generated values of every type, with a seed.
- **mongodump's formats**: archives and folders written by Datardo are read by the recorded behavior of
  `mongorestore`, and files recorded from `mongodump` of several versions are read by Datardo.
- **Performance**: the scenarios of [quality.md](quality.md), run on the CI's reference machine by `npm run
  test:performance`, not on every commit.

## What a change runs before it is committed

```bash
npm run check              # types, lint, styles, format, layers, licenses, the catalog, unit tests
npm run test:integration   # when it touches an engine, the runner, storage or the MCP server
npm run test:ui            # when it touches the window
```

`npm run check` includes `python scripts/check_catalog.py docs`, which runs `catalog.py docs --sources src --tests
test --commands` (`src/features/commands.ts` and the `commands.ts` of each area) `--settings
resources/settings.schema.json` and leaves out what the cards not yet *Built* in the index would require: a card's
elements, codes, test and commands are required from the end of its milestone. The CI runs all three on Windows, macOS
and Linux for every pull request.

## What no test reaches

Checked by hand before a release, on each system, in the dark and in the light theme:

- the installer: a first install, an install over the previous version with its data folder kept, an uninstall;
- the frame: dragging, snapping, maximizing, full screen, several monitors with different scaling, the window coming
  back on screen after a monitor is removed;
- a screen reader (NVDA on Windows, VoiceOver on macOS) through the first run, adding a connection, running a query
  and deleting a document; the automated check finds missing names and poor contrast, not whether the order makes
  sense;
- a system without a keychain (a Linux session without a secret service): Datardo says so and writes no secret;
- the tray, and a scheduled task that runs while the window is closed;
- the MCP server from one real client, with `datardo.mcp.readData` on and off;
- a connection through a real bastion, and one to Atlas.
