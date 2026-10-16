-- Objetos PostgreSQL que nao sao reproduzidos integralmente pelo schema Prisma.
-- Executar somente depois de 001_full_schema.sql.

BEGIN;

-- Checks de dominio e consistencia presentes no historico do Divino.
ALTER TABLE "ProtocolNotification" ADD CONSTRAINT "ProtocolNotification_priority_check" CHECK ("priority" IN ('BAIXA', 'NORMAL', 'ALTA', 'URGENTE'));
ALTER TABLE "ReportTemplate" ADD CONSTRAINT "ReportTemplate_orientation_check" CHECK ("orientation" IN ('PORTRAIT', 'LANDSCAPE'));

ALTER TABLE "PersonMergeRequest" ADD CONSTRAINT "PersonMergeRequest_distinct_people" CHECK ("sourcePersonId" <> "targetPersonId");
ALTER TABLE "PersonMergeRequest" ADD CONSTRAINT "PersonMergeRequest_status" CHECK ("status" IN ('PROPOSED', 'EXECUTED', 'REVERSED'));
ALTER TABLE "PersonMergeRequest" ADD CONSTRAINT "PersonMergeRequest_execution_approval" CHECK (("status" = 'PROPOSED' AND "approvedByUsuarioId" IS NULL AND "executedAt" IS NULL) OR ("status" IN ('EXECUTED', 'REVERSED') AND "approvedByUsuarioId" IS NOT NULL AND "executedAt" IS NOT NULL));
ALTER TABLE "PersonMergeRequest" ADD CONSTRAINT "PersonMergeRequest_two_administrators" CHECK ("approvedByUsuarioId" IS NULL OR "approvedByUsuarioId" <> "proposedByUsuarioId");
ALTER TABLE "PersonMergeLedger" ADD CONSTRAINT "PersonMergeLedger_distinct_people" CHECK ("sourcePersonId" <> "targetPersonId");
ALTER TABLE "PersonMergeLedger" ADD CONSTRAINT "PersonMergeLedger_event_type" CHECK ("eventType" IN ('PROPOSED', 'EXECUTED', 'REVERSED'));

ALTER TABLE "GenericProcessWorkflowDefinition" ADD CONSTRAINT "GenericProcessWorkflowDefinition_status_check" CHECK ("status" IN ('DRAFT', 'PUBLISHED'));
ALTER TABLE "GenericProcessWorkflowStage" ADD CONSTRAINT "GenericProcessWorkflowStage_position_check" CHECK ("position" > 0);
ALTER TABLE "GenericProcessWorkflowStage" ADD CONSTRAINT "GenericProcessWorkflowStage_slaCalendarDays_check" CHECK ("slaCalendarDays" > 0);
ALTER TABLE "GenericProcessWorkflowStage" ADD CONSTRAINT "GenericProcessWorkflowStage_requiredDocument_check" CHECK (NOT "requiresSignedDocument" OR "requiredDocumentClassId" IS NOT NULL);
ALTER TABLE "GenericProcessWorkflowInstance" ADD CONSTRAINT "GenericProcessWorkflowInstance_status_check" CHECK ("status" IN ('ACTIVE', 'REJECTED', 'CONCLUDED'));
ALTER TABLE "GenericProcessWorkflowInstance" ADD CONSTRAINT "GenericProcessWorkflowInstance_currentPosition_check" CHECK ("currentPosition" > 0);

