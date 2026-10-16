import { Users } from "lucide-react";
import { notFound } from "next/navigation";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { resolveConstructionAccess } from "@/lib/obras/construction-access";
import ConstructionProfessionalsClient from "./ConstructionProfessionalsClient";

export default async function ConstructionProfessionalsPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; page?: string; status?: string }> }) {
  const params = await searchParams;
  const tab = params.tab === "companies" ? "companies" : "professionals";
  const q = (params.q || "").trim().slice(0, 160);
  const status = params.status === "inactive" ? "inactive" : params.status === "all" ? "all" : "active";
  const context = await getTenantContextForModule("OBRAS");
  const access = await resolveConstructionAccess(context);
  if (!access.administrator && !access.roles.length) notFound();
  const active = status !== "all" ? { isActive: status === "active" } : {};
  const profileWhere = { ...active, ...(q ? { person: { fullName: { contains: q, mode: "insensitive" as const } } } : {}) };
  const employerWhere = { ...active, ...(q ? { company: { corporateName: { contains: q, mode: "insensitive" as const } } } : {}) };
  const total = tab === "professionals" ? await context.prisma.constructionProfessional.count({ where: profileWhere }) : await context.prisma.constructionProfessionalEmployer.count({ where: employerWhere });
  const page = Math.min(Math.max(1, Math.ceil(total / 20)), Math.max(1, Number.parseInt(params.page || "1", 10) || 1));
  const [profiles, employers, people, companies, professionalOptions] = await Promise.all([
    tab === "professionals" ? context.prisma.constructionProfessional.findMany({ where: profileWhere, include: { person: { select: { fullName: true } } }, orderBy: [{ person: { fullName: "asc" } }, { id: "asc" }], skip: (page - 1) * 20, take: 20 }) : [],
    tab === "companies" ? context.prisma.constructionProfessionalEmployer.findMany({ where: employerWhere, include: { company: { select: { corporateName: true } }, professional: { include: { person: { select: { fullName: true } } } } }, orderBy: [{ company: { corporateName: "asc" } }, { id: "asc" }], skip: (page - 1) * 20, take: 20 }) : [],
    context.prisma.person.findMany({ where: { status: "Ativo" }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" } }),
    context.prisma.company.findMany({ where: { status: "Ativo" }, select: { id: true, corporateName: true }, orderBy: { corporateName: "asc" } }),
    context.prisma.constructionProfessional.findMany({ where: { isActive: true, professionalType: { not: "BROKER" } }, select: { id: true, person: { select: { fullName: true } }, council: true, registration: true }, orderBy: { person: { fullName: "asc" } } }),
  ]);
  return <PageFrame className="space-y-3 p-3"><PageHeader title="Profissionais e vínculos com construtoras" icon={<Users className="size-4" />} /><ConstructionProfessionalsClient key={tab} tab={tab} q={q} status={status} page={page} total={total} canManage={access.administrator || access.roles.includes("MANAGER")} profiles={profiles.map((profile) => ({ id: profile.id, personId: profile.personId, name: profile.person.fullName, professionalType: profile.professionalType, council: profile.council, registration: profile.registration, startsAt: profile.startsAt.toISOString().slice(0, 10), endsAt: profile.endsAt?.toISOString().slice(0, 10) || "", isActive: profile.isActive }))} employers={employers.map((employer) => ({ id: employer.id, professionalId: employer.professionalId, companyId: employer.companyId, name: employer.company.corporateName, professionalName: employer.professional.person.fullName, startsAt: employer.startsAt.toISOString().slice(0, 10), endsAt: employer.endsAt?.toISOString().slice(0, 10) || "", isActive: employer.isActive }))} people={people.map((person) => ({ id: person.id, name: person.fullName }))} companies={companies.map((company) => ({ id: company.id, name: company.corporateName }))} professionals={professionalOptions.map((profile) => ({ id: profile.id, name: `${profile.person.fullName} — ${profile.council} ${profile.registration}` }))} /></PageFrame>;
}
