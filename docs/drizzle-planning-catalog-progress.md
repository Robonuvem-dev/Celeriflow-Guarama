# Planejamento — operações de catálogo transferidas

## Escopo e situação

Transferência exclusiva de 12 módulos de `src/lib/planejamento/`, concluída no código: **zero referências diretas ao cliente, tipos ou metadata Prisma nos 12 arquivos**. Os 25 exports públicos conservam nomes e retornos; comandos continuam devolvendo IDs e lançando erros de domínio para o tratamento existente nas actions. A exceção de assinatura de persistência é `supersededPresentationVersionIds`, que recebe agora `DatabaseExecutor`.

Retorno da fila central: **10 filhos PASS; último filho e teste pai FAIL** por colisão de implantação na fixture compartilhada. A correção dirigida do último cenário está preparada para reteste, conforme a seção final. Não foram executados PGlite, build, typecheck pesado ou scripts de dados nesta frente.

| Arquivo | Exports preservados | Persistência/semântica preservada |
| --- | --- | --- |
| `catalog-adoption.ts` | `importSharedReferenceCatalog`, `createCanonicalActivityReference`, `adoptMunicipalCatalog` | Hash dos bytes capturados; referências CNAE/CBO; locks `hashtextextended`; IDs de adoção por hash; filtros LEG/EXEC, ente e UG; vigência, predecessor e sobreposição; referências sintéticas; publicação depois das entradas; auditoria e rollback; timeouts explícitos de 60s nas capturas/adoções. |
| `catalog-presentation.ts` | `currentPresentationEntries`, `supersededPresentationVersionIds` | Hash/ordenação estável das propriedades; revisões nominais não alteram semântica; corte de vigência e ocultação por adoção; filtro JSON diferente de literal null; executor explícito no reader. |
| `catalog.ts` | `createPlanningCatalog`, `saveRevenueAllocation` | Campos TCE/STN, graus e códigos; Decimal de seis casas; lock da natureza antes de consultar rateios; upsert por natureza/fonte; limite 100%; auditoria na mesma transação. |
| `imports.ts` | `importPlanningLines`, `previewPlanningImport`, `importPlanningStructure` | Filtros de entidade/UG/ano; fingerprint original, replay por ator, revisões esperadas; locks ordenados; árvores de objetivos/indicadores Float; programas/ações e conflitos; valores/estrutura/realizado, classificação, códigos e memória do lote; totais incrementais da LOA; rollback por hash divergente. Realizado usa **`database: tx`** no comando e executor explícito na prévia. |
| `maintenance.ts` | `maintainPlanningRecord` | Manutenção de peça e árvore, dependências e deletes; lock de todas as peças relacionadas em ordem; autorização legal, snapshots anteriores/posteriores e `planning.formal_revision_ppa`; preservação dos códigos fechados; memória, renúncia, obras, prioridades/riscos; `classificationSnapshot` ausente grava SQL NULL; agregações SQL de totais com decodificação Decimal; timeout 60s. |
| `reduced-codes.ts` | `setPlanningReducedCode`, `reorderPlanningExpenseCodes` | Peça draft, UG autorizada, bloqueio após implantação/execução, lista completa/distinta, limpeza prévia dos códigos e ordem de atribuição; auditoria e unicidade transacionais. |
| `amendments.ts` | `parsePlanningItems`, `setPlanningAmendmentBlock`, `createLegislativePlanningAmendment`, `decideLegislativePlanningAmendment` | Parser Decimal e códigos; vereador ativo, bloqueio, autoria distinta, revisão e alcance de UG; sanção parcial/replay, datas, reduções antes dos acréscimos; `applyLineDelta`/snapshots/auditoria na transação de origem. |
| `credits.ts` | `createPlanningCreditPreview`, `transitionPlanningCredit` | Conservação por fonte, limites de origem, reservas, lock da dotação, fallback Float/Decimal; agregação SQL exata de reservas e agrupamento Decimal histórico dos lotes; replay por payload; segregação, ato único, stages, cancelamento; writers legais/itens financeiros/outbox/auditoria na mesma transação. |
| `budget-availability.ts` | `getImplantedPlanningBudget` | LOA implantada e escopo; paginação 20 e ordenação código/ID; reservas ativas, créditos abertos, cotas/contingências e comando pendente; mínimos/máximos Decimal e DTO anterior. |
| `legacy-reconciliation.ts` | `reconcilePlanningLegacyAppropriation` | Lock da dotação, peça/classificação/cadeia/exercício/UG e vínculo prévio; igualdade original/atualizado; fallback Float sem sobrescrever execução; fixação canônica, comando com hash, replay e auditoria. |
| `monthly-execution.ts` | `readPlanningMonthlyExecution` | Autorização de relatórios/Financeiro, LEG/EXEC/UG, LOA/ano, conexão por metadata; corte temporal e prefixo literal `finance:`; 12 meses por linha; estornos líquidos e pagamento bruto; paginação e DTO anterior. |
| `hearings.ts` | `registerPlanningHearing`, `registerCommunityDemand`, `decideCommunityDemand` | Audiência draft, data e ata; unidade responsável no mesmo ente e no escopo; decisão condicional `PENDING` com `RETURNING`; auditoria e alteração revertidas juntas. |

