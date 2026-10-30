-- Tipos iniciais; preserva os cadastros e as desativações já realizados.
INSERT INTO "SignatureCentralDocumentType" ("id", "name", "description", "active") VALUES
 ('central-type-oficio', 'Ofício', 'Comunicação oficial.', true),
 ('central-type-requerimento', 'Requerimento', 'Solicitação formal.', true),
 ('central-type-declaracao', 'Declaração', 'Declaração de informações ou fatos.', true),
 ('central-type-contrato', 'Contrato', 'Instrumento contratual.', true),
 ('central-type-termo', 'Termo', 'Termo de compromisso, responsabilidade ou ciência.', true),
 ('central-type-parecer', 'Parecer', 'Manifestação técnica ou jurídica.', true),
 ('central-type-relatorio', 'Relatório', 'Registro de atividades ou resultados.', true),
 ('central-type-ata', 'Ata', 'Registro de reunião ou deliberação.', true),
 ('central-type-portaria', 'Portaria', 'Ato administrativo.', true),
 ('central-type-autorizacao', 'Autorização', 'Autorização formal.', true),
 ('central-type-outros', 'Outros', 'Demais documentos.', true)
ON CONFLICT DO NOTHING;
