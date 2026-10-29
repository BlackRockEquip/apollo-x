"use client";

// 2026-10-29, user request: the tabs work and look like the item mockup. This is the card above them: the item's tag and component
// (or "All items" while none is selected) with a Change status button that moves that item. The tab strip sits directly beneath.
type Props = {
  /** BRE1122-2, or "JOB BRE1122" while no item is selected. */
  tag: string;
  title: string;
  subtitle?: string;
  steps: string[];
  labels: Record<string, string>;
  status?: string | null;
  /** Show Change status (people who may move items, on a job that is not complete / closed / cancelled). */
  canChange: boolean;
  disabled?: boolean;
  onChangeStatus: (step: string) => void;
};

export function ItemHeader({ tag, title, subtitle, steps, labels, status, canChange, disabled, onChangeStatus }: Props) {
  return (
    <section className="jw-itemhead" aria-label={title}>
      <div className="jw-itemhead-text">
        <span className="jw-itemhead-tag">{tag}</span>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {canChange && (
        <div className="jw-itemhead-actions">
          <select className="jw-itembtn" value="" disabled={disabled} aria-label={`Change status of ${tag}`} onChange={(e) => { if (e.target.value) onChangeStatus(e.target.value); }}>
            <option value="">Change status</option>
            {steps.map((step) => <option key={step} value={step} disabled={step === status}>{labels[step] ?? step}{step === status ? " (current)" : ""}</option>)}
          </select>
        </div>
      )}
    </section>
  );
}
