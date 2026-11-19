/**
 * Feature: index.search-checks
 *
 * The checks Datardo makes before sending a search index, and how a refusal of the server is said: a server without
 * search and one that cannot reach mongot are told apart from a real error.
 */
import { text } from './text';
import { isDocument, type SearchIndexType, type ServerError } from './types';

/** The name an index gets when none is typed, by type. */
export const defaultSearchNames: Readonly<Record<SearchIndexType, string>> = {
  search: 'default',
  vectorSearch: 'vector_index',
};

/** The codes of a server without search: SearchNotEnabled, CommandNotFound, CommandNotSupported, unknown stages. */
const unsupportedCodes = new Set([31082, 59, 115, 40324, 6047401]);
const unsupportedText =
  /requires additional configuration|only supported (with|on) (MongoDB )?Atlas|Unrecognized pipeline stage name: '\$listSearchIndexes'|no such command: '(create|update|drop)SearchIndex|search index commands are not supported|mongot/iu;

/** SearchIndexManagementHostUnreachable: the server has search set up, but its mongot does not answer. */
const unreachableCodes = new Set([508]);
const unreachableText =
  /Error connecting to Search Index Management service|SearchIndexManagementHostUnreachable|connectivity of gRPC channel/iu;

/** Feature: index.search-checks — the type of a definition by its shape; `undefined` when it has neither. */
export function definitionType(definition: unknown): SearchIndexType | undefined {
  if (!isDocument(definition)) {
    return undefined;
  }
  if (isDocument(definition['mappings'])) {
    return 'search';
  }
  return Array.isArray(definition['fields']) ? 'vectorSearch' : undefined;
}

/** Feature: index.search-checks — why a definition of the other type is refused; `undefined` when it fits. */
export function typeMismatch(type: SearchIndexType, definition: unknown): string | undefined {
  const actual = definitionType(definition);
  if (actual === undefined || actual === type) {
    return undefined;
  }
  return type === 'search' ? text.search.searchMismatch : text.search.vectorMismatch;
}

/** Feature: index.search-checks — the error says the server cannot reach mongot now (rule 5). */
export function isSearchUnreachable(error: ServerError): boolean {
  return (
    (typeof error.code === 'number' && unreachableCodes.has(error.code)) ||
    error.codeName === 'SearchIndexManagementHostUnreachable' ||
    unreachableText.test(error.message)
  );
}

/** Feature: index.search-checks — the error says the server has no search (rule 4), and not rule 5. */
export function isSearchUnsupported(error: ServerError): boolean {
  if (isSearchUnreachable(error)) {
    return false;
  }
  return (typeof error.code === 'number' && unsupportedCodes.has(error.code)) || unsupportedText.test(error.message);
}

/**
 * Feature: index.search-checks — a validation error of mongot without the path of the command it was in:
 * `"userCommand.indexes[0].mappings" is required` is `"mappings" is required`.
 */
export function searchErrorText(message: string): string {
  return message.replace(/"userCommand\.indexes\[\d+\]\./gu, '"');
}

/** The error of a search index command as the dialog and the list show it: with what the server lacks, if it does. */
export function explainedSearchError(error: ServerError): string {
  const message = searchErrorText(error.message);
  if (isSearchUnreachable(error)) {
    return `${text.search.unreachableHelp}\n${message}`;
  }
  return isSearchUnsupported(error) ? `${text.search.unsupportedHelp}\n${message}` : message;
}

/** The type of an index of `$listSearchIndexes`: the server's when it says one, otherwise told from the definition. */
export function searchIndexType(type: unknown, definition: unknown): string {
  return typeof type === 'string' && type !== '' ? type : (definitionType(definition) ?? 'search');
}
