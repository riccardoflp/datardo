/**
 * The difference of the row selected on the comparison page, in the inspector island (`compare.show`,
 * `compare.field-diff`): for a different document the table of its fields with **Open left** and **Open right**; for a
 * document on one side only, the document whole, **Open left** or **Open right**, **Copy** and on which side it is
 * missing. Also what the page adds to its tab for the island (`nav.inspector`): whether a row is selected.
 */
import { view, type ComparePageView } from '../../../features/compare/show';
import type { ValueCell } from '../../../features/compare/page/inspector';
import { idKey } from '../../../features/compare/types';
import type { Inspection } from '../../../features/nav/types';
import type { AppState } from '../../../shared/state';
import { activeTabOf } from '../../../shared/state/tabs';
import { compareTabOf, useCompareTab } from './compare-store';
import { openSide } from './compare-writes';
import styles from './compare-page.module.css';

type Shown = NonNullable<ComparePageView['inspector']>;

function Cell({ cell }: { readonly cell: ValueCell }): React.JSX.Element {
  return (
    <td title={cell.hint} className={styles['code']}>
      {cell.text}
      {cell.type === undefined ? null : <span className={styles['muted']}> {cell.type}</span>}
    </td>
  );
}

function OpenButton(props: { readonly tab: string; readonly label: string; readonly side: 'left' | 'right' }) {
  return (
    <button
      type="button"
      className={styles['button']}
      onClick={() => {
        openSide(props.tab, props.side);
      }}
    >
      {props.label}
    </button>
  );
}

function Different({ tab, shown }: { readonly tab: string; readonly shown: Extract<Shown, { kind: 'different' }> }) {
  return (
    <>
      <div className={styles['buttons']}>
        {shown.open.map((each) => (
          <OpenButton key={each.side} tab={tab} label={each.label} side={each.side} />
        ))}
      </div>
      <table className={styles['diff']} aria-label={shown.columns[0]}>
        <thead>
          <tr>
            {shown.columns.map((column) => (
              <th key={column} scope="col">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.rows.map((row) =>
            row.kind === 'field' ? (
              <tr key={row.path}>
                <th scope="row" className={styles['code']}>
                  {row.path}
                </th>
                <Cell cell={row.left} />
                <Cell cell={row.right} />
              </tr>
            ) : (
              <tr key={row.path}>
                <th scope="row" className={styles['code']}>
                  {row.path}
                </th>
                <td colSpan={2}>{row.text}</td>
              </tr>
            ),
          )}
        </tbody>
      </table>
    </>
  );
}

function OneSide({ tab, shown }: { readonly tab: string; readonly shown: Extract<Shown, { kind: 'one-side' }> }) {
  const copy = shown.copy;
  return (
    <>
      <p className={styles['note']}>{shown.missing}</p>
      <div className={styles['buttons']}>
        <OpenButton tab={tab} label={shown.open.label} side={shown.open.side} />
        {copy === undefined ? null : (
          <button
            type="button"
            className={styles['button']}
            onClick={() => {
              void navigator.clipboard.writeText(copy.text);
            }}
          >
            {copy.label}
          </button>
        )}
      </div>
      {shown.message === undefined ? null : <p className={styles['note']}>{shown.message}</p>}
      {shown.document === undefined ? null : <pre className={styles['document']}>{shown.document}</pre>}
    </>
  );
}

/** The difference of the selected row, as the inspector island draws it. */
export function CompareInspector({ tabId }: { readonly tabId: string }): React.JSX.Element | null {
  const page = useCompareTab(tabId);
  const shown = page === undefined ? undefined : view(page.page).inspector;
  if (shown === undefined) {
    return null;
  }
  return (
    <div className={styles['detail']}>
      {shown.kind === 'different' ? <Different tab={tabId} shown={shown} /> : <OneSide tab={tabId} shown={shown} />}
    </div>
  );
}

/** What a comparison tab adds to the active tab for the inspector island: the row selected, by its `_id`. */
export function compareExtras(app: AppState, tabId: string): { inspection?: Inspection } {
  const page = compareTabOf(tabId);
  if (page === undefined || activeTabOf(app.tabs)?.id !== tabId) {
    return {};
  }
  const selected = page.page.selected;
  const row =
    selected === undefined ? undefined : view(page.page).rows.find((each) => idKey(each.id) === idKey(selected.id));
  return row === undefined
    ? { inspection: { selected: 0, emptyLine: '' } }
    : { inspection: { selected: 1, title: `${row.kindLabel} · ${row.idText}`, emptyLine: '' } };
}
