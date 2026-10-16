CREATE UNIQUE INDEX "TaxRegistryEntry_property_restriction_version_key"
ON "TaxRegistryEntry" ("entityId", "version") WHERE "entityType" = 'REAL_ESTATE' AND category = 'PROPERTY_EDIT_RESTRICTION';
CREATE FUNCTION enforce_property_edit_restriction() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  restriction_id text;
  approval_id text;
  actor_id text := NULLIF(current_setting('celeriflow.cadastral_actor', true), '');
BEGIN
  IF (to_jsonb(OLD) - ARRAY['createdAt','updatedAt']) = (to_jsonb(NEW) - ARRAY['createdAt','updatedAt']) THEN RETURN NEW; END IF;
  SELECT id INTO restriction_id FROM "TaxRegistryEntry"
  WHERE "entityType"='REAL_ESTATE' AND "entityId"=OLD.id AND category='PROPERTY_EDIT_RESTRICTION'
    AND id = (SELECT id FROM "TaxRegistryEntry" WHERE "entityType"='REAL_ESTATE' AND "entityId"=OLD.id AND category='PROPERTY_EDIT_RESTRICTION' ORDER BY version DESC LIMIT 1)
    AND data->>'enabled'='true';
  IF restriction_id IS NULL THEN RETURN NEW; END IF;
  SELECT id INTO approval_id FROM "TaxRegistryEntry"
  WHERE "entityType"='REAL_ESTATE' AND "entityId"=OLD.id AND category='PROPERTY_EDIT_APPROVAL' AND status='DISPONIVEL'
    AND data->>'restrictionId'=restriction_id AND data->>'operatorId'=actor_id
    AND (data->>'expectedUpdatedAt')::timestamptz = OLD."updatedAt" AT TIME ZONE 'UTC'
    AND (data->>'expiresAt')::timestamptz > clock_timestamp()
  ORDER BY "createdAt" DESC LIMIT 1 FOR UPDATE;
  IF approval_id IS NULL THEN RAISE EXCEPTION 'Cadastro imobiliário bloqueado: solicite autorização do supervisor para esta alteração.'; END IF;
  UPDATE "TaxRegistryEntry" SET status='CONSUMIDO',"updatedAt"=clock_timestamp() WHERE id=approval_id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "RealEstate_supervisor_edit_control" BEFORE UPDATE ON "RealEstate"
FOR EACH ROW EXECUTE FUNCTION enforce_property_edit_restriction();

CREATE FUNCTION protect_property_edit_authorization() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.category='PROPERTY_EDIT_RESTRICTION' THEN RAISE EXCEPTION 'Restrição imobiliária imutável: publique uma nova versão.'; END IF;
  IF OLD.category='PROPERTY_EDIT_APPROVAL' THEN
    IF TG_OP='UPDATE' AND OLD.status='DISPONIVEL' AND NEW.status='CONSUMIDO'
       AND (to_jsonb(OLD)-ARRAY['status','updatedAt'])=(to_jsonb(NEW)-ARRAY['status','updatedAt']) THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'Autorização imobiliária não pode ser alterada ou excluída.';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "TaxRegistryEntry_property_authorization_immutable" BEFORE UPDATE OR DELETE ON "TaxRegistryEntry"
FOR EACH ROW EXECUTE FUNCTION protect_property_edit_authorization();
