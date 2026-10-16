CREATE TABLE "HealthPatientCall" (
 id TEXT PRIMARY KEY, "patientId" TEXT NOT NULL REFERENCES "Patient"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "regulationRequestId" TEXT REFERENCES "HealthRegulationRequest"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "calledAt" TIMESTAMP(3) NOT NULL, phone TEXT NOT NULL, result TEXT NOT NULL, notes TEXT, "actorUsuarioId" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "HealthPatientCall_patientId_calledAt_idx" ON "HealthPatientCall"("patientId","calledAt");
