"use client";

import { useState } from "react";

// Number box that lets you clear and retype (a plain controlled number input snaps back to 0 as you type).
export function NumInput({ value, onChange, min = 0, step = 1, title }: { value: number; onChange: (n: number) => void; min?: number; step?: number; title?: string }) {
  const [text, setText] = useState(String(value));
  const [last, setLast] = useState(value);
  if (value !== last) {
    setLast(value);
    if (parseFloat(text) !== value) setText(String(value));
  }
  return (
    <input
      type="number"
      min={min}
      step={step}
      title={title}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const n = parseFloat(e.target.value);
        const next = Number.isFinite(n) && n >= min ? n : min;
        setLast(next);
        onChange(next);
      }}
    />
  );
}
