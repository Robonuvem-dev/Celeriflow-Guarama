CREATE TABLE "GedCentralArchive" (
  "recordId" TEXT PRIMARY KEY REFERENCES "SignatureCentralRecord"(id) ON DELETE RESTRICT,
  "documentId" TEXT NOT NULL UNIQUE REFERENCES "Document"(id) ON DELETE RESTRICT,
  "versionId" TEXT NOT NULL REFERENCES "DocumentVersion"(id) ON DELETE RESTRICT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now()
);
CREATE TABLE "GedCentralSignature" (
  "recordId" TEXT PRIMARY KEY REFERENCES "SignatureCentralRecord"(id) ON DELETE RESTRICT,
  "versionId" TEXT NOT NULL REFERENCES "DocumentVersion"(id) ON DELETE RESTRICT
);
CREATE INDEX "GedCentralSignature_version_idx" ON "GedCentralSignature"("versionId");
CREATE TABLE "GedOperationLease" (
  "documentId" TEXT PRIMARY KEY REFERENCES "Document"(id) ON DELETE RESTRICT,
  token TEXT NOT NULL, "expiresAt" TIMESTAMPTZ(3) NOT NULL
);
