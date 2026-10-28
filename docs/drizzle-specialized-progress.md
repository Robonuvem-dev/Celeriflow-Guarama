# Especializados — migração Drizzle

## Entrega e limite atual

Responsável: sessão especializada. Escopo: `cultura`, `camara`, `seguranca`, `controle-interno`, `src/lib/security`, `src/lib/c7`, persistência/contratos próprios e APIs/testes/scripts correspondentes.

**Frente especializada implementada, incluindo os dois residuais C7.** Não há referências Prisma diretas em `src/lib/c7`, nas quatro pastas de aplicação ou nas APIs Controle. As consultas Ouvidoria/Judicial foram migradas pelo proprietário Processos. O parent confirmou aprovação dos testes `municipal-diagnostics` e `workforce-statistics`, além dos novos contratos financeiros/Portal/cross-domain. A validação global continua centralizada no parent.

Atualização visual do proprietário informada pelo parent: origem `0831a93`, merge aberto. Nenhum arquivo de layout/dashboard foi editado por esta sessão após o aviso; nenhuma operação Git foi executada depois dele. A finalização do merge pertence ao parent.

## Implementado

| Domínio | Cobertura |
| --- | --- |
| Cultura | Actions de agentes, espaços, eventos e reservas; fomento decimal; dashboard; consultas de gestão, projetos, eventos, reservas, esporte/lazer, documentos e conselhos/fundos. |
| Câmara | Actions legislativas; consultas de legislaturas, vereadores/gabinetes/mesa, sessões/atas/proposições, comissões/membros, leis e audiências; dashboard e portal. |
| Segurança/Mobilidade | CRUD e ativação; sequência anual; mapeadores e listagens; dashboard, guardas, ocorrências e trânsito; talão eletrônico com `numeric(18,2)`. |
| Controle Interno | Planos, apontamentos, pareceres, checklist, diagnóstico bancário do checklist, notificações, auditorias, agenda/alertas/cron, relatório de fatos e relatório circunstanciado (edições, bytes finais, assinatura e publicação), diagnósticos municipais das quatro famílias e estatísticas funcionais históricas. Dashboard, actions, página RH e rotas desses serviços. |

Persistência nova:

- `src/db/schema/{chamber,culture,security-mobility,internal-control}.ts`: 29 tabelas mapeadas.
- `src/db/repositories/chamber/queries.ts`.
- `src/db/repositories/culture/{queries,reservations}.ts`.
- `src/db/repositories/security-mobility/{queries,commands}.ts`.
- `src/db/repositories/internal-control/{records,references,dashboard,diagnostics,workforce}.ts`.
- `src/lib/contracts/{chamber,culture,security-mobility,internal-control}.ts`.

Serviços C7 migrados:

`operations-service.ts`, `control-checklists.ts`, `control-notifications.ts`, `control-audits.ts`, `control-agenda.ts`, `control-agenda-cron.ts`, `control-report.ts`, `circumstantiated-report.ts`, `municipal-diagnostics.ts` e `workforce-statistics.ts`.

APIs Controle adaptadas:

`planos/[id]`, `agenda`, `agenda/alertas-periodicos`, `relatorios-finais/[id]` e `estatisticas-rh`.

`src/lib/security/icp-brasil.ts` foi inventariado: já não dependia de Prisma.

## Contratos e invariantes

### Conexão e transações

- Comandos mutáveis C7 recebem `DatabaseConnection`; usam `withDatabaseTransaction` e encaminham a mesma `DatabaseTransaction` aos repositórios/auditoria.
- `buildControlReport` também recebe **`DatabaseConnection`**, pois mantém snapshot `repeatable read`. Não passar somente `db` a essa função.
- `runMunicipalControlDiagnostics` e `readControlWorkforceStatistics` recebem **`DatabaseConnection`** e usam `withDatabaseTransaction` com `isolationLevel: "repeatable read"` e `timeoutMs: 60000`. Todos os repositórios e helpers intermodulares recebem a mesma `tx` do snapshot.
- `readControlAgenda`, `readFrozenControlReportBytes`, `controlAgendaCronScope` e leitores dos repositórios recebem `DatabaseExecutor`.
- Exportações transacionais explícitas para composição na mesma conexão:
  - `createInternalControlFindingInTransaction`;
  - `resolveInternalControlFindingInTransaction`;
  - `transitionInternalControlPlanInTransaction`;
  - `sendControlNoticeInTransaction`;
  - `respondControlNoticeInTransaction`;
  - `reviewControlNoticeResponseInTransaction`;
  - `buildControlReportInTransaction`.
