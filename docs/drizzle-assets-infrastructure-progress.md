# Drizzle — Patrimônio, Obras, Iluminação e Construção Civil

## Base e coordenação

- Base inspecionada: `5cfa75dfe20a6d3fcc20dce33e818585cb8b9954`; árvore limpa na primeira conferência desta sessão.
- Lidos `AGENTS.md`, planejamento integral, contratos/status e guias Next 16.2 de Server Actions e Route Handlers.
- Responsabilidade limitada às pastas atribuídas na solicitação. Cliente/contexto, writers compartilhados, manifesto/build/CI/tsconfig e documentos globais pertencem à sessão principal.
- Não executar instalações, build/checagem ampla, DDL/carga Neon, commit ou push nesta sessão.
- Preservar `construction-lifecycle-list.ts` e filtros previamente migrados, JSX/CSS, ações de formulário e retornos aguardados pela UI.
- Redistribuição exclusiva vigente: toda a frente de Frotas (runtime, APIs, schemas/repositories, scripts e testes atribuídos) pertence à nova frente do parent. Este agente mantém os exports de estoque/valorização/custódia. `prisma/seed-obras.ts` e `prisma/seed-patrimonio.ts` pertencem ao AgentEspecializados.
- `src/app/api/download/route.ts`, repository `platform/downloads` e seus testes pertencem exclusivamente ao parent. Os três helpers urbanísticos agora aceitam `DatabaseExecutor`; o DTO de carimbo contém `JsonValue` independente, `Date` e nulabilidade preservada.
- A sessão profissional em `src/app/api/auth/construcao-civil/session/route.ts` pertence a esta frente e já foi migrada, junto da consulta de identidade usada pelo portal.
- Transferência exclusiva posterior: todos os `.tsx` de `src/app/app-domain/obras/**`, `repositories/works-pages/**`, `contracts/works-pages.ts` e `schema/works-pages.ts` pertencem à frente Ferramentas/bootstrap. Nenhum desses arquivos foi editado nesta rodada. O inventário consolidado abaixo observa também o progresso concorrente desses TSX.

## Contratos intermodulares para a sessão principal

Todos os consumidores foram localizados antes da migração das assinaturas. O destino é `DatabaseTransaction` para operações em uma transação e `DatabaseConnection` para serviços que a iniciam. Não é permitido passar uma transação Prisma para os novos helpers.

- `applyStockMovement` e `reverseStockMovementInTransaction`: Compras (`procurement-lifecycle.ts`), Saúde (`clinical-extension-service.ts`, `health-stock-service.ts`, `pharmacy-request-service.ts`, `pharmacy-kit-service.ts`, `pharmacy-dispensation-service.ts`, `specialized-care-service.ts`, `vaccination-stock-service.ts`, `vaccination-service.ts`) e SST (`equipment-service.ts`). Migrar integralmente as transações desses consumidores com os respectivos agentes.
- `nextMaterialCode`: `src/lib/compras/shared-catalog.ts`; `recordEquipmentCustody`: `src/lib/compras/procurement-lifecycle.ts`.
- Financeiro deve manter nomes e semântica de `assertCostScope`, `recordStockMunicipalCosts`, `reduceStockMunicipalCosts`, `assertAccountingPeriodOpen`, `postAccountingEventInTransaction`, `postAccountingTransactionInTransaction`, `cancelMunicipalCostSource` e depreciação. Receber a mesma transação Drizzle e valores `Decimal` independentes; o movimento preserva todas as propriedades físicas/monetárias e datas.
- Tributação: `construction-taxation.ts` já passa sua `DatabaseTransaction` diretamente a `generateTaxGuideInTransaction`, importado da mesma origem `@/lib/tributacao`. A emissão inteira da Construção foi convertida com o contrato futuro solicitado pelo parent. O owner tributário precisa concluir a implementação compartilhada; não há adaptador, cast de transação, overload local ou conexão alternativa.
- GED/Processos/notificações: produtores Obras/Frotas não podem chamar writers Prisma com `DatabaseTransaction`. Os nomes públicos e evidências/histórico precisam ser preservados na integração.

## Inventário inicial por pasta

| Pasta | Arquivos | Arquivos com referências/acessos Prisma |
|---|---:|---:|
| `src/lib/patrimonio` | 17 | 16 |
| `src/lib/frotas` | 20 | 18 |
| `src/lib/obras` | 42 | 29 |
| `src/app/app-domain/patrimonio` | 57 | 32 |
| `src/app/app-domain/frotas` | 16 | 2 |
| `src/app/app-domain/obras` | 73 | 44 |
| `src/app/app-domain/iluminacao-publica` | 4 | 2 |
| `src/app/api/patrimonio` | 3 | 3 |
| `src/app/api/frotas` | 9 | 3 |
| `src/app/portal/construcao-civil` | 16 | 10 |
| `src/app/portal/frota` | 5 | 1 |

