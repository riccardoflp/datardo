/**
 * What the inspector island shows of a row of the Monitor page: the whole record as mongosh text, with **Copy**
 * (`nav.inspector`).
 */
import { text } from '../../../features/monitor/text';
import { formattedValue } from '../../../features/query/format';
import type { Json } from '../../../shared/engine-request';
import { CopyButton } from './monitor-parts';
import styles from '../server/server-page.module.css';

/** A record, with its title when it has one, as mongosh text with **Copy**. */
export function InspectedRecord(props: { readonly title?: string; readonly value: Json }): React.JSX.Element {
  const shown = formattedValue(props.value, 'pretty');
  return (
    <>
      {props.title === undefined ? null : <h3 className={styles['title']}>{props.title}</h3>}
      <div className={styles['buttons']}>
        <CopyButton label={text.copy} text={shown} />
      </div>
      <pre className={styles['advice']}>{shown}</pre>
    </>
  );
}
