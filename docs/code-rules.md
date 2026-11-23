# Code rules

The rules Datardo's code follows, numbered so that a review can cite them. Each says where it comes from and how it is
checked: *Enforced* by a command that fails when the rule is broken, or *Review* when only a reader notices. The table
at the end lists what each check enforces; everything else is checked by review.

A change that needs to break a rule changes this page first, in its own commit, with the reason. The commands are in
[testing.md](testing.md); `npm run check` runs every check.

## R1 — Dependencies and layers

- **R1.1** What runs in the product is the packages of `package.json`'s `dependencies`, which are those of
  [D22](decisions.md#d22--dependencies-from-a-list-with-their-licenses-checked). Adding one is a decision recorded
  there, in the same commit. *Source: project choice.* *Enforced: `scripts/check.mjs` compares `dependencies` with the
  list.*
- **R1.2** Every dependency, direct or not, has a license of the allowed list of D22, comes from the npm registry and
  is pinned by `package-lock.json`. The notices of what is bundled are written by `scripts/notices.mjs` and shipped.
  *Source: the SPDX license list; project choice for the list.* *Enforced: license-checker `--onlyAllow`; `npm ci`.*
- **R1.3** Folders import only what the [architecture](architecture.md#who-may-use-whom) allows: `shared` nothing of
  the project; `features` only `shared`; `engines` only `shared`; `storage` only `shared`; `runner` those four; `ui`
  only `features` and `shared`; `preload` only the types of `shared`. *Source: project choice.* *Enforced:
  dependency-cruiser.*
- **R1.4** A driver (`mongodb`, `redis`, `ssh2`) is imported only in `src/engines`; `electron` only in `src/main` and
  `src/preload`; `react`, Radix and CodeMirror only in `src/ui`. *Source: project choice.* *Enforced:
  dependency-cruiser.*
- **R1.5** `src/shared` and `src/features` use no Node API, no DOM and no global of a runtime, so that they run in
  the main process, in the window process and in a test alike. *Source: project choice.* *Enforced: ESLint
  (`no-restricted-globals`, `no-restricted-imports`) on those folders.*

## R2 — Features are functions

- **R2.1** Every card of the catalog is one module, `src/features/<area>/<action>.ts`, whose function carries the
  identifier in its doc comment (`/** Feature: document.delete */`). An Operation exports `plan`, a Read `request` and
  `parse`, a View `view`, a Derivation one function named for its result. The machinery the cards of the runner area describe
  is in `src/runner`, as each of those cards says. *Source: the
  [feature contract](feature-contract.md); ISO/IEC/IEEE 29148 (traceable requirements).* *Enforced:
  `scripts/check.mjs` matches the modules with the cards.*
- **R2.2** A feature changes nothing itself. An Operation returns a plan, and only the runner runs its steps; no
  feature imports an engine, storage or Electron. *Source: the feature contract.* *Enforced: R1.3.*
- **R2.3** Every command the product registers is on the **Commands** line of exactly one card, and every command a
  card lists is registered in `src/features/commands.ts`. A command's identifier is its card's, or
  `area.action:variant`. *Source: ISO/IEC/IEEE 29148; project choice.* *Enforced: `catalog.py --commands`.*
- **R2.4** A change the user can see changes its card in the same commit; a new feature has its card before its
  code. *Source: project choice.* *Review; `catalog.py` checks the identifiers.*

## R3 — Purity and effects

- **R3.1** `src/shared` and `src/features` read no clock, no environment, no randomness and no global mutable state:
  the time is in the context, a seed is an argument. *Source: project choice.* *Enforced: ESLint
  (`no-restricted-syntax` for `Date.now`, `new Date()`, `Math.random`) on those folders.*
- **R3.2** Output that is compared or stored (the Log, files, the text of a plan) is deterministic: maps are iterated
  in a stated order. *Source: project choice.* *Review.*
- **R3.3** The app's state changes only through `reduce(state, event)`. *Source: project choice.* *Review.*

## R4 — Errors, refusals and the Log

- **R4.1** No error the user can cause reaches the window as a stack trace or closes a page: it is a message in the
  product's words, with the server's own text under **Details**. *Source: project choice.* *Review; the UI tests of
  the error states.*
- **R4.2** Every refusal the user can meet has the code `area.action/reason` of the feature that raises it, written
  whole where it is raised: `refuse('document.delete/read-only', …)`. The card lists its codes in **Refuses** as
  `/reason`. Tests check the code, not the message; the Log writes it; the message shows it under **Details**.
  *Source: RFC 9457 (a stable type for each problem); project choice for the form.* *Enforced: `catalog.py
  --sources`.*
- **R4.3** The Log writes each step with the identifier of the feature that planned it, `[document.delete]
  db.orders.deleteOne({ … })`, and each refusal with its code. The runner writes the prefix, not each feature.
  *Source: project choice.* *Enforced: a test of the runner that runs one plan and reads the Log.*
- **R4.4** A step that fails stops its plan; what ran before it stays, and the message says how far the plan went.
  *Source: Power of Ten, rule 7 (check every return value); project choice.* *Enforced: a test of the runner.*
- **R4.5** A failure of something that follows a write does not undo the write: an error while publishing for
  redis-oplog is a warning, shown at most every 30 seconds. *Source: Mongoster's behavior.* *Enforced: a test of the
  runner.*
- **R4.6** Nothing is caught and dropped: a `catch` either handles the error, turns it into a refusal or a message, or
  logs it with why it is safe to go on. *Source: Power of Ten, rule 7.* *Enforced: ESLint (`no-empty`,
  `no-floating-promises`); review.*

## R5 — Writes to a deployment

- **R5.1** Every write reaches a deployment as a step of a plan run by the runner. Nothing else calls a method of an
  engine that writes. *Source: product promises.* *Enforced: dependency-cruiser (only `runner` imports the engines'
  write interface); a test of the runner.*
- **R5.2** The read-only check is made when the plan is about to run, against the connection as it is then, and again
  by the runner's guard for every step. *Source: [D14](decisions.md#d14--read-only-is-a-safeguard-of-datardo-not-a-permission).*
  *Enforced: tests named after each write card with the code `/read-only`; a test of the runner's guard.*
- **R5.3** A plan that cannot be undone says so in its confirmation, whatever the reason: the undo history is off, the
  write is over its limits, or the kind of write is never recorded. *Source: product promise.* *Enforced: a test of
  the runner for each reason.*
- **R5.4** The confirmation shows the steps that will be sent, and counts with the same filter or pattern the steps
  use. *Source: product promise.* *Enforced: a test of the runner.*
- **R5.5** MongoDB values keep their BSON type through every read, edit, copy, comparison, export, backup and restore:
  documents are read without promoting values and cross the bridge as canonical Extended JSON. Redis values keep their
  bytes. *Source: product promise.* *Enforced: unit tests of `src/shared` on every type; an integration test that
  takes one document of every type through each path.*
- **R5.6** The MCP server's tools never write, kill an operation or change a server setting, and those that return
  documents or values are offered only with `datardo.mcp.readData`. *Source:
  [D16](decisions.md#d16--the-mcp-server-is-read-only-local-and-behind-a-token).* *Enforced: a test that lists the
  tools with the setting off, and one that runs every tool against a server whose user can only read.*

## R6 — Size and shape

- **R6.1** A function has at most 60 lines, 4 parameters and 3 levels of nesting; a React component at most 120
  lines. More parameters become a named object; more nesting becomes a named function. *Source: Power of Ten, rule 4
  (60 lines); project choice for the rest.* *Enforced: ESLint (`max-lines-per-function`, `max-params`, `max-depth`).*
- **R6.2** A file has at most 400 lines. *Source: project choice.* *Enforced: ESLint (`max-lines`).*
- **R6.3** A module does the one thing its name says; there is no `utils`, `helpers` or `common`. *Source: project
  choice.* *Review.*
- **R6.4** Values that mean something have a type that says it (`ConnectionId`, `FieldPath`, `RefusalCode`), not a
  bare `string`; a parameter that switches behavior is a named option, not a boolean; a `switch` over a union handles
  every case. *Source: project choice.* *Enforced, partly: ESLint (`switch-exhaustiveness-check`); review.*
- **R6.5** Messages of the bridge are discriminated unions in `src/shared/bridge.ts`. *Source: project choice.*
  *Enforced: the type checker.*

## R7 — Names

- **R7.1** Names are words, not abbreviations; types are nouns, functions verbs, predicates questions (`isView`);
  no negated names. *Source: project choice.* *Review.*
- **R7.2** The words are those of the [glossary](glossary.md), with the name its **In code** column gives, and never
  a word of its **Avoid** column, in the code as in the text of the interface. *Source: the ubiquitous language of
  Domain-Driven Design (Evans, 2003).* *Enforced for the documents: `catalog.py`; review for the code.*

## R8 — Comments and documentation

- **R8.1** Every exported item has a doc comment that says what it is for, from the user's side when it is a feature.
  Comments say why, in full sentences; there is no commented-out code. *Source: project choice.* *Enforced, partly:
  ESLint (`jsdoc/require-jsdoc` on exports); review.*
- **R8.2** A `TODO` names an open question of [decisions.md](decisions.md) or does not exist. *Source: project
  choice.* *Enforced: `scripts/check.mjs`.*
- **R8.3** A change the user can see adds an entry under `## Unreleased` in `CHANGELOG.md`. *Source: Keep a
  Changelog.* *Review; the release job fails without the version's section.*
- **R8.4** Every setting the schema declares is a row of the [settings page](features/settings.md), with its default
  and the cards it changes, and every row is a declared setting. *Source: project choice.* *Enforced: `catalog.py
  --settings resources/settings.schema.json`.*

## R9 — The engines

- **R9.1** What the user types is parsed, never evaluated: mongosh syntax by `src/shared/mongosh`, a Redis command
  line by `src/shared/redis`. Only a playground runs code, the user's own. *Source: product promise.* *Enforced:
  ESLint (`no-eval`, `no-implied-eval`, `no-new-func`); R14.3.*
- **R9.2** Every call to a server has a bound: a time limit, and for what returns many items a page size. The numbers
  are named constants, and the card names them. *Source: Power of Ten, rule 2 (bounded loops); project choice.*
  *Review; the cards' acceptance lines.*
- **R9.3** Redis keys are listed with `SCAN`, never `KEYS`; large values are read a page at a time. *Source: Redis's
  documentation (`KEYS` blocks the server).* *Enforced: a test that fails when `src/engines/redis` sends `KEYS`.*
- **R9.4** The oldest servers are named constants (MongoDB 4.2, Redis 6.2). A feature that needs a newer server asks
  the engine what the server can do, and says so instead of failing. *Source:
  [D11](decisions.md#d11--the-official-drivers-and-the-oldest-servers-they-serve).* *Review; the cards' acceptance
  lines.*

## R10 — User interface

- **R10.1** The text of the interface is the cards', word for word, in sentence case, with `…` on an entry that asks
  something more. It lives in one module per area (`src/features/<area>/text.ts`), not in the components. *Source:
  project choice.* *Review.*
- **R10.2** Colors, radii, spaces and font sizes come from the tokens; a style holds no literal color or size.
  *Source: project choice.* *Enforced: stylelint (`declaration-property-value-disallowed-list` for colors,
  `declaration-strict-value`).*
- **R10.3** Every control that starts a feature (a button, a menu entry, a link, a field that acts when changed)
  carries the identifier `area.action@place` of its card and of where it is, written whole in the code, never built
  from parts: `data-feature="document.delete@row-menu"`. The card lists its places in **Entry points**. Tests find a
  control by its role and accessible name first, and by this identifier when the name repeats or changes. *Source:
  WCAG 2.2, 4.1.2 (Name, Role, Value); Testing Library's query priority; project choice for the form.* *Enforced:
  `catalog.py --sources src`.*
- **R10.4** Everything can be reached and done with the keyboard; focus is always visible; every control has a role
  and an accessible name. *Source: WCAG 2.2, 2.1.1, 2.4.7, 4.1.2.* *Enforced, partly: R10.5; the UI tests that use
  the keyboard only.*
- **R10.5** Every page and dialog passes an automated accessibility check in the UI tests, in the dark and in the
  light theme, against the rules of WCAG 2.2 levels A and AA that the tool covers; a rule disabled on purpose is named
  in the test with why. *Source: WCAG 2.2; axe-core's rule set.* *Enforced: the UI tests (`axe-core`, evaluated in the window: `@axe-core/playwright` opens a second page, which
  Electron refuses).*
- **R10.6** The window process never waits: no synchronous call through the bridge, and nothing that can take long
  runs in it. *Source: product promise.* *Enforced: ESLint forbids `ipcRenderer.sendSync`; review.*
- **R10.7** A component draws what its View function returned and sends intents; it decides nothing about the
  product. *Source: the feature contract.* *Review.*
- **R10.8** A hover, a focus or a press changes colors, never where or how large anything is: a rule of a state
  (`:hover`, `:focus`, `:focus-visible`, `:focus-within`, `:active`, `[data-highlighted]`) sets no property of the
  layout (`display`, sizes, margins, paddings, borders' widths, `font-weight`, `gap`, positions, `transform`), and a
  control shown on hover keeps its place while hidden (`visibility` or `opacity`). A read in progress leaves what was
  shown in place until its answer comes, and says it is working only after 300 ms. *Source: WCAG 2.2, 3.2.1 (On
  Focus); project choice.* *Enforced: a stylelint rule of the repository (`datardo/state-keeps-layout`); the UI test
  `test/ui/polish/steady.spec.ts`, which hovers every control of the main pages and measures every word before and after.*
- **R10.9** The window works from 800 × 600 up: no island, control or text goes past its island or over another, a
  text cut short ends with `…` and says itself whole on hover, and a field of one line shows no scroll bar. *Source:
  project choice.* *Enforced: the UI test `test/ui/polish/fits.spec.ts`, at 800 × 600, 1024 × 700, 1440 × 900 and 1920 × 1080, in
  both themes.*
- **R10.10** Text is at least 4.5:1 against every surface it is drawn on, and the borders of fields and buttons and
  the focus at least 3:1, in both themes; the border of an island, which marks no control, is drawn but not held to
  a ratio. *Source: WCAG 2.2, 1.4.3 and 1.4.11.* *Enforced: a unit test
  that reads the tokens and computes every pair that the styles put together.*

## R11 — Tests

- **R11.1** Every card has at least one test whose name holds its identifier: `describe('document.delete', …)`. A
  test title that starts with the identifier of an area names a card that exists. *Source: ISO/IEC/IEEE 29148
  (verifiable, traceable requirements); project choice for the form.* *Enforced: `catalog.py --tests test`.*
- **R11.2** Each acceptance line of a card has a test: a feature's decisions as a unit test of its function, what
  reaches a server as an integration test against a real one, what is seen as a UI test. *Source: project choice.*
  *Review, at the end of each milestone.*
- **R11.3** `parse` functions are tested on replies recorded from real servers, kept in `test/fixtures`, including
  the awkward ones. *Source: project choice.* *Review.*
- **R11.4** No test mocks a driver. *Source: [D24](decisions.md#d24--tests-against-real-servers-and-the-built-application-driven-through-its-window).*
  *Review.*
- **R11.5** Tests are deterministic: the time and the seed are given, and no test depends on another. A fixed bug
  gets a test that failed before the fix. *Source: common practice.* *Review.*

## R12 — Formatting and lints

- **R12.1** TypeScript with `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`
  and `noFallthroughCasesInSwitch`. No `any`, no non-null assertion without a comment that says why. *Source: the
  TypeScript handbook.* *Enforced: `tsc`; ESLint.*
- **R12.2** ESLint with typescript-eslint's strict type-checked rules; warnings are errors. *Source:
  typescript-eslint.* *Enforced: `npm run lint`.*
- **R12.3** Prettier formats everything: 120 columns, single quotes, semicolons, trailing commas. *Source: project
  choice.* *Enforced: `prettier --check`.*
- **R12.4** Files are UTF-8 with LF line endings. *Source: project choice.* *Enforced: `.gitattributes`,
  `.editorconfig`, Prettier.*

## R13 — Changes and commits

- **R13.1** One commit per piece of work, with its card, its tests and its changelog entry. The message is one
  imperative sentence on what changes for the user, with no prefix. *Source: project choice.* *Review.*
- **R13.2** A commit passes `npm run check`. *Source: project choice.* *Enforced: the CI on every pull request.*
- **R13.3** Committing is done when asked; pushing and publishing are the author's. *Source: project choice.*
  *Review.*

## R14 — Secrets and untrusted input

Each rule answers a threat of [security.md](security.md).

- **R14.1** Connection strings, passwords, keys, passphrases and the MCP access token are kept only in the secret
  storage: never in settings, the connections file, the Log, a plan's steps as shown, a crash report or a file
  written without the user asking for passwords. *Answers T1.* *Enforced: a test that saves a connection and searches
  every file of the data folder and the Log for its password.*
- **R14.2** When the system has no keychain, secrets stay in memory and nothing is written in clear text. *Answers
  T2.* *Enforced: a test of `src/storage` with encryption unavailable.*
- **R14.3** No secret crosses the bridge to the window process: a form receives an empty field, and an empty field
  means "keep the saved one". *Answers T3.* *Enforced: a test of the bridge's messages for the connection form.*
  One exception, and no other: the password of a server user that is being created or changed is typed or generated
  in its dialog, crosses the bridge once in each direction, is shown once with **Copy password**, and is kept
  nowhere after (`user.create`, `user.change-password`; T21;
  [D41](decisions.md#d41--a-new-users-password-passes-through-the-window-once)). *Enforced: a test that the state of
  the window holds no password once the dialog and its notification are closed, and that the Log and the steps
  shown hold `***`.*
- **R14.4** Text and files from outside (deployments' data, imports, connection files, backups, saved query files)
  are parsed with limits on size and depth, and never run. *Answers T5.* *Enforced: R9.1; tests with oversized and
  malformed files.*
- **R14.5** The window shows values from outside as text. No component sets HTML from a value. *Answers T7.*
  *Enforced: ESLint (`react/no-danger`).*
- **R14.6** The window process is sandboxed (`sandbox`, `contextIsolation`, no `nodeIntegration`), has a Content
  Security Policy that allows only the application's own files, cannot navigate or open windows, and a link opens in
  the system's browser only when it is `https`. *Answers T7.* *Enforced: a test of the window's options and of the
  policy; ESLint for the options.*
- **R14.7** The MCP server listens only on `127.0.0.1` and refuses a request without the token, from another host or
  from another origin, or with a body over 1 MB. *Answers T8.* *Enforced: integration tests of the HTTP server.*
- **R14.8** An SSH server's key is confirmed by the user the first time and checked every time after. *Answers T4.*
  *Enforced: an integration test with a changed key.*
- **R14.9** Datardo makes no network call the user did not cause or a setting did not allow. The only call it makes
  by itself is the check for a newer version, which `datardo.window.checkForUpdates` turns off
  (`window.check-update`,
  [D44](decisions.md#d44--datardo-says-when-a-newer-version-exists-and-installs-nothing-by-itself)). *Answers T15.*
  *Enforced: a UI test that counts the requests of a start: one with the setting on, none with it off; review for
  the rest.*

## R15 — Stored data

Each rule serves [data.md](data.md).

- **R15.1** Every file Datardo writes for itself carries a `version`. *Source:
  [D21](decisions.md#d21--every-stored-format-carries-a-version-from-the-first-release).* *Enforced: a test that
  reads every file `src/storage` writes.*
- **R15.2** An older version is migrated by a function with a test that reads a recorded old file; a change to a
  format adds its migration and its recorded file in the same commit. *Source: D21.* *Enforced: the migration
  tests; review.*
- **R15.3** A file of a newer version is never overwritten; a damaged file is kept aside under another name, the user
  is told, and nothing else is deleted because of it. *Source: D21.* *Enforced: tests of `src/storage` with a newer
  and a damaged file of each kind.*
- **R15.4** Files are written atomically: beside, then renamed. *Source: project choice.* *Enforced: only
  `src/storage` writes to the data folder (dependency-cruiser and ESLint's `no-restricted-imports` for `fs`).*
- **R15.5** The names of settings, of stored files and of their fields are not renamed without code that reads the
  old name. *Source: product promise.* *Review.*

## What the checks enforce

`npm run check` runs these in order; the CI runs it on Windows, macOS and Linux.

| Check | Rules |
| --- | --- |
| `tsc --noEmit` | R6.5, R12.1 |
| ESLint | R1.5, R3.1, R4.6, R6.1, R6.2, R6.4 partly, R8.1 partly, R9.1, R10.6, R12.2, R14.5, R14.6 partly, R15.4 partly |
| stylelint | R10.2, R10.8 (`datardo/state-keeps-layout`) |
| Prettier | R12.3, R12.4 |
| dependency-cruiser | R1.3, R1.4, R2.2, R5.1, R15.4 |
| license-checker | R1.2 |
| `scripts/check.mjs` | R1.1, R2.1, R8.2 |
| `python scripts/check_catalog.py docs` (catalog.py with `--sources`, `--tests`, `--commands`, `--settings`, for the cards built) | R2.3, R4.2, R7.2 for the documents, R8.4, R10.3, R11.1 |
| Unit tests (`npm test`) | R4.3 to R4.5, R5.2 to R5.5, R10.10, R14.1 to R14.3, R15.1 to R15.3, and the acceptance lines of the cards |
| Integration tests (`npm run test:integration`) | R5.5, R5.6, R9.3, R14.7, R14.8, and the acceptance lines that reach a server |
| UI tests (`npm run test:ui`) | R10.4 partly, R10.5, R10.8 (`test/ui/polish/steady.spec.ts`), R10.9 (`test/ui/polish/fits.spec.ts`), R14.6, and the acceptance lines that are seen |

The checks start in the first milestone; a rule's check is listed in the [roadmap](roadmap.md) under the milestone
that turns it on.
