import Link from "next/link";
import { TESTING_KINDS, type TestingKindKey } from "@/lib/testing/nav";

// 2026-11-12: the Engines, Brakes and Torque Converters pages under Testing. Their test sheets are not set up yet, so each page says
// so and points to the one that is (Transmissions).
export function TestingComingSoon({ kind, blurb }: { kind: Exclude<TestingKindKey, "transmissions">; blurb: string }) {
  const entry = TESTING_KINDS.find((item) => item.key === kind)!;
  const transmissions = TESTING_KINDS[0];
  return <div>
    <header className="page-header compact"><div><p className="eyebrow">Testing</p><h1>{entry.label}</h1><p>{blurb}</p></div></header>
    <section className="detail-panel">
      <div className="table-state compact-empty-state" style={{ display: "grid", gap: 6, justifyItems: "center", padding: "36px 16px" }}>
        <strong>{entry.label} test sheets are coming soon</strong>
        <span>They are not set up yet. Transmission test sheets are ready to use.</span>
        <Link href={transmissions.href} className="quiet-button" style={{ marginTop: 8 }}>Open Transmissions</Link>
      </div>
    </section>
  </div>;
}
