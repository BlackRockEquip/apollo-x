import { Check, CircleDashed, Pencil, X } from "lucide-react";
import { resultLabel, type TestResultId } from "@/lib/testing/spec";
import type { TestStatus } from "./types";

// Pass / Fail / Pass with note / Pass with comment, or "In progress" for a draft that has no result yet. Always icon + words, never colour alone.
export function ResultPill({ result, status, onComments }: { result: TestResultId | null; status?: TestStatus; onComments?: boolean }) {
  if (!result) return <span className="tr-pill tr-pill-wait"><CircleDashed size={12} /> {status === "COMPLETED" ? "No result" : "In progress"}</span>;
  const Icon = result === "PASS" ? Check : result === "FAIL" ? X : Pencil;
  const tone = result === "PASS" ? "pass" : result === "FAIL" ? "fail" : "note";
  return <span className={`tr-pill tr-pill-${tone}`}><Icon size={12} /> {resultLabel(result, onComments)}</span>;
}
