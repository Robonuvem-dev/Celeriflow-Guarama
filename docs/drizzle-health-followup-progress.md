# Saúde — intercâmbio de acompanhamento em Drizzle

## Entrega e estado da validação

Os três motores exclusivos foram migrados integralmente para Drizzle:

- `src/lib/saude/followup-exchange-service.ts`: configuração, remessas, seleção de reprocessamento, limites de tamanho e replay de geração.
- `src/lib/saude/followup-receiver-service.ts`: integridade, validação por registro, ownership, atualização versionada, protocolo e retorno.
- `src/lib/saude/followup-source-service.ts`: extração SISPRENATAL, HIPERDIA e RIRA, com identidade, vínculos, metadados e histórico.

Inventário real: estes arquivos implementam o intercâmbio dos três contratos próprios. Negociação, extensão de prazo, gates de encaminhamento e cron citados na missão não possuem implementações nestes três arquivos; a integração dos respectivos motores externos permanece com seu owner.

**Evidências efetivamente obtidas nesta entrega:**

- Zero imports, identificadores ou chamadas diretas Prisma nos três motores e nos novos arquivos exclusivos.
- Oito exports executáveis originais preservados; três novos helpers `InTransaction`, totalizando onze.
- ESLint com `--max-warnings=0` aprovado nos dez arquivos TypeScript exclusivos.
- Parse/AST aprovado nos dez arquivos; 275 acessos a colunas importadas conferidos, sem propriedade desconhecida.
- Oito tabelas completas / 77 colunas conferidas contra `.agent/drizzle/database-before-2026-10-28T01-26-00.861Z/catalog.json`: nenhuma coluna física omitida ou divergência de nome, tipo e nullability.
- Seed independente de 23 inserts / 23 tabelas conferido offline: nenhuma coluna desconhecida ou coluna obrigatória sem default omitida. Replay preparado dos 156 históricos SQL de `prisma/migrations-ibema`.
- Comparação AST com a base confirmou exports anteriores, schemas Zod de configuração/geração e mensagens explícitas de negócio preservados. `followup-contract.ts` e `followup-presentation.ts` permanecem idênticos à base.
- `node --import tsx --test tests/health-followup-contract.test.ts`: **3 PASS / 0 FAIL / 0 SKIP**.

**Primeiro retorno SQL central recebido: 5 PASS / 4 FAIL nos nove subcenários, além da falha agregada do pai.** Os fixes e o bloqueio compartilhado estão registrados na seção de retorno central abaixo. O reteste dos fixes, a regressão de fusos, strict/typecheck e build continuam centralizados pelo parent. A validação estática e os testes puros acima não representam aprovação integrada.

## Arquivos exclusivos novos

- `src/lib/contracts/health-followup.ts`: `HealthFollowupContext = { user: PermissionUser; database?: DatabaseExecutor }`, estruturalmente compatível com os contextos existentes.
- `src/db/schema/health-followup.ts`: `HealthFollowupReceiver`, `Binding`, `Batch`, `BatchItem`, `Receipt`, `Record`, `ProcessedKey` e `Result`, correspondentes às tabelas físicas existentes.
- `src/db/repositories/health-followup/exchange.ts`: composição explícita dos grafos de conexão/receptor/unidade e remessa/itens/recibo/resultados, além da recuperação idempotente da geração.
- `src/db/repositories/health-followup/sources.ts`: leitores fixos de atores, gestação, avaliações/condições crônicas e regulação/esperas; imports explícitos dos schemas existentes.
- `tests/helpers/followup-database.ts`: DDL histórico completo, seed próprio e contextos sem cliente legado.
- `tests/helpers/followup-evidence.ts`: evidências independentes para testar integridade, rejeições e JSON null, respeitando os triggers de imutabilidade.
- `tests/followup-drizzle.test.ts`: nove subcenários SQL com o transporte real Neon/WebSocket → Drizzle → PGlite, usando `tests/helpers/local-drizzle-database.ts`.