Não existem pastas `src/app/api/obras` e `src/app/api/iluminacao-publica` nesta base. O inventário inclui referências de teste e não certifica conclusão funcional.

## Progresso e validação

### Cobertura implementada

- Serviços de produção de `src/lib/patrimonio`: estoque, valorização, consumo contábil, inventário, identificadores, custódia, aquisição, operações, ciclo de vida e estorno migrados.
- Actions e leituras patrimoniais migradas, incluindo os consumidores de requisições após a disponibilização do contrato Drizzle por Compras. As três APIs patrimoniais estão migradas.
- Actions urbanas de Obras e leituras de serviços, projetos, medições, documentos, dashboard, relatórios e máquinas/equipes migradas. As duas consultas operacionais de Iluminação usam a projeção Drizzle compartilhada e preservam o JSX integrado.
- `seed-warehouse-review.ts` e `seed-patrimony-workflows-review.ts` migrados; nenhum seed executado. O segundo usa `nextYearlyCodeDrizzle({ db: tx, ... })` dentro da transação inteira da base e passa `DatabaseConnection` aos workflows de Compras e Patrimônio.
- Cinco FKs corrigidas exclusivamente no mapping conforme catálogo físico do parent: `MaterialStockValuationEvent.valuationId`, `.movementId`, `MaterialStockValuation.stockId`, `MaterialSubcategory.categoryId` e `Material.subcategoryId` usam `onUpdate: "no action"`.
- Construção: criação/publicação de carimbo inteiras em Drizzle, preservando locks, replay, evidência do deferimento, original imutável, assinatura exata e auditoria. APIs de download do documento publicado, cópia derivada e validação pública migradas; uploads/complementos, comunicação e notificações do portal também migrados.
- Leituras das telas documental interna/portal, layout do carimbo, lista de solicitações do portal, identidade e sessão profissional migradas. O inventário direto atribuído está sem código legado; a composição com os writers compartilhados e os tipos continua sujeita à validação central.
- Viabilidade automática e os três consumidores de produção do portal migrados integralmente. Autorização, participação com início vigente, habilitação de construtora, cálculo, snapshots, GED, encaminhamento de assinatura e evento usam uma única transação Drizzle. O DTO deriva do mapping e conserva a árvore JSON temporal/Decimal normalizada.
- Motor de exportação e seis APIs adicionais migrados: geração/validação do lote, download do lote, recibo (gravação/download), extração/download de prancha e abertura do PDF original do projeto. Lote, itens e auditoria usam a mesma transação; permanecem o advisory lock de competência/setor, replay, encadeamento de retificações, bytes imutáveis, hash e exigência da versão GED assinada/publicada/vigente.
- A autorização universal dos itens do lote foi traduzida com `NOT EXISTS` aninhado: setor divergente ou nulo impede download do lote/recibo; a semântica histórica de lote vazio foi preservada. Extrações e PDFs originais conservam o escopo setorial, o bloqueio de artefatos emitidos/carimbados e os limites de arquivo.
- Actions de identidade/participação/termo, habilitação de construtoras, profissionais/empregadores, publicação de definições/distribuição/zoneamento, avaliação interna e consultas intersetoriais migradas. Mantidos retornos `{ error }` dos clientes e `Promise<void>` dos formulários, campos imutáveis, vigências, snapshots antes/depois, locks, replay, auditoria e notificações na mesma transação.
- `audit-construction-backups.ts` e `revise-construction-catalogs.ts` migrados individualmente, sem execução. Conservados paginação por ID, conferência de hash, modo prévia/aplicação, IDs determinísticos, proteção de edições posteriores, autoria e digest das versões históricas. A revisão inteira recebe uma única `DatabaseTransaction`, inclusive o log financeiro.
- Mappings canônicos novos de exportação/recibo/prancha em `construction-integrations.ts`; início executivo, distribuição e consultas em `construction-core.ts`; histórico de habilitação em `construction-portal.ts`. **14 FKs novas** conferidas por leitura das migrations e introspecção local dos metadados: `restrict` na exclusão; atualização `no action` ou `cascade` conforme o SQL físico. Nenhum DDL remoto executado.
- Fiscalização migrada integralmente: abertura de protocolo, designação, diligência, atos/embargo/levantamento, ciência, evidências e action usam `DatabaseTransaction`. Preservados locks de processo/caso e designação/servidor/setor, autor/revisão/replay, cronologia, GED atual, estado de embargo, numeração transacional e histórico/auditoria. Novo mapping `construction-enforcement.ts`, com **7 tabelas / 13 FKs** `restrict`/`no action` conferidas nas migrations e nos metadados locais.
- Aberturas interna/externa e distribuição migradas como cadeia: staging do GED, validade/versão/hash, consumo exclusivo por ator/chave/formulário/categoria, processo central, sequência compartilhada, participantes/termo, snapshots e distribuição usam a mesma transação do chamador. Mantidos IDs UUID do staging, seleção por menor demanda com desempate, vigências inclusivas, etapas por assunto/fallback e autoria externa sem servidor fictício.
- As duas APIs de anexos de abertura e a action interna de abertura/catálogos/configuração/equipe estão migradas. Todas as operações de `external-actions.ts` usam Drizzle: autorização/revogação, protocolo externo, pedido e atendimento. `construction-opening.ts` contém **2 mappings / 7 FKs** `restrict`/`no action` conferidas. Toda a raiz `src/app/api/construcao-civil` está sem marcadores legados na última leitura.
- Submissão/atendimento de pedidos, prazos/prorrogações de vistoria e detalhe do portal migrados. Preservados ACL setorial/participação, termo vigente, replay/autoria, bloqueio por caso/chave, compartilhamento e versão GED atual, retorno ao analista inicial, cronologia, mensagens e notificações. A rejeição de correção/renovação tem incompatibilidade física explícita, detalhada nas dependências abaixo.
- Parecer/reenvio e cadeia executiva migrados: plano, início, pedido/resultado de vistoria, conclusão parcial/total, habite-se e processo cadastral vinculado. Sequências, Decimal de quatro casas, evidência JSON, auditoria/histórico, vínculos/locks e aplicação cadastral usam a mesma `DatabaseTransaction`. Atendimento automático grava `ACCEPTED`, aceito pelo `CHECK` histórico de `ConstructionServiceRequest`.
- Emissão/publicação de documentos, templates, revisão PDF e respectivas actions `.ts` migrados. `issueConstructionDocument` recebe `DatabaseConnection`; `createConstructionPdfRevision` recebe `Pick<AppContext, "user">` e conexão opcional no quarto argumento. Assinatura A1 e auditoria de falha usam os writers Drizzle compartilhados. O repository documental agora seleciona a versão mais recente antes de validar seu status.
- Gates tributários/de débitos/ciclos documentais estão em `construction-taxation-gates.ts` e são reexportados pelo módulo anterior. Publicação e emissão de taxas usam Drizzle; `issueConstructionFee(DatabaseConnection, access, actor, input)` preserva retorno `Promise<string>`, lock do caso, guardas, replay, ordem das validações, precisão e snapshot. O ciclo usa `getConstructionDocumentFeeCycle(tx, ...)`; removido o helper duplicado. Taxa, lançamento, DAM, numeração, código demonstrativo, auditoria e evento recebem a mesma transação.
- Migrados individualmente os três scripts exclusivos `adopt-aurora-asset-depreciation-accounts.ts`, `adopt-aurora-asset-depreciation-profiles.ts` e `adopt-aurora-asset-impairment-profiles.ts`. Cada script abre uma `DatabaseConnection`, executa sua unidade inteira com `withDatabaseTransaction(..., { timeoutMs: 60000 })` e fecha o pool. Mantidos locks `hashtextextended`, IDs/códigos, ordenação usada no hash, conteúdo JSON, hashes fixos, validações de divergência, auditoria única, prévia sem gravação e aplicação aditiva/idempotente. Nenhum deles foi executado, inclusive em modo prévia.

