/**
 * `nav.status-line`: the row at the bottom of the window, on its background. Each part is drawn only when its View
 * gives it.
 */
import { currentOf } from '../../features/nav/current-connection';
import { view } from '../../features/nav/status-line';
import type { NavInput } from '../../features/nav/types';
import type { Target } from '../../shared/target';
import { countTab } from '../query/collection-reads';
import { useCopiedFlash } from '../table/copied-flash';
import { startFeature } from './intent';
import styles from './bars.module.css';

/** `1 task running`, which opens the Scheduled tasks page (`task.show@status-line`). */
function TasksPart({ tasks }: { readonly tasks: ReturnType<typeof view>['tasks'] }): React.JSX.Element | null {
  return tasks === undefined ? null : (
    <button
      type="button"
      className={styles['part']}
      data-feature={tasks.element}
      onClick={() => {
        startFeature('task.show', { place: 'status-line' });
      }}
    >
      {tasks.text}
    </button>
  );
}

/** The status line. */
export function StatusLine(props: { readonly input: NavInput; readonly openSwitcher: () => void }): React.JSX.Element {
  const line = view(props.input);
  const copied = useCopiedFlash();
  const current = currentOf(props.input);
  const target: Target | undefined = current === undefined ? undefined : { kind: 'connection', connection: current.id };
  const onCurrent = target === undefined ? {} : { target };
  return (
    <footer
      className={styles['status-line']}
      aria-label={line.label}
      data-island="status"
      data-feature="nav.status-line@status-line"
      tabIndex={-1}
    >
      <button
        type="button"
        className={styles['part']}
        data-feature={line.connection.element}
        data-focus-first
        title={line.connection.tooltip}
        data-slow={line.connection.slow ? 'true' : undefined}
        onClick={props.openSwitcher}
      >
        {line.connection.dot === undefined ? null : (
          <span className={styles['dot']} data-dot={line.connection.dot} aria-hidden="true" />
        )}
        <span className={styles['cut']}>{line.connection.text}</span>
        {line.connection.latency === undefined ? null : (
          // The latency changes every ping: its place keeps one width, so that the parts after it do not move (R10.8).
          <span className={styles['latency']}>· {line.connection.latency}</span>
        )}
      </button>
      {line.reconnect === undefined ? null : (
        <button
          type="button"
          className={styles['part']}
          data-feature={line.reconnect.element}
          onClick={() => {
            startFeature('connection.reconnect', { place: 'status-line', ...onCurrent });
          }}
        >
          {line.reconnect.label}
        </button>
      )}
      {line.count === undefined ? null : line.count.element === undefined ? (
        <span className={`${styles['part'] ?? ''} ${styles['cut'] ?? ''}`}>{line.count.text}</span>
      ) : (
        <button
          type="button"
          className={`${styles['part'] ?? ''} ${styles['cut'] ?? ''}`}
          data-feature={line.count.element}
          onClick={() => {
            if (props.input.activeTab.tab !== undefined) {
              countTab(props.input.activeTab.tab, 'status-line');
            }
          }}
        >
          {line.count.text}
        </button>
      )}
      <span className={styles['spacer']} />
      <span role="status" className={styles['work']}>
        {copied === undefined ? null : <span className={styles['part']}>{copied}</span>}
        {line.work === undefined ? null : line.work.kind === 'several' ? (
          <button type="button" className={styles['part']} data-feature={line.work.element}>
            {line.work.text}
          </button>
        ) : (
          <>
            <span className={styles['part']} data-feature={line.work.element}>
              {line.work.title} {line.work.progress ?? ''}
            </span>
            <button
              type="button"
              className={styles['part']}
              data-feature={line.work.cancelElement ?? line.work.element}
              onClick={() => {
                if (line.work?.kind === 'one') {
                  void window.datardo.cancel(line.work.work);
                }
              }}
            >
              {line.work.cancel}
            </button>
          </>
        )}
      </span>
      <TasksPart tasks={line.tasks} />
      {line.zoom === undefined ? null : (
        <button
          type="button"
          className={styles['part']}
          data-feature={line.zoom.element}
          aria-label={`${line.zoom.label} (${line.zoom.text})`}
          onClick={() => {
            startFeature('window.zoom', { place: 'status-line', args: 'reset' });
          }}
        >
          {line.zoom.text}
        </button>
      )}
      {line.readOnly === undefined ? null : (
        <button
          type="button"
          className={styles['part']}
          data-feature={line.readOnly.element}
          title={line.readOnly.tooltip}
          onClick={() => {
            startFeature('connection.allow-changes', { place: 'status-line', ...onCurrent });
          }}
        >
          {line.readOnly.text}
        </button>
      )}
    </footer>
  );
}
