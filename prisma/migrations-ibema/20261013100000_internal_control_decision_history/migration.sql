CREATE TABLE "InternalControlEvent" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "findingId" TEXT,
    "eventType" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InternalControlEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InternalControlEvent_planId_fkey" FOREIGN KEY ("planId") REFERENCES "InternalControlPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "InternalControlEvent_planId_createdAt_idx" ON "InternalControlEvent"("planId", "createdAt");
CREATE INDEX "InternalControlEvent_findingId_createdAt_idx" ON "InternalControlEvent"("findingId", "createdAt");