## Contratos e composição transacional

Leitores públicos:

```ts
followupBindingForActor(executor: DatabaseExecutor, context, bindingId)
followupBatchForActor(executor: DatabaseExecutor, context, batchId)
collectFollowupSources(context, input, executor?: DatabaseExecutor)
```

O executor padrão de `collectFollowupSources` é `context.database ?? db`. A geração encaminha explicitamente o próprio `tx`; a coleta participa da mesma transação das remessas e da auditoria.

Donos de transação preservam a ordem dos argumentos anteriores e recebem `DatabaseConnection` como último argumento opcional:

```ts
configureHealthFollowup(context, raw, connection = databaseConnection)
generateHealthFollowupBatches(context, raw, connection = databaseConnection)
processHealthFollowupBatch(context, batchId, expectedContract?, connection = databaseConnection)
```

Os retornos permanecem `{ id, connectionId, receiverId }`, `{ batchIds, total }` e o recibo DTO com os mesmos campos e `createdAt` ISO. Configuração usa `timeoutMs: 5_000`; geração e processamento usam `timeoutMs: 120_000`.

Quando a operação de origem já possui transação, usar os helpers abaixo diretamente:

```ts
configureHealthFollowupInTransaction(tx: DatabaseTransaction, context, raw)
generateHealthFollowupBatchesInTransaction(tx: DatabaseTransaction, context, raw)
processHealthFollowupBatchInTransaction(tx: DatabaseTransaction, context, batchId, expectedContract?)
```

Esses helpers usam exclusivamente o `tx` recebido: locks, leituras, origem ainda não commitada, remessas, registros recebidos, chaves processadas, resultados, execução de integração, protocolo, sequência e auditoria. Não abrem uma conexão ou transação própria.

O teste de composição chama os três helpers e `insertInternalNotifications(tx, input)` do writer real compartilhado na transação da origem. Verifica dedupe da notificação e prepara rollback de conexão/receptor/vínculo, remessas/itens, recibos/resultados, registros/chaves processadas, sequência, integração, auditoria, notificação e alteração da origem. Também prepara o commit e replay desse mesmo fluxo. As notificações continuam sob a política de destinatários do produtor; os motores de intercâmbio originais não emitiam notificações automaticamente.

O wrapper de processamento preserva o registro da tentativa técnica fracassada após rollback: grava `IntegrationRun` com status `ERRO`, sem protocolo, por uma nova transação na **mesma `DatabaseConnection` fornecida**. A entrada `InTransaction` propaga o erro ao dono e não grava evidência em outra transação. A pré-leitura do wrapper também usa `connection.db`.

## Invariantes preservados

