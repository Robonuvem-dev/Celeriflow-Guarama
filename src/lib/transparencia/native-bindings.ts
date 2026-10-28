import "server-only";
import { and, asc, desc, eq, ilike, inArray, isNull, lte, or, sql } from "drizzle-orm";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseExecutor } from "@/db/transaction";
import { governmentEntities } from "@/db/schema/master-data";
import { employees } from "@/db/schema/administration";
import { hrEmploymentContracts, hrPayrollStatements, hrPayrollRuns, payrolls, hrPortalRequests } from "@/db/schema/personnel-workforce";
import { hrPayrollRules, hrPayrollRuleSets } from "@/db/schema/personnel-configuration";
import { purchaseReceipts } from "@/db/schema/procurement-requests";
import { assets } from "@/db/schema/assets";
import { warehouses } from "@/db/schema/assets-stock";
import { infrastructureWorks } from "@/db/schema/infrastructure";
import { publicFleetUnits, publicCovenants, publicBenefitRules, publicBenefitGrants } from "@/db/schema/transparency-sources";
import { healthRegulationSectors } from "@/db/schema/health-regulation";
import { preEnrollmentProcesses } from "@/db/schema/education-admissions";
import { officialDiaries } from "@/db/schema/portal-content";
import { transparencyNativeBindings } from "@/db/schema/transparency";
import { financialAuditLogs } from "@/db/schema/finance-identity";
import { nativeBindingSchema, type NativeSourceType } from "./native-binding-policy";

