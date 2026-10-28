import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { resolveConstructionAccess } from "@/lib/obras/construction-access";
import { enforcementActLabels, enforcementServiceLabels } from "@/lib/obras/construction-enforcement-policy";
import { db } from "@/db/client";
import { findPageEnforcementPrint } from "@/db/repositories/works-pages/enforcement";
import { pageEmployeeNames } from "@/db/repositories/works-pages/shared";
import { EnforcementPrintButton } from "../../../EnforcementPrintButton";

const date = (value: Date) => value.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
export default async function ConstructionEnforcementActPrint({ params }: { params: Promise<{ id: string; actId: string }> }) {
  const { id, actId } = await params;
  const context = await getTenantContextForModule("OBRAS");
  const access = await resolveConstructionAccess(context);
  const database = context.database ?? db;
  const item = await findPageEnforcementPrint(database, access, id, actId);
  const act = item?.acts[0];
  if (!item || !act) notFound();
  const fiscal = (await pageEmployeeNames(database, [act.employeeId]))[0] ?? null;
  const property = item.cadastralSnapshot as Record<string, unknown>;
  const title = enforcementActLabels[act.kind as keyof typeof enforcementActLabels];
  return <main className="mx-auto max-w-3xl space-y-4 p-6 text-sm"><div className="flex items-center justify-between print:hidden"><Link href={`/obras/construcao-civil/fiscalizacao/${id}`} className="text-blue-700 underline">Voltar à fiscalização</Link><EnforcementPrintButton /></div>
    <header className="border-b pb-4"><p className="font-bold text-amber-800">DEMONSTRATIVO — SEM VALIDADE COMO MODELO LEGAL OFICIAL</p><h1 className="mt-2 text-xl font-semibold">{title}</h1><p>{act.number}</p><p>Processo central: {item.process.protocolNumber}</p></header>
    <section className="space-y-2"><p>Imóvel cadastral: {String(property.municipalInsc || item.realEstateId)} • Matrícula: {String(property.registration || "Não informada")}</p><p>Endereço registrado na abertura: {String(property.streetName || "Não informado")}, {String(property.number || "s/n")}</p><p>Localização: {item.locationType === "RURAL" ? "Rural" : "Urbana"} • Situação de alvará na abertura: {item.permitStatus === "WITHOUT_PERMIT" ? "SEM ALVARÁ" : item.permitStatus === "UNKNOWN" ? "Não verificada" : "Alvará informado, sujeito à conferência"}</p><p>Emissão: {date(act.issuedAt)} • Prazo: {act.deadlineAt ? date(act.deadlineAt) : "Não fixado"}</p><p>Fiscal: {fiscal?.name || act.employeeId} • Autor do registro: {act.createdBy} • Setor: {act.departmentId}</p>{act.relatedAct && <p>Ato relacionado: {act.relatedAct.number}</p>}</section>
    <section><h2 className="font-semibold">Motivo / determinação</h2><p className="whitespace-pre-wrap">{act.reason}</p></section><section><h2 className="font-semibold">Fundamento informado pelo autor</h2><p className="whitespace-pre-wrap">{act.legalBasis}</p></section>
    <section className="space-y-2"><h2 className="font-semibold">Evidências GED fixadas no momento do registro</h2>{act.evidence.map((entry) => { const snapshot = entry.versionSnapshot as Record<string, unknown>; return <p key={entry.id} className="break-all text-xs">{String(snapshot.title || entry.documentId)} • Versão {String(snapshot.versionNumber)} • SHA-256: {String(snapshot.hashSha256)}</p>; })}{!act.evidence.length && <p className="text-xs">Sem documento GED associado ao ato.</p>}</section>
    <section className="space-y-2"><h2 className="font-semibold">Ciência</h2>{act.acknowledgements.map((ack) => <article key={ack.id} className="space-y-1 rounded border p-3"><p>{date(ack.acknowledgedAt)} • {enforcementServiceLabels[ack.method as keyof typeof enforcementServiceLabels]} • {ack.recipient}</p><p className="whitespace-pre-wrap">{ack.notes}</p><p className="text-xs">Autor: {ack.createdBy}</p>{ack.evidence.map((entry) => { const snapshot = entry.versionSnapshot as Record<string, unknown>; return <p key={entry.id} className="break-all text-xs">Comprovante: {String(snapshot.title)} • SHA-256: {String(snapshot.hashSha256)}</p>; })}</article>)}{!act.acknowledgements.length && <p>Ciência ainda não registrada.</p>}</section>
    <footer className="border-t pt-3 text-xs">Este espelho reproduz o registro demonstrativo de fiscalização edilícia/posturas. Não presume legislação, valores de multa, cobrança de ISS, assinatura digital ou comunicação efetiva ao destinatário.</footer>
  </main>;
}
