-- Mantem os mesmos nomes no Dashboard, em Modulos e em Perfis de Acesso.
UPDATE "ConfiguracaoModulo"
SET "nome" = catalog."nome",
    "updatedAt" = CURRENT_TIMESTAMP
FROM (VALUES
  ('ADMINISTRACAO', 'Administração'),
  ('CADASTROS', 'Cadastros'),
  ('PROCESSOS', 'Processos e Protocolo'),
  ('DOCUMENTOS', 'Documentos / GED'),
  ('ATENDIMENTO', 'Atendimento ao Cidadão'),
  ('TRANSPARENCIA', 'Portal e Transparência'),
  ('TRIBUTACAO', 'Tributário'),
  ('FINANCEIRO', 'Financeiro e Contábil'),
  ('COMPRAS', 'Compras e Contratos'),
  ('RH', 'RH e Folha'),
  ('PORTAL_SERVIDOR', 'Portal do Servidor'),
  ('PATRIMONIO', 'Almoxarifado e Patrimônio'),
  ('EDUCACAO', 'Educação'),
  ('SAUDE', 'Saúde'),
  ('SOCIAL', 'Assistência Social'),
  ('MEIO_AMBIENTE', 'Meio Ambiente'),
  ('SANEAMENTO', 'Água e Saneamento'),
  ('OBRAS', 'Obras e Serviços Públicos'),
  ('FROTAS', 'Frotas'),
  ('CULTURA', 'Cultura e Lazer'),
  ('CAMARA', 'Câmara Municipal'),
  ('SEGURANCA', 'Segurança e Mobilidade'),
  ('CONFIGURACOES', 'Configurações e Integrações')
) AS catalog("codigo", "nome")
WHERE "ConfiguracaoModulo"."codigo" = catalog."codigo";
