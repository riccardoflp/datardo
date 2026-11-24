/**
 * The text of `collection_options` (`mcp.data-model-tools`): a collection's definition from its entry of
 * `listCollections`, and its shard key from `config.collections` when it is sharded. With `datardo.mcp.readData` off,
 * the validator is given as field names and types and a view's pipeline as its shape (`mcp.read-data`).
 */
import type { Json } from '../../../shared/engine-request';
import { counted } from '../output-limits';
import { pipelineShape, validatorShape } from '../read-data';
import { numberIn, recordOf, shellText, textIn } from './mongo';

const levels: Readonly<Record<string, string>> = {
  strict: 'every insert and update is validated',
  moderate: 'inserts, and updates of documents that are already valid, are validated',
  off: 'nothing is validated',
};

const actions: Readonly<Record<string, string>> = {
  error: 'invalid writes are refused (error 121, Document failed validation)',
  warn: 'invalid writes are accepted and logged',
  errorAndLog: 'invalid writes are refused and logged',
};

/** `validationLevel: strict (default): every insert and update is validated.` and the line of the action. */
export function validationLines(level: string | undefined, action: string | undefined): readonly string[] {
  const shownLevel = level ?? 'strict';
  const shownAction = action ?? 'error';
  const levelWords = levels[shownLevel];
  const actionWords = actions[shownAction];
  return [
    `validationLevel: ${shownLevel}${level === undefined ? ' (default)' : ''}${levelWords === undefined ? '' : `: ${levelWords}`}.`,
    `validationAction: ${shownAction}${action === undefined ? ' (default)' : ''}${actionWords === undefined ? '' : `: ${actionWords}`}.`,
  ];
}

function kindOf(entry: Readonly<Record<string, unknown>>, options: Readonly<Record<string, unknown>>): string {
  if (entry['type'] === 'view') {
    return 'a view';
  }
  if (options['timeseries'] !== undefined || entry['type'] === 'timeseries') {
    return 'a time series collection';
  }
  const capped = options['capped'] === true ? ' capped' : '';
  const clustered = options['clusteredIndex'] === undefined ? '' : ' clustered';
  return `a${capped}${clustered} collection`;
}

function validatorLines(
  options: Readonly<Record<string, unknown>>,
  view: boolean,
  readData: boolean,
): readonly string[] {
  const validator = recordOf(options['validator']);
  const keys = Object.keys(validator);
  if (keys.length === 0) {
    return view ? [] : ['', 'No validator: any document is accepted.'];
  }
  const what = keys.includes('$jsonSchema') ? (keys.length > 1 ? '$jsonSchema and query' : '$jsonSchema') : 'query';
  return [
    '',
    readData
      ? `Validator (${what}): ${shellText(validator)}`
      : `Validator (${what}; field names and types only, datardo.mcp.readData is off): ${validatorShape(validator as Json)}`,
    ...validationLines(textIn(options['validationLevel']), textIn(options['validationAction'])),
  ];
}

function otherLines(options: Readonly<Record<string, unknown>>): readonly string[] {
  const lines: string[] = [];
  if (options['capped'] === true) {
    const size = numberIn(options['size']);
    const most = numberIn(options['max']);
    lines.push(
      '',
      `Capped: ${size === undefined ? 'size unknown' : counted(size, 'byte')}${most === undefined || most === 0 ? '' : `, at most ${counted(most, 'document')}`}; the oldest documents are removed to make room, and documents can't be deleted.`,
    );
  }
  const timeseries = recordOf(options['timeseries']);
  if (options['timeseries'] !== undefined) {
    const meta = textIn(timeseries['metaField']);
    const granularity = textIn(timeseries['granularity']);
    lines.push(
      '',
      `Time series: timeField ${textIn(timeseries['timeField']) ?? '?'}${meta === undefined ? '' : `, metaField ${meta}`}${granularity === undefined ? '' : `, granularity ${granularity}`}.`,
    );
  }
  if (options['clusteredIndex'] !== undefined && options['timeseries'] === undefined) {
    lines.push(
      '',
      `Clustered index: ${shellText(recordOf(options['clusteredIndex'])['key'] ?? { _id: 1 })} (documents are stored in _id order).`,
    );
  }
  const expire = numberIn(options['expireAfterSeconds']);
  if (expire !== undefined) {
    lines.push(
      '',
      `expireAfterSeconds: ${String(expire)}: documents are deleted that long after their ${textIn(timeseries['timeField']) ?? '_id'} date.`,
    );
  }
  if (options['collation'] !== undefined) {
    lines.push('', `Default collation (of its queries and indexes): ${shellText(options['collation'])}`);
  }
  const images = options['changeStreamPreAndPostImages'];
  if (images !== undefined) {
    lines.push(
      '',
      `Change stream pre- and post-images: ${recordOf(images)['enabled'] === true ? 'enabled' : 'disabled'}.`,
    );
  }
  return lines;
}

function pipelineLine(pipeline: unknown, readData: boolean): string {
  return readData
    ? `Pipeline: ${shellText(pipeline)}`
    : `Pipeline (values replaced by ?, datardo.mcp.readData is off): ${pipelineShape(pipeline as Json)}`;
}

/**
 * The text of `collection_options`, from the entry of `listCollections` and the document of `config.collections`;
 * without `readData` the validator and the view's pipeline are given without their values.
 */
export function optionsText(
  name: string,
  entry: Readonly<Record<string, unknown>>,
  sharded: unknown,
  readData: boolean,
): string {
  const options = recordOf(entry['options']);
  const view = entry['type'] === 'view';
  const lines = [`${name} is ${kindOf(entry, options)}.`];
  if (view) {
    lines.push(`View on: ${textIn(options['viewOn']) ?? '?'}`, pipelineLine(options['pipeline'] ?? [], readData));
  }
  lines.push(...validatorLines(options, view, readData), ...otherLines(options));
  const key = recordOf(sharded)['key'];
  if (key !== undefined) {
    lines.push('', `Sharded, shard key ${shellText(key)}${recordOf(sharded)['unique'] === true ? ' (unique)' : ''}.`);
  }
  return lines.join('\n');
}
