import { notFound } from "next/navigation";
import { Decimal } from "@/db/decimal";
import { db } from "@/db/client";
import { readCemeteryGuide } from "@/db/repositories/cemeteries/workflow-pages";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import CemeteryPrintButton from "@/components/cemeteries/CemeteryPrintButton";

export default async function CemeteryGuidePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getTenantContextForModule("CEMITERIOS");
  const { event, guide } = await readCemeteryGuide(context.database ?? db, id);
  if (!event) notFound();
  if (!guide) notFound();
  const paid = guide.payments.reduce((sum, p) => sum.plus(p.amountPaidDecimal ?? p.amountPaid), new Decimal(0));
  const total = new Decimal(guide.totalValueDecimal ?? guide.totalValue);
  const money = (v: Decimal) => v.toFixed(2).replace(".", ",");
  return <main className="mx-auto max-w-3xl space-y-6 p-6"><CemeteryPrintButton /><header><h1 className="text-2xl font-bold">Documento de Arrecadação Municipal</h1><p>{guide.guideNumber ?? guide.id} · {guide.status}</p></header><dl className="grid gap-4 sm:grid-cols-2">
    <div><dt className="font-semibold">Contribuinte</dt><dd>{guide.assessment.taxpayer.person?.fullName ?? guide.assessment.taxpayer.company?.corporateName}</dd></div><div><dt className="font-semibold">Tributo</dt><dd>{guide.assessment.tax.name}</dd></div><div><dt className="font-semibold">Lançamento</dt><dd>{guide.assessment.assessmentNumber}</dd></div><div><dt className="font-semibold">Vencimento</dt><dd>{guide.dueDate.toLocaleDateString("pt-BR", { timeZone: "UTC" })}</dd></div><div><dt className="font-semibold">Fato gerador</dt><dd>{event.eventType} · {event.sourceType}: {event.sourceId}</dd></div><div><dt className="font-semibold">Data do fato</dt><dd>{event.occurredAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</dd></div>
  </dl><table className="w-full text-left"><tbody><tr><th className="border p-2">Valor da guia</th><td className="border p-2">R$ {money(total)}</td></tr><tr><th className="border p-2">Pagamentos confirmados</th><td className="border p-2">R$ {money(paid)}</td></tr><tr><th className="border p-2">Saldo</th><td className="border p-2">R$ {money(Decimal.max(0, total.minus(paid)))}</td></tr></tbody></table><p className="text-sm">Reimpressão do documento registrado na Tributação. Pagamento e baixa seguem as integrações bancárias e permissões tributárias configuradas; não é gerado código bancário fictício.</p></main>;
}
