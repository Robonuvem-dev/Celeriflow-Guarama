# Finance legacy stories — portabilidade CI

## Entrega e estado

Os seis arquivos de histórias financeiras agora abrem uma base descartável própria por arquivo, com `createLocalDrizzleDatabase`, replay dos **156 SQL originais** de `prisma/migrations-ibema` e seed SQL explícito independente. Os imports diretos de `dotenv/config` e `@/db/client`, a leitura de `DATABASE_URL` no segundo pool e os seis caminhos de `t.skip` foram removidos desse recorte.

**Validação leve aprovada; runtime e aprovação CI continuam pendentes da fila central e dos contratos compartilhados abaixo.** Não foi executado PGlite, teste de integração, tsc, build, instalação, Git ou escrita remota nesta missão.

Arquivos da entrega:

- `src/lib/financeiro/__tests__/revenue-lifecycle.test.ts`
- `src/lib/financeiro/__tests__/procurement-origin-policy.test.ts`
- `src/lib/financeiro/__tests__/financial-documents.test.ts`
- `src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts`
- `src/lib/financeiro/__tests__/commitment-protocol-gate.test.ts`
- `src/lib/financeiro/__tests__/accounting-close-workflow.test.ts`
- `tests/helpers/finance-legacy-stories-fixture.ts`
- `tests/fixtures/finance-legacy-stories.sql`
- Este documento.

## Contratos da fixture

- Cada arquivo possui `before`/`after` próprios; `db: DatabaseExecutor` recebe **o objeto real** `fixture.connection.db`, e `databaseConnection: DatabaseConnection` recebe `fixture.connection`. Sem mock, emulação Prisma ou cast de conexão/transação.
- A criação de tipo/assunto no teste de protocolo usa `withDatabaseTransaction(databaseConnection, ...)`, mantendo os dois inserts na mesma transação real. `DatabaseExecutor` não expõe `.transaction`.
- O schema vem exclusivamente do replay lexicográfico de cada `migration.sql` histórico, com verificação de 156 arquivos; nenhum DDL é gerado a partir dos mappings. Cada erro de replay identifica a migration original.
- O seed é somente INSERT e é carregado em uma única `DatabaseTransaction` Neon/Drizzle pela conexão da fixture. Constraints, FKs, índices e triggers históricos permanecem ativos.
- Oráculos físicos somente leitura consultam `pg_catalog`: tipos/nullability de seis colunas críticas e estado ativo dos triggers `FinancialAuditLog_append_only` e `TreasuryMovement_multisource_origin_guard`. As expectativas foram transcritas dos SQL históricos, independentemente dos mappings Drizzle.
- `connectionString` é obtida de `local.connection.pool.options.connectionString`, validada como loopback `127.0.0.1`, banco `/postgres`, `sslmode=disable`, e exposta apenas pelo novo helper. A história CSV mantém seu segundo `createDatabaseConnection`, direcionado ao **mesmo backend** do primeiro pool. Seu `pool.end()` fica em `finally` próprio, inclusive se a limpeza falhar.
- `close()` da fixture é idempotente e encerra pool, WebSocket, TCP e banco por meio do helper local existente, que restaura as configurações Neon CJS/ESM. Falha no setup também fecha a fixture. A restauração de ambiente tem `finally` próprio.
- O modo `CELERIFLOW_ACCOUNTING_MODE=POC` é explícito durante a vida da fixture, conforme autorizado para estas histórias de regras de referência. O valor anterior é capturado e restaurado, inclusive quando ausente. Os modos e as restaurações individuais existentes nos cenários foram mantidos.
- A sequência interna das histórias é preservada: os três testes de fechamento contábil compartilham o estado de 2099/2100 dentro de seu arquivo; Lagoa Seca mantém nove histórias e suas limpezas. Os deletes originais, inclusive amplos, recebem apenas o executor local. A auditoria append-only continua preservada pelas limpezas dos cenários.
- Sem dependência de `tests/fixtures/installed-physical-catalog.json`, fixtures Planning, caminhos privados de agente ou seed bootstrap executável. `prisma/bootstrap-test/seed.ts` foi usado apenas como referência de leitura para congelar os dados exigidos pelas histórias.

## Seed congelado: requisito → dados

