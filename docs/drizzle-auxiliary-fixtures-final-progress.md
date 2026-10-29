# Auxiliary fixtures — handoff final

## Diagnóstico e correções

- Lido integralmente `.next/cache/auxiliary-typecheck/part-4.log` (68 linhas).
- `tests/annual-extra-note-transport.test.ts`, `tests/annual-payment-program-transport.test.ts`, `tests/bank-multiple-resource-sources.test.ts` e `tests/composite-accounting-postings.test.ts`: os dois percentuais das regras de retenção agora são `new Decimal("100")` e `new Decimal("20")`, conforme o contrato `exactNumeric` do schema. IDs, vínculos, datas, valores esperados e asserts de ambos os poderes foram preservados. O erro de overload mencionando `id` era consequência dos percentuais incompatíveis.
- `tests/cemetery-fees-service.test.ts`: ator com `employeeId: null`, coerente com o usuário sem servidor vinculado criado por `createCemeteryDatabase`, atendendo ao contrato `FinanceActor` sem inventar vínculo ou ampliar escopo.
- `tests/administration-bi.test.ts`: a leitura ExcelJS recebe `Uint8Array.from(excel.body).buffer`, um `ArrayBuffer` com cópia exata dos bytes, conforme a declaração de `xlsx.load`. Sem coerção de tipos ou risco de incluir bytes externos ao segmento original.
- `tests/helpers/tax-chain-database.ts`: retorno de `readTaxChainRecord` inferido diretamente de `database.execute<T>` e `firstTaxRow`, preservando o tipo de linha condicional do driver Neon (`Assume<T, QueryResultRow>`). A verificação de linha ausente continua lançando o mesmo erro. Busca global e leitura integral de `tests/tax-document-integration.test.ts` confirmaram o único consumidor, com três chamadas e tipos concretos compatíveis. Parâmetros e comportamento permanecem iguais.
- `src/lib/obras/__tests__/construction-downloads.test.ts`: substituído o cast parcial `as AppContext` por contexto tipado com identidade completa, perfil `CONSTRUCTION_TEST` e permissão `OBRAS` de leitura/edição. Mantidos IDs de ator/servidor/departamento e todos os asserts de ACL, replay, assinatura e publicação. Não consta diagnóstico desse arquivo no log fornecido.

## Verificação leve

- ESLint explícito nos oito arquivos: passou, exit 0.
- Parse sintático via `typescript.createSourceFile` nos oito arquivos: passou, zero erros. A primeira tentativa do comando falhou por quoting de PowerShell; a execução por stdin passou.
- `git diff --check` restrito aos oito arquivos: passou, exit 0 (somente avisos de normalização LF/CRLF do Git).
- Nenhum `npm ci`, build, tsc, teste pesado ou comando de alteração de histórico foi executado. A validação semântica central fica com a sessão principal.

## Fora do escopo

- Busca de ocorrências idênticas de percentuais literais em inserts e `xlsx.load(Buffer.from(...))` não identificou outro caso igual nos testes. Os números encontrados em `tests/public-finance.test.ts` não foram alterados nem classificados como diagnóstico de insert.
- Nenhum arquivo de scripts ou trabalho de outros agentes foi editado.
