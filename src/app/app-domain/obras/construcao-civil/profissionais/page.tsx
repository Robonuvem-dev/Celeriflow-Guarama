import { notFound } from "next/navigation";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { resolveConstructionAccess } from "@/lib/obras/construction-access";
import ConstructionProfessionalsClient from "./ConstructionProfessionalsClient";
import { db } from "@/db/client";
import { loadPageProfessionals } from "@/db/repositories/works-pages/professionals";

export default async function ConstructionProfessionalsPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; page?: string; status?: string }> }) {
  const params = await searchParams;
  const tab = params.tab === "companies" ? "companies" : "professionals";
  const q = (params.q || "").trim().slice(0, 160);
  const status = params.status === "inactive" ? "inactive" : params.status === "all" ? "all" : "active";
  const context = await getTenantContextForModule("OBRAS");
  const access = await resolveConstructionAccess(context);
  if (!access.administrator && !access.roles.length) notFound();
  const { total, page, profiles, employers, people, companies, professionalOptions } = await loadPageProfessionals(context.database ?? db, { tab, q, status, page: params.page });
  return <ConstructionProfessionalsClient key={tab} tab={tab} q={q} status={status} page={page} total={total} canManage={access.administrator || access.roles.includes("MANAGER")} profiles={profiles.map((profile) => ({ id: profile.id, personId: profile.personId, name: profile.person.fullName, professionalType: profile.professionalType, council: profile.council, registration: profile.registration, startsAt: profile.startsAt.toISOString().slice(0, 10), endsAt: profile.endsAt?.toISOString().slice(0, 10) || "", isActive: profile.isActive }))} employers={employers.map((employer) => ({ id: employer.id, professionalId: employer.professionalId, companyId: employer.companyId, name: employer.company.corporateName, professionalName: employer.professional.person.fullName, startsAt: employer.startsAt.toISOString().slice(0, 10), endsAt: employer.endsAt?.toISOString().slice(0, 10) || "", isActive: employer.isActive }))} people={people.map((person) => ({ id: person.id, name: person.fullName }))} companies={companies.map((company) => ({ id: company.id, name: company.corporateName }))} professionals={professionalOptions.map((profile) => ({ id: profile.id, name: `${profile.person.fullName} — ${profile.council} ${profile.registration}` }))} />;
}
