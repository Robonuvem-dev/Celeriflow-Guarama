# Tabelas vazias no Neon — 08/11/2026

Consulta direta, em transação somente leitura e snapshot consistente. Contagens exatas com `COUNT(*)`; tabelas de sistema e views excluídas. Partições filhas, se existirem, são contabilizadas por sua tabela-pai. Nenhum conteúdo de registros exportado.

- Tabelas encontradas e verificadas: **1.130**
- Tabelas vazias: **777**
- Tabelas com registros: **353**
- Registros contabilizados: **246.829**
- Erros de consulta: **0**
- Tabelas com segurança por linha (RLS): **0**
- Tabelas particionadas: **0**

Banco: `neondb`. Snapshot: 2026-11-08T14:41:03.275Z.

## Resultado por schema

| Schema | Total | Vazias | Com registros |
| --- | ---: | ---: | ---: |
| `public` — tabelas da aplicação e controle de migrações | 1.121 | 769 | 352 |
| `neon_auth` — autenticação do Neon | 9 | 8 | 1 |
| **Total** | **1.130** | **777** | **353** |

## Exemplos de lacunas de dados

Todas as tabelas abaixo tinham **zero registros** no snapshot consultado.

| Área | Exemplos de tabelas vazias |
| --- | --- |
| Financeiro e contabilidade | `AccountingPlan`, `AccountingTransaction`, `AccountingEntry`, `Commitment`, `Settlement`, `Payment`, `Revenue` |
| Tributação e NFS-e | `TaxAssessment`, `TaxGuide`, `TaxPayment`, `Invoice` |
| Planejamento | `PlanningCatalogEntry`, `PlanningBudgetLine`, `PlanningQuota` |
| Obras / construção civil | `ConstructionCase`, `ConstructionConfigVersion` |
| Saúde | `MedicalRecord`, `MedicineDispensation`, `VaccinationRecord` |
| Educação | `Attendance`, `SchoolMeal`, `TeacherClassAssignment` |
| Assistência social | `SocialBenefitConcession`, `SuasProntuarioRma` |

Há dados em outras tabelas dessas áreas: `Patient` e `HealthAppointment` têm 20 registros cada; `Student` e `Enrollment`, 20 cada; `Family`, 26; `SocialUnit`, 2. Portanto, os resultados acima não significam que todos esses módulos estejam integralmente sem dados.

O relatório se refere ao banco Neon configurado em `.env.local`/`.env`, usando `DATABASE_URL_UNPOOLED` com prioridade sobre `DATABASE_URL`. As definições locais de tabelas foram usadas apenas como referência auxiliar; a existência e a contagem vieram diretamente do catálogo e das tabelas do banco.

## Tabelas com zero registros

Tabela física vazia não indica, por si só, falha do módulo: tabelas de eventos, integrações, anexos e histórico podem depender de operações ainda não realizadas.

