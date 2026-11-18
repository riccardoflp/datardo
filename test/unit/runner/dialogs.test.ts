import { describe, expect, it } from 'vitest';
import { dialogBehavior, dialogWidthPx, isDialogOpen, view as dialogView } from '../../../src/features/nav/dialog';
import { answersOf, initialValues, view as askView } from '../../../src/features/runner/ask';
import { view as confirmView } from '../../../src/features/runner/confirm';
import { confirmationOf } from '../../../src/runner/run';
import { start } from '../../../src/runner/start';
import { ask, run, type Context, type OperationFeature } from '../../../src/shared/feature';
import { featureId, type QuestionId } from '../../../src/shared/ids';
import type { Question } from '../../../src/shared/question';
import { initialState } from '../../../src/shared/state';
import type { Confirmation, OpenDialog } from '../../../src/shared/state/runner';
import { appTarget } from '../../../src/shared/target';
import { delStep, harness, planOf } from './harness';

const nameQuestion: Question = {
  title: 'Rename collection',
  button: 'Rename',
  fields: [
    {
      kind: 'text',
      key: 'name',
      label: 'New name',
      default: 'orders',
      rules: [{ kind: 'not-empty', message: "The name can't be empty." }],
    },
  ],
};

const pickQuestion: Question = {
  title: 'Choose a database',
  button: 'Choose',
  fields: [
    {
      kind: 'pick-one',
      key: 'database',
      label: 'Database',
      choices: Array.from({ length: 12 }, (_, index) => ({ value: `db${String(index)}`, label: `db${String(index)}` })),
    },
  ],
};

function confirmation(danger: Confirmation['danger'], steps = 3): Confirmation {
  return {
    title: 'Delete keys',
    danger,
    steps: Array.from({ length: steps }, (_, index) => ({ text: `DEL key:${String(index + 1)}` })),
    undoLine: 'It can be undone from the Undo history.',
    touches: `${String(steps)} keys`,
  };
}

const destructive = { kind: 'destructive' as const, text: 'Delete the keys?', button: 'Delete', name: 'orders' };

function dialog(open: Readonly<Record<string, unknown>>): OpenDialog {
  return { ...open, id: 'q1' as QuestionId, feature: featureId('test.feature') } as OpenDialog;
}

describe('nav.dialog', () => {
  it('shows one dialog at a time; the others wait', () => {
    const first = dialog({ kind: 'question', question: nameQuestion });
    const second = dialog({ kind: 'question', question: pickQuestion });
    expect(dialogView({ dialogs: [first, second] })).toMatchObject({ shown: first, waiting: 1 });
    expect(dialogView({ dialogs: [] })).toEqual({ waiting: 0 });
    expect(isDialogOpen({ dialogs: [first] })).toBe(true);
    expect(isDialogOpen({ dialogs: [] })).toBe(false);
  });

  it('puts the focus on the first field of a form, on Cancel of a confirmation, on the name of a destructive one', () => {
    const form = dialogView({ dialogs: [dialog({ kind: 'question', question: nameQuestion })] });
    expect(form.behavior).toMatchObject({ kind: 'form', focus: 'first-field' });
    const confirm = dialogView({
      dialogs: [
        dialog({
          kind: 'confirmation',
          confirmation: confirmation({ kind: 'confirm', text: 'Delete?', button: 'Delete' }),
        }),
      ],
    });
    expect(confirm.behavior).toMatchObject({ kind: 'confirm', focus: 'cancel' });
    const named = dialogView({ dialogs: [dialog({ kind: 'confirmation', confirmation: confirmation(destructive) })] });
    expect(named.behavior).toMatchObject({ kind: 'destructive', focus: 'name-field', enterInFieldConfirms: false });
  });

  it('closes on a click outside only for a list to pick from', () => {
    expect(dialogView({ dialogs: [dialog({ kind: 'question', question: pickQuestion })] }).behavior).toMatchObject({
      kind: 'pick',
      closesOnClickOutside: true,
    });
    expect(dialogBehavior('form').closesOnClickOutside).toBe(false);
    expect(dialogBehavior('confirm').closesOnClickOutside).toBe(false);
  });

  it('is 560 pixels wide at most', () => {
    expect(dialogWidthPx).toBe(560);
  });
});

