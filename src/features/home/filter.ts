/**
 * Feature: home.filter
 *
 * Narrows the cards to the connections that are looked for: by the words typed, found in a connection's name, the name
 * of its folder or its address (`home.address`), without regard to case or accents; and by the engine chosen. The
 * filter never changes the order of the cards.
 */
import type { ConnectionView } from '../../shared/connection';
import type { EngineChoice } from '../../shared/state/palette';
import { foldedText } from '../palette/rank';
import { address } from './address';

/** What the filter gives: the connections shown, and for each engine the number that pass the text. */
export interface Filtered {
  readonly shown: readonly ConnectionView[];
  readonly counts: Readonly<Record<EngineChoice, number>>;
  /** The engines are shown only when the saved connections are not all of one engine. */
  readonly enginesShown: boolean;
}

/** Whether a connection holds every word of the text in its name, its folder or its address. */
export function passesText(typed: string, connection: ConnectionView): boolean {
  const words = foldedText(typed)
    .split(' ')
    .filter((word) => word !== '');
  const where = [connection.name, connection.folder ?? '', address(connection)].map(foldedText);
  return words.every((word) => where.some((part) => part.includes(word)));
}

/** The connections whose cards are shown, and the number beside each engine. */
export function filterConnections(
  typed: string,
  engine: EngineChoice,
  connections: readonly ConnectionView[],
): Filtered {
  const byText = connections.filter((connection) => passesText(typed, connection));
  const engines = new Set(connections.map((connection) => connection.engine));
  // With the engines not shown, the one remembered cannot be changed back: every engine passes.
  const chosen = engines.size > 1 ? engine : 'all';
  return {
    shown: byText.filter((connection) => chosen === 'all' || connection.engine === chosen),
    counts: {
      all: byText.length,
      mongodb: byText.filter((connection) => connection.engine === 'mongodb').length,
      redis: byText.filter((connection) => connection.engine === 'redis').length,
    },
    enginesShown: engines.size > 1,
  };
}
