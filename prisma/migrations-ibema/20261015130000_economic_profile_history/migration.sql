CREATE UNIQUE INDEX "TaxRegistryEntry_economic_profile_version_key"
ON "TaxRegistryEntry" ("entityType", "entityId", "version") WHERE category = 'ECONOMIC_PROFILE';
CREATE UNIQUE INDEX "TaxRegistryEntry_unique_accountant_key"
ON "TaxRegistryEntry" ("entityId") WHERE "entityType" = 'TAXPAYER' AND category = 'ACCOUNTANT';
CREATE FUNCTION protect_economic_profile_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.category IN ('ECONOMIC_PROFILE', 'ACCOUNTANT', 'PROVISIONAL_EXPIRY') THEN
    RAISE EXCEPTION 'Histórico econômico imutável: registre uma nova versão.';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "TaxRegistryEntry_economic_profile_immutable" BEFORE UPDATE OR DELETE ON "TaxRegistryEntry"
FOR EACH ROW EXECUTE FUNCTION protect_economic_profile_history();
