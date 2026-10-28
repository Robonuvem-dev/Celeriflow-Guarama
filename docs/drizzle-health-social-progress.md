# Saúde, Assistência Social e Portal do Paciente — progresso Drizzle

## Estado em 2026-10-28

A migração direta atingiu **zero referências a Prisma nos 337 arquivos de produção inventariados** e **zero auxiliares residuais**. Estoque e actions retidas estão entregues para a validação central. A aprovação de tipos, SQL e regressões continua coordenada pelo parent; inventário vazio não substitui essa aprovação.

| Área | Arquivos de produção residuais |
| --- | ---: |
| `src/lib/saude/**` | 0 |
| `src/app/app-domain/saude/**` | 0 |
| `src/app/api/saude/**` | 0 |
| `src/app/app-domain/social/**` | 0 |
| Demais diretórios exclusivos Social/Portal | 0 referências diretas |
| **Total** | **0** |

Inventário inicial: 203 arquivos de produção com referências diretas. Build, typecheck, testes comportamentais e scripts com acesso ao banco não foram executados por esta frente; a validação pesada está coordenada pelo parent. Commits, publicação e snapshots compartilhados são controlados pelo parent.

### Recorte retido após as transferências

Esta conclusão cobre `health-stock-service.ts`, actions `.ts` Saúde e o auxiliar `scripts/verify-aurora-pharmacy-journey.ts`. As rotas Saúde ficaram com o parent. Todos os TSX Saúde, os scopes exclusivos de páginas/Farmácia/Vacinação/TFD/acompanhamento/diagnóstico/gestão e os quatro scripts de catálogo transferidos permanecem com seus owners. `tests/health-checklist-internal-flows.test.ts` e seus novos helpers são exclusivos de HealthManagement; esta frente não os editou após a transferência.

## Entrega implementada

