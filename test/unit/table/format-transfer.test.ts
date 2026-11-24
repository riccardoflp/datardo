/**
 * Formatting beyond one collection (M42): the sections of the Formatting view, moving and copying a rule between them,
 * exporting rules to a file and importing them, and what the toolbar and the column menu show of them.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { view as columnMenu } from '../../../src/features/table/column-menu';
import { columnByKey, columnsOfDocuments } from '../../../src/features/table/detect-columns';
import { plan as editPlan } from '../../../src/features/table/edit-format-rule';
import {
  dialogArgs,
  exportFileRead,
  plan as exportPlan,
  proposedFileName,
} from '../../../src/features/table/export-formatting';
import {
  rulesByScope,
  rulesInOrder,
  rulesOn,
  withPlaceRules,
  withScopesOff,
} from '../../../src/features/table/format-scopes';
import { tableFormat } from '../../../src/features/table/format-table';
import { view as formattingView, type FormattingState } from '../../../src/features/table/formatting';
import { formattingFileText } from '../../../src/features/table/formatting-file';
import { importFileRead, plan as importPlan } from '../../../src/features/table/import-formatting';
import { movedRules, plan as movePlan } from '../../../src/features/table/move-format-rule';
import { view as show, type ShowState } from '../../../src/features/table/show';
import { emptyTexts } from '../../../src/features/query/types';
import type { MenuEntry } from '../../../src/features/table/types';
import type { ConnectionView } from '../../../src/shared/connection';
import type { Answers, AppStep, Outcome } from '../../../src/shared/feature';
import {
  noFormatting,
  type FormatRule,
  type FormatScope,
  type KeptFormatting,
} from '../../../src/shared/formatting-rules';
import { initialState, type AppState } from '../../../src/shared/state';
import { contextOf, now } from '../query/context';
import { byField, condition, documents } from './formatting';
import { people } from './people';

const where = { connection: 'c-local', database: 'shop', collection: 'orders' };
const local = { id: 'c-local', name: 'Local', engine: 'mongodb' } as unknown as ConnectionView;

/** The rules kept, with these rules in each scope of `shop.orders` on Local. */
function keptWith(
  scopes: Partial<Record<FormatScope, readonly FormatRule[]>>,
  off: readonly FormatScope[] = [],
): KeptFormatting {
  let kept: KeptFormatting = noFormatting;
  kept = withPlaceRules(kept, { scope: 'global' }, scopes.global ?? []);
  kept = withPlaceRules(kept, { scope: 'connection', connection: 'c-local' }, scopes.connection ?? []);
  kept = withPlaceRules(kept, { scope: 'database', connection: 'c-local', database: 'shop' }, scopes.database ?? []);
  kept = withPlaceRules(kept, { scope: 'collection', ...where }, scopes.collection ?? []);
  return off.length === 0 ? kept : withScopesOff(kept, where, off);
}

function stateOf(kept: KeptFormatting): AppState {
  return {
    ...initialState,
    connections: { ...initialState.connections, saved: [local] },
    table: { ...initialState.table, formatting: { hidden: false, ...kept } },
  };
}

function stepsOf(outcome: Outcome): readonly AppStep[] {
  if (outcome.kind !== 'run') {
    throw new Error(`expected a plan, got ${outcome.kind}`);
  }
  return outcome.plan.steps as readonly AppStep[];
}

/** The rules of each scope after the steps of `table.save-formatting` are carried out on the rules kept. */
function afterSteps(kept: KeptFormatting, steps: readonly AppStep[]): KeptFormatting {
  return steps.reduce((each, step) => {
    const saves = (step.args as { saves?: readonly { scope: string; rules: readonly FormatRule[] }[] }).saves ?? [];
    return saves.reduce((inner, save) => withPlaceRules(inner, { ...where, ...save } as never, save.rules), each);
  }, kept);
}

const ids = (rules: readonly FormatRule[]): readonly string[] => rules.map((rule) => rule.id);

