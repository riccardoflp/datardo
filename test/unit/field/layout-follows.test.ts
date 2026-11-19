import { describe, expect, it } from 'vitest';
import { renamedKey, renamedLayout } from '../../../src/features/field/layout-follows';

describe('field.layout-follows', () => {
  it('renames a key below the field', () => {
    expect(renamedKey('addr.city', 'addr', 'address')).toBe('address.city');
  });

  it('keeps another key, also one that only starts with the same letters', () => {
    expect(renamedKey('name', 'addr', 'address')).toBe('name');
    expect(renamedKey('address', 'addr', 'location')).toBe('address');
  });

  it('drops a removed key', () => {
    expect(renamedKey('tmp', 'tmp')).toBeUndefined();
  });

  it('unpins a field moved below the top level', () => {
    const layout = renamedLayout({ pinned: ['name', 'email'] }, 'name', 'info.name');
    expect(layout.pinned).toEqual(['email']);
  });

  it('keeps a hidden column hidden under its new name, with the same width', () => {
    const layout = renamedLayout({ hidden: ['name'], widths: { name: 180, email: 90 } }, 'name', 'fullName');
    expect(layout).toEqual({ hidden: ['fullName'], widths: { fullName: 180, email: 90 } });
  });

  it('keeps the place and the pin of a renamed column', () => {
    const layout = renamedLayout({ order: ['email', 'name'], pinned: ['name'] }, 'name', 'fullName');
    expect(layout).toEqual({ order: ['email', 'fullName'], pinned: ['fullName'] });
  });

  it('keeps an expanded column expanded under its new name', () => {
    const layout = renamedLayout({ expanded: ['addr'], widths: { 'addr.city': 120 } }, 'addr', 'address');
    expect(layout).toEqual({ expanded: ['address'], widths: { 'address.city': 120 } });
  });

  it('leaves no key of tmp after it is removed', () => {
    const layout = renamedLayout(
      {
        hidden: ['tmp', 'a'],
        order: ['tmp.x', 'tmp', 'b'],
        pinned: ['tmp'],
        widths: { tmp: 40, 'tmp.x': 50, tmpx: 60 },
        expanded: ['tmp'],
      },
      'tmp',
    );
    expect(layout).toEqual({ hidden: ['a'], order: ['b'], pinned: [], widths: { tmpx: 60 }, expanded: [] });
  });

  it('keeps one of each key when two become the same', () => {
    expect(renamedLayout({ order: ['a', 'b'] }, 'a', 'b').order).toEqual(['b']);
  });
});
