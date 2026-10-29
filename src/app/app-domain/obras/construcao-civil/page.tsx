import Link from "next/link";
import { OperationalListFrame, OperationalLinkPagination } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { operationalColumns } from "../../patrimonio/_components/operational-columns";
import styles from "@/components/app-ui/operational/operational.module.css";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { resolveConstructionAccess } from "@/lib/obras/construction-access";
import { db } from "@/db/client";
import { loadPageCaseList } from "@/db/repositories/works-pages/cases";

export default async function ConstructionCasesPage({ searchParams }: { searchParams: Promise<{ q?: string; category?: string; page?: string }> }) {
  const params = await searchParams;
  const q = (params.q || "").trim().slice(0, 160);
  const category = params.category === "BUILDING" || params.category === "SUBDIVISION" ? params.category : "";
  const context = await getTenantContextForModule("OBRAS");
  const access = await resolveConstructionAccess(context);
  const { total, page, cases } = await loadPageCaseList(context.database ?? db, access, { category, q, page: params.page });
  return <OperationalListFrame actions={<>
    <Link href="/obras/construcao-civil/configuracoes" className={styles.dialogButton}>Configurações</Link><Link href="/obras/construcao-civil/taxas" className={styles.dialogButton}>Taxas, guias e débitos</Link>
    {access.administrator && <Link href="/obras/construcao-civil/equipe" className={styles.dialogButton}>Equipe e papéis</Link>}
    <Link href="/obras/construcao-civil/novo" className={styles.newButton}>Nova solicitação interna</Link>
  </>} toolbar={<form className={styles.searchForm} role="search"><input name="q" defaultValue={q} aria-label="Buscar protocolo ou requerente" type="search" className={styles.searchInput} placeholder="Buscar protocolo ou requerente..." /><select name="category" defaultValue={category} aria-label="Categoria" className="h-7 rounded border px-2"><option value="">Todas as categorias</option><option value="BUILDING">Obra</option><option value="SUBDIVISION">Parcelamento do solo</option></select><button className={styles.dialogButton}>Filtrar</button></form>}
    pagination={<OperationalLinkPagination page={page} total={total} pathname="/obras/construcao-civil" values={{ q, category }} />}>
    <OperationalTable preferenceId="obras-construcao-solicitacoes" caption="Solicitações urbanísticas" emptyMessage="Nenhuma solicitação disponível no seu setor. Confirme seu vínculo urbanístico vigente." columns={operationalColumns([
      ["protocol", "Protocolo", 150, 85, "identifier"], ["applicant", "Requerente", 220, 100], ["department", "Setor", 170, 80],
      ["category", "Categoria", 140, 80], ["location", "Localização", 110, 70], ["regularization", "Regularização", 120, 80],
      ["area", "Área (m²)", 100, 70, "text", "right"], ["status", "Situação", 160, 85, "status"], ["actions", "Ação", 80, 75, "actions"],
    ])} rows={cases.map(item => ({ id: item.id, label: item.process.protocolNumber, values: {
      protocol: item.process.protocolNumber, applicant: item.process.person?.fullName || item.process.company?.corporateName || "—", department: item.process.currentDepartment?.name || "—",
      category: item.category === "BUILDING" ? "Obra" : "Parcelamento", location: item.locationType === "URBAN" ? "Urbana" : "Rural", regularization: item.regularization ? "Sim" : "Não", area: item.totalArea.toString(), status: item.process.status,
    }, actions: <Link className="text-blue-700 underline" href={`/obras/construcao-civil/${item.id}`}>Detalhes</Link> }))} />
  </OperationalListFrame>;
}