describe('table.move-format-rule', () => {
  const a = condition('a', '{ a: 1 }', 'red');
  const b = condition('b', '{ b: 1 }', 'blue');
  const g = condition('g', '{ g: 1 }', 'green');

  it('moving a to everywhere leaves the collection b and makes everywhere g, a; dropped before g, a, g', () => {
    const byScope = rulesByScope(keptWith({ collection: [a, b], global: [g] }), where);
    const last = movedRules(byScope, 'a', 'global');
    expect(last !== 'full' && last !== undefined ? [ids(last.collection ?? []), ids(last.global ?? [])] : []).toEqual([
      ['b'],
      ['g', 'a'],
    ]);
    const before = movedRules(byScope, 'a', 'global', { beside: 'g' });
    expect(before !== 'full' && before !== undefined ? ids(before.global ?? []) : []).toEqual(['a', 'g']);
    const kept = keptWith({ collection: [a, b], global: [g] });
    const steps = stepsOf(
      movePlan(contextOf('table.move-format-rule', stateOf(kept)), { args: { id: 'a', to: 'global' } }),
    );
    expect(steps[0]?.text).toBe('move a formatting rule from Local / shop / orders to everywhere');
    const after = rulesByScope(afterSteps(kept, steps), where);
    expect([ids(after.collection), ids(after.global)]).toEqual([['b'], ['g', 'a']]);
  });

  it('Copy to › This connection leaves the collection as it was and adds a rule with a new id to the connection', () => {
    const kept = keptWith({ collection: [a, b] });
    const steps = stepsOf(
      movePlan(contextOf('table.move-format-rule', stateOf(kept)), { args: { id: 'a', to: 'connection', copy: true } }),
    );
    expect(steps[0]?.text).toBe('copy a formatting rule from Local / shop / orders to the connection Local');
    const after = rulesByScope(afterSteps(kept, steps), where);
    expect(ids(after.collection)).toEqual(['a', 'b']);
    expect(after.connection).toHaveLength(1);
    expect(after.connection[0]?.id).not.toBe('a');
    expect(after.connection[0]).toMatchObject({ condition: '{ a: 1 }', color: 'red' });
  });

  it("moving a rule to Everywhere colors at once another collection's table that has its field", () => {
    const rule = condition('s', '{ status: "failed" }', 'red');
    const kept = keptWith({ collection: [rule] });
    const steps = stepsOf(
      movePlan(contextOf('table.move-format-rule', stateOf(kept)), { args: { id: 's', to: 'global' } }),
    );
    const customers = { ...where, collection: 'customers' };
    const inOrder = rulesInOrder(afterSteps(kept, steps), customers).rules.map((each) => each.rule);
    expect(tableFormat(inOrder, documents('{ status: "failed" }'), false, now).documents[0]?.row?.color).toBe('red');
  });

  it('moving into a section that has 100 rules is refused with its message; reordering within it is not', () => {
    const full = Array.from({ length: 100 }, (_each, index) => condition(`g${String(index)}`, '{}', 'gray'));
    const kept = keptWith({ collection: [a], global: full });
    expect(movePlan(contextOf('table.move-format-rule', stateOf(kept)), { args: { id: 'a', to: 'global' } })).toEqual({
      kind: 'refuse',
      code: 'table.move-format-rule/too-many',
      message: 'Everywhere keeps at most 100 formatting rules.',
    });
    const reorder = editPlan(contextOf('table.edit-format-rule', stateOf(kept)), {
      args: { change: { kind: 'step', id: 'g5', by: -1 } },
    });
    expect(stepsOf(reorder)[0]?.text).toBe('save the formatting rules for everywhere');
  });
});

describe('table.formatting', () => {
  const state = (kept: KeptFormatting, more: Partial<FormattingState> = {}): FormattingState => ({
    sections: rulesByScope(kept, where),
    off: rulesInOrder(kept, where).off,
    names: { database: 'shop', connection: 'Local' },
    problems: new Map(),
    hidden: false,
    documents: documents('{ status: "ok" }'),
    now,
    ...more,
  });

  it('shows four sections with their counts; a section without rules is dimmed', () => {
    const shown = formattingView(
      state(keptWith({ collection: [condition('o', '{}', 'red')], global: [condition('g', '{}', 'gray')] })),
    );
    expect(shown.sections.map((section) => [section.title, section.count, section.dimmed])).toEqual([
      ['This collection', '1', false],
      ['Database shop', 'no rules', true],
      ['Connection Local', 'no rules', true],
      ['Everywhere', '1', false],
    ]);
    expect(shown.empty).toBeUndefined();
    expect(shown.lines.map((line) => line.id)).toEqual(['o', 'g']);
  });

  it("a section's checkbox leaves its rules out of this collection, saved by table.edit-format-rule", () => {
    const kept = keptWith({ global: [condition('g', '{}', 'gray')] });
    const everywhere = formattingView(state(kept)).sections[3];
    expect(everywhere?.check).toMatchObject({ checked: true, change: { kind: 'off', scope: 'global', leftOut: true } });
    const steps = stepsOf(
      editPlan(contextOf('table.edit-format-rule', stateOf(kept)), {
        args: { change: everywhere?.check.change ?? null },
      }),
    );
    expect(steps[0]).toMatchObject({ action: 'table.set-formatting-off', args: { off: ['global'] } });
  });

  it('a rule about a field the table does not have is dimmed, with No <field> in this table.', () => {
    const [line] = formattingView(state(keptWith({ global: [byField('d', 'deleted')] }))).lines;
    expect(line?.absent).toBe('No deleted in this table.');
    expect(line?.tooltip).toContain('No deleted in this table.');
  });

  it("a rule's menu has Move to without its own section, and Copy to with the four", () => {
    const [line] = formattingView(state(keptWith({ collection: [condition('o', '{}', 'red')] }))).lines;
    expect(line?.menu.submenus.map((menu) => [menu.label, menu.entries.map((entry) => entry.label)])).toEqual([
      ['Move to', ['This database', 'This connection', 'Everywhere']],
      ['Copy to', ['This collection', 'This database', 'This connection', 'Everywhere']],
    ]);
  });

  it('the head has By field… and, in its … menu, Export formatting… and Import formatting…', () => {
    const shown = formattingView(state(noFormatting));
    expect(shown.head.add.entries.map((entry) => entry.label)).toEqual(['Condition…', 'By field…']);
    expect(shown.head.more.entries.map((entry) => entry.element)).toEqual([
      'table.export-formatting@inspector',
      'table.import-formatting@inspector',
    ]);
  });
});

