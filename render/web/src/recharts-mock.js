/**
 * recharts-mock.js
 *
 * Stub module that replaces recharts in development.
 * Prevents Vite/rollup from trying to parse recharts' CJS bundle
 * (which fails when the platform-native rollup parser isn't installed).
 *
 * All exports are no-op React components. The ui/ chart components
 * that import recharts are dead code (nothing renders them), so this
 * has no visible effect on the app.
 */

const noop = () => null;

export const Area               = noop;
export const AreaChart          = noop;
export const Bar                = noop;
export const BarChart           = noop;
export const CartesianGrid      = noop;
export const Cell               = noop;
export const Label              = noop;
export const LabelList          = noop;
export const Legend             = noop;
export const Line               = noop;
export const LineChart          = noop;
export const Pie                = noop;
export const PieChart           = noop;
export const PolarAngleAxis     = noop;
export const PolarGrid          = noop;
export const PolarRadiusAxis    = noop;
export const Radar              = noop;
export const RadarChart         = noop;
export const ReferenceLine      = noop;
export const ResponsiveContainer = noop;
export const Scatter            = noop;
export const ScatterChart       = noop;
export const Tooltip            = noop;
export const XAxis              = noop;
export const YAxis              = noop;

export default {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell,
  Label, LabelList, Legend, Line, LineChart, Pie, PieChart,
  PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart,
  ReferenceLine, ResponsiveContainer, Scatter, ScatterChart,
  Tooltip, XAxis, YAxis,
};
