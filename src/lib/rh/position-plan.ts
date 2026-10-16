import { Prisma, type PrismaClient, type HrEmploymentContract, type HrEmploymentRevision } from "@prisma/client";
import { z } from "zod";

const civil = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Data civil inválida.");
const value = z.string().regex(/^\d{1,15}(?:\.\d{1,2})?$/);
const roleSchema = z.object({
  roleId: z.string().min(1), authorizedSeats: z.number().int().min(0).max(1000000),
  classification: z.string().trim().min(1).max(160), cbo: z.string().regex(/^\d{6}$/), education: z.string().trim().min(1).max(200),
  legalReference: z.string().trim().min(3).max(4000), duties: z.string().trim().min(3).max(10000), competencies: z.string().trim().min(3).max(10000),
  documentIds: z.array(z.string().min(1)).max(100),
  levels: z.array(z.object({ code: z.string().regex(/^[A-Z0-9_-]{1,64}$/), vertical: z.number().int().min(0), horizontal: z.number().int().min(0), salary: value, monthlyHours: z.number().int().min(1).max(744) }).strict()).min(1).max(500),
  initialLevel: z.string().min(1), finalLevel: z.string().min(1),
}).strict();

export const positionPlanSchema = z.object({ origin: z.literal("QUADRO_CARGOS"), legalReference: z.string().trim().min(3).max(4000), periods: z.array(z.object({ startsAt: civil, endsAt: civil.nullable(), roles: z.array(roleSchema).min(1).max(1000) }).strict()).min(1).max(100) }).strict().superRefine((plan, ctx) => {
  const periods = [...plan.periods].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  periods.forEach((period, index) => {
    if (period.endsAt && period.endsAt < period.startsAt) ctx.addIssue({ code: "custom", message: "Término do quadro anterior ao início." });
    if (index > 0 && (!periods[index - 1].endsAt || periods[index - 1].endsAt! >= period.startsAt)) ctx.addIssue({ code: "custom", message: "Vigências sobrepostas no quadro de cargos." });
    if (new Set(period.roles.map(role => role.roleId)).size !== period.roles.length) ctx.addIssue({ code: "custom", message: "Cargo duplicado na vigência do quadro." });
    for (const role of period.roles) {
      if (new Set(role.levels.map(level => level.code)).size !== role.levels.length || new Set(role.levels.map(level => `${level.vertical}:${level.horizontal}`)).size !== role.levels.length) ctx.addIssue({ code: "custom", message: "Nível/coordenada salarial duplicados no cargo." });
      if (!role.levels.some(level => level.code === role.initialLevel) || !role.levels.some(level => level.code === role.finalLevel)) ctx.addIssue({ code: "custom", message: "Níveis inicial/final ausentes da escala salarial." });
      if (new Set(role.documentIds).size !== role.documentIds.length) ctx.addIssue({ code: "custom", message: "Documento duplicado no cargo." });
    }
  });
});

export type PositionPlan = z.infer<typeof positionPlanSchema>;
type Segment = { contractId: string; regimeId: string; roleId: string; salaryLevel: string | null; salary: Prisma.Decimal; monthlyHours: number; start: number; end: number };
const day = 86400000;
const at = (date: string) => new Date(`${date}T00:00:00.000Z`).getTime();
const stateSchema = z.object({ regimeId: z.string(), roleId: z.string(), salaryLevel: z.string().nullable(), salary: z.string(), monthlyHours: z.number().int(), admittedAt: z.string().datetime(), endsAt: z.string().datetime().nullable(), status: z.string() });

