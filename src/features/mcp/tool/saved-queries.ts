/**
 * The text of `list_saved_queries` (`mcp.data-model-tools`): the saved queries of a collection, those in the queries
 * folder first with their file, then those for me, and the recent ones, newest first, each with its texts. With
 * `datardo.mcp.readData` off the literal values are written `?`; names, descriptions and files stay.
 */
import type { CollectionQueries } from '../../saved-query/list';
import type { QueryText, SavedQuery } from '../../saved-query/types';
import { parsedValue } from '../../query/parse';
import { shapeOf, hiddenValue } from '../read-data';
import { utcText } from './mongo';

function shown(text: string, readData: boolean): string {
  if (readData) {
    return text;
  }
  const parsed = parsedValue(text, 0, () => '0'.repeat(24));
  return parsed.ok
    ? Array.isArray(parsed.value)
      ? `[ ${parsed.value.map(shapeOf).join(', ')} ]`
      : shapeOf(parsed.value)
    : hiddenValue;
}

/** The lines of a query's texts: `filter: …`, `sort: …`, `projection: …`, or `pipeline: …`. */
export function queryLines(query: QueryText, readData: boolean): readonly string[] {
  if (query.kind === 'pipeline') {
    const stages = query.stages.filter((stage) => stage.enabled).map((stage) => `{ ${stage.name}: ${stage.body} }`);
    return [`  pipeline: ${shown(`[ ${stages.join(', ')} ]`, readData)}`];
  }
  return [
    ...(query.filter.trim() === '' ? [] : [`  filter: ${shown(query.filter, readData)}`]),
    ...(query.sort.trim() === '' ? [] : [`  sort: ${query.sort}`]),
    ...(query.projection.trim() === '' ? [] : [`  projection: ${query.projection}`]),
  ];
}

function savedLine(query: SavedQuery): string {
  const description = query.description === undefined ? '' : ` (${query.description})`;
  return query.place === 'folder'
    ? `- ${JSON.stringify(query.name)}${description}, in the folder: ${query.file}`
    : `- ${JSON.stringify(query.name)}${description}, saved for the user ${utcText(query.at)}`;
}

/** The text of the list; `No saved or recent queries for shop.orders on Local.` when there are none. */
export function savedQueriesText(queries: CollectionQueries, readData: boolean): string {
  const namespace = `${queries.database}.${queries.collection}`;
  if (queries.saved.length === 0 && queries.recent.length === 0) {
    return `No saved or recent queries for ${namespace} on ${queries.connectionName}.`;
  }
  const saved = [...queries.saved].sort((one, other) =>
    one.place === other.place ? 0 : one.place === 'folder' ? -1 : 1,
  );
  const recent = [...queries.recent].sort((one, other) => other.at - one.at);
  return [
    `Saved and recent queries of ${namespace} on ${queries.connectionName}:`,
    ...(saved.length === 0
      ? []
      : ['', 'Saved:', ...saved.flatMap((query) => [savedLine(query), ...queryLines(query.query, readData)])]),
    ...(recent.length === 0
      ? []
      : [
          '',
          'Recent, newest first:',
          ...recent.flatMap((each) => [`- ran ${utcText(each.at)}`, ...queryLines(each.query, readData)]),
        ]),
  ].join('\n');
}
