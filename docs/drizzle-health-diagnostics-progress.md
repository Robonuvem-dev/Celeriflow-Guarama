# Drizzle — Health Diagnostics

## Entrega e escopo

Transferência exclusiva do owner Saúde: `src/lib/saude/laboratory-service.ts`, `specialized-care-service.ts`, `raas-source-service.ts` e `sisab-service.ts`; schema, repositório e contrato novos `health-diagnostics`; testes/helpers com os prefixos exatos `laboratory-`, `specialized-care-`, `raas-` e `sisab-`; este documento.

**Os quatro motores estão migrados integralmente para Drizzle neste recorte.** A aprovação de execução real/tipos permanece com a central. Nenhuma suíte PGlite, tsc ou build foi executada nesta entrega. Frotas, TaxAccounting e TFD continuam reservados para retornos centrais; o fix urgente de subqueries Frotas foi concluído durante esta frente e está registrado em `docs/drizzle-fleet-progress.md`.

## Contratos públicos e handoff nominal ao owner Saúde

Todos os nomes, ordem dos argumentos existentes, DTOs e erros de domínio foram preservados. O contexto agora é `HealthDiagnosticsContext = { user: PermissionUser }`, independente do cliente de persistência. As mutações recebem **um último argumento opcional `connection: DatabaseConnection = databaseConnection`**. O único leitor público recebe **`executor: DatabaseExecutor = db`** no último argumento.

| Motor / função | Assinatura de integração / retorno |
| --- | --- |
| `scheduleLabOrder` | `(context, raw, connection?)` → `{ id, status, authorizationKey }` |
| `collectLabSample`, `enterLabResult` | `(context, raw, connection?)` → `{ id, status }` |
| `requestLabRecollection` | `(context, orderId, reason, connection?)` → `{ id, status }` |
| `createLabReport` | `(context, { orderId, title, file }, connection?)` → retorno GED `{ documentId, version }` |
| `reviewLabReport` | `(context, reportId, connection?)` → `{ id, status }` |
| `releaseLabReport` | `(context, reportId, publishToPatient, connection?)` → `{ id, status }` |
| `recordDeviceMessage` | `(context, input, connection?)` → `{ id, status }`, replay pela chave original |
| `saveSpecializedCatalogItem`, `saveSpecializedSchedule`, `saveSpecializedQuota` | `(context, input, connection?)` → `{ id }` |
| `createSpecializedPlan` | `(context, raw, connection?)` → `{ id, status }` |
| `addSpecializedPlanEntry`, `distributeSpecializedMaterial` | `(context, raw, connection?)` → `{ id }` |
| `getHealthRaasSources` | `(context, raw, executor?)` → contrato `CELERIFLOW_RAAS_ORIGINS` / `1.0.0`, com `period`, `origins`, `missingOrigins` |
| `createBatch` | `(context, competence, connection?)` → `{ id }` |
| `processBatch` | `(context, batchId, connection?)` → `{ id, status, accepted, rejected }` |

Grep global de imports e chamadas realizado antes da alteração de assinaturas. Consumidores concretos para o **owner Saúde / Health-pages**:

