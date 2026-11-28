"use client";

import "./tt.css";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Layers, Loader2, Search, XCircle } from "lucide-react";
import { errText, fmtDate, tt } from "./api";

// ---------------------------------------------------------------------------
// Verify a certificate number (any signed-in Flo X user).
// ---------------------------------------------------------------------------

type Verified = { found: false; certNo: string } | { found: true; certNo: string; holder: string; course: string; company: string; approvedAt: string | null; status: string; revokedAt: string | null };

export function VerifyView({ initial }: { initial?: string }) {
  const [no, setNo] = useState(initial ?? "");
  const [result, setResult] = useState<Verified | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const check = useCallback(async (value: string) => {
    if (!value.trim()) return;
    setBusy(true); setError("");
    try { setResult(await tt<Verified>(`verify/${encodeURIComponent(value.trim().toUpperCase())}`)); }
    catch (e) { setError(errText(e, "Unable to check the certificate.")); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { if (!initial) return; const t = setTimeout(() => void check(initial), 0); return () => clearTimeout(t); }, [initial, check]);
  return (
    <div className="tt" style={{ maxWidth: 640 }}>
      <header className="page-header compact"><div><p className="eyebrow">Tech Training</p><h1>Verify a certificate</h1><p>Type the number printed at the bottom of the certificate.</p></div></header>
      <form className="tt-bar" onSubmit={(e) => { e.preventDefault(); void check(no); }}>
        <label className="search-control tt-grow"><Search size={15} /><input aria-label="Certificate number" value={no} onChange={(e) => setNo(e.target.value)} placeholder="e.g. BRE-HYD-3-20261127-AB12" /></label>
        <button type="submit" className="gold-button" disabled={busy}>{busy ? <Loader2 className="spin" size={14} /> : null} Check</button>
      </form>
      {error && <div className="inline-error">{error}</div>}
      {result && (result.found ? (
        <div className={`tt-note ${result.status === "VALID" ? "ok" : "bad"}`}>
          <strong>{result.status === "VALID" ? <><CheckCircle2 size={15} /> Valid certificate</> : <><XCircle size={15} /> Revoked on {fmtDate(result.revokedAt)}</>}</strong>
          <div style={{ marginTop: 6 }}>{result.holder} completed <strong>{result.course}</strong>{result.company ? ` (${result.company})` : ""}, approved {fmtDate(result.approvedAt)}.</div>
          <div className="tt-mono" style={{ marginTop: 4 }}>{result.certNo}</div>
        </div>
      ) : <div className="tt-note bad"><XCircle size={15} /> No issued certificate has the number {result.certNo}.</div>)}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Revision cards: a few questions a day from courses already done, spaced out (1, 3, 7, 14, 30 days).
// ---------------------------------------------------------------------------

type Card = { questionKey: string; course: string; prompt: string; options: string[]; multi: boolean; box: number };
type Answer = { correct: boolean; answer: number[]; explanation: string; nextInDays: number };

export function RevisionCards() {
  const [cards, setCards] = useState<Card[] | null>(null);
  const [i, setI] = useState(0);
  const [given, setGiven] = useState<number[]>([]);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [score, setScore] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => { tt<{ cards: Card[] }>("learn/cards").then((d) => setCards(d.cards)).catch((e) => setError(errText(e, "Unable to load revision cards."))); }, []);
  async function check() {
    const card = cards![i];
    try { const a = await tt<Answer>("learn/cards", { method: "POST", body: { questionKey: card.questionKey, given } }); setAnswer(a); if (a.correct) setScore((s) => s + 1); }
    catch (e) { setError(errText(e, "Unable to check the answer.")); }
  }
  function next() { setI(i + 1); setGiven([]); setAnswer(null); }
  if (error) return <div className="inline-error">{error}</div>;
  if (!cards) return <div className="table-state"><Loader2 className="spin" size={20} /> Loading…</div>;
  const header = <header className="page-header compact"><div><p className="eyebrow">Tech Training</p><h1><Layers size={20} /> Revision cards</h1><p>A few questions from courses you have done, so they stay fresh. Right answers come back later, wrong ones tomorrow.</p></div></header>;
  if (i >= cards.length) return <div className="tt" style={{ maxWidth: 720 }}>{header}<div className="tt-card tt-empty">{cards.length ? `Done for today: ${score} of ${cards.length} right.` : "No cards due today. Cards appear after you take quizzes."}<div style={{ marginTop: 12 }}><Link className="quiet-button" href="/tech-training">Back to courses</Link></div></div></div>;
  const card = cards[i];
  return (
    <div className="tt" style={{ maxWidth: 720 }}>
      {header}
      <div className="tt-bar"><span className="tt-sub">{card.course}</span><span className="tt-grow" /><span className="tt-mono">{i + 1} / {cards.length}</span></div>
      <div className="tt-q">
        <h3>{card.prompt}</h3>
        {card.options.map((o, oi) => {
          const picked = given.includes(oi);
          const cls = answer ? (answer.answer.includes(oi) ? "right" : picked ? "wrong" : "") : picked ? "picked" : "";
          return <label key={oi} className={`tt-opt ${cls}`}><input type={card.multi ? "checkbox" : "radio"} name="card" disabled={!!answer} checked={picked} onChange={() => setGiven(card.multi ? (picked ? given.filter((g) => g !== oi) : [...given, oi]) : [oi])} />{o}</label>;
        })}
        {answer && <div className={`tt-note ${answer.correct ? "ok" : "bad"}`}>{answer.correct ? "Right." : "Not quite."} {answer.explanation} <span className="tt-sub">Next time in {answer.nextInDays} day{answer.nextInDays === 1 ? "" : "s"}.</span></div>}
      </div>
      <div className="tt-bar">{!answer ? <button type="button" className="gold-button" disabled={!given.length} onClick={() => void check()}>Check</button> : <button type="button" className="gold-button" onClick={next}>Next card →</button>}</div>
    </div>
  );
}
