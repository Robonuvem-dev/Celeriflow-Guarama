# Ferramentas transversais — migração Drizzle

## Escopo e estado em 28/10/2026

Implementação dos **11 arquivos existentes** da atribuição inicial preparada. O parent informou **8 testes aprovados** da suíte cross-domain inicial. A extensão de bootstrap TEST teve **7 testes aprovados** após a correção de transporte autorizada abaixo. Os sete órfãos P1/plataforma estão documentados em `docs/drizzle-p1-platform-tools-progress.md`, com testes preparados para o parent. `scripts/audit-system-data.ts` não existe na árvore conferida.

Foram lidos `AGENTS.md`, o plano integral, os contratos/status globais e o guia instalado de Server/Client Components do Next. Consumidores localizados por grep antes da mudança da assinatura de `getMunicipalNameTargets`. Nenhum arquivo de domínio, writer compartilhado, manifesto, lockfile, configuração de build ou documento global foi editado por esta frente.

| Arquivo | Migração e contrato preservado |
| --- | --- |
| `scripts/bootstrap-admin.mjs` | Drizzle sobre o pool Neon compartilhado da infraestrutura. Upserts atômicos nas chaves `ConfiguracaoPerfil.codigo` e `Usuario.email`; IDs preexistentes, senha na atualização, Firebase UID e perfil preservados conforme os mesmos campos do legado. |
| `scripts/audit-plausible-data.ts` | Regex, campos humanos, `--details`, `--counts` e arquivo `inventory.json` mantidos. Metadados físicos restritos ao catálogo explícito de tabelas da aplicação. |
| `scripts/checkup-system-data.ts` | Contagens por lotes de 40, regex, `--schema`, `--inspect`, `--where`, `--summary`, `--write-report` e destinos de saída mantidos. Filtros e valores de inspeção são parâmetros; campo deve existir no catálogo físico. |
| `scripts/municipal-name-targets.ts` | Consultas explícitas para instância, instrumentos DRAFT, servidores, regras/rubricas/regimes, eventos e usuários. Mesmos alvos/IDs/valores e verificação Firebase de ausência da credencial antes de propor e-mail. |
| `scripts/prepare-aurora-shared-catalogs.ts` | Mesmo advisory lock, hash, administrador, vínculo Executivo, verificações de conflitos, identidades, materiais/rede de saúde e replay. Auditorias técnica e financeira usam a mesma transação. |
| `scripts/prepare-poc-p0-current.ts` | Mesmo inventário, fingerprints, preservação dos registros fora do prefixo, dados/IDs de P0, classificações e marker. Escritas aditivas usam as mesmas chaves simples/compostas. Ledger e SQL históricos apenas lidos; nenhum CLI ORM. |
| `scripts/prepare-poc-p0-database.mjs` | Continua sem dotenv/URL externa, com identidade de isolamento, receipts/checksums e migrações SQL locais transacionais. Carga usa Drizzle/Neon via WebSocket/TCP exclusivamente loopback; sockets/pool encerrados no final. |
| `scripts/prepare-poc-p1-catalog-provenance.ts` | Mesmo hash/manifesto por ano, 63 classificações e 21 contas documentadas, estado DRAFT, validações de replay e auditoria na transação da versão/entradas. |
| `scripts/repopulate-plausible-data.ts` | Preview/apply, combinação dos alvos, preservação de valores personalizados, sincronização nominal do servidor, comparação **do snapshot completo**, advisory lock, rollback integral e auditoria mantidos. |
| `scripts/revise-municipal-catalogs.ts` | Revisão aditiva sem sobrescrever origem; IDs/hashes de revisão, metadados predecessores, códigos de versões publicadas, snapshot da origem e auditoria preservados. Entradas inseridas antes de publicar a nova versão, respeitando triggers existentes. |
| `scripts/seed-municipal-demo.ts` | Mesmos cinco estágios/dados/IDs, saldos iniciais, decimais, arrays, datas, marcadores e contagens. Cada estágio mantém sua transação/lock/auditoria e replay; preview não abre conexão. |

## Helpers próprios e limites

