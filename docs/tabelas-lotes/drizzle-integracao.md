# Integração Drizzle — correções pontuais do CI

## Referência da integração

- Pull fast-forward informado: `b9fad738`, já integrado com conflitos resolvidos.
- Escopo desta etapa: `TS2769` no provedor de transparência de Ibema e condição de execução dos testes de Frotas.
- A integração utiliza Drizzle. Os registros históricos e SQL existentes em `prisma/migrations-ibema` continuam preservados como histórico de migrações; o nome desse diretório não implica uso do Prisma Client. A fixture de Frotas existente reproduz esse DDL em ambiente isolado com Drizzle.

## Correções

### `src/lib/transparencia/ibema-provider.ts`

- Consumidores conferidos: `src/lib/transparencia/consultation-service.ts` e `tests/transparency-consultations.test.ts`.
- O Next.js estende o `RequestInit` global com `next.revalidate`; o `RequestInit` próprio do Undici não declara essa extensão. Um literal passado diretamente ao transporte pode falhar na checagem de propriedades excedentes das sobrecargas.
- As opções agora são validadas em uma variável com `satisfies RequestInit` antes da chamada. Isso verifica a extensão do Next.js, preserva os tipos concretos de `headers` e `signal` para compatibilidade estrutural e mantém `next.revalidate: 300` e o timeout de 15 segundos.
- A assinatura exportada e o contrato de retorno permanecem iguais. A correção não usa casts nem supressões de TypeScript.
- Guia consultado: `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/fetch.md`.

### `scripts/run-fleet-tests.mjs`

- O processo Node que executa `tests/frotas-opening.test.ts` e `tests/frotas.integration.test.ts` agora recebe `--conditions=react-server`, permitindo resolver a entrada de servidor do pacote `server-only` nos imports transitivos do domínio.
- Referências conferidas: testes, fixture de Frotas, preparação de ambiente e launcher existente de testes do Grupo A.
- Guia consultado: seção “Preventing environment poisoning” de `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`; a condição foi conferida também no mapa `exports` de `node_modules/server-only/package.json`.

## Validação

- `node --check scripts/run-fleet-tests.mjs`: passou.
- Verificação isolada do launcher, interceptando `spawnSync`: passou; confirmou o executável Node, `--conditions=react-server`, os dois arquivos de teste e os demais argumentos, sem iniciar a fixture.
- Import de `server-only` com `node --conditions=react-server --input-type=module`: passou.
- Probe TypeScript em memória, extraindo as declarações reais de `headers` e `options` do provedor: passou com as opções estritas do projeto e os tipos do Next.js, tanto na chamada ao transporte nativo quanto ao transporte do Undici. Nenhum arquivo de teste foi gerado.
- Checagem TypeScript inicial direcionada ao provedor, com as declarações do Next.js e do Undici: inicialmente bloqueada por dependências locais ausentes (`drizzle-orm`, `decimal.js` e `@bugsnag/cuid`). Após o `npm ci` realizado pelo principal, o typecheck auxiliar completo passou, conforme a etapa abaixo.
- A suíte de Frotas não foi executada nesta etapa de proveniência offline.

## Proveniência histórica em checkout Windows — 2026-10-29

### Comparação local/remoto e causa raiz

- `HEAD`, `origin/main` e o HEAD consultado no remoto: `b199957ce1712fdf1613b4d6909643c3cca4c2c1` (`correção vercel`).
- Inventário histórico e evidência de recovery têm bytes idênticos no worktree, no HEAD e em `origin/main`. Os manifests auditados permanecem consistentes; não foi necessário alterá-los nem normalizar seus hashes.
- O SQL de `20261011010000_add_sst_clinical_services` no blob versionado tem 87 terminações LF. No worktree encontrado, tem 79 CRLF e 8 LF, sem CR isolado; o conteúdo normalizado é idêntico.
- Hash LF: `e4590cc6c6426625afe58396ebfd7a5f07f75ed2dfdfb32eb319586a82c1ea2a`.
- Hash CRLF uniforme registrado no inventário: `d8822bb147ec2e24a48ec2c74ed02d5808809d5d48dacde896850b8b5a5d6fbb`.
- Hash bruto misto encontrado: `56942636553fc17917a3e70970ac21b9d9bad907c4289960170333f6fd3f5a80`, coincidente com o checksum instalado registrado. Essa coincidência não modifica automaticamente a classificação auditada nem cria um arquivo de prova histórica.
- O runner incluía o hash bruto atual entre os candidatos para a classificação **uniforme** LF/CRLF. Assim, nesse checkout misto, calculava `LINE_ENDINGS_ONLY` e rejeitava o registro histórico `UNRESOLVED_HISTORICAL_DIFFERENCE` com `inconsistent provenance classification`. Os mesmos bytes incidentais também contaminariam `localByteVariants` na comparação da autorização.

### Correção do runner

