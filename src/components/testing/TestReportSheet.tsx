"use client";

import "./testing.css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, Check, CheckCircle2, CircleDashed, Lock, Printer, RotateCcw, Trash2, X } from "lucide-react";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import {
  completionProblems, evaluateAll, evaluateReading, failureSentence, formatBounds, formatLimit, formatNumber, limitNeedsValue, summarizeReport,
  type ReadingEvaluation, type TestLimit, type TestReading, type TestReadings,
} from "@/lib/testing/spec";
import { printTestReport } from "./printTestReport";
import { ResultPill } from "./ResultPill";
import { formatDate, testingApi, type ReportDetail } from "./types";

type Form = {
  machineModel: string; serialNumber: string; customerName: string; testDate: string; inputRpm: string; testType: string;
  testers: string[]; comments: string; readings: TestReadings;
};

const formOf = (r: ReportDetail): Form => ({
  machineModel: r.machineModel, serialNumber: r.serialNumber, customerName: r.customerName, testDate: r.testDate, inputRpm: r.inputRpm == null ? "" : String(r.inputRpm),
  testType: r.testType, testers: r.testers, comments: r.comments, readings: r.readings,
});

// What goes to the server: only the typed text, notes and override reasons. The server adds who passed a reading and when.
function readingPayload(reading: TestReading | undefined) {
  if (!reading) return undefined;
  return { actual: reading.actual ?? "", ...(reading.note ? { note: reading.note } : {}), ...(reading.override?.reason ? { override: { reason: reading.override.reason } } : {}) };
}

function payloadOf(form: Form, showCustomer: boolean) {
  const params: Record<string, unknown> = {};
  for (const [id, reading] of Object.entries(form.readings.params ?? {})) { const p = readingPayload(reading); if (p) params[id] = p; }
  const clutches: Record<string, unknown> = {};
  for (const [id, cell] of Object.entries(form.readings.clutches ?? {})) {
    const a = readingPayload(cell?.a); const b = readingPayload(cell?.b);
    if (a || b) clutches[id] = { ...(a ? { a } : {}), ...(b ? { b } : {}) };
  }
  const rpm = form.inputRpm.trim() === "" ? null : Math.round(Number(form.inputRpm));
  return {
    machineModel: form.machineModel.trim() || undefined, serialNumber: form.serialNumber, ...(showCustomer ? { customerName: form.customerName } : {}),
    testDate: form.testDate, inputRpm: rpm != null && Number.isFinite(rpm) ? rpm : null, testType: form.testType, testers: form.testers, comments: form.comments,
    readings: { params, clutches },
  };
}

function stateText(ev: ReadingEvaluation, labelA: string): string {
  switch (ev.state) {
    case "PASS": return "In spec";
    case "FAIL": return ev.outBy === null ? "Out of spec" : `${formatNumber(ev.outBy)} ${ev.min !== null && ev.value !== null && ev.value < ev.min ? "under" : "over"}`;
    case "OVERRIDDEN": return "Passed with note";
    case "INVALID": return "Not a number";
    case "WAITING": return `Enter ${labelA} first`;
    case "RECORDED": return ev.value === null ? "Record only" : "Recorded";
    default: return "";
  }
}

function StateIcon({ state }: { state: ReadingEvaluation["state"] }) {
  if (state === "PASS" || state === "RECORDED") return <Check size={12} />;
  if (state === "FAIL" || state === "INVALID") return <X size={12} />;
  if (state === "OVERRIDDEN") return <AlertTriangle size={12} />;
  return null;
}

