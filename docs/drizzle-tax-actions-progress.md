# TaxActions — actions, data e endpoints Drizzle

## Estado em 28/10/2026

Recorte direto migrado: **89 arquivos `.ts`, 315 exports** em `src/app/app-domain/tributacao/**`, `src/app/api/tributacao/**` e `src/app/api/publico/alvaras/**`. Buscas atuais: **zero imports/tipos Prisma, delegates, `$transaction`, `$queryRaw`, `$executeRaw`, casts `as unknown/as any` ou supressões TypeScript** nesses arquivos e em `src/db/repositories/tax-actions/**`. A implementação usa SQL/Drizzle real; não há adaptador de delegates.

**Reconferência após entregas ConfiguredCadastres, S4 e S5/S6/S8/S10:** 33 chamadas em sete arquivos foram alinhadas aos novos donos de transação. Todos os 89 arquivos / 315 exports foram reinspecionados individualmente por AST, com resolução das assinaturas importadas e conferência dos argumentos de persistência. Leituras manuais dos sete arquivos alterados e dos participantes/contextos confirmam a origem e os contratos de erro. A matriz nominal fechada está abaixo.

**Integração ainda pendente do owner Index/Scope:** na última leitura, 12 chamadas a 11 funções de `index.ts` ainda encontram assinatura Prisma fora deste ownership; as actions já encaminham a conexão final exigida. As demais fronteiras publicadas conferidas não apresentam desencontro Connection/Executor/Transaction. Aprovação TypeScript/runtime/build e zero ativo transitivo continuam dependendo do gate central. A baseline Neon concluída e aprovada pelo parent não foi modificada.

Persistência própria: oito módulos em `src/db/repositories/tax-actions/` e nove projeções/75 colunas em `src/db/schema/tax-actions.ts`. Projeções já confrontadas com `.agent/drizzle/database-before-2026-10-28T01-26-00.861Z/catalog.json`, sem divergências de nome/tipo/nullability. Não há geração/aplicação de DDL.

## Reconferência nominal — Collection e S4 integrados

Fontes finais: `docs/drizzle-tax-collection-operations-progress.md` (49 exports) e `docs/drizzle-tax-inspection-operations-progress.md` (14 exports), confrontadas com as implementações atuais. Cada arquivo alterado foi lido e editado nominalmente; nenhum script de substituição em massa foi usado.

### Chamadas corrigidas nesta rodada: 33 em sete arquivos

Prefixos A/B conforme inventário abaixo. Todos os nomes na segunda coluna são exports do arquivo indicado; a seta identifica o serviço chamado.

| Consumidor de produção | Wrappers/chamadas fechados | Origem final | Ajustes |
| --- | --- | --- | ---: |
| A `simples-nacional/actions.ts` | `processSimplesAction` → `processSimplesDivergences`; `communicateDivergenceAction` → `communicateSimplesDivergence`; `communicateExclusionAction` → `communicateSimplesExclusion` | `context.connection` de `taxActionContext` | 3 |
| A `iss-bancario/actions.ts` | `createInstitutionAction` → `createDesifInstitution`; `createAgencyAction` → `createDesifAgency`; `validateImportAction` → `validateDesifImport`; `receiveImportAction` → `receiveDesifImport`; `communicateFiscalCaseAction` → `communicateDesifFiscalCase` | `context.connection` de `taxActionContext` | 5 |
| B `desif/importacoes/route.ts` | `POST` → `receiveDesifImport` | `databaseConnection` de `@/db/client` | 1 |
| A `cobranca/actions.ts` | `createPortfolioAction` → `createCollectionPortfolio`; `scheduleCollectionActionAction` → `scheduleCollectionAction`; `completeCollectionActionAction` → `completeCollectionAction`; `grantPortalAccessAction` → `grantPortalAccess`; `createBenefitRuleAction` → `createBenefitRule`; `createPrizeDrawAction` → `createPrizeDraw`; `issuePrizeCouponAction` → `issuePrizeCoupon` | `c.connection` de `taxActionContext` | 7 |
| A `vaf/actions.ts` | `upsertAccountantAction` → `upsertAccountant`; `upsertCompanyAction` → `upsertCompany`; `linkAccountantAction` → `linkCompanyAccountant`; `upsertRuleAction` → `upsertRule`; `importMovementsAction` → `importMovements`; `processCompetencyAction` → `processCompetency`; `importRepasseAction` → `importRepasse`; `importIndicesAction` → `importIndices`; `notifyCorrectionAction` → `notifyCorrection`; `markNotificationReadAction` → `markNotificationRead`; `resolveCrossCheckAction` → `resolveCrossCheck`; `createEstimateAction` → `createEstimate` | `c.connection` de `taxActionContext` | 12 |
| A `nfse/actions.ts` | `requestCredentialAction` → `requestNfseCredential`; `decideCredentialAction` → `decideNfseCredential`; `correctionLetterAction` → `createCorrectionLetter`; `receiveRpsAction` → `receiveRpsBatch` | `ctx.connection` de `taxActionContext` | 4 |
| B `nfse/rps/route.ts` | `POST` → `receiveRpsBatch` | `databaseConnection` de `@/db/client` | 1 |

Somente o argumento de persistência e os dois imports de conexão das APIs foram alterados. `done()`/`result()`, `{ error }`, `invoiceId`, contadores de processamento, `summary`, datas, autores, revalidações e operações `create`/`update` mantêm o contrato existente. Os quatro clients Collection continuam aguardando `{ error?: string }`; VAF conserva `{ error?: string; summary?: string }`. APIs DES-IF/RPS conservam Bearer, configuração ausente/503, acesso negado/401, sucesso/202 e erro de payload/400; assinatura/origem e corpo de resposta permanecem nos mesmos pontos.

### Consumidores de produção já alinhados e reconferidos

