import { createHash } from "node:crypto";
import { Decimal } from "@/db/decimal";
import type { JsonValue } from "@/db/json";
import { eq, sql } from "drizzle-orm";
import { db, databaseConnection } from "@/db/client";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseExecutor } from "@/db/transaction";
import { changePortalEvent, portalCount, portalEvent, portalRequired, requiredPortalPolicy } from "@/db/repositories/portal-servidor/records";
import { portalStatements } from "@/db/repositories/portal-servidor/payroll";
import { hrPayrollRules } from "@/db/schema/personnel-configuration";
import { z } from "zod";
import { AccessError, assertBudgetUnitAccess, canPerformModuleOperation, type AppContext } from "@/lib/platform/tenant-context";
import { arePortalPayrollStatementsEnabled } from "@/lib/rh/payroll-configuration";
import { assertPayrollBudgetScope } from "@/lib/rh/payroll-access";
import { enqueueHrIntegration } from "@/lib/rh/workforce-service";
import { auditEventTypes } from "@/lib/platform/audit-evidence";
import { insertAuditEvent as writeAuditEvent } from "@/db/repositories/platform/audit";

type Db = DatabaseExecutor;
export const portalPayrollPublicationPolicySchema = z.object({ origin: z.literal("DISPONIBILIZACAO_FOLHA_FUNCIONAL"), budgetUnitId: z.string().min(1), payrollTypes: z.array(z.string().min(1)).min(1), regimeIds: z.array(z.string().min(1)).min(1), scopes: z.array(z.enum(["PRODUCAO", "HOMOLOGACAO", "DEMONSTRACAO"])).min(1), allowBeforeClosure: z.boolean() }).strict();
const proofSchema = z.object({ statementId: z.string(), employeeId: z.string(), policyId: z.string(), actorId: z.string(), releaseAt: z.iso.datetime(), allowBeforeClosure: z.boolean(), snapshotHash: z.string() });

export function payrollSnapshotHash(statement: { snapshot: JsonValue; gross: Decimal.Value; deductions: Decimal.Value; net: Decimal.Value; employer: Decimal.Value }) {
  const normalize = (value: unknown): unknown => Array.isArray(value) ? value.map(normalize) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, normalize(child)])) : value;
  return createHash("sha256").update(JSON.stringify({ snapshot: normalize(statement.snapshot), gross: new Decimal(statement.gross).toString(), deductions: new Decimal(statement.deductions).toString(), net: new Decimal(statement.net).toString(), employer: new Decimal(statement.employer).toString() })).digest("hex");
}

export async function personalStatementPublicationAllowed(db: Db, statement: { id: string; snapshot: JsonValue; gross: Decimal.Value; deductions: Decimal.Value; net: Decimal.Value; employer: Decimal.Value; releaseAt: Date | null; revokedAt: Date | null; run: { mode: string; status: string } }, employeeId: string) {
  if (!await arePortalPayrollStatementsEnabled(db) || !statement.releaseAt || statement.releaseAt > new Date() || statement.revokedAt || statement.run.mode !== "OFICIAL") return false;
  if (!["FECHADA", "CALCULADA"].includes(statement.run.status)) return false;
  const proof = await portalEvent(db, sql`"sourceKey"=${`PORTAL:PUBLICACAO_DEMONSTRATIVO:${statement.id}`}`);
  if (!proof) return statement.run.status === "FECHADA";
  const parsed = proofSchema.safeParse(proof?.payload);
  return Boolean(proof.status === "PROCESSADO" && parsed.success && parsed.data.employeeId === employeeId && (statement.run.status === "FECHADA" || parsed.data.allowBeforeClosure) && parsed.data.releaseAt === statement.releaseAt.toISOString() && parsed.data.snapshotHash === payrollSnapshotHash(statement));
}

export async function ownReleasedStatementIds(db: Db, employeeId: string, competence?: string) {
  if (!await arePortalPayrollStatementsEnabled(db)) return [];
  const rows = await portalStatements(db, sql`c."employeeId"=${employeeId} AND s."releaseAt"<=${new Date()} AND s."revokedAt" IS NULL AND r.mode='OFICIAL' AND r.status IN ('FECHADA','CALCULADA') ${competence ? sql`AND p.competence=${competence}` : sql``}`);
  const allowed: string[] = [];
  for (const statement of rows) if (await personalStatementPublicationAllowed(db, statement, employeeId)) allowed.push(statement.id);
  return allowed;
}

