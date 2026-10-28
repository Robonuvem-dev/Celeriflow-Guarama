# Ferramentas de catálogos de Saúde — entrega Drizzle

## Escopo e estado em 2026-10-28

Os quatro scripts transferidos estão migrados e sem referências diretas a Prisma:

| Script | Operação / contrato preservado | Transação |
| --- | --- | --- |
| `scripts/import-health-care-catalogs.ts` | CID DATASUS `SIA/2022-01` e SIGTAP `2023-10`, URLs originais, SHA-256 dos bytes, decode Windows-1252, parsing e lotes de 1000, sucessão e contagem por lote | Uma transação por catálogo, no mesmo pool; 120 s por transação |
| `scripts/load-sigtap-base.ts` | Os 25 registros originais, 12 procedimentos `99`, referências CBO/CID/serviços/classificações/especialidade, CSV UTF-8 e `LOCAL_CONTROLLED_V1` | Processamento, diagnósticos, conclusão e `AuditEvent` na mesma transação; 60 s |
| `scripts/prepare-aurora-health-identifiers.ts` | Três pacientes/identidades fixos, geração e validação CNS, preservação de CNS cadastrado, dry-run/apply, replay e payloads de auditoria | Advisory xact lock original, alterações e `FinancialAuditLog` na mesma transação; 30 s, igual ao default do client anterior |
| `scripts/prepare-aurora-pharmacy-catalogs.ts` | Dois produtos originais, IDs/códigos/hash, UBS/ente/UG/secretaria, material/catálogo/medicamento, dois almoxarifados, políticas 20/200, dry-run/apply e replay | Advisory xact lock original e toda a árvore/auditoria na mesma transação; 120 s |

Arquivos auxiliares exclusivos:

- `scripts/lib/health-catalog-tools.ts`: exigência de registro, lock transacional e leitura defensiva do hash JSON, sem cast.
- `src/db/schema/health-catalog-tools.ts`: projeção de `HealthStockPolicy`, oito colunas; quantidades `double precision`, boolean e timestamps tipados.
- `tests/drizzle-health-catalog-tools.test.ts`: gate AST independente e suíte SQL preparada.
- `tests/helpers/health-catalog-tools-fixture.ts`: fixture própria, replay integral dos 156 SQLs, seeds Drizzle e transporte real Neon/Drizzle/PGlite.

Código entregue; execução SQL integral e AST aprovados pela fila central (oito filhos + pai, no lote 42/42 sem falhas). Typecheck integrado e demais gates temporais/externos continuam sob integração central.

## Conexão, consumidores e contratos

Cada CLI abre um `DatabaseConnection` real por `openCrossDomainDatabase()` e fecha seu pool em `finally`. Os runners recebem a conexão completa. `withDatabaseTransaction` recebe essa conexão e os efeitos usam exclusivamente o `tx` original. O helper de lock recebe `DatabaseTransaction`. Não há proxy, client falso, API Prisma simulada, segunda conexão em writer ou cast de compatibilidade.

Antes das alterações, o grep nominal dos quatro caminhos encontrou:

- `package.json`: comando `health:catalogs:import`, preservado.
- `scripts/verify-s5.ts`: execução do CLI `load-sigtap-base.ts` e verificação textual de `SKIPPED_DUPLICATE`, preservadas. Esse consumidor pertence ao owner e foi somente consultado.
- Documentação e inventário estático: referências nominais, sem consumidores por import.

Os quatro arquivos não exportavam funções. Foram acrescentados runners para teste por import, com `require.main === module` no CLI:

- `importHealthCareCatalogs(connection, fetchSource?)` → `{ cids, procedures }`; a fonte injetável contém apenas conteúdo e checksum, nunca persistência.
- `loadSigtapBase(connection)` → objeto original de saída `SKIPPED_DUPLICATE` ou `LOADED`.
- `prepareAuroraHealthIdentifiers(connection, apply)` → objeto original de saída com modo, decisão e pacientes.
- `prepareAuroraPharmacyCatalogs(connection, apply)` → objeto original de saída com modo, replay, hash, unidade, produtos e decisão.

Grep posterior confirmou consumidores novos somente nos respectivos CLIs e no teste próprio. Nenhuma assinatura de serviço compartilhado foi alterada. `processHealthSusRecords` já aceita `DatabaseTransaction` e é reutilizado diretamente. O `AuditEvent` é inserido por tabela tipada no mesmo `tx`, preservando os quatro identificadores do evento original, sem depender do writer compartilhado ainda legado.

