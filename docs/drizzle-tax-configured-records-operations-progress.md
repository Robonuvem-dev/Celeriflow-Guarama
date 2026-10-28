# TaxConfiguredRecordsOperations — handoff Drizzle

Data: 2026-10-28. Reserva transferida: `src/lib/tributacao/configurable-cadastres.ts` e arquivos próprios abaixo.

## Entrega e gate

- **8/8 exports públicos preservados**, com os quatro writers convertidos para contratos Drizzle reais. Zero import/delegate/raw API/cast de compatibilidade Prisma no módulo e na implementação própria.
- Wrappers recebem `DatabaseConnection`; participantes recebem exclusivamente `DatabaseTransaction`; leitores do repositório recebem `DatabaseExecutor`. O núcleo transacional não adquire conexão, não importa banco global e não abre transação aninhada.
- Registro, histórico nativo, política econômica, auditoria e vínculos GED usam o mesmo `tx` recebido. Os wrappers conservam timeout de 5.000 ms e isolamento padrão; os participantes herdam timeout/isolamento do dono da transação.
- **Validação leve concluída:** ESLint e parse de seis arquivos; oito projeções/13 colunas próprias e 26 colunas compartilhadas confrontadas com catálogo físico independente; 20 comandos INSERT da fixture/suíte com zero coluna desconhecida e zero obrigatório sem valor/default.
- **Runtime pendente do parent.** Preparados 11 subcenários sequenciais sobre as 156 migrações históricas, transporte Neon/Drizzle e PGlite local. Esta frente não executou a suíte com banco, typecheck ou build.

Arquivos da entrega:

1. `src/lib/tributacao/configurable-cadastres.ts`
2. `src/db/repositories/tax-configured-records-operations/records.ts`
3. `src/db/schema/tax-configured-records-operations.ts`
4. `src/lib/contracts/tax-configured-records-operations.ts`
5. `tests/helpers/tax-configured-records-operations-fixture.ts`
6. `tests/drizzle-tax-configured-records-operations.test.ts`
7. Este handoff.

## Contrato exato para S2/S3, Property/ITBI, Economic e Annual

```ts
publishFiscalCatalog(
  connection: DatabaseConnection,
  actor: TaxActor,
  raw: z.input<typeof fiscalCatalogSchema>,
): Promise<ConfiguredFiscalEntry>

publishFiscalCatalogInTransaction(
  tx: DatabaseTransaction,
  actor: TaxActor,
  raw: z.input<typeof fiscalCatalogSchema>,
): Promise<ConfiguredFiscalEntry>

saveConfiguredFiscalRecord(
  connection: DatabaseConnection,
  actor: TaxActor,
  raw: z.input<typeof fiscalRecordSchema>,
): Promise<ConfiguredFiscalEntry>

saveConfiguredFiscalRecordInTransaction(
  tx: DatabaseTransaction,
  actor: TaxActor,
  raw: z.input<typeof fiscalRecordSchema>,
): Promise<ConfiguredFiscalEntry>
```

`ConfiguredFiscalEntry = TaxRegistryEntryRecord`: retorno completo com `id`, `entityType`, `entityId`, `category`, `title`, `data`, `status`, `source`, `effectiveFrom`, `effectiveUntil`, `processId`, `documentId`, `actorUsuarioId`, `reviewedByUsuarioId`, `reviewedAt`, `version`, `createdAt` e `updatedAt`. Datas são `Date`, proveniências opcionais continuam `null`, `data` é `JsonValue` independente de ORM. Não há DTO reduzido nem conversão numérica de Decimal.

`raw` de formulário mantém `catalogId`, `entityType`, `entityId`, `expectedVersion`, `active`, `values`, `processId`, `documentIds`, `frontage` e `occurrenceId?`. Defaults/refinements Zod e exceções de validação permanecem no núcleo. As actions await continuam convertendo exceções para `{ error: string }` e retornando `{}` no sucesso.