| Requisito original | Dados explícitos na nova fixture |
| --- | --- |
| Solicitante, aprovador e workflow legal com cinco atores distintos | Cinco `Usuario` ativos, cada um vinculado a um `Employee` distinto, perfil próprio e `sec-fin-01`. Todos têm vínculo de servidor; nenhum ator de postagem depende de fallback ausente. |
| Exercício legado selecionado por `governmentEntityId IS NULL` | `financial-year-2026`, ano 2026, `Aberto`, intervalo UTC completo com milissegundos finais `.999`. 2099/2100/2031 e o ano legal continuam criados pelas próprias histórias. |
| UG/secretaria e dotação da Prefeitura | `budget-unit-fin-01`, código `0101`, secretaria `sec-fin-01`; dotação `0101.04.122.0001.2002.3.3.90.30.00`, inicial/atualizado `1000000.00` e comprometido `100.00`, com espelhos Float originais. |
| Natureza e política de origem | `expense-nature-test-01`, `3.3.90.30.00`, política `NONE`; o cenário de políticas continua criando e verificando `NONE`, `CONTRACT` e `PROCUREMENT_SOURCE`. |
| Natureza de receita e duas fontes | Natureza `1.1.1.0.00.0.0.00.00`, fontes **15000000** e **15010000**, com IDs fixos próprios do seed histórico de teste. |
| Fornecedor principal e divergente | `supp-lagoaseca-01`/`company-lagoaseca-01` e `supp-finance-alternate-01`/`company-finance-alternate-01`, CNPJs originais, mais credor principal. A nova pré-condição torna obrigatório o fornecedor alternativo e garante execução do branch original de divergência. |
| Documento fiscal/GED de liquidação e recolhimento | `doc-nf-lagoaseca-01`, status `Válido`, vinculado à empresa principal. O GED final do fluxo legal continua criado pela própria história com versão `FINAL`. |
| Duas contas analíticas e eventos financeiros | `accounting-plan-debit-test` (`1.1.1.1.1.00.01`) e `accounting-plan-credit-test` (`2.1.1.1.1.00.01`); exatamente uma regra ativa `isReference=true` para cada um dos cinco eventos abaixo. |
| Cinco eventos originais | `EMPENHO_EMITIDO`, `LIQUIDACAO_REGISTRADA`, `PAGAMENTO_EFETIVADO`, `RETENCAO_RECOLHIDA`, `PAGAMENTO_ESTORNADO`. Os quatro eventos de receita continuam criados/configurados pelo teste original. |
| Retenção INSS | `retention-rule-inss-11`, **INSS_11**, base `100.0000`, alíquota `11.0000`, vigência 2026, 20 dias, beneficiário/documento originais. Mantém `110` em Decimal para bruto de `1000.00`. |
| Conta de pagamentos | `poc-robonuvem-checking-10001`, banco **001 - Banco Virtual Robonuvem**, agência `0001`, conta **10001-0**, saldo **300000.00**, fonte `15000000`, UG `0101`. |
| Conta de receitas | `poc-robonuvem-revenue-20001`, conta **20001-1**, saldo **150000.00**, mesmo banco/agência/fonte/UG. |
| Conta de aplicação/transferência | `poc-robonuvem-investment-90001`, conta **90001-4**, saldo **200000.00**, mesmo banco/agência/fonte/UG. |
| Saldo real por fonte | Três `TreasuryMovement` de abertura em `2026-01-01 12:00:00.000`, nos valores acima, **com `resourceSourceId` explícito**. Apenas `BankAccount.currentBalance` não satisfaz o ledger por fonte. Nenhuma inferência de fonte é deixada para produção. |
| Teto de contrato | `proc-licita-01`, número `PROC-LICITA-01`; os contratos de `1000`, os empenhos `800`/`300` e o reforço `200.01` continuam criados e verificados pelo cenário original. |
| RAP e pagamento inexistente | `commitment-rap-fixture-01`, número `EMP-RAP-FIXTURE-01`, valor `100.00`, dotação/fornecedor/credor acima. Não há pagamento inicial. Os RAP `10.00` e `20.00` continuam criados pela história de fechamento. |

São **22 tabelas com INSERT explícito**. O comparativo offline de nomes de colunas e campos obrigatórios sem default contra CREATE/ALTER históricos encontrou zero divergências. Isso não substitui replay físico, verificação runtime de constraints, tipos TypeScript ou execução das histórias.

