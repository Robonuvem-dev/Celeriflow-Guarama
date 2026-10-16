CREATE TABLE "HealthPregnancy" (
  id TEXT PRIMARY KEY, "patientId" TEXT NOT NULL REFERENCES "Patient"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "openedMedicalRecordId" TEXT NOT NULL, "unitId" TEXT NOT NULL,
  "lastMenstrualDate" TIMESTAMP(3), "ultrasoundDate" TIMESTAMP(3), "ultrasoundGestationalDays" INTEGER,
  "estimatedDeliveryDate" TIMESTAMP(3) NOT NULL, "calculationMethod" TEXT NOT NULL,
  "baselineWeight" DOUBLE PRECISION NOT NULL, height DOUBLE PRECISION NOT NULL,
  "pregnancyType" TEXT NOT NULL, "previousPregnancies" INTEGER NOT NULL, "lastScreeningDate" TIMESTAMP(3),
  status TEXT NOT NULL DEFAULT 'ACTIVE', "closureReason" TEXT, "closedAt" TIMESTAMP(3), "closedByUsuarioId" TEXT,
  "createdByUsuarioId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "HealthPregnancy_patientId_status_idx" ON "HealthPregnancy"("patientId",status);
CREATE TABLE "HealthPregnancyVisit" (
  id TEXT PRIMARY KEY, "pregnancyId" TEXT NOT NULL REFERENCES "HealthPregnancy"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "medicalRecordId" TEXT NOT NULL UNIQUE, "occurredAt" TIMESTAMP(3) NOT NULL,
  "gestationalDays" INTEGER NOT NULL, trimester INTEGER NOT NULL, weight DOUBLE PRECISION NOT NULL,
  bmi DOUBLE PRECISION NOT NULL, "bloodPressure" TEXT, notes TEXT NOT NULL,
  "professionalId" TEXT NOT NULL, "actorUsuarioId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "HealthPostpartumVisit" (
  id TEXT PRIMARY KEY, "pregnancyId" TEXT NOT NULL REFERENCES "HealthPregnancy"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "medicalRecordId" TEXT NOT NULL UNIQUE, "occurredAt" TIMESTAMP(3) NOT NULL, outcome TEXT NOT NULL,
  "gestationalDaysAtBirth" INTEGER, "deliveryType" TEXT, "deliveryLocation" TEXT, "deliveryDate" TIMESTAMP(3),
  "clinicalConditions" TEXT NOT NULL, "actorUsuarioId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "HealthChronicAssessment" (
  id TEXT PRIMARY KEY, "patientId" TEXT NOT NULL REFERENCES "Patient"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "medicalRecordId" TEXT NOT NULL, "conditionKind" TEXT NOT NULL, "assessedAt" TIMESTAMP(3) NOT NULL,
  systolic DOUBLE PRECISION, diastolic DOUBLE PRECISION, glucose DOUBLE PRECISION, hba1c DOUBLE PRECISION,
  "riskFactors" TEXT[] NOT NULL, complications TEXT[] NOT NULL, notes TEXT NOT NULL,
  "actorUsuarioId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "HealthChronicAssessment_patientId_conditionKind_assessedAt_idx" ON "HealthChronicAssessment"("patientId","conditionKind","assessedAt");
CREATE TABLE "HealthClinicalScreening" (
  id TEXT PRIMARY KEY, "patientId" TEXT NOT NULL REFERENCES "Patient"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "medicalRecordId" TEXT NOT NULL, kind TEXT NOT NULL, eligible BOOLEAN NOT NULL, "eligibilityReason" TEXT NOT NULL,
  "requestedAt" TIMESTAMP(3) NOT NULL, "performedAt" TIMESTAMP(3), "resultedAt" TIMESTAMP(3), result TEXT,
  status TEXT NOT NULL, "examRequestId" TEXT, "followupNotes" TEXT NOT NULL,
  "actorUsuarioId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "HealthClinicalScreening_patientId_kind_status_idx" ON "HealthClinicalScreening"("patientId",kind,status);
CREATE TABLE "HealthDentalMark" (
  id TEXT PRIMARY KEY, "patientId" TEXT NOT NULL REFERENCES "Patient"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "medicalRecordId" TEXT NOT NULL, dentition TEXT NOT NULL, "targetType" TEXT NOT NULL, "targetCode" TEXT NOT NULL,
  surface TEXT, condition TEXT NOT NULL, "procedureId" TEXT, "performedProcedureId" TEXT UNIQUE,
  "performedAt" TIMESTAMP(3), notes TEXT NOT NULL, "actorUsuarioId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "HealthDentalMark_patientId_targetType_targetCode_createdAt_idx" ON "HealthDentalMark"("patientId","targetType","targetCode","createdAt");
CREATE TABLE "HealthTherapySession" (
  id TEXT PRIMARY KEY, "planId" TEXT NOT NULL REFERENCES "SpecializedTherapeuticPlan"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "sessionNumber" INTEGER NOT NULL, "specialtyKind" TEXT NOT NULL, "scheduledAt" TIMESTAMP(3) NOT NULL,
  "performedAt" TIMESTAMP(3), status TEXT NOT NULL DEFAULT 'SCHEDULED', evolution TEXT, "medicalRecordId" TEXT,
  "professionalId" TEXT NOT NULL, "actorUsuarioId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE("planId","sessionNumber")
);
