"use client";

import { Check } from "lucide-react";
import { buildStepperNodes } from "@/lib/jobs/item-model";

// 2026-10-29, user request (Engineering): the job status stepper works like the item mockup - "Where the items are". One circle
// per step shows how many items sit on it; steps before the least advanced item are complete (green). Clicking a step moves the
// item that is selected on the job screen there (or every item, after a question, when none is selected).
type Props = {
  steps: string[];
  labels: Record<string, string>;
  /** Status of every item on the job (the job's own status for an ordinary one-item job). */
  statuses: string[];
  /** The selected item's status, to ring the step it is on. */
  selectedStatus?: string | null;
  disabled?: boolean;
  onSelect: (step: string) => void;
};

export function ItemsStepper({ steps, labels, statuses, selectedStatus, disabled, onSelect }: Props) {
  const nodes = buildStepperNodes(steps, statuses, selectedStatus);
  return (
    <div className="wi-stepper" role="group" aria-label="Where the items are">
      {nodes.map((node, index) => {
        const label = labels[node.step] ?? node.step;
        const here = node.count > 0 ? `${node.count} ${node.count === 1 ? "item" : "items"} here` : "No items here";
        return (
          <div key={node.step} className={`wi-node ${node.state}${node.selected ? " selected" : ""}`}>
            {/* The line into this step is green once the step before it is complete. */}
            {index > 0 && <span className={nodes[index - 1].state === "done" ? "wi-line done" : "wi-line"} aria-hidden="true" />}
            <button type="button" className="wi-circle" disabled={disabled} onClick={() => onSelect(node.step)} title={`${label} - ${here}`} aria-label={`${label}: ${here}. Move to this step.`}>
              {node.state === "done" && node.count === 0 ? <Check size={15} strokeWidth={3} /> : node.count}
            </button>
            <span className="wi-name">{label}</span>
          </div>
        );
      })}
    </div>
  );
}
