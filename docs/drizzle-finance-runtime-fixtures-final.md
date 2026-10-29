# Handoff — fixtures financeiras e diagnóstico runtime

## Escopo e origem

Analisados individualmente os logs UTF-8 `.next/cache/final-validation/unit-tail/{019,058,060,065,068,069,070}.tap` e os sete testes correspondentes, além de `tests/helpers/planning-execution-fixture.ts`.

**Resultado final da segunda entrega: 20 PASS / 0 FAIL, sem skips**, nos quatro recortes adicionais e producers. O cenário P4 antes bloqueado pelo JOIN patrimonial passou. Considerando os resultados direcionados anteriores dos demais arquivos, o escopo acumulado tem **38 cenários distintos passando** (sem contar novamente os seis de producers). A primeira entrega havia terminado em 23 PASS / 1 FAIL. ESLint dos arquivos da segunda rodada: **PASS**.

## Ajustes realizados

- **Consumo de materiais:** criada a cadeia referencial que faltava na fixture: fornecedor, dotação, empenho, liquidação `comprovacao`, almoxarifado, categoria, material e estoque. Mantidos os testes de conservação dos cinco centavos, devoluções sucessivas, excesso com rollback e cancelamento da origem somente depois da devolução integral.
- **Índices fiscais:** publicada uma edição explícita de classificação das contas analíticas `debito`, `credito` e, no primeiro cenário, `outro`, com natureza D/C, autorização de escrituração e vigência em 2026. As condições de fechamento, acesso integral, base positiva e sobreposição de componentes continuam sendo verificadas.
- **Execução de planejamento:** a fixture instala regras `isReference: true`; agora delimita explicitamente `CELERIFLOW_ACCOUNTING_MODE=POC` durante seu ciclo de vida e restaura o valor anterior no fechamento ou falha de construção. Não homologa artificialmente as regras. Não altera assinaturas, parâmetros ou estrutura do retorno. Consumidores localizados por grep em todos os testes antes da alteração.
- **Prefixo da suíte:** lido também `.next/cache/unit-final.log` conforme orientação do parent. No schema atual `AccountingPostingRule` não possui `effectiveFrom`/`effectiveUntil`; o bloqueio comum observado no helper era o uso de regras de referência sem o modo POC exigido. Os exercícios continuam vindo do parâmetro `year`, inclusive 2025. Nenhum arquivo adicional de annual/banking/advances foi expandido nesta tarefa; o parent centraliza o reteste do prefixo.
- **Transporte das fixtures:** os sete testes deste escopo agora reutilizam `fixture.connection`, que já é uma conexão Neon/Drizzle de produção sobre o banco isolado. Não abrem uma segunda ponte `connectFinanceDrizzleFixture` para o mesmo PGlite. Mantidos todos os testes de chamadas concorrentes; o pool original continua permitindo conexões concorrentes. A mudança elimina duas camadas de servidores de sockets com gerenciamento independente sobre a mesma instância física. Não modificado o helper compartilhado de transporte.
- **RAP:** conservados os exercícios de origem 2025 e execução 2026; a data corrente das operações de estorno fica explícita em setembro de 2026, restaurando o relógio no `finally`. No RAP não processado, adicionada conferência de que a primeira confirmação persiste `Payment.status = Paga` antes do replay, para localizar a falha posterior sem afrouxar a idempotência exigida.
- **OFX/OFC:** os três cenários de persistência agora localizam por COMPE `001` o banco já semeado pela migração `20261010130000_add_master_data_foundation`. Não tentam inserir um segundo banco com o mesmo COMPE; vínculo da conta bancária usa o ID preservado da migração.
- **MSC:** a falha original é `ENOENT` no carregamento do JSON oficial, não export/import de módulo. Recuperada a planilha da URL oficial `https://thot-arquivos.tesouro.gov.br/publicacao-anexo/28661` e executado o gerador existente `scripts/prepare-msc-2026-layout.mjs` em diretório temporário, sem editar o script nem o runtime. Preservado o JSON resultante em `tests/helpers/MSC_STN_2026_20260708.json`; o teste agora lê esse arquivo por URL relativa ao próprio módulo.
  - SHA-256 XLSX: `a260f4fafb40d8d19c91113237c8249a619eed815d5fcc0fb6bd2c6cf0482c37`.
  - SHA-256 JSON UTF-8/LF: `8919bc6ffe4448aa0775da66f0e3af98c965f5d9792a9b47e4a77dfa467286cd`.
  - Ambos coincidem exatamente com o contrato de captura do runtime; 6.119 contas, nove tipos de informação complementar e seis pares de informações. Nenhum hash ou validação de referência foi relaxado.

