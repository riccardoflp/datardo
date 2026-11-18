import { describe, expect, it } from 'vitest';
import { encodePassword, withSecrets, withoutSecrets } from '../../../src/features/connection/string-secrets';

describe('connection.string-secrets', () => {
  it('takes the password out', () => {
    expect(withoutSecrets('mongodb://ada:p%40ss@db1:27017/app', 'shown')).toEqual({
      connectionString: 'mongodb://ada@db1:27017/app',
      secrets: { password: 'p%40ss', options: {} },
    });
    expect(withoutSecrets('redis://:s3cret@cache/1', 'shown')).toEqual({
      connectionString: 'redis://cache/1',
      secrets: { password: 's3cret', options: {} },
    });
  });

  it('leaves a secret option empty when shown, and removes it when removed', () => {
    const text = 'mongodb://ada@h/?proxyHost=p&proxyPassword=pp&appName=x';
    expect(withoutSecrets(text, 'shown')).toEqual({
      connectionString: 'mongodb://ada@h/?proxyHost=p&proxyPassword=&appName=x',
      secrets: { options: { proxyPassword: 'pp' } },
    });
    expect(withoutSecrets(text, 'removed').connectionString).toBe('mongodb://ada@h/?proxyHost=p&appName=x');
  });

  it('takes the session token out of authMechanismProperties', () => {
    const text = 'mongodb://k:s@h/?authMechanism=MONGODB-AWS&authMechanismProperties=AWS_SESSION_TOKEN:tok';
    expect(withoutSecrets(text, 'shown')).toEqual({
      connectionString: 'mongodb://k@h/?authMechanism=MONGODB-AWS&authMechanismProperties=AWS_SESSION_TOKEN:',
      secrets: { password: 's', options: { AWS_SESSION_TOKEN: 'tok' } },
    });
    expect(withoutSecrets(text, 'removed').connectionString).toBe('mongodb://k@h/?authMechanism=MONGODB-AWS');
    expect(
      withoutSecrets('mongodb://h/?authMechanismProperties=SERVICE_NAME:x,AWS_SESSION_TOKEN:tok', 'removed')
        .connectionString,
    ).toBe('mongodb://h/?authMechanismProperties=SERVICE_NAME:x');
  });

  it('compares option names ignoring case and keeps the spelling of the others', () => {
    expect(withoutSecrets('mongodb://h/?ProxyPassword=pp&APPNAME=x', 'shown')).toEqual({
      connectionString: 'mongodb://h/?ProxyPassword=&APPNAME=x',
      secrets: { options: { proxyPassword: 'pp' } },
    });
  });

  it('leaves a connection string with no secret unchanged', () => {
    const text = 'mongodb://CN=me@h/?authMechanism=MONGODB-X509';
    expect(withoutSecrets(text, 'shown')).toEqual({ connectionString: text, secrets: { options: {} } });
    expect(withoutSecrets('mongodb://a:1,b:2/db?replicaSet=rs0', 'removed').connectionString).toBe(
      'mongodb://a:1,b:2/db?replicaSet=rs0',
    );
  });

  it('puts a typed password back, percent-encoded', () => {
    expect(withSecrets('mongodb://ada@db1/app', { password: encodePassword('p@ss'), options: {} })).toBe(
      'mongodb://ada:p%40ss@db1/app',
    );
    expect(withSecrets('redis://cache/1', { password: encodePassword('p@ss'), options: {} })).toBe(
      'redis://:p%40ss@cache/1',
    );
  });

  it('puts the secret options back in their place, or at the end', () => {
    expect(
      withSecrets('mongodb://ada@h/?proxyHost=p&proxyPassword=&appName=x', { options: { proxyPassword: 'pp' } }),
    ).toBe('mongodb://ada@h/?proxyHost=p&proxyPassword=pp&appName=x');
    expect(withSecrets('mongodb://h/db', { options: { tlsCertificateKeyFilePassword: 'kp' } })).toBe(
      'mongodb://h/db?tlsCertificateKeyFilePassword=kp',
    );
    expect(
      withSecrets('mongodb://k@h/?authMechanismProperties=SERVICE_NAME:x,AWS_SESSION_TOKEN:', {
        options: { AWS_SESSION_TOKEN: 'new' },
      }),
    ).toBe('mongodb://k@h/?authMechanismProperties=SERVICE_NAME:x,AWS_SESSION_TOKEN:new');
    expect(withSecrets('mongodb://k@h/', { options: { AWS_SESSION_TOKEN: 't' } })).toBe(
      'mongodb://k@h/?authMechanismProperties=AWS_SESSION_TOKEN:t',
    );
  });

  it('gives back the connection string it took the secrets from', () => {
    const text =
      'mongodb://ada:p%40ss@db1:27017,db2/app?proxyPassword=pp&authMechanismProperties=AWS_SESSION_TOKEN:tok&w=1';
    const { connectionString, secrets } = withoutSecrets(text, 'shown');
    expect(withSecrets(connectionString, secrets)).toBe(text);
  });
});
