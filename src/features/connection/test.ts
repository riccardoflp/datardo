/**
 * Feature: connection.test — tries what the form says, without saving it, and tells the server version and, for a
 * MongoDB connection linked to a Redis one, whether Redis answers.
 */
import type { FormField, ServerInfo, TryReply } from '../../shared/connection';
import type { Json } from '../../shared/engine-request';
import type { Context, Outcome, ReadRequest } from '../../shared/feature';
import { refuse } from '../../shared/feature';
import { connectionId } from '../../shared/ids';
import { serverRefusal } from './connect';
import { connectionFromForm } from './read-form';
import { parse as parseServerInfo } from './server-info';
import { testText } from './text';
import { connectionById, formFromJson, jsonFields, noFileMissing } from './types';

/** How long the test gives the driver to find the server (connection.test). */
export const testTimeLimitMs = 5000;

/** What the form shows after a test: success or failure, its text, and the field it marks. */
export interface TestResult {
  readonly ok: boolean;
  readonly text: string;
  readonly field?: FormField;
  readonly code?: string;
}

/**
 * Feature: connection.test — `args` is `{ form, connection }`, the form and the saved connection it edits (null for a
 * new one). What the form says is checked first, as `connection.read-form` does; the main process then checks the
 * files, opens a client with the saved secrets where a field is empty, reads what the server is, and closes it.
 */
export function request(context: Context, args: Json): ReadRequest | Outcome {
  const fields = jsonFields(args);
  const form = formFromJson(fields['form']);
  if (form === undefined) {
    throw new Error('connection.test needs the fields of the form.');
  }
  const id = typeof fields['connection'] === 'string' ? connectionId(fields['connection']) : undefined;
  const saved = id === undefined ? undefined : connectionById(context, id);
  const read = connectionFromForm(form, saved, noFileMissing);
  if (read.kind === 'refused') {
    return refuse(read.code, read.message);
  }
  return { kind: 'app', action: 'engine.try', args: { form: fields['form'] ?? null, connection: id ?? null } };
}

function successText(info: ServerInfo, host: string, through: string | undefined): string {
  const via = testText.through(through);
  return info.engine === 'mongodb'
    ? testText.mongoConnected(host, via, info.version)
    : testText.redisConnected(host, via, `${info.product} ${info.version}`);
}

/** The codes of connection.test for what connection.connect refuses once the server has answered. */
const testCodes: Readonly<Record<string, string>> = {
  'connection.connect/redis-cluster': 'connection.test/redis-cluster',
  'connection.connect/redis-sentinel': 'connection.test/redis-sentinel',
  'connection.connect/unsupported': 'connection.test/unsupported',
};

function answered(reply: Extract<TryReply, { kind: 'answered' }>): TestResult {
  const info = parseServerInfo(reply.replies, { hosts: reply.host });
  const refusal = serverRefusal(info);
  if (refusal !== undefined) {
    return { ok: false, text: refusal.message, code: testCodes[refusal.code] ?? refusal.code };
  }
  const text = successText(info, reply.host, reply.through);
  if (reply.linked === undefined) {
    return { ok: true, text };
  }
  return reply.linked.reason === undefined
    ? { ok: true, text: `${text} ${testText.redisAnswers(reply.linked.host)}` }
    : { ok: false, text: `${text} ${testText.redisFailed(reply.linked.reason)}`, field: 'linked-connection' };
}

/** Feature: connection.test — the text the form shows, from what the main process answered. */
export function parse(replies: readonly unknown[]): TestResult {
  const reply = replies[0] as TryReply | undefined;
  if (reply === undefined) {
    return { ok: false, text: testText.failed('no answer') };
  }
  switch (reply.kind) {
    case 'refused':
      return { ok: false, text: reply.message, field: reply.field, code: reply.code };
    case 'failed':
      return { ok: false, text: testText.failed(reply.reason) };
    case 'answered':
      return answered(reply);
  }
}