| Owner/consumidor | Integração efetiva |
| --- | --- |
| TaxActions `configuracoes-cadastrais/actions.ts` | Ambos os wrappers já recebem `connection`; erros seguem tratados na UI. Nenhuma adaptação adicional necessária. |
| S3 `s3-service.ts` | `saveConfiguredFiscalRecordInTransaction(tx, actor, …)` na inclusão do ITBI; mesma transação de processo, declaração e partes recém-criados. |
| Property `property-bulk-change.ts` | Mesmo `tx`, lock de catálogo anterior aos locks imobiliários; mantém expectedVersion, mescla de values e protocolo. |
| Property `pgv-bulk.ts` | `publishFiscalCatalogInTransaction(tx, actor, …)`; retorna o mesmo contrato completo esperado por `PropertyRegistryRecord[]`. |
| Economic `economic-operations.ts` | Mesmo `tx`; mantém versões esperadas, values e documentIds congelados. |
| Economic `economic-activity-operations.ts` | Publicação de zoneamentos afetados pela unificação usa o mesmo `tx` e lock `ECONOMIC_ACTIVITY`. |
| ITBI `itbi-additional-forms.ts`, `itbi-online.ts` | Schemas/campos e snapshots preservados; leitura de formulários continua consumindo as mesmas chaves. |
| Property/Annual `property-valuation.ts` | Consome `fiscalCatalogSchema` e snapshots PGV/testadas; catálogo vigente, versão, ato e memória continuam disponíveis. |
| S2 e Annual | Grep não encontrou chamada direta aos quatro writers nesses módulos. O contrato transacional acima está disponível para integração pelo owner, sempre com `tx` da mesma origem. |

## Inventário dos oito exports originais

| Export | Contrato/retorno | Consumidores |
| --- | --- | --- |
| `fiscalFieldSchema` | Zod TEXT/NUMBER/DATE/BOOLEAN/LIST; opções/defaults/refinement preservados | `fiscalCatalogSchema`, `economic-events.ts`, `itbi-additional-forms.ts`; tipos dos clients de cadastro/ITBI/Portal e suíte própria |
| `fiscalCatalogSchema` | Zod de versões, origem, kind/code/name, campos, PGV, atos, débitos e regras CNAE | Ambos os publishers e saver; `economic-activity-operations.ts`, `economic-operations.ts`, `pgv-bulk.ts`, `property-bulk-change.ts`, `property-valuation.ts`, `itbi-online.ts`; páginas/clients listados abaixo e suíte própria |
| `fiscalRecordSchema` | Zod de cadastro, versão, values, ativo, ocorrência, documentos, processo e testada | Saver/wrapper; actions derivam seu input por `Parameters<typeof saveConfiguredFiscalRecord>[2]` |
| `validateFiscalFields` | `(fields, values) => Record<string, string \| boolean \| null>` | Publicação de catalogValues, formulário, `economic-events.ts`, teste legado de cadastro e suíte própria |
| `publishFiscalCatalog` | Conexão; `Promise<ConfiguredFiscalEntry>` | Action cadastral; dez suítes existentes listadas abaixo; suíte própria |
| `publishFiscalCatalogInTransaction` | Transação; `Promise<ConfiguredFiscalEntry>` | Wrapper, unificação de atividades, PGV em lote e suíte própria |
| `saveConfiguredFiscalRecord` | Conexão; `Promise<ConfiguredFiscalEntry>` | Action cadastral; testes de cadastro, PGV e Drizzle Economic; suíte própria |
| `saveConfiguredFiscalRecordInTransaction` | Transação; `Promise<ConfiguredFiscalEntry>` | Wrapper, S3, alteração geral Property/Economic e suíte própria |

### Consumidores de produção — grep integral antes/depois

Os nove módulos `src/lib/tributacao/` importadores foram lidos quanto ao uso do contrato:

- `economic-activity-operations.ts`
- `economic-events.ts`
- `economic-operations.ts`
- `itbi-additional-forms.ts`
- `itbi-online.ts`
- `pgv-bulk.ts`
- `property-bulk-change.ts`
- `property-valuation.ts`
- `s3-service.ts`

