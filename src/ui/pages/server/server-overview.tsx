/**
 * `server.overview` and `server.replication`: the tiles of the server from `INFO`, the table **Keys per database**
 * (a double click opens the keys tab of a database, `key.show`), and the replicas.
 */
import { view as overviewView, type OverviewTileName } from '../../../features/server/overview';
import { view as replicationView } from '../../../features/server/replication';
import { text } from '../../../features/server/text';
import { act } from './server-actions';
import { select } from './server-changes';
import { ServerGrid } from './server-grid';
import { ErrorLine, Tiles } from './server-parts';
import { overviewState, replicationState } from './server-state';
import type { ServerTab } from './server-store';
import styles from './server-page.module.css';

/** The Overview section. */
export function OverviewSection(props: {
  readonly tabId: string;
  readonly tab: ServerTab;
  readonly now: number;
}): React.JSX.Element {
  const { tabId } = props;
  const shown = overviewView(overviewState(props.tab, props.now));
  const databases = shown.databases;
  const columns = databases?.columns;
  return (
    <div className={styles['section']}>
      <ErrorLine text={shown.error} />
      <Tiles
        label={text.sections.overview}
        tiles={shown.tiles.map((tile) => ({ ...tile, key: tile.name }))}
        onSelect={(key) => {
          select(tabId, ({ database: _database, ...rest }) => ({ ...rest, overview: key as OverviewTileName }));
        }}
      />
      {databases === undefined || columns === undefined ? null : (
        <>
          <h3 className={styles['title']}>{databases.title}</h3>
          <ServerGrid
            label={databases.title}
            columns={[columns.database, columns.keys, columns.expires, columns.averageTtl].map((label) => ({ label }))}
            template="minmax(80px, 1fr) minmax(90px, 1fr) minmax(110px, 1fr) minmax(110px, 1fr)"
            rows={databases.rows.map((row) => ({
              id: String(row.database),
              selected: row.selected,
              cells: [{ text: row.name }, { text: row.keys }, { text: row.expires }, { text: row.averageTtl }],
            }))}
            onSelect={(id) => {
              select(tabId, ({ overview: _tile, database: _database, ...rest }) =>
                id === undefined ? rest : { ...rest, database: Number(id) },
              );
            }}
            onOpen={(id) => {
              const row = databases.rows.find((each) => String(each.database) === id);
              if (row !== undefined) {
                act(tabId, row.open, 'table');
              }
            }}
          />
        </>
      )}
      {shown.noKeys === undefined ? null : <p className={styles['notice']}>{shown.noKeys}</p>}
    </div>
  );
}

/** The Replication section. */
export function ReplicationSection(props: { readonly tabId: string; readonly tab: ServerTab }): React.JSX.Element {
  const { tabId } = props;
  const shown = replicationView(replicationState(props.tab));
  const replicas = shown.replicas;
  return (
    <div className={styles['section']}>
      <ErrorLine text={shown.error} />
      <Tiles
        label={text.sections.replication}
        tiles={shown.tiles.map((tile) => ({ ...tile, key: tile.label, lines: [], selected: false }))}
      />
      {shown.line === undefined ? null : <p className={styles['notice']}>{shown.line}</p>}
      {replicas === undefined ? null : (
        <ServerGrid
          label={text.window.tables.replicas}
          columns={Object.values(replicas.columns).map((label) => ({ label }))}
          template="minmax(140px, 2fr) repeat(4, minmax(80px, 1fr))"
          rows={replicas.rows.map((row) => ({
            id: row.name,
            selected: row.selected,
            cells: [
              { text: row.address },
              { text: row.state },
              { text: row.offset },
              { text: row.behind },
              { text: row.lag, tone: row.lagTone },
            ],
          }))}
          onSelect={(id) => {
            select(tabId, ({ replication: _replica, ...rest }) =>
              id === undefined ? rest : { ...rest, replication: id },
            );
          }}
        />
      )}
      {shown.noReplica === undefined ? null : <p className={styles['notice']}>{shown.noReplica}</p>}
    </div>
  );
}