- S5: `importSimplesAction` → `importSimplesBatch`, `rectifyDivergenceAction` → `rectifySimplesDivergence`, `prepareExclusionAction` → `prepareSimplesExclusion`: `context.connection`.
- S6: `processImportAction` → `processDesifImport`, `issueGuideAction` → `issueDesifGuide`, `openFiscalCaseAction` → `openDesifFiscalCase`: `context.connection`. `iss-bancario/importacoes/[id]/recibo/route.ts` conserva `assertDesifReceipt` puro, com consulta por executor.
- S8: `executePrizeDrawAction` → `executePrizeDraw`: `c.connection`; `operacoes/actions.ts:grantAssessmentBenefitAction` → `grantBenefit`: `taxActionConnection(context)`, associado ao mesmo contexto da leitura do lançamento.
- S10: todas as 12 chamadas públicas existentes no recorte passam conexão. `vaf/page.tsx:listVafOverview` e `cobranca/page.tsx:collectionDashboard` permanecem consumidores somente leitores por executor, reconferidos por busca; não são arquivos alterados nesta frente.
- S4: `emitNfseAction`, `substituteNfseAction`, `cancelNfseAction`, `updateRpsAction`, `createDmsAction`, `createOccasionalAction`, `approveOccasionalAction`, `releaseOccasionalAction` já passam `ctx.connection`. `createCreditAction` conserva **`ctx.database`**, pois `createDeductionCredit` recebe `DatabaseExecutor`. B `nfse/dms/route.ts` já usa `databaseConnection`.
- ConfiguredCadastres: `configuracoes-cadastrais/actions.ts:{publishFiscalCatalogAction,saveConfiguredFiscalRecordAction}` já passa `connection`. Seus participantes transacionais e a suíte configured de 11 subcenários estão no handoff próprio; parent assumiu a validação SQL/runtime.

Total confirmado no recorte: **36 chamadas de writers Collection em seis arquivos** (35 funções distintas; recepção DES-IF em action e API) e **15 chamadas S4 em três arquivos** (14 Connection / 1 Executor). A rota de recibo é consumidor adicional do guard puro. A lista é nominal; não se presume um total de 45 consumidores.

### Transações e dependências em andamento

- Os novos wrappers recebem conexão da origem autenticada; `taxActionContext` continua resolvendo o mesmo pool e impondo a operação de módulo. Não há cast de executor para conexão.
- Participantes inline de TaxActions continuam recebendo `tx`: histórico imobiliário/econômico, política de débitos, registro/auditoria, REDESIM, certidão e lotes. Nenhuma chamada corrigida foi inserida dentro de um callback transacional existente.
- `readMunicipalServiceRelationships` recebe o `ReadExecutor` Drizzle. S4 já lhe passa o `DatabaseTransaction` de emissão. Na última leitura, `index.ts:recordIssDeclaration` ainda passa o `tx` de seu `$transaction` legado; a conversão desse produtor permanece com o owner Index/Scope. Não foi acrescentada conexão secundária ou adaptação nesse ponto.
- As 12 chamadas pendentes do core são duas em `guias/actions.ts` (`confirmTaxPayment`, `cancelTaxGuide`) e dez em `operacoes/actions.ts` (`configureTaxParameter` em dois pontos, `createTaxServiceRequest`, `configureTaxServiceActivity`, `recordIssDeclaration`, `createTaxAssessment`, `generateTaxGuide`, `enrollAssessmentInActiveDebt`, `evaluateTaxCertificateSituation`, `configureTaxFinancialMapping`). Todas já encaminham conexão, aguardando os contratos finais do owner original.

O inventário integral de 89 arquivos abaixo permanece válido e foi usado como checklist por arquivo. A conferência AST ampliada inclui chamadas dos repositórios próprios e `withDatabaseTransaction`: **364 chamadas com contratos Drizzle publicados — 228 Connection / 112 Executor / 24 Transaction — sem argumentos incompatíveis nessa fronteira**, além das 12 chamadas ao core ainda legado. Executor aceita o `tx` recebido; essas chamadas não são convertidas em conexão. Esta é evidência estática de assinaturas/argumentos, não aprovação por typecheck/runtime.

Validação leve desta reconferência: ESLint dos **89 `.ts`**, limitado a 256 MB, **exit code 0 / sem avisos**; parse dos **100 arquivos** do recorte e suporte, limitado a 128 MB, **zero diagnósticos**, **315 exports de aplicação / 375 totais documentados**, zero símbolos omitidos e zero legado/casts de compatibilidade/supressões encontrados. Nenhuma suíte com banco, typecheck ou build foi executada nesta rodada; essas execuções seguem com o parent.

## Contratos e fluxos preservados