Os 11 importadores de aplicação mantêm os mesmos schemas/retornos:

- `src/app/app-domain/tributacao/configuracoes-cadastrais/actions.ts`
- `src/app/app-domain/tributacao/configuracoes-cadastrais/page.tsx`
- `src/app/app-domain/tributacao/configuracoes-cadastrais/ConfigurableCadastresClient.tsx`
- `src/app/app-domain/tributacao/configuracoes-cadastrais/CatalogValuesInput.tsx`
- `src/app/app-domain/tributacao/economico/alteracao-geral/page.tsx`
- `src/app/app-domain/tributacao/economico/alteracao-geral/EconomicBulkExtendedClient.tsx`
- `src/app/app-domain/tributacao/imoveis/alteracao-geral/page.tsx`
- `src/app/app-domain/tributacao/imoveis/alteracao-geral/PropertyBulkClient.tsx`
- `src/app/app-domain/tributacao/itbi/page.tsx`
- `src/app/app-domain/tributacao/itbi/ItbiClient.tsx`
- `src/app/portal/tributario/itbi/novo/OnlineItbiForms.tsx`

### Consumidores de teste — aviso para os owners

Todos os dez importadores existentes foram localizados antes da troca de assinatura. Cinco já passam conexão:

- `tests/drizzle-tax-economic.test.ts`
- `tests/itbi-online-channel.test.ts`
- `tests/tax-property-cadastral-completion.test.ts`
- `tests/property-pgv-integration.test.ts`
- `tests/property-bulk-change.test.ts`

**Cinco suítes ainda passavam `f.db` aos wrappers na última conferência e precisam de ajuste pelo respectivo owner** para conexão da fixture real:

- `tests/configurable-fiscal-cadastres.test.ts`
- `tests/economic-activity-registry.test.ts`
- `tests/economic-profile.test.ts`
- `tests/tax-channel-financial-integrity.test.ts`
- `tests/tax-cadastral-migration-chain.test.ts`

`tests/drizzle-tax-configured-records-operations.test.ts` é o 11º importador de teste e usa conexão/tx reais. Não há overload legado aceitando Prisma ou executor como dono de transação.

## Persistência e invariantes preservados

### Publicação de catálogo

1. Parse/refinements Zod e normalização de `catalogValues` pelos campos configurados.
2. Autorização por UG e conciliação física `PlanningEntityUnit` com o ente informado.
3. Locks transacionais, na ordem original: `ECONOMIC_ACTIVITY:<UG>` para zoneamento; `FISCAL_CATALOG_ID:<id>` em republicação; `FISCAL_CATALOG:<UG>:<kind>:<code>` para unicidade operacional.
4. Última versão, expectedVersion, imutabilidade de ente/UG/kind/code e mesmo código isolado por UG/kind.
5. Existência de bairro/logradouro; PGV com ambos e valor Decimal finito/não negativo.
6. Regras urbanísticas somente em zoneamento, CNAE único; última definição por atividade na mesma origem; exatamente uma definição ativa por CNAE. Snapshot fixa atividade/definitionId/versão/nome.
7. INSERT aditivo com status, autor, dados e defaults históricos; auditoria `PUBLISH_FISCAL_CATALOG` com previousId, catálogo, versão e origem; retorno da linha completa.

### Formulário configurado

