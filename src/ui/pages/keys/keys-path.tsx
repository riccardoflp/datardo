/**
 * The Redis segments of the path of a keys tab or a key tab, in the scope bar: the database, whose menu lists the
 * databases of the server as the tree last read them (`key.switch-database`, which sends nothing to the server), and
 * each level of the namespace, which opens the keys tab of that namespace (`key.show`).
 */
import { useState } from 'react';
import type { PathSegment } from '../../../features/nav/path';
import { databaseList } from '../../../features/key/switch-database';
import type { Json } from '../../../shared/engine-request';
import { activeTabOf } from '../../../shared/state/tabs';
import type { ConnectionId } from '../../../shared/ids';
import { startFeature } from '../../shell/intent';
import { useAppState } from '../../state/store';
import { treeOf } from '../../tree/tree-store';
import { KeysMenu, type OpenKeysMenu } from './keys-menu';

/** The databases of a server as the tree last read them, as `key.switch-database` takes them; none when not read. */
export function databasesArgs(connection: ConnectionId): Json | undefined {
  const read = treeOf(connection).island.redis.databases;
  if (read.kind !== 'loaded') {
    return undefined;
  }
  const keys: Record<string, number> = {};
  for (const database of read.value.databases) {
    keys[String(database.number)] = database.keys;
  }
  return { count: read.value.count, keys };
}

/** A Redis segment of the path; `segments` are all of them, `segment` one of the list. */
export function KeysPathSegment(props: {
  readonly segment: PathSegment;
  readonly segments: readonly PathSegment[];
  readonly className: string | undefined;
}): React.JSX.Element | null {
  const { segment, segments } = props;
  const active = activeTabOf(useAppState().tabs);
  const [menu, setMenu] = useState<OpenKeysMenu | undefined>(undefined);
  const shows = active?.shows;
  if (shows === undefined || (shows.kind !== 'keys' && shows.kind !== 'key')) {
    return null;
  }
  const target = { kind: 'redis-database' as const, connection: shows.connection, database: shows.database };
  if (segment.menu === 'namespace') {
    const from = segments.findIndex((each) => each.menu === 'redis-database');
    const namespace = segments
      .slice(from + 1, segments.indexOf(segment) + 1)
      .map((each) => each.label)
      .join('');
    return (
      <button
        type="button"
        className={props.className}
        data-feature="key.show@scope-bar"
        onClick={() => {
          startFeature('key.show', { place: 'scope-bar', target, args: { namespace } });
        }}
      >
        {segment.label}
      </button>
    );
  }
  const databases = databasesArgs(shows.connection);
  const items = databaseList(databases === undefined ? {} : { databases }, shows.database).map((choice) => ({
    label: choice.label,
    ...(choice.present ? { element: 'key.show@scope-bar' } : {}),
    choose: () => {
      if (choice.present) {
        startFeature('key.show', { place: 'scope-bar', target });
      } else {
        startFeature('key.switch-database', {
          place: 'scope-bar',
          target,
          args: { database: choice.database, ...(databases === undefined ? {} : { databases }) },
        });
      }
    },
  }));
  return (
    <>
      <button
        type="button"
        className={props.className}
        aria-haspopup="menu"
        data-feature="key.switch-database@scope-bar"
        onClick={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          setMenu({ label: segment.label, x: box.left, y: box.bottom, items });
        }}
      >
        {segment.label}
      </button>
      <KeysMenu
        menu={menu}
        onClose={() => {
          setMenu(undefined);
        }}
      />
    </>
  );
}
