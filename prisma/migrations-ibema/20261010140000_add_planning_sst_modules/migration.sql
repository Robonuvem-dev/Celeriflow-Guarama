INSERT INTO "ConfiguracaoModulo" ("id", "nome", "codigo", "ativo", "dataAtivacao", "createdAt", "updatedAt") VALUES
  ('ibema-module-planejamento', 'Planejamento e Orçamento', 'PLANEJAMENTO', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ibema-module-sst', 'Segurança e Medicina do Trabalho', 'SST', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("codigo") DO UPDATE SET
  "nome" = EXCLUDED."nome",
  "updatedAt" = CURRENT_TIMESTAMP;