- `scripts/lib/cross-domain-application-tables.ts`: catálogo explícito de **973 tabelas**, na mesma ordem do inventário revisado. Comparação estática com `docs/drizzle-inventory/models.json`: 973/973, nomes e ordem idênticos, nenhum ausente/excedente. Este JSON histórico **não é dependência de runtime**.
- `scripts/lib/cross-domain-database.ts`: abre pool próprio, SQL parametrizado, validação/quoting de identificadores, introspecção controlada no schema atual e inserção SQL restrita às tabelas usadas por estas ferramentas. Não oferece delegates, includes, filtros de ORM ou tradutor da API anterior. PostgreSQL aplica defaults/constraints; `id` cuid v1 e `updatedAt` obrigatórios sem default físico são preenchidos explicitamente. `ON CONFLICT DO NOTHING` só é global quando o comando anterior usava `skipDuplicates`; upserts sem atualização nomeiam a chave de conflito original.
- `scripts/lib/cross-domain-repopulation.ts`: atualização com snapshot completo e auditoria na transação recebida.
- `scripts/lib/cross-domain-planning-catalogs.ts`: leitura explícita de versões e entradas ordenadas por ID.
- `scripts/lib/cross-domain-local-database.ts`: transporte loopback para P0 usando o driver de produção; não aceita URL operacional.

Os limites transacionais explícitos continuam 60 s (catálogo compartilhado), 120 s (revisão/P0 local), 240 s (P0 atual/repopulação/estágios demo), e 5 s por ano na proveniência P1. O timeout de lock acompanha o limite total para não introduzir o corte padrão de 10 s sobre os advisory locks antigos. Pools próprios reproduzem os `maxWait` configurados anteriormente (20/30/120 s; 2 s quando era o default transacional).

### Metadados de diagnóstico

`checkup-system-data --schema` conserva o envelope `{ model, fields, relations }`, mas agora descreve **tipos/defaults PostgreSQL** em `fields`, em vez de sintaxe de schema de ORM. Relações vêm de FKs físicas e obrigatoriedade das suas colunas; `field` da cobertura é derivado do nome da coluna de FK. Não foram encontrados consumidores programáticos desse relatório. O catálogo explícito evita ampliar acidentalmente o inventário para tabelas técnicas que não estavam no conjunto anterior.

## Contratos e consumidores intermodulares

- `getMunicipalNameTargets(db)` agora recebe `DatabaseExecutor` e continua retornando `Promise<MunicipalNameTarget[]>`. Único chamador encontrado: `repopulate-plausible-data.ts`, já adaptado. `referenceNames` continua sendo consumido por `prepare-poc-p0-current.ts`; o tipo `MunicipalNameTarget` permanece igual.
- `runMunicipalDemoStage(connection, stage, actorId): Promise<void>` é novo, usado pelo runner e pelo teste específico. Importar o runner para testar não executa sua CLI. Os cinco estágios permanecem sequenciais na CLI.
- A auditoria compartilhada é consumida por `insertAuditEvent(tx, input)`, de `src/db/repositories/platform/audit.ts`, com a conexão transacional de origem. `auditEventTypes` vem do contrato independente; o writer legado não é importado.
- `municipal-system-dataset.ts` fornece `key`/`systemPersonName`; `plausible-cadastro-data.ts`, `municipal-demo-catalogs.ts`, labels de RH e fixture-catalog continuam fontes dos mesmos dados. Nenhuma assinatura externa dessas fontes foi alterada.
- O caminho SQL histórico `prisma/migrations-ibema` e a tabela histórica `_prisma_migrations` continuam referências de evidência em P0. Coordenar com a frente de histórico SQL caso o parent realoque os arquivos; não renomear/apagar o ledger para remover uma ocorrência textual histórica.

## Comandos que o parent precisa atualizar

Os dois `.mjs` passaram a importar a infraestrutura TypeScript. Comandos:

```powershell
node --import tsx scripts/bootstrap-admin.mjs
node --import tsx scripts/prepare-poc-p0-database.mjs
```

**Handoff `bootstrap:admin` atendido pelo parent:** comando atualizado para `node --import tsx scripts/bootstrap-admin.mjs`. O manifesto está reservado ao parent e não foi editado aqui.

