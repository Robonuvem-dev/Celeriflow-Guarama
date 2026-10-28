import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { getAdministrationBi } from "@/lib/administration/bi-service";
import { exportAdministrationBi } from "@/lib/administration/bi-export";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const context = await getTenantContextForModule("ADMINISTRACAO");
  const params = new URL(request.url).searchParams;
  const format = params.get("format");
  if (format !== "xlsx" && format !== "csv" && format !== "powerbi") return Response.json({ error: "Formato inválido." }, { status: 400 });
  const secretariatId = params.get("secretariatId") || "";
  if (secretariatId && !await context.prisma.secretariat.findUnique({ where: { id: secretariatId }, select: { id: true } })) return Response.json({ error: "Secretaria não encontrada." }, { status: 404 });
  const data = await getAdministrationBi(context, secretariatId);
  const file = await exportAdministrationBi(data, format);
  return new Response(new Uint8Array(file.body).buffer, { headers: { "Content-Type": file.contentType, "Content-Disposition": `attachment; filename="indicadores-${secretariatId ? "secretaria" : "prefeitura"}-${data.capturedAt.slice(0, 10)}.${file.extension}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
