/**
 * How the chart of the Chart section is drawn with Chart.js (`chart.show`): what the View gives (`ChartView`) turned
 * into Chart.js's configuration, in the colors of the theme: the 12 chart colors, used again from the first beyond
 * 12, and the text, grid and background of the theme, which the picture of `chart.save-picture` keeps.
 */
import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Filler,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PieController,
  PointElement,
  ScatterController,
  Tooltip,
  type ActiveElement,
  type ChartConfiguration,
  type Plugin,
  type TooltipItem,
} from 'chart.js';
import { dateLabel } from '../../../features/chart/data';
import type { ChartView } from '../../../features/chart/show';
import { text } from '../../../features/chart/text';
import type { Json } from '../../../shared/engine-request';

Chart.register(
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Filler,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PieController,
  PointElement,
  ScatterController,
  Tooltip,
);

/** How many colors a theme has for charts. */
const chartColors = 12;

/** The colors of the theme a chart is drawn with, read from the tokens. */
export interface ChartTheme {
  readonly text: string;
  readonly grid: string;
  readonly background: string;
  readonly font: string;
  readonly colors: readonly string[];
}

/** The colors of the theme shown now. */
export function themeNow(): ChartTheme {
  const style = getComputedStyle(document.documentElement);
  const token = (name: string): string => style.getPropertyValue(name).trim();
  return {
    text: token('--color-text'),
    grid: token('--color-border'),
    background: token('--color-island'),
    font: token('--font-family-ui'),
    colors: Array.from({ length: chartColors }, (_, index) => token(`--color-chart-${String(index + 1)}`)),
  };
}

/** A mark clicked: the condition of its category, and of its series when the chart has a series field. */
export interface ClickedMark {
  readonly category: Json;
  readonly series?: Json;
}

/** What the configuration needs besides the view: the theme, and what a click on a mark starts. */
export interface ChartHooks {
  readonly theme: ChartTheme;
  /** The series field, when the chart has one: a click then adds the condition of the series. */
  readonly seriesField?: string;
  readonly onMark: (mark: ClickedMark) => void;
}

function colorOf(theme: ChartTheme, index: number): string {
  return theme.colors[index % theme.colors.length] ?? theme.text;
}

/** A color of the theme with an opacity, for the fill under a line and the points of a scatter chart. */
function faded(color: string, alpha: number): string {
  const hex = /^#([0-9a-f]{6})$/iu.exec(color)?.[1];
  if (hex === undefined) {
    return color;
  }
  const value = Number.parseInt(hex, 16);
  return `rgba(${String(value >> 16)}, ${String((value >> 8) & 255)}, ${String(value & 255)}, ${String(alpha)})`;
}

function numberText(value: number, dates: boolean): string {
  return dates ? dateLabel(value) : value.toLocaleString('en-US');
}

function background(theme: ChartTheme): Plugin {
  return {
    id: 'background',
    beforeDraw: (chart) => {
      const { ctx } = chart;
      ctx.save();
      ctx.fillStyle = theme.background;
      ctx.fillRect(0, 0, chart.width, chart.height);
      ctx.restore();
    },
  };
}

function base(view: ChartView, hooks: ChartHooks) {
  const { theme } = hooks;
  const onClick = (_event: unknown, elements: readonly ActiveElement[]): void => {
    const hit = elements[0];
    const category = hit === undefined ? undefined : view.data.conditions[hit.index];
    if (!view.clickable || hit === undefined || category === undefined) {
      return;
    }
    const series = hooks.seriesField === undefined ? undefined : view.data.series[hit.datasetIndex];
    hooks.onMark(series === undefined ? { category } : { category, series: series.condition ?? null });
  };
  const onHover = (event: { native: Event | null }, elements: readonly ActiveElement[]): void => {
    const target = event.native?.target;
    if (target instanceof HTMLElement) {
      target.style.cursor = view.clickable && elements.length > 0 ? 'pointer' : '';
    }
  };
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false as const,
    locale: 'en-US',
    color: theme.text,
    borderColor: theme.grid,
    font: { family: theme.font },
    onClick,
    onHover,
  };
}

function axis(theme: ChartTheme, title: string, dates = false) {
  return {
    grid: { color: theme.grid },
    ticks: {
      color: theme.text,
      ...(dates ? { callback: (value: number | string) => dateLabel(Number(value)) } : {}),
    },
    title: { display: title !== '', text: title, color: theme.text },
  };
}

