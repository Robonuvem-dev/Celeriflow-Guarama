import { Printer } from "lucide-react";
import { notFound } from "next/navigation";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import CemeteryPrintButton from "@/components/cemeteries/CemeteryPrintButton";

export const dynamic = "force-dynamic";

export default async function CemeteryReceiptPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { prisma } = await getTenantContextForModule("CEMITERIOS");
  const process = await prisma.cemeteryProcess.findUnique({
    where: { receiptCode: code },
    include: { deceased: { include: { cause: true } }, cemetery: true, grave: true, chapel: true },
  });
  if (!process) notFound();
  const funeralHome = process.funeralHomeId ? await prisma.taxFuneralHome.findUnique({ where: { id: process.funeralHomeId }, select: { name: true } }) : null;
  const declarant = await prisma.taxpayer.findUnique({ where: { id: process.declarantTaxpayerId }, include: { person: true, company: true } });
  return <main className="mx-auto max-w-3xl p-6 text-slate-900 print:p-0">
    <div className="mb-4 flex justify-end gap-2 print:hidden"><CemeteryPrintButton /><span className="rounded border px-3 py-2 text-xs"><Printer className="mr-2 inline size-4" />Use Ctrl+P para imprimir ou salvar em PDF</span></div>
    <article className="rounded-xl border-2 border-slate-800 p-8 print:rounded-none">
      <header className="border-b-2 border-slate-800 pb-5 text-center"><p className="text-xs font-bold uppercase tracking-[0.2em]">Cemitérios Municipais</p><h1 className="mt-2 text-2xl font-black">Comprovante de agendamento</h1><p className="mt-2 font-mono text-sm">{process.receiptCode}</p></header>
      <dl className="mt-6 grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2">
        <div><dt className="text-xs font-bold uppercase text-slate-500">Processo</dt><dd>{process.processType} · {process.status}</dd></div>
        <div><dt className="text-xs font-bold uppercase text-slate-500">Tipo de sepultamento</dt><dd>{process.burialType ?? "Não se aplica"}</dd></div>
        <div><dt className="text-xs font-bold uppercase text-slate-500">Falecido</dt><dd>{process.deceased.fullName}</dd></div>
        <div><dt className="text-xs font-bold uppercase text-slate-500">Data do óbito</dt><dd>{process.deceased.deathDate.toLocaleDateString("pt-BR", { timeZone: "UTC" })}</dd></div>
        <div><dt className="text-xs font-bold uppercase text-slate-500">Agendamento</dt><dd>{process.scheduledAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</dd></div>
        <div><dt className="text-xs font-bold uppercase text-slate-500">Realização efetiva</dt><dd>{process.performedAt?.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) ?? "Aguardando realização"}</dd></div>
        <div><dt className="text-xs font-bold uppercase text-slate-500">Declarante</dt><dd>{declarant?.person?.fullName ?? declarant?.company?.corporateName ?? process.declarantTaxpayerId}</dd></div>
        <div><dt className="text-xs font-bold uppercase text-slate-500">Cemitério</dt><dd>{process.cemetery?.name ?? "Não informado"}</dd></div>
        <div><dt className="text-xs font-bold uppercase text-slate-500">Sepultura</dt><dd>{process.grave?.code ?? "Não informada"}</dd></div>
        <div><dt className="text-xs font-bold uppercase text-slate-500">Capela</dt><dd>{process.chapel?.name ?? "Não informada"}</dd></div>
        <div><dt className="text-xs font-bold uppercase text-slate-500">Funerária</dt><dd>{funeralHome?.name ?? "Não informada"}</dd></div>
        <div><dt className="text-xs font-bold uppercase text-slate-500">Causa da morte</dt><dd>{process.deceased.cause?.description ?? process.deceased.causeText ?? "Não informada"}</dd></div>
      </dl>
      <footer className="mt-10 border-t pt-4 text-xs text-slate-500">Emitido pelo CeleriFlow. O código identifica o registro preservado no módulo de Cemitérios.</footer>
    </article>
  </main>;
}