- Social: schemas físicos de 23 tabelas, contratos independentes e repositories em `src/db/repositories/social/`. Leituras de todas as páginas, CadÚnico/RMA, políticas de sigilo/escopo, famílias canônicas, atendimentos, histórico individual, catálogos, profissionais, encaminhamentos, requisições, estoque próprio, cotas, comprovantes e notificações foram migrados.
- Entrega de benefício mantém locks da requisição e do benefício, avaliação obrigatória, cota vigente, baixa condicional do saldo, movimento único e atualização do item na mesma transação. Auditoria e notificações usam os repositories compartilhados com o mesmo `tx`.
- `social/beneficios/page.tsx` usa leituras Drizzle, inclusive secretarias/dotações/naturezas. A projeção de finanças em `src/db/schema/social-finance-options.ts` preserva datas e decimais, e não realiza mutações financeiras.
- Histórico de atendimentos de pessoa é filtrado em SQL por `personId` e política de acesso; não carrega o prontuário municipal para filtrar em memória.
- Portal: resolução da identidade a partir da sessão, consultas de agenda, vacinas, dispensações ativas, laudos liberados/publicados, encaminhamentos, documentos, campanhas, contatos e ouvidoria foram migrados para `src/db/repositories/health/patient-portal.ts`.
- Ouvidoria usa `nextYearlyCodeDrizzle({ db: tx, key: "OUV", prefix: "OUV", padding: 6, existingCodes })`; contador, manifestação, identidade opcional e auditoria compartilham transação. Registros anônimos não gravam `OmbudsmanIdentity`; listagem por pessoa continua limitada à identidade e exclui interações internas.
- Linha do tempo usa SQL parametrizado com os mesmos limites por origem e limite global. O vínculo do plano terapêutico foi conferido: a tabela da equipe é `HealthTeam`.
- Datas de consultas SQL brutas são hidratadas explicitamente em UTC por `src/db/repositories/health/timestamp.ts`: o driver Neon/Drizzle deixa `timestamp`/`date` como texto em `execute(sql)`. O generic da consulta não converte os valores em runtime.
- Ações programáticas (`care-program-service.ts`) migradas com upsert, validação de unidade/paciente, advisory lock por paciente/programa, verificação de sobreposição e encerramento com row lock.
- Consumidores de `executeConfiguredHealthHttp` em vacinação/farmácia passam `db` como primeiro argumento, conforme contrato compartilhado.
- `scripts/prepare-aurora-social-catalogs.ts` e `scripts/verify-health-s3.ts` migrados. Ambos continuam apenas preparados; não foram executados.
- Social financeiro: `createSocialBenefit` e `createSocialProgram` usam `createLegacyExpenseInTransaction(tx, input)` do parent na mesma transação dos vínculos, preservando a despesa legada `Empenhada`. Removidos `getTenantPrisma` e `ModuleOperation` das actions Social.
- Agenda/cadastro: profissionais, pacientes, endereços, equipes, unidades, administração, vínculos, horários, slots, agendas, acolhimento, espera, painéis e regulação usam Drizzle, com locks e snapshots preservados. Comprovante de agendamento e suas relações físicas foram convertidos.
- Assistência: `care-service`, `clinical-extension-service`, `prescription-service`, `clinical-document-service` e `care-lines-service` convertidos. Inclui condições/revisões, questionários, medicação contínua, administração e materiais com `applyStockMovement(tx, ...)`, exames, receitas, conclusão e GED transacional.
- Atenção primária/território: serviços convertidos para famílias canônicas, visitas, atenção domiciliar, atividade coletiva, alimentação e finalização de fichas e-SUS. Indicadores e séries anuais usam Drizzle; datas de vacinação/dispensação consultadas por SQL são hidratadas explicitamente.
- Produção: preços/vigências, captura de origens, fatos/revisões/críticas, competências, fechamento/reabertura, arquivos, prévias, custos e PDFs convertidos. Valores persistidos permanecem `Decimal` até a formatação, inclusive devoluções, reversões e rateio de diluente.
- AIH/APAC: laudos, numeração, decisões, renovação, cancelamento, pagamento manual e alta/óbito convertidos; telas de laudos, fatos, preços, produção e prévias acompanham os novos contratos.
- Consumidores clínicos: prontuário, complementos, linhas de cuidado, atendimento, indicadores e downloads de anexos usam consultas explícitas com os DTOs destinados às telas. Seleções não expõem colunas clínicas adicionais ao client.
- Rede e prestadores: contatos/expedientes, mantenedoras, convênios e coberturas convertidos; portal de guias/histórico mantém filtro pelo fornecedor. Documentos padrão usam o callback GED `afterCreate` com o mesmo `DatabaseTransaction` e mantêm `{ error }` nas actions chamadas pelo client.
- Catálogo físico independente do parent: corrigidas exatamente cinco nulabilidades em arrays — `HealthChronicAssessment.riskFactors/complications` e `HealthCollectiveActivity.themes/practices/participantIds` recebem `.notNull()`. Removidos os fallbacks `?? []` introduzidos nos consumidores desses campos. Entradas de domínio e contrato de acompanhamento já exigem arrays; DTOs raw com `LEFT JOIN` mantêm nulabilidade apenas das relações opcionais.
- Enum Social: `socialProcurementOriginPolicy = pgEnum("ProcurementOriginPolicy", ["NONE", "PROCUREMENT_SOURCE", "CONTRACT"])` preserva nome físico e labels ordenados. Parent confirmou que a divergência de identificador raw versus `format_type` quoted era falso positivo do verificador; nenhuma alteração adicional no enum ou DDL.
- Estoque: recebimento/aprovação, remessa/aceite, catálogo, acerto e baixa usam Drizzle com `DatabaseTransaction`; writers recebem conexão final opcional. `dispensePrescriptionItem` encaminha essa conexão ao serviço farmacêutico. Leituras de datas nullable usam colunas tipadas, e a política JSON de aprovação é validada por estrutura, sem casts. O agregado de doses abertas tem decoder `mapWith(Number)` explícito.
- Actions de importação SUS: `processHealthSusRecords`, issues, status/counters finais e `insertAuditEvent` compartilham o mesmo `tx` de `withDatabaseTransaction(connection, ..., { timeoutMs: 60_000 })`. Cabeçalho de processamento, replay concorrente e marcação de falha usam `connection.db` da mesma origem. Preservados `{ error }`, sucesso/duplicidade, UTF-8, limite de 700 KB e revalidação após commit.
- Actions consumidoras: `AppContext.database` opcional é resolvido explicitamente; unificação recebe a conexão de `healthDatabaseConnection(context)`, e as sete operações de Vigilância recebem contexto com essa conexão explícita. Integrações Farmácia/Vacinação recebem o executor usado na leitura do payload. Busca por nome nos vínculos de produto usa igualdade sem diferenciar maiúsculas, preservando `%`/`_` literais.
- Ensaio de Farmácia: `scripts/verify-aurora-pharmacy-journey.ts` foi portado para consultas Drizzle, conexão final explícita e `inDatabaseTransactionScope`, que usa savepoints nativos para os writers dentro da transação serializable de 120.000 ms. Preservados replay, recusa de estoque insuficiente, metadados e rollback deliberado da jornada. O script foi preparado e verificado estaticamente, sem execução contra banco.

