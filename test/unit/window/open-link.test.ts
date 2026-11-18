import { describe, expect, it } from 'vitest';
import { isWebLink, plan } from '../../../src/features/window/open-link';
import { contextFor, startedWith, stepTexts } from './context';

describe('window.open-link', () => {
  it('opens a web link in the browser', () => {
    const address = 'https://github.com/riccardoflp/datardo/issues';
    const outcome = plan(contextFor('window.open-link'), startedWith({ address }));
    expect(stepTexts(outcome)).toEqual([`open ${address} in the browser`]);
  });

  it('refuses a link to file:///C:/Windows/win.ini', () => {
    const outcome = plan(contextFor('window.open-link'), startedWith({ address: 'file:///C:/Windows/win.ini' }));
    expect(outcome).toMatchObject({ kind: 'refuse', code: 'window.open-link/scheme' });
  });

  it('refuses a link to javascript:alert(1)', () => {
    expect(plan(contextFor('window.open-link'), startedWith('javascript:alert(1)'))).toMatchObject({
      kind: 'refuse',
      code: 'window.open-link/scheme',
    });
  });

  it('knows web links from the rest', () => {
    expect(isWebLink('http://example.com')).toBe(true);
    expect(isWebLink('HTTPS://example.com/a?b=c')).toBe(true);
    expect(isWebLink('mailto:someone@example.com')).toBe(false);
    expect(isWebLink('https://')).toBe(false);
  });
});
