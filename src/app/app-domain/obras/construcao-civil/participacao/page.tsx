import { notFound } from "next/navigation";
import Link from "next/link";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { resolveConstructionAccess } from "@/lib/obras/construction-access";
import { db } from "@/db/client";
import { latestPageTerm, listPageCaseOptions, loadPageParticipations } from "@/db/repositories/works-pages/cases";
import { listPagePortalIdentities, listPagePortalProfessionals } from "@/db/repositories/works-pages/professionals";
import ConstructionParticipationClient from "./ConstructionParticipationClient";
import { OperationalListFrame, OperationalLinkPagination } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { operationalColumns } from "../../../patrimonio/_components/operational-columns";
import styles from "@/components/app-ui/operational/operational.module.css";

export default async function ConstructionParticipationPage({ searchParams }: { searchParams: Promise<{ page?: string; q?: string; view?: string }> }) {
  const context = await getTenantContextForModule("OBRAS"); const access = await resolveConstructionAccess(context);
  if (!access.administrator && !access.roles.includes("MANAGER")) notFound();
  const query = await searchParams; const q = (query.q || "").trim().slice(0, 100);
  const database = context.database ?? db;
  const { total, page, participants } = await loadPageParticipations(database, access, q, query.page);
  const [identities, professionals, cases, term] = await Promise.all([
    listPagePortalIdentities(database),
    access.administrator ? listPagePortalProfessionals(database) : [],
    listPageCaseOptions(database, access),
    latestPageTerm(database),
  ]);
  if (query.view === "gerenciar") return <PageFrame className="space-y-3 p-3"><PageHeader title="Gerenciar participação e acesso profissional" action={<Link href={`?${new URLSearchParams({ q, page: String(page) })}`}>Voltar à consulta</Link>} /><ConstructionParticipationClient administrator={access.administrator} identities={identities.map(identity => ({ id: identity.id, name: identity.professional.person.fullName }))} professionals={professionals.map(professional => ({ id: professional.id, name: professional.person.fullName, identity: professional.portalIdentity }))} cases={cases.map(item => ({ id: item.id, name: item.process.protocolNumber }))} term={term} /></PageFrame>;
  return <OperationalListFrame actions={<Link className={styles.dialogButton} href={`?${new URLSearchParams({ q, page: String(page), view: "gerenciar" })}`}>Gerenciar participação</Link>}
    toolbar={<form role="search" className={styles.searchForm}><input name="q" defaultValue={q} placeholder="Buscar protocolo" aria-label="Buscar protocolo" className={styles.searchInput} /><button className={styles.dialogButton}>Filtrar</button></form>}
    pagination={<OperationalLinkPagination page={page} total={total} pathname="/obras/construcao-civil/participacao" values={{ q }} />}>
    <OperationalTable preferenceId="obras-participacao" caption="Participação e acesso profissional" columns={operationalColumns([["protocol", "Protocolo", 200, 120, "identifier"], ["professional", "Profissional", 350, 160], ["role", "Papel", 170, 100], ["status", "Situação", 140, 100, "status"]])} rows={participants.map(participant => ({ id: participant.id, label: participant.case.process.protocolNumber, values: { protocol: participant.case.process.protocolNumber, professional: participant.identity.professional.person.fullName, role: participant.role, status: participant.isActive ? "Ativo" : "Encerrado" } }))} />
  </OperationalListFrame>;
}
