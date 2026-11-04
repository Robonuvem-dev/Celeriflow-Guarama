# Sprint 03 — CF33, cadastro e documentos

## Incremento 04 — gravação direta no banco (33.11) e integração automática da base existente (33.15), 03/11/2026

Os requisitos **33.11** e **33.15** foram concluídos na branch `feat/cf10-cf30-cf33-mateus`:

- **33.11 (Gravação direta de Word e LibreOffice no banco sem conversão e sem perda de desempenho):**
  - Migração aditiva `db/migrations/20261103160000_cf33_database_files_and_import/migration.sql` cria `"LegalTextDatabaseDocument"` (metadados leves indexados por versão jurídica) e `"LegalTextDatabaseDocumentBlob"` (conteúdo binário codificado separadamente em tabela 1:1 para não degradar consultas de listagem/paginação), com triggers de imutabilidade SQL.
  - Repositório `src/db/repositories/registry/legal-documents.ts` (`saveLegalDatabaseDocument`, `readLegalDatabaseDocument`) valida a integridade binária/estrutura OpenXML/ODF/OLE/RTF via `inspectGedBytes`, preserva os bytes originais e SHA-256 sem conversão e lista metadados em `listLegalDocuments` via `UNION ALL` sem tocar na tabela de BLOBs.
  - Rota `/api/cadastros/textos-juridicos/documentos` e tela `LegalDocumentsView.tsx` oferecem a ação **"Gravar Word ou LibreOffice no banco"** (`.doc`, `.docx`, `.rtf`, `.odt`, `.odf`, `.ods`) e download direto com verificação de integridade SHA-256.
- **33.15 (Integração automática de documentos e leis já existentes na base sem redigitação):**
  - Repositório `src/db/repositories/registry/legal-text-import.ts` (`syncLegalTextsFromExistingDatabase`) importa de forma transacional, auditada e idempotente tanto registros da tabela de integração `"LegacyLegalTextSource"` quanto documentos jurídicos já catalogados no acervo `"Document"`/`"GedEntry"`/`"DocumentPageText"`, preenchendo automaticamente `LegalText` e `LegalTextVersion` (`v1`) sem necessidade de redigitação.
  - Action `importLegalTextsFromExistingDatabase` em `master-data-actions.ts` e botão **"Importar do banco existente"** em `MasterDataCatalogClient.tsx` para o catálogo `legalTexts`.
  - Migração duplicada `prisma/migrations/20261103120000_cf33_legal_text_comments/migration.sql` removida, mantendo apenas a autoridade oficial em `db/migrations/`.

## Incremento 03 — formatos originais e esferas jurídicas

Base `0018bfb8b8bdecebd720eed60c30a93015f67659`. Os itens 33.4, 33.8 e 33.9 têm implementação e testes internos; homologação permanece pendente.

- GED mantém figuras e mapas em PDF/PNG/JPEG e aceita também XLS/XLSX, DOC/RTF e ODT/ODF/ODS nos fluxos existentes de importação e check-in. Preserva bytes e hash dos originais, sem conversão no envio. Os vínculos jurídicos do incremento anterior não precisam de outro upload.
- MIME do seletor e do token de upload vêm da mesma política. Validação confere estrutura OpenXML/OpenDocument, assinatura OLE dos binários legados e limites de tamanho/descompressão. Não equivale a interpretar integralmente DOC/XLS.
- Cadastro normaliza MUNICIPAL/ESTADUAL/FEDERAL sem alterar registros existentes, preserva opções legadas em edição e mantém o portal 33.6 intacto. Os oito tipos municipais foram gravados integralmente em fixture Drizzle, com ementa e versão preservadas.
- 33.11 permanece Em dev: os originais Word/LibreOffice ficam no storage GED; falta a opção de guardar os bytes diretamente no banco e verificar desempenho. A indexação de formatos novos não está integrada; interface informa essa limitação. 33.15 continua dependente da identificação da origem.

42 testes aprovados: 28 de regressão, 10 de formatos/contratos e 4 de navegador. Partições de tipos 10 e 16 e tipos das fixtures aprovados. Sem migração nova ou uso de banco real. As execuções aprovadas usaram opt-out do Next e a configuração DisableTelemetry do cliente Application Insights da sessão PowerShell. A revisão automática ainda rejeitou o acompanhamento da execução combinada que incluía ESLint; o resultado final do lint não foi confirmado e não conta como aprovado. Build integral segue pendente pelo bloqueio Windows/Turbopack já documentado. Publicação somente de desenvolvimento na branch autorizada, sem homologação, merge ou deploy manual.

## Incremento 02 — documentos vinculados, 02/11/2026

