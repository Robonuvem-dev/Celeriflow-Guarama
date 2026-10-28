# Handoff — núcleo tributário Drizzle nativo

## Escopo entregue

- `src/lib/tributacao/index.ts`: operações públicas recebem `DatabaseConnection`; variantes `InTransaction` recebem `DatabaseTransaction`. Consultas e escritas usam Drizzle e os mapeamentos/repositórios de `src/db`, sem fachada Prisma.
- `src/lib/tributacao/scope.ts`: resolução de UG/ente/exercício, compensações e sincronização da dívida usam exclusivamente o executor recebido. Os filtros de acesso agora são predicados SQL Drizzle (`undefined` para acesso técnico irrestrito, `false` para lista vazia).
- `tests/tax-accrual-accounting.test.ts` e `tests/tax-financial-chain.test.ts`: fixture local com histórico SQL original e transporte Neon/Drizzle, consultas nativas e Decimal independente. Preservados os 20 cenários originais e seus asserts de autorização, replay, concorrência, rollback, caixa, VPA, direito original/DA e devolução da dívida.

## Contratos e invariantes

- Permanecem os retornos de entidades e as exceções de domínio dos serviços; Server Actions consumidoras continuam responsáveis pelos próprios contratos de UI.
- Uma única transação percorre lançamento → reconhecimento; baixa → receita → tesouraria → transferência ITBI; parcelamento → cronograma; certidão em isolamento `serializable`.
- Mantidos locks `FOR UPDATE`, numeração por upsert atômico, validação de exercício corrente para arrecadação de dívida histórica, idempotência e fotografia da origem municipal.
- Criar lançamento define explicitamente `Lançado`, evitando propagar o literal com encoding incorreto do mapeamento compartilhado.
- `DebtInstallmentSchedule` e `TaxCaseLink`, sem mapeamento completo em `src/db`, usam SQL parametrizado sobre as tabelas instaladas. Nenhuma instalação/geração de DDL no runtime.
- Erros injetados por triggers continuam validados pelo texto específico da falha; os testes percorrem `Error.cause` porque Drizzle encapsula o erro PostgreSQL. Os asserts de rollback subsequentes permanecem.
- A fixture agora respeita unicidade real de contribuinte/empresa e conta/plano contábil, configura `TAX_CREDIT_COMPENSATED` e publica uma edição contábil de 2027 para o cenário de arrecadação no exercício seguinte.

## Consumidores conferidos

- Actions de operações e guias já fornecem conexões nativas.
- Chamadas transacionais em S2/S3/S4/S9, simulação imobiliária, portal cidadão, cemitérios e obras permanecem na transação fornecida pelo chamador.
- Consumidores de escopo em contabilidade tributária, crédito/estorno, descontos, lotes/virada anual, cadastros, ITBI, certidões, portal e diagnósticos C7 usam o executor nativo.
- Não há consumidores produtivos remanescentes dos antigos objetos `WhereInput` dos dois filtros; o teste da cadeia foi adaptado para predicados nativos e join de guias/lançamentos.
- Busca também encontrou chamadas ainda legadas em `tests/planning-execution.test.ts` (`f.db` em vez de `f.connection` para serviços transacionais); arquivo fora desta frente, para o integrador conferir junto da migração de Planejamento.

## Verificação

- ESLint dos quatro arquivos: **passou**.
- Diagnósticos semânticos TypeScript restritos aos quatro arquivos, com opções do `tsconfig.json`, sem emissão/incremental: **passaram**.
- Diagnósticos semânticos dos consumidores S2/S3/S4/S9, simulação imobiliária, cemitérios, obras, portal cidadão e Actions de operações/guias: **passaram** (10 arquivos, sem emissão).
- `git diff --check` dos arquivos da frente: **passou**. Conferência AST dos asserts contra `HEAD`: accrual mantém **17 rejects / 72 equal / 2 deepEqual**; financial-chain mantém **62 rejects / 115 equal / 2 deepEqual**.
- Reconhecimento/benefício/compensação/estorno/DA/devolução, Executivo: **1/1 passou** na versão corrigida.
- Benefício e compensação autorizada entre contribuintes, Executivo e Legislativo: **4/4 passaram** na versão corrigida.
- Cadeia financeira final: **18/18 cenários passaram** na execução sequencial abaixo (383 segundos no total, incluindo a tentativa de iniciar o arquivo contábil).
- Na mesma execução, o processo de `tax-accrual-accounting.test.ts` sofreu OOM de V8 antes de iniciar os cenários. A execução isolada final desse arquivo **passou: 2/2 cenários**, Executivo e Legislativo, em 214 segundos.
- **Resultado final: 20/20 cenários aprovados**, somando as execuções finais dos dois arquivos.

Comando final (limites locais para reduzir pressão de memória da árvore compartilhada):

```powershell
node --max-old-space-size=512 --v8-pool-size=1 --conditions=react-server --import tsx --test --test-concurrency=1 tests/tax-accrual-accounting.test.ts tests/tax-financial-chain.test.ts
```

Execução contábil isolada para evitar a pressão de memória do ambiente compartilhado:

```powershell
node --max-old-space-size=768 --v8-pool-size=1 --conditions=react-server --import tsx --test tests/tax-accrual-accounting.test.ts
```

Execuções anteriores sofreram OOM de V8 no ambiente compartilhado. A execução inicial completa da cadeia identificou falhas de fixture/encapsulamento já corrigidas; seus resultados antigos não representam o estado final.

Sem commit, push ou build global nesta frente.