export async function publishPayrollByFunctionalPolicy(context: AppContext, raw: unknown, connection: DatabaseConnection = databaseConnection) {
  const input = z.object({ runId: z.string().min(1), policyId: z.string().min(1), releaseAt: z.iso.datetime({ offset: true }) }).strict().parse(raw);
  if (!canPerformModuleOperation(context.user, "RH", "update")) throw new AccessError("Sem autorização para disponibilizar demonstrativos.", 403);
  const run = await portalRequired<{ id: string; payrollId: string }>(context.database ?? db, sql`SELECT id,"payrollId" FROM "HrPayrollRun" WHERE id=${input.runId}`);
  await assertPayrollBudgetScope(context, run.payrollId);
  return withDatabaseTransaction(connection, async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`RH:payroll:${run.payrollId}`}))`);
    const current = await portalRequired<{ mode: string; status: string; ruleSetId: string; scope: string; payrollType: string }>(tx, sql`SELECT r.mode,r.status,r."ruleSetId",r.scope,p.type AS "payrollType" FROM "HrPayrollRun" r JOIN "Payroll" p ON p.id=r."payrollId" WHERE r.id=${run.id}`);
    const rule = await requiredPortalPolicy(tx, input.policyId), policy = portalPayrollPublicationPolicySchema.parse(rule.value), now = new Date();
    assertBudgetUnitAccess(context.user, policy.budgetUnitId);
    if (!rule.isActive || rule.category !== "PORTAL" || rule.ruleSet.status !== "ATIVA" || current.ruleSetId !== rule.ruleSetId || now < rule.ruleSet.effectiveFrom || rule.ruleSet.effectiveUntil && now > rule.ruleSet.effectiveUntil || !policy.payrollTypes.includes(current.payrollType) || !policy.scopes.some(scope => scope === current.scope)) throw new Error("Política incompatível com tipo, escopo ou vigência da folha.");
    if (current.mode !== "OFICIAL" || !["CALCULADA", "FECHADA"].includes(current.status) || current.status !== "FECHADA" && !policy.allowBeforeClosure) throw new Error("A política exige fechamento ou uma autorização explícita de disponibilização antecipada.");
    const statements = (await portalStatements(tx, sql`r.id=${run.id}`)).filter(statement => { const regime = (statement.snapshot as { regime?: { id?: string } }).regime?.id; return regime && policy.regimeIds.includes(regime); });
    if (!statements.length) throw new Error("Nenhum vínculo calculado corresponde aos regimes habilitados.");
    const releaseAt = new Date(input.releaseAt);
    for (const statement of statements) {
      if (statement.revokedAt) throw new Error("Demonstrativo revogado exige uma nova versão de cálculo.");
      const event = await enqueueHrIntegration(tx, { sourceKey: `PORTAL:PUBLICACAO_DEMONSTRATIVO:${statement.id}`, domain: "PORTAL", environment: "INTERNO", eventType: "DEMONSTRATIVO_PUBLICADO_POR_POLITICA", payload: { statementId: statement.id, employeeId: statement.contract.employeeId, policyId: rule.id, actorId: context.user.id, releaseAt: releaseAt.toISOString(), allowBeforeClosure: policy.allowBeforeClosure, snapshotHash: payrollSnapshotHash(statement) } });
      if (event.status === "REVOGADO") throw new Error("Publicação revogada exige uma nova versão.");
      await changePortalEvent(tx, event.id, { status: "PROCESSADO" });
      await tx.execute(sql`UPDATE "HrPayrollStatement" SET "releaseAt"=${releaseAt} WHERE id=${statement.id}`);
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.reportIssued, targetType: "EMPLOYEE_STATEMENT_PUBLICATION", targetId: statement.id });
    }
    return statements.length;
  }, { timeoutMs: 60000 });
}

export async function savePayrollPublicationPolicy(context: AppContext, raw: unknown, connection: DatabaseConnection = databaseConnection) {
  const input = z.object({ id: z.string().min(1).optional(), ruleSetId: z.string().min(1), code: z.string().regex(/^PORTAL_FOLHA_[A-Z0-9_]{1,45}$/), name: z.string().trim().min(3).max(160), isActive: z.boolean(), value: portalPayrollPublicationPolicySchema }).strict().parse(raw);
  if (!canPerformModuleOperation(context.user, "RH", input.id ? "update" : "create")) throw new AccessError("Sem autorização para configurar a disponibilização da folha.", 403);
  assertBudgetUnitAccess(context.user, input.value.budgetUnitId);
  return withDatabaseTransaction(connection, async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`PORTAL:POLITICA_FOLHA:${input.ruleSetId}:${input.code}`}))`);
    const ruleSet = await portalRequired<{ status: string }>(tx, sql`SELECT status FROM "HrPayrollRuleSet" WHERE id=${input.ruleSetId}`);
    if (ruleSet.status !== "ATIVA") throw new Error("Configuração RH ativa obrigatória.");
    const regimeIds = [...new Set(input.value.regimeIds)];
    if (await portalCount(tx, sql`SELECT count(*) FROM "HrEmploymentRegime" WHERE id=ANY(${sql.param(regimeIds)}::text[]) AND "ruleSetId"=${input.ruleSetId}`) !== regimeIds.length) throw new Error("Regimes devem pertencer à configuração RH selecionada.");
    const previous = input.id ? await requiredPortalPolicy(tx, input.id) : null;
    if (previous) {
      const policy = portalPayrollPublicationPolicySchema.parse(previous.value);
      assertBudgetUnitAccess(context.user, policy.budgetUnitId);
      if (previous.category !== "PORTAL" || previous.ruleSetId !== input.ruleSetId || previous.code !== input.code) throw new Error("Preserve configuração e código da política.");
    }
    const data = { name: input.name, isActive: input.isActive, category: "PORTAL", valueType: "JSON", value: input.value };
    const [rule] = previous ? await tx.update(hrPayrollRules).set(data).where(eq(hrPayrollRules.id, previous.id)).returning() : await tx.insert(hrPayrollRules).values({ ...data, ruleSetId: input.ruleSetId, code: input.code }).returning();
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.instanceConfigurationChanged, targetType: "EMPLOYEE_PAYROLL_PUBLICATION_POLICY", targetId: rule.id });
    return rule.id;
  });
}

