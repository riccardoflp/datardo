/**
 * Feature: playground.show
 *
 * The page of a playground: the script in Datardo's editor, the controls that run it, and the results of the last run.
 * Opening a playground, restoring it and making its tab active send nothing to the deployment. Ported from Mongoster's
 * `src/playground/playground.ts` (the lenses and the label of the connection) and `src/playground/resultPanel.ts`.
 */
import { databaseAt, scriptStatements } from '../../shared/playground/statements';
import { view as resultsView, type ResultsView } from './results';
import { text } from './text';
import type { PlaygroundRun, PlaygroundState, PlaygroundTab } from './types';
import { hasUnsavedChanges, targetLabel } from './types';

/** The **Run** buttons follow the text 300 ms after the last key (Datardo's choice). */
export const statementsDelayMs = 300;

/** The editor and the results each start with half of the page (Datardo's choice). */
export const editorShare = 0.5;

/** What the tab is drawn from. */
export interface ShowInput {
  readonly tab: PlaygroundTab;
  readonly playground: PlaygroundState;
  readonly connection: { readonly name: string; readonly readOnly: boolean };
  /** The run in progress, in this tab or another: one runs at a time (D51). */
  readonly running?: PlaygroundRun;
}

/** A control of the toolbar. */
export interface ToolbarControl<Element extends string> {
  readonly label: string;
  readonly element: Element;
  readonly disabled: boolean;
  readonly tooltip?: string;
}

/** The **Run** button beside the first line of a statement. */
export interface RunButton {
  readonly line: number;
  readonly label: string;
  /** Its accessible name: **Run the statement at line 4**. */
  readonly name: string;
  readonly element: 'playground.run@editor';
  readonly disabled: boolean;
}

/** What the playground tab shows. */
export interface ShowView {
  /** The file's name, or **Playground 1**. */
  readonly title: string;
  /** The dot of a tab with unsaved changes. */
  readonly unsaved: boolean;
  /** The path in the scope bar: `Local / Playground 1`. */
  readonly path: string;
  readonly toolbar: {
    /** **Run all**, or **Stop** while this playground runs. */
    readonly run: ToolbarControl<'playground.run@toolbar'> | ToolbarControl<'playground.stop@toolbar'>;
    readonly target: ToolbarControl<'playground.target@toolbar'>;
    readonly open: ToolbarControl<'playground.open-file@toolbar'>;
    readonly save: ToolbarControl<'playground.save@toolbar'>;
  };
  readonly runButtons: readonly RunButton[];
  /** The line marked after a run that failed with a line. */
  readonly failedLine?: number;
  readonly results: ResultsView;
}

/** The database the button shows: that of the last `use("…")` of the script, else the default database. */
export function shownDatabase(playground: PlaygroundState): string {
  return databaseAt(playground.text, playground.text.length) ?? playground.defaultDatabase;
}

/** Feature: playground.show — what the playground tab shows. */
export function view(input: ShowInput): ShowView {
  const { tab, playground, connection, running } = input;
  const runsHere = running?.tab === tab.id;
  const busy = running !== undefined;
  const run = runsHere
    ? { label: text.show.stop, element: 'playground.stop@toolbar' as const, disabled: false }
    : {
        label: text.show.runAll,
        element: 'playground.run@toolbar' as const,
        disabled: busy,
        tooltip: text.show.runAllTooltip,
      };
  return {
    title: tab.shows.title,
    unsaved: hasUnsavedChanges(playground),
    path: `${connection.name} / ${tab.shows.title}`,
    toolbar: {
      run,
      target: {
        label: targetLabel(connection.name, shownDatabase(playground), connection.readOnly),
        element: 'playground.target@toolbar',
        disabled: runsHere,
        tooltip: text.show.targetTooltip,
      },
      open: { label: text.show.open, element: 'playground.open-file@toolbar', disabled: false },
      save: {
        label: text.show.save,
        element: 'playground.save@toolbar',
        disabled: tab.shows.file !== undefined && !hasUnsavedChanges(playground),
      },
    },
    runButtons: scriptStatements(playground.text).map((statement) => ({
      line: statement.firstLine,
      label: text.show.run,
      name: text.show.runStatement(statement.firstLine),
      element: 'playground.run@editor',
      disabled: busy,
    })),
    ...(playground.failedLine === undefined || runsHere ? {} : { failedLine: playground.failedLine }),
    results: resultsView({
      ...(playground.result === undefined ? {} : { result: playground.result }),
      ...(runsHere ? { run: running } : {}),
      readOnly: connection.readOnly,
      layout: playground.layout,
    }),
  };
}
