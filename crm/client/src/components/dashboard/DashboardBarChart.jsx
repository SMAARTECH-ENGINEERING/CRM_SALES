import { useColorScheme, useTheme } from '@mui/material/styles';
import { BarChart } from '@mui/x-charts/BarChart';
import { LineChart } from '@mui/x-charts/LineChart';
import { PieChart } from '@mui/x-charts/PieChart';

const ROW_HEIGHT = 36;
const COLUMN_HEIGHT = 300;
// Past this many slices a donut stops being readable; the rest become "Other".
const MAX_SLICES = 7;

// The chart colours of the theme in the scheme now showing: `single` for a
// chart with one series (the theme's primary colour), `series` for parts of a
// whole (a fixed colour-blind-safe order). Nothing is coloured anywhere else.
export function useChartColors() {
  const theme = useTheme();
  const { mode, systemMode } = useColorScheme();
  const scheme = (mode === 'system' ? systemMode : mode) === 'dark' ? 'dark' : 'light';
  return (theme.colorSchemes?.[scheme] ?? theme).palette.chart;
}

// A chart of `rows` ({ label, value }) from the API.
//   bar     one horizontal bar per row, value at the tip - rankings, breakdowns
//   column  upright bars along a category axis - a series over time
//   line    the same, as a line;  area: the line, filled
//   donut   parts of a whole, with a legend
// `format(value)` is used for axis ticks, labels and the tooltip. `height`
// overrides the natural height (a full-screen chart fills what it is given).
export default function DashboardBarChart({ rows, name, format = (value) => String(value), columns = false, type = columns ? 'column' : 'bar', height, otherLabel = 'Other' }) {
  const colors = useChartColors();
  const band = { scaleType: 'band', dataKey: 'label' };
  const scale = { valueFormatter: (value) => format(value), min: 0 };
  const valueFormatter = (value) => format(value ?? 0);

  if (type === 'donut') {
    const sorted = [...rows].filter((row) => row.value > 0).sort((a, b) => b.value - a.value);
    const head = sorted.slice(0, MAX_SLICES);
    const rest = sorted.slice(MAX_SLICES).reduce((sum, row) => sum + row.value, 0);
    const slices = [...head, ...(rest ? [{ key: '__other', label: otherLabel, value: rest }] : [])];
    return (
      <PieChart
        series={[
          {
            data: slices.map((row, index) => ({ id: row.key ?? row.label, label: row.label, value: row.value, color: colors.series[index % colors.series.length] })),
            innerRadius: '55%',
            paddingAngle: 1.5,
            cornerRadius: 3,
            valueFormatter: (item) => format(item.value),
          },
        ]}
        height={height ?? COLUMN_HEIGHT}
      />
    );
  }

  if (type === 'line' || type === 'area') {
    return (
      <LineChart
        dataset={rows}
        series={[{ dataKey: 'value', label: name, color: colors.single, valueFormatter, area: type === 'area', showMark: true, curve: 'linear' }]}
        xAxis={[{ scaleType: 'point', dataKey: 'label' }]}
        yAxis={[{ ...scale, width: 72 }]}
        height={height ?? COLUMN_HEIGHT}
        grid={{ horizontal: true }}
        hideLegend
        sx={{ '& .MuiAreaElement-root': { fillOpacity: 0.18 }, '& .MuiLineElement-root': { strokeWidth: 2 } }}
      />
    );
  }

  const series = [
    {
      dataKey: 'value',
      label: name,
      color: colors.single,
      valueFormatter,
      // Columns over time are read off the axis; ranked bars carry their value.
      ...(type === 'column' ? {} : { barLabel: ({ value }) => format(value ?? 0), barLabelPlacement: 'outside' }),
    },
  ];

  if (type === 'column') {
    return (
      <BarChart
        dataset={rows}
        series={series}
        xAxis={[{ ...band, categoryGapRatio: 0.7 }]}
        yAxis={[{ ...scale, width: 72 }]}
        height={height ?? COLUMN_HEIGHT}
        borderRadius={4}
        grid={{ horizontal: true }}
        hideLegend
      />
    );
  }
  // Wide enough for the longest label, within reason.
  const labelWidth = Math.min(200, Math.max(80, ...rows.map((row) => row.label.length * 7 + 16)));
  return (
    <BarChart
      dataset={rows}
      series={series}
      layout="horizontal"
      yAxis={[{ ...band, width: labelWidth, categoryGapRatio: 0.45 }]}
      xAxis={[scale]}
      height={height ?? rows.length * ROW_HEIGHT + 56}
      // Room for the value at the tip of the longest bar.
      margin={{ right: 72 }}
      borderRadius={4}
      grid={{ vertical: true }}
      hideLegend
    />
  );
}
