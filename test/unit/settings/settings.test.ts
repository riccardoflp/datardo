import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { plan as changePlan, planChange } from '../../../src/features/settings/change';
import { open as openPage, settingGroups, view as pageView } from '../../../src/features/settings/page';
import { settingValue, settingsSchema } from '../../../src/features/settings/read';
import { changedSettings, isOffered, planReset } from '../../../src/features/settings/reset';
import { settingFromText, settingProblem } from '../../../src/features/settings/validate';
import { start as loadSettings, writeSetting } from '../../../src/main/settings';
import type { MainServices } from '../../../src/main/services';
import { start } from '../../../src/runner/start';
import type { AppAction } from '../../../src/runner/ports';
import type { Json } from '../../../src/shared/engine-request';
import type { Context, Outcome, Plan } from '../../../src/shared/feature';
import { featureId } from '../../../src/shared/ids';
import { initialState, reduce, type AppEvent, type AppState } from '../../../src/shared/state';
import type { SettingsState } from '../../../src/shared/state/settings';
import { appTarget } from '../../../src/shared/target';
import { harness } from '../runner/harness';

function context(settings: Partial<SettingsState> = {}): Context {
  return {
    feature: featureId('settings.change'),
    now: 0,
    platform: 'windows',
    startedBy: 'user',
    target: appTarget,
    state: { ...initialState, settings: { ...initialState.settings, ...settings } },
  };
}

function planOf(outcome: Outcome): Plan {
  if (outcome.kind !== 'run') {
    throw new Error(`Expected a plan, not ${outcome.kind}.`);
  }
  return outcome.plan;
}

describe('settings.validate', () => {
  it('says what a number outside its bounds should be', () => {
    expect(settingProblem(settingsSchema, 'datardo.window.zoom', '250')).toBe('Enter a whole number from 50 to 200.');
    expect(settingProblem(settingsSchema, 'datardo.undo.maxDays', '1.5')).toBe('Enter a whole number, 0 or more.');
    expect(settingProblem(settingsSchema, 'datardo.mcp.port', '80')).toBe('Enter a port from 1024 to 65535.');
    expect(settingProblem(settingsSchema, 'datardo.window.zoom', '110')).toBeUndefined();
  });

  it('accepts a separator that is not empty and holds no character of a pattern', () => {
    expect(settingProblem(settingsSchema, 'datardo.key.separator', '')).toBe("This can't be empty.");
    expect(settingProblem(settingsSchema, 'datardo.key.separator', '*')).toBe(
      "The separator can't contain *, ?, [, ] or \\.",
    );
    expect(settingProblem(settingsSchema, 'datardo.key.separator', '::')).toBeUndefined();
  });

  it('gives a value it accepts to settings.read, which never changes it', () => {
    for (const [name, text] of [
      ['datardo.window.zoom', '50'],
      ['datardo.window.zoom', '200'],
      ['datardo.undo.maxDays', '0'],
      ['datardo.mcp.port', '65535'],
      ['datardo.key.separator', '::'],
      ['datardo.undo.enabled', 'false'],
    ] as const) {
      const value = settingFromText(settingsSchema, name, text);
      expect(value).toBeDefined();
      expect(settingValue(settingsSchema, { [name]: value as Json }, name)).toBe(value);
    }
  });
});

