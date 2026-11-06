"use client";

import "./jobs-board.css";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BreakdownPill, PexAllocatedPill, ReturnUnrepairedPill, StatusPill } from "@/components/StatusPill";
import { JOBS_BOARD_PREFS_COOKIE, boardSummary, buildBoardLanes, filterBoardCards, serializeBoardPrefs, type BoardCard, type BoardLaneMode, type BoardPrefs } from "@/lib/jobs/wip-board";

// ---------------------------------------------------------------------------
// Jobs & WIP — Board view (2026-11-06, user request, mockup "Jobs & WIP view options").
//
// The same jobs as the table, as cards in lanes (see lib/jobs/wip-board.ts for the lanes and the order inside
// them). It is drawn from the same page data as the table and follows the table's own search and column filters:
// the table is still in the page (just hidden while the board shows), TableColumnFilters hides the rows that do not
// match the search box / header filters, and this board shows only the jobs whose table row is still visible. So the
// search box, a dashboard link such as ?status=..., and the auto refresh all behave the same in both views.
//
// The lane style and "show completed" are kept for this browser in a cookie (page.tsx reads it, so the board is drawn
// the same on first paint); late only / mechanic / job type reset on reload. Dragging a card to another lane is not
// built yet (agreed as a later step).
// ---------------------------------------------------------------------------

const LANE_PAGE = 8;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

function shortName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : name;
}

