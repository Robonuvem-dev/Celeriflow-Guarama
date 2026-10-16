CREATE UNIQUE INDEX "TaxRegistryEntry_license_policy_version_key" ON "TaxRegistryEntry" ("entityId",version) WHERE category='LICENSE_POLICY';
CREATE UNIQUE INDEX "TaxRegistryEntry_license_policy_scope_version_key" ON "TaxRegistryEntry" (title,version) WHERE category='LICENSE_POLICY';
CREATE UNIQUE INDEX "TaxRegistryEntry_license_issuance_key" ON "TaxRegistryEntry" ("entityId") WHERE category='LICENSE_ISSUANCE';
CREATE FUNCTION preserve_configured_license_memory() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.category IN ('LICENSE_POLICY','LICENSE_ISSUANCE','LICENSE_LIFECYCLE') THEN RAISE EXCEPTION 'Memória do alvará imutável: registre nova configuração ou evento.'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "TaxRegistryEntry_configured_license_immutable" BEFORE UPDATE OR DELETE ON "TaxRegistryEntry" FOR EACH ROW EXECUTE FUNCTION preserve_configured_license_memory();
CREATE FUNCTION protect_configured_license_position() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM "TaxRegistryEntry" e WHERE e."entityType"='LICENSE' AND e."entityId"=OLD.id AND e.category='LICENSE_ISSUANCE') THEN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Alvará emitido não pode ser removido.'; END IF;
    IF (to_jsonb(OLD)-ARRAY['status','updatedAt']) IS DISTINCT FROM (to_jsonb(NEW)-ARRAY['status','updatedAt']) THEN RAISE EXCEPTION 'Dados emitidos são imutáveis; cancele e emita alvará substituto.'; END IF;
    IF OLD.status IS DISTINCT FROM NEW.status AND (COALESCE(current_setting('celeriflow.license_actor',true),'')='' OR NEW.status NOT IN ('Cancelado','Suspenso') OR OLD.status='Cancelado') THEN RAISE EXCEPTION 'Utilize o ciclo auditado do alvará; cancelamento é definitivo.'; END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "License_configured_position" BEFORE UPDATE OR DELETE ON "License" FOR EACH ROW EXECUTE FUNCTION protect_configured_license_position();
