import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { employees, roles, secretariats } from "@/db/schema/administration";
import { materials } from "@/db/schema/assets-stock";
import { users } from "@/db/schema/identity";
import { catalogItems } from "@/db/schema/master-data";
import { companies, suppliers } from "@/db/schema/registry";
import { people as persons } from "@/db/schema/people";
import { biddings, biddingLots, biddingParticipants, biddingResults, purchaseProcesses, purchaseProcessItems } from "@/db/schema/procurement-core";
import { biddingAppointments, biddingAppointmentMembers, biddingAppointmentAssignments, biddingPhases, biddingActs, biddingLotItems, biddingBids, biddingEligibilities, supplierPortalIdentities } from "@/db/schema/procurement-bidding";
import { procurementLifecycleEvents, purchaseRequests } from "@/db/schema/procurement-requests";

type Row<T extends { $inferSelect: unknown }> = T["$inferSelect"];
type SupplierIdentity = { id: string; company: Pick<Row<typeof companies>, "corporateName" | "tradeName"> | null; person: Pick<Row<typeof persons>, "fullName"> | null };
type ProcessItem = Row<typeof purchaseProcessItems> & { catalogItem: Pick<Row<typeof catalogItems>, "code" | "name" | "unit"> | null; material: Pick<Row<typeof materials>, "name" | "unitOfMeasure"> | null };
type Participant = Row<typeof biddingParticipants> & { supplier: SupplierIdentity };
type Appointment = Row<typeof biddingAppointments> & { members: (Row<typeof biddingAppointmentMembers> & { employee: { name: string } })[] };
type Lot = Row<typeof biddingLots> & {
  items: (Row<typeof biddingLotItems> & { purchaseProcessItem: ProcessItem })[];
  eligibilityDecisions: Row<typeof biddingEligibilities>[];
  bids: (Row<typeof biddingBids> & { participant: Participant })[];
  results: (Row<typeof biddingResults> & { participant: Participant })[];
};
export type BiddingDetail = Row<typeof biddings> & {
  process: Row<typeof purchaseProcesses> & { secretariat: { name: string }; purchaseRequest: { number: string; status: string } | null; items: ProcessItem[] };
  biddingAppointmentAssignments: (Row<typeof biddingAppointmentAssignments> & { appointment: Appointment })[];
  biddingPhases: Row<typeof biddingPhases>[];
  biddingActs: (Row<typeof biddingActs> & { phase: { name: string } | null; biddingLot: { number: number } | null; actorUsuario: { nome: string } })[];
  biddingParticipants: Participant[];
  biddingLots: Lot[];
};
type BiddingSelectors = {
  availableAppointments: Appointment[]; employees: { id: string; name: string; role: { name: string } | null }[];
  suppliers: SupplierIdentity[]; users: { id: string; nome: string; email: string }[];
  portalIdentities: (Row<typeof supplierPortalIdentities> & { usuario: { nome: string; email: string } })[];
  lifecycleEvents: (Row<typeof procurementLifecycleEvents> & { actorUsuario: { nome: string } })[];
};
type SupplierParticipation = Row<typeof biddingParticipants> & { supplier: SupplierIdentity; bidding: Row<typeof biddings> & { process: { number: string; object: string }; _count: { biddingLots: number } } };
type SupplierParticipationDetail = Row<typeof biddingParticipants> & { supplier: SupplierIdentity; bidding: Row<typeof biddings> & { process: { number: string; object: string }; biddingLots: (Row<typeof biddingLots> & { items: Lot["items"]; eligibilityDecisions: Row<typeof biddingEligibilities>[]; bids: Row<typeof biddingBids>[] })[] } };

const supplierSelection = { id: suppliers.id, company: { corporateName: companies.corporateName, tradeName: companies.tradeName }, person: { fullName: persons.fullName } };
const processItemSelection = { item: purchaseProcessItems, catalogItem: { code: catalogItems.code, name: catalogItems.name, unit: catalogItems.unit }, material: { name: materials.name, unitOfMeasure: materials.unitOfMeasure } };

async function loadProcessItems(db: DatabaseExecutor, processId: string): Promise<ProcessItem[]> {
  const rows = await db.select(processItemSelection).from(purchaseProcessItems)
    .leftJoin(catalogItems, eq(catalogItems.id, purchaseProcessItems.catalogItemId)).leftJoin(materials, eq(materials.id, purchaseProcessItems.materialId))
    .where(eq(purchaseProcessItems.purchaseProcessId, processId)).orderBy(asc(purchaseProcessItems.createdAt));
  return rows.map(row => ({ ...row.item, catalogItem: row.catalogItem, material: row.material }));
}

