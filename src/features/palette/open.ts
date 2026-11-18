/**
 * Feature: palette.open
 *
 * One field that finds the open tabs, collections, keys, pages, connections, saved queries and commands. With nothing
 * typed it lists the recent places and names the prefixes; with something typed, what `palette.sources` finds in the
 * order of `palette.rank`, then the keys of `palette.find-keys` under their own heading. Opening Go to connects
 * nothing and, until something is typed, sends nothing to a deployment.
 */
import { run, type Answers, type Context, type OperationFeature, type Outcome } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import type { AppState } from '../../shared/state';
import type { TabShows } from '../../shared/state/tabs';
import { appPlan, appStep, startArgs } from '../nav/types';
import { lookedAt, keyText, type KeysPlace, type KeysWanted, type ScanProgress } from './find-keys';
import { rank, type MatchedLetters } from './rank';
import { recentInGoToOf, type RecentEntry } from './recent';
import { sources, type SourcesInput } from './sources';
import { text } from './text';
import type { Candidate, CandidateKind, OpenTarget } from './types';

/** How wide the list is, in px, or as wide as the window allows (Datardo's choice). */
export const listWidth = 640;

/** How many rows are in sight at most; the rest by scrolling (Datardo's choice). */
export const rowsInSight = 12;

/** A part of a row's name, in bold when it matched. */
export interface NamePart {
  readonly text: string;
  readonly bold: boolean;
}

/** A row of the list. */
export interface GoToRow {
  readonly id: string;
  readonly kind: CandidateKind;
  readonly icon: string;
  readonly name: string;
  readonly parts: readonly NamePart[];
  readonly context: string;
  /** At the right: the word for its kind, or for a command its key. */
  readonly right: string;
  readonly opens: OpenTarget;
  /** What a screen reader says of it when it is selected: its name, its kind and its context. */
  readonly spoken: string;
}

/** A part of the list, under its heading. */
export interface GoToSection {
  readonly heading?: string;
  readonly rows: readonly GoToRow[];
}

/** The keys found for the text, under their heading, with what the scan says. */
export interface KeysPart {
  readonly heading: string;
  readonly rows: readonly GoToRow[];
  readonly status?: string;
  /** **Scan all in Keys**, when the scan stopped before the end. */
  readonly scanAll?: { readonly label: string; readonly opens: OpenTarget };
}

/** The scan of keys for the text typed, as the window follows it. */
export interface KeysScan {
  readonly place: KeysPlace;
  readonly wanted: KeysWanted;
  readonly progress: ScanProgress;
  readonly error?: string;
}

/** What Go to shows. */
export interface GoToView {
  readonly field: { readonly label: string; readonly placeholder: string; readonly listLabel: string };
  readonly sections: readonly GoToSection[];
  /** With nothing typed: the line that names the prefixes, with the first-use line when there is no recent place. */
  readonly prefixes?: { readonly intro?: string; readonly list: readonly { prefix: string; source: string }[] };
  /** *Nothing matches "zzzz".*, or *Type part of a key's name.* */
  readonly message?: string;
  /** *Local has more than 10,000 collections. Use the tree to reach the others.* */
  readonly notes: readonly string[];
  readonly keys?: KeysPart;
  /** What a screen reader is told of the list: the number of results. */
  readonly announcement: string;
}

/** What Go to is drawn from. */
export interface GoToInput extends SourcesInput {
  readonly typed: string;
  readonly keys?: KeysScan;
}

function kindWord(kind: CandidateKind): string {
  return kind === 'saved-query' ? text.kinds.savedQuery : text.kinds[kind];
}

/** The name in parts, the letters that matched in bold. */
export function nameParts(name: string, bold: readonly MatchedLetters[]): readonly NamePart[] {
  const characters = Array.from(name);
  const parts: NamePart[] = [];
  let at = 0;
  for (const run of bold) {
    if (run.start > at) {
      parts.push({ text: characters.slice(at, run.start).join(''), bold: false });
    }
    if (run.start + run.length > at) {
      parts.push({ text: characters.slice(Math.max(at, run.start), run.start + run.length).join(''), bold: true });
      at = run.start + run.length;
    }
  }
  if (at < characters.length) {
    parts.push({ text: characters.slice(at).join(''), bold: false });
  }
  return parts;
}

function rowOf(candidate: Candidate, bold: readonly MatchedLetters[]): GoToRow {
  const word = kindWord(candidate.kind);
  return {
    id: candidate.id,
    kind: candidate.kind,
    icon: candidate.icon,
    name: candidate.name,
    parts: nameParts(candidate.name, bold),
    context: candidate.context,
    right: candidate.kind === 'command' ? (candidate.key ?? '') : word,
    opens: candidate.opens,
    spoken: [candidate.name, word, candidate.context].filter((part) => part !== '').join(', '),
  };
}

function recentKind(shows: TabShows): CandidateKind {
  switch (shows.kind) {
    case 'collection':
      return shows.view === true ? 'view' : 'collection';
    case 'keys':
    case 'key':
      return 'key';
    case 'app':
    case 'document':
    case 'page':
    case 'playground':
    case 'console':
      return 'page';
  }
}