SHA-256 do seed entregue: `3754026d25472633063d0d626a6e9793b28f06b8a6a70689d218c9bac6d21f23`.

## Cenários e assertions congeladas

Contagem AST anterior às alterações: **16 testes e 160 chamadas `assert.*`**. Após o patch: **16 testes e 167 chamadas**, sendo as mesmas 160 originais mais sete pré-condições de fixture. Nenhuma assertion original foi removida ou alterada; os hashes abaixo coincidem após excluir somente as novas pré-condições. A contagem é de chamadas no fonte, incluindo helpers e loops, não de avaliações runtime.

| Arquivo `.test.ts` | Testes | Assertions originais | Novas pré-condições | `t.skip` antes → depois |
| --- | ---: | ---: | ---: | ---: |
| `revenue-lifecycle` | 1 | 14 | 0 | 0 → 0 |
| `procurement-origin-policy` | 1 | 4 | 2 | 2 → 0 |
| `financial-documents` | 1 | 14 | 2 | 2 → 0 |
| `financeiro-lagoaseca` | 9 | 98 | 1 | 0 → 0 |
| `commitment-protocol-gate` | 1 | 5 | 2 | 2 → 0 |
| `accounting-close-workflow` | 3 | 25 | 0 | 0 → 0 |

SHA-256 de `JSON.stringify` da lista ordenada dos textos AST das assertions originais:

```text
revenue-lifecycle          4c767972e67dfe2f78bba4c14ca07ee5db69da257b8e9d0d3ac58106fc953948
procurement-origin-policy 35c13f432ad42abcd24105179b34c9ed7ce9e0fa06b6d9d7a2d29820e3ec4dc5
financial-documents       93d61da0e8a5bdfcc19e1f5bbe67ff2f20b006c843eaf9ccc158f6e425556b51
financeiro-lagoaseca      7a526afc8ab49275e46c9150b3bd824e064bdf4634896d6afd04f3c7147a2656
commitment-protocol-gate  45659dbf174317196831edb2e4e41b2e4656e1be1e0e54bd19acfb68650a86ec
accounting-close-workflow 4dcd9411f693dd2aadd7bea478571458918d589e127aea82aeb897ce9c16a240
```

Títulos originais preservados:

1. `revenue lifecycle keeps launch, collection, source redistribution and reversal auditable`
2. `enforces the expense nature procurement-origin policy on commitments`
3. `generates linked internal financial documents with each financial fact`
4. `1. Deve rejeitar pagamento sem liquidação (fluxo estrito obrigatório)`
5. `2. Ciclo de Vida Real: Bloqueio de retenção em 'Emitida', Efetivação, Recolhimento e Trava de Estorno (com Limpeza)`
6. `3. Deve bloquear empenhos e reforços que excedem o teto do contrato`
7. `4. Deve validar integridade e alinhamento dos dados da seed da POC`
8. `3.1. Deve importar CSV de forma idempotente e conciliar manualmente em relação um-para-um`
9. `5. Deve gerar RREO, RGF, Balanço Orçamentário e Balanço Patrimonial sem inconsistências`
10. `6. Deve rastrear PPA, LDO e LOA e aceitar publicação no exercício anterior`
11. `7. Deve registrar transferência de tesouraria em movimentos correspondentes`
12. `8. Deve exigir etapas legais, atores distintos, GED final e bloquear alterações após a sanção`
13. `releases a protocol awaiting accounting when its commitment is issued`
14. `requires separate authorization and retains monthly reopening evidence`
15. `finalizes an annual close only after twelve current closed months`
16. `records RAP cancellation and re-registration without creating a payment`

## Handoffs ao parent / owners compartilhados

Os pontos abaixo são **achados estáticos**, não resultados de teste executado. A aprovação integrada depende da conciliação desses contratos pelos respectivos owners.

### Financeiro compartilhado — autorização e legado/ente

