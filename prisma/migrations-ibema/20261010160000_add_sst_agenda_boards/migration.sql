ALTER TABLE "SstMedicalCertificate" ADD COLUMN "reasonSnapshot" JSONB;
UPDATE "SstMedicalCertificate" c SET "reasonSnapshot" = jsonb_build_object(
  'name', r.name, 'createLeaveOnApproval', r."createLeaveOnApproval", 'leaveType', r."leaveType",
  'suggestLeave', r."suggestLeave", 'printReceipt', r."printReceipt")
FROM "SstCertificateReason" r WHERE c."reasonId" = r.id;
CREATE TABLE "SstMedicalBoard" (
  id TEXT PRIMARY KEY, "budgetUnitId" TEXT NOT NULL REFERENCES "BudgetUnit"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  name TEXT NOT NULL, "startsAt" TIMESTAMP(3) NOT NULL, "endsAt" TIMESTAMP(3) NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true, "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CHECK ("endsAt" >= "startsAt")
);
CREATE TABLE "SstMedicalBoardMember" (
  id TEXT PRIMARY KEY, "boardId" TEXT NOT NULL REFERENCES "SstMedicalBoard"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "personId" TEXT NOT NULL REFERENCES "Person"(id) ON DELETE RESTRICT ON UPDATE CASCADE, council TEXT NOT NULL
);
CREATE UNIQUE INDEX "SstMedicalBoardMember_boardId_personId_key" ON "SstMedicalBoardMember"("boardId", "personId");
CREATE INDEX "SstMedicalBoard_budgetUnitId_startsAt_endsAt_idx" ON "SstMedicalBoard"("budgetUnitId", "startsAt", "endsAt");
ALTER TABLE "SstMedicalAssessment" ADD COLUMN "boardId" TEXT REFERENCES "SstMedicalBoard"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TABLE "SstScheduleAvailability" (
  id TEXT PRIMARY KEY, "budgetUnitId" TEXT NOT NULL REFERENCES "BudgetUnit"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "professionalPersonId" TEXT NOT NULL REFERENCES "Person"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "unitName" TEXT NOT NULL, "startsAt" TIMESTAMP(3) NOT NULL, "endsAt" TIMESTAMP(3) NOT NULL,
  "slotMinutes" INTEGER NOT NULL CHECK ("slotMinutes" BETWEEN 5 AND 240), "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CHECK ("endsAt" > "startsAt")
);
CREATE INDEX "SstScheduleAvailability_budgetUnitId_startsAt_idx" ON "SstScheduleAvailability"("budgetUnitId", "startsAt");
CREATE TABLE "SstScheduleBlock" (
  id TEXT PRIMARY KEY, "availabilityId" TEXT NOT NULL REFERENCES "SstScheduleAvailability"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "startsAt" TIMESTAMP(3) NOT NULL, "endsAt" TIMESTAMP(3) NOT NULL, reason TEXT NOT NULL, "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CHECK ("endsAt" > "startsAt")
);
CREATE INDEX "SstScheduleBlock_availabilityId_startsAt_idx" ON "SstScheduleBlock"("availabilityId", "startsAt");
CREATE TABLE "SstAppointment" (
  id TEXT PRIMARY KEY, "availabilityId" TEXT NOT NULL REFERENCES "SstScheduleAvailability"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "employeeId" TEXT NOT NULL REFERENCES "Employee"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  purpose TEXT NOT NULL, "startsAt" TIMESTAMP(3) NOT NULL, "endsAt" TIMESTAMP(3) NOT NULL,
  status TEXT NOT NULL DEFAULT 'BOOKED' CHECK (status IN ('BOOKED','CANCELLED','ATTENDED','ABSENT')),
  "cancellationReason" TEXT, "cancelledAt" TIMESTAMP(3), "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CHECK ("endsAt" > "startsAt")
);
CREATE INDEX "SstAppointment_availabilityId_startsAt_status_idx" ON "SstAppointment"("availabilityId", "startsAt", status);
CREATE INDEX "SstAppointment_employeeId_startsAt_idx" ON "SstAppointment"("employeeId", "startsAt");
CREATE TABLE "SstPlannedShift" (
  id TEXT PRIMARY KEY, "budgetUnitId" TEXT NOT NULL REFERENCES "BudgetUnit"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "employeeId" TEXT NOT NULL REFERENCES "Employee"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "startsAt" TIMESTAMP(3) NOT NULL, "endsAt" TIMESTAMP(3) NOT NULL, source TEXT NOT NULL DEFAULT 'RH_MANUAL',
  "roleIdSnapshot" TEXT, "departmentIdSnapshot" TEXT,
  "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ("endsAt" > "startsAt")
);
CREATE UNIQUE INDEX "SstPlannedShift_budgetUnitId_employeeId_startsAt_endsAt_key" ON "SstPlannedShift"("budgetUnitId", "employeeId", "startsAt", "endsAt");
CREATE INDEX "SstPlannedShift_budgetUnitId_employeeId_startsAt_idx" ON "SstPlannedShift"("budgetUnitId", "employeeId", "startsAt");
