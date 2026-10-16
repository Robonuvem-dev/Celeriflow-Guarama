import { Prisma } from "@prisma/client";
import { z } from "zod";
import { payrollPeriod } from "./calculation-engine";

export async function loadVacationPayrollReservations(tx: Prisma.TransactionClient, input: { entries: Record<string, string[]>; contractIds: string[]; competence: string }) {
  if (Object.keys(input.entries).sort().join() !== [...input.contractIds].sort().join()) throw new Error("Férias vinculadas exigem reservas para todos os contratos selecionados.");
  const period = payrollPeriod(input.competence);
  const result = new Map<string, { days: number; entries: { entryId: string; vacationId: string; days: number; start: string; end: string; acquisitionStart: string; acquisitionEnd: string }[] }>();
  const seen = new Set<string>();
  for (const contractId of [...input.contractIds].sort()) {
    const contract = await tx.hrEmploymentContract.findUniqueOrThrow({ where: { id: contractId }, select: { employeeId: true } });
    const reservations = [];
    for (const entryId of [...input.entries[contractId]].sort()) {
      if (seen.has(entryId)) throw new Error("Reserva de férias duplicada na seleção.");
      seen.add(entryId);
      const entry = await tx.hrRightEntry.findUniqueOrThrow({ where: { id: entryId } });
      const details = z.object({ kind: z.literal("GOZO"), vacationId: z.string().min(1) }).parse(entry.details);
      if (entry.contractId !== contractId || entry.kind !== "FERIAS" || !entry.quantity.lt(0)) throw new Error("Fonte deve ser reserva de gozo do contrato selecionado.");
      const cancelled = await tx.hrRightEntry.findFirst({ where: { contractId, kind: "FERIAS", details: { path: ["cancelsId"], equals: entryId } } });
      const vacation = await tx.vacation.findUniqueOrThrow({ where: { id: details.vacationId } });
      if (cancelled || vacation.employeeId !== contract.employeeId || vacation.acquisitionStart.getTime() !== entry.periodStart.getTime() || vacation.acquisitionEnd.getTime() !== entry.periodEnd.getTime() || !["Programada", "Em gozo", "Concluída"].includes(vacation.status) || !vacation.enjoymentStart || !vacation.enjoymentEnd || vacation.enjoymentStart < period.start || vacation.enjoymentStart > period.end || !entry.quantity.negated().eq(vacation.days)) throw new Error("Reserva cancelada, incompatível ou com início fora da competência de férias.");
      reservations.push({ entryId, vacationId: vacation.id, days: vacation.days, start: vacation.enjoymentStart.toISOString().slice(0, 10), end: vacation.enjoymentEnd.toISOString().slice(0, 10), acquisitionStart: entry.periodStart.toISOString().slice(0, 10), acquisitionEnd: entry.periodEnd.toISOString().slice(0, 10) });
    }
    const days = reservations.reduce((sum, entry) => sum + entry.days, 0);
    if (!days || days > 90) throw new Error("Quantidade de férias vinculadas fora do limite de 1 a 90 dias.");
    result.set(contractId, { days, entries: reservations });
  }
  return result;
}
