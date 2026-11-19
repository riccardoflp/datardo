/**
 * Feature: index.properties
 *
 * What the **Properties** column says about an index, from its keys and options: its badges, in the order of the
 * card, each with its tooltip.
 */
import type { Json } from '../../shared/engine-request';
import { mongoshValue } from '../../shared/mongosh-value';
import { groupThousands } from '../../shared/text-units';
import { editableDefinition } from './change-plan';
import { text } from './text';
import { isDocument, type IndexInfo } from './types';
import { isWildcard, misspelledWildcards } from './wildcard-checks';

/** A badge of the **Properties** column. */
export interface Badge {
  readonly label: string;
  readonly tooltip: string;
  /** Drawn as a warning: `not a wildcard`, `hidden`, `building`. */
  readonly warning: boolean;
}

function badge(label: string, tooltip: string, warning = false): Badge {
  return { label, tooltip, warning };
}

const byteUnits = ['KB', 'MB', 'GB', 'TB'];

/** A size in units of 1,024: `812 B`, `1.5 KB`, `38 MB`, `2.0 GB`. */
export function bytesText(bytes: number): string {
  if (bytes < 1024) {
    return `${String(bytes)} B`;
  }
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < byteUnits.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : String(Math.round(value))} ${byteUnits[unit] ?? 'TB'}`;
}

/** A TTL with the largest unit that divides it: `1d`, `2h`, `5m`, `90s`, `0s`. */
export function secondsText(seconds: number): string {
  const units: readonly (readonly [string, number])[] = [
    ['d', 86_400],
    ['h', 3600],
    ['m', 60],
  ];
  const unit = units.find(([, size]) => seconds !== 0 && seconds % size === 0);
  return unit === undefined ? `${String(seconds)}s` : `${String(seconds / unit[1])}${unit[0]}`;
}

/** How long ago, in the largest whole unit: `45s`, `20m`, `12h`, `3d`. */
export function agoText(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const units: readonly (readonly [string, number])[] = [
    ['d', 86_400],
    ['h', 3600],
    ['m', 60],
  ];
  const unit = units.find(([, size]) => seconds >= size);
  return unit === undefined ? `${String(seconds)}s` : `${String(Math.floor(seconds / unit[1]))}${unit[0]}`;
}

/** A moment as a date and a time in UTC, to the minute: `2026-11-16 08:00 UTC`. */
export function dateText(milliseconds: number): string {
  return `${new Date(milliseconds).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

function typeBadges(keys: Readonly<Record<string, Json>>): readonly Badge[] {
  const types = new Set(Object.values(keys).filter((value): value is string => typeof value === 'string'));
  const badges = [...types].map((type) => badge(type, text.badges.indexType));
  if (Object.keys(keys).some(isWildcard)) {
    badges.push(badge(text.badges.wildcard, text.badges.wildcardHint));
  }
  const misspelled = misspelledWildcards(keys);
  if (misspelled.length > 0) {
    badges.push(badge(text.badges.notWildcard, text.badges.notWildcardHint(misspelled.join(', ')), true));
  }
  return badges;
}

function buildingBadge(index: IndexInfo): Badge {
  const { progress } = index;
  if (progress === undefined || progress.total <= 0) {
    return badge(text.badges.building, text.badges.buildingHint, true);
  }
  const percent = Math.floor((progress.done / progress.total) * 100);
  const phase = progress.phase ?? text.badges.buildingPhase;
  const tooltip = `${phase}: ${groupThousands(progress.done)} of ${groupThousands(progress.total)}`;
  return badge(text.badges.buildingAt(percent), tooltip, true);
}

/** Feature: index.properties — the badges of an index of `index.list`, in the order of the card. */
export function badges(index: IndexInfo): readonly Badge[] {
  const definition = editableDefinition(index.name, index.key, index.options);
  const options = index.options;
  const collation = definition.options['collation'];
  const locale = isDocument(collation) ? collation['locale'] : undefined;
  const ttl = options['expireAfterSeconds'];
  const partial = options['partialFilterExpression'];
  return [
    ...typeBadges(definition.keys),
    ...(options['unique'] === true ? [badge(text.badges.unique, text.badges.uniqueHint)] : []),
    ...(options['sparse'] === true ? [badge(text.badges.sparse, text.badges.sparseHint)] : []),
    ...(typeof ttl === 'number' ? [badge(text.badges.ttl(secondsText(ttl)), text.badges.ttlHint)] : []),
    ...(isDocument(partial) ? [badge(text.badges.partial, text.badges.partialHint(mongoshValue(partial)))] : []),
    ...(typeof locale === 'string' && isDocument(collation)
      ? [badge(text.badges.collation(locale), mongoshValue(collation))]
      : []),
    ...(options['clustered'] === true ? [badge(text.badges.clustered, text.badges.clusteredHint)] : []),
    ...(options['hidden'] === true ? [badge(text.badges.hidden, text.badges.hiddenHint, true)] : []),
    ...(index.building ? [buildingBadge(index)] : []),
  ];
}
