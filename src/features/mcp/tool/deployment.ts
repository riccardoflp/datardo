/**
 * What `hello` and `buildInfo` tell about a MongoDB deployment, read in one round by the tools that depend on it:
 * a standalone server, a replica set member or a mongos, and the server's version.
 */
import type { ConnectionView } from '../../../shared/connection';
import { replyOrProblem, type ToolSession } from './program';
import { mongoCommand, recordOf, textIn } from './mongo';
import { isFailed } from '../types';

/** The deployment as `hello` and `buildInfo` describe it. */
export interface Deployment {
  readonly hello: Readonly<Record<string, unknown>>;
  /** `buildInfo`, empty when it could not be read. */
  readonly build: Readonly<Record<string, unknown>>;
  readonly kind: 'standalone' | 'replica-set' | 'mongos';
  readonly setName?: string;
  /** The version, `8.0.4`, or `undefined` when `buildInfo` could not be read. */
  readonly version?: string;
  /** The major version, 0 when unknown. */
  readonly major: number;
}

/** The kind of a deployment from its `hello`. */
export function deploymentKind(hello: Readonly<Record<string, unknown>>): Deployment['kind'] {
  if (hello['msg'] === 'isdbgrid') {
    return 'mongos';
  }
  return textIn(hello['setName']) === undefined ? 'standalone' : 'replica-set';
}

/** The major version of `8.0.4`: 8; 0 when unknown. */
export function majorOf(version: string | undefined): number {
  const major = Number.parseInt(version ?? '', 10);
  return Number.isNaN(major) ? 0 : major;
}

/** The deployment of a connection: `hello` must answer, `buildInfo` may fail. */
export function deploymentOf(session: ToolSession, connection: ConnectionView): Deployment {
  const place = { connection: connection.id, database: 'admin' };
  const [hello, build] = session.send([mongoCommand(place, { hello: 1 }), mongoCommand(place, { buildInfo: 1 })]);
  const helloReply = recordOf(replyOrProblem(hello, `${connection.name} did not answer hello: `));
  const buildReply = isFailed(build) ? {} : recordOf(build);
  const version = textIn(buildReply['version']);
  const setName = textIn(helloReply['setName']);
  return {
    hello: helloReply,
    build: buildReply,
    kind: deploymentKind(helloReply),
    ...(setName === undefined ? {} : { setName }),
    ...(version === undefined ? {} : { version }),
    major: majorOf(version),
  };
}

/** Whether a failed reply says that the user lacks a privilege: code 13 or the server's words. */
export function notAuthorized(reply: unknown): boolean {
  if (!isFailed(reply)) {
    return false;
  }
  return reply.code === 13 || reply.code === 'Unauthorized' || /not authorized|unauthorized/iu.test(reply.message);
}

/** The code of a failed reply as a number, when it has one. */
export function codeOf(reply: unknown): number | undefined {
  if (!isFailed(reply)) {
    return undefined;
  }
  return typeof reply.code === 'number' ? reply.code : undefined;
}
