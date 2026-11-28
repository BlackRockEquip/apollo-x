import { NextRequest, NextResponse } from "next/server";
import type { RequestContext } from "@/lib/auth/context-types";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError, TrainingError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import * as approvals from "@/lib/training/approvals";
import * as courses from "@/lib/training/courses";
import * as employees from "@/lib/training/employees";
import * as imports from "@/lib/training/imports";
import * as learner from "@/lib/training/learner";
import * as reports from "@/lib/training/reports";
import * as settings from "@/lib/training/settings";

// ---------------------------------------------------------------------------
// Tech Training API (2026-11-28): /api/v1/tech-training/<path>. One dispatcher instead of ~50 route files; every handler is a
// service function that checks the module and the training permission itself (src/lib/training/*). Writes need the same origin.
// ---------------------------------------------------------------------------

type Params = Record<string, string>;
type Handler = (ctx: RequestContext, p: Params, body: unknown, req: NextRequest) => Promise<unknown>;
type Route = [method: "GET" | "POST" | "PUT" | "DELETE", pattern: string, handler: Handler];

const q = (req: NextRequest, key: string) => req.nextUrl.searchParams.get(key) ?? undefined;

const ROUTES: Route[] = [
  // Employee register and positions
  ["GET", "employees", (ctx, _p, _b, req) => employees.listEmployees(ctx, { q: q(req, "q"), status: q(req, "status"), positionId: q(req, "positionId") })],
  ["GET", "employees/editor", (ctx) => employees.employeeEditorData(ctx)],
  ["POST", "employees", (ctx, _p, b) => employees.createEmployee(ctx, b)],
  ["GET", "employees/:id", (ctx, p) => employees.getEmployee(ctx, p.id)],
  ["PUT", "employees/:id", (ctx, p, b) => employees.updateEmployee(ctx, p.id, b)],
  ["POST", "employees/:id/status", (ctx, p, b) => employees.setEmployeeStatus(ctx, p.id, b)],
  ["GET", "employees/:id/record", (ctx, p) => reports.employeeRecord(ctx, p.id)],
  ["POST", "assign", (ctx, _p, b) => employees.assignCourses(ctx, b)],
  ["POST", "enrolments/:id/withdraw", (ctx, p, b) => employees.withdrawEnrolment(ctx, p.id, b)],
  ["POST", "enrolments/:id/reset-attempts", (ctx, p, b) => approvals.resetAttempts(ctx, p.id, b)],
  ["GET", "positions", (ctx) => employees.listPositions(ctx)],
  ["POST", "positions", (ctx, _p, b) => employees.savePosition(ctx, null, b)],
  ["PUT", "positions/:id", (ctx, p, b) => employees.savePosition(ctx, p.id, b)],
  ["DELETE", "positions/:id", (ctx, p) => employees.deletePosition(ctx, p.id)],
  // Course manager
  ["GET", "manage/courses", (ctx) => courses.listCourses(ctx)],
  ["POST", "manage/courses", (ctx, _p, b) => courses.createCourse(ctx, b)],
  ["GET", "manage/courses/:id", (ctx, p) => courses.courseEditor(ctx, p.id)],
  ["DELETE", "manage/courses/:id", (ctx, p) => courses.deleteCourse(ctx, p.id)],
  ["PUT", "manage/courses/:id/settings", (ctx, p, b) => courses.updateCourseSettings(ctx, p.id, b)],
  ["PUT", "manage/courses/:id/cover", (ctx, p, b) => courses.setCover(ctx, p.id, b)],
  ["POST", "manage/courses/:id/draft", (ctx, p) => courses.startDraft(ctx, p.id)],
  ["PUT", "manage/courses/:id/draft", (ctx, p, b) => courses.saveDraft(ctx, p.id, b)],
  ["DELETE", "manage/courses/:id/draft", (ctx, p) => courses.discardDraft(ctx, p.id)],
  ["POST", "manage/courses/:id/submit", (ctx, p, b) => courses.submitDraft(ctx, p.id, b)],
  ["POST", "manage/courses/:id/return", (ctx, p, b) => courses.returnDraft(ctx, p.id, b)],
  ["POST", "manage/courses/:id/publish", (ctx, p, b) => courses.publishDraft(ctx, p.id, b)],
  ["POST", "manage/courses/:id/rollback", (ctx, p, b) => courses.rollback(ctx, p.id, b)],
  ["GET", "manage/courses/:id/archive", (ctx, p) => courses.archiveImpact(ctx, p.id)],
  ["POST", "manage/courses/:id/archive", (ctx, p, b) => courses.archiveCourse(ctx, p.id, b)],
  ["POST", "manage/courses/:id/restore", (ctx, p) => courses.restoreCourse(ctx, p.id)],
  ["POST", "manage/courses/:id/assets", (ctx, p, b) => courses.uploadAsset(ctx, p.id, b)],
  ["POST", "manage/courses/:id/images", (ctx, p, b) => courses.attachImagePack(ctx, p.id, b)],
  ["POST", "manage/import/document", (ctx, _p, b) => imports.previewDocument(ctx, b)],
  ["POST", "manage/import/prototype", (ctx, _p, b) => courses.importPrototype(ctx, b)],
  ["GET", "manage/import/cat", (ctx) => imports.catBundleStatus(ctx)],
  ["POST", "manage/import/cat", (ctx, _p, b) => imports.importCatBundle(ctx, b)],
  ["POST", "manage/import/cat/complete", (ctx) => imports.completeCatBundle(ctx)],
  ["POST", "manage/courses/:id/quiz", (ctx, p, b) => courses.attachQuizPack(ctx, p.id, b)],
  // Learner
  ["GET", "learn", (ctx) => learner.catalogue(ctx)],
  ["GET", "learn/courses/:id", (ctx, p) => learner.courseView(ctx, p.id)],
  ["POST", "learn/courses/:id/start", (ctx, p) => learner.startCourse(ctx, p.id)],
  ["POST", "learn/courses/:id/acknowledge", (ctx, p, b) => learner.acknowledgeCourse(ctx, p.id, b)],
  ["POST", "learn/courses/:id/quiz", (ctx, p, b) => learner.startQuiz(ctx, p.id, b)],
  ["GET", "learn/courses/:id/lessons/:key", (ctx, p) => learner.lessonView(ctx, p.id, p.key)],
  ["POST", "learn/courses/:id/lessons/:key/page", (ctx, p, b) => learner.recordPage(ctx, p.id, p.key, b)],
  ["POST", "learn/courses/:id/lessons/:key/complete", (ctx, p, b) => learner.completeLesson(ctx, p.id, p.key, b)],
  ["POST", "learn/courses/:id/lessons/:key/ask", (ctx, p, b) => learner.askMentor(ctx, p.id, p.key, b)],
  ["POST", "learn/attempts/:id", (ctx, p, b) => learner.submitQuiz(ctx, p.id, b)],
  ["GET", "learn/cards", (ctx) => learner.cardsDue(ctx)],
  ["POST", "learn/cards", (ctx, _p, b) => learner.answerCard(ctx, b)],
  // Approvals, sign-offs, mentor, effectiveness, certificates
  ["GET", "approvals", (ctx) => approvals.approvalQueue(ctx)],
  ["GET", "approvals/:id", (ctx, p) => approvals.certificateReview(ctx, p.id)],
  ["POST", "approvals/:id/decide", (ctx, p, b) => approvals.decideCertificate(ctx, p.id, b)],
  ["POST", "certificates/:id/revoke", (ctx, p, b) => approvals.revokeCertificate(ctx, p.id, b)],
  ["POST", "certificates/:id/review", (ctx, p, b) => approvals.recordEffectiveness(ctx, p.id, b)],
  ["GET", "certificates/by-number/:no", (ctx, p) => approvals.certificateView(ctx, p.no)],
  ["GET", "verify/:no", (_ctx, p) => approvals.verifyCertificate(p.no)],
  ["POST", "signoffs", (ctx, _p, b) => approvals.signOffPractical(ctx, b)],
  ["POST", "mentor/:id/answer", (ctx, p, b) => approvals.answerMentor(ctx, p.id, b)],
  // Records, compliance, settings
  ["GET", "records", (ctx, _p, _b, req) => reports.recordsList(ctx, q(req, "q"))],
  ["GET", "compliance", (ctx) => reports.compliance(ctx)],
  ["POST", "actions", (ctx, _p, b) => reports.saveAction(ctx, null, b)],
  ["PUT", "actions/:id", (ctx, p, b) => reports.saveAction(ctx, p.id, b)],
  ["GET", "settings", (ctx) => settings.getSettings(ctx)],
  ["PUT", "settings", (ctx, _p, b) => settings.saveSettings(ctx, b)],
  ["PUT", "settings/signer", (ctx, _p, b) => settings.saveSigner(ctx, b)],
];

