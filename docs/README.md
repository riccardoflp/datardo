# Datardo's documents

Datardo is a desktop client for databases: MongoDB and Redis today, in one window of its own, built so that another
engine can be added later. It does everything Mongoster 0.8.0 does for MongoDB, and adds a Redis client.

**State of the work**: milestones M0 to M23, M25, M27 to M29, M32 and M33 are done: the workshop, the window, the islands, the runner and the settings, the tabs, Go to and Home, the connections to MongoDB and Redis, their SSH tunnels, folders, colors, import and export, the tree, the query bar, the table of documents and the pipeline editor of a collection tab, the saved and recent queries, managing databases, collections, fields and indexes, the Schema and Explain sections, the undo history with the publishing for redis-oplog, reading and writing documents, the history of a document and Watch changes, export, import, copy and backups, GridFS, the keys tab, the values of every Redis type, the console, the Server page and Pub/Sub of Redis, the users and roles of a database, the playgrounds, and the MCP server for AI assistants. The pure core of most later milestones is written ahead of their views. The next milestones are in the [roadmap](roadmap.md).

## The documents, in the order to read them

| Document | Says |
| --- | --- |
| [product.md](product.md) | The product as the user meets it: the window and its islands, the kinds of tabs, the two engines, what replaces Mongoster and VS Code, the settings' names, the promises every feature keeps. |
| [glossary.md](glossary.md) | Each word of the product with one meaning, what it is not, the synonyms to avoid, and its name in the code. |
| [feature-contract.md](feature-contract.md) | What a feature is in the code (a function that returns a question, a read, a refusal or a plan), the runner, identifiers, places, codes, the template of a card, and the list of areas. |
| [features/](features/README.md) | The catalog: one file per area, one card per feature, with its function, its plan, its refusals and the acceptance lines that become its tests. The index lists every card with its milestone and status. |
| [architecture.md](architecture.md) | The context and the containers (C4), the modules and which may use which, how a click becomes an effect, processes, state, values, long work. |
| [code-rules.md](code-rules.md) | The numbered rules, each with its source and the check that enforces it. |
| [platform.md](platform.md) | What is asked of Electron and of Windows, macOS and Linux; the minimum versions; networking. |
| [testing.md](testing.md) | The kinds of tests, the throwaway servers, how an acceptance line becomes a test, what is checked by hand. |
| [security.md](security.md) | The threat model: what is protected, the threats and their mitigations, secrets, input that is not trusted, what is not defended. |
| [data.md](data.md) | Everything Datardo keeps between runs: the files, their versions and migrations, how they are written. |
| [quality.md](quality.md) | The qualities that matter most, as scenarios with a number and a test. |
| [risks.md](risks.md) | What is known to be weak or uncertain, and what is done about it. |
| [roadmap.md](roadmap.md) | The milestones, each with exactly the cards it builds, in order, and its exit criteria. |
| [decisions.md](decisions.md) | The decisions with why and what was rejected, and the open questions. |

At the root of the repository, [AGENTS.md](../AGENTS.md) is for whoever changes the code: the ground rules, the
commands, where to start; [SECURITY.md](../SECURITY.md) says how to report a vulnerability in private; `LICENSE` is
the MIT license ([D46](decisions.md#d46--a-public-repository-the-mit-license-reports-through-github)).

## What to read first

To build a milestone: `AGENTS.md`, the product, the feature contract, the architecture, the code rules, then the
milestone's section of the roadmap and the cards it lists. To review a change: its card, and the rules it cites. To
answer "why is it so?": the decisions.

## What was left out

- **No clean room.** Mongoster is the same author's; its code may be read and ported
  ([D2](decisions.md#d2--typescript-everywhere-mongoster-is-ported-not-rewritten-in-a-clean-room)).
- **No proposals folder.** With one author, a change too big for a card is discussed and becomes a decision.

## The sketches

The layout was chosen among nine sketches drawn before these documents. The one chosen, called A1, is described in
[product.md](product.md#the-window) and decided in
[D6](decisions.md#d6--islands-a-rail-outside-them-one-connection-at-a-time). Its colors are only indicative: the
themes are defined by the tokens when the window is built.

## Keeping these documents true

`python scripts/catalog.py docs` checks that identifiers are unique, that every identifier in backticks names a card,
that every card has the lines its kind needs, that no document uses a word the glossary says to avoid, and that every
card is planned in exactly one milestone. It runs in `npm run check`. After adding, renaming or moving a card, run
`python scripts/roadmap.py docs`, which writes the roadmap's lists of cards from the milestones it holds, and then
`python scripts/catalog.py docs --index`.

**What needs the author**: the open questions of [decisions.md](decisions.md#open-questions): Q4, Q6 to Q11 and Q14
to Q38, with what is left of Q13 and Q31 to Q33. No decision waits to be confirmed: D7, D31 to D34 and D36 to D38
were confirmed on 2026-11-18, and D39 to D46 were decided that day, answering Q2, Q3, Q5 and Q12 and the first part
of Q13 and Q31 to Q33. The cards were written by several authors at once, each on its areas: the cards of a
milestone are read together before its code starts (RS2 of [risks.md](risks.md)).
