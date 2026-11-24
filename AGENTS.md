# Working on Datardo

Datardo is a desktop client for MongoDB and Redis (TypeScript, Electron, React), a rewrite of Mongoster with a window
of its own and Redis added. The product is described in [docs/product.md](docs/product.md); the documents are listed in
[docs/README.md](docs/README.md).

## Ground rules

- **Every feature is a function with a card.** Read the [feature contract](docs/feature-contract.md) before writing
  one. A feature returns a question, a read, a refusal or a plan; only the runner changes anything. A change the user
  can see changes its card, its tests and `CHANGELOG.md` in the same commit; a new feature has its card first.
- **The code rules are numbered** in [docs/code-rules.md](docs/code-rules.md) and most are checked by `npm run
  check`. A change that needs to break one changes that page first, in its own commit, with the reason.
- **Layers**: `shared` and `features` are pure; drivers only in `src/engines`; Electron only in `src/main` and
  `src/preload`; React only in `src/ui`; the window never reaches the main process except through the bridge
  ([architecture](docs/architecture.md#who-may-use-whom)).
- **Dependencies** are those of decision D22. Adding one is a decision, written in
  [docs/decisions.md](docs/decisions.md) in the same commit.
- **Mongoster may be read and ported.** It is the same author's (version 0.8.0, then 0.9.0 and 0.10.0, which M37 to M42
  bring; ask for the path of its checkout).
  Cards say where it does the same thing (**Ported from**). Port behavior and pure code, reshaped to these rules;
  never its host classes, its `vscode` calls or its plain-DOM views.
- **The words are the glossary's** ([docs/glossary.md](docs/glossary.md)), in the code as in the text of the
  interface; never a word of its **Avoid** column.
- **The promises** of [docs/product.md](docs/product.md#what-stays-the-same) hold for every feature: read-only means
  no writes, a dangerous write is shown before it runs, types and bytes survive, secrets stay in the secret storage.
- **Secrets are never logged**, never sent to the window process, never written in clear text.
- **A change to a stored file** adds its migration and a recorded old file in the same commit
  ([docs/data.md](docs/data.md)).
- **Identifiers are written whole**: `data-feature="document.delete@row-menu"`, `refuse('document.delete/read-only',
  …)`, `describe('document.delete', …)`, `command('document.delete', …)`. Never build one from parts: the checks and
  a search must find it.
- **English** in the repository: code, comments, documents, text of the interface.
- **Commit only when asked**, one commit per piece of work, with a message that is one imperative sentence on what
  changes for the user. Never push.
- **Decisions are not edited away.** A decision that changes is replaced by a new one; an idea that changes several
  areas, a decision, a dependency or a stored format is proposed to the author before it is built.

## Commands

```bash
npm ci                     # install exactly what the lockfile says
npm run dev                # start Datardo from the sources, with its data in ./.data
npm run check              # types, lint, styles, format, layers, licenses, the catalog, unit tests
npm test                   # unit tests only
npm run test:integration   # against real MongoDB and Redis servers (docs/testing.md says how they are found)
npm run test:ui            # the built application driven through its window, with the accessibility check
npm run package            # the installer for this system, in release/
python scripts/catalog.py docs            # check the catalog alone
python scripts/roadmap.py docs            # write docs/roadmap.md again after adding, renaming or moving a card
python scripts/catalog.py docs --index    # then write docs/features/README.md again
```

These commands exist since milestone M0. `python scripts/check_catalog.py docs` is the catalog check that `npm run
check` runs: catalog.py with the checks of the sources, the tests, the commands and the settings, for the cards the
index marks *Built*. The integration tests need a MongoDB and a Redis: [docs/testing.md](docs/testing.md) says how
they are found.

## Where to start

1. Read [docs/README.md](docs/README.md), then the product, the feature contract, the architecture and the code
   rules.
2. Open the milestone in progress in [docs/roadmap.md](docs/roadmap.md). Read its section and every card it lists.
3. Build its **Features** in order, one card at a time: the function, the tests of its acceptance lines (named after
   the card), then the view when it has one. Then its **Beyond the cards**.
4. Tick its exit criteria, mark its cards *Built* in [docs/features/README.md](docs/features/README.md), and set the
   milestone's status.
5. Build nothing outside the milestone without asking. A question the documents do not answer becomes an open
   question in [docs/decisions.md](docs/decisions.md), with the card it concerns, before the code guesses.
