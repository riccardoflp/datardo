import { describe, expect, it } from 'vitest';
import { editorJson } from '../../../src/features/aggregate/types';
import { queryFileText } from '../../../src/features/saved-query/file-format';
import { parse as folderParse } from '../../../src/features/saved-query/read-folder';
import { plan } from '../../../src/features/saved-query/save';
import type { Answers } from '../../../src/shared/feature';
import type { Json } from '../../../src/shared/engine-request';
import {
  answersWith,
  appArgs,
  appState,
  bare,
  contextOn,
  fileSteps,
  find,
  inFolder,
  listOf,
  mine,
  now,
  pipeline,
  planOf,
  production,
  queryArgs,
  questionOf,
  repoFolder,
  stepTexts,
  writtenText,
} from './harness';
import { mongoConnection, stateWith } from '../connection/context';

const paid = find('{ status: "paid" }');

function saving(args: Readonly<Record<string, Json>>, answers: Answers = {}): Answers {
  return answersWith(args, { list: listOf(), ...answers });
}

describe('saved-query.save', () => {
  it('saves Paid for me on Local: one app step, listed on shop.orders of Local only', () => {
    const context = contextOn('saved-query.save');
    expect(plan(context, answersWith(queryArgs(paid)))).toMatchObject({ kind: 'read', need: { key: 'list' } });
    const name = questionOf(plan(context, saving(queryArgs(paid))));
    expect(name).toMatchObject({ title: 'Save query', fields: [{ key: 'name', label: 'Name for this orders query' }] });
    expect(name.fields[0]).toMatchObject({ rules: [{ kind: 'not-empty', message: 'Enter a name' }] });
    expect(name.fields[0] && 'default' in name.fields[0]).toBe(false);
    const where = questionOf(plan(context, saving(queryArgs(paid), { name: 'Paid' })));
    expect(where.fields[0]).toMatchObject({
      kind: 'pick-one',
      key: 'place',
      default: 'me',
      choices: [
        { value: 'me', label: 'For me', description: 'kept by Datardo, on Local only' },
        {
          value: 'folder',
          label: 'In the folder',
          description: `a file in ${repoFolder}, shared through git, on every connection with this folder and shop.orders`,
        },
      ],
    });
    const outcome = plan(context, saving(queryArgs(paid), { name: 'Paid', place: 'me' }));
    expect(stepTexts(outcome)).toEqual(['save the query "Paid" of shop.orders for me on Local']);
    expect(appArgs(outcome, 'saved-query.set-mine')).toEqual({
      connection: 'c-local',
      database: 'shop',
      collection: 'orders',
      queries: [
        {
          name: 'Paid',
          database: 'shop',
          collection: 'orders',
          query: { kind: 'find', filter: '{ status: "paid" }', sort: '', projection: '' },
          at: now,
        },
      ],
    });
    expect(planOf(outcome).danger).toEqual({ kind: 'none' });
  });

  it('writes Paid in the folder as shop\\orders\\paid.json with the content of saved-query.file-format', () => {
    const outcome = plan(contextOn('saved-query.save'), saving(queryArgs(paid), { name: 'Paid', place: 'folder' }));
    expect(stepTexts(outcome)).toEqual([`write ${repoFolder}\\shop\\orders\\paid.json`]);
    const [step] = fileSteps(outcome);
    expect(step).toMatchObject({ action: 'write', path: `${repoFolder}\\shop\\orders\\paid.json` });
    expect(step?.content).toMatchObject({
      writer: 'saved-query.file',
      args: { queriesFolder: repoFolder, file: 'shop/orders/paid.json' },
    });
    expect(writtenText(step)).toBe(
      queryFileText({ name: 'Paid', database: 'shop', collection: 'orders', query: paid }),
    );
    expect(planOf(outcome).after).toContainEqual({
      kind: 'notify',
      level: 'success',
      text: 'Saved shop/orders/paid.json',
    });
    expect(planOf(outcome).danger).toEqual({ kind: 'none' });
  });

  it('replaces Paid for me without a question when it is saved again with another filter', () => {
    const outcome = plan(
      contextOn('saved-query.save'),
      saving(queryArgs(find('{ total: 1 }')), {
        list: listOf([mine('Paid'), mine('Other')]),
        name: 'Paid',
        place: 'me',
      }),
    );
    const queries = appArgs(outcome, 'saved-query.set-mine')['queries'] as readonly { name: string; query: unknown }[];
    expect(queries.map((each) => each.name)).toEqual(['Paid', 'Other']);
    expect(queries[0]?.query).toMatchObject({ filter: '{ total: 1 }' });
    expect(planOf(outcome).danger).toEqual({ kind: 'none' });
  });

  it('asks to replace Paid in the folder saved again with another filter, and overwrites the same file', () => {
    const list = listOf([inFolder('Paid', 'paid.json', paid, { description: 'Kept' })]);
    const outcome = plan(
      contextOn('saved-query.save'),
      saving(queryArgs(find('{ total: 1 }')), { list, name: 'Paid', place: 'folder' }),
    );
    expect(planOf(outcome)).toMatchObject({
      title: 'The folder already has a query of orders named "Paid". Replace it?',
      danger: { kind: 'confirm', text: 'Its file shop/orders/paid.json is overwritten.', button: 'Replace' },
    });
    expect(stepTexts(outcome)).toEqual([`write ${repoFolder}\\shop\\orders\\paid.json`]);
    expect(JSON.parse(writtenText(fileSteps(outcome)[0]))).toMatchObject({
      description: 'Kept',
      filter: '{ total: 1 }',
    });
  });

  it('writes again a query equal to the file of its name without asking, and offers In the folder first next time', () => {
    const list = listOf([inFolder('Paid', 'paid.json', paid)]);
    const outcome = plan(
      contextOn('saved-query.save'),
      saving(queryArgs(find("{status:'paid'}")), { list, name: 'Paid', place: 'folder' }),
    );
    expect(planOf(outcome).danger).toEqual({ kind: 'none' });
    expect(planOf(outcome).after).toContainEqual({ kind: 'remember', key: 'saved-query.save', value: 'folder' });
    const state = appState();
    const remembered = { ...state, runner: { ...state.runner, remembered: { 'saved-query.save': 'folder' } } };
    const where = questionOf(
      plan(contextOn('saved-query.save', undefined, remembered), saving(queryArgs(paid), { name: 'Next' })),
    );
    expect(where.fields[0]).toMatchObject({ default: 'folder', choices: [{ value: 'folder' }, { value: 'me' }] });
  });

  it('writes a new file beside a file of that name which names a connection', () => {
    const list = listOf([inFolder('Paid', 'paid.json', paid, { connection: 'Local' })]);
    const outcome = plan(
      contextOn('saved-query.save'),
      saving(queryArgs(find('{ total: 1 }')), { list, name: 'Paid', place: 'folder' }),
    );
    expect(planOf(outcome).danger).toEqual({ kind: 'none' });
    expect(fileSteps(outcome)[0]?.path).toBe(`${repoFolder}\\shop\\orders\\paid-2.json`);
    expect(writtenText(fileSteps(outcome)[0])).not.toContain('connection');
  });

  it('saves nothing with an empty filter, sort and projection, or a pipeline of no stages', () => {
    expect(plan(contextOn('saved-query.save'), answersWith(queryArgs(find(' ', '', '')), {}))).toEqual({
      kind: 'refuse',
      code: 'saved-query.save/empty',
      message: 'Nothing to save: filter, sort and projection are empty.',
    });
    expect(plan(contextOn('saved-query.save'), answersWith(queryArgs(pipeline()), {}))).toEqual({
      kind: 'refuse',
      code: 'saved-query.save/empty',
      message: 'Nothing to save: the pipeline has no stages.',
    });
  });

  it('refuses a text of the pipeline that does not parse', () => {
    const editor = { stages: [{ name: '$match', body: '{}', enabled: true }], text: { value: '[ { $match: ' } };
    const outcome = plan(contextOn('saved-query.save'), answersWith({ pipeline: editorJson(editor) }));
    expect(outcome).toMatchObject({ kind: 'refuse', code: 'saved-query.save/invalid-text' });
  });

  it('saves every stage of the pipeline editor, disabled ones included', () => {
    const editor = {
      stages: [
        { name: '$match', body: '{}', enabled: true },
        { name: '$sort', body: '{ a: 1 }', enabled: false },
      ],
    };
    const outcome = plan(
      contextOn('saved-query.save'),
      saving({ pipeline: editorJson(editor) }, { name: 'P', place: 'me' }),
    );
    const [saved] = appArgs(outcome, 'saved-query.set-mine')['queries'] as readonly { query: unknown }[];
    expect(saved?.query).toEqual({ kind: 'pipeline', stages: editor.stages });
  });

  it('starts Save with a name on a recent query empty, or with the name of the saved query equal to it', () => {
    const empty = questionOf(plan(contextOn('saved-query.save'), saving(queryArgs(paid))));
    expect(empty.fields[0] && 'default' in empty.fields[0]).toBe(false);
    const equal = questionOf(
      plan(contextOn('saved-query.save'), saving(queryArgs(find("{status:'paid'}")), { list: listOf([mine('Paid')]) })),
    );
    expect(equal.fields[0]).toMatchObject({ default: 'Paid' });
  });

  it('asks the name and not where for Save query in the folder…', () => {
    const name = questionOf(plan(contextOn('saved-query.save'), saving({ ...queryArgs(paid), place: 'folder' })));
    expect(name.title).toBe('Save query in the folder');
    const outcome = plan(
      contextOn('saved-query.save'),
      saving({ ...queryArgs(paid), place: 'folder' }, { name: 'Paid' }),
    );
    expect(stepTexts(outcome)).toEqual([`write ${repoFolder}\\shop\\orders\\paid.json`]);
  });

  it('saves on a read-only connection, for me and in the folder', () => {
    const readOnly = mongoConnection({ readOnly: true, queriesFolder: repoFolder });
    const context = contextOn('saved-query.save', undefined, stateWith([readOnly]));
    expect(planOf(plan(context, saving(queryArgs(paid), { name: 'Paid', place: 'me' }))).steps).toHaveLength(1);
    expect(planOf(plan(context, saving(queryArgs(paid), { name: 'Paid', place: 'folder' }))).steps).toHaveLength(1);
  });

  it('asks the queries folder of a connection without one, reads it, then saves the connection and writes the file', () => {
    const context = contextOn('saved-query.save', bare.id);
    const args = { ...queryArgs(paid), connection: bare.id };
    const where = questionOf(plan(context, saving(args, { name: 'Paid' })));
    expect(where.fields[0]).toMatchObject({
      choices: [{ value: 'me' }, { value: 'folder', description: 'a file in a folder you choose' }],
    });
    const folderQuestion = questionOf(plan(context, saving(args, { name: 'Paid', place: 'folder' })));
    expect(folderQuestion).toMatchObject({
      title: 'Queries folder of Bare',
      text: 'Choose the queries folder of Bare. Saved queries are written there as files, one per query, to be shared and versioned with git.',
      button: 'Choose folder…',
      fields: [{ key: 'folder' }],
    });
    const chosenAnswers = { name: 'Paid', place: 'folder', folder: 'D:\\team\\queries' };
    expect(plan(context, saving(args, chosenAnswers))).toEqual({
      kind: 'read',
      need: {
        key: 'chosen',
        read: 'saved-query.read-folder',
        args: { connection: 'c-bare', queriesFolder: 'D:\\team\\queries' },
      },
    });
    const taken = folderParse(
      [{ folder: 'D:\\team\\queries', files: [{ file: 'shop/orders/paid.json', size: 2, text: '{' }] }],
      null,
    );
    const outcome = plan(context, saving(args, { ...chosenAnswers, chosen: taken }));
    expect(stepTexts(outcome)).toEqual([
      'save the connection Bare',
      'write D:\\team\\queries\\shop\\orders\\paid-2.json',
    ]);
    expect(planOf(outcome).after).toContainEqual({
      kind: 'notify',
      level: 'info',
      text: 'Queries saved in the folder go to D:\\team\\queries.',
    });
  });

  it('writes nothing secret: not the connection string, not the name of the connection', () => {
    const outcome = plan(
      contextOn('saved-query.save', production.id),
      saving({ ...queryArgs(paid), connection: production.id }, { name: 'Paid', place: 'folder' }),
    );
    const text = writtenText(fileSteps(outcome)[0]);
    expect(text).not.toMatch(/Production|mongodb:|c-prod/u);
  });
});
