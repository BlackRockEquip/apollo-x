"use client";

import { useMemo, useState } from "react";
import { Table2 } from "lucide-react";

// 2026-09-15, user request: "add a linegraph that is customizable for
// different analytics eg: total jobs per month, total completed jobs,
// warrantys per month etc, user can select 3 line graph views." Each chart
// was originally one series per card (one metric, chosen on Settings >
// Dashboard — see DashboardSettingsWorkspace.tsx). Built as plain inline SVG
// rather than pulling in a charting library — this is a small, fixed shape
// (up to 3 lines, ~12 monthly points each), and the app has no charting
// dependency anywhere else yet.
//
// 2026-09-18, user request: "combine line graphs into 1 interactive graph."
// All of the available metrics (jobs created, jobs completed, warranty
// jobs, support tickets opened — see DASHBOARD_ANALYTICS_METRIC_DEFS in
// dashboard/service.ts) are the same unit, "a count per month," on the same
// trailing-12-month window, so one shared linear Y-axis is correct here —
// per the dataviz skill's "never a dual-axis chart" rule, this only works
// because the series are unit-homogeneous, not because the rule was waived.
// Replaces the one-card-per-metric AnalyticsLineChart with a single
// CombinedAnalyticsChart: one SVG, one shared X/Y scale, a categorical
// color per series (fixed order below, run through the dataviz skill's
// validate_palette.js — passes, with the one CVD-adjacent-pair WARN
// covered by the secondary encoding — legend + direct end labels — already
// present per the skill's own exception for that WARN band), a legend
// (required for >= 2 series), a shared hover crosshair whose tooltip lists
// every series' value at that month, and a combined "view as table" (one
// row per month, one column per series) so every value is still reachable
// without the chart at all.

export type AnalyticsSeriesPoint = { month: string; value: number };
export type AnalyticsSeries = { key: string; label: string; points: AnalyticsSeriesPoint[] };

const WIDTH = 900;
const HEIGHT = 280;
const PAD_LEFT = 42;
const PAD_RIGHT = 16;
const PAD_TOP = 20;
const PAD_BOTTOM = 28;

// Fixed categorical order — never reassigned/cycled based on which metrics
// happen to be selected, per the dataviz skill's categorical-color rule.
// Validated: node validate_palette.js "#2674df,#087a55,#b8871f,#b42318"
// --mode light -> ALL CHECKS PASS (one adjacent-pair CVD WARN, legal here
// because both the legend and the direct end-of-line labels below already
// give every series a non-color identity).
const SERIES_COLORS = ["var(--blue-600)", "var(--success)", "var(--gold-600)", "var(--danger)"];

// Rounds a chart's top gridline up to a "clean" number (skill: "Y-axis
// ticks: round to clean numbers") — 1/2/5 × a power of ten at or above the
// max value, never just the raw max.
function niceCeiling(max: number): number {
  if (max <= 0) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  for (const step of [1, 2, 2.5, 5, 10]) {
    const candidate = step * magnitude;
    if (candidate >= max) return candidate;
  }
  return 10 * magnitude;
}

