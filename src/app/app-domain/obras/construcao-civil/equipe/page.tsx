import { getTenantContextForSystemAdministration } from "@/lib/platform/tenant-context";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { Users } from "lucide-react";
import ConstructionStaffClient from "./ConstructionStaffClient";

export default async function ConstructionStaffPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string }> }) {
  const params = await searchParams;
  const { prisma } = await getTenantContextForSystemAdministration();
  const q = (params.q || "").trim().slice(0, 160);
  const status = params.status === "inactive" ? "inactive" : params.status === "all" ? "all" : "active";
  const where = { ...(q ? { employee: { name: { contains: q, mode: "insensitive" as const } } } : {}), ...(status !== "all" ? { isActive: status === "active" } : {}) };
  const total = await prisma.constructionStaffRole.count({ where });
  const page = Math.min(Math.max(1, Math.ceil(total / 20)), Math.max(1, Number.parseInt(params.page || "1", 10) || 1));
  const [links, employees, departments] = await Promise.all([
    prisma.constructionStaffRole.findMany({ where, include: { employee: { select: { name: true } }, department: { select: { name: true } } }, orderBy: [{ employee: { name: "asc" } }, { startsAt: "desc" }], skip: (page - 1) * 20, take: 20 }),
    prisma.employee.findMany({ where: { isActive: true }, select: { id: true, name: true, departmentId: true }, orderBy: { name: "asc" } }),
    prisma.department.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return <PageFrame className="space-y-3 p-3"><PageHeader title="Equipe de Construção Civil" icon={<Users className="size-4" />} /><ConstructionStaffClient rows={links.map((link) => ({ id: link.id, employeeId: link.employeeId, employeeName: link.employee.name, departmentId: link.departmentId, departmentName: link.department.name, role: link.role, startsAt: link.startsAt.toISOString().slice(0, 10), endsAt: link.endsAt?.toISOString().slice(0, 10) || "", isActive: link.isActive }))} employees={employees} departments={departments} q={q} status={status} page={page} total={total} /></PageFrame>;
}