### Handoff atual de estoque/custódia para Frotas

```ts
applyStockMovement(tx: DatabaseTransaction, input: StockMovementInput)
// Promise<{ movement: MaterialMovementRecord; stock: MaterialStockRecord }>
recordEquipmentCustody(tx: DatabaseTransaction, input: {
  materialId: string; quantity: number; departmentId: string;
  responsibleId: string; stockMovementId: string;
}) // Promise<void>
recordStockMovement(connection: DatabaseConnection, input: StockMovementInput)
operateAsset(context: { user: PermissionUser }, raw: unknown,
  connection: DatabaseConnection = databaseConnection)
// Promise<{ assetId: string }>
```

Usar a mesma `DatabaseTransaction` na operação inteira de Frotas e passar `movement.id` à custódia. `applyStockMovement` já chama a ponte de custo; evitar reconhecimento duplicado. `recordStockMunicipalCosts`, `reduceStockMunicipalCosts` e `recordMunicipalCostSource` nas fontes reinspecionadas já usam transação Drizzle e `Decimal` independente.

**Handoff `operateAsset` concluído:** todos os imports/usos foram conferidos, incluindo a action de Patrimônio, os leitores de escopo e `tests/frotas.integration.test.ts`. A fixture DEP-03 chama a operação independentemente de uma transação Fleet; o terceiro argumento injeta a conexão real da fixture. O serviço exige apenas a identidade, conserva o default de produção, os dois argumentos existentes, retorno e transação serializável. Não abre outra conexão dentro de uma composição Fleet. ESLint do arquivo e parser passaram; DEP-03 fica para execução central. Este documento registra a entrega sem editar os arquivos exclusivos de Frotas.

