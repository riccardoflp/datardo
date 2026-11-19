import { describe, expect, it } from 'vitest';
import * as copyString from '../../../src/features/connection/copy-string';
import * as duplicate from '../../../src/features/connection/duplicate';
import { view as folderMenu } from '../../../src/features/connection/folder-menu';
import * as linkRedis from '../../../src/features/connection/link-redis';
import * as moveToFolder from '../../../src/features/connection/move-to-folder';
import * as removeFolder from '../../../src/features/connection/remove-folder';
import * as renameFolder from '../../../src/features/connection/rename-folder';
import * as setColor from '../../../src/features/connection/set-color';
import * as unlinkRedis from '../../../src/features/connection/unlink-redis';
import type { ConnectionView } from '../../../src/shared/connection';
import type { Answers, Outcome, Plan } from '../../../src/shared/feature';
import type { Question } from '../../../src/shared/question';
import { connectionId } from '../../../src/shared/ids';
import { contextOf, mongoConnection, on, redisConnection, stateWith } from './context';

const local = mongoConnection();
const cache = redisConnection();

function planOf(outcome: Outcome): Plan {
  if (outcome.kind !== 'run') {
    throw new Error(`Expected a plan, got ${outcome.kind}`);
  }
  return outcome.plan;
}

function questionOf(outcome: Outcome): Question {
  if (outcome.kind !== 'ask') {
    throw new Error(`Expected a question, got ${outcome.kind}`);
  }
  return outcome.question;
}

function choicesOf(outcome: Outcome): readonly string[] {
  const field = questionOf(outcome).fields[0];
  return field?.kind === 'pick-one' || field?.kind === 'pick-many' ? field.choices.map((each) => each.label) : [];
}

function on2(saved: readonly ConnectionView[], feature: string, connection: ConnectionView = local) {
  return contextOf(feature, stateWith(saved), on(connection));
}

describe('connection.copy-string', () => {
  const context = on2([local], 'connection.copy-string');

  it('asks the main process for the copy, with the name only', () => {
    expect(copyString.request(context, null)).toEqual({
      kind: 'app',
      action: 'connection.copy-string',
      args: { connection: 'c-local', name: 'Local' },
    });
  });

  it('tells that it was copied, and logs the name, not the text', () => {
    const result = copyString.parse([{ copied: true, name: 'Local' }], { name: 'Local' });
    expect(copyString.after(result, context)).toEqual([
      { kind: 'notify', level: 'success', text: 'Connection string copied (it may contain the password)' },
      { kind: 'log', text: 'copied the connection string of Local' },
    ]);
  });

  it('says nothing when nothing was copied', () => {
    expect(copyString.after(copyString.parse([{ copied: false }], { name: 'Local' }), context)).toEqual([]);
  });
});

describe('connection.duplicate', () => {
  it('saves Local (2), then Local (3) when that name is taken', () => {
    const first = planOf(duplicate.plan(on2([local], 'connection.duplicate'), {}));
    expect(first.steps[0]).toMatchObject({
      action: 'connection.duplicate',
      args: { connection: 'c-local', name: 'Local (2)' },
    });
    const taken = mongoConnection({ id: connectionId('c-two'), name: 'Local (2)' });
    const second = planOf(duplicate.plan(on2([local, taken], 'connection.duplicate'), {}));
    expect(second.steps[0]).toMatchObject({ args: { name: 'Local (3)' } });
  });

  it('gives the copy a new id, and offers to edit it', () => {
    const plan = planOf(duplicate.plan(on2([local], 'connection.duplicate'), {}));
    const copy = (plan.steps[0] as unknown as { args: { copy: string } }).args.copy;
    expect(copy).not.toBe('c-local');
    expect(plan.after[0]).toMatchObject({
      kind: 'notify',
      text: 'Connection Local (2) added',
      actions: [{ label: 'Edit connection…', feature: 'connection.edit', target: { connection: copy } }],
    });
  });
});

