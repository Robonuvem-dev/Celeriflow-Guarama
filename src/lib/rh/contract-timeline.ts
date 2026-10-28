import { Decimal } from "@/db/decimal";
import type { JsonValue } from "@/db/json";
import type { EmploymentContract, EmploymentRevision } from "@/lib/contracts/personnel";
import { z } from "zod";

const instant = z.string().datetime().transform(value => new Date(value));
const nullableInstant = instant.nullable();
const snapshotSchema = z.object({
  id: z.string(), employeeId: z.string(), registration: z.string(),
  regimeId: z.string(), roleId: z.string(), departmentId: z.string().nullable(), costCenterId: z.string().nullable(),
  workLocation: z.string(), salaryLevel: z.string().nullable(), admittedAt: instant,
  appointedAt: nullableInstant, swornAt: nullableInstant, endsAt: nullableInstant,
  monthlyHours: z.number().int().positive(), salary: z.string().transform(value => new Decimal(value)),
  status: z.string(), version: z.number().int().positive(), details: z.unknown(),
});

export function resolveContractRevision<T extends EmploymentContract>(contract: T, revisions: EmploymentRevision[], period: { start: Date; end: Date }) {
  const eligible = revisions.filter(revision => revision.effectiveFrom <= period.end)
    .sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime() || b.version - a.version);
  const revision = eligible[0];
  if (!revision) throw new Error("Contrato sem revisão vigente na competência.");
  // Monthly slicing is a separate calculation policy; never silently apply
  // a mid-month salary/cost-center change to the whole month.
  if (eligible.some(item => item.version > 1 && item.effectiveFrom > period.start)) throw new Error("Alteração contratual no meio da competência exige rateio temporal; selecione uma competência integral da vigência.");
  const snapshot = snapshotSchema.parse(revision.snapshot);
  if (snapshot.id !== contract.id || snapshot.employeeId !== contract.employeeId) throw new Error("Revisão incompatível com a identidade do contrato.");
  return { contract: { ...contract, ...snapshot, details: snapshot.details as JsonValue }, revisionId: revision.id };
}