Base `36c35b81998daced82600e6076a47077f7d80b36`, somente na branch de Mateus. O estado abaixo atualiza o incremento 01 histórico. Código dos itens 33.2, 33.12 e 33.14 concluído; não homologado. Demais itens permanecem parciais/pendentes conforme seus requisitos específicos.

### Entrega e reuso

- Rota `/cadastros/textos-juridicos/documentos`, acessível pela ação Documentos na tabela jurídica existente. Uma tabela operacional por visão: vínculos e seleção no GED, com paginação de 20 registros, pesquisa de conteúdo pelo serviço GED e consulta por número de versão jurídica. Mantém tabela, botões, detalhes e paginação compartilhados. Importação dos arquivos continua no fluxo existente `/assinatura-digital/importacoes`; não foi criado outro upload.
- Original e anexos ligam uma LegalTextVersion existente a uma DocumentVersion existente. Não copia arquivos, cria outro documento ou reconverte originais. Conteúdo textual permanece no cadastro/banco e arquivos permanecem no armazenamento gerenciado pelo GED (33.2). Anexos digitalizados podem ser associados à versão da norma, inclusive peças/processos externos já importados no GED (33.12).
- Nova tabela de relação `LegalTextDocument` guarda versão jurídica, versão GED, finalidade, nome original, autor e data. É vínculo específico entre duas versões; não substitui GedIntegrationLink da main, que contém documentId/module/sourceId e não fixa a versão GED. Usa os catálogos e controles GED existentes, sem importar a main inteira ou recriar os 27 cadastros GED.
- Para o original, conserva também LegalTextVersion.documentId. A exclusividade legada de documentId foi preservada: o mesmo documento não pode ser original de duas versões jurídicas. Uma revisão GED desse documento pode ser vinculada como anexo sem duplicar o arquivo. Caso haja original legado sem versão exata registrada, a tela informa essa pendência; não escolhe automaticamente uma versão histórica nem altera dados legados.
- Vínculos são permanentes na versão jurídica: atualização/remoção são bloqueadas por trigger; correções exigem nova versão jurídica. O botão explicita original/anexo e a tela informa a permanência. Uma edição futura no GED não muda o hash/versão do vínculo.
- API exige CADASTROS para consulta e CADASTROS:update para vínculo, além de getGedContext(read) e requireManagedDocument/gedEntryScope para acesso ao documento. Não amplia privilégios GED, não permite arquivos reservados ou versões não finais, rejeita origem externa no POST, versão jurídica antiga e versão GED divergente. Auditoria ocorre na mesma transação do vínculo. Replays não duplicam vínculo/auditoria.
- Download exige novamente acesso jurídico e ao objeto GED e encaminha a versão fixada para o endpoint de download existente, que verifica bytes/hash e audita o download. Nenhuma URL de storage é exposta pela listagem nova. Listagem filtra escopo antes da contagem/paginação. Respostas privadas/no-store.

### Migração e limites

`db/migrations/20261102150000_cf33_legal_documents/migration.sql`: apenas nova tabela de relação, índices e proteção de imutabilidade. FKs para LegalTextVersion, DocumentVersion e Usuario; sem backfill, exclusão de dados, alteração de migração histórica ou mudança nas tabelas GED. Aplicação e rollback de DDL exercitados apenas na fixture isolada. Sem migração aplicada em banco real. Antes da aplicação, o recurso responde 503 e informa indisponibilidade; as consultas jurídicas legadas não passam a depender da nova tabela.

`verify-files`: FILES_INTACT_BASELINE_AUTHORIZED. strictAdoption permanece BLOCKED pelas diferenças históricas preexistentes; databaseAuthority NOT_CHECKED. Esse resultado não aprova aplicação de migração nem comprova estado do banco real. Antes do PR final, reconciliar a migração CF10 renomeada na main, sem duplicá-la.

O GED desta branch continua aceitando o subconjunto original de formatos. Word antigo/LibreOffice/Excel ampliados na main ainda precisam da conciliação dos serviços correspondentes: não declarar 33.4/33.11 concluídos por este vínculo. A busca nesta tela é a busca de conteúdo GED existente, não a consulta jurídica completa de 33.1/33.3/33.5. Importação automática 33.15 continua sem origem informada.

### Evidências deste incremento

34 testes aprovados, sem skipped:

