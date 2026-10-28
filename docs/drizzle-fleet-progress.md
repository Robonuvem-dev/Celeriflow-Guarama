# Drizzle — Frotas

## Coordenação

Frente exclusiva transferida de Assets: `src/lib/frotas/**`, `src/app/app-domain/frotas/**`, `src/app/api/frotas/**`, quatro scripts Fleet, testes `fleet-*`/`frotas*`, schemas/repositórios Fleet e este documento. Lidos AGENTS, plano integral, contratos/status e guias Next locais. Base visual estática: `C:/Users/trici/AppData/Local/Temp/opencode/celeriflow-main-sync`, `5cfa75d`.

## Handoffs nominais ao parent

- **Saúde/Social**: `src/lib/saude/tfd-transport-service.ts` e `tests/health-checklist-internal-flows.test.ts` importam `eligibleFleetDriver`, `lockFleetResources`, `scopedFleetUnit`, `createFleetBooking`, `departFleetTrip`, `arriveFleetTrip`. Estes helpers passam a receber `DatabaseExecutor`/`DatabaseTransaction`, nunca transação Prisma. Migrar a transação inteira do consumidor. Ordem dos locks Fleet e do advisory lock TFD deve permanecer.
- **Assets / portal Frota**: `src/app/portal/frota/motorista/page.tsx` ainda consulta `context.prisma` fora deste escopo; ligar consultas do portal ao executor Drizzle mantendo JSX. `getFleetDriverPortal` e `operateFleetDriverPortal` permanecem com os mesmos parâmetros/retornos públicos.
- **Assets / fixture intermodular — contrato entregue**: `tests/frotas.integration.test.ts` preserva os cenários DEP-03 e chama `operateAsset(context, raw, connection)`. Releitura após o handoff confirmou `src/lib/patrimonio/asset-operations.ts` com contexto estreito `{ user: PermissionUser }` e `connection: DatabaseConnection = databaseConnection`. O consumidor Fleet já fornece a conexão local real; nenhum cast, cliente fictício ou remoção dos cenários foi usado. `recordAssetDisposal(connection, input)` e `applyStockMovement(tx, input)` também estão ligados à conexão/transação local real. Execução da suíte permanece com o parent.
- **Processos/GED**: `ingestGedDocument(connection, input)` já está migrado; o callback `afterCreate(tx, documentId)` recebe a transação real e insere FleetAttachment nessa mesma conexão.
- **Estoque / Financeiro**: `applyStockMovement(tx, input)` deve continuar usando a transação Drizzle Fleet recebida, incluindo writers financeiros/auditoria, sem conexão secundária.

## Progresso

### Runtime, scripts e consumidores no escopo

- As bibliotecas `src/lib/frotas/**`, as consultas de abertura/gestão e as quatro rotas API de Frotas usam Drizzle diretamente. `FleetContext` exige apenas a identidade; o executor opcional atende leitores/fixtures. Mantidos os DTOs públicos de linhas/opções, ActionResult, erros aguardados pela UI, filtros setoriais/secretaria/UG e identidade do motorista.
- Os quatro scripts atribuídos foram migrados individualmente: `fleet-poc-dataset.ts`, `seed-fleet-poc.ts`, `prepare-aurora-fleet-catalogs.ts`, `verify-aurora-fleet-journey.ts`. A carga mantém IDs/chaves determinísticos, replay, todas as operações e evidências GED. O callback GED insere o anexo na mesma transação documental.
- `mutateFleetInTransaction(tx, context, raw)` é a entrada explícita para composições. A preparação Aurora usa uma transação real para funcionário, rota, unidade, ficha, motorista, plano, replay e auditoria; foi removido o proxy que emulava transação. O ensaio Aurora usa a conexão real e confirma rollback de contagens/leitura.
- Preservados locks ordenados, transações serializáveis, snapshot repeatable-read do BI, increments/upserts atômicos, origem única de despesas e writer compartilhado de estoque na transação recebida.

### Escalares, relações e fidelidade física

