import type { FactItem } from "./job-facts";

export function JobFactsStrip({ items }: { items: FactItem[] }) {
  return (
    <section className="jw-facts" aria-label="Key facts">
      {items.map((item) => (
        <div key={item.key} className="jw-fact">
          <span className="jw-fact-label">{item.label}</span>
          <strong className={`jw-fact-value${item.value === "—" ? " empty" : ""}`}>{item.value}</strong>
          {item.note ? <span className={`jw-fact-note tone-${item.tone ?? "default"}`}>{item.note}</span> : null}
        </div>
      ))}
    </section>
  );
}
