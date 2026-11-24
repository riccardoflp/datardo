/**
 * `connection.overview`: the page of a connection. Connected, it reads the server (`connection.server-info`) when it
 * opens, and again with **Refresh**, `F5` or **Retry**; it does not read again by itself. Not connected, it reads
 * nothing.
 */
import { useEffect, useState } from 'react';
import { view, type Loaded, type OverviewButton, type OverviewView } from '../../../features/connection/overview';
import type { ServerInfo } from '../../../shared/connection';
import type { Json } from '../../../shared/engine-request';
import { featureId, type ConnectionId } from '../../../shared/ids';
import { activeTabOf } from '../../../shared/state/tabs';
import { startFeature } from '../../shell/intent';
import { useAppState } from '../../state/store';
import styles from './connection-pages.module.css';
import { colorAttributes } from '../../components/color';

async function readServer(args: Json): Promise<Loaded<ServerInfo>> {
  const result = await window.datardo.start({
    feature: featureId('connection.server-info'),
    target: appTarget(args),
    place: 'toolbar',
    args,
  });
  if (result.kind === 'read') {
    return { kind: 'loaded', value: result.result as ServerInfo };
  }
  return { kind: 'failed', error: result.kind === 'refused' || result.kind === 'failed' ? result.message : '' };
}

function appTarget(args: Json): { readonly kind: 'connection'; readonly connection: ConnectionId } {
  const connection = (args as { connection?: unknown } | null)?.connection;
  return { kind: 'connection', connection: String(connection) as ConnectionId };
}

function Rows({ rows }: { readonly rows: readonly { readonly label: string; readonly value: string }[] }) {
  return (
    <dl className={styles['rows']}>
      {rows.map((row) => (
        <div key={row.label} className={styles['pair']}>
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Server({
  page,
  reading,
  retry,
}: {
  readonly page: OverviewView;
  readonly reading: boolean;
  readonly retry: () => void;
}) {
  const server = page.server;
  if (server === undefined) {
    return null;
  }
  const section = server.section;
  return (
    <section
      className={styles['part']}
      aria-label={server.title}
      aria-busy={reading}
      data-reading={reading && section.kind !== 'loading' ? 'true' : undefined}
    >
      <h2 className={styles['partTitle']}>{server.title}</h2>
      {section.kind === 'loading' ? (
        <p className={`${styles['muted'] ?? ''} ${styles['loading-sign'] ?? ''}`}>{section.text}</p>
      ) : null}
      {section.kind === 'failed' ? (
        <p className={styles['error']} role="alert">
          {section.error}{' '}
          <button type="button" className={styles['button']} onClick={retry}>
            {section.retry}
          </button>
        </p>
      ) : null}
      {section.kind === 'loaded' ? <Rows rows={section.rows} /> : null}
      {section.kind === 'loaded' && section.hosts !== undefined ? (
        <table className={styles['table']} aria-label={section.hosts.title}>
          <tbody>
            {section.hosts.rows.map(([host, role]) => (
              <tr key={host}>
                <td>{host}</td>
                <td>{role}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}

function Header({
  page,
  refresh,
  connection,
}: {
  readonly page: OverviewView;
  readonly refresh: () => void;
  readonly connection: ConnectionId;
}) {
  const press = (button: OverviewButton): void => {
    if (button.feature === 'connection.server-info') {
      refresh();
    } else {
      startFeature(button.feature, { place: 'toolbar', target: { kind: 'connection', connection } });
    }
  };
  return (
    <header className={styles['header']}>
      <h1 className={styles['heading']}>
        <span className={styles['dot']} {...colorAttributes(page.color)} aria-hidden="true" />
        {page.name} <span className={styles['engine']}>{page.engine}</span>
      </h1>
      <span className={styles['muted']}>{page.state}</span>
      {page.readOnly === undefined ? null : <span className={styles['badge']}>{page.readOnly}</span>}
      <div className={styles['toolbar']} role="toolbar" aria-label={page.name}>
        {page.buttons.map((button) => (
          <button
            key={button.element}
            type="button"
            className={styles['button']}
            data-feature={button.element}
            onClick={() => {
              press(button);
            }}
          >
            {button.label}
          </button>
        ))}
      </div>
    </header>
  );
}

/** What the page has read, and for which read: another read keeps it shown until it ends. */
interface Read {
  readonly asked: string;
  readonly server: Loaded<ServerInfo>;
}

/**
 * What the page read last of each connection: the page of a tab coming back shows it while it reads again, as
 * **Refresh** does, so that nothing is replaced by **Loading…** meanwhile.
 */
const lastRead = new Map<ConnectionId, Loaded<ServerInfo>>();

/** Reads the server while connected: when the page opens, and each time `refresh` is called. */
function useServer(
  connection: ConnectionId,
  read: Json | undefined,
): { readonly server?: Loaded<ServerInfo>; readonly reading: boolean; readonly refresh: () => void } {
  const [times, setTimes] = useState(0);
  const [done, setDone] = useState<Read | undefined>(() => {
    const kept = lastRead.get(connection);
    return kept === undefined ? undefined : { asked: '', server: kept };
  });
  const asked = read === undefined ? '' : `${String(times)} ${JSON.stringify(read)}`;
  useEffect(() => {
    if (asked === '') {
      return undefined;
    }
    let shown = true;
    void readServer(JSON.parse(asked.slice(asked.indexOf(' ') + 1)) as Json).then((server) => {
      lastRead.set(connection, server);
      if (shown) {
        setDone({ asked, server });
      }
    });
    return () => {
      shown = false;
    };
  }, [asked, connection]);
  const refresh = (): void => {
    setTimes((count) => count + 1);
  };
  if (asked === '') {
    return { reading: false, refresh };
  }
  return { server: done?.server ?? { kind: 'loading' }, reading: done?.asked !== asked, refresh };
}

function OverviewTab({ connection }: { readonly connection: ConnectionId }): React.JSX.Element | null {
  const state = useAppState();
  const latency = state.nav.latency;
  const latencyMs = latency?.connection === connection ? latency.milliseconds : undefined;
  const connected = view({ connections: state.connections, connection });
  const { server, reading, refresh } = useServer(connection, connected?.read);
  const page = view({
    connections: state.connections,
    connection,
    ...(latencyMs === undefined ? {} : { latencyMs }),
    ...(server === undefined ? {} : { server }),
  });
  if (page === undefined) {
    return null;
  }
  return (
    <div
      className={styles['page']}
      onKeyDown={(event) => {
        if (event.key === 'F5') {
          event.preventDefault();
          refresh();
        }
      }}
    >
      <Header page={page} refresh={refresh} connection={connection} />
      <section className={styles['part']} aria-label={page.connection.title}>
        <h2 className={styles['partTitle']}>{page.connection.title}</h2>
        <Rows rows={page.connection.rows} />
        {page.connection.lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </section>
      <Server page={page} reading={reading} retry={refresh} />
    </div>
  );
}

/** The Overview of the connection of the active tab. */
export function OverviewPage(): React.JSX.Element | null {
  const active = activeTabOf(useAppState().tabs);
  const shows = active?.shows;
  if (active === undefined || shows?.kind !== 'page') {
    return null;
  }
  return <OverviewTab key={active.id} connection={shows.connection} />;
}