describe('connection.set-color', () => {
  const context = on2([local], 'connection.set-color');

  it('offers the colors and None, the current one said', () => {
    const red = on2([mongoConnection({ color: 'red' })], 'connection.set-color', mongoConnection({ color: 'red' }));
    const field = questionOf(setColor.plan(red, {})).fields[0];
    expect(field?.kind === 'pick-one' && field.choices.find((each) => each.value === 'red')?.description).toBe(
      'current',
    );
    expect(choicesOf(setColor.plan(context, {})).at(-1)).toBe('None');
  });

  it('sets the color chosen, and None removes it', () => {
    expect(planOf(setColor.plan(context, { color: 'red' })).steps[0]).toMatchObject({
      action: 'connection.set-color',
      args: { connection: 'c-local', color: 'red' },
      text: 'set the color of Local to red',
    });
    const red = mongoConnection({ color: 'red' });
    expect(planOf(setColor.plan(on2([red], 'connection.set-color', red), { color: 'none' })).steps[0]).toMatchObject({
      args: { color: null },
    });
  });

  it('changes nothing for the color it has', () => {
    expect(planOf(setColor.plan(context, { color: 'none' })).steps).toEqual([]);
  });
});

describe('connection.move-to-folder', () => {
  const work = mongoConnection({ folder: 'Work' });
  const clients = redisConnection({ folder: 'Clients' });

  it('does not offer the current folder, and offers No folder to a connection in one', () => {
    const labels = choicesOf(moveToFolder.plan(on2([work, clients], 'connection.move-to-folder', work), {}));
    expect(labels).toEqual(['Clients', 'New folder…', 'No folder']);
  });

  it('moves into a folder in use, of either engine', () => {
    const plan = planOf(
      moveToFolder.plan(on2([work, clients], 'connection.move-to-folder', work), { folder: 'folder:Clients' }),
    );
    expect(plan.steps[0]).toMatchObject({
      args: { connection: 'c-local', folder: 'Clients' },
      text: 'move Local to the folder Clients',
    });
  });

  it('asks the name of a new folder; one with the name of a folder in use moves into it', () => {
    const context = on2([work, clients], 'connection.move-to-folder', work);
    expect(questionOf(moveToFolder.plan(context, { folder: 'new-folder' })).fields[0]).toMatchObject({
      key: 'folderName',
      rules: [{ kind: 'not-empty', message: 'Enter a name' }],
    });
    expect(
      planOf(moveToFolder.plan(context, { folder: 'new-folder', folderName: ' Clients ' })).steps[0],
    ).toMatchObject({
      args: { folder: 'Clients' },
    });
  });

  it('moves out of its folder with No folder', () => {
    const plan = planOf(moveToFolder.plan(on2([work], 'connection.move-to-folder', work), { folder: 'no-folder' }));
    expect(plan.steps[0]).toMatchObject({ args: { folder: null }, text: 'move Local out of its folder' });
  });
});

describe('connection.rename-folder', () => {
  const work = mongoConnection({ folder: 'Work' });
  const clients = redisConnection({ folder: 'Clients' });
  const context = contextOf('connection.rename-folder', stateWith([work, clients]));
  const args: Answers = { args: { folder: 'Work' } };

  it('moves every connection of the folder to the trimmed name', () => {
    expect(planOf(renameFolder.plan(context, { ...args, name: '  Office ' })).steps[0]).toMatchObject({
      action: 'connection.rename-folder',
      args: { folder: 'Work', name: 'Office' },
    });
  });

  it('changes nothing for the same name', () => {
    expect(planOf(renameFolder.plan(context, { ...args, name: 'Work' })).steps).toEqual([]);
  });

  it('refuses the name of another folder with This folder already exists', () => {
    const field = questionOf(renameFolder.plan(context, args)).fields[0];
    expect(field).toMatchObject({ default: 'Work' });
    expect(field?.kind === 'text' ? field.rules : []).toContainEqual({
      kind: 'not-one-of',
      values: ['Clients'],
      message: 'This folder already exists',
    });
    expect(planOf(renameFolder.plan(context, { ...args, name: 'Clients' })).steps).toEqual([]);
  });
});

