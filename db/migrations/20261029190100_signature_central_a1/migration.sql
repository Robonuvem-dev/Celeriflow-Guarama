CREATE TABLE "SignatureCentralA1Integration" (
  "id" TEXT PRIMARY KEY,
  "certificateId" TEXT NOT NULL REFERENCES "DigitalCertificate"("id") ON DELETE RESTRICT,
  "kind" TEXT NOT NULL,
  "alias" TEXT NOT NULL,
  "ownerName" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SignatureCentralA1Integration_kind_document_check" CHECK (
    ("kind" = 'A1_ECPF' AND "documentId" ~ '^[0-9]{11}$') OR
    ("kind" = 'A1_ECNPJ' AND "documentId" ~ '^[0-9]{14}$')
  )
);
CREATE UNIQUE INDEX "SignatureCentralA1Integration_certificate_key" ON "SignatureCentralA1Integration"("certificateId");
-- Rollback (explicit/manual, preserves the shared certificate inventory):
-- DROP TABLE "SignatureCentralA1Integration";
