# Roadmap

No milestone is in progress: the next one is [M0](#m0--the-workshop). A milestone is taken by reading its section,
then every card it lists, in order; nothing outside it is built without asking. The
[index of the catalog](features/README.md) shows each card's milestone and status.

The milestones come in three stages. **M0 to M12** make a MongoDB client that browses, queries and edits documents
safely. **M13 to M18** add Redis: keys, values, the console, the server, Pub/Sub. **M19 to M35** bring the rest of
what Mongoster does, by how often it is used. Each milestone ends with something that runs.

In each list of **Features** the cards are in the order to build them: what a card uses inside the milestone comes
before it. A card often names a feature of a later milestone (a menu entry, a button that opens another page): build
the card without that part, and finish it in the milestone that brings the feature; each milestone lists these under
**Not in this milestone**. The lists and the links are written by `python scripts/roadmap.py docs` from the catalog.

## M0 — The workshop

**Goal**: the repository builds, checks and packages an application that starts and shows an empty window, so that
every later milestone only adds features.
**Depends on**: nothing.
**Status**: done

### Beyond the cards

- **Structure**: the folders of [architecture](architecture.md#modules), each with its entry file; `package.json`
  with the dependencies of D22 and no other; the lockfile.
- **Build**: electron-vite for the three bundles (main, bridge, window); electron-builder for the installers;
  `npm run dev` with its data in `./.data` (`DATARDO_DATA`).
- **The window**: one sandboxed window that loads the bundled page and shows the application's name; the bridge
  exposes one typed object with one call, `ping`.
- **Checks**: `npm run check` runs `tsc`, ESLint, stylelint, Prettier, dependency-cruiser, license-checker,
  `scripts/check.mjs`, `python scripts/catalog.py docs` and the unit tests
  ([code rules](code-rules.md#what-the-checks-enforce)).
- **Code rules checked from now**: R1, R6, R7, R8, R12, R13; the others start with the milestone that brings what
  they are about.
- **Tests**: Vitest with one unit test; the throwaway MongoDB and Redis of
  [testing.md](testing.md#throwaway-servers) with one integration test each (connect, ping); Playwright driving the
  built application with one UI test (the window opens, the accessibility check passes).
- **CI**: on Windows, macOS and Linux: `npm ci`, the checks, the three kinds of tests, `npm run package`, and
  starting the packaged application (RS10).
- **Documents**: `CHANGELOG.md`; `"license": "MIT"` in `package.json`, beside the `LICENSE` that is already there; `resources/settings.schema.json` with no setting yet; the notices of the licenses
  written by `scripts/notices.mjs`.
- **Decisions**: relies on D1, D2, D3, D22, D24, D25, D28, D45 (nothing is signed; the macOS build is signed
  ad hoc), D46.
- **Threats**: T15 (no network call of its own) is checked by a UI test that counts the requests of a start.
- **Quality**: QA18 is met.

### Exit criteria

- [x] `npm ci` and `npm run check` pass on a fresh clone, on the three systems.
- [x] `npm run dev` opens the window; `npm run package` writes an installer in `release/`; the installed application
      starts.
- [x] `npm test`, `npm run test:integration` and `npm run test:ui` each run at least one test, and the integration
      tests are not skipped in the CI.
- [x] An import from `src/features` to `src/engines`, and a dependency that D22 does not list, each fail the check:
      tried once by hand and kept as tests of `scripts/check.mjs`.
- [x] `python scripts/catalog.py docs` says *no problems*.

### Not in this milestone

- The frame without the system's title bar, and everything else the user sees: M1.

## M1 — A window of its own

**Goal**: Datardo starts as one window without the system's title bar, with its top bar, its buttons, its theme and
its zoom; it remembers where it was, runs as one instance, can sit in the tray, and quits cleanly.
**Depends on**: [M0](#m0--the-workshop).
**Status**: done

### Features

18 cards, in the order to build them; each card's acceptance lines are this milestone's tests.

1. [`window.title`](features/window.md#windowtitle--the-name-of-the-window-for-the-system) — The name of the window
   for the system. *Derivation.*
2. [`window.placement`](features/window.md#windowplacement--where-the-window-opens) — Where the window opens.
   *Derivation.*
3. [`window.remember`](features/window.md#windowremember--remember-the-size-the-place-and-the-maximized-state) —
   Remember the size, the place and the maximized state. *Operation.*
4. [`window.size`](features/window.md#windowsize--minimize-maximize-and-restore-the-window) — Minimize, maximize and
   restore the window. *Operation.*
5. [`window.theme`](features/window.md#windowtheme--choose-the-theme) — Choose the theme. *Operation.*
6. [`window.zoom`](features/window.md#windowzoom--zoom-in-zoom-out-reset-the-zoom) — Zoom in, zoom out, reset the
   zoom. *Operation.*
7. [`window.quit`](features/window.md#windowquit--quit-datardo) — Quit Datardo. *Operation.*
8. [`window.open-data-folder`](features/window.md#windowopen-data-folder--open-the-data-folder) — Open the data
   folder. *Operation.*
9. [`window.open-link`](features/window.md#windowopen-link--open-a-link-in-the-systems-browser) — Open a link in the
   system's browser. *Operation.*
10. [`window.about`](features/window.md#windowabout--about-datardo) — About Datardo. *View.*
11. [`window.app-menu`](features/window.md#windowapp-menu--the-menu-bar-on-macos) — The menu bar on macOS. *View.*
12. [`window.recover`](features/window.md#windowrecover--the-window-process-crashes-or-stops-answering) — The window
    process crashes or stops answering. *View.*
13. [`window.frame`](features/window.md#windowframe--the-frame-on-each-platform) — The frame on each platform.
    *Derivation.*
14. [`window.full-screen`](features/window.md#windowfull-screen--full-screen) — Full screen. *Operation.*
15. [`window.single-instance`](features/window.md#windowsingle-instance--one-instance-one-window) — One instance, one
    window. *Operation.*
16. [`window.tray`](features/window.md#windowtray--the-tray-icon-and-its-menu) — The tray icon and its menu. *View.*
17. [`window.close`](features/window.md#windowclose--close-the-window) — Close the window. *Operation.*
18. [`window.top-bar`](features/window.md#windowtop-bar--the-top-bar) — The top bar. *View.*

### Beyond the cards

- **Modules**: `src/main` (start, one instance, the window, the tray), `src/preload` (the bridge), `src/ui/shell` (the
  top bar), `src/ui/theme` (the tokens and the two themes), `src/storage` (the versioned store, atomic writes).
- **Code rules checked from now**: R10 (tokens only, roles, the accessibility check), R14.5 and R14.6 (the sandbox,
  the content policy, links), R15.
- **Decisions**: relies on D1, D3, D5, D6, D21, D23, D27; settles Q22; the repository is D48's.
- **Threats**: mitigates T7 and T19.
- **Stored data**: introduces `window.json` at version 1, and the rules of [versions](data.md#versions) for every
  later file.
- **Risks**: RS7 (the frame on three systems) is met here first.

### Exit criteria

- [x] On Windows, macOS and Linux the window can be moved by its top bar, snapped, maximized, restored and brought
      back on screen after a display is removed: the UI tests of `window.frame` and `window.placement`, and the manual
      checklist of [testing.md](testing.md#what-no-test-reaches).
- [x] A damaged `window.json`, and one of a newer version, start Datardo with the default window and delete nothing
      (QA17).
- [x] Every acceptance line of the cards above has a test named after its card, and they pass: `npm run check`,
      `npm run test:integration`, `npm run test:ui`; `catalog.py --tests` reports none missing for these cards.
- [x] Every page and dialog this milestone adds passes the accessibility check in both themes, and can be used from
      the keyboard alone (QA15, QA16).
- [x] The cards above are *Built* in the [index](features/README.md), `CHANGELOG.md` says what the user can now do,
      and this milestone's **Status** is *done*.

### Not in this milestone

- The islands, the rail and the status line: M2.
- Tabs: M4.
- Named by cards above and built in M2: `nav.layout`, `nav.status-line`, `nav.dialog`.
- Named by cards above and built in M3: `runner.confirm`, `runner.progress`, `runner.cancel`, `runner.log`,
  `settings.read`, `settings.page`, `window.check-update`.
- Named by cards above and built in M4: `tab.title`, `tab.close`, `tab.restore`.
- Named by cards above and built in M5: `palette.open`, `palette.commands`.
- Named by cards above and built in M6: `connection.disconnect`.
- Named by cards above and built in M26: `task.show`, `task.tray`.
- Named by cards above and built in M29: `mcp.server`.

## M2 — Islands to get around

**Goal**: The window has its rail, the explorer with the connection island and the tree island, the main island with
the scope bar, the inspector island and the status line; islands are resized, hidden and reached from the keyboard;
dialogs behave in one way.
**Depends on**: M1.
**Status**: done

### Features

21 cards, in the order to build them; each card's acceptance lines are this milestone's tests.

1. [`nav.layout`](features/nav.md#navlayout--how-the-islands-share-the-window) — How the islands share the window.
   *Derivation.*
2. [`nav.toggle-explorer`](features/nav.md#navtoggle-explorer--show-or-hide-the-explorer) — Show or hide the explorer.
   *Operation.*
3. [`nav.pin`](features/nav.md#navpin--pin-unpin-and-reorder-the-items-of-a-connection) — Pin, unpin and reorder the
   items of a connection. *Operation.*
4. [`nav.copy-path`](features/nav.md#navcopy-path--copy-the-path) — Copy the path. *Operation.*
5. [`nav.open-on-another-connection`](features/nav.md#navopen-on-another-connection--open-on-another-connection) —
   Open on another connection. *Operation.*
6. [`nav.rail`](features/nav.md#navrail--the-rail) — The rail. *View.*
7. [`nav.dialog`](features/nav.md#navdialog--how-every-dialog-behaves) — How every dialog behaves. *View.*
8. [`nav.focus-island`](features/nav.md#navfocus-island--move-between-the-islands-with-the-keyboard) — Move between
   the islands with the keyboard. *Derivation.*
9. [`nav.current-connection`](features/nav.md#navcurrent-connection--which-connection-is-current) — Which connection
   is current. *Derivation.*
10. [`nav.switch-connection`](features/nav.md#navswitch-connection--switch-to-another-connection) — Switch to another
    connection. *Operation.*
11. [`nav.back`](features/nav.md#navback--back-and-forward) — Back and Forward. *Operation.*
12. [`nav.linked-connection`](features/nav.md#navlinked-connection--the-linked-connection-row) — The linked connection
    row. *View.*
13. [`nav.path`](features/nav.md#navpath--the-path-of-the-active-tab) — The path of the active tab. *View.*
14. [`nav.scope-bar`](features/nav.md#navscope-bar--the-scope-bar) — The scope bar. *View.*
15. [`nav.empty`](features/nav.md#navempty--the-window-with-no-connection) — The window with no connection. *View.*
16. [`nav.ping`](features/nav.md#navping--the-latency-of-the-current-connection) — The latency of the current
    connection. *Read.*
17. [`nav.connection-island`](features/nav.md#navconnection-island--the-connection-island) — The connection island.
    *View.*
18. [`nav.status-line`](features/nav.md#navstatus-line--the-status-line) — The status line. *View.*
19. [`nav.resize`](features/nav.md#navresize--resize-the-explorer-and-the-inspector-island) — Resize the explorer and
    the inspector island. *Operation.*
20. [`nav.toggle-inspector`](features/nav.md#navtoggle-inspector--show-or-hide-the-inspector-island) — Show or hide
    the inspector island. *Operation.*
21. [`nav.inspector`](features/nav.md#navinspector--the-inspector-island) — The inspector island. *View.*

### Beyond the cards

- **Modules**: `src/ui/shell` (rail, explorer, main island, inspector island, status line, dialogs),
  `src/shared/state` (the app's state and its one reducer).
- **Decisions**: relies on D6.
- **Stored data**: introduces `pins.json` at version 1; `window.json` gains the widths of the islands.
- **Quality**: the keyboard-only test of the shell starts (QA16).

### Exit criteria

- [x] With no connection saved, the window shows the rail, an empty explorer that offers to add a connection
      (`nav.empty`), and every island can be reached with `F6`.
- [x] Every acceptance line of the cards above has a test named after its card, and they pass: `npm run check`,
      `npm run test:integration`, `npm run test:ui`; `catalog.py --tests` reports none missing for these cards.
- [x] Every page and dialog this milestone adds passes the accessibility check in both themes, and can be used from
      the keyboard alone (QA15, QA16).
- [x] The cards above are *Built* in the [index](features/README.md), `CHANGELOG.md` says what the user can now do,
      and this milestone's **Status** is *done*.

### Not in this milestone

- What the islands show for a connection needs connections: M6.
- The tab strip: M4.
- Named by cards above and built in M3: `runner.ask`, `runner.confirm`, `runner.progress`, `runner.cancel`,
  `runner.refuse`, `runner.notify`, `settings.page`.
- Named by cards above and built in M4: `tab.open`, `tab.same-target`, `tab.activate`.
- Named by cards above and built in M5: `home.show`, `palette.sources`.
- Named by cards above and built in M6: `connection.add`, `connection.form`, `connection.connect`, `connection.state`,
  `connection.reconnect`, `connection.overview`, `connection.menu`, `connection.read-only`,
  `connection.allow-changes`.
- Named by cards above and built in M7: `connection.folder-menu`, `connection.link-redis`.
- Named by cards above and built in M8: `tree.show`, `tree.refresh`.
- Named by cards above and built in M9: `query.run`, `query.count`.
- Named by cards above and built in M11: `oplog.publish`, `undo.show`.
- Named by cards above and built in M12: `document.inspect`.
- Named by cards above and built in M13: `key.show`, `key.scan`, `key.inspect`.
- Named by cards above and built in M14: `value.format`.
- Named by cards above and built in M26: `task.show`.
- Named by cards above and built in M34: `search.show`.

## M3 — The runner and the settings

**Goal**: Every feature can now ask, refuse, confirm a plan, run its steps, show work in progress, be cancelled,
notify and write the Log; the settings are read from one schema and changed in their page.
**Depends on**: M2.
**Status**: done

### Features

16 cards, in the order to build them; each card's acceptance lines are this milestone's tests.

1. [`runner.step-text`](features/runner.md#runnerstep-text--how-a-step-is-written) — How a step is written.
   *Derivation.*
2. [`runner.log`](features/runner.md#runnerlog--the-log-page) — The Log page. *View.*
3. [`runner.notify`](features/runner.md#runnernotify--notifications) — Notifications. *View.*
4. [`runner.error`](features/runner.md#runnererror--show-an-error-of-a-server-or-of-the-system) — Show an error of a
   server or of the system. *Derivation.*
5. [`runner.refuse`](features/runner.md#runnerrefuse--show-a-refusal) — Show a refusal. *View.*
6. [`settings.read`](features/settings.md#settingsread--the-value-of-a-setting) — The value of a setting.
   *Derivation.*
7. [`settings.validate`](features/settings.md#settingsvalidate--whether-a-value-can-be-given-to-a-setting) — Whether a
   value can be given to a setting. *Derivation.*
8. [`window.check-update`](features/window.md#windowcheck-update--say-when-a-newer-version-exists) — Say when a newer
   version exists. *Read.*
9. [`runner.run`](features/runner.md#runnerrun--run-a-plan) — Run a plan. *Operation.*
10. [`settings.change`](features/settings.md#settingschange--change-a-setting) — Change a setting. *Operation.*
11. [`runner.ask`](features/runner.md#runnerask--ask-the-questions-of-a-feature) — Ask the questions of a feature.
    *View.*
12. [`runner.confirm`](features/runner.md#runnerconfirm--the-confirmation-of-a-write-with-its-plan) — The confirmation
    of a write, with its plan. *View.*
13. [`settings.reset`](features/settings.md#settingsreset--reset-a-setting-or-all-of-them) — Reset a setting, or all
    of them. *Operation.*
14. [`settings.page`](features/settings.md#settingspage--the-settings-page) — The Settings page. *View.*
15. [`runner.cancel`](features/runner.md#runnercancel--cancel-work-in-progress) — Cancel work in progress.
    *Operation.*
16. [`runner.progress`](features/runner.md#runnerprogress--work-in-progress) — Work in progress. *View.*

### Beyond the cards

- **Modules**: `src/runner` (new), `src/features/runner`, `src/features/settings`, `src/features/commands.ts`,
  `resources/settings.schema.json`.
- **Code rules checked from now**: R2 (a module and a function for each card, a card for each command), R3, R4
  (refusal codes, the Log names the feature), R5 (the guard, the confirmation shows the steps that are sent), R11 for
  the settings.
- **Decisions**: relies on D9, D14, D15, D30, D31, D35, and on D44 for the check for a newer version, which asks the
  repository of D48.
- **Threats**: mitigates T10 and T11, with a plan made of test steps; T1 for the Log and the text of steps
  (`runner.step-text`); T15: the UI test that counts the requests of a start now expects one, the check for a newer
  version, answered by a server of the test, and none with `datardo.window.checkForUpdates` off.
- **Stored data**: introduces `settings.json` at version 1.
- **Quality**: QA5 is met with test plans; the read-only suite of QA1 starts, built from the catalog, and grows with
  every milestone that adds an Operation.

### Exit criteria

- [x] A test feature that returns a question, then a read, then a plan of three steps with danger *destructive* shows
      the dialog, the confirmation with the three steps and the field to type the name, runs them, writes five lines
      in the Log and notifies: one UI test.
- [x] The same plan on a read-only connection sends nothing and shows the refusal (QA1).
- [x] Every acceptance line of the cards above has a test named after its card, and they pass: `npm run check`,
      `npm run test:integration`, `npm run test:ui`; `catalog.py --tests` reports none missing for these cards.
- [x] Every page and dialog this milestone adds passes the accessibility check in both themes, and can be used from
      the keyboard alone (QA15, QA16).
- [x] The cards above are *Built* in the [index](features/README.md), `CHANGELOG.md` says what the user can now do,
      and this milestone's **Status** is *done*.

### Not in this milestone

- Recording what a write changes: M11.
- Publishing for redis-oplog: M11.
- Named by cards above and built in M4: `tab.open`.
- Named by cards above and built in M6: `connection.read-only`.
- Named by cards above and built in M9: `query.format`.
- Named by cards above and built in M11: `oplog.publish`, `undo.record`, `undo.note`, `undo.notification`.

## M4 — Tabs

**Goal**: Pages open in tabs grouped by connection; tabs are made active, closed, reordered, reopened, and come back
at the next start.
**Depends on**: M3.
**Status**: done

### Features

15 cards, in the order to build them; each card's acceptance lines are this milestone's tests.

1. [`tab.title`](features/tab.md#tabtitle--the-title-of-a-tab) — The title of a tab. *Derivation.*
2. [`tab.fit`](features/tab.md#tabfit--how-the-tabs-share-the-strip) — How the tabs share the strip. *Derivation.*
3. [`tab.groups`](features/tab.md#tabgroups--the-groups-of-the-strip) — The groups of the strip. *Derivation.*
4. [`tab.activate`](features/tab.md#tabactivate--make-a-tab-active) — Make a tab active. *Operation.*
5. [`tab.same-target`](features/tab.md#tabsame-target--what-makes-two-tabs-the-same) — What makes two tabs the same.
   *Derivation.*
6. [`tab.restore`](features/tab.md#tabrestore--restore-the-tabs-at-the-next-start) — Restore the tabs at the next
   start. *Operation.*
7. [`tab.open`](features/tab.md#tabopen--open-a-tab) — Open a tab. *Operation.*
8. [`tab.reorder`](features/tab.md#tabreorder--reorder-the-tabs-of-a-group) — Reorder the tabs of a group.
   *Operation.*
9. [`tab.collapse-group`](features/tab.md#tabcollapse-group--collapse-or-expand-a-group) — Collapse or expand a group.
   *Operation.*
10. [`tab.close`](features/tab.md#tabclose--close-a-tab) — Close a tab. *Operation.*
11. [`tab.reopen`](features/tab.md#tabreopen--reopen-the-last-closed-tab) — Reopen the last closed tab. *Operation.*
12. [`tab.close-many`](features/tab.md#tabclose-many--close-the-other-tabs-the-tabs-of-a-connection-or-all) — Close
    the other tabs, the tabs of a connection, or all. *Operation.*
13. [`tab.menu`](features/tab.md#tabmenu--the-context-menu-of-a-tab) — The context menu of a tab. *View.*
14. [`tab.strip`](features/tab.md#tabstrip--the-tab-strip) — The tab strip. *View.*
15. [`tab.connection-gone`](features/tab.md#tabconnection-gone--the-tabs-of-a-connection-that-is-disconnected-or-removed)
    — The tabs of a connection that is disconnected or removed. *View.*

### Beyond the cards

- **Modules**: `src/ui/shell` (the tab strip), `src/shared/state` (tabs and groups).
- **Decisions**: relies on D33; settles Q19.
- **Stored data**: introduces `session.json` at version 1, and the drafts it keeps.

### Exit criteria

- [x] Three page tabs opened, reordered and closed are restored at the next start in the same order, with the same one
      active; with `datardo.tab.restore` off, Datardo starts on Home alone.
- [x] Every acceptance line of the cards above has a test named after its card, and they pass: `npm run check`,
      `npm run test:integration`, `npm run test:ui`; `catalog.py --tests` reports none missing for these cards.
- [x] Every page and dialog this milestone adds passes the accessibility check in both themes, and can be used from
      the keyboard alone (QA15, QA16).
- [x] The cards above are *Built* in the [index](features/README.md), `CHANGELOG.md` says what the user can now do,
      and this milestone's **Status** is *done*.

### Not in this milestone

- The tabs of collections, keys and documents arrive with their areas.
- Named by cards above and built in M5: `home.show`, `palette.open`, `palette.recent`.
- Named by cards above and built in M6: `connection.connect`, `connection.disconnect`, `connection.remove`.
- Named by cards above and built in M8: `tree.show`.
- Named by cards above and built in M9: `query.run`.
- Named by cards above and built in M20: `saved-query.recent`.
- Named by cards above and built in M28: `playground.save`.

## M5 — Go to and Home

**Goal**: `Ctrl+K` finds connections, pages, open tabs and commands and runs them from the keyboard; Home lists the
saved connections by folder and the places used last.
**Depends on**: M4.
**Status**: done

### Features

18 cards, in the order to build them; each card's acceptance lines are this milestone's tests.

1. [`home.address`](features/home.md#homeaddress--the-address-of-a-connection-without-credentials) — The address of a
   connection, without credentials. *Derivation.*
2. [`palette.recent`](features/palette.md#paletterecent--recent-places) — Recent places. *Read.*
3. [`palette.find-collections`](features/palette.md#palettefind-collections--the-names-of-collections-for-go-to) — The
   names of collections for Go to. *Read.*
4. [`home.filter`](features/home.md#homefilter--filter-the-cards-by-text-and-by-engine) — Filter the cards by text and
   by engine. *Derivation.*
5. [`palette.sources`](features/palette.md#palettesources--where-go-to-looks) — Where Go to looks. *Derivation.*
6. [`palette.rank`](features/palette.md#paletterank--how-go-to-ranks-what-it-finds) — How Go to ranks what it finds.
   *Derivation.*
7. [`palette.find-keys`](features/palette.md#palettefind-keys--the-keys-of-the-current-redis-connection-for-go-to) —
   The keys of the current Redis connection for Go to. *Read.*
8. [`palette.commands`](features/palette.md#palettecommands--every-command-with-its-title-and-its-key) — Every
   command, with its title and its key. *Derivation.*
9. [`palette.key-press`](features/palette.md#palettekey-press--which-command-a-key-starts) — Which command a key
   starts. *Derivation.*
10. [`palette.run-command`](features/palette.md#paletterun-command--run-a-command) — Run a command. *Operation.*
11. [`palette.open-result`](features/palette.md#paletteopen-result--open-a-result) — Open a result. *Operation.*
12. [`palette.open`](features/palette.md#paletteopen--open-go-to) — Open Go to. *View.*
13. [`home.forget-recent`](features/home.md#homeforget-recent--remove-a-recent-place) — Remove a recent place.
    *Operation.*
14. [`home.jump-back-in`](features/home.md#homejump-back-in--jump-back-in) — Jump back in. *View.*
15. [`home.show`](features/home.md#homeshow--the-home-page) — The Home page. *View.*
16. [`home.connections`](features/home.md#homeconnections--the-connection-cards-by-folder) — The connection cards, by
    folder. *View.*
17. [`home.card`](features/home.md#homecard--a-connection-card) — A connection card. *View.*
18. [`home.card-menu`](features/home.md#homecard-menu--the-menu-of-a-connection) — The menu of a connection. *View.*

### Beyond the cards

- **Modules**: `src/features/palette`, `src/features/home`, `src/ui/pages/home`.
- **Code rules checked from now**: R2.3 with `catalog.py --commands` (every registered command has a card).
- **Decisions**: relies on D7 (Home at the first start, the last active tab afterwards); settles Q20 (the keys).
- **Quality**: QA14 (the start with 200 connections and 20 tabs) gets its test.

### Exit criteria

- [x] With the pointer unplugged, a command is found by its title in Go to and run, and Home is reached and left: the
      keyboard-only UI test of this milestone.
- [x] Every acceptance line of the cards above has a test named after its card, and they pass: `npm run check`,
      `npm run test:integration`, `npm run test:ui`; `catalog.py --tests` reports none missing for these cards.
- [x] Every page and dialog this milestone adds passes the accessibility check in both themes, and can be used from
      the keyboard alone (QA15, QA16).
- [x] The cards above are *Built* in the [index](features/README.md), `CHANGELOG.md` says what the user can now do,
      and this milestone's **Status** is *done*.

### Not in this milestone

- Go to finds collections, keys and saved queries when their areas are built (M8, M13, M20).
- Named by cards above and built in M6: `connection.add`, `connection.connect`, `connection.state`,
  `connection.reconnect`, `connection.menu`, `connection.secrets`.
- Named by cards above and built in M7: `connection.folder-menu`, `connection.link-redis`.
- Named by cards above and built in M8: `tree.show`, `tree.refresh`.
- Named by cards above and built in M13: `key.show`, `key.scan`, `key.open`.
- Named by cards above and built in M14: `value.format`.
- Named by cards above and built in M28: `playground.open-file`.
- Named by cards above and built in M33: `gridfs.show`.

## M6 — Connect to MongoDB and to Redis

**Goal**: The user adds a connection of either engine in the connection form, tests it, saves it with its secrets in
the secret storage, connects and disconnects, makes it read-only, and sees its Overview.
**Depends on**: M5.
**Status**: done

### Features

20 cards, in the order to build them; each card's acceptance lines are this milestone's tests.

1. [`connection.redis-string`](features/connection.md#connectionredis-string--a-redis-connection-string-read-and-written)
   — A Redis connection string, read and written. *Derivation.*
2. [`connection.string-secrets`](features/connection.md#connectionstring-secrets--the-secrets-in-and-out-of-a-connection-string)
   — The secrets in and out of a connection string. *Derivation.*
3. [`connection.read-form`](features/connection.md#connectionread-form--what-the-form-says-checked) — What the form
   says, checked. *Derivation.*
4. [`connection.tls-in-uri`](features/connection.md#connectiontls-in-uri--tls-settings-in-and-out-of-a-mongodb-connection-string)
   — TLS settings in and out of a MongoDB connection string. *Derivation.*
5. [`connection.test`](features/connection.md#connectiontest--test-the-connection) — Test the connection. *Read.*
6. [`connection.server-info`](features/connection.md#connectionserver-info--what-the-server-is) — What the server is.
   *Read.*
7. [`connection.state`](features/connection.md#connectionstate--the-state-and-latency-of-a-connection) — The state and
   latency of a connection. *Read.*
8. [`connection.add`](features/connection.md#connectionadd--add-a-connection) — Add a connection. *Operation.*
9. [`connection.edit`](features/connection.md#connectionedit--edit-a-connection) — Edit a connection. *Operation.*
10. [`connection.save`](features/connection.md#connectionsave--save-the-connection-form) — Save the connection form.
    *Operation.*
11. [`connection.connect`](features/connection.md#connectionconnect--connect-a-connection) — Connect a connection.
    *Operation.*
12. [`connection.disconnect`](features/connection.md#connectiondisconnect--disconnect) — Disconnect. *Operation.*
13. [`connection.reconnect`](features/connection.md#connectionreconnect--reconnect-after-a-drop) — Reconnect after a
    drop. *Operation.*
14. [`connection.overview`](features/connection.md#connectionoverview--the-overview-page-of-a-connection) — The
    Overview page of a connection. *View.*
15. [`connection.remove`](features/connection.md#connectionremove--remove-a-connection) — Remove a connection.
    *Operation.*
16. [`connection.secrets`](features/connection.md#connectionsecrets--keep-the-secrets-of-a-connection) — Keep the
    secrets of a connection. *Operation.*
17. [`connection.form`](features/connection.md#connectionform--the-connection-form) — The connection form. *View.*
18. [`connection.read-only`](features/connection.md#connectionread-only--make-a-connection-read-only) — Make a
    connection read-only. *Operation.*
19. [`connection.allow-changes`](features/connection.md#connectionallow-changes--allow-changes-through-a-read-only-connection)
    — Allow changes through a read-only connection. *Operation.*
20. [`connection.menu`](features/connection.md#connectionmenu--the-menu-of-a-connection) — The menu of a connection.
    *View.*

### Beyond the cards

- **Modules**: `src/engines` (the Engine interface, `mongodb/`, `redis/`, `transport/` for TLS), `src/storage` (the
  connections and the secret storage), `src/ui/pages/connection`.
- **Code rules checked from now**: R1.3 for the drivers (only `src/engines` imports them), R9, R14.1 to R14.3.
- **Decisions**: relies on D8, D11, D12, D14, D26; settles Q16 and Q17.
- **Threats**: mitigates T1, T2, T3; states T17 in the form.
- **Stored data**: introduces `connections.json` and `secrets.json` at version 1.
- **Quality**: the integration tests start against a throwaway MongoDB and a throwaway Redis
  ([testing.md](testing.md#throwaway-servers)); QA19 is checked from here (no import between engines).
- **Risks**: RS9 (no keychain) and RS12 (a Redis Cluster is refused with its message) are met here.

### Exit criteria

- [x] A MongoDB replica set and a Redis server, each with a password and TLS, are added, tested, saved, connected and
      shown in the Overview; after a restart they connect again without the password being asked.
- [x] The password of a saved connection is in no file of the data folder in clear text, in no message of the bridge
      and in no line of the Log: the test of R14.1.
- [x] A connection made read-only refuses the test write of M3 with `/read-only`.
- [x] Every acceptance line of the cards above has a test named after its card, and they pass: `npm run check`,
      `npm run test:integration`, `npm run test:ui`; `catalog.py --tests` reports none missing for these cards.
- [x] Every page and dialog this milestone adds passes the accessibility check in both themes, and can be used from
      the keyboard alone (QA15, QA16).
- [x] The cards above are *Built* in the [index](features/README.md), `CHANGELOG.md` says what the user can now do,
      and this milestone's **Status** is *done*.

### Not in this milestone

- SSH tunnels, folders, colors, import and export, linking a Redis connection: M7.
- Named by cards above and built in M7: `connection.copy-string`, `connection.duplicate`,
  `connection.ssh-tunnel-target`, `connection.trust-host-key`, `connection.set-color`, `connection.move-to-folder`,
  `connection.link-redis`, `connection.unlink-redis`, `connection.import`, `connection.export`.
- Named by cards above and built in M8: `tree.list-databases`, `tree.list-collections`, `tree.redis-databases`.
- Named by cards above and built in M11: `oplog.publish`, `undo.revert`, `undo.forget-connection`.
- Named by cards above and built in M12: `document.inline-edit`, `document.insert`, `document.delete`,
  `document.update-many`, `document.delete-many`, `document.restore-version`.
- Named by cards above and built in M13: `key.show`, `key.delete`.
- Named by cards above and built in M16: `console.run`.
- Named by cards above and built in M17: `server.show`.
- Named by cards above and built in M20: `saved-query.save`.
- Named by cards above and built in M21: `manage.create-collection`, `manage.drop-collection`, `manage.drop-database`,
  `manage.edit-view`, `manage.edit-validation`.
- Named by cards above and built in M22: `index.create`.
- Named by cards above and built in M25: `backup.restore`, `transfer.import`, `transfer.copy-collection`,
  `transfer.generate`.
- Named by cards above and built in M26: `task.run`.
- Named by cards above and built in M29: `mcp.server`.
- Named by cards above and built in M30: `monitor.show`.
- Named by cards above and built in M35: `structure.apply`.

## M7 — Connections, organized and shared

**Goal**: Connections reach servers through an SSH tunnel, are kept in folders with colors, duplicated, imported from
Mongoster, Compass and lists of connection strings, exported, and a MongoDB connection is linked to a Redis
connection.
**Depends on**: M6.
**Status**: done

### Features

19 cards, in the order to build them; each card's acceptance lines are this milestone's tests.

1. [`connection.ssh-tunnel-target`](features/connection.md#connectionssh-tunnel-target--where-the-ssh-tunnel-leads) —
   Where the SSH tunnel leads. *Derivation.*
2. [`connection.read-list`](features/connection.md#connectionread-list--read-a-list-of-connection-strings) — Read a
   list of connection strings. *Derivation.*
3. [`connection.encryption`](features/connection.md#connectionencryption--encrypt-the-passwords-of-a-file-as-compass-does)
   — Encrypt the passwords of a file as Compass does. *Derivation.*
4. [`connection.color-from-compass`](features/connection.md#connectioncolor-from-compass--the-closest-color-of-a-compass-connection)
   — The closest color of a Compass connection. *Derivation.*
5. [`connection.read-compass`](features/connection.md#connectionread-compass--read-a-mongodb-compass-export) — Read a
   MongoDB Compass export. *Derivation.*
6. [`connection.read-file`](features/connection.md#connectionread-file--read-a-connections-file) — Read a connections
   file. *Derivation.*
7. [`connection.write-file`](features/connection.md#connectionwrite-file--write-a-connections-file) — Write a
   connections file. *Derivation.*
8. [`connection.copy-string`](features/connection.md#connectioncopy-string--copy-the-connection-string) — Copy the
   connection string. *Read.*
9. [`connection.duplicate`](features/connection.md#connectionduplicate--duplicate-a-connection) — Duplicate a
   connection. *Operation.*
10. [`connection.trust-host-key`](features/connection.md#connectiontrust-host-key--confirm-the-host-key-of-an-ssh-server)
    — Confirm the host key of an SSH server. *Operation.*
11. [`connection.set-color`](features/connection.md#connectionset-color--set-the-color-of-a-connection) — Set the
    color of a connection. *Operation.*
12. [`connection.move-to-folder`](features/connection.md#connectionmove-to-folder--move-a-connection-to-a-folder) —
    Move a connection to a folder. *Operation.*
13. [`connection.rename-folder`](features/connection.md#connectionrename-folder--rename-a-folder) — Rename a folder.
    *Operation.*
14. [`connection.remove-folder`](features/connection.md#connectionremove-folder--remove-a-folder-keeping-its-connections)
    — Remove a folder, keeping its connections. *Operation.*
15. [`connection.link-redis`](features/connection.md#connectionlink-redis--link-a-redis-connection-to-a-mongodb-connection)
    — Link a Redis connection to a MongoDB connection. *Operation.*
16. [`connection.unlink-redis`](features/connection.md#connectionunlink-redis--remove-the-link-to-a-redis-connection)
    — Remove the link to a Redis connection. *Operation.*
17. [`connection.import`](features/connection.md#connectionimport--import-connections) — Import connections.
    *Operation.*
18. [`connection.export`](features/connection.md#connectionexport--export-connections) — Export connections.
    *Operation.*
19. [`connection.folder-menu`](features/connection.md#connectionfolder-menu--the-menu-of-a-folder) — The menu of a
    folder. *View.*

### Beyond the cards

- **Modules**: `src/engines/transport` (the SSH tunnel), `src/shared` (the connection files).
- **Code rules checked from now**: R14.4 (files from outside are parsed with limits), R14.8 (the host key).
- **Decisions**: relies on D17, D20; settles Q18.
- **Threats**: mitigates T4, and T5 for connection files.
- **Stored data**: introduces `known-hosts.json` at version 1; `connections.json` gains folders, colors and the link.
- **Risks**: RS10 (the optional native part of `ssh2`) is checked by the packaged application on three systems.

### Exit criteria

- [x] A file exported by Mongoster 0.8.0 with ten connections, two of them with a Redis address for redis-oplog, is
      imported: ten MongoDB connections, and the Redis connections linked to them.
- [x] A connection through a bastion asks to confirm the host key the first time, and refuses to connect when the key
      has changed.
- [x] Every acceptance line of the cards above has a test named after its card, and they pass: `npm run check`,
      `npm run test:integration`, `npm run test:ui`; `catalog.py --tests` reports none missing for these cards.
- [x] Every page and dialog this milestone adds passes the accessibility check in both themes, and can be used from
      the keyboard alone (QA15, QA16).
- [x] The cards above are *Built* in the [index](features/README.md), `CHANGELOG.md` says what the user can now do,
      and this milestone's **Status** is *done*.

### Not in this milestone

- Named by cards above and built in M11: `oplog.publish`.

## M8 — The tree

**Goal**: The tree island shows the databases, collections, views and buckets of a MongoDB connection, the databases
and namespaces of a Redis connection, the pages of the connection and the pins; it is filtered, refreshed and used
from the keyboard.
**Depends on**: M6.
**Status**: done

### Features

18 cards, in the order to build them; each card's acceptance lines are this milestone's tests.

1. [`tree.namespaces`](features/tree.md#treenamespaces--namespaces-from-key-names) — Namespaces from key names.
   *Derivation.*
2. [`tree.match`](features/tree.md#treematch--whether-a-node-matches-the-filter) — Whether a node matches the filter.
   *Derivation.*
3. [`tree.list-databases`](features/tree.md#treelist-databases--list-the-databases) — List the databases. *Read.*
4. [`tree.list-collections`](features/tree.md#treelist-collections--list-the-collections-of-a-database) — List the
   collections of a database. *Read.*
5. [`tree.count`](features/tree.md#treecount--counts-and-sizes-beside-the-nodes) — Counts and sizes beside the nodes.
   *Read.*
6. [`tree.redis-databases`](features/tree.md#treeredis-databases--list-the-redis-databases) — List the Redis
   databases. *Read.*
7. [`tree.scan-namespaces`](features/tree.md#treescan-namespaces--scan-the-keys-of-a-database-for-its-namespaces) —
   Scan the keys of a database for its namespaces. *Read.*
8. [`tree.refresh`](features/tree.md#treerefresh--refresh-the-tree) — Refresh the tree. *Read.*
9. [`tree.pinned`](features/tree.md#treepinned--pinned-items) — Pinned items. *View.*
10. [`tree.pages`](features/tree.md#treepages--pages-of-the-connection) — Pages of the connection. *View.*
11. [`tree.menu-mongodb`](features/tree.md#treemenu-mongodb--the-context-menu-of-a-mongodb-node) — The context menu of
    a MongoDB node. *View.*
12. [`tree.menu-redis`](features/tree.md#treemenu-redis--the-context-menu-of-a-redis-node) — The context menu of a
    Redis node. *View.*
13. [`tree.show`](features/tree.md#treeshow--the-tree-island) — The tree island. *View.*
14. [`tree.mongodb`](features/tree.md#treemongodb--the-mongodb-nodes) — The MongoDB nodes. *View.*
15. [`tree.redis`](features/tree.md#treeredis--the-redis-nodes) — The Redis nodes. *View.*
16. [`tree.filter`](features/tree.md#treefilter--filter-the-tree) — Filter the tree. *View.*
17. [`tree.keyboard`](features/tree.md#treekeyboard--moving-in-the-tree-with-the-keyboard) — Moving in the tree with
    the keyboard. *View.*
18. [`tree.node-states`](features/tree.md#treenode-states--loading-empty-and-failed-nodes) — Loading, empty and failed
    nodes. *View.*

### Beyond the cards

- **Modules**: `src/features/tree`, `src/ui/components` (the tree).
- **Decisions**: settles Q23.
- **Threats**: T13 for the namespaces (`SCAN` only, in bounded runs).

### Exit criteria

- [x] On a Redis database of 5 million keys, expanding it sends `SCAN` calls only and shows namespaces in under 1
      second (QA7, the tree's part).
- [x] A MongoDB connection with 300 collections is filtered by a text and moved through with the arrows.
- [x] Every acceptance line of the cards above has a test named after its card, and they pass: `npm run check`,
      `npm run test:integration`, `npm run test:ui`; `catalog.py --tests` reports none missing for these cards.
- [x] Every page and dialog this milestone adds passes the accessibility check in both themes, and can be used from
      the keyboard alone (QA15, QA16).
- [x] The cards above are *Built* in the [index](features/README.md), `CHANGELOG.md` says what the user can now do,
      and this milestone's **Status** is *done*.

### Not in this milestone

- The entries of the context menus start features that arrive with their areas; an entry is shown only when its
  feature is built.
- Named by cards above and built in M10: `table.show`.
- Named by cards above and built in M12: `document.insert`.
- Named by cards above and built in M13: `key.show`, `key.open`.
- Named by cards above and built in M14: `value.format`.
- Named by cards above and built in M16: `console.show`.
- Named by cards above and built in M17: `server.show`.
- Named by cards above and built in M18: `pubsub.show`.
- Named by cards above and built in M21: `manage.create-collection`, `manage.drop-collection`, `manage.drop-database`,
  `manage.edit-view`, `manage.edit-validation`.
- Named by cards above and built in M22: `index.show`.
- Named by cards above and built in M25: `backup.create`, `backup.restore`, `transfer.export`, `transfer.import`,
  `transfer.copy-collection`, `transfer.generate`.
- Named by cards above and built in M26: `task.show`.
- Named by cards above and built in M27: `watch.show`.
- Named by cards above and built in M28: `playground.open`.
- Named by cards above and built in M30: `advisor.show`, `monitor.show`.
- Named by cards above and built in M32: `user.show`.
- Named by cards above and built in M33: `gridfs.show`.
- Named by cards above and built in M34: `relation.detect`, `relation.diagram`, `search.show`.
- Named by cards above and built in M35: `compare.show`, `structure.show`.

## M9 — Query a collection

**Goal**: A collection tab has its query bar: a filter, a sort, a projection, skip and limit in mongosh syntax, with
colors, autocomplete, the query builder, a count, a time limit and Cancel.
**Depends on**: M8.
**Status**: done

### Features

19 cards, in the order to build them; each card's acceptance lines are this milestone's tests.

1. [`query.highlight`](features/query.md#queryhighlight--the-syntax-colors-of-mongosh-text) — The syntax colors of
   mongosh text. *Derivation.*
2. [`query.mode`](features/query.md#querymode--switch-between-find-and-aggregate) — Switch between Find and Aggregate.
   *Derivation.*
3. [`query.reset`](features/query.md#queryreset--reset-the-query) — Reset the query. *Derivation.*
4. [`query.restore`](features/query.md#queryrestore--the-query-a-tab-remembers) — The query a tab remembers.
   *Derivation.*
5. [`query.parse`](features/query.md#queryparse--read-mongosh-syntax-into-values) — Read mongosh syntax into values.
   *Derivation.*
6. [`query.format`](features/query.md#queryformat--write-values-as-mongosh-syntax) — Write values as mongosh syntax.
   *Derivation.*
7. [`query.builder-filter`](features/query.md#querybuilder-filter--the-filter-of-the-builders-rows) — The filter of
   the builder's rows. *Derivation.*
8. [`query.builder-rows`](features/query.md#querybuilder-rows--the-builders-rows-of-a-filter) — The builder's rows of
   a filter. *Derivation.*
9. [`query.suggestions`](features/query.md#querysuggestions--what-is-suggested-where-the-cursor-is) — What is
   suggested where the cursor is. *Derivation.*
10. [`query.add-condition`](features/query.md#queryadd-condition--add-a-condition-to-the-filter) — Add a condition to
    the filter. *Derivation.*
11. [`query.add-sort`](features/query.md#queryadd-sort--add-a-field-to-the-sort) — Add a field to the sort.
    *Derivation.*
12. [`query.add-projection`](features/query.md#queryadd-projection--add-a-field-to-the-projection) — Add a field to
    the projection. *Derivation.*
13. [`query.run`](features/query.md#queryrun--run-the-query) — Run the query. *Read.*
14. [`query.count`](features/query.md#querycount--count-the-matching-documents) — Count the matching documents.
    *Read.*
15. [`query.field-hints`](features/query.md#queryfield-hints--the-fields-and-frequent-values-of-a-collection) — The
    fields and frequent values of a collection. *Read.*
16. [`query.builder`](features/query.md#querybuilder--the-query-builder) — The query builder. *View.*
17. [`query.autocomplete`](features/query.md#queryautocomplete--suggestions-while-typing) — Suggestions while typing.
    *View.*
18. [`query.drag`](features/query.md#querydrag--drag-a-field-or-a-value-into-the-bar) — Drag a field or a value into
    the bar. *View.*
19. [`query.bar`](features/query.md#querybar--the-query-bar) — The query bar. *View.*

### Beyond the cards

- **Modules**: `src/shared/mongosh` (mongosh syntax read and written, Extended JSON), `src/features/query`,
  `src/ui/components` (the editor, CodeMirror 6).
- **Code rules checked from now**: R9.1 (text is parsed, never evaluated), R9.2 (every call has a time limit and a
  page size).
- **Decisions**: relies on D4, D10, D32; settles Q24.
- **Threats**: T13 for queries.
- **Stored data**: introduces `state/<connection id>.json` at version 1.
- **Quality**: QA8 for queries; RS16 (the editor's completion) is met here.

### Exit criteria

- [x] Every value `query.format` writes is read back by `query.parse` with the same BSON type: the round-trip test
      over every type (QA2, its first part).
- [x] A query on a server made slow stops after the time limit and says so (QA8).
- [x] Every acceptance line of the cards above has a test named after its card, and they pass: `npm run check`,
      `npm run test:integration`, `npm run test:ui`; `catalog.py --tests` reports none missing for these cards.
- [x] Every page and dialog this milestone adds passes the accessibility check in both themes, and can be used from
      the keyboard alone (QA15, QA16).
- [x] The cards above are *Built* in the [index](features/README.md), `CHANGELOG.md` says what the user can now do,
      and this milestone's **Status** is *done*.

### Not in this milestone

- The table that shows the documents: M10.
- Aggregate: M19.
- Named by cards above and built in M10: `table.show`, `table.columns`, `table.arrange-columns`, `table.paging`,
  `table.page-window`.
- Named by cards above and built in M19: `aggregate.show`, `aggregate.run`.
- Named by cards above and built in M20: `saved-query.recent`.
- Named by cards above and built in M23: `schema.analyze`.

## M10 — The table of documents

**Goal**: The documents of a query are shown in a table that draws only the rows on screen: every BSON type in its
cell, nested fields and arrays expanded into columns and sub-rows, the columns' layout, the selection, copying in
several formats, paging.
**Depends on**: M9.
**Status**: done

### Features

23 cards, in the order to build them; each card's acceptance lines are this milestone's tests.

1. [`table.cell-text`](features/table.md#tablecell-text--how-a-value-is-written-in-a-cell) — How a value is written in
   a cell. *Derivation.*
2. [`table.sort`](features/table.md#tablesort--sort-from-a-column-header) — Sort from a column header. *Derivation.*
3. [`table.detect-columns`](features/table.md#tabledetect-columns--the-columns-of-a-page-of-documents) — The columns
   of a page of documents. *Derivation.*
4. [`table.copy-path`](features/table.md#tablecopy-path--copy-a-field-path) — Copy a field path. *Operation.*
5. [`table.rows`](features/table.md#tablerows--the-rows-of-the-table) — The rows of the table. *Derivation.*
6. [`table.layout`](features/table.md#tablelayout--the-columns-in-the-order-of-their-layout) — The columns in the
   order of their layout. *Derivation.*
7. [`table.copy-text`](features/table.md#tablecopy-text--the-text-of-each-copy-format) — The text of each copy format.
   *Derivation.*
8. [`table.page-window`](features/table.md#tablepage-window--which-documents-a-page-asks-for) — Which documents a page
   asks for. *Derivation.*
9. [`table.paging`](features/table.md#tablepaging--the-paging-row) — The paging row. *View.*
10. [`table.navigate`](features/table.md#tablenavigate--move-between-cells-with-the-keyboard) — Move between cells
    with the keyboard. *Derivation.*
11. [`table.copy-value`](features/table.md#tablecopy-value--copy-the-value-of-a-cell) — Copy the value of a cell.
    *Operation.*
12. [`table.selection`](features/table.md#tableselection--select-rows) — Select rows. *Derivation.*
13. [`table.refresh`](features/table.md#tablerefresh--refresh-the-documents) — Refresh the documents. *Read.*
14. [`table.copy-as`](features/table.md#tablecopy-as--copy-documents-as-text) — Copy documents as text. *Operation.*
15. [`table.selection-bar`](features/table.md#tableselection-bar--the-selection-bar-of-the-table) — The selection bar
    of the table. *View.*
16. [`table.row-menu`](features/table.md#tablerow-menu--the-context-menu-of-a-row) — The context menu of a row.
    *View.*
17. [`table.expand`](features/table.md#tableexpand--expand-a-field-into-columns-or-sub-rows) — Expand a field into
    columns or sub-rows. *Operation.*
18. [`table.collapse`](features/table.md#tablecollapse--collapse-an-expanded-field) — Collapse an expanded field.
    *Operation.*
19. [`table.cell-menu`](features/table.md#tablecell-menu--the-context-menu-of-a-cell) — The context menu of a cell.
    *View.*
20. [`table.arrange-columns`](features/table.md#tablearrange-columns--hide-show-move-pin-and-resize-columns) — Hide,
    show, move, pin and resize columns. *Operation.*
21. [`table.columns`](features/table.md#tablecolumns--the-columns-layout) — The columns' layout. *View.*
22. [`table.show`](features/table.md#tableshow--the-documents-section) — The Documents section. *View.*
23. [`table.column-menu`](features/table.md#tablecolumn-menu--the-context-menu-of-a-column-header) — The context menu
    of a column header. *View.*

### Beyond the cards

- **Modules**: `src/features/table`, `src/ui/components` (the table), `src/ui/pages/collection`.
- **Decisions**: relies on D32; settles Q25.
- **Quality**: QA6 and QA9 get their tests in the performance suite.
- **Risks**: RS11 (an accessible table that draws only the rows on screen).

### Exit criteria

- [x] A collection of 10 million documents opens with one `find` and one estimated count, its first rows in under 1
      second (QA6).
- [x] A document with a value of every BSON type, copied as mongosh text, is text that `query.parse` reads back with
      every type.
- [x] Every acceptance line of the cards above has a test named after its card, and they pass: `npm run check`,
      `npm run test:integration`, `npm run test:ui`; `catalog.py --tests` reports none missing for these cards.
- [x] Every page and dialog this milestone adds passes the accessibility check in both themes, and can be used from
      the keyboard alone (QA15, QA16).
- [x] The cards above are *Built* in the [index](features/README.md), `CHANGELOG.md` says what the user can now do,
      and this milestone's **Status** is *done*.

### Not in this milestone

- Editing a cell, the inspector, the document tab: M12.
- The column actions: M21.
- Named by cards above and built in M12: `document.inspect`, `document.inline-edit`, `document.open`,
  `document.insert`, `document.delete`, `document.update-many`, `document.delete-many`.
- Named by cards above and built in M19: `aggregate.show`, `aggregate.run`.
- Named by cards above and built in M23: `explain.show`.
- Named by cards above and built in M24: `codegen.show`.
- Named by cards above and built in M25: `transfer.export`.
- Named by cards above and built in M27: `history.show`, `watch.show`.
- Named by cards above and built in M34: `relation.follow`.

## M11 — What every write does: the undo history and redis-oplog

**Goal**: A write to documents or keys is recorded before it runs, listed in the Undo history page, and undone later,
within limits the user sets; a write to MongoDB documents is published to the linked Redis connection for redis-oplog.
**Depends on**: M7, M10.
**Status**: done

### Features

24 cards, in the order to build them; each card's acceptance lines are this milestone's tests.

1. [`undo.clear`](features/undo.md#undoclear--clear-the-undo-history) — Clear the undo history. *Operation.*
2. [`undo.remove`](features/undo.md#undoremove--remove-one-operation) — Remove one operation. *Operation.*
3. [`undo.forget-connection`](features/undo.md#undoforget-connection--removing-a-connection-deletes-its-operations) —
   Removing a connection deletes its operations. *Operation.*
4. [`oplog.scope`](features/oplog.md#oplogscope--which-databases-and-collections-publish) — Which databases and
   collections publish. *Derivation.*
5. [`oplog.message`](features/oplog.md#oplogmessage--the-event-of-a-document-and-its-channels) — The event of a
   document and its channels. *Derivation.*
6. [`oplog.updated-fields`](features/oplog.md#oplogupdated-fields--the-fields-an-update-changes) — The fields an
   update changes. *Derivation.*
7. [`oplog.changes`](features/oplog.md#oplogchanges--the-events-of-a-write-from-the-documents-before-and-after) — The
   events of a write from the documents before and after. *Derivation.*
8. [`undo.kept`](features/undo.md#undokept--which-documents-and-keys-an-operation-keeps) — Which documents and keys an
   operation keeps. *Derivation.*
9. [`undo.note`](features/undo.md#undonote--whether-a-write-can-be-undone-as-its-confirmation-says-it) — Whether a
   write can be undone, as its confirmation says it. *Derivation.*
10. [`undo.changed-since`](features/undo.md#undochanged-since--which-documents-and-keys-changed-since-the-operation) —
    Which documents and keys changed since the operation. *Derivation.*
11. [`undo.revert-plan`](features/undo.md#undorevert-plan--what-undo-does-to-each-document-and-key) — What undo does
    to each document and key. *Derivation.*
12. [`undo.writes-of`](features/undo.md#undowrites-of--datardos-writes-to-one-document) — Datardo's writes to one
    document. *Derivation.*
13. [`undo.details`](features/undo.md#undodetails--what-undoing-an-operation-would-do) — What undoing an operation
    would do. *Read.*
14. [`undo.prune-order`](features/undo.md#undoprune-order--which-operations-the-limits-keep) — Which operations the
    limits keep. *Derivation.*
15. [`undo.limits`](features/undo.md#undolimits--limits-and-pruning) — Limits and pruning. *Operation.*
16. [`oplog.publish`](features/oplog.md#oplogpublish--publish-the-events-of-a-write-to-redis) — Publish the events of
    a write to Redis. *Operation.*
17. [`oplog.playground-writes`](features/oplog.md#oplogplayground-writes--publish-the-playgrounds-writes) — Publish
    the playground's writes. *Operation.*
18. [`oplog.publish-error`](features/oplog.md#oplogpublish-error--the-warning-when-redis-fails) — The warning when
    Redis fails. *View.*
19. [`undo.record`](features/undo.md#undorecord--record-an-operation-before-a-write) — Record an operation before a
    write. *Operation.*
20. [`undo.revert`](features/undo.md#undorevert--undo-an-operation) — Undo an operation. *Operation.*
21. [`undo.last`](features/undo.md#undolast--undo-last-change) — Undo last change. *Operation.*
22. [`undo.per-connection`](features/undo.md#undoper-connection--stop-or-keep-the-undo-history-of-a-connection) — Stop
    or keep the undo history of a connection. *Operation.*
23. [`undo.show`](features/undo.md#undoshow--the-undo-history-page) — The Undo history page. *View.*
24. [`undo.notification`](features/undo.md#undonotification--undo-from-a-writes-notification) — Undo from a write's
    notification. *View.*

### Beyond the cards

- **Modules**: `src/features/undo`, `src/features/oplog`, `src/storage` (the files of the undo history), the hooks of
  `src/runner`.
- **Code rules checked from now**: R5.5 and R5.6.
- **Decisions**: relies on D13, D17, D35; settles Q4 (which writes are not published).
- **Stored data**: introduces `undo/index.json` and the operation files at version 1.
- **Risks**: RS4 for the undo history (an unreadable index deletes nothing) and RS13.
- **Tested with**: plans of test steps on documents and on keys, until the areas that write arrive (M12, M13).

### Exit criteria

- [x] A plan that updates three documents is recorded, undone from its notification and from the page, and the
      documents are equal to what they were, type by type.
- [x] With `undo/index.json` damaged, Datardo starts, says so, keeps the file aside and deletes no operation file
      (QA17).
- [x] A write to documents through a connection linked to a Redis connection publishes the events Meteor's redis-oplog
      expects: an integration test that subscribes.
- [x] Every acceptance line of the cards above has a test named after its card, and they pass: `npm run check`,
      `npm run test:integration`, `npm run test:ui`; `catalog.py --tests` reports none missing for these cards.
- [x] Every page and dialog this milestone adds passes the accessibility check in both themes, and can be used from
      the keyboard alone (QA15, QA16).
- [x] The cards above are *Built* in the [index](features/README.md), `CHANGELOG.md` says what the user can now do,
      and this milestone's **Status** is *done*.

### Not in this milestone

- The writes themselves: documents in M12, keys in M13 to M15.
- Named by cards above and built in M12: `document.inline-edit`, `document.insert`, `document.delete`,
  `document.update-many`, `document.delete-many`, `document.restore-version`.
- Named by cards above and built in M13: `key.delete`.
- Named by cards above and built in M14: `value.format`.
- Named by cards above and built in M18: `pubsub.show`.
- Named by cards above and built in M25: `backup.restore`, `transfer.import`, `transfer.copy-collection`,
  `transfer.generate`.
- Named by cards above and built in M27: `history.show`.
- Named by cards above and built in M28: `playground.run`.
- Named by cards above and built in M29: `mcp.server`.

## M12 — Read and write documents

**Goal**: A document is inspected in the inspector island, opened in a document tab and saved, edited in its cell,
inserted, duplicated, deleted; the selected rows and the documents matching a filter are updated or deleted, each
shown before it runs and undone after.
**Depends on**: M11.
**Status**: done

### Features

19 cards, in the order to build them; each card's acceptance lines are this milestone's tests.

1. [`document.update-many`](features/document.md#documentupdate-many--update-many) — Update many. *Operation.*
2. [`document.update-selected`](features/document.md#documentupdate-selected--update-the-selected-rows) — Update the
   selected rows. *Operation.*
3. [`document.delete-many`](features/document.md#documentdelete-many--delete-many) — Delete many. *Operation.*
4. [`document.keep-numeric-types`](features/document.md#documentkeep-numeric-types--keep-the-numeric-type-of-an-edited-value)
   — Keep the numeric type of an edited value. *Derivation.*
5. [`document.parse-insert-text`](features/document.md#documentparse-insert-text--read-the-documents-of-the-insert-dialog)
   — Read the documents of the insert dialog. *Derivation.*
6. [`document.insert-template`](features/document.md#documentinsert-template--template-of-the-insert-dialog) —
   Template of the insert dialog. *Derivation.*
7. [`document.read`](features/document.md#documentread--read-one-document-with-its-types) — Read one document with its
   types. *Read.*
8. [`document.inline-edit`](features/document.md#documentinline-edit--edit-a-value-in-its-cell) — Edit a value in its
   cell. *Operation.*
9. [`document.delete`](features/document.md#documentdelete--delete-a-document) — Delete a document. *Operation.*
10. [`document.delete-selected`](features/document.md#documentdelete-selected--delete-the-selected-rows) — Delete the
    selected rows. *Operation.*
11. [`document.restore-version`](features/document.md#documentrestore-version--restore-a-version-from-the-document-history)
    — Restore a version from the document history. *Operation.*
12. [`document.copy-value`](features/document.md#documentcopy-value--copy-a-value-from-the-inspector) — Copy a value
    from the inspector. *Operation.*
13. [`document.copy-path`](features/document.md#documentcopy-path--copy-a-field-path-from-the-inspector) — Copy a
    field path from the inspector. *Operation.*
14. [`document.save`](features/document.md#documentsave--save-the-document-of-a-document-tab) — Save the document of a
    document tab. *Operation.*
15. [`document.insert`](features/document.md#documentinsert--insert-documents-from-the-insert-dialog) — Insert
    documents from the insert dialog. *Operation.*
16. [`document.duplicate`](features/document.md#documentduplicate--duplicate-a-document) — Duplicate a document.
    *Operation.*
17. [`document.insert-from-tab`](features/document.md#documentinsert-from-tab--insert-the-new-document-of-a-document-tab)
    — Insert the new document of a document tab. *Operation.*
18. [`document.open`](features/document.md#documentopen--the-document-tab) — The document tab. *View.*
19. [`document.inspect`](features/document.md#documentinspect--the-document-in-the-inspector) — The document in the
    inspector. *View.*

### Beyond the cards

- **Modules**: `src/features/document`, `src/ui/pages/document`.
- **Decisions**: relies on D13, D15, D33, D36, D39; settles Q28.
- **Quality**: QA2 (types survive) for cells, the document tab, copy and paste and undo; QA4.
- **Stage**: at the end of this milestone Datardo is a MongoDB client that browses, queries and edits documents
  safely.

### Exit criteria

- [x] A document with a value of every BSON type is edited in a cell, in a document tab, duplicated, deleted and
      undone, and comes back with every type: the types-survive suite (QA2).
- [x] **Update many** on 50,000 documents says in its confirmation that it cannot be undone, and runs (QA4).
- [x] Every Operation of this milestone is refused on a read-only connection and on a view, with nothing sent (QA1).
- [x] Every acceptance line of the cards above has a test named after its card, and they pass: `npm run check`,
      `npm run test:integration`, `npm run test:ui`; `catalog.py --tests` reports none missing for these cards.
- [x] Every page and dialog this milestone adds passes the accessibility check in both themes, and can be used from
      the keyboard alone (QA15, QA16).
- [x] The cards above are *Built* in the [index](features/README.md), `CHANGELOG.md` says what the user can now do,
      and this milestone's **Status** is *done*.

### Not in this milestone

- Restoring a version needs the document history: `document.restore-version` is built here and reached from M27.
- Named by cards above and built in M27: `history.show`, `history.versions`, `history.diff`.
- Named by cards above and built in M34: `relation.follow`.

## M13 — Redis keys

**Goal**: The keys tab scans a database with a pattern and a type and shows each key with its type, expiry and size;
keys are inspected, created, renamed, copied, given an expiry, deleted one by one, by selection and by pattern,
exported and imported.
**Depends on**: M11.
**Status**: done

### Features

25 cards, in the order to build them; each card's acceptance lines are this milestone's tests.

1. [`key.open`](features/key.md#keyopen--open-a-key-in-a-key-tab) — Open a key in a key tab. *Operation.*
2. [`key.rename`](features/key.md#keyrename--rename-a-key) — Rename a key. *Operation.*
3. [`key.persist`](features/key.md#keypersist--make-a-key-persistent) — Make a key persistent. *Operation.*
4. [`key.delete`](features/key.md#keydelete--delete-a-key) — Delete a key. *Operation.*
5. [`key.pattern`](features/key.md#keypattern--from-what-is-typed-to-a-pattern) — From what is typed to a pattern.
   *Derivation.*
6. [`key.scan`](features/key.md#keyscan--scan-the-keys) — Scan the keys. *Read.*
7. [`key.sort`](features/key.md#keysort--sort-the-loaded-keys) — Sort the loaded keys. *Derivation.*
8. [`key.format-expiry`](features/key.md#keyformat-expiry--the-time-left-and-the-date-of-an-expiry) — The time left
   and the date of an expiry. *Derivation.*
9. [`key.details`](features/key.md#keydetails--expiry-and-size-of-the-rows-on-screen) — Expiry and size of the rows on
   screen. *Read.*
10. [`key.refresh`](features/key.md#keyrefresh--refresh-the-keys-tab) — Refresh the keys tab. *Operation.*
11. [`key.delete-by-pattern`](features/key.md#keydelete-by-pattern--delete-the-keys-matching-a-pattern) — Delete the
    keys matching a pattern. *Operation.*
12. [`key.parse-duration`](features/key.md#keyparse-duration--a-duration-as-the-user-types-it) — A duration as the
    user types it. *Derivation.*
13. [`key.new`](features/key.md#keynew--new-key) — New key. *Operation.*
14. [`key.export-text`](features/key.md#keyexport-text--the-file-of-exported-keys) — The file of exported keys.
    *Derivation.*
15. [`key.import-parse`](features/key.md#keyimport-parse--read-a-file-of-exported-keys) — Read a file of exported
    keys. *Derivation.*
16. [`key.copy`](features/key.md#keycopy--copy-a-key) — Copy a key. *Operation.*
17. [`key.set-expiry`](features/key.md#keyset-expiry--set-the-expiry-of-a-key) — Set the expiry of a key. *Operation.*
18. [`key.delete-selected`](features/key.md#keydelete-selected--delete-the-selected-keys) — Delete the selected keys.
    *Operation.*
19. [`key.copy-name`](features/key.md#keycopy-name--copy-the-name-of-a-key) — Copy the name of a key. *Operation.*
20. [`key.inspect`](features/key.md#keyinspect--a-key-in-the-inspector-island) — A key in the inspector island.
    *View.*
21. [`key.export`](features/key.md#keyexport--export-keys-to-a-file) — Export keys to a file. *Operation.*
22. [`key.import`](features/key.md#keyimport--import-keys-from-a-file) — Import keys from a file. *Operation.*
23. [`key.select`](features/key.md#keyselect--select-keys) — Select keys. *View.*
24. [`key.switch-database`](features/key.md#keyswitch-database--switch-database) — Switch database. *Operation.*
25. [`key.show`](features/key.md#keyshow--the-keys-tab) — The keys tab. *View.*

### Beyond the cards

- **Modules**: `src/shared` (Redis replies and bytes), `src/features/key`, `src/ui/pages/keys`.
- **Code rules checked from now**: R9.3 (`SCAN`, never `KEYS`).
- **Decisions**: relies on D12, D36, D37; settles Q14.
- **Threats**: mitigates T13 for keys.
- **Quality**: QA7; QA3 for copy, export and import, and undo.

### Exit criteria

- [x] A database of 5 million keys opens with `SCAN` alone, its first rows in under 1 second, and the server never
      receives `KEYS` (QA7).
- [x] A key of each type whose bytes are not valid UTF-8 is exported, deleted, imported and equal by `DUMP`, with the
      same expiry to the second (QA3).
- [x] Every acceptance line of the cards above has a test named after its card, and they pass: `npm run check`,
      `npm run test:integration`, `npm run test:ui`; `catalog.py --tests` reports none missing for these cards.
- [x] Every page and dialog this milestone adds passes the accessibility check in both themes, and can be used from
      the keyboard alone (QA15, QA16).
- [x] The cards above are *Built* in the [index](features/README.md), `CHANGELOG.md` says what the user can now do,
      and this milestone's **Status** is *done*.

### Not in this milestone

- Editing values: M14 and M15.
- Named by cards above and built in M14: `value.show`, `value.quote`, `value.typed-bytes`, `value.copy`.
- Named by cards above and built in M17: `server.show`.
- Named by cards above and built in M29: `mcp.server`, `mcp.tab-tools`.

## M14 — Redis values: strings and hashes

**Goal**: A key's value is shown in the inspector island and in a key tab, as text, JSON or hexadecimal without losing
a byte; strings are edited and saved, and the fields of a hash are read a page at a time, added, changed, renamed and
removed.
**Depends on**: M13.
**Status**: done

### Features

16 cards, in the order to build them; each card's acceptance lines are this milestone's tests.

1. [`value.count`](features/value.md#valuecount--how-many-items-a-value-has) — How many items a value has. *Read.*
2. [`value.format`](features/value.md#valueformat--how-bytes-are-shown) — How bytes are shown. *Derivation.*
3. [`value.read-string`](features/value.md#valueread-string--read-a-string) — Read a string. *Read.*
4. [`value.read-hash`](features/value.md#valueread-hash--read-the-fields-of-a-hash) — Read the fields of a hash.
   *Read.*
5. [`value.quote`](features/value.md#valuequote--bytes-as-an-argument-of-a-command) — Bytes as an argument of a
   command. *Derivation.*
6. [`value.copy`](features/value.md#valuecopy--copy-a-value-or-a-part-of-it) — Copy a value or a part of it.
   *Operation.*
7. [`value.typed-bytes`](features/value.md#valuetyped-bytes--from-what-is-typed-to-the-bytes-saved) — From what is
   typed to the bytes saved. *Derivation.*
8. [`value.check`](features/value.md#valuecheck--check-that-the-key-is-still-what-the-view-shows) — Check that the key
   is still what the view shows. *Read.*
9. [`value.save-string`](features/value.md#valuesave-string--save-a-string) — Save a string. *Operation.*
10. [`value.add-field`](features/value.md#valueadd-field--add-a-field-to-a-hash) — Add a field to a hash. *Operation.*
11. [`value.remove-fields`](features/value.md#valueremove-fields--remove-fields-from-a-hash) — Remove fields from a
    hash. *Operation.*
12. [`value.edit-field`](features/value.md#valueedit-field--change-the-value-of-a-field) — Change the value of a
    field. *Operation.*
13. [`value.rename-field`](features/value.md#valuerename-field--rename-a-field-of-a-hash) — Rename a field of a hash.
    *Operation.*
14. [`value.item-editor`](features/value.md#valueitem-editor--edit-an-item-in-its-cell) — Edit an item in its cell.
    *View.*
15. [`value.refresh`](features/value.md#valuerefresh--refresh-a-value) — Refresh a value. *Operation.*
16. [`value.show`](features/value.md#valueshow--the-value-of-a-key) — The value of a key. *View.*

### Beyond the cards

- **Modules**: `src/features/value`, `src/ui/pages/key`.
- **Decisions**: settles Q15.
- **Quality**: QA3 for editing.

### Exit criteria

- [x] A string and a hash whose bytes are not valid UTF-8 are edited in hexadecimal, saved and undone; `DUMP` is equal
      before the edit and after the undo.
- [x] Every acceptance line of the cards above has a test named after its card, and they pass: `npm run check`,
      `npm run test:integration`, `npm run test:ui`; `catalog.py --tests` reports none missing for these cards.
- [x] Every page and dialog this milestone adds passes the accessibility check in both themes, and can be used from
      the keyboard alone (QA15, QA16).
- [x] The cards above are *Built* in the [index](features/README.md), `CHANGELOG.md` says what the user can now do,
      and this milestone's **Status** is *done*.

### Not in this milestone

- Lists, sets, sorted sets and streams: M15.
- Named by cards above and built in M15: `value.read-list`, `value.push-element`, `value.edit-element`,
  `value.remove-elements`, `value.trim-list`, `value.read-set`, `value.add-member`, `value.remove-members`,
  `value.read-sorted-set`, `value.add-scored-member`, `value.change-score`, `value.remove-scored-members`,
  `value.read-stream`, `value.add-entry`, `value.delete-entries`, `value.trim-stream`, `value.stream-groups`.
- Named by cards above and built in M16: `console.show`.

## M15 — Redis values: lists, sets, sorted sets and streams

**Goal**: The other four types are read a page at a time and changed: elements pushed, changed, removed and trimmed;
members added and removed; scores changed; entries added, deleted and trimmed; the consumer groups of a stream shown.
**Depends on**: M14.
**Status**: planned

### Features

17 cards, in the order to build them; each card's acceptance lines are this milestone's tests.

1. [`value.read-list`](features/value.md#valueread-list--read-the-elements-of-a-list) — Read the elements of a list.
   *Read.*
2. [`value.read-set`](features/value.md#valueread-set--read-the-members-of-a-set) — Read the members of a set. *Read.*
3. [`value.read-sorted-set`](features/value.md#valueread-sorted-set--read-the-members-of-a-sorted-set) — Read the
   members of a sorted set. *Read.*
4. [`value.read-stream`](features/value.md#valueread-stream--read-the-entries-of-a-stream) — Read the entries of a
   stream. *Read.*
5. [`value.push-element`](features/value.md#valuepush-element--push-an-element-to-a-list) — Push an element to a list.
   *Operation.*
6. [`value.edit-element`](features/value.md#valueedit-element--change-an-element-of-a-list) — Change an element of a
   list. *Operation.*
7. [`value.remove-elements`](features/value.md#valueremove-elements--remove-elements-from-a-list) — Remove elements
   from a list. *Operation.*
8. [`value.trim-list`](features/value.md#valuetrim-list--trim-a-list) — Trim a list. *Operation.*
9. [`value.add-member`](features/value.md#valueadd-member--add-a-member-to-a-set) — Add a member to a set.
   *Operation.*
10. [`value.remove-members`](features/value.md#valueremove-members--remove-members-from-a-set) — Remove members from a
    set. *Operation.*
11. [`value.add-scored-member`](features/value.md#valueadd-scored-member--add-a-member-to-a-sorted-set) — Add a member
    to a sorted set. *Operation.*
12. [`value.change-score`](features/value.md#valuechange-score--change-the-score-of-a-member) — Change the score of a
    member. *Operation.*
13. [`value.remove-scored-members`](features/value.md#valueremove-scored-members--remove-members-from-a-sorted-set) —
    Remove members from a sorted set. *Operation.*
14. [`value.add-entry`](features/value.md#valueadd-entry--add-an-entry-to-a-stream) — Add an entry to a stream.
    *Operation.*
15. [`value.delete-entries`](features/value.md#valuedelete-entries--delete-entries-from-a-stream) — Delete entries
    from a stream. *Operation.*
16. [`value.trim-stream`](features/value.md#valuetrim-stream--trim-a-stream) — Trim a stream. *Operation.*
17. [`value.stream-groups`](features/value.md#valuestream-groups--consumer-groups-of-a-stream) — Consumer groups of a
    stream. *View.*

### Beyond the cards

- **Modules**: `src/features/value`.
- **Stage**: at the end of this milestone Datardo browses and edits both engines.

### Exit criteria

- [ ] Each Operation of this milestone runs on a key of 100,000 items without reading the whole value, is undone, and
      is refused on a read-only connection (QA1, QA3).
- [ ] Every acceptance line of the cards above has a test named after its card, and they pass: `npm run check`,
      `npm run test:integration`, `npm run test:ui`; `catalog.py --tests` reports none missing for these cards.
- [ ] Every page and dialog this milestone adds passes the accessibility check in both themes, and can be used from
      the keyboard alone (QA15, QA16).
- [ ] The cards above are *Built* in the [index](features/README.md), `CHANGELOG.md` says what the user can now do,
      and this milestone's **Status** is *done*.

### Not in this milestone

- Values of module types are listed and not shown (Q6).
- Named by cards above and built in M16: `console.show`.

## M16 — The Redis console

**Goal**: A console tab runs commands on a connection of its own, shows each reply by its type, completes commands and
hints their arguments, remembers the commands, refuses what a read-only connection must not send and confirms what
loses data.
**Depends on**: M13.
**Status**: done

### Features

19 cards, in the order to build them; each card's acceptance lines are this milestone's tests.

1. [`console.parse-line`](features/console.md#consoleparse-line--read-a-command-line-into-arguments) — Read a command
   line into arguments. *Derivation.*
2. [`console.classify`](features/console.md#consoleclassify--what-is-run-refused-and-confirmed) — What is run, refused
   and confirmed. *Derivation.*
3. [`console.command-flags`](features/console.md#consolecommand-flags--what-the-server-says-a-command-does) — What the
   server says a command does. *Read.*
4. [`console.session`](features/console.md#consolesession--the-consoles-database-and-transaction) — The console's
   database and transaction. *Derivation.*
5. [`console.connect`](features/console.md#consoleconnect--open-the-consoles-own-connection) — Open the console's own
   connection. *Operation.*
6. [`console.secret-arguments`](features/console.md#consolesecret-arguments--which-arguments-of-a-command-are-secrets)
   — Which arguments of a command are secrets. *Derivation.*
7. [`console.reply`](features/console.md#consolereply--a-reply-as-text-by-its-type) — A reply as text, by its type.
   *Derivation.*
8. [`console.history`](features/console.md#consolehistory--the-history-of-commands) — The history of commands.
   *Derivation.*
9. [`console.clear-history`](features/console.md#consoleclear-history--clear-the-history-of-commands) — Clear the
   history of commands. *Operation.*
10. [`console.autocomplete`](features/console.md#consoleautocomplete--complete-the-names-of-commands) — Complete the
    names of commands. *Derivation.*
11. [`console.argument-hint`](features/console.md#consoleargument-hint--the-hint-of-a-commands-arguments) — The hint
    of a command's arguments. *Derivation.*
12. [`console.command-docs`](features/console.md#consolecommand-docs--the-commands-the-server-knows-and-their-arguments)
    — The commands the server knows, and their arguments. *Read.*
13. [`console.run`](features/console.md#consolerun--run-one-command) — Run one command. *Operation.*
14. [`console.copy-reply`](features/console.md#consolecopy-reply--copy-a-reply) — Copy a reply. *Operation.*
15. [`console.clear`](features/console.md#consoleclear--clear-the-output) — Clear the output. *Operation.*
16. [`console.output`](features/console.md#consoleoutput--the-output-commands-and-their-replies) — The output:
    commands and their replies. *View.*
17. [`console.stop`](features/console.md#consolestop--stop-waiting-for-a-reply) — Stop waiting for a reply.
    *Operation.*
18. [`console.input`](features/console.md#consoleinput--the-command-input) — The command input. *View.*
19. [`console.show`](features/console.md#consoleshow--the-console-tab) — The console tab. *View.*

### Beyond the cards

- **Modules**: `src/features/console`, `src/ui/pages/console`, the Redis extensions of the editor.
- **Decisions**: relies on D38, D43; settles the rest of Q33 (replies that hold secrets).
- **Threats**: mitigates T12; T16 for arguments; states T22.
- **Stored data**: `state/<connection id>.json` gains the history of commands.

### Exit criteria

- [x] On a read-only connection `SET`, `PUBLISH`, `CONFIG SET` and a script are refused and the server receives none
      of them; `GET` runs (QA1).
- [x] `FLUSHALL` asks to type the connection's name; `AUTH` and `CONFIG SET requirepass` are written with `***` in the
      output, the history and the Log.
- [x] Every acceptance line of the cards above has a test named after its card, and they pass: `npm run check`,
      `npm run test:integration`, `npm run test:ui`; `catalog.py --tests` reports none missing for these cards.
- [x] Every page and dialog this milestone adds passes the accessibility check in both themes, and can be used from
      the keyboard alone (QA15, QA16).
- [x] The cards above are *Built* in the [index](features/README.md), `CHANGELOG.md` says what the user can now do,
      and this milestone's **Status** is *done*.

### Not in this milestone

- Subscribing is refused in the console and offered in Pub/Sub: M18.
- Named by cards above and built in M17: `server.slow-log`.
- Named by cards above and built in M18: `pubsub.show`.

## M17 — The Redis Server page

**Goal**: A page shows the server at a glance: the overview from `INFO`, the clients, the slow log, the memory with
the largest keys, replication, and the configuration as read.
**Depends on**: M13.
**Status**: done

### Features

17 cards, in the order to build them; each card's acceptance lines are this milestone's tests.

1. [`server.unavailable`](features/server.md#serverunavailable--what-a-section-shows-when-its-command-cannot-run) —
   What a section shows when its command cannot run. *Derivation.*
2. [`server.rank-keys`](features/server.md#serverrank-keys--rank-keys-by-memory) — Rank keys by memory. *Derivation.*
3. [`server.read-info`](features/server.md#serverread-info--read-info) — Read INFO. *Read.*
4. [`server.overview`](features/server.md#serveroverview--the-overview-section) — The Overview section. *View.*
5. [`server.replication`](features/server.md#serverreplication--the-replication-section) — The Replication section.
   *View.*
6. [`server.read-clients`](features/server.md#serverread-clients--read-the-connected-clients) — Read the connected
   clients. *Read.*
7. [`server.kill-client`](features/server.md#serverkill-client--disconnect-a-client) — Disconnect a client.
   *Operation.*
8. [`server.clients`](features/server.md#serverclients--the-clients-section) — The Clients section. *View.*
9. [`server.read-slow-log`](features/server.md#serverread-slow-log--read-the-slow-log) — Read the slow log. *Read.*
10. [`server.slow-log-reset`](features/server.md#serverslow-log-reset--clear-the-slow-log) — Clear the slow log.
    *Operation.*
11. [`server.slow-log`](features/server.md#serverslow-log--the-slow-log-section) — The Slow log section. *View.*
12. [`server.read-memory`](features/server.md#serverread-memory--read-the-memory-of-the-server) — Read the memory of
    the server. *Read.*
13. [`server.largest-keys`](features/server.md#serverlargest-keys--find-the-largest-keys) — Find the largest keys.
    *Read.*
14. [`server.memory`](features/server.md#servermemory--the-memory-section) — The Memory section. *View.*
15. [`server.read-config`](features/server.md#serverread-config--read-the-configuration) — Read the configuration.
    *Read.*
16. [`server.config`](features/server.md#serverconfig--the-configuration-section) — The Configuration section. *View.*
17. [`server.show`](features/server.md#servershow--the-server-page) — The Server page. *View.*

### Beyond the cards

- **Modules**: `src/features/server`, `src/ui/pages/server`.
- **Threats**: mitigates T16 for the configuration and the slow log.
- **Decisions**: settles Q34 for this page.
- **Risks**: RS15 (servers that lack a command): each section says what it shows then.

### Exit criteria

- [x] On a managed server that refuses `CONFIG` and `CLIENT LIST`, each section says what could not be read and the
      rest of the page works: tested with a server whose commands are renamed.
- [x] Every acceptance line of the cards above has a test named after its card, and they pass: `npm run check`,
      `npm run test:integration`, `npm run test:ui`; `catalog.py --tests` reports none missing for these cards.
- [x] Every page and dialog this milestone adds passes the accessibility check in both themes, and can be used from
      the keyboard alone (QA15, QA16).
- [x] The cards above are *Built* in the [index](features/README.md), `CHANGELOG.md` says what the user can now do,
      and this milestone's **Status** is *done*.

### Not in this milestone

- Nothing that its cards name.

## M18 — Pub/Sub

**Goal**: A page subscribes to channels and patterns, lists the messages as they arrive, pauses, filters, copies and
exports them, publishes one, and follows the redis-oplog events of a linked MongoDB connection.
**Depends on**: M11, M14.
**Status**: planned

### Features

18 cards, in the order to build them; each card's acceptance lines are this milestone's tests.

1. [`pubsub.keep`](features/pubsub.md#pubsubkeep--which-messages-the-list-keeps) — Which messages the list keeps.
   *Derivation.*
2. [`pubsub.filter`](features/pubsub.md#pubsubfilter--filter-the-list-of-messages) — Filter the list of messages.
   *Derivation.*
3. [`pubsub.oplog-event`](features/pubsub.md#pubsuboplog-event--read-a-message-as-a-redis-oplog-event) — Read a
   message as a redis-oplog event. *Derivation.*
4. [`pubsub.event-rows`](features/pubsub.md#pubsubevent-rows--one-row-per-event) — One row per event. *Derivation.*
5. [`pubsub.channels`](features/pubsub.md#pubsubchannels--the-channels-active-on-the-server) — The channels active on
   the server. *Read.*
6. [`pubsub.subscribe`](features/pubsub.md#pubsubsubscribe--subscribe-to-a-channel-or-to-a-pattern) — Subscribe to a
   channel or to a pattern. *Operation.*
7. [`pubsub.unsubscribe`](features/pubsub.md#pubsubunsubscribe--remove-a-subscription) — Remove a subscription.
   *Operation.*
8. [`pubsub.pause`](features/pubsub.md#pubsubpause--pause-and-resume-the-list) — Pause and resume the list.
   *Operation.*
9. [`pubsub.clear`](features/pubsub.md#pubsubclear--clear-the-list-of-messages) — Clear the list of messages.
   *Operation.*
10. [`pubsub.copy`](features/pubsub.md#pubsubcopy--copy-messages) — Copy messages. *Operation.*
11. [`pubsub.export`](features/pubsub.md#pubsubexport--export-the-messages-to-a-file) — Export the messages to a file.
    *Operation.*
12. [`pubsub.publish`](features/pubsub.md#pubsubpublish--publish-a-message) — Publish a message. *Operation.*
13. [`pubsub.subscriptions`](features/pubsub.md#pubsubsubscriptions--the-list-of-subscriptions) — The list of
    subscriptions. *View.*
14. [`pubsub.inspect`](features/pubsub.md#pubsubinspect--a-message-in-the-inspector-island) — A message in the
    inspector island. *View.*
15. [`pubsub.messages`](features/pubsub.md#pubsubmessages--the-list-of-messages) — The list of messages. *View.*
16. [`pubsub.reconnect`](features/pubsub.md#pubsubreconnect--when-the-pubsub-connection-drops) — When the Pub/Sub
    connection drops. *Operation.*
17. [`pubsub.follow-oplog`](features/pubsub.md#pubsubfollow-oplog--follow-the-redis-oplog-events-of-a-mongodb-connection)
    — Follow the redis-oplog events of a MongoDB connection. *Operation.*
18. [`pubsub.show`](features/pubsub.md#pubsubshow--the-pubsub-page) — The Pub/Sub page. *View.*

### Beyond the cards

- **Modules**: `src/features/pubsub`, `src/ui/pages/pubsub`.
- **Decisions**: settles Q34 for this page.
- **Stage**: the Redis client is complete.

### Exit criteria

- [ ] A write to a document through a linked MongoDB connection shows as one row of the page that follows its events,
      with the collection, the `_id` and the fields.
- [ ] The page receiving 5,000 messages a second stays usable and keeps the newest 10,000.
- [ ] Every acceptance line of the cards above has a test named after its card, and they pass: `npm run check`,
      `npm run test:integration`, `npm run test:ui`; `catalog.py --tests` reports none missing for these cards.
- [ ] Every page and dialog this milestone adds passes the accessibility check in both themes, and can be used from
      the keyboard alone (QA15, QA16).
- [ ] The cards above are *Built* in the [index](features/README.md), `CHANGELOG.md` says what the user can now do,
      and this milestone's **Status** is *done*.

### Not in this milestone

- Nothing that its cards name.

## M19 — Aggregate

**Goal**: The pipeline editor builds a pipeline stage by stage, shows the output after any stage, switches between
stages and text, runs pipelines that write only after a confirmation, and saves one as a view.
**Depends on**: M10.
**Status**: done

### Features

20 cards, in the order to build them; each card's acceptance lines are this milestone's tests.

1. [`aggregate.to-text`](features/aggregate.md#aggregateto-text--the-text-of-a-pipeline) — The text of a pipeline.
   *Derivation.*
2. [`aggregate.from-text`](features/aggregate.md#aggregatefrom-text--the-stages-of-a-text) — The stages of a text.
   *Derivation.*
3. [`aggregate.build`](features/aggregate.md#aggregatebuild--the-pipeline-that-is-sent) — The pipeline that is sent.
   *Derivation.*
4. [`aggregate.autocomplete`](features/aggregate.md#aggregateautocomplete--suggestions-in-a-stage) — Suggestions in a
   stage. *Derivation.*
5. [`aggregate.stage-template`](features/aggregate.md#aggregatestage-template--templates-of-the-common-stages) —
   Templates of the common stages. *Derivation.*
6. [`aggregate.add-stage`](features/aggregate.md#aggregateadd-stage--add-a-stage) — Add a stage. *Operation.*
7. [`aggregate.remove-stage`](features/aggregate.md#aggregateremove-stage--remove-a-stage) — Remove a stage.
   *Operation.*
8. [`aggregate.move-stage`](features/aggregate.md#aggregatemove-stage--move-a-stage) — Move a stage. *Operation.*
9. [`aggregate.toggle-stage`](features/aggregate.md#aggregatetoggle-stage--disable-or-enable-a-stage) — Disable or
   enable a stage. *Operation.*
10. [`aggregate.edit-as-text`](features/aggregate.md#aggregateedit-as-text--edit-the-pipeline-as-text) — Edit the
    pipeline as text. *Operation.*
11. [`aggregate.copy`](features/aggregate.md#aggregatecopy--copy-the-pipeline) — Copy the pipeline. *Operation.*
12. [`aggregate.write-output`](features/aggregate.md#aggregatewrite-output--run-a-pipeline-that-writes) — Run a
    pipeline that writes. *Operation.*
13. [`aggregate.save-as-view`](features/aggregate.md#aggregatesave-as-view--save-the-pipeline-as-a-view) — Save the
    pipeline as a view. *Operation.*
14. [`aggregate.stage-marks`](features/aggregate.md#aggregatestage-marks--what-a-stage-card-says-about-its-stage) —
    What a stage card says about its stage. *View.*
15. [`aggregate.run`](features/aggregate.md#aggregaterun--run-the-pipeline) — Run the pipeline. *Read.*
16. [`aggregate.clear`](features/aggregate.md#aggregateclear--remove-all-stages) — Remove all stages. *Operation.*
17. [`aggregate.show-stage`](features/aggregate.md#aggregateshow-stage--show-the-output-after-a-stage) — Show the
    output after a stage. *Operation.*
18. [`aggregate.drop-condition`](features/aggregate.md#aggregatedrop-condition--drop-a-condition-into-the-pipeline) —
    Drop a condition into the pipeline. *Operation.*
19. [`aggregate.sort-column`](features/aggregate.md#aggregatesort-column--sort-the-output-from-a-column-header) — Sort
    the output from a column header. *Operation.*
20. [`aggregate.show`](features/aggregate.md#aggregateshow--the-pipeline-editor) — The pipeline editor. *View.*

### Beyond the cards

- **Modules**: `src/features/aggregate`, `src/shared` (pipelines as text and as stages).
- **Threats**: T5 for pipelines that end in `$out` or `$merge`.
- **Quality**: QA8 for aggregations (120 seconds).

### Exit criteria

- [x] A pipeline ending in `$out` is refused on a read-only connection and confirmed elsewhere, with the collection it
      replaces named.
- [x] Every acceptance line of the cards above has a test named after its card, and they pass: `npm run check`,
      `npm run test:integration`, `npm run test:ui`; `catalog.py --tests` reports none missing for these cards.
- [x] Every page and dialog this milestone adds passes the accessibility check in both themes, and can be used from
      the keyboard alone (QA15, QA16).
- [x] The cards above are *Built* in the [index](features/README.md), `CHANGELOG.md` says what the user can now do,
      and this milestone's **Status** is *done*.

### Not in this milestone

- Saving a pipeline as a query: M20.
- Named by cards above and built in M20: `saved-query.show`, `saved-query.recent`, `saved-query.save`.
- Named by cards above and built in M21: `manage.read-options`, `manage.edit-view`.
- Named by cards above and built in M23: `explain.show`, `schema.analyze`.
- Named by cards above and built in M24: `codegen.show`.
- Named by cards above and built in M25: `transfer.export`.

## M20 — Saved and recent queries

**Goal**: The queries a collection ran are remembered; a query or a pipeline is saved for me or in the queries folder
of the connection, as a file a team shares through git, and run, renamed, moved and deleted from the queries list, Go
to and the pins.
**Depends on**: M19.
**Status**: done

### Features

17 cards, in the order to build them; each card's acceptance lines are this milestone's tests.

1. [`saved-query.file-path`](features/saved-query.md#saved-queryfile-path--where-the-file-of-a-saved-query-goes) —
   Where the file of a saved query goes. *Derivation.*
2. [`saved-query.parse-file`](features/saved-query.md#saved-queryparse-file--a-saved-query-read-from-its-file) — A
   saved query read from its file. *Derivation.*
3. [`saved-query.file-format`](features/saved-query.md#saved-queryfile-format--the-file-of-a-saved-query) — The file
   of a saved query. *Derivation.*
4. [`saved-query.recent`](features/saved-query.md#saved-queryrecent--the-recent-queries-of-a-collection) — The recent
   queries of a collection. *Operation.*
5. [`saved-query.remove-recent`](features/saved-query.md#saved-queryremove-recent--remove-a-recent-query) — Remove a
   recent query. *Operation.*
6. [`saved-query.clear-recent`](features/saved-query.md#saved-queryclear-recent--clear-the-recent-queries) — Clear the
   recent queries. *Operation.*
7. [`saved-query.rename`](features/saved-query.md#saved-queryrename--rename-a-saved-query) — Rename a saved query.
   *Operation.*
8. [`saved-query.delete`](features/saved-query.md#saved-querydelete--delete-a-saved-query) — Delete a saved query.
   *Operation.*
9. [`saved-query.reveal-file`](features/saved-query.md#saved-queryreveal-file--reveal-the-file-of-a-saved-query) —
   Reveal the file of a saved query. *Operation.*
10. [`saved-query.read-folder`](features/saved-query.md#saved-queryread-folder--the-files-of-the-queries-folder) — The
    files of the queries folder. *Read.*
11. [`saved-query.list`](features/saved-query.md#saved-querylist--the-saved-and-recent-queries-of-a-collection) — The
    saved and recent queries of a collection. *Read.*
12. [`saved-query.choose-folder`](features/saved-query.md#saved-querychoose-folder--choose-the-queries-folder-of-a-connection)
    — Choose the queries folder of a connection. *Operation.*
13. [`saved-query.save`](features/saved-query.md#saved-querysave--save-a-query) — Save a query. *Operation.*
14. [`saved-query.move`](features/saved-query.md#saved-querymove--move-a-saved-query-between-for-me-and-the-folder) —
    Move a saved query between for me and the folder. *Operation.*
15. [`saved-query.connection-list`](features/saved-query.md#saved-queryconnection-list--the-saved-queries-of-a-connection-for-go-to-and-for-pins)
    — The saved queries of a connection, for Go to and for pins. *Read.*
16. [`saved-query.run`](features/saved-query.md#saved-queryrun--run-a-saved-or-recent-query) — Run a saved or recent
    query. *Operation.*
17. [`saved-query.show`](features/saved-query.md#saved-queryshow--the-queries-list) — The queries list. *View.*

### Beyond the cards

- **Modules**: `src/features/saved-query`, `src/storage` (queries for me, the queries folder).
- **Decisions**: relies on D20, D29; settles Q27.
- **Threats**: T5 for the files of a queries folder.
- **Stored data**: introduces `saved-queries/<connection id>.json` at version 1, and reads and writes Mongoster's
  saved query files unchanged.

### Exit criteria

- [x] A folder of saved query files written by Mongoster 0.8.0 is listed, each query runs, and a query saved by
      Datardo is a file Mongoster reads: a test with recorded files of both.
- [x] An invalid file is skipped with a warning and stops nothing.
- [x] Every acceptance line of the cards above has a test named after its card, and they pass: `npm run check`,
      `npm run test:integration`, `npm run test:ui`; `catalog.py --tests` reports none missing for these cards.
- [x] Every page and dialog this milestone adds passes the accessibility check in both themes, and can be used from
      the keyboard alone (QA15, QA16).
- [x] The cards above are *Built* in the [index](features/README.md), `CHANGELOG.md` says what the user can now do,
      and this milestone's **Status** is *done*.

### Not in this milestone

- Nothing that its cards name.

## M21 — Manage collections and fields

**Goal**: Databases and collections are created, renamed and dropped; a view's definition and a collection's
validation rules are edited; a field is renamed, removed or converted to another type across the documents of a
collection.
**Depends on**: M12.
**Status**: done

### Features

22 cards, in the order to build them; each card's acceptance lines are this milestone's tests.

1. [`manage.drop-collection`](features/manage.md#managedrop-collection--drop-a-collection-or-a-view) — Drop a
   collection or a view. *Operation.*
2. [`manage.drop-database`](features/manage.md#managedrop-database--drop-a-database) — Drop a database. *Operation.*
3. [`field.path-rules`](features/field.md#fieldpath-rules--which-fields-a-column-action-can-change) — Which fields a
   column action can change. *Derivation.*
4. [`field.array-guard`](features/field.md#fieldarray-guard--leave-out-the-documents-where-a-parent-is-an-array) —
   Leave out the documents where a parent is an array. *Derivation.*
5. [`field.rename-plan`](features/field.md#fieldrename-plan--which-documents-a-rename-touches) — Which documents a
   rename touches. *Derivation.*
6. [`field.remove-plan`](features/field.md#fieldremove-plan--which-documents-a-removal-touches) — Which documents a
   removal touches. *Derivation.*
7. [`field.convert-plan`](features/field.md#fieldconvert-plan--which-values-a-conversion-touches) — Which values a
   conversion touches. *Derivation.*
8. [`field.type-counts`](features/field.md#fieldtype-counts--the-current-types-of-a-field) — The current types of a
   field. *Derivation.*
9. [`field.convert-type`](features/field.md#fieldconvert-type--convert-the-type-of-a-field) — Convert the type of a
   field. *Operation.*
10. [`field.layout-follows`](features/field.md#fieldlayout-follows--the-column-follows-a-renamed-or-removed-field) —
    The column follows a renamed or removed field. *Derivation.*
11. [`field.rename`](features/field.md#fieldrename--rename-a-field) — Rename a field. *Operation.*
12. [`field.remove`](features/field.md#fieldremove--remove-a-field) — Remove a field. *Operation.*
13. [`manage.name-rules`](features/manage.md#managename-rules--valid-names-of-databases-and-collections) — Valid names
    of databases and collections. *Derivation.*
14. [`manage.create-database`](features/manage.md#managecreate-database--create-a-database) — Create a database.
    *Operation.*
15. [`manage.create-collection`](features/manage.md#managecreate-collection--create-a-collection) — Create a
    collection. *Operation.*
16. [`manage.rename-collection`](features/manage.md#managerename-collection--rename-a-collection) — Rename a
    collection. *Operation.*
17. [`manage.generate-json-schema`](features/manage.md#managegenerate-json-schema--the-jsonschema-proposed-from-a-sample)
    — The `$jsonSchema` proposed from a sample. *Derivation.*
18. [`manage.read-options`](features/manage.md#manageread-options--the-options-of-a-collection-or-a-view) — The
    options of a collection or a view. *Read.*
19. [`manage.edit-view`](features/manage.md#manageedit-view--save-a-views-definition) — Save a view's definition.
    *Operation.*
20. [`manage.definition`](features/manage.md#managedefinition--the-definition-section-of-a-view) — The Definition
    section of a view. *View.*
21. [`manage.edit-validation`](features/manage.md#manageedit-validation--save-a-collections-validation-rules) — Save a
    collection's validation rules. *Operation.*
22. [`manage.validation`](features/manage.md#managevalidation--the-validation-section-of-a-collection) — The
    Validation section of a collection. *View.*

### Beyond the cards

- **Modules**: `src/features/manage`, `src/features/field`.
- **Decisions**: relies on D34, D36.

### Exit criteria

- [x] Dropping a collection asks to type its name and cannot be undone; renaming one carries its recent queries, its
      queries saved for me, its columns' layout and its pins.
- [x] Renaming a field of 3 documents is recorded and undone; of 50,000 it says it cannot be undone.
- [x] Every acceptance line of the cards above has a test named after its card, and they pass: `npm run check`,
      `npm run test:integration`, `npm run test:ui`; `catalog.py --tests` reports none missing for these cards.
- [x] Every page and dialog this milestone adds passes the accessibility check in both themes, and can be used from
      the keyboard alone (QA15, QA16).
- [x] The cards above are *Built* in the [index](features/README.md), `CHANGELOG.md` says what the user can now do,
      and this milestone's **Status** is *done*.

### Not in this milestone

- Named by cards above and built in M23: `schema.analyze`.
- Named by cards above and built in M34: `relation.detect`.

## M22 — Indexes

**Goal**: The Indexes section lists the indexes and the search indexes of a collection with their size, usage and
builds, and creates, edits, hides and drops them.
**Depends on**: M21.
**Status**: planned

### Features

21 cards, in the order to build them; each card's acceptance lines are this milestone's tests.

1. [`index.properties`](features/index.md#indexproperties--the-badges-of-an-index) — The badges of an index.
   *Derivation.*
2. [`index.command`](features/index.md#indexcommand--the-mongosh-command-of-an-index) — The mongosh command of an
   index. *Derivation.*
3. [`index.change-plan`](features/index.md#indexchange-plan--what-changing-an-index-takes) — What changing an index
   takes. *Derivation.*
4. [`index.wildcard-checks`](features/index.md#indexwildcard-checks--wildcards-written-wrong) — Wildcards written
   wrong. *Derivation.*
5. [`index.search-checks`](features/index.md#indexsearch-checks--what-a-search-index-definition-is-refused-for) — What
   a search index definition is refused for. *Derivation.*
6. [`index.search-summary`](features/index.md#indexsearch-summary--a-search-index-definition-in-short) — A search
   index definition in short. *Derivation.*
7. [`index.search-form`](features/index.md#indexsearch-form--a-search-index-definition-from-the-form) — A search index
   definition from the form. *Derivation.*
8. [`index.list`](features/index.md#indexlist--the-indexes-of-a-collection-with-size-usage-and-builds) — The indexes
   of a collection with size, usage and builds. *Read.*
9. [`index.hide`](features/index.md#indexhide--hide-or-unhide-an-index) — Hide or unhide an index. *Operation.*
10. [`index.drop`](features/index.md#indexdrop--drop-an-index) — Drop an index. *Operation.*
11. [`index.dialog`](features/index.md#indexdialog--the-index-dialog) — The index dialog. *View.*
12. [`index.create`](features/index.md#indexcreate--create-an-index) — Create an index. *Operation.*
13. [`index.edit`](features/index.md#indexedit--edit-an-index) — Edit an index. *Operation.*
14. [`index.duplicate`](features/index.md#indexduplicate--duplicate-an-index) — Duplicate an index. *View.*
15. [`index.list-search`](features/index.md#indexlist-search--the-search-indexes-of-a-collection) — The search indexes
    of a collection. *Read.*
16. [`index.drop-search`](features/index.md#indexdrop-search--drop-a-search-index) — Drop a search index. *Operation.*
17. [`index.search-dialog`](features/index.md#indexsearch-dialog--the-search-index-dialog) — The search index dialog.
    *View.*
18. [`index.create-search`](features/index.md#indexcreate-search--create-a-search-index) — Create a search index.
    *Operation.*
19. [`index.edit-search`](features/index.md#indexedit-search--change-a-search-indexs-definition) — Change a search
    index's definition. *Operation.*
20. [`index.inspect`](features/index.md#indexinspect--an-index-in-the-inspector) — An index in the inspector. *View.*
21. [`index.show`](features/index.md#indexshow--the-indexes-section) — The Indexes section. *View.*

### Beyond the cards

- **Modules**: `src/features/index`.
- **Decisions**: relies on D31 (editing an index puts the old one back when the new is refused), D36.
- **Tests**: search indexes need a server with search ([testing.md](testing.md#throwaway-servers)).

### Exit criteria

- [ ] Editing an index whose new definition the server refuses leaves the old index in place, and the notification
      says so.
- [ ] Every acceptance line of the cards above has a test named after its card, and they pass: `npm run check`,
      `npm run test:integration`, `npm run test:ui`; `catalog.py --tests` reports none missing for these cards.
- [ ] Every page and dialog this milestone adds passes the accessibility check in both themes, and can be used from
      the keyboard alone (QA15, QA16).
- [ ] The cards above are *Built* in the [index](features/README.md), `CHANGELOG.md` says what the user can now do,
      and this milestone's **Status** is *done*.

### Not in this milestone

- Advice on indexes: M30.
- Named by cards above and built in M35: `structure.show`.

## M23 — Schema and Explain

**Goal**: The Schema section analyzes a sample of a collection, with the types and values of each field, and a click
filters on a value; the Explain section sums up how a query or a pipeline ran, shard by shard, and suggests an index.
**Depends on**: M19, M22.
**Status**: planned

### Features

12 cards, in the order to build them; each card's acceptance lines are this milestone's tests.

1. [`schema.histogram`](features/schema.md#schemahistogram--the-ranges-of-a-histogram) — The ranges of a histogram.
   *Derivation.*
2. [`schema.share`](features/schema.md#schemashare--how-a-share-is-written) — How a share is written. *Derivation.*
3. [`explain.summary`](features/explain.md#explainsummary--the-summary-of-an-explain) — The summary of an explain.
   *Derivation.*
4. [`explain.shards`](features/explain.md#explainshards--the-winning-plan-of-each-shard) — The winning plan of each
   shard. *Derivation.*
5. [`explain.suggest-index`](features/explain.md#explainsuggest-index--the-index-that-would-serve-a-query) — The index
   that would serve a query. *Derivation.*
6. [`explain.run`](features/explain.md#explainrun--ask-the-server-for-the-explain) — Ask the server for the explain.
   *Read.*
7. [`explain.raw`](features/explain.md#explainraw--the-raw-output-of-an-explain) — The raw output of an explain.
   *View.*
8. [`explain.show`](features/explain.md#explainshow--the-explain-section) — The Explain section. *View.*
9. [`schema.analyze`](features/schema.md#schemaanalyze--the-summary-of-a-sample-of-documents) — The summary of a
   sample of documents. *Derivation.*
10. [`schema.sample`](features/schema.md#schemasample--the-documents-that-are-analyzed) — The documents that are
    analyzed. *Read.*
11. [`schema.filter-from-value`](features/schema.md#schemafilter-from-value--filter-on-a-value-a-range-or-a-type) —
    Filter on a value, a range or a type. *Operation.*
12. [`schema.show`](features/schema.md#schemashow--the-schema-section) — The Schema section. *View.*

### Beyond the cards

- **Modules**: `src/features/schema`, `src/features/explain`, `src/runner/workers` (the analysis runs on a worker
  thread).
- **Decisions**: settles Q26.

### Exit criteria

- [ ] The analysis of 10,000 sampled documents runs on a worker thread while the window stays usable, and is cancelled
      within one batch.
- [ ] Every acceptance line of the cards above has a test named after its card, and they pass: `npm run check`,
      `npm run test:integration`, `npm run test:ui`; `catalog.py --tests` reports none missing for these cards.
- [ ] Every page and dialog this milestone adds passes the accessibility check in both themes, and can be used from
      the keyboard alone (QA15, QA16).
- [ ] The cards above are *Built* in the [index](features/README.md), `CHANGELOG.md` says what the user can now do,
      and this milestone's **Status** is *done*.

### Not in this milestone

- Named by cards above and built in M25: `transfer.generate`.
- Named by cards above and built in M29: `mcp.server`.
- Named by cards above and built in M30: `advisor.show`, `monitor.show`.

## M24 — Chart and Code

**Goal**: The Chart section draws the result of a query as bars, lines, a pie or a histogram and saves it as a
picture; the Code section writes the query or the pipeline as code for mongosh, Node.js, Python, Java, C# and Go.
**Depends on**: M23.
**Status**: planned

### Features

18 cards, in the order to build them; each card's acceptance lines are this milestone's tests.

1. [`chart.options`](features/chart.md#chartoptions--the-options-of-a-chart) — The options of a chart. *Derivation.*
2. [`chart.data`](features/chart.md#chartdata--from-the-output-of-the-stages-to-what-is-drawn) — From the output of
   the stages to what is drawn. *Derivation.*
3. [`codegen.layout`](features/codegen.md#codegenlayout--how-the-code-is-laid-out) — How the code is laid out.
   *Derivation.*
4. [`codegen.types`](features/codegen.md#codegentypes--how-each-bson-type-is-written-in-each-language) — How each BSON
   type is written in each language. *Derivation.*
5. [`chart.filter-from-mark`](features/chart.md#chartfilter-from-mark--show-the-documents-of-a-bar-or-a-slice) — Show
   the documents of a bar or a slice. *Operation.*
6. [`chart.save-picture`](features/chart.md#chartsave-picture--save-the-chart-as-a-picture) — Save the chart as a
   picture. *Operation.*
7. [`chart.pipeline`](features/chart.md#chartpipeline--the-stages-a-chart-adds) — The stages a chart adds.
   *Derivation.*
8. [`chart.draw`](features/chart.md#chartdraw--run-the-aggregation-of-a-chart) — Run the aggregation of a chart.
   *Read.*
9. [`codegen.source`](features/codegen.md#codegensource--the-query-that-is-written-as-code) — The query that is
   written as code. *Derivation.*
10. [`codegen.mongosh`](features/codegen.md#codegenmongosh--the-code-for-mongosh) — The code for mongosh.
    *Derivation.*
11. [`codegen.nodejs`](features/codegen.md#codegennodejs--the-code-for-nodejs) — The code for Node.js. *Derivation.*
12. [`codegen.python`](features/codegen.md#codegenpython--the-code-for-python) — The code for Python. *Derivation.*
13. [`codegen.java`](features/codegen.md#codegenjava--the-code-for-java) — The code for Java. *Derivation.*
14. [`codegen.csharp`](features/codegen.md#codegencsharp--the-code-for-c) — The code for C#. *Derivation.*
15. [`codegen.go`](features/codegen.md#codegengo--the-code-for-go) — The code for Go. *Derivation.*
16. [`codegen.copy`](features/codegen.md#codegencopy--copy-the-code) — Copy the code. *Operation.*
17. [`chart.show`](features/chart.md#chartshow--the-chart-section) — The Chart section. *View.*
18. [`codegen.show`](features/codegen.md#codegenshow--the-code-section) — The Code section. *View.*

### Beyond the cards

- **Modules**: `src/features/chart`, `src/features/codegen`, `src/ui/pages/collection` (chart.js).
- **Quality**: QA8 for charts (120 seconds).

### Exit criteria

- [ ] For one query with a value of every BSON type, the code of each of the six languages is equal to its recorded
      text.
- [ ] Every acceptance line of the cards above has a test named after its card, and they pass: `npm run check`,
      `npm run test:integration`, `npm run test:ui`; `catalog.py --tests` reports none missing for these cards.
- [ ] Every page and dialog this milestone adds passes the accessibility check in both themes, and can be used from
      the keyboard alone (QA15, QA16).
- [ ] The cards above are *Built* in the [index](features/README.md), `CHANGELOG.md` says what the user can now do,
      and this milestone's **Status** is *done*.

### Not in this milestone

- Nothing that its cards name.

## M25 — Export, import, copy and back up

**Goal**: Documents are exported to JSON, JSON Lines and CSV and imported back; a collection is copied to another
database or connection; test documents are generated; a connection, a database or a collection is backed up and
restored in mongodump's formats.
**Depends on**: M12.
**Status**: planned

### Features

13 cards, in the order to build them; each card's acceptance lines are this milestone's tests.

1. [`transfer.copy-collection`](features/transfer.md#transfercopy-collection--copy-a-collection-to-another-database-or-connection)
   — Copy a collection to another database or connection. *Operation.*
2. [`backup.archive-write`](features/backup.md#backuparchive-write--writing-a-mongodump-archive) — Writing a mongodump
   archive. *Derivation.*
3. [`backup.archive-read`](features/backup.md#backuparchive-read--reading-a-mongodump-archive) — Reading a mongodump
   archive. *Derivation.*
4. [`backup.folder-layout`](features/backup.md#backupfolder-layout--backup-folders-and-their-files) — Backup folders
   and their files. *Derivation.*
5. [`backup.create`](features/backup.md#backupcreate--back-up-a-connection-a-database-or-a-collection) — Back up a
   connection, a database or a collection. *Operation.*
6. [`backup.restore`](features/backup.md#backuprestore--restore-from-a-backup) — Restore from a backup. *Operation.*
7. [`transfer.csv-write`](features/transfer.md#transfercsv-write--documents-as-csv) — Documents as CSV. *Derivation.*
8. [`transfer.export`](features/transfer.md#transferexport--export-documents-to-a-file) — Export documents to a file.
   *Operation.*
9. [`transfer.import-files`](features/transfer.md#transferimport-files--what-an-import-file-holds) — What an import
   file holds. *Derivation.*
10. [`transfer.csv-read`](features/transfer.md#transfercsv-read--csv-rows-as-documents) — CSV rows as documents.
    *Derivation.*
11. [`transfer.import`](features/transfer.md#transferimport--import-documents-from-a-file) — Import documents from a
    file. *Operation.*
12. [`transfer.generate-values`](features/transfer.md#transfergenerate-values--fake-documents-from-a-schema-analysis)
    — Fake documents from a schema analysis. *Derivation.*
13. [`transfer.generate`](features/transfer.md#transfergenerate--generate-test-documents) — Generate test documents.
    *Operation.*

### Beyond the cards

- **Modules**: `src/features/transfer`, `src/features/backup`, `src/runner/workers` (CSV, compression).
- **Decisions**: relies on D18, D36.
- **Threats**: mitigates T5 for imports and backups.
- **Quality**: QA10 (a large export does not slow typing) and QA2 for JSON Lines, copy and backup.

### Exit criteria

- [ ] An archive written by Datardo is restored by `mongorestore`, and one written by `mongodump` is restored by
      Datardo, with every type: an integration test with both tools.
- [ ] A damaged archive stops the restore at its checksum and writes nothing more.
- [ ] Every acceptance line of the cards above has a test named after its card, and they pass: `npm run check`,
      `npm run test:integration`, `npm run test:ui`; `catalog.py --tests` reports none missing for these cards.
- [ ] Every page and dialog this milestone adds passes the accessibility check in both themes, and can be used from
      the keyboard alone (QA15, QA16).
- [ ] The cards above are *Built* in the [index](features/README.md), `CHANGELOG.md` says what the user can now do,
      and this milestone's **Status** is *done*.

### Not in this milestone

- Running these at set times: M26.
- Named by cards above and built in M26: `task.run`.

## M26 — Scheduled tasks

**Goal**: Backups and exports run by themselves at set times while Datardo runs, also from the tray; missed runs are
handled, old outputs are removed, and the page shows each task's last runs.
**Depends on**: M25.
**Status**: planned

### Features

13 cards, in the order to build them; each card's acceptance lines are this milestone's tests.

1. [`task.next-runs`](features/task.md#tasknext-runs--when-a-task-runs) — When a task runs. *Derivation.*
2. [`task.due`](features/task.md#taskdue--due-and-missed-runs) — Due and missed runs. *Derivation.*
3. [`task.file-names`](features/task.md#taskfile-names--the-names-of-what-a-run-writes) — The names of what a run
   writes. *Derivation.*
4. [`task.tray`](features/task.md#tasktray--keep-datardo-running-in-the-tray-for-the-tasks) — Keep Datardo running in
   the tray for the tasks. *Derivation.*
5. [`task.edit`](features/task.md#taskedit--create-or-edit-a-task) — Create or edit a task. *Operation.*
6. [`task.run`](features/task.md#taskrun--run-a-task) — Run a task. *Operation.*
7. [`task.missed`](features/task.md#taskmissed--runs-missed-while-datardo-was-closed) — Runs missed while Datardo was
   closed. *Operation.*
8. [`task.cancel`](features/task.md#taskcancel--cancel-a-run) — Cancel a run. *Operation.*
9. [`task.retention`](features/task.md#taskretention--keep-the-last-n-outputs) — Keep the last N outputs. *Operation.*
10. [`task.delete`](features/task.md#taskdelete--delete-a-task) — Delete a task. *Operation.*
11. [`task.enable`](features/task.md#taskenable--enable-or-disable-a-task) — Enable or disable a task. *Operation.*
12. [`task.show`](features/task.md#taskshow--the-scheduled-tasks-page) — The Scheduled tasks page. *View.*
13. [`task.notify`](features/task.md#tasknotify--notifications-of-runs) — Notifications of runs. *View.*

### Beyond the cards

- **Modules**: `src/main` (the scheduler), `src/features/task`.
- **Decisions**: relies on D19; settles Q37.
- **Threats**: mitigates T14.
- **Stored data**: introduces `tasks/tasks.json` and the state files at version 1.
- **Risks**: RS4 for tasks (a damaged file loses no other task).

### Exit criteria

- [ ] A task set for every minute runs three times with the window closed and Datardo in the tray, and retention keeps
      its last two outputs and deletes only files it wrote.
- [ ] Every acceptance line of the cards above has a test named after its card, and they pass: `npm run check`,
      `npm run test:integration`, `npm run test:ui`; `catalog.py --tests` reports none missing for these cards.
- [ ] Every page and dialog this milestone adds passes the accessibility check in both themes, and can be used from
      the keyboard alone (QA15, QA16).
- [ ] The cards above are *Built* in the [index](features/README.md), `CHANGELOG.md` says what the user can now do,
      and this milestone's **Status** is *done*.

### Not in this milestone

- Tasks for Redis: Q10.

## M27 — Follow the writes: the document history and Watch changes

**Goal**: The document history shows the writes to one document still in the oplog, rebuilds its versions and restores
one; the Watch changes page follows a change stream live, filters it, shows what each change event changed and exports
the list.
**Depends on**: M12.
**Status**: planned

### Features

24 cards, in the order to build them; each card's acceptance lines are this milestone's tests.

1. [`history.document-writes`](features/history.md#historydocument-writes--the-writes-of-an-oplog-entry-to-one-document)
   — The writes of an oplog entry to one document. *Derivation.*
2. [`history.update-changes`](features/history.md#historyupdate-changes--the-fields-an-update-set-and-unset) — The
   fields an update set and unset. *Derivation.*
3. [`history.versions`](features/history.md#historyversions--rebuild-the-versions-of-a-document) — Rebuild the
   versions of a document. *Derivation.*
4. [`history.diff`](features/history.md#historydiff--the-difference-between-two-versions) — The difference between two
   versions. *Derivation.*
5. [`history.own-writes`](features/history.md#historyown-writes--which-writes-were-datardos-own) — Which writes were
   Datardo's own. *Derivation.*
6. [`watch.pipeline`](features/watch.md#watchpipeline--the-filter-the-server-applies) — The filter the server applies.
   *Derivation.*
7. [`watch.event-summary`](features/watch.md#watchevent-summary--the-line-of-a-change-event) — The line of a change
   event. *Derivation.*
8. [`watch.visible-events`](features/watch.md#watchvisible-events--the-change-events-the-list-shows) — The change
   events the list shows. *Derivation.*
9. [`watch.event-diff`](features/watch.md#watchevent-diff--what-a-change-event-changed) — What a change event changed.
   *Derivation.*
10. [`history.oplog-window`](features/history.md#historyoplog-window--whether-there-is-an-oplog-and-how-far-back-it-goes)
    — Whether there is an oplog, and how far back it goes. *Read.*
11. [`history.read-writes`](features/history.md#historyread-writes--read-a-documents-writes-from-the-oplog-a-part-at-a-time)
    — Read a document's writes from the oplog, a part at a time. *Read.*
12. [`watch.stream`](features/watch.md#watchstream--open-the-change-stream) — Open the change stream. *Read.*
13. [`history.copy-version`](features/history.md#historycopy-version--copy-a-version-of-the-document) — Copy a version
    of the document. *Operation.*
14. [`history.version-detail`](features/history.md#historyversion-detail--a-version-in-the-inspector) — A version in
    the inspector. *View.*
15. [`history.show`](features/history.md#historyshow--the-document-history-page) — The document history page. *View.*
16. [`watch.pause`](features/watch.md#watchpause--pause-and-resume-the-list) — Pause and resume the list. *Operation.*
17. [`watch.stop`](features/watch.md#watchstop--stop-and-start-the-stream) — Stop and start the stream. *Operation.*
18. [`watch.resume`](features/watch.md#watchresume--start-again-from-the-last-change-event) — Start again from the
    last change event. *Operation.*
19. [`watch.clear`](features/watch.md#watchclear--clear-the-list) — Clear the list. *Operation.*
20. [`watch.enable-pre-images`](features/watch.md#watchenable-pre-images--record-pre-images-of-a-collection) — Record
    pre-images of a collection. *Operation.*
21. [`watch.copy-events`](features/watch.md#watchcopy-events--copy-change-events) — Copy change events. *Operation.*
22. [`watch.event-detail`](features/watch.md#watchevent-detail--a-change-event-in-the-inspector) — A change event in
    the inspector. *View.*
23. [`watch.export`](features/watch.md#watchexport--export-the-change-events-to-a-file) — Export the change events to
    a file. *Operation.*
24. [`watch.show`](features/watch.md#watchshow--the-watch-changes-page) — The Watch changes page. *View.*

### Beyond the cards

- **Modules**: `src/features/history`, `src/features/watch`.
- **Decisions**: settles Q29.
- **Tests**: both need a replica set ([testing.md](testing.md#throwaway-servers)).

### Exit criteria

- [ ] A document inserted, updated twice and deleted shows four writes and its versions; restoring the second version
      puts it back and is recorded in the undo history.
- [ ] Every acceptance line of the cards above has a test named after its card, and they pass: `npm run check`,
      `npm run test:integration`, `npm run test:ui`; `catalog.py --tests` reports none missing for these cards.
- [ ] Every page and dialog this milestone adds passes the accessibility check in both themes, and can be used from
      the keyboard alone (QA15, QA16).
- [ ] The cards above are *Built* in the [index](features/README.md), `CHANGELOG.md` says what the user can now do,
      and this milestone's **Status** is *done*.

### Not in this milestone

- Named by cards above and built in M29: `mcp.tab-tools`.
- Named by cards above and built in M35: `compare.equality`.

## M28 — Playgrounds

**Goal**: A playground tab runs mongosh code against a connection, statement by statement or whole, in a process of
its own that Stop ends, with sessions and transactions, and shows the results.
**Depends on**: M11.
**Status**: done

### Features

14 cards, in the order to build them; each card's acceptance lines are this milestone's tests.

1. [`playground.statements`](features/playground.md#playgroundstatements--the-statements-of-a-script) — The statements
   of a script. *Derivation.*
2. [`playground.rewrite`](features/playground.md#playgroundrewrite--await-the-calls-of-a-script) — Await the calls of
   a script. *Derivation.*
3. [`playground.runtime`](features/playground.md#playgroundruntime--what-a-script-can-use) — What a script can use.
   *Derivation.*
4. [`playground.autocomplete`](features/playground.md#playgroundautocomplete--autocomplete-in-a-playground) —
   Autocomplete in a playground. *Derivation.*
5. [`playground.sessions`](features/playground.md#playgroundsessions--sessions-and-transactions-in-a-script) —
   Sessions and transactions in a script. *Derivation.*
6. [`playground.writes`](features/playground.md#playgroundwrites--the-writes-of-a-playground) — The writes of a
   playground. *Derivation.*
7. [`playground.open`](features/playground.md#playgroundopen--new-playground) — New playground. *Operation.*
8. [`playground.open-file`](features/playground.md#playgroundopen-file--open-a-playground-file) — Open a playground
   file…. *Operation.*
9. [`playground.save`](features/playground.md#playgroundsave--save-a-playground) — Save a playground. *Operation.*
10. [`playground.target`](features/playground.md#playgroundtarget--the-connection-and-database-of-a-playground) — The
    connection and database of a playground. *Operation.*
11. [`playground.run`](features/playground.md#playgroundrun--run-a-playground) — Run a playground. *Operation.*
12. [`playground.stop`](features/playground.md#playgroundstop--stop-a-run) — Stop a run. *Operation.*
13. [`playground.results`](features/playground.md#playgroundresults--the-results-of-a-run) — The results of a run.
    *View.*
14. [`playground.show`](features/playground.md#playgroundshow--the-playground-tab) — The playground tab. *View.*

### Beyond the cards

- **Modules**: `src/features/playground`, the playground process of `src/main`, `src/shared` (statements, the
  rewriting of calls with acorn).
- **Decisions**: relies on D40; settles the rest of Q13 (one playground at a time, a memory limit).
- **Threats**: states T6.
- **Risks**: RS17 is met (a script that loops for ever is stopped).

### Exit criteria

- [x] A script with `while (true) {}` is stopped within 1 second and Datardo stays usable.
- [x] A script that writes is refused on a read-only connection with nothing sent (QA1).
- [x] Every acceptance line of the cards above has a test named after its card, and they pass: `npm run check`,
      `npm run test:integration`, `npm run test:ui`; `catalog.py --tests` reports none missing for these cards.
- [x] Every page and dialog this milestone adds passes the accessibility check in both themes, and can be used from
      the keyboard alone (QA15, QA16).
- [x] The cards above are *Built* in the [index](features/README.md), `CHANGELOG.md` says what the user can now do,
      and this milestone's **Status** is *done*.

### Not in this milestone

- Named by cards above and built in M35: `structure.show`.

## M29 — The MCP server

**Goal**: AI assistants on the same machine read the user's connections through tools that never write: the server
runs on 127.0.0.1 behind an access token, is set up for the common assistants in one step, and may be kept from
reading data.
**Depends on**: M20, M17.
**Status**: planned

### Features

19 cards, in the order to build them; each card's acceptance lines are this milestone's tests.

1. [`mcp.output-limits`](features/mcp.md#mcpoutput-limits--bound-what-a-tool-returns-and-how-long-it-runs) — Bound
   what a tool returns and how long it runs. *Derivation.*
2. [`mcp.read-data`](features/mcp.md#mcpread-data--the-tools-offered-without-reading-data) — The tools offered without
   reading data. *Derivation.*
3. [`mcp.protocol`](features/mcp.md#mcpprotocol--answer-a-message-of-the-model-context-protocol) — Answer a message of
   the Model Context Protocol. *Derivation.*
4. [`mcp.arguments`](features/mcp.md#mcparguments--read-the-arguments-of-a-tool) — Read the arguments of a tool.
   *Derivation.*
5. [`mcp.refuse-write-stages`](features/mcp.md#mcprefuse-write-stages--refuse-pipelines-with-out-or-merge) — Refuse
   pipelines with $out or $merge. *Derivation.*
6. [`mcp.data-tools`](features/mcp.md#mcpdata-tools--explore-the-connections-and-read-documents) — Explore the
   connections and read documents. *Read.*
7. [`mcp.debugging-tools`](features/mcp.md#mcpdebugging-tools--follow-what-an-application-writes) — Follow what an
   application writes. *Read.*
8. [`mcp.performance-tools`](features/mcp.md#mcpperformance-tools--find-what-makes-a-database-slow) — Find what makes
   a database slow. *Read.*
9. [`mcp.deployment-tools`](features/mcp.md#mcpdeployment-tools--read-the-state-of-the-deployment) — Read the state of
   the deployment. *Read.*
10. [`mcp.data-model-tools`](features/mcp.md#mcpdata-model-tools--answer-quick-questions-about-the-data-model) —
    Answer quick questions about the data model. *Read.*
11. [`mcp.redis-key-tools`](features/mcp.md#mcpredis-key-tools--read-the-keys-of-a-redis-server) — Read the keys of a
    Redis server. *Read.*
12. [`mcp.redis-server-tools`](features/mcp.md#mcpredis-server-tools--read-the-state-of-a-redis-server) — Read the
    state of a Redis server. *Read.*
13. [`mcp.tab-tools`](features/mcp.md#mcptab-tools--open-datardos-tabs-for-the-user) — Open Datardo's tabs for the
    user. *Read.*
14. [`mcp.log`](features/mcp.md#mcplog--the-mcp-server-in-the-log) — The MCP server in the Log. *Derivation.*
15. [`mcp.server`](features/mcp.md#mcpserver--run-the-mcp-server-on-127001) — Run the MCP server on 127.0.0.1.
    *Operation.*
16. [`mcp.access-token`](features/mcp.md#mcpaccess-token--generate-a-new-access-token) — Generate a new access token.
    *Operation.*
17. [`mcp.setup`](features/mcp.md#mcpsetup--set-up-the-mcp-server-for-ai-assistants) — Set up the MCP server for AI
    assistants…. *Operation.*
18. [`mcp.change-port`](features/mcp.md#mcpchange-port--change-mcp-server-port) — Change MCP server port….
    *Operation.*
19. [`mcp.status`](features/mcp.md#mcpstatus--the-state-of-the-mcp-server-in-the-top-bar) — The state of the MCP
    server in the top bar. *View.*

### Beyond the cards

- **Modules**: `src/main/mcp`, `src/features/mcp`.
- **Code rules checked from now**: R14.7.
- **Decisions**: relies on D16; settles Q35.
- **Threats**: mitigates T8 and T18; states T9.
- **Quality**: QA13.
- **Tools** for areas built later (the monitor, the advisor, relations, search) are added in those milestones: a tool
  is offered only when its feature is built.

### Exit criteria

- [ ] A request with a wrong token, another `Host`, an `Origin` of a web page or a body over 1 MB is refused: the
      integration tests of R14.7.
- [ ] With `datardo.mcp.readData` off, no tool returns a document or the value of a key.
- [ ] Every acceptance line of the cards above has a test named after its card, and they pass: `npm run check`,
      `npm run test:integration`, `npm run test:ui`; `catalog.py --tests` reports none missing for these cards.
- [ ] Every page and dialog this milestone adds passes the accessibility check in both themes, and can be used from
      the keyboard alone (QA15, QA16).
- [ ] The cards above are *Built* in the [index](features/README.md), `CHANGELOG.md` says what the user can now do,
      and this milestone's **Status** is *done*.

### Not in this milestone

- Named by cards above and built in M30: `advisor.show`, `monitor.show`.
- Named by cards above and built in M34: `relation.detect`, `search.show`.

## M30 — Slow queries and the Index advisor

**Goal**: The Monitor page shows the operations in progress and kills one, and the slow queries by query shape from
the profiler and the server's log; the Index advisor says which indexes to create and which are redundant or unused.
**Depends on**: M22, M23.
**Status**: planned

### Features

22 cards, in the order to build them; each card's acceptance lines are this milestone's tests.

1. [`monitor.query-shape`](features/monitor.md#monitorquery-shape--the-shape-of-a-query) — The shape of a query.
   *Derivation.*
2. [`monitor.group-slow-queries`](features/monitor.md#monitorgroup-slow-queries--totals-per-query-shape) — Totals per
   query shape. *Derivation.*
3. [`monitor.read-operations`](features/monitor.md#monitorread-operations--read-the-operations-in-progress) — Read the
   operations in progress. *Read.*
4. [`monitor.read-slow-queries`](features/monitor.md#monitorread-slow-queries--read-the-slow-operations) — Read the
   slow operations. *Read.*
5. [`monitor.kill-operation`](features/monitor.md#monitorkill-operation--kill-a-server-operation) — Kill a server
   operation. *Operation.*
6. [`monitor.set-profiler`](features/monitor.md#monitorset-profiler--set-the-profiler-of-a-database) — Set the
   profiler of a database. *Operation.*
7. [`monitor.set-log-threshold`](features/monitor.md#monitorset-log-threshold--set-the-threshold-of-slow-operations) —
   Set the threshold of slow operations. *Operation.*
8. [`monitor.clear-profiler`](features/monitor.md#monitorclear-profiler--clear-the-operations-the-profiler-recorded) —
   Clear the operations the profiler recorded. *Operation.*
9. [`monitor.create-suggested-index`](features/monitor.md#monitorcreate-suggested-index--create-the-index-a-slow-query-suggests)
   — Create the index a slow query suggests. *Operation.*
10. [`monitor.open-slow-query`](features/monitor.md#monitoropen-slow-query--open-a-slow-query-in-its-collection) —
    Open a slow query in its collection. *Operation.*
11. [`monitor.operations`](features/monitor.md#monitoroperations--the-operations-section) — The Operations section.
    *View.*
12. [`monitor.slow-queries`](features/monitor.md#monitorslow-queries--the-slow-queries-section) — The Slow queries
    section. *View.*
13. [`monitor.show`](features/monitor.md#monitorshow--the-monitor-page) — The Monitor page. *View.*
14. [`advisor.analyze`](features/advisor.md#advisoranalyze--the-advice-for-a-scope) — The advice for a scope.
    *Derivation.*
15. [`advisor.indexes-to-create`](features/advisor.md#advisorindexes-to-create--the-indexes-the-slow-operations-need)
    — The indexes the slow operations need. *Derivation.*
16. [`advisor.prefix`](features/advisor.md#advisorprefix--whether-an-index-starts-with-the-keys-of-another) — Whether
    an index starts with the keys of another. *Derivation.*
17. [`advisor.redundant-indexes`](features/advisor.md#advisorredundant-indexes--the-indexes-another-index-replaces) —
    The indexes another index replaces. *Derivation.*
18. [`advisor.unused-indexes`](features/advisor.md#advisorunused-indexes--the-indexes-no-query-uses) — The indexes no
    query uses. *Derivation.*
19. [`advisor.read-indexes`](features/advisor.md#advisorread-indexes--the-indexes-of-a-scope-with-their-usage) — The
    indexes of a scope with their usage. *Read.*
20. [`advisor.read-slow-operations`](features/advisor.md#advisorread-slow-operations--the-slow-operations-of-a-scope)
    — The slow operations of a scope. *Read.*
21. [`advisor.turn-on-profiler`](features/advisor.md#advisorturn-on-profiler--turn-on-the-profiler-of-a-database) —
    Turn on the profiler of a database. *Operation.*
22. [`advisor.show`](features/advisor.md#advisorshow--the-index-advisor-page) — The Index advisor page. *View.*

### Beyond the cards

- **Modules**: `src/features/monitor`, `src/features/advisor`, `src/ui/pages/monitor`.
- **Decisions**: settles Q30.

### Exit criteria

- [ ] A collection scan repeated ten times shows as one slow query shape, and the advisor proposes the index that the
      Explain section suggests for it.
- [ ] Every acceptance line of the cards above has a test named after its card, and they pass: `npm run check`,
      `npm run test:integration`, `npm run test:ui`; `catalog.py --tests` reports none missing for these cards.
- [ ] Every page and dialog this milestone adds passes the accessibility check in both themes, and can be used from
      the keyboard alone (QA15, QA16).
- [ ] The cards above are *Built* in the [index](features/README.md), `CHANGELOG.md` says what the user can now do,
      and this milestone's **Status** is *done*.

### Not in this milestone

- Statistics, replication and sharding: M31.
- Named by cards above and built in M31: `monitor.stats`, `monitor.replication`, `monitor.sharding`.

## M31 — Statistics, replication and sharding

**Goal**: The Monitor page shows the server's statistics with their rates, the replica set with its lag and its last
oplog entries, and the sharded cluster with its balancer, and lets the primary step down and the balancer be stopped.
**Depends on**: M30.
**Status**: planned

### Features

17 cards, in the order to build them; each card's acceptance lines are this milestone's tests.

1. [`monitor.rates`](features/monitor.md#monitorrates--rates-between-two-reads-and-their-last-values) — Rates between
   two reads, and their last values. *Derivation.*
2. [`monitor.replication-lag`](features/monitor.md#monitorreplication-lag--members-and-their-lag) — Members and their
   lag. *Derivation.*
3. [`monitor.oplog-summary`](features/monitor.md#monitoroplog-summary--what-an-oplog-entry-changes) — What an oplog
   entry changes. *Derivation.*
4. [`monitor.balance`](features/monitor.md#monitorbalance--whether-a-sharded-collection-is-balanced) — Whether a
   sharded collection is balanced. *Derivation.*
5. [`monitor.read-server-status`](features/monitor.md#monitorread-server-status--read-the-servers-status) — Read the
   server's status. *Read.*
6. [`monitor.read-database-stats`](features/monitor.md#monitorread-database-stats--read-the-statistics-of-the-databases)
   — Read the statistics of the databases. *Read.*
7. [`monitor.read-collection-stats`](features/monitor.md#monitorread-collection-stats--read-the-statistics-of-a-databases-collections)
   — Read the statistics of a database's collections. *Read.*
8. [`monitor.read-replication`](features/monitor.md#monitorread-replication--read-the-replica-set) — Read the replica
   set. *Read.*
9. [`monitor.read-oplog`](features/monitor.md#monitorread-oplog--read-the-last-oplog-entries) — Read the last oplog
   entries. *Read.*
10. [`monitor.read-sharding`](features/monitor.md#monitorread-sharding--read-the-sharded-cluster) — Read the sharded
    cluster. *Read.*
11. [`monitor.read-sharding-events`](features/monitor.md#monitorread-sharding-events--read-the-recent-events-of-the-cluster)
    — Read the recent events of the cluster. *Read.*
12. [`monitor.step-down`](features/monitor.md#monitorstep-down--make-the-primary-step-down) — Make the primary step
    down. *Operation.*
13. [`monitor.set-balancer`](features/monitor.md#monitorset-balancer--stop-or-start-the-balancer) — Stop or start the
    balancer. *Operation.*
14. [`monitor.set-collection-balancing`](features/monitor.md#monitorset-collection-balancing--disable-or-enable-the-balancing-of-a-collection)
    — Disable or enable the balancing of a collection. *Operation.*
15. [`monitor.stats`](features/monitor.md#monitorstats--the-stats-section) — The Stats section. *View.*
16. [`monitor.replication`](features/monitor.md#monitorreplication--the-replication-section) — The Replication
    section. *View.*
17. [`monitor.sharding`](features/monitor.md#monitorsharding--the-sharding-section) — The Sharding section. *View.*

### Beyond the cards

- **Modules**: `src/features/monitor`.
- **Tests**: replication needs a replica set of three members and sharding a small cluster
  ([testing.md](testing.md#throwaway-servers)); where a test cannot have one, the `parse` functions are tested on
  recorded replies.

### Exit criteria

- [ ] Every `parse` function of this milestone reads the replies recorded from MongoDB 4.2, 6.0 and 8.0 in
      `test/fixtures`.
- [ ] Every acceptance line of the cards above has a test named after its card, and they pass: `npm run check`,
      `npm run test:integration`, `npm run test:ui`; `catalog.py --tests` reports none missing for these cards.
- [ ] Every page and dialog this milestone adds passes the accessibility check in both themes, and can be used from
      the keyboard alone (QA15, QA16).
- [ ] The cards above are *Built* in the [index](features/README.md), `CHANGELOG.md` says what the user can now do,
      and this milestone's **Status** is *done*.

### Not in this milestone

- Nothing that its cards name.

## M32 — Users and roles

**Goal**: The Users and roles page lists the users and the roles of a database, and creates users, changes passwords,
grants and revokes roles, and creates, edits and deletes custom roles.
**Depends on**: M12.
**Status**: planned

### Features

16 cards, in the order to build them; each card's acceptance lines are this milestone's tests.

1. [`user.delete-role`](features/user.md#userdelete-role--delete-a-custom-role) — Delete a custom role. *Operation.*
2. [`user.role-reference`](features/user.md#userrole-reference--how-a-role-is-written-suggested-and-sent) — How a role
   is written, suggested and sent. *Derivation.*
3. [`user.grant-role`](features/user.md#usergrant-role--grant-a-role-to-a-user) — Grant a role to a user. *Operation.*
4. [`user.create-role`](features/user.md#usercreate-role--create-a-custom-role) — Create a custom role. *Operation.*
5. [`user.privilege-summary`](features/user.md#userprivilege-summary--the-privileges-of-a-role-in-short) — The
   privileges of a role in short. *Derivation.*
6. [`user.generate-password`](features/user.md#usergenerate-password--a-random-password) — A random password.
   *Derivation.*
7. [`user.create`](features/user.md#usercreate--create-a-user) — Create a user. *Operation.*
8. [`user.list`](features/user.md#userlist--the-users-of-a-database-or-of-all-databases) — The users of a database or
   of all databases. *Read.*
9. [`user.list-roles`](features/user.md#userlist-roles--the-roles-of-a-database-or-of-all-databases) — The roles of a
   database or of all databases. *Read.*
10. [`user.edit-role`](features/user.md#useredit-role--edit-a-custom-role) — Edit a custom role. *Operation.*
11. [`user.signed-in`](features/user.md#usersigned-in--who-the-connection-is-signed-in-as) — Who the connection is
    signed in as. *Read.*
12. [`user.change-password`](features/user.md#userchange-password--change-the-password-of-a-user) — Change the
    password of a user. *Operation.*
13. [`user.revoke-role`](features/user.md#userrevoke-role--revoke-a-role-from-a-user) — Revoke a role from a user.
    *Operation.*
14. [`user.delete`](features/user.md#userdelete--delete-a-user) — Delete a user. *Operation.*
15. [`user.inspect`](features/user.md#userinspect--a-user-or-a-role-in-the-inspector) — A user or a role in the
    inspector. *View.*
16. [`user.show`](features/user.md#usershow--the-users-and-roles-page) — The Users and roles page. *View.*

### Beyond the cards

- **Modules**: `src/features/user`.
- **Decisions**: relies on D41; settles the rest of Q31 (the saved connection after a change of password).
- **Threats**: states T21; T1 for the steps (a password is written `***`).

### Exit criteria

- [ ] Creating a user writes its password in no step, no confirmation, no line of the Log and no file.
- [ ] Every acceptance line of the cards above has a test named after its card, and they pass: `npm run check`,
      `npm run test:integration`, `npm run test:ui`; `catalog.py --tests` reports none missing for these cards.
- [ ] Every page and dialog this milestone adds passes the accessibility check in both themes, and can be used from
      the keyboard alone (QA15, QA16).
- [ ] The cards above are *Built* in the [index](features/README.md), `CHANGELOG.md` says what the user can now do,
      and this milestone's **Status** is *done*.

### Not in this milestone

- Nothing that its cards name.

## M33 — GridFS

**Goal**: A bucket's files are listed, filtered, previewed, uploaded, downloaded, opened, renamed and deleted, and a
bucket is created and dropped.
**Depends on**: M12.
**Status**: done

### Features

17 cards, in the order to build them; each card's acceptance lines are this milestone's tests.

1. [`gridfs.rename`](features/gridfs.md#gridfsrename--rename-a-file) — Rename a file. *Operation.*
2. [`gridfs.edit-metadata`](features/gridfs.md#gridfsedit-metadata--edit-the-files-document-of-a-file) — Edit the
   files document of a file. *Operation.*
3. [`gridfs.drop-bucket`](features/gridfs.md#gridfsdrop-bucket--delete-a-bucket) — Delete a bucket. *Operation.*
4. [`gridfs.buckets`](features/gridfs.md#gridfsbuckets--the-buckets-of-a-database) — The buckets of a database.
   *Derivation.*
5. [`gridfs.filter`](features/gridfs.md#gridfsfilter--the-filter-of-the-files) — The filter of the files.
   *Derivation.*
6. [`gridfs.size-text`](features/gridfs.md#gridfssize-text--a-size-in-words) — A size in words. *Derivation.*
7. [`gridfs.download`](features/gridfs.md#gridfsdownload--download-a-file) — Download a file. *Operation.*
8. [`gridfs.open`](features/gridfs.md#gridfsopen--open-a-file-with-the-systems-application) — Open a file with the
   system's application. *Operation.*
9. [`gridfs.delete`](features/gridfs.md#gridfsdelete--delete-a-file) — Delete a file. *Operation.*
10. [`gridfs.hex-dump`](features/gridfs.md#gridfshex-dump--the-hex-dump-of-the-first-bytes) — The hex dump of the
    first bytes. *Derivation.*
11. [`gridfs.content-type`](features/gridfs.md#gridfscontent-type--the-content-type-of-a-file-name) — The content type
    of a file name. *Derivation.*
12. [`gridfs.list`](features/gridfs.md#gridfslist--a-page-of-the-files-of-a-bucket) — A page of the files of a bucket.
    *Read.*
13. [`gridfs.preview`](features/gridfs.md#gridfspreview--the-preview-of-a-file) — The preview of a file. *Read.*
14. [`gridfs.inspect`](features/gridfs.md#gridfsinspect--a-file-in-the-inspector) — A file in the inspector. *View.*
15. [`gridfs.upload`](features/gridfs.md#gridfsupload--upload-files-to-a-bucket) — Upload files to a bucket.
    *Operation.*
16. [`gridfs.show`](features/gridfs.md#gridfsshow--the-page-of-a-bucket) — The page of a bucket. *View.*
17. [`gridfs.create-bucket`](features/gridfs.md#gridfscreate-bucket--create-a-bucket-by-uploading-to-it) — Create a
    bucket by uploading to it. *Operation.*

### Beyond the cards

- **Modules**: `src/features/gridfs`.
- **Decisions**: relies on D36, D42; settles the rest of Q32 (replacing files).
- **Threats**: mitigates T20 as far as it goes.

### Exit criteria

- [x] A file of 200 MB is uploaded and downloaded with equal bytes while the window stays usable, and the upload is
      cancelled within one chunk.
- [x] A file named `run.exe` is not handed to the system; an SVG with a script is previewed and runs nothing.
- [x] Every acceptance line of the cards above has a test named after its card, and they pass: `npm run check`,
      `npm run test:integration`, `npm run test:ui`; `catalog.py --tests` reports none missing for these cards.
- [x] Every page and dialog this milestone adds passes the accessibility check in both themes, and can be used from
      the keyboard alone (QA15, QA16).
- [x] The cards above are *Built* in the [index](features/README.md), `CHANGELOG.md` says what the user can now do,
      and this milestone's **Status** is *done*.

### Not in this milestone

- Nothing that its cards name.

## M34 — Search documents and relations

**Goal**: One text is looked for across the collections of a database or of every database; references between
collections are found by sampling, drawn as a relationship diagram, and followed from a document in both directions.
**Depends on**: M12.
**Status**: planned

### Features

21 cards, in the order to build them; each card's acceptance lines are this milestone's tests.

1. [`relation.fields`](features/relation.md#relationfields--the-fields-of-a-sample) — The fields of a sample.
   *Derivation.*
2. [`relation.name-match`](features/relation.md#relationname-match--whether-a-field-is-named-after-a-collection) —
   Whether a field is named after a collection. *Derivation.*
3. [`relation.candidates`](features/relation.md#relationcandidates--which-fields-are-looked-up-and-where) — Which
   fields are looked up, and where. *Derivation.*
4. [`search.text`](features/search.md#searchtext--what-the-typed-text-looks-for) — What the typed text looks for.
   *Derivation.*
5. [`search.match`](features/search.md#searchmatch--the-values-of-a-document-that-match) — The values of a document
   that match. *Derivation.*
6. [`search.collections`](features/search.md#searchcollections--read-the-collections-a-search-reads) — Read the
   collections a search reads. *Read.*
7. [`search.scan`](features/search.md#searchscan--read-the-documents-of-the-collections-and-find-the-matches) — Read
   the documents of the collections and find the matches. *Read.*
8. [`search.open-in-collection`](features/search.md#searchopen-in-collection--open-the-documents-found-in-their-collection)
   — Open the documents found in their collection. *Operation.*
9. [`search.copy-id`](features/search.md#searchcopy-id--copy-the-_id-of-a-document-found) — Copy the _id of a document
   found. *Operation.*
10. [`search.show`](features/search.md#searchshow--the-search-documents-page) — The Search documents page. *View.*
11. [`relation.detect`](features/relation.md#relationdetect--which-fields-are-references) — Which fields are
    references. *Derivation.*
12. [`relation.layout`](features/relation.md#relationlayout--where-the-boxes-of-the-diagram-go) — Where the boxes of
    the diagram go. *Derivation.*
13. [`relation.targets`](features/relation.md#relationtargets--where-a-reference-leads) — Where a reference leads.
    *Derivation.*
14. [`relation.referrers`](features/relation.md#relationreferrers--which-documents-refer-to-a-document) — Which
    documents refer to a document. *Derivation.*
15. [`relation.read`](features/relation.md#relationread--read-the-references-of-a-database) — Read the references of a
    database. *Read.*
16. [`relation.export-mermaid`](features/relation.md#relationexport-mermaid--copy-the-diagram-as-mermaid) — Copy the
    diagram as Mermaid. *Operation.*
17. [`relation.export-svg`](features/relation.md#relationexport-svg--save-the-diagram-as-an-svg-image) — Save the
    diagram as an SVG image. *Operation.*
18. [`relation.diagram`](features/relation.md#relationdiagram--the-relationship-diagram-page) — The Relationship
    diagram page. *View.*
19. [`relation.open-referenced`](features/relation.md#relationopen-referenced--open-the-documents-a-field-refers-to) —
    Open the documents a field refers to. *Operation.*
20. [`relation.open-referencing`](features/relation.md#relationopen-referencing--open-the-documents-that-refer-to-a-document)
    — Open the documents that refer to a document. *Operation.*
21. [`relation.follow`](features/relation.md#relationfollow--go-from-here-the-references-of-a-document) — Go from
    here: the references of a document. *View.*

### Beyond the cards

- **Modules**: `src/features/search`, `src/features/relation`, `src/runner/workers`.
- **Decisions**: settles Q36 for these pages.
- **Quality**: QA12.

### Exit criteria

- [ ] A search across 200 collections reads three at a time and stops within one batch (QA12).
- [ ] Every acceptance line of the cards above has a test named after its card, and they pass: `npm run check`,
      `npm run test:integration`, `npm run test:ui`; `catalog.py --tests` reports none missing for these cards.
- [ ] Every page and dialog this milestone adds passes the accessibility check in both themes, and can be used from
      the keyboard alone (QA15, QA16).
- [ ] The cards above are *Built* in the [index](features/README.md), `CHANGELOG.md` says what the user can now do,
      and this milestone's **Status** is *done*.

### Not in this milestone

- Nothing that its cards name.

## M35 — Compare collections and structures

**Goal**: Two collections are compared document by document and one side is made like the other; two database
structures are compared, with the script that makes the right one like the left, applied after a confirmation.
**Depends on**: M25, M28.
**Status**: planned

### Features

14 cards, in the order to build them; each card's acceptance lines are this milestone's tests.

1. [`compare.equality`](features/compare.md#compareequality--when-two-documents-are-equal) — When two documents are
   equal. *Derivation.*
2. [`compare.field-diff`](features/compare.md#comparefield-diff--the-difference-of-one-document-field-by-field) — The
   difference of one document, field by field. *Derivation.*
3. [`compare.read`](features/compare.md#compareread--read-both-sides-and-pair-the-documents) — Read both sides and
   pair the documents. *Read.*
4. [`compare.read-details`](features/compare.md#compareread-details--read-the-documents-of-the-differences-shown) —
   Read the documents of the differences shown. *Read.*
5. [`compare.copy-document`](features/compare.md#comparecopy-document--copy-one-document-to-the-other-side) — Copy one
   document to the other side. *Operation.*
6. [`compare.make-like`](features/compare.md#comparemake-like--make-one-side-like-the-other) — Make one side like the
   other. *Operation.*
7. [`compare.show`](features/compare.md#compareshow--the-comparison-page-of-two-collections) — The comparison page of
   two collections. *View.*
8. [`structure.steps`](features/structure.md#structuresteps--what-each-difference-takes) — What each difference takes.
   *Derivation.*
9. [`structure.script`](features/structure.md#structurescript--the-script-that-makes-the-right-database-like-the-left-one)
   — The script that makes the right database like the left one. *Derivation.*
10. [`structure.read`](features/structure.md#structureread--read-the-structure-of-a-database) — Read the structure of
    a database. *Read.*
11. [`structure.copy-script`](features/structure.md#structurecopy-script--copy-the-script) — Copy the script.
    *Operation.*
12. [`structure.open-in-playground`](features/structure.md#structureopen-in-playground--open-the-script-in-a-playground)
    — Open the script in a playground. *Operation.*
13. [`structure.apply`](features/structure.md#structureapply--apply-differences-to-the-right-database) — Apply
    differences to the right database. *Operation.*
14. [`structure.show`](features/structure.md#structureshow--the-structure-comparison-page-of-two-databases) — The
    structure comparison page of two databases. *View.*

### Beyond the cards

- **Modules**: `src/features/compare`, `src/features/structure`, `src/runner/workers`.
- **Decisions**: relies on D31, D36; settles Q36 for comparisons.
- **Quality**: QA11.
- **Stage**: Datardo does everything Mongoster 0.8.0 does.

### Exit criteria

- [ ] Two collections of 1,000,000 documents are compared with memory proportional to their number (QA11).
- [ ] **Apply** with a drop asks to type the collection's name; a step that fails stops its own difference and the
      others are applied.
- [ ] Every acceptance line of the cards above has a test named after its card, and they pass: `npm run check`,
      `npm run test:integration`, `npm run test:ui`; `catalog.py --tests` reports none missing for these cards.
- [ ] Every page and dialog this milestone adds passes the accessibility check in both themes, and can be used from
      the keyboard alone (QA15, QA16).
- [ ] The cards above are *Built* in the [index](features/README.md), `CHANGELOG.md` says what the user can now do,
      and this milestone's **Status** is *done*.

### Not in this milestone

- Nothing that its cards name.

## Not planned

Every card of the catalog is in a milestone. What the product leaves out has no card yet, and gets its cards when a
decision takes it in:

- Redis Cluster and Sentinel, and the values of module types (Q6, RS12).
- Scheduled tasks for Redis (Q10).
- A second main island (Q7), projects with environments (Q8), keys the user can change (Q9).
- Updating in place, and signed installers (D44, D45).

## Before a release

A release can be cut after any milestone from M12 on. Before each:

- [ ] The repository is public with its `LICENSE` and its `SECURITY.md`, private vulnerability reporting is turned on
      in its settings on GitHub (D46), at the address of D48 that `window.check-update` and the links of About
      point to.
- [ ] The page of the release says how to open an installer that is not signed, on Windows and on macOS, and gives
      the SHA-256 of every installer (D45).
- [ ] The decisions marked *to confirm* that the release contains are confirmed or replaced.
- [ ] The numbers of [features/settings.md](features/settings.md#numbers-that-are-datardos-own) used by the release
      are tuned by the performance suite (Q11, RS5).
- [ ] The read-only suite and the types-survive suite pass for every card built (QA1 to QA3).
- [ ] [security.md](security.md) is read again against what was built; [risks.md](risks.md) has no row that the
      release makes untrue.
- [ ] The manual checklist of [testing.md](testing.md#what-no-test-reaches) is done on Windows, macOS and Linux,
      with a screen reader on one of them.
- [ ] The installers of the three systems install over the previous version and keep its data folder; a data folder
      of every earlier release is read (the migration tests).
- [ ] `CHANGELOG.md` and the notices of the licenses are those of the release.
