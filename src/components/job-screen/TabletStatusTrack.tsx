"use client";

import { useEffect, useRef } from "react";
import { Check, Lock } from "lucide-react";

// Read-only status track for the mechanic tablet layout: big chips, the current one filled, scrolled into view.
export function TabletStatusTrack({ steps, labels, status, note }: { steps: string[]; labels: Record<string, string>; status: string; note?: string }) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const currentIndex = steps.indexOf(status);
  useEffect(() => {
    const track = trackRef.current;
    const current = track?.querySelector<HTMLElement>('[data-current="true"]');
    if (!track || !current) return;
    track.scrollLeft = Math.max(0, current.offsetLeft - track.clientWidth / 2 + current.offsetWidth / 2);
  }, [status, steps.length]);
  return (
    <div className="jt-track-wrap">
      <p className="jt-track-note">
        <Lock size={14} aria-hidden="true" />
        <span>{currentIndex >= 0 ? <strong>Step {currentIndex + 1} of {steps.length}.</strong> : null} {note ?? "Status changes for this job are managed by your office team."}</span>
      </p>
      <div className="jt-track" ref={trackRef} role="list" aria-label="Job status">
        {steps.map((step, i) => {
          const done = i < currentIndex;
          const current = i === currentIndex;
          return (
            <div key={step} className="jt-track-item" role="listitem" data-current={current ? "true" : undefined}>
              <span className={`jt-chip${done ? " done" : ""}${current ? " current" : ""}`} aria-current={current ? "step" : undefined}>
                {done ? <Check size={15} strokeWidth={3} aria-hidden="true" /> : null}{labels[step] ?? step}
              </span>
              {i < steps.length - 1 ? <span className={`jt-track-line${i < currentIndex ? " done" : ""}`} aria-hidden="true" /> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