ALTER TABLE "HrPayrollRuleSet" ADD CONSTRAINT "HrPayrollRuleSet_effectiveRange_check" CHECK ("effectiveUntil" IS NULL OR "effectiveUntil" > "effectiveFrom");
ALTER TABLE "HrSocialSecurityBand" ADD CONSTRAINT "HrSocialSecurityBand_range_check" CHECK ("upperLimit" IS NULL OR "upperLimit" > "lowerLimit");
ALTER TABLE "HrSocialSecurityBand" ADD CONSTRAINT "HrSocialSecurityBand_employeeRate_check" CHECK ("employeeRate" >= 0 AND "employeeRate" <= 100);
ALTER TABLE "HrSocialSecurityBand" ADD CONSTRAINT "HrSocialSecurityBand_employerRate_check" CHECK ("employerRate" IS NULL OR ("employerRate" >= 0 AND "employerRate" <= 100));
ALTER TABLE "HrVacationPolicy" ADD CONSTRAINT "HrVacationPolicy_months_check" CHECK ("acquisitionMonths" > 0 AND "concessionMonths" > 0);
ALTER TABLE "HrVacationPolicy" ADD CONSTRAINT "HrVacationPolicy_days_check" CHECK ("entitlementDays" > 0 AND "maxSplits" > 0 AND "minFirstSplitDays" > 0 AND "minOtherSplitDays" > 0);
ALTER TABLE "HrVacationPolicy" ADD CONSTRAINT "HrVacationPolicy_additionalPayRate_check" CHECK ("additionalPayRate" >= 0 AND "additionalPayRate" <= 100);
ALTER TABLE "HrVacationPolicy" ADD CONSTRAINT "HrVacationPolicy_abono_check" CHECK ("maxCashAbonoDays" >= 0);
ALTER TABLE "HrCalculationPolicy" ADD CONSTRAINT "HrCalculationPolicy_roundingScale_check" CHECK ("roundingScale" >= 0 AND "roundingScale" <= 6);
ALTER TABLE "HrCalculationPolicy" ADD CONSTRAINT "HrCalculationPolicy_cutoffDay_check" CHECK ("movementCutoffDay" >= 1 AND "movementCutoffDay" <= 31);
ALTER TABLE "HrCalculationPolicy" ADD CONSTRAINT "HrCalculationPolicy_paymentDay_check" CHECK ("paymentDay" IS NULL OR ("paymentDay" >= 1 AND "paymentDay" <= 31));
ALTER TABLE "HrCalculationPolicy" ADD CONSTRAINT "HrCalculationPolicy_consignment_check" CHECK ("maxConsignmentMarginRate" IS NULL OR ("maxConsignmentMarginRate" >= 0 AND "maxConsignmentMarginRate" <= 100));
ALTER TABLE "HrEmploymentRegime" ADD CONSTRAINT "HrEmploymentRegime_hours_check" CHECK ("defaultMonthlyHours" IS NULL OR "defaultMonthlyHours" > 0);

