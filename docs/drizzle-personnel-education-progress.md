# Drizzle — RH, SST, Educação e Portal do Servidor

## Situação da entrega

**Migração parcial, sem homologação integrada.** A remoção integral de Prisma neste escopo ainda não foi concluída. O inventário nominal é `docs/drizzle-personnel-education-inventory.json`; contém arquivos, linhas, imports legados, transações, referências SQL, dependências financeiras, consumidores externos e uso de metadados.

Snapshot de entrega em 28/10/2026: **298 arquivos de produção com dependência legada**, em 509 arquivos examinados. O inventário inicial tinha 343 arquivos legados; a retomada intermediária tinha 315. Arquivos sem referências diretas também podem chamar serviços ainda legados; o total não representa cobertura funcional completa.

| Raiz | Arquivos | Com referência/import legado |
|---|---:|---:|
| `src/lib/rh` | 69 | 54 |
| `src/lib/sst` | 61 | 34 |
| `src/lib/educacao` | 5 | 0 |
| `src/lib/portal-servidor` | 24 | 17 |
| `src/app/app-domain/rh` | 119 | 83 |
| `src/app/app-domain/sst` | 110 | 58 |
| `src/app/app-domain/educacao` | 34 | 1 |
| `src/app/app-domain/portal-servidor` | 58 | 27 |
| `src/app/portal-servidor` | 1 | 0 |
| `src/app/api/rh` | 9 | 8 |
| `src/app/api/sst` | 3 | 1 |
| `src/app/api/educacao` | 0 | 0 |
| `src/app/api/portal-servidor` | 16 | 15 |

Existem ainda arquivos de scripts/testes legados, relacionados nominalmente em `tools`. Alguns são consumidores intermodulares, de propriedade da sessão principal/outros responsáveis. O inventário inclui também `schemas` e `contracts`; não confunde mapeamentos novos com arquivos de produção legados.

## Cobertura implementada

### RH e SST

- Cálculos RH independentes do cliente gerado: `src/lib/rh/{calculation-engine,income-tax,consignment-margin,prorated-statement-locations,contract-timeline,monthly-proration,poc-special-payroll,payroll-pensions}.ts`.
- Contratos de vínculo, revisão, frequência e servidor do portal em `src/lib/contracts/personnel.ts`; consumidores pesquisados antes da troca dos tipos.
- Políticas SST em `src/lib/sst/{benefit-policy,functional-leave-policy}.ts` usam `src/db/decimal.ts`, incluindo os clones de precisão 40/48. Acesso em `src/lib/sst/{access,clinical-access}.ts` consulta grants explícitos por Drizzle.
- Mapeamentos próprios: `src/db/schema/{personnel-configuration,sst-access,sst-accidents}.ts`; consultas em `src/db/repositories/sst/access.ts`.
- A tabela `SstCatEvidence` foi mapeada a partir de `prisma/migrations-ibema/20261011030000_add_sst_accidents/migration.sql`; não consta do modelo Prisma atual.
- `src/app/app-domain/rh/servidores/actions.ts` usa Drizzle integralmente. `validateEmployeeRelations(tx, ...)`, identidade canônica, gravação e auditoria compartilham a transação. Lock `RH:employee:${id}`, retornos `{ success, error? }` e revalidações foram preservados. O helper canônico é o repositório compartilhado de Administração; o wrapper legado `rh/employee-person.ts` ainda atende o teste antigo de workforce.
- `src/lib/rh/role-legal-history.ts` recebe `DatabaseConnection`; action e todos os consumidores de teste localizados foram adaptados. Escopo integral do ente, locks de cargo/chave, replay por autor/hash, controle de versão, retificação temporal, locks `FOR SHARE`, validação GED e auditoria seguem na mesma transação. Mapeamento físico em `src/db/schema/personnel-legal.ts`; contrato de retorno em `contracts/personnel.ts`. Triggers aditivos existentes permanecem responsáveis pela integridade.

### Portal do Servidor

- `src/lib/portal-servidor/{access,birthday-service,own-accident,attendance-totals}.ts` migrados, com leitores em `src/db/repositories/portal-servidor/{identity,accidents}.ts`.
- O acesso contextual usa `context.database ?? db`, preservando fixtures e a assinatura pública. Identidade ativa, relações opcionais e ausência de grants continuam explícitas.

### Educação

