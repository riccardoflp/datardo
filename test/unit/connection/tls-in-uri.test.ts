import { describe, expect, it } from 'vitest';
import { tlsFromUri, tlsIntoUri } from '../../../src/features/connection/tls-in-uri';

describe('connection.tls-in-uri', () => {
  it('moves the files and the options out of the connection string', () => {
    expect(
      tlsFromUri(
        'mongodb://h:27017/db?tls=true&tlsCAFile=C%3A%5Ccerts%5Cca.pem&tlsCertificateKeyFile=%2Fk.pem&tlsCertificateKeyFilePassword=kp&tlsAllowInvalidHostnames=true&appName=x',
      ),
    ).toEqual({
      connectionString: 'mongodb://h:27017/db?appName=x',
      tls: {
        caFile: 'C:\\certs\\ca.pem',
        certificateKeyFile: '/k.pem',
        certificateKeyFilePassword: 'kp',
        allowInvalidHostnames: true,
      },
    });
  });

  it('reads tlsInsecure as both exceptions', () => {
    expect(tlsFromUri('mongodb://h/?ssl=true&tlsCAFile=ca.pem&tlsInsecure=true').tls).toEqual({
      caFile: 'ca.pem',
      allowInvalidCertificates: true,
      allowInvalidHostnames: true,
    });
  });

  it('leaves a connection string without files, or with TLS off, unchanged', () => {
    for (const text of [
      'mongodb://h/?tls=true&tlsAllowInvalidCertificates=true',
      'mongodb://h/?tls=false&tlsCAFile=ca.pem',
    ]) {
      expect(tlsFromUri(text)).toEqual({ connectionString: text });
    }
  });

  it('writes the settings in, with the key password only with the secrets', () => {
    const tls = {
      caFile: 'ca.pem',
      certificateKeyFile: 'k.pem',
      certificateKeyFilePassword: 'kp',
      allowInvalidCertificates: true,
    };
    expect(tlsIntoUri('mongodb://h/db?ssl=true', tls, 'with-secrets')).toBe(
      'mongodb://h/db?tls=true&tlsCAFile=ca.pem&tlsCertificateKeyFile=k.pem&tlsCertificateKeyFilePassword=kp&tlsAllowInvalidCertificates=true',
    );
    expect(tlsIntoUri('mongodb://h/db?ssl=true', tls, 'without-secrets')).toBe(
      'mongodb://h/db?tls=true&tlsCAFile=ca.pem&tlsCertificateKeyFile=k.pem&tlsAllowInvalidCertificates=true',
    );
    expect(tlsIntoUri('mongodb://h/db', undefined, 'with-secrets')).toBe('mongodb://h/db');
  });
});