ALTER TABLE "PurchasePlanning" ADD CONSTRAINT "PurchasePlanning_quantity_check" CHECK ("quantity" > 0);
ALTER TABLE "PurchasePlanning" ADD CONSTRAINT "PurchasePlanning_estimatedValueDecimal_check" CHECK ("estimatedValueDecimal" >= 0);
ALTER TABLE "PurchasePlanning" ADD CONSTRAINT "PurchasePlanning_expectedPeriod_check" CHECK ("expectedPeriodEnd" >= "expectedPeriodStart");
ALTER TABLE "PurchaseRequestItemBudgetAllocation" ADD CONSTRAINT "PurchaseRequestItemBudgetAllocation_quantity_check" CHECK ("quantity" > 0);
ALTER TABLE "PurchaseRequestItemBudgetAllocation" ADD CONSTRAINT "PurchaseRequestItemBudgetAllocation_valueDecimal_check" CHECK ("valueDecimal" >= 0);
ALTER TABLE "PurchaseProcessItemOrigin" ADD CONSTRAINT "PurchaseProcessItemOrigin_quantity_check" CHECK ("quantity" > 0);
ALTER TABLE "BiddingPhase" ADD CONSTRAINT "BiddingPhase_sequence_check" CHECK ("sequence" > 0);
ALTER TABLE "BiddingPhase" ADD CONSTRAINT "BiddingPhase_version_check" CHECK ("version" > 0);
ALTER TABLE "BiddingLot" ADD CONSTRAINT "BiddingLot_number_check" CHECK ("number" > 0);
ALTER TABLE "BiddingLot" ADD CONSTRAINT "BiddingLot_estimatedValueDecimal_check" CHECK ("estimatedValueDecimal" IS NULL OR "estimatedValueDecimal" >= 0);
ALTER TABLE "BiddingLotItem" ADD CONSTRAINT "BiddingLotItem_quantity_check" CHECK ("quantity" > 0);
ALTER TABLE "BiddingBid" ADD CONSTRAINT "BiddingBid_sequence_check" CHECK ("sequence" > 0);
ALTER TABLE "BiddingBid" ADD CONSTRAINT "BiddingBid_unitValueDecimal_check" CHECK ("unitValueDecimal" IS NULL OR "unitValueDecimal" > 0);
ALTER TABLE "BiddingBid" ADD CONSTRAINT "BiddingBid_totalValueDecimal_check" CHECK ("totalValueDecimal" > 0);
ALTER TABLE "BiddingResult" ADD CONSTRAINT "BiddingResult_unitValueDecimal_check" CHECK ("unitValueDecimal" IS NULL OR "unitValueDecimal" >= 0);
ALTER TABLE "BiddingResult" ADD CONSTRAINT "BiddingResult_totalValueDecimal_check" CHECK ("totalValueDecimal" >= 0);
ALTER TABLE "InstrumentResponsibilityGroup" ADD CONSTRAINT "InstrumentResponsibilityGroup_one_parent_check" CHECK (("contractId" IS NOT NULL AND "covenantId" IS NULL) OR ("contractId" IS NULL AND "covenantId" IS NOT NULL));
ALTER TABLE "InstrumentParty" ADD CONSTRAINT "InstrumentParty_one_parent_check" CHECK (("contractId" IS NOT NULL AND "covenantId" IS NULL) OR ("contractId" IS NULL AND "covenantId" IS NOT NULL));
ALTER TABLE "InstrumentParty" ADD CONSTRAINT "InstrumentParty_one_identity_check" CHECK ((CASE WHEN "supplierId" IS NULL THEN 0 ELSE 1 END) + (CASE WHEN "personId" IS NULL THEN 0 ELSE 1 END) + (CASE WHEN "companyId" IS NULL THEN 0 ELSE 1 END) + (CASE WHEN "employeeId" IS NULL THEN 0 ELSE 1 END) = 1);
ALTER TABLE "InstrumentMeasurement" ADD CONSTRAINT "InstrumentMeasurement_one_parent_check" CHECK (("contractId" IS NOT NULL AND "covenantId" IS NULL) OR ("contractId" IS NULL AND "covenantId" IS NOT NULL));
ALTER TABLE "InstrumentMeasurement" ADD CONSTRAINT "InstrumentMeasurement_number_check" CHECK ("number" > 0);
ALTER TABLE "InstrumentMeasurement" ADD CONSTRAINT "InstrumentMeasurement_quantity_check" CHECK ("quantity" IS NULL OR "quantity" >= 0);
ALTER TABLE "InstrumentMeasurement" ADD CONSTRAINT "InstrumentMeasurement_valueDecimal_check" CHECK ("valueDecimal" >= 0);
ALTER TABLE "InstrumentMeasurementItem" ADD CONSTRAINT "InstrumentMeasurementItem_quantity_check" CHECK ("quantity" > 0);
ALTER TABLE "InstrumentMeasurementItem" ADD CONSTRAINT "InstrumentMeasurementItem_unitValueDecimal_check" CHECK ("unitValueDecimal" IS NULL OR "unitValueDecimal" >= 0);
ALTER TABLE "InstrumentMeasurementItem" ADD CONSTRAINT "InstrumentMeasurementItem_valueDecimal_check" CHECK ("valueDecimal" >= 0);
ALTER TABLE "InstrumentInstallment" ADD CONSTRAINT "InstrumentInstallment_one_parent_check" CHECK (("contractId" IS NOT NULL AND "covenantId" IS NULL) OR ("contractId" IS NULL AND "covenantId" IS NOT NULL));
ALTER TABLE "InstrumentInstallment" ADD CONSTRAINT "InstrumentInstallment_number_check" CHECK ("number" > 0);
ALTER TABLE "InstrumentInstallment" ADD CONSTRAINT "InstrumentInstallment_quantity_check" CHECK ("quantity" IS NULL OR "quantity" >= 0);
ALTER TABLE "InstrumentInstallment" ADD CONSTRAINT "InstrumentInstallment_valueDecimal_check" CHECK ("valueDecimal" >= 0);

-- Unicidade apenas para identificadores opcionais nao nulos.
CREATE UNIQUE INDEX IF NOT EXISTS "BankAccount_externalId_key" ON "BankAccount"("externalId") WHERE "externalId" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "Payment_paymentOrderExternalId_key" ON "Payment"("paymentOrderExternalId") WHERE "paymentOrderExternalId" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "Payment_integrationEventId_key" ON "Payment"("integrationEventId") WHERE "integrationEventId" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "Payment_bankTransactionId_key" ON "Payment"("bankTransactionId") WHERE "bankTransactionId" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "Payment_reversalBankTransactionId_key" ON "Payment"("reversalBankTransactionId") WHERE "reversalBankTransactionId" IS NOT NULL;

