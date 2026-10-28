# RH Recruitment — handoff Drizzle

## Situação

Implementação integral das seis operações de `src/lib/rh/recruitment-service.ts` concluída. Três testes AST aprovados; lint/parse leves limpos. **Reteste central aprovado pelo parent: onze filhos e teste pai PASS**, incluindo o intervalo original de `decidedAt` comparado a `Date.now()` e as comparações exatas de timestamp transacional, epoch físico e auditoria. O lote conjunto com Diagnostics e Construction encerrou com **36 testes / 36 PASS / 0 FAIL / 0 SKIP em 120,55 s**. Typecheck semântico permanece sujeito aos checks centrais.

Baseline do motor antes das alterações: SHA-256 `de5e5df330651c99eb4266f0a785b5d64bd4795f3b1dfb0009e4744a68466480`. Captura readonly local: `C:/Users/trici/AppData/Local/Temp/opencode/personnel-recruitment-originals.json`.

## Arquivos e ownership

| Arquivo | Responsabilidade |
| --- | --- |
| `src/lib/rh/recruitment-service.ts` | Validação, permissões, publicação de edital, inscrição/replay, consulta individual, revisão e decisão |
| `src/lib/contracts/personnel-recruitment.ts` | Contexto estrutural, políticas e DTOs independentes de tipos Prisma |
| `src/db/schema/personnel-recruitment.ts` | Sete projeções físicas exclusivas; 38 colunas verificadas |
| `src/db/repositories/personnel-recruitment/reads.ts` | Consultas tipadas, escopos, contagens, ordenação, numeração e bloqueio de inscrição |
| `src/db/repositories/personnel-recruitment/writes.ts` | Advisory locks, escrita de regra, inscrição e decisão usando a transação real recebida |
| `tests/recruitment-drizzle-ast.test.ts` | Três provas leves de preservação, catálogo físico e contratos transacionais |
| `tests/recruitment-drizzle.test.ts` | Onze cenários de persistência Neon/Drizzle/PostgreSQL e teste pai aprovados no reteste central |
| `tests/fixtures/personnel-recruitment.sql` | Pré-condições SQL independentes após o replay histórico; injetor local aditivo de falha tardia de auditoria |

Mantido o ownership corretivo das entregas RH Pages, FinanceSetup e MunicipalSetup conforme resultados concretos da validação central. As oito nulabilidades municipais reportadas foram corrigidas e registradas em `docs/drizzle-municipal-setup-tools-progress.md` antes da conclusão desta frente. O parent confirmou os oito ajustes no PASS global do catálogo: 924 tabelas, 1.187 declarações, 12.079 colunas e 367 FKs.

## Consumidores conferidos antes das assinaturas

Os seis consumidores abaixo foram lidos individualmente e confirmados byte a byte contra a captura anterior ao trabalho:

1. `src/app/portal/concursos/page.tsx`
2. `src/app/portal/concursos/actions.ts`
3. `src/app/api/portal/concursos/[id]/edital/route.ts`
4. `src/app/api/portal/concursos/inscricoes/[id]/route.ts`
5. `src/app/app-domain/rh/concursos/page.tsx`
6. `src/app/app-domain/rh/concursos/actions.ts`

Nomes públicos e resultados preservados:

| Operação | Contrato |
| --- | --- |
| `recruitmentNoticeSchema` | Mesmo schema Zod, chaves, refinamentos e normalização |
| `RecruitmentApplication` | Mesmo DTO exportado, agora com `JsonValue` próprio |
| `listPublicRecruitmentNotices(executor)` | Mesmo array público, com `DatabaseExecutor` real; aceita conexão de leitura ou transação |
| `saveRecruitmentNotice(context, raw, connection?)` | `Promise<string>` com ID do edital |
| `submitRecruitmentApplication(context, raw, connection?)` | `Promise<string>` com ID novo ou de replay |
| `readOwnRecruitmentApplications(context)` | Mesmo array restrito ao ID do usuário |
| `listRecruitmentApplicationsForReview(context, requestedPage?)` | Mesmo `{ rows, page, total }` |
| `decideRecruitmentApplication(context, raw, connection?)` | `Promise<string>` com ID da inscrição |