describe('table.export-formatting', () => {
  const kept = keptWith({
    collection: [condition('o1', '{ amount: { $gt: 5 } }', 'green'), byField('o2', 'status')],
    database: [condition('d', '{ status: "failed" }', 'red')],
    global: [condition('g', '{ deleted: true }', 'gray')],
  });
  const context = () => contextOf('table.export-formatting', stateOf(kept));

  it('dismissing either question writes nothing: no scope chosen, or the save dialog closed', () => {
    expect(stepsOf(exportPlan(context(), { scopes: [] }))).toEqual([]);
    expect(stepsOf(exportPlan(context(), { scopes: ['global'], file: null }))).toEqual([]);
  });

  it('offers Collection orders (2 rules), Database shop and Everywhere, all checked, and no Connection Local', () => {
    const asked = exportPlan(context(), {});
    if (asked.kind !== 'ask') {
      throw new Error('no question');
    }
    const [field] = asked.question.fields;
    expect(field).toMatchObject({
      kind: 'pick-many',
      default: ['collection', 'database', 'global'],
      choices: [
        { label: 'Collection orders', description: '2 rules' },
        { label: 'Database shop', description: '1 rule' },
        { label: 'Everywhere', description: '1 rule' },
      ],
    });
  });

  it('proposes orders.datardo-formatting.json, and my_orders_2024.datardo-formatting.json for my orders/2024', () => {
    expect(proposedFileName('orders')).toBe('orders.datardo-formatting.json');
    expect(proposedFileName('my orders/2024')).toBe('my_orders_2024.datardo-formatting.json');
    expect(exportPlan(context(), { scopes: ['global'] })).toEqual({
      kind: 'read',
      need: { key: 'file', read: exportFileRead, args: dialogArgs('orders') },
    });
  });

  it('writes a file with no connection id, name, host or secret, and with the names shop and orders', () => {
    const outcome = exportPlan(context(), { scopes: ['collection', 'database', 'global'], file: '/home/me/x.json' });
    if (outcome.kind !== 'run') {
      throw new Error('no plan');
    }
    const [step] = outcome.plan.steps;
    const written = step?.kind === 'file' ? (step.content?.args as { text: string }).text : '';
    expect(written).not.toContain('c-local');
    expect(written).not.toContain('Local');
    expect(written).not.toContain('localhost');
    expect(written).toContain('"shop"');
    expect(written).toContain('"orders"');
    expect(outcome.plan.after).toEqual([
      {
        kind: 'notify',
        level: 'success',
        text: '4 rules exported to x.json. The file has nothing of the connection: no name, no address, no password.',
      },
    ]);
  });

  it('with no rule anywhere, says There are no formatting rules to export. and asks nothing', () => {
    expect(exportPlan(contextOf('table.export-formatting', stateOf(noFormatting)), {})).toEqual({
      kind: 'refuse',
      code: 'table.export-formatting/no-rules',
      message: 'There are no formatting rules to export.',
    });
  });
});