describe('connection.remove-folder', () => {
  it('takes the connections out of the folder, keeping them', () => {
    const work = mongoConnection({ folder: 'Work' });
    const plan = planOf(
      removeFolder.plan(contextOf('connection.remove-folder', stateWith([work])), { args: { folder: 'Work' } }),
    );
    expect(plan.steps).toEqual([
      {
        kind: 'app',
        action: 'connection.rename-folder',
        args: { folder: 'Work', name: null },
        text: 'remove the folder Work',
      },
    ]);
    expect(plan.danger.kind).toBe('none');
  });
});

describe('connection.link-redis', () => {
  it('offers only the Redis connections, then Add Redis connection…', () => {
    expect(choicesOf(linkRedis.plan(on2([local, cache], 'connection.link-redis'), {}))).toEqual([
      'Cache local',
      'Add Redis connection…',
    ]);
  });

  it('with none saved, Add Redis connection… opens the Redis form and links nothing', () => {
    const plan = planOf(linkRedis.plan(on2([local], 'connection.link-redis'), { redis: 'add' }));
    expect(plan.steps).toEqual([]);
    expect(plan.after[0]).toMatchObject({ kind: 'start', feature: 'tab.open' });
  });

  it('links to the id of the Redis connection; another one replaces the link', () => {
    const linked = mongoConnection({ publishesTo: cache.id });
    const other = redisConnection({ id: connectionId('c-other'), name: 'Other' });
    const plan = planOf(
      linkRedis.plan(on2([linked, cache, other], 'connection.link-redis', linked), { redis: 'c-other' }),
    );
    expect(plan.steps[0]).toMatchObject({ action: 'connection.link', args: { connection: 'c-local', to: 'c-other' } });
  });

  it('offers nothing on a Redis connection', () => {
    expect(planOf(linkRedis.plan(on2([cache], 'connection.link-redis', cache), {})).steps).toEqual([]);
  });
});

describe('connection.unlink-redis', () => {
  it('removes the link only, and says writes are no longer published', () => {
    const linked = mongoConnection({ publishesTo: cache.id });
    const plan = planOf(unlinkRedis.plan(on2([linked, cache], 'connection.unlink-redis', linked), {}));
    expect(plan.title).toBe('Unlink Cache local');
    expect(plan.steps).toEqual([
      { kind: 'app', action: 'connection.unlink', args: { connection: 'c-local' }, text: expect.any(String) as string },
    ]);
    expect(plan.after[0]).toMatchObject({
      kind: 'notify',
      text: 'Writes through Local are no longer published for redis-oplog.',
    });
  });
});

describe('connection.folder-menu', () => {
  it('offers its entries, each starting its feature with the folder', () => {
    const menu = folderMenu({ folder: 'Work', place: 'home' });
    expect(menu.element).toBe('connection.folder-menu@home');
    expect(menu.entries.map((each) => (each.kind === 'item' ? each.feature : '—'))).toEqual([
      'connection.add',
      '—',
      'connection.rename-folder',
      'connection.remove-folder',
      '—',
      'connection.import',
      'connection.export',
    ]);
  });

  it('gives each entry the element of its place', () => {
    const menu = folderMenu({ folder: 'Work', place: 'connection-switcher' });
    expect(menu.entries.flatMap((each) => (each.kind === 'item' ? [each.element] : []))).toEqual([
      'connection.add@connection-switcher',
      'connection.rename-folder@connection-switcher',
      'connection.remove-folder@connection-switcher',
      'connection.import@connection-switcher',
      'connection.export@connection-switcher',
    ]);
  });
});
