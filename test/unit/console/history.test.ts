import { describe, expect, it } from 'vitest';
import { browseHistory, historyAfter, notBrowsing, type HistoryBrowsing } from '../../../src/features/console/history';
import { commandArguments } from '../../../src/features/console/parse-line';
import { secretArguments } from '../../../src/features/console/secret-arguments';

function sent(history: readonly string[], line: string, size = 500): readonly string[] {
  const read = commandArguments(line.trim());
  return historyAfter(history, line, read.kind === 'arguments' ? secretArguments(read.arguments) : [], size);
}

describe('console.history', () => {
  it('gives each row of the table its history', () => {
    expect(sent([], 'GET greeting')).toEqual(['GET greeting']);
    expect(sent(['GET greeting'], 'GET greeting')).toEqual(['GET greeting']);
    expect(sent(['GET greeting'], '  SET a 1  ')).toEqual(['GET greeting', 'SET a 1']);
    expect(sent(['GET greeting', 'SET a 1'], 'GET greeting')).toEqual(['GET greeting', 'SET a 1', 'GET greeting']);
    expect(sent(['GET greeting'], 'AUTH app s3cret')).toEqual(['GET greeting']);
    expect(sent(['GET greeting'], 'CONFIG SET requirepass s3cret')).toEqual(['GET greeting']);
    expect(sent(['GET greeting'], 'CONFIG SET maxmemory 1gb')).toEqual(['GET greeting', 'CONFIG SET maxmemory 1gb']);
    expect(sent(['a', 'b'], 'c', 2)).toEqual(['b', 'c']);
    expect(sent(['a', 'b'], 'c', 0)).toEqual([]);
  });

  it('never keeps an AUTH, a HELLO with AUTH, or a line that holds a secret', () => {
    expect(sent([], 'AUTH')).toEqual([]);
    expect(sent([], 'hello 3 auth app s3cret')).toEqual([]);
    expect(sent([], 'ACL SETUSER app on >s3cret')).toEqual([]);
    expect(sent([], 'SET k "never closed')).toEqual([]);
  });

  it('after GET a, GET b, GET c: Up, Up shows GET b; Down shows GET c; Down again shows the empty input', () => {
    const history = ['GET a', 'GET b', 'GET c'];
    let browsing: HistoryBrowsing = notBrowsing;
    let line = '';
    for (const direction of ['older', 'older'] as const) {
      ({ browsing, line } = browseHistory(history, browsing, line, direction));
    }
    expect(line).toBe('GET b');
    ({ browsing, line } = browseHistory(history, browsing, line, 'newer'));
    expect(line).toBe('GET c');
    ({ browsing, line } = browseHistory(history, browsing, line, 'newer'));
    expect(line).toBe('');
    expect(browsing).toEqual(notBrowsing);
  });

  it('with GET x typed and not run, Up then Down shows GET x again', () => {
    const up = browseHistory(['GET a'], notBrowsing, 'GET x', 'older');
    expect(up.line).toBe('GET a');
    expect(browseHistory(['GET a'], up.browsing, up.line, 'newer').line).toBe('GET x');
  });

  it('keeps the history of each connection apart: the history is the input, per connection', () => {
    const local = sent([], 'GET local');
    expect(browseHistory([], notBrowsing, '', 'older').line).toBe('');
    expect(browseHistory(local, notBrowsing, '', 'older').line).toBe('GET local');
  });
});
