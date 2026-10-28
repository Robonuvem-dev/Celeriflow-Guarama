import { and, eq, gte, inArray, lte, ne } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { leaves, vacations } from "@/db/schema/personnel-records";

export async function assertRhAbsenceDoesNotOverlap(tx: DatabaseExecutor, input: { employeeId: string; startsAt: Date; endsAt: Date; kind: "FERIAS" | "LICENCA"; excludeId?: string }) {
  if (!Number.isFinite(input.startsAt.getTime()) || !Number.isFinite(input.endsAt.getTime()) || input.endsAt < input.startsAt) throw new Error("Período de férias/afastamento inválido.");
  const [vacation] = await tx.select({ id: vacations.id }).from(vacations).where(and(eq(vacations.employeeId, input.employeeId), input.kind === "FERIAS" && input.excludeId ? ne(vacations.id, input.excludeId) : undefined, inArray(vacations.status, ["Programada", "Em gozo", "Concluída"]), lte(vacations.enjoymentStart, input.endsAt), gte(vacations.enjoymentEnd, input.startsAt))).limit(1);
  const [leave] = await tx.select({ id: leaves.id }).from(leaves).where(and(eq(leaves.employeeId, input.employeeId), input.kind === "LICENCA" && input.excludeId ? ne(leaves.id, input.excludeId) : undefined, eq(leaves.status, "Ativa"), lte(leaves.startDate, input.endsAt), gte(leaves.endDate, input.startsAt))).limit(1);
  if (vacation || leave) throw new Error("Período conflita com férias ou afastamento do servidor.");
}
