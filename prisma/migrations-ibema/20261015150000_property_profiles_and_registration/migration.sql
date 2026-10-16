CREATE UNIQUE INDEX "TaxRegistryEntry_property_profile_version_key"
ON "TaxRegistryEntry" ("entityId", "version") WHERE "entityType"='REAL_ESTATE' AND category='PROPERTY_PROFILE';
CREATE UNIQUE INDEX "TaxRegistryEntry_property_registration_policy_version_key"
ON "TaxRegistryEntry" ("entityId", "version") WHERE "entityType"='BUDGET_UNIT' AND category='PROPERTY_REGISTRATION_POLICY';
CREATE UNIQUE INDEX "TaxRegistryEntry_fiscal_ownership_version_key" ON "TaxRegistryEntry" ("entityId","version") WHERE "entityType"='REAL_ESTATE' AND category='FISCAL_OWNERSHIP';
CREATE UNIQUE INDEX "TaxRegistryEntry_fiscal_ownership_active_key" ON "TaxRegistryEntry" ("entityId") WHERE "entityType"='REAL_ESTATE' AND category='FISCAL_OWNERSHIP' AND status='ATIVO';

CREATE FUNCTION property_effective_edit_restriction(property_id text, include_previous boolean DEFAULT false)
RETURNS TABLE (id text, "governmentEntityId" text, "budgetUnitId" text) LANGUAGE plpgsql AS $$
DECLARE r record; profile jsonb; previous_profile jsonb; policy record;
BEGIN
  SELECT e.id,e.data INTO r FROM "TaxRegistryEntry" e WHERE e."entityType"='REAL_ESTATE' AND e."entityId"=property_id AND e.category='PROPERTY_EDIT_RESTRICTION' ORDER BY e.version DESC LIMIT 1;
  IF r.data->>'enabled'='true' THEN RETURN QUERY SELECT r.id::text,r.data->>'governmentEntityId',r.data->>'budgetUnitId'; RETURN; END IF;
  SELECT e.data INTO profile FROM "TaxRegistryEntry" e WHERE e."entityType"='REAL_ESTATE' AND e."entityId"=property_id AND e.category='PROPERTY_PROFILE' ORDER BY e.version DESC LIMIT 1;
  IF profile IS NULL THEN RETURN; END IF;
  IF include_previous THEN
    IF profile->>'previousId' IS NOT NULL THEN SELECT e.data INTO previous_profile FROM "TaxRegistryEntry" e WHERE e.id=profile->>'previousId'; END IF;
    profile:=previous_profile;
  END IF;
  IF profile->>'riskArea'='true' OR profile->>'environmentalProtection'='true' THEN
    SELECT e.id,e.data INTO policy FROM "TaxRegistryEntry" e WHERE e."entityType"='BUDGET_UNIT' AND e."entityId"=profile->>'budgetUnitId' AND e.category='PROPERTY_REGISTRATION_POLICY' ORDER BY e.version DESC LIMIT 1;
    IF policy.data->>'restrictRiskAreas'='true' THEN RETURN QUERY SELECT policy.id::text,policy.data->>'governmentEntityId',policy.data->>'budgetUnitId'; END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_property_edit_restriction() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE restriction_id text; approval_id text; profile jsonb; policy jsonb;
  actor_id text := NULLIF(current_setting('celeriflow.cadastral_actor',true),'');
  process_id text := NULLIF(current_setting('celeriflow.cadastral_process',true),'');
  profile_change boolean := COALESCE(current_setting('celeriflow.cadastral_profile_change',true),'')='true';
