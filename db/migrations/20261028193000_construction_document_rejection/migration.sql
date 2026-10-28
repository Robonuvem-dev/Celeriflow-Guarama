-- Forward-only fix for the documentary rejection already written by the
-- municipal request-resolution service. The SQL runner owns the transaction.
-- Preserve every request, link, default, index and historical migration.
ALTER TABLE "ConstructionDocumentRequest"
  DROP CONSTRAINT "ConstructionDocumentRequest_status_check",
  ADD CONSTRAINT "ConstructionDocumentRequest_status_check"
    CHECK ("status" IN ('PENDING', 'FULFILLED', 'REJECTED'));
