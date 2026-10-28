import { randomUUID } from "node:crypto";
import { getTenantContextForModuleOperation, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { assertSstClinicalAccess } from "@/lib/sst/access";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { portalRows } from "@/db/repositories/portal-servidor/records";
import { PortalBreadcrumb } from "@/components/portal-institucional/PortalShell";
import { DepartmentCertificateForm } from "./CertificateForm";

export const dynamic = "force-dynamic";
export default async function DepartmentCertificates({ searchParams }: { searchParams: Promise<{ unitId?: string }> }) {
  const context = await getTenantContextForModuleOperation("SST", "create"), params = await searchParams;
  const executor = context.database ?? db, administrator = isSystemAdministrator(context.user), departmentId = context.user.departmentId || "__SEM_DEPARTAMENTO__";
  const units = await portalRows<{ id: string; name: string; secretariatId: string }>(executor, sql`SELECT id,name,"secretariatId" FROM "BudgetUnit" WHERE ${administrator ? sql`TRUE` : sql`id=ANY(${sql.param(context.user.allowedBudgetUnitIds)}::text[])`} ORDER BY name ASC`);
  const unit = units.find(row => row.id === params.unitId);
  if (unit) await assertSstClinicalAccess(context, unit.id);
  const employees = unit ? await portalRows<{ id: string; name: string }>(executor, sql`SELECT id,name FROM "Employee" WHERE "isActive" AND "secretariatId"=${unit.secretariatId} ${administrator ? sql`` : sql`AND "departmentId"=${departmentId}`} ORDER BY name ASC`) : [];
  const reasons = unit ? await portalRows<{ id: string; name: string }>(executor, sql`SELECT id,name FROM "SstCertificateReason" WHERE "budgetUnitId"=${unit.id} AND "isActive" ORDER BY name ASC`) : [];
  const receipts = unit ? await portalRows<{ id: string; protocolNumber: string; status: string }>(executor, sql`SELECT c.id,c."protocolNumber",c.status FROM "SstMedicalCertificate" c WHERE c."budgetUnitId"=${unit.id} AND c."createdById"=${context.user.id} ${administrator ? sql`` : sql`AND c."departmentIdSnapshot"=${departmentId} AND EXISTS(SELECT 1 FROM "Employee" e WHERE e.id=c."employeeId" AND e."departmentId"=${departmentId})`} ORDER BY c."createdAt" DESC LIMIT 20`) : [];
  return <main className="mx-auto max-w-5xl space-y-4 px-4 py-8"><PortalBreadcrumb current="Atestados do departamento" /><h1 className="text-2xl font-bold">Recebimento de atestados pelo departamento</h1><p className="text-sm">Requer permissão de inclusão SST, unidade autorizada e autorização clínica ocupacional. O recebimento não decide perícia nem gera afastamento automaticamente.</p><form className="flex gap-2 text-sm"><select name="unitId" required defaultValue={unit?.id || ""} className="rounded border p-2"><option value="">Selecione unidade</option>{units.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select><button className="rounded border px-3">Carregar departamento</button></form>{unit && <DepartmentCertificateForm submissionKey={randomUUID()} unitId={unit.id} employees={employees} reasons={reasons} />}<section className="rounded border bg-white p-4"><h2 className="font-semibold">Últimos recebimentos registrados por mim</h2>{receipts.map(receipt => <p key={receipt.id} className="mt-3 text-sm">{receipt.protocolNumber} · {receipt.status}<a href={`/api/portal/departamentos/atestados/${receipt.id}`} className="ml-3 font-semibold text-emerald-800 underline">Comprovante</a></p>)}</section></main>;
}