## Arquivos auxiliares exclusivos

- `src/db/schema/planning-catalog-operations.ts`: projeções de `PlanningCommunityDemand`, `PlanningLegislativeAmendment`, `PlanningAmendmentItem` e `PlanningImportBatch`; projeção apenas de existência de `TaxServiceActivity(id)`. Sem DDL novo.
- `src/db/repositories/planning-catalog-operations/records.ts`: lock draft com reconsulta autorizada; leitura de linha autorizada; posição de leitura por `DatabaseExecutor`; captura/cópia explícita da árvore programa → objetivos → indicadores na transação fornecida.
- Os schemas existentes `planning-budget`, `planning-legal`, fontes financeiras, identidade, cadastros, Câmara e Tributação foram somente consumidos.
- Writers financeiros/legais compartilhados continuam recebendo a `DatabaseTransaction` original. Nenhum proxy, API ORM simulada, cast de compatibilidade ou segunda conexão para esses efeitos.
- Projeções temporais tipadas passam pelo mapeamento das colunas Drizzle. SQL bruto novo de runtime retorna somente locks/configuração ou soma `numeric::text`, decodificada com `new Decimal(string)`; não há DTO temporal bruto novo a converter.

## Consumidores e handoffs nominais

### Contratos externos que o owner de Planejamento precisa integrar

1. **`src/lib/planejamento/execution-bridge.ts` — `readPlanningFinancialExecution`:** o parâmetro atual `Pick<AppContext, "user" | "database">` restringe `database` a `Database`. Generalizar essa dependência para `{ user: ...; database?: DatabaseExecutor }` (ou equivalente explícito). `imports.ts` fornece `tx` na efetivação e o executor selecionado na prévia. Não substituir por conexão global, nem abrir transação interna. Enquanto a declaração não for ajustada, esse é um bloqueio semântico conhecido da integração.
2. **`src/lib/planejamento/access.ts` — `PlanningContext`:** ainda herda o client obrigatório de `AppContext`. Desacoplar o contrato de Planejamento desse client durante a migração do core. A fixture nova entrega somente `{ user, jurisdiction, connection, database }`, intencionalmente sem client falso/cast; sua atribuição depende dessa adequação pelo owner. `database` deve aceitar `DatabaseExecutor` quando reutilizado em leitores compartilhados.
3. **`service.ts` / demais módulos do owner:** os módulos transferidos usam `lockCatalogDraftInstrument` para a semântica draft e não dependem do `lockPlanningInstrument` ainda legado. `operations-core.ts`, `classification.ts`, `scope.ts`, `instruments.ts` e `snapshots.ts` são consumidos pelos contratos Drizzle já presentes. `revisions.ts` é consumido apenas pelo validador `planningDateSchema`; a remoção do seu runtime legado permanece com o owner.

### Consumidores públicos existentes localizados

