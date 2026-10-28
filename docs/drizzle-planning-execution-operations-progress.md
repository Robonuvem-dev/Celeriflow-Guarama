# Planning execution operations — handoff para ownerPlanning

## Estado da entrega

Os sete motores atribuídos foram migrados na árvore compartilhada. Os sete
arquivos não contêm importação/uso de Prisma, `$transaction`, `$queryRaw`,
`GetPayload`, emulação de client ou casts duplos. Os 17 bindings exportados
coincidem com a baseline
`C:/Users/trici/AppData/Local/Temp/opencode/celeriflow-main-sync`.

**Validação SQL integrada, typecheck e build: pendentes da janela central.**
Esta frente executou somente lint, parsing, inspeção de catálogo/exports e
aritmética pura; a suíte PGlite não foi iniciada.

## Inventário nominal

| Arquivo em `src/lib/planejamento/` | Persistência e contratos preservados |
| --- | --- |
| `activity-relations.ts` | CNAE/CBO → serviço, adoção municipal publicada, ente, exercício, vigência comum, de-para, advisory lock com a mesma chave, fingerprint, sucessão e auditoria atômica. Leitor mantém seleção temporal, ordenação por id, JSON e datas ISO. |
| `legislative-bridge.ts` | Vínculo proposição/lei, autorização Câmara, referência idempotente, lock da peça antes da proposição, cronologia, segregação de responsáveis, sanção/publicação da lei canônica, snapshots e auditoria. |
| `projections.ts` | Elaboração DRAFT, taxas e memória anual cumulativa, HALF_UP em centavos, fonte LOA concluída do mesmo ente, hash de execução, auditoria e timeout de 60 s. |
| `revisions.ts` | Schema UTC de datas, revisão legal de peça sancionada/publicada, valor assinado, replay conferindo autor/motivação/texto/ato, limites históricos, snapshots, efeitos canônicos via `applyLineDelta`, auditoria; histórico com 20 linhas e a ordenação original. |
| `year-rollover.ts` | Mesmo executor recebido do chamador; predecessor LOA publicado do ente/exercício anterior, recusa de ambiguidade, fontes, programas anuais pelo código do novo PPA, definições fiscais completas e sazonalidade original; cotas novas sem realizado, bloqueio, pagamento ou fechamento. |
| `scheduling.ts` | Duodécimos, percentuais, histórico de um/três anos pelo código de programa/ação e classificações, maiores restos, empenho/desembolso separados, transferências no período, estornos vinculados, fechamento, redistribuição, reservas de compra/crédito e contingenciamento com auditoria idempotente. |
| `fiscal-execution.ts` | RCL do ente em 12 competências UTC fechadas, autorização de todas as UGs, classificação redutora e estornos, hashes dos movimentos; renúncia por lançamento/guia, retornos de indisponibilidade/restrição/não conciliação, acompanhamento com revisão legal e auditoria. |

Novos arquivos exclusivos:

- `src/db/repositories/planning-execution-operations/activity-relations.ts`
- `src/db/repositories/planning-execution-operations/scheduling.ts`
- `src/db/repositories/planning-execution-operations/fiscal-execution.ts`
- `src/db/schema/planning-execution-operations.ts`
- `src/lib/contracts/planning-execution-operations.ts`
- `tests/drizzle-planning-execution-operations.test.ts`
- Este documento.

O mapping novo contém as 15 colunas físicas de `TaxBenefitGrant`; é usado como
projeção de leitura pelo motor e para os inserts da fixture própria. Autoridade:
`.agent/drizzle/database-before-2026-10-28T01-26-00.861Z/catalog.json` e SQL histórico.

## Executor, precisão e JSON

- Entradas que abrem transação usam
  `withDatabaseTransaction(planningConnection(context), callback)`.
- Rollover recebe `PlanningTx`/`DatabaseTransaction` e continua nessa mesma origem.
- Os leitores fiscais usam `planningDatabase(context)`. A projeção anual e a
  sincronização de renúncia repassam `database: tx` aos leitores chamados dentro
  da transação; nenhuma leitura dessas rotas troca para o pool global.
- Os três novos repositórios recebem `ReadExecutor`. A RCL usa joins explícitos;
  a chave física única do vínculo de estorno preserva uma linha por movimento,
  mesmo quando referências se repetem.
- Decimal usa `@/db/decimal`, com entrada monetária textual. O SUM de reservas de
  crédito permanece no PostgreSQL e tem decode pelo mapper numeric da coluna.
- Datas são parâmetros de colunas tipadas; não há timestamps raw neste escopo.
  JSON é selecionado por coluna tipada, sem conversão de null para `{}` nos
  retornos. O guard de objeto serve apenas para examinar propriedades.
- Definições fiscais e memória de rollover são validadas com schemas Zod
  `passthrough`; a definição JSON original é persistida integralmente.

## Consumidores conferidos antes das mudanças

- `src/app/app-domain/planejamento/actions.ts`: os dez comandos desta frente
  continuam retornando id; o wrapper mantém `{ error?: string; id?: string }`.
- `PlanningMovementHistory.tsx`: mantém `{ records, total, page }`, campos
  `line.code/description`, Decimal e Date.