- `taxActionConnection(context)` recupera **o mesmo pool Neon** de `context.database`; contexto omitido/default usa `databaseConnection`. Um banco customizado incompatível com abertura de transação é rejeitado. `taxActionContext(operation)` faz autorização TRIBUTACAO/operação e retorna `{ user, connection, database: connection.db }`.
- Função que abre transação recebe `DatabaseConnection`; consulta/escrita simples recebe `DatabaseExecutor`; variante `InTransaction` recebe **o `tx` da operação**, incluindo auditoria, histórico, GED, snapshots e cálculo participante. Não há segunda conexão dentro de uma transação inline.
- Foram conferidas chamadas dos helpers externos contra suas assinaturas públicas e seu uso de transação. As seis chamadas S9 `createCemetery`, `createSector`, `registerEmployee`, `registerFuneralHome`, `grantConcession` e `createDaPortfolio` foram ajustadas para conexão após a migração do owner.
- Na reconferência após atualização de S3, `createDteMailbox`, `confirmDteMailbox`, `createDteAccessGrant` e `revokeDteAccessGrant` também passaram a receber conexão; `validateDteAccessGrant` permanece leitura por executor. Tokens, códigos, datas e `{ error }` das actions foram preservados.
- A atualização dos contratos S2 exigiu conexão em `createPixCharge`, `configureCollectionAgreement` e `createReconciliation`; suas três actions foram alinhadas, mantendo retorno e revalidações.
- `cadastros-fiscais/actions.ts`: mantém validação de categorias reservadas, datas civis, processos/documentos canônicos, origem UG/ente, permissões e versão. Alteração cadastral e auditoria usam o mesmo `tx`; histórico imobiliário e política de débitos econômica participam dele. Timeout inline: **5000 ms**.
- REDESIM: hash normalizado, advisory lock por contribuinte, replay persistido e autorizado pela origem, inscrição inequívoca, eventos fora de ordem, perfil/dívida, snapshots, registros auxiliares e auditoria permanecem na **mesma transação serializable / 60000 ms**. Chamadas econômicas usam suas variantes `InTransaction(tx, ...)`.
- Atualização em lote: prévia/count esperado/limite de 1000 mantidos; atualização dos contribuintes, registros de situação e última auditoria atômicos. Consulta de fonte sem integração oficial conserva `AGUARDA_CONFIGURACAO`, `L0` e `officialConfirmation: false`.
- Base territorial e recadastramento: versões, recortes, datas, campos permitidos, pedidos pendentes e auditoria mantidos em transações de 5000 ms. Mutação imobiliária mantém `FOR UPDATE`, origem, processo e `set_config` transacionais antes do writer histórico.
- Certidão: avaliação, emissão de rascunho e auditoria no mesmo `tx`, **serializable / 5000 ms**; validade civil mantém `23:59:59.999Z`, rascunho interno não vira certidão oficial. Avaliador externo ainda depende do ownerTax.
- Documentos/relatórios: filtros, ordenação, joins PF/PJ nullable, contagens, formatos PDF/HTML/XML/CSV, headers, códigos HTTP e autorização continuam nos respectivos endpoints. Os três endpoints NFS-e usam agora **`context.database ?? db`** para nota, histórico e instituição, conservando a origem da leitura.
- Cron econômico/ITBI/anual usa conexão única do worker, ator canônico e UGs explícitas. APIs RPS/DMS/DESIF conservam Bearer/configuração/status próprios; endpoints públicos de alvará mantêm `renderConfiguredLicensePdf(executor, ...)` e `readSignedLicenseArtifact(connection, ...)`.
- Decimal: projeções monetárias usam `exactNumeric`/`Decimal` independente; relatórios DESIF decodificam numeric textual explicitamente. `execute<T>` **não converte datas em runtime**: leitores brutos DESIF usam DTO wire e `databaseTimestamp`. Selects tipados recebem o decoder Drizzle. Datas com milissegundos e relações null são preservadas.
- JSON: `data`, `payload` e `result` explicitamente `null` nos writers próprios viram **JSON `null` via `JsonNull`**; campo ausente continua omitido/default/SQL NULL. Não há serialização substituindo indistintamente SQL NULL e JSON null.
- Exports públicos mantêm os argumentos funcionais. A migração de `getFiscalRegistryWorkspaceData` troca o primeiro argumento de persistência para `DatabaseExecutor`; seus três consumidores estão listados abaixo. `processCompetencyAction` declara `{ error?: string; summary?: string }`, removendo o cast fictício de `undefined` para `string`; seu consumidor real usa esse mesmo contrato opcional.

### Retorno de actions e consumidores

Actions usadas via `await` que já expunham `ActionResult` continuam retornando `{ error }`/dados dentro do tratamento existente. Não foram trocadas por `throw`. Actions legadas que seus clientes tratam com `try/catch` conservam esse contrato: por exemplo `divida/actions.ts`, criação imobiliária, mutações de alvará e revogação de certidão. Os clients usam `onSubmit`, eventos ou callbacks de `<form action={...}>` que chamam e tratam o resultado da action server (por exemplo DTE); esse callback client não equivale a ligar diretamente o export server ao formulário. Nenhum contrato foi convertido só por a UI conter um formulário. Revalidações continuam após sucesso.

O inventário abaixo foi obtido por AST de todos os imports/reexports em `src/**` e `tests/**`, incluindo aliases e tipos, e conferido com buscas de consumidores antes dos ajustes. **Sem import direto** significa export preservado mas atualmente sem chamador estático, não remoção. Endpoints e seus exports de configuração são consumidos pelo roteamento Next.js.

## Inventário integral dos exports e consumidores

Prefixos: **A** = `src/app/app-domain/tributacao/`; **B** = `src/app/api/tributacao/`; **C** = `src/app/api/publico/alvaras/`. Consumers sem prefixo são relativos ao diretório do arquivo exportador. Em uma célula com grupos, `exports → consumer` explicita cada associação. Configurações `runtime`, `dynamic`, `maxDuration` são exports Next.js, não actions.

### A — actions e data (todos os exports)

