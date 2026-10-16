-- Typed, immutable operational artifacts. Clinical artifacts never enter public views.
CREATE TABLE "SstPreventionRecord" (
 "id" TEXT PRIMARY KEY, "budgetUnitId" TEXT NOT NULL REFERENCES "BudgetUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "kind" TEXT NOT NULL CHECK ("kind" IN ('CIPA','PLAN','INSPECTION','MEETING','SIPAT','ELECTION','VISIT','BRIGADE','EXTINGUISHER','MAINTENANCE','ERGONOMICS','PCA','AUDIOMETRY')),
 "title" TEXT NOT NULL, "payload" JSONB NOT NULL, "clinical" BOOLEAN NOT NULL DEFAULT false,
 "createdById" TEXT NOT NULL REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "submissionKey" TEXT NOT NULL, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE ("createdById", "submissionKey"), CHECK ("payload"->>'kind' = "kind")
);
CREATE INDEX "SstPreventionRecord_scope" ON "SstPreventionRecord"("budgetUnitId", "kind", "createdAt", "id");
CREATE TABLE "SstPreventionRevision" (
 "id" TEXT PRIMARY KEY, "recordId" TEXT NOT NULL REFERENCES "SstPreventionRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "version" INTEGER NOT NULL, "artifact" JSONB NOT NULL, "actorId" TEXT NOT NULL REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE("recordId", "version")
);
CREATE TABLE "SstElectionElector" (
 "electionId" TEXT NOT NULL REFERENCES "SstPreventionRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "employeeId" TEXT NOT NULL REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "personId" TEXT NOT NULL REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 PRIMARY KEY("electionId", "employeeId")
);
CREATE TABLE "SstElectionCandidate" (
 "id" TEXT PRIMARY KEY, "electionId" TEXT NOT NULL REFERENCES "SstPreventionRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "employeeId" TEXT NOT NULL REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE, "nameSnapshot" TEXT NOT NULL,
 UNIQUE("electionId", "employeeId"), UNIQUE("electionId", "id"),
 FOREIGN KEY("electionId", "employeeId") REFERENCES "SstElectionElector"("electionId", "employeeId") ON DELETE RESTRICT ON UPDATE CASCADE
);
-- No candidate, ballot identifier or exact timestamp in the turnout ledger.
CREATE TABLE "SstElectionTurnout" (
 "electionId" TEXT NOT NULL, "employeeId" TEXT NOT NULL,
 PRIMARY KEY("electionId", "employeeId"),
 FOREIGN KEY("electionId", "employeeId") REFERENCES "SstElectionElector"("electionId", "employeeId") ON DELETE RESTRICT ON UPDATE CASCADE
);
-- Deliberately no voter/actor identifier, sequence, timestamp or correlation key.
CREATE TABLE "SstElectionBallot" (
 "id" TEXT PRIMARY KEY, "electionId" TEXT NOT NULL REFERENCES "SstPreventionRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE, "candidateId" TEXT,
 FOREIGN KEY("electionId", "candidateId") REFERENCES "SstElectionCandidate"("electionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "SstElectionBallot_count" ON "SstElectionBallot"("electionId", "candidateId");
