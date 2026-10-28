# Financeiro — 12 ferramentas de preparação e inspeção

## Entrega e ownership

Os doze programas transferidos foram lidos individualmente e migrados para Drizzle:

| Programa em `scripts/` | Função testável | Transação |
|---|---|---|
| `prepare-aurora-accounting-actor.ts` | `prepareAccountingActor` | 60 s; advisory lock original |
| `prepare-aurora-bank-resource-sources.ts` | `prepareBankResourceSources` | 120 s; advisory lock + lock da conta |
| `prepare-aurora-budget-posting-matrix.ts` | `prepareBudgetPostingMatrix` | 120 s; lock da preparação e de cada evento |
| `prepare-aurora-finance-control.ts` | `prepareFinanceControl` | 180 s; advisory lock; aquisição CLI de 20 s |
| `prepare-aurora-payment-posting-matrix.ts` | `preparePaymentPostingMatrix` | 120 s; lock da preparação e do evento |
| `prepare-aurora-rap-posting-matrix.ts` | `prepareRapPostingMatrix` | 120 s; lock da preparação e de cada evento |
| `prepare-aurora-rap-registration-matrix.ts` | `prepareRapRegistrationMatrix` | 120 s; lock da preparação e de cada evento |
| `inspect-aurora-annual-reference.ts` | `inspectAnnualReference` | leituras independentes, como na origem |
| `inspect-aurora-rap-reference.ts` | `inspectRapReference` | leituras independentes, como na origem |
| `verify-aurora-annual-readiness.ts` | `verifyAnnualReadiness` | snapshot repeatable read / read only; 120 s |
| `verify-aurora-resource-availability.ts` | `verifyResourceAvailability` | serviço Drizzle com snapshot próprio |
| `repair-financial-year-8081.ts` | `repairFinancialYear8081` | serializable, como na origem |

- **Zero referências Prisma ou Proxy** nos doze scripts e nos novos helpers/mapeamentos.
- Helpers exclusivos: `scripts/lib/finance-setup-tools.ts`.
- Projeções físicas exclusivas: `src/db/schema/finance-setup-tools.ts`, sem DDL. Foram conferidas **34 tabelas / 196 colunas** contra `.agent/drizzle/database-before-2026-10-28T01-26-00.861Z/catalog.json`.
- `SetupActor`, `SetupCatalogEntry`, `SetupScope` e os retornos de leitura são contratos independentes; JSON usa os contratos próprios `JsonValue/JsonObject`.
- Nenhuma edição nos motores, repositórios ou schemas financeiros do outro owner.
- O estado RH e a correção da fixture com savepoints estão em `docs/drizzle-personnel-pages-progress.md`.

## Execução, composição e preservação

- Cada programa CLI abre sua própria `DatabaseConnection`, fecha `pool.end()` em `finally` e conserva os handlers de erro e a saída original. `require.main === module` permite importar as funções para os testes sem executar o CLI.
- Os sete preparadores conservam preview padrão e `--apply`. As funções importáveis recebem `(connection, apply = false)`; os dois inspetores recebem `DatabaseExecutor`; as verificações e o reparo recebem `DatabaseConnection`.
- O reparo 8081 mantém a execução corretiva original, a validação exata de 13 movimentos / duas despesas / zero empenhos ou reservas, a condição do exercício canônico aberto, os nomes e o filtro textual legado, e a auditoria aditiva.
- Escritas de cada preparador, incluindo catálogo, regras e auditorias, usam **a mesma transação real**, aberta por `withDatabaseTransaction`.
- `adoptSetupPostingRule(DatabaseTransaction, actor, input)` é a composição exclusiva do par principal usado pelos quatro programas. Conserva lock `ACCOUNTING_RULE:<code>`, validação das contas, ativação do evento, desativação dos pares substituídos, upsert do par e auditoria `UPSERT`. Nenhum desses scripts fornece substituição de componentes; componentes anteriores continuam intactos e constam da evidência original.
- `adoptSetupBankSources(DatabaseTransaction, actor, accountId, sourceIds)` mantém `FOR UPDATE`, principal obrigatório, fontes conhecidas, bloqueio de movimentos sem fonte, validação de saldos/ordens/retenções para remoção, upserts de permissões e auditoria `CONFIGURE_SOURCES` na mesma transação.
- Reutilizados apenas leitores Drizzle já observados do Financeiro: `getBankResourceSourceBalance`, leitores de `finance/bank-sources`, `getBankAccountBalance`, `inspectAnnualConsistency` e `readResourceAvailability`. Não se passa Drizzle a um helper legado, não se cria outra transação para simular a transação externa.
- Catálogos nascem `DRAFT`, recebem as entradas e só então passam a `PUBLISHED`, respeitando os guards históricos. Hashes oficiais, adoções por ente/UG/ano, códigos externos, aliases de contas, ordem dos pares e registros de autoria foram preservados.
- Mantidos os fingerprints integrais dos dez conjuntos de fatos em Finance/Controle, o fingerprint de tesouraria em fontes e as contagens de lançamentos nas matrizes, com rollback em divergência.

## Escalares e evidência golden