| Arquivo relativo a A | Exports → consumidores |
| --- | --- |
| `alvaras/actions.ts` | `createLicense`, `updateLicense`, `deactivateLicense`, `activateLicense` → `AlvarasClient.tsx` |
| `alvaras/configurados/actions.ts` | `signConfiguredLicenseAction` → `LicenseSignaturesClient.tsx`; `publishLicensePolicyAction` → `ConfiguredLicensesClient.tsx`, `LicensePortalPolicyClient.tsx`; `issueConfiguredLicensesAction` → `ConfiguredLicensesClient.tsx`; `transitionConfiguredLicenseAction` → `LicenseConsultationClient.tsx` |
| `avaliacoes/actions.ts` | `publishValuationRuleAction`, `saveValuationAction` → `ValuationClient.tsx` |
| `avaliacoes/simulacao/actions.ts` | `assessPropertySimulationAction` → `ConfirmPropertySimulationClient.tsx` |
| `base-territorial/actions.ts` | `saveTerritorialRecord` → `TerritorialBaseClient.tsx` |
| `bi-tributario/actions.ts` | `loadBiAction` → `BiTributarioClient.tsx` |
| `cadastros-fiscais/actions.ts` | tipo `FiscalEntityType`, `saveTaxRegistryEntry`, `reviewTaxRegistryEntry` → `FiscalRecordWorkspace.tsx`; `registerRedesimEvent` → `../economico/[id]/perfil/EconomicProfileClient.tsx`, `../redesim/RedesimClient.tsx`; `requestRegistrySourceLookup` → `../fontes-cadastrais/RegistrySourcesClient.tsx`; `bulkUpdateTaxpayersByFilter` → `../pessoas/BulkTaxpayerUpdate.tsx` |
| `cadastros-fiscais/data.ts` | `getFiscalRegistryWorkspaceData` → `../economico/[id]/page.tsx`, `../imoveis/[id]/page.tsx`, `../pessoas/[id]/page.tsx` |
| `calendarios/actions.ts` | `issueScheduledGuidesAction` → `ScheduledGuidesClient.tsx` |
| `cemiterios/actions.ts` | `createCemeteryAction`, `createSectorAction`, `createGraveAction`, `registerEmployeeAction`, `registerFuneralHomeAction`, `registerDeceasedAction`, `registerMovementAction`, `grantConcessionAction`, `issueCemeteryFeeAction`, `enrollCemeteryFeeInDebtAction` → sem import direto |
| `certidoes/actions.ts` | `createCertificate`, `cancelCertificate` → `CertidoesClient.tsx` |
| `cobranca/actions.ts` | `createPortfolioAction`, `scheduleCollectionActionAction`, `completeCollectionActionAction`, `grantPortalAccessAction`, `createBenefitRuleAction`, `createPrizeDrawAction`, `issuePrizeCouponAction`, `executePrizeDrawAction` → `CobrancaClient.tsx` |
| `configuracoes-cadastrais/actions.ts` | `publishFiscalCatalogAction`, `saveConfiguredFiscalRecordAction` → `ConfigurableCadastresClient.tsx` |
| `configuracoes-cadastrais/pgv-lote/actions.ts` | `bulkChangePgvAction` → `PgvBulkClient.tsx` |
| `divida-ativa/actions.ts` | `enrollAssessmentAction`, `enrollManualAction`, `validateDebtAction`, `issueCdaAction`, `annotateCdaAction`, `versionCdaAction`, `signCdaAction`, `createDaPortfolioAction`, `refreshDaPortfolioAction`, `issueDaGuideAction`, `suspendDebtAction`, `resumeDebtAction`, `returnDebtToOriginAction`, `settleDebtByGuideAction`, `writeOffDebtAction`, `runPrescriptionAction`, `createProtestBatchAction`, `registerProtestReturnAction`, `resolveProtestItemAction`, `createExecutionBatchAction`, `openExecutionCaseAction`, `advanceExecutionCaseAction`, `registerMniAction`, `scheduleHearingAction` → `DividaAtivaClient.tsx` |
| `divida/actions.ts` | `createActiveDebt`, `updateActiveDebt`, `cancelActiveDebt`, `reactivateActiveDebt` → `DividaClient.tsx` |
| `domicilio-tributario/actions.ts` | `createMailboxAction`, `confirmMailboxAction`, `createAccessGrantAction`, `validateAccessGrantAction`, `revokeAccessGrantAction`, `sendDteAction`, `readDteAction`, `acknowledgeDteAction`, `tacitDteAction`, `deleteDteAction`, `createPowerAction`, `transitionPowerAction` → `DteClient.tsx` |
| `economico/[id]/perfil/actions.ts` | `saveEconomicProfileAction`, `createEconomicRegistrationWithProfileAction` → `EconomicProfileClient.tsx` |
| `economico/actions.ts` | `createEconomicRegistration`, `updateEconomicRegistration`, `deactivateEconomicRegistration`, `activateEconomicRegistration` → `EconomicoClient.tsx` |
| `economico/alteracao-geral/actions.ts` | `bulkChangeEconomicProfilesAction` → `EconomicBulkChangeClient.tsx`, `EconomicBulkExtendedClient.tsx` |
| `economico/atividades/actions.ts` | `publishEconomicActivityAction` → `EconomicActivitiesClient.tsx`; `unifyEconomicActivitiesAction` → `EconomicActivityUnificationClient.tsx` |
| `economico/contadores/actions.ts` | `publishAccountantAction` → `AccountantsClient.tsx` |
| `economico/eventos-veiculos/actions.ts` | `publishEventTypeAction`, `saveEventAction`, `issueEventLicenseAction`, `saveVehicleAction` → `EconomicEventsVehiclesClient.tsx` |
| `fiscalizacao/actions.ts` | `createInfraction`, `updateInfraction`, `updateInfractionStatus` → sem import direto |
| `fiscalizacao/fiscalizacao-actions.ts` | `runTaxAuditAction`, `issueInfractionNoticeAction`, `getTaxAuditRecordsAction` → sem import direto |
| `fiscalizacao/s7-actions.ts` | `createFiscalPlanAction`, `generatePlanOrdersAction`, `createStandaloneOrderAction`, `markOrderReadAction`, `issueTiafAction`, `acknowledgeTiafAction`, `cancelTiafAction`, `receiveDocumentAction`, `returnDocumentAction`, `createAssessmentMapAction`, `finalizeMapAction`, `issueSeizureAction`, `closeOrderAction`, `communicateDocumentAction`, `runMeshesAction`, `createOrderFromMeshAction`, `confirmProductivityAction`, `saveTemplateAction`, `savePenaltyRuleAction` → `FiscalizacaoClient.tsx` |
| `guias/actions.ts` | `payGuide`, `cancelGuide` → `GuiasClient.tsx`; `reverseGuidePayment` → `PaymentReversalForm.tsx` |
| `imoveis/[id]/bloqueio/actions.ts` | `publishPropertyEditRestrictionAction`, `approvePropertyEditAction` → `PropertyEditControls.tsx` |
| `imoveis/[id]/perfil/actions.ts` | `savePropertyProfileAction`, `createPropertyWithProfileAction` → `PropertyProfileClient.tsx` |
| `imoveis/actions.ts` | `createRealEstate`, `updateRealEstate`, `deactivateRealEstate`, `activateRealEstate` → `ImoveisClient.tsx` |
| `imoveis/alteracao-geral/actions.ts` | `previewPropertyBulkAction` → `PropertyBulkClient.tsx`; `changePropertiesBulkAction` → `PropertyBulkClient.tsx`, `PropertyBulkProfileInput.tsx` |
| `imoveis/configuracao/actions.ts` | `publishPropertyRegistrationPolicyAction` → `PropertyRegistrationPolicyClient.tsx` |
| `imoveis/operacoes/actions.ts` | `bulkChangePropertiesAction`, `copyPropertiesAction`, `reorganizePropertiesAction` → `PropertyOperationsClient.tsx` |
| `imoveis/property-actions.ts` | `calculatePropertyPreviewAction`, `calculateTerritorialFractionAction`, `createCondominiumSubunit`, `copyPropertyCharacteristics` → `[id]/PropertyCadastralTools.tsx` |
| `iss-bancario/actions.ts` | `createInstitutionAction`, `createAgencyAction`, `validateImportAction`, `processImportAction`, `receiveImportAction`, `issueGuideAction`, `openFiscalCaseAction`, `communicateFiscalCaseAction` → `IssBancarioClient.tsx` |
| `itbi/actions.ts` | `saveItbiTypeAction` → `ItbiParameters.tsx`; `transferItbiManuallyAction`, `createItbiAction`, `transmitItbiAction`, `analyzeItbiAction`, `issueItbiDamAction`, `generateItbiDocumentAction` → `ItbiClient.tsx` |
| `itbi/bloqueios/actions.ts` | `publishItbiEntryPolicyAction` → `ItbiEntryPolicyClient.tsx` |
| `itbi/cancelamento-automatico/actions.ts` | `publishItbiExpiryPolicyAction`, `executeItbiExpiryAction` → `ItbiExpiryClient.tsx` |
| `itbi/collection-actions.ts` | `createItbiPropertyCollectionAction` → `ItbiCollectionClient.tsx` |
| `itbi/comunicacao/actions.ts` | `rectifyTransferredItbiAction` → `ItbiRectificationClient.tsx`; `decideItbiFiscalTreatmentAction` → `ItbiFiscalTreatmentClient.tsx`; `configureItbiCorrespondenceAction` → `ItbiCorrespondenceClient.tsx`; `grantItbiAccessAction`, `sendInternalItbiMessageAction` → `ItbiChannelClient.tsx` |
| `itbi/modelos/actions.ts` | `publishItbiDocumentModelAction` → `ItbiDocumentModelsClient.tsx`; `issueConfiguredItbiDocumentAction` → `../comunicacao/ItbiConfiguredDocumentsClient.tsx` |
| `itbi/online/actions.ts` | `publishOnlineItbiPolicyAction`, `configureItbiNotaryAction` → `OnlineItbiConfigurationClient.tsx` |
| `itbi/processos/actions.ts` | `requestItbiContestationAction`, `decideItbiContestationAction` → `ItbiContestationClient.tsx` |
| `lotes-anuais/actions.ts` | `taxAnnualBatchAction` → `AnnualBatchesClient.tsx` |
| `nfse/actions.ts` | `requestCredentialAction`, `decideCredentialAction`, `emitNfseAction`, `substituteNfseAction`, `cancelNfseAction`, `correctionLetterAction`, `receiveRpsAction`, `updateRpsAction`, `createDmsAction`, `createCreditAction`, `createOccasionalAction`, `approveOccasionalAction`, `releaseOccasionalAction` → `NfseClient.tsx` |
| `notificacoes/actions.ts` | `previewDebtNoticesAction`, `issueDebtNoticesAction`, `cancelDebtNoticeAction` → `DebtNoticesClient.tsx` |
| `operacoes/actions.ts` | `saveTaxDebtAccountingProfileAction`, `saveTaxAccountingProfileAction` → `../motor-fiscal/TaxAccountingProfileForm.tsx`; `grantAssessmentBenefitAction` → `../motor-fiscal/AssessmentBenefitForm.tsx`; `reverseCreditMovementAction` → `../motor-fiscal/CreditMovementReversalForm.tsx`; `saveTaxParameter`, `saveTaxServiceRequest`, `saveServiceActivity`, `saveIssDeclaration`, `createAssessmentGuideAction`, `enrollAssessment`, `evaluateCertificate` → `OperacoesTributariasClient.tsx`; `saveFiscalRuleAction`, `simulateFiscalAction`, `launchFiscalAction`, `reviseAssessmentAction`, `registerCreditEventAction`, `issuePartialDamAction`, `issueGroupedDamAction`, `createPixChargeAction`, `processBankReturnAction`, `saveCollectionAgreementAction`, `saveTaxFinancialMappingAction`, `decideRefundAction`, `createReconciliationAction`, `resolveReconciliationAction`, `closeReconciliationAction` → `../motor-fiscal/MotorFiscalClient.tsx`; `applyTaxCreditAction` → `../motor-fiscal/AuthorizedCompensationForm.tsx`, `../motor-fiscal/MotorFiscalClient.tsx`; `executeRefundAction` → `../motor-fiscal/RefundPaymentForm.tsx` |
| `recadastramento/actions.ts` | `createRecadastramentoCampaign`, `submitRecadastramentoRequest` → `RecadastramentoClient.tsx` |
| `resumo-anual/actions.ts` | `classifyBenefitReportAction` → `BenefitClassificationClient.tsx` |
| `simples-nacional/actions.ts` | `importSimplesAction`, `processSimplesAction`, `communicateDivergenceAction`, `rectifyDivergenceAction`, `prepareExclusionAction`, `communicateExclusionAction` → `SimplesNacionalClient.tsx` |
| `simples-nacional/arquivos/actions.ts` | `publishSimplesLayoutAction`, `importSimplesOptionFileAction`, `decideSimplesOptionAction` → `SimplesOptionFilesClient.tsx` |
| `vaf/actions.ts` | `upsertAccountantAction`, `upsertCompanyAction`, `upsertRuleAction`, `importMovementsAction`, `processCompetencyAction`, `importRepasseAction`, `notifyCorrectionAction`, `markNotificationReadAction`, `resolveCrossCheckAction`, `createEstimateAction` → `VafClient.tsx`; `linkAccountantAction`, `importIndicesAction` → sem import direto |