- 8 de vínculos reais em Drizzle/PostgreSQL isolado: aplicação/rollback da migração, guarda 503, original e anexos, replay, concorrência, paginação 20/2, isolamento, hash/versão fixados, reserva/conflito, auditoria atômica, imutabilidade SQL e exclusividade legada do original.
- 7 de regressão da persistência jurídica e 2 de armazenamento/OCR GED com bytes reais/servidor de fixture.
- 5 de fronteira HTTP (autorização jurídica+GED, origem, validação, conflitos, download da versão fixada e cache) e 4 de regressão da action. Identidade e IO simulados nos testes de fronteira, não sessão autenticada real.
- 4 de navegador dos vínculos e 4 de regressão do cadastro jurídico: componentes/CSS reais, 13px/24px, 20/1 registros, payload/versões, erro, acesso de consulta, versão histórica sem escrita, defaults de outros catálogos e celular Android simulado em 390×844. Fonte fallback sans-serif. Ajustado o contêiner de download para preservar altura de linha; fixture móvel usa identificação móvel além da largura da janela.
- ESLint e git diff --check aprovados; tipos das fontes/imports nas partições 3/7/10/13/16 e fixtures aprovados. O plano atual tem 17 partições/3.675 fontes/1.019 validações; somente as partições pertinentes foram verificadas, não novo build integral. Tentativas paralelas excederam memória do executor; verificações finais executadas sequencialmente, sem contar falhas/interrupções como PASS.

```sh
node --conditions=react-server --import tsx --test --test-concurrency=1 tests/legal-documents.test.ts tests/legal-text-persistence.test.ts tests/ged-storage.test.ts
node --test tests/legal-documents-route.test.mjs tests/legal-text-actions.test.mjs
node --test --test-concurrency=1 tests/legal-documents.browser.test.mjs tests/legal-text.browser.test.mjs
node scripts/database-migrate.mjs verify-files
```

Build integral atual continua pendente pelo bloqueio Windows/Turbopack conhecido; não foi executado integralmente de novo nem aprovado neste incremento. Publicação somente de desenvolvimento na branch autorizada, sem PR final, merge, deploy manual ou nova homologação. Próximo: conciliar formatos/serviços GED da main para 33.4/33.11 e completar a experiência de cadastro 33.8/33.9; depois buscas/relações/impressão/comentários da Sprint 04. 33.6/Eduardo preservado.

## Incremento 01 — 02/11/2026

Branch exclusiva `feat/cf10-cf30-cf33-mateus`, base `5d2375c6f3821ce988c05bc472d171a0fe6ba8b6`. Sprint em desenvolvimento; nenhum requisito CF33 novo é declarado concluído ou homologado neste incremento.

### Reauditoria antes do código

Main consultada somente para leitura em `b8e27b920a2ffaf347c34c006d5e6cd75b1c79e9`. Não houve merge/cherry-pick de main, alteração em outras branches ou aplicação de migração. O portal `src/app/portal/leis-municipais/page.tsx` mantém o blob `d6634ce21f0f387811f313f8476beb79f0369946` tanto na branch quanto nessa main; 33.6/Eduardo preservado.

| Base existente | Evidência e decisão |
| --- | --- |
| Cadastro jurídico | `master-data-page.tsx`, `MasterDataCatalogClient.tsx`, `master-data-actions.ts`, repositórios `registry/master-data-*`. Já permitem tipo, número, ementa, esfera, órgão, entidade, publicação, vigência e conteúdo. Reusar a rota `/cadastros/textos-juridicos`, sem criar outro cadastro. |
| Persistência/versionamento | `src/db/schema/master-data.ts`: LegalText e LegalTextVersion; `saveLegalText` já cria v1 e novas versões por alteração de conteúdo/ementa/datas. O mesmo trecho permaneceu na main examinada. Lacunas confirmadas: alocação concorrente sem lock, falta de detecção de editor antigo e criação de versão VIGENTE ao editar norma inativa. Corrigidas neste incremento. |
| GED atualizado na main | `ged-policy.ts`, `ged-storage.ts`, `ged-governance.ts`, `ged-access.ts`, `ged-search.ts`, `ged-source-adapters.ts` e `ged-source-ingress.ts`; `ged-poc.ts` e migração `20261102130000_ged_poc_internal`. Já ampliam formatos, ACL, comentários, origens e integração. Não recriar essas estruturas na branch antiga. |
| Vínculos documentais | LegalTextVersion.documentId já existe. GedIntegrationLink usa module/sourceId/documentId; GedComment está ligado ao documento. Isso não comprova vínculo à norma/versão nem autorização conjunta CADASTROS+GED. Próximo incremento deve integrar os serviços existentes após revisar dependências e conciliar a base. |
| Relações jurídicas | LegalTextRelation já está definida no SQL histórico `prisma/migrations-ibema/20261010130000_add_master_data_foundation/migration.sql`. Ainda sem mapping/operação jurídica encontrados nesta revisão. Conferir presença no catálogo do banco de teste antes de qualquer DDL; não criar duplicata. |
| Interface | Cadastro já usa OperationalListFrame/OperationalTable/paginação/diálogo compartilhados. Faltavam flags de criação/edição. Reusada a interface; sem tabela, layout ou CSS novos. |

