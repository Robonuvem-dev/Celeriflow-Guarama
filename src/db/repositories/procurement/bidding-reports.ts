import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { employees, roles, secretariats } from "@/db/schema/administration";
import { materials } from "@/db/schema/assets-stock";
import { users } from "@/db/schema/identity";
import { catalogItems } from "@/db/schema/master-data";
import { companies, suppliers } from "@/db/schema/registry";
import { people as persons } from "@/db/schema/people";
import {
  biddings,
  biddingLots,
  biddingParticipants,
  biddingResults,
  purchaseProcesses,
  purchaseProcessItems,
} from "@/db/schema/procurement-core";
import {
  biddingAppointments,
  biddingAppointmentMembers,
  biddingAppointmentAssignments,
  biddingPhases,
  biddingActs,
  biddingLotItems,
  biddingBids,
  biddingEligibilities,
} from "@/db/schema/procurement-bidding";
import { purchaseRequests, purchaseReceipts, purchaseReceiptItems } from "@/db/schema/procurement-requests";

type Row<T extends { $inferSelect: unknown }> = T["$inferSelect"];

export type SupplierIdentity = {
  id: string;
  company: Pick<Row<typeof companies>, "corporateName" | "tradeName"> | null;
  person: Pick<Row<typeof persons>, "fullName"> | null;
};

export type BiddingReportProcessItem = Row<typeof purchaseProcessItems> & {
  catalogItem: Pick<Row<typeof catalogItems>, "code" | "name" | "unit"> | null;
  material: Pick<Row<typeof materials>, "name" | "unitOfMeasure"> | null;
  consumedQuantity?: number;
};

export type BiddingReportParticipant = Row<typeof biddingParticipants> & {
  supplier: SupplierIdentity;
};

export type BiddingReportBid = Row<typeof biddingBids> & {
  participant: BiddingReportParticipant;
};

export type BiddingReportLot = Row<typeof biddingLots> & {
  items: (Row<typeof biddingLotItems> & { purchaseProcessItem: BiddingReportProcessItem })[];
  eligibilityDecisions: Row<typeof biddingEligibilities>[];
  bids: BiddingReportBid[];
  results: (Row<typeof biddingResults> & { participant: BiddingReportParticipant })[];
};

export type BiddingReportData = Row<typeof biddings> & {
  process: Row<typeof purchaseProcesses> & {
    secretariat: { name: string };
    purchaseRequest: { number: string; status: string } | null;
    items: BiddingReportProcessItem[];
  };
  biddingAppointmentAssignments: (Row<typeof biddingAppointmentAssignments> & {
    appointment: Row<typeof biddingAppointments> & {
      members: (Row<typeof biddingAppointmentMembers> & { employee: { name: string } })[];
    };
  })[];
  biddingPhases: Row<typeof biddingPhases>[];
  biddingActs: (Row<typeof biddingActs> & {
    phase: { name: string } | null;
    biddingLot: { number: number } | null;
    actorUsuario: { nome: string };
  })[];
  biddingParticipants: BiddingReportParticipant[];
  biddingLots: BiddingReportLot[];
};

const supplierSelection = {
  id: suppliers.id,
  company: { corporateName: companies.corporateName, tradeName: companies.tradeName },
  person: { fullName: persons.fullName },
};

const processItemSelection = {
  item: purchaseProcessItems,
  catalogItem: { code: catalogItems.code, name: catalogItems.name, unit: catalogItems.unit },
  material: { name: materials.name, unitOfMeasure: materials.unitOfMeasure },
};

async function loadProcessItems(db: DatabaseExecutor, processId: string): Promise<BiddingReportProcessItem[]> {
  const rows = await db
    .select(processItemSelection)
    .from(purchaseProcessItems)
    .leftJoin(catalogItems, eq(catalogItems.id, purchaseProcessItems.catalogItemId))
    .leftJoin(materials, eq(materials.id, purchaseProcessItems.materialId))
    .where(eq(purchaseProcessItems.purchaseProcessId, processId))
    .orderBy(asc(purchaseProcessItems.createdAt));

  const itemIds = rows.map((r) => r.item.id);
  const receipts = itemIds.length
    ? await db
        .select({
          purchaseProcessItemId: purchaseReceiptItems.purchaseProcessItemId,
          quantity: purchaseReceiptItems.quantity,
        })
        .from(purchaseReceiptItems)
        .innerJoin(purchaseReceipts, eq(purchaseReceipts.id, purchaseReceiptItems.purchaseReceiptId))
        .where(
          and(
            inArray(purchaseReceiptItems.purchaseProcessItemId, itemIds),
            eq(purchaseReceipts.status, "APPROVED"),
          ),
        )
    : [];

  const consumedMap = new Map<string, number>();
  for (const r of receipts) {
    consumedMap.set(r.purchaseProcessItemId, (consumedMap.get(r.purchaseProcessItemId) ?? 0) + (r.quantity ?? 0));
  }

  return rows.map((row) => ({
    ...row.item,
    catalogItem: row.catalogItem,
    material: row.material,
    consumedQuantity: consumedMap.get(row.item.id) ?? 0,
  }));
}