- `src/app/app-domain/saude/laboratorio/actions.ts`: sete ações que aguardam as funções laboratoriais. O contexto com identidade continua estruturalmente válido; argumentos/retornos/throws esperados pelos formulários estão preservados.
- `src/app/app-domain/saude/centro-especializado/actions.ts`: seis funções especializadas; manter os contratos UI e JSX. As chamadas atuais podem usar a conexão padrão em produção.
- `src/app/app-domain/saude/sisab/actions.ts`: `createBatch` e `processBatch`; preservar o fluxo aguardado pelas ações. Consultas e outros writers dessas actions permanecem sob o owner.
- `src/app/app-domain/saude/producao/raas/page.tsx` e `src/app/api/saude/producao/raas-origens/route.ts`: `getHealthRaasSources` mantém o dataset completo. A consulta própria da página à lista de unidades é responsabilidade do owner e não foi incluída neste recorte.
- Retorno de coordenação mais recente: a central informou nove APIs Saúde migradas, incluindo RAAS/SISAB. Os contratos entregues acima continuam válidos para essa integração; este documento não atribui alterações dessas APIs a esta reserva.
- `tests/health-checklist-internal-flows.test.ts`: as duas chamadas RAAS devem receber **o executor Drizzle local real no terceiro argumento**; o contexto antigo com um cliente local não seleciona automaticamente a conexão do leitor.
- `scripts/verify-s4-cd.ts`: as chamadas SISAB devem receber **a mesma `DatabaseConnection` local no terceiro argumento** após migração integral da fixture/script pelo owner. Os demais motores de território/e-SUS desse script continuam com seus respectivos owners.
- Não foi localizado consumidor externo de `recordDeviceMessage` no grep desta entrega. A API foi preservada para integração de equipamentos.

Nenhuma action, API, página ou biblioteca Saúde fora dos quatro motores foi editada. Não houve mudança de writers compartilhados, pacotes, configurações, contexto global ou Git.

## Transações, locks e semântica preservada

### Laboratório

- Estados originais de solicitação, agendamento, coleta, recoleta, resultado, revisão e liberação; unidade solicitante/de coleta e profissional ativo vinculado ao usuário; barcode único, origem terceirizada e evento rastreável permanecem.
- Mutadores adquirem a tx real por `withDatabaseTransaction`. Ordem de agendamento: **pedido `FOR UPDATE` → advisory cronograma/dia → cota do prestador → pedido/evento**. O contador usa `consumedQuantity < allowedQuantity` na própria atualização, sem limite lido anteriormente que possa ficar obsoleto. Recoleta conserva a regra de não consumir novamente a cota.
- Mantidos a janela de duplicidade (limites inclusivos e exclusão `CANCELLED`/`RECOLLECT`), cronograma por data ou dia da semana, capacidade, cálculo de prazo e chave de autorização do prestador.
- Resultados usam **pedido `FOR UPDATE` → última versão → nova revisão imutável → estado/evento**. Resultados parciais/finais, source/deviceCorrelationId, interpretação nullable e valores JSON mantêm o contrato original.
- `createLabReport` usa `ingestGedDocument(connection, input)` real. O callback recebe **o mesmo `DatabaseTransaction` do GED** e revalida/insere o laudo nessa tx. Documento, versão, laudo e auditoria são atômicos; o upload continua na fronteira de armazenamento original.
- Revisão/liberação adquirem o lock do pedido antes de atualizar laudo/estado/evento. Preservadas configuração ativa mais recente, assinatura `SIGNED` **e** versão documental `SIGNED`, habilitação do portal e igualdade de timestamps de liberação/publicação quando aplicável.
- Equipamentos mantêm operador ativo, SHA-256 do payload original, projeção sanitizada e replay pela chave. Advisory pela chave serializa recebimentos concorrentes, sem mudar o retorno do replay existente.

### Atenção especializada e estoque

- Preservados catálogo normalizado e upsert, cronograma da equipe/unidade, paciente ativo, matrícula/plano, titular profissional ativo da equipe e prontuário pertencente ao paciente/unidade. Especialidade/serviço ativos continuam sendo validados para cada registro.
- Admissão mantém **advisory equipe/unidade/mês → capacidade mensal → plano**; planos cancelados não ocupam a capacidade. A regra temporal original da consulta de capacidade foi conservada.
- Entradas e distribuição usam **plano `FOR UPDATE`**. O incremento de consultas é atômico e exclusivo de `EVOLUTION`; BMI continua Float arredondado a duas casas. Pareceres/interconsultas/desfechos mantêm o comportamento original.
- Distribuição: **plano → cota condicional → locks de inventário/posição do writer patrimonial → movimento/valorização/auditoria → distribuição**. Estoque bloqueado, vencido ou de outra unidade continua proibido; a cota deve corresponder ao paciente/material. O limite usa a coluna `allowedQuantity` atual no próprio UPDATE.
- `applyStockMovement(tx, input)` recebe **a tx original**, junto com identidade do servidor e `allowedBudgetUnitIds` do usuário. Não há conexão secundária nem writer paralelo de estoque, custos ou contabilidade. Referência, quantidade, lote, stockId, movementId, autor e entrega preservam a origem real.

