"use client";

import { Download } from "lucide-react";
import { updateDocument, deleteDocument } from "../actions";
import { RegistryList, registryColumns } from "../operational-registry";
import styles from "@/components/app-ui/operational/operational.module.css";

type Document = { id: string; title: string; documentType: string; validUntil: Date | null; fileUrl: string | null; person: { fullName: string } | null; company: { corporateName: string } | null };
const columns = registryColumns([["title", "Título do documento", 260, 155, "identifier"], ["type", "Tipo", 150, 65], ["link", "Vínculo", 230, 100], ["validUntil", "Validade", 120, 90], ["actions", "Ações", 96, 96, "actions"]]);

export default function DocumentosClient({ documents }: { documents: Document[] }) {
  return <RegistryList records={documents} columns={columns} preferenceId="cadastros-documentos" label={record => record.title}
    searchValues={record => [record.title, record.documentType, record.person?.fullName, record.company?.corporateName]}
    values={record => ({ title: record.title, type: record.documentType, link: record.person?.fullName || record.company?.corporateName || "—", validUntil: record.validUntil ? new Date(record.validUntil).toLocaleDateString("pt-BR") : "—" })}
    editValues={record => ({ title: record.title, documentType: record.documentType })}
    fields={[{ key: "title", label: "Título" }, { key: "documentType", label: "Tipo" }]}
    onSave={(record, values) => updateDocument(record.id, { title: String(values.title), documentType: String(values.documentType) })}
    statusAction={record => ({ label: "Excluir", confirm: "Deseja realmente excluir este documento?", run: () => deleteDocument(record.id) })}
    extraActions={record => record.fileUrl && <a className={styles.iconButton} href={`/api/download?url=${encodeURIComponent(record.fileUrl)}`} target="_blank" rel="noreferrer" aria-label={`Ver anexo de ${record.title}`}><Download /></a>} />;
}