Os demais scripts continuam TypeScript. Para os caminhos que importam serviços server-only, usar a condição já adotada pelo projeto:

```powershell
node --conditions=react-server --import tsx scripts/repopulate-plausible-data.ts --general
node --conditions=react-server --import tsx scripts/seed-municipal-demo.ts
```

Sem `--apply`, esses exemplos mantêm os modos de preview existentes; o primeiro ainda consulta as fontes para construir sua prévia.

## Evidências executadas nesta frente

- ESLint dos 11 scripts, cinco helpers próprios e teste específico: **exit 0**.
- `node --check scripts/bootstrap-admin.mjs`: **exit 0**.
- `node --check scripts/prepare-poc-p0-database.mjs`: **exit 0**.
- Conferência estática de nomes/ordem do catálogo explícito: **973/973 idênticos**.
- Grep dos 11 arquivos: nenhuma dependência ativa `@prisma`, `Prisma`, DMMF, `src/lib/prisma`, `prisma generate` ou `prisma migrate`.

## Validação preparada, pendente de execução centralizada

`tests/drizzle-cross-domain-tools.test.ts` usa o helper de banco local com **driver real Neon/WebSocket**, sem mocks ORM. Estão preparados: duas entradas de teste, sendo a principal com cinco subtestes, cobrindo conflito/ID/timestamp, JSON, ordenação de catálogo, FK/metadata, parametrização, snapshot completo, edição concorrente, rollback de auditoria, cinco estágios demo, arrays/decimais, replay e transporte P0 loopback/encerramento.

```powershell
node --conditions=react-server --import tsx --test --test-concurrency=1 tests/drizzle-cross-domain-tools.test.ts
```

O teste principal reproduz o histórico SQL em PGlite e deve entrar na janela sequencial do parent. **Não executados nesta frente:** PGlite/testes, tsc, build, operações Git, deploy, DDL/carga no Neon. A suíte preparada e o código precisam passar pela checagem estrita e pela validação centralizada antes de aprovação. Este documento não declara concluída a migração integral nem homologados os scripts em produção.

### Resultado posterior informado pelo parent

`tests/drizzle-cross-domain-tools.test.ts`: **8 testes aprovados**, incluindo subtestes, pai e transporte local. A execução foi centralizada pelo parent; este resultado não é validação do bootstrap TEST acrescentado a seguir.

## Extensão — bootstrap do banco TEST dedicado

### Arquivos

- `scripts/bootstrap-test-database.mjs`: saiu a sequência de CLI `db push --force-reset`, instalação parcial de triggers e 156 `migrate resolve --applied`. Entraram APIs do executor SQL preservado (`loadMigrationSet`, `openMigrationConnection`, `runDatabaseMigrations(..., {command: 'replay'})`). Todas as fontes são verificadas antes do reset. Os recibos representam **SQL executado**, sem criar `_prisma_migrations` nem fabricar uma adoção.
- `prisma/bootstrap-test/seed.ts`: fixture integral migrada para SQL parametrizado Drizzle. Dados, IDs, valores monetários/datas, chaves naturais/compostas e projeções de atualização originais são explícitos, sem emulador de delegates. Senha/Firebase UID continuam omitidos da atualização de usuários; evidência/origem dos saldos continua omitida da atualização de movimentos; regras alternativas são inativadas antes da reativação da regra escolhida.
- `scripts/lib/cross-domain-bootstrap-test-target.ts`: exige `TEST_DATABASE_URL`, valida que seu par unpooled aponta ao mesmo banco e rejeita alias das URLs operacionais/DDL conhecidas. Essas URLs operacionais **são apenas comparadas**, nunca escolhidas. Comparação considera endpoint Neon direto/pooler e banco, sem credenciais. Overrides de roteamento e schema diferente de `public` são recusados.
- `scripts/lib/cross-domain-bootstrap-test-reset.mjs`: reset explícito de `public` em transação, mantendo roles do servidor e dono/permissões do schema. Recusa schemas extras/extensões antes de CASCADE, para não apagar dependentes fora de `public`; confere o nome do banco conectado. Identificadores de roles vêm do catálogo e são quotados; privilégios aceitos são somente `USAGE`/`CREATE`. Se `public` ainda não existir, a criação mantém as permissões padrão do novo schema.
- `tests/drizzle-bootstrap-test-database.test.ts`: teste de resolução de destino e integração preparada com driver Neon/WebSocket real.

