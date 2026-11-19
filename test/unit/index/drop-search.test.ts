import { describe, expect, it } from 'vitest';
import { plan } from '../../../src/features/index/drop-search';
import { contextOn, engineSteps, planOf, refusalOf, started } from './harness';

const context = contextOn(false, 'index.drop-search');

describe('index.drop-search', () => {
  it('asks Drop search index titles on movies? and drops it after its name is typed', () => {
    const shown = planOf(plan(context, started({ index: 'titles' }, 'movies')));
    expect(shown.title).toBe('Drop search index titles on movies?');
    expect(shown.danger).toEqual({
      kind: 'destructive',
      text: 'The $search, $searchMeta and $vectorSearch stages that use it will return no results. The server removes it in the background.',
      button: 'Drop',
      name: 'titles',
    });
    expect(shown.after).toEqual([{ kind: 'refresh', connection: 'c-local' }]);
  });

  it('shows the step db.movies.dropSearchIndex("titles") and says it cannot be undone', () => {
    const shown = planOf(plan(context, started({ index: 'titles' }, 'movies')));
    expect(shown.steps[0]?.text).toBe('db.movies.dropSearchIndex("titles")');
    expect(shown.undo).toEqual({ cannot: "An index is not a document: this can't be undone from the undo history." });
  });

  it('sends the drop of an index that no longer exists, for the server to name it', () => {
    const [step] = engineSteps(planOf(plan(context, started({ index: 'gone' }, 'movies'))));
    expect(step?.request).toMatchObject({ method: 'dropSearchIndex', arguments: ['gone'] });
  });

  it('is refused on a read-only connection', () => {
    expect(refusalOf(plan(contextOn(true, 'index.drop-search'), started({ index: 'titles' }, 'movies')))).toEqual({
      code: 'index.drop-search/read-only',
      text: 'The connection Production is read-only.',
    });
    expect(refusalOf(plan(context, started({ index: 'titles', view: true }, 'movies'))).code).toBe(
      'index.drop-search/view',
    );
  });
});