-- Historicos append-only.
CREATE OR REPLACE FUNCTION prevent_financial_audit_log_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'FinancialAuditLog e append-only e nao pode ser alterado ou excluido';
END;
$$;
CREATE TRIGGER "FinancialAuditLog_append_only" BEFORE UPDATE OR DELETE ON "FinancialAuditLog" FOR EACH ROW EXECUTE FUNCTION prevent_financial_audit_log_mutation();

CREATE OR REPLACE FUNCTION prevent_audit_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'AuditEvent e append-only e nao pode ser alterado ou excluido';
END;
$$;
CREATE TRIGGER "AuditEvent_append_only" BEFORE UPDATE OR DELETE ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION prevent_audit_event_mutation();

CREATE OR REPLACE FUNCTION prevent_person_merge_ledger_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'PersonMergeLedger e append-only e nao pode ser alterado ou excluido';
END;
$$;
CREATE TRIGGER "PersonMergeLedger_append_only" BEFORE UPDATE OR DELETE ON "PersonMergeLedger" FOR EACH ROW EXECUTE FUNCTION prevent_person_merge_ledger_mutation();

CREATE OR REPLACE FUNCTION prevent_hr_payroll_configuration_change_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'HrPayrollConfigurationChange e append-only e nao pode ser alterado ou excluido';
END;
$$;
CREATE TRIGGER "HrPayrollConfigurationChange_append_only" BEFORE UPDATE OR DELETE ON "HrPayrollConfigurationChange" FOR EACH ROW EXECUTE FUNCTION prevent_hr_payroll_configuration_change_mutation();

-- Integridade de versoes e assinaturas GED.
CREATE OR REPLACE FUNCTION protect_document_version_integrity() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND (OLD."lockedAt" IS NOT NULL OR OLD.status IN ('PENDING_SIGNATURE', 'SIGNED')) THEN
    RAISE EXCEPTION 'Locked or signed document versions cannot be deleted';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW."documentId" IS DISTINCT FROM OLD."documentId" OR NEW."versionNumber" IS DISTINCT FROM OLD."versionNumber" OR NEW."fileUrl" IS DISTINCT FROM OLD."fileUrl" OR NEW."hashSha256" IS DISTINCT FROM OLD."hashSha256" OR NEW."publicValidationCode" IS DISTINCT FROM OLD."publicValidationCode" OR NEW."finalizedAt" IS DISTINCT FROM OLD."finalizedAt" THEN
      RAISE EXCEPTION 'Document version identity and evidence are immutable';
    END IF;
    IF OLD."lockedAt" IS NOT NULL AND NEW."lockedAt" IS DISTINCT FROM OLD."lockedAt" THEN RAISE EXCEPTION 'A locked document version cannot be unlocked or relocked'; END IF;
    IF OLD.status = 'SIGNED' AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Signed document versions cannot be changed'; END IF;
    IF OLD.status = 'PENDING_SIGNATURE' AND NEW.status NOT IN ('PENDING_SIGNATURE', 'SIGNED') THEN RAISE EXCEPTION 'A locked document version can only complete signing'; END IF;
    IF NEW.status IN ('PENDING_SIGNATURE', 'SIGNED') AND NEW."lockedAt" IS NULL THEN RAISE EXCEPTION 'Signing document versions must be locked'; END IF;
    IF NEW.status = 'SIGNED' AND EXISTS (SELECT 1 FROM "DocumentSignature" WHERE "documentVersionId" = NEW.id AND "isRequired" = true AND status <> 'SIGNED') THEN RAISE EXCEPTION 'Every required signature must be signed before version completion'; END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "DocumentVersion_protect_integrity" BEFORE UPDATE OR DELETE ON "DocumentVersion" FOR EACH ROW EXECUTE FUNCTION protect_document_version_integrity();

