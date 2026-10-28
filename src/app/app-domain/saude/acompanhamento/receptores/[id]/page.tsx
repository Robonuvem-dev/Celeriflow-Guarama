import Link from "next/link";
import { db } from "@/db/client";
import { assertHealthUnitAccess, getTenantContextForModule } from "@/lib/platform/tenant-context";
import { followupPresentation } from "@/lib/saude/followup-presentation";
import { and, asc, count, desc, eq, getTableColumns, ilike } from "drizzle-orm";
import { healthFollowupReceivers as receivers, healthFollowupBindings as bindings, healthFollowupRecords as received, healthFollowupBatches as batches, healthFollowupReceipts as receipts } from "@/db/schema/health-followup";
import { healthUnits } from "@/db/schema/health-workforce";
import { patients } from "@/db/schema/health-registration";
import { people } from "@/db/schema/people";

export default async function FollowupReceiverPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string; page?: string }> }) {
  const context = await getTenantContextForModule("SAUDE"), id = decodeURIComponent((await params).id), query = await searchParams;
  const database = context.database ?? db;
  const [receiver] = await database.select({ ...getTableColumns(receivers), unit: { name: healthUnits.name }, binding: { id: bindings.id, connectionId: bindings.connectionId } }).from(receivers).innerJoin(healthUnits, eq(healthUnits.id, receivers.unitId)).leftJoin(bindings, eq(bindings.receiverId, receivers.id)).where(eq(receivers.id, id)).limit(1);
  if (!receiver) throw new Error("Receptor não encontrado.");
  assertHealthUnitAccess(context.user, receiver.unitId);
  const q = typeof query.q === "string" ? query.q.trim().slice(0, 120) : "";
  const where = and(eq(received.receiverId, id), q ? ilike(people.fullName, `%${q}%`) : undefined);
  const [{ total }] = await database.select({ total: count() }).from(received).innerJoin(patients, eq(patients.id, received.patientId)).innerJoin(people, eq(people.id, patients.personId)).where(where);
  const page = Math.min(Math.max(1, /^\d+$/.test(query.page || "") ? Number(query.page) : 1), Math.max(1, Math.ceil(total / 30)));
  const rows = await database.select({ record: received, patientStatus: patients.status, fullName: people.fullName, batchId: batches.id, receipt: { protocol: receipts.protocol } }).from(received).innerJoin(patients, eq(patients.id, received.patientId)).innerJoin(people, eq(people.id, patients.personId)).innerJoin(batches, eq(batches.id, received.lastBatchId)).leftJoin(receipts, eq(receipts.batchId, batches.id)).where(where).orderBy(desc(received.lastReceivedAt), asc(received.id)).offset((page - 1) * 30).limit(30);
  const records = rows.map(row => ({ ...row.record, patient: { status: row.patientStatus, person: { fullName: row.fullName } }, lastBatch: { id: row.batchId, receipt: row.receipt } }));
  const pageUrl = (value: number) => `/saude/acompanhamento/receptores/${encodeURIComponent(id)}?${new URLSearchParams({ q, page: String(value) })}`;
  return <main className="space-y-4 p-4"><header><Link href={receiver.binding ? `/saude/acompanhamento?binding=${encodeURIComponent(receiver.binding.id)}` : "/saude/acompanhamento"} className="text-sm underline">Remessas de acompanhamento</Link><h1 className="text-xl font-semibold">{receiver.name}</h1><p className="text-sm">{receiver.unit.name} · {receiver.code} · {receiver.contractName} · {receiver.schemaVersion}</p></header><form className="flex gap-2 text-sm"><input name="q" defaultValue={q} placeholder="Nome atual do paciente" className="w-full rounded border p-2"/><button className="shrink-0 rounded border p-2">Pesquisar recebidos</button></form><p className="text-sm">{total} origens acompanhadas · página {page}</p>{records.map(record => {
    const info = followupPresentation(record.originType, record.payload);
    return <article key={record.id} className="space-y-2 rounded border bg-white p-3 text-sm"><h2 className="font-semibold">{record.patient.person.fullName} · cadastro {record.patient.status}</h2><p>Último retrato recebido: {info.patientName || "Nome não informado na origem"} · {info.summary}</p><p>Profissional da origem: {info.professionalName || "Não informado"}</p><p>Alteração da origem {record.sourceUpdatedAt.toLocaleString("pt-BR")} · retrato {record.snapshotAt.toLocaleString("pt-BR")} · recebimento {record.lastReceivedAt.toLocaleString("pt-BR")}</p><p className="break-all text-xs">{record.originType}:{record.originId} · versão {record.sourceVersion}</p><nav className="flex flex-wrap gap-4"><Link className="underline" href={`/saude/acompanhamento/remessas/${encodeURIComponent(record.lastBatchId)}`}>Remessa de referência · {record.lastBatch.receipt?.protocol || record.lastBatch.id}</Link>{info.sourceHref && <Link className="underline" href={info.sourceHref}>{info.sourceLabel}</Link>}</nav><details><summary className="cursor-pointer">Conteúdo recebido do acompanhamento</summary><pre className="overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(record.payload, null, 2)}</pre></details></article>;
  })}<nav className="flex gap-4 text-sm">{page > 1 && <Link className="underline" href={pageUrl(page - 1)}>Anterior</Link>}{page * 30 < total && <Link className="underline" href={pageUrl(page + 1)}>Próxima</Link>}</nav></main>;
}
