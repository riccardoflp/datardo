/**
 * The worked example of `key.export-text`: five keys and the file they give, which `key.import-parse` and `key.import`
 * read back.
 */
import type { ExportedKey } from '../../../src/features/key/export-text';
import { name } from './context';

/** The keys of the worked example of the card. */
export const exampleKeys: readonly ExportedKey[] = [
  { name: name('session:1'), value: { type: 'string', bytes: name('{"user":7}') }, expiresAt: 1_798_761_600_000 },
  {
    name: name('user:7'),
    value: {
      type: 'hash',
      pairs: [
        [name('name'), name('Ada Lovelace')],
        [name('visits'), name('12')],
      ],
    },
  },
  { name: name('queue:mail'), value: { type: 'list', elements: [name('a'), name('c d'), Uint8Array.of(0, 0xff)] } },
  {
    name: name('board'),
    value: {
      type: 'zset',
      members: [
        [name('ada'), '1.5'],
        [name('bob'), '3'],
      ],
    },
  },
  {
    name: name('events'),
    value: {
      type: 'stream',
      entries: [
        {
          id: '1700000000000-0',
          fields: [
            [name('type'), name('signup')],
            [name('user'), name('7')],
          ],
        },
      ],
    },
  },
];

/** The file of the worked example. */
export const exampleFile = [
  'SET session:1 "{\\"user\\":7}"',
  'PEXPIREAT session:1 1798761600000',
  'HSET user:7 name "Ada Lovelace" visits 12',
  'RPUSH queue:mail a "c d" "\\x00\\xff"',
  'ZADD board 1.5 ada 3 bob',
  'XADD events 1700000000000-0 type signup user 7',
].join('\n');