- `src/app/app-domain/planejamento/actions.ts`: 19 comandos destes módulos e `previewPlanningImport`, todos mantidos pelo nome/retorno. Preservado o contrato de UI `{ id?, error? }` das actions, sem edição das actions.
- `src/lib/financeiro/account-catalog.ts` e `src/lib/financeiro/accounting-source-dimensions.ts`: `currentPresentationEntries`, sem mudança de argumentos/resultado.
- `tests/catalog-presentation.test.ts`, `tests/planning-operations.test.ts`: helpers puros `currentPresentationEntries` e `parsePlanningItems`, sem mudança de estrutura.
- `tests/planning-postgres.test.ts`: catálogo/rateio, audiência, importação, emendas, créditos, códigos, disponibilidade e conciliação.
- `tests/planning-completion.test.ts`: manutenção, importação/prévia e estrutura.
- `tests/planning-accounting.test.ts`: conciliação e créditos.
- `tests/planning-execution.test.ts`: execução mensal e créditos.
- `tests/municipal-catalog-adoption-postgres.test.ts`: adoções e sucessões municipais.
- Estes testes e suas fixtures permanecem com o owner de Planejamento. Precisam receber a conexão/executor do mesmo backend para consumir os comandos migrados; client antigo dentro da fixture não encaminha chamadas automaticamente.
- Antes da alteração, `supersededPresentationVersionIds` não tinha consumidor fora de sua própria declaração em `.ts/.tsx/.mjs`. Seu novo consumidor é a suíte própria. Nenhum consumidor dos exports transferidos foi localizado nos scripts.

## Testes próprios preparados

`tests/drizzle-planning-catalog-operations.test.ts` usa exclusivamente `tests/helpers/planning-catalog-operations-fixture.ts` + transporte local `createLocalDrizzleDatabase`:

- Replay **integral e ordenado dos 156 SQLs históricos**, sem DMMF, fixture de domínio de outro owner ou banco remoto; FKs, índices, triggers e funções vêm do histórico original.
- Transporte real Neon/Drizzle/PGlite; uma fixture e subtestes sequenciais; fechamento do pool/transporte antes do banco.
- Comparação das 49 colunas projetadas com tipos/nullability PostgreSQL reais depois do replay.
- Captura, hash de bytes, CNAE/CBO, adoção/replay/sucessão, escopos NEGADOS, JSON aninhado/null e congelamento por trigger.
- Revisões nominais, corte temporal e filtro JSON null do reader de versões substituídas.
- Rateios de seis casas, soma 100%, replay e rollback por excesso.
- Imports com Decimal acima da precisão inteira de Number, físicos de quatro casas, Float dos indicadores, prévia/hash/revisões/replay/rollback, cópia da árvore e fontes; importação de realizado da LOA anterior com receita/caixa reais e totais da LOA de destino.
- Manutenção de memória e linha, SQL NULL da classificação, dependências, ordenação de códigos, colisão e congelamento após implantação.
- Audiência/data/ata, ente/UG, decisão condicional e falha de auditoria que reverte o status.
- Crédito com reserva, insuficiência, segregação, stages/replay e ato; falha SQL no segundo delta prova rollback do primeiro delta, snapshots, revisão, comandos e status; snapshots conservam versão documental e hash.
- Emenda, bloqueio, autoria, replay, imutabilidade, originais preservados e revisão formal da árvore fechada.
- Vínculo legado sem alteração dos saldos, replay; disponibilidade com reservas/cotas/contingência/pendência e execução mensal com filtros de data/prefixo/estorno/pagamento bruto.

**Pendente da fila central:** repetir a suíte após a correção de isolamento descrita abaixo e concluir a integração dos contratos compartilhados. O primeiro retorno central confirmou os dez filhos anteriores; o último ainda não tem PASS. Prova de contenção entre sessões PostgreSQL independentes ainda pertence à janela central, não é inferida de ausência de Prisma ou de parsing.

Comando para a fila central, após os handoffs de contexto/executor:

```powershell
node --conditions=react-server --import tsx --test --test-concurrency=1 tests/drizzle-planning-catalog-operations.test.ts
```

## Evidência leve obtida

- ESLint dirigido dos 12 módulos + repository/schema novos: passou com heap de 128 MB.
- ESLint dirigido da suíte/fixture novas: passou com heap de 128 MB.
- Parse AST e resolução de imports/exports locais: **16 arquivos / 166 imports**, sem falhas, heap de 128 MB. Não é typecheck semântico.
- Conferência final de espaços finais, nova linha e marcadores de conflito nos **17 arquivos próprios** (incluindo este documento): passou, sem usar Git.
- Auditoria estática do schema novo contra `.agent/drizzle/database-before-2026-10-28T01-26-00.861Z/catalog.json`: **5 projeções / 49 colunas**, nomes, tipos e nullability correspondentes. Autoridade de defaults, FKs, checks, índices e triggers continua sendo o catálogo/histórico SQL; execução integrada pendente.
- Varredura dirigida de referências diretas ao client/metadata legado nos 12 módulos: zero.

