import { db } from "@/db/client";
import { portalGuide } from "@/db/repositories/portal-content/taxpayer";
import { getCitizenApiAccount, portalApiError } from "@/lib/portal-cidadao/api-access";
import { authorizedTaxpayerIds } from "@/lib/portal-cidadao/tax-account";
import { AccessError } from "@/lib/platform/tenant-context";
import { serviceReportPdf } from "@/lib/portal-cidadao/report";

export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const account = await getCitizenApiAccount(), { id } = await params;
    const damIds = await authorizedTaxpayerIds(db, account.id, "DAM"), itbiIds = await authorizedTaxpayerIds(db, account.id, "ITBI"), nfseIds = await authorizedTaxpayerIds(db, account.id, "NFSE");
    const guide = await portalGuide(db, id, damIds, itbiIds, nfseIds);
    if (!guide || !guide.totalValueDecimal) throw new AccessError("Guia indisponível ao titular ou valor não conciliado.", 404);
    const lines = [`Guia: ${guide.guideNumber || "Sem numeração"}`, `Tributo: ${guide.assessment.tax.name}`, `Lançamento: ${guide.assessment.assessmentNumber || "Sem numeração"}`, `Valor: R$ ${guide.totalValueDecimal.toFixed(2)}`, `Vencimento: ${guide.dueDate.toLocaleDateString("pt-BR")}`, `Situação: ${guide.status}`, guide.barcode ? `Código bancário: ${guide.barcode}` : "Código bancário não disponibilizado. Consulte a arrecadação para pagamento.", "Este documento reproduz a guia registrada. Não confirma pagamento nem substitui convênio bancário/PIX/cartão pendente."];
    return new Response(await serviceReportPdf("Consulta de guia de arrecadação", lines), { headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="guia-arrecadacao.pdf"', "Cache-Control": "private, no-store" } });
  } catch (error) { return portalApiError(error); }
}
