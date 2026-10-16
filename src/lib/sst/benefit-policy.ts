import { Prisma } from "@prisma/client";
import { z } from "zod";

// Exact from submitted string through persistence and totals; never uses Float.
export const ExactDecimal = Prisma.Decimal.clone({ precision: 40 });
export const benefitMoney = z.string().trim().regex(/^\d{1,14}([.,]\d{1,2})?$/, "Informe valor monetário com até duas casas decimais.").transform((value) => new ExactDecimal(value.replace(",", ".")).toFixed(2));
export const benefitDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Data civil inválida.").transform((value) => new Date(`${value}T00:00:00Z`));
export const benefitCompetence = z.string().regex(/^(0[1-9]|1[0-2])\/\d{4}$/, "Use MM/AAAA, conforme a competência canônica da folha.").refine((value) => Number(value.slice(3)) >= 2000 && Number(value.slice(3)) <= 9998, "Ano da competência deve estar entre 2000 e 9998.");
const id = z.string().trim().min(1).max(100);
const optionalId = z.string().trim().max(100).optional().transform((value) => value || null);
export const healthPlanInput = z.object({
  budgetUnitId: id, benefitConfigId: id,
  ansPlanNumber: z.string().trim().regex(/^\d{9}$/, "Registro ANS do plano: nove dígitos."),
  ansOperatorNumber: z.string().trim().regex(/^\d{6}$/, "Registro ANS da operadora: seis dígitos."),
  monthlyRubricId: id, extraordinaryRubricId: id,
  monthlyEventId: optionalId, extraordinaryEventId: optionalId,
  contractReference: z.string().trim().min(3).max(500),
}).strict().refine((value) => value.monthlyRubricId !== value.extraordinaryRubricId, "Mensalidade e despesa extraordinária exigem rubricas distintas.");
export const beneficiaryInput = z.object({
  planId: id, payrollBenefitId: id, dependentId: optionalId,
  admissionDate: benefitDay, startsAt: benefitDay, endsAt: benefitDay,
  cardNumber: z.string().trim().min(1).max(100), monthlyAmount: benefitMoney,
  contractReference: z.string().trim().min(3).max(500),
}).strict().refine((value) => value.admissionDate <= value.startsAt && value.startsAt <= value.endsAt, "Adesão deve anteceder a cobertura e a vigência final deve ser posterior à inicial.");
export const benefitEntryInput = z.object({
  beneficiaryId: id, competence: benefitCompetence,
  kind: z.enum(["MONTHLY", "EXTRAORDINARY", "REFUND"]),
  amount: benefitMoney, sourceReference: z.string().trim().min(3).max(200),
  reason: z.string().trim().min(3).max(1000), refundOfId: optionalId,
}).strict().superRefine((value, ctx) => {
  if (new ExactDecimal(value.amount).lte(0)) ctx.addIssue({ code: "custom", message: "Lançamento deve ter valor maior que zero." });
  if ((value.kind === "REFUND") !== !!value.refundOfId) ctx.addIssue({ code: "custom", message: "Devolução exige a cobrança de origem; cobrança não recebe origem de devolução." });
});
export function competenceInterval(value: string) {
  const valid = benefitCompetence.parse(value);
  const [month, year] = valid.split("/").map(Number);
  return { start: new Date(Date.UTC(year, month - 1, 1)), end: new Date(Date.UTC(year, month, 0)) };
}
export function benefitCoversCompetence(startsAt: Date, endsAt: Date, competence: string) {
  const { start, end } = competenceInterval(competence);
  return startsAt <= end && endsAt >= start;
}
export type BenefitLedgerRow = { beneficiaryId: string; competence: string; kind: string; amount: { toString(): string } };
export function summarizeBenefitLedger(rows: BenefitLedgerRow[]) {
  const groups = new Map<string, { beneficiaryId: string; competence: string; monthly: Prisma.Decimal; extraordinary: Prisma.Decimal; refunds: Prisma.Decimal; net: Prisma.Decimal }>();
  for (const row of rows) {
    const key = `${row.beneficiaryId}:${row.competence}`;
    const group = groups.get(key) ?? { beneficiaryId: row.beneficiaryId, competence: row.competence, monthly: new ExactDecimal(0), extraordinary: new ExactDecimal(0), refunds: new ExactDecimal(0), net: new ExactDecimal(0) };
    const amount = new ExactDecimal(row.amount.toString());
    if (row.kind === "MONTHLY") group.monthly = group.monthly.plus(amount);
    else if (row.kind === "EXTRAORDINARY") group.extraordinary = group.extraordinary.plus(amount);
    else if (row.kind === "REFUND") group.refunds = group.refunds.plus(amount.negated());
    else throw new Error("Tipo de lançamento desconhecido.");
    group.net = group.net.plus(amount);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({ ...group, monthly: group.monthly.toFixed(2), extraordinary: group.extraordinary.toFixed(2), refunds: group.refunds.toFixed(2), net: group.net.toFixed(2) }));
}