| Schema | Tabela | Definição local |
| --- | --- | --- |
| neon_auth | `account` |  |
| neon_auth | `invitation` |  |
| neon_auth | `jwks` |  |
| neon_auth | `member` |  |
| neon_auth | `organization` |  |
| neon_auth | `session` |  |
| neon_auth | `user` |  |
| neon_auth | `verification` |  |
| public | `AcademicDocumentIssue` | `src/db/schema/education-admissions.ts` |
| public | `AccountingEntry` | `src/db/schema/finance-accounting.ts`, `src/db/schema/finance-fiscal-indices.ts`, `src/db/schema/finance-msc.ts` |
| public | `AccountingEventCatalog` | `src/db/schema/finance-accounting.ts`, `src/db/schema/finance-setup-tools.ts`, `src/db/schema/municipal-setup-tools.ts` |
| public | `AccountingPlan` | `src/db/schema/finance-accounting.ts`, `src/db/schema/finance-setup-tools.ts`, `src/db/schema/municipal-setup-tools.ts` |
| public | `AccountingPostingComponent` | `src/db/schema/finance-accounting.ts`, `src/db/schema/finance-setup-tools.ts` |
| public | `AccountingPostingRule` | `src/db/schema/finance-accounting.ts`, `src/db/schema/finance-setup-tools.ts`, `src/db/schema/municipal-setup-tools.ts` |
| public | `AccountingTransaction` | `src/db/schema/finance-accounting.ts`, `src/db/schema/finance-fiscal-indices.ts`, `src/db/schema/finance-msc.ts`, `src/db/schema/finance-setup-tools.ts` |
| public | `ActiveDebt` | `src/db/schema/tax-accounting.ts`, `src/db/schema/tax-actions.ts`, `src/db/schema/taxation-pages.ts` |
| public | `AnnualAccountingClose` | `src/db/schema/finance-accounting.ts`, `src/db/schema/finance-msc.ts` |
| public | `AnnualBudgetExpenseFixation` | `src/db/schema/municipal-setup-tools.ts`, `src/db/schema/planning-legal.ts` |
| public | `AnnualBudgetRevenueForecast` | `src/db/schema/municipal-setup-tools.ts`, `src/db/schema/planning-legal.ts`, `src/db/schema/transparency-planning.ts` |
| public | `AssetCatalogRecord` | `src/db/schema/assets-catalogs.ts` |
| public | `AssetIntegrationPendingConfiguration` | `src/db/schema/assets.ts` |
| public | `AssetTransfer` | `src/db/schema/assets.ts` |
| public | `AssetValueAdjustment` | `src/db/schema/assets.ts` |
| public | `AssetValueHistory` | `src/db/schema/assets.ts` |
| public | `AssetWriteOff` | `src/db/schema/assets.ts` |
| public | `Attendance` | `src/db/schema/education-teaching.ts` |
| public | `AutomatedBankDownload` | `src/db/schema/finance-banking.ts` |
| public | `BankAccountResourceSource` | `src/db/schema/finance-pages.ts`, `src/db/schema/finance-setup-tools.ts` |
| public | `BankBranch` | `src/db/schema/master-data.ts` |
| public | `BankReconciliation` | `src/db/schema/finance-reconciliation.ts` |
| public | `BankReconciliationAllocation` | `src/db/schema/finance-reconciliation.ts` |
| public | `BankReconciliationAllocationGroup` | `src/db/schema/finance-reconciliation.ts` |
| public | `BankReconciliationMatch` | `src/db/schema/finance-reconciliation.ts` |
| public | `BankReconciliationSession` | `src/db/schema/finance-reconciliation.ts` |
| public | `BankStatementImport` | `src/db/schema/finance-banking.ts` |
| public | `BankStatementItem` | `src/db/schema/finance-banking.ts` |
| public | `BenefitConfig` | `src/db/schema/municipal-setup-tools.ts`, `src/db/schema/personnel-external-operations.ts`, `src/db/schema/sst-benefits.ts` |
| public | `BiddingBid` | `src/db/schema/procurement-bidding.ts` |
| public | `BiddingEligibility` | `src/db/schema/procurement-bidding.ts` |
| public | `BiddingResult` | `src/db/schema/procurement-core.ts` |
| public | `BimonthlyRevenueTarget` | `src/db/schema/finance-legacy-budget.ts` |
| public | `BudgetGuidelinePriority` | `src/db/schema/planning-legal.ts` |
| public | `BudgetGuidelineRisk` | `src/db/schema/planning-legal.ts` |
| public | `BudgetMovement` | `src/db/schema/finance-budget.ts`, `src/db/schema/planning-budget.ts` |
| public | `BudgetReservation` | `src/db/schema/finance-budget.ts`, `src/db/schema/finance-setup-tools.ts`, `src/db/schema/planning-financial-sources.ts`, `src/db/schema/procurement-finance.ts`, `src/db/schema/transparency-financial.ts` |
| public | `CamAdvisor` | `src/db/schema/municipal-setup-tools.ts` |
| public | `CamDocumentoLegislativo` |  |
| public | `CamParecer` |  |
| public | `CamPresencaSessao` |  |
| public | `CamVotacao` |  |
| public | `CamVoto` |  |
| public | `CemeteryAttachment` | `src/db/schema/cemeteries.ts` |
| public | `CemeteryFeeEvent` | `src/db/schema/cemeteries.ts` |
| public | `CemeteryFeeRuleVersion` | `src/db/schema/cemeteries.ts` |
| public | `CemeteryProcess` | `src/db/schema/cemeteries.ts` |
| public | `CertificateUseAudit` | `src/db/schema/document-workflow.ts` |
| public | `CitizenRegistryIdentity` | `src/db/schema/citizen-access.ts` |
| public | `ClassScheduleBoard` | `src/db/schema/education-core.ts` |
| public | `ClassScheduleEntry` | `src/db/schema/education-core.ts` |
| public | `ClassificationRule` | `src/db/schema/finance-automation.ts` |
| public | `Commitment` | `src/db/schema/finance-budget.ts`, `src/db/schema/finance-setup-tools.ts`, `src/db/schema/planning-financial-sources.ts`, `src/db/schema/procurement-finance.ts`, `src/db/schema/transparency-financial.ts` |
| public | `CommitmentMovement` | `src/db/schema/finance-budget.ts`, `src/db/schema/planning-financial-sources.ts`, `src/db/schema/procurement-finance.ts`, `src/db/schema/transparency-financial.ts` |
| public | `ConfiguracaoParametroInstancia` | `src/db/schema/instance-configuration.ts` |
| public | `ConstructionAnalystReplacement` | `src/db/schema/construction-core.ts`, `src/db/schema/works-pages.ts` |
| public | `ConstructionAutomaticViabilityRun` | `src/db/schema/construction-viability.ts` |
| public | `ConstructionCase` | `src/db/schema/construction-core.ts` |
| public | `ConstructionCaseProperty` | `src/db/schema/construction-core.ts` |
| public | `ConstructionCompanyProfile` | `src/db/schema/construction-portal.ts` |
| public | `ConstructionCompanyProfileEvent` | `src/db/schema/construction-portal.ts` |
| public | `ConstructionCompletion` | `src/db/schema/construction-lifecycle.ts`, `src/db/schema/works-pages.ts` |
| public | `ConstructionCompletionSequence` | `src/db/schema/construction-lifecycle.ts` |
| public | `ConstructionConfigVersion` | `src/db/schema/construction-core.ts` |
| public | `ConstructionConsultation` | `src/db/schema/construction-core.ts`, `src/db/schema/transparency-sources.ts`, `src/db/schema/works-pages.ts` |
| public | `ConstructionConsultationResponse` | `src/db/schema/construction-core.ts`, `src/db/schema/transparency-sources.ts`, `src/db/schema/works-pages.ts` |
| public | `ConstructionDefinitionVersion` | `src/db/schema/construction-viability.ts` |
| public | `ConstructionDistributionVersion` | `src/db/schema/construction-core.ts`, `src/db/schema/works-pages.ts` |
| public | `ConstructionDocumentRequest` | `src/db/schema/construction-documents.ts` |
| public | `ConstructionDocumentTemplateVersion` | `src/db/schema/construction-documents.ts` |
| public | `ConstructionEnforcementAcknowledgement` | `src/db/schema/construction-enforcement.ts`, `src/db/schema/works-pages.ts` |
| public | `ConstructionEnforcementAct` | `src/db/schema/construction-enforcement.ts`, `src/db/schema/works-pages.ts` |
| public | `ConstructionEnforcementAssignment` | `src/db/schema/construction-enforcement.ts`, `src/db/schema/works-pages.ts` |
| public | `ConstructionEnforcementCase` | `src/db/schema/construction-enforcement.ts`, `src/db/schema/works-pages.ts` |
| public | `ConstructionEnforcementEvidence` | `src/db/schema/construction-enforcement.ts`, `src/db/schema/works-pages.ts` |
| public | `ConstructionEnforcementSequence` | `src/db/schema/construction-enforcement.ts` |
| public | `ConstructionEnforcementVisit` | `src/db/schema/construction-enforcement.ts`, `src/db/schema/works-pages.ts` |
| public | `ConstructionExternalApplication` | `src/db/schema/construction-portal.ts` |
| public | `ConstructionExternalDocument` | `src/db/schema/construction-opening.ts` |
| public | `ConstructionFederalExport` | `src/db/schema/construction-integrations.ts`, `src/db/schema/works-pages.ts` |
| public | `ConstructionFederalExportItem` | `src/db/schema/construction-integrations.ts`, `src/db/schema/works-pages.ts` |
| public | `ConstructionFederalExportReceipt` | `src/db/schema/construction-integrations.ts`, `src/db/schema/works-pages.ts` |
| public | `ConstructionFee` | `src/db/schema/construction-taxation.ts`, `src/db/schema/works-pages.ts` |
| public | `ConstructionInspection` | `src/db/schema/construction-lifecycle.ts`, `src/db/schema/works-pages.ts` |
| public | `ConstructionInspectionDeadlineExtension` | `src/db/schema/construction-lifecycle.ts` |
| public | `ConstructionInspectionPlan` | `src/db/schema/construction-lifecycle.ts`, `src/db/schema/works-pages.ts` |
| public | `ConstructionInternalOpeningDocument` | `src/db/schema/construction-opening.ts` |
| public | `ConstructionIssuedDocument` | `src/db/schema/construction-documents.ts` |
| public | `ConstructionLifecycleStart` | `src/db/schema/construction-core.ts`, `src/db/schema/works-pages.ts` |
| public | `ConstructionMessage` | `src/db/schema/construction-portal.ts` |
| public | `ConstructionParticipant` | `src/db/schema/construction-core.ts` |
| public | `ConstructionPdfAnnotation` | `src/db/schema/construction-documents.ts` |
| public | `ConstructionPlanExtraction` | `src/db/schema/construction-integrations.ts`, `src/db/schema/works-pages.ts` |
| public | `ConstructionPortalIdentity` | `src/db/schema/construction-core.ts` |
| public | `ConstructionProfessional` | `src/db/schema/construction-core.ts` |
| public | `ConstructionProfessionalEmployer` | `src/db/schema/construction-portal.ts` |
| public | `ConstructionProjectStamp` | `src/db/schema/construction-documents.ts` |
| public | `ConstructionPropertyUpdate` | `src/db/schema/construction-lifecycle.ts` |
| public | `ConstructionPropertyZone` | `src/db/schema/construction-viability.ts` |
| public | `ConstructionReview` | `src/db/schema/construction-core.ts` |
| public | `ConstructionServiceRequest` | `src/db/schema/construction-portal.ts`, `src/db/schema/works-pages.ts` |
| public | `ConstructionStaffRole` | `src/db/schema/construction-portal.ts` |
| public | `ConstructionTaxRuleVersion` | `src/db/schema/construction-taxation.ts`, `src/db/schema/works-pages.ts` |
| public | `ConstructionTermAcceptance` | `src/db/schema/construction-portal.ts` |
| public | `ConstructionTermVersion` | `src/db/schema/construction-portal.ts` |
| public | `ConstructionViabilityResult` | `src/db/schema/construction-core.ts` |
| public | `ConstructionZoneVersion` | `src/db/schema/construction-viability.ts` |
| public | `ContractAmendment` | `src/db/schema/procurement-core.ts` |
| public | `ControlledMedicineBook` |  |
| public | `CreditRequest` | `src/db/schema/finance-legacy-budget.ts`, `src/db/schema/finance-pages.ts` |
| public | `CreditRequestItem` | `src/db/schema/finance-legacy-budget.ts`, `src/db/schema/finance-pages.ts` |
| public | `CulturaConselhoDocumento` |  |
| public | `CulturaEventoDocumento` |  |
| public | `CulturaProjetoDocumento` |  |
| public | `CulturaReservaDocumento` |  |
| public | `CulturalIncentiveProject` | `src/db/schema/culture.ts` |
| public | `CurriculumMatrix` | `src/db/schema/education-core.ts` |
| public | `CurriculumMatrixSubject` | `src/db/schema/education-core.ts` |
| public | `DebtInstallment` | `src/db/schema/portal-fiscal.ts`, `src/db/schema/tax-accounting.ts` |
| public | `DebtInstallmentSchedule` |  |
| public | `DesifAgency` | `src/db/schema/tax-collection-operations.ts` |
| public | `DesifAssessment` | `src/db/schema/tax-collection-operations.ts` |
| public | `DesifCosifAccount` | `src/db/schema/tax-collection-operations.ts` |
| public | `DesifFiscalCase` | `src/db/schema/tax-collection-operations.ts` |
| public | `DesifFiscalEvent` | `src/db/schema/tax-collection-operations.ts` |
| public | `DesifImportBatch` | `src/db/schema/tax-collection-operations.ts` |
| public | `DesifPackage` | `src/db/schema/tax-collection-operations.ts` |
| public | `DesifPackageItem` | `src/db/schema/tax-collection-operations.ts` |
| public | `DesifPackageMovement` | `src/db/schema/tax-collection-operations.ts` |
| public | `DesifPgccAccount` | `src/db/schema/tax-collection-operations.ts` |
| public | `DesifPgccCosifLink` | `src/db/schema/tax-collection-operations.ts` |
| public | `DesifPgccPlan` | `src/db/schema/tax-collection-operations.ts` |
| public | `DesifSubtitle` | `src/db/schema/tax-collection-operations.ts` |
| public | `DesifTariff` | `src/db/schema/tax-collection-operations.ts` |
| public | `DesifTrialBalance` | `src/db/schema/tax-collection-operations.ts` |
| public | `DirectContracting` | `src/db/schema/procurement-core.ts` |
| public | `DocumentIcpEvidence` | `src/db/schema/document-workflow.ts`, `src/db/schema/tax-economic.ts` |
| public | `DteAccessGrant` | `src/db/schema/tax-catalog-rules.ts` |
| public | `DteMailbox` | `src/db/schema/taxation-dte.ts` |
| public | `DteMessage` | `src/db/schema/taxation-dte.ts` |
| public | `DteMessageEvent` | `src/db/schema/taxation-dte.ts` |
| public | `DtePowerOfAttorney` | `src/db/schema/tax-catalog-rules.ts` |
| public | `DtePowerOfAttorneyEvent` | `src/db/schema/tax-catalog-rules.ts` |
| public | `EconomicRegistration` | `src/db/schema/tax-configured-records-operations.ts`, `src/db/schema/taxation-core.ts` |
| public | `EducacensoOperation` | `src/db/schema/education-core.ts` |
| public | `EducationApplicationPlan` | `src/db/schema/education-operations.ts` |
| public | `EducationAssessment` | `src/db/schema/education-teaching.ts` |
| public | `EducationFinancialAccount` | `src/db/schema/education-operations.ts` |
| public | `EducationFinancialMovement` | `src/db/schema/education-operations.ts` |
| public | `EducationFoodMovement` | `src/db/schema/education-operations.ts` |
| public | `EducationLibraryLoan` | `src/db/schema/education-operations.ts` |
| public | `EducationLibraryReservation` | `src/db/schema/education-operations.ts` |
| public | `EducationTransportEvent` | `src/db/schema/education-operations.ts` |
| public | `EducationTransportJourney` | `src/db/schema/education-operations.ts` |
| public | `EducationTransportRoute` | `src/db/schema/education-operations.ts` |
| public | `EducationTransportStop` | `src/db/schema/education-operations.ts` |
| public | `EducationTransportStudent` | `src/db/schema/education-operations.ts` |
| public | `EmployeePortalAccessLink` |  |
| public | `EmployeePortalLoginGuard` |  |
| public | `EnrollmentMovement` | `src/db/schema/education-core.ts` |
| public | `EnvInfraction` | `src/db/schema/environment.ts` |
| public | `EnvRecyclingMaterialBinding` | `src/db/schema/environment-recycling.ts` |
| public | `EnvRecyclingMovement` | `src/db/schema/environment-recycling.ts` |
| public | `EnvRecyclingStock` | `src/db/schema/environment-recycling.ts` |
| public | `EnvironmentalLicense` | `src/db/schema/environment.ts` |
| public | `EquipmentCustody` | `src/db/schema/assets-stock.ts` |
| public | `ExceptionQueueItem` | `src/db/schema/finance-automation.ts` |
| public | `FinanceCheckbook` | `src/db/schema/finance-cheques.ts` |
| public | `FinanceCheque` | `src/db/schema/finance-cheques.ts` |
| public | `FinancialDocument` | `src/db/schema/finance-documents.ts` |
| public | `FiscalAssessmentMap` | `src/db/schema/taxation-inspection.ts` |
| public | `FiscalAuditPlan` | `src/db/schema/taxation-inspection.ts` |
| public | `FiscalAuditPlanEvent` | `src/db/schema/taxation-inspection.ts` |
| public | `FiscalAuditPlanInspector` | `src/db/schema/taxation-inspection.ts` |
| public | `FiscalAuditPlanSelection` | `src/db/schema/taxation-inspection.ts` |
| public | `FiscalDocumentRequest` | `src/db/schema/taxation-inspection.ts` |
| public | `FiscalDocumentTemplate` | `src/db/schema/taxation-inspection.ts` |
| public | `FiscalInspectionDocument` | `src/db/schema/taxation-inspection.ts` |
| public | `FiscalMeshFinding` | `src/db/schema/taxation-inspection.ts` |
| public | `FiscalMeshOrderLink` | `src/db/schema/taxation-inspection.ts` |
| public | `FiscalPenaltyRule` | `src/db/schema/taxation-inspection.ts` |
| public | `FiscalProductivityConfig` | `src/db/schema/taxation-inspection.ts` |
| public | `FiscalProductivityEntry` | `src/db/schema/taxation-inspection.ts` |
| public | `FiscalProductivityLedger` | `src/db/schema/taxation-inspection.ts` |
| public | `FiscalProductivityPeriod` | `src/db/schema/taxation-inspection.ts` |
| public | `FiscalProductivityTaskRule` | `src/db/schema/taxation-inspection.ts` |
| public | `FiscalServiceOrder` | `src/db/schema/taxation-inspection.ts` |
| public | `FiscalServiceOrderEvent` | `src/db/schema/taxation-inspection.ts` |
| public | `FleetAttachment` | `src/db/schema/fleet.ts` |
| public | `FleetAuthorization` | `src/db/schema/fleet.ts` |
| public | `FleetCatalogEntry` | `src/db/schema/fleet.ts` |
| public | `FleetCatalogVersion` | `src/db/schema/fleet.ts` |
| public | `FleetClaim` | `src/db/schema/fleet.ts` |
| public | `FleetComponent` | `src/db/schema/fleet.ts` |
| public | `FleetComponentInstallation` | `src/db/schema/fleet.ts` |
| public | `FleetControlEvent` | `src/db/schema/fleet.ts` |
| public | `FleetDebtPayment` | `src/db/schema/fleet.ts` |
| public | `FleetDebtSettings` | `src/db/schema/fleet.ts` |
| public | `FleetDestination` | `src/db/schema/fleet.ts` |
| public | `FleetExternalEvent` | `src/db/schema/fleet.ts` |
| public | `FleetExternalThrottle` | `src/db/schema/fleet.ts` |
| public | `FleetFine` | `src/db/schema/fleet.ts` |
| public | `FleetFinePayment` | `src/db/schema/fleet.ts` |
| public | `FleetFuelAgreement` | `src/db/schema/fleet.ts` |
| public | `FleetFuelQuota` | `src/db/schema/fleet.ts` |
| public | `FleetGateEvent` | `src/db/schema/fleet.ts` |
| public | `FleetMachineType` | `src/db/schema/fleet.ts` |
| public | `FleetOperation` |  |
| public | `FleetProvider` | `src/db/schema/fleet.ts` |
| public | `FleetSequence` | `src/db/schema/fleet.ts` |
| public | `FleetTrip` | `src/db/schema/fleet.ts` |
| public | `FleetUsage` | `src/db/schema/fleet.ts` |
| public | `FleetWorkshopReport` | `src/db/schema/fleet.ts` |
| public | `FundedDebt` | `src/db/schema/finance-pages.ts` |
| public | `GedAcl` |  |
| public | `GedCalendarEvent` |  |
| public | `GedComment` |  |
| public | `GedDisposal` |  |
| public | `GedEmbedding` |  |
| public | `GedEventQueue` |  |
| public | `GedFavorite` |  |
| public | `GedFlowDecision` |  |
| public | `GedFlowDefinition` |  |
| public | `GedFlowRun` |  |
| public | `GedGroup` |  |
| public | `GedGroupMember` |  |
| public | `GedIntegrationLink` |  |
| public | `GedMailIntent` |  |
| public | `GedMetadata` | `src/db/schema/ged-poc.ts` |
| public | `GedOperationLease` | `src/db/schema/ged-management.ts` |
| public | `GedPreference` |  |
| public | `GedPublicationLink` |  |
| public | `GedRule` |  |
| public | `GedRuleActionResult` |  |
| public | `GedRuleExecution` |  |
| public | `GedRuleVersion` |  |
| public | `GedSetting` |  |
| public | `GedSourceImport` |  |
| public | `GedTask` |  |
| public | `GedTypeDefinition` | `src/db/schema/ged-poc.ts` |
| public | `GenericProcessWorkflowDefinition` | `src/db/schema/municipal-setup-tools.ts`, `src/db/schema/processes.ts` |
| public | `GenericProcessWorkflowEvent` | `src/db/schema/processes.ts` |
| public | `GenericProcessWorkflowInstance` | `src/db/schema/processes.ts` |
| public | `GenericProcessWorkflowStage` | `src/db/schema/municipal-setup-tools.ts`, `src/db/schema/processes.ts` |
| public | `Grade` | `src/db/schema/education-teaching.ts` |
| public | `HealthAdministrativeMerge` | `src/db/schema/health-management-operations.ts` |
| public | `HealthAppointmentEvent` | `src/db/schema/health-agenda.ts` |
| public | `HealthAssistentialDevice` | `src/db/schema/health-diagnostics.ts` |
| public | `HealthAuthorizationIssuer` | `src/db/schema/health-treatment.ts` |
| public | `HealthAuthorizationNumberRange` | `src/db/schema/health-treatment.ts` |
| public | `HealthBed` | `src/db/schema/health-reception.ts` |
| public | `HealthBedOccupancy` | `src/db/schema/health-reception.ts` |
| public | `HealthCallPanel` | `src/db/schema/health-regulation.ts` |
| public | `HealthCareAgreement` | `src/db/schema/health-agreements.ts` |
| public | `HealthCareCoverage` | `src/db/schema/health-agreements.ts` |
| public | `HealthCareProgram` | `src/db/schema/health-programs.ts` |
| public | `HealthCareProgramEnrollment` | `src/db/schema/health-programs.ts` |
| public | `HealthCareRevision` | `src/db/schema/health-care.ts` |
| public | `HealthCareSchedule` | `src/db/schema/health-agenda.ts` |
| public | `HealthCatmatUnitMapping` | `src/db/schema/health-pharmacy.ts` |
| public | `HealthChronicAssessment` | `src/db/schema/health-care-lines.ts` |
| public | `HealthClinicalDocument` | `src/db/schema/health-care.ts` |
| public | `HealthClinicalDocumentOrder` | `src/db/schema/health-care.ts` |
| public | `HealthClinicalDocumentTemplate` | `src/db/schema/health-care.ts` |
| public | `HealthClinicalEvolution` | `src/db/schema/health-care.ts` |
| public | `HealthClinicalExamReview` | `src/db/schema/health-care.ts` |
| public | `HealthClinicalQuestionnaire` | `src/db/schema/health-care.ts` |
| public | `HealthClinicalQuestionnaireResponse` | `src/db/schema/health-care.ts` |
| public | `HealthClinicalScreening` | `src/db/schema/health-care-lines.ts` |
| public | `HealthCollectiveActivity` | `src/db/schema/health-territory.ts` |
| public | `HealthCounterreference` | `src/db/schema/health-care.ts` |
| public | `HealthDcbSubstance` | `src/db/schema/health-pharmacy.ts` |
| public | `HealthDentalMark` | `src/db/schema/health-care-lines.ts` |
| public | `HealthDestination` | `src/db/schema/health-reception.ts` |
| public | `HealthDeviceMessage` | `src/db/schema/health-diagnostics.ts` |
| public | `HealthDiagnosis` | `src/db/schema/health-care.ts` |
| public | `HealthDispensationEvent` | `src/db/schema/health-pharmacy.ts` |
| public | `HealthEsusBatch` | `src/db/schema/health-diagnostics.ts`, `src/db/schema/health-pages.ts` |
| public | `HealthEsusBatchItem` | `src/db/schema/health-diagnostics.ts` |
| public | `HealthEsusForm` | `src/db/schema/health-territory.ts` |
| public | `HealthExamRequest` | `src/db/schema/health-care.ts` |
| public | `HealthFamilyDocument` | `src/db/schema/health-territory.ts` |
| public | `HealthFamilyEvent` | `src/db/schema/health-territory.ts` |
| public | `HealthFollowupBatch` | `src/db/schema/health-followup.ts` |
| public | `HealthFollowupBatchItem` | `src/db/schema/health-followup.ts` |
| public | `HealthFollowupBinding` | `src/db/schema/health-followup.ts` |
| public | `HealthFollowupProcessedKey` | `src/db/schema/health-followup.ts` |
| public | `HealthFollowupReceipt` | `src/db/schema/health-followup.ts` |
| public | `HealthFollowupReceiver` | `src/db/schema/health-followup.ts` |
| public | `HealthFollowupRecord` | `src/db/schema/health-followup.ts` |
| public | `HealthFollowupResult` | `src/db/schema/health-followup.ts` |
| public | `HealthFoodMarker` | `src/db/schema/health-territory.ts` |
| public | `HealthHabilitation` | `src/db/schema/health-administration.ts` |
| public | `HealthHomeCareAssessment` | `src/db/schema/health-territory.ts` |
| public | `HealthHomeCareAttendance` | `src/db/schema/health-territory.ts` |
| public | `HealthHomeCareRequest` | `src/db/schema/health-territory.ts` |
| public | `HealthHomeVisit` | `src/db/schema/health-territory.ts` |
| public | `HealthHomeVisitParticipant` | `src/db/schema/health-territory.ts` |
| public | `HealthInternalCareReferral` | `src/db/schema/health-care.ts` |
| public | `HealthLabExamMaterial` |  |
| public | `HealthLabExamModel` | `src/db/schema/health-laboratory.ts` |
| public | `HealthLabOrder` | `src/db/schema/health-diagnostics.ts`, `src/db/schema/health-laboratory.ts` |
| public | `HealthLabOrderEvent` | `src/db/schema/health-diagnostics.ts` |
| public | `HealthLabProviderQuota` | `src/db/schema/health-diagnostics.ts` |
| public | `HealthLabQuestionGroup` |  |
| public | `HealthLabQuestionItem` |  |
| public | `HealthLabQuestionnaire` |  |
| public | `HealthLabReport` | `src/db/schema/health-diagnostics.ts` |
| public | `HealthLabResult` | `src/db/schema/health-diagnostics.ts`, `src/db/schema/health-laboratory.ts` |
| public | `HealthLabSchedule` | `src/db/schema/health-diagnostics.ts` |
| public | `HealthLaboratoryConfiguration` | `src/db/schema/health-pages.ts` |
| public | `HealthMaintainer` | `src/db/schema/health-workforce.ts` |
| public | `HealthMedicationAdministration` | `src/db/schema/health-care.ts` |
| public | `HealthObservation` | `src/db/schema/health-care.ts` |
| public | `HealthOngoingMedication` | `src/db/schema/health-care.ts` |
| public | `HealthPanelCall` | `src/db/schema/health-regulation.ts` |
| public | `HealthPatientCall` | `src/db/schema/health-registration.ts` |
| public | `HealthPatientCondition` | `src/db/schema/health-care.ts` |
| public | `HealthPatientConditionRevision` | `src/db/schema/health-care.ts` |
| public | `HealthPatientContact` | `src/db/schema/health-registration.ts` |
| public | `HealthPatientDocument` | `src/db/schema/health-registration.ts` |
| public | `HealthPatientRegistration` | `src/db/schema/health-registration.ts` |
| public | `HealthPatientRegistrationChange` | `src/db/schema/health-registration.ts` |
| public | `HealthPerformedProcedure` | `src/db/schema/health-care.ts` |
| public | `HealthPharmacyJudicialCase` | `src/db/schema/health-pharmacy.ts` |
| public | `HealthPharmacyJudicialDocument` | `src/db/schema/health-pharmacy.ts` |
| public | `HealthPharmacyJudicialEvent` | `src/db/schema/health-pharmacy.ts` |
| public | `HealthPharmacyJudicialItem` | `src/db/schema/health-pharmacy.ts` |
| public | `HealthPharmacyKit` | `src/db/schema/health-pharmacy.ts` |
| public | `HealthPharmacyKitDelivery` | `src/db/schema/health-pharmacy.ts` |
| public | `HealthPharmacyKitDeliveryItem` | `src/db/schema/health-pharmacy.ts` |
| public | `HealthPharmacyKitEvent` | `src/db/schema/health-pharmacy.ts` |
| public | `HealthPharmacyKitItem` | `src/db/schema/health-pharmacy.ts` |
| public | `HealthPharmacyLawyer` | `src/db/schema/health-pharmacy.ts` |
| public | `HealthPostpartumVisit` | `src/db/schema/health-care-lines.ts` |
| public | `HealthPregnancy` | `src/db/schema/health-care-lines.ts` |
| public | `HealthPregnancyVisit` | `src/db/schema/health-care-lines.ts` |
| public | `HealthPrescription` | `src/db/schema/health-prescriptions.ts` |
| public | `HealthPrescriptionItem` | `src/db/schema/health-prescriptions.ts` |
| public | `HealthPrescriptionTemplate` | `src/db/schema/health-prescriptions.ts` |
| public | `HealthProcedurePriceItem` | `src/db/schema/health-production.ts` |
| public | `HealthProcedurePriceTable` | `src/db/schema/health-production.ts` |
| public | `HealthProductionCompetence` | `src/db/schema/health-production.ts` |
| public | `HealthProductionCriticism` | `src/db/schema/health-production.ts` |
| public | `HealthProductionFact` | `src/db/schema/health-production.ts` |
| public | `HealthProductionFactRevision` | `src/db/schema/health-production.ts` |
| public | `HealthProductionTarget` | `src/db/schema/health-production.ts` |
| public | `HealthProfessionalAssignment` | `src/db/schema/health-workforce.ts` |
| public | `HealthProfessionalShift` | `src/db/schema/health-workforce.ts` |
| public | `HealthProviderAccess` | `src/db/schema/health-regulation.ts` |
| public | `HealthReception` | `src/db/schema/health-reception.ts` |
| public | `HealthReferral` | `src/db/schema/health-care.ts` |
| public | `HealthRegistrationStatusHistory` | `src/db/schema/health-administration.ts` |
| public | `HealthRegulationAttachment` | `src/db/schema/health-regulation.ts` |
| public | `HealthRegulationEvent` | `src/db/schema/health-regulation.ts` |
| public | `HealthRegulationQuota` | `src/db/schema/health-regulation.ts` |
| public | `HealthRegulationQuotaAllocation` | `src/db/schema/health-regulation.ts` |
| public | `HealthRegulationRequest` | `src/db/schema/health-regulation.ts` |
| public | `HealthRegulationReview` | `src/db/schema/health-regulation.ts` |
| public | `HealthRegulationSector` | `src/db/schema/health-regulation.ts` |
| public | `HealthScheduleBlock` | `src/db/schema/health-agenda.ts` |
| public | `HealthSchedulingGroup` | `src/db/schema/health-administration.ts` |
| public | `HealthService` | `src/db/schema/health-administration.ts` |
| public | `HealthServiceAssignment` | `src/db/schema/health-administration.ts` |
| public | `HealthSpecialty` | `src/db/schema/health-administration.ts` |
| public | `HealthSpecialtyGroup` | `src/db/schema/health-administration.ts` |
| public | `HealthSpecialtyGroupMember` | `src/db/schema/health-administration.ts` |
| public | `HealthSpecialtyGroupService` | `src/db/schema/health-administration.ts` |
| public | `HealthSpecialtyProcedureRule` | `src/db/schema/health-care.ts` |
| public | `HealthStandardDocument` | `src/db/schema/health-documents.ts` |
| public | `HealthStockPolicy` | `src/db/schema/health-catalog-tools.ts` |
| public | `HealthStockReceipt` | `src/db/schema/health-management-operations.ts`, `src/db/schema/health-pharmacy-pages.ts`, `src/db/schema/health-pharmacy.ts`, `src/db/schema/health-stock.ts` |
| public | `HealthStockReceiptItem` | `src/db/schema/health-management-operations.ts`, `src/db/schema/health-pharmacy-pages.ts`, `src/db/schema/health-stock.ts` |
| public | `HealthStockTransfer` | `src/db/schema/health-management-operations.ts`, `src/db/schema/health-pharmacy.ts`, `src/db/schema/health-stock.ts` |
| public | `HealthStockTransferItem` | `src/db/schema/health-management-operations.ts`, `src/db/schema/health-pharmacy.ts`, `src/db/schema/health-stock.ts` |
| public | `HealthSusFile` | `src/db/schema/health-production.ts` |
| public | `HealthSusImportBatch` | `src/db/schema/health-catalogs.ts` |
| public | `HealthSusImportIssue` | `src/db/schema/health-catalogs.ts` |
| public | `HealthSusProcedure` | `src/db/schema/health-catalogs.ts` |
| public | `HealthSusProcedureReference` | `src/db/schema/health-catalogs.ts` |
| public | `HealthSusReference` | `src/db/schema/health-catalogs.ts` |
| public | `HealthTeamClassificationEvent` | `src/db/schema/health-workforce.ts` |
| public | `HealthTfdBenefit` | `src/db/schema/health-tfd.ts` |
| public | `HealthTfdClinicalReport` | `src/db/schema/health-tfd.ts` |
| public | `HealthTfdPassenger` | `src/db/schema/health-tfd.ts` |
| public | `HealthTfdPassengerRemoval` | `src/db/schema/health-tfd.ts` |
| public | `HealthTfdReportRevision` | `src/db/schema/health-tfd.ts` |
| public | `HealthTfdReportSupplement` | `src/db/schema/health-tfd.ts` |
| public | `HealthTfdRequest` | `src/db/schema/health-tfd.ts` |
| public | `HealthTfdRequestEvent` | `src/db/schema/health-tfd.ts` |
| public | `HealthTfdTrip` | `src/db/schema/health-tfd.ts` |
| public | `HealthTfdTripEvent` | `src/db/schema/health-tfd.ts` |
| public | `HealthTherapySession` | `src/db/schema/health-care-lines.ts` |
| public | `HealthTreatmentAuthorization` | `src/db/schema/health-treatment.ts` |
| public | `HealthTreatmentReport` | `src/db/schema/health-treatment.ts` |
| public | `HealthTreatmentReportEvent` | `src/db/schema/health-treatment.ts` |
| public | `HealthTreatmentReportProcedure` | `src/db/schema/health-treatment.ts` |
| public | `HealthTreatmentReportRevision` | `src/db/schema/health-treatment.ts` |
| public | `HealthTriage` | `src/db/schema/health-agenda.ts` |
| public | `HealthUnitCeiling` | `src/db/schema/health-production.ts` |
| public | `HealthUnitSpecialty` | `src/db/schema/health-administration.ts` |
| public | `HealthUserAccessScope` | `src/db/schema/health-access.ts` |
| public | `HealthVaccinationCampaign` | `src/db/schema/health-vaccination.ts` |
| public | `HealthVaccinationCardEvent` | `src/db/schema/health-vaccination.ts` |
| public | `HealthVaccineAdverseEvent` | `src/db/schema/health-vaccination.ts` |
| public | `HealthVaccineAdverseFollowup` | `src/db/schema/health-vaccination.ts` |
| public | `HealthVaccineCalendarRule` | `src/db/schema/health-vaccination.ts` |
| public | `HealthVaccineCodeMapping` | `src/db/schema/health-vaccination.ts` |
| public | `HealthVaccineInteraction` | `src/db/schema/health-vaccination.ts` |
| public | `HealthVaccineLotProfile` | `src/db/schema/health-vaccination.ts` |
| public | `HealthVaccineManufacturer` | `src/db/schema/health-vaccination.ts` |
| public | `HealthVaccineOpenedVial` | `src/db/schema/health-vaccination.ts` |
| public | `HealthVigilanceComplaint` | `src/db/schema/health-management-operations.ts` |
| public | `HealthVigilanceEstablishment` | `src/db/schema/health-management-operations.ts` |
| public | `HealthVigilanceInspection` | `src/db/schema/health-management-operations.ts` |
| public | `HealthVigilanceInspectionItem` | `src/db/schema/health-management-operations.ts` |
| public | `HealthVigilanceLicense` | `src/db/schema/health-management-operations.ts` |
| public | `HealthWaitlist` | `src/db/schema/health-agenda.ts` |
| public | `HealthWaitlistEvent` | `src/db/schema/health-agenda.ts` |
| public | `HrBudgetUnitEntityMapping` |  |
| public | `HrConsignmentAgreement` | `src/db/schema/personnel-consignment.ts` |
| public | `HrConsignmentEntry` | `src/db/schema/personnel-consignment.ts` |
| public | `HrConsignmentInstallment` | `src/db/schema/personnel-consignment.ts` |
| public | `HrEmployeeDocument` | `src/db/schema/personnel-reference-records.ts` |
| public | `HrEmployeeFunctionalPeriod` | `src/db/schema/sst-functional.ts` |
| public | `HrPayrollConfigurationChange` | `src/db/schema/personnel-configuration.ts` |
| public | `HrPortalRequestBinding` | `src/db/schema/employee-portal.ts` |
| public | `HrRecruitmentApplication` | `src/db/schema/personnel-recruitment.ts` |
| public | `HrRetirementAssessment` | `src/db/schema/personnel-functional-management.ts` |
| public | `HrRoleLegalHistory` | `src/db/schema/personnel-legal.ts` |
| public | `HrTimeCertificate` | `src/db/schema/personnel-functional-management.ts` |
| public | `HrVacationConcessionSource` |  |
| public | `Infraction` | `src/db/schema/taxation-core.ts` |
| public | `InstrumentInstallment` | `src/db/schema/procurement-instruments.ts`, `src/db/schema/transparency-sources.ts` |
| public | `InstrumentMeasurement` | `src/db/schema/procurement-instruments.ts` |
| public | `InstrumentMeasurementItem` | `src/db/schema/procurement-instruments.ts` |
| public | `InstrumentParty` | `src/db/schema/procurement-instruments.ts` |
| public | `InstrumentResponsibilityGroup` | `src/db/schema/procurement-instruments.ts` |
| public | `IntegrationConnection` | `src/db/schema/integrations.ts`, `src/db/schema/personnel-external-operations.ts` |
| public | `IntegrationRun` | `src/db/schema/integrations.ts` |
| public | `InternalControlEvent` | `src/db/schema/finance-setup-tools.ts`, `src/db/schema/internal-control.ts` |
| public | `InternalControlFinding` | `src/db/schema/internal-control.ts` |
| public | `InternalControlPlan` | `src/db/schema/finance-setup-tools.ts`, `src/db/schema/internal-control.ts` |
| public | `InvestmentAllocation` | `src/db/schema/finance-investments.ts` |
| public | `Invoice` | `src/db/schema/taxation-nfse.ts` |
| public | `ItbiDeclaration` | `src/db/schema/portal-fiscal.ts`, `src/db/schema/tax-configured-records-operations.ts`, `src/db/schema/tax-itbi.ts`, `src/db/schema/taxation-pages.ts` |
| public | `ItbiEvent` | `src/db/schema/tax-itbi.ts`, `src/db/schema/taxation-pages.ts` |
| public | `ItbiParty` | `src/db/schema/portal-fiscal.ts`, `src/db/schema/tax-itbi.ts`, `src/db/schema/taxation-pages.ts` |
| public | `Lead` | `src/db/schema/leads.ts` |
| public | `LearningActivity` | `src/db/schema/education-teaching.ts` |
| public | `LearningQuestion` | `src/db/schema/education-teaching.ts` |
| public | `LearningSubmission` | `src/db/schema/education-teaching.ts` |
| public | `Leave` | `src/db/schema/municipal-setup-tools.ts`, `src/db/schema/personnel-external-operations.ts`, `src/db/schema/personnel-records.ts` |
| public | `LegacyLegalTextSource` | `src/db/schema/legal-documents.ts` |
| public | `LegalReportSigner` | `src/db/schema/master-data.ts` |
| public | `LegalRepresentative` | `src/db/schema/procurement-instruments.ts` |
| public | `LegalTextComment` | `src/db/schema/master-data.ts` |
| public | `LegalTextDatabaseDocument` | `src/db/schema/legal-documents.ts` |
| public | `LegalTextDatabaseDocumentBlob` | `src/db/schema/legal-documents.ts` |
| public | `LegalTextDocument` | `src/db/schema/legal-documents.ts` |
| public | `LegalTextRelation` | `src/db/schema/master-data.ts` |
| public | `License` | `src/db/schema/taxation-registry.ts` |
| public | `MasterDataConsistencyIssue` | `src/db/schema/master-data.ts` |
| public | `MasterDataConsistencyRun` | `src/db/schema/master-data.ts` |
| public | `MaterialRequest` | `src/db/schema/assets-requests.ts` |
| public | `MaterialRequestItem` | `src/db/schema/assets-requests.ts` |
| public | `MaterialRequestRevision` | `src/db/schema/assets-catalogs.ts` |
| public | `MaterialStockValuation` | `src/db/schema/assets-stock.ts` |
| public | `MaterialStockValuationEvent` | `src/db/schema/assets-stock.ts` |
| public | `MaterialSubcategory` | `src/db/schema/assets-stock.ts` |
| public | `MedicalRecord` | `src/db/schema/health-care.ts` |
| public | `MedicineDispensation` | `src/db/schema/health-pharmacy.ts` |
| public | `MedicineDosageTemplate` |  |
| public | `MedicineInteraction` |  |
| public | `MonthlyAccountingClose` | `src/db/schema/finance-accounting.ts`, `src/db/schema/finance-fiscal-indices.ts` |
| public | `MonthlyAccountingCloseEvent` | `src/db/schema/finance-accounting.ts` |
| public | `MonthlyDisbursementSchedule` | `src/db/schema/finance-legacy-budget.ts` |
| public | `MunicipalCostAllocation` | `src/db/schema/finance-costs.ts` |
| public | `MunicipalCostItem` | `src/db/schema/finance-costs.ts`, `src/db/schema/finance-setup-tools.ts` |
| public | `MunicipalCostMovement` | `src/db/schema/finance-costs.ts` |
| public | `MunicipalCostObject` | `src/db/schema/finance-costs.ts`, `src/db/schema/finance-setup-tools.ts` |
| public | `MunicipalCostObjectItem` | `src/db/schema/finance-costs.ts`, `src/db/schema/finance-setup-tools.ts` |
| public | `MunicipalCostPolicy` | `src/db/schema/finance-costs.ts`, `src/db/schema/finance-setup-tools.ts` |
| public | `MunicipalCostRule` | `src/db/schema/finance-costs.ts` |
| public | `MunicipalCostSource` | `src/db/schema/finance-costs.ts` |
| public | `MunicipalCostSourceReduction` | `src/db/schema/finance-costs.ts` |
| public | `MunicipalFiscalIndexDefinition` | `src/db/schema/finance-fiscal-indices.ts` |
| public | `MunicipalPersonnelFiscalDefinition` | `src/db/schema/finance-pages.ts`, `src/db/schema/finance-personnel-fiscal.ts` |
| public | `NfseCorrectionLetter` | `src/db/schema/taxation-nfse.ts` |
| public | `NfseCredentialEvent` | `src/db/schema/tax-inspection-operations.ts` |
| public | `NfseCredentialRequest` | `src/db/schema/tax-inspection-operations.ts` |
| public | `NfseDeductionConsumption` | `src/db/schema/tax-inspection-operations.ts` |
| public | `NfseDeductionCredit` | `src/db/schema/tax-inspection-operations.ts` |
| public | `NfseDmsDeclaration` | `src/db/schema/tax-inspection-operations.ts` |
| public | `NfseEvent` | `src/db/schema/taxation-nfse.ts` |
| public | `NfseInvoiceData` | `src/db/schema/taxation-nfse.ts` |
| public | `NfseRpsBatch` | `src/db/schema/tax-inspection-operations.ts` |
| public | `NfseRpsItem` | `src/db/schema/tax-inspection-operations.ts` |
| public | `ObrasMedicao` | `src/db/schema/infrastructure.ts` |
| public | `ObrasServicoCompra` | `src/db/schema/infrastructure.ts` |
| public | `ObrasServicoDocumento` | `src/db/schema/infrastructure.ts` |
| public | `ObrasServicoMaterial` | `src/db/schema/infrastructure.ts` |
| public | `OfficialDiary` | `src/db/schema/portal-content.ts` |
| public | `OfficialPublication` |  |
| public | `OmbudsmanAccess` | `src/db/schema/attendance-portals.ts` |
| public | `OmbudsmanDocument` | `src/db/schema/attendance-portals.ts` |
| public | `OmbudsmanIdentity` | `src/db/schema/attendance-portals.ts` |
| public | `PayableCarryForward` | `src/db/schema/finance-payables.ts`, `src/db/schema/transparency-financial.ts` |
| public | `PayableCarryForwardEvent` | `src/db/schema/finance-payables.ts`, `src/db/schema/transparency-financial.ts` |
| public | `PayableCarryForwardSettlementLink` | `src/db/schema/finance-payables.ts` |
| public | `Payment` | `src/db/schema/finance-payments.ts`, `src/db/schema/planning-financial-sources.ts`, `src/db/schema/procurement-finance.ts`, `src/db/schema/transparency-financial.ts` |
| public | `PaymentRetention` | `src/db/schema/finance-payments.ts` |
| public | `PayrollBenefit` | `src/db/schema/municipal-setup-tools.ts`, `src/db/schema/personnel-external-operations.ts`, `src/db/schema/sst-benefits.ts` |
| public | `PedagogicalAttempt` | `src/db/schema/education-interactive.ts` |
| public | `PedagogicalCatalogItem` | `src/db/schema/education-interactive.ts` |
| public | `PedagogicalRelease` | `src/db/schema/education-interactive.ts` |
| public | `PersonMergeLedger` | `src/db/schema/person-merge.ts` |
| public | `PersonMergeRequest` | `src/db/schema/person-merge.ts` |
| public | `PharmacyRequest` | `src/db/schema/health-pharmacy.ts` |
| public | `PharmacyRequestEvent` | `src/db/schema/health-pharmacy.ts` |
| public | `PharmacyRequestFulfillment` | `src/db/schema/health-pharmacy.ts` |
| public | `PharmacyRequestItem` | `src/db/schema/health-pharmacy.ts` |
| public | `PlanningAmendment` | `src/db/schema/finance-legacy-budget.ts` |
| public | `PlanningAmendmentItem` | `src/db/schema/planning-catalog-operations.ts`, `src/db/schema/planning-pages.ts` |
| public | `PlanningAnnualProgram` | `src/db/schema/planning-legal.ts` |
| public | `PlanningBudgetLine` | `src/db/schema/municipal-setup-tools.ts`, `src/db/schema/planning-budget.ts`, `src/db/schema/transparency-planning.ts` |
| public | `PlanningCalculationMemory` | `src/db/schema/municipal-setup-tools.ts`, `src/db/schema/planning-legal.ts` |
| public | `PlanningCatalogEntry` | `src/db/schema/finance-setup-tools.ts`, `src/db/schema/municipal-setup-tools.ts`, `src/db/schema/planning-catalog.ts`, `src/db/schema/planning-legal.ts` |
| public | `PlanningCatalogVersion` | `src/db/schema/finance-setup-tools.ts`, `src/db/schema/municipal-setup-tools.ts`, `src/db/schema/planning-catalog.ts`, `src/db/schema/planning-legal.ts` |
| public | `PlanningCreditBatch` | `src/db/schema/planning-budget.ts` |
| public | `PlanningCreditLine` | `src/db/schema/planning-budget.ts` |
| public | `PlanningDocumentLink` | `src/db/schema/planning-budget.ts` |
| public | `PlanningFiscalRule` | `src/db/schema/planning-legal.ts` |
| public | `PlanningImportBatch` | `src/db/schema/planning-catalog-operations.ts` |
| public | `PlanningInstrumentSource` | `src/db/schema/planning-legal.ts` |
| public | `PlanningIntegrationCommand` | `src/db/schema/planning-legal.ts` |
| public | `PlanningLegislativeAmendment` | `src/db/schema/planning-catalog-operations.ts`, `src/db/schema/planning-pages.ts` |
| public | `PlanningLegislativeLink` | `src/db/schema/planning-legal.ts` |
| public | `PlanningLineMovement` | `src/db/schema/planning-budget.ts`, `src/db/schema/transparency-planning.ts` |
| public | `PlanningPhysicalEvent` | `src/db/schema/planning-legal.ts` |
| public | `PlanningPlannedWork` | `src/db/schema/planning-legal.ts` |
| public | `PlanningPublicationEvent` | `src/db/schema/planning-publication-operations.ts` |
| public | `PlanningQuota` | `src/db/schema/planning-budget.ts` |
| public | `PlanningQuotaEvent` | `src/db/schema/planning-budget.ts` |
| public | `PlanningRegionalAction` | `src/db/schema/planning-regional-actions.ts` |
| public | `PlanningReportPublication` | `src/db/schema/planning-publication-operations.ts`, `src/db/schema/transparency-planning.ts` |
| public | `PlanningReportSnapshot` | `src/db/schema/planning-pages.ts`, `src/db/schema/transparency-planning.ts` |
| public | `PlanningRevenueAllocation` | `src/db/schema/planning-legal.ts` |
| public | `PlanningRevenueWaiver` | `src/db/schema/planning-legal.ts` |
| public | `PlanningVersion` | `src/db/schema/planning-legal.ts` |
| public | `PortalBanner` | `src/db/schema/portal-content.ts` |
| public | `PortalScheduleRequest` | `src/db/schema/portal-services.ts` |
| public | `PortalServiceConfiguration` | `src/db/schema/portal-services.ts` |
| public | `PortalServiceFavorite` | `src/db/schema/portal-services.ts` |
| public | `PortalServiceRating` | `src/db/schema/portal-services.ts` |
| public | `PortalServiceRequest` | `src/db/schema/portal-services.ts` |
| public | `PortalServiceRequestEvent` | `src/db/schema/portal-services.ts` |
| public | `PortalServiceSchedule` | `src/db/schema/portal-services.ts` |
| public | `PortalServiceUpload` | `src/db/schema/portal-services.ts` |
| public | `PortalServiceVersion` | `src/db/schema/portal-services.ts` |
| public | `PreEnrollment` | `src/db/schema/education-admissions.ts` |
| public | `PreEnrollmentProcess` | `src/db/schema/education-admissions.ts` |
| public | `ProcessCitizenAccess` | `src/db/schema/citizen-access.ts` |
| public | `ProcessDepartmentMetadata` | `src/db/schema/process-reference-catalog.ts` |
| public | `ProcessDispatch` | `src/db/schema/processes.ts` |
| public | `ProcessDocument` | `src/db/schema/processes.ts` |
| public | `ProcessJudicialCase` | `src/db/schema/process-judicial.ts` |
| public | `ProcessJudicialCaseEvent` | `src/db/schema/process-judicial.ts` |
| public | `ProcessJunction` | `src/db/schema/process-junction.ts` |
| public | `ProcessPrintSetting` | `src/db/schema/process-reference-catalog.ts` |
| public | `ProcessReferenceCatalog` | `src/db/schema/process-reference-catalog.ts` |
| public | `ProcessRegistrationDetail` | `src/db/schema/process-reference-catalog.ts` |
| public | `ProcessWorkflowStage` | `src/db/schema/processes.ts` |
| public | `PropertyValuation` | `src/db/schema/taxation-pages.ts` |
| public | `PublicNotice` | `src/db/schema/transparency.ts` |
| public | `PublicityCampaign` | `src/db/schema/finance-pages.ts` |
| public | `PurchaseDemandEvent` | `src/db/schema/procurement-requests.ts` |
| public | `PurchaseDemandVersion` | `src/db/schema/procurement-requests.ts` |
| public | `PurchasePlanningAiSuggestionLog` | `src/db/schema/procurement-requests.ts` |
| public | `PurchasePlanningDocumentVersion` | `src/db/schema/procurement-requests.ts` |
| public | `Revenue` | `src/db/schema/finance-pages.ts`, `src/db/schema/finance-revenues.ts`, `src/db/schema/planning-financial-sources.ts`, `src/db/schema/transparency-financial.ts` |
| public | `PurchaseReceiptItem` | `src/db/schema/procurement-requests.ts` |
| public | `PurchaseReceipt` | `src/db/schema/procurement-requests.ts` |
| public | `RetentionRule` | `src/db/schema/finance-settlements.ts` |
| public | `RevenueResourceRedistribution` | `src/db/schema/finance-revenues.ts`, `src/db/schema/planning-financial-sources.ts` |
| public | `ReportTemplate` | `src/db/schema/report-template.ts` |
| public | `RevenueReversal` | `src/db/schema/finance-pages.ts`, `src/db/schema/finance-revenues.ts`, `src/db/schema/planning-financial-sources.ts` |
| public | `RevenueNature` | `src/db/schema/finance-setup-tools.ts`, `src/db/schema/municipal-setup-tools.ts`, `src/db/schema/planning-legal.ts`, `src/db/schema/transparency-planning.ts` |
| public | `PurchaseRequestItemBudgetAllocation` | `src/db/schema/procurement-requests.ts` |
| public | `PurchaseProcessItemOrigin` | `src/db/schema/procurement-requests.ts` |
| public | `PurchaseProcessRequestOrigin` | `src/db/schema/procurement-requests.ts` |
| public | `SatisfactionSurvey` |  |
| public | `SchoolBus` |  |
| public | `SchoolMeal` | `src/db/schema/education-meals.ts` |
| public | `SegurancaInfracao` | `src/db/schema/security-mobility.ts` |
| public | `Settlement` | `src/db/schema/finance-settlements.ts`, `src/db/schema/procurement-finance.ts`, `src/db/schema/transparency-financial.ts` |
| public | `SettlementRetention` | `src/db/schema/finance-settlements.ts`, `src/db/schema/procurement-finance.ts` |
| public | `SimplesDivergence` | `src/db/schema/tax-collection-operations.ts` |
| public | `SimplesExclusionCase` | `src/db/schema/tax-actions.ts`, `src/db/schema/tax-collection-operations.ts` |
| public | `SimplesFiscalRecord` | `src/db/schema/tax-collection-operations.ts` |
| public | `SimplesImportBatch` | `src/db/schema/tax-collection-operations.ts` |
| public | `SimplesOptionPeriod` | `src/db/schema/tax-collection-operations.ts` |
| public | `SimplesPaymentAllocation` | `src/db/schema/tax-collection-operations.ts` |
| public | `SimplesRegularizationEvent` | `src/db/schema/tax-collection-operations.ts` |
| public | `SocialBenefitConcession` | `src/db/schema/social.ts` |
| public | `SocialCadastreSnapshot` | `src/db/schema/social-operation-models.ts` |
| public | `SocialIssuedDocument` | `src/db/schema/social-operation-models.ts` |
| public | `SocialMessageDispatch` | `src/db/schema/social-operation-models.ts` |
| public | `SocialVisitAttendance` | `src/db/schema/social-operation-models.ts` |
| public | `SpecializedCatalogItem` | `src/db/schema/health-diagnostics.ts` |
| public | `SpecializedDistribution` | `src/db/schema/health-diagnostics.ts` |
| public | `SpecializedPlanEntry` | `src/db/schema/health-care-lines.ts`, `src/db/schema/health-diagnostics.ts` |
| public | `SpecializedQuota` | `src/db/schema/health-diagnostics.ts` |
| public | `SpecializedTeamSchedule` | `src/db/schema/health-diagnostics.ts` |
| public | `SpecializedTherapeuticPlan` | `src/db/schema/health-care-lines.ts`, `src/db/schema/health-diagnostics.ts` |
| public | `SstAccessGrant` | `src/db/schema/sst-access.ts` |
| public | `SstAnamnesis` | `src/db/schema/sst-clinical.ts` |
| public | `SstAso` | `src/db/schema/sst-clinical.ts` |
| public | `SstAsoCorrection` |  |
| public | `SstAsoDocument` |  |
| public | `SstAsoFlowSettings` |  |
| public | `SstAsoFlowSource` |  |
| public | `SstBenefitBeneficiary` | `src/db/schema/sst-benefits.ts` |
| public | `SstBenefitCancellation` |  |
| public | `SstBenefitEntry` | `src/db/schema/sst-benefits.ts` |
| public | `SstBenefitPayrollMapping` |  |
| public | `SstBenefitPayrollOrigin` | `src/db/schema/personnel-payroll-inputs.ts` |
| public | `SstBenefitPayrollScope` | `src/db/schema/personnel-external-operations.ts` |
| public | `SstCat` | `src/db/schema/sst-accidents.ts` |
| public | `SstCatEvidence` | `src/db/schema/sst-accidents.ts` |
| public | `SstCatLayoutMedical` |  |
| public | `SstCatLayoutVersion` |  |
| public | `SstCatLedger` |  |
| public | `SstCertificateDecisionRevision` |  |
| public | `SstCertificateDocument` | `src/db/schema/sst-certificates.ts` |
| public | `SstCertificateFunctionalSource` |  |
| public | `SstCertificateLeaveConfirmation` |  |
| public | `SstClinicalRecord` | `src/db/schema/sst-clinical.ts` |
| public | `SstClosureEmission` |  |
| public | `SstDisciplineGrant` | `src/db/schema/sst-access.ts` |
| public | `SstElectionBallot` |  |
| public | `SstElectionCandidate` |  |
| public | `SstElectionElector` |  |
| public | `SstElectionTurnout` |  |
| public | `SstEquipment` |  |
| public | `SstEquipmentDelivery` |  |
| public | `SstEquipmentDeliveryItem` |  |
| public | `SstEquipmentEvent` |  |
| public | `SstEquipmentPolicy` |  |
| public | `SstEquipmentRequirement` |  |
| public | `SstEsocialAttempt` |  |
| public | `SstEsocialConfiguration` |  |
| public | `SstEsocialEvent` |  |
| public | `SstEsocialEvidence` |  |
| public | `SstFoundationalRevocation` |  |
| public | `SstHealthPlan` | `src/db/schema/sst-benefits.ts` |
| public | `SstLeavePayrollOrigin` | `src/db/schema/personnel-payroll-inputs.ts` |
| public | `SstLeavePayrollRuleVersion` |  |
| public | `SstLeavePayrollScopeEvidence` |  |
| public | `SstMedicalAssessment` | `src/db/schema/sst-certificates.ts` |
| public | `SstMedicalBoard` | `src/db/schema/sst-agenda.ts` |
| public | `SstMedicalBoardMember` | `src/db/schema/sst-agenda.ts` |
| public | `SstMedicalCertificate` | `src/db/schema/sst-certificates.ts` |
| public | `SstOccupationalExam` | `src/db/schema/sst-clinical.ts` |
| public | `SstOccupationalProgram` | `src/db/schema/sst-programs.ts` |
| public | `SstPlannedShift` | `src/db/schema/sst-agenda.ts` |
| public | `SstProfessionalRole` | `src/db/schema/sst-clinical.ts` |
| public | `SstProgramExposureGroup` | `src/db/schema/sst-programs.ts` |
| public | `SstQuestionnaireVersion` | `src/db/schema/sst-clinical.ts` |
| public | `SstReasonRegimePolicy` |  |
| public | `SstRestriction` | `src/db/schema/sst-restrictions.ts` |
| public | `SstRestrictionEmailOutbox` |  |
| public | `SstRestrictionFollowup` | `src/db/schema/sst-restrictions.ts` |
| public | `SstRoleAttribute` |  |
| public | `SstScheduleBlock` | `src/db/schema/sst-agenda.ts` |
| public | `SstServiceOrder` |  |
| public | `SstTechnicalResponsibility` |  |
| public | `SstVaccination` | `src/db/schema/sst-clinical.ts` |
| public | `SuasProntuarioRma` | `src/db/schema/social.ts` |
| public | `TaxActiveDebtEvent` | `src/db/schema/tax-actions.ts`, `src/db/schema/tax-active-debt.ts` |
| public | `TaxAnnualBatch` | `src/db/schema/tax-annual.ts` |
| public | `TaxAnnualBatchItem` | `src/db/schema/tax-annual.ts` |
| public | `TaxAssessment` | `src/db/schema/portal-fiscal.ts`, `src/db/schema/taxation-core.ts` |
| public | `TaxAuditCrossCheck` | `src/db/schema/taxation-audit.ts` |
| public | `TaxBenefitGrant` | `src/db/schema/planning-execution-operations.ts`, `src/db/schema/tax-actions.ts`, `src/db/schema/tax-annual.ts`, `src/db/schema/tax-collection-operations.ts`, `src/db/schema/transparency-sources.ts` |
| public | `TaxBenefitRule` | `src/db/schema/tax-collection-operations.ts`, `src/db/schema/taxation-pages.ts`, `src/db/schema/transparency-sources.ts` |
| public | `TaxBurialMovement` | `src/db/schema/cemeteries.ts` |
| public | `TaxCaseLink` |  |
| public | `TaxCdaVersion` | `src/db/schema/tax-actions.ts`, `src/db/schema/tax-active-debt.ts` |
| public | `TaxCertificate` | `src/db/schema/tax-actions.ts`, `src/db/schema/taxation-pages.ts` |
| public | `TaxCertificateEvaluation` | `src/db/schema/tax-final-helpers.ts` |
| public | `TaxCollectionAction` | `src/db/schema/tax-collection-operations.ts` |
| public | `TaxCollectionActionEvent` | `src/db/schema/tax-collection-operations.ts` |
| public | `TaxCollectionPortfolio` | `src/db/schema/tax-collection-operations.ts` |
| public | `TaxCollectionPortfolioItem` | `src/db/schema/tax-collection-operations.ts` |
| public | `TaxCollectionProfile` |  |
| public | `TaxCollectionRule` |  |
| public | `TaxDaPortfolio` | `src/db/schema/tax-active-debt.ts` |
| public | `TaxDaPortfolioItem` | `src/db/schema/tax-active-debt.ts` |
| public | `TaxDebtSuspension` | `src/db/schema/tax-active-debt.ts` |
| public | `TaxDeceased` | `src/db/schema/cemeteries.ts` |
| public | `TaxDeclaration` | `src/db/schema/tax-active-debt.ts`, `src/db/schema/tax-inspection-operations.ts` |
| public | `TaxExecutionBatch` | `src/db/schema/tax-active-debt.ts` |
| public | `TaxExecutionCase` | `src/db/schema/tax-active-debt.ts` |
| public | `TaxExecutionEvent` | `src/db/schema/tax-active-debt.ts` |
| public | `TaxFinancialMapping` | `src/db/schema/finance-setup-tools.ts`, `src/db/schema/tax-accounting.ts` |
| public | `TaxGraveConcession` | `src/db/schema/cemeteries.ts` |
| public | `TaxGuide` | `src/db/schema/portal-fiscal.ts`, `src/db/schema/taxation-core.ts` |
| public | `TaxInstallmentAgreement` | `src/db/schema/tax-actions.ts`, `src/db/schema/tax-active-debt.ts`, `src/db/schema/tax-collection-operations.ts` |
| public | `TaxInstallmentDebt` | `src/db/schema/tax-collection-operations.ts` |
| public | `TaxInstallmentEvent` | `src/db/schema/tax-collection-operations.ts` |
| public | `TaxInstallmentPaymentAllocation` | `src/db/schema/tax-collection-operations.ts` |
| public | `TaxInstallmentQuota` | `src/db/schema/tax-actions.ts`, `src/db/schema/tax-collection-operations.ts` |
| public | `TaxInstallmentRule` | `src/db/schema/tax-actions.ts`, `src/db/schema/tax-collection-operations.ts` |
| public | `TaxIntegrationEvent` | `src/db/schema/tax-accounting.ts`, `src/db/schema/tax-catalog-rules.ts`, `src/db/schema/taxation-pages.ts` |
| public | `TaxParameter` | `src/db/schema/tax-catalog-rules.ts`, `src/db/schema/taxation-pages.ts` |
| public | `TaxPasswordPreference` | `src/db/schema/tax-password-confirmation.ts` |
| public | `TaxPayment` | `src/db/schema/portal-fiscal.ts`, `src/db/schema/tax-accounting.ts`, `src/db/schema/taxation-pages.ts` |
| public | `TaxPrizeCoupon` | `src/db/schema/tax-collection-operations.ts` |
| public | `TaxPrizeDraw` | `src/db/schema/tax-collection-operations.ts` |
| public | `TaxPrizeExecution` | `src/db/schema/tax-collection-operations.ts` |
| public | `TaxPrizeWinner` | `src/db/schema/tax-collection-operations.ts` |
| public | `TaxProtestBatch` | `src/db/schema/tax-active-debt.ts` |
| public | `TaxProtestItem` | `src/db/schema/tax-active-debt.ts` |
| public | `TaxRegistryMerge` |  |
| public | `TaxRevenueIntegrationEvent` | `src/db/schema/finance-revenues.ts` |
| public | `TaxServiceRequest` | `src/db/schema/portal-services.ts`, `src/db/schema/tax-catalog-rules.ts` |
| public | `TaxpayerPortalAccess` | `src/db/schema/citizen-access.ts`, `src/db/schema/tax-collection-operations.ts`, `src/db/schema/tax-economic.ts` |
| public | `TeacherAcademicRecord` | `src/db/schema/education-teaching.ts` |
| public | `TeacherClassAssignment` | `src/db/schema/education-core.ts` |
| public | `TicketDocument` | `src/db/schema/attendance-portals.ts` |
| public | `TicketInteraction` | `src/db/schema/attendance-portals.ts` |
| public | `TicketMovement` | `src/db/schema/attendance-portals.ts` |
| public | `TrafficInfractionTicket` | `src/db/schema/security-mobility.ts` |
| public | `TransparencyAccess` | `src/db/schema/transparency.ts` |
| public | `TransparencyCitizenAppeal` | `src/db/schema/citizen-channels.ts` |
| public | `TransparencyCriterion` | `src/db/schema/transparency.ts` |
| public | `TransparencyCriterionEvidence` | `src/db/schema/transparency.ts` |
| public | `TransparencyNativeBinding` | `src/db/schema/transparency.ts` |
| public | `TransparencyPageFeedback` | `src/db/schema/transparency.ts` |
| public | `TransparencyPublication` | `src/db/schema/transparency.ts` |
| public | `TransparencySatisfaction` | `src/db/schema/citizen-channels.ts` |
| public | `TreasuryMovement` | `src/db/schema/finance-reconciliation.ts`, `src/db/schema/finance-setup-tools.ts`, `src/db/schema/planning-financial-sources.ts` |
| public | `TreasuryTransfer` | `src/db/schema/finance-pages.ts`, `src/db/schema/finance-revenues.ts` |
| public | `UsuarioModulo` | `src/db/schema/identity.ts` |
| public | `UsuarioPerfilAdicional` | `src/db/schema/user-additional-profiles.ts` |
| public | `VaccinationRecord` | `src/db/schema/health-vaccination.ts` |
| public | `Vaccine` | `src/db/schema/health-pharmacy.ts`, `src/db/schema/health-vaccination.ts` |
| public | `VafAccountant` | `src/db/schema/tax-collection-operations.ts` |
| public | `VafActivity` | `src/db/schema/tax-collection-operations.ts` |
| public | `VafCfopEntry` | `src/db/schema/tax-collection-operations.ts` |
| public | `VafCompany` | `src/db/schema/tax-collection-operations.ts` |
| public | `VafCompanyIndex` | `src/db/schema/tax-collection-operations.ts` |
| public | `VafCrossCheck` | `src/db/schema/tax-collection-operations.ts` |
| public | `VafEfdImport` | `src/db/schema/tax-collection-operations.ts` |
| public | `VafEstimate` | `src/db/schema/tax-collection-operations.ts` |
| public | `VafExercise` | `src/db/schema/tax-collection-operations.ts` |
| public | `VafGiaImport` | `src/db/schema/tax-collection-operations.ts` |
| public | `VafMonthlySummary` | `src/db/schema/tax-collection-operations.ts` |
| public | `VafMunicipalIndex` | `src/db/schema/tax-collection-operations.ts` |
| public | `VafNotification` | `src/db/schema/tax-collection-operations.ts` |
| public | `VafProtocol` | `src/db/schema/tax-collection-operations.ts` |
| public | `VafRepasse` | `src/db/schema/tax-collection-operations.ts` |
| public | `VafResult` | `src/db/schema/tax-collection-operations.ts` |
| public | `VafRule` | `src/db/schema/tax-collection-operations.ts` |
| public | `WaterMeterReading` | `src/db/schema/sanitation.ts` |
| public | `WithholdingPayable` | `src/db/schema/finance-payments.ts` |
| public | `YieldTransaction` | `src/db/schema/finance-investments.ts` |
| public | `_SchoolToSchoolBus` |  |
