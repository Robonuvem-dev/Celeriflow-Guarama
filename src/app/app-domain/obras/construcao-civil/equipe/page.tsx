import { getTenantContextForSystemAdministration } from "@/lib/platform/tenant-context";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { Users } from "lucide-react";
import ConstructionStaffClient from "./ConstructionStaffClient";
import { db } from "@/db/client";
import { loadPageStaff } from "@/db/repositories/works-pages/professionals";

export default async function ConstructionStaffPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string }> }) {
  const params = await searchParams;
  const context = await getTenantContextForSystemAdministration();
  const q = (params.q || "").trim().slice(0, 160);
  const status = params.status === "inactive" ? "inactive" : params.status === "all" ? "all" : "active";
  const { total, page, links, employees, departments } = await loadPageStaff(context.database ?? db, { q, status, page: params.page });
  return <PageFrame className="space-y-3 p-3"><PageHeader title="Equipe de Construção Civil" icon={<Users className="size-4" />} /><ConstructionStaffClient rows={links.map((link) => ({ id: link.id, employeeId: link.employeeId, employeeName: link.employee.name, departmentId: link.departmentId, departmentName: link.department.name, role: link.role, startsAt: link.startsAt.toISOString().slice(0, 10), endsAt: link.endsAt?.toISOString().slice(0, 10) || "", isActive: link.isActive }))} employees={employees} departments={departments} q={q} status={status} page={page} total={total} /></PageFrame>;
}