- Conferida a seção **Escalares de SQL sem mapeamento de coluna** de `MIGRACAO_DRIZZLE_CONTRATOS.md`. `readFleetTfdBoarding` declara `confirmedAt` raw como `string | null` e decodifica com `databaseTimestamp`; não usa cast nem parsing local. `readFleetPaidAmount` recebe numeric string e constrói `Decimal` sem intermediário Number. A projeção JSON TFD contém somente status/booleano/relação opcional, sem Date/Decimal implícitos.
- As demais consultas `execute` retornam IDs, booleano, inteiro, texto de contagem ou locks; não há outros DTOs raw que declarem Date/Decimal. Colunas temporais/numéricas tipadas mantêm seus mappers Drizzle. O throttle envia timestamps UTC explícitos também nos parâmetros raw.
- Corrigido o join físico do laudo: `HealthTfdClinicalReport.requestId = HealthTfdRequest.id`. Preservada a remoção de passageiros com status `Confirmada` e o lock TFD.
- `readFleetUnits` hidrata separadamente asset/responsible antes de compor a relação; ausência do bem/responsável/controle/pai mantém `null`, e os campos Date/Decimal vêm das colunas tipadas.
- Schema Fleet: **37 tabelas, 422 escalares, 38 numerics exatos e 63 colunas temporais** conferidos por introspecção local de metadados e leitura do schema de origem: nomes, cobertura, nullability, precisão/escala e tipos DATE/TIMESTAMP sem divergências.
- Correção da conferência física central (`.agent/drizzle-current-schema-check.json`): `FleetCatalogEntry(versionId)`, `FleetComponentInstallation(componentId)`, `FleetFinePayment(fineId)` e `FleetUnitControl(unitId)` agora declaram explicitamente `onDelete: "no action", onUpdate: "no action"`. Defaults confirmados no SQL histórico `20261014010000_complete_fleet_checklist` e por `getTableConfig` local: **4/4 PASS**.

### Testes preparados e verificações executadas

- `tests/fleet-fixture.ts` usa `createLocalDrizzleDatabase` e o histórico instalado `migrations-ibema`; removida a geração de schema pelo CLI/cliente legado. Todas as mutações Fleet recebem a conexão da fixture, e os leitores usam o executor local.
- Migrados individualmente todos os cenários de `fleet-control-checklist.test.ts`, `frotas.integration.test.ts` e `frotas-opening.test.ts`, incluindo concorrência, rollback por trigger, manutenção compartilhada, estoque, CNH, agenda/guarita, contratos, oficina, multas, componentes, sinistro, relatórios e erros PostgreSQL de tabela/coluna ausente.
- `fleet-indicators.test.ts` passou de mock ORM para fatos reais no driver: escopo setorial, período, valor desconhecido e ausência de dupla soma do consumo projetado.
- Novo `fleet-scalars.test.ts`, com projeções DDL explícitas das colunas físicas, prepara regressões para timestamp UTC raw, laudo/companheiro/remoção e null TFD, numeric acima de `Number.MAX_SAFE_INTEGER`, e janela/reset do throttle. A integração também verifica hidratação nullable e Date de aquisição.
- **ESLint do escopo completo: PASS**, sem erros/avisos. **Parser TypeScript leve: 63 arquivos PASS**. **Comparação AST das raízes JSX: 12 TSX PASS**, sem diferença contra a base visual estática.
- Busca no runtime/repositórios/scripts/testes: nenhum import/acesso ORM legado, `$transaction`, `$queryRaw`, `$executeRaw` ou cast duplo de compatibilidade. Referências textuais ao diretório histórico de migrações permanecem como autoridade DDL das fixtures.
- Suites PGlite, tsc pesado e build **não executados nesta frente** durante a rodada paralela, conforme coordenação; execução e validação de tipos final ficam com a integração central, incluindo o handoff `operateAsset` acima. Nenhum DDL remoto, commit ou push executado.

### Retorno do monolítico — combustível e embarque TFD