describe('table.import-formatting', () => {
  const r1 = condition('x1', '{ a: 1 }', 'red');
  const r2 = condition('x2', '{ b: 1 }', 'blue');
  const r3 = condition('x3', '{ c: 1 }', 'green');

  /** The file of these groups, as a Datardo export writes it. */
  function fileOf(scopes: Partial<Record<FormatScope, readonly FormatRule[]>>, place = where): string {
    const byScope = { collection: [], database: [], connection: [], global: [], ...scopes };
    return formattingFileText(byScope, ['collection', 'database', 'connection', 'global'], place);
  }

  function imported(kept: KeptFormatting, text: string, into: string): { outcome: Outcome; after: KeptFormatting } {
    const answers: Answers = { file: { name: 'x.json', text }, groups: undefined };
    const asked = importPlan(contextOf('table.import-formatting', stateOf(kept)), { file: answers['file'] ?? null });
    if (asked.kind !== 'ask') {
      throw new Error(`no question: ${JSON.stringify(asked)}`);
    }
    const groups = (asked.question.fields[0] as { default: readonly string[] }).default;
    const outcome = importPlan(contextOf('table.import-formatting', stateOf(kept)), {
      file: answers['file'] ?? null,
      groups: [...groups],
      into,
    });
    return { outcome, after: outcome.kind === 'run' ? afterSteps(kept, stepsOf(outcome)) : kept };
  }

  function summaryOf(outcome: Outcome): string | undefined {
    const [after] = outcome.kind === 'run' ? outcome.plan.after : [];
    return after?.kind === 'notify' ? after.text : undefined;
  }

  it('importing three rules where one already is adds two with new ids; the same file again adds none', () => {
    const kept = keptWith({ collection: [{ ...r1, id: 'mine' }] });
    const text = fileOf({ collection: [r1, r2, r3] });
    const first = imported(kept, text, 'collection');
    expect(summaryOf(first.outcome)).toBe('Imported 2 formatting rules, 1 was already there.');
    const rules = rulesByScope(first.after, where).collection;
    expect(rules.map((rule) => (rule as { condition: string }).condition)).toEqual([
      '{ a: 1 }',
      '{ b: 1 }',
      '{ c: 1 }',
    ]);
    expect(rules.slice(1).some((rule) => rule.id === 'x2' || rule.id === 'x3')).toBe(false);
    expect(stepsOf(first.outcome)[0]?.text).toBe('add 2 formatting rules to Local / shop / orders');
    const again = imported(first.after, text, 'collection');
    expect(summaryOf(again.outcome)).toBe('Imported 0 formatting rules, 3 were already there.');
    expect(rulesByScope(again.after, where).collection).toHaveLength(3);
  });

  it('a file exported by Datardo and imported again adds nothing', () => {
    const kept = keptWith({
      collection: [r1, byField('f', 'status', { pinned: [{ value: '"ok"', color: 'green' }] })],
      global: [r2],
    });
    const text = formattingFileText(
      rulesByScope(kept, where),
      ['collection', 'database', 'connection', 'global'],
      where,
    );
    const again = imported(kept, text, 'same');
    expect(summaryOf(again.outcome)).toBe('Imported 0 formatting rules, 3 were already there.');
    expect(rulesByScope(again.after, where)).toEqual(rulesByScope(kept, where));
  });

  it('importing two rules into a scope that has 99 adds one and says 1 rule did not fit', () => {
    const many = Array.from({ length: 99 }, (_each, index) =>
      condition(`m${String(index)}`, `{ m: ${String(index)} }`, 'gray'),
    );
    const { outcome, after } = imported(keptWith({ global: many }), fileOf({ global: [r1, r2] }), 'global');
    expect(summaryOf(outcome)).toBe('Imported 1 formatting rule. 1 rule did not fit: a scope keeps at most 100.');
    expect(rulesByScope(after, where).global).toHaveLength(100);
  });

  it('The same scopes puts a group of crm.leads into shop.orders, and a group database into shop', () => {
    const leads = { connection: 'other', database: 'crm', collection: 'leads' };
    const { after } = imported(noFormatting, fileOf({ collection: [r1], database: [r2] }, leads), 'same');
    const rules = rulesByScope(after, where);
    expect(ids(rules.collection).length).toBe(1);
    expect(rules.collection[0]).toMatchObject({ condition: '{ a: 1 }' });
    expect(rules.database[0]).toMatchObject({ condition: '{ b: 1 }' });
  });

  it('All into everywhere puts every chosen group into the rules for everywhere', () => {
    const { outcome, after } = imported(
      noFormatting,
      fileOf({ collection: [r1], database: [r2], global: [r3] }),
      'global',
    );
    expect(rulesByScope(after, where).global).toHaveLength(3);
    expect(stepsOf(outcome).map((step) => step.text)).toEqual(['add 3 formatting rules to everywhere']);
  });

  it('a file exported by Mongoster (.mongoster-formatting.json) is imported like one of Datardo, field rules, pins and palettes', () => {
    const text = readFileSync(
      join(import.meta.dirname, '..', '..', 'fixtures', 'formatting', 'orders.mongoster-formatting.json'),
      'utf8',
    );
    const { outcome, after } = imported(noFormatting, text, 'same');
    expect(summaryOf(outcome)).toBe('Imported 5 formatting rules.');
    const rules = rulesByScope(after, where);
    expect(rules.collection[0]).toMatchObject({
      kind: 'field',
      field: 'status',
      target: 'row',
      mode: 'values',
      pinned: [
        { value: '"failed"', color: 'red' },
        { value: '"late"', color: 'orange' },
      ],
      palette: 'blue',
      name: 'Status',
    });
    expect(rules.collection[1]).toMatchObject({ min: 0, max: 500, scale: { from: 'red', to: 'green' } });
    expect(rules.collection[2]).toMatchObject({ enabled: false, field: 'amount', color: 'purple' });
    expect(rules.database[0]).toMatchObject({ kind: 'field', mode: 'boolean', scale: { from: 'green', to: 'red' } });
    expect(rules.global[0]).toMatchObject({ condition: '{ deleted: true }', name: 'Deleted' });
  });

  it('dismissing any question adds nothing; a file that cannot be read or has no rule is refused', () => {
    const context = contextOf('table.import-formatting', stateOf(noFormatting));
    expect(importPlan(context, {})).toEqual({ kind: 'read', need: { key: 'file', read: importFileRead, args: null } });
    expect(stepsOf(importPlan(context, { file: null }))).toEqual([]);
    const file = { name: 'x.json', text: fileOf({ global: [r1] }) };
    expect(stepsOf(importPlan(context, { file, groups: [] }))).toEqual([]);
    expect(importPlan(context, { file, groups: ['0'], into: null }).kind).toBe('ask');
    expect(importPlan(context, { file: { error: 'EACCES' } })).toMatchObject({
      kind: 'refuse',
      code: 'table.import-formatting/unreadable',
      message: 'The file could not be read: EACCES',
    });
    expect(importPlan(context, { file: { name: 'x', text: fileOf({}) } })).toMatchObject({
      kind: 'refuse',
      code: 'table.import-formatting/empty',
    });
    expect(importPlan(context, { file: { tooLarge: true } })).toMatchObject({
      code: 'table.import-formatting/too-large',
    });
  });
});