- As variantes acima exigem `DatabaseTransaction`; o chamador controla commit/rollback e isolamento. O script Aurora usa uma única transação `serializable`, incluindo impressão e rollback do ensaio.
- Mantidos locks de plano/apontamento, replay com conteúdo conferido, segregação de destinatário/auditor/controlador, memória aditiva e auditoria na mesma transação das escritas.

### Cultura/Portal

`createCultureSpaceReservation(tx, input)` em `src/db/repositories/culture/reservations.ts` está disponível com o mesmo input da reserva compartilhada. Preserva:

- solicitante PF/PJ único e ativo, espaço disponível e evento ativo;
- período válido e colisão estrita `startsAt < endsAt` / `endsAt > startsAt`, permitindo períodos contíguos;
- advisory lock transacional `CULTURA_RESERVA:${spaceId}`;
- estados impeditivos `Solicitada`/`Aprovada` e observação de origem/protocolo.

Na releitura final, o proprietário de Portal já adaptou `src/lib/portal-cidadao/space-reservations.ts`: `createScopedSpaceReservation(tx: DatabaseTransaction, input)` delega diretamente ao repositório cultural. A validação dos consumidores Portal pertence à integração desse proprietário.

### Precisão, JSON e DTOs

- `CulturalIncentiveProject` e `TrafficInfractionTicket` usam `Decimal` independente e `numeric(18,2)`. Campos originalmente Float foram preservados como Float.
- Sequência de Segurança usa upsert parametrizado em `SequenceCounter`; reserva do código e inserção estão na mesma transação, com inicialização pelo maior código do ano.
- IDs seguem `createId`; datas de colunas Drizzle permanecem `Date`; JSON de relações tem DTOs reduzidos, sem prometer timestamps `Date` dentro de `to_jsonb`.
- Projeções culturais revisadas para refletir campos efetivamente selecionados: agentes aninhados, patrimônio, documentos, pessoas/empresas e instrutores. Datas principais são serializadas nos mesmos consumidores das páginas.
- Relatório circunstanciado reutiliza `digitalCertificates` do schema GED e `transparencyPublications` do schema Transparência. O PDF final é persistido e baixado pelos mesmos bytes/hash.
- A consulta documental cultural usa a tabela física `"Folder"`.
- Retornos das Server Actions client permanecem `{ error?: string }`/contratos existentes. JSX e CSS não foram reescritos.

## Testes e script adaptados

- `src/lib/c7/__tests__/{control-scope,control-checklists,control-notifications-agenda,control-audits,circumstantiated-report}.test.ts` agora usam a fixture Drizzle dedicada.
- `tests/helpers/control-drizzle-fixture.ts`: fixture PGlite isolada sobre `createLocalDrizzleDatabase`, driver Neon/Drizzle real, SQL explícito e guardas de auditoria/relatório provenientes das migrações SQL existentes. Não usa Prisma, cast de cliente nem simulação de ORM. A referência textual `prisma/migrations-ibema` é somente o caminho dos arquivos SQL históricos.
- Os asserts de falha de trigger percorrem `Error.cause`, pois o driver Drizzle encapsula a mensagem PostgreSQL.
- `operations-service.test.ts` já testa validação sem banco e permanece compatível.
- `scripts/verify-aurora-control-journey.ts` foi migrado para conexão Drizzle e variantes `*InTransaction`, removendo o antigo Proxy Prisma. Não foi executado.
- `tests/drizzle-specialized.test.ts`: agora executável localmente, sem URL dedicada, variável de ambiente ou `skip`. Preserva reserva/colisão/fronteira, relações/datas, código/ID, precisão acima do inteiro seguro, JSON, escopo vazio e rollback.
- `tests/helpers/specialized-drizzle-fixture.ts`: usa `createLocalDrizzleDatabase` com driver Neon/Drizzle real e pool limitado a uma conexão; faz replay sequencial dos 156 diretórios de SQL histórico em `prisma/migrations-ibema`, preservando joins completos, índices, FKs e triggers reais. Fecha banco/transporte e restaura a configuração Neon tanto no sucesso quanto na falha de preparo; informa o diretório SQL causador de falhas. Não usa cliente Prisma, DMMF, casts de tipo ou schema gerado do mapeamento novo.
- No teste especializado, `ConfiguracaoPerfil` e `Usuario` são inseridos dentro da transação de rollback; `ownerId`, `actorId` e `actorUsuarioId` usam o ID desse usuário, distinto da pessoa cultural. A auditoria é escrita pelo repositório real na mesma `tx`. Os asserts verificam SQLSTATE/constraint através de `Error.cause`: `23505` / `SegurancaGuarda_matricula_key` para duplicação e `23503` / `AuditEvent_actorUsuarioId_fkey` para pessoa sem usuário. O savepoint de Controle exige a identidade do erro sentinela após inserir evento/auditoria, e verifica restauração do plano e remoção das escritas. O rollback externo confere também registros culturais, guarda, talão, contador, eventos, auditoria e identidades.
- A versão antiga do teste especializado ficou **SKIP** por ausência da URL dedicada. Após a adaptação autônoma, o parent confirmou **PASS dos cinco testes especializados com heap de 512 MiB**. O SKIP antigo não é o resultado da versão atual.
- `src/lib/c7/__tests__/workforce-statistics.test.ts` agora usa `tests/helpers/control-workforce-fixture.ts`, derivada da fixture C7 real. Preserva pessoas distintas/multivínculos, referência histórica, cargo inativo, enquadramento, relatório e recusas de escopo/ano; acrescenta transferência atual para fora do ente sem perder a elegibilidade histórica. **PASS informado pelo parent.**
- Novo `src/lib/c7/__tests__/municipal-diagnostics.test.ts` com `tests/helpers/control-diagnostics-fixture.ts`: quatro famílias, soma Decimal de empenho/reforço/anulação e tributo/pagamento/compensação, fonte negativa, mínimo sem configuração como `NOT_EVALUATED`, recusa de escopo parcial/controlador divergente, replay, chave divergente, deduplicação e rollback de achados/evento. Usa os helpers Financeiro/Tributação de produção. **PASS informado pelo parent.**