### Resultados efetivamente observados

- Aquisição e baixa: **11/11** testes focados aprovados anteriormente.
- Valorização local: **2/2** aprovados (centavos, devoluções idempotentes, rollback e escopo).
- Projeção operacional de Iluminação: **1/1** aprovado.
- Requisições patrimoniais: **4/4** aprovados após migração da fixture para SQL/Drizzle reais, cobrindo idempotência, segregação, entrega integral e custódia, replay e rollback quando uma linha posterior tem saldo insuficiente.
- Construção/download: **1/1** teste integrado local aprovado; cobre habilitação com fim de vigência inclusivo, pessoa inativa, ACL por setor/participação, comunicação com termo e notificação deduplicada, rollback da comunicação, carimbo, replay, assinaturas pendentes/hash divergente, deferimento vencido e corrupção física do PDF. O teste usa PGlite isolado e os mapeamentos/SQL Drizzle reais; não acessa Neon.
- A fixture local passou a reproduzir defaults JSON e unicidade inline declarada nos schemas, além dos parsers de datas já existentes.
- Verificador limitado atualizado para excluir Frotas e incluir APIs/auth/componentes, os três scripts de adoção patrimonial e a fixture de emissão tributária; continua comparando JSX com o índice do merge visual. Última contagem: **306 arquivos / 19 com marcadores lexicais / zero com símbolos ou imports legados no código / zero erros sintáticos / zero alterações JSX**, incluindo a migração concorrente dos TSX de Obras pela frente responsável. O segundo inventário percorre a AST e não conta comentários/caminhos históricos de SQL. Ambos são inventários limitados, sem inferir dependências indiretas nem aprovar tipos/integrações.
- Rodada após a correção temporal: **7/7** aprovados em `asset-acquisition-service.test.ts`, `raw-scalars.test.ts`, `infrastructure-services.test.ts` e `construction-downloads.test.ts`. Isso reconfirma aquisição/rollback e a projeção operacional/documental após os patches recentes.
- As duas regressões de `raw-scalars.test.ts` passaram também em **UTC, America/Sao_Paulo e Pacific/Auckland: 2/2 em cada fuso**. Cobrem replay de estorno com todos os campos `Date`, `postedAt` preenchido/nulo, divergência de 1 ms e o limite temporal exato entre saída e liquidação. Exercitam PostgreSQL local/SQL/Drizzle reais; o cenário de consumo termina no gate de comprovação contábil, sem certificar a postagem financeira completa.
- Viabilidade automática: **1/1** observado antes do último patch de FKs/valores Decimal da fixture, cobrindo ACL, participação futura bloqueada, replay, rollback integral, snapshots aninhados, assinatura, imutabilidade, autorização vencida e construtora inabilitada. Após esse patch houve checagem sintática leve; a suíte não foi repetida durante a validação pesada central.
- Rodada atual: **ESLint PASS** nos arquivos alterados de runtime/API/actions/schemas/repository/scripts/testes; **34/34 FKs novas PASS** na introspecção local, sem banco (14 de integração/configuração, 13 de fiscalização e 7 de abertura). **4/4 regressões puras de exportação/publicação/assinatura PASS** e **6/6 puras de autorização/evidência/estado externo/regras/fiscalização PASS**, pelo filtro de nome do runner, sem abrir PGlite.
- `tests/construction-integrations.test.ts`: removido o cliente ORM fictício e substituído por `createLocalDrizzleDatabase`, com driver Neon/Drizzle real e SQL histórico aplicado somente à base isolada. Preparados cenários de seleção da versão publicada, Date/Decimal exatos, escopo nulo/divergente, recibo, extração, replay/autoria, retificação mais recente, rollback de cabeçalho/itens por trigger posterior e conservação dos bytes. Essa integração de banco e os testes PDF/PGlite do arquivo **não foram executados nesta rodada**; as quatro regressões puras acima são a cobertura efetivamente observada.
- Fixtures de fiscalização, staging interno e aberturas integrais interna/externa convertidas para `createLocalDrizzleDatabase`, sem cliente/DMMF legado. Mantidos cenários existentes, com rollback posterior de histórico/numeração/evidências em Fiscalização e `Date` tipado no staging/atos. As tabelas próprias continuam criadas pelo SQL histórico; as projeções escalares compartilhadas usam mappings Drizzle locais em `tests/helpers/construction-shared-tables.ts`, sem conexão remota.
- Processo externo/PJ, submissão e atendimento em `construction-external.test.ts` usam driver real. Acrescentados renovação com termo vigente/ciclo próprio, rollback documental+pedido e fronteiras de cronologia em milissegundos. A distribuição ganhou fixture própria (`construction-distribution.test.ts`), preservando menor demanda/desempate e acrescentando vigência/estratégias/rollback. A suíte de pareceres agora chama os serviços Drizzle reais a partir do mesmo estado já distribuído/substituído; os cenários não foram descartados.
- Convertidas `construction-lifecycle-deadlines`, `construction-rules-reviews`, `construction-lifecycle-review` e a suíte documental. O cenário executivo novo chama os serviços reais, incluindo rollback de conclusão/numeração e abertura de processo cadastral. A suíte documental mantém assinaturas GED reais, hash/backup, publicação/substituição, ciclo tributário próprio, habite-se e carimbo; acrescenta rollback de documentos/versões/vínculos/histórico antes de repetir a emissão. Isenções formais são precondições persistidas nessa suíte; os cenários de emissão real de taxas/DAM estão em `construction-taxation.test.ts`.
- **Os dois cenários de emissão tributária foram convertidos integralmente**, removendo mocks/API Prisma. `construction-fee-issue-fixture.ts` usa driver Neon/Drizzle real e o histórico SQL municipal completo através da fixture tributária existente, com UG/ente/conta arrecadadora, exercício aberto, requerente/imóvel, processo, configuração, participação/termo e documento de origem persistidos. Preparadas verificações de guardas, regra específica, repetição sem duplicação, Date/Decimal/JSON, código demonstrativo, auditoria e rollback de taxa/lançamento/guia/numeração quando falha a auditoria posterior. O ciclo isento cobre rejeição persistida, cobrança/gate bloqueados no pedido rejeitado e novo ciclo real sem reaproveitar a chave anterior. **Não executados nesta rodada.**
- Suíte de upgrade mantém os mappings Drizzle e a cobertura inversa das tabelas físicas; agora prepara também a migration futura e confere exatamente os três estados do `CHECK`, validado. Atendimento prepara reprodução da falha histórica `23514`, upgrade aditivo, rejeição funcional, replay/autoria, rollback de ambos os pedidos/histórico e atendimento de ciclo posterior. A suíte documental prepara o bloqueio real de emissão após indeferimento e conserva o documento original publicado. **Essas regressões ainda aguardam execução central.**
- Convertidas as suítes contábeis `asset-valuation-accounting.test.ts` e `stock-valuation.test.ts`, com migrations municipais completas e driver real, incluindo concorrência/rollback, precisão/cronologia, ajustes/estornos, vínculo financeiro e quotas. A fixture de estoque mantém orçamento implantado/conectado de 600,00 e cotas mensais de 50,00 em período bimestral. A leitura estática confirmou que o segundo empenho de setembro transfere 10,00 de outubro, preservando 600,00 no total; as asserções verificam os dois eventos da transferência e os dois consumos canônicos, além de VPD/devolução idempotente.
- Última rodada leve: **10/10 testes puros aprovados**, por filtro de nome em prazos/regras/parecer-plano/ciclo/taxas; nenhuma fixture aberta. **16/16 FKs** de ciclo/prazos/taxas conferidas por metadados locais e SQL histórico; **53/53 tabelas físicas de Construção** cobertas pelos nove módulos de mapping. Checagem AST adicional em 25 arquivos conferiu **155 inserts literais**, sem campos obrigatórios ausentes ou chaves desconhecidas após corrigir `Department.secretariatId` e `Company.cnpj`; quatro inserts com spread não são resolvidos por essa checagem. Esse ensaio não é typecheck.
- **ESLint focal final aprovado, zero erros/avisos:** verificador, duas fixtures contábeis, duas fixtures novas de Construção, testes documental/externo/plano/ciclo/upgrade/estoque. A rodada anterior em 27 arquivos de runtime/actions/schemas/repository/testes também passou sem erros/avisos.
- Rodada de conclusão: **ESLint PASS em 13 arquivos**, incluindo os três scripts, emissão/action, resolução, mapping documental, nova fixture e quatro suítes alteradas. Parser/inventário: **306 arquivos, zero código legado, zero erros sintáticos e zero alterações JSX**. `prepareMigrationSql` aceita a migration futura como **uma instrução**, sem envelope transacional próprio. Nenhum PGlite, teste parcial, typecheck ou build foi executado nesta rodada; essas verificações leves não certificam o funcionamento integrado.
- **Execução pendente:** nenhuma das integrações PGlite recém-convertidas de fiscalização/staging/aberturas/distribuição/pedidos/prazos/pareceres/documentos/ciclo/gates/upgrade/contabilidade foi executada nesta rodada. O cenário integrado de foundation também aguarda execução (apenas os dois testes puros foram observados anteriormente). ESLint/parser/importação/checagem de metadados e testes puros não substituem essas suítes nem o typecheck do parent.