- Os SQL brutos próprios retornam somente locks/fingerprints textuais; leituras temporais e monetárias usam colunas tipadas. Não existe `new Date(rawTimestamp)` ou numeric bruto consumido como number nestes novos leitores.
- O valor inicial monetário é `new Decimal("0")`; verificações de disponibilidade continuam integralmente Decimal, inclusive soma, déficit e superávit. Campos legados de projeção float permanecem com o zero original.
- Datas de política oriundas de entrada (`new Date("2026-01-01")`) mantêm seu significado UTC. O bind raw usa o contrato central `parseInputDatesAsUTC`; nenhum decoder foi duplicado.
- Snapshot pré-edição dos doze scripts: `C:/Users/trici/AppData/Local/Temp/opencode/finance-setup-tools-originals.json`.
- Extração AST readonly desse snapshot confirmou as definições de todas as constantes/hashes e **20 expressões de payload, snapshot e atributos**, com a mesma ordem/chaves/conteúdo. A prova persistente está em `tests/drizzle-finance-setup-tools-ast.test.ts`; a normalização remove apenas casts/parênteses e o acesso tipado `setupObject`.
- Hashes calculados das definições originais, fixados nos cenários reais: Finance/Controle `5f09af7d…`, orçamento `98cf05f3…`, pagamento `c235f129…`, execução RAP `7c7e8a1d…`, inscrição RAP `b45a7fc9…`, fontes `af9887ce…`.

## Validação leve executada

- `tests/drizzle-finance-setup-tools-ast.test.ts`: **2 PASS, 0 FAIL, 0 SKIP**, heap 256 MiB.
- ESLint e parse/imports dos 16 TS de entrega: **zero erros/warnings e zero problemas sintáticos/imports**, heap 256 MiB; 111 imports estáticos e 13 dinâmicos resolvidos, nove subcenários de integração conferidos por AST.
- Conferência física readonly: **196 colunas existentes e tipos compatíveis**; sem divergências de nulabilidade nos campos obrigatórios declarados.
- Nenhuma execução dos programas CLI, apply/seed, PGlite, tsc/build ou operações Git nesta frente.

## Teste real preparado para o parent

`tests/drizzle-finance-setup-tools.test.ts` usa `createSpecializedDrizzleFixture` (replay integral do SQL histórico pelo driver real Neon/Drizzle) e `tests/fixtures/finance-setup-tools.sql` como pré-condições explícitas, sem seed/metadata ORM. Todas as chamadas recebem a conexão local da fixture. Os cenários cobrem:

1. Preview, adoção, replay e desvio do vínculo do responsável; payload exato.
2. Finance/Controle: preview integralmente read-only, falha de unicidade **tardia** após diversas escritas e rollback de toda a preparação; adoção e replay idempotente.
3. Quatro matrizes: hashes golden, pares debit/credit, aliases, componentes, auditorias, duas edições publicadas por ente e replay sem alteração.
4. Inspetores anuais/RAP: prefixos, ordenação e boolean JSON versus string/null.
5. Conta multifonte: preview, adoção, auditoria, fonte principal, replay e alteração do operador rejeitada.
6. Verificações anuais/de disponibilidade: snapshot read-only, autorização parcial/vazia e dinheiro `90071992547409.93 + 0.07 = 90071992547410.00` exato.
7. Composição transaction-only com rollback sentinela do chamador, incluindo a auditoria.
8. Rejeição das seis preparações por UG reassociada a outro ente; recusa de remover fonte com saldo; guard real de catálogo publicado.
9. Reparo 8081: conjunto inválido rejeitado sem alteração, conjunto exato corrigido, 13 valores preservados, evidência antiga mantida e replay sem efeito.

As operações de setup/reparo são realmente commitadas **somente no banco local efêmero** para permitir testar as transações públicas de cada programa. Falhas de um comando são revertidas pela própria transação, sem deixar uma outer transaction abortada. A fixture é fechada no `finally`; o cenário de composição testa adicionalmente o rollback técnico por identidade do sentinela.

Preparado, **ainda não executado nesta frente**. Comandos para a rodada central sequencial:

```powershell
node --max-old-space-size=256 --import tsx --test --test-concurrency=1 tests/drizzle-finance-setup-tools-ast.test.ts
node --max-old-space-size=512 --import tsx --test --test-concurrency=1 tests/drizzle-finance-setup-tools.test.ts
```

Build/typecheck semânticos e execução PostgreSQL permanecem sob a coordenação do parent. O teste AST físico usa o catálogo local fornecido; a suíte PostgreSQL usa exclusivamente o histórico SQL.

## Correção da primeira rodada central — referências históricas

O parent confirmou P1 totalmente aprovado (nove testes incluindo parent) e Works AST com três PASS. A primeira execução FinanceSetup parou **antes dos nove cenários**, em `Bank_compe_key`: a fixture tentava inserir `setup-bank` com COMPE `001`, já criado pelo histórico `20261010130000_add_master_data_foundation` como `bank_001`.

- Removida a reinserção do banco e dos três tributos `tax_iptu`, `tax_itbi`, `tax_issqn`, que a mesma migração já fornece. A fixture valida a existência/atividade e reutiliza as referências históricas sem atualizá-las ou excluí-las.
- A consulta produtiva continua escolhendo o banco por COMPE `001`; a suíte agora verifica que as contas criadas apontam para o ID retornado por esse SELECT.
- Revisados os INSERTs das 156 migrações e os literais de perfil/usuário/ente/UG/ano/catálogo desta fixture. As demais chaves próprias não são fornecidas pelo histórico. A migração de exercícios por ente só deriva linhas de exercícios preexistentes, inexistentes na base histórica vazia nesta fase.
- Constraints/guards e código produtivo preservados. Nenhuma execução pesada feita nesta correção; reteste PostgreSQL permanece com o parent.
