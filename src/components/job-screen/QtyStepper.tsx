"use client";

import { Minus, Plus } from "lucide-react";

// Big minus / plus around a number box, for entering how many parts arrived.
export function QtyStepper({ value, min = 1, max, onChange, label }: { value: string; min?: number; max: number; onChange: (next: string) => void; label: string }) {
  const n = Number(value);
  const current = Number.isFinite(n) ? n : min;
  const set = (next: number) => onChange(String(Math.min(max, Math.max(min, next))));
  return (
    <div className="jt-stepper" role="group" aria-label={label}>
      <button type="button" className="jt-icon-button big" onClick={() => set(current - 1)} disabled={current <= min} aria-label="One less"><Minus size={24} /></button>
      <input
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step="any"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
      />
      <button type="button" className="jt-icon-button big" onClick={() => set(current + 1)} disabled={current >= max} aria-label="One more"><Plus size={24} /></button>
    </div>
  );
}
