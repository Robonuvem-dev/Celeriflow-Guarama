-- Certificados A1: somente metadados públicos e referência externa do segredo.
CREATE TABLE "DigitalCertificate" (
  "id" TEXT NOT NULL,
  "alias" TEXT NOT NULL,
  "ownerName" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'ENV_REFERENCE',
  "credentialReference" TEXT NOT NULL,
  "certificatePem" TEXT NOT NULL,
  "intermediatePems" JSONB NOT NULL DEFAULT '[]',
  "trustedRootPem" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "issuer" TEXT NOT NULL,
  "serialNumber" TEXT NOT NULL,
  "fingerprint256" TEXT NOT NULL,
  "validFrom" TIMESTAMP(3) NOT NULL,
  "validTo" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "purposes" JSONB NOT NULL DEFAULT '[]',
  "createdByUsuarioId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DigitalCertificate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DocumentIcpEvidence" (
  "id" TEXT NOT NULL,
  "documentVersionId" TEXT NOT NULL,
  "documentSignatureId" TEXT NOT NULL,
  "certificateId" TEXT NOT NULL,
  "documentHash" TEXT NOT NULL,
  "canonicalPayload" TEXT NOT NULL,
  "signatureBase64" TEXT NOT NULL,
  "algorithm" TEXT NOT NULL,
  "certificateSubject" TEXT NOT NULL,
  "certificateIssuer" TEXT NOT NULL,
  "certificateSerial" TEXT NOT NULL,
  "certificateFingerprint" TEXT NOT NULL,
  "certificatePemSnapshot" TEXT NOT NULL,
  "intermediatePemsSnapshot" JSONB NOT NULL,
  "trustedRootPemSnapshot" TEXT NOT NULL,
  "signedAt" TIMESTAMP(3) NOT NULL,
  "validationStatus" TEXT NOT NULL DEFAULT 'VALID_AT_SIGNING',
  "createdByUsuarioId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocumentIcpEvidence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CertificateUseAudit" (
  "id" TEXT NOT NULL,
  "certificateId" TEXT,
  "documentVersionId" TEXT,
  "actorUsuarioId" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "documentHash" TEXT,
  "correlationId" TEXT NOT NULL,
  "outcome" TEXT NOT NULL,
  "errorCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CertificateUseAudit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DigitalCertificate_alias_key" ON "DigitalCertificate"("alias");
CREATE UNIQUE INDEX "DigitalCertificate_fingerprint256_key" ON "DigitalCertificate"("fingerprint256");
CREATE INDEX "DigitalCertificate_status_validTo_idx" ON "DigitalCertificate"("status", "validTo");
CREATE UNIQUE INDEX "DocumentIcpEvidence_documentVersionId_key" ON "DocumentIcpEvidence"("documentVersionId");
CREATE UNIQUE INDEX "DocumentIcpEvidence_documentSignatureId_key" ON "DocumentIcpEvidence"("documentSignatureId");
CREATE INDEX "CertificateUseAudit_certificateId_createdAt_idx" ON "CertificateUseAudit"("certificateId", "createdAt");
CREATE INDEX "CertificateUseAudit_documentVersionId_createdAt_idx" ON "CertificateUseAudit"("documentVersionId", "createdAt");
CREATE INDEX "CertificateUseAudit_outcome_createdAt_idx" ON "CertificateUseAudit"("outcome", "createdAt");

ALTER TABLE "DocumentIcpEvidence" ADD CONSTRAINT "DocumentIcpEvidence_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "DocumentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DocumentIcpEvidence" ADD CONSTRAINT "DocumentIcpEvidence_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "DigitalCertificate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CertificateUseAudit" ADD CONSTRAINT "CertificateUseAudit_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "DigitalCertificate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CertificateUseAudit" ADD CONSTRAINT "CertificateUseAudit_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "DocumentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION prevent_icp_evidence_mutation() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'ICP signature evidence is append-only'; END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "DocumentIcpEvidence_append_only" BEFORE UPDATE OR DELETE ON "DocumentIcpEvidence" FOR EACH ROW EXECUTE FUNCTION prevent_icp_evidence_mutation();

CREATE OR REPLACE FUNCTION prevent_certificate_use_audit_mutation() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'Certificate use audit is append-only'; END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "CertificateUseAudit_append_only" BEFORE UPDATE OR DELETE ON "CertificateUseAudit" FOR EACH ROW EXECUTE FUNCTION prevent_certificate_use_audit_mutation();
