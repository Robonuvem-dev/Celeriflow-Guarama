# RH residual — progresso e handoff

**Resultado: validação runtime final pendente** — a auditoria atual de `hr-workforce-service.test.ts` confirma consultas Drizzle nativas e 412 asserts; os cenários de workforce e viagens aguardam a rodada centralizada do parent.

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
- `municipal-travel-allowance`: adicionada a instância municipal referenciada pela política; a fixture relaxada anterior não impunha essa FK. Na retomada de 28/10, o workflow passou a ser criado em `DRAFT`, seguido das etapas e da publicação com `publishedAt` e `publishedByUsuarioId`, conforme schema e guards históricos. Validação runtime após esses ajustes pendente.
- Execuções sequenciais completas ultrapassaram 600 s sob pressão da máquina compartilhada; o caso isolado de restituição ultrapassou 300 s. Esses comandos não representam aprovação dos cenários de viagens.

## Retomada de 28/10 — estado conferido na main

- A auditoria atual substitui o retrato anterior de edição concorrente: `tests/hr-workforce-service.test.ts` importa tabelas e operadores Drizzle, usa `createSpecializedDrizzleFixture`, carrega `tests/fixtures/personnel-workforce.sql` e encerra com `fixture.close()`. O arquivo não foi alterado nesta retomada.
- Auditoria AST: parser sem erros; 412 chamadas de assert — 246 `equal`, 132 `rejects`, 20 `deepEqual`, 7 `ok`, 4 `match`, 1 `doesNotMatch`, 2 `throws`. Nenhuma chamada `db/executor.<delegate>.<operação>` detectada, nem tokens `@prisma`, `Prisma.`, `$transaction`, `$queryRaw` ou `$executeRaw`. Esses checks não equivalem a aprovação funcional ou comparação dos argumentos de todos os asserts.
- A fixture de viagens agora respeita a imutabilidade das etapas publicadas e as evidências obrigatórias de publicação, com usuário existente da fixture. Nenhuma constraint ou assert foi relaxado.
- ESLint de `tests/helpers/planning-postgres-backend.ts` e `tests/municipal-travel-allowance.test.ts`: passou. Importação do backend via TSX e rejeição de host/banco fora da whitelist: passaram, sem conexão de banco.
- Comparação AST da fixture de viagens com `HEAD`: as 95 chamadas de assert e seus argumentos são idênticos; parser sem erros. `git diff --check` dos quatro arquivos exclusivos desta retomada passou.
- O backend compartilhado deixou de importar o pacote ausente `pg`; usa `Client` Neon com configuração por cliente e ponte WebSocket → TCP loopback. Ver detalhes em `docs/drizzle-planning-core-final-progress.md`.
- O parent deve executar centralmente: `node --max-old-space-size=512 --v8-pool-size=1 --conditions=react-server --import tsx --test --test-isolation=none tests/hr-workforce-service.test.ts`; executar `municipal-travel-allowance.test.ts` e `travel-refunds.test.ts` separadamente com os mesmos limites. Os três permanecem pendentes de aprovação runtime nesta retomada.
- Nesta retomada não foram executados testes SQL pesados, `tsc` global, build, instalação, commit ou push.
