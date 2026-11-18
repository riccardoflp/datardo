import { describe, expect, it } from 'vitest';
import { folderNotOpenedError, plan } from '../../../src/features/window/open-data-folder';
import { contextFor, planOf, startedWith, stepTexts } from './context';

describe('window.open-data-folder', () => {
  it('opens the data folder in use in the file manager', () => {
    const dataFolder = 'C:\\Users\\me\\AppData\\Roaming\\Datardo';
    const context = contextFor('window.open-data-folder', { app: { dataFolder } });
    expect(stepTexts(plan(context, startedWith(null)))).toEqual([`open ${dataFolder} in the file manager`]);
  });

  it('opens the folder DATARDO_DATA names when it is the one in use', () => {
    const context = contextFor('window.open-data-folder', { app: { dataFolder: 'D:\\tmp\\datardo-test' } });
    expect(planOf(plan(context, startedWith(null))).steps[0]).toMatchObject({
      action: 'window.open-folder',
      args: { folder: 'D:\\tmp\\datardo-test' },
    });
  });

  it('says the path when the folder cannot be opened', () => {
    expect(folderNotOpenedError('D:\\tmp\\datardo-test')).toEqual({
      code: 'window.open-data-folder/failed',
      message: 'The data folder could not be opened: D:\\tmp\\datardo-test.',
    });
  });
});