describe('settings.change', () => {
  it('is one app step, set datardo.undo.maxDays to 14', () => {
    const plan = planOf(planChange(settingsSchema, context(), { args: { name: 'datardo.undo.maxDays', value: '14' } }));
    expect(plan.danger).toEqual({ kind: 'none' });
    expect(plan.steps).toEqual([
      {
        kind: 'app',
        action: 'settings.write',
        args: { name: 'datardo.undo.maxDays', value: 14 },
        text: 'set datardo.undo.maxDays to 14',
      },
    ]);
  });

  it('writes "datardo.undo.enabled": false when Keep the undo history is turned off', () => {
    const plan = planOf(
      planChange(settingsSchema, context(), { args: { name: 'datardo.undo.enabled', value: false } }),
    );
    expect(plan.steps[0]).toMatchObject({
      args: { name: 'datardo.undo.enabled', value: false },
      text: 'set datardo.undo.enabled to off',
    });
  });

  it('refuses a value settings.validate does not accept, with its message', () => {
    expect(planChange(settingsSchema, context(), { args: { name: 'datardo.window.zoom', value: '0' } })).toEqual({
      kind: 'refuse',
      code: 'settings.change/invalid',
      message: 'Enter a whole number from 50 to 200.',
    });
  });

  it('removes a setting set back to its default by hand', () => {
    const plan = planOf(planChange(settingsSchema, context(), { args: { name: 'datardo.undo.maxDays', value: '7' } }));
    expect(plan.steps[0]).toMatchObject({ args: { name: 'datardo.undo.maxDays', value: null } });
  });

  it('refuses a change when settings.json was written by a newer version', () => {
    const outcome = planChange(settingsSchema, context({ writable: false }), {
      args: { name: 'datardo.undo.maxDays', value: '14' },
    });
    expect(outcome).toMatchObject({ kind: 'refuse', code: 'settings.change/newer-version' });
  });

  it('writes [settings.change] set datardo.undo.maxDays to 14 in the Log', async () => {
    const written: Json[] = [];
    const write: AppAction = (args) => {
      written.push(args);
      return Promise.resolve();
    };
    const feature = {
      kind: 'operation' as const,
      id: featureId('settings.change'),
      plan: changePlan,
    };
    const test = harness({ features: [feature], appActions: { 'settings.write': write } });
    await start(test.ports, {
      feature: feature.id,
      target: appTarget,
      args: { name: 'datardo.undo.maxDays', value: '14' },
    });
    expect(written).toEqual([{ name: 'datardo.undo.maxDays', value: 14 }]);
    expect(test.log()[0]).toBe('[settings.change] set datardo.undo.maxDays to 14');
  });
});

describe('settings.reset', () => {
  it('puts the default of one setting back, and removes it from settings.json', () => {
    const plan = planOf(
      planReset(settingsSchema, context({ stored: { 'datardo.undo.maxDays': 14 } }), {
        args: { name: 'datardo.undo.maxDays' },
      }),
    );
    expect(plan.danger.kind).toBe('none');
    expect(plan.steps).toEqual([
      {
        kind: 'app',
        action: 'settings.write',
        args: { name: 'datardo.undo.maxDays', value: null },
        text: 'reset datardo.undo.maxDays to 7',
      },
    ]);
  });

  it('lists the settings changed with their values before resetting them all', () => {
    const stored = { 'datardo.undo.maxDays': 14, 'datardo.window.zoom': 120, 'datardo.mcp.enabled': true };
    const plan = planOf(planReset(settingsSchema, context({ stored }), { args: null }));
    expect(plan.danger).toEqual({
      kind: 'confirm',
      text: 'Reset all settings to their defaults?\nZoom: 120\nDays to keep: 14\nRun the MCP server: on',
      button: 'Reset all',
    });
    expect(plan.touches).toBe('3 settings');
    expect(plan.steps.map((step) => (step.kind === 'app' ? step.args : null))).toEqual([
      { name: 'datardo.window.zoom', value: null },
      { name: 'datardo.undo.maxDays', value: null },
      { name: 'datardo.mcp.enabled', value: null },
    ]);
  });

  it('is not offered when every setting is at its default', () => {
    expect(isOffered({ stored: {}, writable: true })).toBe(false);
    expect(isOffered({ stored: { 'datardo.undo.maxDays': 14 }, writable: true })).toBe(true);
  });

  it('touches nothing but the settings declared', () => {
    const stored = { 'datardo.undo.maxDays': 14, 'datardo.future.setting': 'kept' };
    expect(changedSettings(settingsSchema, { stored, writable: true })).toEqual(['datardo.undo.maxDays']);
    const plan = planOf(planReset(settingsSchema, context({ stored }), { args: null }));
    expect(plan.steps.every((step) => step.kind === 'app' && step.action === 'settings.write')).toBe(true);
  });
});