## Handoff intermodular final

### 1. Diagnósticos municipais — Financeiro/Tributação

`src/lib/c7/municipal-diagnostics.ts` está migrado. Assinatura: `runMunicipalControlDiagnostics(connection: DatabaseConnection, actor, { planId, financialYearId, fiscalThrough: Date, idempotencyKey }): Promise<ControlEvent>`; actor e evento de retorno mantêm os DTOs anteriores independentes de ORM.

Contratos externos já encontrados na árvore e utilizados com a mesma `DatabaseTransaction`:

- `resolveFinancialReportScope(db: DatabaseExecutor, financialYearId, scope)` em `src/lib/financeiro/report-scope.ts`;
- `readMunicipalFiscalIndex(tx: DatabaseExecutor, actor, input)` em `src/lib/financeiro/fiscal-indices.ts`;
- overload `taxAssessmentCompensatedValue(db: DatabaseExecutor, assessmentId): Promise<Decimal>` e `taxScopeSnapshot` puro em `src/lib/tributacao/scope.ts`. O helper externo conserva overload legado para outras unidades; C7 utiliza somente o ramo Drizzle.

`src/db/repositories/internal-control/diagnostics.ts` implementa consultas explícitas parametrizadas de empenhos/movimentos, fornecedores, contribuintes/lançamentos/pagamentos/dívida, contratos e tesouraria. Valores `numeric` são lidos como texto e convertidos para `Decimal`, sem passagem por `Number`; `Contract.updatedValue` permanece Float cadastral, com a mesma validação/representação em evidência. Mantidos snapshot `repeatable read`, lock do plano, quatro famílias, `NOT_EVALUATED`, checagem de ente/UG completos, idempotência, deduplicação de achados e auditoria atômica. `runMunicipalDiagnosticsAction` usa `databaseConnection`, lê módulos via Drizzle e conserva `Promise<{ error?: string }>`.

### 2. Estatísticas funcionais — Financeiro/RH

`src/lib/c7/workforce-statistics.ts` está migrado. **Assinatura para o proprietário RH:** `readControlWorkforceStatistics(connection: DatabaseConnection, actor: CostActor, raw: z.input<typeof workforceStatisticsInput>)`. Retorno e `controlWorkforceStatisticsReport(data)` conservados. O primeiro argumento exige conexão completa, não somente `DatabaseExecutor`.

Contratos usados na mesma transação: `assertCostScope(tx: DatabaseExecutor, actor, financialYearId, budgetUnitId?, completeEntity?)` do Financeiro e `resolveContractRevision` puro com `EmploymentContract`/`EmploymentRevision` independentes de ORM do RH. O arquivo externo `cost-ledger.ts` ainda contém operações legadas de seu proprietário; C7 não chama essas operações.

