/**
 * The Content Security Policy of the window (R14.6, T7): only the application's own files, and while Datardo runs from
 * the sources, also what Vite's development server needs to start the page.
 */
import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy, developmentPolicy } from '../../../src/main/window-options';

function directives(policy: string): Readonly<Record<string, string>> {
  return Object.fromEntries(
    policy.split('; ').map((directive) => {
      const [name = '', ...values] = directive.split(' ');
      return [name, values.join(' ')];
    }),
  );
}

describe('the Content Security Policy of the window', () => {
  it('allows only the application’s own files: no inline script, no other host, no frame, no form', () => {
    expect(directives(contentSecurityPolicy)).toEqual({
      'default-src': "'self'",
      'script-src': "'self'",
      'style-src': "'self' 'unsafe-inline'",
      'img-src': "'self' data:",
      'font-src': "'self' data:",
      'connect-src': "'self'",
      'object-src': "'none'",
      'base-uri': "'none'",
      'form-action': "'none'",
      'frame-ancestors': "'none'",
    });
  });

  it('from the sources, also runs the inline script of the development server and reaches its socket, nothing else', () => {
    const development = directives(developmentPolicy('http://localhost:5173/'));
    expect(development['script-src']).toBe("'self' 'unsafe-inline'");
    expect(development['connect-src']).toBe("'self' ws://localhost:5173");
    const { 'script-src': _script, 'connect-src': _connect, ...rest } = development;
    const { 'script-src': _s, 'connect-src': _c, ...same } = directives(contentSecurityPolicy);
    expect(rest).toEqual(same);
  });
});
