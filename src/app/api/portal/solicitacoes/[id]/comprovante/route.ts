import { db } from "@/db/client";
import { getCitizenApiAccount, portalApiError } from "@/lib/portal-cidadao/api-access";
import { readOwnPortalRequest } from "@/lib/portal-cidadao/requests";
import { MUNICIPALITY_INSTITUTION_NAME } from "@/lib/municipality-identity";
import { serviceReportPdf } from "@/lib/portal-cidadao/report";

export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const account = await getCitizenApiAccount(), { id } = await params;
    const own = await readOwnPortalRequest(db, account.id, id);
    const lines = [MUNICIPALITY_INSTITUTION_NAME, "Comprovante de protocolo", own.process.protocolNumber, `Serviço: ${(own.snapshot as { name: string }).name}`, `Recebido em: ${own.createdAt.toLocaleString("pt-BR")}`, `Requerente: ${account.nome}`, `Situação: ${own.status}`, "Este comprovante registra o recebimento do pedido.", "Acompanhe a análise e o resultado em Minha área / Meus pedidos."];
    return new Response(await serviceReportPdf("Comprovante de protocolo", lines), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${own.process.protocolNumber}.pdf"`, "Cache-Control": "private, no-store" } });
  } catch (error) { return portalApiError(error); }
}
