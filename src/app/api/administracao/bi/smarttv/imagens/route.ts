import sharp from "sharp";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { assertDisplayAccess, saveDisplayImage } from "@/lib/bi/display-service";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const context = await getTenantContextForModule("ADMINISTRACAO");
    assertDisplayAccess(context, "update");
    // Next's development server can normalize request.url to localhost even
    // when the browser uses the application's app.localhost virtual host.
    const requestUrl = new URL(request.url);
    const expectedOrigin = `${requestUrl.protocol}//${request.headers.get("host") || requestUrl.host}`;
    if (request.headers.get("origin") !== expectedOrigin) return Response.json({ error: "Origem inválida." }, { status: 403 });
    const reader = request.body?.getReader();
    if (!reader) return Response.json({ error: "Selecione uma imagem." }, { status: 400 });
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 8 * 1024 * 1024) { await reader.cancel(); return Response.json({ error: "A imagem deve ter até 8 MiB." }, { status: 413 }); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const bytes = Buffer.concat(chunks);
    const metadata = await sharp(bytes, { limitInputPixels: 16_000_000 }).metadata();
    if (!["png", "jpeg", "webp"].includes(metadata.format ?? "") || (metadata.pages ?? 1) > 1) return Response.json({ error: "Use uma imagem estática PNG, JPG ou WebP." }, { status: 400 });
    const normalized = await sharp(bytes, { limitInputPixels: 16_000_000 }).rotate().resize({ width: 2560, height: 1440, fit: "inside", withoutEnlargement: true }).webp({ quality: 86 }).toBuffer();
    if (normalized.length > 2 * 1024 * 1024) return Response.json({ error: "Reduza os detalhes da imagem; o resultado deve ter até 2 MiB." }, { status: 400 });
    const name = decodeURIComponent(request.headers.get("x-file-name") ?? "Imagem institucional");
    return Response.json({ asset: await saveDisplayImage(context, normalized, name) });
  } catch {
    return Response.json({ error: "Não foi possível enviar a imagem. Confira o formato, os limites e sua permissão." }, { status: 400 });
  }
}
