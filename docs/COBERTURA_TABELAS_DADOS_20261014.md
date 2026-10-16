# Cobertura de tabelas — carga municipal

Captura: 2026-10-14T04:44:07.057Z

**871 tabelas inspecionadas; 297 com registros; 574 vazias.**

A cobertura conta registros existentes, não certifica completude funcional. A população literal de todas as tabelas ainda está em andamento. Novos dados desta carga são referências plausíveis autorizadas; dados legais, evidências e confirmações externas preservam seus estados e suas origens.

| Tabela | Registros | Relações obrigatórias |
| --- | ---: | --- |
| AcademicDocumentIssue | 0 | — |
| AcademicPeriod | 3 | school → School |
| AccountingEntry | 40 | account → AccountingPlan; author → Employee |
| AccountingEventCatalog | 273 | — |
| AccountingPlan | 88 | — |
| AccountingPostingRule | 273 | event → AccountingEventCatalog; debitAccount → AccountingPlan; creditAccount → AccountingPlan |
| AccountingTransaction | 20 | financialYear → FinancialYear; authorUsuario → Usuario |
| ActionPPA | 8 | program → ProgramPPA |
| ActiveDebt | 0 | taxpayer → Taxpayer |
| Address | 80 | — |
| AdministrativeUnit | 1 | secretariat → Secretariat |
| AnnualAccountingClose | 0 | financialYear → FinancialYear |
| AnnualBudgetExpenseFixation | 0 | annualBudgetLaw → AnnualBudgetLaw |
| AnnualBudgetLaw | 8 | financialYear → FinancialYear |
| AnnualBudgetRevenueForecast | 0 | annualBudgetLaw → AnnualBudgetLaw |
| Asset | 19 | category → AssetCategory |
| AssetCategory | 10 | — |
| AssetIntegrationPendingConfiguration | 0 | assetWriteOff → AssetWriteOff |
| AssetMaintenance | 2 | asset → Asset |
| AssetTransfer | 0 | asset → Asset |
| AssetValueAdjustment | 0 | asset → Asset |
| AssetValueHistory | 0 | asset → Asset |
| AssetWriteOff | 0 | asset → Asset |
| Attendance | 0 | diary → ClassDiary; student → Student |
| AttendanceRecord | 0 | employee → Employee |
| AuditEvent | 1173 | actorUsuario → Usuario |
| AutomatedBankDownload | 0 | — |
| Bank | 2 | — |
| BankAccount | 2 | — |
| BankBranch | 0 | bank → Bank |
| BankReconciliation | 0 | bankAccount → BankAccount |
| BankReconciliationAllocation | 0 | group → BankReconciliationAllocationGroup; statementItem → BankStatementItem; treasuryMovement → TreasuryMovement |
| BankReconciliationAllocationGroup | 0 | session → BankReconciliationSession; bankAccount → BankAccount |
| BankReconciliationMatch | 0 | — |
| BankReconciliationSession | 0 | — |
| BankStatementImport | 0 | bankAccount → BankAccount |
| BankStatementItem | 0 | — |
| BenefitConfig | 0 | — |
| Bidding | 0 | process → PurchaseProcess |
| BiddingAct | 0 | bidding → Bidding; actorUsuario → Usuario |
| BiddingAppointment | 0 | — |
| BiddingAppointmentAssignment | 0 | bidding → Bidding; appointment → BiddingAppointment |
| BiddingAppointmentMember | 0 | appointment → BiddingAppointment; employee → Employee |
| BiddingBid | 0 | biddingLot → BiddingLot; participant → BiddingParticipant; supplierPortalIdentity → SupplierPortalIdentity |
| BiddingEligibility | 0 | biddingLot → BiddingLot; participant → BiddingParticipant; decidedByUsuario → Usuario |
| BiddingLot | 0 | bidding → Bidding |
| BiddingLotItem | 0 | biddingLot → BiddingLot; purchaseProcessItem → PurchaseProcessItem |
| BiddingParticipant | 0 | bidding → Bidding; supplier → Supplier |
| BiddingPhase | 0 | bidding → Bidding |
| BiddingResult | 0 | biddingLot → BiddingLot; participant → BiddingParticipant; decidedByUsuario → Usuario |
| BimonthlyRevenueTarget | 0 | annualBudgetLaw → AnnualBudgetLaw |
| BudgetAppropriation | 4 | financialYear → FinancialYear; budgetUnit → BudgetUnit; expenseNature → ExpenseNature; resourceSource → ResourceSource |
| BudgetGuideline | 8 | financialYear → FinancialYear |
| BudgetGuidelinePriority | 0 | budgetGuideline → BudgetGuideline |
| BudgetGuidelineRisk | 0 | budgetGuideline → BudgetGuideline |
| BudgetMovement | 0 | appropriation → BudgetAppropriation |
| BudgetReservation | 0 | appropriation → BudgetAppropriation |
| BudgetUnit | 51 | secretariat → Secretariat |
| CadUnicoRecord | 0 | — |
| CalendarEvent | 3 | — |
| CamAdvisor | 0 | person → Person; cabinet → CamGabinete |
| CamAta | 0 | sessao → CamSessao |
| CamAudiencia | 0 | — |
| CamComissao | 3 | legislatura → CamLegislatura |
| CamComissaoMembro | 9 | comissao → CamComissao; vereador → CamVereador |
| CamDocumentoLegislativo | 0 | document → Document |
| CamGabinete | 9 | vereador → CamVereador |
| CamLegislatura | 1 | — |
| CamLei | 0 | — |
| CamMesaDiretora | 3 | legislatura → CamLegislatura; vereador → CamVereador |
| CamParecer | 0 | proposicao → CamProposicao |
| CamPauta | 4 | sessao → CamSessao |
| CamPresencaSessao | 0 | sessao → CamSessao; vereador → CamVereador |
| CamProposicao | 4 | autor → CamVereador |
| CamSessao | 4 | — |
| CamVereador | 9 | legislatura → CamLegislatura |
| CamVotacao | 0 | proposicao → CamProposicao; sessao → CamSessao |
| CamVoto | 0 | votacao → CamVotacao; vereador → CamVereador |
| CatalogItem | 16 | — |
| CemeteryAttachment | 0 | document → Document |
| CemeteryChangeHistory | 0 | — |
| CemeteryChapel | 2 | cemetery → TaxCemetery |
| CemeteryFeeEvent | 0 | — |
| CemeteryFeeRule | 1 | — |
| CemeteryFeeRuleVersion | 0 | — |
| CemeteryIdentificationField | 0 | cemetery → TaxCemetery |
| CemeteryLot | 4 | cemetery → TaxCemetery |
| CemeteryOssuary | 2 | cemetery → TaxCemetery |
| CemeteryProcess | 0 | deceased → TaxDeceased |
| CertificateUseAudit | 0 | — |
| CitizenAccessApplication | 0 | process → Process |
| CitizenRegistryIdentity | 0 | usuario → Usuario |
| City | 1 | state → State |
| ClassDiary | 0 | schoolClass → SchoolClass; teacher → Teacher |
| ClassificationRule | 0 | — |
| ClassScheduleBoard | 0 | schoolClass → SchoolClass; period → AcademicPeriod |
| ClassScheduleEntry | 0 | board → ClassScheduleBoard; subject → SchoolSubject |
| Commitment | 0 | appropriation → BudgetAppropriation; supplier → Supplier |
| CommitmentMovement | 0 | commitment → Commitment |
| Company | 24 | — |
| ConfiguracaoInstancia | 1 | — |
| ConfiguracaoModulo | 30 | — |
| ConfiguracaoParametroInstancia | 1 | configuracaoInstancia → ConfiguracaoInstancia |
| ConfiguracaoPerfil | 19 | — |
| ConstructionAnalystReplacement | 0 | case → ConstructionCase |
| ConstructionAutomaticViabilityRun | 0 | — |
| ConstructionCase | 0 | process → Process; configuration → ConstructionConfigVersion |
| ConstructionCaseProperty | 0 | case → ConstructionCase; realEstate → RealEstate |
| ConstructionCatalogEntry | 26 | — |
| ConstructionCompanyProfile | 1 | company → Company |
| ConstructionCompanyProfileEvent | 1 | profile → ConstructionCompanyProfile |
| ConstructionCompletion | 0 | case → ConstructionCase |
| ConstructionCompletionSequence | 0 | — |
| ConstructionConfigVersion | 2 | — |
| ConstructionConsultation | 0 | case → ConstructionCase |
| ConstructionConsultationResponse | 0 | consultation → ConstructionConsultation |
| ConstructionDefinitionVersion | 10 | — |
| ConstructionDistributionVersion | 1 | — |
| ConstructionDocumentRequest | 0 | — |
| ConstructionDocumentTemplateVersion | 6 | — |
| ConstructionEnforcementAcknowledgement | 0 | act → ConstructionEnforcementAct |
| ConstructionEnforcementAct | 0 | case → ConstructionEnforcementCase |
| ConstructionEnforcementAssignment | 0 | case → ConstructionEnforcementCase |
| ConstructionEnforcementCase | 0 | process → Process; realEstate → RealEstate |
| ConstructionEnforcementEvidence | 0 | document → Document |
| ConstructionEnforcementSequence | 0 | — |
| ConstructionEnforcementVisit | 0 | case → ConstructionEnforcementCase |
| ConstructionExternalApplication | 0 | — |
| ConstructionExternalDocument | 0 | application → ConstructionExternalApplication |
| ConstructionFederalExport | 0 | — |
| ConstructionFederalExportItem | 0 | export → ConstructionFederalExport; case → ConstructionCase |
| ConstructionFederalExportReceipt | 0 | export → ConstructionFederalExport |
| ConstructionFee | 0 | case → ConstructionCase; rule → ConstructionTaxRuleVersion; taxpayer → Taxpayer; realEstate → RealEstate |
| ConstructionInspection | 0 | case → ConstructionCase |
| ConstructionInspectionDeadlineExtension | 0 | inspection → ConstructionInspection |
| ConstructionInspectionPlan | 0 | case → ConstructionCase |
| ConstructionInternalOpeningDocument | 0 | — |
| ConstructionIssuedDocument | 0 | — |
| ConstructionLifecycleStart | 0 | case → ConstructionCase |
| ConstructionMessage | 0 | case → ConstructionCase |
| ConstructionParticipant | 0 | case → ConstructionCase; identity → ConstructionPortalIdentity |
| ConstructionPdfAnnotation | 0 | — |
| ConstructionPlanExtraction | 0 | case → ConstructionCase |
| ConstructionPortalIdentity | 0 | professional → ConstructionProfessional |
| ConstructionProfessional | 1 | person → Person |
| ConstructionProfessionalEmployer | 1 | professional → ConstructionProfessional; company → Company |
| ConstructionProjectStamp | 0 | — |
| ConstructionPropertyUpdate | 0 | completion → ConstructionCompletion |
| ConstructionPropertyZone | 1 | realEstate → RealEstate; zone → ConstructionZoneVersion |
| ConstructionReview | 0 | case → ConstructionCase |
| ConstructionServiceRequest | 0 | case → ConstructionCase |
| ConstructionStaffRole | 3 | employee → Employee; department → Department |
| ConstructionTaxRuleVersion | 7 | tax → Tax |
| ConstructionTermAcceptance | 0 | case → ConstructionCase; identity → ConstructionPortalIdentity; term → ConstructionTermVersion |
| ConstructionTermVersion | 2 | — |
| ConstructionViabilityResult | 0 | case → ConstructionCase |
| ConstructionZoneVersion | 2 | — |
| Contract | 2 | process → PurchaseProcess; supplier → Supplier; secretariat → Secretariat |
| ContractAmendment | 0 | contract → Contract |
| ControlledMedicineBook | 0 | warehouse → Warehouse |
| CostCenter | 48 | — |
| Covenant | 0 | — |
| Creditor | 41 | — |
| CreditRequest | 0 | financialYear → FinancialYear; requestedBy → Usuario |
| CreditRequestItem | 0 | creditRequest → CreditRequest; appropriation → BudgetAppropriation |
| CulturaAgente | 8 | — |
| CulturaAtividade | 4 | — |
| CulturaConselho | 1 | — |
| CulturaConselhoDocumento | 0 | council → CulturaConselho; document → Document |
| CulturaEspaco | 3 | — |
| CulturaEvento | 8 | — |
| CulturaEventoDocumento | 0 | event → CulturaEvento; document → Document |
| CulturaFundo | 1 | — |
| CulturalIncentiveProject | 0 | — |
| CulturaPatrimonio | 3 | — |
| CulturaProjeto | 8 | agente → CulturaAgente |
| CulturaProjetoDocumento | 0 | project → CulturaProjeto; document → Document |
| CulturaReserva | 8 | space → CulturaEspaco |
| CulturaReservaDocumento | 0 | reservation → CulturaReserva; document → Document |
| Currency | 1 | — |
| CurriculumMatrix | 3 | school → School; period → AcademicPeriod |
| CurriculumMatrixSubject | 15 | matrix → CurriculumMatrix; subject → SchoolSubject |
| DebtInstallment | 0 | taxpayer → Taxpayer |
| DebtInstallmentSchedule | 0 | debtInstallment → DebtInstallment |
| Department | 37 | secretariat → Secretariat |
| Dependent | 0 | employee → Employee |
| DesifAgency | 0 | institution → DesifFinancialInstitution |
| DesifAssessment | 0 | importBatch → DesifImportBatch; agency → DesifAgency; subtitle → DesifSubtitle |
| DesifCosifAccount | 0 | — |
| DesifFinancialInstitution | 0 | — |
| DesifFiscalCase | 0 | institution → DesifFinancialInstitution |
| DesifFiscalEvent | 0 | fiscalCase → DesifFiscalCase |
| DesifImportBatch | 0 | institution → DesifFinancialInstitution |
| DesifPackage | 0 | institution → DesifFinancialInstitution |
| DesifPackageItem | 0 | package → DesifPackage; tariff → DesifTariff |
| DesifPackageMovement | 0 | importBatch → DesifImportBatch; agency → DesifAgency; package → DesifPackage |
| DesifPgccAccount | 0 | plan → DesifPgccPlan |
| DesifPgccCosifLink | 0 | pgccAccount → DesifPgccAccount; cosifAccount → DesifCosifAccount |
| DesifPgccPlan | 0 | institution → DesifFinancialInstitution |
| DesifSubtitle | 0 | pgccAccount → DesifPgccAccount |
| DesifTariff | 0 | institution → DesifFinancialInstitution |
| DesifTrialBalance | 0 | importBatch → DesifImportBatch; agency → DesifAgency; pgccAccount → DesifPgccAccount |
| DigitalCertificate | 0 | — |
| DirectContracting | 0 | process → PurchaseProcess; supplier → Supplier |
| Document | 9 | — |
| DocumentClass | 5 | — |
| DocumentIcpEvidence | 0 | documentVersion → DocumentVersion; certificate → DigitalCertificate |
| DocumentSignature | 0 | document → Document; documentVersion → DocumentVersion; signerUsuario → Usuario |
| DocumentVersion | 9 | document → Document |
| DteAccessGrant | 0 | mailbox → DteMailbox |
| DteCategory | 3 | — |
| DteMailbox | 0 | — |
| DteMessage | 0 | mailbox → DteMailbox; category → DteCategory |
| DteMessageEvent | 0 | message → DteMessage |
| DtePowerOfAttorney | 0 | — |
| DtePowerOfAttorneyEvent | 0 | powerOfAttorney → DtePowerOfAttorney |
| EconomicRegistration | 21 | taxpayer → Taxpayer |
| EducacensoOperation | 0 | — |
| EducationalGuardian | 20 | student → Student; person → Person |
| EducationApplicationPlan | 0 | school → School |
| EducationAssessment | 6 | schoolClass → SchoolClass; subject → SchoolSubject; teacher → Teacher |
| EducationFinancialAccount | 0 | school → School |
| EducationFinancialMovement | 0 | account → EducationFinancialAccount |
| EducationFoodMovement | 0 | school → School; material → Material |
| EducationLibraryCopy | 12 | title → EducationLibraryTitle |
| EducationLibraryLoan | 0 | copy → EducationLibraryCopy; student → Student |
| EducationLibraryReservation | 0 | title → EducationLibraryTitle; student → Student |
| EducationLibraryTitle | 4 | school → School |
| EducationSchoolMenu | 3 | school → School |
| EducationSupportRequest | 4 | — |
| EducationTransportEvent | 0 | journey → EducationTransportJourney |
| EducationTransportJourney | 0 | route → EducationTransportRoute |
| EducationTransportRoute | 0 | school → School |
| EducationTransportStop | 0 | route → EducationTransportRoute |
| EducationTransportStudent | 0 | route → EducationTransportRoute; student → Student |
| Employee | 37 | — |
| Enrollment | 20 | student → Student; school → School |
| EnrollmentMovement | 20 | enrollment → Enrollment |
| EnvComplaint | 4 | — |
| EnvDocument | 6 | — |
| EnvEduProgram | 3 | — |
| EnvEnterprise | 6 | — |
| EnvGreenArea | 3 | — |
| EnvInfraction | 0 | — |
| EnvInspection | 6 | — |
| EnvironmentalLicense | 0 | — |
| EnvLicense | 0 | enterprise → EnvEnterprise |
| EnvRequest | 6 | — |
| EnvWaste | 6 | — |
| ExceptionQueueItem | 0 | — |
| Expense | 0 | appropriation → BudgetAppropriation; secretariat → Secretariat |
| ExpenseNature | 23 | — |
| Family | 3 | — |
| FamilyMember | 3 | family → Family; person → Person |
| FinancialAuditLog | 925 | authorUsuario → Usuario |
| FinancialDocument | 0 | — |
| FinancialYear | 20 | — |
| FiscalAssessmentMap | 0 | order → FiscalServiceOrder |
| FiscalAuditPlan | 0 | — |
| FiscalAuditPlanEvent | 0 | plan → FiscalAuditPlan |
| FiscalAuditPlanInspector | 0 | plan → FiscalAuditPlan |
| FiscalAuditPlanSelection | 0 | plan → FiscalAuditPlan |
| FiscalDocumentRequest | 0 | order → FiscalServiceOrder |
| FiscalDocumentTemplate | 0 | — |
| FiscalInspectionDocument | 0 | order → FiscalServiceOrder |
| FiscalMeshFinding | 0 | — |
| FiscalMeshOrderLink | 0 | finding → FiscalMeshFinding; order → FiscalServiceOrder |
| FiscalPenaltyRule | 0 | — |
| FiscalProductivityConfig | 0 | — |
| FiscalProductivityEntry | 0 | taskRule → FiscalProductivityTaskRule |
| FiscalProductivityLedger | 0 | period → FiscalProductivityPeriod |
| FiscalProductivityPeriod | 0 | — |
| FiscalProductivityTaskRule | 0 | — |
| FiscalServiceOrder | 0 | — |
| FiscalServiceOrderEvent | 0 | order → FiscalServiceOrder |
| FleetAssetEvent | 4 | unit → FleetUnit |
| FleetAttachment | 9 | — |
| FleetAuthorization | 14 | — |
| FleetBooking | 6 | — |
| FleetCatalogEntry | 464 | version → FleetCatalogVersion |
| FleetCatalogVersion | 2 | — |
| FleetClaim | 1 | — |
| FleetComponent | 4 | — |
| FleetComponentInstallation | 4 | component → FleetComponent |
| FleetConsumption | 12 | unit → FleetUnit |
| FleetControlEvent | 88 | — |
| FleetDestination | 3 | — |
| FleetDocument | 11 | unit → FleetUnit |
| FleetDriver | 7 | — |
| FleetExpense | 20 | unit → FleetUnit |
| FleetExternalEvent | 1 | — |
| FleetExternalThrottle | 0 | — |
| FleetFine | 5 | — |
| FleetFinePayment | 1 | fine → FleetFine |
| FleetFuelAgreement | 2 | — |
| FleetFuelQuota | 1 | — |
| FleetGateEvent | 6 | — |
| FleetMachineType | 1 | — |
| FleetMutation | 33 | — |
| FleetOccurrence | 2 | unit → FleetUnit |
| FleetOperation | 0 | asset → Asset |
| FleetPlan | 2 | unit → FleetUnit |
| FleetProvider | 2 | — |
| FleetRoute | 4 | — |
| FleetSequence | 2 | — |
| FleetTrip | 3 | — |
| FleetUnit | 10 | — |
| FleetUnitControl | 10 | unit → FleetUnit |
| FleetUsage | 3 | unit → FleetUnit |
| FleetWorkOrder | 3 | unit → FleetUnit |
| FleetWorkshopReport | 1 | — |
| Folder | 0 | — |
| FundedDebt | 0 | — |
| GenericProcessWorkflowDefinition | 2 | processType → ProcessType |
| GenericProcessWorkflowEvent | 0 | instance → GenericProcessWorkflowInstance; actorUsuario → Usuario |
| GenericProcessWorkflowInstance | 0 | process → Process; definition → GenericProcessWorkflowDefinition; openedByUsuario → Usuario |
| GenericProcessWorkflowStage | 4 | definition → GenericProcessWorkflowDefinition; department → Department |
| GoalPPA | 32 | action → ActionPPA |
| GovernmentEntity | 4 | — |
| Grade | 20 | student → Student; schoolSubject → SchoolSubject; teacher → Teacher |
| HealthAdministrativeMerge | 0 | actorUsuario → Usuario |
| HealthAppointment | 20 | patient → Patient; unit → HealthUnit |
| HealthAppointmentEvent | 0 | appointment → HealthAppointment; actorUsuario → Usuario |
| HealthAssistentialDevice | 0 | — |
| HealthBed | 0 | unit → HealthUnit |
| HealthBedOccupancy | 0 | bed → HealthBed; patient → Patient |
| HealthCareSchedule | 5 | unit → HealthUnit |
| HealthCbo | 2 | — |
| HealthClinicalDocument | 0 | medicalRecord → MedicalRecord; document → Document; addedByUsuario → Usuario |
| HealthClinicalEvolution | 0 | medicalRecord → MedicalRecord; professional → HealthProfessional |
| HealthDestination | 0 | — |
| HealthDeviceMessage | 0 | device → HealthAssistentialDevice |
| HealthDiagnosis | 0 | medicalRecord → MedicalRecord; cidReference → HealthSusReference |
| HealthEsusBatch | 0 | — |
| HealthEsusBatchItem | 0 | batch → HealthEsusBatch; form → HealthEsusForm |
| HealthEsusForm | 0 | — |
| HealthExamRequest | 0 | patient → Patient; professional → HealthProfessional |
| HealthFamily | 20 | — |
| HealthFamilyMember | 40 | family → HealthFamily; person → Person |
| HealthHabilitation | 0 | — |
| HealthHomeVisit | 0 | professional → HealthProfessional |
| HealthHomeVisitParticipant | 0 | visit → HealthHomeVisit; person → Person |
| HealthHousehold | 20 | — |
| HealthLabExamMaterial | 0 | examModel → HealthLabExamModel; material → Material |
| HealthLabExamModel | 0 | — |
| HealthLaboratoryConfiguration | 0 | unit → HealthUnit; createdByUsuario → Usuario |
| HealthLabOrder | 0 | patient → Patient |
| HealthLabOrderEvent | 0 | order → HealthLabOrder |
| HealthLabProviderQuota | 0 | providerSupplier → Supplier; unit → HealthUnit; examModel → HealthLabExamModel |
| HealthLabQuestionGroup | 0 | questionnaire → HealthLabQuestionnaire |
| HealthLabQuestionItem | 0 | group → HealthLabQuestionGroup |
| HealthLabQuestionnaire | 0 | — |
| HealthLabReport | 0 | order → HealthLabOrder; document → Document |
| HealthLabResult | 0 | order → HealthLabOrder |
| HealthLabSchedule | 0 | examModel → HealthLabExamModel; unit → HealthUnit |
| HealthMaterialProfile | 2 | material → Material |
| HealthMicroarea | 4 | area → HealthTerritoryArea |
| HealthObservation | 0 | patient → Patient; unit → HealthUnit |
| HealthPerformedProcedure | 0 | medicalRecord → MedicalRecord; procedure → HealthSusProcedure; professional → HealthProfessional |
| HealthPrescription | 0 | patient → Patient; professional → HealthProfessional |
| HealthPrescriptionItem | 0 | prescription → HealthPrescription |
| HealthProductionCompetence | 0 | — |
| HealthProductionCriticism | 0 | fact → HealthProductionFact |
| HealthProductionFact | 0 | — |
| HealthProductionTarget | 0 | competence → HealthProductionCompetence; procedure → HealthSusProcedure |
| HealthProfessional | 3 | employee → Employee |
| HealthProfessionalAssignment | 1 | professional → HealthProfessional; unit → HealthUnit |
| HealthProviderAccess | 0 | supplier → Supplier; usuario → Usuario |
| HealthReception | 0 | unit → HealthUnit |
| HealthReferral | 0 | patient → Patient; professional → HealthProfessional |
| HealthRegistrationStatusHistory | 0 | — |
| HealthRegulationAttachment | 0 | request → HealthRegulationRequest; document → Document |
| HealthRegulationEvent | 0 | request → HealthRegulationRequest |
| HealthRegulationQuota | 0 | provider → Supplier |
| HealthRegulationRequest | 0 | patient → Patient |
| HealthRegulationSector | 0 | — |
| HealthRiskProtocol | 0 | — |
| HealthRoom | 4 | unit → HealthUnit |
| HealthSchedulingGroup | 0 | unit → HealthUnit; specialtyGroup → HealthSpecialtyGroup |
| HealthService | 0 | — |
| HealthServiceAssignment | 0 | service → HealthService |
| HealthSpecialty | 1 | — |
| HealthSpecialtyGroup | 0 | — |
| HealthSpecialtyGroupMember | 0 | group → HealthSpecialtyGroup; specialty → HealthSpecialty |
| HealthSpecialtyGroupService | 0 | group → HealthSpecialtyGroup; service → HealthService |
| HealthStandardDocument | 0 | document → Document; addedByUsuario → Usuario |
| HealthStockPolicy | 4 | warehouse → Warehouse; material → Material |
| HealthStockReceipt | 0 | warehouse → Warehouse |
| HealthStockReceiptItem | 0 | receipt → HealthStockReceipt; material → Material |
| HealthStockTransfer | 0 | originWarehouse → Warehouse; destinationWarehouse → Warehouse |
| HealthStockTransferItem | 0 | transfer → HealthStockTransfer; material → Material |
| HealthSusFile | 0 | competence → HealthProductionCompetence |
| HealthSusImportBatch | 0 | actorUsuario → Usuario |
| HealthSusImportIssue | 0 | batch → HealthSusImportBatch |
| HealthSusProcedure | 0 | sourceBatch → HealthSusImportBatch |
| HealthSusProcedureReference | 0 | procedure → HealthSusProcedure; reference → HealthSusReference |
| HealthSusReference | 0 | sourceBatch → HealthSusImportBatch |
| HealthTeam | 3 | unit → HealthUnit |
| HealthTerritoryArea | 2 | — |
| HealthTfdPassenger | 0 | trip → HealthTfdTrip; patient → Patient |
| HealthTfdPassengerRemoval | 0 | passenger → HealthTfdPassenger |
| HealthTfdRequest | 0 | patient → Patient |
| HealthTfdTrip | 0 | fleetUnit → FleetUnit |
| HealthTriage | 0 | appointment → HealthAppointment; professional → HealthProfessional |
| HealthUnit | 4 | — |
| HealthUnitCeiling | 0 | unit → HealthUnit |
| HealthUnitShift | 10 | unit → HealthUnit |
| HealthUnitSpecialty | 1 | unit → HealthUnit; specialty → HealthSpecialty |
| HealthUserAccessScope | 0 | usuario → Usuario; unit → HealthUnit |
| HealthVigilanceComplaint | 0 | — |
| HealthVigilanceEstablishment | 0 | — |
| HealthVigilanceInspection | 0 | establishment → HealthVigilanceEstablishment |
| HealthVigilanceInspectionItem | 0 | inspection → HealthVigilanceInspection |
| HealthVigilanceLicense | 0 | establishment → HealthVigilanceEstablishment |
| HealthWaitlist | 0 | patient → Patient |
| HrCalculationPolicy | 1 | ruleSet → HrPayrollRuleSet |
| HrConsignmentAgreement | 0 | contract → HrEmploymentContract; supplier → Supplier; sourceRun → HrPayrollRun |
| HrConsignmentEntry | 0 | installment → HrConsignmentInstallment |
| HrConsignmentInstallment | 0 | agreement → HrConsignmentAgreement |
| HrEmploymentContract | 3 | employee → Employee |
| HrEmploymentRegime | 4 | ruleSet → HrPayrollRuleSet |
| HrEmploymentRevision | 4 | contract → HrEmploymentContract |
| HrIntegrationEvent | 50 | — |
| HrMovement | 0 | contract → HrEmploymentContract |
| HrPayrollConfigurationChange | 0 | ruleSet → HrPayrollRuleSet; actorUsuario → Usuario |
| HrPayrollItemOrigin | 106 | payrollItem → PayrollItem |
| HrPayrollRubric | 16 | ruleSet → HrPayrollRuleSet |
| HrPayrollRubricIncidence | 20 | rubric → HrPayrollRubric |
| HrPayrollRule | 20 | ruleSet → HrPayrollRuleSet |
| HrPayrollRuleSet | 2 | configuracaoInstancia → ConfiguracaoInstancia |
| HrPayrollRun | 13 | payroll → Payroll |
| HrPayrollStatement | 39 | run → HrPayrollRun; contract → HrEmploymentContract |
| HrPortalRequest | 3 | — |
| HrPortalRequestBinding | 0 | request → HrPortalRequest; process → Process; service → HrPortalServiceConfiguration; employee → Employee; actor → Usuario |
| HrPortalServiceConfiguration | 0 | rule → HrPayrollRule; publicService → PublicService; budgetUnit → BudgetUnit; processType → ProcessType; subject → Subject |
| HrRecruitmentApplication | 0 | noticeRule → HrPayrollRule; applicant → Usuario |
| HrRightEntry | 21 | contract → HrEmploymentContract |
| HrRoleLegalHistory | 0 | — |
| HrSocialSecurityBand | 4 | socialSecurityScheme → HrSocialSecurityScheme |
| HrSocialSecurityScheme | 1 | ruleSet → HrPayrollRuleSet |
| HrVacationPolicy | 1 | ruleSet → HrPayrollRuleSet |
| IndicatorPPA | 8 | objective → ObjectivePPA |
| InformationRequest | 4 | — |
| Infraction | 0 | taxpayer → Taxpayer |
| Institution | 1 | — |
| InstrumentInstallment | 0 | — |
| InstrumentMeasurement | 0 | — |
| InstrumentMeasurementItem | 0 | measurement → InstrumentMeasurement |
| InstrumentParty | 0 | — |
| InstrumentResponsibilityGroup | 0 | — |
| IntegrationConnection | 0 | — |
| IntegrationRun | 0 | connection → IntegrationConnection |
| InternalControlEvent | 4 | plan → InternalControlPlan |
| InternalControlFinding | 0 | plan → InternalControlPlan |
| InternalControlPlan | 2 | — |
| InternalDemand | 6 | — |
| InventorySession | 0 | warehouse → Warehouse; createdByUsuario → Usuario |
| InventorySessionItem | 0 | session → InventorySession; stock → MaterialStock |
| InvestmentAllocation | 0 | originBankAccount → BankAccount; investmentBankAccount → BankAccount |
| Invoice | 0 | provider → Taxpayer |
| ItbiDeclaration | 0 | transactionType → ItbiTransactionType |
| ItbiEvent | 0 | declaration → ItbiDeclaration |
| ItbiParty | 0 | declaration → ItbiDeclaration |
| ItbiTransactionType | 0 | — |
| Lead | 0 | — |
| LearningActivity | 6 | schoolClass → SchoolClass; subject → SchoolSubject; teacher → Teacher |
| LearningQuestion | 6 | activity → LearningActivity |
| LearningSubmission | 6 | activity → LearningActivity; student → Student |
| Leave | 0 | employee → Employee |
| LegalReportSigner | 0 | — |
| LegalRepresentative | 0 | representative → Person |
| LegalText | 0 | — |
| LegalTextRelation | 0 | sourceLegalText → LegalText; targetLegalText → LegalText |
| LegalTextVersion | 0 | legalText → LegalText |
| License | 0 | taxpayer → Taxpayer |
| MasterDataConsistencyIssue | 4 | run → MasterDataConsistencyRun |
| MasterDataConsistencyRun | 1 | — |
| Material | 18 | category → MaterialCategory |
| MaterialCategory | 8 | — |
| MaterialMovement | 1 | warehouse → Warehouse; material → Material |
| MaterialRequest | 0 | department → Department; requester → Employee |
| MaterialRequestItem | 0 | request → MaterialRequest; material → Material |
| MaterialStock | 2 | warehouse → Warehouse; material → Material |
| MaterialStockValuation | 0 | stock → MaterialStock |
| MaterialStockValuationEvent | 0 | valuation → MaterialStockValuation; movement → MaterialMovement |
| MaterialSubcategory | 0 | category → MaterialCategory |
| MedicalRecord | 0 | patient → Patient; professional → HealthProfessional; unit → HealthUnit |
| Medicine | 2 | — |
| MedicineBatch | 0 | medicine → Medicine |
| MedicineDispensation | 0 | medicine → Medicine; patient → Patient; unit → HealthUnit |
| MedicineDosageTemplate | 0 | medicine → Medicine |
| MedicineInteraction | 0 | originMedicine → Medicine; targetMedicine → Medicine |
| MonthlyAccountingClose | 0 | financialYear → FinancialYear |
| MonthlyAccountingCloseEvent | 0 | monthlyAccountingClose → MonthlyAccountingClose; requestedByUsuario → Usuario |
| MonthlyDisbursementSchedule | 0 | annualBudgetLaw → AnnualBudgetLaw |
| MultiYearPlan | 3 | — |
| MunicipalCostAllocation | 0 | movement → MunicipalCostMovement; object → MunicipalCostObject; item → MunicipalCostItem |
| MunicipalCostItem | 14 | financialYear → FinancialYear |
| MunicipalCostMovement | 0 | source → MunicipalCostSource |
| MunicipalCostObject | 2 | financialYear → FinancialYear |
| MunicipalCostObjectItem | 14 | object → MunicipalCostObject; item → MunicipalCostItem |
| MunicipalCostPolicy | 2 | governmentEntity → GovernmentEntity |
| MunicipalCostRule | 0 | financialYear → FinancialYear; budgetUnit → BudgetUnit |
| MunicipalCostSource | 0 | financialYear → FinancialYear; budgetUnit → BudgetUnit |
| MunicipalCostSourceReduction | 0 | source → MunicipalCostSource |
| MunicipalFiscalIndexDefinition | 0 | financialYear → FinancialYear |
| MunicipalPersonnelFiscalDefinition | 0 | — |
| Neighborhood | 6 | — |
| NfseCorrectionLetter | 0 | — |
| NfseCredentialEvent | 0 | credential → NfseCredentialRequest |
| NfseCredentialRequest | 0 | — |
| NfseDeductionConsumption | 0 | credit → NfseDeductionCredit |
| NfseDeductionCredit | 0 | — |
| NfseDmsDeclaration | 0 | — |
| NfseEvent | 0 | — |
| NfseInvoiceData | 0 | — |
| NfseOccasionalRequest | 0 | — |
| NfseRpsBatch | 0 | — |
| NfseRpsItem | 0 | batch → NfseRpsBatch |
| ObjectivePPA | 8 | program → ProgramPPA |
| ObrasEquipe | 3 | — |
| ObrasEquipeMembro | 2 | equipe → ObrasEquipe; employee → Employee |
| ObrasMedicao | 0 | obra → ObrasObra |
| ObrasObra | 8 | — |
| ObrasServico | 20 | — |
| ObrasServicoCompra | 0 | obrasServico → ObrasServico |
| ObrasServicoDocumento | 0 | obrasServico → ObrasServico; document → Document |
| ObrasServicoEmployee | 20 | obrasServico → ObrasServico; employee → Employee |
| ObrasServicoEquipamento | 4 | obrasServico → ObrasServico; asset → Asset |
| ObrasServicoEquipe | 20 | obrasServico → ObrasServico; equipe → ObrasEquipe |
| ObrasServicoMaterial | 0 | obrasServico → ObrasServico; material → Material |
| OfficialDiary | 0 | — |
| OfficialPublication | 0 | — |
| Ombudsman | 3 | channel → SupportChannel |
| OmbudsmanAccess | 0 | ombudsman → Ombudsman; user → Usuario; grantedBy → Usuario |
| OmbudsmanAuditLog | 0 | ombudsman → Ombudsman; user → Usuario |
| OmbudsmanDocument | 0 | ombudsman → Ombudsman; document → Document |
| OmbudsmanIdentity | 0 | ombudsman → Ombudsman; person → Person |
| OmbudsmanInteraction | 0 | ombudsman → Ombudsman |
| OmbudsmanMovement | 0 | ombudsman → Ombudsman; toDepartment → Department; employee → Employee |
| Patient | 23 | person → Person |
| PayableCarryForward | 0 | financialYear → FinancialYear; originFinancialYear → FinancialYear; commitment → Commitment |
| PayableCarryForwardEvent | 0 | payableCarryForward → PayableCarryForward; actorUsuario → Usuario |
| Payment | 0 | commitment → Commitment; bankAccount → BankAccount; supplier → Supplier |
| PaymentRetention | 0 | payment → Payment |
| Payroll | 27 | — |
| PayrollBenefit | 0 | employee → Employee; benefitConfig → BenefitConfig |
| PayrollEvent | 19 | — |
| PayrollItem | 106 | payroll → Payroll; employee → Employee; event → PayrollEvent |
| PedagogicalAttempt | 0 | release → PedagogicalRelease; student → Student |
| PedagogicalCatalogItem | 0 | — |
| PedagogicalRelease | 0 | catalogItem → PedagogicalCatalogItem; teacher → Teacher |
| Person | 94 | — |
| PersonMergeLedger | 0 | request → PersonMergeRequest; sourcePerson → Person; targetPerson → Person; actorUsuario → Usuario |
| PersonMergeRequest | 0 | sourcePerson → Person; targetPerson → Person; proposedByUsuario → Usuario |
| PersonnelAct | 0 | employee → Employee |
| PharmacyRequest | 0 | destinationWarehouse → Warehouse |
| PharmacyRequestItem | 0 | request → PharmacyRequest; material → Material |
| PlanningAmendment | 0 | — |
| PlanningAmendmentItem | 0 | amendment → PlanningLegislativeAmendment; line → PlanningBudgetLine |
| PlanningAnnualProgram | 0 | instrument → PlanningInstrument |
| PlanningBudgetLine | 0 | instrument → PlanningInstrument; budgetUnit → BudgetUnit; resourceSource → ResourceSource |
| PlanningCalculationMemory | 0 | instrument → PlanningInstrument |
| PlanningCatalogEntry | 19106 | version → PlanningCatalogVersion |
| PlanningCatalogVersion | 28 | — |
| PlanningCommunityDemand | 0 | hearing → PlanningHearing; responsibleUnit → BudgetUnit |
| PlanningCreditBatch | 0 | instrument → PlanningInstrument; creditRequest → CreditRequest |
| PlanningCreditLine | 0 | batch → PlanningCreditBatch; line → PlanningBudgetLine |
| PlanningDocumentLink | 0 | instrument → PlanningInstrument; document → Document; documentVersion → DocumentVersion |
| PlanningEntityScope | 2 | governmentEntity → GovernmentEntity |
| PlanningEntityUnit | 51 | budgetUnit → BudgetUnit; governmentEntity → GovernmentEntity |
| PlanningFiscalRule | 0 | instrument → PlanningInstrument |
| PlanningHearing | 0 | instrument → PlanningInstrument |
| PlanningImportBatch | 0 | sourceInstrument → PlanningInstrument; targetInstrument → PlanningInstrument |
| PlanningInstrument | 19 | governmentEntity → GovernmentEntity |
| PlanningInstrumentSource | 0 | instrument → PlanningInstrument |
| PlanningIntegrationCommand | 0 | — |
| PlanningLegislativeAmendment | 0 | instrument → PlanningInstrument; councilor → CamVereador |
| PlanningLegislativeLink | 0 | instrument → PlanningInstrument |
| PlanningLineMovement | 0 | line → PlanningBudgetLine |
| PlanningPhysicalEvent | 0 | line → PlanningBudgetLine |
| PlanningPlannedWork | 0 | instrument → PlanningInstrument |
| PlanningPublicationEvent | 0 | publication → PlanningReportPublication |
| PlanningQuota | 0 | line → PlanningBudgetLine |
| PlanningQuotaEvent | 0 | quota → PlanningQuota |
| PlanningReportPublication | 0 | snapshot → PlanningReportSnapshot |
| PlanningReportSnapshot | 0 | instrument → PlanningInstrument |
| PlanningRevenueAllocation | 0 | revenueNature → RevenueNature; resourceSource → ResourceSource |
| PlanningRevenueWaiver | 0 | instrument → PlanningInstrument |
| PlanningVersion | 0 | instrument → PlanningInstrument |
| PortalBanner | 0 | — |
| PortalMenu | 4 | — |
| PortalNews | 3 | — |
| PortalPage | 2 | — |
| PortalScheduleRequest | 0 | schedule → PortalServiceSchedule; request → PortalServiceRequest |
| PortalServiceConfiguration | 3 | publicService → PublicService |
| PortalServiceFavorite | 0 | publicService → PublicService |
| PortalServiceNotice | 0 | — |
| PortalServiceRating | 0 | request → PortalServiceRequest |
| PortalServiceRequest | 0 | service → PortalServiceConfiguration; process → Process |
| PortalServiceRequestEvent | 0 | request → PortalServiceRequest |
| PortalServiceSchedule | 0 | — |
| PortalServiceUpload | 0 | — |
| PortalServiceVersion | 3 | service → PortalServiceConfiguration |
| PreEnrollment | 9 | student → Student; school → School |
| PreEnrollmentProcess | 3 | school → School |
| PreliminaryTechnicalStudy | 10 | process → PurchaseProcess |
| PriceQuote | 30 | research → PriceResearch; supplier → Supplier |
| PriceResearch | 10 | process → PurchaseProcess |
| Process | 20 | processType → ProcessType; subject → Subject |
| ProcessCitizenAccess | 0 | process → Process; usuario → Usuario; grantedBy → Usuario |
| ProcessDispatch | 0 | process → Process; employee → Employee |
| ProcessDocument | 0 | process → Process |
| ProcessEvent | 0 | process → Process |
| ProcessJudicialCase | 0 | process → Process |
| ProcessJudicialCaseEvent | 0 | case → ProcessJudicialCase |
| ProcessMovement | 0 | process → Process; toDepartment → Department |
| ProcessSequence | 0 | — |
| ProcessType | 5 | — |
| ProcessWorkflowStage | 0 | processType → ProcessType; department → Department |
| ProcurementLifecycleEvent | 0 | actorUsuario → Usuario |
| ProgramPPA | 8 | multiYearPlan → MultiYearPlan |
| PropertyValuation | 0 | realEstate → RealEstate |
| ProtocolNotification | 0 | user → Usuario |
| PublicityCampaign | 0 | — |
| PublicNotice | 0 | publishedByUsuario → Usuario |
| PublicService | 3 | — |
| PurchasePlanning | 10 | — |
| PurchaseProcess | 13 | secretariat → Secretariat |
| PurchaseProcessItem | 12 | purchaseProcess → PurchaseProcess |
| PurchaseProcessItemOrigin | 0 | purchaseProcessItem → PurchaseProcessItem; purchaseRequestItem → PurchaseRequestItem |
| PurchaseProcessRequestOrigin | 0 | purchaseProcess → PurchaseProcess; purchaseRequest → PurchaseRequest |
| PurchaseReceipt | 0 | contract → Contract; purchaseProcess → PurchaseProcess; document → Document; receiver → Employee; attester → Employee |
| PurchaseReceiptItem | 0 | purchaseReceipt → PurchaseReceipt; purchaseProcessItem → PurchaseProcessItem; material → Material; warehouse → Warehouse; stockMovement → MaterialMovement |
| PurchaseRequest | 22 | secretariat → Secretariat; department → Department; requester → Employee |
| PurchaseRequestItem | 26 | purchaseRequest → PurchaseRequest |
| PurchaseRequestItemBudgetAllocation | 6 | purchaseRequestItem → PurchaseRequestItem; budgetAppropriation → BudgetAppropriation |
| RealEstate | 42 | — |
| ReportTemplate | 0 | — |
| ResourceSource | 22 | — |
| RetentionRule | 0 | — |
| Revenue | 0 | revenueNature → RevenueNature; resourceSource → ResourceSource |
| RevenueNature | 24 | — |
| RevenueResourceRedistribution | 0 | revenue → Revenue; sourceResourceSource → ResourceSource; destinationResourceSource → ResourceSource; financialYear → FinancialYear |
| RevenueReversal | 0 | revenue → Revenue; financialYear → FinancialYear; treasuryMovement → TreasuryMovement |
| Role | 12 | — |
| SanConsumerUnit | 20 | — |
| SanInvoice | 0 | unit → SanConsumerUnit |
| SanMeterReading | 20 | unit → SanConsumerUnit |
| SanPortalRequest | 6 | — |
| SanSavedReport | 2 | — |
| SanServiceOrder | 5 | — |
| SanWaterMeter | 20 | unit → SanConsumerUnit |
| SanWaterQualityAnalysis | 0 | — |
| SatisfactionSurvey | 0 | ticket → Ticket |
| School | 3 | — |
| SchoolBus | 0 | — |
| SchoolCalendarEvent | 3 | — |
| SchoolClass | 6 | school → School |
| SchoolMeal | 0 | school → School |
| SchoolShift | 3 | school → School |
| SchoolSubject | 5 | — |
| Secretariat | 20 | — |
| SegurancaGuarda | 2 | — |
| SegurancaInfracao | 0 | — |
| SegurancaMobilidadeRegistro | 6 | — |
| SegurancaOcorrencia | 4 | — |
| SequenceCounter | 0 | — |
| ServiceSubject | 5 | — |
| Settlement | 0 | commitment → Commitment; author → Employee |
| SettlementRetention | 0 | settlement → Settlement; retentionRule → RetentionRule |
| SimplesDivergence | 0 | — |
| SimplesExclusionCase | 0 | — |
| SimplesFiscalRecord | 0 | importBatch → SimplesImportBatch |
| SimplesImportBatch | 0 | — |
| SimplesOptionPeriod | 0 | — |
| SimplesPaymentAllocation | 0 | importBatch → SimplesImportBatch |
| SimplesRegularizationEvent | 0 | divergence → SimplesDivergence |
| SocialAttendance | 10 | family → SocialFamily; unit → SocialUnit; professional → Employee |
| SocialBenefit | 4 | — |
| SocialBenefitConcession | 0 | benefit → SocialBenefit; family → SocialFamily; professional → Employee |
| SocialBenefitQuota | 0 | benefit → SocialBenefit; unit → SocialUnit |
| SocialBenefitRequest | 0 | family → SocialFamily; unit → SocialUnit |
| SocialBenefitRequestItem | 0 | request → SocialBenefitRequest; benefit → SocialBenefit |
| SocialBenefitStock | 0 | benefit → SocialBenefit; unit → SocialUnit |
| SocialBenefitStockMovement | 0 | benefit → SocialBenefit |
| SocialCatalogEntry | 0 | — |
| SocialFamily | 13 | representative → Person |
| SocialFamilyMember | 10 | family → SocialFamily; person → Person |
| SocialFinancialEntry | 0 | person → Person; catalog → SocialCatalogEntry; unit → SocialUnit |
| SocialMinimumWage | 0 | — |
| SocialNetworkOrganization | 2 | — |
| SocialPersonFact | 0 | person → Person; catalog → SocialCatalogEntry; unit → SocialUnit |
| SocialPersonProfile | 10 | person → Person |
| SocialProfessionalLink | 1 | employee → Employee; unit → SocialUnit |
| SocialProgram | 2 | — |
| SocialProgramParticipation | 10 | program → SocialProgram; family → SocialFamily |
| SocialRecord | 10 | family → SocialFamily |
| SocialReferral | 0 | unit → SocialUnit; destinationOrganization → SocialNetworkOrganization |
| SocialUnit | 3 | — |
| SocialVisit | 5 | family → SocialFamily; professional → Employee |
| SpecializedCatalogItem | 0 | — |
| SpecializedDistribution | 0 | plan → SpecializedTherapeuticPlan; patient → Patient; warehouse → Warehouse; material → Material; stock → MaterialStock; movement → MaterialMovement |
| SpecializedPlanEntry | 0 | plan → SpecializedTherapeuticPlan; professional → HealthProfessional |
| SpecializedQuota | 0 | patient → Patient; material → Material |
| SpecializedTeamSchedule | 0 | team → HealthTeam; unit → HealthUnit |
| SpecializedTherapeuticPlan | 0 | patient → Patient; unit → HealthUnit; team → HealthTeam |
| SstAccessGrant | 0 | usuario → Usuario; budgetUnit → BudgetUnit |
| SstAnamnesis | 0 | aso → SstAso; questionnaireVersion → SstQuestionnaireVersion |
| SstAppointment | 0 | availability → SstScheduleAvailability; employee → Employee |
| SstAso | 0 | budgetUnit → BudgetUnit; person → Person; programGroup → SstProgramExposureGroup; examiner → Person |
| SstBenefitBeneficiary | 0 | plan → SstHealthPlan; payrollBenefit → PayrollBenefit |
| SstBenefitCancellation | 0 | entry → SstBenefitEntry; compensationEntry → SstBenefitEntry |
| SstBenefitEntry | 0 | beneficiary → SstBenefitBeneficiary |
| SstBenefitPayrollMapping | 0 | plan → SstHealthPlan |
| SstBenefitPayrollOrigin | 0 | entry → SstBenefitEntry; payrollItem → PayrollItem |
| SstBenefitPayrollScope | 0 | payroll → Payroll |
| SstCat | 0 | budgetUnit → BudgetUnit; employee → Employee; createdBy → Usuario |
| SstCertificateDocument | 0 | certificate → SstMedicalCertificate; document → Document |
| SstCertificateReason | 3 | budgetUnit → BudgetUnit |
| SstClinicalRecord | 0 | budgetUnit → BudgetUnit; person → Person; professionalRole → SstProfessionalRole |
| SstClosureEmission | 0 | — |
| SstDisciplineGrant | 0 | budgetUnit → BudgetUnit; usuario → Usuario |
| SstElectionBallot | 0 | election → SstPreventionRecord |
| SstElectionCandidate | 0 | election → SstPreventionRecord; employee → Employee; elector → SstElectionElector |
| SstElectionElector | 0 | election → SstPreventionRecord; employee → Employee; person → Person |
| SstElectionTurnout | 0 | elector → SstElectionElector |
| SstEquipment | 0 | budgetUnit → BudgetUnit; material → Material |
| SstEquipmentDelivery | 0 | budgetUnit → BudgetUnit |
| SstEquipmentDeliveryItem | 0 | delivery → SstEquipmentDelivery; equipment → SstEquipment; employee → Employee |
| SstEquipmentEvent | 0 | item → SstEquipmentDeliveryItem; responsible → Person |
| SstEquipmentPolicy | 0 | budgetUnit → BudgetUnit |
| SstEquipmentRequirement | 0 | programGroup → SstProgramExposureGroup; equipment → SstEquipment |
| SstEsocialAttempt | 0 | — |
| SstEsocialConfiguration | 0 | — |
| SstEsocialEvent | 0 | — |
| SstEsocialEvidence | 0 | — |
| SstExposureGroup | 3 | budgetUnit → BudgetUnit |
| SstHealthPlan | 0 | budgetUnit → BudgetUnit; benefitConfig → BenefitConfig; supplier → Supplier; operatorCompany → Company; monthlyRubric → HrPayrollRubric; extraordinaryRubric → HrPayrollRubric |
| SstLeavePayrollOrigin | 0 | certificate → SstMedicalCertificate; leave → Leave; payroll → Payroll; payrollItem → PayrollItem; ruleVersion → SstLeavePayrollRuleVersion |
| SstLeavePayrollRuleVersion | 0 | rule → HrPayrollRule; ruleSet → HrPayrollRuleSet |
| SstLeavePayrollScopeEvidence | 0 | scope → SstBenefitPayrollScope; certificate → SstMedicalCertificate |
| SstMedicalAssessment | 0 | certificate → SstMedicalCertificate; examiner → Person |
| SstMedicalBoard | 0 | budgetUnit → BudgetUnit |
| SstMedicalBoardMember | 0 | board → SstMedicalBoard; person → Person |
| SstMedicalCertificate | 0 | budgetUnit → BudgetUnit; employee → Employee; reason → SstCertificateReason; issuer → Person |
| SstOccupationalExam | 0 | aso → SstAso; professional → Person |
| SstOccupationalProgram | 0 | budgetUnit → BudgetUnit; responsible → Person |
| SstPlannedShift | 0 | budgetUnit → BudgetUnit; employee → Employee |
| SstPreventionRecord | 0 | budgetUnit → BudgetUnit; createdBy → Usuario |
| SstPreventionRevision | 0 | record → SstPreventionRecord; actor → Usuario |
| SstProfessionalRole | 0 | budgetUnit → BudgetUnit; person → Person |
| SstProgramExposureGroup | 0 | program → SstOccupationalProgram; group → SstExposureGroup |
| SstQuestionnaireVersion | 0 | budgetUnit → BudgetUnit |
| SstScheduleAvailability | 0 | budgetUnit → BudgetUnit; professional → Person |
| SstScheduleBlock | 0 | availability → SstScheduleAvailability |
| SstVaccination | 0 | budgetUnit → BudgetUnit; person → Person; professionalRole → SstProfessionalRole; vaccine → Vaccine |
| State | 1 | — |
| Street | 6 | — |
| Student | 20 | person → Person |
| SuasProntuarioRma | 0 | — |
| Subject | 5 | processType → ProcessType |
| Supplier | 44 | — |
| SupplierPortalIdentity | 0 | supplier → Supplier; usuario → Usuario |
| SupportChannel | 3 | — |
| Tax | 11 | — |
| TaxActiveDebtEvent | 0 | — |
| TaxAnnualBatch | 0 | — |
| TaxAnnualBatchItem | 0 | batch → TaxAnnualBatch |
| TaxAssessment | 20 | tax → Tax; taxpayer → Taxpayer |
| TaxAuditCrossCheck | 0 | — |
| TaxAuditLog | 43 | authorUsuario → Usuario |
| TaxBenefitGrant | 0 | rule → TaxBenefitRule |
| TaxBenefitRule | 0 | — |
| TaxBurialMovement | 0 | grave → TaxGrave |
| TaxCaseLink | 0 | taxpayer → Taxpayer |
| TaxCdaVersion | 0 | — |
| TaxCemetery | 3 | — |
| TaxCemeteryEmployee | 3 | cemetery → TaxCemetery |
| TaxCemeterySector | 3 | cemetery → TaxCemetery |
| TaxCertificate | 0 | taxpayer → Taxpayer |
| TaxCertificateEvaluation | 0 | taxpayer → Taxpayer |
| TaxCollectionAction | 0 | portfolio → TaxCollectionPortfolio |
| TaxCollectionActionEvent | 0 | action → TaxCollectionAction |
| TaxCollectionPortfolio | 0 | — |
| TaxCollectionPortfolioItem | 0 | portfolio → TaxCollectionPortfolio |
| TaxCollectionProfile | 0 | — |
| TaxCollectionRule | 0 | — |
| TaxDaPortfolio | 0 | — |
| TaxDaPortfolioItem | 0 | portfolio → TaxDaPortfolio |
| TaxDeathCause | 7 | — |
| TaxDebtSuspension | 0 | — |
| TaxDeceased | 0 | cemetery → TaxCemetery |
| TaxDeclaration | 0 | taxpayer → Taxpayer; activity → TaxServiceActivity |
| TaxDocumentSequence | 2 | — |
| TaxExecutionBatch | 0 | — |
| TaxExecutionCase | 0 | — |
| TaxExecutionEvent | 0 | executionCase → TaxExecutionCase |
| TaxFinancialMapping | 3 | tax → Tax; revenueNature → RevenueNature; resourceSource → ResourceSource; defaultBankAccount → BankAccount |
| TaxFuneralHome | 2 | — |
| TaxGrave | 4 | cemetery → TaxCemetery |
| TaxGraveConcession | 0 | grave → TaxGrave |
| TaxGuide | 20 | assessment → TaxAssessment |
| TaxInstallmentAgreement | 0 | rule → TaxInstallmentRule |
| TaxInstallmentDebt | 0 | agreement → TaxInstallmentAgreement |
| TaxInstallmentEvent | 0 | agreement → TaxInstallmentAgreement |
| TaxInstallmentPaymentAllocation | 0 | agreement → TaxInstallmentAgreement; quota → TaxInstallmentQuota |
| TaxInstallmentQuota | 0 | agreement → TaxInstallmentAgreement |
| TaxInstallmentRule | 0 | — |
| TaxIntegrationEvent | 0 | — |
| TaxParameter | 0 | tax → Tax |
| Taxpayer | 64 | — |
| TaxpayerPortalAccess | 0 | — |
| TaxPayment | 0 | guide → TaxGuide |
| TaxPrizeCoupon | 0 | draw → TaxPrizeDraw |
| TaxPrizeDraw | 0 | — |
| TaxPrizeExecution | 0 | draw → TaxPrizeDraw |
| TaxPrizeWinner | 0 | execution → TaxPrizeExecution; coupon → TaxPrizeCoupon |
| TaxProtestBatch | 0 | — |
| TaxProtestItem | 0 | batch → TaxProtestBatch |
| TaxRegistryEntry | 23 | — |
| TaxRevenueIntegrationEvent | 0 | taxPayment → TaxPayment; revenue → Revenue |
| TaxServiceActivity | 0 | tax → Tax |
| TaxServiceRequest | 0 | taxpayer → Taxpayer |
| Teacher | 2 | employee → Employee |
| TeacherAcademicRecord | 0 | schoolClass → SchoolClass; teacher → Teacher |
| TeacherClassAssignment | 6 | schoolClass → SchoolClass; teacher → Teacher; subject → SchoolSubject |
| TermOfReference | 10 | process → PurchaseProcess |
| Ticket | 20 | channel → SupportChannel |
| TicketAuditLog | 0 | ticket → Ticket; user → Usuario |
| TicketDocument | 0 | ticket → Ticket; document → Document |
| TicketInteraction | 0 | ticket → Ticket |
| TicketMovement | 0 | ticket → Ticket; toDepartment → Department; employee → Employee |
| TrafficInfractionTicket | 0 | — |
| TransparencyAccess | 0 | — |
| TransparencyCitizenAppeal | 0 | request → TransparencyCitizenRequest |
| TransparencyCitizenRequest | 0 | — |
| TransparencyCriterion | 181 | — |
| TransparencyCriterionEvidence | 60 | criterion → TransparencyCriterion |
| TransparencyNativeBinding | 0 | governmentEntity → GovernmentEntity |
| TransparencyPublication | 154 | — |
| TransparencySatisfaction | 0 | request → TransparencyCitizenRequest |
| TreasuryMovement | 0 | bankAccount → BankAccount; financialYear → FinancialYear |
| TreasuryTransfer | 0 | sourceBankAccount → BankAccount; destinationBankAccount → BankAccount; sourceMovement → TreasuryMovement; destinationMovement → TreasuryMovement |
| Usuario | 21 | perfil → ConfiguracaoPerfil |
| UsuarioModulo | 0 | usuario → Usuario; modulo → ConfiguracaoModulo |
| UsuarioUnidadeGestora | 56 | usuario → Usuario; budgetUnit → BudgetUnit |
| Vacation | 3 | employee → Employee |
| VaccinationRecord | 0 | vaccine → Vaccine; patient → Patient; professional → HealthProfessional; unit → HealthUnit |
| Vaccine | 0 | — |
| VafAccountant | 0 | — |
| VafActivity | 0 | exercise → VafExercise; company → VafCompany |
| VafCfopEntry | 0 | exercise → VafExercise; company → VafCompany |
| VafCompany | 0 | — |
| VafCompanyIndex | 0 | exercise → VafExercise; company → VafCompany |
| VafCrossCheck | 0 | exercise → VafExercise; company → VafCompany |
| VafEfdImport | 0 | company → VafCompany; exercise → VafExercise |
| VafEstimate | 0 | exercise → VafExercise |
| VafExercise | 0 | — |
| VafGiaImport | 0 | company → VafCompany; exercise → VafExercise |
| VafMonthlySummary | 0 | exercise → VafExercise; company → VafCompany |
| VafMunicipalIndex | 0 | exercise → VafExercise |
| VafNotification | 0 | — |
| VafProtocol | 0 | exercise → VafExercise |
| VafRepasse | 0 | exercise → VafExercise |
| VafResult | 0 | exercise → VafExercise; company → VafCompany |
| VafRule | 0 | exercise → VafExercise |
| Warehouse | 11 | — |
| WaterMeterReading | 0 | — |
| WithholdingPayable | 0 | retention → PaymentRetention |
| YieldTransaction | 0 | — |
