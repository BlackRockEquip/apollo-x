"use client";

import "./tt.css";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Award, Layers, Loader2, Search } from "lucide-react";
import { coverUrl, errText, fmtDate, STATUS_LABEL, statusTone, tt } from "./api";

type Item = {
  id: string; code: string; title: string; group: string; archived: boolean; finishBy: string | null; completionMode: string; hasCover: boolean; chapters: number; lessons: number; minutes: number;
  done: number; pct: number; status: string | null; dueDate: string | null; required: boolean; updateRequired: boolean; certificate: { certNo: string; status: string } | null;
};
type Data = {
  employee: { id: string; name: string; position: string } | null; items: Item[]; resume: { courseId: string; courseTitle: string; lessonKey: string; lessonTitle: string } | null; cardsDue: number;
  totals: { lessons: number; done: number; certificates: number; pending: number }; canPreview: boolean;
};

// Tech Training home (2026-11-28): the learner's courses (assigned and required first), resume, revision cards, and every published course.
export function LearnerHome() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"mine" | "all">("mine");

  useEffect(() => { tt<Data>("learn").then((d) => { setData(d); if (!d.items.some((i) => i.status || i.required)) setView("all"); }).catch((e) => setError(errText(e, "Unable to load your courses."))); }, []);

  const shown = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.items.filter((i) => (view === "all" || i.status || i.required) && (!q || `${i.title} ${i.code} ${i.group}`.toLowerCase().includes(q)));
  }, [data, query, view]);
  const groups = useMemo(() => [...new Set(shown.map((i) => i.group))], [shown]);

  if (error) return <div className="inline-error">{error}</div>;
  if (!data) return <div className="table-state"><Loader2 className="spin" size={20} /> Loading courses…</div>;
  const pct = data.totals.lessons ? Math.round((100 * data.totals.done) / data.totals.lessons) : 0;
  return (
    <div className="tt">
      <section className="tt-hero">
        <div style={{ flex: "1 1 420px" }}>
          <p className="eyebrow">Tech Training</p>
          <h1>{data.employee ? `Welcome, ${data.employee.name.split(" ")[0]}` : "Training courses"}</h1>
          <p>{data.employee ? `${data.employee.position ? `${data.employee.position} · ` : ""}${data.totals.certificates} certificate${data.totals.certificates === 1 ? "" : "s"}${data.totals.pending ? ` · ${data.totals.pending} awaiting approval` : ""}` : data.canPreview ? "You can preview courses. Your login is not linked to an employee profile, so progress is not recorded." : "Your login is not linked to an employee training profile yet. Ask a Company Admin to link it under Tech Training > Employees."}</p>
          {data.employee && data.totals.lessons > 0 && <div className="tt-bar" style={{ marginTop: 12 }}><div className="tt-meter" style={{ flex: 1 }}><i style={{ width: `${pct}%` }} /></div><span className="tt-mono">{data.totals.done} / {data.totals.lessons} lessons</span></div>}
        </div>
        {data.employee && data.cardsDue > 0 && <Link href="/tech-training/cards" className="gold-button"><Layers size={15} /> {data.cardsDue} revision card{data.cardsDue === 1 ? "" : "s"} due</Link>}
      </section>
      {data.resume && (
        <div className="tt-resume">
          <div><p className="eyebrow" style={{ margin: 0 }}>Pick up where you left off</p><strong>{data.resume.lessonTitle}</strong> <span className="tt-sub">· {data.resume.courseTitle}</span></div>
          <Link className="gold-button" href={`/tech-training/lesson/${data.resume.courseId}/${encodeURIComponent(data.resume.lessonKey)}`}>Resume</Link>
        </div>
      )}
      <div className="tt-bar">
        <div className="tt-seg" role="group" aria-label="Show">
          <button type="button" aria-pressed={view === "mine"} onClick={() => setView("mine")}>My training</button>
          <button type="button" aria-pressed={view === "all"} onClick={() => setView("all")}>All courses</button>
        </div>
        <label className="search-control tt-grow" style={{ maxWidth: 380 }}><Search size={15} /><input aria-label="Search courses" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search courses" /></label>
      </div>
      {shown.length === 0 && <div className="tt-card tt-empty">{view === "mine" ? "Nothing assigned to you yet. Open All courses to start one yourself." : "No courses match."}</div>}
      {groups.map((g) => (
        <section key={g} className="tt">
          <h2 style={{ margin: "6px 0 0", fontSize: 16 }}>{g}</h2>
          <div className="tt-shelf">
            {shown.filter((i) => i.group === g).map((i) => (
              <Link key={i.id} href={`/tech-training/course/${i.id}`} className="tt-course">
                <div className="cover" style={i.hasCover ? { backgroundImage: `url('${coverUrl(i.id)}')` } : undefined}>
                  {i.certificate?.status === "VALID" ? <span className="tt-pill ok"><Award size={12} /> Certified</span> : i.status ? <span className={`tt-pill ${statusTone(i.status)}`}>{STATUS_LABEL[i.status]}</span> : i.required ? <span className="tt-pill wait">Required</span> : null}
                </div>
                <div className="b">
                  <h3>{i.title}</h3>
                  {i.updateRequired && <span className="tt-pill wait">Updated: redo changed lessons</span>}
                  {i.archived && <span className="tt-pill arc">Being retired{i.finishBy ? `: finish by ${fmtDate(i.finishBy)}` : ""}</span>}
                  {(i.status || i.done > 0) && <div className={`tt-meter ${i.pct === 100 ? "done" : ""}`}><i style={{ width: `${i.pct}%` }} /></div>}
                  <div className="meta"><span>{i.lessons} lessons · about {Math.max(1, Math.round(i.minutes / 60))} h</span><span>{i.dueDate && i.status !== "CERTIFIED" ? `Due ${fmtDate(i.dueDate)}` : i.status ? `${i.pct}%` : i.completionMode === "ACKNOWLEDGE" ? "Read & acknowledge" : ""}</span></div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
