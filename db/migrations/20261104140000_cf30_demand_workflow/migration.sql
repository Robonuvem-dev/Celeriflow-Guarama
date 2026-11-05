CREATE TABLE "PurchaseDemandEvent" (
  "id" TEXT PRIMARY KEY,
  "demandVersionId" TEXT NOT NULL REFERENCES "PurchaseDemandVersion" ("id"),
  "step" INTEGER NOT NULL CHECK ("step" > 0),
  "status" TEXT NOT NULL CHECK ("status" IN ('EM_ANALISE', 'DEVOLVIDO', 'APROVADO')),
  "actorId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "documentVersionId" TEXT REFERENCES "DocumentVersion" ("id"),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("demandVersionId", "step")
);
