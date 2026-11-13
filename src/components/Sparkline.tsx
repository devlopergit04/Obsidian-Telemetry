import React, { useId, useState } from 'react';
import { TelemetryPoint } from '../types/telemetry';

interface MicroSparklineProps {
  data: number[];
  timestamps?: string[];
  color?: string;
  height?: number;
  unit?: string;
  onHoverIndex?: (index: number | null) => void;
}

export const MicroSparkline: React.FC<MicroSparklineProps> = ({
  data,
  timestamps,
  color = '#06B6D4',
  height = 42,
  unit = '%',
  onHoverIndex,
}) => {
  const gradientId = useId();
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (!data || data.length === 0) return null;

  const width = 220;
  const padY = 4;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((val, idx) => {
    const x = (idx / Math.max(1, data.length - 1)) * width;
    const y = height - padY - ((val - min) / range) * (height - padY * 2);
    return { x, y, val };
  });

  const linePath = points
    .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');
  const areaPath = `${linePath} L ${width} ${height} L 0 ${height} Z`;

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const idx = Math.round(relX * (data.length - 1));
    setHoverIdx(idx);
    onHoverIndex?.(idx);
  };

  const handleMouseLeave = () => {
    setHoverIdx(null);
    onHoverIndex?.(null);
  };

  const activePoint = hoverIdx !== null ? points[hoverIdx] : null;

  return (
    <div className="relative w-full select-none">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="w-full overflow-visible cursor-crosshair block"
        style={{ height }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={color} stopOpacity="0.0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill={`url(#${gradientId})`} />
        <path
          d={linePath}
          fill="none"
          stroke={color}
          strokeWidth="1.75"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {activePoint && (
          <>
            <line
              x1={activePoint.x}
              x2={activePoint.x}
              y1={0}
              y2={height}
              stroke="#4cd7f6"
              strokeOpacity="0.45"
              strokeWidth="1"
              strokeDasharray="2 2"
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={activePoint.x}
              cy={activePoint.y}
              r="3.2"
              fill="#0B0F17"
              stroke={color}
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          </>
        )}
      </svg>
      {activePoint && hoverIdx !== null && (
        <div className="pointer-events-none absolute -top-6 right-0 rounded bg-[#111827]/95 border border-slate-700/90 px-1.5 py-0.5 font-mono text-[10px] text-[#dfe2ee] tabular-nums shadow-sm">
          {timestamps?.[hoverIdx] ? `${timestamps[hoverIdx]} · ` : ''}
          <span style={{ color }}>{activePoint.val}</span>
          {unit}
        </div>
      )}
    </div>
  );
};

export type TelemetryMetricKey = 'cpu' | 'memory' | 'networkMbps' | 'p99LatencyMs';

interface TelemetryAreaChartProps {
  series: TelemetryPoint[];
  activeMetrics: TelemetryMetricKey[];
}

const METRIC_META: Record<
  TelemetryMetricKey,
  { label: string; color: string; unit: string; maxDefault: number }
> = {
  cpu: { label: 'CPU Load', color: '#06B6D4', unit: '%', maxDefault: 100 },
  memory: { label: 'Memory', color: '#10B981', unit: '%', maxDefault: 100 },
  networkMbps: { label: 'Network I/O', color: '#4cd7f6', unit: 'Mbps', maxDefault: 3000 },
  p99LatencyMs: { label: 'P99 Latency', color: '#F59E0B', unit: 'ms', maxDefault: 80 },
};