async function loadAppointments(db: DatabaseExecutor, ids?: string[]): Promise<Appointment[]> {
  if (ids && !ids.length) return [];
  const appointments = await db.select().from(biddingAppointments).where(ids ? inArray(biddingAppointments.id, ids) : eq(biddingAppointments.status, "Ativa")).orderBy(desc(biddingAppointments.createdAt)).limit(ids ? Math.max(ids.length, 1) : 50);
  const members = appointments.length ? await db.select({ member: biddingAppointmentMembers, employee: { name: employees.name } }).from(biddingAppointmentMembers)
    .innerJoin(employees, eq(employees.id, biddingAppointmentMembers.employeeId)).where(and(inArray(biddingAppointmentMembers.appointmentId, appointments.map(row => row.id)), eq(biddingAppointmentMembers.status, "Ativo"))).orderBy(asc(biddingAppointmentMembers.createdAt)) : [];
  return appointments.map(appointment => ({ ...appointment, members: members.filter(row => row.member.appointmentId === appointment.id).map(row => ({ ...row.member, employee: row.employee })) }));
}

export async function listBiddingProcesses(db: DatabaseExecutor): Promise<(Row<typeof purchaseProcesses> & { items: ProcessItem[] })[]> {
  const processes = await db.select().from(purchaseProcesses).orderBy(desc(purchaseProcesses.number));
  const items = processes.length ? await db.select(processItemSelection).from(purchaseProcessItems).leftJoin(catalogItems, eq(catalogItems.id, purchaseProcessItems.catalogItemId)).leftJoin(materials, eq(materials.id, purchaseProcessItems.materialId)).where(inArray(purchaseProcessItems.purchaseProcessId, processes.map(row => row.id))) : [];
  return processes.map(process => ({ ...process, items: items.filter(row => row.item.purchaseProcessId === process.id).map(row => ({ ...row.item, catalogItem: row.catalogItem, material: row.material })) }));
}

export async function loadBiddingHeader(db: DatabaseExecutor, id: string): Promise<Row<typeof biddings> | null> {
  const [row] = await db.select().from(biddings).where(eq(biddings.id, id)).limit(1);
  return row ?? null;
}