Consumidores especializados migrados juntos:

- `src/app/app-domain/controle-interno/consultas/rh/page.tsx`;
- `src/app/api/controle-interno/estatisticas-rh/route.ts`;
- `src/lib/c7/__tests__/workforce-statistics.test.ts`;
- `tests/helpers/control-workforce-fixture.ts`.

Preservados referência histórica/revisões, pessoas distintas vs. multivínculos, memória legal de cargos, recorte de centros/UGs e snapshot `repeatable read`. `src/db/repositories/internal-control/workforce.ts` seleciona candidatos atuais ou historicamente vinculados aos centros autorizados e o serviço revalida o centro na revisão escolhida.

`tests/hr-role-legal-history.test.ts` pertence ao proprietário RH e não foi editado nesta etapa. Na releitura final, ele já usa `readControlWorkforceStatistics(drizzle.connection, ...)`; a integração/execução desse teste continua com RH/parent.

### 3. Consultas Ouvidoria/Judicial — Atendimento/Processos

- `src/app/app-domain/controle-interno/consultas/ouvidoria/page.tsx` foi transferida a Processos: na releitura final usa `ombudsmanScopeCondition`, projeções Drizzle e snapshot `repeatable read`.
- `src/app/app-domain/controle-interno/consultas/judicial/page.tsx` foi transferida a Processos: na releitura final usa `judicialCaseWhere` como condição Drizzle, repositórios explícitos e snapshot `repeatable read`.

Esta sessão não editou essas páginas na etapa residual C7. Validação de filtros, autorização, ente/UG, confidencialidade, contagem/agrupamentos e paginação pertence ao proprietário Processos/parent.

### 4. API pública Transparência — consumidor integrado pelo proprietário

Na releitura final, `src/app/api/transparencia/publicacoes/[publicKey]/route.ts` já chama `readFrozenControlReportBytes(db, finalId)` e não importa Prisma. Esta sessão não editou a rota nessa etapa.

A função especializada exige `DatabaseExecutor`. `getTransparencySettings(db)` já foi integrado no serviço de relatórios desta sessão. A validação da rota pública pertence a Processos/Transparência e parent.

### 5. Câmara/Planejamento

Wrappers de `src/app/app-domain/camara/planejamento` não têm referências diretas Prisma, mas delegam ao núcleo `src/lib/planejamento`, cuja migração pertence ao agente Financeiro/Planejamento. Preservar a jurisdição `LEGISLATIVE` nas integrações do núcleo.

## Verificações executadas

1. **ESLint delimitado anterior** dos quatro schemas, oito repositórios, quatro contratos, oito serviços C7 então migrados, quatro pastas de aplicação e APIs Controle: **0 erros**; um warning preexistente `_key` em `ControlAuditsClient.tsx:22`.
2. **ESLint do último lote** (serviços alterados, testes C7, fixture, script Aurora e revisão cultural): **0 erros e 0 warnings**.
3. **Comparação estática de schema**: 29 tabelas conferidas contra os campos escalares de `prisma/schema.prisma`, sem divergências de nomes, nullability, campos mapeados e precisão/escala numeric. Verificação em memória, sem banco/DDL.
4. **Parse TypeScript leve**: 37 arquivos de persistência/contratos/C7/testes/script na entrega anterior e os 11 arquivos da conclusão residual C7, sem erros sintáticos. Não equivale a typecheck semântico.
5. **Comparação JSX por AST** antes da atualização visual informada pelo parent: 69 arquivos TSX nas quatro pastas, sem diferença de JSX contra a base local, normalizando CRLF e apagando asserções exclusivamente de tipo. Não repetir essa comparação contra uma base anterior ao merge visual para inferir regressão do proprietário.
6. **ESLint da conclusão residual C7**: dois serviços, dois repositórios, action, página/API RH, dois testes C7 e duas fixtures dedicadas — **0 erros e 0 warnings**.
7. Grep final: nenhuma referência Prisma direta em `src/lib/c7`, nas quatro pastas `src/app/app-domain/{cultura,camara,seguranca,controle-interno}`, nas APIs Controle ou no script Aurora. Bibliotecas externas podem manter código legado fora dos contratos Drizzle utilizados por C7; essa migração continua com os respectivos proprietários.
8. **Retorno de execução do parent:** oito novas suítes aprovadas, incluindo `municipal-diagnostics`, `workforce-statistics` e contratos financeiros/Portal/cross-domain. Posteriormente, os **cinco testes especializados autônomos também passaram centralmente com 512 MiB**.
9. **Adaptação autônoma especializada:** ESLint dos dois arquivos de teste/helper com **0 erros e 0 warnings**; parse TypeScript com **0 erros sintáticos**; contagem estática confirmou 156 diretórios SQL. Nenhuma execução PGlite, build ou tsc realizada nesta etapa. Alterações restritas a `tests/drizzle-specialized.test.ts`, `tests/helpers/specialized-drizzle-fixture.ts` e este relatório.

