import { notFound } from "next/navigation";
import Link from "next/link";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { resolveConstructionAccess } from "@/lib/obras/construction-access";
import { constructionCaseWhere } from "@/lib/obras/construction-policy";
import { confirmedConstructionBalance } from "@/lib/obras/construction-tax-engine";
import ConstructionDemonstrationBarcode from "@/components/construction/ConstructionDemonstrationBarcode";

export default async function ConstructionGuidePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getTenantContextForModule("OBRAS");
  const access = await resolveConstructionAccess(context);
  const fee = await context.prisma.constructionFee.findFirst({ where: { case: constructionCaseWhere(access), assessment: { guides: { some: { id } } } }, include: { case: { include: { process: true } }, rule: true, assessment: { include: { taxpayer: { include: { person: true, company: true } }, realEstate: true, guides: { where: { id }, include: { payments: { where: { status: "Confirmado" } } } } } } } });
  const guide = fee?.assessment?.guides[0];
  if (!fee?.assessment || !guide) notFound();
  const snapshot = guide.calculationSnapshot as Record<string, unknown> | null;
  const barcode = snapshot?.demonstrationBarcode as { line?: string; label?: string } | undefined;
  return <main className="mx-auto max-w-3xl space-y-4 p-8 print:p-0">
    <Link className="underline print:hidden" href={`/obras/construcao-civil/taxas?caseId=${fee.caseId}`}>Voltar às taxas e débitos</Link>
    <h1 className="text-2xl font-bold">Guia municipal — Construção Civil</h1>
    {barcode && <p className="border-2 p-3 font-bold">{barcode.label}</p>}
    <dl className="space-y-2"><dt>Guia</dt><dd>{guide.guideNumber} — {guide.status}</dd><dt>Processo</dt><dd>{fee.case.process.protocolNumber}</dd><dt>Contribuinte</dt><dd>{fee.assessment.taxpayer.person?.fullName || fee.assessment.taxpayer.company?.corporateName} • {fee.assessment.taxpayer.person?.cpf || fee.assessment.taxpayer.company?.cnpj}</dd><dt>Imóvel</dt><dd>{fee.assessment.realEstate?.municipalInsc} • {fee.assessment.realEstate?.streetName}</dd><dt>Vencimento</dt><dd>{guide.dueDate.toISOString().slice(0, 10)}</dd><dt>Valor / saldo</dt><dd>R$ {fee.amount.toFixed(2)} / R$ {confirmedConstructionBalance(guide.totalValueDecimal ?? guide.totalValue, guide.payments).toFixed(2)}</dd></dl>
    <h2 className="font-semibold">Memória de cálculo preservada</h2><pre className="whitespace-pre-wrap rounded border p-3 text-xs">{JSON.stringify(fee.calculationSnapshot, null, 2)}</pre>
    <p>{String((fee.calculationSnapshot as Record<string, unknown>).guideInstructions || "")}</p>
    {barcode?.line && <div><h2 className="font-semibold">Código demonstrativo FEBRABAN</h2>{guide.barcode && <ConstructionDemonstrationBarcode value={guide.barcode} />}<p className="break-all font-mono">{barcode.line}</p><p className="text-xs">O código acima utiliza entidade 0000; não representa convênio bancário homologado.</p></div>}
    <p className="print:hidden">Utilize a impressão do navegador para gerar PDF. Baixa e conciliação: <Link className="underline" href="/tributacao/guias">Tributação / Guias</Link>.</p>
  </main>;
}