export async function loadBiddingDetail(db: DatabaseExecutor, id: string): Promise<BiddingDetail | null> {
  const [header] = await db.select({ bidding: biddings, process: purchaseProcesses, secretariat: { name: secretariats.name }, purchaseRequest: { number: purchaseRequests.number, status: purchaseRequests.status } }).from(biddings)
    .innerJoin(purchaseProcesses, eq(purchaseProcesses.id, biddings.processId)).innerJoin(secretariats, eq(secretariats.id, purchaseProcesses.secretariatId)).leftJoin(purchaseRequests, eq(purchaseRequests.id, purchaseProcesses.purchaseRequestId)).where(eq(biddings.id, id)).limit(1);
  if (!header) return null;
  const [items, assignments, phases, acts, participantRows, lots] = await Promise.all([
    loadProcessItems(db, header.process.id),
    db.select().from(biddingAppointmentAssignments).where(and(eq(biddingAppointmentAssignments.biddingId, id), eq(biddingAppointmentAssignments.status, "Ativa"))).orderBy(desc(biddingAppointmentAssignments.assignedAt)),
    db.select().from(biddingPhases).where(and(eq(biddingPhases.biddingId, id), eq(biddingPhases.version, 1))).orderBy(asc(biddingPhases.sequence)),
    db.select({ act: biddingActs, phase: { name: biddingPhases.name }, biddingLot: { number: biddingLots.number }, actorUsuario: { nome: users.nome } }).from(biddingActs).leftJoin(biddingPhases, eq(biddingPhases.id, biddingActs.phaseId)).leftJoin(biddingLots, eq(biddingLots.id, biddingActs.biddingLotId)).innerJoin(users, eq(users.id, biddingActs.actorUsuarioId)).where(eq(biddingActs.biddingId, id)).orderBy(desc(biddingActs.occurredAt)).limit(60),
    db.select({ participant: biddingParticipants, ...supplierSelection }).from(biddingParticipants).innerJoin(suppliers, eq(suppliers.id, biddingParticipants.supplierId)).leftJoin(companies, eq(companies.id, suppliers.companyId)).leftJoin(persons, eq(persons.id, suppliers.personId)).where(eq(biddingParticipants.biddingId, id)).orderBy(asc(biddingParticipants.registeredAt)),
    db.select().from(biddingLots).where(eq(biddingLots.biddingId, id)).orderBy(asc(biddingLots.number)),
  ]);
  const lotIds = lots.map(lot => lot.id);
  const [appointments, lotItems, eligibility, bids, results] = await Promise.all([
    loadAppointments(db, assignments.map(row => row.appointmentId)),
    lotIds.length ? db.select().from(biddingLotItems).where(inArray(biddingLotItems.biddingLotId, lotIds)) : [],
    lotIds.length ? db.select().from(biddingEligibilities).where(inArray(biddingEligibilities.biddingLotId, lotIds)).orderBy(desc(biddingEligibilities.decidedAt), desc(biddingEligibilities.createdAt)) : [],
    lotIds.length ? db.select().from(biddingBids).where(inArray(biddingBids.biddingLotId, lotIds)).orderBy(desc(biddingBids.sequence)) : [],
    lotIds.length ? db.select().from(biddingResults).where(and(inArray(biddingResults.biddingLotId, lotIds), eq(biddingResults.isCurrent, true))) : [],
  ]);
  const participants: Participant[] = participantRows.map(row => ({ ...row.participant, supplier: { id: row.id, company: row.company, person: row.person } }));
  const participantById = new Map(participants.map(row => [row.id, row]));
  const itemById = new Map(items.map(row => [row.id, row]));
  const appointmentById = new Map(appointments.map(row => [row.id, row]));
  return {
    ...header.bidding, process: { ...header.process, secretariat: header.secretariat, purchaseRequest: header.purchaseRequest, items },
    biddingAppointmentAssignments: assignments.map(row => ({ ...row, appointment: appointmentById.get(row.appointmentId)! })),
    biddingPhases: phases, biddingActs: acts.map(row => ({ ...row.act, phase: row.phase, biddingLot: row.biddingLot, actorUsuario: row.actorUsuario })), biddingParticipants: participants,
    biddingLots: lots.map(lot => ({ ...lot,
      items: lotItems.filter(row => row.biddingLotId === lot.id).map(row => ({ ...row, purchaseProcessItem: itemById.get(row.purchaseProcessItemId)! })),
      eligibilityDecisions: eligibility.filter(row => row.biddingLotId === lot.id),
      bids: bids.filter(row => row.biddingLotId === lot.id).map(row => ({ ...row, participant: participantById.get(row.participantId)! })),
      results: results.filter(row => row.biddingLotId === lot.id).map(row => ({ ...row, participant: participantById.get(row.participantId)! })),
    })),
  };
}

export async function loadBiddingSelectors(db: DatabaseExecutor, biddingId: string, supplierIds: string[]): Promise<BiddingSelectors> {
  const [availableAppointments, employeeRows, supplierRows, userRows, identities, events] = await Promise.all([
    loadAppointments(db),
    db.select({ id: employees.id, name: employees.name, role: { name: roles.name } }).from(employees).leftJoin(roles, eq(roles.id, employees.roleId)).where(eq(employees.isActive, true)).orderBy(asc(employees.name)),
    db.select(supplierSelection).from(suppliers).leftJoin(companies, eq(companies.id, suppliers.companyId)).leftJoin(persons, eq(persons.id, suppliers.personId)).where(eq(suppliers.status, "Ativo")).orderBy(desc(suppliers.createdAt)).limit(100),
    db.select({ id: users.id, nome: users.nome, email: users.email }).from(users).where(eq(users.ativo, true)).orderBy(asc(users.nome)).limit(150),
    supplierIds.length ? db.select({ identity: supplierPortalIdentities, usuario: { nome: users.nome, email: users.email } }).from(supplierPortalIdentities).innerJoin(users, eq(users.id, supplierPortalIdentities.usuarioId)).where(inArray(supplierPortalIdentities.supplierId, supplierIds)).orderBy(asc(supplierPortalIdentities.createdAt)) : [],
    db.select({ event: procurementLifecycleEvents, actorUsuario: { nome: users.nome } }).from(procurementLifecycleEvents).innerJoin(users, eq(users.id, procurementLifecycleEvents.actorUsuarioId)).where(and(eq(procurementLifecycleEvents.entityType, "BIDDING"), eq(procurementLifecycleEvents.entityId, biddingId))).orderBy(desc(procurementLifecycleEvents.createdAt)).limit(20),
  ]);
  return { availableAppointments, employees: employeeRows, suppliers: supplierRows, users: userRows, portalIdentities: identities.map(row => ({ ...row.identity, usuario: row.usuario })), lifecycleEvents: events.map(row => ({ ...row.event, actorUsuario: row.actorUsuario })) };
}

