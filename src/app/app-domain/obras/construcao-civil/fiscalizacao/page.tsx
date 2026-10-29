import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { OperationalListFrame, OperationalLinkPagination, OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { operationalColumns } from "../../../patrimonio/_components/operational-columns";
import styles from "@/components/app-ui/operational/operational.module.css";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { resolveConstructionAccess } from "@/lib/obras/construction-access";
import { db } from "@/db/client";
import { listPageEnforcementProperties, loadPageEnforcementList } from "@/db/repositories/works-pages/enforcement";
import { listPageCaseOptions } from "@/db/repositories/works-pages/cases";
import { listPageCompanies, listPagePeople, listPageSubjects } from "@/db/repositories/works-pages/shared";
import { ConstructionEnforcementOpening } from "./ConstructionEnforcementClient";

export default async function ConstructionEnforcementPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; status?: string; locationType?: string; permitStatus?: string; view?: string }> }) {
  const params = await searchParams;
  const q = (params.q || "").trim().slice(0, 160);
  const status = ["OPEN", "EMBARGOED"].includes(params.status || "") ? params.status! : "";
  const locationType = ["URBAN", "RURAL"].includes(params.locationType || "") ? params.locationType! : "";
  const permitStatus = ["WITHOUT_PERMIT", "REPORTED_PERMIT", "UNKNOWN"].includes(params.permitStatus || "") ? params.permitStatus! : "";
  const context = await getTenantContextForModule("OBRAS");
  const access = await resolveConstructionAccess(context);
  const canOpen = access.administrator || access.roles.some((role) => ["INSPECTOR", "MANAGER"].includes(role));
  const database = context.database ?? db;
  const { total, page, cases } = await loadPageEnforcementList(database, access, { q, status, locationType, permitStatus, page: params.page });
  const [properties, subjects, permits, persons, companies] = await Promise.all([
    canOpen ? listPageEnforcementProperties(database, q) : [],
    canOpen ? listPageSubjects(database) : [],
    canOpen ? listPageCaseOptions(database, access, { category: "BUILDING", limit: 100 }) : [],
    canOpen ? listPagePeople(database, 200) : [],
    canOpen ? listPageCompanies(database, true, 200) : [],
  ]);
  const values = { q, status, locationType, permitStatus };
  const notice = <p>DEMONSTRATIVO — fiscalização urbana e rural, inclusive SEM ALVARÁ. Atos e fundamentos informados não constituem modelos legais oficiais. Fiscalização edilícia não altera ISS nem gera multa tributária.</p>;
  if (params.view === "abrir") return <PageFrame className="space-y-3 p-3"><PageHeader title="Abrir fiscalização edilícia" icon={<ShieldCheck className="size-4" />} action={<Link href={`?${new URLSearchParams(values)}`}>Voltar à consulta</Link>} />{notice}
    <form className="flex gap-2"><input type="hidden" name="view" value="abrir" /><input name="q" aria-label="Filtrar imóveis para abertura" defaultValue={q} placeholder="Inscrição/endereço" className="h-8 flex-1 rounded border px-2" /><button>Filtrar imóveis</button></form>
    {canOpen && <ConstructionEnforcementOpening properties={properties.map(item => ({ id: item.id, label: `${item.municipalInsc || item.id} — ${item.streetName || "Sem endereço"}, ${item.number || "s/n"}` }))} subjects={subjects.map(item => ({ id: item.id, label: `${item.processType.name} / ${item.name}`, processTypeId: item.processTypeId }))} permits={permits.map(item => ({ id: item.id, label: item.process.protocolNumber }))} persons={persons.map(item => ({ id: item.id, label: item.fullName }))} companies={companies.map(item => ({ id: item.id, label: item.corporateName }))} />}
  </PageFrame>;
  return <OperationalListFrame actions={<><Link href="/obras/construcao-civil" className={styles.dialogButton}>Solicitações de obra</Link>{canOpen && <Link href={`?${new URLSearchParams({ ...values, view: "abrir" })}`} className={styles.newButton}>Abrir fiscalização</Link>}<OperationalFilters label="Sobre o demonstrativo">{notice}</OperationalFilters></>}
    toolbar={<><form role="search" className={styles.searchForm}><input name="q" defaultValue={q} aria-label="Buscar protocolo, inscrição ou endereço" className={styles.searchInput} placeholder="Buscar protocolo, inscrição ou endereço" /><input type="hidden" name="status" value={status} /><input type="hidden" name="locationType" value={locationType} /><input type="hidden" name="permitStatus" value={permitStatus} /><button className={styles.dialogButton}>Filtrar</button></form>
      <OperationalFilters activeCount={[status, locationType, permitStatus].filter(Boolean).length}><form className={styles.filterFields}><input type="hidden" name="q" value={q} />
        <label>Situação<select name="status" defaultValue={status}><option value="">Todas</option><option value="OPEN">Em fiscalização</option><option value="EMBARGOED">Embargada</option></select></label>
        <label>Localização<select name="locationType" defaultValue={locationType}><option value="">Todas</option><option value="URBAN">Urbana</option><option value="RURAL">Rural</option></select></label>
        <label>Alvará<select name="permitStatus" defaultValue={permitStatus}><option value="">Todos</option><option value="WITHOUT_PERMIT">SEM ALVARÁ</option><option value="REPORTED_PERMIT">Alvará informado</option><option value="UNKNOWN">Não verificado</option></select></label>
        <button className={styles.primaryButton}>Aplicar</button><Link href="/obras/construcao-civil/fiscalizacao">Limpar</Link>
      </form></OperationalFilters></>}
    pagination={<OperationalLinkPagination page={page} total={total} pathname="/obras/construcao-civil/fiscalizacao" values={values} />}>
    <OperationalTable preferenceId="obras-fiscalizacao-edilicia" caption="Fiscalização edilícia / posturas" emptyMessage="Nenhum processo fiscal disponível no seu setor para os filtros." columns={operationalColumns([
      ["protocol", "Processo", 150, 85, "identifier"], ["registration", "Inscrição", 140, 80], ["address", "Endereço", 240, 100], ["department", "Setor", 180, 80], ["permit", "Alvará", 150, 85], ["location", "Localização", 110, 75], ["status", "Situação fiscal", 160, 85, "status"], ["processStatus", "Situação do protocolo", 180, 90, "status"], ["actions", "Ação", 80, 75, "actions"],
    ])} rows={cases.map(item => ({ id: item.id, label: item.process.protocolNumber, values: {
      protocol: item.process.protocolNumber, registration: item.realEstate.municipalInsc || "Sem inscrição", address: `${item.realEstate.streetName || "Sem endereço"}, ${item.realEstate.number || "s/n"}`, department: item.process.currentDepartment?.name || "—", permit: item.permitStatus === "WITHOUT_PERMIT" ? "SEM ALVARÁ" : item.permitStatus === "UNKNOWN" ? "Não verificado" : "Alvará informado", location: item.locationType === "RURAL" ? "Rural" : "Urbana", status: item.status === "EMBARGOED" ? "Embargada" : "Em fiscalização", processStatus: item.process.status,
    }, actions: <Link href={`/obras/construcao-civil/fiscalizacao/${item.id}`} className="text-blue-700 underline">Detalhes</Link> }))} />
  </OperationalListFrame>;
}
