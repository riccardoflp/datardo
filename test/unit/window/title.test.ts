import { describe, expect, it } from 'vitest';
import { windowTitle } from '../../../src/features/window/title';

describe('window.title', () => {
  it('names the collection tab of orders on Local "orders — Local — Datardo"', () => {
    expect(windowTitle({ title: 'orders', connection: 'Local' })).toBe('orders — Local — Datardo');
  });

  it('names the Home tab "Home — Datardo"', () => {
    expect(windowTitle({ title: 'Home' })).toBe('Home — Datardo');
  });

  it('names the key tab of session:9f2c on Cache local', () => {
    expect(windowTitle({ title: 'session:9f2c', connection: 'Cache local' })).toBe(
      'session:9f2c — Cache local — Datardo',
    );
  });

  it('is "Datardo" when no tab is active', () => {
    expect(windowTitle(undefined)).toBe('Datardo');
  });

  it('holds nothing but the tab title and the connection name: no host, user, password or query', () => {
    const title = windowTitle({ title: 'orders', connection: 'Local' });
    expect(title).not.toMatch(/mongodb:|@|password|\{/u);
  });
});