describe('runner.ask', () => {
  it('names its button by the question and shows its title', () => {
    const shown = askView({
      question: nameQuestion,
      values: initialValues(nameQuestion),
      filters: {},
      touched: new Set(),
    });
    expect(shown).toMatchObject({ title: 'Rename collection', button: 'Rename', buttonEnabled: true });
  });

  it('shows a default filled in', () => {
    expect(initialValues(nameQuestion)).toEqual({ name: 'orders' });
    expect(answersOf(nameQuestion, initialValues(nameQuestion))).toEqual({ name: 'orders' });
  });

  it('shows the message of a text that is not valid under its field, and disables the button', () => {
    const shown = askView({ question: nameQuestion, values: { name: '' }, filters: {}, touched: new Set(['name']) });
    expect(shown.fields[0]?.problem).toBe("The name can't be empty.");
    expect(shown.buttonEnabled).toBe(false);
  });

  it('has a filter field for a list of more than 8 choices', () => {
    const shown = askView({ question: pickQuestion, values: {}, filters: { database: 'db1' }, touched: new Set() });
    expect(shown.fields[0]?.filtered).toBe(true);
    expect(shown.fields[0]?.choices.map((choice) => choice.value)).toEqual(['db1', 'db10', 'db11']);
    expect(shown.buttonEnabled).toBe(false);
  });

  const asking: OperationFeature = {
    kind: 'operation',
    id: featureId('test.asking'),
    plan: (_context, answers) =>
      typeof answers['name'] === 'string' ? run(planOf('Rename', [delStep(answers['name'])])) : ask(nameQuestion),
  };

  it('ends the feature when cancelled: nothing is run, nothing is said, the Log has no line', async () => {
    const test = harness({ features: [asking], answers: undefined });
    expect(await start(test.ports, { feature: asking.id, target: appTarget })).toEqual({ kind: 'cancelled' });
    expect(test.sent).toEqual([]);
    expect(test.state().runner.notifications).toEqual([]);
    expect(test.state().runner.log).toEqual([]);
  });

  it('refuses a question to a feature started by a tool of the MCP server', async () => {
    const test = harness({ features: [asking], answers: { name: 'x' } });
    const result = await start(test.ports, { feature: asking.id, target: appTarget }, { startedBy: 'mcp' });
    expect(result).toMatchObject({ kind: 'refused', code: 'runner.ask/needs-a-person' });
    expect(test.questions).toEqual([]);
    expect(test.sent).toEqual([]);
  });
});

describe('runner.confirm', () => {
  const context: Context = {
    feature: featureId('test.delete'),
    now: 0,
    platform: 'windows',
    startedBy: 'user',
    target: appTarget,
    state: initialState,
  };

  it('runs a plan whose danger is None with no confirmation', async () => {
    const plain: OperationFeature = {
      kind: 'operation',
      id: featureId('test.plain'),
      plan: () => run(planOf('Save', [delStep('a')])),
    };
    const test = harness({ features: [plain] });
    await start(test.ports, { feature: plain.id, target: appTarget });
    expect(test.confirmations).toEqual([]);
    expect(test.sent).toHaveLength(1);
  });

  it('shows the title, the text, what it touches, every step and the line on undo', () => {
    const plan = {
      ...planOf('Delete keys', [delStep('a'), delStep('b')], {
        kind: 'confirm',
        text: 'Delete 2 keys?',
        button: 'Delete',
      }),
      touches: '2 keys',
    };
    const shown = confirmView({ confirmation: confirmationOf(plan, context), typed: '', showAll: false });
    expect(shown).toMatchObject({
      title: 'Delete keys',
      paragraphs: ['Delete 2 keys?'],
      touches: '2 keys',
      steps: [{ text: 'DEL a' }, { text: 'DEL b' }],
      undoLine: 'Nothing is kept.',
      button: 'Delete',
      buttonLook: 'primary',
      buttonEnabled: true,
    });
  });

  it('says the plan can be undone, word for word, when the undo history keeps it', () => {
    const plan = {
      ...planOf('Delete', [delStep('a')], { kind: 'confirm', text: 'Delete?', button: 'Delete' }),
      undo: { keeps: null },
    };
    expect(confirmationOf(plan, context).undoLine).toBe('It can be undone from the Undo history.');
  });

  it('shows the first 20 steps, and the others behind "and N more"', () => {
    const many = confirmation({ kind: 'confirm', text: 'Delete?', button: 'Delete' }, 57);
    const shown = confirmView({ confirmation: many, typed: '', showAll: false });
    expect(shown.steps).toHaveLength(20);
    expect(shown.more).toBe('and 37 more');
    expect(confirmView({ confirmation: many, typed: '', showAll: true }).steps).toHaveLength(57);
  });

  it('enables the button of a destructive plan only when the name is typed exactly', () => {
    const shown = (typed: string): ReturnType<typeof confirmView> =>
      confirmView({ confirmation: confirmation(destructive), typed, showAll: false });
    expect(shown('').nameField).toEqual({ label: 'Type orders to confirm', name: 'orders' });
    expect(shown('').buttonLook).toBe('danger');
    expect(shown('Orders').buttonEnabled).toBe(false);
    expect(shown('orders ').buttonEnabled).toBe(false);
    expect(shown('orders').buttonEnabled).toBe(true);
  });

  it('ends the feature when cancelled: nothing is run, and the Log has no line', async () => {
    const plan = planOf('Delete', [delStep('a')], { kind: 'confirm', text: 'Delete?', button: 'Delete' });
    const feature: OperationFeature = { kind: 'operation', id: featureId('test.delete'), plan: () => run(plan) };
    const test = harness({ features: [feature], confirmed: false });
    expect(await start(test.ports, { feature: feature.id, target: appTarget })).toEqual({ kind: 'cancelled' });
    expect(test.confirmations).toHaveLength(1);
    expect(test.sent).toEqual([]);
    expect(test.state().runner.log).toEqual([]);
  });
});