function match(method: string, segments: string[]): { handler: Handler; params: Params } | null {
  for (const [m, pattern, handler] of ROUTES) {
    if (m !== method) continue;
    const parts = pattern.split("/");
    if (parts.length !== segments.length) continue;
    const params: Params = {};
    let ok = true;
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].startsWith(":")) params[parts[i].slice(1)] = segments[i];
      else if (parts[i] !== segments[i]) { ok = false; break; }
    }
    if (ok) return { handler, params };
  }
  return null;
}

async function handle(request: NextRequest, method: "GET" | "POST" | "PUT" | "DELETE", segments: string[]) {
  try {
    if (method !== "GET") requireSameOrigin(request);
    const decoded = segments.map((s) => decodeURIComponent(s));
    // Binary answers: lesson images and PDFs, course covers, CSV exports.
    if (method === "GET" && decoded.length === 2 && (decoded[0] === "assets" || decoded[0] === "covers")) {
      const ctx = await requireRequestContext();
      const file = decoded[0] === "assets" ? await courses.readAsset(ctx, decoded[1]) : await courses.readCover(ctx, decoded[1]);
      return new NextResponse(new Uint8Array(file.data), { headers: { "content-type": file.mime, "cache-control": "private, max-age=86400", "x-content-type-options": "nosniff", "content-disposition": "inline" } });
    }
    if (method === "GET" && decoded.length === 2 && decoded[0] === "exports") {
      const ctx = await requireRequestContext();
      const file = await reports.exportCsv(ctx, decoded[1], { year: request.nextUrl.searchParams.get("year") ?? undefined });
      return new NextResponse(`﻿${file.csv}`, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${file.fileName}"`, "cache-control": "no-store" } });
    }
    const found = match(method, decoded);
    if (!found) throw new TrainingError("NOT_FOUND", "That training page or action does not exist.", 404);
    const ctx = await requireRequestContext();
    const body = method === "GET" || method === "DELETE" ? undefined : await request.json().catch(() => ({}));
    const result = await found.handler(ctx, found.params, body, request);
    return NextResponse.json(result ?? { ok: true }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}

type Ctx = { params: Promise<{ path: string[] }> };
export async function GET(request: NextRequest, { params }: Ctx) { return handle(request, "GET", (await params).path); }
export async function POST(request: NextRequest, { params }: Ctx) { return handle(request, "POST", (await params).path); }
export async function PUT(request: NextRequest, { params }: Ctx) { return handle(request, "PUT", (await params).path); }
export async function DELETE(request: NextRequest, { params }: Ctx) { return handle(request, "DELETE", (await params).path); }