As três escritas aceitam `DatabaseConnection` como terceiro parâmetro opcional, com default na conexão Drizzle da aplicação. Os consumidores existentes continuam válidos com os dois parâmetros originais. O contexto é um subconjunto estrutural de `AppContext`, aceitando os mesmos usuários e `database`.

As actions continuam capturando os erros do motor e devolvendo seus resultados `{ error }` / `{ id, error }`. Os arquivos consumidores, JSX e CSS permanecem idênticos à baseline.

## Origem e limites transacionais

- Leituras de contexto usam `context.database ?? db`; a listagem pública recebe o executor explicitamente.
- Cada uma das três operações de escrita abre exatamente uma transação via `withDatabaseTransaction(connection, ...)`. A opção padrão mantém o limite total de 30 s.
- Havendo `context.database`, ele deve ser **o mesmo objeto `connection.db`**. Uma conexão incompatível é rejeitada antes da aquisição do pool. Chamadores com banco injetado passam a conexão correspondente explicitamente.
- Repositórios de escrita e a leitura `FOR UPDATE` recebem `DatabaseTransaction` real. Consultas internas recebem esse mesmo `tx` como executor; os repositórios não abrem novas transações nem resolvem clientes globais.
- Validação de configuração/GED, edição da regra e inserção de auditoria compartilham a transação da publicação.
- Inscrição, numeração e auditoria compartilham a transação da inscrição.
- Bloqueio da inscrição, decisão e auditoria compartilham a transação da decisão.
- Auditoria usa o writer Drizzle existente `src/db/repositories/platform/audit.ts`, sem alterá-lo.

Locks preservados, inclusive ordem e chaves:

1. Publicação: `RH:EDITAL:${ruleSetId}:${code}`.
2. Alteração de edital existente: adicional `RH:INSCRICAO_EDITAL:${previous.id}` antes da contagem de inscrições.
3. Inscrição: `RH:INSCRICAO_EDITAL:${noticeId}` antes da leitura/replay/numeração.
4. Decisão: `SELECT ... FOR UPDATE` da inscrição.

O advisory lock executa `SELECT pg_advisory_xact_lock(hashtext(key))::text`, preservando o lock real e evitando o retorno PostgreSQL `void` não decodificável pelo transporte.

## Semântica preservada

- Publicação exige operação RH create/update, acesso à UG nova e à anterior, configuração ativa e versão GED institucional `FINAL`/`SIGNED`, documento `Válido`, sem pessoa física vinculada.
- Atualização preserva rule set, código e categoria. Após inscrições, termos diferentes exigem novo código; alterações permitidas de nome/ativação mantêm o snapshot já recebido.
- Listagem pública mantém categoria `PORTAL`, tipo `JSON`, ativação, vigência inclusiva do rule set, validação Zod, filtros GED e ordem `createdAt DESC, id ASC`. A janela de inscrições continua sendo apresentada mesmo quando encerrada/futura, como no original.
- Inscrição conserva CPF normalizado, nome/telefone tratados pelo Zod, aceite obrigatório, nascimento civil, cargo, janela/configuração e conta/perfil ativos. Não exige vínculo de servidor.
- SHA-256 continua calculado sobre `JSON.stringify(input)` após a mesma validação/ordem de propriedades. Snapshot conserva `noticeName`, `policy`, input normalizado, email e aceite ISO.
- Replay por edital e CPF/conta permanece anterior à revalidação da elegibilidade corrente; só devolve o ID se usuário e hash conferirem. Divergência preserva o registro anterior.
- Número por edital permanece `COALESCE(MAX(number),0)::int+1`, protegido pelo advisory lock e pelas unicidades históricas.
- Consulta individual usa exclusivamente `applicantUserId`, com ordem `createdAt DESC, id ASC`.
- Revisão mantém permissão RH update, escopo textual JSON `snapshot #>> '{policy,budgetUnitId}'`, bypass administrativo, páginas de 20, contagem e clamp originais; IDs são parâmetros SQL.
- Decisão mantém proibição de autorrevisão, UG do snapshot, status `RECEBIDA → DEFERIDA/INDEFERIDA`, razão, ator e `now()` do PostgreSQL. Replay idêntico não duplica auditoria; divergência rejeita.
- Pessoas canônicas e funcionários existentes são preservados; os cenários cobrem candidato externo e candidato com vínculo já existente.

## Autoridade física, datas e JSON

