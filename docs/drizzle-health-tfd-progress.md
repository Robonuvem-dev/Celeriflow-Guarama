# Drizzle — TFD clínico, processos, transporte e documentos

## Reserva e estado

Reserva exclusiva recebida em 2026-10-28: os sete `src/lib/saude/tfd-*.ts`, `tests/tfd-*.test.ts`, `tests/helpers/tfd-*.ts`, novos contratos/schema/repositories TFD e este documento. Frotas/TaxAccounting permanecem reservas para correções futuras.

As sete libs usam Drizzle/contratos independentes; a política de embarque já era pura. Schema próprio `src/db/schema/health-tfd.ts`, contrato `{ user: PermissionUser }` em `src/lib/contracts/health-tfd.ts`, queries/locks em `src/db/repositories/health-tfd/records.ts`. Não existe fachada de ORM, transação falsa ou conexão promovida a executor.

## Handoff de contratos aos owners Saúde e Health-pages

Grep global de imports **e chamadas** realizado antes das mudanças de assinaturas. Nomes, ordem dos argumentos anteriores e DTOs públicos preservados. Erros continuam sendo exceções de domínio nos serviços; actions mantêm responsabilidade pelo contrato com sua UI.

- **Mutações**: acrescentado último parâmetro `connection: DatabaseConnection = databaseConnection` em `createTfdRequest`, `authorizeTfdRequest`, `createTfdTrip`, `addPassenger`, `movePassenger`, `requestPassengerRemoval`, `confirmPassengerRemoval`, `updateTripStatus`, `saveTfdClinicalReport`, `addTfdReportSupplement`, `transitionTfdClinicalRequest`, `requestTfdBenefit`, `transitionTfdBenefit`, `createTfdTripFromBooking`, `confirmTfdTrip`, `recordTfdPassengerBoarding`. Cada operação abre uma única `withDatabaseTransaction`; a conexão injetada é usada inclusive nas leituras iniciais e releituras depois dos locks.
- **Documento clínico**: `tfdPatientDocument(context, requestId, kind, version?, connection = databaseConnection)`. Histórico é lido na tx recebida da conexão; instituição é lida pelo `connection.db`. Continua retornando `Buffer` de PDF.
- **Leituras**: `tfdRequestForActor(executor: DatabaseExecutor, context, requestId)` preserva a árvore `{ ...request, patient: { ...patient, person }, originUnit, clinicalReport }`; aceita executor de leitura ou tx Drizzle. `tfdProcessReport(context, raw, executor = db)` e `tfdTripDocument(context, tripId, executor = db)` preservam planilha e PDF. `healthTransportFleetScope(context)` mantém retorno e autorização departamental.
- **Lock**: `lockTfdRequest(tx: DatabaseTransaction, requestId)` exige a tx real do caller.
- **Filtros**: `activeTfdPassengerWhere` agora é `SQL`; `tfdTripAccessWhere(user)` retorna `SQL | undefined`. Usar `.where(and(..., predicate))`, **não** spread de objeto ou `AND` de ORM. Os predicados referenciam as tabelas físicas `HealthTfdPassenger` e `HealthTfdTrip`, respectivamente; para filtrar remoções, viagens relacionadas ou ausências, aplicar em subquery/join à tabela correspondente. O universo de acesso inclui integrantes removidos, conforme o original; o filtro ativo serve apenas a capacidade/manifesto/embarque.

Consumidores externos nominais (não editados nesta reserva):

1. `src/app/app-domain/saude/tfd/actions.ts`, `tfd/laudos/actions.ts`, `tfd/viagens/actions.ts` — os serviços mantêm os argumentos originais com conexão padrão; migrar as consultas próprias dessas actions e injetar a conexão local em fixtures.
2. `src/app/app-domain/saude/tfd/page.tsx`, `tfd/viagens/page.tsx`, `tfd/viagens/[id]/page.tsx`, `tfd/laudos/[id]/page.tsx` e `saude/gerencial/page.tsx` — adaptar SQL predicates e executor de `tfdRequestForActor`, preservando JSX.
3. `src/lib/saude/health-report-extra.ts` — queries TFD de relatório e ficha consomem os dois predicados; precisam de Drizzle na query inteira.
4. `src/app/api/saude/tfd/[id]/documento/route.ts`, `tfd/viagens/[id]/documento/route.ts`, `tfd/relatorio/route.ts` — retorno do serviço inalterado; adaptar consultas/autorização locais pelo owner original.
5. `tests/health-checklist-internal-flows.test.ts` e `scripts/verify-s4-ab.ts` — fixture anterior usa cliente legado; injetar a conexão real nas mutações/PDF clínico e executor nas leituras, trocar filtros e migrar as unidades transacionais Fleet completas. Não executar a fixture antiga contra o default global.
6. `src/lib/frotas/control-motion.ts` — `assertTfdBoardingReady` permanece puro e com a mesma assinatura. Nenhuma mudança necessária nessa chamada.