### Alterações deste incremento

- `saveLegalText` trava a linha LegalText antes de ler/alocar versão. Quinto argumento opcional `expectedVersion` preserva o retorno Promise<string> e consumidores legados com quatro argumentos. Consumidores conferidos: master-data-actions e drizzle-master-data.test.ts.
- A edição na action existente exige token válido e o client envia a versão vista na lista. Versão antiga é rejeitada antes de atualizar dados, auditar ou revalidar. Action mantém retorno `{ error?: string }`, autenticação CADASTROS:create/update e auditoria na mesma transação.
- Alterações de tipo/número/esfera/órgão/entidade também avançam o número da versão, mesmo sem mudar o texto, invalidando editores antigos. Isso não adiciona snapshot histórico desses metadados: o schema legado de versões ainda não guarda todos esses campos.
- Nova versão de norma inativa preserva o status atual do registro, sem reativá-la implicitamente. Não foi redesenhado o fluxo de revogação nem a alternância legada de status.
- Somente a página legal passa flags canCreate/canUpdate baseadas nas permissões existentes; consulta não oferece escrita. Props opcionais mantêm os defaults dos demais catálogos. Nenhuma permissão server-side foi enfraquecida.
- Erro de conflito permanece no diálogo e conserva o conteúdo digitado; não sobrescreve automaticamente a versão de outra pessoa.

### Verificação

17 testes aprovados, sem skipped:

- 7 de persistência real via Drizzle/Neon sobre PostgreSQL isolado/PGlite: esferas municipal/estadual/federal; edição sem mudanças; versões; duas edições da mesma versão com um vencedor; consumidores antigos serializados; metadados; status inativo; rollback por falha de auditoria; tokens inválidos, ausência e duplicidade.
- 4 de contrato da action, com identidade e IO substituídos por sentinelas: autorização antes de IO; token; sucesso estruturado; erro de conflito sem falso sucesso. Não é sessão autenticada real.
- 4 de navegador, com componentes/CSS reais e backend/identidade de fixture: consulta/criação/edição, envio do token, rascunho após conflito, defaults de outros catálogos, geometria 13px/24px e consulta móvel 390×844. Fonte com fallback sans-serif, sem homologação da aplicação real.
- 2 de regressão dos perfis adicionais existentes.

ESLint, git diff --check, tipos das fontes/imports nas partições 2 e 10 do runner existente e tipos específicos das fixtures aprovados. Apenas essas duas partições foram executadas neste incremento; não equivalem ao build integral do plano de 16.

```sh
node --conditions=react-server --import tsx --test tests/legal-text-persistence.test.ts
node --test tests/legal-text-actions.test.mjs
node --test tests/legal-text.browser.test.mjs
node --conditions=react-server --import tsx --test tests/user-additional-profiles.test.ts
node scripts/typecheck-build.mjs --partition 2
node scripts/typecheck-build.mjs --partition 10
```

Build integral atual continua pendente pelo bloqueio Windows/Turbopack registrado no CHECKPOINT. Não repetido integralmente neste incremento; não há resultado aprovado novo. Publicação somente de desenvolvimento na branch autorizada, mantendo a ressalva já informada. Sem PR final, merge, deploy manual ou acesso a banco produtivo.

### Backlog confirmado

| Requisitos | Estado após este incremento | Próximo trabalho |
| --- | --- | --- |
| 33.2/33.4/33.11/33.12 | Parcial | Integrar documento/original/anexos à norma/versão, autorização conjunta, download e integridade; reaproveitar GED atualizado. Não usar URL solta como evidência de vínculo. |
| 33.8/33.9 | Parcial | Cadastro/esferas existentes exercitados; completar documentos e consulta/versionamento na experiência jurídica integrada. Não considerar esses testes aprovação de todos os tipos de legislação/anexos. |
| 33.14 | Parcial, reforçado | Escrita já autorizada, UI condicionada e conflitos testados. Ainda testar autorização dos vínculos GED e fluxo integrado. |
| 33.15 | Dependência externa | Origem/aplicativo/base ainda não informados. Não inventar integração nem contratar serviços. |
| Sprint 04 | Pendente | Busca no corpo, palavras ignoradas, filtros, relações bidirecionais, revogações, impressão integral e comentários vinculados à norma/versão. Não recriar portal 33.6. |

Antes do PR final, também conciliar a migração CF10 renomeada na main, sem criar uma segunda migração para as mesmas tabelas. A documentação GED da main é inventário de código, não comprovação da migração aplicada, autorização integrada ou homologação nesta branch.