### A/B/C — todos os endpoints e configurações

Todos são consumidos pelo roteamento Next.js. Os caminhos A conservam o prefixo de aplicação usado na estrutura atual.

| Prefixo/arquivo | Exports |
| --- | --- |
| A `cobranca/parcelamentos/[id]/termo/route.ts` | `GET` |
| A `cobranca/relatorios/beneficios/route.ts` | `GET` |
| A `cobranca/relatorios/parcelamentos/route.ts` | `GET` |
| A `comparativo-anual/exportar/route.ts` | `GET` |
| A `divida-ativa/cda/[id]/pdf/route.ts` | `runtime`, `dynamic`, `GET` |
| A `economico/relatorio/route.ts` | `GET` |
| A `fiscalizacao/documentos/[id]/route.ts` | `GET` |
| A `fiscalizacao/produtividade/relatorio/route.ts` | `GET` |
| A `guias/[id]/route.ts` | `dynamic`, `GET` |
| A `iss-bancario/fiscalizacoes/[id]/mapa/route.ts` | `GET` |
| A `iss-bancario/fiscalizacoes/[id]/tiaf/route.ts` | `GET` |
| A `iss-bancario/guias/[id]/route.ts` | `GET` |
| A `iss-bancario/importacoes/[id]/recibo/route.ts` | `GET` |
| A `itbi/[id]/documento/route.ts` | `dynamic`, `GET` |
| A `nfse/[id]/documento/route.ts` | `dynamic`, `GET` |
| A `nfse/[id]/pdf/route.ts` | `runtime`, `dynamic`, `GET` |
| A `nfse/[id]/xml/route.ts` | `dynamic`, `GET` |
| A `pessoas/relatorio/route.ts` | `GET` |
| A `recadastramento/protocolo/[id]/route.ts` | `GET` |
| A `simples-nacional/exclusoes/[id]/arquivo/route.ts` | `dynamic`, `GET` |
| A `simples-nacional/exclusoes/[id]/documento/route.ts` | `dynamic`, `GET` |
| B `desif/importacoes/route.ts` | `runtime`, `dynamic`, `POST` |
| B `economico/expiracao/route.ts` | `runtime`, `dynamic`, `maxDuration`, `GET` |
| B `itbi/[id]/dam/route.ts` | `runtime`, `GET` |
| B `itbi/[id]/pdf/route.ts` | `runtime`, `GET` |
| B `itbi/anexos/route.ts` | `runtime`, `POST` |
| B `itbi/declaracoes/[id]/route.ts` | `runtime`, `GET` |
| B `itbi/documentos/[id]/route.ts` | `runtime`, `GET` |
| B `itbi/expiracao/route.ts` | `runtime`, `dynamic`, `maxDuration`, `GET` |
| B `lotes-anuais/processamento/route.ts` | `runtime`, `dynamic`, `maxDuration`, `GET` |
| B `nfse/dms/route.ts` | `runtime`, `dynamic`, `POST` |
| B `nfse/rps/route.ts` | `runtime`, `dynamic`, `POST` |
| B `notificacoes/route.ts` | `runtime`, `GET` |
| B `simples/arquivos/[id]/route.ts` | `runtime`, `GET` |
| B `simples/termos/[id]/route.ts` | `runtime`, `GET` |
| C `[code]/assinatura/route.ts` | `runtime`, `GET` |
| C `[code]/pdf/route.ts` | `runtime`, `GET` |

