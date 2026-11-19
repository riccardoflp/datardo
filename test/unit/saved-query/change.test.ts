import { describe, expect, it } from 'vitest';
import { plan as deletePlan } from '../../../src/features/saved-query/delete';
import { plan as movePlan } from '../../../src/features/saved-query/move';
import { plan as renamePlan } from '../../../src/features/saved-query/rename';
import { savedRef, type SavedQuery } from '../../../src/features/saved-query/types';
import type { Answers } from '../../../src/shared/feature';
import {
  answersWith,
  appArgs,
  bare,
  contextOn,
  fileSteps,
  find,
  inFolder,
  listOf,
  mine,
  now,
  planOf,
  questionOf,
  repoFolder,
  stepTexts,
  writtenText,
} from './harness';

const paid = find('{ status: "paid" }', '{ at: -1 }', '{ total: 1 }');

function on(query: SavedQuery, saved: readonly SavedQuery[], more: Answers = {}): Answers {
  return answersWith({ saved: savedRef(query) }, { list: listOf(saved), ...more });
}

function namesOfMine(outcome: ReturnType<typeof renamePlan>): readonly string[] {
  return (appArgs(outcome, 'saved-query.set-mine')['queries'] as readonly { name: string }[]).map((each) => each.name);
}

describe('saved-query.rename', () => {
  it('asks the new name, starting with the name it has, and renames Paid for me to Paid this month with the same filter', () => {
    const query = mine('Paid', paid);
    const question = questionOf(renamePlan(contextOn('saved-query.rename'), on(query, [query, mine('Other')])));
    expect(question).toMatchObject({ title: 'Rename saved query', fields: [{ label: 'New name', default: 'Paid' }] });
    const outcome = renamePlan(
      contextOn('saved-query.rename'),
      on(query, [query, mine('Other')], { name: 'Paid this month' }),
    );
    expect(stepTexts(outcome)).toEqual(['rename the query "Paid" of shop.orders to "Paid this month"']);
    expect(namesOfMine(outcome)).toEqual(['Paid this month', 'Other']);
    expect(
      (appArgs(outcome, 'saved-query.set-mine')['queries'] as readonly { query: unknown }[])[0]?.query,
    ).toMatchObject({
      filter: '{ status: "paid" }',
    });
  });

  it('renames shop/orders/paid.json to paid-this-month.json, whose name is Paid this month', () => {
    const query = inFolder('Paid', 'paid.json', paid);
    const question = questionOf(renamePlan(contextOn('saved-query.rename'), on(query, [query])));
    expect(question.fields[0]).toMatchObject({ label: 'New name (the file shop/orders/paid.json is renamed too)' });
    const outcome = renamePlan(contextOn('saved-query.rename'), on(query, [query], { name: 'Paid this month' }));
    expect(stepTexts(outcome)).toEqual([
      `rename ${repoFolder}\\shop\\orders\\paid.json to paid-this-month.json`,
      `write ${repoFolder}\\shop\\orders\\paid-this-month.json`,
    ]);
    const [rename, write] = fileSteps(outcome);
    expect(rename).toMatchObject({
      action: 'rename',
      content: { args: { file: 'shop/orders/paid.json', to: 'shop/orders/paid-this-month.json' } },
    });
    expect(JSON.parse(writtenText(write))).toMatchObject({ name: 'Paid this month' });
  });

  it('keeps the file paid.json when Paid is renamed PAID! in the folder, and changes only its name', () => {
    const query = inFolder('Paid', 'paid.json', paid);
    const outcome = renamePlan(contextOn('saved-query.rename'), on(query, [query], { name: 'PAID!' }));
    expect(stepTexts(outcome)).toEqual([`write ${repoFolder}\\shop\\orders\\paid.json`]);
    expect(JSON.parse(writtenText(fileSteps(outcome)[0]))).toMatchObject({
      name: 'PAID!',
      filter: '{ status: "paid" }',
    });
  });

  it('refuses the name of another saved query of the same place; one in the folder may have the name of one for me', () => {
    const query = mine('Paid');
    const question = questionOf(
      renamePlan(contextOn('saved-query.rename'), on(query, [query, mine('Other'), inFolder('Shared', 's.json')])),
    );
    expect(question.fields[0]).toMatchObject({
      rules: [
        { kind: 'not-empty', message: 'Enter a name' },
        { kind: 'not-one-of', values: ['Other'], message: 'Another saved query of yours has this name' },
      ],
    });
    const file = inFolder('Shared', 's.json');
    const inTheFolder = questionOf(
      renamePlan(contextOn('saved-query.rename'), on(file, [mine('Paid'), file, inFolder('B', 'b.json')])),
    );
    expect(inTheFolder.fields[0]).toMatchObject({
      rules: [{}, { values: ['B'], message: 'Another saved query in the folder has this name' }],
    });
  });

  it('keeps the connection and the description of a file after a rename', () => {
    const query = inFolder('Paid', 'paid.json', paid, { connection: 'Production', description: 'Mine' });
    const outcome = renamePlan(contextOn('saved-query.rename'), on(query, [query], { name: 'Paid this month' }));
    expect(JSON.parse(writtenText(fileSteps(outcome)[1]))).toMatchObject({
      name: 'Paid this month',
      connection: 'Production',
      description: 'Mine',
    });
  });

  it('does nothing when the same name is confirmed', () => {
    const query = mine('Paid');
    expect(planOf(renamePlan(contextOn('saved-query.rename'), on(query, [query], { name: ' Paid ' }))).steps).toEqual(
      [],
    );
  });

  it('numbers the file when the new name is taken by another file', () => {
    const query = inFolder('Paid', 'paid.json');
    const other = inFolder('Top', 'top.json', find('{}'), { connection: 'Production' });
    const outcome = renamePlan(contextOn('saved-query.rename'), on(query, [query, other], { name: 'Top' }));
    expect(fileSteps(outcome)[1]?.path).toBe(`${repoFolder}\\shop\\orders\\top-2.json`);
  });
});

