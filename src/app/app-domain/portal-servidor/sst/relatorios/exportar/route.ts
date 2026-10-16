import { getEmployeePortalAccess } from "@/lib/portal-servidor/access";
import { emitClosureDocument } from "@/lib/sst/closure-document";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const access = await getEmployeePortalAccess();
  if (access.status !== "AVAILABLE") return Response.json({ error: "Vínculo autenticado indisponível." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  try {
    const params = new URL(request.url).searchParams;
    const result = await emitClosureDocument(access.context, "PPP", { budgetUnitId: params.get("budgetUnitId") || "", from: params.get("from") || "", until: params.get("until") || "" }, true);
    return new Response(new Uint8Array(result.pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="meu-historico-ppp-${result.id}.pdf"`, "Cache-Control": "private, no-store" } });
  } catch { return Response.json({ error: "Histórico próprio indisponível para emissão. Confira as datas e o limite de 5.000 registros." }, { status: 400, headers: { "Cache-Control": "no-store" } }); }
}