### Auditoria de escalares SQL brutos

- Conferidos individualmente `execute<T>(sql)`, projeções `sql<T>` e JSON agregado nas pastas de produção atribuídas, nos repositories Assets/Infrastructure e nos dois seeds patrimoniais migrados.
- **Seis consultas temporais em cinco arquivos** agora decodificam na fronteira com `databaseTimestamp` de `@/db/temporal`:
  - `src/lib/patrimonio/asset-acquisition-service.ts`: `PurchaseReceipt.receivedAt`, preservado como `Date` na aquisição/incorporação.
  - `src/lib/patrimonio/stock-consumption-accounting.ts`: `Settlement.date`, usado na ordenação temporal do consumo.
  - `src/lib/patrimonio/valuation-reversal.ts`: original e replay; `date`, `postedAt` nullable, `createdAt` e `updatedAt` explicitamente mapeados.
  - `src/app/app-domain/patrimonio/_components/MaterialStockList.tsx`: `Settlement.date` no DTO existente.
  - `src/app/app-domain/patrimonio/requisicoes/[id]/page.tsx`: `Settlement.date` e `valueDecimal` nullable, com `new Decimal(rawString)` sem passagem intermediária por `Number`.
- Retirado `AT TIME ZONE 'UTC'` dessas seis consultas: o DTO interpreta o escalar recebido; não depende de o genérico SQL atuar como decoder. Não há casts para `Date` nesses caminhos.
- JSON agregado conferido: dados de UG/ente na valorização, referências patrimoniais de unidade/consumo de Frotas, pasta documental de Obras e vínculos de orçamento/empenho/compras em `infrastructure/services.ts`. Esses objetos contêm campos textuais e/ou valores originalmente `Float`, sem campos `Date` ou `Decimal` aninhados que exijam conversão. A árvore nested de consumo de Frotas contém somente IDs/código/setor; nenhum arquivo da frente Frotas foi editado.
- `ConstructionCompletion.area::text` continua convertido diretamente com `new Decimal(row.area)`; numerics de partidas/consumo continuam strings até o `Decimal`. `PurchaseReceiptItem.quantity`, `quantityIncorporated`, `unitCost` e `Settlement.value` são `Float` na origem e conservam o contrato numérico.
- Datas/Decimal provenientes de seleções de colunas tipadas, inclusive versões/assinaturas GED, solicitações do portal, carimbos, reservas e datas opcionais de estoque/Iluminação, continuam usando os mappers Drizzle. JSX, props, formatação e seleção de ano por `Date` foram preservados.

