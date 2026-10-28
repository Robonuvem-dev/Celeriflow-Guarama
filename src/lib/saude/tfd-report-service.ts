import { z } from "zod";
import { and, asc, count, eq, getTableColumns, gte, ilike, inArray, lte } from "drizzle-orm";
import { db } from "@/db/client";
import type { DatabaseExecutor } from "@/db/transaction";
import * as t from "@/db/schema/health-tfd";
import { patients } from "@/db/schema/health-registration";
import { people } from "@/db/schema/people";
import { healthProfessionals, healthUnits } from "@/db/schema/health-workforce";
import { employees } from "@/db/schema/administration";
import { healthSusProcedures } from "@/db/schema/health-catalogs";
import { assertHealthUnitAccess } from "@/lib/platform/tenant-context";
import type { HealthTfdContext as AppContext } from "@/lib/contracts/health-tfd";

export const tfdReportFilters = z.object({
  unitId: z.string().max(200).default(""), destination: z.string().trim().max(200).default(""),
  professionalId: z.string().max(200).default(""), procedureId: z.string().max(200).default(""),
  from: z.union([z.iso.date(), z.literal("")]).default(""), to: z.union([z.iso.date(), z.literal("")]).default(""),
}).strict().refine(input => !input.from || !input.to || input.from <= input.to, "Período inválido.");

export async function tfdProcessReport(context: AppContext, raw: unknown, executor: DatabaseExecutor = db) {
  const input = tfdReportFilters.parse(raw);
  if (input.unitId) assertHealthUnitAccess(context.user, input.unitId);
  const where = and(
    input.unitId ? eq(t.healthTfdRequests.originUnitId, input.unitId) : context.user.hasHealthAccessScope ? inArray(t.healthTfdRequests.originUnitId, context.user.allowedHealthUnitIds || []) : undefined,
    input.destination ? ilike(t.healthTfdRequests.destination, `%${input.destination}%`) : undefined,
    input.professionalId ? eq(t.healthTfdClinicalReports.professionalId, input.professionalId) : undefined,
    input.procedureId ? eq(t.healthTfdClinicalReports.procedureId, input.procedureId) : undefined,
    input.from ? gte(t.healthTfdRequests.createdAt, new Date(`${input.from}T00:00:00-03:00`)) : undefined,
    input.to ? lte(t.healthTfdRequests.createdAt, new Date(`${input.to}T23:59:59.999-03:00`)) : undefined,
  );
  const [total] = await executor.select({ value: count() }).from(t.healthTfdRequests).leftJoin(t.healthTfdClinicalReports, eq(t.healthTfdClinicalReports.requestId, t.healthTfdRequests.id)).where(where);
  if (total.value > 10000) throw new Error("O recorte ultrapassa 10.000 processos. Restrinja o período ou os filtros para emitir o relatório completo.");
  const rows = await executor.select({ request: getTableColumns(t.healthTfdRequests), fullName: people.fullName, originUnit: { id: healthUnits.id, name: healthUnits.name }, clinicalReport: getTableColumns(t.healthTfdClinicalReports), professional: { id: employees.id, name: employees.name }, procedure: { id: healthSusProcedures.id, code: healthSusProcedures.code, description: healthSusProcedures.description } })
    .from(t.healthTfdRequests).innerJoin(patients, eq(patients.id, t.healthTfdRequests.patientId)).innerJoin(people, eq(people.id, patients.personId)).leftJoin(healthUnits, eq(healthUnits.id, t.healthTfdRequests.originUnitId))
    .leftJoin(t.healthTfdClinicalReports, eq(t.healthTfdClinicalReports.requestId, t.healthTfdRequests.id)).leftJoin(healthProfessionals, eq(healthProfessionals.id, t.healthTfdClinicalReports.professionalId)).leftJoin(employees, eq(employees.id, healthProfessionals.employeeId)).leftJoin(healthSusProcedures, eq(healthSusProcedures.id, t.healthTfdClinicalReports.procedureId)).where(where).orderBy(asc(t.healthTfdRequests.createdAt)).limit(10001);
  const benefits = rows.length ? await executor.select({ requestId: t.healthTfdBenefits.requestId, status: t.healthTfdBenefits.status }).from(t.healthTfdBenefits).where(inArray(t.healthTfdBenefits.requestId, rows.map(row => row.request.id))) : [];
  const records = rows.map(row => ({ ...row.request, patient: { person: { fullName: row.fullName } }, originUnit: row.originUnit, clinicalReport: row.clinicalReport ? { ...row.clinicalReport, professional: { employee: { name: row.professional?.name } }, procedure: row.procedure } : null, benefits: benefits.filter(benefit => benefit.requestId === row.request.id) }));
  if (records.length > 10000) throw new Error("O recorte cresceu durante a emissão. Restrinja os filtros e tente novamente.");
  return records.map(record => ({
    Processo: record.id, Data: record.createdAt.toLocaleDateString("pt-BR"), Paciente: record.patient.person.fullName,
    "Unidade solicitante": record.originUnit?.name || "Não informada", Destino: record.destination,
    Profissional: record.clinicalReport?.professional.employee.name || "Não informado",
    Procedimento: record.clinicalReport?.procedure ? `${record.clinicalReport.procedure.code} · ${record.clinicalReport.procedure.description}` : "Não informado",
    Diagnóstico: record.clinicalReport?.diagnosis || "Laudo não incluído", Versão: record.clinicalReport?.version || 0,
    Situação: record.status, Autorização: record.authorizedAt?.toLocaleString("pt-BR") || "Não autorizada",
    "Benefícios autorizados": record.benefits.filter(benefit => benefit.status === "AUTORIZADO").length,
    "Benefícios entregues": record.benefits.filter(benefit => benefit.status === "ENTREGUE").length,
  }));
}