Nenhuma instalação, execução de build/typecheck pesado/suíte de banco, aplicação de DDL, seed, commit ou push foi feita nesta sessão.

## Extensão exclusiva — 13 seeds/checks executáveis

Lista inteira migrada individualmente, com leitura própria antes da edição:

- `prisma/seed-camara.ts`;
- `prisma/seed-cultura.ts`;
- `prisma/seed-seguranca.ts`;
- `prisma/seed-mod3.ts`;
- `prisma/seed-mod4.ts`;
- `prisma/check-mod4.ts`;
- `prisma/seed-mod5.ts`;
- `prisma/seed-mod6.ts`;
- `prisma/seed-modulo12.ts`;
- `prisma/seed-modulo13.ts`;
- `prisma/seed-modulo14.ts`;
- `prisma/seed-obras.ts`;
- `prisma/seed-patrimonio.ts`.

Todos usam conexão Drizzle real de `createDatabaseConnection`, schemas explícitos e/ou SQL parametrizado. Não restam importações/clientes/tipos Prisma nem DMMF nos 13 arquivos. Mantidos o carregamento de dotenv de cada fonte, dados sintéticos, fórmulas/aleatoriedade, códigos/CPFs/CNPJs, datas explícitas, ordem das operações, campos distintos de criação/atualização, `createdAt` explícito de Patrimônio e os blocos de tratamento/encerramento. Onze arquivos mantêm o `.finally` original, agora com `connection.pool.end()`; Câmara e Segurança mantêm a ausência desse bloco. Os `create` originalmente repetíveis continuam repetíveis; os caminhos de consulta/criação e upsert conservam suas chaves.

### Persistência e atomicidade dos seeds

- Reutilizados os mapeamentos dos respectivos proprietários, sem editar seus arquivos de domínio.
- `prisma/specialized-seed-finance.ts`: cinco projeções mínimas exclusivas dos seeds para escrita de `BudgetUnit`, `ResourceSource`, `ExpenseNature`, `BudgetAppropriation` e `Commitment`. Conferidas contra o SQL histórico; mantêm os campos Float originais e deixam os demais defaults físicos com o banco. As projeções financeiras existentes de Compras são somente leitura e não fornecem defaults de escrita.
- `seed-modulo13.ts`: três mapeamentos físicos locais mínimos para `MedicineBatch`, `Vaccine` e `VaccinationRecord`, ausentes dos schemas de escrita existentes. Nenhum bootstrap Prisma/adapter próprio permanece.
- Câmara: cada comissão e seus membros são inseridos na mesma transação. Mantidos os `catch` de mesa/pareceres, a ausência de idempotência das comissões/pareceres e os upserts vazios sem atualizar o registro existente. Votações e pareceres usam SQL parametrizado sobre as tabelas históricas.
- Cultura: preservados updates parciais, valores financeiros Float, consultas de referência e as quatro chaves compostas dos vínculos documentais, estes por SQL parametrizado.
- Obras: os itens de solicitação/processo são criados apenas quando o pai é criado, dentro da mesma transação; a atualização do pai não recria itens. Débito de estoque e movimento usam a mesma `tx`, com decremento SQL atômico; mantida a verificação de movimento anterior e os vínculos compostos de equipe/servidor/equipamento/documento/compra/material.
- Patrimônio: empresa/fornecedor, requisição/item e inventário/item mantêm atomicidade por operação aninhada. Mantidos os 1.020 materiais, 310 bens, distribuição de saldos, lotes, 20 requisições condicionais e a criação repetível de inventários/baixas/ajustes.
- `check-mod4.ts`: mantém os campos completos de pastas, `_count.documents`/`_count.children` e a projeção reduzida de documentos.

### Adequações ao DDL atual

