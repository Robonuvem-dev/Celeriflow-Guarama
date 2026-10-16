import { getTenantContextForModule, assertBudgetUnitAccess, canPerformModuleOperation } from "@/lib/platform/tenant-context";
import { notFound } from "next/navigation";
import { PrintReceipt } from "../../../atestados/[id]/comprovante/PrintReceipt";
import { cancelSstAppointment } from "../../../agenda-actions";
import { SstForm } from "../../../SstForm";
import { writeAuditEvent, auditEventTypes } from "@/lib/platform/audit-evidence";

export default async function SstAppointmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getTenantContextForModule("SST");
  const record = await context.prisma.sstAppointment.findUnique({ where: { id }, include: { employee: { select: { name: true, registration: true } }, availability: { include: { professional: { select: { fullName: true } } } } } });
  if (!record) notFound();
  assertBudgetUnitAccess(context.user, record.availability.budgetUnitId);
  const reports = canPerformModuleOperation(context.user, "SST", "issueReports");
  if (reports) await writeAuditEvent(context.prisma, { actorUsuarioId: context.user.id, eventType: auditEventTypes.reportIssued, targetType: "SST_APPOINTMENT_RECEIPT", targetId: id });
  return <div className="space-y-4 p-4"><article data-sst-receipt className="space-y-3 rounded border bg-white p-6 text-slate-950"><h1 className="text-xl font-semibold">{reports ? "Comprovante de agendamento SST" : "Agendamento SST"}</h1><p>Identificador: {record.id}</p><p>Servidor: {record.employee.name} · {record.employee.registration}</p><p>Profissional: {record.availability.professional.fullName}</p><p>Unidade/local: {record.availability.unitName}</p><p>Tipo: {record.purpose}</p><p>Data/hora: {record.startsAt.toLocaleString("pt-BR")} — {record.endsAt.toLocaleString("pt-BR")}</p><p>Situação: {record.status}</p>{record.cancellationReason && <p>Cancelamento: {record.cancellationReason}</p>}{reports && <PrintReceipt automatic={false}/>}</article>{record.status === "BOOKED" && <SstForm action={cancelSstAppointment} label="Cancelar agendamento"><input type="hidden" name="id" value={id}/><label>Motivo do cancelamento<input required minLength={5} name="reason" className="block w-full rounded border p-2"/></label></SstForm>}</div>;
}
