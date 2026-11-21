/**
 * The sample the Validation section of a collection without rules reads (`manage.validation`): 1,000 random documents,
 * summarized by `schema.analyze` as they arrive, so that only the summary reaches the window. A read of its own, named
 * as a variant of the feature that reads it.
 */
import type { Json } from '../../../shared/engine-request';
import type { Context, ReadFeature, ReadRequest } from '../../../shared/feature';
import { connectionId, featureId } from '../../../shared/ids';
import { schemaSummary } from '../../schema/analyze';
import type { FieldSummary } from '../../schema/types';
import type { SampleField, SampleSummary, SampleType } from '../generate-json-schema';
import { isDocument } from '../types';
import { sampleRequest, sampleSize } from '../validation';

/** The identifier the runner knows this read by. */
export const sampleRead = featureId('manage.validation:sample');

function textOf(args: Json, name: string): string {
  const value = isDocument(args) ? args[name] : undefined;
  return typeof value === 'string' ? value : '';
}

/** The request for `{ connection, database, collection }`. */
export function request(_context: Context, args: Json): ReadRequest {
  return {
    kind: 'engine',
    requests: [
      {
        connection: connectionId(textOf(args, 'connection')),
        request: { ...sampleRequest(textOf(args, 'database'), textOf(args, 'collection')), limit: sampleSize },
      },
    ],
  };
}

/** The part of a field's summary `manage.generate-json-schema` reads. */
function sampleField(field: FieldSummary): SampleField {
  const types = field.types.map((type): SampleType => ({
    type: type.type,
    count: type.count,
    ...(type.elements === undefined ? {} : { elements: sampleField(type.elements) }),
  }));
  return {
    name: field.name,
    count: field.count,
    of: field.of,
    types,
    ...(field.fields === undefined ? {} : { fields: field.fields.map(sampleField) }),
  };
}

/** The summary of the documents read, as {@link SampleSummary}. */
export function parse(replies: readonly unknown[]): SampleSummary {
  const [reply] = replies;
  const documents = Array.isArray(reply) ? (reply as Json[]) : [];
  const summary = schemaSummary(documents);
  return { analyzed: summary.analyzed, fields: summary.fields.map(sampleField) };
}

/** The read, as the runner starts it. */
export const feature: ReadFeature = { kind: 'read', id: sampleRead, request, parse };
