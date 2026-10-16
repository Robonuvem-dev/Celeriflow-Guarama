-- Memórias novas são aditivas. Registros legados e demais categorias são preservados.
CREATE UNIQUE INDEX "TaxRegistryEntry_property_cadastral_version_key"
ON "TaxRegistryEntry" ("entityType", "entityId", "category", "title", "version")
WHERE "category" IN ('PROPERTY_VALUATION_RULE', 'CONFIGURED_VALUATION_IPTU', 'CONFIGURED_VALUATION_ITBI', 'CADASTRAL_HISTORY', 'PARAMETER_SCOPE');

CREATE FUNCTION protect_tax_property_cadastral_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."category" IN ('PROPERTY_VALUATION_RULE', 'CONFIGURED_VALUATION_IPTU', 'CONFIGURED_VALUATION_ITBI', 'CADASTRAL_HISTORY', 'PARAMETER_SCOPE') THEN
    RAISE EXCEPTION 'Memória cadastral/avaliação imutável; registre uma nova versão.';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "TaxRegistryEntry_property_cadastral_immutable"
BEFORE UPDATE OR DELETE ON "TaxRegistryEntry"
FOR EACH ROW EXECUTE FUNCTION protect_tax_property_cadastral_history();