BEGIN
  IF NOT profile_change AND (to_jsonb(OLD)-ARRAY['createdAt','updatedAt'])=(to_jsonb(NEW)-ARRAY['createdAt','updatedAt']) THEN RETURN NEW; END IF;
  SELECT data INTO profile FROM "TaxRegistryEntry" WHERE "entityType"='REAL_ESTATE' AND "entityId"=OLD.id AND category='PROPERTY_PROFILE' ORDER BY version DESC LIMIT 1;
  IF profile IS NOT NULL THEN
    IF NEW."propertyType" IS DISTINCT FROM profile->>'kind' OR NEW."municipalInsc" IS DISTINCT FROM profile->>'inscription' THEN RAISE EXCEPTION 'Altere tipo e composição da inscrição pelo perfil imobiliário versionado.'; END IF;
    SELECT data INTO policy FROM "TaxRegistryEntry" WHERE "entityType"='BUDGET_UNIT' AND "entityId"=profile->>'budgetUnitId' AND category='PROPERTY_REGISTRATION_POLICY' ORDER BY version DESC LIMIT 1;
    IF policy->>'requireProcess'='true' AND (process_id IS NULL OR NOT EXISTS (SELECT 1 FROM "Process" WHERE id=process_id)) THEN RAISE EXCEPTION 'A configuração municipal exige protocolo para alterar este cadastro.'; END IF;
  END IF;
  SELECT r.id INTO restriction_id FROM property_effective_edit_restriction(OLD.id,COALESCE(current_setting('celeriflow.cadastral_new_profile',true),'')=OLD.id) r;
  IF restriction_id IS NULL THEN RETURN NEW; END IF;
  SELECT id INTO approval_id FROM "TaxRegistryEntry" WHERE "entityType"='REAL_ESTATE' AND "entityId"=OLD.id AND category='PROPERTY_EDIT_APPROVAL' AND status='DISPONIVEL'
    AND data->>'restrictionId'=restriction_id AND data->>'operatorId'=actor_id
    AND (data->>'expectedUpdatedAt')::timestamptz=OLD."updatedAt" AT TIME ZONE 'UTC' AND (data->>'expiresAt')::timestamptz>clock_timestamp()
    ORDER BY "createdAt" DESC LIMIT 1 FOR UPDATE;
  IF approval_id IS NULL THEN RAISE EXCEPTION 'Cadastro imobiliário bloqueado: solicite autorização do supervisor para esta alteração.'; END IF;
  UPDATE "TaxRegistryEntry" SET status='CONSUMIDO',"updatedAt"=clock_timestamp() WHERE id=approval_id;
  RETURN NEW;
END;
$$;
CREATE FUNCTION preserve_fiscal_ownership() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.category='FISCAL_OWNERSHIP' AND OLD."entityType"='REAL_ESTATE' THEN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Titularidade fiscal imutável: registre uma nova posição.'; END IF;
    IF (to_jsonb(OLD)-ARRAY['status','effectiveUntil','updatedAt']) IS DISTINCT FROM (to_jsonb(NEW)-ARRAY['status','effectiveUntil','updatedAt']) OR OLD.status<>'ATIVO' OR NEW.status NOT IN ('HISTORICO','ESTORNADO') OR NEW."effectiveUntil" IS NULL OR NEW."effectiveUntil"<OLD."effectiveFrom" THEN RAISE EXCEPTION 'Titularidade fiscal imutável: registre uma nova posição.'; END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "TaxRegistryEntry_fiscal_ownership_immutable" BEFORE UPDATE OR DELETE ON "TaxRegistryEntry" FOR EACH ROW EXECUTE FUNCTION preserve_fiscal_ownership();

CREATE FUNCTION preserve_property_profile() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.category IN ('PROPERTY_PROFILE','PROPERTY_REGISTRATION_POLICY') THEN RAISE EXCEPTION 'Perfil/configuração imobiliária imutável: publique nova versão.'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "TaxRegistryEntry_property_profile_immutable" BEFORE UPDATE OR DELETE ON "TaxRegistryEntry" FOR EACH ROW EXECUTE FUNCTION preserve_property_profile();

CREATE FUNCTION validate_property_unit_link() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE estate record; profile jsonb; parent_id text;
BEGIN
  SELECT * INTO estate FROM "RealEstate" WHERE id=NEW.id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  SELECT data INTO profile FROM "TaxRegistryEntry" WHERE "entityType"='REAL_ESTATE' AND "entityId"=NEW.id AND category='PROPERTY_PROFILE' ORDER BY version DESC LIMIT 1;
  IF estate."propertyType" IN ('Unidade','Subunidade') OR profile->>'kind'='Unidade' THEN
    parent_id:=profile->>'parentId';
    IF parent_id IS NULL THEN SELECT data->>'parentId' INTO parent_id FROM "TaxRegistryEntry" WHERE "entityType"='REAL_ESTATE' AND "entityId"=NEW.id AND category='UNIDADE' ORDER BY "createdAt" DESC LIMIT 1; END IF;
    IF parent_id IS NULL OR parent_id=NEW.id OR NOT EXISTS (SELECT 1 FROM "RealEstate" WHERE id=parent_id) THEN RAISE EXCEPTION 'Uma unidade exige vínculo com o cadastro do terreno.'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE CONSTRAINT TRIGGER "RealEstate_required_unit_link" AFTER INSERT OR UPDATE ON "RealEstate" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_property_unit_link();
