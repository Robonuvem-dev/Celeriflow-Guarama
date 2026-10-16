ALTER TABLE "HealthTeam" ADD COLUMN "classification" TEXT;
ALTER TABLE "MedicalRecord" ADD COLUMN "careContextSnapshot" JSONB;
ALTER TABLE "HealthCollectiveActivity" ADD COLUMN "teamSnapshot" JSONB;
ALTER TABLE "HealthHomeVisit" ADD COLUMN "unitId" TEXT REFERENCES "HealthUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TABLE "HealthTeamClassificationEvent" (
 "id" TEXT PRIMARY KEY, "teamId" TEXT NOT NULL REFERENCES "HealthTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "before" TEXT, "after" TEXT NOT NULL, "reason" TEXT NOT NULL, "actorUsuarioId" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "HealthTeamClassificationEvent_teamId_createdAt_idx" ON "HealthTeamClassificationEvent"("teamId", "createdAt");