export const TelemetryAreaChart: React.FC<TelemetryAreaChartProps> = ({
  series,
  activeMetrics,
}) => {
  const baseId = useId();
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (series.length === 0 || activeMetrics.length === 0) {
    return (
      <div className="h-[230px] flex items-center justify-center text-xs font-mono text-slate-400">
        Select at least one telemetry metric to plot.
      </div>
    );
  }

  const width = 760;
  const height = 220;
  const padLeft = 36;
  const padRight = 14;
  const padTop = 14;
  const padBottom = 26;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const primaryMetric = activeMetrics[0];

  const getNormalizedSeries = (metric: TelemetryMetricKey) => {
    const vals = series.map((p) => p[metric]);
    const isPercent = metric === 'cpu' || metric === 'memory';
    const maxVal = isPercent ? 100 : Math.max(METRIC_META[metric].maxDefault, ...vals) * 1.15;
    const minVal = 0;

    return series.map((pt, idx) => {
      const x = padLeft + (idx / Math.max(1, series.length - 1)) * plotW;
      const ratio = (pt[metric] - minVal) / (maxVal - minVal || 1);
      const y = padTop + plotH - ratio * plotH;
      return { x, y, value: pt[metric], timestamp: pt.timestamp };
    });
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = ((e.clientX - rect.left) / rect.width) * width;
    const rel = Math.max(0, Math.min(1, (clickX - padLeft) / plotW));
    const idx = Math.round(rel * (series.length - 1));
    setHoverIdx(idx);
  };

  const yTicks = [0, 25, 50, 75, 100];
  const primaryMax =
    primaryMetric === 'cpu' || primaryMetric === 'memory'
      ? 100
      : Math.round(
          Math.max(
            METRIC_META[primaryMetric].maxDefault,
            ...series.map((s) => s[primaryMetric])
          ) * 1.15
        );

  const hoverX =
    hoverIdx !== null
      ? padLeft + (hoverIdx / Math.max(1, series.length - 1)) * plotW
      : null;

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-[220px] select-none cursor-crosshair"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        <defs>
          {activeMetrics.map((metric) => (
            <linearGradient
              key={metric}
              id={`${baseId}-${metric}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0%" stopColor={METRIC_META[metric].color} stopOpacity="0.18" />
              <stop offset="100%" stopColor={METRIC_META[metric].color} stopOpacity="0.0" />
            </linearGradient>
          ))}
        </defs>

        {/* Horizontal grid lines */}
        {yTicks.map((tick) => {
          const y = padTop + plotH - (tick / 100) * plotH;
          const labelValue = Math.round((tick / 100) * primaryMax);
          return (
            <g key={tick}>
              <line
                x1={padLeft}
                x2={width - padRight}
                y1={y}
                y2={y}
                stroke="rgba(51, 65, 85, 0.45)"
                strokeDasharray="3 3"
                strokeWidth="1"
              />
              <text
                x={padLeft - 6}
                y={y + 3}
                textAnchor="end"
                className="fill-slate-500 font-mono text-[9px]"
              >
                {labelValue}
              </text>
            </g>
          );
        })}

        {/* Vertical timestamp grid markers */}
        {series.map((pt, idx) => {
          if (idx % 3 !== 0 && idx !== series.length - 1) return null;
          const x = padLeft + (idx / Math.max(1, series.length - 1)) * plotW;
          return (
            <g key={pt.timestamp}>
              <line
                x1={x}
                x2={x}
                y1={padTop}
                y2={padTop + plotH}
                stroke="rgba(30, 41, 59, 0.65)"
                strokeWidth="1"
              />
              <text
                x={x}
                y={height - 6}
                textAnchor="middle"
                className="fill-slate-500 font-mono text-[9px]"
              >
                {pt.timestamp}
              </text>
            </g>
          );
        })}

        {/* Metric paths */}
        {activeMetrics.map((metric) => {
          const pts = getNormalizedSeries(metric);
          const line = pts
            .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
            .join(' ');
          const area = `${line} L ${pts[pts.length - 1].x.toFixed(1)} ${padTop + plotH} L ${pts[0].x.toFixed(1)} ${padTop + plotH} Z`;

          return (
            <g key={metric}>
              <path d={area} fill={`url(#${baseId}-${metric})`} />
              <path
                d={line}
                fill="none"
                stroke={METRIC_META[metric].color}
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {hoverIdx !== null && pts[hoverIdx] && (
                <circle
                  cx={pts[hoverIdx].x}
                  cy={pts[hoverIdx].y}
                  r="4"
                  fill="#0B0F17"
                  stroke={METRIC_META[metric].color}
                  strokeWidth="2"
                />
              )}
            </g>
          );
        })}

        {/* Hover crosshair */}
        {hoverX !== null && (
          <line
            x1={hoverX}
            x2={hoverX}
            y1={padTop}
            y2={padTop + plotH}
            stroke="#4cd7f6"
            strokeOpacity="0.6"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
        )}
      </svg>

      {/* Crosshair Readout Flyout */}
      {hoverIdx !== null && series[hoverIdx] && (
        <div className="absolute top-2 right-3 glass-flyout rounded px-3 py-2 text-[11px] font-mono pointer-events-none shadow-lg">
          <div className="text-slate-400 mb-1 border-b border-slate-700/80 pb-1">
            {series[hoverIdx].timestamp} UTC
          </div>
          <div className="space-y-0.5 tabular-nums">
            {activeMetrics.map((m) => (
              <div key={m} className="flex items-center justify-between gap-4">
                <span className="text-slate-300">{METRIC_META[m].label}</span>
                <span style={{ color: METRIC_META[m].color }} className="font-semibold">
                  {series[hoverIdx][m]}
                  {METRIC_META[m].unit}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
