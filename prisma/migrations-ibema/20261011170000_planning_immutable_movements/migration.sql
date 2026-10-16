-- Legal movements are append-only, including for callers outside Planning.
CREATE FUNCTION planning_movement_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Planning legal movements are immutable; register a compensating legal movement';
END;
$$;
CREATE TRIGGER planning_movement_immutable
BEFORE UPDATE OR DELETE ON "PlanningLineMovement"
FOR EACH ROW EXECUTE FUNCTION planning_movement_immutable();

ALTER TABLE "PlanningLineMovement" ADD CONSTRAINT planning_movement_nonzero CHECK (value <> 0);

CREATE FUNCTION planning_original_with_history_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "PlanningLineMovement" WHERE "lineId" = OLD.id) AND
    ROW(NEW."originalValue", NEW.year, NEW."instrumentId", NEW.kind, NEW."budgetUnitId", NEW."resourceSourceId", NEW.code, NEW."revenueNatureId", NEW."expenseNatureId", NEW."programId", NEW."actionId", NEW."functionCode", NEW."subfunctionCode")
      IS DISTINCT FROM
    ROW(OLD."originalValue", OLD.year, OLD."instrumentId", OLD.kind, OLD."budgetUnitId", OLD."resourceSourceId", OLD.code, OLD."revenueNatureId", OLD."expenseNatureId", OLD."programId", OLD."actionId", OLD."functionCode", OLD."subfunctionCode")
  THEN
    RAISE EXCEPTION 'Original planning classification/value with legal history is immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER planning_original_with_history_immutable
BEFORE UPDATE ON "PlanningBudgetLine"
FOR EACH ROW EXECUTE FUNCTION planning_original_with_history_immutable();
