/**
 * The list of the structure comparison page (`structure.show`, `@table`): the differences grouped by collection, a
 * group's head folding it with a click and carrying **Apply…** when more than one of its differences can be applied,
 * then one row per difference with its kind, its object, its summary and **Apply…**. The arrow keys select a row,
 * whose detail the inspector island shows; `Enter` moves the focus there.
 */
import type { ApplyControl, CollectionGroup, DifferenceRow } from '../../../features/structure/model/page';
import type { StructurePageView } from '../../../features/structure/show';
import { focusIsland } from '../../shell/focus';
import { keepStructure, startOperation } from './structure-runs';
import { selectDifference, toggleGroup } from './structure-store';
import styles from './structure-page.module.css';

function rowId(tab: string, id: string): string {
  return `${tab}-structure-${id.replace(/[^A-Za-z0-9_-]/gu, '_')}`;
}

function ApplyButton({ tab, apply }: { readonly tab: string; readonly apply: ApplyControl }): React.JSX.Element {
  return (
    <button
      type="button"
      className={styles['button']}
      data-feature={apply.element}
      title={apply.hint}
      aria-disabled={apply.enabled ? undefined : true}
      tabIndex={-1}
      onClick={(event) => {
        event.stopPropagation();
        if (apply.enabled) void startOperation(tab, 'structure.apply', 'table', { chosen: [...apply.chosen] });
      }}
    >
      {apply.label}
    </button>
  );
}

function Row({ tab, row }: { readonly tab: string; readonly row: DifferenceRow }): React.JSX.Element {
  return (
    <tr
      id={rowId(tab, row.id)}
      className={styles['row']}
      aria-selected={row.selected}
      onClick={() => {
        selectDifference(tab, row.id);
      }}
    >
      <td>{row.kind}</td>
      <td>{row.object}</td>
      <td className={styles['what']} title={row.summary}>
        {row.summary}
      </td>
      <td>{row.apply === undefined ? null : <ApplyButton tab={tab} apply={row.apply} />}</td>
    </tr>
  );
}

function Group({ tab, group }: { readonly tab: string; readonly group: CollectionGroup }): React.JSX.Element {
  return (
    <tbody>
      <tr
        className={styles['group']}
        onClick={() => {
          toggleGroup(tab, group.collection);
          keepStructure(tab);
        }}
      >
        <th scope="rowgroup" colSpan={3} className={styles['groupHead']}>
          <span aria-hidden="true">{group.folded ? '▸' : '▾'} </span>
          <span className={styles['code']}>{group.collection}</span>
          {group.badge === undefined ? null : <span className={styles['badge']}> {group.badge}</span>}
          <span className={styles['muted']}> {group.count}</span>
        </th>
        <td>{group.apply === undefined ? null : <ApplyButton tab={tab} apply={group.apply} />}</td>
      </tr>
      {group.folded ? null : group.rows.map((row) => <Row key={row.id} tab={tab} row={row} />)}
    </tbody>
  );
}

function moveSelection(tab: string, groups: readonly CollectionGroup[], step: number): void {
  const rows = groups.flatMap((group) => (group.folded ? [] : group.rows));
  const index = rows.findIndex((row) => row.selected);
  const next = rows[Math.min(rows.length - 1, Math.max(0, index + step))];
  if (next !== undefined) {
    selectDifference(tab, next.id);
    document.getElementById(rowId(tab, next.id))?.scrollIntoView({ block: 'nearest' });
  }
}

/** The list, or the sentence that stands for it when it is empty. */
export function StructureList({ tab, shown }: { readonly tab: string; readonly shown: StructurePageView }) {
  if (shown.groups.length === 0) {
    return shown.empty === undefined ? null : <p className={styles['note']}>{shown.empty}</p>;
  }
  const selected = shown.groups.flatMap((group) => group.rows).find((row) => row.selected);
  return (
    <div className={styles['scroller']}>
      <table
        className={styles['table']}
        role="grid"
        aria-label={shown.title}
        tabIndex={0}
        aria-activedescendant={selected === undefined ? undefined : rowId(tab, selected.id)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            moveSelection(tab, shown.groups, event.key === 'ArrowDown' ? 1 : -1);
          } else if (event.key === 'Enter') {
            event.preventDefault();
            focusIsland('inspector');
          }
        }}
      >
        {shown.groups.map((group) => (
          <Group key={group.collection} tab={tab} group={group} />
        ))}
      </table>
    </div>
  );
}
