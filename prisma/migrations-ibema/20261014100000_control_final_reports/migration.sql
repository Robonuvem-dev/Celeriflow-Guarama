CREATE UNIQUE INDEX "InternalControlEvent_report_edit_key"
ON "InternalControlEvent" ("planId", ("snapshot"->>'idempotencyKey'))
WHERE "eventType"='CONTROL_REPORT_EDITED';
CREATE UNIQUE INDEX "InternalControlEvent_report_revision"
ON "InternalControlEvent" ("planId", ("snapshot"->>'reportId'), (("snapshot"->>'revision')::integer))
WHERE "eventType"='CONTROL_REPORT_EDITED';
CREATE UNIQUE INDEX "InternalControlEvent_report_final"
ON "InternalControlEvent" ("planId", ("snapshot"->>'reportId'))
WHERE "eventType"='CONTROL_REPORT_FINALIZED';
CREATE UNIQUE INDEX "InternalControlEvent_report_publication"
ON "InternalControlEvent" ("planId", ("snapshot"->>'finalId'))
WHERE "eventType"='CONTROL_REPORT_PUBLISHED';
CREATE UNIQUE INDEX "InternalControlEvent_report_signature"
ON "InternalControlEvent" (("snapshot"->>'finalId'))
WHERE "eventType"='CONTROL_REPORT_SIGNED';

CREATE FUNCTION municipal_control_report_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owner_id TEXT; root "InternalControlEvent"%ROWTYPE; current_revision INTEGER;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    IF OLD."eventType" IN ('CONTROL_REPORT_EDITED','CONTROL_REPORT_FINALIZED','CONTROL_REPORT_PUBLISHED','CONTROL_REPORT_SIGNED')
       OR (TG_OP='UPDATE' AND NEW."eventType" IN ('CONTROL_REPORT_EDITED','CONTROL_REPORT_FINALIZED','CONTROL_REPORT_PUBLISHED','CONTROL_REPORT_SIGNED')) THEN
      RAISE EXCEPTION 'Relatórios de Controle preservam edições, bytes finais e publicação imutáveis';
    END IF;
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF NEW."eventType" NOT IN ('CONTROL_REPORT_EDITED','CONTROL_REPORT_FINALIZED','CONTROL_REPORT_PUBLISHED','CONTROL_REPORT_SIGNED') THEN RETURN NEW; END IF;
  SELECT "ownerId" INTO owner_id FROM "InternalControlPlan" WHERE id=NEW."planId" AND "budgetUnitId" IS NOT NULL FOR UPDATE;
  IF owner_id IS NULL OR owner_id<>NEW."actorId" OR COALESCE(BTRIM(NEW."snapshot"->>'reportId'),'')='' THEN RAISE EXCEPTION 'Relatório exige controlador e plano municipal'; END IF;
  IF NEW."eventType"='CONTROL_REPORT_EDITED' THEN
    IF COALESCE(NEW."snapshot"->>'revision','') !~ '^[1-9][0-9]*$' OR COALESCE(NEW."snapshot"->>'idempotencyKey','')='' OR COALESCE(NEW."snapshot"->>'inputHash','')='' THEN RAISE EXCEPTION 'Edição sem revisão, chave ou hash'; END IF;
    IF EXISTS (SELECT 1 FROM "InternalControlEvent" WHERE "planId"=NEW."planId" AND "eventType"='CONTROL_REPORT_FINALIZED' AND "snapshot"->>'reportId'=NEW."snapshot"->>'reportId') THEN RAISE EXCEPTION 'Relatório já finalizado'; END IF;
    SELECT COALESCE(MAX(("snapshot"->>'revision')::integer),0) INTO current_revision FROM "InternalControlEvent" WHERE "planId"=NEW."planId" AND "eventType"='CONTROL_REPORT_EDITED' AND "snapshot"->>'reportId'=NEW."snapshot"->>'reportId';
    IF (NEW."snapshot"->>'revision')::integer <> current_revision+1 THEN RAISE EXCEPTION 'Revisão de relatório fora de sequência'; END IF;
  ELSIF NEW."eventType"='CONTROL_REPORT_FINALIZED' THEN
    SELECT * INTO root FROM "InternalControlEvent" WHERE id=NEW."snapshot"->>'editionId' AND "planId"=NEW."planId" AND "eventType"='CONTROL_REPORT_EDITED';
    IF root.id IS NULL OR root."snapshot"->>'reportId' IS DISTINCT FROM NEW."snapshot"->>'reportId' OR root."snapshot"->'input' IS DISTINCT FROM NEW."snapshot"->'input' OR root."snapshot"->>'inputHash' IS DISTINCT FROM NEW."snapshot"->>'inputHash' THEN RAISE EXCEPTION 'Finalização diverge da edição'; END IF;
    SELECT MAX(("snapshot"->>'revision')::integer) INTO current_revision FROM "InternalControlEvent" WHERE "planId"=NEW."planId" AND "eventType"='CONTROL_REPORT_EDITED' AND "snapshot"->>'reportId'=NEW."snapshot"->>'reportId';
    IF (NEW."snapshot"->>'revision')::integer IS DISTINCT FROM current_revision OR COALESCE(NEW."snapshot"->>'sha256','') !~ '^[a-f0-9]{64}$' OR COALESCE(NEW."snapshot"->>'pdfBase64','')='' THEN RAISE EXCEPTION 'Finalização sem última revisão ou bytes/hash'; END IF;
  ELSE
    SELECT * INTO root FROM "InternalControlEvent" WHERE id=NEW."snapshot"->>'finalId' AND "planId"=NEW."planId" AND "eventType"='CONTROL_REPORT_FINALIZED';
    IF root.id IS NULL OR root."snapshot"->>'reportId' IS DISTINCT FROM NEW."snapshot"->>'reportId' OR root."snapshot"->>'sha256' IS DISTINCT FROM NEW."snapshot"->>'sha256' THEN RAISE EXCEPTION 'Publicação diverge do relatório final'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "InternalControlEvent_report_integrity" BEFORE INSERT OR UPDATE OR DELETE
ON "InternalControlEvent" FOR EACH ROW EXECUTE FUNCTION municipal_control_report_guard();

-- A finalized annex continues to refer to the same bytes. Withdrawal remains
-- available, but changing the referenced file is a new publication/version.
CREATE FUNCTION municipal_control_report_annex_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "InternalControlEvent" WHERE "eventType"='CONTROL_REPORT_FINALIZED'
      AND "snapshot"->'attachments' @> jsonb_build_array(jsonb_build_object('id',OLD.id))) THEN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Anexo de relatório final preserva a publicação de origem'; END IF;
    IF OLD."publicKey" IS DISTINCT FROM NEW."publicKey" OR OLD."sha256" IS DISTINCT FROM NEW."sha256"
      OR OLD."fileUrl" IS DISTINCT FROM NEW."fileUrl" OR OLD."filePathname" IS DISTINCT FROM NEW."filePathname"
      OR OLD.entity IS DISTINCT FROM NEW.entity THEN
      RAISE EXCEPTION 'Arquivo de anexo final exige nova publicação/versionamento';
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "TransparencyPublication_control_annex_integrity" BEFORE UPDATE OR DELETE
ON "TransparencyPublication" FOR EACH ROW EXECUTE FUNCTION municipal_control_report_annex_guard();