Autoridades usadas: `.agent/drizzle/database-before-2026-10-28T01-26-00.861Z/catalog.json` e as 156 migrações SQL de `prisma/migrations-ibema/`.

Projeções: `HrRecruitmentApplication`, `HrPayrollRule`, `HrPayrollRuleSet`, `Document`, `DocumentVersion`, `Usuario`, `ConfiguracaoPerfil`. O teste compara **tipo e nulabilidade nos dois sentidos**, incluindo timestamps de precisão 3 e JSONB.

Datas das entidades vêm de colunas tipadas Drizzle e retornam `Date`; datas do snapshot permanecem strings. Consultas raw próprias retornam apenas contagens/números ou o resultado textual do lock, sem timestamps raw a converter. O motor não lê/escreve valores monetários NUMERIC/float; a fixture de leitura confirma preservação de texto decimal grande no JSON. JSON literal `null` e propriedades nulas são exercitados independentemente do schema de política.

As constraints físicas continuam responsáveis por unicidade `(edital, CPF)`, `(edital, usuário)`, `(edital, número)`, FKs, status e imutabilidade de origem/decisão. As projeções são consumidas diretamente, sem geração/alteração de DDL.

## Evidências leves executadas

- `tests/recruitment-drizzle-ast.test.ts`: **3 PASS, 0 FAIL, 0 SKIP**, heap 256 MiB.
- Preservação por AST independente da baseline: cinco schemas/inputs, 14 condições de negócio, fórmula SHA-256 e expressão completa/ordenada do snapshot. As três condições dependentes de consultas foram adotadas nos repositórios e têm cenários de persistência dedicados.
- Sete projeções / **38 colunas** conferidas contra o catálogo físico.
- Sete arquivos TypeScript: lint/parse limpos.
- **43 imports estáticos e três dinâmicos** resolvidos, sem dependências locais ausentes.
- Fixture: 14 INSERTs / 89 campos declarados conferidos contra o catálogo, incluindo todos os campos obrigatórios sem default de cada INSERT.
- Seis consumidores confirmados idênticos à baseline.
- Zero APIs/imports/tipos Prisma diretos no motor, contratos e repositórios próprios; zero Proxy próprio, delegates, compat casts ou cliente paralelo.

Comando leve executado:

```powershell
node --max-old-space-size=256 --import tsx --test --test-concurrency=1 tests/recruitment-drizzle-ast.test.ts
```

## Onze cenários reais aprovados centralmente

1. Matriz de publicidade/ativação/vigência/política/GED e ordenação; limites inclusivos do rule set.
2. Schemas, autorização create/update, escopos de origem/destino, GED e edição permitida antes de inscrições.
3. Falha tardia de auditoria em criação/alteração de edital e colisão de código, com rollback integral/`updatedAt`.
4. Hash/snapshot normalizados, números por edital, datas, candidato externo e servidor, replay, divergência e retificação após inscrição.
5. CPF/aceite/nascimento/cargo/janelas/configuração/conta/perfil inválidos, sem persistência parcial.
6. Falha tardia de auditoria da inscrição, rollback e reutilização correta do próximo número.
7. Isolamento individual, datas UTC `timestamp(3)`, texto decimal e JSON null.
8. Revisão por UG, extração JSON textual, paginação/clamp, bypass administrativo, autorização e IDs parametrizados.
9. Decisão autorizada, autorrevisão/escopo, data do banco, replay e imutabilidade da razão/status.
10. Rollback da decisão por auditoria tardia e guards históricos ativos de origem/decisão/check/unicidade.
11. Rejeição de conexão de outra origem antes de resolver o pool global; leitura pública e validação GED observam estado não commitado no executor transacional e o rollback o restaura.

A fixture reaproveita o helper histórico existente e o transporte real Neon/Drizzle sobre PGlite local, com pool limitado a um cliente. O injetor de falha em `AuditEvent` é exclusivamente local/aditivo e acionado por um ator reservado da fixture. Nenhum guard histórico é removido ou desativado. Cada erro SQL esperado é contido em sua própria transação com rollback, evitando estado abortado entre cenários.

### Comando para a fila central sequencial

```powershell
node --max-old-space-size=512 --conditions=react-server --import tsx --test --test-concurrency=1 tests/recruitment-drizzle.test.ts
```

O comando inclui a condição `react-server` porque o motor importa o cliente server-only padrão da aplicação. Todos os caminhos positivos dos testes usam explicitamente a conexão isolada; a condição não altera a implementação de persistência.