- `s1-actions.ts`: aluno, responsável, período, matriz, componente, turma, vínculo docente, matrícula, movimentação, horários e Educacenso.
- `src/lib/educacao/enrollment-service.ts`: `enrollEducationStudent` e `moveEducationEnrollment` recebem `DatabaseTransaction`. As actions mantêm isolamento serializável, capacidade, unicidade, autoria e histórico na mesma conexão.
- Todas as **20 páginas TSX alteradas de Educação** usam leitores Drizzle. Incluem área do professor, documentos, pré-matrícula, biblioteca, alimentação, recursos escolares, transporte, suporte e os dois portais. As raízes JSX foram comparadas ao HEAD por AST e permaneceram iguais.
- `escolas/actions.ts` preserva formulário, mensagens, revalidação e redirect.
- `professor/actions.ts`: diário/chamada, fechamento/reabertura, avaliações, notas, publicação, registros pedagógicos, atividades/perguntas e correção. Publicação e criação aninhada preservam atomicidade; a escrita de notas continua item a item como no legado. Lint e sintaxe verificados.
- `s3-actions.ts`: PDF/histórico de emissão, abertura/solicitação/classificação/alocação de pré-matrícula e envio de atividades. Preservados protocolos, prioridades, substituição do histórico JSON, distinção entre alocação e matrícula definitiva, autorização do responsável e limpeza da correção ao reenviar.
- `s4-actions.ts`: biblioteca, cardápio/movimentação escolar, recursos escolares e transporte. Criação/devolução de empréstimo e exemplar continuam atômicos; renovação incrementa no SQL. Valores monetários permanecem strings NUMERIC(18,2), inclusive acima do limite inteiro seguro de JavaScript. Não foram adicionadas novas regras de disponibilidade ou alterados protocolos de concorrência existentes.
- `s5-actions.ts`: catálogo, liberação, tentativa interativa e suporte. Autorização por aluno/turma, comparação pt-BR e arredondamento da pontuação preservados.
- Serviços de domínio: `src/lib/educacao/{enrollment-service,pre-enrollment-service,library-service,interactive-service}.ts`, com executor/transação recebidos explicitamente.
- Mapeamentos em `src/db/schema/education-{core,teaching,admissions,operations,interactive}.ts`; leitores em `src/db/repositories/education/{core,admissions,teaching,operations,portals}.ts`; DTOs em `src/lib/contracts/education-{core,admissions,teaching,operations,portals}.ts`.

### Scripts próprios

- `scripts/seed-education-s1.ts` até `seed-education-s5.ts`, `scripts/verify-sst-migration-history.ts` e acesso ao banco de `scripts/restore-hr-foundation-bytes.mjs` migrados; não executados contra banco nesta tarefa. Seeds preservam chaves de conflito, identidade, conteúdo e criações aninhadas atômicas.
- `scripts/drizzle-inventory-personnel-education.mjs`: análise AST de referências/imports e metadados; geração somente do JSON de inventário. Comando: `node --max-old-space-size=192 scripts/drizzle-inventory-personnel-education.mjs --write --summary`.
- `scripts/drizzle-verify-personnel-education.mjs`: verificação somente de leitura de sintaxe e raízes JSX dos arquivos alterados do escopo.

## Evidências de verificação

- `node --max-old-space-size=256 --import tsx --test tests/drizzle-personnel-calculations.test.ts tests/education-s1.test.ts`: **7 testes aprovados**.
- `node --max-old-space-size=192 --test tests/hr-foundation-bytes.test.mjs`: **2 testes aprovados**.
- `tests/drizzle-personnel-calculations.test.ts`: precisão/arredondamento e regras de cálculo sem dependência Prisma.
- `node --max-old-space-size=256 --import tsx --test tests/drizzle-education-services.test.ts`: **9 testes aprovados** (suíte e oito subtestes). Usa o driver Neon/WS real em PGlite isolado; não acessa variáveis de banco externo. Fixture em `tests/helpers/personnel-education-fixture.ts`, com definições/índices/FKs extraídos de uma lista explícita de tabelas do SQL histórico e deltas de `Person` também históricos. Sem metadados de ORM.
- A suíte local cobre pré-matrícula/prioridade/espera/alocação, rollback do empréstimo/exemplar, renovação, reserva idempotente, autorização/nota interativa, publicação e ordem dos documentos, default histórico de `Grade.type`, precisão decimal, identidade/atribuição docente, relações opcionais, transporte e recorte do responsável/entregas.
- `tests/drizzle-personnel-education-database.test.ts`: duas suítes preparadas, **ainda não executadas**. Exigem `PERSONNEL_EDUCATION_TEST_DATABASE_URL`, sem fallback para `DATABASE_URL`. Cobrem capacidade, matrícula única, movimentação, autoria, rollback após FK inválida, datas/DTOs, identidade ativa, relações opcionais e grants ausentes.
- `node --max-old-space-size=192 scripts/drizzle-verify-personnel-education.mjs`: nenhuma falha sintática e **20 páginas com JSX idêntico ao HEAD**. ESLint direcionado aprovou os schemas, leitores, serviços, actions, páginas e testes novos/revistos; a primeira tentativa de um lote excedeu 30s, e o lote seguinte passou com timeout de 120s.
- `tests/hr-role-legal-history.test.ts`: adaptado ao contrato Drizzle de C7 e do writer legal, usando `connectFinanceDrizzleFixture(f.pg)` na mesma fixture e encerrando a conexão antes do banco. **Execução não aprovada ainda**: o comando sem `--conditions=react-server` bloqueou no import `server-only`; com a condição correta, a fixture compartilhada excedeu o heap limitado de 256 MB. Não foi ampliada a carga; validação fica para a sessão principal.

