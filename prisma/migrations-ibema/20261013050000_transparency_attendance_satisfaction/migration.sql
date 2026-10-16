ALTER TABLE "TransparencyCitizenRequest" ADD COLUMN "entity" TEXT NOT NULL DEFAULT 'prefeitura' CHECK ("entity" IN ('prefeitura','camara')),
 ADD COLUMN "nativeTicketId" TEXT REFERENCES "Ticket"("id") ON DELETE RESTRICT,
 ADD COLUMN "nativeOmbudsmanId" TEXT REFERENCES "Ombudsman"("id") ON DELETE RESTRICT;
CREATE UNIQUE INDEX "TransparencyCitizenRequest_nativeTicketId_key" ON "TransparencyCitizenRequest"("nativeTicketId");
CREATE UNIQUE INDEX "TransparencyCitizenRequest_nativeOmbudsmanId_key" ON "TransparencyCitizenRequest"("nativeOmbudsmanId");
CREATE TABLE "TransparencySatisfaction" (
 "id" TEXT PRIMARY KEY,"requestId" TEXT NOT NULL REFERENCES "TransparencyCitizenRequest"("id") ON DELETE RESTRICT,
 "rating" INTEGER NOT NULL CHECK ("rating" BETWEEN 1 AND 5),"comment" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "TransparencySatisfaction_requestId_key" ON "TransparencySatisfaction"("requestId");