export async function nativeSourceOptions(db: DatabaseExecutor, type: NativeSourceType, search = "") {
  const pattern = `%${search.slice(0, 150).replace(/[\\%_]/g, "\\$&")}%`;
  if (type === "EMPLOYMENT_CONTRACT") return (await db.select({ id: hrEmploymentContracts.id, registration: hrEmploymentContracts.registration, name: employees.name }).from(hrEmploymentContracts).innerJoin(employees, eq(employees.id, hrEmploymentContracts.employeeId)).where(search ? or(ilike(hrEmploymentContracts.registration, pattern), ilike(employees.name, pattern)) : undefined).orderBy(asc(hrEmploymentContracts.registration)).limit(100)).map(row => ({ id: row.id, label: `${row.registration} · ${row.name}` }));
  if (type === "PAYROLL_STATEMENT") return (await db.select({ id: hrPayrollStatements.id, registration: hrEmploymentContracts.registration, name: employees.name, competence: payrolls.competence, type: payrolls.type }).from(hrPayrollStatements).innerJoin(hrEmploymentContracts, eq(hrEmploymentContracts.id, hrPayrollStatements.contractId)).innerJoin(employees, eq(employees.id, hrEmploymentContracts.employeeId)).innerJoin(hrPayrollRuns, eq(hrPayrollRuns.id, hrPayrollStatements.runId)).innerJoin(payrolls, eq(payrolls.id, hrPayrollRuns.payrollId)).where(and(isNull(hrPayrollStatements.revokedAt), lte(hrPayrollStatements.releaseAt, new Date()), eq(hrPayrollRuns.mode, "OFICIAL"), eq(hrPayrollRuns.scope, "PRODUCAO"), eq(hrPayrollRuns.status, "FECHADA"), search ? ilike(employees.name, pattern) : undefined)).limit(100)).map(row => ({ id: row.id, label: `${row.registration} · ${row.name} · ${row.competence} · ${row.type}` }));
  if (type === "POSITION_PLAN") return (await db.select({ id: hrPayrollRules.id, name: hrPayrollRules.name }).from(hrPayrollRules).innerJoin(hrPayrollRuleSets, eq(hrPayrollRuleSets.id, hrPayrollRules.ruleSetId)).where(and(eq(hrPayrollRules.code, "QUADRO_CARGOS"), eq(hrPayrollRules.isActive, true), eq(hrPayrollRuleSets.scope, "PRODUCAO"), eq(hrPayrollRuleSets.isDemo, false), search ? ilike(hrPayrollRules.name, pattern) : undefined)).limit(100)).map(row => ({ id: row.id, label: row.name }));
  if (type === "TRAVEL_REQUEST" || type === "ADVANCE_REQUEST") {
    const employeeRows = await db.select({ id: employees.id, name: employees.name }).from(employees).where(search ? ilike(employees.name, pattern) : undefined);
    return (await db.select({ id: hrPortalRequests.id, employeeId: hrPortalRequests.employeeId, decidedAt: hrPortalRequests.decidedAt }).from(hrPortalRequests).where(and(eq(hrPortalRequests.kind, type === "TRAVEL_REQUEST" ? "DIARIA" : "ADIANTAMENTO"), eq(hrPortalRequests.status, "DEFERIDA"), search ? inArray(hrPortalRequests.employeeId, employeeRows.map(row => row.id)) : undefined)).limit(100)).map(row => ({ id: row.id, label: `${employeeRows.find(employee => employee.id === row.employeeId)?.name || "Beneficiário não identificado"} · ${row.decidedAt?.toISOString().slice(0, 10) || ""}` }));
  }
  if (type === "PURCHASE_RECEIPT") return (await db.select({ id: purchaseReceipts.id, number: purchaseReceipts.number }).from(purchaseReceipts).where(and(eq(purchaseReceipts.status, "APPROVED"), search ? ilike(purchaseReceipts.number, pattern) : undefined)).orderBy(desc(purchaseReceipts.receivedAt)).limit(100)).map(row => ({ id: row.id, label: row.number }));
  if (type === "ASSET") return (await db.select({ id: assets.id, name: assets.name, patrimonyNumber: assets.patrimonyNumber }).from(assets).where(search ? ilike(assets.name, pattern) : undefined).limit(100)).map(row => ({ id: row.id, label: `${row.patrimonyNumber} · ${row.name}` }));
  if (type === "FLEET_UNIT") return (await db.select({ id: publicFleetUnits.id, name: publicFleetUnits.name, code: publicFleetUnits.code }).from(publicFleetUnits).where(search ? ilike(publicFleetUnits.name, pattern) : undefined).limit(100)).map(row => ({ id: row.id, label: `${row.code} · ${row.name}` }));
  if (type === "WAREHOUSE") return (await db.select({ id: warehouses.id, name: warehouses.name }).from(warehouses).where(search ? ilike(warehouses.name, pattern) : undefined).limit(100)).map(row => ({ id: row.id, label: row.name }));
  if (type === "WORK") return (await db.select({ id: infrastructureWorks.id, nome: infrastructureWorks.nome, numero: infrastructureWorks.numero }).from(infrastructureWorks).where(search ? ilike(infrastructureWorks.nome, pattern) : undefined).limit(100)).map(row => ({ id: row.id, label: `${row.numero} · ${row.nome}` }));
  if (type === "COVENANT") return (await db.select({ id: publicCovenants.id, number: publicCovenants.number, description: publicCovenants.description }).from(publicCovenants).where(search ? ilike(publicCovenants.description, pattern) : undefined).limit(100)).map(row => ({ id: row.id, label: `${row.number} · ${row.description}` }));
  if (type === "TAX_BENEFIT_RULE") return (await db.select({ id: publicBenefitRules.id, code: publicBenefitRules.code, name: publicBenefitRules.name }).from(publicBenefitRules).where(search ? ilike(publicBenefitRules.name, pattern) : undefined).limit(100)).map(row => ({ id: row.id, label: `${row.code} · ${row.name}` }));
  if (type === "TAX_BENEFIT_GRANT") return (await db.select({ id: publicBenefitGrants.id, grantedAt: publicBenefitGrants.grantedAt, rule: { code: publicBenefitRules.code, name: publicBenefitRules.name } }).from(publicBenefitGrants).innerJoin(publicBenefitRules, eq(publicBenefitRules.id, publicBenefitGrants.ruleId)).where(eq(publicBenefitGrants.status, "CONCEDIDO")).limit(100)).map(row => ({ id: row.id, label: `${row.rule.code} · ${row.rule.name} · ${row.grantedAt.toISOString().slice(0, 10)}` }));
  if (type === "HEALTH_REGULATION_SECTOR") return (await db.select({ id: healthRegulationSectors.id, name: healthRegulationSectors.name }).from(healthRegulationSectors).where(search ? ilike(healthRegulationSectors.name, pattern) : undefined).limit(100)).map(row => ({ id: row.id, label: row.name }));
  if (type === "PRE_ENROLLMENT_PROCESS") return (await db.select({ id: preEnrollmentProcesses.id, name: preEnrollmentProcesses.name, year: preEnrollmentProcesses.year }).from(preEnrollmentProcesses).where(search ? ilike(preEnrollmentProcesses.name, pattern) : undefined).limit(100)).map(row => ({ id: row.id, label: `${row.name} · ${row.year}` }));
  return (await db.select({ id: officialDiaries.id, editionNumber: officialDiaries.editionNumber, publishDate: officialDiaries.publishDate }).from(officialDiaries).orderBy(desc(officialDiaries.publishDate)).limit(100)).map(row => ({ id: row.id, label: `Edição ${row.editionNumber} · ${row.publishDate.toISOString().slice(0, 10)}` }));
}

