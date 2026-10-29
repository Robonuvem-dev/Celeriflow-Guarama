import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { NewLicenseSheet } from "../components/NewLicenseSheet";
import { LicenseRowActions } from "../components/LicenseRowActions";
import { EnvironmentListToolbar } from "../components/EnvironmentListToolbar";
import { LicenciamentoInteractiveClient } from "./LicenciamentoInteractiveClient";
import { db } from "@/db/client";
import { listEnterpriseOptions, listLicenses } from "@/db/repositories/environment/queries";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { OperationalListFrame, OperationalLinkPagination } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable, type OperationalRow } from "@/components/app-ui/operational/OperationalTable";
import styles from "@/components/app-ui/operational/operational.module.css";
import type { OperationalColumn } from "@/lib/operational-tables";
import { filterAndPaginate } from "../list-utils";

export const dynamic = "force-dynamic";

const columns: readonly OperationalColumn[] = [
  { key: "number", label: "Nº licença", type: "identifier", initialWidth: 190, minWidth: 110, resizable: true, sortable: false, details: "overflow" },
  { key: "type", label: "Tipo", type: "text", initialWidth: 200, minWidth: 100, resizable: true, sortable: false, details: "overflow" },
  { key: "enterprise", label: "Empreendimento", type: "text", initialWidth: 280, minWidth: 140, resizable: true, sortable: false, details: "overflow" },
  { key: "validUntil", label: "Validade", type: "text", initialWidth: 150, minWidth: 120, resizable: true, sortable: false, details: "overflow" },
  { key: "status", label: "Status", type: "status", initialWidth: 140, minWidth: 100, resizable: true, sortable: false, details: "overflow" },
  { key: "actions", label: "Ações", type: "actions", initialWidth: 64, minWidth: 64, maxWidth: 64, resizable: false, sortable: false, details: "none", align: "right" },
];

export default async function LicenciamentoPage(props: { searchParams: Promise<{ [key: string]: string | undefined }> | { [key: string]: string | undefined } }) {
  const context = await getTenantContextForModule("MEIO_AMBIENTE");
  const searchParams = await Promise.resolve(props.searchParams || {});
  const listHref = `/meio-ambiente/licenciamento?${new URLSearchParams(Object.entries(searchParams).filter((entry): entry is [string, string] => entry[0] !== "view" && entry[1] !== undefined))}`;
  if (searchParams.view === "motor") return <PageFrame className="space-y-3 p-3">
    <PageHeader title="Motor de licenciamento ambiental" action={<Link href={listHref}>Voltar às licenças</Link>} />
    <LicenciamentoInteractiveClient />
  </PageFrame>;

  const licenses = await listLicenses(context.database ?? db, searchParams);
  const enterprises = await listEnterpriseOptions(context.database ?? db);
  const list = filterAndPaginate(licenses, searchParams);
  const rows: OperationalRow[] = list.items.map((license) => ({
    id: license.id, label: license.licenseNumber,
    values: { number: license.licenseNumber, type: license.licenseType, enterprise: license.enterprise.name, validUntil: license.validUntil ? new Date(license.validUntil).toLocaleDateString("pt-BR") : "Indeterminado", status: license.status },
    actions: <LicenseRowActions license={license} />,
  }));
  return <OperationalListFrame label="Lista de licenças ambientais" actions={<><NewLicenseSheet enterprises={enterprises} /><Link href={`${listHref}&view=motor`} className={styles.iconButton} aria-label="Abrir motor de licenciamento" title="Motor de licenciamento"><ShieldCheck /></Link></>}
    toolbar={<EnvironmentListToolbar pathname="/meio-ambiente/licenciamento" values={searchParams} placeholder="Buscar licença..." filters={[{ name: "status", label: "Status", options: ["Emitida", "Em Analise", "Vencida", "Suspensa", "Cassada"] }]} />}
    pagination={<OperationalLinkPagination pathname="/meio-ambiente/licenciamento" values={searchParams} page={list.currentPage} total={list.filtered.length} />}>
    <OperationalTable columns={columns} rows={rows} preferenceId="environment-licenses" caption="Licenciamento ambiental" emptyMessage="Nenhuma licença emitida." />
  </OperationalListFrame>;
}
