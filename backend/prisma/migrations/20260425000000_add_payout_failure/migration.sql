-- CreateTable
CREATE TABLE "PayoutFailure" (
    "id"        TEXT NOT NULL,
    "jobId"     TEXT NOT NULL,
    "groupId"   TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "amount"    DOUBLE PRECISION NOT NULL,
    "currency"  TEXT NOT NULL,
    "reason"    TEXT NOT NULL,
    "failedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayoutFailure_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PayoutFailure_jobId_idx" ON "PayoutFailure"("jobId");

-- CreateIndex
CREATE INDEX "PayoutFailure_groupId_idx" ON "PayoutFailure"("groupId");

-- CreateIndex
CREATE INDEX "PayoutFailure_failedAt_idx" ON "PayoutFailure"("failedAt");
