# Handoff — núcleo Planejamento em Drizzle nativo

## Entrega

- `src/lib/planejamento/access.ts`: contexto com executor/conexão nativos; acesso legislativo consulta `modules` via Drizzle. Scopes SQL de `src/db/repositories/planning/scope.ts` substituem os helpers de filtros Prisma.
- `src/lib/planejamento/service.ts`: elaboração, classificação, leitura paginada, agregações e inserções usam tabelas e repositórios Drizzle.
- `src/lib/planejamento/versions.ts`: consistência, workflow legal, implantação, compatibilização, histórico físico e versões usam transações nativas. Preservados os bloqueios, replay, auditorias, isolamento repeatable-read e propagação do executor transacional às prévias.
- `tests/helpers/planning-accounting-fixture.ts` e `planning-execution-fixture.ts`: replay do histórico SQL completo com driver Drizzle real; expõem `db` e `connection`. Mantido backend PostgreSQL externo isolado opcional. Contextos contêm os campos obrigatórios de identidade.
- Migrados os testes `planning-domain`, `planning-operations`, `planning-accounting`, `planning-execution`, `planning-completion`, `planning-postgres`, `planning-publication`, `planning-rcl-entity-history`, adoção municipal e atomicidade financeira de Compras.
- `warehouse-request-workflow.test.ts` já utilizava persistência nativa e foi validado.

### Manifesto de arquivos deste handoff

| Arquivo | Conversão / cobertura preservada |
| --- | --- |
| `src/lib/planejamento/access.ts` | Contexto, autorização de módulo e jurisdição; remoção dos filtros Prisma em favor dos scopes SQL existentes. |
| `src/lib/planejamento/service.ts` | Entidades/unidades, instrumentos, programas, ações, linhas, transferências e leitura com totais/revisões/paginação. |
| `src/lib/planejamento/versions.ts` | Inspeção, aprovação/sanção/publicação/implantação, compatibilização/propagação, metas físicas e snapshots históricos. |
| `tests/helpers/planning-accounting-fixture.ts` | Conexão nativa, histórico SQL completo, seed de identidade/ente/UG/exercício, peças e regras contábeis. |
| `tests/helpers/planning-execution-fixture.ts` | Implantação/programação, configuração contábil e de execução, solicitações/reservas via conexão, documento fiscal e conta bancária. |
| `tests/planning-domain.test.ts` | Contextos de autorização e testes de domínio sem delegates. |
| `tests/planning-operations.test.ts` | Contextos operacionais com banco nativo. |
| `tests/planning-accounting.test.ts` | Abertura, eventos, replay, rollback, configuração, reconciliação e exercício futuro; verificações de partidas via Drizzle. |
| `tests/planning-execution.test.ts` | Tributos/Financeiro/Compras com conexão nativa, cotas e realizado, rollback e concorrência externa opcional. |
| `tests/planning-completion.test.ts` | Estrutura/importação, realização, GED/tramitação, RCL/renúncia/projeções; seed S7 e storage fake corrigidos. |
| `tests/planning-postgres.test.ts` | Integração F4–F8, versões, emendas, créditos, implantação, relatórios e isolamento; leituras/inserções e transações nativas. |
| `tests/planning-publication.test.ts` | Publicação PDF/CSV, HTTP público, hash, replay, storage, lease, retirada e autorização; leitura pública recebe executor. |
| `tests/planning-rcl-entity-history.test.ts` | Histórico RCL isolado por ente, persistido/lido via Drizzle. |
| `tests/municipal-catalog-adoption-postgres.test.ts` | Adoção aditiva/de-para/vigência/snapshot, redistribuição por fonte e rollback; JSON/Decimal tipados. |
| `tests/procurement-financial-atomicity.test.ts` | Seis cenários Executivo/Legislativo: solicitação/reserva/empenho e recebimento/medição/liquidação; falha do evento final, rollback e replay com escopo/conteúdo/documento. |
| `tests/warehouse-request-workflow.test.ts` | Já nativo, sem alteração necessária: origem/destino, aprovação segregada, entrega parcial/integral, idempotência, saldo e custódia de equipamento sem tombamento. Validado com a fixture convertida. |
| `docs/drizzle-planning-core-final-progress.md` | Registro da entrega, evidências e próximos comandos centralizados. |

