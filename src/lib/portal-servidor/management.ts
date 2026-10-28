import { eq, sql } from "drizzle-orm";
import { databaseConnection } from "@/db/client";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction } from "@/db/transaction";
import { portalCount, portalFirst, portalRequired, requiredPortalPolicy } from "@/db/repositories/portal-servidor/records";
import { hrPayrollRules } from "@/db/schema/personnel-configuration";
import { instanceParameters } from "@/db/schema/instance-configuration";
import { z } from "zod";
import { AccessError, assertBudgetUnitAccess, canPerformModuleOperation, isSystemAdministrator, type AppContext } from "@/lib/platform/tenant-context";
import { documentLayoutPolicySchema } from "./document-policy";
import { attendanceTotalsPolicySchema } from "./attendance-totals";
import { recertificationCampaignSchema } from "@/lib/rh/recertification";
import { functionalClockPolicySchema } from "./clock-service";
import { birthdayPublicationPolicySchema } from "./birthday-service";
import { partnerDiscountPolicySchema } from "@/lib/rh/partner-discounts";
import { auditEventTypes } from "@/lib/platform/audit-evidence";
import { insertAuditEvent as writeAuditEvent } from "@/db/repositories/platform/audit";
import { cleanUnusedFunctionalUploads } from "./upload-maintenance";

export const managedPortalPolicySchemas = {
  MODELO_DOCUMENTO_FUNCIONAL: documentLayoutPolicySchema,
  TOTALIZADORES_PONTO_FUNCIONAL: attendanceTotalsPolicySchema,
  CAMPANHA_RECADASTRAMENTO: recertificationCampaignSchema,
  REGISTRO_PONTO_FUNCIONAL: functionalClockPolicySchema,
  ANIVERSARIANTES_FUNCIONAIS: birthdayPublicationPolicySchema,
  DESCONTOS_CONVENENTES: partnerDiscountPolicySchema,
} as const;

export async function saveManagedPortalPolicy(context: AppContext, raw: unknown, connection: DatabaseConnection = databaseConnection) {
  const input = z.object({ id: z.string().optional(), ruleSetId: z.string().min(1), code: z.string().regex(/^PORTAL_[A-Z0-9_]{1,55}$/), name: z.string().trim().min(3).max(160), budgetUnitId: z.string().min(1), kind: z.enum(Object.keys(managedPortalPolicySchemas) as [keyof typeof managedPortalPolicySchemas, ...(keyof typeof managedPortalPolicySchemas)[]]), isActive: z.boolean(), value: z.unknown() }).strict().parse(raw);
  if (!canPerformModuleOperation(context.user, "RH", input.id ? "update" : "create")) throw new AccessError("Sem autorização para configurar o Portal funcional.", 403);
  assertBudgetUnitAccess(context.user, input.budgetUnitId);
  const policy = managedPortalPolicySchemas[input.kind].parse(input.value);
  if ("budgetUnitId" in policy && policy.budgetUnitId && policy.budgetUnitId !== input.budgetUnitId) throw new Error("UG do modelo diverge da unidade selecionada.");
  return withDatabaseTransaction(connection, async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`PORTAL:GESTAO:${input.ruleSetId}:${input.code}`}))`);
    const set = await portalRequired<{ status: string }>(tx, sql`SELECT status FROM "HrPayrollRuleSet" WHERE id=${input.ruleSetId}`);
    if (set.status !== "ATIVA") throw new Error("Configuração RH ativa obrigatória.");
    const unit = await portalRequired<{ secretariatId: string | null }>(tx, sql`SELECT "secretariatId" FROM "BudgetUnit" WHERE id=${input.budgetUnitId}`);
    const employeeIds = "employeeIds" in policy ? policy.employeeIds : "viewerEmployeeIds" in policy ? [...policy.viewerEmployeeIds, ...policy.publishedEmployeeIds] : [];
    const unique = [...new Set(employeeIds)];
    if (unique.length && await portalCount(tx, sql`SELECT count(*) FROM "Employee" WHERE id=ANY(${sql.param(unique)}::text[]) AND "isActive" AND "secretariatId" IS NOT DISTINCT FROM ${unit.secretariatId}`) !== unique.length) throw new Error("Público funcional fora da unidade ou com cadastro inativo.");
    if ("signerUserIds" in policy) {
      if (policy.signerUserIds.length && await portalCount(tx, sql`SELECT count(*) FROM "Usuario" WHERE id=ANY(${sql.param(policy.signerUserIds)}::text[]) AND ativo`) !== new Set(policy.signerUserIds).size) throw new Error("Signatário indisponível.");
      const documentClass = await portalFirst<{ signaturePolicy: string }>(tx, sql`SELECT "signaturePolicy" FROM "DocumentClass" WHERE code=${policy.documentClassCode} AND "isActive" LIMIT 1`);
      if (!documentClass || policy.requireSignature && documentClass.signaturePolicy !== "INTERNAL_ALLOWED") throw new Error("Modelo exige classe GED ativa e compatível com o fluxo de assinatura configurado.");
    }
    const previous = input.id ? await requiredPortalPolicy(tx, input.id) : null;
    if (previous) {
      if (previous.category !== "PORTAL" || previous.code !== input.code || previous.ruleSetId !== input.ruleSetId || (previous.value as { origin?: string }).origin !== input.kind) throw new Error("Preserve o código, origem e conjunto da política.");
      const scope = (previous.value as { budgetUnitId?: string }).budgetUnitId || previous.unit;
      if (scope) assertBudgetUnitAccess(context.user, scope);
      else if (!isSystemAdministrator(context.user)) throw new AccessError("Política legada sem escopo exige saneamento pelo administrador.", 403);
    }
    const value = input.kind === "CAMPANHA_RECADASTRAMENTO" ? { ...policy, budgetUnitId: input.budgetUnitId } : policy;
    const data = { name: input.name, category: "PORTAL", valueType: "JSON", value, isActive: input.isActive, unit: input.budgetUnitId };
    const [rule] = previous ? await tx.update(hrPayrollRules).set(data).where(eq(hrPayrollRules.id, previous.id)).returning() : await tx.insert(hrPayrollRules).values({ ...data, ruleSetId: input.ruleSetId, code: input.code }).returning();
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.instanceConfigurationChanged, targetType: "FUNCTIONAL_PORTAL_POLICY", targetId: rule.id });
    return rule.id;
  });
}

export async function saveUploadRetention(context: AppContext, hours: unknown, connection: DatabaseConnection = databaseConnection) {
  const value = z.coerce.number().int().min(1).max(8760).parse(hours);
  if (!isSystemAdministrator(context.user)) throw new AccessError("Retenção global exige administração da instância.", 403);
  const key = "PORTAL_UNUSED_UPLOAD_RETENTION_HOURS";
  await withDatabaseTransaction(connection, async tx => {
    const instance = await portalRequired<{ id: string }>(tx, sql`SELECT id FROM "ConfiguracaoInstancia" ORDER BY "createdAt" ASC LIMIT 1`);
    await tx.insert(instanceParameters).values({ configuracaoInstanciaId: instance.id, chave: key, valor: value }).onConflictDoUpdate({ target: [instanceParameters.configuracaoInstanciaId, instanceParameters.chave], set: { valor: value } });
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.instanceConfigurationChanged, targetType: "FUNCTIONAL_UPLOAD_RETENTION", targetId: instance.id });
  });
  return cleanUnusedFunctionalUploads(connection, context.user.id);
}