## Repositórios próprios — exports e consumidores

Os caminhos de consumidor abaixo são relativos a A, salvo indicação. `tests/drizzle-tax-actions.test.ts` cobre as fronteiras selecionadas sem substituir o gate integrado.

| Módulo | Exports → consumidores de produção |
| --- | --- |
| `context.ts` | `taxActionConnection` → 32 consumidores autenticados listados a seguir; `taxActionContext` → 44 wrappers/rotas autenticados listados a seguir |
| `registry.ts` | `latestActionRegistryEntry` → `alvaras/actions.ts`, `base-territorial/actions.ts`, `cadastros-fiscais/actions.ts`, `recadastramento/actions.ts`, B `simples/termos/[id]/route.ts`; `actionRegistryEntry` → `cadastros-fiscais/actions.ts`, `recadastramento/protocolo/[id]/route.ts`, B `simples/termos/[id]/route.ts`; `firstActionRegistryEntry` → B `simples/arquivos/[id]/route.ts`, B `simples/termos/[id]/route.ts`; `actionActiveRegistryEntry` → `recadastramento/actions.ts`; `actionRegistryDefinitions` → `alvaras/actions.ts`, B `itbi/expiracao/route.ts`; `insertActionRegistryEntries` → `cadastros-fiscais/actions.ts`, `base-territorial/actions.ts`, `recadastramento/actions.ts`, `imoveis/property-actions.ts`; `reviewActionRegistryEntry` → `cadastros-fiscais/actions.ts`; `insertActionAudit` → os quatro writers anteriores e `certidoes/actions.ts`; `actionFiscalEntityExists`, `actionProcessExists`, `actionDocumentExists` → `cadastros-fiscais/actions.ts`; `actionOriginExists` → `cadastros-fiscais/actions.ts`, B `simples/arquivos/[id]/route.ts`; `actionWorkerUnits` → B `economico/expiracao/route.ts`; `actionItbiWarnings` → `itbi/actions.ts`; `actionWorkspaceData` → `cadastros-fiscais/data.ts` |
| `integrations.ts` | `actionIntegrationReplay`, `insertActionIntegration` → cadastros-fiscais; `actionLatestRedesimEvent`, `actionRedesimTaxpayer` → REDESIM; `actionTaxpayerSelection`, `updateActionTaxpayerStatus` → lote cadastral |
| `records.ts` | `insertActionDebt`, `updateActionDebt` → `divida/actions.ts`; `insertActionCertificate`, `revokeActionCertificate` → certidões; `actionLicense`, `updateActionLicense`, `actionActiveRegistrations` → alvarás; `actionAssessmentTaxpayer`, `actionServiceActivity` → operações |
| `property.ts` | `actionProperty` → `imoveis/property-actions.ts`, `recadastramento/protocolo/[id]/route.ts`; `actionActivePropertyCharacteristics` → `imoveis/property-actions.ts`; `actionCampaignProperties` → `recadastramento/actions.ts` |
| `documents.ts` | `actionActorName` → B `simples/termos/[id]/route.ts`; `actionTaxpayerParties` → `itbi/[id]/documento/route.ts`, `simples-nacional/exclusoes/[id]/documento/route.ts` e chamadas internas de `actionGuideDocument`/`actionCdaDocument`; `actionItbiDocument` → `itbi/[id]/documento/route.ts`; `actionExclusion` → `simples-nacional/exclusoes/[id]/{arquivo,documento}/route.ts`; `actionGuideDocument` → `guias/[id]/route.ts`, `iss-bancario/guias/[id]/route.ts`; `actionPixCharge` → `guias/[id]/route.ts`; `actionCdaDocument` → `divida-ativa/cda/[id]/pdf/route.ts`; `actionFiscalDocument` → `fiscalizacao/documentos/[id]/route.ts`; `actionProductivityReport` → `fiscalizacao/produtividade/relatorio/route.ts`; `actionBenefitReport` → `cobranca/relatorios/beneficios/route.ts`; `actionInstallmentReport` → `cobranca/relatorios/parcelamentos/route.ts`, `cobranca/parcelamentos/[id]/termo/route.ts` |
| `reports.ts` | `actionTaxpayerReport` → relatório de pessoas; `actionEconomicReport` → relatório econômico |
| `desif-documents.ts` | `actionDesifReceipt` → `iss-bancario/importacoes/[id]/recibo/route.ts`; `actionDesifFiscalCase` → `iss-bancario/fiscalizacoes/[id]/{mapa,tiaf}/route.ts` |

