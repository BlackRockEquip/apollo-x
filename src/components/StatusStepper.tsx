"use client";

import { Check } from "lucide-react";

// A generic clickable horizontal progress tracker for a job's status —
// click any stage to jump straight there. Ported from ModApp's
// StatusStepper.tsx (components/StatusStepper.tsx there), but simplified to
// fit Apollo X's conventions: this is a "dumb" controlled component (no
// internal pending/error/optimistic state of its own) and the caller
// (JobWorkspace.tsx) drives it with the already-fresh `job.status` and its
// existing `postAction`/`saving`/`error` plumbing, rather than duplicating
// that machinery here the way ModApp's self-contained version does.
export function StatusStepper<T extends string>({
  steps,
  labels,
  status,
  disabled,
  onSelect,
}: {
  steps: T[];
  labels: Record<T, string>;
  status: T;
  disabled?: boolean;
  onSelect: (step: T) => void;
}) {
  const currentIndex = steps.indexOf(status);

  return (
    <div className="status-stepper">
      <div className="status-stepper-track">
        {steps.map((step, i) => {
          const isDone = i < currentIndex;
          const isCurrent = i === currentIndex;
          return (
            <div key={step} className="status-stepper-item">
              <button
                type="button"
                disabled={disabled || isCurrent}
                onClick={() => onSelect(step)}
                className={`status-stepper-node${isDone ? " done" : ""}${isCurrent ? " current" : ""}`}
              >
                <span className="status-stepper-dot">{isDone ? <Check size={11} /> : i + 1}</span>
                <span className="status-stepper-label">{labels[step] ?? step}</span>
              </button>
              {i < steps.length - 1 && <div className={`status-stepper-connector${i < currentIndex ? " done" : ""}`} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
