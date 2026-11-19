/**
 * Feature: server.read-config
 *
 * The parameters of the server and their values (`CONFIG GET *`), sorted by name, with the secrets masked as soon as
 * the reply is read, in the main process: the value of a password never reaches the window process, the Log, the
 * clipboard or an AI assistant. An empty secret stays empty, so that the page can say that no password is set.
 */
import type { Json } from '../../shared/engine-request';
import type { Context, ReadRequest } from '../../shared/feature';
import { connectionId } from '../../shared/ids';
import { partOf } from './unavailable';
import { pairsOf, serverCommand, textArg, textOf, type PartRead } from './types';
import { isSecretParameter } from '../console/secret-arguments';

export { isSecretParameter };

/** The command as the page sends it, for `server.unavailable`. */
export const configCommand = 'CONFIG GET';

/** What a secret's value is written as. */
export const maskedValue = '***';

/** A parameter of the server and its value as text; a secret that is set is `***`. */
export interface ConfigParameter {
  readonly name: string;
  readonly value: string;
  readonly secret: boolean;
}

/** Feature: server.read-config — `CONFIG GET *`, with `{ connection }`. */
export function request(_context: Context, args: Json): ReadRequest {
  return {
    kind: 'engine',
    requests: [{ connection: connectionId(textArg(args, 'connection')), request: serverCommand('CONFIG', 'GET', '*') }],
  };
}

/** The parameters of a reply (a map on RESP3, a flat array on RESP2), sorted by name, the secrets masked. */
export function parametersOf(reply: unknown): readonly ConfigParameter[] {
  return pairsOf(reply)
    .map(([name, value]): ConfigParameter => {
      const secret = isSecretParameter(name);
      const text = textOf(value);
      return { name, value: secret && text !== '' ? maskedValue : text, secret };
    })
    .sort((one, other) => (one.name < other.name ? -1 : one.name > other.name ? 1 : 0));
}

/** Feature: server.read-config — the parameters, or the sentence of `server.unavailable` when `CONFIG GET` was refused. */
export function parse(replies: readonly unknown[]): PartRead<readonly ConfigParameter[]> {
  return partOf(configCommand, replies[0], parametersOf);
}
