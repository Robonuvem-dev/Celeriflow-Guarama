# Fiscal runtime assertions — resultado final

## Alterações

- `tests/helpers/postgres-assertion.ts`: novo predicado para `assert.rejects`, com validação estrita do SQLSTATE via `getPostgresError` e da mensagem exata no objeto PostgreSQL da cadeia `cause`. A busca possui proteção contra ciclos e não aceita a mensagem externa `Failed query` como evidência do erro injetado.
- `tests/drizzle-tax-accounting.test.ts`: falhas injetadas de auditoria de restituição e estorno de pagamento exigem `P0001` e a mensagem específica do trigger.
- `tests/drizzle-tax-annual.test.ts`: a auditoria de emissão de guias exige `P0001` e `annual guide audit rollback`.
- `tests/drizzle-tax-catalog-rules.test.ts`: revisão, retorno bancário, convênio, GED ITBI e eventos DTE usam a mesma validação estrita. O cenário ITBI desativa os candidatos históricos na base isolada antes de criar seu único tributo ativo, com mapeamento e perfil próprios.
- `tests/drizzle-tax-active-debt.test.ts`: o setup da capela fornece `personTaxpayerId`, exigido pela validação atual do serviço.

Todos os asserts existentes de rollback, saldos, valores Decimal, sequências, histórico, replay e efeitos atômicos foram preservados.

## Execuções finais

Comando base: `node --conditions=react-server --import tsx --test --test-reporter=tap --test-concurrency=1`, seguido dos arquivos indicados. Cada execução teve limite externo de 180 segundos.

| Recorte | Resultado TAP | Duração | Evidência |
| --- | --- | --- | --- |
| `tests/drizzle-tax-accounting.test.ts` | **17 pass / 0 fail** | 79,48 s | `.next/cache/tax-accounting-assertions-final.tap` |
| `tests/drizzle-tax-active-debt.test.ts` + `tests/drizzle-tax-catalog-rules.test.ts` | **24 pass / 0 fail** | 151,72 s | `.next/cache/tax-debt-catalog-assertions-runtime.tap` |
| `tests/drizzle-tax-annual.test.ts` | **15 pass / 0 fail** | 80,79 s | `.next/cache/tax-annual-assertions-final.tap` |

Total final dos quatro arquivos: **56 pass, 0 fail, 0 skipped, 0 cancelled**. Os totais incluem testes-pai conforme a contagem do Node TAP.

## Diagnóstico intermediário

- `.next/cache/tax-fiscal-assertions-runtime.tap`: primeira tentativa conjunta interrompida pelo limite de 180 s; accounting já havia passado e o cenário de cemitério revelou `Pessoa vinculada à capela é obrigatória.`. Essa execução incompleta não foi usada como resultado final.
- `.next/cache/tax-annual-catalog-assertions-runtime.tap`: annual passou em EXECUTIVE e LEGISLATIVE; catalog revelou o conflito de candidatos ITBI (`Concilie um único tributo ITBI ativo antes de operar declarações.`). O setup local foi corrigido e os recortes finais acima passaram.

Build e verificações centrais ficam a cargo da sessão principal, conforme a divisão de trabalho solicitada.
