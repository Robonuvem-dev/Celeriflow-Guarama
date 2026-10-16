ALTER TABLE "HealthProfessionalAssignment" ADD COLUMN "validFrom" TIMESTAMP(3), ADD COLUMN "validUntil" TIMESTAMP(3);
CREATE TABLE "HealthProfessionalShift" (
 id TEXT PRIMARY KEY, "assignmentId" TEXT NOT NULL REFERENCES "HealthProfessionalAssignment"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 weekday INTEGER NOT NULL, "startTime" TEXT NOT NULL, "endTime" TEXT NOT NULL, "isActive" BOOLEAN NOT NULL DEFAULT true,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "HealthProfessionalShift_assignmentId_weekday_startTime_key" ON "HealthProfessionalShift"("assignmentId",weekday,"startTime");
