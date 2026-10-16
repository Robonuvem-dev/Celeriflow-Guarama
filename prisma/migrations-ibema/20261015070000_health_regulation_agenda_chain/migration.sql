ALTER TABLE "HealthRegulationRequest" ADD COLUMN "appointmentId" TEXT UNIQUE REFERENCES "HealthAppointment"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HealthWaitlist" ADD COLUMN "unitId" TEXT, ADD COLUMN "procedureId" TEXT, ADD COLUMN "programName" TEXT,
 ADD COLUMN "regulationRequestId" TEXT UNIQUE REFERENCES "HealthRegulationRequest"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 ADD COLUMN "appointmentId" TEXT UNIQUE REFERENCES "HealthAppointment"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HealthCareSchedule" ADD COLUMN "agreementId" TEXT REFERENCES "HealthCareAgreement"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 ADD COLUMN "procedureId" TEXT, ADD COLUMN "locationUnitId" TEXT, ADD COLUMN "validFrom" TIMESTAMP(3), ADD COLUMN "validUntil" TIMESTAMP(3),
 ADD COLUMN "genderRestriction" TEXT, ADD COLUMN "minAge" INTEGER, ADD COLUMN "maxAge" INTEGER,
 ADD COLUMN "allowHolidays" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "requirePresenceConfirmation" BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN "releaseAbsenceSlot" BOOLEAN NOT NULL DEFAULT true, ADD COLUMN "fixedReceiptTime" TEXT, ADD COLUMN "slotMinutes" INTEGER NOT NULL DEFAULT 15;
CREATE TABLE "HealthScheduleBlock" (
 id TEXT PRIMARY KEY, "scheduleId" TEXT NOT NULL REFERENCES "HealthCareSchedule"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "startsAt" TIMESTAMP(3) NOT NULL, "endsAt" TIMESTAMP(3) NOT NULL, reason TEXT NOT NULL, "actorUsuarioId" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "HealthScheduleBlock_scheduleId_startsAt_endsAt_idx" ON "HealthScheduleBlock"("scheduleId","startsAt","endsAt");
CREATE TABLE "HealthRegulationReview" (
 id TEXT PRIMARY KEY, "requestId" TEXT NOT NULL REFERENCES "HealthRegulationRequest"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 step TEXT NOT NULL, decision TEXT NOT NULL, priority TEXT NOT NULL, notes TEXT NOT NULL, "professionalId" TEXT,
 "actorUsuarioId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "HealthRegulationReview_requestId_createdAt_idx" ON "HealthRegulationReview"("requestId","createdAt");
CREATE TABLE "HealthCallPanel" (
 id TEXT PRIMARY KEY, "unitId" TEXT NOT NULL, sector TEXT NOT NULL, title TEXT NOT NULL, "callMessage" TEXT NOT NULL,
 news TEXT NOT NULL, "isActive" BOOLEAN NOT NULL DEFAULT true,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE("unitId",sector)
);
CREATE TABLE "HealthPanelCall" (
 id TEXT PRIMARY KEY, "panelId" TEXT NOT NULL REFERENCES "HealthCallPanel"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "patientId" TEXT NOT NULL, "appointmentId" TEXT, "pharmacyRequestId" TEXT, message TEXT NOT NULL, "actorUsuarioId" TEXT NOT NULL,
 "calledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "HealthPanelCall_panelId_calledAt_idx" ON "HealthPanelCall"("panelId","calledAt");
