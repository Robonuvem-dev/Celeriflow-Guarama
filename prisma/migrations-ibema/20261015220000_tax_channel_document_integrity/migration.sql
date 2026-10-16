-- Preserve a locally configured class, including an intentional deactivation.
INSERT INTO "DocumentClass" ("id", "code", "label", "signaturePolicy", "isActive", "createdAt", "updatedAt")
VALUES ('itbi-evidence-class', 'ITBI_EVIDENCE', 'Anexo de ITBI', 'EXTERNAL_PROVIDER_REQUIRED', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "DocumentClass" ("id", "code", "label", "signaturePolicy", "isActive", "createdAt", "updatedAt")
VALUES ('tax-license-signed-class', 'TAX_LICENSE_SIGNED', 'Alvará municipal assinado', 'ICP_REQUIRED', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

CREATE UNIQUE INDEX "TaxRegistryEntry_license_signature_key"
ON "TaxRegistryEntry" ("entityType", "entityId") WHERE category = 'LICENSE_SIGNATURE';

CREATE UNIQUE INDEX "TaxRegistryEntry_tax_channel_policy_version_key"
ON "TaxRegistryEntry" ("entityType", "entityId", category, version)
WHERE category IN ('ITBI_CORRESPONDENCE', 'ITBI_FISCAL_TREATMENT', 'ITBI_DOCUMENT_MODEL', 'ITBI_ENTRY_POLICY', 'ONLINE_ITBI_POLICY', 'ITBI_NOTARY', 'ITBI_EXPIRY_POLICY', 'SIMPLES_OPTION_LAYOUT', 'SIMPLES_OPTION_DECISION', 'BENEFIT_REPORT_CLASSIFICATION');

CREATE UNIQUE INDEX "TaxRegistryEntry_tax_channel_single_event_key"
ON "TaxRegistryEntry" ("entityType", "entityId", category)
WHERE category IN ('ONLINE_ITBI_REQUEST', 'ITBI_RECTIFICATION', 'ITBI_DOCUMENT_ISSUANCE', 'ECONOMIC_DOCUMENT_ISSUANCE', 'ECONOMIC_DOCUMENT_POSITION', 'ITBI_AUTOMATIC_CANCELLATION', 'SIMPLES_OPTION_FILE', 'SIMPLES_OPTION_EXPORT', 'DEBT_NOTICE_ISSUANCE', 'DEBT_NOTICE_CANCELLATION', 'DEBT_NOTICE_BATCH');

CREATE UNIQUE INDEX "TaxRegistryEntry_simples_option_file_identity_key"
ON "TaxRegistryEntry" (title)
WHERE "entityType" = 'SIMPLES_OPTION_FILE' AND category = 'SIMPLES_OPTION_FILE';

CREATE UNIQUE INDEX "TaxRegistryEntry_conditional_discount_payment_key"
ON "TaxRegistryEntry" ("entityId", (data->>'paymentKey'))
WHERE "entityType" = 'TAX_ASSESSMENT' AND category = 'CONDITIONAL_DISCOUNT';

CREATE UNIQUE INDEX "TaxRegistryEntry_conditional_discount_reversal_key"
ON "TaxRegistryEntry" ((data->>'issuanceId'))
WHERE "entityType" = 'TAX_ASSESSMENT' AND category = 'CONDITIONAL_DISCOUNT_REVERSAL';

CREATE UNIQUE INDEX "TaxRegistryEntry_online_itbi_draft_attachment_key"
ON "TaxRegistryEntry" ("entityType", "entityId", (data->>'url'))
WHERE category = 'ONLINE_ITBI_DRAFT_ATTACHMENT';

CREATE FUNCTION preserve_tax_channel_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.category IN ('ITBI_CORRESPONDENCE', 'ITBI_FISCAL_TREATMENT', 'ITBI_RECTIFICATION', 'ITBI_DOCUMENT_MODEL', 'ITBI_DOCUMENT_ISSUANCE', 'ONLINE_ITBI_POLICY', 'ITBI_NOTARY', 'ONLINE_ITBI_REQUEST',
    'ITBI_EXPIRY_POLICY', 'ITBI_AUTOMATIC_CANCELLATION', 'SIMPLES_OPTION_LAYOUT', 'SIMPLES_OPTION_FILE',
    'SIMPLES_OPTION_EXPORT', 'SIMPLES_OPTION_DECISION', 'BENEFIT_REPORT_CLASSIFICATION',
    'DEBT_NOTICE_ISSUANCE', 'DEBT_NOTICE_CANCELLATION', 'DEBT_NOTICE_REFERENCE', 'DEBT_NOTICE_BATCH', 'ANNUAL_GUIDE_SCHEDULE',
    'CONDITIONAL_DISCOUNT', 'CONDITIONAL_DISCOUNT_REVERSAL', 'ECONOMIC_DOCUMENT_ISSUANCE', 'ECONOMIC_DOCUMENT_POSITION', 'LICENSE_SIGNATURE', 'ITBI_ENTRY_POLICY', 'ONLINE_ITBI_DRAFT_ATTACHMENT') THEN
    RAISE EXCEPTION 'Histórico tributário imutável: registre nova versão ou evento.';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "TaxRegistryEntry_tax_channel_history_immutable"
BEFORE UPDATE OR DELETE ON "TaxRegistryEntry"
FOR EACH ROW EXECUTE FUNCTION preserve_tax_channel_history();
