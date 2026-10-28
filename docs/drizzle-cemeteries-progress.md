# Cemitérios — migração Drizzle (reserva exclusiva)

## Contratos e handoff Tax/Portal

Consumidores conferidos por grep antes das mudanças: serviços e páginas da reserva, quatro testes de integração e `src/lib/tributacao/s9-service.ts` (owner Tax). Fonte visual encontrada: `C:/Users/trici/AppData/Local/Temp/opencode/celeriflow-main-sync` (a indicação compactada `...sync5cfa75d` não existe como diretório). Comparação somente por leitura, sem operação Git.

- `lockWorkflowRows(tx, ...)`, `workflowRequest(tx, ...)` e `recordCemeteryFeeEvent(tx, ...)`: **DatabaseTransaction**, sempre a transação da origem.
- `chargeCemeteryFeeEvent(connection, actor, key)` e `publishCemeteryFeeRule(connection, actor, input)`: **DatabaseConnection**, abrem `withDatabaseTransaction`; cobrança continua somente após commit da origem.
- `listCemeteryFeeRules/ListCemeteryFeeEvents/getStructure`: **DatabaseExecutor**. `listStructure/saveStructure`: **DatabaseConnection** para snapshot repeatable-read / mutação atômica.
- Tax: migrar todos os chamadores em `s9-service.ts` desses helpers juntamente com a transação funerária. As actions desta reserva agora passam **`databaseConnection` a TODAS as mutações s9**, incluindo cadastros simples; **`declarantDebtSnapshot(context.database ?? db, taxpayerId)` recebe DatabaseExecutor**. Contrato homogêneo de mutação s9 esperado: DatabaseConnection, com leituras/writes internos pelo `tx` quando houver transação. Os quatro testes usam o mesmo contrato. Conferir também consumidores tributários/portal fora da reserva.
- Tax: `fees-service.ts` agora usa **createTaxAssessmentInTransaction(tx, actor, input)** e **generateTaxGuideInTransaction(tx, actor, input)** com DatabaseTransaction. Não existe adapter que simula `$transaction` ou conexão paralela durante a cobrança. Esses dois cores precisam estar migrados pelo owner Tax para concluir a integração.
- Consumidores externos de s9 (Tributação/portal do servidor) permanecem sob seus owners; handoff de integração ao parent.

## Implementação concluída nesta reserva

- **structure-service:** dez tipos de cadastro, filtros/ordem/paginação de 20, snapshot repeatable-read, lotação, campos adicionais, reativação/inativação, identidade permanente do campo, controle de atualização concorrente, locks ordenados, histórico aditivo e aquisição de lote com fato gerador na mesma transação. Cobrança posterior ao commit mantida.
- **workflow:** locks por linha na transação recebida; advisory lock da chave de solicitação; fingerprint e histórico de replay. Nenhuma reconexão/global writer dentro da transação.
- **fees-service:** publicação serializada por escopo/evento, versões imutáveis, seleção por vigência e precedência específica/global, quatro origens (lote/processo/movimento/concessão), quantidade exata, fato/snapshot imutáveis, execução financeira idempotente com FOR UPDATE, lançamento/DAM e vínculos na mesma transação, status de configuração/responsável/falha e reprocessamento mantidos.
- **Repositórios novos:** `structure.ts` e `workflow-pages.ts`. O SQL estrutural dinâmico se limita às dez tabelas e campos fixos do cadastro; valores parametrizados e decoder `databaseTimestamp` nos dois campos Date realmente retornados. Não há delegate genérico ou API de ORM simulada.
- **DTOs próprios:** `src/lib/contracts/cemeteries-fees.ts` e `cemeteries-workflow.ts`; datas e decimal independente preservados. As consultas tipadas usam mappers das colunas, sem converter valores monetários por Number.
- **UI/actions:** consultas extraídas de StructurePages, processos, detalhe, comprovante, transferências, taxas e reimpressão de guias. Actions gerais, de estrutura, workflow e taxas adaptadas, mantendo autorização, retorno `{ error }`, seleção do usuário, revalidação e serialização.
- **Seed:** `scripts/seed-cemetery-demo.ts` usa o driver Drizzle central, `withDatabaseTransaction`, mesma chave advisory/IDs sintéticos, mesmas chaves de conflito e modo preview/`--apply`. Não foi executado.
- Queries, lookups, anexos e relatórios Drizzle previamente aprovados foram preservados. Nenhuma alteração de schema/DDL/ledger ou arquivos do executor SQL nesta missão.

## Resultados locais executados

