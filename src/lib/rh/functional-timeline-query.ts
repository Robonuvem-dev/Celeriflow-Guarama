import { sql, type SQLWrapper } from "drizzle-orm";

/** Resolve the last recorded position before applying its declared business validity. */
export function functionalRecordsObservedAt(reference: SQLWrapper) {
  return sql`(SELECT state->>'id' id,state->>'kind' kind,state->>'name' name,state->>'employeeId' "employeeId",state->>'contractId' "contractId",
    (state->>'startsAt')::timestamp "startsAt",(state->>'endsAt')::timestamp "endsAt",state->>'status' status,state->'data' data,(state->>'version')::integer version,state->>'actorId' "actorId"
    FROM (SELECT DISTINCT ON (record_id) state FROM (
      SELECT revision."referenceId" record_id,revision."afterValue" state,revision."createdAt" observed,revision.sequence sequence,revision.id source
        FROM "HrReferenceRevision" revision WHERE revision.kind='HR_FUNCTIONAL_RECORD' AND revision."createdAt"<${reference}::date+interval '1 day'
      UNION ALL SELECT event.payload->'after'->>'id',event.payload->'after',event."createdAt",0::bigint,event.id
        FROM "HrIntegrationEvent" event WHERE event."eventType"='FICHA_FUNCIONAL_REGISTRADA' AND event."createdAt"<${reference}::date+interval '1 day'
    ) observations WHERE record_id IS NOT NULL ORDER BY record_id,observed DESC,sequence DESC,source DESC) latest
    WHERE state IS NOT NULL AND state->>'id' IS NOT NULL)`;
}