## JOIN patrimonial — correção autorizada na segunda entrega

`financial-producers-p3-p4.test.ts`, cenário P4, chega ao SQL em `src/lib/patrimonio/valuation-accounting.ts:21`:

```sql
LEFT JOIN "PurchaseReceipt" r ON r.id=i."purchaseReceiptId"
LEFT JOIN "Commitment" c ON c.id=r."commitmentId"
```

`PurchaseReceipt` não possui `commitmentId` no baseline SQL nem em migrações posteriores. O vínculo real é `Commitment.purchaseReceiptId`, com FK para `PurchaseReceipt.id`. A consulta inválida acontece mesmo para bem sem recebimento, antes de alcançar a validação esperada `/explicitamente/i`.

Após autorização, corrigido para `LEFT JOIN "Commitment" c ON c."purchaseReceiptId"=r.id`. Nenhuma assinatura, retorno, guard de UG ou operador LEFT/INNER JOIN foi alterado.

### Cardinalidade e varredura da mesma classe

- Schema `src/db/schema/procurement-requests.ts:44–48`: `PurchaseReceipt` não possui `commitmentId`.
- Schema `src/db/schema/finance-budget.ts:18–19` e baseline `prisma/migrations-ibema/20261009232000_baseline/migration.sql`: `Commitment.purchaseReceiptId` é opcional, tem FK para `PurchaseReceipt.id` e índice único `Commitment_purchaseReceiptId_key`. Logo, cada recebimento possui no máximo um empenho vinculado, sem multiplicar a seleção patrimonial.
- Consumidores de `valuation-accounting` encontrados em `asset-lifecycle.ts` e `valuation-reversal.ts`; preservados contratos e erros.
- Busca global por referências SQL do recebimento ao empenho encontrou cinco consultas inválidas, analisadas individualmente e corrigidas:
  1. `src/lib/patrimonio/valuation-accounting.ts`: origem do bem para valoração, estorno e alienação.
  2. `src/lib/patrimonio/asset-lifecycle.ts`: elegibilidade de depreciação por UG.
  3. `src/lib/patrimonio/asset-acquisition-service.ts`: UG de origem do tombamento.
  4. `src/app/app-domain/patrimonio/ciclo-vida/page.tsx`: filtro de acesso dos bens.
  5. `src/app/api/patrimonio/referencias/route.ts`: filtro de acesso das referências de bens.
- Busca posterior sem ocorrências restantes de `r."commitmentId"` em SQL de produção. Os 11 arquivos da auditoria de subconsultas não foram editados.
- Pendência fora dos recortes, comunicada ao parent: `src/lib/patrimonio/__tests__/drizzle-fixture.ts:39–42` ainda fabrica `PurchaseReceipt.commitmentId` e não define `Commitment.purchaseReceiptId`. O consumidor `asset-acquisition-service.test.ts:18` insere o recebimento sem lista de colunas. Essa fixture legada precisa ser alinhada ao vínculo real; não foi usada como justificativa para manter coluna inexistente no runtime.

### Quatro recortes adicionais

Lidos individualmente `.next/cache/final-validation/prefix-finance/{0,7,9,11}.tap` e `advance-prior-year-refund.test.ts`, `annual-payment-program-transport.test.ts`, `asset-valuation-accounting.test.ts`, `carry-forward-transport.test.ts`.

- Adiantamentos, programação anual e transporte RAP abriam uma segunda ponte para o mesmo PGlite; agora reutilizam `f.connection`. Preservados todos os montantes, parcelas, exercícios de origem/destino, concorrência e rollback.
- Adiantamentos: teardown restaura o modo anterior depois de fechar a fixture e restaura explicitamente o relógio.
- `financeDatabaseError` já exige mensagem na causa com SQLSTATE PostgreSQL válido; mantido sem afrouxamento. Não aceita apenas ocorrência do texto nos parâmetros do SQL.
- Valoração patrimonial já usa uma única conexão; fixture e asserções permanecem intactas nesta rodada.
- Execução sequencial dos quatro arquivos e `financial-producers-p3-p4.test.ts` com `node --conditions=react-server --import tsx --test --test-concurrency=1`: **20/20 PASS**, código 0, sem skips/cancelamentos, duração de 731.972 ms (aproximadamente 12min12s).
  - `advance-prior-year-refund.test.ts`: **4/4 PASS**, ambos os poderes, restituição de exercício anterior e cancelamento do corrente.
  - `annual-payment-program-transport.test.ts`: **4/4 PASS**, ambos os poderes, lote incompleto, cópia, retenções, retorno bancário e desmovimentação.
  - `asset-valuation-accounting.test.ts`: **2/2 PASS**, ambos os poderes, depreciação, concorrência, ajustes e estornos Decimal.
  - `carry-forward-transport.test.ts`: **4/4 PASS**, ambos os poderes e tipos RAP, preservação da origem, liquidação herdada e transportes sucessivos.
  - `financial-producers-p3-p4.test.ts`: **6/6 PASS**, incluindo alienação e rollback em mês fechado, antes bloqueados.