// One typed reading with its live verdict, and the "pass with note" and note tools underneath.
function ReadingField({ reading, evaluation, disabled, labelA, onChange, label }: {
  reading: TestReading | undefined; evaluation: ReadingEvaluation; disabled: boolean; labelA: string; label: string;
  onChange: (next: TestReading) => void;
}) {
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const [noteOpen, setNoteOpen] = useState(Boolean(reading?.note));
  const actual = reading?.actual ?? "";
  const set = (patch: Partial<TestReading>) => onChange({ ...(reading ?? { actual: "" }), actual, ...patch });
  const text = stateText(evaluation, labelA);
  return (
    <div className="tr-cell">
      <input
        className="tr-input" data-reading data-state={evaluation.state} inputMode="decimal" autoComplete="off" aria-label={label}
        value={actual} disabled={disabled} onChange={(e) => set({ actual: e.target.value })}
      />
      {text && <span className={`tr-state tr-state-${evaluation.state}`}><StateIcon state={evaluation.state} /> {text}</span>}
      {evaluation.state === "FAIL" && !disabled && !asking && <button type="button" className="tr-mini" onClick={() => setAsking(true)}>Pass with note…</button>}
      {asking && (
        <div className="tr-why">
          <span>Why does this reading pass? (needed)</span>
          <input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Max relief pressure when restricted" />
          <div className="tr-bar">
            <button type="button" className="quiet-button" onClick={() => { setAsking(false); setReason(""); }}>Cancel</button>
            <button type="button" className="gold-button" style={{ minHeight: 30 }} disabled={!reason.trim()} onClick={() => { set({ override: { reason: reason.trim(), by: "", at: "" } }); setAsking(false); setReason(""); }}>Pass with note</button>
          </div>
        </div>
      )}
      {evaluation.state === "OVERRIDDEN" && reading?.override && (
        <div className="tr-why"><span>{reading.override.reason}{reading.override.by ? ` (${reading.override.by})` : ""}</span>{!disabled && <button type="button" className="tr-mini" onClick={() => set({ override: null })}>Remove</button>}</div>
      )}
      {!disabled && !noteOpen && !reading?.note && evaluation.state !== "EMPTY" && evaluation.state !== "WAITING" && <button type="button" className="tr-mini" onClick={() => setNoteOpen(true)}>Add note</button>}
      {(noteOpen || reading?.note) && (disabled ? <span className="tr-sub">{reading?.note}</span> : <input className="tr-input" style={{ fontSize: 12, fontWeight: 400, minHeight: 30 }} aria-label={`${label} note`} placeholder="Note" value={reading?.note ?? ""} onChange={(e) => set({ note: e.target.value })} />)}
    </div>
  );
}

function Testers({ value, onChange, disabled }: { value: string[]; onChange: (next: string[]) => void; disabled: boolean }) {
  const [draft, setDraft] = useState("");
  function add() {
    const name = draft.trim();
    setDraft("");
    if (name && !value.includes(name) && value.length < 6) onChange([...value, name]);
  }
  return (
    <div className="tr-chips">
      {value.map((name) => <span key={name} className="tr-chip">{name}{!disabled && <button type="button" aria-label={`Remove ${name}`} onClick={() => onChange(value.filter((n) => n !== name))}><X size={11} /></button>}</span>)}
      {!disabled && <input value={draft} placeholder={value.length ? "Add another" : "Add a tester"} aria-label="Add a tester" onChange={(e) => setDraft(e.target.value)} onBlur={add} onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); } }} />}
    </div>
  );
}