- ACL de unidade é aplicada nos leitores públicos, configuração, coleta, geração e recebimento, inclusive no replay de recibos. Reprocessamento exige o mesmo vínculo/conexão/unidade.
- Locks consultivos mantêm as chaves anteriores: configuração por unidade/contrato e código em ordem estável; geração por vínculo/requestKey; processamento por receptor. Recuperação e coleta ficam dentro da transação de geração.
- Hash canônico, contrato/versão, remetente/destinatário, tamanho, quantidade, ordinal e igualdade entre payload e itens continuam conferidos. Remessas se dividem por 500 registros e limite de bytes; seleção acima de 5.000 origens falha integralmente.
- Triggers físicos continuam preservando remessa/payload, itens, recibos, resultados, chaves processadas e eventos de espera. Correção gera nova evidência.
- Rejeições continuam por registro, com mensagens, contadores e status `PROCESSADA`, `PARCIAL`, `REJEITADA`, `VALIDADO`, `REJEITADO`, `JA_RECEBIDO` e `VERSAO_ANTERIOR` preservados.
- Ownership confere identidade da pessoa/paciente, profissional/employee, gestação, atendimentos, avaliações na unidade, pedido/espera, espera vinculada e agendamento. A ordem original do replay por chave conhecida permanece preservada.
- Mesmo conteúdo não duplica o registro; retrato mais recente pode atualizar `snapshotAt`/payload sem trocar a versão de origem. Conteúdo de versão anterior não sobrescreve a versão recebida mais recente.
- Gestação mantém visitas, puerpério, exames/revisões e vínculos. HIPERDIA mantém elegibilidade histórica, condições longitudinais e avaliações completas do paciente elegível, incluindo evidência futura já existente; seleção explícita de reprocessamento mantém sua regra anterior. RIRA reúne os eventos de pedido e espera vinculada e preserva espera administrativa com profissional nulo.
- Endereço residencial mais recente usa `createdAt DESC, id DESC`; contato ativo usa `createdAt DESC`; prioridade de telefones, CNS, CNES e metadados de paciente/profissional/unidade permanecem iguais.
- Limites civis da coleta usam `-03:00` explícito; `fromDate`/`toDate` são SQL `date`, decodificados como `Date` UTC. Ano do protocolo usa UTC.
- Timestamps de negócio são lidos por colunas tipadas e convertidos explicitamente pelos mappers de DTO. A única consulta SQL crua de origens retorna apenas `patientId`, sem temporal/numeric cru a reinterpretar. A recuperação de geração faz `count(*)::int`.
- Medidas e avaliações permanecem Float/float8; arrays são arrays físicos. Não foi introduzida conversão de numeric textual por `Number`. Payloads preservam o round-trip JSON original e valores `null`; o caso de item contendo JSON null usa `JsonNull`, sem confundi-lo com SQL NULL.

## Handoff para owner Saúde via parent

Todos os imports/usos foram encontrados antes da mudança de assinatura e reconferidos após a migração. Os consumidores externos abaixo ainda precisam da integração do owner:

1. `src/app/app-domain/saude/acompanhamento/remessas/[id]/page.tsx`: trocar o primeiro argumento `context.prisma` do leitor pelo executor Drizzle; migrar a consulta externa de `IntegrationRun`.
2. `src/app/api/saude/acompanhamento/remessas/[id]/route.ts` e `.../[id]/retorno/route.ts`: encaminhar executor Drizzle ao leitor; migrar a gravação externa de auditoria para `insertAuditEvent`.
3. `src/app/api/saude/acompanhamento/receptores/[contract]/route.ts`: migrar a pré-leitura de metadados, o argumento legado do leitor e o tratamento de ausência. `followupRow` lança `PersistenceError` com `kind: "not-found"`; o catch atual de `Prisma.PrismaClientKnownRequestError/P2025` precisa ser integrado preservando o HTTP 404 e a mensagem existente.
4. `src/app/app-domain/saude/acompanhamento/actions.ts`: contexto estrutural e retornos continuam compatíveis. Preservar `Promise<void>`, redirects/revalidate e tratamento atual de erros. Em conexão não padrão, encaminhá-la no argumento final.
5. `tests/health-checklist-internal-flows.test.ts`: migrar a fixture multissetorial para conexão/executor reais, encaminhar a conexão às operações donas de transação e substituir `f.db` legado passado a `followupBatchForActor`. Casos anteriores permanecem preservados.
6. Produtores clínicos que compõem origem/intercâmbio/notificação devem usar os helpers `InTransaction` e `insertInternalNotifications` com o mesmo `tx`. Os wrappers são entradas donas da transação, não entradas de composição.

## Janela central solicitada

Executar sequencialmente, pois a configuração WebSocket Neon da fixture é global ao processo:

```powershell
node --conditions=react-server --import tsx --test --test-concurrency=1 tests/followup-drizzle.test.ts tests/health-followup-contract.test.ts
```

Repetir em processos separados com `TZ=UTC`, `TZ=America/Sao_Paulo` e `TZ=Asia/Tokyo`, conforme coordenação central. Goldens preparados:

