-- Relações classificatórias documentadas são aditivas; cadastros fiscais existentes não são alterados.
CREATE FUNCTION preserve_municipal_activity_relation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.category = 'MUNICIPAL_ACTIVITY_RELATION' THEN
    RAISE EXCEPTION 'Municipal activity relationship is immutable; preserve its documented edition';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER municipal_activity_relation_preserved BEFORE UPDATE OR DELETE ON "TaxRegistryEntry"
  FOR EACH ROW EXECUTE FUNCTION preserve_municipal_activity_relation();
