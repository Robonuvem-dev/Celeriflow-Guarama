CREATE TABLE "PurchasePlanningDocumentVersion" (
  "id" TEXT PRIMARY KEY,
  "purchasePlanningId" TEXT NOT NULL REFERENCES "PurchasePlanning" ("id") ON DELETE CASCADE,
  "documentType" TEXT NOT NULL CHECK ("documentType" IN ('PCA', 'ETP', 'TR')),
  "version" INTEGER NOT NULL CHECK ("version" > 0),
  "status" TEXT NOT NULL DEFAULT 'RASCUNHO' CHECK ("status" IN ('RASCUNHO', 'EM_ANALISE', 'DEVOLVIDO', 'APROVADO')),
  "sourceDfdVersionId" TEXT REFERENCES "PurchaseDemandVersion" ("id") ON DELETE SET NULL,
  "sourceEtpVersionId" TEXT REFERENCES "PurchasePlanningDocumentVersion" ("id") ON DELETE SET NULL,
  "gedDocumentVersionId" TEXT REFERENCES "DocumentVersion" ("id") ON DELETE SET NULL,
  "payload" JSONB NOT NULL,
  "coherenceReport" JSONB NOT NULL,
  "actorId" TEXT NOT NULL,
  "reviewerId" TEXT,
  "reviewReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("purchasePlanningId", "documentType", "version")
);

CREATE INDEX "PurchasePlanningDocumentVersion_planning_type_version_idx"
  ON "PurchasePlanningDocumentVersion" ("purchasePlanningId", "documentType", "version" DESC);

CREATE INDEX "PurchasePlanningDocumentVersion_gedDocumentVersionId_idx"
  ON "PurchasePlanningDocumentVersion" ("gedDocumentVersionId");

CREATE TABLE "PurchasePlanningAiSuggestionLog" (
  "id" TEXT PRIMARY KEY,
  "purchasePlanningId" TEXT NOT NULL REFERENCES "PurchasePlanning" ("id") ON DELETE CASCADE,
  "documentType" TEXT NOT NULL CHECK ("documentType" IN ('DFD', 'PCA', 'ETP', 'TR')),
  "fieldKey" TEXT NOT NULL,
  "suggestionType" TEXT NOT NULL CHECK ("suggestionType" IN ('REDACAO_PARAMETRIZADA', 'REAPROVEITAMENTO_DADOS', 'CONSISTENCIA_NORMATIVA')),
  "suggestedText" TEXT NOT NULL,
  "decision" TEXT NOT NULL CHECK ("decision" IN ('ACEITA', 'EDITADA', 'RECUSADA')),
  "finalText" TEXT NOT NULL,
  "justification" TEXT,
  "actorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "PurchasePlanningAiSuggestionLog_planning_type_createdAt_idx"
  ON "PurchasePlanningAiSuggestionLog" ("purchasePlanningId", "documentType", "createdAt" DESC);

