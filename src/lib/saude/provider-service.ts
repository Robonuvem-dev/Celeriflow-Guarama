import { z } from "zod";
import type { AppContext } from "@/lib/platform/tenant-context";
import { AccessError } from "@/lib/platform/tenant-context";
import { transitionRegulationRequest } from "./regulation-service";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { healthProviderAccesses, healthRegulationRequests, healthRegulationQuotas } from "@/db/schema/health-regulation";
import { suppliers, companies } from "@/db/schema/registry";
import { patients } from "@/db/schema/health-registration";
import { people } from "@/db/schema/people";
import { healthSpecialties, healthServices } from "@/db/schema/health-administration";
import { healthSusProcedures } from "@/db/schema/health-catalogs";
import { healthUnits } from "@/db/schema/health-workforce";

export class ProviderError extends Error {}

export async function resolveProviderSupplier(context: AppContext) {
  const [access] = await (context.database ?? db).select({ id: suppliers.id, status: suppliers.status, person: { fullName: people.fullName }, company: { corporateName: companies.corporateName } }).from(healthProviderAccesses).innerJoin(suppliers, eq(suppliers.id, healthProviderAccesses.supplierId)).leftJoin(people, eq(people.id, suppliers.personId)).leftJoin(companies, eq(companies.id, suppliers.companyId)).where(and(eq(healthProviderAccesses.usuarioId, context.user.id), eq(healthProviderAccesses.isActive, true))).limit(1);
  if (!access || access.status !== "Ativo") throw new AccessError("Nenhum prestador ativo vinculado a este acesso.", 403);
  return access;
}

// Guias do prestador: solicitações autorizadas/agendadas vinculadas às
// cotas do próprio fornecedor. Prestador A nunca enxerga o Prestador B.
export async function providerGuides(context: AppContext, supplierId: string) {
  const rows = await (context.database ?? db).select({ request: healthRegulationRequests, patient: patients, person: { fullName: people.fullName }, specialty: healthSpecialties, service: healthServices, procedure: { code: healthSusProcedures.code, description: healthSusProcedures.description }, requestUnit: healthUnits }).from(healthRegulationRequests).innerJoin(healthRegulationQuotas, eq(healthRegulationQuotas.id, healthRegulationRequests.quotaId)).innerJoin(patients, eq(patients.id, healthRegulationRequests.patientId)).innerJoin(people, eq(people.id, patients.personId)).leftJoin(healthSpecialties, eq(healthSpecialties.id, healthRegulationRequests.specialtyId)).leftJoin(healthServices, eq(healthServices.id, healthRegulationRequests.serviceId)).leftJoin(healthSusProcedures, eq(healthSusProcedures.id, healthRegulationRequests.procedureId)).leftJoin(healthUnits, eq(healthUnits.id, healthRegulationRequests.requestUnitId)).where(and(eq(healthRegulationQuotas.providerSupplierId, supplierId), inArray(healthRegulationRequests.status, ["AUTORIZADA", "AGENDADA", "EXECUTADA", "CONCLUIDA"]))).orderBy(desc(healthRegulationRequests.createdAt)).limit(200);
  return rows.map(row => ({ ...row.request, patient: { ...row.patient, person: row.person }, specialty: row.specialty, service: row.service, procedure: row.procedure, requestUnit: row.requestUnit }));
}

const executeSchema = z.object({ requestId: z.string().min(1), notes: z.string().trim().max(2000).nullable().optional() }).strict();

export async function providerExecuteGuide(context: AppContext, supplierId: string, raw: unknown) {
  const input = executeSchema.parse(raw);
  const [request] = await (context.database ?? db).select({ id: healthRegulationRequests.id, status: healthRegulationRequests.status, quota: { providerSupplierId: healthRegulationQuotas.providerSupplierId } }).from(healthRegulationRequests).leftJoin(healthRegulationQuotas, eq(healthRegulationQuotas.id, healthRegulationRequests.quotaId)).where(eq(healthRegulationRequests.id, input.requestId)).limit(1);
  if (!request || request.quota?.providerSupplierId !== supplierId) throw new AccessError("Guia não encontrada para este prestador.", 404);
  if (!["AUTORIZADA", "AGENDADA"].includes(request.status)) throw new ProviderError("Somente guias autorizadas ou agendadas podem ser executadas.");
  return transitionRegulationRequest(context, request.id, "EXECUTADA", { notes: input.notes || null });
}

export async function providerHistory(context: AppContext, supplierId: string) {
  const rows = await (context.database ?? db).select({ id: healthRegulationRequests.id, status: healthRegulationRequests.status, guideNumber: healthRegulationRequests.guideNumber, executedAt: healthRegulationRequests.executedAt, returnedAt: healthRegulationRequests.returnedAt, updatedAt: healthRegulationRequests.updatedAt, person: { fullName: people.fullName } }).from(healthRegulationRequests).innerJoin(healthRegulationQuotas, eq(healthRegulationQuotas.id, healthRegulationRequests.quotaId)).innerJoin(patients, eq(patients.id, healthRegulationRequests.patientId)).innerJoin(people, eq(people.id, patients.personId)).where(and(eq(healthRegulationQuotas.providerSupplierId, supplierId), inArray(healthRegulationRequests.status, ["EXECUTADA", "CONCLUIDA", "CANCELADA"]))).orderBy(desc(healthRegulationRequests.updatedAt)).limit(200);
  return rows.map(({ person, ...row }) => ({ ...row, patient: { person } }));
}