## Contratos e handoffs intermodulares

1. **Financeiro Social resolvido:** helper do parent integrado no mesmo `tx`, sem alterar a criação legada de `Expense` nem o fluxo de retorno das actions.
2. **Estoque patrimonial — handoff pronto:** `postHealthStockReceipt(context, raw, connection?)`, `dispatchHealthStockTransfer(context, raw, connection?)` e `receiveHealthStockTransfer(context, transferId, connection?)` aceitam `HealthPharmacyContext` e `DatabaseConnection` final, com default compartilhado. Mantidos 5.000 ms dos wrappers interativos. `assertPharmacyRequestTransfer`, `lockPharmacyRequestItem`, `recordPharmacyRequestFulfillment`, `applyStockMovement`, eventos, vínculos e metadados vacinais recebem o mesmo `tx`; helpers não abrem outra conexão. Remessa: acesso → idempotência → pedidos-pai ordenados → validação de saldo em trânsito → lotes vacinais ordenados → inventário → movimentos/eventos. Aceite: row lock da transferência → acesso ao destino → pedido → movimento/cumprimento. Aprovação: row lock do recebimento. Locks patrimoniais/valorização pertencem a `applyStockMovement`. Os oito cenários Farmácia e nove Vacinação podem integrar esses contratos na janela central.
3. **GED/assinaturas:** consumidores usam `ingestGedDocument` com `afterCreate(tx: DatabaseTransaction, documentId)` e o contrato de assinatura transacional. Vinculação clínica, versão, assinatura, auditoria e publicação acompanham a transação de origem; upload judicial conserva `Document.personId` e vínculo judicial no callback GED.
4. **Portal / dependências transitivas:** serviços de agenda, vacinação/carteira e certidão foram convertidos pelas frentes responsáveis. `healthTimestamp` dos portais foi conservado conforme o handoff temporal do parent; não foi introduzido cast de dados SQL crus para `Date`.
5. **Agenda/assistência:** `runHealthTransaction` usa serializable, timeout total de 15.000 ms e até três tentativas de serialização/deadlock. `appointment-service.ts` reexporta a mesma função/classe de erro para preservar identidade. Grep global dos consumidores de `clinicalRecordForActor`, `registerProductionFactTx`, `captureCareIndicatorContext`, `recordPatientDeathInTransaction`, `createHealthAppointmentInTransaction`, `assertPatientRegistrationCurrent`, `assertProfessionalCanBook` e `treatmentReportForActor` encontrou Prisma residual apenas no teste integrado legado; isso não substitui a validação de tipos/SQL.
6. **Teste integrado histórico:** `tests/health-checklist-internal-flows.test.ts` foi transferido exclusivamente a HealthManagement, que integra a conexão/fixture Planning e os contratos recém-entregues. A aprovação de sua regressão permanece com esse owner e a fila central.