CREATE OR REPLACE FUNCTION protect_document_signature_integrity() RETURNS trigger AS $$
DECLARE version_hash TEXT;
DECLARE version_document_id TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Document signatures are append-only'; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status <> 'PENDING' OR NEW.status <> 'SIGNED' THEN RAISE EXCEPTION 'A signature can only transition once from pending to signed'; END IF;
    IF NEW."documentId" IS DISTINCT FROM OLD."documentId" OR NEW."documentVersionId" IS DISTINCT FROM OLD."documentVersionId" OR NEW."signerUsuarioId" IS DISTINCT FROM OLD."signerUsuarioId" OR NEW."signerEmployeeId" IS DISTINCT FROM OLD."signerEmployeeId" OR NEW."signerName" IS DISTINCT FROM OLD."signerName" OR NEW."signerEmail" IS DISTINCT FROM OLD."signerEmail" OR NEW."signatureType" IS DISTINCT FROM OLD."signatureType" OR NEW.provider IS DISTINCT FROM OLD.provider OR NEW."documentHash" IS DISTINCT FROM OLD."documentHash" OR NEW."verificationCode" IS DISTINCT FROM OLD."verificationCode" OR NEW."requestedByUsuarioId" IS DISTINCT FROM OLD."requestedByUsuarioId" OR NEW."isRequired" IS DISTINCT FROM OLD."isRequired" OR NEW."requestedAt" IS DISTINCT FROM OLD."requestedAt" THEN
      RAISE EXCEPTION 'Signature identity and evidence are immutable';
    END IF;
    IF NEW.status = 'SIGNED' AND NEW."signedAt" IS NULL THEN RAISE EXCEPTION 'A signed signature requires a signing timestamp'; END IF;
  END IF;
  SELECT "hashSha256", "documentId" INTO version_hash, version_document_id FROM "DocumentVersion" WHERE id = NEW."documentVersionId";
  IF version_hash IS NULL OR version_document_id IS DISTINCT FROM NEW."documentId" OR version_hash IS DISTINCT FROM NEW."documentHash" THEN RAISE EXCEPTION 'Signature must match its document version and hash'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "DocumentSignature_protect_integrity" BEFORE INSERT OR UPDATE OR DELETE ON "DocumentSignature" FOR EACH ROW EXECUTE FUNCTION protect_document_signature_integrity();

-- Protecoes dos workflows genericos.
CREATE OR REPLACE FUNCTION protect_generic_process_workflow_definition() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.status = 'PUBLISHED' THEN RAISE EXCEPTION 'Published generic process workflow definitions cannot be deleted'; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'PUBLISHED' THEN RAISE EXCEPTION 'Published generic process workflow definitions are immutable'; END IF;
  IF TG_OP = 'UPDATE' AND NEW.status = 'PUBLISHED' AND (NEW."publishedAt" IS NULL OR NEW."publishedByUsuarioId" IS NULL) THEN RAISE EXCEPTION 'Published generic process workflow definitions require publication evidence'; END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "GenericProcessWorkflowDefinition_protect_published" BEFORE UPDATE OR DELETE ON "GenericProcessWorkflowDefinition" FOR EACH ROW EXECUTE FUNCTION protect_generic_process_workflow_definition();

CREATE OR REPLACE FUNCTION protect_generic_process_workflow_stage() RETURNS trigger AS $$
DECLARE definition_status TEXT;
BEGIN
  SELECT status INTO definition_status FROM "GenericProcessWorkflowDefinition" WHERE id = COALESCE(NEW."definitionId", OLD."definitionId");
  IF definition_status = 'PUBLISHED' THEN RAISE EXCEPTION 'Published generic process workflow stages are immutable'; END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "GenericProcessWorkflowStage_protect_published" BEFORE INSERT OR UPDATE OR DELETE ON "GenericProcessWorkflowStage" FOR EACH ROW EXECUTE FUNCTION protect_generic_process_workflow_stage();

CREATE OR REPLACE FUNCTION prevent_generic_process_workflow_event_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Generic process workflow execution history is append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "GenericProcessWorkflowEvent_append_only" BEFORE UPDATE OR DELETE ON "GenericProcessWorkflowEvent" FOR EACH ROW EXECUTE FUNCTION prevent_generic_process_workflow_event_mutation();

