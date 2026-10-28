import { AccessError, canPerformModuleOperation, isSystemAdministrator, type AppContext } from "@/lib/platform/tenant-context";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { activePortalEmployee, portalFirst } from "@/db/repositories/portal-servidor/records";
import { assertSstClinicalAccess } from "@/lib/sst/access";
import { registerCertificate } from "@/lib/sst/certificate-service";
import { certificateInput } from "@/lib/sst/certificate-policy";

export async function registerDepartmentCertificate(context: AppContext, raw: unknown) {
  if (!canPerformModuleOperation(context.user, "SST", "create")) throw new AccessError("Sem autorização para receber atestados.", 403);
  const input = certificateInput.parse(raw);
  const executor = context.database ?? db;
  const employee = await activePortalEmployee(executor, input.employeeId);
  if (!employee || !isSystemAdministrator(context.user) && (!context.user.departmentId || employee.departmentId !== context.user.departmentId)) throw new AccessError("Servidor fora do departamento autorizado.", 403);
  if (!isSystemAdministrator(context.user)) {
    const period = await portalFirst<{ id: string }>(executor, sql`SELECT p.id FROM "HrEmployeeFunctionalPeriod" p WHERE p."employeeId"=${input.employeeId} AND p."budgetUnitId"=${input.budgetUnitId} AND p."departmentId"=${context.user.departmentId} AND p."startsAt"<=${input.startsAt} AND p."endsAt">=${input.endsAt} AND NOT p.voided AND NOT EXISTS(SELECT 1 FROM "HrEmployeeFunctionalPeriod" n WHERE n."supersedesId"=p.id)`);
    if (!period) throw new AccessError("O período do atestado não pertence ao departamento autorizado na história funcional.", 403);
  }
  await assertSstClinicalAccess(context, input.budgetUnitId);
  return registerCertificate(context, input);
}

export async function readDepartmentCertificateReceipt(context: AppContext, id: string) {
  if (!canPerformModuleOperation(context.user, "SST", "create")) throw new AccessError("Sem autorização para consultar o comprovante.", 403);
  const row = await portalFirst<{ id: string; employeeId: string; budgetUnitId: string; createdById: string; departmentIdSnapshot: string | null; protocolNumber: string; startsAt: Date; endsAt: Date; presentedAt: Date; status: string; name: string; registration: string | null; departmentId: string | null }>(context.database ?? db, sql`SELECT c.id,c."employeeId",c."budgetUnitId",c."createdById",c."departmentIdSnapshot",c."protocolNumber",c."startsAt",c."endsAt",c."presentedAt",c.status,e.name,e.registration,e."departmentId" FROM "SstMedicalCertificate" c JOIN "Employee" e ON e.id=c."employeeId" WHERE c.id=${id}`);
  const certificate = row ? { id: row.id, employeeId: row.employeeId, budgetUnitId: row.budgetUnitId, createdById: row.createdById, departmentIdSnapshot: row.departmentIdSnapshot, protocolNumber: row.protocolNumber, startsAt: row.startsAt, endsAt: row.endsAt, presentedAt: row.presentedAt, status: row.status, employee: { name: row.name, registration: row.registration, departmentId: row.departmentId } } : null;
  if (!certificate || !isSystemAdministrator(context.user) && (!context.user.departmentId || certificate.createdById !== context.user.id || certificate.departmentIdSnapshot !== context.user.departmentId || certificate.employee.departmentId !== context.user.departmentId)) throw new AccessError("Comprovante indisponível para o departamento.", 404);
  await assertSstClinicalAccess(context, certificate.budgetUnitId);
  return certificate;
}
