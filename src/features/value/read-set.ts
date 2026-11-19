/**
 * Feature: value.read-set — reads the members of a set a page at a time with `SSCAN`, all of them or those that match
 * the filter. A run stops as for a hash (`value.read-hash`): at cursor 0, at 200 members found or after 100 calls.
 */
import type { Json } from '../../shared/engine-request';
import type { Context, ReadRequest } from '../../shared/feature';
import { scanArgs, scanCommand, scanReply, type ScanPage } from './read-hash';
import { engineRead, keyOf } from './types';

/** Feature: value.read-set — one `SSCAN`, from `args.cursor`, with `args.filter` as a pattern. */
export function request(context: Context, args: Json): ReadRequest {
  const at = keyOf(context);
  return engineRead(at, [scanCommand('SSCAN', at.key, scanArgs(args))]);
}

/** Feature: value.read-set — the next cursor and the members of the reply, as bytes. */
export function parse(replies: readonly unknown[]): ScanPage<Uint8Array> {
  const { cursor, words } = scanReply(replies[0]);
  return { cursor, items: words };
}
