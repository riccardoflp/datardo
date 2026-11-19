import { describe, expect, it } from 'vitest';
import { lineWithSuggestion, suggestions, type Opening } from '../../../src/features/console/autocomplete';
import { builtinCommands, builtinDocs } from '../../../src/features/console/command-docs';
import type { CommandDoc } from '../../../src/features/console/types';

/** The suggestions for a line whose caret is `|`. */
function offered(
  line: string,
  opening: Opening = 'typing',
  docs: readonly CommandDoc[] = builtinCommands,
): readonly string[] {
  const caret = line.indexOf('|');
  const list = suggestions(line.replace('|', ''), caret, docs, opening);
  return list === undefined ? [] : list.items.map((item) => item.name);
}

describe('console.autocomplete', () => {
  it('gives each row of the table its suggestions', () => {
    expect(offered('ge|')).toEqual([
      'GEOADD',
      'GEODIST',
      'GEOHASH',
      'GEOPOS',
      'GEOSEARCH',
      'GEOSEARCHSTORE',
      'GET',
      'GETBIT',
      'GETDEL',
      'GETEX',
      'GETRANGE',
      'GEORADIUS',
      'GEORADIUSBYMEMBER',
      'GEORADIUSBYMEMBER_RO',
      'GEORADIUS_RO',
      'GETSET',
    ]);
    expect(offered('GETR|')).toEqual(['GETRANGE']);
    expect(offered('config |')).toEqual(['GET', 'HELP', 'RESETSTAT', 'REWRITE', 'SET']);
    expect(offered('config re|')).toEqual(['RESETSTAT', 'REWRITE']);
    expect(offered('GET gre|')).toEqual([]);
    expect(offered('SET k "ge|')).toEqual([]);
    const every = offered('|', 'asked');
    expect(every.length).toBe(builtinCommands.length);
    expect(every.slice(0, 3)).toEqual(['ACL', 'APPEND', 'ASKING']);
    expect(suggestions('zz', 2, builtinCommands)).toBeUndefined();
    expect(suggestions('', 0, builtinCommands)).toBeUndefined();
  });

  it('marks a deprecated command with what replaces it', () => {
    const list = suggestions('subs', 4, builtinCommands);
    expect(list?.items).toEqual([
      expect.objectContaining({ name: 'SUBSCRIBE' }),
      expect.objectContaining({ name: 'SUBSTR', deprecated: 'deprecated since 2.0.0: use GETRANGE' }),
    ]);
  });

  it('takes GETRANGE after getr into the line `GETRANGE `, the caret after the space', () => {
    const list = suggestions('getr', 4, builtinCommands);
    const chosen = list?.items[0];
    expect(list === undefined || chosen === undefined ? undefined : lineWithSuggestion('getr', list, chosen)).toEqual({
      line: 'GETRANGE ',
      caret: 9,
    });
  });

  it('takes REWRITE after config re into the line `config REWRITE `', () => {
    const list = suggestions('config re', 9, builtinCommands);
    const chosen = list?.items.find((item) => item.name === 'REWRITE');
    expect(
      list === undefined || chosen === undefined ? undefined : lineWithSuggestion('config re', list, chosen),
    ).toEqual({ line: 'config REWRITE ', caret: 15 });
  });

  it('does not list FCALL on Ctrl+Space on a Redis 6.2 server', () => {
    expect(offered('|', 'asked', builtinDocs('6.2.14').commands)).not.toContain('FCALL');
    expect(offered('|', 'asked', builtinDocs('7.2.4').commands)).toContain('FCALL');
  });
});
