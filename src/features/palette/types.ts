/**
 * What the features of Go to share: the sources it looks in, a candidate and what opening it starts, and what the
 * window knows besides the app's state (the names read by `palette.find-collections`, the commands offered now).
 */
import type { ConnectionId, TabId } from '../../shared/ids';
import type { TabShows } from '../../shared/state/tabs';
import type { CommandId } from '../command';
import type { Rankable } from './rank';

/** The sources of Go to (`palette.sources`). */
export type SourceName = 'tabs' | 'collections' | 'keys' | 'pages' | 'connections' | 'saved-queries' | 'commands';

/** The prefix that narrows Go to to each source (glossary, "prefix (of Go to)"). */
export const sourcePrefixes: Readonly<Record<string, SourceName>> = {
  '=': 'tabs',
  '#': 'collections',
  ':': 'keys',
  '/': 'pages',
  '@': 'connections',
  '?': 'saved-queries',
  '>': 'commands',
};

/** The sources looked in when no prefix is typed, in the order their rows are gathered. */
export const everySource: readonly SourceName[] = [
  'tabs',
  'collections',
  'keys',
  'pages',
  'connections',
  'saved-queries',
  'commands',
];

/** The kind of a row, which gives its icon and the word at its right. */
export type CandidateKind =
  'tab' | 'collection' | 'view' | 'bucket' | 'key' | 'page' | 'connection' | 'saved-query' | 'command';

/** What opening a row starts (`palette.open-result`). */
export type OpenTarget =
  /** An open tab: `tab.activate`. */
  | { readonly kind: 'tab'; readonly tab: TabId }
  /** Something shown in a tab, open or not: `tab.open`, on the section it had. */
  | { readonly kind: 'show'; readonly shows: TabShows; readonly section?: string }
  /** A connection: `nav.switch-connection`, with it chosen. */
  | { readonly kind: 'connection'; readonly connection: ConnectionId }
  /** A command: `palette.run-command`. */
  | { readonly kind: 'command'; readonly command: CommandId };

/** One thing Go to can list. */
export interface Candidate extends Rankable {
  /** Unique in a list: what the row is. */
  readonly id: string;
  readonly source: SourceName;
  readonly kind: CandidateKind;
  readonly icon: string;
  readonly opens: OpenTarget;
  /** What it shows, as `tab.same-target` compares it: two candidates of the same key are one row. */
  readonly sameKey?: string;
  /** For a command, its key as it is shown on this platform. */
  readonly key?: string;
}

/** A collection, a view or a GridFS bucket read by `palette.find-collections`. */
export interface CollectionName {
  readonly database: string;
  readonly name: string;
  readonly kind: 'collection' | 'view' | 'bucket';
}

/** The names read for one connection, and whether more were left out. */
export interface KnownCollections {
  readonly names: readonly CollectionName[];
  /** More than 10,000 names: the others are reached from the tree. */
  readonly more: boolean;
  /** When they were read, in milliseconds since 1970. */
  readonly at: number;
}

/** A command as Go to lists it now: its title for the state of the window, and its key on this platform. */
export interface OfferedCommand {
  readonly id: CommandId;
  readonly title: string;
  readonly key?: string;
}

/** What the window knows besides the app's state, for `palette.sources`. */
export interface PaletteKnowledge {
  /** The names read for each connected MongoDB connection, by connection id. */
  readonly collections: Readonly<Record<string, KnownCollections>>;
  /** The commands `palette.run-command` offers now. */
  readonly commands: readonly OfferedCommand[];
}
