-- Catalogos neutros necessarios para iniciar uma instancia limpa.
-- Nao contem usuarios, dados municipais ou regras legais de folha.

BEGIN;

INSERT INTO "DocumentClass" ("id", "code", "label", "signaturePolicy", "isActive", "createdAt", "updatedAt") VALUES
  ('c2docclassinternalallowed', 'GED_INTERNAL_ALLOWED', 'Documento interno permitido', 'INTERNAL_ALLOWED', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('c2docclassicprequired', 'GED_ICP_REQUIRED', 'Documento com ICP obrigatoria', 'ICP_REQUIRED', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('c2docclassexternalrequired', 'GED_EXTERNAL_PROVIDER_REQUIRED', 'Documento com provedor externo obrigatorio', 'EXTERNAL_PROVIDER_REQUIRED', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET "label" = EXCLUDED."label", "signaturePolicy" = EXCLUDED."signaturePolicy", "isActive" = EXCLUDED."isActive", "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "ConfiguracaoModulo" ("id", "nome", "codigo", "ativo", "dataAtivacao", "createdAt", "updatedAt") VALUES
  ('ibema-module-administracao', 'Administração Geral & Entidades', 'ADMINISTRACAO', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ibema-module-cadastros', 'Pessoas & Cadastros Gerais', 'CADASTROS', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ibema-module-processos', 'Processos Administrativos & Protocolos', 'PROCESSOS', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ibema-module-documentos', 'Documentos / GED & Certidões', 'DOCUMENTOS', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ibema-module-atendimento', 'Atendimento ao Cidadão & Ouvidoria', 'ATENDIMENTO', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ibema-module-transparencia', 'Portal da Transparência & LAI', 'TRANSPARENCIA', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ibema-module-tributacao', 'Tributação, Arrecadação & IPTU', 'TRIBUTACAO', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ibema-module-financeiro', 'Financeiro, Orçamento & Tesouraria', 'FINANCEIRO', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ibema-module-compras', 'Compras, Licitações & Cotações', 'COMPRAS', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ibema-module-rh', 'Recursos Humanos & Servidores', 'RH', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ibema-module-portal-servidor', 'Portal do Servidor', 'PORTAL_SERVIDOR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ibema-module-patrimonio', 'Almoxarifado e Patrimônio', 'PATRIMONIO', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ibema-module-frotas', 'Frotas', 'FROTAS', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ibema-module-educacao', 'Educação Pública & Escolas', 'EDUCACAO', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ibema-module-saude', 'Saúde Pública & UBSs', 'SAUDE', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ibema-module-portal-paciente', 'Portal do Paciente', 'PORTAL_PACIENTE', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ibema-module-social', 'Assistência Social & CRAS', 'SOCIAL', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ibema-module-meio-ambiente', 'Meio Ambiente & Licenciamento', 'MEIO_AMBIENTE', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ibema-module-saneamento', 'Saneamento, Água & Esgoto', 'SANEAMENTO', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ibema-module-obras', 'Obras Públicas & Vistorias', 'OBRAS', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ibema-module-cultura', 'Cultura, Esporte & Turismo', 'CULTURA', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ibema-module-camara', 'Câmara Municipal & Legislação', 'CAMARA', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ibema-module-seguranca', 'Segurança Pública & Guarda Municipal', 'SEGURANCA', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ibema-module-configuracoes', 'Configurações do Sistema & Integrações', 'CONFIGURACOES', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("codigo") DO UPDATE SET "nome" = EXCLUDED."nome", "ativo" = EXCLUDED."ativo", "dataAtivacao" = COALESCE("ConfiguracaoModulo"."dataAtivacao", CURRENT_TIMESTAMP), "updatedAt" = CURRENT_TIMESTAMP;

COMMIT;
