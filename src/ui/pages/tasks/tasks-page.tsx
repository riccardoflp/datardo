/**
 * `task.show`: the **Scheduled tasks** page. From the top: the toolbar with the summary and **New task…**
 * (`task.edit@toolbar`), the note about the tray with its link to the setting, the last message of the page, the form
 * of a task while one is created or edited (`task.edit`), then the tasks, or the empty state (`task.edit@empty-state`).
 * The page is drawn again once a second while a run is in progress, and every 30 seconds otherwise.
 */
import { useEffect, useState } from 'react';
import { view, type ShowView } from '../../../features/task/show';
import { pageText } from '../../../features/task/text';
import { startFeature } from '../../shell/intent';
import { useAppState } from '../../state/store';
import { TaskForm } from './task-form';
import { TaskItem } from './task-item';
import { followFormRequest, useTasksPage } from './tasks-store';
import styles from './tasks-page.module.css';

/** The time the page is drawn from: read again every second while a run is in progress, else every 30 seconds. */
function useNow(running: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(
      () => {
        setNow(Date.now());
      },
      running ? 1_000 : 30_000,
    );
    return () => {
      clearInterval(timer);
    };
  }, [running]);
  return now;
}

function Notes({ page }: { readonly page: ShowView }): React.JSX.Element {
  return (
    <>
      {page.trayNote === undefined ? null : (
        <p className={styles['note']}>
          {page.trayNote.text}{' '}
          <button
            type="button"
            className={styles['link']}
            onClick={() => {
              // The setting is in the group of the scheduled tasks, which has the page's title.
              startFeature('settings.page', { place: 'list', args: { group: pageText.title } });
            }}
          >
            {page.trayNote.link}
          </button>
        </p>
      )}
      {page.message === undefined ? null : (
        <p
          className={styles['message']}
          role={page.message.failed ? 'alert' : 'status'}
          data-failed={page.message.failed ? 'true' : undefined}
        >
          {page.message.text}
        </p>
      )}
    </>
  );
}

/** The **Scheduled tasks** page. */
export function TasksPage(): React.JSX.Element {
  const state = useAppState();
  const fields = useTasksPage();
  const now = useNow(Object.keys(state.tasks.running).length > 0);
  useEffect(() => {
    followFormRequest(state);
  }, [state]);
  const tasks = { ...state.tasks, open: fields.open };
  const page = view({ tasks, connections: state.connections.saved, settings: state.settings, now });
  return (
    <div className={styles['page']}>
      <div className={styles['toolbar']} role="toolbar" aria-label={pageText.title}>
        <span className={styles['summary']}>{page.toolbar.summary}</span>
        <span className={styles['spacer']} />
        <button
          type="button"
          className={styles['button']}
          data-feature={page.toolbar.newTask.element}
          onClick={() => {
            startFeature('task.edit', { place: 'toolbar' });
          }}
        >
          {page.toolbar.newTask.label}
        </button>
      </div>
      <Notes page={page} />
      <div className={styles['scroller']}>
        {fields.form === undefined ? null : (
          <TaskForm open={fields.form} connections={state.connections.saved} now={now} />
        )}
        {page.empty === undefined ? (
          <ul className={styles['list']} aria-label={pageText.title}>
            {page.items.map((item) => (
              <TaskItem key={item.id} item={item} selected={fields.selected === item.id} />
            ))}
          </ul>
        ) : (
          <div className={styles['empty']}>
            <p>{page.empty.text}</p>
            <button
              type="button"
              className={styles['button']}
              data-feature={page.empty.newTask.element}
              onClick={() => {
                startFeature('task.edit', { place: 'empty-state' });
              }}
            >
              {page.empty.newTask.label}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
