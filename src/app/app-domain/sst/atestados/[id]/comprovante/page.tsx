import { notFound } from "next/navigation";
import { getTenantContextForModuleOperation, assertBudgetUnitAccess } from "@/lib/platform/tenant-context";
import { auditEventTypes } from "@/lib/platform/audit-evidence";
import { insertAuditEvent as writeAuditEvent } from "@/db/repositories/platform/audit";
import { findSstCertificateReceipt } from "@/db/repositories/sst-pages/certificates";
import { sstDatabase } from "@/lib/sst/database";
import { PrintReceipt } from "./PrintReceipt";

export default async function SstReceiptPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ print?: string }> }) {
  const { id } = await params;
  const { print } = await searchParams;
  const context = await getTenantContextForModuleOperation("SST", "issueReports");
  const database = sstDatabase(context);
  const record = await findSstCertificateReceipt(database, id);
  if (!record) notFound();
  assertBudgetUnitAccess(context.user, record.budgetUnitId);
  await writeAuditEvent(database, { actorUsuarioId: context.user.id, eventType: auditEventTypes.reportIssued, targetType: "SST_DELIVERY_RECEIPT", targetId: id });
  return <article data-sst-receipt className="mx-auto max-w-3xl space-y-6 bg-white p-8 text-slate-950"><h1 className="text-center text-xl font-bold">Comprovante de entrega de atestado médico</h1><p>Unidade gestora: {record.budgetUnit.name}</p><p>Protocolo: {record.protocolNumber}</p><p>Servidor: {record.employee.name} · Matrícula: {record.employee.registration}</p><p>Recebido em: {record.presentedAt.toLocaleString("pt-BR")}</p><p>Período informado: {record.startsAt.toLocaleString("pt-BR")} a {record.endsAt.toLocaleString("pt-BR")}</p><p>Este comprovante registra o recebimento do documento. A decisão pericial e o afastamento são registrados no processo ocupacional.</p><p className="pt-8">________________________________________<br/>Responsável pelo recebimento</p><PrintReceipt automatic={print === "1"}/></article>;
}
