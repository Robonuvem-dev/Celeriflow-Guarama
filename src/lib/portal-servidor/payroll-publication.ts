import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { AccessError, assertBudgetUnitAccess, canPerformModuleOperation, type AppContext } from "@/lib/platform/tenant-context";
import { arePortalPayrollStatementsEnabled } from "@/lib/rh/payroll-configuration";
import { assertPayrollBudgetScope } from "@/lib/rh/payroll-access";
import { enqueueHrIntegration } from "@/lib/rh/workforce-service";
import { auditEventTypes, writeAuditEvent } from "@/lib/platform/audit-evidence";

type Db = PrismaClient | Prisma.TransactionClient;
export const portalPayrollPublicationPolicySchema = z.object({ origin: z.literal("DISPONIBILIZACAO_FOLHA_FUNCIONAL"), budgetUnitId: z.string().min(1), payrollTypes: z.array(z.string().min(1)).min(1), regimeIds: z.array(z.string().min(1)).min(1), scopes: z.array(z.enum(["PRODUCAO", "HOMOLOGACAO", "DEMONSTRACAO"])).min(1), allowBeforeClosure: z.boolean() }).strict();
const proofSchema = z.object({ statementId: z.string(), employeeId: z.string(), policyId: z.string(), actorId: z.string(), releaseAt: z.iso.datetime(), allowBeforeClosure: z.boolean(), snapshotHash: z.string() });

export function payrollSnapshotHash(statement: { snapshot: Prisma.JsonValue; gross: Prisma.Decimal; deductions: Prisma.Decimal; net: Prisma.Decimal; employer: Prisma.Decimal }) {
  const normalize = (value: unknown): unknown => Array.isArray(value) ? value.map(normalize) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, normalize(child)])) : value;
  return createHash("sha256").update(JSON.stringify({ snapshot: normalize(statement.snapshot), gross: statement.gross.toString(), deductions: statement.deductions.toString(), net: statement.net.toString(), employer: statement.employer.toString() })).digest("hex");
}

export async function personalStatementPublicationAllowed(db: Db, statement: { id: string; snapshot: Prisma.JsonValue; gross: Prisma.Decimal; deductions: Prisma.Decimal; net: Prisma.Decimal; employer: Prisma.Decimal; releaseAt: Date | null; revokedAt: Date | null; run: { mode: string; status: string } }, employeeId: string) {
  if (!await arePortalPayrollStatementsEnabled(db) || !statement.releaseAt || statement.releaseAt > new Date() || statement.revokedAt || statement.run.mode !== "OFICIAL") return false;
  if (!["FECHADA", "CALCULADA"].includes(statement.run.status)) return false;
  const proof = await db.hrIntegrationEvent.findUnique({ where: { sourceKey: `PORTAL:PUBLICACAO_DEMONSTRATIVO:${statement.id}` } });
  if (!proof) return statement.run.status === "FECHADA";
  const parsed = proofSchema.safeParse(proof?.payload);
  return Boolean(proof.status === "PROCESSADO" && parsed.success && parsed.data.employeeId === employeeId && (statement.run.status === "FECHADA" || parsed.data.allowBeforeClosure) && parsed.data.releaseAt === statement.releaseAt.toISOString() && parsed.data.snapshotHash === payrollSnapshotHash(statement));
}

export async function ownReleasedStatementIds(db: Db, employeeId: string, competence?: string) {
  if (!await arePortalPayrollStatementsEnabled(db)) return [];
  const rows = await db.hrPayrollStatement.findMany({ where: { contract: { employeeId }, releaseAt: { lte: new Date() }, revokedAt: null, run: { mode: "OFICIAL", status: { in: ["FECHADA", "CALCULADA"] }, ...(competence ? { payroll: { competence } } : {}) } }, include: { run: { select: { mode: true, status: true } } } });
  const allowed: string[] = [];
  for (const statement of rows) if (await personalStatementPublicationAllowed(db, statement, employeeId)) allowed.push(statement.id);
  return allowed;
}

export async function publishPayrollByFunctionalPolicy(context: AppContext, raw: unknown) {
  const input = z.object({ runId: z.string().min(1), policyId: z.string().min(1), releaseAt: z.iso.datetime({ offset: true }) }).strict().parse(raw);
  if (!canPerformModuleOperation(context.user, "RH", "update")) throw new AccessError("Sem autorização para disponibilizar demonstrativos.", 403);
  const run = await context.prisma.hrPayrollRun.findUniqueOrThrow({ where: { id: input.runId } });
  await assertPayrollBudgetScope(context, run.payrollId);
  return context.prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RH:payroll:${run.payrollId}`}))`;
    const current = await tx.hrPayrollRun.findUniqueOrThrow({ where: { id: run.id }, include: { payroll: true, statements: { include: { contract: true } } } });
    const rule = await tx.hrPayrollRule.findUniqueOrThrow({ where: { id: input.policyId }, include: { ruleSet: true } }), policy = portalPayrollPublicationPolicySchema.parse(rule.value), now = new Date();
    assertBudgetUnitAccess(context.user, policy.budgetUnitId);
    if (!rule.isActive || rule.category !== "PORTAL" || rule.ruleSet.status !== "ATIVA" || current.ruleSetId !== rule.ruleSetId || now < rule.ruleSet.effectiveFrom || rule.ruleSet.effectiveUntil && now > rule.ruleSet.effectiveUntil || !policy.payrollTypes.includes(current.payroll.type) || !policy.scopes.includes(current.scope as "PRODUCAO" | "HOMOLOGACAO" | "DEMONSTRACAO")) throw new Error("Política incompatível com tipo, escopo ou vigência da folha.");
    if (current.mode !== "OFICIAL" || !["CALCULADA", "FECHADA"].includes(current.status) || current.status !== "FECHADA" && !policy.allowBeforeClosure) throw new Error("A política exige fechamento ou uma autorização explícita de disponibilização antecipada.");
    const statements = current.statements.filter(statement => { const regime = (statement.snapshot as { regime?: { id?: string } }).regime?.id; return regime && policy.regimeIds.includes(regime); });
    if (!statements.length) throw new Error("Nenhum vínculo calculado corresponde aos regimes habilitados.");
    const releaseAt = new Date(input.releaseAt);
    for (const statement of statements) {
      if (statement.revokedAt) throw new Error("Demonstrativo revogado exige uma nova versão de cálculo.");
      const event = await enqueueHrIntegration(tx, { sourceKey: `PORTAL:PUBLICACAO_DEMONSTRATIVO:${statement.id}`, domain: "PORTAL", environment: "INTERNO", eventType: "DEMONSTRATIVO_PUBLICADO_POR_POLITICA", payload: { statementId: statement.id, employeeId: statement.contract.employeeId, policyId: rule.id, actorId: context.user.id, releaseAt: releaseAt.toISOString(), allowBeforeClosure: policy.allowBeforeClosure, snapshotHash: payrollSnapshotHash(statement) } });
      if (event.status === "REVOGADO") throw new Error("Publicação revogada exige uma nova versão.");
      await tx.hrIntegrationEvent.update({ where: { id: event.id }, data: { status: "PROCESSADO" } });
      await tx.hrPayrollStatement.update({ where: { id: statement.id }, data: { releaseAt } });
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.reportIssued, targetType: "EMPLOYEE_STATEMENT_PUBLICATION", targetId: statement.id });
    }
    return statements.length;
  }, { timeout: 60000 });
}

