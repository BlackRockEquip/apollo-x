-- Tech Training module (2026-11-28): employee register, positions, courses with revisions, lessons, quizzes, enrolments,
-- attempts, certificates, sign-offs, mentor questions, revision cards and corrective actions. Records are never hard-deleted.

CREATE TYPE "TrainingEmployeeStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "TrainingCourseStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "TrainingRevisionStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'PUBLISHED', 'SUPERSEDED');
CREATE TYPE "TrainingChangeLevel" AS ENUM ('MINOR', 'MAJOR');
CREATE TYPE "TrainingCompletionMode" AS ENUM ('QUIZ_CERTIFICATE', 'ACKNOWLEDGE');
CREATE TYPE "TrainingLessonFormat" AS ENUM ('TEXT', 'TEXT_IMAGES', 'PDF', 'VIDEO');
CREATE TYPE "TrainingQuestionScope" AS ENUM ('FINAL', 'CHECK');
CREATE TYPE "TrainingEnrolmentStatus" AS ENUM ('ASSIGNED', 'IN_PROGRESS', 'AWAITING_APPROVAL', 'CERTIFIED', 'ACKNOWLEDGED', 'WITHDRAWN');
CREATE TYPE "TrainingAttemptKind" AS ENUM ('FINAL', 'PRE', 'CHECK');
CREATE TYPE "TrainingCertificateStatus" AS ENUM ('PENDING', 'VALID', 'REJECTED', 'REVOKED');
CREATE TYPE "TrainingActionStatus" AS ENUM ('OPEN', 'CLOSED');