- `reports.ts`: RCL e renúncia conservam seus status, rows/total/value/originIds;
  o executor da transação de relatório continua sendo aceito.
- `versions.ts`: mantém a chamada de `copyPlanningYearConfiguration` dentro da
  transação de implantação.
- `planningDateSchema` e `distributePlanningMonths`: mantidos nomes, parâmetros,
  validações e consumidores em Planejamento e testes.
- Busca em `src` e `tests` incluiu todos os usos dos 17 exports, além dos dois
  chamadores tributários descritos no handoff abaixo.

## Evidências locais aprovadas

| Verificação leve | Resultado |
| --- | --- |
| ESLint dos 13 arquivos TypeScript desta entrega | exit 0, sem warnings |
| Parsing TypeScript dos mesmos 13 arquivos | 0 erros |
| Exports dos sete motores versus baseline | 17/17, nenhuma divergência de nomes |
| Mapping `TaxBenefitGrant` versus catálogo capturado | 15/15 colunas; tipos/nulabilidade sem divergências |
| Aritmética de maiores restos versus oráculo BigInt independente | 4 casos PASS; valor grande, distribuição desigual e desempate por mês; nenhum banco aberto |
| Busca de uso direto de Prisma nos sete motores e três repositórios novos | zero ocorrências |

## Suíte SQL preparada para a janela central

`tests/drizzle-planning-execution-operations.test.ts` contém uma fixture própria,
com replay ordenado dos **156 SQLs históricos originais**, usando
`createLocalDrizzleDatabase` e a conexão real Neon/Drizzle sobre PGlite. O seed
não usa fixtures Prisma de Planejamento nem metadados gerados/DMMF. Os 14
subtestes são aguardados sequencialmente e o transporte é encerrado em `finally`.

Cobertura preparada: catálogo físico; oráculo exato de centavos; relações
CNAE/CBO, sucessão e rollback da auditoria; revisão legal e efeitos sobre
dotação/fixação/cotas/outbox; paginação e UG; saldo histórico negativo e vigência;
geração sazonal de cotas; transferências/estornos/desembolso/fechamento e
redistribuição; reservas e contingenciamento; tramitação legislativa e hashes;
rollover, compatibilidade e ambiguidade; RCL, cortes UTC, redutoras/estornos,
referências repetidas e transação READ ONLY/REPEATABLE READ; renúncias por
lançamento/guia, leitura de concessão não commitada pelo próprio executor,
rollback e snapshots; projeções de base informada/histórica e rollback parcial.

Comando para o parent, **depois de integrar as dependências abaixo**, na fila
central e sem concorrência com outros testes pesados:

```powershell
node --max-old-space-size=512 --conditions=react-server --import tsx --test --test-concurrency=1 tests/drizzle-planning-execution-operations.test.ts
```

## Handoff nominal e dependências de integração

### ownerPlanning

1. `PlanningContext` ainda herda `AppContext` com `prisma` obrigatório e
   `database?: Database`. Precisa admitir contexto Drizzle e
   `DatabaseExecutor` para `{ ...context, database: tx }` e a fixture independente.
2. `service.lockPlanningInstrument` ainda recebe transação Prisma na última
   leitura. `projectPlanningAnnualMemory` agora lhe passa `DatabaseTransaction`;
   integrar a versão Drizzle desse helper mantendo o bloqueio de elaboração
   quando o estado não for DRAFT.
3. `versions.ts` ainda tinha transações Prisma na última leitura. O caller de
   rollover precisa enviar o mesmo `DatabaseTransaction` da implantação.
4. Arrays raw seguem pendentes em `planning/scope.ts` e em
   `operations-core.assertWholePiece`. A compilação já encaminhada demonstra que
   a interpolação direta produz SQL inválido com zero/múltiplas UGs. Usar um
   parâmetro de array (`sql.param(array)`), preservando o predicado.
5. A correção já encaminhada de `BudgetMovement.justification` not-null é
   exercitada explicitamente pela nova suíte no caminho de revisão implantada.
6. Esta frente continua disponível para corrigir falhas próprias encaminhadas
   pelo typecheck/build/reteste central; os testes existentes permanecem sob
   ownership de ownerPlanning.

### Owner dos bridges compartilhados / parent

`accounting-bridge.ts` também contém arrays raw em `lockAuthorizedPiece` e no
gate de receitas em `configurePlanningInternalExecution`; integrar a mesma
parametrização. Os sete motores preservam chamadas aos helpers compartilhados
de revisão, snapshots e outbox.

### Owner Tributação, via parent/ownerPlanning

`readMunicipalServiceRelationships` passa a receber `ReadExecutor` (aceita
`DatabaseExecutor`/`DatabaseTransaction`), mantendo os dados retornados. Seus
dois consumidores externos ainda estavam em Prisma na última leitura:

- `src/lib/tributacao/index.ts` — `recordIssDeclaration`, chamada na linha 408.
- `src/lib/tributacao/s4-service.ts` — `emitNfseInTransaction`, chamada na linha 109.

Esses fluxos precisam passar o executor Drizzle da própria transação de emissão/
declaração. A integração não deve abrir outra conexão para ler os vínculos.
