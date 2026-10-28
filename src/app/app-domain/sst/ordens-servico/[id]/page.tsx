import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantContextForModule, canPerformModuleOperation } from "@/lib/platform/tenant-context";
import { getServiceOrder } from "@/lib/sst/service-order-service";
import { auditEventTypes } from "@/lib/platform/audit-evidence";
import { insertAuditEvent as writeAuditEvent } from "@/db/repositories/platform/audit";
import { sstDatabase } from "@/lib/sst/database";
import { SstForm } from "../../SstForm";
import { revokeTechnicalRecord } from "../actions";

export default async function ServiceOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getTenantContextForModule("SST");
  const record = await getServiceOrder(context, id);
  if (!record) notFound();
  await writeAuditEvent(sstDatabase(context), { actorUsuarioId: context.user.id, eventType: auditEventTypes.pageView, targetType: "SST_SERVICE_ORDER", targetId: id });
  return <div className="space-y-4 p-4"><Link href="/sst/ordens-servico">Voltar</Link><h1 className="text-xl font-semibold">Ordem de serviço · {id}</h1><p>{record.revoked ? "Revogada — conteúdo preservado" : "Emitida"} · {record.employeeId ? `Servidor ${record.employeeId}` : "GHE coletivo"}</p><p>{record.startsAt.toLocaleString("pt-BR")} — {record.endsAt.toLocaleString("pt-BR")}</p>{[["Prevenção", record.prevention], ["Normas", record.standards], ["Conduta em acidente", record.accidentConduct]].map(([label, value]) => <section key={label}><h2 className="font-semibold">{label}</h2><p className="whitespace-pre-wrap break-words">{value}</p></section>)}<section><h2 className="font-semibold">Treinamentos requeridos</h2>{record.trainingRequirements.map((t, i) => <p key={i}>{t}</p>)}</section><section><h2 className="font-semibold">Equipamentos e fonte histórica de riscos</h2><pre className="whitespace-pre-wrap break-words text-xs">{JSON.stringify({ equipmentRequirements: record.equipmentRequirements, source: record.snapshot }, null, 2)}</pre></section>{!record.revoked && canPerformModuleOperation(context.user, "SST", "update") && <SstForm action={revokeTechnicalRecord} label="Revogar ordem"><input type="hidden" name="id" value={id}/><input type="hidden" name="kind" value="ORDER"/><label>Justificativa<input required minLength={10} name="reason" className="block w-full rounded border p-2"/></label></SstForm>}<p>Retificação: revogue a ordem e emita outra com a fonte corrigida. As versões anteriores permanecem consultáveis.</p></div>;
}