1. Parse, lock do catálogo e leitura de sua última versão; autorização da origem e catálogo ativo/aplicável ao entityType.
2. `SELECT … FOR UPDATE` no cadastro físico da mesma transação; ITBI verifica ente/UG no calculationSnapshot.
3. Protocolo existente e documentos GED válidos. IDs de documento, incluindo `[]`, são vinculados como **um único parâmetro array SQL**, sem interpolação de lista; duplicados preservados no snapshot e deduplicados na contagem de existência.
4. PGV ativa exige testada Decimal positiva. O texto original da testada/valor é preservado no snapshot; campos NUMBER usam `Decimal.toString()`, nunca `Number`.
5. Vistorias exigem ocorrência UUID; chave `catalogId:occurrenceId` mantém versionamento independente. Demais cadastros usam `catalogId` e rejeitam ocorrência.
6. Controle expectedVersion e validações de campos desconhecidos, obrigatoriedade, tipos, lista, datas reais, boolean false e null explícito.
7. Empresa: `enforceEconomicProfileDebtPolicy` para formulários fora de `SITUACAO_EMPRESA`; situações continuam delegando ao histórico econômico com seus guards.
8. Imóvel: mesma origem do perfil conciliado, BCI compatível com Terreno/Unidade/Rural, atribuição do autor e touch metadados sob os guards nativos de protocolo/supervisor. Situação ativa atualiza status e produz histórico nativo na mesma transação. Áreas Float não são regravadas nem convertidas.
9. INSERT aditivo fixa configuração, catalogVersion/definitionId, values, frontage, documentIds, ocorrência e previousId; mantém processId/documentId/autor na linha.
10. Auditoria `SAVE_CONFIGURED_FISCAL_RECORD` e, para ITBI, `linkItbiPropertyAttachments(tx, …)` conserva deduplicação, locks e proveniência original no processo/imóvel. Uma falha em GED posterior à auditoria desfaz ambos.

Vigências `effectiveFrom`, `effectiveUntil`, milissegundos e `createdAt` vêm do mesmo schema/default físico. O módulo não modifica política de exercício, fórmula de avaliação, gatilhos de histórico ou DDL. Ano/ato/configuração continuam congelados nos snapshots de seus fluxos consumidores.

## Repositório e contratos próprios — 100% dos exports

Arquivo `src/db/repositories/tax-configured-records-operations/records.ts`:

| Export | Modo/retorno | Consumidores |
| --- | --- | --- |
| `configuredFiscalSnapshot` | Puro; `JsonValue`, omitindo membros opcionais undefined | Publicação e save |
| `configuredFiscalOriginExists` | Executor; boolean | Autorização do módulo |
| `configuredFiscalNeighborhoodExists` | Executor; boolean | Publicação |
| `configuredFiscalStreetExists` | Executor; boolean | Publicação |
| `configuredFiscalProcessExists` | Executor; boolean | Save |
| `readLatestConfiguredFiscalEntry` | Executor; linha completa ou null, ordem por versão | Publicação/save; suíte própria |
| `listConfiguredFiscalCatalogCode` | Executor; linhas por JSON code | Publicação |
| `listConfiguredFiscalActivities` | Executor; definições por JSON ente/UG, versão desc | Publicação |
| `readValidConfiguredFiscalDocuments` | Executor; `{ id: string }[]` | Save; suíte própria |
| `lockConfiguredFiscalKey` | Transação; void | Publicação/save |
| `lockConfiguredFiscalSubject` | Transação; snapshot ITBI ou null; exige cadastro existente | Save |
| `changeConfiguredFiscalPropertyStatus` | Transação; void, GUC local de processo/perfil e UPDATE tipado | Save |
| `insertConfiguredFiscalEntry` | Transação; linha completa | Publicação/save; fixture/suíte próprias |
| `insertConfiguredFiscalAudit` | Transação; void | Publicação/save; suíte própria |

`src/lib/contracts/tax-configured-records-operations.ts` exporta `ConfiguredFiscalEntry`, `ConfiguredFiscalSubject`, `ConfiguredFiscalEntryInput` e `ConfiguredFiscalAuditInput`, consumidos somente pelo módulo/repositório próprio. JSON null explícito usa `JsonNull`; SQL NULL de proveniência mantém null/omissão. Leituras de timestamps usam seleções/returning de colunas tipadas; a única comparação temporal raw da suíte usa `databaseTimestamp`.

`src/db/schema/tax-configured-records-operations.ts` exporta oito projeções somente de runtime, todas consumidas pelo repositório e pela conferência física da suíte:

- `configuredEntityUnits` → `PlanningEntityUnit` (2 colunas)
- `configuredNeighborhoods` → `Neighborhood` (1)
- `configuredStreets` → `Street` (1)
- `configuredProperties` → `RealEstate` (3)
- `configuredEconomicRegistrations` → `EconomicRegistration` (1)
- `configuredItbiDeclarations` → `ItbiDeclaration` (2)
- `configuredProcesses` → `Process` (1)
- `configuredDocuments` → `Document` (2)

