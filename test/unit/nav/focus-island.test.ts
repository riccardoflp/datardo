import { describe, expect, it } from 'vitest';
import { islandOrder, nextIsland, type FocusIsland } from '../../../src/features/nav/focus-island';

const everything = [...islandOrder];

describe('nav.focus-island', () => {
  it('everything shown, from the tree island forward, goes to the main island', () => {
    expect(nextIsland(everything, 'tree', 'next')).toBe('main');
  });

  it('explorer hidden, from the rail forward, goes to the main island', () => {
    expect(nextIsland(['rail', 'main', 'inspector', 'status'], 'rail', 'next')).toBe('main');
  });

  it('inspector hidden, from the main island forward, goes to the status line', () => {
    expect(nextIsland(['rail', 'connection', 'tree', 'main', 'status'], 'main', 'next')).toBe('status');
  });

  it('from the status line forward goes to the rail, and from the rail backward to the status line', () => {
    expect(nextIsland(everything, 'status', 'next')).toBe('rail');
    expect(nextIsland(everything, 'rail', 'previous')).toBe('status');
  });

  it('from the top bar or nowhere, forward goes to the rail and backward to the status line', () => {
    expect(nextIsland(everything, undefined, 'next')).toBe('rail');
    expect(nextIsland(everything, undefined, 'previous')).toBe('status');
  });

  it('six presses from the rail visit every part and come back to the rail', () => {
    const visited: (FocusIsland | undefined)[] = [];
    let at: FocusIsland | undefined = 'rail';
    for (let press = 0; press < 6; press += 1) {
      at = nextIsland(everything, at, 'next');
      visited.push(at);
    }
    expect(visited).toEqual(['connection', 'tree', 'main', 'inspector', 'status', 'rail']);
  });

  it('with the explorer and the inspector hidden alternates between the rail, the main island and the status line', () => {
    const shown: FocusIsland[] = ['rail', 'main', 'status'];
    expect(nextIsland(shown, 'rail', 'next')).toBe('main');
    expect(nextIsland(shown, 'main', 'next')).toBe('status');
    expect(nextIsland(shown, 'status', 'next')).toBe('rail');
  });

  it('reaches every part shown in at most five presses', () => {
    for (const from of everything) {
      for (const to of everything.filter((part) => part !== from)) {
        let at: FocusIsland | undefined = from;
        let presses = 0;
        while (at !== to && presses < 10) {
          at = nextIsland(everything, at, 'next');
          presses += 1;
        }
        expect(presses).toBeLessThanOrEqual(5);
      }
    }
  });
});
