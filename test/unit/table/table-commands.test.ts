/**
 * The commands of the table in Go to: offered while a collection tab is active, and on nothing else, since there is
 * no table to act on (`table.show`, `table.selection`, `table.copy-as`).
 */
import { describe, expect, it } from 'vitest';
import { commands as registeredCommands } from '../../../src/features/commands';
import { offeredCommands } from '../../../src/features/palette/run-command';
import { harness, local, orders } from '../palette/harness';

function tableIds(state: Parameters<typeof offeredCommands>[1]): readonly string[] {
  return offeredCommands(registeredCommands, state, 'windows')
    .map((entry) => entry.id)
    .filter((id) => id.startsWith('table.'));
}

describe('table.show commands in Go to', () => {
  it('lists none with no tab open, even with a connection current', () => {
    const h = harness();
    expect(tableIds(h.state())).toEqual([]);
    h.connect(local.id);
    h.makeCurrent(local.id);
    expect(tableIds(h.state())).toEqual([]);
  });

  it('lists those of the table on a collection tab: selection, copies and columns', async () => {
    const h = harness();
    h.connect(local.id);
    await h.open(orders);
    expect(tableIds(h.state())).toEqual(
      expect.arrayContaining([
        'table.refresh',
        'table.columns',
        'table.selection:all',
        'table.selection:clear',
        'table.copy-as:json',
        'table.copy-value',
        'table.arrange-columns:hide',
      ]),
    );
  });
});