## Atomicidade, autorização e regras preservadas

- Solicitação: paciente, origem e regulação/paciente verificados; evento inicial e solicitação na mesma tx.
- Laudo: lock `HEALTH_TFD_REQUEST:<id>` por `hashtext`, versão esperada, profissional autenticado/ativo e vínculo ativo/temporal à unidade; prontuário do mesmo paciente/profissional/unidade e catálogo SUS. Atualização, revisão JSON imutável e evento na mesma tx.
- Glosa/alteração/aprovação/negação/cancelamento/arquivamento mantêm a tabela original de transições. Cancelamento adquire primeiro request e depois viagens únicas ordenadas; bloqueia integrantes ativos em viagem não cancelada e cancela apenas benefícios pendentes/autorizados.
- Benefícios: autorização exige versão atual, entrega exige recebedor cadastrado ativo e recibo, eventos atômicos; replays inválidos continuam rejeitados. Entregas anteriores são preservadas no cancelamento.
- Passageiros: lock request opcional antes das viagens únicas ordenadas; capacidade conta ativos; exclusão confirmada conserva integrante e unicidade; transferência reseta presença e registra evento nas duas viagens; dupla custódia exige outro usuário. Após saída Fleet, manifesto fechado.
- Escopo de viagens conserva `every` + (`some` ou criador), inclusive pacientes sem unidade (SQL NULL deve negar) e histórico removido. Viagem vazia só é visível ao criador sob escopo restrito. Acesso clínico conserva origem; o titular do pedido/regulação e do laudo não é trocado.
- Ponte Fleet: mesmos advisory locks `FLEET_CONTROL:*` ordenados, mesma tx em `scopedFleetUnit`/`eligibleFleetDriver`, releitura da agenda; rota ativa do departamento, responsáveis ativos e veículo elegível. Adiantamento RH recebe `FOR UPDATE` depois dos locks Fleet, verifica RH + UG + responsável + produção/deferimento, e congela o valor autorizado sem criar pagamentos paralelos.
- O helper RH `assertTravelAllowanceAccess` ainda tipa contexto legado obrigatório embora só consuma `user`. A ponte aplica a mesma regra de permissão RH e UG por helpers públicos de identidade, sem fabricar cliente nem editar RH. O contrato estreito está documentado para integração com o owner RH.
- Confirmação e presença usam lock da viagem; saída/retorno referenciam movimentos reais de Frotas, mesmos timestamps; replay de situação atual não duplica evento.
- Nos sete arquivos recebidos não havia writer de Expense, Payment ou integração financeira executada: benefícios são autorização/entrega e o adiantamento mantém origem RH/Financeiro. Esses efeitos existentes foram conservados; writers e fluxos externos permanecem de seus owners.

## Escalares e evidência física

Autoridade: baseline `prisma/migrations-ibema/20261009232000_baseline/migration.sql`, incrementais `20261015200000_health_tfd_clinical_workflow` e `20261015210000_health_tfd_fleet_boarding`, e snapshot `.agent/drizzle/database-before-2026-10-28T01-26-00.861Z/catalog.json`.

- **PASS** verificação pura (128 MB): 10 tabelas, 121 colunas, 23 FKs — cobertura, tipos, nulabilidade, nomes, tabelas/colunas alvo e ações. `timestamp(3)` sem timezone é o mesmo tipo físico de `timestamp(3) without time zone`.
- Dois valores exatos instalados são **numeric(14,2)**: benefício e adiantamento. Strings entram diretamente em `new Decimal`, sem passagem por `Number`. Não há coluna Float TFD a converter.
- `date` da viagem usa mapper Drizzle `date` → `Date`; todos os timestamps de DTO vêm de selects tipados. Raw SQL retorna apenas locks, sem temporais ou numerics a decodificar. `databaseTimestamp` é a regra para qualquer futura projeção temporal raw.
- Snapshots conservam a serialização JSON original (datas ISO, null interno, propriedades ausentes omitidas, strings que parecem JSON intactas); metadata ausente continua SQL NULL. `JsonNull` diferencia JSON null quando necessário em testes.
- PDF clínico conserva versão histórica, autorização da versão atual para PEDIDO, complementos/eventos/benefícios; PDF de viagem conserva cabeçalho, membros ativos, origem, adiantamento e histórico; relatório conserva colunas, limites 10.000/10.001, filtros e ordenação.

## Verificações e execução central

### Evidência executada nesta frente