export function TestReportSheet({ initial, canEdit, canManage, showCustomer, canOpenJob }: { initial: ReportDetail; canEdit: boolean; canManage: boolean; showCustomer: boolean; canOpenJob: boolean }) {
  const router = useRouter();
  const { confirm, dialog } = useConfirmDialog();
  const [report, setReport] = useState(initial);
  const [form, setForm] = useState<Form>(() => formOf(initial));
  const [saveState, setSaveState] = useState<"saved" | "dirty" | "saving" | "error">("saved");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showProblems, setShowProblems] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const completed = report.status === "COMPLETED";
  const readOnly = completed || !canEdit;
  const spec = report.spec;

  const latest = useRef(form);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const chain = useRef<Promise<boolean>>(Promise.resolve(true));

  const doSave = useCallback(async (): Promise<boolean> => {
    if (!dirty.current) return true;
    dirty.current = false;
    setSaveState("saving"); setError("");
    try {
      const saved = await testingApi<ReportDetail>(`/api/v1/testing-reports/${report.id}`, { method: "PUT", body: payloadOf(latest.current, showCustomer) });
      // Take back the server's copy of the readings (it stamps who passed a reading) only if nothing was typed meanwhile.
      if (!dirty.current) setForm((cur) => { const next = { ...cur, readings: saved.readings }; latest.current = next; return next; });
      setReport((cur) => ({ ...cur, updatedAt: saved.updatedAt }));
      setSaveState(dirty.current ? "dirty" : "saved");
      return true;
    } catch (e) {
      dirty.current = true;
      setError(e instanceof Error ? e.message : "Unable to save.");
      setSaveState("error");
      return false;
    }
  }, [report.id, showCustomer]);

  const saveNow = useCallback(() => {
    clearTimeout(timer.current);
    chain.current = chain.current.then(doSave);
    return chain.current;
  }, [doSave]);

  const change = useCallback((patch: Partial<Form> | ((cur: Form) => Partial<Form>)) => {
    setForm((cur) => { const next = { ...cur, ...(typeof patch === "function" ? patch(cur) : patch) }; latest.current = next; return next; });
    dirty.current = true;
    setSaveState("dirty");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { void saveNow(); }, 700);
  }, [saveNow]);

  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty.current) e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const setParam = (id: string, next: TestReading) => change((cur) => ({ readings: { ...cur.readings, params: { ...(cur.readings.params ?? {}), [id]: next } } }));
  const setClutch = (id: string, col: "a" | "b", next: TestReading) => change((cur) => ({ readings: { ...cur.readings, clutches: { ...(cur.readings.clutches ?? {}), [id]: { ...(cur.readings.clutches?.[id] ?? {}), [col]: next } } } }));

  const live = useMemo(() => summarizeReport(spec, form.readings), [spec, form.readings]);
  const evaluated = useMemo(() => new Map(evaluateAll(spec, form.readings).map((row) => [row.key, row.evaluation])), [spec, form.readings]);
  const result = completed ? report.result : live.result;
  const problems = completionProblems(live, form.testers);

  // Enter moves to the next reading, so a tester can type straight down the sheet.
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "Enter" || !(e.target instanceof HTMLInputElement) || !e.target.hasAttribute("data-reading")) return;
    e.preventDefault();
    const inputs = Array.from(containerRef.current?.querySelectorAll<HTMLInputElement>("input[data-reading]:not(:disabled)") ?? []);
    const next = inputs[inputs.indexOf(e.target) + 1];
    if (next) { next.focus(); next.select(); }
  }

  async function run(action: () => Promise<void>) {
    setBusy(true); setError("");
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong."); } finally { setBusy(false); }
  }

  const applyServer = (detail: ReportDetail) => { setReport(detail); setForm(formOf(detail)); latest.current = formOf(detail); dirty.current = false; setSaveState("saved"); };

  async function complete() {
    if (problems.length > 0) { setShowProblems(true); return; }
    await run(async () => {
      if (!(await saveNow())) return;
      const verdict = live.result === "FAIL" ? "This test has failed readings and will be recorded as a Fail." : live.result === "PASS_WITH_NOTE" ? "This test will be recorded as Pass with note." : "All readings are in spec.";
      if (!(await confirm({ title: "Complete this test?", message: `${verdict} It becomes read-only; a manager can reopen it if something needs changing.`, confirmLabel: "Complete test", tone: live.result === "FAIL" ? "warning" : "neutral" }))) return;
      applyServer(await testingApi<ReportDetail>(`/api/v1/testing-reports/${report.id}/complete`, { method: "POST", body: {} }));
      setShowProblems(false);
    });
  }

  async function reopen() {
    if (!(await confirm({ title: "Reopen this test?", message: "It goes back to in progress and its result is cleared until it is completed again.", confirmLabel: "Reopen", tone: "warning" }))) return;
    await run(async () => applyServer(await testingApi<ReportDetail>(`/api/v1/testing-reports/${report.id}/reopen`, { method: "POST", body: {} })));
  }

  async function retest() {
    if (!(await confirm({ title: "Start a retest?", message: "A new empty sheet is created with the same limits, linked to this test. This test stays as it is.", confirmLabel: "Start retest", tone: "neutral" }))) return;
    await run(async () => { const next = await testingApi<ReportDetail>(`/api/v1/testing-reports/${report.id}/retest`, { method: "POST", body: {} }); router.push(`/testing-reports/${next.id}`); });
  }

  async function remove() {
    if (!(await confirm({ title: "Delete this draft?", message: `${report.label} and everything typed on it will be deleted.`, confirmLabel: "Delete", tone: "danger" }))) return;
    await run(async () => { dirty.current = false; await testingApi(`/api/v1/testing-reports/${report.id}`, { method: "DELETE" }); router.push("/testing-reports"); });
  }

  async function print() {
    await run(async () => {
      if (!readOnly && !(await saveNow())) return;
      const detail: ReportDetail = { ...report, ...form, inputRpm: form.inputRpm.trim() === "" ? null : Number(form.inputRpm), customerName: form.customerName, summary: live, result };
      const problem = await printTestReport(detail);
      if (problem) setError(problem);
    });
  }

  const banner = result === "FAIL" ? "fail" : result === "PASS_WITH_NOTE" ? "note" : result === "PASS" ? "pass" : "wait";

  return (
    <div className="tr-sheet" ref={containerRef} onKeyDown={onKeyDown}>
      {dialog}
      <div className="tr-head">
        <Link href="/testing-reports" className="quiet-button"><ArrowLeft size={14} /> All tests</Link>
        <h1>{report.label}</h1>
        <ResultPill result={result} status={report.status} />
        {completed && <span className="tr-pill tr-pill-done"><Lock size={12} /> Completed {report.completedAt ? formatDate(report.completedAt) : ""}</span>}
        <span className="tr-sub">{spec.name} · revision {spec.revision}</span>
        {report.job && (canOpenJob ? <Link className="tr-link" href={`/jobs/${report.job.id}`}>Job {report.job.jobNumber}</Link> : <span className="tr-sub">Job {report.job.jobNumber}</span>)}
        {report.retestOf && <Link className="tr-link" href={`/testing-reports/${report.retestOf.id}`}>Retest of {report.retestOf.label}</Link>}
        {report.retests.map((r) => <Link key={r.id} className="tr-link" href={`/testing-reports/${r.id}`}>Retest {r.label}</Link>)}
      </div>

      {error && <div className="inline-error" style={{ borderRadius: 8 }}>{error}</div>}

      <div className={`tr-banner tr-banner-${banner}`} role="status">
        {banner === "pass" ? <CheckCircle2 size={22} /> : banner === "wait" ? <CircleDashed size={22} /> : <AlertTriangle size={22} />}
        <div>
          <strong>{result === "FAIL" ? "Fail" : result === "PASS_WITH_NOTE" ? "Pass with note" : result === "PASS" ? "Pass" : "In progress"}</strong>
          {result === "FAIL" && <ul>{live.failures.map((f) => <li key={f.key}>{failureSentence(f)}</li>)}</ul>}
          {result === "PASS_WITH_NOTE" && <p>{live.overridden} reading{live.overridden === 1 ? " was" : "s were"} passed by hand with a reason.</p>}
          {result === "PASS" && <p>All {live.total} readings are within spec.</p>}
          {!result && <p>{live.entered} of {live.total} readings entered. The result shows once every reading is in, or straight away if one fails.</p>}
          {result === "FAIL" && !live.complete && <p>{live.missing} reading{live.missing === 1 ? "" : "s"} still to enter.</p>}
        </div>
      </div>

      <section className="tr-card">
        <header><div><h2>Test details</h2><p>{readOnly ? "Read only" : "Saved automatically as you type"}</p></div></header>
        <div className="tr-details">
          <label className="tr-field"><span>Machine model</span><input value={form.machineModel} disabled={readOnly} onChange={(e) => change({ machineModel: e.target.value })} /></label>
          <label className="tr-field"><span>Serial number</span><input value={form.serialNumber} disabled={readOnly} onChange={(e) => change({ serialNumber: e.target.value })} /></label>
          <label className="tr-field"><span>Test date</span><input type="date" value={form.testDate} disabled={readOnly} onChange={(e) => change({ testDate: e.target.value })} /></label>
          <label className="tr-field"><span>Input RPM</span><input inputMode="numeric" value={form.inputRpm} disabled={readOnly} onChange={(e) => change({ inputRpm: e.target.value.replace(/[^\d]/g, "") })} /></label>
          <label className="tr-field"><span>Test type</span><input value={form.testType} disabled={readOnly} placeholder="e.g. After repair" onChange={(e) => change({ testType: e.target.value })} /></label>
          {showCustomer && <label className="tr-field"><span>Customer</span><input value={form.customerName} disabled={readOnly} onChange={(e) => change({ customerName: e.target.value })} /></label>}
          <div className="tr-field wide"><span>Tested by {!readOnly && form.testers.length === 0 && <em style={{ color: "#9a1c12" }}>(required)</em>}</span><Testers value={form.testers} disabled={readOnly} onChange={(testers) => change({ testers })} /></div>
        </div>
      </section>

      {spec.parameters.length > 0 && (
        <section className="tr-card">
          <header><div><h2>Test data</h2><p>Flows, pressures and supply readings</p></div></header>
          <div className="tr-table-wrap">
            <table className="tr-table">
              <thead><tr><th>Parameter</th><th>Spec limit</th><th style={{ width: 230 }}>Actual</th></tr></thead>
              <tbody>
                {spec.parameters.map((p) => {
                  const ev = evaluated.get(`p:${p.id}`) ?? evaluateReading(p.limit, form.readings.params?.[p.id]);
                  return (
                    <tr key={p.id}>
                      <td className="tr-name">{p.name}{p.note && <div className="tr-sub" style={{ fontWeight: 400, whiteSpace: "normal" }}>{p.note}</div>}</td>
                      <td className="tr-limit">{formatLimit(p.limit)}{p.unit && p.limit.type !== "RECORD" && p.limit.type !== "NA" ? ` ${p.unit}` : ""}{limitNeedsValue(p.limit) && formatBounds(p.limit) !== formatLimit(p.limit) && <small>{formatBounds(p.limit)}</small>}</td>
                      <td>{p.limit.type === "NA" ? <span className="tr-na">N/A</span> : <ReadingField reading={form.readings.params?.[p.id]} evaluation={ev} disabled={readOnly} labelA={spec.labelA} label={p.name} onChange={(next) => setParam(p.id, next)} />}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {spec.clutchRows.length > 0 && (
        <section className="tr-card">
          <header><div><h2>Clutch pressures</h2><p>{spec.labelA} and {spec.labelB} for each clutch or gear. Press Enter to move to the next reading.</p></div></header>
          <div className="tr-table-wrap">
            <table className="tr-table">
              <thead><tr><th rowSpan={2}>Clutch</th><th colSpan={2}>{spec.labelA}</th><th colSpan={2} className="tr-gap">{spec.labelB}</th></tr><tr><th>Limit</th><th style={{ width: 200 }}>Actual</th><th className="tr-gap">Limit</th><th style={{ width: 200 }}>Actual</th></tr></thead>
              <tbody>
                {spec.clutchRows.map((row) => {
                  const cell = form.readings.clutches?.[row.id];
                  const aEval = row.a ? evaluated.get(`c:${row.id}:a`) ?? evaluateReading(row.a, cell?.a) : null;
                  const first = aEval && aEval.state !== "EMPTY" && aEval.state !== "INVALID" ? aEval.value : null;
                  const bEval = row.b ? evaluated.get(`c:${row.id}:b`) ?? evaluateReading(row.b, cell?.b, first) : null;
                  const limitCell = (limit: TestLimit | null, firstValue: number | null) => !limit || limit.type === "NA" ? <span className="tr-na">N/A</span> : <>{formatLimit(limit, spec.labelA)}{limitNeedsValue(limit) && formatBounds(limit, firstValue) !== formatLimit(limit, spec.labelA) && <small>{formatBounds(limit, firstValue)}</small>}</>;
                  return (
                    <tr key={row.id}>
                      <td className="tr-name">{row.name}</td>
                      <td className="tr-limit">{limitCell(row.a, null)}</td>
                      <td>{row.a && row.a.type !== "NA" && aEval ? <ReadingField reading={cell?.a} evaluation={aEval} disabled={readOnly} labelA={spec.labelA} label={`${row.name}, ${spec.labelA}`} onChange={(next) => setClutch(row.id, "a", next)} /> : null}</td>
                      <td className="tr-limit tr-gap">{limitCell(row.b, first)}</td>
                      <td>{row.b && row.b.type !== "NA" && bEval ? <ReadingField reading={cell?.b} evaluation={bEval} disabled={readOnly} labelA={spec.labelA} label={`${row.name}, ${spec.labelB}`} onChange={(next) => setClutch(row.id, "b", next)} /> : null}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="tr-card">
        <header><div><h2>Comments</h2></div></header>
        <div style={{ padding: "12px 15px" }}>
          <label className="tr-field"><textarea rows={3} value={form.comments} disabled={readOnly} placeholder="Anything the next person should know about this test" onChange={(e) => change({ comments: e.target.value })} /></label>
        </div>
      </section>

      <div className="tr-sticky">
        <div>
          <span className="tr-saved" data-state={saveState === "error" ? "error" : undefined}>
            {readOnly ? (completed ? "Completed and locked" : "Read only") : saveState === "saving" ? "Saving…" : saveState === "dirty" ? "Unsaved changes…" : saveState === "error" ? "Not saved. Check your connection." : "All changes saved"}
          </span>
          {showProblems && problems.length > 0 && <ul className="tr-todo">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
        </div>
        <div className="tr-bar">
          {!completed && canManage && <button type="button" className="quiet-button" disabled={busy} onClick={() => void remove()}><Trash2 size={13} /> Delete draft</button>}
          {completed && canManage && <button type="button" className="quiet-button" disabled={busy} onClick={() => void reopen()}><RotateCcw size={13} /> Reopen</button>}
          {completed && canEdit && <button type="button" className="quiet-button" disabled={busy} onClick={() => void retest()}><RotateCcw size={13} /> Retest</button>}
          <button type="button" className="quiet-button" disabled={busy} onClick={() => void print()}><Printer size={13} /> Print report</button>
          {!readOnly && <button type="button" className="gold-button" disabled={busy || saveState === "saving"} onClick={() => void complete()}>Complete test</button>}
        </div>
      </div>
    </div>
  );
}
