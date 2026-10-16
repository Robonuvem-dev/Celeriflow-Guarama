-- Adição apenas: partidas históricas continuam sem classificação inferida.
ALTER TABLE "AccountingEntry" ADD COLUMN "classificationSnapshot" JSONB;
ALTER TABLE "AccountingEntry" ADD CONSTRAINT "AccountingEntry_classification_object"
  CHECK ("classificationSnapshot" IS NULL OR jsonb_typeof("classificationSnapshot") = 'object');

CREATE FUNCTION preserve_account_classification_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."classificationSnapshot" IS NOT NULL AND NEW."classificationSnapshot" IS DISTINCT FROM OLD."classificationSnapshot" THEN
    RAISE EXCEPTION 'Posted account classification snapshot is immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER account_classification_snapshot_preserved BEFORE UPDATE ON "AccountingEntry"
  FOR EACH ROW EXECUTE FUNCTION preserve_account_classification_snapshot();
