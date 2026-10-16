CREATE UNIQUE INDEX "TaxRegistryEntry_economic_activity_version_key" ON "TaxRegistryEntry" ("entityId","version") WHERE "entityType"='ECONOMIC_ACTIVITY' AND category='ECONOMIC_ACTIVITY_DEFINITION';
CREATE UNIQUE INDEX "TaxRegistryEntry_economic_activity_code_version_key" ON "TaxRegistryEntry" (title,"version") WHERE "entityType"='ECONOMIC_ACTIVITY' AND category='ECONOMIC_ACTIVITY_DEFINITION';
CREATE FUNCTION preserve_economic_activity_definition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.category IN ('ECONOMIC_ACTIVITY_DEFINITION','ECONOMIC_ACTIVITY_UNIFICATION') THEN RAISE EXCEPTION 'Atividade econômica imutável: publique nova versão ou unificação.'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "TaxRegistryEntry_economic_activity_immutable" BEFORE UPDATE OR DELETE ON "TaxRegistryEntry" FOR EACH ROW EXECUTE FUNCTION preserve_economic_activity_definition();