## Contratos e detalhes relevantes

- Leituras recebem executor; mutações Financeiro/Compras recebem conexão. Não foi criada camada de emulação dos delegates Prisma.
- `PlanningContext` aceita executor transacional por meio de `PlanningDatabaseContext`; `planningConnection` resolve a conexão de mutações.
- As fixtures preservam `pg` para SQL de seeds, triggers e testes de integridade. `prisma/migrations-ibema` é o histórico SQL reproduzido, não uma dependência do cliente Prisma.
- Nesse contrato, `pg` é o campo da fixture, não uma dependência do pacote `pg`. O backend externo usa agora `Client` de `@neondatabase/serverless`, com `client.neonConfig` e ponte WebSocket → TCP local; não altera a configuração global Neon. Mantidos `schema`, `connectionString`, `exec`, `query` e `close` para o consumidor direto `planning-accounting-fixture.ts` e para a ponte financeira.
- A whitelist continua exigindo `127.0.0.1` e `/planning_s2`; cada backend cria schema `planning_` com UUID sem hífens e configura o `search_path`. Cleanup idempotente remove o schema, encerra o cliente e destrói sockets/servidor, inclusive em falha de inicialização; falhas de cleanup junto da inicialização são preservadas em `AggregateError`.
- Cenários de corrupção contábil suspendem e restauram triggers explicitamente apenas ao injetar dados inválidos.
- Asserts de falhas PostgreSQL injetadas em Compras verificam a causa nativa encapsulada pelo Drizzle com `financeDatabaseError`, mantendo a mensagem esperada e os asserts de rollback.
- Seeds numéricos exatos usam `Decimal`; JSON heterogêneo e storage fake foram ajustados ao contrato tipado real.

## Verificação

Concluído:

- ESLint nos três arquivos de produção, duas fixtures, todos `tests/planning-*.test.ts`, adoção municipal, atomicidade de Compras e workflow de almoxarifado: passou.
- Typecheck focado dos arquivos deste escopo e dependências: passou, usando configuração temporária em `C:/Users/trici/AppData/Local/Temp/opencode/planning-core-tsconfig.json`.
- Busca de resíduos `@prisma`, `Prisma.`, `$transaction`, `$queryRaw`, `$executeRaw`, `.prisma`: nenhum nos três arquivos de produção e nos testes `planning-*`.
- Domínio/operações/almoxarifado: 11 testes passaram.
- Publicação: 4 testes passaram.
- Adoção municipal: 2 testes passaram.
- Histórico RCL por entidade: 2 testes passaram.
- Contabilidade: 5 testes passaram.
- Atomicidade financeira de Compras: 6 testes passaram, incluindo Executivo/Legislativo e recebimento/medição.
- Completion S3–S6: passaram.
- Execução: os primeiros quatro cenários passaram (constituição/guia, retorno tributário, reserva futura e ciclo empenho/liquidação/pagamento/estorno).
- Na retomada, antes da orientação de centralizar os testes, passaram também Completion S7, execução de arrecadação direta/lançada/replay/estorno e execução de falhas contábeis de empenho/pagamento. O cenário externo de disputa reserva/contingenciamento foi marcado SKIP.
- Gate `.agent/restart-migration-inventory.json`: nenhum finding para Planejamento, fixtures planning, adoção municipal, atomicidade financeira de Compras ou warehouse. O inventário geral ainda está `INCOMPLETE` por arquivos de outros escopos.

Validação final pendente para o parent:

- Integração PostgreSQL F4–F8 após correção dos imports de `catalogImportBatches`/`catalogAmendmentItems`.
- Execução: confirmação tributária e orçamento adotado sem conexão; testes concorrentes externos condicionais.
- Validação integrada após `npm ci` centralizado. Os resultados acima são evidências locais anteriores à instalação centralizada, não aprovação do estado global pós-instalação.
- Backend PostgreSQL externo após substituir o import do pacote ausente `pg`: importação via TSX e guards de host/banco passaram; o transporte real, replay e cleanup de schema aguardam validação centralizada com o servidor isolado. ESLint do backend e da fixture de diária passou nesta retomada, sem executar SQL pesado.

