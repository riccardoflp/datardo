import { describe, expect, it } from 'vitest';
import { view } from '../../../src/features/nav/scope-bar';
import { cacheLocal, input, local, ordersTab, staging } from './inputs';

describe('nav.scope-bar', () => {
  it('on the collection tab of shop.orders of Local shows Back, Forward, the path, Copy path, Pin and Open on another connection', () => {
    const bar = view(input({ connections: [local, staging, cacheLocal], activeTab: ordersTab }));
    expect([bar.back.label, bar.forward.label, bar.path.label]).toEqual(['Back', 'Forward', 'Local / shop / orders']);
    expect([bar.copyPath?.label, bar.pin?.label, bar.openOnAnother?.label]).toEqual([
      'Copy path',
      'Pin',
      'Open on another connection',
    ]);
  });

  it('on Home shows Back, Forward and Home, and nothing else', () => {
    const bar = view(input());
    expect(bar.path.label).toBe('Home');
    expect([bar.copyPath, bar.pin, bar.openOnAnother]).toEqual([undefined, undefined, undefined]);
  });

  it('right after Datardo starts, Back and Forward are both disabled', () => {
    const bar = view(input());
    expect([bar.back.disabled, bar.forward.disabled]).toEqual([true, true]);
  });

  it('on a document tab shows no Pin', () => {
    const document = {
      kind: 'document',
      connection: local.id,
      database: 'shop',
      collection: 'orders',
      id: '65f1…a2c',
    } as const;
    expect(view(input({ connections: [local], activeTab: document })).pin).toBeUndefined();
  });

  it('gives every button a name a screen reader says, and its element', () => {
    const bar = view(input({ connections: [local, staging], activeTab: ordersTab }));
    for (const button of [bar.back, bar.forward, bar.copyPath, bar.pin, bar.openOnAnother]) {
      expect(button?.label).toMatch(/\w/u);
      expect(button?.element).toMatch(/^nav\.[a-z-]+@scope-bar$/u);
    }
  });
});
