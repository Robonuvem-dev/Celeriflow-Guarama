-- Freeze asset destinations while a physical asset inventory is open.
-- Commission reconciliation is explicitly scoped to the selected inventory.
CREATE OR REPLACE FUNCTION cf13_guard_asset_inventory() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE locked_session text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW."departmentId" IS NOT DISTINCT FROM OLD."departmentId"
    AND NEW."responsibleId" IS NOT DISTINCT FROM OLD."responsibleId"
    AND NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('ASSET_INVENTORY:' || coalesce(OLD."departmentId", ''), 0));
  IF TG_OP = 'UPDATE' AND NEW."departmentId" IS DISTINCT FROM OLD."departmentId" THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('ASSET_INVENTORY:' || coalesce(NEW."departmentId", ''), 0));
  END IF;
  SELECT s.id INTO locked_session FROM "AssetCatalogRecord" s
  WHERE s.kind='inventarioBens' AND s.active AND (
    s."departmentId"=OLD."departmentId" OR
    (TG_OP='UPDATE' AND s."departmentId"=NEW."departmentId") OR
    EXISTS (SELECT 1 FROM "AssetCatalogRecord" i WHERE i.kind='inventarioBem'
      AND i.details->>'sessionId'=s.id AND i.details->>'assetId'=OLD.id))
  AND s.id IS DISTINCT FROM current_setting('celeriflow.asset_inventory_commission', true)
  LIMIT 1;
  IF locked_session IS NOT NULL THEN RAISE EXCEPTION 'Bem bloqueado pelo inventário patrimonial %', locked_session; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER cf13_guard_asset_inventory BEFORE UPDATE OR DELETE ON "Asset"
FOR EACH ROW EXECUTE FUNCTION cf13_guard_asset_inventory();
