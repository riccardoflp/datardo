/**
 * The chart of the Chart section (`chart.show`), drawn with Chart.js on a canvas that fills the rest of the section and
 * follows its size: an image named *Chart* for assistive technology, dimmed while a draw runs or after an error, drawn
 * again in the colors of the theme when the theme changes. A click on a bar or a slice that can be clicked starts
 * `chart.filter-from-mark`.
 */
import { Chart } from 'chart.js';
import { useEffect, useRef, useState } from 'react';
import type { ChartView } from '../../../features/chart/show';
import type { TabId } from '../../../shared/ids';
import { chartConfig, themeNow, type ClickedMark } from './chart-config';
import { keepCanvas } from './chart-store';
import styles from './chart.module.css';

/** The theme shown now, counted up each time the system's light or dark changes. */
function useThemeChanges(): number {
  const [changes, setChanges] = useState(0);
  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: light)');
    const changed = (): void => {
      setChanges((count) => count + 1);
    };
    query.addEventListener('change', changed);
    return () => {
      query.removeEventListener('change', changed);
    };
  }, []);
  return changes;
}

/** The chart drawn from a View. */
export function ChartCanvas({
  tab,
  view,
  seriesField,
  onMark,
}: {
  readonly tab: TabId;
  readonly view: ChartView;
  readonly seriesField?: string;
  readonly onMark: (mark: ClickedMark) => void;
}): React.JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null);
  const marks = useRef(onMark);
  useEffect(() => {
    marks.current = onMark;
  }, [onMark]);
  const theme = useThemeChanges();
  useEffect(() => {
    const element = canvas.current;
    if (element === null) {
      return undefined;
    }
    const hooks = {
      theme: themeNow(),
      ...(seriesField === undefined ? {} : { seriesField }),
      onMark: (mark: ClickedMark) => {
        marks.current(mark);
      },
    };
    const chart = new Chart(element, chartConfig(view, hooks));
    keepCanvas(tab, element);
    return () => {
      chart.destroy();
      keepCanvas(tab, undefined);
    };
    // Drawn again for a new chart or theme, not for each View made from the same chart: dimming is the wrapper's.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the parts of the View that change the drawing
  }, [tab, view.data, view.type, view.clickable, view.categoryAxis, view.valueAxis, seriesField, theme]);
  return (
    <div className={styles['chart']} data-dimmed={view.dimmed ? 'true' : undefined}>
      <canvas
        ref={canvas}
        role={view.role}
        aria-label={view.name}
        title={view.clickHint}
        {...(view.clickable ? { 'data-feature': 'chart.filter-from-mark@chart' } : {})}
      />
    </div>
  );
}