- SQL `2026-10-19 12:34:56.789` → `2026-10-19T12:34:56.789Z`.
- SQL `date '2026-10-19'` → `2026-10-19T00:00:00.000Z`.
- Seleção do dia brasileiro inclui `2026-10-19T03:00:00.000Z` e `2026-10-20T02:59:59.999Z`, excluindo os milissegundos adjacentes externos.

Após integração dos consumidores e SQL, o parent centraliza strict/typecheck e build. Registrar aqui somente resultados efetivamente recebidos.

## Retorno central e fixes — 28/10/2026

**Responsável:** GPT-6.1 Sol — sessão `ses_e7d4ec64bffebKecNlUTI0H1Ie`. Prioridade transferida pelo parent após a entrega dos dois fixes de Compras; reserva Followup preservada. Writers compartilhados, schemas existentes e históricos SQL permanecem sob seus respectivos owners.

### Resultado recebido, anterior aos fixes

- Nove subcenários: **5 PASS / 4 FAIL**, além da falha agregada do teste pai.
- Passaram: configuração/ACL/locks, origens/Float/arrays/null/ISO UTC/visibilidade histórica, Hiperdia/RIRA/reprocessamento/versões, ownership/JSON null e limites de **500+1 / 5.001**. O cenário de limites levou aproximadamente 55,86 s.
- Falharam: igualdade dos retornos de geração concorrente, primeira prova de imutabilidade, composição transacional com notificação e seleção temporal que esperava a origem commitada pela composição.
- Esses resultados são da execução central anterior. Nenhum reteste SQL dos fixes abaixo foi executado por esta frente.

### 1. Contagem do replay — bug de produção corrigido

- `readFollowupGeneration` interpolava as duas colunas diretamente em SQL da projeção de uma consulta de tabela única. O emissor instalado removia os qualificadores, gerando:

  ```sql
  SELECT count(*)::int FROM "HealthFollowupBatchItem" WHERE "batchId" = "id"
  ```

  Esse `id` passava a ser o do item interno, não o da remessa externa. A criação retornava a quantidade de origens, mas a recuperação por requestKey podia retornar zero para os mesmos `batchIds`.
- Correção restrita a `src/db/repositories/health-followup/exchange.ts`: subconsulta construída pelo próprio select tipado, preservando a correlação `"HealthFollowupBatchItem"."batchId" = "HealthFollowupBatch"."id"` e `count(*)::int`. Não há temporal cru nem mudança no DTO `{ batchIds, total }`.
- O único consumidor (`recover` em `generateHealthFollowupBatchesInTransaction`) foi reconferido. Assinaturas, locks, filtro por requestKey e soma dos itens de todas as remessas permanecem iguais.
- O cenário concorrente continua exigindo igualdade integral e total 1. O cenário 500+1 agora também exige replay integral idêntico com total 501, verificando a soma entre remessas.
- Verificação leve com o **QueryBuilder real instalado**, sem executar SQL: reproduzido o SQL anterior incorreto e emitido o SQL novo corretamente correlacionado; três asserções aprovadas.

### 2. Imutabilidade — eliminar falso diagnóstico por UPDATE sem linha

- `firstPrenatalBatch` e `firstReceipt` só eram preenchidos depois da igualdade de geração do cenário anterior. Quando ela falhava, o teste de imutabilidade fazia UPDATE usando ID vazio e não atingia nenhuma linha. Isso explica a ausência de rejeição; não foi encontrada justificativa para alterar o histórico ou seus triggers.
- Conferidos catálogo físico e `20261015233000_health_followup_exchange/migration.sql`: o guard da remessa compara `NEW/OLD` excluindo somente `status`; os guards de item, recibo, resultado e chave processada rejeitam mutação. Não foi alterada nenhuma DDL.
- O cenário de integridade agora cria e processa sua **própria evidência válida**, confirma as linhas reais e tenta alterações efetivas: hash diferente, payload de item, contador do recibo, exclusão da chave e mensagem de resultado.
- As rejeições exigem PostgreSQL **`P0001`** e a mensagem de imutabilidade na cadeia de causas, pois o Drizzle pode encapsular a mensagem do trigger. Seguem exigidos o grafo integral inalterado e replay do mesmo recibo após as tentativas.
- Hash/ordinal inválidos continuam sem protocolo e com dois `IntegrationRun` técnicos `ERRO`. Não foram removidas guardas nem expectativas.

