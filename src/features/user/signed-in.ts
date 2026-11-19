/**
 * Feature: user.signed-in
 *
 * Who the connection is signed in as: `db.adminCommand({ connectionStatus: 1 })`, its `authInfo.authenticatedUsers`
 * and `authInfo.authenticatedUserRoles`, both empty on a connection that did not sign in. The page says it in one line;
 * `user.change-password`, `user.revoke-role` and `user.delete` read it to know whether a user is the connection's
 * own, and take "no" for an answer when the read fails: the question never stops a write. Started with
 * `{ connection }`. Ported from Mongoster's `me`.
 */
import type { Json } from '../../shared/engine-request';
import type { Context, ReadFeature, ReadRequest } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { text } from './text';
import {
  commandRequest,
  connectionOfArgs,
  isRecord,
  one,
  recordsOf,
  roleKey,
  textOf,
  userKey,
  type SignedInUser,
} from './types';

/** Feature: user.signed-in — `connectionStatus: 1` to `admin`. */
export function request(context: Context, args: Json): Extract<ReadRequest, { kind: 'engine' }> {
  const connection = connectionOfArgs(args, context);
  return { kind: 'engine', requests: [{ connection, request: commandRequest('admin', { connectionStatus: one }) }] };
}

/** Feature: user.signed-in — the users and the roles the connection signed in with. */
export function parse(replies: readonly unknown[]): SignedInUser {
  const reply = replies[0];
  const authInfo = isRecord(reply) && isRecord(reply['authInfo']) ? reply['authInfo'] : {};
  return {
    users: recordsOf(authInfo['authenticatedUsers']).map((user) => ({
      user: textOf(user, 'user') ?? '',
      db: textOf(user, 'db') ?? '',
    })),
    roles: recordsOf(authInfo['authenticatedUserRoles']).map((role) => ({
      role: textOf(role, 'role') ?? '',
      db: textOf(role, 'db') ?? '',
    })),
  };
}

/** What the read gave: who the connection is signed in as, or the server's message when it failed. */
export type SignedInRead =
  { readonly kind: 'read'; readonly signedIn: SignedInUser } | { readonly kind: 'failed'; readonly message: string };

/**
 * The line of the page: *Connected as app@admin · roles readWrite@shop*, *Connected without signing in: …*, or
 * *Signed-in user unknown: <the server's message>*.
 */
export function signedInText(read: SignedInRead): string {
  if (read.kind === 'failed') {
    return text.signedIn.unknown(read.message);
  }
  if (read.signedIn.users.length === 0) {
    return text.signedIn.anonymous;
  }
  return text.signedIn.as(read.signedIn.users.map(userKey).join(', '), read.signedIn.roles.map(roleKey).join(', '));
}

/** What a write asks: the result of the read under `key` of its answers; `undefined` when it failed or is missing. */
export function signedInOf(value: unknown): SignedInUser | undefined {
  if (!isRecord(value) || !Array.isArray(value['users'])) {
    return undefined;
  }
  return parse([{ authInfo: { authenticatedUsers: value['users'], authenticatedUserRoles: value['roles'] ?? [] } }]);
}

/** The feature, as the runner starts it. */
export const feature: ReadFeature = { kind: 'read', id: featureId('user.signed-in'), request, parse };