CREATE TABLE "TrainingSettings" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "certificatePrefix" TEXT NOT NULL DEFAULT '',
    "defaultPassMark" INTEGER NOT NULL DEFAULT 80,
    "defaultMaxAttempts" INTEGER NOT NULL DEFAULT 3,
    "escalationDays" INTEGER NOT NULL DEFAULT 5,
    "effectivenessDays" INTEGER NOT NULL DEFAULT 30,
    "retentionYears" INTEGER NOT NULL DEFAULT 10,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TrainingSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TrainingSigner" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "signatureData" BYTEA,
    "signatureMime" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TrainingSigner_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TrainingPosition" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "requiredCourseIds" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TrainingPosition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TrainingEmployee" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeNo" TEXT,
    "firstName" TEXT NOT NULL,
    "surname" TEXT NOT NULL,
    "idNumber" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "positionId" TEXT,
    "managerUserId" TEXT,
    "userId" TEXT,
    "status" "TrainingEmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TrainingEmployee_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TrainingCourse" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "docNumber" TEXT NOT NULL DEFAULT '',
    "status" "TrainingCourseStatus" NOT NULL DEFAULT 'DRAFT',
    "completionMode" "TrainingCompletionMode" NOT NULL DEFAULT 'QUIZ_CERTIFICATE',
    "passMark" INTEGER NOT NULL DEFAULT 80,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "ownerUserId" TEXT,
    "reviewMonths" INTEGER NOT NULL DEFAULT 12,
    "nextReviewAt" TIMESTAMP(3),
    "liveRevisionId" TEXT,
    "coverData" BYTEA,
    "coverMime" TEXT,
    "importKey" TEXT,
    "archivedAt" TIMESTAMP(3),
    "archivedById" TEXT,
    "archiveReason" TEXT,
    "replacementCourseId" TEXT,
    "finishBy" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TrainingCourse_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TrainingRevision" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "major" INTEGER NOT NULL,
    "minor" INTEGER NOT NULL,
    "status" "TrainingRevisionStatus" NOT NULL DEFAULT 'DRAFT',
    "changeLevel" "TrainingChangeLevel",
    "whatChanged" TEXT,
    "createdById" TEXT,
    "submittedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "reviewComment" TEXT,
    "publishedById" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TrainingRevision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TrainingLesson" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "stableKey" TEXT NOT NULL,
    "chapterKey" TEXT NOT NULL,
    "chapterTitle" TEXT NOT NULL,
    "chapterOrder" INTEGER NOT NULL,
    "topicTitle" TEXT NOT NULL DEFAULT '',
    "ordinal" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "format" "TrainingLessonFormat" NOT NULL DEFAULT 'TEXT',
    "objective" TEXT NOT NULL DEFAULT '',
    "pages" TEXT[],
    "pageImages" TEXT[],
    "pdfAssetId" TEXT,
    "videoUrl" TEXT,
    "safetyPoint" TEXT NOT NULL DEFAULT '',
    "practicalTask" TEXT NOT NULL DEFAULT '',
    "estMinutes" INTEGER NOT NULL DEFAULT 5,
    CONSTRAINT "TrainingLesson_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TrainingAsset" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "sha256" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TrainingAsset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TrainingQuestion" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "stableKey" TEXT NOT NULL,
    "scope" "TrainingQuestionScope" NOT NULL DEFAULT 'FINAL',
    "chapterKey" TEXT NOT NULL DEFAULT '',
    "lessonKey" TEXT NOT NULL DEFAULT '',
    "prompt" TEXT NOT NULL,
    "options" TEXT[],
    "answer" INTEGER[],
    "explanation" TEXT NOT NULL DEFAULT '',
    "ordinal" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "TrainingQuestion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TrainingEnrolment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "revisionId" TEXT,
    "assignedById" TEXT,
    "dueDate" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "activeSeconds" INTEGER NOT NULL DEFAULT 0,
    "lastSeenAt" TIMESTAMP(3),
    "attemptsUsed" INTEGER NOT NULL DEFAULT 0,
    "attemptsReset" INTEGER NOT NULL DEFAULT 0,
    "status" "TrainingEnrolmentStatus" NOT NULL DEFAULT 'ASSIGNED',
    "preScore" INTEGER,
    "lastLessonKey" TEXT,
    "lastPage" INTEGER NOT NULL DEFAULT 0,
    "acknowledgedAt" TIMESTAMP(3),
    "updateRequired" BOOLEAN NOT NULL DEFAULT false,
    "withdrawnAt" TIMESTAMP(3),
    "withdrawnReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TrainingEnrolment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TrainingProgress" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "enrolmentId" TEXT NOT NULL,
    "lessonKey" TEXT NOT NULL,
    "revisionId" TEXT,
    "pagesSeen" INTEGER NOT NULL DEFAULT 0,
    "safetyConfirmedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TrainingProgress_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TrainingQuizAttempt" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "enrolmentId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "kind" "TrainingAttemptKind" NOT NULL DEFAULT 'FINAL',
    "chapterKey" TEXT NOT NULL DEFAULT '',
    "attemptNo" INTEGER NOT NULL,
    "questionIds" TEXT[],
    "answers" JSONB,
    "score" INTEGER,
    "passed" BOOLEAN,
    "weakLessons" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "durationSeconds" INTEGER,
    CONSTRAINT "TrainingQuizAttempt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TrainingSignoff" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "enrolmentId" TEXT NOT NULL,
    "lessonKey" TEXT NOT NULL,
    "jobRef" TEXT NOT NULL DEFAULT '',
    "comment" TEXT NOT NULL DEFAULT '',
    "signedById" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TrainingSignoff_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TrainingCertificate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "certNo" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "enrolmentId" TEXT NOT NULL,
    "attemptId" TEXT,
    "status" "TrainingCertificateStatus" NOT NULL DEFAULT 'PENDING',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checklist" JSONB,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionComment" TEXT,
    "signatoryName" TEXT,
    "signatoryTitle" TEXT,
    "signatureData" BYTEA,
    "signatureMime" TEXT,
    "escalatedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "reviewDueAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewCompetent" BOOLEAN,
    "reviewComment" TEXT,
    CONSTRAINT "TrainingCertificate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TrainingMentorQuestion" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "lessonKey" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT,
    "answeredById" TEXT,
    "answeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TrainingMentorQuestion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TrainingCardReview" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "questionKey" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "box" INTEGER NOT NULL DEFAULT 1,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TrainingCardReview_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TrainingCorrectiveAction" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "courseId" TEXT,
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL DEFAULT '',
    "status" "TrainingActionStatus" NOT NULL DEFAULT 'OPEN',
    "dueDate" TIMESTAMP(3),
    "raisedById" TEXT,
    "closedById" TEXT,
    "closedAt" TIMESTAMP(3),
    "closeNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TrainingCorrectiveAction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TrainingSettings_companyId_key" ON "TrainingSettings"("companyId");
