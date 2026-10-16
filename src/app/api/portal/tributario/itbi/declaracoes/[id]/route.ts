import { prisma } from "@/lib/prisma";
import { getCitizenApiAccount, portalApiError } from "@/lib/portal-cidadao/api-access";
import { renderConfiguredItbiDocument } from "@/lib/tributacao/itbi-document-models";

export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const account = await getCitizenApiAccount(); const { id } = await params;
    const bytes = await renderConfiguredItbiDocument(prisma, { usuarioId: account.id }, id);
    return new Response(bytes, { headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="declaracao-itbi.pdf"', "Cache-Control": "private, no-store" } });
  } catch (error) { return portalApiError(error); }
}
