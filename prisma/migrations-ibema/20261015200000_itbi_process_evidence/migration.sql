CREATE UNIQUE INDEX "TaxRegistryEntry_itbi_contestation_decision_key" ON "TaxRegistryEntry" ((data->>'contestationId')) WHERE category='ITBI_CONTESTATION_DECISION';
CREATE FUNCTION preserve_itbi_process_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.category IN ('ITBI_PROPERTY_COLLECTION','ITBI_CONTESTATION','ITBI_CONTESTATION_DECISION','ITBI_PROCESS_MESSAGE') THEN RAISE EXCEPTION 'Evidência do processo ITBI é imutável; registre novo evento.'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "TaxRegistryEntry_itbi_process_immutable" BEFORE UPDATE OR DELETE ON "TaxRegistryEntry" FOR EACH ROW EXECUTE FUNCTION preserve_itbi_process_evidence();