Consumidores de `taxActionConnection` (todos): A `avaliacoes/actions.ts`, `bi-tributario/actions.ts`, `cobranca/parcelamentos/[id]/termo/route.ts`, `cobranca/relatorios/{beneficios,parcelamentos}/route.ts`, `divida-ativa/cda/[id]/pdf/route.ts`, `economico/actions.ts`, `economico/relatorio/route.ts`, `fiscalizacao/actions.ts`, `fiscalizacao/documentos/[id]/route.ts`, `fiscalizacao/produtividade/relatorio/route.ts`, `guias/[id]/route.ts`, `imoveis/operacoes/actions.ts`, `imoveis/property-actions.ts`, `imoveis/[id]/bloqueio/actions.ts`, `iss-bancario/fiscalizacoes/[id]/{mapa,tiaf}/route.ts`, `iss-bancario/guias/[id]/route.ts`, `iss-bancario/importacoes/[id]/recibo/route.ts`, `itbi/[id]/documento/route.ts`, `operacoes/actions.ts`, `pessoas/relatorio/route.ts`, `recadastramento/protocolo/[id]/route.ts`, `simples-nacional/exclusoes/[id]/{arquivo,documento}/route.ts`; B `itbi/declaracoes/[id]/route.ts`, `itbi/documentos/[id]/route.ts`, `itbi/[id]/{dam,pdf}/route.ts`, `notificacoes/route.ts`, `simples/{arquivos,termos}/[id]/route.ts`.

Consumidores de `taxActionContext` (todos): A `alvaras/actions.ts`, `alvaras/configurados/actions.ts`, `avaliacoes/simulacao/actions.ts`, `base-territorial/actions.ts`, `cadastros-fiscais/actions.ts`, `calendarios/actions.ts`, `cemiterios/actions.ts`, `certidoes/actions.ts`, `cobranca/actions.ts`, `comparativo-anual/exportar/route.ts`, `configuracoes-cadastrais/actions.ts`, `configuracoes-cadastrais/pgv-lote/actions.ts`, `divida/actions.ts`, `divida-ativa/actions.ts`, `domicilio-tributario/actions.ts`, `economico/{alteracao-geral,atividades,contadores,eventos-veiculos}/actions.ts`, `economico/[id]/perfil/actions.ts`, `fiscalizacao/s7-actions.ts`, `guias/actions.ts`, `imoveis/actions.ts`, `imoveis/{alteracao-geral,configuracao}/actions.ts`, `imoveis/[id]/perfil/actions.ts`, `iss-bancario/actions.ts`, `itbi/actions.ts`, `itbi/{bloqueios,cancelamento-automatico,comunicacao,modelos,online,processos}/actions.ts`, `itbi/collection-actions.ts`, `lotes-anuais/actions.ts`, `nfse/actions.ts`, `notificacoes/actions.ts`, `recadastramento/actions.ts`, `resumo-anual/actions.ts`, `simples-nacional/actions.ts`, `simples-nacional/arquivos/actions.ts`, `vaf/actions.ts`; B `itbi/anexos/route.ts`. O teste próprio também importa `taxActionConnection`.

Exports de schema próprios: `actionActiveDebts` → `records.ts`, `documents.ts`; `actionTaxCertificates` → `records.ts`; `actionExclusions`, `actionAgreements`, `actionInstallmentRules`, `actionQuotas`, `actionBenefitGrants`, `actionCdaVersions`, `actionDebtEvents` → `documents.ts`. Todos também são importados via namespace pelo teste de catálogo. `createTaxActionsFixture` é export exclusivo do helper e consumido por `tests/drizzle-tax-actions.test.ts`.

## Dependências externas — matriz atualizada após os handoffs

**C** conexão, **E** executor, **T** transação da action. A matriz foi reconferida contra os serviços entregues; somente o core Index/Scope continua em migração pelo owner original na última leitura. O recorte não adapta o core por casts nem duplica seus writers. A certificação transitiva depende da implementação completa dos helpers internos e do gate central.

