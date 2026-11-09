import type { DemoState, DemoEvent } from "./contracts";
import type { DemoState as DomainState, Event, Attempt } from "./contract";
import { reconciliation } from "./engine";
import { validateEvent } from "./demo-transport";

/** Read-only projection: no parallel state machine or persistence contract. */
export function presentDemo(state: DomainState, runId: string | null, actorId: string, audit = false): DemoState {
  const xml = (id: string | null | undefined) => state.artifacts.find(a => a.id === id)?.xml;
  const eventView = (event: Event, attempt?: Attempt, historical = false): DemoEvent => ({
    id: historical ? attempt!.id : event.id, logicalId: event.id, type: event.type, period: event.period, reference: event.reference,
    registration: event.registration, name: event.name, regime: event.regime || "Declarante", status: historical ? attempt!.status : event.status,
    batchId: attempt?.batchId || null, receipt: attempt?.receipt || null, attempt: attempt?.revision || event.revision,
    sourceUrl: event.sourceUrl, sourceKind: event.sourceKind === "IMPORTED_EXTERNAL" ? "IMPORT" : event.sourceKind === "RH" ? "RH_LINK" : "FIXTURE",
    expected: { cp: event.amounts.expectedCp, irrf: event.amounts.irrf, fgts: event.amounts.fgts }, returned: { cp: event.amounts.cp, irrf: event.amounts.irrf, fgts: event.amounts.fgts },
    occurrences: attempt?.occurrences.length ? attempt.occurrences : validateEvent(event, state.rubrics),
    sentXml: xml(attempt?.sentArtifactId), returnXml: xml(attempt?.returnArtifactId), sentArtifactId: attempt?.sentArtifactId, returnArtifactId: attempt?.returnArtifactId || undefined,
    hash: attempt?.hash, duplicated: attempt?.duplicated, archived: attempt?.archived, historical, rubric: event.rubric, warning: event.warning,
  });
  const events = state.events.flatMap(e => {
    const latest = e.attempts.at(-1);
    return [eventView(e, latest?.revision === e.revision ? latest : undefined), ...e.attempts.filter(a => a !== latest || a.revision !== e.revision).map(a => eventView(e, a, true))];
  });
  return {
    version: 1, revision: state.generation, runId, employerId: state.employerId, period: state.period, mode: "DEMO", source: "SIMULATED", layout: "S-1.3", events,
    reconciliation: reconciliation(state).map(r => ({ ...r, label: r.metric, consolidatedValue: r.consolidated })),
    batches: state.batches.map(b => ({ id: b.id, category: b.category, eventIds: b.eventIds, status: b.status === "ACCEPTED" ? "PROCESSED" : b.status === "REJECTED" ? "SCHEMA_ERROR" : b.status === "PROCESSING" ? "PROCESSING" : b.status === "TRANSPORT_ERROR" ? "TRANSPORT_ERROR" : "RECEIVED", protocol: b.protocol, receivedAt: b.createdAt, queryIndex: b.queries, statusCode: b.queries ? state.consultations.findLast(c => c.batchId === b.id)?.code || null : b.protocol ? 201 : b.status === "REJECTED" ? 402 : null, receptionXml: xml(b.receiptArtifactId), scenario: "NORMAL" })),
    consultations: state.consultations.map(c => ({ id: c.id, batchId: c.batchId, protocol: c.protocol, queryIndex: c.index, statusCode: c.code, at: c.createdAt, xml: xml(c.artifactId)!, source: "SIMULATED" })),
    totalizers: state.totalizers.map(t => {
      const e = state.events.find(e => e.id === t.eventId)!;
      const metric = ["S-5001", "S-5011"].includes(t.type) ? "cp" : ["S-5002", "S-5012"].includes(t.type) ? "irrf" : "fgts";
      // Individual historical values are stable per attempt; closing expected is from the scenario.
      const expected = t.type.startsWith("S-501") ? reconciliation(state).find(r => r.metric.toLowerCase() === metric)!.expected : metric === "cp" ? e.amounts.expectedCp : metric === "irrf" ? e.amounts.irrf : e.amounts.fgts;
      return { id: t.id, type: t.type, period: t.period, originEventId: t.eventId, originReceipt: t.receipt, originAttempt: t.revision, batchId: t.batchId, consultationId: t.consultationId, registration: t.registration, name: t.name, regime: t.regime || "Declarante", valueCents: t.value, expectedCents: expected, metric, receivedAt: t.receivedAt, xml: xml(t.artifactId)!, hash: state.artifacts.find(a=>a.id===t.artifactId)!.hash, source: "SIMULATED", revision: t.revision };
    }),
    // IDs used by existing console links resolve to these immutable artifacts only.
    artifacts: [
      ...state.artifacts.map(({ id, kind, xml, hash }) => ({ id, kind, xml, hash })),
      ...state.batches.flatMap(b=>b.receiptArtifactId?[{...state.artifacts.find(a=>a.id===b.receiptArtifactId)!,id:`${b.id}-reception`}]:[]),
      ...state.consultations.map(c=>({...state.artifacts.find(a=>a.id===c.artifactId)!,id:c.id})),
      ...state.totalizers.map(t=>({...state.artifacts.find(a=>a.id===t.artifactId)!,id:t.id})),
    ].map(({id,kind,xml,hash})=>({id,kind,xml,hash})),
    timeline: state.timeline.map(t=>({ id: t.id, at: t.at, action: t.action, reference: `${t.target} · ${t.message}`, actor: t.actorId })),
    imports: state.imports.map(i=>({ id: i.id, filename: i.filename || i.eventId, hash: i.hash, eventId: i.eventId, registration: i.registration || "", receipt: i.receipt || "", status: i.status, xml: xml(i.artifactId)! })),
    rubrics: state.rubrics, subscriptions: state.subscribers.filter(id=>audit||id===actorId),
    notifications: state.notifications.filter(n=>audit||n.recipientId===actorId).map(n=>({id:n.id,userId:n.recipientId,state:n.status,eventId:n.eventId,at:n.createdAt,status:"DEMO_OUTBOX",subject:`${n.channel}: ${n.subject}`})),
    automation: { authorized: !!state.schedule?.enabled, stage: state.schedule?.stage || "COMPLETE", dueAt: state.schedule?.dueAt || null, lastRun: state.schedule?.lastRun || null },
  };
}