function recentRow(entry: RecentEntry): GoToRow {
  const kind = recentKind(entry.place.shows);
  return {
    id: `recent:${entry.key}`,
    kind,
    icon: entry.icon,
    name: entry.title,
    parts: [{ text: entry.title, bold: false }],
    context: entry.context,
    right: kindWord(kind),
    opens: {
      kind: 'show',
      shows: entry.place.shows,
      ...(entry.place.section === undefined ? {} : { section: entry.place.section }),
    },
    spoken: [entry.title, kindWord(kind), entry.context].join(', '),
  };
}

const field = { label: text.field.label, placeholder: text.field.placeholder, listLabel: text.field.list };

function nothingTyped(state: AppState): GoToView {
  const recent = recentInGoToOf(state).map(recentRow);
  const list = text.prefixes.map((each) => ({ prefix: each.prefix, source: each.source }));
  return {
    field,
    sections: recent.length === 0 ? [] : [{ heading: text.headings.recent, rows: recent }],
    prefixes: recent.length === 0 ? { intro: text.firstUse, list } : { list },
    notes: [],
    announcement: text.results(recent.length),
  };
}

/** The keys found, ordered by `palette.rank`, with what the scan says under them. */
export function keysPart(scan: KeysScan): KeysPart {
  const database = `db${String(scan.place.database)}`;
  const candidates: Candidate[] = scan.progress.keys.map((name, index) => {
    const shown = keyText(name);
    return {
      id: `keys:${String(index)}:${shown}`,
      source: 'keys',
      kind: 'key',
      name: shown,
      context: `${scan.place.name} / ${database}`,
      icon: 'symbol-key',
      opens: {
        kind: 'show',
        shows: {
          kind: 'key',
          connection: scan.place.connection,
          database: scan.place.database,
          key: shown,
          separator: ':',
        },
      },
      open: false,
      recent: false,
      current: true,
    };
  });
  const terms = scan.wanted.typed.split(' ').filter((term) => term !== '');
  const ranked = rank(terms, candidates);
  const rows =
    ranked.length === candidates.length
      ? ranked.map((each) => rowOf(each.candidate, each.bold))
      : candidates.map((each) => rowOf(each, []));
  const heading = text.headings.keysOf(scan.place.name, database);
  if (scan.error !== undefined) {
    return { heading, rows: [], status: text.keys.failed(scan.error) };
  }
  if (scan.progress.ended === undefined) {
    return { heading, rows, status: text.keys.looking };
  }
  if (scan.progress.ended === 'whole') {
    return rows.length === 0
      ? { heading, rows, status: text.keys.none(database, scan.wanted.typed) }
      : { heading, rows };
  }
  return {
    heading,
    rows,
    status: text.keys.stopped(lookedAt(scan.progress), database),
    scanAll: {
      label: text.keys.scanAll,
      opens: {
        kind: 'show',
        shows: { kind: 'keys', connection: scan.place.connection, database: scan.place.database, separator: ':' },
      },
    },
  };
}

/** What Go to shows for the text typed. */
export function view(input: GoToInput): GoToView {
  const looked = sources(input.typed, input);
  if (looked.kind === 'nothing-typed') {
    return nothingTyped(input.state);
  }
  const rows = looked.whole
    ? looked.candidates.map((candidate) => rowOf(candidate, []))
    : rank(looked.terms, looked.candidates).map((each) => rowOf(each.candidate, each.bold));
  const keysOnly = looked.sources.length === 1 && looked.sources[0] === 'keys';
  const keys = input.keys === undefined ? undefined : keysPart(input.keys);
  const notes = looked.sources.includes('collections')
    ? input.state.connections.saved
        .filter((saved) => input.knowledge.collections[saved.id]?.more === true)
        .map((saved) => text.tooManyCollections(saved.name))
    : [];
  let message: string | undefined;
  if (keysOnly && looked.terms.length === 0) {
    message = text.typeKeyName;
  } else if (rows.length === 0 && !keysOnly) {
    message = text.nothingMatches(input.typed.trim());
  }
  return {
    field,
    sections: rows.length === 0 ? [] : [{ rows }],
    ...(message === undefined ? {} : { message }),
    notes,
    ...(keys === undefined ? {} : { keys }),
    announcement: text.results(rows.length + (keys?.rows.length ?? 0)),
  };
}

/** The prefix Go to opens with: `>` for **Show all commands**, `=` for **Show open tabs**, or `args.prefix`. */
export function prefixAsked(answers: Answers): string {
  const args = answers['args'];
  if (args === 'commands') {
    return '>';
  }
  if (args === 'tabs') {
    return '=';
  }
  const prefix = startArgs(answers)['prefix'];
  return typeof prefix === 'string' ? prefix : '';
}

/**
 * Opens Go to from the main process, with a prefix typed when asked: the menu bar on macOS. The window opens it by
 * itself for its own keys and controls.
 */
export function plan(_context: Context, answers: Answers): Outcome {
  const prefix = prefixAsked(answers);
  return run(appPlan(text.plans.open, [appStep(text.steps.openGoTo, 'palette.show', { prefix })]));
}

/** Opening Go to from the main process, as the runner starts it. */
export const open: OperationFeature = { kind: 'operation', id: featureId('palette.open'), plan };
