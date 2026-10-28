# Saúde — relatórios, unificações administrativas e vigilância

## Entrega desta reserva

Migrados individualmente os quatro serviços transferidos:

- `src/lib/saude/health-report-service.ts`
- `src/lib/saude/health-report-extra.ts`
- `src/lib/saude/health-merge-service.ts`
- `src/lib/saude/vigilance-service.ts`

Zero referências diretas ao client legado nesses serviços e no runtime exclusivo criado. Repositories ficam em `src/db/repositories/health-management-operations/**`; contrato em `src/lib/contracts/health-management-operations.ts`; projeções exclusivas em `src/db/schema/health-management-operations.ts`.

**Validação central comunicada pelo parent: PASS nos 12 cenários SQL + pai e no gate AST.** O lote conjunto com os dez testes de download encerrou com **24/24 PASS, zero FAIL, zero skip, em 47,03 s**. Esta entrega fica retida para correção de bugs próprios comunicados.

## Contratos e consumidores conferidos

Grep de imports estáticos/dinâmicos e de todos os nomes exportados identificou:

| Consumidor | Handoff nominal |
| --- | --- |
| `src/app/app-domain/saude/administracao/unificacoes/actions.ts` | **ownerHealth actions:** substituir o primeiro argumento de `executeHealthAdministrativeMerge(context.prisma, input)` por uma `DatabaseConnection` real da mesma origem. Retorno continua `Promise<string>` com o ID do histórico; erros continuam lançados e a action mantém seu `{ error }` público. |
| `src/app/app-domain/saude/vigilancia/actions.ts` | **ownerHealth actions — handoff recebido, conforme confirmação do parent:** contexto estrutural `HealthManagementContext`, com `user` e `connection` para escrita nas sete operações de Vigilância. Continuam retornando `{ id: string }` e lançando `VigilanceError`/validação. Actions de formulário continuam `Promise<void>`. |
| `src/app/api/saude/relatorios/route.ts` | **ownerHealth APIs / parent:** nomes, tipos de entrada, dataset, filename e contrato de `ReportDefinition` preservados; reader usa `context.database`, depois `context.connection.db`, depois o banco Drizzle compartilhado. A execução continua compatível com o contexto do report engine. Auditoria de emissão permanece com o engine existente. |
| `tests/health-checklist-internal-flows.test.ts` | **ownerHealth testes:** `createExtendedRows` recebe contexto Drizzle; injetar `database` ou `connection`, eliminando o double/fixture legado desse consumidor. |
| `scripts/verify-s5.ts` | **ownerHealth scripts / parent inventário:** as sete chamadas de Vigilância exigem a conexão da fixture/banco em seu contexto. Script fora desta reserva. |
| Páginas TSX | **ownerHealthpagesTSX:** nenhum import direto dos quatro módulos foi encontrado; consumidores passam pelas actions/API acima. Nomes das colunas, avisos, gráfico, apresentação e conteúdo dos comprovantes preservados. |

`HealthReportInput`, `HealthReportDataset`, `healthAdministrativeReportDefinition`, `healthReportFilename`, `createExtendedRows`, `executeHealthAdministrativeMerge`, `VigilanceError` e as sete funções de Vigilância conservam nome e retorno público. Foram adicionados argumentos finais opcionais de `DatabaseTransaction` nas operações de escrita, permitindo composição no tx do chamador.

## Relatórios

- Queries nativas Drizzle sobre os mappings físicos existentes; nenhuma interface de modelos simulada.
- `DatabaseExecutor` em todos os readers compartilhados permite leitura do estado ainda não confirmado do tx injetado.
- Preservados filtros SQL e filtros posteriores à leitura, ordenação e ausência de ordenação onde original, limites 100/2.000/5.000, counts, agrupamentos e recortes originalmente sem período.
- Preservados intervalo `-03:00`, formatação UTC das datas tabulares e operações locais de aniversário/faixa/hora já presentes.
- Catálogos, convênios e cotas usam `exactNumeric`/Decimal tipado. Quantidades, custos de estoque/laboratório e valores Float continuam `number`. Runtime novo não cria DTO temporal bruto; único retorno de SQL bruto novo é contagem inteira.
- Arrays em SQL bruto usam `sql.param(array)`; lista vazia não amplia escopo.
- Readers TFD reutilizam `tfdTripAccessWhere` e `activeTfdPassengerWhere` do repository responsável: exclusões confirmadas saem do manifesto, mas continuam no universo de autorização.
- Identidade do denunciante não integra a projeção de denúncias. Resultados clínicos detalhados não são acrescentados aos datasets administrativos.
- Comprovantes mantêm exatamente as verificações de acesso e os fallbacks do fluxo original. Emissão de CSV/XLSX/PDF/print continua pelos renderers existentes.

Fingerprints capturados **antes** da alteração, com AST normalizado removendo apenas type assertions:

| Serviço | Returns | SHA-256 |
| --- | ---: | --- |
| `health-report-service.ts` | 35 | `c40df8dee9615b219b971878ba2199b9d4765ecdb177c3ff490171a3f5f00b5b` |
| `health-report-extra.ts` | 108 | `4dbdef21bf19551dfd0ba0c69f7632d0b8afea5501a6a48c1e86de584b696f49` |

Gate de equivalência desses 143 returns: **PASS**, também confirmado na execução central. A suíte SQL central passou integralmente nos cenários de consulta e persistência descritos abaixo.

Os expected fingerprints estão congelados em `tests/fixtures/health-management-original-report-fingerprints.json`, com contagem/hash capturados do original. O gate não consulta `HEAD`, commits anteriores ou arquivos privados e funciona com checkout raso.

## Unificações e Vigilância