1. `financeiro-lagoaseca.test.ts:getActor()` mantém `allowedBudgetUnitIds: []`, tal como a história recebida. `src/lib/financeiro/index.ts:assertActorBudgetUnit` rejeita toda UG quando recebe essa lista vazia. Isso impede os ciclos de despesa/transferência antes de suas assertions finais. Parent: conciliar o ator de teste com o contrato autorizado, preservando a semântica deny-by-default de produção e os cenários.
2. A dotação e as histórias de políticas selecionam explicitamente exercício legado (`governmentEntityId IS NULL`). `resolveAccountingScope` deriva a UG das origens canônicas e exige um vínculo `PlanningEntityUnit`; `postAccountingTransactionInTransaction` exige que o ente resultante coincida com o exercício. Adicionar apenas esse vínculo ao seed ainda conflita com o exercício legado. Parent/owner Financeiro: resolver o contrato de execução legado sem burlar guards nem fabricar vínculo incompatível.
3. `accounting-close-workflow.test.ts` cria 2099 e 2100 sem ente; `reregisterPayableCarryForward` exige ente não nulo da UG e correspondência nos dois exercícios. A fixture não pode alterar inserts internos da história por seed. Parent/owner Financeiro: conciliar esse caso de RAP com o contrato atual, mantendo valores, vínculos, segregação e ausência de pagamento.

### Planning / Platform / RH — grafo de importação global

O scan AST das dependências estáticas runtime alcançou 164 módulos locais e encontrou imports globais ainda existentes fora do recorte:

- `src/lib/planejamento/execution-bridge.ts` importa `@/db/client` e funções de `src/lib/platform/tenant-context.ts`.
- `src/lib/platform/tenant-context.ts` importa `@/db/client` e `src/lib/prisma.ts`.
- `src/lib/rh/payroll-access.ts` importa `@/db/client` e `tenant-context`.
- `src/lib/prisma.ts` ainda executa `createPrismaClient()` no carregamento do módulo, cujo parâmetro default lê `process.env.DATABASE_URL`.

O cliente Drizzle global atual é lazy, mas a inicialização Prisma é eager. Parent/owners Planning, Platform e RH: concluir a remoção ou isolamento dessas dependências no caminho financeiro. As chamadas financeiras exercitadas recebem a conexão/tx local; a fixture não injeta globais nem preenche URL de produção para mascarar o grafo transitivo. O comportamento sem `.env` deve ser confirmado após essa integração.

## Evidências e comandos

Executado com sucesso:

```powershell
node --max-old-space-size=192 node_modules/eslint/bin/eslint.js src/lib/financeiro/__tests__/revenue-lifecycle.test.ts src/lib/financeiro/__tests__/procurement-origin-policy.test.ts src/lib/financeiro/__tests__/financial-documents.test.ts src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts src/lib/financeiro/__tests__/commitment-protocol-gate.test.ts src/lib/financeiro/__tests__/accounting-close-workflow.test.ts tests/helpers/finance-legacy-stories-fixture.ts
```

- Parser TypeScript dos sete arquivos: zero diagnósticos sintáticos; sem criar programa TypeScript ou carregar produção.
- Comparativo AST read-only: os seis hashes originais acima coincidem, títulos/contagens preservados, sete pré-condições adicionais, zero `skip`.
- Scan dos seis fontes: zero `dotenv/config`, `@/db/client`, `DATABASE_URL`, `as unknown`, supressões TS ou `any`.
- Histórico: 156 arquivos originais encontrados. Seed: 22 tabelas verificadas offline, zero coluna desconhecida ou campo obrigatório sem default omitido.
- Scan transitivo: pendências compartilhadas listadas acima; não equivale a aprovação de import/runtime.

**Comando preparado para a fila central, ainda não executado** (processos de teste isolados e arquivos sequenciais):

```powershell
node --conditions=react-server --import tsx --test --test-concurrency=1 src/lib/financeiro/__tests__/revenue-lifecycle.test.ts src/lib/financeiro/__tests__/procurement-origin-policy.test.ts src/lib/financeiro/__tests__/financial-documents.test.ts src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts src/lib/financeiro/__tests__/commitment-protocol-gate.test.ts src/lib/financeiro/__tests__/accounting-close-workflow.test.ts
```

O parent deve validar os mesmos 16 casos sem `.env`, inclusive sob `NODE_ENV=production`, com zero skips e teardown completo. O runner não deve acrescentar preload dotenv nem reutilizar `DATABASE_URL`; a fixture determina sua própria URL loopback. `--conditions=react-server` atende os módulos `server-only` alcançados pelo grafo financeiro. Nenhum resultado das outras suítes centrais é contabilizado como aprovação destas histórias.