### Reinspeção dos consumidores externos de estoque

- `src/lib/sst/equipment-service.ts` já usa `withDatabaseTransaction` e grava `movement.movement.id`; não foi encontrada a incompatibilidade antiga com o contrato de estoque nesse consumidor.
- `src/lib/saude/clinical-extension-service.ts` já usa `runHealthTransaction`, com a mesma transação na administração clínica e nos materiais auxiliares.
- A última reinspeção encontrou `pharmacy-request-service.ts`, `pharmacy-kit-service.ts`, `pharmacy-dispensation-service.ts`, `specialized-care-service.ts`, `vaccination-stock-service.ts` e `vaccination-service.ts` já recebendo/abrindo transações Drizzle e consumindo o movimento via `{ movement }`/`.movement.id`. É conferência estática das fronteiras, sem certificar suas integrações.
- **Handoff Saúde ainda aberto:** `health-stock-service.ts` continua com `Prisma.TransactionClient`/`context.prisma.$transaction` e chama `applyStockMovement`. Além disso, `receiveVaccineVials` chama `postHealthStockReceipt(context, input, connection)`, mas o writer de recebimento ainda declara somente dois argumentos e exige `AppContext` legado. O owner deve migrar integralmente recebimento/aceite/transferência/inventário/baixa assistencial e compatibilizar o contrato injetável de recebimento. Nenhum arquivo de Saúde foi editado por esta frente.

### Handoff tributário — implementação compartilhada pelo owner Tax

```ts
// Mesma origem pública: @/lib/tributacao
generateTaxGuideInTransaction(
  tx: DatabaseTransaction,
  actor: TaxActor,
  input: { assessmentId: string; dueDate: Date; documentId?: string },
) // Promise do registro TaxGuide: id, guideNumber e campos atuais preservados
```

