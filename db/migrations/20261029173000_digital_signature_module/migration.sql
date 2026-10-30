-- Auditoria is now an Administration page. Keep its historical module record
-- and permission references, but retire the independent module activation.
UPDATE "ConfiguracaoModulo"
SET "ativo" = false, "updatedAt" = CURRENT_TIMESTAMP
WHERE "codigo" = 'AUDITORIA' AND "ativo" = true;

-- The new central module has its own activation and profile permissions.
-- Do not transfer audit grants or override an existing activation choice.
INSERT INTO "ConfiguracaoModulo"
  ("id", "nome", "codigo", "ativo", "dataAtivacao", "createdAt", "updatedAt")
VALUES
  ('module-assinatura-digital', 'Assinatura Digital', 'ASSINATURA_DIGITAL', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("codigo") DO NOTHING;
