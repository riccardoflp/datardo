import { describe, expect, it } from 'vitest';
import { plan } from '../../../src/features/nav/toggle-explorer';
import { view as railView } from '../../../src/features/nav/rail';
import { commands } from '../../../src/features/nav/commands';
import { context, input } from './inputs';

describe('nav.toggle-explorer', () => {
  it('hides the explorer while it is shown, in one app step', () => {
    const outcome = plan(context({ explorerHidden: false }), { args: null });
    expect(outcome).toMatchObject({
      kind: 'run',
      plan: {
        danger: { kind: 'none' },
        steps: [{ kind: 'app', text: 'hide the explorer', action: 'nav.set-explorer', args: { hidden: true } }],
      },
    });
  });

  it('shows the explorer while it is hidden', () => {
    const outcome = plan(context({ explorerHidden: true }), { args: null });
    expect(outcome).toMatchObject({ plan: { steps: [{ text: 'show the explorer', args: { hidden: false } }] } });
  });

  it('shows it when a feature asks for it, whatever it was', () => {
    const outcome = plan(context({ explorerHidden: true }), { args: { hidden: false } });
    expect(outcome).toMatchObject({ plan: { steps: [{ args: { hidden: false } }] } });
  });

  it('cannot be undone and writes nothing to a deployment', () => {
    const outcome = plan(context(), { args: null });
    expect(outcome.kind === 'run' && outcome.plan.undo).toEqual({
      cannot: 'Nothing is written to a deployment, so nothing is recorded.',
    });
  });

  it('unmarks Explorer on the rail while the explorer is hidden', () => {
    const entry = railView(input({ nav: { explorerHidden: true } })).entries.find((each) => each.name === 'explorer');
    expect(entry?.marked).toBe(false);
  });

  it('is started with Ctrl+B', () => {
    expect(commands.find((each) => each.id === 'nav.toggle-explorer')?.key).toBe('Ctrl+B');
  });
});
