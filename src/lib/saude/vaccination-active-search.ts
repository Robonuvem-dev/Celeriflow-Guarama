import { db } from "@/db/client";
import { listCurrentVaccinationRules } from "@/db/repositories/health-vaccination/cards";
import { listVaccinationSearchHistory, listVaccinationSearchPatients } from "@/db/repositories/health-vaccination/search";
import type { HealthVaccinationContext } from "@/lib/contracts/health-vaccination";
import { vaccineDoseStatus, type VaccineCardEvent, type VaccineHistory } from "./vaccination-card-policy";
export async function vaccinationActiveSearch(context: HealthVaccinationContext, query = "", at = new Date()) {
  const executor = context.database ?? db;
  const unitIds = context.user.hasHealthAccessScope ? context.user.allowedHealthUnitIds || [] : undefined;
  const [patients, rules] = await Promise.all([
    listVaccinationSearchPatients(executor, query, unitIds),
    listCurrentVaccinationRules(executor, at),
  ]);
  const patientIds = patients.map(patient => patient.id);
  const [records, events]: readonly [(Omit<VaccineHistory, "source"> & { patientId: string })[], (VaccineCardEvent & { patientId: string; strategy: string })[]] = patientIds.length ? await listVaccinationSearchHistory(executor, patientIds, at, unitIds) : [[], []];
  const recordsByPatient = new Map<string, typeof records>();
  const eventsByPatient = new Map<string, typeof events>();
  for (const record of records) { const values = recordsByPatient.get(record.patientId) || []; values.push(record); recordsByPatient.set(record.patientId, values); }
  for (const event of events) { const values = eventsByPatient.get(event.patientId) || []; values.push(event); eventsByPatient.set(event.patientId, values); }
  const rows = patients.map(patient => {
    const patientEvents = eventsByPatient.get(patient.id) || [];
    const history: VaccineHistory[] = [...(recordsByPatient.get(patient.id) || []).map(record => ({ ...record, source: "APPLICATION" as const })), ...patientEvents.filter(event => event.kind === "RESCUE" && (!event.revokedAt || event.revokedAt > at)).map(event => ({ id: event.id, vaccineId: event.vaccineId, doseNumber: event.doseNumber, strategy: event.strategy, date: event.occurredAt, source: "RESCUE" as const }))];
    const pending = patient.person.birthDate ? rules.map(rule => ({ ...vaccineDoseStatus(rule, patient.person.birthDate!, history, patientEvents, at), vaccineName: rule.vaccine.name })).filter(row => row.pending) : [];
    const address = patient.person.addresses[0];
    return { patientId: patient.id, name: patient.person.fullName, cns: patient.cns, unit: patient.referenceUnit?.name || "Sem unidade de referência", phone: patient.person.phonePrimary || patient.person.whatsapp || patient.person.phoneSecondary || patient.contactRecords[0]?.phone || "Não informado", address: address ? `${address.streetName || ""}, ${address.number || "s/n"} · ${address.neighborhood?.name || ""} · ${address.neighborhood?.city || ""}/${address.neighborhood?.state || ""}` : "Não informado", birthDateMissing: !patient.person.birthDate, pending };
  });
  return { configured: rules.length > 0, rows, totalPatients: rows.length, pendingPatients: rows.filter(row => row.pending.length > 0).length, registrationPending: rows.filter(row => row.birthDateMissing).length, at };
}
