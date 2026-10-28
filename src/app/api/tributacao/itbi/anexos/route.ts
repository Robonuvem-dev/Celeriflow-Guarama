import { revalidatePath } from "next/cache";
import { isSystemAdministrator } from "@/lib/platform/tenant-context";
import { taxActionContext } from "@/db/repositories/tax-actions/context";
import { isSameOriginRequest } from "@/lib/transparencia/request-origin";
import { checkRateLimit } from "@/lib/platform/rate-limit";
import { registerInternalItbiUpload, itbiUploadLimit } from "@/lib/tributacao/itbi-portal-storage";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    if (!isSameOriginRequest(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
    const { connection, user } = await taxActionContext("create");
    if (!checkRateLimit(`itbi-internal-upload:${user.id}`).allowed) return Response.json({ error: "Aguarde antes de enviar novamente." }, { status: 429 });
    const length = request.headers.get("content-length");
    if (length && Number(length) > itbiUploadLimit + 65536) return Response.json({ error: "O anexo deve ter no máximo 10 MB." }, { status: 413 });
    const form = await request.formData(); const file = form.get("file"); const declarationId = form.get("declarationId");
    if (!(file instanceof File) || typeof declarationId !== "string" || !declarationId) throw new Error("Informe o processo e o arquivo.");
    const result = await registerInternalItbiUpload(connection, { usuarioId: user.id, employeeId: user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds }, declarationId, file);
    revalidatePath("/tributacao/itbi/comunicacao"); revalidatePath("/portal/tributario/itbi");
    return Response.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Não foi possível anexar o arquivo." }, { status: 400, headers: { "Cache-Control": "private, no-store" } }); }
}