- Scan nominal dos **sete** `src/lib/saude/tfd-*.ts`: **zero** imports/acessos Prisma, `$transaction`, `$queryRaw`, `$executeRaw`, `as unknown as` ou cast de executor/conexão.
- ESLint dos **13 arquivos** de implementação/contrato/schema/repository/testes/helpers: **PASS**, sem avisos.
- Parser TypeScript dos mesmos **13 arquivos**: **PASS**, zero erro sintático. Não é typecheck.
- Verificação pura do catálogo físico: **PASS**, 10 tabelas / 121 colunas / 23 FKs / 21 defaults SQL / 2 checks instalados. Defaults de `updatedAt` conservam a diferença física entre baseline sem default SQL e incrementais clínico/benefício com `CURRENT_TIMESTAMP`.
- Checagens puras adicionais, processo de 128 MB: **PASS**, 4 casos de renderização de predicados SQL (escopo, sem escopo, lista vazia e ativos), 2 mappers Decimal com `999999999999.99`, 2 mappers date/timestamp UTC, serialização JSON congelada e 6 casos de embarque/vínculo/tratamento.

### Suíte real e integração central

`tests/tfd-drizzle.test.ts` e `tests/helpers/tfd-{drizzle-fixture,test-environment}.ts` são exclusivos desta reserva. A fixture aplica **todo o histórico SQL original**, usa o transporte local compartilhado `local-drizzle-database.ts` sem editá-lo, servidor no máximo 10 conexões e pool de produção no máximo 5. Não depende da fixture legada do owner Saúde. As credenciais sintéticas dos imports transitivos usam endpoint inválido; serviços recebem explicitamente a conexão/executor local.

Cobertura preparada: catálogo físico; solicitação, titular de regulação e sigilo de unidade/paciente; autorização concorrente única; identidade profissional e vínculo vigente; prontuário correto; versão otimista; glosa/revisão; revisão antiga imutável e PDFs históricos/autorizados; precisão máxima `numeric(14,2)`; autorização concorrente e entrega única de benefício; recebedor/recibo; cancelamento seletivo e arquivamento; colunas/filtros do relatório; disputa de capacidade; transferência com reset de presença; dupla custódia e exclusão histórica; `every` com SQL NULL, viagem vazia e integrante removido; replay de situação; criação Fleet concorrente/departamento; confirmação, acompanhante obrigatório e manifesto fechado; origem e timestamps de saída/retorno; rollback real de solicitação, laudo/revisão, benefício/evento, transferência/evento e saída/retorno Fleet; vínculo RH e UG; JSON null versus SQL NULL e decode raw via `databaseTimestamp`.

Comando para a integração central, sem suites paralelas neste worker:

```sh
node --conditions=react-server --import tsx --test --test-concurrency=1 tests/tfd-drizzle.test.ts
```

Rodada leve final após defaults físicos e regressões de rollback: **ESLint PASS**, **parser PASS (13 arquivos / 7 libs / zero erros)**, scans nominais sem legado/casts nas sete libs e no repository. Nenhum build, tsc, teste pesado, DDL/DML remoto, commit ou push executado nesta frente. A evidência estática não constitui aprovação completa de integração; execução da suíte real e validação de tipos completa permanecem com o parent central.

### Retorno central — matchers de falha PostgreSQL na cadeia de causa

- A central executou o conjunto Works/Followup/TFD em **147,64 s**, com 30 testes / 20 PASS / 10 FAIL (incluindo dois pais). Nesse conjunto, quatro cenários TFD pararam exclusivamente no matcher de erro injetado: solicitação/evento, laudo/revisão, benefício/evento e transferência/evento. O erro externo Drizzle traz `Failed query`; a mensagem esperada fica no `cause` PostgreSQL com SQLSTATE `P0001`.
- `tests/tfd-drizzle.test.ts` agora contém o helper local `isInjectedTfdEventFailure`, que percorre a cadeia de `cause` com proteção contra ciclos e exige **`code === "P0001"` e mensagem exatamente `injected TFD event failure` no mesmo erro**. Não aceita `Failed query` genérico, outro SQLSTATE ou razão diferente.
- Alterados apenas os quatro matchers. Todas as assertions de rollback, contagens, ausência de revisão/benefício, permanência do passageiro na origem e as etapas seguintes dos cenários permanecem presentes, para execução integral no reteste central. Nenhuma transação de produção, writer compartilhado ou validação de domínio foi modificada por este fix.
- Evidência informada pela central antes do fix: **dois testes TFD puros PASS**, **cenário Fleet/TFD com tx original PASS (~5,1 s)** e **adiantamento/RH/UG PASS**. Isso não aprova os quatro cenários interrompidos nem o resultado pós-fix.
- Verificação local pós-fix, a 128 MB: **ESLint PASS**, **parser PASS**, **10/10 casos puros do matcher PASS** (direto, aninhado, múltiplas causas, rejeição de `Failed query`, SQLSTATE/razão divergentes, código e razão em erros distintos, null/undefined e ciclo). Nenhuma fixture/suíte pesada foi carregada ou executada para essa checagem.
- **Handoff à central:** repetir `tests/tfd-drizzle.test.ts` sequencialmente para completar os cenários antes interrompidos. Resultado real pós-fix pendente.