### Transações e guards

O runner mantém o lock de sessão do executor durante **reset, replay e seed**, usando uma conexão física para reset/replay. O reset tem sua transação, o executor controla a transação de todo o replay e o seed usa uma transação Drizzle de 120 s. Não é declarada atomicidade única entre essas três fases já commitadas: uma falha do seed preserva os recibos de replay real e reverte a fixture do seed. Lock/pool/conexões são encerrados no `finally`.

`prisma/bootstrap-test/audit-immutability.sql` **não é mais executado**. Seu propósito era suprir os dois triggers ausentes do antigo `db push` e criar perfil/ator mínimos. O histórico `20261009232100_database_guards` já define os mesmos guards e mensagens ASCII, além dos demais guards que o schema ORM não reproduzia. O seed Drizzle cria o mesmo perfil/ator completo. O auxiliar foi preservado, sem alterações, mas não sobrescreve funções/triggers históricos no novo fluxo.

O antigo seed usava uma busca única por `FinancialYear.year`, embora o histórico atual tenha removido a unicidade global e adicionado `FinancialYear_legacy_year_key`. O SQL agora expressa o recorte original da fixture, que não fornece entidade: **`ON CONFLICT (year) WHERE governmentEntityId IS NULL`**. Um exercício 2026 de entidade específica não é atualizado nem substituído. IDs retornados por conflitos naturais continuam sendo usados nos vínculos seguintes.

`seedBootstrapTestFixture(tx): Promise<void>` é novo, recebe `DatabaseTransaction` e fixa `search_path` transacional em `public, pg_catalog`. Consumidores encontrados: runner de bootstrap, CLI própria do seed e teste próprio, todos com a transação real recebida. Não há fallback de conexão no seed standalone.

### Handoff obrigatório ao parent

**Atendido pelo parent:** `bootstrap:test-db` atualizado para:

```text
node --import tsx scripts/bootstrap-test-database.mjs
```

Para seed standalone, continua obrigatória a variável TEST dedicada:

```text
node --import tsx prisma/bootstrap-test/seed.ts
```

Nenhuma variável operacional é sobrescrita no processo e nenhum dado é copiado de uma base operacional. Não foi feita execução contra Neon remoto nesta frente.

### Evidências da extensão

- `node --check scripts/bootstrap-test-database.mjs`: **exit 0**.
- `node --check scripts/lib/cross-domain-bootstrap-test-reset.mjs`: **exit 0**.
- ESLint dos dois arquivos migrados, dois helpers novos e teste: **exit 0**.
- Sem CLI/cliente/tipos/DMMF Prisma ativos em `prisma/bootstrap-test/seed.ts` ou no runner.

Suíte completa preparada; **aprovada na execução posterior autorizada abaixo**:

```powershell
node --conditions=react-server --import tsx --test --test-concurrency=1 tests/drizzle-bootstrap-test-database.test.ts
```

Cobertura planejada: exigência TEST sem fallback/alias, recusa de reset fora de `public`, proprietário/roles/permissões mantidos (incluindo `WITH GRANT OPTION` e role com aspas no nome), replay real dos 156 SQLs com recibos `executed`, ausência de ledger legado fabricado, guards históricos habilitados e bloqueando mutações, valores exatos/vínculos/datas, reuso do ID existente na chave natural, coexistência de exercício por entidade, campos omitidos preservados no reseed, inativação de regras alternativas e rollback por FK tardia. Inclui replay completo e deve rodar somente na janela sequencial centralizada.

### Correção da importação TSX/CommonJS — handoff do export

O parent informou falha de transformação antes de qualquer conexão: o teste TypeScript CommonJS importava o runner `.mjs`, e TSX recusava o `await` de nível superior mesmo dentro do ramo exclusivo da CLI. O ramo agora usa `void bootstrapTestDatabaseMain().then(...).catch(...)`, preservando saída JSON e `process.exitCode = 1` em erro. O export e seus consumidores mantêm a assinatura e o contrato anteriores.