| Serviço externo | Contratos chamados / modo preparado |
| --- | --- |
| `index.ts` | C: `confirmTaxPayment`, `cancelTaxGuide`, `configureTaxParameter`, `createTaxServiceRequest`, `configureTaxServiceActivity`, `recordIssDeclaration`, `createTaxAssessment`, `generateTaxGuide`, `enrollAssessmentInActiveDebt`, `evaluateTaxCertificateSituation`, `configureTaxFinancialMapping` |
| `configurable-cadastres.ts` | Fechado no recorte: C `publishFiscalCatalog`, `saveConfiguredFiscalRecord` |
| `s4-service.ts` | Fechado no recorte: E `createDeductionCredit`; C `requestNfseCredential`, `decideNfseCredential`, `createCorrectionLetter`, `receiveRpsBatch`, `emitNfse`, `substituteNfse`, `cancelNfse`, `updateRpsItem`, `createDmsDeclaration`, `createOccasionalRequest`, `approveOccasionalRequest`, `releaseOccasionalRequest` |
| `s5-service.ts` | Fechado no recorte, todos C: `processSimplesDivergences`, `communicateSimplesDivergence`, `communicateSimplesExclusion`, `importSimplesBatch`, `rectifySimplesDivergence`, `prepareSimplesExclusion` |
| `s6-service.ts` | Fechado no recorte, todos C: `createDesifInstitution`, `createDesifAgency`, `validateDesifImport`, `receiveDesifImport`, `communicateDesifFiscalCase`, `processDesifImport`, `issueDesifGuide`, `openDesifFiscalCase` |
| `s8-service.ts` | Fechado no recorte, todos C: `createCollectionPortfolio`, `scheduleCollectionAction`, `completeCollectionAction`, `grantPortalAccess`, `createBenefitRule`, `createPrizeDraw`, `issuePrizeCoupon`, `executePrizeDraw`, `grantBenefit` |
| `s10-service.ts` | Fechado no recorte, todos C: `upsertAccountant`, `upsertCompany`, `linkCompanyAccountant`, `upsertRule`, `importMovements`, `processCompetency`, `importRepasse`, `importIndices`, `notifyCorrection`, `markNotificationRead`, `resolveCrossCheck`, `createEstimate` |

S2/S3/S7/S9, `certificate-subjects.ts` (`evaluateCertificateInTransaction`: T), `simples-option-files.ts` (os três writers: C), `tax-worker-actor.ts` (`resolveTaxWorkerActor`: E) e os motores dedicados Economic/Property/ITBI/Annual/Accounting já têm contratos Drizzle na última reconferência. A validação final deve olhar assinaturas **e implementação transitiva**, incluindo nested writes e auditoria. Os pares action/API RPS (`receiveRpsBatch`, **C**) e DMS (`createDmsDeclaration`, C) agora estão nominalmente alinhados. O crédito S4 continua E por contrato final explícito.

Os três consumidores `.tsx` de `getFiscalRegistryWorkspaceData` foram reconferidos após o trabalho do owner de páginas: `imoveis/[id]/page.tsx`, `economico/[id]/page.tsx` e `pessoas/[id]/page.tsx` agora passam **`database`**, alinhados ao contrato `DatabaseExecutor`. Este handoff não altera `.tsx`.

## Testes preparados e verificações realizadas

Novo `tests/drizzle-tax-actions.test.ts`, com um banco local sobre o **histórico integral real** e transporte Neon/Drizzle de produção. Quatro subcenários sequenciais cobrem:

1. Projeções versus catálogo físico, mesma conexão/pool, origem UG/ente positiva/negativa/vazia e relações nullable PF/PJ/sem vínculo.
2. Filtro SQL de registros restritos por UG, escopo vazio, usuário irrestrito, ordenação por vigência com diferença de **1 ms**, última versão e JSON null real.
3. Decimal extremo `9999999999999999.99`, `0.02`, timestamps com milissegundos, SQL NULL versus JSON null em integração/auditoria, leitura de evento REDESIM sem confundir outro contribuinte e replay protegido pela unique constraint.
4. Falha PostgreSQL `P0001` na **última auditoria**: atualização do contribuinte, registro fiscal, integração e rascunho de certidão são revertidos juntos. Snapshots completos antes/depois e leitura de escrita ainda não commitada pelo mesmo `tx` impedem passar com segunda conexão ou persistência parcial.

`tests/helpers/tax-actions-fixture.ts` usa `createTaxationDrizzleFixture` somente para reaplicar SQL histórico local; seeds próprios possuem autor, UG/ente e contribuinte canônicos. O teardown fecha pool/transporte, inclusive se o seed falhar. Não há DML/DDL remoto, geração de schema nem mock de persistência.

Verificações leves concluídas:

- ESLint dos 89 arquivos do recorte, oito repositórios próprios e schema: **exit code 0, sem warnings**.
- ESLint do teste próprio e fixture: **exit code 0, sem warnings**.
- Buscas dos quatro recortes até zero referências/delegates Prisma/casts de compatibilidade.
- Inventário AST dos **89 arquivos / 315 exports**, com consumidores `src/**` e `tests/**`, inclusive configurações HTTP e exports sem chamador.
- Parse AST dos **100 arquivos** (89 da aplicação, oito repositórios, um schema e teste/helper): **zero diagnósticos sintáticos**.
- Conferência final de **187 chamadas** a helpers tributários já tipados: **162 Connection / 16 Executor / 9 Transaction**, sem argumentos incompatíveis nessa fronteira; inventário dos **375 exports** desses 100 arquivos sem símbolo omitido no handoff. É inspeção AST de assinaturas/chamadas, não typecheck.
- Os nove INSERTs de seed do helper foram confrontados com o catálogo independente: **zero colunas desconhecidas e zero campos obrigatórios sem valor/default**.

Na conferência histórica anterior à entrega dos motores, **61 funções externas em sete módulos** ainda expunham contratos Prisma. Essa contagem foi superada pelos handoffs ConfiguredCadastres/S4/Collection: a matriz atualizada acima fecha seus consumidores. Na reconferência atual permanecem **11 funções de `index.ts` / 12 chamadas no recorte**, aguardando o owner Index/Scope; não se declara certificação transitiva por esta entrega.

**Não executados nesta frente:** teste com banco/PGlite, typecheck/tsc, build, Git, commit/push/deploy ou operação remota. Testes e verificações integradas pertencem à fila central do parent.

### Gate central solicitado após concluir contratos do core

```powershell
node --max-old-space-size=512 --conditions=react-server --import tsx --test --test-concurrency=1 tests/drizzle-tax-actions.test.ts
```

Depois, integrar com as suítes dos owners Tax/Economic/Property/ITBI/Annual/Accounting e contratos documentais/API, seguido de typecheck/build pelo parent. Execução serial obrigatória: o transporte local muda a configuração Neon global do processo. Registrar os resultados reais aqui antes de declarar encerramento integrado.
