/**
 * The detail of the difference selected on the structure comparison page, in the inspector island (`structure.show`):
 * **Copy script** and **Apply…**, or why there is nothing to apply; the table of the fields that differ; both
 * definitions whole; and *Steps on the right*. Also what the page adds to its tab for the island (`nav.inspector`).
 */
import type { Inspection } from '../../../features/nav/types';
import { view } from '../../../features/structure/show';
import { text } from '../../../features/structure/text';
import type { AppState } from '../../../shared/state';
import { activeTabOf } from '../../../shared/state/tabs';
import { startOperation } from './structure-runs';
import { structureTabOf, useStructureTab } from './structure-store';
import styles from './structure-page.module.css';

type Detail = NonNullable<ReturnType<typeof view>['detail']>;

function Buttons({ tab, detail, id }: { readonly tab: string; readonly detail: Detail; readonly id: string }) {
  const { copyScript, apply } = detail;
  return (
    <div className={styles['buttons']}>
      {copyScript === undefined ? null : (
        <button
          type="button"
          className={styles['button']}
          data-feature={copyScript.element}
          title={copyScript.hint}
          onClick={() => void startOperation(tab, 'structure.copy-script', 'inspector', { difference: id })}
        >
          {copyScript.label}
        </button>
      )}
      {apply === undefined ? null : (
        <button
          type="button"
          className={styles['button']}
          data-feature={apply.element}
          title={apply.hint}
          aria-disabled={apply.enabled ? undefined : true}
          onClick={() => {
            if (apply.enabled) void startOperation(tab, 'structure.apply', 'inspector', { chosen: [...apply.chosen] });
          }}
        >
          {apply.label}
        </button>
      )}
    </div>
  );
}

function Fields({ detail }: { readonly detail: Detail }): React.JSX.Element | null {
  if (detail.fields.length === 0) {
    return null;
  }
  return (
    <table className={styles['diff']} aria-label={text.show.field}>
      <thead>
        <tr>
          <th scope="col">{text.show.field}</th>
          <th scope="col">{text.show.leftColumn}</th>
          <th scope="col">{text.show.rightColumn}</th>
        </tr>
      </thead>
      <tbody>
        {detail.fields.map((row) => (
          <tr key={row.field}>
            <th scope="row" className={styles['code']}>
              {row.field}
            </th>
            <td className={styles['code']} title={row.leftHint}>
              {row.left}
            </td>
            <td className={styles['code']} title={row.rightHint}>
              {row.right}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Definition({ title, value }: { readonly title: string; readonly value: string | undefined }) {
  return value === undefined ? null : (
    <>
      <h2 className={styles['detailHeading']}>{title}</h2>
      <pre className={styles['document']}>{value}</pre>
    </>
  );
}

/** The detail of the selected difference, as the inspector island draws it. */
export function StructureInspector({ tabId }: { readonly tabId: string }): React.JSX.Element | null {
  const page = useStructureTab(tabId);
  const detail = page === undefined ? undefined : view(page.page).detail;
  const id = page?.page.selected;
  if (detail === undefined || id === undefined) {
    return null;
  }
  return (
    <div className={styles['detail']}>
      <Buttons tab={tabId} detail={detail} id={id} />
      {detail.message === undefined ? null : <p className={styles['note']}>{detail.message}</p>}
      <Fields detail={detail} />
      <Definition title={text.show.leftDefinition} value={detail.left} />
      <Definition title={text.show.rightDefinition} value={detail.right} />
      {detail.steps === '' ? null : <Definition title={detail.stepsTitle} value={detail.steps} />}
    </div>
  );
}

/** What a structure tab adds to the active tab for the inspector island: the difference selected. */
export function structureExtras(app: AppState, tabId: string): { inspection?: Inspection } {
  const page = structureTabOf(tabId);
  if (page === undefined || activeTabOf(app.tabs)?.id !== tabId) {
    return {};
  }
  const selected = page.page.result?.comparison.differences.find((each) => each.id === page.page.selected);
  return selected === undefined
    ? { inspection: { selected: 0, emptyLine: '' } }
    : { inspection: { selected: 1, title: `${selected.collection} · ${selected.summary}`, emptyLine: '' } };
}