export async function loadBiddingReport(db: DatabaseExecutor, id: string): Promise<BiddingReportData | null> {
  const [header] = await db
    .select({
      bidding: biddings,
      process: purchaseProcesses,
      secretariat: { name: secretariats.name },
      purchaseRequest: { number: purchaseRequests.number, status: purchaseRequests.status },
    })
    .from(biddings)
    .innerJoin(purchaseProcesses, eq(purchaseProcesses.id, biddings.processId))
    .innerJoin(secretariats, eq(secretariats.id, purchaseProcesses.secretariatId))
    .leftJoin(purchaseRequests, eq(purchaseRequests.id, purchaseProcesses.purchaseRequestId))
    .where(eq(biddings.id, id))
    .limit(1);

  if (!header) return null;

  const [items, assignments, phases, acts, participantRows, lots] = await Promise.all([
    loadProcessItems(db, header.process.id),
    db
      .select()
      .from(biddingAppointmentAssignments)
      .where(and(eq(biddingAppointmentAssignments.biddingId, id), eq(biddingAppointmentAssignments.status, "Ativa")))
      .orderBy(desc(biddingAppointmentAssignments.assignedAt)),
    db
      .select()
      .from(biddingPhases)
      .where(and(eq(biddingPhases.biddingId, id), eq(biddingPhases.version, 1)))
      .orderBy(asc(biddingPhases.sequence)),
    db
      .select({
        act: biddingActs,
        phase: { name: biddingPhases.name },
        biddingLot: { number: biddingLots.number },
        actorUsuario: { nome: users.nome },
      })
      .from(biddingActs)
      .leftJoin(biddingPhases, eq(biddingPhases.id, biddingActs.phaseId))
      .leftJoin(biddingLots, eq(biddingLots.id, biddingActs.biddingLotId))
      .innerJoin(users, eq(users.id, biddingActs.actorUsuarioId))
      .where(eq(biddingActs.biddingId, id))
      .orderBy(desc(biddingActs.occurredAt)), // all acts, no 60 limit
    db
      .select({ participant: biddingParticipants, ...supplierSelection })
      .from(biddingParticipants)
      .innerJoin(suppliers, eq(suppliers.id, biddingParticipants.supplierId))
      .leftJoin(companies, eq(companies.id, suppliers.companyId))
      .leftJoin(persons, eq(persons.id, suppliers.personId))
      .where(eq(biddingParticipants.biddingId, id))
      .orderBy(asc(biddingParticipants.registeredAt)),
    db
      .select()
      .from(biddingLots)
      .where(eq(biddingLots.biddingId, id))
      .orderBy(asc(biddingLots.number)),
  ]);

  const lotIds = lots.map((lot) => lot.id);
  const appointmentIds = assignments.map((row) => row.appointmentId);

  const [appointments, appointmentMembers, lotItems, eligibility, bids, results] = await Promise.all([
    appointmentIds.length
      ? db.select().from(biddingAppointments).where(inArray(biddingAppointments.id, appointmentIds))
      : [],
    appointmentIds.length
      ? db
          .select({ member: biddingAppointmentMembers, employee: { name: employees.name } })
          .from(biddingAppointmentMembers)
          .innerJoin(employees, eq(employees.id, biddingAppointmentMembers.employeeId))
          .where(
            and(
              inArray(biddingAppointmentMembers.appointmentId, appointmentIds),
              eq(biddingAppointmentMembers.status, "Ativo"),
            ),
          )
          .orderBy(asc(biddingAppointmentMembers.createdAt))
      : [],
    lotIds.length ? db.select().from(biddingLotItems).where(inArray(biddingLotItems.biddingLotId, lotIds)) : [],
    lotIds.length
      ? db
          .select()
          .from(biddingEligibilities)
          .where(inArray(biddingEligibilities.biddingLotId, lotIds))
          .orderBy(desc(biddingEligibilities.decidedAt), desc(biddingEligibilities.createdAt))
      : [],
    lotIds.length
      ? db.select().from(biddingBids).where(inArray(biddingBids.biddingLotId, lotIds)).orderBy(desc(biddingBids.sequence))
      : [],
    lotIds.length
      ? db
          .select()
          .from(biddingResults)
          .where(and(inArray(biddingResults.biddingLotId, lotIds), eq(biddingResults.isCurrent, true)))
      : [],
  ]);

  const participants: BiddingReportParticipant[] = participantRows.map((row) => ({
    ...row.participant,
    supplier: { id: row.id, company: row.company, person: row.person },
  }));
  const participantById = new Map(participants.map((row) => [row.id, row]));
  const itemById = new Map(items.map((row) => [row.id, row]));

  const apptList = appointments.map((appt) => ({
    ...appt,
    members: appointmentMembers
      .filter((m) => m.member.appointmentId === appt.id)
      .map((m) => ({ ...m.member, employee: m.employee })),
  }));
  const apptById = new Map(apptList.map((a) => [a.id, a]));

  return {
    ...header.bidding,
    process: {
      ...header.process,
      secretariat: header.secretariat,
      purchaseRequest: header.purchaseRequest,
      items,
    },
    biddingAppointmentAssignments: assignments
      .filter((a) => apptById.has(a.appointmentId))
      .map((a) => ({ ...a, appointment: apptById.get(a.appointmentId)! })),
    biddingPhases: phases,
    biddingActs: acts.map((row) => ({
      ...row.act,
      phase: row.phase,
      biddingLot: row.biddingLot,
      actorUsuario: row.actorUsuario,
    })),
    biddingParticipants: participants,
    biddingLots: lots.map((lot) => ({
      ...lot,
      items: lotItems
        .filter((row) => row.biddingLotId === lot.id)
        .map((row) => ({
          ...row,
          purchaseProcessItem: itemById.get(row.purchaseProcessItemId)!,
        }))
        .filter((row) => Boolean(row.purchaseProcessItem)),
      eligibilityDecisions: eligibility.filter((row) => row.biddingLotId === lot.id),
      bids: bids
        .filter((row) => row.biddingLotId === lot.id)
        .map((row) => ({ ...row, participant: participantById.get(row.participantId)! }))
        .filter((row) => Boolean(row.participant)),
      results: results
        .filter((row) => row.biddingLotId === lot.id)
        .map((row) => ({ ...row, participant: participantById.get(row.participantId)! }))
        .filter((row) => Boolean(row.participant)),
    })),
  };
}