1. ESLint de toda a reserva de produção, dois DTOs, seed, seis arquivos de teste e helper próprio: **exit 0**, heap 256 MiB.
2. `tests/cemetery-fees-engine.test.ts`: **3 PASS**, zero falhas, aproximadamente **0,41 s**, heap 256 MiB.
3. `tests/cemetery-static-contract.test.ts`: **3 PASS**, zero falhas, último ensaio em aproximadamente **1,23 s**, heap 256 MiB. A normalização inicial da grafia SQL `timestamp (3)` foi ajustada para a grafia equivalente `timestamp(3)` do catálogo.
   - Sintaxe de todos os fontes da reserva e ausência de imports/consultas do ORM removido.
   - **24 TSX comparados por AST**: **23 com raízes JSX textualmente idênticas**, após somente normalizar CRLF/LF. Em `taxas/guias/[id]/page.tsx`, a única diferença é o namespace escalar `Prisma.Decimal.max(0, total.minus(paid))` → `Decimal.max(0, total.minus(paid))`. Tags, props, textos, CSS e aritmética permanecem iguais; não foi introduzida compatibilidade falsa para conservar o namespace.
   - **218 colunas / 19 tabelas** conferidas por nome/tipo físico/nulabilidade contra `.agent/drizzle/database-before-2026-10-28T01-26-00.861Z/catalog.json`.
   - FK `TaxBurialMovement_deceasedId_fkey` confirmada no catálogo e no histórico: nullable, `ON UPDATE CASCADE ON DELETE SET NULL`; mapeamento já correto, sem edição.

Comandos leves:

```powershell
node --max-old-space-size=256 --import tsx --test --test-concurrency=1 tests/cemetery-fees-engine.test.ts
node --max-old-space-size=256 --import tsx --test --test-concurrency=1 tests/cemetery-static-contract.test.ts
```

## Suites físicas preparadas para o parent

Os quatro testes de integração foram migrados individualmente, conservando suas expectativas e jornadas. A nova fixture **`tests/helpers/cemetery-database.ts`** usa o helper central de transporte sem editá-lo e aplica os SQLs históricos em um banco local independente. Nenhum schema é derivado de DMMF, modelo gerado ou introspecção do próprio Drizzle; não há afrouxamento de campos/defaults/constraints. O pool é limitado a uma conexão porque PGlite tem backend único; os cenários com chamadas concorrentes comprovam invariantes sob fila de execução, sem certificar contenção multissessão real.

- `cemetery-structure-service.test.ts`: 521 causas/paginação/busca, histórico, limite de lote/lóculo, campos inativos/permanentes e concorrência. Acrescentados Date UTC em raw SQL, JSON null distinto de SQL NULL e quadra sem coluna createdAt fictícia.
- `cemetery-fees-service.test.ts`: versões/fatos imutáveis, responsável, replay/quantidade divergente, rollback financeiro, DAM central, filtros e paginação. Acrescentadas origens movimento/concessão, precedência do declarante, movimento sem falecido vinculado, timestamp com milissegundos, proteção contra dupla cobrança de sepultamento e vínculo de lançamento da concessão.
- `cemetery-workflow-service.test.ts`: preservados os nove subcenários de identidade PF, exceções, velório/cremação independentes, agendamento/replay/finalização/espólio, membro com proprietário vivo, transferências sucessivas, cremação sem liberar outro ocupante, destinos/ossuário, finalizações concorrentes e dívida sem truncamento/duplicação. Fixture passou a usar FKs/constraints históricas reais.
- `cemetery-query-attachments.test.ts`: preservados filtros, 521 processos, relatório integral/PDF, GED isolado/idempotente, histórico imutável e emissão automática lote/sepultamento. Acrescentados agenda por scheduledAt, detalhe/comprovante e DTO de reimpressão da guia.

**Não executados nesta frente**, conforme reserva de recursos do parent. Após a migração dos cores/s9 pelo owner Tax, executar centralmente em sequência, por exemplo:

```powershell
node --max-old-space-size=512 --conditions=react-server --import tsx --test --test-concurrency=1 tests/cemetery-structure-service.test.ts tests/cemetery-fees-service.test.ts tests/cemetery-workflow-service.test.ts tests/cemetery-query-attachments.test.ts
```

Limites: checks locais leves não equivalem a aprovação das suites físicas nem a typecheck/build global. Integração das assinaturas externas s9/cores tributários e execução dessas suites são o handoff explícito ao parent/Tax. Sem build/typecheck/PGlite concorrente, acesso remoto adicional, cargas persistentes, commits ou push nesta frente.