export async function listSupplierBiddingParticipations(db: DatabaseExecutor, usuarioId: string): Promise<SupplierParticipation[]> {
  const rows = await db.select({ participant: biddingParticipants, ...supplierSelection, bidding: biddings, process: { number: purchaseProcesses.number, object: purchaseProcesses.object }, lotCount: sql<number>`(SELECT count(*)::integer FROM "BiddingLot" l WHERE l."biddingId" = ${biddings.id})` }).from(biddingParticipants)
    .innerJoin(suppliers, eq(suppliers.id, biddingParticipants.supplierId)).leftJoin(companies, eq(companies.id, suppliers.companyId)).leftJoin(persons, eq(persons.id, suppliers.personId))
    .innerJoin(biddings, eq(biddings.id, biddingParticipants.biddingId)).innerJoin(purchaseProcesses, eq(purchaseProcesses.id, biddings.processId))
    .where(and(eq(suppliers.status, "Ativo"), sql`EXISTS (SELECT 1 FROM "SupplierPortalIdentity" i WHERE i."supplierId" = ${suppliers.id} AND i."usuarioId" = ${usuarioId} AND i.status = 'Ativo')`)).orderBy(desc(biddingParticipants.registeredAt));
  return rows.map(row => ({ ...row.participant, supplier: { id: row.id, company: row.company, person: row.person }, bidding: { ...row.bidding, process: row.process, _count: { biddingLots: row.lotCount } } }));
}

export async function loadSupplierBiddingParticipation(db: DatabaseExecutor, participantId: string, usuarioId: string): Promise<SupplierParticipationDetail | null> {
  const [row] = await db.select({ participant: biddingParticipants, ...supplierSelection, bidding: biddings, process: { number: purchaseProcesses.number, object: purchaseProcesses.object } }).from(biddingParticipants)
    .innerJoin(suppliers, eq(suppliers.id, biddingParticipants.supplierId)).leftJoin(companies, eq(companies.id, suppliers.companyId)).leftJoin(persons, eq(persons.id, suppliers.personId))
    .innerJoin(biddings, eq(biddings.id, biddingParticipants.biddingId)).innerJoin(purchaseProcesses, eq(purchaseProcesses.id, biddings.processId))
    .where(and(eq(biddingParticipants.id, participantId), eq(suppliers.status, "Ativo"), sql`EXISTS (SELECT 1 FROM "SupplierPortalIdentity" i WHERE i."supplierId" = ${suppliers.id} AND i."usuarioId" = ${usuarioId} AND i.status = 'Ativo')`)).limit(1);
  if (!row) return null;
  const [lots, items] = await Promise.all([db.select().from(biddingLots).where(eq(biddingLots.biddingId, row.bidding.id)).orderBy(asc(biddingLots.number)), loadProcessItems(db, row.bidding.processId)]);
  const lotIds = lots.map(lot => lot.id);
  const [lotItems, eligibility, bids] = await Promise.all([
    lotIds.length ? db.select().from(biddingLotItems).where(inArray(biddingLotItems.biddingLotId, lotIds)) : [],
    lotIds.length ? db.select().from(biddingEligibilities).where(and(inArray(biddingEligibilities.biddingLotId, lotIds), eq(biddingEligibilities.participantId, participantId))).orderBy(desc(biddingEligibilities.decidedAt), desc(biddingEligibilities.createdAt)) : [],
    lotIds.length ? db.select().from(biddingBids).where(and(inArray(biddingBids.biddingLotId, lotIds), eq(biddingBids.participantId, participantId))).orderBy(desc(biddingBids.sequence)) : [],
  ]);
  const itemById = new Map(items.map(item => [item.id, item]));
  return { ...row.participant, supplier: { id: row.id, company: row.company, person: row.person }, bidding: { ...row.bidding, process: row.process, biddingLots: lots.map(lot => ({ ...lot,
    items: lotItems.filter(item => item.biddingLotId === lot.id).map(item => ({ ...item, purchaseProcessItem: itemById.get(item.purchaseProcessItemId)! })),
    eligibilityDecisions: eligibility.filter(decision => decision.biddingLotId === lot.id).slice(0, 1), bids: bids.filter(bid => bid.biddingLotId === lot.id),
  })) } };
}
