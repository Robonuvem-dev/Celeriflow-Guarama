-- Preserve the opening baseline and legal source. Delivery changes state only.
CREATE FUNCTION planning_accounting_command_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Planning accounting commands are immutable';
  END IF;
  IF (NEW.id, NEW.type, NEW."sourceId", NEW.payload, NEW."idempotencyKey", NEW."createdAt")
     IS DISTINCT FROM (OLD.id, OLD.type, OLD."sourceId", OLD.payload, OLD."idempotencyKey", OLD."createdAt") THEN
    RAISE EXCEPTION 'Planning accounting command source/payload is immutable';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (OLD.status = 'PENDING' AND NEW.status = 'DELIVERED') THEN
    RAISE EXCEPTION 'Invalid planning accounting delivery transition';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER planning_accounting_command_integrity
BEFORE UPDATE OR DELETE ON "PlanningIntegrationCommand"
FOR EACH ROW EXECUTE FUNCTION planning_accounting_command_guard();
