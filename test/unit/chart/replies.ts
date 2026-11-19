/**
 * The replies of `chart.draw` recorded from MongoDB 8.2 (`test/fixtures/replies/`, R11.3), as the engine gives them
 * back: the documents of the aggregation in canonical Extended JSON. `test/integration/chart/record-replies.test.ts`
 * says the documents and the chart of each.
 */
import { mongoReply } from '../connection/replies';
import type { Json } from '../../../src/shared/engine-request';

/** The rows of a recorded chart: `bar-tags`, `histogram-4-bins`, … */
export function chartRows(name: string): readonly Json[] {
  const reply = mongoReply(`mongodb-8.2-chart-${name}`);
  if (!Array.isArray(reply)) {
    throw new Error(`The recorded reply ${name} is not a list of documents.`);
  }
  return reply as readonly Json[];
}

/** An Int32 of canonical Extended JSON. */
export function int(value: number): Json {
  return { $numberInt: String(value) };
}

/** A date of canonical Extended JSON. */
export function date(iso: string): Json {
  return { $date: { $numberLong: String(Date.parse(iso)) } };
}