async function nativeSourceExists(db: DatabaseExecutor, type: NativeSourceType, id: string) {
  // Fixed source dispatch; never accept table names or query fragments from browsers.
  if (type === "EMPLOYMENT_CONTRACT") return (await db.select({ id: hrEmploymentContracts.id }).from(hrEmploymentContracts).where(eq(hrEmploymentContracts.id, id)).limit(1)).length > 0;
  if (type === "PAYROLL_STATEMENT") return (await db.select({ id: hrPayrollStatements.id }).from(hrPayrollStatements).where(eq(hrPayrollStatements.id, id)).limit(1)).length > 0;
  if (type === "POSITION_PLAN") return (await db.select({ id: hrPayrollRules.id }).from(hrPayrollRules).where(and(eq(hrPayrollRules.id, id), eq(hrPayrollRules.code, "QUADRO_CARGOS"))).limit(1)).length > 0;
  if (type === "TRAVEL_REQUEST" || type === "ADVANCE_REQUEST") return (await db.select({ id: hrPortalRequests.id }).from(hrPortalRequests).where(and(eq(hrPortalRequests.id, id), eq(hrPortalRequests.kind, type === "TRAVEL_REQUEST" ? "DIARIA" : "ADIANTAMENTO"))).limit(1)).length > 0;
  if (type === "PURCHASE_RECEIPT") return (await db.select({ id: purchaseReceipts.id }).from(purchaseReceipts).where(eq(purchaseReceipts.id, id)).limit(1)).length > 0;
  if (type === "ASSET") return (await db.select({ id: assets.id }).from(assets).where(eq(assets.id, id)).limit(1)).length > 0;
  if (type === "FLEET_UNIT") return (await db.select({ id: publicFleetUnits.id }).from(publicFleetUnits).where(eq(publicFleetUnits.id, id)).limit(1)).length > 0;
  if (type === "WAREHOUSE") return (await db.select({ id: warehouses.id }).from(warehouses).where(eq(warehouses.id, id)).limit(1)).length > 0;
  if (type === "WORK") return (await db.select({ id: infrastructureWorks.id }).from(infrastructureWorks).where(eq(infrastructureWorks.id, id)).limit(1)).length > 0;
  if (type === "COVENANT") return (await db.select({ id: publicCovenants.id }).from(publicCovenants).where(eq(publicCovenants.id, id)).limit(1)).length > 0;
  if (type === "TAX_BENEFIT_RULE") return (await db.select({ id: publicBenefitRules.id }).from(publicBenefitRules).where(eq(publicBenefitRules.id, id)).limit(1)).length > 0;
  if (type === "TAX_BENEFIT_GRANT") return (await db.select({ id: publicBenefitGrants.id }).from(publicBenefitGrants).where(eq(publicBenefitGrants.id, id)).limit(1)).length > 0;
  if (type === "HEALTH_REGULATION_SECTOR") return (await db.select({ id: healthRegulationSectors.id }).from(healthRegulationSectors).where(eq(healthRegulationSectors.id, id)).limit(1)).length > 0;
  if (type === "PRE_ENROLLMENT_PROCESS") return (await db.select({ id: preEnrollmentProcesses.id }).from(preEnrollmentProcesses).where(eq(preEnrollmentProcesses.id, id)).limit(1)).length > 0;
  return (await db.select({ id: officialDiaries.id }).from(officialDiaries).where(eq(officialDiaries.id, id)).limit(1)).length > 0;
}

export async function saveNativeBinding(connection: DatabaseConnection, actorId: string, raw: unknown) {
  const input = nativeBindingSchema.parse(raw);
  return withDatabaseTransaction(connection, async tx => {
    if (!(await tx.select({ id: governmentEntities.id }).from(governmentEntities).where(eq(governmentEntities.id, input.governmentEntityId)).limit(1)).length) throw new Error("Entidade não encontrada.");
    if (!await nativeSourceExists(tx, input.sourceType, input.sourceId)) throw new Error("Registro da fonte não encontrado.");
    if (input.enabled && input.collectionSlug === "renuncia") {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`TRANSPARENCY_RENUNCIATION:${input.governmentEntityId}`}))`);
      if ((await tx.select({ id: transparencyNativeBindings.id }).from(transparencyNativeBindings).where(and(eq(transparencyNativeBindings.governmentEntityId, input.governmentEntityId), eq(transparencyNativeBindings.collectionSlug, "renuncia"), eq(transparencyNativeBindings.enabled, true), eq(transparencyNativeBindings.sourceType, input.sourceType === "TAX_BENEFIT_RULE" ? "TAX_BENEFIT_GRANT" : "TAX_BENEFIT_RULE"))).limit(1)).length) throw new Error("Escolha publicação agregada por regra ou individual por concessão; não misture os dois grãos nos totais.");
    }
    const [entry] = await tx.insert(transparencyNativeBindings).values({ ...input, createdById: actorId }).onConflictDoUpdate({ target: [transparencyNativeBindings.collectionSlug, transparencyNativeBindings.sourceType, transparencyNativeBindings.sourceId], set: input }).returning();
    await tx.insert(financialAuditLogs).values({ action: "CONFIGURE_NATIVE_TRANSPARENCY_BINDING", entityType: "TransparencyNativeBinding", entityId: entry.id, authorUsuarioId: actorId, payload: { sourceType: input.sourceType, sourceId: input.sourceId, governmentEntityId: input.governmentEntityId, enabled: input.enabled } });
    return entry;
  }, { timeoutMs: 5_000 });
}