### RAAS

- Leitura por `DatabaseExecutor` tipado; joins hidratam separadamente atendimento domiciliar/avaliação/pedido, paciente/pessoa, unidade, profissional/servidor, diagnósticos CID e procedimentos SUS completos.
- Preservados intervalo mensal **[início 00h -03:00, início do mês seguinte 00h -03:00)**, seleção CAPS case-insensitive, prontuário concluído, ordenação por data/ID, escolha da modalidade e faltas/criticismos originais. OR vazio no modo domiciliar vira `false`, impedindo leitura fora das origens selecionadas.
- Escopo de unidade é aplicado ao pedido domiciliar e ao prontuário. `missingOrigins` conserva o aviso de prontuário concluído não localizado; vínculo paciente/unidade e elegibilidade inconsistentes continuam produzindo `ORIGEM_DOMICILIAR_INCONSISTENTE`, sem apagar a evidência.
- DTO completo conserva nomes, CNS, nascimento/gênero, CNES/tipo, CBO, CID principal, procedimentos/quantidade/profissional/data e prova domiciliar (avaliação, modalidade, caráter, solicitação e indicação). Datas retornam ISO dos mappers tipados, sem DTO raw fingindo `Date`.

### SISAB

- Geração usa **tx única + fichas `FOR SHARE` → lote → itens**. Seleciona fichas `FINALIZADA` da competência, ordem `createdAt`, limite original de 2000, autorização de cada unidade, precedência dos identificadores e layout local `ESUS` original.
- Arquivo, cabeçalho, hash SHA-256, total e associação lote/fichas são congelados na geração. O processamento conserva esse arquivo/hash e **revalida a ficha de origem atual**, permitindo a correção e o reenvio já utilizados por `verify-s4-cd.ts`. Não foi trocado por snapshot de payload que bloquearia esse contrato.
- Processamento usa **lote `FOR UPDATE` → fichas `FOR SHARE` → autorização de unidades → status/itens/contadores/retorno** na mesma tx. Falha em qualquer gravação restaura todos os estados, inclusive `PROCESSANDO`; reprocessamentos concorrentes são serializados.
- Preservadas validações de unidade/profissional, cidadão, domicílio/família, equipe, campos/opções/números e tipos de ficha; aceites, rejeições, mensagens individuais e JSON de erros são completos. O retorno é do validador local configurado, sem protocolo nacional inventado. Finalização/cancelamento/edição da ficha de origem continuam nos motores e-SUS do owner.

## Fidelidade física e escalares

- Autoridade independente: `.agent/drizzle/database-before-2026-10-28T01-26-00.861Z/catalog.json`, baseline e demais **156 SQLs originais** em `prisma/migrations-ibema`. A fixture executa os arquivos históricos; não deriva DDL de cliente/metadados ORM.
- `src/db/schema/health-diagnostics.ts`: **16 tabelas completas, 177 colunas, 42 FKs nomeadas com ações instaladas, 35 defaults SQL**; nomes/cobertura de todos os índices também conferidos contra o snapshot.
- As colunas de referência, antropometria, cotas/quantidades especializadas e distribuição são fisicamente **double precision**; permanecem Float. As tabelas novas não contêm numeric exato. Valores exatos nos schemas compartilhados e no writer de estoque conservam seus mappers Decimal; nenhum numeric raw passa por Number nesta frente.
- Seleções temporais usam colunas tipadas. SQL raw fica limitado a locks sem DTO temporal/monetário. Datas não são declaradas `Date` em genéricos de `execute` sem mapper.
- JSON é serializado uma vez na fronteira de escrita, preservando strings que parecem JSON. `sanitizedData: undefined` mantém SQL NULL; `sanitizedData: null` usa `JsonNull` explícito, conservando o literal JSON null.

