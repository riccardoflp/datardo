import { describe, expect, it } from 'vitest';
import { EngineError } from '../../../src/engines/engine';
import { maskText, maskedError, secretsOf } from '../../../src/engines/transport/mask';
import { fromExtendedJson, toExtendedJson } from '../../../src/engines/mongodb/methods';

describe('the masking of secrets in the errors of the drivers', () => {
  const settings = {
    engine: 'mongodb' as const,
    connectionString: 'mongodb://ada:p%40ss@db1/?proxyPassword=px&authMechanismProperties=AWS_SESSION_TOKEN:tok',
    tls: { certificateKeyFilePassword: 'keypw' },
    ssh: { host: 'b', port: 22, username: 'u', authentication: 'password' as const, password: 'sshpw' },
    connectTimeoutMs: 1000,
  };

  it('finds every secret, written and decoded', () => {
    expect(secretsOf(settings)).toEqual(expect.arrayContaining(['p%40ss', 'p@ss', 'px', 'tok', 'keypw', 'sshpw']));
  });

  it('replaces each secret and any user:password@ by ***', () => {
    const secrets = secretsOf(settings);
    const text = maskText(`failed for mongodb://ada:p%40ss@db1 with p@ss, px, tok, keypw and sshpw`, secrets);
    expect(text).toBe('failed for mongodb://ada:***@db1 with ***, ***, ***, *** and ***');
    expect(maskText('redis://:other@cache', [])).toBe('redis://:***@cache');
  });

  it('keeps the code of the driver', () => {
    const error = Object.assign(new Error('WRONGPASS for p@ss'), { code: 'WRONGPASS' });
    const masked = maskedError(error, ['p@ss']);
    expect(masked).toBeInstanceOf(EngineError);
    expect(masked.message).toBe('WRONGPASS for ***');
    expect(masked.code).toBe('WRONGPASS');
  });
});

describe('the values of the MongoDB engine', () => {
  it('keep their BSON types through canonical Extended JSON', () => {
    const value = {
      i: { $numberInt: '1' },
      d: { $numberDouble: '1.0' },
      l: { $numberLong: '9007199254740993' },
      m: { $numberDecimal: '0.1' },
      b: { $binary: { base64: '/wBB', subType: '00' } },
    };
    expect(toExtendedJson(fromExtendedJson(value))).toEqual(value);
  });
});