- Cultura/Obras conservam a busca original de exercício por `year: 2026`, sem inventar ente. O SQL histórico atual removeu a unicidade global de ano e possui chave ente/ano e índice parcial legado; por isso a consulta e a criação/atualização ficam em uma transação com o mesmo advisory lock `SPECIALIZED_SEED_FINANCIAL_YEAR:2026` nos dois seeds. Não se usa `ON CONFLICT (year)` inválido no catálogo atual.
- O fallback antigo de Patrimônio tentava criar `Usuario` com `name`/`role`, campos inexistentes no DDL. Agora preserva nome/email e o reaproveitamento do primeiro usuário existente; se precisar criar o administrador, usa `nome` e o `perfilId` do perfil `SYSTEM_ADMINISTRATOR` já criado por `seed-perfis.ts`. Se esse pré-requisito estiver ausente, informa explicitamente a necessidade de executar o seed de perfis. Não há cast nem coluna simulada.

### Verificação leve desta extensão

- ESLint final dos 13 arquivos, mapeamento financeiro e teste AST: **15 arquivos, 0 erros, 0 warnings**; parse e resolução estática dos imports dos seeds/mapeamento: **14 arquivos, 0 problemas**.
- Comparação AST com cópia dos 13 originais preservada antes das edições, sem Git: **275 payloads diretos de criação/atualização equivalentes**. Compara expressões de dados, separando criação de update; os desdobramentos aninhados, decremento SQL, usuário físico e os seis modelos escritos por SQL tiveram revisão própria.
- Conferência offline das escritas contra as colunas dos schemas realmente importados: **1.181 referências, 0 colunas desconhecidas ou obrigatórias ausentes nos payloads literais completos**. Apenas mapeamentos foram importados; nenhum seed foi importado/executado.
- Conferência de **83 alvos Drizzle de conflito** contra os índices únicos históricos, considerando criação/remoção na ordem das migrações: **0 divergências**. Os **13 ciclos de encerramento de pool** também coincidem com a presença/ausência de fechamento nas fontes originais; varredura final de sintaxe e dependências Prisma sem problemas.
- Novo `tests/drizzle-specialized-seed-data.test.ts`: fingerprints obtidos dos originais para **130 expressões** de arrays literais, fórmulas de geração e entradas dos helpers locais em nove arquivos. Tokens preservam os literais; comentários/formatação não afetam o resultado. **9 PASS, 0 FAIL, 0 SKIP**, executados com heap de **256 MiB**, sem banco, env ou importação dos seeds. Esse teste cobre as fontes de dados/geração; não substitui execução contra PostgreSQL.
- Nenhum seed local/remoto, PGlite, typecheck pesado, build, Git, configuração Neon ou arquivo compartilhado de infraestrutura foi executado/alterado nesta extensão.

**Para a nova gate do parent:** incluir TypeScript executável de `prisma/` (inclusive `specialized-seed-finance.ts`), embora o diretório tenha nome histórico. Os SQL de `prisma/migrations-ibema/` continuam sendo histórico autoritativo. `seed-data.ts`, `seed-modulo2.ts`, `seed-perfis.ts` e `bootstrap-test/seed.ts` pertencem aos demais responsáveis e não foram editados por esta frente.

## Execução sequencial pelo parent

```powershell
node --import tsx --test --test-concurrency=1 src/lib/c7/__tests__/operations-service.test.ts src/lib/c7/__tests__/control-scope.test.ts src/lib/c7/__tests__/control-checklists.test.ts src/lib/c7/__tests__/control-notifications-agenda.test.ts src/lib/c7/__tests__/control-audits.test.ts src/lib/c7/__tests__/circumstantiated-report.test.ts src/lib/c7/__tests__/workforce-statistics.test.ts src/lib/c7/__tests__/municipal-diagnostics.test.ts
```

Teste especializado autônomo local, já aprovado centralmente pelo parent; não exige configuração de ambiente:

```powershell
node --max-old-space-size=512 --import tsx --test --test-concurrency=1 tests/drizzle-specialized.test.ts
```

Teste AST exclusivo dos dados sintéticos dos seeds, sem execução de persistência:

```powershell
node --max-old-space-size=256 --import tsx --test --test-concurrency=1 tests/drizzle-specialized-seed-data.test.ts
```

Build/typecheck e `test:unit` globais pertencem ao parent, incluindo o teste RH compartilhado, os seeds migrados e os demais núcleos concorrentes. Os PASS especializados/C7 acima foram informados pelo parent; o novo teste AST dos seeds foi executado nesta sessão.