export async function revokeFunctionalStatement(context: AppContext, raw: unknown, connection: DatabaseConnection = databaseConnection) {
  const input = z.object({ statementId: z.string().min(1), reason: z.string().trim().min(10).max(4000) }).strict().parse(raw);
  if (!canPerformModuleOperation(context.user, "RH", "update")) throw new AccessError("Sem autorização para revogar demonstrativos.", 403);
  const statement = (await portalStatements(context.database ?? db, sql`s.id=${input.statementId}`))[0];
  if (!statement) throw new Error("Registro não encontrado.");
  await assertPayrollBudgetScope(context, statement.run.payrollId);
  return withDatabaseTransaction(connection, async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`RH:payroll:${statement.run.payrollId}`}))`);
    const current = await portalRequired<{ id: string; revokedAt: Date | null }>(tx, sql`SELECT id,"revokedAt" FROM "HrPayrollStatement" WHERE id=${statement.id}`);
    if (current.revokedAt) return;
    await tx.execute(sql`UPDATE "HrPayrollStatement" SET "revokedAt"=${new Date()} WHERE id=${current.id}`);
    await tx.execute(sql`UPDATE "HrIntegrationEvent" SET status='REVOGADO',"updatedAt"=${new Date()} WHERE "sourceKey"=${`PORTAL:PUBLICACAO_DEMONSTRATIVO:${current.id}`}`);
    const event = await enqueueHrIntegration(tx, { sourceKey: `PORTAL:REVOGACAO_DEMONSTRATIVO:${current.id}`, domain: "PORTAL", environment: "INTERNO", eventType: "DEMONSTRATIVO_FUNCIONAL_REVOGADO", payload: { statementId: current.id, actorId: context.user.id, reason: input.reason } });
    await changePortalEvent(tx, event.id, { status: "PROCESSADO" });
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "EMPLOYEE_STATEMENT_REVOCATION", targetId: current.id });
  });
}
