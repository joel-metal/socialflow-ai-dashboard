CREATE TABLE "AIGenerationResult" (
    "id"             TEXT NOT NULL,
    "jobId"          TEXT NOT NULL,
    "userId"         TEXT NOT NULL,
    "organizationId" TEXT,
    "jobType"        TEXT NOT NULL,
    "output"         JSONB NOT NULL,
    "traceId"        TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIGenerationResult_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AIGenerationResult_jobId_key" ON "AIGenerationResult"("jobId");
CREATE INDEX "AIGenerationResult_userId_idx"    ON "AIGenerationResult"("userId");
CREATE INDEX "AIGenerationResult_jobType_idx"   ON "AIGenerationResult"("jobType");
CREATE INDEX "AIGenerationResult_createdAt_idx" ON "AIGenerationResult"("createdAt");
