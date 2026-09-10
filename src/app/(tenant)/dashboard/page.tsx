"use client";

/* eslint-disable react-hooks/set-state-in-effect -- async dashboard resource loading intentionally mirrors existing workspace patterns */
import { useEffect, useState } from "react";
import Link from "next/link";

type Widget = { key: string; enabled: boolean; order: number };
type DashboardData = { jobsSummary: Record<string, number>; recentJobs: Array<{ id: string }>; lowStock: Array<{ id: string }>; outstandingParts: Array<{ id: string }>; pexStatus: Record<string, number>; supportTickets: Record<string, number> };

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [data, setData] = useState<DashboardData | null>(null);

  async function load() {
    setLoading(true);
    try {
      const dataResponse = await fetch("/api/v1/dashboard", { cache: "no-store" });
      const body = await dataResponse.json();
      if (!dataResponse.ok) throw new Error(body.error?.message || "Unable to load dashboard.");
      setWidgets(body.widgets);
      setData(body.data);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load dashboard."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  const ordered = [...widgets].sort((a, b) => a.order - b.order);

  return <div>
    <header className="page-header compact"><div><p className="eyebrow">Overview</p><h1>Dashboard</h1></div><div className="header-actions"><Link href="/settings/dashboard" className="quiet-button">Customize dashboard</Link></div></header>
    {error ? <div className="inline-error">{error}</div> : null}
    {loading ? <div className="table-state">Loading dashboard…</div> : <>
      <section className="metric-grid compact">{ordered.filter((widget) => widget.enabled).map((widget) => <article key={widget.key} className="metric-card compact"><span>{widget.key.replaceAll("-", " ")}</span><strong>{widget.key === "jobs-summary" ? Object.values(data?.jobsSummary || {}).reduce((sum, value) => sum + Number(value || 0), 0) : widget.key === "low-stock" ? (data?.lowStock || []).length : widget.key === "support-tickets" ? Object.values(data?.supportTickets || {}).reduce((sum, value) => sum + Number(value || 0), 0) : widget.key === "pex-status" ? Object.values(data?.pexStatus || {}).reduce((sum, value) => sum + Number(value || 0), 0) : widget.key === "recent-jobs" ? (data?.recentJobs || []).length : widget.key === "outstanding-parts" ? (data?.outstandingParts || []).length : ""}</strong></article>)}</section>
    </>}
  </div>;
}
