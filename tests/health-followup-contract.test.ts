import assert from "node:assert/strict";
import test from "node:test";
import { canonicalFollowupJson, followupContractNames, followupEnvelopeSchema, followupJsonSchema, followupRecordKey, followupRecordSchemas, followupRecordVersion } from "../src/lib/saude/followup-contract";

const at = "2026-10-15T12:00:00.000Z";
const core = {
  originType: "WAITLIST_ENTRY", originId: "wait-one", unitId: "unit-one", patientId: "patient-one", professionalId: null,
  operation: "UPSERT", occurredAt: at, sourceUpdatedAt: at, snapshotAt: at,
  patient: { id: "patient-one", personId: "person-one", name: "Paciente da espera", status: "Ativo", birthDate: null, deathDate: null, gender: null, cpf: null, cns: null, phone: null, address: null },
  unit: { id: "unit-one", name: "Unidade responsável", cnes: null, isActive: true }, professional: null,
  data: { id: "wait-one", origin: "WAITLIST", requestedAt: at, requestedByUsuarioId: "operator-one", status: "Aguardando", priority: "Normal", description: null, specialtyId: null, serviceId: null, procedureId: null, procedureCode: null, protocolNumber: null, guideNumber: null, authorizedAt: null, scheduledAt: null, executedAt: null, returnedAt: null, patientCondition: null, transportNotes: null,
    events: [{ id: "event-one", eventType: "ENTERED", fromStatus: null, toStatus: "Aguardando", notes: null, appointmentId: null, actorUsuarioId: "operator-one", createdAt: at }],
    waitlist: { id: "wait-one", status: "Aguardando", enteredAt: at, updatedAt: at, specialtyId: null, serviceId: null, scheduledAppointmentId: null }, appointment: null,
  },
};
const sourceVersion = followupRecordVersion(core), record = { ...core, sourceVersion, idempotencyKey: followupRecordKey("CELERIFLOW_RIRA", core.originType, core.originId, sourceVersion) };

test("contratos próprios: versão da origem é estável na repetição e muda com o conteúdo clínico/administrativo", () => {
  assert.equal(canonicalFollowupJson({ b: 2, a: { d: 4, c: 3 } }), canonicalFollowupJson({ a: { c: 3, d: 4 }, b: 2 }));
  assert.equal(followupRecordVersion({ ...record, snapshotAt: "2026-10-16T12:00:00.000Z" }), sourceVersion);
  const changed = followupRecordVersion({ ...record, data: { ...record.data, priority: "Urgência" } });
  assert.notEqual(changed, sourceVersion);
  assert.notEqual(followupRecordKey("CELERIFLOW_RIRA", core.originType, core.originId, changed), record.idempotencyKey);
});

test("RIRA: espera administrativa conserva autoria e ausência de profissional clínico", () => {
  assert.equal(followupRecordSchemas.CELERIFLOW_RIRA.safeParse(record).success, true);
  assert.equal(followupRecordSchemas.CELERIFLOW_RIRA.safeParse({ ...record, patientId: "another-patient" }).success, false);
  assert.equal(followupRecordSchemas.CELERIFLOW_RIRA.safeParse({ ...record, professionalId: "unattributed-professional" }).success, false);
  assert.equal(followupRecordSchemas.CELERIFLOW_HIPERDIA.safeParse(record).success, false);
});

test("remessa versionada permite retorno por registro e publica os três esquemas JSON", () => {
  const envelope = { contract: "CELERIFLOW_RIRA", schemaVersion: "1.0.0", batchId: "batch-one", sender: { connectionId: "connection-one", code: "RIRA_UNIT_ONE", unitId: "unit-one" }, receiver: { id: "receiver-one", code: "RECEIVER_RIRA", name: "Receptor de regulação" }, fromDate: "2026-10-01", toDate: "2026-10-31", generatedAt: at, reprocessOfId: null, records: [record, { originId: "incomplete" }] };
  assert.equal(followupEnvelopeSchema.safeParse(envelope).success, true);
  assert.equal(followupEnvelopeSchema.safeParse({ ...envelope, schemaVersion: "2.0.0" }).success, false);
  assert.equal(followupRecordSchemas.CELERIFLOW_RIRA.safeParse(envelope.records[1]).success, false);
  for (const contract of followupContractNames) {
    const schema = followupJsonSchema(contract);
    assert.ok((schema.record as { required?: string[] }).required?.includes("sourceVersion"));
    assert.ok((schema.envelope as { required?: string[] }).required?.includes("schemaVersion"));
  }
});
