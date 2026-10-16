CREATE UNIQUE INDEX "TaxRegistryEntry_property_simulation_assessment_key" ON "TaxRegistryEntry" ("entityId") WHERE "entityType"='TAX_ASSESSMENT' AND category='PROPERTY_SIMULATION_ASSESSMENT';
CREATE FUNCTION preserve_property_simulation_memory() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.category='PROPERTY_SIMULATION_ASSESSMENT' THEN RAISE EXCEPTION 'Memória da simulação efetivada é imutável.'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "TaxRegistryEntry_property_simulation_immutable" BEFORE UPDATE OR DELETE ON "TaxRegistryEntry" FOR EACH ROW EXECUTE FUNCTION preserve_property_simulation_memory();
