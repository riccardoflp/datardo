import { describe, expect, it } from 'vitest';
import { commandArguments } from '../../../src/features/console/parse-line';
import { maskedArguments, maskedLine, secretArguments } from '../../../src/features/console/secret-arguments';
import { commandLine } from '../../../src/features/console/types';

function argumentsOf(line: string): readonly Uint8Array[] {
  const read = commandArguments(line);
  return read.kind === 'arguments' ? read.arguments : [];
}

const rows: readonly (readonly [string, readonly number[], string])[] = [
  ['AUTH s3cret', [1], 'AUTH ***'],
  ['auth app s3cret', [2], 'auth app ***'],
  ['HELLO 3 AUTH app s3cret SETNAME cli', [4], 'HELLO 3 AUTH app *** SETNAME cli'],
  [
    'MIGRATE 10.0.0.5 6379 "" 0 5000 AUTH2 app s3cret KEYS orders:1 AUTH',
    [8],
    'MIGRATE 10.0.0.5 6379 "" 0 5000 AUTH2 app *** KEYS orders:1 AUTH',
  ],
  ['CONFIG SET requirepass s3cret', [3], 'CONFIG SET requirepass ***'],
  ['CONFIG SET maxmemory 1gb masterauth s3cret', [5], 'CONFIG SET maxmemory 1gb masterauth ***'],
  ['CONFIG SET maxmemory 1gb', [], 'CONFIG SET maxmemory 1gb'],
  ['ACL SETUSER app on >s3cret ~orders:* +get', [4], 'ACL SETUSER app on *** ~orders:* +get'],
  ['GET AUTH', [], 'GET AUTH'],
  ['AUTH', [], 'AUTH'],
];

describe('console.secret-arguments', () => {
  it('gives each row of the table its positions and its text', () => {
    for (const [line, positions, shown] of rows) {
      expect(secretArguments(argumentsOf(line)), line).toEqual(positions);
      expect(maskedLine(line), line).toBe(shown);
    }
  });

  it('never leaves s3cret in the text of the step the confirmation and the Log show', () => {
    for (const [line] of rows) {
      expect(commandLine(maskedArguments(argumentsOf(line)))).not.toContain('s3cret');
    }
    expect(commandLine(maskedArguments(argumentsOf('auth app s3cret')))).toBe('auth app ***');
  });

  it('does not mask the key AUTH of the MIGRATE example, after KEYS, and it masks nothing', () => {
    const line = 'MIGRATE 10.0.0.5 6379 "" 0 5000 KEYS orders:1 AUTH';
    expect(secretArguments(argumentsOf(line))).toEqual([]);
    expect(secretArguments(argumentsOf('MIGRATE h 6379 "" 0 5000 AUTH pw KEYS AUTH x'))).toEqual([7]);
  });

  it('marks the values of every parameter that ends as a password, and the rules of a password of ACL SETUSER', () => {
    expect(
      secretArguments(argumentsOf('CONFIG SET tls-key-file-pass a tls-client-key-file-pass b x-secret c')),
    ).toEqual([3, 5, 7]);
    expect(secretArguments(argumentsOf('acl setuser app <old #abc !def on'))).toEqual([3, 4, 5]);
  });

  it('finds no secret at a position the command does not have', () => {
    expect(secretArguments(argumentsOf('HELLO 3 AUTH app'))).toEqual([]);
    expect(secretArguments(argumentsOf('CONFIG SET requirepass'))).toEqual([]);
    expect(secretArguments(argumentsOf("EVAL \"redis.call('AUTH', 's3cret')\" 0"))).toEqual([]);
  });
});