## Reteste central — timestamp da decisão

Resultado inicial recebido: dez dos onze filhos aprovados; falha isolada em `tests/recruitment-drizzle.test.ts:244`, no intervalo `decidedAt >= start && decidedAt <= Date.now()`. Os cenários de datas conhecidas/raw, origem transacional, auditoria, numeração e rollback passaram nesse primeiro lote segundo o parent. **Após a correção abaixo, o parent confirmou os onze filhos e o pai aprovados.**

### Investigação e causa delimitada

- O original escrevia `"decidedAt"=now()` em SQL. O repositório migrado continua com `decidedAt: sql\`now()\``; não usa `new Date()` no serviço nem timestamp cru vindo de SELECT.
- A coluna física é `timestamp(3) without time zone`. A coluna tipada instalada do Drizzle transforma texto sem offset com `new Date(value + '+0000')`; leitura em UTC verificada novamente no teste leve com `2099-10-21 12:34:56.789 → 2099-10-21T12:34:56.789Z`.
- `now()` é um **timestamptz fixo no início da transação**. Ao atribuí-lo ao timestamp sem zona, PostgreSQL usa `TimeZone` da sessão. Assim, a sessão deve compartilhar a convenção UTC do mapper; o host desta frente está em `America/Sao_Paulo` (UTC−03), e a fixture própria antes não fixava a sessão.
- O log inicial não trouxe valor de `decidedAt`, limites nem `TimeZone`; não há evidência numérica para atribuir ao desvio original uma magnitude exata. A ausência de alinhamento explícito da sessão foi corrigida. O reteste central passou com sessão UTC, assert original sem tolerância adicional e todas as comparações exatas abaixo, validando a correção sem presumir um valor ausente do primeiro log.

### Correção nominal retida

1. **`tests/fixtures/personnel-recruitment.sql`** fixa `SET TIME ZONE 'UTC'`, alinhando o cast implícito de `now()` com a convenção física/mapper. Nenhuma alteração no relógio, guard histórico ou código produtivo.
2. A mesma fixture acrescenta um guard **local de teste**: no ato da decisão, `decidedAt` deve ser **exatamente** `now()::timestamp(3)` da transação real. Uma tentativa com `now()+interval '1 day'` deve falhar; isso evita aceitar arbitrariamente um `Date` da aplicação.
3. **`tests/recruitment-drizzle.test.ts`** mantém o intervalo original de relógio da aplicação, sem tolerância extra. Também verifica sessão UTC, limites do próprio banco antes/depois, epoch físico igual ao `Date` tipado e igualdade exata com o `createdAt` da auditoria da decisão, que usa o default `now()` da mesma transação. Falhas imprimem os dois limites, `decidedMs` e zona, sem timestamp cru convertido implicitamente.
4. **`tests/recruitment-drizzle-ast.test.ts`** comprova o decoder UTC com data conhecida e continua exigindo a expressão produtiva `sql\`now()\``.

Pós-correção leve: Recruitment **3 PASS / 0 FAIL / 0 SKIP**; no comando conjunto com External Operations foram **8 PASS**. Lint/parse final dos dois testes Recruitment alterados e dos doze TS External Operations: **14 arquivos, zero erros/warnings**. Fixture Recruitment reconferida offline: 14 INSERTs / 89 campos válidos. A execução PostgreSQL foi realizada centralmente pelo parent.

### Resultado final informado pelo parent

- Recruitment: **11/11 filhos PASS e teste pai PASS**.
- Mantida e aprovada a asserção original `decidedAt >= start && decidedAt <= Date.now()`, sem aumento de tolerância.
- Aprovadas as comparações exatas de timestamp da transação, epoch físico/decoder e auditoria.
- Lote conjunto com Diagnostics e Construction: **36 testes / 36 PASS / 0 FAIL / 0 SKIP / 120,55 s**.
- External Operations: seus doze cenários SQL entram na próxima execução central; ownership corretivo mantido para falhas concretas. As três adaptações de chamadas para `DatabaseConnection` já foram encaminhadas pelo parent ao owner RH original.

**Pendente:** resultado central de External Operations e checks semânticos centrais. PGlite, tsc/build pesados, scripts apply/seeds remotos e operações Git não foram executados nesta frente.
