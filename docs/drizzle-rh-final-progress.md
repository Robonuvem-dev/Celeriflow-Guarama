# RH residual — progresso e handoff

**Resultado: INCOMPLETE** — pendência principal em `hr-workforce-service.test.ts` e validação dos cenários de viagens ainda em curso.

## Estado atual

- Actions em `src/app/app-domain/rh/{beneficios,esocial,folha,folha/eventos,operacoes,ponto}/actions.ts` e `servidores/benefitActions.ts`: acessos nativos Drizzle; contratos públicos de retorno mantidos.
- `src/app/api/rh/integracoes/[id]/route.ts`: seleção nativa, origem obrigatória, verificação de UG, demonstrativos ordenados por ID e mesmos cabeçalhos/JSON.
- Locks advisory, locks de linha, validação de histórico, titularidade e bloqueios de origem integrada preservados.
- `hr-documentary-reports`, `hr-role-legal-history`, `municipal-travel-allowance`, `payroll-municipal-costs`, `payroll-provision-accounting`, `travel-refunds`: consultas e chamadas de serviço convertidas para Drizzle; asserts financeiros/rollback/replay mantidos. Erros de triggers usam `financeDatabaseError` para examinar a causa PostgreSQL real.
- `tests/helpers/personnel-financial-regression-queries.ts` já era nativo; utilizado para preservar exigência de linha obrigatória e carregar relações explicitamente.
- Nova fixture documental mínima: DDL extraído do SQL histórico, dados escritos com Drizzle/PGlite real (sem delegates simulados).

## Validação

- Documentação Next local de mutações e route handlers e `AGENTS.md` lidos antes das alterações.
- `node --conditions=react-server --import tsx --test tests/hr-documentary-reports.test.ts`: **2/2 passou**.
- ESLint dos arquivos alterados: sem erros; aviso de variável não usada da primeira execução corrigido.
- Execuções financeiras iniciais sofreram pressão de memória da árvore compartilhada. Execução sequencial com `--max-old-space-size=512 --v8-pool-size=1` em andamento; registrar resultado final abaixo.
- Typecheck global atingiu heap de 2 GB; tentativa dirigida expirou em 120 s sem diagnóstico. Não há confirmação de typecheck completo.
- Importação dos oito módulos de actions/rota via TSX com `react-server`: passou (`RH modules imported`).
- `payroll-municipal-costs`: a execução sequencial de heap limitado reportou os seis casos aprovados, incluindo rollback por regra ambígua e estorno das apropriações.
- `payroll-provision-accounting`: a mesma execução reportou os dois casos (Executivo/Legislativo) aprovados, preservando rollback, replay, pagamento e baixa por componente.
- A fixture compartilhada passou a executar todo o histórico SQL. Removido de `hr-role-legal-history` o antigo drop/replay redundante que tentava recriar a função de integridade já instalada; os asserts de imutabilidade continuam no teste.
- Após essa correção, `hr-role-legal-history` reportou **1/1 aprovado**.
- `municipal-travel-allowance`: adicionada a instância municipal referenciada pela política; a fixture relaxada anterior não impunha essa FK. Validação após esse ajuste ainda em curso.
- Execuções sequenciais completas ultrapassaram 600 s sob pressão da máquina compartilhada; o caso isolado de restituição ultrapassou 300 s. Esses comandos não representam aprovação dos cenários de viagens.

## Pendência explícita

`tests/hr-workforce-service.test.ts` está parcialmente convertido. O bootstrap usa `createSpecializedDrizzleFixture` (histórico SQL completo e conexão Neon/Drizzle real) e `tests/fixtures/personnel-workforce.sql`; a remoção dos delegates restantes ainda exige conclusão. Não considerar o escopo RH integralmente concluído enquanto esse arquivo permanecer legado.

Pontos específicos desse arquivo: a fixture atual cria projeções relaxadas via DMMF; não trocar por replay completo sem preparar os registros relacionados e os `updatedAt` dos INSERTs SQL. Há IDs próprios (`instance`, `employee`, `year`, `ug`, `source`) que colidem com parte da fixture financeira compartilhada. Os leitores `getPayrollStatement`, `buildHrReport`, `listServiceRightLedger` e `calculateRemunerationAverage` recebem executor; operações transacionais recebem conexão. Os filtros antigos `{ id: ... }` das leituras com escopo precisam virar predicados SQL equivalentes, sem retirar os asserts de autorização.

Nenhum build, commit ou push executado.

## Retomada de 28/10 — bloqueio de escrita concorrente

- Foram observadas regravações concorrentes do próprio `tests/hr-workforce-service.test.ts`: alterações aplicadas e verificadas (incluindo `historyScope`, cleanup via `fixture.close()` e consultas nativas da parte final) desapareceram em leituras posteriores. Houve uma leitura com zero delegates, seguida por outra com 74 chamadas legadas. É necessário coordenar um único escritor desse arquivo antes de consolidar e declarar a conversão concluída.
- Última auditoria direta do disco às `2026-10-28T22:38:21Z`: 74 chamadas `db.<delegate>.<operação>`, referências `Prisma.Decimal`, leitores recebendo conexão em lugar de executor, filtros de acesso ainda em objetos e cleanup legado. Esse número é um retrato da árvore em edição, não um inventário final.
- A seed histórica observada inclui instância, perfil/usuários, secretaria, fonte, pessoa/servidor/cargo, parâmetros da folha e cadeia clínica real (`Patient`, `HealthProfessional`, `HealthUnit`, `MedicalRecord`), com `updatedAt` explícito. Preservar esses registros ao consolidar.
- Comparação AST com `HEAD` preservou as 410 chamadas de assert: 244 `equal`, 132 `rejects`, 20 `deepEqual`, 7 `ok`, 4 `match`, 1 `doesNotMatch`, 2 `throws`; parser sem erros. Repetir a auditoria na versão consolidada, incluindo os argumentos esperados e filtros de autorização.
- Checks leves executados: `node --max-old-space-size=256 node_modules/eslint/bin/eslint.js tests/hr-workforce-service.test.ts` (última execução sem avisos/erros) e `git diff --check -- tests/hr-workforce-service.test.ts tests/fixtures/personnel-workforce.sql docs/drizzle-rh-final-progress.md` (passou). Esses resultados antecedem novas regravações e não validam a versão final.
- Nesta retomada não foram executados testes de banco/PDF, `tsc`, build, instalação, commit ou push.
- Após consolidar, o parent deve executar centralmente, após sua instalação: `node --max-old-space-size=512 --v8-pool-size=1 --conditions=react-server --import tsx --test --test-isolation=none tests/hr-workforce-service.test.ts`; executar `municipal-travel-allowance.test.ts` e `travel-refunds.test.ts` separadamente com os mesmos limites. Todos permanecem pendentes de aprovação runtime nesta retomada.
