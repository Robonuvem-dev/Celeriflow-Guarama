import { databaseConnection } from "@/db/client";
import { getCitizenApiAccount, portalApiError } from "@/lib/portal-cidadao/api-access";
import { downloadItbiProcessAttachment } from "@/lib/tributacao/itbi-portal-storage";

export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const account = await getCitizenApiAccount(); const { id } = await params; return await downloadItbiProcessAttachment(databaseConnection, { usuarioId: account.id }, new URL(request.url).searchParams.get("declarationId") ?? "", id); }
  catch (error) { return portalApiError(error); }
}
