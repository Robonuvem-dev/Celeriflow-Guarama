import { randomUUID } from "node:crypto";
import { getTenantContextForModuleOperation, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { assertSstClinicalAccess, sstUnitWhere } from "@/lib/sst/access";
import { PortalBreadcrumb } from "@/components/portal-institucional/PortalShell";
import { DepartmentCertificateForm } from "./CertificateForm";

export const dynamic = "force-dynamic";
export default async function DepartmentCertificates({ searchParams }: { searchParams: Promise<{ unitId?: string }> }) {
  const context = await getTenantContextForModuleOperation("SST", "create"), params = await searchParams;
  const units = await context.prisma.budgetUnit.findMany({ where: sstUnitWhere(context), select: { id: true, name: true, secretariatId: true }, orderBy: { name: "asc" } });
  const unit = units.find(row => row.id === params.unitId);
  if (unit) await assertSstClinicalAccess(context, unit.id);
  const employees = unit ? await context.prisma.employee.findMany({ where: { isActive: true, secretariatId: unit.secretariatId, ...(!isSystemAdministrator(context.user) ? { departmentId: context.user.departmentId || "__SEM_DEPARTAMENTO__" } : {}) }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [];
  const reasons = unit ? await context.prisma.sstCertificateReason.findMany({ where: { budgetUnitId: unit.id, isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [];
  const receipts = unit ? await context.prisma.sstMedicalCertificate.findMany({ where: { budgetUnitId: unit.id, createdById: context.user.id, ...(!isSystemAdministrator(context.user) ? { departmentIdSnapshot: context.user.departmentId || "__SEM_DEPARTAMENTO__", employee: { departmentId: context.user.departmentId || "__SEM_DEPARTAMENTO__" } } : {}) }, select: { id: true, protocolNumber: true, status: true }, orderBy: { createdAt: "desc" }, take: 20 }) : [];
  return <main className="mx-auto max-w-5xl space-y-4 px-4 py-8"><PortalBreadcrumb current="Atestados do departamento" /><h1 className="text-2xl font-bold">Recebimento de atestados pelo departamento</h1><p className="text-sm">Requer permissão de inclusão SST, unidade autorizada e autorização clínica ocupacional. O recebimento não decide perícia nem gera afastamento automaticamente.</p><form className="flex gap-2 text-sm"><select name="unitId" required defaultValue={unit?.id || ""} className="rounded border p-2"><option value="">Selecione unidade</option>{units.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select><button className="rounded border px-3">Carregar departamento</button></form>{unit && <DepartmentCertificateForm submissionKey={randomUUID()} unitId={unit.id} employees={employees} reasons={reasons} />}<section className="rounded border bg-white p-4"><h2 className="font-semibold">Últimos recebimentos registrados por mim</h2>{receipts.map(receipt => <p key={receipt.id} className="mt-3 text-sm">{receipt.protocolNumber} · {receipt.status}<a href={`/api/portal/departamentos/atestados/${receipt.id}`} className="ml-3 font-semibold text-emerald-800 underline">Comprovante</a></p>)}</section></main>;
}