CREATE UNIQUE INDEX "TrainingSigner_companyId_userId_key" ON "TrainingSigner"("companyId", "userId");
CREATE UNIQUE INDEX "TrainingPosition_companyId_name_key" ON "TrainingPosition"("companyId", "name");
CREATE UNIQUE INDEX "TrainingEmployee_companyId_idNumber_key" ON "TrainingEmployee"("companyId", "idNumber");
CREATE INDEX "TrainingEmployee_companyId_status_idx" ON "TrainingEmployee"("companyId", "status");
CREATE INDEX "TrainingEmployee_companyId_userId_idx" ON "TrainingEmployee"("companyId", "userId");
CREATE UNIQUE INDEX "TrainingCourse_companyId_code_key" ON "TrainingCourse"("companyId", "code");
CREATE INDEX "TrainingCourse_companyId_status_idx" ON "TrainingCourse"("companyId", "status");
CREATE INDEX "TrainingRevision_courseId_status_idx" ON "TrainingRevision"("courseId", "status");
CREATE UNIQUE INDEX "TrainingLesson_revisionId_stableKey_key" ON "TrainingLesson"("revisionId", "stableKey");
CREATE INDEX "TrainingLesson_revisionId_chapterOrder_ordinal_idx" ON "TrainingLesson"("revisionId", "chapterOrder", "ordinal");
CREATE INDEX "TrainingAsset_courseId_sha256_idx" ON "TrainingAsset"("courseId", "sha256");
CREATE INDEX "TrainingQuestion_revisionId_scope_idx" ON "TrainingQuestion"("revisionId", "scope");
CREATE UNIQUE INDEX "TrainingEnrolment_employeeId_courseId_key" ON "TrainingEnrolment"("employeeId", "courseId");
CREATE INDEX "TrainingEnrolment_companyId_status_idx" ON "TrainingEnrolment"("companyId", "status");
CREATE UNIQUE INDEX "TrainingProgress_enrolmentId_lessonKey_key" ON "TrainingProgress"("enrolmentId", "lessonKey");
CREATE INDEX "TrainingQuizAttempt_enrolmentId_kind_idx" ON "TrainingQuizAttempt"("enrolmentId", "kind");
CREATE UNIQUE INDEX "TrainingSignoff_enrolmentId_lessonKey_key" ON "TrainingSignoff"("enrolmentId", "lessonKey");
CREATE UNIQUE INDEX "TrainingCertificate_certNo_key" ON "TrainingCertificate"("certNo");
CREATE INDEX "TrainingCertificate_companyId_status_idx" ON "TrainingCertificate"("companyId", "status");
CREATE INDEX "TrainingCertificate_employeeId_idx" ON "TrainingCertificate"("employeeId");
CREATE INDEX "TrainingMentorQuestion_courseId_lessonKey_idx" ON "TrainingMentorQuestion"("courseId", "lessonKey");
CREATE UNIQUE INDEX "TrainingCardReview_employeeId_questionKey_key" ON "TrainingCardReview"("employeeId", "questionKey");
CREATE INDEX "TrainingCardReview_employeeId_dueAt_idx" ON "TrainingCardReview"("employeeId", "dueAt");
CREATE UNIQUE INDEX "TrainingCorrectiveAction_companyId_ref_key" ON "TrainingCorrectiveAction"("companyId", "ref");

ALTER TABLE "TrainingSettings" ADD CONSTRAINT "TrainingSettings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrainingPosition" ADD CONSTRAINT "TrainingPosition_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrainingEmployee" ADD CONSTRAINT "TrainingEmployee_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrainingEmployee" ADD CONSTRAINT "TrainingEmployee_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "TrainingPosition"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TrainingCourse" ADD CONSTRAINT "TrainingCourse_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrainingRevision" ADD CONSTRAINT "TrainingRevision_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "TrainingCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrainingLesson" ADD CONSTRAINT "TrainingLesson_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "TrainingRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrainingAsset" ADD CONSTRAINT "TrainingAsset_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "TrainingCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrainingQuestion" ADD CONSTRAINT "TrainingQuestion_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "TrainingRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrainingEnrolment" ADD CONSTRAINT "TrainingEnrolment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "TrainingEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrainingEnrolment" ADD CONSTRAINT "TrainingEnrolment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "TrainingCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrainingProgress" ADD CONSTRAINT "TrainingProgress_enrolmentId_fkey" FOREIGN KEY ("enrolmentId") REFERENCES "TrainingEnrolment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrainingQuizAttempt" ADD CONSTRAINT "TrainingQuizAttempt_enrolmentId_fkey" FOREIGN KEY ("enrolmentId") REFERENCES "TrainingEnrolment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrainingSignoff" ADD CONSTRAINT "TrainingSignoff_enrolmentId_fkey" FOREIGN KEY ("enrolmentId") REFERENCES "TrainingEnrolment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrainingCertificate" ADD CONSTRAINT "TrainingCertificate_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "TrainingEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrainingCertificate" ADD CONSTRAINT "TrainingCertificate_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "TrainingCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrainingMentorQuestion" ADD CONSTRAINT "TrainingMentorQuestion_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "TrainingCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrainingCorrectiveAction" ADD CONSTRAINT "TrainingCorrectiveAction_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