Reutilizados, sem edição, os schemas físicos completos `taxRegistryEntries` e `taxAuditLogs`. A fixture exporta `createConfiguredFiscalOperationsFixture`, consumida exclusivamente pela suíte própria, e reutiliza o replay integral/local existente.

Dependências externas de execução já têm contrato Drizzle: `attributePropertyHistory`, `touchPropertyMetadata`, `enforceEconomicProfileDebtPolicy`, `updateEconomicRegistrationWithHistoryInTransaction`, `linkItbiPropertyAttachments`. Todas recebem o mesmo tx. `TaxActor` é import type; de `scope.ts` usa-se apenas o helper puro `taxScopeSnapshot`. A migração de outros exports de `index.ts`/`scope.ts` e demais serviços continua com seus owners.

## Evidência e execução central solicitada

Verificações locais concluídas:

- ESLint dos seis arquivos de código: PASS.
- Parse TypeScript dos mesmos seis, sem criar programa/typechecker: PASS.
- Conferência AST do inventário: 35 exports dos arquivos próprios/original e 31 importadores documentados, zero omissões; varredura de legado no recorte sem ocorrências.
- Catálogo independente `.agent/drizzle/database-before-2026-10-28T01-26-00.861Z/catalog.json`: 39 colunas mapeadas em dez tabelas, tipo físico e nullability compatíveis; 20 INSERTs da fixture/suíte válidos quanto a nomes e campos obrigatórios. Esta verificação detectou e permitiu corrigir o seed de Process para `processTypeId`/`subjectId` antes do handoff.
- Grep integral de consumidores: 20 arquivos de produção e 11 de testes; contratos de produção conexão/tx compatíveis por inspeção; cinco suítes históricas aguardam o owner conforme lista acima.
- Zero Prisma/delegates/raw APIs Prisma/casts de compatibilidade no recorte migrado. Nenhuma operação de Git, alteração de dependências/configuração/DDL histórico ou operação remota nesta frente.

Suíte própria preparada, ainda **não executada**: 11 subcenários, um único fixture fechado no finally, sem concorrência entre suítes:

1. Replay das 156 migrações, catálogo físico, timestamp com milissegundos, JSON null/SQL NULL e array de IDs adversarial.
2. Campos/valores/versões e segregação UG/ente.
3. Snapshots CNAE ativos, última versão, origem adversarial e ambiguidade histórica sem desabilitar índice.
4. PGV/testada, Decimal, Float nativo, proveniência, imutabilidade e constraint de versão.
5. Replay concorrente e ocorrências independentes de vistoria.
6. BCI, origem conciliada, protocolo, autorização do supervisor e autoria do histórico imobiliário.
7. Formulário e histórico econômico, data com milissegundos e bloqueio por política de débitos.
8. Catálogo não commitado + save ITBI na transação do chamador; triggers locais exigem `txid_current()` idêntico em registro, auditoria e ProcessDocument; deduplicação de anexos, origem e Decimal/ano nativo preservados.
9. Falha na auditoria de publish/save com rollback completo dos wrappers.
10. Falha GED após auditoria: rollback completo do formulário/auditoria.
11. Falha na última auditoria de uma transação externa após catálogo, status imobiliário/econômico, históricos, formulário ITBI e GED; comparação de snapshots completos antes/depois.

Comando para a fila serial do parent:

```powershell
node --max-old-space-size=512 --conditions=react-server --import tsx --test --test-concurrency=1 tests/drizzle-tax-configured-records-operations.test.ts
```

Após a suíte focal, integrar a execução de TaxActions, Economic, Property/PGV, ITBI/S3 e Annual sob a fila central, incluindo typecheck/build e as adaptações das fixtures históricas pelos owners. Aprovação runtime e zero ativo transitivo do domínio dependem dessas evidências centrais.
