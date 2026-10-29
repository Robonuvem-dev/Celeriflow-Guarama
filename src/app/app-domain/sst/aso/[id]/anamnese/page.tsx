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
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { OperationalLinkPagination, OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import styles from "@/components/app-ui/operational/operational.module.css";
import { sstColumn } from "../../../_components/operational-columns";
import { SstNewLink } from "../../../_components/SstNewLink";
import { AnamnesisForm } from "./AnamnesisForm";

export default async function SstAsoAnamnesis({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ questionnaireVersionId?: string; q?: string; page?: string; view?: string }> }) {
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
  if (search.view !== "manage") {
    const columns = [sstColumn("revision", "Revisão", 100, 80, "text", "right"), sstColumn("title", "Questionário", 300, 170), sstColumn("version", "Versão", 100, 75, "text", "right"), sstColumn("createdAt", "Registro", 200, 150), sstColumn("actions", "Ficha", 90, 80, "actions")];
    return <OperationalListFrame label="Histórico de anamnese do ASO" actions={<><Link href={`/sst/aso/${id}`} className={styles.filterButton}>Voltar ao ASO</Link>{canCreate && <SstNewLink href={`/sst/aso/${id}/anamnese?${new URLSearchParams({ view: "manage", q: search.q || "", questionnaireVersionId: selected?.id || "" })}`}>Registrar revisão</SstNewLink>}</>}
      pagination={<OperationalLinkPagination page={page} total={total} pathname={`/sst/aso/${id}/anamnese`} values={{ q: search.q, questionnaireVersionId: selected?.id }} />}>
      <OperationalTable columns={columns} preferenceId="sst-anamnese" caption="Histórico preservado de anamnese" emptyMessage="Nenhuma anamnese registrada." rows={history.map(record => ({ id: record.id, label: `Revisão ${record.revision}`, values: { revision: String(record.revision), title: record.questionnaireVersion.title, version: String(record.questionnaireVersion.version), createdAt: record.createdAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) }, actions: <Link href={`/sst/anamneses/${record.id}`}>Abrir</Link> }))} />
    </OperationalListFrame>;
  }
  return <div className="space-y-4 p-4"><h1 className="text-xl font-semibold">Anamnese vinculada ao ASO</h1><Link className="underline" href={`/sst/aso/${id}`}>Voltar ao ASO</Link>
    <Link href={`/sst/aso/${id}/anamnese`}>Voltar ao histórico</Link>
    {canCreate && <><form className="flex flex-wrap gap-2"><input type="hidden" name="view" value="manage" /><input aria-label="Título do questionário" name="q" defaultValue={search.q} placeholder="Buscar questionário" className="rounded border p-2"/><select aria-label="Versão do questionário" name="questionnaireVersionId" defaultValue={selected?.id || ""} className="min-w-0 rounded border p-2"><option value="">Selecione a versão (20 opções por busca)</option>{selected && !versions.some((item) => item.id === selected.id) && <option value={selected.id}>{selected.title} v{selected.version}</option>}{versions.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.title} v{item.version}</option>)}</select><button className="rounded border p-2">Carregar</button></form>{selected && <AnamnesisForm key={selected.id} asoId={id} questionnaireVersionId={selected.id} questions={questionnaireQuestions.parse(selected.questions)} needsReason={total > 0}/>}</>}
  </div>;
}