### Comandos para validação centralizada (não executados novamente nesta entrega)

Executar em série para limitar memória:

```powershell
# F4–F8 com imports de tabelas corrigidos
node --conditions=react-server --import tsx --test --test-concurrency=1 tests/planning-postgres.test.ts

# Somente os dois cenários locais de execução ainda sem resultado conclusivo
node --conditions=react-server --import tsx --test --test-name-pattern="S2: confirmação|S2: orçamento adotado" tests/planning-execution.test.ts

# Concorrência real: configurar CELERIFLOW_PLANNING_TEST_POSTGRES_URL antes
node --conditions=react-server --import tsx --test --test-name-pattern="S2 PostgreSQL real" tests/planning-execution.test.ts
```

Comandos de reprodução dos grupos já aprovados, caso a integração exija repetição após instalação:

```powershell
node --conditions=react-server --import tsx --test --test-concurrency=1 tests/planning-domain.test.ts tests/planning-operations.test.ts tests/warehouse-request-workflow.test.ts
node --conditions=react-server --import tsx --test --test-concurrency=1 tests/planning-accounting.test.ts
node --conditions=react-server --import tsx --test --test-concurrency=1 tests/planning-publication.test.ts tests/municipal-catalog-adoption-postgres.test.ts tests/planning-rcl-entity-history.test.ts
node --conditions=react-server --import tsx --test --test-concurrency=1 tests/procurement-financial-atomicity.test.ts
node --conditions=react-server --import tsx --test --test-concurrency=1 tests/planning-completion.test.ts
node --conditions=react-server --import tsx --test --test-concurrency=1 tests/planning-execution.test.ts
```

Check leve já aprovado:

```powershell
npx eslint src/lib/planejamento/access.ts src/lib/planejamento/service.ts src/lib/planejamento/versions.ts tests/helpers/planning-accounting-fixture.ts tests/helpers/planning-execution-fixture.ts tests/planning-*.test.ts tests/municipal-catalog-adoption-postgres.test.ts tests/procurement-financial-atomicity.test.ts tests/warehouse-request-workflow.test.ts
```

## Limitações e integração pelo parent

- Uma execução paralela excedeu a memória disponível. A execução serial seguinte terminou o arquivo de execução com falha genérica do processo após os quatro primeiros cenários, sem diagnóstico de assert; os resultados parciais foram preservados acima.
- A reinicialização do servidor interrompeu três verificações com código 4; esse código não foi tratado como resultado funcional dos testes. A retomada serial foi encerrada assim que o parent orientou centralizar testes pesados (processo e filhos finalizados). O código 1 dessa interrupção deliberada não indica falha de assert; os três cenários concluídos antes dela passaram.
- Os testes que disputam sessões PostgreSQL externas exigem `CELERIFLOW_PLANNING_TEST_POSTGRES_URL`; registrar skips quando essa variável estiver ausente.
- Typecheck global inicial esgotou heap e não produziu resultado confiável. O resultado aprovado acima é focado.
- Há consumidores adicionais das fixtures em testes de contabilidade, custos e fiscal fora deste escopo. O replay completo pode revelar seeds incompletos nesses consumidores; o parent deve incluí-los na verificação integrada.
- Árvore compartilhada: alterações de outros fluxos foram preservadas; `tenant-context.ts` pertence ao parent. Entrega sem commit/push e sem build global, conforme divisão de trabalho. O parent deve executar build antes de qualquer commit de integração.

## Aprovação de entrega

Conversão deste escopo concluída e pronta para integração pelo parent. Não há correção de código conhecida em aberto neste escopo; permanecem as validações runtime explicitadas acima. Gate de resíduos e ESLint aprovados; typecheck focado aprovado antes da centralização. A aprovação global de runtime/build fica condicionada à rodada centralizada do parent. Nenhum teste pesado adicional, typecheck global, instalação, build, commit ou push foi iniciado após a orientação final de centralização.
