UPDATE "ConfiguracaoModulo"
SET "nome" = catalog."nome",
    "updatedAt" = CURRENT_TIMESTAMP
FROM (VALUES
  ('TRANSPARENCIA', 'Portal Transparência'),
  ('SUPORTE_TECNICO', 'Suporte Técnico'),
  ('CONFIGURACOES', 'Configurações')
) AS catalog("codigo", "nome")
WHERE "ConfiguracaoModulo"."codigo" = catalog."codigo"
  AND "ConfiguracaoModulo"."nome" IS DISTINCT FROM catalog."nome";
