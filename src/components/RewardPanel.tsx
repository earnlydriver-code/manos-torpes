import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { RewardBreakdown } from '../engine/reward-breakdown';
import type { HistoryPoint } from '../hooks/useTrainer';

/**
 * Panel de aprendizaje (spec §6.3): curva de recompensa best/avg + desglose
 * del mejor individuo en barras. Paleta validada contra la superficie #17171d
 * (CVD y contraste): best azul #3987e5, avg gris contexto, barras por signo.
 */

const COLOR_BEST = '#3987e5';
const COLOR_AVG = '#898781';
const COLOR_POS = '#3987e5';
const COLOR_NEG = '#e66767';
const INK_MUTED = '#898781';
const GRID = '#2c2c2a';
const BASELINE = '#383835';
const SURFACE = '#17171d';

const COMPONENT_LABELS: Record<keyof RewardBreakdown['components'], string> = {
  consonance: 'Consonancia',
  rhythm: 'Ritmo',
  structure: 'Estructura',
  contour: 'Contorno',
  physics: 'Física',
  entropy: 'Entropía',
};

const MAX_POINTS = 400;

type Props = { history: HistoryPoint[]; breakdown: RewardBreakdown | null };

const tooltipStyle = {
  backgroundColor: SURFACE,
  border: `1px solid ${GRID}`,
  borderRadius: 8,
  color: '#f3f4f6',
  fontSize: 13,
} as const;

export function RewardPanel({ history, breakdown }: Props) {
  const sampled = useMemo(() => {
    if (history.length <= MAX_POINTS) return history;
    const stride = Math.ceil(history.length / MAX_POINTS);
    return history.filter((_, i) => i % stride === 0 || i === history.length - 1);
  }, [history]);

  const bars = useMemo(() => {
    if (!breakdown || breakdown.mode !== 'completo') return [];
    return (Object.keys(COMPONENT_LABELS) as Array<keyof RewardBreakdown['components']>).map(
      (key) => ({ name: COMPONENT_LABELS[key], value: breakdown.components[key] }),
    );
  }, [breakdown]);

  return (
    <div className="charts">
      <div className="chart-card">
        <div className="chart-header">
          <h2>Curva de aprendizaje</h2>
          <span className="legend">
            <span className="legend-item">
              <span className="swatch" style={{ background: COLOR_BEST }} /> mejor
            </span>
            <span className="legend-item">
              <span className="swatch" style={{ background: COLOR_AVG }} /> promedio
            </span>
          </span>
        </div>
        {sampled.length < 2 ? (
          <p className="chart-empty">Entrena para ver la curva de recompensa.</p>
        ) : (
          <ResponsiveContainer width="100%" height={190}>
            <LineChart data={sampled} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis
                dataKey="gen"
                stroke={BASELINE}
                tick={{ fill: INK_MUTED, fontSize: 12 }}
                tickLine={false}
              />
              <YAxis
                stroke={BASELINE}
                tick={{ fill: INK_MUTED, fontSize: 12 }}
                tickLine={false}
                domain={['auto', 'auto']}
                tickFormatter={(v: number) => v.toFixed(1)}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                labelFormatter={(gen) => `Generación ${gen}`}
                formatter={(value, name) => [
                  typeof value === 'number' ? value.toFixed(3) : String(value ?? ''),
                  name === 'best' ? 'mejor' : 'promedio',
                ]}
              />
              <Line
                type="monotone"
                dataKey="best"
                stroke={COLOR_BEST}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="avg"
                stroke={COLOR_AVG}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="chart-card">
        <div className="chart-header">
          <h2>Desglose del mejor</h2>
        </div>
        {bars.length === 0 ? (
          <p className="chart-empty">
            {breakdown?.mode === 'entropia-baja'
              ? 'El mejor aún cae en la trampa de pocas notas (entropía baja).'
              : 'Entrena para ver de qué está hecha la recompensa.'}
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={190}>
            <BarChart data={bars} margin={{ top: 18, right: 8, bottom: 0, left: -16 }} barCategoryGap="22%">
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis
                dataKey="name"
                stroke={BASELINE}
                tick={{ fill: INK_MUTED, fontSize: 11 }}
                tickLine={false}
                interval={0}
              />
              <YAxis
                stroke={BASELINE}
                tick={{ fill: INK_MUTED, fontSize: 12 }}
                tickLine={false}
                domain={[-1, 1]}
                tickFormatter={(v: number) => v.toFixed(1)}
              />
              <ReferenceLine y={0} stroke={BASELINE} />
              <Tooltip
                contentStyle={tooltipStyle}
                cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                formatter={(value) => [
                  typeof value === 'number' ? value.toFixed(3) : String(value ?? ''),
                  'puntuación',
                ]}
              />
              <Bar dataKey="value" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                {bars.map((b) => (
                  <Cell key={b.name} fill={b.value >= 0 ? COLOR_POS : COLOR_NEG} />
                ))}
                <LabelList
                  dataKey="value"
                  position="top"
                  formatter={(v: unknown) => (typeof v === 'number' ? v.toFixed(2) : '')}
                  style={{ fill: '#f3f4f6', fontSize: 11 }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
