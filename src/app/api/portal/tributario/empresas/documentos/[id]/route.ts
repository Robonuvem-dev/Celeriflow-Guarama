import { prisma } from "@/lib/prisma";
import { getCitizenApiAccount, portalApiError } from "@/lib/portal-cidadao/api-access";
import { renderPortalEconomicDocument } from "@/lib/tributacao/portal-economic-documents";

export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const account = await getCitizenApiAccount(); const { id } = await params;
    const bytes = await renderPortalEconomicDocument(prisma, account.id, id);
    return new Response(bytes, { headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="documento-cadastral-empresa.pdf"', "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return portalApiError(error); }
}
