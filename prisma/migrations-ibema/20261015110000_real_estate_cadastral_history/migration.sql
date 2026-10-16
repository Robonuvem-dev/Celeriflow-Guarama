-- Histórico de todos os produtores do cadastro imobiliário, sem reconstruir passado legado.
CREATE FUNCTION record_real_estate_cadastral_history() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  before_data jsonb;
  after_data jsonb;
  changed_fields jsonb;
  next_version integer;
  observed_at timestamp(3) := clock_timestamp();
  actor_id text := NULLIF(current_setting('celeriflow.cadastral_actor', true), '');
BEGIN
  after_data := to_jsonb(NEW) - ARRAY['createdAt', 'updatedAt'];
  IF TG_OP = 'UPDATE' THEN
    before_data := to_jsonb(OLD) - ARRAY['createdAt', 'updatedAt'];
    IF before_data = after_data THEN RETURN NEW; END IF;
  END IF;
  SELECT COALESCE(MAX("version"), 0) + 1 INTO next_version
    FROM "TaxRegistryEntry"
    WHERE "entityType" = 'REAL_ESTATE' AND "entityId" = NEW.id AND "category" = 'CADASTRAL_HISTORY';
  IF TG_OP = 'UPDATE' AND next_version = 1 THEN
    INSERT INTO "TaxRegistryEntry" (id,"entityType","entityId",category,title,data,status,source,"effectiveFrom","actorUsuarioId",version,"createdAt","updatedAt")
    VALUES (gen_random_uuid()::text,'REAL_ESTATE',NEW.id,'CADASTRAL_HISTORY','Posição cadastral 1',jsonb_build_object('before',NULL,'after',before_data,'fields','[]'::jsonb,'baseline',true,'observedAt',observed_at),'ATIVO','POSICAO_LEGADA_OBSERVADA',observed_at,actor_id,1,observed_at,observed_at);
    next_version := 2;
  END IF;
  SELECT COALESCE(jsonb_agg(key ORDER BY key), '[]'::jsonb) INTO changed_fields
    FROM jsonb_each(after_data) WHERE before_data IS NULL OR before_data -> key IS DISTINCT FROM value;
  INSERT INTO "TaxRegistryEntry" (id,"entityType","entityId",category,title,data,status,source,"effectiveFrom","actorUsuarioId",version,"createdAt","updatedAt")
  VALUES (gen_random_uuid()::text,'REAL_ESTATE',NEW.id,'CADASTRAL_HISTORY','Posição cadastral ' || next_version,jsonb_build_object('before',before_data,'after',after_data,'fields',changed_fields,'baseline',TG_OP = 'INSERT','observedAt',observed_at),'ATIVO','CADASTRO_IMOBILIARIO',observed_at,actor_id,next_version,observed_at,observed_at);
  RETURN NEW;
END;
$$;
CREATE TRIGGER "RealEstate_cadastral_history"
AFTER INSERT OR UPDATE ON "RealEstate"
FOR EACH ROW EXECUTE FUNCTION record_real_estate_cadastral_history();

CREATE FUNCTION protect_real_estate_with_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Imóvel com histórico: utilize baixa cadastral em vez de excluir o registro.';
END;
$$;
CREATE TRIGGER "RealEstate_preserve_history" BEFORE DELETE ON "RealEstate"
FOR EACH ROW EXECUTE FUNCTION protect_real_estate_with_history();
