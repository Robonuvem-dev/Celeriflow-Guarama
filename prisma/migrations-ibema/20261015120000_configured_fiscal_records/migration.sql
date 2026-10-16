CREATE UNIQUE INDEX "TaxRegistryEntry_typed_catalog_version_key"
ON "TaxRegistryEntry" ("entityType", "entityId", "category", "version") WHERE category = 'TYPED_FISCAL_CATALOG';
CREATE UNIQUE INDEX "TaxRegistryEntry_typed_record_version_key"
ON "TaxRegistryEntry" ("entityType", "entityId", "category", "title", "version") WHERE category = 'TYPED_FISCAL_RECORD';
CREATE FUNCTION protect_typed_fiscal_record() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.category IN ('TYPED_FISCAL_CATALOG', 'TYPED_FISCAL_RECORD', 'CADASTRAL_OPERATION') THEN
    RAISE EXCEPTION 'Catálogo/formulário fiscal imutável: publique uma nova versão.';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "TaxRegistryEntry_typed_fiscal_immutable" BEFORE UPDATE OR DELETE ON "TaxRegistryEntry"
FOR EACH ROW EXECUTE FUNCTION protect_typed_fiscal_record();