## Testes próprios preparados

- `tests/laboratory-drizzle.test.ts`: autorização/unidade/coletor/barcode, capacidade e cronogramas, janela de repetição/cancelamento, cota/recoleta/rollback, versões concorrentes e imutáveis, JSON, GED/assinatura/publicação, replay e SQL NULL versus JSON null.
- `tests/specialized-care-drizzle.test.ts`: catálogos/upserts/Float, paciente/prontuário/equipe/titular, capacidade concorrente e cancelamento, registros/BMI/contador, stock writer real, auditoria e rollback, lote/unidade/bloqueio/validade/saldo e concorrência de cotas entre planos.
- `tests/raas-drizzle.test.ts`: DTO completo de origem real, CID/procedimento, timestamps UTC, corte mensal brasileiro, CAPS case-insensitive, críticas completas, origem inconsistente, missingOrigins e escopos vazios/restritos.
- `tests/sisab-drizzle.test.ts`: composição/arquivo/hash congelados, finalização/competência/unidade, erros completos e correção/reprocessamento, retornos aceito/parcial/rejeitado, rollback de geração/item/retorno e processamento concorrente.
- `tests/helpers/laboratory-drizzle-fixture.ts`: fixture própria de todos os SQLs, Neon/Drizzle reais e transporte compartilhado local PGlite, **servidor máximo 10 conexões e pool máximo 5**. Asserções de falhas injetadas exigem SQLSTATE `P0001` e mensagem exata na cadeia de causas; erro de schema/conexão não conta como rollback aprovado.
- `tests/helpers/laboratory-blob-store.ts`: endpoint HTTP loopback só para armazenamento, usando o SDK Blob e `uploadFile` reais; GED, banco, versões e auditoria permanecem reais. Nenhuma escrita de armazenamento remoto é necessária.

### Verificações locais efetivamente executadas

- **PASS**: `tests/laboratory-mappings.test.ts` (conferência física completa e fronteira JSON), processo a 128 MB.
- **PASS**: fronteira Blob/SDK em loopback, bytes enviados e recebidos idênticos, sem banco/armazenamento remoto; processo a 128 MB.
- **PASS**: ESLint do recorte; parser TypeScript leve em 15 arquivos. Parser não é verificação de tipos.
- **PASS**: grep dos quatro motores sem import/acesso Prisma, `$transaction`, `$queryRaw`, `$executeRaw`, fachada ORM ou cast de executor/conexão.
- **NÃO CONCLUÍDO por memória**: tentativa extra de smoke de importação conjunta dos quatro serviços atingiu o heap de **128 MB** antes de concluir. Nenhuma conexão ou fixture foi adquirida; o limite não foi ampliado nem a tentativa repetida. A importação/runtime completo permanece para a central junto com a suíte real.
- **PASS CENTRAL RUNTIME**: os três filhos corrigidos e todas as etapas posteriores dos cenários passaram no reteste descrito abaixo; RAAS já havia passado integralmente. Aprovação strict integrada de tipos e build global continuam com a central. As suítes reais foram executadas pela central, não nesta frente. Nenhum commit/push, DDL/DML remoto ou configuração compartilhada foi realizado; a única consulta Git nesta rodada foi a leitura autorizada de `HEAD:src/lib/saude/sisab-service.ts` para conferir o contrato legado.

### Reteste central e correções de Diagnostics (2026-10-28)

