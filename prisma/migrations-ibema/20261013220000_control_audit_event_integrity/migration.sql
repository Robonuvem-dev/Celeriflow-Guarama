-- Audit commands are additive; JSON expression indexes preserve replay keys.
CREATE UNIQUE INDEX "InternalControlEvent_audit_command_key"
ON "InternalControlEvent" ("planId", ("snapshot"->>'idempotencyKey'))
WHERE "eventType" IN ('AUDIT_SCHEDULED','AUDIT_SENT','AUDIT_RESPONSE','AUDIT_REVIEW','AUDIT_CLOSED','AUDIT_CANCELLED');

CREATE UNIQUE INDEX "InternalControlEvent_audit_sequence"
ON "InternalControlEvent" (("snapshot"->>'auditId'), (("snapshot"->>'sequence')::integer))
WHERE "eventType" IN ('AUDIT_SENT','AUDIT_RESPONSE','AUDIT_REVIEW','AUDIT_CLOSED','AUDIT_CANCELLED');

CREATE FUNCTION municipal_control_audit_event_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  root "InternalControlEvent"%ROWTYPE;
  owner_id TEXT;
  previous_id TEXT;
  previous_type TEXT;
  previous_snapshot JSONB;
  previous_sequence INTEGER;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    IF OLD."eventType" IN ('AUDIT_SCHEDULED','AUDIT_SENT','AUDIT_RESPONSE','AUDIT_REVIEW','AUDIT_CLOSED','AUDIT_CANCELLED')
       OR (TG_OP='UPDATE' AND NEW."eventType" IN ('AUDIT_SCHEDULED','AUDIT_SENT','AUDIT_RESPONSE','AUDIT_REVIEW','AUDIT_CLOSED','AUDIT_CANCELLED')) THEN
      RAISE EXCEPTION 'Eventos da auditoria são aditivos e não podem ser alterados/excluídos';
    END IF;
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF NEW."eventType" NOT IN ('AUDIT_SCHEDULED','AUDIT_SENT','AUDIT_RESPONSE','AUDIT_REVIEW','AUDIT_CLOSED','AUDIT_CANCELLED') THEN RETURN NEW; END IF;
  SELECT "ownerId" INTO owner_id FROM "InternalControlPlan" WHERE id=NEW."planId" AND status='ABERTO' AND "budgetUnitId" IS NOT NULL FOR UPDATE;
  IF owner_id IS NULL THEN RAISE EXCEPTION 'Auditoria exige plano aberto com UG'; END IF;
  IF COALESCE(BTRIM(NEW."snapshot"->>'idempotencyKey'),'')='' OR COALESCE(BTRIM(NEW."snapshot"->>'requestHash'),'')='' THEN
    RAISE EXCEPTION 'Comando de auditoria exige chave e hash de conteúdo';
  END IF;
  IF NEW."eventType"='AUDIT_SCHEDULED' THEN
    IF COALESCE(BTRIM(NEW."snapshot"->>'auditorId'),'')='' OR COALESCE(BTRIM(NEW."snapshot"->>'recipientId'),'')='' OR jsonb_typeof(NEW."snapshot"->'groups') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Agendamento sem auditor, destinatário ou questionário'; END IF;
    IF NEW."actorId"<>owner_id OR NEW."snapshot"->>'auditorId'=NEW."snapshot"->>'recipientId' THEN RAISE EXCEPTION 'Agendamento exige controlador e auditor independente'; END IF;
    RETURN NEW;
  END IF;
  SELECT * INTO root FROM "InternalControlEvent" WHERE id=NEW."snapshot"->>'auditId' AND "eventType"='AUDIT_SCHEDULED' AND "planId"=NEW."planId";
  IF root.id IS NULL OR COALESCE(NEW."snapshot"->>'sequence','') !~ '^[1-9][0-9]*$' THEN RAISE EXCEPTION 'Comando sem auditoria de origem/sequência válida'; END IF;
  SELECT id, "eventType", "snapshot", ("snapshot"->>'sequence')::integer
    INTO previous_id, previous_type, previous_snapshot, previous_sequence
    FROM "InternalControlEvent"
    WHERE "planId"=NEW."planId" AND "snapshot"->>'auditId'=root.id
      AND "eventType" IN ('AUDIT_SENT','AUDIT_RESPONSE','AUDIT_REVIEW','AUDIT_CLOSED','AUDIT_CANCELLED')
    ORDER BY ("snapshot"->>'sequence')::integer DESC LIMIT 1;
  IF (NEW."snapshot"->>'sequence')::integer<>COALESCE(previous_sequence,0)+1 THEN RAISE EXCEPTION 'Sequência de auditoria divergente'; END IF;
  IF previous_type IN ('AUDIT_CLOSED','AUDIT_CANCELLED') THEN RAISE EXCEPTION 'Auditoria já encerrada/cancelada'; END IF;
  IF NEW."eventType"='AUDIT_SENT' AND previous_id IS NOT NULL THEN RAISE EXCEPTION 'Auditoria já enviada'; END IF;
  IF NEW."eventType"='AUDIT_RESPONSE' AND NOT (COALESCE(previous_type='AUDIT_SENT',FALSE) OR (COALESCE(previous_type='AUDIT_REVIEW',FALSE) AND previous_snapshot->'accepted'='false'::jsonb)) THEN RAISE EXCEPTION 'Resposta exige envio ou devolução'; END IF;
  IF NEW."eventType"='AUDIT_REVIEW' AND (previous_type IS DISTINCT FROM 'AUDIT_RESPONSE' OR NEW."snapshot"->>'responseId' IS DISTINCT FROM previous_id) THEN RAISE EXCEPTION 'Análise exige última resposta'; END IF;
  IF NEW."eventType"='AUDIT_CLOSED' AND (previous_type IS DISTINCT FROM 'AUDIT_REVIEW' OR previous_snapshot->'accepted' IS DISTINCT FROM 'true'::jsonb) THEN RAISE EXCEPTION 'Encerramento exige análise aceita'; END IF;
  IF NEW."eventType" IN ('AUDIT_CLOSED','AUDIT_CANCELLED') AND NEW."actorId"=root."snapshot"->>'recipientId' THEN RAISE EXCEPTION 'Destinatário não encerra/cancela sua própria auditoria'; END IF;
  IF NEW."eventType"='AUDIT_RESPONSE' AND NEW."actorId"<>root."snapshot"->>'recipientId' THEN RAISE EXCEPTION 'Resposta exclusiva do destinatário'; END IF;
  IF NEW."eventType"='AUDIT_REVIEW' AND (NEW."actorId"<>root."snapshot"->>'auditorId' OR NEW."actorId"=root."snapshot"->>'recipientId') THEN RAISE EXCEPTION 'Análise exige auditor independente'; END IF;
  IF NEW."eventType" IN ('AUDIT_SENT','AUDIT_CLOSED','AUDIT_CANCELLED') AND NEW."actorId"<>owner_id AND NEW."actorId"<>root."snapshot"->>'auditorId' THEN RAISE EXCEPTION 'Decisão exige controlador ou auditor'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "InternalControlEvent_audit_integrity"
BEFORE INSERT OR UPDATE OR DELETE ON "InternalControlEvent"
FOR EACH ROW EXECUTE FUNCTION municipal_control_audit_event_guard();
