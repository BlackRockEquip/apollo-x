"use client";

import { useMemo, useState } from "react";
import { Table2 } from "lucide-react";

// 2026-09-15, user request: "add a linegraph that is customizable for
// different analytics eg: total jobs per month, total completed jobs,
// warrantys per month etc, user can select 3 line graph views." Each chart
// is exactly one series (one metric, chosen on Settings > Dashboard — see
// DashboardSettingsWorkspace.tsx), so per the dataviz skill's own rule a
// single series needs no legend box: the card's own title already says
// what's plotted. Built as plain inline SVG rather than pulling in a
// charting library — this is a small, fixed shape (one line, ~12 monthly
// points), and the app has no charting dependency anywhere else yet.
//
// Follows the skill's mark specs: 2px round-joined line, >=8px end/hover
// marker with a 2px surface ring, hairline recessive gridlines, a direct
// label only at the line's end (not on every point), a hover crosshair +
// tooltip (also reachable by keyboard focus + arrow keys, not hover-only),
// and a "View as table" fallback so every value is reachable without the
// chart at all.

export type AnalyticsSeriesPoint = { month: string; value: number };

const WIDTH = 640;
const HEIGHT = 220;
const PAD_LEFT = 38;
const PAD_RIGHT = 14;
const PAD_TOP = 16;
const PAD_BOTTOM = 24;
const LINE_COLOR = "var(--gold-600)";

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

export function AnalyticsLineChart({ title, points }: { title: string; points: AnalyticsSeriesPoint[] }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  const plotWidth = WIDTH - PAD_LEFT - PAD_RIGHT;
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const max = useMemo(() => niceCeiling(Math.max(...points.map((p) => p.value), 0)), [points]);
  const step = points.length > 1 ? plotWidth / (points.length - 1) : 0;

  function xFor(index: number) { return PAD_LEFT + step * index; }
  function yFor(value: number) { return PAD_TOP + plotHeight * (1 - (max > 0 ? value / max : 0)); }

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${xFor(i).toFixed(1)},${yFor(p.value).toFixed(1)}`).join(" ");
  const gridlineValues = [0, max / 4, max / 2, (max * 3) / 4, max];
  // Show every point's tick, but only label some when there are many
  // (12 months at this width would collide) — always the first and last.
  const labelEvery = points.length > 8 ? 2 : 1;

  function moveHover(delta: number) {
    setHoverIndex((current) => {
      const base = current ?? points.length - 1;
      const next = Math.min(points.length - 1, Math.max(0, base + delta));
      return next;
    });
  }

  function handlePointerMove(e: React.PointerEvent<SVGRectElement>) {
    const svg = e.currentTarget.ownerSVGElement;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scaleX = WIDTH / rect.width;
    const localX = (e.clientX - rect.left) * scaleX;
    const index = step > 0 ? Math.round((localX - PAD_LEFT) / step) : 0;
    setHoverIndex(Math.min(points.length - 1, Math.max(0, index)));
  }

  const hovered = hoverIndex != null ? points[hoverIndex] : null;
  const lastPoint = points[points.length - 1];

  return (
    <article className="analytics-chart-card">
      <header className="analytics-chart-header">
        <h3>{title}</h3>
        <button type="button" className="quiet-button" aria-pressed={showTable} onClick={() => setShowTable((v) => !v)}>
          <Table2 size={13} /> {showTable ? "View chart" : "View as table"}
        </button>
      </header>
      {showTable ? (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead><tr><th>Month</th><th>Value</th></tr></thead>
            <tbody>{points.map((p, i) => <tr key={i}><td>{p.month}</td><td>{p.value.toLocaleString("en-ZA")}</td></tr>)}</tbody>
          </table>
        </div>
      ) : points.length === 0 ? (
        <div className="table-state compact-empty-state">No data yet.</div>
      ) : (
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label={`${title}: ${points.map((p) => `${p.month} ${p.value}`).join(", ")}`}
          className="analytics-chart-svg"
          tabIndex={0}
          onFocus={() => setHoverIndex((current) => current ?? points.length - 1)}
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
          {points.map((p, i) => (i % labelEvery === 0 || i === points.length - 1) && (
            <text key={i} x={xFor(i)} y={HEIGHT - PAD_BOTTOM + 14} textAnchor="middle" fontSize={9} fill="var(--ink-500)">{p.month}</text>
          ))}
          <path d={linePath} fill="none" stroke={LINE_COLOR} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          {/* Direct label only at the line's end, per the skill's "lines -> value at the end." */}
          <circle cx={xFor(points.length - 1)} cy={yFor(lastPoint.value)} r={4} fill={LINE_COLOR} stroke="white" strokeWidth={2} />
          <text x={xFor(points.length - 1)} y={yFor(lastPoint.value) - 10} textAnchor="end" fontSize={10} fontWeight={700} fill="var(--ink-900)">{lastPoint.value.toLocaleString("en-ZA")}</text>
          {/* Hover/focus crosshair + point + tooltip — same details reachable by keyboard (ArrowLeft/ArrowRight) as by pointer. */}
          {hovered && hoverIndex != null && (
            <g>
              <line x1={xFor(hoverIndex)} y1={PAD_TOP} x2={xFor(hoverIndex)} y2={HEIGHT - PAD_BOTTOM} stroke="var(--ink-300)" strokeWidth={1} />
              <circle cx={xFor(hoverIndex)} cy={yFor(hovered.value)} r={4} fill={LINE_COLOR} stroke="white" strokeWidth={2} />
              {(() => {
                const tipWidth = 96;
                const nearRightEdge = xFor(hoverIndex) + 10 + tipWidth > WIDTH - PAD_RIGHT;
                const tipX = nearRightEdge ? xFor(hoverIndex) - 10 - tipWidth : xFor(hoverIndex) + 10;
                const tipY = Math.max(PAD_TOP, yFor(hovered.value) - 30);
                return (
                  <g>
                    <rect x={tipX} y={tipY} width={tipWidth} height={34} rx={6} fill="var(--ink-900)" opacity={0.92} />
                    <text x={tipX + 10} y={tipY + 14} fontSize={11} fontWeight={700} fill="white">{hovered.value.toLocaleString("en-ZA")}</text>
                    <text x={tipX + 10} y={tipY + 26} fontSize={9} fill="var(--ink-150)">{hovered.month}</text>
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
