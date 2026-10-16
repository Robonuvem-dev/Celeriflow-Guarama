CREATE TABLE "ConstructionInternalOpeningDocument" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "requestKey" TEXT NOT NULL,
  "uploadKey" TEXT NOT NULL UNIQUE,
  "actorId" TEXT NOT NULL REFERENCES "Usuario"("id") ON DELETE RESTRICT,
  "formVersion" INTEGER NOT NULL CHECK ("formVersion" >= 0),
  "label" TEXT NOT NULL,
  "documentId" TEXT NOT NULL UNIQUE REFERENCES "Document"("id") ON DELETE RESTRICT,
  "documentVersionId" TEXT NOT NULL UNIQUE REFERENCES "DocumentVersion"("id") ON DELETE RESTRICT,
  "hashSha256" TEXT NOT NULL CHECK ("hashSha256" ~ '^[a-f0-9]{64}$'),
  "filename" TEXT NOT NULL, "mimeType" TEXT NOT NULL,
  "caseId" TEXT REFERENCES "ConstructionCase"("id") ON DELETE RESTRICT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ConstructionInternalOpeningDocument_actorId_requestKey_label_idx" ON "ConstructionInternalOpeningDocument"("actorId", "requestKey", "label");
CREATE INDEX "ConstructionInternalOpeningDocument_caseId_idx" ON "ConstructionInternalOpeningDocument"("caseId");