### Particularidades mantidas

- O importador oficial escolhe o usuário mais antigo por `createdAt`, **sem filtro de ativo**, exatamente como antes. O texto de erro de ausência de autoria foi mantido.
- CID substitui somente referências atuais `SIA/CID`; SIGTAP substitui somente procedimentos atuais da origem `SIGTAP`, independentemente da competência anterior.
- Qualquer lote oficial já existente pelo checksum retorna sua contagem, inclusive `FAILED`; não se introduziu retomada automática nesse importador.
- A carga local pula qualquer status diferente de `FAILED`. Sua criação/retomada de lote ocorre **antes** da transação de processamento, como no original. Em falha, o lote pode permanecer `PROCESSING`; o rollback preserva registros/diagnósticos/auditoria anteriores. O teste representa expressamente essa fronteira.
- O CBO `225125` mantém a descrição preexistente na construção do CSV, incluindo aspas/ponto e vírgula; o fallback continua `Médico clínico`.
- Os dois preparadores mantêm o lock também em dry-run. CNS igual preexistente não gera auditoria adicional; CNS distinto ou já vinculado a outra pessoa aborta.
- Na farmácia, a checagem de colisão de código continua dentro de `apply && !prior`. Replay com hash válido não repara nem sobrescreve registros locais posteriores. Hash divergente aborta antes das inserções.
- Não se introduziram DCB/BPS/RENAME, conversão oficial, prescrição, dispensação, lote ou saldo. `stockUnitsPerSupply` conserva o default físico `1`; medicamento conserva `currentStock=0` e `minStock=20`.
- As mensagens explícitas de validação e os objetos/logs do CLI foram mantidos. Falhas de ausência antes produzidas por `find*OrThrow` agora têm diagnóstico local `<Modelo> não encontrado.`, sem reproduzir erros do ORM removido.

## Evidência física e escalares

Referência offline: `.agent/drizzle/database-before-2026-10-28T01-26-00.861Z/catalog.json`.

- Auditoria de nomes, tipos e nullability das **23 projeções/258 colunas** consumidas por estes scripts e pelo processamento de referências: **PASS**, zero diferenças. Schemas compartilhados foram somente lidos.
- `HealthStockPolicy`: conferidos `CREATE TABLE`, índice único `(warehouseId, materialId)` e FKs em `20261009232000_baseline/migration.sql`; nenhuma outra ocorrência alteradora dessa tabela nos 156 históricos.
- Todos os timestamps retornados pelas operações novas são colunas Drizzle tipadas; não foi criado DTO temporal bruto. Portanto não há parsing novo de timestamp bruto que exija `databaseTimestamp`.
- `HealthSusProcedure.unitValue` mantém o mapper Decimal existente, a partir de string PostgreSQL. Quantidades de material/perfil/política continuam Float; estoques do medicamento continuam inteiros.
- O hash de configuração é lido de JSON sem cast. JSON null, SQL NULL e payload sem hash não autorizam replay; os dois tipos de null têm cenários separados preparados.
- A comparação offline não certifica replay, constraints, defaults ou triggers em execução. Esses gates dependem da suíte SQL central.

## Equivalência de payloads

Fingerprints capturados do AST de cada original antes de mudar persistência:

| Payload | SHA-256 |
| --- | --- |
| CSV local, CBO fallback | `57acf4589159887b4c3083c9c06ef896f6c9f9a1bc5514b7fc0ff4227f5cd759` |
| CSV local, CBO `Descrição CBO preexistente; com aspas "X"` | `14180eacafa9c682f47947513eaa25f5bd7e4fcb183b6d538e862e620be899a9` |
| Configuração da farmácia, ordem original de propriedades/itens | `7ab6c83707132ff54d32e2ab68990a59175c1980c9821514e48dfe75f7dff9d0` |

O gate AST verifica independentemente os arrays literais originais, fontes, decisão de identidade e hash de farmácia; não executa persistência. Os hashes dos CSVs serão confrontados com os lotes efetivamente gravados pelo teste SQL.

## Verificações realizadas nesta frente

1. ESLint dirigido aos oito arquivos TypeScript próprios: **PASS**.
2. Teste `AST: payloads e hashes históricos dos quatro scripts permanecem equivalentes`: **PASS**, sem abrir PGlite ou pool.
3. Auditoria física offline: **PASS**, 23 tabelas/258 colunas.
4. Varredura AST dos seis arquivos de runtime próprios: zero referências diretas ao client removido, zero casts.
5. Parse AST e resolução de imports dos oito arquivos TypeScript: **PASS**, 85 imports, 11 exports, zero erros de parse/resolução; whitespace e marcadores de conflito também conferidos.