- Retorno central: conjunto de **73 testes / 65 PASS / 8 FAIL (4 filhos + 4 pais), 259,94 s**. Frotas (três suítes), TFD e Portal final **todos PASS**. Diagnostics: RAAS **todos PASS**, outros **17 filhos PASS**, três filhos interrompidos corrigidos abaixo. O conjunto inclui uma falha filha fora desta reserva.
- **Laboratory / GED:** a fixture tentava concluir `DocumentVersion.status='SIGNED'` sem `lockedAt`, corretamente barrada pelo guard `Signing document versions must be locked`. A fixture agora bloqueia a versão na tx, passa para `PENDING_SIGNATURE` com timestamp de lock, grava a assinatura com hash/identidade/timestamps válidos e só depois conclui `SIGNED` preservando o lock. Acrescentadas verificações de hash, URL, código público e finalização imutáveis. Mantidas a rejeição pré-assinatura, a rejeição enquanto a versão está pendente e todas as assertions posteriores de rollback/liberação/publicação. Nenhum guard GED foi alterado.
- **SISAB / bytes:** conferido o legado por `git show HEAD:src/lib/saude/sisab-service.ts`: o cabeçalho sempre foi `COMPETENCIA:${competence}` (**AAAA-MM**), enquanto as linhas `ESUS` usam `competence.replace('-', '')` (**AAAAMM**). Corrigida somente a expectativa do teste para `COMPETENCIA:2026-01`; arquivo/hash do serviço e expectativas `ESUS|202601|...` foram preservados.
- **Specialized / auditoria real:** o filtro pelo ID do movimento era correto. O writer interno `applyStockMovement` não gera `AuditEvent` para `EXIT` ordinário. A distribuição especializada agora registra `ADMINISTRATIVE_MUTATION` / `MATERIAL_MOVEMENT` com ator e ID do movimento **na mesma tx original**, antes do registro de distribuição. Usa o writer tipado compartilhado existente, sem alterá-lo. Mantida a expectativa de exatamente **1** evento, reforçada com tipo/alvo/ator. A falha injetada de auditoria agora também confere rollback integral de estoque, distribuição e contagem de eventos, além das verificações existentes de cota e movimento.
- Verificação local pós-fix a **128 MB**: **ESLint PASS**, **parser PASS (4 arquivos)** e conferência leve do contrato fonte cabeçalho/ESUS **PASS**. Nenhuma fixture PGlite, tsc ou build repetido. Naquele handoff o runtime pós-fix aguardava reteste, depois **aprovado integralmente pela central** conforme registro abaixo.
- Log central: `C:/Users/trici/.local/share/opencode/shell/969fc413fd5d7b689a08b7e442ae2897ef72c357/sh_183f0e06e001MLRmNdAkwDgrDq.out`.

### Aprovação real central pós-fix

Novo retorno central: conjunto Diagnostics + Recruitment + Construction de **36 TESTS / 36 PASS / 0 FAIL / 0 SKIP, 120,55 s**. **Laboratory: 7 filhos + pai PASS; SISAB: 6 filhos + pai PASS; Specialized: 7 filhos + pai PASS.** RAAS **3 filhos + pai PASS** na execução anterior. Confirmadas as três causas/correções: lock GED válido na fixture, cabeçalho legado SISAB preservado e evento de auditoria Specialized ausente agora gravado na tx original. As etapas que antes paravam nesses pontos também completaram. Não há falha Diagnostics real remanescente informada pela central; aprovação global strict/build continua no fluxo central.

Comando preparado para a central, sequencial e sem fixtures paralelas no mesmo worker (o transporte Neon usa configuração global):

```powershell
node --conditions=react-server --import tsx --test --test-concurrency=1 tests/laboratory-drizzle.test.ts tests/specialized-care-drizzle.test.ts tests/raas-drizzle.test.ts tests/sisab-drizzle.test.ts
```

Conferência puramente local de metadados/JSON, já executada:

```powershell
node --max-old-space-size=128 --conditions=react-server --import tsx --test tests/laboratory-mappings.test.ts
```
