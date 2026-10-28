import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import NovaSecretariaForm from "./NovaSecretariaForm";

export default async function NovaSecretariaPage() {
  const { prisma } = await getTenantContextForModule("ADMINISTRACAO");
  const employees = await prisma.employee.findMany({ where: { isActive: true, secretariatId: null, departmentId: null, unitId: null, role: { isActive: true } }, select: { id: true, name: true, role: { select: { name: true } } }, orderBy: { name: "asc" } });
  return <NovaSecretariaForm employees={employees} />;
}