export function JobsWipBoard({ tableId, cards, build, canOpen, personLabel, initialPrefs }: { tableId: string; cards: BoardCard[]; build?: string | null; canOpen: boolean; personLabel: string; initialPrefs: BoardPrefs }) {
  const [mode, setMode] = useState<BoardLaneMode>(initialPrefs.mode);
  const [showCompleted, setShowCompleted] = useState(initialPrefs.showCompleted);
  const [lateOnly, setLateOnly] = useState(false);
  const [person, setPerson] = useState("");
  const [type, setType] = useState("");
  const [extra, setExtra] = useState<Record<string, number>>({});
  // Ids of the jobs whose table row is not hidden by the search / header filters; null until the table has been read.
  const [visible, setVisible] = useState<Set<string> | null>(null);

  function savePrefs(next: BoardPrefs) {
    try { document.cookie = `${JOBS_BOARD_PREFS_COOKIE}=${serializeBoardPrefs(next)}; path=/; max-age=31536000; samesite=lax`; } catch { /* best-effort */ }
  }

  // Follow the table's rows: which are visible right now.
  useEffect(() => {
    const table = document.getElementById(tableId);
    if (!table) return;
    let raf = 0;
    function read() {
      raf = 0;
      const ids = new Set<string>();
      table!.querySelectorAll<HTMLElement>("tbody tr[data-row-id]").forEach((tr) => {
        if (tr.style.display !== "none" && tr.dataset.rowId) ids.add(tr.dataset.rowId);
      });
      setVisible((prev) => {
        if (prev && prev.size === ids.size) {
          let same = true;
          for (const id of ids) if (!prev.has(id)) { same = false; break; }
          if (same) return prev;
        }
        return ids;
      });
    }
    function schedule() {
      if (!raf) raf = requestAnimationFrame(read);
    }
    read();
    const observer = new MutationObserver(schedule);
    observer.observe(table, { subtree: true, childList: true, attributes: true, attributeFilter: ["style"] });
    return () => {
      if (raf) cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [tableId]);

  const shownCards = useMemo(() => (visible ? cards.filter((card) => visible.has(card.id)) : cards), [cards, visible]);
  const people = useMemo(() => Array.from(new Set(cards.flatMap((c) => c.people))).sort((a, b) => a.localeCompare(b)), [cards]);
  const types = useMemo(() => {
    const seen = new Map<string, string>();
    for (const c of cards) if (!seen.has(c.type)) seen.set(c.type, c.typeLabel);
    return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [cards]);

  const summary = useMemo(() => boardSummary(shownCards.filter((c) => (!person || c.people.includes(person)) && (!type || c.type === type))), [shownCards, person, type]);
  const lanes = useMemo(() => buildBoardLanes(filterBoardCards(shownCards, { lateOnly, person, type, showCompleted }), mode, build), [shownCards, lateOnly, person, type, showCompleted, mode, build]);

  function chooseMode(next: BoardLaneMode) {
    setMode(next);
    savePrefs({ mode: next, showCompleted });
  }
  function toggleCompleted() {
    const next = !showCompleted;
    setShowCompleted(next);
    savePrefs({ mode, showCompleted: next });
  }

  return (
    <div className="jb">
      <div className="jb-bar">
        <div className="jb-bar-group" role="group" aria-label="Lanes">
          Lanes
          <span className="jb-seg">
            <button type="button" aria-pressed={mode === "stage"} onClick={() => chooseMode("stage")}>By stage</button>
            <button type="button" aria-pressed={mode === "status"} onClick={() => chooseMode("status")}>Every status</button>
          </span>
        </div>
        <button type="button" className="jb-chip" aria-pressed={lateOnly} onClick={() => setLateOnly((v) => !v)}>Late only ({summary.late})</button>
        {people.length > 0 && (
          <label className="jb-bar-group">{personLabel}
            <select value={person} onChange={(e) => setPerson(e.target.value)} aria-label={`Filter by ${personLabel.toLowerCase()}`}>
              <option value="">All</option>
              {people.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
        )}
        {types.length > 1 && (
          <label className="jb-bar-group">Job type
            <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Filter by job type">
              <option value="">All</option>
              {types.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        )}
        <button type="button" className="jb-chip check" aria-pressed={showCompleted} onClick={toggleCompleted}>{showCompleted ? "Completed shown" : "Show completed"}</button>
        <span className="jb-count">{summary.active} active job{summary.active === 1 ? "" : "s"} · <strong>{summary.late} late</strong>{showCompleted ? "" : " · completed hidden"}</span>
      </div>

      <div className="jb-board">
        {lanes.map((lane) => {
          const limit = LANE_PAGE + (extra[lane.key] ?? 0);
          const shown = lane.cards.slice(0, limit);
          const left = lane.cards.length - shown.length;
          return (
            <section key={lane.key} className="jb-lane" aria-label={`${lane.name}, ${lane.cards.length} job${lane.cards.length === 1 ? "" : "s"}`}>
              <div className="jb-lane-head">
                <div className="jb-lane-title"><h2>{lane.name}</h2><span className="jb-lane-count">{lane.cards.length}</span></div>
                {lane.subtitle && <p className="jb-lane-sub">{lane.subtitle}</p>}
              </div>
              {shown.length === 0 && <div className="jb-empty">No jobs here</div>}
              {shown.map((card) => <BoardCardView key={card.id} card={card} build={build} canOpen={canOpen} />)}
              {left > 0 && <button type="button" className="jb-more" onClick={() => setExtra((cur) => ({ ...cur, [lane.key]: (cur[lane.key] ?? 0) + LANE_PAGE * 2 }))}>Show {Math.min(left, LANE_PAGE * 2)} more{left > LANE_PAGE * 2 ? ` (${left} left)` : ""}</button>}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function BoardCardView({ card, build, canOpen }: { card: BoardCard; build?: string | null; canOpen: boolean }) {
  const first = card.people[0];
  const body = (
    <>
      <div className="jb-row1">
        <strong className="mono">{card.num}</strong>
        <span className="jb-meta">{card.itemCount > 0 && <span className="jb-items">{card.itemCount} items</span>}<span>{card.typeLabel}</span></span>
      </div>
      {card.customer && <div className="jb-customer">{card.customer}</div>}
      <div className="jb-what">{card.what}</div>
      <div className="jb-pills">
        <StatusPill status={card.status} returnedUnrepaired={card.returnedUnrepaired} build={build} />
        {card.mixed && <span className="jb-items">Items at different steps</span>}
        {card.returnedUnrepaired && card.status !== "COMPLETE" && <ReturnUnrepairedPill />}
        {card.breakdown && <BreakdownPill />}
        {card.pex && <PexAllocatedPill />}
      </div>
      <div className="jb-foot">
        <span className="jb-person" title={card.people.join(", ")}>
          {first ? <><span className="jb-avatar" aria-hidden="true">{initials(first)}</span><span className="name">{shortName(first)}{card.people.length > 1 ? ` +${card.people.length - 1}` : ""}</span></> : <span className="name">No one assigned</span>}
        </span>
        {card.lateDays !== null
          ? <span className="jb-late">ETA {card.etaLabel} · {card.lateDays}d late</span>
          : <span className="jb-eta">{card.etaLabel ? `ETA ${card.etaLabel}` : "No ETA"}</span>}
      </div>
    </>
  );
  return canOpen
    ? <Link href={card.href} className="jb-card">{body}</Link>
    : <div className="jb-card">{body}</div>;
}