**Export `bootstrapTestDatabaseMain` pronto para nova validação centralizada.** Evidências após a correção:

- `node --check scripts/bootstrap-test-database.mjs`: **exit 0**.
- ESLint do runner e do teste consumidor: **exit 0**.
- Caso puro de destino, pelo próprio teste TS que importa o runner: **1 passou, 0 falhas**, heap limitado a 512 MiB:

```powershell
node --max-old-space-size=512 --conditions=react-server --import tsx --test --test-concurrency=1 --test-name-pattern="bootstrap dedicado exige TEST" tests/drizzle-bootstrap-test-database.test.ts
```

Esse filtro valida a fronteira de importação e a resolução de destino sem instanciar PGlite nem abrir banco. O teste pesado de reset/replay/seed aguarda a execução centralizada pelo parent.

### Correção de transporte autorizada e bootstrap completo aprovado

O parent informou timeout de 300 s no reteste completo, após o subteste de reset fora de `public`, e concedeu temporariamente `tests/helpers/local-drizzle-database.ts` para correção. O driver DDL `scripts/database-migrate-driver.mjs` **não foi alterado**.

Diagnóstico e reprodução limitada:

1. Uma inspeção sem banco confirmou `require('@neondatabase/serverless').neonConfig !== (await import('@neondatabase/serverless')).neonConfig`, assim como classes `Client` distintas.
2. Smoke com o driver DDL real e sem replay reproduziu o bloqueio em **12 s** antes da correção. A fixture configurava apenas o export usado pelo pool TS/CJS.
3. Após configurar os dois exports, o `SELECT 1` do driver também respondeu, mas o fechamento ficou bloqueado em `Client.end()`. A inspeção de `pglite-socket` confirmou que a mensagem PostgreSQL `Terminate` era processada sem fechar o TCP.

Correções exclusivamente na fixture:

- Configurar ambas as instâncias Neon para o mesmo endpoint WebSocket loopback, desabilitando TLS/pipeline localmente e usando `ws` como construtor.
- Restaurar separadamente `wsProxy`, `useSecureWebSocket`, `pipelineConnect` e `webSocketConstructor` de cada instância em `close()` e no caminho de falha.
- Reconhecer o frame PostgreSQL `Terminate` na ponte e fechar TCP/WebSocket. A ponte respeita limites/comprimentos de frames; um `X` dentro de SQL ou dados binários não é tratado como encerramento.
- Assinatura/retorno de `createLocalDrizzleDatabase()` preservados. Consumidores do helper compartilhado foram localizados por grep antes da alteração. A exigência de fechar uma fixture antes de abrir outra no mesmo processo permanece.

`tests/drizzle-bootstrap-test-transport.test.ts` adiciona o smoke real dos dois clientes, deadline de 12 s para conexão/consulta e watchdog de 17 s incluindo cleanup. Não usa ambiente operacional, executor substituto nem replay. Também confere restauração das quatro opções de ambas as instâncias.

**Evidência aprovada, foreground, heap 512 MiB:**

```powershell
node --max-old-space-size=512 --conditions=react-server --import tsx --test --test-concurrency=1 tests/drizzle-bootstrap-test-transport.test.ts
# 1 passou, 0 falhas, 6,5 s, exit 0.

node --max-old-space-size=512 --conditions=react-server --import tsx --test --test-concurrency=1 tests/drizzle-bootstrap-test-database.test.ts
# 7 passaram, 0 falhas, 18,8 s, exit 0; limite externo de 180 s.
```

O segundo comando comprovou reset/replay dos 156 SQLs e seed, recibos reais, roles/permissões, guards, valores e vínculos, reseed e rollback tardio. O parent pode retomar a propriedade da fixture compartilhada. A autorização excepcional de execução de banco desta correção foi restrita ao smoke e bootstrap locais; a suíte P1/plataforma permanece preparada para a janela centralizada.

Após o ajuste, ESLint da fixture/smoke e dos nove arquivos P1: **exit 0**. Parsing sintático desses 11 arquivos, sem resolução de imports/typecheck: **zero erros**. Não houve execução adicional de tsc/build.
