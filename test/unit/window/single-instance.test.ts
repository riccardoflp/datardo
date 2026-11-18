import { describe, expect, it } from 'vitest';
import { plan } from '../../../src/features/window/single-instance';
import { contextFor, planOf, startedWith, stepTexts } from './context';

describe('window.single-instance', () => {
  it('shows the window, then brings it to the front', () => {
    expect(stepTexts(plan(contextFor('window.single-instance'), startedWith(null)))).toEqual([
      'show the window',
      'bring the window to the front',
    ]);
  });

  it('asks nothing and runs at once, so that an open confirmation stays open and unanswered', () => {
    expect(planOf(plan(contextFor('window.single-instance'), startedWith(null))).danger).toEqual({ kind: 'none' });
  });
});
