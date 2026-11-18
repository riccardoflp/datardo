/**
 * The sections **TLS / SSL** and **SSH tunnel** of the connection form (`connection.form`): their fields are disabled
 * while their checkbox is off; the SSH fields shown follow the authentication.
 */
import type { ConnectionForm } from '../../../shared/connection';
import { CheckField, ChoiceField, TextField } from './form-fields';
import { authenticationOf, Section, type PartProps } from './form-sections';

/** **TLS / SSL**: the two files, the key password and the two exceptions. */
export function TlsPart({ view, form, set, enter, browse }: PartProps): React.JSX.Element {
  const tls = form.tls;
  const fields = view.fields;
  const withTls = (change: Partial<ConnectionForm['tls']>): ConnectionForm => ({ ...form, tls: { ...tls, ...change } });
  const file = (name: 'ca-file' | 'certificate-key-file', key: 'caFile' | 'certificateKeyFile') => (
    <TextField
      name={name}
      field={fields[name]}
      value={tls[key]}
      onChange={(value) => {
        set(withTls({ [key]: value }), name);
      }}
      onEnter={enter}
      onBrowse={() => {
        browse(fields[name]?.browse?.title ?? '', 'certificate', (path) => {
          set(withTls({ [key]: path }), name);
        });
      }}
    />
  );
  return (
    <Section
      name="tls"
      title={view.sections.tls}
      on={tls.on}
      turn={(on) => {
        set(withTls({ on }));
      }}
    >
      {file('ca-file', 'caFile')}
      {file('certificate-key-file', 'certificateKeyFile')}
      <TextField
        name="key-password"
        field={fields['key-password']}
        value={tls.keyPassword}
        secret
        onChange={(keyPassword) => {
          set(withTls({ keyPassword }));
        }}
        onEnter={enter}
      />
      <CheckField
        name="allow-invalid-certificates"
        field={fields['allow-invalid-certificates']}
        checked={tls.allowInvalidCertificates}
        onChange={(allowInvalidCertificates) => {
          set(withTls({ allowInvalidCertificates }));
        }}
      />
      <CheckField
        name="allow-invalid-hostnames"
        field={fields['allow-invalid-hostnames']}
        checked={tls.allowInvalidHostnames}
        onChange={(allowInvalidHostnames) => {
          set(withTls({ allowInvalidHostnames }));
        }}
      />
    </Section>
  );
}

/** **SSH tunnel**: the server, its user, and how it authenticates. */
export function SshPart({ view, form, set, enter, browse }: PartProps): React.JSX.Element {
  const ssh = form.ssh;
  const fields = view.fields;
  const withSsh = (change: Partial<ConnectionForm['ssh']>): ConnectionForm => ({ ...form, ssh: { ...ssh, ...change } });
  type Text = 'host' | 'port' | 'username' | 'password' | 'privateKeyFile' | 'passphrase';
  const text = (name: 'ssh-host' | 'ssh-port' | 'ssh-username' | 'ssh-password' | 'passphrase', key: Text) => (
    <TextField
      name={name}
      field={fields[name]}
      value={ssh[key]}
      secret={name === 'ssh-password' || name === 'passphrase'}
      onChange={(value) => {
        set(withSsh({ [key]: value }), name === 'ssh-password' || name === 'passphrase' ? undefined : name);
      }}
      onEnter={enter}
    />
  );
  const key = fields['ssh-private-key'];
  return (
    <Section
      name="ssh"
      title={view.sections.ssh}
      on={ssh.on}
      turn={(on) => {
        set(withSsh({ on }));
      }}
    >
      {text('ssh-host', 'host')}
      {text('ssh-port', 'port')}
      {text('ssh-username', 'username')}
      <ChoiceField
        name="authentication"
        field={fields.authentication}
        value={ssh.authentication}
        choices={view.authentications}
        onChange={(value) => {
          set(withSsh({ authentication: authenticationOf(value) }));
        }}
      />
      {text('ssh-password', 'password')}
      <TextField
        name="ssh-private-key"
        field={key}
        value={ssh.privateKeyFile}
        onChange={(privateKeyFile) => {
          set(withSsh({ privateKeyFile }), 'ssh-private-key');
        }}
        onEnter={enter}
        onBrowse={() => {
          browse(key?.browse?.title ?? '', 'file', (privateKeyFile) => {
            set(withSsh({ privateKeyFile }), 'ssh-private-key');
          });
        }}
      />
      {text('passphrase', 'passphrase')}
      {view.agentHint === undefined ? null : <p>{view.agentHint}</p>}
    </Section>
  );
}
