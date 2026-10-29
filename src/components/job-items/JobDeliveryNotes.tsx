"use client";

import { useCallback, useEffect, useState } from "react";
import { Printer } from "lucide-react";
import type { DeliveryNoteLine } from "@/lib/jobs/item-model";

// 2026-10-29, user request (Engineering): the delivery notes issued for this job, oldest first, with a Reprint button that prints
// a note exactly as it was issued (same number, date and lines). Shown only once the job has at least one note. The company-wide
// list is the register (Jobs > Delivery notes).
export type JobDeliveryNoteRow = {
  id: string;
  number: string;
  deliveryDate: string;
  notes: string | null;
  lines: DeliveryNoteLine[];
  itemCount: number;
  createdAt: string;
  createdByName: string | null;
};

function fmt(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString("en-ZA", { timeZone: "UTC" });
}

export function JobDeliveryNotes({ jobId, refreshKey, onReprint }: { jobId: string; refreshKey: number; onReprint: (note: JobDeliveryNoteRow) => void }) {
  const [notes, setNotes] = useState<JobDeliveryNoteRow[]>([]);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/v1/jobs/${jobId}/delivery-notes`, { cache: "no-store" });
      if (!response.ok) return;
      const body = await response.json();
      setNotes(Array.isArray(body.items) ? body.items : []);
    } catch {
      /* the list is a convenience; the register page still has every note */
    }
  }, [jobId]);

  useEffect(() => { void load(); }, [load, refreshKey]);

  if (notes.length === 0) return null;
  return (
    <section className="detail-panel full-row ji-card">
      <header className="ji-card-head">
        <div>
          <h2>Delivery notes</h2>
          <p>Every delivery note issued for this job. Reprint prints a note exactly as it was issued.</p>
        </div>
        <span className="ji-count">{notes.length} {notes.length === 1 ? "note" : "notes"}</span>
      </header>
      <div className="ji-scroll">
        <table className="ji-table readonly">
          <thead>
            <tr><th>Number</th><th>Delivery date</th><th>Items</th><th>Lines</th><th>Issued</th><th className="ji-actions-col"><span className="ji-sr">Actions</span></th></tr>
          </thead>
          <tbody>
            {notes.map((note) => (
              <tr key={note.id} className="ji-row">
                <td><span className="ji-tag">{note.number}</span></td>
                <td>{fmt(note.deliveryDate)}</td>
                <td>{note.itemCount > 0 ? note.itemCount : "-"}</td>
                <td><span className="ji-sub-inline">{note.lines.map((line) => line.description).filter(Boolean).join("  |  ") || "-"}</span></td>
                <td>{new Date(note.createdAt).toLocaleDateString("en-ZA")}{note.createdByName ? ` · ${note.createdByName}` : ""}</td>
                <td className="ji-actions-col">
                  <button type="button" className="quiet-button" onClick={() => onReprint(note)}><Printer size={13} /> Reprint</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