### 3. Composição — bloqueio comprovado no writer compartilhado de notificações

- A linha 187 original contém duas chamadas de `insertInternalNotifications(tx, notification)`. O `1 !== 0` é o **segundo `created` da notificação**, não uma rejeição clínica do recibo. A composição já havia gerado e processado a evidência antes de chegar ali. O teste agora explicita também `receipt.accepted === 1` e `receipt.rejected === 0` antes das notificações.
- `src/db/repositories/platform/notifications.ts` insere com `ON CONFLICT DO NOTHING`, mas o catálogo físico e os 156 históricos têm apenas:

  ```sql
  CREATE INDEX "ProtocolNotification_userId_dedupeKey_idx"
  ON "ProtocolNotification" ("userId", "dedupeKey");
  ```

  O índice **não é UNIQUE**. Uma nova chave primária é gerada em cada insert e a repetição de destinatário/dedupeKey não produz conflito; portanto a segunda chamada cria outra notificação.
- A projeção atual em `src/db/schema/notifications.ts` declara um unique parcial que não consta no catálogo físico. A fixture parcial de `tests/internal-notifications.test.ts` também cria esse unique, ocultando a divergência. Esses arquivos são externos à reserva Followup.
- **Handoff nominal ao parent/owner do writer:** corrigir dedupe no writer com o catálogo real, preservando o mesmo `DatabaseTransaction`, retorno `{ created, dedupeKey }`, destinatários e auditoria. Uma opção compatível sem DDL é serializar a chave destinatário/dedupe com lock transacional e reler a existência antes do insert; a implementação e todos os consumidores cabem ao owner compartilhado. Não é necessário criar índice na fixture Followup nem alterar produção/históricos para esconder a falha.
- A asserção da segunda chamada com `created === 0`, o erro sentinela `rollback único da origem e notificação`, a comparação de todos os totais/sequências após rollback, o commit posterior e o replay permanecem exigidos. O reteste completo fica bloqueado nesse contrato externo até a integração do owner.

### 4. Limites civis — cascata do rollback, golden preservado

- A falha da notificação interrompe `compose(true)` antes do erro sentinela esperado. Assim `compose(false)` nem chega a executar e `followup-atomic-source` não é commitada.
- O cenário temporal esperava justamente essa origem persistida, além dos dois instantes internos. Não há evidência central de erro nos quatro limites temporais por si só.
- O golden **`["followup-atomic-source", "followup-boundary-1", "followup-boundary-2"]`** foi preservado. A dependência está documentada no teste: a origem deve faltar após `compose(true)` e existir após `compose(false)`. Nenhuma data, expectativa celeste ou configuração de TZ foi ajustada para mascarar o rollback.

### Verificações leves e próxima janela

- ESLint `--max-warnings=0` aprovado nos dois TypeScript alterados de Followup.
- Parse, ausência de conflitos e whitespace residual: aprovados nos dois arquivos.
- Catálogo confirmou os cinco triggers de imutabilidade Followup e o índice não único de notificação. Emissão de SQL pelo QueryBuilder real aprovada, sem SQL executado.
- Sem PGlite, tsc ou build paralelo nesta correção; o parent informou strict central em andamento. Não há novo resultado strict/build atribuído a esta frente.
- Após integrar o writer compartilhado, executar novamente a janela sequencial já indicada acima, incluindo os nove cenários e os três testes puros de contrato. Regressão em três fusos e aceite integral continuam com o parent.
