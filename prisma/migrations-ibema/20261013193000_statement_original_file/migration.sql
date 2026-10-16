-- Aditiva: arquivos legados permanecem sem original; nenhum conteúdo é inferido.
ALTER TABLE "BankStatementImport"
  ADD COLUMN "originalBytes" BYTEA,
  ADD COLUMN "originalEncoding" TEXT,
  ADD COLUMN "processingSnapshot" JSONB;
