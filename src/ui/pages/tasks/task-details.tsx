/**
 * The details of a task (`task.show`): what it writes, its query, what it keeps and its missed runs, then its last 20
 * runs, each with its output as a link that shows it in the system's file manager (`task.show@list`), greyed with
 * **Deleted by retention** once retention deleted it.
 */
import type { DetailsView } from '../../../features/task/show';
import { startFeature } from '../../shell/intent';
import styles from './tasks-page.module.css';

/** The details of an open item. */
export function TaskDetails({ details }: { readonly details: DetailsView }): React.JSX.Element {
  return (
    <div
      className={styles['details']}
      onClick={(event) => {
        event.stopPropagation();
      }}
    >
      <ul className={styles['facts']}>
        {details.facts.map((fact) => (
          <li key={fact}>{fact}</li>
        ))}
      </ul>
      {details.noRuns === undefined ? null : <p className={styles['muted']}>{details.noRuns}</p>}
      {details.runs.length === 0 ? null : (
        <table className={styles['runs']}>
          <tbody>
            {details.runs.map((run, index) => (
              <tr key={`${run.started}-${String(index)}`}>
                <td>{run.started}</td>
                <td>{run.how}</td>
                <td data-status={run.status}>{run.result}</td>
                <td>{run.details}</td>
                <td>
                  {run.output === undefined ? null : run.output.deleted ? (
                    <span className={styles['deleted']} title={run.output.tooltip}>
                      {run.output.name}
                    </span>
                  ) : (
                    <button
                      type="button"
                      className={styles['link']}
                      data-feature="task.show@list"
                      title={run.output.path}
                      onClick={() => {
                        startFeature('task.show', { place: 'list', args: { reveal: run.output?.path ?? '' } });
                      }}
                    >
                      {run.output.name}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