- `scripts/database-migrate-files.mjs`: classificação uniforme considera somente os hashes LF e CRLF; `byteVariants` continua retendo os bytes reais para verificação dos recibos. O hash CRLF fica disponível nas entradas históricas, sem impor um novo campo obrigatório aos consumidores de migrações futuras.
- `scripts/database-migrate-baseline.mjs`: a tupla autorizada usa o hash local registrado e as variantes uniformes LF/CRLF, independentemente da variante mista incidental do checkout.
- A classificação clínica permanece `UNRESOLVED_HISTORICAL_DIFFERENCE`, sem prova arquivada inventada. SQLs, checksums registrados, inventário, recovery, política e manifest auditado foram preservados. A verificação offline e os testes desta etapa não conectam a um banco.

### Regressão e checks

- `tests/database-migrate-provenance.test.mjs`: novo teste reproduziu a falha antes da correção e passou depois. Cobre LF, CRLF, variante mista coincidente com o ledger e outra variante mista; exige baseline/tupla estáveis, preservação dos hashes reais e dos bytes SQL, e rejeição de classificações indevidas e de alteração do conteúdo SQL.
- `node --test tests/database-migrate-provenance.test.mjs tests/database-migrate-baseline-manifest.test.mjs`: **9 testes aprovados**, incluindo os bloqueios de adulteração de manifest, recovery, catálogo e provas históricas.
- `node --test --test-name-pattern="reviewed envelopes|file provenance" tests/database-migrate.test.mjs`: **2 testes offline aprovados**.
- `node scripts/database-migrate.mjs verify-files`: **exit 0**, `FILES_INTACT_BASELINE_AUTHORIZED`, 156 históricos e 2 futuros; `strictAdoption: BLOCKED`, `databaseAuthority: NOT_CHECKED`.
- Digest da baseline preservado: `d3d9962b793d2f76082f1fd2e89ed3d171761b8de611f1cdec264a72d928ae8a`.
- Digest do manifest autorizado preservado: `2b6df6002e92bf0725bae8f5574ea6d00c7d1e9d1b9214900881ddc96d201825`.
- `npm run typecheck:auxiliary`: **exit 0**, 601 fontes em 10 partições, sem diagnósticos.
- `git diff --check` nos scripts/teste alterados: passou. `git diff --name-only -- prisma db docs/drizzle-inventory`: vazio.

## Completion gate — distinguir Playwright Locator.count de Prisma

### Causa e escopo

- Consumidores de `findLegacyDatabaseReferences` conferidos: `scripts/verify-database-migration.mjs` e `tests/database-migration-source-check.test.mjs`. A assinatura e o formato dos resultados permanecem iguais.
- O scanner classificava toda chamada de membro `count` como delegate legado, sem examinar o receiver. A reprodução encontrou 25 falsos positivos: 8 em `scripts/verify-operational-browser.mjs`, 7 em `scripts/verify-operational-routes.mjs`, 9 em `src/app/app-domain/compras/_tests/editable-search.browser.test.mjs` e 1 em `tests/operational-filters.browser.test.mjs`.

### Correção e regressões

- `scripts/lib/database-migration-source-check.mjs`: a exceção é somente para `count()` sem argumentos com evidência AST de Locator: chamadas `locator`/`getByRole`/`getByLabel`/`getByText`/`getByTestId`/`getByPlaceholder`/`getByAltText`/`getByTitle`, cadeias conhecidas e aliases declarados. Também reconhece helpers locais simples que retornam um locator, como `next(page)`.
- Resolução de aliases respeita escopo lexical e rejeita bindings reatribuídos, sombreados ou cíclicos. Acesso por ponto e por chave literal usa a mesma análise; nomes de variáveis e casts para `Locator` não concedem exceção.
- Contagens Prisma continuam detectadas sem imports, com zero argumentos, arrays, spread, objetos, aliases de client/model e acesso por colchetes. As demais verificações de módulos, CLI e delegates continuam ativas.
- `tests/database-migration-source-check.test.mjs`: regressões sintéticas e inspeção dos quatro arquivos reais, com inserção adicional de acesso Prisma em cada fonte para demonstrar que a exceção não ignora o arquivo inteiro. Os arquivos de browser são apenas lidos, sem executar browser, servidor ou banco.

### Checks

- Antes da correção: regressões reproduziram os falsos positivos; completion gate retornou `INCOMPLETE`.
- `node --test tests/database-migration-source-check.test.mjs`: **9 testes aprovados**.
- `node scripts/verify-database-migration.mjs`: **exit 0 / PASS**, modo `COMPLETION_GATE`, 3.938 fontes, zero arquivos com acesso legado e zero ocorrências; dependências, scripts e lock sem referências legadas.
- `node --check scripts/lib/database-migration-source-check.mjs`: passou.
- `git diff --check` nos arquivos scanner/teste: passou.