- Merge abre tx por `withDatabaseTransaction(connection)` com timeout de 5 s do fluxo original; tx opcional recebido é reutilizado sem nova conexão. Leitura, transferência, status e `HealthAdministrativeMerge` pertencem ao mesmo tx.
- Locks de paciente conservados em ordem determinística; endereço e profissional também recebem locks determinísticos para serializar replay/transferências concorrentes sobre os mesmos registros.
- Preservados os 39 vínculos de paciente, seis vínculos diretos de profissional, deduplicação de atribuições/serviços/habilitações, especialidade nula, critérios canônicos, guarda de gestação e constraints físicas de cotas.
- Perfis/documentos da origem são fotografados antes das transferências; perfil principal preexistente e documentos duplicados continuam preservados na origem. Datas do JSON histórico são serializadas ISO.
- Nenhuma exclusão física de paciente/profissional/endereço. Status, motivo de inativação e `sourceIds`/`criteria`/`result` permanecem com o formato anterior.
- Vigilância recebe `connection` do contexto ou tx explícito. Executor injetado diferente do banco da conexão exige o repasse explícito do tx; não abre outra conexão. Fluxo padrão pode usar a conexão Drizzle compartilhada.
- Inspeção e itens são gravados atomicamente. Constatação nova não herda conclusão anterior. Autor de inspeção e emissor do alvará continuam identificados.
- Alvará continua ato explícito, número normalizado/único, mesmas validações de vigência/status. DATE é construído em UTC, evitando a dependência do timezone local do antigo meio-dia.
- O histórico de merge continua sendo sua própria evidência transacional. Estes serviços originalmente não chamavam o writer compartilhado de auditoria; nenhum writer paralelo foi introduzido.

## Conferência física e evidências leves

Autoridade: `.agent/drizzle/database-before-2026-10-28T01-26-00.861Z/catalog.json` e os 156 SQLs originais em `prisma/migrations-ibema`.

- Auditoria offline de **102 projeções / 1.366 colunas** efetivamente importadas: **PASS** em nome físico, tipo e nullability, normalizando apenas grafia equivalente de timestamp/numeric.
- Mapping exclusivo: dez projeções / 78 colunas. Seis tabelas completas de merge/Vigilância e quatro projeções de leitura de estoque; CREATE TABLEs conferidos no baseline (`5861`, `5932`–`5989`, `6928`–`6989`). Nenhum DDL do banco alterado.
- Seeds próprios: **108 tabelas / 134 registros**, conferidos offline quanto a colunas obrigatórias, aridade, referências FK em ordem de criação e índices únicos. A suíte conserva constraints reais do histórico.
- ESLint dirigido dos arquivos desta reserva: **PASS**.
- Parse/imports/exports AST: **18 arquivos / 184 imports / 96 exports, PASS**, sem typecheck pesado; gate dos relatórios: **PASS**.

## Suíte aprovada pela fila central

`tests/drizzle-health-management-operations.test.ts` e fixture independente `tests/helpers/health-management-operations-fixture.ts`:

- replay integral dos 156 SQLs, conexão real Neon/Drizzle sobre PGlite e encerramento de pool/sockets/transporte;
- introspecção de `pg_attribute`/`pg_class` no schema instalado pelo replay como oráculo físico de CI para as dez projeções novas; nenhum teste desta reserva depende de `.agent`, paths do worktree Windows ou do catálogo privado;
- execução de todas as opções públicas de relatório e comprovantes com dados reais, estrutura, metadados e ausência de writes;
- escopo vazio/proibido, recortes SQL e textuais, limites anteriores ao filtro, Decimal/Float, datas UTC, JSON aninhado, sentinela de despesa, CSV/XLSX/PDF;
- TFD, exclusões e privacidade; agrupamento CBO, filtros de CID/procedimento/unidade/profissional/especialidade e origens preservadas;
- os 39 vínculos de paciente populados, documentos/perfis duplicados, critério canônico, replay, locks da própria sessão, transferência de perfil sem principal e rollback integral;
- profissional com duplicados/únicos/especialidade nula; endereço preservado;
- falha tardia injetada na inserção do histórico, conflito real de cota e guarda de gestação;
- denúncias anônimas/identificadas, constatações independentes, emissão/status/DATE de alvará e falha injetada nos itens da inspeção.

Execução leve realizada nesta frente (não abre PGlite/pool):

```text
node --max-old-space-size=192 --conditions=react-server --import tsx --test --test-name-pattern="AST:" tests/drizzle-health-management-operations.test.ts
```

Comando de referência da suíte integral aprovada centralmente:

```text
node --conditions=react-server --import tsx --test --test-concurrency=1 tests/drizzle-health-management-operations.test.ts
```

Resultado informado pelo parent: **todos os 12 filhos SQL + pai e AST PASS**. A execução cobre os 39 vínculos de paciente, os seis vínculos diretos de profissional, critérios canônicos, guardas de gestação/cota, rollback tardio, reutilização do tx, escopo de unidade/TFD, limites 2.000/5.000/100, renderers, anonimato e ausência de exposição clínica adicional. Os dez testes de download também passaram no lote conjunto: **24/24, zero FAIL, zero skip, 47,03 s**.

**Gate temporal residual — parent:** próximas execuções explícitas com `TZ=UTC` e `TZ=Pacific/Auckland`. O host atual foi informado como São Paulo; o resultado acima não é contabilizado como validação explícita em UTC. A contenção entre sessões independentes requer PostgreSQL externo; a suíte aprovada verifica o lock na própria sessão e rollback.

**Pendências de integração:** gates temporais residuais, typecheck integrado e contenção externa, sob responsabilidade central. A execução SQL aprovada foi realizada pelo parent; nesta frente permanecem apenas as evidências leves já registradas e a retenção para bugs próprios, sem novos runs.
