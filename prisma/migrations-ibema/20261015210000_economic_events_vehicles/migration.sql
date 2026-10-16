CREATE UNIQUE INDEX "TaxRegistryEntry_economic_event_vehicle_version_key" ON "TaxRegistryEntry" ("entityType","entityId",category,version) WHERE category IN ('ECONOMIC_EVENT_TYPE','ECONOMIC_EVENT','ECONOMIC_VEHICLE');
CREATE UNIQUE INDEX "TaxRegistryEntry_economic_event_type_code_key" ON "TaxRegistryEntry" (title,version) WHERE category='ECONOMIC_EVENT_TYPE';
CREATE FUNCTION preserve_economic_events_vehicles() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.category IN ('ECONOMIC_EVENT_TYPE','ECONOMIC_EVENT','ECONOMIC_VEHICLE') THEN RAISE EXCEPTION 'Histórico de eventos e veículos é imutável; publique nova versão.'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "TaxRegistryEntry_economic_events_vehicles_immutable" BEFORE UPDATE OR DELETE ON "TaxRegistryEntry" FOR EACH ROW EXECUTE FUNCTION preserve_economic_events_vehicles();
