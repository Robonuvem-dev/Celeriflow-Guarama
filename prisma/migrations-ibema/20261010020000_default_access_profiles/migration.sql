-- Perfis operacionais iniciais. Permanecem editaveis pela matriz de permissoes.
WITH module_codes("codigo") AS (
  VALUES
    ('ADMINISTRACAO'),
    ('CADASTROS'),
    ('PROCESSOS'),
    ('DOCUMENTOS'),
    ('ATENDIMENTO'),
    ('TRANSPARENCIA'),
    ('TRIBUTACAO'),
    ('FINANCEIRO'),
    ('COMPRAS'),
    ('RH'),
    ('PORTAL_SERVIDOR'),
    ('PATRIMONIO'),
    ('EDUCACAO'),
    ('SAUDE'),
    ('SOCIAL'),
    ('MEIO_AMBIENTE'),
    ('SANEAMENTO'),
    ('OBRAS'),
    ('FROTAS'),
    ('CULTURA'),
    ('CAMARA'),
    ('SEGURANCA'),
    ('CONFIGURACOES')
), profile_definitions("id", "codigo", "nome", "descricao", "tipo") AS (
  VALUES
    (
      'ibema-profile-gestao-geral',
      'GESTAO_GERAL',
      'Gestão Geral',
      'Gestão municipal ampla, com acesso operacional aos módulos disponíveis. Não concede administração técnica do sistema.',
      'GENERAL'
    ),
    (
      'ibema-profile-gestao-area',
      'GESTAO_AREA_SECRETARIA',
      'Gestão por Área/Secretaria',
      'Gestão operacional vinculada à secretaria do servidor. A matriz pode ser ajustada conforme as atribuições da área.',
      'AREA_MANAGER'
    ),
    (
      'ibema-profile-servidor-area',
      'SERVIDOR_AREA_SECRETARIA',
      'Servidor por Área/Secretaria',
      'Acesso operacional vinculado à secretaria do servidor, com alterações iniciais limitadas aos fluxos de atendimento, documentos e processos.',
      'AREA_EMPLOYEE'
    )
), profile_permissions AS (
  SELECT
    profile."id",
    profile."codigo",
    profile."nome",
    profile."descricao",
    jsonb_build_object(
      'acesso', 'operacional',
      'modules', jsonb_object_agg(
        module."codigo",
        jsonb_build_object(
          'showDashboardCard', true,
          'blocked', permission."blocked",
          'create', permission."canCreate",
          'update', permission."canUpdate",
          'delete', permission."canDelete",
          'issueReports', permission."canIssueReports"
        )
      ),
      'modulosBloqueados', COALESCE(
        jsonb_agg(module."codigo") FILTER (WHERE permission."blocked"),
        '[]'::jsonb
      )
    )::text AS "permissoes"
  FROM profile_definitions profile
  CROSS JOIN module_codes module
  CROSS JOIN LATERAL (
    SELECT
      CASE
        WHEN profile."tipo" = 'GENERAL' THEN module."codigo" = 'CONFIGURACOES'
        ELSE module."codigo" IN ('ADMINISTRACAO', 'CONFIGURACOES')
      END AS "blocked",
      CASE
        WHEN profile."tipo" = 'AREA_EMPLOYEE' THEN module."codigo" IN ('ATENDIMENTO', 'DOCUMENTOS', 'PROCESSOS')
        ELSE module."codigo" <> 'CONFIGURACOES' AND NOT (profile."tipo" <> 'GENERAL' AND module."codigo" = 'ADMINISTRACAO')
      END AS "canCreate",
      CASE
        WHEN profile."tipo" = 'AREA_EMPLOYEE' THEN module."codigo" IN ('ATENDIMENTO', 'DOCUMENTOS', 'PROCESSOS')
        ELSE module."codigo" <> 'CONFIGURACOES' AND NOT (profile."tipo" <> 'GENERAL' AND module."codigo" = 'ADMINISTRACAO')
      END AS "canUpdate",
      CASE
        WHEN profile."tipo" = 'AREA_EMPLOYEE' THEN false
        ELSE module."codigo" <> 'CONFIGURACOES' AND NOT (profile."tipo" <> 'GENERAL' AND module."codigo" = 'ADMINISTRACAO')
      END AS "canDelete",
      CASE
        WHEN profile."tipo" = 'AREA_EMPLOYEE' THEN false
        ELSE module."codigo" <> 'CONFIGURACOES' AND NOT (profile."tipo" <> 'GENERAL' AND module."codigo" = 'ADMINISTRACAO')
      END AS "canIssueReports"
  ) permission
  GROUP BY profile."id", profile."codigo", profile."nome", profile."descricao"
)
INSERT INTO "ConfiguracaoPerfil" (
  "id",
  "codigo",
  "nome",
  "descricao",
  "permissoes",
  "ativo",
  "createdAt",
  "updatedAt"
)
SELECT
  "id",
  "codigo",
  "nome",
  "descricao",
  "permissoes",
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM profile_permissions
ON CONFLICT ("codigo") DO NOTHING;