Inventário nominal histórico dos 94 scripts financeiros permanece com o gate AST do parent, conforme a transferência. Não bloqueia esta entrega do motor de catálogo.

## Retorno central e correção da fixture — 28/10/2026

### Falha recebida e origem exata

O parent executou `tests/drizzle-planning-catalog-operations.test.ts`: **12 testes reportados, 10 PASS / 2 FAIL**, contando o teste pai e os onze filhos. Os dez filhos anteriores passaram; o último, `legacy binding preserves balances and replay; availability/monthly readers retain filters`, falhou no `UPDATE PlanningInstrument.implantedAt`, e o pai refletiu essa falha.

O índice parcial histórico `planning_one_implanted_budget_entity_year`, em `prisma/migrations-ibema/20261011180000_planning_legal_operations/migration.sql:2`, permite somente uma LOA com `implantedAt IS NOT NULL` por `(governmentEntityId, startYear)`.

O registro anterior é **`maintenance:piece-loa`**, criado por `f.chain("maintenance")` no exercício padrão 2026 e implantado explicitamente na linha 164 do teste para verificar o bloqueio de códigos reduzidos. O cenário legado também usava o padrão `co-entity/2026`. O fluxo de créditos e seus helpers de deltas/revisão não gravam `implantedAt`; a origem da colisão nesta suíte é o cenário de manutenção, não a execução do crédito.

### Patch dirigido

Somente o último subteste foi ajustado em `tests/drizzle-planning-catalog-operations.test.ts`:

- `const year = 2027` e `f.chain("legacy", { year })` separam a nova implantação em **`co-entity/2027`**.
- A opção já existente do helper propaga o ano para `FinancialYear`, cadeia PPA/LDO/LOA, instrumentos, linha e dotação canônica. O helper não precisou ser alterado.
- Implantação, reserva, cinco eventos e corte de leitura usam esse mesmo ano, mantendo janeiro e o evento de 1º de fevereiro fora do corte de 31 de janeiro.
- Foram acrescentadas verificações do exercício devolvido pela disponibilidade/linha mensal e rejeição explícita de `readPlanningMonthlyExecution` quando chamado com 2026 para a LOA de 2027.

O índice original e os registros de manutenção permanecem ativos. Não houve DROP, desativação de guards, limpeza/downgrade da implantação anterior, alteração de leitores ou mudança nos 12 módulos de produção.

### Conferência dos valores, códigos e nulls antes do patch

- Preservados `legacy:E1`, seus vínculos de programa/ação/dotação/fixação, ente executivo, UG `co-unit`, fonte `co-source`, natureza de despesa e IDs/chaves dos eventos. A natureza de receita continua nula nessa linha `EXPENSE`; a referência de receita cadastrada com 2026 não é usada pelo cenário.
- O desligamento temporário de `appropriationId: null`, a reconciliação, o replay e a rejeição de memória divergente continuam exercitados.
- Saldos Float/Decimal esperados: **100.11 / `"100.11"`**, sem alteração.
- Disponibilidade: orçamento `100.11 − 0 − 2.01 − 0 − 5.00 = 93.10`; limite da cota `100.11 − 10.01 − 5.00 − 2.01 = 83.09`; resultado esperado **`"83.09"`**, página **1** após entrada `"999"` e pendência contábil **true**.
- Execução de janeiro: `10.01 − 0.01 = "10.00"`; pagamento bruto **`"2.01"`**. Permanecem excluídos o consumo futuro de **50.00** e o produtor `manual:` de **99.00**. IDs esperados continuam **`co-consume`, `co-pay`, `co-reverse`**.
- Mantidas as **12 linhas mensais** e o estado **`INCOMPLETE`**: só há cota de janeiro; meses sem cota continuam com `realized`/`paidGross` nulos e sem eventos. Nenhuma cota ou linha fictícia foi adicionada para mudar esse estado.
- Todas as assertions originais de saldo, replay, paginação, escopo legislativo, totais e filtros de eventos foram conservadas; o gate de exercício recebeu verificações adicionais.

### Validação desta correção

- ESLint dirigido do teste, `--max-warnings=0`, heap 128 MB: **PASS / exit 0**, sem warnings.
- Parsing TypeScript do teste e helper: **2/2 PASS**, heap 128 MB.
- **Reteste SQL pendente do parent.** Os 10 PASS anteriores são o resultado central recebido; não foi declarado PASS do cenário corrigido nem da suíte completa nesta frente.