describe('table.show', () => {
  const base: ShowState = {
    target: { mode: 'find', view: false, readOnly: false },
    phase: { kind: 'shown' },
    hasRows: true,
    emptyQuery: true,
    columns: [],
    layout: {},
    paging: { page: 1, pageSize: 50, skip: 0, received: 2, count: { kind: 'counted', count: 2, estimated: false } },
    selected: 0,
  };

  it('reads Formatting (4) with one rule on in each scope, and Formatting (3) with Everywhere left out', () => {
    const each = (id: string) => [condition(id, '{}', 'red')];
    const scopes = { collection: each('o'), database: each('d'), connection: each('c'), global: each('g') };
    const label = (kept: KeptFormatting) =>
      show({ ...base, formatting: { on: rulesOn(kept, where), hidden: false, shown: false } }).toolbar.buttons.find(
        (button) => button.element === 'nav.toggle-inspector@toolbar',
      )?.label;
    expect(label(keptWith(scopes))).toBe('Formatting (4)');
    expect(label(keptWith(scopes, ['global']))).toBe('Formatting (3)');
  });
});

describe('table.column-menu', () => {
  const column = columnByKey(columnsOfDocuments(people, []), 'name')!;
  const base = { layout: {}, texts: emptyTexts, target: { mode: 'find', view: true, readOnly: true } as const };
  const labels = (entries: readonly MenuEntry[]) =>
    entries.flatMap((each) => (each.kind === 'entry' ? [each.label] : []));

  it('has Color by this field before Format cells…, in Find and in Aggregate, on a view and read-only; not on #', () => {
    const find = columnMenu({ ...base, column });
    const entry = find.find((each) => each.kind === 'entry' && each.label === 'Color by this field');
    expect(entry).toMatchObject({
      element: 'table.color-by-field@column-menu',
      tip: 'Color the table by the values of name: true and false, a scale for numbers and dates, a color per value',
      args: { field: 'name' },
    });
    expect(labels(find).indexOf('Color by this field')).toBe(labels(find).indexOf('Format cells…') - 1);
    expect(labels(columnMenu({ ...base, column, target: { ...base.target, mode: 'aggregate' } }))).toContain(
      'Color by this field',
    );
    expect(labels(columnMenu({ ...base, column: '#' }))).not.toContain('Color by this field');
  });
});
