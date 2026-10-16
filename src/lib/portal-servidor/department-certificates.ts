import { AccessError, canPerformModuleOperation, isSystemAdministrator, type AppContext } from "@/lib/platform/tenant-context";
import { assertSstClinicalAccess } from "@/lib/sst/access";
import { registerCertificate } from "@/lib/sst/certificate-service";
import { certificateInput } from "@/lib/sst/certificate-policy";

export async function registerDepartmentCertificate(context: AppContext, raw: unknown) {
  if (!canPerformModuleOperation(context.user, "SST", "create")) throw new AccessError("Sem autorização para receber atestados.", 403);
  const input = certificateInput.parse(raw);
  const employee = await context.prisma.employee.findFirst({ where: { id: input.employeeId, isActive: true }, select: { departmentId: true } });
  if (!employee || !isSystemAdministrator(context.user) && (!context.user.departmentId || employee.departmentId !== context.user.departmentId)) throw new AccessError("Servidor fora do departamento autorizado.", 403);
  if (!isSystemAdministrator(context.user)) {
    const [period] = await context.prisma.$queryRaw<{ id: string }[]>`SELECT p.id FROM "HrEmployeeFunctionalPeriod" p WHERE p."employeeId"=${input.employeeId} AND p."budgetUnitId"=${input.budgetUnitId} AND p."departmentId"=${context.user.departmentId} AND p."startsAt"<=${input.startsAt} AND p."endsAt">=${input.endsAt} AND NOT p.voided AND NOT EXISTS(SELECT 1 FROM "HrEmployeeFunctionalPeriod" n WHERE n."supersedesId"=p.id)`;
    if (!period) throw new AccessError("O período do atestado não pertence ao departamento autorizado na história funcional.", 403);
  }
  await assertSstClinicalAccess(context, input.budgetUnitId);
  return registerCertificate(context, input);
}

export async function readDepartmentCertificateReceipt(context: AppContext, id: string) {
  if (!canPerformModuleOperation(context.user, "SST", "create")) throw new AccessError("Sem autorização para consultar o comprovante.", 403);
  const certificate = await context.prisma.sstMedicalCertificate.findUnique({ where: { id }, select: { id: true, employeeId: true, budgetUnitId: true, createdById: true, departmentIdSnapshot: true, protocolNumber: true, startsAt: true, endsAt: true, presentedAt: true, status: true, employee: { select: { name: true, registration: true, departmentId: true } } } });
  if (!certificate || !isSystemAdministrator(context.user) && (!context.user.departmentId || certificate.createdById !== context.user.id || certificate.departmentIdSnapshot !== context.user.departmentId || certificate.employee.departmentId !== context.user.departmentId)) throw new AccessError("Comprovante indisponível para o departamento.", 404);
  await assertSstClinicalAccess(context, certificate.budgetUnitId);
  return certificate;
}