describe('saved-query.delete', () => {
  it('removes a query for me at once, without a question', () => {
    const query = mine('Paid');
    const outcome = deletePlan(contextOn('saved-query.delete'), on(query, [query, mine('Other')]));
    expect(planOf(outcome).danger).toEqual({ kind: 'none' });
    expect(stepTexts(outcome)).toEqual(['delete the query "Paid" of shop.orders for me on Local']);
    expect(namesOfMine(outcome)).toEqual(['Other']);
  });

  it('asks before deleting the file of a query in the folder, and deletes that file only', () => {
    const query = inFolder('Paid', 'paid.json');
    const outcome = deletePlan(contextOn('saved-query.delete'), on(query, [query, inFolder('Other', 'other.json')]));
    expect(planOf(outcome)).toMatchObject({
      title: 'Delete the saved query "Paid" from the folder?',
      danger: { kind: 'confirm', text: 'Its file shop/orders/paid.json is deleted.', button: 'Delete' },
    });
    expect(stepTexts(outcome)).toEqual([`delete ${repoFolder}\\shop\\orders\\paid.json`]);
    expect(fileSteps(outcome)).toMatchObject([
      { action: 'delete', content: { args: { queriesFolder: repoFolder, file: 'shop/orders/paid.json' } } },
    ]);
  });

  it('does not touch the recent query equal to the one deleted', () => {
    const query = mine('Paid');
    const steps = planOf(deletePlan(contextOn('saved-query.delete'), on(query, [query]))).steps;
    expect(steps.some((step) => step.kind === 'app' && step.action === 'saved-query.set-recent')).toBe(false);
  });
});

describe('saved-query.move', () => {
  it('writes Paid in the folder with its filter, sort, projection and description, then forgets it for me', () => {
    const query = mine('Paid', paid, { description: 'Since the first' });
    const outcome = movePlan(contextOn('saved-query.move'), on(query, [query]));
    expect(stepTexts(outcome)).toEqual([
      `write ${repoFolder}\\shop\\orders\\paid.json`,
      'remove the query "Paid" of shop.orders for me on Local',
    ]);
    expect(JSON.parse(writtenText(fileSteps(outcome)[0]))).toEqual({
      name: 'Paid',
      description: 'Since the first',
      database: 'shop',
      collection: 'orders',
      filter: '{ status: "paid" }',
      sort: '{ at: -1 }',
      projection: '{ total: 1 }',
    });
    expect(appArgs(outcome, 'saved-query.set-mine')['queries']).toEqual([]);
  });

  it('asks before moving Paid from the folder to my queries, then saves it for me and deletes its file', () => {
    const query = inFolder('Paid', 'paid.json', paid, { connection: 'Local' });
    const outcome = movePlan(contextOn('saved-query.move'), on(query, [query]));
    expect(planOf(outcome)).toMatchObject({
      title: 'Move "Paid" from the folder to your queries?',
      danger: {
        kind: 'confirm',
        text: 'Its file shop/orders/paid.json is deleted from the folder: once the change is committed, the others no longer have it.',
        button: 'Move',
      },
    });
    expect(stepTexts(outcome)).toEqual([
      'save the query "Paid" of shop.orders for me on Local',
      `delete ${repoFolder}\\shop\\orders\\paid.json`,
    ]);
    const [saved] = appArgs(outcome, 'saved-query.set-mine')['queries'] as readonly Record<string, unknown>[];
    expect(saved).toEqual({ name: 'Paid', database: 'shop', collection: 'orders', query: paid, at: now });
  });

  it('replaces the query for me of the same name when one in the folder is moved to my queries', () => {
    const query = inFolder('Paid', 'paid.json');
    const outcome = movePlan(
      contextOn('saved-query.move'),
      on(query, [mine('Paid', find('{ old: 1 }')), query, mine('Other')]),
    );
    expect(namesOfMine(outcome)).toEqual(['Paid', 'Other']);
  });

  it('asks to replace another Paid of the folder; the confirmation covers the whole move', () => {
    const query = mine('Paid', find('{ mine: 1 }'));
    const outcome = movePlan(contextOn('saved-query.move'), on(query, [inFolder('Paid', 'paid.json'), query]));
    expect(planOf(outcome)).toMatchObject({
      title: 'The folder already has a query of orders named "Paid". Replace it?',
      danger: { kind: 'confirm', button: 'Replace' },
    });
    expect(planOf(outcome).steps).toHaveLength(2);
  });

  it('asks the queries folder of a connection that has none before moving to the folder', () => {
    const query = mine('Paid');
    const outcome = movePlan(contextOn('saved-query.move', bare.id), {
      ...on(query, [query]),
      args: { connection: bare.id, database: 'shop', collection: 'orders', saved: savedRef(query) },
    });
    expect(questionOf(outcome)).toMatchObject({ title: 'Queries folder of Bare' });
  });
});
