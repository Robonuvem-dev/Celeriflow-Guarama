INSERT INTO "ConfiguracaoModulo" ("id", "nome", "codigo", "ativo", "dataAtivacao", "createdAt", "updatedAt") VALUES
  ('ibema-module-cemiterios', 'Cemitérios', 'CEMITERIOS', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ibema-module-auditoria', 'Auditoria', 'AUDITORIA', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ibema-module-suporte-tecnico', 'Suporte Técnico Robonuvem', 'SUPORTE_TECNICO', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("codigo") DO UPDATE SET
  "nome" = EXCLUDED."nome",
  "updatedAt" = CURRENT_TIMESTAMP;
