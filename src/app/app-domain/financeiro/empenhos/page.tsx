import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import EmpenhosClient from "./EmpenhosClient"
import { db } from "@/db/client";
import { listFinancePageAppropriations, listFinancePageCommitments, listFinancePageReservations, listFinancePageSuppliers } from "@/db/repositories/finance-pages/operations";
import { readFinanceCommitmentOrigins } from "@/db/repositories/finance-pages/budget";

export default async function EmpenhosPage() {
  const context = await getTenantContextForModule("FINANCEIRO");
  const executor = context.database ?? db;
  const [commitments, suppliers, allAppropriations, reservations, { processes, contracts, obrasServices, covenants, publicityCampaigns, fundedDebts }] = await Promise.all([
    listFinancePageCommitments(executor, {}, true), listFinancePageSuppliers(executor),
    listFinancePageAppropriations(executor), listFinancePageReservations(executor, {}, true), readFinanceCommitmentOrigins(executor),
  ]);
  const appropriations = allAppropriations.map(row => ({ id: row.id, code: row.code, budgetUnit: { name: row.budgetUnit.name } }));
  const displayCommitments = commitments.map(commitment => ({
    id: commitment.id, number: commitment.number, date: commitment.date, value: Number(commitment.valueDecimal ?? commitment.value),
    type: commitment.type, history: commitment.history, status: commitment.status, supplierId: commitment.supplierId, appropriationId: commitment.appropriationId,
    supplier: commitment.supplier, appropriation: commitment.appropriation, financialDocument: commitment.financialDocument,
    obrasServices: commitment.obrasServices.map(row => ({ id: row.id, protocolo: row.protocolo })), purchaseReceipt: commitment.purchaseReceipt,
  }));
  const displayReservations = reservations.map(reservation => ({
    id: reservation.id, number: reservation.number, value: Number(reservation.valueDecimal ?? reservation.value),
    appropriationId: reservation.appropriationId, appropriation: reservation.appropriation, expense: reservation.expense,
  }));

  return <EmpenhosClient commitments={displayCommitments} suppliers={suppliers} appropriations={appropriations} reservations={displayReservations} processes={processes} contracts={contracts} obrasServices={obrasServices} covenants={covenants} publicityCampaigns={publicityCampaigns} fundedDebts={fundedDebts} />
}