Comando leve usado:

```text
node --max-old-space-size=192 --conditions=react-server --import tsx --test --test-name-pattern="AST:" tests/drizzle-health-catalog-tools.test.ts
```

## Suíte preparada para o parent

```text
node --conditions=react-server --import tsx --test --test-concurrency=1 tests/drizzle-health-catalog-tools.test.ts
```

Uma única fixture, subtestes sequenciais e replay integral dos 156 SQLs, sem DMMF nem fixture de domínio de outro owner. O utilitário de transporte local é reutilizado em modo somente leitura; o teardown fecha pool, sockets, transporte e banco na ordem prevista.

Cobertura SQL preparada:

- Tipos/nullability PostgreSQL da nova projeção; timestamp com milissegundos/UTC e sentinela de despesa com Decimal exato e Float.
- Importação CID/SIGTAP com 1001 registros por fonte, bytes Windows-1252, checksum, códigos, offsets fixos, nulls, autoria, versões/competências, sucessão restrita e replay sem escrita.
- Falha por duplicidade em cada catálogo oficial para comprovar rollback de lote, sucessão e registros.
- Carga local: 25 registros, 13 referências, 12 procedimentos, 49 vínculos, valores Decimal, sexo/idade, CBO preexistente, diagnóstico de especialidade, replay e retomada `FAILED`.
- Falha SQL na auditoria da carga local, verificando rollback conjunto de registros, vínculos, diagnósticos e auditoria, com a fronteira original de `PROCESSING` fora da transação.
- CNS: dry-run, três valores originais fixos, replay, preexistente igual/distinto, identidade divergente, outro titular, ausência de paciente, administrador inativo e falha na segunda auditoria.
- Farmácia: dry-run, hash, árvore e vínculos, floats/inteiros/defaults/conversão, replay sem sobrescrita, colisão de catálogo/categoria, UG/ente divergente, UBS/ator inativos, hash inválido, JSON null e SQL NULL.
- Inspeção de `pg_locks` dentro do trigger de auditoria para os dois preparadores, confirmando que a própria sessão ainda detém o advisory xact lock da chave original no momento da auditoria.
- Falha SQL na auditoria final da farmácia para comprovar rollback de toda a árvore, inclusive categorias/centro de custo/almoxarifados.
- Digests antes/depois de 19 tabelas de efeitos e 13 tabelas protegidas, incluindo a dotação sentinela, despesas, estoque/movimentos, prescrição e dispensação.

### Handoff nominal e pendências

Primeiro reteste central comunicado pelo parent: os sete demais cenários SQL de catálogos passaram, incluindo Date/Decimal, carga local, CNS, farmácia, autorizações e rollback. O cenário oficial parou no seed por violar `UNIQUE(sourceBatchId,kind,code)`: a fixture usava um único lote para referências de SIA e SIGTAP. Corrigido somente o seed para dois lotes reais, um por origem, com referências e procedimentos na competência de seu lote. As asserções de sucessão e preservação entre origens continuam integrais.

Atualização posterior do parent: **reteste SQL integral de catálogos PASS, oito filhos + pai; AST PASS**. Lote central com RH External e Financeiro: **42/42, zero FAIL, 105,91 s**. O cenário oficial corrigido foi validado pela fila central; não houve execução local adicional nesta frente.

- **Parent / fila central:** concluir o typecheck integrado. A suíte SQL completa já está aprovada conforme o resultado central acima.
- **Parent / fila central:** repetir o teste em processos com `TZ=UTC`, `TZ=America/Sao_Paulo` e `TZ=Pacific/Auckland` para o gate temporal integrado.
- **Parent / owner Saúde:** registrar aqui os achados centrais destes quatro scripts para correção nesta frente. Não há assinatura compartilhada bloqueadora identificada.
- Contenção entre sessões independentes em PostgreSQL externo continua uma validação central; a evidência de lock preparada nesta suíte é da sessão transacional, não uma alegação de concorrência validada.

Nesta frente foram executados apenas leitura, edição, lint, AST e comparação offline. SQL/PGlite, build/typecheck pesado, scripts de dados, writes remotos, Git e deploy permanecem na integração central.
