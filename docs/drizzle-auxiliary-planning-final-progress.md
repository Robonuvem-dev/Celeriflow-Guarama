# Handoff — auxiliary planning final

## Alterações concluídas

- `src/lib/planejamento/report-layouts.ts`: `requirementItems` recebe cópia mutável explícita (`[...items]`), compatível com JSON persistido. Assinatura e retorno exportados preservados.
- `tests/drizzle-bootstrap-test-database.test.ts`: fixture de ambiente explicitamente `NodeJS.ProcessEnv`, com `NODE_ENV: "test"`.
- `tests/drizzle-health-pharmacy-pages.test.ts`: `assert.ok(replay)` antes do acesso a `replay.result`; chamada com `command` preservada para a correção do core feita pelo parent.
- `tests/drizzle-planning-execution-operations.test.ts`: todos os sete literais BigInt substituídos por `BigInt("...")`, preservando valores, cálculos e asserts do oracle independente.
- `tests/drizzle-planning-publication-operations.test.ts`: helper SQL propaga o genérico até `postgres.query<T>`; shapes explícitos nas consultas de artefatos/eventos/oracles; `requiredRow<T>(rows: readonly T[])` infere o registro a partir do parâmetro e verifica sua presença. Removido o cast de payload em favor do tipo da consulta. Lookup de artefato preserva o comportamento de ausência exigido pelos asserts existentes.

## Verificação

PASS (exit 0, sem mensagens):

```text
node node_modules/eslint/bin/eslint.js src/lib/planejamento/report-layouts.ts tests/drizzle-bootstrap-test-database.test.ts tests/drizzle-health-pharmacy-pages.test.ts tests/drizzle-planning-execution-operations.test.ts tests/drizzle-planning-publication-operations.test.ts
```

Busca adicional confirmou ausência de literais BigInt no teste de execução.

Todos os asserts e escopos existentes preservados. Nenhuma assinatura exportada alterada. Não foram executados testes SQL, tsc, build, npm ci ou comandos Git. A confirmação de tipos fica para a verificação coordenada pelo parent.
