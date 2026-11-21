/**
 * `server.memory` and `server.largest-keys`: the tiles of `MEMORY STATS`, where the overhead goes, the advice of the
 * server, and the largest keys of a database with its **Database** menu, **Find largest keys**, the line that says how
 * far the search went, **Examine 100,000 more**, **Cancel** while it runs, and the table of the keys found.
 */
import { useState } from 'react';
import { view, type LargestKeysView, type MemoryTileName } from '../../../features/server/memory';
import { text } from '../../../features/server/text';
import { hexOf } from '../../../features/server/types';
import type { ConnectionView } from '../../../shared/connection';
import { act } from './server-actions';
import { select } from './server-changes';
import { ServerGrid } from './server-grid';
import { cancelLargestKeys, chooseDatabase } from './server-largest';
import { ControlButton, ErrorLine, ServerMenu, Tiles, type OpenMenu } from './server-parts';
import { memoryState } from './server-state';
import type { ServerTab } from './server-store';
import styles from './server-page.module.css';

function LargestToolbar(props: { readonly tabId: string; readonly part: LargestKeysView; readonly running: boolean }) {
  const { tabId, part } = props;
  return (
    <div className={styles['toolbar']} role="toolbar" aria-label={part.title}>
      <label className={styles['field']}>
        <span>{part.database.label}</span>
        <select
          className={styles['input']}
          value={part.database.value === undefined ? '' : String(part.database.value)}
          onChange={(event) => {
            chooseDatabase(tabId, Number(event.target.value));
          }}
        >
          {part.database.choices.map((choice) => (
            <option key={choice.database} value={String(choice.database)}>
              {choice.label}
            </option>
          ))}
        </select>
      </label>
      <ControlButton tab={tabId} control={part.find} place="toolbar" />
      {props.running ? (
        <button
          type="button"
          className={styles['button']}
          onClick={() => {
            cancelLargestKeys(tabId);
          }}
        >
          {text.window.cancel}
        </button>
      ) : null}
    </div>
  );
}

function LargestKeys(props: { readonly tabId: string; readonly tab: ServerTab; readonly part: LargestKeysView }) {
  const { tabId, tab, part } = props;
  const [menu, setMenu] = useState<OpenMenu | undefined>(undefined);
  const search = tab.largest.search;
  const hexes = (search?.ranking.keys ?? []).map((key) => hexOf(key.name));
  const table = part.table;
  const rowOf = (id: string) => table?.rows[hexes.indexOf(id)];
  return (
    <section className={styles['part']} aria-label={part.title}>
      <h3 className={styles['title']}>{part.title}</h3>
      <LargestToolbar tabId={tabId} part={part} running={search !== undefined && search.ended === undefined} />
      {part.before === undefined ? null : <p className={styles['notice']}>{part.before}</p>}
      {part.line === undefined ? null : (
        <p className={styles['notice']} role="status">
          {part.line}{' '}
          {part.more === undefined ? null : <ControlButton tab={tabId} control={part.more} place="toolbar" />}
        </p>
      )}
      {table === undefined ? null : (
        <>
          <ServerGrid
            label={text.window.tables.largestKeys}
            element={table.element}
            columns={Object.values(table.columns).map((label) => ({ label }))}
            template="48px minmax(200px, 4fr) minmax(70px, 1fr) minmax(80px, 1fr)"
            rows={table.rows.map((row, index) => ({
              id: hexes[index] ?? String(index),
              selected: row.selected,
              cells: [
                { text: String(row.rank) },
                { text: row.key },
                { text: row.type },
                { text: row.memory, title: row.memoryTooltip },
              ],
            }))}
            onSelect={(id) => {
              select(tabId, ({ largest: _key, memory: _tile, ...rest }) =>
                id === undefined ? rest : { ...rest, largest: id },
              );
            }}
            onOpen={(id) => {
              const row = rowOf(id);
              if (row !== undefined) {
                act(tabId, row.open, 'table');
              }
            }}
            onMenu={(id, x, y) => {
              const row = rowOf(id);
              if (row !== undefined) {
                setMenu({ label: row.key, x, y, controls: row.menu, element: table.menuElement });
              }
            }}
          />
          <p className={styles['note']}>{table.note}</p>
        </>
      )}
      <ServerMenu
        tab={tabId}
        menu={menu}
        onClose={() => {
          setMenu(undefined);
        }}
      />
    </section>
  );
}

/** The Memory section. */
export function MemorySection(props: {
  readonly tabId: string;
  readonly tab: ServerTab;
  readonly connection: ConnectionView;
}): React.JSX.Element {
  const { tabId, tab } = props;
  const shown = view(memoryState(tab, props.connection));
  const overhead = shown.overhead;
  return (
    <div className={styles['section']}>
      <ErrorLine text={shown.error} />
      <Tiles
        label={text.sections.memory}
        tiles={shown.tiles.map((tile) => ({ ...tile, key: tile.name }))}
        onSelect={(key) => {
          select(tabId, ({ largest: _key, ...rest }) => ({ ...rest, memory: key as MemoryTileName }));
        }}
      />
      {overhead === undefined ? null : (
        <section className={styles['part']} aria-label={overhead.title}>
          <h3 className={styles['title']}>{overhead.title}</h3>
          <table className={styles['plain']}>
            <tbody>
              {overhead.rows.map((row) => (
                <tr key={row.part}>
                  <th scope="row">{row.part}</th>
                  <td title={row.tooltip}>{row.size}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      <section className={styles['part']} aria-label={shown.advice.title}>
        <h3 className={styles['title']}>{shown.advice.title}</h3>
        <ErrorLine text={shown.advice.error} />
        {shown.advice.text === undefined ? null : <pre className={styles['advice']}>{shown.advice.text}</pre>}
      </section>
      <LargestKeys tabId={tabId} tab={tab} part={shown.largestKeys} />
    </div>
  );
}
