import { describe, expect, it } from 'vitest';
import { fileRead, pictureName, pictureWriter, plan } from '../../../src/features/chart/save-picture';
import type { Context } from '../../../src/shared/feature';
import { featureId } from '../../../src/shared/ids';
import { initialState } from '../../../src/shared/state';

const context: Context = {
  feature: featureId('chart.save-picture'),
  now: 1_763_400_000_000,
  platform: 'windows',
  startedBy: 'user',
  target: { kind: 'app' },
  state: initialState,
};

const args = { collection: 'orders', type: 'bar', picture: 'iVBORw0KGgo=' };

describe('chart.save-picture', () => {
  it('proposes the name of the collection and the type', () => {
    expect(pictureName('orders', 'bar')).toBe('orders-bar.png');
    expect(pictureName('a:b', 'histogram')).toBe('a_b-histogram.png');
    expect(pictureName('a/\\b', 'pie')).toBe('a_b-pie.png');
  });

  it("asks for the file first, in the system's save dialog titled Save chart, for PNG images", () => {
    expect(plan(context, { args })).toEqual({
      kind: 'read',
      need: {
        key: 'file',
        read: 'chart.save-picture:file',
        args: { title: 'Save chart', name: 'orders-bar.png', kind: 'PNG image', extensions: ['png'] },
      },
    });
    expect(fileRead.request(context, { title: 'Save chart' })).toEqual({
      kind: 'app',
      action: 'chart.choose-file',
      args: { title: 'Save chart' },
    });
    expect(fileRead.parse(['orders-bar.png'], null)).toBe('orders-bar.png');
  });

  it('writes nothing and says nothing when the dialog is cancelled', () => {
    expect(fileRead.parse([null], null)).toBeNull();
    const outcome = plan(context, { args, file: null });
    expect(outcome.kind === 'run' && [outcome.plan.steps, outcome.plan.after]).toEqual([[], []]);
  });

  it('writes the picture to the file chosen and says so', () => {
    const path = 'C:\\Users\\me\\orders-bar.png';
    expect(plan(context, { args, file: path })).toEqual({
      kind: 'run',
      plan: {
        title: 'Save the chart as a picture',
        steps: [
          {
            kind: 'file',
            text: `write ${path}`,
            action: 'write',
            path,
            content: { writer: pictureWriter, args: { picture: 'iVBORw0KGgo=' } },
          },
        ],
        danger: { kind: 'none' },
        undo: { cannot: 'The file is written, and deleting it is up to the user.' },
        publishes: false,
        after: [{ kind: 'notify', level: 'success', text: `Saved the chart to ${path}.` }],
      },
    });
  });

  it('sends nothing to the server, so it is allowed on a read-only connection', () => {
    const outcome = plan(context, { args, file: 'orders-bar.png' });
    expect(outcome.kind === 'run' && outcome.plan.steps.map((step) => step.kind)).toEqual(['file']);
  });

  it('needs the picture of the Chart section', () => {
    expect(() => plan(context, { args: { collection: 'orders', type: 'bar' } })).toThrow(/collection, type, picture/u);
  });
});