export function positionContractSegments(contract: HrEmploymentContract, revisions: HrEmploymentRevision[]): Segment[] {
  const ordered = [...revisions].sort((a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime() || a.version - b.version);
  const result: Segment[] = [];
  if (!ordered.length) {
    if (contract.status === "ATIVO") result.push({ contractId: contract.id, regimeId: contract.regimeId, roleId: contract.roleId, salaryLevel: contract.salaryLevel, salary: contract.salary, monthlyHours: contract.monthlyHours, start: contract.admittedAt.getTime(), end: contract.endsAt ? contract.endsAt.getTime() + day : Infinity });
    return result;
  }
  ordered.forEach((revision, index) => {
    const state = stateSchema.parse(revision.snapshot);
    const start = Math.max(revision.effectiveFrom.getTime(), new Date(state.admittedAt).getTime());
    const end = Math.min(ordered[index + 1]?.effectiveFrom.getTime() ?? Infinity, state.endsAt ? new Date(state.endsAt).getTime() + day : Infinity);
    if (start < end && state.status === "ATIVO") result.push({ contractId: contract.id, regimeId: state.regimeId, roleId: state.roleId, salaryLevel: state.salaryLevel, salary: new Prisma.Decimal(state.salary), monthlyHours: state.monthlyHours, start, end });
  });
  return result;
}

export function assessPositionPlan(rawPlan: unknown, segments: Segment[], regimeIds: string[], range?: { start: Date; end: Date | null }) {
  const plan = positionPlanSchema.parse(rawPlan);
  const allowedRegimes = new Set(regimeIds);
  const rows: { startsAt: string; endsAt: string | null; roleId: string; authorized: number; peakOccupied: number; minimumAvailable: number; levelCount: number }[] = [];
  const relevant = segments.filter(segment => allowedRegimes.has(segment.regimeId));
  for (const period of plan.periods) {
    const start = Math.max(at(period.startsAt), range?.start.getTime() ?? -Infinity);
    const end = Math.min(period.endsAt ? at(period.endsAt) + day : Infinity, range?.end ? range.end.getTime() + 1 : Infinity);
    if (start >= end) continue;
    const active = relevant.filter(segment => segment.start < end && segment.end > start);
    for (const segment of active) {
      const role = period.roles.find(role => role.roleId === segment.roleId);
      if (!role) throw new Error(`Cargo ${segment.roleId} ausente do quadro em ${period.startsAt}.`);
      const level = role.levels.find(level => level.code === segment.salaryLevel);
      if (!level || !segment.salary.eq(level.salary) || segment.monthlyHours !== level.monthlyHours) throw new Error(`Contrato ${segment.contractId} incompatível com nível/salário/jornada do quadro em ${period.startsAt}.`);
    }
    for (const role of period.roles) {
      const events = new Map<number, number>();
      for (const segment of active.filter(segment => segment.roleId === role.roleId)) {
        const left = Math.max(start, segment.start); const right = Math.min(end, segment.end);
        events.set(left, (events.get(left) || 0) + 1);
        if (Number.isFinite(right)) events.set(right, (events.get(right) || 0) - 1);
      }
      let occupied = 0; let peak = 0;
      for (const [date, change] of [...events].sort(([a], [b]) => a - b)) {
        occupied += change; peak = Math.max(peak, occupied);
        if (occupied > role.authorizedSeats) throw new Error(`Vagas autorizadas do cargo ${role.roleId} excedidas em ${new Date(date).toISOString().slice(0, 10)}: ${occupied}/${role.authorizedSeats}.`);
      }
      rows.push({ startsAt: period.startsAt, endsAt: period.endsAt, roleId: role.roleId, authorized: role.authorizedSeats, peakOccupied: peak, minimumAvailable: role.authorizedSeats - peak, levelCount: role.levels.length });
    }
  }
  return rows;
}

export async function assertPositionPlanForContract(tx: Prisma.TransactionClient, contract: HrEmploymentContract, effectiveFrom: Date) {
  const regime = await tx.hrEmploymentRegime.findUniqueOrThrow({ where: { id: contract.regimeId }, include: { ruleSet: true } });
  // Same lock across all regimes sharing this plan prevents two admissions
  // from observing the last authorized vacancy as available simultaneously.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RH:POSITION_PLAN:${regime.ruleSetId}`}))`;
  const rule = await tx.hrPayrollRule.findFirst({ where: { ruleSetId: regime.ruleSetId, code: "QUADRO_CARGOS", isActive: true } });
  if (!rule) return;
  const plan = positionPlanSchema.parse(rule.value);
  if (regime.ruleSet.status !== "ATIVA" || regime.ruleSet.effectiveFrom > effectiveFrom || (regime.ruleSet.effectiveUntil && regime.ruleSet.effectiveUntil < effectiveFrom)) throw new Error("Quadro de cargos não está ativo na vigência contratual.");
  if (regime.ruleSet.scope === "PRODUCAO" && (regime.ruleSet.isDemo || !regime.ruleSet.approvedAt || regime.ruleSet.approvedAt > new Date() || !regime.ruleSet.legalReference)) throw new Error("Quadro de produção exige conjunto oficial aprovado.");
  const roles = [...new Set(plan.periods.flatMap(period => period.roles.map(role => role.roleId)))];
  const available = await tx.role.count({ where: { id: { in: roles }, isActive: true } });
  if (available !== roles.length) throw new Error("Quadro referencia cargo inexistente/inativo no cadastro central.");
  const documents = [...new Set(plan.periods.flatMap(period => period.roles.flatMap(role => role.documentIds)))];
  if (documents.length && await tx.document.count({ where: { id: { in: documents } } }) !== documents.length) throw new Error("Documento GED referenciado no quadro não encontrado.");
  const periods = [...plan.periods].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  let covered = effectiveFrom.getTime();
  const requiredEnd = contract.endsAt ? contract.endsAt.getTime() + day : Infinity;
  if (regime.ruleSet.effectiveUntil && requiredEnd > regime.ruleSet.effectiveUntil.getTime() + 1) throw new Error("Conjunto do quadro não cobre todo o período contratual.");
  for (const period of periods) {
    const end = period.endsAt ? at(period.endsAt) + day : Infinity;
    if (end <= covered) continue;
    if (at(period.startsAt) > covered) break;
    covered = end;
    if (covered >= requiredEnd) break;
  }
  if (covered < requiredEnd || !periods.some(period => at(period.startsAt) <= effectiveFrom.getTime() && (!period.endsAt || at(period.endsAt) + day > effectiveFrom.getTime()))) throw new Error("Quadro de cargos não cobre todo o período contratual; complete as vigências.");
  const regimes = await tx.hrEmploymentRegime.findMany({ where: { ruleSetId: regime.ruleSetId }, select: { id: true } });
  const contracts = await tx.hrEmploymentContract.findMany({ include: { revisions: true } });
  assessPositionPlan(plan, contracts.flatMap(row => positionContractSegments(row, row.revisions)), regimes.map(row => row.id), { start: effectiveFrom, end: regime.ruleSet.effectiveUntil });
}

export async function inspectPositionPlan(db: PrismaClient, ruleId: string) {
  const rule = await db.hrPayrollRule.findUniqueOrThrow({ where: { id: ruleId }, include: { ruleSet: true } });
  if (rule.code !== "QUADRO_CARGOS") throw new Error("Selecione uma regra QUADRO_CARGOS.");
  const plan = positionPlanSchema.parse(rule.value);
  const [regimes, contracts, roles] = await Promise.all([
    db.hrEmploymentRegime.findMany({ where: { ruleSetId: rule.ruleSetId }, select: { id: true } }),
    db.hrEmploymentContract.findMany({ include: { revisions: true } }),
    db.role.findMany({ where: { id: { in: [...new Set(plan.periods.flatMap(period => period.roles.map(role => role.roleId)))] } }, select: { id: true, name: true } }),
  ]);
  return { rule, plan, roles, rows: assessPositionPlan(plan, contracts.flatMap(row => positionContractSegments(row, row.revisions)), regimes.map(row => row.id), { start: rule.ruleSet.effectiveFrom, end: rule.ruleSet.effectiveUntil }) };
}
