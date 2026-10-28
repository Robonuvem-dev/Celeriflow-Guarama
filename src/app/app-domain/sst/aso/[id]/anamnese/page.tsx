import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantContextForModule, canPerformModuleOperation, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { assertSstClinicalAccess } from "@/lib/sst/access";
import { questionnaireQuestions } from "@/lib/sst/questionnaire-policy";
import { auditEventTypes } from "@/lib/platform/audit-evidence";
import { insertAuditEvent as writeAuditEvent } from "@/db/repositories/platform/audit";
import { findSstClinicalGrant } from "@/db/repositories/sst/access";
import { sstDatabase } from "@/lib/sst/database";
import { findSstAsoScope, readSstAnamnesisHistory } from "@/db/repositories/sst-pages/aso";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
import { AnamnesisForm } from "./AnamnesisForm";

export default async function SstAsoAnamnesis({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ questionnaireVersionId?: string; q?: string; page?: string }> }) {
  const context = await getTenantContextForModule("SST");
  const { id } = await params;
  const search = await searchParams;
  const database = sstDatabase(context);
  const scope = await findSstAsoScope(database, id);
  if (!scope) notFound();
  await assertSstClinicalAccess(context, scope.budgetUnitId);
  const { versions, selected, total, page, history } = await readSstAnamnesisHistory(database, id, scope.budgetUnitId, search);
  const grant = isSystemAdministrator(context.user) ? null : await findSstClinicalGrant(database, context.user.id, scope.budgetUnitId);
  const canCreate = canPerformModuleOperation(context.user, "SST", "create") && (isSystemAdministrator(context.user) || grant?.canAssess);
  await writeAuditEvent(database, { actorUsuarioId: context.user.id, eventType: auditEventTypes.pageView, targetType: "SST_ANAMNESIS_HISTORY", targetId: id });
  const href = (value: number) => `/sst/aso/${id}/anamnese?${new URLSearchParams({ q: search.q || "", questionnaireVersionId: selected?.id || "", page: String(value) })}`;
  return <div className="space-y-4 p-4"><h1 className="text-xl font-semibold">Anamnese vinculada ao ASO</h1><Link className="underline" href={`/sst/aso/${id}`}>Voltar ao ASO</Link>
    {canCreate && <><form className="flex flex-wrap gap-2"><input aria-label="Título do questionário" name="q" defaultValue={search.q} placeholder="Buscar questionário" className="rounded border p-2"/><select aria-label="Versão do questionário" name="questionnaireVersionId" defaultValue={selected?.id || ""} className="min-w-0 rounded border p-2"><option value="">Selecione a versão (20 opções por busca)</option>{selected && !versions.some((item) => item.id === selected.id) && <option value={selected.id}>{selected.title} v{selected.version}</option>}{versions.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.title} v{item.version}</option>)}</select><button className="rounded border p-2">Carregar</button></form>{selected && <AnamnesisForm key={selected.id} asoId={id} questionnaireVersionId={selected.id} questions={questionnaireQuestions.parse(selected.questions)} needsReason={total > 0}/>}</>}
    <h2 className="font-semibold">Histórico preservado · {total} revisão(ões)</h2><table className="w-full table-fixed text-left text-sm"><thead><tr><th className="p-2">Revisão</th><th className="p-2">Questionário</th><th className="p-2">Registro</th><th className="p-2">Ficha</th></tr></thead><tbody>{history.map((record) => <tr key={record.id} className="border-b"><td className="p-2">{record.revision}</td><td className="break-words p-2">{record.questionnaireVersion.title} v{record.questionnaireVersion.version}</td><td className="p-2">{record.createdAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</td><td className="p-2"><Link className="underline" href={`/sst/anamneses/${record.id}`}>Abrir</Link></td></tr>)}</tbody></table>{!history.length && <p>Nenhuma anamnese registrada.</p>}<ErpPagination page={page} total={total} previousHref={href(page - 1)} nextHref={href(page + 1)}/>
  </div>;
}
