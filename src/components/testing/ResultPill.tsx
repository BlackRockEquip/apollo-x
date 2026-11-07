import { Check, CircleDashed, Pencil, X } from "lucide-react";
import { TEST_RESULT_LABELS, type TestResultId } from "@/lib/testing/spec";
import type { TestStatus } from "./types";

// Pass / Fail / Pass with note, or "In progress" for a draft that has no result yet. Always icon + words, never colour alone.
export function ResultPill({ result, status }: { result: TestResultId | null; status?: TestStatus }) {
  if (!result) return <span className="tr-pill tr-pill-wait"><CircleDashed size={12} /> {status === "COMPLETED" ? "No result" : "In progress"}</span>;
  const Icon = result === "PASS" ? Check : result === "FAIL" ? X : Pencil;
  const tone = result === "PASS" ? "pass" : result === "FAIL" ? "fail" : "note";
  return <span className={`tr-pill tr-pill-${tone}`}><Icon size={12} /> {TEST_RESULT_LABELS[result]}</span>;
}
