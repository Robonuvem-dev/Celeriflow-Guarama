-- Capture observed positions only; no reconstruction of legacy changes.
CREATE UNIQUE INDEX "TaxRegistryEntry_itbi_field_history_version_key"
ON "TaxRegistryEntry" ("entityType", "entityId", version) WHERE category = 'ITBI_FIELD_HISTORY';

CREATE FUNCTION record_itbi_field_history() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  before_data jsonb;
  after_data jsonb;
  changed_fields jsonb;
  row_id text;
  declaration_id text;
  entity_type text;
  process_id text;
  origin jsonb;
  next_version integer;
  actor_id text := NULLIF(current_setting('celeriflow.itbi_actor', true), '');
  actor_name text;
  observed_at timestamp(3) := clock_timestamp();
  decimal_key text;
BEGIN
  IF TG_OP <> 'DELETE' THEN after_data := to_jsonb(NEW) - ARRAY['createdAt', 'updatedAt']; END IF;
  IF TG_OP <> 'INSERT' THEN before_data := to_jsonb(OLD) - ARRAY['createdAt', 'updatedAt']; END IF;
  IF TG_OP = 'UPDATE' AND before_data = after_data THEN RETURN NEW; END IF;
  row_id := COALESCE(after_data->>'id', before_data->>'id');
  IF TG_TABLE_NAME = 'ItbiDeclaration' THEN
    declaration_id := row_id;
    entity_type := 'ITBI_DECLARATION';
    origin := COALESCE(after_data->'calculationSnapshot', before_data->'calculationSnapshot', '{}'::jsonb);
    process_id := COALESCE(after_data->>'processId', before_data->>'processId');
    IF TG_OP = 'INSERT' AND actor_id IS NULL THEN actor_id := after_data->>'createdByUsuarioId'; END IF;
  ELSE
    declaration_id := COALESCE(after_data->>'declarationId', before_data->>'declarationId');
    entity_type := 'ITBI_PARTY';
    SELECT "calculationSnapshot", "processId" INTO origin, process_id FROM "ItbiDeclaration" WHERE id = declaration_id;
  END IF;
  -- Native Decimal columns are stored as text to preserve cents and percentages in JSON clients.
  FOREACH decimal_key IN ARRAY ARRAY['transmittedFraction','declaredPropertyValue','taxableBase','appliedRate','taxAmount','blockingTaxDebt','nonTaxDebtAmount','participationPercent'] LOOP
    IF after_data ? decimal_key AND after_data->decimal_key <> 'null'::jsonb THEN after_data := jsonb_set(after_data, ARRAY[decimal_key], to_jsonb(after_data->>decimal_key)); END IF;
    IF before_data ? decimal_key AND before_data->decimal_key <> 'null'::jsonb THEN before_data := jsonb_set(before_data, ARRAY[decimal_key], to_jsonb(before_data->>decimal_key)); END IF;
  END LOOP;
  SELECT nome INTO actor_name FROM "Usuario" WHERE id = actor_id;
  SELECT COALESCE(MAX(version), 0) + 1 INTO next_version FROM "TaxRegistryEntry"
    WHERE "entityType" = entity_type AND "entityId" = row_id AND category = 'ITBI_FIELD_HISTORY';
  IF TG_OP <> 'INSERT' AND next_version = 1 THEN
    INSERT INTO "TaxRegistryEntry" (id,"entityType","entityId",category,title,data,status,source,"effectiveFrom","actorUsuarioId","processId",version,"createdAt","updatedAt")
    VALUES (gen_random_uuid()::text,entity_type,row_id,'ITBI_FIELD_HISTORY','Posição inicial observada',jsonb_build_object('declarationId',declaration_id,'governmentEntityId',origin->>'governmentEntityId','budgetUnitId',origin->>'budgetUnitId','before',NULL,'after',before_data,'fields','[]'::jsonb,'baseline',true,'observedAt',observed_at,'actorName',NULL),'ATIVO','POSICAO_LEGADA_OBSERVADA',observed_at,NULL,process_id,1,observed_at,observed_at);
    next_version := 2;
  END IF;
  SELECT COALESCE(jsonb_agg(key ORDER BY key), '[]'::jsonb) INTO changed_fields
    FROM jsonb_each(COALESCE(after_data, before_data)) WHERE before_data IS NULL OR after_data IS NULL OR before_data->key IS DISTINCT FROM value;
  INSERT INTO "TaxRegistryEntry" (id,"entityType","entityId",category,title,data,status,source,"effectiveFrom","actorUsuarioId","processId",version,"createdAt","updatedAt")
  VALUES (gen_random_uuid()::text,entity_type,row_id,'ITBI_FIELD_HISTORY','Histórico de campos do ITBI',jsonb_build_object('declarationId',declaration_id,'governmentEntityId',origin->>'governmentEntityId','budgetUnitId',origin->>'budgetUnitId','before',before_data,'after',after_data,'fields',changed_fields,'baseline',TG_OP='INSERT','operation',TG_OP,'observedAt',observed_at,'actorName',actor_name,'actorAttribution',CASE WHEN actor_id IS NULL THEN 'NAO_IDENTIFICADO' ELSE 'OPERADOR_IDENTIFICADO' END),'ATIVO','ITBI_NATIVE_FIELDS',observed_at,actor_id,process_id,next_version,observed_at,observed_at);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "ItbiDeclaration_field_history" AFTER INSERT OR UPDATE ON "ItbiDeclaration" FOR EACH ROW EXECUTE FUNCTION record_itbi_field_history();
CREATE TRIGGER "ItbiParty_field_history" AFTER INSERT OR UPDATE OR DELETE ON "ItbiParty" FOR EACH ROW EXECUTE FUNCTION record_itbi_field_history();

CREATE FUNCTION preserve_itbi_field_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'ItbiDeclaration' THEN RAISE EXCEPTION 'Histórico do ITBI é imutável; registre novo evento ou cancelamento.'; END IF;
  IF OLD.category = 'ITBI_FIELD_HISTORY' THEN RAISE EXCEPTION 'Histórico do ITBI é imutável; registre novo evento ou cancelamento.'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "ItbiDeclaration_preserve_history" BEFORE DELETE ON "ItbiDeclaration" FOR EACH ROW EXECUTE FUNCTION preserve_itbi_field_history();
CREATE TRIGGER "TaxRegistryEntry_itbi_field_history_immutable" BEFORE UPDATE OR DELETE ON "TaxRegistryEntry" FOR EACH ROW EXECUTE FUNCTION preserve_itbi_field_history();