export function CombinedAnalyticsChart({ series }: { series: AnalyticsSeries[] }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  // All series share the same trailing-12-month bucket list (see
  // monthBuckets in dashboard/service.ts), so the longest one's months are
  // the shared X axis — guards against a series legitimately coming back
  // empty (e.g. a brand-new company with zero warranty jobs ever).
  const months = useMemo(() => {
    const longest = series.reduce((a, b) => (b.points.length > a.length ? b.points.map((p) => p.month) : a), [] as string[]);
    return longest;
  }, [series]);

  const plotWidth = WIDTH - PAD_LEFT - PAD_RIGHT;
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const max = useMemo(() => niceCeiling(Math.max(...series.flatMap((s) => s.points.map((p) => p.value)), 0)), [series]);
  const step = months.length > 1 ? plotWidth / (months.length - 1) : 0;

  function xFor(index: number) { return PAD_LEFT + step * index; }
  function yFor(value: number) { return PAD_TOP + plotHeight * (1 - (max > 0 ? value / max : 0)); }

  const gridlineValues = [0, max / 4, max / 2, (max * 3) / 4, max];
  const labelEvery = months.length > 8 ? 2 : 1;

  function moveHover(delta: number) {
    setHoverIndex((current) => {
      const base = current ?? months.length - 1;
      return Math.min(months.length - 1, Math.max(0, base + delta));
    });
  }

  function handlePointerMove(e: React.PointerEvent<SVGRectElement>) {
    const svg = e.currentTarget.ownerSVGElement;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scaleX = WIDTH / rect.width;
    const localX = (e.clientX - rect.left) * scaleX;
    const index = step > 0 ? Math.round((localX - PAD_LEFT) / step) : 0;
    setHoverIndex(Math.min(months.length - 1, Math.max(0, index)));
  }

  if (series.length === 0 || months.length === 0) return null;

  return (
    <article className="analytics-chart-card">
      <header className="analytics-chart-header">
        <h3>Analytics</h3>
        <button type="button" className="quiet-button" aria-pressed={showTable} onClick={() => setShowTable((v) => !v)}>
          <Table2 size={13} /> {showTable ? "View chart" : "View as table"}
        </button>
      </header>

      {/* Legend — required whenever there are >= 2 series (the dataviz
          skill's own rule); also true for a lone series here since it still
          reads more clearly with its color named than implied. */}
      <div className="analytics-chart-legend">
        {series.map((s, i) => (
          <span key={s.key} className="analytics-chart-legend-item">
            <span className="analytics-chart-legend-swatch" style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }} />
            {s.label}
          </span>
        ))}
      </div>

      {showTable ? (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead><tr><th>Month</th>{series.map((s) => <th key={s.key} className="numeric">{s.label}</th>)}</tr></thead>
            <tbody>
              {months.map((month, i) => (
                <tr key={month}>
                  <td>{month}</td>
                  {series.map((s) => <td key={s.key} className="numeric">{(s.points[i]?.value ?? 0).toLocaleString("en-ZA")}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label={series.map((s) => `${s.label}: ${s.points.map((p) => `${p.month} ${p.value}`).join(", ")}`).join(". ")}
          className="analytics-chart-svg"
          tabIndex={0}
          onFocus={() => setHoverIndex((current) => current ?? months.length - 1)}
          onBlur={() => setHoverIndex(null)}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") { e.preventDefault(); moveHover(-1); }
            else if (e.key === "ArrowRight") { e.preventDefault(); moveHover(1); }
          }}
        >
          {/* Recessive hairline gridlines, with clean-rounded y-axis labels. */}
          {gridlineValues.map((value, i) => {
            const y = yFor(value);
            return (
              <g key={i}>
                <line x1={PAD_LEFT} y1={y} x2={WIDTH - PAD_RIGHT} y2={y} stroke="var(--ink-150)" strokeWidth={1} />
                <text x={PAD_LEFT - 6} y={y} textAnchor="end" dominantBaseline="middle" fontSize={9} fill="var(--ink-500)">{Math.round(value).toLocaleString("en-ZA")}</text>
              </g>
            );
          })}
          {/* X-axis month labels — every point gets a tick, only some get a label to avoid collisions. */}
          {months.map((month, i) => (i % labelEvery === 0 || i === months.length - 1) && (
            <text key={i} x={xFor(i)} y={HEIGHT - PAD_BOTTOM + 14} textAnchor="middle" fontSize={9} fill="var(--ink-500)">{month}</text>
          ))}

          {series.map((s, si) => {
            const color = SERIES_COLORS[si % SERIES_COLORS.length];
            const linePath = s.points.map((p, i) => `${i === 0 ? "M" : "L"}${xFor(i).toFixed(1)},${yFor(p.value).toFixed(1)}`).join(" ");
            const lastPoint = s.points[s.points.length - 1];
            return (
              <g key={s.key}>
                <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                {/* Direct label only at each line's end, per the skill's "lines -> value at the end" — stays readable with up to 4 series (the skill's own direct-label ceiling). */}
                {lastPoint && (
                  <>
                    <circle cx={xFor(s.points.length - 1)} cy={yFor(lastPoint.value)} r={4} fill={color} stroke="white" strokeWidth={2} />
                    <text x={xFor(s.points.length - 1)} y={yFor(lastPoint.value) - 10} textAnchor="end" fontSize={10} fontWeight={700} fill="var(--ink-900)">{lastPoint.value.toLocaleString("en-ZA")}</text>
                  </>
                )}
                {/* Hover/focus point per series, at the shared hovered month. */}
                {hoverIndex != null && s.points[hoverIndex] && (
                  <circle cx={xFor(hoverIndex)} cy={yFor(s.points[hoverIndex].value)} r={4} fill={color} stroke="white" strokeWidth={2} />
                )}
              </g>
            );
          })}

          {/* Shared crosshair + combined tooltip (all series' values at the hovered month) — reachable by keyboard (ArrowLeft/ArrowRight), not hover-only. */}
          {hoverIndex != null && (
            <g>
              <line x1={xFor(hoverIndex)} y1={PAD_TOP} x2={xFor(hoverIndex)} y2={HEIGHT - PAD_BOTTOM} stroke="var(--ink-300)" strokeWidth={1} />
              {(() => {
                const tipWidth = 150;
                const tipHeight = 18 + series.length * 15;
                const nearRightEdge = xFor(hoverIndex) + 10 + tipWidth > WIDTH - PAD_RIGHT;
                const tipX = nearRightEdge ? xFor(hoverIndex) - 10 - tipWidth : xFor(hoverIndex) + 10;
                const tipY = Math.max(PAD_TOP, PAD_TOP + 4);
                return (
                  <g>
                    <rect x={tipX} y={tipY} width={tipWidth} height={tipHeight} rx={6} fill="var(--ink-900)" opacity={0.92} />
                    <text x={tipX + 10} y={tipY + 14} fontSize={10} fontWeight={700} fill="white">{months[hoverIndex]}</text>
                    {series.map((s, si) => (
                      <text key={s.key} x={tipX + 10} y={tipY + 14 + (si + 1) * 15} fontSize={9.5} fill="var(--ink-150)">
                        {s.label}: <tspan fontWeight={700} fill="white">{(s.points[hoverIndex]?.value ?? 0).toLocaleString("en-ZA")}</tspan>
                      </text>
                    ))}
                  </g>
                );
              })()}
            </g>
          )}

          {/* Full-plot transparent hit layer — "the crosshair finds the X", not a pinpoint per point. */}
          <rect
            x={PAD_LEFT} y={PAD_TOP} width={plotWidth} height={plotHeight}
            fill="transparent"
            onPointerMove={handlePointerMove}
            onPointerLeave={() => setHoverIndex(null)}
          />
        </svg>
      )}
    </article>
  );
}
