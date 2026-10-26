"use client";

import { useState } from "react";
import { Download } from "lucide-react";

// 2026-10-26, user request: "on platform administrators, within a company, add a button that
// allows the platform admin to download the complete activity history of that company".
export function DownloadActivityHistoryButton({ companyId }: { companyId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function download() {
    setError("");
    setBusy(true);
    try {
      const response = await fetch(`/api/v1/platform/companies/${encodeURIComponent(companyId)}/activity-export`, { cache: "no-store" });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(body?.error?.message || "Unable to download the activity history.");
      }
      const blob = await response.blob();
      const match = /filename="([^"]+)"/.exec(response.headers.get("content-disposition") || "");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = match?.[1] || "activity-history.xlsx";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to download the activity history.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="quiet-button" disabled={busy} onClick={() => void download()}>
        <Download size={12} style={{ verticalAlign: "-2px" }} /> {busy ? "Preparing…" : "Download activity history"}
      </button>
      {error ? <span className="inline-error" role="alert">{error}</span> : null}
    </>
  );
}
