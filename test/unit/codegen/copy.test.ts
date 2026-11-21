import { describe, expect, it } from 'vitest';
import { plan } from '../../../src/features/codegen/copy';
import { goCode } from '../../../src/features/codegen/go';
import type { Context } from '../../../src/shared/feature';
import { featureId } from '../../../src/shared/ids';
import { initialState } from '../../../src/shared/state';
import { findExample, lines, program } from './queries';
import { pythonCode } from '../../../src/features/codegen/python';

const context: Context = {
  feature: featureId('codegen.copy'),
  now: 1_763_400_000_000,
  platform: 'windows',
  startedBy: 'user',
  target: { kind: 'app' },
  state: initialState,
};

describe('codegen.copy', () => {
  it('copies exactly the code shown, with its tabs in Go and one line break at the end', () => {
    const code = goCode(findExample, lines);
    const outcome = plan(context, { args: { code, language: 'go', collection: 'orders' } });
    expect(outcome).toMatchObject({
      kind: 'run',
      plan: {
        steps: [
          {
            kind: 'app',
            text: 'copy the Go code of orders to the clipboard',
            action: 'nav.copy',
            args: { text: code },
          },
        ],
        danger: { kind: 'none' },
      },
    });
    expect(code).toContain('\t{Key:');
    expect(code.endsWith('}\n')).toBe(true);
  });

  it('copies the whole program when Full program is on', () => {
    const code = pythonCode(findExample, program);
    const outcome = plan(context, { args: { code, language: 'python', collection: 'orders' } });
    expect(outcome.kind === 'run' && outcome.plan.steps[0]).toMatchObject({
      text: 'copy the Python code of orders to the clipboard',
      args: { text: code },
    });
  });

  it('sends no notification: the status line says Copied to the clipboard once the window learns it is done', () => {
    const outcome = plan(context, { args: { code: 'x\n', language: 'nodejs', collection: 'orders' } });
    expect(outcome.kind === 'run' && outcome.plan.after).toEqual([]);
  });

  it('copies nothing when the section shows no code', () => {
    const outcome = plan(context, { args: { code: '', language: 'nodejs', collection: 'orders' } });
    expect(outcome.kind === 'run' && outcome.plan.steps).toEqual([]);
  });

  it('copies no connection string and no password, and works on any connection', () => {
    const code = pythonCode(findExample, program);
    const outcome = plan(context, { args: { code, language: 'python', collection: 'orders' } });
    expect(JSON.stringify(outcome)).not.toMatch(/@[a-z0-9.-]+:\d+|password/iu);
    expect(outcome.kind === 'run' && outcome.plan.steps.every((step) => step.kind === 'app')).toBe(true);
  });
});