const footer = (view: ChartView) => () => view.clickHint ?? '';

function pieConfig(view: ChartView, hooks: ChartHooks): ChartConfiguration {
  const { theme } = hooks;
  const values = view.data.series[0]?.values ?? [];
  const total = values.reduce<number>((sum, each) => sum + (each ?? 0), 0);
  return {
    type: 'pie',
    data: {
      labels: [...view.data.labels],
      datasets: [
        {
          label: view.valueAxis,
          data: [...values],
          backgroundColor: view.data.labels.map((_, index) => colorOf(theme, index)),
          borderColor: theme.background,
          borderWidth: 1,
        },
      ],
    },
    options: {
      ...base(view, hooks),
      plugins: {
        legend: { position: 'right', labels: { color: theme.text } },
        tooltip: {
          callbacks: {
            label: (item: Pick<TooltipItem<'pie'>, 'formattedValue' | 'raw'>) =>
              text.tips.slice(item.formattedValue, total === 0 ? 0 : (Number(item.raw) / total) * 100),
            footer: footer(view),
          },
        },
      },
    },
    plugins: [background(theme)],
  };
}

function scatterConfig(view: ChartView, hooks: ChartHooks): ChartConfiguration {
  const { theme } = hooks;
  const { data } = view;
  const several = data.points.length > 1;
  return {
    type: 'scatter',
    data: {
      datasets: data.points.map((group, index) => ({
        label: group.name,
        data: group.points.map((point) => ({ ...point })),
        backgroundColor: faded(colorOf(theme, index), 0.6),
        borderColor: colorOf(theme, index),
        pointRadius: group.points.length > 2000 ? 2 : 3,
      })),
    },
    options: {
      ...base(view, hooks),
      scales: {
        x: axis(theme, view.categoryAxis, data.xDates),
        y: axis(theme, view.valueAxis, data.yDates),
      },
      plugins: {
        legend: { display: several, labels: { color: theme.text } },
        tooltip: {
          callbacks: {
            label: (item: { readonly raw: unknown; readonly dataset: { readonly label?: string | undefined } }) => {
              const point = item.raw as { x: number; y: number };
              return text.tips.point(
                `${view.categoryAxis} ${numberText(point.x, data.xDates)}`,
                `${view.valueAxis} ${numberText(point.y, data.yDates)}`,
                several ? item.dataset.label : undefined,
              );
            },
          },
        },
      },
    },
    plugins: [background(theme)],
  };
}

function categoryConfig(view: ChartView, hooks: ChartHooks): ChartConfiguration {
  const { theme } = hooks;
  const { data } = view;
  const line = view.type === 'line';
  const histogram = view.type === 'histogram';
  const several = data.series.length > 1;
  return {
    type: line ? 'line' : 'bar',
    data: {
      labels: [...data.labels],
      datasets: data.series.map((series, index) => ({
        label: series.name,
        data: [...series.values],
        backgroundColor: line ? faded(colorOf(theme, index), 0.2) : colorOf(theme, index),
        borderColor: line ? colorOf(theme, index) : theme.background,
        borderWidth: line ? 2 : histogram ? 1 : 0,
        ...(line ? { pointRadius: data.labels.length > 100 ? 0 : 3, spanGaps: true, fill: !several } : {}),
        ...(histogram ? { barPercentage: 1, categoryPercentage: 1 } : {}),
      })),
    },
    options: {
      ...base(view, hooks),
      interaction: { mode: line ? 'index' : 'nearest', intersect: !line },
      scales: {
        x: axis(theme, view.categoryAxis),
        y: { ...axis(theme, view.valueAxis), beginAtZero: !line },
      },
      plugins: {
        legend: { display: view.legend !== 'none', labels: { color: theme.text } },
        tooltip: { callbacks: { footer: footer(view) } },
      },
    },
    plugins: [background(theme)],
  };
}

/** The configuration of the chart a View gives, drawn in the theme given. */
export function chartConfig(view: ChartView, hooks: ChartHooks): ChartConfiguration {
  switch (view.type) {
    case 'pie':
      return pieConfig(view, hooks);
    case 'scatter':
      return scatterConfig(view, hooks);
    case 'bar':
    case 'line':
    case 'histogram':
      return categoryConfig(view, hooks);
  }
}