export async function savePayrollPublicationPolicy(context: AppContext, raw: unknown) {
  const input = z.object({ id: z.string().min(1).optional(), ruleSetId: z.string().min(1), code: z.string().regex(/^PORTAL_FOLHA_[A-Z0-9_]{1,45}$/), name: z.string().trim().min(3).max(160), isActive: z.boolean(), value: portalPayrollPublicationPolicySchema }).strict().parse(raw);
  if (!canPerformModuleOperation(context.user, "RH", input.id ? "update" : "create")) throw new AccessError("Sem autorização para configurar a disponibilização da folha.", 403);
  assertBudgetUnitAccess(context.user, input.value.budgetUnitId);
  return context.prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`PORTAL:POLITICA_FOLHA:${input.ruleSetId}:${input.code}`}))`;
    const ruleSet = await tx.hrPayrollRuleSet.findUniqueOrThrow({ where: { id: input.ruleSetId } });
    if (ruleSet.status !== "ATIVA") throw new Error("Configuração RH ativa obrigatória.");
    const regimeIds = [...new Set(input.value.regimeIds)];
    if (await tx.hrEmploymentRegime.count({ where: { id: { in: regimeIds }, ruleSetId: input.ruleSetId } }) !== regimeIds.length) throw new Error("Regimes devem pertencer à configuração RH selecionada.");
    const previous = input.id ? await tx.hrPayrollRule.findUniqueOrThrow({ where: { id: input.id } }) : null;
    if (previous) {
      const policy = portalPayrollPublicationPolicySchema.parse(previous.value);
      assertBudgetUnitAccess(context.user, policy.budgetUnitId);
      if (previous.category !== "PORTAL" || previous.ruleSetId !== input.ruleSetId || previous.code !== input.code) throw new Error("Preserve configuração e código da política.");
    }
    const data = { name: input.name, isActive: input.isActive, category: "PORTAL", valueType: "JSON", value: JSON.parse(JSON.stringify(input.value)) as Prisma.InputJsonValue };
    const rule = previous ? await tx.hrPayrollRule.update({ where: { id: previous.id }, data }) : await tx.hrPayrollRule.create({ data: { ...data, ruleSetId: input.ruleSetId, code: input.code } });
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.instanceConfigurationChanged, targetType: "EMPLOYEE_PAYROLL_PUBLICATION_POLICY", targetId: rule.id });
    return rule.id;
  });
}

export async function revokeFunctionalStatement(context: AppContext, raw: unknown) {
  const input = z.object({ statementId: z.string().min(1), reason: z.string().trim().min(10).max(4000) }).strict().parse(raw);
  if (!canPerformModuleOperation(context.user, "RH", "update")) throw new AccessError("Sem autorização para revogar demonstrativos.", 403);
  const statement = await context.prisma.hrPayrollStatement.findUniqueOrThrow({ where: { id: input.statementId }, include: { run: true } });
  await assertPayrollBudgetScope(context, statement.run.payrollId);
  return context.prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RH:payroll:${statement.run.payrollId}`}))`;
    const current = await tx.hrPayrollStatement.findUniqueOrThrow({ where: { id: statement.id } });
    if (current.revokedAt) return;
    await tx.hrPayrollStatement.update({ where: { id: current.id }, data: { revokedAt: new Date() } });
    await tx.hrIntegrationEvent.updateMany({ where: { sourceKey: `PORTAL:PUBLICACAO_DEMONSTRATIVO:${current.id}` }, data: { status: "REVOGADO" } });
    const event = await enqueueHrIntegration(tx, { sourceKey: `PORTAL:REVOGACAO_DEMONSTRATIVO:${current.id}`, domain: "PORTAL", environment: "INTERNO", eventType: "DEMONSTRATIVO_FUNCIONAL_REVOGADO", payload: { statementId: current.id, actorId: context.user.id, reason: input.reason } });
    await tx.hrIntegrationEvent.update({ where: { id: event.id }, data: { status: "PROCESSADO" } });
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "EMPLOYEE_STATEMENT_REVOCATION", targetId: current.id });
  });
}