## Verificação realizada e testes preparados

Comando estático executado:

```text
node scripts/drizzle-health-social-check.mjs
```

Resultado final: **337 arquivos de produção, zero residuais diretos e zero auxiliares residuais; 442 arquivos analisados, zero erros de parsing**. A comparação ao `HEAD` atual conferiu 18 TSX alterados no trabalho compartilhado, com zero diferenças nos fragmentos JSX normalizando apenas CRLF/LF; esta conclusão não editou TSX. A evidência histórica anterior à transferência comparou 52 telas com o mesmo resultado. O erro transitório de parsing anteriormente observado em `tests/drizzle-health-pages-ast.test.ts:24` já não aparece na última execução. Essa verificação não faz typecheck nem valida SQL em runtime.

Verificação AST específica do estoque, auxiliar e actions retidas: **50 arquivos, 300 funções exportadas, 579 imports locais conferidos, zero erros de parsing e zero exports ausentes**. ESLint de estoque/actions com `--max-warnings=0` e do auxiliar portado: **zero erros e zero avisos**.

`git diff --check` também passou para os arquivos rastreados alterados no escopo Saúde/Social/Portal, seus dois testes Social e os dois scripts de banco migrados.

O script é somente leitura: não abre conexão e não gera DDL. O JSON inclui todos os caminhos e todas as linhas com identificadores/imports Prisma. A análise é de referências diretas por AST e não substitui o rastreamento de dependências transitivas.

Testes preparados para execução sequencial pelo parent:

```text
node --conditions=react-server --import tsx --test --test-concurrency=1 tests/social-access-policy.test.ts tests/social-benefit-delivery.test.ts tests/patient-portal-drizzle.test.ts tests/patient-timeline-drizzle.test.ts
```

- Social access: consulta real de sigilo, envolvimento profissional, OWN/UNIT/MUNICIPAL, unidade confidencial e ausência de vínculo; validações de vigência/expediente.
- Social delivery: rejeição sem autorização ou vínculo, rollback de cota/item quando falta estoque, limite de saldo em entregas concorrentes, rejeição de reentrega/cota esgotada e rollback de item/saldo/cota/movimento quando a etapa transacional posterior falha.
- Portal: titularidade direta e por servidor, inatividade, isolamento de laudos, publicação, datas UTC/milissegundos, vagas, rollback de manifestação/identidade/contador por falha de auditoria, bootstrap da sequência, anonimato e exclusão de interações internas com limite de movimentos por manifestação.
- Linha do tempo: origens clínicas distintas, isolamento por paciente, datas UTC, cancelamento de dispensação, links, equipe terapêutica, ordenação e limite global.

Os quatro testes usam `tests/helpers/local-drizzle-database.ts`: PGlite isolado com transporte WebSocket e o driver Neon/Drizzle de produção. Foram removidas as fixtures node-postgres dos dois testes Social, eliminando a necessidade de mascarar incompatibilidade de `NodePgTransaction` com `DatabaseTransaction`.

Parent informou aprovação de Portal/linha do tempo, TFD e gestão administrativa em múltiplos fusos, incluindo sigilo/CAPS; os resultados detalhados pertencem aos registros dessas frentes. Esta frente não executou testes comportamentais. Farmácia/Vacinação, checklist histórico, typecheck/build e demais regressões permanecem sob a coordenação sequencial central.

## Snapshot anterior do inventário — histórico

As listas abaixo preservam o snapshot de 90 arquivos de produção e 11 auxiliares anterior às entregas paralelas. **Não representam pendências atuais**: a última execução retornou `productionResidual: []` e `auxiliaryResidual: []`.

### `src/lib/saude/` — 34

