import { describe, expect, it } from 'vitest';
import { isPingReply } from '../../../src/shared/bridge';

describe('the bridge', () => {
  it('knows a ping reply of the main process', () => {
    expect(isPingReply({ name: 'Datardo', version: '0.1.0' })).toBe(true);
  });

  it('refuses a reply that is not one', () => {
    expect(isPingReply(null)).toBe(false);
    expect(isPingReply({ name: 'Mongoster', version: '0.8.0' })).toBe(false);
    expect(isPingReply({ name: 'Datardo' })).toBe(false);
  });
});
