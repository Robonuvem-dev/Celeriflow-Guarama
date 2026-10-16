import type { Prisma } from "@prisma/client";
import type { AppContext } from "@/lib/platform/tenant-context";
import { vaccineDoseStatus, type VaccineCardEvent, type VaccineHistory } from "./vaccination-card-policy";
export async function vaccinationActiveSearch(context: AppContext, query = "", at = new Date()) {
  const unitIds = context.user.hasHealthAccessScope ? context.user.allowedHealthUnitIds || [] : undefined;
  const where: Prisma.PatientWhereInput = { status: "Ativo", person: { status: "Ativo", deathDate: null }, ...(unitIds ? { OR: [{ referenceUnitId: { in: unitIds } }, { vaccinations: { some: { unitId: { in: unitIds } } } }, { appointments: { some: { unitId: { in: unitIds } } } }] } : {}), ...(query.trim() ? { AND: [{ OR: [{ person: { fullName: { contains: query.trim(), mode: "insensitive" } } }, { cns: { contains: query.trim() } }, { person: { cpf: { contains: query.trim() } } }] }] } : {}) };
  const [patients, rules] = await Promise.all([
    context.prisma.patient.findMany({ where, include: { person: { include: { addresses: { where: { canonicalAddressId: null, OR: [{ addressType: "Residencial" }, { addressType: null }] }, include: { neighborhood: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1 } } }, referenceUnit: { select: { name: true } }, contactRecords: { where: { isActive: true }, select: { phone: true }, take: 1 } }, orderBy: { person: { fullName: "asc" } } }),
    context.prisma.healthVaccineCalendarRule.findMany({ where: { enabled: true, validFrom: { lte: at }, OR: [{ validUntil: null }, { validUntil: { gte: at } }], vaccine: { isActive: true } }, include: { vaccine: { select: { name: true } } } }),
  ]);
  const scope = unitIds ? { unitId: { in: unitIds } } : {};
  const patientIds = patients.map(patient => patient.id);
  const [records, events]: [(Omit<VaccineHistory, "source"> & { patientId: string })[], (VaccineCardEvent & { patientId: string; strategy: string })[]] = patientIds.length ? await Promise.all([
    context.prisma.vaccinationRecord.findMany({ where: { patientId: { in: patientIds }, date: { lte: at }, ...scope }, select: { id: true, patientId: true, vaccineId: true, doseNumber: true, strategy: true, date: true } }),
    context.prisma.healthVaccinationCardEvent.findMany({ where: { patientId: { in: patientIds }, occurredAt: { lte: at }, ...scope } }),
  ]) : [[], []];
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