- Reanalisados os dois diagnósticos de `.agent/drizzle-monolithic-typecheck-errors.json` (snapshot 17:20). Grep global localizou todos os consumidores de `confirmFleetFuel`: dispatcher privado `applyControl` em `control-service.ts` e callback de `submitFleetExternal` em `control-external.ts`. Ambos recebem a tx real de `withDatabaseTransaction`.
- `confirmFleetFuel` agora exige `DatabaseTransaction`, assim como `applyControl`; não foi ampliado o writer patrimonial nem adquirido outro executor. `applyStockMovement` conserva a mesma tx de consumo/despesa/leitura/evento/auditoria Fleet. A assinatura pública de `mutateFleetControl` permanece intacta.
- Grep dos consumidores de `readFleetTfdBoarding`: `control-motion.ts` e `tests/fleet-scalars.test.ts`. Catálogo independente e baseline confirmam `HealthTfdPassenger.patientId NOT NULL` e coluna física de papel `kind`. Corrigida a nulabilidade indevida do DTO raw; `identityKind` é projetado de `p.kind` via alias, mantendo também `kind` para a política Saúde salva neste checkout. Não há coluna física presumida `identityKind`.
- Mantidos pedido/laudo opcionais, vínculo paciente/acompanhante, filtro de remoções `Confirmada`, advisory lock e decode UTC de `confirmedAt`. A regressão de escalares agora verifica os dois nomes de papel e a identidade de vínculo retornada.
- Sem edição em Saúde/Assets/Financeiro; suíte real de Frotas aguarda execução central após o handoff Assets confirmado.
- Verificações leves após os ajustes: **ESLint PASS** para os quatro arquivos Fleet alterados; **parser PASS** (20 arquivos na rodada conjunta com TaxAccounting); **5/5 casos puros de embarque PASS** com processo limitado a 128 MB (paciente+acompanhante, acompanhante obrigatório ausente, acompanhante sem paciente, presença pendente e tratamento negado). Não foi executado tsc nem fixture PGlite.

### Retorno central — subqueries IN e precedência do escopo

- Fonte: `.agent/drizzle-sst-fleet-portal-failures.json`; rodada central de 167 testes, 133 PASS/34 FAIL. A central atribuiu 13 falhas Fleet e o teste pai ao SQL inválido `unitId in select ...` e à precedência do `admin OR department`. Este registro não afirma aprovação das suítes após o ajuste.
- `records.ts::fleetUnitScope` retornava `SQL` sem delimitadores, interpolado literalmente por `inArray`. Agora devolve `(select ... where (admin OR department))`, preservando assinatura e parâmetros. A subquery fecha antes dos filtros externos de ID/período/status. `fleetUnitAccess` já possuía ambos os agrupamentos e foi conferido.
- `service.ts` tinha uma segunda versão do mesmo SQL em `scopedUnits`; agora importa o helper corrigido. Conferidos individualmente emissão/início/conclusão de OS e edição/cumprimento de documento. Leituras e writers continuam usando a tx recebida; estoque, financeiro, replay e auditoria mantêm a mesma transação.
- `queries.ts` passa a construir `unitIds`, busca por código/nome/placa e seleção de veículos com builders tipados do executor local. Revisadas utilização, planos, OS, consumos/relatório de combustível, gastos/manutenções, documentos e ocorrências. Mantida a conjunção do escopo com todos os filtros e a disjunção agrupada entre busca da unidade e busca do fato.
- `control-queries.ts` usa subquery tipada para versões FIPE publicadas. Revisadas também referências de débitos, pagamentos e evidências; recebem o helper delimitado. `indicators.ts` e `report.ts` usam o mesmo helper para período/valor desconhecido e emissão de plano/OS. Os demais `control-*`, repositórios `sources`/`page-data`/`operators`/`filters` usam listas de valores, joins, `exists` delimitado ou predicados tipados; não foi encontrado outro `IN SELECT` raw.
- `planId undefined` no cenário concorrente é compatível com a interrupção do cenário anterior que preenche o ID do plano. A validação Zod e as assertions permanecem preservadas; a central deve confirmar a hipótese no reteste.
- Verificações locais leves, cada processo limitado a **128 MB**: **ESLint PASS**, **parser TypeScript PASS (5 arquivos; não é typecheck)** e **3/3 testes puros PASS** em `tests/fleet-sql.test.ts` (18 consultas compiladas em seis tabelas, admin/setor/sem setor, mais três predicados de acesso). Nenhuma fixture PGlite, tsc ou build foi executada.
- Reteste real solicitado à central, sequencial: `node --conditions=react-server --import tsx --test --test-concurrency=1 tests/fleet-control-checklist.test.ts tests/fleet-indicators.test.ts tests/frotas.integration.test.ts`. **Resultado pós-fix pendente da central**, incluindo DEP-03 e o cenário concorrente de geração da OS.