- `issueConstructionFee` já chama esse contrato diretamente na transação que persiste a taxa e o lançamento. O writer deve preservar locks, escopo UG/ente/exercício, numeração, precisão, auditoria e retorno, sem obter outra conexão ou abrir transação própria. A verificação real de atomicidade preparada falha **depois** de guia/auditoria/numeração e exige rollback integral.
- Na última leitura, `src/lib/tributacao/index.ts` ainda declara `Prisma.TransactionClient`. Essa incompatibilidade compartilhada de tipos/runtime permanece até a entrega do owner; esta frente não a oculta com cast/supressão nem altera o arquivo reservado. O caller e os testes já foram entregues em Drizzle conforme o contrato futuro solicitado.
- Consumidores de `issueConstructionFee` localizados/revistos individualmente: `tax-actions.ts` e os dois cenários de `construction-taxation.test.ts`. A action passa `databaseConnection`; mantém `{ success: true, id }` / `{ error }` exigidos pelo `ConstructionTaxClient`. Publicação de regras permanece consumida também pela suíte documental, sem alteração de assinatura.

### Rejeição documental — prévia de evolução física para o parent

- Investigação histórica: `git log --all` do serviço aponta o commit inicial `37064a7`; `git show` confirma que o writer anterior já gravava `REJECTED`. Busca em todos os históricos SQL encontrou a declaração de `ConstructionDocumentRequest` apenas em `20261010230000_construction_documents`, cujo `CHECK` aceita `PENDING/FULFILLED`. É um bug físico preexistente, não uma decisão nova da migração ORM.
- Arquivo futuro preparado, **sem aplicação remota**: `db/migrations/20261028193000_construction_document_rejection/migration.sql`. Uma instrução `ALTER TABLE` substitui somente `ConstructionDocumentRequest_status_check`, mantendo o mesmo nome, por `CHECK ("status" IN ('PENDING', 'FULFILLED', 'REJECTED'))`. Mantém default `PENDING`, dados, FKs, índices e vínculos; nenhum dos 156 históricos foi editado. A transação pertence ao executor SQL central. O mapping `construction-documents.ts` declara a mesma constraint.
- Prévia comunicada ao parent nesta rodada; aplicação coordenada e confirmação física ainda pendentes. A evidência de baseline/Neon e deploys informada pelo parent é anterior a esse arquivo futuro e não valida sua aplicação.
- Consumidores investigados: `external-actions.ts` mantém retorno `{ error }`; `ConstructionExternalRequestAttendance` já oferece indeferimento. `construction-request-resolution.ts` mantém replay pelo mesmo autor/decisão e histórico na mesma transação, agora também restringindo o pedido documental ao caso autorizado na rejeição.
- `issueConstructionDocument` e `getConstructionDocumentFeeCycle` exigem `PENDING`; assim, emissão, cobrança e gates recusam `REJECTED`. `submitConstructionServiceRequest` e `requestConstructionArtifactChange` bloqueiam só pedidos `PENDING`, conservam o pedido antigo no replay e permitem nova chave/ciclo após rejeição. Não há migração automática de cobrança anterior: evidência/isenção/histórico já persistidos são preservados.
- Leitores reservados foram somente inspecionados: `repositories/works-pages/taxation.ts` e a página documental interna filtram `PENDING`; a página documental do portal mantém o histórico de todos os estados e o componente aceita `status: string`. Não exigem alteração de JSX/DTO para excluir pedidos rejeitados da emissão/cobrança e manter a consulta histórica.

### Dependências e pendências abertas

- Owner Tax: concluir o contrato compartilhado acima; parent: revisar/aplicar a migration futura com o executor SQL e executar o conjunto integral de Construção. Não há mais código Prisma direto nos arquivos atribuídos, incluindo os três scripts exclusivos.
- Consumidores atuais de emissão/revisão documental, gates, submissão/prazos, pareceres e ciclo foram localizados e reinspecionados; as actions usam Drizzle e mantêm `{ error }`, e o leitor executivo reservado ao outro owner chama `getConstructionInspectionCorrections` com transação Drizzle. Não foi executado outro typecheck nesta frente. O apontamento anterior de `asset-lifecycle.ts` para `recordConfirmedRevenue` foi reinspecionado: o writer financeiro atual já recebe `DatabaseTransaction`; a confirmação de tipos continua com o parent.
- Reinspecionados os helpers de download `assertConstructionGedSignature`, `assertConstructionProjectStampDownload`, `get/find/listConstructionProjectStamp` e `resolveConstructionComplementArtifact`, bem como suas actions/APIs/consumidores. Recebem `DatabaseExecutor` (`database`, `db` ou o `tx` do chamador), sem contrato Prisma. Inclui a API genérica de download do parent, somente inspecionada.
- Fixtures contábeis e de Construção já convertidas aguardam execução sequencial coordenada. O teste documental configura a conexão lazy global para os entrypoints GED compartilhados e restaura configuração/ambiente ao fechar; ele deve executar em seu processo isolado. Fixtures Neon locais alteram transporte global e devem fechar antes da próxima abertura.
- Build/typecheck completos e testes financeiros integrados ficam para execução sequencial do parent. Sem commit/push ou DDL remoto nesta frente.