```text
followup-exchange-service.ts
followup-receiver-service.ts
followup-source-service.ts
health-merge-service.ts
health-report-extra.ts
health-report-service.ts
health-stock-service.ts
laboratory-service.ts
pharmacy-catalog-service.ts
pharmacy-dispensation-service.ts
pharmacy-inventory-service.ts
pharmacy-invoice-service.ts
pharmacy-judicial-document.ts
pharmacy-judicial-service.ts
pharmacy-kit-service.ts
pharmacy-request-policy.ts
pharmacy-request-service.ts
raas-source-service.ts
sisab-service.ts
specialized-care-service.ts
sus-import-service.ts
tfd-clinical-service.ts
tfd-document-service.ts
tfd-report-service.ts
tfd-service.ts
tfd-transport-service.ts
tfd-trip-document.ts
vaccination-active-search.ts
vaccination-document-service.ts
vaccination-form-options.ts
vaccination-registry-service.ts
vaccination-service.ts
vaccination-stock-service.ts
vigilance-service.ts
```

### `src/app/app-domain/saude/` — 45

```text
acompanhamento/page.tsx
acompanhamento/receptores/[id]/page.tsx
acompanhamento/remessas/[id]/page.tsx
administracao/importacoes/actions.ts
administracao/importacoes/page.tsx
administracao/laboratorio/actions.ts
administracao/laboratorio/page.tsx
administracao/page.tsx
administracao/unificacoes/actions.ts
administracao/unificacoes/page.tsx
centro-especializado/page.tsx
farmacia/actions.ts
farmacia/catalogo/page.tsx
farmacia/chamadas/page.tsx
farmacia/dispensacoes/actions.ts
farmacia/dispensacoes/page.tsx
farmacia/inventario/page.tsx
farmacia/judicial/actions.ts
farmacia/judicial/page.tsx
farmacia/kits/page.tsx
farmacia/notas/page.tsx
farmacia/page.tsx
farmacia/requisicoes/actions.ts
farmacia/requisicoes/page.tsx
gerencial/page.tsx
integracoes/page.tsx
laboratorio/actions.ts
laboratorio/page.tsx
producao/raas/page.tsx
relatorios/page.tsx
sisab/page.tsx
tfd/laudos/[id]/page.tsx
tfd/laudos/actions.ts
tfd/laudos/page.tsx
tfd/page.tsx
tfd/viagens/[id]/page.tsx
tfd/viagens/actions.ts
tfd/viagens/page.tsx
vacinacao/actions.ts
vacinacao/carteira/[id]/page.tsx
vacinacao/esavi/page.tsx
vacinacao/gestao/actions.ts
vacinacao/gestao/page.tsx
vacinacao/page.tsx
vigilancia/page.tsx
```

### `src/app/api/saude/` — 11

```text
acompanhamento/receptores/[contract]/route.ts
acompanhamento/remessas/[id]/retorno/route.ts
acompanhamento/remessas/[id]/route.ts
farmacia/judicial/[id]/anexo/[documentId]/route.ts
farmacia/judicial/[id]/extrato/route.ts
producao/raas-origens/route.ts
sisab/lotes/[id]/route.ts
tfd/[id]/documento/route.ts
tfd/relatorio/route.ts
tfd/viagens/[id]/documento/route.ts
vacinacao/carteira/[id]/documento/route.ts
```

### Scripts/testes auxiliares do snapshot anterior

```text
scripts/import-health-care-catalogs.ts
scripts/load-sigtap-base.ts
scripts/prepare-aurora-health-identifiers.ts
scripts/verify-aurora-pharmacy-journey.ts
scripts/verify-b1.ts
scripts/verify-s4-ab.ts
scripts/verify-s4-cd.ts
scripts/verify-s4-close.ts
scripts/verify-s4-final.ts
scripts/verify-s5.ts
tests/health-checklist-internal-flows.test.ts
```

`verify-b1.ts` tem escopo misto e sua integração pertence ao parent. A fixture compartilhada do checklist histórico está fora da responsabilidade exclusiva desta frente.
