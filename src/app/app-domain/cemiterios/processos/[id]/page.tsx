import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { WorkflowAdvance, WorkflowReceiptPrint } from "@/components/cemeteries/WorkflowForms";
import { CemeteryAttachments } from "@/components/cemeteries/CemeteryAttachments";

export const dynamic = "force-dynamic";
export default async function CemeteryProcessPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const { prisma } = await getTenantContextForModule("CEMITERIOS");
  const process = await prisma.cemeteryProcess.findUnique({ where: { id }, include: { deceased: { include: { cause: true, funeralHome: true } }, cemetery: true, grave: true, chapel: true } });
  if (!process) notFound();
  const debt = process.declarantDebtSnapshot as { total?: string; hasDebt?: boolean; checkedAt?: string };
  const groups = process.deceased.groups as Record<string, unknown>;
  const metadata = groups._workflow as { burialType?: string; exceptionReason?: string; memberOwnerDeceased?: boolean } | undefined;
  const [declarant, funeralHome, linked] = await Promise.all([
    prisma.taxpayer.findUnique({ where: { id: process.declarantTaxpayerId }, include: { person: true, company: true } }),
    process.funeralHomeId ? prisma.taxFuneralHome.findUnique({ where: { id: process.funeralHomeId } }) : null,
    process.deceased.deceasedTaxpayerId ? prisma.taxpayer.findUnique({ where: { id: process.deceased.deceasedTaxpayerId }, include: { person: true } }) : null,
  ]);
  const civilDate = (date: Date) => date.toLocaleDateString("pt-BR", { timeZone: "UTC" });
  const ceremonyDate = (date: Date) => date.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  return <main className="grid gap-4 p-6">
    <Link href="/cemiterios/processos">← Processos funerários</Link>
    <header><h1 className="text-2xl font-bold">Recibo {process.receiptCode}</h1><p>{process.processType} · {process.burialType} · {process.status}</p></header>
    <section className="rounded border bg-white p-4">
      <h2 className="font-semibold">{process.deceased.fullName}</h2>
      <p>Óbito: {civilDate(process.deceased.deathDate)} · Agendado: {ceremonyDate(process.scheduledAt)}</p>
      <p>Realizado: {process.performedAt ? ceremonyDate(process.performedAt) : "Pendente"}</p>
      <p>{process.cemetery?.name} · Sepultura {process.grave?.code || "—"} · Capela {process.chapel?.name || "—"}</p>
      <p>Funerária: {funeralHome?.name || "—"} · Causa: {process.deceased.cause?.description || "—"}</p>
      <p>Médico: {process.deceased.doctorName} · CRM {process.deceased.doctorCrm}</p>
      <p>Declarante: {declarant?.person?.fullName || declarant?.company?.corporateName || process.declarantTaxpayerId}</p>
      <p>Consulta de débitos: {debt.checkedAt} · R$ {debt.total || "0.00"} · {debt.hasDebt ? "Com débitos" : "Sem débitos"}</p>
      {metadata?.exceptionReason && <p>Exceção registrada: {metadata.exceptionReason}</p>}
      {metadata?.burialType === "MEMBRO" && <p>Sepultamento de membro · {metadata.memberOwnerDeceased ? "Proprietário também falecido" : "Proprietário vivo — sem aplicação de óbito/espólio"}</p>}
      {linked?.person && <p>Cadastro Único atual: {linked.person.fullName} · Óbito cadastrado: {linked.person.deathDate ? civilDate(linked.person.deathDate) : "Não registrado"} · Espólio: {linked.person.estateApplied ? "Sim" : "Não"}</p>}
      <p>{process.notes}</p>
    </section>
    <WorkflowAdvance id={id} type={process.processType} status={process.status} />
    <section className="grid gap-2"><h2 className="font-semibold">Declaração de óbito — onze grupos</h2>{Object.entries(groups).filter(([name]) => !name.startsWith("_")).map(([name, value]) => <details key={name}><summary>{name}</summary><pre className="whitespace-pre-wrap rounded border p-2">{JSON.stringify(value, null, 2)}</pre></details>)}</section>
    <CemeteryAttachments targetType={process.processType as "SEPULTAMENTO" | "VELORIO" | "CREMACAO"} targetId={id} /><WorkflowReceiptPrint />
  </main>;
}