Build, typecheck integrado, testes amplos e execução de DDL/seeds são coordenados pela sessão principal. Nenhum commit/push foi realizado por esta frente.

## Handoffs e dependências externas

O array `externalConsumers` do inventário contém os caminhos e imports completos. Pontos que exigem coordenação antes de trocar assinaturas:

- Autenticação: `src/app/api/auth/portal-servidor/session/route.ts` chama `assertEmployeePortalLogin` de `src/lib/portal-servidor/login-policy.ts`, ainda Prisma.
- Financeiro: `src/lib/financeiro/index.ts` chama `provision-accounting` e `municipal-advances`; `allowance-expense-refunds.ts` chama `travel-allowance`/`workforce-service`; `cost-payroll-slices.ts` chama os cálculos já independentes. Transações RH/Financeiro devem migrar inteiras, com `DatabaseTransaction`/`DatabaseExecutor`; não usar duas conexões/ORMs na mesma operação lógica.
- Saúde: `src/lib/saude/tfd-transport-service.ts` chama `travel-allowance`.
- Processos: `src/app/app-domain/protocolos/actions.ts` chama `travel-process`.
- Transparência/controle: `src/lib/transparencia/{native-domain-provider,native-personnel-counts}.ts`, `src/lib/c7/workforce-statistics.ts` e API de estatísticas RH. Compatibilidade dos DTOs decimais/timeline com consumidores remanescentes precisa da checagem integrada.
- Handoff C7 aplicado em `tests/hr-role-legal-history.test.ts`: as quatro leituras de `readControlWorkforceStatistics` recebem `drizzle.connection`, preservando ator, filtros e expectativas do DTO. O especialista C7 mantém ownership do serviço/leitor, páginas/APIs e seu teste próprio.
- Portais externos: concursos (ações, listagem e editais), convenentes (descontos), departamentos (atestados), validação de emissões e recibos. Esses arquivos estão fora do escopo exclusivo.
- Download compartilhado: `src/app/api/download/route.ts` consome acesso SST e `aso-flow-access`.

Conexão, contexto de tenant, writers compartilhados, package/build/CI/tsconfig e documentação global pertencem à sessão principal. Alterações concorrentes nesses arquivos não foram sobrescritas.

## Pendências nominais

1. Educação: resta somente `src/app/app-domain/educacao/merenda/actions.ts`, com criação intermodular de `Expense`. Coordenar a migração desse writer com Financeiro; o formulário conserva `Promise<void>`/erros lançados e redirect. As demais actions, páginas e seeds S1–S5 deste domínio não têm referências diretas ao cliente legado.
2. RH, SST e Portal: todos os arquivos marcados `legacyReference`/`legacyImport` no inventário continuam pendentes; não há camada de simulação de Prisma.
3. Substituir DMMF em `tests/hr-workforce-service.test.ts` e `tests/employee-portal-final-services.test.ts` por fixtures explícitas baseadas no SQL histórico. Metadados globais relacionados estão em `globalMetadataConsumers`, para coordenação.
4. Conferir todas as constraints dos mapeamentos novos no baseline integrado. O default físico `Grade.type = 'AvaliaÃ§Ã£o'` foi confirmado e exercitado na fixture; não foi normalizado silenciosamente. São mapeamentos runtime, não baseline DDL completo.
5. Rodar as suítes PostgreSQL em destino dedicado confirmado e a verificação integrada de consumidores/tipos pela sessão principal.
