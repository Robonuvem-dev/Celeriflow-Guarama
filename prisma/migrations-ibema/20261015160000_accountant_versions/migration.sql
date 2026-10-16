-- Replace the single-entry constraint with one immutable position per version.
DROP INDEX "TaxRegistryEntry_unique_accountant_key";
CREATE UNIQUE INDEX "TaxRegistryEntry_accountant_version_key" ON "TaxRegistryEntry" ("entityId","version") WHERE "entityType"='TAXPAYER' AND category='ACCOUNTANT';
CREATE FUNCTION preserve_accountant_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.category='ACCOUNTANT' AND OLD."entityType"='TAXPAYER' THEN RAISE EXCEPTION 'Cadastro do contador imutável: publique uma correção versionada.'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "TaxRegistryEntry_accountant_immutable" BEFORE UPDATE OR DELETE ON "TaxRegistryEntry" FOR EACH ROW EXECUTE FUNCTION preserve_accountant_version();
CREATE OR REPLACE FUNCTION protect_economic_profile_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.category IN ('ECONOMIC_PROFILE','ACCOUNTANT','PROVISIONAL_EXPIRY','ECONOMIC_BULK_CHANGE') THEN RAISE EXCEPTION 'Histórico econômico imutável: registre uma nova versão.'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
