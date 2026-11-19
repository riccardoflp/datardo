/**
 * Feature: index.wildcard-checks
 *
 * Points out a wildcard written so that MongoDB would index something else than meant, or given options a wildcard
 * index cannot have. The checks only warn: the server decides, and what it accepts depends on its version.
 */
import { normalized } from './change-plan';
import { text } from './text';
import type { IndexDefinition, JsonDocument } from './types';

/** Feature: index.wildcard-checks — a wildcard key: every field (`$**`) or every field below a path (`path.$**`). */
export function isWildcard(field: string): boolean {
  const path = field === '$**' ? '' : field.endsWith('.$**') ? field.slice(0, -'.$**'.length) : undefined;
  return path !== undefined && !path.includes('*') && !path.split('.').some((part) => part.startsWith('$'));
}

/** The keys with a `*` that are not a wildcard (`address.*`, `**`): an index on a field with that very name. */
export function misspelledWildcards(keys: JsonDocument): readonly string[] {
  return Object.keys(keys).filter((field) => field.includes('*') && !isWildcard(field));
}

function misspelledWarning(field: string): string {
  return field.split('.').some((part) => part.startsWith('$'))
    ? text.wildcards.misplaced(field)
    : text.wildcards.misspelled(field);
}

function wildcardOptions(options: JsonDocument): readonly string[] {
  return [
    ...(options['unique'] === true ? ['unique'] : []),
    ...(options['sparse'] === true ? ['sparse'] : []),
    ...(options['expireAfterSeconds'] !== undefined ? ['TTL'] : []),
  ];
}

/** The warnings about the one wildcard that is not a text index on every field. */
function wildcardFieldWarnings(wildcard: string, definition: IndexDefinition): readonly string[] {
  const { keys, options } = definition;
  const warnings: string[] = [];
  if (keys[wildcard] !== 1 && keys[wildcard] !== -1) {
    warnings.push(text.wildcards.direction(wildcard));
  }
  const refused = wildcardOptions(options);
  if (refused.length > 0) {
    warnings.push(text.wildcards.refused(refused));
  }
  const projection = options['wildcardProjection'] !== undefined;
  if (projection && wildcard !== '$**') {
    warnings.push(text.wildcards.projectionWithPath(wildcard));
  }
  const [other] = Object.keys(keys).filter((field) => !isWildcard(field));
  if (!projection && wildcard === '$**' && other !== undefined) {
    warnings.push(text.wildcards.compound(other));
  }
  return warnings;
}

/** Feature: index.wildcard-checks — the warnings about the wildcards of a definition, in the order of the card. */
export function wildcardWarnings(definition: IndexDefinition): readonly string[] {
  const { keys, options } = normalized(definition);
  const warnings = misspelledWildcards(keys).map(misspelledWarning);
  const wildcards = Object.keys(keys).filter(isWildcard);
  if (wildcards.length > 1) {
    warnings.push(text.wildcards.onlyOne);
  }
  // { "$**": "text" } is a text index on every string field, with the rules of text indexes.
  const [wildcard] = wildcards.filter((field) => keys[field] !== 'text');
  if (wildcard === undefined) {
    return options['wildcardProjection'] !== undefined && wildcards.length === 0
      ? [...warnings, text.wildcards.projectionAlone]
      : warnings;
  }
  return [...warnings, ...wildcardFieldWarnings(wildcard, { keys, options })];
}