describe('settings.page', () => {
  const settings: SettingsState = { stored: {}, writable: true };

  it('lists every setting under its group, in the order of the page, with its default', () => {
    const page = pageView({ settings, filter: '' });
    expect(page.groupList).toEqual([...settingGroups]);
    const rows = page.groups.flatMap((group) => group.rows);
    expect(rows.map((row) => row.name).sort()).toEqual(Object.keys(settingsSchema.properties).sort());
    for (const row of rows) {
      expect(row.value).toBe(settingsSchema.properties[row.name]?.default);
      expect(row.changed).toBe(false);
    }
  });

  it('leaves Days to keep of Undo history for the filter "undo days"', () => {
    const page = pageView({ settings, filter: 'undo days' });
    expect(page.groups).toHaveLength(1);
    expect(page.groups[0]?.title).toBe('Undo history');
    expect(page.groups[0]?.rows.map((row) => row.title)).toEqual(['Days to keep']);
  });

  it('says no setting matches a filter that leaves nothing', () => {
    expect(pageView({ settings, filter: 'nothing like it' }).empty).toBe('No setting matches "nothing like it".');
  });

  it('marks a setting that differs from its default', () => {
    const page = pageView({ settings: { stored: { 'datardo.undo.maxDays': 14 }, writable: true }, filter: '' });
    const rows = page.groups.flatMap((group) => group.rows);
    expect(rows.find((row) => row.name === 'datardo.undo.maxDays')).toMatchObject({ changed: true, value: 14 });
    expect(rows.filter((row) => row.changed)).toHaveLength(1);
    expect(page.canResetAll).toBe(true);
  });

  it('disables the controls when settings.json was written by a newer version', () => {
    const page = pageView({ settings: { stored: {}, writable: false }, filter: '' });
    expect(page.disabled).toBe(true);
    expect(page.newerVersion).toBe(
      'These settings were written by a newer version of Datardo. Changes are not saved until Datardo is updated.',
    );
  });

  it('gives each control its kind', () => {
    const rows = pageView({ settings, filter: '' }).groups.flatMap((group) => group.rows);
    const control = (name: string): string | undefined => rows.find((row) => row.name === name)?.control;
    expect(control('datardo.undo.enabled')).toBe('switch');
    expect(control('datardo.undo.maxDays')).toBe('number');
    expect(control('datardo.window.theme')).toBe('menu');
    expect(control('datardo.key.separator')).toBe('text');
  });

  it('opens at a group when one is asked', async () => {
    const test = harness({ features: [openPage] });
    await start(test.ports, { feature: openPage.id, target: appTarget, args: { group: 'Undo history' } });
    expect(test.state().runner.opened).toMatchObject({ page: 'settings', at: 'Undo history' });
  });
});

describe('settings.change', () => {
  let folder: string | undefined;

  afterEach(async () => {
    if (folder !== undefined) {
      await rm(folder, { recursive: true, force: true });
    }
  });

  async function services(): Promise<{ services: MainServices; state: () => AppState; quit: () => Promise<void> }> {
    folder = await mkdtemp(join(tmpdir(), 'datardo-settings-'));
    let state = initialState;
    const flushes: (() => Promise<void>)[] = [];
    const holder = { get: () => state, dispatch: (event: AppEvent) => (state = reduce(state, event)) };
    const made = {
      state: holder,
      dataFolder: folder,
      window: () => undefined,
      onQuit: (flush: () => Promise<void>) => flushes.push(flush),
    } as unknown as MainServices;
    return {
      services: made,
      state: () => state,
      quit: async () => {
        await Promise.all(flushes.map((flush) => flush()));
      },
    };
  }

  it('keeps a change with its version, and writes no setting left at its default', async () => {
    const test = await services();
    await loadSettings(test.services);
    writeSetting(test.services, 'datardo.undo.maxDays', 14);
    writeSetting(test.services, 'datardo.undo.enabled', false);
    writeSetting(test.services, 'datardo.undo.enabled', null);
    await test.quit();
    const written = JSON.parse(await readFile(join(folder ?? '', 'settings.json'), 'utf8')) as Record<string, Json>;
    expect(written).toEqual({ version: 1, 'datardo.undo.maxDays': 14 });
    expect(test.state().settings.stored).toEqual({ 'datardo.undo.maxDays': 14 });
  });

  it('loads what was stored, and keeps a name this version does not declare', async () => {
    const test = await services();
    await writeFile(
      join(folder ?? '', 'settings.json'),
      JSON.stringify({ version: 1, 'datardo.window.zoom': 120, 'datardo.future': 1 }),
    );
    await loadSettings(test.services);
    expect(test.state().settings).toEqual({
      stored: { 'datardo.window.zoom': 120, 'datardo.future': 1 },
      writable: true,
    });
  });

  it('never overwrites a settings.json of a newer version', async () => {
    const test = await services();
    const newer = JSON.stringify({ version: 2, 'datardo.window.zoom': 120 });
    await writeFile(join(folder ?? '', 'settings.json'), newer);
    await loadSettings(test.services);
    expect(test.state().settings.writable).toBe(false);
    expect(() => {
      writeSetting(test.services, 'datardo.window.zoom', 150);
    }).toThrow();
    await test.quit();
    expect(await readFile(join(folder ?? '', 'settings.json'), 'utf8')).toBe(newer);
    expect(test.state().runner.notifications.at(-1)).toMatchObject({ level: 'warning' });
  });
});
