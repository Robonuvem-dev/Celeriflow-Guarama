# Sprint 03 — CF33, cadastro e documentos

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