### Comandos de verificação/handoff

```powershell
node scripts/drizzle-assets-infrastructure-check.mjs --summary
node --conditions=react-server --import tsx --test --test-concurrency=1 src/lib/patrimonio/__tests__/material-request-fulfillment.test.ts
node --conditions=react-server --import tsx --test --test-concurrency=1 src/lib/obras/__tests__/construction-downloads.test.ts
node --conditions=react-server --import tsx --test --test-concurrency=1 src/lib/patrimonio/__tests__/asset-acquisition-service.test.ts src/lib/patrimonio/__tests__/asset-lifecycle.test.ts
node --conditions=react-server --import tsx --test --test-concurrency=1 src/lib/patrimonio/__tests__/stock-valuation.test.ts
node --conditions=react-server --import tsx --test src/lib/obras/__tests__/infrastructure-services.test.ts
node --conditions=react-server --import tsx --test --test-concurrency=1 src/lib/patrimonio/__tests__/raw-scalars.test.ts
node --conditions=react-server --import tsx --test --test-concurrency=1 tests/construction-automatic-viability-service.test.ts
node --conditions=react-server --import tsx --test --test-concurrency=1 tests/construction-integrations.test.ts
node --conditions=react-server --import tsx --test --test-concurrency=1 tests/construction-enforcement-service.test.ts
node --conditions=react-server --import tsx --test --test-concurrency=1 tests/construction-internal-documents.test.ts tests/construction-external-full-opening.test.ts tests/construction-distribution.test.ts
node --conditions=react-server --import tsx --test --test-concurrency=1 tests/construction-external.test.ts tests/construction-lifecycle-deadlines.test.ts tests/construction-rules-reviews.test.ts tests/construction-lifecycle-review.test.ts tests/construction-lifecycle.test.ts
node --conditions=react-server --import tsx --test --test-concurrency=1 tests/construction-documents-service.test.ts tests/construction-migration-upgrade.test.ts
node --conditions=react-server --import tsx --test --test-concurrency=1 tests/construction-taxation.test.ts
node --conditions=react-server --import tsx --test --test-concurrency=1 tests/asset-valuation-accounting.test.ts tests/stock-valuation.test.ts
node --conditions=react-server --import tsx --test --test-concurrency=1 tests/frotas.integration.test.ts
```

Reteste central de **toda Construção**, após handoff Tax e revisão da migration, em execução sequencial e sem filtro por nome:

```powershell
$constructionTests = @((Get-ChildItem tests/construction-*.test.ts).FullName) + @((Get-ChildItem src/lib/obras/__tests__/*.test.ts).FullName)
node --conditions=react-server --import tsx --test --test-concurrency=1 $constructionTests
```

## Inventário residual exato — 306 arquivos verificados / 19 com marcadores / zero com código legado

Snapshot consolidado do verificador após esta rodada e as migrações concorrentes de TSX pelo novo owner. Os três scripts patrimoniais adicionais e a nova fixture agora integram explicitamente o escopo do verificador. Os 19 marcadores lexicais restantes são caminhos de SQL histórico em testes/fixtures; `legacyCodeResidual` está vazio. Imports indiretos não são inferidos e essa ausência não certifica integração transacional/financeira.

| Raiz | Arquivos residuais |
|---|---:|
| `scripts` | 0 |
| `src/app/api/construcao-civil` | 0 |
| `src/app/app-domain/obras/construcao-civil` | 0 |
| `src/app/portal/construcao-civil` | 0 |
| `src/components/construction` | 0 |
| `src/lib/obras` | 0 |
| `tests` | 19 |
| **Total** | **19** |

### Código legado efetivo: nenhum arquivo no inventário atribuído

`legacyCodeResidual: []`. A dependência transitiva do writer tributário compartilhado está explicitada no handoff, sem alegação de aprovação integrada.

### `tests` (19)

```text
construction-automatic-viability-service.test.ts
construction-company-validity.test.ts
construction-consultations.test.ts
construction-distribution.test.ts
construction-documents-service.test.ts
construction-enforcement-service.test.ts
construction-enforcement.test.ts
construction-external-full-opening.test.ts
construction-external.test.ts
construction-foundation.test.ts
construction-integrations.test.ts
construction-internal-documents.test.ts
construction-lifecycle-deadlines.test.ts
construction-lifecycle.test.ts
construction-migration-upgrade.test.ts
construction-rules-reviews.test.ts
construction-taxation.test.ts
helpers/assets-accounting-fixture.ts
helpers/construction-requests-fixture.ts
```