- ESLint dos cinco runtimes e cinco arquivos de teste: **PASS**, código 0. Nenhum `src/lib/financeiro` genérico editado por este agente.

### MSC — contagem correlacionada de versão, corrigida externamente

Depois de recuperar a captura, os dois testes de versionamento avançam até a segunda chamada idempotente de `captureMscReference2026`, que recusa a referência como divergente. Recorte diagnóstico no banco isolado confirmou:

- captura publicada com `sourceHash` correto;
- contagem direta por `versionId`: **13.673 entradas**;
- `findMscCatalogVersion` retorna `_count.entries: 0`.

Local: `src/db/repositories/finance/msc-configuration.ts:35`. A subconsulta correlacionada interpolava `planningCatalogVersions.id` em uma seleção de tabela única; a geração SQL do Drizzle removia a qualificação da coluna externa, deixando `"id"` resolver no escopo interno. A sessão responsável corrigiu externamente a correlação para `e."versionId"="PlanningCatalogVersion"."id"` durante esta tarefa. Na rodada final, **MSC 3/3 PASS**, incluindo os dois replays. Não removida a asserção de replay nem a validação de quantidade de entradas; este agente não editou o runtime.

## Validação

- ESLint dos sete testes e do helper de execução: **PASS**, saída vazia, código 0.
- Primeira validação direcionada, concorrência de arquivos igual a 1: materiais **2/2 PASS**, índices **3/3 PASS**, RAP processado executivo **PASS**. Falhas posteriores observadas e mantidas para diagnóstico:
  - RAP processado legislativo: saldo `97.75` em vez de `100.00` depois de `reversePayment`.
  - RAP não processado, ambos os poderes: segunda confirmação de pagamento tenta duplicar o índice único `PayableCarryForwardEvent_payableCarryForwardId_paymentId_action` para `PAGAMENTO_RASTREADO`.
  - OFX/OFC: COMPE duplicado na fixture, corrigido conforme descrito acima; nova execução em andamento com MSC.
- Conferidos os caminhos de runtime `updatePaymentStatusInTransaction`, `reversePaymentInTransaction`, `recordNativeCarryForwardPaymentEvent` e os repositórios de pagamentos/RAP: o primeiro contém retorno antecipado quando o status lido já é `Paga`. A causa das falhas posteriores precisa ser confirmada; nenhum guard, índice único ou asserção de idempotência foi removido.
- Segunda rodada (antes da remoção da ponte duplicada): OFX/OFC **6/6 PASS** e agregação MSC **PASS**; dois testes MSC bloqueados pela contagem descrita acima. RAP não processado, após relógio explícito de execução, **2/2 PASS**. Processado apresentou resultados variáveis no estorno, incluindo status da inscrição não atualizado e FK de `AccountingEntry.transactionId` ausente após inserção da transação. Mantidas essas evidências, sem atribuir definitivamente a falha à regra de negócio.
- Rodada final dos cinco arquivos producers/MSC/RAP/OFX usando somente `fixture.connection`: **18 PASS / 1 FAIL**, 19 cenários, aproximadamente 379 segundos, sem skips.
  - Producers: **5/6 PASS**; somente P4 bloqueado pela coluna inexistente `r.commitmentId`, com SQLSTATE `42703` confirmado em `error.cause`.
  - MSC: **3/3 PASS** após correção externa do repositório.
  - RAP processado: **2/2 PASS**, Executivo e Legislativo; status persistido de estorno e saldo conferidos.
  - RAP não processado: **2/2 PASS**, Executivo e Legislativo; confirmação/replay, concorrência, custos e estornos conferidos.
  - OFX/OFC: **6/6 PASS**, inclusive concorrência, bytes originais, hashes e rollback.
- Materiais e índices também foram ajustados para reutilizar a conexão original após a confirmação da fragilidade de transporte; reteste final: **5/5 PASS**, aproximadamente 73 segundos, sem skips (materiais **2/2**, índices **3/3**).
- Nenhum build, tsc, suíte geral, npm ou comando Git executado.