-- Projecao entre patrimonio e frota.
CREATE OR REPLACE FUNCTION fleet_unit_projection() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a "Asset"%ROWTYPE;
BEGIN
  IF NEW."assetId" IS NOT NULL THEN
    SELECT * INTO STRICT a FROM "Asset" WHERE "id" = NEW."assetId";
    NEW."departmentId" := a."departmentId";
    NEW."responsibleId" := a."responsibleId";
    NEW."patrimonyStatus" := a."status";
  ELSE
    NEW."patrimonyStatus" := NULL;
  END IF;
  NEW."status" := CASE
    WHEN NEW."patrimonyStatus" IN ('Baixado', 'Inativo') OR NEW."departmentId" IS NULL THEN 'INATIVO'
    WHEN NEW."patrimonyStatus" = 'Em manutenção' OR EXISTS (SELECT 1 FROM "FleetWorkOrder" WHERE "unitId" = NEW."id" AND "status" = 'EM_EXECUCAO') THEN 'EM_MANUTENCAO'
    ELSE NEW."operationalStatus"
  END;
  IF NEW."parentId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "FleetUnit" WHERE "id" = NEW."parentId" AND "departmentId" IS NOT DISTINCT FROM NEW."departmentId") THEN NEW."parentId" := NULL; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fleet_unit_projection BEFORE INSERT OR UPDATE ON "FleetUnit" FOR EACH ROW EXECUTE FUNCTION fleet_unit_projection();

CREATE OR REPLACE FUNCTION fleet_asset_changed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(OLD."departmentId", OLD."responsibleId", OLD."status") IS DISTINCT FROM ROW(NEW."departmentId", NEW."responsibleId", NEW."status") THEN
    INSERT INTO "FleetAssetEvent" ("id", "unitId", "assetId", "type", "fromDepartmentId", "toDepartmentId", "fromResponsibleId", "toResponsibleId", "fromStatus", "toStatus") SELECT md5(random()::text || clock_timestamp()::text || u."id"), u."id", NEW."id", 'PATRIMONIO_ALTERADO', OLD."departmentId", NEW."departmentId", OLD."responsibleId", NEW."responsibleId", OLD."status", NEW."status" FROM "FleetUnit" u WHERE u."assetId" = NEW."id";
    UPDATE "FleetUnit" SET "updatedAt" = clock_timestamp() WHERE "assetId" = NEW."id";
    UPDATE "FleetUnit" child SET "parentId" = NULL, "updatedAt" = clock_timestamp() FROM "FleetUnit" parent WHERE child."parentId" = parent."id" AND parent."assetId" = NEW."id" AND child."departmentId" IS DISTINCT FROM NEW."departmentId";
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fleet_asset_changed AFTER UPDATE OF "departmentId", "responsibleId", "status" ON "Asset" FOR EACH ROW EXECUTE FUNCTION fleet_asset_changed();

