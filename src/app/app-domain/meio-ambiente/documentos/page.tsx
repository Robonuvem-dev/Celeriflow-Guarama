import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { Download } from "lucide-react";
import { NewDocumentSheet } from "../components/NewDocumentSheet";
import { DocumentRowActions } from "../components/DocumentRowActions";
import { EnvironmentListToolbar } from "../components/EnvironmentListToolbar";
import { db } from "@/db/client";
import { listDocuments, listEnterpriseOptions } from "@/db/repositories/environment/queries";
import { OperationalListFrame, OperationalLinkPagination } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable, type OperationalRow } from "@/components/app-ui/operational/OperationalTable";
import styles from "@/components/app-ui/operational/operational.module.css";
import type { OperationalColumn } from "@/lib/operational-tables";
import { filterAndPaginate } from "../list-utils";

export const dynamic = "force-dynamic";

const columns: readonly OperationalColumn[] = [
  { key: "title", label: "Título do documento", type: "text", initialWidth: 280, minWidth: 160, resizable: true, sortable: false, details: "overflow" },
  { key: "type", label: "Tipo", type: "text", initialWidth: 200, minWidth: 100, resizable: true, sortable: false, details: "overflow" },
  { key: "enterprise", label: "Empreendimento", type: "text", initialWidth: 240, minWidth: 140, resizable: true, sortable: false, details: "overflow" },
  { key: "date", label: "Cadastro", type: "text", initialWidth: 120, minWidth: 100, maxWidth: 180, resizable: true, sortable: false, details: "overflow" },
  { key: "download", label: "Download", type: "text", initialWidth: 120, minWidth: 110, maxWidth: 160, resizable: true, sortable: false, details: "overflow", align: "center" },
  { key: "actions", label: "Ações", type: "actions", initialWidth: 64, minWidth: 64, maxWidth: 64, resizable: false, sortable: false, details: "none", align: "right" },
];

export default async function DocumentosAmbientaisPage(props: { searchParams: Promise<{ [key: string]: string | undefined }> | { [key: string]: string | undefined } }) {
  const context = await getTenantContextForModule("MEIO_AMBIENTE");
  const searchParams = await Promise.resolve(props.searchParams || {});
  const documents = await listDocuments(context.database ?? db, searchParams);
  const enterprises = await listEnterpriseOptions(context.database ?? db);
  const list = filterAndPaginate(documents, searchParams);
  const rows: OperationalRow[] = list.items.map((doc) => ({
    id: doc.id, label: doc.title,
    values: { title: doc.title, type: doc.docType, enterprise: doc.enterprise?.name ?? "Documento Geral", date: new Date(doc.createdAt).toLocaleDateString("pt-BR"), download: doc.fileUrl ? "Baixar arquivo" : "Sem arquivo" },
    cells: { download: doc.fileUrl ? <a href={doc.fileUrl.startsWith("http") ? `/api/download?url=${encodeURIComponent(doc.fileUrl)}` : doc.fileUrl} target="_blank" rel="noopener noreferrer" className={styles.iconButton} aria-label={`Baixar arquivo ${doc.title}`} title="Baixar arquivo"><Download /></a> : "Sem arquivo" },
    actions: <DocumentRowActions doc={doc} enterprises={enterprises} />,
  }));
  return <OperationalListFrame label="Lista de documentos ambientais" actions={<NewDocumentSheet enterprises={enterprises} />}
    toolbar={<EnvironmentListToolbar pathname="/meio-ambiente/documentos" values={searchParams} placeholder="Buscar documentos..." filters={[{ name: "tipo", label: "Tipo", options: ["Laudo/Relatorio Tecnico", "Termo de Compromisso", "Parecer Tecnico", "Alvara/Autorizacao Especial", "Outros"] }]} />}
    pagination={<OperationalLinkPagination pathname="/meio-ambiente/documentos" values={searchParams} page={list.currentPage} total={list.filtered.length} />}>
    <OperationalTable columns={columns} rows={rows} preferenceId="environment-documents" caption="Central de documentos ambientais" emptyMessage="Nenhum documento anexado." />
  </OperationalListFrame>;
}
