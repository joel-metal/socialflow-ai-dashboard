-- CreateTable
CREATE TABLE "AuditLog" (
    "id"         TEXT NOT NULL,
    "userId"     TEXT NOT NULL,
    "action"     TEXT NOT NULL,
    "resource"   TEXT,
    "resourceId" TEXT,
    "metadata"   JSONB,
    "ipAddress"  TEXT,
    "userAgent"  TEXT,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_resource_resourceId_idx" ON "AuditLog"("resource", "resourceId");