CREATE OR REPLACE FUNCTION fleet_import_asset_maintenance(maintenance_id text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE m "AssetMaintenance"%ROWTYPE; u "FleetUnit"%ROWTYPE; order_id text;
BEGIN
  SELECT * INTO m FROM "AssetMaintenance" WHERE "id" = maintenance_id;
  SELECT * INTO u FROM "FleetUnit" WHERE "assetId" = m."assetId";
  IF u."id" IS NULL OR m."status" <> 'Concluída' OR m."endDate" IS NULL THEN RETURN; END IF;
  SELECT "id" INTO order_id FROM "FleetWorkOrder" WHERE "assetMaintenanceId" = m."id";
  INSERT INTO "FleetExpense" ("id", "unitId", "nature", "occurredAt", "amount", "description", "sourceType", "sourceId", "sourceKey", "reference", "createdById") VALUES (md5(random()::text || clock_timestamp()::text), u."id", 'MANUTENCAO', m."endDate"::date, round(m."cost"::numeric, 2), m."description", CASE WHEN order_id IS NULL THEN 'PATRIMONIO' ELSE 'OS' END, coalesce(order_id, m."id"), 'asset-maintenance:' || m."id", 'Manutenção patrimonial ' || m."id", u."createdById") ON CONFLICT ("sourceKey") DO UPDATE SET "amount" = EXCLUDED."amount", "occurredAt" = EXCLUDED."occurredAt", "description" = EXCLUDED."description", "sourceType" = EXCLUDED."sourceType", "sourceId" = EXCLUDED."sourceId";
END $$;

CREATE OR REPLACE FUNCTION fleet_asset_maintenance_changed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."status" = 'Em manutenção' AND NEW."fleetPreviousStatus" IS NULL THEN NEW."fleetPreviousStatus" := coalesce((SELECT "fleetPreviousStatus" FROM "AssetMaintenance" WHERE "assetId" = NEW."assetId" AND "status" = 'Em manutenção' AND "fleetPreviousStatus" IS NOT NULL ORDER BY "createdAt" LIMIT 1), (SELECT "status" FROM "Asset" WHERE "id" = NEW."assetId")); END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fleet_asset_maintenance_before BEFORE INSERT OR UPDATE ON "AssetMaintenance" FOR EACH ROW EXECUTE FUNCTION fleet_asset_maintenance_changed();

CREATE OR REPLACE FUNCTION fleet_asset_maintenance_after() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."status" = 'Concluída' AND NEW."endDate" IS NOT NULL THEN
    UPDATE "FleetWorkOrder" SET "status" = 'CONCLUIDA', "completedAt" = NEW."endDate"::date, "performed" = NEW."description", "result" = 'Concluída em Patrimônio', "actualCost" = round(NEW."cost"::numeric, 2), "updatedAt" = clock_timestamp() WHERE "assetMaintenanceId" = NEW."id" AND "status" <> 'CONCLUIDA';
    UPDATE "FleetPlan" p SET "nextDueAt" = o."scheduledAt" + o."intervalDays", "updatedAt" = clock_timestamp() FROM "FleetWorkOrder" o WHERE o."assetMaintenanceId" = NEW."id" AND p."id" = o."planId" AND p."nextDueAt" <= o."scheduledAt";
  END IF;
  PERFORM fleet_import_asset_maintenance(NEW."id");
  IF NEW."status" = 'Em manutenção' THEN
    UPDATE "Asset" SET "status" = 'Em manutenção', "updatedAt" = clock_timestamp() WHERE "id" = NEW."assetId" AND "status" <> 'Baixado' AND "status" <> 'Em manutenção';
  ELSIF TG_OP = 'UPDATE' AND OLD."status" = 'Em manutenção' AND NOT EXISTS (SELECT 1 FROM "AssetMaintenance" WHERE "assetId" = NEW."assetId" AND "status" = 'Em manutenção') THEN
    UPDATE "Asset" SET "status" = coalesce(nullif(NEW."fleetPreviousStatus", 'Em manutenção'), 'Ativo'), "updatedAt" = clock_timestamp() WHERE "id" = NEW."assetId" AND "status" = 'Em manutenção';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fleet_asset_maintenance_after AFTER INSERT OR UPDATE ON "AssetMaintenance" FOR EACH ROW EXECUTE FUNCTION fleet_asset_maintenance_after();

CREATE OR REPLACE FUNCTION fleet_unit_linked() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."assetId" IS NOT NULL THEN PERFORM fleet_import_asset_maintenance("id") FROM "AssetMaintenance" WHERE "assetId" = NEW."assetId" AND "status" = 'Concluída'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fleet_unit_linked AFTER INSERT OR UPDATE OF "assetId" ON "FleetUnit" FOR EACH ROW EXECUTE FUNCTION fleet_unit_linked();

CREATE OR REPLACE FUNCTION fleet_order_changed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE "FleetUnit" SET "updatedAt" = clock_timestamp() WHERE "id" = NEW."unitId";
  RETURN NEW;
END $$;
CREATE TRIGGER fleet_order_changed AFTER INSERT OR UPDATE ON "FleetWorkOrder" FOR EACH ROW EXECUTE FUNCTION fleet_order_changed();

CREATE OR REPLACE FUNCTION fleet_asset_writeoff_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."status" = 'Baixado' AND OLD."status" <> 'Baixado' AND EXISTS (SELECT 1 FROM "AssetMaintenance" WHERE "assetId" = NEW."id" AND "status" IN ('Solicitada', 'Em manutenção')) THEN RAISE EXCEPTION 'Conclua as manutenções abertas antes da baixa patrimonial.'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fleet_asset_writeoff_guard BEFORE UPDATE OF "status" ON "Asset" FOR EACH ROW EXECUTE FUNCTION fleet_asset_writeoff_guard();

COMMIT;
